// Wave 10: stacked modular building inside the pile.
//
// A frame cube is a 4 x 4 x 4 cell bay. This file is everything that turns bays into a building:
//  * plates: a Floor Pad (build.js) aimed into a cube snaps to it as a FLOOR plate (the bottom row) or a CEILING plate (the top row), in three openings
//    (full, landing = half a plate, shaft = a 2 x 2 corner hole). A level is one plate row and three clear rows (1.8 m: the Mine Rail cart, belts, lifts and
//    you fit exactly like in a plain cube tunnel, whose clear section is 3 x 3 cells).
//  * the switchback stair: two stair flights (build.js stairs, one item each) side by side in the opening of a landing plate, from one level to the next.
//  * ladders: a 1 x 1 x 4 climbable column in the corner of a shaft opening.
//  * load: a cube on a cube is one column (loadtrace.js totalLoad); a cube that loses what it stood on falls with it; the hammer refuses to take a cube
//    out from under what stands on it or what is built in it.
// Everything here is a plain module (no game imports), like build.js: catalog_stack.js registers it. The host owns the world; a guest only ever asks.
import { C, NX, NY, NZ, cellX, cellY, cellZ, toI, toJ, toK } from './config.js';
import { PAD, BULK } from './plushdata.js';
import * as B from './build.js';
import { holeRails } from './stackmesh.js';
import { totalLoad, restOf, restingOn, capacityOf, WARN_AT } from './loadtrace.js';
import { FRAME_TYPES } from './upgrades.js';

export const UNLOCK = 14000000;     // the Stacked Building upgrade (catalog_stack.js), sized for the 10M+ wallets of the late game
export const OPENINGS = B.OPENINGS.map((o, n) => ({ ...o, name: ['Full plate', 'Landing', 'Shaft plate'][n] }));
export const LEVEL = 4;                 // rows per level: one plate row and three clear rows
export const NAMES = ['Full plate', 'Landing', 'Shaft plate'];
const bkey = (i, j, k) => (j * 16384 + k) * 16384 + i;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
export const unlocked = (g) => !!(g.T && g.T.stackKit);
// hold Ctrl and a pad, stair or wall aimed into a cube is the plain piece again (the world grid, no snapping to the bay)
export const plain = (g) => !!(g.keys && (g.keys.ControlLeft || g.keys.ControlRight));

// ======================================================================================================
// cubes: the grid frames that carry a cell block (machines.js cubeBlk puts it on the support)
// ======================================================================================================
export function cubes(g) { const out = []; for (const s of g.world.supports) if (s.blk && typeof s.id === 'number') out.push(s); return out; }
export const cubeById = (g, id) => { for (const s of g.world.supports) if (s.id === id && s.blk) return s; return null; };
export const cubeEnt = (g, s) => { const it = s && g.machines.items.get(s.id); return it ? it.ent : null; };
// the cube whose block holds cell (i, j, k), or null
export function cubeAt(g, i, j, k) {
  const w = g.world;
  const last = w.supports[w.supports.length - 1];   // (see loadtrace.js stackIndex: a pushed and popped stand-in keeps the same list and length)
  if (w._scSig !== w.supports || w._scLen !== w.supports.length || w._scLast !== last || w._scVer !== (w.stackVer || 0)) {
    const m = new Map();
    for (const s of w.supports) { const b = s.blk; if (!b) continue; for (let jj = b.j0; jj <= b.j1; jj++) for (let kk = b.k0; kk <= b.k1; kk++) for (let ii = b.i0; ii <= b.i1; ii++) m.set(bkey(ii, jj, kk), s); }
    w._sc = m; w._scSig = w.supports; w._scLen = w.supports.length; w._scLast = last; w._scVer = w.stackVer || 0;
  }
  return w._sc.get(bkey(i, j, k)) || null;
}
// the cubes standing on s, and the cubes s stands on (direct neighbours in the column), as supports
export const above = (g, s) => [...restingOn(g.world, s).keys()];
export const below = (g, s) => [...restOf(g.world, s).cubes.keys()];
// every cube of the column s belongs to, bottom first (follows the cubes that stand on or under it; a cube standing on two columns joins them)
export function column(g, s) {
  const seen = new Set([s]), todo = [s];
  while (todo.length) { const c = todo.pop(); for (const n of [...above(g, c), ...below(g, c)]) if (!seen.has(n)) { seen.add(n); todo.push(n); } }
  return [...seen].sort((a, b) => a.blk.j0 - b.blk.j0);
}

// ---- parts: what is built into a cube (plates, stairs, ladders carry `bay`: the id of the cube)
export function partsOf(g, id) { const out = []; for (const it of g.machines.items.values()) if (it.ent.bay === id) out.push(it.ent); return out; }
export const plateOf = (g, id) => partsOf(g, id).find((e) => e.type === 'pad') || null;

