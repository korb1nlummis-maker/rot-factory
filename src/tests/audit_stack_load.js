// stack.audit.*: the audit of wave 10 (stacked building), load and collapse side. Each test tries to break the claim in DESIGN_SATISFACTORY.md section 16.
// Fixtures from stack_lib.js; every `stack.` test starts in a fresh world.
import { kit, UP } from './stack_lib.js';
import * as LT from '../loadtrace.js';
import * as ST from '../stack.js';

export default async function (ctx) {
  const { T, g, S, w, p, adv, stepSim, craft, selectTool, plan, aimPoint, totalLoad, toI, toK } = ctx;
  const K = kit(ctx), W = K.W;
  const sup = (e) => K.support(e);
  const tot = (e) => { const pr = {}, s = sup(e), t = totalLoad(W(), s, [], pr); return { t, own: pr.own, above: pr.above, r: t / s.cap }; };
  const chamber = (Y, j0, n = 10, rows = 1) => K.dig(Y.m - 3, j0, Y.lo - 3, n, rows, n);
  // a wall of cubes laid like bricks: every row is shifted by two cells against the one under it, so each cube rests on two cubes of the row below
  const brick = (rows, cols = 8) => {
    const sp = ctx.spot(12), i0 = sp.i + 8, k0 = sp.k - 14, lo = k0 + 4;
    K.solid(i0, k0, cols * 4 + 12, 12, rows * 4 + 6); K.dig(i0 + 2, 0, lo, cols * 4 + 6, rows * 4, 4);
    const cubes = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cubes.push(K.cube('steel', i0 + 4 + (r % 2) * 2 + c * 4, lo, r * 4));
    return { i0, k0, lo, cubes, x0: i0 + 4 };
  };

  await T('stack.audit.the-stack-index-never-keeps-a-cube-that-was-only-tried-for-size', async () => {
    // the borer and the roof bolter ask "would a cube here hold" by pushing a stand-in into the support list and popping it again; the next cube they set
    // makes the list the same length again, so a cache keyed on the list and its length would keep serving the stand-in
    const Y = K.yard({ levels: 2 }); const [A] = K.stack(Y, ['steel']);
    const e = g.machines.frameEnt('x', 'steel', Y.m, Y.lo, 4); delete e.clear;
    g.machines.supportHolds(e, 'steel', 'kind');
    const ent = { id: g.nextId(), type: 'frame', ...e }; S().entities.push(ent); g.addEntity(ent);
    const ups = ST.above(g, sup(A)); const real = sup(ent);
    if (ups.length !== 1) return 'the cube on top is not found: ' + ups.length;
    if (ups[0] !== real) return `the cube above is the stand-in (${ups[0].id}), not the real one (${real.id})`;
    if (ST.cubeAt(g, Y.m, 5, Y.lo) !== real) return 'cubeAt serves the stand-in';
    // and the cascade works: the lower cube goes, the real upper one is warned
    g.failSupport(sup(A), 1.3);
    return (g.pendFail && g.pendFail.has(real.id)) || 'the cube above did not lose its footing when the one under it fell';
  });

  await T('stack.audit.a-push-and-pop-of-supports-never-leaves-a-stale-cell-map', async () => {
    const Y = K.yard({ levels: 2 }); const [A] = K.stack(Y, ['steel']);
    const w0 = W(); const first = ST.cubeAt(g, Y.m + 1, 2, Y.lo + 1); if (first !== sup(A)) return 'cubeAt does not find the cube';
    // swap the support at the same list length without a new list: pop one, push another at another place
    const keep = w0.supports.pop(); const other = { ...keep, id: 'other', blk: { ...keep.blk, j0: 8, j1: 11 } }; w0.supports.push(other);
    const at = ST.cubeAt(g, Y.m + 1, 9, Y.lo + 1), old = ST.cubeAt(g, Y.m + 1, 2, Y.lo + 1);
    w0.supports.pop(); w0.supports.push(keep);
    return (at === other && !old) || `after swapping the last support the cell map is stale: ${at && at.id} / ${old && old.id}`;
  });

  await T('stack.audit.setting-a-cube-on-a-brick-wall-is-checked-in-bounded-time', async () => {
    // each cube rests on two cubes, so the number of ways down is 2 to the power of the height: the check must visit every cube once
    const B = brick(9); const e = g.machines.frameEnt('x', 'steel', B.x0 + 2 * 4, B.lo, 9 * 4); delete e.clear;
    const t0 = performance.now(); const why = ST.cubeWhy(g, e, 'steel'); const ms = performance.now() - t0;
    if (ms > 150) return `one cube check on a 9 row brick wall took ${ms.toFixed(0)} ms`;
    return why === null || 'a cube on a wall with no roof was refused: ' + why;
  });

  await T('stack.audit.a-cube-check-on-a-brick-wall-still-names-the-overloaded-cube-and-reads-the-same-as-the-column', async () => {
    // same verdict as the plain column: a light cube on a heavy wall is fine, and a roof that overloads the wall under it is named
    const B = brick(4); const j0 = 16; const e = g.machines.frameEnt('x', 'steel', B.x0 + 2 * 4, B.lo, j0); delete e.clear;
    if (ST.cubeWhy(g, e, 'steel')) return 'the empty wall refused a cube: ' + ST.cubeWhy(g, e, 'steel');
    // a heavy roof over the place the new cube would stand in: its reach sees a deep pile, so it carries a lot; timber under it must refuse
    const sp = ctx.spot(12), i0 = sp.i + 8, k0 = sp.k - 14, lo = k0 + 4; void i0; void lo;
    const Y = K.yard({ levels: 2, rows: 68, dx: 80 }); const [A] = K.stack(Y, ['timber']); chamber(Y, 8, 14);
    const e2 = g.machines.frameEnt('x', 'steel', Y.m, Y.lo, 4); delete e2.clear; const why = ST.cubeWhy(g, e2, 'steel');
    return (!!why && /under it would carry \d+%/.test(why)) || 'a heavy roof on a timber cube under it was not refused: ' + why;
  });

  await T('stack.audit.a-17-cube-column-is-weighed-in-bounded-time-per-cube', async () => {
    const Y = K.yard({ levels: 17, rows: 70 }); const cs = K.stack(Y, Array(17).fill('steel')); chamber(Y, 68 - 2, 10, 1);
    let worst = 0; for (const c of cs) { const t0 = performance.now(); totalLoad(W(), sup(c)); worst = Math.max(worst, performance.now() - t0); }
    // the game weighs two cubes every 0.35 s, and a cube set on the column is weighed at every frame it is aimed
    const t0 = performance.now(); const e = g.machines.frameEnt('x', 'steel', Y.m, Y.lo, 68); delete e.clear; ST.cubeWhy(g, e, 'steel'); const why = performance.now() - t0;
    if (worst > 25) return `one cube of a 17 cube column took ${worst.toFixed(1)} ms to weigh`;
    return why < 40 || `the check for a new cube on a 17 cube column took ${why.toFixed(1)} ms`;
  });

  await T('stack.audit.a-cube-on-half-ground-and-half-cube-hands-the-cube-only-its-half', async () => {
    // nothing is created or lost where a cube rests on two things: what the ground holds is gone, the rest goes down the cube
    const Y = K.yard({ levels: 2 }); const [A] = K.stack(Y, ['steel']);
    K.dig(Y.m + 2, 4, Y.lo, 4, 4, 4); const B2 = K.cube('steel', Y.m + 2, Y.lo, 4); chamber(Y, 8, 14);
    const r = LT.restOf(W(), sup(B2)); if (r.cubes.size !== 1 || r.ground + [...r.cubes.values()][0] !== 16) return 'the footing: ' + JSON.stringify([r.ground, [...r.cubes.values()], r.hang]);
    const a = tot(A), b = tot(B2), onA = [...r.cubes.values()][0];
    const share = b.t * onA / (r.ground + onA);
    return Math.abs(a.above - share) < Math.max(1e-6, share * 1e-6) || `the lower cube carries ${a.above.toFixed(1)} from the upper one, expected ${share.toFixed(1)} of ${b.t.toFixed(1)}`;
  });

  await T('stack.audit.every-roof-in-reach-of-a-brick-wall-weighs-once-at-the-floor', async () => {
    // conservation: what the bottom row carries from above is what the rows above carry of their own, never more (no cube creates weight) and never less than the heaviest top
    const B = brick(4); K.dig(B.x0 - 4, 16, B.lo - 3, 36, 1, 10);
    const sups = W().supports.filter((s) => s.blk), parts = (s) => { const pr = {}; const t = totalLoad(W(), s, [], pr); return { t, ...pr }; };
    let ownAll = 0; for (const s of sups) ownAll += LT.loadOn(W(), s);
    let floor = 0; for (const s of sups) if (s.blk.j0 === 0) floor += parts(s).t;
    if (floor > ownAll * (1 + 1e-9)) return `the bottom row carries ${floor.toFixed(0)}, every cube's own roof adds up to ${ownAll.toFixed(0)}`;
    // and nothing was lost on the way: with no ground between the cubes the floor row carries all of it
    return Math.abs(floor - ownAll) < ownAll * 1e-6 || `the bottom row carries ${floor.toFixed(0)} of ${ownAll.toFixed(0)}`;
  });

  await T('stack.audit.a-column-of-four-falls-cube-by-cube-and-leaves-no-floating-cube-or-part', async () => {
    const Y = K.yard({ levels: 4 }); const cs = K.stack(Y, ['steel', 'steel', 'steel', 'steel']);
    await K.putPlate(cs[0], 'f', 0, 0); await K.putPlate(cs[2], 'f', 1, 0);
    const casc0 = S().stats.stackCascades || 0;
    g.failSupport(sup(cs[0]), 1.3); adv(14);
    for (const c of cs) if (K.M().items.has(c.id) || sup(c)) return `cube ${c.id} still stands after the cascade`;
    if (S().entities.some((e) => e.bay !== undefined)) return 'a part of a fallen cube is still an entity';
    if (K.count(Y.m, 0, Y.lo, 4, 16, 4, K.PAD)) return 'plate cells hang in the world after the cascade';
    if ((S().stats.stackCascades || 0) - casc0 !== 3) return `cascade count ${(S().stats.stackCascades || 0) - casc0} (before ${casc0}, after ${S().stats.stackCascades})`;
    return !g.pendFail || g.pendFail.size === 0 || 'a pending fall is left over: ' + [...g.pendFail.keys()].join();
  });

  await T('stack.audit.a-cube-that-was-falling-when-the-game-was-saved-still-falls-after-a-load-in-a-new-session', async () => {
    const Y = K.yard({ levels: 2 }); const [A, B2] = K.stack(Y, ['steel', 'steel']);
    g.failSupport(sup(A), 1.3); adv(0.4);
    if (!g.pendFail || !g.pendFail.has(B2.id)) return 'the cube above is not falling';
    const casc = S().stats.stackCascades || 0;
    g.pendFail = undefined;   // a new session: nothing of the old warning is left in memory
    g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) return 'save failed';
    const { loadSaved } = await import('../state.js'); const sv = loadSaved(); g.loadWorld(sv.S, sv); g.noSave = true; g.mode = 'play';
    if (!g.pendFail || !g.pendFail.has(B2.id)) return 'after the load nothing says the cube is falling: it would hang over the hole for ever';
    adv(5);
    if (K.M().items.has(B2.id) || sup(B2)) return 'the cube above still stands after the warning time';
    return (S().stats.stackCascades || 0) === casc || 'a load counted the same cascade twice';
  });

  await T('stack.audit.a-warning-of-the-last-game-never-falls-on-the-next', async () => {
    const Y = K.yard({ levels: 2 }); const [A, B2] = K.stack(Y, ['steel', 'steel']); g.failSupport(sup(A), 1.3);
    if (!g.pendFail || !g.pendFail.size) return 'no warning to carry over';
    await ctx.newWorld();
    if (g.pendFail && g.pendFail.size) return 'a new world started with ' + g.pendFail.size + ' pending falls of the old one'; void B2;
    return true;
  });

  await T('stack.audit.every-tier-keeps-the-warning-time-when-you-dig-up-above-it-near-the-bay-and-deep', async () => {
    const bad = [];
    for (const [dist, tier] of [[20, 'timber'], [20, 'steel'], [200, 'steel'], [500, 'steel'], [200, 'titan'], [500, 'concrete']]) {
      await ctx.newWorld(); ctx.fresh({ ...UP, concrete: 1 });
      const i0 = toI(dist), k0 = toK(0) + 12 - 14; K.solid(i0, k0, 52, 28, 40);
      const m = i0 + 12, lo = k0 + 10; K.dig(i0 + 3, 0, lo, 9, 4, 4); K.dig(m, 0, lo, 4, 4, 4);
      const c = K.cube(tier, m, lo, 0); let first = null, minT = null;
      for (let r = 4; r < 20 && first === null; r++) { K.dig(m, r, lo, 4, 1, 4, true); stepSim(1 / 60); if (W().creaking.size) { first = r; minT = Math.min(...[...W().creaking.values()].map((q) => q.t)); } }
      if (first === null) { bad.push(`${tier} at ${dist} m: nothing creaked above the cube`); continue; }
      const warn = g.T.warn; if (minT < warn * 0.35 - 0.04) bad.push(`${tier} at ${dist} m: the creak is ${minT.toFixed(2)} s, warn ${warn}`);
      if (W().chimney.size) bad.push(`${tier} at ${dist} m: the roof fell with no warning`);
      stepSim(16); if (!W().chimney.size) bad.push(`${tier} at ${dist} m: the roof never fell`);
      if (!K.M().items.has(c.id)) bad.push(`${tier} at ${dist} m: the cube itself came down`);
    }
    return bad.length === 0 || bad.join(' | ');
  });

  await T('stack.audit.every-one-of-the-nine-tiers-creaks-and-falls-above-its-cube-with-the-warning-kept-and-the-cube-stands', async () => {
    const bad = [], rows = {};
    for (const [n, tier] of ['timber', 'steel', 'concrete', 'rebar', 'titan', 'carbon', 'plasma', 'voidl', 'neutron'].entries()) {
      const Y = K.yard({ levels: 2, rows: 44, dx: n * 60 }); const [A, B2] = K.stack(Y, [tier, tier]); let first = null, minT = null;
      for (let r = 8; r < 28 && first === null; r++) { K.dig(Y.m, r, Y.lo, 4, 1, 4, true); stepSim(1 / 60); if ([...W().creaking.values()].some((q) => q.j >= 8)) { first = r; minT = Math.min(...[...W().creaking.values()].map((q) => q.t)); } }
      rows[tier] = first; if (first === null) { bad.push(`${tier}: nothing creaked above a stack of two`); continue; }
      if (minT < g.T.warn * 0.35 - 0.04) bad.push(`${tier}: the creak is ${minT.toFixed(2)} s`);
      stepSim(18); if (!K.M().items.has(A.id) || !K.M().items.has(B2.id)) bad.push(`${tier}: a cube of the stack came down`);
    }
    return bad.length === 0 || bad.join(' | ') + ' ' + JSON.stringify(rows);
  });

  await T('stack.audit.a-creak-sensor-and-a-seismograph-lengthen-the-warning-above-a-stack', async () => {
    const Y = K.yard({ levels: 2, up: { ...UP, creak: 3, seismo: 3 } }); K.stack(Y, ['steel', 'steel']);
    const warn = g.T.warn; if (!(warn > 3.5)) return 'the upgrades did not raise the warning: ' + warn;
    let minT = null; for (let r = 8; r < 24 && minT === null; r++) { K.dig(Y.m, r, Y.lo, 4, 1, 4, true); stepSim(1 / 60); if (W().creaking.size) minT = Math.min(...[...W().creaking.values()].map((q) => q.t)); }
    if (minT === null) return 'no creak above a stack of two';
    return minT >= warn * 0.35 - 0.04 || `the warning above a stack is ${minT.toFixed(2)} s with warn ${warn}`;
  });

  await T('stack.audit.a-cube-whose-pad-was-hammered-from-under-it-is-flagged-and-nothing-throws', async () => {
    // "remove a floor under a frame": a plain pad that holds a cube. The hammer takes it, the cube hangs: the readout says so and the load code copes
    const Y = K.yard({ levels: 3, east: true }); const pit = Y.m + 4; K.dig(pit, 0, Y.lo, 4, 10, 4);
    const pad = g.placeEntity('pad', { mk: 'steel', i0: pit, k0: Y.lo, j: 0 }, { quiet: true, rebuild: false });
    const made = S().entities.find((e) => e.type === 'pad' && e.i0 === pit); if (!made) return 'could not lay the pad';
    const c = K.cube('steel', pit, Y.lo, 1); K.cube('steel', pit, Y.lo, 5);
    if (LT.restOf(W(), sup(c)).hang !== 0) return 'a cube on a pad should be held by it: ' + JSON.stringify(LT.restOf(W(), sup(c)).hang);
    g.doDecon({ kind: 'mach', id: made.id });
    try { totalLoad(W(), sup(c)); stepSim(1); adv(0.5); } catch (e) { return 'threw: ' + e.message; }
    const info = (await import('../info.js')).infoFor(g, { kind: 'mach', id: c.id }).lines.join(' | ');
    void pad; return /Hangs over a void/.test(info) || 'a cube over a hole reads like a normal one: ' + info;
  });
}
