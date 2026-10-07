// Haul: the clearance contract, the truck router, haul roads and truck docks (Satisfactory spec 4.7, lead notes section 9).
//
// TWO TUNNEL CLASSES (lead notes). A normal tunnel is a run of 4x4x4 frame cubes: its clear opening between the pillars and under the beams is 3 x 3 cells
// (1.8 m), enough for a minecart, a belt, a lift, a fan and a walker. A giant tunnel is a run of arches: clear 5 x 4, 7 x 5 or 11 x 7 cells, for a Haul Truck
// (3 x 3 cells plus a cell of margin on each side and over the top: 5 x 4) and the big diggers. VEHICLES lists what every vehicle needs, `clearOfSupport` what every
// support offers, and `planRoute` is the one place that checks them for a truck: an A* over the floor cells with a 5 x 4 clear window that names what blocks it
// ("route blocked by the Steel Frame at (x, z): too narrow").
//
// ROADS are 4 x 4 cell plates painted on the floor (no cells of their own): a truck on one drives 1.4 times as fast and the router prefers them.
// DOCKS are 4 x 6 cell pads: a truck parked in one charges its battery from the grid at 25 kW, and a dock with a belt at one end is a place a truck unloads onto the belt
// (so a mine can feed a remote sorter or vault instead of the bin).
//
// Import rule (see arches.js): nothing imported here may be used at the top level of this module except config.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C, NX, NZ, cellX, cellZ, toI, toJ, toK, idx } from './config.js';
import * as A from './arches.js';
import { NEEDLE } from './plushdata.js';

const K_BENCH = 3;

// ---------------------------------------------------------------- the clearance contract
// w x h is the open rectangle a vehicle needs, in cells (across, up). A walker, a cart and a lift column are one cell wide.
export const VEHICLES = {
  walker:    { name: 'a person on foot', w: 1, h: 3 },
  belt:      { name: 'a belt', w: 1, h: 1 },
  lift:      { name: 'a belt lift', w: 1, h: 2 },
  minecart:  { name: 'a Mine Rail cart', w: 1, h: 3 },   // rail.js: a piece needs its cell and the two above it clear
  shuttle:   { name: 'the Mine Rail shuttle with a rider', w: 1, h: 3 },
  fan:       { name: 'a Support Fan', w: 1, h: 1 },
  dozer:     { name: 'a Bulldozer', w: 5, h: 3 },
  excavator: { name: 'an Excavator', w: 5, h: 4 },
  truck:     { name: 'a Haul Truck', w: 5, h: 4 },       // 3 x 3 cells plus a cell of margin on each side and over the top
  wheel:     { name: 'a Bucket-Wheel Excavator', w: 7, h: 5 },
};
export const TRUCK = VEHICLES.truck;
export const CUBE_CLEAR = { w: 3, h: 3 };   // a 4 x 4 x 4 frame: the pillars and beams take about a cell and a half of every side (0.2 to 0.28 m each)
export const fits = (veh, clear) => !!clear && clear.w >= veh.w && clear.h >= veh.h;
export const clearOfSupport = (e) => (e.type === 'garch' ? (e.clear ? { w: e.clear.w, h: e.clear.h } : null) : e.type === 'frame' ? CUBE_CLEAR : null);
// the class of tunnel a support makes
export const classOf = (e) => (e.type === 'garch' ? `arch${e.span}` : e.type === 'frame' ? 'cube' : null);
export const TUNNEL_CLASSES = { cube: CUBE_CLEAR, arch6: { w: 5, h: 4 }, arch8: { w: 7, h: 5 }, arch12: { w: 11, h: 7 } };
export const supportName = (e) => (e.type === 'garch' ? A.nameOf(e.span, e.mat) : e.type === 'frame' ? `${(e.kind || 'timber')[0].toUpperCase()}${(e.kind || 'timber').slice(1)} frame` : e.type);

// ---------------------------------------------------------------- columns and windows
const key2 = (i, k) => k * 16384 + i;
function colClear(g, memo, i, j, k, H) {
  const mk = ((k * 16384 + i) * 128 + j) * 16 + H; let v = memo.get(mk);
  if (v === undefined) {
    v = true; const w = g.world;
    for (let b = 0; b < H; b++) { if (j + b < 0 || w.solid(i, j + b, k) || g.logi.cellTaken(i, j + b, k)) { v = false; break; } }
    memo.set(mk, v);
  }
  return v;
}
export function windowClear(g, memo, i, j, k, W, H) {
  const hw = W >> 1;
  for (let a = -hw; a <= hw; a++) for (let c = -hw; c <= hw; c++) if (!colClear(g, memo, i + a, j, k + c, H)) return false;
  return true;
}
const hasFloor = (g, i, j, k) => j === 0 || g.world.solid(i, j - 1, k);
// the floor row at a spot, found from a row hint: the first row at or below it that has ground under it and room above (null when there is none)
export function floorRow(g, memo, i, k, hint, H = 1) {
  for (let j = Math.min(hint, 70); j >= Math.max(0, hint - 6); j--) if (hasFloor(g, i, j, k) && colClear(g, memo, i, j, k, H)) return j;
  return null;
}
export const floorNear = (g, x, z, rowHint) => {
  const i = toI(x), k = toK(z), w = g.world;
  for (const dj of [0, -1, 1, -2, 2]) { const j = rowHint + dj; if (j >= 0 && !w.solid(i, j, k) && hasFloor(g, i, j, k)) return j; }
  return null;
};

