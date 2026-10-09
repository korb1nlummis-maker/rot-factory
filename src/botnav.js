// Multi-level bot navigation (the spine for the call routes job that comes after it).
//
// A bot used to walk the pile floor in straight lines and skip anything more than about 2.2 m above or below it. This module teaches it the built world:
// ramps and stairs (build.js), plates, catwalks and foundations (PAD cells), ladders (stack.js), elevators and their call panels (transit.js) and doors (transit.js).
//
// THE GRAPH. A node is a standing surface: a cell column at one height, with a solid floor under it and three clear rows over it (the headroom a bot needs), or the sloped
// surface of a ramp or a stair at the middle of a cell column. Nodes are made on demand (never a scan of the world), cached per version, and joined by edges:
//   walk    the same height, 4 sides and the diagonals when both sides of the corner are flat
//   step    one cell (0.6 m) up or down. A drop of more than that is never an edge: a bot never walks off an unguarded edge on purpose
//   ramp    up to 0.8 grade, along the ramp's own axis when it joins something that is not the same ramp (a ramp's flanks are solid, as for the player)
//   stair   the same, per tread
//   ladder  from the foot cell to the plate cell the ladder hangs on (4 rows, 2.4 m), both ways
//   cabIn / ride / cabOut   the elevator: from the landing cell that has the call panel into the cab, between stops, and out again. Only for a lift that has power (a hand
//           crank needs a person in the cab) and a shaft that is not cut between the two stops.
//   door    a door is a gap in the graph while it is closed and cannot be opened for a bot (a key lock, or no power); a door that has power opens for the bot
// Jump pads are not used: a launch lands where physics says, and a bot that misses would be on the wrong floor. (A deliberate choice, not an oversight.)
//
// THE SEARCH. A* with a cap on the nodes it opens, resumable, run by a queue with a 1 ms per frame budget across every bot. Results are cached per (start node, goal) and
// thrown away when the VERSION counter changes. The version moves on every event that changes what can be walked:
//   * a pad, catwalk plate or wall cell is set or removed (a build, a hammer, a collapse, a falling cube): world.setCell is wrapped once per world,
//   * a ramp, stair or ladder is registered or taken down: build.js register/unregister and stack.js add/removeLadder bump `g.botnavVer`,
//   * a lift gains or loses power, a stop, or its shaft is cut; a door gains or loses power, a lock or an open leaf (polled four times a second: `signature`).
// Digging plush does NOT bump it (ground changes constantly): a bot checks the next node before it steps and asks for a new path when the floor is gone.
//
// THE BOT. crew.js asks three questions: `walk` (the waypoint states: return, fwalk, chgwalk, dwalk), `steer` (idle, lowbat, follow, haulgo) and `guard`/`took` in move().
// A bot on the ground whose errand ends on the ground is left to the old code (trails, physics, hops). A bot on a built surface, or an errand that ends on one, is driven
// here: node by node, its height following the surface (kinematic, so it never floats and never falls), with a short climb on a ladder, a hop on a stair, a lean on a ramp,
// a call at the panel and a ride in the cab. No path means 'No way up': one toast, the status line says so, and the old behavior takes over (a bot on the ground walks at
// the wall until the stuck timer phases it home; a bot on a built surface holds still: it never steps off an edge on purpose).
//
// PUBLIC API (all take positions as { x, y, z } or a bot, or a logistics tile { i, j, k }; metres, y is the feet):
//   pathTo(bot, target, opts)  -> a path { ok, state: 'ok' | 'pending' | 'none', steps, len, why, ver }. opts: { r (goal radius, 1.4), dy (height slack, 0.8), sync, cap }
//   reachable(from, to, opts)  -> true / false (a synchronous search, cached)
//   stepList(path)             -> [{ x, y, z, kind, lift?, row?, door? }, ...] one entry per node; kind is how the bot arrives at it:
//                                 'start' | 'walk' | 'step' | 'ramp' | 'stair' | 'ladder' | 'cabIn' | 'ride' | 'cabOut'
//   legs(path)                 -> the same merged into legs [{ kind, from: [x,y,z], to: [x,y,z], len, rise, n }] (what a call route reads)
//   version(), invalidate(why) -> the counter and a manual bump
//   isGround(pos)              -> true when the floor under pos is pile or hall floor (not a plate, a ramp, a stair or a cab)
//   nearestSafeDown(pos)       -> the nearest standing surface at or below pos { x, y, z, built } or null (where a phase lands a bot that cannot walk)
//   graph.nodeAt(pos), graph.neighbors(node)  -> the walkable graph itself (nodes { i, k, x, y, z, t, key })
//   stats()                    -> counters (searches, cache hits, nodes opened, ms spent)
import { C, NX, NZ, NY, cellX, cellZ, toI, toK } from './config.js';
import { PAD, BULK } from './plushdata.js';
import * as B from './build.js';
import * as ST from './stack.js';
import * as TR from './transit.js';

export const STEP_UP = 0.62;          // one cell, a hair over
export const SNAP_UP = 0.36;          // the lip a walker's feet climb onto a ramp or a stair surface (build.js walkStep SNAP_UP)
export const MAX_GRADE = 0.8;         // rise over run of an edge on a ramp or a stair
export const HEAD = 3;                // clear rows a bot needs over its feet
export const NODE_CAP = 6000;         // nodes one search may open
export const BUDGET_MS = 1.0;         // per frame, across every bot
export const CACHE_MAX = 400;
export const WAIT_LIFT = 90, WAIT_DOOR = 14;   // seconds a bot waits for a cab or a door before it gives up
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
const HALF = 2 * C + 0.1;

// the node kinds (rec.t)
export const T_GROUND = 0, T_FLOOR = 1, T_RAMP = 2, T_STAIR = 3, T_CAB = 4;

// codes for the status line and the crew row (a guest gets the number)
export const CODE = { none: 0, ramp: 1, stair: 2, ladder: 3, lift: 4, ride: 5, door: 6, noway: 7, finding: 8 };
const TEXT = [null, 'Taking the ramp', 'Taking the stairs', 'Climbing', 'Waiting for the lift', 'Riding the lift', 'Waiting for the door', 'No way up', 'Finding a way'];

let G = null;                           // the game the module-level API answers for (set by install)
let ON = true;                          // off: every crew.js hook says 'the old code' (a test of what the layer costs, or a bug hunt)
export function setEnabled(v) { ON = !!v; }
export const isEnabled = () => ON;
const NSM = new WeakMap();
const BSM = new WeakMap();              // per bot: nothing about navigation is ever written onto the bot, so a save never holds a path
const idx = (i, j, k) => (j * NZ + k) * NX + i;
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ====================================================================================================================================================
// state per game and world
// ====================================================================================================================================================
function fresh(g) {
  return {
    g, world: g.world, ver: 1, seenExt: g.botnavVer | 0, nodes: new Map(), adj: new Map(), links: null, doorCells: new Map(), lifts: [], liftById: new Map(),
    cache: new Map(), queue: [], sig: '', sigT: -1, why: '', byWhy: {},
    st: { searches: 0, hits: 0, misses: 0, expanded: 0, ms: 0, frames: 0, frameMs: 0, bumps: 0, fails: 0, queued: 0 },
  };
}
export function install(g) { G = g; return NS(g); }
function NS(g) {
  let ns = NSM.get(g);
  if (!ns || ns.world !== g.world) {
    ns = fresh(g); NSM.set(g, ns);
    const w = g.world;
    if (w) w._bnNs = ns;
    if (w && !w._bnWrapped) {   // every cell edit (a build, a hammer, a collapse, a falling cube) goes through setCell: a plate or a wall cell changing is a new version
      w._bnWrapped = true;
      const orig = w.setCell;
      w.setCell = function (i, j, k, sp, vr) {
        const n = ON ? this._bnNs : null;
        if (n) {
          const old = this.get(i, j, k);
          if ((sp === PAD) !== (old === PAD) || ((sp === BULK) !== (old === BULK) && !isDoorCell(n, i, j, k))) bump(n, 'cells');   // (a plate cell set again to what it is is no news)
        }
        return orig.apply(this, arguments);
      };
    }
  }
  if ((g.botnavVer | 0) !== ns.seenExt) { ns.seenExt = g.botnavVer | 0; bump(ns, 'build'); }
  return ns;
}
function isDoorCell(ns, i, j, k) { try { return !!TR.doorAt(ns.g, i, j, k); } catch (x) { return false; } }
function bump(ns, why) {
  ns.ver++; ns.st.bumps++; ns.why = why; ns.byWhy[why] = (ns.byWhy[why] | 0) + 1;
  ns.nodes.clear(); ns.adj.clear(); ns.links = null; ns.cache = new Map(); ns.queue.length = 0;
}
export function version() { return G ? NS(G).ver : 0; }
export function invalidate(why = 'manual') { if (G) bump(NS(G), why); }
export function stats() { return G ? { ...NS(G).st, ver: NS(G).ver, cache: NS(G).cache.size, queue: NS(G).queue.length, nodes: NS(G).nodes.size, adj: NS(G).adj.size, byWhy: { ...NS(G).byWhy } } : {}; }
export function resetStats() { if (!G) return; const s = NS(G).st; for (const k of Object.keys(s)) if (k !== 'bumps') s[k] = 0; }

