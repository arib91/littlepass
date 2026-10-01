// Edge Function: stripe-webhook
// Receives Stripe's events and keeps subscriptions and credits in sync.
// IMPORTANT: deploy this one with "Verify JWT" turned OFF (Stripe doesn't send a login token).
import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function syncSubscription(subId: string) {
  // Always re-fetch from Stripe so we read a consistent, current copy
  const sub = await stripe.subscriptions.retrieve(subId);
  const userId = sub.metadata?.user_id;
  if (!userId) { console.log('Subscription without user_id, ignoring', subId); return null; }
  const priceId = sub.items.data[0]?.price?.id;
  const { data: plan } = priceId
    ? await db.from('plans').select('*').eq('stripe_price_id', priceId).maybeSingle()
    : { data: null };
  const { error } = await db.rpc('set_subscription', {
    p_user: userId,
    p_customer: String(sub.customer),
    p_sub: sub.id,
    p_plan: plan?.id ?? null,
    p_status: sub.status,
    p_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    p_cancel: sub.cancel_at_period_end,
  });
  if (error) throw error;
  return { userId, plan };
}

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig ?? '', Deno.env.get('STRIPE_WEBHOOK_SECRET')!, undefined, cryptoProvider);
  } catch (e) {
    console.error('Bad signature', (e as Error).message);
    return new Response('Bad signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription((event.data.object as Stripe.Subscription).id);
        break;

      case 'invoice.paid': {
        const inv = await stripe.invoices.retrieve((event.data.object as Stripe.Invoice).id);
        if (!inv.subscription) break;
        const synced = await syncSubscription(String(inv.subscription));
        // New credits only for the first payment and each monthly renewal (not plan-change proration)
        if (!synced || !synced.plan) break;
        if (!['subscription_create', 'subscription_cycle'].includes(inv.billing_reason ?? '')) break;
        const { error } = await db.rpc('grant_plan_credits', {
          p_user: synced.userId, p_plan: synced.plan.id, p_credits: synced.plan.credits, p_ref: inv.id,
        });
        if (error) throw error;
        break;
      }
    }
  } catch (e) {
    console.error('Webhook error', event.type, e);
    return new Response('Error', { status: 500 }); // Stripe will retry
  }
  return new Response('ok');
});
