// Shared kit for the wedge slide tests (wedge_*.js, mp_wedge.js). No default export: the runner skips this file.
import { WEDGE } from '../wedge.js';
import { BU } from '../burial.js';
import { isSpecialCell } from '../plushdata.js';

export { WEDGE, BU };

export function wk(ctx) {
  const { g, S, w, p, sim, fresh, stepSim, toI, toJ, toK, cellX, cellY, cellZ, cfg } = ctx;
  const C = cfg.C, NX = cfg.NX, NZ = cfg.NZ, NY = cfg.NY;
  const wd = () => g.wedge, bu = () => g.burial;
  // the player on a walkable steep part of the surface (rise of 0.7 to 1.3 per cell run) about `y` metres up: a ring search around the bay, starting east (dir 1) or west (-1)
  const hi = (y = 26, lane = 10, dir = 1, bands = [[0.65, 0.6, 1.5], [1.3, 0.55, 1.8], [2.5, 0.5, 2.5]]) => {
    const a0 = dir < 0 ? Math.PI : 0; let best = null;
    for (const [dy, lo, hiT] of bands) {
      for (let r = 14; r < 150 && !best; r += 0.6) for (let a = 0; a < 6.283 && !best; a += 0.02) {
        const ang = a0 + (lane - 10) * 0.05 + a, x = Math.cos(ang) * r, z = Math.sin(ang) * r, i = toI(x), k = toK(z), t = w().topAt(i, k);
        if (Math.abs(t * C - y) > dy) continue;
        const sl = wd().slope(i, k); if (!sl || sl.tan < lo || sl.tan > hiT) continue;
        best = { i, k, t };
      }
      if (best) break;
    }
    if (!best) throw new Error('no walkable slope at ' + y + ' m within 150 m of the bay (the world is random: the search covers rings out to 150 m, three slope bands)');
    const { i, k, t } = best;
    p().pos.set(cellX(i), t * C, cellZ(k)); p().footCell = { i, j: t - 1, k }; p().onGround = true; p().vel.set(0, 0, 0); p().swept = 0;
    return { i, k, t, y: p().pos.y, x: p().pos.x, z: p().pos.z };
  };
  // every plush there is around a place: the cells of the pile (not the specials) and the loose bodies, in a box of `r` cells round (i, k)
  const plush = (i0, k0, r = 160) => {
    let cells = 0;
    for (let i = Math.max(0, i0 - r); i <= Math.min(NX - 1, i0 + r); i++) for (let k = Math.max(0, k0 - r); k <= Math.min(NZ - 1, k0 + r); k++) {
      const t = w().topAt(i, k);
      for (let j = 0; j < t; j++) { const sp = w().get(i, j, k); if (sp && !isSpecialCell(sp)) cells++; }
    }
    let bodies = 0; for (let n = 0; n < sim().n; n++) if (!isSpecialCell(sim().sp[n])) bodies++;
    return { cells, bodies, total: cells + bodies };
  };
  const tagged = () => { let n = 0; for (let q = 0; q < sim().n; q++) if (sim().tag[q] === 1) n++; return n; };
  const reset = (up = {}) => { fresh(up); wd().clear(); bu().clear(); g.hp = 100; g.hpMax = 100; g.dead = false; g.blacking = false; };
  const logHurts = () => {
    const log = [], orig = g.hurtPlayer;
    g.hurtPlayer = function (n, why) { const h0 = g.hp; orig.call(g, n, why); log.push({ n, why, dealt: h0 - g.hp }); };
    return { log, stop: () => { g.hurtPlayer = orig; } };
  };
  // a seeded Math.random for the length of fn (the sim, the slide and the sizes all draw from it)
  const seeded = (seed, fn) => {
    const o = Math.random; let s = (seed * 2654435761) >>> 0;
    Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    try { return fn(); } finally { Math.random = o; }
  };
  const lcg = (seed) => { let s = (seed * 2654435761) >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
  // the whole game loop (the player included) for `sec` seconds, or until each() says false
  const play = (sec, each = null, dt = 1 / 60) => { let t = 0; while (t < sec) { g.time += dt; g.updatePlay(dt); t += dt; if (each && each(t) === false) break; } return t; };
  // a slide at the player: e picks the size (0.1 small, 0.5 medium, 0.9 big). Returns the slide or null.
  const slide = (e, o = {}) => { const q = p().pos; return wd().start({ x: q.x, y: q.y, z: q.z }, { e, warn: 0.25, speed: 0, carry: 0, by: 'test', ...o }); };
  // run it to the end with the player in the loop, let the landing happen; numbers about the ride
  const ride = (o = {}) => {
    const st = { x: p().pos.x, y: p().pos.y, z: p().pos.z }, a = wd().cur; let swept = 0, vmax = 0, peakLive = 0;
    const t = play(o.max || 30, () => { if (p().swept > 0) swept++; vmax = Math.max(vmax, Math.hypot(p().vel.x, p().vel.z)); peakLive = Math.max(peakLive, wd().live); return !!wd().cur; });
    play(o.settle ?? 0.5); for (let n = 0; n < 80 && bu().pend; n++) play(0.1); play(0.5);   // (the landing waits for the player to stop)
    const last = bu().last, mine = last && last.landings.find((l) => l.who === (o.who || 'player'));
    return { a, st, t, swept, vmax, peakLive, last, land: mine, carried: Math.hypot(p().pos.x - st.x, p().pos.z - st.z), drop: st.y - p().pos.y, speed: Math.hypot(p().vel.x, p().vel.y, p().vel.z) };
  };
  // the player on a walkable slope about y metres up (the random footing roll of climbRisk is switched off so a test's slide is the only one: the test wrapper deletes the override)
  const stand = (y, lane = 10, dir = 1, up = {}, bands) => {   // (a world may have no slope of that height: a couple of metres either way are tried before giving up)
    reset(up); S().carry = []; g.climbRisk = () => {}; let err = null;
    for (const dy of [0, -2, 2, -4, 4]) { try { return hi(y + dy, lane, dir, bands); } catch (e) { err = e; } }
    throw err;
  };
  // the footprint a slide left: apex width, width near the bottom, the widest spread and the angle of the edge, from the columns it freed (a.cols: i, k, u, v, cells, t)
  const shape = (a) => {
    const cols = a.cols, apex = cols.slice(0, a.seeds.length);
    let umax = 0; for (const c of cols) umax = Math.max(umax, c[2]);
    const span = (list) => { if (!list.length) return 0; let lo = 1e9, hi2 = -1e9; for (const c of list) { lo = Math.min(lo, c[3]); hi2 = Math.max(hi2, c[3]); } return hi2 - lo + C; };
    const apexW = span(apex);
    // the width over the length in four equal bins: grows from the apex to the bottom
    const bins = [0, 1, 2, 3].map((b) => span(cols.filter((c) => c[2] >= umax * b / 4 && c[2] < umax * (b + 1) / 4 + (b === 3 ? 1 : 0))));
    let worst = 0; for (const c of cols) { const u = Math.max(C, c[2]); worst = Math.max(worst, (Math.abs(c[3]) - a.a0 * 0.5) / u); }   // tan of the angle of the column furthest out
    const bottomW = Math.max(bins[2], bins[3]);   // (the widest part of the lower half: the toe can stop short of the floor where the pile is too low to give way)
    const cells = cols.reduce((s, c) => s + (c[4] || 0), 0);
    return { n: cols.length, apexW, bottomW, ratio: bottomW / Math.max(C, apexW), bins, umax, tanMax: worst, cells };
  };
  // how deep the player is buried at rest: the rings and the cap, read from the cells
  const burial = (pos = p().pos) => { const cv = bu().cover(pos); const i0 = toI(pos.x), k0 = toK(pos.z), jb = toJ(pos.y + 0.05); let up = 0; for (let L = 3; L < 12 && w().solid(i0, jb + L, k0); L++) up++; return { ...cv, depth: Math.min(3, cv.lvl) + up, up }; };
  // the heart of the pile that landed (the 7 x 7 block of columns that grew most since the ground recorded at the start), as { sum, i, k }
  const heart = (a) => {
    const sn = a.snap, gain = (i, k) => { const x = i - sn.i0, z = k - sn.k0; return x < 0 || z < 0 || x >= sn.wd || z >= sn.ht ? 0 : Math.max(0, w().topAt(i, k) - sn.top[z * sn.wd + x]); };
    let best = null;
    for (let k = 4; k < sn.ht - 4; k += 2) for (let i = 4; i < sn.wd - 4; i += 2) { let sum = 0; for (let dk = -3; dk <= 3; dk++) for (let di = -3; di <= 3; di++) sum += gain(sn.i0 + i + di, sn.k0 + k + dk); if (!best || sum > best.sum) best = { sum, i: sn.i0 + i, k: sn.k0 + k }; }
    return best;
  };
  return { heart, hi, plush, tagged, reset, logHurts, seeded, lcg, play, slide, ride, stand, shape, burial, wd, bu, C, NX, NZ, NY, toI, toJ, toK, cellX, cellY, cellZ };
}
