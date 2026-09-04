(() => {
/* Blare web player.
 *
 * ONE RULE ABOVE THE REST, inherited from the iOS app: the interface never
 * implies a capability that does not exist. So:
 *   - the spectrum is an FFT of the audio you hear, or it says it is not;
 *   - a station whose server blocks cross-origin reads gets a GENERATED
 *     pattern, capped below full height, captioned as generated;
 *   - the title line shows the station, because browsers do not expose ICY
 *     stream tags, and says nothing about the song.
 *
 * The engine below is a port of the app's: StreamAnalyzer (log bands to
 * 16 kHz, pink tilt, dB) → SpectrumMonitor (each band drawn as its deviation
 * from its own running average) → ReedField (a spring lattice with heat,
 * ghost and peak markers) → SpectrumRenderer (matrix, bars, mirror, dots,
 * scope, ascii). Constants are the app's, chosen there by measurement.
 */
'use strict';

// ---------------------------------------------------------------- themes
const THEMES = [
  // The look on the owner's phone: near-black, green, yellow, pink.
  {id:'blare', name:'BLARE', v:{bg0:'#0b0a10',bg:'#151320',pn:'#1b1824',fg:'#ececf1',dim:'#8a8a95',ln:'#2e2b38',acc:'#3dff7f',acc2:'#ffd400',ok:'#3dff7f',warn:'#ffd400',err:'#ff3d9a'}},
  {id:'tokyo', name:'TOKYO NIGHT', v:{bg0:'#13141c',bg:'#1a1b26',pn:'#1f2335',fg:'#c0caf5',dim:'#565f89',ln:'#3b4261',acc:'#7aa2f7',acc2:'#bb9af7',ok:'#9ece6a',warn:'#e0af68',err:'#f7768e'}},
  {id:'gruvbox', name:'GRUVBOX', v:{bg0:'#1d2021',bg:'#282828',pn:'#3c3836',fg:'#ebdbb2',dim:'#928374',ln:'#504945',acc:'#fabd2f',acc2:'#fe8019',ok:'#b8bb26',warn:'#fabd2f',err:'#fb4934'}},
  {id:'latte', name:'CATPPUCCIN', v:{bg0:'#dce0e8',bg:'#eff1f5',pn:'#e6e9ef',fg:'#4c4f69',dim:'#8c8fa1',ln:'#bcc0cc',acc:'#1e66f5',acc2:'#8839ef',ok:'#40a02b',warn:'#df8e1d',err:'#d20f39'}},
  {id:'forest', name:'EVERFOREST', v:{bg0:'#232a2e',bg:'#2d353b',pn:'#343f44',fg:'#d3c6aa',dim:'#859289',ln:'#475258',acc:'#a7c080',acc2:'#83c092',ok:'#a7c080',warn:'#dbbc7f',err:'#e67e80'}},
  {id:'nord', name:'NORD', v:{bg0:'#272c36',bg:'#2e3440',pn:'#3b4252',fg:'#eceff4',dim:'#7b88a1',ln:'#434c5e',acc:'#88c0d0',acc2:'#81a1c1',ok:'#a3be8c',warn:'#ebcb8b',err:'#bf616a'}},
  {id:'kanagawa', name:'KANAGAWA', v:{bg0:'#16161d',bg:'#1f1f28',pn:'#2a2a37',fg:'#dcd7ba',dim:'#727169',ln:'#363646',acc:'#7e9cd8',acc2:'#957fb8',ok:'#98bb6c',warn:'#e6c384',err:'#c34043'}},
  {id:'dawn', name:'ROSÉ PINE DAWN', v:{bg0:'#f2e9e1',bg:'#faf4ed',pn:'#fffaf3',fg:'#575279',dim:'#9893a5',ln:'#dfdad9',acc:'#d7827e',acc2:'#907aa9',ok:'#56949f',warn:'#ea9d34',err:'#b4637a'}},
  {id:'matte', name:'MATTE BLACK', v:{bg0:'#050505',bg:'#0e0e0e',pn:'#161616',fg:'#e6e6e6',dim:'#6f6f6f',ln:'#2a2a2a',acc:'#d9a057',acc2:'#a8a8a8',ok:'#9fbf78',warn:'#d9a057',err:'#c96a5a'}},
  {id:'osaka', name:'MIDNIGHT OSAKA', v:{bg0:'#0f1117',bg:'#161a22',pn:'#1c212c',fg:'#c9d4e3',dim:'#5c6b82',ln:'#2c3648',acc:'#62d2ff',acc2:'#c792ea',ok:'#7fd88f',warn:'#ffcb6b',err:'#ff6d7e'}},
  {id:'papertape', name:'PAPER TAPE', v:{bg0:'#d9d2c2',bg:'#efe9db',pn:'#e4ddcc',fg:'#3f3a2e',dim:'#8d8672',ln:'#c8c0ab',acc:'#b3591f',acc2:'#6f5b8e',ok:'#5c7f3c',warn:'#a67816',err:'#a8402f'}},
  {id:'ember', name:'EMBER', v:{bg0:'#120c0a',bg:'#1a120e',pn:'#241813',fg:'#e8d5c4',dim:'#8a6f5c',ln:'#3a2a20',acc:'#ff8a4c',acc2:'#e2b04a',ok:'#a8c07c',warn:'#e2b04a',err:'#e25b4c'}},
  {id:'signal', name:'SIGNAL BLUE', v:{bg0:'#0a0f1e',bg:'#0e1528',pn:'#141d36',fg:'#d2dcf2',dim:'#5a6a94',ln:'#243052',acc:'#3f7cff',acc2:'#8fb0ff',ok:'#54d0a0',warn:'#f0c060',err:'#f0608a'}},
];

// ---------------------------------------------------------------- storage
const store = {
  get(k, d) { try { const v = localStorage.getItem('blare-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('blare-' + k, JSON.stringify(v)); } catch (e) {} },
};

// ---------------------------------------------------------------- analyzer (StreamAnalyzer port)
const BAND_COUNT = 16, TOP_HZ = 16000, FLOOR_DB = -70, TILT_EXP = 0.5;
class Analyzer {
  constructor(ctx, node) {
    this.node = node; this.node.fftSize = 2048; this.node.smoothingTimeConstant = 0;
    this.half = this.node.frequencyBinCount;
    this.buf = new Float32Array(this.half);
    this.binWidth = ctx.sampleRate / this.node.fftSize;
    // THE TOP OF THE SCALE IS 16 kHz, NOT NYQUIST: a 128 kbps stream is
    // low-passed by its encoder there, and columns above it never move.
    this.topBin = Math.max(BAND_COUNT + 1, Math.min(this.half, Math.floor(TOP_HZ / this.binWidth)));
    this.bands = new Float64Array(BAND_COUNT).fill(FLOOR_DB);
    this.frames = 0;
  }
  read() {
    this.node.getFloatFrequencyData(this.buf);
    if (!isFinite(this.buf[10])) return false;   // graph not producing yet
    let any = false;
    for (let b = 0; b < BAND_COUNT; b++) {
      const lo = Math.floor(Math.pow(this.topBin, b / BAND_COUNT));
      const hi = Math.max(lo + 1, Math.floor(Math.pow(this.topBin, (b + 1) / BAND_COUNT)));
      const loBin = Math.min(lo, this.topBin - 1), hiBin = Math.min(hi, this.topBin);
      let sum = 0, n = 0;
      for (let i = loBin; i < hiBin; i++) { sum += Math.pow(10, this.buf[i] / 20); n++; }
      const mean = n ? sum / n : 0;
      const centreHz = Math.max(this.binWidth, (loBin + hiBin) / 2 * this.binWidth);
      const value = mean * Math.pow(centreHz / 1000, TILT_EXP);
      const db = value > 0 ? Math.max(FLOOR_DB, 20 * Math.log10(value)) : FLOOR_DB;
      if (db > FLOOR_DB + 1) any = true;
      this.bands[b] = db;
    }
    this.frames++;
    return any;
  }
}

// ---------------------------------------------------------------- monitor (SpectrumMonitor port)
// A band draws at exactly the middle of the panel when it sits at its own
// running average; ±deviationDB fills or empties it. Symmetric EMA 0.004.
const DEVIATION_DB = 10, TILT_LIMIT_DB = 24, EMA = 0.004, COLS = 28, REST = 0.03;
class Monitor {
  constructor() { this.ref = null; this.levels = new Float64Array(COLS).fill(REST); }
  reset() { this.ref = null; }
  push(bands) {
    if (!this.ref) this.ref = Float64Array.from(bands);
    else for (let i = 0; i < BAND_COUNT; i++) this.ref[i] += (bands[i] - this.ref[i]) * EMA;
    let reference = -Infinity;
    for (let i = 0; i < BAND_COUNT; i++) reference = Math.max(reference, this.ref[i]);
    const t = new Float64Array(BAND_COUNT);
    for (let i = 0; i < BAND_COUNT; i++) {
      const quiet = reference - this.ref[i];
      if (quiet > TILT_LIMIT_DB) { t[i] = REST; continue; }
      const dev = bands[i] - this.ref[i];
      t[i] = Math.min(1, Math.max(REST, 0.5 + dev / (2 * DEVIATION_DB)));
    }
    // 16 bands → 28 columns, linear.
    for (let x = 0; x < COLS; x++) {
      const pos = x / (COLS - 1) * (BAND_COUNT - 1);
      const lo = Math.floor(pos), hi = Math.min(lo + 1, BAND_COUNT - 1), f = pos - lo;
      this.levels[x] = t[lo] * (1 - f) + t[hi] * f;
    }
    return this.levels;
  }
}

// ---------------------------------------------------------------- generated pattern
// For when the stream cannot be read. Capped at 0.70 so it can never fill
// the panel the way a real hit does; no heat, no ghost, no markers.
const PATTERN_CEILING = 0.70;
function patternTargets(t) {
  const out = new Float64Array(COLS);
  for (let i = 0; i < COLS; i++) {
    const x = i / (COLS - 1);
    const v = 0.35 + 0.18 * Math.sin(t * 1.3 + x * 5.1) + 0.12 * Math.sin(t * 0.7 - x * 9.3) + 0.08 * Math.sin(t * 2.1 + x * 2.2);
    out[i] = Math.min(PATTERN_CEILING, Math.max(REST, v * (1 - 0.35 * x)));
  }
  return out;
}

// ---------------------------------------------------------------- reed field (ReedField port)
const OMEGA = 2 * Math.PI * 18, ZETA_UP = 0.50, ZETA_DOWN = 1.0, KAPPA = 80, GRAVITY = 1.6,
      HANG = 0.12, HEAT_TAU = 0.35, GHOST_TAU_PLAY = 0.45, GHOST_TAU_SILENT = 0.18,
      PEAK_HOLD = 0.35, SUBSTEP_RATE = 480, SUBSTEP_CAP = 32;
class ReedField {
  constructor() {
    const f = () => new Float64Array(COLS).fill(REST), z = () => new Float64Array(COLS);
    this.d = f(); this.h = f(); this.ghost = f(); this.peak = f(); this.prevTarget = f();
    this.v = z(); this.peakFall = z(); this.peakHold = z(); this.heat = z(); this.fallSpeed = z();
    this.hang = 0; this.lastKind = 'silent'; this.pending = null;
  }
  // kind: 'silent' | 'pattern' | 'measured'
  advance(kind, target, dt) {
    const frames = dt * 60;
    if (kind !== this.lastKind) {
      if (kind === 'silent') { this.hang = HANG; this.fallSpeed.fill(0); this.peakHold.fill(0); }
      this.lastKind = kind;
    }
    if (kind === 'silent') this.stepSilent(dt);
    else if (kind === 'pattern') this.follow(target, 0.25, 0.25, frames);
    else this.follow(target, 1.0, 0.20, frames);
    this.stepHeat(kind, dt); this.stepLattice(dt); this.stepGhost(kind, dt); this.stepPeaks(kind, dt);
  }
  follow(target, attack, release, frames) {
    const a = 1 - Math.pow(1 - attack, frames), r = 1 - Math.pow(1 - release, frames);
    for (let i = 0; i < COLS; i++) { this.d[i] += (target[i] - this.d[i]) * (target[i] > this.d[i] ? a : r); this.fallSpeed[i] = 0; }
    this.pending = target;
  }
  stepSilent(dt) {
    this.pending = null;
    if (this.hang > 0) { this.hang -= dt; return; }
    for (let i = 0; i < COLS; i++) { this.fallSpeed[i] += GRAVITY * dt; this.d[i] = Math.max(REST, this.d[i] - this.fallSpeed[i] * dt); }
  }
  stepHeat(kind, dt) {
    const decay = Math.exp(-dt / HEAT_TAU);
    if (kind !== 'measured' || !this.pending) { for (let i = 0; i < COLS; i++) this.heat[i] *= decay; return; }
    for (let i = 0; i < COLS; i++) {
      const onset = Math.max(0, this.pending[i] - this.prevTarget[i]);
      this.prevTarget[i] = this.pending[i];
      this.heat[i] = Math.max(this.heat[i] * decay, Math.min(1, 4 * onset));
    }
  }
  stepLattice(dt) {
    const steps = Math.min(SUBSTEP_CAP, Math.max(1, Math.ceil(dt * SUBSTEP_RATE)));
    const hs = dt / steps, e = new Float64Array(COLS);
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < COLS; i++) e[i] = this.h[i] - this.d[i];
      for (let i = 0; i < COLS; i++) {
        const left = i === 0 ? e[0] : e[i - 1], right = i === COLS - 1 ? e[COLS - 1] : e[i + 1];
        const lap = left - 2 * e[i] + right;
        const zeta = this.v[i] > 0 ? ZETA_UP : ZETA_DOWN;
        const a = -OMEGA * OMEGA * e[i] - 2 * zeta * OMEGA * this.v[i] + KAPPA * lap;
        this.v[i] += a * hs; this.h[i] += this.v[i] * hs;
        if (this.h[i] < REST) { this.h[i] = REST; if (this.v[i] < 0) this.v[i] = 0; }
        if (this.h[i] > 1) { this.h[i] = 1; if (this.v[i] > 0) this.v[i] = 0; }
      }
    }
  }
  stepGhost(kind, dt) {
    const decay = Math.exp(-dt / (kind === 'silent' ? GHOST_TAU_SILENT : GHOST_TAU_PLAY));
    for (let i = 0; i < COLS; i++) this.ghost[i] = Math.max(this.h[i], REST + (this.ghost[i] - REST) * decay);
  }
  stepPeaks(kind, dt) {
    if (kind === 'pattern') { for (let i = 0; i < COLS; i++) this.peak[i] = this.d[i]; return; }
    if (kind === 'silent') {
      for (let i = 0; i < COLS; i++) { this.peakFall[i] += GRAVITY * dt; this.peak[i] = Math.max(this.d[i], this.peak[i] - this.peakFall[i] * dt); }
      return;
    }
    for (let i = 0; i < COLS; i++) {
      if (this.d[i] >= this.peak[i]) { this.peak[i] = this.d[i]; this.peakFall[i] = 0; this.peakHold[i] = PEAK_HOLD; }
      else if (this.peakHold[i] > 0) this.peakHold[i] -= dt;
      else { this.peakFall[i] += GRAVITY * dt; this.peak[i] = Math.max(this.d[i], this.peak[i] - this.peakFall[i] * dt); }
    }
  }
  // The renderer reads the snapshot names the app uses.
  get height() { return this.h; }
  get drive() { return this.d; }
  get vel() { return this.v; }
  get atRest() {
    const floor = REST + 0.002;
    for (let i = 0; i < COLS; i++) if (this.h[i] > floor || this.d[i] > floor || this.peak[i] > floor || Math.abs(this.v[i]) >= 0.01) return false;
    return true;
  }
}

// ---------------------------------------------------------------- renderer (SpectrumRenderer port)
const MODES = ['matrix', 'bars', 'mirror', 'dots', 'scope', 'ascii', 'off'];
const CELL = 5, GAP = 2, PITCH = CELL + GAP;
function bucket(v) { return v > 0.78 ? 2 : (v > 0.5 ? 1 : 0); }
function render(cv, field, mode, ink, tokens) {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  if (mode === 'off' || W <= 0) return;
  const colours = [tokens.ok, tokens.warn, tokens.err];
  const rows = Math.max(1, Math.floor(H / PITCH));
  const barW = W / COLS, width = Math.max(1, barW - 3), mid = H / 2;
  const f = field;

  if (mode === 'scope') {
    g.globalAlpha = 1; g.strokeStyle = tokens.ln; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, mid); g.lineTo(W, mid); g.stroke();
    const path = (arr, sign, alpha) => {
      g.globalAlpha = alpha; g.beginPath();
      for (let i = 0; i < COLS; i++) { const x = i * barW + barW / 2, y = mid - sign * arr[i] * mid; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    };
    let maxD = 0; for (let i = 0; i < COLS; i++) maxD = Math.max(maxD, f.drive[i]);
    g.strokeStyle = colours[bucket(maxD)]; g.lineWidth = 2;
    path(f.height, 1, 1); path(f.height, -1, 1);
    if (ink.ghost) { g.lineWidth = 1; path(f.ghost, 1, 0.3); path(f.ghost, -1, 0.3); }
    g.globalAlpha = 1; return;
  }

  if (mode === 'ascii') {
    const colPitch = CELL + GAP;
    const cols = Math.max(COLS, Math.floor(W / colPitch));
    const inset = (W - cols * colPitch + GAP) / 2;
    const sample = (arr, x) => { const pos = x / Math.max(1, cols - 1) * (COLS - 1); const lo = Math.floor(pos), hi = Math.min(lo + 1, COLS - 1), fr = pos - lo; return arr[lo] * (1 - fr) + arr[hi] * fr; };
    for (let x = 0; x < cols; x++) {
      const h = sample(f.height, x), level = h * rows, full = Math.floor(level), frac = level - full;
      const cx = inset + x * colPitch, b = bucket(sample(f.drive, x));
      g.fillStyle = colours[b]; g.globalAlpha = 1;
      for (let r = 0; r < Math.min(full, rows); r++) g.fillRect(cx, H - (r + 1) * PITCH, CELL, CELL);
      const q = Math.floor(frac * 4);
      if (q > 0 && full < rows) { g.globalAlpha = q * 0.25; g.fillRect(cx, H - (full + 1) * PITCH, CELL, CELL); }
      if (ink.markers) { const p = sample(f.peak, x); if (p > h + 0.5 / rows) { g.globalAlpha = 0.95; g.fillStyle = colours[bucket(p)]; g.fillRect(cx, H - p * H - 0.5, CELL, 1); } }
    }
    g.globalAlpha = 1; return;
  }

  // matrix / bars / mirror / dots — painted in the app's order: unlit, ghost,
  // halo rings (geometry, not blur), lit, markers.
  const rects = { unlit: [], lit: [[], [], []], ghost: [[], [], []], haloIn: [[], [], []], haloOut: [[], [], []], markers: [[], [], []] };
  const halo = (x, y, w, h, b) => { if (!ink.halo) return; rects.haloIn[b].push([x - 1.5, y - 1.5, w + 3, h + 3]); rects.haloOut[b].push([x - 4, y - 4, w + 8, h + 8]); };
  for (let i = 0; i < COLS; i++) {
    const x = i * barW + 1.5, h = f.height[i], d = f.drive[i], heat = f.heat[i];
    const s = f.vel[i] > 0.02 ? 1 : (f.vel[i] < -0.02 ? -1 : 0);
    const litRows = Math.min(rows, Math.max(0, Math.round(h * rows - 0.25 * s)));
    const ghostRows = Math.min(rows, Math.max(0, Math.round(f.ghost[i] * rows)));
    const peakRow = Math.min(rows - 1, Math.max(0, Math.round(f.peak[i] * rows)));
    const cb = bucket(d);
    if (mode === 'matrix') {
      const glow = Math.min(3, Math.max(1, 1 + Math.round(2 * heat)));
      for (let r = 0; r < rows; r++) {
        const y = H - (r + 1) * PITCH;
        if (r < litRows) { const b = bucket((r + 1) / rows); rects.lit[b].push([x, y, width, CELL]); if (r >= litRows - glow) halo(x, y, width, CELL, b); }
        else if (ink.ghost && r < ghostRows) rects.ghost[bucket((r + 1) / rows)].push([x, y, width, CELL]);
        else rects.unlit.push([x, y, width, CELL]);
      }
      if (ink.markers && peakRow > litRows) rects.markers[bucket(f.peak[i])].push([x, H - (peakRow + 1) * PITCH, width, 2]);
    } else if (mode === 'bars') {
      const height = Math.max(1, litRows * PITCH - 2);
      rects.lit[cb].push([x, H - height, width, height]);
      if (ink.ghost && ghostRows > litRows) { const gh = Math.max(1, ghostRows * PITCH - 2); rects.ghost[cb].push([x, H - gh, width, gh - height]); }
      halo(x, H - height, width, Math.min(height, 2 + 4 * heat), cb);
      if (ink.markers && peakRow > litRows) rects.markers[bucket(f.peak[i])].push([x, H - (peakRow + 1) * PITCH, width, 2]);
    } else if (mode === 'mirror') {
      const half = Math.max(1, litRows * PITCH / 2);
      rects.lit[cb].push([x, mid - half, width, half * 2]);
      if (ink.ghost && ghostRows > litRows) { const gHalf = Math.max(half, ghostRows * PITCH / 2); rects.ghost[cb].push([x, mid - gHalf, width, gHalf - half]); rects.ghost[cb].push([x, mid + half, width, gHalf - half]); }
      if (ink.markers) { const pr = Math.max(half, peakRow * PITCH / 2); rects.markers[bucket(f.peak[i])].push([x, mid - pr - 1, width, 2]); rects.markers[bucket(f.peak[i])].push([x, mid + pr - 1, width, 2]); }
    } else if (mode === 'dots') {
      const dotRow = Math.max(0, litRows - 1), y = H - (dotRow + 1) * PITCH;
      rects.lit[cb].push([x, y, width, CELL]);
      if (ink.ghost && ghostRows > litRows) rects.ghost[cb].push([x, H - ghostRows * PITCH, width, CELL]);
      halo(x, y, width, CELL, cb);
      if (ink.markers && peakRow > dotRow) rects.markers[bucket(f.peak[i])].push([x, H - (peakRow + 1) * PITCH, width, 2]);
    }
  }
  const paint = (list, colour, alpha) => { if (!list.length) return; g.globalAlpha = alpha; g.fillStyle = colour; for (const r of list) g.fillRect(r[0], r[1], r[2], r[3]); };
  if (mode === 'matrix') paint(rects.unlit, tokens.ln, 0.25);
  if (ink.ghost) for (let b = 0; b < 3; b++) paint(rects.ghost[b], colours[b], 0.30);
  if (ink.halo) { for (let b = 0; b < 3; b++) paint(rects.haloOut[b], colours[b], 0.14); for (let b = 0; b < 3; b++) paint(rects.haloIn[b], colours[b], 0.38); }
  for (let b = 0; b < 3; b++) paint(rects.lit[b], colours[b], 1);
  if (ink.markers) for (let b = 0; b < 3; b++) paint(rects.markers[b], colours[b], 0.95);
  g.globalAlpha = 1;
}


// ---------------------------------------------------------------- player core
// The one engine. app.js draws the screens; this owns audio, the analyser,
// the queue, favourites and the station log — the same split as the iOS
// app's PlayerEngine / screens.
const $ = (id) => document.getElementById(id);
const S = {
  stations: [], byUrl: new Map(), queue: [], idx: -1, playing: false,
  favs: new Set(store.get('favs', [])),
  mode: MODES.includes(store.get('mode', 'matrix')) ? store.get('mode', 'matrix') : 'matrix',
  theme: store.get('theme', 'blare'), custom: store.get('custom', null), density: store.get('density', 'comfortable'),
  scan: store.get('scan', false), pattern: store.get('pattern', 'none'), analyse: store.get('analyse', true),
  vol: store.get('vol', 80), startedAt: 0,
  audio: null, ctx: null, analyser: null, monitor: new Monitor(), field: new ReedField(),
  source: 'silent', blockedReason: '',
  log: store.get('log', []),          // {u, n, at}
  listeners: new Set(),
};
function emit() { for (const f of S.listeners) { try { f(); } catch (e) {} } }
function current() { return S.idx >= 0 ? S.queue[S.idx] : null; }

function stationFromRow(r, i) { return { i, uuid: r[0], n: r[1], u: r[2], c: r[3], b: r[4], g: r[5], geo: r[6], np: r[7], home: r[8], fav: r[9],
  fold: fold(r[1]), foldMeta: fold((r[5] || '').replace(/\//g, ' ') + ' ' + countryName(r[3]) + ' ' + r[3]) }; }
function fold(s) { return String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
const DN = (typeof Intl !== 'undefined' && Intl.DisplayNames) ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
function countryName(cc) { if (!cc) return ''; try { return (DN && DN.of(cc)) || cc; } catch (e) { return cc; } }

function stop() {
  if (S.audio) { S.audio.pause(); S.audio.removeAttribute('src'); S.audio.load(); }
  S.playing = false; S.source = 'silent'; emit();
}
function tune(i, autoplay = true) {
  if (i < 0 || i >= S.queue.length) return;
  stop(); S.idx = i;
  const st = S.queue[i]; store.set('last', st.u);
  if (autoplay) play(true);
  emit();
}
function tuneStation(st, list) {
  // The list the user was looking at becomes the queue — PREV/NEXT walk it.
  const l = (list && list.length ? list : [st]).slice(0, 60);
  if (!l.some(x => x.u === st.u)) l.unshift(st);
  S.queue = l; tune(l.findIndex(x => x.u === st.u));
}
function play(withCors) {
  const st = current(); if (!st) return;
  // A page served over HTTPS may not fetch an http:// stream — the browser
  // blocks it as mixed content and never even connects. Say so instead of
  // pretending to try; the fix is a proxy, not a retry.
  if (location.protocol === 'https:' && /^http:\/\//i.test(st.u)) {
    S.playing = false; S.source = 'silent'; S.blockedReason = 'HTTP STREAM';
    S.streamState = '———— HTTP STREAM · BLOCKED ON A HTTPS PAGE ————'; emit(); return;
  }
  if (!S.ctx) { const AC = window.AudioContext || window.webkitAudioContext; S.ctx = new AC(); }
  if (S.ctx.state === 'suspended') S.ctx.resume();
  const a = new Audio(); a.preload = 'none';
  const cors = withCors && S.analyse;
  if (cors) a.crossOrigin = 'anonymous';
  a.volume = S.vol / 100; S.audio = a; S.monitor.reset();
  let settled = false;
  a.addEventListener('playing', () => {
    S.streamState = '———— STREAMING ————';
    if (settled) { emit(); return; } settled = true;
    S.playing = true; S.startedAt = performance.now();
    if (cors) {
      try {
        const src = S.ctx.createMediaElementSource(a), an = S.ctx.createAnalyser();
        src.connect(an); an.connect(S.ctx.destination);
        S.analyser = new Analyzer(S.ctx, an); S.source = 'measured'; S.blockedReason = '';
      } catch (e) { S.source = 'pattern'; S.blockedReason = 'ANALYSER UNAVAILABLE'; }
    } else { S.source = 'pattern'; S.blockedReason = S.analyse ? 'STREAM BLOCKS FFT (NO CORS)' : 'ANALYSIS OFF IN SETTINGS'; }
    logStation(st); emit();
  });
  a.addEventListener('error', () => {
    if (settled) { S.playing = false; S.source = 'silent'; S.streamState = '———— STREAM ENDED ————'; emit(); return; }
    settled = true;
    if (cors) play(false); else { S.playing = false; S.source = 'silent'; S.streamState = '———— CANNOT PLAY THIS STREAM ————'; emit(); }
  });
  a.addEventListener('stalled', () => { if (S.playing) { S.streamState = '———— BUFFERING ————'; emit(); } });
  a.src = st.u; S.streamState = '———— CONNECTING ————';
  a.play().catch(() => {});
  emit();
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: st.n, artist: 'Blare', album: st.c ? st.c + (st.b ? ' · ' + st.b + ' kbps' : '') : '' });
    navigator.mediaSession.setActionHandler('play', () => play(true));
    navigator.mediaSession.setActionHandler('pause', stop);
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('nexttrack', next);
  }
}
function prev() { if (S.queue.length) tune((S.idx - 1 + S.queue.length) % S.queue.length); }
function next() { if (S.queue.length) tune((S.idx + 1) % S.queue.length); }
function toggle() { if (S.playing) stop(); else if (S.idx < 0) tune(0); else play(true); }
function setVolume(v) { S.vol = v; store.set('vol', v); if (S.audio) S.audio.volume = v / 100; emit(); }
function setMode(m) { if (MODES.includes(m)) { S.mode = m; store.set('mode', m); emit(); } }
function toggleFav(u) { if (S.favs.has(u)) S.favs.delete(u); else S.favs.add(u); store.set('favs', [...S.favs]); rebuildQueue(); emit(); }
function rebuildQueue() {
  // Starred first, then the catalog head — the app's rule. Never only the
  // starred ones: that would shrink PREV/NEXT to a queue of one.
  const starred = S.stations.filter(s => S.favs.has(s.u)), rest = S.stations.filter(s => !S.favs.has(s.u));
  const cur = current();
  S.queue = starred.concat(rest).slice(0, 60);
  if (cur) { S.idx = S.queue.findIndex(s => s.u === cur.u); if (S.idx < 0) { S.queue.unshift(cur); S.idx = 0; } }
}
function logStation(st) {
  const week = Date.now() - 7 * 86400000;
  S.log = S.log.filter(e => e.at > week && e.u !== st.u);
  S.log.unshift({ u: st.u, n: st.n, at: Date.now() });
  S.log = S.log.slice(0, 200); store.set('log', S.log);
}

// ---------------------------------------------------------------- frame loop
let lastT = performance.now(), lastPublish = 0, patternClock = 0;
const frameHooks = new Set();
function frame(now) {
  const dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;
  let kind = 'silent', target = null;
  if (S.playing && S.source === 'measured' && S.analyser) {
    if (now - lastPublish > 33) { lastPublish = now; if (S.analyser.read()) S.monitor.push(S.analyser.bands); }
    kind = 'measured'; target = S.monitor.levels;
  } else if (S.playing && S.source === 'pattern') { patternClock += dt; kind = 'pattern'; target = patternTargets(patternClock); }
  S.field.advance(kind, target, dt);
  S.kind = kind;
  const ink = { markers: kind !== 'pattern', halo: kind === 'measured', ghost: kind === 'measured' };
  for (const cv of document.querySelectorAll('canvas.spec-canvas, #spec, #stageSpec')) {
    if (cv.offsetParent === null && cv.id !== 'stageSpec') continue;
    if (cv.id === 'stageSpec' && $('stage').classList.contains('hidden')) continue;
    render(cv, S.field, S.mode, ink, tokens());
  }
  S.caption = kind === 'measured' ? 'LIVE SPECTRUM · FFT OF THIS STREAM'
    : kind === 'pattern' ? 'GENERATED PATTERN · ' + S.blockedReason
    : (!S.field.atRest ? 'SPECTRUM FALLING · STREAM STOPPED' : 'SPECTRUM AT REST · NOTHING PLAYING');
  for (const f of frameHooks) f(now);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- themes
function mixHex(a, b, t) {
  const p = (x) => [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)];
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return '#' + c(r1, r2) + c(g1, g2) + c(b1, b2);
}
function customTokens(c) {
  // The same derivation as the design and the app: five seeds → eleven tokens.
  return { bg0: mixHex(c.bg, '#000000', 0.35), bg: c.bg, pn: mixHex(c.bg, c.fg, 0.06), fg: c.fg, dim: mixHex(c.fg, c.bg, 0.5),
           ln: mixHex(c.bg, c.fg, 0.18), acc: c.acc, acc2: mixHex(c.acc, c.fg, 0.35), ok: c.ok, warn: c.warn, err: c.err };
}
function tokens() {
  if (S.theme === 'custom' && S.custom) return customTokens(S.custom);
  return (THEMES.find(x => x.id === S.theme) || THEMES[0]).v;
}
const PATTERNS = { none: 'none',
  scan: 'repeating-linear-gradient(0deg,rgba(0,0,0,.14) 0 1px,transparent 1px 3px)',
  grid: 'repeating-linear-gradient(0deg,rgba(0,0,0,.10) 0 1px,transparent 1px 24px),repeating-linear-gradient(90deg,rgba(0,0,0,.10) 0 1px,transparent 1px 24px)',
  dots: 'radial-gradient(rgba(0,0,0,.22) 1px,transparent 1.5px) 0 0/10px 10px' };
function applyTheme() {
  const t = tokens();
  for (const k in t) document.documentElement.style.setProperty('--' + k, t[k]);
  $('app').classList.toggle('scan', S.scan);
  $('app').classList.toggle('compact', S.density === 'compact');
  $('app').style.backgroundImage = PATTERNS[S.pattern] || 'none';
  emit();
}

window.Blare = { S, THEMES, MODES, store, fold, countryName, stationFromRow, current, tune, tuneStation, play, stop, prev, next, toggle,
  setVolume, setMode, toggleFav, rebuildQueue, tokens, customTokens, applyTheme, mixHex, PATTERNS, frameHooks, esc,
  on(f) { S.listeners.add(f); }, start() { requestAnimationFrame(frame); } };
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

})();
