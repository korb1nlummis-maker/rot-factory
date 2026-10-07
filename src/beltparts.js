// Lifts, underground pairs and Lift Frames: aim step, host re-check and the new entity's fields (Satisfactory spec 4.1, wave 1A).
// catalog_belts.js wires these into TYPES. Nothing here imports upgrades.js, crafting.js, power.js, machines.js or game.js (they import the
// catalog, so that would be an import cycle): everything live comes in through `g`.
import * as THREE from 'three';
import { C, NY, cellX, cellZ, idx } from './config.js';
import { LIFT_MIN, LIFT_MAX, UG_MIN, markOn, spanOf, tierOfId, tierOf, liftPriceOf, ugPriceOf, rateOf, framesNeeded, TIER_NAMES, FRAME_REACH, LIFT_FRAME_PRICE, K } from './beltdata.js';

export const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
export const FRAME_H = 1.8;   // the scaffold's height (m): the hammer and the readout aim at its middle
const isInt = Number.isInteger;
export const dirOfYaw = (yaw) => { const fx = Math.sin(yaw), fz = Math.cos(yaw); return Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 2) : (fz > 0 ? 1 : 3); };

// a Lift Frame stands like a strut: rated to the same depth (the same numbers as STRUT_DEPTH in upgrades.js; a test keeps them equal)
export const FRAME_RATING = 110, FRAME_RATING_JACK = 320;
export const frameRating = (T) => (T && T.jacks ? FRAME_RATING_JACK : FRAME_RATING);
export const depthAt = (x, z) => Math.hypot(x, z);   // supportDepth in upgrades.js

const inside = (g, i, j, k) => isInt(i) && isInt(j) && isInt(k) && g.world.inside(i, j, k);
const placeable = (g, i, j, k) => { const why = g.logi.canPlace(i, j, k); return why && why !== 'Too close' ? why : null; };
const have = (g, id) => (g.S.items && g.S.items[id]) || 0;
const flat = (n) => (Math.round(n)).toLocaleString('en-US');

// ---------------------------------------------------------------- lifts
// c = { i, j, k, dir, h } with h from 2 to 24 (up) or -2 to -24 (down: the tile stands at the top and the shaft goes below it).
// Returns a reason (string) or null. `held` = how many lift pieces the player holds (a lift is |h| of them).
export function liftProblem(g, tier, c, held) {
  if (!c || !isInt(c.dir) || !isInt(c.h)) return 'Bad lift';
  const ht = Math.abs(c.h), dn = c.h < 0;
  if (c.dir < 0 || c.dir > 3 || ht < LIFT_MIN || ht > LIFT_MAX) return `A lift is ${LIFT_MIN} to ${LIFT_MAX} cells high`;
  if (tier < 0 || !markOn(g.T, tier)) return 'That belt mark is not unlocked yet';
  if (tier === 0 && !g.T.liftOn) return 'Lifts are not unlocked yet';   // a higher mark brings its own lifts
  if (!inside(g, c.i, c.j, c.k)) return 'Out of the hall';
  const L = g.logi, w = g.world;
  if (dn) {
    // a down lift hangs its shaft below the tile, so the tile itself needs no floor; the bottom does
    if (w.solid(c.i, c.j, c.k) || L.cellTaken(c.i, c.j, c.k)) return w.solid(c.i, c.j, c.k) ? 'Blocked' : 'Occupied';   // (cellTaken: a belt, a shaft, a door, a rail piece or anything reserved)
    if (c.j + c.h < 0) return 'It would go through the floor';
    if (c.j + c.h > 0 && !w.solid(c.i, c.j + c.h - 1, c.k)) return 'The bottom of the shaft needs a floor';
  } else {
    const why = placeable(g, c.i, c.j, c.k); if (why) return why;
    if (c.j + c.h >= NY) return 'Too tall for the hall here';
  }
  for (let q = 1; q <= ht; q++) {
    const j = c.j + (dn ? -q : q);
    if (!inside(g, c.i, j, c.k) || w.solid(c.i, j, c.k) || L.cellTaken(c.i, j, c.k)) return 'Something is in the way in the shaft';
  }
  if (held < ht) return `A ${ht} cell lift takes ${ht} lift pieces. You hold ${held}.`;
  return null;
}

