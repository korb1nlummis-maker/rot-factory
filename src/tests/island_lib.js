// Shared fixtures for the island and thin cap tests (island.js, the thin cap rule in world.js). No default export, so the test loader skips it.
// Every test named `island.` or `thincap.` starts in a fresh world (WORLD_TESTS in selftest.js), so an arena of the bay can be cleared and built freely.
import { PAD, isSpecialCell } from '../plushdata.js';

export function kit(ctx) {
  const { g, S, w, p, fresh, spot, sim, stepSim, cellX, cellY, cellZ, toI, toK } = ctx;
  const W = () => g.world;
  // a cleared block of the bay with nothing else in it (the natural pile beside it is at least `m` cells away from the part a test builds in): { i0, k0, nx, nz }
  const arena = (nx = 40, nz = 40, up = {}) => {
    fresh(up); const sp = spot(12), m = 6, i0 = sp.i + 8 + m, k0 = sp.k - 30 - m;
    for (let i = i0 - m; i < i0 + nx + m; i++) for (let k = k0 - m; k < k0 + nz + m; k++) for (let j = 0, top = W().topAt(i, k); j < top; j++) if (W().get(i, j, k)) W().removeCell(i, j, k, false);
    W().creaking.clear(); W().stabQueue.length = 0; W().chimney.clear(); W().isl.off = false; W().thinOff = false; g.slide.clear(); g.afters = [];
    g.collapseT = 99;   // (the game counts a collapse only when the last boom was long ago, and only the real loop ages that clock)
    g._shedT = g.time + 1e9;   // a creak sometimes shakes a few plush loose off a slope (shedOffSlope, random): one landing against a slab would hold it, and a test must not depend on that
    return { i0, k0, nx, nz };
  };
  // clear every cell within r of a point (anywhere in the world, edges included)
  const clearAround = (i, j, k, r) => { for (let a = -r; a <= r; a++) for (let c = -r; c <= r; c++) for (let b = -r; b <= r; b++) if (W().inside(i + a, j + b, k + c) && W().get(i + a, j + b, k + c)) W().removeCell(i + a, j + b, k + c, false); };
  const block = (i0, j0, k0, ni, nj, nk, sp = 2) => { for (let a = 0; a < ni; a++) for (let b = 0; b < nj; b++) for (let c = 0; c < nk; c++) W().setCell(i0 + a, j0 + b, k0 + c, sp, 0); };
  // dig a box (queued: the roof check and the island check see it, as with every real dig)
  const dig = (i0, j0, k0, ni, nj, nk, queue = true) => { let n = 0; for (let a = 0; a < ni; a++) for (let b = 0; b < nj; b++) for (let c = 0; c < nk; c++) if (W().removeCell(i0 + a, j0 + b, k0 + c, queue)) n++; return n; };
  const count = (i0, j0, k0, ni, nj, nk, sp) => { let n = 0; for (let a = 0; a < ni; a++) for (let b = 0; b < nj; b++) for (let c = 0; c < nk; c++) { const s = W().get(i0 + a, j0 + b, k0 + c); if (sp === undefined ? !!s : s === sp) n++; } return n; };
  // a 4 x 4 x 4 frame cube whose first cell is (m, j0, lo) (the cells must be open)
  const cube = (kind, m, lo, j0 = 0) => { const e = g.machines.frameEnt('x', kind, m, lo, j0); delete e.clear; const ent = { id: g.nextId(), type: 'frame', ...e }; S().entities.push(ent); g.addEntity(ent); return ent; };
  const dropEnt = (ent) => { const it = g.machines.items.get(ent.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(ent.id); } S().entities = S().entities.filter((e) => e.id !== ent.id); W().supports = W().supports.filter((s) => s.id !== ent.id); W().stabQueue.length = 0; };
  // plush conservation: every plush that leaves a cell is a loose body or a cell again. net() is 0 when none was lost or made out of nothing since the last mark().
  // (Digging and building change the amount of plush on purpose: mark() after the scene is set up and after each edit, then run the sim and check.)
  const tally = () => {
    const wd = W(), orig = wd.setCell; let removed = 0, added = 0, b0 = sim().n;
    wd.setCell = function (i, j, k, sp, vr) { const o = this.get(i, j, k); if (o && !isSpecialCell(o)) removed++; if (sp && !isSpecialCell(sp)) added++; return orig.call(this, i, j, k, sp, vr); };
    return { stop() { delete wd.setCell; }, mark() { removed = 0; added = 0; b0 = sim().n; }, removed: () => removed, added: () => added, net: () => removed - added - (sim().n - b0) };
  };
  // count the calls of g.sound / g.fx / g.ui methods while a test runs
  const spy = (obj, name) => { const orig = obj[name], rec = { n: 0, args: [] }; obj[name] = function (...a) { rec.n++; if (rec.args.length < 60) rec.args.push(a); return orig.apply(this, a); }; rec.stop = () => { obj[name] = orig; }; return rec; };
  // the real stability loop, in steps of dt, until cond() or `max` seconds. Returns the seconds it took (or -1)
  const until = (cond, max = 20, dt = 1 / 30, step = 0.1) => { for (let t = 0; t < max; t += step) { stepSim(step, dt); if (cond()) return t + step; } return cond() ? max : -1; };
  const run = (sec, dt = 1 / 30) => stepSim(sec, dt);
  const stand = (i, k, j = 0) => { p().pos.set(cellX(i), cellY(j) - 0.3, cellZ(k)); p().vel.set(0, 0, 0); };
  const isl = () => W().isl;
  return { W, arena, clearAround, block, dig, count, cube, dropEnt, tally, spy, until, run, stand, isl, PAD };
}
