import * as THREE from 'three';
import { C, cellX, cellZ, toI, toJ, toK } from './config.js';
import { isEarth, EARTH } from './earth.js';
import { partOf as beltPartOf } from './beltdata.js';
import { PARTS as BELT_PARTS } from './splitparts.js';
import { maxPorts, wireCheck, isPart, partName, genKindOf } from './powerparts.js';
import { drawsPower, catalogType } from './catalog.js';
import { gridOfNode, deadReason } from './gridinfo.js';

// ---------------------------------------------------------------------------------------------------
// Hand-wired power cables: the ONLY way power travels. Equip a Power Cable, click a node or a machine, then click a second one.
//   * Nodes (generators of every rung, poles, batteries, breakers) join a grid only through cables. There is no range link and no plug-in reach.
//   * Every machine needs its own cable to a node: a machine standing next to a pole or a generator gets nothing.
//   * A Power Pole has no power of its own: it is a hub, dead until a cable path joins it to a generator (or a charged battery). Run more wire from it.
//   * One exception keeps belts practical: a connected belt line (belt tiles that hand plush to one another: ramps, lifts, underground
//     tiles, hoses, splitters and mergers included) is ONE load and ONE cable endpoint. A cable on any tile powers the whole line and
//     the line's demand is the sum of its tiles (see beltLine below; the readout says "Line powered through a cable at tile ...").
//   * A cable spans at most T.cableLen metres (14 m, Grid Range and Superconducting Poles lengthen it).
// The records live in S.cables = [{ id, a, b }] (entity ids), so they save with the game. The host simulates them
// (power.js reads them), a guest draws the host's list and sends a command to wire or unwire.
// ---------------------------------------------------------------------------------------------------
export const CABLE_BASE_LEN = 14;     // metres; Grid Range and Superconducting Poles raise T.cableLen above this
export const cableMax = (T) => (T && Number.isFinite(T.cableLen) ? T.cableLen : CABLE_BASE_LEN);
const NODE = new Set(['gen', 'pole', 'switch', 'battery', 'breaker']);   // switch, battery and breaker: the power parts of powerparts.js
const CONSUMER = new Set(['belt', 'sorter', 'mech', 'fan', 'charger', 'claw', 'borer', 'beacon', 'meter', 'hlamp', 'vscan']);
export const isNodeType = (type) => NODE.has(type);
// A consumer is any wireable thing that is not a node (a switch is a node-like part that joins two grids, see power.js)
export const isConsumerEnt = (e) => !!e && !NODE.has(e.type);

// ---------- belt lines: the one place the "a line is one load, one endpoint" rule lives ----------
// A belt line is the chain of belt tiles that hand plush to one another (nextOf), however it bends, climbs or goes underground, with
// every merger and splitter branch it touches. A cable ending on any tile powers every tile of the line; the line draws the sum of its tiles.
export function beltRev(g) {
  const rev = new Map(), L = g.logi;
  for (const t of L.tiles.values()) {
    if (t.type !== 'belt') continue;
    const nx = L.nextOf(t);
    if (nx && nx.type === 'belt') { let a = rev.get(nx.id); if (!a) rev.set(nx.id, a = []); a.push(t); }
  }
  return rev;
}
export function beltLine(g, t, rev) {
  rev = rev || beltRev(g);
  const L = g.logi, seen = new Set([t.id]), out = [t], stack = [t];
  while (stack.length) {
    const c = stack.pop(), nx = L.nextOf(c), r = rev.get(c.id);
    if (nx && nx.type === 'belt' && !seen.has(nx.id)) { seen.add(nx.id); out.push(nx); stack.push(nx); }
    if (r) for (const x of r) if (!seen.has(x.id)) { seen.add(x.id); out.push(x); stack.push(x); }
  }
  return out;
}
// the line of a belt tile for a readout: { tiles, wired } where wired is the tile a cable ends on (or null). The adjacency is cached for half a second.
export function lineInfo(g, t, fresh) {
  const L = g.logi, now = g.time || 0;
  let c = g._beltRev;
  if (fresh || !c || c.L !== L || c.n !== L.tiles.size || Math.abs(now - c.at) > 0.5) c = g._beltRev = { L, n: L.tiles.size, at: now, rev: beltRev(g) };
  const tiles = beltLine(g, t, c.rev);
  let wired = null, rid = Infinity;
  if (g.cables) for (const x of tiles) for (const r of g.cables.of(x.id)) if (r.id < rid) { rid = r.id; wired = x; }
  return { tiles, wired };
}
// the tile named for a readout: its place on the floor grid
export const tileName = (t) => `${t.i - toI(0)}, ${t.k - toK(0)}`;

