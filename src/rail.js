// Mine Rail (the tunnel shuttle). A track of one cell pieces laid along a tunnel floor, Rail Stations at the base and the work face, and Rail Carts
// that carry you (and a plush load) between them. Everything is an entity in game.machines.items:
//   rail     { i, j, k }                       one cell of track on a floor (no x y z: the hammer and the readout find it with pickRail below)
//   railstn  { i, j, k, x, y, z, role, name }   a station on a track cell. role 'base' sells the carts' loads at the bin, 'face' is the work end. Powers the line.
//   railcar  { x, y, z, yaw, pitch, a, cargo, riders, st, spd, ... }   the cart. The host simulates it, a guest sees it through ent+ and the 0.1 s / 0.5 s xrow rows.
// Track is an undirected graph: two pieces join when they touch on a side at the same level, or one cell up or down (a 45 degree slope). So turns, junctions
// and slopes need no orientation; a cart finds its way with a breadth first search to wherever it was sent.
// Power: a station is a 3 kW consumer of the power grid (only through its own Power Cable to a live pole or generator); its power satisfaction sets the whole line's speed (8 m/s at full power, slower in a brownout), an unpowered line is hand cranked at 2 m/s.
import * as THREE from 'three';
import { C, cellX, cellZ, toI, toJ, toK, idx, NX, NZ, NY } from './config.js';
import { NEEDLE, SPECIAL_MIN, species } from './plushdata.js';
import * as BINS from './bins.js';   // the bin a line unloads at

export const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
export const POWER_SPEED = 8;        // m/s on a powered line
export const HAND_SPEED = 2;         // m/s on an unpowered line (the hand crank)
export const CAR_CAP = 120;          // plush one cart carries
export const SEATS = 2;
export const MAX_PIECES = 10000;     // pieces of track in one world
export const STATION_KW = 3;         // what a station draws from the grid (power.js counts it, a cable can wire it)
export const PRICE = { rail: 150, railstn: 400000, railcar: 900000 };   // bench prices before the K = 3 multiplier
export const UNLOCK_PRICE = 7000000;
export const ACC = 5, DEC = 6;       // m/s^2
export const BOARD_R = 4.5;          // how near you must be to climb in
export const CALL_R = 40;            // how far from a piece of track the rush key still calls a cart
export const HEADWAY = 1.5 * C;      // m between the centres of two carts on one track (1.5 cells): a cart stops this far behind the one ahead
export const BIN_R = 7;              // a cart this near the bin sells its load
export const HOP_SPEED = 3;          // above this a cart brakes to the next piece before you can hop off
const FLOOR = 0.04, SLOPE_LEN = Math.hypot(C, C), VIEW_R = 72;
const KEY = 'Backspace';

const state = (g) => g._rail || (g._rail = {
  sig: '', ver: 0, nodes: new Map(), adj: new Map(), stnAt: new Map(), comp: new Map(), comps: [], stns: [], cars: [],
  t: 0, powerT: 0, rowT: 0, rowNow: false, view: null, viewKey: '', hud: null, prevE: false, prevSp: false, lastPos: null, clack: 0, powerSig: '',
});
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const r3 = (v) => Math.round(v * 1000) / 1000;
const kbd = (s) => `<kbd>${s}</kbd>`;
const plain = (s) => String(s).replace(/<[^>]*>/g, '');
export const keyOf = (e) => idx(e.i, e.j, e.k);
const posOf = (e) => [cellX(e.i), e.j * C + FLOOR, cellZ(e.k)];
const inside = (i, j, k) => i >= 0 && i < NX && k >= 0 && k < NZ && j >= 0 && j < NY;
export const localWho = (g) => (g.isGuest() ? 'guest' : 'host');
export function nameOf(e) { return e.type === 'rail' ? 'Mine Rail' : e.type === 'railstn' ? 'Rail Station' : e.type === 'railcar' ? 'Rail Cart' : null; }
export const isRailType = (t) => t === 'rail' || t === 'railstn' || t === 'railcar';

// ---------------------------------------------------------------------------------------------------------- the graph
// Rebuilt whenever the set of rail pieces, stations or carts changes (a cheap signature over machines.items, computed on every call, so no hook can be missed).
export function sync(g, force = false) {
  const R = state(g);
  let n = 0, h = 0;
  for (const it of g.machines.items.values()) {
    const e = it.ent, t = e.type;
    if (t === 'rail' || t === 'railstn' || t === 'railcar') { n++; h = (h + Math.imul(e.id | 0, 0x9e3779b1) + t.length) | 0; }
  }
  const sig = n + ':' + h;
  if (!force && sig === R.sig) return R;
  rebuild(g, R); R.sig = sig;
  return R;
}
export const invalidate = (g) => { if (g._rail) g._rail.sig = ''; };

function rebuild(g, R) {
  R.ver++; R.nodes = new Map(); R.adj = new Map(); R.stnAt = new Map(); R.comp = new Map(); R.comps = []; R.stns = []; R.cars = [];
  for (const it of g.machines.items.values()) {
    const e = it.ent;
    if (e.type === 'rail') R.nodes.set(keyOf(e), e);
    else if (e.type === 'railstn') R.stns.push(e);
    else if (e.type === 'railcar') R.cars.push(e);
  }
  for (const [key, e] of R.nodes) {
    const out = [];
    for (let m = 0; m < 4; m++) {
      const ni = e.i + DX[m], nk = e.k + DZ[m];
      for (const dj of [0, 1, -1]) {
        if (!inside(ni, e.j + dj, nk)) continue;
        const k2 = idx(ni, e.j + dj, nk);
        if (R.nodes.has(k2)) out.push(k2, dj ? SLOPE_LEN : C);
      }
    }
    R.adj.set(key, out);
  }
  let id = 0;
  for (const key of R.nodes.keys()) {
    if (R.comp.has(key)) continue;
    const comp = { id, n: 0, stns: [], cars: 0, pw: 0, powered: false, speed: HAND_SPEED, fallback: null };
    R.comps.push(comp); R.comp.set(key, id);
    const q = [key];
    for (let h = 0; h < q.length; h++) { comp.n++; const a = R.adj.get(q[h]); for (let n = 0; n < a.length; n += 2) { if (!R.comp.has(a[n])) { R.comp.set(a[n], id); q.push(a[n]); } } }
    id++;
  }
  for (const s of R.stns) { const k = keyOf(s); if (R.nodes.has(k)) { R.stnAt.set(k, s); R.comps[R.comp.get(k)].stns.push(s); } }
  for (const c of R.cars) { const cid = R.comp.get(c.a); if (cid !== undefined) R.comps[cid].cars++; }
  refreshLines(R);
}

// the speed of each line from the best powered station on it
function refreshLines(R) {
  let sig = '';
  for (const comp of R.comps) {
    let pw = 0; for (const s of comp.stns) pw = Math.max(pw, s.pw || 0);
    comp.pw = pw; comp.powered = pw > 0.05; comp.speed = comp.powered ? Math.max(HAND_SPEED, POWER_SPEED * Math.min(1, pw)) : HAND_SPEED;
    sig += comp.powered ? '1' : '0';
  }
  R.powerSig = sig;
}
export const compOf = (R, key) => { const id = R.comp.get(key); return id === undefined ? null : R.comps[id]; };
export function lineSpeed(g, key) { const c = compOf(sync(g), key); return c ? c.speed : HAND_SPEED; }

// is the cell column of a piece free for a standing person (the cell of the piece and two above it)?
export function clearAt(g, e) {
  const w = g.world, lg = g.logi;
  for (let q = 0; q < 3; q++) {   // plush or a wall, and also a belt, pole, vault or lift shaft set down on the track later (the belt rules do not know about rail)
    if (w.solid(e.i, e.j + q, e.k)) return false;
    const key = idx(e.i, e.j + q, e.k); if (lg && (lg.tiles.has(key) || lg.cols.has(key))) return false;
  }
  return true;
}

function edgeLen(R, a, b) { const l = R.adj.get(a) || []; for (let n = 0; n < l.length; n += 2) if (l[n] === b) return l[n + 1]; return C; }

