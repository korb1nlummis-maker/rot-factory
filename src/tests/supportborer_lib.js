// Helpers for the Support Borer tests (supportborer_*.js, mp_supportborer.js). No default export.
// `rigKit(ctx)` builds a tunnel scene (a pile at the bay with an open mouth, or the natural pile 200 to 1,000 m out), sets a Support Borer at its face and runs the real loop:
// the rig's own tick, then the real stability step (roofs creak and fall exactly as in the game).
import { kit } from './island_lib.js';
import { UP } from './portal_lib.js';
import * as SB from '../supportborer.js';
import { ARCH_SPANS } from '../loadtrace.js';
export const UPS = { ...UP, sborer: 1 };
export { SB };

export function rigKit(ctx) {
  const { g, S, fresh, newWorld, toI, toK, clearBodies, stepSim } = ctx;
  const K = kit(ctx), W = () => g.world;
  // cls 0: the regular 4 x 4 tunnel (frame cubes), 6, 8 or 12: that giant arch tunnel. first: a support stands at the start of the tunnel (it is the anchor deep in the pile).
  // Returns { e, it, i0, lo, hgt, wd, cls, mat, kind }. The rig stands at the face, powered, empty and stopped.
  const scene = async (o = {}) => {
    const dist = o.dist || 0, cls = o.cls || 0, mat = o.mat || 'steel', len = o.len ?? 90, up = { ...UPS, ...(o.up || {}) };
    const hgt = cls ? ARCH_SPANS[cls].h : 4, wd = cls || 4, first = o.first ?? dist > 0;
    await newWorld(); fresh(up); S().money = 1e13; g.surgeT = 1e9; clearBodies(); 
    let i0, lo;
    if (!dist) { const A = K.arena(len + 40, wd + 40, up); K.block(A.i0, 0, A.k0, len + 30, o.rows ?? 32, wd + 20); i0 = A.i0; lo = A.k0 + 10; }
    else if (o.block) { i0 = toI(dist); lo = toK(60); const r = o.rows ?? 30; for (let i = i0 - 8; i < i0 + len + 30; i++) for (let k = lo - 10; k < lo + wd + 10; k++) for (let j = 0, top = W().topAt(i, k); j < top; j++) if (W().get(i, j, k)) W().removeCell(i, j, k, false); K.block(i0, 0, lo - 10, len + 30, r, wd + 20); }
    else { i0 = toI(dist); lo = toK(60); }
    const pre = first ? 4 : 3; K.dig(i0, 0, lo, pre, hgt, wd, false);
    W().creaking.clear(); W().stabQueue.length = 0; W().chimney.clear(); g._shedT = g.time + 1e9; g.collapseT = 99;
    const kind = cls ? `garch:${cls}:${mat}` : `frame:${mat}`;
    if (first) { if (cls) g.placeEntity('garch', { axis: 'x', gm: i0, glo: lo, gj: 0, span: cls, mat }, { quiet: true, rebuild: false }); else K.cube(mat, i0, lo, 0); }
    const fa = i0 + pre - 1, lat = lo + (wd >> 1) - 1 + (cls ? 0 : 0);
    const f = SB.build(g, { id: 'sborer' }, { i: fa, j: 0, k: lo + (wd >> 1), dx: 1, dz: 0 }); if (!f) throw new Error('rig build refused: ' + JSON.stringify(SB.check(g, { i: fa, j: 0, k: lo + (wd >> 1), dx: 1, dz: 0 })));
    const e = g.placeEntity('sborer', f, { quiet: true }), it = g.machines.items.get(e.id); e.pw = 1; void lat;
    return { e, it, i0, lo, hgt, wd, cls, mat, kind, pre, rate: o.rate ?? 0.0002 };
  };
  const give = (id, n) => { S().items[id] = (S().items[id] || 0) + n; };
  // the least margin (cells of roof in hand) of the roof over the columns a..b of the tunnel; -Infinity when a roof cell has no anchor at all
  const margin = (s, a, b) => { let m = Infinity; for (let c = a; c <= b; c++) for (let q = 0; q < s.wd; q++) { const st = W().stress(c, s.hgt, s.lo + q); if (st && st.margin < m) m = st.margin; } return m; };
  // run the rig `sec` seconds (the real loop). Returns { minMargin, creaks, collapses, ticks }. `power`: false cuts the cable.
  const run = (s, sec, o = {}) => {
    const dt = o.dt ?? 0.1, c0 = S().stats.collapses || 0; let minM = Infinity, creaks = 0, ticks = 0;
    for (let t = 0; t < sec; t += dt) {
      s.e.pw = o.power === false ? 0 : 1; g.T.borerRate = s.rate;   // (the tuning is rebuilt now and then: the cut is kept fast for the test)
      SB.tick(g, dt); stepSim(dt, dt); ticks++;
      if (W().creaking.size) creaks++;
      if (!(ticks % 3) && s.e.fa >= s.i0 + 4) { const m = margin(s, Math.max(s.i0 + 4, s.e.fa - 14), s.e.fa); if (m < minM) minM = m; }
      if (o.until && o.until()) break;
    }
    return { minMargin: minM, creaks, collapses: (S().stats.collapses || 0) - c0, ticks };
  };
  const frames = () => S().entities.filter((e) => e.type === 'frame' || e.type === 'garch');
  return { K, W, scene, give, margin, run, frames };
}
