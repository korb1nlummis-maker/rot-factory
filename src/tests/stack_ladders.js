// stack.ladder.*: the hatch ladder on the rim of a plate opening, climbing it for real, and what it costs and leaves behind (wave 10, stack.js).
import { kit } from './stack_lib.js';

export default async function (ctx) {
  const { T, g, S, w, p, adv, craft, selectTool, plan } = ctx;
  const K = kit(ctx), W = K.W, ST = K.ST, C = 0.6;
  // a floor plate in the lower cube, a shaft plate (2 x 2 opening in the +x +z corner) as the floor of the one above
  const hatch = async (o = {}) => {
    const Y = K.yard({ levels: 2, east: true, ...o }); const [A, B2] = K.stack(Y, ['steel', 'steel']);
    const a = await K.putPlate(A, 'f', 0, 0); if (!a.ok) throw new Error('lower plate: ' + a.why);
    const b = await K.putPlate(A, 'c', 2, 0); if (!b.ok) throw new Error('shaft plate: ' + b.why);
    return { Y, A, B2, plateA: a.e, plateB: b.e };
  };
  // aim at the underside of the plate cell (dx 1, dz 2): the opening cell next to it is (2, 2)
  const planAt = async (Y, dx = 1, dz = 2) => { craft('ladder'); selectTool('ladder'); K.aimAt(K.cellX(Y.m + dx), 4 * C, K.cellZ(Y.lo + dz), 1.0); return plan(); };

  await T('stack.ladder.aiming-at-the-rim-of-an-opening-plans-a-ladder-that-faces-the-plate', async () => {
    const { Y, B2 } = await hatch(); const pl = await planAt(Y); if (!pl.ok) return pl.why;
    const e = pl.ent; return (e.i === Y.m + 2 && e.k === Y.lo + 2 && e.j === 1 && e.dir === 2 && e.bay === B2.id && g.planCost > 0) || JSON.stringify(e);
  });

  await T('stack.ladder.it-is-a-bench-item-that-needs-the-unlock', async () => {
    const { Y } = await hatch(); const rows = ctx.recipes(g); if (!rows.some((r) => r.id === 'ladder')) return 'no ladder on the bench';
    g.S.up.stackKit = 0; g.T = g.tune(); g.rebuildTools(); const rows2 = ctx.recipes(g); g.S.up.stackKit = 1; g.T = g.tune(); g.rebuildTools();
    return !rows2.some((r) => r.id === 'ladder') || 'the ladder is on the bench without Stacked Building';
  });

  await T('stack.ladder.placing-it-reserves-its-four-cells-and-uses-one-item', async () => {
    const { Y } = await hatch(); const pl = await planAt(Y); if (!pl.ok) return pl.why;
    const n0 = S().items.ladder; if (K.placeNow() !== 1) return 'not placed'; const e = S().entities.at(-1);
    if (e.type !== 'ladder' || (S().items.ladder || 0) !== n0 - 1) return 'bad ent or item count ' + JSON.stringify([e.type, S().items.ladder]);
    for (let r = 0; r < 4; r++) if (!W().reserved.has(K.idx(Y.m + 2, 1 + r, Y.lo + 2))) return 'cell row ' + r + ' is not reserved';
    return ST.ladders(g).has(e.id) || 'not in the ladder registry';
  });

  await T('stack.ladder.climb-it-for-real-and-step-onto-the-plate-and-come-back-down', async () => {
    const { Y } = await hatch(); const pl = await planAt(Y); if (!pl.ok) return pl.why; K.placeNow(); K.tick(0.2);
    const cx = K.cellX(Y.m + 2), cz = K.cellZ(Y.lo + 2);
    p().pos.set(cx, 0.62, cz); p().vel.set(0, 0, 0); p().yaw = -Math.PI / 2; p().pitch = 0; K.walk(0.4, {});
    if (p().climbing || p().pos.y > 0.7) return 'latched or moved with no key pressed: y ' + p().pos.y.toFixed(2);
    // W takes hold and climbs
    K.walk(0.5, { fwd: 1 }); if (p().pos.y < 1.2) return 'W did not climb: y ' + p().pos.y.toFixed(2);
    // all the way up: it holds you at the top and then W steps you onto the plate, which is 3.0 m up
    K.walk(3.0, { fwd: 1 }, () => p().pos.x < cx - 0.55 && p().pos.y > 2.9);
    if (p().pos.y < 2.9 || p().pos.y > 3.3) return `top of the ladder: y ${p().pos.y.toFixed(2)}`;
    K.walk(0.6, {}); if (p().pos.y < 2.8) return 'fell back off the top with nothing pressed: ' + p().pos.y.toFixed(2);
    const onPlate = p().pos.x < cx - 0.4; K.walk(0.6, {}); if (!onPlate || p().pos.y < 2.8) return `did not get onto the plate: x ${p().pos.x.toFixed(2)} (ladder at ${cx.toFixed(2)}), y ${p().pos.y.toFixed(2)}`;
    // down: walk back to the hole and press S
    p().yaw = Math.PI / 2; K.walk(1.0, { fwd: 1 }, () => p().pos.x > cx - 0.1);
    for (let n = 0; n < 300 && p().pos.y > 0.8; n++) { p().yaw = -Math.PI / 2; K.walk(1 / 60, { back: 1 }, null, 1 / 60); }
    return p().pos.y < 0.9 || `could not climb down: y ${p().pos.y.toFixed(2)} at ${p().pos.x.toFixed(2)}, ${p().pos.z.toFixed(2)}`;
  });

  await T('stack.ladder.refused-where-it-has-no-rim-no-floor-or-no-room', async () => {
    const { Y, A, plateB } = await hatch(); const bad = [];
    // aiming at a plate cell with no opening beside it
    craft('ladder'); selectTool('ladder'); K.aimAt(K.cellX(Y.m), 4 * C, K.cellZ(Y.lo), 1.0); let pl = await plan(); if (pl.ok || !/opening/.test(pl.why)) bad.push('no opening: ' + JSON.stringify([pl.ok, pl.why]));
    // aiming at the lower plate (no opening in it)
    K.aimAt(K.cellX(Y.m + 1), 0, K.cellZ(Y.lo + 1), 1.0); pl = await plan(); if (pl.ok) bad.push('hung on the lower plate');
    // the foot has nothing under it: take the lower plate out
    g.doDecon({ kind: 'mach', id: ST.plateOf(g, A.id).id }); pl = await planAt(Y); if (pl.ok || !/stand on/.test(pl.why)) bad.push('no floor under the foot: ' + JSON.stringify([pl.ok, pl.why]));
    return bad.length === 0 || bad.join(' | ');
  });

  await T('stack.ladder.a-belt-or-machine-in-the-way-refuses-it', async () => {
    const { Y } = await hatch(); const key = K.idx(Y.m + 2, 2, Y.lo + 2); W().reserved.add(key);
    const pl = await planAt(Y); W().reserved.delete(key); return (!pl.ok && /in the way/.test(pl.why)) || JSON.stringify([pl.ok, pl.why]);
  });

  await T('stack.ladder.the-hammer-gives-it-back-and-frees-the-cells', async () => {
    const { Y } = await hatch(); const pl = await planAt(Y); if (!pl.ok) return pl.why; K.placeNow(); const e = S().entities.at(-1); const n0 = S().items.ladder || 0;
    g.doDecon({ kind: 'mach', id: e.id }); if ((S().items.ladder || 0) !== n0 + 1) return 'no item back'; if (ST.ladders(g).has(e.id)) return 'still in the registry';
    for (let r = 0; r < 4; r++) if (W().reserved.has(K.idx(Y.m + 2, 1 + r, Y.lo + 2))) return 'a cell stayed reserved';
    return K.M().items.has(e.id) ? 'still in the world' : true;
  });

  await T('stack.ladder.a-cube-with-a-ladder-on-it-stays-up-and-the-ladder-goes-with-a-fallen-cube', async () => {
    const { Y, A, B2 } = await hatch(); const pl = await planAt(Y); if (!pl.ok) return pl.why; K.placeNow(); const e = S().entities.at(-1);
    g.doDecon({ kind: 'mach', id: B2.id }); if (!K.M().items.has(B2.id)) return 'the cube with the ladder came down';
    g.failSupport(K.support(B2), 1.2); if (K.M().items.has(e.id)) return 'the ladder stayed after its cube fell';
    for (let r = 0; r < 4; r++) if (W().reserved.has(K.idx(Y.m + 2, 1 + r, Y.lo + 2))) return 'a cell stayed reserved';
    return true;
  });

  await T('stack.ladder.saves-and-loads-and-still-holds-you', async () => {
    const { Y } = await hatch(); const pl = await planAt(Y); if (!pl.ok) return pl.why; K.placeNow();
    const raw = JSON.parse(JSON.stringify(S().entities));
    for (const e of [...S().entities]) { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } }
    g.world.supports = []; g.world.reserved.clear(); g._bld = null; g._lad = null; S().entities = raw; for (const e of raw) g.addEntity(e); K.tick(0.2);
    const cx = K.cellX(Y.m + 2), cz = K.cellZ(Y.lo + 2); p().pos.set(cx, 0.62, cz); p().vel.set(0, 0, 0); p().yaw = -Math.PI / 2; K.walk(2.2, { fwd: 1 });
    return p().pos.y > 2.8 || 'after a load the ladder does not climb: ' + p().pos.y.toFixed(2);
  });
}
