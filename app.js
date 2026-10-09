// LittlePass San Diego: app logic. Data lives in Supabase; this file renders it.

// ---------- Supabase ----------
const SB_URL = 'https://nktwkktslnvredjkqzjq.supabase.co';
const SB_KEY = 'sb_publishable_943cWL3ht_oICvddIanYGw_moFzaMnh'; // publishable key: safe in the browser
const sb = window.supabase.createClient(SB_URL, SB_KEY);

// ---------- Private analytics + error reports ----------
// No cookies and no IP addresses: a visit is a random id that lives only in this browser tab. Nothing is sent while testing locally.
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const SESSION = (() => {
  try { let id = sessionStorage.getItem('lp-s'); if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('lp-s', id); } return id; }
  catch (e) { return String(Math.random()).slice(2); }
})();
const tracked = new Set();
function track(name, studioId = null) {
  const key = name + (studioId || '');
  if (LOCAL || tracked.has(key)) return;
  tracked.add(key);
  sb.from('events').insert({ name, studio_id: studioId, session: SESSION }).then(() => {}, () => {});
}
// Crashes in someone's browser land in the admin Stats tab and the morning email (at most 5 per visit)
const errorSeen = new Set();
function reportError(message, source) {
  message = String(message || 'Unknown error').slice(0, 500);
  if (LOCAL || errorSeen.size >= 5 || errorSeen.has(message) || /ResizeObserver loop|^Script error\.?$/.test(message)) return;
  if (source && !source.startsWith(location.origin) && !/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/.test(source)) return;  // browser extensions, not us
  errorSeen.add(message);
  sb.from('client_errors').insert({ message, source: (source || '').slice(0, 300), page: (location.pathname + location.hash).slice(0, 200),
    user_agent: navigator.userAgent.slice(0, 300), session: SESSION }).then(() => {}, () => {});
}
window.addEventListener('error', e => reportError(e.message, e.filename));
window.addEventListener('unhandledrejection', e => reportError('Unhandled: ' + ((e.reason && e.reason.message) || e.reason), ''));
// Same rule as the studio pages on the server (netlify/lib/studio-page.js)
const slugify = name => String(name).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ---------- Static data ----------
const AGES = [
  { id: 'all',  label: 'All ages', min: 0,  max: 72 },
  { id: '0-6',  label: '0–6 mo',   min: 0,  max: 6 },
  { id: '6-12', label: '6–12 mo',  min: 6,  max: 12 },
  { id: '1-2',  label: '1–2 yrs',  min: 12, max: 24 },
  { id: '2-3',  label: '2–3 yrs',  min: 24, max: 36 },
  { id: '3-5',  label: '3–5 yrs',  min: 36, max: 60 },
];
const CATS = {
  all:     { label: 'All',              emoji: '✨', color: '#f5efe9' },
  swim:    { label: 'Swim',             emoji: '🏊', color: '#d9f4f6' },
  music:   { label: 'Music',            emoji: '🎵', color: '#ede7ff' },
  gym:     { label: 'Gym & Movement',   emoji: '🤸', color: '#ffe3d8' },
  art:     { label: 'Art & Messy Play', emoji: '🎨', color: '#fff1cc' },
  sensory: { label: 'Sensory',          emoji: '🧸', color: '#e2f4e3' },
  yoga:    { label: 'Parent & Me Yoga', emoji: '🧘', color: '#fde4f0' },
  outdoor: { label: 'Outdoor & Nature', emoji: '🌿', color: '#e2f4e3' },
};
const HOODS = ['All of San Diego', 'North Park', 'Hillcrest', 'La Jolla', 'Pacific Beach',
  'Point Loma', 'Mission Valley', 'Carmel Valley', 'Encinitas', 'Carlsbad', 'Chula Vista', 'Del Mar'];
const COORDS = {
  'North Park': [32.7413, -117.1294], 'Hillcrest': [32.7480, -117.1620], 'La Jolla': [32.8328, -117.2713],
  'Pacific Beach': [32.7970, -117.2540], 'Point Loma': [32.7300, -117.2350], 'Mission Valley': [32.7680, -117.1500],
  'Carmel Valley': [32.9410, -117.2200], 'Encinitas': [33.0369, -117.2920], 'Carlsbad': [33.1581, -117.3506],
  'Chula Vista': [32.6401, -117.0842], 'Del Mar': [32.9595, -117.2653],
};
const PLANS = [
  { id: 'sprout', name: 'Sprout', price: 49,  credits: 12, perks: ['About 3 classes a month', 'Free cancellation up to 24h before', 'Unused credits roll over'] },
  { id: 'bloom',  name: 'Bloom',  price: 89,  credits: 25, perks: ['About 6 classes a month', 'Free cancellation up to 24h before', 'Unused credits roll over'], pop: true },
  { id: 'grove',  name: 'Grove',  price: 149, credits: 45, perks: ['About 11 classes a month', 'Free cancellation up to 24h before', 'Unused credits roll over'] },
];
const REVIEW_POOL = [
  ['Maya R.', 5, 'My daughter looks forward to this every week. The teachers are so patient and kind.'],
  ['Chris T.', 5, 'Clean, welcoming and easy to book. We met other parents in the neighborhood too.'],
  ['Dana L.', 4, 'Great class for our 1-year-old. Gets busy, so book early!'],
  ['Priya S.', 5, 'Best part of our week. My son came home exhausted and happy.'],
  ['Jordan M.', 4, 'Lovely instructors and a nice mix of ages. Parking is a little tight.'],
  ['Sam K.', 5, 'We tried it as a first activity with our newborn and felt totally comfortable.'],
];
const PARENT_STAYS = { stays: '👨‍👩‍👧 Parent stays', dropoff: '🚪 Drop-off', either: '👨‍👩‍👧 Parent stays or drop-off' };
const LEVELS = { beginner: '🌱 First-timers welcome', all: '✨ All levels', advanced: '🏅 Some experience helps' };
const classById = id => classes.find(c => c.id === id);
const safeUrl = u => { const t = String(u || '').trim(); if (!t) return ''; const full = /^https?:\/\//i.test(t) ? t : 'https://' + t; try { const x = new URL(full); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } };
const TERMS_VERSION = 'draft-1'; // bump when the legal text changes
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------- State ----------
let user = null, profile = null, kids = [], myBookings = [], myWaitlist = [], studioBookings = [], payouts = [];
let studios = [], classes = [], slots = [], counts = {}, reviews = [], loaded = false, cancelHours = 24;
let filters = { age: 'all', cat: 'all', hood: HOODS[0], day: 'all', studio: 'all', cls: 'all', q: '' };
let exploreMode = 'list', lastTab = 'explore', currentView = 'explore', currentStudio = null;
let authState = { mode: 'login', role: 'parent', reason: '' };
let ownerTab = 'overview', bkFilter = 'upcoming', lastUid = undefined;
let adminStudios = [], adminTab = 'studios', adminFilter = 'pending';
let adminGrowth = null, adminStats = null, adminUsers = [], adminAudit = [], peopleQ = '', peopleRole = 'all', myLedger = [], histAll = false, editKid = null, editName = false;
let adminPay = [], adminPayouts = [], adminPricing = null, adminReports = [];
let waivers = [], mySignatures = [], ownWaivers = [], studioSignatures = [], waiverFlow = null, editWaiver = null;
let studioPhotos = [], pastBookings = [], rvClassFilter = 'all', bookView = 'upcoming', plansDb = [], locations = [], exceptions = [], contacts = [];

// ---------- Language ----------
// Parents can switch to Spanish. ES (i18n.js) maps the English text to Spanish; anything missing stays in English.
// The studio dashboard and admin screens are English only.
let LANG = (() => { try { const v = localStorage.getItem('lp-lang'); if (v === 'es' || v === 'en') return v; } catch (e) {} return /^es\b/i.test(navigator.language || '') ? 'es' : 'en'; })();
const LOCALE = () => LANG === 'es' ? 'es-US' : 'en-US';
function T(en, vars) {
  let out = (LANG === 'es' && typeof ES !== 'undefined' && ES[en]) || en;
  if (vars) out = out.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return out;
}
// Messages that come back from the database or sign-in, some with a name or number inside
const ES_PATTERNS = [
  [/^(.+) is already booked in this class$/, '$1 ya tiene lugar en esta clase'],
  [/^(.+) is listed twice$/, '$1 aparece dos veces'],
  [/^Only (\d+) spot\(s\) left in this class$/, 'Solo quedan $1 lugares en esta clase'],
  [/^The waitlist closes (\d+) hours before class$/, 'La lista de espera cierra $1 horas antes de la clase'],
  [/^Classes can only be cancelled up to (\d+) hours before they start$/, 'Las clases solo se pueden cancelar hasta $1 horas antes de empezar'],
  [/^Booked from waitlist: /, 'Reserva desde la lista de espera: '],
  [/^Booked: /, 'Reserva: '],
  [/^Refund \(you cancelled\): /, 'Reembolso (cancelaste): '],
  [/^Refund \(class cancelled\): /, 'Reembolso (clase cancelada): '],
  [/^Refund: you cancelled$/, 'Reembolso: cancelaste'],
  [/^Refund: class cancelled$/, 'Reembolso: clase cancelada'],
  [/^Adjustment by LittlePass: /, 'Ajuste de LittlePass: '],
  [/^Monthly credits: /, 'Créditos mensuales: '],
  [/^Correction: first-month credits$/, 'Corrección: créditos del primer mes'],
  [/^Credits expired: subscription ended$/, 'Créditos vencidos: terminó la suscripción'],
];
function tx(msg) {
  msg = String(msg || '');
  if (LANG !== 'es') return msg;
  if (typeof ES !== 'undefined' && ES[msg]) return ES[msg];
  for (const [re, es] of ES_PATTERNS) if (re.test(msg)) return msg.replace(re, es);
  return msg;
}
// Text written into index.html: data-t (plain text), data-th (HTML), data-tph (placeholder), data-taria (aria-label)
const STATIC_EN = new Map();
function applyStatic() {
  document.documentElement.lang = LANG;
  const keep = (el, attr, get) => { if (!STATIC_EN.has(el)) STATIC_EN.set(el, {}); const o = STATIC_EN.get(el); if (!(attr in o)) o[attr] = get(); return o[attr]; };
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = T(keep(el, 't', () => el.textContent.trim())); });
  document.querySelectorAll('[data-th]').forEach(el => { el.innerHTML = T(keep(el, 'h', () => el.innerHTML.trim())); });
  document.querySelectorAll('[data-tph]').forEach(el => { el.placeholder = T(keep(el, 'ph', () => el.placeholder)); });
  document.querySelectorAll('[data-taria]').forEach(el => { el.setAttribute('aria-label', T(keep(el, 'aria', () => el.getAttribute('aria-label')))); });
}
async function setLang(l) {
  LANG = l;
  try { localStorage.setItem('lp-lang', l); } catch (e) {}
  if (user && profile && profile.role === 'parent') sb.from('profiles').update({ lang: l }).eq('id', user.id).then(() => {}, () => {});  // so emails come in this language
  applyStatic(); renderAll();
}

// ---------- Helpers ----------
const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = new Date(); today.setHours(0, 0, 0, 0);
const todayStr = fmt(today);
const HORIZON = 14; // days parents can see and book
const DAYS = Array.from({ length: HORIZON }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() + i); return d; });
const dayName = d => {
  const diff = Math.round((d - today) / 864e5);
  if (diff === 0) return T('Today');
  if (diff === 1) return T('Tomorrow');
  const out = d.toLocaleDateString(LOCALE(), { weekday: 'long', month: 'short', day: 'numeric' });
  return LANG === 'es' ? out.charAt(0).toUpperCase() + out.slice(1) : out;
};
const dateLabel = str => new Date(str + 'T00:00:00').toLocaleDateString(LOCALE(), { weekday: 'short', month: 'short', day: 'numeric' });
const ageText = (min, max) => {
  const f = m => { if (m < 12) return LANG === 'es' ? `${m} meses` : `${m} mo`; const y = Math.round(m / 12 * 10) / 10; return LANG === 'es' ? `${y} ${y === 1 ? 'año' : 'años'}` : `${y} yr`; };
  return `${f(min)} – ${f(max)}`;
};
const monthsOld = bday => {
  const b = new Date(bday), n = new Date();
  return (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth()) - (n.getDate() < b.getDate() ? 1 : 0);
};
const to12 = t => { let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; };
const t12 = t => to12(String(t).slice(0, 5));
const timeVal = t => new Date('1/1/2000 ' + t);
const money = c => '$' + (c / 100).toFixed(2);
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}
let modalReturnFocus = null;
function openModal(html) {
  if (!$('#modalBg').classList.contains('show')) modalReturnFocus = document.activeElement;
  $('#modal').innerHTML = html; $('#modalBg').classList.add('show');
  const h = $('#modal h2'); if (h) { h.id = 'modalTitle'; $('#modal').setAttribute('aria-labelledby', 'modalTitle'); } else $('#modal').removeAttribute('aria-labelledby');
}
function closeModal() {
  $('#modalBg').classList.remove('show');
  if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
  modalReturnFocus = null;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modalBg').classList.contains('show')) closeModal(); });
$('#modalBg').onclick = e => { if (e.target.id === 'modalBg' || e.target.dataset.close !== undefined) closeModal(); };

// ---------- Data ----------
async function loadPublic() {
  const [st, cl, sl, rv, ct, ch, ph, pl, lc, ex, co, wv] = await Promise.all([
    sb.from('studios').select('*'),
    sb.from('classes').select('*'),
    sb.from('class_slots').select('*'),
    sb.from('reviews').select('*').order('created_at'),
    sb.rpc('booked_counts', { p_from: fmt(DAYS[0]), p_to: fmt(DAYS[DAYS.length - 1]) }),
    sb.rpc('get_cancel_hours'),
    sb.from('studio_photos').select('*').order('created_at'),
    sb.from('plans').select('*').order('sort'),
    sb.from('class_locations').select('*'),
    sb.from('slot_exceptions').select('*'),
    sb.from('studio_contacts').select('*'),
    sb.from('studio_waivers').select('*').eq('active', true).order('created_at'),
  ]);
  contacts = co.data || [];
  waivers = wv.data || [];
  locations = lc.data || [];
  exceptions = ex.data || [];
  studioPhotos = ph.data || [];
  plansDb = pl.data || [];
  if (typeof ch.data === 'number') cancelHours = ch.data;
  if (st.error || cl.error || sl.error) throw (st.error || cl.error || sl.error);
  studios = st.data; classes = cl.data; slots = sl.data; reviews = rv.data || [];
  counts = {};
  (ct.data || []).forEach(r => { counts[`${r.slot_id}_${r.session_date}`] = Number(r.taken); });
}
async function loadPrivate() {
  kids = []; myBookings = []; myWaitlist = []; studioBookings = []; payouts = []; adminStudios = []; adminPay = []; adminPayouts = []; adminPricing = null; adminReports = []; pastBookings = []; adminUsers = []; adminAudit = []; myLedger = []; adminStats = null; adminGrowth = null; mySignatures = []; ownWaivers = []; studioSignatures = [];
  if (!user) { profile = null; return; }
  profile = (await sb.from('profiles').select('*').eq('id', user.id).single()).data;
  if (profile && profile.role === 'admin') {
    const [s, p, pr, po, rp, us, au] = await Promise.all([sb.rpc('admin_list_studios'), sb.rpc('admin_payout_summary'),
      sb.rpc('admin_get_pricing'), sb.from('payouts').select('*').order('created_at', { ascending: false }),
      sb.from('reports').select('*').eq('resolved', false).order('created_at', { ascending: false }),
      sb.rpc('admin_list_users'), sb.from('admin_audit').select('*').order('created_at', { ascending: false }).limit(30)]);
    adminUsers = us.data || []; adminAudit = au.data || [];
    adminReports = rp.data || [];
    adminStudios = s.data || []; adminPay = p.data || []; adminPricing = (pr.data || [])[0] || null; adminPayouts = po.data || [];
    return;
  }
  if (profile && profile.role === 'studio') {
    const st = studios.find(s => s.owner_id === user.id);
    if (st) {
      const [b, po, ow, sg] = await Promise.all([
        sb.from('bookings').select('*').eq('studio_id', st.id).order('session_date', { ascending: false }).limit(1000),
        sb.from('payouts').select('*').eq('studio_id', st.id).order('created_at', { ascending: false }),
        sb.from('studio_waivers').select('*').eq('studio_id', st.id).order('created_at'),
        sb.from('waiver_signatures').select('*').eq('studio_id', st.id).order('signed_at', { ascending: false }),
      ]);
      studioBookings = b.data || []; payouts = po.data || []; ownWaivers = ow.data || []; studioSignatures = sg.data || [];
    }
  } else {
    const [k, b, w, l, sg] = await Promise.all([
      sb.from('kids').select('*').order('created_at'),
      sb.from('bookings').select('*').eq('user_id', user.id),
      sb.rpc('my_waitlist'),
      sb.from('credit_ledger').select('delta, reason, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200),
      sb.from('waiver_signatures').select('*').eq('user_id', user.id).order('signed_at', { ascending: false }),
    ]);
    const mine = b.data || []; myWaitlist = w.data || []; myLedger = l.data || []; mySignatures = sg.data || [];
    kids = k.data || []; myBookings = mine.filter(x => x.session_date >= todayStr); pastBookings = mine.filter(x => x.session_date < todayStr);
  }
}
async function refresh() {
  await loadPublic(); await loadPrivate();
  buildSessions(); renderAll();
}

// ---------- Sessions ----------
const SESSIONS = [], PARTNERS = [], CANCELLED = [];
const studioById = id => studios.find(s => s.id === id);
const studioByName = n => studios.find(s => s.name === n);
const myStudio = () => user ? studios.find(s => s.owner_id === user.id) : null;
function buildSessions() {
  SESSIONS.length = 0; PARTNERS.length = 0; CANCELLED.length = 0;
  const off = new Map(exceptions.map(e => [`${e.slot_id}_${e.session_date}`, e]));
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
  slots.filter(sl => sl.active).forEach(sl => {
    const c = classes.find(x => x.id === sl.class_id), st = c && studioById(c.studio_id);
    if (!st) return;
    const [h, m] = String(sl.start_time).split(':').map(Number);
    let any = false;
    DAYS.forEach(d => {
      if (d.getDay() !== sl.dow) return;
      if (d.getTime() === today.getTime() && h * 60 + m <= nowMin) return; // already started
      const dateStr = fmt(d), id = `${sl.id}_${dateStr}`, taken = counts[id] || 0;
      if (off.has(id)) { CANCELLED.push({ id, key: sl.id, studioId: st.id, title: c.title, date: d, dateStr, time: t12(sl.start_time), reason: off.get(id).reason }); return; }
      SESSIONS.push({ loc: locByClass(c.id), hasAddr: c.has_address, id, key: sl.id, classId: c.id, studioId: st.id, dateStr, title: c.title, studio: st.name, cat: c.cat, hood: c.hood,
        ageMin: c.age_min, ageMax: c.age_max, credits: sl.credits, priceCents: sl.price_cents, date: d,
        time: t12(sl.start_time), time24: String(sl.start_time).slice(0, 8), mins: sl.mins, capacity: sl.capacity, taken, spots: sl.capacity - taken });
      any = true;
    });
    if (any) {
      const loc = locByClass(c.id), exact = !!(loc && loc.lat != null);
      const key = exact ? `${loc.lat.toFixed(4)},${loc.lng.toFixed(4)}` : 'approx';
      if (!PARTNERS.find(x => x.studio === st.name && x.hood === c.hood && x.key === key) && (exact || COORDS[c.hood])) {
        let pos;
        if (exact) pos = [loc.lat, loc.lng];
        else { const n = PARTNERS.filter(x => x.hood === c.hood).length, base = COORDS[c.hood]; pos = [base[0] + n * 0.006, base[1] + n * 0.008]; }
        PARTNERS.push({ studio: st.name, hood: c.hood, key, pos, loc: loc || null, exact });
      }
    }
  });
}
const cancellable = b => new Date(`${b.session_date}T${b.session_time}`) - Date.now() >= cancelHours * 36e5;
const locByClass = id => locations.find(l => l.class_id === id) || null;
const gmaps = l => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(l.address)}`;
const amaps = l => `https://maps.apple.com/?daddr=${encodeURIComponent(l.address)}`;
const dirLinks = l => `<a class="lnk" href="${gmaps(l)}" target="_blank" rel="noopener">Google Maps</a> · <a class="lnk" href="${amaps(l)}" target="_blank" rel="noopener">Apple Maps</a>`;
const sessKey = s => s.loc && s.loc.lat != null ? `${s.loc.lat.toFixed(4)},${s.loc.lng.toFixed(4)}` : 'approx';
// Free OpenStreetMap lookup, used once when a studio saves an address. Results outside San Diego County are ignored.
async function geocode(addr) {
  try {
    const q = /san diego|, ca\b/i.test(addr) ? addr : addr + ', San Diego County, CA';
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(q));
    const j = await r.json();
    if (j[0]) {
      const lat = +j[0].lat, lng = +j[0].lon;
      if (lat > 32.4 && lat < 33.5 && lng > -117.7 && lng < -116.8) return { lat, lng };
    }
  } catch (e) {}
  return null;
}
const bookingFor = id => myBookings.find(b => `${b.slot_id}_${b.session_date}` === id);
const isBooked = id => !!bookingFor(id);
const waitFor = id => myWaitlist.find(w => `${w.slot_id}_${w.session_date}` === id);
// The waitlist closes when free cancellation does, so nobody gets booked into a class they can't get out of
const waitOpen = s => new Date(`${s.dateStr}T${s.time24}`) - Date.now() >= cancelHours * 36e5;
// Book / Booked / Waitlist button for a session, used on cards, map pins and class details
function sessBtn(s, extra = '') {
  const w = waitFor(s.id);
  if (isBooked(s.id)) return s.spots > 0 && kids.length > 1
    ? `<button class="btn ghost" ${extra} data-book="${s.id}">${T('+ Kid')}</button>` : `<button class="btn ghost" ${extra} disabled>${T('✓ Booked')}</button>`;
  if (w) return `<button class="btn ghost" ${extra} data-leavewait="${w.id}">${T('⏳ Waitlist #{n}', { n: w.place })}</button>`;
  if (s.spots <= 0) return waitOpen(s) ? `<button class="btn ghost" ${extra} data-wait="${s.id}">${T('Waitlist')}</button>` : `<button class="btn" ${extra} disabled>${T('Full')}</button>`;
  return null;
}
// A booked class, even if the studio has since changed or paused the slot
function sessionFromBooking(b) {
  const live = SESSIONS.find(s => s.id === `${b.slot_id}_${b.session_date}`);
  if (live) return live;
  const c = classes.find(x => x.id === b.class_id), st = studioById(b.studio_id);
  return { loc: locByClass(b.class_id), classId: b.class_id, studioId: b.studio_id, id: `${b.slot_id}_${b.session_date}`, key: b.slot_id, title: b.class_title, studio: st ? st.name : 'Studio',
    cat: c ? c.cat : 'all', hood: c ? c.hood : 'San Diego', ageMin: 0, ageMax: 0, credits: b.credits,
    date: new Date(b.session_date + 'T00:00:00'), time: t12(b.session_time), mins: 0, spots: 1 };
}

// Plans come from the database; the built-in list is only a fallback before it loads
const planList = () => plansDb.length
  ? plansDb.filter(p => p.active).map(p => ({ id: p.id, name: p.name, price: p.price_cents / 100, credits: p.credits, perks: p.perks, pop: p.popular, ready: !!p.stripe_price_id }))
  : PLANS.map(p => ({ ...p, ready: false }));

