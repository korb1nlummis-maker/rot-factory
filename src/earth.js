// Earth movers: the big late-game digging and hauling machines.
//   Excavator  digs a wide face from where it stands and fills a hopper.
//   Bulldozer  keeps a low blade in the pile, pushing whole rows toward a belt (or the bin chute at a discount).
//   Bucket-Wheel Excavator  eats a huge face at once.
//   Haul Truck carries plush from a digger's hopper to the bin (or a Depot Beacon) along a path and comes back.
// Diggers respect the mountain: each carries a canopy that must hold the roof under it (the same load tracing the frames use,
// rated like the best frame you own), and each chokes on deep stale air unless a Support Fan is blowing near it.
// They never take The One: a cell holding it is left in the pile. The host simulates; a guest only draws what the host reports.
import * as THREE from 'three';
import { C, NX, NZ, cellX, cellY, cellZ, toI, toJ, toK, idx } from './config.js';
import { NEEDLE, species, isSpecialCell } from './plushdata.js';
import { compaction } from './util.js';
import { FRAME_TYPES } from './upgrades.js';
import { BASE_LOAD, PRESS, loadOn } from './loadtrace.js';
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];   // the same direction table the belts use

export const EARTH = {
  excavator: { name: 'Excavator', short: 'Excavator', icon: '🏗️', cost: 9e5, half: 1, hgt: 4, vert: 5, reach: 3, latHalf: 3, canopy: 5.2, shield: 7, powerReach: 3, hy: 1.2, hr: 1.6, dig: true },
  dozer: { name: 'Bulldozer', short: 'Dozer', icon: '🚜', cost: 6e5, half: 1, hgt: 2, vert: 2, reach: 2, canopy: 4.4, shield: 6, powerReach: 2, hy: 0.7, hr: 1.6, dig: true, direct: true },
  wheel: { name: 'Bucket-Wheel Excavator', short: 'Bucket Wheel', icon: '⚙️', cost: 8e6, half: 2, hgt: 6, vert: 6, reach: 3, latHalf: 5, canopy: 7.5, shield: 9, powerReach: 6, hy: 2.0, hr: 3.2, dig: true },
  truck: { name: 'Haul Truck', short: 'Truck', icon: '🚛', cost: 3e5, half: 1, hgt: 2, powerReach: 0, hy: 0.8, hr: 1.4, dig: false },
};
export const EARTH_TYPES = new Set(Object.keys(EARTH));
export const isEarth = (t) => EARTH_TYPES.has(t);
export const EARTH_KW = { excavator: 30, dozer: 22, wheel: 80, truck: 10 };
export const EARTH_GROWTH = 1.55;     // each one you already run makes the next one 55% dearer
export const HOPPER_BASE = { excavator: 240, wheel: 1500 };
export const DOZER_CHUTE = 0.85;      // a blade that pushes plush to the chute with no belt behind it mashes some of the value
export const DOZER_BUFFER = 60;       // with a belt behind it the blade queues what it pushes (and waits when the belt is backed up)
export const STALE_CHOKE = 0.8;
export const STATES = ['off', 'nopower', 'idle', 'dig', 'advance', 'full', 'choke', 'press', 'stuck', 'go', 'load', 'unload', 'back', 'wait'];

export const earthCost = (kind, count) => Math.round(EARTH[kind].cost * Math.pow(EARTH_GROWTH, count));

// everything the tuning decides about one kind of machine
export function earthTune(T, kind) {
  const f = T.fleetBonus || 0;
  if (kind === 'excavator') return { max: (T.excavMax || 0) + (T.excavMax ? f : 0), rate: T.excavRate, swing: T.excavSwing, hopper: Math.round(HOPPER_BASE.excavator * T.hopMul), latHalf: 3, vert: 5, reach: 3 };
  if (kind === 'dozer') { const lat = Math.floor((T.dozerBlade - 1) / 2); return { max: (T.dozerMax || 0) + (T.dozerMax ? f : 0), rate: T.dozerRate, swing: (2 * lat + 1) * 2, hopper: DOZER_BUFFER, latHalf: lat, vert: 2, reach: 2, blade: T.dozerBlade }; }
  if (kind === 'wheel') return { max: (T.wheelMax || 0) + (T.wheelMax ? f : 0), rate: T.wheelRate, swing: T.wheelSwing, hopper: Math.round(HOPPER_BASE.wheel * T.hopMul), latHalf: 5, vert: 6, reach: 3 };
  return { max: (T.truckMax || 0) + (T.truckMax ? f : 0), speed: T.truckSpeed, bed: T.truckBed, range: T.truckRange };
}
export const earthDemand = (T, e, base) => (e.off ? 0 : base * (T.earthDraw ?? 1));

// ---------------------------------------------------------------- looks
const M = {
  yellow: new THREE.MeshStandardMaterial({ color: 0xe8b81c, roughness: 0.5, metalness: 0.3 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xe0762a, roughness: 0.55, metalness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.5, metalness: 0.8 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x77879a, roughness: 0.35, metalness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x6fb7d8, roughness: 0.1, metalness: 0.2, emissive: 0x1a3a4a, emissiveIntensity: 0.5 }),
  fill: new THREE.MeshStandardMaterial({ color: 0xd06a9a, roughness: 0.95 }),
  glowO: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 1.4, 0.3) }),
  glowG: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 3, 1.2) }),
  glowR: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 0.3, 0.2) }),
};
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cyl = (r, l, m, x = 0, y = 0, z = 0, axis = 'x') => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 14), m); o.position.set(x, y, z); if (axis === 'x') o.rotation.z = Math.PI / 2; else if (axis === 'z') o.rotation.x = Math.PI / 2; return o; };
const tracks = (g, sx, len, w, h) => { for (const s of [-1, 1]) { g.add(box(w, h, len, M.dark, s * sx, h / 2, 0)); for (let q = -2; q <= 2; q++) g.add(box(w + 0.04, 0.07, 0.12, M.steel, s * sx, 0.04, (q / 2) * (len * 0.4))); } };