// ---------------------------------------------------------------- what the supports of a route offer (frames and arches)
export function supportIndex(g) {
  const map = new Map(), M = g.machines;
  const put = (i, k, rec) => { const kk = key2(i, k); let l = map.get(kk); if (!l) { l = []; map.set(kk, l); } l.push(rec); };
  for (const it of M.items.values()) {
    const e = it.ent;
    if (e.type === 'garch' && e.gm !== undefined) {
      const b = A.boxOf(e), cl = e.clear || { w: 0, h: 0 }; for (let i = b.i0; i <= b.i1; i++) for (let k = b.k0; k <= b.k1; k++) put(i, k, { ent: e, j0: b.j0, j1: b.j1, cw: cl.w, ch: cl.h });
    } else if (e.type === 'frame') {
      if (e.turned) { const ci = toI(e.cx), ck = toK(e.cz); for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) if (Math.hypot(cellX(ci + a) - e.cx, cellZ(ck + c) - e.cz) < 1.25) put(ci + a, ck + c, { ent: e, j0: Math.round(e.y0 / C), j1: Math.round(e.y0 / C) + 3, cw: CUBE_CLEAR.w, ch: CUBE_CLEAR.h }); }
      else { const b = M.blockBox(M.frameBlock(e)); for (let i = b.i0; i <= b.i1; i++) for (let k = b.k0; k <= b.k1; k++) put(i, k, { ent: e, j0: b.j0, j1: b.j1, cw: CUBE_CLEAR.w, ch: CUBE_CLEAR.h }); }
    }
  }
  return map;
}
// the worst support the window of a vehicle crosses at this cell: the one whose clear opening is smaller than what the vehicle needs
function narrowAt(idxMap, veh, i, j, k) {
  const hw = veh.w >> 1;
  for (let a = -hw; a <= hw; a++) for (let c = -hw; c <= hw; c++) {
    const l = idxMap.get(key2(i + a, k + c)); if (!l) continue;
    for (const r of l) if (j <= r.j1 && j + veh.h - 1 >= r.j0 && (r.cw < veh.w || r.ch < veh.h)) return r;
  }
  return null;
}

// ---------------------------------------------------------------- roads
export const ROAD = { n: 4, speed: 1.4, price: 24 };
let ROAD_VER = 0;
export const roadsOf = (g) => { const out = []; for (const it of g.machines.items.values()) if (it.ent.type === 'road') out.push(it.ent); return out; };
export function roadIndex(g) {
  const c = g._roadC;
  if (c && c.ver === ROAD_VER && g.time - c.t < 1 && c.n === g.machines.items.size) return c.map;
  const map = new Map();
  for (const e of roadsOf(g)) for (let a = 0; a < ROAD.n; a++) for (let b = 0; b < ROAD.n; b++) map.set(key2(e.i0 + a, e.k0 + b), e.j);
  g._roadC = { ver: ROAD_VER, t: g.time, n: g.machines.items.size, map }; return map;
}
export const onRoad = (g, x, z) => roadIndex(g).has(key2(toI(x), toK(z)));   // flat: a truck on a plate drives 1.4x as fast (a column holds one plate)

