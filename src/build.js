// Wave 3: the build shell. Floor pads (4 x 4 x 1 cells, the frame footprint), catwalks (1 x 4 thin plates), walls (4 x 4 of bulkhead cells),
// ramps (rise 1 cell over 2, or a truck ramp 1 over 3) and stairs (rise 2 cells over 4), plus the Leveling Pad machine that digs a box and lays pads.
//
// How it fits the game:
//  * Pads, catwalk plates and walls are real WORLD CELLS (PAD and BULK, the special ids of plushdata.js) set by the host when the ent is added, so the pile, the player, loose plush and the
//    renderer all treat them as solid with no special casing beyond isSpecialCell (never falls, never grabbed, never blasted). The ent is the record of what was
//    placed (material, group, rails) and what the hammer hands back; cell edits travel to a guest through the normal cell sync, the ent through ent+.
//  * Ramps and stairs are NOT cells: they are walkable colliders. walkStep() (installed as player.walk) lifts the feet onto the slope and keeps the flanks solid.
//  * Clearance: a floor needs its own cells empty plus 4 empty cells of headroom (dig first, like frames); the host re-checks everything a guest sends.
//  * Load rules: a pad takes no load and is no roof (world.stress and slipChance skip it), so a sealed pad room leaves the safe tunnel length unchanged.
//
// This file imports no game modules (catalog.js imports catalog_build.js which imports this file, so game.js, crafting.js and power.js are off limits).
import * as THREE from 'three';
import { C, NX, NY, NZ, cellX, cellY, cellZ, toI, toJ, toK } from './config.js';
import { PAD, BULK, NEEDLE, isSpecialCell } from './plushdata.js';
import * as M from './buildmesh.js';

export const KINDS = ['timber', 'steel', 'concrete', 'rebar', 'titan', 'carbon', 'plasma', 'voidl', 'neutron', 'horizon'];
export const KIND_NAME = { timber: 'Timber', steel: 'Steel', concrete: 'Concrete', rebar: 'Rebar', titan: 'Titanium', carbon: 'Carbon', plasma: 'Plasma', voidl: 'Void', neutron: 'Neutron', horizon: 'Horizon' };
export const KIND_ICON = { timber: '🪵', steel: '🔩', concrete: '🏛️', rebar: '⛓️', titan: '🔷', carbon: '⬛', plasma: '🌀', voidl: '🕳️', neutron: '⚛️', horizon: '⚫' };
// bench price of ONE 4 x 4 pad before the crafting multiplier (K = 3): timber, steel and concrete from the spec, then roughly 5x a step from titanium on, so
// a hangar of 100 plasma pads costs about 14M after the multiplier. Everything else (catwalk, ramps, stairs) scales off these.
export const PAD_PRICE = { timber: 18, steel: 60, concrete: 140, rebar: 375, titan: 1900, carbon: 9500, plasma: 47000, voidl: 235000, neutron: 1.18e6, horizon: 5.9e6 };
export const LEVEL_PRICE = 400000;          // Leveling Pad machine, before K (3 x = 1.2M at the bench)
export const LEVEL_KW = 15;
export const LEVEL_RATE = 8;                // cells dug per second at full power

export const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
// hooks the stacked building module (stack.js, wave 10) installs: plates, stairs and ladders that snap into the cubes (build.js imports nothing of it, so the cycle stays open)
export const hooks = {};
export const PAD_N = 4;                      // a pad is 4 x 4 cells (2.4 m)
export const PAD_CLEAR = 4;                  // empty cells above a pad
export const CAT_LEN = 4, CAT_CLEAR = 3;
export const ZOOP_LINE = 10, ZOOP_SIDE = 5, ZOOP_MAX = 25;
export const TRUCK_SLOPE = 1 / 3;            // trucks climb up to 1 cell of rise per 3 cells of run
export const TYPES_SET = new Set(['pad', 'catwalk', 'wramp', 'stair', 'wall', 'levelpad']);
export const isBuildType = (t) => TYPES_SET.has(t);
const WALK_TYPES = new Set(['wramp', 'stair']);
const CELL_TYPES = new Set(['pad', 'catwalk', 'wall']);

// what each recipe id builds: ramp and stair shapes
export const SHAPE = { wramp: { w: 2, len: 2, rise: 1 }, 'wramp:haul': { w: 4, len: 3, rise: 1 }, stair: { w: 1, len: 4, rise: 2 } };

const idx = (i, j, k) => (j * NZ + k) * NX + i;
const mod4 = (x) => ((x % 4) + 4) % 4;
const fl4 = (x, o) => o + 4 * Math.floor((x - o) / 4);
const faceOf = (yaw) => (Math.abs(Math.sin(yaw)) > Math.abs(Math.cos(yaw)) ? (Math.sin(yaw) > 0 ? 0 : 2) : (Math.cos(yaw) > 0 ? 1 : 3));
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const xMin = (i) => (i - NX / 2) * C, zMin = (k) => (k - NZ / 2) * C;
const kindOk = (k) => KINDS.includes(k);

// the best material you can build with: the strongest frame kind you own
export function bestKind(frames) { let b = 'timber', bi = -1; for (const k of frames || []) { const q = KINDS.indexOf(k); if (q > bi) { bi = q; b = k; } } return b; }
export const padPrice = (kind) => PAD_PRICE[kind] || PAD_PRICE.timber;
export function pricePer(type, rid, kind) {
  const p = padPrice(kind);
  if (type === 'pad') return p;
  if (type === 'catwalk') return Math.round(p * 0.5);
  if (type === 'wramp') return Math.round(p * (rid === 'wramp:haul' ? 1.0 : 0.4));
  if (type === 'stair') return Math.round(p * 0.5);
  if (type === 'wall') return 160;                 // 16 bulkhead panels (10 each)
  return 0;
}
// the material a recipe id is made of: pads carry theirs in the id ('pad:steel')
export function kindFromId(rid, fallback) { const m = /^pad:(\w+)$/.exec(rid || ''); return m && kindOk(m[1]) ? m[1] : fallback; }

// ======================================================================================================
// the registry: which ent owns which world cell, and which ramps cover which columns (rebuilt from the ents, never saved)
// ======================================================================================================
function reg(g) {
  let r = g._bld;
  if (!r || r.world !== g.world) r = g._bld = { world: g.world, own: new Map(), walk: new Map() };
  return r;
}
const colKey = (i, k) => k * NX + i;
export function spec(e) {
  if (e.type === 'pad') return { nx: 4, nz: 4, rows: 1 };
  if (e.type === 'catwalk') return e.ax === 'z' ? { nx: 1, nz: 4, rows: 1 } : { nx: 4, nz: 1, rows: 1 };
  if (e.type === 'wall') return e.ax === 'z' ? { nx: 1, nz: 4, rows: 4 } : { nx: 4, nz: 1, rows: 4 };
  if (WALK_TYPES.has(e.type)) { const ew = (e.dir & 1) === 0; return { nx: ew ? e.len : e.w, nz: ew ? e.w : e.len, rows: e.rise }; }
  return { nx: 1, nz: 1, rows: 1 };
}
// the world cells a pad, catwalk or wall owns
export function cellsOf(e) {
  const s = spec(e), out = [], op = e.type === 'pad' && e.op ? e.op | 0 : 0, od = e.od | 0;
  for (let r = 0; r < s.rows; r++) for (let dz = 0; dz < s.nz; dz++) for (let dx = 0; dx < s.nx; dx++) { if (op && holeAt(op, od, dx, dz)) continue; out.push([e.i0 + dx, e.j + r, e.k0 + dz]); }
  return out;
}
// the openings of a plate in a cube (wave 10): 0 a full plate, 1 a landing (a 2 x 4 opening on one side, for a stair, a ramp or a belt ramp), 2 a shaft plate (a 2 x 2 opening in one corner, for a ladder or a belt lift).
// (dx, dz) are the cell's place in the plate (0..3); od turns the opening a quarter at a time (0 is the +x side or the +x +z corner).
export const OPENINGS = [{ key: 'full', name: 'Full plate', holes: 0 }, { key: 'landing', name: 'Landing', holes: 8 }, { key: 'shaft', name: 'Shaft plate', holes: 4 }];
export function holeAt(op, od, dx, dz) {
  let x = dx, z = dz;
  for (let q = 0; q < ((4 - (od & 3)) & 3); q++) { const nx = 3 - z, nz = x; x = nx; z = nz; }   // turn the cell back to where the opening is at turn 0, one quarter per step
  if (op === 1) return x >= 2;
  if (op === 2) return x >= 2 && z >= 2;
  return false;
}
export const cellVr = (e) => Math.max(0, KINDS.indexOf(e.mk)) | (e.type === 'catwalk' ? 16 : 0);

function register(g, e) {
  g.botnavVer = (g.botnavVer | 0) + 1;   // botnav.js: the walkable graph is a new version
  const r = reg(g);
  if (CELL_TYPES.has(e.type)) for (const [i, j, k] of cellsOf(e)) { if (e.type === 'pad' && e.bay !== undefined && g.world.get(i, j, k) === BULK) continue; r.own.set(idx(i, j, k), e.id); }   // a door frame already standing on the edge of a plate keeps its cells
  if (WALK_TYPES.has(e.type)) { const s = spec(e); for (let dz = 0; dz < s.nz; dz++) for (let dx = 0; dx < s.nx; dx++) { const key = colKey(e.i0 + dx, e.k0 + dz); let a = r.walk.get(key); if (!a) r.walk.set(key, a = []); if (!a.includes(e.id)) a.push(e.id); } }
}
export const reRegister = (g, e) => register(g, e);
function unregister(g, e) {
  g.botnavVer = (g.botnavVer | 0) + 1;
  const r = reg(g);
  if (CELL_TYPES.has(e.type)) for (const [i, j, k] of cellsOf(e)) { const key = idx(i, j, k); if (r.own.get(key) === e.id) r.own.delete(key); }
  if (WALK_TYPES.has(e.type)) { const s = spec(e); for (let dz = 0; dz < s.nz; dz++) for (let dx = 0; dx < s.nx; dx++) { const key = colKey(e.i0 + dx, e.k0 + dz); const a = r.walk.get(key); if (a) { const q = a.indexOf(e.id); if (q >= 0) a.splice(q, 1); if (!a.length) r.walk.delete(key); } } }
}
const entOf = (g, id) => { const it = g.machines.items.get(id); return it ? it.ent : null; };
// the build ent that owns a world cell (a pad or catwalk plate, or a bulkhead that belongs to a wall), or null
export function ownerAt(g, i, j, k) {
  const id = reg(g).own.get(idx(i, j, k)); if (id === undefined) return null;
  const e = entOf(g, id); if (!e) return null;
  return cellsOf(e).some((c) => c[0] === i && c[1] === j && c[2] === k) ? e : null;
}
const buildEnts = (g, types) => { const out = []; for (const it of g.machines.items.values()) if (types.has(it.ent.type)) out.push(it.ent); return out; };
export const allPads = (g) => buildEnts(g, new Set(['pad']));
export const allBuilt = (g) => buildEnts(g, TYPES_SET);

