// Meshes for the build shell (Wave 3): railings, ramps, stairs, the Leveling Pad machine and the placement ghosts.
// Pad, catwalk and wall CELLS are drawn by render.js (they are world cells); this file draws what is not a cell. No game imports: build.js owns the logic.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C } from './config.js';

export const KIND_COLOR = { timber: 0x9a6b3a, steel: 0x77879a, concrete: 0xb9b7ac, rebar: 0x8a6a58, titan: 0xb7c3d0, carbon: 0x2b2f36, plasma: 0x7ad7ff, voidl: 0xb078ff, neutron: 0xfff0b0, horizon: 0x14141e };   // the frame colors (FRAME_TYPES in upgrades.js)
const matCache = new Map();
const kindMat = (kind) => {
  let m = matCache.get(kind);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: KIND_COLOR[kind] ?? 0xb9b7ac, roughness: kind === 'timber' || kind === 'concrete' ? 0.9 : 0.4, metalness: kind === 'timber' || kind === 'concrete' ? 0 : 0.7 }); m.__shared = true; matCache.set(kind, m); }
  return m;
};
const RAIL = (() => { const m = new THREE.MeshStandardMaterial({ color: 0x59636e, roughness: 0.45, metalness: 0.8 }); m.__shared = true; return m; })();
const CAP = (() => { const m = new THREE.MeshStandardMaterial({ color: 0xe8b81c, roughness: 0.5, metalness: 0.3 }); m.__shared = true; return m; })();
const LAMP = (() => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 3, 1.2) }); m.__shared = true; return m; })();
const LAMP_OFF = (() => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.3, 0.2) }); m.__shared = true; return m; })();

const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const merged = (parts, mat) => { const g = mergeGeometries(parts, false); parts.forEach((p) => p.dispose()); const m = new THREE.Mesh(g, mat); return m; };

// ---------- rails ----------
// One side of a rectangle (local metres, x 0..L, z 0..W) at height y0: posts at every cell boundary, a top bar and a mid bar.
// side is a dir index: 0 = +x edge, 1 = +z edge, 2 = -x edge, 3 = -z edge.
function railSide(parts, side, L, W, y0, inset = 0.05) {
  const H = 1.0, t = 0.045;
  const alongX = side === 1 || side === 3;     // the rail runs along x on the +z / -z edges
  const len = alongX ? L : W;
  const fixed = side === 0 ? L - inset : side === 1 ? W - inset : side === 2 ? inset : inset;
  const n = Math.max(1, Math.round(len / C));
  const put = (along, y, sx, sy, sz) => { const g = alongX ? box(sx, sy, sz, along, y, fixed) : box(sz, sy, sx, fixed, y, along); parts.push(g); };
  for (let q = 0; q <= n; q++) put(Math.min(len - inset, Math.max(inset, q * C)), y0 + H / 2, t, H, t);
  put(len / 2, y0 + H - t / 2, len, t, t);
  put(len / 2, y0 + H * 0.5, len, t * 0.8, t * 0.8);
}

// bits: bit d set = a rail on the side facing dir d. L, W in metres; y0 = walking surface height inside the group.
export function railGroup(bits, L, W, y0) {
  const grp = new THREE.Group();
  const parts = [];
  for (let d = 0; d < 4; d++) if (bits & (1 << d)) railSide(parts, d, L, W, y0);
  if (parts.length) { const m = merged(parts, RAIL); m.name = 'rails'; grp.add(m); }
  return grp;
}

// ---------- ramp (a wedge, low edge at local x = 0, rising toward +x, centred on z = 0) ----------
export function wedgeGeometry(L, H, W) {
  const w2 = W / 2, v = [], tri = (a, b, c) => { v.push(...a, ...b, ...c); };
  const A = [0, 0, -w2], B = [0, 0, w2], Cc = [L, H, w2], D = [L, H, -w2], E = [L, 0, -w2], F = [L, 0, w2];
  tri(A, B, Cc); tri(A, Cc, D);          // the sloped top
  tri(E, D, Cc); tri(E, Cc, F);          // the high end wall
  tri(A, D, E);                           // the -z flank
  tri(B, F, Cc);                          // the +z flank
  tri(A, E, F); tri(A, F, B);             // underside
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
}

// the object for a ramp or stair ent, positioned by the caller at the middle of its low edge, rotated by `yawOf(dir)`
export const yawOf = (dir) => -dir * Math.PI / 2;

