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
  { id: 'sprout', name: 'Sprout', price: 49,  credits: 12, perks: ['About 3 classes / month', 'Book 7 days ahead', 'Free cancellation'] },
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
let user = null, profile = null, kids = [], myBookings = [], ownerBookings = 0;
let studios = [], classes = [], counts = {}, reviews = [], loaded = false;
let filters = { age: 'all', cat: 'all', hood: HOODS[0], day: 'all' };
let exploreMode = 'list', lastTab = 'explore', currentStudio = null;
let authState = { mode: 'login', role: 'parent', reason: '' };

// ---------- Helpers ----------
const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = new Date(); today.setHours(0, 0, 0, 0);
const DAYS = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() + i); return d; });
const dayName = d => {
  const diff = Math.round((d - today) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};
const ageText = (min, max) => {
  const f = m => m < 12 ? `${m} mo` : `${Math.round(m / 12 * 10) / 10} yr`;
  return `${f(min)} – ${f(max)}`;
};
const monthsOld = bday => {
  const b = new Date(bday), n = new Date();
  return (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth()) - (n.getDate() < b.getDate() ? 1 : 0);
};
const to12 = t => { let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; };
const timeVal = t => new Date('1/1/2000 ' + t);
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}
function openModal(html) { $('#modal').innerHTML = html; $('#modalBg').classList.add('show'); }
function closeModal() { $('#modalBg').classList.remove('show'); }
$('#modalBg').onclick = e => { if (e.target.id === 'modalBg' || e.target.dataset.close !== undefined) closeModal(); };

// ---------- Data ----------
async function loadPublic() {
  const [st, cl, rv, ct] = await Promise.all([
    sb.from('studios').select('*'),
    sb.from('classes').select('*'),
    sb.from('reviews').select('*').order('created_at'),
    sb.rpc('booked_counts', { p_from: fmt(DAYS[0]), p_to: fmt(DAYS[6]) }),
  ]);
  if (st.error || cl.error) throw (st.error || cl.error);
  studios = st.data; classes = cl.data; reviews = rv.data || [];
  counts = {};
  (ct.data || []).forEach(r => { counts[`${r.class_id}_${r.session_date}`] = Number(r.taken); });
}
async function loadPrivate() {
  if (!user) { profile = null; kids = []; myBookings = []; ownerBookings = 0; return; }
  const [p, k, b] = await Promise.all([
    sb.from('profiles').select('*').eq('id', user.id).single(),
    sb.from('kids').select('*').order('created_at'),
    sb.from('bookings').select('*').gte('session_date', fmt(DAYS[0])),
  ]);
  profile = p.data; kids = k.data || [];
  const all = b.data || [];
  myBookings = all.filter(x => x.user_id === user.id);
  ownerBookings = all.filter(x => x.user_id !== user.id).length; // RLS: only rows for this studio's classes
}
async function refresh() {
  await Promise.all([loadPublic(), loadPrivate()]);
  buildSessions(); renderAll();
}

// ---------- Sessions ----------
const SESSIONS = [], PARTNERS = [];
const studioById = id => studios.find(s => s.id === id);
const studioByName = n => studios.find(s => s.name === n);
const allTemplates = () => classes.map(c => {
  const st = studioById(c.studio_id);
  return { key: c.id, capacity: c.capacity, studio: st,
    custom: !!user && st.owner_id === user.id,
    t: [c.title, st.name, c.cat, c.hood, c.age_min, c.age_max, c.credits, c.days, c.start_time, c.mins] };
});
function buildSessions() {
  SESSIONS.length = 0; PARTNERS.length = 0;
  allTemplates().forEach(({ key, t, capacity }) => {
    const [title, studio, cat, hood, ageMin, ageMax, credits, days, time, mins] = t;
    DAYS.forEach(d => {
      if (!days.includes(d.getDay())) return;
      const dateStr = fmt(d), id = `${key}_${dateStr}`;
      SESSIONS.push({ id, key, dateStr, title, studio, cat, hood, ageMin, ageMax, credits, date: d, time, mins,
        spots: capacity - (counts[id] || 0) });
    });
    let p = PARTNERS.find(x => x.studio === studio && x.hood === hood);
    if (!p && COORDS[hood]) {
      const n = PARTNERS.filter(x => x.hood === hood).length, base = COORDS[hood];
      p = { studio, hood, pos: [base[0] + n * 0.006, base[1] + n * 0.008] };
      PARTNERS.push(p);
    }
  });
}
const bookingFor = id => myBookings.find(b => `${b.class_id}_${b.session_date}` === id);
const isBooked = id => !!bookingFor(id);