export function framesNear(g, i, k) {
  const x = cellX(i), z = cellZ(k); let n = 0;
  for (const it of g.machines.items.values()) { const e = it.ent; if (e.type === 'liftframe' && Math.hypot(e.x - x, e.z - z) <= FRAME_REACH) n++; }
  return n;
}

export function planLift(g, tool, eye, dir, yaw) {
  const tier = tierOfId(tool.id, 'lift');
  const a = g.logi.aimCell(eye, dir);
  if (tier < 0 || !a) return { plan: { ok: false, why: tier < 0 ? 'Not a lift' : 'Aim at the floor' }, cost: 0 };
  const ht = Math.max(LIFT_MIN, Math.min(LIFT_MAX, g.liftH | 0 || 4)), h = g.liftDown ? -ht : ht, d = dirOfYaw(yaw);
  const c = { i: a.i, j: a.j, k: a.k, dir: d, h };
  const why = liftProblem(g, tier, c, have(g, tool.id));
  const need = framesNeeded(ht), near = framesNear(g, a.i, a.k);
  const ent = { type: 'belt', i: a.i, j: a.j, k: a.k, dir: d, rise: 0, lift: { h } };
  const rate = rateOf(g.T, tier);
  const hintText = why ? null : `<kbd>B</kbd> set down: ${TIER_NAMES[tier]} lift ${h < 0 ? 'down' : 'up'}, ${ht} cells (${(ht * C).toFixed(1)} m), ${flat(rate)} plush per min, uses ${ht} pieces. <kbd>,</kbd> <kbd>.</kbd> change the height, <kbd>R</kbd> flips up and down${need ? `. It needs ${need} Lift Frame${need > 1 ? 's' : ''} beside it${near >= need ? ' (they are there)' : ` (${near} there)`}` : ''}`;
  return { plan: { ok: !why, why, ent, hintText }, cost: ht * liftPriceOf(tier) };
}

// the translucent column (and the cell it feeds) while a lift is in hand
export function previewLift(g, tool, plan) {
  const e = plan && plan.ent; if (!e) { g.machines.setGhost(null); return; }
  const h = e.lift.h, ht = Math.abs(h), dn = h < 0, key = `lift${plan.ok}${e.dir}${h}`;
  if (g.machines.ghostKey !== key) {
    const grp = new THREE.Group(), H = ht * C, y0 = dn ? -H : 0;
    const mat = new THREE.MeshBasicMaterial({ color: plan.ok ? 0x5dffa0 : 0xff5a4a, transparent: true, opacity: 0.32, depthWrite: false });
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.56, H, 0.56), mat); col.position.y = y0 + H / 2; grp.add(col);
    const out = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.56), mat); out.position.set(DX[e.dir] * C, (dn ? -H : H) + 0.05, DZ[e.dir] * C); grp.add(out);
    const pivot = new THREE.Group(); pivot.position.set(DX[e.dir] * C * 0.5, (dn ? -H : H) + 0.15, DZ[e.dir] * C * 0.5); pivot.rotation.y = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][e.dir];
    const arr = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 4), mat); arr.rotation.x = Math.PI / 2; pivot.add(arr); grp.add(pivot);
    g.machines.setGhost(grp, key);
  }
  if (g.machines.ghost) g.machines.ghost.position.set(cellX(e.i), e.j * C, cellZ(e.k));
}

// the fields of the new tile. Consumes the other h-1 lift pieces (the first one was taken by placeCurrent). null = refuse (the piece goes back).
export function buildLift(g, tool, e) {
  const tier = tierOfId(tool.id, 'lift'), h = e && e.lift ? e.lift.h : NaN;
  const c = e && { i: e.i, j: e.j, k: e.k, dir: e.dir, h };
  const why = liftProblem(g, tier, c, have(g, tool.id) + 1);
  if (why) return null;
  const left = have(g, tool.id) - (Math.abs(h) - 1);
  if (left > 0) g.S.items[tool.id] = left; else delete g.S.items[tool.id];
  const f = { type: 'belt', i: c.i, j: c.j, k: c.k, dir: c.dir, rise: 0, lift: { h }, items: [] };
  if (tier > 0) f.tier = tier;
  return f;
}