// ======================================================================================================
// placement rules
// ======================================================================================================
// how far two floor rectangles (centre, yaw, half width, half depth) sink into each other (separating axis test); <= 0 when apart. Same maths as machines.js footprintOverlap.
function overlapRect(ax, az, ay, aw, ad, bx, bz, by, bw, bd) {
  const dx = bx - ax, dz = bz - az; let least = Infinity;
  const axesA = [[Math.cos(ay), -Math.sin(ay)], [Math.sin(ay), Math.cos(ay)]], axesB = [[Math.cos(by), -Math.sin(by)], [Math.sin(by), Math.cos(by)]];
  for (const [ux, uz] of [...axesA, ...axesB]) {
    const ra = aw * Math.abs(axesA[0][0] * ux + axesA[0][1] * uz) + ad * Math.abs(axesA[1][0] * ux + axesA[1][1] * uz);
    const rb = bw * Math.abs(axesB[0][0] * ux + axesB[0][1] * uz) + bd * Math.abs(axesB[1][0] * ux + axesB[1][1] * uz);
    least = Math.min(least, ra + rb - Math.abs(dx * ux + dz * uz));
  }
  return least;
}

// the volume a piece needs: its own cells (rows j .. j + own - 1) and the clear cells above (rows up to j + top - 1), over the footprint
export function volumeOf(p) {
  const s = spec(p);
  let own = 1, top;
  if (p.type === 'pad') { own = 1; top = p.ro === 'f' ? 4 : p.ro === 'c' ? 1 : 1 + PAD_CLEAR; }   // a plate in a cube (wave 10): a floor plate has the 3 cells of the level above it, a ceiling plate nothing to clear
  else if (p.type === 'catwalk') { own = 1; top = 1 + CAT_CLEAR; }
  else if (p.type === 'wall') { own = 4; top = 4; }
  else if (WALK_TYPES.has(p.type)) { own = p.rise; top = p.rise + 3; }
  else { own = 1; top = 3; }
  return { ...s, own, top };
}

// null when the piece can stand where it is described, otherwise why not. p: { type, i0, k0, j, ax | dir, w, len, rise }
export function checkPiece(g, p, o = {}) {
  const w = g.world, v = volumeOf(p);
  if (!int(p.i0, 0, NX - 1) || !int(p.k0, 0, NZ - 1) || !int(p.j, 0, NY - 1)) return 'Out of the hall';
  if (p.i0 + v.nx > NX || p.k0 + v.nz > NZ || p.j + v.top > NY) return 'Out of the hall';
  if (p.bay !== undefined && hooks.checkBay) { const why = hooks.checkBay(g, p, o); if (why) return why; }   // a piece that belongs to a cube (stack.js): the cube must be there, whole and not crowded
  let dig = 0, solidIn = false, ownSolid = false;
  for (let r = 0; r < v.top; r++) for (let dz = 0; dz < v.nz; dz++) for (let dx = 0; dx < v.nx; dx++) {
    const i = p.i0 + dx, j = p.j + r, k = p.k0 + dz, s = w.get(i, j, k);
    if (!s) continue;
    if (isSpecialCell(s)) { if (p.type === 'wall' && p.bay !== undefined && s === PAD && hooks.ownPlateCell && hooks.ownPlateCell(g, p, i, j, k)) continue; if (p.type === 'pad' && p.bay !== undefined && s === BULK && hooks.ownWallCell && hooks.ownWallCell(g, p, i, j, k)) continue; solidIn = true; if (r < v.own) ownSolid = true; } else dig++;   // (a door frame in a cube takes the edge of the plate it stands on, stack.js)
  }
  if (solidIn) return ownSolid ? 'Something solid is already here' : 'Something solid is in the way above it';
  if (dig) {
    const need = p.type === 'wall' ? 'a wall needs its 4 x 4 section clear' : p.type === 'pad' ? 'a pad needs a clear 4 x 4 floor and 4 cells of headroom' : WALK_TYPES.has(p.type) ? `a ${p.type === 'stair' ? 'stair' : 'ramp'} needs its footprint and headroom clear` : 'a catwalk needs a clear strip and 3 cells of headroom';
    return `Dig out ${dig} more plush first: ${need}`;
  }
  // belts, machines and reserved cells in the piece's own rows (and the walking rows of a ramp or stair)
  const rowsBlocked = WALK_TYPES.has(p.type) ? v.top : v.own;
  for (let r = 0; r < rowsBlocked; r++) for (let dz = 0; dz < v.nz; dz++) for (let dx = 0; dx < v.nx; dx++) {
    if (p.op && p.type === 'pad' && r < v.own && holeAt(p.op | 0, p.od | 0, dx, dz)) continue;   // the opening of a plate is where a stair or a ladder stands: nothing is built on those cells
    const key = idx(p.i0 + dx, p.j + r, p.k0 + dz);
    if (w.reserved.has(key) || g.logi.tiles.has(key)) return 'Something is in the way (a belt or machine)';
  }
  // ramps and stairs may not share columns with each other
  if (WALK_TYPES.has(p.type)) { const rg = reg(g); for (let dz = 0; dz < v.nz; dz++) for (let dx = 0; dx < v.nx; dx++) { const a = rg.walk.get(colKey(p.i0 + dx, p.k0 + dz)); if (a) for (const id of a) { const q = entOf(g, id); if (q && Math.abs(q.j - p.j) < 4 && q.id !== p.id) return 'A ramp or stair is already here'; } } }
  // frames and machines standing in the volume (the row range [bottom, top) in metres)
  const x0 = xMin(p.i0), z0 = zMin(p.k0), x1 = x0 + v.nx * C, z1 = z0 + v.nz * C, yb = p.j * C, yt = (p.j + (WALK_TYPES.has(p.type) ? v.top : v.own)) * C;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const it of g.machines.items.values()) {
    const e = it.ent; if (isBuildType(e.type) || e === o.self) continue;
    if (e.type === 'frame') {
      if (p.bay !== undefined && !e.turned && e.gm !== undefined) continue;   // a piece built into a cube stands in the open section of the grid cubes of its column (the cell checks above keep plush and machines out)
      const fy0 = e.y0, fy1 = e.y0 + (e.h || 2.4);
      if (fy0 >= yt - 0.05 || fy1 <= yb + 0.05) continue;
      const fyaw = e.yaw !== undefined ? e.yaw : e.axis === 'x' ? Math.PI / 2 : 0;
      if (Math.hypot(e.cx - cx, e.cz - cz) > Math.max(v.nx, v.nz) * C + (e.w || 2.4) + 0.5) continue;
      if (overlapRect(cx, cz, 0, (x1 - x0) / 2, (z1 - z0) / 2, e.cx, e.cz, fyaw, (e.w || 2.4) / 2, (e.d !== undefined ? e.d : C - 0.06) / 2) > 0.05) return 'A frame stands here: build the floor first, then the frame';
      continue;
    }
    const ex = e.cx ?? e.px ?? e.x, ez = e.cz ?? e.pz ?? e.z, ey = e.y0 ?? e.y; if (ex === undefined || ez === undefined || ey === undefined) continue;
    if (ex > x0 - 0.15 && ex < x1 + 0.15 && ez > z0 - 0.15 && ez < z1 + 0.15 && ey >= yb - 0.12 && ey < yt - 0.05) return 'A machine stands here';
  }
  // you cannot build into yourself, or into your friend (the host knows where a guest stands from its position messages)
  if (!o.skipPlayer) for (const pp of peopleAt(g)) {
    if (!(pp.x > x0 - 0.3 && pp.x < x1 + 0.3 && pp.z > z0 - 0.3 && pp.z < z1 + 0.3 && pp.y < yt - 0.02 && pp.y + 1.7 > yb)) continue;
    if (p.type === 'pad' && p.ro === 'f' && pp.y < yb + 0.25) continue;   // a floor plate laid under your own feet lifts you onto it (stack.js liftOnto)
    return 'Step out of the way first';
  }
  // support
  const below = (i, k) => w.solid(i, p.j - 1, k);
  let n = 0; for (let dz = 0; dz < v.nz; dz++) for (let dx = 0; dx < v.nx; dx++) if (below(p.i0 + dx, p.k0 + dz)) n++;
  const total = v.nx * v.nz;
  if (p.bay !== undefined) return null;   // a plate, stair or ladder built into a cube hangs from the cube's frame: the cube is its support
  if (p.type === 'pad') { if (n < 8 && !(touchesLanding(g, p) || (n >= 1 && touchesPad(g, p)))) return 'No ground under this floor: it needs solid ground under at least half of it, or a pad or stair to rest on'; }
  else if (p.type === 'catwalk') { if (n < 1 && !(touchesPad(g, p) || touchesLanding(g, p))) return 'A catwalk must start from the ground, a pad or another catwalk'; }
  else if (p.type === 'wall') { if (n < 1 && !touchesWall(g, p)) return 'A wall stands on the ground, a pad or another wall'; }
  else if (WALK_TYPES.has(p.type)) { if (n < Math.ceil(total / 2)) return 'No ground under this ' + (p.type === 'stair' ? 'stair' : 'ramp'); }
  return null;
}

const peopleAt = (g) => { const a = [g.player.pos], r = g.remote && g.remote.pos; if (r && r.y > -40) a.push(r); return a; };

// pad / catwalk cells at row j next to this piece (outside its footprint): is one of them a pad plate?
function touchesPad(g, p) {
  const w = g.world, s = spec(p);
  for (let dz = -1; dz <= s.nz; dz++) for (let dx = -1; dx <= s.nx; dx++) {
    if ((dx >= 0 && dx < s.nx) && (dz >= 0 && dz < s.nz)) continue;
    if ((dx < 0 || dx >= s.nx) && (dz < 0 || dz >= s.nz)) continue;   // corners do not count
    if (w.get(p.i0 + dx, p.j, p.k0 + dz) === PAD) return true;
  }
  return false;
}
function touchesWall(g, p) {
  const w = g.world, s = spec(p);
  for (let dz = -1; dz <= s.nz; dz++) for (let dx = -1; dx <= s.nx; dx++) { if ((dx >= 0 && dx < s.nx) && (dz >= 0 && dz < s.nz)) continue; if (w.get(p.i0 + dx, p.j, p.k0 + dz) === BULK) return true; }
  return false;
}
// the cells just beyond the high end of a ramp or stair, at the row its top surface is flush with
export function landingCells(e) {
  const s = spec(e), out = [], row = e.j + e.rise - 1;
  if (e.dir === 0) for (let dz = 0; dz < s.nz; dz++) out.push([e.i0 + s.nx, row, e.k0 + dz]);
  else if (e.dir === 2) for (let dz = 0; dz < s.nz; dz++) out.push([e.i0 - 1, row, e.k0 + dz]);
  else if (e.dir === 1) for (let dx = 0; dx < s.nx; dx++) out.push([e.i0 + dx, row, e.k0 + s.nz]);
  else for (let dx = 0; dx < s.nx; dx++) out.push([e.i0 + dx, row, e.k0 - 1]);
  return out;
}
function touchesLanding(g, p) {
  const rg = reg(g), s = spec(p);
  const set = new Set(); for (let dz = 0; dz < s.nz; dz++) for (let dx = 0; dx < s.nx; dx++) set.add(idx(p.i0 + dx, p.j, p.k0 + dz));
  for (const a of rg.walk.values()) for (const id of a) { const e = entOf(g, id); if (!e) continue; for (const [i, j, k] of landingCells(e)) if (set.has(idx(i, j, k))) return true; }
  return false;
}