// ====================================================================================================================================================
// nodes
// ====================================================================================================================================================
const keyOf = (i, k, y) => ((Math.round(y * 8) + 8) * NZ + k) * NX + i;
function rec(ns, i, k, y, t, ent) {
  const key = keyOf(i, k, y);
  let r = ns.nodes.get(key);
  if (!r) { r = { key, i, k, x: cellX(i), z: cellZ(k), y, t, ent: ent || null, door: null, virt: false }; ns.nodes.set(key, r); }
  return r;
}
function solidFor(ns, i, j, k) {
  if (j < 0) return true;
  if (ns.doorCells.size) { const d = ns.doorCells.get(idx(i, j, k)); if (d && d.pass) return false; }
  return ns.g.world.solid(i, j, k);
}
// a bot can stand on row j of a column: floor under it, three clear rows over it
function standOK(ns, i, j, k) {
  if (i < 3 || i > NX - 4 || k < 3 || k > NZ - 4 || j < 0 || j > NY - HEAD - 1) return false;
  if (!solidFor(ns, i, j - 1, k)) return false;
  for (let h = 0; h < HEAD; h++) if (solidFor(ns, i, j + h, k)) return false;
  return true;
}
const walkList = (ns, i, k) => { const rg = ns.g._bld; return rg && rg.world === ns.g.world && rg.walk.size ? rg.walk.get(k * NX + i) : undefined; };
const entOf = (g, id) => { const it = g.machines.items.get(id); return it ? it.ent : null; };
// the standing surfaces of one column with feet height between ylo and yhi (a ramp or stair surface counts at the middle of the cell)
function surfacesIn(ns, i, k, ylo, yhi) {
  const g = ns.g, w = g.world, out = [];
  const jHi = Math.min(NY - HEAD - 1, Math.floor(yhi / C + 1e-6)), jLo = Math.max(0, Math.ceil(ylo / C - 1e-6));
  const wl = walkList(ns, i, k);
  const ents = wl ? wl.map((id) => entOf(g, id)).filter(Boolean) : null;
  for (let j = jHi; j >= jLo; j--) {
    if (ents && ents.some((e) => j >= e.j && j < e.j + e.rise)) continue;    // inside a ramp's own volume: the slope is the floor there, not the cell under it
    if (!standOK(ns, i, j, k)) continue;
    const f = j > 0 ? w.get(i, j - 1, k) : 0;
    out.push(rec(ns, i, k, j * C, f === PAD || f === BULK ? T_FLOOR : T_GROUND));
  }
  if (ents) for (const e of ents) {
    const sy = B.slopeHeight(e, cellX(i), cellZ(k));
    if (sy === null || sy < ylo - 1e-6 || sy > yhi + 1e-6) continue;
    const j0 = Math.floor(sy / C + 1e-6); let clear = true;
    for (let h = 0; h < HEAD; h++) if (solidFor(ns, i, j0 + h, k)) { clear = false; break; }
    if (clear) out.push(rec(ns, i, k, sy, e.type === 'stair' ? T_STAIR : T_RAMP, e));
  }
  return out;
}
// the node under (x, y, z): the closest standing surface within [y - down, y + up]
function snap(ns, x, y, z, up = 0.55, down = 0.9) {
  const cs = surfacesIn(ns, toI(x), toK(z), y - down, y + up);
  let best = null, bd = 1e9;
  for (const c of cs) { const d = Math.abs(c.y - y); if (d < bd) { bd = d; best = c; } }
  return best;
}
// the cab a position is inside (feet at the floor of the cab), or null
function cabAt(ns, x, y, z) {
  for (const e of ns.lifts) if (Math.abs(x - e.px) < 2 * C - 0.05 && Math.abs(z - e.pz) < 2 * C - 0.05 && y >= e.cy - 0.4 && y <= e.cy + 0.45) return e;   // (strictly over the cab floor: a bot on the rim of the landing is on the landing)
  return null;
}

// ====================================================================================================================================================
// links: ladders, lifts and doors (rebuilt once per version, from the few entities that have them)
// ====================================================================================================================================================
const vkey = (lid, row) => -(1 + lid * 256 + (row & 255));
const doorPass = (e) => e.lock !== 'key' && (((e.pw ?? 0) > 0.05) || (e.p >= 0.999 && !!e.tgt));
function addLink(ns, from, to, kind, cost, extra) { let a = ns.links.get(from.key); if (!a) ns.links.set(from.key, a = []); a.push({ to, cost, kind, ...(extra || {}) }); }
function vrec(ns, e, row) {
  const key = vkey(e.id, row); let r = ns.nodes.get(key);
  if (!r) { r = { key, i: e.i0, k: e.k0, x: e.px, z: e.pz, y: row * C, t: T_CAB, ent: e, door: null, virt: true, lift: e.id, row }; ns.nodes.set(key, r); }
  return r;
}
const sideCell = (e, q, u) => (q === 0 ? [e.i0 + 4, e.k0 + u] : q === 1 ? [e.i0 + u, e.k0 + 4] : q === 2 ? [e.i0 - 1, e.k0 + u] : [e.i0 + u, e.k0 - 1]);
function landingCell(g, e, r) {
  const sg = Array.isArray(e.sg) ? e.sg.find((s) => s[0] === r && s[1] >= 0) : null; let q, u;
  if (sg) { q = sg[1]; u = sg[2]; } else { const la = TR.landingAt(g, e, r); if (!la) return null; q = la.q; u = la.u; }
  return sideCell(e, q, u);
}
function buildLinks(ns) {
  const g = ns.g;
  ns.links = new Map(); ns.doorCells = new Map(); ns.lifts = []; ns.liftById = new Map(); ns.doors = [];
  const doors = [], lifts = [];
  for (const it of g.machines.items.values()) { const e = it.ent; if (e.type === 'door') doors.push(e); else if (e.type === 'plift') lifts.push(e); }
  ns.doors = doors;
  for (const e of doors) {
    const pass = doorPass(e);
    for (const [i, j, k] of TR.allDoorCells(e)) ns.doorCells.set(idx(i, j, k), { e, pass });
  }
  for (const e of lifts) { ns.lifts.push(e); ns.liftById.set(e.id, e); }
  // ladders: the foot cell and the plate cell it hangs on
  if (ST.ladders) for (const L of ST.ladders(g).values()) {
    const ci = L.i + DX[L.dir], ck = L.k + DZ[L.dir], top = (L.j + ST.LADDER_H) * C;
    if (!standOK(ns, L.i, L.j, L.k) || !standOK(ns, ci, L.j + ST.LADDER_H, ck)) continue;
    const foot = rec(ns, L.i, L.k, L.j * C, g.world.get(L.i, L.j - 1, L.k) === PAD ? T_FLOOR : T_GROUND), tp = rec(ns, ci, ck, top, T_FLOOR);
    addLink(ns, foot, tp, 'ladder', ST.LADDER_H * C * 2 + 1.5, { ladder: L.id });
    addLink(ns, tp, foot, 'ladder', ST.LADDER_H * C * 1.5 + 1.5, { ladder: L.id });
  }
  // lifts: powered, a shaft that is clear between two stops
  for (const e of lifts) {
    if (!((e.pw ?? 0) > 0.05)) continue;
    const rows = TR.floorsOf(g, e), stops = [];
    for (const r of rows) { const c = landingCell(g, e, r); if (!c) continue; if (!standOK(ns, c[0], r, c[1])) continue; stops.push({ r, c, ring: rec(ns, c[0], c[1], r * C, g.world.get(c[0], r - 1, c[1]) === PAD ? T_FLOOR : T_GROUND), v: vrec(ns, e, r) }); }
    for (const a of stops) {
      addLink(ns, a.ring, a.v, 'cabIn', 1.5, { lift: e.id, row: a.r });
      addLink(ns, a.v, a.ring, 'cabOut', 1.0, { lift: e.id, row: a.r });
      for (const b of stops) if (a !== b && TR.sweepBlocked(g, e, a.r * C, b.r * C) < 0) addLink(ns, a.v, b.v, 'ride', 9 + Math.abs(a.r - b.r) * C * 0.7, { lift: e.id, from: a.r, row: b.r });
    }
  }
}
const links = (ns) => { if (!ns.links) buildLinks(ns); return ns.links; };

