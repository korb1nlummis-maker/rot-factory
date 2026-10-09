// Earth movers: the big late-game digging and hauling machines.
//   Excavator  digs a wide face from where it stands and fills a hopper.
//   Bulldozer  keeps a low blade in the pile, pushing whole rows toward a belt (or the bin chute at a discount).
//   Bucket-Wheel Excavator  eats a huge face at once.
//   Haul Truck carries plush from a digger's hopper to the bin (or a Depot Beacon) along a path and comes back.
// Diggers respect the mountain: each carries a canopy that must hold the roof under it (the same load tracing the frames use,
// rated like the best frame you own), and each chokes on deep stale air unless a Support Fan is blowing near it.
// The diggers scoop up The One like any plush, but it never leaves a machine on its own: it stays in the hopper (no belt, no chute, no sale), E takes it, and a Haul Truck
// carries it only through a powered Vehicle Scanner (vehiclescan.js), which dumps the load at the arch and sounds the alarm. A truck with The One aboard and no scanner on its road
// refuses to leave and says so. The host simulates; a guest only draws what the host reports.
import * as THREE from 'three';
import { C, NX, NZ, cellX, cellY, cellZ, toI, toJ, toK, idx } from './config.js';
import { NEEDLE, species, isSpecialCell } from './plushdata.js';
import { compaction } from './util.js';
import { FRAME_TYPES } from './upgrades.js';
import { BASE_LOAD, PRESS, loadOn } from './loadtrace.js';
import * as VS from './vehiclescan.js';
import * as HAUL from './haul.js';   // wave 6: tunnel routes, haul roads, docks and the truck battery
import * as BINS from './bins.js';   // which bin a machine sells at (an assignment, else the nearest)
import { saleCoin, binSpot } from './worldsound.js';   // the coin of a sale rings from its bin
import * as NB from './notebook.js';   // remains and supply caches beside a digger are flagged
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];   // the same direction table the belts use

export const EARTH = {
  excavator: { name: 'Excavator', short: 'Excavator', icon: '🏗️', cost: 9e5, half: 1, hgt: 4, vert: 5, reach: 3, latHalf: 3, canopy: 5.2, shield: 7, hy: 1.2, hr: 1.6, dig: true },
  dozer: { name: 'Bulldozer', short: 'Dozer', icon: '🚜', cost: 6e5, half: 1, hgt: 2, vert: 2, reach: 2, canopy: 4.4, shield: 6, hy: 0.7, hr: 1.6, dig: true, direct: true },
  wheel: { name: 'Bucket-Wheel Excavator', short: 'Bucket Wheel', icon: '⚙️', cost: 8e6, half: 2, hgt: 6, vert: 6, reach: 3, latHalf: 5, canopy: 7.5, shield: 9, hy: 2.0, hr: 3.2, dig: true },
  truck: { name: 'Haul Truck', short: 'Truck', icon: '🚛', cost: 3e5, half: 1, hgt: 2, hy: 0.8, hr: 1.4, dig: false },
};
export const EARTH_TYPES = new Set(Object.keys(EARTH));
export const isEarth = (t) => EARTH_TYPES.has(t);
export const EARTH_KW = { excavator: 30, dozer: 22, wheel: 80, truck: 10 };
export const EARTH_GROWTH = 1.55;     // each one you already run makes the next one 55% dearer
export const HOPPER_BASE = { excavator: 240, wheel: 1500 };
export const DOZER_CHUTE = 0.85;      // a blade that pushes plush to the chute with no belt behind it mashes some of the value
export const DOZER_BUFFER = 60;       // with a belt behind it the blade queues what it pushes (and waits when the belt is backed up)
export const STALE_CHOKE = 0.8;
export const STATES = ['off', 'nopower', 'idle', 'dig', 'advance', 'full', 'choke', 'press', 'stuck', 'go', 'load', 'unload', 'back', 'wait', 'scan', 'dump', 'hold', 'refuse', 'dead', 'blocked'];   // new states only ever go on the end: a row carries the index

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
    if (!s || isSpecialCell(s) || w.reserved.has(idx(i, j, k))) continue;   // The One is scooped like any plush (it stays in the hopper, see scoopedOne)
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

// a digger scooped The One: it stays in the hopper (never belted, chuted or sold) until a truck takes it through a Vehicle Scanner or you take it with E
function scoopedOne(game, e, spec) {
  game.registerDex(NEEDLE); if (game.sound && game.sound.found) game.sound.found();
  game.S.stats.oneScooped = (game.S.stats.oneScooped || 0) + 1;
  VS.announce(game, '🚨', 'THE ONE IS ABOARD', `The ${spec.name} scooped THE ONE into its hopper. It stays there: a Haul Truck carries it through a Vehicle Scanner, or press E on the ${spec.name} to take it.`, { cls: 'ach', ms: 12000 });
}