// ======================================================================================================
// aiming into a bay: which cube and which plate (floor or ceiling) a crosshair means
// ======================================================================================================
// march the ray; the first cube the ray is inside (open air of its section) is the bay, and how it leaves the cube decides the plate: looking down is the floor, looking up is the ceiling
export function bayAim(g, eye, dir, reach = 6) {
  const w = g.world; let bay = null, last = null;
  for (let t = 0.15; t < reach; t += 0.07) {
    const i = toI(eye.x + dir.x * t), j = toJ(eye.y + dir.y * t), k = toK(eye.z + dir.z * t);
    if (j < 0 || j >= NY) break;
    const cb = cubeAt(g, i, j, k);
    if (!bay) { if (cb && !w.solid(i, j, k)) { bay = cb; last = { i, j, k }; } else if (w.solid(i, j, k)) break; continue; }
    if (cb !== bay) break;
    last = { i, j, k };
    if (w.solid(i, j, k)) break;
  }
  if (!bay) return null;
  const b = bay.blk;
  let role;
  if (dir.y < -0.12) role = 'f'; else if (dir.y > 0.12) role = 'c'; else role = last.j - b.j0 >= 2 ? 'c' : 'f';
  // looking up out of a cube that already has its plate, into the cube stacked on it: that cube's floor is what you mean
  if (role === 'c' && dir.y > 0.12 && plateOf(g, bay.id)) {
    for (let t = 0.15; t < reach + 3; t += 0.07) {
      const i = toI(eye.x + dir.x * t), j = toJ(eye.y + dir.y * t), k = toK(eye.z + dir.z * t);
      const cb = cubeAt(g, i, j, k);
      if (cb && cb !== bay && cb.blk.j0 === b.j1 + 1 && cb.blk.i0 === b.i0 && cb.blk.k0 === b.k0) return { cube: cb, role: 'f', at: { i, j, k } };
      if (w.solid(i, j, k) && !cb) break;
    }
  }
  return { cube: bay, role, at: last };
}

// ======================================================================================================
// the one rule for a piece that belongs to a cube (build.js checkPiece calls it for any piece with `bay`)
// ======================================================================================================
export function checkBay(g, p, o = {}) {
  const c = cubeById(g, p.bay); if (!c) return 'That cube is gone';
  const b = c.blk;
  if (p.type === 'pad') {
    if (p.i0 !== b.i0 || p.k0 !== b.k0) return 'A plate lines up with its cube';
    if (p.ro !== 'f' && p.ro !== 'c') return 'A plate is a floor or a ceiling';
    if (p.j !== (p.ro === 'f' ? b.j0 : b.j1)) return 'A plate goes in the bottom or the top row of its cube';
    if (!int(p.op ?? 0, 0, 2) || !int(p.od ?? 0, 0, 3)) return 'Bad opening';
    for (const e of partsOf(g, p.bay)) if (e.type === 'pad' && e !== o.self && e.id !== p.id) return 'This cube already has a plate: a level is one plate row and three clear rows';
    { const f = footing(g, c); if (f.hang > 8) return 'This cube hangs over a void: a floor needs the ground or a cube under at least half of it'; }   // a floor over nothing is refused
    // a ceiling plate and a floor plate would leave 2 clear rows: nobody could stand
    for (let jj = b.j0; jj <= b.j1; jj++) for (let kk = b.k0; kk <= b.k1; kk++) for (let ii = b.i0; ii <= b.i1; ii++) {
      const s = g.world.get(ii, jj, kk);
      if (s && s !== PAD && jj !== p.j && !(s === BULK && ownWallCell(g, p, ii, jj, kk))) return 'Dig this cube out first: it still has plush inside';   // (a door frame of this cube is not plush)
    }
    return null;
  }
  if (p.type === 'wall') {
    if (p.j !== b.j0) return 'A door frame starts at the bottom row of its cube';
    const onX = p.ax === 'z' && p.k0 === b.k0 && (p.i0 === b.i0 || p.i0 === b.i1), onZ = p.ax === 'x' && p.i0 === b.i0 && (p.k0 === b.k0 || p.k0 === b.k1);
    return onX || onZ ? null : 'A door frame stands on the outer layer of its cube';
  }
  if (p.type === 'stair' || p.type === 'wramp') {
    if (p.i0 < b.i0 || p.i0 + (((p.dir | 0) & 1) ? p.w : p.len) - 1 > b.i1 || p.k0 < b.k0 || p.k0 + (((p.dir | 0) & 1) ? p.len : p.w) - 1 > b.k1) return 'A stair flight stays inside its cube';
    if (p.j < b.j0 || p.j > b.j1 + 1) return 'A stair flight starts in the bottom half of the stack';
    if (p.mod === 'u' && p.j === levelRow(g, c)) {   // the first flight's foot needs a floor: the ground, or the plate (not the opening of one)
      const d = p.dir | 0, li = d === 2 ? p.i0 + p.len - 1 : p.i0, lk = d === 3 ? p.k0 + p.len - 1 : p.k0;
      if (!g.world.solid(li, p.j - 1, lk)) return 'The foot of the stair stands over an opening: it needs a floor';
    }
    return null;
  }
  return null;
}