// ---------- the plug point: where a cable ends on a model (a small socket drawn there) ----------
const _Y = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];   // the model yaw of a tile's dir (logistics.js)
export function socketOf(power, e) {
  const p = power.pos(e);
  if (e.type === 'pole') return [p[0], (e.j || 0) * C + 1.45, p[2]];   // on the mast, just under the cross arm
  if (e.type === 'gen') {   // on the top corner of the body (the hopper and chimney sit on the other corners)
    const k = genKindOf(e).scale, yaw = _Y[e.dir || 0] || 0, lx = 0.2 * k, lz = 0.2 * k, c = Math.cos(yaw), s = Math.sin(yaw);
    return [p[0] + lx * c + lz * s, (e.j || 0) * C + 0.56 * k, p[2] - lx * s + lz * c];
  }
  return [p[0], p[1] + 0.1, p[2]];
}
export const wireable = (e) => !!e && (NODE.has(e.type) || CONSUMER.has(e.type) || isEarth(e.type) || drawsPower(e.type));   // any catalog machine that declares a demand (rail station, Leveling Pad, doors, lights, arches ...) takes a cable too
export function wireName(e) {
  if (!e) return 'something';
  if (e.type === 'belt') return e.detector ? 'Detector Gate' : BELT_PARTS[beltPartOf(e)] ? BELT_PARTS[beltPartOf(e)].name : e.splitter ? 'Belt Splitter' : 'Belt';
  if (e.type === 'fan') return e.mounted ? 'Support Fan' : 'Vent Fan';
  if (isEarth(e.type)) return EARTH[e.type].name;
  if (isPart(e.type)) return partName(e);
  { const h = catalogType(e.type); if (h && typeof h.wireName === 'function') { const n = h.wireName(e); if (n) return n; } }
  if (e.type === 'gen') return genKindOf(e).name;   // the generator ladder (Portable ... Titan Plant)
  return ({ hlamp: 'Hanging Lantern', gen: 'Generator', pole: 'Power Pole', sorter: 'Sorting Box', mech: 'Mech Scooper', charger: 'Charging Station', claw: 'Claw Rig', borer: 'Tunnel Borer', beacon: 'Depot Beacon' })[e.type] || e.type;
}

const SEGS = 12;
const MAXSEG = 24000;   // wire segments drawn in all (a short cable takes few: see segsFor), so a factory with a couple of thousand cables still draws every one
export const segsFor = (len) => Math.max(6, Math.min(SEGS, Math.ceil(len / 1.0)));
const GREEN = new THREE.Color(0.25, 1.6, 0.5), ORANGE = new THREE.Color(2.4, 1.05, 0.2), RED = new THREE.Color(2.4, 0.22, 0.18), WHITE = new THREE.Color(0.9, 1.2, 1.7);
export const stateOf = (pw) => ((pw ?? 0) >= 0.95 ? 'green' : (pw ?? 0) > 0.05 ? 'orange' : 'red');
const stateColor = (s) => (s === 'green' ? GREEN : s === 'orange' ? ORANGE : RED);
const GOLD = new THREE.Color(2.6, 1.9, 0.3), DARK = new THREE.Color(0.1, 0.11, 0.12), GREY = new THREE.Color(0.55, 0.57, 0.6), SPARK = new THREE.Color(3.2, 2.4, 0.9);
const HALO = { gold: GOLD, green: GREEN, red: RED, white: WHITE };
const MAXSOCK = 900, SOCK_R = 40, NEEDY_R = 14;   // sockets drawn: every node and cable end within 40 m, a machine with no cable within 14 m

