// stack.door.*: door frames (a Wall Section on the face of a cube) and Doors in them, with and without a plate in the cube (wave 10, stack.js + build.js + transit.js).
import { kit, UP } from './stack_lib.js';
import * as TR from '../transit.js';
import { BULK } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, w, p, adv, craft, selectTool, plan, aimPoint } = ctx;
  const K = kit(ctx), W = K.W, B = K.B, PAD = K.PAD;
  const UPD = { ...UP, transitDoor: 1, power: 1 };
  const layer = (Y, dx) => { const out = []; for (let j = 0; j < 4; j++) for (let dz = 0; dz < 4; dz++) out.push(W().get(Y.m + dx, j, Y.lo + dz)); return out; };
  // stand in the cube looking at its west face
  const lookWest = (A) => { K.stand(A, { od: 2, pitch: 0 }); p().pos.y = A.y0 + 0.62; };

  await T('stack.door.aiming-a-wall-into-a-cube-makes-a-door-frame-on-the-face-you-look-at', async () => {
    const Y = K.yard({ east: true, up: UPD }); const [A] = K.stack(Y, ['steel']);
    craft('wall'); selectTool('wall'); lookWest(A); const pl = await plan(); if (!pl.ok) return pl.why;
    const e = pl.ent; if (e.bay !== A.id || e.ax !== 'z' || e.i0 !== Y.m || e.k0 !== Y.lo || e.j !== 0) return 'west face: ' + JSON.stringify([e.bay, e.ax, e.i0, e.k0, e.j]);
    K.stand(A, { od: 0, pitch: 0 }); const east = await plan(); if (!east.ok || east.ent.i0 !== Y.m + 3 || east.ent.ax !== 'z') return 'east face: ' + JSON.stringify([east.ok, east.why, east.ent && east.ent.i0]);
    K.stand(A, { od: 1, pitch: 0 }); const north = await plan(); if (!north.ok || north.ent.k0 !== Y.lo + 3 || north.ent.ax !== 'x') return 'north face: ' + JSON.stringify([north.ok, north.ent && north.ent.k0]);
    K.stand(A, { od: 3, pitch: 0 }); const south = await plan(); return (south.ok && south.ent.k0 === Y.lo && south.ent.ax === 'x') || 'south face: ' + JSON.stringify([south.ok, south.why]);
  });

  await T('stack.door.the-frame-fills-the-layer-and-takes-the-edge-of-the-plate-and-gives-it-back', async () => {
    const Y = K.yard({ east: true, up: UPD }); const [A] = K.stack(Y, ['steel']); const r = await K.putPlate(A, 'f'); if (!r.ok) return r.why;
    craft('wall'); selectTool('wall'); lookWest(A); const pl = await plan(); if (!pl.ok) return 'a door frame over a plate edge was refused: ' + pl.why;
    if (K.placeNow() !== 1) return 'not placed'; const wall = S().entities.at(-1);
    if (wall.type !== 'wall' || wall.bay !== A.id) return JSON.stringify(wall);
    if (!layer(Y, 0).every((s) => s === BULK)) return 'the layer is not 16 bulkhead cells';
    const padCells = K.count(Y.m, 0, Y.lo, 4, 1, 4, PAD); if (padCells !== 12) return `the plate has ${padCells} cells, expected 12`;
    g.doDecon({ kind: 'mach', id: wall.id });
    if (K.count(Y.m, 0, Y.lo, 4, 1, 4, PAD) !== 16) return 'the plate did not get its edge back';
    if (K.count(Y.m, 1, Y.lo, 1, 3, 4)) return 'wall cells left over the sill';
    return B.ownerAt(g, Y.m, 0, Y.lo) === S().entities.find((e) => e.type === 'pad') || 'the plate does not own its edge again';
  });

  await T('stack.door.a-door-in-the-frame-opens-and-you-walk-through-onto-the-plate-and-closed-it-stops-you', async () => {
    const Y = K.yard({ east: true, up: UPD }); const [A] = K.stack(Y, ['steel']); const r = await K.putPlate(A, 'f'); if (!r.ok) return r.why;
    craft('wall'); selectTool('wall'); lookWest(A); await plan(); K.placeNow(); const wall = S().entities.at(-1);
    craft('door'); selectTool('door'); lookWest(A); K.aimAt(K.cellX(Y.m), 1.5, K.cellZ(Y.lo + 1), 1.4, A.y0 + 0.62); const dl = await plan(); if (!dl.ok || dl.ent.replaces !== wall.id) return 'door plan: ' + JSON.stringify([dl.ok, dl.why, dl.ent]);
    K.placeNow(); const door = S().entities.find((e) => e.type === 'door'); if (!door || door.bay !== A.id) return 'no door with a bay: ' + JSON.stringify(door);
    if (S().entities.some((e) => e.id === wall.id)) return 'the wall is still there next to the door';
    if (K.count(Y.m, 0, Y.lo, 1, 1, 4, PAD) !== 4) return 'the sill is not the plate edge';
    // closed: it stops you
    K.tick(0.2); p().pos.set(K.cellX(Y.m - 3), 0, K.cellZ(Y.lo + 1)); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0; K.walk(2.5, { fwd: 1 });
    if (p().pos.x > K.cellX(Y.m) - 0.2) return 'walked through a closed door: x ' + p().pos.x.toFixed(2);
    // open it (the leaf is up): rows 1 to 3 are free, the sill stays
    door.p = 1; door.tgt = 1; TR.setRows(g, door, TR.freedOf(1)); if (K.count(Y.m, 1, Y.lo, 1, 3, 4)) return 'rows over the sill are not open';
    if (K.count(Y.m, 0, Y.lo, 1, 1, 4, PAD) !== 4) return 'the sill went when the door opened';
    p().pos.set(K.cellX(Y.m - 3), 0, K.cellZ(Y.lo + 1)); p().vel.set(0, 0, 0); K.walk(3.2, { fwd: 1 }, () => p().pos.x > K.cellX(Y.m + 2));
    return (p().pos.x > K.cellX(Y.m + 1) && p().pos.y > 0.45 && p().pos.y < 0.8) || `through the doorway: x ${p().pos.x.toFixed(2)} y ${p().pos.y.toFixed(2)}`;
  });

  await T('stack.door.a-door-frame-in-a-cube-with-no-plate-and-with-a-ceiling-plate', async () => {
    const Y = K.yard({ east: true, up: UPD, levels: 2 }); const [A, B2] = K.stack(Y, ['steel', 'steel']);
    craft('wall', 2); selectTool('wall'); lookWest(A); p().pos.y = 0; let pl = await plan(); if (!pl.ok) return 'no plate: ' + pl.why; K.placeNow();
    if (!layer(Y, 0).every((s) => s === BULK)) return 'no plate: the layer is not a wall';
    const cp = await K.putPlate(B2, 'c', 0, 0); if (!cp.ok) return 'ceiling plate: ' + cp.why;
    craft('wall'); selectTool('wall'); K.stand(B2, { od: 2, pitch: 0 }); p().pos.y = B2.y0; pl = await plan(); if (!pl.ok) return 'ceiling plate: ' + pl.why; K.placeNow();
    return K.count(Y.m, 7, Y.lo, 1, 1, 4, BULK) === 4 || 'the ceiling plate edge was not taken by the frame';
  });

  await T('stack.door.a-plate-laid-after-the-door-frame-stands-round-it-and-the-hammer-still-finds-each', async () => {
    const Y = K.yard({ east: true, up: UPD }); const [A] = K.stack(Y, ['steel']);
    craft('wall'); selectTool('wall'); lookWest(A); p().pos.y = 0; let pl = await plan(); if (!pl.ok) return pl.why; K.placeNow(); const wall = S().entities.at(-1);
    const r = await K.putPlate(A, 'f', 0, 0); if (!r.ok) return 'the plate was refused after the frame: ' + r.why;
    if (!layer(Y, 0).every((s) => s === BULK)) return 'the plate overwrote the door frame'; if (K.count(Y.m, 0, Y.lo, 4, 1, 4, PAD) !== 12) return `the plate has ${K.count(Y.m, 0, Y.lo, 4, 1, 4, PAD)} cells round the frame`;
    if (B.ownerAt(g, Y.m, 0, Y.lo) !== wall) return 'the frame lost its cell to the plate'; if (B.ownerAt(g, Y.m + 1, 0, Y.lo) !== r.e) return 'the plate does not own its own cells';
    g.doDecon({ kind: 'mach', id: r.e.id }); if (!layer(Y, 0).every((s) => s === BULK)) return 'taking the plate out took the frame with it'; if (K.count(Y.m, 0, Y.lo, 4, 1, 4, PAD)) return 'plate cells left';
    g.doDecon({ kind: 'mach', id: wall.id }); return K.count(Y.m, 0, Y.lo, 4, 4, 4) === 0 || 'cells left after both came down';
  });

  await T('stack.door.the-hammer-refunds-both-and-a-cube-with-a-door-frame-stays-up', async () => {
    const Y = K.yard({ east: true, up: UPD }); const [A] = K.stack(Y, ['steel']);
    craft('wall'); selectTool('wall'); lookWest(A); p().pos.y = 0; await plan(); K.placeNow(); const wall = S().entities.at(-1); const n0 = S().items.wall || 0;
    g.doDecon({ kind: 'mach', id: A.id }); if (!K.M().items.has(A.id)) return 'a cube with a door frame came down';
    g.doDecon({ kind: 'mach', id: wall.id }); if ((S().items.wall || 0) !== n0 + 1) return 'no wall back'; if (K.count(Y.m, 0, Y.lo, 1, 4, 4)) return 'cells left';
    g.doDecon({ kind: 'mach', id: A.id }); return !K.M().items.has(A.id) || 'the cube stayed after its frame came out';
  });

  await T('stack.door.a-door-and-its-frame-are-lost-with-a-fallen-cube-and-leave-nothing-reserved', async () => {
    const Y = K.yard({ east: true, up: UPD }); const [A] = K.stack(Y, ['steel']);
    craft('wall'); selectTool('wall'); lookWest(A); p().pos.y = 0; await plan(); K.placeNow(); const wall = S().entities.at(-1);
    craft('door'); selectTool('door'); K.aimAt(K.cellX(Y.m), 1.5, K.cellZ(Y.lo + 1), 1.4, 0.02); await plan(); K.placeNow(); const door = S().entities.find((e) => e.type === 'door'); if (!door) return 'no door';
    g.failSupport(K.support(A), 1.2);
    if (S().entities.some((e) => e.id === door.id || e.id === wall.id)) return 'the door or the frame stayed in the world';
    for (let j = 0; j < 4; j++) for (let dz = 0; dz < 4; dz++) { if (W().reserved.has(K.idx(Y.m, j, Y.lo + dz))) return 'a door cell stayed reserved'; if (W().get(Y.m, j, Y.lo + dz)) return 'a door cell stayed solid'; }
    return true;
  });
}