// ---------- Header + navigation ----------
const isAdmin = () => !!(user && profile && profile.role === 'admin');
const isStudioUser = () => !!(user && profile && profile.role === 'studio');
function renderNav() {
  const pend = adminStudios.filter(s => s.status === 'pending').length;
  const items = isAdmin()
    ? [['a-stats', '📊', 'Stats'], ['a-studios', '🏢', 'Studios' + (pend ? ` (${pend})` : '')], ['a-people', '👥', 'People'], ['a-payouts', '💸', 'Payouts' + (adminPayouts.some(p => p.status === 'pending') ? ' •' : '')], ['a-reports', '🚩', 'Reports' + (adminReports.length ? ` (${adminReports.length})` : '')], ['a-account', '⚙️', 'Account']]
    : isStudioUser()
    ? [['o-overview', '📊', 'Overview'], ['o-classes', '📚', 'Classes'], ['o-bookings', '📅', 'Bookings'], ['o-page', '🖼️', 'Page'], ['o-earnings', '💰', 'Earnings'], ['o-account', '⚙️', 'Account']]
    : [['explore', '🔍', T('Explore')], ['bookings', '📅', T('My classes')], ['plans', '⭐', T('Plans')], ['profile', '👶', T('Family')]];
  const nav = document.querySelector('nav.tabs');
  nav.innerHTML = items.map(([id, ico, label]) => `<button data-tab="${id}"><span class="ico">${ico}</span>${label}</button>`).join('');
  markNav();
}
function markNav() {
  const key = currentView === 'owner' ? 'o-' + ownerTab : currentView === 'admin' ? 'a-' + adminTab : currentView;
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === key));
}
function renderHeader() {
  const b = $('#creditBtn');
  $('#ownerBtn').classList.toggle('hidden', !!user);
  $('#langBtn').classList.toggle('hidden', isAdmin() || isStudioUser());
  $('#langBtn').textContent = LANG === 'es' ? 'EN' : 'ES';
  $('#langBtn').setAttribute('aria-label', LANG === 'es' ? 'Switch to English' : 'Cambiar a español');
  if (!user) b.textContent = T('Log in');
  else if (isAdmin()) b.textContent = '🛡️ Admin';
  else if (isStudioUser()) { const st = myStudio(); b.textContent = '🏢 ' + (st ? st.name.slice(0, 18) : 'Studio'); }
  else b.textContent = T('⭐ {n} credits', { n: profile ? profile.credits : 0 });
  renderNav();
}
$('#creditBtn').onclick = () => {
  if (!user) return openAuth('login');
  showTab(isAdmin() ? 'a-account' : isStudioUser() ? 'o-account' : 'plans');
};
$('#ownerBtn').onclick = () => showTab('owner');
$('#langBtn').onclick = () => setLang(LANG === 'es' ? 'en' : 'es');

// ---------- Auth ----------
function openAuth(mode = 'login', reason = '', role = authState.role) {
  authState = { mode, role, reason };
  if (mode === 'signup') track('start_signup');
  const su = mode === 'signup';
  openModal(`
    <h2>${su ? T('Create your account') : T('Welcome back')}</h2>
    ${reason ? `<p class="meta" style="margin:0 0 8px">${esc(reason)}</p>` : ''}
    <div class="seg" style="margin:8px 0 12px"><button data-authmode="login" class="${su ? '' : 'on'}">${T('Log in')}</button><button data-authmode="signup" class="${su ? 'on' : ''}">${T('Sign up')}</button></div>
    ${su ? `<div class="label">${T('I am a…')}</div>
      <div class="seg" style="margin:0 0 12px"><button data-authrole="parent" class="${authState.role === 'parent' ? 'on' : ''}">${T('👶 Parent')}</button><button data-authrole="studio" class="${authState.role === 'studio' ? 'on' : ''}">${T('🏢 Studio')}</button></div>
      <div class="label">${T('Your name')}</div><input id="auName" placeholder="${T('Your name')}" autocomplete="name">` : ''}
    <div class="label">${T('Email')}</div><input id="auEmail" type="email" placeholder="${T('you@email.com')}" autocomplete="email">
    <div class="label">${T('Password')}</div><input id="auPass" type="password" placeholder="${T('At least 6 characters')}" autocomplete="${su ? 'new-password' : 'current-password'}">
    ${su ? `<label class="consent"><input type="checkbox" id="auTerms" style="width:auto;margin:3px 8px 0 0"><span>${T("I'm 18 or older and I agree to the {terms} and {privacy}{studio}.", {
      terms: `<a class="lnk" href="legal/terms.html" target="_blank" rel="noopener">${T('Terms')}</a>`,
      privacy: `<a class="lnk" href="legal/privacy.html" target="_blank" rel="noopener">${T('Privacy Policy')}</a>`,
      studio: authState.role === 'studio' ? T(' and the {link}', { link: `<a class="lnk" href="legal/studio-agreement.html" target="_blank" rel="noopener">${T('Studio Partner Agreement')}</a>` }) : '' })}${LANG === 'es' ? ' <span class="meta">(documentos en inglés)</span>' : ''}</span></label>` : ''}
    ${su ? '' : `<div style="margin:-4px 0 8px"><a class="lnk" data-forgot style="font-size:14px;font-weight:700">${T('Forgot password?')}</a></div>`}
    <div class="err" id="auErr"></div>
    <div class="actions"><button class="btn ghost" data-close>${T('Cancel')}</button><button class="btn" data-authgo>${su ? T('Create account') : T('Log in')}</button></div>`);
  setTimeout(() => { const f = $('#auName') || $('#auEmail'); if (f) f.focus(); }, 50);
}
async function forgotPassword() {
  const email = $('#auEmail').value.trim(), err = $('#auErr');
  if (!email) { err.textContent = T('Type your email above first, then click "Forgot password?"'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) { err.textContent = tx(error.message); return; }
  openModal(`<h2>${T('Check your email 📬')}</h2><p>${T('If there is an account for {email}, we sent a link to choose a new password. It can take a minute, and check your spam folder.', { email: '<b>' + esc(email) + '</b>' })}</p><div class="actions"><button class="btn" data-close>OK</button></div>`);
}
function openNewPassword() {
  openModal(`<h2>${T('Choose a new password')}</h2>
    <div class="label">${T('New password')}</div><input id="npPass" type="password" placeholder="${T('At least 6 characters')}" autocomplete="new-password">
    <div class="err" id="npErr"></div>
    <div class="actions"><button class="btn ghost" data-close>${T('Cancel')}</button><button class="btn" data-setpass>${T('Save password')}</button></div>`);
}
async function setNewPassword() {
  const pw = $('#npPass').value;
  if (pw.length < 6) { $('#npErr').textContent = T('Use at least 6 characters.'); return; }
  const { error } = await sb.auth.updateUser({ password: pw });
  if (error) { $('#npErr').textContent = tx(error.message); return; }
  closeModal(); toast(T("Password updated. You're logged in ✓"));
}
async function authGo() {
  const email = $('#auEmail').value.trim(), password = $('#auPass').value, err = $('#auErr');
  err.textContent = '';
  if (!email || !password) { err.textContent = T('Please enter your email and password.'); return; }
  const btn = $('[data-authgo]'); btn.disabled = true;
  let res;
  if (authState.mode === 'signup') {
    const name = $('#auName').value.trim();
    if (!name) { err.textContent = T('Please enter your name.'); btn.disabled = false; return; }
    if (!$('#auTerms').checked) { err.textContent = T('Please agree to the Terms and Privacy Policy to create an account.'); btn.disabled = false; return; }
    res = await sb.auth.signUp({ email, password, options: { data: { name, role: authState.role, terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString(), lang: LANG, ...(storedReferral() ? { ref: storedReferral().ref, src: storedReferral().src } : {}) } } });
    if (!res.error) { try { localStorage.removeItem(REF_KEY); } catch (e) {} }
    if (!res.error && !res.data.session) {
      openModal(`<h2>${T('Check your email 📬')}</h2><p>${T('We sent a confirmation link to {email}. Click it, then come back and log in.', { email: '<b>' + esc(email) + '</b>' })}</p><div class="actions"><button class="btn" data-close>OK</button></div>`);
      return;
    }
  } else {
    res = await sb.auth.signInWithPassword({ email, password });
  }
  if (res.error) { err.textContent = tx(res.error.message); btn.disabled = false; return; }
  closeModal();
  toast(authState.mode === 'signup' ? T('Welcome to LittlePass! 🎉') : T('Logged in'));
}
$('#modal').addEventListener('keydown', e => { if (e.key === 'Enter' && $('[data-authgo]')) authGo(); });

// ---------- Filters UI ----------
function renderFilters() {
  $('#ageChips').innerHTML = AGES.map(a =>
    `<button class="chip ${filters.age === a.id ? 'on' : ''}" aria-pressed="${filters.age === a.id}" data-age="${a.id}">${T(a.label)}</button>`).join('')
    + kids.map((k, i) =>
    `<button class="chip ${filters.age === 'kid' + i ? 'on' : ''}" aria-pressed="${filters.age === 'kid' + i}" data-age="kid${i}">👶 ${esc(k.name)}</button>`).join('');
  $('#catChips').innerHTML = Object.entries(CATS).map(([id, c]) =>
    `<button class="chip ${filters.cat === id ? 'on' : ''}" aria-pressed="${filters.cat === id}" data-cat="${id}">${c.emoji} ${T(c.label)}</button>`).join('');
  const studioNames = [...new Set(SESSIONS.map(s => s.studio))].sort((a, b) => a.localeCompare(b));
  const classTitles = [...new Set(SESSIONS.filter(s => filters.studio === 'all' || s.studio === filters.studio).map(s => s.title))].sort((a, b) => a.localeCompare(b));
  if (filters.studio !== 'all' && !studioNames.includes(filters.studio)) filters.studio = 'all';
  if (filters.cls !== 'all' && !classTitles.includes(filters.cls)) filters.cls = 'all';
  $('#studioSel').innerHTML = `<option value="all">${T('All studios')}</option>` + studioNames.map(n => `<option value="${esc(n)}" ${filters.studio === n ? 'selected' : ''}>${esc(n)}</option>`).join('');
  $('#classSel').innerHTML = `<option value="all">${T('All classes')}</option>` + classTitles.map(n => `<option value="${esc(n)}" ${filters.cls === n ? 'selected' : ''}>${esc(n)}</option>`).join('');
  $('#hoodSel').innerHTML = HOODS.map(h => `<option value="${h}" ${filters.hood === h ? 'selected' : ''}>${h === HOODS[0] ? T(h) : h}</option>`).join('');
  updateFilterBadge();
  renderDayCal();
}
// Two-week date grid. Each day shows how many classes match the OTHER filters, so you can see where to look.
function renderDayCal() {
  const box = $('#dayCal'); if (!box) return;
  const counts = {};
  SESSIONS.filter(s => matches(s, true)).forEach(s => { counts[s.dateStr] = (counts[s.dateStr] || 0) + 1; });
  const cell = (d, i) => {
    const n = counts[fmt(d)] || 0, on = String(filters.day) === String(i);
    const top = i === 0 ? T('Today') : d.getDate() === 1 ? d.toLocaleDateString(LOCALE(), { month: 'short' }) : d.toLocaleDateString(LOCALE(), { weekday: 'short' });
    return `<button class="calcell ${on ? 'on' : ''} ${n ? '' : 'zero'}" data-day="${i}" aria-pressed="${on}" title="${d.toLocaleDateString(LOCALE(), { weekday: 'long', month: 'long', day: 'numeric' })}: ${T(n === 1 ? '{n} class' : '{n} classes', { n })}"><span>${top}</span><b>${d.getDate()}</b><small>${n || '·'}</small></button>`;
  };
  box.innerHTML = `<button class="chip ${filters.day === 'all' ? 'on' : ''}" data-day="all" style="margin-bottom:8px">${T('All {n} days', { n: HORIZON })}</button><div class="cal">${DAYS.map(cell).join('')}</div>`;
}
$('#ageChips').onclick = e => { const b = e.target.closest('[data-age]'); if (!b) return; filters.age = b.dataset.age; renderFilters(); renderResults(); };
$('#catChips').onclick = e => { const b = e.target.closest('[data-cat]'); if (!b) return; filters.cat = b.dataset.cat; renderFilters(); renderResults(); };
$('#studioSel').onchange = e => { filters.studio = e.target.value; renderFilters(); renderResults(); };
$('#classSel').onchange = e => { filters.cls = e.target.value; updateFilterBadge(); renderResults(); };
let searchTimer;
$('#searchBox').oninput = e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { filters.q = e.target.value; renderResults(); }, 120); };
$('#hoodSel').onchange = e => { filters.hood = e.target.value; updateFilterBadge(); renderResults(); };

