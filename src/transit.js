// Wave 5 (spec 4.6): doors, platform lifts and jump pads, plus the call button and the cushion pad that go with them.
//
//   Door       4 x 4 cells in the plane of a wall (it can replace a Wall Section in place). Closed it is bulkhead cells (solid, never falls, anchors the roof beside it),
//              open it frees them. It slides up in 0.8 s (a Blast Door in 1.6 s) and the cells follow the leaf row by row. 0.8 kW only while it moves. Unpowered it stays in
//              its last state, but E cranks it by hand at a quarter of the speed so nobody is ever trapped (except a power lock). It will not close on a person, a cart or plush.
//              Lock: none, power (needs the grid) or key (needs a Door Key in the pack). A sensor (Auto) opens it for whoever walks up.
//   Elevator   a big box cab (4 x 4 cells, 4 high) set into a dug opening, with a hollow 4 x 4 shaft you dig straight down from it and shore like any tunnel. The cab never digs:
//              once the tube is dug (clear, shored, within the tier's cap) the rails run out down it by themselves and the cab stops at the home row, at every landing where a
//              side tunnel or pad opens into the shaft (each has a call panel) and at the bottom. 3 m/s, 6 kW while it moves; carries you, a friend, carts and loose plush
//              (and anything a later wave registers with registerCarrier); turned by hand without power; a cut shaft stops it at the last clear landing and says where.
//   Jump Pad   6 kW active, 0.1 kW standby, 5 launches then 22 s to recharge. Angle 0..90 degrees in 5 degree steps, heading in 15 degree steps, 12 m/s. The parabola is drawn
//              while you place it and while you aim at it. A flight keeps its momentum; landing on a Cushion Pad, a Jump Pad or the plush pile after a launch is never hurt,
//              a hard floor hurts as it always did.
//
// Everything is host simulated. A guest sees the ents (ent+), the 0.5 s `transit` row (door progress, car height, pad charge) and asks through the `cfg` command. The cells
// of a door travel through the normal cell sync, so both screens always stand on the same floor.
//
// Import rule: catalog.js imports catalog_transit.js which imports this file, so nothing here may import upgrades.js, crafting.js, power.js, game.js, ext.js or info.js at
// module level, and V (catalog.js) is only touched inside functions that run after the registry has finished loading.
import * as THREE from 'three';
import { C, NX, NZ, NY, idx, cellX, cellY, cellZ, toI, toJ, toK } from './config.js';
import { BULK, PAD, isSpecialCell } from './plushdata.js';
import * as B from './build.js';
import * as KB from './keybinds.js';
import * as M from './transitmesh.js';
import { ghostBoxes } from './buildmesh.js';
import { V } from './catalog.js';
import { SAFE_LEN, OB, MIN_SAFE } from './world.js';
import { staleAt } from './dust.js';

// ---------------------------------------------------------------- numbers
export const DOOR_SEC = 0.8, BLAST_SEC = 1.6;             // time to slide fully open or shut
export const DOOR_KW = 0.8, BLAST_KW = 2.4;                // only while the leaf moves
export const CRANK = 0.25;                                  // a hand crank moves a door at a quarter of its speed
export const SENSE_R = 2.6, SENSE_HOLD = 2.0;               // metres, seconds
export const LIFT_SPEED = 3, LIFT_KW = 6;                   // m/s, kW while moving
export const HOIST_CAPS = [24, 64];                         // metres of travel below the home stop by tier (the hall is 43.2 m tall, so the second tier is the whole hall)
export const LIFT_QUEUE = 6, CAR_ROWS = 3, CAB_ROWS = 4;    // calls waiting, rows of clearance over a jump pad, rows (2.4 m) a cab is high
export const EXT_RATE = 5, SCAN_EVERY = 0.5, LAND_HEAD = 3, MAX_STOPS = 24;   // rows per second the rails run out, seconds between scans of the shaft, rows of headroom at a landing, stops a cab remembers
export const JUMP_KW = 6, JUMP_STANDBY = 0.1, JUMP_BUF = 5, JUMP_COOL = 22, JUMP_SPEED = 12, JUMP_MINVY = 3;
export const GRAV = 21;                                     // the player's gravity (player.js)
export const ANGLE_STEP = 5, HEAD_STEP = 15, ANGLE_DEFAULT = 45;
export const SHOW = { door: 2400, 'door:blast': 36000, doorkey: 600, plift: 900000, jump: 30000, cushion: 1200 };   // what the bench charges (the registry multiplies a row by 3)
export const TRANSIT_TYPES = ['door', 'plift', 'callbtn', 'jump', 'cushion'];
const TSET = new Set(TRANSIT_TYPES);
export const isTransit = (t) => TSET.has(t);
export const DEMAND = { door: DOOR_KW, plift: LIFT_KW, jump: JUMP_KW };

const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const xMin = (i) => (i - NX / 2) * C, zMin = (k) => (k - NZ / 2) * C;
const fmtN = (n) => Math.round(n).toLocaleString('en-US');
const pct = (v) => `${Math.round((v ?? 0) * 100)}%`;
const isHost = (g) => !g.isGuest();
const bad = (why, ent) => ({ plan: { ok: false, why, ent }, cost: 0 });

// ---------------------------------------------------------------- shared state (one game per page)
export const TS = { epoch: 0, g: null, powerT: 0, lastNets: null, seen: new WeakSet(), line: null, lineKey: '', lockUntil: new Map(), hintAt: -9, lastRow: '', scan: new Map(), rv: new Map(), aim: null, cutSaid: '' };
export const CARRIERS = new Map();      // name -> fn(g, lift, { cy, dy, box }) called every frame for every lift (a Haul Truck wave registers here to ride the car)
export const registerCarrier = (name, fn) => { CARRIERS.set(name, fn); };
export const unregisterCarrier = (name) => { CARRIERS.delete(name); };
export const resetTransit = () => { TS.g = null; TS.powerT = 0; TS.lastNets = null; TS.seen = new WeakSet(); TS.lockUntil.clear(); TS.lastRow = ''; TS.scan.clear(); TS.rv.clear(); TS.aim = null; TS.cutSaid = ''; if (TS.line && TS.line.parent) TS.line.parent.remove(TS.line); TS.line = null; TS.lineKey = ''; };

// the transit things of the machines map, sorted by type once per frame (and again when something is added or taken down), so the per frame work never walks every machine
const LC = { g: null, w: null, t: -1, n: -1, ep: -1, m: null };
function lists(g) {
  if (LC.g !== g || LC.w !== g.world || LC.t !== g.time || LC.n !== g.machines.items.size || LC.ep !== TS.epoch) {   // (a new world in the same session is a new list: a game that starts at the same clock time with the same number of machines must not read the last game's doors)
    const m = { door: [], plift: [], callbtn: [], jump: [], cushion: [] };
    for (const it of g.machines.items.values()) { const a = m[it.ent.type]; if (a) a.push(it); }
    LC.g = g; LC.w = g.world; LC.t = g.time; LC.n = g.machines.items.size; LC.ep = TS.epoch; LC.m = m;
    if (!g.cellHeld) g.cellHeld = (i, j, k) => !!heldBy(g, i, j, k);
  }
  return LC.m;
}
// the transit thing that holds a world cell (a door's four rows, the shaft of a lift, a pad's footprint with the room over it, a call button), or null. Belts, machines and lift
// frames ask through game.cellHeld (logistics.canPlace), because the world's reserved set alone cannot tell a transit cell from a belt's: two owners of one key would also
// free each other's key on removal.
export function heldBy(g, i, j, k) {
  const L = lists(g);
  for (const it of L.door) { const e = it.ent, s = doorSpec(e); if (i >= e.i0 && i < e.i0 + s.nx && k >= e.k0 && k < e.k0 + s.nz && j >= e.j && j < e.j + 4) return e; }
  for (const it of L.plift) { const e = it.ent; if (i >= e.i0 && i < e.i0 + 4 && k >= e.k0 && k < e.k0 + 4) { const r = heldRows(e); if (j >= r.lo && j <= r.hi) return e; } }   // the cab and the shaft it serves, from fields a guest's copy has too
  for (const it of L.jump) { const e = it.ent; if (i >= e.i0 && i < e.i0 + 4 && k >= e.k0 && k < e.k0 + 4 && j >= e.j && j < e.j + CAR_ROWS) return e; }
  for (const it of L.cushion) { const e = it.ent; if (i >= e.i0 && i < e.i0 + 4 && k >= e.k0 && k < e.k0 + 4 && j === e.j) return e; }
  for (const it of L.callbtn) { const e = it.ent; if (i === e.i && k === e.k && (j === e.j || j === e.j + 1)) return e; }
  return null;
}
export const doorAt = (g, i, j, k) => { const e = heldBy(g, i, j, k); return e && e.type === 'door' ? e : null; };
const itemsOf = (g, type) => lists(g)[type] || [];
const entsOf = (g, type) => itemsOf(g, type).map((it) => it.ent);
const entById = (g, id) => { const it = g.machines.items.get(id); return it ? it.ent : null; };
const keyHeld = (g) => ((g.S.items && g.S.items.doorkey) || 0) > 0;
// the people the host knows about: you, and your friend from the position messages
export function people(g) { const a = [g.player.pos], r = g.remote && g.remote.pos; if (r && r.y > -40 && g.net && g.net.open) a.push(r); if (g._botPeople) for (const b of g._botPeople) a.push(b); return a; }   // (a bot on a multi-level errand, botnav.js: a door never closes on it and a cab never comes down on it)
const sound = (g, f) => { try { f(g.sound); } catch (x) { /* audio may be locked or absent */ } };
// a sound that comes from a door, a lift or a pad: heard from where it stands, fading with distance (spatial.js)
const soundAt = (g, e, cls, f) => { try { f(g.sound.at(e.px ?? e.cx ?? e.x, (e.y0 ?? e.cy ?? e.y ?? 0) + 1, e.pz ?? e.cz ?? e.z, cls)); } catch (x) { /* audio may be locked or absent */ } };

// ---------------------------------------------------------------- power
// kW an ent draws right now. A door only while the leaf moves under power, a lift only while the car moves, a jump pad 0.1 standing by and 6 while it charges or has just fired.
export function kwOf(e) {
  if (e.type === 'door') return e.draw ? (e.blast ? BLAST_KW : DOOR_KW) : 0;
  if (e.type === 'plift') return (e.mv && !e.crank) || e.xt ? LIFT_KW : 0;   // moving under power, or the rails running out under power
  if (e.type === 'jump') return e.on === false ? 0 : (e.act > 0 || (e.buf ?? JUMP_BUF) < JUMP_BUF || e.cool > 0) ? JUMP_KW : JUMP_STANDBY;
  return 0;
}
const POWERED = new Set(['door', 'plift', 'jump']);
const WYS = ['bottom', 'home', 'floor', 'blocked', 'unsupported', 'cap'];   // why the shaft ends where it does (the order is the row's code)
export const powerPos = (e) => (e.type === 'door' ? [e.px, e.y0 + 1.2, e.pz] : e.type === 'plift' ? [e.px, e.j * C + 1, e.pz]   /* the home stop: the cable clips on at the top of the shaft */ : [e.x, e.y + 1, e.z]);
// The solver counts doors, lifts and pads itself (power.js): they run only on a cable to a live node. Every powered ent also learns its grid's satisfaction (.pw).
export function resolvePower(g) {
  const P = g.power; if (!P || !P.nets) return;
  const list = [];
  { const L = lists(g); list.push(...L.door, ...L.plift, ...L.jump); }
  for (const it of list) it.net = P.netOfEnt(it.ent);   // the solver counts doors, lifts and pads itself (kwOf, powerPos): it already set .pw (they run only on a cable to a powered node)
  for (const it of list) { const pw = it.net ? it.net.sat : 0; if (Math.abs((it.ent.pw ?? -1) - pw) > 0.004) it.ent.pw = pw; }
  TS.lastNets = P.nets;
}
const powerLine = (e) => ((e.pw ?? 0) > 0.05 ? `Powered ${pct(e.pw)}` : 'No power: run a cable to it from a live pole or generator');

// ================================================================ DOORS
export const doorSpec = (e) => (e.ax === 'z' ? { nx: 1, nz: 4 } : { nx: 4, nz: 1 });
export const doorCells = (e, row) => { const s = doorSpec(e), out = []; for (let dz = 0; dz < s.nz; dz++) for (let dx = 0; dx < s.nx; dx++) out.push([e.i0 + dx, e.j + row, e.k0 + dz]); return out; };
export const allDoorCells = (e) => { const out = []; for (let r = 0; r < 4; r++) out.push(...doorCells(e, r)); return out; };
// rows (from the sill) that are open at leaf progress p: a row opens once the leaf's bottom edge passes the middle of it
export const freedOf = (p) => clamp(Math.ceil(p * 4 - 0.5 - 1e-9), 0, 4);
const doorVr = (e, i, j, k) => 128 | (e.blast ? ((i * 7 + j * 13 + k * 3) & 15) : 112 + ((i * 7 + j * 13 + k * 3) & 15));   // 128 = a flush panel; the blast door is the darker one
export const doorSec = (e) => (e.blast ? BLAST_SEC : DOOR_SEC);
export const doorState = (e) => (e.p <= 0 && !e.tgt ? 'closed' : e.p >= 1 && e.tgt ? 'open' : e.tgt ? 'opening' : 'closing');

// make the world cells match `freed` open rows (host). Returns how many cells changed.
export function setRows(g, e, freed) {
  const w = g.world; let n = 0;
  for (let r = 0; r < 4; r++) for (const [i, j, k] of doorCells(e, r)) {
    const cur = w.get(i, j, k);
    if (r >= freed) { if (cur === 0) { w.setCell(i, j, k, BULK, doorVr(e, i, j, k)); w.stabQueue.push({ i, j, k }); n++; } }
    else if (cur === BULK) { w.setCell(i, j, k, 0, 0); w.stabQueue.push({ i, j, k }); n++; }
  }
  e.f = freed;
  return n;
}
// what stops row r from closing: plush that slid in, a person or a cart. null when it is clear.
export function rowBlocked(g, e, r) {
  const w = g.world, s = doorSpec(e), x0 = xMin(e.i0), z0 = zMin(e.k0), x1 = x0 + s.nx * C, z1 = z0 + s.nz * C, y0 = (e.j + r) * C, y1 = y0 + C;
  for (const [i, j, k] of doorCells(e, r)) { const cur = w.get(i, j, k); if (cur && cur !== BULK) return 'plush'; }
  for (const p of people(g)) if (p.x > x0 - 0.3 && p.x < x1 + 0.3 && p.z > z0 - 0.3 && p.z < z1 + 0.3 && p.y < y1 && p.y + 1.7 > y0) return 'person';
  for (const key of ['cart', 'gcart', 'hcart']) { const c = g.S[key]; if (c && c.x > x0 - 0.5 && c.x < x1 + 0.5 && c.z > z0 - 0.5 && c.z < z1 + 0.5 && c.y < y1 && c.y + 0.8 > y0) return 'cart'; }
  return null;
}
const nearDoor = (g, e) => { for (const p of people(g)) if (Math.hypot(p.x - e.px, p.z - e.pz) < SENSE_R && Math.abs(p.y + 0.9 - (e.y0 + 1.2)) < 2.4) return true; return false; };

