// Fact-check: every datum the build copies from one page onto another is compared with its source page.
// Source of truth = the captured live site (source/adrion-capture.json). Output = dist/.
const fs = require('fs'); const path = require('path');
const { parseHTML } = require('linkedom');
const ROOT = path.join(__dirname, '..');
const CAP = require(path.join(ROOT, 'source/adrion-capture.json'));
const DIST = path.join(ROOT, 'dist');
const T = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const src = (p) => parseHTML('<html><body>' + CAP.pages[p].body + '</body></html>').document;
const out = (p) => parseHTML(fs.readFileSync(path.join(DIST, p === '/' ? 'index.html' : p.slice(1) + '/index.html'), 'utf8')).document;
const R = { checks: 0, fails: [], notes: [] };
const check = (ok, msg) => { R.checks++; if (!ok) R.fails.push(msg); };

/* ---------- 1. source facts per journey (from the journey page itself) ---------- */
const J = {};
for (const p of Object.keys(CAP.pages)) {
  const d = src(p);
  const h1 = d.querySelector('.hero__title') || d.querySelector('.stage .content h1.title');
  if (!h1) continue;
  J[p] = {
    title: T(h1),
    price: T(d.querySelector('.hero__price') || d.querySelector('.stage .content .price')),
    kicker: T(d.querySelector('.hero__kicker') || d.querySelector('.stage .content .kicker')),
    days: d.querySelectorAll('.node__day').length,
    dayLabels: [...d.querySelectorAll('.node__day')].map(T),
    points: [...d.querySelectorAll('.map-points li')].map(T),
    imgs: new Set([...d.querySelectorAll('img')].map((i) => i.getAttribute('src'))),
    pricing: [...d.querySelectorAll('.pricing .row:not(.head)')].map((r) => [...r.querySelectorAll('.cell')].map(T)),
    desc: (CAP.pages[p].head.metas.find((m) => /name="description"/.test(m)) || '').match(/content="([^"]*)"/)?.[1] || '',
  };
}
/* region pages: what they list */
const REG = {};
for (const slug of ['istra-kvarner', 'gorski-kotar-lika', 'srednja-dalmacija', 'juzna-dalmacija', 'zagreb-zagorje', 'slavonija-baranja']) {
  const d = src('/destinations/' + slug);
  REG[slug] = {
    name: T(d.querySelector('h1')), kicker: T(d.querySelector('.kicker')),
    items: [...d.querySelectorAll('section.group')].flatMap((g) => [...g.querySelectorAll('.journey')].map((a) => ({
      group: T(g.querySelector('.group-title')), href: a.getAttribute('href'), name: T(a.querySelector('.j-name')), price: T(a.querySelector('.j-price')), soon: a.classList.contains('soon'),
    }))),
  };
}
const regionOf = {}; for (const [s, r] of Object.entries(REG)) r.items.forEach((i) => { if (i.href) regionOf[i.href] = s; });
/* home + destinations-map region facts */
const homeSrc = src('/');
const HOME_REG = Object.fromEntries([...homeSrc.querySelectorAll('.regions .region a')].map((a) => [a.getAttribute('href').split('/').pop(), { name: T(a.querySelector('.region__name')), kicker: T(a.querySelector('.region__kicker')) }]));
const MAP_COUNTS = { 'istra-kvarner': 5, 'gorski-kotar-lika': 7, 'srednja-dalmacija': 13, 'juzna-dalmacija': 3, 'zagreb-zagorje': 8, 'slavonija-baranja': 5 }; // read off the live destinations map hover ("N READY")

const euro = (s) => { const m = (s || '').match(/€\s?([\d,]+)/); return m ? +m[1].replace(/,/g, '') : null; };