function matches(s, ignoreDay) {
  let min, max;
  if (filters.age.startsWith('kid')) {
    const k = kids[+filters.age.slice(3)];
    if (!k) { filters.age = 'all'; min = 0; max = 72; } else min = max = monthsOld(k.birthday);
  } else { const a = AGES.find(a => a.id === filters.age); min = a.min; max = a.max; }
  if (!(s.ageMin <= max && s.ageMax >= min)) return false;
  if (filters.cat !== 'all' && s.cat !== filters.cat) return false;
  if (filters.hood !== HOODS[0] && s.hood !== filters.hood) return false;
  if (!ignoreDay && filters.day !== 'all' && s.date.getTime() !== DAYS[+filters.day].getTime()) return false;
  if (filters.studio !== 'all' && s.studio !== filters.studio) return false;
  if (filters.cls !== 'all' && s.title !== filters.cls) return false;
  const terms = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length) {
    const hay = `${s.title} ${s.studio} ${s.hood} ${CATS[s.cat].label} ${T(CATS[s.cat].label)}`.toLowerCase();
    if (!terms.every(t => hay.includes(t))) return false;
  }
  return true;
}
// The Filters button shows how many of its own filters are on
function updateFilterBadge() {
  const n = [filters.hood !== HOODS[0], filters.day !== 'all', filters.studio !== 'all', filters.cls !== 'all'].filter(Boolean).length;  // age and activity chips are always visible, so they aren't counted here
  $('#filtCount').textContent = n ? ` · ${n}` : '';
  $('#filtersBtn').classList.toggle('on', n > 0);
}
function setFilterPanel(open) {
  $('#filterPanel').classList.toggle('hidden', !open);
  $('#filtersBtn').setAttribute('aria-expanded', String(open));
}
$('#filtersBtn').onclick = () => setFilterPanel($('#filterPanel').classList.contains('hidden'));
$('#showResults').onclick = () => {
  setFilterPanel(false);
  const target = exploreMode === 'map' ? $('#mapWrap') : $('#results');
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
const filtersActive = () => filters.age !== 'all' || filters.cat !== 'all' || filters.hood !== HOODS[0] || filters.day !== 'all'
  || filters.studio !== 'all' || filters.cls !== 'all' || !!filters.q.trim();
function clearFilters() {
  filters = { age: 'all', cat: 'all', hood: HOODS[0], day: 'all', studio: 'all', cls: 'all', q: '' };
  $('#searchBox').value = ''; renderFilters(); renderResults();
}
// Studios matching the search box or the studio dropdown, shown as quick links
function renderStudioHits() {
  const el = $('#studioHits');
  const names = [...new Set(SESSIONS.map(s => s.studio))];
  const terms = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
  let hits = [];
  if (filters.studio !== 'all') hits = [filters.studio];
  else if (terms.length) hits = names.filter(n => terms.every(t => n.toLowerCase().includes(t)));
  el.innerHTML = hits.length ? `<div class="hits">🏢 ${filters.studio !== 'all' ? T('Studio page:') : T('Studios:')} ${hits.slice(0, 5).map(n => `<a class="lnk" data-studio="${esc(n)}">${esc(n)} →</a>`).join('')}</div>` : '';
}

const classRating = id => { const rs = reviews.filter(r => r.class_id === id && !r.hidden); return rs.length ? { n: rs.length, avg: rs.reduce((t, r) => t + r.stars, 0) / rs.length } : null; };
// Phone, website and arrival notes: the database only returns these to parents who booked at that studio
function contactBlock(studioId) {
  const ct = contacts.find(x => x.studio_id === studioId);
  if (!ct || !(ct.phone || ct.website || ct.arrival_notes)) return '';
  const url = safeUrl(ct.website);
  return `<div class="contact">${ct.phone ? `📞 <a class="lnk" href="tel:${esc(ct.phone)}">${esc(ct.phone)}</a>` : ''}${ct.phone && url ? ' · ' : ''}${url ? `🌐 <a class="lnk" href="${esc(url)}" target="_blank" rel="noopener">${T('Website')}</a>` : ''}${ct.arrival_notes ? `<div class="meta">📝 ${esc(ct.arrival_notes)}</div>` : ''}</div>`;
}
function card(s, mode) {
  const c = CATS[s.cat], left = s.spots;
  let action;
  const bk = mode === 'booking' && (s.booking || bookingFor(s.id)), wl = mode === 'booking' && s.wait;
  if (wl) action = `<button class="btn ghost" data-leavewait="${wl.id}">${T('Leave')}</button>`;
  else if (mode === 'booking') action = bk && !cancellable(bk) ? `<button class="btn ghost" disabled>${T("Can't cancel")}</button><div class="meta" style="font-size:11px">${T('Within {h}h of start', { h: cancelHours })}</div>` : `<button class="btn ghost" data-cancel="${bk.id}">${T('Cancel')}</button>`;
  else action = sessBtn(s) || `<button class="btn" data-book="${s.id}">${T('Book')}</button>`;
  return `<div class="card">
    <div class="emoji" style="background:${c.color}">${c.emoji}</div>
    <div>
      <h3>${esc(s.title)}</h3>
      <div class="meta"><a class="lnk" data-studio="${esc(s.studio)}">${esc(s.studio)}</a><br>📍 ${esc(s.hood)} · 🕘 ${mode === 'booking' ? dayName(s.date) + ', ' : ''}<span class="nw">${s.time}${s.mins ? ` (${s.mins} min)` : ''}</span>${s.loc ? (mode === 'booking' ? `<br>🧭 ${esc(s.loc.address)}<br>${dirLinks(s.loc)}` : ` · <a class="lnk" href="${gmaps(s.loc)}" target="_blank" rel="noopener">${T('Directions')}</a>`) : ''}</div>
      <div class="tags">
        ${bk ? `<span class="tag">👶 ${esc(bk.attendee_name)}</span>` : ''}${wl ? `<span class="tag low">${T('⏳ Waitlist #{n}', { n: wl.place })} · ${esc(wl.attendee_name)}</span>` : ''}
        ${s.ageMax && mode !== 'booking' ? `<span class="tag">👶 ${ageText(s.ageMin, s.ageMax)}</span>` : ''}
        ${mode !== 'booking' && isBooked(s.id) && s.spots > 0 && kids.length > 1 ? `<span class="tag">${T('✓ Booked')}</span>` : ''}
        ${(() => { const rt = s.classId && classRating(s.classId); return rt ? `<span class="tag">★ ${rt.avg.toFixed(1)} (${rt.n})</span>` : ''; })()}
        ${left <= 3 && left > 0 && mode !== 'booking' ? `<span class="tag low">${T('Only {n} left', { n: left })}</span>` : ''}
        ${s.classId && mode !== 'booking' ? `<a class="lnk" style="font-size:13px" data-details="${s.classId}">${T('Details')}</a>` : ''}
      </div>
      ${mode === 'booking' ? contactBlock(s.studioId) : ''}
    </div>
    <div class="right"><div class="cost">⭐ ${s.credits} <small>${T(s.credits === 1 ? 'credit' : 'credits')}</small></div>${action}</div>
  </div>`;
}

function renderResults() {
  renderStudioHits(); renderDayCal();
  const mapMode = exploreMode === 'map';
  $('#results').classList.toggle('hidden', mapMode);
  $('#mapWrap').classList.toggle('hidden', !mapMode);
  if (!loaded) { $('#results').innerHTML = `<div class="empty">${T('Loading classes… 🐣')}</div>`; return; }
  const list = SESSIONS.filter(s => matches(s));
  if (mapMode) { showMap(list); return; }
  if (!list.length) { $('#results').innerHTML = `<div class="empty">${filtersActive() ? T('No classes match these filters.') : T('No classes match.')}<br>${T('Try another neighborhood or day 🌊')}<br>${filtersActive() ? `<button class="btn ghost" style="margin-top:12px" data-clearfilters>${T('Clear all filters')}</button>` : ''}</div>`; return; }
  let html = filtersActive() ? `<div class="meta" style="margin:4px 0">${T(list.length === 1 ? '{n} session found' : '{n} sessions found', { n: list.length })} · <a class="lnk" data-clearfilters>${T('clear filters')}</a></div>` : '';
  DAYS.forEach(d => {
    const items = list.filter(s => s.date.getTime() === d.getTime()).sort((a, b) => timeVal(a.time) - timeVal(b.time));
    if (items.length) html += `<h2 class="day-h">${dayName(d)}</h2><div class="grid">${items.map(s => card(s)).join('')}</div>`;
  });
  $('#results').innerHTML = html;
}

// ---------- Map ----------
let map, markers = [], userPos = null, userMarker = null;
const miles = (a, b) => {
  const r = x => x * Math.PI / 180, R = 3958.8, dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
// Base map: a soft street map (OpenFreeMap "Positron", free, no key). Its code loads only when someone opens the map.
// If it can't load (old browser, no WebGL, blocked), we fall back to plain OpenStreetMap tiles.
let baseLayer = null;
const loadScript = src => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
function osmFallback() {
  if (baseLayer) { map.removeLayer(baseLayer); baseLayer = null; }
  baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).addTo(map);
}
async function addBaseMap() {
  try {
    if (!window.maplibregl) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.css'; document.head.appendChild(l);
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.js');
    }
    if (!L.maplibreGL) await loadScript('https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js');
    const gl = L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/positron', attributionControl: { customAttribution:
      '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' } });
    baseLayer = gl.addTo(map);
    const m = gl.getMaplibreMap();
    let ok = false;
    m.once('load', () => { ok = true; });
    m.on('error', () => { if (!ok && baseLayer === gl) osmFallback(); });
    setTimeout(() => { if (!ok && baseLayer === gl) osmFallback(); }, 15000);
  } catch (e) { osmFallback(); }
}
function showMap(list, fly) {
  if (!map) {
    map = L.map('map', { minZoom: 9, maxZoom: 18, attributionControl: false }).setView([32.87, -117.2], 10);
    L.control.attribution({ prefix: false }).addTo(map);
    addBaseMap();
    map.on('popupopen', ev => ev.popup.getElement().addEventListener('click', handleClick));
  }
  markers.forEach(m => m.remove()); markers = [];
  const shown = PARTNERS.filter(p => list.some(s => s.studio === p.studio && s.hood === p.hood && sessKey(s) === p.key));
  $('#mapCount').textContent = T(shown.length === 1 ? '{n} partner matches your filters' : '{n} partners match your filters', { n: shown.length });
  shown.forEach(p => {
    const mine = list.filter(s => s.studio === p.studio && s.hood === p.hood && sessKey(s) === p.key).sort((a, b) => a.date - b.date);
    const c = CATS[filters.cat !== 'all' ? filters.cat : mine[0].cat];
    const icon = L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -32],
      html: `<div class="pin" style="background:${c.color}"><span>${c.emoji}</span></div>` });
    const away = userPos ? ` · ${T('{d} mi away', { d: miles(userPos, p.pos).toFixed(1) })}` : '';
    const html = `<div class="mappop"><h3><a class="lnk" data-studio="${esc(p.studio)}">${esc(p.studio)}</a></h3>
      <div class="meta">📍 ${p.loc ? esc(p.loc.address) : p.hood}${away}</div>${p.loc ? `<div class="meta">🧭 ${dirLinks(p.loc)}</div>` : ''}<div style="margin-top:8px">${mine.slice(0, 3).map(s => `<div class="cls"><div><b>${esc(s.title)}</b><br>${dayName(s.date)} · ${s.time}</div>
      ${sessBtn(s, 'style="padding:6px 10px;font-size:13px"') || `<button class="btn" data-book="${s.id}">⭐ ${s.credits} · ${T('Book')}</button>`}</div>`).join('')}</div>
      ${mine.length > 3 ? `<div class="meta" style="margin-top:6px">${T('+ {n} more', { n: mine.length - 3 })} · <a class="lnk" data-studio="${esc(p.studio)}">${T('see all')}</a></div>` : ''}</div>`;
    const m = L.marker(p.pos, { icon }).addTo(map).bindPopup(html, { minWidth: 240 });
    m.partner = p; markers.push(m);
  });
  if (userMarker) userMarker.remove();
  userMarker = null;
  if (userPos) userMarker = L.marker(userPos, { icon: L.divIcon({ className: '', iconSize: [16, 16], html: '<div class="me"></div>' }) }).addTo(map);
  const near = userPos ? shown.map(p => [p, miles(userPos, p.pos)]).sort((a, b) => a[1] - b[1]).slice(0, 3) : [];
  $('#nearList').innerHTML = near.length ? `<b>${T('Closest to you:')}</b> ` + near.map(([p, d]) => `<a class="lnk" data-studio="${esc(p.studio)}">${esc(p.studio)}</a> (${d.toFixed(1)} mi)`).join(' · ') : '';
  setTimeout(() => {
    map.invalidateSize();
    let pts = markers.map(m => m.getLatLng());
    if (fly && userPos) pts = [userPos, ...near.map(n => n[0].pos)];
    else if (userPos) pts.push(userPos);
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 14 });
  }, 60);
}
$('#seg').onclick = e => {
  const b = e.target.closest('[data-mode]'); if (!b) return;
  exploreMode = b.dataset.mode;
  document.querySelectorAll('#seg button').forEach(x => x.classList.toggle('on', x === b));
  renderResults();
};
// Browsers only show the "Allow location?" prompt once; if it was refused (or the app runs inside another app), there is no prompt to tap.
// So we explain how to turn it on, and let people type a ZIP code instead.
function locationHelp(why) {
  openModal(`<h2>${T('Turn on location 📍')}</h2><p>${why}</p>
    <div class="meta" style="margin:10px 0 4px"><b>${T('iPhone (Safari):')}</b> ${T('Settings → Privacy & Security → Location Services → Safari Websites → While Using the App.')}</div>
    <div class="meta" style="margin:0 0 4px"><b>${T('Android (Chrome):')}</b> ${T('Tap the lock icon next to the address, then Permissions → Location → Allow.')}</div>
    <div class="meta"><b>${T('Mac or PC:')}</b> ${T('Click the icon at the left of the address bar, set Location to Allow, then reload the page.')}</div>
    <div class="label" style="margin-top:14px">${T('Or type your ZIP code')}</div>
    <div style="display:flex;gap:8px"><input id="zipIn" inputmode="numeric" maxlength="5" placeholder="92130" autocomplete="postal-code" style="margin:0"><button class="btn" data-usezip>${T('Use ZIP')}</button></div>
    <div class="actions"><button class="btn ghost" data-close>${T('Close')}</button></div>`);
}
function showNear(here) {
  if (Math.min(...PARTNERS.map(p => miles(here, p.pos))) > 60) { toast(T("You're outside San Diego. Showing all partners.")); return; }
  userPos = here; showMap(SESSIONS.filter(s => matches(s)), true);
}
async function useZip() {
  const z = ($('#zipIn').value || '').trim();
  if (!/^\d{5}$/.test(z)) return toast(T('Enter a 5-digit ZIP code.'));
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&postalcode=' + z);
    const j = await r.json();
    if (!j.length) return toast(T("We couldn't find that ZIP code."));
    closeModal(); showNear([+j[0].lat, +j[0].lon]);
  } catch (e) { toast(T("Couldn't look that up. Try again.")); }
}
$('#nearBtn').onclick = async () => {
  if (!navigator.geolocation) return locationHelp(T('Location is not available in this browser'));
  try {
    const st = navigator.permissions && await navigator.permissions.query({ name: 'geolocation' });
    if (st && st.state === 'denied') return locationHelp(T('Location is blocked for this site. Allow it in your browser settings, or use your ZIP code.'));
  } catch (e) {}
  toast(T('Finding you…'));
  navigator.geolocation.getCurrentPosition(pos => showNear([pos.coords.latitude, pos.coords.longitude]), err => {
    locationHelp(err.code === 1 ? T('Location is blocked for this site. Allow it in your browser settings, or use your ZIP code.')
      : err.code === 2 ? T("Your device couldn't find your location. Check that Location Services is on for your browser, or use your ZIP code.")
      : T('Finding you took too long. Try again, or use your ZIP code.'));
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
};

// ---------- Class details ----------
function openDetails(classId) {
  const c = classById(classId); if (!c) return;
  const st = studioById(c.studio_id), cat = CATS[c.cat] || CATS.all, rt = classRating(c.id), loc = locByClass(c.id);
  const next = SESSIONS.filter(s => s.classId === c.id).sort((a, b) => a.date - b.date || timeVal(a.time) - timeVal(b.time)).slice(0, 5);
  openModal(`
    <div class="emoji" style="background:${cat.color};margin-bottom:10px">${cat.emoji}</div>
    <h2 style="margin-bottom:2px">${esc(c.title)}</h2>
    <div class="meta"><a class="lnk" data-studio="${esc(st ? st.name : '')}">${esc(st ? st.name : '')}</a> · 📍 ${esc(c.hood)}${rt ? ` · ★ ${rt.avg.toFixed(1)} (${rt.n})` : ''}</div>
    <div class="tags"><span class="tag">👶 ${ageText(c.age_min, c.age_max)}</span><span class="tag">${T(PARENT_STAYS[c.parent_stays] || '')}</span><span class="tag">${T(LEVELS[c.level] || '')}</span></div>
    ${c.description ? `<p style="white-space:pre-line;margin:12px 0 6px">${esc(c.description)}</p>` : `<p class="meta" style="margin:12px 0 6px">${T("The studio hasn't added a description yet.")}</p>`}
    ${c.focus ? `<p style="margin:6px 0"><b>${T('Focus:')}</b> ${esc(c.focus)}</p>` : ''}
    ${c.what_to_bring ? `<p style="margin:6px 0"><b>${T('What to bring:')}</b> ${esc(c.what_to_bring)}</p>` : ''}
    ${loc ? `<p style="margin:6px 0">🧭 ${esc(loc.address)}<br>${dirLinks(loc)}</p>` : c.has_address ? `<p class="meta" style="margin:6px 0">${T('🔒 The exact address is shared once you book.')}</p>` : ''}
    ${waiverNote(c.id)}
    <div class="label" style="margin-top:12px">${T('Next sessions')}</div>
    ${next.length ? next.map(s => `<div class="cls" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--line)"><div><b>${dayName(s.date)}</b><div class="meta">${s.time} · ${s.mins} min · ${T('⭐ {n} credits', { n: s.credits })}</div></div>
      <div style="margin-left:auto">${sessBtn(s, 'style="padding:6px 12px"') || `<button class="btn" style="padding:6px 12px" data-book="${s.id}">${T('Book')}</button>`}</div></div>`).join('') : `<p class="meta">${T('No upcoming sessions.')}</p>`}
    <div class="actions"><button class="btn ghost" data-close>${T('Close')}</button></div>`);
}

// ---------- Studio pages ----------
const hash = t => [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const starStr = n => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
function showStudio(name, fromHash) {
  currentStudio = name; renderStudio(); showTab('studio');
  { const st = studioByName(name); if (st) track('view_studio', st.id); }
  document.title = `${name} | LittlePass`;
  const h = '#studio/' + encodeURIComponent(name);
  if (!fromHash && location.hash !== h) location.hash = h;   // makes the studio page a shareable link
}
// Links from emails open a specific screen: #explore, #bookings, #plans, #family, #owner/<tab>, #admin/<tab>
const OWNER_TABS = ['overview', 'classes', 'bookings', 'page', 'earnings', 'account'];
const ADMIN_TABS = ['stats', 'studios', 'people', 'payouts', 'pricing', 'growth', 'reports', 'account'];
let pendingRoute = null;
function routeFromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  const simple = { explore: 'explore', bookings: 'bookings', plans: 'plans', family: 'profile', 'join-studio': 'join-studio' };
  if (simple[h]) return simple[h];
  let m = h.match(/^owner\/(\w+)$/); if (m && OWNER_TABS.includes(m[1])) return 'o-' + m[1];
  m = h.match(/^admin\/(\w+)$/); if (m && ADMIN_TABS.includes(m[1])) return 'a-' + m[1];
  return null;
}
// Show the screen if this account can see it; studio and admin screens wait until the right person logs in
function applyRoute() {
  const r = pendingRoute; if (!r) return false;
  // Link for studios (from the /partners page): open the studio sign-up
  if (r === 'join-studio') {
    pendingRoute = null;
    history.replaceState(null, '', location.pathname + location.search);
    if (isStudioUser()) showTab('o-overview');
    else if (!user) { showTab('owner'); openAuth('signup', '', 'studio'); }
    return true;
  }
  const needs = r.startsWith('o-') ? 'studio' : r.startsWith('a-') ? 'admin' : null;
  if (needs && !(needs === 'studio' ? isStudioUser() : isAdmin())) {
    if (!user) openAuth('login', T('Log in to continue.'));
    return false;
  }
  pendingRoute = null;
  history.replaceState(null, '', location.pathname + location.search);
  showTab(r);
  return true;
}
window.addEventListener('hashchange', () => {
  const route = routeFromHash();
  if (route) { pendingRoute = route; if (loaded) applyRoute(); return; }
  const m = location.hash.match(/^#studio\/(.+)$/);
  if (m && loaded) { const n = decodeURIComponent(m[1]); if (studioByName(n) && n !== currentStudio) showStudio(n, true); }
  else if (!m && currentView === 'studio') showTab(lastTab || 'explore');
});
const avgOf = (arr, f) => { const v = arr.map(f).filter(x => x != null); return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null; };
const photoUrl = p => sb.storage.from('studio-photos').getPublicUrl(p.path).data.publicUrl;
const fmtDate = d => new Date(d).toLocaleDateString(LOCALE(), { month: 'short', day: 'numeric', year: 'numeric' });
const starSel = (id, v) => `<select id="${id}">${[5, 4, 3, 2, 1].map(n => `<option value="${n}" ${n === v ? 'selected' : ''}>${'★'.repeat(n)}${'☆'.repeat(5 - n)}</option>`).join('')}</select>`;
const reviewHtml = (r, st, canReport) => `<div class="review">
  <div><b>${esc(r.author)}</b> <span class="stars">${starStr(r.stars)}</span> ${r.sample ? `<span class="tag">${T('Sample')}</span>` : `<span class="tag paid">${T('✓ Verified attendee')}</span>`}</div>
  ${r.class_title ? `<div class="meta">${esc(r.class_title)}${r.created_at ? ' · ' + fmtDate(r.created_at) : ''}</div>` : ''}
  <div style="margin-top:4px">${esc(r.body)}</div>
  ${r.reply ? `<div class="reply"><b>${T('Reply from {name}', { name: esc(st.name) })}</b><div>${esc(r.reply)}</div></div>` : ''}
  ${canReport && r.id ? `<a class="lnk rep" data-report="review" data-id="${r.id}">${T('Report')}</a>` : ''}</div>`;

function reviewFormHtml(st) {
  if (!user) return `<div class="panel"><div class="label">${T('Been to a class here?')}</div><p class="meta" style="margin:0 0 10px">${T("Log in to share your experience. You can review a class after you've attended it.")}</p><button class="btn" data-login>${T('Log in')}</button></div>`;
  if (!profile || profile.role !== 'parent') return '';
  const done = [...new Set(pastBookings.filter(b => b.studio_id === st.id && b.class_id).map(b => b.class_id))].filter(id => classes.some(c => c.id === id));
  if (!done.length) return `<div class="panel"><div class="label">${T('Leave a review')}</div><p class="meta" style="margin:0">${T("You can review a class once you've attended it. After your class, come back here to tell other parents how it went.")}</p></div>`;
  const mine = id => reviews.find(r => r.user_id === user.id && r.class_id === id);
  const m = mine(done[0]) || {};
  return `<div class="panel"><div class="label">${T('Leave a review')}</div>
    <select id="rvClass">${done.map(id => `<option value="${id}">${esc(classes.find(c => c.id === id).title)}${mine(id) ? T(' (update your review)') : ''}</option>`).join('')}</select>
    <div class="two"><div><div class="label">${T('Overall')}</div>${starSel('rvStars', m.stars || 5)}</div><div><div class="label">${T('Instructor')}</div>${starSel('rvInstr', m.instructor_stars || 5)}</div></div>
    <div class="two"><div><div class="label">${T('Cleanliness')}</div>${starSel('rvClean', m.clean_stars || 5)}</div><div><div class="label">${T('Value')}</div>${starSel('rvValue', m.value_stars || 5)}</div></div>
    <textarea id="rvText" rows="3" maxlength="1000" placeholder="${T('What did your little one think?')}">${esc(m.body || '')}</textarea>
    <button class="btn" data-postreview>${T('Post review')}</button></div>`;
}
function prefillReview() {
  const sel = $('#rvClass'); if (!sel) return;
  const m = reviews.find(r => r.user_id === user.id && r.class_id === sel.value) || {};
  $('#rvStars').value = m.stars || 5; $('#rvInstr').value = m.instructor_stars || 5;
  $('#rvClean').value = m.clean_stars || 5; $('#rvValue').value = m.value_stars || 5; $('#rvText').value = m.body || '';
}
$('#view-studio').addEventListener('change', e => { if (e.target.id === 'rvClass') prefillReview(); });

function renderStudio() {
  const st = studioByName(currentStudio), el = $('#view-studio');
  if (!st) { el.innerHTML = `<button class="back" data-back>${T('← Back')}</button><div class="empty">${T('Studio not found')}</div>`; return; }
  const cs = classes.filter(c => c.studio_id === st.id);
  const cats = [...new Set(cs.map(c => c.cat))], hoods = [...new Set(cs.map(c => c.hood))];
  const h = hash(st.name), sample = st.owner_id === null;
  const real = reviews.filter(r => r.studio_id === st.id && !r.hidden);
  const seed = sample ? [0, 1, 2].map(i => { const x = REVIEW_POOL[(h + i * 2) % REVIEW_POOL.length]; return { author: x[0], stars: x[1], body: x[2], sample: true }; }) : [];
  const all = seed.concat(real);
  const avg = all.length ? all.reduce((t, r) => t + r.stars, 0) / all.length : 0;
  const reviewedClasses = cs.filter(c => real.some(r => r.class_id === c.id));
  if (rvClassFilter !== 'all' && !reviewedClasses.some(c => c.id === rvClassFilter)) rvClassFilter = 'all';
  const shown = rvClassFilter === 'all' ? all : real.filter(r => r.class_id === rvClassFilter);
  const list = SESSIONS.filter(s => s.studio === st.name).sort((a, b) => a.date - b.date || timeVal(a.time) - timeVal(b.time));
  let sched = '';
  DAYS.forEach(d => {
    const items = list.filter(s => s.date.getTime() === d.getTime());
    if (items.length) sched += `<h3 class="day-h">${dayName(d)}</h3><div class="grid">${items.map(s => card(s)).join('')}</div>`;
  });
  const c0 = CATS[cats[0]] || CATS.all;
  const photos = studioPhotos.filter(p => p.studio_id === st.id);
  const cat3 = [[T('Instructor'), avgOf(real, r => r.instructor_stars)], [T('Cleanliness'), avgOf(real, r => r.clean_stars)], [T('Value'), avgOf(real, r => r.value_stars)]].filter(x => x[1] != null);
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center"><button class="back" data-back>${T('← Back')}</button><button class="back" data-share>${T('🔗 Share')}</button></div>
    <div class="banner" style="background:${c0.color}">
      <div class="big">${c0.emoji}</div>
      <div><h1>${esc(st.name)}</h1>
        <div class="meta">${all.length ? `<span class="stars">${starStr(avg)}</span> ${avg.toFixed(1)} (${T(all.length > 1 ? '{n} reviews' : '{n} review', { n: all.length })})` : T('New on LittlePass')}</div>
        <div class="meta">📍 ${hoods.length ? esc(hoods.join(' & ')) : 'San Diego'}</div></div>
    </div>
    <div class="panel"><div class="label">${T('About')}</div><p style="margin:0">${st.blurb ? esc(st.blurb) : T('A LittlePass partner studio.')}</p>
      <div class="tags">${cats.map(c => `<span class="tag">${CATS[c].emoji} ${T(CATS[c].label)}</span>`).join('')}</div></div>
    ${cs.length ? `<div class="panel"><div class="label">${T('Where')}</div>${[...new Map(cs.map(c => { const l = locByClass(c.id); return [l ? 'a:' + l.address : 'h:' + c.hood + (c.has_address ? '!' : ''), { c, l }]; })).values()].map(({ c, l }) =>
      l ? `<div style="margin:4px 0">📍 ${esc(l.address)}<div class="meta">🧭 ${dirLinks(l)}</div></div>`
        : `<div style="margin:4px 0">📍 ${esc(c.hood)}${c.has_address ? `<div class="meta">${T('🔒 Exact address shared after you book')}</div>` : ''}</div>`).join('')}</div>` : ''}
    ${cs.length ? `<div class="panel"><div class="label">${T('Classes')}</div>${cs.map(c => `<div style="padding:8px 0;border-top:1px solid var(--line)"><b>${esc(c.title)}</b> <span class="meta">· ${ageText(c.age_min, c.age_max)} · ${T(LEVELS[c.level] || '').replace(/^\S+\s/, '')}</span>${c.description ? `<div class="meta">${esc(c.description.length > 110 ? c.description.slice(0, 110) + '…' : c.description)}</div>` : ''}<a class="lnk" style="font-size:13px" data-details="${c.id}">${T('Details')}</a></div>`).join('')}</div>` : ''}
    ${photos.length ? `<div class="label" style="margin-top:20px">${T('Photos')}</div><div class="photos real">${photos.map(p => `<img class="photo" loading="lazy" alt="${esc(p.caption || st.name)}" src="${photoUrl(p)}" data-photo="${p.id}">`).join('')}</div>`
      : sample && cats.length ? `<div class="label" style="margin-top:20px">${T('Photos')}</div><div class="photos">${cats.concat(cats, cats).slice(0, 3).map(c => `<div class="photo" style="background:${CATS[c].color}">${CATS[c].emoji}</div>`).join('')}</div><div class="meta" style="margin-top:4px">${T('Placeholder images for this demo partner.')}</div>` : ''}
    <h2 style="margin:24px 0 0">${T('Schedule: next {n} days', { n: HORIZON })}</h2>${sched || `<div class="empty">${T('No classes scheduled')}</div>`}
    <h2 style="margin:28px 0 8px">${T('What parents are saying')}</h2>
    ${all.length ? `<div class="panel" style="margin-top:0"><div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <div style="text-align:center"><div style="font-size:38px;font-weight:800;line-height:1">${avg.toFixed(1)}</div><div class="stars">${starStr(avg)}</div><div class="meta">${T(all.length > 1 ? '{n} reviews' : '{n} review', { n: all.length })}</div></div>
        <div style="flex:1;min-width:160px">${cat3.map(([l, v]) => `<div class="catrow"><span>${l}</span><div class="fillbar" style="flex:1;margin:0 10px"><div style="width:${v / 5 * 100}%"></div></div><b>${v.toFixed(1)}</b></div>`).join('')}</div></div>
      ${reviewedClasses.length > 1 ? `<div class="chips" style="margin-top:12px"><button class="chip ${rvClassFilter === 'all' ? 'on' : ''}" data-rvclass="all">${T('All classes')}</button>${reviewedClasses.map(c => `<button class="chip ${rvClassFilter === c.id ? 'on' : ''}" data-rvclass="${c.id}">${esc(c.title)}</button>`).join('')}</div>` : ''}
      <div style="margin-top:8px">${shown.map(r => reviewHtml(r, st, !!user && r.user_id !== user.id)).join('')}</div>
      ${seed.length && rvClassFilter === 'all' ? `<div class="meta" style="margin-top:8px"><i>${T('Sample reviews for this demo partner.')}</i></div>` : ''}</div>`
      : `<div class="panel" style="margin-top:0"><p class="meta" style="margin:0">${T('No reviews yet. Parents who attend a class here can leave the first one.')}</p></div>`}
    ${reviewFormHtml(st)}`;
}
async function shareStudio() {
  // the studio's own page has a proper link preview (photo, classes, rating)
  const url = `${location.origin}/studios/${slugify(currentStudio)}`, title = T('{name} on LittlePass', { name: currentStudio });
  const st = studioByName(currentStudio); if (st) track('share', st.id);
  try {
    if (navigator.share) { await navigator.share({ title, url }); return; }
    await navigator.clipboard.writeText(url); toast(T('Link copied 🔗'));
  } catch (e) { /* share dialog dismissed */ }
}
async function postReview() {
  if (!user) return openAuth('login', T('Log in to leave a review.'));
  const { error } = await sb.rpc('post_review', { p_class: $('#rvClass').value, p_stars: +$('#rvStars').value, p_instructor: +$('#rvInstr').value,
    p_clean: +$('#rvClean').value, p_value: +$('#rvValue').value, p_body: $('#rvText').value });
  if (error) return toast(tx(error.message));
  await loadPublic(); renderStudio(); toast(T('Thanks for your review 💛'));
}
function openPhoto(id) {
  const p = studioPhotos.find(x => x.id === id); if (!p) return;
  openModal(`<img src="${photoUrl(p)}" alt="" style="width:100%;border-radius:14px;display:block">
    ${p.caption ? `<p style="margin:10px 0 0">${esc(p.caption)}</p>` : ''}
    <div class="actions"><button class="btn ghost" data-close>${T('Close')}</button>
    ${isAdmin() ? `<button class="btn ghost danger" data-adminrmphoto="${p.id}">Remove photo</button>` : user ? `<button class="btn ghost" data-report="photo" data-id="${p.id}">${T('Report')}</button>` : ''}</div>`);
}
async function doReport(kind, id) {
  if (!user) return openAuth('login', T('Log in to report content.'));
  const reason = prompt(T("What's wrong with this? (optional)"));
  if (reason === null) return;
  const { error } = await sb.rpc('report_content', { p_kind: kind, p_target: id, p_reason: reason });
  if (error) return toast(tx(error.message));
  closeModal(); toast(T("Thanks. We'll take a look."));
}

// ---------- Studio waivers ----------
// A studio can ask families to agree to its own waiver(s) before booking. Parents sign in the app (tick + typed name);
// the database keeps an exact copy of what was signed and refuses bookings until the current version is signed.
const waiversForClass = classId => { const c = classById(classId); return c ? waivers.filter(w => w.studio_id === c.studio_id && (!w.class_ids || w.class_ids.includes(classId))) : []; };
// Same naming rule as the database: no child picked means the parent's own name
const attendeeNames = picks => picks.map(p => ((p || '').trim() || (profile && profile.display_name) || 'Parent').slice(0, 60));
const unsignedWaivers = (classId, names) => waiversForClass(classId).filter(w =>
  !mySignatures.some(sg => sg.waiver_id === w.id && sg.version === w.version && names.every(n => (sg.kids || []).includes(n))));
const WAIVER_MSG = 'Please read and sign the studio waiver before booking';
function openWaiverFlow(list, names, then) {
  waiverFlow = { list, i: 0, names, then };
  showWaiverStep();
}
function showWaiverStep() {
  const f = waiverFlow, w = f.list[f.i], st = studioById(w.studio_id), sname = esc(st ? st.name : T('The studio'));
  openModal(`<h2>${T('📝 Waiver from {studio}', { studio: sname })}</h2>
    <div class="meta">${esc(w.title)}${f.list.length > 1 ? ' · ' + T('{i} of {n}', { i: f.i + 1, n: f.list.length }) : ''}</div>
    <div class="waiverbox">${esc(w.body)}</div>
    <p class="meta" style="margin:8px 0">${T('LittlePass is a booking platform. {studio} runs this class and asks every family to agree to this waiver. Your agreement is with {studio}.', { studio: sname })}</p>
    <label class="consent"><input type="checkbox" id="wvAgree"><span>${T('I have read this waiver and agree to it for myself and for: {names}.', { names: '<b>' + esc(f.names.join(', ')) + '</b>' })}</span></label>
    <div class="label">${T('Type your full name to sign')}</div><input id="wvName" maxlength="100" autocomplete="name" placeholder="${T('Your full name')}">
    <div class="err" id="wvErr"></div>
    <div class="actions"><button class="btn ghost" data-close>${T('Cancel')}</button><button class="btn" data-signwaiver>${T('Sign and continue')}</button></div>`);
}
async function signWaiverStep(btn) {
  const f = waiverFlow, w = f.list[f.i], err = $('#wvErr'), name = $('#wvName').value.trim();
  if (!$('#wvAgree').checked) { err.textContent = T('Please tick the box to agree.'); return; }
  if (name.length < 3) { err.textContent = T('Please type your full name to sign'); return; }
  btn.disabled = true;
  const { data, error } = await sb.rpc('sign_waiver', { p_waiver: w.id, p_version: w.version, p_signer: name, p_kids: f.names, p_user_agent: navigator.userAgent.slice(0, 300) });
  if (error) {
    btn.disabled = false; err.textContent = tx(error.message);
    if (/updated this waiver|no longer in use/.test(error.message)) { await loadPublic(); closeModal(); toast(tx(error.message)); }
    return;
  }
  mySignatures.unshift({ id: data, waiver_id: w.id, studio_id: w.studio_id, version: w.version, title: w.title, body: w.body, signer_name: name, kids: f.names, signed_at: new Date().toISOString() });
  if (++f.i < f.list.length) return showWaiverStep();
  waiverFlow = null; closeModal(); toast(T('Waiver signed ✓')); f.then();
}
function viewWaiver(text, title, studioId, signed) {
  const st = studioById(studioId);
  openModal(`<h2>${esc(title)}</h2><div class="meta">${esc(st ? st.name : '')}${signed ? ' · ' + T('Signed by {name} on {date} for {kids}', { name: esc(signed.signer_name), date: fmtDate(signed.signed_at), kids: esc((signed.kids || []).join(', ')) }) : ''}</div>
    <div class="waiverbox">${esc(text)}</div><div class="actions"><button class="btn ghost" data-close>${T('Close')}</button></div>`);
}
function signedWaiversPanel() {
  if (!mySignatures.length) return '';
  return `<div class="panel"><div class="label">${T('Signed waivers')}</div>
    ${mySignatures.map(sg => { const st = studioById(sg.studio_id); return `<div class="hist"><div><div>${esc(sg.title)} · ${esc(st ? st.name : '')}</div><div class="meta">${fmtDate(sg.signed_at)} · ${esc((sg.kids || []).join(', '))}</div></div>
      <a class="lnk" data-viewsig="${sg.id}">${T('View')}</a></div>`; }).join('')}</div>`;
}
const waiverNote = classId => waiversForClass(classId).length
  ? `<p class="meta" style="margin:8px 0 0">${T('📝 This studio asks families to sign a waiver before booking.')} ${waiversForClass(classId).map(w => `<a class="lnk" data-viewwaiver="${w.id}">${T('Read it')}</a>`).join(' · ')}</p>` : '';

// ---------- Views ----------
function pastCard(b) {
  const c = classes.find(x => x.id === b.class_id), st = studioById(b.studio_id), cat = CATS[c ? c.cat : 'all'];
  const rv = reviews.find(r => r.user_id === user.id && r.class_id === b.class_id);
  const date = new Date(b.session_date + 'T00:00:00').toLocaleDateString(LOCALE(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return `<div class="card">
    <div class="emoji" style="background:${cat.color}">${cat.emoji}</div>
    <div>
      <h3>${esc(b.class_title)}</h3>
      <div class="meta">${st ? `<a class="lnk" data-studio="${esc(st.name)}">${esc(st.name)}</a><br>` : ''}🗓 ${date} · ${t12(b.session_time)}</div>
      <div class="tags"><span class="tag">👶 ${esc(b.attendee_name)}</span>${rv ? `<span class="tag paid">${T('✓ Reviewed')} ${starStr(rv.stars)}</span>` : ''}</div>
    </div>
    <div class="right"><div class="cost">⭐ ${b.credits} <small>${T(b.credits === 1 ? 'credit' : 'credits')}</small></div>
      ${st && c ? `<button class="btn ${rv ? 'ghost' : ''}" data-goreview="${esc(st.name)}" data-cid="${c.id}">${rv ? T('Edit review') : T('Review')}</button>` : ''}</div></div>`;
}
function renderBookings() {
  if (!user) { $('#bookingList').innerHTML = `<div class="empty">${T('Log in to see your classes.')}<br><button class="btn" style="margin-top:12px" data-login>${T('Log in')}</button></div>`; return; }
  const past = pastBookings.slice().sort((x, y) => (y.session_date + y.session_time).localeCompare(x.session_date + x.session_time));
  const seg = `<div class="seg"><button data-bkview="upcoming" class="${bookView === 'upcoming' ? 'on' : ''}">${T('Upcoming ({n})', { n: myBookings.length + myWaitlist.length })}</button><button data-bkview="past" class="${bookView === 'past' ? 'on' : ''}">${T('Past ({n})', { n: past.length })}</button></div>`;
  if (bookView === 'past') {
    const studiosN = new Set(past.map(b => b.studio_id)).size;
    $('#bookingList').innerHTML = seg + (past.length
      ? `<div class="meta" style="margin:4px 0 10px">${T(past.length === 1 ? '{n} class attended' : '{n} classes attended', { n: past.length })} · ${T(studiosN === 1 ? '{n} studio' : '{n} studios', { n: studiosN })}</div><div class="grid">${past.map(pastCard).join('')}</div>`
      : `<div class="empty">${T('No past classes yet.')}<br>${T("They'll show up here after you attend.")}</div>`);
    return;
  }
  const list = [
    ...myBookings.map(b => ({ ...sessionFromBooking(b), booking: b })),
    ...myWaitlist.map(w => { const s = SESSIONS.find(x => x.id === `${w.slot_id}_${w.session_date}`); return s && { ...s, wait: w }; }).filter(Boolean),
  ].sort((x, y) => x.date - y.date || timeVal(x.time) - timeVal(y.time));
  $('#bookingList').innerHTML = seg + (list.length
    ? `<div class="grid">${list.map(s => card(s, 'booking')).join('')}</div>`
    : `<div class="empty">${T('No upcoming classes.')}<br><button class="btn" style="margin-top:12px" data-goexplore>${T('Find a class')}</button></div>`);
}
const subActive = () => !!(profile && ['active', 'trialing', 'past_due'].includes(profile.plan_status));
function renderPlans() {
  let banner = '';
  if (subActive()) {
    const end = profile.plan_period_end ? fmtDate(profile.plan_period_end) : '';
    banner = `<div class="notice ${profile.plan_status === 'past_due' ? 'rej' : 'pend'}" style="grid-column:1/-1;margin:0;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">
      <div>${profile.plan_status === 'past_due' ? T('⚠️ <b>Your last payment failed.</b> Please update your card to keep your credits coming.')
        : profile.cancel_at_period_end ? T('Your plan <b>cancels on {date}</b>. Unused credits expire then.', { date: end }) : T('✅ Your plan renews on <b>{date}</b>. Unused credits roll over, up to double your monthly credits. Upgrade anytime and get the extra credits right away. Downgrades start at your next renewal.', { date: end })}</div>
      <button class="btn" data-manage>${T('Manage subscription')}</button></div>`;
  }
  const isParent = !user || (profile && profile.role === 'parent');
  $('#planList').innerHTML = banner + planList().map(p => {
    const cur = subActive() && profile.plan === p.id;
    let btn = '';
    if (!isParent) btn = '';
    else if (cur) btn = `<button class="btn ghost" disabled>${T('✓ Current plan')}</button>`;
    else if (subActive()) { const curP = planList().find(x => x.id === profile.plan); btn = `<button class="btn ghost" data-manage>${curP && p.price > curP.price ? T('Upgrade') : T('Switch plan')}</button>`; }
    else if (!p.ready) btn = `<button class="btn ghost" disabled>${T('Coming soon')}</button>`;
    else btn = `<button class="btn" data-plan="${p.id}">${user ? T('Subscribe') : T('Log in to subscribe')}</button>`;
    return `<div class="plan ${p.pop ? 'pop' : ''}">
      ${p.pop ? `<div class="badge">${T('Most popular')}</div>` : ''}
      <h3>${esc(p.name)}</h3>
      <div class="price">$${p.price}<small>${T('/month')}</small></div>
      <div class="meta">${T('⭐ {n} credits every month', { n: p.credits })}</div>
      <ul>${p.perks.map(x => `<li>${esc(T(x))}</li>`).join('')}</ul>${btn}</div>`;
  }).join('');
}
// ---------- Your data: download everything, or delete the account ----------
function yourDataPanel() {
  const canDelete = profile && profile.role !== 'admin';
  return `<div class="panel"><div class="label">${T('Your data')}</div>
    <p class="meta" style="margin:0 0 10px">${canDelete ? T('You own your information. Download a copy any time, or delete your account.') : T('You own your information. Download a copy any time.')}</p>
    <button class="btn ghost" data-downloaddata>${T('⬇️ Download my data')}</button>
    ${canDelete ? ` <button class="btn ghost danger" data-opendelete>${T('Delete my account')}</button>` : ''}</div>`;
}
async function downloadMyData() {
  toast(T('Preparing your data…'));
  const out = { exported_at: new Date().toISOString(), email: user.email, account_created: user.created_at };
  const q = async (key, promise) => { const { data, error } = await promise; out[key] = error ? { error: error.message } : data; return data; };
  await q('profile', sb.from('profiles').select('*').eq('id', user.id));
  if (profile && profile.role === 'studio') {
    const st = await q('studio', sb.from('studios').select('*').eq('owner_id', user.id));
    const sid = st && st[0] && st[0].id;
    if (sid) {
      const cls = await q('classes', sb.from('classes').select('*').eq('studio_id', sid));
      const ids = (cls || []).map(c => c.id);
      if (ids.length) {
        await q('time_slots', sb.from('class_slots').select('*').in('class_id', ids));
        await q('class_addresses', sb.from('class_locations').select('*').in('class_id', ids));
      }
      await q('contact_info', sb.from('studio_contacts').select('*').eq('studio_id', sid));
      await q('photos', sb.from('studio_photos').select('*').eq('studio_id', sid));
      await q('bookings_received', sb.from('bookings').select('*').eq('studio_id', sid));
      await q('payouts', sb.from('payouts').select('*').eq('studio_id', sid));
      await q('reviews_received', sb.from('reviews').select('*').eq('studio_id', sid));
    }
  } else if (profile && profile.role === 'parent') {
    await q('children', sb.from('kids').select('*'));
    await q('bookings', sb.from('bookings').select('*').eq('user_id', user.id));
    await q('waitlists', sb.from('waitlist').select('*').eq('user_id', user.id));
    await q('reviews_written', sb.from('reviews').select('*').eq('user_id', user.id));
    await q('credit_history', sb.from('credit_ledger').select('*').eq('user_id', user.id));
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = `littlepass-my-data-${fmt(new Date())}.json`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  toast(T('Your data was downloaded ✓'));
}
function openDeleteAccount() {
  const studio = profile && profile.role === 'studio';
  openModal(`<h2>${T('Delete your account?')}</h2><p style="margin:0 0 8px"><b>${T("This can't be undone.")}</b></p>
    <ul style="margin:0 0 10px;padding-left:20px;font-size:14px;line-height:1.5">
      ${studio
        ? `<li>Your studio, classes, time slots, photos and contact info will be removed and hidden from parents.</li>
           <li>You can only close your account when you have <b>no upcoming bookings</b> and have been <b>paid everything you've earned</b>.</li>
           <li>We keep anonymised booking and payout records for tax and accounting.</li>`
        : `<li>${T('Your <b>subscription ends immediately</b> and any unused credits{n} are lost, with no refund.', { n: profile && profile.credits ? ` (⭐ ${profile.credits})` : '' })}</li>
           <li>${T('Your upcoming bookings are cancelled.')}</li>
           <li>${T("Your children's details and account information are deleted.")}</li>
           <li>${T('Reviews you wrote stay, without your name. We keep anonymised booking records for tax and accounting.')}</li>`}
    </ul>
    <p class="meta" style="margin:0 0 8px">${T('Want a copy first? Close this and tap <b>Download my data</b>.')}</p>
    <div class="label">${T('Type DELETE to confirm')}</div><input id="delConfirm" autocomplete="off" autocapitalize="characters" placeholder="DELETE">
    <div class="err" id="delErr"></div>
    <div class="actions"><button class="btn ghost" data-close>${T('Keep my account')}</button><button class="btn" style="background:#c0392b" data-confirmdelete>${T('Delete everything')}</button></div>`);
}
async function confirmDeleteAccount() {
  const err = $('#delErr'), btn = $('[data-confirmdelete]');
  if ($('#delConfirm').value.trim() !== 'DELETE') { err.textContent = T('Please type DELETE (in capitals) to confirm.'); return; }
  btn.disabled = true; btn.textContent = T('Deleting…'); err.textContent = '';
  try { await callFunction('delete-account', { confirm: 'DELETE' }); }
  catch (e) { err.textContent = tx(e.message); btn.disabled = false; btn.textContent = T('Delete everything'); return; }
  closeModal();
  try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {}
  user = null; profile = null; kids = []; myBookings = []; myWaitlist = []; studioBookings = []; pastBookings = [];
  await loadPublic(); buildSessions(); renderAll(); showTab('explore');
  toast(T('Your account was deleted. Take care! 🐣'));
}
async function callFunction(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
    throw new Error(msg);
  }
  return data;
}
async function startCheckout(planId) {
  if (!user) return openAuth('login', T('Log in or sign up to subscribe.'));
  track('start_checkout');
  toast(T('Opening secure checkout…'));
  try { const d = await callFunction('create-checkout', { plan: planId }); location.href = d.url; }
  catch (e) { toast(tx(e.message)); }
}
async function openPortal() {
  toast(T('Opening your subscription…'));
  try { const d = await callFunction('billing-portal', {}); location.href = d.url; }
  catch (e) { toast(tx(e.message)); }
}
async function afterCheckout(result) {
  showTab('plans');
  if (result === 'cancel') return toast(T('Checkout cancelled. No charge was made.'));
  if (result === 'portal') return;
  toast(T('Payment received! Adding your credits…'));
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 2000));
    if (!user) continue;
    await loadPrivate(); renderAll();
    if (profile && profile.plan_status === 'active' && profile.credits > 0) { toast(T("🎉 You're subscribed! ⭐ {n} credits added.", { n: profile.credits })); return; }
  }
  toast(T('Still processing. Your credits will appear in a minute.'));
}
function renderProfile() {
  const el = $('#view-profile');
  if (!user) {
    el.innerHTML = `<h2 style="margin-top:24px">${T('My family')}</h2><div class="panel"><p style="margin-top:0">${T('Log in to add your kids and get class suggestions for their exact age.')}</p>
      <button class="btn" data-login>${T('Log in')}</button> <button class="btn ghost" data-signup>${T('Sign up')}</button></div>`;
    return;
  }
  const isStudio = profile && profile.role === 'studio';
  el.innerHTML = `<h2 style="margin-top:24px">${isStudio ? T('My account') : T('My family')}</h2>
    <div class="panel"><div class="label">${T('Account')}</div>
      ${editName ? `<input id="myName" maxlength="60" value="${esc(profile ? profile.display_name || '' : '')}" placeholder="${T('Your name')}">
        <div class="meta" style="margin:-4px 0 10px">${T('Studios see this name on your bookings.')}</div>
        <button class="btn" data-savename>${T('Save')}</button> <button class="btn ghost" data-editname="0">${T('Cancel')}</button>`
      : `<div><b>${esc(profile ? profile.display_name : '')}</b> · ${isStudio ? T('🏢 Studio') : T('👶 Parent')} · <a class="lnk" data-editname="1">${T('Edit name')}</a></div>
      <div class="meta" style="margin-bottom:12px">${esc(user.email)}</div>
      ${isStudio ? '' : `<div class="meta" style="margin-bottom:10px">${T('Language')}: <a class="lnk" data-lang="en">${LANG === 'en' ? '<b>English</b>' : 'English'}</a> · <a class="lnk" data-lang="es">${LANG === 'es' ? '<b>Español</b>' : 'Español'}</a></div>`}
      <button class="btn ghost" data-logout>${T('Log out')}</button>`}</div>
    ${isStudio ? '' : `<div class="panel">
      <div class="label">${T('Add a child')}</div><input id="kidName" placeholder="${T('Name')}">
      <div class="label">${T('Birthday')}</div><input id="kidBday" type="date">
      <button class="btn" data-addkid>${T('Add child')}</button></div>
    <div class="panel"><div class="label">${T('Your kids')}</div>${kids.length ? kids.map(k => {
      const m = monthsOld(k.birthday);
      if (editKid === k.id) return `<div class="kid" style="flex-wrap:wrap"><input id="ekName" maxlength="60" value="${esc(k.name)}" style="flex:1 1 140px;margin:0">
        <input id="ekBday" type="date" value="${esc(k.birthday)}" style="flex:1 1 140px;margin:0">
        <button class="btn" data-savekid="${k.id}">${T('Save')}</button><button class="btn ghost" data-editkid="">${T('Cancel')}</button></div>`;
      return `<div class="kid"><span style="font-size:24px">👶</span><div><b>${esc(k.name)}</b><div class="meta">${m < 24 ? T('{n} months old', { n: m }) : T('{n} years old', { n: Math.floor(m / 12) })}</div></div>
        <span style="margin-left:auto;display:flex;gap:6px"><button class="btn ghost" data-editkid="${k.id}">${T('Edit')}</button><button class="btn ghost" data-rmkid="${k.id}">${T('Remove')}</button></span></div>`;
    }).join('') : `<p class="meta">${T("Add your child and we'll show classes for their exact age.")}</p>`}</div>
    ${creditHistoryPanel()}
    ${signedWaiversPanel()}`}
    ${yourDataPanel()}`;
}

// Every credit in and out: plan payments, bookings, refunds, adjustments
function creditHistoryPanel() {
  const rows = histAll ? myLedger : myLedger.slice(0, 8);
  return `<div class="panel"><div class="label">${T('Credit history')}</div>
    <div class="meta" style="margin-bottom:4px">${T('Balance now:')} <b>⭐ ${profile ? profile.credits : 0}</b></div>
    ${rows.length ? rows.map(l => `<div class="hist"><div><div>${esc(tx(l.reason))}</div><div class="meta">${fmtDate(l.created_at)}</div></div>
      <b class="${l.delta > 0 ? 'plus' : ''}">${l.delta > 0 ? '+' : ''}${l.delta}</b></div>`).join('') : `<p class="meta">${T('No credit activity yet.')}</p>`}
    ${myLedger.length > 8 ? `<button class="btn ghost" style="margin-top:8px" data-histall>${histAll ? T('Show less') : T('Show all ({n})', { n: myLedger.length })}</button>` : ''}</div>`;
}

// ---------- Studio area ----------
const studioStats = () => {
  const st = myStudio();
  const done = studioBookings.filter(b => b.session_date < todayStr);
  const up = studioBookings.filter(b => b.session_date >= todayStr);
  const earned = sum(done, b => b.price_cents);
  const paid = sum(payouts.filter(p => p.status === 'paid'), p => p.amount_cents);
  return { st, done, up, earned, paid, owed: earned - paid, upcoming: sum(up, b => b.price_cents) };
};
const upcomingForSlot = id => studioBookings.filter(b => b.slot_id === id && b.session_date >= todayStr);

function renderOwner() {
  const el = $('#view-owner');
  if (!user) {
    el.innerHTML = `<div class="hero" style="margin-top:20px"><h1>Fill your classes with San Diego families 🐣</h1>
      <p>List your baby and toddler classes on LittlePass. Set your own prices and schedule, and get paid for every booking.</p></div>
      <div class="panel"><ul style="margin:0 0 14px;padding-left:18px;line-height:1.8"><li>Add classes with several time slots, spots and prices</li><li>See who booked, in real time</li><li>Track what you've earned and when you were paid</li></ul>
      <button class="btn" data-signup-studio>Sign up as a studio</button> <button class="btn ghost" data-login>Log in</button></div>`;
    return;
  }
  if (!isStudioUser()) {
    el.innerHTML = `<h2 style="margin:24px 0 4px">Partner with LittlePass 🏢</h2><div class="panel"><p style="margin-top:0">You're logged in as a <b>parent</b>. Studio tools need a studio account. Log out, then sign up with a different email and choose <b>Studio</b>.</p><button class="btn ghost" data-logout>Log out</button></div>`;
    return;
  }
  const st = myStudio();
  if (!st) {
    el.innerHTML = `<h2 style="margin:24px 0 4px">Welcome! Let's set up your studio 🎉</h2><div class="panel">
      <div class="label">Studio name</div><input id="stName" placeholder="e.g. Sunny Days Music">
      <div class="label">Short description</div><textarea id="stBlurb" rows="3" placeholder="What makes your classes special?"></textarea>
      <button class="btn" data-createstudio>Create studio</button></div>`;
    return;
  }
  ({ overview: ownerOverview, classes: ownerClasses, bookings: ownerBookingsView, page: ownerPage, earnings: ownerEarnings, account: ownerAccount }[ownerTab] || ownerOverview)(el, st);
  if (st.status === 'pending') el.insertAdjacentHTML('afterbegin', '<div class="notice pend">⏳ <b>Your studio is waiting for approval.</b> You can set up your classes now. Parents will see them once LittlePass approves your studio.</div>');
  if (st.status === 'rejected') el.insertAdjacentHTML('afterbegin', `<div class="notice rej">🚫 <b>Your studio isn't approved right now.</b> Parents can't see your classes.${st.status_note ? ' Reason: ' + esc(st.status_note) : ''}</div>`);
}

function sessionRoster(st) {
  // upcoming sessions (next 2 weeks) with who's booked
  return SESSIONS.filter(s => s.studioId === st.id).sort((a, b) => a.date - b.date || timeVal(a.time) - timeVal(b.time));
}
const bar = (n, cap) => `<div class="fillbar"><div style="width:${cap ? Math.min(100, n / cap * 100) : 0}%"></div></div>`;

function ownerOverview(el, st) {
  const S = studioStats(), sess = sessionRoster(st), week = sess.filter(s => s.date <= DAYS[6]);  // "this week" stays 7 days
  const weekBk = studioBookings.filter(b => b.session_date >= fmt(DAYS[0]) && b.session_date <= fmt(DAYS[6]));
  const cap = sum(week, s => s.capacity), taken = sum(week, s => s.taken);
  el.innerHTML = `<h2 style="margin:24px 0 4px">Hi, ${esc(st.name)} 👋</h2>
    <div class="stats">
      <div class="stat"><b>${weekBk.length}</b>bookings this week</div>
      <div class="stat"><b>${cap ? Math.round(taken / cap * 100) : 0}%</b>spots filled this week</div>
      <div class="stat"><b>${money(S.owed)}</b>owed to you</div>
      <div class="stat"><b>${money(S.upcoming)}</b>booked, coming up</div></div>
    <h3 style="margin:22px 0 8px">Next sessions</h3>
    ${sess.length ? `<div class="panel" style="margin-top:0">${sess.slice(0, 8).map(s => `<div class="sess">
        <div><b>${esc(s.title)}</b><div class="meta">${dayName(s.date)} · ${s.time} · ${s.mins} min</div>
          <a class="lnk" style="font-size:13px" data-cancelsession="${s.key}|${s.dateStr}" data-n="${s.taken}">Cancel this session</a></div>
        <div style="text-align:right;min-width:90px"><b>${s.taken}/${s.capacity}</b> booked${bar(s.taken, s.capacity)}</div></div>`).join('')}</div>`
      : `<div class="panel"><p class="meta" style="margin:0">No sessions in the next 2 weeks. Add a class and time slots to get started.</p></div>`}
    ${(() => { const mine = CANCELLED.filter(c => c.studioId === st.id).sort((a, b) => a.date - b.date); return mine.length ? `<h3 style="margin:22px 0 8px">Cancelled sessions</h3><div class="panel" style="margin-top:0">${mine.map(c => `<div class="sess"><div><b>${esc(c.title)}</b><div class="meta">${dayName(c.date)} · ${c.time}${c.reason ? ' · ' + esc(c.reason) : ''}</div></div><button class="btn ghost" data-restoresession="${c.key}|${c.dateStr}">Reopen</button></div>`).join('')}</div>` : ''; })()}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="btn" data-goto="o-classes">Manage classes</button>
      <button class="btn ghost" data-goto="o-bookings">See bookings</button>
      <button class="btn ghost" data-studio="${esc(st.name)}">View public page</button></div>`;
}

// ----- Classes & schedule -----
const slotRow = sl => {
  const n = upcomingForSlot(sl.id).length;
  return `<div class="slot ${sl.active ? '' : 'off'}" data-slot="${sl.id}">
    <div><div class="mini">Day</div><select data-sf="dow">${DOW.map((d, i) => `<option value="${i}" ${i === sl.dow ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
    <div><div class="mini">Start</div><input type="time" data-sf="start_time" value="${String(sl.start_time).slice(0, 5)}"></div>
    <div><div class="mini">Minutes</div><input type="number" data-sf="mins" min="15" max="180" value="${sl.mins}"></div>
    <div><div class="mini">Spots</div><input type="number" data-sf="capacity" min="1" max="50" value="${sl.capacity}"></div>
    <div><div class="mini">Your price ($)</div><input type="number" data-sf="price" min="0" max="500" step="0.5" value="${(sl.price_cents / 100).toFixed(2)}"></div>
    <div><div class="mini">Parents pay</div><b class="cr">⭐ ${sl.credits}</b></div>
    <div><div class="mini">Open</div><input type="checkbox" data-sf="active" ${sl.active ? 'checked' : ''}></div>
    <div><button class="btn ghost" data-rmslot="${sl.id}" title="Delete this time slot">✕</button></div>
    ${n ? `<div class="meta slotnote">${n} upcoming booking${n > 1 ? 's' : ''}</div>` : ''}</div>`;
};
const ages = Array.from({ length: 61 }, (_, m) => m).filter(m => m <= 12 || m % 6 === 0);
const ageOpt = (m, sel) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${m < 12 ? m + ' mo' : (m / 12) + (m === 12 ? ' yr' : ' yrs')}</option>`;
const scheduleForm = () => `
  <div class="label">Days</div>
  <div class="days">${DOW.map((d, i) => `<label><input type="checkbox" data-ns="day" value="${i}">${d}</label>`).join('')}</div>
  <div class="two"><div><div class="label">Start time</div><input data-ns="time" type="time" value="10:00"></div>
  <div><div class="label">Length (min)</div><input data-ns="mins" type="number" value="45" min="15" max="180"></div></div>
  <div class="two"><div><div class="label">Spots</div><input data-ns="cap" type="number" value="8" min="1" max="50"></div>
  <div><div class="label">Your price per booking ($)</div><input data-ns="price" type="number" value="15" min="0" max="500" step="0.5"></div></div>
  <div class="meta nscr" style="margin:-4px 0 12px">Parents will pay ⭐ … credits</div>`;

function ownerClasses(el, st) {
  const cs = classes.filter(c => c.studio_id === st.id);
  el.innerHTML = `<h2 style="margin:24px 0 4px">Classes & schedule</h2>
    <p class="meta" style="margin:0 0 12px">Set your price for each time slot. Changes save automatically. LittlePass converts your price into the credits parents pay.</p>
    ${cs.map(c => {
      const cslots = slots.filter(x => x.class_id === c.id).sort((a, b) => a.dow - b.dow || String(a.start_time).localeCompare(String(b.start_time)));
      return `<div class="panel classbox" data-classbox="${c.id}">
        <div class="two"><div><div class="label">Class name</div><input data-cf="title" value="${esc(c.title)}"></div>
        <div><div class="label">Activity</div><select data-cf="cat">${Object.entries(CATS).filter(([id]) => id !== 'all').map(([id, k]) => `<option value="${id}" ${id === c.cat ? 'selected' : ''}>${k.emoji} ${k.label}</option>`).join('')}</select></div></div>
        <div class="two three"><div><div class="label">Neighborhood</div><select data-cf="hood">${HOODS.slice(1).map(h => `<option ${h === c.hood ? 'selected' : ''}>${h}</option>`).join('')}</select></div>
        <div><div class="label">From age</div><select data-cf="age_min">${ages.map(m => ageOpt(m, c.age_min)).join('')}</select></div>
        <div><div class="label">To age</div><select data-cf="age_max">${ages.map(m => ageOpt(m, c.age_max)).join('')}</select></div></div>
        ${(() => { const l = locByClass(c.id);
          return `<div class="two"><div><div class="label">Address</div><input data-lf="address" value="${esc(l ? l.address : '')}" placeholder="123 Main St, San Diego, CA" maxlength="200"></div>
          <div><div class="label">Who can see it</div><select data-lf="visibility"><option value="booked" ${!l || l.visibility === 'booked' ? 'selected' : ''}>Only parents who booked</option><option value="public" ${l && l.visibility === 'public' ? 'selected' : ''}>Everyone</option></select></div></div>
          <div class="meta" style="margin:-4px 0 10px">${!l ? 'No address yet. Add one so parents can get directions.' : l.lat != null ? '📍 Found on the map. ' + (l.visibility === 'public' ? 'Everyone sees the exact pin and directions.' : 'Others see only the neighborhood until they book.') : '⚠️ We couldn\'t place this address on the map. Check the spelling. Parents still get directions.'}</div>`; })()}
        <div><div class="label">Description</div><textarea data-cf="description" rows="3" maxlength="600" placeholder="What happens in this class? What will your little one do?">${esc(c.description || '')}</textarea></div>
        <div class="two"><div><div class="label">Focus</div><input data-cf="focus" maxlength="120" value="${esc(c.focus || '')}" placeholder="e.g. rhythm, listening, first words"></div>
        <div><div class="label">What to bring</div><input data-cf="what_to_bring" maxlength="200" value="${esc(c.what_to_bring || '')}" placeholder="e.g. swim diaper, towel"></div></div>
        <div class="two"><div><div class="label">Parent stays?</div><select data-cf="parent_stays">${Object.entries(PARENT_STAYS).map(([k, v]) => `<option value="${k}" ${c.parent_stays === k ? 'selected' : ''}>${v.replace(/^\S+\s/, '')}</option>`).join('')}</select></div>
        <div><div class="label">Level</div><select data-cf="level">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}" ${c.level === k ? 'selected' : ''}>${v.replace(/^\S+\s/, '')}</option>`).join('')}</select></div></div>
        <div class="label" style="margin-top:4px">Time slots</div>
        ${cslots.length ? cslots.map(slotRow).join('') : '<p class="meta">No time slots yet. Add one below.</p>'}
        <details class="addsched"><summary>＋ Add time slots</summary>${scheduleForm()}<button class="btn" data-addsched="${c.id}">Add slots</button></details>
        <button class="btn ghost danger" data-rmclass="${c.id}" style="margin-top:12px">Delete class</button></div>`;
    }).join('') || '<div class="panel"><p class="meta" style="margin:0">No classes yet. Create your first one below.</p></div>'}
    <details class="panel" id="newClass" ${cs.length ? '' : 'open'}><summary style="font-weight:800;font-size:17px;cursor:pointer">＋ New class</summary>
      <div style="margin-top:12px"><div class="label">Class name</div><input id="ncTitle" placeholder="e.g. Baby Music Circle">
      <div class="two"><div><div class="label">Activity</div><select id="ncCat">${Object.entries(CATS).filter(([id]) => id !== 'all').map(([id, k]) => `<option value="${id}">${k.emoji} ${k.label}</option>`).join('')}</select></div>
      <div><div class="label">Neighborhood</div><select id="ncHood">${HOODS.slice(1).map(h => `<option>${h}</option>`).join('')}</select></div></div>
      <div class="two"><div><div class="label">From age</div><select id="ncMin">${ages.map(m => ageOpt(m, 6)).join('')}</select></div>
      <div><div class="label">To age</div><select id="ncMax">${ages.map(m => ageOpt(m, 24)).join('')}</select></div></div>
      <div class="label">Description</div><textarea id="ncDesc" rows="3" maxlength="600" placeholder="What happens in this class?"></textarea>
      <div class="two"><div><div class="label">Focus</div><input id="ncFocus" maxlength="120" placeholder="e.g. rhythm, listening"></div>
      <div><div class="label">What to bring</div><input id="ncBring" maxlength="200" placeholder="e.g. swim diaper, towel"></div></div>
      <div class="two"><div><div class="label">Parent stays?</div><select id="ncStays">${Object.entries(PARENT_STAYS).map(([k, v]) => `<option value="${k}">${v.replace(/^\S+\s/, '')}</option>`).join('')}</select></div>
      <div><div class="label">Level</div><select id="ncLevel">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}" ${k === 'all' ? 'selected' : ''}>${v.replace(/^\S+\s/, '')}</option>`).join('')}</select></div></div>
      <div class="two"><div><div class="label">Address (optional)</div><input id="ncAddr" placeholder="123 Main St, San Diego, CA" maxlength="200"></div>
      <div><div class="label">Who can see it</div><select id="ncVis"><option value="booked">Only parents who booked</option><option value="public">Everyone</option></select></div></div>
      <div class="newsched">${scheduleForm()}</div>
      <button class="btn" data-createclass style="padding:12px 20px">Create class</button></div></details>`;
}

function readSchedule(box) {
  const g = k => box.querySelector(`[data-ns="${k}"]`);
  const days = [...box.querySelectorAll('[data-ns="day"]:checked')].map(i => +i.value);
  if (!days.length) { toast('Pick at least one day'); return null; }
  if (!g('time').value) { toast('Please choose a start time'); return null; }
  return { days, time: g('time').value + ':00', mins: clamp(+g('mins').value, 15, 180), cap: clamp(+g('cap').value, 1, 50),
    price: Math.round(clamp(+g('price').value, 0, 500) * 100) };
}
const slotRows = (classId, sch) => sch.days.map(d => ({ class_id: classId, dow: d, start_time: sch.time, mins: sch.mins, capacity: sch.cap, price_cents: sch.price }));

async function createClass() {
  const st = myStudio(), box = $('#newClass .newsched'), title = $('#ncTitle').value.trim();
  const min = +$('#ncMin').value, max = +$('#ncMax').value;
  if (!title) return toast('Please name the class');
  if (max < min) return toast('"To age" must be at least "From age"');
  const sch = readSchedule(box); if (!sch) return;
  const { data: c, error } = await sb.from('classes').insert({ studio_id: st.id, title, cat: $('#ncCat').value, hood: $('#ncHood').value, age_min: min, age_max: max,
    description: $('#ncDesc').value.trim() || null, focus: $('#ncFocus').value.trim() || null, what_to_bring: $('#ncBring').value.trim() || null,
    parent_stays: $('#ncStays').value, level: $('#ncLevel').value }).select().single();
  if (error) return toast(error.message);
  const r = await sb.from('class_slots').insert(slotRows(c.id, sch));
  if (r.error) toast(r.error.message);
  const addr = $('#ncAddr').value.trim();
  if (addr) await saveLocation(c.id, { address: addr, visibility: $('#ncVis').value }, true);
  await refresh(); toast(`✅ ${title} is live!`);
}
async function addSlots(classId, box) {
  const sch = readSchedule(box); if (!sch) return;
  const { error } = await sb.from('class_slots').insert(slotRows(classId, sch));
  if (error) return toast(error.message);
  await refresh(); toast('Time slots added ✓');
}
async function saveSlot(el) {
  const row = el.closest('[data-slot]'), id = row.dataset.slot, sl = slots.find(x => x.id === id), f = el.dataset.sf;
  const up = upcomingForSlot(id);
  let patch;
  if (f === 'dow') patch = { dow: +el.value };
  else if (f === 'start_time') { if (!el.value) return renderOwner(); patch = { start_time: el.value + ':00' }; }
  else if (f === 'mins') patch = { mins: clamp(+el.value, 15, 180) };
  else if (f === 'capacity') patch = { capacity: clamp(+el.value, 1, 50) };
  else if (f === 'price') patch = { price_cents: Math.round(clamp(+el.value, 0, 500) * 100) };
  else if (f === 'active') patch = { active: el.checked };
  if ((f === 'dow' || f === 'start_time') && up.length) { toast('This slot has upcoming bookings. Close it and add a new slot instead.'); return renderOwner(); }
  if (f === 'capacity') {
    const perDate = {}; up.forEach(b => { perDate[b.session_date] = (perDate[b.session_date] || 0) + 1; });
    const max = Math.max(0, ...Object.values(perDate));
    if (patch.capacity < max) { toast(`${max} spots are already booked on one date. Spots can't go below that.`); return renderOwner(); }
  }
  const { data, error } = await sb.from('class_slots').update(patch).eq('id', id).select().single();
  if (error) { toast(error.message); return renderOwner(); }
  Object.assign(sl, data); buildSessions();
  row.classList.toggle('off', !data.active);
  row.querySelector('.cr').textContent = '⭐ ' + data.credits;
  toast('Saved ✓');
}
async function saveLocation(classId, fields, quiet) {
  const cur = locByClass(classId);
  const address = (fields.address !== undefined ? fields.address : cur && cur.address || '').trim();
  const visibility = fields.visibility || (cur && cur.visibility) || 'booked';
  if (!address) {
    if (cur) { const { error } = await sb.from('class_locations').delete().eq('class_id', classId); if (error) return toast(error.message); }
  } else {
    if (address.length < 5) return toast('Please enter the full street address');
    let lat = cur ? cur.lat : null, lng = cur ? cur.lng : null;
    if (!cur || address !== cur.address) {
      if (!quiet) toast('Looking up that address…');
      const g = await geocode(address);
      lat = g ? g.lat : null; lng = g ? g.lng : null;
    }
    const { error } = await sb.from('class_locations').upsert({ class_id: classId, address, lat, lng, visibility, updated_at: new Date().toISOString() }, { onConflict: 'class_id' });
    if (error) return toast(error.message);
  }
  if (quiet) return;
  await loadPublic(); buildSessions(); renderOwner(); toast('Address saved ✓');
}
async function saveClassField(el) {
  const id = el.closest('[data-classbox]').dataset.classbox, c = classes.find(x => x.id === id), f = el.dataset.cf;
  const nullable = ['description', 'focus', 'what_to_bring'].includes(f);
  const v = ['age_min', 'age_max'].includes(f) ? +el.value : nullable ? (el.value.trim() || null) : el.value.trim();
  const patch = { [f]: v };
  if (f === 'title' && !v) { toast('Class name can\'t be empty'); return renderOwner(); }
  if ((f === 'age_min' && v > c.age_max) || (f === 'age_max' && v < c.age_min)) { toast('"To age" must be at least "From age"'); return renderOwner(); }
  const { error } = await sb.from('classes').update(patch).eq('id', id);
  if (error) { toast(error.message); return renderOwner(); }
  c[f] = v; buildSessions(); toast('Saved ✓');
}
async function cancelSessionUI(slotId, dateStr, taken) {
  const reason = prompt(`Cancel this session?\n${taken ? `${taken} parent${taken > 1 ? 's' : ''} will be emailed and refunded automatically.` : 'Nobody has booked it yet.'}\n\nReason (shown to parents, optional):`, '');
  if (reason === null) return;
  const { data, error } = await sb.rpc('cancel_session', { p_slot: slotId, p_date: dateStr, p_reason: reason });
  if (error) return toast(error.message);
  await refresh(); toast(data ? `Session cancelled. ${data} parent${data > 1 ? 's' : ''} refunded and emailed.` : 'Session cancelled');
}
async function restoreSessionUI(slotId, dateStr) {
  const { error } = await sb.rpc('restore_session', { p_slot: slotId, p_date: dateStr });
  if (error) return toast(error.message);
  await refresh(); toast('Session is open for booking again');
}
async function deleteSlot(id) {
  const n = upcomingForSlot(id).length;
  if (n && !confirm(`${n} upcoming booking${n > 1 ? 's' : ''} will be cancelled and the parents refunded. Delete this time slot?`)) return;
  const { error } = await sb.from('class_slots').delete().eq('id', id);
  if (error) return toast(error.message);
  await refresh(); toast('Time slot deleted');
}
async function deleteClass(id) {
  const n = studioBookings.filter(b => b.class_id === id && b.session_date >= todayStr).length;
  if (!confirm(n ? `${n} upcoming booking${n > 1 ? 's' : ''} will be cancelled and the parents refunded. Delete this class?` : 'Delete this class and all its time slots?')) return;
  const { error } = await sb.from('classes').delete().eq('id', id);
  if (error) return toast(error.message);
  await refresh(); toast('Class deleted');
}
let previewTimer;
function previewCredits(input) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    const box = input.closest('details, .panel'), out = box && box.querySelector('.nscr'); if (!out) return;
    const { data } = await sb.rpc('preview_credits', { p_price_cents: Math.round(clamp(+input.value, 0, 500) * 100) });
    if (data != null) out.textContent = `Parents will pay ⭐ ${data} credit${data === 1 ? '' : 's'}`;
  }, 250);
}

