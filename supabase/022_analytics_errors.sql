-- LittlePass: simple private analytics, app error capture, admin stats, daily summary email
-- Run in Supabase > SQL Editor (after 021). Safe to run again.
-- No cookies and no IP addresses: a visit is a random id that lives only for one browser tab.

-- ========== 1. Visit events (written by the app, read only by the admin) ==========
create table if not exists public.events (
  id bigserial primary key,
  name text not null check (name in ('visit', 'view_studio', 'start_signup', 'start_checkout', 'share')),
  studio_id uuid,
  session text check (char_length(session) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists events_created on public.events (created_at);
alter table public.events enable row level security;
drop policy if exists "anyone logs events" on public.events;
create policy "anyone logs events" on public.events for insert to anon, authenticated with check (true);
revoke all on public.events from anon, authenticated;
grant insert (name, studio_id, session) on public.events to anon, authenticated;   -- can't fake the time or read anything back

-- ========== 2. App errors (crashes in someone's browser) ==========
create table if not exists public.client_errors (
  id bigserial primary key,
  message text not null check (char_length(message) <= 500),
  source text check (char_length(source) <= 300),
  page text check (char_length(page) <= 200),
  user_agent text check (char_length(user_agent) <= 300),
  session text check (char_length(session) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists client_errors_created on public.client_errors (created_at);
alter table public.client_errors enable row level security;
drop policy if exists "anyone reports errors" on public.client_errors;
create policy "anyone reports errors" on public.client_errors for insert to anon, authenticated with check (true);
revoke all on public.client_errors from anon, authenticated;
grant insert (message, source, page, user_agent, session) on public.client_errors to anon, authenticated;

-- Old analytics rows aren't needed forever
create or replace function public.prune_analytics() returns void
language sql security definer set search_path = public as $$
  delete from public.events where created_at < now() - interval '13 months';
  delete from public.client_errors where created_at < now() - interval '90 days';
$$;
revoke execute on function public.prune_analytics() from public, anon, authenticated;

-- ========== 3. Admin stats ==========
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  today date := public.la_today();
  wk0 date := date_trunc('week', today)::date - 7 * 7;    -- Monday, 8 weeks ago
  cv numeric; mg numeric;
  cap bigint; booked bigint;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  select credit_value_cents, margin_pct into cv, mg from public.pricing_settings where id = 1;

  -- seats and bookings over the next 14 days (cancelled sessions don't count)
  select coalesce(sum(sl.capacity), 0) into cap
    from public.class_slots sl join public.classes c on c.id = sl.class_id join public.studios s on s.id = c.studio_id
    cross join generate_series(today, today + 13, interval '1 day') d
   where sl.active and s.status = 'approved' and extract(dow from d)::int = sl.dow
     and not exists (select 1 from public.slot_exceptions e where e.slot_id = sl.id and e.session_date = d::date);
  select count(*) into booked from public.bookings where session_date between today and today + 13;

  return jsonb_build_object(
    'now', jsonb_build_object(
      'parents', (select count(*) from public.profiles where role = 'parent'),
      'subscribers', (select count(*) from public.profiles where role = 'parent' and plan_status in ('active', 'trialing', 'past_due')),
      'past_due', (select count(*) from public.profiles where role = 'parent' and plan_status = 'past_due'),
      'mrr_cents', (select coalesce(sum(pl.price_cents), 0) from public.profiles p join public.plans pl on pl.id = p.plan
                     where p.role = 'parent' and p.plan_status in ('active', 'trialing', 'past_due')),
      'by_plan', (select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb) from (select coalesce(p.plan, 'unknown') as plan, count(*) n from public.profiles p
                   where p.role = 'parent' and p.plan_status in ('active', 'trialing', 'past_due') group by 1) x),
      'studios_live', (select count(*) from public.studios where status = 'approved'),
      'studios_pending', (select count(*) from public.studios where status = 'pending'),
      'upcoming_bookings', booked,
      'seats_next_14', cap,
      'waitlist', (select count(*) from public.waitlist where session_date >= today),
      'credits_outstanding', (select coalesce(sum(credits), 0) from public.profiles where role = 'parent'),
      'credits_outstanding_cost_cents', (select round(coalesce(sum(credits), 0) * cv * (1 - mg / 100)) from public.profiles where role = 'parent'),
      'owed_to_studios_cents', (select coalesce(sum(price_cents), 0) from public.bookings where payout_id is null and session_date < today)),
    'weeks', (select jsonb_agg(jsonb_build_object(
        'week', w::date,
        'visits', (select count(distinct session) from public.events e where e.name = 'visit'
                    and (e.created_at at time zone 'America/Los_Angeles')::date between w::date and w::date + 6),
        'new_parents', (select count(*) from public.profiles p join auth.users u on u.id = p.id where p.role = 'parent'
                    and (u.created_at at time zone 'America/Los_Angeles')::date between w::date and w::date + 6),
        'bookings', (select count(*) from public.credit_ledger l where l.ref like 'booking:%'
                    and (l.created_at at time zone 'America/Los_Angeles')::date between w::date and w::date + 6),
        'cancellations', (select count(*) from public.credit_ledger l where l.ref like 'refund:%'
                    and (l.created_at at time zone 'America/Los_Angeles')::date between w::date and w::date + 6)) order by w)
        from generate_series(wk0, date_trunc('week', today)::date, interval '7 days') w),
    'funnel_30d', jsonb_build_object(
      'visits', (select count(distinct session) from public.events where name = 'visit' and created_at > now() - interval '30 days'),
      'viewed_studio', (select count(distinct session) from public.events where name = 'view_studio' and created_at > now() - interval '30 days'),
      'started_signup', (select count(distinct session) from public.events where name = 'start_signup' and created_at > now() - interval '30 days'),
      'signed_up', (select count(*) from public.profiles p join auth.users u on u.id = p.id where p.role = 'parent' and u.created_at > now() - interval '30 days'),
      'started_checkout', (select count(distinct session) from public.events where name = 'start_checkout' and created_at > now() - interval '30 days'),
      'subscribed', (select count(*) from public.profiles where role = 'parent' and plan_started_at > now() - interval '30 days'),
      'booked', (select count(distinct user_id) from public.credit_ledger where ref like 'booking:%' and created_at > now() - interval '30 days')),
    'top_classes_30d', (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (
        select b.class_title as title, s.name as studio, count(*) n from public.bookings b join public.studios s on s.id = b.studio_id
         where b.created_at > now() - interval '30 days' group by b.class_title, s.name order by count(*) desc limit 5) x),
    'top_studios_viewed_30d', (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (
        select s.name as studio, count(distinct e.session) n from public.events e join public.studios s on s.id = e.studio_id
         where e.name = 'view_studio' and e.created_at > now() - interval '30 days' group by s.name order by 2 desc limit 5) x),
    'errors_7d', (select count(*) from public.client_errors where created_at > now() - interval '7 days'),
    'recent_errors', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select message, count(*) n, max(created_at) last_seen, max(page) page from public.client_errors
         where created_at > now() - interval '7 days' group by message order by max(created_at) desc limit 10) x),
    'failed_emails_7d', (select count(*) from net._http_response where created > now() - interval '7 days' and (status_code is null or status_code >= 300)));
end $$;
revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

-- ========== 4. Morning summary email to the admin ==========
create or replace function public.send_daily_summary() returns void
language plpgsql security definer set search_path = public as $$
declare y date := public.la_today() - 1; d jsonb;
begin
  perform public.prune_analytics();
  d := jsonb_build_object(
    'day', y,
    'visits', (select count(distinct session) from public.events where name = 'visit' and (created_at at time zone 'America/Los_Angeles')::date = y),
    'new_parents', (select count(*) from public.profiles p join auth.users u on u.id = p.id where p.role = 'parent' and (u.created_at at time zone 'America/Los_Angeles')::date = y),
    'new_subscribers', (select count(*) from public.profiles where role = 'parent' and (plan_started_at at time zone 'America/Los_Angeles')::date = y),
    'bookings', (select count(*) from public.credit_ledger where ref like 'booking:%' and (created_at at time zone 'America/Los_Angeles')::date = y),
    'cancellations', (select count(*) from public.credit_ledger where ref like 'refund:%' and (created_at at time zone 'America/Los_Angeles')::date = y),
    'subscribers', (select count(*) from public.profiles where role = 'parent' and plan_status in ('active', 'trialing', 'past_due')),
    'past_due', (select count(*) from public.profiles where role = 'parent' and plan_status = 'past_due'),
    'studios_pending', (select count(*) from public.studios where status = 'pending'),
    'reports_open', (select count(*) from public.reports where not resolved),
    'today_bookings', (select count(*) from public.bookings where session_date = y + 1),
    'errors', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select message, count(*) n, max(page) page from public.client_errors where created_at > now() - interval '24 hours'
         group by message order by count(*) desc limit 8) x),
    'failed_emails', (select count(*) from net._http_response where created > now() - interval '24 hours' and (status_code is null or status_code >= 300)));
  perform public.send_email_event('daily_summary', d);
end $$;
revoke execute on function public.send_daily_summary() from public, anon, authenticated;

-- Every day at 15:00 UTC = 8am in San Diego (7am in winter)
select cron.unschedule(jobid) from cron.job where jobname = 'littlepass-daily-summary';
select cron.schedule('littlepass-daily-summary', '0 15 * * *', 'select public.send_daily_summary()');
