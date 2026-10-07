// Daylight through holes. A shaft dug up and out of the pile lets the hall's light down into the tunnel under it, a few cells sideways along open air, and stops when
// anything (plush sliding in, a floor plate, a wall section or door across it) closes the column again.
//
// What counts as a hole cell: an AIR cell with nothing above it in its column (it sees the hall) that sits at the bottom of a walled well, that is
//   * its column's neighbours rise at least HOLE_MIN cells over it (the rim),
//   * at least two of its four orthogonal neighbour columns are walls (HOLE_WALL cells over it), and
//   * it is walled in on all eight sides within two cells (a column HOLE_WALL cells over it at one or two steps in every direction), so only a narrow well, up to 2 wide, is a
//     hole: a steep natural slope, the foot of a cliff, a tunnel mouth or a wide pit is open to the hall anyway and keeps the plain sky light.
// Its strength is 1 for the first HOLE_FULL cells (7.2 m) under the rim and fades to HOLE_FLOOR by HOLE_FADE (16.8 m): the same 7 m and 17 m the tunnel rule of renderEnv uses.
// The light then spills along COVERED air (air with plush over it) at the same height: eight way steps that may not cut a corner, at most HOLE_R steps (3.6 m), losing
// (1 - d / (R + 1))^3. The nearest hole cell wins (ties go to the stronger), so a plush, a wall, a door or a plate in the way simply is not air and stops it.
// Pure functions of the cells: host and guest, a late joiner and a loaded save all see the same light, and nothing here is ever sent.
//
// Two evaluators that agree (tests compare them cell for cell): `holeAt` answers one cell (the camera), `windowFor` fills a field for a whole chunk (render.js scanChunk).
import { NX, NZ, NY, CS } from './config.js';

export const HOLE_R = 6;
export const HOLE_MIN = 3;
export const HOLE_WALL = 2;
export const HOLE_FULL = 12;
export const HOLE_FADE = 28;
export const HOLE_FLOOR = 0.25;
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];   // the eight steps: four straight, four diagonal
export const BEAM_MIN = 5;   // a shaft shows a beam of light when it is this many cells deep

export function strength(D) {
  const t = Math.min(1, Math.max(0, (D - HOLE_FULL) / (HOLE_FADE - HOLE_FULL)));
  return 1 - (1 - HOLE_FLOOR) * t * t * (3 - 2 * t);
}
const FALL = Array.from({ length: HOLE_R + 2 }, (_, d) => { const f = Math.max(0, 1 - d / (HOLE_R + 1)); return f * f * f; });
export const falloff = (d) => FALL[Math.min(d, HOLE_R + 1)];

// the top level (inclusive) of the hole in a column, or -1. v holds the column tops: [0] the column, [1..8] its eight neighbours and [9..16] the cells two steps away in the same
// eight directions (+x, -x, +z, -z, +x+z, +x-z, -x+z, -x-z). Sets _rim, the highest neighbour.
let _rim = 0;
function holeTop(v) {
  const t = v[0], m = t + HOLE_WALL;
  let n2 = 0; if (v[1] >= m) n2++; if (v[2] >= m) n2++; if (v[3] >= m) n2++; if (v[4] >= m) n2++;
  if (n2 < 2) return -1;
  let rim = 0, wall = 1 << 20;
  for (let q = 1; q <= 8; q++) { const a = v[q], b = v[q + 8]; if (a > rim) rim = a; const e = a > b ? a : b; if (e < wall) wall = e; }
  _rim = rim;
  const jt = Math.min(rim - HOLE_MIN, wall - HOLE_WALL);
  return jt >= t ? jt : -1;
}
const _v = new Int32Array(17);
// the same for a column of the world (reads topAt); the rim it measured is `lastRim()`
export function holeTopAt(w, i, k) {
  const v = _v;
  v[0] = w.topAt(i, k);
  for (let q = 0; q < 8; q++) { const dx = DX[q], dz = DZ[q]; v[q + 1] = w.topAt(i + dx, k + dz); v[q + 9] = w.topAt(i + 2 * dx, k + 2 * dz); }
  return holeTop(v);
}
export const lastRim = () => _rim;

