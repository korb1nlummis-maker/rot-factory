// Shared fixtures for the stacked building tests (wave 10). No default export, so the test loader skips it. Every test named `stack.` or `mp.stack.` starts in a fresh world
// (WORLD_TESTS in selftest.js), so a sealed box of plush can be carved freely.
import * as ST from '../stack.js';
import * as B from '../build.js';
import { PAD } from '../plushdata.js';

export const UP = { timber: 1, steel: 1, concrete: 1, rebar: 1, titan: 1, carbon: 1, plasma: 1, voidl: 1, neutron: 1, power: 1, belts: 1, fans: 1, mfan: 1, shellPads: 1, shellRamps: 1, shellLevel: 1, stackKit: 1, beltLift: 1, beltMotors: 3 };

export function kit(ctx) {
  const { g, S, w, p, L, fresh, spot, craft, selectTool, plan, placeNow, aimPoint, adv, stepSim, toI, toJ, toK, cellX, cellY, cellZ, V3, THREE, capacityOf, loadOn } = ctx;
  const C = 0.6, M = () => g.machines, W = () => g.world;
  const idx = (i, j, k) => (j * 16384 + k) * 16384 + i;
  const solid = (i0, k0, nx, nz, nj, j0 = 0) => { for (let i = i0; i < i0 + nx; i++) for (let k = k0; k < k0 + nz; k++) for (let j = j0; j < j0 + nj; j++) W().setCell(i, j, k, 2, 0); };
  const dig = (i, j, k, ni, nj, nk, queue = false) => { for (let a = 0; a < ni; a++) for (let b = 0; b < nj; b++) for (let c = 0; c < nk; c++) if (W().get(i + a, j + b, k + c) && W().get(i + a, j + b, k + c) !== PAD) W().removeCell(i + a, j + b, k + c, queue); };
  const count = (i, j, k, ni, nj, nk, sp) => { let n = 0; for (let a = 0; a < ni; a++) for (let b = 0; b < nj; b++) for (let c = 0; c < nk; c++) { const s = W().get(i + a, j + b, k + c); if (sp === undefined ? !!s : s === sp) n++; } return n; };
  const cube = (kind, m, lo, j0, axis = 'x') => { const e = M().frameEnt(axis, kind, m, lo, j0); delete e.clear; const ent = { id: g.nextId(), type: 'frame', ...e }; S().entities.push(ent); g.addEntity(ent); return ent; };
  const support = (ent) => W().supports.find((s) => s.id === ent.id);
  const ratio = (ent, parts) => { const s = support(ent); return ctx.totalRatio ? ctx.totalRatio(W(), s, [], parts) : 0; };
  // a sealed box of plush with an approach tunnel (4 wide, 4 high, from the west) that ends at the shaft where the cubes go. Returns the corner of the shaft's first cell.
  const yard = (o = {}) => {
    fresh(o.up || UP); craft && 0;
    const sp = spot(o.lane ?? 12), nj = o.rows ?? 34, i0 = sp.i + 8 + (o.dx ?? 0), k0 = sp.k - 14;
    solid(i0, k0, o.nx ?? 52, o.nz ?? 28, nj);
    const m = i0 + 12, lo = k0 + 10;
    dig(i0 + 3, 0, lo, 9, 4, 4);                       // the approach tunnel, west of the shaft
    dig(m, 0, lo, 4, 4 * (o.levels ?? 1), 4);          // the shaft: one section per level
    if (o.east) dig(m + 4, 0, lo, 6, 4, 4);            // and a way out on the far side
    return { i0, k0, m, lo, nj };
  };
  const stack = (Y, kinds) => kinds.map((k, n) => cube(k, Y.m, Y.lo, 4 * n));
  const mid = (c) => ({ x: c.cx, z: c.cz });
  // put the player inside a bay, at its floor, looking down (role f) or up (role c), turned to face a quarter od
  const YAW = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
  const stand = (c, o = {}) => {
    p().pos.set(o.x ?? c.cx, o.y ?? c.y0, o.z ?? c.cz); p().vel.set(0, 0, 0);
    p().yaw = YAW[(o.od ?? 0) & 3]; p().pitch = o.pitch ?? -1.0; g._bRot = 0; g._bn = 0;
  };
  const planPad = async (c, role, op = 0, od = 0, mk = 'steel') => {
    craft('pad:' + mk, 1); selectTool('pad:' + mk); g._sOpen = op; stand(c, { od, pitch: role === 'f' ? -1.0 : 1.0 });
    const pl = await plan(); return pl;
  };
  const putPlate = async (c, role, op = 0, od = 0, mk = 'steel') => {
    const pl = await planPad(c, role, op, od, mk); if (!pl || !pl.ok) return { ok: false, why: pl && pl.why };
    const n0 = S().entities.length, n = placeNow(); const e = S().entities.slice(n0).find((q) => q.type === 'pad');
    return { ok: n === 1 && !!e, e, n };
  };
  const planStair = async (c, od = 0) => {
    craft('stair', 2); selectTool('stair'); stand(c, { od, pitch: -0.5 });
    return plan();
  };
  const putStair = async (c, od = 0) => {
    const pl = await planStair(c, od); if (!pl || !pl.ok) return { ok: false, why: pl && pl.why };
    const n0 = S().entities.length; g.placeCurrent(g.curTool()); const made = S().entities.slice(n0);
    return { ok: made.length === 2, made, pl };
  };
  const inputs = (o = {}) => ({ fwd: 0, back: 0, left: 0, right: 0, sprint: false, crouch: false, jump: false, ...o });
  const stats = () => ({ walk: g.T.walk, crouchMul: g.T.crouchMul, jump: g.T.jump });
  // run the real player for sec seconds with the given keys held (the game loop is not involved)
  const walk = (sec, inp = {}, each, dt = 1 / 60) => { const n = Math.round(sec / dt); for (let q = 0; q < n; q++) { g.time += dt; p().update(dt, inputs(inp), stats(), g.sim); if (each && each(q)) return q; } return n; };
  const tick = (sec = 0.1) => adv(sec);   // the game loop once (installs the player hooks)
  // look at a point in the world from a spot `back` metres before it on the floor you stand on (feet at fy)
  const aimAt = (x, y, z, back = 1.0, fy = 0.62) => { aimPoint(x, y, z, back); p().pos.y = fy; const e = p().eyePos(new V3()); const dx = x - e.x, dy = y - e.y, dz = z - e.z; p().yaw = Math.atan2(dx, dz); p().pitch = Math.atan2(dy, Math.hypot(dx, dz)); };
  const parts = (c) => ST.partsOf(g, c.id);
  const plates = (c) => ST.partsOf(g, c.id).filter((e) => e.type === 'pad');
  const roofLoad = (c) => { const s = support(c), pr = {}; const t = ctx.totalLoad(W(), s, [], pr); return { t, own: pr.own, above: pr.above, cap: s.cap }; };
  const rows = (i, k, ni, nk, j0, j1) => { const out = []; for (let j = j1; j >= j0; j--) { let s = ''; for (let kk = k; kk < k + nk; kk++) { for (let ii = i; ii < i + ni; ii++) { const q = W().get(ii, j, kk); s += q === PAD ? 'P' : q ? '#' : '.'; } s += ' '; } out.push(String(j).padStart(2) + ' ' + s); } return out.join('\n'); };
  return { aimAt, C, M, W, idx, solid, dig, count, cube, support, yard, stack, mid, stand, planPad, putPlate, planStair, putStair, inputs, stats, walk, tick, parts, plates, roofLoad, rows, YAW, ST, B, PAD, g, S, w, p, L, fresh, spot, craft, selectTool, plan, placeNow, aimPoint, adv, stepSim, toI, toJ, toK, cellX, cellY, cellZ, V3, THREE, capacityOf, loadOn, ratio };
}
