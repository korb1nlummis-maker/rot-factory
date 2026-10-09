// Shared helpers for the furnish tests (furnish_mp.js). This file has no default export, so the self test loader skips it.
import { makeKit } from './addons_lib.js';
import * as F from '../furnish.js';

export const UP = { vault: 1, sorter: 1, belts: 1, power: 1, lantern: 1, furnSigns: 1, furnStore: 1, furnLamps: 1, furnFlood: 1, furnSilo: 1, furnDepot: 1 };

export function makeFurnKit(ctx) {
  const { g, S, w, p, L, fresh, adv, craft, selectTool, plan, aimPoint, cellX, cellZ, toI, toK } = ctx;
  const K = makeKit(ctx);
  const cells = [];
  const solid = (i, j, k) => { w().setCell(i, j, k, 2, 0); cells.push([i, j, k]); };
  const clearCells = () => { for (const c of cells.splice(0)) w().setCell(c[0], c[1], c[2], 0, 0); };
  const reset = () => { hub = null; clearCells(); fresh(UP); F.resetFurnish(g); S().money = 1e12; K.clearBay(); g.alarmGate = null; };
  const ids = () => new Set(S().entities.map((e) => e.id));
  const putAt = async (id, x, y, z, back = 2.0) => {
    S().hotbar = ['hammer', null, null, null, null, null, null, null, null]; g.rebuildTools();
    if (!(S().items[id] > 0)) craft(id);
    selectTool(id); aimPoint(x, y, z, back);
    const pl = await plan(); if (!pl || !pl.ok) return { ok: false, why: pl && pl.why, pl };
    const before = ids(); g.placeCurrent(g.curTool());
    const ent = S().entities.find((e) => !before.has(e.id)); if (ent && hub) K.wireNear(hub, 14); return { ok: !!ent, ent, pl, why: ent ? null : 'nothing was created' };
  };
  const onFloor = (id, x, z, back = 2.0) => putAt(id, x, 0, z, back);
  const wall = (x, z) => { const I = toI(x), Kc = toK(z); for (let dk = -3; dk <= 3; dk++) for (let j = 0; j < 6; j++) solid(I, j, Kc + dk); return { x: cellX(I) - 0.3, z: cellZ(Kc) }; };
  const roof = (x, z, j = 6) => { const I = toI(x), Kc = toK(z); for (let di = -3; di <= 3; di++) for (let dk = -3; dk <= 3; dk++) solid(I + di, j, Kc + dk); return { x: cellX(I), z: cellZ(Kc), y: j * 0.6 }; };
  let hub = null;   // the pole of grid(): everything placed afterwards is wired to it (power travels only through cables)
  const run = (sec, dt = 0.05) => { if (hub) K.wireNear(hub, 14); adv(sec, dt); };
  const grid = async (x = -7, z = 8, fuel = 40, gens = 1) => {
    let first = null;
    for (let n = 0; n < gens; n++) { const gn = await K.put('gen', { x: x - n * 1.2, z, dir: 0 }); if (!gn.ok) throw new Error('gen: ' + gn.why); K.feedGen(K.tileOf(gn.ent), fuel); first = first || gn.ent; }
    const pl = await K.put('pole', { x: x + 1.2, z, dir: 0 }); if (!pl.ok) throw new Error('pole: ' + pl.why);
    hub = K.tileOf(pl.ent); for (const gt of S().entities.filter((e) => e.type === 'gen')) K.wire(gt, hub);   // generators to the pole
    run(1.5); return { gen: first, pole: pl.ent };
  };
  const mach = (e) => g.machines.items.get(e.id);
  const mkVault = (i, k, stored) => { const v = { id: g.nextId(), type: 'vault', i, j: 0, k, dir: 0, rise: 0 }; S().entities.push(v); g.addEntity(v); const t = L().byId.get(v.id); t.stored.push(...stored); return t; };
  const plushes = (n, sp = 3, vr = 0) => Array.from({ length: n }, () => ({ sp, vr }));
  const count = (e) => Object.values(e.cargo || {}).reduce((a, b) => a + b, 0);
  // one of everything in the open bay: a wall for the locker, a roof for the lamp
  const furnishAll = async () => {
    const wl = wall(-2, 2), rf = roof(-5, 0), out = {};
    const mk = [['pcrate', () => onFloor('pcrate', -9, 4)], ['silo', () => onFloor('silo', -8, 6)], ['dimdepot', () => onFloor('dimdepot', -10, 6)], ['sign', () => onFloor('sign', -9, 2)], ['dsign', () => putAt('dsign', wl.x, 0.9, wl.z + 1.2, 2)], ['psign', () => onFloor('psign', -11, 2)], ['clamp', () => putAt('clamp', rf.x, rf.y - 0.01, rf.z - 0.6, 2.4)], ['flood', () => onFloor('flood', -9, 8.6)], ['strip', () => onFloor('strip', -7, 9)], ['wbeacon', () => onFloor('wbeacon', -9, 10)], ['locker', () => putAt('locker', wl.x, 0.9, wl.z, 2)]];
    for (const [id, f] of mk) { const r = await f(); if (!r.ok) throw new Error(`${id}: ${r.why}`); out[id] = r.ent; }
    return out;
  };
  return { K, solid, clearCells, reset, ids, putAt, onFloor, wall, roof, run, grid, mach, mkVault, plushes, count, furnishAll };
}
