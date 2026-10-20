#!/usr/bin/env node
/* Adrion static build
   1. Rebuilds every English page of adriondmc.com from the captured server HTML + original CSS
      (an exact replica: same markup, text, classes, stylesheets and photographs).
   2. Applies the visual upgrade layer: gallery page, photo cards, strips, lightbox, route maps,
      content fixes, SEO metadata.
   Usage:  node build/build.js            -> dist/ (photos load from https://www.adriondmc.com)
           IMG_BASE= node build/build.js  -> photos referenced locally (after scripts/fetch-images.sh)
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHTML } = require('linkedom');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const ORIGIN = 'https://www.adriondmc.com';
const IMG_BASE = process.env.IMG_BASE !== undefined ? process.env.IMG_BASE : ORIGIN;
const VERSION = '2026-10-20';

const CAP = require(path.join(ROOT, 'source/adrion-capture.json'));
const { REGIONS, THEMES, PLACE, MOMENT, NAMED, EXCLUDE, COORDS } = require(path.join(ROOT, 'data/places.js'));
const UNOTES = require(path.join(ROOT, 'data/unsplash-notes.js'));

/* ------------------------------------------------------------------ utils */
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/* Images that 404 on the live site (/media/* returns 404). Mapped to working originals. */
const BROKEN = {
  '/media/a3b32518515d_lg.webp': '/img/regions/istra-kvarner/rovinj-dawn-aerial.webp',
  '/media/10ac9264f7c9_lg.webp': '/img/fleet/e-class-dusk-lake.webp',
  '/media/506c7992721c_lg.webp': '/img/fleet/emtb-bench-valley-view.webp',
};
const fixPath = (p) => BROKEN[p] || p;
const imgUrl = (p) => (!p ? p : /^(https?:|data:)/.test(p) ? p : IMG_BASE + fixPath(p));

/* image dimensions captured from the live files */
const DIMS = {};
fs.readFileSync(path.join(ROOT, 'data/dims.txt'), 'utf8').trim().split('\n').forEach((line) => {
  const [k, w, h] = line.trim().split(/\s+/);
  const p = k.startsWith('p:') ? '/img/places/' + k.slice(2) + '.webp' : k.startsWith('m:') ? '/img/moments/' + k.slice(2) + '.webp' : k;
  DIMS[p] = [+w, +h];
});
const dimOf = (p) => DIMS[fixPath(p)] || null;

/* Unsplash curated set */
const UNSPLASH = [];
fs.readFileSync(path.join(ROOT, 'data/unsplash-raw.txt'), 'utf8').trim().split('\n').forEach((line, i) => {
  const note = UNOTES[i];
  if (!note) return;
  const [, , id, name, user, slug] = line.split('|');
  const [region, theme, caption, h400] = note;
  UNSPLASH.push({ id, name, user, slug, region, theme, caption, w: 400, h: h400 });
});
const uUrl = (id, w, q = 72) => `https://images.unsplash.com/photo-${id}?auto=format&fit=max&w=${w}&q=${q}`;
const utm = 'utm_source=adrion&utm_medium=referral';
const uCredit = (u) => `Photo: <a href="https://unsplash.com/@${esc(u.user)}?${utm}" target="_blank" rel="noopener">${esc(u.name)}</a> on <a href="https://unsplash.com/photos/${esc(u.slug)}?${utm}" target="_blank" rel="noopener">Unsplash</a>`;
const uById = Object.fromEntries(UNSPLASH.map((u) => [u.id, u]));