export function liftConflict(g, e, tool) {
  const tier = tool && tierOfId(tool.id, 'lift');
  if (!tool || tool.kind !== 'lift' || tier < 0) return 'That is not a lift';
  if (!e || typeof e !== 'object' || !e.lift || typeof e.lift !== 'object') return 'Bad lift';
  return liftProblem(g, tier, { i: e.i, j: e.j, k: e.k, dir: e.dir, h: e.lift.h }, have(g, tool.id));
}

// ---------------------------------------------------------------- underground pairs
// the unpaired entry of this mark standing behind (i,j,k) in line, 2 to span cells back, or null
export function ugPartner(g, tier, c) {
  const L = g.logi;
  for (let m = UG_MIN; m <= spanOf(tier); m++) {
    const t = L.tileAt(c.i - DX[c.dir] * m, c.j, c.k - DZ[c.dir] * m);
    if (t && t.type === 'belt' && t.ug && t.ug.role === 'in' && t.ug.pair == null && t.dir === c.dir && tierOf(t) === tier) return { tile: t, span: m };
  }
  return null;
}

// c = { i, j, k, dir, role, pair }. null when fine.
export function ugProblem(g, tier, c) {
  if (!c || !isInt(c.dir) || c.dir < 0 || c.dir > 3) return 'Bad underground end';
  if (tier < 0) return 'Not an underground end';
  if (!markOn(g.T, tier)) return 'That belt mark is not unlocked yet';
  if (tier === 0 && !g.T.ugOn) return 'Underground belts are not unlocked yet';   // a higher mark brings its own undergrounds
  if (!inside(g, c.i, c.j, c.k)) return 'Out of the hall';
  const why = placeable(g, c.i, c.j, c.k); if (why) return why;
  const p = ugPartner(g, tier, c);
  if (c.role === 'out') { if (!p || p.tile.id !== c.pair) return 'The entry it joins is gone'; }
  else if (c.role === 'in') { if (p) return 'Place this one as the exit of the open entry behind it'; if (c.pair != null) return 'Bad underground end'; }
  else return 'Bad underground end';
  return null;
}

export function planUg(g, tool, eye, dir, yaw) {
  const tier = tierOfId(tool.id, 'ug');
  const a = g.logi.aimCell(eye, dir);
  if (tier < 0 || !a) return { plan: { ok: false, why: tier < 0 ? 'Not an underground end' : 'Aim at the floor' }, cost: 0 };
  const d = dirOfYaw(yaw), c = { i: a.i, j: a.j, k: a.k, dir: d };
  const p = ugPartner(g, tier, c);
  c.role = p ? 'out' : 'in'; c.pair = p ? p.tile.id : null;
  const why = ugProblem(g, tier, c);
  const span = p ? p.span : 0;
  const ent = { type: 'belt', i: a.i, j: a.j, k: a.k, dir: d, rise: 0, ug: { role: c.role, pair: c.pair, span } };
  const hintText = why ? null : (p ? `<kbd>B</kbd> set down the exit: ${span} cells from its entry, passes under ${span - 1} cell${span > 2 ? 's' : ''}` : `<kbd>B</kbd> set down the entry (${TIER_NAMES[tier]}, up to ${spanOf(tier)} cells), then the exit in line ahead`);
  return { plan: { ok: !why, why, ent, hintText }, cost: ugPriceOf(tier) };
}

export function buildUg(g, tool, e) {
  const tier = tierOfId(tool.id, 'ug'); if (!e || !e.ug) return null;
  const c = { i: e.i, j: e.j, k: e.k, dir: e.dir, role: e.ug.role, pair: e.ug.pair };
  if (ugProblem(g, tier, c)) return null;
  const p = c.role === 'out' ? ugPartner(g, tier, c) : null;
  const f = { type: 'belt', i: c.i, j: c.j, k: c.k, dir: c.dir, rise: 0, items: [], ug: { role: c.role, pair: p ? p.tile.id : null, span: p ? p.span : 0 } };
  if (tier > 0) f.tier = tier;
  return f;
}

