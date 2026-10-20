/* Adrion site runtime: replaces the original SvelteKit client for the static build.
   Vanilla JS, no dependencies (Leaflet is lazy-loaded only on pages with a route map). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  };
  document.documentElement.classList.add('js');
  // resolves the inquiry page both on the live server and in the file:// preview copy
  const inquireUrl = () => { const a = $('nav.bar a[href*="inquire"]'); return a ? a.getAttribute('href') : '/inquire'; };

  /* ---------- Cookie notice ---------- */
  const cookie = $('aside.cookie');
  if (cookie) {
    if (!store.get('adrion-consent')) cookie.hidden = false;
    $$('button', cookie).forEach((b) => b.addEventListener('click', () => {
      store.set('adrion-consent', b.classList.contains('accept') ? 'accept' : 'decline');
      cookie.hidden = true;
    }));
  }

  /* ---------- Navigation ---------- */
  const bar = $('nav.bar');
  const toggle = bar && $('.toggle', bar);
  const overlay = $('.overlay');
  if (toggle && overlay) {
    const set = (open) => {
      overlay.classList.toggle('open', open);
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      overlay.inert = !open;
      document.documentElement.style.overflow = open ? 'hidden' : '';
    };
    overlay.inert = true;
    toggle.addEventListener('click', () => set(!overlay.classList.contains('open')));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('open')) { set(false); toggle.focus(); } });
    $$('a', overlay).forEach((a) => a.addEventListener('click', () => set(false)));
  }
  if (bar) {
    let last = scrollY;
    const onScroll = () => {
      const y = scrollY;
      bar.classList.toggle('scrolled', y > 40);
      const menuOpen = overlay && overlay.classList.contains('open');
      bar.classList.toggle('hidden', !menuOpen && y > last && y > 480);
      last = y;
    };
    addEventListener('scroll', onScroll, { passive: true });
    bar.addEventListener('focusin', () => bar.classList.remove('hidden'));
    onScroll();
  }

  /* ---------- Hero slideshows ---------- */
  const loadImg = (img) => { if (img && img.dataset.src) { img.src = img.dataset.src; img.removeAttribute('data-src'); } };
  $$('.slides').forEach((wrap) => {
    const slides = $$('img.slide', wrap);
    if (slides.length < 2) return;
    if (reduce) { wrap.classList.add('reduced'); return; }
    let i = 0;
    const warm = () => loadImg(slides[1]);
    if (document.readyState === 'complete') warm(); else addEventListener('load', warm, { once: true });
    setInterval(() => {
      if (document.hidden) return;
      const next = (i + 1) % slides.length;
      loadImg(slides[next]);
      const go = () => {
        slides[i].classList.remove('on');
        i = next;
        slides[i].classList.add('on');
        loadImg(slides[(i + 1) % slides.length]);
      };
      if (slides[next].complete) go(); else slides[next].addEventListener('load', go, { once: true });
    }, 5600);
  });

  /* ---------- Day photo carousels ---------- */
  $$('.photos').forEach((ph) => {
    const imgs = $$('img', ph);
    const dots = $$('.dot', ph);
    const arrows = $$('.arrow', ph);
    if (imgs.length < 2) return;
    let i = 0;
    const go = (n) => {
      i = (n + imgs.length) % imgs.length;
      imgs.forEach((im, k) => im.classList.toggle('on', k === i));
      dots.forEach((d, k) => { d.classList.toggle('active', k === i); d.setAttribute('aria-current', k === i ? 'true' : 'false'); });
    };
    if (arrows[0]) arrows[0].addEventListener('click', () => go(i - 1));
    if (arrows[1]) arrows[1].addEventListener('click', () => go(i + 1));
    dots.forEach((d, k) => d.addEventListener('click', () => go(k)));
  });

  /* ---------- Home: scroll-driven intro ---------- */
  const intro = $('section.intro');
  if (intro) {
    const rooms = $$('.room', intro);
    const about = $('.about', intro);
    const cue = $('.cue', intro);
    const atmos = $('.atmos', intro);
    const ramp = (a, b, t) => Math.min(1, Math.max(0, (t - a) / (b - a)));
    let ticking = false;
    const update = () => {
      ticking = false;
      const total = intro.offsetHeight - innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -intro.getBoundingClientRect().top / total)) : 0;
      const outA = 1 - ramp(0.16, 0.42, p);
      const inB = ramp(0.36, 0.6, p);
      if (rooms[0]) rooms[0].style.opacity = outA.toFixed(3);
      if (rooms[1]) { rooms[1].style.opacity = inB.toFixed(3); rooms[1].style.pointerEvents = inB > 0.5 ? 'auto' : 'none'; }
      if (about) about.style.opacity = ramp(0.46, 0.68, p).toFixed(3);
      if (cue) cue.style.opacity = (1 - ramp(0, 0.1, p)).toFixed(3);
      if (atmos) { atmos.style.setProperty('--atmos-op', inB.toFixed(3)); atmos.style.setProperty('--atmos-z', (p * 0.08).toFixed(3)); }
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('resize', update);
    update();
  }

  /* ---------- Home: zoom through the Adrion "A" into Biokovo ---------- */
  const zoom = $('section.ax-zoom');
  if (zoom) {
    const stageZ = $('.ax-zoom__stage', zoom);
    const svgZ = $('.ax-zoom__svg', zoom);
    const groups = $$('.ax-zoom__g', zoom);
    const gold = $('.ax-zoom__gold', zoom);
    const cover = $('.ax-zoom__cover', zoom);
    const bgZ = $('.ax-zoom__bg', zoom);
    const veil = $('.ax-zoom__veil', zoom);
    const open = $('.ax-zoom__open', zoom);
    const cueZ = $('.ax-zoom__cue', zoom);
    const hero = $('.ax-zoom__hero', zoom);
    const aboutZ = $('.ax-zoom__about', zoom);
    const [fx, fy] = zoom.dataset.focus.split(',').map(Number);
    const [cx0, cy0] = zoom.dataset.center.split(',').map(Number);
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const seg = (p, a, b) => clamp01((p - a) / (b - a));
    const smooth = (t) => t * t * (3 - 2 * t);
    const easeIn = (t) => t * t * t;
    if (reduce) zoom.classList.add('is-static');
    let tickZ = false;
    const drawZ = () => {
      tickZ = false;
      const W = innerWidth, H = stageZ.clientHeight || innerHeight;
      const total = zoom.offsetHeight - H;
      const p = reduce ? 1 : (total > 0 ? clamp01(-zoom.getBoundingClientRect().top / total) : 0);
      svgZ.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const s0 = Math.min((H * 0.34) / 502, (W * 0.62) / 593);
      const sEnd = (Math.hypot(W, H) / 2 / 22) * 1.25;
      const z = easeIn(seg(p, 0.07, 0.52));
      const sc = s0 * Math.pow(sEnd / s0, z);
      const m = smooth(clamp01(z * 1.6));
      const px = cx0 + (fx - cx0) * m, py = cy0 + (fy - cy0) * m;
      const sx = W / 2, sy = H * (W < 760 ? 0.44 : 0.46);
      const tf = `translate(${sx.toFixed(2)} ${sy.toFixed(2)}) scale(${sc.toFixed(5)}) translate(${(-px).toFixed(3)} ${(-py).toFixed(3)})`;
      groups.forEach((g) => g.setAttribute('transform', tf));
      gold.style.opacity = String(1 - smooth(seg(p, 0.015, 0.09)));
      const through = z >= 0.999;
      cover.style.display = through ? 'none' : '';
      gold.style.display = through ? 'none' : '';
      bgZ.style.transform = `scale(${(1.22 - 0.22 * smooth(seg(p, 0.3, 0.72))).toFixed(4)})`;
      open.style.opacity = String(1 - smooth(seg(p, 0.01, 0.07)));
      cueZ.style.opacity = String(1 - smooth(seg(p, 0, 0.04)));
      const heroIn = smooth(seg(p, 0.54, 0.62)), heroOut = smooth(seg(p, 0.72, 0.78));
      hero.style.opacity = String(heroIn * (1 - heroOut));
      hero.style.transform = `translateY(${((1 - heroIn) * 28 - heroOut * 20).toFixed(1)}px)`;
      veil.style.opacity = String(0.18 + 0.6 * smooth(seg(p, 0.72, 0.82)));
      const ab = smooth(seg(p, 0.79, 0.88));
      aboutZ.style.opacity = String(ab);
      aboutZ.style.transform = `translateY(${((1 - ab) * 24).toFixed(1)}px)`;
      aboutZ.style.pointerEvents = ab > 0.5 ? 'auto' : 'none';
      hero.style.pointerEvents = heroIn > 0.5 && heroOut < 0.5 ? 'auto' : 'none';
    };
    const reqZ = () => { if (!tickZ) { tickZ = true; requestAnimationFrame(drawZ); } };
    addEventListener('scroll', reqZ, { passive: true });
    addEventListener('resize', reqZ);
    drawZ();
  }

  /* ---------- Home: region hover backdrops ---------- */
  const where = $('section.where');
  if (where) {
    const bgs = $$('.bgs .bg', where);
    $$('.regions .region', where).forEach((li, k) => {
      const on = () => bgs.forEach((b, j) => b.classList.toggle('on', j === k));
      const off = () => bgs.forEach((b) => b.classList.remove('on'));
      li.addEventListener('mouseenter', on); li.addEventListener('mouseleave', off);
      li.addEventListener('focusin', on); li.addEventListener('focusout', off);
    });
  }

  /* ---------- Destinations: map hover stage ---------- */
  const mapHolder = $('.map-holder');
  const stage = mapHolder && $('.stage-map .stage');
  if (mapHolder && stage) {
    let data = {};
    try { data = JSON.parse(stage.getAttribute('data-regions') || '{}'); } catch (e) { data = {}; }
    const img = $('.stage-img', stage);
    const prompt = $('.s-prompt', stage);
    const copy = $('.copy', stage);
    const links = $$('svg a', mapHolder);
    const labels = $$('svg .region-label', mapHolder);
    const show = (a, k) => {
      const d = data[a.getAttribute('href')];
      if (!d) return;
      links.forEach((l, j) => $('.region', l).classList.toggle('active', j === k));
      labels.forEach((l, j) => l.classList.toggle('on', j === k));
      if (img.getAttribute('src') !== d.img) img.src = d.img;
      stage.classList.add('is-on');
      $('.s-name', copy).textContent = d.name;
      $('.s-kicker', copy).textContent = d.kicker;
      $('.s-count', copy).textContent = d.count;
      if (prompt) prompt.hidden = true;
      copy.hidden = false;
    };
    const hide = () => {
      links.forEach((l) => $('.region', l).classList.remove('active'));
      labels.forEach((l) => l.classList.remove('on'));
      stage.classList.remove('is-on');
      if (prompt) prompt.hidden = false;
      copy.hidden = true;
    };
    links.forEach((a, k) => {
      a.addEventListener('mouseenter', () => show(a, k));
      a.addEventListener('focus', () => show(a, k));
      a.addEventListener('mouseleave', hide);
      a.addEventListener('blur', hide);
    });
  }

  /* ---------- Route maps (Leaflet, loaded on demand) ---------- */
  const maps = $$('.map-canvas[data-points]');
  if (maps.length) {
    let leafletReady = null;
    const loadLeaflet = () => leafletReady || (leafletReady = new Promise((res, rej) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload = () => res(window.L); s.onerror = rej;
      document.head.appendChild(s);
    }));
    const draw = (el) => {
      let pts = [];
      try { pts = JSON.parse(el.getAttribute('data-points')); } catch (e) { return; }
      if (!pts.length) return;
      loadLeaflet().then((L) => {
        const map = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 18, subdomains: 'abcd',
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        }).addTo(map);
        const ll = pts.map((p) => [p.lat, p.lng]);
        L.polyline(ll, { color: '#d4af37', weight: 2, dashArray: '6 8', opacity: 0.9 }).addTo(map);
        pts.forEach((p, k) => {
          const icon = L.divIcon({ className: 'ax-pin', html: '<span>' + (k + 1) + '</span>', iconSize: [26, 26], iconAnchor: [13, 13] });
          L.marker([p.lat, p.lng], { icon, title: p.name, alt: p.name, keyboard: true }).addTo(map).bindTooltip(p.name, { direction: 'top', offset: [0, -12] });
        });
        map.fitBounds(L.latLngBounds(ll).pad(0.25), { maxZoom: 10 });
        el.classList.add('map-canvas--ready'); const lg = el.parentNode.querySelector('.map-legend'); if (lg) lg.hidden = false; setTimeout(() => map.invalidateSize(), 50);
      }).catch(() => el.classList.add('is-failed'));
    };
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => {
      ents.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); draw(e.target); } });
    }, { rootMargin: '300px' }) : null;
    maps.forEach((m) => (io ? io.observe(m) : draw(m)));
  }

  /* ---------- Charter: Booking Manager live availability (same integration as the live site) ---------- */
  const cform = $('form.search[data-bm]');
  if (cform) {
    const company = cform.getAttribute('data-bm');
    const val = (id) => { const el = $('#' + id, cform); return el ? el.value.trim() : ''; };
    const dmy = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return d + '.' + m + '.' + y; };
    let frame = null;
    const open = (extra) => {
      const p = ['companyid=' + encodeURIComponent(company), 'setlang=en'].concat(extra);
      const url = 'https://www.booking-manager.com/wbm2/page.html?' + p.join('&');
      if (!frame) {
        const wrap = document.createElement('div');
        wrap.className = 'frame ' + ([...cform.classList].find((c) => c.startsWith('svelte-')) || '');
        frame = document.createElement('iframe');
        frame.title = 'Live yacht charter availability';
        frame.setAttribute('loading', 'lazy');
        frame.style.cssText = 'width:100%;min-height:1400px;border:0;display:block';
        wrap.appendChild(frame);
        cform.parentNode.insertBefore(wrap, cform.nextSibling);
        if (!document.querySelector('script[src*="wbm-alter"]')) { const sc = document.createElement('script'); sc.src = 'https://www.booking-manager.com/down/wbm-alter.js'; document.head.appendChild(sc); }
      }
      frame.src = url;
      frame.parentNode.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    };
    cform.addEventListener('submit', (e) => {
      e.preventDefault();
      const p = ['view=SearchResult', 'filter_country=HR', 'resultsPerPage=10', 'sortBy=11', 'sortDirection=-1'];
      if (val('cs-area')) p.push('filter_region=' + encodeURIComponent(val('cs-area')));
      const from = $$('input[type="date"]', cform)[0], to = $$('input[type="date"]', cform)[1];
      if (from && to && from.value && to.value) p.push('daterange=' + encodeURIComponent(dmy(from.value) + ' - ' + dmy(to.value)));
      $$('select', cform).slice(1).forEach((sel, k) => { if (sel.value) p.push((k === 0 ? 'filter_kind=' : 'filter_service_type=') + encodeURIComponent(sel.value)); });
      const g = $('input[type="number"]', cform); if (g && g.value) p.push('personsByGroup0=' + encodeURIComponent(g.value));
      open(p);
    });
    $$('button.ghost', cform).forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); open(['view=Lastminute']); }));
  }

  /* ---------- Search forms (charter / stays) hand over to the inquiry form ---------- */
  $$('form[data-handoff]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const parts = [];
      $$('select, input', form).forEach((f) => {
        if (f.type === 'checkbox') { if (f.checked) parts.push(f.closest('label').textContent.trim()); return; }
        if (!f.value) return;
        const lab = form.querySelector('label[for="' + f.id + '"]');
        const val = f.tagName === 'SELECT' ? f.options[f.selectedIndex].text : f.value;
        parts.push((lab ? lab.textContent.trim() + ': ' : '') + val);
      });
      const q = new URLSearchParams({ source: form.getAttribute('data-handoff'), brief: parts.join(' · ') });
      location.href = inquireUrl() + '?' + q.toString();
    });
    $$('button.ghost', form).forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault();
      location.href = inquireUrl() + '?' + new URLSearchParams({ source: 'charter-last-minute', brief: 'Interested in last-minute charter deals' }).toString();
    }));
  });

  /* ---------- Inquiry form ---------- */
  const enquiry = $('form.enquiry-form');
  if (enquiry) {
    const params = new URLSearchParams(location.search);
    const msg = $('textarea', enquiry);
    if (msg && params.get('brief') && !msg.value) msg.value = 'I am interested in: ' + params.get('brief') + '\n\n';
    enquiry.addEventListener('submit', (e) => {
      e.preventDefault();
      const status = $('.ax-form-status', enquiry);
      const bad = $$('[required]', enquiry).filter((f) => !f.value.trim() || (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.value)));
      $$('[aria-invalid]', enquiry).forEach((f) => f.removeAttribute('aria-invalid'));
      if (bad.length) {
        bad.forEach((f) => f.setAttribute('aria-invalid', 'true'));
        if (status) status.textContent = 'Please complete the highlighted fields.';
        bad[0].focus();
        return;
      }
      if ($('#ef-company', enquiry) && $('#ef-company', enquiry).value) return; // honeypot
      const lines = [];
      $$('input, select, textarea', enquiry).forEach((f) => {
        if (!f.id || f.id === 'ef-company' || !f.value) return;
        const lab = enquiry.querySelector('label[for="' + f.id + '"]');
        lines.push((lab ? lab.textContent.replace('*', '').trim() : f.id) + ': ' + f.value);
      });
      const href = 'mailto:info@adriondmc.com?subject=' + encodeURIComponent('Journey inquiry') + '&body=' + encodeURIComponent(lines.join('\n'));
      if (status) status.textContent = 'Opening your email app with the details filled in. If nothing opens, write to info@adriondmc.com.';
      location.href = href;
    });
  }

  /* ---------- Lightbox ---------- */
  let lb = null; let list = []; let idx = 0; let opener = null;
  const buildLB = () => {
    lb = document.createElement('div');
    lb.className = 'ax-lb';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Photo viewer');
    lb.hidden = true;
    lb.innerHTML = '<button class="ax-lb__close" type="button" aria-label="Close photo viewer"><span aria-hidden="true">&times;</span></button>'
      + '<button class="ax-lb__nav ax-lb__prev" type="button" aria-label="Previous photo"><span aria-hidden="true">&larr;</span></button>'
      + '<figure class="ax-lb__fig"><img class="ax-lb__img" alt=""><figcaption class="ax-lb__cap"><span class="ax-lb__text"></span><span class="ax-lb__credit"></span><span class="ax-lb__count" aria-live="polite"></span></figcaption></figure>'
      + '<button class="ax-lb__nav ax-lb__next" type="button" aria-label="Next photo"><span aria-hidden="true">&rarr;</span></button>';
    document.body.appendChild(lb);
    $('.ax-lb__close', lb).addEventListener('click', closeLB);
    $('.ax-lb__prev', lb).addEventListener('click', () => show(idx - 1));
    $('.ax-lb__next', lb).addEventListener('click', () => show(idx + 1));
    lb.addEventListener('click', (e) => { if (e.target === lb) closeLB(); });
    lb.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLB();
      else if (e.key === 'ArrowLeft') show(idx - 1);
      else if (e.key === 'ArrowRight') show(idx + 1);
      else if (e.key === 'Tab') {
        const f = $$('button', lb);
        const first = f[0]; const lastB = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastB.focus(); }
        else if (!e.shiftKey && document.activeElement === lastB) { e.preventDefault(); first.focus(); }
      }
    });
    let x0 = null;
    lb.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    lb.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
    });
  };
  const show = (n) => {
    idx = (n + list.length) % list.length;
    const t = list[idx];
    const img = $('.ax-lb__img', lb);
    img.classList.remove('is-in');
    img.onload = () => img.classList.add('is-in');
    img.src = t.full;
    img.alt = t.caption || '';
    $('.ax-lb__text', lb).textContent = t.caption || '';
    $('.ax-lb__credit', lb).innerHTML = t.credit || '';
    $('.ax-lb__count', lb).textContent = (idx + 1) + ' / ' + list.length;
    $$('.ax-lb__nav', lb).forEach((b) => { b.hidden = list.length < 2; });
    [list[(idx + 1) % list.length], list[(idx - 1 + list.length) % list.length]].forEach((nb) => {
      if (nb) { const p = new Image(); p.src = nb.full; }
    });
  };
  function closeLB() {
    lb.hidden = true;
    document.documentElement.classList.remove('ax-lb-open');
    if (opener && opener.isConnected) opener.focus();
  }
  const openLB = (items, start, from) => {
    list = items; opener = from || document.activeElement;
    if (!lb) buildLB();
    lb.hidden = false;
    document.documentElement.classList.add('ax-lb-open');
    show(start);
    $('.ax-lb__close', lb).focus();
  };
  const isLBOpen = () => !!lb && !lb.hidden;
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-full]');
    if (!t) return;
    e.preventDefault();
    const group = t.closest('[data-lb-group]') || document;
    const els = $$('[data-full]', group).filter((x) => !x.closest('[hidden]'));
    openLB(els.map((x) => ({ full: x.getAttribute('data-full'), caption: x.getAttribute('data-caption'), credit: x.getAttribute('data-credit') })), els.indexOf(t), t);
  });

  /* ---------- Gallery page: filters + progressive reveal ---------- */
  const gal = $('.ax-gallery');
  if (gal) {
    const items = $$('.ax-g-item', gal);
    const more = $('.ax-g-more');
    const count = $('.ax-g-count');
    const STEP = 30;
    const params = new URLSearchParams(location.search);
    const state = { region: params.get('region') || 'all', theme: params.get('theme') || 'all', limit: STEP };
    const chips = $$('[data-filter]');
    const sync = () => chips.forEach((c) => {
      c.setAttribute('aria-pressed', String(state[c.dataset.filter] === c.dataset.value));
    });
    const apply = () => {
      const match = items.filter((it) => (state.region === 'all' || it.dataset.region === state.region)
        && (state.theme === 'all' || it.dataset.theme === state.theme));
      items.forEach((it) => { it.hidden = true; });
      match.slice(0, state.limit).forEach((it) => { it.hidden = false; });
      if (count) count.textContent = match.length + (match.length === 1 ? ' photograph' : ' photographs');
      if (more) more.hidden = match.length <= state.limit;
      const empty = $('.ax-g-empty');
      if (empty) empty.hidden = match.length > 0;
      sync();
    };
    chips.forEach((c) => c.addEventListener('click', () => {
      state[c.dataset.filter] = c.dataset.value;
      state.limit = STEP;
      const p = new URLSearchParams();
      if (state.region !== 'all') p.set('region', state.region);
      if (state.theme !== 'all') p.set('theme', state.theme);
      history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
      apply();
    }));
    if (more) more.addEventListener('click', () => { state.limit += STEP; apply(); });
    chips.forEach((c) => c.addEventListener('click', () => document.dispatchEvent(new CustomEvent('ax:filter', { detail: { region: state.region, theme: state.theme } }))));
    window.axGalleryState = state;
    apply();
  }

  /* ---------- Gallery reel (scroll-driven 3D photo reel) ---------- */
  const page = $('.ax-reel-page');
  const reelEl = page && $('.ax-reel', page);
  if (page && reelEl) {
    let data = { items: [], regions: {}, themes: {}, notes: {} };
    try { data = JSON.parse($('#ax-reel-data').textContent); } catch (e) { /* keep empty */ }
    const stage = $('.ax-reel__stage', reelEl);
    const track = $('.ax-reel__track', reelEl);
    const spacer = $('.ax-reel__spacer', reelEl);
    const nEl = $('.ax-reel__n', reelEl);
    const totalEl = $('.ax-reel__total', reelEl);
    const rolls = {};
    $$('.ax-roll', reelEl).forEach((r) => { rolls[r.dataset.k] = r; });
    const pad = (n) => String(n).padStart(3, '0');
    let items = data.items.slice();
    let f = 0; let lastActive = -1; let ticking = false;
    const POOL = 11; const pool = [];
    for (let i = 0; i < POOL; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ax-reel__card'; b.tabIndex = -1;
      b.innerHTML = '<img alt="" decoding="async" width="1000" height="750">';
      b.addEventListener('click', () => {
        const k = +b.dataset.k;
        if (k === Math.round(f)) openLB(items.map((x) => ({ full: x.f, caption: x.c, credit: x.cr })), k, b);
        else goTo(k);
      });
      track.appendChild(b); pool.push(b);
    }
    const scene = $('.ax-reel__scene', reelEl);
    const CW = 1540, CH = 850; // approved desktop composition (the 70% zoom view)
    let G = {};
    const geom = () => {
      const W = innerWidth, H = stage.clientHeight || innerHeight;
      let mode = 'desk';
      if (W <= 760 || H <= 500) mode = 'phone';
      else if (H > W * 0.85) mode = 'tablet';
      stage.dataset.mode = mode;
      if (mode === 'phone' && H <= 500) stage.dataset.short = ''; else delete stage.dataset.short;
      if (mode === 'desk') {
        const z = Math.max(0.55, Math.min(1.6, Math.min(W / CW, H / CH)));
        G = { mode, z, VW: W / z, VH: H / z, dx: 462, dy: 110, prev: 0.72 };
      } else if (mode === 'tablet') {
        G = { mode, z: 1, VW: W, VH: H, dx: W * 0.64, dy: H * 0.045, prev: 1 };
      } else {
        const short = H <= 500;
        G = { mode, z: 1, VW: W, VH: H, dx: short ? W * 0.42 : W * 0.7, dy: short ? H * 0.06 : H * 0.035, prev: 1 };
      }
      scene.style.width = G.VW + 'px'; scene.style.height = G.VH + 'px';
      scene.style.transform = G.z === 1 ? '' : 'scale(' + G.z + ')';
    };
    const stepPx = () => Math.max(260, innerHeight * (G.mode === 'phone' ? 0.62 : 0.5));
    const layout = () => { geom(); spacer.style.height = ((items.length - 1) * stepPx()) + 'px'; totalEl.textContent = pad(items.length); };
    const topOf = () => reelEl.getBoundingClientRect().top + scrollY;
    const goTo = (k) => {
      k = Math.max(0, Math.min(items.length - 1, k));
      scrollTo({ top: topOf() + k * stepPx(), behavior: reduce ? 'auto' : 'smooth' });
    };
    const setRoll = (k, val, html) => {
      const el = rolls[k]; if (!el) return;
      if (html ? el.innerHTML === val : el.textContent === val) return;
      if (html) el.innerHTML = val; else el.textContent = val;
      el.classList.remove('is-in'); void el.offsetWidth; el.classList.add('is-in');
    };
    const info = (k) => {
      const it = items[k]; if (!it) return;
      const r = data.regions[it.r];
      setRoll('title', it.c);
      setRoll('region', r ? r.n : 'Across Croatia');
      setRoll('theme', data.themes[it.t] || '');
      setRoll('credit', it.cr.replace(/^Photo:\s*/, ''), true);
      const n1 = $('.ax-reel__note[data-k=note1]', reelEl); const n2 = $('.ax-reel__note[data-k=note2]', reelEl);
      const note = data.notes[it.t] || ['Croatia', '', '/destinations'];
      if (r) {
        setRoll('n1k', r.n); setRoll('n1', '\u201C' + r.k + '\u201D'); n1.href = r.h;
        setRoll('n2k', 'Travel it privately'); setRoll('n2', r.c + ' journeys' + (r.from ? ', from ' + r.from : '')); n2.href = r.h;
      } else {
        setRoll('n1k', note[0]); setRoll('n1', '\u201C' + note[1] + '\u201D'); n1.href = note[2];
        setRoll('n2k', 'Travel it privately'); setRoll('n2', 'Plan a journey'); n2.href = $('nav.bar a[href*="inquire"]') ? $('nav.bar a[href*="inquire"]').getAttribute('href') : '/inquire';
      }
      nEl.textContent = pad(k + 1);
    };
    const render = () => {
      ticking = false;
      if (page.dataset.view !== 'reel' || !items.length) return;
      const st = stepPx();
      f = Math.max(0, Math.min(items.length - 1, (scrollY - topOf()) / st));
      const base = Math.round(f);
      const dx = G.dx; const dy = G.dy;
      pool.forEach((card, i) => {
        const k = base - Math.floor(POOL / 2) + i;
        const it = items[k];
        if (!it) { card.hidden = true; return; }
        card.hidden = false;
        const d = k - f; const ad = Math.abs(d);
        if (card.dataset.k !== String(k)) {
          card.dataset.k = k;
          const im = card.firstChild; im.src = it.s; card.classList.toggle('is-portrait', !!it.p);
          card.setAttribute('aria-label', it.c);
        }
        const sc = 1 - Math.min(ad, 4) * 0.09;
        const tx = d * dx; const ty = -d * dy * (d < 0 ? G.prev : 1);
        const ry = Math.max(-1, Math.min(1, d)) * -14;
        card.style.transform = `translate(calc(-50% + ${tx.toFixed(1)}px), calc(-50% + ${ty.toFixed(1)}px)) perspective(1400px) rotateX(18deg) rotateY(${ry.toFixed(2)}deg) rotateZ(-7deg) scale(${sc.toFixed(3)})`;
        card.style.zIndex = String(100 - Math.round(ad * 10));
        card.style.opacity = String(Math.max(0, Math.min(1, 4.2 - ad)));
        card.style.setProperty('--dim', Math.min(1, ad).toFixed(3));
        const active = k === base;
        card.classList.toggle('is-active', active);
        card.tabIndex = active ? 0 : -1;
        card.setAttribute('aria-hidden', ad > 2.5 ? 'true' : 'false');
      });
      if (base !== lastActive) { lastActive = base; info(base); }
    };
    const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(render); } };
    addEventListener('scroll', req, { passive: true });
    addEventListener('resize', () => { layout(); req(); });
    document.addEventListener('keydown', (e) => {
      if (page.dataset.view !== 'reel' || isLBOpen() || /input|select|textarea/i.test(document.activeElement.tagName)) return;
      const r = reelEl.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); goTo(Math.round(f) + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(Math.round(f) - 1); }
    });
    const filterTo = (st) => {
      items = data.items.filter((x) => (st.region === 'all' || x.r === st.region) && (st.theme === 'all' || x.t === st.theme));
      lastActive = -1; layout();
      scrollTo({ top: topOf(), behavior: 'auto' });
      if (!items.length) { pool.forEach((c) => { c.hidden = true; }); setRoll('title', 'No photographs here yet'); nEl.textContent = '000'; return; }
      req();
    };
    document.addEventListener('ax:filter', (e) => filterTo(e.detail));
    // Index dropdown
    const ib = $('.ax-reel__indexbtn', reelEl); const panel = $('.ax-reel__panel', reelEl);
    const setPanel = (open) => { panel.hidden = !open; ib.setAttribute('aria-expanded', String(open)); };
    ib.addEventListener('click', () => setPanel(panel.hidden));
    panel.addEventListener('click', (e) => { if (e.target.closest('[data-filter]')) setPanel(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { setPanel(false); ib.focus(); } });
    document.addEventListener('click', (e) => { if (!panel.hidden && !e.target.closest('.ax-reel__index')) setPanel(false); });
    // view switching (reel <-> grid)
    const setView = (v, push) => {
      page.dataset.view = v;
      if (push) { const p = new URLSearchParams(location.search); if (v === 'grid') p.set('view', 'grid'); else p.delete('view'); history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '')); }
      if (v === 'reel') { layout(); req(); }
      scrollTo({ top: 0, behavior: 'auto' });
    };
    $$('[data-view-to]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.viewTo, true)));
    const q = new URLSearchParams(location.search);
    const start = q.get('view') === 'grid' || reduce ? 'grid' : 'reel';
    if (window.axGalleryState && (window.axGalleryState.region !== 'all' || window.axGalleryState.theme !== 'all')) {
      items = data.items.filter((x) => (window.axGalleryState.region === 'all' || x.r === window.axGalleryState.region) && (window.axGalleryState.theme === 'all' || x.t === window.axGalleryState.theme));
    }
    page.dataset.view = start;
    layout(); render();
    // intro counter, A24-style: runs while the first frames load
    const loader = $('.ax-reel__loader', reelEl); const cnt = $('.ax-reel__count', reelEl);
    if (start === 'reel' && !reduce && loader) {
      const firsts = pool.filter((c) => !c.hidden).map((c) => c.firstChild);
      const done = Promise.all(firsts.slice(0, 5).map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
      let shown = 0; let ready = false; done.then(() => { ready = true; });
      const t0 = performance.now();
      const tick = (t) => {
        const target = ready ? 100 : Math.min(92, (t - t0) / 18);
        shown += Math.max(0.6, (target - shown) * 0.12);
        if (shown > target) shown = target;
        cnt.textContent = String(Math.floor(shown));
        if (shown >= 100 || t - t0 > 4000) { cnt.textContent = '100'; stage.classList.add('is-ready'); setTimeout(() => { loader.hidden = true; }, 700); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } else { if (loader) loader.hidden = true; stage.classList.add('is-ready'); }
  }

  /* ---------- Gentle reveal on scroll ---------- */
  const rev = $$('.ax-reveal');
  if (rev.length && !reduce && 'IntersectionObserver' in window) {
    const io2 = new IntersectionObserver((ents) => {
      ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io2.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    rev.forEach((el) => io2.observe(el));
  } else rev.forEach((el) => el.classList.add('in'));
})();
