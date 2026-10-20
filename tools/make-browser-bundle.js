// Packs build.js + data into one script that runs inside a browser tab on adriondmc.com
const fs = require('fs');
const places = require('../data/places.js');
const notes = require('../data/unsplash-notes.js');
const ser = (o) => JSON.stringify(o, (k, v) => (v instanceof Set ? { __set: [...v] } : v));
const FILES = {
  'data/dims.txt': fs.readFileSync('data/dims.txt', 'utf8'),
  'data/unsplash-raw.txt': fs.readFileSync('data/unsplash-raw.txt', 'utf8'),
};
const build = fs.readFileSync('build/build.js', 'utf8').replace(/^#!.*\n/, '');
const out = `(async()=>{
const FILES=${JSON.stringify(FILES)};
const PL=JSON.parse(${JSON.stringify(ser(places))},(k,v)=>v&&v.__set?new Set(v.__set):v);
const NOTES=${JSON.stringify(notes)};
const OUT={};
const norm=p=>p.replace(/^build\\/\\.\\.\\//,'').replace(/^\\.\\.\\//,'');
const path={join:(...a)=>a.join('/').replace(/\\/+/g,'/'),dirname:p=>p.split('/').slice(0,-1).join('/'),relative:(a,b)=>b,sep:'/'};
const fsS={readFileSync:p=>FILES[norm(p)],writeFileSync:(p,s)=>{OUT[norm(p)]=s},rmSync(){},mkdirSync(){},copyFileSync(){}};
const req=m=>{m=norm(m);if(m==='fs')return fsS;if(m==='path')return path;if(m==='linkedom')return{parseHTML:h=>({document:new DOMParser().parseFromString(h,'text/html')})};if(m.endsWith('places.js'))return PL;if(m.endsWith('unsplash-notes.js'))return NOTES;if(m.endsWith('adrion-capture.json'))return window.__cap;throw new Error('no module '+m)};
(function(require,process,__dirname){${build}})(req,{env:{},cwd:()=>''},'build');
window.__out=OUT;return Object.keys(OUT).length;})()`;
fs.writeFileSync('tools/browser-bundle.js', out);
