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
    if (!p || !p.stripe_price_id) return json({ error: 'This plan is not available yet.' }, 400);

    const { data: prof } = await db.from('profiles')
      .select('role, stripe_customer_id, plan_status').eq('id', user.id).single();
    if (!prof || prof.role !== 'parent') return json({ error: 'Only parent accounts can subscribe.' }, 403);
    if (['active', 'trialing', 'past_due'].includes(prof.plan_status ?? '')) {
      return json({ error: 'You already have a subscription. Use "Manage subscription" to change it.' }, 400);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: p.stripe_price_id, quantity: 1 }],
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
