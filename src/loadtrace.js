// Block by block load tracing, in the spirit of 7 Days to Die's structural integrity.
// Every plush that roofs a gap carries the weight of the pile above it, and that weight is pressed harder the deeper into the
// mountain it is (PRESS metres from the start doubles it). A roof cell hands its weight to the supports whose reach covers it,
// sharing equally when several do. A support that ends up carrying more than it can bear buckles, and its share drops onto its
// neighbours, which may buckle in turn.
import { C, cellX, cellY, cellZ, toI, toJ, toK } from './config.js';
import { FRAME_TYPES, STRUT_DEPTH } from './upgrades.js';
import { PAD } from './plushdata.js';

export const BASE_LOAD = 2150;   // a frame (a 2.4 m cube, its reach centred on the cube) is rated for a standard 4 wide tunnel (about 32 roof cells under 60 cells of pile) at its rated depth
export const PRESS = 150;        // metres of depth that add 100% to the weight of the pile
export const MAX_OVER = 64;      // cells of pile above a roof cell that still add weight
export const MAX_SHARE = 2;     // however many supports stand around, a roof plush still presses at least half its weight on each of the two nearest
export const WARN_AT = 0.85;

export const pressure = (x, z) => 1 + Math.hypot(x, z) / PRESS;
const press = (d) => 1 + d / PRESS;

// capacity in load units. Derived from the depth rating so the two always agree.
// Measured: the load a lone frame (a 4x4x4 cube, its reach centred on the cube) carries in a standard 4 wide, 4 high tunnel longer than its reach at exactly its rated depth, under the full pile
// (mining.frame-cube.every-tier-is-at-100-percent-load... and mining.depth-rating-text-is-true-for-every-tier re-measure it).
// Dividing by it makes every tier hit 100% at its rating, so "rated to N m, breaks past it" is true for all of them.
const CAL = { timber: 0.757, steel: 0.914, concrete: 0.978, rebar: 0.978, titan: 0.981, carbon: 0.983, plasma: 0.984, voidl: 0.96, neutron: 1.013 };
export function capacityOf(kind) {
  if (FRAME_TYPES[kind]) { const f = FRAME_TYPES[kind]; return isFinite(f.maxDepth) ? BASE_LOAD * (f.radius / 2.5) * press(f.maxDepth) * (CAL[kind] ?? 0.99) : Infinity; } // a longer reach carries the roof of a longer stretch of tunnel
  if (typeof kind === 'string' && kind.charCodeAt(0) === 97 && kind.startsWith('arch')) return archCapacity(kind);   // 'arch8:steel' (arches.js)
  if (kind === 'jack') return 2000 * press(STRUT_DEPTH.jack);   // a jack reaches 2.7 m (a strut 1.9): it must carry more than a strut wherever both can be set
  return 480 * press(STRUT_DEPTH.strut);
}

