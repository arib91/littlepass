-- LittlePass: fix double-booking race + stop leaking the pricing margin
-- Run in Supabase > SQL Editor. Safe to run again.

-- 1. Two parents booking the last spot at the same moment: lock the slot while booking
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

-- 2. Nobody can ask the database "how many credits is this price?" except studios and admins.
--    (The price-to-credits rule would otherwise reveal your margin to anyone who probes it.)
create or replace function public.slot_set_credits() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.credits := public.calc_credits(new.price_cents);
  return new;
end $$;

revoke execute on function public.calc_credits(int) from public, anon, authenticated;

create or replace function public.preview_credits(p_price_cents int) returns int
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.profiles where id = auth.uid() and role in ('studio', 'admin'))
              then public.calc_credits(p_price_cents) end
$$;
revoke execute on function public.preview_credits(int) from public, anon;
grant execute on function public.preview_credits(int) to authenticated;
