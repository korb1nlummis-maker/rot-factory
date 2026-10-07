// In-world keys, part 4: belts. Hold B lays a line, the Line Planner (. , R B), lifts (. , R), ramps (R), set a higher mark over a belt (B).
import { makeBeltKit, UP_ALL } from './belts_lib.js';
import { makeIO, clearBay } from './truth_world_lib.js';
import { PLAN_MAX } from '../beltdata.js';
export default async function (ctx) {
  const { g, S, p, adv, craft, cellX, cellZ, plan, tiles, recipes } = ctx;
  const B = makeBeltKit(ctx), K = B.K, T = B.T;
  const io = makeIO(ctx);
  const nBelts = () => tiles().filter((t) => t.type === 'belt').length;

  await T('truth.world.keys-hold-b-lays-belts-one-by-one-as-you-walk', async () => {
    B.setup(UP_ALL); clearBay(ctx, -30, 14, -10, 11); craft('belt', 12); K.equip('belt'); const i = ctx.toI(-20), k = ctx.toK(6); const bad = [];
    K.aimDir(cellX(i), 0, cellZ(k), 0, 2.0); await plan(); const n0 = nBelts(); io.down('KeyB');
    for (let s = 0; s < 8; s++) { K.aimDir(cellX(i + s), 0, cellZ(k), 0, 2.0); adv(0.05); }
    io.up('KeyB'); adv(0.05); const laid = nBelts() - n0; if (laid < 6) bad.push(`holding B laid ${laid} belts over 8 cells`);
    const n1 = nBelts(); io.tap('KeyB'); adv(0.05); const single = nBelts() - n1; if (single > 1) bad.push('one tap laid ' + single);
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-period-starts-the-line-planner-b-sets-the-start-b-lays-the-line-comma-and-r-change-the-shape', async () => {
    B.setup(UP_ALL); clearBay(ctx, -30, 14, -10, 11); S().money = 1e9; K.equip('belt'); if (S().items.belt) { delete S().items.belt; } craft('belt', 1); K.equip('belt'); const bad = []; const i = ctx.toI(-20), k = ctx.toK(6);
    const priceEach = recipes(g).find((r) => r.id === 'belt').price;
    K.aimDir(cellX(i), 0, cellZ(k), 0, 2.0); adv(0.05); io.clearHint(); io.tap('Period'); if (!g.bplan || !g.bplan.on) return 'the period key did not turn the planner on'; if (!/Line planner on/.test(io.hint())) bad.push('hint: ' + io.hint());
    await plan(); io.tap('KeyB'); if (!g.bplan.start) return 'B did not set the start (' + io.hint() + ')'; if (!/Start set/.test(io.hint())) bad.push('start hint: ' + io.hint());
    K.aimDir(cellX(i + 9), 0, cellZ(k), 0, 2.0); const pl = await plan(); if (!pl || !pl.ok || !pl.planner) return 'the planner has no route: ' + (pl && pl.why);
    const v0 = g.bplan.variant; io.tap('Comma'); const v1 = g.bplan.variant; io.tap('KeyR'); const v2 = g.bplan.variant; if (v1 === v0 || v2 === v1) bad.push(`, and R did not change the shape (${v0} ${v1} ${v2})`);
    io.wheel(100); const v3 = g.bplan.variant; if (v3 === v2) bad.push('the wheel did not change the shape with the start set');
    g.bplan.variant = 0; await plan(); const m0 = S().money, b0 = nBelts(); const have = S().items.belt || 0; io.tap('KeyB'); const laid = nBelts() - b0;
    if (laid < 10) bad.push(`the second B laid ${laid} belts`); if (g.bplan.start) bad.push('the start was not cleared after the line was laid');
    const paid = m0 - S().money, shortfall = Math.max(0, laid - have); if (Math.abs(paid - shortfall * priceEach) > 1e-6) bad.push(`bought ${shortfall} belts at the bench price ${priceEach}: paid ${paid}`);
    io.clearHint(); io.tap('Period'); if (g.bplan.on) bad.push('the period key did not turn the planner off'); if (!/Line planner off/.test(io.hint())) bad.push('off hint: ' + io.hint());
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-the-line-planner-lays-up-to-64-tiles-and-no-more', async () => {
    B.setup(UP_ALL); clearBay(ctx, -30, 14, -10, 11); S().money = 1e12; const i = ctx.toI(-28), k = ctx.toK(-5); craft('belt', 1); K.equip('belt'); const bad = [];
    if (PLAN_MAX !== 64) bad.push('PLAN_MAX is ' + PLAN_MAX); io.tap('Period'); K.aimDir(cellX(i), 0, cellZ(k), 0, 2.0); await plan(); io.tap('KeyB'); if (!g.bplan.start) return 'no start';
    K.aimDir(cellX(i + 40), 0, cellZ(k + 40), 0, 2.0); const pl = await plan(); const len = pl && pl.route ? pl.route.tiles.length : 0; if (len > 64) bad.push('the planner offered ' + len + ' tiles'); else if (pl && pl.ok) { const b0 = nBelts(); io.tap('KeyB'); if (nBelts() - b0 > 64) bad.push('laid more than 64'); }
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-lift-period-comma-set-the-height-and-r-flips-it-down', async () => {
    B.setup(UP_ALL); clearBay(ctx, -30, 14, -10, 11); craft('lift', 3); K.equip('lift'); const bad = []; g.liftH = undefined; g.liftDown = false;
    io.tap('Period'); const a = g.liftH; io.tap('Period'); const b = g.liftH; io.tap('Comma'); const c = g.liftH; if (!(b === a + 1 && c === b - 1)) bad.push(`. and , gave ${a} ${b} ${c}`);
    for (let q = 0; q < 40; q++) io.tap('Period'); if (g.liftH !== 24) bad.push('the lift stops at ' + g.liftH + ', not 24 cells'); for (let q = 0; q < 40; q++) io.tap('Comma'); if (g.liftH !== 2) bad.push('the lift goes down to ' + g.liftH + ' cells, not 2');
    io.tap('KeyR'); if (!g.liftDown) bad.push('R did not flip the lift down'); io.tap('KeyR'); if (g.liftDown) bad.push('R again did not flip it back up');
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-r-flips-a-ramp-up-and-down-while-you-hold-one', async () => {
    B.setup(UP_ALL); clearBay(ctx, -30, 14, -10, 11); craft('ramp', 2); K.equip('ramp'); const bad = []; g.rampMode = 0; const i = ctx.toI(-20), k = ctx.toK(6);
    K.aimDir(cellX(i), 0, cellZ(k), 0, 2.0); let pl = await plan(); const up = pl && pl.ent && pl.ent.rise; io.tap('KeyR'); pl = await plan(); const down = pl && pl.ent && pl.ent.rise;
    if (!(up === 1 && down === -1)) bad.push(`R: ramp rise ${up} then ${down}`); if (!/R<\/kbd> flips up\/down|R flips up\/down/.test(io.hint())) bad.push('hint: ' + io.hint());
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-b-with-a-higher-mark-over-a-belt-upgrades-it-and-gives-the-old-belt-back', async () => {
    B.setup(UP_ALL); clearBay(ctx, -30, 14, -10, 11); const bad = []; const i = ctx.toI(-20), k = ctx.toK(6); B.lay(0, 3, i, k, 0); craft('belt:2', 2); K.equip('belt:2'); const before = S().items.belt || 0;
    K.aimDir(cellX(i + 1), 0, cellZ(k), 0, 2.0); const pl = await plan(); if (!pl || !pl.ok || !pl.ent || pl.ent.type !== 'tierbelt') return 'no upgrade plan: ' + JSON.stringify([pl && pl.ok, pl && pl.why, pl && pl.ent && pl.ent.type]);
    if (!/upgrade this belt/.test(io.hint())) bad.push('hint: ' + io.hint()); io.tap('KeyB'); adv(0.05); const t = tiles().find((x) => x.i === i + 1 && x.k === k); if (!t || (t.tier | 0) !== 2) bad.push('the belt did not take the mark: ' + (t && t.tier)); if ((S().items.belt || 0) !== before + 1) bad.push('the old belt did not come back');
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-b-sets-down-a-lift-facing-the-way-you-look-as-tall-as-chosen-and-an-underground-pair-takes-two-presses', async () => {
    B.setup(UP_ALL); clearBay(ctx, -30, 14, -10, 11); const bad = []; const i = ctx.toI(-20), k = ctx.toK(6); S().money = 1e12;
    craft('lift', 6); K.equip('lift'); g.liftH = undefined; io.tap('Period'); io.tap('Period'); const h = g.liftH; K.aimDir(cellX(i), 0, cellZ(k), 0, 2.0); await plan(); const n0 = nBelts(); io.tap('KeyB'); adv(0.1);
    const lt = tiles().find((t) => t.lift); if (!lt) bad.push('B did not set a lift down: ' + io.hint()); else { if (lt.lift.h !== h) bad.push(`the lift is ${lt.lift.h} cells, I chose ${h}`); if (lt.dir !== 0) bad.push('the lift does not face the way I looked (east): dir ' + lt.dir); if (lt.i !== i || lt.k !== k) bad.push('the lift is not where I aimed'); }
    void n0; for (const t of tiles()) if (t.lift) g.doDecon({ kind: 'tile', id: t.id });
    craft('ug', 4); K.equip('ug'); K.aimDir(cellX(i), 0, cellZ(k + 4), 0, 2.0); await plan(); io.tap('KeyB'); adv(0.1); const entry = tiles().find((t) => t.ug && t.ug.role === 'in'); if (!entry) return bad.concat('the first B did not set the underground entry: ' + io.hint()).join('; ');
    K.aimDir(cellX(i + 3), 0, cellZ(k + 4), 0, 2.0); await plan(); io.tap('KeyB'); adv(0.1); const exit = tiles().find((t) => t.ug && t.ug.role === 'out'); if (!exit) bad.push('the second B did not set the exit: ' + io.hint()); else if (entry.ug.pair !== exit.id && exit.ug.pair !== entry.id) bad.push('the entry and the exit are not paired');
    return bad.length === 0 || bad.join('; ');
  });
}
