import * as THREE from 'three';
import { C, NX, NZ, HALL_HX, HALL_HZ, cellX, cellY, cellZ, toI, toJ, toK } from './config.js';
import { resolveSphere } from './sim.js';
import { compaction, clamp } from './util.js';
import { NEEDLE, BULK, REMAINS, isSpecialCell } from './plushdata.js';
import { DX, DZ, CHARGE_RATE, CHARGER_RANGE } from './logistics.js';
import { CART_CAP } from './cart.js';

const NAMES = ['Pip', 'Bolt', 'Nub', 'Clank', 'Sprocket', 'Widget', 'Doodle', 'Tinker', 'Gizmo', 'Rivet', 'Dot', 'Fidget', 'Cog', 'Bleep'];
const COLORS = [0xd9a21c, 0xc9742b, 0x7fa6b8, 0x93b85d, 0xb87aa4, 0xd4c13a];
const DIRNAME = ['East', 'South', 'West', 'North'];
// battery rules: below LOW a bot needs power; with no station it waits at the bin and trickles up to OK
export const LOW_BATTERY = 0.25, OK_BATTERY = 0.35, TRICKLE = 0.02;
export const STATUS = { haulgo: 'Fetching your cart load', held: 'Held at the gate', idle: 'Hanging around', follow: 'Following you', goto: 'Heading out', farm: 'Digging', advance: 'Advancing', return: 'Hauling back', unload: 'Unloading', charge: 'Charging', chgwalk: 'Heading to a charger', recharge: 'Recharging at a station', lowbat: 'Waiting for a Charging Station', dwalk: 'Carrying plush to a drop-off', dgive: 'Handing plush over', blocked: 'Blocked', stuck: 'Stuck' };

const M = {
  dark: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.7, metalness: 0.6 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8a949e, roughness: 0.4, metalness: 0.85 }),
  lens: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.6, 3.2) }),
  lensWarn: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 1.2, 0.3) }),
  led: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3, 1) }),
};

function makeBotMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35 });
  const treadGeo = new THREE.BoxGeometry(0.13, 0.14, 0.54);
  for (const s of [-1, 1]) {
    const t = new THREE.Mesh(treadGeo, M.dark); t.position.set(s * 0.23, 0.07, 0); g.add(t);
    for (const z of [-0.2, 0, 0.2]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.15, 10), M.steel); w.rotation.z = Math.PI / 2; w.position.set(s * 0.23, 0.07, z); g.add(w); }
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.4), body); torso.position.y = 0.3; g.add(torso);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.02), M.dark); panel.position.set(0, 0.3, 0.205); g.add(panel);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), M.led); led.position.set(0.06, 0.3, 0.22); led.name = 'led'; g.add(led);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8), M.steel); neck.position.set(0, 0.58, 0.04); g.add(neck);
  const head = new THREE.Group(); head.position.set(0, 0.72, 0.06); head.name = 'head';
  for (const s of [-1, 1]) {
    const eye = new THREE.Group(); eye.position.x = s * 0.075; eye.name = s < 0 ? 'eyeL' : 'eyeR';
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.12, 12), M.steel); tube.rotation.x = Math.PI / 2;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), M.lens); lens.position.z = 0.062; lens.name = 'lens';
    eye.add(tube, lens); head.add(eye);
  }
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.05), body); brow.position.set(0, 0.07, 0.0); head.add(brow);
  g.add(head);
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * 0.26, 0.38, 0.05); arm.name = s < 0 ? 'armL' : 'armR';
    const up = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.22), M.steel); up.position.z = 0.11;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.08), body); hand.position.z = 0.24;
    arm.add(up, hand); g.add(arm);
  }
  const bucket = new THREE.Group(); bucket.position.set(0, 0.16, 0.3); bucket.name = 'bucket';
  const floor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.2), body); floor.position.y = 0;
  const side1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.2), body); side1.position.set(0.15, 0.06, 0);
  const side2 = side1.clone(); side2.position.x = -0.15;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.02), body); back.position.set(0, 0.06, -0.1);
  bucket.add(floor, side1, side2, back); g.add(bucket);
  const solar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.26), new THREE.MeshStandardMaterial({ color: 0x1b3a5c, roughness: 0.25, metalness: 0.7 }));
  solar.position.set(0, 0.5, -0.18); solar.rotation.x = -0.3; solar.name = 'solar'; g.add(solar);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M.lens); lamp.position.set(0, 0.5, 0.19); lamp.name = 'lamp'; lamp.visible = false; g.add(lamp);
  return g;
}

