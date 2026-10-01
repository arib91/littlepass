// Edge Function: delete-account
// Lets a logged-in parent or studio delete their own account.
// Deploy with "Verify JWT" turned OFF: the function checks the login itself.
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
    const url = Deno.env.get('SUPABASE_URL')!;
    const authed = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ error: 'Please log in first.' }, 401);

    const { confirm } = await req.json().catch(() => ({}));
    if (confirm !== 'DELETE') return json({ error: 'Please type DELETE to confirm.' }, 400);

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: prof } = await db.from('profiles').select('role, stripe_customer_id').eq('id', user.id).maybeSingle();
    if (prof?.role === 'admin') return json({ error: 'Admin accounts can\'t be deleted from the app.' }, 403);

    if (prof?.role === 'studio') {
      // Refuses (with a plain-English reason) while there are upcoming bookings or unpaid earnings
      const { data: r, error } = await db.rpc('prepare_studio_closure', { p_user: user.id });
      if (error) throw error;
      if (!r.ok) return json({ error: r.reason }, 409);
      if (Array.isArray(r.paths) && r.paths.length) await db.storage.from('studio-photos').remove(r.paths);
    } else {
      // Deleting the Stripe customer also ends their subscription immediately, so nobody is charged again
      if (prof?.stripe_customer_id) {
        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() });
        try { await stripe.customers.del(prof.stripe_customer_id); }
        catch (e) {
          if ((e as { code?: string }).code !== 'resource_missing') {
            console.error('Stripe delete failed', e);
            return json({ error: 'We couldn\'t cancel your subscription just now, so your account was not deleted. Please try again, or contact us.' }, 502);
          }
        }
      }
      const { error } = await db.rpc('anonymize_user_data', { p_user: user.id });
      if (error) throw error;
    }

    const { error: delErr } = await db.auth.admin.deleteUser(user.id);
    if (delErr) throw delErr;
    return json({ ok: true });
  } catch (e) {
    console.error('delete-account error', e);
    return json({ error: 'Something went wrong. Nothing was lost. Please try again.' }, 500);
  }
});