// breadth first search from `from` to the nearest node where goal(key) holds (the start itself never counts). Returns { goal, path } (path excludes the start) or null.
export function bfs(g, R, from, goal, check = true, avoid = null) {
  if (!R.nodes.has(from)) return null;
  const prev = new Map([[from, -1]]), q = [from];
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    if (k !== from && goal(k)) { const path = []; for (let c = k; c !== from; c = prev.get(c)) path.push(c); path.reverse(); return { goal: k, path }; }
    const a = R.adj.get(k);
    for (let n = 0; n < a.length; n += 2) { const nk = a[n]; if (prev.has(nk) || (avoid && avoid.has(nk))) continue; if (check && !clearAt(g, R.nodes.get(nk))) continue; prev.set(nk, k); q.push(nk); }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------- placing
export function railWhy(g, i, j, k) {
  if (![i, j, k].every(Number.isInteger) || !inside(i, j, k)) return 'Out of bounds';
  const w = g.world, key = idx(i, j, k);
  if (w.solid(i, j, k)) return 'Blocked';
  if (j > 0 && !w.solid(i, j - 1, k)) return 'Needs a floor';
  if (sync(g).nodes.has(key)) return 'Track is already here';
  if (g.logi.cellTaken(i, j, k)) return 'Something is in the way';   // a belt, a lift shaft, a pad, a door or anything else that reserved the cell (the one rule every placement shares)
  for (let q = 1; q <= 2; q++) if (g.logi.cellTaken(i, j + q, k)) return 'Something is in the way';   // and the two cells above it, where a cart rides
  if (w.solid(i, j + 1, k) || w.solid(i, j + 2, k)) return 'Needs 3 cells of headroom';
  if (sync(g).nodes.size >= MAX_PIECES) return `Track limit reached (${MAX_PIECES} pieces)`;
  return null;
}

export function planRail(g, tool, eye, dir) {
  const a = g.logi.aimCell(eye, dir);
  if (!a) return { plan: { ok: false, why: 'Aim at the floor' }, cost: 0 };
  const why = railWhy(g, a.i, a.j, a.k);
  return { plan: { ok: !why, why, ent: { type: 'rail', i: a.i, j: a.j, k: a.k }, hintText: `<kbd>B</kbd> lays a piece (hold <kbd>B</kbd> and walk to lay a line). It joins the pieces beside it, turns and climbs on its own. <kbd>Q</kbd> stow` }, cost: 0 };
}

// the rail piece under the crosshair (the readout and the hammer ask for it; the pieces have no centre point of their own)
export function pickRail(g, eye, dir, maxD = 3.6) {
  const R = sync(g); if (!R.nodes.size) return null;
  for (let t = 0.3; t < maxD; t += 0.04) {   // the ray lands on a piece when it dips to the height of its rails inside the piece's cell
    const x = eye.x + dir.x * t, y = eye.y + dir.y * t, z = eye.z + dir.z * t;
    const i = toI(x), j = toJ(y), k = toK(z);
    const e = R.nodes.get(idx(i, j, k));
    if (e) { const top = j * C + FLOOR + 0.05; if (y <= top + 0.02) return { ent: e, t }; }
    else if (g.world.solid(i, j, k)) break;
  }
  return null;
}

function planOnTrack(g, tool, eye, dir, type) {
  const hit = pickRail(g, eye, dir, 6);
  if (!hit) return { plan: { ok: false, why: 'Aim at a piece of track' }, cost: 0 };
  const e = hit.ent, R = sync(g);
  let why = null;
  if (type === 'railstn' && R.stnAt.has(keyOf(e))) why = 'There is a station here already';
  if (type === 'railcar') { for (const c of R.cars) if (Math.hypot(c.x - cellX(e.i), c.z - cellZ(e.k)) < HEADWAY - 0.01 && Math.abs(c.y - e.j * C) < 0.6) { why = 'A cart is standing here'; break; } }
  if (!why && !clearAt(g, e)) why = 'Something is blocking the track';
  const role = stationRole(g, e);
  return { plan: { ok: !why, why, ent: { type, i: e.i, j: e.j, k: e.k }, hintText: type === 'railstn' ? `<kbd>B</kbd> sets a ${role.toUpperCase()} station here (it sells at the bin when it is near it, and a Power Cable to a live pole or generator powers the line) · <kbd>Q</kbd> stow` : `<kbd>B</kbd> sets the cart on the track · <kbd>E</kbd> on it sits you in it · <kbd>Q</kbd> stow` }, cost: 0 };
}
export const planStation = (g, tool, eye, dir) => planOnTrack(g, tool, eye, dir, 'railstn');
export const planCar = (g, tool, eye, dir) => planOnTrack(g, tool, eye, dir, 'railcar');

// a cart parked within a step of a station (its E is the cart's: you aimed past the post at the cart)
export function carBeside(g, e) {
  const R = sync(g); let best = null, bd = 1.2;
  for (const c of R.cars) { const d = Math.hypot(c.x - cellX(e.i), c.z - cellZ(e.k)); if (d < bd && Math.abs(c.y - e.j * C) < 0.6) { bd = d; best = c; } }
  return best;
}

// the bin a line unloads at: the cart's own, else the first station on its line that has one (so assigning any one station assigns the line); 0 is Auto, the nearest bin
export function lineDest(g, car) {
  if (car.dest) return car.dest | 0;
  const R = sync(g), comp = compOf(R, car.cache && car.cache.edge ? car.b : car.a);
  if (comp) for (const s of [...comp.stns].sort((a, b) => a.id - b.id)) if (s.dest) return s.dest | 0;
  return 0;
}
// where a cart sells: the assigned bin when the cart is within BIN_R of it, nothing yet when the line does reach it (it waits for the right station), and Auto when the track never gets near it
function cartSink(g, car) {
  const dest = lineDest(g, car);
  if (dest) {
    const r = BINS.resolve(g, dest);
    if (r.bin) {
      const R = sync(g), comp = compOf(R, car.cache && car.cache.edge ? car.b : car.a);
      if (R._nearV !== R.ver) { R._near = new Map(); R._nearV = R.ver; }
      const key = `${comp ? comp.id : -1}:${r.bin.id}`; let near = R._near.get(key);
      if (near === undefined) { near = false; if (comp) for (const [k2, e] of R.nodes) if (R.comp.get(k2) === comp.id && Math.hypot(cellX(e.i) - r.bin.x, cellZ(e.k) - r.bin.z) < BIN_R) { near = true; break; } R._near.set(key, near); }
      if (near) return Math.hypot(car.x - r.bin.x, car.z - r.bin.z) < BIN_R ? { kind: 'sell', x: r.bin.x, y: 1.0, z: r.bin.z, bin: r.bin.id } : null;
      BINS.fallback(g, { k: 'ent', o: car }, 'unreachable', r.bin.name);
    } else BINS.fallback(g, { k: 'ent', o: car }, r.why, r.named ? r.named.name : '');
  }
  return g.nearestSink(car.x, car.y + 0.5, car.z, BIN_R);
}

export function stationRole(g, e) {
  const bp = g.hall && g.hall.binPos; if (!bp) return 'face';
  return Math.hypot(cellX(e.i) - bp.x, cellZ(e.k) - bp.z) < 45 ? 'base' : 'face';
}

// host re-check of a guest placement: the right item, whole numbers, and the same rules the host's own aim uses
export function conflict(g, e, tool) {
  if (!e || e.type !== tool.kind || tool.id !== tool.kind) return 'Wrong item';
  if (![e.i, e.j, e.k].every(Number.isInteger)) return 'Bad position';
  if (e.type === 'rail') return railWhy(g, e.i, e.j, e.k);
  const R = sync(g), n = R.nodes.get(idx(e.i, e.j, e.k)); if (!n) return 'There is no track there';
  if (e.type === 'railstn' && R.stnAt.has(keyOf(n))) return 'There is a station here already';
  if (e.type === 'railcar') for (const c of R.cars) if (Math.hypot(c.x - cellX(n.i), c.z - cellZ(n.k)) < HEADWAY - 0.01 && Math.abs(c.y - n.j * C) < 0.6) return 'A cart is standing here';
  return null;
}

export function buildFields(g, tool, e) {
  if (e.type === 'rail') return { type: 'rail', i: e.i, j: e.j, k: e.k };
  const x = cellX(e.i), y = e.j * C + FLOOR, z = cellZ(e.k);
  if (e.type === 'railstn') { const role = stationRole(g, e); return { type: 'railstn', i: e.i, j: e.j, k: e.k, x, y, z, h: 1.3, role, name: '' }; }
  return { type: 'railcar', i: e.i, j: e.j, k: e.k, x, y, z, h: 0.9, yaw: 0, pitch: 0, a: idx(e.i, e.j, e.k), name: '', n: 0, cargo: [], riders: [], st: 'idle', spd: 0 };
}

export function ghost(g, tool, plan) {
  const e = plan && plan.ent;
  if (!e) { g.machines.setGhost(null); return; }
  const key = 'rail' + plan.ok;
  if (g.machines.ghostKey !== key) {
    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: plan.ok ? 0x5dffa0 : 0xff5a4a, transparent: true, opacity: 0.45, depthWrite: false });
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.12), mat), r1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.6), mat), r2 = r1.clone();
    r1.position.x = -0.17; r2.position.x = 0.17; grp.add(tie, r1, r2);
    g.machines.setGhost(grp, key);
  }
  if (g.machines.ghost) g.machines.ghost.position.set(cellX(e.i), e.j * C + FLOOR + 0.02, cellZ(e.k));
}

// ---------------------------------------------------------------------------------------------------------- meshes
const M = {
  tie: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
  rail: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.7 }),
  body: new THREE.MeshStandardMaterial({ color: 0x8e5a2b, roughness: 0.7, metalness: 0.3 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.5, metalness: 0.8 }),
  load: new THREE.MeshStandardMaterial({ color: 0xe36fa8, roughness: 0.95 }),
  post: new THREE.MeshStandardMaterial({ color: 0x59636e, roughness: 0.5, metalness: 0.7 }),
  lampOn: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 3, 1.2) }),
  lampOff: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.12, 0.08) }),
  lampBase: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.8, 3.4) }),
  lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 3, 1.8) }),
};
const CAP_TIES = 14000, CAP_RAILS = 34000;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _c = new THREE.Color();
const TIE_COL = new THREE.Color(0.3, 0.2, 0.11), HOT = new THREE.Color(0.72, 0.86, 1), COLD = new THREE.Color(0.66, 0.5, 0.38);

function ensureView(g, R) {
  const sc = g.renderer && g.renderer.scene; if (!sc) return null;
  if (R.view && R.view.root.parent === sc) return R.view;
  if (R.view) { R.view.root.parent && R.view.root.parent.remove(R.view.root); R.view.ties.geometry.dispose(); R.view.rails.geometry.dispose(); }
  const root = new THREE.Group(); root.name = 'minerail';
  const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.035, 0.09), M.tie, CAP_TIES);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.05, 1), M.rail, CAP_RAILS);
  for (const m of [ties, rails]) { m.setColorAt(0, _c.setRGB(1, 1, 1)); m.frustumCulled = false; m.count = 0; root.add(m); }
  sc.add(root); R.viewKey = '';
  return (R.view = { root, ties, rails });
}

