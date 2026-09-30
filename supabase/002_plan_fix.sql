-- Fix: plans could be chosen repeatedly for unlimited credits.
-- Run in Supabase > SQL Editor. Safe to run once.

alter table public.profiles add column if not exists plan_started_at timestamptz;

drop function if exists public.demo_choose_plan(text, int);

-- Demo only (no payment yet): grants a plan's credits once per 30 days.
-- Upgrading mid-month grants only the difference. Replace with Stripe before launch.
create function public.demo_choose_plan(p_plan text) returns void
language plpgsql security definer set search_path = public as $$
declare new_c int; old_c int; p public.profiles;
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  new_c := case p_plan when 'sprout' then 12 when 'bloom' then 25 when 'grove' then 45 end;
  if new_c is null then raise exception 'Invalid plan'; end if;
  select * into p from public.profiles where id = auth.uid();
  if p.role <> 'parent' then raise exception 'Only parent accounts can choose a plan'; end if;
  if p.plan = p_plan and p.plan_started_at > now() - interval '30 days' then
    raise exception 'You are already on the % plan. Credits renew monthly.', p_plan;
  end if;
  old_c := case when p.plan_started_at > now() - interval '30 days'
    then case p.plan when 'sprout' then 12 when 'bloom' then 25 when 'grove' then 45 else 0 end
    else 0 end;
  update public.profiles set
    plan = p_plan,
    plan_started_at = case when old_c > 0 then plan_started_at else now() end,
    credits = credits + greatest(new_c - old_c, 0)
  where id = auth.uid();
end $$;

grant execute on function public.demo_choose_plan(text) to authenticated;
