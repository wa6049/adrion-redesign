// Automated audit of dist/: internal links, accessibility (axe), mobile overflow, JS errors, headings, meta.
// External requests are stubbed (the sandbox has no internet), so photos render as blank boxes here.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const DIST = path.join(__dirname, '..', 'dist');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.xml': 'application/xml', '.txt': 'text/plain' };

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(DIST, u);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end(fs.readFileSync(path.join(DIST, '404.html'))); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(4173);

const pages = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name === 'index.html') pages.push('/' + path.relative(DIST, path.dirname(p)).replace(/\\/g, '/')); } })(DIST);
pages.forEach((p, i) => { if (p === '/') return; pages[i] = p.replace(/\/$/, ''); });

(async () => {
  const browser = await chromium.launch();
  const report = { pages: pages.length, brokenLinks: [], axe: {}, overflow: [], jsErrors: [], headings: [], meta: [] };
  const known = new Set(pages.map((p) => (p === '' ? '/' : p)));
  for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 375, height: 812 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: 'reduce' });
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => {
      const t = r.request().resourceType();
      if (t === 'image') return r.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', 'base64') });
      if (t === 'stylesheet') return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return r.fulfill({ status: 200, body: '' });
    });
    for (const p0 of pages) {
      const p = p0 || '/';
      const page = await ctx.newPage();
      page.on('pageerror', (e) => report.jsErrors.push(`${vp.name} ${p}: ${e.message}`));
      await page.goto('http://localhost:4173' + p, { waitUntil: 'load' });
      await page.waitForTimeout(150);
      const r = await page.evaluate(() => {
        const sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
        const over = sw > cw + 1 ? [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.right > cw + 1 && b.width > 0 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 3).map((e) => e.tagName + '.' + (e.className.baseVal ?? e.className)) : [];
        const hs = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => +h.tagName[1]);
        const jumps = hs.filter((h, i) => i && h > hs[i - 1] + 1).length;
        return {
          over, sw, cw, h1: document.querySelectorAll('h1').length, jumps,
          links: [...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute('href').split(/[?#]/)[0]),
          desc: !!document.querySelector('meta[name="description"]'), og: document.querySelector('meta[property="og:image"]')?.content || '',
          canon: !!document.querySelector('link[rel="canonical"]'), title: document.title,
          imgNoAlt: [...document.querySelectorAll('img:not([alt])')].length,
          imgNoDims: [...document.querySelectorAll('main img:not([width])')].filter((i) => !i.src.startsWith('data:')).length,
        };
      });
      if (r.over.length) report.overflow.push(`${vp.name} ${p} (${r.sw}>${r.cw}): ${r.over.join(', ')}`);
      if (vp.name === 'desktop') {
        r.links.forEach((l) => { const k = l.replace(/\/$/, '') || '/'; if (!known.has(k) && !/^\/(_app|assets)\//.test(l) && !/\.(css|js|xml|txt)$/.test(l)) report.brokenLinks.push(`${p} -> ${l}`); });
        if (r.h1 !== 1 || r.jumps) report.headings.push(`${p}: h1=${r.h1} skips=${r.jumps}`);
        if (p !== '/404' && (!r.desc || !r.canon || /og\/default/.test(r.og) || r.imgNoAlt || r.imgNoDims)) report.meta.push(`${p}: desc=${r.desc} canon=${r.canon} og=${r.og.slice(-40)} noAlt=${r.imgNoAlt} noDims=${r.imgNoDims}`);
        await page.addScriptTag({ content: AXE });
        const ax = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'best-practice'], rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => `${v.impact}|${v.id}|${v.nodes.length}|${v.nodes[0].target.join(' ')}`));
        ax.forEach((v) => { const [imp, id, n, t] = v.split('|'); (report.axe[`${imp} ${id}`] = report.axe[`${imp} ${id}`] || []).push(`${p} (${n}) ${t}`); });
      }
      await page.close();
    }
    await ctx.close();
  }
  await browser.close(); server.close();
  for (const k of Object.keys(report.axe)) report.axe[k] = { pages: report.axe[k].length, sample: report.axe[k].slice(0, 3) };
  console.log(JSON.stringify(report, null, 1));
})();