// one stretch of track from a to b: two rails and a tie in the middle
function segment(V, ax, ay, az, bx, by, bz, col, tie = true) {
  _d.set(bx - ax, by - ay, bz - az); const L = _d.length(); if (L < 1e-4) return;
  _d.divideScalar(L); _q.setFromUnitVectors(_z, _d);
  const hl = Math.hypot(bx - ax, bz - az), lx = hl > 1e-5 ? (bz - az) / hl : 1, lz = hl > 1e-5 ? -(bx - ax) / hl : 0;
  const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
  for (const off of [-0.17, 0.17]) {
    if (V.rails.count >= CAP_RAILS) break;
    _p.set(mx + lx * off, my + 0.02, mz + lz * off); _s.set(1, 1, L); _m.compose(_p, _q, _s);
    V.rails.setMatrixAt(V.rails.count, _m); V.rails.setColorAt(V.rails.count, col); V.rails.count++;
  }
  if (tie && V.ties.count < CAP_TIES) {
    _p.set(mx, my - 0.006, mz); _s.set(1, 1, 1); _m.compose(_p, _q, _s);
    V.ties.setMatrixAt(V.ties.count, _m); V.ties.setColorAt(V.ties.count, TIE_COL); V.ties.count++;
  }
}

function rebuildView(g, R, V, cam) {
  V.ties.count = 0; V.rails.count = 0;
  const r2 = VIEW_R * VIEW_R;
  for (const [key, e] of R.nodes) {
    const [x, y, z] = posOf(e);
    if ((x - cam.x) ** 2 + (z - cam.z) ** 2 > r2) continue;
    const comp = compOf(R, key), col = comp && comp.powered ? HOT : COLD, a = R.adj.get(key);
    let first = null, nEdges = 0;
    for (let n = 0; n < a.length; n += 2) {
      const o = R.nodes.get(a[n]), [ox, oy, oz] = posOf(o);
      if (!first) first = [ox - x, oy - y, oz - z];
      nEdges++;
      if (key < a[n]) segment(V, x, y, z, ox, oy, oz, col);
    }
    if (nEdges === 0) segment(V, x - C / 2, y, z, x + C / 2, y, z, col);       // a single piece: a short straight with a tie
    else if (nEdges === 1) { const l = Math.hypot(first[0], first[2]) || 1; segment(V, x, y, z, x - first[0] / l * C / 2, y, z - first[2] / l * C / 2, col, false); }   // the open end: a stub of rail
  }
  V.ties.instanceMatrix.needsUpdate = true; V.rails.instanceMatrix.needsUpdate = true;
  if (V.ties.instanceColor) V.ties.instanceColor.needsUpdate = true; if (V.rails.instanceColor) V.rails.instanceColor.needsUpdate = true;
}

function carMesh() {
  const g = new THREE.Group();
  const box = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
  box(0.56, 0.04, 0.8, 0, 0.15, 0, M.trim);   // 0.8 m long: two carts one headway (0.9 m) apart never touch
  box(0.04, 0.22, 0.8, -0.28, 0.27, 0, M.body); box(0.04, 0.22, 0.8, 0.28, 0.27, 0, M.body);
  box(0.56, 0.22, 0.04, 0, 0.27, 0.4, M.body); box(0.56, 0.22, 0.04, 0, 0.27, -0.4, M.body);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12), M.trim); w.rotation.z = Math.PI / 2; w.position.set(sx * 0.3, 0.1, sz * 0.25); w.name = 'wheel'; g.add(w); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.lamp); lamp.position.set(0, 0.34, 0.42); g.add(lamp);
  const load = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.7), M.load); load.position.set(0, 0.26, 0); load.name = 'load'; load.scale.y = 0.001; g.add(load);
  return g;
}

function labelTex(text, base) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = base ? '#1b4a66' : '#6a4a12'; x.fillRect(0, 0, 256, 96); x.strokeStyle = '#e9f3f8'; x.lineWidth = 6; x.strokeRect(5, 5, 246, 86);
  x.fillStyle = '#f4fbff'; x.font = 'bold 40px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(text).slice(0, 12).toUpperCase(), 128, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function stationMesh(e) {
  const g = new THREE.Group();
  const base = e.role !== 'face';
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), M.post); post.position.set(0.32, 0.6, 0.32); g.add(post);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.22), M.post); plate.position.set(0.32, 0.015, 0.32); g.add(plate);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), (e.pw || 0) > 0.05 ? (base ? M.lampBase : M.lampOn) : M.lampOff); lamp.position.set(0.32, 1.27, 0.32); lamp.name = 'lamp'; g.add(lamp);
  const tex = labelTex(e.name || (base ? 'BASE' : 'FACE'), base), mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  for (const ry of [0, Math.PI / 2]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.23), mat); s.position.set(0.32, 1.0, 0.32); s.rotation.y = ry; g.add(s); }
  g.userData.base = base;
  return g;
}
export function rebuildStationObj(g, e) {
  const it = g.machines.items.get(e.id); if (!it) return;
  g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj);
  it.obj = stationMesh(e); it.obj.position.set(e.x, e.y, e.z); g.machines.root.add(it.obj);
}

// ---------------------------------------------------------------------------------------------------------- handlers for machines.add
export function addRail(m, e) { const g = m.game; if (!e.view) g.world.reserved.add(keyOf(e)); invalidate(g); return {}; }
export function addStation(m, e) { const g = m.game; if (!e.x) { e.x = cellX(e.i); e.y = e.j * C + FLOOR; e.z = cellZ(e.k); } const obj = stationMesh(e); obj.position.set(e.x, e.y, e.z); invalidate(g); return { obj }; }
export function addCar(m, e) {
  const g = m.game;
  e.riders = Array.isArray(e.riders) ? e.riders : []; e.cargo = Array.isArray(e.cargo) ? e.cargo : []; e.cache = {};
  if (!e.view) { e.riders = []; e.st = 'idle'; e.spd = 0; e.path = []; e.dst = null; e.call = null; }   // a loaded save: nobody rides, nothing is under way
  e.n = e.cargo.length || e.n || 0;
  const obj = carMesh(); obj.position.set(e.x, e.y, e.z); obj.rotation.order = 'YXZ'; obj.rotation.y = e.yaw || 0;
  invalidate(g);
  return { obj };
}
export function onRemoveRail(g, e) { g.world.reserved.delete(keyOf(e)); invalidate(g); }
export function onRemoveCar(g, e) {
  for (const who of [...(e.riders || [])]) { e.riders = e.riders.filter((x) => x !== who); }
  const cargo = e.cargo || [];
  for (const it of cargo) { if (g.S.carry.length < g.T.carry) g.S.carry.push({ sp: it.sp, vr: it.vr }); else g.sim.spawn(it.sp, it.vr, e.x, e.y + 0.6, e.z, 0, 1, 0, 0); }
  e.cargo = []; if (cargo.length) g.ui.setCarry(g.S.carry, g.T.carry);
  invalidate(g);
}

// ---------------------------------------------------------------------------------------------------------- power
// A station is a 3 kW consumer of the grid solver (power.js, DEMAND railstn): its .pw is the satisfaction of the grid its cable runs to, so a brownout slows the
// line. A station with no cable, or one the solver has not seen yet, has no power.
export function stationPower(g, e) {
  return e.pw !== undefined ? e.pw : 0;
}

// ---------------------------------------------------------------------------------------------------------- people
export function whoPos(g, who) {
  if (who === 'host') return g.player.pos;
  const r = g.remote; return r && g.net.open && r.pos && r.pos.y > -40 ? r.pos : null;
}
export function say(g, who, text) {
  if (who === 'guest' && !g.isGuest()) { g.netSend({ t: 'toast', icon: '🚃', title: 'Mine Rail', text: plain(text) }); return; }
  g.ui.hint(text, 4);
}
const carById = (g, id) => { const it = g.machines.items.get(id); return it && it.ent.type === 'railcar' ? it.ent : null; };
export function seatedCar(g, who = localWho(g)) { const R = sync(g); for (const c of R.cars) if (c.riders && c.riders.includes(who)) return c; return null; }
const seatsFree = (c) => (c.riders || []).length < SEATS;
const distTo = (c, p) => Math.hypot(c.x - p.x, c.z - p.z) + Math.abs((c.y + 0.5) - (p.y + 1)) * 0.5;

export function seat(g, car, who) {
  car.riders = car.riders || [];
  if (car.riders.includes(who)) return true;
  if (car.riders.length >= SEATS || car.st === 'derailed') return false;
  const R = sync(g);
  for (const c of R.cars) if (c !== car && c.riders && c.riders.includes(who)) unseat(g, c, who);
  car.riders.push(who); R.rowNow = true;
  if (who === 'host') { R.lastPos = null; R.prevE = !!g.keys.KeyE; R.prevSp = !!g.keys.Space; }   // the key press that seated you must not also hop you off
  return true;
}
export function unseat(g, car, who) {
  if (!car.riders || !car.riders.includes(who)) return false;
  car.riders = car.riders.filter((x) => x !== who); state(g).rowNow = true;
  if (who === 'host') { const p = g.player; p.vel.set(0, 0, 0); state(g).lastPos = null; }
  return true;
}

// hop off: at once when the cart is slow, otherwise it brakes over the stopping distance (v squared over twice the braking) and you step off where it halts
export function hop(g, car, who) {
  const c = car.cache || (car.cache = {});
  if (car.st === 'run' && (car.spd || 0) > HOP_SPEED && car.path && car.path.length) {
    const R = sync(g), need = (car.spd * car.spd) / (2 * DEC) + 0.3;
    let acc = c.edge ? (1 - car.u) * c.edge.len : 0, prev = c.edge ? car.b : car.a, keep = c.edge ? 1 : 0;
    while (acc < need && keep < car.path.length) { acc += edgeLen(R, prev, car.path[keep]); prev = car.path[keep]; keep++; }
    car.path.length = Math.max(1, keep); c.rem = c.edge || keep ? acc : edgeLen(R, car.a, car.path[0]);
    car.leave = [...new Set([...(car.leave || []), who])];
    say(g, who, 'Braking: you can step off when the cart stops.');
    return false;
  }
  return unseat(g, car, who);
}

