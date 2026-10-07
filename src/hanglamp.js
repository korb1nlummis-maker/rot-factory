// Powered hanging lanterns. A lantern clips under the top beam of a support frame, like the Support Fan (mountfan.js): the mount
// point is the frame's cx, cz and the top of its beam (y0 + h), and nothing else about the frame matters, so it works for any frame size.
// It draws 1.6 kW (one 8 kW Generator runs five), is wired with the Power Cable chain (generator, then lantern to lantern), dims with its
// grid in a brownout and lights the plush around it through game.glowSources().
//
// A lantern is a machine ent (game.machines.items): { type:'hlamp', frameId, slot 0..3, x, y, z, h, hr, on, pw, cache }.
// Up to four hang from one frame, one on each side of the centre (slot 0 +x, 1 +z, 2 -x, 3 -z), so the Support Fan keeps the middle.
// y is the bottom of a 0.4 m tall body, so the aim cone and the wire clip (power.pos) use y + 0.2, the middle of it.
// No game imports: power.js, catalog_power.js and game.js use this file.
import * as THREE from 'three';
import { cacheOf, genKindOf, partName } from './powerparts.js';

export const LAMP_KW = 1.6;            // kW each, lit; a switched-off lantern draws nothing
export const LAMP_H = 0.4;             // body height (m)
export const LAMP_HANG = 0.5;          // the bottom of the body hangs this far below the top of the frame (a standing player's head clears it in a 2.4 m frame)
export const LAMP_SIDE = 0.5;          // metres from the middle of the frame to a lantern
export const LAMP_RANGE = 11;          // light radius on the plush (m)
export const LAMP_COLOR = [2.3, 1.9, 1.15];
export const LAMP_PRICE = 300;         // bench price before the K = 3 multiplier
export const LAMP_MAX_PER_SOURCE = 5;  // one 8 kW Generator carries this many (8 / 1.6)
const SLOT = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export const lampsOf = (g) => { const out = []; for (const it of g.machines.items.values()) if (it.ent.type === 'hlamp') out.push(it.ent); return out; };
export const topOf = (f) => f.y0 + f.h;
export const lampLevel = (e) => (e.on === false ? 0 : Math.max(0, Math.min(1, e.pw ?? 0)));
export const lampCenterY = (e) => e.y + LAMP_H / 2;

// the fields of the lantern that hangs from frame f in `slot` (the host builds them itself: a guest only says which frame and which side)
export function lampFields(f, slot) {
  const s = SLOT[slot] || SLOT[0];
  return { frameId: f.id, slot, x: f.cx + s[0] * LAMP_SIDE, z: f.cz + s[1] * LAMP_SIDE, y: topOf(f) - LAMP_HANG, h: LAMP_H, hr: 0.4, on: true };
}
const slotsTaken = (g, frameId) => { const t = new Set(); for (const e of lampsOf(g)) if (e.frameId === frameId) t.add(e.slot); return t; };
// the side you face first, then its neighbours, then the far side: the first one that is free
function pickSlot(taken, yaw) {
  const dx = Math.sin(yaw), dz = Math.cos(yaw);
  const fav = Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 0 : 2) : (dz >= 0 ? 1 : 3);
  for (const o of [0, 1, 3, 2]) { const s = (fav + o) & 3; if (!taken.has(s)) return s; }
  return -1;
}

// ---------------------------------------------------------------- aim: the frame under the crosshair
export function plan(g, eye, dir, yaw) {
  let best = null, bd = 1.6;
  for (const it of g.machines.items.values()) {
    const f = it.ent; if (f.type !== 'frame') continue;
    const px = f.cx, py = topOf(f) - 0.3, pz = f.cz;
    const vx = px - eye.x, vy = py - eye.y, vz = pz - eye.z, t = vx * dir.x + vy * dir.y + vz * dir.z; if (t < 0.2 || t > 6.5) continue;
    const d = Math.hypot(vx - dir.x * t, vy - dir.y * t, vz - dir.z * t); if (d < bd) { bd = d; best = f; }
  }
  if (!best) return { plan: { ok: false, why: 'Aim at a frame: the lantern clips under its top beam' }, cost: 0 };
  const slot = pickSlot(slotsTaken(g, best.id), Number.isFinite(yaw) ? yaw : 0);
  if (slot < 0) return { plan: { ok: false, why: 'This frame already has four lanterns' }, cost: 0 };
  return { plan: { ok: true, why: null, ent: lampFields(best, slot) }, cost: 0 };
}

