/* Blare web — the screens. blare.js owns audio, the analyser and the queue;
 * this file draws FIND, MIX, PLAY, LIB (list + globe), HIST, SET and the
 * landscape stage, and fills the ad slots from the shared manifest.
 * Rule inherited from the iOS app: nothing on screen implies a capability
 * the page does not have — every browser limit is said in the caption. */
'use strict';
const B = window.Blare, S = B.S, $ = (id) => document.getElementById(id), esc = B.esc;

// ================================================================ ads
const ADS_URL = 'https://raw.githubusercontent.com/agik66/blare-ads/main/ads.json';
const SLOT_FORMAT = { 'web-leaderboard': 'wide', 'web-inline': 'narrow', 'web-side': 'tall', 'web-find': 'narrow' };
const BUILTIN_ADS = [
  {id:'screenshot-clean', kicker:'APP · SAME DEVELOPER', title:'Screenshot Clean', line:'finds every screenshot, copies its text, cleans up one swipe at a time', cta:'APP STORE ↗', url:'https://apps.apple.com/app/screenshot-clean/id6760674902', creative:{}},
  {id:'subten', kicker:'WEB · SAME DEVELOPER', title:'Subten', line:'food, training and recovery in one app, with an AI coach', cta:'SUBTEN-APP.EU ↗', url:'https://subten-app.eu/', creative:{}},
  {id:'order-windows', kicker:'MAC · SAME DEVELOPER', title:'Order Windows', line:'window manager for macOS: halves, corners, thirds, 17 shortcuts', cta:'SEE IT ↗', url:'https://agik66.github.io/order-windows-site/', creative:{}},
];
let ADS = BUILTIN_ADS, NETWORKS = null, adsenseLoaded = false;
const today = () => new Date().toISOString().slice(0, 10);
function eligible(ad, slot) {
  if (ad.enabled === false || (ad.weight ?? 1) <= 0) return false;
  if (ad.platforms && !ad.platforms.includes('web')) return false;
  if (ad.slots && !ad.slots.includes(slot)) return false;
  if (!/^https:/.test(ad.url)) return false;
  const d = today();
  if (ad.from && d < ad.from) return false;
  if (ad.until && d > ad.until) return false;
  return true;
}
function pickAd(slot, ordinal) {
  const pool = ADS.filter(a => eligible(a, slot)); if (!pool.length) return null;
  const weighted = []; for (const a of pool) for (let i = 0; i < Math.max(1, a.weight ?? 1); i++) weighted.push(a);
  const day = Math.floor(Date.now() / 86400000);
  return weighted[(day + ordinal) % weighted.length];
}
// House or paid: the manifest's house_share decides per page load; a paid
// unit needs a client id, otherwise the slot is a house ad.
const pageRoll = Math.random();
function fillAds() {
  document.querySelectorAll('.ad').forEach((el, i) => {
    const slot = el.dataset.slot;
    const ads = NETWORKS && NETWORKS.adsense, unit = ads && ads.client && ads.slots && ads.slots[slot];
    if (unit && pageRoll >= (ads.house_share ?? 0.5)) {
      el.hidden = false;
      el.innerHTML = `<span class="badge">AD</span><ins class="adsbygoogle" style="display:block;width:100%;height:100%" data-ad-client="${esc(ads.client)}" data-ad-slot="${esc(unit)}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
      if (!adsenseLoaded) { adsenseLoaded = true; const s = document.createElement('script'); s.async = true; s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(ads.client); s.crossOrigin = 'anonymous'; document.head.appendChild(s); }
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      return;
    }
    const ad = pickAd(slot, i);
    if (!ad) { el.hidden = true; return; }
    el.hidden = false;
    const fmt = SLOT_FORMAT[slot], img = ad.creative && ad.creative[fmt] && ad.creative[fmt].image;
    const text = `<span class="kicker">${esc(ad.kicker)}</span><span class="title">${esc(ad.title)}</span><span class="line">${esc(ad.line)}</span><span class="cta">${esc(ad.cta || 'OPEN ↗')}</span>`;
    el.innerHTML = `<span class="badge">AD</span><a class="house${img ? ' has-image' : ''}" href="${esc(ad.url)}" target="_blank" rel="noopener sponsored">${img ? `<img src="${esc(img)}" alt="${esc(ad.title)}">` : text}</a>`;
  });
}
async function loadAds() {
  const meta = (m) => { if (m && m.web_interstitial) window.__ads_meta = { web_interstitial: m.web_interstitial }; };
  try { const c = JSON.parse(localStorage.getItem('blare-ads')); if (c && c.version === 1 && c.ads?.length) { ADS = c.ads; NETWORKS = c.web_networks || null; meta(c); } } catch (e) {}
  fillAds();
  let fresh = false;
  try {
    const r = await fetch(ADS_URL, { cache: 'no-store' });
    if (r.ok) {
      const m = await r.json();
      if (m.version === 1 && m.ads?.length) {
        ADS = m.ads; NETWORKS = m.web_networks || null; meta(m); fresh = true;
        try { localStorage.setItem('blare-ads', JSON.stringify(m)); } catch (e) {}
        fillAds();
      }
    }
  } catch (e) {}
  showGate();
}

// ================================================================ interstitial
// One full-page house ad when the page is opened — the web has no "Remove
// ads" purchase, and a box under the player alone is easy to ignore. It is
// labelled AD, closes on its own countdown, and comes back only after
// `web_interstitial.every_minutes` (manifest), default 30.
function showGate() {
  const cfg = (window.__ads_meta && window.__ads_meta.web_interstitial) || {};
  if (cfg.enabled === false || /[?&]nogate\b/.test(location.search)) return; // nogate: screenshots and tests
  const every = (cfg.every_minutes ?? 30) * 60000, countdown = Math.max(0, cfg.countdown ?? 5);
  let last = 0; try { last = +localStorage.getItem('blare-gate') || 0; } catch (e) {}
  if (Date.now() - last < every) return;
  let ad = pickAd('web-interstitial', 7); if (!ad) ad = pickAd('web-leaderboard', 7); if (!ad) return;
  const img = ad.creative && ad.creative.wide && ad.creative.wide.image;
  const el = document.createElement('div'); el.className = 'gate'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Advertisement');
  el.innerHTML = `<div class="gate-box"><span class="badge">AD</span>
    <a class="house${img ? ' has-image' : ''}" href="${esc(ad.url)}" target="_blank" rel="noopener sponsored">${img ? `<img src="${esc(img)}" alt="${esc(ad.title)}">` : `<span class="kicker">${esc(ad.kicker)}</span><span class="title">${esc(ad.title)}</span><span class="line">${esc(ad.line)}</span><span class="cta">${esc(ad.cta || 'OPEN ↗')}</span>`}</a>
    <div class="gate-foot"><span>THE iOS APP SELLS AN AD-FREE PURCHASE · THE WEB PLAYER STAYS FREE WITH ADS</span><button type="button" id="gateBtn">CONTINUE IN ${countdown}</button></div></div>`;
  document.body.appendChild(el);
  const btn = el.querySelector('#gateBtn'); let left = countdown;
  const close = () => { el.remove(); try { localStorage.setItem('blare-gate', String(Date.now())); } catch (e) {} };
  const arm = () => { btn.textContent = 'CONTINUE ▸'; btn.classList.add('ready'); btn.onclick = close; };
  const tick = () => { left--; if (left <= 0) arm(); else { btn.textContent = `CONTINUE IN ${left}`; setTimeout(tick, 1000); } };
  if (countdown === 0) arm(); else setTimeout(tick, 1000);
}

function flag(cc) { if (!/^[A-Z]{2}$/.test(cc || '')) return ''; return String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)); }
// ================================================================ tabs
function showTab(t) {
  ['find', 'mix', 'play', 'lib', 'hist', 'set'].forEach(x => $('screen-' + x).classList.toggle('hidden', x !== t));
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  if (t === 'lib') renderLib(); if (t === 'hist') renderHist(); if (t === 'mix') renderMix(); if (t === 'find') renderFind();
  if (t === 'lib' && libView === 'map') globeStart();
}

// ================================================================ PLAY
function rowHTML(st, i, showMeta, cls) {
  const fav = S.favs.has(st.u), cur = B.current() && B.current().u === st.u && S.playing;
  return `<li data-u="${esc(st.u)}" class="${cur ? 'cur' : ''} ${cls || ''}">
    <span class="mark">${cur ? '▶' : ''}</span><span class="idx">${i + 1}.</span>
    <span class="name">${esc(st.n)}${showMeta ? `<span class="sub">${esc((st.g || 'unclassified').toUpperCase().replace(/\//g, ' / '))} · ${esc(B.countryName(st.c).toUpperCase() || '—')}</span>` : ''}</span>
    ${showMeta ? `<span class="meta">${esc(st.c || '··')} · ${st.b || '—'} <span class="${st.np ? 'ok' : 'dim'}">${st.np ? 'NP' : '··'}</span></span>` : '<span class="np"></span>'}
    <button class="fav ${fav ? 'on' : ''}" data-fav="${esc(st.u)}" aria-label="Favourite">${fav ? '★' : '☆'}</button></li>`;
}
let expanded = false;
function renderPlay() {
  const st = B.current(), on = S.playing;
  $('stationName').textContent = st ? st.n.toUpperCase() : '—';
  $('starBtn').textContent = st && S.favs.has(st.u) ? '★' : '☆';
  $('starBtn').classList.toggle('on', !!st && S.favs.has(st.u));
  $('playBtn').textContent = on ? '■' : '▶';
  $('dot').classList.toggle('live', on);
  $('status').textContent = on ? 'LIVE' : 'STANDBY';
  $('playstate').textContent = on ? '▶ PLAYING' : '■ STOPPED (tap ▶)';
  $('playstate').classList.toggle('on', on);
  $('streamState').textContent = on ? (S.streamState || '———— STREAMING ————') : (S.streamState && /CANNOT|ENDED/.test(S.streamState) ? S.streamState : '———— STOPPED ————');
  $('title').textContent = st && on ? st.n + (st.g ? ' · ' + st.g.toUpperCase() : '') : 'NOTHING PLAYING';
  $('title').parentElement.classList.toggle('none', !on);
  $('pos').textContent = S.idx >= 0 ? (S.idx + 1) + '/' + S.queue.length : '–/–';
  const n = expanded ? S.queue.length : 5;
  $('rows').innerHTML = S.queue.slice(0, n).map((s, i) => rowHTML(s, i, false)).join('');
  $('openAll').textContent = expanded ? '▴ SHOW FEWER' : `≡ OPEN FULL LIST · ${S.queue.length} ▸`;
  $('visSegs').innerHTML = B.MODES.map((m) => `<i class="${m === S.mode ? 'on' : ''}" data-m="${m}"></i>`).join('');
  $('visName').textContent = S.mode.toUpperCase();
  $('vol').value = S.vol; $('volPct').textContent = S.vol + '%';
  document.querySelectorAll('.theme').forEach(b => b.classList.toggle('on', b.dataset.id === S.theme));
  document.querySelectorAll('[data-density]').forEach(b => b.classList.toggle('on', b.dataset.density === S.density));
  $('scanlines').classList.toggle('on', S.scan);
  $('analyseToggle').classList.toggle('on', S.analyse);
  document.querySelectorAll('#patternChips .chip').forEach(b => b.classList.toggle('on', b.dataset.p === S.pattern));
  // stage mirrors
  $('stageStation').textContent = st ? `${st.n.toUpperCase()} — ${(st.g || 'RADIO').toUpperCase().split('/')[0]} · ${B.countryName(st.c).toUpperCase()}` : 'NO STATION';
  $('stageTitle').textContent = st && on ? st.n : 'NOTHING PLAYING';
  $('stageSub').textContent = on ? '▶ PLAYING' : '■ STOPPED';
  $('sPlay').textContent = on ? '■' : '▶';
}
function perFrame(now) {
  const cap = $('caption'); cap.className = 'caption ' + (S.kind === 'measured' ? 'live' : S.kind === 'pattern' ? 'pattern' : '');
  cap.textContent = S.caption; $('stageCaption').textContent = S.caption;
  if (S.playing) {
    const s = Math.floor((now - S.startedAt) / 1000);
    $('elapsed').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} / LIVE`;
    const st = B.current(); $('kbps').textContent = st && st.b ? `↓ ${Math.round(st.b / 8)} KB/s` : '↓ -- KB/s';
    $('stageClock').textContent = $('elapsed').textContent;
  } else { $('elapsed').textContent = '0:00 / --:--'; $('kbps').textContent = '↓ -- KB/s'; $('stageClock').textContent = ''; }
}

// ================================================================ LIB
let libView = 'list', libQ = '', favOnly = false, npOnly = false, genre = null, country = null, libShown = 60, taxonomy = null;
function buildTaxonomy() {
  const g = new Map(), c = new Map();
  for (const s of S.stations) { for (const x of (s.g ? s.g.split('/') : [])) g.set(x, (g.get(x) || 0) + 1); if (s.c) c.set(s.c, (c.get(s.c) || 0) + 1); }
  taxonomy = { genres: [...g].sort((a, b) => b[1] - a[1]), countries: [...c].sort((a, b) => b[1] - a[1]) };
}
function libRows() {
  const q = B.fold(libQ).trim(), tokens = q.split(/\s+/).filter(Boolean);
  const home = (navigator.language || '').split('-')[1]?.toUpperCase() || '';
  let list = S.stations.filter(s => (!favOnly || S.favs.has(s.u)) && (!npOnly || s.np) && (!genre || (s.g || '').split('/').includes(genre)) && (!country || s.c === country));
  if (!q) return list;
  // The app's tiers: exact 500, prefix 400, contains 300, all tokens in name 200, tokens in name+meta 100, +1 for the home country.
  const scored = [];
  for (const s of list) {
    const n = s.fold; let tier;
    if (n === q) tier = 500; else if (n.startsWith(q)) tier = 400; else if (n.includes(q)) tier = 300;
    else if (tokens.every(t => n.includes(t))) tier = 200; else if (tokens.every(t => n.includes(t) || s.foldMeta.includes(t))) tier = 100; else continue;
    scored.push([tier + (home && s.c === home ? 1 : 0), s]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map(x => x[1]);
}
function renderLib() {
  if (!taxonomy) buildTaxonomy();
  const chips = (host, label, items, cur, set, name) => {
    host.innerHTML = `<span class="label">${label}</span>` + [['', 'ALL']].concat(items).map(([v, l]) => `<button class="chip ${v === (cur || '') ? 'on' : ''}" data-v="${esc(v)}">${esc(l)}</button>`).join('');
    host.querySelectorAll('.chip').forEach(b => b.onclick = () => { set(b.dataset.v || null); libShown = 60; renderLib(); });
  };
  chips($('genreChips'), 'GENRE', taxonomy.genres.slice(0, 12).map(([g]) => [g, g.toUpperCase()]), genre, v => genre = v);
  chips($('countryChips'), 'COUNTRY', taxonomy.countries.slice(0, 10).map(([c]) => [c, B.countryName(c).toUpperCase()]), country, v => country = v);
  $('countryChips').querySelectorAll('.chip').forEach(b => { const f = flag(b.dataset.v); if (f) { b.classList.add('flagged'); b.dataset.flag = f; } });
  $('favOnly').classList.toggle('on', favOnly); $('npOnly').classList.toggle('on', npOnly);
  const list = libRows();
  currentLibList = list;
  $('libSearchNote').textContent = libQ.trim() ? `${list.length} OF ${S.stations.length} MATCH “${libQ.trim().toUpperCase()}”` : '';
  $('libRows').innerHTML = list.slice(0, libShown).map((s, i) => rowHTML(s, i, true)).join('');
  $('libMore').hidden = list.length <= libShown;
  $('libNote').textContent = `${Math.min(list.length, libShown)} OF ${list.length} SHOWN · ${S.stations.length} IN CATALOG · POPULARITY ORDER`;
  $('libList').classList.toggle('hidden', libView !== 'list'); $('libMap').classList.toggle('hidden', libView !== 'map');
  document.querySelectorAll('.segbtn').forEach(b => b.classList.toggle('on', b.dataset.view === libView));
}
let currentLibList = [];

// ---------------------------------------------------------------- globe (LIB · MAP)
// d3 orthographic on canvas, from the design's globe.js; every station with a
// coordinate is a dot, the playing one pulses, labels at zoom, tap → card.
const G = { rot: [-10, -35], zoom: 1, down: null, pointers: new Map(), pinch: null, last: 0, land: null, raf: 0, pick: null, started: false };
function globeStations() { return S.stations.filter(s => s.geo && s.geo.length === 2); }
function globeProj(w, h) { const p = d3.geoOrthographic().rotate([G.rot[0], G.rot[1]]).fitExtent([[10, 10], [w - 10, h - 10]], { type: 'Sphere' }); return p.scale(p.scale() * G.zoom); }
function globeStart() {
  if (G.started || !window.d3) { if (!window.d3) $('globeNote').textContent = 'MAP LIBRARY NOT LOADED'; return; }
  G.started = true;
  const c = $('globe');
  // 110 m for the whole sphere, 50 m once zoomed in — coastlines and borders
  // that look like the places they are, without paying for it at zoom 1.
  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json').then(r => r.json()).then(t => { G.land = topojson.feature(t, t.objects.countries); G.borders = topojson.mesh(t, t.objects.countries, (a, b) => a !== b); }).catch(() => {});
  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json').then(r => r.json()).then(t => { G.landHi = topojson.feature(t, t.objects.countries); G.bordersHi = topojson.mesh(t, t.objects.countries, (a, b) => a !== b); }).catch(() => {});
  const pd = () => { const p = [...G.pointers.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
  c.addEventListener('pointerdown', e => { G.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (G.pointers.size === 2) { G.pinch = pd(); G.down = null; } else G.down = { x: e.clientX, y: e.clientY, moved: 0 }; c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', e => {
    if (G.pointers.has(e.pointerId)) G.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (G.pointers.size === 2 && G.pinch) { const d = pd(); G.zoom = Math.max(1, Math.min(8, G.zoom * d / G.pinch)); G.pinch = d; G.last = performance.now(); return; }
    if (!G.down) return; const k = 0.45 / G.zoom, dx = e.clientX - G.down.x, dy = e.clientY - G.down.y;
    G.down.x = e.clientX; G.down.y = e.clientY; G.down.moved += Math.abs(dx) + Math.abs(dy);
    G.rot[0] += dx * k; G.rot[1] = Math.max(-80, Math.min(80, G.rot[1] - dy * k)); G.last = performance.now();
  });
  const up = e => { G.pointers.delete(e.pointerId); if (G.pointers.size < 2) G.pinch = null; if (G.down && G.down.moved < 8) globePick(e); G.down = null; G.last = performance.now(); };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.addEventListener('wheel', e => { e.preventDefault(); G.zoom = Math.max(1, Math.min(8, G.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); }, { passive: false });
  $('zoomIn').onclick = () => { G.zoom = Math.min(8, G.zoom * 1.5); }; $('zoomOut').onclick = () => { G.zoom = Math.max(1, G.zoom / 1.5); };
  $('globeNote').textContent = `${globeStations().length} OF ${S.stations.length} STATIONS HAVE A LOCATION IN THE CATALOG · DRAG TO TURN · PINCH OR WHEEL TO ZOOM · TAP A DOT`;
  const loop = (t) => { G.raf = requestAnimationFrame(loop); if (libView === 'map' && !$('screen-lib').classList.contains('hidden')) globeDraw(t); };
  G.raf = requestAnimationFrame(loop);
}
function globePick(e) {
  const c = $('globe'), r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, p = globeProj(r.width, r.height), center = [-G.rot[0], -G.rot[1]];
  let best = null, bd = 18;
  for (const s of globeStations()) { if (d3.geoDistance([s.geo[1], s.geo[0]], center) > Math.PI / 2) continue; const [px, py] = p([s.geo[1], s.geo[0]]); const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = s; } }
  G.pick = best; renderGlobeCard();
}
function renderGlobeCard() {
  const card = $('globeCard'), s = G.pick; if (!s) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const heard = S.log.find(e => e.u === s.u);
  card.innerHTML = `<div class="row"><span class="name">${esc(s.n.toUpperCase())}</span><span class="dim">${esc(s.c)} · ${s.b || '—'} kbps${s.np ? ' · NP' : ''}</span></div>
    <div class="dim">${esc((s.g || 'unclassified').toUpperCase())} · ${esc(B.countryName(s.c).toUpperCase())}</div>
    <div class="dim">${heard ? 'heard here ' + ago(heard.at) : 'not heard on this browser yet'}</div>
    <div class="btns"><button id="gcTune">▶ TUNE</button><button id="gcFav">${S.favs.has(s.u) ? '★' : '☆'}</button><button id="gcClose">×</button></div>`;
  $('gcTune').onclick = () => { B.tuneStation(s, currentLibList); showTab('play'); };
  $('gcFav').onclick = () => { B.toggleFav(s.u); renderGlobeCard(); };
  $('gcClose').onclick = () => { G.pick = null; renderGlobeCard(); };
}
function globeDraw(t) {
  const c = $('globe'), dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
  if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
  if (!G.down && t - G.last > 3000) G.rot[0] += 0.04 / G.zoom;
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const tk = B.tokens(), p = globeProj(w, h), path = d3.geoPath(p, g), center = [-G.rot[0], -G.rot[1]];
  g.save(); g.beginPath(); path({ type: 'Sphere' }); g.fillStyle = tk.pn; g.fill(); g.strokeStyle = tk.ln; g.lineWidth = 1; g.stroke(); g.clip();
  g.beginPath(); path(d3.geoGraticule10()); g.strokeStyle = tk.ln; g.globalAlpha = 0.5; g.lineWidth = 0.5; g.stroke(); g.globalAlpha = 1;
  const land = (G.zoom >= 2.2 && G.landHi) ? G.landHi : G.land, borders = (G.zoom >= 2.2 && G.bordersHi) ? G.bordersHi : G.borders;
  if (land) {
    g.beginPath(); path(land); g.fillStyle = tk.fg; g.globalAlpha = 0.22; g.fill();
    g.globalAlpha = 0.85; g.strokeStyle = tk.dim; g.lineWidth = 0.8; g.stroke();          // coastlines
    if (borders) { g.beginPath(); path(borders); g.globalAlpha = 0.45; g.lineWidth = 0.5; g.stroke(); }   // inland borders, quieter
    g.globalAlpha = 1;
  }
  const cur = B.current(), curU = cur && S.playing ? cur.u : null;
  const labels = [];
  for (const s of globeStations()) {
    const lon = s.geo[1], lat = s.geo[0];
    if (d3.geoDistance([lon, lat], center) > Math.PI / 2) continue;
    const [px, py] = p([lon, lat]);
    if (s.u === curU) { const pulse = 6 + 3 * Math.sin(t / 300); g.beginPath(); g.arc(px, py, pulse, 0, 7); g.strokeStyle = tk.acc; g.lineWidth = 1.5; g.stroke(); g.fillStyle = tk.acc; }
    else g.fillStyle = s.np ? tk.ok : tk.dim;
    const r = G.pick && G.pick.u === s.u ? 4 : 2.5;
    g.fillRect(px - r, py - r, 2 * r, 2 * r);
    if (G.zoom > 3 && labels.length < 60) labels.push([px + 8, py + 3, s.n]);
  }
  if (labels.length) { g.font = '10px "JetBrains Mono",monospace'; g.fillStyle = tk.fg; const taken = []; for (const [x, y, n] of labels) { if (taken.some(([tx, ty]) => Math.abs(tx - x) < 90 && Math.abs(ty - y) < 12)) continue; taken.push([x, y]); g.fillText(n, x, y); } }
  g.restore();
}
function ago(at) { const m = Math.round((Date.now() - at) / 60000); if (m < 60) return m + ' min ago'; const hh = Math.round(m / 60); if (hh < 48) return hh + ' h ago'; return Math.round(hh / 24) + ' days ago'; }

// ================================================================ FIND
let FIND = null, findQ = '', findTimer = 0;
const watchlist = new Set(B.store.get('watch', ['ED SHEERAN', 'DEPECHE MODE', 'TAYLOR SWIFT']));
function normKey(name) {
  let t = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  t = t.split(/\s+(?:feat\.?|ft\.?|featuring|vs\.?|&|with)\s+/)[0];
  t = t.replace(/[\(\[].*?[\)\]]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').trim().replace(/\s+/g, ' ');
  return t.startsWith('the ') ? t.slice(4) : t;
}
function editDistance(a, b, limit) {
  if (a === b) return 0; if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev2 = new Array(b.length + 1).fill(0), prev = Array.from({ length: b.length + 1 }, (_, j) => j), cur = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i; let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      cur[j] = d; rowMin = Math.min(rowMin, d);
    }
    if (rowMin > limit) return limit + 1; [prev2, prev, cur] = [prev, cur, prev2];
  }
  return prev[b.length];
}
function nearMatches(key, limit = 6) {
  if (key.length < 3) return [];
  const words = new Set(key.split(' ').filter(w => w.length >= 4)), budget = key.length >= 8 ? 2 : 1, scored = [];
  for (const a of FIND.a) {
    const k = a[0]; if (k === key) continue; let score = 0;
    if (k.includes(key)) score = 3;
    else if (Math.abs(k.length - key.length) <= budget && editDistance(key, k, budget) <= budget) score = 3;
    else if (k.length >= 4 && key.includes(k)) score = 2;
    else if (words.size && k.split(' ').some(w => words.has(w))) score = 1;
    if (score) scored.push([a, score, a[2].reduce((s, h) => s + h[1], 0)]);
  }
  return scored.sort((x, y) => y[1] - x[1] || y[2] - x[2]).slice(0, limit).map(x => x[0]);
}
function findStation(idx) { const r = FIND.s[idx]; return r ? { n: r[0], c: r[1], b: r[2], g: r[3], np: r[4], u: r[5] } : null; }
function broadest(limit) { const per = new Map(); for (const a of FIND.a) for (const h of a[2]) per.set(h[0], (per.get(h[0]) || 0) + 1); return [...per].sort((x, y) => y[1] - x[1] || x[0] - y[0]).slice(0, limit); }
function stationRowHTML(st, reason, i) {
  return `<li class="sug" data-u="${esc(st.u)}"><div class="row" style="display:flex;justify-content:space-between;gap:8px"><span class="name" style="flex:1">${esc(st.n)}</span><span class="meta">${esc(st.c || '—')} · ${st.b || '—'}k</span></div>
    <span class="reason">${esc(reason)}</span><span class="reason">tags: ${esc(st.g || '—')}</span><div style="display:flex;justify-content:flex-end"><button class="tune" data-tune="${esc(st.u)}">TUNE</button></div></li>`;
}
function renderFind() {
  if (!FIND) { $('findScope').textContent = 'LOADING INDEX…'; return; }
  $('findScope').textContent = `INDEX ${FIND.s.length} STATIONS / ${FIND.r} SCANS · ${FIND.a.length} ARTISTS · ${watchlist.size} ON WATCHLIST`;
  const q = findQ.trim().toUpperCase(), body = $('findBody');
  if (!q) {
    body.innerHTML = `<div class="label">WATCHLIST — ${watchlist.size} ARTISTS</div>` + [...watchlist].map(n => `<div class="watch"><span class="name">${esc(n)}</span><span class="st">IN INDEX · ${(FIND.a.find(a => a[0] === normKey(n)) || [0, 0, []])[2].length} STATIONS</span><button class="chip" data-unwatch="${esc(n)}">×</button></div>`).join('')
      + `<div class="note dim">Watching here means "remember the name": the live watch — hopping when a station announces the artist — needs stream titles, which browsers do not expose. The iOS app does it.</div>`;
    return;
  }
  const key = normKey(q), artist = FIND.a.find(a => a[0] === key);
  let html = `<div class="label">● ON AIR NOW — 0</div><div class="note dim">live matching needs stream titles — the iOS app reads them, a browser cannot</div>`;
  html += `<button class="chip acc" data-watch="${esc(q)}">${watchlist.has(q) ? '✓ WATCHING' : '+ WATCH'} “${esc(q)}”</button>`;
  if (artist && artist[2].length) {
    const rot = artist[2].filter(h => h[1] > 1), once = artist[2].filter(h => h[1] <= 1);
    html += `<div class="label">IN ROTATION — ${rot.length} STATIONS · caught ${esc(artist[1])} on more than one scan</div><ol class="rows">` + rot.map((h, i) => { const st = findStation(h[0]); return st ? stationRowHTML(st, `seen playing ${artist[1]} · ${h[1]} plays${h[2] ? ' · publishes now-playing' : ''}`, i) : ''; }).join('') + '</ol>';
    if (once.length) html += `<div class="label">SEEN ONCE — ${once.length} STATIONS</div><ol class="rows">` + once.map((h, i) => { const st = findStation(h[0]); return st ? stationRowHTML(st, `seen playing ${artist[1]} once`, i) : ''; }).join('') + '</ol>';
  } else {
    const near = nearMatches(key), rows = [], seen = new Set();
    for (const a of near) { for (const h of [...a[2]].sort((x, y) => y[1] - x[1])) { if (rows.length >= 3 || seen.has(h[0])) continue; const st = findStation(h[0]); if (!st) continue; seen.add(h[0]); rows.push(stationRowHTML(st, `seen playing ${a[1]}`, rows.length)); } if (rows.length >= 3) break; }
    if (rows.length < 3) for (const [idx, n] of broadest(12)) { if (rows.length >= 3 || seen.has(idx)) continue; const st = findStation(idx); if (!st) continue; seen.add(idx); rows.push(stationRowHTML(st, `${n} artists indexed here`, rows.length)); }
    html += `<div class="zero"><div class="big">0</div><div class="tier">LIVE   0 of 0 station being read\nINDEX  0 of ${FIND.a.length} artists across ${FIND.s.length} stations, ${FIND.r} scans</div><div class="msg">No station in the index has been seen playing <span class="acc">${esc(q)}</span>.</div><div class="note dim">The index is young: ${FIND.r} scans of ${FIND.s.length} stations. It only knows what it heard, so a station that has never been caught playing them is not a station that never plays them.</div></div>`;
    html += `<div class="label">CLOSE ON THE DIAL — ${near.length ? 'NEAR MATCHES IN THE INDEX' : 'WHERE BLARE CATCHES THE MOST'}</div><ol class="rows">${rows.join('')}</ol>`;
  }
  body.innerHTML = html;
}

// ================================================================ MIX
let mixReason = '', mixFilter = B.store.get('mixfilter', { genre: null, country: null }), mixOpen = false, mixLog = B.store.get('mixlog', []);
function mixHop() {
  const cur = B.current(), others = S.stations.filter(s => !cur || s.u !== cur.u);
  const favs = S.stations.filter(s => S.favs.has(s.u));
  const likedG = new Set(favs.flatMap(s => (s.g || '').split('/').filter(Boolean))), likedC = new Set(favs.map(s => s.c).filter(Boolean));
  let pool, reason;
  // MIX's own filter when set; otherwise LIB's current chips — genre AND country.
  const fromLib = !mixFilter.genre && !mixFilter.country && (genre || country);
  const f = fromLib ? { genre, country } : mixFilter, label = [f.genre && f.genre.toUpperCase(), f.country && B.countryName(f.country).toUpperCase()].filter(Boolean).join(' · ');
  if (f.genre || f.country) {
    const m = (s, g, c) => (!g || !f.genre || (s.g || '').split('/').includes(f.genre)) && (!c || !f.country || s.c === f.country);
    const both = others.filter(s => m(s, 1, 1)), go = others.filter(s => m(s, 1, 0)), co = others.filter(s => m(s, 0, 1));
    if (both.length) { pool = both; reason = `random from ${both.length} ${label} stations${fromLib ? " (LIB's filter)" : ''}`; }
    else if (f.genre && go.length) { pool = go; reason = `no ${label} station in the catalog — random from ${go.length} ${f.genre.toUpperCase()} stations anywhere`; }
    else if (f.country && co.length) { pool = co; reason = `no ${label} station in the catalog — random from ${co.length} in ${B.countryName(f.country).toUpperCase()}`; }
    else { pool = others; reason = `nothing in the catalog matches ${label} — random from all ${others.length}`; }
  } else {
    pool = others.filter(s => (!likedG.size && !likedC.size) || (s.g || '').split('/').some(g => likedG.has(g)) || likedC.has(s.c));
    if (!pool.length) pool = others;
    reason = favs.length ? `matched on your ${favs.length} starred station${favs.length === 1 ? '' : 's'}` : `picked at random from ${S.stations.length} stations — star a few and MIX will use your taste`;
  }
  const pick = pool[Math.floor(Math.random() * pool.length)]; if (!pick) return;
  mixReason = reason; B.tuneStation(pick, [pick]);
  mixLog.unshift({ t: new Date().toTimeString().slice(0, 5), msg: `hopped to ${pick.n.toUpperCase()} — ${reason}`, tag: f.genre || f.country ? 'FILTER' : (favs.length ? 'TASTE' : 'RANDOM') });
  mixLog = mixLog.slice(0, 50); B.store.set('mixlog', mixLog); renderMix();
}
function renderMix() {
  if (!taxonomy) buildTaxonomy();
  const st = B.current(), on = S.playing;
  const fromLib = !mixFilter.genre && !mixFilter.country && (genre || country);
  const f = fromLib ? { genre, country } : mixFilter;
  const label = (fromLib ? 'FROM LIB · ' : '') + [f.genre && f.genre.toUpperCase(), f.country && B.countryName(f.country).toUpperCase()].filter(Boolean).join(' · ');
  const why = !st ? 'Nothing is playing yet. Hit START A MIX and BLARE will pick a station.' : (mixReason ? `MIX picked this one — ${mixReason}.` : 'You tuned this one yourself. Hit HOP and MIX will pick the next.');
  const chip = (v, l, on) => `<button class="chip ${on ? 'on' : ''}" data-v="${esc(v)}">${esc(l)}</button>`;
  $('mixPanel').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span class="tag">MIX ∞ ${st ? 'ON' : 'READY'}</span><span class="dim" style="font-size:11px;border:1px solid var(--ln);padding:8px">NO LIVE WATCH</span></div>
    <div class="track">${esc(st && on ? st.n : 'NOTHING PLAYING')}</div>
    <div class="dim" style="font-size:12px">on <span style="color:var(--fg)">${esc(st ? st.n.toUpperCase() : '—')}</span> · ${st ? esc((st.g || 'unfiled').toLowerCase()) + ' · ' + (mixReason ? 'picked by MIX' : 'tuned by hand') : 'no station tuned'}</div>
    <div class="why"><div class="label" style="margin-bottom:4px">WHY THIS STATION</div>${esc(why)}</div>
    <div class="filter ${label ? 'on' : ''}" id="mixFilterRow"><span>${mixOpen ? '▾' : '▸'}</span><span>FILTER · ${label || 'ANY'}</span><span style="flex:1"></span>${label ? '<span>random inside the filter · taste off</span>' : ''}</div>
    ${mixOpen ? `${fromLib ? '<div class="note dim">taken from LIB\'s chips · pick here to override, or clear LIB\'s filter</div>' : ''}<div class="label">GENRE</div><div class="chips wrap" id="mixG">${chip('', 'ALL', !mixFilter.genre)}${taxonomy.genres.slice(0, 14).map(([g]) => chip(g, g.toUpperCase(), mixFilter.genre === g)).join('')}</div>
    <div class="label">COUNTRY</div><div class="chips wrap" id="mixC">${chip('', 'ALL', !mixFilter.country)}${taxonomy.countries.slice(0, 12).map(([c]) => chip(c, B.countryName(c).toUpperCase(), mixFilter.country === c).replace('class="chip', `class="chip flagged" data-flag="${flag(c)}`)).join('')}</div>` : ''}
    <button class="hop" id="hopBtn">${st ? 'HOP TO ANOTHER ▸▸' : 'START A MIX ▸▸'}</button>`;
  $('hopBtn').onclick = mixHop;
  $('mixFilterRow').onclick = () => { mixOpen = !mixOpen; renderMix(); };
  if (mixOpen) {
    $('mixG').querySelectorAll('.chip').forEach(b => b.onclick = () => { mixFilter.genre = b.dataset.v || null; B.store.set('mixfilter', mixFilter); renderMix(); });
    $('mixC').querySelectorAll('.chip').forEach(b => b.onclick = () => { mixFilter.country = b.dataset.v || null; B.store.set('mixfilter', mixFilter); renderMix(); });
  }
  $('mixLog').innerHTML = mixLog.length ? mixLog.map(e => `<li style="cursor:default"><span class="idx">${esc(e.t)}</span><span class="name" style="text-transform:none;font-weight:400">${esc(e.msg)}</span><span class="meta ${e.tag === 'FILTER' ? 'acc2' : e.tag === 'TASTE' ? 'ok' : 'dim'}">${e.tag}</span></li>`).join('') : '<li style="cursor:default"><span class="dim">NOTHING LOGGED YET — hops appear here with the rule that made them</span></li>';
}

// ================================================================ HIST
function renderHist() {
  const week = Date.now() - 7 * 86400000, log = S.log.filter(e => e.at > week);
  $('histRows').innerHTML = log.length ? log.map((e, i) => { const st = S.byUrl.get(e.u); return `<li data-u="${esc(e.u)}"><span class="idx">${esc(new Date(e.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }))}</span><span class="name">${esc(e.n)}${st ? `<span class="sub">${esc((st.g || 'unclassified').toUpperCase())} · ${esc(st.c)}</span>` : ''}</span><button class="fav ${S.favs.has(e.u) ? 'on' : ''}" data-fav="${esc(e.u)}">${S.favs.has(e.u) ? '★' : '☆'}</button></li>`; }).join('')
    : '<li style="cursor:default"><span class="dim">NOTHING LOGGED YET — stations you play appear here for seven days</span></li>';
}

// ================================================================ SET
const GENERATORS = ['neon', 'pastel', 'paper', 'mono', 'random'];
function hslHex(h, sp, l) { h = ((h % 360) + 360) % 360; sp /= 100; l /= 100; const a = sp * Math.min(l, 1 - l); const f = (k) => { k = (k + h / 30) % 12; const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); }; return '#' + f(0) + f(8) + f(4); }
function genTheme(kind) {
  const h = Math.random() * 360, r = Math.random; let c;
  if (kind === 'neon') c = { bg: hslHex(h, 30, 7), fg: hslHex(h, 15, 88), acc: hslHex(h + 180 + r() * 60, 95, 62), ok: hslHex(150, 85, 55), warn: hslHex(55, 95, 58), err: hslHex(330, 95, 62) };
  else if (kind === 'pastel') c = { bg: hslHex(h, 30, 93), fg: hslHex(h, 25, 25), acc: hslHex(h + 120, 50, 52), ok: hslHex(140, 40, 42), warn: hslHex(40, 55, 48), err: hslHex(355, 50, 52) };
  else if (kind === 'paper') { const hp = 40 + r() * 20; c = { bg: hslHex(hp, 25, 92), fg: hslHex(hp, 30, 18), acc: hslHex(15 + r() * 25, 60, 40), ok: hslHex(120, 30, 34), warn: hslHex(38, 70, 40), err: hslHex(0, 55, 44) }; }
  else if (kind === 'mono') c = { bg: hslHex(h, 6, 8), fg: hslHex(h, 8, 85), acc: hslHex(h, 12, 70), ok: hslHex(140, 18, 60), warn: hslHex(45, 22, 60), err: hslHex(0, 25, 60) };
  else { const dark = r() < 0.7; c = { bg: hslHex(h, 22, dark ? 9 : 94), fg: hslHex(h, 18, dark ? 86 : 18), acc: hslHex(h + 140 + r() * 80, 68, dark ? 66 : 42), ok: hslHex(135 + r() * 25, 45, dark ? 62 : 38), warn: hslHex(38 + r() * 14, 70, dark ? 64 : 42), err: hslHex(350 + r() * 15, 65, dark ? 66 : 42) }; }
  S.custom = c; S.theme = 'custom'; B.store.set('custom', c); B.store.set('theme', 'custom'); B.applyTheme(); renderSet();
}
const KEY_ORDER = ['bg0', 'bg', 'pn', 'fg', 'dim', 'ln', 'acc', 'acc2', 'ok', 'warn', 'err'];
function encodeTheme() { const t = B.tokens(); return 'BLARE-T:' + btoa(JSON.stringify(Object.fromEntries(KEY_ORDER.map(k => [k, t[k]])))); }
function encodeList(indices) { return 'BLARE-L:' + btoa(JSON.stringify(indices)); }
function importCode(raw) {
  const code = raw.trim();
  try {
    if (code.startsWith('BLARE-T:')) { const t = JSON.parse(atob(code.slice(8))); if (!KEY_ORDER.every(k => /^#[0-9a-fA-F]{6}$/.test(t[k] || ''))) throw 0; B.THEMES.push({ id: 'imported-' + Date.now(), name: 'IMPORTED', v: t }); S.theme = B.THEMES[B.THEMES.length - 1].id; B.store.set('theme', S.theme); B.applyTheme(); renderSet(); return 'THEME IMPORTED'; }
    if (code.startsWith('BLARE-L:')) { const l = JSON.parse(atob(code.slice(8))); if (!Array.isArray(l)) throw 0; let n = 0; for (const i of l) { const st = S.stations[i]; if (st && !S.favs.has(st.u)) { S.favs.add(st.u); n++; } } B.store.set('favs', [...S.favs]); B.rebuildQueue(); render(); return `${n} STATIONS STARRED FROM THE CODE`; }
  } catch (e) { return 'CODE IS CORRUPT'; }
  return 'INVALID CODE — expected BLARE-T: or BLARE-L:';
}
function copy(text) { try { navigator.clipboard.writeText(text); } catch (e) {} }
function renderSet() {
  $('themes').innerHTML = B.THEMES.map(t => `<button class="theme ${t.id === S.theme ? 'on' : ''}" data-id="${t.id}"><span class="sw">${['bg', 'acc', 'ok', 'warn', 'err'].map(k => `<i style="background:${t.v[k]}"></i>`).join('')}</span>${esc(t.name)}</button>`).join('')
    + (S.custom ? `<button class="theme ${S.theme === 'custom' ? 'on' : ''}" data-id="custom"><span class="sw">${['bg', 'acc', 'ok', 'warn', 'err'].map(k => `<i style="background:${S.custom[k]}"></i>`).join('')}</span>CUSTOM</button>` : '');
  document.querySelectorAll('.theme').forEach(b => b.onclick = () => { S.theme = b.dataset.id; B.store.set('theme', S.theme); B.applyTheme(); renderSet(); });
  $('genChips').innerHTML = GENERATORS.map(g => `<button class="chip" data-g="${g}">${g.toUpperCase()}</button>`).join('');
  $('genChips').querySelectorAll('.chip').forEach(b => b.onclick = () => genTheme(b.dataset.g));
  const c = S.custom || { bg: '#101418', fg: '#d8dee9', acc: '#5ee2b7', ok: '#8fd67a', warn: '#e2c25e', err: '#e25e7a' };
  $('customEditor').innerHTML = ['bg', 'fg', 'acc', 'ok', 'warn', 'err'].map(k => `<label>${k.toUpperCase()}<input type="color" data-k="${k}" value="${c[k]}"></label>`).join('');
  $('customEditor').querySelectorAll('input').forEach(inp => inp.oninput = () => { const cc = Object.assign({}, c); cc[inp.dataset.k] = inp.value; S.custom = cc; S.theme = 'custom'; B.store.set('custom', cc); B.store.set('theme', 'custom'); B.applyTheme(); });
  $('patternChips').innerHTML = '<span class="label">PATTERN</span>' + Object.keys(B.PATTERNS).map(p => `<button class="chip ${p === S.pattern ? 'on' : ''}" data-p="${p}">${p.toUpperCase()}</button>`).join('');
  $('patternChips').querySelectorAll('.chip').forEach(b => b.onclick = () => { S.pattern = b.dataset.p; B.store.set('pattern', S.pattern); B.applyTheme(); });
  $('footer').innerHTML = `BLARE WEB · ${S.stations.length.toLocaleString()} in catalog · ${S.favs.size} starred · ICY/HLS<br>Same player as the iOS app. Spectrum is an FFT of the stream you hear, read in the browser.<br>JetBrains Mono · SIL Open Font License 1.1<br>Station directory built from Radio Browser<div class="footer-links"><a href="privacy.html">PRIVACY</a><a href="terms.html">TERMS</a><a href="support.html">SUPPORT</a></div>`;
}

// ================================================================ stage (landscape)
const LS = B.store.get('ls', { spec: 'dim', scrim: true, title: 'M', controls: true });
function renderStageOpts() {
  const row = (title, opts, cur, set) => `<div><div class="label">${title}</div><div class="chips wrap">${opts.map(([v, l]) => `<button class="chip ${String(v) === String(cur) ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div></div>`;
  $('stageOpts').innerHTML = row('PATTERN', B.MODES.map(m => [m, m.toUpperCase()]), S.mode) + row('PATTERN STRENGTH', [['dim', 'DIM'], ['full', 'FULL']], LS.spec) + row('SCRIM (READABILITY)', [['true', 'ON'], ['false', 'OFF']], LS.scrim) + row('TITLE SIZE', [['M', 'M'], ['XL', 'XL']], LS.title) + row('CONTROLS', [['true', 'SHOW'], ['false', 'HIDE']], LS.controls);
  const groups = $('stageOpts').children;
  groups[0].querySelectorAll('.chip').forEach(b => b.onclick = () => { B.setMode(b.dataset.v); renderStageOpts(); });
  groups[1].querySelectorAll('.chip').forEach(b => b.onclick = () => { LS.spec = b.dataset.v; saveLS(); });
  groups[2].querySelectorAll('.chip').forEach(b => b.onclick = () => { LS.scrim = b.dataset.v === 'true'; saveLS(); });
  groups[3].querySelectorAll('.chip').forEach(b => b.onclick = () => { LS.title = b.dataset.v; saveLS(); });
  groups[4].querySelectorAll('.chip').forEach(b => b.onclick = () => { LS.controls = b.dataset.v === 'true'; saveLS(); });
}
function saveLS() { B.store.set('ls', LS); applyLS(); renderStageOpts(); }
function applyLS() { const st = $('stage'); st.classList.toggle('xl', LS.title === 'XL'); st.classList.toggle('no-scrim', !LS.scrim); st.classList.toggle('no-controls', !LS.controls); $('stageSpec').style.opacity = LS.spec === 'dim' ? 0.55 : 1; }
function showStage(on) { $('stage').classList.toggle('hidden', !on); if (on) { applyLS(); renderStageOpts(); } }

// ================================================================ wiring
function render() { renderPlay(); if (!$('screen-lib').classList.contains('hidden')) renderLib(); if (!$('screen-hist').classList.contains('hidden')) renderHist(); if (!$('screen-mix').classList.contains('hidden')) renderMix(); }
function wire() {
  $('playBtn').onclick = B.toggle; $('sPlay').onclick = B.toggle; $('prevBtn').onclick = B.prev; $('sPrev').onclick = B.prev; $('nextBtn').onclick = B.next; $('sNext').onclick = B.next;
  $('starBtn').onclick = () => { const st = B.current(); if (st) B.toggleFav(st.u); };
  $('openAll').onclick = () => { expanded = !expanded; renderPlay(); };
  $('libBtn').onclick = () => showTab('lib');
  $('vol').oninput = (e) => B.setVolume(+e.target.value);
  $('visSegs').onclick = (e) => { const m = e.target.dataset.m; if (m) B.setMode(m); };
  $('themeBtn').onclick = () => { const i = B.THEMES.findIndex(t => t.id === S.theme); S.theme = B.THEMES[(i + 1) % B.THEMES.length].id; B.store.set('theme', S.theme); B.applyTheme(); renderSet(); };
  $('settingsBtn').onclick = () => { showTab('set'); renderSet(); };
  $('stageBtn').onclick = () => showStage(true); $('sExit').onclick = () => showStage(false); $('sOpts').onclick = () => $('stageOpts').classList.toggle('hidden');
  $('q').oninput = (e) => { libQ = e.target.value; libShown = 60; renderLib(); };
  $('favOnly').onclick = () => { favOnly = !favOnly; renderLib(); }; $('npOnly').onclick = () => { npOnly = !npOnly; renderLib(); };
  $('libMore').onclick = () => { libShown += 60; renderLib(); };
  document.querySelectorAll('.segbtn').forEach(b => b.onclick = () => { libView = b.dataset.view; renderLib(); if (libView === 'map') globeStart(); });
  $('findQ').oninput = (e) => { findQ = e.target.value; clearTimeout(findTimer); findTimer = setTimeout(renderFind, 200); };
  $('findBody').onclick = (e) => {
    const w = e.target.closest('[data-watch]'); if (w) { const n = w.dataset.watch; if (watchlist.has(n)) watchlist.delete(n); else watchlist.add(n); B.store.set('watch', [...watchlist]); renderFind(); return; }
    const uw = e.target.closest('[data-unwatch]'); if (uw) { watchlist.delete(uw.dataset.unwatch); B.store.set('watch', [...watchlist]); renderFind(); return; }
    const t = e.target.closest('[data-tune]'); if (t) { const st = S.byUrl.get(t.dataset.tune); if (st) { B.tuneStation(st, [st]); showTab('play'); } }
  };
  $('histClear').onclick = () => { S.log = []; B.store.set('log', []); renderHist(); };
  $('histExport').onclick = () => { const idx = S.log.map(e => S.byUrl.get(e.u)).filter(Boolean).map(s => s.i); copy(encodeList(idx)); $('histMsg').textContent = `COPIED ▸ BLARE-L code with ${idx.length} stations`; };
  $('copyTheme').onclick = () => { const c = encodeTheme(); copy(c); $('shareMsg').textContent = 'COPIED ▸ ' + c.slice(0, 28) + '…'; };
  $('copyList').onclick = () => { const idx = S.stations.filter(s => S.favs.has(s.u)).map(s => s.i); const c = encodeList(idx); copy(c); $('shareMsg').textContent = `COPIED ▸ ${idx.length} starred stations · ${c.slice(0, 20)}…`; };
  $('importBtn').onclick = () => { $('shareMsg').textContent = importCode($('importCode').value); };
  $('scanlines').onclick = () => { S.scan = !S.scan; B.store.set('scan', S.scan); B.applyTheme(); };
  $('analyseToggle').onclick = () => { S.analyse = !S.analyse; B.store.set('analyse', S.analyse); renderPlay(); };
  document.querySelectorAll('[data-density]').forEach(b => b.onclick = () => { S.density = b.dataset.density; B.store.set('density', S.density); B.applyTheme(); });
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  const rowClick = (list) => (e) => {
    const fav = e.target.closest('[data-fav]'); if (fav) { e.stopPropagation(); B.toggleFav(fav.dataset.fav); render(); return; }
    const li = e.target.closest('li[data-u]'); if (!li) return; const st = S.byUrl.get(li.dataset.u); if (!st) return;
    B.tuneStation(st, list()); showTab('play');
  };
  $('rows').onclick = rowClick(() => S.queue); $('libRows').onclick = rowClick(() => currentLibList); $('histRows').onclick = rowClick(() => S.log.map(e => S.byUrl.get(e.u)).filter(Boolean));
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); B.toggle(); }
    if (e.key === 'ArrowRight') B.next(); if (e.key === 'ArrowLeft') B.prev();
    if (e.key === 'v') B.setMode(B.MODES[(B.MODES.indexOf(S.mode) + 1) % B.MODES.length]);
    if (e.key === 'Escape') showStage(false);
  });
  B.on(render); B.frameHooks.add(perFrame);
}

async function boot() {
  loadAds(); B.applyTheme(); wire(); renderSet();
  try {
    const [cat, idx] = await Promise.all([fetch('catalog.json').then(r => r.json()), fetch('find.json').then(r => r.json()).catch(() => null)]);
    S.stations = cat.stations.map(B.stationFromRow); S.byUrl = new Map(S.stations.map(s => [s.u, s])); FIND = idx;
  } catch (e) { $('stationName').textContent = 'CATALOG FAILED TO LOAD'; }
  B.rebuildQueue();
  const last = B.store.get('last', null), i = last ? S.queue.findIndex(s => s.u === last) : 0;
  if (S.queue.length) B.tune(Math.max(0, i), false);
  render(); renderSet(); showTab('play'); B.start();
}
boot();
