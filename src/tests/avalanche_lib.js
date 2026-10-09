// Shared kit for the avalanche tests (avalanche_*.js, mp_avalanche.js). No default export: the runner skips this file.
import { AV } from '../avalanche.js';
import { isSpecialCell } from '../plushdata.js';

export { AV };

export function kit(ctx) {
  const { g, S, w, p, sim, fresh, adv, stepSim, toI, toK, cellX, cellZ, cfg } = ctx;
  const C = cfg.C, NZ = cfg.NZ, NX = cfg.NX, NY = cfg.NY;
  const av = () => g.avalanche;
  // the player on a walkable steep part of the surface (rise of 0.7 to 1.3 per cell run) about `y` metres up: a ring search around the bay, starting east (dir 1) or west (-1)
  const hi = (y = 26, lane = 10, dir = 1) => {
    const a0 = dir < 0 ? Math.PI : 0; let best = null;
    for (const [dy, lo, hiT] of [[0.65, 0.6, 1.5], [1.3, 0.55, 1.8], [2.5, 0.5, 2.5]]) {
      for (let r = 14; r < 150 && !best; r += 0.6) for (let a = 0; a < 6.283 && !best; a += 0.02) {
        const ang = a0 + (lane - 10) * 0.05 + a, x = Math.cos(ang) * r, z = Math.sin(ang) * r, i = toI(x), k = toK(z), t = w().topAt(i, k);
        if (Math.abs(t * C - y) > dy) continue;
        const sl = g.avalanche.slope(i, k); if (!sl || sl.tan < lo || sl.tan > hiT) continue;
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
  // a clean slate: gear, bodies, the slide in progress and the cooldown
  const reset = (up = {}) => { fresh(up); av().clear(); g.hp = 100; g.hpMax = 100; g.dead = false; g.blacking = false; };
  // the world's `g.hurtPlayer` calls are logged for the length of a test
  const logHurts = () => {
    const log = [], orig = g.hurtPlayer;
    g.hurtPlayer = function (n, why) { const h0 = g.hp; orig.call(g, n, why); log.push({ n, why, dealt: h0 - g.hp }); };
    return { log, stop: () => { g.hurtPlayer = orig; } };
  };
  // start a slab at the player with a short warning; returns the slide
  const go = (o = {}) => { const q = p().pos; const ok = av().start({ x: q.x, y: q.y, z: q.z }, { warn: 0.3, by: 'test', speed: 0, carry: 0, ...o }); return ok ? av().cur : null; };
  // run the whole game loop (the player included) until the slide is over or `max` seconds go by
  const ride = (max = 25, dt = 0.05, each = null) => { let t = 0; while (av().cur && t < max) { g.time += dt; g.updatePlay(dt); t += dt; if (each) each(t); } return t; };
  return { hi, plush, tagged, reset, logHurts, go, ride, av, C, NX, NZ, NY, AV };
}