// host re-check of a placement a guest asked for: the frame stands and the side is free
export function conflict(g, e) {
  if (!e || typeof e !== 'object') return 'Nothing to place';
  const it = g.machines.items.get(e.frameId); if (!it || it.ent.type !== 'frame') return 'That frame is gone';
  if (!Number.isInteger(e.slot) || e.slot < 0 || e.slot > 3) return 'Aim at a frame';
  if (slotsTaken(g, e.frameId).has(e.slot)) return 'A lantern already hangs there';
  return null;
}
export function build(g, e) {
  const it = g.machines.items.get(e.frameId); if (!it) return null;
  return { type: 'hlamp', ...lampFields(it.ent, e.slot) };
}

// ---------------------------------------------------------------- the model
// local origin is the middle of the body; the chain runs up to the beam
export function buildLamp(e, ghostOk) {
  const grp = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x59636e, roughness: 0.4, metalness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.6, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x3a3a34, emissive: 0xffc86a, emissiveIntensity: 0, roughness: 0.3, metalness: 0.0 }); glass.userData.lamp = true;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.05, 10), steel); cap.position.y = 0.15;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.05, 10), dark); base.position.y = -0.175;
  const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.25, 12), glass); bulb.name = 'glass'; bulb.position.y = 0;
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 5), dark); chain.position.y = 0.24;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.1), steel); plate.position.y = 0.295;
  grp.add(cap, base, bulb, chain, plate);
  for (let q = 0; q < 4; q++) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), steel); bar.position.set(Math.cos(q * Math.PI / 2) * 0.1, 0, Math.sin(q * Math.PI / 2) * 0.1); grp.add(bar); }
  grp.position.set(e.x, lampCenterY(e), e.z);
  if (ghostOk !== undefined) {
    const m = new THREE.MeshBasicMaterial({ color: ghostOk ? 0x5dffa0 : 0xff5a4a, transparent: true, opacity: 0.3, depthWrite: false });
    grp.traverse((o) => { if (o.isMesh) o.material = m; });
  }
  return grp;
}
export const ghostLamp = (e, ok) => buildLamp(e, ok);

// how bright the glass looks for a given level 0..1 (dim in a brownout)
export function paint(obj, lvl) {
  const glass = obj && obj.getObjectByName && obj.getObjectByName('glass'); if (!glass) return;
  const m = glass.material, k = Math.round(lvl * 40) / 40;
  if (m.userData.k === k) return; m.userData.k = k;
  m.emissiveIntensity = k * 2.6; m.color.setRGB(0.22 + 0.55 * k, 0.21 + 0.45 * k, 0.17 + 0.2 * k);
}

// ---------------------------------------------------------------- light on the plush: game.glowSources() asks for the nearest lit lanterns
export function lampSources(g, camPos, n, out) {
  if (n <= 0) return out;
  const cand = [];
  for (const e of lampsOf(g)) {
    const lvl = lampLevel(e); if (lvl <= 0.05) continue;
    const y = lampCenterY(e), d = (e.x - camPos.x) ** 2 + (y - camPos.y) ** 2 + (e.z - camPos.z) ** 2;
    if (d < 40 * 40) cand.push({ x: e.x, y, z: e.z, r: LAMP_RANGE, cr: LAMP_COLOR[0] * lvl, cg: LAMP_COLOR[1] * lvl, cb: LAMP_COLOR[2] * lvl, d });
  }
  cand.sort((a, b) => a.d - b.d);
  for (const c of cand) { if (n-- <= 0) break; out.push({ ...c, d: -1 }); }
  return out;
}

// ---------------------------------------------------------------- per frame (host and guest): looks, and the host drops lanterns whose frame is gone
let accum = 0;
export function tick(g, dt, guest) {
  accum += dt; if (accum < 0.08) return; const step = accum; accum = 0;
  for (const it of g.machines.items.values()) {
    const e = it.ent; if (e.type !== 'hlamp') continue;
    paint(it.obj, lampLevel(e));
    if (guest) continue;
    const c = cacheOf(e);
    if (g.machines.items.has(e.frameId)) { c.gone = 0; continue; }
    c.gone = (c.gone || 0) + step;
    if (c.gone > 1.2) g.doDecon({ kind: 'mach', id: e.id });   // the beam it hung from is gone: the lantern comes back to the pack, its cords with it
  }
}

