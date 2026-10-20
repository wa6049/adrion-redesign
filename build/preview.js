#!/usr/bin/env node
/* Makes a copy of dist/ that works when opened straight from disk (file://):
   root-relative links become relative, page links point at index.html files. */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'dist');
const OUT = path.join(__dirname, '..', 'preview');
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(OUT).filter((f) => f.endsWith('.html'))) {
  const rel = path.relative(OUT, path.dirname(f));
  const up = rel ? rel.split(path.sep).map(() => '..').join('/') + '/' : './';
  const fix = (u) => {
    const [p0, rest = ''] = u.split(/(?=[?#])/);
    const p = p0.replace(/^\//, '');
    if (/\.[a-z0-9]+$/i.test(p)) return up + p + rest; // asset
    if (p === '' ) return up + 'index.html' + rest;
    // page link: query strings dropped from file links except on gallery filters (kept as hash for readability)
    return up + p.replace(/\/$/, '') + '/index.html' + rest;
  };
  let html = fs.readFileSync(f, 'utf8');
  html = html.replace(/(\s(?:href|src))="(\/(?!\/)[^"]*)"/g, (m, a, u) => `${a}="${fix(u)}"`);
  html = html.replace('<head>', '<head><script>window.AX_FILE_PREVIEW=true</script>');
  fs.writeFileSync(f, html);
}
console.log('Preview copy written to', path.relative(process.cwd(), OUT) + '/');