// ======================================================================================================
// aiming
// ======================================================================================================
export function aimCells(g, eye, dir, reach = 6.0) {
  const w = g.world; let last = null, hit = null;
  for (let t = 0.2; t < reach; t += 0.08) {
    const i = toI(eye.x + dir.x * t), j = toJ(eye.y + dir.y * t), k = toK(eye.z + dir.z * t);
    if (!w.inside(i, Math.max(0, j), k)) { if (j < 0 && w.inside(i, 0, k) && last) hit = { i, j: -1, k }; break; }
    if (w.solid(i, j, k)) { hit = { i, j, k }; break; }
    last = { i, j, k };
  }
  if (!last) return null;
  return { last, hit, sp: hit && hit.j >= 0 ? g.world.get(hit.i, hit.j, hit.k) : 0 };
}
function floorOf(w, c) {
  let j = c.j, guard = 0;
  while (j > 0 && !w.solid(c.i, j - 1, c.k) && guard++ < 8) j--;
  if (j > 0 && !w.solid(c.i, j - 1, c.k)) return null;
  return { i: c.i, j, k: c.k };
}
export const faceDir = (g, yaw) => (faceOf(yaw) + ((g._bRot || 0) & 3)) & 3;
const zoopOf = (g) => { const z = g._bz || (g._bz = { n: 1, w: 1 }); return z; };

// the nearest pad lattice to snap to: { ox, oz, src } or null. Ctrl asks for the world grid.
function gridOrigin(g, i, k, j, ctrl) {
  if (ctrl) return { ox: 0, oz: 0, src: 'world grid' };
  let best = null, bd = 1e9;
  for (const e of allPads(g)) { const d = Math.max(Math.abs(e.i0 + 1.5 - i), Math.abs(e.k0 + 1.5 - k)); if (d < 16 && d < bd && Math.abs(e.j - j) <= 8) { bd = d; best = e; } }
  if (best) return { ox: mod4(best.i0), oz: mod4(best.k0), src: 'pad grid' };
  // a frame is a 4x4x4 cube, exactly one pad wide and one pad deep: a pad lines up with it edge to edge. (An old one cell deep frame: a pad starts right after, or ends right before, its depth.)
  bd = 1e9;
  for (const it of g.machines.items.values()) {
    const f = it.ent; if (f.type !== 'frame' || f.turned || f.gm === undefined) continue;
    const cube = f.d !== undefined, gc = f.gm + (cube ? 1.5 : 0), lc = f.glo + 1.5;
    const d = f.axis === 'x' ? Math.max(Math.abs(gc - i), Math.abs(lc - k)) : Math.max(Math.abs(lc - i), Math.abs(gc - k));
    if (d < 9 && d < bd) {
      bd = d;
      if (cube) best = f.axis === 'x' ? { ox: mod4(f.gm), oz: mod4(f.glo) } : { ox: mod4(f.glo), oz: mod4(f.gm) };
      else best = f.axis === 'x' ? { ox: mod4(i > f.gm ? f.gm + 1 : f.gm), oz: mod4(f.glo) } : { ox: mod4(f.glo), oz: mod4(k > f.gm ? f.gm + 1 : f.gm) };
    }
  }
  return best ? { ox: best.ox, oz: best.oz, src: 'frame grid' } : null;
}
const shiftDown = (g) => !!(g.keys && (g.keys.ShiftLeft || g.keys.ShiftRight));
const ctrlDown = (g) => !!(g.keys && (g.keys.ControlLeft || g.keys.ControlRight));
const bad = (why, ent) => ({ plan: { ok: false, why, ent }, cost: 0 });

// ---- the aim point -> where a pad goes: { i0, k0, j, snap } or { why }
function padSpot(g, a, nudge) {
  const w = g.world;
  const H = a.hit;
  if (H && a.sp === PAD) {
    const P = ownerAt(g, H.i, H.j, H.k);
    if (P && P.type === 'pad') {
      const li = H.i - P.i0, lk = H.k - P.k0, L = a.last;
      const inside = L.i >= P.i0 && L.i < P.i0 + 4 && L.k >= P.k0 && L.k < P.k0 + 4;
      if (inside && L.j > H.j) {
        if (li >= 1 && li <= 2 && lk >= 1 && lk <= 2) return { i0: P.i0, k0: P.k0, j: P.j + 1, snap: 'stacked on the pad below' };
        const d = [3 - li, 3 - lk, li, lk]; let bd = 0; for (let q = 1; q < 4; q++) if (d[q] < d[bd]) bd = q;
        return { i0: P.i0 + 4 * DX[bd], k0: P.k0 + 4 * DZ[bd], j: P.j, snap: 'beside the pad' };
      }
      if (inside && L.j < H.j) return { i0: P.i0, k0: P.k0, j: P.j - 1, snap: 'under the pad' };
      let d = 0;
      if (L.i >= P.i0 + 4) d = 0; else if (L.i < P.i0) d = 2; else if (L.k >= P.k0 + 4) d = 1; else d = 3;
      return { i0: P.i0 + 4 * DX[d], k0: P.k0 + 4 * DZ[d], j: P.j, snap: 'beside the pad' };
    }
  }
  // aiming at a catwalk plate, a wall or the ground: find the floor under the aimed spot and put the pad on the nearest grid
  let c = a.last; const f = floorOf(w, c); if (!f) return { why: 'No floor here: aim at the ground or at a pad' };
  const ctrl = ctrlDown(g), go = nudge ? null : gridOrigin(g, f.i, f.k, f.j, ctrl);
  let i0, k0, snap;
  if (go) { i0 = fl4(f.i, go.ox); k0 = fl4(f.k, go.oz); snap = 'on the ' + go.src; } else { i0 = f.i - 1; k0 = f.k - 1; snap = nudge ? 'nudged' : 'free'; }
  if (nudge) { const d = faceDir(g, g.player.yaw); i0 += nudge * DX[d]; k0 += nudge * DZ[d]; }
  return { i0, k0, j: f.j, snap };
}

// the pieces of a zoop starting at the base spot: lines of up to 10 pads (or blocks up to 5 x 5), each line cut at the first piece that does not fit
function zoopPieces(g, mk, base, zd, n, wd, have, rd = (zd + 1) & 3) {
  const out = [], first = { type: 'pad', mk, i0: base.i0, k0: base.k0, j: base.j };
  const r = checkPiece(g, first); if (r) return { pieces: [], why: r };
  let why = null, skipped = 0;
  for (let b = 0; b < wd; b++) for (let a = 0; a < n; a++) {
    if (out.length >= have) { skipped++; continue; }
    const p = { type: 'pad', mk, i0: base.i0 + 4 * (a * DX[zd] + b * DX[rd]), k0: base.k0 + 4 * (a * DZ[zd] + b * DZ[rd]), j: base.j };
    const why2 = (a === 0 && b === 0) ? null : checkPiece(g, p);
    if (why2) { if (!why) why = `piece ${out.length + 1}: ${why2}`; skipped += n - a; break; }
    out.push(p);
  }
  return { pieces: out, why, skipped };
}

// ======================================================================================================
// plans (one per tool kind). Each returns { plan: { ok, why, ent }, cost }
// ======================================================================================================
export function planPad(g, tool, eye, dir, yaw) {
  if (hooks.planBayPad) { const r = hooks.planBayPad(g, tool, eye, dir, yaw); if (r) return r; }   // aiming into a cube with Stacked Building: a floor or ceiling plate that snaps to it (stack.js)
  const mk = kindFromId(tool.id, 'timber'), a = aimCells(g, eye, dir, g._bhold ? 18 : 6);   // while dragging, the crosshair may reach far along the floor
  if (!a) return bad('Aim at the floor or at a pad');
  const nudge = (g._bn || 0) & 3, sp = padSpot(g, a, nudge);
  if (sp.why) return bad(sp.why);
  const z = zoopOf(g), have = g.S.items[tool.id] || 0, hold = holdOf(g, tool);
  let want = Math.min(ZOOP_LINE, z.n), wd = z.w > 1 ? Math.min(ZOOP_SIDE, z.w) : 1, zd = faceDir(g, yaw), rd = (zd + 1) & 3, base = sp;
  if (hold) {
    // hold B and drag: the press anchored the first pad, the line runs from it toward the pad under the crosshair along the longer axis (Shift: a block, up to 5 x 5)
    const dI = sp.i0 - hold.i0, dK = sp.k0 - hold.k0, alongX = Math.abs(dI) >= Math.abs(dK);
    if (dI || dK) {   // dragged: the count comes from how far you drag. Not dragged (a plain tap of B): the - and = count and the way you face still rule
      zd = alongX ? (dI >= 0 ? 0 : 2) : (dK >= 0 ? 1 : 3); rd = alongX ? (dK >= 0 ? 1 : 3) : (dI >= 0 ? 0 : 2);
      want = Math.min(ZOOP_LINE, Math.round(Math.abs(alongX ? dI : dK) / 4) + 1);
      wd = shiftDown(g) ? Math.min(ZOOP_SIDE, Math.round(Math.abs(alongX ? dK : dI) / 4) + 1) : 1;
    }
    base = { i0: hold.i0, k0: hold.k0, j: hold.j, snap: 'anchored where you pressed' };
  }
  const len = wd > 1 ? Math.min(want, ZOOP_SIDE) : want;
  const zp = zoopPieces(g, mk, base, zd, len, wd, Math.max(1, have), rd);
  const ent = { type: 'pad', mk, i0: base.i0, k0: base.k0, j: base.j, snap: base.snap, zd, zoop: zp.pieces.map((q) => [q.i0, q.k0]), zn: len, zw: wd };
  if (!zp.pieces.length) return bad(zp.why || 'Cannot build here', ent);
  const price = padPrice(mk) * 3 * zp.pieces.length;
  ent.cost = price; ent.cut = zp.why; ent.skipped = zp.skipped || 0;
  const askN = len * wd;
  const clipped = zp.pieces.length < askN;
  g._xInfo = { t: g.time + 0.35, title: `${KIND_NAME[mk].toUpperCase()} PAD${zp.pieces.length > 1 ? ' x ' + zp.pieces.length : ''}`, lit: true, lines: [
    `${snapText(sp.snap)}${nudge ? ', nudged ' + nudge : ''}${ctrlDown(g) ? ', world grid' : ''}`,
    hold ? `Dragging: ${wd > 1 ? len + ' x ' + wd : zp.pieces.length} pad${zp.pieces.length > 1 ? 's' : ''}. Let go to lay them${shiftDown(g) ? '' : ', hold Shift to drag a block'}` : zp.pieces.length > 1 ? `Zoop ${wd > 1 ? len + ' x ' + wd : zp.pieces.length} (${zp.pieces.length} pads, one undo with Shift+X)` : 'One pad. Hold B and drag, or - and =, to zoop up to 10 (Shift: 5 x 5)',
    `Material cost about ${fmtMoney(price)} (${zp.pieces.length} pads, ${have} in your pack)`,
    clipped ? (zp.why ? 'Cut short at ' + zp.why : `Only ${have} pads in your pack`) : null,
    'R turns the zoop, Shift+R nudges a cell, Ctrl locks to the world grid'] };
  return { plan: { ok: true, ent }, cost: price };
}

