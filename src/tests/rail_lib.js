// Shared helpers for the Mine Rail tests (rail_*.js, mp_rail.js). No default export, so the self test loader skips this file.
// makeRail(ctx) clears a strip of the open bay, lays track the way a player would (the host entry g.placeEntity after the same railWhy rule), builds power with a real pole and
// generator, drives the game loop and puts everything back in clean().
import * as R from '../rail.js';
import { makeKit } from './power_lib.js';

export const UP = { steel: 1, railShuttle: 1, power: 1, belts: 1, fans: 1, sorter: 1, depots: 1, claw: 1 };

export function makeRail(ctx) {
  const { g, S, w, p, L, V3, fresh, adv, craft, toI, toK, cellX, cellZ } = ctx;
  const K = makeKit(ctx);
  const C = 0.6;
  // the strip: x -30 .. 8 m, z -7 .. 6 m, 8 rows high
  const box = () => ({ i0: toI(-30), i1: toI(8), k0: toK(-7), k1: toK(6), j1: 8 });
  const clearBox = () => { const b = box(); for (let k = b.k0; k <= b.k1; k++) for (let i = b.i0; i <= b.i1; i++) for (let j = 0; j < b.j1; j++) if (w().get(i, j, k)) w().removeCell(i, j, k, false); };
  const isRail = (e) => R.isRailType(e.type);
  const ents = (type) => S().entities.filter((e) => (type ? e.type === type : isRail(e)));
  const carsOf = () => ents('railcar');
  const clean = () => {
    try { if (g.ui.isModalOpen()) g.ui.closeModals(); } catch (x) { /* ignore */ }
    g.keys = {}; g.stowed = true; g.dead = false;
    R.reset(g);
    for (const e of [...S().entities]) if (isRail(e)) { try { g.doDecon({ kind: 'mach', id: e.id }); } catch (x) { /* a half built ent */ } }
    const b = box();
    for (let k = b.k0; k <= b.k1; k++) for (let i = b.i0; i <= b.i1; i++) for (let j = 0; j < b.j1; j++) if (w().get(i, j, k)) w().setCell(i, j, k, 0, 0);
    for (const t of [...L().tiles.values()]) if (!t.free && t.i >= b.i0 && t.i <= b.i1 && t.k >= b.k0 && t.k <= b.k1) { L().remove(t); S().entities = S().entities.filter((x) => x.id !== t.id); }
    R.invalidate(g); g.power.markDirty();
  };
  const setup = (up = UP) => {
    clean(); K.reset(up, false); S().money = 1e13; clearBox(); R.invalidate(g);
    p().pos.set(cellX(toI(-9)), 0, cellZ(toK(-3))); p().vel.set(0, 0, 0);
    g.T = g.tune();
  };
  const ci = (x) => toI(x), ck = (z) => toK(z);
  // lay one piece of track the way the tool does (same rule), returns the ent or the refusal
  const lay = (i, j, k) => { const why = R.railWhy(g, i, j, k); if (why) return { why }; const e = g.placeEntity('rail', { i, j, k }, { quiet: true }); R.invalidate(g); return { ent: e }; };
  // a straight run along +x from cell i0 to i1 (inclusive) at row j, column k
  const line = (i0, i1, j, k) => { const out = []; for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) { const r = lay(i, j, k); if (r.why) throw new Error(`rail at ${i},${j},${k}: ${r.why}`); out.push(r.ent); } return out; };
  const lineZ = (k0, k1, j, i) => { const out = []; for (let k = Math.min(k0, k1); k <= Math.max(k0, k1); k++) { const r = lay(i, j, k); if (r.why) throw new Error(`rail at ${i},${j},${k}: ${r.why}`); out.push(r.ent); } return out; };
  const station = (i, j, k, role) => { const f = R.buildFields(g, { kind: 'railstn' }, { type: 'railstn', i, j, k }); if (role) f.role = role; const e = g.placeEntity('railstn', f, { quiet: true }); R.invalidate(g); return e; };
  const cart = (i, j, k) => { const e = g.placeEntity('railcar', R.buildFields(g, { kind: 'railcar' }, { type: 'railcar', i, j, k }), { quiet: true }); R.invalidate(g); return e; };
  // power: a pole and a burning generator beside the station (the pole carries 1.0 satisfaction), reach shrunk like the power tests do
  const power = (x, z) => { K.small(); const gen = K.gen(x - 0.9, z); const pole = K.pole(x, z); g.power.markDirty(); adv(0.2); return { gen, pole }; };
  // the standard line: a base station by the bin at the east end, a face station at the west end, a cart parked at the face
  const std = (o = {}) => {
    const k = ck(-2.2), j = 0, iBase = ci(1.0), iFace = ci(-24.0);
    const track = line(iFace, iBase, j, k);
    const base = station(iBase, j, k, 'base'), face = station(iFace, j, k, 'face');
    const car = cart(iFace + 1, j, k);
    if (o.power !== false) power(cellX(iBase), cellZ(k) + 1.0);
    R.invalidate(g); adv(0.3);
    return { track, base, face, car, k, j, iBase, iFace };
  };
  const keyOf = (e) => R.keyOf(e);
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  // run the game loop until f() is true or `max` seconds went by; returns the seconds used
  const until = (f, max = 30, dt = 0.05) => { let t = 0; while (t < max && !f()) { adv(dt, dt); t += dt; } return t; };
  const aimAtCell = (i, k, o = {}) => {
    const { j = 0, back = 2.6, dir = 0 } = o; const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
    const x = cellX(i), z = cellZ(k); p().pos.set(x - DX[dir] * back, j * C, z - DZ[dir] * back); p().vel.set(0, 0, 0);
    const e = p().eyePos(new V3()), dx = x - e.x, dy = j * C + 0.04 - e.y, dz = z - e.z; p().yaw = Math.atan2(dx, dz); p().pitch = Math.atan2(dy, Math.hypot(dx, dz));
    g.renderer.camera.position.copy(p().eyePos(new V3()));
  };
  const equip = (id) => { if (!(S().items[id] > 0)) craft(id, 1); S().hotbar = ['hammer', null, null, null, null, null, null, null, null]; g.rebuildTools(); ctx.selectTool(id); };
  const standNear = (x, z) => { p().pos.set(x, 0, z); p().vel.set(0, 0, 0); };
  const msgs = () => (document.getElementById('hint') ? document.getElementById('hint').textContent : '');
  const sayLog = () => { const log = []; const orig = g.ui.hint; g.ui.hint = (t, s) => { log.push(String(t).replace(/<[^>]*>/g, '')); return orig.call(g.ui, t, s); }; return { log, restore: () => { g.ui.hint = orig; } }; };
  return { R, K, C, box, clearBox, clean, setup, ents, carsOf, lay, line, lineZ, station, cart, power, std, keyOf, near, until, aimAtCell, equip, standNear, msgs, sayLog, ci, ck };
}