// what holds a cube up: { ground, cubes, hang } cells of its 16 (hang = cells over nothing)
export function footing(g, c) { const r = restOf(g.world, c); return { ground: r.ground, cubes: [...r.cubes.values()].reduce((a, b) => a + b, 0), hang: r.hang }; }

// ======================================================================================================
// plates
// ======================================================================================================
export function currentOpening(g) { return (g._sOpen | 0) % 3; }
export function cycleOpening(g, d) { g._sOpen = (((g._sOpen | 0) + d) % 3 + 3) % 3; return g._sOpen; }
const faceOf = (g, yaw) => B.faceDir(g, yaw);

export function planBayPad(g, tool, eye, dir, yaw) {
  if (!unlocked(g) || plain(g)) return null;
  const a = bayAim(g, eye, dir); if (!a) return null;
  const mk = B.kindFromId(tool.id, 'timber'), c = a.cube, b = c.blk, op = currentOpening(g), od = faceOf(g, yaw);
  const piece = { type: 'pad', mk, i0: b.i0, k0: b.k0, j: a.role === 'f' ? b.j0 : b.j1, bay: c.id, ro: a.role, op, od };
  const why = B.checkPiece(g, piece);
  const ent = { ...piece, zoop: [[b.i0, b.k0]], snap: a.role === 'f' ? 'floor plate of the cube' : 'ceiling plate of the cube' };
  const price = B.padPrice(mk) * 3;
  const lines = [a.role === 'f' ? `Floor plate: the level is this plate and the 3 clear cells over it (top at ${((piece.j + 1) * C).toFixed(1)} m)` : 'Ceiling plate: it closes the cube under the roof and is the floor of whatever stands on it',
    `${NAMES[op]}${op ? ': ' + B.OPENINGS[op].holes + ' open cells' : ''}. <kbd>-</kbd> <kbd>=</kbd> change the opening, <kbd>R</kbd> turns it`, why ? why : `About ${money(price)}, one ${B.KIND_NAME[mk]} Pad from your pack`];
  g._xInfo = { t: g.time + 0.35, title: `${NAMES[op].toUpperCase()}${a.role === 'f' ? ' (FLOOR)' : ' (CEILING)'}`, lit: !why, lines };
  if (why) return { plan: { ok: false, why, ent }, cost: 0 };
  return { plan: { ok: true, ent }, cost: price };
}
const money = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n)));

// ======================================================================================================
// the switchback stair: two flights of the ordinary Stair, side by side in the opening of a landing plate
// ======================================================================================================
// turn a cell of the bay (0..3 each way) by od quarters, the way holeAt does
export const turnCell = (x, z, od) => { for (let q = 0; q < (od & 3); q++) { const nx = 3 - z, nz = x; x = nx; z = nz; } return [x, z]; };
// the two flights for a bay: [{ ..., j, dir }] bottom flight first. Base turn: the opening is the +x strip (cells x 2 and 3); flight A climbs +z in column 3, flight B comes back -z in column 2.
export function stairFlights(b, od, jb, mk, type = 'stair') {
  const base = [{ x: 3, dir: 1, j: jb }, { x: 2, dir: 3, j: jb + 2 }], out = [];
  for (const f of base) {
    const cells = [0, 1, 2, 3].map((z) => turnCell(f.x, z, od));
    out.push({ type, mod: 'u', mk, i0: b.i0 + Math.min(...cells.map((c) => c[0])), k0: b.k0 + Math.min(...cells.map((c) => c[1])), j: f.j, dir: (f.dir + od) & 3, w: 1, len: 4, rise: 2 });
  }
  return out;
}
// the row the first flight starts on: on top of a floor plate, or on the ground of a bay without one
export function levelRow(g, c) { const p = plateOf(g, c.id); return p && p.ro === 'f' ? c.blk.j0 + 1 : c.blk.j0; }

export function planBayStair(g, tool, eye, dir, yaw) {
  if (!unlocked(g) || plain(g)) return null;
  const a = bayAim(g, eye, dir); if (!a) return null;
  const type = tool.kind === 'wramp' ? 'wramp' : 'stair', word = type === 'stair' ? 'stair' : 'ramp';
  const c = a.cube, b = c.blk, od = faceOf(g, yaw), jb = levelRow(g, c), mk = B.bestKind(g.T && g.T.frames);
  const flights = stairFlights(b, od, jb, mk, type).map((f) => ({ ...f, bay: c.id }));
  const have = g.S.items[tool.id] || 0;
  let why = null;
  for (const f of flights) { why = B.checkPiece(g, f); if (why) break; }
  if (!why && have < 2) why = `A switchback ${word} is two flights: you need 2 ${word}s, you have ${have}`;
  const ent = { type, mk, i0: b.i0, k0: b.k0, j: jb, od, bay: c.id, mod: 'u', zoop: flights.map((f) => [f.i0, f.k0]), dir: flights[0].dir, w: 1, len: 4, rise: 2, snap: `switchback ${word} in the cube` };
  const price = B.pricePer(type, tool.id, mk) * 3 * 2;
  g._xInfo = { t: g.time + 0.35, title: `SWITCHBACK ${word.toUpperCase()}`, lit: !why, lines: [`Two flights side by side: up one, step across, up the other. It climbs one whole level (2.4 m)`, 'It needs a landing plate (or no plate) in the cube above, so the way up is open', why ? why : `About ${money(price)}, two ${word}s from your pack. <kbd>R</kbd> turns it`] };
  if (why) return { plan: { ok: false, why, ent }, cost: 0 };
  return { plan: { ok: true, ent }, cost: price };
}