const snapText = (s) => (s === 'free' ? 'Placed where you aim: no pad or frame near to line up with' : s === 'nudged' ? 'Nudged off the grid' : /grid$/.test(s) ? 'Lined up ' + s : s.charAt(0).toUpperCase() + s.slice(1));
const fmtMoney = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n)));

// where a catwalk, ramp or stair attaches: a pad / catwalk plate beside the aimed empty cell (same row), or the top of a pad or catwalk end (the edge nearest
// the aim). Returns { d: direction from the plate outward, row: the plate's row, last: the first cell beyond it } or null (aim at the floor).
function sideAttach(g, a) {
  const H = a.hit, L = a.last; if (!H || H.j < 0 || a.sp !== PAD) return null;
  if (H.j === L.j) {
    const di = L.i - H.i, dk = L.k - H.k; if (Math.abs(di) + Math.abs(dk) !== 1) return null;
    return { d: di === 1 ? 0 : di === -1 ? 2 : dk === 1 ? 1 : 3, row: H.j, last: { i: L.i, k: L.k } };   // from the plate toward the aimed cell
  }
  if (L.j !== H.j + 1 || L.i !== H.i || L.k !== H.k) return null;
  const E = ownerAt(g, H.i, H.j, H.k); if (!E) return null;
  if (E.type === 'pad') {
    const li = H.i - E.i0, lk = H.k - E.k0, dd = [3 - li, 3 - lk, li, lk]; let d = 0; for (let q = 1; q < 4; q++) if (dd[q] < dd[d]) d = q;
    return { d, row: E.j, last: d === 0 ? { i: E.i0 + 4, k: H.k } : d === 2 ? { i: E.i0 - 1, k: H.k } : d === 1 ? { i: H.i, k: E.k0 + 4 } : { i: H.i, k: E.k0 - 1 } };
  }
  if (E.type === 'catwalk') {
    const along = E.ax === 'x' ? H.i - E.i0 : H.k - E.k0, far = along >= 2, d = E.ax === 'x' ? (far ? 0 : 2) : (far ? 1 : 3);
    return { d, row: E.j, last: E.ax === 'x' ? { i: far ? E.i0 + 4 : E.i0 - 1, k: E.k0 } : { i: E.i0, k: far ? E.k0 + 4 : E.k0 - 1 } };
  }
  return null;
}

export function planCatwalk(g, tool, eye, dir, yaw) {
  const mk = tool.p && kindOk(tool.p.mk) ? tool.p.mk : 'timber', a = aimCells(g, eye, dir);
  if (!a) return bad('Aim at the floor, a pad or a catwalk end');
  const sa = sideAttach(g, a); let d, start;
  if (sa) { d = sa.d; start = { i: sa.last.i, j: sa.row, k: sa.last.k }; }
  else { const f = floorOf(g.world, a.last); if (!f) return bad('No floor here'); d = faceDir(g, yaw); const nd = (g._bn || 0) & 3; start = nd ? { i: f.i + nd * DX[d], j: f.j, k: f.k + nd * DZ[d] } : f; }   // Shift+R nudges a free catwalk one to three cells along your facing
  const z = zoopOf(g), n = Math.min(ZOOP_LINE, z.n), have = Math.max(1, g.S.items[tool.id] || 0);
  const ax = (d & 1) ? 'z' : 'x', pieces = [];
  let why = null;
  for (let q = 0; q < n && pieces.length < have; q++) {
    const si = start.i + DX[d] * CAT_LEN * q, sk = start.k + DZ[d] * CAT_LEN * q;
    const p = { type: 'catwalk', mk, ax, i0: d === 2 ? si - (CAT_LEN - 1) : si, k0: d === 3 ? sk - (CAT_LEN - 1) : sk, j: start.j };
    const r = checkPiece(g, p); if (r) { why = r; break; }
    pieces.push(p);
  }
  const ent = { type: 'catwalk', mk, ax, d, i0: pieces[0] ? pieces[0].i0 : start.i, k0: pieces[0] ? pieces[0].k0 : start.k, j: start.j, zoop: pieces.map((q) => [q.i0, q.k0]), snap: sa ? 'attached' : 'free' };
  if (!pieces.length) return bad(why || 'Cannot build here', ent);
  const price = pricePer('catwalk', 'catwalk', mk) * 3 * pieces.length;
  g._xInfo = { t: g.time + 0.35, title: `CATWALK${pieces.length > 1 ? ' x ' + pieces.length : ''}`, lit: true, lines: [sa ? 'Attached to the plate you aim at' : 'Free standing: it must start on the ground or a pad', `${pieces.length} x 4 cells, about ${fmtMoney(price)}`, why ? 'Cut short: ' + why : 'Holds belts and poles, not trucks. - and = lengthen it, R turns it'] };
  return { plan: { ok: true, ent }, cost: price };
}

export function planWall(g, tool, eye, dir, yaw) {
  if (hooks.planBayWall) { const r = hooks.planBayWall(g, tool, eye, dir, yaw); if (r) return r; }   // aiming into a cube: a door frame on its outer layer (stack.js)
  const a = aimCells(g, eye, dir); if (!a) return bad('Aim at the floor or the top of a pad');
  const z = zoopOf(g), n = Math.min(ZOOP_LINE, z.n), have = Math.max(1, g.S.items[tool.id] || 0);
  let ax, start, j, snap = 'free';
  const H = a.hit;
  if (H && a.sp === PAD && a.last.j > H.j) {
    // the top of a pad: the wall goes along the nearest edge of that pad
    const P = ownerAt(g, H.i, H.j, H.k);
    if (P && P.type === 'pad') {
      const li = H.i - P.i0, lk = H.k - P.k0, d = [3 - li, 3 - lk, li, lk]; let bd = 0; for (let q = 1; q < 4; q++) if (d[q] < d[bd]) bd = q;
      ax = (bd & 1) ? 'x' : 'z'; j = P.j + 1; snap = 'on the pad edge';
      start = { i: bd === 0 ? P.i0 + 3 : bd === 2 ? P.i0 : P.i0, k: bd === 1 ? P.k0 + 3 : bd === 3 ? P.k0 : P.k0 };
    }
  }
  if (!start) {
    const f = floorOf(g.world, a.last); if (!f) return bad('No floor here');
    const fd = faceDir(g, yaw); ax = (fd & 1) ? 'x' : 'z';   // across your view
    const nd = (g._bn || 0) & 3, go = nd ? null : gridOrigin(g, f.i, f.k, f.j, ctrlDown(g));   // Shift+R: off the grid, nudged along your facing
    start = { i: ax === 'x' ? (go ? fl4(f.i, go.ox) : f.i - 1) : f.i, k: ax === 'z' ? (go ? fl4(f.k, go.oz) : f.k - 1) : f.k }; j = f.j;
    if (nd) { start.i += nd * DX[fd]; start.k += nd * DZ[fd]; snap = 'nudged'; }
    if (go) snap = 'on the ' + go.src;
  }
  const pieces = []; let why = null;
  for (let q = 0; q < n && pieces.length < have; q++) {
    const p = { type: 'wall', ax, i0: start.i + (ax === 'x' ? 4 * q : 0), k0: start.k + (ax === 'z' ? 4 * q : 0), j };
    const r = checkPiece(g, p); if (r) { why = r; break; }
    pieces.push(p);
  }
  const ent = { type: 'wall', ax, i0: pieces[0] ? pieces[0].i0 : start.i, k0: pieces[0] ? pieces[0].k0 : start.k, j, zoop: pieces.map((q) => [q.i0, q.k0]), snap };
  if (!pieces.length) return bad(why || 'Cannot build here', ent);
  const price = pricePer('wall', 'wall', 'timber') * 3 * pieces.length;
  g._xInfo = { t: g.time + 0.35, title: `WALL${pieces.length > 1 ? ' x ' + pieces.length : ''}`, lit: true, lines: [`${snap}; 4 wide, 4 high, made of bulkhead panels`, `${pieces.length} x 16 cells, about ${fmtMoney(price)}`, why ? 'Cut short: ' + why : 'It holds the pile back and anchors the roof beside it. - and = lengthen, R turns it'] };
  return { plan: { ok: true, ent }, cost: price };
}

// ramps and stairs: aim at the side of a pad (or a plate) and the piece climbs up to it; otherwise it starts at the floor you aim at and rises the way you face
export function planSlope(g, tool, eye, dir, yaw) {
  if ((tool.kind === 'stair' || (tool.kind === 'wramp' && tool.id === 'wramp')) && hooks.planBayStair) { const r = hooks.planBayStair(g, tool, eye, dir, yaw); if (r) return r; }   // aiming into a cube: a switchback stair (or ramp) of two flights (stack.js)
  const sh = SHAPE[tool.id] || SHAPE[tool.kind]; if (!sh) return bad('Unknown piece');
  const type = tool.kind, a = aimCells(g, eye, dir);
  if (!a) return bad('Aim at the floor, or at the side of a pad to climb to it');
  const sa = sideAttach(g, a); let d, j, endI, endK, snap;
  if (sa && sa.row >= sh.rise - 1) {
    // the high end meets the aimed plate: the piece starts at the empty cell beside it and runs away from the plate
    d = (sa.d + 2) & 3; j = sa.row - (sh.rise - 1); endI = sa.last.i; endK = sa.last.k; snap = 'climbs to the pad';
  } else {
    const f = floorOf(g.world, a.last); if (!f) return bad('No floor here');
    d = faceDir(g, yaw); j = f.j; snap = 'rises the way you face';
    // the aimed cell is the LOW end; the high end is len - 1 cells further on
    endI = f.i + DX[d] * (sh.len - 1); endK = f.k + DZ[d] * (sh.len - 1);
  }
  // the footprint: len cells along d ending at (endI, endK), w cells across centred on that line
  const lowI = endI - DX[d] * (sh.len - 1), lowK = endK - DZ[d] * (sh.len - 1);
  const lat = (d + 1) & 3, off = -Math.floor((sh.w - 1) / 2);
  const ci = [], ck = [];
  for (let u = 0; u < sh.len; u++) for (let v = 0; v < sh.w; v++) { ci.push(lowI + DX[d] * u + DX[lat] * (v + off)); ck.push(lowK + DZ[d] * u + DZ[lat] * (v + off)); }
  const p = { type, mk: tool.p && kindOk(tool.p.mk) ? tool.p.mk : 'timber', i0: Math.min(...ci), k0: Math.min(...ck), j, dir: d, w: sh.w, len: sh.len, rise: sh.rise };
  const why = checkPiece(g, p);
  const price = pricePer(type, tool.id, p.mk) * 3;
  const slope = (sh.rise) / sh.len;
  const ent = { ...p, snap };
  g._xInfo = { t: g.time + 0.35, title: (type === 'stair' ? 'STAIR' : sh.len >= 3 ? 'TRUCK RAMP' : 'RAMP') + ` ${sh.w} x ${sh.len}`, lit: !why, lines: [`Rises ${(sh.rise * C).toFixed(1)} m over ${(sh.len * C).toFixed(1)} m (${Math.round(Math.atan(slope) * 180 / Math.PI)} degrees)`, snap, slope <= TRUCK_SLOPE + 1e-9 ? 'Gentle enough for trucks' : 'Too steep for trucks, fine on foot', `About ${fmtMoney(price)}. R turns it`] };
  if (why) return bad(why, ent);
  return { plan: { ok: true, ent }, cost: price };
}