// ---------------------------------------------------------------- the router
// An A* over floor cells for a vehicle that needs a clear w x h window. Roads cost 0.7 of a cell, a step up or down needs three level cells before it (slope 1 in 3),
// and cells near the start and goal are judged by a smaller window (a yard is not always roomy). Returns { ok, pts: [[x, z], ...], len, tun } or { ok: false, why, at, by }.
const HEAP = { push(h, n) { h.push(n); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p].f <= h[i].f) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }, pop(h) { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l].f < h[m].f) m = l; if (r < h.length && h[r].f < h[m].f) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top; } };
const NODE_CAP = 90000;
export function planRoute(g, from, to, veh = TRUCK, opts = {}) {
  const w = g.world, memo = new Map(), roads = roadIndex(g);
  const W = veh.w, H = veh.h, hw = W >> 1;
  const i0 = toI(from.x), k0 = toK(from.z), i1 = toI(to.x), k1 = toK(to.z);
  const hint0 = from.j !== undefined ? from.j : Math.round((from.y || 0) / C), hint1 = to.j !== undefined ? to.j : Math.round((to.y || 0) / C);
  const j0 = floorRow(g, memo, i0, k0, hint0 + 1, 1), jg = floorRow(g, memo, i1, k1, hint1 + 1, 1);
  if (j0 === null || jg === null) return { ok: false, nofloor: true, why: 'No floor at the start or the end of the route', at: { x: j0 === null ? from.x : to.x, z: j0 === null ? from.z : to.z } };
  const near = (i, k) => (Math.abs(i - i0) <= 3 && Math.abs(k - k0) <= 3) || (Math.abs(i - i1) <= 3 && Math.abs(k - k1) <= 3);
  const sup = supportIndex(g);   // a frame cube is not made of cells, so its clear opening is checked here: a support whose opening is smaller than the window blocks it
  const ok = (i, j, k) => (near(i, k) ? windowClear(g, memo, i, j, k, 3, 3) : windowClear(g, memo, i, j, k, W, H) && !narrowAt(sup, veh, i, j, k));
  const hCell = (roads.size ? 0.7 : 1) * 1.15;   // a cell costs 1 and only a road plate costs 0.7: with no road laid the search must not behave as if one were (it explored a 240 m square to cross 250 m of open floor)
  const heur = (i, k) => { const dx = Math.abs(i - i1), dz = Math.abs(k - k1); return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) * hCell; };
  const stateKey = (i, j, k, run) => (((k * 16384 + i) * 128 + j) * 4 + run);
  const open = [], best = new Map(), prev = new Map();
  const s0 = { i: i0, j: j0, k: k0, run: 3, g: 0, f: heur(i0, k0) };
  HEAP.push(open, s0); best.set(stateKey(i0, j0, k0, 3), 0);
  let goal = null, n = 0;
  const straight = opts.straight !== false;
  if (straight && Math.abs(j0 - jg) <= 1) {   // a clear straight run needs no search
    let clear = true; const dx = i1 - i0, dz = k1 - k0, steps = Math.max(Math.abs(dx), Math.abs(dz), 1);
    for (let t = 0; t <= steps && clear; t++) { const i = Math.round(i0 + (dx * t) / steps), k = Math.round(k0 + (dz * t) / steps); if (!hasFloor(g, i, j0, k) || !ok(i, j0, k)) clear = false; }
    if (clear && j0 === jg) return { ok: true, pts: [[from.x, from.z], [to.x, to.z]], len: Math.hypot(to.x - from.x, to.z - from.z), tun: false, nodes: 0 };
  }
  while (open.length && n < NODE_CAP) {
    const c = HEAP.pop(open); const ck = stateKey(c.i, c.j, c.k, c.run);
    if (best.get(ck) !== c.g) continue;
    n++;
    if (Math.abs(c.i - i1) <= 1 && Math.abs(c.k - k1) <= 1 && Math.abs(c.j - jg) <= 1) { goal = c; break; }
    for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) {
      if (!di && !dk) continue;
      const ni = c.i + di, nk = c.k + dk; if (ni < 4 || nk < 4 || ni > NX - 5 || nk > NZ - 5) continue;
      const diag = di && dk;
      if (diag && (!ok(c.i + di, c.j, c.k) && !ok(c.i + di, c.j + 1, c.k) && !ok(c.i + di, c.j - 1, c.k))) continue;
      if (diag && (!ok(c.i, c.j, c.k + dk) && !ok(c.i, c.j + 1, c.k + dk) && !ok(c.i, c.j - 1, c.k + dk))) continue;
      for (const dj of [0, 1, -1]) {
        if (dj && c.run < 3) continue;
        const nj = c.j + dj; if (nj < 0 || nj > 70 || !hasFloor(g, ni, nj, nk) || !ok(ni, nj, nk)) continue;
        const run = dj ? 0 : Math.min(3, c.run + 1), rd = roads.get(key2(ni, nk)) === nj;
        const gc = c.g + (diag ? 1.414 : 1) * (rd ? 0.7 : 1) + (dj ? 1.5 : 0);
        const sk = stateKey(ni, nj, nk, run), old = best.get(sk);
        if (old !== undefined && old <= gc) continue;
        best.set(sk, gc); prev.set(sk, ck); const node = { i: ni, j: nj, k: nk, run, g: gc, f: gc + heur(ni, nk) }; HEAP.push(open, node);
      }
    }
  }
  if (!goal) return opts.noBlocker ? { ok: false, nodes: n } : { ok: false, ...blockerOf(g, memo, from, to, veh), nodes: n };
  // rebuild the path of cells, then keep the corners: every waypoint a straight, clear run away from the last
  let curKey = stateKey(goal.i, goal.j, goal.k, goal.run);
  const path = [{ i: goal.i, j: goal.j, k: goal.k }];
  while (prev.has(curKey)) { curKey = prev.get(curKey); const kk = curKey; const run = kk % 4; let r = (kk - run) / 4; const j = r % 128; r = (r - j) / 128; const i = r % 16384, k = (r - i) / 16384; path.push({ i, j, k }); }
  path.reverse();
  const pts = [[from.x, from.z]]; let anchor = 0;
  const los = (a, b) => {   // is the straight line between two path cells clear and level enough to drive?
    const A0 = path[a], B0 = path[b]; if (Math.abs(A0.j - B0.j) > 0) { for (let q = a; q <= b; q++) if (path[q].j !== A0.j) return false; }
    const dx = B0.i - A0.i, dz = B0.k - A0.k, steps = Math.max(Math.abs(dx), Math.abs(dz), 1);
    for (let t = 0; t <= steps; t++) { const i = Math.round(A0.i + (dx * t) / steps), k = Math.round(A0.k + (dz * t) / steps); if (!hasFloor(g, i, A0.j, k) || !ok(i, A0.j, k)) return false; }
    return true;
  };
  for (let q = 1; q < path.length; q++) {
    if (q === path.length - 1 || !los(anchor, q + 1)) { if (q !== anchor) { const p = path[q]; pts.push([cellX(p.i), cellZ(p.k)]); anchor = q; } }
  }
  if (pts.length === 1 || Math.hypot(pts[pts.length - 1][0] - to.x, pts[pts.length - 1][1] - to.z) > 0.01) pts.push([to.x, to.z]);
  let len = 0; for (let q = 1; q < pts.length; q++) len += Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]);
  const tun = path.some((p) => w.solid(p.i, p.j + H + 1, p.k) || w.solid(p.i, p.j + H + 2, p.k) || w.solid(p.i, p.j + H + 3, p.k));
  return { ok: true, pts, len, tun, nodes: n };
}