// the host's rebuild of a plate or a stair module from what a guest sent: never from its numbers. Returns [pieces] or null.
export function bayPieces(g, type, rid, e, list) {
  if (!unlocked(g)) return null;
  if (!Array.isArray(list) || list.length < 1 || list.length > 2) return null;
  const i0 = e.i0, k0 = e.k0, j = e.j;
  if (!int(i0, 0, NX - 1) || !int(k0, 0, NZ - 1) || !int(j, 0, NY - 1)) return null;
  const c = cubeAt(g, i0, j, k0) || cubeAt(g, i0, j - 1, k0); if (!c || (type !== 'wall' && (c.blk.i0 !== i0 || c.blk.k0 !== k0))) return null;
  const b = c.blk;
  if (type === 'pad') {
    const mk = B.kindFromId(rid, null); if (!mk || list.length !== 1) return null;
    const op = e.op === undefined ? 0 : e.op, od = e.od === undefined ? 0 : e.od; if (!int(op, 0, 2) || !int(od, 0, 3)) return null;
    const ro = j === b.j0 ? 'f' : j === b.j1 ? 'c' : null; if (!ro) return null;
    return [{ type: 'pad', mk, i0, k0, j, bay: c.id, ro, op, od }];
  }
  if (type === 'wall') {
    if (rid !== 'wall' || (e.ax !== 'x' && e.ax !== 'z') || list.length !== 1) return null;
    const piece = { type: 'wall', mk: 'timber', ax: e.ax, i0, k0, j: b.j0, bay: c.id };
    return j === b.j0 && !checkBay(g, piece) ? [piece] : null;
  }
  if (type === 'stair' || type === 'wramp') {
    if (rid !== type || e.mod !== 'u' || !int(e.od, 0, 3)) return null;
    const jb = levelRow(g, c); if (j !== jb) return null;
    return stairFlights(b, e.od, jb, B.bestKind(g.T && g.T.frames), type).map((f) => ({ ...f, bay: c.id }));
  }
  return null;
}

// ======================================================================================================
// door frames: a Wall Section on the outer layer of a cube (a face of its 4 x 4 x 4 section). Where a plate is in that layer the wall takes its edge cells, and gives them back.
// A Door (transit.js) replaces the wall as ever: its leaf slides up in the three clear rows, the plate's edge stays as the sill.
// ======================================================================================================
export function wallLayer(c, dir, eye) {
  const b = c.blk, faces = [{ n: [1, 0], ax: 'z', i0: b.i1, k0: b.k0 }, { n: [0, 1], ax: 'x', i0: b.i0, k0: b.k1 }, { n: [-1, 0], ax: 'z', i0: b.i0, k0: b.k0 }, { n: [0, -1], ax: 'x', i0: b.i0, k0: b.k0 }];
  const hl = Math.hypot(dir.x, dir.z) || 1; let best = faces[0], bd = -2;
  for (const f of faces) { const d = (f.n[0] * dir.x + f.n[1] * dir.z) / hl; if (d > bd) { bd = d; best = f; } }
  return best;
}
export function planBayWall(g, tool, eye, dir, yaw) {
  if (!unlocked(g) || plain(g)) return null;
  const a = bayAim(g, eye, dir); if (!a) return null;
  const c = a.cube, b = c.blk, f = wallLayer(c, dir, eye);
  const piece = { type: 'wall', mk: 'timber', ax: f.ax, i0: f.i0, k0: f.k0, j: b.j0, bay: c.id };
  const why = B.checkPiece(g, piece);
  const ent = { ...piece, zoop: [[f.i0, f.k0]], snap: 'door frame in the cube' };
  const price = B.pricePer('wall', 'wall', 'timber') * 3;
  g._xInfo = { t: g.time + 0.35, title: 'DOOR FRAME', lit: !why, lines: ['A wall section on the face of the cube you look at: 4 wide, 4 high, from the floor of its level', 'A Door replaces it (aim the Door at it). Where the cube has a plate, the wall takes the plate\'s edge cells and the plate keeps its sill', why ? why : `About ${money(price)}`] };
  return why ? { plan: { ok: false, why, ent }, cost: 0 } : { plan: { ok: true, ent }, cost: price };
}
// is this PAD cell part of the plate of the cube the wall piece belongs to? (the wall may stand on it)
export function ownPlateCell(g, p, i, j, k) { const o = B.ownerAt(g, i, j, k); return !!o && o.type === 'pad' && o.bay === p.bay; }
// is this bulkhead cell part of a door frame of the cube the plate belongs to? (a plate laid after the frame stands round it)
export function ownWallCell(g, p, i, j, k) { const o = B.ownerAt(g, i, j, k); return !!o && o.type === 'wall' && o.bay === p.bay; }
// a door frame came down: the plate it stood on gets its edge cells back
export function afterWall(g, e) {
  for (const P of partsOf(g, e.bay)) if (P.type === 'pad') {
    for (const [i, j, k] of B.cellsOf(P)) if (!g.world.get(i, j, k)) { g.world.setCell(i, j, k, PAD, B.cellVr(P)); g.world.stabQueue.push({ i, j, k }); }
    B.reRegister(g, P);
  }
}

