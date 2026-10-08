import { kit } from './island_lib.js';
import { UP } from './portal_lib.js';
import { PAD, BULK, CACHE, REMAINS, NEEDLE } from '../plushdata.js';
import { ISLAND_CAP } from '../island.js';
import { NX, NZ } from '../config.js';
// island.*: plush that has been cut off from the pile falls (island.js). A group of plush cells joined face to face is held by the hall floor, a bulkhead or pad, a support's reach,
// the world edge, or by being bigger than ISLAND_CAP cells; anything else waits 1 to 3 s (creaking, with dust and the roof warning) and then lets go as loose plush.
// The tunnel rule of world.js stays as it was: a roof over a cavity with no anchor near still comes down cell by cell. What these tests add is the slab the tunnel rule lets stand
// (a roof that is anchored but has been cut free of the pile around it) and a floating group in general.
// Run: `await __selftest('island.')`. Every test starts in a fresh world (WORLD_TESTS in selftest.js).
export default async function (ctx) {
  const { T, g, S, w, p, sim } = ctx;
  const K = kit(ctx), W = K.W;
  const flags = () => ({ falls: S().stats.islandFalls || 0, collapses: S().stats.collapses || 0 });
  // 300 plush hanging 4 cells over the floor in a cleared arena (nothing is queued: a test pokes the check with an edit, as a real dig would)
  const hang = (A, nx = 10, nj = 3, nz = 10) => { const a = { i: A.i0 + 10, j: 4, k: A.k0 + 10 }; K.block(a.i, a.j, a.k, nx, nj, nz); return a; };
  const poke = (a) => W().stabQueue.push({ i: a.i + 2, j: a.j, k: a.k + 2 });
  // a 20 long pile block with a 4 wide tunnel through it (open at both ends, so the tunnel rule lets it stand) and the roof slab over it cut free of the pile on both sides.
  // holder: what the tunnel has to hold the roof: 'none', 'cubes' (one frame cube every 8 cells), 'stack' (two cubes high), 'pads' (a ceiling plate), 'bulk' (a bulkhead ceiling)
  const tunnelSlab = (holder, cut = true) => {
    const A = K.arena(60, 40, UP), i0 = A.i0 + 8, k0 = A.k0 + 10, ht = holder === 'stack' ? 8 : holder === 'cubes' ? 4 : 3, rows = ht + 9, ents = [];
    K.block(i0, 0, k0, 20, rows, 14); K.dig(i0, 0, k0 + 5, 20, ht, 4);
    if (holder === 'cubes') for (let m = i0; m + 3 < i0 + 20; m += 8) ents.push(K.cube('steel', m, k0 + 5, 0));
    if (holder === 'stack') for (let m = i0; m + 3 < i0 + 20; m += 8) { ents.push(K.cube('steel', m, k0 + 5, 0)); ents.push(K.cube('steel', m, k0 + 5, 4)); }
    if (holder === 'pads' || holder === 'bulk') for (let x = 0; x < 20; x++) for (let z = 0; z < 4; z++) W().setCell(i0 + x, ht, k0 + 5 + z, holder === 'pads' ? PAD : BULK, 0);
    K.stand(A.i0 + 2, A.k0 + 2); K.run(6);
    const t = { A, i0, k0, ht, rows, ents, slab: () => K.count(i0, rows - 3, k0 + 5, 20, 3, 4) };   // the top three layers of the slab: 240 plush the rubble of the layers below cannot reach
    if (cut) { K.dig(i0, ht, k0 + 3, 20, rows - ht, 2); K.dig(i0, ht, k0 + 9, 20, rows - ht, 2); }
    return t;
  };

  await T('island.a-slab-with-nothing-under-it-hangs-1-to-3-s-then-falls-as-loose-plush', async () => {
    const A = K.arena(40, 40, UP), creak = K.spy(g.sound, 'creak'), dust = K.spy(g.fx, 'dust'), rum = K.spy(g.sound, 'rumble'), tl = K.tally();
    try {
      const a = hang(A); K.stand(A.i0 + 2, A.k0 + 2); const f0 = flags(); tl.mark(); poke(a);
      if (K.until(() => W().isl.list.size > 0, 2) < 0) return 'the cut off slab was never noticed';
      if (!(W().creaking.size > 0)) return 'no creaking marker shows the slab is about to go';
      K.run(0.8); const mid = K.count(a.i, a.j, a.k, 10, 3, 10);
      if (mid !== 300) return `the slab lost ${300 - mid} plush within a second of being cut off: it must hang a moment first`;
      const t = K.until(() => flags().falls > f0.falls, 4); if (t < 0) return 'the slab never fell';
      const wait = 0.8 + t; if (!(wait >= 1.0 && wait <= 3.1)) return `it waited ${wait.toFixed(2)} s, the rule is 1 to 3 s`;
      if (!(Math.abs(wait - 1.6) < 0.45)) return `a 300 cell slab should wait about 1.6 s, it waited ${wait.toFixed(2)}`;
      K.run(0.5); if (!(sim().n > 100)) return `${sim().n} loose plush right after the fall`;
      if (K.count(a.i, a.j, a.k, 10, 3, 10) !== 0) return 'cells of the slab are still in the air';
      K.run(10);
      if (K.count(A.i0, 4, A.k0, 40, 20, 40) !== 0) return 'plush is still hanging at the height of the slab after it fell and settled';
      if (tl.net() !== 0) return `plush was lost or made up: net ${tl.net()}`;
      if (creak.n < 2 || dust.n < 3 || rum.n < 1) return `warning and fall: ${creak.n} creaks, ${dust.n} dust puffs, ${rum.n} rumbles`;
      if (flags().collapses <= f0.collapses) return 'the fall was not counted as a collapse';
      if (W().isl.list.size || W().isl.cellIsl.size) return 'the island is still registered';
      return true;
    } finally { tl.stop(); creak.stop(); dust.stop(); rum.stop(); }
  });

  await T('island.the-player-under-a-cut-off-slab-gets-the-roof-warning-and-a-hint', async () => {
    const A = K.arena(40, 40, UP), hint = K.spy(g.ui, 'hint'), warn = K.spy(g.ui, 'setWarn');
    try {
      const a = hang(A); K.stand(a.i + 5, a.k + 5); poke(a);
      if (K.until(() => W().isl.list.size > 0, 2) < 0) return 'not noticed';
      if (!hint.args.some((x) => /cut off/.test(String(x[0])))) return 'no hint says the slab over the player is cut off: ' + JSON.stringify(hint.args.map((x) => String(x[0]).slice(0, 50)));
      g.mode = 'play'; g.updateHud(0.016); if (!warn.args.some((x) => x[0] === 'ROOF CREAKING')) return 'the HUD does not say the roof is creaking: ' + JSON.stringify(warn.args.slice(-2));
      hint.args.length = 0; const b = hang(K.arena(40, 40, UP)); K.stand(b.i - 14, b.k - 14); poke(b);
      K.until(() => W().isl.list.size > 0, 2); if (hint.args.some((x) => /over your head/.test(String(x[0])))) return 'the "over your head" hint shows for a player 14 cells away';
      return true;
    } finally { hint.stop(); warn.stop(); }
  });

  await T('island.dig-under-then-cut-the-roof-off-and-it-falls-but-without-the-rule-it-hung', async () => {
    const out = [];
    for (const on of [true, false]) {
      const c0 = flags().collapses;
      const s = tunnelSlab('none', false); W().isl.off = !on; const tl = K.tally();
      try {
        if (flags().collapses !== c0) { out.push('the plain tunnel fell before it was cut'); continue; }
        if (s.slab() !== 240) { out.push('the slab is not whole before the cut'); continue; }
        K.dig(s.i0, s.ht, s.k0 + 3, 20, s.rows - s.ht, 2); K.dig(s.i0, s.ht, s.k0 + 9, 20, s.rows - s.ht, 2); tl.mark();   // both sides of the roof are cut free from the top down
        K.run(18);
        const left = s.slab();
        if (on && left > 20) out.push(`rule on: ${left} of 240 plush in the top layers still hang over the tunnel, 20 at most may be rubble that landed high (islands ${W().isl.stats.islands}, registered ${W().isl.list.size}, pending ${W().isl.pending()}, off ${W().isl.off}, bodies ${sim().n}, thin ${!!W().thinOff}, saved by ${JSON.stringify(W().isl.lastSaved)})`);
        if (on && !(W().isl.stats.islands >= 1)) out.push('rule on: no island was found');
        if (!on && left < 200) out.push(`rule off: only ${left} of 240 hang (the control should keep the upper slab: the roof rule only brings down the lowest cells)`);
        if (on && tl.net() !== 0) out.push('net ' + tl.net());
      } finally { tl.stop(); W().isl.off = false; }
    }
    return out.length === 0 || out.join('; ');
  });

  for (const holder of ['cubes', 'stack', 'pads', 'bulk']) await T(`island.a-cut-roof-slab-held-by-${holder === 'cubes' ? 'frame-cubes' : holder === 'stack' ? 'a-stack-of-cubes' : holder === 'pads' ? 'a-ceiling-plate' : 'a-bulkhead-ceiling'}-stays-until-the-holder-goes`, async () => {
    const out = []; const s = tunnelSlab(holder); const tl = K.tally();
    try {
      K.run(16);
      if (s.slab() !== 240 || W().isl.list.size || W().isl.stats.islands) out.push(`held by ${holder}: ${s.slab()} of 240 left, ${W().isl.stats.islands} islands found`);
      // the holder goes (frames fail, the plate or bulkhead is taken down with the hammer): the slab goes with it
      if (holder === 'cubes' || holder === 'stack') for (const sp of [...W().supports]) g.failSupport(sp, 9);
      else for (let x = 0; x < 20; x++) for (let z = 0; z < 4; z++) { W().setCell(s.i0 + x, s.ht, s.k0 + 5 + z, 0, 0); W().stabQueue.push({ i: s.i0 + x, j: s.ht, k: s.k0 + 5 + z }); }
      tl.mark(); K.run(24);
      if (s.slab() !== 0) out.push(`the holder went and ${s.slab()} of 240 still hang`);
      if (tl.net() !== 0) out.push('net ' + tl.net());
    } finally { tl.stop(); }
    return out.length === 0 || out.join('; ');
  });

  await T('island.the-rule-in-one-table-what-holds-a-group-and-what-does-not', async () => {
    const A = K.arena(60, 60, UP), isl = (i, j, k) => W().isl.isIsland(i, j, k), out = [];
    const chk = (name, got, want) => { if ((want === 0) !== (got === 0) || (want > 0 && got !== want)) out.push(`${name}: ${got}, expected ${want}`); };
    const o = { i: A.i0 + 6, k: A.k0 + 6 };
    K.block(o.i, 10, o.k, 3, 3, 3); chk('a floating block', isl(o.i, 10, o.k), 27);
    K.block(o.i + 8, 0, o.k, 3, 3, 3); chk('a block on the floor', isl(o.i + 8, 0, o.k), 0); chk('the block above the first row of a block on the floor', isl(o.i + 8, 2, o.k), 0);
    K.block(o.i + 16, 0, o.k, 1, 8, 1); K.block(o.i + 17, 4, o.k, 2, 2, 2); chk('a block touching a tower on a face', isl(o.i + 17, 4, o.k), 0);
    K.block(o.i, 0, o.k + 8, 1, 8, 1); K.block(o.i + 1, 4, o.k + 9, 2, 2, 2); chk('a block touching a tower along an edge only', isl(o.i + 1, 4, o.k + 9), 8);
    K.block(o.i + 8, 5, o.k + 8, 3, 3, 3); W().setCell(o.i + 7, 5, o.k + 8, BULK, 0); chk('a block with a bulkhead against it', isl(o.i + 8, 5, o.k + 8), 0);
    K.block(o.i + 16, 5, o.k + 8, 3, 3, 3); W().setCell(o.i + 16, 4, o.k + 8, PAD, 0); chk('a block on a floor pad', isl(o.i + 17, 5, o.k + 8), 0);
    K.block(o.i, 5, o.k + 16, 3, 3, 3); const cb = K.cube('steel', o.i, o.k + 12, 0); chk('a block in the reach of a frame cube', isl(o.i + 1, 5, o.k + 16), 0); K.dropEnt(cb);
    chk('the same block with the cube gone', isl(o.i + 1, 5, o.k + 16), 27);
    K.block(o.i + 8, 5, o.k + 16, 3, 3, 3); W().setCell(o.i + 10, 7, o.k + 18, CACHE, 0); chk('a block with a cache in its corner', isl(o.i + 9, 5, o.k + 16), 27);
    K.block(o.i + 14, 5, o.k + 16, 2, 2, 2); W().setCell(o.i + 14, 4, o.k + 16, CACHE, 0); chk('a few plush resting on a cache that hangs (left by an earlier fall): they stay', isl(o.i + 14, 5, o.k + 16), 0);
    W().setCell(o.i + 20, 12, o.k + 20, REMAINS, 0); chk('a lone cache or remains (nothing to drop)', isl(o.i + 20, 12, o.k + 20), 0);
    // a staircase of cells joined face to face, 80 cells long, reaches the floor far away: held although the quick tests give up
    { let j = 0, a2 = 0; for (let n = 0; n < 80; n++) { W().setCell(o.i + a2, j, o.k + 24, 2, 0); if (n % 2 === 0) j++; else a2++; } chk('a thin long staircase of cells down to the floor', isl(o.i + a2 - 1, j, o.k + 24), 0); }
    // chunk seams: a group across a corner of four chunks
    const ci = (Math.floor((A.i0 + 30) / 16) + 1) * 16, ck = (Math.floor((A.k0 + 30) / 16) + 1) * 16;
    K.clearAround(ci, 12, ck, 6); K.block(ci - 2, 10, ck - 2, 5, 5, 5); chk('a group across a chunk corner', isl(ci, 12, ck), 125);
    // the cap: 3,999 cells fall as a slab, 4,000 are the pile
    K.block(A.i0 + 20, 20, A.k0 + 40, 20, 10, 20); W().setCell(A.i0 + 39, 29, A.k0 + 59, 0, 0);
    chk(`${ISLAND_CAP - 1} cells`, isl(A.i0 + 30, 25, A.k0 + 50), ISLAND_CAP - 1);
    W().setCell(A.i0 + 39, 29, A.k0 + 59, 2, 0); chk(`${ISLAND_CAP} cells (the pile)`, isl(A.i0 + 30, 25, A.k0 + 50), 0);
    return out.length === 0 || out.join('; ');
  });

  await T('island.the-world-edge-holds-and-one-cell-off-it-does-not', async () => {
    const out = []; const isl = (i, j, k) => W().isl.isIsland(i, j, k); K.arena(20, 20, UP);
    for (const [i0, k0, name, held] of [[0, 300, 'west wall i = 0', true], [2, 400, 'two cells off the west wall', false], [300, 0, 'north wall k = 0', true], [300, 3, 'three cells off the north wall', false], [NX - 6, 500, 'east wall i = max', true], [NX - 9, 600, 'three cells off the east wall', false], [700, NZ - 6, 'south wall k = max', true]]) {
      K.clearAround(i0 + 3, 6, k0 + 3, 9); K.block(i0, 5, k0, 6, 3, 6); const n = isl(i0 + 1, 5, k0 + 1);
      if (held && n !== 0) out.push(`${name}: a slab touching the wall is an island (${n})`);
      if (!held && n !== 108) out.push(`${name}: ${n} of 108 (it hangs and is cut off)`);
    }
    return out.length === 0 || out.join('; ');
  });

  await T('island.a-mass-at-the-cap-is-the-pile-and-the-check-does-not-stall-a-tick', async () => {
    const A = K.arena(90, 90, UP); const st0 = { ...W().isl.stats };
    K.block(A.i0 + 5, 6, A.k0 + 5, 72, 4, 72);                            // 20,736 plush hanging: a mass, not a slab. (The tunnel rule eats its underside cell by cell, and a few cells that come loose at the edge are small islands of their own.)
    W().stabQueue.push({ i: A.i0 + 20, j: 6, k: A.k0 + 20 });
    let biggest = 0; const hooks = { ...g.stabHooks(), onIsland: (isl) => { biggest = Math.max(biggest, isl.n); return g.onIsland(isl); } };
    let worst = 0; for (let n = 0; n < 150; n++) { const t0 = performance.now(); g.time += 1 / 60; g.slide.update(1 / 60); sim().step(1 / 60); W().updateStability(1 / 60, g.T.warn, hooks); worst = Math.max(worst, performance.now() - t0); }
    if (biggest >= 1000) return `a group of ${biggest} plush out of a 20,736 plush mass was taken for an island`;
    if (!(W().isl.stats.capped > st0.capped)) return 'the search was not capped';
    if (W().isl.stats.maxFloodMs > 25) return `a capped flood took ${W().isl.stats.maxFloodMs.toFixed(1)} ms`;
    return worst < 60 || `a tick took ${worst.toFixed(0)} ms`;
  });

  await T('island.a-slab-just-under-the-cap-falls-as-a-slab-and-lands-without-losing-plush', async () => {
    const A = K.arena(50, 50, UP), tl = K.tally(); const a = { i: A.i0 + 10, j: 6, k: A.k0 + 10 };
    try {
      K.block(a.i, a.j, a.k, 19, 10, 20); K.stand(A.i0 + 2, A.k0 + 2); tl.mark(); W().stabQueue.push({ i: a.i + 4, j: 6, k: a.k + 4 });
      const f0 = flags(); const t = K.until(() => flags().falls > f0.falls, 6); if (t < 0) return 'the 3,800 plush slab never fell';
      if (!(t >= 2.6 && t <= 3.4)) return `a 3,800 cell slab waited ${t.toFixed(2)} s (3 s is the most)`;
      K.run(24);
      if (K.count(a.i, 14, a.k, 19, 2, 20) !== 0) return 'the top layers of the slab still hang';
      if (tl.net() !== 0) return `plush lost or made up: net ${tl.net()} (bodies ${sim().n})`;
      return true;
    } finally { tl.stop(); }
  });

  await T('island.the-one-in-a-falling-slab-falls-like-any-plush-and-is-neither-lost-nor-sold', async () => {
    const A = K.arena(40, 40, UP), tl = K.tally();
    try {
      const a = hang(A); W().setCell(a.i + 4, a.j + 1, a.k + 4, NEEDLE, 64); W().needle = { i: a.i + 4, j: a.j + 1, k: a.k + 4 };
      const lost0 = S().needleLost; K.stand(A.i0 + 2, A.k0 + 2); tl.mark(); poke(a); K.run(14);
      const body = (() => { for (let q = 0; q < sim().n; q++) if (sim().sp[q] === NEEDLE) return true; return false; })();
      const n = W().needle, cell = W().get(n.i, n.j, n.k) === NEEDLE;
      if (!body && !cell) return 'The One vanished';
      if (S().needleLost && !lost0) return 'The One was lost';
      if (cell && n.j > 5) return 'The One is still hanging at height ' + n.j;
      if (tl.net() !== 0) return 'plush lost: ' + tl.net();
      return !!g.needlePos() || 'the scanner cannot find The One any more';
    } finally { tl.stop(); }
  });

  await T('island.caches-and-remains-in-a-cut-off-slab-stay-and-the-plush-around-them-falls', async () => {
    const A = K.arena(40, 40, UP), tl = K.tally();
    try {
      const a = hang(A); W().setCell(a.i + 3, a.j + 1, a.k + 3, CACHE, 3); W().setCell(a.i + 6, a.j, a.k + 6, REMAINS, 9); tl.mark(); poke(a); K.run(14);
      if (W().get(a.i + 3, a.j + 1, a.k + 3) !== CACHE || W().get(a.i + 6, a.j, a.k + 6) !== REMAINS) return 'a cache or remains was taken down as plush';
      const left = K.count(a.i, a.j, a.k, 10, 3, 10);   // the two special cells, and a plush or two that came to rest on them
      if (left > 6) return `${left} cells are left in the slab`;
      if (W().isl.list.size) return 'the lone caches are an island again';
      return tl.net() === 0 || 'net ' + tl.net();
    } finally { tl.stop(); }
  });

  await T('island.a-support-placed-under-the-slab-during-the-wait-saves-it', async () => {
    const A = K.arena(40, 40, UP), a = hang(A, 8, 3, 8); K.stand(A.i0 + 2, A.k0 + 2); poke(a);
    if (K.until(() => W().isl.list.size > 0, 2) < 0) return 'not noticed';
    K.run(0.4); const cube = K.cube('steel', a.i + 2, a.k + 2, 0); K.run(6);
    if (K.count(a.i, a.j, a.k, 8, 3, 8) !== 192) return 'the slab fell although a cube was set under it in time';
    if (W().isl.list.size || W().isl.cellIsl.size || [...W().creaking.values()].some((c) => c.isl)) return 'the saved slab is still registered or creaking';
    K.dropEnt(cube); return true;
  });

  await T('island.digging-the-slab-back-into-the-pile-during-the-wait-saves-it', async () => {
    const A = K.arena(40, 40, UP), a = hang(A, 8, 3, 8); K.stand(A.i0 + 2, A.k0 + 2); poke(a);
    if (K.until(() => W().isl.list.size > 0, 2) < 0) return 'not noticed';
    K.block(a.i + 4, 0, a.k + 4, 1, 4, 1); K.run(6);                              // a plush column is put back from the floor to the slab
    return K.count(a.i, a.j, a.k, 8, 3, 8) === 192 || 'the slab fell although it was joined to the floor again';
  });

  await T('island.the-wait-grows-with-the-slab-and-with-the-creak-detector', async () => {
    const out = [];
    for (const [nx, nz, nj, lo, hi, up] of [[3, 3, 1, 1.0, 1.4, UP], [20, 20, 3, 2.8, 3.4, UP], [20, 20, 3, 5.8, 6.5, { ...UP, creak: 3 }]]) {
      const A = K.arena(60, 60, up); g.T = g.tune(); const a = { i: A.i0 + 10, j: 4, k: A.k0 + 10 }; K.block(a.i, a.j, a.k, nx, nj, nz); const f0 = flags(); W().stabQueue.push({ i: a.i, j: 4, k: a.k });
      const seen = K.until(() => W().isl.list.size > 0, 1); const t = K.until(() => flags().falls > f0.falls, 9);
      if (seen < 0 || t < 0) { out.push(`${nx * nz * nj} cells: ${seen < 0 ? 'not noticed' : 'never fell'}`); continue; }
      if (!(seen + t >= lo && seen + t <= hi)) out.push(`${nx * nz * nj} cells (warn ${g.T.warn.toFixed(1)}): waited ${(seen + t).toFixed(2)} s, expected ${lo} to ${hi}`);
    }
    g.T = g.tune(); return out.length === 0 || out.join('; ');
  });

  await T('island.the-queue-is-bounded-and-a-flood-of-edits-cannot-stall-a-tick', async () => {
    const A = K.arena(60, 60, UP); const isl = W().isl; K.block(A.i0 + 5, 0, A.k0 + 5, 50, 14, 50);
    for (let n = 0; n < 120000; n++) W().stabQueue.push({ i: A.i0 + 5 + (n % 50), j: 1 + (n % 13), k: A.k0 + 5 + ((n / 50) % 50 | 0) });   // 120,000 forged edit positions
    let worst = 0;
    for (let n = 0; n < 240; n++) { const t0 = performance.now(); g.time += 1 / 60; g.slide.update(1 / 60); sim().step(1 / 60); W().updateStability(1 / 60, g.T.warn, g.stabHooks()); worst = Math.max(worst, performance.now() - t0); }
    if (W().stabQueue.length > 50001) return 'the roof queue was not bounded: ' + W().stabQueue.length;
    if (isl.pending() > 60000) return 'the island queue was not bounded: ' + isl.pending();
    return worst < 60 || `a tick took ${worst.toFixed(0)} ms`;
  });

  await T('island.a-random-edit-soak-loses-no-plush-and-leaves-no-slab-hanging', async () => {
    const out = [];
    for (const seed of [1, 2, 3, 4]) {
      const A = K.arena(44, 44, UP), tl = K.tally(); let s = seed * 7919 + 13; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
      try {
        K.block(A.i0 + 4, 0, A.k0 + 4, 36, 12, 36); let lost = 0;
        for (let step = 0; step < 36; step++) {
          const r = rnd(), i = A.i0 + 4 + ((rnd() * 28) | 0), k = A.k0 + 4 + ((rnd() * 28) | 0), j = (rnd() * 8) | 0;
          if (r < 0.55) K.dig(i, j, k, 2 + ((rnd() * 7) | 0), 1 + ((rnd() * 3) | 0), 2 + ((rnd() * 7) | 0));
          else if (r < 0.7) { K.block(i, j + 3, k, 3, 2, 3); W().stabQueue.push({ i, j: j + 3, k }); }
          else if (r < 0.8) K.dig(i, 0, k, 1, 12, 12);
          else if (r < 0.9) { for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) W().setCell(i + x, j, k + z, PAD, 0); W().stabQueue.push({ i, j, k }); }
          else K.dig(i, j, k, 12, 2, 1);
          tl.mark(); K.run(0.6); lost += tl.net();
        }
        tl.mark(); K.run(25); lost += tl.net();
        if (lost !== 0) out.push(`seed ${seed}: plush lost or made up (net ${lost})`);
        // nothing may hang: every plush left in the arena is joined to something that holds it
        let hang2 = 0; for (let i = A.i0; i < A.i0 + 44; i++) for (let k = A.k0; k < A.k0 + 44; k++) for (let j = 1, top = W().topAt(i, k); j < top; j++) if (W().get(i, j, k) && W().isl.isIsland(i, j, k) > 0) hang2++;
        if (hang2) out.push(`seed ${seed}: ${hang2} plush still hang loose`);
        if (W().isl.list.size) out.push(`seed ${seed}: ${W().isl.list.size} islands still registered`);
      } finally { tl.stop(); }
    }
    return out.length === 0 || out.join('; ');
  });

  await T('island.a-saved-world-with-a-hanging-slab-loads-and-lets-it-go-once', async () => {
    const A = K.arena(40, 40, UP); const a = hang(A);
    // the slab was cut off earlier (an older version, or a save made during the wait): nothing is queued, it is only in the save
    W().stabQueue.length = 0; g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) return 'save failed';
    const { loadSaved } = await import('../state.js'); const sv = loadSaved(); g.loadWorld(sv.S, sv); g.noSave = true; g.mode = 'play';
    if (K.count(a.i, a.j, a.k, 10, 3, 10) !== 300) return 'the slab did not survive the save';
    const f0 = flags(); const t = K.until(() => flags().falls > f0.falls, 14); if (t < 0) return 'the loaded slab never fell (the scan after a load found nothing)';
    K.run(10); if (K.count(a.i, a.j, a.k, 10, 3, 10) !== 0) return 'cells still hang after the fall';
    if (flags().falls !== f0.falls + 1) return `it fell ${flags().falls - f0.falls} times`;
    // save again and load: nothing hangs, nothing falls
    g.noSave = false; g.save(); g.noSave = true; const sv2 = loadSaved(); g.loadWorld(sv2.S, sv2); g.noSave = true; g.mode = 'play'; const f1 = flags(); K.run(12);
    return (flags().falls === f1.falls && !W().isl.list.size) || 'a second load made another slab fall';
  });

  await T('island.the-scan-after-a-load-is-spread-over-ticks-and-bounded', async () => {
    const A = K.arena(60, 60, UP); K.block(A.i0 + 5, 0, A.k0 + 5, 50, 10, 50);
    for (let n = 0; n < 4000; n++) W().removeCell(A.i0 + 5 + ((n * 7) % 50), 1 + (n % 8), A.k0 + 5 + ((n * 13) % 50), false);   // thousands of edits in the save
    g.noSave = false; g.mode = 'play'; g.save(); g.noSave = true;
    const { loadSaved } = await import('../state.js'); const sv = loadSaved(); g.loadWorld(sv.S, sv); g.noSave = true; g.mode = 'play';
    let worst = 0, ticks = 0; while (W().isl.scan && ticks < 4000) { const t0 = performance.now(); g.time += 1 / 60; W().updateStability(1 / 60, g.T.warn, g.stabHooks()); worst = Math.max(worst, performance.now() - t0); ticks++; }
    if (W().isl.scan) return 'the scan never finished';
    return worst < 25 || `a tick of the scan took ${worst.toFixed(1)} ms`;
  });

  await T('island.edits-through-the-real-game-loop-make-the-same-collapse', async () => {
    const A = K.arena(40, 40, UP), a = hang(A); K.stand(A.i0 + 2, A.k0 + 2); poke(a); const f0 = flags();
    for (let n = 0; n < 400 && flags().falls === f0.falls; n++) { g.time += 0.02; g.updatePlay(0.02); }
    return flags().falls > f0.falls || 'the full game loop (updatePlay) never let the slab go';
  });
}