// can this actor change the door's target right now? A refusal text or null.
export function doorAllows(g, e) {
  if (e.lock === 'key' && !keyHeld(g)) return 'Locked: it needs a Door Key in your pack';
  if (e.lock === 'power' && !((e.pw ?? 0) > 0.05)) return 'Locked: it only works with power';
  return null;
}

export function tickDoors(g, dt) {
  let dirty = false;
  for (const it of itemsOf(g, 'door')) {
    const e = it.ent, powered = (e.pw ?? 0) > 0.05;
    // the sensor
    if (e.auto && powered) {
      const near = nearDoor(g, e), ok = e.lock === 'none' || (e.lock === 'key' && keyHeld(g)) || e.lock === 'power';
      if (near && ok) { if (!e.tgt) { e.tgt = 1; e.crank = false; } e.idle = 0; }
      else if (e.tgt && e.p >= 1) { e.idle = (e.idle || 0) + dt; if (e.idle > SENSE_HOLD) { e.tgt = 0; e.idle = 0; } }
    }
    const dir = Math.sign((e.tgt ? 1 : 0) - e.p);
    const wasDraw = !!e.draw;
    if (dir !== 0 && (powered || e.crank)) {
      const speed = powered ? Math.min(1, e.pw) : CRANK;
      let np = clamp(e.p + dir * dt / doorSec(e) * speed, 0, 1);
      if (dir < 0) {
        // never close on someone: a row only fills when it is clear, otherwise the door reverses
        const of = freedOf(e.p), nf = freedOf(np);
        for (let r = of - 1; r >= nf; r--) { const why = rowBlocked(g, e, r); if (why) { np = Math.max(np, (r + 0.5) / 4 + 0.002); e.tgt = 1; e.crank = e.crank && !powered; e.blk = why; e.idle = 0; break; } }
      }
      e.p = np;
      e.draw = powered && e.p !== (e.tgt ? 1 : 0) ? 1 : 0;
      if (e.p === (e.tgt ? 1 : 0)) e.crank = false;
      const nf = freedOf(e.p); if (nf !== e.f && !e.view) setRows(g, e, nf);
    } else e.draw = 0;
    const st = doorState(e); if (st !== e.st) { e.st = st; if (st === 'open' || st === 'closed') soundAt(g, e, 'door', (s) => s.thump(0.14, 110)); }
    if (!!e.draw !== wasDraw) dirty = true;
    visDoor(it);
  }
  if (dirty) g.power.markDirty();
}
export function guestDoors(g, dt) {
  for (const it of itemsOf(g, 'door')) {
    const e = it.ent;
    if ((e.draw || e.crank) && e.p !== (e.tgt ? 1 : 0)) { const sp = e.draw ? Math.min(1, e.pw || 1) : CRANK; e.p = clamp(e.p + Math.sign((e.tgt ? 1 : 0) - e.p) * dt / doorSec(e) * sp, 0, 1); }
    const st = doorState(e); if (st !== e.st) { e.st = st; if (st === 'open' || st === 'closed') soundAt(g, e, 'door', (s) => s.thump(0.14, 110)); }
    visDoor(it);
  }
}
function visDoor(it) {
  const e = it.ent, st = e.p <= 0 && !e.tgt ? 'closed' : e.p >= 1 && e.tgt ? 'open' : (e.draw || e.crank) ? 'moving' : (e.pw ?? 0) > 0.05 ? (e.tgt ? 'open' : 'closed') : 'dead';
  const key = Math.round(e.p * 1000) + st; if (it.vis === key) return; it.vis = key;
  M.setDoorLeaf(it.obj, e.p); M.setDoorLamp(it.obj, st === 'dead' && e.p >= 1 ? 'open' : st);
}

export function addDoor(machines, e) {
  const g = machines.game, w = g.world; TS.epoch++; g.botnavVer = (g.botnavVer | 0) + 1;
  e.ax = e.ax === 'z' ? 'z' : 'x'; e.blast = !!e.blast; e.lock = ['none', 'power', 'key'].includes(e.lock) ? e.lock : 'none';
  e.auto = e.auto === undefined ? !e.blast : !!e.auto; e.tgt = e.tgt ? 1 : 0; e.p = clamp(+e.p || 0, 0, 1); e.anchors = true;
  const s = doorSpec(e), x0 = xMin(e.i0), z0 = zMin(e.k0);
  e.px = x0 + s.nx * C / 2; e.pz = z0 + s.nz * C / 2; e.y0 = e.j * C; e.h = 4 * C; e.hr = 1.5; e.cx = e.px; e.cz = e.pz;
  e.draw = 0; e.f = undefined; e.st = doorState(e);
  if (!e.view) {
    // a saved door that was left half way settles where it was heading
    if (e.p > 0 && e.p < 1) e.p = e.tgt ? 1 : 0;
    setRows(g, e, freedOf(e.p));
    for (const [i, j, k] of allDoorCells(e)) w.reserved.add(idx(i, j, k));   // nothing settles in the doorway while the door is open
  }
  const obj = M.doorObject(e); obj.position.set(e.px, e.y0, e.pz); if (e.ax === 'z') obj.rotation.y = Math.PI / 2;
  const it = { obj }; it.vis = ''; return it;
}
export function removeDoor(g, e) {
  const w = g.world; g.botnavVer = (g.botnavVer | 0) + 1;
  for (const [i, j, k] of allDoorCells(e)) { if (w.get(i, j, k) === BULK) { w.setCell(i, j, k, 0, 0); w.stabQueue.push({ i, j, k }); } w.reserved.delete(idx(i, j, k)); }
}
export function useDoor(g, e) {
  const r = g.setCfg(e, { tgt: e.tgt ? 0 : 1 });
  if (r.ok) { sound(g, (s) => s.tone('triangle', 520, 640, 0.07, 0.06)); if (!((e.pw ?? 0) > 0.05) && e.lock !== 'power') g.ui.hint('No power: you turn the hand crank. It is slow.', 3); }
  else { sound(g, (s) => s.error()); g.ui.hint(r.why || 'It will not move', 3); }
  return true;
}

// placement. A door goes where a wall section goes (the planner of build.js does the snapping), or replaces the wall section you aim at.
function wallAt(g, a) {
  if (!a || !a.hit || a.sp !== BULK) return null;
  const W = B.ownerAt(g, a.hit.i, a.hit.j, a.hit.k); return W && W.type === 'wall' ? W : null;
}
export function planDoor(g, tool, eye, dir, yaw) {
  const blast = tool.id === 'door:blast', title = blast ? 'BLAST DOOR' : 'DOOR';
  const a = B.aimCells(g, eye, dir);
  if (!a) return bad('Aim at a wall section, the top of a pad or the floor');
  const W = wallAt(g, a);
  let ent;
  if (W) ent = { type: 'door', ax: W.ax, i0: W.i0, k0: W.k0, j: W.j, blast, replaces: W.id, snap: 'replaces the wall section' };
  else {
    const z0 = g._bz; g._bz = { n: 1, w: 1 };
    let r; try { r = B.planWall(g, { ...tool, id: 'wall', kind: 'wall' }, eye, dir, yaw); } finally { g._bz = z0; }
    g._xInfo = null;
    const pe = r.plan.ent; if (!pe || pe.i0 === undefined) return bad(r.plan.why || 'Cannot build here');
    ent = { type: 'door', ax: pe.ax, i0: pe.i0, k0: pe.k0, j: pe.j, blast, snap: pe.snap, ...(pe.bay !== undefined ? { bay: pe.bay } : {}) };   // a door aimed into a cube is a door frame in it (stack.js)
    if (!r.plan.ok) return bad(r.plan.why, ent);
  }
  g._xInfo = { t: g.time + 0.35, title, lit: true, lines: [`${ent.snap}: 4 wide, 4 high`, `Slides up in ${doorSec(ent)} s, ${blast ? BLAST_KW : DOOR_KW} kW while it moves`, blast ? 'Holds the pile and anchors the roof beside it. Opens only on power or by the crank' : 'Closed it is solid, open it frees the cells. E opens it, the sensor opens it for you'] };
  return { plan: { ok: true, ent }, cost: 0 };
}
export function previewDoor(g, tool, plan) {
  const mc = g.machines;
  if (!plan || !plan.ent) { mc.setGhost(null); return; }
  const e = plan.ent, key = `tdoor${plan.ok}${e.ax}${e.i0},${e.k0},${e.j}`;
  if (mc.ghostKey !== key) { const s = doorSpec(e), x0 = xMin(e.i0), z0 = zMin(e.k0); mc.setGhost(ghostBoxes([{ x0, x1: x0 + s.nx * C, z0, z1: z0 + s.nz * C, y0: e.j * C, y1: (e.j + 4) * C }], plan.ok), key); }
}
// a placement a guest asked for, or the host's own: a refusal text or null (never trusts blast: the item id says that)
const wrongItem = (tool, ids) => (tool && !ids.includes(tool.id) ? 'That is not the right item for it' : null);   // a guest's message names the item it spends: it must be the one this kind is made of
export function conflictDoor(g, e, tool) {
  const bi = wrongItem(tool, ['door', 'door:blast']); if (bi) return bi;
  if (!e || typeof e !== 'object' || !int(e.i0, 0, NX - 4) || !int(e.k0, 0, NZ - 4) || !int(e.j, 0, NY - 4) || (e.ax !== 'x' && e.ax !== 'z')) return 'That placement is not valid';
  if (e.replaces !== undefined) {
    const W = entById(g, e.replaces);
    if (!W || W.type !== 'wall' || W.ax !== e.ax || W.i0 !== e.i0 || W.k0 !== e.k0 || W.j !== e.j) return 'That wall section is gone';
    return null;
  }
  const bay = e.bay !== undefined && B.hooks.deriveBay ? B.hooks.deriveBay(g, { type: 'wall', ax: e.ax, i0: e.i0, k0: e.k0, j: e.j }) : undefined;   // the host finds the cube itself, from the cell
  return B.checkPiece(g, { type: 'wall', ax: e.ax, i0: e.i0, k0: e.k0, j: e.j, ...(bay !== undefined ? { bay } : {}) });
}
export function buildDoor(g, tool, e) {
  const why = conflictDoor(g, e, tool); if (why) return null;
  const blast = tool.id === 'door:blast';
  let bay = e.bay !== undefined && B.hooks.deriveBay ? B.hooks.deriveBay(g, { type: 'wall', ax: e.ax, i0: e.i0, k0: e.k0, j: e.j }) : undefined;
  if (e.replaces !== undefined) { const W0 = entById(g, e.replaces); if (W0 && W0.bay !== undefined) bay = W0.bay; g.doDecon({ kind: 'mach', id: e.replaces }); }   // the wall section comes back to your pack, the door takes its cells
  const grp = (g.S.buildGrp = (g.S.buildGrp || 0) + 1);
  return { ...(bay !== undefined ? { bay } : {}), type: 'door', ax: e.ax, i0: e.i0, k0: e.k0, j: e.j, blast, lock: 'none', auto: !blast, tgt: 0, p: 0, st: 'closed', rid: tool.id, grp };
}
export function infoDoor(g, e) {
  const st = doorState(e), name = e.blast ? 'BLAST DOOR' : 'DOOR';
  const moving = e.draw ? ' (' + (e.blast ? BLAST_KW : DOOR_KW) + ' kW)' : '', cr = e.crank ? ' (hand crank)' : '';
  const lines = [`${st === 'closed' ? 'Closed: solid, holds the pile back' : st === 'open' ? 'Open: the way is free' : st === 'opening' ? 'Opening' : 'Closing'}${st === 'opening' || st === 'closing' ? ` ${Math.round(e.p * 100)}%${moving}${cr}` : ''}`,
    e.lock === 'none' ? 'Lock: none' : e.lock === 'power' ? 'Lock: power (works only while powered)' : 'Lock: key (needs a Door Key in your pack)',
    e.auto ? `Sensor on: it opens when someone comes within ${SENSE_R} m and closes ${SENSE_HOLD} s after they leave` : 'Sensor off: E opens and closes it',
    powerLine(e) + `. Draws ${e.blast ? BLAST_KW : DOOR_KW} kW only while it moves`,
    e.blk ? `It stopped for ${e.blk === 'person' ? 'someone in the doorway' : e.blk === 'cart' ? 'a cart in the doorway' : 'plush in the doorway'}` : null,
    e.blast ? 'Blast door: panel strength, anchors the roof beside it while closed' : 'Closed it anchors the roof beside it like a wall',
    !((e.pw ?? 0) > 0.05) && e.lock !== 'power' ? 'No power: E turns the hand crank (slow). It stays where you leave it' : 'E opens or closes it. Shift+E copies lock and sensor, E on another door pastes them'];
  return { title: `${name} · ${st.toUpperCase()}`, lit: (e.pw ?? 0) > 0.05, lines: lines.filter(Boolean) };
}