// sell a batch of plush at once: one money update, one coin sound, the same value rules as any machine sale
export function sellBatch(game, flat, mult = 1, bin) {
  const S = game.S; let total = 0, n = 0; const memo = new Map();
  if (VS.hasOne(flat)) {   // a machine never sells The One: whatever got this far is set down loose at the bin, not lost
    flat = flat.slice(); const one = VS.takeOne(flat), bp = game.hall.binPos;
    if (one) game.sim.spawn(one.sp, one.vr, bp.x + 1.5, 1.6, bp.z + 1.5, 0, 2, 0, 0);
  }
  for (let q = 0; q < flat.length; q += 2) {
    const sp = flat[q], vr = flat[q + 1], key = sp * 256 + vr;
    let v = memo.get(key); if (v === undefined) { v = Math.max(1, Math.round(game.valueOf(sp, vr, 0) * mult * (game.golden > 0 ? 2 : 1))); memo.set(key, v); }
    total += v; n++; game.contracts.onSale(sp, vr);
  }
  if (!n) return 0;
  S.money += total; S.totalEarned += total; S.stats.sold += n;
  if (bin !== undefined) BINS.note(game, bin, n, total);   // the bin it was sold at (the money is the same at every bin)
  game.ui.setMoney(S.money); game.ui.gain(total);
  saleCoin(game, binSpot(game, bin));   // the coin rings from the bin it was sold at (worldsound.js)
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
    let q = 0; while (q < e.hop.length && e.hop[q] === NEEDLE) q += 2;   // The One never goes onto a belt: it stays in the hopper
    if (q >= e.hop.length) break;
    let ok = false;
    for (const t of outs) if (game.logi.accept(t, { sp: e.hop[q], vr: e.hop[q + 1] }, null)) { e.hop.splice(q, 2); ok = true; moved++; break; }
    if (!ok) break;
  }
  if (moved) e.hn = e.hop.length / 2;
}

function lampFor(it, state) {
  const p = it.earth; if (!p || !p.lamp) return;
  p.lamp.material = state === 'scan' ? M.glowO : state === 'dig' || state === 'advance' || state === 'go' || state === 'back' || state === 'load' || state === 'unload' ? M.glowG : state === 'idle' || state === 'wait' || state === 'full' ? M.glowO : M.glowR;
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
    ent.cargo = ent.cargo || []; ent.route = ent.route || []; ent.cn = ent.cargo.length / 2; if (!Number.isFinite(ent.batt)) ent.batt = HAUL.battCap(game.T); it.obj.position.set(ent.px, groundY(game, ent.px, ent.pz), ent.pz); it.obj.rotation.y = ent.yaw || 0;
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
  } else if (e.type === 'truck') { const mv = e.state === 'go' || e.state === 'back'; for (const wl of p.wheels) wl.rotation.x += mv ? dt * 7 : 0; if (p.bed) p.bed.rotation.x += ((e.state === 'dump' ? 0.45 : 0) - p.bed.rotation.x) * Math.min(1, dt * 3); }
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
  it.flushT -= dt; if (it.flushT <= 0) { it.flushT = 0.5; flushHopper(game, it, spec); if (spec.direct && e.hop.length && !(e.hop.length === 2 && e.hop[0] === NEEDLE) && !outletTiles(game, e, spec).length) { const one = VS.takeOne(e.hop); sellBatch(game, e.hop, DOZER_CHUTE, binFor(game, e)); e.hop = one ? [one.sp, one.vr] : []; e.hn = e.hop.length / 2; } }
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
  NB.scan(game, spec.name, cellX(e.i), cellZ(e.k), 6);   // flag remains or a supply cache beside the digger (nothing here ever cuts one)
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
      if (spec.direct && taken.sp !== NEEDLE && !outletTiles(game, e, spec).length) sellBatch(game, [taken.sp, taken.vr], DOZER_CHUTE, binFor(game, e)); else { e.hop.push(taken.sp, taken.vr); if (taken.sp === NEEDLE) scoopedOne(game, e, spec); }
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
export function sinkNear(game, x, z) {
  const bp = game.hall.binPos; let best = { x: bp.x, z: bp.z, name: 'the bin', bin: BINS.HALL }, bd = Math.hypot(x - bp.x, z - bp.z);
  for (const it of game.machines.items.values()) if (it.ent.type === 'beacon') { const d = Math.hypot(x - it.ent.x, z - it.ent.z); if (d < bd) { bd = d; best = { x: it.ent.x, z: it.ent.z, name: 'a depot', bin: it.ent.id }; } }
  for (const dk of HAUL.docksOf(game)) { if (!HAUL.isSink(game, dk)) continue; const c = HAUL.dockCentre(dk), d = Math.hypot(x - c.x, z - c.z); if (d < bd) { bd = d; best = { x: c.x, z: c.z, name: 'a dock', dock: dk.id }; } }   // a dock with a belt at its end is a place a truck unloads
  return best;
}
// where a truck takes a load picked up at (fx, fz): its own bin, else its digger's, else the nearest (Auto). An assigned bin that has no power, is gone or is farther
// than one charge can drive is set aside, and the truck says so and uses Auto: nothing is ever stranded and a far bin is only ever slower.
function pickSink(game, e, d, fx, fz) {
  const dest = (e.dest | 0) || (d && (d.dest | 0)) || 0;
  if (dest) {
    const r = BINS.resolve(game, dest), me = { k: 'ent', o: e.dest ? e : (d || e) };
    if (r.bin) {
      if (HAUL.tripNeed(game.T, Math.hypot(r.bin.x - fx, r.bin.z - fz)) <= HAUL.battCap(game.T)) return { x: r.bin.x, z: r.bin.z, name: r.bin.name, bin: r.bin.id, assigned: true };
      BINS.fallback(game, me, 'range', r.bin.name);
    } else BINS.fallback(game, me, r.why, r.named ? r.named.name : '');
  }
  return sinkNear(game, fx, fz);
}
// the bin a digger's own sales (a bulldozer's chute) are credited to
function binFor(game, e) { const r = BINS.pick(game, e.dest, e.x, e.z); if (r.why) BINS.fallback(game, { k: 'ent', o: e }, r.why, r.named ? r.named.name : ''); return r.bin.id; }
// stop short of a target so the truck parks beside it
const stopBefore = (fx, fz, tx, tz, gap) => { const d = Math.hypot(tx - fx, tz - fz) || 1; const g = Math.min(gap, d); return [tx - ((tx - fx) / d) * g, tz - ((tz - fz) / d) * g]; };

