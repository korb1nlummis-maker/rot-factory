// transit.audit.*: the adversarial pass over wave 5 (cells). Every test was written to fail against the first build and pins one defect:
//  - the leaf of a door is bulkhead cells with no wall section behind them, so F (or a guest's `bulk` command) took them for free, and every open and close of the door refilled them
//  - a belt, a machine or a belt lift could be set inside an open doorway, a lift shaft or on a jump pad (logistics.canPlace only looked at belts), and taking it down again
//    freed the reserved cell of the door, shaft or pad under it
import { kit } from './transit_lib.js';
import * as TR from '../transit.js';
import { infoFor } from '../info.js';
import { BULK } from '../plushdata.js';
import { liftProblem } from '../beltparts.js';

export default async function (ctx) {
  const { T, g, S, w, p, adv, toI, toK } = ctx;
  const X = kit(ctx), K = X.K;
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { X.clean(); } });
  const I0 = () => toI(-20), K0 = () => toK(4);
  const bulkItems = () => S().items.bulk || 0;
  const liftTo = (L) => { p().pos.y = L.cy; p().vel.set(0, 0, 0); };

  await guard('transit.audit.door-leaf-cannot-be-picked-apart-by-hand', async () => {
    X.setup(); const bad = [], D = X.door(I0(), K0(), { auto: false });
    const cell = [D.i0 + 1, 1, D.k0], at = () => w().get(cell[0], cell[1], cell[2]);
    // F on a closed door
    let b0 = bulkItems(), r = g.collect({ type: 'cell', i: cell[0], j: cell[1], k: cell[2], sp: BULK, vr: 0 });
    if (r !== false || at() !== BULK || bulkItems() !== b0) bad.push(`F took a panel of a closed door: returned ${r}, cell ${at()}, bulk items +${bulkItems() - b0}`);
    // the readout does not offer it
    const info = g.targetInfo({ type: 'cell', i: cell[0], j: cell[1], k: cell[2], sp: BULK, vr: 0 });
    if (info && /F to take down/.test(info.value)) bad.push('the target text still says F takes it down: ' + info.value);
    // a guest's `bulk` command goes through the host's rule
    b0 = bulkItems(); g.netCmd('bulk', { i: cell[0], j: cell[1], k: cell[2] });
    if (at() !== BULK || bulkItems() !== b0) bad.push('a guest bulk command took a door panel');
    // half open: the rows still shut are the leaf
    D.tgt = 1; D.p = 0.5; TR.setRows(g, D, TR.freedOf(0.5)); const up = [D.i0 + 1, 3, D.k0]; b0 = bulkItems();
    r = g.collect({ type: 'cell', i: up[0], j: up[1], k: up[2], sp: BULK, vr: 0 });
    if (r !== false || w().get(up[0], up[1], up[2]) !== BULK || bulkItems() !== b0) bad.push('F took a panel of a half open door');
    // a loose bulkhead cell next to the door is still free to take (the rule is about the door only)
    const lone = [D.i0 + 8, 1, D.k0]; w().setCell(lone[0], lone[1], lone[2], BULK, 0); r = g.collect({ type: 'cell', i: lone[0], j: lone[1], k: lone[2], sp: BULK, vr: 0 });
    if (!r || w().get(lone[0], lone[1], lone[2]) !== 0) bad.push('a loose bulkhead cell can no longer be taken: ' + r);
    // the door is whole after a full cycle: 16 cells shut, nothing handed out
    D.tgt = 0; D.p = 0; TR.setRows(g, D, 0); if (!X.closedCells(D)) bad.push('the door is not whole'); if (bulkItems() !== b0 + 1) bad.push('bulk items ' + (bulkItems() - b0) + ' (only the loose cell should have paid)');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.audit.belts-and-machines-keep-out-of-doorways-shafts-and-pads', async () => {
    X.setup(); const bad = [], L = g.logi, i0 = I0(), k0 = K0();
    const D = X.door(i0, k0, { auto: false }); D.tgt = 1; D.p = 1; TR.setRows(g, D, 4);
    const Lf = X.lift(i0 + 12, k0, { home: 12, depth: 10, top: 18 }), J = X.jump(i0 + 20, k0), Cu = X.cushion(i0 + 28, k0, 0);
    const spots = { 'open doorway': [D.i0 + 1, 0, D.k0], 'shaft bottom': [Lf.i0 + 2, 2, Lf.k0 + 1], 'cab at home': [Lf.i0 + 2, 13, Lf.k0 + 1], 'jump pad': [J.i0 + 1, 0, J.k0 + 2], 'cushion': [Cu.i0 + 3, 0, Cu.k0] };
    for (const [name, [i, j, k]] of Object.entries(spots)) { const why = L.canPlace(i, j, k); if (!why) bad.push(`a belt could be set on ${name}`); }
    const outside = [D.i0 + 8, 0, D.k0 + 6]; if (L.canPlace(...outside)) bad.push('the rule blocks open floor too: ' + L.canPlace(...outside));
    if (L.canPlace(D.i0 + 4, 0, D.k0)) bad.push('the cell beside the door is refused: ' + L.canPlace(D.i0 + 4, 0, D.k0));
    // a belt lift whose shaft runs down through a doorway
    const top = [D.i0 + 1, 4, D.k0]; const why = liftProblem(g, 0, { i: top[0], j: top[1], k: top[2], dir: 0, h: -4 }, 9); if (!why) bad.push('a belt lift shaft went down through a doorway');
    // the belt tile placed first still keeps the transit parts out
    X.decon(D); X.decon(Cu); if (L.canPlace(D.i0 + 1, 0, D.k0)) bad.push('the doorway is still held after the hammer: ' + L.canPlace(D.i0 + 1, 0, D.k0)); if (L.canPlace(Cu.i0 + 3, 0, Cu.k0)) bad.push('the cushion spot is still held after the hammer');
    X.decon(Lf); if (L.canPlace(Lf.i0 + 2, 2, Lf.k0 + 1)) bad.push('the shaft is still held after the hammer: ' + L.canPlace(Lf.i0 + 2, 2, Lf.k0 + 1)); X.decon(J); if (L.canPlace(J.i0 + 1, 0, J.k0 + 2)) bad.push('the pad spot is still held after the hammer');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.audit.e-in-the-car-leaves-a-belt-under-the-crosshair-alone', async () => {
    X.setup(); const bad = [], Lf = X.lift(I0() + 12, K0(), { home: 12, depth: 10, top: 18 }); X.tunnel(Lf, 12, 1, 8);
    X.powerCab(Lf, 2); adv(0.7);
    p().pos.set(Lf.px, 12 * 0.6, Lf.pz); p().vel.set(0, 0, 0); adv(0.2); if (p().liftId !== Lf.id) return 'the player did not board the cab';
    // the cab waits at the home stop and the belt lies on the landing floor beside it: looking down at it is what sends the cab down when E belongs to the elevator
    liftTo(Lf); const bi = Lf.i0 + 1, bk = Lf.k0 + 6; g.logi.add({ id: g.nextId(), type: 'belt', i: bi, j: 12, k: bk, dir: 0, rise: 0 }); S().entities.push(g.logi.tileAt(bi, 12, bk));
    const aimAt = (x, y, z) => { const e = p().eyePos(new ctx.V3()); p().yaw = Math.atan2(x - e.x, z - e.z); p().pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z)); g.renderer.camera.position.copy(e); };
    aimAt(ctx.cellX(bi), 7.3, ctx.cellZ(bk)); if (!g.logi.pick(g.renderer.camera.position, p().forward(new ctx.V3()), 3.4)) return 'the test does not aim at the belt';
    g.useKey(); if (Lf.q.length || Lf.tg !== null) bad.push('E on a belt called the lift: q ' + Lf.q + ' tg ' + Lf.tg);
    // the same key at nothing still works the car
    aimAt(Lf.px, 3.0, Lf.pz + 6); g.useKey(); if (Lf.tg === null && !Lf.q.length) bad.push('E in the cab no longer sends it anywhere');
    g.logi.remove(g.logi.tileAt(bi, 12, bk)); S().entities = S().entities.filter((e) => !(e.type === 'belt' && e.i === bi && e.k === bk));
    return bad.length === 0 || bad.join(' || ');
  });

  // chunks are 16 cells: a door that straddles a seam in x, z and y, and a car that crosses the row 16 and row 32 seams
  await guard('transit.audit.seams-doors-and-cars-work-across-chunk-edges', async () => {
    X.setup(); const bad = [], i0 = 8192 - 2, k0 = toK(0) - (toK(0) % 16) - 2;   // x 8190..8193 and z .. cross a seam
    for (let j = 12; j < 20; j++) for (let dz = -1; dz < 5; dz++) for (let dx = -1; dx < 5; dx++) { const a = w().get(i0 + dx, j, k0 + dz); if (a) w().removeCell(i0 + dx, j, k0 + dz, false); }
    const D = X.door(i0, k0, { j: 14, ax: 'x', auto: false }); p().pos.set(D.px, 0, D.pz - 12); adv(0.7);   // 8 m up: no pole reaches it, so the hand crank does the work
    if (!X.closedCells(D)) bad.push('the door is not shut across the seams');
    g.setCfg(D, { tgt: 1 }); adv(3.6); if (!X.openCells(D) || D.p !== 1) bad.push('the door did not open across the seams: p ' + D.p);
    for (const [i, j, k] of TR.allDoorCells(D)) if (!X.reservedAt(i, j, k)) { bad.push('a door cell is not reserved at ' + [i, j, k]); break; }
    if (!TR.doorAt(g, D.i0 + 3, 17, D.k0)) bad.push('doorAt misses the last cell'); if (TR.doorAt(g, D.i0 + 4, 17, D.k0) || TR.doorAt(g, D.i0, 18, D.k0) || TR.doorAt(g, D.i0, 13, D.k0)) bad.push('doorAt reaches past the door');
    g.setCfg(D, { tgt: 0 }); adv(3.6); if (!X.closedCells(D) || D.p !== 0) bad.push('the door did not close across the seams: p ' + D.p);
    // a cab that crosses the row 16 seam down to the bottom stop at row 10 (home at 24)
    const Lf = X.lift(toI(-12), toK(10), { home: 24, depth: 14, top: 30 }); X.powerCab(Lf, 3); adv(0.7);
    p().pos.set(Lf.px, 24 * 0.6, Lf.pz); adv(0.2); TR.requestFloor(g, Lf, 10); adv(8.0);
    if (Math.abs(Lf.cy - 6.0) > 1e-6) bad.push('the cab did not reach the bottom stop at 6 m: ' + Lf.cy); if (Math.abs(p().pos.y - 6.0) > 0.05) bad.push('the rider is at ' + p().pos.y);
    if (TR.sweepBlocked(g, Lf, 6.0, 24 * 0.6) !== -1) bad.push('the sweep sees a block in a clear shaft'); if (TR.heldBy(g, Lf.i0 + 1, 12, Lf.k0 + 1) !== Lf || TR.heldBy(g, Lf.i0 + 1, 9, Lf.k0 + 1) || TR.heldBy(g, Lf.i0 + 1, 28, Lf.k0 + 1)) bad.push('the shaft is held to the wrong height');
    return bad.length === 0 || bad.join(' || ');
  });

  // a cable beats the pole's reach: a door 8 m up, a car and a pad out of the pole's range all run on a wire, at full speed, and the wire goes (and comes back) with the thing
  await guard('transit.audit.cables-power-a-door-a-lift-and-a-pad-out-of-reach', async () => {
    X.setup(); const bad = [], i0 = I0(), k0 = K0(); S().items.cable = 20;
    for (let j = 12; j < 20; j++) for (let dz = -1; dz < 5; dz++) for (let dx = -1; dx < 5; dx++) { const a = w().get(i0 + dx, j, k0 + dz); if (a) w().removeCell(i0 + dx, j, k0 + dz, false); }
    const G = X.powerAt(ctx.cellX(i0) - 2.0, ctx.cellZ(k0) - 4.0, 3), D = X.door(i0, k0, { j: 14, auto: false }), Lf = X.lift(i0 + 12, k0 + 6, { home: 12, depth: 6, top: 18 }), J = X.jump(i0 + 20, k0 + 6, { ang: 45, hd: 0 });
    p().pos.set(D.px, 0, D.pz - 14); adv(0.7);
    for (const e of [D, Lf, J]) if ((e.pw ?? 0) > 0.05) bad.push(e.type + ' has power with no pole in reach: ' + e.pw);
    for (const e of [D, Lf, J]) { const r = g.cables.connect(G.pole.id, e.id); if (!r.ok) bad.push(`the cable to the ${e.type} was refused: ${r.why}`); }
    adv(0.7); for (const e of [D, Lf, J]) if (!((e.pw ?? 0) > 0.99)) bad.push(`the wired ${e.type} has pw ${e.pw}`);
    g.setCfg(D, { tgt: 1 }); adv(0.5); if (D.crank || !D.draw || !(D.p > 0.4 && D.p < 0.7)) bad.push(`the wired door is not running on power: p ${D.p} crank ${D.crank} draw ${D.draw}`);
    adv(1.0); if (!X.openCells(D)) bad.push('the wired door did not open');
    const n0 = g.cables.list().length; if (n0 !== 3) bad.push(n0 + ' cables, want 3');
    const c0 = S().items.cable; X.decon(D); X.decon(Lf); X.decon(J);
    if (g.cables.list().length !== 0) bad.push('a cable was left hanging after its machine went: ' + g.cables.list().length); if ((S().items.cable || 0) !== c0 + 3) bad.push(`the cables did not come back: ${c0} -> ${S().items.cable}`);
    return bad.length === 0 || bad.join(' || ');
  });
}