export function planLevel(g, tool, eye, dir, yaw) {
  const a = aimCells(g, eye, dir); if (!a) return bad('Aim at the floor where the machine should stand');
  const f = floorOf(g.world, a.last); if (!f) return bad('No floor here');
  const key = idx(f.i, f.j, f.k);
  if (g.world.get(f.i, f.j, f.k)) return bad('Not an empty cell');
  if (g.world.reserved.has(key) || g.logi.tiles.has(key)) return bad('Something is already here');
  const d = faceDir(g, yaw), size = Math.max(1, Math.min(3, zoopOf(g).n));
  const ent = { type: 'levelpad', i: f.i, j: f.j, k: f.k, dir: d, size, mk: bestKindFor(g) };
  g._xInfo = { t: g.time + 0.35, title: 'LEVELING PAD', lit: true, lines: [`Digs and floors a ${size} x ${size} pad area (${size * 4} x ${size * 4} cells) in front of it`, `Uses ${LEVEL_KW} kW and about ${fmtMoney(padPrice(ent.mk) * 3)} of ${KIND_NAME[ent.mk]} per pad. - and = set the size`] };
  return { plan: { ok: true, ent }, cost: LEVEL_PRICE * 3 };
}
const bestKindFor = (g) => bestKind(g.T && g.T.frames);

// ======================================================================================================
// previews
// ======================================================================================================
function boxOf(p) {
  const v = volumeOf(p), x0 = xMin(p.i0), z0 = zMin(p.k0), pieceRows = p.type === 'wall' ? 4 : 1;
  return { x0, x1: x0 + v.nx * C, z0, z1: z0 + v.nz * C, y0: p.j * C, y1: (p.j + pieceRows) * C };
}
export function previewPieces(g, tool, plan) {
  const mc = g.machines;
  if (!plan || !plan.ent) { mc.setGhost(null); return; }
  const e = plan.ent, ok = plan.ok;
  if (e.type === 'wramp' || e.type === 'stair') {
    const flights = e.mod === 'u' && hooks.moduleFlights ? hooks.moduleFlights(g, e) : [e];   // a switchback stair of a cube shows both flights
    const key = `b${e.type}${ok}${flights.map((f) => `${f.i0},${f.k0},${f.j},${f.dir}${f.w}${f.len}`).join('|')}`;
    if (mc.ghostKey !== key) {
      const all = new THREE.Group();
      for (const f of flights) {
        const wedge = M.ghostWedge(f, ok), grp = new THREE.Group(); grp.add(wedge);
        const s = spec(f), x0 = xMin(f.i0), z0 = zMin(f.k0), xc = x0 + s.nx * C / 2, zc = z0 + s.nz * C / 2;
        const px = f.dir === 0 ? x0 : f.dir === 2 ? x0 + s.nx * C : xc, pz = f.dir === 1 ? z0 : f.dir === 3 ? z0 + s.nz * C : zc;
        grp.position.set(px, f.j * C, pz); grp.rotation.y = M.yawOf(f.dir);
        all.add(grp);
      }
      mc.setGhost(all, key);
    }
    return;
  }
  if (e.type === 'levelpad') {
    const key = `blp${ok}${e.i},${e.j},${e.k},${e.dir},${e.size}`;
    if (mc.ghostKey !== key) {
      const boxes = [{ x0: cellX(e.i) - 0.5, x1: cellX(e.i) + 0.5, z0: cellZ(e.k) - 0.5, z1: cellZ(e.k) + 0.5, y0: e.j * C, y1: e.j * C + 1.6 }];
      for (const q of levelSlots(e)) boxes.push({ x0: xMin(q.i0), x1: xMin(q.i0) + 4 * C, z0: zMin(q.k0), z1: zMin(q.k0) + 4 * C, y0: e.j * C, y1: e.j * C + C });
      mc.setGhost(M.ghostBoxes(boxes, ok), key);
    }
    return;
  }
  // pads, catwalks, walls: one translucent box per piece (the first piece alone when the plan is refused)
  const list = e.zoop && e.zoop.length ? e.zoop : [[e.i0, e.k0]];
  const key = `bp${e.type}${ok}${e.j}${e.ax || ''}${e.op ? 'o' + e.op + ':' + (e.od | 0) : ''}|${list.map((q) => q.join(',')).join(';')}`;
  if (mc.ghostKey !== key) {
    // a plate with an opening (wave 10) is drawn without it: the ghost is one box per row of cells that will be laid
    const boxes = e.op ? cellsOf({ ...e, i0: list[0][0], k0: list[0][1] }).map(([i, , k]) => ({ x0: xMin(i), x1: xMin(i) + C, z0: zMin(k), z1: zMin(k) + C, y0: e.j * C, y1: (e.j + 1) * C })) : list.map(([i0, k0]) => boxOf({ ...e, i0, k0 }));
    mc.setGhost(M.ghostBoxes(boxes, ok), key);
  }
}

// ======================================================================================================
// sanitizing a placement (a guest's message is data, never trusted) and building it on the host
// ======================================================================================================
// -> [{ type, i0, k0, j, ... }] for the host to place, or null
export function piecesFrom(g, type, rid, e) {
  if (!e || typeof e !== 'object') return null;
  const j = e.j;
  if (type === 'levelpad') return null;
  const list = Array.isArray(e.zoop) && e.zoop.length ? e.zoop : [[e.i0, e.k0]];
  if (list.length > ZOOP_MAX) return null;
  if ((type === 'pad' || type === 'stair' || type === 'wramp' || type === 'wall') && (e.bay !== undefined || e.op !== undefined) && hooks.bayPieces) return hooks.bayPieces(g, type, rid, e, list);   // a plate or a switchback stair built into a cube: the host rebuilds it from the cube it stands in, never from the numbers it was sent
  const out = [];
  for (const q of list) {
    if (!Array.isArray(q) || q.length !== 2 || !int(q[0], 0, NX - 1) || !int(q[1], 0, NZ - 1)) return null;
    if (type === 'pad') { const mk = kindFromId(rid, null); if (!mk) return null; out.push({ type, mk, i0: q[0], k0: q[1], j }); }
    else if (type === 'catwalk') { if (e.ax !== 'x' && e.ax !== 'z') return null; out.push({ type, mk: bestKindFor(g), ax: e.ax, i0: q[0], k0: q[1], j }); }
    else if (type === 'wall') { if (e.ax !== 'x' && e.ax !== 'z') return null; out.push({ type, mk: 'timber', ax: e.ax, i0: q[0], k0: q[1], j }); }
    else if (type === 'wramp' || type === 'stair') {
      const sh = SHAPE[rid]; if (!sh || !int(e.dir, 0, 3) || list.length !== 1) return null;
      out.push({ type, mk: bestKindFor(g), i0: q[0], k0: q[1], j, dir: e.dir, w: sh.w, len: sh.len, rise: sh.rise });
    } else return null;
  }
  if (!int(j, 0, NY - 1)) return null;
  return out;
}

// host re-check of a guest placement: a refusal text or null
export function conflictOf(g, type, rid, e) {
  if (type === 'levelpad') return conflictLevel(g, e);
  const pieces = piecesFrom(g, type, rid, e); if (!pieces || !pieces.length) return 'That placement is not valid';
  if ((g.S.items[rid] || 0) < pieces.length) return `You only have ${(g.S.items[rid] || 0)} of those`;
  for (let q = 0; q < pieces.length; q++) { const r = checkPiece(g, pieces[q]); if (r) return pieces.length > 1 ? `Piece ${q + 1}: ${r}` : r; }
  return null;
}

const nextGroup = (g) => { g.S.buildGrp = (g.S.buildGrp || 0) + 1; return g.S.buildGrp; };

// host side of placeCurrent: the first item was already taken. Places every piece that is still valid; returns the first ent's fields (placeEntity makes it).
export function buildPieces(g, tool, e) {
  const type = tool.kind, rid = tool.id;
  if (type === 'levelpad') return buildLevel(g, tool, e);
  const pieces = piecesFrom(g, type, rid, e); if (!pieces || !pieces.length) return null;
  const S = g.S, ok = [];
  for (const p of pieces) { if (checkPiece(g, p)) break; if (ok.length >= 1 + (S.items[rid] || 0)) break; ok.push(p); }
  if (!ok.length) return null;
  const extra = ok.length - 1;
  if (extra) { S.items[rid] = Math.max(0, (S.items[rid] || 0) - extra); if (S.items[rid] <= 0) delete S.items[rid]; }
  const grp = nextGroup(g);
  const fields = ok.map((p) => ({ ...p, rid, grp, ...(type === 'catwalk' ? { rail: railBits(p.ax) } : {}), ...(type === 'stair' ? {} : {}) }));
  for (let q = 1; q < fields.length; q++) { const { type: t, ...rest } = fields[q]; g.placeEntity(t, rest, { quiet: true, rebuild: false }); }
  if (extra) g.S.stats.built = (g.S.stats.built || 0) + extra;
  S.stats.shellPieces = (S.stats.shellPieces || 0) + ok.length;   // achievement counter: every pad, catwalk, wall, ramp and stair set down by hand
  if (hooks.counted) hooks.counted(g, ok);   // the pieces built into cubes: plates, switchback stairs, door frames (stack.js)
  const { type: _t, ...first } = fields[0];
  return { type, ...first };
}
// default rails of a catwalk: both long sides
const railBits = (ax) => (ax === 'x' ? (1 << 1) | (1 << 3) : (1 << 0) | (1 << 2));