// ====================================================================================================================================================
// edges
// ====================================================================================================================================================
function edge(ns, from, to, d, diag) {
  const base = diag ? 0.8485 : 0.6, dy = to.y - from.y, ady = Math.abs(dy);
  const sf = from.t === T_RAMP || from.t === T_STAIR, st = to.t === T_RAMP || to.t === T_STAIR;
  let cost, kind;
  if (sf || st) {
    if (diag) return null;
    // onto or off a slope. Up onto a surface is a lip the feet climb when it is within SNAP_UP (0.36 m, the player's own rule in build.js walkStep): the flank of a ramp is higher than that, so it is a wall;
    // the top of a stair beside a plate is level with it, so a sideways step off the end is fine. A drop is a step down (a cell at most).
    if (!(from.ent && from.ent === to.ent)) { if (dy > SNAP_UP || -dy > STEP_UP) return null; }
    else if (ady > base * MAX_GRADE + 0.02) return null;
    if (ady > base * MAX_GRADE + 0.02 && !(from.ent && from.ent === to.ent)) return null;
    const stair = from.t === T_STAIR || to.t === T_STAIR;
    cost = base * (stair ? 1.25 : 1.1); kind = stair ? 'stair' : 'ramp';
  } else {
    if (ady > STEP_UP) return null;
    cost = base + (ady > 0.02 ? 0.35 : 0); kind = ady > 0.02 ? 'step' : 'walk';
  }
  const dc = ns.doorCells.size ? ns.doorCells.get(idx(to.i, Math.round(to.y / C), to.k)) : null;
  if (dc) { to = doorNode(ns, to, dc); cost += dc.e.p >= 0.999 && dc.e.tgt ? 0.4 : 3.5; }
  return { to, cost, kind };
}
// a node inside a door: the same node with the door on it (nodes are per version, so this is cached with them)
function doorNode(ns, r, dc) { if (!r.door) r.door = dc.e; return r; }
function neighbors(ns, r) {
  let a = ns.adj.get(r.key); if (a) return a;
  a = [];
  if (!r.virt) {
    const flat = [null, null, null, null];
    for (let d = 0; d < 4; d++) {
      const cs = surfacesIn(ns, r.i + DX[d], r.k + DZ[d], r.y - STEP_UP, r.y + STEP_UP);
      for (const c of cs) { const e = edge(ns, r, c, d, false); if (e) { a.push(e); if (Math.abs(c.y - r.y) < 0.02 && c.t <= T_FLOOR && r.t <= T_FLOOR) flat[d] = e; } }
    }
    for (let d = 0; d < 4; d++) {   // diagonals, only across flat floor with both sides of the corner open
      const d2 = (d + 1) & 3; if (!flat[d] || !flat[d2]) continue;
      const cs = surfacesIn(ns, r.i + DX[d] + DX[d2], r.k + DZ[d] + DZ[d2], r.y - 0.02, r.y + 0.02);
      for (const c of cs) if (c.t <= T_FLOOR) { const e = edge(ns, r, c, d, true); if (e) a.push(e); }
    }
  }
  const L = links(ns).get(r.key); if (L) for (const e of L) a.push(e);
  ns.adj.set(r.key, a);
  return a;
}

// ====================================================================================================================================================
// search
// ====================================================================================================================================================
class Heap {
  constructor() { this.f = []; this.k = []; }
  get size() { return this.f.length; }
  push(f, k) { const F = this.f, K = this.k; let i = F.length; F.push(f); K.push(k); while (i > 0) { const p = (i - 1) >> 1; if (F[p] <= f) break; F[i] = F[p]; K[i] = K[p]; i = p; } F[i] = f; K[i] = k; }
  pop() {
    const F = this.f, K = this.k, top = K[0], lf = F.pop(), lk = K.pop(), n = F.length;
    if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && F[c + 1] < F[c]) c++; if (F[c] >= lf) break; F[i] = F[c]; K[i] = K[c]; i = c; } F[i] = lf; K[i] = lk; }
    return top;
  }
}
const heur = (r, goal) => Math.max(0, Math.hypot(r.x - goal.x, r.z - goal.z, (r.y - goal.y) * 1.0) - goal.r) * 1.12;
const atGoal = (r, goal) => !r.virt && Math.hypot(r.x - goal.x, r.z - goal.z) <= goal.r && Math.abs(r.y - goal.y) <= goal.dy && (!goal.floor || r.t <= T_FLOOR) && (!goal.ground || r.t === T_GROUND);   // (an errand that ends in the old walk must end on a floor: the old physics knows no ramp; a bot on its way down after a call must end on the pile floor or the hall floor, not on a plate)
class Search {
  constructor(ns, start, goal, cap) {
    this.ns = ns; this.goal = goal; this.cap = cap; this.start = start;
    this.open = new Heap(); this.gs = new Map(); this.came = new Map(); this.closed = new Set(); this.recs = new Map();
    this.open.push(heur(start, goal), start.key); this.gs.set(start.key, 0); this.recs.set(start.key, start);
    this.n = 0; this.done = false; this.found = null; this.capped = false; this.best = start; this.bestH = heur(start, goal);
  }
  step(max) {
    const ns = this.ns;
    for (let q = 0; q < max && !this.done; q++) {
      if (!this.open.size) { this.done = true; return; }
      const key = this.open.pop(); if (this.closed.has(key)) continue; this.closed.add(key);
      const r = this.recs.get(key); this.n++; ns.st.expanded++;
      if (atGoal(r, this.goal)) { this.done = true; this.found = r; return; }
      if (this.n >= this.cap) { this.done = true; this.capped = true; return; }
      const g0 = this.gs.get(key), a = neighbors(ns, r);
      for (let n = 0; n < a.length; n++) {
        const e = a[n], tk = e.to.key; if (this.closed.has(tk)) continue;
        const g1 = g0 + e.cost; const old = this.gs.get(tk);
        if (old === undefined || g1 < old) {
          this.gs.set(tk, g1); this.recs.set(tk, e.to); this.came.set(tk, { from: key, kind: e.kind, e });
          const h = heur(e.to, this.goal); if (h < this.bestH && !e.to.virt) { this.bestH = h; this.best = e.to; }
          this.open.push(g1 + h, tk);
        }
      }
    }
  }
  result() {
    const out = []; let k = this.found.key;
    while (k !== this.start.key) { const c = this.came.get(k); out.push({ rec: this.recs.get(k), kind: c.kind, e: c.e }); k = c.from; }
    out.push({ rec: this.start, kind: 'start', e: null }); out.reverse();
    return { steps: out, len: this.gs.get(this.found.key) };
  }
}

