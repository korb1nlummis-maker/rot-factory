// Positional world sound. Every sound that comes from somewhere in the world is played through `sound.at(x, y, z, cls)`, which returns the
// Sound with its output re-routed: a gain that falls off smoothly with distance (full inside NEAR metres, silent at the class maximum),
// stereo pan from the listener's yaw, a low-pass that closes with distance, and an extra muffle for every metre of plush between the source
// and the listener (a coarse, cached walk along the line) and for a source buried under the pile heard from the hall or the other way round.
// A sound the player makes (grab, throw, buy, a click on a panel) never goes through here and stays at full volume.
//
// A voice limiter keeps a flood (fifty rigs selling at once) from blasting: per class, per 0.25 s window, only so many voices start, and only
// so many from one 8 m square of the floor. A culled or too far sound still calls the stubbed methods (tests spy on them) but makes no audio.
//
// Usage:  game.sound.at(x, y, z, 'coin').coin(0);      const s = game.sound.at(x, y, z, 'boom'); s.rumble(1.2); s.thump(0.4, 80);
//         game.sound.voice(x, y, z, 'coin') -> { d, gain, pan, lp, occ, max, cls } (pure, no side effects: the tests and the hum read it)
import { NX, NZ, NY, toI, toJ, toK } from './config.js';

export const NEAR = 4;                     // metres: full volume inside this
export const WINDOW = 0.25;                // seconds: the voice limiter's window
export const TOTAL_CAP = 14;               // voices of every class that may start in one window
export const FLOOR_GAIN = 0.012;           // quieter than this is not worth a voice
export const VOICE_TTL = 8000;             // ms after which a voice lets go of its gain, pan and low-pass (the longest sound, a 2.2 power rumble, runs about 4 s)

// class: { max metres where it is silent, cap voices per window, area voices per 8 m square per window, occ: gain lost per metre of plush (a coin is gone behind a few metres of it, a blast carries through the ground) }
export const CLASSES = {
  // small cues: close by only
  coin:   { max: 18, cap: 3, area: 1, occ: 0.32 },
  pop:    { max: 18, cap: 3, area: 1, occ: 0.32 },
  chirp:  { max: 18, cap: 3, area: 1, occ: 0.32 },
  squeak: { max: 14, cap: 2, area: 1, occ: 0.32 },
  soft:   { max: 14, cap: 3, area: 2, occ: 0.32 },
  step:   { max: 14, cap: 3, area: 1, occ: 0.32 },
  throw:  { max: 20, cap: 3, area: 1, occ: 0.28 },
  dust:   { max: 16, cap: 2, area: 1, occ: 0.28 },
  ping:   { max: 18, cap: 3, area: 1, occ: 0.32 },
  switch: { max: 20, cap: 3, area: 1, occ: 0.28 },
  // machines and structures
  work:   { max: 30, cap: 4, area: 2, occ: 0.24 },
  bot:    { max: 24, cap: 3, area: 1, occ: 0.26 },
  door:   { max: 30, cap: 2, area: 1, occ: 0.2 },
  lift:   { max: 30, cap: 2, area: 1, occ: 0.2 },
  pad:    { max: 30, cap: 2, area: 1, occ: 0.2 },
  scan:   { max: 30, cap: 3, area: 1, occ: 0.2 },
  arch:   { max: 40, cap: 3, area: 1, occ: 0.16 },
  hum:    { max: 30, cap: 99, area: 99, occ: 0.2 },
  rail:   { max: 40, cap: 2, area: 1, occ: 0.12 },
  fuse:   { max: 30, cap: 3, area: 1, occ: 0.2 },
  alarm:  { max: 60, cap: 2, area: 1, occ: 0.1 },
  // structures giving way, slides, falls
  creak:  { max: 50, cap: 2, area: 1, occ: 0.1 },
  slide:  { max: 60, cap: 2, area: 1, occ: 0.07 },
  fall:   { max: 45, cap: 3, area: 1, occ: 0.1 },
  support: { max: 60, cap: 2, area: 1, occ: 0.05 },
  // blasts and collapses: heard through the ground from far away
  boom:     { max: 90, cap: 2, area: 1, occ: 0.025 },
  rumble:   { max: 90, cap: 2, area: 1, occ: 0.025 },
  collapse: { max: 90, cap: 2, area: 1, occ: 0.025 },
};
export const classOf = (cls) => CLASSES[cls] || CLASSES.coin;

