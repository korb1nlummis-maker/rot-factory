import { kit } from './island_lib.js';
import { UP, makeKit } from './portal_lib.js';
// island.perf.*: what the roof and island checks cost while the game does the heavy things: a machine digging 200 cells a second, an avalanche, a 40 m Portal bore, a borer and a bot
// through the real loop. The numbers are per tick of world.updateStability (the roof check, the island seeds and the timers); a frame is 16 ms.
// Run: `await __selftest('island.perf.')`. Each test starts in a fresh world.
export default async function (ctx) {
  const { T, g, S, sim, adv, spot, craft, selectTool, lookEast, plan, placeNow, cellX, cellZ, L, tiles } = ctx;
  const K = kit(ctx), W = K.W;
  const tick = (dt = 1 / 60) => { g.time += dt; g.slide.update(dt); sim().step(dt); const t0 = performance.now(); W().updateStability(dt, g.T.warn, g.stabHooks()); g.updateAfters(dt); return performance.now() - t0; };
  const fmt = (a) => `avg ${(a.sum / a.n).toFixed(2)} ms, worst ${a.max.toFixed(1)} ms over ${a.n} ticks`;
  const acc = () => ({ sum: 0, max: 0, n: 0, add(ms) { this.sum += ms; this.n++; if (ms > this.max) this.max = ms; } });
  const BUDGET = { avg: 3, max: 12 };   // per tick; the island part alone is capped at 2 ms (budgetMs) plus one flood

  await T('island.perf.a-machine-digging-200-cells-a-second-lined-as-it-goes-costs-little-and-cuts-nothing-off', async () => {
    const A = K.arena(100, 40, UP); K.block(A.i0 + 4, 0, A.k0 + 6, 90, 12, 26); K.stand(A.i0 + 1, A.k0 + 1);
    const a = acc(); const f0 = S().stats.islandFalls || 0, isl0 = W().isl.stats.islands; let col = 0, cells = 0, t = 0;
    const lo = A.k0 + 6 + 9;
    for (let n = 0; n < 60 * 14; n++) {
      // 200 cells a second is 3.3 cells a tick: a 4 wide 3 high face is 12 cells a column, so a column every 3.6 ticks
      t += 200 / 60; while (t >= 12 && col < 86) { t -= 12; for (let z = 0; z < 4; z++) for (let j = 0; j < 3; j++) if (W().removeCell(A.i0 + 4 + col, j, lo + z, true)) cells++; if (col % 6 === 0) W().supports.push({ x: cellX(A.i0 + 4 + col), y: 1.2, z: cellZ(lo + 2), r: 5, b: 3, id: 'perf' + col }); col++; }
      a.add(tick());
    }
    for (let n = 0; n < 240; n++) a.add(tick());
    if (cells < 800) return `the machine only dug ${cells} cells`;
    if (W().isl.stats.islands !== isl0 || (S().stats.islandFalls || 0) !== f0) return `a clean lined tunnel cut ${W().isl.stats.islands - isl0} slabs off`;
    return (a.sum / a.n < BUDGET.avg && a.max < BUDGET.max * 3) || fmt(a);
  });

  await T('island.perf.an-avalanche-on-a-big-pile-costs-little-and-loses-no-plush', async () => {
    const A = K.arena(70, 70, UP), tl = K.tally(); K.block(A.i0 + 5, 0, A.k0 + 5, 60, 22, 60); K.stand(A.i0 + 1, A.k0 + 1); tl.mark();
    const a = acc(); const isl0 = W().isl.stats.islands; let peak = 0;
    for (let n = 0; n < 60 * 24; n++) {
      if (n % 40 === 0 && n < 60 * 12) {   // a blast level slide seeded on the four cliff faces of the block in turn
        const m = (n / 40) | 0, along = 8 + (m * 13) % 45, f = m % 4, i = f === 0 ? A.i0 + 5 : f === 1 ? A.i0 + 64 : A.i0 + 5 + along, k = f === 2 ? A.k0 + 5 : f === 3 ? A.k0 + 64 : A.k0 + 5 + along;
        g.slide.triggerPatch(i, k, 3.2, 4); g.slide.trigger(i, 19, k, 3); g.slide.trigger(i, 14, k, 3);
      }
      a.add(tick()); peak = Math.max(peak, sim().n);
    }
    if (peak < 30) return `the avalanche never started (${peak} bodies at most)`;
    if (W().isl.stats.islands - isl0 > 3) return `an avalanche on solid pile registered ${W().isl.stats.islands - isl0} floating slabs`;
    return (a.sum / a.n < BUDGET.avg && a.max < BUDGET.max * 3 && tl.net() === 0) || `${fmt(a)}, net plush ${tl.net()}`;
  });

  await T('island.perf.a-40-m-portal-bore-cuts-no-slab-off-and-costs-little', async () => {
    const K6 = makeKit(ctx); fresh0(); const st = K6.site({ span: 6, rows: 24, len: 90 }); const e = K6.mouth(st, 'steel'); K6.fast();
    const a = acc(); const isl0 = W().isl.stats.islands; const t0 = performance.now(); let n = 0;
    while (e.adv < 18 && n < 60 * 600) { K6.run(1 / 30, 1 / 30); a.add(tick(1 / 30)); n++; }   // (18 slabs of 4 cells is 43 m)
    const wall = performance.now() - t0; void wall;
    if (!(e.adv >= 12)) return `the portal only advanced ${e.adv} slabs`;
    if (W().isl.stats.islands !== isl0) return `the bore cut ${W().isl.stats.islands - isl0} slabs off`;
    return (a.sum / a.n < BUDGET.avg && a.max < BUDGET.max * 3) || fmt(a);
    function fresh0() { K.arena(10, 10, UP); }
  });

  await T('island.perf.a-borer-and-a-crew-bot-through-the-real-loop-cut-nothing-off', async () => {
    const out = []; K.arena(10, 10, UP); const f = ctx.fresh; f({ borer: 1, borerSize: 2, power: 1, belts: 1, crew: 1, crewSlots: 3, timber: 1, steel: 1 }); S().money = 1e12;
    const { i, k } = spot(); craft('borer'); selectTool('borer'); let placed = false;
    for (const back of [1.5, 2.0, 2.5]) for (const pitch of [0, -0.1, -0.2]) { lookEast(cellX(i + 1) - back, cellZ(k), pitch); const pl = await plan(); if (pl && pl.ok) { placeNow(); placed = true; break; } if (placed) break; }
    if (!placed) return 'the borer could not be placed';
    const b = g.crew.spawn(); b.x = g.crew.home().x + 1; b.z = g.crew.home().z + 1; g.crew.order(b, 0, cellX(i + 30), 0.3, cellZ(k + 12));
    const isl0 = W().isl.stats.islands, c0 = S().stats.cells || 0, a = acc();
    for (let n = 0; n < 2400; n++) { for (const it of g.machines.items.values()) it.ent.pw = 1; g.time += 0.05; g.updatePlay(0.05); a.add(W().isl.stats.ms || 0); }   // two minutes of play
    if ((S().stats.cells || 0) - c0 < 20) out.push(`the borer and bot only dug ${(S().stats.cells || 0) - c0} cells`);
    if (W().isl.stats.islands !== isl0) out.push(`a borer or bot cut ${W().isl.stats.islands - isl0} slabs off`);
    if (a.max > 12) out.push(`an island update took ${a.max.toFixed(1)} ms`);
    return out.length === 0 || out.join('; ');
  });

  await T('island.perf.a-mech-line-with-a-roof-bolter-digs-and-bolts-and-cuts-nothing-off', async () => {
    K.arena(10, 10, UP); ctx.fresh({ power: 1, belts: 1, sorter: 1, vault: 1, fans: 1, detector: 1, mech: 1, claw: 1, borer: 1, depots: 1, steel: 1, timber: 1, mechLayer: 1, mechBolt: 1 });
    const sp0 = spot(-6), kk = sp0.k; let i0 = sp0.i; for (let g2 = 0; g2 < 60 && W().topAt(i0 + 8, kk) < 6; g2++) i0++;
    const mk = (type, ii, extra = {}) => { const e = { id: g.nextId(), type, i: ii, j: 0, k: kk, dir: 0, rise: 0, ...extra }; if (type === 'belt') e.items = []; S().entities.push(e); g.addEntity(e); return e; };
    const mech = mk('mech', i0 - 1, { dir: 0 }); for (let n = 1; n <= 4; n++) mk('belt', i0 - 1 - n, { dir: 2 }); mk('vault', i0 - 6, { dir: 2 });
    const isl0 = W().isl.stats.islands, c0 = S().stats.cells || 0, a = acc(); const f0 = S().stats.islandFalls || 0;
    for (let n = 0; n < 5200; n++) { for (const t of tiles()) if (['mech', 'belt', 'vault'].includes(t.type)) t.pw = 1; g.time += 0.05; L().update(0.05); a.add(tick(0.05)); }
    const dug = (S().stats.cells || 0) - c0, frames = S().entities.filter((e) => e.type === 'frame' && e.auto).length;
    if (dug < 30) return `the mech only dug ${dug} cells`;
    if (W().isl.stats.islands !== isl0 || (S().stats.islandFalls || 0) !== f0) return `a mech line cut ${W().isl.stats.islands - isl0} slabs off (dug ${dug}, frames ${frames}, advanced ${mech.adv})`;
    return (a.sum / a.n < BUDGET.avg && a.max < BUDGET.max * 3) || fmt(a);
  });

  await T('island.perf.the-island-check-itself-stays-under-its-budget-while-a-huge-pile-is-edited-at-random', async () => {
    const A = K.arena(80, 80, UP); K.block(A.i0 + 4, 0, A.k0 + 4, 72, 30, 72); K.stand(A.i0 + 1, A.k0 + 1); const isl = W().isl; const st0 = { ...isl.stats };
    let s = 99; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; let worst = 0;
    for (let n = 0; n < 60 * 20; n++) {
      for (let q = 0; q < 4; q++) W().removeCell(A.i0 + 6 + ((rnd() * 68) | 0), 1 + ((rnd() * 28) | 0), A.k0 + 6 + ((rnd() * 68) | 0), true);   // 240 random cells a second, deep in a mass
      tick(); worst = Math.max(worst, isl.stats.ms);
    }
    const seeds = isl.stats.seeds - st0.seeds, floods = isl.stats.floods - st0.floods, visited = isl.stats.visited - st0.visited;
    if (isl.stats.islands - st0.islands > 200) return `${isl.stats.islands - st0.islands} floating pockets (random holes in a solid pile do cut a few cells off)`;
    return (worst < 8) || `island update worst ${worst.toFixed(1)} ms (${seeds} seeds, ${floods} floods, ${visited} cells visited)`;
  });
  // the tests that follow in the full run share the world the last test left: give them a small one (a world with half a million edits will not fit in a save) and the game state they expect
  await T('island.perf.leaves-a-small-fresh-world-for-the-tests-after-it', async () => { await ctx.newWorld(); g.collapseT = 99; g._shedT = 0; return W().diffCount < 1000 || 'diff ' + W().diffCount; });   // (and the two things these tests set on the game: the boom limiter and the slope shedding timer)
}
