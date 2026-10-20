// Full-page screenshots of key templates. Photos are replaced with tinted placeholders (no internet here).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const DIST = path.join(__dirname, '..', 'dist'); const OUT = path.join(__dirname, '..', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { let f = path.join(DIST, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); }).listen(4174);
let n = 0;
const svg = () => { const h = [28, 200, 35, 160, 15, 190][n++ % 6]; return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},28%,34%)"/><stop offset="1" stop-color="hsl(${h + 30},22%,16%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`; };
const jobs = (process.argv[2] || '/,/destinations,/destinations/srednja-dalmacija,/destinations/central-dalmatia-signature-land-and-sea,/one-day-journeys,/charter,/luxury-accommodation,/about,/journal,/gallery,/fleet,/transfers').split(',');
(async () => {
  const b = await chromium.launch();
  for (const [vp, w, h] of [['d', 1440, 900], ['m', 390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => {
      const t = r.request().resourceType();
      if (t === 'image') return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg() });
      if (t === 'stylesheet') return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return r.fulfill({ status: 200, body: '' });
    });
    for (const p of jobs) {
      if (vp === 'm' && !['/', '/gallery', '/destinations/srednja-dalmacija', '/destinations/central-dalmatia-signature-land-and-sea'].includes(p)) continue;
      const pg = await ctx.newPage();
      await pg.goto('http://localhost:4174' + p, { waitUntil: 'load' });
      await pg.evaluate(async () => { document.querySelectorAll('.ax-reveal').forEach((e) => e.classList.add('in')); const c = document.querySelector('aside.cookie'); if (c) c.hidden = true; for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); } scrollTo(0, 0); });
      await pg.waitForTimeout(300);
      const name = (p === '/' ? 'home' : p.slice(1).replace(/\//g, '_')) + '-' + vp + '.png';
      await pg.screenshot({ path: path.join(OUT, name), fullPage: true });
      await pg.close();
    }
    await ctx.close();
  }
  await b.close(); srv.close(); console.log('ok');
})();