// has anything near these columns ever been edited? A hole is made by digging: untouched pile has none, and this check is nine map reads
export function anyEdited(w, i0, k0, n) {
  const NC = NX >> 4;
  const c0 = Math.max(0, i0 >> 4), c1 = Math.min(NC - 1, (i0 + n - 1) >> 4), z0 = Math.max(0, k0 >> 4), z1 = Math.min((NZ >> 4) - 1, (k0 + n - 1) >> 4);
  for (let cz = z0; cz <= z1; cz++) for (let cx = c0; cx <= c1; cx++) {
    const key = cz * NC + cx, c = w.cols.get(key);
    if (c ? c.mod : w.diffCols.has(key)) return true;
  }
  return false;
}

// ------------------------------------------------------------------ one cell
const RS = HOLE_R * 2 + 1;
const _vis = new Uint8Array(RS * RS);
let _fa = new Int32Array(RS * RS), _fb = new Int32Array(RS * RS);

// the hole light (0..1) at the AIR cell (i, j, k): its own strength inside a hole, else the strength of the nearest hole cell at this height reached through covered air
export function holeAt(w, i, j, k) {
  if (j < 0 || j >= NY || i < 3 || k < 3 || i >= NX - 3 || k >= NZ - 3) return 0;
  if (!anyEdited(w, i - HOLE_R - 1, k - HOLE_R - 1, 2 * HOLE_R + 3)) return 0;
  if (w.get(i, j, k) !== 0) return 0;
  if (j >= w.topAt(i, k)) { const jt = holeTopAt(w, i, k); return jt >= j ? strength(_rim - j) : 0; }
  _vis.fill(0);
  let fa = _fa, fb = _fb, na = 1;
  const mid = HOLE_R * RS + HOLE_R;
  _vis[mid] = 1; fa[0] = mid;
  for (let d = 0; d < HOLE_R; d++) {
    let best = 0, nb = 0;
    for (let q = 0; q < na; q++) {
      const c = fa[q], ci = i + (c % RS) - HOLE_R, ck = k + ((c / RS) | 0) - HOLE_R;
      for (let n = 0; n < 8; n++) {
        const ni = ci + DX[n], nk = ck + DZ[n], li = mid + (ni - i) + (nk - k) * RS;
        if (_vis[li]) continue;
        if (n >= 4 && (w.get(ni, j, ck) !== 0 || w.get(ci, j, nk) !== 0)) continue;   // no cutting a corner of plush
        _vis[li] = 1;
        if (w.get(ni, j, nk) !== 0) continue;
        if (j >= w.topAt(ni, nk)) { const jt = holeTopAt(w, ni, nk); if (jt >= j) { const v = strength(_rim - j); if (v > best) best = v; } continue; }
        fb[nb++] = li;
      }
    }
    if (best > 0) return best * falloff(d + 1);
    const sw = fa; fa = fb; fb = sw; na = nb;
    if (!na) break;
  }
  return 0;
}

// ------------------------------------------------------------------ a chunk
export const WIN = CS + 2 * (HOLE_R + 3);   // columns across the window: the chunk, one cell for the neighbours it reads, the reach of the light, two for the walls of a hole
const LV = CS + 2;                          // levels: the chunk and one more on each side
export function makeScratch() {
  return { tw: new Int16Array(WIN * WIN), hf: null, buf: new Float32Array(LV * WIN * WIN), dist: new Int8Array(WIN * WIN), st: new Uint8Array(WIN * WIN), used: [], sv: new Float32Array(WIN * WIN), qa: new Int32Array(WIN * WIN), qb: new Int32Array(WIN * WIN), seeds: [], bx0: 0, bx1: -1, bz0: 0, bz1: -1, bj0: 0, bj1: -1, ib: 0, kb: 0, jb: 0, Wd: WIN, on: false };
}

