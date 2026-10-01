-- Fix: a new subscriber must always receive the plan's full credits.
-- The rollover cap (2x plan credits) now applies only to monthly renewals.
-- Run in Supabase > SQL Editor. Safe to run again.

drop function if exists public.grant_plan_credits(uuid, text, int, text);

create or replace function public.grant_plan_credits(p_user uuid, p_plan text, p_credits int, p_ref text, p_first boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare old_c int; new_c int;
begin
  if exists (select 1 from public.credit_ledger where ref = p_ref) then return false; end if;
  select credits into old_c from public.profiles where id = p_user;
  if old_c is null then raise exception 'Unknown user'; end if;
  new_c := case when p_first then old_c + p_credits
                else greatest(old_c, least(old_c + p_credits, 2 * p_credits)) end;
  insert into public.credit_ledger (user_id, delta, reason, ref)
  values (p_user, new_c - old_c, 'Monthly credits: ' || p_plan, p_ref);
  update public.profiles set credits = new_c, plan = p_plan where id = p_user;
  return true;
end $$;

revoke execute on function public.grant_plan_credits(uuid, text, int, text, boolean) from public, anon, authenticated;
grant execute on function public.grant_plan_credits(uuid, text, int, text, boolean) to service_role;

-- One-time correction for first payments that were recorded with 0 credits
do $$
declare r record; plan_credits int;
begin
  for r in select * from public.credit_ledger
           where delta = 0 and reason like 'Monthly credits: %' and ref like 'in\_%' loop
    select credits into plan_credits from public.plans where id = replace(r.reason, 'Monthly credits: ', '');
    if plan_credits is null then continue; end if;
    insert into public.credit_ledger (user_id, delta, reason, ref)
    values (r.user_id, plan_credits, 'Correction: first-month credits', 'fix:' || r.ref)
    on conflict (ref) do nothing;
    if found then
      update public.profiles set credits = credits + plan_credits where id = r.user_id;
    end if;
  end loop;
end $$;
