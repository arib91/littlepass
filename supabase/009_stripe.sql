-- LittlePass: Stripe subscriptions
-- Run in Supabase > SQL Editor (after 008). Safe to run again.

-- ========== 1. Plans live in the database (and each maps to a Stripe price) ==========
create table if not exists public.plans (
  id text primary key,
  name text not null,
  price_cents int not null check (price_cents > 0),
  credits int not null check (credits > 0),
  perks text[] not null default '{}',
  popular boolean not null default false,
  active boolean not null default true,
  stripe_price_id text,
  sort int not null default 0
);
alter table public.plans enable row level security;
drop policy if exists "plans read" on public.plans;
create policy "plans read" on public.plans for select using (active or public.is_admin());

insert into public.plans (id, name, price_cents, credits, perks, popular, sort) values
  ('sprout', 'Sprout', 4900, 12,  array['About 3 classes a month', 'Free cancellation up to 24h before', 'Unused credits roll over'], false, 1),
  ('bloom',  'Bloom',  8900, 25,  array['About 6 classes a month', 'Free cancellation up to 24h before', 'Unused credits roll over'], true, 2),
  ('grove',  'Grove',  14900, 45, array['About 11 classes a month', 'Free cancellation up to 24h before', 'Unused credits roll over'], false, 3)
on conflict (id) do update set perks = excluded.perks;

-- ========== 2. Subscription state on each parent ==========
alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists plan_status text,
  add column if not exists plan_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

-- ========== 3. Credit history (also prevents double-crediting the same payment) ==========
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta int not null,
  reason text not null,
  ref text unique,
  created_at timestamptz not null default now()
);
alter table public.credit_ledger enable row level security;
drop policy if exists "own ledger" on public.credit_ledger;
create policy "own ledger" on public.credit_ledger for select using (user_id = auth.uid());

-- ========== 4. Functions only the Stripe webhook can run ==========
-- Adds a plan's monthly credits once per invoice. Rollover: balance can grow up to 2x the plan's credits.
create or replace function public.grant_plan_credits(p_user uuid, p_plan text, p_credits int, p_ref text) returns boolean
language plpgsql security definer set search_path = public as $$
declare old_c int; new_c int;
begin
  if exists (select 1 from public.credit_ledger where ref = p_ref) then return false; end if;
  select credits into old_c from public.profiles where id = p_user;
  if old_c is null then raise exception 'Unknown user'; end if;
  new_c := greatest(old_c, least(old_c + p_credits, 2 * p_credits));
  insert into public.credit_ledger (user_id, delta, reason, ref)
  values (p_user, new_c - old_c, 'Monthly credits: ' || p_plan, p_ref);
  update public.profiles set credits = new_c, plan = p_plan where id = p_user;
  return true;
end $$;

create or replace function public.set_subscription(p_user uuid, p_customer text, p_sub text, p_plan text,
  p_status text, p_period_end timestamptz, p_cancel boolean) returns void
language plpgsql security definer set search_path = public as $$
declare cur int; cur_sub text;
begin
  select credits, stripe_subscription_id into cur, cur_sub from public.profiles where id = p_user;
  if not found then raise exception 'Unknown user'; end if;
  if p_status in ('canceled', 'incomplete_expired') then
    if cur_sub is null or cur_sub = p_sub then
      if cur > 0 and not exists (select 1 from public.credit_ledger where ref = 'end:' || p_sub) then
        insert into public.credit_ledger (user_id, delta, reason, ref)
        values (p_user, -cur, 'Credits expired: subscription ended', 'end:' || p_sub);
        update public.profiles set credits = 0 where id = p_user;
      end if;
      update public.profiles set plan = null, plan_status = 'canceled', stripe_subscription_id = null,
        plan_period_end = null, cancel_at_period_end = false,
        stripe_customer_id = coalesce(p_customer, stripe_customer_id) where id = p_user;
    end if;
    return;
  end if;
  update public.profiles set stripe_customer_id = p_customer, stripe_subscription_id = p_sub,
    plan = coalesce(p_plan, plan), plan_status = p_status, plan_period_end = p_period_end,
    cancel_at_period_end = p_cancel where id = p_user;
end $$;

revoke execute on function public.grant_plan_credits(uuid, text, int, text) from public, anon, authenticated;
revoke execute on function public.set_subscription(uuid, text, text, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.grant_plan_credits(uuid, text, int, text) to service_role;
grant execute on function public.set_subscription(uuid, text, text, text, text, timestamptz, boolean) to service_role;

-- ========== 5. Remove the free demo credits (anyone could give themselves credits) ==========
drop function if exists public.demo_choose_plan(text);