export class Crew {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    game.renderer.scene.add(this.root);
    this.objs = new Map();
    this.connCache = new Map();
    this.t = 0;
    this.marker = null;
  }

  get bots() { return this.game.S.crew; }

  clear() { for (const o of this.objs.values()) { this.game.machines.disposeObj(o); this.root.remove(o); } this.objs.clear(); this.connCache.clear(); }

  home() { return { x: this.game.hall.binPos.x, z: this.game.hall.binPos.z + 1.6 }; }

  // make sure the crew matches the number of slots the player owns
  sync() {
    const g = this.game;
    const S = g.S, T = g.T;
    S.crew = S.crew || [];
    if (!g.isGuest()) while (S.crew.length < T.crewMax) this.spawn();
    for (const [id, o] of [...this.objs]) if (!S.crew.some((b) => b.id === id)) { g.machines.disposeObj(o); this.root.remove(o); this.objs.delete(id); }
    for (const b of S.crew) { delete b.arm; delete b.aim; delete b.advTo; if (b.state === 'advance') b.state = 'farm'; if (!this.objs.has(b.id)) this.build(b); }
  }

  spawn() {
    const g = this.game, S = g.S;
    const h = this.home();
    const n = S.crew.length;
    const bot = {
      id: S.nextId++, name: NAMES[n % NAMES.length] + (n >= NAMES.length ? ' ' + (1 + Math.floor(n / NAMES.length)) : ''),
      color: COLORS[n % COLORS.length], level: 1, xp: 0, x: h.x + (Math.random() - 0.5), y: 0.5, z: h.z + (Math.random() - 0.5), vy: 0, yaw: Math.PI,
      state: 'idle', dir: 0, origin: null, trail: [], path: [], pi: 0, carry: [], battery: 1, timer: 0, stuck: 0, adv: 0, label: '',
    };
    S.crew.push(bot);
    this.build(bot);
    g.sound.chirp(1.2); g.fx.sparkle(bot.x, 0.6, bot.z, 14, 0.6, 1, 1);
    return bot;
  }

  scale(b) { return 0.55 + Math.min(b.level, 24) * 0.045; }
  radius(b) { return clamp(0.3 * this.scale(b) * 0.75, 0.15, 0.36); }
  xpNeeded(b) { return Math.round(14 * Math.pow(1.38, b.level)); }
  capacity(b) { return Math.round((4 + b.level * 2) * this.game.T.crewHaul); }
  digTime(b, x, z) { return (2.4 / (1 + 0.15 * b.level)) * compaction(x, z) / this.game.T.crewSpeed; }

  build(b) {
    const o = makeBotMesh(b.color);
    this.root.add(o); this.objs.set(b.id, o);
    o.position.set(b.x, b.y, b.z);
    this.refreshLook(b);
  }

  refreshLook(b) {
    const o = this.objs.get(b.id); if (!o) return;
    const s = this.scale(b);
    o.scale.setScalar(s);
    o.getObjectByName('solar').visible = b.level >= 4;
    const lamp = o.getObjectByName('lamp'); lamp.visible = b.level >= 8;
  }

  // ------------------------------------------------------------------ orders
  findFace(ox, oj, oz, dir) {
    const w = this.game.world;
    let i = toI(ox), k = toK(oz);
    for (let s = 0; s < 400; s++) {
      const ni = i + DX[dir], nk = k + DZ[dir];
      if (ni < 4 || nk < 4 || ni > NX - 5 || nk > NZ - 5) return null;
      let hit = false;
      for (let v = 0; v < 3; v++) if (w.solid(ni, oj + v, nk) && !isSpecialCell(w.get(ni, oj + v, nk))) hit = true;
      if (hit) return { i, j: oj, k };
      if (oj > 0 && !w.solid(ni, oj - 1, nk) && !w.solid(ni, oj - 2, nk)) return null; // a pit
      i = ni; k = nk;
    }
    return null;
  }

  order(b, dir, ox, oy, oz) {
    const g = this.game;
    const face = this.findFace(ox, Math.max(0, toJ(oy)), oz, dir);
    if (!face) { g.ui.toast({ icon: '🤖', title: b.name, text: `Nothing to dig ${DIRNAME[dir]} of here.` }); return false; }
    b.dir = dir;
    b.origin = [ox, oz];
    b.faceCell = face;
    b.trail = [];
    b.adv = 0;
    b.state = 'goto';
    b.path = [[ox, oz], [cellX(face.i), cellZ(face.k)]];
    b.pi = 0;
    b.timer = 0;
    g.sound.chirp(1.0 + Math.random() * 0.4);
    return true;
  }

  orderAll(dir, ox, oy, oz) {
    let n = 0;
    for (const b of this.bots) if (this.order(b, dir, ox, oy, oz)) n++;
    return n;
  }

  goHome(b) {
    const h = this.home();
    const path = [...b.trail.slice().reverse()];
    if (b.origin) path.push(b.origin);
    path.push([h.x, h.z]);
    b.path = path; b.pi = 0; b.state = 'return';
  }

  stand(b) { b.state = 'idle'; b.order = null; b.origin = null; b.trail = []; b.deliver = null; b.chg = null; }
  follow(b) { b.state = 'follow'; b.origin = null; b.trail = []; b.deliver = null; b.chg = null; }
  sendHome(b) { b.deliver = null; b.chg = null; this.goHome(b); }

  // ------------------------------------------------------------------ routes along the bot's own trail
  // the points the bot has walked, from the dig face back to where the order started
  trailPts(b) { const P = (b.trail || []).slice().reverse(); if (b.origin) P.push(b.origin); return P; }
  nearIdx(P, x, z, maxD = 6) {
    let bi = -1, bd = maxD;
    for (let n = 0; n < P.length; n++) { const d = Math.hypot(P[n][0] - x, P[n][1] - z); if (d < bd) { bd = d; bi = n; } }
    return bi;
  }
  // a walking path from the bot to (tx, tz): back along its trail like goHome does, leaving the trail where it passes closest
  routePath(b, tx, tz, standOff = 0) {
    const P = this.trailPts(b);
    const a = this.nearIdx(P, b.x, b.z), c = this.nearIdx(P, tx, tz);
    let path;
    if (c >= 0) path = a >= 0 ? (a <= c ? P.slice(a, c + 1) : P.slice(c, a + 1).reverse()) : P.slice(c).reverse();   // off the trail (at the bin): in by the origin end
    else path = a >= 0 ? P.slice(a) : [];
    if (standOff > 0) {
      const last = path.length ? path[path.length - 1] : [b.x, b.z];
      const vx = last[0] - tx, vz = last[1] - tz, d = Math.hypot(vx, vz);
      if (d > 0.01) { tx += vx / d * Math.min(standOff, d); tz += vz / d * Math.min(standOff, d); }
    }
    path.push([tx, tz]);
    return path;
  }
  // back to the dig: from where the bot stands out along its trail to the face
  resumeDig(b) {
    const P = this.trailPts(b);
    if (!b.origin) { b.state = 'idle'; return; }
    const a = this.nearIdx(P, b.x, b.z);
    b.path = a >= 0 ? P.slice(0, a + 1).reverse() : P.slice().reverse();
    b.pi = 0; b.state = 'goto'; b.timer = 0;
  }

  // ------------------------------------------------------------------ charging stations
  // the nearest charger that still holds charge and is within range, or null
  chargerFor(b) {
    const L = this.game.logi;
    let best = null, bd = CHARGER_RANGE;
    for (const t of L.tiles.values()) {
      if (t.type !== 'charger' || !((t.reserve || 0) > 0.05)) continue;
      const d = Math.hypot(cellX(t.i) - b.x, cellZ(t.k) - b.z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  startCharge(b, t, next) {
    if (next) b.chgNext = next;
    else if (b.state !== 'chgwalk' && b.state !== 'recharge') {
      b.chgNext = ['return', 'unload'].includes(b.state) ? 'home' : ['dwalk', 'dgive'].includes(b.state) ? 'deliver' : b.state === 'follow' ? 'follow' : b.origin ? 'dig' : 'idle';
    }
    b.chg = t.id;
    b.path = this.routePath(b, cellX(t.i), cellZ(t.k), 0.8); b.pi = 0; b.state = 'chgwalk'; b.scanT = 0;
    return true;
  }
  endCharge(b) {
    b.chg = null;
    const next = b.chgNext; b.chgNext = null;
    if (next === 'home') { const h = this.home(); b.path = this.routePath(b, h.x, h.z); b.pi = 0; b.state = 'return'; }
    else if (next === 'deliver' && this.startDeliver(b)) { /* walking on */ }
    else if (next === 'follow') b.state = 'follow';
    else if (next === 'dig' || next === 'deliver') { if (b.origin) this.resumeDig(b); else b.state = 'idle'; }
    else b.state = 'idle';
  }
  thinkRecharge(b, dt) {
    const g = this.game, t = g.logi.byId.get(b.chg);
    if (!t || t.type !== 'charger') { this.dryCharge(b); return; }
    b.tx = cellX(t.i) + (b.x < cellX(t.i) ? -0.8 : 0.8); b.tz = cellZ(t.k);
    if (Math.hypot(cellX(t.i) - b.x, cellZ(t.k) - b.z) < 2.0 && b.battery < 0.95 && (t.reserve || 0) > 0) {
      const take = Math.min(CHARGE_RATE * dt, 1 - b.battery, t.reserve);
      b.battery += take; t.reserve -= take;
      if (Math.random() < dt * 4) g.fx.sparkle(b.x, b.y + 0.5, b.z, 2, 0.3, 0.9, 1);
    }
    if (b.battery >= 0.95) this.endCharge(b);
    else if (!((t.reserve || 0) > 0.001)) this.dryCharge(b);
  }
  // the station ran dry (or is gone): another one if it is closer than home, else the old way, home
  dryCharge(b) {
    const o = this.chargerFor(b);
    if (o && o.id !== b.chg) { this.startCharge(b, o); return; }
    if (b.battery >= OK_BATTERY) { this.endCharge(b); return; }
    b.waitAt = b.chg; b.chg = null;   // too weak to go on: it waits right here at the empty station and trickles
    this.enterLowbat(b);
  }

  // below LOW: a station with charge if there is one, else home (the bin is where it waits)
  lowBattery(b) { const cs = this.chargerFor(b); if (cs) this.startCharge(b, cs); else this.goHome(b); }
  enterLowbat(b) {
    b.state = 'lowbat'; b.lowT = 0;
    if (!b.lowToast) {
      b.lowToast = true;
      const any = [...this.game.logi.tiles.values()].some((t) => t.type === 'charger');
      this.game.ui.toast(any ? { icon: '🪫', title: 'Feed a Charging Station', text: `${b.name} is out of power and the station is empty`, ms: 6000 } : { icon: '🪫', title: 'Build a Charging Station', text: `${b.name} is out of power`, ms: 6000 });
    }
  }
  // back from the bin: unloaded. Too weak to work means a station or the bin's trickle, else back to the dig
  afterUnload(b) {
    b.cleared = false;
    if (b.battery < LOW_BATTERY) { const cs = this.chargerFor(b); if (cs) this.startCharge(b, cs, b.origin ? 'dig' : 'idle'); else this.enterLowbat(b); return; }
    if (b.origin) { b.path = [b.origin, ...b.trail]; b.pi = 0; b.state = 'goto'; } else b.state = 'idle';
  }
  thinkLowbat(b, dt, time, h) {
    const w = b.waitAt ? this.game.logi.byId.get(b.waitAt) : null;
    if (w) { b.tx = cellX(w.i) + 0.8; b.tz = cellZ(w.k); if (Math.hypot(b.x - cellX(w.i), b.z - cellZ(w.k)) < 3) b.battery = Math.min(1, b.battery + dt * TRICKLE); }
    else { b.waitAt = null; b.tx = h.x + Math.sin(time * 0.3 + b.id) * 2.0; b.tz = h.z + Math.cos(time * 0.27 + b.id * 1.7) * 1.6; this.charge(b, dt, h); }
    b.lowT = (b.lowT || 0) - dt;
    if (b.lowT <= 0) { b.lowT = 1; const cs = this.chargerFor(b); if (cs) { this.startCharge(b, cs, b.chgNext || (b.origin ? 'dig' : 'idle')); b.waitAt = null; return; } }
    if (b.battery >= OK_BATTERY) {
      b.lowToast = false; b.waitAt = null;
      if (b.origin) { if (w) this.resumeDig(b); else { b.path = [b.origin, ...b.trail]; b.pi = 0; b.state = 'goto'; } } else b.state = 'idle';
    }
  }

  // ------------------------------------------------------------------ drop-offs (a generator, vault, sorter or belt instead of the bin)
  deliverTile(b) { return b.deliver ? this.game.logi.byId.get(b.deliver) || null : null; }
  startDeliver(b) {
    const t = this.deliverTile(b);
    if (!t || !b.carry.length) return false;
    b.path = this.routePath(b, cellX(t.i), cellZ(t.k), 0.9); b.pi = 0; b.state = 'dwalk'; b.scanT = 0;
    return true;
  }
  // the bot is full: hand over at its drop-off if it has one, else the bin
  fullTrip(b) {
    if (b.deliver && !this.deliverTile(b)) b.deliver = null;
    if (b.deliver && this.startDeliver(b)) return;
    this.goHome(b);
  }
  thinkDeliver(b, dt) {
    const g = this.game, t = this.deliverTile(b);
    if (!t) { b.deliver = null; this.endDeliver(b); return; }
    b.tx = cellX(t.i) + (b.x < cellX(t.i) ? -0.9 : 0.9); b.tz = cellZ(t.k);
    if (Math.hypot(cellX(t.i) - b.x, cellZ(t.k) - b.z) > 2.4) return;
    b.timer -= dt;
    if (b.timer > 0) return;
    b.timer = 0.15;
    for (let n = 0; n < b.carry.length; n++) {
      if (g.logi.accept(t, b.carry[n], null)) { b.carry.splice(n, 1); b.stall = 0; if (t.type === 'gen') g.power.markDirty(); g.fx.fluff && g.fx.fluff(cellX(t.i), t.j * 0.6 + 0.9, cellZ(t.k), 1, 0.6, 0.2, 5); return; }
    }
    b.stall = (b.stall || 0) + 0.15;
    if (!b.carry.length || b.stall >= 3) this.endDeliver(b);
  }
  // done handing over: what the drop-off would not take goes to the bin, otherwise back to work
  endDeliver(b) {
    b.stall = 0;
    if (b.carry.length) { const h = this.home(); b.path = this.routePath(b, h.x, h.z); b.pi = 0; b.state = 'return'; b.scanned = false; return; }
    if (b.origin) this.resumeDig(b); else b.state = 'idle';
  }


  // ------------------------------------------------------------------ click a bot, then a target
  // the nearest pile face from a spot, over the four directions: { dir, d, face } or null
  nearestFace(x, y, z) {
    const j = Math.max(0, toJ(y)); let best = null;
    for (let dir = 0; dir < 4; dir++) {
      const f = this.findFace(x, j, z, dir); if (!f) continue;
      const d = Math.abs(f.i - toI(x)) + Math.abs(f.k - toK(z));
      if (!best || d < best.d) best = { dir, d, face: f };
    }
    return best;
  }

  // ONE function decides what an E press on a target means, and says so: the HUD panel shows its text before the press and
  // command() runs its act, so the words and the action cannot drift apart.
  // tgt: { k: 'tile', id } | { k: 'spot', x, y, z, dir } | { k: 'bin' } | { k: 'feet' } | { k: 'cart' } | null
  intent(b, tgt) {
    const g = this.game, L = g.logi;
    const no = (text) => ({ act: null, ok: false, text });
    if (!tgt) return no('Aim at a generator, charger, sorter, vault, belt, the floor, the bin or your cart');
    if (tgt.k === 'tile') {
      const t = L.byId.get(tgt.id); if (!t) return no('That is gone');
      const at = [cellX(t.i), t.j * C, cellZ(t.k)];
      if (t.type === 'gen') {
        const nf = this.nearestFace(at[0], at[1], at[2]);
        if (!nf) return no('No pile within reach of this Generator');
        const w = DIRNAME[nf.dir].toLowerCase();
        return { act: 'fuel', ok: true, tile: t, dir: nf.dir, text: `Keep this Generator fuelled: dig ${w} of it and deliver plush here`, toast: `Digging ${w} and keeping the generator fuelled.` };
      }
      if (t.type === 'charger') {
        if (!((t.reserve || 0) > 0.02)) return no('This Charging Station is empty');
        return { act: 'charge', ok: true, tile: t, text: `Recharge at this Charging Station (${(t.reserve || 0).toFixed(1)} left), then carry on`, toast: 'Going to recharge, then back to work.' };
      }
      if (t.type === 'sorter' || t.type === 'vault' || t.type === 'belt') {
        const nm = t.type === 'sorter' ? 'Sorting Box' : t.type === 'vault' ? 'Vault Crate' : 'belt';
        return { act: 'deliver', ok: true, tile: t, text: `Deliver plush to this ${nm} instead of the bin from now on`, toast: `Delivering to the ${nm} from now on.` };
      }
      return no('Nothing to do with that');
    }
    if (tgt.k === 'spot') {
      const f = this.findFace(tgt.x, Math.max(0, toJ(tgt.y)), tgt.z, tgt.dir);
      const w = DIRNAME[tgt.dir].toLowerCase();
      if (!f) return no(`Nothing to dig ${w} of that spot`);
      return { act: 'dig', ok: true, dir: tgt.dir, text: `Dig ${w} from that spot`, toast: `Digging ${w}.` };
    }
    if (tgt.k === 'bin') return { act: 'home', ok: true, text: 'Go home and unload', toast: 'Heading home.' };
    if (tgt.k === 'feet') return { act: 'follow', ok: true, text: 'Follow you', toast: 'Following you.' };
    if (tgt.k === 'cart') {
      const c = g.S.cart;
      if (!c || !c.load.length) return no('Your cart is empty');
      return { act: 'haul', ok: true, text: 'Haul the cart to the bin', toast: 'Fetching the cart load.' };
    }
    return no('Nothing to do with that');
  }

  // run the order intent() describes. Returns { ok, act, msg } (msg is the toast on success, the reason on failure)
  command(b, tgt, quiet = false) {
    const g = this.game;
    const it = this.intent(b, tgt);
    if (!it.ok) { if (!quiet) { g.sound.error(); g.ui.hint(it.text, 2.5); } return { ok: false, act: null, msg: it.text }; }
    if (it.act !== 'charge') { b.chg = null; b.chgNext = null; }
    let ran = true;
    switch (it.act) {
      case 'fuel': ran = this.order(b, it.dir, cellX(it.tile.i), it.tile.j * C, cellZ(it.tile.k)); if (ran) b.deliver = it.tile.id; break;
      case 'charge': this.startCharge(b, it.tile); break;
      case 'deliver': b.deliver = it.tile.id; if (b.carry.length && ['idle', 'follow', 'return'].includes(b.state)) this.startDeliver(b); break;
      case 'dig': ran = this.order(b, it.dir, tgt.x, tgt.y, tgt.z); break;
      case 'home': this.sendHome(b); break;
      case 'follow': this.follow(b); break;
      case 'haul': b.state = 'haulgo'; b.origin = null; b.trail = []; break;
    }
    if (!ran) return { ok: false, act: null, msg: 'It could not do that' };
    if (!quiet) { g.sound.chirp(1.0 + Math.random() * 0.4); g.ui.toast({ icon: '🤖', title: b.name, text: it.toast, ms: 2500 }); }
    return { ok: true, act: it.act, msg: it.toast };
  }

  // one plain sentence about what a bot is doing right now (the crew panel and the tests read it)
  statusLine(b) {
    const g = this.game, pct = Math.round(b.battery * 100), dir = DIRNAME[b.dir || 0].toLowerCase();
    const dt = b.deliver ? g.logi.byId.get(b.deliver) : null;
    const dn = dt ? { gen: 'the Generator', sorter: 'the Sorting Box', vault: 'the Vault Crate', belt: 'a belt' }[dt.type] || 'its drop-off' : '';
    let base;
    switch (b.state) {
      case 'farm': case 'advance': base = `Digging ${dir}, ${b.adv || 0} cells in`; break;
      case 'goto': base = `Heading out to dig ${dir}`; break;
      case 'return': base = 'Hauling plush back to the bin'; break;
      case 'unload': base = 'Unloading at the bin'; break;
      case 'haulgo': base = 'Fetching your cart load'; break;
      case 'follow': base = 'Following you'; break;
      case 'idle': base = 'Waiting at the bin'; break;
      case 'chgwalk': base = 'Walking to a Charging Station'; break;
      case 'recharge': base = 'Recharging at a Charging Station'; break;
      case 'dwalk': case 'dgive': base = `Taking plush to ${dn || 'its drop-off'}`; break;
      case 'lowbat': { let any = false; for (const t of g.logi.tiles.values()) if (t.type === 'charger') any = true; base = any ? 'Waiting for a Charging Station' : `Build a Charging Station: ${b.name} is out of power`; break; }
      case 'held': base = 'Held at the detector gate'; break;
      case 'blocked': case 'stuck': base = 'Blocked, nothing more to dig that way'; break;
      default: base = STATUS[b.state] || b.state;
    }
    if (dn && b.state !== 'dwalk' && b.state !== 'dgive') base += `, drop-off ${dn}`;
    return `${base}, battery ${pct}%, carrying ${b.carry.length} plush`;
  }

  // a ring on the floor and an arrow over the selected bot
  updateMarker(time) {
    const g = this.game, b = g.crewSel ? this.bots.find((x) => x.id === g.crewSel) : null;
    if (!b) { if (this.marker) this.marker.visible = false; return; }
    if (!this.marker) {
      const m = new THREE.Group();
      const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.6, 0.4), side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), glow); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.name = 'ring';
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 4), glow); arrow.rotation.x = Math.PI; arrow.name = 'arrow';
      m.add(ring, arrow); m.name = 'selmark'; this.root.add(m); this.marker = m;
    }
    const s = this.scale(b);
    this.marker.visible = true;
    this.marker.position.set(b.x, b.y, b.z);
    const ring = this.marker.getObjectByName('ring'), arrow = this.marker.getObjectByName('arrow');
    ring.scale.setScalar(s * (1 + Math.sin(time * 5) * 0.06));
    arrow.position.y = 1.15 * s + 0.1 + Math.sin(time * 4) * 0.05; arrow.scale.setScalar(Math.max(0.8, s));
  }

  // ------------------------------------------------------------------ belts
  connected(tile) {
    if (!tile) return false;
    const now = this.game.time;
    const hit = this.connCache.get(tile.id);
    if (hit && now - hit.t < 3) return hit.v;
    const L = this.game.logi;
    let t = tile, steps = 0, ok = false;
    while (t && steps++ < 3000) {
      if (t.type !== 'belt') { ok = t.type === 'sorter' || t.type === 'vault' || t.type === 'gen'; break; }
      const nx = L.nextOf(t);
      if (!nx) { ok = this.game.sinkNear(cellX(t.i) + DX[t.dir] * C, cellZ(t.k) + DZ[t.dir] * C); break; }
      t = nx;
    }
    this.connCache.set(tile.id, { t: now, v: ok });
    return ok;
  }

  // belt tile at or behind the bot that leads to a sink
  beltFor(b) {
    const L = this.game.logi;
    const i = toI(b.x), k = toK(b.z), j = Math.max(0, toJ(b.y));
    for (const [a, c] of [[0, 0], [-DX[b.dir], -DZ[b.dir]], [-2 * DX[b.dir], -2 * DZ[b.dir]]]) {
      for (const dj of [0, -1]) {
        const t = L.tileAt(i + a, j + dj, k + c);
        if (t && t.type === 'belt' && this.connected(t)) return t;
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ simulation
  // guest: the host drives the bots, we just glide them to where the host says they are
  guestUpdate(dt, time) {
    const k = Math.min(1, dt * 10);
    for (const b of this.bots) {
      const o = this.objs.get(b.id) || (this.build(b), this.objs.get(b.id));
      if (b.gx !== undefined) { b.x += (b.gx - b.x) * k; b.y += (b.gy - b.y) * k; b.z += (b.gz - b.z) * k; b.yaw = b.gyaw ?? b.yaw; }
      this.animate(b, o, dt, time);
    }
    this.updateMarker(time);
  }

  // a full cart gets emptied by a free bot: it takes a load, walks it through the detector gate and sells it at the bin
  assignHaul(dt) {
    const g = this.game, c = g.S.cart;
    this._haulT = (this._haulT || 0) - dt;
    if (this._haulT > 0 || !c || !c.load.length) return;
    this._haulT = 1.5;
    const cap = CART_CAP[c.tier];
    if (!c.load.length) { c.hauling = false; return; }
    if (!c.hauling && c.load.length < cap * 0.9) return; // a full cart starts a haul, bots then keep hauling until it is empty
    c.hauling = true;
    const h = this.home();
    if (Math.hypot(c.x - h.x, c.z - h.z) < 14) return; // near the bin the cart dumps itself
    const busy = this.bots.some((b) => b.state === 'haulgo');
    if (busy) return;
    let best = null, bd = 60;
    for (const b of this.bots) {
      if (!['idle', 'follow'].includes(b.state) || b.carry.length > 0 || b.battery < 0.3) continue;
      const d = Math.hypot(b.x - c.x, b.z - c.z);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return;
    best.state = 'haulgo'; best.origin = null; best.trail = [];
    g.ui.hint(`<b>${best.name}</b> is coming to haul your full cart to the bin.`, 4);
  }

  update(dt, time) {
    const g = this.game, T = g.T;
    this.assignHaul(dt);
    for (const b of this.bots) {
      const o = this.objs.get(b.id) || (this.build(b), this.objs.get(b.id));
      this.think(b, dt, time, o);
      this.move(b, dt);
      this.animate(b, o, dt, time);
    }
    this.updateMarker(time);
  }

  think(b, dt, time, o) {
    const g = this.game, T = g.T, pp = g.player.pos;
    const h = this.home();
    b.battery = clamp(b.battery, 0, 1);
    switch (b.state) {
      case 'haulgo': {
        const c = g.S.cart;
        if (!c || !c.load.length) { this.stand(b); break; }
        b.tx = c.x; b.tz = c.z;
        if (Math.hypot(c.x - b.x, c.z - b.z) < 1.7) {
          const take = Math.min(this.capacity(b), c.load.length);
          for (let n = 0; n < take; n++) b.carry.push(c.load.pop());
          g.sound.chirp(1.4);
          b.scanned = false;
          this.goHome(b);
        }
        break;
      }
      case 'held': {
        const gate = g.logi.byId.get(b.heldGate);
        if (!gate || !gate.alarm) { b.heldGate = null; b.scanned = true; b.cleared = true; b.state = 'return'; b.path = [[h.x, h.z]]; b.pi = 0; break; }
        const DXs = [1, 0, -1, 0], DZs = [0, 1, 0, -1];
        const d = gate.dir || 0;
        b.tx = cellX(gate.i) + -DZs[d] * 1.7; b.tz = cellZ(gate.k) + DXs[d] * 1.7;
        break;
      }
      case 'idle': {
        // loiter around the bin
        b.tx = h.x + Math.sin(time * 0.3 + b.id) * 2.0; b.tz = h.z + Math.cos(time * 0.27 + b.id * 1.7) * 1.6;
        this.charge(b, dt, h);
        break;
      }
      case 'follow': {
        const d = Math.hypot(pp.x - b.x, pp.z - b.z);
        if (d > 2.6) { b.tx = pp.x + (b.id % 3 - 1) * 0.8; b.tz = pp.z + 1.0; } else { b.tx = b.x; b.tz = b.z; }
        break;
      }
      case 'goto': case 'return': case 'chgwalk': case 'dwalk': {
        // standing in the gate while it scans the load
        if (b.scanT > 0) {
          b.scanT -= dt; b.tx = b.x; b.tz = b.z;
          if (b.scanT <= 0) { b.scanT = 0; this.scanBot(b); }
          break;
        }
        const p = b.path[b.pi];
        if (!p) {
          if (b.state === 'goto') { b.state = 'farm'; b.timer = this.digTime(b, b.x, b.z); }
          else if (b.state === 'chgwalk') { b.state = 'recharge'; b.timer = 0; }
          else if (b.state === 'dwalk') { b.state = 'dgive'; b.timer = 0; b.stall = 0; }
          else {
            // robots check in at the nearest detector gate before they unload
            const gate = !b.scanned ? g.logi.bestGate(b.x, b.z, h.x, h.z) : null;
            if (gate) { b.scanned = true; b.gatePending = gate.id; b.path = [[cellX(gate.i), cellZ(gate.k)], [h.x, h.z]]; b.pi = 0; break; }
            b.scanned = false; b.cleared = true; b.state = 'unload';
          }
          break;
        }
        b.tx = p[0]; b.tz = p[1];
        if (Math.hypot(p[0] - b.x, p[1] - b.z) < 0.45) { b.pi++; if (b.gatePending && b.pi === 1) { b.scanT = 0.9; const gt = g.logi.byId.get(b.gatePending); if (gt) { g.logi.setGate(gt, false); g.sound.tone('sine', 700, 1100, 0.3, 0.04); } } }
        b.battery -= dt * 0.004 / T.crewBattery;
        break;
      }
      case 'unload': {
        b.tx = h.x; b.tz = h.z;
        // nothing is sold before it has been scanned at a detector gate (when one exists)
        if (!b.cleared && b.carry.length && g.logi.bestGate(b.x, b.z, h.x, h.z)) { b.state = 'return'; b.path = []; b.pi = 0; b.scanned = false; break; }
        b.timer -= dt;
        if (b.timer <= 0) {
          b.timer = 0.12;
          const it = b.carry.shift();
          if (it) { g.sellAuto(it.sp, it.vr, 1); g.fx.coin(h.x, 1.0, h.z - 1.2, 1); if (Math.random() < 0.3 && Math.hypot(b.x - g.player.pos.x, b.z - g.player.pos.z) < 20) g.sound.chirp(1.5 + Math.random() * 0.5); }
          else this.afterUnload(b);
        }
        break;
      }
      case 'charge': this.afterUnload(b); break;   // an older save: the bin no longer charges fast
      case 'lowbat': this.thinkLowbat(b, dt, time, h); break;
      case 'recharge': this.thinkRecharge(b, dt); break;
      case 'dgive': this.thinkDeliver(b, dt); break;
      case 'farm': case 'advance': this.thinkFarm(b, dt, time); break;
      case 'blocked': case 'stuck': {
        b.timer -= dt;
        if (b.timer <= 0) {
          this.goHome(b);
          b.origin = null; // give up on this face, it is blocked
          g.ui.toast({ icon: '🤖', title: `${b.name} is blocked`, text: 'It cannot dig any further that way and is heading home.', ms: 4000 });
        }
        break;
      }
    }
    // low battery heads home
    if (b.battery >= 0.5) b.lowToast = false;
    if ((b.state === 'farm' || b.state === 'advance' || b.state === 'goto' || b.state === 'follow') && b.battery < LOW_BATTERY) this.lowBattery(b);
    else if (b.state === 'idle' && b.battery < LOW_BATTERY) { const cs = this.chargerFor(b); if (cs) this.startCharge(b, cs); else this.enterLowbat(b); }
    // stuck detection: wants to move but does not
    if (['goto', 'return', 'advance', 'chgwalk', 'dwalk'].includes(b.state)) {
      b.stuckT = (b.stuckT || 0) + dt;
      if (b.lastX === undefined) { b.lastX = b.x; b.lastZ = b.z; }
      if (Math.hypot(b.x - b.lastX, b.z - b.lastZ) > 0.5) { b.stuckT = 0; b.lastX = b.x; b.lastZ = b.z; }
      if (b.stuckT > 25) { this.beam(b); }
    } else { b.stuckT = 0; b.lastX = undefined; }
  }

  scanBot(b) {
    const g = this.game, gate = g.logi.byId.get(b.gatePending);
    b.gatePending = null;
    if (!gate) return;
    const n = b.carry.findIndex((x) => x.sp === NEEDLE);
    if (n >= 0) {
      const it = b.carry.splice(n, 1)[0];
      gate.held = { sp: it.sp, vr: it.vr }; gate.alarm = true;
      g.logi.setGate(gate, true);
      g.logi.recomputeHalt();
      g.needleAlarm(gate);
      // pulled aside into the bay beside the lane, flagged, until you come and take it
      b.state = 'held'; b.heldGate = gate.id; b.path = []; b.pi = 0;
    } else { g.logi.setGate(gate, false); gate.flash = 0.25; b.cleared = true; g.S.stats.botScans = (g.S.stats.botScans || 0) + 1; g.gateDing(0.05, 0.03); }
  }

  charge(b, dt, h) {
    if (Math.hypot(b.x - h.x, b.z - h.z) < 4) b.battery = Math.min(1, b.battery + dt * TRICKLE);
  }

  beam(b) {
    const g = this.game, h = this.home();
    g.fx.sparkle(b.x, b.y + 0.4, b.z, 16, 0.5, 0.9, 1);
    b.x = h.x; b.z = h.z; b.y = 0.6; b.vy = 0; b.stuckT = 0;
    // phased to base, but still goes through the gate before anything is sold
    b.state = 'return'; b.path = []; b.pi = 0; b.scanned = false; b.cleared = false; b.timer = 0.5;
    g.ui.toast({ icon: '🤖', title: `${b.name} got stuck`, text: 'It phased back to base to recharge.', ms: 4000 });
    g.fx.sparkle(h.x, 0.6, h.z, 16, 0.5, 0.9, 1);
  }

  thinkFarm(b, dt, time) {
    const g = this.game, w = g.world, T = g.T;
    const bi = toI(b.x), bk = toK(b.z), bj = b.faceCell ? b.faceCell.j : Math.max(0, toJ(b.y));
    const dx = DX[b.dir], dz = DZ[b.dir];
    if (b.state === 'advance') {
      // walking into the freshly cleared cell
      const [tx, tz] = b.advTo;
      b.tx = tx; b.tz = tz;
      if (Math.hypot(tx - b.x, tz - b.z) < 0.25) { b.state = 'farm'; b.timer = 0.2; }
      return;
    }
    b.tx = cellX(bi) + dx * 0.1; b.tz = cellZ(bk) + dz * 0.1;
    b.timer -= dt;
    b.battery -= dt * 0.003 / T.crewBattery;
    if (b.carry.length >= this.capacity(b)) { this.fullTrip(b); return; }
    if (b.timer > 0) return;
    // work volume
    const W = 2 + Math.floor(b.level / 6), H = 3 + (b.level >= 10 ? 1 : 0);
    const half = Math.floor((W - 1) / 2);
    const px = dz !== 0 ? 1 : 0, pz = dx !== 0 ? 1 : 0;
    let best = null, bs = 1e9;
    for (let f = 1; f <= (b.level >= 6 ? 2 : 1); f++) for (let l = -half; l < W - half; l++) for (let v = 0; v < H; v++) {
      const i = bi + dx * f + px * l, k = bk + dz * f + pz * l, j = bj + v;
      const s = w.get(i, j, k);
      if (!s || isSpecialCell(s) || w.reserved.has((j * NZ + k) * NX + i)) continue;
      const sc = f * 10 + Math.abs(l) * 3 + v;
      if (sc < bs) { bs = sc; best = [i, j, k]; }
    }
    if (best) {
      const belt = this.beltFor(b);
      const it = w.removeCell(best[0], best[1], best[2]);
      if (!it) { b.timer = 0.3; return; }
      b.arm = performance.now() / 1000;
      b.aim = [cellX(best[0]), cellY(best[1]), cellZ(best[2])];
      g.mechDug(it, cellX(best[0]), cellY(best[1]), cellZ(best[2]));
      if (!(belt && g.logi.accept(belt, it, null))) { b.carry.push({ sp: it.sp, vr: it.vr }); if (b.carry.length >= this.capacity(b)) { this.fullTrip(b); b.timer = this.digTime(b, b.x, b.z); return; } }
      this.gainXp(b, 1);
      if (Math.random() < 0.15 && Math.hypot(b.x - g.player.pos.x, b.z - g.player.pos.z) < 20) g.sound.chirp(0.9 + Math.random() * 0.5);
      b.timer = this.digTime(b, b.x, b.z);
      return;
    }
    // face is clear: advance one cell if the floor is there
    const ni = bi + dx, nk = bk + dz;
    const floorOk = bj === 0 || w.solid(ni, bj - 1, nk);
    if (!w.solid(ni, bj, nk) && floorOk && !g.logi.tileAt(ni, bj, nk)) {
      const oi = bi, ok = bk;
      b.advTo = [cellX(ni), cellZ(nk)];
      b.state = 'advance';
      b.trail.push([cellX(oi), cellZ(ok)]);
      b.adv++;
      this.noteDist(b);
      if (T.crewBelt && !g.logi.tileAt(oi, bj, ok) && g.S.money >= 3) {
        g.S.money -= 3; g.ui.setMoney(g.S.money);
        g.layBelt(oi, bj, ok, (b.dir + 2) & 3);
      }
      if (T.crewBolt && b.adv % 3 === 0) g.machines.autoFrame(oi, bj, ok, b.dir);
    } else {
      b.state = 'blocked'; b.timer = 6;
    }
  }

  noteDist(b) { this.game.noteDist(b.x, b.z); }

  gainXp(b, n) {
    b.xp += n;
    const need = this.xpNeeded(b);
    if (b.xp >= need) {
      b.xp -= need; b.level++;
      this.refreshLook(b);
      const g = this.game;
      g.fx.sparkle(b.x, b.y + 0.6, b.z, 24, 0.6, 1, 0.8);
      g.sound.chirp(1.6); setTimeout(() => g.sound.chirp(2.0), 140);
      g.ui.toast({ icon: '🤖', title: `${b.name} grew to level ${b.level}`, text: `Bigger, stronger, hauls ${this.capacity(b)}.`, ms: 4000 });
      g.S.stats.botLevels = (g.S.stats.botLevels || 0) + 1;
    }
  }

  move(b, dt) {
    const g = this.game, w = g.world;
    const r = this.radius(b);
    const spd = (1.5 + b.level * 0.06) * (b.state === 'follow' ? 1.3 : 1);
    let dx = (b.tx ?? b.x) - b.x, dz = (b.tz ?? b.z) - b.z;
    const d = Math.hypot(dx, dz);
    let vx = 0, vz = 0;
    if (d > 0.12) { const s = Math.min(spd, d * 4); vx = dx / d * s; vz = dz / d * s; b.yaw += (Math.atan2(dx, dz) - b.yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI; }
    b.vy -= 16 * dt;
    let x = b.x + vx * dt, y = b.y + b.vy * dt, z = b.z + vz * dt;
    const pos = { x, y: y + r, z };
    const cont = this._c || (this._c = { hits: 0, nx: 0, ny: 0, nz: 0, deep: 0 });
    let blocked = false;
    for (let it = 0; it < 3; it++) {
      if (resolveSphere(w, pos, r, cont)) {
        if (cont.ny > 0.5) { if (b.vy < 0) b.vy = 0; }
        else if (d > 0.3) blocked = true;
      }
    }
    if (pos.y - r < 0) { pos.y = r; if (b.vy < 0) b.vy = 0; }
    b.x = clamp(pos.x, -HALL_HX + 1, HALL_HX - 1); b.z = clamp(pos.z, -HALL_HZ + 1, HALL_HZ - 1); b.y = pos.y - r;
    if (blocked && b.y < 40 && Math.abs(b.vy) < 0.5) b.vy = 3.4; // hop over a lip
  }

  animate(b, o, dt, time) {
    const g = this.game, pp = g.player.pos;
    o.position.set(b.x, b.y, b.z);
    const dy = ((b.yaw - o.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    o.rotation.y += dy * Math.min(1, dt * 8);
    const head = o.getObjectByName('head');
    // eyes look at what matters: the dig target, else the player if near, else ahead
    let lx = pp.x - b.x, lz = pp.z - b.z, show = Math.hypot(lx, lz) < 7;
    if (b.aim && performance.now() / 1000 - (b.arm || 0) < 0.7) { lx = b.aim[0] - b.x; lz = b.aim[2] - b.z; show = true; }
    if (head) {
      const target = show ? Math.atan2(lx, lz) - o.rotation.y : 0;
      const dd = ((target - head.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      head.rotation.y += clamp(dd, -1, 1) * Math.min(1, dt * 6);
      head.rotation.y = clamp(head.rotation.y, -1.1, 1.1);
      head.rotation.x = b.state === 'blocked' || b.state === 'stuck' ? 0.5 : (b.battery < 0.2 ? 0.35 : Math.sin(time * 1.3 + b.id) * 0.05);
    }
    const blink = Math.sin(time * 2.3 + b.id * 3) > 0.985 ? 0.15 : 1;
    for (const n of ['eyeL', 'eyeR']) { const e = o.getObjectByName(n); if (e) e.scale.y = blink; }
    const lowBat = b.battery < 0.2;
    for (const n of ['eyeL', 'eyeR']) { const l = o.getObjectByName(n)?.getObjectByName('lens'); if (l) l.material = lowBat || b.state === 'blocked' ? M.lensWarn : M.lens; }
    const digging = b.arm && performance.now() / 1000 - b.arm < 0.5;
    for (const [n, s] of [['armL', -1], ['armR', 1]]) { const a = o.getObjectByName(n); if (a) a.rotation.x = digging ? -0.4 + Math.sin(time * 18 + s) * 0.5 : Math.sin(time * 1.5 + s) * 0.06; }
    const led = o.getObjectByName('led');
    if (led) led.visible = Math.sin(time * 4 + b.id) > -0.3;
  }

  // plush riding in each bot's bucket
  forEachItem(cb) {
    for (const b of this.bots) {
      const o = this.objs.get(b.id); if (!o) continue;
      const n = Math.min(4, b.carry.length);
      const s = this.scale(b);
      for (let q = 0; q < n; q++) {
        const it = b.carry[b.carry.length - 1 - q];
        const fx = Math.sin(o.rotation.y), fz = Math.cos(o.rotation.y);
        cb(it, b.x + fx * 0.3 * s + (q - 1.5) * 0.05 * fz, b.y + (0.22 + q * 0.03) * s, b.z + fz * 0.3 * s - (q - 1.5) * 0.05 * fx, 0.22 * s + 0.08);
      }
    }
  }
}