// ----- Bookings -----
function ownerBookingsView(el, st) {
  const list = studioBookings.filter(b => bkFilter === 'upcoming' ? b.session_date >= todayStr : b.session_date < todayStr);
  const groups = {};
  list.forEach(b => { (groups[`${b.session_date}_${b.session_time}_${b.slot_id || b.class_title}`] ||= []).push(b); });
  const keys = Object.keys(groups).sort();
  if (bkFilter === 'past') keys.reverse();
  el.innerHTML = `<h2 style="margin:24px 0 4px">Bookings</h2>
    <div class="seg"><button data-bkf="upcoming" class="${bkFilter === 'upcoming' ? 'on' : ''}">Upcoming</button><button data-bkf="past" class="${bkFilter === 'past' ? 'on' : ''}">Past</button></div>
    ${keys.length ? keys.slice(0, 60).map(k => {
      const g = groups[k], b0 = g[0], sl = slots.find(x => x.id === b0.slot_id);
      return `<div class="panel" style="margin-top:10px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div><b>${esc(b0.class_title)}</b><div class="meta">${dateLabel(b0.session_date)} · ${t12(b0.session_time)}</div>${bkFilter === 'upcoming' && b0.slot_id ? `<a class="lnk" style="font-size:13px" data-cancelsession="${b0.slot_id}|${b0.session_date}" data-n="${g.length}">Cancel this session</a>` : ''}</div>
        <div style="text-align:right;min-width:90px"><b>${g.length}${sl ? '/' + sl.capacity : ''}</b> booked${sl ? bar(g.length, sl.capacity) : ''}</div></div>
        ${g.map(b => `<div class="kid"><span style="font-size:22px">👶</span><div><b>${esc(b.attendee_name)}</b><div class="meta">Parent: ${esc(b.parent_name)}${waiverBadge(b)}</div></div><div style="margin-left:auto" class="cost">${money(b.price_cents)}</div></div>`).join('')}</div>`;
    }).join('') : `<div class="empty">${bkFilter === 'upcoming' ? 'No upcoming bookings yet.' : 'No past bookings yet.'}</div>`}`;
}