// ================================================================ ELEVATOR (the hoistway design: DESIGN_SATISFACTORY.md section 10)
// A big box cab, 4 x 4 cells in plan and 4 rows (2.4 m) high, set into a dug opening: `i0 k0` the footprint, `j` the floor row of the HOME stop (the top). You dig a hollow
// 4 x 4 tube straight down from it and shore it like any tunnel; the elevator never digs. Each half second the host scans the tube below the home stop (scanShaft):
//   clear   every row of the 4 x 4 section is empty (plush, a wall, a pad, a belt or a machine ends the run: that is where the shaft is blocked, or cut when it used to be clear)
//   shored  the tunnel rule of world.js turned on its side: a row is held when a frame, strut or jack reaches it or the shaft is open to the sky, and an unshored stretch may run
//           shaftLimit(r) rows from the nearest anchor (the home opening counts as one), which shrinks with the pile above and the distance from the bay like SAFE_LEN does
//   capped  at most the tier's cap below the cab (24 m, 64 m with Deep Hoistways; the hall is 43.2 m)
// The rails then run out down the clear, shored, capped part by themselves (`ex` rows, 5 rows/s powered, a quarter of that without power), and the cab may stop at: the home row,
// every landing (a row where a side tunnel or the edge of a pad opens into the shaft: a walkable cell beside the section with 3 rows of headroom, each with a call panel) and the
// bottom of the reach. The cab carries you, a friend, carts and loose plush; it is turned by hand without power (E in the cab), and a shaft that gets cut stops it at the last
// clear landing. The shaft itself is NOT reserved: a collapse can fill it, and the next scan says where.
export const liftSpan = (e) => ({ x0: xMin(e.i0), z0: zMin(e.k0), x1: xMin(e.i0) + 4 * C, z1: zMin(e.k0) + 4 * C });
export const liftCells = (e, lo, hi) => { const out = []; for (let j = lo; j <= hi; j++) for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) out.push([e.i0 + dx, j, e.k0 + dz]); return out; };
export const hoistCap = (g) => { const c = g && g.T ? g.T.hoistCap : 0; return c > 0 ? Math.min(c, HOIST_CAPS[HOIST_CAPS.length - 1]) : HOIST_CAPS[0]; };   // metres of travel below the home stop
const capRowsOf = (g) => Math.floor(Math.min(hoistCap(g), NY * C) / C + 1e-6);
const SIDE_CELL = (e, q, u) => (q === 0 ? [e.i0 + 4, e.k0 + u] : q === 1 ? [e.i0 + u, e.k0 + 4] : q === 2 ? [e.i0 - 1, e.k0 + u] : [e.i0 + u, e.k0 - 1]);   // the ring around the section: 0 east, 1 south, 2 west, 3 north
const U_ORDER = [1, 2, 0, 3];
const m1 = (rows) => (rows * C).toFixed(1);

// what fills a cell the cab would have to pass through, or null. `e` lets the cab's own reserved box through.
export function cellBlock(g, e, i, j, k) {
  if (j < 0) return 'the hall floor'; if (j >= NY) return 'the hall roof';
  const w = g.world, c = w.get(i, j, k);
  if (c) return c === BULK ? 'a wall or a door' : c === PAD ? 'a floor pad' : 'plush';
  const key = idx(i, j, k);
  if (g.logi.tiles.has(key)) return 'a belt or a machine';
  if (w.reserved.has(key)) { const rv = e && TS.rv.get(e.id); if (!(rv && j >= rv[0] && j <= rv[1] && i >= e.i0 && i < e.i0 + 4 && k >= e.k0 && k < e.k0 + 4)) return 'a belt or a machine'; }
  return null;
}
export function rowBlock(g, e, r) { for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) { const b = cellBlock(g, e, e.i0 + dx, r, e.k0 + dz); if (b) return b; } return null; }
// a landing at floor row r: a ring cell beside the section with ground under it and LAND_HEAD rows of headroom (a side tunnel's floor, the edge of a pad). { q, u } or null.
export function landingAt(g, e, r) {
  const w = g.world;
  for (let q = 0; q < 4; q++) for (const u of U_ORDER) {
    const [ci, ck] = SIDE_CELL(e, q, u);
    if (!w.inside(ci, r, ck) || !w.solid(ci, r - 1, ck)) continue;   // (past the edge of the hall there is nothing to walk on: world.solid says true out there, world.get says empty)
    let open = true; for (let h = 0; h < LAND_HEAD; h++) { if (r + h >= NY || w.get(ci, r + h, ck) || g.logi.tiles.has(idx(ci, r + h, ck))) { open = false; break; } }
    if (open) return { q, u };
  }
  return null;
}
const ringTop = (g, e) => { let t = 0; for (let q = 0; q < 4; q++) for (let u = 0; u < 4; u++) { const [ci, ck] = SIDE_CELL(e, q, u); t = Math.max(t, g.world.topAt(ci, ck)); } return t; };
// how many rows an unshored stretch of the shaft may run from the nearest anchor at row r (the tunnel rule of world.js: it shrinks with the pile above and the distance from the bay)
export function shaftLimit(g, e, r, top) {
  const w = g.world, over = Math.max(0, (top === undefined ? ringTop(g, e) : top) - r - 1);
  return Math.max(MIN_SAFE, SAFE_LEN - Math.floor(over / OB) - 2 * w.depthPenalty(e.i0 + 2, e.k0 + 2)) + 2 * (w.stabBonus || 0);
}
// the frames, struts and jacks that reach the middle of the section (a support that already carries more than it can bear is about to go and holds nothing)
export function anchorsOf(g, e) {
  const cx = xMin(e.i0) + 2 * C, cz = zMin(e.k0) + 2 * C, out = [];
  for (const s of g.world.supports) { if (!(s.b > 0) || s.cap === undefined || (s.load || 0) >= 1) continue; if (Math.hypot(s.x - cx, s.z - cz) < s.r) out.push(s); }
  return out;
}
// Scan the tube under the home stop. Pure: reads the world, the supports and the logi tiles. Returns
//   { tr (rows below the home row the cab may reach), wy ('home' | 'bottom' | 'floor' | 'blocked' | 'unsupported' | 'cap'), wr (the row that stopped it), what, sg ([[row, side, u]] ascending), sl (busiest shoring load, percent) }
export function scanShaft(g, e, cabRow) {
  const home = e.j, res = { tr: 0, wy: 'bottom', wr: home - 1, what: '', sg: [], sl: 0 };
  for (let r = home; r < home + CAB_ROWS; r++) { const b = rowBlock(g, e, r); if (b) { res.wy = 'home'; res.wr = r; res.what = b; res.sg = [[home, -1, 0]]; return res; } }
  const capRows = capRowsOf(g), rows = [];
  let wy = 'cap', wr = home - capRows - 1, what = '';
  for (let n = 1; n <= capRows + 1; n++) {
    const r = home - n, b = rowBlock(g, e, r);
    if (b) { wy = b === 'the hall floor' ? 'floor' : 'blocked'; wr = r; what = b; break; }
    if (n > capRows) break;
    rows.push(r);
  }
  // the tunnel rule: every row must be within its limit of an anchor (the home opening, an open sky, a frame that reaches it)
  const anchors = anchorsOf(g, e), cx = xMin(e.i0) + 2 * C, cz = zMin(e.k0) + 2 * C, top = ringTop(g, e);
  let fTop = 0; for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) fTop = Math.max(fTop, g.world.topAt(e.i0 + dx, e.k0 + dz));
  const anch = [home], held = new Set();
  for (const r of rows) {
    const y = cellY(r); let a = fTop <= r;
    for (const s of anchors) { const dx = cx - s.x, dy = y - s.y, dz = cz - s.z; if (dx * dx + dy * dy + dz * dz < s.r * s.r) { a = true; held.add(s); } }
    if (a) anch.push(r);
  }
  let lo = home;
  for (const r of rows) {
    let L = 1e9; for (const a of anch) L = Math.min(L, Math.abs(a - r));
    if (L > shaftLimit(g, e, r, top)) { wy = 'unsupported'; wr = r; what = ''; break; }
    lo = r;
  }
  res.tr = home - lo; res.wy = wy; res.wr = wr; res.what = what;
  for (const s of held) if (s.y > lo * C - s.r && s.y < (home + CAB_ROWS) * C + s.r) res.sl = Math.max(res.sl, Math.round((s.load || 0) * 100));
  for (let r = lo; r <= home; r++) {
    const ld = landingAt(g, e, r);
    if (ld) res.sg.push([r, ld.q, ld.u]); else if (r === home || r === lo) res.sg.push([r, -1, 0]);
    if (res.sg.length >= MAX_STOPS) break;
  }
  // a cab that a cut has left below the shaft's reach (plush fell in above it) still serves the clear stretch around it: its landings, so people are never shut in
  if (cabRow !== undefined && cabRow < lo) {
    let ok = true; for (let r = cabRow; r < cabRow + CAB_ROWS && ok; r++) if (rowBlock(g, e, r)) ok = false;
    if (ok) {
      let sLo = cabRow, sHi = cabRow; while (sLo > 0 && !rowBlock(g, e, sLo - 1)) sLo--; while (sHi + CAB_ROWS <= home + CAB_ROWS - 1 && !rowBlock(g, e, sHi + CAB_ROWS)) sHi++;
      if (sHi < lo) for (let r = sLo; r <= sHi; r++) { const ld = landingAt(g, e, r); if (ld) res.sg.unshift([r, ld.q, ld.u]); else if (r === sLo) res.sg.unshift([r, -1, 0]); }
      res.sg.sort((a, b) => a[0] - b[0]);
    }
  }
  return res;
}
// a plain scan of a spot, for a plan that is not an ent yet
export const scanSpot = (g, s) => scanShaft(g, { id: 0, i0: s.i0, k0: s.k0, j: s.j });

// the rows the cab and its shaft occupy for the build rules (a belt or machine may not go there): from the lowest of the reach and the car up to the roof of the home opening
export const heldRows = (e) => ({ lo: Math.min(e.j - (e.tr || 0), Math.floor(e.cy / C + 1e-6)), hi: e.j + CAB_ROWS - 1 });
// the stops the cab may use now: the home row, the landings and the bottom, as far as the rails have run out (ascending rows)
export function floorsOf(g, e) {
  const lo = e.j - Math.floor((e.ex ?? 0) + 1e-6), a = new Set([e.j]);
  if (Array.isArray(e.sg)) for (const s of e.sg) if ((s[0] >= lo || s[0] < e.j - (e.tr || 0)) && s[0] <= e.j) a.add(s[0]);   // below the reach: the stretch around a cab that a cut left stranded
  return [...a].sort((x, y) => x - y);
}
// keep the cab's own box reserved (host) so no plush settles inside it; the shaft stays open to collapses
function syncBox(g, e) {
  if (e.view) return; const w = g.world, old = TS.rv.get(e.id), lo = Math.floor(e.cy / C + 1e-6), hi = Math.ceil(e.cy / C - 1e-6) + CAB_ROWS - 1;
  if (old && old[0] === lo && old[1] === hi) return;
  if (old) for (const [i, j, k] of liftCells(e, old[0], old[1])) w.reserved.delete(idx(i, j, k));
  for (const [i, j, k] of liftCells(e, lo, hi)) w.reserved.add(idx(i, j, k));
  TS.rv.set(e.id, [lo, hi]);
}
const liftPose = (e) => { const s = liftSpan(e); e.px = (s.x0 + s.x1) / 2; e.pz = (s.z0 + s.z1) / 2; e.cx = e.px; e.cz = e.pz; e.y0 = e.cy; e.h = CAB_ROWS * C; e.hr = 2.0; };

export function addLift(machines, e) {
  const g = machines.game; TS.epoch++; g.botnavVer = (g.botnavVer | 0) + 1;
  e.cy = Number.isFinite(e.cy) ? Math.min(e.cy, e.j * C) : e.j * C; e.q = Array.isArray(e.q) ? e.q.filter((n) => Number.isInteger(n)).slice(0, LIFT_QUEUE) : []; e.tg = Number.isInteger(e.tg) ? e.tg : null; e.dw = +e.dw || 0; e.dr = e.dr === -1 ? -1 : 1; e.mv = 0; e.blk = 0; e.crank = 0; e.hand = 0; e.xt = 0; e.xc = 0;
  e.cut = int(e.cut, 0, NY + 8) ? e.cut : 0; e.tr = int(e.tr, 0, NY) ? e.tr : 0; e.ex = Number.isFinite(e.ex) ? clamp(e.ex, 0, Math.max(e.tr, e.j - Math.floor(e.cy / C + 1e-6))) : e.tr;   // a saved elevator comes back with its rails run out
  e.wy = typeof e.wy === 'string' ? e.wy : 'bottom'; e.wr = Number.isInteger(e.wr) ? e.wr : e.j - 1; e.sl = int(e.sl, 0, 999) ? e.sl : 0; e.cm = hoistCap(g);
  if (!Array.isArray(e.sg) || !e.sg.length) e.sg = [[e.j, -1, 0]];
  delete e.cache; liftPose(e);
  const root = new THREE.Group(); root.position.set(e.px, 0, e.pz);
  const car = M.cabObject(); car.position.y = e.cy; root.add(car);
  root.add(M.railObject());
  const it = { obj: root, vis: '', ext: '', pk: '' };
  if (!e.view) { TS.scan.delete(e.id); TS.rv.delete(e.id); syncBox(g, e); }   // a loaded world has its own reserved set: say it all again
  return it;
}
export function removeLift(g, e) {
  const w = g.world, rv = TS.rv.get(e.id); g.botnavVer = (g.botnavVer | 0) + 1;
  if (rv) for (const [i, j, k] of liftCells(e, rv[0], rv[1])) w.reserved.delete(idx(i, j, k));
  TS.rv.delete(e.id); TS.scan.delete(e.id);
  for (const b of entsOf(g, 'callbtn')) if (b.lid === e.id) g.doDecon({ kind: 'mach', id: b.id });   // an old call button stands for nothing without it
}

