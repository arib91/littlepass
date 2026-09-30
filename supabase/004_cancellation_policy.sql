-- LittlePass: cancellation policy (default: 24 hours before class, for every class)
-- Run ONCE in Supabase > SQL Editor.
-- Change the window anytime: Table Editor > pricing_settings > cancel_hours.

alter table public.pricing_settings
  add column if not exists cancel_hours int not null default 24 check (cancel_hours >= 0);

create function public.get_cancel_hours() returns int
language sql stable security definer set search_path = public as $$
  select cancel_hours from public.pricing_settings where id = 1
$$;
grant execute on function public.get_cancel_hours() to anon, authenticated;

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
  delete from public.bookings where id = b.id;
  update public.profiles set credits = credits + b.credits where id = auth.uid();
end $$;
