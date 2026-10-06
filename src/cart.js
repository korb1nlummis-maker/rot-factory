import * as THREE from 'three';
import { C, HALL_HX, HALL_HZ, toI, toJ, toK } from './config.js';
import { resolveSphere } from './sim.js';
import { clamp } from './util.js';

export const CART_CAP = [0, 24, 60, 150, 400, 1000];
export const CART_NAMES = ['', 'Wheelbarrow', 'Hand Cart', 'Pallet Cart', 'Trolley', 'Flatbed'];
export const CART_PRICE = [0, 40, 220, 1400, 9500, 65000];

const M = {
  tray: new THREE.MeshStandardMaterial({ color: 0xb9561f, roughness: 0.6, metalness: 0.4 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.5, metalness: 0.8 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 }),
  hub: new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.3, metalness: 0.9 }),
  grip: new THREE.MeshStandardMaterial({ color: 0x1f6f4a, roughness: 0.8 }),
  lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 3, 1.8) }),
};

function dims(t) { return { w: 0.6 + 0.13 * t, l: 0.8 + 0.2 * t, h: 0.26 + 0.03 * t }; }

function buildMesh(t) {
  const g = new THREE.Group();
  const { w, l, h } = dims(t);
  const baseY = 0.3;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, l), M.tray); floor.position.y = baseY;
  g.add(floor);
  for (const sx of [-1, 1]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, l), M.tray); s.position.set(sx * w / 2, baseY + h / 2, 0); g.add(s); }
  for (const sz of [-1, 1]) { const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), M.tray); s.position.set(0, baseY + h / 2, sz * l / 2); g.add(s); }
  // chassis
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, l + 0.2), M.frame); bar.position.set(0, baseY - 0.05, 0); g.add(bar);
  // wheels
  const wr = 0.14 + 0.02 * t;
  const wheelAt = (x, z) => {
    const wh = new THREE.Group(); wh.position.set(x, wr, z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, 0.07, 16), M.tire); tire.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(wr * 0.45, wr * 0.45, 0.08, 10), M.hub); hub.rotation.z = Math.PI / 2;
    wh.add(tire, hub); wh.name = 'wheel'; g.add(wh);
  };
  if (t === 1) wheelAt(0, l / 2 - 0.05);
  else { wheelAt(-w / 2 - 0.02, l / 2 - 0.12); wheelAt(w / 2 + 0.02, l / 2 - 0.12); }
  if (t >= 3) { wheelAt(-w / 2 - 0.02, -l / 2 + 0.12); wheelAt(w / 2 + 0.02, -l / 2 + 0.12); }
  // handles at the back
  for (const sx of [-1, 1]) {
    const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 8), M.grip);
    hd.rotation.x = Math.PI / 2 - 0.35; hd.position.set(sx * (w / 2 - 0.05), baseY + 0.12, -l / 2 - 0.22); g.add(hd);
  }
  if (t >= 4) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, h + 0.35, 6), M.frame); p.position.set(sx * w / 2, baseY + (h + 0.35) / 2, sz * l / 2); g.add(p); }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), M.lamp); lamp.position.set(0, baseY + h + 0.38, l / 2); g.add(lamp);
  }
  return g;
}

