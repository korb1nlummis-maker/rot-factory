// Meshes for the transit wave (doors, platform lifts, call buttons, jump pads, cushion pads, the trajectory line). No game imports: transit.js owns the logic.
// Materials are shared (flagged __shared so machines.disposeObj leaves them alone); geometry is made per ent and freed with it.
import * as THREE from 'three';
import { C } from './config.js';

const mat = (o) => { const m = new THREE.MeshStandardMaterial(o); m.__shared = true; return m; };
const basic = (r, g, b) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false }); m.__shared = true; return m; };
export const MAT = {
  steel: mat({ color: 0x59636e, roughness: 0.45, metalness: 0.8 }),
  leaf: mat({ color: 0x8b95a1, roughness: 0.5, metalness: 0.7 }),
  leafBlast: mat({ color: 0x3a3f46, roughness: 0.55, metalness: 0.8 }),
  rib: mat({ color: 0x6d7782, roughness: 0.5, metalness: 0.7 }),
  dark: mat({ color: 0x1d2024, roughness: 0.6, metalness: 0.6 }),
  yellow: mat({ color: 0xe8b81c, roughness: 0.5, metalness: 0.3 }),
  orange: mat({ color: 0xd9531e, roughness: 0.5, metalness: 0.3 }),
  deck: mat({ color: 0x7a838d, roughness: 0.55, metalness: 0.6 }),
  arrow: mat({ color: 0xe8b81c, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
  mat: mat({ color: 0xf08fb7, roughness: 0.95, metalness: 0 }),
  matEdge: mat({ color: 0xffe0ee, roughness: 0.95, metalness: 0 }),
  glowG: basic(0.4, 3, 1), glowA: basic(3.4, 1.7, 0.2), glowR: basic(3.6, 0.3, 0.2), glowB: basic(0.5, 1.6, 3.4), glowOff: basic(0.35, 0.35, 0.38),
};

const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };

// ---------- doors: the door sits in the plane of its wall; local x runs along the width, z across the thickness, y up from the sill ----------
export const DOOR_W = 4 * C, DOOR_H = 4 * C;
export function doorObject(e) {
  const g = new THREE.Group(), blast = !!e.blast, T = C * 0.74;   // the leaf is a little thicker than the wall cells so it shows on both faces
  const fw = blast ? 0.22 : 0.14, depth = C * 1.06;
  // the frame: two posts and a lintel, a little proud of the cells on both faces
  g.add(box(fw, DOOR_H + fw, depth, MAT.steel, -(DOOR_W / 2 + fw / 2 - 0.02), (DOOR_H + fw) / 2, 0));
  g.add(box(fw, DOOR_H + fw, depth, MAT.steel, DOOR_W / 2 + fw / 2 - 0.02, (DOOR_H + fw) / 2, 0));
  g.add(box(DOOR_W + fw * 2, fw, depth, MAT.steel, 0, DOOR_H + fw / 2, 0));
  // the leaf: a group scaled in y so it rolls up toward the lintel like a shutter (unit height, bottom at y = 0)
  const leaf = new THREE.Group(); leaf.name = 'leaf';
  leaf.add(box(DOOR_W - 0.02, 1, T, blast ? MAT.leafBlast : MAT.leaf, 0, 0.5, 0));
  for (let q = 1; q < 6; q++) leaf.add(box(DOOR_W - 0.02, 0.018, T + 0.03, MAT.rib, 0, q / 6, 0));
  if (blast) { for (const s of [-1, 1]) leaf.add(box(0.1, 1, T + 0.05, MAT.orange, s * (DOOR_W / 2 - 0.2), 0.5, 0)); }
  leaf.add(box(DOOR_W - 0.02, 0.05, T + 0.05, blast ? MAT.orange : MAT.yellow, 0, 0.012, 0));   // the hazard edge along the bottom
  g.add(leaf);
  // status lamps on both posts (green open, amber moving, red closed or locked)
  for (const s of [-1, 1]) { const l = box(0.09, 0.09, 0.09, MAT.glowR, s * (DOOR_W / 2 + fw / 2 - 0.02), DOOR_H * 0.72, depth / 2 + 0.01); l.name = 'lamp'; g.add(l); const l2 = box(0.09, 0.09, 0.09, MAT.glowR, s * (DOOR_W / 2 + fw / 2 - 0.02), DOOR_H * 0.72, -depth / 2 - 0.01); l2.name = 'lamp'; g.add(l2); }
  g.userData.leaf = leaf;
  return g;
}
// leaf progress p: 0 closed .. 1 open
export function setDoorLeaf(obj, p) {
  const leaf = obj && obj.userData && obj.userData.leaf; if (!leaf) return;
  const f = Math.max(0, Math.min(1, p));
  leaf.position.y = DOOR_H * f; leaf.scale.y = Math.max(0.0001, DOOR_H * (1 - f)); leaf.visible = f < 0.999;
}
// state: 'closed' red, 'moving' amber, 'open' green, 'dead' dim (no power and not cranked)
export function setDoorLamp(obj, st) {
  if (!obj) return; const m = st === 'open' ? MAT.glowG : st === 'moving' ? MAT.glowA : st === 'dead' ? MAT.glowOff : MAT.glowR;
  obj.traverse((c) => { if (c.name === 'lamp' && c.material !== m) c.material = m; });
}

// ---------- the elevator: a big box cab (4 x 4 cells in plan, 4 rows high) that runs on four guide rails at the corners of its shaft ----------
export const CAR = 4 * C;
export const CAB_W = 1.9, CAB_H = 4 * C - 0.1;   // the shell is narrower than the 2.4 m shaft so it clears the pillars of a frame stacked in it
const glass = new THREE.MeshStandardMaterial({ color: 0x9fd0e8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }); glass.__shared = true;
// the guide rails: one unit-high column at each corner of the shaft, stretched by setRails to run from the bottom of the reach to the top of the home opening
export function railObject() {
  const g = new THREE.Group(); g.name = 'rails'; const h = CAR / 2 - 0.05;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const c = box(0.07, 1, 0.07, MAT.steel, sx * h, 0.5, sz * h); c.name = 'rail'; g.add(c); }
  const cap = box(CAR - 0.1, 0.08, 0.08, MAT.dark, 0, 1, -h); cap.name = 'railcap'; g.add(cap);
  return g;
}
export function setRails(obj, y0, y1) {
  if (!obj) return; const hgt = Math.max(0.2, y1 - y0);
  obj.traverse((c) => { if (c.name === 'rail') { c.scale.y = hgt; c.position.y = y0 + hgt / 2; } else if (c.name === 'railcap') c.position.y = y1; });
}
export function cabObject() {
  const g = new THREE.Group(); g.name = 'car';
  // the deck: nearly the whole 4 x 4 cells, with a notch at each corner for the rails and frame pillars
  g.add(box(2.3, 0.12, 1.66, MAT.deck, 0, -0.06, 0)); g.add(box(1.66, 0.12, 2.3, MAT.deck, 0, -0.06, 0));
  g.add(box(CAB_W + 0.04, 0.04, CAB_W + 0.04, MAT.yellow, 0, -0.02, 0));
  const h2 = CAB_W / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.07, CAB_H, 0.07, MAT.steel, sx * h2, CAB_H / 2, sz * h2));
  g.add(box(CAB_W + 0.1, 0.1, CAB_W + 0.1, MAT.dark, 0, CAB_H, 0));   // the roof
  // a rail at hip height and glass above it on every side, with a 1.0 m doorway in the middle of each so you can step on from any landing
  const seg = (CAB_W - 1.0) / 2, mid = 0.5 + seg / 2;
  for (const s of [-1, 1]) for (const q of [-1, 1]) {
    for (const [x, z, w, d] of [[q * mid, s * h2, seg, 0.04], [s * h2, q * mid, 0.04, seg]]) {
      g.add(box(w, 0.04, d, MAT.steel, x, 0.92, z));
      const gl = new THREE.Mesh(new THREE.BoxGeometry(w, CAB_H - 0.96, d), glass); gl.position.set(x, 0.94 + (CAB_H - 0.96) / 2, z); g.add(gl);
    }
  }
  const lamp = box(0.18, 0.06, 0.18, MAT.glowOff, 0, CAB_H - 0.06, 0); lamp.name = 'lamp'; g.add(lamp);
  const pan = box(0.2, 0.34, 0.06, MAT.dark, h2 - 0.04, 1.3, -h2 + 0.2); g.add(pan);   // the cab's own panel: up and down lamps
  g.add(box(0.1, 0.06, 0.03, MAT.glowB, h2 - 0.04, 1.4, -h2 + 0.24), box(0.1, 0.06, 0.03, MAT.glowA, h2 - 0.04, 1.22, -h2 + 0.24));
  return g;
}
export function setLiftLamp(obj, st) { const l = obj && obj.getObjectByName('lamp'); if (l) l.material = st === 'moving' ? MAT.glowA : st === 'idle' ? MAT.glowG : MAT.glowOff; }