// ====================================================================================================================================================
// the path API
// ====================================================================================================================================================
function pos3(o) {
  if (!o) return null;
  if (o.i !== undefined && o.x === undefined) return { x: cellX(o.i), y: (o.j || 0) * C, z: cellZ(o.k) };
  return { x: o.x, y: o.y || 0, z: o.z };
}
// the node a bot (or a point) stands on: a surface, or the cab it is in when the cab is at a stop
function startRec(ns, p) {
  const cab = cabAt(ns, p.x, p.y, p.z);
  if (cab && ns.lifts.length) {
    const row = Math.round(cab.cy / C);
    if (Math.abs(cab.cy - row * C) < 0.05 && cab.tg === null && TR.floorsOf(ns.g, cab).includes(row)) { links(ns); return vrec(ns, cab, row); }
    return null;
  }
  return snap(ns, p.x, p.y, p.z);
}
const goalSig = (gl) => `${Math.round(gl.x * 2)},${Math.round(gl.y * 4)},${Math.round(gl.z * 2)},${Math.round(gl.r * 2)},${Math.round(gl.dy * 4)}${gl.floor ? 'f' : ''}${gl.ground ? 'g' : ''}`;
function makeGoal(t, opts) { const p = pos3(t); return { x: p.x, y: p.y, z: p.z, r: opts.r ?? 1.4, dy: opts.dy ?? 0.8, ...(opts.floor ? { floor: true } : {}), ...(opts.ground ? { ground: true } : {}) }; }   // (floor: the goal must be a floor, as a crew errand's is: the call routes lay the very path the driver walks, so both share one cache entry)
function why(ns, start, goal) {   // what to tell a player when there is no path: a door or a lift that is not working near either end
  links(ns); const near = (e, x, z) => Math.hypot((e.px ?? e.cx ?? 0) - x, (e.pz ?? e.cz ?? 0) - z) < 14;
  for (const e of ns.g.machines.items.values()) {
    const d = e.ent; if (d.type === 'door' && !doorPass(d) && (near(d, goal.x, goal.z) || near(d, start.x, start.z))) return d.lock === 'key' ? 'A door with a key lock is in the way' : 'A door has no power';
  }
  for (const e of ns.lifts) if (!((e.pw ?? 0) > 0.05) && (near(e, goal.x, goal.z) || near(e, start.x, start.z))) return 'The lift has no power';
  return 'No way up';
}
// A* cannot prove that a goal in a big open region is out of reach: it runs out of nodes first. The goal is usually in a small closed one (an upper floor nothing leads to), so flood
// from the goal's side: if that runs dry without ever touching the start, there is no way. (Resumable, like the search, so a frame never pays for all of it.)
function startFlood(ns, s) {
  const goal = s.goal, ci = toI(goal.x), ck = toK(goal.z), rc = Math.ceil(goal.r / C), seen = new Set(), stack = [];
  for (let di = -rc; di <= rc; di++) for (let dk = -rc; dk <= rc; dk++) for (const c of surfacesIn(ns, ci + di, ck + dk, goal.y - goal.dy, goal.y + goal.dy)) if (atGoal(c, goal) && !seen.has(c.key)) { seen.add(c.key); stack.push(c); }
  return { seen, stack, n: 0, done: !stack.length, sealed: !stack.length, start: s.start.key };   // (nothing to stand on near the goal at all: sealed)
}
function stepFlood(ns, f, max) {
  for (let q = 0; q < max && !f.done; q++) {
    if (!f.stack.length) { f.done = true; f.sealed = true; return; }
    const r = f.stack.pop(); if (r.key === f.start) { f.done = true; f.sealed = false; return; }
    if (++f.n > 3500) { f.done = true; f.sealed = false; return; }   // both ends are big: not proven
    for (const e of neighbors(ns, r)) if (!f.seen.has(e.to.key)) { f.seen.add(e.to.key); f.stack.push(e.to); }
  }
}
// one slice of work on a pending request; true when it has finished
function advance(ns, ent, max) {
  const s = ent.search;
  if (!s.done) { s.step(max); if (!s.done) return false; }
  if (!s.found && s.capped && !ent.flood) ent.flood = startFlood(ns, s);
  if (ent.flood && !ent.flood.done) { stepFlood(ns, ent.flood, max); if (!ent.flood.done) return false; }
  finish(ns, ent); return true;
}
function finish(ns, ent) {
  const s = ent.search; ent.search = null;
  // out of nodes with the goal not found: unless the goal's side is sealed, a long errand goes on in legs, to the node that came closest
  if (!s.found && s.capped && !(ent.flood && ent.flood.sealed) && s.best !== s.start && s.bestH < heur(s.start, s.goal) - 1.5) { s.found = s.best; ent.partial = true; ent.bestH = s.bestH; }
  if (s.found) { const r = s.result(); ent.state = 'ok'; ent.ok = true; ent.complete = !ent.partial; ent.steps = r.steps; ent.len = r.len; ent.why = ''; }
  else { ent.state = 'none'; ent.ok = false; ent.steps = []; ent.len = 0; ent.capped = s.capped; ent.why = why(ns, s.start, s.goal); ns.st.fails++; }
}
function runSync(ns, ent) { const t0 = nowMs(); while (ent.search && !advance(ns, ent, 256)); ns.st.ms += nowMs() - t0; }
// the search for (start, goal): from the cache, or a new one (queued, or run now with opts.sync)
function request(ns, start, goal, opts) {
  const ck = start.key + '>' + goalSig(goal) + (opts.cap ? '#' + opts.cap : '');
  let ent = ns.cache.get(ck);
  if (ent) { ns.st.hits++; if (ent.state === 'pending' && opts.sync) runSync(ns, ent); return ent; }
  ns.st.misses++; ns.st.searches++;
  ent = { key: ck, ver: ns.ver, state: 'pending', ok: false, steps: [], len: 0, why: '', capped: false, search: new Search(ns, start, goal, opts.cap || NODE_CAP), goal, start };
  if (ns.cache.size >= CACHE_MAX) { const first = ns.cache.keys().next().value; ns.cache.delete(first); }
  ns.cache.set(ck, ent);
  if (opts.sync) runSync(ns, ent); else ns.queue.push(ent);
  return ent;
}
export function pathTo(bot, target, opts = {}) {
  if (!G) return { ok: false, state: 'none', steps: [], len: 0, why: 'not installed' };
  const ns = NS(G); links(ns);
  const p = pos3(bot), start = startRec(ns, p);
  if (!start) return { ok: false, state: 'none', steps: [], len: 0, why: 'The bot has nothing to stand on', ver: ns.ver };
  return request(ns, start, makeGoal(target, opts), opts);
}
export function reachable(from, to, opts = {}) { const r = pathTo(from, to, { ...opts, sync: true }); return !!r.ok && !r.partial; }
export const stepList = (path) => (path && path.steps ? path.steps.map((s) => ({ x: s.rec.x, y: s.rec.y, z: s.rec.z, kind: s.kind, ...(s.rec.virt ? { lift: s.rec.lift, row: s.rec.row } : {}), ...(s.e && s.e.lift !== undefined ? { lift: s.e.lift, row: s.e.row } : {}), ...(s.rec.door ? { door: s.rec.door.id } : {}) })) : []);
export function legs(path) {
  const out = [];
  for (const s of stepList(path)) {
    if (s.kind === 'start') continue;
    const prev = out[out.length - 1], same = prev && prev.kind === s.kind && s.kind !== 'ride' && s.kind !== 'cabIn' && s.kind !== 'cabOut' && s.kind !== 'ladder';
    if (same) { prev.to = [s.x, s.y, s.z]; prev.n++; }
    else { const f = prev ? prev.to : stepList(path)[0] ? [stepList(path)[0].x, stepList(path)[0].y, stepList(path)[0].z] : [s.x, s.y, s.z]; out.push({ kind: s.kind, from: f, to: [s.x, s.y, s.z], n: 1, ...(s.lift !== undefined ? { lift: s.lift, row: s.row } : {}) }); }
  }
  for (const l of out) { l.len = Math.hypot(l.to[0] - l.from[0], l.to[2] - l.from[2]); l.rise = l.to[1] - l.from[1]; }
  return out;
}
export const graph = {
  nodeAt(pos) { if (!G) return null; const ns = NS(G), p = pos3(pos); return startRec(ns, p); },
  neighbors(node) { if (!G) return []; const ns = NS(G); links(ns); return neighbors(ns, node).map((e) => ({ to: e.to, kind: e.kind, cost: e.cost })); },
  surfacesAt(i, k, ylo = 0, yhi = 60) { if (!G) return []; const ns = NS(G); links(ns); return surfacesIn(ns, i, k, ylo, yhi); },
};
export function isGround(pos) { if (!G) return true; const ns = NS(G); links(ns); const p = pos3(pos), r = startRec(ns, p); return !!r && r.t === T_GROUND; }
export function nearestSafeDown(pos, maxDown = 10) {
  if (!G) return null; const ns = NS(G); links(ns); const p = pos3(pos), ci = toI(p.x), ck = toK(p.z); let best = null, bd = 1e9;
  for (let r = 0; r <= 2; r++) for (let di = -r; di <= r; di++) for (let dk = -r; dk <= r; dk++) {
    if (Math.max(Math.abs(di), Math.abs(dk)) !== r) continue;
    const cs = surfacesIn(ns, ci + di, ck + dk, p.y - maxDown, p.y + 0.6); if (!cs.length) continue;
    cs.sort((a, b) => b.y - a.y);
    const d = r * 10 + (p.y - cs[0].y); if (d < bd) { bd = d; best = cs[0]; }
  }
  return best ? { x: best.x, y: best.y, z: best.z, built: best.t !== T_GROUND } : null;
}

