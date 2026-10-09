import { C, NX, NY, NZ, CS, CX, CY, CZ, HALL_H, cellX, cellY, cellZ, toI, toJ, toK } from './config.js';
import { h32, mulberry32, smoothstep, fbm2, vnoise2, clamp } from './util.js';
import { pickSpecies, bandOfD2, NEEDLE, BULK, REMAINS, CACHE, PAD, isSpecialCell } from './plushdata.js';
import { workingsNear, workingPlugged } from './remains.js';
import { Islands } from './island.js';

const NCX = NX >> 4, NCZ = NZ >> 4;
const COLSZ = 256 * NY;
// THE TUNNEL RULE. A tunnel (or room) stands as long as no stretch of it runs further than SAFE_LEN from an anchor:
// an anchor is the open mouth of the cavity (no roof over it), or ground held by a frame, prop, strut, jack or bulkhead.
// SAFE_LEN shrinks the heavier the pile above (overburden) and the further from the bay (denser plush), and grows with
// Pile Tamping. Past that length the unsupported roof creaks, then comes down (a roof held by a support stands SUP_EXTRA cells further and waits GRACE_T seconds longer when it is just past that: see SUPPORT REACH AND GRACE below). Two rules come on top of it and never loosen it: a wide roof needs cover thick enough for its span (THIN_*
// below), and plush that has been cut off from the pile falls (island.js).
export const VEIN_T = 0.8;      // veinAt above this is a rich vein
export const SAFE_LEN = 12;     // cells (7.2 m) of tunnel you can dig unsupported near the surface
export const OB = 14;           // every 14 cells of plush above the roof costs one cell of safe length
export const MIN_SAFE = 3;      // never less than 1.8 m
export const MIN_CAVITY = 14;   // a sealed pocket smaller than this (cells at one level) never counts as unsupported roof
export const ARCH = 4;          // a collapse can only climb 4 cells (2.4 m) above the original roof before the pile above arches and holds
// How many cells the search for the nearest anchor may visit before it gives up (and the roof counts as unsupported). One number for every room was wrong: the
// cells within reach of an anchor grow with the width of the room (about 2 x width x reach), so a 24 wide giant tunnel with Pile Tamping at the top level ran out
// of cells at 16 cells of safe length while a 2 wide tunnel got all 27. The allowance now grows with the reach asked for: the same safe length at any width.
export const CAVITY_CAP = 500;
export const CAVITY_PER_STEP = 70;
// SUPPORT REACH AND GRACE (tuning for placing the next support). Roof cells within the reach of a support already count 3 x its bonus extra cells. Past that reach the plain safe length
// (4 to 6 cells at 500 to 1,000 m, 3 at the floor of the rule) left almost no room to dig the four cells the next cube needs and set it before the roof came down (a roof went from creaking to
// falling in 0.4 to 1.4 s). A roof whose NEAREST anchor is a support (not the open mouth or a wall) now holds SUP_EXTRA more cells (1.8 m), and a roof that is over even that waits GRACE_T seconds
// longer before it lets go, creaking all the while, when it is up to GRACE_FULL cells over, fading to nothing at GRACE_END cells over. So a player who overshoots by 1 to 3 cells has about 3 s to
// set the next support (which saves the roof); one who overshoots by 6 or more, and any roof with no support in reach at all (a huge cavern, a mouth far away), falls as quickly as it always did.
export const SUP_EXTRA = 3;
export const GRACE_T = 2.5;
export const GRACE_FULL = 3;
export const GRACE_END = 6;
// THE THIN CAP RULE (on top of the tunnel rule, never instead of it). A roof also has to be thick enough for its span. The span of a roof cell is the shorter of the two runs of open
// cavity through it (the width of the cap along x and along z: a wall of plush, a support's reach or the end of the roof ends a run; a hole of THIN_HOLE cells or fewer in the cap does not). Spans up to THIN_SPAN
// cells (3.6 m: every tunnel, the 4 wide frame tunnel and the 6 wide haul arch) never fail on thickness. A wider roof needs cover of at least span / THIN_RATIO cells: the plush from
// the roof cell up to the first air (the open top of the pile, or the next cavity above). So a 20 by 20 room needs 7 cells over it, a 30 wide hall 10, and a thin cap over a huge dug area
// comes down although it has a few holes in it (a hole of THIN_HOLE cells or fewer does not shorten a span, so one fallen cell never starts to hold what is left). What remains of a cap
// that has come down are pieces no wider than THIN_SPAN along the walls, which stand. A cell that has started to creak is judged again when its time is up with every open cell counting
// (`strict`), so the holes the first cells leave never save the rest of a cap that is coming down. Cover of THIN_REACH / THIN_RATIO cells or more is never checked.
export const THIN_SPAN = 6;
export const THIN_RATIO = 3;
export const THIN_REACH = 30;
export const THIN_HOLE = 3;     // a gap of up to this many cells in a cap does not shorten its span
export const THIN_LEAD = 0.9;   // seconds a thin cap creaks at the very least before its first piece lets go (the creak sound and the hint come after 0.7 s of overload)
const STAB_MAX = 50000;   // a flood of edits (a forged guest message, a huge blast) never leaves more than this waiting for a roof check