// ---------------------------------------------------------------------------------------------------------- sending carts
export function dispatch(g, car, goal) {
  const R = sync(g), c = car.cache || (car.cache = {}), fn = typeof goal === 'function' ? goal : (k) => k === goal;
  if (!c.init) initCar(g, R, car);   // a cart sent on its very first frame: set it on its piece before it has a way to go
  if (car.st === 'derailed') return { ok: false, why: 'This cart is off the rails' };
  const start = c.edge ? car.b : car.a;
  if (!R.nodes.has(start)) return { ok: false, why: 'The cart is not on a track' };
  if (fn(start)) {
    if (!c.edge) { car.path = []; car.st = 'idle'; car.dst = null; return { ok: true, here: true, len: 0 }; }
    car.path = [car.b]; car.dst = car.b; c.rem = (1 - car.u) * c.edge.len; car.st = 'run'; car.why = ''; return { ok: true, len: c.rem, goal: car.b };
  }
  const r = bfs(g, R, start, fn, true, occupied(R, car)) || bfs(g, R, start, fn);   // a way round the other carts if there is one
  if (!r) return { ok: false, why: 'No clear track leads there' };
  let rem = 0, pk = start; for (const k of r.path) { rem += edgeLen(R, pk, k); pk = k; }
  if (c.edge) { rem += (1 - car.u) * c.edge.len; car.path = [car.b, ...r.path]; } else car.path = r.path;
  car.dst = r.goal; c.rem = rem; car.st = 'run'; car.why = ''; c.stuck = 0;
  const here = R.stnAt.get(car.a); if (!c.edge && here && here.role === 'face') car.face = car.a;
  return { ok: true, len: rem, goal: r.goal };
}

function fallbackBase(g, R, comp) {
  if (comp.fallback !== null && R.nodes.has(comp.fallback)) return comp.fallback;
  const bp = g.hall && g.hall.binPos; let best = null, bd = Infinity;
  for (const [key, e] of R.nodes) { if (R.comp.get(key) !== comp.id) continue; const d = bp ? Math.hypot(cellX(e.i) - bp.x, cellZ(e.k) - bp.z) : 0; if (d < bd) { bd = d; best = key; } }
  return (comp.fallback = best);
}
// a base station if the line has one; with no base station anywhere, the piece of the line nearest to the bin. Null when the base is on another (cut off) line.
export function baseFn(g, R, comp) {
  if (comp.stns.some((s) => s.role === 'base')) return (k) => { const s = R.stnAt.get(k); return !!(s && s.role === 'base'); };
  if (R.stns.some((s) => s.role === 'base' && R.nodes.has(keyOf(s)))) return null;
  const fb = fallbackBase(g, R, comp); return (k) => k === fb;
}
export function isBaseNode(g, R, key) { const comp = compOf(R, key); const fn = comp && baseFn(g, R, comp); return !!fn && fn(key); }

const speedText = (R, key) => { const c = compOf(R, key); return c && c.powered ? `${c.speed.toFixed(0)} m/s, powered` : `${HAND_SPEED} m/s, hand cranked`; };

export function goHome(g, car, who) {
  const R = sync(g), comp = compOf(R, car.cache && car.cache.edge ? car.b : car.a);
  if (!comp) { say(g, who, 'This cart is not on a track.'); return false; }
  const fn = baseFn(g, R, comp);
  if (!fn) { say(g, who, 'The track to the base is cut. Mend it, then press again.'); return false; }
  const r = dispatch(g, car, fn);
  if (!r.ok) { say(g, who, r.why + '.'); return false; }
  if (r.here) { say(g, who, 'You are already at the base end.'); return true; }
  say(g, who, `Rushing home: ${Math.round(r.len)} m at ${speedText(R, car.a)}. ${kbd('E')} or ${kbd('Space')} hops off at the end.`);
  return true;
}
export function goFace(g, car, who) {
  const R = sync(g), comp = compOf(R, car.a); if (!comp) return false;
  const here = car.a;
  let fn = null;
  if (car.face != null && car.face !== here && R.stnAt.has(car.face)) { const f = car.face; fn = (k) => k === f; }
  else if (comp.stns.some((s) => s.role === 'face' && keyOf(s) !== here)) fn = (k) => { const s = R.stnAt.get(k); return !!(s && s.role === 'face' && k !== here); };
  else {   // no face station: the piece of the line farthest from the bin
    const bp = g.hall && g.hall.binPos; let far = null, fd = -1;
    for (const [key, e] of R.nodes) { if (R.comp.get(key) !== comp.id) continue; const d = bp ? Math.hypot(cellX(e.i) - bp.x, cellZ(e.k) - bp.z) : 0; if (d > fd) { fd = d; far = key; } }
    if (far === here) { say(g, who, 'This is the far end of the line already.'); return true; }
    fn = (k) => k === far;
  }
  const r = dispatch(g, car, fn);
  if (!r.ok) { say(g, who, r.why + '.'); return false; }
  say(g, who, `Back to the face: ${Math.round(r.len)} m at ${speedText(R, car.a)}.`);
  return true;
}

function nearestNode(R, p) {
  let best = null, bd = CALL_R;
  for (const [key, e] of R.nodes) { const d = Math.hypot(cellX(e.i) - p.x, cellZ(e.k) - p.z); if (d < bd && Math.abs(e.j * C - p.y) < 8) { bd = d; best = key; } }
  return best === null ? null : { key: best, d: bd };
}

// the rush key (host side, for either player): sit in a cart that is beside you and go, or call the nearest cart along the track
export function rush(g, who) {
  const R = sync(g);
  let car = seatedCar(g, who);
  if (!car) {
    const p = whoPos(g, who); if (!p) return false;
    let near = null, nd = BOARD_R;
    for (const c of R.cars) { if (c.st === 'derailed' || !seatsFree(c) || (c.spd || 0) > 1.5) continue; const d = distTo(c, p); if (d < nd) { nd = d; near = c; } }   // never into a cart that is moving (the E key refuses it too)
    if (near) { if (!seat(g, near, who)) return false; car = near; }
    else return callCart(g, who, p);
  }
  if (car.st === 'derailed') { say(g, who, `This cart is off the rails. ${kbd('E')} sets it back on the nearest track.`); return false; }
  if (car.st === 'run' && car.dst != null && isBaseNode(g, R, car.dst)) { say(g, who, 'Already rushing you home.'); return true; }
  if (car.st !== 'run' && isBaseNode(g, R, car.a)) return goFace(g, car, who);
  return goHome(g, car, who);
}

function callCart(g, who, p) {
  const R = sync(g);
  const nn = nearestNode(R, p);
  if (!nn) { say(g, who, `No track within ${CALL_R} m. Lay Mine Rail to the work face first.`); return false; }
  const comp = compOf(R, nn.key);
  const at = new Map();
  for (const c of R.cars) { if (c.st === 'derailed' || (c.riders || []).length) continue; const k = c.cache && c.cache.edge ? c.b : c.a; if (R.comp.get(k) === comp.id) at.set(k, c); }
  if (!at.size) { say(g, who, 'There is no free cart on this track. Set a Rail Cart on it first.'); return false; }
  let car = at.get(nn.key), hit = null;
  if (!car) { hit = bfs(g, R, nn.key, (k) => at.has(k)); if (!hit) { say(g, who, 'No clear track leads to a cart.'); return false; } car = at.get(hit.goal); }
  const r = dispatch(g, car, nn.key);
  if (!r.ok) { say(g, who, r.why + '.'); return false; }
  car.call = who; car.home = true; (car.cache || (car.cache = {})).callT = 60;
  say(g, who, r.here || r.len < 1 ? 'A cart is waiting right here.' : `Cart called: ${Math.round(r.len)} m away at ${speedText(R, car.a)}. It takes you home when it arrives.`);
  return true;
}

export function rushKey(g) {
  if (g.isGuest()) { g.cmd('rail', { act: 'rush' }); return; }
  rush(g, 'host');
}

// ---------------------------------------------------------------------------------------------------------- using a cart
export function loadItems(g, car, items, who) {
  const room = Math.max(0, CAR_CAP - car.cargo.length), taken = [], back = [];
  for (const it of items) { if (!it || it.sp === NEEDLE || taken.length >= room) back.push(it); else taken.push({ sp: it.sp, vr: it.vr }); }
  for (const it of taken) car.cargo.push(it);
  car.n = car.cargo.length;
  return { taken: taken.length, back };
}

// a guest gets off: asks the host, and steps off at once only when the cart is slow. A fast cart brakes first (the host says so), so the guest stays seated and is not
// left standing on the track for the moment before the next row would seat it again.
function guestLeave(g, car) {
  g.cmd('rail', { act: 'leave' });
  if (car.st === 'run' && (car.spd || 0) > HOP_SPEED) return false;
  (car.cache || (car.cache = {})).leftAt = g.time; car.riders = car.riders.filter((x) => x !== 'guest'); g.ui.hint('You hopped off.', 2);
  return true;
}

export function useCar(g, car, who) {
  if (g.isGuest()) {
    const S = g.S;
    if (car.riders && car.riders.includes('guest')) { guestLeave(g, car); return true; }
    if (S.carry.length && car.n < CAR_CAP) {
      const items = []; for (let n = S.carry.length - 1; n >= 0 && items.length < CAR_CAP - car.n; n--) { if (S.carry[n].sp !== NEEDLE) { items.push(S.carry[n]); S.carry.splice(n, 1); } }
      if (items.length) { g.ui.setCarry(S.carry, g.T.carry); g.cmd('rail', { act: 'load', id: car.id, items: items.map((a) => [a.sp, a.vr]) }); g.ui.hint(`Loaded ${items.length} plush into the cart.`, 2.5); return true; }
    }
    g.cmd('rail', { act: 'sit', id: car.id }); return true;
  }
  if (car.riders && car.riders.includes(who)) { hop(g, car, who); if (!car.riders.includes(who)) say(g, who, 'You hopped off.'); return true; }
  return useCarHost(g, car, who);
}

