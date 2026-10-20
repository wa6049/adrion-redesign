# Adrion redesign

Replica of every English page of adriondmc.com plus the visual upgrade (gallery, photo cards, lightbox, route maps, fixes).

- `preview/` : open `preview/index.html` by double-clicking. Works straight from disk.
- `dist/`    : deploy-ready build (root paths). Upload to any static host (Vercel, Netlify, Cloudflare Pages).
- `build/build.js` : the generator. `npm install && node build/build.js && node build/preview.js`
- `source/adrion-capture.json` : the captured live site (65 pages, 22 stylesheets).
- `data/` : photo captions, regions, coordinates, Unsplash credits.
- `assets/enhance.css`, `assets/site.js` : the new visual layer and runtime.

Photos load from www.adriondmc.com and images.unsplash.com. `dist/image-manifest.txt` lists every site photo if you want to self-host them.

## Deploying

Vercel serves the prebuilt `dist/` folder (see `vercel.json`, no build step). To change the site:
`npm install && node build/build.js`, commit `dist/`, push. Vercel redeploys on every push.

While this runs on a vercel.app address it sends `X-Robots-Tag: noindex` so Google does not index a
duplicate of adriondmc.com. Remove that header when this build replaces the live site.
