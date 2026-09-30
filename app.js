// LittlePass San Diego: app logic. Data lives in Supabase; this file renders it.

// ---------- Supabase ----------
const SB_URL = 'https://nktwkktslnvredjkqzjq.supabase.co';
const SB_KEY = 'sb_publishable_943cWL3ht_oICvddIanYGw_moFzaMnh'; // publishable key: safe in the browser
const sb = window.supabase.createClient(SB_URL, SB_KEY);

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
  { id: 'sprout', name: 'Sprout', price: 49,  credits: 12, perks: ['About 3 classes / month', 'Book 7 days ahead', 'Free cancellation up to 24h before'] },
  { id: 'bloom',  name: 'Bloom',  price: 89,  credits: 25, perks: ['About 6 classes / month', 'Book 14 days ahead', 'Bring a sibling for +2 credits'], pop: true },
  { id: 'grove',  name: 'Grove',  price: 149, credits: 45, perks: ['About 11 classes / month', 'Priority waitlist', 'Unused credits roll over'] },
];
const REVIEW_POOL = [
  ['Maya R.', 5, 'My daughter looks forward to this every week. The teachers are so patient and kind.'],
  ['Chris T.', 5, 'Clean, welcoming and easy to book. We met other parents in the neighborhood too.'],
  ['Dana L.', 4, 'Great class for our 1-year-old. Gets busy, so book early!'],
  ['Priya S.', 5, 'Best part of our week. My son came home exhausted and happy.'],
  ['Jordan M.', 4, 'Lovely instructors and a nice mix of ages. Parking is a little tight.'],
  ['Sam K.', 5, 'We tried it as a first activity with our newborn and felt totally comfortable.'],
];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------- State ----------
let user = null, profile = null, kids = [], myBookings = [], studioBookings = [], payouts = [];
let studios = [], classes = [], slots = [], counts = {}, reviews = [], loaded = false, cancelHours = 24;
let filters = { age: 'all', cat: 'all', hood: HOODS[0], day: 'all' };
let exploreMode = 'list', lastTab = 'explore', currentView = 'explore', currentStudio = null;
let authState = { mode: 'login', role: 'parent', reason: '' };
let ownerTab = 'overview', bkFilter = 'upcoming', lastUid = undefined;

// ---------- Helpers ----------
const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = new Date(); today.setHours(0, 0, 0, 0);
const todayStr = fmt(today);
const DAYS = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() + i); return d; });
const dayName = d => {
  const diff = Math.round((d - today) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};
const dateLabel = str => new Date(str + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const ageText = (min, max) => {
  const f = m => m < 12 ? `${m} mo` : `${Math.round(m / 12 * 10) / 10} yr`;
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
function openModal(html) { $('#modal').innerHTML = html; $('#modalBg').classList.add('show'); }
function closeModal() { $('#modalBg').classList.remove('show'); }
$('#modalBg').onclick = e => { if (e.target.id === 'modalBg' || e.target.dataset.close !== undefined) closeModal(); };

// ---------- Data ----------
async function loadPublic() {
  const [st, cl, sl, rv, ct, ch] = await Promise.all([
    sb.from('studios').select('*'),
    sb.from('classes').select('*'),
    sb.from('class_slots').select('*'),
    sb.from('reviews').select('*').order('created_at'),
    sb.rpc('booked_counts', { p_from: fmt(DAYS[0]), p_to: fmt(DAYS[6]) }),
    sb.rpc('get_cancel_hours'),
  ]);
  if (typeof ch.data === 'number') cancelHours = ch.data;
  if (st.error || cl.error || sl.error) throw (st.error || cl.error || sl.error);
  studios = st.data; classes = cl.data; slots = sl.data; reviews = rv.data || [];
  counts = {};
  (ct.data || []).forEach(r => { counts[`${r.slot_id}_${r.session_date}`] = Number(r.taken); });
}
async function loadPrivate() {
  kids = []; myBookings = []; studioBookings = []; payouts = [];
  if (!user) { profile = null; return; }
  profile = (await sb.from('profiles').select('*').eq('id', user.id).single()).data;
  if (profile && profile.role === 'studio') {
    const st = studios.find(s => s.owner_id === user.id);
    if (st) {
      const [b, po] = await Promise.all([
        sb.from('bookings').select('*').eq('studio_id', st.id).order('session_date', { ascending: false }).limit(1000),
        sb.from('payouts').select('*').eq('studio_id', st.id).order('created_at', { ascending: false }),
      ]);
      studioBookings = b.data || []; payouts = po.data || [];
    }
  } else {
    const [k, b] = await Promise.all([
      sb.from('kids').select('*').order('created_at'),
      sb.from('bookings').select('*').eq('user_id', user.id).gte('session_date', todayStr),
    ]);
    kids = k.data || []; myBookings = b.data || [];
  }
}
async function refresh() {
  await loadPublic(); await loadPrivate();
  buildSessions(); renderAll();
}

// ---------- Sessions ----------
const SESSIONS = [], PARTNERS = [];
const studioById = id => studios.find(s => s.id === id);
const studioByName = n => studios.find(s => s.name === n);
const myStudio = () => user ? studios.find(s => s.owner_id === user.id) : null;
function buildSessions() {
  SESSIONS.length = 0; PARTNERS.length = 0;
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
      SESSIONS.push({ id, key: sl.id, classId: c.id, studioId: st.id, dateStr, title: c.title, studio: st.name, cat: c.cat, hood: c.hood,
        ageMin: c.age_min, ageMax: c.age_max, credits: sl.credits, priceCents: sl.price_cents, date: d,
        time: t12(sl.start_time), time24: String(sl.start_time).slice(0, 8), mins: sl.mins, capacity: sl.capacity, taken, spots: sl.capacity - taken });
      any = true;
    });
    if (any && COORDS[c.hood] && !PARTNERS.find(x => x.studio === st.name && x.hood === c.hood)) {
      const n = PARTNERS.filter(x => x.hood === c.hood).length, base = COORDS[c.hood];
      PARTNERS.push({ studio: st.name, hood: c.hood, pos: [base[0] + n * 0.006, base[1] + n * 0.008] });
    }
  });
}
const cancellable = b => new Date(`${b.session_date}T${b.session_time}`) - Date.now() >= cancelHours * 36e5;
const bookingFor = id => myBookings.find(b => `${b.slot_id}_${b.session_date}` === id);
const isBooked = id => !!bookingFor(id);
// A booked class, even if the studio has since changed or paused the slot
function sessionFromBooking(b) {
  const live = SESSIONS.find(s => s.id === `${b.slot_id}_${b.session_date}`);
  if (live) return live;
  const c = classes.find(x => x.id === b.class_id), st = studioById(b.studio_id);
  return { id: `${b.slot_id}_${b.session_date}`, key: b.slot_id, title: b.class_title, studio: st ? st.name : 'Studio',
    cat: c ? c.cat : 'all', hood: c ? c.hood : 'San Diego', ageMin: 0, ageMax: 0, credits: b.credits,
    date: new Date(b.session_date + 'T00:00:00'), time: t12(b.session_time), mins: 0, spots: 1 };
}