function useCarHost(g, car, who) {
  const p = whoPos(g, who);
  if (car.st === 'derailed') {
    if (who === 'guest' && (!p || distTo(car, p) > BOARD_R + 3)) { say(g, who, 'Move closer to the cart.'); return true; }
    const R = sync(g); let best = null, bd = 1.6;
    for (const e of R.nodes.values()) { const [x, y, z] = posOf(e); const d = Math.hypot(x - car.x, z - car.z) + Math.abs(y - car.y); if (d < bd && clearAt(g, e)) { bd = d; best = e; } }
    if (!best) { say(g, who, 'There is no track within reach. Hammer the cart to pick it up.'); return true; }
    car.a = keyOf(best); car.cache = {}; car.st = 'idle'; car.spd = 0; car.path = []; car.b = null; car.u = 0;
    say(g, who, 'The cart is back on the track.'); return true;
  }
  if (who === 'host' && g.S.carry.length && car.n < CAR_CAP) {
    const items = g.S.carry.filter((it) => it.sp !== NEEDLE);
    if (items.length) {
      const r = loadItems(g, car, items.slice(-(CAR_CAP - car.n)), who);
      const gone = new Set(); let left = r.taken; for (let n = g.S.carry.length - 1; n >= 0 && left > 0; n--) if (g.S.carry[n].sp !== NEEDLE) { gone.add(n); left--; }
      g.S.carry = g.S.carry.filter((_, n) => !gone.has(n)); g.ui.setCarry(g.S.carry, g.T.carry);
      g.sound.place(); say(g, who, `Loaded ${r.taken} plush into the cart (${car.n} of ${CAR_CAP}). They ride to the base bin and sell there. ${kbd('E')} again sits you in it.`);
      return true;
    }
  }
  if (!p || distTo(car, p) > BOARD_R) { say(g, who, 'Move closer to the cart.'); return true; }
  if ((car.spd || 0) > 1.5) { say(g, who, 'The cart is moving too fast to climb in.'); return true; }
  if (!seat(g, car, who)) { say(g, who, 'The cart is full.'); return true; }
  const R = sync(g);
  say(g, who, `Seated. ${kbd(KEY)} rushes you ${isBaseNode(g, R, car.a) ? 'back to the face' : 'home'}. ${kbd('E')} or ${kbd('Space')} hops off.`);
  return true;
}

// a guest's command, run on the host as the guest
export function runCmd(g, d) {
  if (!d || typeof d !== 'object' || g.isGuest()) return;
  const who = 'guest';
  if (d.act === 'rush') { rush(g, who); return; }
  if (d.act === 'leave') { const c = seatedCar(g, who); if (c) hop(g, c, who); return; }
  const car = carById(g, d.id); if (!car) return;
  const p = whoPos(g, who);
  if (d.act === 'sit') { if (car.riders.includes(who)) return; useCarHost(g, car, who); return; }
  if (d.act === 'load') {
    if (!Array.isArray(d.items) || d.items.length > 400) return;
    const items = d.items.filter((a) => Array.isArray(a) && Number.isInteger(a[0]) && (a[0] === NEEDLE || (a[0] >= 1 && a[0] < SPECIAL_MIN && !!species[a[0]])) && Number.isInteger(a[1]) && a[1] >= 0 && a[1] < 65536).map((a) => ({ sp: a[0], vr: a[1] }));   // a real species and variant only: a forged id would throw in the sale
    if (!p || distTo(car, p) > BOARD_R + 3) { g.netSend({ t: 'give', items }); return; }
    const r = loadItems(g, car, items, who);
    if (r.back.length) g.netSend({ t: 'give', items: r.back });
  }
}

// ---------------------------------------------------------------------------------------------------------- simulating a cart (host)
const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));

function putCar(g, R, car) {
  const c = car.cache;
  if (c.edge) {
    const e = c.edge, u = car.u, dx = e.bx - e.ax, dz = e.bz - e.az;
    car.x = e.ax + dx * u; car.y = e.ay + (e.by - e.ay) * u; car.z = e.az + dz * u;
    car.yaw = Math.atan2(dx, dz); car.pitch = Math.atan2(e.by - e.ay, Math.hypot(dx, dz));
  } else {
    const N = R.nodes.get(car.a);
    if (N) { const [x, y, z] = posOf(N); car.x = x; car.y = y; car.z = z; car.pitch = 0; }
  }
}

function initCar(g, R, car) {
  const c = car.cache; c.init = true; c.edge = null; c.rem = 0;
  car.b = null; car.u = 0; car.path = car.path || [];
  const N = R.nodes.get(car.a);
  if (!N) { car.st = 'derailed'; return; }
  const a = R.adj.get(car.a);
  if (a.length) { const o = R.nodes.get(a[0]); car.yaw = Math.atan2(cellX(o.i) - cellX(N.i), cellZ(o.k) - cellZ(N.k)); }
  putCar(g, R, car);
}

function derail(g, car, why) {
  car.st = 'derailed'; car.spd = 0; car.path = []; car.dst = null; car.why = why; car.call = null; car.leave = null;
  const c = car.cache; c.rem = 0;
  for (const who of [...(car.riders || [])]) { unseat(g, car, who); say(g, who, `${why} The cart is off the rails and you got off.`); }
}
function halt(g, car, why) {
  const c = car.cache; car.st = 'blocked'; car.spd = 0; car.path = []; car.dst = null; car.why = why; c.rem = 0; c.edge = null;
  car.call = null; car.leave = null; state(g).rowNow = true;
  for (const who of car.riders || []) say(g, who, `${why} The cart stopped. ${kbd(KEY)} tries the way home, ${kbd('E')} hops off.`);
}

function arrive(g, R, car) {
  const c = car.cache; car.st = 'idle'; car.spd = 0; car.path = []; car.dst = null; c.rem = 0; car.b = null; car.u = 0; c.edge = null; R.rowNow = true; c.jwait = 0;
  if (isWaitMsg(car.why)) car.why = '';
  const stn = R.stnAt.get(car.a);
  if (stn && stn.role === 'face') car.face = car.a;
  for (const who of car.leave || []) unseat(g, car, who);
  car.leave = null;
  const label = stn ? (stn.name || stn.role.toUpperCase()) : 'the end of the line';
  for (const who of car.riders || []) say(g, who, `Arrived at ${label}. ${kbd('E')} or ${kbd('Space')} hops off, ${kbd(KEY)} sends the cart ${isBaseNode(g, R, car.a) ? 'back to the face' : 'home'}.`);
}

// ---------------------------------------------------------------------------------------------------------- following distance and right of way
// Carts never overlap. A cart looks along the track it is about to drive: another cart on that stretch (standing, slower or coming the other way) makes it brake so it halts
// HEADWAY (1.5 cells) behind it, and it goes on by itself when the way clears. At a junction (three or more pieces meet) the cart nearest to the junction takes it (ties by
// cart id) and carts coming from another side wait one headway before it; carts that came the same way simply follow each other. A stand off that lasts WAIT_MAX seconds at a
// junction stops yielding (the headway rule still keeps carts apart), so a cycle of waiting carts cannot hold the line forever.
const WAIT_CART = 'Waiting for the cart ahead.', WAIT_JUNCTION = 'Waiting for a cart to clear the junction.', WAIT_MAX = 8;
const isWaitMsg = (s) => s === WAIT_CART || s === WAIT_JUNCTION;
const isJunction = (R, key) => (R.adj.get(key) || []).length >= 6;
const zoneOf = (car) => ((car.spd || 0) * (car.spd || 0)) / (2 * DEC) + HEADWAY + 3 * C;

// where the nodes of the cart's way lie, in metres from the cart: the node it just left (negative), the one it is heading to, and so on up to `max` metres
function wayOf(R, car, max) {
  const c = car.cache, map = new Map(), seq = [], path = car.path || [];
  let d, prev, n;
  if (c.edge) { map.set(car.a, -car.u * c.edge.len); d = (1 - car.u) * c.edge.len; prev = car.b; map.set(prev, d); seq.push([prev, d]); n = 1; }
  else { map.set(car.a, 0); d = 0; prev = car.a; seq.push([prev, 0]); n = 0; }
  for (; n < path.length && d < max; n++) { d += edgeLen(R, prev, path[n]); prev = path[n]; if (!map.has(prev)) { map.set(prev, d); seq.push([prev, d]); } }
  return { map, seq };
}

// the other cart on this way: { loc (m ahead of the cart's centre), vl (its speed along the same way, 0 when it stands or comes against us) } or null
function cartOnWay(way, o) {
  const oc = o.cache || {};
  if (oc.edge && o.b != null) {
    const da = way.map.get(o.a), db = way.map.get(o.b), len = oc.edge.len;
    if (da !== undefined && db !== undefined) return { loc: da + (db - da) * o.u, vl: db > da && o.st === 'run' ? o.spd || 0 : 0 };
    if (da !== undefined && o.u * len < HEADWAY) return { loc: da, vl: 0 };
    if (db !== undefined && (1 - o.u) * len < HEADWAY) return { loc: db, vl: 0 };
    return null;
  }
  const d = way.map.get(o.a); return d === undefined ? null : { loc: d, vl: 0 };
}

