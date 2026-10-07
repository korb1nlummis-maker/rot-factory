// Shared helpers for the daylight-through-holes tests (holelight*.js, mp.holelight.*). No default export, so the self test loader skips this file.
// rig() digs a test tunnel into the slope of the pile and a shaft straight up out of it; light maps read what the real remesh (render.js scanChunk) bakes into each plush.
import { BULK, PAD } from '../plushdata.js';
import * as HL from '../holelight.js';

export const decode = (z) => { const fl = Math.floor(z + 0.01); return { flag: fl, hole: Math.max(0, Math.min(1, (z - fl) / 0.97)) }; };

export function kit(ctx) {
  const { g, toI, toJ, toK } = ctx;
  const W = () => g.world;
  // A tunnel `wide` cells across and `rows` high (rows 0..rows-1 sit on the hall floor) running along +x from `left` cells before the shaft to `right` cells after it, and a
  // one cell shaft straight up from its second lane to the open air. The shaft stands where the pile first is `depth` cells tall, so it is that many cells deep.
  // The tunnel starts left of the shaft only a little: further out the slope is too low to roof it and the mouth would be a hole of its own.
  const rig = (o = {}) => {
    const { depth = 11, wide = 4, rows = 4, left = 2, right = 16, shaft = true, lane = 7 } = o;
    const kk = toK(lane); let iS = o.at ?? toI(o.from ?? 11);   // `at`: the shaft's column, else the first one along the slope where the pile is `depth` cells tall
    while (o.at === undefined && W().topAt(iS, kk + 1) < depth) iS++;
    const T0 = W().topAt(iS, kk + 1);
    for (let i = iS - left; i <= iS + right; i++) for (let k = kk; k < kk + wide; k++) for (let j = 0; j < rows; j++) if (W().get(i, j, k)) W().removeCell(i, j, k, false);
    const r = { iS, kS: kk + 1, k0: kk, T0, rows, wide, left, right, i0: iS - left, i1: iS + right };
    if (shaft) dig(r);
    HL.holeTopAt(W(), iS, kk + 1); r.rim = HL.lastRim();   // the rim the light of the shaft is measured from (a shaft is full strength for its first 12 cells under it, and fades from there)
    r.str = (j) => HL.strength(r.rim - j);
    return r;
  };
  // the shaft itself: the column above the tunnel's second lane, dug out to the open air
  const dig = (r) => { for (let j = r.rows; j <= r.T0; j++) if (W().get(r.iS, j, r.kS)) W().removeCell(r.iS, j, r.kS, false); };
  // what the remesh bakes in for every plush that shows: Map "i,j,k" -> { sky, hole, flag }
  const readChunk = (res, m) => {
    if (!res.n) return m;
    const d = res.data;
    for (let e = 0, o = 0; e < res.n; e++, o += 16) { const dz = decode(d[o + 10]); m.set(toI(d[o]) + ',' + toJ(d[o + 1]) + ',' + toK(d[o + 2]), { sky: d[o + 9], hole: dz.hole, flag: dz.flag }); }
    return m;
  };
  const chunksOf = (r, pad = 2) => { const out = []; for (let cx = (r.i0 - pad) >> 4; cx <= (r.i1 + pad) >> 4; cx++) for (let cz = (r.k0 - pad) >> 4; cz <= (r.k0 + r.wide + pad) >> 4; cz++) for (let cy = 0; cy <= 1; cy++) out.push([cx, cy, cz]); return out; };
  const scanAll = (r, scan) => { const m = new Map(); for (const [cx, cy, cz] of chunksOf(r)) readChunk((scan || ((a, b, c) => g.renderer.scanChunk(a, b, c, false)))(cx, cy, cz), m); return m; };
  const at = (m, i, j, k) => m.get(i + ',' + j + ',' + k) || null;
  const sky = (m, i, j, k) => { const e = at(m, i, j, k); return e ? Math.max(e.sky, e.hole) : null; };   // what the shader sees as "sky" at that plush
  const hole = (m, i, j, k) => { const e = at(m, i, j, k); return e ? e.hole : null; };
  const same = (a, b) => { if (a.size !== b.size) return `${a.size} plush vs ${b.size}`; for (const [k, v] of a) { const o = b.get(k); if (!o || Math.abs(o.sky - v.sky) > 1e-6 || Math.abs(o.hole - v.hole) > 1e-6 || o.flag !== v.flag) return 'differs at ' + k; } return null; };
  // blockers set across the shaft, high enough over the tunnel that the plain roof light is already low there
  const KINDS = { plush: [5, 0], plate: [PAD, 17], wall: [BULK, 240] };
  const block = (r, kind = 'plush', j = r.rows + 3) => { const [sp, vr] = KINDS[kind]; W().setCell(r.iS, j, r.kS, sp, vr); return j; };
  const unblock = (r, j = r.rows + 3) => { W().setCell(r.iS, j, r.kS, 0, 0); };
  // a cross-section of plush across the whole tunnel `d` cells along it
  const plug = (r, d, sp = 5) => { const cells = []; for (let k = r.k0; k < r.k0 + r.wide; k++) for (let j = 0; j < r.rows; j++) { W().setCell(r.iS + d, j, k, sp, 0); cells.push([r.iS + d, j, k]); } return cells; };
  const unplug = (cells) => { for (const [i, j, k] of cells) W().setCell(i, j, k, 0, 0); };
  return { W, rig, dig, readChunk, chunksOf, scanAll, at, sky, hole, same, block, unblock, plug, unplug, KINDS };
}