export function makeEarth(kind, ent, T) {
  const g = new THREE.Group(); const p = {};
  if (kind === 'excavator') {
    tracks(g, 0.72, 2.0, 0.5, 0.55);
    const turret = new THREE.Group(); turret.position.y = 0.6; g.add(turret); p.turret = turret;
    turret.add(box(1.6, 0.5, 1.7, M.yellow, 0, 0.25, -0.1), box(0.8, 0.85, 0.8, M.steel, -0.4, 0.92, 0.3), box(0.7, 0.55, 0.05, M.glass, -0.4, 1.0, 0.71), box(1.5, 0.5, 0.45, M.dark, 0, 0.5, -0.82));
    const hop = new THREE.Group(); hop.position.set(0.2, 0.6, -0.55); turret.add(hop);
    hop.add(box(0.9, 0.04, 0.7, M.dark, 0, 0, 0), box(0.04, 0.4, 0.7, M.orange, -0.45, 0.2, 0), box(0.04, 0.4, 0.7, M.orange, 0.45, 0.2, 0), box(0.9, 0.4, 0.04, M.orange, 0, 0.2, -0.35), box(0.9, 0.4, 0.04, M.orange, 0, 0.2, 0.35));
    const fill = box(0.84, 1, 0.64, M.fill, 0, 0.04, 0); fill.scale.y = 0.01; hop.add(fill); p.fill = fill; p.fillMax = 0.4;
    p.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.glowG); p.lamp.position.set(-0.4, 1.42, 0.3); turret.add(p.lamp);
    const boom = new THREE.Group(); boom.position.set(0.5, 0.5, 0.7); turret.add(boom); p.boom = boom;
    boom.add(box(0.2, 0.22, 2.2, M.yellow, 0, 0, 1.1));
    const stick = new THREE.Group(); stick.position.z = 2.2; boom.add(stick); p.stick = stick;
    stick.add(box(0.16, 0.18, 1.7, M.yellow, 0, 0, 0.85));
    const bucket = new THREE.Group(); bucket.position.z = 1.7; stick.add(bucket); p.bucket = bucket;
    bucket.add(box(0.95, 0.5, 0.6, M.dark, 0, -0.15, 0.25));
    for (let q = -2; q <= 2; q++) bucket.add(box(0.08, 0.16, 0.12, M.steel, q * 0.2, -0.38, 0.58));
  } else if (kind === 'dozer') {
    tracks(g, 0.78, 2.1, 0.5, 0.6);
    g.add(box(1.5, 0.55, 1.8, M.yellow, 0, 0.78, -0.05), box(1.0, 0.5, 0.8, M.yellow, 0, 1.3, -0.5), box(0.9, 0.1, 0.9, M.dark, 0, 1.6, -0.5), box(0.1, 0.7, 0.1, M.dark, -0.42, 1.25, -0.9), box(0.1, 0.7, 0.1, M.dark, 0.42, 1.25, -0.9), cyl(0.07, 0.8, M.dark, 0.5, 1.3, 0.4, 'y'));
    p.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.glowG); p.lamp.position.set(0, 1.68, -0.5); g.add(p.lamp);
    const blade = new THREE.Group(); blade.position.set(0, 0.6, 1.45); g.add(blade); p.blade = blade;
    blade.add(box(1, 0.95, 0.14, M.steel, 0, 0.2, 0.15), box(1, 0.08, 0.18, M.orange, 0, -0.28, 0.2));
    for (const s of [-1, 1]) g.add(box(0.1, 0.1, 1.3, M.dark, s * 0.7, 0.62, 0.8));
    p.bladeW = 1;
  } else if (kind === 'wheel') {
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) g.add(box(0.7, 0.8, 2.6, M.dark, sx * 1.4, 0.4, sz * 1.1));
    const turret = new THREE.Group(); turret.position.y = 0.85; g.add(turret); p.turret = turret;
    turret.add(box(3.0, 0.7, 3.4, M.yellow, 0, 0.35, 0), box(1.3, 1.3, 1.3, M.steel, -0.7, 1.35, 0.5), box(1.1, 0.8, 0.05, M.glass, -0.7, 1.5, 1.16), box(2.4, 0.9, 0.9, M.dark, 0, 1.0, -1.5));
    const hop = new THREE.Group(); hop.position.set(0.8, 0.7, -0.9); turret.add(hop);
    hop.add(box(1.2, 0.05, 1.1, M.dark, 0, 0, 0), box(0.05, 0.6, 1.1, M.orange, -0.6, 0.3, 0), box(0.05, 0.6, 1.1, M.orange, 0.6, 0.3, 0), box(1.2, 0.6, 0.05, M.orange, 0, 0.3, -0.55), box(1.2, 0.6, 0.05, M.orange, 0, 0.3, 0.55));
    const fill = box(1.14, 1, 1.04, M.fill, 0, 0.05, 0); fill.scale.y = 0.01; hop.add(fill); p.fill = fill; p.fillMax = 0.6;
    p.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), M.glowG); p.lamp.position.set(-0.7, 2.15, 0.5); turret.add(p.lamp);
    const boom = new THREE.Group(); boom.position.set(0, 1.0, 0.9); boom.rotation.x = -0.28; turret.add(boom); p.boom = boom;
    boom.add(box(0.4, 0.4, 5.6, M.yellow, 0, 0, 2.8));
    const wheel = new THREE.Group(); wheel.position.set(0, 0, 5.6); boom.add(wheel); p.wheel = wheel;
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.14, 8, 28), M.steel).rotateY(Math.PI / 2));
    for (let q = 0; q < 12; q++) { const a = (q / 12) * Math.PI * 2; const b = box(0.9, 0.34, 0.5, M.dark, 0, Math.sin(a) * 1.7, Math.cos(a) * 1.7); b.rotation.x = -a; wheel.add(b); }
    wheel.add(cyl(0.2, 1.2, M.steel, 0, 0, 0, 'x'));
    const rear = box(0.5, 0.4, 3.0, M.orange, 0, 1.0, -3.0); turret.add(rear);
  } else {
    g.add(box(1.5, 0.35, 2.9, M.dark, 0, 0.55, 0));
    g.add(box(1.4, 1.0, 0.95, M.yellow, 0, 1.2, 1.0), box(1.2, 0.5, 0.05, M.glass, 0, 1.4, 1.5));
    const bed = new THREE.Group(); bed.position.set(0, 0.8, -0.55); g.add(bed); p.bed = bed;
    bed.add(box(1.5, 0.08, 1.8, M.orange, 0, 0, 0), box(0.08, 0.8, 1.8, M.orange, -0.75, 0.4, 0), box(0.08, 0.8, 1.8, M.orange, 0.75, 0.4, 0), box(1.5, 0.8, 0.08, M.orange, 0, 0.4, -0.9), box(1.5, 0.8, 0.08, M.orange, 0, 0.4, 0.9));
    const fill = box(1.4, 1, 1.7, M.fill, 0, 0.04, 0); fill.scale.y = 0.01; bed.add(fill); p.fill = fill; p.fillMax = 0.78;
    p.wheels = [];
    for (const sz of [-1.0, 0.0, 1.0]) for (const sx of [-1, 1]) { const wl = cyl(0.36, 0.3, M.dark, sx * 0.78, 0.36, sz, 'x'); g.add(wl); p.wheels.push(wl); }
    p.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.glowG); p.lamp.position.set(0, 1.78, 1.0); g.add(p.lamp);
  }
  void ent; void T;
  return { group: g, ...p, kind };
}