export function findJob(game, tk) {
  const T = game.T, tu = earthTune(T, 'truck'); let best = null, bs = -1;
  const taken = new Set(); for (const it of game.machines.items.values()) if (it.ent.type === 'truck' && it.ent !== tk && it.ent.job && ['go', 'load'].includes(it.ent.state)) taken.add(it.ent.job);
  for (const it of game.machines.items.values()) {
    const d = it.ent; if (!EARTH[d.type] || !EARTH[d.type].dig || EARTH[d.type].direct || taken.has(d.id) || !d.hop || !d.hop.length) continue;
    if (tk.cache && tk.cache.skip && tk.cache.skip[d.id] > game.time) continue;   // no route to that digger for a while (a frame too narrow for a truck on the way)
    const dist = Math.hypot(d.x - tk.x, d.z - tk.z); if (dist > tu.range) continue;
    const n = d.hop.length / 2, cap = d.cap || 240;
    const ready = n >= Math.min(tu.bed, cap) * 0.5 || ['full', 'idle', 'stuck', 'off', 'nopower', 'press', 'choke'].includes(d.state);
    if (!ready) continue;
    const score = n / (1 + dist / 400);
    if (score > bs) { bs = score; best = d; }
  }
  return best;
}

// a truck on a searched route (a tunnel) drives on the floor under it, not over the top of the pile: the floor row near the row it was on
const onTunnelRoute = (e) => !!e.tun;   // set when either end of the trip is inside a tunnel (haul.jobRoute), cleared at the yard
function truckY(game, e, it) {
  let row = Math.round(it.obj.position.y / C), tun = onTunnelRoute(e) && e.state !== 'idle';
  // parked at its yard inside a tunnel: the floor of the yard, not the top of the pile (the model starts out on top of the column)
  if (!tun && Math.hypot(e.px - e.x, e.pz - e.z) < 3) { const home = Math.round((e.y || 0) / C); if (HAUL.enclosed(game, e.px, e.pz, home)) { tun = true; row = home; } }
  if (!tun && HAUL.enclosed(game, e.px, e.pz, row)) tun = true;
  if (tun) { const j = HAUL.floorNear(game, e.px, e.pz, row); if (j !== null) return j * C; }
  return groundY(game, e.px, e.pz);
}
function updateTruck(m, it, dt, time) {
  truckLogic(m, it, dt);
  // keep the model where the truck is
  const e = it.ent, game = m.game, y = truckY(game, e, it); e.py = +y.toFixed(2);
  it.obj.position.x = e.px; it.obj.position.z = e.pz; it.obj.position.y += (y - it.obj.position.y) * Math.min(1, dt * 6);
  it.obj.rotation.y = e.yaw || 0;
  animate(it, dt, time);
}