// ---------- Header ----------
function renderHeader() {
  const b = $('#creditBtn');
  if (!user) b.textContent = 'Log in';
  else if (profile && profile.role === 'studio') b.textContent = '🏢 Studio';
  else b.textContent = `⭐ ${profile ? profile.credits : 0} credits`;
}
$('#creditBtn').onclick = () => {
  if (!user) return openAuth('login');
  showTab(profile && profile.role === 'studio' ? 'owner' : 'plans');
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
  if (mode === 'booking') action = `<button class="btn ghost" data-cancel="${s.id}">Cancel</button>`;
  else if (booked) action = `<button class="btn ghost" disabled>✓ Booked</button>`;
  else if (left <= 0) action = `<button class="btn" disabled>Full</button>`;
  else action = `<button class="btn" data-book="${s.id}">Book</button>`;
  return `<div class="card">
    <div class="emoji" style="background:${c.color}">${c.emoji}</div>
    <div>
      <h3>${esc(s.title)}</h3>
      <div class="meta"><a class="lnk" data-studio="${esc(s.studio)}">${esc(s.studio)}</a><br>📍 ${s.hood} · 🕘 ${mode === 'booking' ? dayName(s.date) + ', ' : ''}${s.time} (${s.mins} min)</div>
      <div class="tags">
        <span class="tag">👶 ${ageText(s.ageMin, s.ageMax)}</span>
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
  const ts = allTemplates().filter(x => x.studio.id === st.id).map(x => x.t);
  const cats = [...new Set(ts.map(t => t[2]))], hoods = [...new Set(ts.map(t => t[3]))];
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
  const list = myBookings.map(b => SESSIONS.find(s => s.id === `${b.class_id}_${b.session_date}`)).filter(Boolean)
    .sort((a, b) => a.date - b.date || timeVal(a.time) - timeVal(b.time));
  $('#bookingList').innerHTML = list.length
    ? `<div class="grid">${list.map(s => card(s, 'booking')).join('')}</div>`
    : `<div class="empty">No classes booked yet.<br><button class="btn" style="margin-top:12px" data-goexplore>Find a class</button></div>`;
}
function renderPlans() {
  $('#planList').innerHTML = PLANS.map(p => `
    <div class="plan ${p.pop ? 'pop' : ''}">
      ${p.pop ? '<div class="badge">Most popular</div>' : ''}
      <h3>${p.name}</h3>
      <div class="price">$${p.price}<small>/month</small></div>
      <div class="meta">⭐ ${p.credits} credits every month</div>
      <ul>${p.perks.map(x => `<li>${x}</li>`).join('')}</ul>
      <button class="btn ${profile && profile.plan === p.id ? 'ghost' : ''}" data-plan="${p.id}">
        ${profile && profile.plan === p.id ? 'Current plan · add credits' : 'Choose ' + p.name}</button>
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

// ---------- Studio owners ----------
function renderOwner() {
  const el = $('#view-owner');
  const head = `<h2 style="margin:24px 0 4px">Partner with LittlePass 🏢</h2><p class="meta" style="margin:0">List your classes and reach San Diego families.</p>`;
  if (!user) {
    el.innerHTML = head + `<div class="panel"><p style="margin-top:0">Create a free studio account to list your classes.</p><button class="btn" data-signup-studio>Sign up as a studio</button> <button class="btn ghost" data-login>Log in</button></div>`;
    return;
  }
  if (!profile || profile.role !== 'studio') {
    el.innerHTML = head + `<div class="panel"><p style="margin-top:0">You're logged in as a <b>parent</b>. Studio tools need a studio account. Log out, then sign up with a different email and choose <b>Studio</b>.</p><button class="btn ghost" data-logout>Log out</button></div>`;
    return;
  }
  const st = studios.find(s => s.owner_id === user.id);
  if (!st) {
    el.innerHTML = head + `<div class="panel"><h3 style="margin:0 0 12px">Set up your studio</h3>
      <div class="label">Studio name</div><input id="stName" placeholder="e.g. Sunny Days Music">
      <div class="label">Short description</div><textarea id="stBlurb" rows="3" placeholder="What makes your classes special?"></textarea>
      <button class="btn" data-createstudio>Create studio</button></div>`;
    return;
  }
  const mine = allTemplates().filter(x => x.studio.id === st.id);
  const sessCount = SESSIONS.filter(s => s.studio === st.name).length;
  const ages = Array.from({ length: 61 }, (_, m) => m).filter(m => m <= 12 || m % 6 === 0);
  const opt = (m, sel) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${m < 12 ? m + ' months' : (m / 12) + (m === 12 ? ' year' : ' years')}</option>`;
  el.innerHTML = head + `
    <div style="display:flex;gap:10px;margin-top:16px">
      <div class="stat"><b>${mine.length}</b>class types</div>
      <div class="stat"><b>${sessCount}</b>sessions this week</div>
      <div class="stat"><b>${ownerBookings}</b>bookings</div></div>
    <div class="panel"><div class="label">${esc(st.name)}</div>
      ${mine.length ? mine.map(x => `<div class="kid"><span style="font-size:24px">${CATS[x.t[2]].emoji}</span>
        <div><b>${esc(x.t[0])}</b><div class="meta">${x.t[3]} · ${x.t[7].map(d => DOW[d]).join(', ')} · ${x.t[8]} · ⭐ ${x.t[6]}</div></div>
        <button class="btn ghost" style="margin-left:auto" data-rmclass="${x.key}">Remove</button></div>`).join('')
        : '<p class="meta">No classes yet. Add your first one below.</p>'}
      <button class="btn ghost" style="margin-top:10px" data-studio="${esc(st.name)}">View your public page</button></div>
    <div class="panel"><h3 style="margin:0 0 12px">Add a class</h3>
      <div class="label">Class name</div><input id="ownTitle" placeholder="e.g. Baby Music Circle">
      <div class="two"><div><div class="label">Activity</div><select id="ownCat">${Object.entries(CATS).filter(([id]) => id !== 'all').map(([id, c]) => `<option value="${id}">${c.emoji} ${c.label}</option>`).join('')}</select></div>
      <div><div class="label">Neighborhood</div><select id="ownHood">${HOODS.slice(1).map(h => `<option>${h}</option>`).join('')}</select></div></div>
      <div class="two"><div><div class="label">Youngest age</div><select id="ownMin">${ages.map(m => opt(m, 6)).join('')}</select></div>
      <div><div class="label">Oldest age</div><select id="ownMax">${ages.map(m => opt(m, 24)).join('')}</select></div></div>
      <div class="label">Days</div>
      <div class="days">${DOW.map((d, i) => `<label><input type="checkbox" value="${i}">${d}</label>`).join('')}</div>
      <div class="two"><div><div class="label">Start time</div><input id="ownTime" type="time" value="10:00"></div>
      <div><div class="label">Length (minutes)</div><input id="ownMins" type="number" value="45" min="15" max="180"></div></div>
      <div class="two"><div><div class="label">Credits per class (1 to 10)</div><input id="ownCredits" type="number" value="4" min="1" max="10"></div>
      <div><div class="label">Spots per class</div><input id="ownCap" type="number" value="8" min="1" max="50"></div></div>
      <button class="btn" data-addclass style="padding:12px 20px">Add class to LittlePass</button></div>`;
}
async function createStudio() {
  const name = $('#stName').value.trim();
  if (!name) return toast('Please enter your studio name');
  const { error } = await sb.from('studios').insert({ owner_id: user.id, name, blurb: $('#stBlurb').value.trim() || null });
  if (error) return toast(error.message.includes('duplicate') ? 'That studio name is taken' : error.message);
  await refresh(); renderOwner(); toast('Studio created 🎉');
}
async function addClass() {
  const st = studios.find(s => s.owner_id === user.id);
  const title = $('#ownTitle').value.trim();
  const days = [...document.querySelectorAll('#view-owner .days input:checked')].map(i => +i.value);
  const min = +$('#ownMin').value, max = +$('#ownMax').value;
  if (!title) return toast('Please name the class');
  if (!days.length) return toast('Pick at least one day');
  if (max < min) return toast('Oldest age must be at least the youngest age');
  if (!$('#ownTime').value) return toast('Please choose a start time');
  const { error } = await sb.from('classes').insert({
    studio_id: st.id, title, cat: $('#ownCat').value, hood: $('#ownHood').value, age_min: min, age_max: max,
    credits: Math.min(10, Math.max(1, +$('#ownCredits').value || 4)), days, start_time: to12($('#ownTime').value),
    mins: Math.min(180, Math.max(15, +$('#ownMins').value || 45)), capacity: Math.min(50, Math.max(1, +$('#ownCap').value || 8)) });
  if (error) return toast(error.message);
  await refresh(); renderOwner(); toast(`✅ ${title} is live in the app!`);
}

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
  if (hit('[data-logout]')) { await sb.auth.signOut(); showTab('explore'); toast('Logged out'); return; }
  if ((el = hit('[data-authmode]'))) { openAuth(el.dataset.authmode, authState.reason); return; }
  if ((el = hit('[data-authrole]'))) { openAuth('signup', authState.reason, el.dataset.authrole); return; }
  if (hit('[data-authgo]')) { authGo(); return; }
  if (hit('[data-createstudio]')) { createStudio(); return; }
  if (hit('[data-addclass]')) { addClass(); return; }
  if ((el = hit('[data-rmclass]'))) {
    const { error } = await sb.from('classes').delete().eq('id', el.dataset.rmclass);
    if (error) return toast(error.message);
    await refresh(); renderOwner(); toast('Class removed'); return;
  }
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
    openModal(`
      <div class="emoji" style="background:${CATS[s.cat].color};margin-bottom:12px">${CATS[s.cat].emoji}</div>
      <h2>${esc(s.title)}</h2>
      <div class="meta">${esc(s.studio)} · ${s.hood}<br>${dayName(s.date)} at ${s.time} · ${s.mins} min<br>Ages ${ageText(s.ageMin, s.ageMax)}</div>
      <p><b>Cost: ⭐ ${s.credits} credits</b> · You have ${credits}</p>
      ${enough ? '' : `<p class="low">You need ${s.credits - credits} more credits. Pick a plan to top up.</p>`}
      <div class="actions"><button class="btn ghost" data-close>Not now</button>
        ${enough ? `<button class="btn" data-confirm="${s.id}">Confirm booking</button>` : `<button class="btn" data-goplans>See plans</button>`}</div>`);
    return;
  }
  if ((el = hit('[data-confirm]'))) {
    const s = SESSIONS.find(x => x.id === el.dataset.confirm);
    el.disabled = true;
    const { error } = await sb.rpc('book_class', { p_class: s.key, p_date: s.dateStr });
    closeModal();
    if (error) { toast(error.message); await refresh(); return; }
    await refresh(); toast(`🎉 Booked ${s.title}!`); return;
  }
  if ((el = hit('[data-cancel]'))) {
    const s = SESSIONS.find(x => x.id === el.dataset.cancel), b = bookingFor(s.id);
    const { error } = await sb.rpc('cancel_booking', { p_booking: b.id });
    if (error) return toast(error.message);
    await refresh(); toast(`Cancelled. ⭐ ${s.credits} credits refunded`); return;
  }
  if (hit('[data-goplans]')) { closeModal(); showTab('plans'); return; }
  if ((el = hit('[data-plan]'))) {
    if (!user) return openAuth('login', 'Log in or sign up to choose a plan.');
    const p = PLANS.find(x => x.id === el.dataset.plan);
    const { error } = await sb.rpc('demo_choose_plan', { p_plan: p.id, p_credits: p.credits });
    if (error) return toast(error.message);
    await refresh(); toast(`Welcome to ${p.name}! +${p.credits} credits (demo, no charge)`);
  }
}
document.body.addEventListener('click', handleClick);

// ---------- Tabs ----------
function showTab(name) {
  ['explore', 'bookings', 'plans', 'profile', 'studio', 'owner'].forEach(t => $('#view-' + t).classList.toggle('hidden', t !== name));
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  if (!['studio', 'owner'].includes(name)) lastTab = name;
  if (name === 'bookings') renderBookings();
  if (name === 'plans') renderPlans();
  if (name === 'profile') renderProfile();
  if (name === 'owner') renderOwner();
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
  sb.auth.onAuthStateChange((_event, session) => {
    user = session ? session.user : null;
    setTimeout(async () => { await loadPrivate(); buildSessions(); renderAll(); }, 0);
  });
})();
