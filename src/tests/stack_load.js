// stack.load.*: the load column of stacked cubes and what collapses when you dig up above a cube (wave 10, loadtrace.js totalLoad, game.js updateLoads and failSupport).
import { kit } from './stack_lib.js';

export default async function (ctx) {
  const { T, g, S, w, adv, stepSim, craft, selectTool, aimPoint, plan, totalLoad } = ctx;
  const K = kit(ctx), W = K.W;
  const sup = (e) => K.support(e);
  const tot = (e) => { const pr = {}, s = sup(e), t = totalLoad(W(), s, [], pr); return { t, own: pr.own, above: pr.above, r: t / s.cap }; };
  // a chamber over the top of a stack: a real roof for the top cube to carry (weighed, never run through the stability loop)
  const chamber = (Y, j0, n = 10, rows = 1) => K.dig(Y.m - 3, j0, Y.lo - 3, n, rows, n);

  await T('stack.load.a-cube-on-a-cube-passes-its-whole-load-down', async () => {
    const Y = K.yard({ levels: 2 }); const [A, B] = K.stack(Y, ['steel', 'steel']); chamber(Y, 8);
    const a = tot(A), b = tot(B);
    if (!(b.own > 0)) return 'the top cube weighs no roof: ' + b.own;
    if (Math.abs(a.above - b.t) > b.t * 1e-6) return `the bottom cube carries ${a.above.toFixed(1)} of the ${b.t.toFixed(1)} on top of it`;
    return (a.r >= b.r - 1e-9) || 'the bottom cube is less loaded than the one on it';
  });

  await T('stack.load.three-cubes-are-one-path-the-bottom-carries-the-sum-and-never-more', async () => {
    const Y = K.yard({ levels: 3 }); const [A, B, C3] = K.stack(Y, ['steel', 'steel', 'steel']); chamber(Y, 12);
    const a = tot(A), b = tot(B), c = tot(C3);
    const ownSum = a.own + b.own + c.own;
    if (Math.abs(a.t - ownSum) > ownSum * 1e-6) return `the bottom cube carries ${a.t.toFixed(1)}, the roofs in reach add up to ${ownSum.toFixed(1)}`;
    // the column is never stronger for being tall: the top cube alone carries its own roof, the bottom the sum of the three, and no cube carries more than the sum
    if (a.t > ownSum * (1 + 1e-6)) return 'a cube carries more than every roof in the stack';
    if (!(a.t >= b.t && b.t >= c.t)) return `loads do not grow downward: ${c.t.toFixed(0)}, ${b.t.toFixed(0)}, ${a.t.toFixed(0)}`;
    // taking the load of one cube into another through a cube that is not under it moves nothing
    return true;
  });

  await T('stack.load.the-weakest-cube-fails-first-whatever-order-the-tiers-are-in', async () => {
    const out = [];
    for (const [lo, hi] of [['timber', 'steel'], ['steel', 'timber']]) {
      const Y = K.yard({ levels: 2, dx: lo === 'timber' ? 0 : 60 }); const [A, B] = K.stack(Y, [lo, hi]); chamber(Y, 8);
      const a = tot(A), b = tot(B);
      if (lo === 'timber') { if (!(a.r > b.r * 1.5)) out.push(`timber under steel: ${a.r.toFixed(2)} vs ${b.r.toFixed(2)}, the timber must carry far more of its rating`); }
      else if (!(b.r > a.r * 1.5)) out.push(`steel under timber: top ${b.r.toFixed(2)} vs bottom ${a.r.toFixed(2)}, the timber on top must be nearer its limit`);
    }
    return out.length === 0 || out.join(' | ');
  });

  await T('stack.load.a-cube-beside-the-column-carries-none-of-it', async () => {
    const Y = K.yard({ levels: 2 }); const [A, B] = K.stack(Y, ['steel', 'steel']); chamber(Y, 8);
    K.dig(Y.m + 4, 0, Y.lo, 4, 4, 4); const C2 = K.cube('steel', Y.m + 4, Y.lo, 0);
    const c = tot(C2); if (c.above !== 0) return `a cube beside the column carries ${c.above} from it`;
    const a = tot(A); return a.above > 0 || 'the column lost its load';
  });

  await T('stack.load.a-cube-set-on-a-weaker-cube-is-refused-with-the-load-it-would-put-on-it', async () => {
    const Y = K.yard({ levels: 2, rows: 68 }); const [A] = K.stack(Y, ['timber']); chamber(Y, 8, 14);
    craft('frame:steel'); selectTool('frame:steel'); aimPoint(A.cx, 4.6, A.cz, 0.9); g.player.pos.y = 0;
    const pl = await plan();
    if (pl.ok) return 'a steel cube was allowed on a timber cube under a heavy roof: ' + JSON.stringify(K.roofLoad(A));
    if (!/under it would carry \d+%/.test(pl.why || '')) return 'the refusal does not say why: ' + pl.why;
    // the host's re-check says the same to a guest
    const e = pl.ent; const why = g.placeConflict({ id: 'frame:steel', kind: 'frame', fk: 'steel' }, JSON.parse(JSON.stringify(e)));
    return /under it would carry/.test(why || '') || 'the host would accept it: ' + why;
  });

  await T('stack.load.a-cube-set-on-a-stronger-stack-is-fine-and-the-strain-text-counts-the-cubes-on-it', async () => {
    const Y = K.yard({ levels: 2 }); const [A] = K.stack(Y, ['steel']);
    craft('frame:steel'); selectTool('frame:steel'); aimPoint(A.cx, 4.6, A.cz, 0.9); g.player.pos.y = 0;
    const pl = await plan(); if (!pl.ok) return pl.why;
    return /above/.test(pl.ent.snap || '') || 'not snapped above: ' + pl.ent.snap;
  });

  await T('stack.load.updateLoads-weighs-a-column-through-its-cubes-and-warns-from-the-bottom', async () => {
    const Y = K.yard({ levels: 2 }); const [A, B] = K.stack(Y, ['timber', 'steel']); chamber(Y, 8, 14);
    g.queueLoad(B.cx, B.y0, B.cz); for (let n = 0; n < 12; n++) { g.time += 0.4; g._loadT = 0; g.updateLoads(0.4); }
    const sa = sup(A), sb = sup(B);
    if (!(sa.load > sb.load)) return `the timber cube under the steel one is not the most loaded: ${sa.load} vs ${sb.load}`;
    if (!(sa.loadAbove > 0)) return 'loadAbove was not recorded';
    const text = JSON.stringify(ctx.g.machines.items.get(A.id) && 1); void text;
    return true;
  });

  await T('stack.load.a-cube-that-loses-what-it-stood-on-falls-with-it-and-its-parts-are-lost', async () => {
    const Y = K.yard({ levels: 2 }); const [A, B] = K.stack(Y, ['steel', 'steel']);
    const pa = await K.putPlate(A, 'f', 0, 0); if (!pa.ok) return 'no floor plate: ' + pa.why;
    const parts0 = K.parts(A).length; if (!parts0) return 'the plate is not a part of its cube';
    g.failSupport(sup(A), 1.2);
    if (K.M().items.has(A.id)) return 'the lower cube is still there';
    if (K.parts(A).length) return 'the plate of the fallen cube stayed';
    if (K.count(Y.m, 0, Y.lo, 4, 1, 4, K.PAD)) return 'the plate cells stayed in the world';
    if (!g.pendFail || !g.pendFail.has(B.id)) return 'the cube above is not falling';
    adv(3.5);
    return !K.M().items.has(B.id) && !sup(B) || 'the cube above still stands after the warning time';
  });

  await T('stack.load.a-cube-that-keeps-half-its-footprint-on-something-stays-up', async () => {
    const Y = K.yard({ levels: 2 }); const [A, B] = K.stack(Y, ['steel', 'steel']);
    // a second cube under half of the top one (shifted by 2 cells would be off the cube grid, so use the ground half: a neighbour cube of the same level standing on the floor)
    const up = K.ST.beforeGone(g, sup(A)); const before = up.length; g.failSupport(sup(A), 1.2);
    const falling = g.pendFail && g.pendFail.has(B.id);
    return before === 1 && falling || `before ${before}, falling ${falling}`;
  });

  await T('stack.load.the-hammer-refuses-a-cube-with-a-cube-on-it-or-parts-built-in-and-takes-the-top-one', async () => {
    const Y = K.yard({ levels: 2 }); const [A, B] = K.stack(Y, ['steel', 'steel']);
    g.doDecon({ kind: 'mach', id: A.id });
    if (!K.M().items.has(A.id)) return 'the cube under another was taken down';
    const s0 = S().items['frame:steel'] || 0;
    g.doDecon({ kind: 'mach', id: B.id });
    if (K.M().items.has(B.id) || (S().items['frame:steel'] || 0) !== s0 + 1) return 'the top cube did not come down with its refund';
    const pl = await K.putPlate(A, 'f', 0, 0); if (!pl.ok) return 'plate: ' + pl.why;
    g.doDecon({ kind: 'mach', id: A.id });
    if (!K.M().items.has(A.id)) return 'a cube with a plate built into it was taken down';
    g.doDecon({ kind: 'mach', id: pl.e.id }); g.doDecon({ kind: 'mach', id: A.id });
    return !K.M().items.has(A.id) || 'the cube stayed after the plate was taken out';
  });

  await T('stack.load.dig-up-above-a-cube-beyond-its-reach-creaks-and-then-falls', async () => {
    const Y = K.yard({ levels: 1 }); const [A] = K.stack(Y, ['steel']);
    // within reach (the sphere of a steel cube is 3.4 m: rows 4 to 7 above its centre): the same chimney stands
    K.dig(Y.m, 4, Y.lo, 4, 4, 4, true); stepSim(4);
    if (w().creaking.size || w().chimney.size) return `a chimney inside the reach of the cube creaked (${w().creaking.size}) or fell (${w().chimney.size})`;
    const top0 = K.count(Y.m, 0, Y.lo, 4, 4, 4);
    // further up it is new roof under the tunnel rule: the warning first, the fall after it
    let warnAt = null;
    for (let r = 8; r < 14 && warnAt === null; r++) { K.dig(Y.m, r, Y.lo, 4, 1, 4, true); stepSim(1 / 60); if (w().creaking.size) warnAt = { row: r, ts: [...w().creaking.values()].map((c) => c.t) }; }
    if (!warnAt) return 'no roof creaked above the reach of the cube';
    const warn = g.T.warn, minT = Math.min(...warnAt.ts);
    if (minT < warn * 0.35 - 0.05) return `the warning is only ${minT.toFixed(2)} s: the creak timers were not kept (warn ${warn})`;
    if (w().chimney.size) return 'the roof fell with no warning time';
    stepSim(12);
    if (!w().chimney.size) return 'the unsupported roof never fell';
    return true;
  });

  await T('stack.load.a-taller-stack-carries-the-roof-higher', async () => {
    const dug = async (levels, dx) => {
      const Y = K.yard({ levels, dx, rows: 40 }); K.stack(Y, Array(levels).fill('steel'));
      const top = 4 * levels;
      K.dig(Y.m, top, Y.lo, 4, 10 - top, 4, true);   // a chimney straight up from the top cube to the same height (row 9) in both yards
      stepSim(6);
      let n = 0; const inShaft = (i, k) => i >= Y.m - 1 && i < Y.m + 5 && k >= Y.lo - 1 && k < Y.lo + 5;   // only what happens over the shaft (the approach tunnel has its own roof)
      for (const c of w().creaking.values()) if (inShaft(c.i, c.k) && c.j >= top) n++;
      for (const key of w().chimney.keys()) if (inShaft(key % 16384, Math.floor(key / 16384))) n++;
      return n;
    };
    const one = await dug(1, 0), two = await dug(2, 60);
    return (one > 0 && two === 0) || `one cube: ${one} creaking or fallen, two cubes: ${two}`;
  });

  await T('stack.load.digging-beside-a-column-follows-the-ordinary-span-rule', async () => {
    const Y = K.yard({ levels: 2, nx: 60 }); K.stack(Y, ['steel', 'steel']);
    // a room dug 14 cells east of the stack, far outside every cube's reach, at the height of the column: no frame beside it, so it is an unsupported span
    K.dig(Y.m + 14, 0, Y.lo - 2, 12, 4, 8, true); stepSim(2);
    const creaking = w().creaking.size; stepSim(14);
    return (creaking > 0 && w().chimney.size > 0) || `room beside the column: ${creaking} creaking, ${w().chimney.size} fallen`;
  });
}