/* <img> builder for site photos and Unsplash photos */
function img(src, { alt = '', cls = 'ax-img', eager = false, sizes = '(max-width: 760px) 100vw, 50vw' } = {}) {
  if (src.startsWith('u:')) {
    const u = uById[src.slice(2)];
    const h = Math.round((u.h / u.w) * 1200);
    return `<img class="${cls}" src="${uUrl(u.id, 1200)}" srcset="${uUrl(u.id, 480)} 480w, ${uUrl(u.id, 800)} 800w, ${uUrl(u.id, 1200)} 1200w, ${uUrl(u.id, 1800)} 1800w" sizes="${sizes}" width="1200" height="${h}" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
  }
  const d = dimOf(src);
  const wh = d ? ` width="${d[0]}" height="${d[1]}"` : '';
  return `<img class="${cls}" src="${imgUrl(src)}"${wh} alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
}
function fullUrl(src) { return src.startsWith('u:') ? uUrl(src.slice(2), 2200, 80) : imgUrl(src); }

/* ------------------------------------------------------------------ parse every page */
const PAGES = {};
for (const [p, v] of Object.entries(CAP.pages)) {
  const html = '<!doctype html><html><head></head><body>' + v.body.replace(/<!--[\s\S]*?-->/g, '') + '</body></html>';
  PAGES[p] = { path: p, head: v.head, document: parseHTML(html).document };
}
const D = (p) => PAGES[p].document;

/* ------------------------------------------------------------------ site model */
const REGION_SLUGS = Object.keys(REGIONS);
const region = {}; // slug -> {groups:[{title,items:[{href,name,price,soon}]}], kicker, blurb}
const journeyRegion = {}; // journey path -> region slug
const journeyGroup = {}; // journey path -> Signature | Multi-day | One-day
for (const slug of REGION_SLUGS) {
  const doc = D('/destinations/' + slug);
  const groups = [...doc.querySelectorAll('section.group')].map((g) => ({
    title: text(g.querySelector('.group-title')),
    items: [...g.querySelectorAll('.journey')].map((a) => ({
      href: a.getAttribute('href'), name: text(a.querySelector('.j-name')), price: text(a.querySelector('.j-price')), soon: a.classList.contains('soon'),
    })),
  }));
  groups.forEach((g) => g.items.forEach((it) => { if (it.href) { journeyRegion[it.href] = slug; journeyGroup[it.href] = g.title; } }));
  region[slug] = { groups, kicker: text(doc.querySelector('.kicker')), blurb: text(doc.querySelector('.blurb')) };
}
const journeys = {};
for (const p of Object.keys(PAGES)) {
  const doc = D(p);
  const title = doc.querySelector('.hero__title') || doc.querySelector('.stage .content h1.title');
  if (!title) continue;
  journeys[p] = {
    path: p,
    title: text(title),
    kicker: text(doc.querySelector('.hero__kicker') || doc.querySelector('.stage .content .kicker')),
    price: text(doc.querySelector('.hero__price') || doc.querySelector('.stage .content .price')),
    slides: [...doc.querySelectorAll('img.slide, .stage img.poster')].map((i) => fixPath(i.getAttribute('src'))),
    dayImgs: [...doc.querySelectorAll('.photos img')].map((i) => fixPath(i.getAttribute('src'))),
    points: [...doc.querySelectorAll('.map-points li')].map((li) => text(li)),
    lede: text(doc.querySelector('.lede')),
    region: journeyRegion[p] || '',
    group: journeyGroup[p] || '',
  };
  const j = journeys[p];
  j.emptyHero = j.slides.length === 0;
  if (j.emptyHero) j.slides = [...new Set(j.dayImgs.filter((s) => !/\/moments\//.test(s)))].slice(0, 6);
  if (!j.slides.length) j.slides = j.dayImgs.slice(0, 1);
}
const shortPrice = (j) => { const m = j.price.match(/€[\d,]+/); return m ? 'From ' + m[0] : 'Price on request'; };
const durationOf = (j) => {
  if (j.group === 'One-day') return 'One day';
  const k = j.kicker.toLowerCase();
  const nums = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14 };
  let m = k.match(/(\d+)\s*days?/) || k.match(/(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)\s+days?/);
  if (m) { const n = nums[m[1]] || +m[1]; return n + ' days'; }
  m = j.title.match(/(\d+)\s*Days?/i);
  if (m) return m[1] + ' days';
  const d = D(j.path).querySelectorAll('.node__day').length;
  return d > 1 ? d + ' days' : j.group;
};

/* alt text already written by the site */
const ALTS = {};
for (const p of Object.keys(PAGES)) D(p).querySelectorAll('img').forEach((i) => {
  const s = fixPath(i.getAttribute('src')); const a = (i.getAttribute('alt') || '').trim();
  if (a && !ALTS[s]) ALTS[s] = a;
});
/* which region an image belongs to, from the journeys that use it */
const IMG_REGION = {};
for (const j of Object.values(journeys)) [...j.slides, ...j.dayImgs].forEach((s) => { if (j.region && !IMG_REGION[s]) IMG_REGION[s] = j.region; });

/* ------------------------------------------------------------------ gallery data */
function describe(src) {
  if (NAMED[src]) { const [c, r, t] = NAMED[src]; return { caption: ALTS[src] || c, region: r || IMG_REGION[src] || '', theme: t }; }
  let m = src.match(/^\/img\/places\/([a-z-]+?)(?:-\d+)?\.webp$/);
  if (m && PLACE[m[1]]) { const [n, r, t] = PLACE[m[1]]; return { caption: ALTS[src] || n, region: r, theme: t }; }
  m = src.match(/^\/img\/moments\/([a-z]+)(?:-\d+)?\.webp$/);
  if (m && MOMENT[m[1]]) {
    const [c, t] = MOMENT[m[1]]; const r = IMG_REGION[src] || (m[1] === 'wetland' || m[1] === 'oak' ? 'slavonija-baranja' : '');
    return { caption: ALTS[src] || (r ? `${c}, ${REGIONS[r].short}` : c), region: r, theme: t };
  }
  return null;
}
const GALLERY = [];
const seen = new Set();
for (const src of Object.keys(DIMS)) {
  if (EXCLUDE.has(src) || seen.has(src)) continue;
  const d = describe(src);
  if (!d) continue;
  seen.add(src);
  GALLERY.push({ src, w: DIMS[src][0], h: DIMS[src][1], ...d, credit: 'Photo: Adrion' });
}
for (const u of UNSPLASH) GALLERY.push({ src: 'u:' + u.id, w: u.w, h: u.h, caption: u.caption, region: u.region, theme: u.theme, credit: uCredit(u) });
/* stable interleave so neighbouring photos differ in place and subject */
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
GALLERY.sort((a, b) => hash(a.src + 'adrion') - hash(b.src + 'adrion'));
const galleryFor = ({ region: r, theme, prefer = [], n = 12, exclude = [] }) => {
  const ex = new Set(exclude.map(fixPath));
  const pool = GALLERY.filter((g) => (!r || g.region === r) && (!theme || [].concat(theme).includes(g.theme)) && !ex.has(g.src));
  const first = prefer.map((p) => pool.find((g) => g.src === p)).filter(Boolean);
  const rest = pool.filter((g) => !first.includes(g));
  // spread themes so a strip is not six photos of the same thing
  const byTheme = {}; rest.forEach((g) => (byTheme[g.theme] = byTheme[g.theme] || []).push(g));
  const mixed = []; let added = true;
  while (added) { added = false; for (const t of Object.keys(byTheme)) { const g = byTheme[t].shift(); if (g) { mixed.push(g); added = true; } } }
  return [...first, ...mixed].slice(0, n);
};

/* ------------------------------------------------------------------ HTML fragments */
function tile(g, { sizes = '(max-width: 760px) 50vw, 25vw', cls = '' } = {}) {
  const reg = g.region ? REGIONS[g.region].short : THEMES[g.theme];
  return `<button type="button" class="ax-tile ${cls}" data-full="${esc(fullUrl(g.src))}" data-caption="${esc(g.caption)}" data-credit="${esc(g.credit)}" aria-label="View photo: ${esc(g.caption)}">`
    + img(g.src, { alt: g.caption, sizes })
    + `<span class="ax-cap" aria-hidden="true"><small>${esc(reg)}</small>${esc(g.caption)}</span></button>`;
}
function mosaic(items, group) {
  return `<ul class="ax-mosaic" data-lb-group="${esc(group)}">` + items.map((g, i) => `<li>${tile(g, { sizes: i % 6 === 0 ? '(max-width: 760px) 100vw, 50vw' : '(max-width: 760px) 50vw, 25vw' })}</li>`).join('') + '</ul>';
}
function strip({ id, kicker, title, lede = '', items, more = '', moreText = 'View the full gallery', cls = '' }) {
  return `<section class="ax-section ax-strip ${cls}" aria-labelledby="${id}"><div class="ax-wrap"><header class="ax-head ax-reveal"><div><span class="ax-kicker">${esc(kicker)}</span><h2 id="${id}">${esc(title)}</h2>${lede ? `<p>${esc(lede)}</p>` : ''}</div>${more ? `<a class="ax-more" href="${more}">${esc(moreText)} <span aria-hidden="true">→</span></a>` : ''}</header><div class="ax-reveal">${mosaic(items, id)}</div></div></section>`;
}
function journeyCard(j, { tall = false } = {}) {
  const r = j.region ? REGIONS[j.region].short : '';
  return `<li><a class="ax-card${tall ? ' ax-card--tall' : ''}" href="${j.path}"><span class="ax-media ax-card__media">${img(j.slides[0], { alt: '', sizes: '(max-width: 620px) 100vw, (max-width: 900px) 50vw, 33vw' })}</span>`
    + `<span class="ax-card__kicker">${esc([r, durationOf(j)].filter(Boolean).join(' · '))}</span><span class="ax-card__title">${esc(j.title)}</span>`
    + `<span class="ax-card__meta"><span>${esc(shortPrice(j))}</span><span class="ax-arrow" aria-hidden="true">→</span></span></a></li>`;
}
function figure(src, caption, { wide = false, credit = '' } = {}) {
  const u = src.startsWith('u:') ? uById[src.slice(2)] : null;
  const cr = credit || (u ? uCredit(u) : '');
  return `<figure class="ax-figure${wide ? ' ax-figure--wide' : ''} ax-reveal"><span class="ax-media">${img(src, { alt: caption, sizes: '(max-width: 1080px) 100vw, 1080px' })}</span><figcaption>${esc(caption)}${cr ? ' · ' + cr : ''}</figcaption></figure>`;
}
function frag(doc, html) { const t = doc.createElement('template'); t.innerHTML = html; return t.content; }
function insertAfter(doc, ref, html) { ref.parentNode.insertBefore(frag(doc, html), ref.nextSibling); }
function insertBefore(doc, ref, html) { ref.parentNode.insertBefore(frag(doc, html), ref); }
/* wrap an <h2> and the block after it into a text + photo split */
function split(doc, h2, src, caption, flip) {
  if (!h2) return;
  const body = h2.nextElementSibling;
  const u = src.startsWith('u:') ? uById[src.slice(2)] : null;
  const wrap = frag(doc, `<div class="ax-split${flip ? ' ax-split--flip' : ''} ax-reveal"><figure class="ax-split__media" style="margin:0"><span class="ax-media">${img(src, { alt: caption, sizes: '(max-width: 760px) 100vw, 380px' })}</span>${u ? `<figcaption class="ax-figure" style="margin:10px 0 0;font-size:11.5px;color:var(--ink-3)">${uCredit(u)}</figcaption>` : ''}</figure><div class="ax-split__text"></div></div>`).firstChild;
  h2.parentNode.insertBefore(wrap, h2);
  const t = wrap.querySelector('.ax-split__text');
  t.appendChild(h2);
  if (body && body.tagName !== 'H2') t.appendChild(body);
}

/* ------------------------------------------------------------------ CSS per page */
const CSS_FILES = Object.entries(CAP.css).filter(([u]) => !u.includes('fonts.googleapis.com')).map(([u, c]) => ({
  url: new URL(u).pathname, css: c, hashes: [...new Set(c.match(/svelte-[a-z0-9]+/g) || [])],
}));
const FONT_CSS = Object.keys(CAP.css).find((u) => u.includes('fonts.googleapis.com'));
function cssFor(html) {
  return CSS_FILES.filter((f) => !f.hashes.length || f.hashes.some((h) => html.includes(h))).map((f) => f.url);
}

/* ------------------------------------------------------------------ JSON-LD */
const ORG = {
  '@type': 'TravelAgency', '@id': ORIGIN + '/#agency', name: 'Adrion Custom Travel Agency', url: ORIGIN + '/',
  email: 'info@adriondmc.com', telephone: '+385 99 512 1707', logo: ORIGIN + '/apple-touch-icon.png',
  address: { '@type': 'PostalAddress', addressLocality: 'Zagreb', addressCountry: 'HR' },
  areaServed: 'Croatia',
  sameAs: ['https://www.instagram.com/adrion.dmc', 'https://www.facebook.com/adrion.dmc', 'https://www.linkedin.com/company/adrion-dmc'],
};
const crumbs = (list) => ({ '@type': 'BreadcrumbList', itemListElement: list.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: ORIGIN + url })) });

