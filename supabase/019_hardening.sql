-- LittlePass: hardening found in the audit
-- Run in Supabase > SQL Editor (after 018). Safe to run again.

-- 1. Neighborhood must be one of the known San Diego areas (it was free text)
alter table public.classes drop constraint if exists classes_hood_check;
alter table public.classes add constraint classes_hood_check check (hood in (
  'North Park', 'Hillcrest', 'La Jolla', 'Pacific Beach', 'Point Loma', 'Mission Valley',
  'Carmel Valley', 'Encinitas', 'Carlsbad', 'Chula Vista', 'Del Mar'));

-- 2. Booking and cancelling are for logged-in parents only (they already refused, now they can't even be called)
revoke execute on function public.book_class(uuid, date, text) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.book_class(uuid, date, text) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