// smooth rolloff: 1 inside NEAR, (1 - t)^2 across the rest, exactly 0 at max (and no kink there)
export function rolloff(d, max) {
  if (d <= NEAR) return 1;
  if (d >= max) return 0;
  const s = 1 - (d - NEAR) / (max - NEAR);
  return s * s;
}

// a column of the world only if it is already built: a sound never makes the world generate a far chunk
const NCX = NX >> 4;
function peekSolid(w, i, j, k) {
  if (j < 0) return true;
  if (j >= NY || i < 0 || i >= NX || k < 0 || k >= NZ) return false;
  const c = w.cols.get((k >> 4) * NCX + (i >> 4));
  return !!c && c.sp[((j * 16) + (k & 15)) * 16 + (i & 15)] !== 0;
}
const buriedAt = (w, x, y, z) => {
  const i = toI(x), k = toK(z); if (i < 0 || i >= NX || k < 0 || k >= NZ) return false;
  const c = w.cols.get((k >> 4) * NCX + (i >> 4)); if (!c) return false;
  return c.top[(k & 15) * 16 + (i & 15)] - toJ(y) > 2;
};

// metres of solid plush on the straight line between two points (the first and last metre are ignored: a source standing in the pile, a listener against a wall)
export function solidMetres(w, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
  if (d < 3) return 0;
  const n = Math.min(110, Math.max(2, Math.ceil(d / 0.8))), step = d / n, skip = 1.0 / step;
  let hits = 0;
  for (let s = 1; s < n; s++) {
    if (s < skip || n - s < skip) continue;
    const f = s / n;
    if (peekSolid(w, toI(ax + dx * f), toJ(ay + dy * f), toK(az + dz * f))) hits++;
  }
  return hits * step;
}

