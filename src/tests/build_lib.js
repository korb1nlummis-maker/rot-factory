// Shared helpers for the build shell tests (build_*.js, mp.build.*). No default export, so the self test loader skips this file.
// makeShell(ctx) returns the helpers: a cleared test box in the open bay, aiming, putting pieces down, and a full clean up (pads and walls are world cells,
// so a test that leaves them behind would change what the next area sees).
import * as B from '../build.js';

export const UP = {
  timber: 1, steel: 1, concrete: 1, rebar: 1, titan: 1, carbon: 1, plasma: 1, voidl: 1, neutron: 1, horizon: 1, bulkhead: 1, shellPads: 1, shellRamps: 1, shellLevel: 1, power: 1, belts: 1,
};
export const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];

export function makeShell(ctx) {
  const { g, S, w, p, L, V3, fresh, craft, selectTool, plan, adv, cellX, cellZ, toI, toK } = ctx;
  const C = 0.6;
  // the test box: x -30 .. 14 m, z -6 .. 12 m, 14 rows high (a zoop of 10 pads is 24 m long). Plush in it is cleared, anything built in it is removed by clean().
  const box = () => ({ i0: toI(-30), i1: toI(14), k0: toK(-6), k1: toK(12), j1: 14 });
  const clearBox = () => { const b = box(); for (let k = b.k0; k <= b.k1; k++) for (let i = b.i0; i <= b.i1; i++) for (let j = 0; j < b.j1; j++) if (w().get(i, j, k)) w().removeCell(i, j, k, false); };
  const isShell = (e) => B.isBuildType(e.type);
  const ents = (type) => S().entities.filter((e) => (type ? e.type === type : isShell(e)));
  const clean = () => {
    try { if (g.ui.isModalOpen()) g.ui.closeModals(); } catch (x) { /* ignore */ }
    g.keys = {}; g._bhold = null; g._bRot = 0; g._bn = 0; g._bz = { n: 1, w: 1 }; g._xInfo = null; g.stowed = true; if (g.cfgClip) g.cfgClip = null;
    for (const e of [...S().entities]) if (isShell(e)) { try { g.doDecon({ kind: 'mach', id: e.id }); } catch (x) { /* a half built ent */ } }
    const b = box();
    for (let k = b.k0; k <= b.k1; k++) for (let i = b.i0; i <= b.i1; i++) for (let j = 0; j < b.j1; j++) { const s = w().get(i, j, k); if (s === 4095 || s === 4098) w().setCell(i, j, k, 0, 0); }
    for (const t of [...L().tiles.values()]) if (!t.free && t.i >= b.i0 && t.i <= b.i1 && t.k >= b.k0 && t.k <= b.k1) { L().remove(t); S().entities = S().entities.filter((x) => x.id !== t.id); }
    for (const it of [...g.machines.items.values()]) { const e = it.ent; if (e.type === 'frame' || e.type === 'strut' || e.type === 'lantern') { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); S().entities = S().entities.filter((x) => x.id !== e.id); } }
    w().supports = []; w().stabQueue.length = 0; w().creaking.clear();
  };
  const setup = (up = UP) => { clean(); fresh({ ...up }); S().money = 1e13; clearBox(); p().pos.set(cellX(toI(-9)), 0, cellZ(toK(-3))); p().vel.set(0, 0, 0); };
  // stand `back` metres behind a cell (looking along +x unless dir says otherwise) at eye height, aimed at the point (x, y, z) of the cell centre
  const aim = (i, k, o = {}) => {
    const { y = 0, back = 2.6, dir = 0, pitchTo = null } = o;
    const x = cellX(i), z = cellZ(k);
    p().pos.set(x - DX[dir] * back, 0, z - DZ[dir] * back); p().vel.set(0, 0, 0);
    const e = p().eyePos(new V3()); const tx = pitchTo ? pitchTo.x : x, ty = pitchTo ? pitchTo.y : y, tz = pitchTo ? pitchTo.z : z;
    const dx = tx - e.x, dy = ty - e.y, dz = tz - e.z; p().yaw = Math.atan2(dx, dz); p().pitch = Math.atan2(dy, Math.hypot(dx, dz));
    p().yaw = o.yaw !== undefined ? o.yaw : p().yaw;
    g.renderer.camera.position.copy(p().eyePos(new V3()));   // the frame loop moves the camera; a test that aims and asks right away must too
  };
  // bench price is charged for real, the item goes on the hotbar and into the hand
  const equip = (id) => { if (!(S().items[id] > 0)) craft(id, 1); S().hotbar = ['hammer', null, null, null, null, null, null, null, null]; g.rebuildTools(); selectTool(id); };
  const hand = async (id, n = 1) => { S().items[id] = 0; delete S().items[id]; craft(id, n); S().hotbar = ['hammer', null, null, null, null, null, null, null, null]; g.rebuildTools(); selectTool(id); };
  // put one thing down: aim at floor cell (i, k), plan, place. Returns { pl, made: [ents], ok, why }
  const put = async (id, i, k, o = {}) => {
    if (!(S().items[id] > 0)) craft(id, o.n || 1); equip(id); aim(i, k, o);
    const pl = await plan(); if (!pl || !pl.ok) return { ok: false, why: pl && pl.why, pl, made: [] };
    const before = new Set(S().entities.map((e) => e.id)); g.placeCurrent(g.curTool());
    return { ok: true, pl, made: S().entities.filter((e) => !before.has(e.id)) };
  };
  const cellsOf = (e) => B.cellsOf(e);
  const solidCells = (e) => B.cellsOf(e).every(([i, j, k]) => w().get(i, j, k) === (e.type === 'wall' ? 4098 : 4095));
  const cloneJSON = (o) => JSON.parse(JSON.stringify(o));
  // a free-standing stack of plush above a floor cell (to test clearance): n plush at (i, j.., k)
  const plushAt = (i, j, k, n = 1) => { for (let q = 0; q < n; q++) w().setCell(i, j + q, k, 2, 0); };
  return { B, UP, box, clearBox, clean, setup, aim, equip, hand, put, ents, isShell, cellsOf, solidCells, cloneJSON, plushAt, C };
}