// a route waypoint is [x, z, tag]: dig (the digger's back point), scanA / scan / scanC (line up, stop under, leave a Vehicle Scanner), sink, home.
// Routes saved before the scanner have no tags: waypoint 0 is the digger, 1 the sink, 2 home.
const tagOf = VS.tagOf;

// the straight route for the rest of a trip from where the truck stands: a powered Vehicle Scanner on the way when there is one, the sink, home
function buildRoute(game, e, d) {
  const from = d ? [d.x, d.z] : [e.px, e.pz], sink = pickSink(game, e, d, from[0], from[1]);
  const [sx, sz] = sink.dock ? [sink.x, sink.z] : stopBefore(from[0], from[1], sink.x, sink.z, 3.0);   // a dock: the truck drives into the pad
  const sc = VS.pickScanner(game, from[0], from[1], sx, sz, earthTune(game.T, 'truck').range);
  const route = [[e.px, e.pz, 'dig']];
  const via = sc ? VS.routeVia(sc, e.px, e.pz) : [];
  // out of a tunnel: a searched route (vias) from where the truck stands to the first stop on the way to the bin
  const first = via.length ? via[0] : [sx, sz], rt = HAUL.jobRoute(game, { x: e.px, z: e.pz, y: e.py ?? groundY(game, e.px, e.pz) }, { x: first[0], z: first[1], y: groundY(game, first[0], first[1]) });
  if (!rt.ok) return { route, sc: sc ? sc.id : 0, why: rt.why, dockId: 0 };
  route.push(...rt.vias);
  if (sc) route.push(...via);
  route.push([sx, sz, 'sink'], [e.x, e.z, 'home']);
  return { route, sc: sc ? sc.id : 0, dockId: sink.dock || 0, bin: sink.bin, tun: !!rt.tun };
}
// no way through for a truck: it stays where it is and says why (the router names what is too narrow)
function blockRoute(game, e, it, why) {
  e.state = 'blocked'; e.why = why; it.timer = 2;
  if (e.warnedWhy === why) return; e.warnedWhy = why;
  game.S.stats.truckBlocked = (game.S.stats.truckBlocked || 0) + 1;
  VS.announce(game, '🚛', 'Haul Truck cannot get through', why, { ms: 12000 });
}

// a load with The One aboard and no powered scanner on the road: the truck stays put and says so
function refuse(game, e, it) {
  e.state = 'refuse'; it.timer = 1.5;
  if (e.warned) return; e.warned = true;
  game.S.stats.truckRefusals = (game.S.stats.truckRefusals || 0) + 1;
  VS.announce(game, '🚛', 'Haul Truck will not leave', 'Its load holds THE ONE and no powered Vehicle Scanner is on the road to the bin. Build and power one near the route, or press E on the truck to take The One.', { cls: 'ach', ms: 12000 });
}