// why there is no route: look for one with a vehicle that fits anywhere (1 wide, 2 high), then find the first place along it where the real vehicle does not fit
function blockerOf(g, memo, from, to, veh) {
  const small = { w: 1, h: 2, name: 'a person' };
  const probe = planRoute(g, from, to, small, { straight: false, noBlocker: true });
  const at = (x, z) => ({ x: +x.toFixed(1), z: +z.toFixed(1) });
  if (!probe.ok) return { why: 'There is no way through: the pile blocks every route', at: at(from.x, from.z), by: 'pile' };
  const idxMap = supportIndex(g), cells = [];
  for (let q = 1; q < probe.pts.length; q++) {
    const [ax, az] = probe.pts[q - 1], [bx, bz] = probe.pts[q], steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / C));
    for (let t = 0; t <= steps; t++) cells.push([ax + ((bx - ax) * t) / steps, az + ((bz - az) * t) / steps]);
  }
  let j = Math.round((from.y || 0) / C);
  for (const [x, z] of cells) {
    const i = toI(x), k = toK(z), fj = floorRow(g, memo, i, k, j + 1, 1); if (fj === null) continue; j = fj;
    const s = narrowAt(idxMap, veh, i, j, k);
    if (s) return { why: `route blocked by ${supportName(s.ent)} at (${x.toFixed(0)}, ${z.toFixed(0)}): too narrow (${s.cw} x ${s.ch} cells clear, ${veh.name} needs ${veh.w} x ${veh.h})`, at: at(x, z), by: supportName(s.ent) };
    // the walls themselves: how wide and how high is the opening here?
    let cw = 0; for (const W of [1, 3, 5, 7, 9, 11]) { if (windowClear(g, memo, i, j, k, W, 1)) cw = W; else break; }
    let ch = 0; for (let b = 1; b <= 8; b++) { if (colClear(g, memo, i, j, k, b)) ch = b; else break; }
    if (cw < veh.w || ch < veh.h) return { why: `route blocked by the tunnel at (${x.toFixed(0)}, ${z.toFixed(0)}): too narrow (${cw} x ${ch} cells open, ${veh.name} needs ${veh.w} x ${veh.h})`, at: at(x, z), by: 'tunnel' };
  }
  return { why: 'No route found for a vehicle that size', at: at(from.x, from.z), by: 'unknown' };
}

// does a place lie inside a tunnel (a roof within a few cells over it)? Only those routes are searched: a truck in the open bay drives its straight route as it always did
export function enclosed(g, x, z, row) {
  const i = toI(x), k = toK(z), w = g.world;
  for (let b = 3; b <= 9; b++) if (w.solid(i, row + b, k)) return true;
  return false;
}