// ======================================================================================================
// what stands on what: the hammer, a buckled cube, a cube that loses its footing
// ======================================================================================================
// a reason the hammer must refuse to take this ent down, or null
export function deconBlock(g, e) {
  if (!e || e.type !== 'frame') return null;
  const c = cubeById(g, e.id); if (!c) return null;
  const up = above(g, c); if (up.length) return `A cube stands on this one: take the cube above down first (${up.length} on it)`;
  const parts = partsOf(g, e.id);
  if (parts.length) { const n = {}, nm = { pad: 'plate', stair: 'stair', wramp: 'ramp', wall: 'door frame', ladder: 'ladder', door: 'door' }; for (const q of parts) n[nm[q.type] || q.type] = (n[nm[q.type] || q.type] || 0) + 1; return `Take down what is built into this cube first (${Object.entries(n).map(([k, v]) => v + ' ' + k + (v > 1 ? 's' : '')).join(', ')})`; }
  return null;
}
// call BEFORE the cube leaves w.supports: the cubes that stand on it
export function beforeGone(g, s) { return s && s.blk ? above(g, s) : []; }
// call after: every cube that stood on it and no longer holds at least half its footprint on something falls too. Returns the supports it set falling.
export function afterGone(g, uppers) {
  const out = [], w = g.world;
  for (const u of uppers) {
    if (!w.supports.includes(u)) continue;
    const r = restOf(w, u), held = r.ground + [...r.cubes.values()].reduce((a, b) => a + b, 0);
    if (held >= 8) continue;
    out.push(u);
  }
  return out;
}
// a cube that was falling when the game was saved (its entity is marked `fell`) is still falling after the load: what held it is gone for good
export function resumeFalls(g) {
  if (typeof g.isGuest === 'function' && g.isGuest()) return;
  for (const it of g.machines.items.values()) { const e = it.ent; if (e.type === 'frame' && e.fell && !e.view) { const s = cubeById(g, e.id); if (s) g.forceFall(s, true); } }
}
// what a cube that falls takes with it: the plates, stairs and ladders built into it (lost, like the frame, and the cells go back to the pile as empty air)
export function dropParts(g, id) { const out = partsOf(g, id); return out; }

// ======================================================================================================
// would a new cube overload the cubes under it? (the cube itself is judged by strainOf; this is the column below it)
// ======================================================================================================
export function cubeWhy(g, e, kind) {
  const w = g.world, ft = FRAME_TYPES[kind]; if (!ft || !e || e.turned) return null;
  const blk = g.machines.cubeBlk(e); if (!blk) return null;
  const hyp = { x: e.cx, y: e.y0 + e.h / 2, z: e.cz, r: ft.radius, kind, cap: capacityOf(kind), id: 'hyp', blk };
  const r = restOf(w, hyp); if (!r.cubes.size) return null;   // not on a cube: nothing under it to overload
  const total = totalLoad(w, hyp), held = r.ground + [...r.cubes.values()].reduce((a, b) => a + b, 0);
  // push the new cube's whole load down the column. A cube is judged once, highest first, with the sum of what reached it: in a wall laid like bricks every cube
  // rests on two cubes, so following each way down would visit 2 to the power of the height of them
  const memo = new Map(), add = new Map(), todo = new Set(); let worst = null;
  const feed = (s, d) => { add.set(s, (add.get(s) || 0) + d); todo.add(s); };
  for (const [l, n] of r.cubes) feed(l, total * n / Math.max(1, held));
  while (todo.size) {
    let s = null; for (const q of todo) if (!s || q.blk.j0 > s.blk.j0) s = q;   // every cube above s is done, so what s was handed is complete
    todo.delete(s); const delta = add.get(s), cap = s.cap === undefined ? capacityOf(s.kind) : s.cap;
    if (isFinite(cap)) { const ratio = (totalLoad(w, s, [], null, memo) + delta) / cap; if (ratio > 1 && (!worst || ratio > worst.ratio)) worst = { s, ratio }; }
    const rr = restOf(w, s), hh = rr.ground + [...rr.cubes.values()].reduce((a, b) => a + b, 0);
    for (const [l, n] of rr.cubes) feed(l, delta * n / Math.max(1, hh));
  }
  return worst ? `The cube under it would carry ${Math.round(worst.ratio * 100)}% of what it can bear: put a stronger cube under the stack, or fewer cubes on it` : null;
}