function truckLogic(m, it, dt) {
  const game = m.game, T = game.T, e = it.ent, tu = earthTune(T, 'truck');
  e.bed = tu.bed;
  const pw = e.pw ?? 0;
  if (e.off) { e.state = 'off'; return; }
  if (pw < 0.05) { if (e.state === 'idle' || e.state === 'wait' || e.state === 'nopower') e.state = 'nopower'; return; }
  if (e.state === 'nopower' || e.state === 'off') e.state = e.route && e.route.length && e.seg < e.route.length ? 'go' : 'idle';
  const cap = HAUL.battCap(T);
  if (e.state === 'dead') {   // out of battery: E with a Charge Pack in your pack gets it going, and so does a powered Truck Dock it stands in (it drives on once it holds 15%)
    if (e.batt < cap && Math.hypot((e.px ?? e.x) - e.x, (e.pz ?? e.z) - e.z) < 3) e.batt = Math.min(cap, e.batt + HAUL.BATT.charge * pw * dt);   // at its own yard the yard charges it, like an idle truck
    if (!(e.batt >= HAUL.BATT.low * cap)) { e.bp = Math.round(100 * Math.min(1, e.batt / cap)); return; }
    e.state = e.resume && e.resume !== 'dead' ? e.resume : 'go'; e.why = '';
  }
  e.bp = Math.round(100 * Math.min(1, e.batt / cap));
  if (e.state === 'idle') {
    if (e.batt < cap && Math.hypot((e.px ?? e.x) - e.x, (e.pz ?? e.z) - e.z) < 3) e.batt = Math.min(cap, e.batt + HAUL.BATT.charge * pw * dt);   // the yard charges it, the way it always had its power
    it.timer -= dt; if (it.timer > 0) return; it.timer = 1.0;
    const d = findJob(game, e); if (!d) return;
    const back = outletBackPoint(d);
    e.px = e.px ?? e.x; e.pz = e.pz ?? e.z;
    const [hx, hz] = [e.x, e.z], sink = pickSink(game, e, d, d.x, d.z), [sx, sz] = sink.dock ? [sink.x, sink.z] : stopBefore(d.x, d.z, sink.x, sink.z, 3.0);
    const sc = VS.pickScanner(game, d.x, d.z, sx, sz, tu.range);
    const rt = HAUL.jobRoute(game, { x: e.px, z: e.pz, y: e.y ?? 0 }, { x: back[0], z: back[1], y: d.y ?? d.j * C });
    if (!rt.ok) { const c = e.cache || (e.cache = {}); (c.skip || (c.skip = {}))[d.id] = game.time + 8; e.why = rt.why; blockRoute(game, e, it, rt.why); e.state = 'idle'; it.timer = 1.0; return; }
    const need = HAUL.tripNeed(T, Math.max(Math.hypot(back[0] - e.px, back[1] - e.pz), rt.len || 0) + Math.hypot(sx - back[0], sz - back[1]));   // (the length of the searched route, not the straight line to the digger: a tunnel can wind)
    if (e.batt < need && need <= cap) { e.why = `Charging for the trip (${Math.round(100 * e.batt / cap)}%)`; return; }
    e.why = ''; e.warnedWhy = '';
    e.job = d.id; e.sc = sc ? sc.id : 0; e.dockId = sink.dock || 0; e.sinkBin = sink.bin; e.tun = !!rt.tun; e.route = [...rt.vias, [back[0], back[1], 'dig'], ...(sc ? VS.routeVia(sc, back[0], back[1]) : []), [sx, sz, 'sink'], [hx, hz, 'home']]; e.seg = 0; e.state = 'go';
    return;
  }
  if (e.state === 'blocked') {   // the road after loading was cut (or a frame is too narrow for a truck): look again every couple of seconds
    it.timer -= dt; if (it.timer > 0) return; it.timer = 2;
    const d = game.machines.items.get(e.job), built = buildRoute(game, e, d && d.ent);
    if (built.why) { blockRoute(game, e, it, built.why); return; }
    e.route = built.route; e.sc = built.sc; e.dockId = built.dockId; e.sinkBin = built.bin; e.tun = e.tun || built.tun; e.warnedWhy = ''; e.why = ''; e.state = 'go'; e.seg = 1; return;
  }
  if (e.state === 'go' || e.state === 'back') {
    const tg = e.route[e.seg]; if (!tg) { e.state = 'idle'; e.job = 0; return; }
    const dx = tg[0] - e.px, dz = tg[1] - e.pz, dist = Math.hypot(dx, dz), step = tu.speed * (HAUL.onRoad(game, e.px, e.pz) ? HAUL.ROAD.speed : 1) * dt * pw;   // a haul road plate: 1.4 times as fast
    if (dist > 0.05) e.yaw = Math.atan2(dx, dz);
    e.batt = Math.max(0, e.batt - HAUL.BATT.drive * dt * pw);   // driving draws 40 kW from the battery
    if (e.batt <= 0) { e.resume = e.state; e.state = 'dead'; e.why = 'Out of battery'; return; }
    if (dist <= step) {
      e.px = tg[0]; e.pz = tg[1];
      const tag = tagOf(e, e.seg);
      if (tag === 'dig' && e.state === 'go') { arriveDigger(game, e, it); }
      else if (tag === 'sink') { e.state = 'unload'; it.timer = 1.2; }
      else if (tag === 'scanA') { const sc = e.sc ? VS.byId(game, e.sc) : null; if (!sc || VS.enterLane(game, sc, e.id)) e.seg++; else { e.state = 'hold'; it.timer = 0.5; } }
      else if (tag === 'scan') {
        const sc = e.sc ? VS.byId(game, e.sc) : null;
        if (sc && VS.powered(game, sc)) { e.state = 'scan'; it.timer = VS.SCAN_TIME; }
        else { VS.leaveLane(sc, e.id); if (VS.hasOne(e.cargo)) refuse(game, e, it); else e.seg++; }   // the scanner was taken down or lost its power: do not drive off with The One
      }
      else if (tag === 'scanC') { VS.leaveLane(e.sc ? VS.byId(game, e.sc) : null, e.id); e.seg++; }
      else if (tag === 'via') e.seg++;   // a corner of the searched route through a tunnel
      else { e.state = 'idle'; e.job = 0; e.route = []; e.seg = 0; e.sc = 0; e.tun = false; it.timer = 1.0; e.px = e.x; e.pz = e.z; }
    } else { e.px += (dx / dist) * step; e.pz += (dz / dist) * step; }
    return;
  }
  if (e.state === 'hold') {   // an alarm is up at the scanner on the road, or another truck is in its lane: wait in line at the line-up point until it is free
    it.timer -= dt; if (it.timer > 0) return; it.timer = 0.5;
    const sc = e.sc ? VS.byId(game, e.sc) : null;
    if (!sc || VS.enterLane(game, sc, e.id)) { e.seg++; e.state = 'go'; }
    return;
  }
  if (e.state === 'scan') {
    it.timer -= dt * pw; if (it.timer > 0) return;
    const sc = e.sc ? VS.byId(game, e.sc) : null;
    if (!sc) { if (VS.hasOne(e.cargo)) refuse(game, e, it); else { e.state = 'go'; e.seg++; } return; }   // taken down mid scan: a load with The One never drives off unscanned
    if (VS.scanLoad(game, e, sc) === 'alarm') e.state = 'dump'; else { e.state = 'go'; e.seg++; }   // (the lane stays ours until scanC)
    return;
  }
  if (e.state === 'dump') {   // the load pours out on the ground at the arch, then the empty truck drives home
    const sc = e.sc ? VS.byId(game, e.sc) : null;
    const done = !sc ? 'gone' : VS.dumpStep(game, e, sc, dt, groundY(game, e.px, e.pz));
    if (done) {
      if (done !== true && e.cargo.length) sellBatch(game, e.cargo, 1, e.sinkBin);   // the scanner is gone or the floor is full: the rest of the load is sold like any haul, never erased
      VS.leaveLane(sc, e.id); e.cargo = []; e.cn = 0; e.dumpN = 0; e.dumpWait = 0; e.state = 'back'; e.seg = e.route.length - 1;
    }
    return;
  }
  if (e.state === 'refuse') {
    it.timer -= dt; if (it.timer > 0) return; it.timer = 1.5;
    const d = game.machines.items.get(e.job), built = buildRoute(game, e, d && d.ent);
    if (!VS.hasOne(e.cargo) || built.sc) { if (built.why) { blockRoute(game, e, it, built.why); return; } e.warned = false; e.route = built.route; e.sc = built.sc; e.dockId = built.dockId; e.sinkBin = built.bin; e.tun = e.tun || built.tun; e.state = 'go'; e.seg = 1; }   // someone took The One, or a scanner is up now
    return;
  }
  if (e.state === 'load' || e.state === 'unload') {
    it.timer -= dt * pw; if (it.timer > 0) return;
    if (e.state === 'load') {
      const d = game.machines.items.get(e.job), built = buildRoute(game, e, d && d.ent);   // the scanners may have changed since the truck left its yard
      if (built.why) { blockRoute(game, e, it, built.why); return; }
      e.route = built.route; e.sc = built.sc; e.dockId = built.dockId; e.sinkBin = built.bin; e.tun = e.tun || built.tun;
      if (VS.hasOne(e.cargo) && !built.sc) { refuse(game, e, it); return; }
      e.state = 'go'; e.seg = 1; return;
    }
    if (e.dockId) {   // a dock with a belt at its end: the load goes onto the belt at the belt's speed (The One never does, and a dock that lost its belt sells like the bin)
      const dk = HAUL.dockById(game, e.dockId);
      if (dk && !VS.hasOne(e.cargo)) {
        e.un0 = e.un0 || e.cargo.length / 2;
        const r = HAUL.unloadTo(game, dk, e, dt);
        if (r === true) { game.S.stats.hauled = (game.S.stats.hauled || 0) + e.un0; game.S.stats.hauls = (game.S.stats.hauls || 0) + 1; e.trips = (e.trips || 0) + 1; e.un0 = 0; e.dockId = 0; e.cargo = []; e.cn = 0; e.state = 'back'; e.seg = e.route.length - 1; return; }
        if (r !== 'gone' && r !== 'one') return;
      }
      e.dockId = 0; e.un0 = 0;
    }
    const n = e.cargo.length / 2;
    if (n) { sellBatch(game, e.cargo, 1, e.sinkBin); game.S.stats.hauled = (game.S.stats.hauled || 0) + n; game.S.stats.hauls = (game.S.stats.hauls || 0) + 1; e.trips = (e.trips || 0) + 1; game.fx.coin && game.fx.coin(e.px, 1.4, e.pz, 3); }
    e.cargo = []; e.cn = 0; e.state = 'back'; e.seg = e.route.length - 1;
  }
}