// ---------------------------------------------------------------- road plates: plan, build, mesh
const _m4 = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
function addBox(list, sx, sy, sz, x, y, z) { const gm = new THREE.BoxGeometry(sx, sy, sz); _p.set(x, y, z); _m4.compose(_p, _q, _s); gm.applyMatrix4(_m4); list.push(gm); }
let MATS = null;
const mats = () => MATS || (MATS = {
  asphalt: new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.95, metalness: 0.02 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xe8b82a, roughness: 0.6, metalness: 0.1 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x8c9096, roughness: 0.92, metalness: 0.05 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x77879a, roughness: 0.35, metalness: 0.9 }),
  glowG: new THREE.MeshBasicMaterial({ color: 0x45ff7a }), glowO: new THREE.MeshBasicMaterial({ color: 0xffb02a }), off: new THREE.MeshBasicMaterial({ color: 0x333333 }),
});
export function roadMesh(opts = {}) {
  const W = ROAD.n * C - 0.04, group = new THREE.Group(), list = [], yl = [];
  addBox(list, W, 0.04, W, 0, 0.02, 0);
  addBox(yl, 0.07, 0.045, W - 0.1, -W / 2 + 0.12, 0.024, 0); addBox(yl, 0.07, 0.045, W - 0.1, W / 2 - 0.12, 0.024, 0);
  for (let q = 0; q < 3; q++) addBox(yl, 0.05, 0.046, 0.36, 0, 0.025, -0.8 + q * 0.8);
  if (opts.ghost !== undefined) { const gm = mergeGeometries([...list, ...yl]); group.add(new THREE.Mesh(gm, new THREE.MeshBasicMaterial({ color: opts.ghost, transparent: true, opacity: 0.45, depthWrite: false }))); return group; }
  group.add(new THREE.Mesh(mergeGeometries(list), mats().asphalt)); group.add(new THREE.Mesh(mergeGeometries(yl), mats().yellow));
  return group;
}
const roadEnt = (i0, k0, j) => ({ i0, k0, j });
export function roadWhy(g, i0, k0, j) {
  if (![i0, k0, j].every(Number.isInteger)) return 'Bad plate';
  const w = g.world; let floor = 0;
  for (let a = 0; a < ROAD.n; a++) for (let b = 0; b < ROAD.n; b++) {
    const i = i0 + a, k = k0 + b; if (!w.inside(i, j, k)) return 'Outside the hall';
    if (w.solid(i, j, k)) return 'Dig this floor clear first: plush stands on it';
    if (hasFloor(g, i, j, k)) floor++;
  }
  if (floor < 12) return 'The plate needs solid floor under it';
  for (const r of roadsOf(g)) if (r.j === j && Math.abs(r.i0 - i0) < ROAD.n && Math.abs(r.k0 - k0) < ROAD.n) return r.i0 === i0 && r.k0 === k0 ? 'A road plate is already here' : 'This plate would overlap another one';
  return null;
}
export function roadPlan(g, tool, eye, dir) {
  const w = g.world, M = g.machines, no = (why, ent) => ({ plan: { ok: false, why, ent }, cost: 0 });
  const r = M.rayEmpty(eye, dir, 7); if (!r) return no('Aim at the floor');
  let { i, j, k } = r.last, guard = 0;
  while (j > 0 && !w.solid(i, j - 1, k) && guard++ < 8) j--;
  if (j > 0 && !w.solid(i, j - 1, k)) return no('No floor here');
  let i0 = i - 1, k0 = k - 1, best = null, bd = 6.5 * C;
  for (const o of roadsOf(g)) {   // edge to edge with a plate that is already there
    if (o.j !== j || Math.abs(o.i0 - i) > 10 || Math.abs(o.k0 - k) > 10) continue;
    for (const [da, db] of [[ROAD.n, 0], [-ROAD.n, 0], [0, ROAD.n], [0, -ROAD.n]]) {
      const ci = o.i0 + da, ck = o.k0 + db, d = Math.hypot(cellX(ci + 1.5) - cellX(i), cellZ(ck + 1.5) - cellZ(k));
      if (d < bd && !roadWhy(g, ci, ck, j)) { bd = d; best = [ci, ck]; }
    }
  }
  if (best) { i0 = best[0]; k0 = best[1]; }
  const why = roadWhy(g, i0, k0, j), ent = roadEnt(i0, k0, j);
  return { plan: { ok: !why, why, ent, hintText: `<kbd>B</kbd> lay a road plate (hold B and walk to lay a road) · trucks drive ${ROAD.speed}x as fast on it and the router prefers it · <kbd>X</kbd> takes one up · <kbd>Q</kbd> stow` }, cost: 0 };
}
// the host's re-check of a guest's plate: the item decides what it is (a belt cannot be spent as a road plate) and the upgrade must be owned
export function roadConflict(g, e, tool) {
  if (tool && tool.id !== 'road') return 'That item does not make a road plate';
  if (!(g.T && g.T.haulRoad)) return 'Haul Roads are not unlocked';
  return e && typeof e === 'object' ? roadWhy(g, e.i0, e.k0, e.j) : 'Nothing to place';
}
export function roadBuild(g, tool, e) { if (!e || roadWhy(g, e.i0, e.k0, e.j)) return null; return { type: 'road', ...roadEnt(e.i0, e.k0, e.j) }; }
export function roadPreview(g, tool, pl) {
  const M = g.machines, e = pl && pl.ent; if (!e || !Number.isFinite(e.i0)) { M.showPreview(null, null); return; }
  const key = `road${pl.ok}`; if (!M.ghost || M.ghostKey !== key) M.setGhost(roadMesh({ ghost: pl.ok ? 0x9dffc4 : 0xff8a7a }), key);
  M.ghost.position.set(cellX(e.i0) + 1.5 * C, e.j * C, cellZ(e.k0) + 1.5 * C); M.ghost.rotation.y = 0;
}
export function roadAdd(machines, ent) {
  if (![ent.i0, ent.k0, ent.j].every(Number.isInteger)) return { obj: new THREE.Group() };
  ROAD_VER++; const m = roadMesh(); m.position.set(cellX(ent.i0) + 1.5 * C, ent.j * C, cellZ(ent.k0) + 1.5 * C); return { obj: m };
}
export const roadRemove = () => { ROAD_VER++; };
export function roadInfo(g, ent) {
  const near = trucksOn(g, ent); return { title: 'HAUL ROAD PLATE', lit: true, lines: [`A 2.4 m plate painted on the floor. Haul Trucks drive ${ROAD.speed} times as fast on it and the router prefers roads to open ground (a road costs 70% of a cell).`, near ? `${near} Haul Truck${near > 1 ? 's' : ''} on it right now.` : 'Lay plates edge to edge: hold B and walk. A road does not block belts, rail or frames; X takes a plate up.'] };
}
const trucksOn = (g, ent) => { let n = 0; for (const it of g.machines.items.values()) { const t = it.ent; if (t.type === 'truck' && t.px !== undefined && toI(t.px) >= ent.i0 && toI(t.px) < ent.i0 + ROAD.n && toK(t.pz) >= ent.k0 && toK(t.pz) < ent.k0 + ROAD.n) n++; } return n; };

// flat things (road plates, docks) have no centre point on purpose, so the aim loops skip them: they are found by the ray reaching their slab
export function pickFlat(g, eye, dir, maxT = 3.6) {
  let best = null, bt = maxT;
  for (const it of g.machines.items.values()) {
    const e = it.ent; let b;
    if (e.type === 'road') b = { i0: e.i0, i1: e.i0 + ROAD.n - 1, k0: e.k0, k1: e.k0 + ROAD.n - 1 };
    else if (e.type === 'dock' && e.ax) b = dockBox(e);
    else continue;
    const y = e.j * C + 0.05; if (Math.abs(dir.y) < 1e-6) continue;
    const t = (y - eye.y) / dir.y; if (t < 0.1 || t > bt) continue;
    const x = eye.x + dir.x * t, z = eye.z + dir.z * t, i = toI(x), k = toK(z);
    if (i >= b.i0 && i <= b.i1 && k >= b.k0 && k <= b.k1) { bt = t; best = it; }
  }
  return best ? { ent: best.ent, t: bt } : null;
}