function fillTops(w, ib, kb, Wd, tw) {
  const edge = ib < 0 || ib + Wd > NX;   // (a window over the hall's edge reads NY past it, like topAt)
  for (let q = 0; q < Wd; q++) {
    const k = kb + q, row = q * Wd;
    if (k < 0 || k >= NZ) { tw.fill(NY, row, row + Wd); continue; }
    if (edge) { for (let x = 0; x < Wd; x++) { const i = ib + x; tw[row + x] = i < 0 || i >= NX ? NY : w.col(i >> 4, k >> 4).top[(k & 15) * 16 + (i & 15)]; } continue; }
    for (let x = 0; x < Wd;) {
      const i = ib + x, a = i & 15, len = Math.min(Wd - x, 16 - a), top = w.col(i >> 4, k >> 4).top, base = (k & 15) * 16 + a;   // one column chunk's row at a time
      for (let t = 0; t < len; t++) tw[row + x + t] = top[base + t];
      x += len;
    }
  }
}

// the hole columns of the window (an interior column has all its neighbours, and theirs, inside it): fills `seeds` (per level: column offset and strength) and says whether there are any
function seedHoles(tw, Wd, jb, jhi, only, seeds, S) {
  const v = _v; let any = false;
  const last = Wd - 2;
  for (let z = 2; z < last; z++) {
    for (let x = 2, o = z * Wd + 2; x < last; x++, o++) {
      const m = tw[o] + HOLE_WALL;
      if ((tw[o + 1] >= m ? 1 : 0) + (tw[o - 1] >= m ? 1 : 0) + (tw[o + Wd] >= m ? 1 : 0) + (tw[o - Wd] >= m ? 1 : 0) < 2) continue;   // (cheap early out: fewer than two walls)
      const t = tw[o];
      v[0] = t;
      for (let q = 0; q < 8; q++) { const d = DX[q] + DZ[q] * Wd; v[q + 1] = tw[o + d]; v[q + 9] = tw[o + 2 * d]; }
      const jt = holeTop(v);
      if (jt < 0) continue;
      S.holes++;   // (a hole column at any level: the strength of a hole and whether its mouth is open depend on column tops that can be edited many levels away from its foot)
      const lo = Math.max(t, jb, 0), hi = Math.min(jt, jhi); if (hi < lo) continue;
      for (let j = lo; j <= hi; j++) {
        if (only >= 0 && j !== only) continue;
        seeds[j - jb].push(o, strength(_rim - j)); any = true;
        if (x < S.bx0) S.bx0 = x; if (x > S.bx1) S.bx1 = x; if (z < S.bz0) S.bz0 = z; if (z > S.bz1) S.bz1 = z; if (j - jb < S.bj0) S.bj0 = j - jb; if (j - jb > S.bj1) S.bj1 = j - jb;
      }
    }
  }
  return any;
}

// is the cell air? `st` remembers what was read in this window level (0 not read, 1 air, 2 not)
function airOf(w, st, o, i, j, k) { let q = st[o]; if (q === 0) { q = st[o] = w.get(i, j, k) === 0 ? 1 : 2; } return q === 1; }