const outletBackPoint = (d) => [d.x - d.dx * (EARTH[d.type].half + 2) * C, d.z - d.dz * (EARTH[d.type].half + 2) * C];

function arriveDigger(game, e, it) {
  const d = game.machines.items.get(e.job); const tu = earthTune(game.T, 'truck');
  if (!d || !d.ent.hop || !d.ent.hop.length) { e.state = 'back'; e.seg = e.route.length - 1; e.job = 0; return; }
  const take = Math.min(tu.bed, d.ent.hop.length / 2);
  e.cargo = d.ent.hop.splice(0, take * 2); d.ent.hn = d.ent.hop.length / 2; e.cn = take;
  e.state = 'load'; it.timer = 0.8 + take * 0.004;
}

// ---------------------------------------------------------------- the player and the hopper
// E on a machine: empty a digger's hopper into your hands, otherwise park it or send it back to work. Returns what happened.
export function useEarth(game, it, room) {
  const e = it.ent, spec = EARTH[e.type];
  // The One comes out first, whatever the room in your hands: a hopper or a truck bed is not a place to leave it (the caller treats taking it as the win, like a gate)
  { const flat = spec.dig ? e.hop : e.cargo, one = flat && VS.takeOne(flat); if (one) { if (spec.dig) e.hn = e.hop.length / 2; else e.cn = e.cargo.length / 2; return { took: [one.sp, one.vr] }; } }
  if (spec.dig && !spec.direct && e.hop.length && room > 0) { const n = Math.min(room, e.hop.length / 2); const items = e.hop.splice(0, n * 2); e.hn = e.hop.length / 2; return { took: items }; }
  if (e.type === 'truck' && e.state === 'dead') {   // a Charge Pack gets a dead truck rolling again (30% of its battery)
    const S = game.S;
    if ((S.items.chargepack || 0) <= 0) return { off: false, msg: 'Out of battery. It needs a Charge Pack (Truck Docks, at the bench): press E again with one in your pack.' };
    S.items.chargepack--; if (S.items.chargepack <= 0) delete S.items.chargepack; game.rebuildTools();
    e.batt = Math.max(e.batt || 0, HAUL.BATT.pack * HAUL.battCap(game.T)); e.state = e.resume && e.resume !== 'dead' ? e.resume : 'go'; e.why = ''; game.S.stats.truckRescues = (game.S.stats.truckRescues || 0) + 1;
    return { off: false, msg: 'Charge Pack spent: the Haul Truck is back on the road at 30% battery.' };
  }
  e.off = !e.off; if (!e.off) e.state = 'idle'; return { off: e.off };
}

