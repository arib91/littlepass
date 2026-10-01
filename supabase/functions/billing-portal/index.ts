// Edge Function: billing-portal
// Opens Stripe's customer portal (change plan, update card, cancel) for the logged-in parent.
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
    const { data: prof } = await db.from('profiles').select('stripe_customer_id').eq('id', user.id).single();
    if (!prof?.stripe_customer_id) return json({ error: 'No subscription found.' }, 400);

    const session = await stripe.billingPortal.sessions.create({
      customer: prof.stripe_customer_id,
      return_url: `${site}/?checkout=portal`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
