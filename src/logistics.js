import * as THREE from 'three';
import { C, NX, NY, NZ, cellX, cellY, cellZ, toI, toJ, toK, idx } from './config.js';
import { species, RARITY, NEEDLE, BULK } from './plushdata.js';
import { compaction } from './util.js';
import { FUEL_MAX_RARITY } from './power.js';

export const DX = [1, 0, -1, 0];
export const DZ = [0, 1, 0, -1];
export const LOGI = new Set(['belt', 'sorter', 'vault', 'mech', 'gen', 'pole', 'fan']);
const YAW = [Math.PI / 2, 0, -Math.PI / 2, Math.PI]; // model +Z -> dir
const MAXBELT = 4500;

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
  rail: new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.45, metalness: 0.5 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x59636e, roughness: 0.4, metalness: 0.85 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.6, metalness: 0.6 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xe8b81c, roughness: 0.5, metalness: 0.35 }),
  crate: new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.85 }),
  glowG: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3, 1) }),
  glowO: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 1.4, 0.3) }),
  glowR: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 0.3, 0.2) }),
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
    this.bedMesh = new THREE.InstancedMesh(bedG, M.bed, MAXBELT);
    this.railMesh = new THREE.InstancedMesh(railG, M.rail, MAXBELT * 2);
    for (const m of [this.bedMesh, this.railMesh]) { m.frustumCulled = false; m.count = 0; this.root.add(m); }
    this.dirty = true;
    this.hum = 0;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.sc = new THREE.Vector3(1, 1, 1);
  }

  clear() {
    this.tiles.clear();
    for (const o of this.objs.values()) this.root.remove(o);
    this.objs.clear();
    this.dirty = true;
  }

  tileAt(i, j, k) { return this.tiles.get(idx(i, j, k)); }
  count(type) { let n = 0; for (const t of this.tiles.values()) if (t.type === type) n++; return n; }

  // ---------------------------------------------------------------- placement
  canPlace(i, j, k) {
    const w = this.game.world;
    if (!w.inside(i, j, k) || w.solid(i, j, k)) return 'Blocked';
    if (this.tiles.has(idx(i, j, k))) return 'Occupied';
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
    const d = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 2) : (fz > 0 ? 1 : 3);
    const why = this.canPlace(a.i, a.j, a.k);
    return { ok: !why, why, ent: { type: kind, i: a.i, j: a.j, k: a.k, dir: d, rise: kind === 'belt' ? rise : 0 } };
  }

  pick(eye, dir, maxD = 3.6) {
    for (let t = 0.3; t < maxD; t += 0.12) {
      const i = toI(eye.x + dir.x * t), j = toJ(eye.y + dir.y * t), k = toK(eye.z + dir.z * t);
      for (let dj = 0; dj >= -1; dj--) {
        const e = this.tiles.get(idx(i, j + dj, k));
        if (e) return e;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- add / remove
  add(ent) {
    ent.items = ent.items || [];
    if (ent.type === 'sorter') { ent.q = ent.q || []; ent.kept = ent.kept || []; ent.timer = 0; ent.mode = ent.mode || 0; ent.filter = ent.filter ?? 7; }
    if (ent.type === 'vault') ent.stored = ent.stored || [];
    if (ent.type === 'gen') { ent.q = ent.q || []; ent.burn = ent.burn || 0; ent.lit = false; }
    if (ent.type === 'mech') { ent.buf = ent.buf || []; ent.timer = 1.0; ent.out = 0; ent.state = 'dig'; ent.adv = ent.adv || 0; ent.arm = null; }
    const key = idx(ent.i, ent.j, ent.k);
    this.tiles.set(key, ent);
    this.game.world.reserved.add(key);
    if (ent.type !== 'belt') this.buildObj(ent);
    this.dirty = true;
  }

  remove(ent) {
    const key = idx(ent.i, ent.j, ent.k);
    this.tiles.delete(key);
    this.game.world.reserved.delete(key);
    const o = this.objs.get(ent.id);
    if (o) { this.root.remove(o); this.objs.delete(ent.id); }
    this.dirty = true;
  }

  // ---------------------------------------------------------------- meshes
  buildObj(ent) {
    const g = new THREE.Group();
    g.position.set(cellX(ent.i), ent.j * C, cellZ(ent.k));
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

  setLamp(ent, mat) {
    const o = this.objs.get(ent.id);
    const lamp = o && o.getObjectByName('lamp');
    if (lamp) lamp.material = mat;
  }

  rebuildBelts() {
    this.dirty = false;
    let n = 0, r = 0;
    const bm = this.bedMesh.instanceMatrix.array, rm = this.railMesh.instanceMatrix.array;
    const m = this.m4, q = this.q, e = this.e, v = this.v, sc = this.sc;
    for (const t of this.tiles.values()) {
      if (t.type !== 'belt' || n >= MAXBELT) continue;
      const ang = YAW[t.dir];
      const tilt = t.rise * Math.PI / 4;
      e.set(-tilt, ang, 0, 'YXZ'); q.setFromEuler(e);
      const len = t.rise ? 1.414 : 1;
      const y = t.j * C + 0.045 + (t.rise ? 0.3 : 0);
      sc.set(1, 1, len);
      v.set(cellX(t.i), y, cellZ(t.k)); m.compose(v, q, sc);
      m.toArray(bm, n * 16);
      for (const s of [-1, 1]) {
        const off = new THREE.Vector3(s * 0.27, 0.04, 0).applyQuaternion(q);
        v.set(cellX(t.i) + off.x, y + off.y, cellZ(t.k) + off.z); m.compose(v, q, sc);
        m.toArray(rm, r * 16); r++;
      }
      n++;
    }
    this.bedMesh.count = n; this.railMesh.count = r;
    this.bedMesh.instanceMatrix.needsUpdate = true; this.railMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- simulation
  accept(n, item, fromDir) {
    if (!n) return false;
    if (n.type === 'belt') {
      if (fromDir != null && ((n.dir + 2) & 3) === fromDir) return false; // head-on
      const last = n.items[n.items.length - 1];
      if (n.items.length >= 3 || (last && last.t < 0.34)) return false;
      n.items.push({ sp: item.sp, vr: item.vr, t: 0 });
      return true;
    }
    if (n.type === 'sorter') {
      if (n.q.length >= 3) return false;
      n.q.push({ sp: item.sp, vr: item.vr, t: 0 });
      return true;
    }
    if (n.type === 'gen') {
      if (item.sp === NEEDLE) { this.game.registerDex(NEEDLE); this.game.foundNeedle('a Generator'); return true; }
      const r = species[item.sp] ? species[item.sp].rarity : 9;
      if (r > FUEL_MAX_RARITY || n.q.length >= (this.game.T.genBuffer)) return false;
      n.q.push({ sp: item.sp, vr: item.vr });
      this.game.power.markDirty();
      return true;
    }
    if (n.type === 'vault') {
      if (n.stored.length >= this.vaultCap()) return false;
      n.stored.push({ sp: item.sp, vr: item.vr });
      this.game.registerDex(item.sp);
      return true;
    }
    return false;
  }
  vaultCap() { return 120; }

  nextOf(t) {
    return this.tiles.get(idx(t.i + DX[t.dir], t.j + (t.rise || 0), t.k + DZ[t.dir]));
  }

  update(dt) {
    const g = this.game, T = g.T, S = g.S;
    if (this.dirty) this.rebuildBelts();
    const spd = T.beltSpeed;
    const tick = this.game.time;
    let moving = 0;
    arrowTex.offset.y = (arrowTex.offset.y - dt * spd * 0.5) % 1;
    for (const t of this.tiles.values()) {
      if (t.type === 'belt') {
        const its = t.items;
        if (!its.length) continue;
        const pw = t.pw ?? 0;
        if (pw > 0.02) moving++;
        for (let n = 0; n < its.length; n++) {
          const it = its[n];
          const limit = n === 0 ? 1 : its[n - 1].t - 0.34;
          it.t = Math.min(it.t + spd * pw * dt, Math.max(it.t, limit));
        }
        const f = its[0];
        if (f.t >= 1 && pw > 0.02) {
          const nx = this.nextOf(t);
          if (nx && this.accept(nx, f, t.dir)) its.shift();
          else if (!nx && this.game.sinkNear(cellX(t.i) + DX[t.dir] * C, cellZ(t.k) + DZ[t.dir] * C)) { its.shift(); if (f.sp === NEEDLE) { this.game.registerDex(NEEDLE); this.game.foundNeedle('a belt'); } else this.game.sellAuto(f.sp, f.vr, 1); }
          else if (!nx && this.game.world.get(t.i + DX[t.dir], t.j, t.k + DZ[t.dir]) === 0 && this.dropEnd(t, f)) its.shift();
        }
      } else if (t.type === 'sorter') this.updateSorter(t, dt);
      else if (t.type === 'mech') this.updateMech(t, dt);
      else if (t.type === 'gen') this.updateGen(t, dt, tick);
      else if (t.type === 'fan') { const o = this.objs.get(t.id); const b = o && o.getObjectByName('blades'); if (b) b.rotation.z += dt * 14 * (t.pw ?? 0); }
      else if (t.type === 'pole') { const o = this.objs.get(t.id); const l = o && o.getObjectByName('lamp'); if (l) l.material = (t.pw ?? 0) > 0.6 ? M.glowG : (t.pw ?? 0) > 0.05 ? M.glowO : M.glowR; }
    }
    this.hum = moving;
  }

  // a belt that ends in the open spills its plush onto the floor
  dropEnd(t, it) {
    const sim = this.game.sim;
    const i = sim.spawn(it.sp, it.vr, cellX(t.i) + DX[t.dir] * 0.5, t.j * C + 0.3, cellZ(t.k) + DZ[t.dir] * 0.5, DX[t.dir] * 1.2, 0.5, DZ[t.dir] * 1.2, 0);
    return i >= 0;
  }

  updateGen(t, dt, tick) {
    const o = this.objs.get(t.id);
    if (!o) return;
    const win = o.getObjectByName('win');
    const lit = t.burn > 0;
    if (win) win.material = lit ? M.glowO : M.dark;
    if (lit && Math.random() < dt * 5) this.game.fx.smoke(cellX(t.i) + 0.18, t.j * C + 1.1, cellZ(t.k) - 0.15);
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
    if (head.sp === NEEDLE) { t.q.shift(); g.registerDex(NEEDLE); g.foundNeedle('a Sorting Box'); return; }
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
      g.registerDex(head.sp);
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
      if (!s || s === BULK || w.reserved.has(idx(i, j, k))) continue;
      const sc = f * 10 + Math.abs(l) * 3 + v;
      if (sc < bs) { bs = sc; best = [i, j, k]; }
    }
    if (best) {
      const it = w.removeCell(best[0], best[1], best[2]);
      if (it) {
        g.mechDug(it, cellX(best[0]), cellY(best[1]), cellZ(best[2]));
        if (it.sp === NEEDLE) return;
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
      g.addEntity({ id: g.nextId(), type: 'belt', i: oi, j: oj, k: ok, dir: (m.dir + 2) & 3, rise: 0, items: [] });
    }
    if (T.mechBolt && m.adv % 3 === 0) g.machines.autoFrame(oi, oj, ok, m.dir);
    this.dirty = true;
  }

  // ---------------------------------------------------------------- items rendering
  forEachItem(cb) {
    for (const t of this.tiles.values()) {
      if (t.type === 'belt') {
        for (const it of t.items) {
          const u = it.t - 0.5;
          const x = cellX(t.i) + DX[t.dir] * u * C, z = cellZ(t.k) + DZ[t.dir] * u * C;
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