// taking a machine down: what is in its hopper or bed goes into your hands, then onto the floor, and a big load is sold on the spot
export function spillEarth(game, ent, x, y, z) {
  const flat = (ent.hop || []).concat(ent.cargo || []); let loose = 0; const rest = [];
  for (let q = 0; q < flat.length; q += 2) {
    if (flat[q] === NEEDLE && game.S.carry.length >= game.T.carry) { game.sim.spawn(flat[q], flat[q + 1], x + Math.random() - 0.5, y + 0.6, z + Math.random() - 0.5, 0, 1, 0, 0); continue; }   // never sold, never lost
    if (game.S.carry.length < game.T.carry) game.S.carry.push({ sp: flat[q], vr: flat[q + 1] });
    else if (loose < 40) { loose++; game.sim.spawn(flat[q], flat[q + 1], x + Math.random() - 0.5, y + 0.6, z + Math.random() - 0.5, 0, 1, 0, 0); }
    else rest.push(flat[q], flat[q + 1]);
  }
  if (rest.length) sellBatch(game, rest, 1);
}

// ---------------------------------------------------------------- guests
export function earthRow(it) {
  const e = it.ent; const st = Math.max(0, STATES.indexOf(e.state));
  const row = [e.id, e.i, e.k, Math.round((e.pw ?? 0) * 100), st, e.type === 'truck' ? (e.cn || 0) : (e.hn || 0), +(e.px || 0).toFixed(2), +(e.pz || 0).toFixed(2), +(e.yaw || 0).toFixed(2), e.off ? 1 : 0, Math.round((e.load || 0) * 100), e.steps || 0, e.dug || 0, VS.hasOne(e.type === 'truck' ? e.cargo : e.hop) ? 1 : 0, e.type === 'truck' ? (e.bp ?? 100) : 100, e.type === 'truck' ? +(e.py || 0).toFixed(2) : 0];
  return row;
}
export function applyEarthRow(it, a) {
  const e = it.ent; e.state = STATES[a[4]] || 'idle';
  if (e.type === 'truck') { e.cn = a[5]; e.px = a[6]; e.pz = a[7]; e.yaw = a[8]; } else e.hn = a[5];
  e.off = !!a[9]; e.load = a[10] / 100; e.steps = a[11]; e.dug = a[12]; e.one = a[13] === 1;   // a[13] only exists in rows from this version on
  if (a.length > 15) { e.bp = a[14]; e.py = a[15]; }   // the truck's battery (percent) and the height it drives at (a tunnel floor): older rows have neither
}
export function guestEarth(m, it, dt, time) {
  const game = m.game, e = it.ent, T = game.T;
  const tu = earthTune(T, e.type); e.cap = tu.hopper; e.bw = tu.blade; e.bed = tu.bed;
  if (e.type === 'truck') {
    const k = Math.min(1, dt * 6); it.obj.position.x += (e.px - it.obj.position.x) * k; it.obj.position.z += (e.pz - it.obj.position.z) * k;
    it.obj.position.y += ((Number.isFinite(e.py) ? e.py : groundY(game, e.px, e.pz)) - it.obj.position.y) * k;
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
  off: 'Parked (E to run)', nopower: 'No power: run a cable to it from a live pole or generator', idle: 'Waiting', dig: 'Digging', advance: 'Moving up', stuck: 'Blocked ahead',
  full: 'Full: needs a belt that is moving behind it, a Haul Truck, or E to empty it', go: 'On the road', back: 'Heading home', load: 'Loading', unload: 'Unloading', wait: 'Waiting',
  scan: 'Stopped under the Vehicle Scanner while the load is scanned', dump: 'Dumping the whole load on the ground: the scanner found The One',
  hold: 'Held in line at the Vehicle Scanner: another load is in its lane, or an alarm is up (take The One with E on the scanner to let trucks through)',
  refuse: 'Will not leave: the load holds The One and no powered Vehicle Scanner is on the road to the bin. Build and power one, or press E to take The One',
  dead: 'Out of battery: it stopped on the road. Press E with a Charge Pack in your pack (30% back), or set a powered Truck Dock under it: it charges at 25 kW and drives on at 15%',
  blocked: 'No way through: a support on its route is too narrow for a truck (a truck needs 5 x 4 cells clear: a giant arch, not a frame cube)',
};
// is The One aboard? The host reads the hopper or the bed; a guest only has the flag the row carried
const aboardOne = (g, e) => (g.isGuest() ? !!e.one : VS.hasOne(e.type === 'truck' ? e.cargo : e.hop));
export function earthInfo(g, e) {
  const T = g.T, spec = EARTH[e.type], tu = earthTune(T, e.type), pw = (e.pw ?? 0) > 0.05 && !e.off;
  const power = (e.pw ?? 0) > 0.05 ? `Powered ${pct(e.pw)}` : 'No power: run a cable to it from a live pole or generator';
  const count = `${g.machines.count(e.type)} of ${tu.max} placed`;
  if (e.type === 'truck') {
    const where = e.state === 'idle' ? `Waiting for a hopper to fill (${Math.round(tu.range)} m range)` : STATE_TEXT[e.state] || e.state;
    const lines = [e.off ? STATE_TEXT.off : where, `Carrying ${e.cn || 0} of ${tu.bed} plush, ${e.trips || 0} trips so far`];
    if (e.why && !['go', 'back', 'load', 'unload', 'scan', 'dump', 'hold', 'dead'].includes(e.state)) lines.splice(1, 0, e.why);
    { const bp = g.isGuest() ? (e.bp ?? 100) : Math.round(100 * Math.min(1, (e.batt ?? 0) / HAUL.battCap(T))); lines.push(`Battery ${bp}%${bp <= 15 ? ' (low: it waits at its yard or a dock until it can make the trip)' : ''}. Driving draws ${HAUL.BATT.drive} kW from it, the yard or a Truck Dock charges it at ${HAUL.BATT.charge} kW.`);
      if (e.state === 'go' || e.state === 'back') lines.push(HAUL.onRoad(g, e.px, e.pz) ? `On a haul road: ${HAUL.ROAD.speed}x speed.` : (onTunnelRoute(e) ? 'Driving a searched route through a tunnel (5 x 4 cells clear needed).' : '')); }
    if (aboardOne(g, e)) lines.push('THE ONE is aboard: it only leaves through a powered Vehicle Scanner. E takes it out.');
    const via = e.sc ? VS.routeNote(g, e) : ''; if (via && ['go', 'scan', 'hold', 'dump', 'load'].includes(e.state)) lines.push(via);
    lines.push(power, `${tu.speed.toFixed(1)} m/s. Drives from a digger's hopper through a Vehicle Scanner (when you have one) to the bin or a depot and back. ${count}`);
    return { title: 'HAUL TRUCK', lit: pw && !['refuse', 'hold'].includes(e.state), lines };
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
  if (aboardOne(g, e)) lines.splice(1, 0, 'THE ONE is in the hopper: press E to take it, or a Haul Truck carries it through a Vehicle Scanner.');
  lines.push(`${count}. Scoops The One like any plush and keeps it in the hopper (it never goes on a belt or down the chute)`);
  return { title: spec.name.toUpperCase(), lit: pw && !['press', 'choke', 'full', 'stuck'].includes(e.state), lines };
}