// The window of column tops around the chunk at (i0, j0, k0) and, when a hole is within reach, the light field of the levels j0 - 1 .. j0 + CS. Returns the scratch with
// `on` false when nothing near was ever edited (the caller then reads w.topAt itself and no hole light exists); `hf` is null when edits exist but no hole is near.
export function windowFor(w, i0, j0, k0, S, only = -1) {   // only >= 0: the light of that one level (the floor pool of lightshaft.js asks for level 0)
  const ib = i0 - HOLE_R - 3, kb = k0 - HOLE_R - 3, Wd = WIN;
  S.on = false; S.hf = null; S.holes = 0; S.bx0 = S.bz0 = S.bj0 = 1 << 20; S.bx1 = S.bz1 = S.bj1 = -1;
  if (!anyEdited(w, ib, kb, Wd)) return S;
  const tw = S.tw;
  fillTops(w, ib, kb, Wd, tw);
  S.ib = ib; S.kb = kb; S.jb = j0 - 1; S.on = true;
  const jb = j0 - 1, jhi = Math.min(NY - 1, j0 + CS);
  const seeds = S.seeds; for (let q = 0; q < LV; q++) { if (!seeds[q]) seeds[q] = []; else if (seeds[q].length) seeds[q].length = 0; }
  const any = seedHoles(tw, Wd, jb, jhi, only, seeds, S);
  if (!any) return S;
  // the box that holds all the light (the reach of the light round the holes, and a level over and under): a chunk's plush outside it need not look the field up
  S.bx0 = Math.max(0, S.bx0 - HOLE_R - 1); S.bx1 = Math.min(Wd - 1, S.bx1 + HOLE_R + 1); S.bz0 = Math.max(0, S.bz0 - HOLE_R - 1); S.bz1 = Math.min(Wd - 1, S.bz1 + HOLE_R + 1); S.bj0--; S.bj1++;
  const hf = S.hf = S.buf, W2 = Wd * Wd;
  for (const lay of S.used) hf.fill(0, lay, lay + W2);   // only the levels the last field wrote
  S.used.length = 0;
  const dist = S.dist, sv = S.sv, st = S.st; let qa = S.qa, qb = S.qb;
  for (let jj = 0; jj < LV; jj++) {
    const sd = seeds[jj]; if (!sd.length) continue;
    const j = jb + jj, lay = jj * W2;
    S.used.push(lay);
    dist.fill(-1); st.fill(0);
    let na = 0;
    for (let q = 0; q < sd.length; q += 2) { const o = sd[q]; dist[o] = 0; sv[o] = sd[q + 1]; hf[lay + o] = sd[q + 1]; qa[na++] = o; }
    for (let d = 0; d < HOLE_R && na; d++) {
      let nb = 0;
      for (let q = 0; q < na; q++) {
        const o = qa[q], x = o % Wd, z = (o / Wd) | 0, ci = ib + x, ck = kb + z, s = sv[o];
        for (let n = 0; n < 8; n++) {
          const nx = x + DX[n], nz = z + DZ[n];
          if (nx < 0 || nz < 0 || nx >= Wd || nz >= Wd) continue;
          const no = nz * Wd + nx;
          if (n >= 4 && (!airOf(w, st, o + DX[n], ci + DX[n], j, ck) || !airOf(w, st, o + DZ[n] * Wd, ci, j, ck + DZ[n]))) continue;
          const dn = dist[no];
          if (dn >= 0) { if (dn === d + 1 && sv[no] < s) sv[no] = s; continue; }
          if (!airOf(w, st, no, ci + DX[n], j, ck + DZ[n]) || tw[no] <= j) { dist[no] = 100; continue; }
          dist[no] = d + 1; sv[no] = s; qb[nb++] = no;
        }
      }
      for (let q = 0; q < nb; q++) { const o = qb[q]; hf[lay + o] = sv[o] * FALL[d + 1]; }
      const sw = qa; qa = qb; qb = sw; na = nb;
    }
  }
  return S;
}

// ------------------------------------------------------------------ the hole columns near a spot (the beams of light)
// every column within `rad` cells of (ci, ck) that is a hole at least BEAM_MIN deep: { i, k, t (the floor), top (its highest hole level), rim }
export function findHoles(w, ci, ck, rad, out = []) {
  out.length = 0;
  const i0 = Math.max(3, ci - rad), i1 = Math.min(NX - 4, ci + rad), k0 = Math.max(3, ck - rad), k1 = Math.min(NZ - 4, ck + rad);
  const NC = NX >> 4;
  for (let cz = k0 >> 4; cz <= k1 >> 4; cz++) for (let cx = i0 >> 4; cx <= i1 >> 4; cx++) {
    const key = cz * NC + cx, c = w.cols.get(key);
    if (!(c ? c.mod : w.diffCols.has(key))) continue;
    for (let k = Math.max(k0, cz * 16); k <= Math.min(k1, cz * 16 + 15); k++) for (let i = Math.max(i0, cx * 16); i <= Math.min(i1, cx * 16 + 15); i++) {
      const t = w.topAt(i, k), m = t + HOLE_WALL;
      if (w.topAt(i + 1, k) < m && w.topAt(i - 1, k) < m && w.topAt(i, k + 1) < m) continue;
      const jt = holeTopAt(w, i, k);
      if (jt >= t + BEAM_MIN - 1) out.push({ i, k, t, top: jt, rim: _rim });
    }
  }
  return out;
}