// ======================================================================================================
// what an ent looks like in the world, and its upkeep
// ======================================================================================================
const placeFields = (e) => {
  const s = spec(e), x0 = xMin(e.i0 ?? e.i), z0 = zMin(e.k0 ?? e.k);
  e.px = x0 + s.nx * C / 2; e.pz = z0 + s.nz * C / 2; e.y0 = e.j * C;
  e.h = WALK_TYPES.has(e.type) ? e.rise * C : e.type === 'wall' ? 4 * C : C;
};
export function addBuild(machines, e) {
  const g = machines.game, w = g.world;
  if (e.type === 'levelpad') return addLevel(machines, e);
  e.mk = kindOk(e.mk) ? e.mk : 'timber';
  placeFields(e);
  const s = spec(e), x0 = xMin(e.i0), z0 = zMin(e.k0), L = s.nx * C, W = s.nz * C;
  const obj = new THREE.Group();
  if (CELL_TYPES.has(e.type)) {
    if (!e.view) {
      const sp = e.type === 'wall' ? BULK : PAD, vr = e.type === 'wall' ? 0 : cellVr(e);
      for (const [i, j, k] of cellsOf(e)) if (w.get(i, j, k) !== sp && !(e.type === 'pad' && e.bay !== undefined && w.get(i, j, k) === BULK)) { w.setCell(i, j, k, sp, e.type === 'wall' ? (128 | ((i * 7 + j * 13 + k * 3) & 127)) : vr); w.stabQueue.push({ i, j, k }); }
    }
    obj.position.set(x0, e.y0, z0);
    const bits = e.type === 'wall' ? 0 : (e.rail | 0) & 15;
    if (bits) { const rg = M.railGroup(bits, L, W, C); rg.userData.rails = true; obj.add(rg); }
    if (e.type === 'pad' && e.op && hooks.holeRails) obj.add(hooks.holeRails(e));   // guard rails round the opening of a plate in a cube (stack.js)
  } else {
    const o = e.type === 'stair' ? M.stairObject(e) : M.rampObject(e);
    const px = e.dir === 0 ? x0 : e.dir === 2 ? x0 + L : x0 + L / 2, pz = e.dir === 1 ? z0 : e.dir === 3 ? z0 + W : z0 + W / 2;
    o.position.set(px, e.y0, pz); o.rotation.y = M.yawOf(e.dir); obj.add(o);
    for (let r = 0; r < e.rise; r++) for (let dz = 0; dz < s.nz; dz++) for (let dx = 0; dx < s.nx; dx++) w.reserved.add(idx(e.i0 + dx, e.j + r, e.k0 + dz));
  }
  register(g, e);
  return { obj };
}

// a rail change (cfg): swap the rail mesh on the pad or catwalk's object
export function rebuildRails(g, e) {
  const it = g.machines.items.get(e.id); if (!it || e.type === 'wall') return;
  const old = it.obj.getObjectByName('rails'); if (old) { g.machines.disposeObj(old); it.obj.remove(old); }
  // the objects of a pad are the rail group (named) added below; rebuild it at the same place
  for (const ch of [...it.obj.children]) if (ch.userData && ch.userData.rails) { g.machines.disposeObj(ch); it.obj.remove(ch); }
  const s = spec(e), bits = (e.rail | 0) & 15;
  if (bits) { const rg = M.railGroup(bits, s.nx * C, s.nz * C, C); rg.userData.rails = true; it.obj.add(rg); }
}

// the hammer took it: give the cells back to the pile (host)
export function removeBuild(g, e) {
  const w = g.world;
  if (e.type === 'levelpad') { w.reserved.delete(idx(e.i, e.j, e.k)); return; }
  if (CELL_TYPES.has(e.type)) {
    const sp = e.type === 'wall' ? BULK : PAD;
    for (const [i, j, k] of cellsOf(e)) if (w.get(i, j, k) === sp) { w.setCell(i, j, k, 0, 0); w.stabQueue.push({ i, j, k }); }
    if (e.type === 'wall' && e.bay !== undefined && hooks.afterWall) { unregister(g, e); hooks.afterWall(g, e); return; }   // a door frame leaves the plate whole again
  } else if (WALK_TYPES.has(e.type)) {
    const s = spec(e); for (let r = 0; r < e.rise; r++) for (let dz = 0; dz < s.nz; dz++) for (let dx = 0; dx < s.nx; dx++) w.reserved.delete(idx(e.i0 + dx, e.j + r, e.k0 + dz));
  }
  unregister(g, e);
}

// Shift+X: take down every piece of the zoop group the aimed piece belongs to (host). Returns how many.
export function removeGroup(g, ref) {
  const it = g.machines.items.get(ref.id); if (!it) return 0;
  const e = it.ent; if (!isBuildType(e.type) || e.grp === undefined) return 0;
  const mates = allBuilt(g).filter((q) => q.grp === e.grp && q.type === e.type);
  for (const q of mates) g.doDecon({ kind: 'mach', id: q.id });
  return mates.length;
}

// what the hammer hands back
export function nameOf(e) {
  const n = KIND_NAME[e.mk] || 'Timber';
  return e.type === 'pad' ? `${n} Pad` : e.type === 'catwalk' ? `${n} Catwalk` : e.type === 'wall' ? 'Wall Section' : e.type === 'wramp' ? (e.len >= 3 && e.w > 1 ? `${n} Truck Ramp` : `${n} Ramp`) : e.type === 'stair' ? `${n} Stair` : e.type === 'levelpad' ? 'Leveling Pad' : e.type;
}
export function itemOfBuild(e) {
  if (e.rid) return e.rid;
  if (e.type === 'pad') return 'pad:' + (kindOk(e.mk) ? e.mk : 'timber');
  if (e.type === 'wramp') return e.len >= 3 && e.w > 1 ? 'wramp:haul' : 'wramp';
  return e.type;
}

// ======================================================================================================
// picking built things you aim at: pad / catwalk / wall cells and ramp / stair slopes. { ent, t } or null.
// ======================================================================================================
export function pickBuilt(g, eye, dir, maxD = 3.6) {
  const w = g.world, rg = reg(g);
  for (let t = 0.25; t < maxD; t += 0.1) {
    const x = eye.x + dir.x * t, y = eye.y + dir.y * t, z = eye.z + dir.z * t, i = toI(x), j = toJ(y), k = toK(z);
    if (rg.walk.size) { const a = rg.walk.get(colKey(i, k)); if (a) for (const id of a) { const e = entOf(g, id); if (!e) continue; const sy = slopeHeight(e, x, z); if (sy !== null && y >= e.y0 - 0.02 && y <= sy + 0.06) return { ent: e, t }; } }
    const s = w.get(i, j, k);
    if (s) { if (s === PAD || s === BULK) { const e = ownerAt(g, i, j, k); if (e) return { ent: e, t }; } return null; }
  }
  return null;
}

// ======================================================================================================
// walking on ramps and stairs
// ======================================================================================================
// the surface height of a ramp or stair at a world point (clamped to its footprint), plus how far outside the footprint the point is
function slopeAt(e, x, z) {
  const s = spec(e), x0 = xMin(e.i0), z0 = zMin(e.k0), x1 = x0 + s.nx * C, z1 = z0 + s.nz * C;
  const cx = Math.min(x1, Math.max(x0, x)), cz = Math.min(z1, Math.max(z0, z));
  const out = Math.hypot(x - cx, z - cz), Lm = e.len * C;
  const u = e.dir === 0 ? cx - x0 : e.dir === 2 ? x1 - cx : e.dir === 1 ? cz - z0 : z1 - cz;
  const t = Math.min(1, Math.max(0, u / Lm)), H = e.rise * C;
  let sy;
  if (e.type === 'stair') { const n = e.rise * 4; sy = e.y0 + H * Math.min(n, Math.floor(t * n) + 1) / n; if (u <= 0) sy = e.y0 + H / n; }
  else sy = e.y0 + H * t;
  return { sy, out, cx, cz, x0, z0, x1, z1 };
}
// the surface height if (x, z) is inside the footprint, else null
export function slopeHeight(e, x, z) { const r = slopeAt(e, x, z); return r.out > 1e-6 ? null : r.sy; }
// highest ramp or stair surface at a world point whose surface is within `reach` metres above `y`, or null (used by tests and by haul routing)
export function surfaceAt(g, x, z, y = 1e9) {
  const rg = reg(g), a = rg.walk.get(colKey(toI(x), toK(z))); if (!a) return null;
  let best = null;
  for (const id of a) { const e = entOf(g, id); if (!e) continue; const h = slopeHeight(e, x, z); if (h !== null && h <= y + 0.5 && (best === null || h > best)) best = h; }
  return best;
}
// slope of a ramp as rise over run, and whether a truck can climb it
// can a truck drive on the floor cell (i, j, k)? A pad can carry trucks, a catwalk plate cannot (haul roads read this)
export function canCarryTrucks(g, i, j, k) { const s = g.world.get(i, j, k); return s === PAD && !(g.world.getVr(i, j, k) & 16); }
export const slopeOf = (e) => (e.rise || 0) / (e.len || 1);
export const truckOk = (e) => slopeOf(e) <= TRUCK_SLOPE + 1e-9;

const R_BODY = 0.3, SNAP_UP = 0.36;
// the top of a floor cell (a pad or a plate) beside the stair or ramp you stand on, when it is higher than the tread by less than 0.2 m and your body overlaps its edge: that is a lip you step onto.
// The collision alone cannot do it for a slow walker (crouching, or slowed by dust): it pushes up a hair, and the snap to the tread pulls the feet down again, so the last step of a stair onto the plate beside it stuck.
function lipBeside(g, pl, sy) {
  const w = g.world, ci = toI(pl.pos.x), ck = toK(pl.pos.z), j = Math.ceil((sy + 0.005) / C) - 1, top = (j + 1) * C;
  if (j < 0 || top - sy > 0.2 || top - sy < 0.005) return 0;
  let best = 0;
  for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
    if (!di && !dk) continue;
    const i = ci + di, k = ck + dk; if (w.get(i, j, k) !== PAD || w.solid(i, j + 1, k) || w.solid(i, j + 2, k) || w.solid(i, j + 3, k)) continue;
    const x0 = xMin(i), z0 = zMin(k), nx = Math.min(x0 + C, Math.max(x0, pl.pos.x)), nz = Math.min(z0 + C, Math.max(z0, pl.pos.z));
    if (Math.hypot(pl.pos.x - nx, pl.pos.z - nz) <= R_BODY - 0.02) best = top;
  }
  return best;
}
// player.walk: called inside the player's step loop. Lifts the feet onto a slope under them, keeps the flanks solid. Returns true when standing on one.
export function walkStep(g, pl) {
  const rg = reg(g); if (!rg.walk.size) return false;
  const px = pl.pos.x, pz = pl.pos.z, ci = toI(px), ck = toK(pz);
  let grounded = false;
  const seen = new Set();
  for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
    const a = rg.walk.get(colKey(ci + di, ck + dk)); if (!a) continue;
    for (const id of a) {
      if (seen.has(id)) continue; seen.add(id);
      const e = entOf(g, id); if (!e) continue;
      const r = slopeAt(e, pl.pos.x, pl.pos.z); if (r.out > R_BODY) continue;
      const feet = pl.pos.y; let sy = r.sy;
      if (feet < sy - SNAP_UP) {
        // well below the surface: this is the flank (or the high end wall) of a wedge. Push out sideways, never through the low end.
        const s = spec(e), lowEdge = e.dir === 0 ? 'x0' : e.dir === 2 ? 'x1' : e.dir === 1 ? 'z0' : 'z1';
        const cand = [];
        if (lowEdge !== 'x0') cand.push([pl.pos.x - r.x0, -1, 0, 'x0']); if (lowEdge !== 'x1') cand.push([r.x1 - pl.pos.x, 1, 0, 'x1']);
        if (lowEdge !== 'z0') cand.push([pl.pos.z - r.z0, 0, -1, 'z0']); if (lowEdge !== 'z1') cand.push([r.z1 - pl.pos.z, 0, 1, 'z1']);
        void s;
        if (r.out > 0) { // outside the footprint but within the body radius: only the touching side matters
          const nx = pl.pos.x - r.cx, nz = pl.pos.z - r.cz, l = Math.hypot(nx, nz) || 1, push = R_BODY - r.out + 0.002;
          pl.pos.x += nx / l * push; pl.pos.z += nz / l * push;
          const vn = pl.vel.x * nx / l + pl.vel.z * nz / l; if (vn < 0) { pl.vel.x -= vn * nx / l; pl.vel.z -= vn * nz / l; }
        } else {
          cand.sort((p, q) => p[0] - q[0]); const [, sx, sz] = cand[0] || [0, 0, 1];
          if (sx) { pl.pos.x = (sx < 0 ? r.x0 : r.x1) + sx * (R_BODY + 0.002); pl.vel.x = 0; } else { pl.pos.z = (sz < 0 ? r.z0 : r.z1) + sz * (R_BODY + 0.002); pl.vel.z = 0; }
        }
        continue;
      }
      if (r.out > 0) continue;    // beside the slope and above its edge: nothing to stand on
      if (feet >= sy - 0.01) { const lip = lipBeside(g, pl, sy); if (lip > sy) sy = lip; }   // the plate beside the top of a stair
      if (feet <= sy + 0.1) {
        const lift = sy - feet;
        if (lift > 0.02) pl.stepOff -= lift;     // the camera eases up a stair tread instead of jumping
        pl.pos.y = sy; if (pl.vel.y < 0) pl.vel.y = 0;
        grounded = true;
      }
    }
  }
  return grounded;
}

