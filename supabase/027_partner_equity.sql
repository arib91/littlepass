-- LittlePass: partner terms (start, end, member equity tiers) and milestone tracking
-- Run in Supabase > SQL Editor (after 026). Safe to run again.

-- ========== 1. Terms on each partner ==========
alter table public.referrers
  add column if not exists started_on date,                                   -- first day of work; the 12-month cliff counts from here
  add column if not exists working_until date,                                -- empty = still working with us
  add column if not exists equity_member_tiers boolean not null default false; -- earns the member-count equity tiers below
update public.referrers set started_on = created_at::date where started_on is null;

-- ========== 2. Member equity tiers: the total equity at each number of paying members ==========
create table if not exists public.member_equity_tiers (
  tier int primary key check (tier between 1 and 10),
  members int not null check (members > 0),
  equity_pct numeric not null check (equity_pct > 0 and equity_pct <= 100)
);
insert into public.member_equity_tiers (tier, members, equity_pct) values (1, 5000, 3), (2, 10000, 4), (3, 50000, 5)
on conflict (tier) do nothing;
alter table public.member_equity_tiers enable row level security;    -- no policies: only the functions below read it
revoke all on public.member_equity_tiers from anon, authenticated;

-- The date each tier was first reached while the partner was still working
create table if not exists public.partner_milestones (
  referrer_code text not null references public.referrers(code) on update cascade on delete cascade,
  tier int not null references public.member_equity_tiers(tier) on delete cascade,
  members_at_reach int not null,
  reached_on date not null,
  primary key (referrer_code, tier)
);
alter table public.partner_milestones enable row level security;
revoke all on public.partner_milestones from anon, authenticated;

-- ========== 3. Paying members and the daily milestone check ==========
create or replace function public._paying_members() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.profiles p where p.role = 'parent' and p.plan_status = 'active' and not p.bonus_excluded
$$;
revoke execute on function public._paying_members() from public, anon, authenticated;

create or replace function public.record_partner_milestones() returns void
language plpgsql security definer set search_path = public as $$
declare n int := public._paying_members(); today date := public.la_today();
begin
  insert into public.partner_milestones (referrer_code, tier, members_at_reach, reached_on)
  select r.code, t.tier, n, today
  from public.referrers r cross join public.member_equity_tiers t
  where r.equity_member_tiers and (r.working_until is null or r.working_until >= today) and n >= t.members
  on conflict (referrer_code, tier) do nothing;
end $$;
revoke execute on function public.record_partner_milestones() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'littlepass-partner-milestones';
select cron.schedule('littlepass-partner-milestones', '30 1 * * *', 'select public.record_partner_milestones()');

-- ========== 4. Admin functions ==========
drop function if exists public.admin_list_referrers();
create function public.admin_list_referrers()
returns table (code text, name text, note text, active boolean, created_at timestamptz, login_email text,
               started_on date, working_until date, equity_member_tiers boolean)
language sql stable security definer set search_path = public as $$
  select r.code, r.name, r.note, r.active, r.created_at, u.email::text, r.started_on, r.working_until, r.equity_member_tiers
  from public.referrers r left join auth.users u on u.id = r.user_id
  where public.is_admin() order by r.created_at
$$;

create or replace function public.admin_set_partner_terms(p_code text, p_started date, p_ended date, p_tiers boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if p_ended is not null and p_started is not null and p_ended < p_started then raise exception 'The end date is before the start date'; end if;
  update public.referrers set started_on = p_started, working_until = p_ended, equity_member_tiers = coalesce(p_tiers, false)
  where code = lower(p_code);
  if not found then raise exception 'Unknown partner code'; end if;
end $$;

create or replace function public.admin_refresh_milestones() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  perform public.record_partner_milestones();
end $$;

create or replace function public.admin_member_tiers() returns table (tier int, members int, equity_pct numeric)
language sql stable security definer set search_path = public as $$
  select t.tier, t.members, t.equity_pct from public.member_equity_tiers t where public.is_admin() order by t.tier
$$;

create or replace function public.admin_partner_milestones() returns table (code text, tier int, members_at_reach int, reached_on date)
language sql stable security definer set search_path = public as $$
  select m.referrer_code, m.tier, m.members_at_reach, m.reached_on from public.partner_milestones m where public.is_admin()
$$;

create or replace function public.admin_paying_members() returns int
language sql stable security definer set search_path = public as $$
  select public._paying_members() where public.is_admin()
$$;

-- ========== 5. Partner dashboard now also carries their terms and milestones ==========
create or replace function public.partner_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare res jsonb := '[]'::jsonb; r record;
begin
  if auth.uid() is null then return null; end if;
  for r in select * from public.referrers where user_id = auth.uid() order by created_at loop
    res := res || jsonb_build_array(jsonb_build_object(
      'code', r.code, 'name', r.name, 'active', r.active,
      'started_on', r.started_on, 'working_until', r.working_until, 'member_tiers', r.equity_member_tiers,
      'members', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public._partner_members(r.code) m),
      'studios', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public._partner_studio_months(r.code) s),
      'payments', (select coalesce(jsonb_agg(jsonb_build_object('amount_cents', x.amount_cents, 'kind', x.kind, 'note', x.note, 'paid_on', x.paid_on)
                                              order by x.paid_on desc, x.created_at desc), '[]'::jsonb)
                   from public.partner_payments x where x.referrer_code = r.code),
      'tiers', case when r.equity_member_tiers
                 then (select coalesce(jsonb_agg(jsonb_build_object('tier', t.tier, 'members', t.members, 'equity_pct', t.equity_pct) order by t.tier), '[]'::jsonb)
                       from public.member_equity_tiers t) else '[]'::jsonb end,
      'milestones', (select coalesce(jsonb_agg(jsonb_build_object('tier', m.tier, 'reached_on', m.reached_on) order by m.tier), '[]'::jsonb)
                     from public.partner_milestones m where m.referrer_code = r.code),
      'paying_members', case when r.equity_member_tiers then public._paying_members() else null end));
  end loop;
  return case when jsonb_array_length(res) = 0 then null else res end;
end $$;

-- ========== 6. Who can run what ==========
revoke execute on function public.admin_list_referrers() from public, anon;
revoke execute on function public.admin_set_partner_terms(text, date, date, boolean) from public, anon;
revoke execute on function public.admin_refresh_milestones() from public, anon;
revoke execute on function public.admin_member_tiers() from public, anon;
revoke execute on function public.admin_partner_milestones() from public, anon;
revoke execute on function public.admin_paying_members() from public, anon;
grant execute on function public.admin_list_referrers() to authenticated;
grant execute on function public.admin_set_partner_terms(text, date, date, boolean) to authenticated;
grant execute on function public.admin_refresh_milestones() to authenticated;
grant execute on function public.admin_member_tiers() to authenticated;
grant execute on function public.admin_partner_milestones() to authenticated;
grant execute on function public.admin_paying_members() to authenticated;