// ====================================================================================================================================================
// the frame: the signature poll, the search queue and the bots
// ====================================================================================================================================================
function signature(ns) {
  const g = ns.g; let s = '';
  for (const it of g.machines.items.values()) {
    const e = it.ent;
    if (e.type === 'plift') s += `L${e.id}:${(e.pw ?? 0) > 0.05 ? 1 : 0}:${TR.floorsOf(g, e).join('.')}:${e.cut ? 1 : 0};`;
    else if (e.type === 'door') s += `D${e.id}:${e.lock}:${(e.pw ?? 0) > 0.05 ? 1 : 0}:${(e.pw ?? 0) > 0.05 ? '' : e.p >= 0.999 && e.tgt ? 'o' : 'c'};`;
  }
  if (ST.ladders) for (const L of ST.ladders(g).values()) s += `H${L.id};`;
  return s;
}
// once a frame, from Crew.update before the bots think
export function tick(g, dt) {
  G = g; if (!ON) return;
  const t0 = nowMs();
  const ns = NS(g);
  ns.sigT -= dt;
  if (ns.sigT <= 0) { ns.sigT = 0.25; const s = signature(ns); if (s !== ns.sig) { if (ns.sig !== '' ) bump(ns, 'signature'); ns.sig = s; } }
  // searches in the queue, oldest first, within the budget
  let left = BUDGET_MS;
  while (ns.queue.length && left > 0) {
    const ent = ns.queue[0];
    if (!ent.search) { ns.queue.shift(); continue; }
    const a = nowMs(), fin = advance(ns, ent, 48); left -= nowMs() - a;
    if (fin) ns.queue.shift();
  }
  // the bots that a door or a cab must see (a door never closes on a bot, a cab never comes down on one)
  const bp = g._botPeople || (g._botPeople = []); bp.length = 0;
  for (const b of g.S.crew || []) { const s = BSM.get(b); if (s && (s.macro || s.path)) bp.push(b); }
  ns.st.frames++; ns.st.frameMs += nowMs() - t0;
}


// ====================================================================================================================================================
// the bot
// ====================================================================================================================================================
function bs(b) {
  let s = BSM.get(b);
  if (!s) { s = { path: null, ent: null, si: 0, ver: 0, from: null, p: 0, cur: null, macro: false, lf: null, fail: null, failedAt: -99, code: 0, here: null, hereT: -9, climbing: false, hop: 0, kin: false, doorOpened: null, said: new Map(), wait: 0, pendT: 0 }; BSM.set(b, s); }
  return s;
}
export const codeOf = (b) => { const s = b ? BSM.get(b) : null; return s ? s.code : ((b && b.nvc) | 0); };
export const statusText = (b) => TEXT[codeOf(b)] || '';
export function resetBot(b) { BSM.delete(b); }

// where a bot's errand ends, as a goal (null: not an errand this layer drives)
function errand(crew, b) {
  const g = crew.game;
  switch (b.state) {
    case 'fwalk': case 'fgive': { const j = b.fuelJob, t = j ? g.logi.byId.get(j.id) : null; return t ? { x: cellX(t.i), y: t.j * C, z: cellZ(t.k), r: 1.6, dy: 0.35, floor: true } : null; }
    case 'chgwalk': case 'recharge': { const t = b.chg ? g.logi.byId.get(b.chg) : null; return t ? { x: cellX(t.i), y: t.j * C, z: cellZ(t.k), r: 1.8, dy: 0.35, floor: true } : null; }
    case 'dwalk': case 'dgive': { const t = b.deliver ? g.logi.byId.get(b.deliver) : null; return t ? { x: cellX(t.i), y: t.j * C, z: cellZ(t.k), r: 1.8, dy: 0.35, floor: true } : null; }
    case 'return': case 'unload': { const h = crew.home(b); return { x: h.x, y: h.y || 0, z: h.z, r: 1.6, dy: 0.5, floor: true }; }
    case 'idle': case 'lowbat': { const h = crew.home(); return { x: h.x, y: h.y || 0, z: h.z, r: 3.2, dy: 0.5, floor: true }; }
    case 'haulgo': { const c = g.S[b.haulKey || 'cart']; return c ? { x: c.x, y: c.y || 0, z: c.z, r: 1.5, dy: 0.6, floor: true } : null; }
    case 'follow': { const pp = g.player.pos; return { x: pp.x, y: pp.y, z: pp.z, r: 1.8, dy: 0.6, follow: true }; }
  }
  return null;
}
const STEERED = new Set(['idle', 'lowbat', 'follow', 'haulgo']);