// ----- Earnings -----
function ownerEarnings(el, st) {
  const S = studioStats();
  const byClass = {};
  S.done.forEach(b => { const r = (byClass[b.class_title] ||= { n: 0, cents: 0 }); r.n++; r.cents += b.price_cents; });
  el.innerHTML = `<h2 style="margin:24px 0 4px">Earnings</h2>
    <p class="meta" style="margin:0">You earn the price you set for each booking. A class counts as earned once it has taken place.</p>
    <div class="stats" style="margin-top:12px">
      <div class="stat"><b>${money(S.earned)}</b>earned so far</div>
      <div class="stat"><b>${money(S.paid)}</b>paid to you</div>
      <div class="stat"><b>${money(S.owed)}</b>owed to you</div>
      <div class="stat"><b>${money(S.upcoming)}</b>booked, coming up</div></div>
    <h3 style="margin:22px 0 8px">Payments</h3>
    <div class="panel" style="margin-top:0">${payouts.length ? payouts.map(p => `<div class="kid">
      <div><b>${money(p.amount_cents)}</b><div class="meta">Classes from ${dateLabel(p.period_start)} to ${dateLabel(p.period_end)}${p.reference ? ' · ' + esc(p.reference) : ''}</div></div>
      <div style="margin-left:auto;text-align:right">${p.status === 'paid'
        ? `<span class="tag paid">✓ Paid ${new Date(p.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>`
        : '<span class="tag pend">Processing</span>'}</div></div>`).join('')
      : '<p class="meta" style="margin:0">No payments yet. They\'ll show up here with the date they were sent.</p>'}</div>
    <h3 style="margin:22px 0 8px">By class</h3>
    <div class="panel" style="margin-top:0">${Object.keys(byClass).length ? Object.entries(byClass).map(([t, r]) => `<div class="kid"><div><b>${esc(t)}</b><div class="meta">${r.n} booking${r.n > 1 ? 's' : ''} completed</div></div><div style="margin-left:auto" class="cost">${money(r.cents)}</div></div>`).join('')
      : '<p class="meta" style="margin:0">Completed bookings will show up here.</p>'}</div>`;
}

// ----- Page: photos + reviews -----
async function resizeToJpeg(file, maxW = 1600) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bmp.width), c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
}
function ownerPage(el, st) {
  const photos = studioPhotos.filter(p => p.studio_id === st.id);
  const rvs = reviews.filter(r => r.studio_id === st.id).slice().reverse();
  el.innerHTML = `<h2 style="margin:24px 0 4px">Your page</h2>
    <p class="meta" style="margin:0">This is what parents see on your studio page.</p>
    <div class="panel"><h3 style="margin:0 0 10px">Photos <span class="meta">(${photos.length}/24)</span></h3>
      ${photos.length ? `<div class="photos real">${photos.map(p => `<div class="phwrap"><img class="photo" src="${photoUrl(p)}" alt=""><button class="phdel" data-delphoto="${p.id}" title="Delete photo">✕</button></div>`).join('')}</div>` : '<p class="meta">No photos yet. Add some so parents can see your space and your classes.</p>'}
      <div class="label" style="margin-top:14px">Add a photo</div>
      <input id="phFile" type="file" accept="image/jpeg,image/png,image/webp">
      <input id="phCap" placeholder="Caption (optional)" maxlength="120">
      <label class="consent"><input type="checkbox" id="phConsent"> I have permission from the parents or guardians of any children shown in this photo.</label>
      <button class="btn" data-uploadphoto>Upload photo</button></div>
    <h3 style="margin:22px 0 8px">What parents are saying</h3>
    ${rvs.length ? rvs.map(r => `<div class="panel" style="margin-top:10px"><div><b>${esc(r.author)}</b> <span class="stars">${starStr(r.stars)}</span> <span class="tag paid">✓ Verified attendee</span></div>
      <div class="meta">${esc(r.class_title || '')} · ${fmtDate(r.created_at)}${r.instructor_stars ? ` · Instructor ${r.instructor_stars}★ · Cleanliness ${r.clean_stars}★ · Value ${r.value_stars}★` : ''}</div>
      <div style="margin:6px 0 10px">${esc(r.body)}</div>
      <textarea data-replybox="${r.id}" rows="2" maxlength="500" placeholder="Write a public reply…">${esc(r.reply || '')}</textarea>
      <button class="btn ghost" data-savereply="${r.id}">${r.reply ? 'Update reply' : 'Reply'}</button></div>`).join('')
      : '<div class="panel"><p class="meta" style="margin:0">No reviews yet. Parents can review a class after they attend it.</p></div>'}`;
}
async function uploadPhoto() {
  const st = myStudio(), f = $('#phFile').files[0];
  if (!f) return toast('Choose a photo first');
  if (!$('#phConsent').checked) return toast('Please confirm you have permission from parents');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return toast('Please use a JPG, PNG or WebP photo');
  if (f.size > 25 * 1024 * 1024) return toast('That photo is too large');
  const btn = $('[data-uploadphoto]'); btn.disabled = true; btn.textContent = 'Uploading…';
  try {
    const blob = await resizeToJpeg(f);
    const path = `${st.id}/${crypto.randomUUID()}.jpg`;
    const up = await sb.storage.from('studio-photos').upload(path, blob, { contentType: 'image/jpeg' });
    if (up.error) throw up.error;
    const ins = await sb.from('studio_photos').insert({ studio_id: st.id, path, caption: $('#phCap').value.trim() || null, consent: true });
    if (ins.error) { await sb.storage.from('studio-photos').remove([path]); throw ins.error; }
    await loadPublic(); renderOwner(); toast('Photo added 📸');
  } catch (err) {
    toast(err.message || "Couldn't upload that photo. Try a JPG or PNG.");
    btn.disabled = false; btn.textContent = 'Upload photo';
  }
}
async function deletePhoto(id) {
  const p = studioPhotos.find(x => x.id === id);
  if (!confirm('Delete this photo?')) return;
  const { error } = await sb.from('studio_photos').delete().eq('id', id);
  if (error) return toast(error.message);
  await sb.storage.from('studio-photos').remove([p.path]);
  await loadPublic(); renderOwner(); toast('Photo deleted');
}
async function saveReply(id) {
  const box = document.querySelector(`[data-replybox="${id}"]`);
  const { error } = await sb.rpc('reply_to_review', { p_review: id, p_reply: box.value });
  if (error) return toast(error.message);
  await loadPublic(); renderOwner(); toast('Reply saved ✓');
}