// ---------------------------------------------------------------- giant arches (wave 6)
// An arch is a 4 cell deep module like a frame cube, but 6, 8 or 12 cells wide: a tunnel for Haul Trucks and big diggers. `clear` is the open rectangle
// under the ribs (span - 1 wide, h - 1 high) that every vehicle is measured against. A wide span carries more roof for its reach, so it is rated shallower
// than the same material as a frame: rated depth = frame depth x derate. CAL_ARCH is measured like CAL (the load of a lone arch in a standard tunnel of its own
// span at exactly its rated depth), so every tier of every span is at 100% load at its rating (arch.calibrated-100pct-at-rated-depth-all-tiers-and-spans).
export const ARCH_DEPTH = 4;
export const ARCH_SPANS = {
  6: { span: 6, h: 5, cw: 5, ch: 4, derate: 0.85, mul: 4, name: 'Haul Arch', short: 'Haul' },
  8: { span: 8, h: 6, cw: 7, ch: 5, derate: 0.7, mul: 9, name: 'Wide Arch', short: 'Wide' },
  12: { span: 12, h: 8, cw: 11, ch: 7, derate: 0.55, mul: 22, name: 'Cathedral Arch', short: 'Cathedral' },
};
export const CAL_ARCH = {   // measured at the rated depth, on a circle of that radius around the start, in the standard tunnel of each span, under the full pile (a shallow tier is measured under a built full pile: the natural one is lower than 43 m inside 85 m)
  6: { timber: 1.406, steel: 1.386, concrete: 1.377, rebar: 1.401, titan: 1.41, carbon: 1.469, plasma: 1.472, voidl: 1.436, neutron: 1.48 },
  8: { timber: 1.935, steel: 1.892, concrete: 1.876, rebar: 1.868, titan: 1.865, carbon: 1.862, plasma: 1.875, voidl: 1.923, neutron: 1.914 },
  12: { timber: 2.97, steel: 2.92, concrete: 2.842, rebar: 2.824, titan: 2.814, carbon: 2.83, plasma: 2.803, voidl: 2.799, neutron: 2.798 },
};
export const archKind = (span, mat) => `arch${span}:${mat}`;
export function parseArch(kind) {
  if (typeof kind !== 'string') return null;
  const m = /^arch(6|8|12):([a-z]+)$/.exec(kind); if (!m) return null;
  const span = +m[1]; return FRAME_TYPES[m[2]] ? { span, mat: m[2], ...ARCH_SPANS[span] } : null;
}
// how far the sphere of an arch reaches (metres from its centre): the frame's reach, or 1.55 per metre of half span (arch6 4.65 m, arch8 6.2 m, arch12 9.3 m), whichever is more
export const ARCH_REACH_PER_HALF_SPAN = 1.55;   // metres of reach per metre of half span (the spec's arch8 reaches about 6.2 m, so one arch holds 12 m of tunnel near the surface)
export const archReach = (span, mat) => Math.max(FRAME_TYPES[mat].radius, (span / 2) * ARCH_REACH_PER_HALF_SPAN);
export const archRated = (span, mat) => FRAME_TYPES[mat].maxDepth * ARCH_SPANS[span].derate;
export function archCapacity(kind) {
  const a = parseArch(kind); if (!a) return 480 * press(STRUT_DEPTH.strut);
  const rated = archRated(a.span, a.mat); if (!isFinite(rated)) return Infinity;
  return BASE_LOAD * (archReach(a.span, a.mat) / 2.5) * press(rated) * ((CAL_ARCH[a.span] || {})[a.mat] ?? 1);
}

const inside = (s, x, y, z) => { const dx = x - s.x, dy = y - s.y, dz = z - s.z; return dx * dx + dy * dy + dz * dz < s.r * s.r; };

// the load a support s carries now. `others` can add supports that are not placed yet (for previews).
export function loadOn(w, s, others = []) {
  const near = [];
  for (const o of w.supports) if (o !== s && o.cap !== undefined && o.id !== s.id && Math.hypot(o.x - s.x, o.z - s.z) < s.r + 9.4) near.push(o);
  for (const o of others) near.push(o);
  const ci = toI(s.x), ck = toK(s.z), rc = Math.ceil(s.r / C) + 1;
  const j0 = Math.max(1, toJ(s.y - s.r)), j1 = toJ(s.y + s.r) + 1;
  let load = 0;
  for (let k = ck - rc; k <= ck + rc; k++) for (let i = ci - rc; i <= ci + rc; i++) {
    const top = w.topAt(i, k); if (top <= j0) continue;
    const x = cellX(i), z = cellZ(k); const pr = press(Math.hypot(x, z));
    for (let j = j0; j <= j1 && j < top; j++) {
      if (!w.solid(i, j, k) || w.solid(i, j - 1, k)) continue;      // only a roof: solid with a gap under it
      if (w.get(i, j, k) === PAD && !w.solid(i, j + 1, k)) continue;   // a floor plate with air over it (the floor of an upper level in a stack) holds nothing up: it is a platform, not a roof
      const y = cellY(j);
      if (!inside(s, x, y, z)) continue;
      let n = 1; for (const o of near) if (inside(o, x, y, z)) n++;
      load += (Math.min(MAX_OVER, Math.max(0, top - j - 1)) + 1) * pr / Math.min(MAX_SHARE, n);
    }
  }
  return load;
}

export function ratioOf(w, s, others) { const cap = s.cap === undefined ? capacityOf(s.kind) : s.cap; return isFinite(cap) ? loadOn(w, s, others) / cap : 0; }

