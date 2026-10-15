-- Parents can now book classes up to 30 days ahead (was 14).
-- The two functions that check the date (book_class has no date check of its own; it goes through book_class_multi) are rewritten from their current definitions, with "+ 14" changed to "+ 30".
do $$
declare f text; def text;
begin
  foreach f in array array['book_class_multi(uuid, date, text[])', 'join_waitlist(uuid, date, text)'] loop
    select pg_get_functiondef(('public.' || f)::regprocedure) into def;
    if def not like '%la_today() + 14%' then raise exception 'Did not find the 14-day check in %', f; end if;
    execute replace(def, 'la_today() + 14', 'la_today() + 30');
  end loop;
end $$;

-- The admin Stats tab counts seats and bookings over the next 30 days instead of 14 (the key is renamed seats_next_30).
do $$
declare def text;
begin
  select pg_get_functiondef('public.admin_stats()'::regprocedure) into def;
  if def not like '%today + 13%' then raise exception 'Did not find the 14-day window in admin_stats'; end if;
  execute replace(replace(replace(def, 'today + 13', 'today + 29'), 'seats_next_14', 'seats_next_30'), 'next 14 days', 'next 30 days');
end $$;
