-- LittlePass: studio waivers that parents must sign before booking
-- Run in Supabase > SQL Editor (after 023). Safe to run again.
-- A studio writes its own waiver(s). Before booking, a parent reads it, ticks agreement for the named children
-- and types their full name. We keep an exact copy of the text they signed, with the time, so the studio
-- (and LittlePass) can show who agreed to what. Editing a waiver makes a new version that families must sign again.

-- ========== 1. Waivers ==========
create table if not exists public.studio_waivers (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  body text not null check (char_length(trim(body)) between 50 and 20000),
  class_ids uuid[],                       -- null = every class at the studio
  version int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_waivers_studio on public.studio_waivers (studio_id);
alter table public.studio_waivers enable row level security;
drop policy if exists "waivers read" on public.studio_waivers;
create policy "waivers read" on public.studio_waivers for select using (
  active or public.is_admin() or exists (select 1 from public.studios s where s.id = studio_id and s.owner_id = auth.uid()));
drop policy if exists "waivers owner insert" on public.studio_waivers;
create policy "waivers owner insert" on public.studio_waivers for insert with check (
  exists (select 1 from public.studios s where s.id = studio_id and s.owner_id = auth.uid()));
drop policy if exists "waivers owner update" on public.studio_waivers;
create policy "waivers owner update" on public.studio_waivers for update
  using (exists (select 1 from public.studios s where s.id = studio_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.studios s where s.id = studio_id and s.owner_id = auth.uid()));
-- (no delete: a studio switches a waiver off instead, so signed copies keep their context)

-- Version numbers are set here, never by the browser; changing the wording means families sign again
create or replace function public.trg_waiver_version() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    if (select count(*) from public.studio_waivers where studio_id = new.studio_id and active) >= 5 then
      raise exception 'A studio can have up to 5 active waivers';
    end if;
  else
    new.studio_id := old.studio_id;
    new.created_at := old.created_at;
    new.version := case when new.title is distinct from old.title or new.body is distinct from old.body then old.version + 1 else old.version end;
    if new.active and not old.active and (select count(*) from public.studio_waivers where studio_id = new.studio_id and active) >= 5 then
      raise exception 'A studio can have up to 5 active waivers';
    end if;
  end if;
  new.title := trim(new.title); new.body := trim(new.body); new.updated_at := now();
  return new;
end $$;
drop trigger if exists waiver_version on public.studio_waivers;
create trigger waiver_version before insert or update on public.studio_waivers
  for each row execute function public.trg_waiver_version();

-- ========== 2. Signatures (an exact copy of what was signed) ==========
create table if not exists public.waiver_signatures (
  id uuid primary key default gen_random_uuid(),
  waiver_id uuid references public.studio_waivers(id) on delete set null,
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,   -- kept as a record even if the account is closed
  version int not null,
  title text not null,
  body text not null,
  signer_name text not null check (char_length(signer_name) between 3 and 100),
  kids text[] not null,
  signed_at timestamptz not null default now(),
  user_agent text check (char_length(user_agent) <= 300)
);
create index if not exists waiver_signatures_user on public.waiver_signatures (user_id);
create index if not exists waiver_signatures_waiver on public.waiver_signatures (waiver_id);
alter table public.waiver_signatures enable row level security;
drop policy if exists "signatures read" on public.waiver_signatures;
create policy "signatures read" on public.waiver_signatures for select using (
  user_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.studios s where s.id = studio_id and s.owner_id = auth.uid()));
-- (no write policies: parents sign through sign_waiver below; nobody can edit or delete a signature)

create or replace function public.sign_waiver(p_waiver uuid, p_version int, p_signer text, p_kids text[], p_user_agent text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare w public.studio_waivers; pr public.profiles; names text[] := '{}'; a text; nm text; sid uuid;
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  select * into pr from public.profiles where id = auth.uid();
  if pr.role <> 'parent' then raise exception 'Only parent accounts can sign waivers'; end if;
  select * into w from public.studio_waivers where id = p_waiver and active;
  if not found then raise exception 'This waiver is no longer in use'; end if;
  if w.version <> p_version then raise exception 'The studio just updated this waiver. Please read the new version.'; end if;
  if char_length(trim(coalesce(p_signer, ''))) < 3 then raise exception 'Please type your full name to sign'; end if;
  if p_kids is null or cardinality(p_kids) = 0 then p_kids := array[null::text]; end if;
  if cardinality(p_kids) > 10 then raise exception 'Too many names'; end if;
  foreach a in array p_kids loop    -- same naming rule as bookings, so the names always match
    nm := left(coalesce(nullif(trim(a), ''), pr.display_name, 'Parent'), 60);
    if not nm = any(names) then names := names || nm; end if;
  end loop;
  insert into public.waiver_signatures (waiver_id, studio_id, user_id, version, title, body, signer_name, kids, user_agent)
  values (w.id, w.studio_id, auth.uid(), w.version, w.title, w.body, left(trim(p_signer), 100), names, left(p_user_agent, 300))
  returning id into sid;
  return sid;
end $$;
revoke execute on function public.sign_waiver(uuid, int, text, text[], text) from public, anon;
grant execute on function public.sign_waiver(uuid, int, text, text[], text) to authenticated;

-- Waivers this parent still has to sign (current version) before these children can join this class
create or replace function public.missing_waivers(p_user uuid, p_class uuid, p_names text[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select w.id from public.studio_waivers w join public.classes c on c.studio_id = w.studio_id
   where c.id = p_class and w.active and (w.class_ids is null or p_class = any(w.class_ids))
     and not exists (select 1 from public.waiver_signatures s where s.waiver_id = w.id and s.user_id = p_user
                     and s.version = w.version and s.kids @> p_names);
$$;
revoke execute on function public.missing_waivers(uuid, uuid, text[]) from public, anon, authenticated;

-- ========== 3. Booking and the waitlist check for signatures ==========
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
  if exists (select 1 from public.missing_waivers(auth.uid(), c.id, names)) then
    raise exception 'Please read and sign the studio waiver before booking';
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
  nm := left(coalesce(nullif(trim(p_attendee), ''), pr.display_name, 'Parent'), 60);
  if exists (select 1 from public.missing_waivers(auth.uid(), s.class_id, array[nm])) then
    raise exception 'Please read and sign the studio waiver before booking';
  end if;
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
revoke execute on function public.join_waitlist(uuid, date, text) from public, anon;
grant execute on function public.join_waitlist(uuid, date, text) to authenticated;

-- Automatic waitlist bookings: the family signed when joining; if the studio added a new waiver since, skip them
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
    continue when exists (select 1 from public.studio_waivers sw
                           where sw.studio_id = c.studio_id and sw.active and (sw.class_ids is null or c.id = any(sw.class_ids))
                             and not exists (select 1 from public.waiver_signatures g where g.waiver_id = sw.id
                                             and g.user_id = w.user_id and g.kids @> array[w.attendee_name]));
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