/* ---------- 2. source-level consistency (live site vs itself) ---------- */
for (const [slug, r] of Object.entries(REG)) {
  for (const it of r.items) {
    if (it.soon || !J[it.href]) { if (!it.soon) R.notes.push(`Region ${slug} lists ${it.href} but no journey page captured`); continue; }
    const j = J[it.href];
    if (it.name !== j.title) R.notes.push(`LIVE SITE: region list says "${it.name}" but the page title is "${j.title}" (${it.href})`);
    const lp = euro(it.price), hp = euro(j.price);
    if (lp !== hp) R.notes.push(`LIVE SITE: ${j.title}: region list price ${it.price || '(none)'} vs page price "${j.price}"`);
    // pricing table low point vs hero
    const tablePrices = j.pricing.map((row) => euro(row[1])).filter(Boolean);
    if (tablePrices.length && hp && Math.min(...tablePrices) !== hp) R.notes.push(`LIVE SITE: ${j.title}: hero "${j.price}" but lowest price in its pricing table is €${Math.min(...tablePrices).toLocaleString('en-US')}`);
    if (/price on request/i.test(j.desc) && hp) R.notes.push(`LIVE SITE: ${j.title}: meta description says "Price on request" while page shows ${j.price}`);
  }
  const live = r.items.filter((i) => !i.soon).length;
  if (live !== MAP_COUNTS[slug]) R.notes.push(`LIVE SITE: destinations map says ${MAP_COUNTS[slug]} ready for ${slug}, region page lists ${live}`);
  if (HOME_REG[slug] && HOME_REG[slug].kicker !== r.kicker) R.notes.push(`LIVE SITE: home tagline for ${slug} "${HOME_REG[slug].kicker}" vs region page "${r.kicker}"`);
}
/* durations: kicker vs number of days in itinerary */
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14 };
const statedDays = (j) => { const k = (j.kicker + ' ' + j.title).toLowerCase(); let m = k.match(/(\d+)\s*-?\s*days?/) || k.match(/(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)\s+days?/); return m ? (NUM[m[1]] || +m[1]) : null; };

/* ---------- 3. every journey card in dist vs its journey page ---------- */
const cardPages = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name === 'index.html') cardPages.push('/' + path.relative(DIST, path.dirname(p))); } })(DIST);
let cards = 0;
for (const pg of cardPages) {
  const p = pg === '/' ? '/' : pg.replace(/\/$/, '');
  const d = out(p);
  for (const a of d.querySelectorAll('a.ax-card[href^="/destinations/"]')) {
    const href = a.getAttribute('href'); const j = J[href];
    if (!j) continue; // region cards checked below
    cards++;
    const title = T(a.querySelector('.ax-card__title')); const kick = T(a.querySelector('.ax-card__kicker')); const meta = T(a.querySelector('.ax-card__meta'));
    const listName = (Object.values(REG).flatMap((r) => r.items).find((i) => i.href === href) || {}).name;
    check(title === (listName || j.title), `${p}: card title "${title}" ≠ the name the region list uses "${listName || j.title}" (${href})`);
    const cp = euro(meta), hp = euro(j.price);
    check(cp === hp || (!hp && /on request/i.test(meta)), `${p}: card price "${meta}" ≠ page price "${j.price}" (${href})`);
    const regName = { 'istra-kvarner': 'Istria & Kvarner', 'gorski-kotar-lika': 'Gorski Kotar & Lika', 'srednja-dalmacija': 'Northern & Central Dalmatia', 'juzna-dalmacija': 'Southern Dalmatia', 'zagreb-zagorje': 'Zagreb & Northern Croatia', 'slavonija-baranja': 'Slavonia & Baranja' }[regionOf[href]];
    if (regName) check(kick.startsWith(regName), `${p}: card says region "${kick}" but ${href} is listed under ${regionOf[href]}`);
    const dm = kick.match(/(\d+) days/);
    if (dm) {
      const sd = statedDays(j);
      check(+dm[1] === (sd || j.days), `${p}: card says ${dm[1]} days, page states ${sd || '-'} days and has ${j.days} day entries (${href})`);
      if (sd && j.days && sd !== j.days && !/day 1/i.test(j.dayLabels.join(' ')) === false) R.notes.push(`LIVE SITE: ${j.title}: says ${sd} days, itinerary has ${j.days} day entries`);
    }
    if (/One day/.test(kick)) check(REG[regionOf[href]]?.items.find((i) => i.href === href)?.group === 'One-day', `${p}: card says One day but ${href} is not in a One-day group`);
    const im = a.querySelector('img'); const s = im && im.getAttribute('src').replace('https://www.adriondmc.com', '');
    check(!s || j.imgs.has(s) || /^\/img\/(places|moments)/.test(s), `${p}: card photo ${s} is not from ${href}`);
    if (s && !j.imgs.has(s)) R.notes.push(`${p}: card photo for ${href} (${s}) is the page's own hero only if empty-hero fix; check`);
  }
}
R.notes.push(`journey cards checked: ${cards}`);