// ======================================================================================================
// ladders: a hatch ladder hangs on the rim of a plate's opening. It stands in the opening cell next to a plate cell (the one it faces), one level high (4 rows), with a rail
// above the floor you step onto. W or Space climbs, S goes down; at the top keep pressing W and you step onto the plate.
// ======================================================================================================
export const LADDER_H = 4;
const idxOf = (i, j, k) => (j * NZ + k) * NX + i;
const DX = B.DX, DZ = B.DZ;
export function ladders(g) { if (g._ladW !== g.world || !g._lad) { g._ladW = g.world; g._lad = new Map(); } return g._lad; }
export const ladderCells = (L) => { const out = []; for (let r = 0; r < LADDER_H; r++) out.push([L.i, L.j + r, L.k]); return out; };
export const ladderPrice = (mk) => Math.max(6, Math.round(B.padPrice(mk) * 0.35));

// null when a ladder can hang at L = { i, k, j (the row its foot is on), dir (the way it faces: toward the plate cell it climbs to) }, else why not
export function checkLadder(g, L, o = {}) {
  const w = g.world;
  if (!int(L.i, 0, NX - 1) || !int(L.k, 0, NZ - 1) || !int(L.j, 1, NY - 8) || !int(L.dir, 0, 3)) return 'Bad ladder';
  const ci = L.i + DX[L.dir], ck = L.k + DZ[L.dir], jt = L.j + LADDER_H - 1;
  if (w.get(ci, jt, ck) !== PAD) return 'A ladder hangs on the rim of a plate opening: aim at the edge of one';
  const P = B.ownerAt(g, ci, jt, ck); if (!P || P.type !== 'pad' || P.bay === undefined) return 'A ladder hangs on a plate built into a cube';
  if (!cubeById(g, P.bay)) return 'That cube is gone';
  if (!w.solid(L.i, L.j - 1, L.k)) return 'Nothing to stand on at the foot of the ladder';
  for (let r = 0; r < LADDER_H + 3; r++) {
    const key = idxOf(L.i, L.j + r, L.k);
    if (w.get(L.i, L.j + r, L.k)) return r < LADDER_H ? 'The opening is not clear: something is in the way of the ladder' : 'Not enough headroom above the plate';
    if (w.reserved.has(key) || g.logi.tiles.has(key)) return 'Something is in the way (a belt or machine)';
  }
  for (const [i, j, k] of [[L.i, L.j, L.k]]) void [i, j, k];
  for (const e of ladders(g).values()) if (e !== o.self && e.i === L.i && e.k === L.k && Math.abs(e.j - L.j) < LADDER_H) return 'A ladder is already here';
  const x0 = cellX(L.i) - C / 2, z0 = cellZ(L.k) - C / 2, yb = L.j * C, yt = (L.j + LADDER_H) * C;
  if (!o.skipPlayer) void [x0, z0, yb, yt];
  return null;
}
export function planLadder(g, tool, eye, dir) {
  const bad = (why, ent) => ({ plan: { ok: false, why, ent }, cost: 0 });
  if (!unlocked(g)) return bad('Stacked Building is not unlocked');
  const a = B.aimCells(g, eye, dir, 6);
  if (!a || !a.hit || a.hit.j < 0 || a.sp !== PAD) return bad('Aim at the edge of a plate opening: the ladder hangs on it');
  const H = a.hit, P = B.ownerAt(g, H.i, H.j, H.k);
  if (!P || P.type !== 'pad' || P.bay === undefined) return bad('A ladder hangs on a plate built into a cube');
  // the opening cell beside the aimed plate cell that is nearest where you look
  let best = null, bd = 1e9;
  for (let d = 0; d < 4; d++) {
    const hi = H.i + DX[d], hk = H.k + DZ[d]; if (g.world.get(hi, H.j, hk)) continue;
    const dd = Math.hypot(hi - a.last.i, hk - a.last.k) + (hi === a.last.i && hk === a.last.k ? -1 : 0);
    if (dd < bd) { bd = dd; best = { i: hi, k: hk, dir: (d + 2) & 3 }; }
  }
  if (!best) return bad('No opening beside this part of the plate: aim at the rim of the hole');
  const ent = { type: 'ladder', i: best.i, k: best.k, j: H.j - (LADDER_H - 1), dir: best.dir, mk: B.bestKind(g.T && g.T.frames), bay: P.bay };
  const why = checkLadder(g, ent);
  const price = ladderPrice(ent.mk) * 3;
  g._xInfo = { t: g.time + 0.35, title: 'LADDER', lit: !why, lines: ['Hangs on the rim of the opening and climbs one level (2.4 m)', why ? why : `About ${money(price)}. W or Space climbs, S goes down, keep pressing W at the top to step onto the plate`] };
  return why ? bad(why, ent) : { plan: { ok: true, ent }, cost: price };
}
export function buildLadder(g, tool, e) {
  if (!e || typeof e !== 'object' || !int(e.i, 0, NX - 1) || !int(e.k, 0, NZ - 1) || !int(e.j, 1, NY - 8) || !int(e.dir, 0, 3)) return null;
  const ci = e.i + DX[e.dir], ck = e.k + DZ[e.dir], jt = e.j + LADDER_H - 1;
  const P = B.ownerAt(g, ci, jt, ck); if (!P || P.type !== 'pad' || P.bay === undefined) return null;
  const L = { type: 'ladder', i: e.i, k: e.k, j: e.j, dir: e.dir, mk: B.bestKind(g.T && g.T.frames), bay: P.bay };
  if (checkLadder(g, L)) return null;
  return L;
}
export function conflictLadder(g, e) { if (!unlocked(g)) return 'Stacked Building is not unlocked'; if (!e || typeof e !== 'object') return 'Bad ladder'; const L = { i: e.i, k: e.k, j: e.j, dir: e.dir }; if (checkLadder(g, L)) return checkLadder(g, L); const ci = e.i + DX[e.dir], ck = e.k + DZ[e.dir]; const P = B.ownerAt(g, ci, e.j + LADDER_H - 1, ck); return P && P.type === 'pad' && P.bay !== undefined ? null : 'A ladder hangs on a plate built into a cube'; }
export function addLadder(machines, e, mesh) {
  const g = machines.game, w = g.world;
  e.x = cellX(e.i); e.z = cellZ(e.k); e.y = e.j * C; e.h = LADDER_H * C; e.y0 = e.y; e.hr = 0.6;
  const obj = mesh(e); obj.position.set(e.x, e.y, e.z);
  for (const [i, j, k] of ladderCells(e)) w.reserved.add(idxOf(i, j, k));
  ladders(g).set(e.id, e);
  return { obj };
}
export function removeLadder(g, e) {
  const w = g.world;
  for (const [i, j, k] of ladderCells(e)) w.reserved.delete(idxOf(i, j, k));
  ladders(g).delete(e.id);
}
// player.climb: called every step before gravity. true while you are on a ladder.
export function climbStep(g, pl, input, dt) {
  const m = g._lad; if (!m || !m.size || g._ladW !== g.world) { pl.climbing = false; return false; }
  for (const [id, L] of m) {
    if (!g.machines.items.has(id)) { m.delete(id); continue; }
    const cx = cellX(L.i), cz = cellZ(L.k), dx = pl.pos.x - cx, dz = pl.pos.z - cz;
    if (dx * dx + dz * dz > 0.45 * 0.45) continue;
    const y0 = L.j * C, y1 = (L.j + LADDER_H) * C;
    if (pl.pos.y < y0 - 0.1 || pl.pos.y > y1 - 0.02) continue;
    const fwd = input.fwd > 0, back = input.back > 0, wantUp = fwd || !!input.jump, wantDown = back || !!input.crouch;
    if (pl.pos.y < y0 + 0.2 && !wantUp) continue;   // standing at the foot: only W or Space takes hold
    if (pl.pos.y < y0 + 0.2 && wantDown) continue;
    pl.vel.y = wantUp ? 2.3 : wantDown ? -2.3 : 0;
    pl.onGround = false; pl.climbing = true;
    // hold to the ladder: pulled to the middle of its cell, and the way you face does not push you off (the top rung hands you onto the plate)
    const k = Math.min(1, dt * 8), nearTop = pl.pos.y > y1 - 0.45;
    if (!nearTop || !fwd) { pl.pos.x -= dx * k; pl.pos.z -= dz * k; pl.vel.x *= 0.3; pl.vel.z *= 0.3; }
    else { pl.vel.x += DX[L.dir] * 1.2; pl.vel.z += DZ[L.dir] * 1.2; }
    return true;
  }
  pl.climbing = false;
  return false;
}
// a floor plate laid under your own feet lifts you onto it (host or guest, every frame)
export function liftOnto(g, pl) {
  const w = g.world, i = toI(pl.pos.x), k = toK(pl.pos.z), j = toJ(pl.pos.y + 0.3);
  if (j < 1 || w.get(i, j, k) !== PAD) return false;
  const top = (j + 1) * C;
  if (pl.pos.y >= top - 0.02 || w.solid(i, j + 1, k) || w.solid(i, j + 2, k)) return false;
  pl.pos.y = top + 0.02; if (pl.vel.y < 0) pl.vel.y = 0; return true;
}