// ---- the rules for a spot (a footprint, a home row) ----
function floorOf(w, i, j, k) {
  let jj = j, n = 0;
  while (jj > 0 && !w.solid(i, jj - 1, k) && n++ < 8) jj--;
  if (jj > 0 && !w.solid(i, jj - 1, k)) return null;
  return jj;
}
// null when a 4 x 4 flat piece (a jump pad, a cushion) can stand at (i0, k0) on row j. rows = how many rows must be clear
export function flatCheck(g, s, rows, skipSelf) {
  const w = g.world;
  if (!int(s.i0, 0, NX - 4) || !int(s.k0, 0, NZ - 4) || !int(s.j, 0, NY - 1) || s.j + rows > NY) return 'Out of the hall';
  let dig = 0, solid = 0, under = 0;
  for (let r = 0; r < rows; r++) for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) {
    const i = s.i0 + dx, j = s.j + r, k = s.k0 + dz, c = w.get(i, j, k);
    if (c) { if (isSpecialCell(c)) solid++; else dig++; }
    const key = idx(i, j, k); if (g.logi.tiles.has(key) || (w.reserved.has(key) && !(skipSelf && skipSelf.has(key)))) return 'Something is in the way (a belt, a machine or a shaft)';
  }
  if (solid) return 'Something solid is already here';
  if (dig) return `Dig out ${dig} more plush first: the space above it must be empty`;
  if (s.j > 0) { for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) if (w.solid(s.i0 + dx, s.j - 1, s.k0 + dz)) under++; if (under < 8) return 'No ground under it: it needs solid floor under at least half of it'; }
  return null;
}
// where the crosshair puts a 4 x 4 flat piece: on the pad you aim at, or centred on the floor cell
function flatSpot(g, eye, dir) {
  const a = B.aimCells(g, eye, dir, 6); if (!a) return { why: 'Aim at the floor or at a pad' };
  const H = a.hit;
  if (H && a.sp === PAD && a.last.j > H.j) { const P = B.ownerAt(g, H.i, H.j, H.k); if (P && P.type === 'pad' && a.last.i >= P.i0 && a.last.i < P.i0 + 4 && a.last.k >= P.k0 && a.last.k < P.k0 + 4) return { i0: P.i0, k0: P.k0, j: P.j + 1, snap: 'on the pad' }; }
  const j = floorOf(g.world, a.last.i, a.last.j, a.last.k); if (j === null) return { why: 'No floor here: aim at the ground or at a pad' };
  return { i0: a.last.i - 1, k0: a.last.k - 1, j, snap: 'free' };
}
const boxGhost = (g, plan, key, rows, h) => {
  const mc = g.machines;
  if (!plan || !plan.ent) { mc.setGhost(null); return; }
  const e = plan.ent, k = `${key}${plan.ok}${e.i0},${e.k0},${e.j}`;
  if (mc.ghostKey !== k) { const x0 = xMin(e.i0), z0 = zMin(e.k0); mc.setGhost(ghostBoxes([{ x0, x1: x0 + 4 * C, z0, z1: z0 + 4 * C, y0: e.j * C, y1: e.j * C + h }], plan.ok), k); }
};
// The opening for a cab: 4 x 4 x 4 clear, nothing of ours in it, and a way to stand: ground under half of it, or (at the mouth of a shaft that is already dug) a walkable floor beside it.
export function cabCheck(g, s) {
  const w = g.world;
  if (!int(s.i0, 0, NX - 4) || !int(s.k0, 0, NZ - 4) || !int(s.j, 0, NY - CAB_ROWS)) return 'Out of the hall';
  let dig = 0, solid = 0;
  for (let r = 0; r < CAB_ROWS; r++) for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) {
    const i = s.i0 + dx, j = s.j + r, k = s.k0 + dz, c = w.get(i, j, k);
    if (c) { if (isSpecialCell(c)) solid++; else dig++; }
    else if (g.logi.tiles.has(idx(i, j, k)) || w.reserved.has(idx(i, j, k)) || heldBy(g, i, j, k)) return 'Something is in the way (a belt, a machine, a rail piece or another shaft)';   // (a reserved cell is a rail piece, a ramp or stair volume, a pad of the level...: the cab's own key would free theirs when it comes down)
  }
  if (solid) return 'Something solid is already here';
  if (dig) return `Dig out ${dig} more plush first: the opening must be 4 wide, 4 long and 4 high`;
  let under = 0; for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) if (w.solid(s.i0 + dx, s.j - 1, s.k0 + dz)) under++;
  if (under < 8 && !landingAt(g, { i0: s.i0, k0: s.k0 }, s.j)) return 'No way to stand: set it on the ground, or at the mouth of a dug shaft with a floor beside it';
  return null;
}
export function planLift(g, tool, eye, dir) {
  const s = flatSpot(g, eye, dir); if (s.why) return bad(s.why);
  const ent = { type: 'plift', i0: s.i0, k0: s.k0, j: s.j, snap: s.snap }, why = cabCheck(g, s);
  let sc = null; if (!why) { try { sc = scanSpot(g, s); } catch (x) { sc = null; } }
  const cap = hoistCap(g);
  g._xInfo = { t: g.time + 0.35, title: 'ELEVATOR', lit: !why, lines: [`${s.snap}: a cab 4 x 4 cells and 4 high in a dug opening`, sc && sc.tr > 0 ? `Shaft below: ${m1(sc.tr)} m clear and shored, up to ${cap} m` : `Then dig a hollow 4 x 4 shaft straight down from it (up to ${cap} m) and shore it with frames: the cab extends down it by itself`, `${LIFT_KW} kW while it moves. Landings get call panels where a tunnel or pad opens into the shaft`] };
  if (why) return bad(why, ent);
  return { plan: { ok: true, ent }, cost: 0 };
}
export const previewLift = (g, tool, plan) => boxGhost(g, plan, 'tlift', CAB_ROWS, CAB_ROWS * C);
export function conflictLift(g, e, tool) {
  if (!e || typeof e !== 'object') return 'That placement is not valid'; const bi = wrongItem(tool, ['plift']); if (bi) return bi;
  return cabCheck(g, { i0: e.i0, k0: e.k0, j: e.j });
}
export function buildLift(g, tool, e) {
  if (conflictLift(g, e, tool)) return null;
  return { type: 'plift', i0: e.i0, k0: e.k0, j: e.j, cy: e.j * C, tg: null, q: [], dw: 0, dr: 1, tr: 0, ex: 0, rid: 'plift' };
}

// ---- the old call buttons: landings have panels built in now, so none can be set; a button from an old save still calls the cab to its own row ----
export function planCall() { return bad('Landings have call panels built in: dig the shaft and every side tunnel or pad that opens into it gets one'); }
export function previewCall(g) { g.machines.setGhost(null); }
export const conflictCall = () => 'Landings have call panels built in';
export const buildCall = () => null;
export function addCall(machines, e) {
  const g = machines.game; TS.epoch++;
  e.x = cellX(e.i); e.z = cellZ(e.k); e.y = e.j * C; e.y0 = e.y; e.h = 1.3; e.hr = 0.5; e.px = e.x; e.pz = e.z;
  if (!e.view) g.world.reserved.add(idx(e.i, e.j, e.k));
  const obj = M.callObject(); obj.position.set(e.x, e.y, e.z);
  return { obj, vis: '' };
}
export function removeCall(g, e) { g.world.reserved.delete(idx(e.i, e.j, e.k)); }

// ---- calling and riding ----
const cutText = (g, e, row, tail) => {
  const w = g.world; let what = 'something';
  for (const [i, j, k] of liftCells(e, row, row)) { const c = row >= NY ? 1 : w.get(i, j, k); if (c) { what = c === BULK ? 'a wall or a door' : c === PAD ? 'a floor pad' : 'plush'; break; } if (g.logi.tiles.has(idx(i, j, k))) { what = 'a belt or a machine'; break; } }
  return `The shaft is cut at ${m1(row)} m: ${what} is in it${tail ? ', ' + tail : ''}`;
};
// why the cab cannot go any lower, in a sentence (the readout, the refusal of a call past the end)
export function reachText(g, e) {
  const lo = e.j - (e.tr || 0);
  if (e.cut) return cutText(g, e, e.cut - 1, '');
  switch (e.wy) {
    case 'home': return 'The opening is blocked: the cab needs a clear 4 x 4 x 4 space';
    case 'unsupported': return `The shaft is not shored below ${m1(lo)} m: no frame is near enough to ${m1(e.wr)} m. Stack a frame down the shaft`;
    case 'cap': return `The tier reaches ${e.cm ?? hoistCap(g)} m below the cab: Deep Hoistways reach the whole hall`;
    case 'floor': return 'The shaft reaches the floor of the hall';
    default: return (e.tr || 0) > 0 ? `The shaft ends at ${m1(lo)} m: dig it deeper and the cab extends by itself` : 'No shaft yet: dig a hollow 4 x 4 tube straight down from the cab and shore it with frames';
  }
}
// the host's scan, applied to the ent. Reports a new cut once.
export function refreshShaft(g, e) {
  const r = scanShaft(g, e, Math.floor(e.cy / C + 1e-6)), prevLo = e.j - (e.tr || 0);
  const newCut = r.wy === 'blocked' && (e.tr || 0) > 0 && r.wr >= prevLo;
  e.tr = r.tr; e.wy = r.wy; e.wr = r.wr; e.sg = r.sg; e.sl = r.sl; e.cm = hoistCap(g);
  if (newCut) { e.cut = r.wr + 1; sayCut(g, e, r.wr, ''); }
  else if (e.cut && e.j - e.tr <= e.cut - 1) { e.cut = 0; if (String(TS.cutSaid).startsWith(e.id + ':')) TS.cutSaid = ''; }   // dug out: the next cut at that row is news again
}
function sayCut(g, e, row, tail) {
  const key = e.id + ':' + row; if (TS.cutSaid === key) return; TS.cutSaid = key;
  const msg = cutText(g, e, row, tail); g.ui.hint(msg + '.', 5); g.netSend({ t: 'toast', icon: '🛗', title: 'Elevator', text: msg }); sound(g, (s) => s.error());
}
// ask the cab to come to a stop row. Returns 'ok' | 'here' | 'queued' | a refusal text.
export function requestFloor(g, e, row) {
  const fl = floorsOf(g, e); if (!fl.includes(row)) return row < e.j - Math.floor((e.ex ?? 0) + 1e-6) ? reachText(g, e) : 'The elevator does not stop there';
  if (e.tg === null && Math.abs(e.cy - row * C) < 0.02) { e.dw = Math.max(e.dw, 0.6); return 'here'; }
  if (e.tg === row || (e.q || []).includes(row)) return 'queued';
  if ((e.q || []).length >= LIFT_QUEUE) return 'The elevator has too many calls waiting';
  { const cut = sweepBlocked(g, e, e.cy, row * C); if (cut >= 0) return cutText(g, e, cut, 'the cab stays at the last clear landing'); }   // a cut shaft: no cab runs through it
  e.cut = 0; TS.cutSaid = ''; e.q = [...(e.q || []), row]; return 'ok';
}
// The first row, in the order the cab would enter them, that something fills, for a cab whose floor goes from y0 to y1. -1 when the way is clear.
export function sweepBlocked(g, e, y0, y1) {
  const up = y1 > y0, bot = (y) => Math.floor(y / C + 1e-6), top = (y) => Math.ceil(y / C - 1e-6) + CAB_ROWS - 1;
  const rows = [];
  if (up) for (let r = top(y0) + 1; r <= top(y1); r++) rows.push(r); else for (let r = bot(y0) - 1; r >= bot(y1); r--) rows.push(r);
  for (const r of rows) if (rowBlock(g, e, r)) return r;
  return -1;
}
// the stop index the cab is at or heading for
const curIndex = (g, e) => { const fl = floorsOf(g, e), at = e.tg !== null ? e.tg : Math.round(e.cy / C); let bi = 0, bd = 1e9; fl.forEach((r, n) => { const d = Math.abs(r - at); if (d < bd) { bd = d; bi = n; } }); return { fl, i: bi }; };
// from inside the cab: dir 1 up, -1 down, 0 the next stop in the direction it last went (bouncing at the ends)
export function rideGo(g, e, dir) {
  const { fl, i } = curIndex(g, e); if (fl.length < 2) return 'This elevator has one stop only. ' + reachText(g, e);
  let n;
  if (dir > 0) n = Math.min(fl.length - 1, i + 1); else if (dir < 0) n = Math.max(0, i - 1);
  else { n = i + e.dr; if (n < 0 || n >= fl.length) { e.dr = -e.dr; n = i + e.dr; } }
  if (n === i) return dir > 0 ? 'The cab is at the top stop' : 'The cab is at the lowest stop. ' + reachText(g, e);
  e.dr = n > i ? 1 : -1;
  const r = requestFloor(g, e, fl[n]);
  if ((r === 'ok' || r === 'queued') && !((e.pw ?? 0) > 0.05)) e.hand = 1;   // no power: E in the cab turns the hand crank, slowly, so nobody is stuck in a shaft
  return r === 'ok' || r === 'queued' || r === 'here' ? null : r;
}
export function pressCall(g, b) {
  const L = entById(g, b.lid); if (!L || L.type !== 'plift') return 'This button has no elevator';
  const r = requestFloor(g, L, b.j); return r === 'ok' || r === 'queued' || r === 'here' ? null : r;
}