// ---------- Header + navigation ----------
const isStudioUser = () => !!(user && profile && profile.role === 'studio');
function renderNav() {
  const items = isStudioUser()
    ? [['o-overview', '📊', 'Overview'], ['o-classes', '📚', 'Classes'], ['o-bookings', '📅', 'Bookings'], ['o-earnings', '💰', 'Earnings'], ['o-account', '⚙️', 'Account']]
    : [['explore', '🔍', 'Explore'], ['bookings', '📅', 'My classes'], ['plans', '⭐', 'Plans'], ['profile', '👶', 'Family']];
  const nav = document.querySelector('nav.tabs');
  nav.innerHTML = items.map(([id, ico, label]) => `<button data-tab="${id}"><span class="ico">${ico}</span>${label}</button>`).join('');
  markNav();
}
function markNav() {
  const key = currentView === 'owner' ? 'o-' + ownerTab : currentView;
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === key));
}
function renderHeader() {
  const b = $('#creditBtn');
  $('#ownerBtn').classList.toggle('hidden', !!user);
  if (!user) b.textContent = 'Log in';
  else if (isStudioUser()) { const st = myStudio(); b.textContent = '🏢 ' + (st ? st.name.slice(0, 18) : 'Studio'); }
  else b.textContent = `⭐ ${profile ? profile.credits : 0} credits`;
  renderNav();
}
$('#creditBtn').onclick = () => {
  if (!user) return openAuth('login');
  showTab(isStudioUser() ? 'o-account' : 'plans');
};
$('#ownerBtn').onclick = () => showTab('owner');