function toast(crew, b, s, sig, text) {
  const g = crew.game, key = text;
  if ((s.said.get(key) || -1e9) > g.time) return;
  s.said.set(key, g.time + 60);
  const no = text === 'No way up';
  g.ui.toast({ icon: '🤖', title: `${b.name}: ${no ? 'No way up' : text}`, text: no ? 'It found no walkable way there, so the old rules apply: it will not step off an edge, and it phases home if it stays stuck.' : 'It could not get there, so the old rules apply.', ms: 5000 });
}
function failNav(crew, b, s, sig, text, quiet) {
  const g = crew.game, ns = NS(g);
  s.path = null; s.ent = null; s.macro = false; s.lf = null; s.climbing = false; s.cur = null; s.hereT = -9;
  s.fail = { sig, until: g.time + 20, ver: ns.ver, why: text, quiet: !!quiet, stay: text !== 'No way up' }; s.code = quiet ? 0 : CODE.noway; s.failedAt = quiet ? -99 : g.time;
  if (!quiet) toast(crew, b, s, sig, text);
}
const speedOf = (crew, b) => (1.5 + b.level * 0.06) * (b.state === 'follow' ? 1.3 : 1);
function face(b, dx, dz, dt) { if (Math.hypot(dx, dz) > 0.02) b.yaw += (((Math.atan2(dx, dz) - b.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 14); }
function place(b, x, y, z) { b.x = x; b.y = y; b.z = z; b.vy = 0; b.stuckT = 0; b.lastX = undefined; }
function hold(b, s, waiting) { b.tx = b.x; b.tz = b.z; b.vy = 0; s.kin = true; if (waiting) { b.stuckT = 0; b.lastX = undefined; } return 1; }

// where this bot stands, refreshed a few times a second
function here(ns, b, s, t) {
  if (t - s.hereT < 0.12 && s.here !== undefined) return s.here;
  s.hereT = t; s.here = startRec(ns, b) || null; return s.here;
}
// a door near the straight way from the bot to the goal: on the pile floor a door is the one thing the old straight walk cannot do
function doorOnTheWay(ns, b, goal) {
  if (!ns.doors.length) return false;
  const dx = goal.x - b.x, dz = goal.z - b.z, L2 = dx * dx + dz * dz;
  for (const e of ns.doors) {
    const t = L2 > 1e-6 ? Math.max(0, Math.min(1, ((e.px - b.x) * dx + (e.pz - b.z) * dz) / L2)) : 0;
    if (Math.hypot(b.x + dx * t - e.px, b.z + dz * t - e.pz) < 3.2 && Math.abs(e.y0 - b.y) < 2.5) return true;
  }
  return false;
}
const farFrom = (s, goal) => { if (!goal.follow) return false; const end = s.path[s.path.length - 1].rec; return Math.hypot(end.x - goal.x, end.z - goal.z) > goal.r + 2.2 || Math.abs(end.y - goal.y) > goal.dy + 1.0; };

// the one entry point: drive a bot to the goal, or say that the old code may. 0 the old code, 1 handled this frame, 2 arrived.
function engage(crew, b, goal, dt) {
  const g = crew.game; if (g.isGuest && g.isGuest()) return 0;
  const ns = NS(g), s = bs(b); links(ns);
  const t0 = nowMs();
  try { return engage2(crew, g, ns, b, s, goal, dt, g.time); } finally { ns.st.frameMs += nowMs() - t0; }
}
function engage2(crew, g, ns, b, s, goal, dt, t) {
  const r = engage3(crew, g, ns, b, s, goal, dt, t);
  if (g._navDbg) g._navDbg.push([+t.toFixed(2), b.id, b.state, r, s.path ? 'path' + s.si + '/' + s.path.length : s.macro ? 'macro' : '-', s.code]);
  return r;
}
function engage3(crew, g, ns, b, s, goal, dt, t) {
  const sig = goalSig(goal);
  if (!s.path && !s.macro) s.code = t - s.failedAt <= 8 ? CODE.noway : 0;
  // a path that no longer serves: a new version, or an errand that ended somewhere else (a follow target that moved on)
  if (s.path && !s.macro && !s.climbing) {
    // a path that no longer serves: a new version, another errand, a follow target that moved on, a bot that was moved (phased, pushed) or left alone for a while
    const moved = Math.hypot(b.x - s.from.x, b.z - s.from.z) > 2.2 || Math.abs(b.y - s.from.y) > 1.2 || t - (s.drove ?? -9) > 1.5;
    if (s.ver !== ns.ver || moved || (goal.follow ? farFrom(s, goal) : s.goalKey !== sig)) { s.path = null; s.ent = null; s.hereT = -9; }
  }
  if (!s.path && !s.macro && t < s.skipT && s.skipSig === sig && s.skipVer === ns.ver && !(b.stuckT > 2.5) && !(s.here && s.here.t !== T_GROUND)) return 0;   // (a bot on the pile floor with an errand on the pile floor: looked at a moment ago)
  if (!s.path && !s.macro) {
    let me = here(ns, b, s, t); const cab = !me ? cabAt(ns, b.x, b.y, b.z) : null;
    if (!me && s.cur && Math.hypot(b.x - s.cur.x, b.z - s.cur.z) < 1.0 && Math.abs(b.y - s.cur.y) < 0.6) me = s.cur;   // between two nodes of a path that was dropped: the last node still stands for the bot
    const elevated = !!cab || (!!me && me.t !== T_GROUND);
    if (s.fail && s.fail.sig === sig && s.fail.ver === ns.ver && t < s.fail.until) { s.code = s.fail.quiet ? 0 : CODE.noway; return elevated || s.fail.stay ? hold(b, s) : 0; }
    const dst = snap(ns, goal.x, goal.y, goal.z, 0.9, 0.9);
    if (!elevated && !(dst && dst.t !== T_GROUND) && !doorOnTheWay(ns, b, goal) && !(b.stuckT > 2.5)) { s.skipT = t + 0.3; s.skipSig = sig; s.skipVer = ns.ver; return 0; }       // the pile floor to the pile floor: the old code walks it (unless a door is on the way, or it has stood against something for a while); not asked again for a moment
    if (!me) { if (cab) { b.y = cab.cy; return hold(b, s, true); } if (t - (s.drove ?? -9) < 1.0) return hold(b, s, true); return 0; }     // not on anything this layer knows (falling, inside a wall): the old code; in a cab between stops: wait for it
    if (atGoal(me, goal)) { s.code = 0; return 2; }
    const ent = request(ns, me, goal, {});
    if (ent.state === 'pending') { s.pendT += dt; if (s.pendT > 0.4) s.code = CODE.finding; if (s.pendT > 5) { s.pendT = 0; failNav(crew, b, s, sig, 'No way up'); return elevated ? hold(b, s) : 0; } return hold(b, s, true); }
    s.pendT = 0;
    if (ent.partial && s.prog !== undefined && ent.bestH > s.prog - 0.3) { s.prog = undefined; failNav(crew, b, s, sig, 'No way up'); return elevated ? hold(b, s) : 0; }   // a leg that gets no closer: it is going round in circles
    if (ent.state === 'none') { const w = ent.why || 'No way up'; failNav(crew, b, s, sig, w, !elevated && w === 'No way up' && !(dst && dst.t !== T_GROUND)); return elevated || w !== 'No way up' ? hold(b, s) : 0; }   // (a lock or a dead lift or door holds the bot where it stands; a bot on the pile floor that is merely stuck says nothing and walks the old way)
    if (ent.steps.length < 2) { s.code = 0; return 2; }
    s.path = ent.steps; s.ent = ent; s.si = 1; s.ver = ns.ver; s.goalKey = sig; s.from = { x: b.x, y: b.y, z: b.z }; s.p = 0; s.cur = me; s.fail = null; s.wait = 0; s.climbing = false;
  }
  return follow(crew, g, ns, b, s, dt, goal);
}

// one frame along the path
function follow(crew, g, ns, b, s, dt, goal) {
  if (s.si >= s.path.length) return done(crew, b, s);
  const step = s.path[s.si], R = step.rec;
  s.kin = true; b.vy = 0; s.drove = g.time;
  if (!s.macro) s.code = 0;
  // never step onto a node whose floor is gone (digging does not move the version): ask again from here
  if (s.p === 0 && !s.macro && !R.virt && step.kind !== 'ladder' && step.kind !== 'cabOut' && !surfacesIn(ns, R.i, R.k, R.y - 0.05, R.y + 0.05).length) { s.path = null; s.ent = null; s.hereT = -9; bump(ns, 'step'); return hold(b, s, true); }   // (the graph is stale, a plush wall or a dug floor: a new version, or the cache would hand the same path back for ever)
  if (step.kind === 'cabIn') return liftMacro(crew, g, ns, b, s, dt, goal);
  if (step.kind === 'ladder') {
    if (!s.climbing && s.p === 0 && ladderBusy(g, b, step) && (s.lwait = (s.lwait || 0) + dt) < 20) return hold(b, s, true);   // one bot on a ladder at a time (a bot that waited 20 s climbs anyway: a claim must never hang a crew)
    s.lwait = 0; return ladderStep(crew, g, ns, b, s, dt, step);
  }
  return walkStep(crew, g, ns, b, s, dt, step, goal);
}
// another bot is on this ladder right now (its path says so and it was driven this very moment)
function ladderBusy(g, b, step) {
  const id = step.e && step.e.ladder; if (id === undefined) return false;
  for (const o of g.S.crew || []) { if (o === b) continue; const t = BSM.get(o); if (t && t.climbing && t.lad === id && g.time - (t.drove ?? -9) < 0.5) return true; }
  return false;
}
function done(crew, b, s) {
  const partial = !!(s.ent && s.ent.partial); s.prog = partial ? s.ent.bestH : undefined;
  s.path = null; s.ent = null; s.climbing = false; s.code = 0; s.cur = null; s.hereT = -9; s.macro = false;
  if (s.doorOpened) closeDoor(s);
  b.vy = 0; b.tx = b.x; b.tz = b.z; s.kin = true;
  return partial ? 1 : 2;   // a leg of a long errand: the next frame plans the next one from here
}
function closeDoor(s) { const e = s.doorOpened; s.doorOpened = null; if (e && !e.auto && (e.pw ?? 0) > 0.05) e.tgt = 0; }
// a door that is closed: a powered one is told to open and the bot waits; a key lock stays shut and a dead one needs a hand crank, which a bot has no hands for
function openDoor(crew, b, s, e, dt) {
  if (e.p >= 0.999 && e.tgt) { e.idle = 0; s.wait = 0; return true; }
  if (e.lock === 'key' || !((e.pw ?? 0) > 0.05)) return false;
  if (!e.tgt) { e.tgt = 1; e.crank = false; s.doorOpened = e; }
  e.idle = 0; s.wait += dt; s.code = CODE.door; b.stuckT = 0; b.lastX = undefined;
  return false;
}
function walkStep(crew, g, ns, b, s, dt, step, goal) {
  const R = step.rec, f = s.from;
  if (R.door && !(s.path[s.si - 1] && s.path[s.si - 1].rec.door === R.door)) {   // a door on the way: open before the bot enters it
    const e = entOf(g, R.door.id) || R.door;
    if (!openDoor(crew, b, s, e, dt)) {
      if (!((e.pw ?? 0) > 0.05) || e.lock === 'key') { failNav(crew, b, s, goalSig(goal), e.lock === 'key' ? 'A door with a key lock is in the way' : 'A door has no power'); return hold(b, s); }
      if (s.wait > WAIT_DOOR) { failNav(crew, b, s, goalSig(goal), 'A door will not open'); return hold(b, s); }
      return hold(b, s, true);
    }
  }
  const dx = R.x - f.x, dz = R.z - f.z, hl = Math.hypot(dx, dz), seg = Math.max(hl, 0.05);
  const slow = step.kind === 'stair' ? 0.8 : step.kind === 'ramp' ? 0.9 : step.kind === 'step' ? 0.85 : 1;
  s.p = Math.min(1, s.p + speedOf(crew, b) * slow * dt / seg);
  const p = s.p;
  s.hop = step.kind === 'stair' ? Math.sin(p * Math.PI) * 0.05 : step.kind === 'step' ? Math.sin(p * Math.PI) * 0.09 : 0;
  if (step.kind === 'ramp') s.code = CODE.ramp; else if (step.kind === 'stair') s.code = CODE.stair;
  face(b, dx, dz, dt);
  b.x = f.x + dx * p; b.z = f.z + dz * p; b.y = f.y + (R.y - f.y) * p; b.vy = 0; b.tx = R.x; b.tz = R.z;
  b.battery -= dt * 0.004 / g.T.crewBattery;
  if (p >= 1) {
    place(b, R.x, R.y, R.z); s.cur = R; s.si++; s.from = { x: R.x, y: R.y, z: R.z }; s.p = 0; s.hop = 0; s.hereT = -9;
    if (s.doorOpened && !R.door && !(s.path[s.si] && s.path[s.si].rec.door)) closeDoor(s);
    if (s.si >= s.path.length) return done(crew, b, s);
  }
  return 1;
}
// a ladder: up the rungs at the foot cell, then a short step onto the plate; down is the same the other way round
function ladderStep(crew, g, ns, b, s, dt, step) {
  const R = step.rec, f = s.from, up = R.y > f.y;
  s.climbing = true; s.code = CODE.ladder; s.lad = step.e ? step.e.ladder : undefined;
  const hz = Math.max(0.05, Math.hypot(R.x - f.x, R.z - f.z)), rise = Math.abs(R.y - f.y), travel = rise + hz;
  s.p = Math.min(1, s.p + 1.5 * dt / travel);
  const d = s.p * travel;
  if (up) {
    if (d <= rise) { b.x = f.x; b.z = f.z; b.y = f.y + d; }
    else { const q = (d - rise) / hz; b.x = f.x + (R.x - f.x) * q; b.z = f.z + (R.z - f.z) * q; b.y = R.y; }
  } else if (d <= hz) { const q = d / hz; b.x = f.x + (R.x - f.x) * q; b.z = f.z + (R.z - f.z) * q; b.y = f.y; }
  else { b.x = R.x; b.z = R.z; b.y = Math.max(R.y, f.y - (d - hz)); }
  face(b, up ? R.x - f.x : f.x - R.x, up ? R.z - f.z : f.z - R.z, dt);
  b.vy = 0; b.tx = b.x; b.tz = b.z;
  b.battery -= dt * 0.006 / g.T.crewBattery;
  if (s.p >= 1) {
    place(b, R.x, R.y, R.z); s.cur = R; s.si++; s.from = { x: R.x, y: R.y, z: R.z }; s.p = 0; s.climbing = false; s.code = 0; s.hereT = -9;
    if (s.si >= s.path.length) return done(crew, b, s);
  }
  return 1;
}
// the elevator: stand at the panel, call, wait, step in, ask for the floor, ride, step out
function liftMacro(crew, g, ns, b, s, dt, goal) {
  const path = s.path, inStep = path[s.si], rideStep = path[s.si + 1], outStep = path[s.si + 2];
  const e = entOf(g, inStep.rec.lift), sig = goalSig(goal);
  const quit = (why) => { s.lf = null; s.macro = false; failNav(crew, b, s, sig, why); return hold(b, s); };
  if (!e || !rideStep || rideStep.kind !== 'ride' || !outStep) return quit('No way up');
  const r1 = inStep.rec.row, r2 = rideStep.rec.row;
  if (!s.lf) s.lf = { phase: 'call', callT: 0, t: 0, reqT: 0, ox: ((b.id % 3) - 1) * 0.35, oz: (((b.id >> 1) % 3) - 1) * 0.35 };
  const L = s.lf; s.macro = true; s.kin = true; b.vy = 0; L.t += dt; b.stuckT = 0; b.lastX = undefined;
  const powered = (e.pw ?? 0) > 0.05, at = (r) => Math.abs(e.cy - r * C) < 0.04 && e.tg === null && !e.mv;
  if (!powered && L.phase !== 'riding') return quit('The lift has no power');
  if (L.phase === 'call') {
    s.code = CODE.lift; b.tx = b.x; b.tz = b.z;
    if (at(r1)) { L.phase = 'board'; L.t = 0; return 1; }
    L.callT -= dt;
    if (L.callT <= 0) { L.callT = 4; const r = TR.requestFloor(g, e, r1); if (r !== 'ok' && r !== 'here' && r !== 'queued') return quit('The lift will not come'); }
    if (L.t > WAIT_LIFT) return quit('The lift never came');
    return 1;
  }
  if (L.phase === 'board') {
    s.code = CODE.lift;
    if (!at(r1) && Math.hypot(b.x - e.px, b.z - e.pz) > HALF - 0.1) { L.phase = 'call'; L.callT = 0; return 1; }   // it left before the bot was in
    const tx = e.px + L.ox, tz = e.pz + L.oz, dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz), v = speedOf(crew, b) * 0.9 * dt;
    if (d > v) { b.x += dx / d * v; b.z += dz / d * v; face(b, dx, dz, dt); } else { b.x = tx; b.z = tz; L.phase = 'dest'; L.t = 0; }
    b.y = e.cy; b.tx = b.x; b.tz = b.z;
    return 1;
  }
  b.y = e.cy; b.x = e.px + L.ox; b.z = e.pz + L.oz; b.tx = b.x; b.tz = b.z;
  if (L.phase === 'dest') {
    const r = TR.requestFloor(g, e, r2);
    if (r !== 'ok' && r !== 'queued' && r !== 'here') return quit('The lift will not go there');
    L.phase = 'riding'; L.t = 0; L.reqT = 4; s.code = CODE.ride; return 1;
  }
  s.code = CODE.ride;
  if (at(r2)) { s.si += 2; s.from = { x: b.x, y: e.cy, z: b.z }; s.p = 0; s.macro = false; s.lf = null; s.code = 0; s.cur = rideStep.rec; s.hereT = -9; return 1; }
  L.reqT -= dt;
  if (L.reqT <= 0 && e.tg === null && !e.mv) { L.reqT = 4; TR.requestFloor(g, e, r2); }
  if (L.t > WAIT_LIFT) return quit('The lift stopped');
  return 1;
}

// ---- the crew.js entry points ----
// the waypoint states (return, fwalk, chgwalk, dwalk): 0 the old code walks it, 1 handled, 2 arrived (the caller ends the walk)
export function walk(crew, b, dt) {
  if (!ON) return 0;
  const goal = errand(crew, b); if (!goal) return 0;
  const s = bs(b);
  if (!s.path && !s.macro) {   // on the pile floor with trail points left to walk: the old code walks the trail, this layer takes the last stretch
    const g = crew.game, ns = NS(g), me = here(ns, b, s, g.time);
    if (b.pi < b.path.length - 1 && !cabAt(ns, b.x, b.y, b.z) && (!me || me.t === T_GROUND)) return 0;
  }
  return engage(crew, b, goal, dt);
}
// idle, follow, haul and the low battery wait, after the state's own think: 2 means 'there already' and the bot stays put
export function steer(crew, b, dt) {
  if (!ON || !STEERED.has(b.state)) return 0;
  const goal = errand(crew, b); if (!goal) return 0;
  const r = engage(crew, b, goal, dt);
  if (r === 2) { const s = bs(b); b.tx = b.x; b.tz = b.z; s.kin = true; }
  return r;
}
// move(): true when this layer placed the bot this frame
export function took(b) { const s = BSM.get(b); if (s && s.kin) { s.kin = false; return true; } return false; }
// an elevated bot never steps where there is nothing to stand on (the old movement code, for the states this layer does not drive). The old physics only knows cells, so a ramp or
// stair surface is no floor for it, and a spot whose edge is closer than the bot's body is no floor either.
const floorAt = (ns, x, y, z) => { const cs = surfacesIn(ns, toI(x), toK(z), y - STEP_UP, y + STEP_UP); for (const c of cs) if (c.t <= T_FLOOR) return true; return false; };
const MARGIN = [[0, 0], [0.28, 0], [-0.28, 0], [0, 0.28], [0, -0.28]];
export function supported(crew, b, x, z) {
  if (!ON) return true;
  const g = crew.game, ns = NS(g), s = bs(b); links(ns); const me = here(ns, b, s, g.time);
  if (!me || me.t === T_GROUND) return true;
  let ok = true; for (const [ox, oz] of MARGIN) if (!floorAt(ns, x + ox, b.y, z + oz)) { ok = false; break; }
  if (ok) return true;
  let now = true; for (const [ox, oz] of MARGIN) if (!floorAt(ns, b.x + ox, b.y, b.z + oz)) { now = false; break; }
  return !now && floorAt(ns, x, b.y, z);   // already on the rim: it may still move on to a spot that has a floor under its middle
}
export function elevated(crew, b) { const g = crew.game, ns = NS(g), s = bs(b); links(ns); const me = here(ns, b, s, g.time); return !!me && me.t !== T_GROUND; }

// ---- the look: a lean into a ramp, a hop on a stair, a climb on a ladder (the host from its own state, a guest from how the bot moves) ----
const LOOK = new WeakMap();
export function pose(b, o, dt, time) {
  let L = LOOK.get(b); if (!L) { L = { x: b.x, y: b.y, z: b.z, pitch: 0 }; LOOK.set(b, L); }
  const s = BSM.get(b), dx = b.x - L.x, dz = b.z - L.z, dy = b.y - L.y, hd = Math.hypot(dx, dz);
  L.x = b.x; L.y = b.y; L.z = b.z;
  const code = s ? s.code : (b.nvc | 0);
  let want = 0, hop = 0;
  if ((code === CODE.ramp || code === CODE.stair) && hd > 0.0005 && dt > 0 && hd / dt < 6) want = Math.max(-0.45, Math.min(0.45, Math.atan(dy / hd) * 0.9));
  if (code === CODE.ladder) want = -0.15;
  if (s && s.hop) hop = s.hop; else if (!s && code === CODE.stair && hd > 0.0005) hop = Math.abs(Math.sin(time * 9 + b.id)) * 0.04;
  L.pitch += (want - L.pitch) * Math.min(1, dt * 8);
  o.rotation.order = 'YXZ'; o.rotation.x = -L.pitch;
  o.position.y = b.y + hop;
  if (code === CODE.ladder) { for (const [n, ph] of [['armL', 0], ['armR', Math.PI]]) { const a = o.getObjectByName(n); if (a) a.rotation.x = -0.9 + Math.sin(time * 10 + ph) * 0.7; } o.position.y = b.y + Math.abs(Math.sin(time * 5)) * 0.03; }
}

// ---- the call routes (botroutes.js): the same layer, asked in three more ways ----
// no way at all to a goal (a proven answer from a synchronous search, cached per version); null when there is one, or when the bot has nothing to stand on yet
export function noWay(from, to, opts = {}) { const r = pathTo(from, to, { ...opts, sync: true }); return r.state === 'none' && r.why !== 'The bot has nothing to stand on' ? r : null; }
// drive a bot to a goal whatever its state is (a bot that is on its way down to the ground after an errand): 0 the old code may, 1 handled this frame, 2 arrived
export function drive(crew, b, goal, dt) { if (!ON) return 0; return engage(crew, b, goal, dt); }
// is the bot on a node of the graph, between nothing and nothing (not riding a cab, not on a ladder, not falling)? Only then is a new path a fair question
export function onNode(crew, b) { const g = crew.game, ns = NS(g), s = bs(b); if (s.macro || s.climbing) return false; links(ns); return !!here(ns, b, s, g.time); }
// standing on the pile floor or the hall floor, at rest on it (a leg of a ladder or a cab ride is not)
export function groundNow(crew, b) {
  const g = crew.game, ns = NS(g), s = bs(b); if (s.macro || s.climbing || cabAt(ns, b.x, b.y, b.z)) return false;
  links(ns); const me = here(ns, b, s, g.time); return !!me && me.t === T_GROUND && Math.abs(b.y - me.y) < 0.45;
}