// ======================================================================================================
// hold B (or hold left click) on a pad and drag: the press only anchors the first pad, the plan stretches from there, the release lays the zoop
// ======================================================================================================
function holdOf(g, tool) {
  const h = g._bhold; if (!h) return null;
  if (!tool || tool.kind !== 'pad' || tool.id !== h.id) { g._bhold = null; return null; }
  return h;
}
// game.useTool asks first: true when the press was taken as an anchor (nothing is placed yet)
export function holdStart(g, tool) {
  if (!tool || tool.kind !== 'pad' || g._bhold) return false;
  const pl = g.plan; if (!pl || !pl.ok || !pl.ent || pl.ent.type !== 'pad') return false;
  g._bhold = { id: tool.id, i0: pl.ent.i0, k0: pl.ent.k0, j: pl.ent.j };
  return true;
}
// once per frame (the pad handler's tick): the release, or a cancel when the tool was put away or changed
export function holdTick(g) {
  const h = g._bhold; if (!h) return;
  const t = g.curTool(); if (!t || t.kind !== 'pad' || t.id !== h.id || (g.ui && g.ui.isModalOpen && g.ui.isModalOpen())) { g._bhold = null; return; }   // put away, swapped or a window opened: the drag is dropped, nothing is placed
  if (g.keys && (g.keys.KeyB || g.keys.Mouse0)) return;
  g._bhold = null;
  if (g.plan && g.plan.ok) g.placeCurrent(t); else if (g.sound) g.sound.error();
}

// ======================================================================================================
// keys (game.js forwards them)
// ======================================================================================================
export const isShellTool = (kind) => kind === 'pad' || kind === 'catwalk' || kind === 'wall' || kind === 'wramp' || kind === 'stair' || kind === 'levelpad';
// R: turn the placement (4 steps); Shift+R: nudge the free spot one cell along your facing (0..3). Returns true when handled.
export function rotateKey(g, tool, shift) {
  if (!tool || !isShellTool(tool.kind)) return false;
  if (shift && !(tool.kind === 'pad' || tool.kind === 'catwalk' || tool.kind === 'wall')) { g.ui.hint('Shift+R nudges floor pads, catwalks and walls off the grid. <kbd>R</kbd> turns this one.', 2.5); return true; }   // nothing to nudge: say so instead of claiming it moved
  if (shift) { g._bn = (((g._bn || 0) + 1) & 3); g.ui.hint(g._bn ? `Nudged ${g._bn} cell${g._bn > 1 ? 's' : ''} off the grid. <kbd>Shift</kbd>+<kbd>R</kbd> steps it.` : 'Back on the grid.', 2); }
  else { g._bRot = (((g._bRot || 0) + 1) & 3); g.ui.hint('Turned a quarter.', 1.2); }
  g.machines.setGhost(null);
  return true;
}
// - and =: shorten / lengthen the zoop (pads: a line up to 10, Shift for the width up to 5; the Leveling Pad uses the length as its size 1 to 3)
export function zoopKey(g, tool, delta, shift) {
  if (hooks.zoopKey && hooks.zoopKey(g, tool, delta, shift)) return true;   // aiming into a cube: - and = pick the opening of the plate
  if (!tool || !isShellTool(tool.kind) || tool.kind === 'wramp' || tool.kind === 'stair') return false;
  const z = zoopOf(g);
  if (shift && tool.kind === 'pad') z.w = Math.max(1, Math.min(ZOOP_SIDE, z.w + delta)); else z.n = Math.max(1, Math.min(tool.kind === 'levelpad' ? 3 : ZOOP_LINE, (tool.kind === 'levelpad' ? Math.min(3, z.n) : z.n) + delta));   // the Leveling Pad's size is 1 to 3: the number never runs past it, so - always moves
  if (z.w > 1) z.n = Math.min(z.n, ZOOP_SIDE);
  g.ui.hint(tool.kind === 'levelpad' ? `Leveling Pad size ${Math.min(3, z.n)}.` : `Zoop ${z.w > 1 ? z.n + ' x ' + z.w : z.n} piece${z.n * z.w > 1 ? 's' : ''}.`, 1.5);
  g.machines.setGhost(null);
  return true;
}

// ======================================================================================================
// rails (E on a pad or catwalk toggles the rail on the edge you aim at)
// ======================================================================================================
export function useBuilt(g, e) {
  if (e.type !== 'pad' && e.type !== 'catwalk') return false;
  const eye = g.renderer.camera.position, dir = g.player.forward(g._useDir || (g._useDir = eye.clone()));
  const s = spec(e), x0 = xMin(e.i0), z0 = zMin(e.k0), top = (e.j + 1) * C;
  let hx = g.player.pos.x, hz = g.player.pos.z;
  if (Math.abs(dir.y) > 1e-3) { const t = (top - eye.y) / dir.y; if (t > 0 && t < 8) { hx = eye.x + dir.x * t; hz = eye.z + dir.z * t; } }
  const du = [x0 + s.nx * C - hx, z0 + s.nz * C - hz, hx - x0, hz - z0];   // distance to the +x, +z, -x, -z edges
  let side = 0; for (let q = 1; q < 4; q++) if (du[q] < du[side]) side = q;
  const bits = ((e.rail | 0) & 15) ^ (1 << side);
  const r = g.setCfg(e, { rail: bits });
  if (r.ok) { g.ui.hint(`Rail ${bits & (1 << side) ? 'put up' : 'taken down'} on the ${['east', 'south', 'west', 'north'][side]} edge.`, 2); g.sound.place(); }
  else { g.sound.error(); g.ui.hint(r.why || 'Could not change that', 2); }
  return true;
}

// ======================================================================================================
// readouts
// ======================================================================================================
export function infoBuilt(g, e) {
  const name = KIND_NAME[e.mk] || 'Timber', mates = e.grp !== undefined ? allBuilt(g).filter((q) => q.grp === e.grp && q.type === e.type).length : 1;
  const grpLine = mates > 1 ? `Part of a group of ${mates}: Shift+X takes the whole group down` : null;
  const hammer = 'The hammer or X takes this piece down and gives it back';
  const bayLines = hooks.infoPart ? hooks.infoPart(g, e) : [];
  if (e.type === 'pad') {
    const mount = padOnTop(g, e);
    return { title: `${name.toUpperCase()} ${e.bay !== undefined ? 'PLATE' : 'PAD'} (4 x 4)`, lit: true, lines: [...bayLines, `Solid floor, top at ${((e.j + 1) * C).toFixed(1)} m. Never falls, takes no roof load`, 'Holds belts, poles, frames and trucks', `Rails: ${railNames(e.rail)}. E toggles the edge you aim at`, mount, grpLine, hammer].filter(Boolean) };
  }
  if (e.type === 'catwalk') return { title: `${name.toUpperCase()} CATWALK (1 x 4)`, lit: true, lines: ['A thin deck: holds belts and poles, not trucks', `Rails: ${railNames(e.rail)}. E toggles the edge you aim at`, grpLine, hammer].filter(Boolean) };
  if (e.type === 'wall') return { title: e.bay !== undefined ? 'DOOR FRAME (4 x 4)' : 'WALL (4 x 4)', lit: true, lines: [...bayLines, 'Bulkhead panels: never fall, hold the pile back and anchor the roof beside them', grpLine, hammer].filter(Boolean) };
  if (e.type === 'wramp') return { title: e.len >= 3 && e.w > 1 ? `${name.toUpperCase()} TRUCK RAMP` : `${name.toUpperCase()} RAMP`, lit: true, lines: [...bayLines, `Rises ${(e.rise * C).toFixed(1)} m over ${(e.len * C).toFixed(1)} m, ${e.w * C} m wide`, truckOk(e) ? 'Gentle enough for trucks' : 'Steep: fine on foot, too steep for trucks', grpLine, hammer].filter(Boolean) };
  if (e.type === 'stair') return { title: `${name.toUpperCase()} STAIR`, lit: true, lines: [...bayLines, `Rises ${(e.rise * C).toFixed(1)} m over ${(e.len * C).toFixed(1)} m in ${e.rise * 4} treads`, grpLine, hammer].filter(Boolean) };
  return null;
}
const railNames = (b) => { const n = []; for (let q = 0; q < 4; q++) if (((b | 0) >> q) & 1) n.push(['east', 'south', 'west', 'north'][q]); return n.length ? n.join(', ') : 'none'; };
const padOnTop = (g, e) => { let n = 0; for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) if (g.logi.tiles.has(idx(e.i0 + dx, e.j + 1, e.k0 + dz))) n++; return n ? `${n} belt or machine tile${n > 1 ? 's' : ''} stand on it` : null; };

