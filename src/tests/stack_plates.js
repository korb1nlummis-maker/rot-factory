// stack.plate.*: floor and ceiling plates that snap into frame cubes (wave 10, stack.js + build.js). A plate is the ordinary Floor Pad aimed into a cube.
import { kit } from './stack_lib.js';
import { makeIO } from './truth_world_lib.js';

export default async function (ctx) {
  const { T, g, S, w, p, adv, craft, selectTool, plan, totalLoad } = ctx;
  const K = kit(ctx), W = K.W, B = K.B, PAD = K.PAD, io = makeIO(ctx);
  const cells = (Y, j, n = 4) => K.count(Y.m, j, Y.lo, n, 1, n, PAD);
  const holes = (Y, j) => { const out = []; for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) if (!W().get(Y.m + dx, j, Y.lo + dz)) out.push(dx + ',' + dz); return out.join(' '); };
  const stable = () => { const e = S().entities.at(-1); return e; };

  await T('stack.plate.aiming-down-in-a-cube-snaps-a-floor-plate-to-its-bottom-row', async () => {
    const Y = K.yard(); const [A] = K.stack(Y, ['steel']);
    const pl = await K.planPad(A, 'f'); if (!pl.ok) return pl.why;
    const e = pl.ent; if (e.ro !== 'f' || e.j !== A.gj || e.i0 !== A.gm || e.k0 !== A.glo || e.bay !== A.id) return 'wrong spot: ' + JSON.stringify([e.ro, e.j, e.i0, e.k0, e.bay]);
    const pads = S().items['pad:steel']; if (K.placeNow() !== 1) return 'not placed';
    if (cells(Y, 0) !== 16) return 'the floor plate has ' + cells(Y, 0) + ' cells'; if (K.count(Y.m, 1, Y.lo, 4, 3, 4)) return 'something above the plate';
    if ((S().items['pad:steel'] || 0) !== pads - 1) return 'it did not use exactly one pad';
    const ent = S().entities.at(-1); return (ent.type === 'pad' && ent.bay === A.id && ent.ro === 'f' && ent.op === 0) || JSON.stringify(ent);
  });

  await T('stack.plate.aiming-up-in-a-cube-snaps-a-ceiling-plate-to-its-top-row', async () => {
    const Y = K.yard(); const [A] = K.stack(Y, ['steel']);
    const pl = await K.planPad(A, 'c'); if (!pl.ok) return pl.why;
    if (pl.ent.ro !== 'c' || pl.ent.j !== A.gj + 3) return 'wrong row ' + pl.ent.j; K.placeNow();
    if (cells(Y, 3) !== 16) return 'the ceiling plate has ' + cells(Y, 3) + ' cells'; return cells(Y, 0) === 0 || 'a plate on the floor too';
  });

  await T('stack.plate.a-cube-holds-one-plate-and-the-refusal-says-why', async () => {
    const Y = K.yard(); const [A] = K.stack(Y, ['steel']);
    const a = await K.putPlate(A, 'f'); if (!a.ok) return a.why;
    const pl = await K.planPad(A, 'c'); if (pl.ok) return 'a ceiling plate went in over a floor plate: two plates leave 2 clear rows';
    return /already has a plate/.test(pl.why) || pl.why;
  });

  await T('stack.plate.openings-leave-2x4-or-2x2-cells-open-and-turn-a-quarter-at-a-time', async () => {
    const seen = { 1: new Set(), 2: new Set() }; const bad = [];
    for (const op of [1, 2]) for (let od = 0; od < 4; od++) {
      const Y = K.yard({ dx: (op * 4 + od) * 9 }); const [A] = K.stack(Y, ['steel']);
      const r = await K.putPlate(A, 'f', op, od); if (!r.ok) { bad.push(`op ${op} od ${od}: ${r.why}`); continue; }
      const n = cells(Y, 0), want = op === 1 ? 8 : 12; if (n !== want) bad.push(`op ${op} od ${od}: ${n} cells`);
      const h = holes(Y, 0); seen[op].add(h);
      for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) if (B.holeAt(op, od, dx, dz) !== !W().get(Y.m + dx, 0, Y.lo + dz)) bad.push(`op ${op} od ${od}: cell ${dx},${dz} disagrees with holeAt`);
    }
    if (seen[1].size !== 4 || seen[2].size !== 4) bad.push(`turns: ${seen[1].size} landings, ${seen[2].size} shaft plates (4 each expected)`);
    // od 0 puts the landing's opening on the +x side, od 1 on the +z side
    const Y = K.yard({ dx: 90 }); const [A] = K.stack(Y, ['steel']); const r = await K.putPlate(A, 'f', 1, 1); if (!r.ok) bad.push(r.why);
    else if (holes(Y, 0) !== '0,2 1,2 2,2 3,2 0,3 1,3 2,3 3,3') bad.push('landing turned to +z has holes ' + holes(Y, 0));
    return bad.length === 0 || bad.join(' | ');
  });

  await T('stack.plate.minus-equals-and-r-pick-the-opening-and-turn-it', async () => {
    const Y = K.yard(); const [A] = K.stack(Y, ['steel']); craft('pad:steel'); selectTool('pad:steel'); g._sOpen = 0; K.stand(A, { od: 0, pitch: -1 }); await plan();
    io.tap('Equal'); await plan(); if (g.plan.ent.op !== 1) return `= gave opening ${g.plan.ent.op}`;
    io.tap('Equal'); await plan(); if (g.plan.ent.op !== 2) return `second = gave opening ${g.plan.ent.op}`;
    io.tap('Equal'); await plan(); if (g.plan.ent.op !== 0) return 'the openings do not wrap round';
    io.tap('Minus'); await plan(); if (g.plan.ent.op !== 2) return `- gave opening ${g.plan.ent.op}`;
    const od0 = g.plan.ent.od; io.tap('KeyR'); await plan(); return g.plan.ent.od === ((od0 + 1) & 3) || `R did not turn it: ${od0} -> ${g.plan.ent.od}`;
  });

  await T('stack.plate.ctrl-keeps-the-plain-pad-and-stair-and-wall-in-a-cube', async () => {
    const Y = K.yard({ levels: 2 }); const [A] = K.stack(Y, ['steel', 'steel']); const bad = [];
    craft('pad:steel'); selectTool('pad:steel'); K.stand(A, { pitch: -1 }); g.keys.ControlLeft = true; let pl = await plan(); if (pl.ent && pl.ent.bay !== undefined) bad.push('a pad snapped into the cube with Ctrl held');
    craft('stair', 2); selectTool('stair'); K.stand(A, { pitch: -0.5 }); pl = await plan(); if (pl.ent && pl.ent.mod === 'u') bad.push('a switchback with Ctrl held');
    craft('wall'); selectTool('wall'); K.stand(A, { od: 2, pitch: 0 }); pl = await plan(); if (pl.ent && pl.ent.bay !== undefined) bad.push('a door frame with Ctrl held');
    g.keys.ControlLeft = false; selectTool('pad:steel'); K.stand(A, { pitch: -1 }); pl = await plan(); if (!pl.ent || pl.ent.bay !== A.id) bad.push('without Ctrl the pad does not snap');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('stack.plate.a-floor-plate-laid-under-your-feet-lifts-you-onto-it', async () => {
    const Y = K.yard(); const [A] = K.stack(Y, ['steel']); K.tick(0.2);
    const pl = await K.planPad(A, 'f'); if (!pl.ok) return pl.why;   // the player stands on the cube floor, inside the section
    if (K.placeNow() !== 1) return 'not placed';
    K.tick(0.3); const y = p().pos.y; const top = 0.6;
    return (y >= top - 0.01 && y < top + 0.2) || `you are at ${y.toFixed(2)} m, the plate top is ${top} m`;
  });

  await T('stack.plate.walk-up-onto-a-floor-plate-and-across-it-and-down-again', async () => {
    const Y = K.yard({ east: true }); const [A] = K.stack(Y, ['steel']); const r = await K.putPlate(A, 'f'); if (!r.ok) return r.why; K.tick(0.2);
    // from the approach tunnel (its floor is the hall floor) east into the cube: one 0.6 m step up, across, and down the far side
    p().pos.set(K.cellX(Y.m - 3), 0, A.cz); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0;
    let q = K.walk(3, { fwd: 1 }, () => p().pos.x > A.cx); if (q >= 180) return `never reached the middle of the cube: x ${p().pos.x.toFixed(2)}`;
    if (p().pos.y < 0.45 || p().pos.y > 0.75) return `not standing on the plate in the middle: y ${p().pos.y.toFixed(2)}`;
    q = K.walk(3, { fwd: 1 }, () => p().pos.x > A.cx + 2.0); if (q >= 180) return `stuck on the plate at x ${p().pos.x.toFixed(2)}`;
    K.walk(0.6, { fwd: 1 }); if (p().pos.y > 0.3) return 'did not step down off the far edge: y ' + p().pos.y.toFixed(2);
    p().yaw = -Math.PI / 2; q = K.walk(3, { fwd: 1 }, () => p().pos.x < A.cx); if (q >= 180) return 'could not climb back on from the far side: x ' + p().pos.x.toFixed(2);
    if (p().pos.y < 0.45) return 'not on the plate on the way back: ' + p().pos.y.toFixed(2);
    K.walk(3, { fwd: 1 }, () => p().pos.x < K.cellX(Y.m - 2)); return (p().pos.x < K.cellX(Y.m - 1) && p().pos.y < 0.3) || `back down: x ${p().pos.x.toFixed(2)} y ${p().pos.y.toFixed(2)}`;
  });

  await T('stack.plate.three-clear-cells-over-a-plate-fit-the-player-standing-upright-and-the-beams-do-not-squeeze', async () => {
    const Y = K.yard(); const [A] = K.stack(Y, ['steel']); const r = await K.putPlate(A, 'f'); if (!r.ok) return r.why; K.tick(0.2);
    const bad = [];
    for (const [dx, dz] of [[0, 0], [1, 1], [2, 0], [3, 3], [1, 3]]) {
      p().pos.set(K.cellX(Y.m + dx), 0.64, K.cellZ(Y.lo + dz)); p().vel.set(0, 0, 0); p().crouch = false; K.walk(0.6, {});
      const pen = p().penetration(p().pos.x, p().pos.y, p().pos.z);
      if (pen > 0.02) bad.push(`penetration ${pen.toFixed(3)} at ${dx},${dz}`);
      if (p().crouch || p().pos.y < 0.45 || p().pos.y > 0.7) bad.push(`not standing on the plate at ${dx},${dz}: y ${p().pos.y.toFixed(2)}`);
    }
    // clear height: three cells of air between the plate top and the roof
    for (let j = 1; j <= 3; j++) if (K.count(Y.m, j, Y.lo, 4, 1, 4)) bad.push('plush in the clear rows');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('stack.plate.a-floor-plate-over-a-void-is-not-a-roof-and-adds-no-load-to-the-cube-below', async () => {
    const Y = K.yard({ levels: 2, rows: 40 }); const [A, B2] = K.stack(Y, ['steel', 'steel']); K.dig(Y.m - 3, 8, Y.lo - 3, 10, 1, 10);
    const t0 = totalLoad(W(), K.support(A)), tb0 = totalLoad(W(), K.support(B2));
    const r = await K.putPlate(B2, 'f'); if (!r.ok) return r.why;
    const t1 = totalLoad(W(), K.support(A)), tb1 = totalLoad(W(), K.support(B2));
    return (Math.abs(t1 - t0) < t0 * 1e-6 && Math.abs(tb1 - tb0) < tb0 * 1e-6) || `loads moved: bottom ${t0.toFixed(1)} -> ${t1.toFixed(1)}, top ${tb0.toFixed(1)} -> ${tb1.toFixed(1)}`;
  });

  await T('stack.plate.aiming-up-out-of-a-cube-that-has-its-plate-picks-the-floor-of-the-cube-on-it', async () => {
    const Y = K.yard({ levels: 2 }); const [A, B2] = K.stack(Y, ['steel', 'steel']);
    const a = await K.putPlate(A, 'f'); if (!a.ok) return a.why;
    const pl = await K.planPad(A, 'c'); if (!pl.ok) return pl.why;
    if (pl.ent.bay !== B2.id || pl.ent.ro !== 'f' || pl.ent.j !== B2.gj) return `wanted the floor of the top cube, got ${JSON.stringify([pl.ent.bay, pl.ent.ro, pl.ent.j])}`;
    K.placeNow(); return cells(Y, 4) === 16 || 'the plate is not at row 4';
  });

  await T('stack.plate.a-ceiling-plate-keeps-fallen-roof-out-of-the-cube', async () => {
    const Y = K.yard({ rows: 36 }); const [A] = K.stack(Y, ['steel']); const r = await K.putPlate(A, 'c'); if (!r.ok) return r.why;
    // a chimney over it beyond the reach: the roof comes down onto the plate, the cube stays empty
    K.dig(Y.m, 4, Y.lo, 4, 12, 4, true); ctx.stepSim(14);
    const inside = K.count(Y.m, 0, Y.lo, 4, 3, 4); return inside === 0 || `${inside} plush fell through into the cube`;
  });

  await T('stack.plate.plush-left-in-the-cube-is-refused-dig-first', async () => {
    const Y = K.yard(); const [A] = K.stack(Y, ['steel']); W().setCell(Y.m + 1, 2, Y.lo + 1, 2, 0);
    const pl = await K.planPad(A, 'f'); return (!pl.ok && /Dig/.test(pl.why)) || 'accepted with plush in the cube: ' + JSON.stringify([pl.ok, pl.why]);
  });

  await T('stack.plate.the-hammer-takes-it-back-with-its-item-and-leaves-no-cell-or-claim-behind', async () => {
    const Y = K.yard(); const [A] = K.stack(Y, ['steel']);
    const r = await K.putPlate(A, 'f', 2, 1); if (!r.ok) return r.why; const have = S().items['pad:steel'] || 0;
    g.doDecon({ kind: 'mach', id: r.e.id });
    if ((S().items['pad:steel'] || 0) !== have + 1) return `item count ${S().items['pad:steel'] || 0} (expected ${have + 1})`;
    if (cells(Y, 0)) return 'cells left behind'; if (B.ownerAt(g, Y.m, 0, Y.lo)) return 'a claim is left in the registry';
    if (K.parts(A).length) return 'the plate is still a part of the cube';
    // and a new plate goes in where the old one was
    const again = await K.putPlate(A, 'f', 0, 0); return again.ok || again.why;
  });

  await T('stack.plate.saves-and-loads-with-its-opening-and-its-cube', async () => {
    const Y = K.yard(); const [A] = K.stack(Y, ['steel']); const r = await K.putPlate(A, 'f', 1, 2); if (!r.ok) return r.why;
    const raw = JSON.parse(JSON.stringify(S().entities)), before = holes(Y, 0), n0 = cells(Y, 0);
    for (const e of [...S().entities]) { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } }
    g.world.supports = []; g._bld = null; S().entities = raw; for (const e of raw) g.addEntity(e);
    const pad = S().entities.find((e) => e.type === 'pad'); if (!pad || pad.op !== 1 || pad.od !== 2 || pad.bay !== A.id) return 'fields lost: ' + JSON.stringify(pad);
    if (holes(Y, 0) !== before || cells(Y, 0) !== n0) return 'the opening changed on load';
    return !!B.ownerAt(g, Y.m + 3, 0, Y.lo) || 'the registry did not come back';
  });

  await T('stack.plate.info-names-the-plate-its-cube-and-its-opening', async () => {
    const Y = K.yard(); const [A] = K.stack(Y, ['steel']); const r = await K.putPlate(A, 'f', 2, 0); if (!r.ok) return r.why;
    const info = B.infoBuilt(g, r.e); const text = info.title + ' ' + info.lines.join(' ');
    const cube = (await import('../info.js')).infoFor(g, { kind: 'mach', id: A.id }); const ct = cube.lines.join(' ');
    return (/PLATE/.test(info.title) && /Floor plate of a cube: shaft plate/.test(text) && /Built in: shaft plate \(floor\)/.test(ct)) || text + ' || ' + ct;
  });
}