/* ------------------------------------------------------------------ shared page transforms */
const NAV_ORDER = ['Destinations', 'Transfers', 'Charters', 'Accommodation', 'Journal', 'Gallery', 'Inquire'];
function common(doc, p) {
  // absolute links to our own origin become root-relative
  doc.querySelectorAll('a[href^="' + ORIGIN + '"]').forEach((a) => a.setAttribute('href', a.getAttribute('href').slice(ORIGIN.length) || '/'));
  // language switch: only EN is rebuilt here, HR/DE point to the live site
  doc.querySelectorAll('.lang a, .overlay__lang a').forEach((a) => {
    const h = a.getAttribute('href') || '';
    if (/^\/(hr|de)(\/|$)/.test(h)) a.setAttribute('href', ORIGIN + h);
    if (/^EN$/i.test(text(a))) a.setAttribute('aria-current', 'true');
    a.setAttribute('lang', text(a).toLowerCase());
  });
  // Gallery in the main nav, mobile overlay and footer
  const navA = doc.querySelector('nav.bar .nav a:last-child');
  if (navA && !doc.querySelector('nav.bar .nav a[href="/gallery"]')) {
    const g = navA.cloneNode(true); g.classList.remove('last'); g.setAttribute('href', '/gallery'); g.textContent = 'Gallery';
    navA.parentNode.insertBefore(g, navA);
  }
  const ovLast = doc.querySelector('.overlay__list li:last-child');
  if (ovLast) { const li = ovLast.cloneNode(true); li.querySelector('a').setAttribute('href', '/gallery'); li.querySelector('a').textContent = 'Gallery'; ovLast.parentNode.insertBefore(li, ovLast); }
  const footJournal = [...doc.querySelectorAll('footer a')].find((a) => a.getAttribute('href') === '/journal');
  if (footJournal) { const g = footJournal.cloneNode(true); g.setAttribute('href', '/gallery'); g.textContent = 'Gallery'; footJournal.parentNode.insertBefore(g, footJournal.nextSibling); }
  // current page marker in nav
  doc.querySelectorAll('nav.bar .nav a, .overlay__list a').forEach((a) => {
    const h = a.getAttribute('href');
    if (h && h !== '/' && (p === h || p.startsWith(h + '/'))) a.setAttribute('aria-current', 'page');
  });
  // menu toggle + overlay semantics
  const tog = doc.querySelector('nav.bar .toggle');
  if (tog) { tog.setAttribute('type', 'button'); tog.setAttribute('aria-label', 'Open menu'); tog.setAttribute('aria-expanded', 'false'); tog.setAttribute('aria-controls', 'site-menu'); }
  const ov = doc.querySelector('.overlay');
  if (ov) { ov.setAttribute('id', 'site-menu'); }
  const ck = doc.querySelector('aside.cookie');
  if (ck) { ck.setAttribute('hidden', ''); ck.setAttribute('aria-label', 'Cookie notice'); }
  doc.querySelectorAll('button:not([type])').forEach((b) => b.setAttribute('type', b.closest('form') ? 'submit' : 'button'));
  // every page gets exactly one <main> landmark (journey pages had none)
  const mc = doc.querySelector('#main-content');
  if (mc && !mc.querySelector('main')) {
    const m = doc.createElement('main');
    m.className = 'ax-main';
    while (mc.firstChild) m.appendChild(mc.firstChild);
    mc.appendChild(m);
  }
  // logo link label
  const mark = doc.querySelector('a.mark');
  if (mark) mark.setAttribute('aria-label', 'Adrion home');
}
/* every photo: rewrite to image host, add dimensions + lazy loading */
function images(doc) {
  const all = [...doc.querySelectorAll('img')];
  all.forEach((im, i) => {
    let s = im.getAttribute('src');
    if (!s || s.startsWith('data:')) return;
    const local = fixPath(s.replace(ORIGIN, ''));
    const d = dimOf(local);
    if (d && !im.getAttribute('width')) { im.setAttribute('width', d[0]); im.setAttribute('height', d[1]); }
    im.setAttribute('src', imgUrl(local));
    if (!im.hasAttribute('decoding')) im.setAttribute('decoding', 'async');
    if (!im.hasAttribute('loading') && !im.hasAttribute('fetchpriority')) im.setAttribute('loading', 'lazy');
  });
  doc.querySelectorAll('[style*="url("]').forEach((el) => {
    el.setAttribute('style', el.getAttribute('style').replace(/url\(\s*'?(\/[^')]+)'?\s*\)/g, (m, u) => `url('${imgUrl(u)}')`));
  });
}
/* hero slideshows: first slide loads immediately, the rest on demand (was 50 images up front) */
function slides(doc, max = 8) {
  doc.querySelectorAll('.slides').forEach((wrap) => {
    const imgs = [...wrap.querySelectorAll('img.slide')];
    imgs.slice(max).forEach((im) => im.remove());
    imgs.slice(0, max).forEach((im, i) => {
      im.setAttribute('alt', '');
      im.removeAttribute('loading');
      if (i === 0) { im.setAttribute('fetchpriority', 'high'); im.classList.add('on'); }
      else { im.setAttribute('data-src', im.getAttribute('src')); im.setAttribute('src', PIXEL); im.classList.remove('on'); }
    });
    wrap.setAttribute('aria-hidden', 'true');
  });
}

/* ------------------------------------------------------------------ page-specific upgrades */
const REGION_IMG = {
  'istra-kvarner': '/img/regions/istra-kvarner/rovinj-dawn-aerial.webp',
  'gorski-kotar-lika': '/img/places/plitvice-4.webp',
  'srednja-dalmacija': '/img/regions/srednja-dalmacija/biokovo-over-makarska.webp',
  'juzna-dalmacija': '/img/places/dubrovnik-above.webp',
  'zagreb-zagorje': '/img/regions/zagreb-zagorje/sljeme-summit-ridges.webp',
  'slavonija-baranja': '/img/places/ilok.webp',
};
const regionCount = (slug) => region[slug].groups.reduce((n, g) => n + g.items.filter((i) => !i.soon).length, 0);