export function rampObject(e) {
  const grp = new THREE.Group();
  const L = e.len * C, W = e.w * C, H = e.rise * C;
  const wedge = new THREE.Mesh(wedgeGeometry(L, H, W - 0.02), kindMat(e.mk)); wedge.name = 'body'; grp.add(wedge);
  // a yellow edge strip along both flanks so the slope reads from far away
  const slope = Math.atan2(H, L), sl = Math.hypot(L, H);
  const bars = [0, 1].map((q) => { const g = box(sl, 0.025, 0.05, 0, 0, 0); g.rotateZ(slope); g.translate(L / 2, H / 2 + 0.014, (q ? 1 : -1) * (W / 2 - 0.06)); return g; });
  const sm = merged(bars, CAP); sm.name = 'strips'; grp.add(sm);
  return grp;
}

export function stairObject(e) {
  const grp = new THREE.Group();
  const L = e.len * C, W = e.w * C, H = e.rise * C, n = e.rise * 4, run = L / n, sh = H / n;
  const steps = [];
  for (let s = 0; s < n; s++) steps.push(box(run, (s + 1) * sh, W - 0.04, (s + 0.5) * run, (s + 1) * sh / 2, 0));
  const body = merged(steps, kindMat(e.mk)); body.name = 'body'; grp.add(body);
  // rails on both sides, following the slope
  const slope = Math.atan2(H, L), sl = Math.hypot(L, H), parts = [];
  for (const sgn of [-1, 1]) {
    const z = sgn * (W / 2 - 0.05);
    for (let s = 0; s <= n; s += 2) parts.push(box(0.045, 0.9, 0.045, s * run, s * sh + 0.45, z));
    const top = box(sl, 0.045, 0.045, 0, 0, 0); top.rotateZ(slope); top.translate(L / 2, H / 2 + 0.9, z); parts.push(top);
    const mid = box(sl, 0.035, 0.035, 0, 0, 0); mid.rotateZ(slope); mid.translate(L / 2, H / 2 + 0.45, z); parts.push(mid);
  }
  const rm = merged(parts, RAIL); rm.name = 'rails'; grp.add(rm);
  return grp;
}

// ---------- the Leveling Pad machine: a squat base, a boom pointing at the work area and a status lamp ----------
export function levelObject(e) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(box(1.0, 0.34, 1.0, 0, 0.17, 0), kindMat('steel'));
  const mast = new THREE.Mesh(box(0.22, 1.2, 0.22, 0, 0.94, 0), kindMat('steel'));
  const boom = new THREE.Mesh(box(0.16, 0.16, 1.5, 0, 1.45, 0.75), CAP);
  const head = new THREE.Mesh(box(0.5, 0.3, 0.5, 0, 1.45, 1.55), kindMat('carbon'));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), LAMP_OFF); lamp.position.set(0, 1.62, 0); lamp.name = 'lamp';
  g.add(base, mast, boom, head, lamp);
  return g;
}
export const setLamp = (obj, on) => { const l = obj && obj.getObjectByName('lamp'); if (l) l.material = on ? LAMP : LAMP_OFF; };

// ---------- ghosts (translucent green / red, edges drawn on top) ----------
const ghostMats = (ok) => ({
  fill: new THREE.MeshBasicMaterial({ color: ok ? 0x5dffa0 : 0xff5a4a, transparent: true, opacity: 0.22, depthWrite: false }),
  line: new THREE.LineBasicMaterial({ color: ok ? 0x9dffc4 : 0xff8a7a, transparent: true, opacity: 1, depthTest: false }),
});
export function ghostMesh(geom, ok) {
  const m = ghostMats(ok), mesh = new THREE.Mesh(geom, m.fill);
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 25), m.line); e.renderOrder = 10; mesh.add(e);
  return mesh;
}
// boxes = [{ x0, y0, z0, x1, y1, z1 }] in world metres. Returns a group whose origin is the world origin.
export function ghostBoxes(boxes, ok) {
  const grp = new THREE.Group();
  for (const b of boxes) { const m = ghostMesh(new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0), ok); m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2); grp.add(m); }
  return grp;
}
// a ramp or stair ghost: the same wedge, placed in the world by the caller
export function ghostWedge(e, ok) {
  const L = e.len * C, W = e.w * C, H = e.rise * C;
  const m = ghostMesh(wedgeGeometry(L, H, W), ok);
  const grp = new THREE.Group(); grp.add(m); return grp;
}