// The hall is a huge lattice of plush cells (0.6 m). Storage is lazy: 16x16 column chunks are generated from the
// seed on first touch, and only modified columns are kept forever. Everything else can be evicted and regenerated.
export class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.cols = new Map();
    this.diffCols = new Map();    // colKey -> Map(localIndex -> [sp, vr])  (persistent edits)
    this.diffCount = 0;
    this.dirtyChunks = new Set();
    this.chunkMod = new Uint8Array(CX * CY * CZ);
    this.stabQueue = [];
    this.creaking = new Map();
    this.chimney = new Map();       // column -> height of the first roof cell that fell (collapses stop climbing after ARCH cells)
    this.supports = [];
    this.reserved = new Set();    // cells occupied by belts/machines (no plush may settle there)
    this.stabBonus = 0;
    this.needle = { i: 0, j: 0, k: 0 };
    this.isl = new Islands(this);   // plush cut off from the pile (island.js)
    this._lk = -1; this._lc = null;
    this.placeNeedle();
  }

  // ---------- generation ----------
  heightAt(x, z) {
    const sd = this.seed;
    const wk = smoothstep(6, 28, Math.hypot(x, z)) * 22;
    const wx = x + (fbm2(x * 0.03 + 3, z * 0.03, sd, 3) - 0.5) * wk;
    const wz = z + (fbm2(x * 0.03, z * 0.03 + 7, sd + 5, 3) - 0.5) * wk;
    const ang = Math.atan2(wz, wx);
    const r = Math.hypot(wx, wz) * (1 + 0.22 * Math.sin(ang * 3 + sd) + 0.12 * Math.sin(ang * 5 - sd * 0.7));
    const t = smoothstep(9, 46, r);
    const ridge = fbm2(x * 0.09, z * 0.09, sd + 11, 4);
    const base = Math.pow(t, 1.55) * HALL_H * 1.12;
    const bumps = (ridge - 0.5) * 6 * smoothstep(7, 18, r);
    const floorTerr = (fbm2(x * 0.2, z * 0.2, sd + 2, 2) - 0.5) * 0.9 * smoothstep(6, 11, r);
    return clamp(base + bumps + floorTerr, 0, HALL_H);
  }

  placeNeedle() {
    // The One hides in a far corner of the hall, 6.0 to 6.25 km from the start (the exit is 4.9 km east, so it is well past the exit).
    const rnd = mulberry32(this.seed ^ 0xabcdef);
    const lim = (NX * C) / 2 - 60;
    for (let t = 0; t < 400; t++) {
      const a = rnd() * Math.PI * 2;
      const r = 6000 + rnd() * 250;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
      const i = toI(x), k = toK(z);
      const j = 6 + Math.floor(rnd() * 34);
      this.needle = { i, j, k };
      return;
    }
    this.needle = { i: NX - 300, j: 20, k: NZ - 300 };
  }

  // rich veins: drifting blobs ~10 m across where rarer plush gather
  veinAt(i, j, k) { return vnoise2(i / 16 + j / 23, k / 16 - j / 19, this.seed + 99); }
  // the closest rich vein (veinAt above VEIN_T) to a spot, looking at the heights around j; null if none within `range` metres
  // how high the pile stood before anyone dug: the same rule makeCol uses, without generating the column (a far search must stay cheap)
  baseTop(i, k) { const x = cellX(i), z = cellZ(k); return x * x + z * z > 85 * 85 ? NY : Math.min(NY, Math.floor(this.heightAt(x, z) / C)); }
  nearestVein(x, y, z, range) {
    const ci = toI(x), ck = toK(z), cj = toJ(y), R = Math.ceil(range / C);
    let best = null, bd = 1e9;
    // every cell near the player, every second cell further out, every third far away (a vein can be a blob smaller than the far spacing, but the near ones are never missed)
    for (const [lim, step, skip] of [[25, 1, -1], [60, 2, 25], [R, 3, 60]]) {
      const L = Math.min(lim, R);
      for (const dj of [0, -8, 8, -16, 16, -32]) {
        const j = cj + dj; if (j < 1 || j > NY - 2 || Math.abs(dj) * C > range) continue;   // (the range counts up and down too: a vein 5 m overhead is not inside a 0.5 m range)
        for (let dk = -L; dk <= L; dk += step) for (let di = -L; di <= L; di += step) {
          if (Math.abs(di) <= skip && Math.abs(dk) <= skip) continue;   // (a finer pass did that cell)
          const d2 = di * di + dk * dk; if (d2 > R * R || d2 + dj * dj >= bd) continue;
          const i = ci + di, k = ck + dk; if (!this.inside(i, j, k)) continue;
          if (this.veinAt(i, j, k) > VEIN_T && j < this.baseTop(i, k)) { bd = d2 + dj * dj; best = { i, j, k }; }   // a vein is in the pile, never in the open air above it
        }
      }
    }
    if (!best) return null;
    const bx = cellX(best.i), by = cellY(best.j), bz = cellZ(best.k);
    return { x: bx, y: by, z: bz, d: Math.hypot(bx - x, by - y, bz - z) };
  }

  colKey(cx, cz) { return cz * NCX + cx; }

  makeCol(cx, cz) {
    const sd = this.seed;
    const col = { sp: new Uint16Array(COLSZ), vr: new Uint8Array(COLSZ), top: new Int16Array(256), mod: false, cx, cz };
    for (let lk = 0; lk < 16; lk++) {
      const k = cz * 16 + lk;
      const z = cellZ(k);
      for (let li = 0; li < 16; li++) {
        const i = cx * 16 + li;
        const x = cellX(i);
        const d2 = x * x + z * z, band = bandOfD2(d2);   // how far from the bay decides which species this plush can be (plushdata.js REGIONS)
        const hc = d2 > 85 * 85 ? NY : Math.min(NY, Math.floor(this.heightAt(x, z) / C));
        col.top[lk * 16 + li] = hc;
        for (let j = 0; j < hc; j++) {
          const h1 = h32(i, j, k, sd);
          const h2 = Math.imul(h1, 0x9e3779b1) ^ (h1 >>> 15);
          const b = (j * 16 + lk) * 16 + li;
          col.sp[b] = pickSpecies(h1 >>> 4, h2 >>> 0, this.veinAt(i, j, k) > VEIN_T, band);
          col.vr[b] = ((h1 >>> 1) & 127) | ((h2 >>> 0) % 140 === 0 ? 128 : 0);
        }
      }
    }
    this.carveWorkings(col, cx, cz);
    const n = this.needle;
    if ((n.i >> 4) === cx && (n.k >> 4) === cz && this.diffNeedleFree(n)) {
      const b = (n.j * 16 + (n.k & 15)) * 16 + (n.i & 15);
      col.sp[b] = NEEDLE; col.vr[b] = 64;
      if (n.j + 1 > col.top[(n.k & 15) * 16 + (n.i & 15)]) col.top[(n.k & 15) * 16 + (n.i & 15)] = n.j + 1;
    }
    const d = this.diffCols.get(this.colKey(cx, cz));
    if (d) {
      for (const [b, [sp, vr]] of d) { col.sp[b] = sp; col.vr[b] = vr; }
      col.mod = true;
      for (let c = 0; c < 256; c++) {
        let t = NY;
        while (t > 0 && col.sp[(((t - 1) * 16) + (c >> 4)) * 16 + (c & 15)] === 0) t--;
        col.top[c] = t;
      }
    }
    return col;
  }

  // dig the old crews' tunnels into a freshly generated column
  carveWorkings(col, cx, cz) {
    const i0 = cx * 16, k0 = cz * 16;
    const list = workingsNear(this.seed, i0 + 8, k0 + 8, 140);
    if (!list.length) return;
    const DXs = [1, 0, -1, 0], DZs = [0, 1, 0, -1];
    for (const w of list) {
      const px = DZs[w.dir] !== 0 ? 1 : 0, pz = DXs[w.dir] !== 0 ? 1 : 0;
      for (let t = 0; t <= w.len; t++) {
        const plug = workingPlugged(w, t);
        for (let l = 0; l < 2; l++) {
          const i = w.i0 + DXs[w.dir] * t + px * l, k = w.k0 + DZs[w.dir] * t + pz * l;
          if (i < i0 || i >= i0 + 16 || k < k0 || k >= k0 + 16) continue;
          for (let j = 0; j < 3; j++) {
            const b = (j * 16 + (k - k0)) * 16 + (i - i0);
            if (plug) continue;
            if (t === 0 && w.barricade) { col.sp[b] = BULK; col.vr[b] = (t * 13 + j * 31 + l * 7) & 127; }
            else { col.sp[b] = 0; col.vr[b] = 0; }
          }
        }
      }
      // a supply cache halfway along, when the tunnel is long enough and the spot is not caved in
      const mt = Math.floor(w.len / 2);
      if (w.len >= 44 && !workingPlugged(w, mt) && (w.id & 3) !== 0) {
        const ci2 = w.i0 + DXs[w.dir] * mt, ck2 = w.k0 + DZs[w.dir] * mt;
        if (ci2 >= i0 && ci2 < i0 + 16 && ck2 >= k0 && ck2 < k0 + 16) { const b = (0 * 16 + (ck2 - k0)) * 16 + (ci2 - i0); col.sp[b] = CACHE; col.vr[b] = (w.id >> 3) & 127; }
      }
      // what is left of the last person to work here
      const ri = w.ei, rk = w.ek;
      if (ri >= i0 && ri < i0 + 16 && rk >= k0 && rk < k0 + 16) {
        const b = (0 * 16 + (rk - k0)) * 16 + (ri - i0);
        col.sp[b] = REMAINS; col.vr[b] = w.id & 127;
      }
    }
  }

  // nearest remaining abandoned gear to a world position, or null
  remainsNear(x, z, range) {
    const ci = toI(x), ck = toK(z);
    let best = null, bd = range * range;
    for (const w of workingsNear(this.seed, ci, ck, Math.ceil(range / C) + 4)) {
      if (this.get(w.ei, 0, w.ek) !== REMAINS) continue;
      const dx = cellX(w.ei) - x, dz = cellZ(w.ek) - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = { x: cellX(w.ei), z: cellZ(w.ek), i: w.ei, k: w.ek, d: Math.sqrt(d) }; }
    }
    return best;
  }

  // the n nearest remaining dig sites within range, nearest first (the Remains Radar marks several at once)
  remainsNearN(x, z, range, n) {
    const ci = toI(x), ck = toK(z), out = [];
    for (const w of workingsNear(this.seed, ci, ck, Math.ceil(range / C) + 4)) {
      if (this.get(w.ei, 0, w.ek) !== REMAINS) continue;
      const dx = cellX(w.ei) - x, dz = cellZ(w.ek) - z, d = Math.hypot(dx, dz);
      if (d < range) out.push({ x: cellX(w.ei), z: cellZ(w.ek), i: w.ei, k: w.ek, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, n);
  }

  // the needle cell is never regenerated once the player has altered that column
  diffNeedleFree(n) {
    const d = this.diffCols.get(this.colKey(n.i >> 4, n.k >> 4));
    if (!d) return true;
    const b = (n.j * 16 + (n.k & 15)) * 16 + (n.i & 15);
    return !d.has(b);
  }

  col(cx, cz) {
    const key = cz * NCX + cx;
    if (key === this._lk) return this._lc;
    let c = this.cols.get(key);
    if (!c) { c = this.makeCol(cx, cz); this.cols.set(key, c); }
    this._lk = key; this._lc = c;
    return c;
  }

  // ---------- queries ----------
  inside(i, j, k) { return i >= 0 && i < NX && k >= 0 && k < NZ && j >= 0 && j < NY; }
  get(i, j, k) {
    if (j < 0 || j >= NY || i < 0 || i >= NX || k < 0 || k >= NZ) return 0;
    return this.col(i >> 4, k >> 4).sp[((j * 16) + (k & 15)) * 16 + (i & 15)];
  }
  getVr(i, j, k) {
    if (j < 0 || j >= NY || i < 0 || i >= NX || k < 0 || k >= NZ) return 0;
    return this.col(i >> 4, k >> 4).vr[((j * 16) + (k & 15)) * 16 + (i & 15)];
  }
  solid(i, j, k) {
    if (j < 0) return true;
    if (j >= NY || i < 0 || i >= NX || k < 0 || k >= NZ) return true;
    return this.col(i >> 4, k >> 4).sp[((j * 16) + (k & 15)) * 16 + (i & 15)] !== 0;
  }
  topAt(i, k) {
    if (i < 0 || i >= NX || k < 0 || k >= NZ) return NY;
    return this.col(i >> 4, k >> 4).top[(k & 15) * 16 + (i & 15)];
  }
  chunkIndex(i, j, k) { return ((j >> 4) * CZ + (k >> 4)) * CX + (i >> 4); }

  markDirty(i, j, k) {
    const ci = i >> 4, cj = j >> 4, ck = k >> 4;
    const li = i & 15, lj = j & 15, lk = k & 15;
    const set = (a, b, c) => {
      if (a < 0 || b < 0 || c < 0 || a >= CX || b >= CY || c >= CZ) return;
      const id = (b * CZ + c) * CX + a;
      this.dirtyChunks.add(id);
      this.chunkMod[id] = 1;
    };
    // the renderer draws a two-cell shell (and one more layer near the camera), so an edit can change what the NEXT chunk must
    // draw up to two cells away: re-scan neighbours across a two-cell border, in all directions
    set(ci, cj, ck);
    const sx = li <= 1 ? -1 : li >= CS - 2 ? 1 : 0, sz = lk <= 1 ? -1 : lk >= CS - 2 ? 1 : 0, sy = lj <= 1 ? -1 : lj >= CS - 2 ? 1 : 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      if (!a && !b && !c) continue;
      if ((a && a !== sx) || (b && b !== sy) || (c && c !== sz)) continue;
      set(ci + a, cj + b, ck + c);
    }
  }

  setCell(i, j, k, sp, vr = 0) {
    const col = this.col(i >> 4, k >> 4);
    const b = ((j * 16) + (k & 15)) * 16 + (i & 15);
    col.sp[b] = sp; col.vr[b] = vr;
    if (!col.mod) col.mod = true;
    const key = this.colKey(i >> 4, k >> 4);
    let d = this.diffCols.get(key);
    if (!d) { d = new Map(); this.diffCols.set(key, d); }
    if (!d.has(b)) this.diffCount++;
    d.set(b, [sp, vr]);
    const c = (k & 15) * 16 + (i & 15);
    if (sp !== 0) {
      if (j + 1 > col.top[c]) col.top[c] = j + 1;
    } else if (j + 1 === col.top[c]) {
      let t = j;
      while (t > 0 && col.sp[(((t - 1) * 16) + (k & 15)) * 16 + (i & 15)] === 0) t--;
      col.top[c] = t;
    }
    this.markDirty(i, j, k);
    if (this.onSet && !this._remoteApply) this.onSet(i, j, k, sp, vr);
  }

  removeCell(i, j, k, queue = true) {
    if (!this.inside(i, j, k)) return null;
    const sp = this.get(i, j, k);
    if (!sp || isSpecialCell(sp)) return null;
    const vr = this.getVr(i, j, k);
    this.setCell(i, j, k, 0, 0);
    if (queue) this.stabQueue.push({ i, j, k });
    if (this.onRemove) this.onRemove(i, j, k);
    return { sp, vr };
  }

  // iterate persistent edits as [idx, sp, vr]
  forEachDiff(cb) {
    for (const [key, d] of this.diffCols) {
      const cx = key % NCX, cz = Math.floor(key / NCX);
      for (const [b, [sp, vr]] of d) {
        const li = b & 15, lk = (b >> 4) & 15, j = b >> 8;
        cb(((j * NZ) + (cz * 16 + lk)) * NX + (cx * 16 + li), sp, vr);
      }
    }
  }
  // the same edits as forEachDiff, as arrays of [idx, sp, vr, ...] of at most `max` numbers: a late joiner is sent a few slices a frame (netgame.js)
  *diffSlices(max = 3000) {
    let buf = [];
    for (const [key, d] of this.diffCols) {
      const cx = key % NCX, cz = Math.floor(key / NCX);
      for (const [b, [sp, vr]] of d) {
        const li = b & 15, lk = (b >> 4) & 15, j = b >> 8;
        buf.push(((j * NZ) + (cz * 16 + lk)) * NX + (cx * 16 + li), sp, vr);
        if (buf.length >= max) { yield buf; buf = []; }
      }
    }
    if (buf.length) yield buf;
  }
  restoreDiff(i, j, k, sp, vr) {
    const key = this.colKey(i >> 4, k >> 4);
    const b = ((j * 16) + (k & 15)) * 16 + (i & 15);
    let d = this.diffCols.get(key);
    if (!d) { d = new Map(); this.diffCols.set(key, d); }
    if (!d.has(b)) this.diffCount++;
    d.set(b, [sp, vr]);
    this.cols.delete(key); this._lk = -1;
    this.markDirty(i, j, k);   // a restored edit (a loaded save, a late joiner's world list) marks its chunk as edited too: the remesh skips a chunk that holds no edit and lies under the surface, and a dug tunnel deep in the pile would not be drawn
  }

  // drop untouched columns far from the player
  evict(ci, ck, radiusCells) {
    const r2 = (radiusCells >> 4) + 2;
    const pcx = ci >> 4, pcz = ck >> 4;
    for (const [key, c] of this.cols) {
      if (c.mod) continue;
      if (this.pins && this.pins.has(c.cz * NCX + c.cx)) continue;
      if (Math.abs(c.cx - pcx) > r2 || Math.abs(c.cz - pcz) > r2) this.cols.delete(key);
    }
    this._lk = -1;
  }

  // ---------- supports ----------
  supportBonus(x, y, z) {
    if (this._sgLen !== this.supports.length || this._sgRef !== this.supports) this.buildSupportGrid();
    let b = 0;
    const check = (s) => {
      const dx = x - s.x, dy = y - s.y, dz = z - s.z;
      if (dx * dx + dy * dy + dz * dz < s.r * s.r && s.b > b) b = s.b;
    };
    const gx = Math.floor(x / 16), gz = Math.floor(z / 16);
    for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) {
      const arr = this._sg.get((gz + c) * 100000 + (gx + a));
      if (arr) for (const s of arr) check(s);
    }
    for (const s of this._movers) check(s);
    return b;
  }

  buildSupportGrid() {
    this._sg = new Map(); this._movers = [];
    for (const s of this.supports) {
      if (typeof s.id === 'string' && s.id.startsWith('shield')) { this._movers.push(s); continue; }
      const k = Math.floor(s.z / 16) * 100000 + Math.floor(s.x / 16);
      let arr = this._sg.get(k); if (!arr) { arr = []; this._sg.set(k, arr); }
      arr.push(s);
    }
    this._sgLen = this.supports.length; this._sgRef = this.supports;
  }

  // how much extra roof strength the pile needs the further you are from the start (denser, heavier plush)
  depthPenalty(i, k) {
    const x = cellX(i), z = cellZ(k);
    const d = Math.hypot(x, z);
    return Math.floor(Math.max(0, d - 40) / 330);
  }

  // length (in cells) from this cavity cell to the nearest anchor, searching through the cavity; Infinity if none within maxD.
  // Past maxD (up to supD) only a SUPPORT counts as an anchor (the open mouth and walls end at maxD): `this._ak` says what the anchor it returned was (2 a support, 1 the mouth or a wall).
  cavityLen(i, j, k, maxD, supD = maxD) {
    const open = (ci, ck) => this.topAt(ci, ck) <= j;
    const wall = (a, b) => { const q = this.get(a, j, b); return q === BULK || q === PAD; };   // a bulkhead or a floor pad cell at this height holds the roof edge (build shell: a pad is never a roof itself, see stress)
    const kindOf = (ci, ck) => open(ci, ck) ? 1 : this.supportBonus(cellX(ci), cellY(j), cellZ(ck)) > 0 ? 2 : (wall(ci + 1, ck) || wall(ci - 1, ck) || wall(ci, ck + 1) || wall(ci, ck - 1)) ? 1 : 0;
    const k0 = kindOf(i, k); if (k0) { this._ak = k0; return 0; }
    const seen = new Set([k * 16384 + i]), cap = CAVITY_CAP + (this.capPerStep ?? CAVITY_PER_STEP) * supD;   // capPerStep: a test sets 0 to measure the old fixed allowance
    let frontier = [[i, k]], visited = 1;
    for (let d = 1; d <= supD; d++) {
      const next = [];
      for (const [ci, ck] of frontier) {
        for (let n = 0; n < 4; n++) {
          const ni = ci + (n === 0 ? 1 : n === 1 ? -1 : 0);
          const nk = ck + (n === 2 ? 1 : n === 3 ? -1 : 0);
          const key = nk * 16384 + ni;
          if (seen.has(key)) continue;
          seen.add(key);
          if (this.solid(ni, j, nk)) continue;      // the cavity continues only through empty cells at this height
          if (++visited > cap) return Infinity;
          const kd = kindOf(ni, nk);
          if (kd && (d <= maxD || kd === 2)) { this._ak = kd; return d; }
          next.push([ni, nk]);
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
    // a small sealed pocket (a few plush pulled out of the pile) is not a tunnel: the pile arches over it and holds
    if (!frontier.length && visited < MIN_CAVITY) return 0;
    return Infinity;
  }

  lateralDist(i, j, k, maxD) {
    const seen = new Set([k * 16384 + i]);
    let frontier = [[i, k]];
    for (let d = 1; d <= maxD; d++) {
      const next = [];
      for (const [ci, ck] of frontier) {
        for (let n = 0; n < 4; n++) {
          const ni = ci + (n === 0 ? 1 : n === 1 ? -1 : 0);
          const nk = ck + (n === 2 ? 1 : n === 3 ? -1 : 0);
          const key = nk * 16384 + ni;
          if (seen.has(key)) continue;
          seen.add(key);
          const s = this.get(ni, j, nk);
          if (!s) continue;
          if (s === BULK || s === PAD || this.solid(ni, j - 1, nk)) return d;
          next.push([ni, nk]);
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
    return Infinity;
  }

  // the width of the cap over the cavity through (i, k) along one axis: the roof cell itself and the roofed cells either way (open at level j - 1, plush at level j) until plush at the
  // cavity level (a wall), a support's reach, the end of the roof (more than THIN_HOLE cells with no roof: the mouth of a cut, the open ground beside a slope) or the world edge.
  // A hole of THIN_HOLE cells or fewer in the cap (a shaft, a few plush that fell) does not end a run. `strict` ignores where the roof ends (every open cell counts): that is how a
  // roof that is already coming down is judged again when its time is up, so the holes the first cells leave never save the rest of a cap.
  // It stops counting past `max` (callers only ask whether a run is longer than some length).
  runLen(i, j, k, di, dk, max, strict = false) {
    const jb = j - 1; let n = 1; const sup = this.supports.length > 0;
    for (let s = 1; s >= -1; s -= 2) {
      let pend = 0;
      for (let c = 1; n + pend <= max; c++) {
        const ci = i + di * s * c, ck = k + dk * s * c;
        if (ci < 0 || ci >= NX || ck < 0 || ck >= NZ) break;
        if (this.get(ci, jb, ck) !== 0) break;
        if (sup && this.supportBonus(cellX(ci), cellY(jb), cellZ(ck)) > 0) break;
        if (strict) { n++; continue; }
        if (this.get(ci, j, ck) !== 0) { n += pend + 1; pend = 0; continue; }
        if (++pend > THIN_HOLE) break;
      }
    }
    return n;
  }

  // the thin cap rule for a roof cell (solid, air under it): null when the cover is thick enough for the span, else { span, T, need }
  thinRoof(i, j, k, strict = false) {
    if (this.thinOff) return null;
    const maxT = Math.ceil(THIN_REACH / THIN_RATIO);
    let T = 0;
    for (let jj = j; jj < NY && T < maxT; jj++) { if (!this.get(i, jj, k)) break; T++; }
    if (T >= maxT) return null;                       // cover this thick holds any span the rule looks at
    const L = Math.max(THIN_SPAN, T * THIN_RATIO);   // the roof fails when both runs are longer than 3 x its thickness (and than THIN_SPAN)
    if (this.supports.length && this.supportBonus(cellX(i), cellY(j - 1), cellZ(k)) > 0) return null;
    if (this.runLen(i, j, k, 1, 0, L, strict) <= L) return null;
    if (this.runLen(i, j, k, 0, 1, L, strict) <= L) return null;
    const span = Math.min(this.runLen(i, j, k, 1, 0, THIN_REACH, strict), this.runLen(i, j, k, 0, 1, THIN_REACH, strict));
    return { span, T, need: Math.max(T + 1, Math.ceil(span / THIN_RATIO)) };
  }

  stress(i, j, k, strict = false) {
    if (j === 0) return null;
    const s0 = this.get(i, j, k);
    if (!s0 || s0 === BULK || s0 === PAD || this.solid(i, j - 1, k)) return null;   // bulkheads and floor pads never fall
    const over = Math.max(0, this.topAt(i, k) - j - 1);
    const sup = this.supportBonus(cellX(i), cellY(j), cellZ(k));
    // safe length: shrinks with the weight above and the distance from the bay, grows with tamping and strong frames
    // (the floor applies to the pile's own weight; tamping and props are added on top, so they work at any depth)
    const limit = Math.max(MIN_SAFE, SAFE_LEN - Math.floor(over / OB) - 2 * this.depthPenalty(i, k)) + 2 * this.stabBonus + 3 * sup;
    // a wide roof under thin cover fails whatever its distance to an anchor, and it does not arch (the chimney limit below is for thick cover only)
    const thin = this.thinRoof(i, j, k, strict);
    if (thin) return { margin: thin.T - thin.need, d: Infinity, B: limit, thin };
    const base = this.chimney.get(k * 16384 + i);
    if (base !== undefined && j - base >= ARCH) return null; // arched: this part of the pile has already settled over the void
    this._ak = 0;
    const xt = this.supExtra ?? SUP_EXTRA, gt = this.graceT ?? GRACE_T;   // (a test sets supExtra and graceT to 0 to measure the old rule)
    const L = this.cavityLen(i, j - 1, k, limit, limit + xt + (gt > 0 ? GRACE_END - 1 : 0));
    const lim = this._ak === 2 ? limit + xt : limit;   // a roof held by a support reaches SUP_EXTRA further than one held by the open mouth or a wall
    const margin = lim - L;
    // how long a roof just past that waits before it lets go (world.scanRegion): the closer to the limit, the longer
    const grace = margin < 0 && this._ak === 2 && isFinite(L) && -margin < GRACE_END ? gt * Math.min(1, (GRACE_END + margin) / (GRACE_END - GRACE_FULL)) : 0;
    return { margin, d: L, B: limit, grace };
  }

  // Slope physics: how readily does this surface plush slide when something heavy presses on it?
  // Returns { p, dx, dz } or null if buried/fully braced.
  slipChance(i, j, k, strength) {
    const s0 = this.get(i, j, k);
    if (!s0 || s0 === BULK || s0 === PAD) return null;
    // a tunnel floor or wall has a roof over it and is held by the pile: only open slopes slide
    if (this.solid(i, j + 2, k) || this.solid(i, j + 3, k) || this.solid(i, j + 4, k)) return null;
    let free = 0, dx = 0, dz = 0;
    for (let n = 0; n < 4; n++) {
      const a = n === 0 ? 1 : n === 1 ? -1 : 0, b = n === 2 ? 1 : n === 3 ? -1 : 0;
      if (!this.solid(i + a, j, k + b)) { free++; dx += a; dz += b; }
    }
    const above = !this.solid(i, j + 1, k);
    if (!above && free === 0) return null;
    let below = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (this.solid(i + a, j - 1, k + b)) below++;
    // loosely held cells (few below, free sides) slide easily; compact flat cells hardly ever
    const loose = free * 0.13 + (9 - below) * 0.085 + (above ? 0.03 : 0);
    const l = Math.hypot(dx, dz) || 1;
    return { p: clamp(strength * loose * (this.slipMul ?? 1), 0, 0.95), dx: dx / l, dz: dz / l, free, below };
  }

  scanRegion(i0, j0, k0, warn) {
    const mark = (i, j, k) => {
      if (!this.inside(i, j, k)) return;
      const id = (j * NZ + k) * NX + i;
      if (this.creaking.has(id) || this.isl.cellIsl.has(id)) return;   // (a cell of a cut off slab is island.js's: it falls with the slab, not on its own)
      const s = this.stress(i, j, k);
      if (s && s.margin < 0) {
        // a thin cap over a wide room lets go widest and thinnest first
        const f = s.thin ? 0.3 + 0.7 * Math.min(1, s.thin.T / s.thin.need) : 1;
        // (no piece of a thin cap lets go before THIN_LEAD seconds after the first one began to creak, so the creak sound and the hint, announced after 0.7 s, come before anything falls:
        // the thinnest cap used to give 0.2 s. A piece flagged later in the same cave-in waits only for what is left of that lead)
        let lead = 0;
        if (s.thin) {
          const now = this._clock || 0;
          if (this._thinT0 === undefined || !this.creaking.size || now - (this._thinLast === undefined ? -1e9 : this._thinLast) > 1) this._thinT0 = now;   // (a new cap, not one that is already coming down)
          lead = Math.max(0, THIN_LEAD - (now - this._thinT0));
        }
        this.creaking.set(id, { i, j, k, t: lead + (s.grace || 0) + warn * (0.35 + Math.random() * 0.9) * f, thin: !!s.thin });
        if (s.thin) this._thinSeen = true;
        if (this.onCreakCell) this.onCreakCell(i, j, k);
      }
    };
    for (let j = j0 - 1; j <= j0 + 2; j++) for (let k = k0 - 5; k <= k0 + 5; k++) for (let i = i0 - 5; i <= i0 + 5; i++) mark(i, j, k);
    // plush taken off the top of a cap thins it: the roofs under that column are looked at again, as far down as the thin cap rule reaches
    for (let j = j0 - 2; j >= Math.max(1, j0 - Math.ceil(THIN_REACH / THIN_RATIO)); j--) mark(i0, j, k0);
  }

  updateStability(dt, warn, hooks) {
    let budget = 24;
    this._clock = (this._clock || 0) + dt;
    if (this.stabQueue.length > STAB_MAX) this.stabQueue.splice(0, this.stabQueue.length - STAB_MAX);
    const isl = hooks.releaseIsland && !this.isl.off;
    while (this.stabQueue.length && budget-- > 0) {
      const q = this.stabQueue.shift();
      const before = this.creaking.size;
      this._thinSeen = false;
      this.scanRegion(q.i, q.j, q.k, warn);
      if (isl) this.isl.around(q.i, q.j, q.k);   // the cells around every edit are asked whether they are still joined to the pile (island.js)
      if (hooks.onRegion) hooks.onRegion(cellX(q.i), cellY(q.j), cellZ(q.k));
      if (this.creaking.size > before && hooks.onCreak) (this._announce || (this._announce = [])).push({ i: q.i, j: q.j, k: q.k, t: 0.7, n: this.creaking.size - before, thin: this._thinSeen });
    }
    this.isl.update(dt, warn, hooks);
    // a creak is only worth a sound once the roof has stayed overloaded for a moment (grabbing a few plush leaves pockets that
    // settle at once), and no more than one every few seconds
    this._creakCool = Math.max(0, (this._creakCool || 0) - dt);
    if (this._announce && this._announce.length) {
      for (const an of this._announce) an.t -= dt;
      const ready = this._announce.filter((an) => an.t <= 0);
      if (ready.length) {
        this._announce = this._announce.filter((an) => an.t > 0);
        for (const an of ready) {
          let still = 0;
          for (let dj = -1; dj <= 2 && !still; dj++) for (let dk = -5; dk <= 5 && !still; dk++) for (let di = -5; di <= 5; di++) { const c = this.creaking.get(((an.j + dj) * NZ + an.k + dk) * NX + an.i + di); if (c) { still++; break; } }
          if (still && this._creakCool <= 0) { this._creakCool = 5; hooks.onCreak(cellX(an.i), cellY(an.j), cellZ(an.k), an.n, an.thin); }
        }
      }
    }
    if (!this.creaking.size) { this._thinT0 = undefined; return; }
    const done = [];
    let thinN = 0;
    for (const [id, c] of this.creaking) {
      c.t -= dt;
      if (c.thin) thinN++;
      if (c.t <= 0) done.push([id, c]);
    }
    if (thinN) this._thinLast = this._clock; else this._thinT0 = undefined;   // (when no thin cap is coming down any more, the next one gets its own lead)
    let released = 0;
    // a collapse runs like dominoes, not all at once: roof cells let go at a limited rate so a long tunnel comes down over a few seconds.
    // A thin cap over a wide room is hundreds of cells: it speeds up with the number waiting (a 20 by 20 cap is down in a few seconds, not in a quarter of a minute)
    this._relBudget = Math.min(30 + Math.min(90, thinN * 0.3), (this._relBudget || 0) + dt * (24 + Math.min(180, thinN * 0.6)));
    for (const [id, c] of done) {
      this.creaking.delete(id);
      if (c.isl || this.isl.cellIsl.has(id)) continue;   // a marker on a cut off slab, or a cell that joined one: the slab is island.js's, the marker only warns
      const s = c.force ? { margin: -1 } : this.stress(c.i, c.j, c.k, !!c.thin);
      if (s && s.margin < 0) {
        if (this._relBudget >= 1 && hooks.release(c.i, c.j, c.k)) {
          this._relBudget -= 1;
          const ck2 = c.k * 16384 + c.i; if (!this.chimney.has(ck2)) this.chimney.set(ck2, c.j);
          released++;
          this.stabQueue.push({ i: c.i, j: c.j, k: c.k });
        } else this.creaking.set(id, { ...c, t: 0.25 });
      }
    }
  }
}
