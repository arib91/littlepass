-- LittlePass: book several kids at once, waitlist for full classes, day-before reminder emails
-- Run in Supabase > SQL Editor (after 019). Safe to run again.

-- ========== 1. Siblings: one booking per child, not per family ==========
alter table public.bookings add column if not exists source text not null default 'direct';   -- 'direct' or 'waitlist'
alter table public.bookings add column if not exists reminded_at timestamptz;
alter table public.bookings drop constraint if exists bookings_one_per_slot;
alter table public.bookings drop constraint if exists bookings_one_per_child;
alter table public.bookings add constraint bookings_one_per_child unique (user_id, slot_id, session_date, attendee_name);

-- ========== 2. Waitlist ==========
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_id uuid not null references public.class_slots(id) on delete cascade,
  session_date date not null,
  attendee_name text not null check (char_length(attendee_name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (user_id, slot_id, session_date, attendee_name)
);
alter table public.waitlist enable row level security;
drop policy if exists "own waitlist" on public.waitlist;
create policy "own waitlist" on public.waitlist for select using (user_id = auth.uid());
-- (no write policies: parents use join_waitlist / leave_waitlist below)

-- ========== 3. Booking: several kids in one go ==========
create or replace function public.book_class_multi(p_slot uuid, p_date date, p_attendees text[]) returns int
language plpgsql security definer set search_path = public as $$
declare s public.class_slots; c public.classes; pr public.profiles; taken int; n int; names text[] := '{}'; a text; nm text;
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  select * into pr from public.profiles where id = auth.uid();
  if pr.role <> 'parent' then raise exception 'Only parent accounts can book classes'; end if;
  if p_attendees is null or cardinality(p_attendees) = 0 then p_attendees := array[null::text]; end if;
  if cardinality(p_attendees) > 4 then raise exception 'You can book up to 4 kids at a time'; end if;
  foreach a in array p_attendees loop
    nm := left(coalesce(nullif(trim(a), ''), pr.display_name, 'Parent'), 60);
    if nm = any(names) then raise exception '% is listed twice', nm; end if;
    names := names || nm;
  end loop;
  n := cardinality(names);

  select * into s from public.class_slots where id = p_slot and active for update;  -- lock this slot so two parents can't take the last spot together
  if not found then raise exception 'This class time is no longer available'; end if;
  select * into c from public.classes where id = s.class_id;
  if not exists (select 1 from public.studios where id = c.studio_id and status = 'approved') then
    raise exception 'This class is not available';
  end if;
  if extract(dow from p_date)::int <> s.dow then raise exception 'No class on that day'; end if;
  if exists (select 1 from public.slot_exceptions where slot_id = p_slot and session_date = p_date) then
    raise exception 'This class session has been cancelled';
  end if;
  if p_date < public.la_today() or p_date > public.la_today() + 14 then raise exception 'Date out of range'; end if;
  if p_date = public.la_today() and s.start_time <= (now() at time zone 'America/Los_Angeles')::time then
    raise exception 'This class has already started';
  end if;
  select attendee_name into nm from public.bookings
   where user_id = auth.uid() and slot_id = p_slot and session_date = p_date and attendee_name = any(names) limit 1;
  if found then raise exception '% is already booked in this class', nm; end if;
  select count(*) into taken from public.bookings where slot_id = p_slot and session_date = p_date;
  if taken >= s.capacity then raise exception 'This class is full'; end if;
  if taken + n > s.capacity then raise exception 'Only % spot(s) left in this class', s.capacity - taken; end if;
  update public.profiles set credits = credits - s.credits * n where id = auth.uid() and credits >= s.credits * n;
  if not found then raise exception 'Not enough credits'; end if;
  foreach nm in array names loop
    insert into public.bookings (user_id, class_id, slot_id, studio_id, class_title, session_date, session_time,
                                 credits, price_cents, parent_name, attendee_name)
    values (auth.uid(), c.id, s.id, c.studio_id, c.title, p_date, s.start_time,
            s.credits, s.price_cents, coalesce(pr.display_name, 'Parent'), nm);
  end loop;
  delete from public.waitlist where user_id = auth.uid() and slot_id = p_slot and session_date = p_date and attendee_name = any(names);
  return n;
end $$;

-- The old one-kid call keeps working
create or replace function public.book_class(p_slot uuid, p_date date, p_attendee text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.book_class_multi(p_slot, p_date, array[p_attendee]);
end $$;

revoke execute on function public.book_class_multi(uuid, date, text[]) from public, anon;
grant execute on function public.book_class_multi(uuid, date, text[]) to authenticated;
revoke execute on function public.book_class(uuid, date, text) from public, anon;
grant execute on function public.book_class(uuid, date, text) to authenticated;

-- ========== 4. Joining and leaving the waitlist ==========
create or replace function public.join_waitlist(p_slot uuid, p_date date, p_attendee text default null) returns int
language plpgsql security definer set search_path = public as $$
declare s public.class_slots; pr public.profiles; nm text; taken int; pos int;
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  select * into pr from public.profiles where id = auth.uid();
  if pr.role <> 'parent' then raise exception 'Only parent accounts can join a waitlist'; end if;
  select * into s from public.class_slots where id = p_slot and active;
  if not found then raise exception 'This class time is no longer available'; end if;
  if not exists (select 1 from public.classes c join public.studios st on st.id = c.studio_id
                 where c.id = s.class_id and st.status = 'approved') then raise exception 'This class is not available'; end if;
  if extract(dow from p_date)::int <> s.dow then raise exception 'No class on that day'; end if;
  if p_date < public.la_today() or p_date > public.la_today() + 14 then raise exception 'Date out of range'; end if;
  if exists (select 1 from public.slot_exceptions where slot_id = p_slot and session_date = p_date) then
    raise exception 'This class session has been cancelled';
  end if;
  if (p_date + s.start_time) at time zone 'America/Los_Angeles' < now() + make_interval(hours => public.get_cancel_hours()) then
    raise exception 'The waitlist closes % hours before class', public.get_cancel_hours();
  end if;
  select count(*) into taken from public.bookings where slot_id = p_slot and session_date = p_date;
  if taken < s.capacity then raise exception 'Good news: this class has a spot open. Book it now!'; end if;
  nm := left(coalesce(nullif(trim(p_attendee), ''), pr.display_name, 'Parent'), 60);
  if exists (select 1 from public.bookings where user_id = auth.uid() and slot_id = p_slot and session_date = p_date and attendee_name = nm) then
    raise exception '% is already booked in this class', nm;
  end if;
  if (select count(*) from public.waitlist where user_id = auth.uid() and session_date >= public.la_today()) >= 10 then
    raise exception 'You can be on up to 10 waitlists at a time';
  end if;
  insert into public.waitlist (user_id, slot_id, session_date, attendee_name) values (auth.uid(), p_slot, p_date, nm)
  on conflict do nothing;
  select count(*) into pos from public.waitlist w
   where w.slot_id = p_slot and w.session_date = p_date
     and w.created_at <= (select created_at from public.waitlist where user_id = auth.uid() and slot_id = p_slot and session_date = p_date and attendee_name = nm);
  return pos;
end $$;

create or replace function public.leave_waitlist(p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.waitlist where id = p_id and user_id = auth.uid();
$$;

-- Your waitlist spots, with your place in line
create or replace function public.my_waitlist()
returns table (id uuid, slot_id uuid, session_date date, attendee_name text, place int)
language sql stable security definer set search_path = public as $$
  select w.id, w.slot_id, w.session_date, w.attendee_name,
         (select count(*) from public.waitlist x where x.slot_id = w.slot_id and x.session_date = w.session_date
            and x.created_at <= w.created_at)::int
    from public.waitlist w where w.user_id = auth.uid() and w.session_date >= public.la_today();
$$;

revoke execute on function public.join_waitlist(uuid, date, text) from public, anon;
revoke execute on function public.leave_waitlist(uuid) from public, anon;
revoke execute on function public.my_waitlist() from public, anon;
grant execute on function public.join_waitlist(uuid, date, text) to authenticated;
grant execute on function public.leave_waitlist(uuid) to authenticated;
grant execute on function public.my_waitlist() to authenticated;

-- ========== 5. A spot opens: book the next family in line automatically ==========
create or replace function public.promote_waitlist(p_slot uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare s public.class_slots; c public.classes; w public.waitlist; pr public.profiles; taken int;
begin
  select * into s from public.class_slots where id = p_slot and active for update;
  if not found then return; end if;
  if exists (select 1 from public.slot_exceptions where slot_id = p_slot and session_date = p_date) then return; end if;
  -- Only while families can still cancel for free, so nobody is booked into something they can't get out of
  if (p_date + s.start_time) at time zone 'America/Los_Angeles' < now() + make_interval(hours => public.get_cancel_hours()) then return; end if;
  select * into c from public.classes where id = s.class_id;
  if not exists (select 1 from public.studios where id = c.studio_id and status = 'approved') then return; end if;
  for w in select * from public.waitlist where slot_id = p_slot and session_date = p_date order by created_at loop
    select count(*) into taken from public.bookings where slot_id = p_slot and session_date = p_date;
    exit when taken >= s.capacity;
    delete from public.waitlist where id = w.id;
    continue when exists (select 1 from public.bookings where user_id = w.user_id and slot_id = p_slot
                          and session_date = p_date and attendee_name = w.attendee_name);
    update public.profiles set credits = credits - s.credits where id = w.user_id and role = 'parent' and credits >= s.credits;
    if not found then
      perform public.send_email_event('waitlist_no_credits', jsonb_build_object(
        'user_id', w.user_id, 'studio_id', c.studio_id, 'class_title', c.title, 'session_date', p_date,
        'session_time', s.start_time, 'credits', s.credits));
      continue;
    end if;
    select * into pr from public.profiles where id = w.user_id;
    insert into public.bookings (user_id, class_id, slot_id, studio_id, class_title, session_date, session_time,
                                 credits, price_cents, parent_name, attendee_name, source)
    values (w.user_id, c.id, s.id, c.studio_id, c.title, p_date, s.start_time,
            s.credits, s.price_cents, coalesce(pr.display_name, 'Parent'), w.attendee_name, 'waitlist');
  end loop;
end $$;
revoke execute on function public.promote_waitlist(uuid, date) from public, anon, authenticated;

-- Refunds now hand the freed spot to the waitlist (when a family cancelled, not when the session itself is off)
create or replace function public.refund_booking(p_booking uuid, p_by text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then return; end if;
  update public.profiles set credits = credits + b.credits where id = b.user_id;
  insert into public.credit_ledger (user_id, delta, reason, ref)
  values (b.user_id, b.credits,
          case when p_by = 'parent' then 'Refund: you cancelled' else 'Refund: class cancelled' end, 'refund:' || b.id)
  on conflict (ref) do nothing;
  perform public.send_email_event('booking_cancelled', jsonb_build_object(
    'by', p_by, 'user_id', b.user_id, 'studio_id', b.studio_id, 'class_title', b.class_title,
    'session_date', b.session_date, 'session_time', b.session_time, 'credits', b.credits,
    'attendee', b.attendee_name, 'parent_name', b.parent_name, 'reason', p_reason));
  delete from public.bookings where id = b.id;
  if p_by in ('parent', 'account_deleted') then
    perform public.promote_waitlist(b.slot_id, b.session_date);
  end if;
end $$;
revoke execute on function public.refund_booking(uuid, text, text) from public, anon, authenticated;

-- Closing an account leaves its waitlists first, so the freed spots can't go back to the same account
create or replace function public.anonymize_user_data(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  delete from public.waitlist where user_id = p_user;
  for b in select id from public.bookings where user_id = p_user and session_date >= public.la_today() loop
    perform public.refund_booking(b.id, 'account_deleted');
  end loop;
  -- numbered, so two siblings in the same past class don't collide
  update public.bookings b set parent_name = 'Former member', attendee_name = 'Child ' || x.rn
    from (select id, row_number() over (partition by slot_id, session_date order by id) as rn
            from public.bookings where user_id = p_user) x
   where b.id = x.id;
  update public.reviews set author = 'Former member' where user_id = p_user;
end $$;
revoke execute on function public.anonymize_user_data(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_user_data(uuid) to service_role;

-- A cancelled session clears its waitlist too
create or replace function public.trg_exception_clear_waitlist() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.waitlist where slot_id = new.slot_id and session_date = new.session_date;
  return null;
end $$;
drop trigger if exists exception_clear_waitlist on public.slot_exceptions;
create trigger exception_clear_waitlist after insert on public.slot_exceptions
  for each row execute function public.trg_exception_clear_waitlist();

-- ========== 6. Reminder email the evening before ==========
create or replace function public.send_class_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select user_id, array_agg(id order by session_time) as ids from public.bookings
            where session_date = public.la_today() + 1 and reminded_at is null and user_id is not null
            group by user_id loop
    perform public.send_email_event('class_reminder', jsonb_build_object('user_id', r.user_id, 'booking_ids', to_jsonb(r.ids)));
    update public.bookings set reminded_at = now() where id = any(r.ids);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.send_class_reminders() from public, anon, authenticated;

-- Every day at 01:00 UTC = 6pm in San Diego (5pm in winter)
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'littlepass-reminders';
select cron.schedule('littlepass-reminders', '0 1 * * *', 'select public.send_class_reminders()');