// ---------------------------------------------------------------- stacked cubes (wave 10)
// A cube that stands directly on another cube (its bottom row is the row over the lower cube's top row, the 4 x 4 footprints overlapping) passes its whole load down
// into it: the column is ONE path to the floor. A cube's load is what its own sphere weighs (loadOn) plus a share of every cube resting on it, each upper cube
// splitting its total between what holds it up (the lower cubes under its footprint and the ground, by the cells each covers). Nothing else moves load:
// a cube beside the column, or a cube that only has the same roof in reach, carries none of it, so a tall stack is never stronger than its weakest cube and
// never relieves the cube at the top (the bottom of a column carries what the top carries). `s.blk` is the cube's cell block {i0,i1,k0,k1,j0,j1}.
export const STACK_XFER = 1;
const bkey = (i, j, k) => (j * 16384 + k) * 16384 + i;
export function stackIndex(w) {
  const last = w.supports[w.supports.length - 1];   // a stand-in pushed and popped again (supportHolds) leaves a list of the same length: the last support tells it apart
  if (w._stkRef === w.supports && w._stkLen === w.supports.length && w._stkLast === last && w._stkVer === (w.stackVer || 0)) return w._stk;
  const top = new Map(), bot = new Map();
  for (const s of w.supports) {
    const b = s.blk; if (!b) continue;
    for (let k = b.k0; k <= b.k1; k++) for (let i = b.i0; i <= b.i1; i++) { top.set(bkey(i, b.j1, k), s); bot.set(bkey(i, b.j0, k), s); }
  }
  w._stk = { top, bot }; w._stkRef = w.supports; w._stkLen = w.supports.length; w._stkLast = last; w._stkVer = w.stackVer || 0;
  return w._stk;
}
// what holds cube u up: { ground: cells of its footprint standing on solid ground, cubes: Map(support -> cells), void: cells over nothing }; `self` is a cube not in the list yet (a preview)
export function restOf(w, u, self = null) {
  const ix = stackIndex(w), b = u.blk, cubes = new Map(); let ground = 0, hang = 0;
  for (let k = b.k0; k <= b.k1; k++) for (let i = b.i0; i <= b.i1; i++) {
    let low = ix.top.get(bkey(i, b.j0 - 1, k));
    if (!low && self && self !== u && self.blk && b.j0 - 1 === self.blk.j1 && i >= self.blk.i0 && i <= self.blk.i1 && k >= self.blk.k0 && k <= self.blk.k1) low = self;
    if (low && low !== u) cubes.set(low, (cubes.get(low) || 0) + 1);
    else if (w.solid(i, b.j0 - 1, k)) ground++;
    else hang++;
  }
  return { ground, cubes, hang };
}
// the cubes standing right on s: Map(upper support -> cells of s's top it covers)
export function restingOn(w, s) {
  const out = new Map(); if (!s.blk) return out;
  const ix = stackIndex(w), b = s.blk;
  for (let k = b.k0; k <= b.k1; k++) for (let i = b.i0; i <= b.i1; i++) { const u = ix.bot.get(bkey(i, b.j1 + 1, k)); if (u && u !== s) out.set(u, (out.get(u) || 0) + 1); }
  return out;
}
// the weight s carries: its own roof plus the share of every cube above it. `parts` (optional) receives { own, above }. `others` are unplaced supports (a preview), `memo` a Map of totals already known.
export function totalLoad(w, s, others = [], parts = null, memo = new Map(), depth = 0) {
  const own = loadOn(w, s, others);
  let above = 0;
  if (s.blk && depth < 24) {
    for (const [u, n] of restingOn(w, s)) {
      const r = restOf(w, u, s), held = r.ground + [...r.cubes.values()].reduce((a, b) => a + b, 0); if (held <= 0) continue;
      let tu = memo.get(u); if (tu === undefined) { tu = totalLoad(w, u, others, null, memo, depth + 1); memo.set(u, tu); }
      above += STACK_XFER * tu * n / held;
    }
  }
  if (parts) { parts.own = own; parts.above = above; }
  return own + above;
}
export function totalRatio(w, s, others = [], parts = null) { const cap = s.cap === undefined ? capacityOf(s.kind) : s.cap; return isFinite(cap) ? totalLoad(w, s, others, parts) / cap : 0; }
