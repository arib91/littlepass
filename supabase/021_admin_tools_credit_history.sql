-- LittlePass: admin tools (people list, credit adjustments, refunds, exports, activity log) + full credit history
-- Run in Supabase > SQL Editor (after 020). Safe to run again.

-- ========== 1. Admin activity log ==========
create table if not exists public.admin_audit (
  id bigserial primary key,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target text,
  details jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
drop policy if exists "admin reads audit" on public.admin_audit;
create policy "admin reads audit" on public.admin_audit for select using (public.is_admin());
-- (no write policies: only the functions and triggers below write here)

create or replace function public.log_admin(p_action text, p_target text, p_details jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.admin_audit (admin_id, action, target, details) values (auth.uid(), p_action, p_target, p_details);
$$;
revoke execute on function public.log_admin(text, text, jsonb) from public, anon, authenticated;

-- Log admin changes made through the existing screens
create or replace function public.trg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return null; end if;
  if tg_table_name = 'studios' and new.status is distinct from old.status then
    perform public.log_admin('studio_' || new.status, new.name, jsonb_build_object('from', old.status, 'note', new.status_note));
  elsif tg_table_name = 'pricing_settings' then
    perform public.log_admin('pricing_changed', 'pricing', jsonb_build_object('from', to_jsonb(old), 'to', to_jsonb(new)));
  elsif tg_table_name = 'payouts' and tg_op = 'INSERT' then
    perform public.log_admin('payout_created', (select name from public.studios where id = new.studio_id),
      jsonb_build_object('amount_cents', new.amount_cents, 'through', new.period_end));
  elsif tg_table_name = 'payouts' and new.status is distinct from old.status then
    perform public.log_admin('payout_' || new.status, (select name from public.studios where id = new.studio_id),
      jsonb_build_object('amount_cents', new.amount_cents, 'reference', new.reference));
  elsif tg_table_name = 'reviews' and new.hidden is distinct from old.hidden then
    perform public.log_admin(case when new.hidden then 'review_hidden' else 'review_shown' end,
      (select name from public.studios where id = new.studio_id), jsonb_build_object('author', new.author, 'stars', new.stars));
  end if;
  return null;
end $$;
drop trigger if exists audit_studios on public.studios;
create trigger audit_studios after update of status on public.studios for each row execute function public.trg_audit();
drop trigger if exists audit_pricing on public.pricing_settings;
create trigger audit_pricing after update on public.pricing_settings for each row execute function public.trg_audit();
drop trigger if exists audit_payouts on public.payouts;
create trigger audit_payouts after insert or update on public.payouts for each row execute function public.trg_audit();
drop trigger if exists audit_reviews on public.reviews;
create trigger audit_reviews after update of hidden on public.reviews for each row execute function public.trg_audit();

-- ========== 2. Credit history includes spending, not just top-ups ==========
-- Past bookings, so the history isn't missing anything
insert into public.credit_ledger (user_id, delta, reason, ref, created_at)
select b.user_id, -b.credits, left('Booked: ' || b.class_title || ' · ' || b.attendee_name, 200), 'booking:' || b.id, b.created_at
  from public.bookings b where b.user_id is not null
on conflict (ref) do nothing;

create or replace function public.book_class_multi(p_slot uuid, p_date date, p_attendees text[]) returns int
language plpgsql security definer set search_path = public as $$
declare s public.class_slots; c public.classes; pr public.profiles; taken int; n int; names text[] := '{}'; a text; nm text; bid uuid;
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
            s.credits, s.price_cents, coalesce(pr.display_name, 'Parent'), nm)
    returning id into bid;
    insert into public.credit_ledger (user_id, delta, reason, ref)
    values (auth.uid(), -s.credits, left('Booked: ' || c.title || ' · ' || nm, 200), 'booking:' || bid);
  end loop;
  delete from public.waitlist where user_id = auth.uid() and slot_id = p_slot and session_date = p_date and attendee_name = any(names);
  return n;
end $$;
revoke execute on function public.book_class_multi(uuid, date, text[]) from public, anon;
grant execute on function public.book_class_multi(uuid, date, text[]) to authenticated;

create or replace function public.promote_waitlist(p_slot uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare s public.class_slots; c public.classes; w public.waitlist; pr public.profiles; taken int; bid uuid;
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
            s.credits, s.price_cents, coalesce(pr.display_name, 'Parent'), w.attendee_name, 'waitlist')
    returning id into bid;
    insert into public.credit_ledger (user_id, delta, reason, ref)
    values (w.user_id, -s.credits, left('Booked from waitlist: ' || c.title || ' · ' || w.attendee_name, 200), 'booking:' || bid);
  end loop;
end $$;
revoke execute on function public.promote_waitlist(uuid, date) from public, anon, authenticated;

-- Refund lines now name the class
create or replace function public.refund_booking(p_booking uuid, p_by text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then return; end if;
  update public.profiles set credits = credits + b.credits where id = b.user_id;
  insert into public.credit_ledger (user_id, delta, reason, ref)
  values (b.user_id, b.credits,
          left(case when p_by = 'parent' then 'Refund (you cancelled): ' else 'Refund (class cancelled): ' end
               || b.class_title || ' · ' || b.attendee_name, 200), 'refund:' || b.id)
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

-- ========== 3. People list for the admin ==========
create or replace function public.admin_list_users()
returns table (id uuid, email text, role text, display_name text, credits int, plan text, plan_status text,
               created_at timestamptz, last_sign_in timestamptz, upcoming int, attended int, kids int, studio_name text, terms_version text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  return query
  select p.id, u.email::text, p.role, p.display_name, p.credits, p.plan, p.plan_status, u.created_at, u.last_sign_in_at,
         (select count(*) from public.bookings b where b.user_id = p.id and b.session_date >= public.la_today())::int,
         (select count(*) from public.bookings b where b.user_id = p.id and b.session_date < public.la_today())::int,
         (select count(*) from public.kids k where k.user_id = p.id)::int,
         (select s.name from public.studios s where s.owner_id = p.id limit 1),
         p.terms_version
    from public.profiles p join auth.users u on u.id = p.id
   order by u.created_at desc;
end $$;

-- One person's bookings, credit history and waitlists
create or replace function public.admin_user_detail(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'kids', coalesce((select jsonb_agg(jsonb_build_object('name', k.name, 'birthday', k.birthday) order by k.created_at)
                        from public.kids k where k.user_id = p_user), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(to_jsonb(b) order by b.session_date desc, b.session_time desc)
                            from (select * from public.bookings where user_id = p_user order by session_date desc limit 50) b), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc)
                          from (select * from public.credit_ledger where user_id = p_user order by created_at desc limit 50) l), '[]'::jsonb),
    'waitlist', coalesce((select jsonb_agg(to_jsonb(w)) from public.waitlist w where w.user_id = p_user and w.session_date >= public.la_today()), '[]'::jsonb));