// ---- the cab and what is on it ----
const onSpan = (s, x, z, m) => x > s.x0 - m && x < s.x1 + m && z > s.z0 - m && z < s.z1 + m;
function underCar(g, e) {
  const s = liftSpan(e);
  for (const p of people(g)) if (onSpan(s, p.x, p.z, 0.3) && p.y < e.cy - 0.1 && p.y > e.cy - 2.2) return true;
  return false;
}
// loose plush on the cab floor ride with it (the floor of the cab is not a cell, so the pile's physics would let them fall down the shaft)
const BODY_R = 0.3;
function carryBodies(g, e) {
  const sim = g.sim; if (!sim || !sim.n) return;
  const s = liftSpan(e), hx = s.x0 + 0.2, hX = s.x1 - 0.2, hz = s.z0 + 0.2, hZ = s.z1 - 0.2, cy = e.cy;
  for (let i = 0; i < sim.n; i++) {
    const x = sim.x[i], z = sim.z[i]; if (x < hx || x > hX || z < hz || z > hZ) continue;
    const y = sim.y[i], bot = y - BODY_R; if (bot < cy - 0.35 || bot > cy + 0.2) continue;
    if (sim.vy[i] > 1.5 && bot > cy + 0.02) continue;   // thrown upward: it leaves
    sim.y[i] = cy + BODY_R + 0.005; if (sim.vy[i] < 0) sim.vy[i] = 0;
  }
}
export function tickLifts(g, dt) {
  let dirty = false;
  for (const it of itemsOf(g, 'plift')) {
    const e = it.ent, pw = e.pw ?? 0, powered = pw > 0.05, oldY = e.cy;
    // the shaft: scanned twice a second
    let sc = TS.scan.get(e.id) ?? 0; sc -= dt; if (sc <= 0) { sc = people(g).some((q) => Math.hypot(q.x - e.px, q.z - e.pz) < 150) ? SCAN_EVERY : 4; refreshShaft(g, e); } TS.scan.set(e.id, sc);   // an elevator nobody is near is looked at every few seconds, so it never keeps far chunks busy
    // the rails run out down the clear part of the shaft by themselves (a quarter of the pace without power, drawing nothing)
    const tr = e.tr || 0; let xt = 0, xc = 0; const was = e.ex ?? 0;
    if (was > tr) e.ex = Math.max(tr, Math.min(was, e.j - Math.floor(e.cy / C + 1e-6)));   // a cut draws the rails in, but never out from under the cab
    else if (was < tr) { e.ex = Math.min(tr, was + EXT_RATE * (powered ? Math.min(1, pw) : CRANK) * dt); if (powered) xt = 1; else xc = 1; }
    if (was < tr && e.ex >= tr && Math.floor(was + 1e-6) < tr) { const note = `The elevator reaches down to ${m1(e.j - tr)} m.`; if (Math.hypot(g.player.pos.x - e.px, g.player.pos.z - e.pz) < 30) g.ui.hint(note, 3.5); soundAt(g, e, 'lift', (s) => s.tone('sine', 660, 990, 0.2, 0.05)); }
    if (xt !== (e.xt | 0) || xc !== (e.xc | 0)) { e.xt = xt; e.xc = xc; dirty = true; }
    const fl = floorsOf(g, e);
    if (e.dw > 0) e.dw -= dt;
    if (e.tg !== null && !fl.includes(e.tg)) e.tg = null;
    if (e.tg === null && e.dw <= 0) {
      while (e.q.length && e.tg === null) { const n = e.q.shift(); if (fl.includes(n) && Math.abs(n * C - e.cy) > 0.02) e.tg = n; }
      if (e.tg === null && !e.q.length && !fl.some((r) => Math.abs(r * C - e.cy) < 0.02)) { let b = fl[0], bd = 1e9; for (const r of fl) { const d = Math.abs(r * C - e.cy); if (d < bd) { bd = d; b = r; } } e.tg = b; }   // the shaft no longer reaches the cab (a frame went, the rails drew in): back to the nearest stop
    }
    let mv = 0; e.blk = 0; e.crank = 0;
    if (e.tg !== null && (powered || e.hand)) {
      const ty = e.tg * C, d = ty - e.cy, dir = Math.sign(d);
      if (dir < 0 && underCar(g, e)) e.blk = 1;
      else {
        e.crank = powered ? 0 : 1;
        const step = Math.min(Math.abs(d), LIFT_SPEED * (powered ? Math.min(1, pw) : CRANK) * dt), cut = sweepBlocked(g, e, e.cy, e.cy + dir * step);
        if (cut >= 0) {
          // something filled the shaft (a collapse, a stray machine): stop here, go back to the last clear landing and say where
          e.crank = 0; e.q = []; const back = fl.filter((r) => (dir > 0 ? r * C <= e.cy + 1e-6 : r * C >= e.cy - 1e-6)); const land = back.length ? (dir > 0 ? Math.max(...back) : Math.min(...back)) : undefined;
          e.tg = land !== undefined && Math.abs(land * C - e.cy) > 0.02 ? land : null; e.cut = cut + 1;
          sayCut(g, e, cut, land !== undefined ? `the cab goes back to the ${m1(land)} m landing` : '');
        } else {
          e.cy += dir * step; mv = dir;
          if (Math.abs(ty - e.cy) < 1e-6) { e.cy = ty; e.tg = null; e.hand = 0; e.dw = 1.0; mv = 0; e.dr = dir || e.dr; soundAt(g, e, 'lift', (s) => s.tone('sine', 880, 880, 0.18, 0.05)); }
        }
      }
    }
    if (e.tg === null && !e.q.length) e.hand = 0;
    if (mv !== e.mv) { e.mv = mv; dirty = true; }
    liftPose(e); syncBox(g, e);
    if (g.player.liftId === e.id) g.player.pos.y = e.cy;   // the cab moves after the player's step: bring them with it now, not a frame late
    carryBodies(g, e);
    const dy = e.cy - oldY;
    if (CARRIERS.size) for (const fn of CARRIERS.values()) { try { fn(g, e, { cy: e.cy, dy, box: liftSpan(e) }); } catch (x) { /* a carrier of another wave must not stop the cab */ } }
    visLift(g, it);
  }
  if (dirty) g.power.markDirty();
}
export function guestLifts(g, dt) {
  for (const it of itemsOf(g, 'plift')) {
    const e = it.ent;
    if (e.mv && e.tg !== null && e.tg !== undefined) { const ty = e.tg * C, step = LIFT_SPEED * (e.crank ? CRANK : Math.min(1, e.pw || 1)) * dt; e.cy = Math.abs(ty - e.cy) <= step ? ty : e.cy + Math.sign(ty - e.cy) * step; }
    if ((e.xt || e.xc) && (e.ex ?? 0) < (e.tr || 0)) e.ex = Math.min(e.tr, (e.ex ?? 0) + EXT_RATE * (e.xt ? Math.min(1, e.pw || 1) : CRANK) * dt);
    liftPose(e); visLift(g, it);
    if (g.player.liftId === e.id) g.player.pos.y = e.cy;
  }
}
export const panelPos = (e, q, u) => {
  const x0 = xMin(e.i0), z0 = zMin(e.k0), a = (n) => (n + 0.5) * C - 0.18;
  return q === 0 ? { x: x0 + 4 * C + 0.22, z: z0 + a(u), yaw: Math.PI / 2 } : q === 1 ? { x: x0 + a(u), z: z0 + 4 * C + 0.22, yaw: 0 } : q === 2 ? { x: x0 - 0.22, z: z0 + a(u), yaw: -Math.PI / 2 } : { x: x0 + a(u), z: z0 - 0.22, yaw: Math.PI };
};
function visLift(g, it) {
  const e = it.ent, ex = e.ex ?? 0, car = it.obj.getObjectByName('car'); if (car) car.position.y = e.cy;
  const rails = it.obj.getObjectByName('rails'); if (rails) M.setRails(rails, (e.j - ex) * C, (e.j + CAB_ROWS) * C);
  const land = (Array.isArray(e.sg) ? e.sg : []).filter((s) => s[1] >= 0), pk = land.map((s) => s.join(',')).join(';') + '|' + e.j;
  if (it.pk !== pk) {
    const old = it.obj.getObjectByName('panels'); if (old) { g.machines.disposeObj(old); it.obj.remove(old); }
    const grp = new THREE.Group(); grp.name = 'panels';
    for (const [r, q, u] of land) { const o = M.callObject(), pp = panelPos(e, q, u); o.name = 'pn' + r; o.position.set(pp.x - e.px, r * C, pp.z - e.pz); M.aimCall(o, pp.yaw); grp.add(o); }
    it.obj.add(grp); it.pk = pk; it.pl = '';
  }
  const pg = it.obj.getObjectByName('panels'), lit = (e.pw ?? 0) > 0.05;
  if (pg) for (const o of pg.children) {
    const r = +o.name.slice(2), st = !lit ? 'dead' : e.tg === null && Math.abs(e.cy - r * C) < 0.05 ? 'here' : e.tg === r || (e.q || []).includes(r) ? 'coming' : 'idle';
    if (o.userData.st !== st) { o.userData.st = st; M.setCallLamp(o, st); }
  }
  const st = e.mv ? 'moving' : lit ? 'idle' : 'dead'; if (it.vis !== st) { it.vis = st; M.setLiftLamp(it.obj, st); }
}
// the lamp of an old call button: green when the cab is at its floor, amber when it is on its way
function visCalls(g) {
  for (const it of lists(g).callbtn) {
    const b = it.ent, L = entById(g, b.lid); if (!L) { if (it.vis !== 'x') { it.vis = 'x'; M.setCallLamp(it.obj, 'dead'); } continue; }
    const st = (L.pw ?? 0) <= 0.05 ? 'dead' : L.tg === null && Math.abs(L.cy - b.j * C) < 0.05 ? 'here' : (L.tg === b.j || (L.q || []).includes(b.j)) ? 'coming' : 'idle';
    if (it.vis !== st) { it.vis = st; M.setCallLamp(it.obj, st); }
    if (it.aimed !== L.id) { it.aimed = L.id; M.aimCall(it.obj, Math.atan2(b.x - L.px, b.z - L.pz)); }
  }
}
const stopLabel = (e, s) => `${m1(s[0])} m${s[0] === e.j ? ' (home)' : s[1] >= 0 ? '' : ' (bottom)'}`;
export function infoLift(g, e) {
  const fl = floorsOf(g, e), tr = e.tr || 0, ex = Math.floor(Math.min(e.ex ?? 0, tr) + 1e-6), cap = e.cm ?? hoistCap(g);
  const here = e.tg === null ? fl.find((r) => Math.abs(r * C - e.cy) < 0.05) : undefined;
  const aim = TS.aim && TS.aim.id === e.id && TS.aim.t > g.time - 0.4 ? TS.aim.row : undefined;
  const sg = (Array.isArray(e.sg) ? e.sg : []).filter((s) => fl.includes(s[0])), land = sg.filter((s) => s[1] >= 0).length;
  const air = staleAt(Math.hypot(e.px, e.pz)), dist = Math.round(Math.hypot(e.px, e.pz));
  const lines = [aim !== undefined ? `Landing at ${m1(aim)} m: E calls the cab here` : null,
    `Cab at ${e.cy.toFixed(1)} m${e.mv ? (e.mv > 0 ? ', going up' : ', going down') : here !== undefined ? ', waiting' : ''}${e.blk ? ' (stopped: someone is under the cab)' : ''}`,
    `Reach: ${m1(ex)} m below the home stop at ${m1(e.j)} m (the shaft allows ${m1(tr)} m, this tier ${cap} m)${ex < tr ? ', the rails are still running out' : ''}`,
    `Stops: ${sg.slice(0, 8).map((s) => stopLabel(e, s)).join(', ')}${sg.length > 8 ? `, and ${sg.length - 8} more` : ''} (${land} landing${land === 1 ? '' : 's'} with call panels)`,
    (e.q || []).length ? `${e.q.length} call${e.q.length > 1 ? 's' : ''} waiting` : null,
    e.cut ? `Stopped: ${cutText(g, e, e.cut - 1, '')}. Dig it out and the cab runs on by itself` : reachText(g, e),
    e.sl > 0 ? `Shoring: the busiest frame near the shaft carries ${e.sl}% (it breaks at 100%)` : null,
    air > 0 ? `Air at ${dist} m out: ${Math.round(air * 100)}% stale, hang a Support Fan on a shaft frame` : 'Air at this distance is still fresh',
    powerLine(e) + `. ${LIFT_SPEED} m/s, ${LIFT_KW} kW only while it moves or the rails run out`,
    !((e.pw ?? 0) > 0.05) ? `No power: E in the cab turns the hand crank (${(LIFT_SPEED * CRANK).toFixed(2)} m/s, no power drawn)` : null,
    'Carries you, a friend, your carts and loose plush. Plush that falls into the shaft cuts it',
    fl.length > 1 ? 'E in the cab: look up to go up, look down to go down, level for the next stop. E on a landing panel calls it' : 'Dig a shaft down from the cab, shore it with frames, and it runs down by itself'];
  return { title: 'ELEVATOR', lit: (e.pw ?? 0) > 0.05, lines: lines.filter(Boolean) };
}
export function infoCall(g, e) {
  const L = entById(g, e.lid); if (!L) return { title: 'LIFT CALL BUTTON', lit: false, lines: ['No elevator: this old button stands for nothing'] };
  const at = L.tg === null && Math.abs(L.cy - e.j * C) < 0.05;
  return { title: 'LIFT CALL BUTTON', lit: (L.pw ?? 0) > 0.05, lines: [`Calls the cab to ${(e.j * C).toFixed(1)} m (landings have panels built in now)`, at ? 'The cab is here' : `The cab is at ${L.cy.toFixed(1)} m${L.mv ? ', moving' : ''}`, powerLine(L), 'E calls the cab'] };
}

// the player's hook: stand on the cab and be carried (called from player.js inside the step loop)
const HALF = 2 * C + 0.1;
export function rideStep(g, pl) {
  let any = false;
  for (const it of lists(g).plift) {
    const e = it.ent;
    const dx = pl.pos.x - e.px, dz = pl.pos.z - e.pz;
    const inside = Math.abs(dx) < HALF && Math.abs(dz) < HALF;
    if (pl.liftId === e.id) {
      if (!inside || pl.vel.y > 1.2) { pl.liftId = 0; continue; }
      pl.pos.y = e.cy; if (pl.vel.y < 0) pl.vel.y = 0; any = true; continue;
    }
    if (inside && pl.pos.y >= e.cy - 0.4 && pl.pos.y <= e.cy + 0.15 && pl.vel.y <= 0.3) { pl.liftId = e.id; pl.pos.y = e.cy; if (pl.vel.y < 0) pl.vel.y = 0; any = true; }
  }
  if (!any && pl.liftId && !g.machines.items.has(pl.liftId)) pl.liftId = 0;
  return any;
}
// the cart's hook (cart.js): a cab carries a cart that stands on it
export function cartSupport(g, x, z, feet, cart) {
  for (const it of lists(g).plift) {
    const e = it.ent;
    const inside = Math.abs(x - e.px) < HALF && Math.abs(z - e.pz) < HALF;
    if (cart.liftId === e.id) { if (inside) return e.cy; cart.liftId = 0; continue; }
    if (inside && feet >= e.cy - 0.45 && feet <= e.cy + 0.3) { cart.liftId = e.id; return e.cy; }
  }
  return null;
}
// the cab under a position (a person's feet), or null
export function carUnder(g, pos) {
  for (const it of lists(g).plift) { const e = it.ent; if (Math.abs(pos.x - e.px) < HALF && Math.abs(pos.z - e.pz) < HALF && pos.y >= e.cy - 0.4 && pos.y <= e.cy + 0.15) return e; }
  return null;
}
// the cart trails someone who rides a cab: it rolls into the corner of the cab away from them, so it goes up and down with them
export function cartFollow(g, who, cart) {
  const L = carUnder(g, who.pos); if (!L) return null;
  const sx = who.pos.x >= L.px ? -1 : 1, sz = who.pos.z >= L.pz ? -1 : 1;
  return { x: L.px + sx * 0.6, z: L.pz + sz * 0.6 };
}
// the elevator the local player stands on, if any
export const myLift = (g) => { const id = g.player.liftId; return id ? entById(g, id) : null; };

