-- LittlePass: studio dashboard upgrade
-- Run ONCE in Supabase > SQL Editor (after schema.sql and 002_plan_fix.sql).
-- Adds: class time slots with per-slot prices, a price -> credits algorithm,
-- booking snapshots (who/what/when/price), and studio payouts.

-- ========== 1. PRICING ALGORITHM (you control these numbers) ==========
-- credits = ceil( studio_price / (credit_value * (1 - margin)) ), clamped to 1..max_credits
-- Edit the single row in Table Editor > pricing_settings; all slots recalculate automatically.

create table public.pricing_settings (
  id int primary key default 1 check (id = 1),
  credit_value_cents int not null default 350 check (credit_value_cents > 0),   -- what 1 credit is worth to you (retail)
  margin_pct numeric not null default 25 check (margin_pct >= 0 and margin_pct < 90), -- your cut, in percent
  max_credits int not null default 30
);
insert into public.pricing_settings default values;
alter table public.pricing_settings enable row level security;  -- no policies: nobody can read it from the app

create function public.calc_credits(p_price_cents int) returns int
language sql stable security definer set search_path = public as $$
  select greatest(1, least(s.max_credits,
    ceil(p_price_cents / (s.credit_value_cents * (1 - s.margin_pct / 100.0)))::int))
  from public.pricing_settings s where s.id = 1
$$;

-- Lets studios see the credit price for a dollar price, without revealing your margin
create function public.preview_credits(p_price_cents int) returns int
language sql stable security definer set search_path = public as $$
  select public.calc_credits(p_price_cents)
$$;
grant execute on function public.preview_credits(int) to authenticated;

-- ========== 2. CLASS SLOTS ==========

create table public.class_slots (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  dow int not null check (dow between 0 and 6),          -- 0 = Sunday
  start_time time not null,
  mins int not null default 45 check (mins between 15 and 180),
  capacity int not null default 8 check (capacity between 1 and 50),
  price_cents int not null check (price_cents between 0 and 50000),  -- what the studio charges LittlePass per booking
  credits int not null default 1,                         -- always set by the trigger below
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create function public.slot_set_credits() returns trigger
language plpgsql as $$
begin
  new.credits := public.calc_credits(new.price_cents);
  return new;
end $$;
create trigger slot_credits before insert or update on public.class_slots
  for each row execute function public.slot_set_credits();

-- Existing classes become slots (sample price = about $2.60 per old credit)
insert into public.class_slots (class_id, dow, start_time, mins, capacity, price_cents)
select c.id, d, to_timestamp(c.start_time, 'HH12:MI AM')::time, c.mins, c.capacity, c.credits * 260
from public.classes c cross join lateral unnest(c.days) as d;

-- When settings change, recalculate every slot
create function public.recalc_all_slots() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.class_slots set price_cents = price_cents;
  return null;
end $$;
create trigger settings_changed after update on public.pricing_settings
  for each statement execute function public.recalc_all_slots();

-- ========== 3. PAYOUTS ==========

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount_cents int not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,
  reference text,
  created_at timestamptz not null default now()
);

-- ========== 4. BOOKINGS: snapshots so history survives edits ==========

alter table public.bookings
  add column slot_id uuid references public.class_slots(id) on delete set null,
  add column studio_id uuid references public.studios(id) on delete cascade,
  add column class_title text,
  add column session_time time,
  add column price_cents int,
  add column parent_name text,
  add column attendee_name text,
  add column payout_id uuid references public.payouts(id) on delete set null;

update public.bookings b set
  slot_id = s.id, studio_id = c.studio_id, class_title = c.title, session_time = s.start_time,
  price_cents = b.credits * 260,
  parent_name = coalesce(p.display_name, 'Parent'), attendee_name = coalesce(p.display_name, 'Parent')
from public.classes c, public.profiles p, public.class_slots s
where c.id = b.class_id and p.id = b.user_id and s.class_id = b.class_id
  and s.dow = extract(dow from b.session_date)::int;

delete from public.bookings where studio_id is null;   -- only un-matchable test rows

alter table public.bookings
  alter column studio_id set not null, alter column class_title set not null,
  alter column session_time set not null, alter column price_cents set not null,
  alter column parent_name set not null, alter column attendee_name set not null,
  alter column class_id drop not null;

alter table public.bookings drop constraint if exists bookings_user_id_class_id_session_date_key;
alter table public.bookings drop constraint if exists bookings_class_id_fkey;
alter table public.bookings add constraint bookings_class_id_fkey
  foreign key (class_id) references public.classes(id) on delete set null;
alter table public.bookings add constraint bookings_one_per_slot unique (user_id, slot_id, session_date);

-- Old class columns now live on the slots
alter table public.classes drop column days, drop column start_time, drop column mins,
  drop column capacity, drop column credits;

-- ========== 5. FUNCTIONS ==========

create function public.la_today() returns date language sql stable as $$
  select (now() at time zone 'America/Los_Angeles')::date
$$;

drop function if exists public.book_class(uuid, date);
drop function if exists public.booked_counts(date, date);