// ---------- Auth ----------
function openAuth(mode = 'login', reason = '', role = authState.role) {
  authState = { mode, role, reason };
  const su = mode === 'signup';
  openModal(`
    <h2>${su ? 'Create your account' : 'Welcome back'}</h2>
    ${reason ? `<p class="meta" style="margin:0 0 8px">${esc(reason)}</p>` : ''}
    <div class="seg" style="margin:8px 0 12px"><button data-authmode="login" class="${su ? '' : 'on'}">Log in</button><button data-authmode="signup" class="${su ? 'on' : ''}">Sign up</button></div>
    ${su ? `<div class="label">I am a…</div>
      <div class="seg" style="margin:0 0 12px"><button data-authrole="parent" class="${authState.role === 'parent' ? 'on' : ''}">👶 Parent</button><button data-authrole="studio" class="${authState.role === 'studio' ? 'on' : ''}">🏢 Studio</button></div>
      <div class="label">Your name</div><input id="auName" placeholder="Your name" autocomplete="name">` : ''}
    <div class="label">Email</div><input id="auEmail" type="email" placeholder="you@email.com" autocomplete="email">
    <div class="label">Password</div><input id="auPass" type="password" placeholder="At least 6 characters" autocomplete="${su ? 'new-password' : 'current-password'}">
    <div class="err" id="auErr"></div>
    <div class="actions"><button class="btn ghost" data-close>Cancel</button><button class="btn" data-authgo>${su ? 'Create account' : 'Log in'}</button></div>`);
  setTimeout(() => { const f = $('#auName') || $('#auEmail'); if (f) f.focus(); }, 50);
}
async function authGo() {
  const email = $('#auEmail').value.trim(), password = $('#auPass').value, err = $('#auErr');
  err.textContent = '';
  if (!email || !password) { err.textContent = 'Please enter your email and password.'; return; }
  const btn = $('[data-authgo]'); btn.disabled = true;
  let res;
  if (authState.mode === 'signup') {
    const name = $('#auName').value.trim();
    if (!name) { err.textContent = 'Please enter your name.'; btn.disabled = false; return; }
    res = await sb.auth.signUp({ email, password, options: { data: { name, role: authState.role } } });
    if (!res.error && !res.data.session) {
      openModal('<h2>Check your email 📬</h2><p>We sent a confirmation link to <b>' + esc(email) + '</b>. Click it, then come back and log in.</p><div class="actions"><button class="btn" data-close>OK</button></div>');
      return;
    }
  } else {
    res = await sb.auth.signInWithPassword({ email, password });
  }
  if (res.error) { err.textContent = res.error.message; btn.disabled = false; return; }
  closeModal();
  toast(authState.mode === 'signup' ? 'Welcome to LittlePass! 🎉' : 'Logged in');
}
$('#modal').addEventListener('keydown', e => { if (e.key === 'Enter' && $('[data-authgo]')) authGo(); });

// ---------- Filters UI ----------
function renderFilters() {
  $('#ageChips').innerHTML = AGES.map(a =>
    `<button class="chip ${filters.age === a.id ? 'on' : ''}" data-age="${a.id}">${a.label}</button>`).join('')
    + kids.map((k, i) =>
    `<button class="chip ${filters.age === 'kid' + i ? 'on' : ''}" data-age="kid${i}">👶 ${esc(k.name)}</button>`).join('');
  $('#catChips').innerHTML = Object.entries(CATS).map(([id, c]) =>
    `<button class="chip ${filters.cat === id ? 'on' : ''}" data-cat="${id}">${c.emoji} ${c.label}</button>`).join('');
  $('#hoodSel').innerHTML = HOODS.map(h => `<option ${filters.hood === h ? 'selected' : ''}>${h}</option>`).join('');
  $('#daySel').innerHTML = `<option value="all">Next 7 days</option>` +
    DAYS.map((d, i) => `<option value="${i}" ${filters.day == i ? 'selected' : ''}>${dayName(d)}</option>`).join('');
}
$('#ageChips').onclick = e => { const b = e.target.closest('[data-age]'); if (!b) return; filters.age = b.dataset.age; renderFilters(); renderResults(); };
$('#catChips').onclick = e => { const b = e.target.closest('[data-cat]'); if (!b) return; filters.cat = b.dataset.cat; renderFilters(); renderResults(); };
$('#hoodSel').onchange = e => { filters.hood = e.target.value; renderResults(); };
$('#daySel').onchange = e => { filters.day = e.target.value; renderResults(); };

function matches(s) {
  let min, max;
  if (filters.age.startsWith('kid')) {
    const k = kids[+filters.age.slice(3)];
    if (!k) { filters.age = 'all'; min = 0; max = 72; } else min = max = monthsOld(k.birthday);
  } else { const a = AGES.find(a => a.id === filters.age); min = a.min; max = a.max; }
  if (!(s.ageMin <= max && s.ageMax >= min)) return false;
  if (filters.cat !== 'all' && s.cat !== filters.cat) return false;
  if (filters.hood !== HOODS[0] && s.hood !== filters.hood) return false;
  if (filters.day !== 'all' && s.date.getTime() !== DAYS[+filters.day].getTime()) return false;
  return true;
}

function card(s, mode) {
  const c = CATS[s.cat], booked = isBooked(s.id), left = s.spots;
  let action;
  const bk = mode === 'booking' && bookingFor(s.id);
  if (mode === 'booking') action = bk && !cancellable(bk) ? `<button class="btn ghost" disabled>Can't cancel</button><div class="meta" style="font-size:11px">Within ${cancelHours}h of start</div>` : `<button class="btn ghost" data-cancel="${s.id}">Cancel</button>`;
  else if (booked) action = `<button class="btn ghost" disabled>✓ Booked</button>`;
  else if (left <= 0) action = `<button class="btn" disabled>Full</button>`;
  else action = `<button class="btn" data-book="${s.id}">Book</button>`;
  return `<div class="card">
    <div class="emoji" style="background:${c.color}">${c.emoji}</div>
    <div>
      <h3>${esc(s.title)}</h3>
      <div class="meta"><a class="lnk" data-studio="${esc(s.studio)}">${esc(s.studio)}</a><br>📍 ${s.hood} · 🕘 ${mode === 'booking' ? dayName(s.date) + ', ' : ''}${s.time} (${s.mins} min)</div>
      <div class="tags">
        ${s.ageMax ? `<span class="tag">👶 ${ageText(s.ageMin, s.ageMax)}</span>` : ''}
        ${left <= 3 && left > 0 && mode !== 'booking' ? `<span class="tag low">Only ${left} left</span>` : ''}
      </div>
    </div>
    <div class="right"><div class="cost">⭐ ${s.credits}</div>${action}</div>
  </div>`;
}