// ================================================================ JUMP PADS and CUSHION PADS
export const launchVel = (e) => {
  const a = clamp(e.ang ?? ANGLE_DEFAULT, 0, 90) * Math.PI / 180, h = (e.hd || 0) * Math.PI / 180, vh = JUMP_SPEED * Math.cos(a);
  return { vx: Math.sin(h) * vh, vy: Math.max(JUMP_MINVY, Math.sin(a) * JUMP_SPEED), vz: Math.cos(h) * vh };
};
// The path a player takes from the middle of the pad with no steering, stepped exactly like player.js (gravity first, then the move). Ends where the feet meet something solid.
export function trajectory(g, e, o = {}) {
  const w = g.world, v = launchVel(e), dt = 1 / 60;
  let x = e.x, y = e.y + 0.02, z = e.z, vx = v.vx, vy = v.vy, vz = v.vz, t = 0, apex = y, hit = 'time';
  const pts = [[x, y, z]];
  for (let n = 0; n < 900; n++) {
    vy -= GRAV * dt; x += vx * dt; y += vy * dt; z += vz * dt; t += dt;
    if (y > apex) apex = y;
    if (vy < 0 && y <= 0) { y = 0; hit = 'floor'; break; }
    const i = toI(x), k = toK(z);
    if (!w.inside(i, 0, k)) { hit = 'edge'; break; }
    { const jf = toJ(y - 0.04); if (vy < 0 && y > 0 && w.solid(i, jf, k) && !w.solid(i, jf + 1, k)) { y = (jf + 1) * C + 0.03; hit = 'ground'; break; } }   // feet meet a top; if the cell above is solid too it is a side: that is a wall, below
    if (w.solid(i, toJ(y + 0.3), k) || w.solid(i, toJ(y + 0.9), k) || w.solid(i, toJ(y + 1.5), k)) { hit = 'wall'; break; }
    if (n % 4 === 0 && pts.length < 88) pts.push([x, y, z]);
  }
  pts.push([x, y, z]);
  return { pts, land: { x, y, z }, t, apex, range: Math.hypot(x - e.x, z - e.z), hit, v };
}
const jumpSt = (e) => (e.on === false ? 'off' : (e.pw ?? 0) <= 0.05 ? 'off' : e.cool > 0 ? 'cool' : (e.buf ?? JUMP_BUF) < JUMP_BUF ? 'low' : 'ready');
export function onPad(pos, e) { return Math.abs(pos.x - e.x) < 2 * C + 0.05 && Math.abs(pos.z - e.z) < 2 * C + 0.05 && pos.y >= e.y - 0.3 && pos.y <= e.y + 0.3; }
// spend a charge (host). Returns null when it fires, otherwise why not.
export function fireJump(g, e) {
  if (e.on === false) return 'The pad is switched off';
  if (!((e.pw ?? 0) > 0.05)) return 'The jump pad has no power';
  if (e.cool > 0) return `The jump pad is recharging (${Math.ceil(e.cool)} s)`;
  if ((e.buf ?? JUMP_BUF) <= 0) return 'The jump pad is empty';
  e.buf = (e.buf ?? JUMP_BUF) - 1; e.act = 1.5; e.rg = 0;
  if (e.buf <= 0) e.cool = JUMP_COOL;
  g.power.markDirty();
  return null;
}
// push a player off: velocity, flight mode (momentum kept), a launched flag for the landing rule
export function launchPlayer(g, pl, v) {
  pl.vel.set(v.vx, v.vy, v.vz); pl.onGround = false; pl.pos.y += 0.03; pl.flight = 0.001; pl.launched = true; pl.launchLock = 0.6; pl.liftId = 0;
  sound(g, (s) => { s.tone('sawtooth', 180, 620, 0.22, 0.07); s.tone('sine', 300, 900, 0.3, 0.05); });
  if (g.fx) { try { g.fx.dust(pl.pos.x, pl.pos.y + 0.1, pl.pos.z, 8, 0.8, 1); g.fx.sparkle(pl.pos.x, pl.pos.y + 0.2, pl.pos.z, 10, 0.5, 1, 0.7); } catch (x) { /* fx are optional */ } }
}
export const launchesTrucks = (g) => !!(g.T && g.T.jumpTrucks);   // never: a Haul Truck is not thrown (spec: keep it off)

export function tickJumps(g, dt) {
  const list = itemsOf(g, 'jump'); let dirty = false;
  for (const it of list) {
    const e = it.ent; e.buf = e.buf ?? JUMP_BUF; e.cool = e.cool || 0; e.act = Math.max(0, (e.act || 0) - dt);
    const pw = Math.min(1, e.pw ?? 0), before = kwOf(e);
    if (e.on !== false && pw > 0.05) {
      if (e.cool > 0) { e.cool -= dt * pw; if (e.cool <= 0) { e.cool = 0; e.buf = JUMP_BUF; } }
      else if (e.buf < JUMP_BUF) { e.rg = (e.rg || 0) + dt * pw; if (e.rg >= JUMP_COOL / JUMP_BUF) { e.rg = 0; e.buf++; } }
    }
    if (kwOf(e) !== before) dirty = true;
    visJump(it);
  }
  if (dirty) g.power.markDirty();
  const pl = g.player; pl.launchLock = Math.max(0, (pl.launchLock || 0) - dt);
  if (!list.length) return;
  if (!g.dead && pl.launchLock <= 0 && pl.vel.y <= 1.5) for (const it of list) {
    const e = it.ent; if (!onPad(pl.pos, e)) continue;
    const why = fireJump(g, e);
    if (why) { if (g.time - TS.hintAt > 2.5) { TS.hintAt = g.time; g.ui.hint(why + '.', 2.5); sound(g, (s) => s.error()); } continue; }
    launchPlayer(g, pl, launchVel(e)); break;
  }
  // a friend on a pad (the host sees them through the position messages and tells their screen to launch)
  const r = g.remote && g.net && g.net.open && g.net.role === 'host' ? g.remote.pos : null;
  if (r && r.y > -40) for (const it of list) {
    const e = it.ent; if (!onPad(r, e)) continue;
    if ((TS.lockUntil.get(e.id) || 0) > g.time) continue;
    const why = fireJump(g, e); if (why) continue;
    TS.lockUntil.set(e.id, g.time + 0.8);
    soundAt(g, e, 'pad', (q) => { q.tone('sawtooth', 180, 620, 0.22, 0.07); q.tone('sine', 300, 900, 0.3, 0.05); });   // the host hears the pad throw its friend, from the pad
    const v = launchVel(e); g.netSend({ t: 'xrow', k: 'transit', d: { ev: { k: 'launch', id: e.id, vx: +v.vx.toFixed(3), vy: +v.vy.toFixed(3), vz: +v.vz.toFixed(3) } } }); break;
  }
}
export function guestJumps(g, dt) {
  for (const it of itemsOf(g, 'jump')) visJump(it);
  const pl = g.player; pl.launchLock = Math.max(0, (pl.launchLock || 0) - dt);
}
function visJump(it) { const e = it.ent, st = jumpSt(e), key = st + (e.hd || 0); if (it.vis !== key) { it.vis = key; M.setJump(it.obj, e.hd || 0, st); } }

// does a fall end softly? A Cushion Pad under you always; after a launch also a Jump Pad or the plush pile. A hard floor, pad or catwalk is as hard as ever.
export function landSafe(g, pl) {
  for (const e of entsOf(g, 'cushion')) if (Math.abs(pl.pos.x - e.x) < 2 * C + 0.1 && Math.abs(pl.pos.z - e.z) < 2 * C + 0.1 && Math.abs(pl.pos.y - e.y) < 0.6) return true;
  if (!pl.launched) return false;
  for (const e of entsOf(g, 'jump')) if (onPad(pl.pos, e)) return true;
  const w = g.world, i = toI(pl.pos.x), k = toK(pl.pos.z);
  for (const dy of [0.3, 0.55]) { const j = toJ(pl.pos.y - dy); if (j >= 0 && w.inside(i, j, k)) { const c = w.get(i, j, k); if (c && !isSpecialCell(c)) return true; } }
  return false;
}

// placement of a jump pad and a cushion pad
const jumpAng = (g) => { const a = g._jang; return a === undefined ? ANGLE_DEFAULT : a; };
const headingOf = (g, yaw) => ((Math.round(((yaw * 180 / Math.PI) % 360 + 360) % 360 / HEAD_STEP) + (g._jr || 0)) * HEAD_STEP % 360 + 360) % 360;
export function planJump(g, tool, eye, dir, yaw) {
  const s = flatSpot(g, eye, dir); if (s.why) return bad(s.why);
  const ent = { type: 'jump', i0: s.i0, k0: s.k0, j: s.j, ang: jumpAng(g), hd: headingOf(g, yaw), snap: s.snap };
  ent.x = cellX(s.i0) + 1.5 * C; ent.z = cellZ(s.k0) + 1.5 * C; ent.y = s.j * C;
  const why = flatCheck(g, s, CAR_ROWS), tr = trajectory(g, ent);
  g._xInfo = { t: g.time + 0.35, title: 'JUMP PAD', lit: !why, lines: [`${s.snap}: ${ent.ang} degrees up, facing ${ent.hd}`, `Lands ${tr.range.toFixed(1)} m away, ${tr.apex - ent.y > 0 ? (tr.apex - ent.y).toFixed(1) : '0.0'} m up, ${tr.t.toFixed(1)} s in the air`, '- and = set the angle, R turns it, Shift+R turns it back'] };
  if (why) return bad(why, ent);
  return { plan: { ok: true, ent }, cost: 0 };
}
export function previewJump(g, tool, plan) {
  const mc = g.machines; if (!plan || !plan.ent) { mc.setGhost(null); return; }
  const e = plan.ent, key = `tjump${plan.ok}${e.i0},${e.k0},${e.j},${e.ang},${e.hd}`;
  if (mc.ghostKey !== key) {
    const x0 = xMin(e.i0), z0 = zMin(e.k0), grp = new THREE.Group();
    grp.add(ghostBoxes([{ x0, x1: x0 + 4 * C, z0, z1: z0 + 4 * C, y0: e.j * C, y1: e.j * C + 0.12 }], plan.ok));
    const tr = trajectory(g, { ...e, x: x0 + 2 * C, z: z0 + 2 * C, y: e.j * C }), ln = M.lineObject(); M.setLine(ln, tr.pts, plan.ok ? 0x7dffb0 : 0xff8a7a); grp.add(ln);
    if (mc.ghost && mc.ghost.userData && mc.ghost.userData.tjump) mc.disposeObj(mc.ghost);   // the path tube is rebuilt at every aim step: free the old one's buffers
    grp.userData.tjump = true; mc.setGhost(grp, key);
  }
}
export function conflictJump(g, e, tool) {
  if (!e || typeof e !== 'object') return 'That placement is not valid'; const bi = wrongItem(tool, ['jump']); if (bi) return bi;
  if (e.ang !== undefined && !(int(e.ang, 0, 90) && e.ang % ANGLE_STEP === 0)) return 'That angle is not valid';
  if (e.hd !== undefined && !(int(e.hd, 0, 345) && e.hd % HEAD_STEP === 0)) return 'That heading is not valid';
  return flatCheck(g, { i0: e.i0, k0: e.k0, j: e.j }, CAR_ROWS);
}
export function buildJump(g, tool, e) {
  if (conflictJump(g, e, tool)) return null;
  const ang = e.ang === undefined ? ANGLE_DEFAULT : e.ang, hd = e.hd === undefined ? 0 : e.hd;
  return { type: 'jump', i0: e.i0, k0: e.k0, j: e.j, ang, hd, on: true, buf: JUMP_BUF, cool: 0, rid: 'jump' };
}
export function planCushion(g, tool, eye, dir) {
  const s = flatSpot(g, eye, dir); if (s.why) return bad(s.why);
  const ent = { type: 'cushion', i0: s.i0, k0: s.k0, j: s.j, snap: s.snap }, why = flatCheck(g, s, 1);
  g._xInfo = { t: g.time + 0.35, title: 'CUSHION PAD', lit: !why, lines: [`${s.snap}: a soft mat, 2.4 m square`, 'A fall onto it does no harm. Put one where a jump pad lands you'] };
  if (why) return bad(why, ent);
  return { plan: { ok: true, ent }, cost: 0 };
}
export const previewCushion = (g, tool, plan) => boxGhost(g, plan, 'tcush', 1, 0.15);
export const conflictCushion = (g, e, tool) => (!e || typeof e !== 'object' ? 'That placement is not valid' : wrongItem(tool, ['cushion']) || flatCheck(g, { i0: e.i0, k0: e.k0, j: e.j }, 1));
export function buildCushion(g, tool, e) { if (conflictCushion(g, e, tool)) return null; return { type: 'cushion', i0: e.i0, k0: e.k0, j: e.j, rid: 'cushion' }; }
const flatPose = (e) => { e.x = cellX(e.i0) + 1.5 * C; e.z = cellZ(e.k0) + 1.5 * C; e.y = e.j * C; e.px = e.x; e.pz = e.z; e.y0 = e.y; e.cx = e.x; e.cz = e.z; e.hr = 1.5; };
export function addJump(machines, e) {
  const g = machines.game; TS.epoch++;
  e.ang = int(e.ang, 0, 90) ? e.ang - (e.ang % ANGLE_STEP) : ANGLE_DEFAULT; e.hd = int(e.hd, 0, 345) ? e.hd - (e.hd % HEAD_STEP) : 0; e.buf = int(e.buf, 0, JUMP_BUF) ? e.buf : JUMP_BUF; e.cool = +e.cool > 0 ? +e.cool : 0; e.act = 0;
  if (e.on === undefined) e.on = true; e.h = 0.12; flatPose(e);
  if (!e.view) for (const [i, j, k] of liftCells({ i0: e.i0, k0: e.k0 }, e.j, e.j)) g.world.reserved.add(idx(i, j, k));
  const obj = M.jumpObject(); obj.position.set(e.x, e.y, e.z);
  const it = { obj, vis: '' }; M.setJump(obj, e.hd, jumpSt(e)); return it;
}
export function addCushion(machines, e) {
  const g = machines.game; TS.epoch++; e.h = 0.15; flatPose(e);
  if (!e.view) for (const [i, j, k] of liftCells({ i0: e.i0, k0: e.k0 }, e.j, e.j)) g.world.reserved.add(idx(i, j, k));
  const obj = M.cushionObject(); obj.position.set(e.x, e.y, e.z); return { obj };
}
export function removeFlat(g, e) { for (const [i, j, k] of liftCells({ i0: e.i0, k0: e.k0 }, e.j, e.j)) g.world.reserved.delete(idx(i, j, k)); }
export function infoJump(g, e) {
  const tr = trajectory(g, e), st = jumpSt(e);
  const lines = [`${e.ang} degrees up, facing ${e.hd} degrees (0 is +z, 90 is +x). ${JUMP_SPEED} m/s`,
    `Lands ${tr.range.toFixed(1)} m away, ${Math.max(0, tr.apex - e.y).toFixed(1)} m up, ${tr.t.toFixed(1)} s in the air${tr.hit === 'wall' ? ' (a wall is in the way)' : ''}`,
    st === 'cool' ? `Recharging: ${Math.ceil(e.cool)} s` : `Charges ${e.buf} of ${JUMP_BUF}${e.buf < JUMP_BUF ? ', one comes back every ' + (JUMP_COOL / JUMP_BUF).toFixed(1) + ' s' : ''}`,
    powerLine(e) + `. ${JUMP_STANDBY} kW standing by, ${JUMP_KW} kW while it charges`,
    'Land on a Cushion Pad, a Jump Pad or the plush pile and you are not hurt',
    'E: 5 degrees steeper (crouch + E: turn 15 degrees). Shift+E copies the angle and heading'];
  return { title: `JUMP PAD · ${st === 'ready' ? 'READY' : st === 'low' ? 'CHARGING' : st === 'cool' ? 'RECHARGING' : e.on === false ? 'SWITCHED OFF' : 'NO POWER'}`, lit: st === 'ready' || st === 'low', lines };
}
export const infoCushion = () => ({ title: 'CUSHION PAD', lit: true, lines: ['A soft mat. Landing on it never hurts, from any height', 'Set one where a Jump Pad throws you'] });
export function useJump(g, e, crouch) {
  const patch = crouch ? { hd: (e.hd + HEAD_STEP) % 360 } : { ang: e.ang + ANGLE_STEP > 90 ? 0 : e.ang + ANGLE_STEP };
  const r = g.setCfg(e, patch);
  if (r.ok) { sound(g, (s) => s.tone('triangle', 520, 700, 0.06, 0.05)); g.ui.hint(crouch ? `Heading ${patch.hd} degrees.` : `Angle ${patch.ang} degrees.`, 1.5); } else { sound(g, (s) => s.error()); g.ui.hint(r.why || 'Could not change that', 2); }
  return true;
}

