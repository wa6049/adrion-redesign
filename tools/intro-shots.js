const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const DIST = path.join(__dirname, '..', 'dist'); const OUT = path.join(__dirname, '..', 'shots', 'intro'); fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { let f = path.join(DIST, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); }).listen(4177);
const land = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1334"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9cc3e0"/><stop offset=".5" stop-color="#e9d9b8"/></linearGradient></defs><rect width="2000" height="1334" fill="url(#s)"/><path d="M0 700 L300 380 L520 560 L800 300 L1100 520 L1400 260 L1700 500 L2000 420 L2000 1334 L0 1334Z" fill="#7d7a70"/><path d="M0 980 Q1000 900 2000 1000 L2000 1334 L0 1334Z" fill="#2f6f8f"/></svg>`;
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [name, W, H] of [['desk', 1440, 900], ['phone', 390, 844], ['ipad', 820, 1180]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H } });
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.request().resourceType() === 'image' ? r.fulfill({ status: 200, contentType: 'image/svg+xml', body: land }) : r.fulfill({ status: 200, body: '' }));
    const pg = await ctx.newPage(); pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto('http://localhost:4177/home-preview'); await pg.waitForTimeout(500);
    await pg.evaluate(() => { const c = document.querySelector('aside.cookie'); if (c) c.hidden = true; });
    for (const p of [0, 0.05, 0.2, 0.32, 0.42, 0.5, 0.6, 0.85, 1.02]) {
      await pg.evaluate((p) => { const z = document.querySelector('.ax-zoom'); scrollTo(0, (z.offsetHeight - innerHeight) * p); }, p);
      await pg.waitForTimeout(250);
      await pg.screenshot({ path: path.join(OUT, `${name}-${String(Math.round(p * 100)).padStart(3, '0')}.png`) });
    }
    await ctx.close();
  }
  await b.close(); srv.close(); console.log('errors:', errs);
})();
