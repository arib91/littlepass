// Netlify Edge Function: real web pages for each studio, so Google can list them and shared links show a preview.
//   /studios          all studios by neighborhood
//   /studios/<slug>   one studio (slug = the studio name in lowercase-with-dashes)
//   /sitemap.xml      the list of pages for search engines
// The app itself still lives at / ; every page links into it to book.
import { loadData, renderStudioPage, renderIndexPage, renderNotFound, renderSitemap, slugify } from '../lib/studio-page.js';

const SB_URL = 'https://nktwkktslnvredjkqzjq.supabase.co';
const SB_KEY = 'sb_publishable_943cWL3ht_oICvddIanYGw_moFzaMnh'; // publishable key: read-only, same as in app.js
const SITE = 'https://littlepass.netlify.app';                  // change when littlepass.com is connected
// Keep false until launch: the sample studios and their made-up reviews must not show up on Google.
// At launch (after the sample studios are deleted), set to true and push.
const INDEX_STUDIO_PAGES = false;

const SECURITY = {
  'Content-Security-Policy': "default-src 'none'; img-src 'self' data: https://nktwkktslnvredjkqzjq.supabase.co; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Netlify's CDN keeps a copy for 10 minutes, so studio edits show up within minutes without hitting the database on every visit
  'Netlify-CDN-Cache-Control': 'public, max-age=600, stale-while-revalidate=3600',
  'Cache-Control': 'public, max-age=300',
};

export default async (request) => {
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  const opts = { site: SITE, index: INDEX_STUDIO_PAGES };
  try {
    const data = await loadData(SB_URL, SB_KEY);
    if (path === '/sitemap.xml') {
      return new Response(renderSitemap(data, opts), { headers: { ...SECURITY, 'Content-Type': 'application/xml; charset=utf-8' } });
    }
    const html = { ...SECURITY, 'Content-Type': 'text/html; charset=utf-8' };
    if (path === '/studios') return new Response(renderIndexPage(data, opts), { headers: html });
    const slug = decodeURIComponent(path.slice('/studios/'.length)).toLowerCase();
    const st = data.studios.find(s => slugify(s.name) === slug);
    if (!st) return new Response(renderNotFound(opts), { status: 404, headers: html });
    return new Response(renderStudioPage(data, st, opts), { headers: html });
  } catch (e) {
    console.error('studio-pages', e);
    // Don't cache a failure; send people to the app instead
    return new Response(null, { status: 302, headers: { Location: '/', 'Cache-Control': 'no-store' } });
  }
};

export const config = { path: ['/studios', '/studios/*', '/sitemap.xml'], cache: 'manual' };