/* ---------- 4. region rows (thumbnails + durations) on region pages ---------- */
for (const slug of Object.keys(REG)) {
  const d = out('/destinations/' + slug);
  for (const a of d.querySelectorAll('a.journey')) {
    const href = a.getAttribute('href'); const j = J[href]; if (!j) continue;
    const kk = T(a.querySelector('.ax-jkick'));
    const sd = statedDays(j); const g = REG[slug].items.find((i) => i.href === href).group;
    if (g === 'One-day') check(kk === 'One day', `${slug}: row ${j.title} labelled "${kk}" but is One-day`);
    else check(kk === (sd || j.days) + ' days', `${slug}: row ${j.title} labelled "${kk}", page states ${sd} / has ${j.days} day entries`);
    const im = a.querySelector('.ax-jthumb img').getAttribute('src').replace('https://www.adriondmc.com', '');
    check(j.imgs.has(im), `${slug}: row ${j.title} thumbnail ${im} not on its page`);
    check(T(a.querySelector('.j-name')) === REG[slug].items.find((i) => i.href === href).name, `${slug}: row name changed`);
    check(T(a.querySelector('.j-price')) === REG[slug].items.find((i) => i.href === href).price, `${slug}: row price changed`);
  }
}

/* ---------- 5. region counts, names, taglines and "from" prices wherever shown ---------- */
const liveCount = (s) => REG[s].items.filter((i) => !i.soon).length;
const minPrice = (s) => Math.min(...REG[s].items.filter((i) => !i.soon).map((i) => euro(i.price)).filter(Boolean));
const home = out('/');
for (const a of home.querySelectorAll('.regions .region a')) {
  const s = a.getAttribute('href').split('/').pop();
  check(T(a.querySelector('.region__name')) === HOME_REG[s].name, `home: region name changed for ${s}`);
  check(T(a.querySelector('.region__kicker')) === HOME_REG[s].kicker, `home: region tagline changed for ${s}`);
  check(T(a.querySelector('.region__soon')) === liveCount(s) + ' journeys', `home: ${s} shows "${T(a.querySelector('.region__soon'))}", region page lists ${liveCount(s)}`);
}
const dst = out('/destinations');
for (const a of dst.querySelectorAll('.ax-region-card')) {
  const s = a.getAttribute('href').split('/').pop();
  check(T(a.querySelector('.ax-card__title')) === REG[s].name, `destinations: card name "${T(a.querySelector('.ax-card__title'))}" vs region page h1 "${REG[s].name}"`);
  check(T(a.querySelector('.ax-card__meta span')) === REG[s].kicker, `destinations: card tagline for ${s}`);
  check(T(a.querySelector('.ax-card__kicker')) === liveCount(s) + ' journeys', `destinations: count for ${s}`);
}
const stage = JSON.parse(dst.querySelector('.stage').getAttribute('data-regions'));
for (const [h, v] of Object.entries(stage)) { const s = h.split('/').pop(); check(v.count === liveCount(s) + ' journeys' && v.name === REG[s].name && v.kicker === REG[s].kicker, `destinations map hover data for ${s}: ${JSON.stringify(v)}`); }
const gal = JSON.parse(out('/gallery').querySelector('#ax-reel-data').textContent);
for (const [s, v] of Object.entries(gal.regions)) {
  check(v.c === liveCount(s), `gallery note: ${s} count ${v.c} vs ${liveCount(s)}`);
  check(v.from === '€' + minPrice(s).toLocaleString('en-US'), `gallery note: ${s} "from ${v.from}" vs lowest listed price €${minPrice(s).toLocaleString('en-US')}`);
  check(v.k === REG[s].kicker && v.n === REG[s].name, `gallery note: ${s} name/tagline`);
  const priced = REG[s].items.filter((i) => !i.soon && euro(i.price)).length;
  if (priced < liveCount(s)) R.notes.push(`gallery note: ${s} "from ${v.from}" is the lowest of ${priced} priced journeys; ${liveCount(s) - priced} have no published price`);
}

/* ---------- 6. route maps: every point placed, legend copied correctly ---------- */
for (const [p, j] of Object.entries(J)) {
  const d = out(p); const c = d.querySelector('.map-canvas[data-points]'); if (!c) { if (j.points.length) R.fails.push(`${p}: route points but no map data`); continue; }
  const pts = JSON.parse(c.getAttribute('data-points'));
  check(pts.length === j.points.length, `${p}: route has ${j.points.length} stops, map plots ${pts.length} (missing: ${j.points.filter((n) => !pts.find((x) => x.name === n)).join(', ')})`);
  pts.forEach((x, i) => check(x.name === j.points[i], `${p}: map stop ${i + 1} "${x.name}" ≠ route list "${j.points[i]}"`));
  const lg = T(d.querySelector('.map-legend__summary'));
  check(lg === j.points.join(' → '), `${p}: map legend route differs`);
  const lt = T(d.querySelector('.map-legend__label')); check(lt === j.title, `${p}: map legend title`);
}