// ---------------------------------------------------------------- placement
const footCells = (half, hgt, i, j, k) => { const out = []; for (let a = -half; a <= half; a++) for (let b = -half; b <= half; b++) for (let v = 0; v < hgt; v++) out.push([i + a, j + v, k + b]); return out; };

export function planEarth(m, kind, eye, dir, yaw) {
  const g = m.game, w = g.world, spec = EARTH[kind];
  const r = m.rayEmpty(eye, dir, 6);
  if (!r) return { ok: false, why: 'Aim at the floor' };
  let { i, j, k } = r.last; let n = 0;
  while (j > 0 && !w.solid(i, j - 1, k) && n++ < 8) j--;
  const fx = Math.sin(yaw), fz = Math.cos(yaw); let dx = 0, dz = 0;
  if (Math.abs(fx) > Math.abs(fz)) dx = Math.sign(fx); else dz = Math.sign(fz);
  const ent = { kind, i, j, k, dx, dz, x: cellX(i), y: j * C, z: cellZ(k) };
  if (j > 0 && !w.solid(i, j - 1, k)) return { ok: false, why: 'Needs ground', ent };
  const span = 2 * spec.half + 1;
  let under = 0; for (let a = -spec.half; a <= spec.half; a++) for (let b = -spec.half; b <= spec.half; b++) if (j === 0 || w.solid(i + a, j - 1, k + b)) under++;
  if (under < Math.ceil(span * span * 0.6)) return { ok: false, why: 'Ground too uneven', ent };
  for (const [ci, cj, ck] of footCells(spec.half, spec.hgt, i, j, k)) {
    if (w.solid(ci, cj, ck)) return { ok: false, why: `Needs a clear ${span}x${span} area, ${(spec.hgt * C).toFixed(1)} m high`, ent };
    if (g.logi.tiles.has(idx(ci, cj, ck)) || w.reserved.has(idx(ci, cj, ck))) return { ok: false, why: 'Something is in the way', ent };
  }
  for (const it of m.items.values()) {
    const o = it.ent; if (!isEarth(o.type) || o.done) continue;
    if (Math.max(Math.abs(o.i - i), Math.abs(o.k - k)) <= spec.half + EARTH[o.type].half) return { ok: false, why: 'Too close to another earth mover', ent };
  }
  if (spec.dig) {
    let face = false;
    for (let f = spec.half + 1; f <= spec.half + 12 && !face; f++) for (let v = 0; v < spec.vert; v++) if (w.solid(i + dx * f, j + v, k + dz * f)) { face = true; break; }
    if (!face) return { ok: false, why: 'Face the pile wall: it digs the way you face', ent };
  }
  return { ok: true, ent };
}

