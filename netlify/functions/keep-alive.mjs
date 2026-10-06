// Netlify Scheduled Function: one tiny database read every day, from outside Supabase.
// Supabase's free plan pauses a project after about a week without database requests; this keeps it awake.
// (Not needed once the project is on Supabase Pro, but harmless.)
const SB_URL = 'https://nktwkktslnvredjkqzjq.supabase.co';
const SB_KEY = 'sb_publishable_943cWL3ht_oICvddIanYGw_moFzaMnh'; // publishable key: read-only, same as in app.js

export default async () => {
  const res = await fetch(`${SB_URL}/rest/v1/plans?select=id&limit=1`, { headers: { apikey: SB_KEY } });
  console.log(`keep-alive: database answered ${res.status}`);
  return new Response(null, { status: res.ok ? 200 : 502 });
};

export const config = { schedule: '@daily' };
