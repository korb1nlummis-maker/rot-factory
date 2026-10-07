// stack.stair.*: the switchback stair (two Stair flights, one item each) built into a cube, and walking it between two levels (wave 10, stack.js + build.js).
import { kit } from './stack_lib.js';

export default async function (ctx) {
  const { T, g, S, w, p, adv, craft, selectTool, plan } = ctx;
  const K = kit(ctx), W = K.W, B = K.B, ST = K.ST, C = 0.6;
  // two cubes, a floor plate in the lower one and a landing (the opening turned to od) as the floor of the upper one
  const twoLevels = async (od = 0, o = {}) => {
    const Y = K.yard({ levels: 2, east: true, ...o }); const [A, B2] = K.stack(Y, ['steel', 'steel']);
    const a = await K.putPlate(A, 'f', 0, 0); if (!a.ok) throw new Error('lower plate: ' + a.why);
    const b = await K.putPlate(A, 'c', 1, od); if (!b.ok) throw new Error('upper landing: ' + b.why);
    return { Y, A, B2, plateA: a.e, plateB: b.e };
  };
  const centre = (i, k) => ({ x: K.cellX(i), z: K.cellZ(k) });
  // the way a person goes up the stair of a bay turned od: the low end of flight A, its high end, the low end of flight B, its high end, then off sideways onto the plate beside it
  const route = (Y, od) => {
    const cell = (x, z) => { const [a, b] = ST.turnCell(x, z, od); return centre(Y.m + a, Y.lo + b); };
    return [cell(3, 0), cell(3, 3), cell(2, 3), cell(2, 0), cell(1, 0)];
  };
  const steer = (target, max = 3) => {
    for (let n = 0; n < max * 60; n++) {
      const dx = target.x - p().pos.x, dz = target.z - p().pos.z, d = Math.hypot(dx, dz); if (d < 0.18) return true;
      p().yaw = Math.atan2(dx, dz); K.walk(1 / 60, { fwd: 1 }, null, 1 / 60);
    }
    return false;
  };

  await T('stack.stair.two-stairs-aimed-into-a-cube-plan-a-switchback-and-one-stair-is-refused', async () => {
    const Y = K.yard({ levels: 2 }); const [A] = K.stack(Y, ['steel', 'steel']); const a = await K.putPlate(A, 'f'); if (!a.ok) return a.why;
    craft('stair', 1); selectTool('stair'); K.stand(A, { pitch: -0.5 }); let pl = await plan();
    if (pl.ok || !/two flights.*2 stairs/.test(pl.why)) return 'one stair was accepted for a switchback: ' + JSON.stringify([pl.ok, pl.why]);
    craft('stair', 1); pl = await plan(); if (!pl.ok) return pl.why;
    const e = pl.ent; return (e.mod === 'u' && e.bay === A.id && g.planCost > 0 && e.zoop.length === 2) || JSON.stringify(e);
  });

  await T('stack.stair.without-the-unlock-a-stair-in-a-cube-is-the-plain-stair', async () => {
    const Y = K.yard({ levels: 2, up: { ...ctxUp(), stackKit: 0 } }); const [A] = K.stack(Y, ['steel']);
    craft('stair', 2); selectTool('stair'); K.stand(A, { pitch: -0.5 }); const pl = await plan();
    return (!pl.ent || pl.ent.mod !== 'u') || 'the cube snap works without Stacked Building';
    function ctxUp() { return { timber: 1, steel: 1, shellPads: 1, shellRamps: 1 }; }
  });

  await T('stack.stair.placing-it-makes-two-flights-in-one-group-and-uses-two-stairs', async () => {
    const { Y, A } = await twoLevels(0);
    const r = await K.putStair(A, 0); if (!r.ok) return r.why || 'not placed';
    const [f1, f2] = [...r.made].sort((a, b) => a.j - b.j); if (f1.type !== 'stair' || f2.type !== 'stair' || f1.grp !== f2.grp || f1.bay !== A.id || f2.bay !== A.id) return JSON.stringify(r.made);
    if ((S().items.stair || 0) !== 0) return 'stairs left in the pack: ' + S().items.stair;
    if (f1.dir !== 1 || f2.dir !== 3 || f1.j !== 1 || f2.j !== 3 || f1.i0 !== Y.m + 3 || f2.i0 !== Y.m + 2 || f1.k0 !== Y.lo || f2.k0 !== Y.lo) return `flights: ${JSON.stringify([f1.dir, f1.j, f1.i0, f1.k0, f2.dir, f2.j, f2.i0, f2.k0])}`;
    return f1.mod === 'u' && f2.mod === 'u' || 'not marked as a switchback';
  });

  await T('stack.stair.you-can-walk-up-the-whole-stair-from-one-level-to-the-next-and-back-down', async () => {
    const { Y, A } = await twoLevels(0); const r = await K.putStair(A, 0); if (!r.ok) return r.why; K.tick(0.2);
    const R = route(Y, 0);
    p().pos.set(R[0].x, 0.62, R[0].z - 0.35); p().vel.set(0, 0, 0); p().pitch = 0; K.walk(0.3, {});
    const ys = [];
    for (const [n, tgt] of R.entries()) { if (!steer(tgt, 4)) return `could not reach waypoint ${n}: at ${p().pos.x.toFixed(2)}, ${p().pos.y.toFixed(2)}, ${p().pos.z.toFixed(2)}, wanted ${tgt.x.toFixed(2)}, ${tgt.z.toFixed(2)}`; ys.push(+p().pos.y.toFixed(2)); }
    K.walk(0.4, {}); const top = 5 * C;
    if (p().pos.y < top - 0.2 || p().pos.y > top + 0.25) return `ended at y ${p().pos.y.toFixed(2)}, the upper floor is ${top.toFixed(2)} (heights on the way: ${ys.join(' ')})`;
    // down again: the way you came
    const back = [...R].reverse().slice(1); for (const [n, tgt] of back.entries()) if (!steer(tgt, 4)) return `could not come down to waypoint ${n}: y ${p().pos.y.toFixed(2)} at ${p().pos.x.toFixed(2)}, ${p().pos.z.toFixed(2)}`;
    K.walk(0.5, {}); return p().pos.y < 0.9 || `back at y ${p().pos.y.toFixed(2)}`;
  });

  await T('stack.stair.two-ramps-aimed-into-a-cube-make-a-switchback-ramp-you-can-walk-up', async () => {
    const { Y, A } = await twoLevels(0); craft('wramp', 2); selectTool('wramp'); K.stand(A, { od: 0, pitch: -0.5, x: K.cellX(Y.m) }); const pl = await plan(); if (!pl.ok) return 'ramp plan: ' + pl.why;
    if (pl.ent.type !== 'wramp' || pl.ent.mod !== 'u' || pl.ent.zoop.length !== 2) return JSON.stringify(pl.ent);
    const n0 = S().entities.length; g.placeCurrent(g.curTool()); const made = S().entities.slice(n0); if (made.length !== 2 || !made.every((e) => e.type === 'wramp' && e.w === 1 && e.len === 4 && e.rise === 2 && e.bay === A.id)) return 'flights: ' + JSON.stringify(made.map((e) => [e.type, e.w, e.len, e.rise, e.bay]));
    if ((S().items.wramp || 0) !== 0) return 'ramps left in the pack: ' + S().items.wramp; K.tick(0.2);
    const R = route(Y, 0); p().pos.set(R[0].x, 0.62, R[0].z - 0.35); p().vel.set(0, 0, 0); p().pitch = 0; K.walk(0.3, {});
    for (const [n, tgt] of R.entries()) if (!steer(tgt, 4)) return `could not reach waypoint ${n}: y ${p().pos.y.toFixed(2)}`; K.walk(0.4, {});
    if (Math.abs(p().pos.y - 3.0) > 0.35) return 'ended at y ' + p().pos.y.toFixed(2);
    g.doDecon({ kind: 'mach', id: made[0].id }); if ((S().items.wramp || 0) !== 1) return 'one ramp flight did not give one ramp'; const nm = B.nameOf(made[1]); return !/Truck/.test(nm) || 'a ramp flight is named ' + nm;
  });

  await T('stack.stair.every-turn-of-the-switchback-can-be-placed-and-climbed', async () => {
    const bad = [];
    for (let od = 0; od < 4; od++) {
      const { Y, A } = await twoLevels(od, { dx: od * 70 }); const r = await K.putStair(A, od); if (!r.ok) { bad.push(`od ${od}: ${r.why}`); continue; } K.tick(0.1);
      const R = route(Y, od); p().pos.set(R[0].x, 0.62, R[0].z); p().vel.set(0, 0, 0); p().pitch = 0; K.walk(0.3, {});
      let ok = true; for (const tgt of R) if (!steer(tgt, 4)) { ok = false; bad.push(`od ${od}: stuck at ${p().pos.x.toFixed(2)}, ${p().pos.y.toFixed(2)}, ${p().pos.z.toFixed(2)} going for ${tgt.x.toFixed(2)}, ${tgt.z.toFixed(2)}`); break; }
      K.walk(0.4, {}); if (ok && Math.abs(p().pos.y - 3.0) > 0.35) bad.push(`od ${od}: ended at ${p().pos.y.toFixed(2)}`);
    }
    return bad.length === 0 || bad.join(' | ');
  });

  await T('stack.stair.the-upper-plate-must-leave-the-way-open', async () => {
    const Y = K.yard({ levels: 2 }); const [A] = K.stack(Y, ['steel', 'steel']); await K.putPlate(A, 'f'); const full = await K.putPlate(A, 'c', 0, 0); if (!full.ok) return full.why;   // a full plate over the stair
    const pl = await K.planStair(A, 0); return (!pl.ok && /in the way|solid/i.test(pl.why)) || 'a stair under a full plate: ' + JSON.stringify([pl.ok, pl.why]);
  });

  await T('stack.stair.the-foot-of-the-stair-needs-a-floor-not-an-opening', async () => {
    const Y = K.yard({ levels: 2 }); const [A] = K.stack(Y, ['steel', 'steel']); const a = await K.putPlate(A, 'f', 1, 0); if (!a.ok) return a.why;   // the landing's opening is the +x strip, where the first flight would start
    const pl = await K.planStair(A, 0); if (pl.ok || !/foot of the stair stands over an opening/.test(pl.why)) return 'a stair with its foot over the opening: ' + JSON.stringify([pl.ok, pl.why]);
    const pl2 = await K.planStair(A, 2); return pl2.ok || 'turned away from the opening it is refused too: ' + pl2.why;
  });

  await T('stack.stair.it-needs-the-cube-above-dug-out', async () => {
    const Y = K.yard({ levels: 1 }); const [A] = K.stack(Y, ['steel']); await K.putPlate(A, 'f');
    const pl = await K.planStair(A, 0); return (!pl.ok && /Dig out/.test(pl.why)) || 'no cube above, no room: ' + JSON.stringify([pl.ok, pl.why]);
  });

  await T('stack.stair.the-hammer-takes-one-flight-and-shift-x-the-pair-and-nothing-stays-reserved', async () => {
    const { Y, A } = await twoLevels(0); const r = await K.putStair(A, 0); if (!r.ok) return r.why;
    const reserved0 = [...W().reserved].length; if (!reserved0) return 'the flights reserve no cells';
    g.doDecon({ kind: 'mach', id: r.made[0].id }); if ((S().items.stair || 0) !== 1) return 'one flight should give one stair, got ' + S().items.stair;
    g.doDecon({ kind: 'mach', id: r.made[1].id, group: true }); if ((S().items.stair || 0) !== 2) return 'the second flight did not come back: ' + S().items.stair;
    for (const e of r.made) for (const [i, j, k] of [[e.i0, e.j, e.k0]]) if (W().reserved.has(K.idx(i, j, k))) return 'a reserved cell is stuck';
    return [...W().reserved].length < reserved0 || 'nothing was released';
  });

  await T('stack.stair.shift-x-on-one-flight-takes-both-and-gives-two-stairs', async () => {
    const { A } = await twoLevels(0); const r = await K.putStair(A, 0); if (!r.ok) return r.why;
    g.doDecon({ kind: 'mach', id: r.made[1].id, group: true });
    return ((S().items.stair || 0) === 2 && !K.M().items.has(r.made[0].id) && !K.M().items.has(r.made[1].id)) || 'items ' + S().items.stair;
  });

  await T('stack.stair.saves-and-loads-with-both-flights-and-still-climbs', async () => {
    const { Y, A } = await twoLevels(0); const r = await K.putStair(A, 0); if (!r.ok) return r.why;
    const raw = JSON.parse(JSON.stringify(S().entities));
    for (const e of [...S().entities]) { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } }
    g.world.supports = []; g.world.reserved.clear(); g._bld = null; S().entities = raw; for (const e of raw) g.addEntity(e); K.tick(0.2);
    const R = route(Y, 0); p().pos.set(R[0].x, 0.62, R[0].z); p().vel.set(0, 0, 0); p().pitch = 0; K.walk(0.3, {});
    for (const tgt of R) if (!steer(tgt, 4)) return `after load, stuck at ${p().pos.y.toFixed(2)}`; K.walk(0.4, {}); return Math.abs(p().pos.y - 3.0) < 0.35 || 'ended at ' + p().pos.y.toFixed(2);
  });

  await T('stack.stair.a-cube-takes-its-stairs-and-plates-down-before-it-comes-down', async () => {
    const { A, B2, plateA, plateB } = await twoLevels(0); const r = await K.putStair(A, 0); if (!r.ok) return r.why;
    g.doDecon({ kind: 'mach', id: B2.id }); if (!K.M().items.has(B2.id)) return 'the top cube came down with a plate built into it';
    g.doDecon({ kind: 'mach', id: A.id }); if (!K.M().items.has(A.id)) return 'the lower cube came down with a cube on it';
    g.doDecon({ kind: 'mach', id: plateB.id }); g.doDecon({ kind: 'mach', id: B2.id }); if (K.M().items.has(B2.id)) return 'the top cube stayed after its plate came out';
    g.doDecon({ kind: 'mach', id: A.id }); if (!K.M().items.has(A.id)) return 'the lower cube came down with stairs and a plate in it';
    g.doDecon({ kind: 'mach', id: r.made[0].id, group: true }); g.doDecon({ kind: 'mach', id: plateA.id }); g.doDecon({ kind: 'mach', id: A.id });
    return !K.M().items.has(A.id) || 'the lower cube stayed after everything built in it came out';
  });
}
