-- LittlePass: delete my account / download my data
-- Run in Supabase > SQL Editor (after 017). Safe to run again.

-- ========== 1. Records survive an account deletion, anonymised ==========
alter table public.bookings alter column user_id drop not null;
alter table public.bookings drop constraint if exists bookings_user_id_fkey;
alter table public.bookings add constraint bookings_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.reviews alter column user_id drop not null;
alter table public.reviews drop constraint if exists reviews_user_id_fkey;
alter table public.reviews add constraint reviews_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- a closed studio stays in our records (payouts, bookings) but is hidden
alter table public.studios drop constraint if exists studios_status_check;
alter table public.studios add constraint studios_status_check
  check (status in ('pending', 'approved', 'rejected', 'closed'));

-- ========== 2. Parent: cancel upcoming bookings, remove names from the rest ==========
create or replace function public.anonymize_user_data(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  for b in select id from public.bookings where user_id = p_user and session_date >= public.la_today() loop
    perform public.refund_booking(b.id, 'account_deleted');
  end loop;
  update public.bookings set parent_name = 'Former member', attendee_name = 'Child' where user_id = p_user;
  update public.reviews set author = 'Former member' where user_id = p_user;
end $$;

-- ========== 3. Studio: only close when nothing is pending, then hide it ==========
create or replace function public.prepare_studio_closure(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st public.studios; upcoming int; owed bigint; paths jsonb;
begin
  select * into st from public.studios where owner_id = p_user;
  if not found then return jsonb_build_object('ok', true, 'paths', '[]'::jsonb); end if;
  select count(*) into upcoming from public.bookings where studio_id = st.id and session_date >= public.la_today();
  if upcoming > 0 then
    return jsonb_build_object('ok', false, 'reason',
      format('You have %s upcoming booking%s. Cancel those sessions first (parents are refunded automatically), then try again.',
             upcoming, case when upcoming = 1 then '' else 's' end));
  end if;
  select coalesce(sum(b.price_cents), 0) into owed
  from public.bookings b left join public.payouts p on p.id = b.payout_id
  where b.studio_id = st.id and b.session_date < public.la_today() and (b.payout_id is null or p.status <> 'paid');
  if owed > 0 then
    return jsonb_build_object('ok', false, 'reason',
      format('We still owe you $%s for completed classes. Please email us so we can settle your final payout before you close your account.',
             to_char(owed / 100.0, 'FM999990.00')));
  end if;
  select coalesce(jsonb_agg(path), '[]'::jsonb) into paths from public.studio_photos where studio_id = st.id;
  delete from public.studio_photos where studio_id = st.id;
  delete from public.studio_contacts where studio_id = st.id;
  delete from public.classes where studio_id = st.id;      -- slots and addresses go with them
  update public.studios set status = 'closed', owner_id = null, blurb = null, status_note = null,
         name = 'Closed studio ' || left(st.id::text, 8) where id = st.id;
  return jsonb_build_object('ok', true, 'paths', paths);
end $$;

revoke execute on function public.anonymize_user_data(uuid) from public, anon, authenticated;
revoke execute on function public.prepare_studio_closure(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_user_data(uuid) to service_role;
grant execute on function public.prepare_studio_closure(uuid) to service_role;

-- ========== 4. Late Stripe messages for a deleted account are ignored instead of failing ==========
create or replace function public.set_subscription(p_user uuid, p_customer text, p_sub text, p_plan text,
  p_status text, p_period_end timestamptz, p_cancel boolean) returns void
language plpgsql security definer set search_path = public as $$
declare cur int; cur_sub text;
begin
  select credits, stripe_subscription_id into cur, cur_sub from public.profiles where id = p_user;
  if not found then return; end if;  -- the account was deleted
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

create or replace function public.grant_plan_credits(p_user uuid, p_plan text, p_credits int, p_ref text,
  p_first boolean default false, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare old_c int; new_c int;
begin
  if exists (select 1 from public.credit_ledger where ref = p_ref) then return false; end if;
  select credits into old_c from public.profiles where id = p_user;
  if old_c is null then return false; end if;  -- the account was deleted
  new_c := case when p_first then old_c + p_credits
                else greatest(old_c, least(old_c + p_credits, 2 * p_credits)) end;
  insert into public.credit_ledger (user_id, delta, reason, ref)
  values (p_user, new_c - old_c, coalesce(p_reason, 'Monthly credits: ' || p_plan), p_ref);
  update public.profiles set credits = new_c, plan = p_plan where id = p_user;
  return true;
end $$;
