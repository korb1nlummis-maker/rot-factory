import { kit } from './island_lib.js';
import { UP } from './portal_lib.js';
import { BULK, PAD, CACHE, REMAINS } from '../plushdata.js';
import { ISLAND_CAP } from '../island.js';
import { NX, NZ } from '../config.js';
// island.audit.*: an adversarial audit of the cut off island rule (island.js). Each test names the bug it was written against; the fix is in island.js / game.js.
// Run: `await __selftest('island.audit.')`. Every test starts in a fresh world (WORLD_TESTS in selftest.js has the prefix `island.`).
export default async function (ctx) {
  const { T, g, S, sim, p, V3, cellX, cellY, cellZ, toI, toJ, toK } = ctx;
  const K = kit(ctx), W = K.W;
  const flags = () => ({ falls: S().stats.islandFalls || 0, collapses: S().stats.collapses || 0 });

  // BUG 1. letGo() looked the slab up again cell by cell. When a cell was held by the cheap tests (its own column, or the cache of this tick) the search never ran, but letGo still
  // marked the cells of the LAST search (island.lastN, island.ord: the search that found this very slab, seconds ago) as held. A slab that was split during its wait, with one half joined
  // to the pile again, therefore kept the other half hanging for ever: no creak, no fall, the half stayed in the air until some later dig happened to ask about it.
  await T('island.audit.a-slab-split-while-it-waits-lets-the-cut-off-half-go-although-the-other-half-was-joined-to-the-pile', async () => {
    const A = K.arena(60, 60, UP), tl = K.tally(), a = { i: A.i0 + 10, j: 6, k: A.k0 + 10 };
    try {
      K.block(a.i, a.j, a.k, 6, 2, 6); K.block(a.i + 6, a.j + 1, a.k, 6, 2, 6);   // left half j 6..7, right half j 7..8, joined where they touch (the lowest layer is the left half)
      K.stand(A.i0 + 2, A.k0 + 2); W().stabQueue.push({ i: a.i + 2, j: a.j, k: a.k + 2 });   // the seed is the lowest cell of the left half: the first cell of the slab's list
      if (K.until(() => W().isl.list.size > 0, 2) < 0) return 'the slab was not noticed';
      K.run(0.3);
      for (let j = a.j; j <= a.j + 2; j++) for (let k = 0; k < 6; k++) W().removeCell(a.i + 5, j, a.k + k, false);   // the player cuts the slab in two (inside the slab: nothing is queued for the island)
      K.block(a.i + 2, 0, a.k + 2, 1, a.j, 1);                                                                      // and joins the left half to the floor again under its first cell
      tl.mark();
      K.run(10);
      const left = K.count(a.i, a.j, a.k, 5, 2, 6), right = K.count(a.i + 6, a.j, a.k, 6, 3, 6);
      if (left < 40) return `the half that was joined to the floor fell as well (${left} of 60 cells left)`;   // (the slide chain of the other half's fall can shake a few edge cells off it)
      if (right !== 0) return `${right} cells of the half that was cut off still hang in the air`;
      if (W().isl.list.size) return 'an island is still registered';
      return tl.net() === 0 || 'net plush ' + tl.net();
    } finally { tl.stop(); }
  });

  // BUG 2. drain() read the clock only after every 16th seed. A seed that cannot be settled by the cheap tests costs a flood of up to ISLAND_CAP cells, so one tick could run 16 floods
  // (12 ms measured against a 2 ms budget) when the player digs under a big mass that nothing holds.
  await T('island.audit.the-seed-budget-is-read-after-every-flood', async () => {
    const A = K.arena(110, 110, UP); K.block(A.i0 + 10, 10, A.k0 + 10, 90, 2, 90);   // 16,200 cells hanging: a mass (held by the cap), every seed in it floods 4,000 cells
    const isl = W().isl; isl.budgetMs = 0; let s = 11; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let n = 0; n < 400; n++) isl.push(A.i0 + 10 + ((rnd() * 90) | 0), 10 + ((rnd() * 2) | 0), A.k0 + 10 + ((rnd() * 90) | 0));
    const f0 = isl.stats.floods; isl.update(1 / 60, g.T.warn, g.stabHooks()); const n1 = isl.stats.floods - f0;
    isl.budgetMs = 2; isl.q.length = 0; isl.qh = 0; isl.qSet.clear();
    return n1 <= 2 || `${n1} floods of ${ISLAND_CAP} cells in one tick with a budget of 0 ms`;
  });

  // BUG 3. punch (P, the way out when buried) and recall took cells out with queue = false and loosen() does nothing: neither the roof rule nor the island rule ever looked at what was left.
  await T('island.audit.punching-the-last-hold-of-a-slab-lets-it-fall', async () => {
    const A = K.arena(60, 60, UP), tl = K.tally();
    try {
      K.stand(A.i0 + 2, A.k0 + 2); p().yaw = Math.PI / 2; p().pitch = 0; p().vel.set(0, 0, 0); p().pos.set(cellX(A.i0 + 20), 0.9, cellZ(A.k0 + 20));
      const e = p().eyePos(new V3()), ti = toI(e.x + 0.9), tj = toJ(e.y), tk = toK(e.z);
      K.block(ti, 0, tk, 1, tj + 1, 1);                              // a pillar from the floor to the eye (its top cell T is what the punch hits)
      K.block(ti + 1, tj, tk - 3, 6, 3, 6);                          // a slab beside the top of the pillar: the one face contact at T holds it
      if (W().isl.isIsland(ti + 3, tj, tk) !== 0) return 'the slab is cut off before the punch';
      W().stabQueue.length = 0; tl.mark();
      const f0 = flags(); g.punchT = 0; g.punch();
      if (W().get(ti, tj, tk)) return 'the punch did not take the pillar out (test set up wrong)';
      K.run(0.2);
      if (K.until(() => flags().falls > f0.falls || (W().isl.list.size > 0 && K.count(ti + 1, tj, tk - 3, 6, 3, 6) < 108), 6) < 0) return `the slab hangs in the air after its last hold was punched out (${K.count(ti + 1, tj, tk - 3, 6, 3, 6)} cells)`;
      K.run(8);
      return K.count(ti + 2, tj + 1, tk - 3, 5, 2, 6) === 0 || `${K.count(ti + 2, tj + 1, tk - 3, 5, 2, 6)} cells of the slab still hang`;
    } finally { tl.stop(); }
  });

  // frames that hold a slab must still hold it after a save and a load (the scan after a load runs while the supports are restored)
  await T('island.audit.a-slab-held-by-frame-cubes-stays-after-a-save-and-a-load', async () => {
    const A = K.arena(60, 60, UP), a = { i: A.i0 + 10, j: 4, k: A.k0 + 10 };
    K.block(a.i, a.j, a.k, 12, 4, 12); const c1 = K.cube('steel', a.i + 2, a.k + 2, 0), c2 = K.cube('steel', a.i + 6, a.k + 6, 0); void c1; void c2;
    K.stand(A.i0 + 2, A.k0 + 2); W().stabQueue.push({ i: a.i + 4, j: a.j, k: a.k + 4 }); K.run(4);
    if (K.count(a.i, a.j, a.k, 12, 4, 12) !== 576) return 'the slab on the cubes fell before the save';
    g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) return 'save failed';
    const { loadSaved } = await import('../state.js'); const sv = loadSaved(); g.loadWorld(sv.S, sv); g.noSave = true; g.mode = 'play';
    K.run(14);
    return K.count(a.i, a.j, a.k, 12, 4, 12) === 576 || `${576 - K.count(a.i, a.j, a.k, 12, 4, 12)} cells of the slab on the cubes fell after the load`;
  });

  // A differential check: island.js against a plain breadth first search of the same rules, over random structures that cross chunk seams, touch the floor and the world edge, with caches,
  // remains, pads and bulkheads in them.
  await T('island.audit.the-quick-tests-agree-with-a-plain-flood-on-random-structures', async () => {
    const out = []; const w = () => W();
    const oracle = (i0, j0, k0) => {   // [held, size]
      const seen = new Set([(j0 * NZ + k0) * NX + i0]), st = [[i0, j0, k0]]; let n = 0, held = false, plush = false, onCache = false;
      while (st.length) {
        const [i, j, k] = st.pop(); n++;
        const s = w().get(i, j, k);
        if (j === 0 || i === 0 || k === 0 || i === NX - 1 || k === NZ - 1 || s === BULK || s === PAD) { held = true; break; }
        if (w().supports.length && w().supportBonus(cellX(i), cellY(j), cellZ(k)) > 0) { held = true; break; }
        if (n >= ISLAND_CAP) { held = true; break; }
        if (s !== CACHE && s !== REMAINS) plush = true;
        if (w().get(i, j - 1, k) === CACHE || w().get(i, j - 1, k) === REMAINS) onCache = true;
        for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const a = i + di, b = j + dj, c = k + dk; if (b < 0 || a < 0 || c < 0 || a >= NX || c >= NZ) continue;
          const key = (b * NZ + c) * NX + a; if (!seen.has(key) && w().get(a, b, c)) { seen.add(key); st.push([a, b, c]); }
        }
      }
      if (!held && !plush) held = true;
      if (!held && n <= 64 && onCache) held = true;
      return [held, n];
    };
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const A = K.arena(70, 70, UP); let s = seed * 104729 + 7; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
      const ci = (Math.floor((A.i0 + 20) / 16) + 1) * 16 - 12, ck = (Math.floor((A.k0 + 20) / 16) + 1) * 16 - 12;   // 24 x 24 straddling a chunk corner
      const dens = [0.3, 0.38, 0.45, 0.35, 0.5, 0.28][seed - 1];
      for (let i = 0; i < 24; i++) for (let k = 0; k < 24; k++) for (let j = 0; j < 12; j++) if (rnd() < dens) { const r = rnd(); W().setCell(ci + i, j, ck + k, r < 0.01 ? CACHE : r < 0.02 ? REMAINS : r < 0.03 ? PAD : r < 0.035 ? BULK : 2, 0); }
      if (seed % 2) for (let m = 0; m < 5; m++) { const i = ci + ((rnd() * 24) | 0), k = ck + ((rnd() * 24) | 0); for (let j = 0; j < 6; j++) W().setCell(i, j, k, 2, 0); }   // a few columns from the floor
      let bad = 0, checked = 0, isl = 0;
      for (let i = 0; i < 24; i++) for (let k = 0; k < 24; k++) for (let j = 1; j < 12; j++) {
        const x = ci + i, z = ck + k; const sp = W().get(x, j, z); if (!sp) continue;
        const [held, n] = oracle(x, j, z); const got = W().isl.isIsland(x, j, z); checked++;
        if (!held) isl++;
        if (held ? got !== 0 : got !== n) { if (bad++ < 3) out.push(`seed ${seed} (${x},${j},${z}) ${sp}: oracle ${held ? 'held' : 'island ' + n}, island.js ${got === 0 ? 'held' : 'island ' + got}`); }
      }
      if (!isl) out.push(`seed ${seed}: the structure had no island in it (${checked} cells): the check proved nothing`);
    }
    return out.length === 0 || out.join('; ');
  });
}