// who holds which junction, from where the carts are now. Runs once per simulation step before the carts move.
function updateClaims(g, R) {
  const cl = R.claims || (R.claims = new Map()), byId = new Map(R.cars.map((c) => [c.id, c]));
  for (const [key, h] of [...cl]) {
    const car = byId.get(h.id), N = R.nodes.get(key);
    let keep = false;
    if (car && N && car.st !== 'derailed') {
      const [x, , z] = posOf(N); keep = Math.hypot(car.x - x, car.z - z) < HEADWAY + 0.05;
      if (!keep && car.st === 'run' && car.cache && car.cache.init) { const w = wayOf(R, car, zoneOf(car)); const hit = w.map.get(key); keep = hit !== undefined && hit >= 0 && hit <= zoneOf(car); }
    }
    if (!keep) cl.delete(key);
  }
  const want = new Map();   // junction key -> { car, d, from }
  for (const car of [...R.cars].sort((a, b) => a.id - b.id)) {
    if (car.st !== 'run' || !car.cache || !car.cache.init || !car.path || !car.path.length) continue;
    const zone = zoneOf(car), w = wayOf(R, car, zone);
    for (let n = 0; n < w.seq.length; n++) {
      const [key, d] = w.seq[n]; if (d > zone || d < -0.001 || !isJunction(R, key) || cl.has(key)) continue;
      const cur = want.get(key); if (!cur || d < cur.d - 1e-6) want.set(key, { car, d, from: n > 0 ? w.seq[n - 1][0] : car.cache.edge ? car.a : null });
    }
  }
  for (const [key, h] of want) cl.set(key, { id: h.car.id, from: h.from });
}

// the limit the carts around put on this one: { free (m it may still move), vt (the speed it may keep), why, still (the blocker stands), loc } or null when the way is clear
function followLimit(g, R, car, dt) {
  const c = car.cache, zone = Math.max(zoneOf(car), HEADWAY + 2.4), way = wayOf(R, car, zone + 2);
  let best = null;
  // (a cart on the very same spot, an old save, is not ahead: one of the two goes first and the other follows)
  const take = (loc, vl, why, still, id = 0) => { if (loc < 1e-4 || loc > zone + HEADWAY) return; if (!best || loc < best.loc) best = { loc, vl, why, still, id }; };
  for (const o of R.cars) {
    if (o === car || o.st === 'derailed' || !o.cache || !o.cache.init && !R.nodes.has(o.a)) continue;
    const r = cartOnWay(way, o); if (r) take(r.loc, r.vl, WAIT_CART, o.st !== 'run' && !(o.cache && o.cache.edge), o.id);
  }
  if (R.claims && !(c.jwait > WAIT_MAX)) {
    for (let n = 0; n < way.seq.length; n++) {
      const [key, d] = way.seq[n]; if (d > zone || !isJunction(R, key)) continue;
      const h = R.claims.get(key); if (!h || h.id === car.id) continue;
      const from = n > 0 ? way.seq[n - 1][0] : c.edge ? car.a : null;
      if (from !== null && h.from === from) continue;   // it came the same way: it is a cart ahead, not a cross traffic
      take(d, 0, WAIT_JUNCTION, false);
    }
  }
  if (!best) return null;
  const free = best.loc - HEADWAY;
  const margin = (car.spd || 0) * dt;
  return { free, vt: Math.sqrt(best.vl * best.vl + 2 * DEC * Math.max(0, free - margin)), why: best.why, still: best.still, loc: best.loc, id: best.id };
}

// A ring of carts that each wait for the next one, or two carts nose to nose on one track, would wait for ever. When the carts that hold each other up have all stood still for
// WAIT_MAX seconds, the one with the highest id gives way: it takes another way round (backing out if it has to), or, with no other way, it stops where it is and says so.
function standoffYielder(R, car) {
  const byId = new Map(R.cars.map((o) => [o.id, o])), ids = [car.id];
  let cur = car;
  for (let n = 0; n <= R.cars.length; n++) {
    const b = byId.get(cur.cache && cur.cache.blk);
    if (!b || b.st !== 'run' || (b.spd || 0) > 0.05) return false;
    if (b === car) return ids.every((id) => id <= car.id);
    ids.push(b.id); cur = b;
  }
  return false;
}
// stops a cart where it stands (on a piece or between two), for good until it is sent again; unlike halt it keeps the cart exactly where it is, so it never slides back into a cart behind it
function stall(g, car, why) {
  const c = car.cache; c.stl = (c.stl || 0) + 1; car.st = 'blocked'; car.spd = 0; car.path = []; car.dst = null; car.why = why; c.rem = 0; c.blk = 0; c.qwait = 0;
  car.call = null; car.leave = null; state(g).rowNow = true;
  for (const who of car.riders || []) say(g, who, `${why} The cart stopped. ${kbd(KEY)} tries the way home, ${kbd('E')} hops off.`);
}
// the nodes other carts stand on or between: a way through them is the last choice
const occupied = (R, car) => { const s = new Set(); for (const o of R.cars) if (o !== car && o.st !== 'derailed') { s.add(o.a); if (o.b != null) s.add(o.b); } return s; };
function detour(g, R, car) {
  const c = car.cache, dst = car.dst; if (dst === null || dst === undefined || !R.nodes.has(dst)) return false;
  const avoid = occupied(R, car);
  const tryFrom = (start) => { if (avoid.has(start)) return null; return bfs(g, R, start, (k) => k === dst, true, avoid); };
  const same = (r) => r && r.goal === dst;
  let r = tryFrom(c.edge ? car.b : car.a), turn = false;
  if (same(r) && c.edge && r.path[0] === car.a) r = null;   // it would drive on to the next piece only to turn round there, nearer to the cart it waits for: back out from where it stands instead
  if (!same(r) && c.edge) { r = tryFrom(car.a); turn = true; }
  if (!same(r)) return false;
  if (turn) {   // back out the way it came: swap the ends of the piece it stands on
    const e = c.edge; c.edge = { ax: e.bx, ay: e.by, az: e.bz, bx: e.ax, by: e.ay, bz: e.az, len: e.len };
    const a = car.a; car.a = car.b; car.b = a; car.u = 1 - car.u;
  }
  let rem = 0, pk = c.edge ? car.b : car.a; for (const k of r.path) { rem += edgeLen(R, pk, k); pk = k; }
  if (c.edge) { rem += (1 - car.u) * c.edge.len; car.path = [car.b, ...r.path]; } else car.path = r.path;
  c.rem = rem; car.why = ''; R.rowNow = true; c.dtr = (c.dtr || 0) + 1;
  return true;
}

function stepCar(g, R, car, dt) {
  const c = car.cache || (car.cache = {});
  if (!c.init) initCar(g, R, car);
  if (car.st === 'derailed') return;
  if (c.edge && !R.nodes.has(car.b)) {   // the piece ahead was taken away
    if (R.nodes.has(car.a)) { c.edge = null; car.u = 0; car.b = null; putCar(g, R, car); halt(g, car, 'The track ahead was cut.'); } else derail(g, car, 'The track is gone.');
    return;
  }
  if (!c.edge && !R.nodes.has(car.a)) { derail(g, car, 'The track under the cart is gone.'); return; }
  if (car.riders && car.riders.length) {   // rock came down onto the very cell the cart is in: nobody rides inside a pile (it would also hide you from the game's burial), so riders step off into normal physics
    const here = R.nodes.get(c.edge && car.u >= 0.5 ? car.b : car.a);
    if (here && !clearAt(g, here)) {
      for (const who of [...car.riders]) { unseat(g, car, who); say(g, who, 'Rock came down on the cart. You got off.'); }
      if (car.st === 'run') { if (c.edge && R.nodes.has(car.a)) { c.edge = null; car.u = 0; car.b = null; } halt(g, car, 'Rock came down on the cart.'); }
      return;
    }
  }
  if (c.edge && car.st === 'run') {   // rubble came down into the piece ahead while the cart was already on its way: back to the last piece, stopped, never into the pile
    const B = R.nodes.get(car.b);
    if (B && !clearAt(g, B) && R.nodes.has(car.a)) { c.edge = null; car.u = 0; car.b = null; putCar(g, R, car); halt(g, car, 'Something is blocking the track ahead.'); return; }
  }
  if (car.st !== 'run' || !car.path || !car.path.length) { car.spd = 0; idleWork(g, R, car, dt); return; }
  // speed: up to the line speed, braking so it stops on the last piece, and never closer than the headway to another cart (or into a junction another cart holds)
  const vmax = lineSpeed(g, c.edge ? car.b : car.a);
  let vt = Math.min(vmax, Math.sqrt(2 * DEC * Math.max(0, c.rem)) + 0.45);
  const lim = followLimit(g, R, car, dt);
  const binding = !!lim && lim.vt < vt - 0.05;   // the cart ahead (or the junction) really holds this one back
  if (lim) vt = Math.min(vt, lim.vt);
  if (binding) { if (car.why !== lim.why && (!car.why || isWaitMsg(car.why))) { car.why = lim.why; R.rowNow = true; } }
  else if (isWaitMsg(car.why)) { car.why = ''; R.rowNow = true; }
  car.spd = approach(car.spd || 0, vt, (vt > car.spd ? ACC : DEC * 1.6) * dt);
  let left = Math.min(car.spd * dt, c.rem + 1e-6);
  if (lim) {
    if (left > Math.max(0, lim.free)) { left = Math.max(0, lim.free); car.spd = Math.min(car.spd, left / dt); }   // never through the cart ahead, whatever the speed said
    const stuck = lim.why === WAIT_JUNCTION && car.spd < 0.05;
    c.jwait = stuck ? (c.jwait || 0) + dt : 0;
    c.blk = lim.why === WAIT_CART ? lim.id : 0;
    c.qwait = lim.why === WAIT_CART && car.spd < 0.05 ? (c.qwait || 0) + dt : 0;
    if (c.qwait > WAIT_MAX) {
      if (standoffYielder(R, car)) { c.qwait = 0; if (!detour(g, R, car)) stall(g, car, 'Blocked by a cart coming the other way.'); return; }
      const o = R.cars.find((x) => x.id === lim.id);
      if (o && o.st !== 'run') { c.qwait = 0; if (detour(g, R, car)) return; }   // a cart parked on the way: another way round, if there is one (otherwise it keeps waiting and looks again)
    }
    if (lim.still && lim.why === WAIT_CART && car.spd < 0.05 && lim.free < 0.05 && c.rem - lim.loc <= HEADWAY + 0.01) {   // the stopping place is taken by a cart that stays: this is as near as it gets
      if (c.edge) { c.edge = null; car.u = 0; car.b = null; }
      putCar(g, R, car); arrive(g, R, car); return;
    }
  } else { c.jwait = 0; c.blk = 0; c.qwait = 0; }
  while (left > 1e-7) {
    if (!c.edge) {
      const nk = car.path[0], B = R.nodes.get(nk), A = R.nodes.get(car.a);
      if (!B || !A || !R.adj.get(car.a).includes(nk)) { halt(g, car, 'The track ahead is cut.'); return; }
      if (!clearAt(g, B)) { halt(g, car, 'Something is blocking the track ahead.'); return; }
      const [ax, ay, az] = posOf(A), [bx, by, bz] = posOf(B);
      c.edge = { ax, ay, az, bx, by, bz, len: edgeLen(R, car.a, nk) }; car.b = nk; car.u = 0;
    }
    const e = c.edge, rem = (1 - car.u) * e.len;
    if (left >= rem) {
      left -= rem; c.rem -= rem; car.a = car.b; car.b = null; car.u = 0; car.path.shift(); c.edge = null;
      const N = R.nodes.get(car.a); [car.x, car.y, car.z] = N ? posOf(N) : [e.bx, e.by, e.bz];
      car.yaw = Math.atan2(e.bx - e.ax, e.bz - e.az); car.pitch = 0;
      if (!N) { derail(g, car, 'The track ended under the cart.'); return; }
      if (!car.path.length) { arrive(g, R, car); return; }
    } else { car.u += left / e.len; c.rem -= left; left = 0; }
  }
  putCar(g, R, car);
}

