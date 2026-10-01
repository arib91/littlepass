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
    const [{ data: st }, { data: loc }, { data: pr }, { data: ct }] = await Promise.all([
      db.from('studios').select('name, owner_id').eq('id', b.studio_id).single(),
      b.class_id ? db.from('class_locations').select('address').eq('class_id', b.class_id).maybeSingle() : Promise.resolve({ data: null }),
      db.from('pricing_settings').select('cancel_hours').eq('id', 1).single(),
      db.from('studio_contacts').select('phone, website, arrival_notes').eq('studio_id', b.studio_id).maybeSingle(),
    ]);
    const when = `${day(b.session_date)} at ${time12(b.session_time)}`;
    const contact = ct && (ct.phone || ct.website || ct.arrival_notes)
      ? `<p>${ct.phone ? `📞 ${esc(ct.phone)}<br>` : ''}${ct.website ? `🌐 <a href="${esc(ct.website)}">${esc(ct.website)}</a><br>` : ''}${ct.arrival_notes ? `📝 ${esc(ct.arrival_notes)}` : ''}</p>` : '';
    const addr = loc?.address as string | undefined;
    const maps = addr ? `<p>📍 ${esc(addr)}<br><a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}">Google Maps</a> · <a href="https://maps.apple.com/?daddr=${encodeURIComponent(addr)}">Apple Maps</a></p>` : '';
    const fromWaitlist = b.source === 'waitlist';
    await send(await emailOf(b.user_id), fromWaitlist ? `A spot opened up! You're booked: ${b.class_title}` : `You're booked: ${b.class_title}`,
      layout(fromWaitlist ? 'You\'re off the waitlist! 🎉' : 'You\'re booked! 🎉',
      `${fromWaitlist ? '<p>A spot opened up, so we booked it for you automatically.</p>' : ''}<p><b>${esc(b.class_title)}</b> with ${esc(st?.name)}</p><p>🗓 ${esc(when)}<br>👶 ${esc(b.attendee_name)}<br>⭐ ${b.credits} credits</p>${maps}${contact}<p style="color:#7a7483">${fromWaitlist ? 'Can\'t make it anymore? ' : ''}Free cancellation up to ${pr?.cancel_hours ?? 24} hours before the class starts.</p>`,
      { label: 'See my classes', url: SITE }));
    await send(await emailOf(st?.owner_id), `New booking: ${b.class_title}`, layout('New booking 🙌',
      `<p><b>${esc(b.attendee_name)}</b> (parent: ${esc(b.parent_name)}) booked <b>${esc(b.class_title)}</b>.</p><p>🗓 ${esc(when)}</p>`,
      { label: 'See your bookings', url: SITE }));
  }

  if (event === 'booking_cancelled') {
    // data comes straight from the database (the booking row is already deleted by the time we run)
    const { data: st } = await db.from('studios').select('name, owner_id').eq('id', data.studio_id).single();
    const when = `${day(data.session_date)} at ${time12(data.session_time)}`;
    const parentTo = await emailOf(data.user_id);
    if (data.by === 'account_deleted') {
      // the parent closed their account: only the studio needs to know
      await send(await emailOf(st?.owner_id), `Booking cancelled: ${data.class_title}`, layout('A booking was cancelled',
        `<p>A parent closed their LittlePass account, so their booking for <b>${esc(data.class_title)}</b> on ${esc(when)} was cancelled.</p><p>That spot is open again.</p>`,
        { label: 'See your bookings', url: SITE }));
    } else if (data.by === 'parent') {
      await send(parentTo, `Cancelled: ${data.class_title}`, layout('Your booking is cancelled',
        `<p><b>${esc(data.class_title)}</b> with ${esc(st?.name)}<br>🗓 ${esc(when)}</p><p>⭐ ${esc(data.credits)} credits are back in your account.</p>`,
        { label: 'Find another class', url: SITE }));
      await send(await emailOf(st?.owner_id), `Booking cancelled: ${data.class_title}`, layout('A booking was cancelled',
        `<p><b>${esc(data.attendee)}</b> (parent: ${esc(data.parent_name)}) cancelled <b>${esc(data.class_title)}</b>.</p><p>🗓 ${esc(when)}</p><p>That spot is open again.</p>`,
        { label: 'See your bookings', url: SITE }));
    } else {
      const why = data.reason ? `<p><b>Reason:</b> ${esc(data.reason)}</p>` : '';
      await send(parentTo, `Class cancelled: ${data.class_title}`, layout('Your class was cancelled',
        `<p>We're sorry: <b>${esc(data.class_title)}</b> with ${esc(st?.name)} on ${esc(when)} has been cancelled.</p>${why}<p>⭐ ${esc(data.credits)} credits have been returned to your account, so you can book something else.</p>`,
        { label: 'Find another class', url: SITE }));
    }
  }

  if (event === 'class_reminder') {
    // one email per parent with all of tomorrow's classes
    const ids = data.booking_ids as unknown as string[];
    const { data: bs } = await db.from('bookings').select('*').in('id', ids ?? []).order('session_time');
    if (!bs || !bs.length) { trace.push('class_reminder: no bookings left'); return; }
    const studioIds = [...new Set(bs.map((b) => b.studio_id))], classIds = [...new Set(bs.map((b) => b.class_id).filter(Boolean))];
    const [{ data: sts }, { data: locs }, { data: cts }, { data: cls }] = await Promise.all([
      db.from('studios').select('id, name').in('id', studioIds),
      db.from('class_locations').select('class_id, address').in('class_id', classIds),
      db.from('studio_contacts').select('studio_id, phone, arrival_notes').in('studio_id', studioIds),
      db.from('classes').select('id, what_to_bring').in('id', classIds),
    ]);
    // siblings in the same class share one entry
    const groups = new Map<string, typeof bs>();
    bs.forEach((b) => { const k = `${b.slot_id}_${b.session_date}`; groups.set(k, [...(groups.get(k) ?? []), b]); });
    const items = [...groups.values()].map((g) => {
      const b = g[0];
      const st = sts?.find((s) => s.id === b.studio_id), ct = cts?.find((c) => c.studio_id === b.studio_id);
      const addr = locs?.find((l) => l.class_id === b.class_id)?.address as string | undefined;
      const bring = cls?.find((c) => c.id === b.class_id)?.what_to_bring;
      return `<div style="border-top:1px solid #efe7df;padding:12px 0"><b>${esc(time12(b.session_time))} · ${esc(b.class_title)}</b> with ${esc(st?.name)}<br>
        👶 ${esc(g.map((x) => x.attendee_name).join(', '))}
        ${addr ? `<br>📍 ${esc(addr)} · <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}">Directions</a>` : ''}
        ${bring ? `<br>🎒 Bring: ${esc(bring)}` : ''}${ct?.arrival_notes ? `<br>📝 ${esc(ct.arrival_notes)}` : ''}${ct?.phone ? `<br>📞 ${esc(ct.phone)}` : ''}</div>`;
    }).join('');
    const n = groups.size;
    await send(await emailOf(bs[0].user_id), n === 1 ? `Tomorrow: ${bs[0].class_title} at ${time12(bs[0].session_time)}` : `Tomorrow: ${n} classes`,
      layout(`See you tomorrow! 👋`, `<p>A quick reminder for ${esc(day(bs[0].session_date))}:</p>${items}<p style="color:#7a7483">Can't make it? Cancel in My classes if the class is still more than 24 hours away, so the spot goes to a family on the waitlist. Otherwise, a quick call to the studio helps them.</p>`,
      { label: 'See my classes', url: SITE }));
  }

  if (event === 'waitlist_no_credits') {
    const { data: st } = await db.from('studios').select('name').eq('id', data.studio_id).single();
    await send(await emailOf(data.user_id), `A spot opened in ${data.class_title}`, layout('A spot opened up, but you were out of credits',
      `<p>A spot opened in <b>${esc(data.class_title)}</b> with ${esc(st?.name)} on ${esc(day(data.session_date))} at ${esc(time12(data.session_time))}, but it costs ⭐ ${esc(data.credits)} credits and your balance was too low, so it went to the next family in line.</p><p>Top up your plan to grab spots like this next time.</p>`,
      { label: 'See plans', url: SITE }));
  }

  if (event === 'report_created') {
    const { data: r } = await db.from('reports').select('*').eq('id', data.report_id).single();
    if (!r) return;
    await send(ADMIN, `Reported ${r.kind} needs a look`, layout('Something was reported',
      `<p>A parent reported a <b>${esc(r.kind)}</b>.</p>${r.reason ? `<p>“${esc(r.reason)}”</p>` : ''}`, { label: 'Open reports', url: SITE }));
  }
}

Deno.serve(async (req) => {
  trace.length = 0;
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
