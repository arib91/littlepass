-- LittlePass: skip a single date, and tell people when a booking is cancelled
-- Run in Supabase > SQL Editor (after 015). Safe to run again.

-- ========== 1. Cancelled sessions ==========
create table if not exists public.slot_exceptions (
  slot_id uuid not null references public.class_slots(id) on delete cascade,
  session_date date not null,
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (slot_id, session_date)
);
alter table public.slot_exceptions enable row level security;
drop policy if exists "exceptions read" on public.slot_exceptions;
create policy "exceptions read" on public.slot_exceptions for select using (true);  -- parents must see which dates are off
-- (no write policies: studios use cancel_session / restore_session below)

-- ========== 2. One place that refunds a booking and tells everyone ==========
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
end $$;
revoke execute on function public.refund_booking(uuid, text, text) from public, anon, authenticated;

-- ========== 3. Studio cancels (or restores) one date of a weekly slot ==========
create or replace function public.cancel_session(p_slot uuid, p_date date, p_reason text default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; slot_dow int;
begin
  select sl.dow into slot_dow from public.class_slots sl
    join public.classes c on c.id = sl.class_id join public.studios s on s.id = c.studio_id
   where sl.id = p_slot and s.owner_id = auth.uid();
  if not found then raise exception 'Not allowed'; end if;
  if p_date < public.la_today() then raise exception 'That session has already happened'; end if;
  if extract(dow from p_date)::int <> slot_dow then raise exception 'This time slot does not run on that day'; end if;
  insert into public.slot_exceptions (slot_id, session_date, reason)
  values (p_slot, p_date, left(nullif(trim(coalesce(p_reason, '')), ''), 200))
  on conflict (slot_id, session_date) do update set reason = excluded.reason;
  for r in select id from public.bookings where slot_id = p_slot and session_date = p_date loop
    perform public.refund_booking(r.id, 'studio', p_reason);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.restore_session(p_slot uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.class_slots sl join public.classes c on c.id = sl.class_id
                 join public.studios s on s.id = c.studio_id where sl.id = p_slot and s.owner_id = auth.uid()) then
    raise exception 'Not allowed';
  end if;
  if p_date < public.la_today() then raise exception 'That session has already happened'; end if;
  delete from public.slot_exceptions where slot_id = p_slot and session_date = p_date;
end $$;
revoke execute on function public.cancel_session(uuid, date, text) from public, anon;
revoke execute on function public.restore_session(uuid, date) from public, anon;
grant execute on function public.cancel_session(uuid, date, text) to authenticated;
grant execute on function public.restore_session(uuid, date) to authenticated;

-- ========== 4. Booking refuses cancelled sessions ==========
create or replace function public.book_class(p_slot uuid, p_date date, p_attendee text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s public.class_slots; c public.classes; pr public.profiles; taken int; who text;
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  select * into pr from public.profiles where id = auth.uid();
  if pr.role <> 'parent' then raise exception 'Only parent accounts can book classes'; end if;
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

-- ========== 5. Every cancellation path now refunds through the same helper (and sends emails) ==========
create or replace function public.cancel_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings; starts timestamptz; hrs int;
begin
  select * into b from public.bookings where id = p_booking and user_id = auth.uid();
  if not found then raise exception 'Booking not found'; end if;
  hrs := public.get_cancel_hours();
  starts := (b.session_date + b.session_time) at time zone 'America/Los_Angeles';
  if now() > starts - make_interval(hours => hrs) then
    raise exception 'Classes can only be cancelled up to % hours before they start', hrs;
  end if;
  perform public.refund_booking(b.id, 'parent');
end $$;

create or replace function public.on_slot_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  for b in select id from public.bookings where slot_id = old.id and session_date >= public.la_today() loop
    perform public.refund_booking(b.id, 'studio', 'The studio removed this class time');
  end loop;
  return old;
end $$;

create or replace function public.admin_set_studio_status(p_studio uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'Invalid status'; end if;
  update public.studios set status = p_status, status_note = nullif(trim(p_note), ''), reviewed_at = now()
  where id = p_studio;
  if not found then raise exception 'Studio not found'; end if;
  if p_status <> 'approved' then
    for b in select id from public.bookings where studio_id = p_studio and session_date >= public.la_today() loop
      perform public.refund_booking(b.id, 'admin', 'This studio is not available on LittlePass right now');
    end loop;
  end if;
end $$;