function renderResults() {
  const mapMode = exploreMode === 'map';
  $('#results').classList.toggle('hidden', mapMode);
  $('#mapWrap').classList.toggle('hidden', !mapMode);
  if (!loaded) { $('#results').innerHTML = '<div class="empty">Loading classes… 🐣</div>'; return; }
  const list = SESSIONS.filter(matches);
  if (mapMode) { showMap(list); return; }
  if (!list.length) { $('#results').innerHTML = `<div class="empty">No classes match these filters.<br>Try another neighborhood or day 🌊</div>`; return; }
  let html = '';
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
function showMap(list, fly) {
  if (!map) {
    map = L.map('map').setView([32.87, -117.2], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    map.on('popupopen', ev => ev.popup.getElement().addEventListener('click', handleClick));
  }
  markers.forEach(m => m.remove()); markers = [];
  const shown = PARTNERS.filter(p => list.some(s => s.studio === p.studio && s.hood === p.hood));
  $('#mapCount').textContent = `${shown.length} partner${shown.length === 1 ? '' : 's'} match your filters`;
  shown.forEach(p => {
    const mine = list.filter(s => s.studio === p.studio && s.hood === p.hood).sort((a, b) => a.date - b.date);
    const c = CATS[filters.cat !== 'all' ? filters.cat : mine[0].cat];
    const icon = L.divIcon({ className: '', iconSize: [38, 38], iconAnchor: [19, 38], popupAnchor: [0, -36],
      html: `<div class="pin" style="background:${c.color}"><span>${c.emoji}</span></div>` });
    const away = userPos ? ` · ${miles(userPos, p.pos).toFixed(1)} mi away` : '';
    const html = `<div class="pop"><h3><a class="lnk" data-studio="${esc(p.studio)}">${esc(p.studio)}</a></h3>
      <div class="meta">📍 ${p.hood}${away}</div><div style="margin-top:8px">${mine.slice(0, 3).map(s => `<div class="cls"><div><b>${esc(s.title)}</b><br>${dayName(s.date)} · ${s.time}</div>
      ${isBooked(s.id) ? '<span class="tag">✓ Booked</span>' : s.spots <= 0 ? '<span class="tag">Full</span>' : `<button class="btn" data-book="${s.id}">⭐ ${s.credits} · Book</button>`}</div>`).join('')}</div>
      ${mine.length > 3 ? `<div class="meta" style="margin-top:6px">+ ${mine.length - 3} more · <a class="lnk" data-studio="${esc(p.studio)}">see all</a></div>` : ''}</div>`;
    const m = L.marker(p.pos, { icon }).addTo(map).bindPopup(html, { minWidth: 240 });
    m.partner = p; markers.push(m);
  });
  if (userMarker) userMarker.remove();
  userMarker = null;
  if (userPos) userMarker = L.marker(userPos, { icon: L.divIcon({ className: '', iconSize: [16, 16], html: '<div class="me"></div>' }) }).addTo(map);
  const near = userPos ? shown.map(p => [p, miles(userPos, p.pos)]).sort((a, b) => a[1] - b[1]).slice(0, 3) : [];
  $('#nearList').innerHTML = near.length ? '<b>Closest to you:</b> ' + near.map(([p, d]) => `<a class="lnk" data-studio="${esc(p.studio)}">${esc(p.studio)}</a> (${d.toFixed(1)} mi)`).join(' · ') : '';
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
$('#nearBtn').onclick = () => {
  if (!navigator.geolocation) return toast('Location is not available in this browser');
  toast('Finding you…');
  navigator.geolocation.getCurrentPosition(pos => {
    const here = [pos.coords.latitude, pos.coords.longitude];
    if (Math.min(...PARTNERS.map(p => miles(here, p.pos))) > 60) { toast("You're outside San Diego. Showing all partners."); return; }
    userPos = here; showMap(SESSIONS.filter(matches), true);
  }, () => toast("Couldn't get your location. Allow location access and try again."), { timeout: 8000 });
};

// ---------- Studio pages ----------
const hash = t => [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const starStr = n => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
function showStudio(name) { currentStudio = name; renderStudio(); showTab('studio'); }
function renderStudio() {
  const st = studioByName(currentStudio), el = $('#view-studio');
  if (!st) { el.innerHTML = '<button class="back" data-back>← Back</button><div class="empty">Studio not found</div>'; return; }
  const cs = classes.filter(c => c.studio_id === st.id);
  const cats = [...new Set(cs.map(c => c.cat))], hoods = [...new Set(cs.map(c => c.hood))];
  const h = hash(st.name), sample = st.owner_id === null;
  const real = reviews.filter(r => r.studio_id === st.id).map(r => [r.author, r.stars, r.body]);
  const seed = sample ? [0, 1, 2].map(i => REVIEW_POOL[(h + i * 2) % REVIEW_POOL.length]) : [];
  const all = seed.concat(real);
  const avg = all.length ? all.reduce((a, r) => a + r[1], 0) / all.length : 0;
  const list = SESSIONS.filter(s => s.studio === st.name).sort((a, b) => a.date - b.date || timeVal(a.time) - timeVal(b.time));
  let sched = '';
  DAYS.forEach(d => {
    const items = list.filter(s => s.date.getTime() === d.getTime());
    if (items.length) sched += `<h3 class="day-h">${dayName(d)}</h3><div class="grid">${items.map(s => card(s)).join('')}</div>`;
  });
  const c0 = CATS[cats[0]] || CATS.all;
  el.innerHTML = `
    <button class="back" data-back>← Back</button>
    <div class="banner" style="background:${c0.color}">
      <div class="big">${c0.emoji}</div>
      <div><h1>${esc(st.name)}</h1>
        <div class="meta">${all.length ? `<span class="stars">${starStr(avg)}</span> ${avg.toFixed(1)} (${all.length} review${all.length > 1 ? 's' : ''})` : 'New on LittlePass'}</div>
        <div class="meta">📍 ${hoods.length ? hoods.join(' & ') : 'San Diego'}</div></div>
    </div>
    <div class="panel"><div class="label">About</div><p style="margin:0">${esc(st.blurb || 'A LittlePass partner studio.')}</p>
      <div class="tags">${cats.map(c => `<span class="tag">${CATS[c].emoji} ${CATS[c].label}</span>`).join('')}</div></div>
    ${cats.length ? `<div class="label" style="margin-top:20px">Photos</div>
    <div class="photos">${cats.concat(cats, cats).slice(0, 3).map(c => `<div class="photo" style="background:${CATS[c].color}">${CATS[c].emoji}</div>`).join('')}</div>
    <div class="meta" style="margin-top:4px">Placeholder images. Real partner photos would appear here.</div>` : ''}
    <h2 style="margin:24px 0 0">Schedule this week</h2>${sched || '<div class="empty">No classes this week</div>'}
    <h2 style="margin:28px 0 0">Reviews</h2>
    <div class="panel">${all.length ? all.map(r => `<div class="review"><b>${esc(r[0])}</b> <span class="stars">${starStr(r[1])}</span><div>${esc(r[2])}</div></div>`).join('') : '<p class="meta" style="margin:0">No reviews yet. Be the first!</p>'}
      ${seed.length ? '<div class="meta" style="margin-top:8px"><i>Sample reviews for this demo partner.</i></div>' : ''}</div>
    <div class="panel"><div class="label">Leave a review</div>
      <select id="rvStars"><option value="5">★★★★★ Loved it</option><option value="4">★★★★☆ Great</option><option value="3">★★★☆☆ Okay</option><option value="2">★★☆☆☆ Not great</option><option value="1">★☆☆☆☆ Poor</option></select>
      <textarea id="rvText" rows="3" placeholder="What did your little one think?"></textarea>
      <button class="btn" data-postreview>${user ? 'Post review' : 'Log in to post a review'}</button></div>`;
}
async function postReview() {
  if (!user) return openAuth('login', 'Log in to leave a review.');
  const text = $('#rvText').value.trim(), st = studioByName(currentStudio);
  if (!text) return toast('Please write a few words');
  const { error } = await sb.from('reviews').insert({ studio_id: st.id, user_id: user.id,
    author: (profile && profile.display_name) || 'Parent', stars: +$('#rvStars').value, body: text });
  if (error) return toast(error.message);
  await loadPublic(); renderStudio(); toast('Thanks for your review 💛');
}

// ---------- Views ----------
function renderBookings() {
  if (!user) { $('#bookingList').innerHTML = `<div class="empty">Log in to see your classes.<br><button class="btn" style="margin-top:12px" data-login>Log in</button></div>`; return; }
  const list = myBookings.map(sessionFromBooking)
    .sort((a, b) => a.date - b.date || timeVal(a.time) - timeVal(b.time));
  $('#bookingList').innerHTML = list.length
    ? `<div class="grid">${list.map(s => card(s, 'booking')).join('')}</div>`
    : `<div class="empty">No classes booked yet.<br><button class="btn" style="margin-top:12px" data-goexplore>Find a class</button></div>`;
}
function renderPlans() {
  const cur = p => profile && profile.plan === p.id && profile.plan_started_at && Date.now() - new Date(profile.plan_started_at) < 30 * 864e5;
  $('#planList').innerHTML = PLANS.map(p => `
    <div class="plan ${p.pop ? 'pop' : ''}">
      ${p.pop ? '<div class="badge">Most popular</div>' : ''}
      <h3>${p.name}</h3>
      <div class="price">$${p.price}<small>/month</small></div>
      <div class="meta">⭐ ${p.credits} credits every month</div>
      <ul>${p.perks.map(x => `<li>${x}</li>`).join('')}</ul>
      ${cur(p) ? `<button class="btn ghost" disabled>✓ Current plan</button>` : `<button class="btn" data-plan="${p.id}">Choose ${p.name}</button>`}
    </div>`).join('');
}
function renderProfile() {
  const el = $('#view-profile');
  if (!user) {
    el.innerHTML = `<h2 style="margin-top:24px">My family</h2><div class="panel"><p style="margin-top:0">Log in to add your kids and get class suggestions for their exact age.</p>
      <button class="btn" data-login>Log in</button> <button class="btn ghost" data-signup>Sign up</button></div>`;
    return;
  }
  const isStudio = profile && profile.role === 'studio';
  el.innerHTML = `<h2 style="margin-top:24px">${isStudio ? 'My account' : 'My family'}</h2>
    <div class="panel"><div class="label">Account</div>
      <div><b>${esc(profile ? profile.display_name : '')}</b> · ${isStudio ? '🏢 Studio' : '👶 Parent'}</div>
      <div class="meta" style="margin-bottom:12px">${esc(user.email)}</div>
      <button class="btn ghost" data-logout>Log out</button></div>
    ${isStudio ? '' : `<div class="panel">
      <div class="label">Add a child</div><input id="kidName" placeholder="Name">
      <div class="label">Birthday</div><input id="kidBday" type="date">
      <button class="btn" data-addkid>Add child</button></div>
    <div class="panel"><div class="label">Your kids</div>${kids.length ? kids.map(k => {
      const m = monthsOld(k.birthday);
      return `<div class="kid"><span style="font-size:24px">👶</span><div><b>${esc(k.name)}</b><div class="meta">${m < 24 ? m + ' months' : Math.floor(m / 12) + ' years'} old</div></div>
        <button class="btn ghost" style="margin-left:auto" data-rmkid="${k.id}">Remove</button></div>`;
    }).join('') : `<p class="meta">Add your child and we'll show classes for their exact age.</p>`}</div>`}`;
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
  ({ overview: ownerOverview, classes: ownerClasses, bookings: ownerBookingsView, earnings: ownerEarnings, account: ownerAccount }[ownerTab] || ownerOverview)(el, st);
}

function sessionRoster(st) {
  // upcoming sessions (next 7 days) with who's booked
  return SESSIONS.filter(s => s.studioId === st.id).sort((a, b) => a.date - b.date || timeVal(a.time) - timeVal(b.time));
}
const bar = (n, cap) => `<div class="fillbar"><div style="width:${cap ? Math.min(100, n / cap * 100) : 0}%"></div></div>`;

function ownerOverview(el, st) {
  const S = studioStats(), sess = sessionRoster(st);
  const weekBk = studioBookings.filter(b => b.session_date >= fmt(DAYS[0]) && b.session_date <= fmt(DAYS[6]));
  const cap = sum(sess, s => s.capacity), taken = sum(sess, s => s.taken);
  el.innerHTML = `<h2 style="margin:24px 0 4px">Hi, ${esc(st.name)} 👋</h2>
    <div class="stats">
      <div class="stat"><b>${weekBk.length}</b>bookings this week</div>
      <div class="stat"><b>${cap ? Math.round(taken / cap * 100) : 0}%</b>spots filled this week</div>
      <div class="stat"><b>${money(S.owed)}</b>owed to you</div>
      <div class="stat"><b>${money(S.upcoming)}</b>booked, coming up</div></div>
    <h3 style="margin:22px 0 8px">Next sessions</h3>
    ${sess.length ? `<div class="panel" style="margin-top:0">${sess.slice(0, 8).map(s => `<div class="sess">
        <div><b>${esc(s.title)}</b><div class="meta">${dayName(s.date)} · ${s.time} · ${s.mins} min</div></div>
        <div style="text-align:right;min-width:90px"><b>${s.taken}/${s.capacity}</b> booked${bar(s.taken, s.capacity)}</div></div>`).join('')}</div>`
      : `<div class="panel"><p class="meta" style="margin:0">No sessions in the next 7 days. Add a class and time slots to get started.</p></div>`}
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
  const { data: c, error } = await sb.from('classes').insert({ studio_id: st.id, title, cat: $('#ncCat').value, hood: $('#ncHood').value, age_min: min, age_max: max }).select().single();
  if (error) return toast(error.message);
  const r = await sb.from('class_slots').insert(slotRows(c.id, sch));
  if (r.error) toast(r.error.message);
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
async function saveClassField(el) {
  const id = el.closest('[data-classbox]').dataset.classbox, c = classes.find(x => x.id === id), f = el.dataset.cf;
  const v = ['age_min', 'age_max'].includes(f) ? +el.value : el.value.trim();
  const patch = { [f]: v };
  if (f === 'title' && !v) { toast('Class name can\'t be empty'); return renderOwner(); }
  if ((f === 'age_min' && v > c.age_max) || (f === 'age_max' && v < c.age_min)) { toast('"To age" must be at least "From age"'); return renderOwner(); }
  const { error } = await sb.from('classes').update(patch).eq('id', id);
  if (error) { toast(error.message); return renderOwner(); }
  c[f] = v; buildSessions(); toast('Saved ✓');
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
        <div><b>${esc(b0.class_title)}</b><div class="meta">${dateLabel(b0.session_date)} · ${t12(b0.session_time)}</div></div>
        <div style="text-align:right;min-width:90px"><b>${g.length}${sl ? '/' + sl.capacity : ''}</b> booked${sl ? bar(g.length, sl.capacity) : ''}</div></div>
        ${g.map(b => `<div class="kid"><span style="font-size:22px">👶</span><div><b>${esc(b.attendee_name)}</b><div class="meta">Parent: ${esc(b.parent_name)}</div></div><div style="margin-left:auto" class="cost">${money(b.price_cents)}</div></div>`).join('')}</div>`;
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

// ----- Account -----
function ownerAccount(el, st) {
  el.innerHTML = `<h2 style="margin:24px 0 4px">Account</h2>
    <div class="panel"><div class="label">Studio name</div><input id="acName" value="${esc(st.name)}">
      <div class="label">Description</div><textarea id="acBlurb" rows="3">${esc(st.blurb || '')}</textarea>
      <button class="btn" data-savestudio>Save</button> <button class="btn ghost" data-studio="${esc(st.name)}">View public page</button></div>
    <div class="panel"><div class="label">Login</div><div class="meta" style="margin-bottom:12px">${esc(user.email)}</div><button class="btn ghost" data-logout>Log out</button></div>`;
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
  ownerTab = 'classes'; await refresh(); toast('Studio created 🎉 Now add your first class');
}
const ov = $('#view-owner');
ov.addEventListener('change', e => {
  const s = e.target.closest('[data-sf]'); if (s) return saveSlot(s);
  const c = e.target.closest('[data-cf]'); if (c) return saveClassField(c);
});
ov.addEventListener('input', e => { if (e.target.matches('[data-ns="price"]')) previewCredits(e.target); });

// ---------- Clicks ----------
async function handleClick(e) {
  const t = e.target, hit = sel => t.closest(sel);
  let el;
  if ((el = hit('[data-studio]'))) { if (map) map.closePopup(); showStudio(el.dataset.studio); return; }
  if (hit('[data-back]')) { showTab(lastTab); return; }
  if (hit('[data-postreview]')) { postReview(); return; }
  if (hit('[data-login]')) { openAuth('login'); return; }
  if (hit('[data-signup]')) { openAuth('signup', '', 'parent'); return; }
  if (hit('[data-signup-studio]')) { openAuth('signup', '', 'studio'); return; }
  if (hit('[data-goexplore]')) { showTab('explore'); return; }
  if (hit('[data-logout]')) { await sb.auth.signOut(); profile = null; renderNav(); showTab('explore'); toast('Logged out'); return; }
  if ((el = hit('[data-authmode]'))) { openAuth(el.dataset.authmode, authState.reason); return; }
  if ((el = hit('[data-authrole]'))) { openAuth('signup', authState.reason, el.dataset.authrole); return; }
  if (hit('[data-authgo]')) { authGo(); return; }
  if (hit('[data-createstudio]')) { createStudio(); return; }
  if (hit('[data-createclass]')) { createClass(); return; }
  if (hit('[data-savestudio]')) { saveStudio(); return; }
  if ((el = hit('[data-addsched]'))) { addSlots(el.dataset.addsched, el.closest('details')); return; }
  if ((el = hit('[data-rmslot]'))) { deleteSlot(el.dataset.rmslot); return; }
  if ((el = hit('[data-rmclass]'))) { deleteClass(el.dataset.rmclass); return; }
  if ((el = hit('[data-goto]'))) { showTab(el.dataset.goto); return; }
  if ((el = hit('[data-bkf]'))) { bkFilter = el.dataset.bkf; renderOwner(); return; }
  if (hit('[data-addkid]')) {
    const name = $('#kidName').value.trim(), bday = $('#kidBday').value;
    if (!name || !bday) return toast('Please add a name and birthday');
    const { error } = await sb.from('kids').insert({ user_id: user.id, name, birthday: bday });
    if (error) return toast(error.message);
    await loadPrivate(); renderProfile(); renderFilters(); toast(`Added ${name} 💛`); return;
  }
  if ((el = hit('[data-rmkid]'))) {
    await sb.from('kids').delete().eq('id', el.dataset.rmkid);
    filters.age = 'all'; await loadPrivate(); renderProfile(); renderFilters(); renderResults(); return;
  }
  if ((el = hit('[data-book]'))) {
    if (map) map.closePopup();
    if (!user) return openAuth('login', 'Log in or sign up to book classes. New accounts start with 10 free credits.');
    if (profile && profile.role === 'studio') return toast('Studio accounts can\'t book classes. Use a parent account.');
    const s = SESSIONS.find(x => x.id === el.dataset.book), credits = profile ? profile.credits : 0, enough = credits >= s.credits;
    const late = new Date(`${s.dateStr}T${s.time24}`) - Date.now() < cancelHours * 36e5;
    openModal(`
      <div class="emoji" style="background:${CATS[s.cat].color};margin-bottom:12px">${CATS[s.cat].emoji}</div>
      <h2>${esc(s.title)}</h2>
      <div class="meta">${esc(s.studio)} · ${s.hood}<br>${dayName(s.date)} at ${s.time} · ${s.mins} min<br>Ages ${ageText(s.ageMin, s.ageMax)}</div>
      <p><b>Cost: ⭐ ${s.credits} credits</b> · You have ${credits}</p>
      <div class="label">Who's coming?</div>
      <select id="bkWho">${kids.map(k => `<option value="${esc(k.name)}">${esc(k.name)}</option>`).join('')}<option value="">${kids.length ? 'Someone else' : 'My little one'}</option></select>
      <p class="meta" style="margin:0 0 4px">${late ? `⚠️ This class starts within ${cancelHours} hours, so this booking <b>can't be cancelled</b> or refunded.` : `Free cancellation up to ${cancelHours} hours before the class starts.`}</p>
      ${enough ? '' : `<p class="low">You need ${s.credits - credits} more credits. Pick a plan to top up.</p>`}
      <div class="actions"><button class="btn ghost" data-close>Not now</button>
        ${enough ? `<button class="btn" data-confirm="${s.id}">Confirm booking</button>` : `<button class="btn" data-goplans>See plans</button>`}</div>`);
    return;
  }
  if ((el = hit('[data-confirm]'))) {
    const s = SESSIONS.find(x => x.id === el.dataset.confirm);
    const who = ($('#bkWho') || {}).value || null;
    el.disabled = true;
    const { error } = await sb.rpc('book_class', { p_slot: s.key, p_date: s.dateStr, p_attendee: ($('#bkWho') || {}).value || null });
    closeModal();
    if (error) { toast(error.message); await refresh(); return; }
    await refresh(); toast(`🎉 Booked ${s.title}!`); return;
  }
  if ((el = hit('[data-cancel]'))) {
    const b = bookingFor(el.dataset.cancel), s = sessionFromBooking(b);
    const { error } = await sb.rpc('cancel_booking', { p_booking: b.id });
    if (error) return toast(error.message);
    await refresh(); toast(`Cancelled. ⭐ ${s.credits} credits refunded`); return;
  }
  if (hit('[data-goplans]')) { closeModal(); showTab('plans'); return; }
  if ((el = hit('[data-plan]'))) {
    if (!user) return openAuth('login', 'Log in or sign up to choose a plan.');
    const p = PLANS.find(x => x.id === el.dataset.plan);
    const { error } = await sb.rpc('demo_choose_plan', { p_plan: p.id });
    if (error) return toast(error.message);
    await refresh(); toast(`You're on the ${p.name} plan! (demo, no charge)`);
  }
}
document.body.addEventListener('click', handleClick);

// ---------- Tabs ----------
const VIEWS = ['explore', 'bookings', 'plans', 'profile', 'studio', 'owner'];
function showTab(name) {
  let view = name;
  if (name.startsWith('o-')) { ownerTab = name.slice(2); view = 'owner'; }
  else if (name === 'owner' && isStudioUser()) ownerTab = 'overview';
  currentView = view;
  VIEWS.forEach(t => $('#view-' + t).classList.toggle('hidden', t !== view));
  markNav();
  if (!['studio', 'owner'].includes(view)) lastTab = view;
  else if (view === 'owner') lastTab = name.startsWith('o-') ? name : 'owner';
  if (view === 'bookings') renderBookings();
  if (view === 'plans') renderPlans();
  if (view === 'profile') renderProfile();
  if (view === 'owner') renderOwner();
  window.scrollTo(0, 0);
}
document.querySelector('nav.tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); };

function renderAll() {
  renderHeader(); renderFilters(); renderResults(); renderBookings(); renderPlans(); renderProfile();
  if (!$('#view-studio').classList.contains('hidden')) renderStudio();
  if (!$('#view-owner').classList.contains('hidden')) renderOwner();
}

// ---------- Start ----------
renderAll();
(async () => {
  try { await loadPublic(); }
  catch (err) { $('#results').innerHTML = `<div class="empty">Couldn't load classes. Please refresh.<br><small>${esc(err.message || err)}</small></div>`; return; }
  loaded = true; buildSessions(); renderAll();
  // Fires once right away with the saved session, then on every login/logout
  sb.auth.onAuthStateChange((event, session) => {
    user = session ? session.user : null;
    const uid = user ? user.id : null;
    if (uid === lastUid && event !== 'INITIAL_SESSION') return; // ignore token refreshes
    lastUid = uid;
    setTimeout(async () => {
      await loadPrivate(); buildSessions(); renderAll();
      if (isStudioUser() && !['owner', 'studio'].includes(currentView)) showTab('o-overview');
      if (!user && currentView === 'owner') showTab('explore');
    }, 0);
  });
})();