create function public.book_class(p_slot uuid, p_date date, p_attendee text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s public.class_slots; c public.classes; pr public.profiles; taken int; who text;
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  select * into pr from public.profiles where id = auth.uid();
  if pr.role <> 'parent' then raise exception 'Only parent accounts can book classes'; end if;
  select * into s from public.class_slots where id = p_slot and active;
  if not found then raise exception 'This class time is no longer available'; end if;
  select * into c from public.classes where id = s.class_id;
  if extract(dow from p_date)::int <> s.dow then raise exception 'No class on that day'; end if;
  if p_date < public.la_today() or p_date > public.la_today() + 14 then raise exception 'Date out of range'; end if;
  if p_date = public.la_today() and s.start_time <= (now() at time zone 'America/Los_Angeles')::time then
    raise exception 'This class has already started';
  end if;
  if exists (select 1 from public.bookings where user_id = auth.uid() and slot_id = p_slot and session_date = p_date) then
    raise exception 'You already booked this class';
  end if;
  select count(*) into taken from public.bookings where slot_id = p_slot and session_date = p_date;
  if taken >= s.capacity then raise exception 'This class is full'; end if;
  update public.profiles set credits = credits - s.credits where id = auth.uid() and credits >= s.credits;
  if not found then raise exception 'Not enough credits'; end if;
  who := coalesce(nullif(trim(p_attendee), ''), pr.display_name, 'Parent');
  insert into public.bookings (user_id, class_id, slot_id, studio_id, class_title, session_date, session_time,
                               credits, price_cents, parent_name, attendee_name)
  values (auth.uid(), c.id, s.id, c.studio_id, c.title, p_date, s.start_time,
          s.credits, s.price_cents, coalesce(pr.display_name, 'Parent'), left(who, 60));
end $$;

create or replace function public.cancel_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking and user_id = auth.uid();
  if not found then raise exception 'Booking not found'; end if;
  if b.session_date < public.la_today()
     or (b.session_date = public.la_today() and b.session_time <= (now() at time zone 'America/Los_Angeles')::time) then
    raise exception 'This class has already happened';
  end if;
  delete from public.bookings where id = b.id;
  update public.profiles set credits = credits + b.credits where id = auth.uid();
end $$;

create function public.booked_counts(p_from date, p_to date)
returns table (slot_id uuid, session_date date, taken bigint)
language sql security definer set search_path = public stable as $$
  select slot_id, session_date, count(*) from public.bookings
  where slot_id is not null and session_date between p_from and p_to group by 1, 2
$$;
grant execute on function public.book_class(uuid, date, text) to authenticated;
grant execute on function public.booked_counts(date, date) to anon, authenticated;

-- Deleting a slot (or its class) refunds and removes upcoming bookings; past ones stay for earnings history
create function public.on_slot_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  for b in select * from public.bookings where slot_id = old.id and session_date >= public.la_today() loop
    update public.profiles set credits = credits + b.credits where id = b.user_id;
    delete from public.bookings where id = b.id;
  end loop;
  return old;
end $$;
create trigger slot_before_delete before delete on public.class_slots
  for each row execute function public.on_slot_delete();

-- ========== 6. SECURITY RULES ==========

alter table public.class_slots enable row level security;
alter table public.payouts enable row level security;

create policy "slots read" on public.class_slots for select using (
  active or exists (select 1 from public.classes c join public.studios s on s.id = c.studio_id
                    where c.id = class_id and s.owner_id = auth.uid()));
create policy "slots owner insert" on public.class_slots for insert with check (
  exists (select 1 from public.classes c join public.studios s on s.id = c.studio_id
          where c.id = class_id and s.owner_id = auth.uid()));
create policy "slots owner update" on public.class_slots for update using (
  exists (select 1 from public.classes c join public.studios s on s.id = c.studio_id
          where c.id = class_id and s.owner_id = auth.uid()))
  with check (
  exists (select 1 from public.classes c join public.studios s on s.id = c.studio_id
          where c.id = class_id and s.owner_id = auth.uid()));
create policy "slots owner delete" on public.class_slots for delete using (
  exists (select 1 from public.classes c join public.studios s on s.id = c.studio_id
          where c.id = class_id and s.owner_id = auth.uid()));

drop policy if exists "studio sees its bookings" on public.bookings;
create policy "studio sees its bookings" on public.bookings for select using (
  exists (select 1 from public.studios s where s.id = studio_id and s.owner_id = auth.uid()));

create policy "studio sees its payouts" on public.payouts for select using (
  exists (select 1 from public.studios s where s.id = studio_id and s.owner_id = auth.uid()));

-- ========== 7. PAYOUT TOOLS (for you only: run from the SQL Editor) ==========
--   select create_payout('<studio id>', '2026-09-30');           -- bundles completed, unpaid bookings up to that date
--   select mark_payout_paid('<payout id>', 'Zelle 10/2');         -- after you actually send the money

create function public.create_payout(p_studio uuid, p_through date) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; total int; first_d date;
begin
  if p_through >= public.la_today() then
    raise exception 'Only completed classes can be paid out. Pick an earlier date.';
  end if;
  select coalesce(sum(price_cents), 0), min(session_date) into total, first_d
  from public.bookings where studio_id = p_studio and payout_id is null and session_date <= p_through;
  if total = 0 then raise exception 'Nothing to pay out'; end if;
  insert into public.payouts (studio_id, period_start, period_end, amount_cents)
  values (p_studio, first_d, p_through, total) returning id into pid;
  update public.bookings set payout_id = pid
  where studio_id = p_studio and payout_id is null and session_date <= p_through;
  return pid;
end $$;

create function public.mark_payout_paid(p_payout uuid, p_reference text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.payouts set status = 'paid', paid_at = now(), reference = p_reference
  where id = p_payout and status = 'pending';
  if not found then raise exception 'Payout not found or already paid'; end if;
end $$;

revoke execute on function public.create_payout(uuid, date) from public, anon, authenticated;
revoke execute on function public.mark_payout_paid(uuid, text) from public, anon, authenticated;