// what a new machine of this kind is made of (the plan is data only, so a guest's plan can be sent to the host as it is)
export function newEarthEnt(kind, e, id) {
  const base = { id, type: kind, i: e.i, j: e.j, k: e.k, dx: e.dx, dz: e.dz, x: e.x, y: e.y, z: e.z, hy: EARTH[kind].hy, hr: EARTH[kind].hr };
  if (EARTH[kind].dig) return { ...base, hop: [], hn: 0, steps: 0, dug: 0, state: 'idle' };
  return { ...base, px: e.x, pz: e.z, cargo: [], cn: 0, route: [], seg: 0, trips: 0, state: 'idle', job: 0, yaw: Math.atan2(e.dx, e.dz) };
}

// the host checks a guest's plan again before it builds it
export function earthConflict(game, kind, e) {
  const T = game.T, spec = EARTH[kind]; if (!spec || !e) return 'Nothing to place';
  const tu = earthTune(T, kind); if (game.machines.count(kind) >= tu.max) return `${spec.name} limit reached (${tu.max})`;
  for (const it of game.machines.items.values()) { const o = it.ent; if (!isEarth(o.type) || o.done) continue; if (Math.max(Math.abs(o.i - e.i), Math.abs(o.k - e.k)) <= spec.half + EARTH[o.type].half) return 'Too close to another earth mover'; }
  return null;
}

// ---------------------------------------------------------------- the load rule and the air rule
export function bestFrameKind(T) { const ks = Object.keys(FRAME_TYPES); let best = 'timber', bi = -1; for (const k of T.frames || []) { const q = ks.indexOf(k); if (q > bi) { bi = q; best = k; } } return best; }
// what the canopy of a digger can bear: the roof area it covers carries the same weight a frame's does, rated to the best frame's depth
export function canopyCap(T, spec) {
  const f = FRAME_TYPES[bestFrameKind(T)]; if (!isFinite(f.maxDepth)) return Infinity;
  return BASE_LOAD * Math.pow(spec.canopy / 2.5, 2) * (1 + f.maxDepth / PRESS) * 0.95;
}
export function canopyRatio(game, e) {
  const spec = EARTH[e.type], cap = canopyCap(game.T, spec); if (!isFinite(cap)) return 0;
  return loadOn(game.world, { x: e.x, y: e.y + 1.4, z: e.z, r: spec.canopy, kind: 'canopy', cap, id: 'canopy' + e.id }) / cap;
}
export const airAt = (game, e) => game.dust.stale({ x: e.x, y: e.y + 1.6, z: e.z });

// ---------------------------------------------------------------- digging
const cellAt = (e, f, l, v) => [e.i + e.dx * f + (e.dz !== 0 ? l : 0), e.j + v, e.k + e.dz * f + (e.dx !== 0 ? l : 0)];
const facingDir = (e) => { for (let d = 0; d < 4; d++) if (DX[d] === e.dx && DZ[d] === e.dz) return d; return 0; };

