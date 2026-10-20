// Reel layout check: at each viewport and scroll position, the true (rotated) outline of every visible print
// must not overlap the info table, the notes or the bottom bar, and all text must sit inside the screen.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const DIST = path.join(__dirname, '..', 'dist'); const OUT = path.join(__dirname, '..', 'shots', 'reel');
fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => { let f = path.join(DIST, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); }).listen(4176);
const VPS = [
  ['laptop-100pct (user)', 1078, 595], ['laptop-70pct (approved)', 1540, 850], ['macbook-air 1470x830', 1470, 830], ['1280x720', 1280, 720], ['1366x768', 1366, 768],
  ['1440x900', 1440, 900], ['1920x1080', 1920, 1080], ['2560x1440', 2560, 1440], ['ipad-landscape 1180x820', 1180, 820], ['ipad-landscape 1024x768', 1024, 768],
  ['ipad-portrait 820x1180', 820, 1180], ['ipad-portrait 768x1024', 768, 1024], ['ipad-pro-portrait 1024x1366', 1024, 1366], ['iphone 390x844', 390, 844],
  ['iphone-se 375x667', 375, 667], ['android 412x915', 412, 915], ['iphone-landscape 844x390', 844, 390],
];
const svg = (n) => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067"><rect width="100%" height="100%" fill="hsl(${(n * 47) % 360},30%,35%)"/></svg>`;
(async () => {
  const b = await chromium.launch(); const report = [];
  for (const [name, W, H] of VPS) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: W < 1100 && H > W });
    let n = 0;
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.request().resourceType() === 'image' ? r.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg(n++) }) : r.fulfill({ status: 200, body: '' }));
    const pg = await ctx.newPage();
    await pg.goto('http://localhost:4176/gallery'); await pg.waitForTimeout(4600);
    await pg.evaluate(() => { const c = document.querySelector('aside.cookie'); if (c) c.hidden = true; });
    const issues = new Set(); let mode = '';
    for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const r = await pg.evaluate(async (k) => {
        const reel = document.querySelector('.ax-reel'); const st = document.querySelector('.ax-reel__stage');
        const step = Math.max(260, innerHeight * (st.dataset.mode === 'phone' ? 0.62 : 0.5));
        scrollTo(0, reel.getBoundingClientRect().top + scrollY + k * step); await new Promise((r) => setTimeout(r, 120));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise((r) => setTimeout(r, 700)); // let the rolling text settle
        const scene = document.querySelector('.ax-reel__scene'); const sm = new DOMMatrix(getComputedStyle(scene).transform === 'none' ? undefined : getComputedStyle(scene).transform);
        const polys = [...document.querySelectorAll('.ax-reel__card:not([hidden])')].filter((c) => +getComputedStyle(c).opacity > 0.35).map((c) => {
          const m = new DOMMatrix(getComputedStyle(c).transform); const w = c.offsetWidth, h = c.offsetHeight, x0 = c.offsetLeft, y0 = c.offsetTop, pad = 8;
          return [[-pad, -pad], [w + pad, -pad], [w + pad, h + pad], [-pad, h + pad]].map(([x, y]) => {
            const p = m.transformPoint(new DOMPoint(x - w / 2, y - h / 2, 0, 1)); const px = p.x / p.w + x0 + w / 2, py = p.y / p.w + y0 + h / 2;
            const q = sm.transformPoint(new DOMPoint(px, py)); return [q.x, q.y];
          });
        });
        const inPoly = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) c = !c; } return c; };
        const boxes = [];
        const add = (label, el) => { if (!el) return; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return; const r = el.getBoundingClientRect(); if (r.width && r.height) boxes.push([label, r]); };
        add('title', document.querySelector('.ax-reel__title .ax-roll'));
        document.querySelectorAll('.ax-reel__table > div').forEach((d, i) => add('table row ' + (i + 1), d));
        document.querySelectorAll('.ax-reel__note').forEach((nn, i) => { add('note ' + (i + 1) + ' label', nn.querySelector('small')); add('note ' + (i + 1) + ' text', nn.querySelector('span')); });
        document.querySelectorAll('.ax-reel__bar > *').forEach((e) => add('bar: ' + (e.className || e.tagName), e));
        const hits = []; const out = [];
        for (const [label, r] of boxes) {
          if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) out.push(label);
          let hit = false;
          for (let x = r.left; x <= r.right && !hit; x += 4) for (let y = r.top; y <= r.bottom && !hit; y += 4) if (polys.some((p) => inPoly([x, y], p))) hit = true;
          if (hit) hits.push(label);
        }
        const t = document.querySelector('[data-k=title]').textContent;
        return { mode: st.dataset.mode, hits, out, t, lines: Math.round(document.querySelector('.ax-reel__title').getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector('.ax-reel__title')).lineHeight || 30)) };
      }, k);
      mode = r.mode;
      r.hits.forEach((h) => issues.add(`frame ${k + 1} ("${r.t}"): print overlaps ${h}`));
      r.out.forEach((h) => issues.add(`frame ${k + 1}: ${h} runs off screen`));
      if (k === 9) await pg.screenshot({ path: path.join(OUT, name.replace(/[^a-z0-9]+/gi, '_') + '.png') });
    }
    report.push({ name, W, H, mode, issues: [...issues] });
    await ctx.close();
  }
  await b.close(); srv.close();
  for (const r of report) console.log(`${r.issues.length ? 'FAIL' : 'PASS'}  ${r.name.padEnd(30)} mode=${r.mode}${r.issues.length ? '\n      ' + r.issues.slice(0, 6).join('\n      ') : ''}`);
})();
