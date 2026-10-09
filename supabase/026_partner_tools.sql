-- LittlePass: partner payment log, partner logins, and the view-only partner dashboard
-- Run in Supabase > SQL Editor (after 025). Safe to run again.

-- ========== 1. Link a partner code to their own login ==========
alter table public.referrers
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- ========== 2. Payment log: what you have paid each partner ==========
create table if not exists public.partner_payments (
  id uuid primary key default gen_random_uuid(),
  referrer_code text not null references public.referrers(code) on update cascade on delete cascade,
  amount_cents int not null check (amount_cents > 0 and amount_cents <= 10000000),
  kind text not null check (kind in ('members', 'studios', 'other')),   -- other = focus groups, monthly support, gift cards
  note text check (char_length(note) <= 200),
  paid_on date not null default ((now() at time zone 'America/Los_Angeles')::date),
  created_at timestamptz not null default now()
);
create index if not exists partner_payments_code on public.partner_payments (referrer_code, paid_on);
alter table public.partner_payments enable row level security;   -- no policies: only the functions below can touch it
revoke all on public.partner_payments from anon, authenticated;

-- ========== 3. Admin: partner list now includes the linked login ==========
drop function if exists public.admin_list_referrers();
create function public.admin_list_referrers()
returns table (code text, name text, note text, active boolean, created_at timestamptz, login_email text)
language sql stable security definer set search_path = public as $$
  select r.code, r.name, r.note, r.active, r.created_at, u.email::text
  from public.referrers r left join auth.users u on u.id = r.user_id
  where public.is_admin() order by r.created_at
$$;
revoke execute on function public.admin_list_referrers() from public, anon;
grant execute on function public.admin_list_referrers() to authenticated;

create or replace function public.admin_link_partner_user(p_code text, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if char_length(trim(coalesce(p_email, ''))) = 0 then
    update public.referrers set user_id = null where code = lower(p_code);
    return;
  end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'No account with that email yet. Ask them to sign up first.'; end if;
  update public.referrers set user_id = uid where code = lower(p_code);
  if not found then raise exception 'Unknown partner code'; end if;
end $$;

-- ========== 4. Admin: payment log ==========
create or replace function public.admin_add_partner_payment(p_code text, p_amount_cents int, p_kind text, p_note text default null, p_paid_on date default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if not exists (select 1 from public.referrers where code = lower(p_code)) then raise exception 'Unknown partner code'; end if;
  insert into public.partner_payments (referrer_code, amount_cents, kind, note, paid_on)
  values (lower(p_code), p_amount_cents, p_kind, nullif(trim(p_note), ''), coalesce(p_paid_on, (now() at time zone 'America/Los_Angeles')::date));
end $$;

create or replace function public.admin_list_partner_payments()
returns table (id uuid, code text, amount_cents int, kind text, note text, paid_on date)
language sql stable security definer set search_path = public as $$
  select x.id, x.referrer_code, x.amount_cents, x.kind, x.note, x.paid_on
  from public.partner_payments x where public.is_admin() order by x.paid_on desc, x.created_at desc
$$;

create or replace function public.admin_delete_partner_payment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  delete from public.partner_payments where id = p_id;
end $$;

-- ========== 5. Partner dashboard: a partner sees only their own results, as counts ==========
-- No names or emails of families, and no contact details of studios.
create or replace function public._partner_members(p_code text)
returns table (source text, signups bigint, subscribed bigint, qualified bigint)
language sql stable security definer set search_path = public as $$
  with m as (
    select p.signup_source as src, p.plan_status as st,
      (select min(l.created_at) from public.credit_ledger l where l.user_id = p.id and l.ref like 'in\_%') as first_paid
    from public.profiles p
    where p.role = 'parent' and p.referrer_code = p_code and not p.bonus_excluded)
  select src, count(*), count(*) filter (where first_paid is not null),
         count(*) filter (where first_paid <= now() - interval '60 days' and st = 'active')
  from m group by src
$$;

create or replace function public._partner_studio_months(p_code text)
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
  where s.status = 'approved' and coalesce(sr.referrer_code, op.referrer_code) = p_code
  group by s.id, s.name, sr.referrer_code, op.referrer_code, live.d, fb.d, date_trunc('month', done.d)
  order by s.name, 6
$$;
revoke execute on function public._partner_members(text) from public, anon, authenticated;
revoke execute on function public._partner_studio_months(text) from public, anon, authenticated;

create or replace function public.partner_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare res jsonb := '[]'::jsonb; r record;
begin
  if auth.uid() is null then return null; end if;
  for r in select * from public.referrers where user_id = auth.uid() order by created_at loop
    res := res || jsonb_build_array(jsonb_build_object(
      'code', r.code, 'name', r.name, 'active', r.active,
      'members', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public._partner_members(r.code) m),
      'studios', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public._partner_studio_months(r.code) s),
      'payments', (select coalesce(jsonb_agg(jsonb_build_object('amount_cents', x.amount_cents, 'kind', x.kind, 'note', x.note, 'paid_on', x.paid_on)
                                              order by x.paid_on desc, x.created_at desc), '[]'::jsonb)
                   from public.partner_payments x where x.referrer_code = r.code)));
  end loop;
  return case when jsonb_array_length(res) = 0 then null else res end;
end $$;

-- ========== 6. Who can run what ==========
revoke execute on function public.admin_link_partner_user(text, text) from public, anon;
revoke execute on function public.admin_add_partner_payment(text, int, text, text, date) from public, anon;
revoke execute on function public.admin_list_partner_payments() from public, anon;
revoke execute on function public.admin_delete_partner_payment(uuid) from public, anon;
revoke execute on function public.partner_dashboard() from public, anon;
grant execute on function public.admin_link_partner_user(text, text) to authenticated;
grant execute on function public.admin_add_partner_payment(text, int, text, text, date) to authenticated;
grant execute on function public.admin_list_partner_payments() to authenticated;
grant execute on function public.admin_delete_partner_payment(uuid) to authenticated;
grant execute on function public.partner_dashboard() to authenticated;   -- returns nothing unless the caller is linked to a partner code
