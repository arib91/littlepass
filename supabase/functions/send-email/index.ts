// Edge Function: send-email
// Called by the database (not by browsers). Builds and sends notification emails through Resend.
// Deploy with "Verify JWT" turned OFF. Calls are protected by a shared secret kept in the database.
//
// Secrets needed: RESEND_API_KEY, ADMIN_EMAIL
// Optional:       FROM_EMAIL (default: LittlePass <onboarding@resend.dev>), EMAIL_TEST_MODE ("false" to send to real recipients), SITE_URL
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const FROM = Deno.env.get('FROM_EMAIL') ?? 'LittlePass <onboarding@resend.dev>';
const ADMIN = Deno.env.get('ADMIN_EMAIL') ?? '';
const SITE = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');
// While testing, every email goes to ADMIN_EMAIL instead of the real recipient
const TEST = (Deno.env.get('EMAIL_TEST_MODE') ?? 'true') !== 'false';

// Each run records what it did, so a skipped email is never silent
const trace: string[] = [];

const esc = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const day = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const time12 = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };

function layout(title: string, inner: string, button?: { label: string; url: string }) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fffaf5;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #efe7df;border-radius:18px;padding:28px">
    <div style="font-size:20px;font-weight:800">🐣 Little<span style="color:#ff7a59">Pass</span></div>
    <h2 style="margin:18px 0 8px;font-size:20px;color:#2d2a32">${esc(title)}</h2>
    <div style="font-size:15px;line-height:1.6;color:#2d2a32">${inner}</div>
    ${button ? `<p style="margin:22px 0 0"><a href="${esc(button.url)}" style="background:#ff7a59;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px;display:inline-block">${esc(button.label)}</a></p>` : ''}
  </div>
  <p style="text-align:center;color:#7a7483;font-size:12px;margin-top:14px">LittlePass San Diego</p></div>`;
}

async function send(to: string | undefined, subject: string, html: string) {
  if (!to) { trace.push(`SKIPPED "${subject}": no recipient address found`); return; }
  const realTo = TEST ? ADMIN : to;
  const subj = TEST ? `[TEST → ${to}] ${subject}` : subject;
  if (!realTo) { trace.push(`SKIPPED "${subject}": ADMIN_EMAIL is empty`); return; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [realTo], subject: subj, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  trace.push(`SENT "${subject}" (Resend accepted: ${(await res.json()).id})`);
}

const emailOf = async (userId?: string | null) => {
  if (!userId) return undefined;
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error) trace.push(`lookup failed for user ${userId}: ${error.message}`);
  return data?.user?.email ?? undefined;
};

async function handle(event: string, data: Record<string, string>) {
  if (event === 'studio_signup') {
    const { data: s } = await db.from('studios').select('*').eq('id', data.studio_id).single();
    if (!s) { trace.push('studio_signup: studio not found'); return; }
    const { data: p } = await db.from('profiles').select('display_name').eq('id', s.owner_id).maybeSingle();
    await send(ADMIN, `New studio waiting for approval: ${s.name}`, layout('A new studio signed up',
      `<p><b>${esc(s.name)}</b> is waiting for your approval.</p><p>Owner: ${esc(p?.display_name ?? '')} (${esc(await emailOf(s.owner_id) ?? '')})</p>${s.blurb ? `<p style="color:#7a7483">${esc(s.blurb)}</p>` : ''}`,
      { label: 'Review studio', url: SITE }));
  }

  if (event === 'studio_status') {
    const { data: s } = await db.from('studios').select('*').eq('id', data.studio_id).single();
    if (!s || !s.owner_id) return;
    const to = await emailOf(s.owner_id);
    if (s.status === 'approved') {
      await send(to, `${s.name} is approved on LittlePass 🎉`, layout('You\'re approved! 🎉',
        `<p>Great news: <b>${esc(s.name)}</b> is now live. Parents in San Diego can find your classes and book them.</p><p>Log in to check your schedule, add photos and see bookings as they come in.</p>`,
        { label: 'Open your dashboard', url: SITE }));
    } else if (s.status === 'rejected') {
      await send(to, `An update on ${s.name}`, layout('We couldn\'t approve your studio yet',
        `<p>Thanks for applying with <b>${esc(s.name)}</b>. We're not able to approve it right now.</p>${s.status_note ? `<p><b>Reason:</b> ${esc(s.status_note)}</p>` : ''}<p>If you think this is a mistake or you've made changes, just reply to this email.</p>`));
    }
  }

  if (event === 'booking_created') {
    const { data: b } = await db.from('bookings').select('*').eq('id', data.booking_id).single();
    if (!b) { trace.push('booking_created: booking not found'); return; }
    const [{ data: st }, { data: loc }, { data: pr }] = await Promise.all([
      db.from('studios').select('name, owner_id').eq('id', b.studio_id).single(),
      b.class_id ? db.from('class_locations').select('address').eq('class_id', b.class_id).maybeSingle() : Promise.resolve({ data: null }),
      db.from('pricing_settings').select('cancel_hours').eq('id', 1).single(),
    ]);
    const when = `${day(b.session_date)} at ${time12(b.session_time)}`;
    const addr = loc?.address as string | undefined;
    const maps = addr ? `<p>📍 ${esc(addr)}<br><a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}">Google Maps</a> · <a href="https://maps.apple.com/?daddr=${encodeURIComponent(addr)}">Apple Maps</a></p>` : '';
    await send(await emailOf(b.user_id), `You're booked: ${b.class_title}`, layout('You\'re booked! 🎉',
      `<p><b>${esc(b.class_title)}</b> with ${esc(st?.name)}</p><p>🗓 ${esc(when)}<br>👶 ${esc(b.attendee_name)}<br>⭐ ${b.credits} credits</p>${maps}<p style="color:#7a7483">Free cancellation up to ${pr?.cancel_hours ?? 24} hours before the class starts.</p>`,
      { label: 'See my classes', url: SITE }));
    await send(await emailOf(st?.owner_id), `New booking: ${b.class_title}`, layout('New booking 🙌',
      `<p><b>${esc(b.attendee_name)}</b> (parent: ${esc(b.parent_name)}) booked <b>${esc(b.class_title)}</b>.</p><p>🗓 ${esc(when)}</p>`,
      { label: 'See your bookings', url: SITE }));
  }

  if (event === 'report_created') {
    const { data: r } = await db.from('reports').select('*').eq('id', data.report_id).single();
    if (!r) return;
    await send(ADMIN, `Reported ${r.kind} needs a look`, layout('Something was reported',
      `<p>A parent reported a <b>${esc(r.kind)}</b>.</p>${r.reason ? `<p>“${esc(r.reason)}”</p>` : ''}`, { label: 'Open reports', url: SITE }));
  }
}

Deno.serve(async (req) => {
  try {
    const { data: settings } = await db.from('email_settings').select('hook_secret').eq('id', 1).single();
    if (!settings || req.headers.get('x-hook-secret') !== settings.hook_secret) return new Response('Unauthorized', { status: 401 });
    const { event, data } = await req.json();
    await handle(event, data ?? {});
    console.log(trace.join(' | '));
    return new Response(JSON.stringify(trace));
  } catch (e) {
    console.error('send-email error', e);
    return new Response(JSON.stringify([...trace, `ERROR: ${(e as Error).message}`]), { status: 500 });
  }
});