end $$;

-- ========== 4. Admin support actions ==========
create or replace function public.admin_adjust_credits(p_user uuid, p_delta int, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare bal int; why text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if why is null then raise exception 'Please give a reason (the parent sees it in their credit history)'; end if;
  if p_delta = 0 or abs(p_delta) > 500 then raise exception 'Adjust by 1 to 500 credits'; end if;
  update public.profiles set credits = credits + p_delta where id = p_user and role = 'parent' and credits + p_delta >= 0
  returning credits into bal;
  if not found then raise exception 'Only parent accounts, and the balance can''t go below zero'; end if;
  insert into public.credit_ledger (user_id, delta, reason, ref)
  values (p_user, p_delta, left('Adjustment by LittlePass: ' || why, 200), 'admin:' || gen_random_uuid());
  perform public.log_admin('credits_adjusted', (select email from auth.users where id = p_user),
    jsonb_build_object('delta', p_delta, 'reason', why, 'new_balance', bal));
  return bal;
end $$;

-- Refund one booking for support (any time, even inside the 24-hour window); the freed spot goes to the waitlist
create or replace function public.admin_refund_booking(p_booking uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  select * into b from public.bookings where id = p_booking;
  if not found then raise exception 'Booking not found'; end if;
  if b.payout_id is not null then raise exception 'This booking was already paid out to the studio'; end if;
  perform public.refund_booking(b.id, 'admin', nullif(trim(coalesce(p_reason, '')), ''));
  perform public.promote_waitlist(b.slot_id, b.session_date);
  perform public.log_admin('booking_refunded', (select email from auth.users where id = b.user_id),
    jsonb_build_object('class', b.class_title, 'date', b.session_date, 'attendee', b.attendee_name, 'credits', b.credits, 'reason', p_reason));
end $$;

-- ========== 5. Spreadsheet exports ==========
create or replace function public.admin_export(p_kind text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if p_kind = 'people' then
    return coalesce((select jsonb_agg(to_jsonb(x)) from public.admin_list_users() x), '[]'::jsonb);
  elsif p_kind = 'bookings' then
    return coalesce((select jsonb_agg(jsonb_build_object(
      'date', b.session_date, 'time', b.session_time, 'studio', s.name, 'class', b.class_title, 'attendee', b.attendee_name,
      'parent', b.parent_name, 'parent_email', u.email, 'credits', b.credits, 'studio_price', round(b.price_cents / 100.0, 2),
      'source', b.source, 'paid_out', b.payout_id is not null, 'booked_at', b.created_at) order by b.session_date desc, b.session_time)
      from public.bookings b left join public.studios s on s.id = b.studio_id left join auth.users u on u.id = b.user_id), '[]'::jsonb);
  elsif p_kind = 'payouts' then
    return coalesce((select jsonb_agg(jsonb_build_object(
      'studio', s.name, 'from', p.period_start, 'through', p.period_end, 'amount', round(p.amount_cents / 100.0, 2),
      'status', p.status, 'paid_at', p.paid_at, 'reference', p.reference, 'created_at', p.created_at) order by p.created_at desc)
      from public.payouts p left join public.studios s on s.id = p.studio_id), '[]'::jsonb);
  elsif p_kind = 'credits' then
    return coalesce((select jsonb_agg(jsonb_build_object(
      'when', l.created_at, 'email', u.email, 'change', l.delta, 'reason', l.reason) order by l.created_at desc)
      from public.credit_ledger l left join auth.users u on u.id = l.user_id), '[]'::jsonb);
  elsif p_kind = 'activity' then
    return coalesce((select jsonb_agg(jsonb_build_object(
      'when', a.created_at, 'admin', u.email, 'action', a.action, 'target', a.target, 'details', a.details) order by a.created_at desc)
      from public.admin_audit a left join auth.users u on u.id = a.admin_id), '[]'::jsonb);
  end if;
  raise exception 'Unknown export';
end $$;

revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_user_detail(uuid) from public, anon;
revoke execute on function public.admin_adjust_credits(uuid, int, text) from public, anon;
revoke execute on function public.admin_refund_booking(uuid, text) from public, anon;
revoke execute on function public.admin_export(text) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;
grant execute on function public.admin_adjust_credits(uuid, int, text) to authenticated;
grant execute on function public.admin_refund_booking(uuid, text) to authenticated;
grant execute on function public.admin_export(text) to authenticated;

-- ========== 6. Parents can rename their kids (the "own kids" rule already allows it); keep names sane ==========
alter table public.kids drop constraint if exists kids_name_len;
alter table public.kids add constraint kids_name_len check (char_length(trim(name)) between 1 and 60) not valid;
alter table public.profiles drop constraint if exists profiles_name_len;
alter table public.profiles add constraint profiles_name_len check (display_name is null or char_length(trim(display_name)) between 1 and 60) not valid;
