import * as THREE from 'three';
import { C, NX, NY, NZ, cellX, cellY, cellZ, toI, toJ, toK, idx } from './config.js';
import { species, RARITY, NEEDLE, BULK, REMAINS, isSpecialCell } from './plushdata.js';
import { compaction } from './util.js';
import { FUEL_MAX_RARITY } from './power.js';
import { buildMountFan } from './mountfan.js';
import { TIER_MUL, TIER_COLOR, SPACING, HOP_MAX, tierOf, lenOf, capOf, framesNeeded, FRAME_REACH, LIFT_FREE } from './beltdata.js';

export const DX = [1, 0, -1, 0];
export const DZ = [0, 1, 0, -1];
export const LOGI = new Set(['belt', 'sorter', 'vault', 'mech', 'gen', 'pole', 'fan', 'charger']);
// Charging Station: reserve units, where 1.0 is one full bot battery. Common to Epic only (index = rarity).
export const CHARGE_PER = [0.34, 0.7, 1.5, 4.0];
export const CHARGER_CAP = 8, CHARGER_HOPPER = 12, CHARGE_RATE = 0.5, CHARGER_RANGE = 400, CHARGER_MAX_RARITY = 3;
const YAW = [Math.PI / 2, 0, -Math.PI / 2, Math.PI]; // model +Z -> dir
const MAXBELT = 4500;
const NO_FRAMES = { ok: true, need: 0, have: 0 };
export const HAND_CRANK = 0.35; // an unpowered belt still creeps along, so a line can always reach the bin
const nearBinDir = (game, a) => { const bp = game.hall && game.hall.binPos; if (!bp) return null; const dx = bp.x - cellX(a.i), dz = bp.z - cellZ(a.k); if (Math.hypot(dx, dz) > 4 || Math.hypot(dx, dz) < 0.9) return null; return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : 2) : (dz > 0 ? 1 : 3); };

const arrowTex = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2d31'; g.fillRect(0, 0, 64, 128);
  g.strokeStyle = '#59606a'; g.lineWidth = 5; g.lineJoin = 'round';
  for (let y of [26, 90]) { g.beginPath(); g.moveTo(10, y + 24); g.lineTo(32, y); g.lineTo(54, y + 24); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 64, Math.random() * 128, 2, 5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

const M = {
  bed: new THREE.MeshStandardMaterial({ map: arrowTex, roughness: 0.85, metalness: 0.2 }),
  rail: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.5 }),   // tinted per instance by the belt mark (Mk1 is the old yellow)
  steel: new THREE.MeshStandardMaterial({ color: 0x59636e, roughness: 0.4, metalness: 0.85 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.6, metalness: 0.6 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xe8b81c, roughness: 0.5, metalness: 0.35 }),
  crate: new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.85 }),
  glowG: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3, 1) }),
  glowO: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 1.4, 0.3) }),
  glowR: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 0.3, 0.2) }),
  glowB: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 3.6) }),
};

export class Logistics {
  constructor(game) {
    this.game = game;
    this.scene = game.renderer.scene;
    this.tiles = new Map();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.objs = new Map(); // id -> object3d for sorters/vaults/mechs
    // belts are instanced
    const bedG = new THREE.BoxGeometry(0.5, 0.05, 0.6);
    const railG = new THREE.BoxGeometry(0.04, 0.1, 0.6);
    this.bedMesh = new THREE.InstancedMesh(bedG, M.bed, MAXBELT * 3);     // a corner arc is 3 beds and 6 rails
    this.railMesh = new THREE.InstancedMesh(railG, M.rail, MAXBELT * 6);
    this.railMesh.setColorAt(0, new THREE.Color(1, 1, 1));               // allocates the per instance color
    for (const m of [this.bedMesh, this.railMesh]) { m.frustumCulled = false; m.count = 0; this.root.add(m); }
    this._liftCache = new WeakMap(); this.lifts = new Set(); this.beltOrder = [];
    this.cols = new Map();   // lift shaft cells (above the base tile) -> the lift tile that owns them
    this.dirty = true;
    this.visualOnly = false; // a guest only draws what the host simulates
    this.byId = new Map();
    this.hum = 0;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.sc = new THREE.Vector3(1, 1, 1);
  }

  clear() {
    this.tiles.clear();
    this.byId.clear();
    this.cols.clear(); this.lifts.clear();
    for (const o of this.objs.values()) { this.game.machines.disposeObj(o); this.root.remove(o); }
    this.objs.clear();
    this.dirty = true;
  }

  tileAt(i, j, k) { return this.tiles.get(idx(i, j, k)); }
  count(type) { let n = 0; for (const t of this.tiles.values()) if (t.type === type) n++; return n; }

  // ---------------------------------------------------------------- placement
  canPlace(i, j, k) {
    const w = this.game.world;
    if (!w.inside(i, j, k) || w.solid(i, j, k)) return 'Blocked';
    if (this.tiles.has(idx(i, j, k)) || this.cols.has(idx(i, j, k))) return 'Occupied';
    if (j > 0 && !w.solid(i, j - 1, k)) return 'Needs a floor';
    // do not place inside the player
    const p = this.game.player.pos;
    if (Math.abs(cellX(i) - p.x) < 0.5 && Math.abs(cellZ(k) - p.z) < 0.5 && p.y < cellY(j) + 0.3 && p.y + 1.7 > cellY(j) - 0.3) return 'Too close';
    return null;
  }

  // the empty cell the player is aiming at (on the floor below the crosshair)
  aimCell(eye, dir) {
    const w = this.game.world;
    let last = null;
    for (let t = 0.3; t < 5; t += 0.1) {
      const x = eye.x + dir.x * t, y = eye.y + dir.y * t, z = eye.z + dir.z * t;
      const i = toI(x), j = toJ(y), k = toK(z);
      if (y < 0 || w.solid(i, j, k)) break;
      last = { i, j, k };
    }
    if (!last) return null;
    let g = 0;
    while (last.j > 0 && !w.solid(last.i, last.j - 1, last.k) && g++ < 5) last.j--;
    return last;
  }

