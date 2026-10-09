// Builds the public studio pages (/studios and /studios/<slug>) that Google and link previews can read.
// Used by netlify/edge-functions/studio-pages.js. Plain JavaScript with no imports, so it also runs in a browser for testing.

export const CATS = {
  swim: ['Swim', '🏊'], music: ['Music', '🎵'], gym: ['Gym & Movement', '🤸'], art: ['Art & Messy Play', '🎨'],
  sensory: ['Sensory', '🧸'], yoga: ['Parent & Me Yoga', '🧘'], outdoor: ['Outdoor & Nature', '🌿'],
};
const PARENT_STAYS = { stays: 'Parent stays', dropoff: 'Drop-off', either: 'Parent stays or drop-off' };
const LEVELS = { beginner: 'First-timers welcome', all: 'All levels', advanced: 'Some experience helps' };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Same rule as slugify() in app.js
export const slugify = name => String(name).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t12 = t => { const [h, m] = String(t).split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const age = m => m < 12 ? `${m} mo` : `${Math.round(m / 12 * 10) / 10} yr`;
const ageText = (a, b) => `${age(a)} – ${age(b)}`;
const clip = (t, n) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
const list = arr => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' & ' + arr[arr.length - 1];

// Everything public, read with the publishable key, so the database's own privacy rules apply
// (hidden reviews and booked-only addresses never come back).
export async function loadData(sbUrl, key, fetchFn = fetch) {
  const get = async path => {
    const r = await fetchFn(`${sbUrl}/rest/v1/${path}`, { headers: { apikey: key } });
    if (!r.ok) throw new Error(`${path.split('?')[0]}: ${r.status}`);
    return r.json();
  };
  const [studios, classes, slots, reviews, photos, locations] = await Promise.all([
    get('studios?select=id,name,blurb,owner_id,status&status=eq.approved&order=name'),
    get('classes?select=*'),
    get('class_slots?select=class_id,dow,start_time,mins,credits,active&active=eq.true&order=dow,start_time'),
    get('reviews?select=studio_id,class_id,author,stars,body,created_at&order=created_at.desc'),
    get('studio_photos?select=studio_id,path,caption&order=created_at'),
    get('class_locations?select=class_id,address,visibility'),
  ]);
  return { studios, classes, slots, reviews, photos, locations, sbUrl };
}

// Sample studios (no owner) are placeholders and never get indexed, whatever the setting
const indexable = (st, opts) => opts.index && !!st.owner_id;

function summary(d, st) {
  const cs = d.classes.filter(c => c.studio_id === st.id && d.slots.some(s => s.class_id === c.id));
  const hoods = [...new Set(cs.map(c => c.hood))];
  const cats = [...new Set(cs.map(c => c.cat))].filter(c => CATS[c]);
  const rv = d.reviews.filter(r => r.studio_id === st.id);
  const avg = rv.length ? rv.reduce((a, r) => a + r.stars, 0) / rv.length : 0;
  const minAge = cs.length ? Math.min(...cs.map(c => c.age_min)) : 0, maxAge = cs.length ? Math.max(...cs.map(c => c.age_max)) : 0;
  return { cs, hoods, cats, rv, avg, minAge, maxAge };
}

function shell({ title, description, canonical, image, noindex, body, jsonld, site }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="website"><meta property="og:site_name" content="LittlePass">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&display=swap" rel="stylesheet">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
<style>
  :root { --brand: #ff7a59; --brand-fill: #cc4a28; --ink: #2d2a32; --muted: #6b6574; --line: #efe7df; --bg: #fffaf5; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Nunito', system-ui, sans-serif; color: var(--ink); background: var(--bg); line-height: 1.5; }
  a { color: inherit; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; max-width: 860px; margin: 0 auto; }
  .logo { font-weight: 800; font-size: 20px; text-decoration: none; white-space: nowrap; } .logo span { color: var(--brand); }
  main { max-width: 860px; margin: 0 auto; padding: 0 16px 40px; }
  .card { background: #fff; border: 1px solid var(--line); border-radius: 20px; padding: 20px; margin: 14px 0; }
  h1 { font-size: 30px; line-height: 1.15; margin: 0 0 6px; } h2 { font-size: 20px; margin: 28px 0 8px; } h3 { margin: 0 0 4px; font-size: 17px; }
  .meta { color: var(--muted); font-size: 14px; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; }
  .tag { background: #f5efe9; border-radius: 999px; padding: 3px 10px; font-size: 13px; font-weight: 700; }
  .btn { display: inline-block; background: var(--brand-fill); color: #fff; font-weight: 800; text-decoration: none; padding: 12px 20px; border-radius: 14px; }
  .btn.ghost { background: #fff; color: var(--ink); border: 1.5px solid var(--line); }
  .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
  .photos img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 14px; display: block; }
  .cls { display: flex; gap: 14px; } .cls .em { font-size: 28px; line-height: 1; }
  .times { margin: 6px 0 0; font-size: 14px; }
  .rv { border-top: 1px solid var(--line); padding: 10px 0; } .stars { color: #f5a623; letter-spacing: 1px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  .grid a { text-decoration: none; } .grid .card { margin: 0; height: 100%; }
  footer { max-width: 860px; margin: 0 auto; padding: 0 16px 40px; font-size: 13px; color: var(--muted); }
  footer a { color: var(--muted); }
</style></head><body>
<header><a class="logo" href="/">🐣 Little<span>Pass</span></a><a class="btn ghost" href="/" style="padding:8px 14px">Find classes</a></header>
<main>${body}</main>
<footer><p>LittlePass San Diego: one membership for baby and toddler classes at studios across San Diego. Plans start at $49 a month.</p>
<p><a href="/studios">All studios</a> · <a href="/legal/terms.html">Terms</a> · <a href="/legal/privacy.html">Privacy</a></p></footer>
</body></html>`;
}

export function renderStudioPage(d, st, opts) {
  const { cs, hoods, cats, rv, avg, minAge, maxAge } = summary(d, st);
  const url = `${opts.site}/studios/${slugify(st.name)}`;
  const book = `/#studio/${encodeURIComponent(st.name)}`;
  const photos = d.photos.filter(p => p.studio_id === st.id).slice(0, 6);
  const photoUrl = p => `${d.sbUrl}/storage/v1/object/public/studio-photos/${p.path.split('/').map(encodeURIComponent).join('/')}`;
  const catNames = cats.map(c => CATS[c][0].toLowerCase());
  const where = hoods.length ? list(hoods) : 'San Diego';
  const title = `${st.name}: baby & toddler classes in ${where} | LittlePass`;
  const description = clip(st.blurb || `${catNames.length ? list(catNames) + ' classes' : 'Classes'} for ages ${ageText(minAge, maxAge)} in ${where}, San Diego. Book with a LittlePass membership.`, 160);
  const addr = d.locations.find(l => cs.some(c => c.id === l.class_id) && l.visibility === 'public');
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'LocalBusiness', name: st.name, url, description: clip(st.blurb || description, 300),
    areaServed: hoods.map(h => ({ '@type': 'Place', name: `${h}, San Diego, CA` })),
    ...(photos.length ? { image: photos.map(photoUrl) } : {}),
    ...(addr ? { address: { '@type': 'PostalAddress', streetAddress: addr.address, addressRegion: 'CA', addressCountry: 'US' } } : {}),
    ...(rv.length ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: avg.toFixed(1), reviewCount: rv.length, bestRating: 5, worstRating: 1 } } : {}),
  };
  const classCards = cs.map(c => {
    const times = d.slots.filter(s => s.class_id === c.id);
    const minCredits = Math.min(...times.map(s => s.credits));
    const [catLabel, emoji] = CATS[c.cat] || ['Class', '✨'];
    return `<div class="card cls"><div class="em">${emoji}</div><div>
      <h3>${esc(c.title)}</h3>
      <div class="meta">${esc(catLabel)} · ages ${ageText(c.age_min, c.age_max)} · ${esc(c.hood)}${times[0] ? ` · ${times[0].mins} min` : ''}</div>
      <div class="tags">${c.parent_stays && PARENT_STAYS[c.parent_stays] ? `<span class="tag">${PARENT_STAYS[c.parent_stays]}</span>` : ''}${c.level && LEVELS[c.level] ? `<span class="tag">${LEVELS[c.level]}</span>` : ''}<span class="tag">from ⭐ ${minCredits} credits</span></div>
      ${c.description ? `<p style="margin:10px 0 0">${esc(clip(c.description, 320))}</p>` : ''}
      ${c.what_to_bring ? `<p class="meta" style="margin:6px 0 0"><b>Bring:</b> ${esc(c.what_to_bring)}</p>` : ''}
      <p class="times"><b>Every week:</b> ${times.map(s => `${DOW[s.dow]} ${t12(s.start_time)}`).join(' · ')}</p></div></div>`;
  }).join('');
  const body = `
    <div class="card">
      <h1>${esc(st.name)}</h1>
      <div class="meta">📍 ${esc(where)}, San Diego${cs.length ? ` · ages ${ageText(minAge, maxAge)}` : ''}${rv.length ? ` · <span class="stars">★</span> ${avg.toFixed(1)} (${rv.length} review${rv.length === 1 ? '' : 's'})` : ''}</div>
      <div class="tags">${cats.map(c => `<span class="tag">${CATS[c][1]} ${CATS[c][0]}</span>`).join('')}</div>
      ${st.blurb ? `<p style="margin:14px 0 0">${esc(st.blurb)}</p>` : ''}
      <p style="margin:18px 0 0"><a class="btn" href="${esc(book)}">See times &amp; book</a></p>
      <p class="meta" style="margin:10px 0 0">Book with a LittlePass membership: one plan for classes at studios all over San Diego.</p>
    </div>
    ${photos.length ? `<div class="photos">${photos.map(p => `<img src="${esc(photoUrl(p))}" alt="${esc(p.caption || st.name)}" loading="lazy">`).join('')}</div>` : ''}
    <h2>Classes</h2>
    ${classCards || '<p class="meta">No classes on the schedule right now.</p>'}
    ${rv.length ? `<h2>What parents are saying</h2><div class="card">${rv.slice(0, 6).map(r => `<div class="rv"><span class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span> <b>${esc(r.author)}</b><div>${esc(clip(r.body, 400))}</div></div>`).join('')}
      <p class="meta" style="margin:8px 0 0">Reviews come only from parents who attended a class through LittlePass.</p></div>` : ''}
    <p style="margin:24px 0 0"><a class="btn" href="${esc(book)}">See this week's times</a></p>`;
  return shell({ title, description, canonical: url, image: photos[0] ? photoUrl(photos[0]) : `${opts.site}/og-image.png`,
    noindex: !indexable(st, opts), body, jsonld, site: opts.site });
}

export function renderIndexPage(d, opts) {
  const rows = d.studios.map(st => ({ st, ...summary(d, st) })).filter(x => x.cs.length);
  const hoods = [...new Set(rows.flatMap(x => x.hoods))].sort();
  const card = x => `<a href="/studios/${slugify(x.st.name)}"><div class="card"><h3>${esc(x.st.name)}</h3>
    <div class="meta">${esc(list(x.hoods))} · ages ${ageText(x.minAge, x.maxAge)}${x.rv.length ? ` · ★ ${x.avg.toFixed(1)}` : ''}</div>
    <div class="tags">${x.cats.map(c => `<span class="tag">${CATS[c][1]} ${CATS[c][0]}</span>`).join('')}</div></div></a>`;
  const body = `<div class="card"><h1>Baby &amp; toddler classes in San Diego</h1>
      <p style="margin:6px 0 0">${rows.length} studios offering swim, music, gym, art, sensory play and more for ages 0 to 5. One LittlePass membership books them all.</p>
      <p style="margin:16px 0 0"><a class="btn" href="/">Browse this week's classes</a></p></div>
    ${hoods.map(h => `<h2>${esc(h)}</h2><div class="grid">${rows.filter(x => x.hoods.includes(h)).map(card).join('')}</div>`).join('')}`;
  return shell({ title: 'Baby & toddler class studios in San Diego | LittlePass',
    description: 'Every studio on LittlePass San Diego: swim, music, gym, art and sensory classes for babies and toddlers, by neighborhood.',
    canonical: `${opts.site}/studios`, image: `${opts.site}/og-image.png`, noindex: !opts.index, body, site: opts.site });
}

export function renderNotFound(opts) {
  return shell({ title: 'Studio not found | LittlePass', description: 'This studio is not on LittlePass right now.', canonical: `${opts.site}/studios`,
    image: `${opts.site}/og-image.png`, noindex: true, site: opts.site,
    body: '<div class="card"><h1>Studio not found</h1><p>This studio isn\'t on LittlePass right now.</p><p><a class="btn" href="/studios">See all studios</a></p></div>' });
}

export function renderSitemap(d, opts) {
  const urls = [`${opts.site}/`];
  if (opts.index) {
    urls.push(`${opts.site}/studios`);
    d.studios.filter(st => indexable(st, opts) && summary(d, st).cs.length).forEach(st => urls.push(`${opts.site}/studios/${slugify(st.name)}`));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`;
}