export function ugConflict(g, e, tool) {
  const tier = tool && tierOfId(tool.id, 'ug');
  if (!tool || tool.kind !== 'ug' || tier < 0) return 'That is not an underground end';
  if (!e || typeof e !== 'object' || !e.ug || typeof e.ug !== 'object') return 'Bad underground end';
  return ugProblem(g, tier, { i: e.i, j: e.j, k: e.k, dir: e.dir, role: e.ug.role, pair: e.ug.pair });
}

// ---------------------------------------------------------------- Lift Frames
export function frameProblem(g, c) {
  if (!c || !inside(g, c.i, c.j, c.k)) return 'Out of the hall';
  const w = g.world, L = g.logi;
  if (w.solid(c.i, c.j, c.k) || L.cellTaken(c.i, c.j, c.k)) return 'Occupied';
  if (c.j > 0 && !w.solid(c.i, c.j - 1, c.k)) return 'Needs a floor';
  const x = cellX(c.i), z = cellZ(c.k);
  const r = frameRating(g.T), d = depthAt(x, z);
  if (d > r) return `Too deep for a lift frame: rated ${r} m${g.T.jacks ? '' : ' (Hydraulic Jacks raise it)'}, this is ${Math.round(d)} m`;
  for (const it of g.machines.items.values()) { const e = it.ent; if (e.type === 'liftframe' && Math.hypot(e.x - x, e.z - z) < 0.3 && Math.abs(e.y - c.j * C) < 0.3) return 'A lift frame is already here'; }
  return null;
}

export function planFrame(g, tool, eye, dir) {
  const a = g.logi.aimCell(eye, dir);
  if (!a) return { plan: { ok: false, why: 'Aim at the floor beside a lift' }, cost: 0 };
  const why = frameProblem(g, a);
  const ent = { type: 'liftframe', i: a.i, j: a.j, k: a.k, x: cellX(a.i), y: a.j * C, z: cellZ(a.k), h: FRAME_H };
  const lifts = [...g.logi.lifts].filter((t) => Math.hypot(cellX(t.i) - ent.x, cellZ(t.k) - ent.z) <= FRAME_REACH && framesNeeded(Math.abs(t.lift.h)) > 0).length;
  return { plan: { ok: !why, why, ent, hintText: why ? null : `<kbd>B</kbd> set down. It holds ${lifts ? lifts + ' lift' + (lifts > 1 ? 's' : '') + ' beside it' : 'any lift taller than 8 cells within 1.3 m'}. Rated to ${frameRating(g.T)} m deep` }, cost: LIFT_FRAME_PRICE * K };
}

export function buildFrame(g, tool, e) {
  if (!e || frameProblem(g, { i: e.i, j: e.j, k: e.k })) return null;
  return { type: 'liftframe', i: e.i, j: e.j, k: e.k, x: cellX(e.i), y: e.j * C, z: cellZ(e.k), h: FRAME_H };
}
export function frameConflict(g, e, tool) {
  if (!tool || tool.kind !== 'liftframe' || tool.id !== 'liftframe') return 'That is not a lift frame';
  if (!e || typeof e !== 'object') return 'Bad lift frame';
  return frameProblem(g, { i: e.i, j: e.j, k: e.k });
}

const steel = new THREE.MeshStandardMaterial({ color: 0x59636e, roughness: 0.4, metalness: 0.85 });
const orange = new THREE.MeshStandardMaterial({ color: 0xe8742a, roughness: 0.5, metalness: 0.5 });
// a little steel tower beside the shaft with a collar plate: it reads as scaffolding without hiding the belt
export function makeFrameMesh(ent) {
  const g = new THREE.Group(), H = FRAME_H;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, H, 0.05), steel); post.position.set(sx * 0.2, H / 2, sz * 0.2); g.add(post); }
  for (const y of [0.3, 0.9, 1.5]) for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.035, 0.035), orange); a.position.set(0, y, s * 0.2); g.add(a); const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.45), orange); b.position.set(s * 0.2, y, 0); g.add(b); }
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), orange); top.position.y = H; g.add(top);
  g.position.set(ent.x, ent.y, ent.z);
  return g;
}