export function workCells(game, e, tu) {
  const w = game.world, spec = EARTH[e.type], out = [];
  for (let f = spec.half + 1; f <= spec.half + tu.reach; f++) for (let l = -tu.latHalf; l <= tu.latHalf; l++) for (let v = 0; v < tu.vert; v++) {
    const [i, j, k] = cellAt(e, f, l, v); const s = w.get(i, j, k);
    if (!s || isSpecialCell(s) || s === NEEDLE || w.reserved.has(idx(i, j, k))) continue;
    out.push([f * 10 + Math.abs(l) * 1.5 + v * 0.7, i, j, k]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

function faceAhead(game, e, spec) {
  const w = game.world;
  for (let f = spec.half + 1; f <= spec.half + 12; f++) for (let v = 0; v < spec.vert; v++) if (w.solid(e.i + e.dx * f, e.j + v, e.k + e.dz * f)) return true;
  return false;
}

function countDug(game, taken) {
  const S = game.S;
  S.stats.plush++; S.stats.rar[species[taken.sp].rarity]++; S.stats.cells++; S.stats.earthDug = (S.stats.earthDug || 0) + 1;
  if (taken.vr & 128) S.stats.shiny++;
  game.registerDex(taken.sp, true);
}

// sell a batch of plush at once: one money update, one coin sound, the same value rules as any machine sale
export function sellBatch(game, flat, mult = 1) {
  const S = game.S; let total = 0, n = 0; const memo = new Map();
  for (let q = 0; q < flat.length; q += 2) {
    const sp = flat[q], vr = flat[q + 1], key = sp * 256 + vr;
    let v = memo.get(key); if (v === undefined) { v = Math.max(1, Math.round(game.valueOf(sp, vr, 0) * mult * (game.golden > 0 ? 2 : 1))); memo.set(key, v); }
    total += v; n++; game.contracts.onSale(sp, vr);
  }
  if (!n) return 0;
  S.money += total; S.totalEarned += total; S.stats.sold += n;
  game.ui.setMoney(S.money); game.ui.gain(total);
  if (game.coinCd <= 0) { game.coinCd = 0.12; game.sound.coin(0); }
  return total;
}

// a belt, sorter or vault within a few cells behind the machine takes its plush (a short trailing chute: it can move up a few cells before it leaves the belt behind)
export const OUTLET_REACH = 5;
export function outletTiles(game, e, spec) {
  const out = [], face = facingDir(e);
  for (let f = -(spec.half + 1); f >= -(spec.half + 1 + OUTLET_REACH); f--) for (let l = -spec.half; l <= spec.half; l++) for (const dj of [0, -1, 1]) {
    const [i, , k] = cellAt(e, f, l, dj); const t = game.logi.tiles.get(idx(i, e.j + dj, k));
    if (!t) continue;
    if (t.type === 'belt' && t.dir === face) continue;     // a belt that runs into the machine is not an outlet
    if (t.type === 'belt' || t.type === 'sorter' || t.type === 'vault') out.push(t);
  }
  return out;
}

// hopper -> a belt, sorter or vault standing behind the machine
function flushHopper(game, it, spec) {
  const e = it.ent; if (!e.hop.length) return;
  const outs = outletTiles(game, e, spec); if (!outs.length) return;
  let moved = 0;
  for (let n = 0; n < 8 && e.hop.length; n++) {
    let ok = false;
    for (const t of outs) if (game.logi.accept(t, { sp: e.hop[0], vr: e.hop[1] }, null)) { e.hop.splice(0, 2); ok = true; moved++; break; }
    if (!ok) break;
  }
  if (moved) e.hn = e.hop.length / 2;
}

function lampFor(it, state) {
  const p = it.earth; if (!p || !p.lamp) return;
  p.lamp.material = state === 'dig' || state === 'advance' || state === 'go' || state === 'back' || state === 'load' || state === 'unload' ? M.glowG : state === 'idle' || state === 'wait' || state === 'full' ? M.glowO : M.glowR;
}

export function addEarth(m, ent) {
  const game = m.game, spec = EARTH[ent.type], p = makeEarth(ent.type, ent, game.T);
  const it = { ent, obj: p.group, earth: p, t: 0, timer: 0.6, ph: 0, flushT: 0 };
  if (ent.type !== 'truck') {
    it.obj.position.set(cellX(ent.i), ent.j * C, cellZ(ent.k)); it.obj.rotation.y = Math.atan2(ent.dx, ent.dz);
    ent.x = cellX(ent.i); ent.z = cellZ(ent.k); ent.y = ent.j * C;
    it.shield = { x: ent.x, y: ent.y + 0.9, z: ent.z, r: spec.shield, b: 7, id: 'shield' + ent.id };
    game.world.supports.push(it.shield);
    if (!ent.hop) { ent.hop = []; ent.hn = 0; }
  } else {
    if (ent.px === undefined) { ent.px = ent.x; ent.pz = ent.z; }
    ent.cargo = ent.cargo || []; ent.route = ent.route || []; ent.cn = ent.cargo.length / 2; it.obj.position.set(ent.px, groundY(game, ent.px, ent.pz), ent.pz); it.obj.rotation.y = ent.yaw || 0;
  }
  return it;
}

const groundY = (game, x, z) => { const w = game.world; return w.topAt(toI(x), toK(z)) * C; };

function animate(it, dt, time) {
  const e = it.ent, p = it.earth; if (!p) return;
  const active = e.state === 'dig' || e.state === 'advance';
  if (p.boom && e.type === 'excavator') {
    if (active) it.ph += dt * 1.3; const s = Math.sin(it.ph);
    p.boom.rotation.x = -0.35 + 0.35 * Math.max(0, s); p.stick.rotation.x = 0.45 + 0.45 * Math.sin(it.ph + 0.9); p.bucket.rotation.x = 0.25 * Math.sin(it.ph + 1.7);
  } else if (e.type === 'wheel') {
    if (active) it.ph += dt * 1.8; p.wheel.rotation.x += dt * (active ? 2.6 : 0.2);
    p.boom.rotation.x = -0.28 + 0.05 * Math.sin(it.ph * 0.6);
  } else if (e.type === 'dozer') {
    const bw = (e.bw || 5) * C + 0.5; p.blade.scale.x += (bw - p.blade.scale.x) * Math.min(1, dt * 4); p.blade.position.z = 1.45 + (active ? 0.08 * Math.sin(time * 6) : 0);
  } else if (e.type === 'truck') { const mv = e.state === 'go' || e.state === 'back'; for (const wl of p.wheels) wl.rotation.x += mv ? dt * 7 : 0; }
  if (p.fill) { const cap = e.type === 'truck' ? (e.bed || 240) : (e.cap || 240); const n = e.type === 'truck' ? (e.cn || 0) : (e.hn || 0); const fr = Math.min(1, n / Math.max(1, cap)); p.fill.scale.y += (Math.max(0.01, fr * p.fillMax) - p.fill.scale.y) * Math.min(1, dt * 5); p.fill.position.y = (p.fill.scale.y) / 2 + 0.04; }
  lampFor(it, e.state);
}

export function updateEarth(m, it, dt, time) {
  const e = it.ent;
  if (e.type === 'truck') return updateTruck(m, it, dt, time);
  const game = m.game, w = game.world, T = game.T, spec = EARTH[e.type], tu = earthTune(T, e.type);
  e.cap = tu.hopper; e.bw = tu.blade;
  animate(it, dt, time);
  // smooth motion to the cell
  const tx = cellX(e.i), tz = cellZ(e.k), ty = e.j * C;
  it.obj.position.x += (tx - it.obj.position.x) * Math.min(1, dt * 5); it.obj.position.z += (tz - it.obj.position.z) * Math.min(1, dt * 5); it.obj.position.y += (ty - it.obj.position.y) * Math.min(1, dt * 5);
  it.shield.x = it.obj.position.x; it.shield.z = it.obj.position.z; it.shield.y = ty + 0.9;
  if (e.off) { e.state = 'off'; return; }
  it.flushT -= dt; if (it.flushT <= 0) { it.flushT = 0.5; flushHopper(game, it, spec); if (spec.direct && e.hop.length && !outletTiles(game, e, spec).length) { sellBatch(game, e.hop, DOZER_CHUTE); e.hop = []; e.hn = 0; } }
  const pw = e.pw ?? 0;
  if (pw < 0.05) { e.state = 'nopower'; return; }
  it.timer -= dt * pw;
  if (it.timer > 0) return;
  const comp = compaction(cellX(e.i), cellZ(e.k));
  if (tu.hopper && e.hop.length / 2 >= tu.hopper) { e.state = 'full'; it.timer = 0.5; return; }
  const air = airAt(game, e);
  if (air > STALE_CHOKE) { if (e.state !== 'choke') game.S.stats.earthChoke = (game.S.stats.earthChoke || 0) + 1; e.state = 'choke'; e.air = air; it.timer = 1.5; return; }
  const ratio = canopyRatio(game, e);
  e.load = ratio;
  if (ratio > 1) { if (e.state !== 'press') { game.S.stats.earthPress = (game.S.stats.earthPress || 0) + 1; game.ui.toast({ icon: spec.icon, title: `${spec.name} halted`, text: `The mountain presses ${Math.round(ratio * 100)}% of what its canopy can bear here. Better frames (the canopy is rated like your best one) or less depth.` }); } e.state = 'press'; it.timer = 2; return; }
  const cells = workCells(game, e, tu);
  if (cells.length) {
    e.state = 'dig';
    let n = 0, cx = 0, cy = 0, cz = 0;
    for (const [, i, j, k] of cells) {
      if (n >= tu.swing) break;
      if (tu.hopper && e.hop.length / 2 >= tu.hopper) break;
      const taken = w.removeCell(i, j, k); if (!taken) continue;
      n++; cx += cellX(i); cy += cellY(j); cz += cellZ(k);
      countDug(game, taken); e.dug = (e.dug || 0) + 1;
      if (spec.direct && !outletTiles(game, e, spec).length) sellBatch(game, [taken.sp, taken.vr], DOZER_CHUTE); else e.hop.push(taken.sp, taken.vr);
    }
    e.hn = e.hop.length / 2;
    if (n) { game.noteDist(cellX(e.i), cellZ(e.k)); game.fx.dust(cx / n, cy / n, cz / n, 5, 1.0, 1.0); }
    it.timer = tu.rate * comp;
    return;
  }
  if (!faceAhead(game, e, spec)) { e.state = 'idle'; it.timer = 1.5; return; }
  // nothing within reach: move up
  const ni = e.i + e.dx, nk = e.k + e.dz;
  if (ni < 4 || ni > NX - 5 || nk < 4 || nk > NZ - 5) { e.state = 'stuck'; it.timer = 3; return; }
  let free = true;
  for (const [ci, cj, ck] of footCells(spec.half, spec.hgt, ni, e.j, nk)) if (w.solid(ci, cj, ck) || game.logi.tiles.has(idx(ci, cj, ck))) { free = false; break; }
  if (free && e.j > 0 && !w.solid(ni, e.j - 1, nk)) free = false;
  if (!free) { e.state = 'stuck'; it.timer = 2; return; }
  e.i = ni; e.k = nk; e.x = cellX(ni); e.z = cellZ(nk); e.steps = (e.steps || 0) + 1; e.state = 'advance';
  game.noteDist(e.x, e.z);
  it.timer = tu.rate * 0.8 * comp;
}

// ---------------------------------------------------------------- hauling
function sinkNear(game, x, z) {
  const bp = game.hall.binPos; let best = { x: bp.x, z: bp.z, name: 'the bin' }, bd = Math.hypot(x - bp.x, z - bp.z);
  for (const it of game.machines.items.values()) if (it.ent.type === 'beacon') { const d = Math.hypot(x - it.ent.x, z - it.ent.z); if (d < bd) { bd = d; best = { x: it.ent.x, z: it.ent.z, name: 'a depot' }; } }
  return best;
}
// stop short of a target so the truck parks beside it
const stopBefore = (fx, fz, tx, tz, gap) => { const d = Math.hypot(tx - fx, tz - fz) || 1; const g = Math.min(gap, d); return [tx - ((tx - fx) / d) * g, tz - ((tz - fz) / d) * g]; };

export function findJob(game, tk) {
  const T = game.T, tu = earthTune(T, 'truck'); let best = null, bs = -1;
  const taken = new Set(); for (const it of game.machines.items.values()) if (it.ent.type === 'truck' && it.ent !== tk && it.ent.job && ['go', 'load'].includes(it.ent.state)) taken.add(it.ent.job);
  for (const it of game.machines.items.values()) {
    const d = it.ent; if (!EARTH[d.type] || !EARTH[d.type].dig || EARTH[d.type].direct || taken.has(d.id) || !d.hop || !d.hop.length) continue;
    const dist = Math.hypot(d.x - tk.x, d.z - tk.z); if (dist > tu.range) continue;
    const n = d.hop.length / 2, cap = d.cap || 240;
    const ready = n >= Math.min(tu.bed, cap) * 0.5 || ['full', 'idle', 'stuck', 'off', 'nopower', 'press', 'choke'].includes(d.state);
    if (!ready) continue;
    const score = n / (1 + dist / 400);
    if (score > bs) { bs = score; best = d; }
  }
  return best;
}

function updateTruck(m, it, dt, time) {
  truckLogic(m, it, dt);
  // keep the model where the truck is
  const e = it.ent, game = m.game, y = groundY(game, e.px, e.pz);
  it.obj.position.x = e.px; it.obj.position.z = e.pz; it.obj.position.y += (y - it.obj.position.y) * Math.min(1, dt * 6);
  it.obj.rotation.y = e.yaw || 0;
  animate(it, dt, time);
}

function truckLogic(m, it, dt) {
  const game = m.game, T = game.T, e = it.ent, tu = earthTune(T, 'truck');
  e.bed = tu.bed;
  const pw = e.pw ?? 0;
  if (e.off) { e.state = 'off'; return; }
  if (pw < 0.05) { if (e.state === 'idle' || e.state === 'wait' || e.state === 'nopower') e.state = 'nopower'; return; }
  if (e.state === 'nopower' || e.state === 'off') e.state = e.route && e.route.length && e.seg < e.route.length ? 'go' : 'idle';
  if (e.state === 'idle') {
    it.timer -= dt; if (it.timer > 0) return; it.timer = 1.0;
    const d = findJob(game, e); if (!d) return;
    const sink = sinkNear(game, d.x, d.z);
    const back = outletBackPoint(d);
    const [sx, sz] = stopBefore(d.x, d.z, sink.x, sink.z, 3.0), [hx, hz] = [e.x, e.z];
    e.job = d.id; e.route = [[back[0], back[1]], [sx, sz], [hx, hz]]; e.seg = 0; e.state = 'go';
    return;
  }
  if (e.state === 'go' || e.state === 'back') {
    const tg = e.route[e.seg]; if (!tg) { e.state = 'idle'; e.job = 0; return; }
    const dx = tg[0] - e.px, dz = tg[1] - e.pz, dist = Math.hypot(dx, dz), step = tu.speed * dt * pw;
    if (dist > 0.05) e.yaw = Math.atan2(dx, dz);
    if (dist <= step) {
      e.px = tg[0]; e.pz = tg[1];
      if (e.seg === 0 && e.state === 'go') { arriveDigger(game, e, it); }
      else if (e.seg === 1) { e.state = 'unload'; it.timer = 1.2; }
      else { e.state = 'idle'; e.job = 0; e.route = []; e.seg = 0; it.timer = 1.0; e.px = e.x; e.pz = e.z; }
    } else { e.px += (dx / dist) * step; e.pz += (dz / dist) * step; }
    return;
  }
  if (e.state === 'load' || e.state === 'unload') {
    it.timer -= dt * pw; if (it.timer > 0) return;
    if (e.state === 'load') { e.state = 'go'; e.seg = 1; return; }
    const n = e.cargo.length / 2;
    if (n) { sellBatch(game, e.cargo, 1); game.S.stats.hauled = (game.S.stats.hauled || 0) + n; game.S.stats.hauls = (game.S.stats.hauls || 0) + 1; e.trips = (e.trips || 0) + 1; game.fx.coin && game.fx.coin(e.px, 1.4, e.pz, 3); }
    e.cargo = []; e.cn = 0; e.state = 'back'; e.seg = 2;
  }
}

const outletBackPoint = (d) => [d.x - d.dx * (EARTH[d.type].half + 2) * C, d.z - d.dz * (EARTH[d.type].half + 2) * C];

function arriveDigger(game, e, it) {
  const d = game.machines.items.get(e.job); const tu = earthTune(game.T, 'truck');
  if (!d || !d.ent.hop || !d.ent.hop.length) { e.state = 'back'; e.seg = 2; e.job = 0; return; }
  const take = Math.min(tu.bed, d.ent.hop.length / 2);
  e.cargo = d.ent.hop.splice(0, take * 2); d.ent.hn = d.ent.hop.length / 2; e.cn = take;
  e.state = 'load'; it.timer = 0.8 + take * 0.004;
}

// ---------------------------------------------------------------- the player and the hopper
// E on a machine: empty a digger's hopper into your hands, otherwise park it or send it back to work. Returns what happened.
export function useEarth(game, it, room) {
  const e = it.ent, spec = EARTH[e.type];
  if (spec.dig && !spec.direct && e.hop.length && room > 0) { const n = Math.min(room, e.hop.length / 2); const items = e.hop.splice(0, n * 2); e.hn = e.hop.length / 2; return { took: items }; }
  e.off = !e.off; if (!e.off) e.state = 'idle'; return { off: e.off };
}

// taking a machine down: what is in its hopper or bed goes into your hands, then onto the floor, and a big load is sold on the spot
export function spillEarth(game, ent, x, y, z) {
  const flat = (ent.hop || []).concat(ent.cargo || []); let loose = 0; const rest = [];
  for (let q = 0; q < flat.length; q += 2) {
    if (game.S.carry.length < game.T.carry) game.S.carry.push({ sp: flat[q], vr: flat[q + 1] });
    else if (loose < 40) { loose++; game.sim.spawn(flat[q], flat[q + 1], x + Math.random() - 0.5, y + 0.6, z + Math.random() - 0.5, 0, 1, 0, 0); }
    else rest.push(flat[q], flat[q + 1]);
  }
  if (rest.length) sellBatch(game, rest, 1);
}

// ---------------------------------------------------------------- guests
export function earthRow(it) {
  const e = it.ent; const st = Math.max(0, STATES.indexOf(e.state));
  const row = [e.id, e.i, e.k, Math.round((e.pw ?? 0) * 100), st, e.type === 'truck' ? (e.cn || 0) : (e.hn || 0), +(e.px || 0).toFixed(2), +(e.pz || 0).toFixed(2), +(e.yaw || 0).toFixed(2), e.off ? 1 : 0, Math.round((e.load || 0) * 100), e.steps || 0, e.dug || 0];
  return row;
}
export function applyEarthRow(it, a) {
  const e = it.ent; e.state = STATES[a[4]] || 'idle';
  if (e.type === 'truck') { e.cn = a[5]; e.px = a[6]; e.pz = a[7]; e.yaw = a[8]; } else e.hn = a[5];
  e.off = !!a[9]; e.load = a[10] / 100; e.steps = a[11]; e.dug = a[12];
}
export function guestEarth(m, it, dt, time) {
  const game = m.game, e = it.ent, T = game.T;
  const tu = earthTune(T, e.type); e.cap = tu.hopper; e.bw = tu.blade; e.bed = tu.bed;
  if (e.type === 'truck') {
    const k = Math.min(1, dt * 6); it.obj.position.x += (e.px - it.obj.position.x) * k; it.obj.position.z += (e.pz - it.obj.position.z) * k;
    it.obj.position.y += (groundY(game, e.px, e.pz) - it.obj.position.y) * k;
    let dy = (e.yaw || 0) - it.obj.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); it.obj.rotation.y += dy * k;
  } else {
    const k = Math.min(1, dt * 5); e.x = cellX(e.i); e.z = cellZ(e.k);
    it.obj.position.x += (e.x - it.obj.position.x) * k; it.obj.position.z += (e.z - it.obj.position.z) * k; it.obj.position.y += (e.j * C - it.obj.position.y) * k;
    if (it.shield) { it.shield.x = it.obj.position.x; it.shield.z = it.obj.position.z; }
  }
  animate(it, dt, time);
}

// ---------------------------------------------------------------- the hover readout
const pct = (v) => `${Math.round((v ?? 0) * 100)}%`;
const STATE_TEXT = {
  off: 'Parked (E to run)', nopower: 'No power: link it to a pole or a generator', idle: 'Waiting', dig: 'Digging', advance: 'Moving up', stuck: 'Blocked ahead',
  full: 'Full: needs a belt that is moving behind it, a Haul Truck, or E to empty it', go: 'On the road', back: 'Heading home', load: 'Loading', unload: 'Unloading', wait: 'Waiting',
};
export function earthInfo(g, e) {
  const T = g.T, spec = EARTH[e.type], tu = earthTune(T, e.type), pw = (e.pw ?? 0) > 0.05 && !e.off;
  const power = (e.pw ?? 0) > 0.05 ? `Powered ${pct(e.pw)}` : 'No power: link it to a pole or a generator';
  const count = `${g.machines.count(e.type)} of ${tu.max} placed`;
  if (e.type === 'truck') {
    const where = e.state === 'idle' ? `Waiting for a hopper to fill (${Math.round(tu.range)} m range)` : STATE_TEXT[e.state] || e.state;
    return { title: 'HAUL TRUCK', lit: pw, lines: [e.off ? STATE_TEXT.off : where, `Carrying ${e.cn || 0} of ${tu.bed} plush, ${e.trips || 0} trips so far`, power, `${tu.speed.toFixed(1)} m/s. Drives from a digger's hopper to the bin or a depot and back. ${count}`] };
  }
  let state = STATE_TEXT[e.state] || e.state;
  if (e.state === 'press') state = `Halted: the mountain presses ${pct(e.load)} of what its canopy can bear here`;
  if (e.state === 'choke') state = 'Choking on stale air: a Support Fan must blow near it';
  if (e.state === 'idle') state = 'No pile wall ahead: it digs the way it faces';
  const lines = [state];
  if (!spec.direct) lines.push(`Hopper ${Math.floor(e.hn || 0)} of ${tu.hopper}`);
  else lines.push(`${e.dug || 0} plush pushed so far${e.hn ? `, ${Math.floor(e.hn)} queued for the belt` : ''}`);
  lines.push(power);
  lines.push(spec.direct ? `Blade ${tu.blade} wide, ${tu.swing} plush a pass, ${tu.rate.toFixed(1)} s a pass. Pushes onto a belt behind it, or down its chute at ${Math.round(DOZER_CHUTE * 100)}%` : `${2 * tu.latHalf + 1} wide, ${tu.vert} high, ${tu.swing} plush a swing, ${tu.rate.toFixed(1)} s a swing. Empties onto a belt within 3 m behind it, into a Haul Truck, or by hand (E)`);
  lines.push(`${count}. Leaves The One alone`);
  return { title: spec.name.toUpperCase(), lit: pw && !['press', 'choke', 'full', 'stuck'].includes(e.state), lines };
}