function upgradeHome(doc, ld) {
  const thumbs = {
    '/destinations': ['/img/regions/srednja-dalmacija/biokovo-over-makarska.webp', 'Biokovo above the Makarska Riviera'],
    '/one-day-journeys': ['/img/journeys/cetina/cetina-raft-open-river.webp', 'Rafting on the Cetina'],
    '/fleet': ['/img/fleet/v-class-square-transfer.webp', 'A Mercedes V-Class transfer'],
    '/charter': ['/img/moments/yacht-3.webp', 'A private yacht at anchor'],
    '/luxury-accommodation': ['/img/moments/stay-2.webp', 'A curated stay'],
  };
  doc.querySelectorAll('section.arrange .list a').forEach((a) => {
    const t = thumbs[a.getAttribute('href')];
    if (!t) return;
    a.classList.add('ax-has-thumb');
    a.insertBefore(frag(doc, `<span class="ax-media ax-sthumb">${img(t[0], { alt: '', sizes: '150px' })}</span>`), a.firstChild);
  });
  const where = doc.querySelector('section.where');
  if (where) {
    const lis = [...where.querySelectorAll('.regions .region')];
    const slugs = lis.map((li) => (li.querySelector('a').getAttribute('href') || '').split('/').pop());
    where.insertBefore(frag(doc, '<div class="bgs svelte-14lls96" aria-hidden="true">' + slugs.map((s) => `<img class="bg svelte-14lls96" src="${imgUrl(REGION_IMG[s])}" alt="" loading="lazy" decoding="async">`).join('') + '</div>'), where.firstChild);
    lis.forEach((li, i) => {
      const a = li.querySelector('a');
      a.insertBefore(frag(doc, `<span class="ax-media ax-rmedia">${img(REGION_IMG[slugs[i]], { alt: '', sizes: '(max-width: 560px) 100vw, (max-width: 900px) 50vw, 33vw' })}</span>`), a.firstChild);
      const k = a.querySelector('.region__kicker');
      if (k) k.insertAdjacentHTML('afterend', `<span class="region__soon svelte-14lls96">${regionCount(slugs[i])} journeys</span>`);
    });
    const sig = ['/destinations/northern-central-dalmatia-grand-tour', '/destinations/istria-kvarner-grand-tour', '/destinations/southern-dalmatia-signature-land-and-sea'].map((p) => journeys[p]).filter(Boolean);
    const teaser = galleryFor({ n: 6, prefer: ['/img/places/hvar-3.webp', '/img/journeys/cetina/cetina-rapids-crew.webp', '/img/places/plitvice-falls.webp', '/img/moments/dining-6.webp', '/img/places/dubrovnik-above-2.webp', '/img/moments/yacht-4.webp'] });
    insertAfter(doc, where,
      `<section class="ax-section ax-signature" aria-labelledby="sig-h"><div class="ax-wrap"><header class="ax-head ax-reveal"><div><span class="ax-kicker">Signature journeys</span><h2 id="sig-h">Our most complete journeys, start to finish.</h2><p>Each one private, each one shaped around your party. Book as presented or adapt it to your dates and pace.</p></div><a class="ax-more" href="/destinations">All destinations <span aria-hidden="true">→</span></a></header><ul class="ax-cards ax-cards--3 ax-reveal">${sig.map((j) => journeyCard(j, { tall: true })).join('')}</ul></div></section>`
      + strip({ id: 'teaser-h', kicker: 'The gallery', title: 'Croatia, frame by frame.', lede: 'Coast and canyon, island harbours and inland tables: a first look at the places our journeys reach.', items: teaser, more: '/gallery', cls: 'ax-teaser ax-section--rule' }));
  }
  ld.push(ORG, { '@type': 'WebSite', '@id': ORIGIN + '/#website', url: ORIGIN + '/', name: 'Adrion', publisher: { '@id': ORIGIN + '/#agency' }, inLanguage: 'en' });
}

function upgradeDestinations(doc, ld) {
  const stage = doc.querySelector('.stage-map .stage');
  if (stage) {
    const data = {};
    for (const s of REGION_SLUGS) data['/destinations/' + s] = { img: imgUrl(REGION_IMG[s]), name: REGIONS[s].name, kicker: region[s].kicker, count: regionCount(s) + ' journeys' };
    stage.setAttribute('data-regions', JSON.stringify(data));
    stage.innerHTML = `<div class="reveal svelte-6p33tb"><img class="stage-img svelte-6p33tb" src="${PIXEL}" alt=""></div><div class="stage-copy svelte-6p33tb"><span class="s-prompt svelte-6p33tb">Pick a region</span><span class="copy svelte-6p33tb" hidden><span class="rule svelte-6p33tb"></span><span class="s-name svelte-6p33tb"></span><span class="s-kicker svelte-6p33tb"></span><span class="s-count svelte-6p33tb"></span></span></div>`;
  }
  const explorer = doc.querySelector('section.explorer');
  if (explorer) {
    const cards = REGION_SLUGS.map((s, i) => `<li><a class="ax-card ax-region-card" href="/destinations/${s}"><span class="ax-media ax-card__media">${img(REGION_IMG[s], { alt: '', sizes: '(max-width: 620px) 100vw, (max-width: 900px) 50vw, 33vw' })}</span><span class="ax-idx">0${i + 1}</span><span class="ax-card__title">${esc(REGIONS[s].name)}</span><span class="ax-card__meta"><span>${esc(region[s].kicker)}</span><span class="ax-arrow" aria-hidden="true">→</span></span><span class="ax-card__kicker">${regionCount(s)} journeys</span></a></li>`).join('');
    insertAfter(doc, explorer, `<section class="ax-regions-grid" aria-labelledby="regions-h"><h2 id="regions-h" class="ax-kicker" style="font-family:var(--font-body);font-variant-caps:normal">Or browse the six regions</h2><ul class="ax-cards ax-cards--3 ax-reveal">${cards}</ul></section>`);
  }
  ld.push(crumbs([['Home', '/'], ['Destinations', '/destinations']]));
}

function upgradeRegion(doc, slug, ld) {
  slides(doc);
  doc.querySelectorAll('.journey.soon').forEach((el) => el.closest('li').remove()); // unfinished products stay off the public site
  doc.querySelectorAll('a.journey').forEach((a) => {
    const j = journeys[a.getAttribute('href')];
    if (!j) return;
    a.classList.add('ax-has-thumb');
    const name = a.querySelector('.j-name');
    const t = frag(doc, `<span class="ax-media ax-jthumb">${img(j.slides[0], { alt: '', sizes: '156px' })}</span><span class="ax-jtext"></span>`);
    a.insertBefore(t, a.firstChild);
    const jt = a.querySelector('.ax-jtext');
    jt.appendChild(name);
    jt.insertAdjacentHTML('beforeend', `<span class="ax-jkick">${esc(durationOf(j))}</span>`);
  });
  const foot = doc.querySelector('main .wrap .foot');
  const items = galleryFor({ region: slug, n: 12, prefer: [] });
  if (foot && items.length >= 6) {
    insertBefore(doc, foot, strip({ id: 'region-gallery-h', kicker: 'In pictures', title: REGIONS[slug].name, lede: region[slug].kicker + '.', items: items.slice(0, items.length >= 12 ? 12 : 6), more: '/gallery?region=' + slug, moreText: 'More from this region', cls: 'ax-section--rule ax-bleed' }));
  }
  ld.push(crumbs([['Home', '/'], ['Destinations', '/destinations'], [REGIONS[slug].name, '/destinations/' + slug]]));
}

