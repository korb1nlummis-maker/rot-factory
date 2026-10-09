// Shared kit for the soft slide tests (slide_soft_*.js, mp_slide_soft.js). No default export: the runner skips this file.
import { kit, AV } from './avalanche_lib.js';
import { SS } from '../softslide.js';

export { AV, SS };

export function sk(ctx) {
  const { g, S, w, p, sim, toI, toJ, toK, cellX, cellY, cellZ, cfg } = ctx;
  const K = kit(ctx), { hi, plush, tagged, reset, logHurts, av } = K;
  const C = cfg.C, NX = cfg.NX, NZ = cfg.NZ;
  const ss = () => g.softslide;
  // a seeded Math.random for the length of fn (the sim, the slab and the sizes all draw from it)
  const seeded = (seed, fn) => {
    const o = Math.random; let s = (seed * 2654435761) >>> 0;
    Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    try { return fn(); } finally { Math.random = o; }
  };
  const lcg = (seed) => { let s = (seed * 2654435761) >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
  // the whole game loop (the player included) for `sec` seconds, or until stop() says so
  const play = (sec, each = null, dt = 1 / 60) => { let t = 0; while (t < sec) { g.time += dt; g.updatePlay(dt); t += dt; if (each && each(t) === false) break; } return t; };
  // a soft slide at the player: e picks the size (0.05 small, 0.5 medium, 0.9 large). Returns the slide or null.
  const slide = (e, o = {}) => { const q = p().pos; return ss().start({ x: q.x, y: q.y, z: q.z }, { e, warn: 0.25, speed: 0, carry: 0, by: 'test', ...o }); };
  // run it to the end and a second more, with the player in the loop; numbers about the ride
  const ride = (o = {}) => {
    const st = { x: p().pos.x, y: p().pos.y, z: p().pos.z }, a = av().cur; let swept = 0, vmax = 0, peakLive = 0;
    const t = play(o.max || 30, () => { if (p().swept > 0) swept++; vmax = Math.max(vmax, Math.hypot(p().vel.x, p().vel.z)); peakLive = Math.max(peakLive, av().live); return !!av().cur || false; });
    play(o.settle ?? 0.5); for (let n = 0; n < 60 && ss().pend; n++) play(0.1); play(0.5);   // (the landing waits for the player to stop)
    const last = ss().last, mine = last && last.landings.find((l) => l.who === (o.who || 'player'));
    return { a, st, t, swept, vmax, peakLive, last, land: mine, carried: Math.hypot(p().pos.x - st.x, p().pos.z - st.z), drop: st.y - p().pos.y, speed: Math.hypot(p().vel.x, p().vel.y, p().vel.z) };
  };
  // the player on a walkable slope about y metres up (a seeded roll picks nothing here: hi() is a search)
  // (the random footing roll of climbRisk is switched off so a test's slide is the only one: a test that rolls it deletes g.climbRisk itself)
  const stand = (y, lane = 10, dir = 1, up = {}) => { reset(up); S().carry = []; g.softslide.clear(); g.climbRisk = () => {}; return hi(y, lane, dir); };
  // build a ring of plush round the player's cell up to `levels` (1 legs, 2 waist, 3 chest) with an optional cap: a pocket in the pile, as a landing leaves it
  const pocket = (levels, cap = false) => {
    const q = p().pos, i0 = toI(q.x), k0 = toK(q.z), jb = toJ(q.y + 0.05), cells = [];
    const put = (i, j, k) => { for (let jj = w().topAt(i, k); jj <= j; jj++) if (!w().solid(i, jj, k)) { w().setCell(i, jj, k, 2 + ((i + k + jj) % 5), 0); cells.push([i, jj, k]); } };
    for (let L = 0; L < levels; L++) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) put(i0 + a, jb + L, k0 + b);
    if (cap) { for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(i0 + a, jb + 3, k0 + b); put(i0, jb + 3, k0); }
    // the player stands at the middle of the pocket
    p().pos.set(cellX(i0), q.y, cellZ(k0)); p().vel.set(0, 0, 0);
    return { i0, k0, jb, cells };
  };
  // the heart of the pile that landed (the 7 x 7 block of columns that grew most since the ground recorded at the start), as { sum, i, k }
  const heart = (a) => {
    const sn = a.snap, gain = (i, k) => { const x = i - sn.i0, z = k - sn.k0; return x < 0 || z < 0 || x >= sn.wd || z >= sn.ht ? 0 : Math.max(0, w().topAt(i, k) - sn.top[z * sn.wd + x]); };
    let best = null;
    for (let k = 4; k < sn.ht - 4; k += 2) for (let i = 4; i < sn.wd - 4; i += 2) { let sum = 0; for (let dk = -3; dk <= 3; dk++) for (let di = -3; di <= 3; di++) sum += gain(sn.i0 + i + di, sn.k0 + k + dk); if (!best || sum > best.sum) best = { sum, i: sn.i0 + i, k: sn.k0 + k }; }
    return best;
  };
  const key = (k, on = true) => { g.keys = g.keys || {}; if (on) g.keys[k] = true; else delete g.keys[k]; };
  // real time between punches is 0.32 s: the loop calls it every 0.32 s of game time
  const punchLoop = (sec, pick, until) => { let t = 0, n = 0, next = 0; while (t < sec) { g.time += 1 / 60; g.updatePlay(1 / 60); t += 1 / 60; if (t >= next) { next = t + 0.34; g.punchT = 0; pick(); n++; } if (until()) break; } return { t, n }; };
  return { ...K, heart, ss, seeded, lcg, play, slide, ride, stand, pocket, key, punchLoop, C, NX, NZ, toI, toJ, toK, cellX, cellY, cellZ };
}