export class Cart {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    game.renderer.scene.add(this.root);
    this.obj = null;
    this.builtTier = 0;
    this.vy = 0;
    this.wheelSpin = 0;
  }

  get c() { return this.game.S.cart; }
  cap() { return this.c ? CART_CAP[this.c.tier] : 0; }
  room() { return this.c ? Math.max(0, this.cap() - this.c.load.length) : 0; }

  sync() {
    const c = this.c;
    if (!c) { this.clear(); return; }
    if (!this.obj || this.builtTier !== c.tier) {
      this.clear();
      this.obj = buildMesh(c.tier); this.builtTier = c.tier;
      this.root.add(this.obj);
    }
    this.obj.position.set(c.x, c.y, c.z);
    this.obj.rotation.y = c.yaw;
  }

  clear() { if (this.obj) { this.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); this.root.remove(this.obj); this.obj = null; } }

  deploy(tier, at) {
    const g = this.game, p = at || { pos: g.player.pos, yaw: g.player.yaw };
    g.S.cart = { tier, x: p.pos.x + Math.sin(p.yaw) * 1.4, y: Math.max(0, p.pos.y), z: p.pos.z + Math.cos(p.yaw) * 1.4, yaw: p.yaw, mode: 'follow', load: [] };
    this.sync();
    g.fx.dust(g.S.cart.x, g.S.cart.y + 0.1, g.S.cart.z, 6, 0.6, 0.6);
  }

  stow() { this.game.S.cart = null; this.clear(); }

  guestUpdate(dt) {
    const c = this.c;
    if (!c) { this.clear(); return; }
    if (!this.obj || this.builtTier !== c.tier) this.sync();
    const k = Math.min(1, dt * 10);
    if (c.gx !== undefined) { c.x += (c.gx - c.x) * k; c.y += (c.gy - c.y) * k; c.z += (c.gz - c.z) * k; c.yaw = c.gyaw; }
    this.wheelSpin += Math.hypot(c.gx - c.x, c.gz - c.z) * 4;
    if (this.obj) { this.obj.position.set(c.x, c.y, c.z); this.obj.rotation.y = c.yaw; this.obj.traverse((o) => { if (o.name === 'wheel') o.rotation.x = this.wheelSpin; }); }
  }

  update(dt) {
    const c = this.c;
    if (!c) return;
    if (!this.obj || this.builtTier !== c.tier) this.sync();
    const g = this.game, p = g.player, w = g.world;
    const px = p.pos.x, pz = p.pos.z;
    let tx = c.x, tz = c.z;
    const dist = Math.hypot(px - c.x, pz - c.z);
    if (c.mode === 'follow') {
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      tx = px - fx * 1.8 + fz * 0.9; tz = pz - fz * 1.8 - fx * 0.9;
      if (dist > 45) { // it catches up when you have left it far behind
        c.x = tx; c.z = tz; c.y = p.pos.y; this.vy = 0;
        g.fx.sparkle(c.x, c.y + 0.5, c.z, 10, 0.8, 0.9, 1);
      }
    }
    const dx = tx - c.x, dz = tz - c.z;
    const d = Math.hypot(dx, dz);
    let vx = 0, vz = 0;
    if (c.mode === 'follow' && d > 0.25) {
      const s = Math.min(6.2, d * 3.2);
      vx = dx / d * s; vz = dz / d * s;
      const want = Math.atan2(vx, vz);
      let dy = ((want - c.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      c.yaw += dy * Math.min(1, dt * 6);
    }
    this.vy -= 16 * dt;
    const r = 0.36;
    const pos = { x: c.x + vx * dt, y: c.y + r + this.vy * dt, z: c.z + vz * dt };
    const cont = this._c || (this._c = { hits: 0, nx: 0, ny: 0, nz: 0, deep: 0 });
    let blocked = false;
    for (let it = 0; it < 3; it++) {
      if (resolveSphere(w, pos, r, cont)) {
        if (cont.ny > 0.5) { if (this.vy < 0) this.vy = 0; } else if (d > 0.4) blocked = true;
      }
    }
    if (pos.y - r < 0) { pos.y = r; if (this.vy < 0) this.vy = 0; }
    c.x = clamp(pos.x, -HALL_HX + 1, HALL_HX - 1); c.z = clamp(pos.z, -HALL_HZ + 1, HALL_HZ - 1); c.y = pos.y - r;
    if (blocked && Math.abs(this.vy) < 0.5) this.vy = 3.6;
    this.wheelSpin += Math.hypot(vx, vz) * dt / 0.16;
    if (this.obj) {
      this.obj.position.set(c.x, c.y, c.z);
      this.obj.rotation.y = c.yaw;
      this.obj.traverse((o) => { if (o.name === 'wheel') o.rotation.x = this.wheelSpin; });
    }
  }

  // plush riding on the tray
  forEachItem(cb) {
    const c = this.c;
    if (!c || !c.load.length) return;
    const { w, l, h } = dims(c.tier);
    const sc = 0.2;
    const cs = 0.17;
    const cols = Math.max(1, Math.floor((w - 0.06) / cs)), rows = Math.max(1, Math.floor((l - 0.06) / cs));
    const per = cols * rows;
    const n = Math.min(c.load.length, per * 5);
    const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
    for (let i = 0; i < n; i++) {
      const layer = Math.floor(i / per), k = i % per;
      const col = k % cols, row = Math.floor(k / cols);
      const lx = (col - (cols - 1) / 2) * cs + ((layer & 1) ? cs * 0.5 : 0) - ((layer & 1) ? 0.04 : 0);
      const lz = (row - (rows - 1) / 2) * cs;
      const wx = c.x + lx * cy + lz * sy, wz = c.z - lx * sy + lz * cy;
      const it = c.load[c.load.length - 1 - i];
      cb(it, wx, c.y + 0.3 + 0.03 + sc * 0.55 + layer * 0.16, wz, sc + 0.1);
    }
    void h;
  }
}