// ======================================================================================================
// readouts
// ======================================================================================================
export function infoCube(g, e) {
  const s = cubeById(g, e.id); if (!s) return [];
  const col = column(g, s), out = [], ft = footing(g, s);
  if (ft.hang > 8) out.push('Hangs over a void: nothing holds more than half of it up');
  if (col.length > 1) {
    const idx = col.indexOf(s), up = above(g, s).length, dn = below(g, s).length;
    out.push(`Stack: cube ${idx + 1} of ${col.length} in its column${up ? ', carries the ' + up + ' on it' : ''}${dn ? ', stands on ' + dn : ''}`);
    if (s.loadAbove > 0.005) out.push(`${Math.round(s.loadAbove * 100)}% of its load comes down through the cubes above it`);
  }
  const parts = partsOf(g, e.id); if (parts.length) { const p = plateOf(g, e.id); out.push(`Built in: ${p ? NAMES[p.op || 0].toLowerCase() + ' (' + (p.ro === 'f' ? 'floor' : 'ceiling') + ')' : 'no plate'}${parts.filter((q) => q.type === 'stair' || q.type === 'wramp').length ? ', ' + parts.filter((q) => q.type === 'stair' || q.type === 'wramp').length + ' stair flights' : ''}${parts.filter((q) => q.type === 'ladder').length ? ', ' + parts.filter((q) => q.type === 'ladder').length + ' ladder' : ''}`); }
  return out;
}
export function infoPart(g, e) {
  if (e.bay === undefined) return [];
  const c = cubeById(g, e.bay); const out = [];
  if (e.type === 'pad') out.push(`${e.ro === 'f' ? 'Floor' : 'Ceiling'} plate of a cube: ${NAMES[e.op || 0].toLowerCase()}${e.op ? ', ' + B.OPENINGS[e.op].holes + ' open cells' : ''}`);
  if (e.type === 'wall') out.push('A door frame on the face of a cube: aim a Door at it to make a doorway. Where the cube has a plate the plate keeps its sill');
  if ((e.type === 'stair' || e.type === 'wramp') && e.mod === 'u') out.push(`A flight of a switchback ${e.type === 'stair' ? 'stair' : 'ramp'}: up this one, step across to the other`);
  if (!c) out.push('Its cube is gone');
  return out;
}