function idleWork(g, R, car, dt) {
  const c = car.cache;
  if (car.call) {
    c.callT = (c.callT ?? 60) - dt;
    const who = car.call, p = whoPos(g, who);
    if (p && distTo(car, p) < BOARD_R) {
      car.call = null; const home = car.home; car.home = false;
      if (seat(g, car, who)) { if (home) goHome(g, car, who); else say(g, who, `Seated. ${kbd(KEY)} rushes you home.`); }
    } else if (c.callT <= 0) { car.call = null; car.home = false; }
  }
  if (car.cargo.length) {
    c.unT = (c.unT || 0) - dt;
    if (c.unT <= 0) {
      const sink = cartSink(g, car);
      if (sink && sink.kind === 'sell') {
        c.unT = 0.07; const it = car.cargo.pop(); car.n = car.cargo.length;
        g.S.stats.railHauled = (g.S.stats.railHauled || 0) + 1;   // achievement counter
        g.sellAuto(it.sp, it.vr, 1, sink.bin);   // the plain price, like a belt into the bin: the hand-throw streak must not stack on a 120 plush load
        g.flyFx({ sp: it.sp, vr: it.vr, from: new THREE.Vector3(car.x, car.y + 0.6, car.z), to: new THREE.Vector3(sink.x, sink.y, sink.z), t: 0, dur: 0.4, arc: 0.9 });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------- rows to a guest
const mask = (r) => ((r || []).includes('host') ? 1 : 0) | ((r || []).includes('guest') ? 2 : 0);
const fromMask = (m) => { const o = []; if (m & 1) o.push('host'); if (m & 2) o.push('guest'); return o; };
const carRow = (c) => [c.id, r3(c.x), r3(c.y), r3(c.z), r3(c.yaw || 0), r3(c.pitch || 0), Math.round((c.spd || 0) * 100) / 100, c.st, c.cargo ? c.cargo.length : (c.n | 0), mask(c.riders), Math.round((c.cache && c.cache.rem) || 0), c.why || ''];
export function row(g) {
  const R = sync(g); if (!R.cars.length && !R.stns.length) return null;
  return { cars: R.cars.map(carRow), stns: R.stns.map((e) => [e.id, Math.round((e.pw || 0) * 100) / 100]) };
}
export function applyRow(g, d) {
  if (!d) return;
  const R = sync(g);
  for (const a of d.cars || []) {
    const it = g.machines.items.get(a[0]); if (!it || it.ent.type !== 'railcar') continue;
    const e = it.ent, c = e.cache || (e.cache = {});
    e.gx = a[1]; e.gy = a[2]; e.gz = a[3]; e.gyaw = a[4]; e.gpitch = a[5]; e.gspd = a[6]; e.gt = g.time;
    e.spd = a[6]; e.st = a[7]; e.n = a[8]; e.why = a[11]; c.rem = a[10];
    const lock = c.leftAt !== undefined && g.time - c.leftAt < 0.6;
    e.riders = lock ? fromMask(a[9] & ~(g.isGuest() ? 2 : 1)) : fromMask(a[9]);
    if (e.x === undefined || Math.hypot(e.gx - e.x, e.gz - e.z) > 8) { e.x = e.gx; e.y = e.gy; e.z = e.gz; e.yaw = e.gyaw; e.pitch = e.gpitch; }
  }
  for (const a of d.stns || []) { const it = g.machines.items.get(a[0]); if (it && it.ent.type === 'railstn') it.ent.pw = a[1]; }
  refreshStations(R);
  R.powerT = 0.25;
}
function refreshStations(R) { refreshLines(R); }

// ---------------------------------------------------------------------------------------------------------- the frame
function angleLerp(a, b, k) { let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; return a + d * k; }

function hud(g, R, car) {
  let el = R.hud;
  if (!car) { if (el) el.style.display = 'none'; return; }
  if (!el || !el.isConnected) {
    el = R.hud = document.createElement('div'); el.id = 'railHud';
    el.style.cssText = 'position:fixed;left:50%;top:108px;max-width:calc(100vw - 20px);transform:translateX(-50%);background:rgba(10,14,18,.8);color:#e8f0f6;font:600 13px/1.4 system-ui,sans-serif;padding:8px 16px;border-radius:8px;border:1px solid #3a5a6a;z-index:20;pointer-events:none;text-align:center';
    document.body.appendChild(el);
  }
  const comp = compOf(R, car.a), sp = car.spd || 0, rem = Math.round((car.cache && car.cache.rem) || 0);
  const powered = comp ? comp.powered : false, top = comp ? comp.speed : HAND_SPEED;
  const waits = car.st === 'run' && isWaitMsg(car.why) && sp < 0.3;
  const mode = car.st === 'derailed' ? 'OFF THE RAILS' : car.st === 'blocked' ? 'BLOCKED' : waits ? 'WAITING' : car.st === 'run' ? (car.dst != null && R.nodes.size && comp && isBaseNode(g, R, car.dst) ? 'HEADING HOME' : 'UNDER WAY') : 'STOPPED';
  el.innerHTML = `<div style="font-size:15px">MINE RAIL &nbsp; <b>${sp.toFixed(1)} m/s</b> &nbsp; ${powered ? `POWERED, top ${top.toFixed(0)} m/s` : `HAND CRANKED, ${HAND_SPEED} m/s`}</div><div>${mode}${car.st === 'run' ? `, ${rem} m to go` : ''} &nbsp;|&nbsp; ${kbd(KEY)} rush home / return &nbsp; ${kbd('E')} ${kbd('Space')} hop off &nbsp; ${car.n ? `| ${car.n} plush aboard` : ''}</div>`;
  el.style.display = 'block';
}

// ---------------------------------------------------------------------------------------------------------- achievement counters (the local player's own stats, on the host and on a guest)
// railMeters: meters ridden. railRides: a ride that covered 3 m or more and came to a stop. railHomes: such a ride that began away from the base and ended at a base station
// (or, with no base station, at the end nearest the bin). The cart's piece is read from its position, because a guest's cart has no `a`.
const keyAtCar = (car) => idx(toI(car.x), toJ(car.y + 0.1), toK(car.z));
function trackTrip(g, R, car, dt) {
  const S = g.S; if (!S || !S.stats) return;
  if (!car) { R.trip = null; return; }
  let T = R.trip; if (!T || T.id !== car.id) T = R.trip = { id: car.id, m: 0, from: undefined };
  const moving = car.st === 'run' && (car.spd || 0) > 0.2;
  if (moving) {
    if (T.from === undefined && R.nodes.size) T.from = isBaseNode(g, R, keyAtCar(car));
    const d = car.spd * dt; T.m += d; S.stats.railMeters = (S.stats.railMeters || 0) + d;
  } else if (car.st !== 'run' && T.m >= 3) {
    S.stats.railRides = (S.stats.railRides || 0) + 1;
    if (T.from === false && R.nodes.size && isBaseNode(g, R, keyAtCar(car))) S.stats.railHomes = (S.stats.railHomes || 0) + 1;
    T.m = 0; T.from = undefined;
  } else if (car.st !== 'run') { T.m = 0; T.from = undefined; }
}

// once per frame on the host (host true) or a guest
export function tick(g, dt, host) {
  const R = sync(g);
  R.t += dt;
  const cam = g.renderer && g.renderer.camera;
  if (!R.nodes.size && !R.cars.length && !R.stns.length && !R.view) { hud(g, R, null); return; }
  // line power
  R.powerT -= dt;
  if (R.powerT <= 0) {
    R.powerT = 0.25;
    if (host) for (const e of R.stns) if (e.pw === undefined) e.pw = stationPower(g, e);   // a station the solver has not counted yet
    refreshLines(R);
  }
  for (const s of R.stns) {   // the lamp on the post shows power
    const it = g.machines.items.get(s.id), lamp = it && it.obj.getObjectByName('lamp'); if (!lamp) continue;
    const want = (s.pw || 0) > 0.05 ? (it.obj.userData.base ? M.lampBase : M.lampOn) : M.lampOff; if (lamp.material !== want) lamp.material = want;
  }
  // carts
  if (host) {
    for (const car of R.cars) { if (car.riders && car.riders.includes('guest') && !whoPos(g, 'guest')) unseat(g, car, 'guest'); if (car.call === 'guest' && !whoPos(g, 'guest')) car.call = null; }   // the friend left
    const n = Math.max(1, Math.ceil(dt / 0.1)), sub = dt / n;
    for (let q = 0; q < n; q++) { updateClaims(g, R); for (const car of R.cars) stepCar(g, R, car, sub); }
  } else guestCars(g, R, dt);
  for (const car of R.cars) syncCarObj(g, car, dt);
  // the rider
  const who = host ? 'host' : 'guest', mine = seatedCar(g, who);
  keyEdges(g, R, mine, who, host);
  trackTrip(g, R, mine, dt);
  if (mine) placeRider(g, R, mine, who, host, dt); else { R.lastPos = null; }
  hud(g, R, seatedCar(g, who));
  if (mine && (mine.spd || 0) > 3) { R.clack -= dt; if (R.clack <= 0) { R.clack = 0.16 - Math.min(0.08, (mine.spd || 0) * 0.008); g.sound.thump(0.03 + (mine.spd || 0) * 0.004, 150 + (mine.spd || 0) * 8); } }
  // track meshes around the camera
  if (cam) {
    const V = ensureView(g, R);
    if (V) {
      const key = `${R.ver}|${R.powerSig}|${Math.floor(cam.position.x / 6)}|${Math.floor(cam.position.z / 6)}`;
      if (key !== R.viewKey) { R.viewKey = key; rebuildView(g, R, V, cam.position); }
    }
  }
  // rows: moving carts at 10 Hz, everything else rides the 0.5 s row
  if (host && g.net.open && g.net.role === 'host') {
    R.rowT -= dt;
    if (R.rowT <= 0 || R.rowNow) {
      const moving = R.cars.filter((c) => c.st === 'run' || R.rowNow);
      if (moving.length) { g.netSend({ t: 'xrow', k: 'railcar', d: { cars: moving.map(carRow) } }); R.rowT = 0.1; R.rowNow = false; } else R.rowT = 0.1;
    }
  } else R.rowNow = false;
}

function guestCars(g, R, dt) {
  const k = 1 - Math.exp(-dt * 14);
  for (const e of R.cars) {
    if (e.gt === undefined) continue;
    const age = Math.min(0.35, g.time - e.gt), sp = e.gspd || 0, cp = Math.cos(e.gpitch || 0);
    const tx = e.gx + Math.sin(e.gyaw) * cp * sp * age, ty = e.gy + Math.sin(e.gpitch || 0) * sp * age, tz = e.gz + Math.cos(e.gyaw) * cp * sp * age;
    if (Math.hypot(tx - e.x, tz - e.z) > 8) { e.x = tx; e.y = ty; e.z = tz; } else { e.x += (tx - e.x) * k; e.y += (ty - e.y) * k; e.z += (tz - e.z) * k; }
    e.yaw = angleLerp(e.yaw || 0, e.gyaw, k); e.pitch = (e.pitch || 0) + ((e.gpitch || 0) - (e.pitch || 0)) * k;
  }
}

function syncCarObj(g, car, dt) {
  const it = g.machines.items.get(car.id); if (!it) return;
  const o = it.obj; o.position.set(car.x, car.y, car.z); o.rotation.set(-(car.pitch || 0), car.yaw || 0, 0, 'YXZ');
  const load = o.getObjectByName('load'); if (load) { const f = Math.min(1, (car.cargo && car.cargo.length ? car.cargo.length : car.n | 0) / CAR_CAP); load.scale.y = Math.max(0.001, f); load.position.y = 0.17 + 0.1 * f; }
  const spin = (car.spd || 0) * dt / 0.1; o.traverse((w) => { if (w.name === 'wheel') w.rotation.x += spin; });
}

function placeRider(g, R, car, who, host, dt) {
  const p = g.player;
  if (R.lastPos && Math.hypot(p.pos.x - R.lastPos.x, p.pos.z - R.lastPos.z) > 2.5) {   // someone moved you (a recall, a depot trip): you are off the cart
    if (host) unseat(g, car, 'host'); else { (car.cache || (car.cache = {})).leftAt = g.time; car.riders = car.riders.filter((x) => x !== 'guest'); g.cmd('rail', { act: 'leave' }); }
    R.lastPos = null; return;
  }
  if (g.dead) { if (host) unseat(g, car, 'host'); R.lastPos = null; return; }
  const seatN = Math.max(0, car.riders.indexOf(who)), side = SEATS > 1 && car.riders.length > 1 ? (seatN ? 0.17 : -0.17) : 0;
  const rx = Math.cos(car.yaw || 0), rz = -Math.sin(car.yaw || 0);
  p.pos.set(car.x + rx * side, car.y, car.z + rz * side); p.vel.set(0, 0, 0); p.embedded = false; p.buried = 0; p.stepOff = 0;
  R.lastPos = { x: p.pos.x, z: p.pos.z };
  const cam = g.renderer.camera; cam.position.copy(p.eyePos(R._eye || (R._eye = new THREE.Vector3()))); cam.updateMatrixWorld(true);
  void dt;
}

function keyEdges(g, R, car, who, host) {
  const e = !!g.keys.KeyE, sp = !!g.keys.Space, edgeE = e && !R.prevE, edgeS = sp && !R.prevSp;
  R.prevE = e; R.prevSp = sp;
  if (!car || !(edgeE || edgeS)) return;
  if (g.ui.isModalOpen()) return;
  if (host) { hop(g, car, 'host'); if (!car.riders.includes('host')) g.ui.hint('You hopped off.', 2); }
  else guestLeave(g, car);
}

// tests and new games: forget every ride and drop the readout
export function reset(g) {
  const R = g._rail; if (!R) return;
  for (const c of R.cars) { c.riders = []; c.leave = null; c.call = null; }
  if (R.hud) R.hud.style.display = 'none';
  R.lastPos = null; R.prevE = R.prevSp = false; R.sig = ''; R.trip = null;
}

// ---------------------------------------------------------------------------------------------------------- readouts
const lineOf = (R, key) => { const c = compOf(R, key); return c ? { c, pieces: c.n, stns: c.stns.length, cars: R.cars.filter((x) => R.comp.get(x.a) === c.id).length } : null; };
export function infoRail(g, e) {
  const R = sync(g), key = keyOf(e), L = lineOf(R, key), a = R.adj.get(key) || [];
  if (!L) return null;
  const slope = a.some((v, n) => n % 2 === 1 && v > C + 0.01) ? 'Climbs or drops here (45 degrees).' : a.length >= 6 ? 'A junction: a cart picks the way to where it was sent.' : a.length === 2 ? 'End of the line: lay the next piece beside it.' : 'Joins the pieces beside it.';
  return { title: 'MINE RAIL', lit: L.c.powered, lines: [
    `${L.pieces} pieces on this line, ${L.stns} stations, ${L.cars} carts`,
    L.c.powered ? `Powered: carts run at ${L.c.speed.toFixed(0)} m/s` : `Hand cranked: carts crawl at ${HAND_SPEED} m/s. A station wired to a live pole or generator runs the line at ${POWER_SPEED} m/s.`,
    slope, 'The hammer takes it up and gives it back.',
  ] };
}
export function infoStation(g, e) {
  const R = sync(g), key = keyOf(e), L = lineOf(R, key), lit = (e.pw || 0) > 0.05;
  return { title: `RAIL STATION: ${(e.name || e.role).toUpperCase()}`, lit, lines: [
    e.role === 'base' ? 'BASE end: carts that stop near the bin sell their load.' : 'FACE end: the work end of the line. Carts wait here.',
    lit ? `Powered ${Math.round((e.pw || 0) * 100)}%: the line runs at ${(L ? L.c.speed : POWER_SPEED).toFixed(0)} m/s` : `No power: the line is hand cranked at ${HAND_SPEED} m/s. Run a Power Cable from a live pole or generator to the station.`,
    L ? `${L.pieces} pieces on this line, ${L.cars} carts` : 'Not on a track',
    `E switches it between BASE and FACE. ${KEY} calls the nearest cart.`,
  ] };
}
export function infoCar(g, e) {
  const R = sync(g), c = compOf(R, e.a), sp = e.spd || 0;
  const st = e.st === 'run' && isWaitMsg(e.why) && sp < 0.3 ? e.why : e.st === 'run' ? `Under way at ${sp.toFixed(1)} m/s` : e.st === 'blocked' ? `Stopped: ${e.why || 'the track is blocked'}` : e.st === 'derailed' ? `Off the rails: ${e.why || ''} E sets it on the nearest track.` : 'Waiting';
  return { title: 'RAIL CART', lit: e.st !== 'derailed', lines: [
    `${e.cargo && e.cargo.length ? e.cargo.length : e.n | 0} of ${CAR_CAP} plush aboard`, st,
    (e.riders || []).length ? `${e.riders.length} of ${SEATS} seats taken` : `${SEATS} seats free`,
    c ? (c.powered ? `Line speed ${c.speed.toFixed(0)} m/s (powered)` : `Line speed ${HAND_SPEED} m/s (hand cranked)`) : 'Not on a track',
    'E with plush in your hands loads it, E with empty hands sits you in it. Loads sell at the base bin.',
  ] };
}
