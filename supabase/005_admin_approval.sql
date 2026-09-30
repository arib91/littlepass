-- LittlePass: admin role + studio approval
-- Run ONCE in Supabase > SQL Editor (after 004).
-- Afterwards, make yourself admin with the one-line query at the bottom.

-- ========== 1. ADMIN ROLE ==========
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('parent', 'studio', 'admin'));
-- (The signup trigger only ever creates 'parent' or 'studio', so nobody can sign up as admin.)

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- ========== 2. STUDIO STATUS ==========
alter table public.studios
  add column status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  add column status_note text,
  add column reviewed_at timestamptz;
-- every studio that exists today stays approved; new ones start pending
alter table public.studios alter column status set default 'pending';

-- Studios can edit only their name and description, never their status
revoke update on public.studios from anon, authenticated;
grant update (name, blurb) on public.studios to authenticated;

-- ========== 3. WHO CAN SEE WHAT ==========
drop policy if exists "studios public read" on public.studios;
create policy "studios read" on public.studios for select using (
  status = 'approved' or owner_id = auth.uid() or public.is_admin());

drop policy if exists "studio owner insert" on public.studios;
create policy "studio owner insert" on public.studios for insert with check (
  owner_id = auth.uid() and status = 'pending'
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'studio'));

drop policy if exists "classes public read" on public.classes;
create policy "classes read" on public.classes for select using (
  public.is_admin() or exists (select 1 from public.studios s
    where s.id = studio_id and (s.status = 'approved' or s.owner_id = auth.uid())));

drop policy if exists "slots read" on public.class_slots;
create policy "slots read" on public.class_slots for select using (
  public.is_admin() or exists (select 1 from public.classes c join public.studios s on s.id = c.studio_id
    where c.id = class_id and (s.owner_id = auth.uid() or (active and s.status = 'approved'))));

-- ========== 4. ADMIN TOOLS ==========
create function public.admin_list_studios()
returns table (id uuid, name text, blurb text, status text, status_note text, created_at timestamptz,
               owner_id uuid, owner_email text, owner_name text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.blurb, s.status, s.status_note, s.created_at, s.owner_id, u.email::text, p.display_name
  from public.studios s
  left join auth.users u on u.id = s.owner_id
  left join public.profiles p on p.id = s.owner_id
  where public.is_admin()
  order by (s.status = 'pending') desc, s.created_at desc
$$;

-- Approve / reject / suspend. Moving a studio out of "approved" refunds and cancels upcoming bookings.
create function public.admin_set_studio_status(p_studio uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'Invalid status'; end if;
  update public.studios set status = p_status, status_note = nullif(trim(p_note), ''), reviewed_at = now()
  where id = p_studio;
  if not found then raise exception 'Studio not found'; end if;
  if p_status <> 'approved' then
    for b in select * from public.bookings where studio_id = p_studio and session_date >= public.la_today() loop
      update public.profiles set credits = credits + b.credits where id = b.user_id;
      delete from public.bookings where id = b.id;
    end loop;
  end if;
end $$;

revoke execute on function public.admin_list_studios() from public, anon;
revoke execute on function public.admin_set_studio_status(uuid, text, text) from public, anon;
grant execute on function public.admin_list_studios() to authenticated;
grant execute on function public.admin_set_studio_status(uuid, text, text) to authenticated;

-- ========== 5. BOOKING ONLY FOR APPROVED STUDIOS ==========
create or replace function public.book_class(p_slot uuid, p_date date, p_attendee text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s public.class_slots; c public.classes; pr public.profiles; taken int; who text;
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  select * into pr from public.profiles where id = auth.uid();
  if pr.role <> 'parent' then raise exception 'Only parent accounts can book classes'; end if;
  select * into s from public.class_slots where id = p_slot and active;
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

-- ========== 6. MAKE YOURSELF ADMIN (run separately, with YOUR admin account's email) ==========
-- update public.profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'bronsolerari+admin@gmail.com');