// the trajectory line while you aim at a jump pad or stand on one
export function lineTick(g) {
  const eye = g.renderer.camera.position, dir = g.player.forward(g._trDir || (g._trDir = eye.clone()));
  let best = null, bd = 6;
  for (const e of entsOf(g, 'jump')) { const t = rayBox(eye, dir, { x0: e.x - 1.2, x1: e.x + 1.2, y0: e.y, y1: e.y + 0.4, z0: e.z - 1.2, z1: e.z + 1.2 }); if (t !== null && t < bd) { bd = t; best = e; } }
  const tool = !g.stowed && g.curTool && g.curTool(); if (tool && tool.kind === 'jump') best = null;   // the placement ghost draws its own
  if (!TS.line) { TS.line = M.lineObject(); g.renderer.scene.add(TS.line); }
  if (!best) { if (TS.line.visible) TS.line.visible = false; TS.lineKey = ''; return; }
  const key = `${best.id}${best.ang}${best.hd}${best.x}${best.z}${best.y}${Math.floor(g.time * 2)}`;
  TS.line.visible = true; if (key === TS.lineKey) return; TS.lineKey = key;
  const tr = trajectory(g, best); M.setLine(TS.line, tr.pts, tr.hit === 'wall' ? 0xffb347 : 0x7dffb0);
}

