// Shared helpers for the transit wave tests (transit_*.js, mp.transit.*). No default export, so the self test loader skips this file.
// kit(ctx) wraps the build shell kit (aim, put, clean) and the power kit (a pole and burning generators on a short link), and cleans every door, lift, button,
// jump pad and cushion pad up again, with the cells they set and the cells they reserve, so a test never changes what the next area sees.
import { makeShell, UP as SHELL_UP } from './build_lib.js';
import { makeKit } from './power_lib.js';
import * as TR from '../transit.js';
import { BULK, PAD } from '../plushdata.js';

export const UP = { ...SHELL_UP, transitDoor: 1, transitBlast: 1, transitLift: 1, transitJump: 1, springs: 3, power: 1 };
export const TYPES = ['door', 'plift', 'callbtn', 'jump', 'cushion'];

export function kit(ctx) {
  const { g, S, w, p, L, V3, fresh, adv, craft, toI, toK, cellX, cellZ, plan, clearBodies } = ctx;
  const K = makeShell(ctx), P = makeKit(ctx), C = 0.6, idx = (i, j, k) => (j * 16384 + k) * 16384 + i;
  const mine = (e) => TYPES.includes(e.type);
  const ents = (type) => S().entities.filter((e) => (type ? e.type === type : mine(e)));
  const undo = [];   // [i, j, k, sp, vr] of every cell clearCol and slab changed, put back by clean() (a shaft is taller than the shell test box)
  const poke = (i, j, k, sp, vr) => { undo.push([i, j, k, w().get(i, j, k), w().getVr(i, j, k)]); if (sp) w().setCell(i, j, k, sp, vr); else if (w().get(i, j, k)) w().removeCell(i, j, k, false); };
  const clean = () => {
    try { for (const e of [...S().entities]) if (mine(e) && e.type !== 'callbtn') g.doDecon({ kind: 'mach', id: e.id }); for (const e of [...S().entities]) if (mine(e)) g.doDecon({ kind: 'mach', id: e.id }); } catch (x) { /* a half built ent */ }
    for (const t of [...L().tiles.values()]) if (!t.free && (t.type === 'gen' || t.type === 'pole')) { L().remove(t); S().entities = S().entities.filter((x) => x.id !== t.id); }
    const pl = p(); pl.liftId = 0; pl.flight = 0; pl.launched = false; pl.launchLock = 0; pl.ride = null; pl.landSafe = null; g.cart.support = null; g.cart2.support = null; g.cart.followFix = null; g.cart2.followFix = null;
    TR.resetTransit(); TR.CARRIERS.clear(); delete g._jang; delete g._jr; delete g._bRot;
    S().cart = null; S().gcart = null; S().hcart = null; g.cart.sync(); g.cart2.sync();
    K.clean();
    if (clearBodies) clearBodies();   // loose plush a test dropped, threw or let fall would settle into the next test's shaft and make a floor where it has none
    if (g.loadQ) g.loadQ.clear(); if (g.pendFail) g.pendFail.clear();   // the frames a test stacked in a shaft were queued to be weighed: the ids must not wait in line for the load tests that follow
    while (undo.length) { const [i, j, k, sp, vr] = undo.pop(); if (sp) w().setCell(i, j, k, sp, vr); else if (w().get(i, j, k)) w().removeCell(i, j, k, false); }
  };
  // the cleared box (x -30 .. 14, z -6 .. 12 m) with every transit unlock and the shell unlocks; shortened pole reach so a pole 2 m away powers things
  const setup = (up = UP) => { clean(); K.setup(up); P.small(); g.cables.reset(); g.power.clear(); S().cables = []; g.power.markDirty(); };
  // clear a column of cells (a lift shaft) up to row `top`
  const clearCol = (i0, k0, top, w4 = 4) => { for (let j = 0; j <= top; j++) for (let dz = 0; dz < w4; dz++) for (let dx = 0; dx < w4; dx++) if (w().get(i0 + dx, j, k0 + dz)) poke(i0 + dx, j, k0 + dz, 0, 0); };
  // a pole at (x, z) with `gens` burning generators beside it: everything within the (short) reach of the pole is on a grid
  // (power travels only through cables: the pole is wired to every unwired door, lift and pad within 8 m, one cable each)
  const powerAt = (x, z, gens = 2, o = {}) => { const G = P.grid(x, z, { gens }); if (o.near !== false) P.wireNear(G.pole, 8); g.power.markDirty(); return G; };   // (o.near false: wire nothing, the test lays its own cables)
  // make a transit ent the plain way (an ent in the world, no bench): returns the live ent
  const make = (type, fields) => { const e = g.placeEntity(type, fields, { quiet: true }); return e; };
  // a door placed straight into a cleared box: ax 'x' spans x (4 wide, 1 thick); returns the live ent. i0 / k0 / j are the min corner cell.
  const door = (i0, k0, o = {}) => { const e = make('door', { ax: o.ax || 'x', i0, k0, j: o.j || 0, blast: !!o.blast, lock: o.lock || 'none', auto: o.auto === undefined ? !o.blast : o.auto, tgt: 0, p: 0, st: 'closed', rid: o.blast ? 'door:blast' : 'door' }); return e; };
  const doorCells = (e) => TR.allDoorCells(e);
  const closedCells = (e) => doorCells(e).every(([i, j, k]) => w().get(i, j, k) === BULK);
  const openCells = (e) => doorCells(e).every(([i, j, k]) => w().get(i, j, k) === 0);
  // ---- the elevator (hoistway design) ----
  // a 10 x 10 cell block of solid plush rows 0 .. top-1 around the footprint (so the shaft has walls and a floor), the 4 x 4 x 4 opening at row `home`, `depth` rows of shaft dug straight down
  // from it, and, unless frames:false, a stack of timber cubes shoring the shaft from its bottom up. Returns the live elevator ent. Everything is undone by clean().
  const frame = (L0, j0, kind = 'timber') => { const e = g.machines.frameEnt('x', kind, L0.i0, L0.k0, j0); delete e.clear; const ent = { id: g.nextId(), type: 'frame', ...e }; S().entities.push(ent); g.addEntity(ent); return ent; };
  const block = (i0, k0, top, pad = 3) => { for (let k = k0 - pad; k < k0 + 4 + pad; k++) for (let i = i0 - pad; i < i0 + 4 + pad; i++) for (let j = 0; j < top; j++) if (!w().get(i, j, k)) poke(i, j, k, 2, 0); };
  const dig = (i0, k0, j0, j1) => { for (let j = j0; j <= j1; j++) for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) if (w().get(i0 + dx, j, k0 + dz)) poke(i0 + dx, j, k0 + dz, 0, 0); };
  const shaftDig = (L0, rowTo) => dig(L0.i0, L0.k0, rowTo, L0.j - 1);   // dig the shaft down to the floor row rowTo
  const lift = (i0, k0, o = {}) => {
    const home = o.home ?? 12, depth = o.depth ?? 10, top = o.top ?? home + 6;
    block(i0, k0, top); dig(i0, k0, home - depth, home + 3);
    const L0 = make('plift', { i0, k0, j: home, cy: home * C, tg: null, q: [], dw: 0, dr: 1, tr: 0, ex: 0, rid: 'plift' });
    if (o.frames !== false) for (let j0 = home - depth; j0 + 4 <= home; j0 += 4) frame(L0, j0);
    if (o.run !== false) { TR.refreshShaft(g, L0); L0.ex = L0.tr; }   // the rails already run out to the bottom of what was dug
    return L0;
  };
  // a tunnel 4 wide and 4 high beside the shaft, its floor at row `row` (side 0 east, 1 south, 2 west, 3 north), `len` cells long: a landing
  const tunnel = (L0, row, side = 0, len = 8) => {
    for (let d = 0; d < len; d++) for (let u = 0; u < 4; u++) { const [i, k] = side === 0 ? [L0.i0 + 4 + d, L0.k0 + u] : side === 2 ? [L0.i0 - 1 - d, L0.k0 + u] : side === 1 ? [L0.i0 + u, L0.k0 + 4 + d] : [L0.i0 + u, L0.k0 - 1 - d]; for (let r = row; r < row + 4; r++) if (w().get(i, r, k)) poke(i, r, k, 0, 0); }
  };
  // the edge of a floor pad opening into the shaft: 3 cells deep, 4 wide, 4 high, floored with pad cells at row-1
  const ledge = (L0, row, side = 0) => {
    tunnel(L0, row, side, 3);
    for (let d = 0; d < 3; d++) for (let u = 0; u < 4; u++) { const [i, k] = side === 0 ? [L0.i0 + 4 + d, L0.k0 + u] : side === 2 ? [L0.i0 - 1 - d, L0.k0 + u] : side === 1 ? [L0.i0 + u, L0.k0 + 4 + d] : [L0.i0 + u, L0.k0 - 1 - d]; poke(i, row - 1, k, PAD, 0); }
  };
  // power for the home stop: a pole 2.6 m from the cab and `gens` burning generators, with the pole reach long enough for the height of the cab
  // (the grid stands at the height of the home stop, so a pole that is 2.6 m away reaches it at the usual 3 m and no machine far below the cab joins it)
  const powerCab = (L0, gens = 2) => {
    const x = L0.px - 2.6, z = L0.pz, G = { x, z, pole: P.tile('pole', x, z, { j: L0.j }), gens: [], fans: [] };
    for (let n = 0; n < gens; n++) { const t = P.tile('gen', x - 1.2 - n * 0.9, z, { j: L0.j }); t.burn = 1e5; t.burnMax = 1e5; t.lit = true; G.gens.push(t); P.wire(t, G.pole); }
    for (const c of g.cables.of(L0.id)) g.cables.remove(c.id, false);   // (a new rig replaces the old cable of this lift: the old pole may be gone or dark)
    P.wireNear(G.pole, 8); g.power.markDirty(); return G;
  };
  // a slab of pad cells beside a shaft (side 0 east, 1 south, 2 west, 3 north), 3 cells deep and 6 wide, rows 0 .. j-1, so a floor at row j stands next to the car.
  // Returns the cell a call button can stand on: { i, k }.
  const slab = (i0, k0, j, side, v = PAD) => {
    const cells = [];
    for (let u = -1; u <= 4; u++) for (let d = 0; d < 3; d++) { const a = side === 0 ? [i0 + 4 + d, k0 + u] : side === 2 ? [i0 - 1 - d, k0 + u] : side === 1 ? [i0 + u, k0 + 4 + d] : [i0 + u, k0 - 1 - d]; cells.push(a); }
    for (let jj = 0; jj < j; jj++) for (const [a, c] of cells) poke(a, jj, c, v, 0);
    return side === 0 ? { i: i0 + 4, k: k0 + 1 } : side === 2 ? { i: i0 - 1, k: k0 + 1 } : side === 1 ? { i: i0 + 1, k: k0 + 4 } : { i: i0 + 1, k: k0 - 1 };
  };
  const platform = (i0, k0, j, side = 0) => slab(i0, k0, j, side, PAD);
  const unplatform = (i0, k0, j, side = 0) => slab(i0, k0, j, side, 0);
  const jump = (i0, k0, o = {}) => make('jump', { i0, k0, j: o.j || 0, ang: o.ang ?? 45, hd: o.hd ?? 0, on: true, buf: 5, cool: 0, rid: 'jump' });
  const cushion = (i0, k0, j = 0) => make('cushion', { i0, k0, j, rid: 'cushion' });
  const decon = (e) => g.doDecon({ kind: 'mach', id: e.id });
  const reservedAt = (i, j, k) => g.world.reserved.has(idx(i, j, k));
  const inputs = () => ({ fwd: 0, back: 0, left: 0, right: 0, sprint: false, crouch: false, jump: false });
  const stats = () => ({ walk: g.T.walk, crouchMul: g.T.crouchMul, jump: g.T.jump });
  // run the real player for `sec` seconds (the game loop is not involved: a launch needs the host tick, so call TR.hostTick yourself when you want it)
  const stepPlayer = (sec, dt = 1 / 60, each) => { const n = Math.round(sec / dt); for (let q = 0; q < n; q++) { g.time += dt; p().update(dt, inputs(), stats(), g.sim); if (each && each(q)) return q; } return n; };
  const json = (m) => JSON.parse(JSON.stringify(m));
  return { K, P, C, idx, clean, setup, clearCol, powerAt, powerCab, make, door, doorCells, closedCells, openCells, lift, frame, block, dig, shaftDig, tunnel, ledge, poke, platform, unplatform, jump, cushion, decon, reservedAt, inputs, stats, stepPlayer, ents, json, cellX, cellZ, toI, toK, V3, adv, craft, plan, p, w, S, L, g };
}