// ---------------------------------------------------------------- docks
export const UNLOAD_PATIENCE = 60;
export const DOCK = { long: 6, wide: 4, kw: 25, standby: 0.1, price: 220000, charge: 25 };
export const dockBox = (e) => (e.ax === 'x' ? { i0: e.i0, i1: e.i0 + DOCK.long - 1, k0: e.k0, k1: e.k0 + DOCK.wide - 1 } : { i0: e.i0, i1: e.i0 + DOCK.wide - 1, k0: e.k0, k1: e.k0 + DOCK.long - 1 });
export const docksOf = (g) => { const out = []; for (const it of g.machines.items.values()) if (it.ent.type === 'dock') out.push(it.ent); return out; };
export const dockCentre = (e) => { const b = dockBox(e); return { x: (cellX(b.i0) + cellX(b.i1)) / 2, z: (cellZ(b.k0) + cellZ(b.k1)) / 2 }; };
export function dockWhy(g, ax, i0, k0, j, skipId) {
  if ((ax !== 'x' && ax !== 'z') || ![i0, k0, j].every(Number.isInteger)) return 'Bad dock';
  const w = g.world, e = { ax, i0, k0, j }, b = dockBox(e); let floor = 0, n = 0;
  for (let i = b.i0; i <= b.i1; i++) for (let k = b.k0; k <= b.k1; k++) {
    if (!w.inside(i, j, k)) return 'Outside the hall';
    for (let q = 0; q < 4; q++) { if (w.solid(i, j + q, k)) n++; else if (g.logi.cellTaken(i, j + q, k)) return 'Something is in the way: a belt or a machine stands on the pad'; }
    if (hasFloor(g, i, j, k)) floor++;
  }
  if (n) return `Dig the pad clear first: ${n} plush in the way (4 cells of headroom)`;
  if (floor < Math.ceil(DOCK.long * DOCK.wide * 0.8)) return 'The dock needs solid floor under it';
  for (const o of docksOf(g)) { if (o.id === skipId) continue; const c = dockBox(o); if (o.j === j && b.i0 <= c.i1 && c.i0 <= b.i1 && b.k0 <= c.k1 && c.k0 <= b.k1) return 'Another dock is already here'; }
  return null;
}
export function dockPlan(g, tool, eye, dir, yaw) {
  const w = g.world, M = g.machines, no = (why, ent) => ({ plan: { ok: false, why, ent }, cost: 0 });
  const r = M.rayEmpty(eye, dir, 7); if (!r) return no('Aim at the floor');
  let { i, j, k } = r.last, guard = 0;
  while (j > 0 && !w.solid(i, j - 1, k) && guard++ < 8) j--;
  if (j > 0 && !w.solid(i, j - 1, k)) return no('No floor here');
  const ax = Math.abs(Math.sin(yaw)) > Math.abs(Math.cos(yaw)) ? 'x' : 'z';
  const i0 = ax === 'x' ? i - 2 : i - 1, k0 = ax === 'x' ? k - 1 : k - 2;
  const why = dockWhy(g, ax, i0, k0, j), ent = { ax, i0, k0, j };
  return { plan: { ok: !why, why, ent, hintText: '<kbd>B</kbd> set the dock down (it points the way you look): park a truck in it to charge and unload · put a belt at one end and trucks unload onto it · <kbd>Q</kbd> stow' }, cost: 0 };
}
export function dockConflict(g, e, tool) {
  if (tool && tool.id !== 'dock') return 'That item does not make a truck dock';
  if (!(g.T && g.T.truckDock)) return 'Truck Docks are not unlocked';
  return e && typeof e === 'object' ? dockWhy(g, e.ax, e.i0, e.k0, e.j) : 'Nothing to place';
}
export function dockBuild(g, tool, e) { if (!e || dockWhy(g, e.ax, e.i0, e.k0, e.j)) return null; return { type: 'dock', ax: e.ax, i0: e.i0, k0: e.k0, j: e.j }; }
const STATE = new WeakMap();
const st = (e) => { let s = STATE.get(e); if (!s) { s = { rig: null, t: 0 }; STATE.set(e, s); } return s; };
export function dockMesh(opts = {}) {
  const L = DOCK.long * C - 0.04, Wd = DOCK.wide * C - 0.04, group = new THREE.Group(), conc = [], yl = [], steel = [];
  addBox(conc, Wd, 0.1, L, 0, 0.05, 0);
  for (let q = 0; q < 5; q++) addBox(yl, Wd - 0.5, 0.012, 0.14, 0, 0.106, -L / 2 + 0.4 + q * 0.7);
  for (const sx of [-1, 1]) addBox(yl, 0.09, 0.012, L - 0.1, sx * (Wd / 2 - 0.1), 0.106, 0);
  addBox(steel, 0.18, 1.1, 0.18, Wd / 2 - 0.15, 0.65, -L / 2 + 0.35); addBox(steel, 0.34, 0.28, 0.22, Wd / 2 - 0.15, 1.28, -L / 2 + 0.35);
  if (opts.ghost !== undefined) { group.add(new THREE.Mesh(mergeGeometries([...conc, ...yl, ...steel]), new THREE.MeshBasicMaterial({ color: opts.ghost, transparent: true, opacity: 0.42, depthWrite: false }))); return { group }; }
  group.add(new THREE.Mesh(mergeGeometries(conc), mats().concrete), new THREE.Mesh(mergeGeometries(yl), mats().yellow), new THREE.Mesh(mergeGeometries(steel), mats().steel));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mats().off); lamp.position.set(Wd / 2 - 0.15, 1.5, -L / 2 + 0.35); group.add(lamp);
  return { group, lamp };
}
export function dockPreview(g, tool, pl) {
  const M = g.machines, e = pl && pl.ent; if (!e || !Number.isFinite(e.i0)) { M.showPreview(null, null); return; }
  const key = `dock${e.ax}${pl.ok}`; if (!M.ghost || M.ghostKey !== key) M.setGhost(dockMesh({ ghost: pl.ok ? 0x9dffc4 : 0xff8a7a }).group, key);
  const c = dockCentre(e); M.ghost.position.set(c.x, e.j * C, c.z); M.ghost.rotation.y = e.ax === 'x' ? Math.PI / 2 : 0;
}
export function dockAdd(machines, ent) {
  if (ent.ax !== 'x' && ent.ax !== 'z') ent.ax = 'z';
  if (![ent.i0, ent.k0, ent.j].every(Number.isInteger)) return { obj: new THREE.Group() };
  const rig = dockMesh(), c = dockCentre(ent); rig.group.position.set(c.x, ent.j * C, c.z); rig.group.rotation.y = ent.ax === 'x' ? Math.PI / 2 : 0;
  st(ent).rig = rig; ent.ch = 0;
  return { obj: rig.group, dock: rig };
}
export const dockPos = (g, e) => { const c = dockCentre(e); return [c.x, e.j * C + 1.0, c.z]; };
export const dockKw = (e) => (e.ch ? DOCK.kw : DOCK.standby);
// where a truck would be parked: the centre of the pad
export const inDock = (e, x, z) => { const b = dockBox(e); const i = toI(x), k = toK(z); return i >= b.i0 && i <= b.i1 && k >= b.k0 && k <= b.k1; };
// a belt (or sorter, vault) just past a short end of the pad, not pointing into it: where the dock unloads
export function outTile(g, e) {
  const b = dockBox(e), out = [];
  const ends = e.ax === 'x' ? [[b.i0 - 1, 0, 0], [b.i1 + 1, 0, 2]] : [[0, b.k0 - 1, 1], [0, b.k1 + 1, 3]];   // the third number: the belt direction that points into the pad from that end (0 east, 1 south, 2 west, 3 north)
  for (const [ei, ek, into] of ends) for (let l = 1; l <= 2; l++) {
    const i = e.ax === 'x' ? ei : b.i0 + l, k = e.ax === 'x' ? b.k0 + l : ek;
    for (const dj of [0, 1, -1]) { const t = g.logi.tiles.get(idx(i, e.j + dj, k)); if (t && ((t.type === 'belt' && t.dir !== into) || t.type === 'sorter' || t.type === 'vault')) out.push({ tile: t, end: ei + ek }); }   // a belt that runs into the pad is not an outlet: the load would pile up at a dead end
  }
  return out.length ? out[0].tile : null;
}
export const isSink = (g, e) => { const t = outTile(g, e); return !!t; };
// feed what a truck carries onto the belt at the belt's speed; returns true when the bed is empty
export function unloadTo(g, e, truck, dt) {
  const t = outTile(g, e); if (!t) return 'gone';
  const rate = (g.T && g.T.beltSpeed ? g.T.beltSpeed : 1.6) / 0.34, tierMul = [1, 1.5, 2.25, 3.4, 5, 7.5][t.tier || 0] || 1;
  truck.ubank = (truck.ubank || 0) + dt * rate * tierMul; let moved = 0;
  while (truck.ubank >= 1 && truck.cargo.length) {
    let q = 0; while (q < truck.cargo.length && truck.cargo[q] === NEEDLE) q += 2;   // The One never goes on a belt
    if (q >= truck.cargo.length) return 'one';
    if (!g.logi.accept(t, { sp: truck.cargo[q], vr: truck.cargo[q + 1] }, null)) { truck.ubank = Math.min(truck.ubank, 1); break; }
    truck.cargo.splice(q, 2); truck.ubank--; moved++;
  }
  truck.cn = truck.cargo.length / 2;
  if (moved) { g.S.stats.dockUnloaded = (g.S.stats.dockUnloaded || 0) + moved; truck.uwait = 0; } else if (truck.cargo.length) { truck.uwait = (truck.uwait || 0) + dt; if (truck.uwait > UNLOAD_PATIENCE) { truck.uwait = 0; return 'gone'; } }   // a belt that stays backed up for a minute: the rest is sold like any haul, so the truck never waits for ever
  return truck.cargo.length === 0;
}
export function dockInfo(g, e) {
  const t = outTile(g, e), lines = [];
  const busy = e.ch ? 'A truck is charging.' : 'No truck is parked in it.';
  lines.push(busy, t ? `A belt at the end takes what trucks unload (${t.type}). Trucks with a load pick this dock as their sink when it is nearer than the bin.` : 'No belt at either end: trucks only charge here. Set a belt (or a sorter or vault) at a short end, pointing away, and trucks unload onto it.');
  lines.push(`${(e.ch ? DOCK.kw : DOCK.standby)} kW now (${DOCK.kw} kW while charging, ${DOCK.standby} kW standing by). A truck charges at ${DOCK.charge} kW while it is parked here.`, (e.pw ?? 0) > 0.05 ? `Powered ${Math.round((e.pw ?? 0) * 100)}%` : 'No power: link it to a pole or a generator. Trucks still park here, they just do not charge.');
  return { title: 'TRUCK DOCK', lit: (e.pw ?? 0) > 0.05, lines };
}

