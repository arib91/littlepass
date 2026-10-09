-- LittlePass: referral tracking (who brought each family or studio) + monthly studio bookings report
-- Run in Supabase > SQL Editor (after 024). Safe to run again.
-- Used to pay partners who bring in families and studios. Only the admin can see any of it.

-- ========== 1. Referral codes: one per person who brings in families or studios ==========
create table if not exists public.referrers (
  code text primary key check (code ~ '^[a-z0-9-]{3,30}$'),
  name text not null check (char_length(name) between 1 and 80),
  note text check (char_length(note) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.referrers enable row level security;     -- no policies: nobody reads it from the app
revoke all on public.referrers from anon, authenticated;

-- ========== 2. Who brought each person ==========
alter table public.profiles
  add column if not exists referrer_code text references public.referrers(code) on update cascade on delete set null,
  add column if not exists signup_source text,
  add column if not exists bonus_excluded boolean not null default false;   -- test accounts and the partner's own family never count
alter table public.profiles drop constraint if exists profiles_signup_source_check;
alter table public.profiles add constraint profiles_signup_source_check
  check (signup_source is null or signup_source in ('referral', 'ad', 'studio'));
create index if not exists profiles_referrer on public.profiles (referrer_code) where referrer_code is not null;
-- (people can still change only their own name and language: the update grant on profiles is unchanged)

-- A studio can also be credited by hand, e.g. when the owner signed up without the link
create table if not exists public.studio_referrals (
  studio_id uuid primary key references public.studios(id) on delete cascade,
  referrer_code text not null references public.referrers(code) on update cascade on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.studio_referrals enable row level security;
revoke all on public.studio_referrals from anon, authenticated;

-- ========== 3. New accounts remember a valid referral code ==========
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rc text := lower(nullif(trim(new.raw_user_meta_data->>'ref'), ''));
  sr text := nullif(trim(new.raw_user_meta_data->>'src'), '');
begin
  if rc is not null and not exists (select 1 from public.referrers where code = rc and active) then rc := null; end if;
  if rc is null then sr := null;
  elsif sr is null or sr not in ('referral', 'ad', 'studio') then sr := 'referral'; end if;
  insert into public.profiles (id, role, display_name, terms_version, terms_accepted_at, referrer_code, signup_source)
  values (
    new.id,
    case when new.raw_user_meta_data->>'role' = 'studio' then 'studio' else 'parent' end,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'terms_version',
    nullif(new.raw_user_meta_data->>'terms_accepted_at', '')::timestamptz,
    rc, sr
  );
  return new;
end $$;

-- ========== 4. Admin: referral codes ==========
create or replace function public.admin_list_referrers()
returns table (code text, name text, note text, active boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.code, r.name, r.note, r.active, r.created_at from public.referrers r where public.is_admin() order by r.created_at
$$;

create or replace function public.admin_save_referrer(p_code text, p_name text, p_note text default null, p_active boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare c text := lower(trim(p_code));
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if c !~ '^[a-z0-9-]{3,30}$' then raise exception 'Codes use 3 to 30 lowercase letters, numbers or dashes'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Please enter a name'; end if;
  insert into public.referrers (code, name, note, active) values (c, trim(p_name), nullif(trim(p_note), ''), p_active)
  on conflict (code) do update set name = excluded.name, note = excluded.note, active = excluded.active;
end $$;

-- ========== 5. Admin: families brought in, by code and source ==========
-- "qualified" = paid for 60+ days and still subscribed. Check Stripe for refunds or disputes before paying a bonus.
create or replace function public.admin_referral_report()
returns table (code text, source text, signups bigint, subscribed bigint, qualified bigint)
language sql stable security definer set search_path = public as $$
  with m as (
    select p.referrer_code as rc, p.signup_source as src, p.plan_status as st,
      (select min(l.created_at) from public.credit_ledger l where l.user_id = p.id and l.ref like 'in\_%') as first_paid
    from public.profiles p
    where public.is_admin() and p.role = 'parent' and p.referrer_code is not null and not p.bonus_excluded)
  select rc, src, count(*), count(*) filter (where first_paid is not null),
         count(*) filter (where first_paid <= now() - interval '60 days' and st = 'active')
  from m group by rc, src order by rc, src
$$;

create or replace function public.admin_referral_members(p_code text)
returns table (user_id uuid, email text, display_name text, joined timestamptz, source text, plan text, plan_status text,
               first_paid timestamptz, qualified boolean)
language sql stable security definer set search_path = public as $$
  select p.id, u.email::text, p.display_name, p.created_at, p.signup_source, p.plan, p.plan_status, fp.d,
         coalesce(fp.d <= now() - interval '60 days' and p.plan_status = 'active', false)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join lateral (select min(l.created_at) as d from public.credit_ledger l where l.user_id = p.id and l.ref like 'in\_%') fp on true
  where public.is_admin() and p.referrer_code = lower(p_code) and p.role = 'parent' and not p.bonus_excluded
  order by p.created_at desc
$$;

-- ========== 6. Admin: completed bookings per studio per month ==========
-- A booking is completed once its class date has passed (the same rule studio payouts use). Excluded accounts don't count.
create or replace function public.admin_studio_months()
returns table (studio_id uuid, studio_name text, referrer_code text, went_live date, first_booking date, month date, bookings bigint)
language sql stable security definer set search_path = public as $$
  with done as (
    select b.studio_id as sid, b.session_date as d
    from public.bookings b join public.profiles p on p.id = b.user_id
    where b.session_date < public.la_today() and not p.bonus_excluded),
  first_b as (select sid, min(d) as d from done group by sid),
  live as (select c.studio_id as sid, min(sl.created_at)::date as d
           from public.class_slots sl join public.classes c on c.id = sl.class_id where sl.active group by c.studio_id)
  select s.id, s.name, coalesce(sr.referrer_code, op.referrer_code), live.d, fb.d,
         date_trunc('month', done.d)::date, count(done.d)
  from public.studios s
  left join public.studio_referrals sr on sr.studio_id = s.id
  left join public.profiles op on op.id = s.owner_id
  left join live on live.sid = s.id
  left join first_b fb on fb.sid = s.id
  left join done on done.sid = s.id
  where public.is_admin() and s.status = 'approved'
  group by s.id, s.name, sr.referrer_code, op.referrer_code, live.d, fb.d, date_trunc('month', done.d)
  order by s.name, 6
$$;

create or replace function public.admin_set_studio_referrer(p_studio uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare c text := lower(nullif(trim(p_code), ''));
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if c is null then delete from public.studio_referrals where studio_id = p_studio; return; end if;
  if not exists (select 1 from public.referrers where code = c) then raise exception 'Unknown referral code'; end if;
  insert into public.studio_referrals (studio_id, referrer_code) values (p_studio, c)
  on conflict (studio_id) do update set referrer_code = excluded.referrer_code;
end $$;

-- ========== 7. Admin: accounts that never count toward bonuses ==========
create or replace function public.admin_excluded_accounts()
returns table (user_id uuid, email text, display_name text)
language sql stable security definer set search_path = public as $$
  select p.id, u.email::text, p.display_name from public.profiles p join auth.users u on u.id = p.id
  where public.is_admin() and p.bonus_excluded order by u.email
$$;

create or replace function public.admin_set_bonus_excluded(p_email text, p_excluded boolean) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'No account with that email'; end if;
  update public.profiles set bonus_excluded = p_excluded where id = uid;
end $$;

-- Only signed-in admins can run these (each one checks is_admin() itself)
revoke execute on function public.admin_list_referrers() from public, anon;
revoke execute on function public.admin_save_referrer(text, text, text, boolean) from public, anon;
revoke execute on function public.admin_referral_report() from public, anon;
revoke execute on function public.admin_referral_members(text) from public, anon;
revoke execute on function public.admin_studio_months() from public, anon;
revoke execute on function public.admin_set_studio_referrer(uuid, text) from public, anon;
revoke execute on function public.admin_excluded_accounts() from public, anon;
revoke execute on function public.admin_set_bonus_excluded(text, boolean) from public, anon;
grant execute on function public.admin_list_referrers() to authenticated;
grant execute on function public.admin_save_referrer(text, text, text, boolean) to authenticated;
grant execute on function public.admin_referral_report() to authenticated;
grant execute on function public.admin_referral_members(text) to authenticated;
grant execute on function public.admin_studio_months() to authenticated;
grant execute on function public.admin_set_studio_referrer(uuid, text) to authenticated;
grant execute on function public.admin_excluded_accounts() to authenticated;
grant execute on function public.admin_set_bonus_excluded(text, boolean) to authenticated;