export class Cables {
  constructor(game) {
    this.game = game;
    this.from = null;           // the entity id a wire is being pulled from (local to this player)
    this.netDirty = false;
    this.t = 0;
    this.hold = 0;              // seconds a result message (wired / removed) stays on screen before the aiming hint takes over
    this.drawDirty = true;
    this.preview = null;        // { a: [x,y,z], b: [x,y,z], state }
    const geo = new THREE.CylinderGeometry(0.022, 0.022, 1, 5);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAXSEG);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.setColorAt(0, GREEN);
    this.pmesh = new THREE.InstancedMesh(geo, mat.clone(), 40);
    this.pmesh.frustumCulled = false; this.pmesh.count = 0; this.pmesh.setColorAt(0, WHITE);
    game.renderer.scene.add(this.mesh); game.renderer.scene.add(this.pmesh);
    // plug points: a dark socket housing at every node and every cable end, with a small lamp (green live, orange weak, red dead, gold = a machine that needs a cable)
    this.sockHouse = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.085, 0.07, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXSOCK);
    this.sockLamp = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXSOCK);
    for (const m of [this.sockHouse, this.sockLamp]) { m.frustumCulled = false; m.count = 0; m.setColorAt(0, GREY); game.renderer.scene.add(m); }
    // the halo on the end under the crosshair (gold = a valid first end, green = a valid second end, red = it will not take the wire) and on the end the wire starts at
    const hmat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false, depthTest: false });
    this.haloMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), hmat()); this.haloMesh.visible = false; this.haloMesh.renderOrder = 20; this.haloMesh.frustumCulled = false;
    this.halo2Mesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), hmat()); this.halo2Mesh.visible = false; this.halo2Mesh.renderOrder = 20; this.halo2Mesh.frustumCulled = false;
    game.renderer.scene.add(this.haloMesh); game.renderer.scene.add(this.halo2Mesh);
    this.halo = null; this.halo2 = null; this.tool = false;
    // sparks on a weak (browned out) cable: a few short bright flecks that jump along it
    this.sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff }), 24);
    this.sparks.frustumCulled = false; this.sparks.count = 0; this.sparks.setColorAt(0, SPARK); game.renderer.scene.add(this.sparks);
    this.hot = []; this.sparkT = 0; this.sockT = 0; this.sockDirty = true;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._d = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
    this.segCount = 0;
  }

  // ---------------------------------------------------------------- records
  list() { const S = this.game.S; if (!Array.isArray(S.cables)) S.cables = []; return S.cables; }
  ent(id) { const g = this.game; const t = g.logi.byId.get(id); if (t) return t; const it = g.machines.items.get(id); return it ? it.ent : null; }
  rec(id) { return this.list().find((c) => c.id === id) || null; }
  find(a, b) { return this.list().find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a)) || null; }
  of(id) { return this.list().filter((c) => c.a === id || c.b === id); }
  // cables with both ends standing: [{ rec, A, B }]
  live() { const out = []; for (const rec of this.list()) { const A = this.ent(rec.a), B = this.ent(rec.b); if (A && B) out.push({ rec, A, B }); } return out; }
  other(rec, id) { return rec.a === id ? rec.b : rec.a; }
  attach(e) { return socketOf(this.game.power, e); }
  lengthBetween(A, B) { const a = this.attach(A), b = this.attach(B); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
  max() { return cableMax(this.game.T); }
  length(rec) { const A = this.ent(rec.a), B = this.ent(rec.b); return A && B ? this.lengthBetween(A, B) : 0; }

  get wiring() { return this.from != null; }

  // why a cable cannot join these two (null when it can): switch rules, machine to machine, a belt line that already has its cable, free sockets
  checkEnds(A, B, fresh = true) {   // (the aim passes false: it runs every frame, and the belt adjacency it needs may be half a second old. Laying the cable always checks fresh)
    const g = this.game;
    { const why = wireCheck(A, B); if (why) return why; }
    if (isConsumerEnt(A) && isConsumerEnt(B) && !(A.type === 'hlamp' && B.type === 'hlamp')) return `A machine takes its cable from a generator, pole, battery or breaker, not from another machine`;
    for (const E of [A, B]) { const lim = maxPorts(E, g); if (this.of(E.id).length >= lim) return `${wireName(E)} has no free cable socket (it takes ${lim})`; }
    for (const E of [A, B]) {
      if (E.type !== 'belt') continue;
      const li = lineInfo(g, E, fresh);
      if (li.wired) return `This belt line already has a cable at tile ${tileName(li.wired)}: a line takes one (a cable on any tile powers the whole line)`;
    }
    return null;
  }

  // host: is this guest command plausible? Two real ids, and the guest stands within reach of an end (the same 8 m the aim uses, plus a little for lag). null when fine.
  guestWhy(d) {
    if (!d || typeof d !== 'object' || !Number.isInteger(d.a) || !Number.isInteger(d.b)) return 'That is not a cable';
    const A = this.ent(d.a), B = this.ent(d.b); if (!A || !B) return 'That object is gone';
    return this.guestNear(A, B) ? null : 'You are too far away to wire that';
  }
  // host: does the guest stand within 14 m of one of these ends? (true when the host has no position for them to check against)
  guestNear(A, B) {
    const r = this.game.remote; if (!r || !r.pos || !Number.isFinite(r.pos.x + r.pos.z)) return true;
    const near = (E) => { const p = this.attach(E); return Math.hypot(p[0] - r.pos.x, p[2] - r.pos.z) <= 14 && Math.abs(p[1] - r.pos.y) <= 30; };
    return near(A) || near(B);
  }
  // host: may the guest take this cable down? Standing next to one of its ends, like laying it.
  guestMayRemove(id) { const rec = this.rec(id); if (!rec) return false; const A = this.ent(rec.a), B = this.ent(rec.b); return !A || !B || this.guestNear(A, B); }

  // ---------------------------------------------------------------- host: make / break cables
  // Wires a to b, or takes the cable between them away when one already runs there. Returns { ok, why, removed, rec, len }.
  connect(aId, bId) {
    const g = this.game, S = g.S;
    const A = this.ent(aId), B = this.ent(bId);
    if (!A || !B) return { ok: false, why: 'That object is gone' };
    if (aId === bId) return { ok: false, why: 'Pick a second object to wire it to' };
    if (!wireable(A) || !wireable(B)) return { ok: false, why: 'A cable only joins generators, poles and machines that use power' };
    const ex = this.find(aId, bId);
    if (ex) { this.remove(ex.id, true); return { ok: true, removed: true, a: A, b: B }; }
    { const why = this.checkEnds(A, B); if (why) return { ok: false, why }; }
    const len = this.lengthBetween(A, B), max = this.max();
    if (!(len <= max + 1e-6)) return { ok: false, why: Number.isFinite(len) ? `Too far: ${len.toFixed(1)} m, a cable is ${max.toFixed(0)} m at most` : 'That cannot be reached: its place is not known' };   // (a length that is not a number never passes)
    if (!((S.items.cable || 0) > 0)) return { ok: false, why: 'You have no Power Cable left' };
    S.items.cable--; if (S.items.cable <= 0) delete S.items.cable;
    const rec = { id: g.nextId(), a: aId, b: bId };
    this.list().push(rec);
    S.stats.cables = (S.stats.cables || 0) + 1;
    this.changed();
    g.rebuildTools();
    return { ok: true, rec, len, a: A, b: B };
  }

  remove(id, refund) {
    const list = this.list(), n = list.findIndex((c) => c.id === id);
    if (n < 0) return false;
    list.splice(n, 1);
    if (refund) this.game.giveItem('cable');
    this.changed();
    return true;
  }
  // several cables at once (a pole with ten cords taken down, a collapse): the grid is solved once, not once per cable. Returns how many were there.
  removeMany(ids, refund) {
    const set = new Set(ids), list = this.list(); let n = 0;
    for (let q = list.length - 1; q >= 0; q--) if (set.has(list[q].id)) { list.splice(q, 1); n++; if (refund) this.game.giveItem('cable'); }
    if (n) this.changed();
    return n;
  }

  // a tile was replaced by another (a belt turned into a merger): its cables now end on the new one
  rewire(oldId, newId) { const l = this.of(oldId); for (const c of l) { if (c.a === oldId) c.a = newId; if (c.b === oldId) c.b = newId; } if (l.length) this.changed(); }

  // an object went away: its cables go with it (and come back as items when you took it down yourself)
  detach(entId, refund) { this.removeMany(this.of(entId).map((c) => c.id), refund); }

  // drop cables whose end no longer stands (a collapse can destroy a machine without anyone taking it down)
  prune() { const dead = []; for (const c of this.list()) if (!this.ent(c.a) || !this.ent(c.b)) dead.push(c.id); if (dead.length) this.removeMany(dead, false); }

  changed() {
    const g = this.game;
    this.netDirty = true; this.drawDirty = true; this._pwForce = true;
    if (!g.isGuest()) { g.power.markDirty(); g.power.recompute(); }
  }

  reset() { this.hold = 0; this.from = null; this.preview = null; this.netDirty = false; this.drawDirty = true; this.mesh.count = 0; this.pmesh.count = 0; this.sockHouse.count = 0; this.sockLamp.count = 0; this.sparks.count = 0; this.hot = []; this.halo = null; this.halo2 = null; this.haloMesh.visible = false; this.halo2Mesh.visible = false; this.sockDirty = true; }
  clear() { this.reset(); }

  // a guest takes the host's list
  applyList(list) {
    const S = this.game.S, old = new Map((S.cables || []).map((c) => [c.id, c]));
    S.cables = (Array.isArray(list) ? list : []).map((c) => { const o = old.get(c.id); return { id: c.id, a: c.a, b: c.b, pw: o ? o.pw : 0 }; });
    this.drawDirty = true;
  }
  // power states from the host (flat [id, percent, ...])
  applyPw(a) { for (let n = 0; n + 1 < a.length; n += 2) { const r = this.rec(a[n]); if (r) r.pw = a[n + 1] / 100; } this.drawDirty = true; }
  // The power state of every cable, for the 0.17 s dyn message [id, percent, ...]. Only the cables whose state changed go out (a factory with a thousand cables would otherwise send
  // two thousand numbers six times a second to say nothing new); the whole list goes out again about every 3 s, and at once after the list changes, so a guest who just arrived catches up.
  pwRows() {
    const last = this._pwLast || (this._pwLast = new Map()), out = [], seen = new Set();
    this._pwN = this._pwN === undefined ? 0 : this._pwN + 1;
    const full = this._pwN % 18 === 0 || this._pwForce; this._pwForce = false;
    for (const { rec, A, B } of this.live()) { const v = Math.round(Math.max(A.pw || 0, B.pw || 0) * 100); seen.add(rec.id); if (full || last.get(rec.id) !== v) { out.push(rec.id, v); last.set(rec.id, v); } }
    for (const id of [...last.keys()]) if (!seen.has(id)) last.delete(id);
    return out;
  }
  pwOf(rec) { if (this.game.isGuest()) return rec.pw || 0; const A = this.ent(rec.a), B = this.ent(rec.b); return Math.max((A && A.pw) || 0, (B && B.pw) || 0); }

  // ---------------------------------------------------------------- the wire shape
  curve(a, b, n) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (n === undefined) n = segsFor(len);
    const sag = Math.min(1.6, 0.05 + 0.045 * len), pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      pts.push([a[0] + (b[0] - a[0]) * u, Math.max(0.03, a[1] + (b[1] - a[1]) * u - sag * 4 * u * (1 - u)), a[2] + (b[2] - a[2]) * u]);
    }
    return pts;
  }

  // the nearest cable under the crosshair: its wire, not its two ends (those belong to the machines they hang on). { id, t } or null
  hit(eye, dir, maxD = 5, maxT = Infinity) {
    let best = null;
    const ox = eye.x, oy = eye.y, oz = eye.z, dx = dir.x, dy = dir.y, dz = dir.z;
    for (const { rec, A, B } of this.live()) {
      const a = this.attach(A), b = this.attach(B), len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const endEx = Math.min(1.4, len * 0.3);   // the stretch next to a machine belongs to the machine
      const pts = this.curve(a, b);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i], p1 = pts[i + 1];
        // closest approach between the ray and this piece of wire
        const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], wx = ox - p0[0], wy = oy - p0[1], wz = oz - p0[2];
        const aa = ux * ux + uy * uy + uz * uz, bb = ux * dx + uy * dy + uz * dz, cc = dx * dx + dy * dy + dz * dz, dd = ux * wx + uy * wy + uz * wz, ee = dx * wx + dy * wy + dz * wz;
        const den = aa * cc - bb * bb; let s = den > 1e-9 ? (cc * dd - bb * ee) / den : 0; s = Math.max(0, Math.min(1, s));
        const t = (bb * s - ee) / cc; if (t < 0.2) continue;
        const qx = p0[0] + ux * s, qy = p0[1] + uy * s, qz = p0[2] + uz * s;
        const rx = ox + dx * t - qx, ry = oy + dy * t - qy, rz = oz + dz * t - qz;
        if (rx * rx + ry * ry + rz * rz > 0.15 * 0.15 || t > maxD || t > maxT) continue;
        if (Math.hypot(qx - a[0], qy - a[1], qz - a[2]) < endEx || Math.hypot(qx - b[0], qy - b[1], qz - b[2]) < endEx) continue;
        if (!best || t < best.t) best = { id: rec.id, t };
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- what the crosshair is on
  findTarget(eye, dir, maxD = 8) {
    const g = this.game;
    const tile = g.logi.pick(eye, dir, maxD);
    if (tile) return wireable(tile) ? tile : null;
    let best = null, bd = maxD;
    for (const it of g.machines.items.values()) {
      const e = it.ent; if (!wireable(e)) continue;
      const em = isEarth(e.type);
      const ch = catalogType(e.type);
      if (ch && typeof ch.pos === 'function') {   // a catalog machine that says where its cable clips on (a Leveling Pad has no x y z, a door keeps px pz)
        const pp = ch.pos(g, e); if (!pp) continue;
        const vx = pp[0] - eye.x, vy = pp[1] - eye.y, vz = pp[2] - eye.z, d = Math.hypot(vx, vy, vz), hr = e.hr || 0;
        if (d > bd + hr || (vx * dir.x + vy * dir.y + vz * dir.z) / (d || 1) < (hr ? 0.8 : 0.9)) continue;
        bd = d; best = e; continue;
      }
      const x = em ? it.obj.position.x : (e.cx ?? e.px ?? e.x), y = em ? it.obj.position.y + e.hy : (e.y0 ?? e.y) + (e.h ? e.h / 2 : 0.5), z = em ? it.obj.position.z : (e.cz ?? e.pz ?? e.z);
      if (x === undefined) continue;
      const vx = x - eye.x, vy = y - eye.y, vz = z - eye.z, d = Math.hypot(vx, vy, vz);
      if (d > bd + (e.hr || 0) || (vx * dir.x + vy * dir.y + vz * dir.z) / (d || 1) < (e.hr ? 0.8 : 0.9)) continue;
      bd = d; best = e;
    }
    if (this.shapePick) {   // what the hammer would hit by its shape: a wireable machine nearer than the point test found
      let sp = null; try { sp = this.shapePick(eye, dir, maxD); } catch (e) { sp = null; }
      if (sp && wireable(sp.ent) && (!best || sp.t < bd)) best = sp.ent;
    }
    return best;
  }

  // where a free wire ends: the first solid thing along the crosshair, or a fixed reach into the air
  freePoint(eye, dir) {
    const w = this.game.world; let t = 0.5;
    for (; t < 40; t += 0.25) { const x = eye.x + dir.x * t, y = eye.y + dir.y * t, z = eye.z + dir.z * t; if (y < 0 || w.solid(toI(x), toJ(y), toK(z))) { t = Math.max(0.5, t - 0.25); break; } }
    return [eye.x + dir.x * t, Math.max(0.1, eye.y + dir.y * t), eye.z + dir.z * t];
  }

  // ---------------------------------------------------------------- the tool in your hand
  // called every frame while a Power Cable is out (and only then)
  // The end under the crosshair gets a halo: gold = a valid first end, green = a valid second end, red = it will not take the wire (too far, no socket).
  aimUpdate(tool, eye, dir) {
    const g = this.game, ui = g.ui;
    g.plan = null; g.machines.setGhost(null); g.machines.showPreview(null, null); g.renderer.setGhost && g.renderer.setGhost(0);
    const tg = this.findTarget(eye, dir), max = this.max();
    const quiet = this.hold > 0;   // a result message is showing: do not paint over it
    const red = (s) => `<span style="color:#ff6a5a;font-weight:700">${s}</span>`;
    const have = g.S.items.cable || 0, stock = `<span style="opacity:.8">${have} cable${have === 1 ? '' : 's'} left</span>`;
    this.tool = true;
    if (this.from == null) {
      this.preview = null;
      ui.setCross(!!tg);
      this.halo = tg ? { at: this.attach(tg), color: 'gold' } : null;
      this.halo2 = null;
      if (!quiet) ui.hint(tg ? `<kbd>Click</kbd> to start a wire at <b>${wireName(tg)}</b> (${this.wireNote(tg)}) · cables reach ${max.toFixed(0)} m · ${stock} · <kbd>Q</kbd> put away` : `Power Cable: aim at a generator, pole or machine and click to start a wire. Every machine needs its own cable to a powered pole or generator · ${stock} · <kbd>Q</kbd> put away`, 0.4);
      return;
    }
    const A = this.ent(this.from);
    if (!A) { this.cancel(); return; }
    const a = this.attach(A);
    let b, len, state = 'green', msg;
    this.halo2 = { at: a, color: 'white' };
    if (tg && tg.id !== this.from) {
      b = this.attach(tg); len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const ex = this.find(this.from, tg.id), why = ex ? null : this.checkEnds(A, tg, false);
      if (ex) { state = 'orange'; msg = `<kbd>Click</kbd> to remove the cable to <b>${wireName(tg)}</b> (${len.toFixed(1)} m)`; }
      else if (!(len <= max)) { state = 'red'; msg = `${red(`Too far: ${len.toFixed(1)} m of ${max.toFixed(0)} m`)} · pick something closer to <b>${wireName(A)}</b>`; }
      else if (why) { state = 'red'; msg = red(why); }
      else msg = `<kbd>Click</kbd> to attach to <b>${wireName(tg)}</b> · ${len.toFixed(1)} m of ${max.toFixed(0)} m · ${stock}`;
      this.halo = { at: b, color: state === 'red' ? 'red' : state === 'orange' ? 'gold' : 'green' };
    } else {
      b = this.freePoint(eye, dir); len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      this.halo = null;
      if (!(len <= max)) { state = 'red'; msg = `${red(`${len.toFixed(1)} m: too far`)} (${max.toFixed(0)} m at most) · aim at a generator, pole or machine`; }
      else msg = `Wire from <b>${wireName(A)}</b> · ${len.toFixed(1)} m of ${max.toFixed(0)} m · aim at a generator, pole or machine and click`;
    }
    this.preview = { a, b, state };
    ui.setCross(!!(tg && tg.id !== this.from && state !== 'red'));
    ui.hint(`${msg} · click empty air or <kbd>Q</kbd> to cancel`, 0.4);   // a wire in hand always shows its live readout
  }

  // what the first click on this thing will do, in a few words (the hint while no wire is started)
  wireNote(e) {
    const n = this.of(e.id).length, lim = maxPorts(e, this.game);
    if (e.type === 'belt') { const li = lineInfo(this.game, e); return li.wired ? `this belt line is wired at tile ${tileName(li.wired)}` : `a cable on any tile powers the ${li.tiles.length} tile line`; }
    return `${n} of ${lim} sockets used`;
  }

  // left click / B with the cable out
  click(tool) {
    const g = this.game, ui = g.ui, eye = g.renderer.camera.position, dir = g.player.forward(new THREE.Vector3());
    const tg = this.findTarget(eye, dir);
    if (this.from == null) {
      if (!tg) { g.sound.error(); ui.hint('Aim at a generator, pole or machine that uses power, then click to start the wire.', 3); return; }
      this.from = tg.id; this.preview = null;
      g.sound.tone('sine', 520, 760, 0.07, 0.06);
      ui.hint(`Wire started at <b>${wireName(tg)}</b>. Click a generator, pole or machine to attach it. Click empty air or <kbd>Q</kbd> to cancel.`, 4);
      return;
    }
    const A = this.ent(this.from);
    if (!A) { this.cancel(); return; }
    if (!tg || tg.id === this.from) { this.cancel(tg ? 'Wire dropped: pick a second object next time.' : 'Wire cancelled.'); return; }
    const len = this.lengthBetween(A, tg), max = this.max(), ex = this.find(this.from, tg.id);
    if (!ex && !(len <= max + 1e-6)) { g.sound.error(); ui.hint(`<span style="color:#ff6a5a;font-weight:700">Too far: ${len.toFixed(1)} m of ${max.toFixed(0)} m.</span> Pick something closer, or click empty air to cancel.`, 3); return; }
    if (!ex && !((g.S.items.cable || 0) > 0)) { g.sound.error(); ui.hint('You have no Power Cable left.', 3); this.cancel(); return; }
    const aId = this.from, bId = tg.id;
    this.from = null; this.preview = null;
    if (g.isGuest()) { g.cmd('cable', { a: aId, b: bId }); g.sound.place(); return; }
    this.report(this.connect(aId, bId), true);
  }

  // the result of a connect(), told to whoever pressed the button
  report(r, local) {
    const g = this.game;
    let text, good = true;
    if (!r.ok) { good = false; text = r.why; }
    else if (r.removed) text = `Cable removed between ${wireName(r.a)} and ${wireName(r.b)}. You got the cable back.`;
    else {
      const pw = Math.max(r.a.pw || 0, r.b.pw || 0);
      text = `Wired <b>${wireName(r.a)}</b> to <b>${wireName(r.b)}</b> (${r.len.toFixed(1)} m). ${pw > 0.05 ? `Powered ${Math.round(pw * 100)}%.` : `Not powered yet: ${this.deadWhy(r.a) || this.deadWhy(r.b) || 'its grid has no supply'}.`}`;
    }
    if (local) { if (good) g.sound.place(); else g.sound.error(); g.ui.hint(text, 4); this.hold = 3; }
    else g.netSend({ t: 'chint', text, good });
  }

  cancel(msg) {
    this.from = null; this.preview = null;
    if (msg !== undefined && msg !== null && msg !== false) this.game.ui.hint(msg || 'Wire cancelled.', 2);
  }

  // ---------------------------------------------------------------- frame update: housekeeping, sync, drawing
  update(dt) {
    const g = this.game;
    if (this.from != null) {
      const t = g.curTool && g.curTool();
      if (g.stowed || !t || t.kind !== 'cable' || !this.ent(this.from)) this.cancel();
    }
    if (this.from == null && this.preview) this.preview = null;
    {   // the tool halos only live while the Power Cable is out (aimUpdate sets them each frame)
      const t = g.curTool && g.curTool(), out = !!(t && t.kind === 'cable') && !g.stowed;
      if (!out) { this.halo = null; this.halo2 = null; this.tool = false; }
      this.paintHalo(this.haloMesh, this.halo); this.paintHalo(this.halo2Mesh, this.halo2);
    }
    this.hold = Math.max(0, this.hold - dt);
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.4;
      if (!g.isGuest()) this.prune();
      this.drawDirty = true;
    }
    this.sockT -= dt; if (this.sockT <= 0) { this.sockT = 0.8; this.sockDirty = true; }
    if (this.netDirty) { this.netDirty = false; if (g.net.open && g.net.role === 'host') g.netSend({ t: 'cables', list: this.list().map((c) => ({ id: c.id, a: c.a, b: c.b })) }); }
    if (this.drawDirty) { this.drawDirty = false; this.sockDirty = true; this.redraw(); }
    if (this.sockDirty) { this.sockDirty = false; this.redrawSockets(); }
    this.drawPreview();
    this.updateSparks(dt);
  }

  paintHalo(mesh, h) {
    if (!h) { mesh.visible = false; return; }
    mesh.visible = true; mesh.position.set(h.at[0], h.at[1], h.at[2]);
    const c = HALO[h.color] || WHITE; mesh.material.color.setRGB(Math.min(1, c.r), Math.min(1, c.g), Math.min(1, c.b));
  }

  segInto(mesh, n, p0, p1, color) {
    const m = this._m, q = this._q, v = this._v, d = this._d;
    d.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]); const l = d.length(); if (l < 1e-4) return n;
    d.multiplyScalar(1 / l); q.setFromUnitVectors(this._up, d); v.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2); this._s.set(1, l, 1);
    m.compose(v, q, this._s); mesh.setMatrixAt(n, m); mesh.setColorAt(n, color);
    return n + 1;
  }

  redraw() {
    let n = 0; const hot = [];
    for (const { rec, A, B } of this.live()) {
      const st = stateOf(this.pwOf(rec)), col = stateColor(st);
      const a = this.attach(A), b = this.attach(B), pts = this.curve(a, b);
      if (st === 'orange') hot.push(pts);   // a browned out cable throws sparks
      for (let i = 0; i < pts.length - 1 && n < MAXSEG; i++) n = this.segInto(this.mesh, n, pts[i], pts[i + 1], col);
    }
    this.hot = hot;
    this.mesh.count = n; this.segCount = n;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  // the plug points: every cable end, every node (they take cables even before the first one), and a machine that has no cable yet (gold lamp: it is off until wired)
  redrawSockets() {
    const g = this.game, pl = g.player && g.player.pos; if (!pl) { this.sockHouse.count = 0; this.sockLamp.count = 0; return; }
    const hs = this.sockHouse, ls = this.sockLamp, m = this._m, q = this._q, v = this._v, sc = this._s;
    let n = 0; const done = new Set();
    const put = (e, color) => {
      if (n >= MAXSOCK || done.has(e.id)) return; const p = this.attach(e);
      if ((p[0] - pl.x) ** 2 + (p[2] - pl.z) ** 2 > SOCK_R * SOCK_R) return;
      done.add(e.id);
      q.identity(); sc.set(1, 1, 1); v.set(p[0], p[1] - 0.03, p[2]); m.compose(v, q, sc); hs.setMatrixAt(n, m); hs.setColorAt(n, DARK);
      v.set(p[0], p[1] + 0.025, p[2]); m.compose(v, q, sc); ls.setMatrixAt(n, m); ls.setColorAt(n, color); n++;
    };
    const wired = new Set(); for (const { rec, A, B } of this.live()) { const st = stateColor(stateOf(this.pwOf(rec))); put(A, st); put(B, st); wired.add(A.id); wired.add(B.id); }
    const stateOfEnt = (e) => (isNodeType(e.type) ? (e.type === 'pole' ? ((e.pw ?? 0) > 0.05 ? stateColor(stateOf(e.pw)) : GREY) : ((e.pw ?? 0) > 0.05 ? stateColor(stateOf(e.pw)) : GREY)) : GOLD);
    for (const t of g.logi.tiles.values()) { if (t.type === 'gen' || t.type === 'pole') put(t, stateOfEnt(t)); }
    for (const it of g.machines.items.values()) {
      const e = it.ent; if (!wireable(e) || done.has(e.id)) continue;
      if (isNodeType(e.type)) { put(e, stateOfEnt(e)); continue; }
      if (wired.has(e.id)) continue;
      const p = this.attach(e); if ((p[0] - pl.x) ** 2 + (p[2] - pl.z) ** 2 > NEEDY_R * NEEDY_R) continue;
      put(e, GOLD);   // no cable yet: this machine does nothing until one runs to it
    }
    // a wire in hand also marks the tiles that need one near you (a belt line shows one socket, on the tile you aim at, through the halo)
    if (this.tool) for (const t of g.logi.tiles.values()) { if ((t.type === 'sorter' || t.type === 'mech' || t.type === 'fan' || t.type === 'charger') && !wired.has(t.id)) { const p = this.attach(t); if ((p[0] - pl.x) ** 2 + (p[2] - pl.z) ** 2 <= NEEDY_R * NEEDY_R) put(t, GOLD); } }
    else for (const t of g.logi.tiles.values()) { if ((t.type === 'sorter' || t.type === 'mech' || t.type === 'fan') && !wired.has(t.id)) { const p = this.attach(t); if ((p[0] - pl.x) ** 2 + (p[2] - pl.z) ** 2 <= NEEDY_R * NEEDY_R) put(t, GOLD); } }
    hs.count = n; ls.count = n;
    for (const mm of [hs, ls]) { mm.instanceMatrix.needsUpdate = true; if (mm.instanceColor) mm.instanceColor.needsUpdate = true; }
  }

  // sparks jump along a weak cable near you (a few at a time, six times a second)
  updateSparks(dt) {
    this.sparkT -= dt; if (this.sparkT > 0) return; this.sparkT = 0.16;
    const sp = this.sparks, pl = this.game.player && this.game.player.pos;
    if (!this.hot.length || !pl) { if (sp.count) { sp.count = 0; sp.instanceMatrix.needsUpdate = true; } return; }
    const m = this._m, q = this._q, v = this._v, sc = this._s; let n = 0;
    for (let k = 0; k < 24 && n < 24; k++) {
      const pts = this.hot[(Math.random() * this.hot.length) | 0], p = pts[(Math.random() * pts.length) | 0];
      if ((p[0] - pl.x) ** 2 + (p[2] - pl.z) ** 2 > 30 * 30) continue;
      q.identity(); const s = 0.6 + Math.random() * 1.2; sc.set(s, s, s); v.set(p[0] + (Math.random() - 0.5) * 0.1, p[1] + (Math.random() - 0.5) * 0.1, p[2] + (Math.random() - 0.5) * 0.1); m.compose(v, q, sc); sp.setMatrixAt(n, m); sp.setColorAt(n, SPARK); n++;
    }
    sp.count = n; sp.instanceMatrix.needsUpdate = true; if (sp.instanceColor) sp.instanceColor.needsUpdate = true;
  }

  drawPreview() {
    const pm = this.pmesh;
    if (!this.preview) { pm.count = 0; return; }
    const { a, b, state } = this.preview; const pts = this.curve(a, b, 14), col = state === 'red' ? RED : state === 'orange' ? ORANGE : WHITE;
    let n = 0; for (let i = 0; i < pts.length - 1; i++) n = this.segInto(pm, n, pts[i], pts[i + 1], col);
    pm.count = n; pm.instanceMatrix.needsUpdate = true; if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- hover readout
  describe(rec) {
    const A = this.ent(rec.a), B = this.ent(rec.b); if (!A || !B) return null;
    const pw = this.pwOf(rec), len = this.lengthBetween(A, B), st = stateOf(pw);
    const dead = st === 'red' ? 'No power on this cable: ' + (this.deadWhy(A) || this.deadWhy(B) || 'its grid has no supply') : null;
    return { title: 'POWER CABLE' + (st === 'green' ? ' · LIVE' : st === 'orange' ? ' · WEAK' : ' · DEAD'), lit: st !== 'red', lines: [`${wireName(A)} to ${wireName(B)}, ${len.toFixed(1)} m of ${this.max().toFixed(0)} m`, dead || `Carrying ${Math.round(pw * 100)}% of the grid`, 'Hammer it, or press X, to take it down (you get the cable back). A Power Cable tool click on both ends again also removes it.'] };
  }

  // the node a machine's cable ends on (through a string of lanterns when it is one): { node, hops, cable } or null
  sourceOf(e) {
    const seen = new Set([e.id]), q = [{ id: e.id, h: 0 }];
    while (q.length) {
      const { id, h } = q.shift();
      for (const c of this.of(id)) {
        const oid = this.other(c, id); if (seen.has(oid)) continue; seen.add(oid);
        const o = this.ent(oid); if (!o) continue;
        if (isNodeType(o.type)) return { node: o, hops: h + 1, cable: c };
        if (o.type === 'hlamp') q.push({ id: oid, h: h + 1 });
      }
    }
    return null;
  }
  // why the grid behind this thing is dark ('' when it has power)
  deadWhy(e) {
    const src = isNodeType(e.type) ? { node: e } : this.sourceOf(e); if (!src) return '';
    if (src.node.type === 'switch') return (src.node.pw ?? 0) > 0.05 ? '' : 'the Power Switch is open or its grid has no supply';
    return deadReason(gridOfNode(this.game, src.node));
  }

  // extra lines for any object a cable touches or should touch: where its power comes from, or that it has no cable. Readable on both screens.
  infoLines(e) {
    if (!e || !wireable(e)) return [];
    const g = this.game, pct = (v) => `${Math.round((v ?? 0) * 100)}%`;
    if (isNodeType(e.type)) {
      const mine = this.of(e.id), lim = maxPorts(e, g);
      if (!mine.length) return e.type === 'pole' ? [] : [`Not wired: a ${wireName(e).toLowerCase()} joins a grid only through cables (${lim} sockets). Run one to a pole, a generator or a machine.`];
      const names = mine.map((c) => { const o = this.ent(this.other(c, e.id)); return o ? `${wireName(o)} (${this.length(c).toFixed(1)} m)` : null; }).filter(Boolean);
      return [`Cables ${mine.length} of ${lim}: ${names.join(', ')}`];
    }
    // a machine: its own cable (a belt line: any tile's cable)
    let host = e, line = null;
    if (e.type === 'belt') { line = lineInfo(g, e); host = line.wired; }
    if (!host || !this.of(host.id).length) return [e.type === 'belt' ? `Not wired: run a cable to any tile of this belt line (${line.tiles.length} tile${line.tiles.length === 1 ? '' : 's'}: one cable powers them all)` : 'Not wired: run a cable to it from a powered pole or generator'];
    const src = this.sourceOf(host);
    if (!src) return [`Cable to ${(this.of(host.id).map((c) => { const o = this.ent(this.other(c, host.id)); return o ? wireName(o) : null; }).filter(Boolean)).join(', ')}: that is not a pole or generator, so no power reaches it. Wire it to a pole, a generator or a battery`];
    const len = this.length(src.cable), from = `${wireName(src.node)}${src.hops > 1 ? ` through ${src.hops - 1} lantern${src.hops > 2 ? 's' : ''}` : ''} (${len.toFixed(1)} m)`;
    const where = line ? `Line of ${line.tiles.length} tile${line.tiles.length === 1 ? '' : 's'} powered through a cable at tile ${tileName(host)}` : `Cable from ${from}`;
    if ((e.pw ?? 0) > 0.05) return [`Powered ${pct(e.pw)}: ${where}${line ? `, from ${from}` : ''}`];
    const why = this.deadWhy(host);
    return [`Not powered: ${where}${line ? `, from ${from}` : ''}${why ? '. No power: ' + why : ''}`];
  }
}