export const spatialMethods = {
  // the game gives the sound a listener (the player) and the world to listen through
  bindWorld(game) {
    this.game = game;
    this.listener = () => { const p = game.player; return { x: p.pos.x, y: p.pos.y + 1.5, z: p.pos.z, yaw: p.yaw || 0 }; };
  },

  // the unmuffled and muffled numbers for a source at (x, y, z) heard by `ls` (default: the listener). Pure: nothing is played or counted.
  voice(x, y, z, cls = 'coin', ls = null) {
    const spec = classOf(cls), L = ls || (this.listener ? this.listener() : null);
    const out = { cls, d: 0, gain: 1, pan: 0, lp: 20000, occ: 0, max: spec.max, solid: 0 };
    if (!L) return out;
    if (!Number.isFinite(x + y + z)) { out.gain = 0; return out; }   // a source with no place (a garbled message) is not heard; a sound that is yours never asks for a position
    const dx = x - L.x, dy = y - L.y, dz = z - L.z, d = Math.hypot(dx, dy, dz);
    out.d = d;
    const base = rolloff(d, spec.max);
    if (base <= 0) { out.gain = 0; return out; }
    const t = Math.min(1, Math.max(0, (d - NEAR) / (spec.max - NEAR)));
    let lp = 20000 * Math.exp(-3.4 * t), gain = base;
    // the walk through the plush between us (cached for a second per 1.2 m square pair)
    const w = this.game ? this.game.world : this.world;
    if (w && w.cols && d > 3) {
      const key = ((toI(x) >> 1) * 40000 + (toK(z) >> 1)) + ':' + (toJ(y) >> 1) + '|' + ((toI(L.x) >> 1) * 40000 + (toK(L.z) >> 1)) + ':' + (toJ(L.y) >> 1);
      const cache = this._occ || (this._occ = new Map()), now = this.clock();
      let e = cache.get(key);
      if (!e || now - e.t > 1) {
        if (cache.size > 300) cache.clear();
        let m = solidMetres(w, x, y, z, L.x, L.y, L.z);
        const bs = buriedAt(w, x, y, z), bl = buriedAt(w, L.x, L.y, L.z);
        e = { t: now, m, split: bs !== bl };
        cache.set(key, e);
      }
      out.solid = e.m;
      if (e.m > 0) { gain *= Math.exp(-spec.occ * e.m); lp *= Math.exp(-0.22 * e.m); out.occ = 1 - Math.exp(-spec.occ * e.m); }
      if (e.split) { gain *= 0.62; lp *= 0.6; }   // one of us under the pile and the other in the hall
    }
    // stereo: right of the listener is (-cos yaw, 0, sin yaw) because forward is (sin yaw, 0, cos yaw)
    const hd = Math.hypot(dx, dz);
    if (hd > 0.2) {
      const rx = -Math.cos(L.yaw), rz = Math.sin(L.yaw), fx = Math.sin(L.yaw), fz = Math.cos(L.yaw);
      const sideways = (dx * rx + dz * rz) / hd, ahead = (dx * fx + dz * fz) / hd;
      out.pan = Math.max(-0.9, Math.min(0.9, sideways * 0.9 * Math.min(1, hd / 3)));
      if (ahead < 0) lp *= 0.78 + 0.22 * (1 + ahead);   // behind the head: a little duller
    }
    out.gain = gain; out.lp = Math.max(180, lp);
    return out;
  },

  clock() { return this._now ? this._now() : (typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000); },

  // can another voice of this class start here and now? (counts only voices that were audible)
  admit(cls, x, z) {
    const spec = classOf(cls), now = this.clock();
    const win = this._win || (this._win = { t0: now, all: 0, by: new Map() });
    if (now - win.t0 > WINDOW || now < win.t0) { win.t0 = now; win.all = 0; win.by.clear(); }
    if (win.all >= TOTAL_CAP) return false;
    let c = win.by.get(cls); if (!c) { c = { n: 0, areas: new Map() }; win.by.set(cls, c); }
    if (c.n >= spec.cap) return false;
    const ak = (Math.floor(x / 8) + 4096) * 8192 + Math.floor(z / 8) + 4096, a = c.areas.get(ak) || 0;
    if (a >= spec.area) return false;
    c.n++; c.areas.set(ak, a + 1); win.all++;
    return true;
  },

  // the sound as heard from here. Returns a Sound whose output goes through the gain, pan and low-pass of this source, or a silent one.
  // `.audible` tells the caller whether anything will play, `.v` is the voice (gain, pan, lp, distance)
  at(x, y, z, cls = 'coin', ls = null) {
    const root = this._root || this;
    const v = root.voice(x, y, z, cls, ls);
    const st = root.stats || (root.stats = { played: 0, far: 0, capped: 0, byClass: {} });
    const bc = st.byClass[cls] || (st.byClass[cls] = { played: 0, far: 0, capped: 0 });
    let why = '';
    if (v.gain < FLOOR_GAIN) { st.far++; bc.far++; why = 'far'; }
    else if (!root.admit(cls, x, z)) { st.capped++; bc.capped++; why = 'capped'; }
    else { st.played++; bc.played++; }
    if (root.tracing) { const tr = root.trace || (root.trace = []); tr.push({ cls, x, y, z, d: v.d, gain: v.gain, pan: v.pan, lp: v.lp, played: !why, why }); if (tr.length > 400) tr.shift(); }
    const audible = !why;
    const c = root.ctx;
    if (!audible || !c) {
      const m = Object.create(root, { ctx: { value: audible ? c : null, configurable: true }, audible: { value: audible }, v: { value: v }, _root: { value: root } });
      return m;
    }
    const gn = c.createGain(); gn.gain.value = v.gain;
    let head = gn; const nodes = [gn];
    if (Math.abs(v.pan) > 0.03 && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = v.pan; head.connect(p); head = p; nodes.push(p); }
    if (v.lp < 15000) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = v.lp; f.Q.value = 0.4; head.connect(f); head = f; nodes.push(f); }
    head.connect(root.dry);
    // the voice is over long before this: let go of the chain so a long session does not pile up connected nodes on the bus
    setTimeout(() => { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* the context is closed */ } } }, root.voiceTtl ?? VOICE_TTL);
    return Object.create(root, { dry: { value: gn }, audible: { value: true }, v: { value: v }, _root: { value: root } });
  },

  // how loud a continuous source is for the listener, 0..1 (the machine hum sums these)
  hearing(x, y, z, cls = 'hum') {
    const v = this.voice(x, y, z, cls);
    return v.gain;
  },
};

// the same silent object for tests that want to ask `at()` something without a game
export function installSpatial(SoundClass) { Object.assign(SoundClass.prototype, spatialMethods); }