// ----- Account -----
function ownerAccount(el, st) {
  el.innerHTML = `<h2 style="margin:24px 0 4px">Account</h2>
    <div class="panel"><div class="label">Studio name</div><input id="acName" value="${esc(st.name)}">
      <div class="label">Description</div><textarea id="acBlurb" rows="3">${esc(st.blurb || '')}</textarea>
      <button class="btn" data-savestudio>Save</button> <button class="btn ghost" data-studio="${esc(st.name)}">View public page</button></div>
    <div class="panel"><div class="label">Contact info</div>
      <p class="meta" style="margin:0 0 10px">Shared <b>only with parents who have booked</b> with you. It's never shown publicly.</p>
      ${(() => { const ct = contacts.find(x => x.studio_id === st.id) || {}; return `<div class="two"><div><div class="label">Phone</div><input id="ctPhone" maxlength="30" value="${esc(ct.phone || '')}" placeholder="(619) 555-0100"></div>
      <div><div class="label">Website</div><input id="ctWeb" maxlength="200" value="${esc(ct.website || '')}" placeholder="yourstudio.com"></div></div>
      <div class="label">Arrival notes</div><textarea id="ctNotes" rows="2" maxlength="300" placeholder="e.g. Ring the bell at the side door. Parking is behind the building.">${esc(ct.arrival_notes || '')}</textarea>`; })()}
      <button class="btn" data-savecontact>Save contact info</button></div>
    ${waiversPanel(st)}
    <div class="panel"><div class="label">Login</div><div class="meta" style="margin-bottom:12px">${esc(user.email)}</div><button class="btn ghost" data-logout>Log out</button></div>
    ${yourDataPanel()}`;
}
// ----- Waivers -----
function waiverForm(st, w) {
  const cs = classes.filter(c => c.studio_id === st.id), some = w && w.class_ids && w.class_ids.length;
  return `<div style="border-top:1px solid var(--line);padding-top:10px;margin-top:10px">
    <div class="label">Title</div><input id="wvTitle" maxlength="120" value="${esc(w ? w.title : '')}" placeholder="e.g. Release of liability and assumption of risk">
    <div class="label">Waiver text</div><textarea id="wvBody" rows="10" maxlength="20000" placeholder="Paste your full waiver here, exactly as your lawyer or insurer wrote it.">${esc(w ? w.body : '')}</textarea>
    <div class="label">Applies to</div>
    <label class="chk"><input type="radio" name="wvScope" value="all" ${some ? '' : 'checked'}> All my classes</label>
    <label class="chk"><input type="radio" name="wvScope" value="some" ${some ? 'checked' : ''}> Only these classes:</label>
    <div style="padding-left:30px">${cs.map(c => `<label class="chk"><input type="checkbox" data-wvcls value="${c.id}" ${some && w.class_ids.includes(c.id) ? 'checked' : ''}> ${esc(c.title)}</label>`).join('') || '<div class="meta">Add classes first.</div>'}</div>
    ${w ? '<p class="meta">Changing the title or text creates a new version. Families sign it again at their next booking.</p>' : ''}
    <button class="btn" data-wvsave>${w ? 'Save changes' : 'Add waiver'}</button> <button class="btn ghost" data-wvcancel>Cancel</button></div>`;
}
function waiversPanel(st) {
  const signed = id => studioSignatures.filter(g => g.waiver_id === id).length;
  const scope = w => !w.class_ids || !w.class_ids.length ? 'All classes' : w.class_ids.map(id => (classes.find(c => c.id === id) || {}).title).filter(Boolean).map(esc).join(', ');
  return `<div class="panel"><div class="label">Waivers</div>
    <p class="meta" style="margin:0 0 10px">Ask families to agree to your waiver before they book. They read it and sign in the app (tick a box and type their name), and you can see who signed for each booking.
      Have your lawyer or insurer write or review the wording. LittlePass shows and records the waiver; it doesn't give legal advice.</p>
    ${ownWaivers.map(w => editWaiver === w.id ? waiverForm(st, w) : `<div class="hist"><div><div><b>${esc(w.title)}</b> ${w.active ? '<span class="tag paid">Active</span>' : '<span class="tag">Off</span>'}</div>
      <div class="meta">Version ${w.version} · ${scope(w)} · ${signed(w.id)} signature${signed(w.id) === 1 ? '' : 's'}</div></div>
      <span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn ghost" data-wvedit="${w.id}">Edit</button><button class="btn ghost" data-wvtoggle="${w.id}">${w.active ? 'Turn off' : 'Turn on'}</button></span></div>`).join('')}
    ${editWaiver === 'new' ? waiverForm(st, null) : `<button class="btn ${ownWaivers.length ? 'ghost' : ''}" style="margin-top:10px" data-wvnew>+ Add a waiver</button>`}
    ${studioSignatures.length ? ` <button class="btn ghost" style="margin-top:10px" data-wvcsv>⬇ Download signatures (CSV)</button>` : ''}</div>`;
}
async function saveWaiver() {
  const st = myStudio(), title = $('#wvTitle').value.trim(), body = $('#wvBody').value.trim();
  const some = (document.querySelector('input[name=wvScope]:checked') || {}).value === 'some';
  const ids = [...document.querySelectorAll('[data-wvcls]:checked')].map(i => i.value);
  if (title.length < 3) return toast('Please give the waiver a title');
  if (body.length < 50) return toast('Please paste the full waiver text (at least 50 characters)');
  if (some && !ids.length) return toast('Pick at least one class, or choose All my classes');
  const row = { title, body, class_ids: some ? ids : null };
  const cur = editWaiver !== 'new' && ownWaivers.find(w => w.id === editWaiver);
  if (cur && (cur.title !== title || cur.body !== body) && !confirm('This creates a new version. Families will sign it again at their next booking. Continue?')) return;
  const { error } = cur ? await sb.from('studio_waivers').update(row).eq('id', cur.id) : await sb.from('studio_waivers').insert({ ...row, studio_id: st.id });
  if (error) return toast(error.message);
  editWaiver = null; await refresh(); toast(cur ? 'Waiver updated' : 'Waiver added. Families will sign it before booking.');
}
async function toggleWaiver(id) {
  const w = ownWaivers.find(x => x.id === id); if (!w) return;
  if (w.active && !confirm('Turn off this waiver? Families won\'t be asked to sign it anymore. Signatures you already have are kept.')) return;
  const { error } = await sb.from('studio_waivers').update({ active: !w.active }).eq('id', id);
  if (error) return toast(error.message);
  await refresh(); toast(w.active ? 'Waiver turned off' : 'Waiver turned on');
}
function downloadSignatures() {
  downloadCsv(studioSignatures.map(g => ({ signed_at: g.signed_at, signed_by: g.signer_name, children: (g.kids || []).join('; '), waiver: g.title, version: g.version, waiver_text: g.body })),
    `waiver-signatures-${fmt(new Date())}.csv`);
}
// For each booking: did this family sign every waiver that applies to the class?
function waiverBadge(b) {
  const ws = ownWaivers.filter(w => w.active && (!w.class_ids || w.class_ids.includes(b.class_id)));
  if (!ws.length) return '';
  const ok = ws.every(w => studioSignatures.some(g => g.waiver_id === w.id && g.user_id === b.user_id && (g.kids || []).includes(b.attendee_name)));
  return ok ? ' <span class="tag paid">✓ Waiver signed</span>' : ' <span class="tag low">No waiver on file</span>';
}

async function saveContact() {
  const st = myStudio();
  const web = $('#ctWeb').value.trim();
  if (web && !safeUrl(web)) return toast('Please enter a valid website, like yourstudio.com');
  const row = { studio_id: st.id, phone: $('#ctPhone').value.trim() || null, website: web ? safeUrl(web) : null, arrival_notes: $('#ctNotes').value.trim() || null, updated_at: new Date().toISOString() };
  const { error } = await sb.from('studio_contacts').upsert(row, { onConflict: 'studio_id' });
  if (error) return toast(error.message);
  await loadPublic(); renderOwner(); toast('Contact info saved ✓');
}
async function saveStudio() {
  const st = myStudio(), name = $('#acName').value.trim();
  if (!name) return toast('Studio name can\'t be empty');
  const { error } = await sb.from('studios').update({ name, blurb: $('#acBlurb').value.trim() || null }).eq('id', st.id);
  if (error) return toast(error.message.includes('duplicate') ? 'That studio name is taken' : error.message);
  await refresh(); toast('Saved ✓');
}
async function createStudio() {
  const name = $('#stName').value.trim();
  if (!name) return toast('Please enter your studio name');
  const { error } = await sb.from('studios').insert({ owner_id: user.id, name, blurb: $('#stBlurb').value.trim() || null });
  if (error) return toast(error.message.includes('duplicate') ? 'That studio name is taken' : error.message);
  ownerTab = 'classes'; await refresh(); toast('Studio created 🎉 Add your classes while we review it');
}
const ov = $('#view-owner');
ov.addEventListener('change', e => {
  const s = e.target.closest('[data-sf]'); if (s) return saveSlot(s);
  const c = e.target.closest('[data-cf]'); if (c) return saveClassField(c);
  const lf = e.target.closest('[data-lf]'); if (lf) {
    const id = lf.closest('[data-classbox]').dataset.classbox;
    return saveLocation(id, lf.dataset.lf === 'address' ? { address: lf.value } : { visibility: lf.value });
  }
});
ov.addEventListener('input', e => { if (e.target.matches('[data-ns="price"]')) previewCredits(e.target); });

// ---------- Admin ----------
const adminCard = s => {
  const cs = classes.filter(c => c.studio_id === s.id);
  const tag = { pending: '<span class="tag pend">⏳ Pending</span>', approved: '<span class="tag paid">✓ Approved</span>', rejected: '<span class="tag rej">Rejected</span>' }[s.status];
  return `<div class="panel">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
      <div><b style="font-size:17px">${esc(s.name)}</b> ${tag}
        <div class="meta">${s.owner_id ? `${esc(s.owner_name || '')} · ${esc(s.owner_email || '')}` : 'Sample partner (no owner)'} · signed up ${new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${s.status !== 'approved' ? `<button class="btn" data-setstatus="${s.id}" data-to="approved">Approve</button>` : ''}
        ${s.status !== 'rejected' ? `<button class="btn ghost danger" data-setstatus="${s.id}" data-to="rejected">${s.status === 'approved' ? 'Suspend' : 'Reject'}</button>` : ''}</div></div>
    ${s.status_note ? `<div class="meta" style="margin-top:6px">Note: ${esc(s.status_note)}</div>` : ''}
    ${s.blurb ? `<p style="margin:10px 0 0">${esc(s.blurb)}</p>` : ''}
    <details style="margin-top:10px"><summary style="cursor:pointer;font-weight:800;color:var(--brand-dark)">${cs.length} class${cs.length === 1 ? '' : 'es'}</summary>
      ${cs.map(c => { const ss = slots.filter(x => x.class_id === c.id).sort((a, b) => a.dow - b.dow);
        return `<div style="margin-top:10px"><b>${CATS[c.cat].emoji} ${esc(c.title)}</b> <span class="meta">· ${esc(c.hood)} · ${ageText(c.age_min, c.age_max)}${locByClass(c.id) ? ' · 📍 ' + esc(locByClass(c.id).address) : ''}</span>
          ${ss.map(x => `<div class="meta">${DOW[x.dow]} ${t12(x.start_time)} · ${x.capacity} spots · ${money(x.price_cents)} → ⭐ ${x.credits}${x.active ? '' : ' (closed)'}</div>`).join('') || '<div class="meta">No time slots</div>'}</div>`; }).join('') || '<div class="meta" style="margin-top:8px">No classes yet.</div>'}</details></div>`;
};
function renderAdmin() {
  const el = $('#view-admin');
  if (!isAdmin()) { el.innerHTML = '<div class="empty">Admins only.</div>'; return; }
  if (adminTab === 'account') {
    el.innerHTML = `<h2 style="margin:24px 0 4px">Account</h2><div class="panel"><div class="label">Admin login</div><div class="meta" style="margin-bottom:12px">${esc(user.email)}</div><button class="btn ghost" data-logout>Log out</button></div>
      <div class="panel"><div class="label">Pricing</div><div class="meta" style="margin-bottom:8px">Credit value, your margin, the most a class can cost and the cancellation window.</div>
        <button class="btn ghost" data-goto="a-pricing">🧮 Pricing settings</button></div>
      <div class="panel"><div class="label">Growth</div><div class="meta" style="margin-bottom:8px">Referral links, families and studios brought in by partners, and who has earned a bonus.</div>
        <button class="btn ghost" data-goto="a-growth">🤝 Growth and partners</button></div>
      <div class="panel"><div class="label">Download as a spreadsheet (CSV)</div>
        <div class="meta" style="margin-bottom:8px">Opens in Excel, Numbers or Google Sheets. Handy for your accountant.</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${[['people', 'People'], ['bookings', 'All bookings'], ['payouts', 'Payouts'], ['credits', 'Credit history'], ['activity', 'Admin activity']]
          .map(([k, l]) => `<button class="btn ghost" data-export="${k}">⬇ ${l}</button>`).join('')}</div></div>
      <div class="panel"><div class="label">Recent admin activity</div>
        ${adminAudit.length ? adminAudit.map(a => `<div class="hist"><div><div>${esc(AUDIT[a.action] || a.action)}${a.target ? ` · <b>${esc(a.target)}</b>` : ''}</div>
          <div class="meta">${auditDetail(a)}</div></div><span class="meta" style="white-space:nowrap">${fmtDate(a.created_at)}</span></div>`).join('') : '<p class="meta">Nothing yet. Approvals, payouts, price changes, credit adjustments and refunds show up here.</p>'}</div>
      ${yourDataPanel()}`;
    return;
  }
  if (adminTab === 'people') return renderAdminPeople(el);
  if (adminTab === 'stats') return renderAdminStats(el);
  if (adminTab === 'payouts') return renderAdminPayouts(el);
  if (adminTab === 'pricing') return renderAdminPricing(el);
  if (adminTab === 'reports') return renderAdminReports(el);
  if (adminTab === 'growth') return renderAdminGrowth(el);
  const n = st => adminStudios.filter(s => s.status === st).length;
  const list = adminStudios.filter(s => adminFilter === 'all' || s.status === adminFilter);
  el.innerHTML = `<h2 style="margin:24px 0 4px">Studios</h2>
    <div class="seg" style="flex-wrap:wrap">${[['pending', `Pending (${n('pending')})`], ['approved', `Approved (${n('approved')})`], ['rejected', `Rejected (${n('rejected')})`], ['all', 'All']].map(([k, l]) => `<button data-adminf="${k}" class="${adminFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${list.length ? list.map(adminCard).join('') : `<div class="empty">${adminFilter === 'pending' ? 'No studios waiting for approval 🎉' : 'Nothing here.'}</div>`}`;
}
// ----- Admin: stats -----
async function loadAdminStats() {
  const { data, error } = await sb.rpc('admin_stats');
  if (error) { toast(error.message); return; }
  adminStats = data; if (currentView === 'admin' && adminTab === 'stats') renderAdmin();
}
function renderAdminStats(el) {
  if (!adminStats) { el.innerHTML = '<h2 style="margin:24px 0 4px">Stats</h2><div class="empty">Crunching numbers… 📊</div>'; loadAdminStats(); return; }
  const S = adminStats, N = S.now, F = S.funnel_30d;
  const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '–';
  const maxB = Math.max(1, ...S.weeks.map(w => Math.max(w.bookings, w.visits, w.new_parents)));
  const bar = (v, color) => `<span style="display:inline-block;height:8px;border-radius:4px;background:${color};width:${Math.max(v ? 4 : 0, Math.round(70 * v / maxB))}px;vertical-align:middle;margin-right:4px"></span>${v}`;
  const steps = [['Visited', F.visits], ['Looked at a studio', F.viewed_studio], ['Started signing up', F.started_signup], ['Signed up', F.signed_up],
    ['Started checkout', F.started_checkout], ['Subscribed', F.subscribed], ['Booked a class', F.booked]];
  el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin:24px 0 4px"><h2 style="margin:0">Stats</h2><button class="btn ghost" data-refreshstats>↻ Refresh</button></div>
    <p class="meta" style="margin:0">Visit tracking started Oct 1, 2026. Your own visits on the live site count too.</p>
    <div class="stats">
      <div class="stat"><b>${N.subscribers}</b>active subscribers${N.past_due ? `<div class="meta low">${N.past_due} payment failed</div>` : ''}</div>
      <div class="stat"><b>${money(N.mrr_cents)}</b>monthly revenue</div>
      <div class="stat"><b>${N.parents}</b>families signed up</div>
      <div class="stat"><b>${N.studios_live}</b>live studios${N.studios_pending ? `<div class="meta">${N.studios_pending} waiting</div>` : ''}</div>
      <div class="stat"><b>${N.upcoming_bookings}</b>bookings, next 14 days<div class="meta">${pct(N.upcoming_bookings, N.seats_next_14)} of ${N.seats_next_14} spots</div></div>
      <div class="stat"><b>${N.waitlist}</b>on waitlists</div></div>
    <div class="panel"><div class="label">Money to keep an eye on</div>
      <div class="hist"><div>Unused credits families hold<div class="meta">What you'd pay studios if every credit got used</div></div><b>⭐ ${N.credits_outstanding} ≈ ${money(N.credits_outstanding_cost_cents)}</b></div>
      <div class="hist"><div>Owed to studios<div class="meta">Classes already held, not paid out yet</div></div><b>${money(N.owed_to_studios_cents)}</b></div>
      ${Object.keys(N.by_plan || {}).length ? `<div class="hist"><div>Subscribers by plan</div><b>${Object.entries(N.by_plan).map(([k, v]) => `${esc(k)} ${v}`).join(' · ')}</b></div>` : ''}</div>
    <div class="panel"><div class="label">Last 8 weeks</div><div style="overflow-x:auto"><table class="wk"><tr><th>Week of</th><th>Visits</th><th>New families</th><th>Bookings</th><th>Cancelled</th></tr>
      ${S.weeks.slice().reverse().map(w => `<tr><td>${dateLabel(w.week).replace(/^\w+, /, '')}</td><td>${bar(w.visits, '#c9c3d6')}</td><td>${bar(w.new_parents, '#7cc4a4')}</td><td>${bar(w.bookings, 'var(--brand)')}</td><td>${w.cancellations}</td></tr>`).join('')}</table></div></div>
    <div class="panel"><div class="label">From visit to booking, last 30 days</div>
      ${steps.map(([l, v]) => `<div class="hist"><div>${l}</div><b>${v} <span class="meta" style="font-weight:600">${pct(v, F.visits)}</span></b></div>`).join('')}
      <p class="meta" style="margin:8px 0 0">Percentages are of visits. Families who signed up before Oct 1 aren't linked to a visit.</p></div>
    ${S.top_classes_30d.length ? `<div class="panel"><div class="label">Most booked classes, last 30 days</div>${S.top_classes_30d.map(t => `<div class="hist"><div>${esc(t.title)}<div class="meta">${esc(t.studio)}</div></div><b>${t.n}</b></div>`).join('')}</div>` : ''}
    ${S.top_studios_viewed_30d.length ? `<div class="panel"><div class="label">Most viewed studios, last 30 days</div>${S.top_studios_viewed_30d.map(t => `<div class="hist"><div>${esc(t.studio)}</div><b>${t.n}</b></div>`).join('')}</div>` : ''}
    <div class="panel"><div class="label">Health, last 7 days</div>
      <div class="hist"><div>App errors in people's browsers</div><b class="${S.errors_7d ? 'low' : 'plus'}">${S.errors_7d}</b></div>
      <div class="hist"><div>Emails that failed to send</div><b class="${S.failed_emails_7d ? 'low' : 'plus'}">${S.failed_emails_7d}</b></div>
      ${S.recent_errors.map(e => `<div class="meta" style="padding:6px 0;border-top:1px solid var(--line)"><b>${esc(e.message)}</b><br>${e.n}× · last ${fmtDate(e.last_seen)} · ${esc(e.page || '')}</div>`).join('')}
      <p class="meta" style="margin:8px 0 0">You also get a summary email every morning around 8am.</p></div>`;
}

// ----- Admin: growth (referral partners and studio bonuses) -----
// The pay rules live here. If the agreement changes, change these numbers.
const REF_RATE = { referral: 10, ad: 5, studio: 5 };        // $ per family that has paid for 60+ days, by how they arrived
const SRC_LABEL = { referral: 'Own outreach', ad: 'Paid ads', studio: 'Studio flyers and emails' };
const FEE = { live: 100, first: 100, month: 100 };           // $ per studio: classes live, first booking, each month with 30+ bookings (3 at most)
const MONTH_GOAL = 30, MONTHS_TO_QUALIFY = 3, WINDOW = 6;    // 30+ completed bookings in a month, in 3 of the studio's first 6 months
const EQUITY_PER_STUDIO = 0.1;                               // % of the company for each studio that qualifies (cap 10%)
// months: [{ month: 'YYYY-MM-01', n }], first: 'YYYY-MM-DD' | null, today: 'YYYY-MM-DD'. Month 1 is the month of the first booking.
function studioProgress(months, first, today) {
  if (!first) return { win: [], hits: 0, qualified: false };
  const by = Object.fromEntries(months.map(m => [String(m.month).slice(0, 7), +m.n]));
  const [y, m] = first.split('-').map(Number), now = today.slice(0, 7), win = [];
  for (let i = 0; i < WINDOW; i++) {
    const key = new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 7), n = by[key] || 0;
    win.push({ key, n, hit: n >= MONTH_GOAL, future: key > now, current: key === now });
  }
  const hits = win.filter(w => w.hit).length;
  return { win, hits, qualified: hits >= MONTHS_TO_QUALIFY };
}
function growthStudios(rows, today) {
  const by = new Map();
  rows.forEach(r => {
    if (!by.has(r.studio_id)) by.set(r.studio_id, { id: r.studio_id, name: r.studio_name, code: r.referrer_code, live: r.went_live, first: r.first_booking, months: [] });
    if (r.month) by.get(r.studio_id).months.push({ month: r.month, n: +r.bookings });
  });
  return [...by.values()].map(s => {
    const p = studioProgress(s.months, s.first, today);
    return { ...s, ...p, fees: s.code ? (s.live ? FEE.live : 0) + (s.first ? FEE.first : 0) + Math.min(p.hits, MONTHS_TO_QUALIFY) * FEE.month : 0 };
  });
}
function growthMembers(rep) {
  const by = {};
  rep.forEach(r => {
    const c = by[r.code] = by[r.code] || { signups: 0, paid: 0, qualified: 0, earned: 0 };
    c.signups += +r.signups; c.paid += +r.subscribed; c.qualified += +r.qualified; c.earned += +r.qualified * (REF_RATE[r.source] || 0);
  });
  return by;
}
async function loadAdminGrowth() {
  const rs = await Promise.all([sb.rpc('admin_list_referrers'), sb.rpc('admin_referral_report'), sb.rpc('admin_studio_months'), sb.rpc('admin_excluded_accounts')]);
  const bad = rs.find(r => r.error);
  adminGrowth = bad ? { error: bad.error.message } : { refs: rs[0].data, rep: rs[1].data, studs: rs[2].data, excl: rs[3].data };
  if (currentView === 'admin' && adminTab === 'growth') renderAdmin();
}
function renderAdminGrowth(el) {
  const head = '<div style="display:flex;justify-content:space-between;align-items:center;margin:24px 0 4px"><h2 style="margin:0">Growth</h2><button class="btn ghost" data-refreshgrowth>↻ Refresh</button></div>';
  if (!adminGrowth) { el.innerHTML = head + '<div class="empty">Loading… 🤝</div>'; loadAdminGrowth(); return; }
  if (adminGrowth.error) { el.innerHTML = head + `<div class="panel"><b>Couldn't load this.</b><div class="meta">${esc(adminGrowth.error)}</div><div class="meta" style="margin-top:6px">If it mentions a missing function or table, run <b>supabase/025_referrals.sql</b> in the Supabase SQL Editor first.</div></div>`; return; }
  const G = adminGrowth, today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const base = location.origin + location.pathname, mem = growthMembers(G.rep), studs = growthStudios(G.studs, today);
  const copy = (label, url) => `<div class="hist"><div><div>${label}</div><div class="meta" style="word-break:break-all">${esc(url)}</div></div><button class="btn ghost" style="padding:6px 10px;font-size:13px" data-copylink="${esc(url)}">Copy</button></div>`;
  const refs = G.refs.map(r => {
    const m = mem[r.code] || { signups: 0, paid: 0, qualified: 0, earned: 0 }, mine = studs.filter(s => s.code === r.code);
    return `<div class="panel"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>${esc(r.name)}</b> <span class="tag">${esc(r.code)}</span>${r.active ? '' : ' <span class="tag">paused</span>'}</div>
        <button class="btn ghost" style="padding:6px 10px;font-size:13px" data-refmembers="${esc(r.code)}">See families</button></div>
      <div class="meta" style="margin:6px 0">${m.signups} signed up · ${m.paid} have paid · <b>${m.qualified}</b> paid 60+ days = <b>$${m.earned}</b> earned · ${mine.length} studio${mine.length === 1 ? '' : 's'} sourced</div>
      ${copy('Families, own outreach ($' + REF_RATE.referral + ' each)', `${base}?ref=${r.code}`)}
      ${copy('Families from paid ads ($' + REF_RATE.ad + ' each)', `${base}?ref=${r.code}&src=ad`)}
      ${copy('Families from studio flyers and emails ($' + REF_RATE.studio + ' each)', `${base}?ref=${r.code}&src=studio`)}
      ${copy('Studios to sign up', `${base}?ref=${r.code}#join-studio`)}</div>`;
  }).join('') || '<div class="meta">No partners yet. Add one below.</div>';
  const qualified = studs.filter(s => s.code && s.qualified).length;
  const stRows = studs.map(s => `<div class="panel"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><b>${esc(s.name)}</b>
      <select data-studioref="${esc(s.id)}" style="margin:0;max-width:200px"><option value="">Sourced by: nobody (ours)</option>${G.refs.map(r => `<option value="${esc(r.code)}" ${s.code === r.code ? 'selected' : ''}>Sourced by: ${esc(r.name)}</option>`).join('')}</select></div>
    <div class="meta" style="margin-top:4px">Live ${s.live ? fmtDate(s.live) : '–'} · first booking ${s.first ? fmtDate(s.first) : 'none yet'}</div>
    ${s.win.length ? `<div style="margin-top:6px">${s.win.map(w => `<span title="${w.key}" style="display:inline-block;min-width:36px;text-align:center;padding:3px 6px;border-radius:8px;margin:2px 4px 2px 0;font-weight:700;background:${w.hit ? '#d8f1e3' : '#f3efe9'};${w.future ? 'opacity:.45' : ''}">${w.n}${w.current ? '*' : ''}</span>`).join('')}</div>
      <div class="meta" style="margin-top:4px"><b>${s.hits} of ${MONTHS_TO_QUALIFY}</b> months with ${MONTH_GOAL}+ bookings${s.qualified ? ' ✅ qualified' : ''}${s.code ? ` · fees earned <b>$${s.fees}</b>${s.qualified ? ` · +${EQUITY_PER_STUDIO}% equity` : ''}` : ''}</div>` : ''}</div>`).join('') || '<div class="meta">No live studios yet.</div>';
  el.innerHTML = head + `<p class="meta" style="margin:0">For paying partners who bring in families and studios. Only you can see this page.</p>
    <div class="panel"><div class="label">Partners and their links</div>${refs}
      <div class="label" style="margin-top:12px">Add a partner</div>
      <div class="two" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input id="grName" placeholder="Name" maxlength="80"><input id="grCode" placeholder="code, e.g. alex" maxlength="30"></div>
      <button class="btn" data-saveref>Save partner</button>
      <p class="meta" style="margin:8px 0 0">Codes are 3 to 30 lowercase letters, numbers or dashes. Each person's first link wins and is remembered for 30 days. Saving an existing code updates it.</p></div>
    <div class="panel"><div class="label">Studios: completed bookings by month</div>
      <p class="meta" style="margin:0 0 8px">A booking counts once its class date has passed. Month 1 is the month of the first booking, and green means ${MONTH_GOAL}+. * is the current month so far. ${qualified} studio${qualified === 1 ? '' : 's'} qualified${qualified ? ` = ${Math.min(10, qualified * EQUITY_PER_STUDIO).toFixed(1)}% equity (cap 10%)` : ''}. Studios with no partner are yours and earn nobody anything.</p>${stRows}</div>
    <div class="panel"><div class="label">Accounts that never count toward bonuses</div>
      <p class="meta" style="margin:0 0 8px">Test accounts, and the family and friends of anyone being paid. Their bookings and sign-ups are left out of every number above.</p>
      ${G.excl.map(x => `<div class="hist"><div>${esc(x.email)}<div class="meta">${esc(x.display_name || '')}</div></div><button class="btn ghost" style="padding:6px 10px;font-size:13px" data-unexclude="${esc(x.email)}">Remove</button></div>`).join('')}
      <div style="display:flex;gap:8px;margin-top:8px"><input id="exEmail" type="email" placeholder="Account email" style="margin:0"><button class="btn" data-excludeadd>Add</button></div></div>
    <p class="meta">"Paid 60+ days" means subscribed and paid for at least 60 days and still subscribed. Check Stripe for refunds or disputes before paying a bonus. Bonus amounts and thresholds are set at the top of the Growth code in app.js.</p>`;
}
async function growthAction(promise, done) {
  const { error } = await promise;
  if (error) { toast(error.message); return; }
  if (done) toast(done);
  loadAdminGrowth();
}
async function showRefMembers(code) {
  const { data, error } = await sb.rpc('admin_referral_members', { p_code: code });
  if (error) { toast(error.message); return; }
  openModal(`<h2>Families: ${esc(code)}</h2>${data.length ? data.map(m => `<div class="hist"><div><b>${esc(m.display_name || '(no name)')}</b> <span class="tag">${esc(SRC_LABEL[m.source] || m.source || '')}</span>
      <div class="meta">${esc(m.email)} · joined ${fmtDate(m.joined)}<br>${m.plan ? esc(m.plan) + ' (' + esc(m.plan_status || '') + ')' : 'No plan'}${m.first_paid ? ' · first paid ' + fmtDate(m.first_paid) : ' · not paid yet'}</div></div>
      <b>${m.qualified ? '✅ $' + (REF_RATE[m.source] || 0) : '–'}</b></div>`).join('') : '<p class="meta">Nobody yet.</p>'}
    <div class="actions"><button class="btn ghost" data-close>Close</button></div>`);
}

// ----- Admin: people -----
const AUDIT = { credits_adjusted: 'Credits adjusted', booking_refunded: 'Booking refunded', studio_approved: 'Studio approved', studio_rejected: 'Studio rejected or suspended',
  studio_pending: 'Studio set back to pending', studio_closed: 'Studio closed', pricing_changed: 'Pricing changed', payout_created: 'Payout created', payout_paid: 'Payout marked paid',
  payout_pending: 'Payout set back to pending', review_hidden: 'Review hidden', review_shown: 'Review shown again' };
function auditDetail(a) {
  const d = a.details || {};
  if (a.action === 'credits_adjusted') return `${d.delta > 0 ? '+' : ''}${esc(d.delta)} credits · “${esc(d.reason)}” · new balance ${esc(d.new_balance)}`;
  if (a.action === 'booking_refunded') return `${esc(d.class)} on ${esc(d.date)} (${esc(d.attendee)}) · ⭐ ${esc(d.credits)}${d.reason ? ` · “${esc(d.reason)}”` : ''}`;
  if (a.action.startsWith('payout')) return money(d.amount_cents || 0) + (d.reference ? ` · ref ${esc(d.reference)}` : '');
  if (a.action === 'pricing_changed' && d.to) return `credit value ${money(d.to.credit_value_cents)} · margin ${esc(d.to.margin_pct)}% · cancel ${esc(d.to.cancel_hours)}h`;
  if (d.note) return '“' + esc(d.note) + '”';
  return '';
}
const ROLE = { parent: '👶 Parent', studio: '🏢 Studio', admin: '🛡 Admin' };
function peopleList() {
  const q = peopleQ.toLowerCase();
  return adminUsers.filter(u => (peopleRole === 'all' || u.role === peopleRole)
      && (!q || [u.email, u.display_name, u.studio_name].some(x => (x || '').toLowerCase().includes(q))));
}
function peopleRows() {
  const list = peopleList();
  return list.length ? list.map(u => `<div class="panel person" data-person="${u.id}">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><b>${esc(u.display_name || '(no name)')}</b> <span class="tag">${ROLE[u.role] || esc(u.role)}</span>
      <div class="meta">${esc(u.email)}${u.studio_name ? ' · ' + esc(u.studio_name) : ''}</div></div>
      ${u.role === 'parent' ? `<div style="text-align:right"><b>⭐ ${u.credits}</b><div class="meta">${u.plan ? esc(u.plan) + (u.plan_status && u.plan_status !== 'active' ? ' (' + esc(u.plan_status) + ')' : '') : 'No plan'}</div></div>` : ''}</div>
    <div class="meta" style="margin-top:4px">Joined ${fmtDate(u.created_at)}${u.last_sign_in ? ' · last seen ' + fmtDate(u.last_sign_in) : ''}${u.role === 'parent' ? ` · ${u.upcoming} upcoming · ${u.attended} attended · ${u.kids} kid${u.kids === 1 ? '' : 's'}` : ''}${u.terms_version ? '' : ' · ⚠️ no terms on record'}</div></div>`).join('')
    : '<div class="empty">Nobody matches.</div>';
}
function renderAdminPeople(el) {
  const n = r => adminUsers.filter(u => r === 'all' || u.role === r).length;
  el.innerHTML = `<h2 style="margin:24px 0 4px">People</h2>
    <p class="meta" style="margin:0 0 10px">Look someone up to see their bookings and credits, fix their balance or refund a class.</p>
    <input id="peopleQ" placeholder="Search name, email or studio" value="${esc(peopleQ)}">
    <div class="seg" style="flex-wrap:wrap">${[['all', 'All'], ['parent', 'Parents'], ['studio', 'Studios'], ['admin', 'Admins']].map(([k, l]) => `<button data-peoplerole="${k}" class="${peopleRole === k ? 'on' : ''}">${l} (${n(k)})</button>`).join('')}</div>
    <div id="peopleList">${peopleRows()}</div>`;
}
async function openPerson(id) {
  const u = adminUsers.find(x => x.id === id);
  if (!u) return;
  const { data: d, error } = await sb.rpc('admin_user_detail', { p_user: id });
  if (error) return toast(error.message);
  const up = d.bookings.filter(b => b.session_date >= todayStr), past = d.bookings.filter(b => b.session_date < todayStr);
  const bk = b => `<div class="hist"><div><div>${esc(b.class_title)} · ${esc(b.attendee_name)}</div><div class="meta">${dateLabel(b.session_date)} ${t12(b.session_time)} · ${esc((studioById(b.studio_id) || {}).name || '')} · ⭐ ${b.credits}${b.source === 'waitlist' ? ' · from waitlist' : ''}</div></div>
    ${b.session_date >= todayStr && !b.payout_id ? `<button class="btn ghost" data-arefund="${b.id}" data-person-id="${id}">Refund</button>` : ''}</div>`;
  openModal(`<h2>${esc(u.display_name || '(no name)')}</h2>
    <div class="meta">${esc(u.email)} · ${ROLE[u.role] || esc(u.role)}${u.studio_name ? ' · ' + esc(u.studio_name) : ''}<br>Joined ${fmtDate(u.created_at)}${u.plan ? ` · ${esc(u.plan)} plan (${esc(u.plan_status || '')})` : ''}</div>
    ${u.role === 'parent' ? `<div class="panel" style="margin-top:12px"><div class="label">Credits: ⭐ ${u.credits}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="adjAmt" type="number" step="1" placeholder="+5 or -5" style="flex:0 1 110px;margin:0"><input id="adjWhy" maxlength="150" placeholder="Reason (the parent sees this)" style="flex:1 1 180px;margin:0"></div>
      <button class="btn" style="margin-top:8px" data-adjust="${id}">Adjust credits</button></div>` : ''}
    ${d.kids.length ? `<div class="label" style="margin-top:12px">Kids</div><div class="meta">${d.kids.map(k => `${esc(k.name)} (born ${esc(k.birthday)})`).join(' · ')}</div>` : ''}
    ${up.length ? `<div class="label" style="margin-top:12px">Upcoming bookings</div>${up.map(bk).join('')}` : ''}
    ${d.waitlist.length ? `<div class="label" style="margin-top:12px">Waitlists</div>${d.waitlist.map(w => `<div class="meta">${dateLabel(w.session_date)} · ${esc(w.attendee_name)}</div>`).join('')}` : ''}
    ${past.length ? `<details style="margin-top:12px"><summary class="label" style="cursor:pointer">Past bookings (${past.length})</summary>${past.map(bk).join('')}</details>` : ''}
    ${d.ledger.length ? `<details style="margin-top:12px"><summary class="label" style="cursor:pointer">Credit history (${d.ledger.length})</summary>${d.ledger.map(l => `<div class="hist"><div><div>${esc(l.reason)}</div><div class="meta">${fmtDate(l.created_at)}</div></div><b class="${l.delta > 0 ? 'plus' : ''}">${l.delta > 0 ? '+' : ''}${l.delta}</b></div>`).join('')}</details>` : ''}
    <div class="actions"><button class="btn ghost" data-close>Close</button></div>`);
}
async function adjustCredits(id) {
  const amt = parseInt($('#adjAmt').value, 10), why = $('#adjWhy').value.trim();
  if (!amt) return toast('Enter how many credits, like 5 or -5');
  if (!why) return toast('Add a reason. The parent sees it in their history.');
  const u = adminUsers.find(x => x.id === id);
  if (!confirm(`${amt > 0 ? 'Add' : 'Remove'} ${Math.abs(amt)} credits ${amt > 0 ? 'to' : 'from'} ${u.display_name || u.email}?`)) return;
  const { data, error } = await sb.rpc('admin_adjust_credits', { p_user: id, p_delta: amt, p_reason: why });
  if (error) return toast(error.message);
  await refresh(); toast(`Done. New balance: ⭐ ${data}`); openPerson(id);
}
async function adminRefund(bookingId, personId) {
  const why = prompt('Refund this booking? The parent gets their credits back and an email. Reason (shown to the parent):');
  if (why === null) return;
  const { error } = await sb.rpc('admin_refund_booking', { p_booking: bookingId, p_reason: why });
  if (error) return toast(error.message);
  await refresh(); toast('Refunded'); openPerson(personId);
}
// Spreadsheet download. Cells starting with = + @ are prefixed so spreadsheet apps don't run them as formulas.
async function exportCsv(kind) {
  const { data, error } = await sb.rpc('admin_export', { p_kind: kind });
  if (error) return toast(error.message);
  if (!data || !data.length) return toast('Nothing to export yet.');
  downloadCsv(data, `littlepass-${kind}-${fmt(new Date())}.csv`);
}
function downloadCsv(data, filename) {
  const cols = [...new Set(data.flatMap(r => Object.keys(r)))];
  const cell = v => {
    if (v === null || v === undefined) return '';
    let t = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+@\t\r]/.test(t) || /^-[^\d]/.test(t)) t = "'" + t;
    return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const csv = [cols.join(','), ...data.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
  link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

async function setStudioStatus(id, to) {
  const s = adminStudios.find(x => x.id === id);
  let note = null;
  if (to === 'rejected') {
    note = prompt(`Why is "${s.name}" being ${s.status === 'approved' ? 'suspended' : 'rejected'}? (shown to the studio; leave empty for no reason)`);
    if (note === null) return;
    if (s.status === 'approved' && !confirm('Upcoming bookings at this studio will be cancelled and parents refunded. Continue?')) return;
  }
  const { error } = await sb.rpc('admin_set_studio_status', { p_studio: id, p_status: to, p_note: note });
  if (error) return toast(error.message);
  await refresh(); toast(to === 'approved' ? `✅ ${s.name} approved` : `${s.name} ${s.status === 'approved' ? 'suspended' : 'rejected'}`);
}


// ----- Admin: payouts -----
const yesterdayStr = (() => { const d = new Date(today); d.setDate(d.getDate() - 1); return fmt(d); })();
function renderAdminPayouts(el) {
  const N = k => sum(adminPay, r => Number(r[k]) || 0);
  const pending = adminPayouts.filter(p => p.status === 'pending'), paidList = adminPayouts.filter(p => p.status === 'paid');
  const sname = id => (studioById(id) || { name: 'Studio' }).name;
  const active = adminPay.filter(r => Number(r.earned_cents) || Number(r.upcoming_cents));
  el.innerHTML = `<h2 style="margin:24px 0 4px">Payouts</h2>
    <p class="meta" style="margin:0">Studios earn the price they set for each completed booking. Create a payout to bundle what you owe, send the money yourself, then mark it paid.</p>
    <div class="stats">
      <div class="stat"><b>${money(N('ready_cents'))}</b>ready to pay</div>
      <div class="stat"><b>${money(N('pending_cents'))}</b>payouts in progress</div>
      <div class="stat"><b>${money(N('paid_cents'))}</b>paid out</div>
      <div class="stat"><b>${money(N('upcoming_cents'))}</b>booked, coming up</div></div>
    <h3 style="margin:22px 0 8px">By studio</h3>
    <div class="panel" style="margin-top:0">${active.length ? active.map(r => `<div class="sess" style="align-items:flex-start">
      <div><b>${esc(r.studio_name)}</b><div class="meta">${esc(r.owner_email || 'Sample partner')}<br>Earned ${money(r.earned_cents)} · Paid ${money(r.paid_cents)}${Number(r.pending_cents) ? ' · In progress ' + money(r.pending_cents) : ''}</div></div>
      <div style="text-align:right">${Number(r.ready_cents) ? `<b>${money(r.ready_cents)}</b><div class="meta">${r.ready_count} booking${Number(r.ready_count) > 1 ? 's' : ''}</div><button class="btn" style="margin-top:6px" data-mkpayout="${r.studio_id}">Create payout</button>` : '<span class="meta">Nothing to pay</span>'}</div></div>`).join('')
      : '<p class="meta" style="margin:0">No studio earnings yet. Bookings count once the class has taken place.</p>'}</div>
    <h3 style="margin:22px 0 8px">Waiting to be sent</h3>
    <div class="panel" style="margin-top:0">${pending.length ? pending.map(p => `<div class="sess"><div><b>${esc(sname(p.studio_id))}</b> · ${money(p.amount_cents)}<div class="meta">Classes ${dateLabel(p.period_start)} to ${dateLabel(p.period_end)}</div></div>
      <button class="btn" data-markpaid="${p.id}">Mark as paid</button></div>`).join('') : '<p class="meta" style="margin:0">Nothing waiting.</p>'}
      ${pending.length ? '<div class="meta" style="margin-top:8px">Send the money first (Zelle, bank transfer, etc.), then mark it paid. The studio sees it as "Paid" with today\'s date.</div>' : ''}</div>
    <h3 style="margin:22px 0 8px">Paid</h3>
    <div class="panel" style="margin-top:0">${paidList.length ? paidList.map(p => `<div class="sess"><div><b>${esc(sname(p.studio_id))}</b> · ${money(p.amount_cents)}<div class="meta">${p.reference ? esc(p.reference) + ' · ' : ''}Classes ${dateLabel(p.period_start)} to ${dateLabel(p.period_end)}</div></div>
      <span class="tag paid">✓ ${new Date(p.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>`).join('') : '<p class="meta" style="margin:0">No payouts sent yet.</p>'}</div>`;
}
async function makePayout(studioId) {
  const r = adminPay.find(x => x.studio_id === studioId);
  if (!confirm(`Create a ${money(r.ready_cents)} payout for ${r.studio_name}, covering ${r.ready_count} completed booking(s) through ${dateLabel(yesterdayStr)}?`)) return;
  const { error } = await sb.rpc('admin_create_payout', { p_studio: studioId, p_through: yesterdayStr });
  if (error) return toast(error.message);
  await refresh(); toast('Payout created. Send the money, then mark it paid.');
}
async function markPaid(payoutId) {
  const p = adminPayouts.find(x => x.id === payoutId);
  const ref = prompt(`Only continue once you've sent ${money(p.amount_cents)} to ${(studioById(p.studio_id) || {}).name}.\nNote for your records (e.g. "Zelle 10/2"):`, '');
  if (ref === null) return;
  const { error } = await sb.rpc('admin_mark_payout_paid', { p_payout: payoutId, p_reference: ref.trim() || null });
  if (error) return toast(error.message);
  await refresh(); toast('Marked as paid ✓');
}

// ----- Admin: pricing -----
const creditsFor = (cents, cv, m, max) => Math.max(1, Math.min(max, Math.ceil(cents / (cv * (1 - m / 100)))));
function pricingExamples() {
  const cv = Math.round((+$('#prCv').value || 0) * 100), m = +$('#prMargin').value || 0, max = +$('#prMax').value || 30;
  if (!cv) return;
  $('#prEx').innerHTML = [800, 1500, 2500, 4000].map(c => `<div class="stat"><b>⭐ ${creditsFor(c, cv, m, max)}</b>for a ${money(c)} class</div>`).join('');
}
function renderAdminPricing(el) {
  const P = adminPricing;
  if (!P) { el.innerHTML = '<div class="empty">Couldn\'t load pricing settings.</div>'; return; }
  el.innerHTML = `<h2 style="margin:24px 0 4px">Pricing</h2>
    <p class="meta" style="margin:0">Studios enter a price in dollars. This rule turns it into the credits parents pay:<br><b>credits = price ÷ (credit value × (1 − margin)), rounded up</b></p>
    <div class="panel"><div class="two"><div><div class="label">Credit value ($)</div><input id="prCv" type="number" step="0.05" min="0.5" max="20" value="${(P.credit_value_cents / 100).toFixed(2)}"></div>
      <div><div class="label">Your margin (%)</div><input id="prMargin" type="number" step="1" min="0" max="80" value="${P.margin_pct}"></div></div>
      <div class="two"><div><div class="label">Max credits per class</div><input id="prMax" type="number" min="1" max="100" value="${P.max_credits}"></div>
      <div><div class="label">Free cancellation (hours before class)</div><input id="prHrs" type="number" min="0" max="168" value="${P.cancel_hours}"></div></div>
      <div class="label">What parents would pay</div><div class="stats" id="prEx" style="margin:0 0 14px"></div>
      <button class="btn" data-savepricing>Save and recalculate all classes</button></div>
    <h3 style="margin:22px 0 8px">What a credit really earns you</h3>
    <div class="panel" style="margin-top:0">${planList().map(p => `<div class="sess"><div><b>${p.name}</b> · $${p.price}/month for ${p.credits} credits</div><b>$${(p.price / p.credits).toFixed(2)} per credit</b></div>`).join('')}
      <div class="meta" style="margin-top:8px">Set <b>credit value</b> at or below your lowest figure here, or you'll give away more margin than you intend when parents buy the big plan. Unused credits are extra profit for you.</div></div>`;
  pricingExamples();
}
async function savePricing() {
  const { error } = await sb.rpc('admin_set_pricing', { p_credit_value_cents: Math.round((+$('#prCv').value || 0) * 100),
    p_margin_pct: +$('#prMargin').value, p_max_credits: +$('#prMax').value, p_cancel_hours: +$('#prHrs').value });
  if (error) return toast(error.message);
  await refresh(); toast('Saved. All class prices recalculated ✓');
}
$('#view-admin').addEventListener('input', e => { if (e.target.closest('#prCv, #prMargin, #prMax')) pricingExamples(); });
$('#view-admin').addEventListener('change', e => { const s = e.target.closest('[data-studioref]'); if (s) growthAction(sb.rpc('admin_set_studio_referrer', { p_studio: s.dataset.studioref, p_code: s.value || null }), 'Saved'); });
$('#view-admin').addEventListener('input', e => { if (e.target.id === 'peopleQ') { peopleQ = e.target.value; $('#peopleList').innerHTML = peopleRows(); } });

// ----- Admin: reports -----
function renderAdminReports(el) {
  const row = r => {
    let preview = '', actions = '';
    if (r.kind === 'review') {
      const rv = reviews.find(x => x.id === r.target_id), st = rv && studioById(rv.studio_id);
      preview = rv ? `<div><b>${esc(rv.author)}</b> <span class="stars">${starStr(rv.stars)}</span> on <b>${esc(rv.class_title || '')}</b> at ${esc(st ? st.name : '')}${rv.hidden ? ' <span class="tag rej">Hidden</span>' : ''}</div><div style="margin-top:4px">${esc(rv.body)}</div>` : '<div class="meta">This review no longer exists.</div>';
      actions = rv ? `<button class="btn ghost danger" data-hidereview="${rv.id}" data-to="${rv.hidden ? 'false' : 'true'}">${rv.hidden ? 'Restore review' : 'Hide review'}</button>` : '';
    } else {
      const ph = studioPhotos.find(x => x.id === r.target_id), st = ph && studioById(ph.studio_id);
      preview = ph ? `<div style="display:flex;gap:12px;align-items:center"><img src="${photoUrl(ph)}" alt="" style="width:110px;border-radius:10px"><div><b>Photo</b> at ${esc(st ? st.name : '')}<div class="meta">${esc(ph.caption || '')}</div></div></div>` : '<div class="meta">This photo no longer exists.</div>';
      actions = ph ? `<button class="btn ghost danger" data-adminrmphoto="${ph.id}">Remove photo</button>` : '';
    }
    return `<div class="panel"><div class="meta" style="margin-bottom:6px">🚩 ${r.kind} reported ${fmtDate(r.created_at)}${r.reason ? ' · “' + esc(r.reason) + '”' : ''}</div>${preview}
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">${actions}<button class="btn ghost" data-dismiss="${r.id}">Dismiss</button></div></div>`;
  };
  el.innerHTML = `<h2 style="margin:24px 0 4px">Reports</h2><p class="meta" style="margin:0">Reviews and photos that parents flagged.</p>
    ${adminReports.length ? adminReports.map(row).join('') : '<div class="empty">Nothing reported 🎉</div>'}`;
}
const resolveReports = (kind, id) => sb.from('reports').update({ resolved: true }).eq('kind', kind).eq('target_id', id);
async function setReviewHidden(id, hidden) {
  const { error } = await sb.from('reviews').update({ hidden }).eq('id', id);
  if (error) return toast(error.message);
  if (hidden) await resolveReports('review', id);
  await refresh(); toast(hidden ? 'Review hidden' : 'Review restored');
}
async function adminRemovePhoto(id) {
  const p = studioPhotos.find(x => x.id === id);
  if (!confirm('Remove this photo for everyone?')) return;
  const { error } = await sb.from('studio_photos').delete().eq('id', id);
  if (error) return toast(error.message);
  await sb.storage.from('studio-photos').remove([p.path]);
  await resolveReports('photo', id); closeModal(); await refresh(); toast('Photo removed');
}

// ---------- Clicks ----------
async function handleClick(e) {
  const t = e.target, hit = sel => t.closest(sel);
  let el;
  if ((el = hit('[data-studio]'))) { if (map) map.closePopup(); showStudio(el.dataset.studio); return; }
  if (hit('[data-back]')) { if (location.hash.startsWith('#studio/')) location.hash = ''; else showTab(lastTab); return; }
  if (hit('[data-share]')) { shareStudio(); return; }
  if (hit('[data-postreview]')) { postReview(); return; }
  if (hit('[data-login]')) { openAuth('login'); return; }
  if (hit('[data-signup]')) { openAuth('signup', '', 'parent'); return; }
  if (hit('[data-signup-studio]')) { openAuth('signup', '', 'studio'); return; }
  if ((el = hit('[data-photo]'))) { openPhoto(el.dataset.photo); return; }
  if ((el = hit('[data-report]'))) { doReport(el.dataset.report, el.dataset.id); return; }
  if ((el = hit('[data-rvclass]'))) { rvClassFilter = el.dataset.rvclass; renderStudio(); return; }
  if (hit('[data-uploadphoto]')) { uploadPhoto(); return; }
  if ((el = hit('[data-delphoto]'))) { deletePhoto(el.dataset.delphoto); return; }
  if ((el = hit('[data-savereply]'))) { saveReply(el.dataset.savereply); return; }
  if ((el = hit('[data-hidereview]'))) { setReviewHidden(el.dataset.hidereview, el.dataset.to === 'true'); return; }
  if ((el = hit('[data-adminrmphoto]'))) { adminRemovePhoto(el.dataset.adminrmphoto); return; }
  if ((el = hit('[data-dismiss]'))) { await sb.from('reports').update({ resolved: true }).eq('id', el.dataset.dismiss); await refresh(); toast('Dismissed'); return; }
  if ((el = hit('[data-day]'))) {
    const v = el.dataset.day;
    filters.day = v === 'all' || String(filters.day) === v ? 'all' : v;   // tapping the chosen day again clears it
    updateFilterBadge(); renderResults(); return;
  }
  if ((el = hit('[data-details]'))) { openDetails(el.dataset.details); return; }
  if (hit('[data-downloaddata]')) { downloadMyData(); return; }
  if (hit('[data-opendelete]')) { openDeleteAccount(); return; }
  if (hit('[data-confirmdelete]')) { confirmDeleteAccount(); return; }
  if ((el = hit('[data-bkview]'))) { bookView = el.dataset.bkview; renderBookings(); return; }
  if ((el = hit('[data-goreview]'))) {
    showStudio(el.dataset.goreview);
    const sel = $('#rvClass');
    if (sel) { sel.value = el.dataset.cid; prefillReview(); sel.closest('.panel').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    return;
  }
  if (hit('[data-clearfilters]')) { clearFilters(); return; }
  if (hit('[data-goexplore]')) { showTab('explore'); return; }
  if (hit('[data-logout]')) { await sb.auth.signOut(); profile = null; renderNav(); showTab('explore'); toast(T('Logged out')); return; }
  if ((el = hit('[data-lang]'))) { setLang(el.dataset.lang); return; }
  if ((el = hit('[data-authmode]'))) { openAuth(el.dataset.authmode, authState.reason); return; }
  if ((el = hit('[data-authrole]'))) { openAuth('signup', authState.reason, el.dataset.authrole); return; }
  if (hit('[data-authgo]')) { authGo(); return; }
  if (hit('[data-forgot]')) { forgotPassword(); return; }
  if (hit('[data-usezip]')) { useZip(); return; }
  if (hit('[data-setpass]')) { setNewPassword(); return; }
  if ((el = hit('[data-mkpayout]'))) { makePayout(el.dataset.mkpayout); return; }
  if ((el = hit('[data-markpaid]'))) { markPaid(el.dataset.markpaid); return; }
  if (hit('[data-savepricing]')) { savePricing(); return; }
  if ((el = hit('[data-setstatus]'))) { setStudioStatus(el.dataset.setstatus, el.dataset.to); return; }
  if ((el = hit('[data-adminf]'))) { adminFilter = el.dataset.adminf; renderAdmin(); return; }
  if (hit('[data-createstudio]')) { createStudio(); return; }
  if (hit('[data-createclass]')) { createClass(); return; }
  if (hit('[data-savestudio]')) { saveStudio(); return; }
  if (hit('[data-savecontact]')) { saveContact(); return; }
  if ((el = hit('[data-addsched]'))) { addSlots(el.dataset.addsched, el.closest('details')); return; }
  if ((el = hit('[data-rmslot]'))) { deleteSlot(el.dataset.rmslot); return; }
  if ((el = hit('[data-cancelsession]'))) { const [sid, d] = el.dataset.cancelsession.split('|'); cancelSessionUI(sid, d, +el.dataset.n || 0); return; }
  if ((el = hit('[data-restoresession]'))) { const [sid, d] = el.dataset.restoresession.split('|'); restoreSessionUI(sid, d); return; }
  if ((el = hit('[data-rmclass]'))) { deleteClass(el.dataset.rmclass); return; }
  if ((el = hit('[data-goto]'))) { showTab(el.dataset.goto); return; }
  if ((el = hit('[data-bkf]'))) { bkFilter = el.dataset.bkf; renderOwner(); return; }
  if (hit('[data-refreshstats]')) { adminStats = null; renderAdmin(); return; }
  if (hit('[data-refreshgrowth]')) { adminGrowth = null; renderAdmin(); return; }
  if ((el = hit('[data-copylink]'))) { try { await navigator.clipboard.writeText(el.dataset.copylink); toast('Link copied'); } catch (e) { toast('Copy failed. Select the link and copy it by hand.'); } return; }
  if (hit('[data-saveref]')) { growthAction(sb.rpc('admin_save_referrer', { p_code: $('#grCode').value, p_name: $('#grName').value, p_note: null, p_active: true }), 'Partner saved'); return; }
  if ((el = hit('[data-refmembers]'))) { showRefMembers(el.dataset.refmembers); return; }
  if (hit('[data-excludeadd]')) { growthAction(sb.rpc('admin_set_bonus_excluded', { p_email: $('#exEmail').value, p_excluded: true }), 'Account excluded'); return; }
  if ((el = hit('[data-unexclude]'))) { growthAction(sb.rpc('admin_set_bonus_excluded', { p_email: el.dataset.unexclude, p_excluded: false }), 'Account counts again'); return; }
  if ((el = hit('[data-peoplerole]'))) { peopleRole = el.dataset.peoplerole; renderAdmin(); return; }
  if ((el = hit('[data-adjust]'))) { adjustCredits(el.dataset.adjust); return; }
  if ((el = hit('[data-arefund]'))) { adminRefund(el.dataset.arefund, el.dataset.personId); return; }
  if ((el = hit('[data-person]'))) { openPerson(el.dataset.person); return; }
  if ((el = hit('[data-export]'))) { exportCsv(el.dataset.export); return; }
  if (hit('[data-histall]')) { histAll = !histAll; renderProfile(); return; }
  if ((el = hit('[data-editname]'))) { editName = el.dataset.editname === '1'; renderProfile(); return; }
  if (hit('[data-savename]')) {
    const name = $('#myName').value.trim();
    if (!name) return toast(T('Please enter your name'));
    const { error } = await sb.from('profiles').update({ display_name: name }).eq('id', user.id);
    if (error) return toast(tx(error.message));
    editName = false; await loadPrivate(); renderProfile(); toast(T('Name saved')); return;
  }
  if ((el = hit('[data-editkid]'))) { editKid = el.dataset.editkid || null; renderProfile(); return; }
  if ((el = hit('[data-savekid]'))) {
    const name = $('#ekName').value.trim(), bday = $('#ekBday').value;
    if (!name || !bday) return toast(T('Please add a name and birthday'));
    const { error } = await sb.from('kids').update({ name, birthday: bday }).eq('id', el.dataset.savekid);
    if (error) return toast(tx(error.message));
    editKid = null; await loadPrivate(); renderProfile(); renderFilters(); renderResults(); toast(T('Saved')); return;
  }
  if (hit('[data-addkid]')) {
    const name = $('#kidName').value.trim(), bday = $('#kidBday').value;
    if (!name || !bday) return toast(T('Please add a name and birthday'));
    const { error } = await sb.from('kids').insert({ user_id: user.id, name, birthday: bday });
    if (error) return toast(tx(error.message));
    await loadPrivate(); renderProfile(); renderFilters(); toast(T('Added {name} 💛', { name })); return;
  }
  if ((el = hit('[data-rmkid]'))) {
    await sb.from('kids').delete().eq('id', el.dataset.rmkid);
    filters.age = 'all'; await loadPrivate(); renderProfile(); renderFilters(); renderResults(); return;
  }
  if ((el = hit('[data-book]'))) {
    if (map) map.closePopup();
    if (!user) return openAuth('signup', T('Log in or sign up to book classes. New accounts start with 10 free credits.'), 'parent');
    if (profile && profile.role !== 'parent') return toast(T('Only parent accounts can book classes.'));
    const s = SESSIONS.find(x => x.id === el.dataset.book), credits = profile ? profile.credits : 0, enough = credits >= s.credits;
    const late = new Date(`${s.dateStr}T${s.time24}`) - Date.now() < cancelHours * 36e5;
    openModal(`
      <div class="emoji" style="background:${CATS[s.cat].color};margin-bottom:12px">${CATS[s.cat].emoji}</div>
      <h2>${esc(s.title)}</h2>
      <div class="meta">${esc(s.studio)} · ${esc(s.hood)}<br>${T('{day} at {time}', { day: dayName(s.date), time: s.time })} · ${s.mins} min<br>${T('Ages {ages}', { ages: ageText(s.ageMin, s.ageMax) })}${s.loc ? `<br>🧭 ${esc(s.loc.address)}` : ''}</div>
      ${!s.loc && s.hasAddr ? `<p class="meta" style="margin:8px 0 0">${T('🔒 The exact address is shared with you once you book.')}</p>` : ''}
      ${(() => { const cl = classById(s.classId); return cl ? `<div class="tags" style="margin:8px 0 0"><span class="tag">${T(PARENT_STAYS[cl.parent_stays] || '')}</span><span class="tag">${T(LEVELS[cl.level] || '')}</span></div>${cl.description ? `<p class="meta" style="margin:8px 0 0">${esc(cl.description.length > 160 ? cl.description.slice(0, 160) + '…' : cl.description)} <a class="lnk" data-details="${cl.id}">${T('More')}</a></p>` : ''}${cl.what_to_bring ? `<p class="meta" style="margin:6px 0 0"><b>${T('Bring:')}</b> ${esc(cl.what_to_bring)}</p>` : ''}` : ''; })()}
      ${waiverNote(s.classId)}
      ${whoPicker(s)}
      <p id="bkCost"></p>
      <p class="meta" style="margin:0 0 4px">${late ? T("⚠️ This class starts within {h} hours, so this booking <b>can't be cancelled</b> or refunded.", { h: cancelHours }) : T('Free cancellation up to {h} hours before the class starts.', { h: cancelHours })}</p>
      <div class="actions"><button class="btn ghost" data-close>${T('Not now')}</button>
        ${enough ? `<button class="btn" data-confirm="${s.id}">${T('Confirm booking')}</button>` : `<button class="btn" data-goplans>${T('See plans')}</button>`}</div>`);
    updateBookCost(s);
    return;
  }
  if ((el = hit('[data-wait]'))) {
    if (map) map.closePopup();
    if (!user) return openAuth('login', T('Log in or sign up to join the waitlist.'));
    if (profile && profile.role !== 'parent') return toast(T('Only parent accounts can join a waitlist.'));
    const s = SESSIONS.find(x => x.id === el.dataset.wait);
    openModal(`
      <h2>${T('Join the waitlist')}</h2>
      <div class="meta">${esc(s.title)} · ${esc(s.studio)}<br>${T('{day} at {time}', { day: dayName(s.date), time: s.time })}</div>
      <p>${T("This class is full. If a spot opens up, <b>we'll book it for you automatically</b> and email you. It uses ⭐ {n} credits then, and you can still cancel for free up to {h} hours before.", { n: s.credits, h: cancelHours })}</p>
      <p class="meta">${T('Make sure you have enough credits when a spot opens, or it goes to the next family in line.')}</p>
      ${waiverNote(s.classId)}
      <div class="label">${T("Who's coming?")}</div>
      <select id="wlWho">${kids.map(k => `<option value="${esc(k.name)}">${esc(k.name)}</option>`).join('')}<option value="">${kids.length ? T('Someone else') : T('My little one')}</option></select>
      <div class="actions"><button class="btn ghost" data-close>${T('Not now')}</button><button class="btn" data-confirmwait="${s.id}">${T('Join waitlist')}</button></div>`);
    return;
  }
  if ((el = hit('[data-confirmwait]'))) {
    const s = SESSIONS.find(x => x.id === el.dataset.confirmwait), attendee = ($('#wlWho') || {}).value || null;
    const need = unsignedWaivers(s.classId, attendeeNames([attendee]));
    if (need.length) { openWaiverFlow(need, attendeeNames([attendee]), () => joinWaitlistNow(s, attendee)); return; }
    el.disabled = true;
    await joinWaitlistNow(s, attendee); return;
  }
  if ((el = hit('[data-leavewait]'))) {
    if (!confirm(T("Leave this waitlist? You'll lose your place in line."))) return;
    const { error } = await sb.rpc('leave_waitlist', { p_id: el.dataset.leavewait });
    if (error) return toast(tx(error.message));
    await refresh(); toast(T('You left the waitlist.')); return;
  }
  if ((el = hit('[data-confirm]'))) {
    const s = SESSIONS.find(x => x.id === el.dataset.confirm), who = pickedKids();
    if (!who.length) return toast(T('Pick who is coming.'));
    const need = unsignedWaivers(s.classId, attendeeNames(who));
    if (need.length) { openWaiverFlow(need, attendeeNames(who), () => bookNow(s, who)); return; }
    el.disabled = true;
    await bookNow(s, who); return;
  }
  if ((el = hit('[data-signwaiver]'))) { signWaiverStep(el); return; }
  if (hit('[data-wvnew]')) { editWaiver = 'new'; renderOwner(); return; }
  if ((el = hit('[data-wvedit]'))) { editWaiver = el.dataset.wvedit; renderOwner(); return; }
  if (hit('[data-wvcancel]')) { editWaiver = null; renderOwner(); return; }
  if (hit('[data-wvsave]')) { saveWaiver(); return; }
  if ((el = hit('[data-wvtoggle]'))) { toggleWaiver(el.dataset.wvtoggle); return; }
  if (hit('[data-wvcsv]')) { downloadSignatures(); return; }
  if ((el = hit('[data-viewwaiver]'))) { const w = waivers.find(x => x.id === el.dataset.viewwaiver); if (w) viewWaiver(w.body, w.title, w.studio_id); return; }
  if ((el = hit('[data-viewsig]'))) { const g = mySignatures.find(x => x.id === el.dataset.viewsig) || studioSignatures.find(x => x.id === el.dataset.viewsig); if (g) viewWaiver(g.body, g.title, g.studio_id, g); return; }
  if ((el = hit('[data-cancel]'))) {
    const b = myBookings.find(x => x.id === el.dataset.cancel), s = sessionFromBooking(b);
    if (!b) return;
    const { error } = await sb.rpc('cancel_booking', { p_booking: b.id });
    if (error) return toast(tx(error.message));
    await refresh(); toast(T('Cancelled. ⭐ {n} credits refunded', { n: s.credits })); return;
  }
  if (hit('[data-goplans]')) { closeModal(); showTab('plans'); return; }
  if ((el = hit('[data-plan]'))) { startCheckout(el.dataset.plan); return; }
  if (hit('[data-manage]')) { openPortal(); return; }
}
document.body.addEventListener('click', handleClick);

async function bookNow(s, who) {
  const { error } = await sb.rpc('book_class_multi', { p_slot: s.key, p_date: s.dateStr, p_attendees: who });
  closeModal();
  if (error) {
    // the studio may have just added or updated a waiver: get the latest and ask to sign
    if (error.message === WAIVER_MSG) { await loadPublic(); const need = unsignedWaivers(s.classId, attendeeNames(who)); if (need.length) return openWaiverFlow(need, attendeeNames(who), () => bookNow(s, who)); }
    toast(tx(error.message)); await refresh(); return;
  }
  await refresh(); toast((who.length > 1 ? T('🎉 Booked {title} for {n} kids!', { title: s.title, n: who.length }) : T('🎉 Booked {title}!', { title: s.title })) + (s.hasAddr && !s.loc ? ' ' + T('The address is in My classes.') : ''));
}
async function joinWaitlistNow(s, attendee) {
  const { data, error } = await sb.rpc('join_waitlist', { p_slot: s.key, p_date: s.dateStr, p_attendee: attendee });
  closeModal();
  if (error) {
    if (error.message === WAIVER_MSG) { await loadPublic(); const need = unsignedWaivers(s.classId, attendeeNames([attendee])); if (need.length) return openWaiverFlow(need, attendeeNames([attendee]), () => joinWaitlistNow(s, attendee)); }
    await refresh(); return toast(tx(error.message));
  }
  await refresh(); toast(T("⏳ You're #{n} on the waitlist. We'll email you if you get in.", { n: data }));
}

// ---------- Booking several kids at once ----------
// Checkboxes for each child not already booked in this session ('' = the parent's name, for families with no kids saved)
function whoPicker(s) {
  const taken = myBookings.filter(b => `${b.slot_id}_${b.session_date}` === s.id).map(b => b.attendee_name);
  const free = kids.filter(k => !taken.includes(k.name));
  if (!kids.length) return '<input type="hidden" id="bkOnly" value="">';
  const fits = k => { const m = monthsOld(k.birthday); return m >= s.ageMin && m <= s.ageMax; };
  const first = free.find(fits) || free[0];
  return `<div class="label">${T("Who's coming?")}</div><div id="bkWho" style="display:flex;flex-direction:column;gap:6px;margin-bottom:6px">
    ${taken.length ? `<div class="meta">${T('Already booked:')} ${esc(taken.join(', '))}</div>` : ''}
    ${free.map(k => `<label class="chk"><input type="checkbox" value="${esc(k.name)}" ${k === first ? 'checked' : ''}> ${esc(k.name)}${fits(k) ? '' : ` <span class="meta">${T('(outside the age range)')}</span>`}</label>`).join('')}
  </div>`;
}
const pickedKids = () => $('#bkOnly') ? [null] : [...document.querySelectorAll('#bkWho input:checked')].map(i => i.value);
function updateBookCost(s) {
  const n = pickedKids().length, total = n * s.credits, have = profile ? profile.credits : 0, btn = $('[data-confirm]');
  const tooMany = n > s.spots;
  $('#bkCost').innerHTML = `<b>${T('Cost: ⭐ {n} credits', { n: total })}</b>${n > 1 ? ` (${n} × ${s.credits})` : ''} · ${T('You have {n}', { n: have })}`
    + (tooMany ? `<br><span class="low">${T(s.spots === 1 ? 'Only {n} spot left.' : 'Only {n} spots left.', { n: s.spots })}</span>` : '')
    + (total > have ? `<br><span class="low">${T('You need {n} more credits. Pick a plan to top up.', { n: total - have })}</span>` : '');
  if (btn) btn.disabled = !n || tooMany || total > have;
}
document.body.addEventListener('change', e => {
  if (!e.target.closest('#bkWho')) return;
  const s = SESSIONS.find(x => x.id === ($('[data-confirm]') || {}).dataset?.confirm);
  if (s) updateBookCost(s);
});

// ---------- Tabs ----------
const VIEWS = ['explore', 'bookings', 'plans', 'profile', 'studio', 'owner', 'admin'];
function showTab(name) {
  let view = name;
  if (name.startsWith('a-')) { adminTab = name.slice(2); view = 'admin'; }
  else if (name.startsWith('o-')) { ownerTab = name.slice(2); view = 'owner'; }
  else if (name === 'owner' && isStudioUser()) ownerTab = 'overview';
  currentView = view;
  VIEWS.forEach(t => $('#view-' + t).classList.toggle('hidden', t !== view));
  markNav();
  if (view !== 'studio') document.title = T('LittlePass San Diego | Baby & toddler classes');
  if (!['studio', 'owner', 'admin'].includes(view)) lastTab = view;
  else if (view === 'admin') lastTab = name;
  else if (view === 'owner') lastTab = name.startsWith('o-') ? name : 'owner';
  if (view === 'bookings') renderBookings();
  if (view === 'plans') renderPlans();
  if (view === 'profile') renderProfile();
  if (view === 'owner') renderOwner();
  if (view === 'admin') renderAdmin();
  window.scrollTo(0, 0);
}
document.querySelector('nav.tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); };

function renderAll() {
  renderHeader(); renderFilters(); renderResults(); renderBookings(); renderPlans(); renderProfile();
  if (!$('#view-studio').classList.contains('hidden')) renderStudio();
  if (!$('#view-owner').classList.contains('hidden')) renderOwner();
  if (!$('#view-admin').classList.contains('hidden')) renderAdmin();
}

// ---------- iPhone: "Add to Home Screen" tip ----------
// iPhones can't show an install prompt, so we explain it once. Hidden when already installed or dismissed.
function maybeShowInstallTip() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const installed = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  let seen = false; try { seen = !!localStorage.getItem('lp-install-tip'); } catch (e) {}
  if (!ios || installed || seen) return;
  setTimeout(() => { if (currentView === 'explore') $('#installTip').classList.add('show'); }, 6000);
}
$('#installClose').onclick = () => { $('#installTip').classList.remove('show'); try { localStorage.setItem('lp-install-tip', '1'); } catch (e) {} };
maybeShowInstallTip();

// ---------- Referral links ----------
// A link like littlepass.netlify.app/?ref=code (optionally &src=ad or &src=studio) is remembered in this browser for 30 days
// and attached to the account if the person signs up, so we can credit whoever brought them. First link wins.
const REF_KEY = 'lp_ref';
function storedReferral() {
  try { const r = JSON.parse(localStorage.getItem(REF_KEY) || 'null'); return r && Date.now() - r.t <= 30 * 864e5 ? r : null; } catch (e) { return null; }
}
function captureReferral() {
  try {
    const q = new URLSearchParams(location.search), ref = (q.get('ref') || '').toLowerCase();
    if (!/^[a-z0-9-]{3,30}$/.test(ref)) return;
    if (!storedReferral()) localStorage.setItem(REF_KEY, JSON.stringify({ ref, src: ['ad', 'studio'].includes(q.get('src')) ? q.get('src') : 'referral', t: Date.now() }));
    q.delete('ref'); q.delete('src');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  } catch (e) {}
}

// ---------- Start ----------
captureReferral();
applyStatic();
renderAll();
(async () => {
  try { await loadPublic(); }
  catch (err) { $('#results').innerHTML = `<div class="empty">${T("Couldn't load classes. Please refresh.")}<br><small>${esc(err.message || err)}</small></div>`; return; }
  loaded = true; buildSessions(); renderAll();
  track('visit');
  { const m = location.hash.match(/^#studio\/(.+)$/); if (m && studioByName(decodeURIComponent(m[1]))) showStudio(decodeURIComponent(m[1]), true); }
  pendingRoute = routeFromHash();
  const co = new URLSearchParams(location.search).get('checkout');
  if (co) { history.replaceState(null, '', location.pathname); afterCheckout(co); }
  // Fires once right away with the saved session, then on every login/logout
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') setTimeout(openNewPassword, 0);
    user = session ? session.user : null;
    const uid = user ? user.id : null;
    if (uid === lastUid && event !== 'INITIAL_SESSION') return; // ignore token refreshes
    lastUid = uid;
    setTimeout(async () => {
      await loadPrivate(); buildSessions();
      // A parent's saved language follows them to new devices, unless they picked one on this device
      if (profile && profile.role === 'parent') {
        let picked = null; try { picked = localStorage.getItem('lp-lang'); } catch (e) {}
        if (!picked && profile.lang && profile.lang !== LANG) { LANG = profile.lang; applyStatic(); }
        else if (profile.lang !== LANG) sb.from('profiles').update({ lang: LANG }).eq('id', user.id).then(() => {}, () => {});
      }
      renderAll();
      if (applyRoute()) return;
      if (isAdmin() && !['admin', 'studio'].includes(currentView)) showTab('a-studios');
      if (isStudioUser() && !['owner', 'studio'].includes(currentView)) showTab('o-overview');
      if (!user && ['owner', 'admin'].includes(currentView)) showTab('explore');
    }, 0);
  });
})();