  plan(kind, eye, dir, yaw, rise) {
    const a = this.aimCell(eye, dir);
    if (!a) return { ok: false, why: 'Aim at the floor' };
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let d = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 2) : (fz > 0 ? 1 : 3);
    if (kind === 'belt' && !rise) { const nb = nearBinDir(this.game, a); if (nb != null) d = nb; }
    const why = this.canPlace(a.i, a.j, a.k);
    const ent = { type: kind, i: a.i, j: a.j, k: a.k, dir: d, rise: kind === 'belt' ? rise : 0 };
    if (kind === 'belt' && !rise) { const tp = this.railTurn(a, d); if (tp) { ent.turnPrev = { id: tp.id, dir: tp.dir }; ent.dir = tp.dir; } }
    return { ok: !why, why, ent };
  }

  // Minecraft rail rule: a new belt set beside the open end of a line turns that end toward it, and carries on the same way
  railTurn(a, d) {
    let best = null;
    for (let m = 0; m < 4; m++) {
      const n = this.tiles.get(idx(a.i - DX[m], a.j, a.k - DZ[m]));
      if (!n || n.type !== 'belt' || n.rise || n.detector || n.splitter || n.lift || n.ug || n.dir === m || ((n.dir + 2) & 3) === m) continue;
      if (this.nextOf(n)) continue;
      let fed = false;
      for (let q = 0; q < 4 && !fed; q++) { const f = this.tiles.get(idx(n.i - DX[q], n.j, n.k - DZ[q])); if (f && f.type === 'belt' && f.dir === q && !f.rise) fed = true; }
      const score = (fed ? 2 : 0) + (n.dir === d ? 1 : 0);
      if (!best || score > best.score) best = { id: n.id, dir: m, score };
    }
    return best;
  }

  pick(eye, dir, maxD = 3.6) {
    for (let t = 0.3; t < maxD; t += 0.12) {
      const i = toI(eye.x + dir.x * t), j = toJ(eye.y + dir.y * t), k = toK(eye.z + dir.z * t);
      for (let dj = 0; dj >= -1; dj--) {
        const e = this.tiles.get(idx(i, j + dj, k));
        if (e) return e;
      }
      const lc = this.cols.get(idx(i, j, k)); if (lc) return lc;   // anywhere up a lift shaft
    }
    return null;
  }

  // ---------------------------------------------------------------- add / remove
  add(ent) {
    ent.items = ent.items || [];
    if (ent.type === 'sorter') { ent.q = ent.q || []; ent.kept = ent.kept || []; ent.timer = 0; ent.mode = ent.mode || 0; ent.filter = ent.filter ?? 7; }
    if (ent.type === 'vault') ent.stored = ent.stored || [];
    if (ent.type === 'gen') { ent.q = ent.q || []; ent.burn = ent.burn || 0; ent.lit = false; }
    if (ent.type === 'charger') { ent.q = ent.q || []; ent.reserve = ent.reserve || 0; ent.dig = 0; }
    if (ent.type === 'mech') { ent.buf = ent.buf || []; ent.timer = 1.0; ent.out = 0; ent.state = 'dig'; ent.adv = ent.adv || 0; ent.arm = null; }
    const key = idx(ent.i, ent.j, ent.k);
    this.tiles.set(key, ent);
    this.byId.set(ent.id, ent);
    this.game.world.reserved.add(key);
    if (ent.type === 'belt' && ent.lift) { const up = Math.sign(ent.lift.h); for (let q = 1; q <= Math.abs(ent.lift.h); q++) { const ck = idx(ent.i, ent.j + up * q, ent.k); this.cols.set(ck, ent); this.game.world.reserved.add(ck); } }   // the shaft (above the tile for an up lift, below it for a down lift): nothing else is built in it
    if (ent.type !== 'belt') this.buildObj(ent);
    if (ent.type === 'belt' && ent.detector) this.buildGate(ent);
    if (ent.type === 'belt' && ent.splitter) this.buildSplitter(ent);
    if (ent.type === 'belt' && ent.lift) { this.buildLift(ent); this.lifts.add(ent); }
    if (ent.type === 'belt' && ent.ug) { this.buildUg(ent); this.linkUg(ent); }
    this.dirty = true;
    if (!ent.view) this.game.netEnt(ent);
  }

  remove(ent) {
    const key = idx(ent.i, ent.j, ent.k);
    this.tiles.delete(key);
    this.byId.delete(ent.id);
    this.game.world.reserved.delete(key);
    this.lifts.delete(ent); if (ent.type === 'belt' && ent.ug) this.unlinkUg(ent);
    if (ent.type === 'belt' && ent.lift) { const up = Math.sign(ent.lift.h); for (let q = 1; q <= Math.abs(ent.lift.h); q++) { const ck = idx(ent.i, ent.j + up * q, ent.k); if (this.cols.get(ck) === ent) { this.cols.delete(ck); this.game.world.reserved.delete(ck); } } }
    const o = this.objs.get(ent.id);
    if (o) { this.game.machines.disposeObj(o); this.root.remove(o); this.objs.delete(ent.id); }
    this.dirty = true;
  }

  // ---------------------------------------------------------------- meshes
  buildObj(ent) {
    const g = new THREE.Group();
    g.position.set(cellX(ent.i), ent.j * C, cellZ(ent.k));
    if (ent.type === 'fan' && ent.mounted) { const m = buildMountFan(); g.add(m); g.position.set(ent.px, ent.py, ent.pz); g.rotation.y = ent.fyaw; this.root.add(g); this.objs.set(ent.id, g); return; }
    if (ent.type === 'sorter') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.5, 0.56), M.steel); body.position.y = 0.25;
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.4), M.glowG); top.position.y = 0.53; top.name = 'top';
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.14, 0.58), M.yellow); hood.position.y = 0.44;
      const intake = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.06), M.dark); intake.position.set(0, 0.3, -0.28);
      const out = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.06), M.dark); out.position.set(0, 0.3, 0.28);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.glowO); lamp.position.set(0.2, 0.62, 0.2); lamp.name = 'lamp';
      g.add(body, hood, top, intake, out, lamp);
    } else if (ent.type === 'vault') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.5, 0.56), M.crate); box.position.y = 0.25;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.6), M.dark); lid.position.y = 0.53;
      for (const s of [-1, 1]) { const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 0.6), M.steel); strap.position.set(s * 0.18, 0.26, 0); g.add(strap); }
      g.add(box, lid);
    } else if (ent.type === 'gen') {
      const red = new THREE.MeshStandardMaterial({ color: 0x8a2a1c, roughness: 0.5, metalness: 0.6 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.46, 0.58), red); body.position.y = 0.3;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.6), M.dark); base.position.y = 0.04;
      const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 10), M.steel); chim.position.set(0.18, 0.78, -0.15);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.02), M.dark); win.position.set(0, 0.32, 0.3); win.name = 'win';
      const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.1, 0.18, 10, 1, true), M.steel); hopper.position.set(-0.1, 0.62, 0.0);
      g.add(base, body, chim, win, hopper);
    } else if (ent.type === 'charger') {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.62), M.dark); pad.position.y = 0.035;
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.05, 16), M.steel); plate.position.set(0.04, 0.095, 0.0);
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 20), M.glowB); coil.rotation.x = Math.PI / 2; coil.position.set(0.04, 0.16, 0.0); coil.name = 'coil';
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.6, 8), M.steel); post.position.set(-0.22, 0.37, -0.2);
      const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.08, 0.2, 10, 1, true), M.yellow); hopper.position.set(-0.22, 0.72, -0.2);
      const bolt = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), M.glowB); bolt.position.set(0.04, 0.5, 0.0); bolt.name = 'bolt';
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), M.steel); mast.position.set(0.04, 0.33, 0.0);
      g.add(pad, plate, coil, post, hopper, mast, bolt);
    } else if (ent.type === 'pole') {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.0, 8), M.steel); mast.position.y = 1.0;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.05), M.dark); arm.position.y = 1.95;
      for (const s of [-1, 0, 1]) { const ins = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), M.rail); ins.position.set(s * 0.22, 2.0, 0); g.add(ins); }
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 10), M.dark); base.position.y = 0.04;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.glowR); lamp.position.set(0, 1.75, 0.06); lamp.name = 'lamp';
      g.add(mast, arm, base, lamp);
    } else if (ent.type === 'fan') {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.5, 8), M.dark); stand.position.y = 0.25;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 8, 20), M.steel); ring.position.y = 0.62;
      const blades = new THREE.Group(); blades.position.y = 0.62; blades.name = 'blades';
      for (let b = 0; b < 4; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.015), M.yellow); bl.position.set(0.12, 0, 0); bl.rotation.z = 0.35; const gp = new THREE.Group(); gp.rotation.z = (b / 4) * Math.PI * 2; gp.add(bl); blades.add(gp); }
      g.add(stand, ring, blades);
    } else if (ent.type === 'mech') {
      const tr = new THREE.BoxGeometry(0.14, 0.2, 0.62);
      const l = new THREE.Mesh(tr, M.dark), r = new THREE.Mesh(tr, M.dark); l.position.set(-0.26, 0.1, 0); r.position.set(0.26, 0.1, 0);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.56), M.yellow); body.position.y = 0.37;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.3), M.steel); cab.position.set(0, 0.66, -0.06);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), M.glowG); lamp.position.set(0, 0.86, -0.06); lamp.name = 'lamp';
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.02), M.glowO); eye.position.set(0, 0.68, 0.1);
      const arm = new THREE.Group(); arm.name = 'arm'; arm.position.set(0, 0.5, 0.2);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), M.steel); seg.rotation.x = Math.PI / 2; seg.position.z = 0.5; seg.name = 'seg';
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 6), M.yellow); claw.rotation.x = -Math.PI / 2; claw.position.z = 1; claw.name = 'claw';
      arm.add(seg, claw);
      g.add(l, r, body, cab, lamp, eye, arm);
    }
    g.rotation.y = YAW[ent.dir || 0];
    this.root.add(g);
    this.objs.set(ent.id, g);
  }

  setSorterLook(t) {
    const o = this.objs.get(t.id), top = o && o.getObjectByName('top');
    if (!top) return;
    const modes = 99;
    const col = t.filter === 0 ? new THREE.Color(1.5, 1.5, 1.5) : t.mode === 0 ? new THREE.Color(0.4, 3, 1) : new THREE.Color(RARITY[Math.min(5, t.mode)].color).multiplyScalar(3);
    void modes;
    top.material = new THREE.MeshBasicMaterial({ color: col });
  }

  setLamp(ent, mat) {
    const o = this.objs.get(ent.id);
    const lamp = o && o.getObjectByName('lamp');
    if (lamp) lamp.material = mat;
  }

  rebuildBelts() {
    this.dirty = false;
    let n = 0, r = 0, nb = 0;
    const bm = this.bedMesh.instanceMatrix.array, rm = this.railMesh.instanceMatrix.array, rc = this.railMesh.instanceColor.array;
    const bedMax = this.bedMesh.instanceMatrix.count, railMax = this.railMesh.instanceMatrix.count;
    const m = this.m4, q = this.q, e = this.e, v = this.v, sc = this.sc, off = this._off || (this._off = new THREE.Vector3());
    const tierCols = this._tierCols || (this._tierCols = TIER_COLOR.map((h) => new THREE.Color(h)));
    const feeders = new Map(); let maxMul = 1;
    for (const t of this.tiles.values()) {
      if (t.type !== 'belt') continue;
      maxMul = Math.max(maxMul, TIER_MUL[tierOf(t)] * (t.hose ? 2 : 1));
      const nx = this.nextOf(t);
      if (nx && nx.type === 'belt' && ((nx.dir + 2) & 3) !== t.dir) { const l = feeders.get(nx.id) || []; l.push(t.dir); feeders.set(nx.id, l); }
    }
    const putRail = (tc) => { m.toArray(rm, r * 16); rc[r * 3] = tc.r; rc[r * 3 + 1] = tc.g; rc[r * 3 + 2] = tc.b; r++; };
    for (const t of this.tiles.values()) {
      if (t.type !== 'belt') continue;
      const fl = feeders.get(t.id) || []; t.fed = fl.length > 0;
      const shaped = !!(t.lift || t.ug);   // lifts and underground ends are drawn as their own meshes
      t.cd = (!shaped && !t.rise && fl.length === 1 && fl[0] !== t.dir) ? fl[0] : null;
      if (shaped || n >= MAXBELT || nb + 3 > bedMax || r + 6 > railMax) continue;
      const tc = tierCols[tierOf(t)];
      const ang = YAW[t.dir];
      const tilt = t.rise * Math.PI / 4;
      const len = t.rise ? 1.414 : 1;
      const y = t.j * C + 0.045 + (t.rise ? 0.3 : 0);
      const cx = cellX(t.i), cz = cellZ(t.k);
      if (t.cd != null) {
        // a corner is a quarter arc: three short beds along the same curve the items ride (a quadratic Bezier through the cell's middle)
        const ax = cx - DX[t.cd] * C * 0.5, az = cz - DZ[t.cd] * C * 0.5, bx = cx + DX[t.dir] * C * 0.5, bz = cz + DZ[t.dir] * C * 0.5;
        const at = (s, o) => { const u = 1 - s; return o === 0 ? u * u * ax + 2 * u * s * cx + s * s * bx : u * u * az + 2 * u * s * cz + s * s * bz; };
        for (let a = 0; a < 3; a++) {
          const s0 = a / 3, s1 = (a + 1) / 3, x0 = at(s0, 0), z0 = at(s0, 1), x1 = at(s1, 0), z1 = at(s1, 1);
          const dx = x1 - x0, dz = z1 - z0, chord = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
          e.set(0, yaw, 0, 'YXZ'); q.setFromEuler(e); sc.set(1, 1, chord / C * 1.1);
          v.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.compose(v, q, sc); m.toArray(bm, nb * 16); nb++;
          for (const sd of [-1, 1]) { off.set(sd * 0.27, 0.04, 0).applyQuaternion(q); v.set((x0 + x1) / 2 + off.x, y + off.y, (z0 + z1) / 2 + off.z); m.compose(v, q, sc); putRail(tc); }
        }
        n++; continue;
      }
      e.set(-tilt, ang, 0, 'YXZ'); q.setFromEuler(e);
      sc.set(1, 1, len);
      v.set(cx, y, cz); m.compose(v, q, sc);
      m.toArray(bm, nb * 16); nb++;
      for (const s of [-1, 1]) {
        off.set(s * 0.27, 0.04, 0).applyQuaternion(q);
        v.set(cx + off.x, y + off.y, cz + off.z); m.compose(v, q, sc);
        putRail(tc);
      }
      n++;
    }
    this.maxMul = maxMul; this.bedMesh.count = nb; this.railMesh.count = r;
    // update order: the tiles nearest the end of their line first, so a plush handed forward finds the next tile already moved (positions are all of one instant)
    const rank = new Map(), belts = [];
    for (const t of this.tiles.values()) if (t.type === 'belt') belts.push(t);
    const depth = (t) => {
      let cur = t; const chain = [], seen = new Set();
      while (cur && cur.type === 'belt' && !rank.has(cur.id) && !seen.has(cur.id)) { chain.push(cur); seen.add(cur.id); cur = this.nextOf(cur); }   // (a ring ends where it closes)
      let base = cur && cur.type === 'belt' && rank.has(cur.id) ? rank.get(cur.id) + 1 : 0;
      for (let q = chain.length - 1; q >= 0; q--) { rank.set(chain[q].id, base); base++; }
    };
    for (const t of belts) if (!rank.has(t.id)) depth(t);
    this.beltOrder = belts.sort((a, b) => rank.get(a.id) - rank.get(b.id));
    let corners = 0; for (const t of this.tiles.values()) if (t.type === 'belt' && t.cd != null) corners++;
    this.cornerN = corners;
    this.bedMesh.instanceMatrix.needsUpdate = true; this.railMesh.instanceMatrix.needsUpdate = true; this.railMesh.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- simulation
  // t0 is how far into the next tile the item already is (the part of this frame's move that went past the end), so the rate does not depend on the frame time
  accept(n, item, fromDir, t0 = 0) {
    if (!n) return false;
    if (n.type === 'belt') {
      if (fromDir != null && ((n.dir + 2) & 3) === fromDir) return false; // head-on
      if (n.ug && n.ug.role === 'out' && fromDir !== 'ug') return false;  // an underground exit only takes what its own entry sends
      const len = lenOf(n), last = n.items[n.items.length - 1], at = Math.max(0, Math.min(t0, len));
      if (n.items.length >= capOf(len) || (last && last.t < SPACING + at - 1e-6)) return false;   // the epsilon: a dense line sits exactly at the spacing
      n.items.push({ sp: item.sp, vr: item.vr, t: at });
      return true;
    }
    if (n.type === 'sorter') {
      if (n.q.length >= 3) return false;
      n.q.push({ sp: item.sp, vr: item.vr, t: 0 });
      return true;
    }
    if (n.type === 'gen') {
      const r = species[item.sp] ? species[item.sp].rarity : 9;
      if (r > FUEL_MAX_RARITY || n.q.length >= (this.game.T.genBuffer)) return false;
      n.q.push({ sp: item.sp, vr: item.vr });
      return true;
    }
    if (n.type === 'charger') {
      const r = species[item.sp] ? species[item.sp].rarity : 9;
      if (r > CHARGER_MAX_RARITY || n.q.length >= CHARGER_HOPPER) return false;
      n.q.push({ sp: item.sp, vr: item.vr });
      return true;
    }
    if (n.type === 'vault') {
      if (n.stored.length >= this.vaultCap()) return false;
      n.stored.push({ sp: item.sp, vr: item.vr });
      this.game.registerDex(item.sp, true);
      return true;
    }
    return false;
  }
  vaultCap() { return 120; }

  nextOf(t) {
    if (t.lift) return this.tiles.get(idx(t.i + DX[t.dir], t.j + t.lift.h, t.k + DZ[t.dir]));   // a lift sets its plush down h cells higher, one cell ahead
    if (t.ug && t.ug.role === 'in') return t.ug.pair != null ? this.byId.get(t.ug.pair) : undefined;   // an underground entry hands over to its exit, wherever that is
    return this.tiles.get(idx(t.i + DX[t.dir], t.j + (t.rise || 0), t.k + DZ[t.dir]));
  }

  // does this lift have the Lift Frames its height asks for (one per started 8 cells above 8)? { ok, need, have }
  liftSupport(t) {
    const need = framesNeeded(Math.abs(t.lift.h));
    if (!need) return NO_FRAMES;
    const items = this.game.machines.items, now = this.game.time;
    let c = this._liftCache.get(t);
    if (c && c.h === t.lift.h && c.n === items.size && Math.abs(now - c.at) < 1.5) return c;
    let have = 0; const x = cellX(t.i), z = cellZ(t.k);
    for (const it of items.values()) { const e = it.ent; if (e.type === 'liftframe' && Math.hypot(e.x - x, e.z - z) <= FRAME_REACH) have++; }
    c = { ok: have >= need, need, have, at: now, n: items.size, h: t.lift.h };
    this._liftCache.set(t, c);
    return c;
  }

  update(dt) {
    const g = this.game, T = g.T;
    if (this.dirty) this.rebuildBelts();
    const spd = T.beltSpeed;
    const tick = this.game.time;
    this._moving = 0;
    arrowTex.offset.y = (arrowTex.offset.y - dt * spd * 0.5) % 1;
    for (const t of this.lifts) this.liftLook(t, tick);
    // belts run in equal sub steps when the fastest tile would move a plush more than 0.8 of a tile in one go, so a Mk6 line at full upgrades still moves
    // exactly as printed and does not depend on the frame time (one sub step at every speed the game had before)
    const sub = Math.max(1, Math.min(8, Math.ceil(spd * (this.maxMul || 1) * dt / 0.8)));
    const order = this.beltOrder || [];
    for (let s = 0; s < sub; s++) for (const t of order) this.updateBelt(t, dt / sub, spd, s === 0);
    for (const t of this.tiles.values()) {
      if (t.type === 'belt') continue;
      else if (t.type === 'sorter') { if (!this.visualOnly) this.updateSorter(t, dt); }
      else if (t.type === 'mech') { if (!this.visualOnly) this.updateMech(t, dt); }
      else if (t.type === 'gen') this.updateGen(t, dt, tick);
      else if (t.type === 'charger') this.updateCharger(t, dt);
      else if (t.type === 'fan') { const o = this.objs.get(t.id); const b = o && o.getObjectByName('blades'); if (b) b.rotation.z += dt * 14 * (t.pw ?? 0); }
      else if (t.type === 'pole') { const o = this.objs.get(t.id); const l = o && o.getObjectByName('lamp'); if (l) l.material = (t.pw ?? 0) > 0.6 ? M.glowG : (t.pw ?? 0) > 0.05 ? M.glowO : M.glowR; }
    }
    this.hum = this._moving;
    this.gateTick(dt);
  }

  // one belt tile for dt: the plush on it move at the tile's own speed, then the first one is handed on
  updateBelt(t, dt, spd, count) {
    if (t.hose && !this.visualOnly && !t.fed && (t.pw ?? 0) > 0.05) this.hoseIntake(t, dt);
    const its = t.items;
    if (!its.length) return;
    const pw = t.halt ? 0 : Math.max(t.pw ?? 0, HAND_CRANK);
    if (count && (t.pw ?? 0) > 0.02 && !t.halt) this._moving++;
    if (t.detector && !this.visualOnly) {
      for (let n = its.length - 1; n >= 0; n--) {
        const it = its[n];
        if (!it.sc && it.t >= 0.5) { it.sc = true; if (this.scanItem(t, it)) its.splice(n, 1); }
      }
      if (!its.length) return;
    }
    // every tile runs at its own mark: a line is only as fast as its slowest tile. A lift without its frames stands still.
    const len = lenOf(t), live = !t.lift || this.liftSupport(t).ok;
    const step = live ? spd * TIER_MUL[tierOf(t)] * pw * (t.hose ? 2 : 1) * dt : 0;
    for (let n = 0; n < its.length; n++) {
      const it = its[n];
      it.t = Math.min(it.t + step, Math.max(it.t, n === 0 ? Infinity : its[n - 1].t - SPACING));
    }
    // the first plush crosses the end of the tile: hand it over with what is left of this move (a fast tile may pass a few per step)
    const canHand = pw > 0.02 && !this.visualOnly && live;
    for (let hop = 0; hop < HOP_MAX && its.length && its[0].t >= len; hop++) {
      if (!canHand || !this.handOff(t, its[0], its[0].t - len)) break;
      its.shift();
    }
    if (its.length && its[0].t > len) { its[0].t = len; for (let n = 1; n < its.length; n++) its[n].t = Math.min(its[n].t, its[n - 1].t - SPACING); }
  }

  // move the first plush of tile t on to whatever it feeds. t0 = how far past the end it already is. Returns true when it left.
  handOff(t, f, t0) {
    if (t.splitter) {
      const outs = this.splitOuts(t);
      for (let q = 0; q < outs.length; q++) { const o = outs[((t.rr || 0) + q) % outs.length]; if (this.accept(o.tile, f, o.dir, t0)) { t.rr = ((t.rr || 0) + q + 1) % outs.length; return true; } }
      return false;
    }
    if (t.ug && t.ug.role === 'in') { const out = t.ug.pair != null ? this.byId.get(t.ug.pair) : null; return !!(out && this.accept(out, f, 'ug', t0)); }
    const nx = this.nextOf(t);
    if (nx && this.accept(nx, f, t.dir, t0)) return true;
    if (t.lift || t.ug) return false;   // a lift or an underground end never spills: it waits for something to take the plush
    if (!nx && (this.game.sinkNear(cellX(t.i) + DX[t.dir] * C, cellZ(t.k) + DZ[t.dir] * C) || this.game.sinkNear(cellX(t.i), cellZ(t.k)))) { this.game.sellAuto(f.sp, f.vr, 1); return true; }
    if (!nx && this.game.world.get(t.i + DX[t.dir], t.j, t.k + DZ[t.dir]) === 0 && this.dropEnd(t, f)) return true;
    return false;
  }

  // the open mouth of a vacuum hose pulls loose plush (not The One, not specials) off the floor
  hoseIntake(t, dt) {
    t.suck = (t.suck || 0) - dt; if (t.suck > 0 || t.items.length >= 3) return;
    const sim = this.game.sim, gx = cellX(t.i), gz = cellZ(t.k), gy = t.j * C;
    for (let i = sim.n - 1; i >= 0; i--) {
      if (sim.flag[i] !== 1) continue;
      const dx = sim.x[i] - gx, dz = sim.z[i] - gz; if (dx * dx + dz * dz > 9 || sim.y[i] > gy + 1.8) continue;
      if (sim.sp[i] >= 4090) continue;
      if (this.accept(t, { sp: sim.sp[i], vr: sim.vr[i] }, null)) { sim.remove(i); t.suck = 0.25; this.game.fx.sparkle(gx, gy + 0.4, gz, 2, 0.4, 0.9, 1); break; }
    }
  }

  // a belt that ends in the open spills its plush onto the floor
  dropEnd(t, it) {
    const sim = this.game.sim;
    const i = sim.spawn(it.sp, it.vr, cellX(t.i) + DX[t.dir] * 0.5, t.j * C + 0.3, cellZ(t.k) + DZ[t.dir] * 0.5, DX[t.dir] * 1.2, 0.5, DZ[t.dir] * 1.2, 0);
    return i >= 0;
  }

  // the hopper turns plush into stored charge, one at a time, whenever the whole plush still fits under the cap
  updateCharger(t, dt) {
    if (!this.visualOnly) {
      t.dig = (t.dig || 0) - dt;
      if (t.q.length && t.dig <= 0) {
        const it = t.q[0], r = Math.min(3, species[it.sp] ? species[it.sp].rarity : 0), v = CHARGE_PER[r];
        if ((t.reserve || 0) + v <= CHARGER_CAP + 1e-9) { t.q.shift(); t.reserve = Math.min(CHARGER_CAP, (t.reserve || 0) + v); t.dig = 0.2; this.game.fx.sparkle(cellX(t.i), t.j * C + 0.55, cellZ(t.k), 3, 0.3, 0.9, 1); }
      }
    }
    const o = this.objs.get(t.id);
    if (!o) return;
    const live = (t.reserve || 0) > 0.02;
    const coil = o.getObjectByName('coil'); if (coil) coil.material = live ? M.glowB : M.dark;
    const bolt = o.getObjectByName('bolt'); if (bolt) { bolt.visible = live; bolt.rotation.y += dt * 2; bolt.position.y = 0.5 + Math.sin(this.game.time * 3 + t.i) * 0.03; bolt.scale.setScalar(0.6 + Math.min(1, (t.reserve || 0) / CHARGER_CAP) * 0.9); }
  }

  updateGen(t, dt, tick) {
    const o = this.objs.get(t.id);
    if (!o) return;
    const win = o.getObjectByName('win');
    const lit = t.burn > 0;
    if (win) win.material = lit ? M.glowO : M.dark;
    if (lit && Math.random() < dt * 5) this.game.fx.smoke(cellX(t.i) + 0.18, t.j * C + 1.1, cellZ(t.k) - 0.15);
  }

  // ---- lifts and underground ends (belt tiles that are drawn as their own meshes) ----
  // a new exit tells its entry where it is (the host announces the entry's new state to a guest)
  linkUg(ent) {
    if (ent.ug.role !== 'out' || ent.ug.pair == null) return;
    const p = this.byId.get(ent.ug.pair);
    if (!p || !p.ug || p.ug.role !== 'in' || p.ug.pair != null) return;
    p.ug.pair = ent.id; p.ug.span = ent.ug.span;
    this.buildUg(p);
    if (!p.view) { this.game.netSend({ t: 'ent-', id: p.id }); this.game.netSend({ t: 'ent+', ent: this.game.stripEnt(p) }); }
  }

  // taking one end down leaves the other one unpaired
  unlinkUg(ent) {
    if (ent.ug.pair == null) return;
    const p = this.byId.get(ent.ug.pair);
    if (!p || !p.ug || p.ug.pair !== ent.id) return;
    p.ug.pair = null;
    this.buildUg(p);
    if (!p.view) { this.game.netSend({ t: 'ent-', id: p.id }); this.game.netSend({ t: 'ent+', ent: this.game.stripEnt(p) }); }
  }

  tierMat(tier) {
    const c = this._tierMats || (this._tierMats = []);
    return c[tier] || (c[tier] = new THREE.MeshStandardMaterial({ color: TIER_COLOR[tier], roughness: 0.45, metalness: 0.5 }));
  }

  buildLift(ent) {
    const old = this.objs.get(ent.id); if (old) { this.game.machines.disposeObj(old); this.root.remove(old); }
    const h = Math.abs(ent.lift.h), H = h * C, tint = this.tierMat(tierOf(ent));
    const g = new THREE.Group();
    g.position.set(cellX(ent.i), (ent.j + (ent.lift.h < 0 ? ent.lift.h : 0)) * C, cellZ(ent.k));   // a down lift stands below its tile
    g.rotation.y = YAW[ent.dir || 0];
    const sway = new THREE.Group(); sway.name = 'sway'; g.add(sway);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.07, 0.58), M.steel); base.position.y = 0.035; sway.add(base);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, H, 0.05), tint); post.position.set(sx * 0.26, H / 2, sz * 0.26); sway.add(post); }
    for (const sx of [-1, 1]) { const panel = new THREE.Mesh(new THREE.BoxGeometry(0.03, H, 0.46), M.dark); panel.position.set(sx * 0.24, H / 2, 0); sway.add(panel); }
    for (let y = 1.2; y < H - 0.1; y += 1.2) for (const sz of [-1, 1]) { const brace = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.035, 0.035), M.steel); brace.position.set(0, y, sz * 0.26); sway.add(brace); }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.58), M.yellow); cap.position.y = H; sway.add(cap);
    const arr = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 4), M.glowG); arr.rotation.x = Math.PI / 2; arr.position.set(0, H + 0.1, 0.18); sway.add(arr);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.glowO); lamp.position.set(0.2, H + 0.12, -0.2); lamp.name = 'lamp'; sway.add(lamp);
    g.userData.sway = sway; g.userData.lamp = lamp;
    this.root.add(g);
    this.objs.set(ent.id, g);
  }

  // the lamp shows power and support; a lift that lacks its frames sways and stands still
  liftLook(t, time) {
    const o = this.objs.get(t.id); if (!o) return;
    const sup = this.liftSupport(t), sw = o.userData.sway, lamp = o.userData.lamp;
    const want = !sup.ok ? M.glowR : (t.pw ?? 0) > 0.05 ? M.glowG : M.glowO;
    if (lamp && lamp.material !== want) lamp.material = want;
    if (!sw) return;
    if (!sup.ok) { const a = 0.012 + Math.abs(t.lift.h) * 0.0012; sw.rotation.z = Math.sin(time * 1.9 + t.i) * a; sw.rotation.x = Math.cos(time * 1.3 + t.k) * a * 0.7; }
    else if (sw.rotation.z !== 0 || sw.rotation.x !== 0) sw.rotation.set(0, 0, 0);
  }

  buildUg(ent) {
    const old = this.objs.get(ent.id); if (old) { this.game.machines.disposeObj(old); this.root.remove(old); }
    const isIn = ent.ug.role === 'in', tint = this.tierMat(tierOf(ent));
    const g = new THREE.Group();
    g.position.set(cellX(ent.i), ent.j * C, cellZ(ent.k));
    g.rotation.y = YAW[ent.dir || 0];
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.06, 0.58), M.steel); plate.position.y = 0.03; g.add(plate);
    for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.58), tint); rail.position.set(s * 0.27, 0.1, 0); g.add(rail); }
    // the hood is the tunnel mouth: at the front of an entry (plush ride in under it), at the back of an exit (they come out of it)
    const hz = isIn ? 0.15 : -0.15;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.36, 0.28), M.dark); hood.position.set(0, 0.24, hz); g.add(hood);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.32), tint); top.position.set(0, 0.44, hz); g.add(top);
    const arr = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 4), M.glowG); arr.rotation.x = Math.PI / 2; arr.position.set(0, 0.52, hz); g.add(arr);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), ent.ug.pair != null ? M.glowG : M.glowO); lamp.position.set(0.2, 0.52, hz); lamp.name = 'lamp'; g.add(lamp);
    this.root.add(g);
    this.objs.set(ent.id, g);
  }

  // ---- splitters: a belt piece that deals plush out forward, left and right in turn ----
  buildSplitter(ent) {
    const old = this.objs.get(ent.id); if (old) { this.game.machines.disposeObj(old); this.root.remove(old); }
    const g = new THREE.Group();
    g.position.set(cellX(ent.i), ent.j * C, cellZ(ent.k));
    g.rotation.y = YAW[ent.dir || 0];
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.07, 0.58), M.yellow); plate.position.y = 0.1;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.12, 14), M.dark); hub.position.y = 0.18;
    g.add(plate, hub);
    for (const a of [0, Math.PI / 2, -Math.PI / 2]) { const ag = new THREE.Group(); ag.rotation.y = a; const arr = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.17, 4), M.glowG); arr.rotation.x = Math.PI / 2; arr.position.set(0, 0.21, 0.2); ag.add(arr); g.add(ag); }
    this.root.add(g);
    this.objs.set(ent.id, g);
    ent.rr = ent.rr || 0;
  }

  // forward, left and right neighbours of a splitter that currently exist
  splitOuts(t) {
    const outs = [];
    for (const d of [t.dir, (t.dir + 1) & 3, (t.dir + 3) & 3]) {
      const n = this.tiles.get(idx(t.i + DX[d], t.j + (d === t.dir ? (t.rise || 0) : 0), t.k + DZ[d]));
      if (n && n !== t) outs.push({ tile: n, dir: d });
    }
    return outs;
  }

  // ---- detector gates ----
  buildGate(ent) {
    const g = new THREE.Group();
    g.position.set(cellX(ent.i), ent.j * C, cellZ(ent.k));
    g.rotation.y = YAW[ent.dir || 0];
    // sized for a full grown robot or a person to walk straight through: 2.3 m tall, 1.9 m between the posts
    const post = new THREE.BoxGeometry(0.12, 2.3, 0.2);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(post, M.steel); p.position.set(s * 0.95, 1.15, 0); g.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.26, 0.28), M.yellow); beam.position.y = 2.3; g.add(beam);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M.glowG); led.position.set(0, 2.47, 0.16); led.name = 'led'; g.add(led);
    const led2 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M.glowG); led2.position.set(0.5, 2.47, 0.16); led2.name = 'led2'; g.add(led2);
    const led3 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M.glowG); led3.position.set(-0.5, 2.47, 0.16); led3.name = 'led3'; g.add(led3);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.03, 6, 24, Math.PI), M.dark); coil.position.y = 1.4; g.add(coil);
    // the pull-aside bay: a hazard-striped pad beside the lane where a flagged robot is parked
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.03, 1.3), M.yellow); pad.position.set(0, 0.02, 1.7); pad.name = 'bay'; g.add(pad);
    this.root.add(g);
    this.objs.set(ent.id, g);
    ent.beepT = 0;
    if (ent.alarm) this.setGate(ent, true);
  }

  setGate(ent, red) {
    const o = this.objs.get(ent.id);
    if (!o) return;
    for (const n of ['led', 'led2', 'led3']) { const led = o.getObjectByName(n); if (led) led.material = red ? M.glowR : M.glowG; }
  }

  // returns true when the item must be pulled off the belt (it is The One)
  scanItem(t, it) {
    const g = this.game;
    const near = Math.hypot(cellX(t.i) - g.player.pos.x, cellZ(t.k) - g.player.pos.z) < 30;
    if (it.sp === NEEDLE) {
      t.held = { sp: it.sp, vr: it.vr };
      t.alarm = true;
      this.setGate(t, true);
      this.recomputeHalt();
      g.needleAlarm(t);
      return true;
    }
    this.setGate(t, false);
    g.S.stats.scans = (g.S.stats.scans || 0) + 1;
    t.flash = 0.18;
    if (near) g.gateDing(0.05, 0.035);
    return false;
  }

  gateTick(dt) {
    for (const t of this.tiles.values()) {
      if (t.type !== 'belt' || !t.detector) continue;
      if (t.alarm) {
        t.beepT = (t.beepT || 0) - dt;
        if (t.beepT <= 0) { t.beepT = 0.55; this.setGate(t, (Math.floor(this.game.time * 3) % 2) === 0); const d = Math.hypot(cellX(t.i) - this.game.player.pos.x, cellZ(t.k) - this.game.player.pos.z); if (d < 60) { this.game.sound.tone('square', 880, 880, 0.18, 0.09 * (1 - d / 60)); this.game.sound.tone('square', 660, 660, 0.18, 0.09 * (1 - d / 60), 0.2); } }
      } else if (t.flash > 0) { t.flash -= dt; if (t.flash <= 0) this.setGate(t, false); }
    }
  }

  // when a gate is in alarm the whole belt line it sits on stops until someone takes the item
  recomputeHalt() {
    const rev = new Map();
    for (const t of this.tiles.values()) { t.halt = false; if (t.type === 'belt') { const nx = this.nextOf(t); if (nx && nx.type === 'belt') { if (!rev.has(nx.id)) rev.set(nx.id, []); rev.get(nx.id).push(t); } } }
    for (const g of this.tiles.values()) {
      if (g.type !== 'belt' || !g.detector || !g.alarm) continue;
      const stack = [g]; let n = 0;
      while (stack.length && n++ < 800) {
        const t = stack.pop();
        if (t.halt) continue;
        t.halt = true;
        const nx = this.nextOf(t);
        if (nx && nx.type === 'belt' && !nx.halt) stack.push(nx);
        for (const u of rev.get(t.id) || []) if (!u.halt) stack.push(u);
      }
    }
  }

  // the gate that costs a robot the least detour on its way home
  bestGate(x, z, hx, hz) {
    let best = null, bd = Infinity;
    for (const t of this.tiles.values()) {
      if (t.type !== 'belt' || !t.detector) continue;
      const gx = cellX(t.i), gz = cellZ(t.k);
      if (Math.hypot(gx - hx, gz - hz) > 80) continue; // only gates in the bay area count as the gate on the way in
      const d = Math.hypot(gx - x, gz - z) + Math.hypot(gx - hx, gz - hz);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  nearestGate(x, z, r) {
    let best = null, bd = r;
    for (const t of this.tiles.values()) {
      if (t.type !== 'belt' || !t.detector) continue;
      const d = Math.hypot(cellX(t.i) - x, cellZ(t.k) - z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  updateSorter(t, dt) {
    const g = this.game, T = g.T;
    t.timer -= dt * (t.pw ?? 0);
    // front tile
    const front = this.tiles.get(idx(t.i + DX[t.dir], t.j, t.k + DZ[t.dir])) || this.tiles.get(idx(t.i + DX[t.dir], t.j + 1, t.k + DZ[t.dir])) || this.tiles.get(idx(t.i + DX[t.dir], t.j - 1, t.k + DZ[t.dir]));
    // kept items try to leave
    if (t.kept.length && front && this.accept(front, t.kept[0], t.dir)) t.kept.shift();
    if (!t.q.length) { this.setLamp(t, M.glowG); return; }
    const head = t.q[0];
    head.t += dt * T.beltSpeed * 1.4 * (t.pw ?? 0);
    if (head.t < 1) { this.setLamp(t, M.glowO); return; }
    const sp = species[head.sp];
    if (sp.rarity < t.filter) {
      t.q.shift();
      g.sellAuto(head.sp, head.vr, 1.0);
      g.fx.coin(cellX(t.i), t.j * C + 0.7, cellZ(t.k), 2);
      g.stats_sorted = (g.stats_sorted || 0) + 1;
      this.setLamp(t, M.glowG);
    } else if (front && this.accept(front, head, t.dir)) {
      t.q.shift();
    } else if (t.kept.length < 60 && !front) {
      t.kept.push(t.q.shift());
      g.registerDex(head.sp, true);
    } else this.setLamp(t, M.glowR);
  }

  // ---------------------------------------------------------------- mech
  mechCell(m, f, l, v) {
    const d = m.dir, px = DZ[d] !== 0 ? 1 : 0, pz = DX[d] !== 0 ? 1 : 0;
    return [m.i + DX[d] * f + px * l, m.j + v, m.k + DZ[d] * f + pz * l];
  }

  updateMech(m, dt) {
    const g = this.game, T = g.T, w = g.world;
    const obj = this.objs.get(m.id);
    if (m.off) { this.setLamp(m, M.glowR); return; }
    // output to a belt behind or beside
    m.out -= dt;
    if (m.buf.length && m.out <= 0) {
      m.out = 0.3;
      const back = [[-1, 0], [0, 1], [0, -1]];
      for (const [f, l] of back) {
        const [i, , k] = this.mechCell(m, f, l, 0);
        for (const dj of [0, -1, 1]) {
          const t = this.tiles.get(idx(i, m.j + dj, k));
          if (t && t.type === 'belt' && t.dir !== m.dir && this.accept(t, m.buf[0], null)) { m.buf.shift(); f; l; break; }
          if (t && (t.type === 'sorter' || t.type === 'vault') && this.accept(t, m.buf[0], null)) { m.buf.shift(); break; }
        }
      }
    }
    const cap = T.mechBuffer;
    if (m.buf.length >= cap) { this.setLamp(m, M.glowO); return; }
    m.timer -= dt * (m.pw ?? 0);
    if ((m.pw ?? 0) < 0.05) { this.setLamp(m, M.glowR); return; }
    // arm animation
    const arm = obj && obj.getObjectByName('arm');
    if (m.arm && arm) {
      const [ax, ay, az] = m.arm;
      const wp = this.v.set(ax, ay, az);
      obj.worldToLocal(wp);
      const from = arm.position;
      const dx = wp.x - from.x, dy = wp.y - from.y, dz = wp.z - from.z;
      const len = Math.hypot(dx, dy, dz);
      arm.lookAt(wp.x + obj.position.x * 0, wp.y, wp.z);
      const seg = arm.getObjectByName('seg'), claw = arm.getObjectByName('claw');
      seg.scale.y = len; seg.position.z = len / 2; claw.position.z = len;
    }
    if (m.timer > 0) return;
    // find something to dig: nearest first
    let best = null, bs = 1e9;
    for (let f = 1; f <= 2; f++) for (let l = -1; l <= 1; l++) for (let v = 0; v <= 2; v++) {
      const [i, j, k] = this.mechCell(m, f, l, v);
      const s = w.get(i, j, k);
      if (!s || isSpecialCell(s) || w.reserved.has(idx(i, j, k))) continue;
      const sc = f * 10 + Math.abs(l) * 3 + v;
      if (sc < bs) { bs = sc; best = [i, j, k]; }
    }
    if (best) {
      const it = w.removeCell(best[0], best[1], best[2]);
      if (!it) m.timer = 0.5;
      if (it) {
        g.mechDug(it, cellX(best[0]), cellY(best[1]), cellZ(best[2]));
        m.buf.push({ sp: it.sp, vr: it.vr });
        m.arm = [cellX(best[0]), cellY(best[1]), cellZ(best[2])];
        m.timer = T.mechRate * compaction(cellX(m.i), cellZ(m.k));
        this.setLamp(m, M.glowG);
      }
      return;
    }
    // nothing within reach: advance
    const [ni, , nk] = this.mechCell(m, 1, 0, 0);
    const okAhead = !w.solid(ni, m.j, nk) && !this.tiles.has(idx(ni, m.j, nk)) && (m.j === 0 || w.solid(ni, m.j - 1, nk));
    if (!okAhead) { this.setLamp(m, M.glowR); m.timer = 1.0; m.state = 'stuck'; return; }
    const oldKey = idx(m.i, m.j, m.k), oi = m.i, oj = m.j, ok = m.k;
    this.tiles.delete(oldKey); w.reserved.delete(oldKey);
    m.i = ni; m.k = nk; m.adv++;
    const nkey = idx(m.i, m.j, m.k);
    this.tiles.set(nkey, m); w.reserved.add(nkey);
    if (obj) obj.position.set(cellX(m.i), m.j * C, cellZ(m.k));
    m.timer = T.mechRate * 0.8 * compaction(cellX(m.i), cellZ(m.k));
    g.noteDist(cellX(m.i), cellZ(m.k));
    m.arm = null;
    if (T.mechLayer && !this.tiles.has(oldKey) && g.S.money >= 3) {
      g.S.money -= 3; g.ui.setMoney(g.S.money);
      g.layBelt(oi, oj, ok, (m.dir + 2) & 3);
    }
    if (T.mechBolt && m.adv % 3 === 0) g.machines.autoFrame(oi, oj, ok, m.dir);
    this.dirty = true;
  }

  // ---------------------------------------------------------------- items rendering
  // where an item stands on a corner: a quadratic Bezier from the feeder's edge through the middle of the cell to the exit edge (the same curve the arc mesh follows)
  cornerPoint(t, s, out) {
    const cx = cellX(t.i), cz = cellZ(t.k), u = 1 - s, h = C * 0.5;
    const ax = cx - DX[t.cd] * h, az = cz - DZ[t.cd] * h, bx = cx + DX[t.dir] * h, bz = cz + DZ[t.dir] * h;
    out.x = u * u * ax + 2 * u * s * cx + s * s * bx; out.z = u * u * az + 2 * u * s * cz + s * s * bz;
  }

  forEachItem(cb) {
    const pt = this._pt || (this._pt = { x: 0, z: 0 });
    for (const t of this.tiles.values()) {
      if (t.type === 'belt') {
        const cx = cellX(t.i), cz = cellZ(t.k);
        if (t.lift) {
          // in over the back edge, up the shaft, out over the front edge of the top: the next tile's first plush starts where this one ends
          const h = Math.abs(t.lift.h), dn = t.lift.h < 0 ? -1 : 1, y0 = t.j * C + 0.2;
          for (const it of t.items) {
            const u = it.t; let off = 0, y = y0;
            if (u < 0.5) off = (u - 0.5) * C; else if (u <= h + 0.5) y = y0 + dn * (u - 0.5) * C; else { off = (u - h - 0.5) * C; y = y0 + dn * h * C; }
            cb(it, cx + DX[t.dir] * off, y, cz + DZ[t.dir] * off, 0.4);
          }
          continue;
        }
        const ugIn = t.ug && t.ug.role === 'in' && t.ug.pair != null, ugOut = t.ug && t.ug.role === 'out';
        for (const it of t.items) {
          if (ugIn && it.t > 0.5) continue;    // under the hatch
          if (ugOut && it.t < 0.5) continue;   // not out of it yet
          const u = it.t - 0.5;
          let x = cx + DX[t.dir] * u * C, z = cz + DZ[t.dir] * u * C;
          if (t.cd != null) { this.cornerPoint(t, Math.max(0, Math.min(1, it.t)), pt); x = pt.x; z = pt.z; }
          const y = t.j * C + 0.2 + (t.rise ? (u + 0.5) * t.rise * C : 0) + (t.rise ? 0.3 : 0);
          cb(it, x, y, z, 0.4);
        }
      } else if (t.type === 'sorter') {
        for (const it of t.q) cb(it, cellX(t.i) + DX[t.dir] * (it.t - 0.5) * 0.5, t.j * C + 0.62, cellZ(t.k) + DZ[t.dir] * (it.t - 0.5) * 0.5, 0.34);
      } else if (t.type === 'mech') {
        const n = Math.min(3, t.buf.length);
        for (let q = 0; q < n; q++) cb(t.buf[q], cellX(t.i), t.j * C + 1.0 + q * 0.12, cellZ(t.k), 0.3);
      }
    }
  }

  vaultInfo(t) { return t.type === 'vault' ? `${t.stored.length}/${this.vaultCap()}` : ''; }
}