function upgradeJourney(doc, j, ld) {
  const sw = doc.querySelector('header.hero .slides');
  if (sw && j.emptyHero) sw.innerHTML = j.slides.map((s) => `<img class="slide svelte-1ymazjw" src="${s}" alt="">`).join('');
  slides(doc);
  // day photo carousels: labels + alt text for the second photo of each day
  doc.querySelectorAll('li.node').forEach((node) => {
    const title = text(node.querySelector('.node__title'));
    const day = text(node.querySelector('.node__day'));
    node.querySelectorAll('.photos img').forEach((im, k) => { if (!(im.getAttribute('alt') || '').trim()) im.setAttribute('alt', `${title}, ${day.toLowerCase()}${k ? ' (photo ' + (k + 1) + ')' : ''}`); });
    const arrows = node.querySelectorAll('.photos__nav .arrow');
    if (arrows[0]) arrows[0].setAttribute('aria-label', `Previous photo, ${day}`);
    if (arrows[1]) arrows[1].setAttribute('aria-label', `Next photo, ${day}`);
    node.querySelectorAll('.photos__nav .dot').forEach((d, k) => d.setAttribute('aria-label', `Photo ${k + 1}, ${day}`));
  });
  // route map
  const canvas = doc.querySelector('.map-canvas');
  if (canvas) {
    const pts = j.points.map((n) => (COORDS[n] ? { name: n, lat: COORDS[n][0], lng: COORDS[n][1] } : null)).filter(Boolean);
    canvas.setAttribute('data-points', JSON.stringify(pts));
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Route map: ' + j.points.join(', '));
    insertAfter(doc, canvas, `<div class="map-legend svelte-13da2aa" hidden aria-hidden="true"><span class="map-legend__label svelte-13da2aa">${esc(j.title)}</span><span class="map-legend__days svelte-13da2aa">${esc(durationOf(j))}</span><span class="map-legend__summary svelte-13da2aa">${esc(j.points.join(' → '))}</span></div>`);
  }
  // moments from the journey (lightbox over the photographs already on the page)
  const itin = doc.querySelector('section.itin');
  const own = [...new Set([...j.slides, ...j.dayImgs])].map((s) => GALLERY.find((g) => g.src === s)).filter(Boolean);
  if (itin && own.length >= 6) {
    const n = own.length >= 12 ? 12 : 6;
    insertAfter(doc, itin, `<section class="section ax-journey-gallery ax-bleed" aria-labelledby="jg-h"><header class="ax-head ax-reveal"><div><span class="ax-kicker">In pictures</span><h2 id="jg-h" class="section-heading" style="margin:0">Along the way</h2></div><a class="ax-more" href="/gallery${j.region ? '?region=' + j.region : ''}">More photographs <span aria-hidden="true">→</span></a></header><div class="ax-reveal">${mosaic(own.slice(0, n), 'jg')}</div></section>`);
  }
  // related journeys from the same region
  const faq = doc.querySelector('section.faq');
  const related = Object.values(journeys).filter((o) => o.region === j.region && o.path !== j.path && o.slides.length)
    .sort((a, b) => (a.group === j.group ? -1 : 1) - (b.group === j.group ? -1 : 1)).slice(0, 3);
  if (faq && related.length) {
    insertBefore(doc, faq, `<section class="ax-related ax-bleed" aria-labelledby="rel-h"><header class="ax-head"><div><span class="ax-kicker">${esc(REGIONS[j.region].name)}</span><h2 id="rel-h" class="section-heading" style="margin:0">You may also like</h2></div><a class="ax-more" href="/destinations/${j.region}">All journeys in the region <span aria-hidden="true">→</span></a></header><ul class="ax-cards ax-cards--3">${related.map((r) => journeyCard(r)).join('')}</ul></section>`);
  }
  // copy fixes for one-day experiences (text was copied from multi-day journeys)
  if (j.group === 'One-day') {
    doc.querySelectorAll('.includes__item').forEach((li) => {
      li.childNodes.forEach((n) => {
        if (n.nodeType !== 3) return;
        n.textContent = n.textContent.replace('All meals throughout the journey', 'All meals during the day').replace('A detailed day-by-day itinerary, provided on request', 'A detailed itinerary, provided on request');
      });
    });
  }
  // FAQ answer that contradicted the published price
  if (/€/.test(j.price)) doc.querySelectorAll('.faq__answer p').forEach((pEl) => {
    if (pEl.textContent.includes('rather than published as a fixed rate')) pEl.textContent = pEl.textContent.replace('A proposal is prepared for each enquiry rather than published as a fixed rate.', 'The published price is a guide for the group size shown; a proposal is prepared for each enquiry from that starting point.');
  });
  const offerPrice = (j.price.match(/€([\d,]+)/) || [])[1];
  ld.push(crumbs([['Home', '/'], ['Destinations', '/destinations'], ...(j.region ? [[REGIONS[j.region].name, '/destinations/' + j.region]] : []), [j.title, j.path]]));
  ld.push({
    '@type': 'TouristTrip', name: j.title, description: j.lede.slice(0, 300), url: ORIGIN + j.path,
    image: j.slides.slice(0, 3).map((s) => ORIGIN + s), provider: { '@id': ORIGIN + '/#agency' },
    itinerary: { '@type': 'ItemList', itemListElement: j.points.map((n, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Place', name: n } })) },
    ...(offerPrice ? { offers: { '@type': 'Offer', price: offerPrice.replace(/,/g, ''), priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: ORIGIN + j.path } } : {}),
  });
}

function upgradeOneDay(doc) {
  const article = doc.querySelector('main article.prose');
  if (article) article.classList.add('ax-oneday');
  doc.querySelectorAll('main section.group').forEach((g) => {
    const ul = g.querySelector('ul.list');
    const list = [...ul.querySelectorAll('a.journey')].map((a) => journeys[a.getAttribute('href')]).filter(Boolean);
    ul.outerHTML = `<ul class="ax-cards ax-cards--3 ax-reveal">${list.map((j) => journeyCard(j)).join('')}</ul>`;
  });
}

function upgradeFleet(doc) {
  const items = doc.querySelectorAll('.ls-item');
  const pics = [['u:1552160757-52790c6f4faf', 'A private speedboat crossing'], ['/img/places/hvar-2.webp', 'Hvar harbour'], ['/img/fleet/v-class-square-transfer.webp', 'A Mercedes V-Class at the waterfront']];
  items.forEach((it, i) => { if (pics[i]) it.insertBefore(frag(doc, `<span class="ax-media ax-lsmedia">${img(pics[i][0], { alt: pics[i][1], sizes: '(max-width: 760px) 100vw, 33vw' })}</span>`), it.firstChild); });
  const close = doc.querySelector('.landsea__close');
  if (close) close.insertAdjacentHTML('beforeend', ' <a href="/transfers">How our transfers work →</a>');
}

function upgradeTransfers(doc) {
  const header = doc.querySelector('main .page-header');
  const art = doc.querySelector('main article.prose');
  if (art) art.insertBefore(frag(doc, figure('/img/fleet/v-class-square-transfer.webp', 'A Mercedes V-Class transfer in the old town', { wide: true })), art.firstChild);
  const h2s = [...doc.querySelectorAll('main article.prose > h2')];
  split(doc, h2s.find((h) => /vehicles/i.test(text(h))), '/img/fleet/e-class-dusk-lake.webp', 'The Mercedes E-Class at dusk', false);
  split(doc, h2s.find((h) => /drivers/i.test(text(h))), '/img/fleet/e-class-cabin-detail.webp', 'Inside the E-Class', true);
  split(doc, h2s.find((h) => /logistics/i.test(text(h))), 'u:1552160757-52790c6f4faf', 'A sea transfer between islands', false);
}

function upgradeCharter(doc) {
  const art = doc.querySelector('main article.prose');
  const lede2 = art && art.querySelector('p.charter-lede + p');
  if (lede2) insertAfter(doc, lede2, figure('/img/moments/yacht-2.webp', 'A private yacht in a quiet Dalmatian bay', { wide: true }));
  const ways = doc.querySelectorAll('.way');
  const wp = [['u:1598841019800-aaa24dba28be', 'A sailing yacht under way'], ['/img/moments/yacht-5.webp', 'Life aboard on a multi-day journey']];
  ways.forEach((w, i) => w.insertBefore(frag(doc, `<span class="ax-media ax-waymedia">${img(wp[i][0], { alt: wp[i][1], sizes: '(max-width: 760px) 100vw, 380px' })}</span>`), w.firstChild));
  const searchH = [...doc.querySelectorAll('main article.prose > h2')].find((h) => /search/i.test(text(h)));
  const water = galleryFor({ theme: 'water', n: 6, prefer: ['/img/moments/yacht-4.webp', 'u:1711435340560-93c55e756a4d', '/img/moments/swim-3.webp', 'u:1603377817563-5ccd33e57d05', '/img/moments/yacht-6.webp', 'u:1454452176678-c0437432bba6'] });
  if (searchH) insertBefore(doc, searchH, `<div class="ax-bleed ax-reveal" style="margin:clamp(40px,6vw,72px) auto">${mosaic(water, 'charter')}</div>`);
  const form = doc.querySelector('form.search');
  if (form) { form.setAttribute('data-bm', '8264'); form.setAttribute('aria-label', 'Search charter availability'); }
}

function upgradeStays(doc) {
  const h2s = [...doc.querySelectorAll('main article.prose > h2')];
  const find = (re) => h2s.find((h) => re.test(text(h)));
  split(doc, find(/selection/i), '/img/moments/stay-3.webp', 'A curated stay', false);
  const two = find(/two-base/i);
  if (two && two.nextElementSibling) insertAfter(doc, two.nextElementSibling, `<figure class="ax-duo ax-reveal"><span class="ax-media">${img('/img/places/lokvarsko-2.webp', { alt: 'Lokvarsko Lake in Gorski Kotar', sizes: '380px' })}</span><span class="ax-media">${img('/img/places/hvar-2.webp', { alt: 'Hvar harbour at dusk', sizes: '380px' })}</span><figcaption>One base inland, one on the coast.</figcaption></figure>`);
  split(doc, find(/named-tier/i), 'u:1776763018821-8feeaeeee0a5', 'A boutique hotel room', true);
  split(doc, find(/villas/i), 'u:1543489822-c49534f3271f', 'An infinity pool above the Adriatic', false);
  const searchH = find(/search/i);
  const stays = galleryFor({ theme: 'stays', n: 6, prefer: ['/img/moments/stay.webp', 'u:1416331108676-a22ccb276e35', '/img/moments/stay-4.webp', 'u:1629199159634-28a88785cee5', '/img/moments/stay-5.webp', 'u:1662385930165-49ebaa03b152'] });
  if (searchH) insertBefore(doc, searchH, `<div class="ax-bleed ax-reveal" style="margin:clamp(40px,6vw,72px) auto">${mosaic(stays, 'stays')}</div>`);
  const form = doc.querySelector('form.search');
  if (form) { form.setAttribute('data-handoff', 'stays-search'); form.setAttribute('aria-label', 'Search available stays'); }
  const results = doc.querySelector('.ac .results');
  if (results) results.remove();
}

function upgradeAbout(doc) {
  const art = doc.querySelector('main article.prose');
  if (art) art.insertBefore(frag(doc, figure('/img/regions/srednja-dalmacija/biokovo-over-makarska.webp', 'Mount Biokovo above the Makarska Riviera', { wide: true })), art.firstChild);
  const h2s = [...doc.querySelectorAll('main article.prose > h2')];
  split(doc, h2s.find((h) => /what we do/i.test(text(h))), '/img/moments/dining-6.webp', 'A long table by candlelight', true);
  split(doc, h2s.find((h) => /the name/i.test(text(h))), '/img/places/biokovo-2.webp', 'The Biokovo road above the sea', false);
  split(doc, h2s.find((h) => /where it began/i.test(text(h))), '/img/journeys/cetina/cetina-raft-open-river.webp', 'Rafting the Cetina', true);
}

const ARTICLE = {
  '/journal/when-to-visit-croatia': { cover: '/img/places/hvar-3.webp', alt: 'The Pakleni Islands off Hvar', related: ['/destinations/northern-central-dalmatia-grand-tour', '/destinations/istria-kvarner-grand-tour', '/destinations/adrion-signature-winter-croatia'] },
  '/journal/private-cetina-canyon-guide': { cover: '/img/journeys/cetina/cetina-raft-open-river.webp', alt: 'Rafting on the open Cetina', related: ['/destinations/spirit-of-cetina-experience', '/destinations/omis-poljica-cetina-experience', '/destinations/adventure-dalmatia-journey-5'] },
  '/journal/biokovo-by-ebike': { cover: '/img/places/biokovo-2.webp', alt: 'The Biokovo road above the sea', related: ['/destinations/central-dalmatia-signature-land-and-sea', '/destinations/adventure-dalmatia-journey-5', '/destinations/adventure-dalmatia-journey-3'] },
  '/journal/slavonia-wine-country': { cover: '/img/places/baranja-wine.webp', alt: 'Baranja wine country', related: ['/destinations/slavonia-baranja-wine-culture', '/destinations/royal-slavonia-baranja-tour', '/destinations/slavonia-extended-weekend'] },
};
function upgradeJournal(doc) {
  const list = doc.querySelector('ol.article-list');
  if (list) list.classList.add('ax-grid');
  doc.querySelectorAll('a.article-link').forEach((a) => {
    const c = ARTICLE[a.getAttribute('href')];
    if (c) a.insertBefore(frag(doc, `<span class="ax-media ax-cover">${img(c.cover, { alt: '', sizes: '(max-width: 720px) 100vw, 50vw' })}</span>`), a.firstChild);
  });
}
function upgradeArticle(doc, p, ld) {
  const c = ARTICLE[p];
  const art = doc.querySelector('main article.prose');
  if (c && art) art.insertBefore(frag(doc, figure(c.cover, c.alt, { wide: true })), art.firstChild);
  // duplicate heading ("Frequently asked" + "Questions") -> keep one
  doc.querySelectorAll('.faq-section .faq__heading').forEach((h) => h.remove());
  const rel = c ? c.related.map((r) => journeys[r]).filter(Boolean) : [];
  if (art && rel.length) art.insertAdjacentHTML('beforeend', `<section class="ax-related ax-bleed" aria-labelledby="rel-h"><header class="ax-head"><div><span class="ax-kicker">Travel it with Adrion</span><h2 id="rel-h" style="margin:0">Journeys that go there</h2></div></header><ul class="ax-cards ax-cards--3">${rel.map((r) => journeyCard(r)).join('')}</ul></section>`);
  const h1 = text(doc.querySelector('h1'));
  ld.push(crumbs([['Home', '/'], ['Journal', '/journal'], [h1, p]]));
  ld.push({ '@type': 'Article', headline: h1, image: c ? [ORIGIN + c.cover] : undefined, author: { '@id': ORIGIN + '/#agency' }, publisher: { '@id': ORIGIN + '/#agency' }, datePublished: '2026-06-26', mainEntityOfPage: ORIGIN + p });
}
function upgradeInquire(doc) {
  const form = doc.querySelector('form.enquiry-form');
  if (!form) return;
  form.removeAttribute('method');
  form.setAttribute('aria-describedby', 'ef-status');
  const foot = form.querySelector('.form-footer');
  (foot || form).insertAdjacentHTML('afterend', '<p class="ax-form-status" id="ef-status" role="status" aria-live="polite"></p>');
  const email = form.querySelector('input[type="email"]');
  if (email) email.setAttribute('autocomplete', 'email');
}

/* ------------------------------------------------------------------ head */
const OG_IMG = {}; // page -> image path
function ogFor(p) {
  if (journeys[p]) return journeys[p].slides[0];
  const m = p.match(/^\/destinations\/([a-z-]+)$/);
  if (m && REGION_IMG[m[1]]) return REGION_IMG[m[1]];
  if (ARTICLE[p]) return ARTICLE[p].cover;
  return OG_IMG[p] || {
    '/': '/hero/poster.webp', '/destinations': '/img/regions/srednja-dalmacija/biokovo-over-makarska.webp', '/fleet': '/img/fleet/v-class-square-transfer.webp',
    '/transfers': '/img/fleet/v-class-square-transfer.webp', '/charter': '/img/moments/yacht-2.webp', '/luxury-accommodation': '/img/moments/stay-3.webp',
    '/about': '/img/regions/srednja-dalmacija/biokovo-over-makarska.webp', '/journal': '/img/canyoning/canyon-pool.webp', '/one-day-journeys': '/img/journeys/cetina/cetina-raft-open-river.webp',
    '/inquire': '/img/split.webp', '/gallery': '/img/places/hvar-3.webp',
  }[p] || '/hero/poster.webp';
}
function head(p, title, metas, links, cssList, ld, extraHead = '') {
  const og = ORIGIN + fixPath(ogFor(p));
  let desc = '';
  const out = [];
  metas.forEach((m) => {
    if (/charset|viewport/.test(m)) return;
    if (/property="og:image"/.test(m)) return;
    if (/name="description"/.test(m)) {
      desc = (m.match(/content="([^"]*)"/) || [])[1] || '';
      const j = journeys[p];
      if (j && /Price on request/i.test(desc) && /€/.test(j.price)) { desc = desc.replace(/Price on request\.?/i, j.price + '.'); m = `<meta name="description" content="${desc}">`; }
    }
    if (/property="og:description"/.test(m) && journeys[p] && /€/.test(journeys[p].price)) m = m.replace(/Price on request\.?/i, journeys[p].price + '.');
    out.push(m);
  });
  out.push(`<meta property="og:image" content="${og}">`, `<meta property="og:image:alt" content="${esc(title)}">`, `<meta name="twitter:image" content="${og}">`, `<meta property="og:site_name" content="Adrion">`);
  const linkTags = links.map((l) => l.replace(/href="(\/[^"]+)"/, (m0, u) => `href="${/^\/(apple-touch-icon|icons|site\.webmanifest)/.test(u) ? IMG_BASE + u : u}"`));
  const ldJson = ld.length ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': ld.some((x) => x['@type'] === 'TravelAgency') ? ld : [ORG, ...ld] }).replace(/</g, '\\u003c')}</script>` : '';
  const preImg = IMG_BASE.startsWith('http') ? `<link rel="preconnect" href="${IMG_BASE}">` : '';
  return `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
${out.join('\n')}
${linkTags.join('\n')}
${preImg}<link rel="preconnect" href="https://images.unsplash.com">
<link rel="stylesheet" href="${esc(FONT_CSS)}">
${cssList.map((u) => `<link rel="stylesheet" href="${u}">`).join('\n')}
<link rel="stylesheet" href="/assets/enhance.css?v=${VERSION}">
<script>document.documentElement.classList.add('js')</script>
<script defer src="/assets/site.js?v=${VERSION}"></script>
${extraHead}${ldJson}
</head>`;
}

/* ------------------------------------------------------------------ gallery page */
/* reel order: open with the strongest frames, then the interleaved set */
const REEL_LEAD = ['/img/places/hvar-3.webp', '/img/journeys/cetina/cetina-rapids-crew.webp', '/img/places/dubrovnik-above-2.webp', '/img/places/plitvice-falls.webp', '/img/regions/istra-kvarner/rovinj-dawn-aerial.webp', '/img/moments/yacht-4.webp', '/img/regions/srednja-dalmacija/biokovo-over-makarska.webp', '/img/moments/dining-6.webp', '/img/places/kornati-2.webp', '/img/regions/zagreb-zagorje/sljeme-summit-ridges.webp', '/img/places/ilok.webp', '/img/places/vis.webp'];
const THEME_NOTE = {
  water: ['Charter the Adriatic', 'Yachts, catamarans and private speedboats', '/charter'],
  stays: ['Where you will stay', 'Villas and hotels we have seen ourselves', '/luxury-accommodation'],
  table: ['At the table', 'Wine, truffles and long regional lunches', '/destinations'],
  active: ['Active days', 'Rafting, canyoning and e-MTB with private guides', '/one-day-journeys'],
  towns: ['Towns & heritage', 'Roman stone and Venetian squares', '/destinations'],
  islands: ['The islands', 'Hvar, Vis, Korčula and the quiet ones', '/destinations'],
  nature: ['Nature & parks', 'Lakes, canyons and mountain balconies', '/destinations'],
};
function regionFacts(slug) {
  const items = region[slug].groups.flatMap((g) => g.items.filter((i) => !i.soon));
  const prices = items.map((i) => +((i.price.match(/€([\d,]+)/) || [])[1] || '0').replace(/,/g, '')).filter(Boolean);
  const from = prices.length ? '€' + Math.min(...prices).toLocaleString('en-US') : '';
  return { count: items.length, from };
}
function galleryMain() {
  const chips = (key, entries) => [['all', 'All'], ...entries].map(([v, l]) => `<button type="button" class="ax-chip" data-filter="${key}" data-value="${v}" aria-pressed="${v === 'all'}">${esc(l)}</button>`).join('');
  const items = GALLERY.map((g) => `<figure class="ax-g-item" data-region="${g.region || 'none'}" data-theme="${g.theme}" style="--ar:${g.w}/${g.h}">${tile(g, { sizes: '(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 33vw' })}</figure>`).join('');
  const photographers = [...new Map(UNSPLASH.map((u) => [u.user, u])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const lead = REEL_LEAD.map((s) => GALLERY.find((g) => g.src === s)).filter(Boolean);
  const reel = [...lead, ...GALLERY.filter((g) => !lead.includes(g))].map((g) => ({
    s: g.src.startsWith('u:') ? uUrl(g.src.slice(2), 1000) : imgUrl(g.src), f: fullUrl(g.src), c: g.caption, r: g.region || '', t: g.theme, cr: g.credit, p: g.h > g.w ? 1 : 0,
  }));
  const regs = Object.fromEntries(REGION_SLUGS.map((s) => { const f = regionFacts(s); return [s, { n: REGIONS[s].name, k: region[s].kicker, c: f.count, from: f.from, h: '/destinations/' + s }]; }));
  const data = JSON.stringify({ items: reel, regions: regs, themes: THEMES, notes: THEME_NOTE }).replace(/</g, '\\u003c');
  const filters = `<div class="ax-filter-row"><span>Region</span>${chips('region', REGION_SLUGS.map((s) => [s, REGIONS[s].short]))}</div><div class="ax-filter-row"><span>Theme</span>${chips('theme', Object.entries(THEMES))}</div>`;
  return `<main class="ax-gallery-page ax-reel-page" data-view="reel"><h1 class="ax-sr">Gallery: Croatia, frame by frame</h1>
<section class="ax-reel" aria-label="Photograph reel">
 <div class="ax-reel__stage">
  <div class="ax-reel__loader" aria-hidden="true"><span class="ax-reel__count">0</span></div>
  <aside class="ax-reel__info" aria-live="polite">
   <p class="ax-reel__title"><span class="ax-roll" data-k="title">Croatia, frame by frame</span></p>
   <dl class="ax-reel__table">
    <div><dt>Region</dt><dd><span class="ax-roll" data-k="region"></span></dd></div>
    <div><dt>Theme</dt><dd><span class="ax-roll" data-k="theme"></span></dd></div>
    <div><dt>Photograph</dt><dd><span class="ax-roll" data-k="credit"></span></dd></div>
   </dl>
  </aside>
  <div class="ax-reel__track" data-lb-group="reel"></div>
  <div class="ax-reel__notes">
   <a class="ax-reel__note" data-k="note1" href="/destinations"><small class="ax-roll" data-k="n1k"></small><span class="ax-roll" data-k="n1"></span></a>
   <a class="ax-reel__note" data-k="note2" href="/inquire"><small class="ax-roll" data-k="n2k"></small><span class="ax-roll" data-k="n2"></span></a>
  </div>
  <div class="ax-reel__bar">
   <div class="ax-reel__index"><button type="button" class="ax-reel__indexbtn" aria-expanded="false" aria-controls="ax-index">Index <span aria-hidden="true">⌄</span></button>
    <div class="ax-reel__panel" id="ax-index" hidden role="group" aria-label="Filter photographs">${filters}</div></div>
   <span class="ax-reel__frame" aria-hidden="true"><span class="ax-reel__n">001</span> / <span class="ax-reel__total">${String(reel.length).padStart(3, '0')}</span></span>
   <span class="ax-reel__hint" aria-hidden="true">Scroll or use ← →</span>
   <button type="button" class="ax-reel__viewbtn" data-view-to="grid">Grid view</button>
  </div>
 </div>
 <div class="ax-reel__spacer"></div>
 <script type="application/json" id="ax-reel-data">${data}</script>
</section>
<section class="ax-grid-view" aria-label="All photographs as a grid">
<header class="ax-gallery-hero"><span class="ax-kicker">The Gallery</span><h2 class="ax-grid-title">Croatia, frame by frame</h2><p class="ax-lede">The coast at first light, the canyon from the raft, island harbours and long inland tables. Browse by region or by the kind of day you are dreaming of; every photograph leads somewhere we travel.</p><p style="margin-top:24px"><button type="button" class="ax-btn" data-view-to="reel">Back to the reel</button></p></header>
<div class="ax-filters" role="group" aria-label="Filter photographs">${filters}</div>
<div class="ax-g-meta"><span class="ax-g-count" aria-live="polite">${GALLERY.length} photographs</span><span>Select a photograph to view it full screen</span></div>
<div class="ax-gallery" data-lb-group="gallery">${items}</div>
<p class="ax-g-empty" hidden>No photographs match this combination yet. Try another region or theme.</p>
<div class="ax-g-actions"><button type="button" class="ax-btn ax-g-more">Show more photographs</button></div>
<div class="ax-g-actions"><a class="ax-btn" href="/inquire">Plan a journey</a></div>
<p class="ax-credits">Photographs by Adrion, with additional images from <a href="https://unsplash.com/?${utm}" target="_blank" rel="noopener">Unsplash</a> used under the Unsplash License. With thanks to ${photographers.map((u) => `<a href="https://unsplash.com/@${esc(u.user)}?${utm}" target="_blank" rel="noopener">${esc(u.name)}</a>`).join(', ')}.</p>
</section></main>`;
}

/* ------------------------------------------------------------------ assemble */
function render(p, doc, opts = {}) {
  const ld = [];
  const v = CAP.pages[p] || CAP.pages['/fleet'];
  if (opts.main) {
    const mc = doc.querySelector('#main-content');
    mc.innerHTML = opts.main;
  }
  common(doc, opts.as || p);
  if (!opts.main) {
    if (p === '/') upgradeHome(doc, ld);
    else if (p === '/destinations') upgradeDestinations(doc, ld);
    else if (/^\/destinations\/[a-z-]+$/.test(p) && REGIONS[p.split('/').pop()]) upgradeRegion(doc, p.split('/').pop(), ld);
    else if (journeys[p]) upgradeJourney(doc, journeys[p], ld);
    else if (p === '/one-day-journeys') upgradeOneDay(doc);
    else if (p === '/fleet') upgradeFleet(doc);
    else if (p === '/transfers') upgradeTransfers(doc);
    else if (p === '/charter') upgradeCharter(doc);
    else if (p === '/luxury-accommodation') upgradeStays(doc);
    else if (p === '/about') upgradeAbout(doc);
    else if (p === '/journal') upgradeJournal(doc);
    else if (p.startsWith('/journal/')) upgradeArticle(doc, p, ld);
    else if (p === '/inquire') upgradeInquire(doc);
  }
  images(doc);
  if (opts.ld) ld.push(...opts.ld);
  const bodyHtml = doc.body.innerHTML;
  const title = opts.title || v.head.title;
  let metas = v.head.metas;
  let links = v.head.links;
  if (opts.metas) { metas = opts.metas; links = opts.links; }
  const h = head(opts.as || p, title, metas, links, cssFor(bodyHtml), ld, opts.extraHead || '');
  const attrs = (v.htmlAttrs || []).filter(([k]) => k !== 'lang').map(([k, val]) => ` ${k}="${esc(val)}"`).join('');
  return `<!doctype html>\n<html lang="en"${attrs}>${h}<body>${bodyHtml}</body></html>`;
}

fs.rmSync(OUT, { recursive: true, force: true });
const written = [];
for (const p of Object.keys(PAGES)) {
  const html = render(p, D(p));
  const file = p === '/' ? 'index.html' : p.slice(1) + '/index.html';
  write(path.join(OUT, file), html);
  written.push(p);
}
/* gallery page: reuse the site shell from a content page */
{
  const shell = parseHTML('<!doctype html><html><head></head><body>' + CAP.pages['/fleet'].body.replace(/<!--[\s\S]*?-->/g, '') + '</body></html>').document;
  const title = 'Gallery — Croatia in Photographs — Adrion Custom Travel Agency';
  const desc = 'A photographic journey through Croatia with Adrion: Istria, the Kvarner islands, Plitvice and Velebit, Split, Hvar and Dubrovnik, Zagreb and Slavonia. Filter by region or theme.';
  const metas = [`<meta name="description" content="${esc(desc)}">`, `<meta property="og:title" content="${esc(title)}">`, `<meta property="og:description" content="${esc(desc)}">`, `<meta property="og:url" content="${ORIGIN}/gallery">`, '<meta property="og:type" content="website">', '<meta property="og:locale" content="en_US">', '<meta name="twitter:card" content="summary_large_image">', '<meta name="theme-color" content="#0a0a0a">'];
  const links = CAP.pages['/fleet'].head.links.filter((l) => !/alternate|canonical/.test(l)).concat([`<link rel="canonical" href="${ORIGIN}/gallery">`]);
  const ld = [crumbs([['Home', '/'], ['Gallery', '/gallery']]), { '@type': 'ImageGallery', name: 'Adrion Gallery', url: ORIGIN + '/gallery', about: 'Croatia', image: GALLERY.slice(0, 40).map((g) => ({ '@type': 'ImageObject', contentUrl: fullUrl(g.src), caption: g.caption })) }];
  write(path.join(OUT, 'gallery/index.html'), render('/gallery', shell, { main: galleryMain(), title, metas, links, ld, as: '/gallery' }));
  written.push('/gallery');
}
/* 404 */
{
  const shell = parseHTML('<!doctype html><html><head></head><body>' + CAP.pages['/fleet'].body.replace(/<!--[\s\S]*?-->/g, '') + '</body></html>').document;
  const main = `<main class="ax-gallery-page"><header class="ax-gallery-hero"><span class="ax-kicker">Page not found</span><h1>This path does not lead anywhere</h1><p class="ax-lede">The page may have moved. Start again from the regions, or tell us where you would like to go.</p><p style="margin-top:32px;display:flex;gap:14px;flex-wrap:wrap"><a class="ax-btn" href="/destinations">Destinations</a><a class="ax-btn" href="/inquire">Inquire</a></p></header></main>`;
  write(path.join(OUT, '404.html'), render('/404', shell, { main, title: 'Page not found — Adrion', metas: ['<meta name="robots" content="noindex">'], links: [], as: '/404' }));
}
/* CSS + JS assets (original stylesheets kept at their original paths) */
for (const f of CSS_FILES) write(path.join(OUT, f.url), f.css);
for (const f of ['enhance.css', 'site.js']) fs.copyFileSync(path.join(ROOT, 'assets', f), (fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true }), path.join(OUT, 'assets', f)));
/* sitemap + robots */
write(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${written.map((p) => `<url><loc>${ORIGIN}${p === '/' ? '/' : p}</loc><lastmod>${VERSION}</lastmod>${p === '/gallery' ? GALLERY.slice(0, 200).map((g) => `<image:image><image:loc>${esc(fullUrl(g.src))}</image:loc></image:image>`).join('') : ''}</url>`).join('\n')}\n</urlset>\n`);
write(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
/* image manifest (for self-hosting the photographs) */
write(path.join(OUT, 'image-manifest.txt'), Object.keys(DIMS).concat(['/apple-touch-icon.png', '/icons/favicon-32.png', '/site.webmanifest', '/og/default.jpg']).join('\n') + '\n');

console.log(`Built ${written.length} pages + 404 into ${path.relative(process.cwd(), OUT)}/ · gallery: ${GALLERY.length} photographs (${UNSPLASH.length} from Unsplash) · images from ${IMG_BASE || 'local'}`);
