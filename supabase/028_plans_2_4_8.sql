-- LittlePass: plans by number of classes (2, 4 and 8 a month) and a half-price first month
-- Run in Supabase > SQL Editor (after 027). Safe to run again.
-- Credits: a typical $30 class costs 12 credits, so 24 / 48 / 96 credits buy about 2 / 4 / 8 classes.
-- The Stripe price for each plan is created automatically at the next checkout (see create-checkout), so the old ones are cleared here.

update public.plans set price_cents = 7900,  credits = 24, stripe_price_id = null, active = true,
  perks = array['About 2 classes a month', 'Free cancellation up to 24h before', 'Unused credits roll over'] where id = 'sprout';
update public.plans set price_cents = 14900, credits = 48, stripe_price_id = null, active = true,
  perks = array['About 4 classes a month', 'Free cancellation up to 24h before', 'Unused credits roll over'] where id = 'bloom';
update public.plans set price_cents = 28900, credits = 96, stripe_price_id = null, active = true,
  perks = array['About 8 classes a month', 'Free cancellation up to 24h before', 'Unused credits roll over'] where id = 'grove';

-- The half-price first month is for people who have never paid an invoice. Visitors who are not logged in count as new.
create or replace function public.first_month_eligible() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.credit_ledger l where l.user_id = auth.uid() and l.ref like 'in\_%')
$$;
revoke execute on function public.first_month_eligible() from public;
grant execute on function public.first_month_eligible() to anon, authenticated;