/* ---------- 7. JSON-LD prices + meta descriptions ---------- */
for (const [p, j] of Object.entries(J)) {
  const d = out(p);
  const ld = JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent);
  const trip = ld['@graph'].find((x) => x['@type'] === 'TouristTrip');
  check(trip && trip.name === j.title, `${p}: structured-data name`);
  const hp = euro(j.price);
  if (hp) check(trip.offers && +trip.offers.price === hp, `${p}: structured-data price ${trip.offers && trip.offers.price} vs page €${hp}`);
  else check(!trip.offers, `${p}: structured data has a price but page has none`);
  const desc = d.querySelector('meta[name="description"]').getAttribute('content');
  if (/price on request/i.test(j.desc) && hp) check(desc.includes(j.price), `${p}: meta description price replacement`);
  check(JSON.stringify(trip.itinerary.itemListElement.map((x) => x.item.name)) === JSON.stringify(j.points), `${p}: structured-data route`);
}

/* ---------- 8. every original sentence still present, unchanged, on every page ---------- */
const deliberate = [/All meals throughout the journey/, /A detailed day-by-day itinerary, provided on request/, /rather than published as a fixed rate/, /^Questions$/, /In development/, /^Zadar & the Kornati$/];
for (const p of Object.keys(CAP.pages)) {
  const s = src(p); const o = out(p);
  const sm = s.querySelector('#main-content'); const om = o.querySelector('#main-content');
  const leaves = (root) => [...root.querySelectorAll('p,h1,h2,h3,h4,li,dt,dd,span,a,summary,td,th,label,button,time')].filter((e) => !e.children.length || e.tagName === 'P').map(T).filter((t) => t.length > 1);
  const have = new Set(leaves(om).concat([T(om)]));
  const whole = T(om);
  for (const t of leaves(sm)) {
    if (deliberate.some((re) => re.test(t))) continue;
    if (!have.has(t) && !whole.includes(t)) R.fails.push(`${p}: original text missing or altered: "${t.slice(0, 90)}"`);
    R.checks++;
  }
}

/* ---------- 9. gallery tags: place photos tagged by geography; generic photos only if used in exactly one region ---------- */
const usedOn = {}; for (const [p, j] of Object.entries(J)) for (const s of j.imgs) (usedOn[s] = usedOn[s] || new Set()).add(regionOf[p]);
for (const it of gal.items) {
  const s = it.s.replace('https://www.adriondmc.com', '');
  if (!s.startsWith('/')) continue;
  const regs = [...(usedOn[s] || [])].filter(Boolean);
  const generic = /^\/img\/(moments|activity|fleet)\//.test(s);
  if (generic && it.r) check(regs.length === 1 && regs[0] === it.r, `gallery: generic photo ${s} tagged ${it.r}, used in ${regs.join('/') || 'no journeys'}`);
  if (generic && !it.r) check(regs.length !== 1, `gallery: ${s} is used only in ${regs[0]} but untagged`);
  if (generic) check(!/,\s*(Istria|Gorski|Northern|Southern|Zagreb|Slavonia)/.test(it.c) || regs.length === 1, `gallery: caption "${it.c}" names a region for a multi-region photo`);
  R.checks++;
}
/* ---------- 10. Unsplash photos: only those whose Unsplash page places them in Croatia ---------- */
const NOT_CROATIA = ['1543489822','1626698393005-68c2937dd401x','1662385930165','1622015663319','1629199159634','1506377247377','1645693091574','1597771125516','1717251752308','1698036867785','1593536284003','1519801584609','1711435340560','1552160757','1763877506730','1593351415075','1776763018821','1776763255122','1416331108676','1631528858266','1508471608746','1701622669938','1606419093310','1633321094192'];
for (const it of gal.items) if (/images\.unsplash\.com/.test(it.s)) check(!NOT_CROATIA.some((id) => it.s.includes('photo-' + id)), `gallery still contains a non-verified Unsplash photo ${it.s}`);
for (const pg of cardPages) { const h = fs.readFileSync(path.join(DIST, pg === '/' ? 'index.html' : pg.slice(1) + '/index.html'), 'utf8'); for (const id of NOT_CROATIA) check(!h.includes('photo-' + id + '?'), `${pg} still shows removed stock photo ${id}`); }
console.log(JSON.stringify(R, null, 1));