// ================================================================ picking (ray against the boxes of transit things)
export function rayBox(o, d, b) {
  let t0 = 0, t1 = 1e9;
  for (const [a, lo, hi, dd] of [[o.x, b.x0, b.x1, d.x], [o.y, b.y0, b.y1, d.y], [o.z, b.z0, b.z1, d.z]]) {
    if (Math.abs(dd) < 1e-9) { if (a < lo || a > hi) return null; continue; }
    let ta = (lo - a) / dd, tb = (hi - a) / dd; if (ta > tb) { const q = ta; ta = tb; tb = q; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return null;
  }
  return t0;
}
const pickBoxes = (e) => {
  if (e.type === 'door') {
    const s = doorSpec(e), x0 = xMin(e.i0), z0 = zMin(e.k0), x1 = x0 + s.nx * C, z1 = z0 + s.nz * C, y0 = e.j * C, f = freedOf(e.p) * C, out = [];   // the leaf box is the rows that are solid, so the hammer never reaches a bare door cell
    const along = s.nx > 1;   // the door spans x
    const fr = (a0, a1, b0, b1, c0, c1) => (along ? { x0: a0, x1: a1, y0: b0, y1: b1, z0: c0, z1: c1 } : { z0: a0, z1: a1, y0: b0, y1: b1, x0: c0, x1: c1 });
    const lo = along ? x0 : z0, hi = along ? x1 : z1, mid = along ? z0 : x0, midE = along ? z1 : x1;
    if (f < 4 * C - 0.05) out.push(fr(lo, hi, y0 + f, y0 + 4 * C, mid, midE));          // the leaf
    out.push(fr(lo - 0.2, lo + 0.1, y0, y0 + 4 * C + 0.2, mid, midE), fr(hi - 0.1, hi + 0.2, y0, y0 + 4 * C + 0.2, mid, midE), fr(lo, hi, y0 + 4 * C - 0.1, y0 + 4 * C + 0.2, mid, midE));   // posts and lintel
    return out;
  }
  if (e.type === 'plift') {
    const s = liftSpan(e), out = [];
    for (const a of Array.isArray(e.sg) ? e.sg : []) if (a[1] >= 0) { const pp = panelPos(e, a[1], a[2]); out.push({ x0: pp.x - 0.25, x1: pp.x + 0.25, y0: a[0] * C, y1: a[0] * C + 1.5, z0: pp.z - 0.25, z1: pp.z + 0.25, row: a[0] }); }   // a landing's call panel
    out.push({ x0: s.x0 + 0.1, x1: s.x1 - 0.1, y0: e.cy - 0.12, y1: e.cy + CAB_ROWS * C - 0.1, z0: s.z0 + 0.1, z1: s.z1 - 0.1, cab: true });   // the cab (a ray that starts inside it, from a rider's eyes, does not find it: what is aimed at beyond its walls is what E is for)
    return out;
  }
  if (e.type === 'callbtn') return [{ x0: e.x - 0.2, x1: e.x + 0.2, y0: e.y, y1: e.y + 1.4, z0: e.z - 0.2, z1: e.z + 0.2 }];
  if (e.type === 'jump' || e.type === 'cushion') return [{ x0: e.x - 1.2, x1: e.x + 1.2, y0: e.y, y1: e.y + 0.3, z0: e.z - 1.2, z1: e.z + 1.2 }];
  return [];
};
// the nearest transit ent along the ray: { ent, t } or null
export function pick(g, eye, dir, maxD = 3.6) {
  let best = null, bt = maxD, brow;
  const L = lists(g);
  for (const type of TRANSIT_TYPES) for (const it of L[type]) {
    const e = it.ent;
    for (const b of pickBoxes(e)) { const t = rayBox(eye, dir, b); if (t !== null && t < bt && !(b.cab && t <= 0)) { bt = t; best = e; brow = b.row; } }
  }
  if (best && best.type === 'plift') TS.aim = brow !== undefined ? { id: best.id, row: brow, t: g.time } : null;   // aimed at a landing panel: the readout says which landing
  return best ? { ent: best, t: bt, row: brow } : null;
}

// ================================================================ names, readouts, keys
export function nameOf(e) {
  return e.type === 'door' ? (e.blast ? 'Blast Door' : 'Door') : e.type === 'plift' ? 'Elevator' : e.type === 'callbtn' ? 'Lift Call Button' : e.type === 'jump' ? 'Jump Pad' : e.type === 'cushion' ? 'Cushion Pad' : null;
}
export function itemOfEnt(e) { return e.type === 'door' ? (e.blast ? 'door:blast' : 'door') : e.type; }
export function infoOf(g, e) {
  return e.type === 'door' ? infoDoor(g, e) : e.type === 'plift' ? infoLift(g, e) : e.type === 'callbtn' ? infoCall(g, e) : e.type === 'jump' ? infoJump(g, e) : e.type === 'cushion' ? infoCushion() : null;
}
// E (game.useKey calls it after the catalog's own paste). True when it did something.
export function useKey(g) {
  const eye = g.renderer.camera.position, dir = g.player.forward(g._trUse || (g._trUse = eye.clone()));
  const pk = pick(g, eye, dir, 3.4), mine = myLift(g);
  let e = pk ? pk.ent : null;
  if (!e && mine) { if (g.logi.pick(eye, dir, 3.4) || (g.pickEarth && g.pickEarth())) return false; e = mine; }   // standing in the car with a belt, a machine or an earth mover under the crosshair: E belongs to that
  if (!e) return false;
  const grp = { door: 'doorcfg', jump: 'jumpcfg' }[e.type];
  if (grp && g.cfgClip && g.cfgClip.group === grp) { const r = g.pasteCfg(e); if (r.ok) { sound(g, (s) => s.place()); g.ui.hint('Settings pasted.', 2); } else { sound(g, (s) => s.error()); g.ui.hint(r.why || 'Could not paste', 2.5); } return true; }
  if (e.type === 'door') return useDoor(g, e);
  if (e.type === 'jump') return useJump(g, e, KB.down(g.keys, 'crouch'));
  if (e.type === 'callbtn') { const r = g.setCfg(e, { press: 1 }); if (r.ok) { sound(g, (s) => s.tone('triangle', 660, 660, 0.08, 0.06)); g.ui.hint('Called the elevator.', 1.5); } else { sound(g, (s) => s.error()); g.ui.hint(r.why || 'The elevator does not answer', 2.5); } return true; }
  if (e.type === 'plift' && pk && pk.row !== undefined && pk.ent === e) {   // a landing's call panel: bring the cab to that row
    if (isHost(g)) { const r = requestFloor(g, e, pk.row); if (r === 'ok' || r === 'queued' || r === 'here') { sound(g, (s) => s.tone('triangle', 660, 660, 0.08, 0.06)); g.ui.hint(r === 'here' ? 'The cab is here.' : 'Called the elevator.', 1.5); } else { sound(g, (s) => s.error()); g.ui.hint(r + '.', 3); } return true; }
    const r = g.setCfg(e, { call: pk.row }); if (!r.ok) { sound(g, (s) => s.error()); g.ui.hint(r.why || 'The elevator does not answer', 2.5); } else { sound(g, (s) => s.tone('triangle', 660, 660, 0.08, 0.06)); g.ui.hint('Called the elevator.', 1.5); }
    return true;
  }
  if (e.type === 'plift') {
    const p = g.player.pitch, dirReq = p > 0.35 ? 1 : p < -0.35 ? -1 : 0;
    if (isHost(g)) { const why = rideGo(g, e, dirReq); if (why) { sound(g, (s) => s.error()); g.ui.hint(why + '.', 2.5); } else sound(g, (s) => s.tone('triangle', 660, 660, 0.08, 0.06)); return true; }
    const r = g.setCfg(e, { go: dirReq }); if (!r.ok) { sound(g, (s) => s.error()); g.ui.hint(r.why || 'The elevator does not answer', 2.5); } else sound(g, (s) => s.tone('triangle', 660, 660, 0.08, 0.06));
    return true;
  }
  if (e.type === 'cushion') { g.ui.hint('Nothing to set: just land on it.', 2); return true; }
  return false;
}
// R turns a door (like a wall) or a jump pad's heading while you hold one. True when handled.
export function rotateKey(g, tool, shift) {
  if (!tool) return false;
  if (tool.kind === 'door') { g._bRot = (((g._bRot || 0) + 1) & 3); g.ui.hint('Turned a quarter.', 1.2); g.machines.setGhost(null); return true; }
  if (tool.kind === 'jump') { g._jr = (((g._jr || 0) + (shift ? -1 : 1)) % 24 + 24) % 24; g.ui.hint(`Turned ${shift ? 'back' : 'on'} by ${HEAD_STEP} degrees.`, 1.2); g.machines.setGhost(null); return true; }
  return false;
}
// - and = set a jump pad's angle before you place it
export function zoopKey(g, tool, delta) {
  if (!tool || tool.kind !== 'jump') return false;
  g._jang = clamp(jumpAng(g) + delta * ANGLE_STEP, 0, 90); g.ui.hint(`Launch angle ${g._jang} degrees.`, 1.5); g.machines.setGhost(null); return true;
}

// ================================================================ rows (host to guest every 0.5 s) and events
export function rowFor(g) {
  const d = { dr: [], lf: [], jp: [] };
  for (const it of g.machines.items.values()) {
    const e = it.ent;
    if (e.type === 'door') d.dr.push([e.id, Math.round(e.p * 1000), e.tgt ? 1 : 0, (e.draw ? 1 : 0) | (e.crank ? 2 : 0), Math.round((e.pw || 0) * 100)]);
    else if (e.type === 'plift') d.lf.push([e.id, Math.round(e.cy * 100), e.tg === null ? -1 : e.tg, e.mv, Math.round((e.pw || 0) * 100), (e.q || []).length, (e.blk ? 1 : 0) | (e.crank ? 2 : 0) | (e.xt ? 4 : 0) | (e.xc ? 8 : 0), e.cut | 0, e.tr | 0, Math.floor((e.ex ?? 0) * 10 + 1e-6), WYS.indexOf(e.wy), e.wr | 0, e.sl | 0, e.cm ?? 0, (e.sg || []).flat()]);
    else if (e.type === 'jump') d.jp.push([e.id, e.buf ?? JUMP_BUF, Math.round((e.cool || 0) * 10), Math.round((e.pw || 0) * 100), e.act > 0 ? 1 : 0, e.on === false ? 0 : 1]);
  }
  if (!d.dr.length && !d.lf.length && !d.jp.length) { TS.lastRow = ''; return null; }
  return d;
}
export function guestRowFor(g, d) {
  if (!d || typeof d !== 'object') return;
  const num = (v) => (Number.isFinite(v) ? v : 0);
  if (Array.isArray(d.dr)) for (const a of d.dr) {
    if (!Array.isArray(a)) continue; const e = entById(g, a[0]); if (!e || e.type !== 'door') continue;
    const p = clamp(num(a[1]) / 1000, 0, 1); e.p = Math.abs(e.p - p) > 0.15 || !((a[3] | 0) & 3) ? p : e.p + (p - e.p) * 0.5; e.tgt = a[2] ? 1 : 0; e.draw = (a[3] | 0) & 1; e.crank = ((a[3] | 0) & 2) === 2; e.pw = clamp(num(a[4]) / 100, 0, 1);
  }
  if (Array.isArray(d.lf)) for (const a of d.lf) {
    if (!Array.isArray(a)) continue; const e = entById(g, a[0]); if (!e || e.type !== 'plift') continue;
    const cy = num(a[1]) / 100; e.cy = Math.abs(e.cy - cy) > 0.4 ? cy : e.cy + (cy - e.cy) * 0.5; e.tg = a[2] >= 0 ? a[2] | 0 : null; e.mv = clamp(a[3] | 0, -1, 1); e.pw = clamp(num(a[4]) / 100, 0, 1); e.q = new Array(clamp(a[5] | 0, 0, LIFT_QUEUE)).fill(0); e.blk = (a[6] | 0) & 1; e.crank = ((a[6] | 0) & 2) >> 1; e.cut = clamp(a[7] | 0, 0, NY + 8);
    if (a.length > 8) {   // the hoistway: reach, rails, why it stops there, the stops with their landing sides
      e.xt = ((a[6] | 0) & 4) >> 2; e.xc = ((a[6] | 0) & 8) >> 3; e.tr = clamp(a[8] | 0, 0, NY); const ex = clamp(num(a[9]) / 10, 0, NY); e.ex = Math.abs((e.ex ?? 0) - ex) > 1 ? ex : (e.ex ?? 0) + (ex - (e.ex ?? 0)) * 0.5; if (!(e.xt || e.xc)) e.ex = ex;
      e.wy = WYS[clamp(a[10] | 0, 0, WYS.length - 1)]; e.wr = clamp(a[11] | 0, -1, NY + 8); e.sl = clamp(a[12] | 0, 0, 999); e.cm = clamp(num(a[13]), 0, 999);
      const sg = []; if (Array.isArray(a[14])) for (let q = 0; q + 2 < a[14].length && sg.length < MAX_STOPS; q += 3) sg.push([clamp(a[14][q] | 0, 0, NY), clamp(a[14][q + 1] | 0, -1, 3), clamp(a[14][q + 2] | 0, 0, 3)]);
      e.sg = sg.length ? sg : [[e.j, -1, 0]];
    }
  }
  if (Array.isArray(d.jp)) for (const a of d.jp) {
    if (!Array.isArray(a)) continue; const e = entById(g, a[0]); if (!e || e.type !== 'jump') continue;
    e.buf = clamp(a[1] | 0, 0, JUMP_BUF); e.cool = Math.max(0, num(a[2]) / 10); e.pw = clamp(num(a[3]) / 100, 0, 1); e.act = a[4] ? 1 : 0; e.on = a[5] !== 0;
  }
  if (d.ev && typeof d.ev === 'object' && d.ev.k === 'launch') {
    const e = entById(g, d.ev.id), v = d.ev;
    if (e && e.type === 'jump' && [v.vx, v.vy, v.vz].every(Number.isFinite) && Math.hypot(v.vx, v.vz) <= JUMP_SPEED + 0.01 && Math.abs(v.vy) <= JUMP_SPEED + 0.01 && Math.hypot(g.player.pos.x - e.x, g.player.pos.z - e.z) < 4 && Math.abs(g.player.pos.y - e.y) < 1.5) launchPlayer(g, g.player, { vx: v.vx, vy: v.vy, vz: v.vz });
  }
}

// ================================================================ the per frame work, once per type (host and guest)
let HOOKED = null;
function install(g) {
  const pl = g.player; if (!pl) return;
  if (HOOKED !== g || pl.ride == null) {
    pl.ride = (p) => rideStep(g, p); pl.landSafe = (p) => landSafe(g, p);
    for (const c of [g.cart, g.cart2]) if (c) { c.support = (x, z, feet, cart) => cartSupport(g, x, z, feet, cart); c.followFix = (who, cart) => cartFollow(g, who, cart); }
    HOOKED = g;
  }
}
export function hostTick(g, dt) {
  if (TS.g !== g) { TS.g = g; TS.lastNets = null; TS.powerT = 0; }
  install(g);
  TS.powerT -= dt;
  if (TS.powerT <= 0 || g.power.nets !== TS.lastNets) { TS.powerT = 0.5; resolvePower(g); }
  tickDoors(g, dt); tickLifts(g, dt); tickJumps(g, dt); visCalls(g);
  lineTick(g);
}
export function guestTick(g, dt) {
  if (TS.g !== g) { TS.g = g; TS.lastNets = null; }
  install(g);
  guestDoors(g, dt); guestLifts(g, dt); guestJumps(g, dt); visCalls(g);
  lineTick(g);
}

// ================================================================ cfg whitelists (functions: V does not exist yet when the registry loads)
const cfgDoor = () => ({ tgt: V.int(0, 1), lock: V.enum(['none', 'power', 'key']), auto: V.bool });
const cfgLift = () => ({ call: V.int(0, NY - 1), go: V.int(-1, 1) });
const cfgCall = () => ({ press: V.int(1, 1) });
const cfgJump = () => ({ ang: V.int(0, 90), hd: V.int(0, 345), on: V.bool });

function checkDoor(g, e, c) {
  if (c.tgt !== undefined && c.tgt !== (e.tgt ? 1 : 0)) { const why = doorAllows(g, e); if (why) return why; }
  return null;
}
function checkLift(g, e, c) {
  if (c.call !== undefined && !floorsOf(g, e).includes(c.call)) return 'The elevator does not stop there';
  return null;
}
function checkJump(g, e, c) {
  if (c.ang !== undefined && c.ang % ANGLE_STEP !== 0) return `The angle moves in steps of ${ANGLE_STEP} degrees`;
  if (c.hd !== undefined && c.hd % HEAD_STEP !== 0) return `The heading moves in steps of ${HEAD_STEP} degrees`;
  return null;
}
function onCfgDoor(g, e, c) { if (c.tgt !== undefined) { e.idle = 0; e.crank = !((e.pw ?? 0) > 0.05) && e.lock !== 'power'; e.blk = null; } }
function onCfgLift(g, e, c) {
  if (c.call !== undefined) { const row = e.call; delete e.call; const r = requestFloor(g, e, row); if (r !== 'ok' && r !== 'queued' && r !== 'here') g.netSend({ t: 'toast', icon: '🛗', title: 'Elevator', text: r }); }
  if (c.go !== undefined) { const dir = e.go; delete e.go; const why = rideGo(g, e, dir); if (why) g.netSend({ t: 'toast', icon: '🛗', title: 'Elevator', text: why }); }
}
function onCfgCall(g, e) { delete e.press; const why = pressCall(g, e); if (why) g.netSend({ t: 'toast', icon: '🛗', title: 'Elevator', text: why }); }
function onCfgJump(g, e, c) { if (c.on !== undefined || c.ang !== undefined || c.hd !== undefined) { const it = g.machines.items.get(e.id); if (it) { it.vis = ''; visJump(it); } g.power.markDirty(); } }

// ================================================================ the registry parts
export const TRANSIT_UPGRADES = [
  { id: 'transitDoor', cat: 'machine', name: 'Powered Doors', desc: 'Unlocks Doors and Door Keys. A door fills a 4 x 4 gap in a wall (aim at a Wall Section to swap it in place). Closed it is solid and anchors the roof beside it, open it frees the way. It slides up in 0.8 s and draws 0.8 kW only while it moves. With no power it stays put, but E turns a hand crank at a quarter speed so nobody is trapped. It never closes on a person, a cart or plush. Lock it with power or a key, or let the sensor open it for you.', max: 1, cost: [4500000], req: { id: 'shellPads', lvl: 1 }, effect: (t) => { t.transitDoor = true; } },
  { id: 'transitBlast', cat: 'machine', name: 'Blast Doors', desc: 'Unlocks the Blast Door: panel strength, 1.6 s to move, 2.4 kW while it moves. While closed it holds the pile and anchors the roof beside it, so a sealed bad tunnel stays sealed even if the roof lets go. Its sensor is off by default.', max: 1, cost: [18000000], req: { id: 'transitDoor', lvl: 1 }, effect: (t) => { t.transitBlast = true; } },
  { id: 'transitLift', cat: 'machine', name: 'Elevators', desc: 'Unlocks the Elevator: a big box cab, 4 x 4 cells and 4 high, that you set into a dug opening high up the pile. You dig a hollow 4 x 4 shaft straight down from it and shore it with frames like any tunnel (load tracing and stale air apply, the elevator never digs). Once the tube is dug the rails run out down it by themselves, up to 24 m below the cab, with a stop at every landing where a side tunnel or pad opens into the shaft (each gets a call panel). It carries you, a friend, carts and loose plush, 3 m/s, 6 kW only while it moves, and turns by hand without power. It refuses an unshored or blocked stretch and tells you where; a collapse that cuts the shaft stops the cab at the last clear landing.', max: 1, cost: [9000000], req: { id: 'shellRamps', lvl: 1 }, effect: (t) => { t.transitLift = true; t.hoistCap = Math.max(t.hoistCap || 0, HOIST_CAPS[0]); } },
  { id: 'transitHoist', cat: 'machine', name: 'Deep Hoistways', desc: 'Every Elevator reaches further down its shaft: 64 m below the cab instead of 24 m, which is the whole 43 m hall. The shaft still has to be dug and shored the whole way.', max: 1, cost: [60000000], req: { id: 'transitLift', lvl: 1 }, effect: (t) => { t.hoistCap = Math.max(t.hoistCap || 0, HOIST_CAPS[1]); } },
  { id: 'transitJump', cat: 'move', name: 'Jump Pads', desc: 'Unlocks the Jump Pad and the Cushion Pad. Step on a pad and it throws you at 12 m/s: angle 0 to 90 degrees in 5 degree steps, any heading in 15 degree steps, with the path drawn while you place it. 6 kW while it charges, 0.1 kW standing by, 5 launches then a 22 s recharge. Land on a Cushion Pad, a Jump Pad or the plush pile and you are not hurt. A hard floor still hurts. Needs Spring Insoles at the top level.', max: 1, cost: [7500000], req: { id: 'springs', lvl: 3 }, effect: (t) => { t.transitJump = true; } },
];
const base = (id) => Math.max(1, Math.round(SHOW[id] / 3));
const NAME = { door: 'Door', 'door:blast': 'Blast Door', doorkey: 'Door Key', plift: 'Elevator', jump: 'Jump Pad', cushion: 'Cushion Pad' };
const ICON = { door: '🚪', 'door:blast': '🛡️', doorkey: '🔑', plift: '🛗', jump: '🦘', cushion: '🛏️' };
const USE = {
  door: 'Aim at a Wall Section (the door takes its place and the wall comes back to your pack), the top of a pad or the floor and press B: a 4 x 4 door in the plane of a wall. R turns it. E opens and closes it; with no power E turns a slow hand crank. The sensor (Auto) opens it when you walk up. Shift+E copies its lock and sensor setting.',
  'door:blast': 'Place it like a door. It is slower and tougher: it holds the pile and anchors the roof beside it while closed. Its sensor is off by default, so E opens it. Set the lock to power or key to seal a tunnel for good.',
  doorkey: 'Keep it in your pack: a door locked to key opens for you (E or the sensor) while you hold one. It is never used up.',
  plift: 'Dig out a 4 x 4 x 4 opening (or stand at the mouth of a dug shaft) and aim at the floor or at a pad: the cab stands there as the home stop. Then dig a hollow 4 x 4 shaft straight down from it and stack frames in it to shore it (a stretch longer than the tunnel rule allows without one is refused). The rails run out down the clear, shored shaft by themselves, up to your tier. A call panel appears wherever a side tunnel or pad opens into the shaft. Link the home stop to a pole: 6 kW while it moves.',
  jump: 'Aim at the floor or a pad and press B. - and = set the angle (0 to 90 in 5 degree steps), R turns the heading (15 degrees). The green line is the path. E on a placed pad: 5 degrees steeper; crouch + E turns it. Needs its own Power Cable from a live pole or generator.',
  cushion: 'Aim at the floor or a pad and press B. A fall onto it does no harm, whatever the height. Set one where a Jump Pad lands you.',
};
const nPlaced = (g, t) => (g.machines ? g.machines.count(t) : 0);
export function transitRecipes(g) {
  const T = g.T || {}, out = [];
  const row = (id, kind, extra = {}) => out.push({ id, kind, icon: ICON[id], name: NAME[id], short: extra.short || NAME[id], price: base(id), batch: extra.batch || [1, 2, 5], use: USE[id], ...extra });
  if (T.transitDoor) {
    row('door', 'door', { short: 'Door', desc: 'A powered door for a 4 x 4 gap in a wall. Slides up in 0.8 s, 0.8 kW only while it moves.', statusFn: () => `${nPlaced(g, 'door')} doors placed` });
    row('doorkey', 'supply', { short: 'Key', desc: 'Opens every door set to key lock while it is in your pack. Never used up.', batch: [1, 2, 5], statusFn: () => `${(g.S.items && g.S.items.doorkey) || 0} in your pack` });
  }
  if (T.transitBlast) row('door:blast', 'door', { short: 'Blast Door', desc: 'Panel strength, 1.6 s to move. Holds the pile and anchors the roof beside it while closed. For sealing bad tunnels.', batch: [1, 2, 5], statusFn: () => `${g.machines ? entsOf(g, 'door').filter((d) => d.blast).length : 0} blast doors placed` });
  if (T.transitLift) {
    row('plift', 'plift', { short: 'Elevator', desc: 'A big box cab (4 x 4 cells, 4 high) for a hollow shaft you dig straight down from it. It runs down the clear, shored shaft by itself, up to 24 m below the cab, stops at every landing, 3 m/s, 6 kW while it moves.', batch: [1, 1, 2], statusFn: () => `${nPlaced(g, 'plift')} elevators placed, reach ${hoistCap(g)} m below the cab` });
  }
  if (T.transitJump) {
    row('jump', 'jump', { short: 'Jump Pad', desc: 'Throws you at 12 m/s. Angle 0 to 90 degrees in 5 degree steps. 6 kW charging, 0.1 kW standing by, 5 launches then 22 s.', batch: [1, 2, 5], statusFn: () => `${nPlaced(g, 'jump')} pads placed` });
    row('cushion', 'cushion', { short: 'Cushion', desc: 'A soft 2.4 m mat: a fall onto it never hurts.', batch: [1, 2, 5], statusFn: () => `${nPlaced(g, 'cushion')} mats placed` });
  }
  return out;
}

const addWith = (fn) => (machines, e) => fn(machines, e);
export function makeTypes() {
  const T = {};
  T.door = {
    cfg: cfgDoor, copy: ['lock', 'auto'], group: 'doorcfg', check: checkDoor, onCfg: onCfgDoor,
    add: addWith(addDoor), item: itemOfEnt, onRemove: (g, e) => removeDoor(g, e), info: (g, e) => infoDoor(g, e),
    plan: planDoor, preview: previewDoor, conflict: conflictDoor, build: buildDoor,
  };
  T.plift = {
    cfg: cfgLift, check: checkLift, onCfg: onCfgLift, copy: [],
    add: addWith(addLift), item: () => 'plift', onRemove: (g, e) => removeLift(g, e), info: (g, e) => infoLift(g, e),
    plan: planLift, preview: previewLift, conflict: conflictLift, build: buildLift,
  };
  T.callbtn = {
    cfg: cfgCall, onCfg: onCfgCall, copy: [],
    add: addWith(addCall), item: () => 'callbtn', onRemove: (g, e) => removeCall(g, e), info: (g, e) => infoCall(g, e),
    plan: planCall, preview: previewCall, conflict: conflictCall, build: buildCall,
  };
  T.jump = {
    cfg: cfgJump, copy: ['ang', 'hd'], group: 'jumpcfg', check: checkJump, onCfg: onCfgJump,
    add: addWith(addJump), item: () => 'jump', onRemove: (g, e) => removeFlat(g, e), info: (g, e) => infoJump(g, e),
    plan: planJump, preview: previewJump, conflict: conflictJump, build: buildJump,
  };
  T.cushion = {
    add: addWith(addCushion), item: () => 'cushion', onRemove: (g, e) => removeFlat(g, e), info: () => infoCushion(),
    plan: planCushion, preview: previewCushion, conflict: conflictCushion, build: buildCushion,
  };
  // the per frame work (host and guest) and the 0.5 s row live on a pseudo type so they run once per frame, not once per ent
  T.transit = { tick: hostTick, guestTick, row: rowFor, guestRow: guestRowFor };
  return T;
}