// ---------------------------------------------------------------- the truck battery (earth.js keeps one number on the truck: e.batt in kJ)
export const BATT = { base: 120000, drive: 40, charge: 25, low: 0.15, pack: 0.3 };
export const battCap = (T) => { const lv = Math.max(0, [400, 800, 1600, 3200, 6400].indexOf(T.truckRange)); return Math.round(BATT.base * (1 + 0.5 * lv)); };   // Dispatch Radio adds a charge pack: +50% per level
export const battPct = (T, e) => Math.max(0, Math.min(1, (e.batt ?? battCap(T)) / battCap(T)));
// can the truck make a trip of this many metres there and back, with a tenth to spare?
export const tripNeed = (T, metres) => 1.1 * (2 * metres / Math.max(0.1, T.truckSpeed || 7)) * BATT.drive;

// the dock stand: host, once a frame for every dock: charge the trucks parked in it
export function dockTick(g, dt) {
  for (const it of g.machines.items.values()) {
    const e = it.ent; if (e.type !== 'dock') continue;
    let any = false; const T = g.T, cap = battCap(T);
    if ((e.pw ?? 0) > 0.05) for (const o of g.machines.items.values()) {
      const t = o.ent; if (t.type !== 'truck' || t.px === undefined || !inDock(e, t.px, t.pz)) continue;
      if (['go', 'back'].includes(t.state)) continue;
      const b = t.batt ?? cap; if (b < cap) { t.batt = Math.min(cap, b + BATT.charge * (e.pw ?? 0) * dt); any = true; }
    }
    const ch = any ? 1 : 0; if (ch !== e.ch) { e.ch = ch; g.power.markDirty(); }
    const rig = st(e).rig; if (rig && rig.lamp) rig.lamp.material = (e.pw ?? 0) > 0.05 ? (e.ch ? mats().glowO : mats().glowG) : mats().off;
  }
}
export function dockGuestTick(g) {
  for (const it of g.machines.items.values()) { const e = it.ent; if (e.type !== 'dock') continue; const rig = st(e).rig; if (rig && rig.lamp) rig.lamp.material = (e.pw ?? 0) > 0.05 ? (e.ch ? mats().glowO : mats().glowG) : mats().off; }
}
const ROWS = { last: '', t: 0 };
export function dockRow(g) {
  const out = {}; let any = false; for (const e of docksOf(g)) { out[e.id] = [e.ch ? 1 : 0, Math.round((e.pw ?? 0) * 100)]; any = true; }
  if (!any) { ROWS.last = ''; return null; }
  const s = JSON.stringify(out); if (s === ROWS.last && g.time - ROWS.t < 5) return null; ROWS.last = s; ROWS.t = g.time; return out;
}
export function dockGuestRow(g, d) {
  if (!d || typeof d !== 'object' || (g.net && g.net.open && g.net.role === 'host')) return;
  for (const e of docksOf(g)) { const a = d[e.id]; if (Array.isArray(a) && a.length >= 2 && a.every((v) => Number.isFinite(v))) { e.ch = a[0] === 1 ? 1 : 0; e.pw = a[1] / 100; } }
}