// ---------------------------------------------------------------- the 0.5 s row a guest receives: [id, level in thousandths, grid supply, demand, rated, tripped]
export function packRow(g) {
  const list = lampsOf(g).sort((a, b) => a.id - b.id);
  if (!list.length) { if (!g._hlHad) return null; g._hlHad = false; return { l: [] }; }
  g._hlHad = true;
  const r2 = (v) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
  return { l: list.map((e) => { const c = e.cache || {}; return [e.id, Math.round(Math.max(0, Math.min(1, e.pw ?? 0)) * 1000), r2(c.sup), r2(c.dem), r2(c.cap), c.tr ? 1 : 0]; }) };   // the level in thousandths
}
export function applyRow(g, d) {
  if (!d || !Array.isArray(d.l)) return;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  for (const a of d.l) {
    if (!Array.isArray(a) || a.length < 6) continue;
    const it = g.machines.items.get(a[0]); if (!it || it.ent.type !== 'hlamp') continue;
    const e = it.ent, c = cacheOf(e);
    e.pw = Math.max(0, Math.min(1, num(a[1]) / 1000)); c.sup = Math.max(0, num(a[2])); c.dem = Math.max(0, num(a[3])); c.cap = Math.max(0, num(a[4])); c.tr = a[5] ? 1 : 0;
  }
}

// ---------------------------------------------------------------- where the power comes from (the same on both screens: cables and ents only)
const NODE_TYPES = new Set(['gen', 'pole', 'battery', 'switch', 'breaker']);
function nameOf(e) {
  if (!e) return 'something';
  if (e.type === 'gen') return genKindOf(e).name;
  if (e.type === 'pole') return 'Power Pole';
  if (e.type === 'battery' || e.type === 'switch' || e.type === 'breaker' || e.type === 'meter') return partName(e);
  return e.type;
}
// walks the cable chain from a lantern through other lanterns to the generator, pole or storage that feeds the line
export function traceLine(g, e) {
  const seen = new Set([e.id]), lamps = [e], queue = [e.id], hops = new Map([[e.id, 0]]);
  let src = null, srcHops = 1e9;
  while (queue.length) {
    const id = queue.shift();
    for (const c of g.cables.of(id)) {
      const oid = g.cables.other(c, id); if (seen.has(oid)) continue; seen.add(oid);
      const o = g.cables.ent(oid); if (!o) continue;
      const h = hops.get(id) + 1; hops.set(oid, h);
      if (o.type === 'hlamp') { lamps.push(o); queue.push(oid); } else if (NODE_TYPES.has(o.type) && h < srcHops) { src = o; srcHops = h; }
    }
  }
  return { lamps, src, hops: src ? srcHops : 0 };
}

export function info(g, e) {
  const lvl = lampLevel(e), c = e.cache || {}, lines = [];
  const on = e.on !== false, pw = e.pw ?? 0;
  const state = !on ? 'SWITCHED OFF' : pw <= 0.05 ? 'DARK' : pw < 0.99 ? `DIM ${Math.round(lvl * 100)}%` : 'LIT';
  if (!on) lines.push('Switched off: it draws no power. E switches it on.');
  else if (pw <= 0.05) lines.push(c.tr ? 'No light: the grid is tripped.' : 'No light: no power reaches it. Wire a Power Cable from a generator or from the lantern before it in the line.');
  else if (pw < 0.99) lines.push(`Dimmed to ${Math.round(lvl * 100)}%: the grid supplies ${(c.sup ?? 0).toFixed(1)} of ${(c.dem ?? 0).toFixed(1)} kW wanted (a brownout dims the whole line).`);
  else lines.push('Burning at full brightness.');
  lines.push(`Load ${on ? LAMP_KW.toFixed(1) : '0.0'} kW (a lantern draws ${LAMP_KW.toFixed(1)} kW)`);
  const line = traceLine(g, e), n = line.lamps.length, lit = line.lamps.filter((q) => q.on !== false).length;
  if (line.src) lines.push(`Source: ${nameOf(line.src)}${line.hops > 1 ? `, through ${line.hops - 1} other lantern${line.hops > 2 ? 's' : ''}` : ''}`);
  else lines.push(pw > 0.05 ? 'Source: the nearest pole or generator in reach' : 'Source: none wired yet');
  if (n > 1 || line.src) lines.push(`${n} lantern${n === 1 ? '' : 's'} on this line draw ${(lit * LAMP_KW).toFixed(1)} kW`);
  if (c.cap > 0) lines.push(`Grid ${(c.sup ?? 0).toFixed(1)} kW supplied, ${(c.dem ?? 0).toFixed(1)} kW wanted, ${c.cap.toFixed(1)} kW rated`);
  return { title: `HANGING LANTERN · ${state}`, lit: on && pw > 0.05, lines };
}