// ---------- the call button: a short post with a panel that faces the shaft ----------
export function callObject() {
  const g = new THREE.Group();
  g.add(box(0.1, 1.0, 0.1, MAT.steel, 0, 0.5, 0));
  const panel = new THREE.Group(); panel.name = 'panel';
  panel.add(box(0.3, 0.46, 0.1, MAT.dark, 0, 1.12, 0));
  const lamp = box(0.14, 0.14, 0.04, MAT.glowOff, 0, 1.2, 0.06); lamp.name = 'lamp'; panel.add(lamp);
  panel.add(box(0.14, 0.08, 0.04, MAT.yellow, 0, 1.02, 0.06));
  g.add(panel);
  return g;
}
export function setCallLamp(obj, st) { const l = obj && obj.getObjectByName('lamp'); if (l) l.material = st === 'here' ? MAT.glowG : st === 'coming' ? MAT.glowA : st === 'dead' ? MAT.glowOff : MAT.glowB; }
export function aimCall(obj, yaw) { const p = obj && obj.getObjectByName('panel'); if (p) p.rotation.y = yaw; }

// ---------- the jump pad: a square plate with a heading arrow and a ring lamp ----------
const arrowGeo = () => {
  const s = new THREE.Shape(); s.moveTo(0, -0.95); s.lineTo(0.62, -0.15); s.lineTo(0.26, -0.15); s.lineTo(0.26, 0.8); s.lineTo(-0.26, 0.8); s.lineTo(-0.26, -0.15); s.lineTo(-0.62, -0.15); s.closePath();
  const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); return g;   // flat on y = 0 (the shape is drawn upside down so that, once laid flat, the tip points toward +z)
};
export function jumpObject() {
  const g = new THREE.Group();
  g.add(box(CAR, 0.1, CAR, MAT.dark, 0, 0.05, 0));
  g.add(box(CAR - 0.12, 0.02, CAR - 0.12, MAT.steel, 0, 0.105, 0));
  const ring = new THREE.Group(); ring.name = 'ring';
  for (const s of [-1, 1]) { ring.add(box(CAR - 0.04, 0.04, 0.06, MAT.glowOff, 0, 0.1, s * (CAR / 2 - 0.05))); ring.add(box(0.06, 0.04, CAR - 0.16, MAT.glowOff, s * (CAR / 2 - 0.05), 0.1, 0)); }
  g.add(ring);
  const arrow = new THREE.Mesh(arrowGeo(), MAT.arrow); arrow.name = 'arrow'; arrow.position.y = 0.125; arrow.scale.setScalar(0.85); g.add(arrow);
  return g;
}
export function setJump(obj, hdDeg, st) {
  if (!obj) return; const a = obj.getObjectByName('arrow'); if (a) a.rotation.y = hdDeg * Math.PI / 180;
  const ring = obj.getObjectByName('ring'); if (ring) { const m = st === 'ready' ? MAT.glowG : st === 'low' ? MAT.glowA : st === 'cool' ? MAT.glowR : MAT.glowOff; ring.traverse((c) => { if (c.isMesh && c.material !== m) c.material = m; }); }
}