// ======================================================================================================
// the Leveling Pad: digs a box of plush and floors it with pads, one 4 x 4 slot at a time (host)
// ======================================================================================================
export function levelSlots(e) {
  const out = [], f = DX[e.dir], fz = DZ[e.dir], rd = (e.dir + 1) & 3, n = e.size;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    const u0 = 1 + 4 * a, v0 = -2 * n + 4 * b, ci = [], ck = [];
    for (const u of [u0, u0 + 3]) for (const v of [v0, v0 + 3]) { ci.push(e.i + f * u + DX[rd] * v); ck.push(e.k + fz * u + DZ[rd] * v); }
    out.push({ i0: Math.min(...ci), k0: Math.min(...ck), j: e.j });
  }
  return out;
}
const LEVEL_ST = ['idle', 'dig', 'lay', 'nopower', 'nofunds', 'blocked', 'done', 'off'];
export const levelStatus = (e) => LEVEL_ST.includes(e.st) ? e.st : 'idle';

function addLevel(machines, e) {
  const g = machines.game, w = g.world;
  e.mk = kindOk(e.mk) ? e.mk : 'timber'; e.size = int(e.size, 1, 3) ? e.size : 1; e.dir = int(e.dir, 0, 3) ? e.dir : 0;
  e.cx = cellX(e.i); e.cz = cellZ(e.k); e.px = e.cx; e.pz = e.cz; e.y0 = e.j * C; e.h = 1.6; e.hr = 0.8;
  if (e.on === undefined) e.on = true;
  const obj = M.levelObject(e); obj.position.set(e.cx, e.y0, e.cz); obj.rotation.y = e.dir === 0 ? Math.PI / 2 : e.dir === 1 ? 0 : e.dir === 2 ? -Math.PI / 2 : Math.PI;
  if (!e.view) w.reserved.add(idx(e.i, e.j, e.k));
  (g._levelCells || (g._levelCells = new Map())).set(idx(e.i, e.j, e.k), e.id);   // a guest does not reserve the cell: logistics.held reads this map (an entry whose pad is gone is dropped there)
  return { obj };
}
function conflictLevel(g, e) {
  if (!e || !int(e.i, 0, NX - 1) || !int(e.k, 0, NZ - 1) || !int(e.j, 0, NY - 1) || !int(e.dir, 0, 3) || !int(e.size, 1, 3)) return 'That placement is not valid';
  const w = g.world, key = idx(e.i, e.j, e.k);
  if (w.get(e.i, e.j, e.k)) return 'Not an empty cell';
  if (w.reserved.has(key) || g.logi.tiles.has(key)) return 'Something is already here';
  if (e.j > 0 && !w.solid(e.i, e.j - 1, e.k)) return 'No floor here';
  return null;
}
function buildLevel(g, tool, e) {
  const why = conflictLevel(g, e); if (why) return null;
  return { type: 'levelpad', i: e.i, j: e.j, k: e.k, dir: e.dir, size: e.size, mk: bestKindFor(g), on: true, st: 'idle', slot: 0, rid: tool.id, grp: nextGroup(g) };
}

// power: the grid solver counts a Leveling Pad as a consumer (power.js, DEMAND levelpad) and sets .pw on it; it runs only on a cable to a powered node.
// Before the first solve (or with no cable) it has no power.
export const levelKw = (e) => (e.on && e.st !== 'done' ? LEVEL_KW : 0);   // an idle or finished pad draws nothing
export const levelAt = (e) => [cellX(e.i), e.j * C + 1.0, cellZ(e.k)];
export function levelPower(g, e) {
  return e.pw !== undefined ? e.pw : 0;
}
// one frame of one machine
function levelTick(g, e, dt) {
  const w = g.world, S = g.S, slots = levelSlots(e);
  if (e.view) return;
  const setSt = (s) => { if (e.st !== s) { e.st = s; e.dirtySt = true; } };
  if (!e.on) { if (e.st !== 'done') setSt('off'); return; }
  if (e.slot >= slots.length) { setSt('done'); e.on = false; g.ui.toast && g.ui.toast({ icon: '🧱', title: 'Leveling Pad finished', text: `${slots.length} pad area${slots.length > 1 ? 's' : ''} dug and floored.`, ms: 3500 }); e.dirtyCfg = true; return; }
  const pw = levelPower(g, e); e.pwv = pw;
  if (pw <= 0.05) { setSt('nopower'); return; }
  const s = slots[e.slot], piece = { type: 'pad', mk: e.mk, i0: s.i0, k0: s.k0, j: s.j };
  const v = volumeOf(piece);
  // 1. dig out the plush in the slot (floor row and the headroom), nothing but plush: anything else skips the slot
  let plush = 0, blockedBy = null;
  for (let r = 0; r < v.top && !blockedBy; r++) for (let dz = 0; dz < v.nz; dz++) for (let dx = 0; dx < v.nx; dx++) {
    const i = s.i0 + dx, j = s.j + r, k = s.k0 + dz, c = w.get(i, j, k);
    if (c && (isSpecialCell(c) || c === NEEDLE)) { blockedBy = c === NEEDLE ? 'The One is in the way' : 'something solid is in the way'; break; }
    if (c) plush++;
    const key = idx(i, j, k); if (r < v.own && (g.logi.tiles.has(key) || (w.reserved.has(key) && !(i === e.i && j === e.j && k === e.k)))) { blockedBy = 'a machine is in the way'; break; }
  }
  if (blockedBy) { setSt('blocked'); e.why = blockedBy; e.slot++; e.skip = (e.skip || 0) + 1; return; }
  if (plush > 0) {
    setSt('dig'); e.acc = (e.acc || 0) + LEVEL_RATE * pw * dt;
    let n = Math.floor(e.acc); e.acc -= n;
    for (let r = 0; r < v.top && n > 0; r++) for (let dz = 0; dz < v.nz && n > 0; dz++) for (let dx = 0; dx < v.nx && n > 0; dx++) {
      const i = s.i0 + dx, j = s.j + r, k = s.k0 + dz; if (!w.get(i, j, k)) continue;
      const rm = w.removeCell(i, j, k, true); if (!rm) continue; n--; e.dug = (e.dug || 0) + 1; S.stats.cells++;
      g.sellAuto(rm.sp, rm.vr, 0.6, undefined, { x: cellX(s.i0 + 2), y: s.j * C + 0.9, z: cellZ(s.k0 + 2) });   // the coin rings at the pad
    }
    if (g.fx && Math.random() < dt * 6) g.fx.dust(cellX(s.i0 + 2), s.j * C + 0.6, cellZ(s.k0 + 2), 3, 0.8, 0.9);
    return;
  }
  // 2. lay the pad (money, like a bench craft but at full price)
  const why = checkPiece(g, piece, { skipPlayer: false, self: null });
  if (why) { if (/Step out/.test(why)) { setSt('blocked'); e.why = 'you are standing in it'; return; } setSt('blocked'); e.why = why; e.slot++; e.skip = (e.skip || 0) + 1; return; }
  const cost = padPrice(e.mk) * 3;
  if (S.money < cost) { setSt('nofunds'); return; }
  S.money -= cost; g.ui.setMoney(S.money);
  g.placeEntity('pad', { mk: e.mk, i0: s.i0, k0: s.k0, j: s.j, rid: 'pad:' + e.mk, grp: e.grp, lvl: e.id }, { quiet: true, rebuild: false });
  setSt('lay'); e.slot++; e.laid = (e.laid || 0) + 1;
  g.sound.place();
}
export function tickLevels(g, dt) {
  if (g.isGuest()) return;
  for (const it of g.machines.items.values()) {
    const e = it.ent; if (e.type !== 'levelpad') continue;
    levelTick(g, e, dt);
    M.setLamp(it.obj, e.on && (e.st === 'dig' || e.st === 'lay'));
    if (e.dirtyCfg) { e.dirtyCfg = false; g.netSend({ t: 'ent-', id: e.id }); g.netSend({ t: 'ent+', ent: g.stripEnt(e) }); }
  }
}
// a compact row for the guest every 0.5 s: [state index, slot, dug, laid, power%, skipped, why a slot was skipped]
export function levelRow(g) {
  const d = {}; let any = false;
  for (const it of g.machines.items.values()) { const e = it.ent; if (e.type !== 'levelpad') continue; d[e.id] = [LEVEL_ST.indexOf(levelStatus(e)), e.slot | 0, e.dug | 0, e.laid | 0, Math.round(((e.pw ?? e.pwv) || 0) * 100), e.skip | 0, String(e.why || '').slice(0, 60)]; any = true; }
  return any ? d : null;
}
export function applyLevelRow(g, d) {
  if (!d || typeof d !== 'object') return;
  for (const [id, a] of Object.entries(d)) {
    const e = entOf(g, +id); if (!e || e.type !== 'levelpad' || !Array.isArray(a)) continue;
    e.st = LEVEL_ST[a[0] | 0] || 'idle'; e.slot = a[1] | 0; e.dug = a[2] | 0; e.laid = a[3] | 0; e.pwv = (a[4] | 0) / 100; e.pw = e.pwv; e.skip = a[5] | 0; e.why = typeof a[6] === 'string' ? a[6] : '';
    const it = g.machines.items.get(+id); if (it) M.setLamp(it.obj, e.on && (e.st === 'dig' || e.st === 'lay'));
  }
}
const ST_TEXT = { idle: 'Ready', dig: 'Digging the area out', lay: 'Laying a pad', nopower: 'No power: run a Power Cable to it from a live pole or generator', nofunds: 'Waiting for money for the next pad', blocked: 'Skipped a slot that was blocked', done: 'Finished', off: 'Stopped' };
export function infoLevel(g, e) {
  const st = levelStatus(e), slots = levelSlots(e).length;
  return { title: 'LEVELING PAD', lit: e.on && (st === 'dig' || st === 'lay'), lines: [ST_TEXT[st] + (st === 'blocked' && e.why ? ': ' + e.why : ''), `Area ${e.size} x ${e.size} pads (${e.size * 4} x ${e.size * 4} cells), ${KIND_NAME[e.mk]} pads`, `Slot ${Math.min(e.slot | 0, slots)} of ${slots}: ${e.laid | 0} laid, ${e.skip | 0} skipped, ${e.dug | 0} plush dug`, `Draws ${LEVEL_KW} kW while it runs. ${(e.pw ?? e.pwv ?? 0) > 0.05 ? 'Powered ' + Math.round((e.pw ?? e.pwv ?? 0) * 100) + '%' : 'Not powered'}`, e.on ? 'E stops it' : e.st === 'done' ? 'E runs it again on the same area (pads are skipped where they stand)' : 'E starts it'] };
}
export function useLevel(g, e) {
  const r = g.setCfg(e, { on: !e.on });
  if (r.ok) { g.sound.place(); g.ui.hint(e.on ? 'Leveling Pad running.' : 'Leveling Pad stopped.', 2); } else { g.sound.error(); g.ui.hint(r.why || 'Could not change that', 2); }
  return true;
}
// restarting resets the slot counter so a second run covers the area again
export function onLevelCfg(g, e, clean) { if (clean.on === true) { if (e.st === 'done' || e.slot >= levelSlots(e).length) { e.slot = 0; e.skip = 0; e.laid = 0; e.dug = 0; } e.st = 'idle'; } }