export { WARN_AT };

// ---- install the hooks build.js calls (this module is loaded by catalog_stack.js)
B.hooks.checkBay = checkBay;
B.hooks.planBayPad = planBayPad;
B.hooks.planBayStair = planBayStair;
B.hooks.bayPieces = bayPieces;
B.hooks.zoopKey = (g, tool, delta) => {
  if (!unlocked(g) || !tool || tool.kind !== 'pad' || !g.plan || !g.plan.ent || g.plan.ent.bay === undefined) return false;
  const op = cycleOpening(g, delta); g.ui.hint(`${NAMES[op]}${op ? ': ' + B.OPENINGS[op].holes + ' open cells' : ''}. R turns the opening.`, 2); g.machines.setGhost(null); return true;
};
B.hooks.moduleFlights = (g, e) => { const c = cubeById(g, e.bay); return c ? stairFlights(c.blk, e.od | 0, e.j, e.mk, e.type).map((f) => ({ ...f, bay: e.bay })) : [e]; };
B.hooks.infoPart = infoPart;
B.hooks.holeRails = (e) => {
  const cells = new Set(), holes = [];
  for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) { if (B.holeAt(e.op | 0, e.od | 0, dx, dz)) holes.push(dx + ',' + dz); else cells.add(dx + ',' + dz); }
  return holeRails(cells, holes, e.mk);
};
B.hooks.planBayWall = planBayWall;
B.hooks.ownPlateCell = ownPlateCell;
B.hooks.ownWallCell = ownWallCell;
B.hooks.afterWall = afterWall;
B.hooks.deriveBay = (g, piece) => { const r = bayPieces(g, piece.type, piece.type, piece, [[piece.i0, piece.k0]]); return r && r[0] ? r[0].bay : undefined; };
B.hooks.counted = (g, pieces) => {
  const st = g.S.stats, add = (k, n) => { if (n) st[k] = (st[k] || 0) + n; };
  add('stackPlates', pieces.filter((q) => q.type === 'pad' && q.bay !== undefined).length);
  add('stackStairs', Math.floor(pieces.filter((q) => (q.type === 'stair' || q.type === 'wramp') && q.bay !== undefined).length / 2));
  add('stackFrames', pieces.filter((q) => q.type === 'wall' && q.bay !== undefined).length);
};
// the tallest column of cubes you have stood up (a counter for the achievements): called when a cube goes up
export function noteTall(g, ent) {
  const s = g.world.supports.find((q) => q.id === ent.id); if (!s || !s.blk) return;
  const n = column(g, s).length; if (n > (g.S.stats.stackTall || 0)) g.S.stats.stackTall = n;
}
