// Edge Function: create-checkout
// Starts a Stripe Checkout (subscription) for the logged-in parent.
import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// The Stripe price for a plan is created on first use and saved on the plan, so a price change in the database needs no Stripe dashboard work.
async function priceFor(stripe: Stripe, db: ReturnType<typeof createClient>, p: { id: string; name: string; price_cents: number; stripe_price_id: string | null }): Promise<string> {
  if (p.stripe_price_id) {
    try {
      const old = await stripe.prices.retrieve(p.stripe_price_id);
      if (old.active && old.unit_amount === p.price_cents && old.currency === 'usd' && old.recurring?.interval === 'month') return old.id;
    } catch (_e) { /* fall through and make a new price */ }
  }
  const made = await stripe.prices.create({
    currency: 'usd', unit_amount: p.price_cents, recurring: { interval: 'month' },
    product_data: { name: `LittlePass ${p.name}` }, metadata: { plan_id: p.id },
  });
  await db.from('plans').update({ stripe_price_id: made.id }).eq('id', p.id);
  return made.id;
}

// 50% off the first invoice, once. Created the first time it is needed.
const FIRST_MONTH_COUPON = 'littlepass-first-month-50';
async function firstMonthCoupon(stripe: Stripe): Promise<string> {
  try {
    await stripe.coupons.retrieve(FIRST_MONTH_COUPON);
  } catch (_e) {
    try {
      await stripe.coupons.create({ id: FIRST_MONTH_COUPON, percent_off: 50, duration: 'once', name: 'First month half price' });
    } catch (e2) {
      if ((e2 as { code?: string }).code !== 'resource_already_exists') throw e2;
    }
  }
  return FIRST_MONTH_COUPON;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() });
    const site = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');
    const url = Deno.env.get('SUPABASE_URL')!;

    const authed = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ error: 'Please log in first.' }, 401);

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { plan } = await req.json();
    const { data: p } = await db.from('plans').select('*').eq('id', plan).eq('active', true).maybeSingle();
    if (!p) return json({ error: 'This plan is not available yet.' }, 400);

    const { data: prof } = await db.from('profiles')
      .select('role, stripe_customer_id, plan_status').eq('id', user.id).single();
    if (!prof || prof.role !== 'parent') return json({ error: 'Only parent accounts can subscribe.' }, 403);
    if (['active', 'trialing', 'past_due'].includes(prof.plan_status ?? '')) {
      return json({ error: 'You already have a subscription. Use "Manage subscription" to change it.' }, 400);
    }

    // Half price for the first month, only for people who have never paid an invoice.
    const { count: paidBefore } = await db.from('credit_ledger').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).like('ref', 'in\\_%');
    const firstMonth = (paidBefore ?? 0) === 0;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: await priceFor(stripe, db, p), quantity: 1 }],
      ...(firstMonth ? { discounts: [{ coupon: await firstMonthCoupon(stripe) }] } : {}),
      client_reference_id: user.id,
      ...(prof.stripe_customer_id ? { customer: prof.stripe_customer_id } : { customer_email: user.email }),
      subscription_data: { metadata: { user_id: user.id } },
      success_url: `${site}/?checkout=success`,
      cancel_url: `${site}/?checkout=cancel`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