// ---------------------------------------------------------------- bench rows
export function recipes(g) {
  const T = g.T || {}, out = [];
  if (T.haulRoad) out.push({ id: 'road', kind: 'road', icon: '🛣️', name: 'Haul Road Plate', short: 'Road', price: Math.round(ROAD.price / K_BENCH), batch: [1, 10, 50], desc: 'A 2.4 m square plate of road painted on the floor. Haul Trucks drive 1.4 times as fast on a road and the router prefers it to open ground. Plates snap edge to edge.', use: 'Aim at the floor and press B, hold B and walk to lay a road. X takes a plate up. Roads do not block anything: belts, rail and frames can stand on them.', statusFn: () => `${roadsOf(g).length} plates laid.` });
  if (T.truckDock) {
    const n = docksOf(g).length;
    out.push({ id: 'dock', kind: 'dock', icon: '⚡', name: 'Truck Dock', short: 'Dock', price: DOCK.price / K_BENCH, batch: [1, 1, 1], desc: 'A 4 x 6 cell pad for Haul Trucks. A truck parked in it charges its battery from the grid (25 kW). A belt, sorter or vault set at one end makes it a place trucks unload, so a mine can feed a remote line instead of the bin.', use: 'Set it down with B (it points the way you look), near a pole or generator. A belt at a short end, pointing away from the pad, is where it unloads. Trucks use it by themselves.', statusFn: () => `${n} placed. Suggested: one per two trucks.` });
    out.push({ id: 'chargepack', kind: 'supply', icon: '🔋', name: 'Charge Pack', short: 'Pack', price: 1000, batch: [1, 5, 10], desc: 'Restores 30% of a dead Haul Truck\'s battery. Aim at the truck and press E with one in your pack.', use: 'Automatic: press E on a Haul Truck that ran out of battery and it takes one.' });
  }
  return out;
}

// ---------------------------------------------------------------- what earth.js asks (it keeps the truck rules, this file keeps the road rules)
export const dockById = (g, id) => { const it = g.machines.items.get(id); return it && it.ent.type === 'dock' ? it.ent : null; };
// the vias a truck needs between two spots: none in the open (it drives its straight line as it always did), a searched route when either end is inside a tunnel
export function jobRoute(g, from, to) {
  const rf = from.j ?? Math.round((from.y || 0) / C), rt = to.j ?? Math.round((to.y || 0) / C);
  if (!enclosed(g, to.x, to.z, rt) && !enclosed(g, from.x, from.z, rf)) return { ok: true, vias: [], tun: false };
  const r = planRoute(g, { ...from, j: rf }, { ...to, j: rt }, TRUCK);
  if (r.nofloor) return { ok: true, vias: [], tun: false };   // an end that is not standing on a floor (a hopper set inside the pile, an old save): the truck drives its straight route as it always did
  if (!r.ok && r.by === 'pile') return { ok: true, vias: [], tun: false };   // no way in for anything, not even a person: no tunnel leads there at all, so the truck drives its straight route over the top of the pile as it always did
  if (!r.ok) return { ok: false, why: r.why, at: r.at, by: r.by };
  return { ok: true, vias: r.pts.slice(1, -1).map((p) => [p[0], p[1], 'via']), tun: true, len: r.len };
}