// ---------- the cushion pad: a soft mat with puffy corners ----------
export function cushionObject() {
  const g = new THREE.Group();
  g.add(box(CAR - 0.1, 0.14, CAR - 0.1, MAT.mat, 0, 0.07, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), MAT.mat); s.position.set(sx * (CAR / 2 - 0.12), 0.12, sz * (CAR / 2 - 0.12)); g.add(s); }
  g.add(box(CAR - 0.5, 0.012, 0.05, MAT.matEdge, 0, 0.146, 0)); g.add(box(0.05, 0.012, CAR - 0.5, MAT.matEdge, 0, 0.146, 0));
  return g;
}

// ---------- the trajectory line: points are [x, y, z] in world metres ----------
export function lineObject() {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 90), 3)); geo.setDrawRange(0, 0);
  const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.95, depthTest: false })); l.renderOrder = 12; l.frustumCulled = false; l.material.__shared = false;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 20), new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 12; ring.name = 'end';
  const tube = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.75, depthTest: false })); tube.renderOrder = 11; tube.frustumCulled = false; tube.name = 'tube';   // the line is 1 px wide on every screen: a thin tube carries the eye
  const g = new THREE.Group(); g.add(l); g.add(tube); g.add(ring); g.userData.line = l; g.userData.tube = tube; g.userData.end = ring; g.frustumCulled = false;
  return g;
}
export function setLine(obj, pts, color = 0x7dffb0) {
  if (!obj) return; const l = obj.userData.line, a = l.geometry.attributes.position; const n = Math.min(pts.length, 90);
  for (let q = 0; q < n; q++) { a.array[q * 3] = pts[q][0]; a.array[q * 3 + 1] = pts[q][1]; a.array[q * 3 + 2] = pts[q][2]; }
  a.needsUpdate = true; l.geometry.setDrawRange(0, n); l.material.color.setHex(color); obj.userData.end.material.color.setHex(color);
  const tube = obj.userData.tube;
  if (tube) {
    tube.geometry.dispose(); tube.material.color.setHex(color);
    if (n >= 3) { const curve = new THREE.CatmullRomCurve3(pts.slice(0, n).map((q) => new THREE.Vector3(q[0], q[1], q[2]))); tube.geometry = new THREE.TubeGeometry(curve, Math.min(64, n * 2), 0.04, 5, false); } else tube.geometry = new THREE.BufferGeometry();
  }
  if (n) obj.userData.end.position.set(pts[n - 1][0], pts[n - 1][1] + 0.05, pts[n - 1][2]);
}
