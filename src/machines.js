import * as THREE from 'three';
import { C, NX, NY, NZ, HALL_HX, HALL_HZ, cellX, cellY, cellZ, toI, toJ, toK } from './config.js';
import { FRAME_TYPES, supportDepth } from './upgrades.js';
import { capacityOf, loadOn } from './loadtrace.js';
import { archTaken } from './arches.js';
import { sellValue, NEEDLE, BULK, REMAINS, isSpecialCell } from './plushdata.js';
import { compaction } from './util.js';
import { buildMountFan, MOUNT_FAN } from './mountfan.js';
import { catalogType } from './catalog.js';
import { furnishLights, LIGHT_CAP } from './furnish.js';
import { isEarth, planEarth as planEarthMachine, makeEarth, addEarth, updateEarth, guestEarth } from './earth.js';

const woodTex = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#9a6b3a'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${40 + Math.random() * 40},${25 + Math.random() * 20},10,${0.08 + Math.random() * 0.14})`; g.fillRect(Math.random() * 128, 0, 1 + Math.random() * 3, 128); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

const MATS = {
  timber: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85, color: 0xffffff }),
  steel: new THREE.MeshStandardMaterial({ color: 0x77879a, roughness: 0.35, metalness: 0.9 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xb9b7ac, roughness: 0.95, metalness: 0.0 }),
  rebar: new THREE.MeshStandardMaterial({ color: 0x8a6a58, roughness: 0.8, metalness: 0.5 }),
  titan: new THREE.MeshStandardMaterial({ color: 0xb7c3d0, roughness: 0.25, metalness: 1.0 }),
  carbon: new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.3, metalness: 0.4 }),
  plasma: new THREE.MeshStandardMaterial({ color: 0x7ad7ff, roughness: 0.2, metalness: 0.6, emissive: 0x2a8fff, emissiveIntensity: 1.2 }),
  neutron: new THREE.MeshStandardMaterial({ color: 0xfff0b0, roughness: 0.1, metalness: 1.0, emissive: 0xffd060, emissiveIntensity: 1.6 }),
  horizon: new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.05, metalness: 1.0, emissive: 0x4010a0, emissiveIntensity: 0.8 }),
  voidl: new THREE.MeshStandardMaterial({ color: 0xb078ff, roughness: 0.15, metalness: 0.9, emissive: 0x6a2cff, emissiveIntensity: 1.6 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.5, metalness: 0.8 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xe8b81c, roughness: 0.5, metalness: 0.3 }),
  glowO: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 1.4, 0.3) }),
  glowG: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 3, 1.2) }),
};

// A frame is a hollow cube module: 4 cells wide, 4 high and 4 deep (2.4 m). Old saves and tests may carry a frame with no `d`: that is
// the old one cell deep doorway (FRAME_D1), kept so such a frame still draws and holds up.
export const FRAME_N = 4;                   // cells along each side of a frame module
export const FRAME_W = FRAME_N * C - 0.04;  // 2.36 m wide (a 2 cm gap on each side so neighbours do not z-fight)
export const FRAME_H = FRAME_N * C - 0.02;  // 2.38 m high
export const FRAME_D = FRAME_N * C - 0.04;  // 2.36 m deep
export const FRAME_D1 = C - 0.06;           // the old one cell deep frame
export const frameDepth = (f) => (f && f.d !== undefined ? f.d : FRAME_D1);
export const frameCells = (f) => (f && f.d !== undefined ? Math.max(1, Math.round((f.d + 0.05) / C)) : 1);

// the beams and pillars of a frame in its own frame of reference (x across its width, z along its depth, y up from the floor): [size, centre, plate?]
// The mesh is built from this list and the hammer aims at the same boxes.
export function frameMembers(kind, w, h, d = FRAME_D1) {
  const heavy = kind === 'concrete' || kind === 'rebar' || kind === 'carbon' || kind === 'plasma' || kind === 'voidl' || kind === 'neutron' || kind === 'horizon';
  const cube = d > 1.2;
  // pillars and beams: the same section all round, thick enough to read as a cube from across the tunnel
  const t = heavy ? 0.28 : kind === 'steel' || kind === 'titan' ? 0.16 : 0.2;
  const out = [];
  // 4 vertical pillars at the corners, each on a small foot
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    out.push({ s: [t, h, t], p: [sx * (w / 2 - t / 2), h / 2, sz * (d / 2 - t / 2)] });
    out.push({ s: [t * 1.5, 0.07, t * 1.5], p: [sx * (w / 2 - t * 0.75), 0.035, sz * (d / 2 - t * 0.75)] });   // a foot plate, flush with the outside of the pillar
  }
  // the beam ring round the top: two across the width (front and back) and two along the depth (left and right)
  for (const sz of [-1, 1]) out.push({ s: [w, t, t], p: [0, h - t / 2, sz * (d / 2 - t / 2)] });
  for (const sx of [-1, 1]) out.push({ s: [t, t, d - 2 * t], p: [sx * (w / 2 - t / 2), h - t / 2, 0] });
  if (cube) {
    // a ridge beam down the middle of the top (a Support Fan hangs under it), and a rail at mid height down each side wall
    out.push({ s: [t * 0.8, t * 0.8, d - 2 * t], p: [0, h - t * 0.4, 0] });
    out.push({ s: [w - 2 * t, t * 0.8, t * 0.8], p: [0, h - t * 0.4, 0] });   // and one across, so whatever hangs from the middle of the top (a fan, lanterns on four sides) has a beam over it
    for (const sx of [-1, 1]) out.push({ s: [t * 0.6, t * 0.6, d - 2 * t], p: [sx * (w / 2 - t * 0.3), h * 0.5, 0] });
  }
  if (kind === 'steel' || kind === 'titan') {
    // yellow bolt plates at the top corners, on the front and the back
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ s: [t * 1.6, t * 1.6, 0.03], p: [sx * (w / 2 - t / 2), h - t / 2, sz * (d / 2 + 0.016)], plate: true });
  }
  return out;
}

export function buildFrameMesh(kind, axis, w, h, yaw, d = FRAME_D1) {
  const g = new THREE.Group();
  const m = MATS[kind];
  for (const q of frameMembers(kind, w, h, d)) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(q.s[0], q.s[1], q.s[2]), q.plate ? MATS.yellow : m); b.position.set(q.p[0], q.p[1], q.p[2]); g.add(b);
  }
  g.rotation.y = yaw !== undefined ? yaw : axis === 'x' ? Math.PI / 2 : 0; // the box's open faces point along the tunnel
  return g;
}

// where does the ray (eye, dir) first meet a frame? { t, member } when it strikes a pillar or beam within maxT metres; { t, through: true } when it only
// passes through the hollow inside (so you can still aim at a frame you stand in); null otherwise
export function frameRay(f, eye, dir, maxT = 4) {
  const yaw = f.yaw !== undefined ? f.yaw : f.axis === 'x' ? Math.PI / 2 : 0, cs = Math.cos(yaw), sn = Math.sin(yaw);
  const ox = eye.x - f.cx, oz = eye.z - f.cz;
  const o = [ox * cs - oz * sn, eye.y - f.y0, ox * sn + oz * cs], v = [dir.x * cs - dir.z * sn, dir.y, dir.x * sn + dir.z * cs];
  const box = (lo, hi) => { let t0 = 0, t1 = maxT; for (let a = 0; a < 3; a++) { if (Math.abs(v[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) return null; continue; } let a0 = (lo[a] - o[a]) / v[a], a1 = (hi[a] - o[a]) / v[a]; if (a0 > a1) { const q = a0; a0 = a1; a1 = q; } t0 = Math.max(t0, a0); t1 = Math.min(t1, a1); if (t0 > t1) return null; } return t0; };
  const w = f.w || FRAME_W, h = f.h || FRAME_H, d = frameDepth(f);
  let best = null;
  for (const q of frameMembers(f.kind, w, h, d)) {
    if (q.plate) continue;
    const t = box([q.p[0] - q.s[0] / 2, q.p[1] - q.s[1] / 2, q.p[2] - q.s[2] / 2], [q.p[0] + q.s[0] / 2, q.p[1] + q.s[1] / 2, q.p[2] + q.s[2] / 2]);
    if (t !== null && (best === null || t < best)) best = t;
  }
  if (best !== null) return { t: best };
  const t = box([-w / 2, 0, -d / 2], [w / 2, h, d / 2]);
  return t === null ? null : { t, through: true };
}

export function ghostify(group, ok) {
  const col = ok ? 0x5dffa0 : 0xff5a4a;
  const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, depthWrite: false });
  const lineMat = new THREE.LineBasicMaterial({ color: ok ? 0x9dffc4 : 0xff8a7a, transparent: true, opacity: 1, depthTest: false });
  const meshes = [];
  group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    o.material = mat;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25), lineMat);
    e.renderOrder = 10;
    o.add(e);
  }
  return group;
}

// frames may graze each other (posts side by side, a tight curve) but not cut through: more than this many metres of sink-in is refused
const FRAME_CUT = 0.6;
// how far two floor footprints (centre, yaw, half width, half depth) sink into each other; <= 0 when they do not touch (separating axis test)
export function footprintOverlap(ax, az, ay, aw, ad, bx, bz, by, bw, bd) {
  const dx = bx - ax, dz = bz - az; let least = Infinity;
  const axesA = [[Math.cos(ay), -Math.sin(ay)], [Math.sin(ay), Math.cos(ay)]], axesB = [[Math.cos(by), -Math.sin(by)], [Math.sin(by), Math.cos(by)]];
  for (const [ux, uz] of [...axesA, ...axesB]) {
    const ra = aw * Math.abs(axesA[0][0] * ux + axesA[0][1] * uz) + ad * Math.abs(axesA[1][0] * ux + axesA[1][1] * uz);
    const rb = bw * Math.abs(axesB[0][0] * ux + axesB[0][1] * uz) + bd * Math.abs(axesB[1][0] * ux + axesB[1][1] * uz);
    least = Math.min(least, ra + rb - Math.abs(dx * ux + dz * uz));
  }
  return least;
}

export class Machines {
  constructor(game) {
    this.game = game;
    this.scene = game.renderer.scene;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.items = new Map(); // id -> {ent, obj, ...runtime}
    this.ghost = null;
    this.ghostKey = '';
    this.expire = [];
    this.tmpV = new THREE.Vector3();
  }

  disposeObj(o) {
    o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material && !c.material.__shared && c.isLineSegments) c.material.dispose(); });
  }

  clear() {
    for (const it of this.items.values()) { this.disposeObj(it.obj); this.root.remove(it.obj); }
    this.items.clear();
    this.setGhost(null);
  }

  // ---------- placement geometry ----------
  rayEmpty(eye, dir, maxD = 5) {
    const w = this.game.world;
    let last = null;
    for (let t = 0.2; t < maxD; t += 0.1) {
      const x = eye.x + dir.x * t, y = eye.y + dir.y * t, z = eye.z + dir.z * t;
      const i = toI(x), j = toJ(y), k = toK(z);
      if (y < 0) { if (last) return { last, hitFloor: true }; return null; }
      if (w.solid(i, j, k)) return last ? { last, hitSolid: { i, j, k } } : null;
      last = { i, j, k };
    }
    return last ? { last } : null;
  }

  // ---- 4x4x4 frame modules. Every frame is a hollow cube 4 cells wide, 4 high and 4 deep (2.4 m). Cubes snap to each other on
  // ANY side in steps of a whole module: next in line (4 cells along the tunnel), left or right (4 sideways, a wider room), above or
  // below (4 up, stacked levels), so a run of cubes builds a tunnel, a junction or a chamber. A frame never digs: the 4x4x4 section
  // must already be dug out before it goes down.
  frameBlock(f) {
    // block origin of an existing frame: along index m (its first cell), lateral origin lo, vertical origin j0, and its depth n in cells
    const n = frameCells(f);
    if (f.gm !== undefined) return { axis: f.axis, m: f.gm, lo: f.glo, j0: f.gj, n };
    const lat = f.axis === 'x' ? f.cz : f.cx, along = f.axis === 'x' ? f.cx : f.cz;
    const base = f.axis === 'x' ? cellZ(0) : cellX(0), abase = f.axis === 'x' ? cellX(0) : cellZ(0);
    return { axis: f.axis, n, m: Math.round((along - abase) / C - (n - 1) / 2) + (f.axis === 'x' ? toI(0) : toK(0)), lo: Math.round((lat - base) / C - 1.5) + (f.axis === 'x' ? toK(0) : toI(0)), j0: Math.round(f.y0 / C) };
  }
  // the cells a block covers, as index ranges
  blockBox(b) {
    return b.axis === 'x' ? { i0: b.m, i1: b.m + b.n - 1, k0: b.lo, k1: b.lo + FRAME_N - 1, j0: b.j0, j1: b.j0 + FRAME_N - 1 }
      : { i0: b.lo, i1: b.lo + FRAME_N - 1, k0: b.m, k1: b.m + b.n - 1, j0: b.j0, j1: b.j0 + FRAME_N - 1 };
  }
  // the grid frame (not a turned one) whose cells intersect the 4x4x4 block at (axis, m, lo, j0), or null
  frameBoxes() {
    const out = [];
    for (const it of this.items.values()) { const f = it.ent; if (f.type === 'frame' && !f.turned) out.push({ f, box: this.blockBox(this.frameBlock(f)) }); }
    return out;
  }
  blockTaken(axis, m, lo, j0, skipId, boxes = this.frameBoxes()) {
    const a = this.blockBox({ axis, m, lo, j0, n: FRAME_N });
    { const ar = archTaken(this.game, a, skipId); if (ar) return ar; }   // a giant arch (arches.js) fills its section: a cube cannot stand in it
    for (const { f, box: c } of boxes) {
      if (f.id === skipId) continue;
      if (a.i0 <= c.i1 && c.i0 <= a.i1 && a.k0 <= c.k1 && c.k0 <= a.k1 && a.j0 <= c.j1 && c.j0 <= a.j1) return f;
    }
    return null;
  }
  // the plush still standing in the 4x4x4 section at (axis, m, lo, j0)
  sectionSolid(axis, m, lo, j0) {
    const out = [], w = this.game.world;
    for (let c = 0; c < FRAME_N; c++) for (let a = 0; a < FRAME_N; a++) for (let b = 0; b < FRAME_N; b++) {
      const i = axis === 'x' ? m + c : lo + a, k = axis === 'x' ? lo + a : m + c, j = j0 + b;
      if (j >= 0 && w.inside(i, j, k) && w.get(i, j, k)) out.push([i, j, k]);
    }
    return out;
  }
  frameEnt(axis, kind, m, lo, j0) {
    // the cube spans cells m .. m+3 along the tunnel and lo .. lo+3 across it: its centre is 1.5 cells past the first cell centre
    const cx = axis === 'x' ? cellX(m) + 1.5 * C : cellX(lo) + 1.5 * C, cz = axis === 'x' ? cellZ(lo) + 1.5 * C : cellZ(m) + 1.5 * C;
    const e = { axis, kind, cx, cz, y0: j0 * C, w: FRAME_W, h: FRAME_H, d: FRAME_D, gm: m, glo: lo, gj: j0, yaw: axis === 'x' ? Math.PI / 2 : 0 };
    e.clear = this.sectionSolid(axis, m, lo, j0);   // 64 cells: whatever of them is still plush
    return e;
  }
  // does this planned frame cut through a turned frame (footprints width x depth on the floor plan)? Returns the frame or null.
  turnedCut(e) {
    for (const it of this.items.values()) {
      const f = it.ent; if (f.type !== 'frame' || !f.turned || Math.abs(f.y0 - e.y0) > Math.min(e.h, f.h || e.h) - 0.15) continue;
      if (Math.hypot(f.cx - e.cx, f.cz - e.cz) > Math.hypot(e.w, e.d) + 0.6) continue;
      if (footprintOverlap(e.cx, e.cz, e.yaw, e.w / 2, e.d / 2, f.cx, f.cz, f.yaw, (f.w || e.w) / 2, frameDepth(f) / 2) > FRAME_CUT) return f;
    }
    return null;
  }
  planFrame(eye, dir, yaw, kind, freeYaw = null) {
    if (freeYaw !== null) return this.planFreeFrame(eye, dir, kind, freeYaw);
    const w = this.game.world;
    const r = this.rayEmpty(eye, dir, 5);
    if (!r) return { ok: false, why: 'Aim at the tunnel floor or at a frame' };
    let { i, j, k } = r.last;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let axis = Math.abs(fx) > Math.abs(fz) ? 'x' : 'z';
    const sgn = (axis === 'x' ? fx : fz) >= 0 ? 1 : -1;
    let m, lo, j0;
    // aiming into a frame that is already built: nothing to place
    const boxes = this.frameBoxes();
    if (!r.hitSolid) for (const { box: q } of boxes) {
      if (i >= q.i0 && i <= q.i1 && k >= q.k0 && k <= q.k1 && j >= q.j0 && j <= q.j1) return { ok: false, why: 'Frame already here. Aim at its side, top or bottom to add another.' };
    }
    // ---- snap to a neighbouring cube on any of its six sides. What you point at decides which side: if the aim ray ends in
    // (or against) a spot that belongs to one of the sections around a frame, that section is chosen; otherwise the nearest one.
    const Q = r.hitSolid ? r.hitSolid : { i, j, k };
    const P = { x: cellX(Q.i), y: cellY(Q.j) + 0.6, z: cellZ(Q.k) };
    let best = null, bd = C * 8, inside = false;
    for (const { f, box: fb } of boxes) {
      if (Math.abs((fb.i0 + fb.i1) / 2 - Q.i) > 14 || Math.abs((fb.k0 + fb.k1) / 2 - Q.k) > 14) continue;   // only the frames around your aim can be the neighbour
      const b = this.frameBlock(f);
      const cand = [[b.n, 0, 0], [-FRAME_N, 0, 0], [0, FRAME_N, 0], [0, -FRAME_N, 0], [0, 0, FRAME_N], [0, 0, -FRAME_N]];
      for (const [dm, dl, dj] of cand) {
        const cm = b.m + dm, cl = b.lo + dl, cj = b.j0 + dj;
        if (cj < 0 || this.blockTaken(b.axis, cm, cl, cj, undefined, boxes)) continue;   // that side is already filled by another cube
        const cx = b.axis === 'x' ? cellX(cm) + 1.5 * C : cellX(cl) + 1.5 * C, cz = b.axis === 'x' ? cellZ(cl) + 1.5 * C : cellZ(cm) + 1.5 * C, cy = cj * C + 2 * C;
        const along = b.axis === 'x' ? Q.i : Q.k, lat = b.axis === 'x' ? Q.k : Q.i;
        const has = along >= cm && along <= cm + FRAME_N - 1 && lat >= cl && lat <= cl + FRAME_N - 1 && Q.j >= cj && Q.j <= cj + FRAME_N - 1;
        const d = Math.hypot(cx - P.x, cy - P.y, cz - P.z);
        if ((has && !inside) || (has === inside && d < bd)) { inside = inside || has; bd = d; best = { b, cm, cl, cj, side: dm ? 'next in line' : dl ? 'beside it' : dj > 0 ? 'above it' : 'below it' }; }
      }
    }
    if (best) { axis = best.b.axis; m = best.cm; lo = best.cl; j0 = best.cj; }
    else {
      let guard = 0;
      while (j > 0 && !w.solid(i, j - 1, k) && guard++ < 8) j--;
      if (j > 0 && !w.solid(i, j - 1, k)) return { ok: false, why: 'No floor here: aim at the floor, or next to another frame' };
      // the cube starts at the cell you aim at and runs away from you along the tunnel. Fit it to what you dug: try the few windows
      // around the aimed spot (back along the tunnel, sideways, up and down) and take the one with the fewest plush still in the way
      // (a clear window wins, and the one nearest your aim wins a tie)
      const a = axis === 'x' ? i : k, lat0 = axis === 'x' ? k : i;
      const starts = sgn > 0 ? [a, a - 1, a - 2, a - 3] : [a - 3, a - 2, a - 1, a];
      let bestC = 1e9;
      for (const ms of starts) for (const dl of [-2, -1, -3, 0]) for (const dj of [0, -1, 1]) {
        const jj = j + dj; if (jj < 0) continue;
        if (dj !== 0 && !w.solid(i, jj - 1, k) && jj > 0) continue; // a frame stands on the floor
        if (this.blockTaken(axis, ms, lat0 + dl, jj, undefined, boxes)) continue;
        const n = this.sectionSolid(axis, ms, lat0 + dl, jj).length;
        if (n < bestC) { bestC = n; m = ms; lo = lat0 + dl; j0 = jj; }
      }
      if (m === undefined) { m = starts[0]; lo = lat0 - 2; j0 = j; }
    }
    if (j0 < 0) return { ok: false, why: 'Below the floor' };
    const e = this.frameEnt(axis, kind, m, lo, j0);
    const hit = this.blockTaken(axis, m, lo, j0, undefined, boxes);
    if (hit) { const b = this.frameBlock(hit); return { ok: false, why: b.axis === axis && b.m === m && b.lo === lo && b.j0 === j0 ? 'Frame already here' : 'A frame is already here: this cube would overlap it', ent: e }; }
    // a turned (free) frame already standing here must not be cut through by a grid frame either
    if (this.turnedCut(e)) return { ok: false, why: 'A turned frame is in the way: this would cut through it', ent: e };
    // a frame holds up a section that is already dug: it never digs for you
    if (e.clear.length) return { ok: false, why: `This tunnel is too tight for a 4x4x4 frame: dig out ${e.clear.length} more plush (a frame needs a cube 4 wide, 4 high and 4 long)`, ent: e };
    if (best) e.snap = best.side;
    return { ok: true, ent: e };
  }

  // ---- free standing frames: any angle, centred where you aim, never snapped to another frame. Place them one after another, turning a
  // little each time (Left / Right), and the tunnel bends. The section they stand in must already be dug out, like any other frame.
  orientedClear(cx, cz, yaw, y0, w, d, h) {
    const wd = this.game.world, out = [], cs = Math.cos(yaw), sn = Math.sin(yaw), R = Math.ceil(Math.hypot(w, d) / 2 / C) + 1;
    const ci = toI(cx), ck = toK(cz), j0 = Math.round(y0 / C), j1 = Math.ceil((y0 + h) / C - 1e-6);
    for (let dk = -R; dk <= R; dk++) for (let di = -R; di <= R; di++) {
      const i = ci + di, k = ck + dk, dx = cellX(i) - cx, dz = cellZ(k) - cz;
      const u = dx * cs - dz * sn, v = dx * sn + dz * cs;           // along the frame's width, and across its depth
      const ext = (C / 2) * (Math.abs(cs) + Math.abs(sn));        // how far the plush's square reaches along the frame's axes
      if (Math.abs(u) >= w / 2 + ext - 0.2 || Math.abs(v) >= d / 2 + ext - 0.06) continue;
      for (let j = Math.max(0, j0); j < j1; j++) if (wd.get(i, j, k)) out.push([i, j, k]);
    }
    return out;
  }
  // why a turned frame cannot stand where `e` puts it, or null (also fills e.clear with the plush still in its section)
  freeFrameWhy(e) {
    const { cx, cz, y0, yaw: fy, w: wd, h, d } = e;
    e.clear = this.orientedClear(cx, cz, fy, y0, wd, d, h);
    for (const it of this.items.values()) { const f = it.ent; if (f.type === 'frame' && f.id !== e.id && Math.hypot(f.cx - cx, f.cz - cz) < 0.45 && Math.abs(f.y0 - y0) < 0.3) return 'A frame is already here'; }
    // two frames may touch, but not cut through each other: compare the two footprints (width x depth, turned) on the floor plan
    for (const it of this.items.values()) {
      const f = it.ent; if (f.type !== 'frame' || f.id === e.id || Math.abs(f.y0 - y0) > Math.min(h, f.h || h) - 0.15) continue;
      if (Math.hypot(f.cx - cx, f.cz - cz) > Math.hypot(wd, d) + 0.6) continue;
      const fy2 = f.yaw !== undefined ? f.yaw : f.axis === 'x' ? Math.PI / 2 : 0;
      if (footprintOverlap(cx, cz, fy, wd / 2, d / 2, f.cx, f.cz, fy2, (f.w || wd) / 2, frameDepth(f) / 2) > FRAME_CUT) return 'This would cut through the frame beside it: move along the tunnel or turn it less';
    }
    if (e.clear.length) return `The tunnel is too tight for a 4x4x4 frame at this angle: dig out ${e.clear.length} more plush, or turn it with Left / Right`;
    return null;
  }
  // the host's check of a frame a guest wants to set: the guest's numbers are not believed. The cube is rebuilt from its grid origin (or
  // from its centre and angle when turned), and the 4x4x4 section is looked at again. Returns a reason, or null (and e is made canonical).
  frameConflict(kind, e) {
    const num = (v) => typeof v === 'number' && Number.isFinite(v);
    if (!e || typeof e !== 'object' || !FRAME_TYPES[kind] || e.kind !== kind) return 'Bad frame';
    if (!num(e.cx) || !num(e.cz) || !num(e.y0) || Math.abs(e.y0 / C - Math.round(e.y0 / C)) > 0.02 || e.y0 < 0) return 'Bad frame';
    if (e.w !== undefined && Math.abs(e.w - FRAME_W) > 0.02) return 'Bad frame';
    if (e.h !== undefined && Math.abs(e.h - FRAME_H) > 0.02) return 'Bad frame';
    if (e.d === undefined || Math.abs(e.d - FRAME_D) > 0.02) return 'Bad frame';
    let canon;
    if (e.turned) {
      if (!num(e.yaw)) return 'Bad frame';
      canon = { axis: Math.abs(Math.sin(e.yaw)) > 0.7071 ? 'x' : 'z', yaw: e.yaw, turned: true, kind, cx: e.cx, cz: e.cz, y0: e.y0, w: FRAME_W, h: FRAME_H, d: FRAME_D };
      const why = this.freeFrameWhy(canon); if (why) return why;
    } else {
      if ((e.axis !== 'x' && e.axis !== 'z') || !Number.isInteger(e.gm) || !Number.isInteger(e.glo) || !Number.isInteger(e.gj) || e.gj < 0) return 'Bad frame';
      canon = this.frameEnt(e.axis, kind, e.gm, e.glo, e.gj);
      if (Math.abs(canon.cx - e.cx) > 0.02 || Math.abs(canon.cz - e.cz) > 0.02 || Math.abs(canon.y0 - e.y0) > 0.02) return 'Bad frame';
      const hit = this.blockTaken(canon.axis, canon.gm, canon.glo, canon.gj);
      if (hit) return 'A frame is already here';
      if (this.turnedCut(canon)) return 'A turned frame is in the way: this would cut through it';
      if (canon.clear.length) return `This tunnel is too tight for a 4x4x4 frame: dig out ${canon.clear.length} more plush`;
    }
    Object.assign(e, canon); e.clear = [];   // placeCurrent never digs, and never trusts a list of cells that came over the wire
    return null;
  }

  planFreeFrame(eye, dir, kind, fy) {
    const w = this.game.world;
    const r = this.rayEmpty(eye, dir, 5);
    if (!r) return { ok: false, why: 'Aim at the tunnel floor' };
    let { i, j, k } = r.last; let guard = 0;
    while (j > 0 && !w.solid(i, j - 1, k) && guard++ < 8) j--;
    if (j > 0 && !w.solid(i, j - 1, k)) return { ok: false, why: 'No floor here: aim at the floor' };
    const y0 = j * C; let cx = cellX(i), cz = cellZ(k);
    if (dir.y < -0.02) { const t = (y0 + 0.02 - eye.y) / dir.y; if (t > 0 && t < 6) { cx = eye.x + dir.x * t; cz = eye.z + dir.z * t; } }
    const wd = FRAME_W, h = FRAME_H, d = FRAME_D;
    const e = { axis: Math.abs(Math.sin(fy)) > 0.7071 ? 'x' : 'z', yaw: fy, turned: true, kind, cx, cz, y0, w: wd, h, d };
    const why = this.freeFrameWhy(e); if (why) return { ok: false, why, ent: e };
    e.snap = 'free, turned ' + Math.round(((fy % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 180 / Math.PI) + '°';
    return { ok: true, ent: e };
  }

  // ---- old saves. A frame saved before the cube had no `d`: one cell deep. On load each becomes a 4 deep cube whose section is already dug
  // (the cube starts at the old frame and runs on along the tunnel, or backwards if that is where the dug ground is). One that cannot
  // grow safely (plush or another frame in the way) stays as the old thin frame and still holds up. A frame that now stands inside the
  // cube of its neighbour is absorbed by that cube (its item goes back to your bag, a crew lining just goes) so a lined tunnel loads as a clean run of cubes.
  upgradeOldFrames(S) {
    const res = { converted: 0, absorbed: 0, kept: 0 };
    const old = S.entities.filter((e) => e.type === 'frame' && e.d === undefined);
    if (!old.length) return res;
    const hit = (a, c) => a.i0 <= c.i1 && c.i0 <= a.i1 && a.k0 <= c.k1 && c.k0 <= a.k1 && a.j0 <= c.j1 && c.j0 <= a.j1;
    const inBox = (a, c) => a.i0 >= c.i0 && a.i1 <= c.i1 && a.k0 >= c.k0 && a.k1 <= c.k1 && a.j0 >= c.j0 && a.j1 <= c.j1;
    const boxes = [], placedT = [];
    for (const e of S.entities) {
      if (e.type !== 'frame' || e.d === undefined) continue;
      if (e.turned) placedT.push(e); else boxes.push({ id: e.id, box: this.blockBox(this.frameBlock(e)), ent: e });
    }
    const fanOf = (id) => S.entities.find((x) => x.type === 'fan' && x.mounted && x.frameId === id);
    const gone = new Set();
    const absorb = (f, into) => {
      const fan = fanOf(f.id);
      if (fan) { if (!into || fanOf(into.id)) return false; fan.frameId = into.id; fan.px = into.cx; fan.pz = into.cz; fan.py = into.y0 + into.h - MOUNT_FAN.drop; fan.i = toI(fan.px); fan.j = toJ(fan.py); fan.k = toK(fan.pz); }
      gone.add(f.id); res.absorbed++;
      if (!f.auto) { const key = 'frame:' + f.kind; S.items[key] = (S.items[key] || 0) + 1; }
      return true;
    };
    const key = (f) => { const b = this.frameBlock(f); return [f.axis === 'x' ? 0 : 1, b.j0, b.lo, b.m]; };
    const grid = old.filter((f) => !f.turned).sort((p, q) => { const a = key(p), b = key(q); for (let n = 0; n < 4; n++) if (a[n] !== b[n]) return a[n] - b[n]; return 0; });   // run by run, low end first
    for (const f of grid) {
      const b = this.frameBlock(f), slab = this.blockBox(b);
      const holder = boxes.find((q) => q.ent && q.ent.axis === f.axis && inBox(slab, q.box));
      if (holder && absorb(f, holder.ent)) continue;
      let done = false;
      for (const dm of [0, -1, -2, -3]) { for (const dl of [0, -1, 1]) {
        const m = b.m + dm, lo = b.lo + dl, j0 = b.j0, box = this.blockBox({ axis: f.axis, m, lo, j0, n: FRAME_N });
        if (boxes.some((q) => hit(box, q.box)) || this.sectionSolid(f.axis, m, lo, j0).length) continue;
        const ne = this.frameEnt(f.axis, f.kind, m, lo, j0); delete ne.clear; delete ne.kind;
        Object.assign(f, ne); boxes.push({ id: f.id, box, ent: f }); res.converted++; done = true; break;
      } if (done) break; }
      if (!done) { boxes.push({ id: f.id, box: slab, ent: null }); res.kept++; }
    }
    for (const f of old.filter((q) => q.turned)) {
      const probe = { cx: f.cx, cz: f.cz, yaw: f.yaw !== undefined ? f.yaw : f.axis === 'x' ? Math.PI / 2 : 0, y0: f.y0, w: FRAME_W, h: FRAME_H, d: FRAME_D };
      const near = placedT.find((q) => Math.hypot(q.cx - f.cx, q.cz - f.cz) < 1.3 && Math.abs(q.y0 - f.y0) < 0.3);
      if (near && absorb(f, near)) continue;
      const cut = placedT.some((q) => Math.abs(q.y0 - f.y0) < FRAME_H - 0.15 && footprintOverlap(probe.cx, probe.cz, probe.yaw, probe.w / 2, probe.d / 2, q.cx, q.cz, q.yaw, (q.w || probe.w) / 2, frameDepth(q) / 2) > FRAME_CUT);
      const wallBox = boxes.some((q) => q.ent && Math.abs(q.ent.y0 - f.y0) < FRAME_H - 0.15 && footprintOverlap(probe.cx, probe.cz, probe.yaw, probe.w / 2, probe.d / 2, q.ent.cx, q.ent.cz, q.ent.yaw, q.ent.w / 2, frameDepth(q.ent) / 2) > FRAME_CUT);
      if (cut || wallBox || this.orientedClear(probe.cx, probe.cz, probe.yaw, probe.y0, probe.w, probe.d, probe.h).length) { res.kept++; placedT.push(f); continue; }
      f.w = FRAME_W; f.h = FRAME_H; f.d = FRAME_D; res.converted++; placedT.push(f);
    }
    if (gone.size) S.entities = S.entities.filter((e) => !gone.has(e.id));
    return res;
  }

  // ---- support fan: clamps under the top beam of the frame you aim at and blows the way you are facing
  planMountFan(eye, dir, yaw) {
    const g = this.game; let best = null, bd = 1.6;
    for (const it of this.items.values()) {
      const f = it.ent; if (f.type !== 'frame' && f.type !== 'garch') continue;   // a giant arch carries a fan like a frame cube
      const px = f.cx, py = f.y0 + f.h - MOUNT_FAN.drop, pz = f.cz;
      const vx = px - eye.x, vy = py - eye.y, vz = pz - eye.z, t = vx * dir.x + vy * dir.y + vz * dir.z; if (t < 0.2 || t > 6.5) continue;
      const d = Math.hypot(vx - dir.x * t, vy - dir.y * t, vz - dir.z * t); if (d < bd) { bd = d; best = f; }
    }
    if (!best) return { ok: false, why: 'Aim at a frame: the fan clamps under its top beam' };
    for (const t of g.logi.tiles.values()) if (t.type === 'fan' && t.mounted && t.frameId === best.id) return { ok: false, why: 'This frame already has a fan' };
    const fy = best.yaw !== undefined ? best.yaw : best.axis === 'x' ? Math.PI / 2 : 0, ax = Math.sin(fy), az = Math.cos(fy);
    const sgn = (Math.sin(yaw) * ax + Math.cos(yaw) * az) >= 0 ? 1 : -1, fx = ax * sgn, fz = az * sgn;
    const e = { type: 'fan', mounted: true, frameId: best.id, px: best.cx, py: best.y0 + best.h - MOUNT_FAN.drop, pz: best.cz, fx, fz, fyaw: Math.atan2(fx, fz), dir: 0 };
    e.i = toI(e.px); e.j = toJ(e.py); e.k = toK(e.pz);
    if (g.logi.tiles.has(((e.j * NZ) + e.k) * NX + e.i)) return { ok: false, why: 'Something is already in that spot' };
    return { ok: true, ent: e };
  }

  // the cube a machine sets behind itself: the 4 cells it has just dug, as one 4x4x4 module on the frame grid. (i,j,k) is the last cell it
  // left and `sgn` the way it was going along `axis`. A mech, a bot or a borer cuts a bore narrower than a frame, so whatever of the section is still
  // plush will be trimmed when the cube goes in (listed in ent.clear); The One and other special cells are never touched: no cube then.
  frameFromCell(i, j, k, axis, kind, sgn = 1, needRoof = true) {
    const w = this.game.world;
    const a = axis === 'x' ? i : k, lat0 = axis === 'x' ? k : i;
    const m = sgn > 0 ? a - (FRAME_N - 1) : a;
    let lo = lat0 - 1, bestC = 1e9;
    for (const dl of [-1, -2, 0, -3]) { const n = this.sectionSolid(axis, m, lat0 + dl, j).length; if (n < bestC) { bestC = n; lo = lat0 + dl; } }
    const e = this.frameEnt(axis, kind, m, lo, j); e.auto = true;
    if (this.blockTaken(axis, m, lo, j)) return { ok: false, why: 'Frame already here' };
    if (this.turnedCut(e)) return { ok: false, why: 'A turned frame is in the way' };
    for (const [ci, cj, ck] of e.clear) if (isSpecialCell(w.get(ci, cj, ck))) return { ok: false, why: 'Something special is in the section' };
    // a frame props a roof: some plush must stand over the cube (open ground gets none)
    let roof = !needRoof;
    for (let a2 = 0; a2 < FRAME_N && !roof; a2++) for (let c = 0; c < FRAME_N && !roof; c++) {
      const ii = axis === 'x' ? m + c : lo + a2, kk = axis === 'x' ? lo + a2 : m + c;
      for (let jj = j + FRAME_N; jj < j + FRAME_N + 3; jj++) if (w.solid(ii, jj, kk)) { roof = true; break; }
    }
    if (needRoof && !roof) return { ok: false, why: 'No roof to prop' };
    return { ok: true, ent: e };
  }
  // would a cube of this kind at plan ent e hold? 'lone': by itself (a bot or a mech that sets one cube at a time: the conservative reading, nobody shares its roof).
  // 'kind': with the new one in place, it and every cube of the same kind around it must hold (a dense run only stands if all of it does; where concrete
  // would buckle, the borer moves up a tier).
  supportHolds(e, kind, mode = 'lone') {
    const w = this.game.world, ft = FRAME_TYPES[kind], cap = capacityOf(kind); if (!isFinite(cap)) return true;
    const hyp = { x: e.cx, y: e.y0 + e.h / 2, z: e.cz, r: ft.radius, kind, cap, id: 'hyp' };
    if (mode === 'lone') return loadOn(w, hyp) / cap <= 1;
    w.supports.push(hyp); let worst = 0;
    for (const q of w.supports) if (q.kind === kind && q.cap !== undefined && Math.hypot(q.x - hyp.x, q.z - hyp.z) < ft.radius * 2) worst = Math.max(worst, loadOn(w, q) / q.cap);
    w.supports.pop();
    return worst <= 1;
  }
  // trim the plush out of a section (a machine's cube goes in where its bore was too narrow). Returns what it took so it can be put back.
  reamSection(e, queue = false) {
    const w = this.game.world, taken = [];
    for (const [ci, cj, ck] of e.clear || []) { const it = w.removeCell(ci, cj, ck, queue); if (it) taken.push([ci, cj, ck, it.sp, it.vr]); }
    return taken;
  }
  unreamSection(taken) { const w = this.game.world; for (const [ci, cj, ck, sp, vr] of taken) w.setCell(ci, cj, ck, sp, vr); }

  // used by mechs with the Roof Bolter and crew bots with the Bot Bolter: one cube per 4 cells of advance, the best frame they can pay for
  autoFrame(i, j, k, dir) {
    const g = this.game, T = g.T;
    const axis = (dir === 0 || dir === 2) ? 'x' : 'z', sgn = (dir === 0 || dir === 1) ? 1 : -1;
    const kinds = [...T.frames].reverse();
    for (const kind of kinds) {
      const cost = FRAME_TYPES[kind].cost;
      if (g.S.money < cost) continue;
      if (supportDepth(cellX(i), cellZ(k)) > FRAME_TYPES[kind].maxDepth) continue; // too weak for this depth: the crew will not set it
      const plan = this.frameFromCell(i, j, k, axis, kind, sgn);
      if (!plan.ok) return false;
      const e = plan.ent;
      const taken = this.reamSection(e);   // weigh the roof with the section trimmed out, as it will stand
      if (!this.supportHolds(e, kind)) { this.unreamSection(taken); continue; } // the crew will not set a frame that would buckle, or that would tip a neighbour over
      for (const [ci, cj, ck] of taken) g.world.stabQueue.push({ i: ci, j: cj, k: ck });
      g.S.money -= cost; g.ui.setMoney(g.S.money);
      const ent = { id: g.nextId(), type: 'frame', kind: e.kind, axis: e.axis, cx: e.cx, cz: e.cz, y0: e.y0, w: e.w, h: e.h, d: e.d, gm: e.gm, glo: e.glo, gj: e.gj, yaw: e.yaw, paid: cost, auto: true };
      g.S.entities.push(ent);
      this.add(ent);
      g.S.stats.props++;
      return true;
    }
    return false;
  }

  planLantern(eye, dir) {
    const r = this.rayEmpty(eye, dir, 5);
    if (!r) return { ok: false, why: 'Aim at a spot' };
    const w = this.game.world;
    const { i, j, k } = r.last;
    // hang from roof if within 3 cells above, else rest on floor
    let y;
    if (w.solid(i, j + 1, k)) y = (j + 1) * C - 0.28;
    else if (w.solid(i, j + 2, k)) y = (j + 2) * C - 0.28;
    else y = j * C + 0.2;
    return { ok: true, ent: { x: cellX(i), y, z: cellZ(k) } };
  }

  planRig(eye, dir) {
    const w = this.game.world;
    const r = this.rayEmpty(eye, dir, 5);
    if (!r) return { ok: false, why: 'Aim at the pile surface' };
    let { i, j, k } = r.last;
    let g = 0;
    while (j > 0 && !w.solid(i, j - 1, k) && g++ < 6) j--;
    if (j > 0 && !w.solid(i, j - 1, k)) return { ok: false, why: 'Needs ground' };
    if (w.topAt(i, k) > j + 2) return { ok: false, why: 'Must stand in the open' };
    let sup = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (w.solid(i + a, j - 1, k + b)) sup++;
    if (sup < 5) return { ok: false, why: 'Ground too uneven' };
    for (const it of this.items.values()) {
      if (it.ent.type !== 'claw') continue;
      if (Math.hypot(it.ent.x - cellX(i), it.ent.z - cellZ(k)) < 2.2) return { ok: false, why: 'Too close to another rig' };
    }
    return { ok: true, ent: { x: cellX(i), y: j * C, z: cellZ(k), i, j, k } };
  }

  planBorer(eye, dir, yaw) {
    const w = this.game.world;
    const T = this.game.T;
    const r = this.rayEmpty(eye, dir, 5);
    if (!r) return { ok: false, why: 'Aim at the face of the pile' };
    let { i, j, k } = r.last;
    let g = 0;
    while (j > 0 && !w.solid(i, j - 1, k) && g++ < 6) j--;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let ddx = 0, ddz = 0;
    if (Math.abs(fx) > Math.abs(fz)) ddx = Math.sign(fx); else ddz = Math.sign(fz);
    // needs a solid face ahead: look a few cells along the way you face (the wall of a slope leans), and set the borer in front of it
    let found = false;
    for (let st = 0; st < 5 && !found; st++) {
      const ci = i + ddx * st, ck = k + ddz * st;
      if (w.solid(ci, j, ck) && st > 0) break; // something solid right at the floor in front: stop looking
      if (w.solid(ci + ddx, j, ck + ddz) || w.solid(ci + ddx, j + 1, ck + ddz) || w.solid(ci + ddx, j + 2, ck + ddz)) { i = ci; k = ck; found = true; }
    }
    if (!found) return { ok: false, why: 'Face the pile wall' };
    return { ok: true, ent: { i, j, k, dx: ddx, dz: ddz, w: T.borerW, h: T.borerH, x: cellX(i), y: j * C, z: cellZ(k) } };
  }

  // earth movers (src/earth.js): the same plan shape as a borer's, kept in one place
  planEarth(kind, eye, dir, yaw) { return planEarthMachine(this, kind, eye, dir, yaw); }

  // ---------- ghost ----------
  setGhost(obj, key = '') {
    if (this.ghost) { this.root.remove(this.ghost); this.ghost = null; }
    if (obj) { this.ghost = obj; this.root.add(obj); }
    this.ghostKey = key;
  }

  showPreview(tool, plan) {
    if (!tool || !plan) { if (this.ghost) this.setGhost(null); return; }
    let key = '';
    let make = null;
    if (plan.ent) {
      const e = plan.ent;
      if (tool.kind === 'frame') { key = `f${e.kind}${e.axis}${e.w.toFixed(2)}${e.h.toFixed(2)}${frameDepth(e).toFixed(2)}${plan.ok}`; make = () => ghostify(buildFrameMesh(e.kind, e.axis, e.w, e.h, 0, frameDepth(e)), plan.ok); }
      else if (tool.kind === 'mfan') { key = `mf${plan.ok}`; make = () => ghostify(buildMountFan(), plan.ok); }
      else if (tool.kind === 'lantern') { key = `l${plan.ok}`; make = () => ghostify(this.makeLantern(), plan.ok); }
      else if (tool.kind === 'beacon') { key = `bc${plan.ok}`; make = () => ghostify(this.makeBeacon(), plan.ok); }
      else if (['marker', 'flare', 'glow', 'charge', 'dynamite', 'strut', 'jack', 'rope'].includes(tool.kind)) { key = `${tool.kind}${plan.ok}`; make = () => ghostify(this.makeSimple(tool.kind, null), plan.ok); }
      else if (tool.kind === 'claw') { key = `c${plan.ok}`; make = () => ghostify(this.makeRig().group, plan.ok); }
      else if (tool.kind === 'borer') { key = `b${e.dx}${e.dz}${e.w}${e.h}${plan.ok}`; make = () => ghostify(this.makeBorer(e).group, plan.ok); }
      else if (isEarth(tool.kind)) { key = `e${tool.kind}${e.dx}${e.dz}${plan.ok}`; make = () => ghostify(makeEarth(tool.kind, e, this.game.T).group, plan.ok); }
    } else { if (this.ghost) this.setGhost(null); return; }
    if (key !== this.ghostKey) { this.setGhost(make(), key); this.addReach(tool, plan); }
    const e = plan.ent;
    if (tool.kind === 'frame') { this.ghost.position.set(e.cx, e.y0, e.cz); this.ghost.rotation.y = e.yaw !== undefined ? e.yaw : e.axis === 'x' ? Math.PI / 2 : 0; }
    else if (tool.kind === 'mfan') { this.ghost.position.set(e.px, e.py, e.pz); this.ghost.rotation.y = e.fyaw; }
    else if (tool.kind === 'lantern') this.ghost.position.set(e.x, e.y, e.z);
    else if (tool.kind === 'claw' || tool.kind === 'beacon' || ['marker', 'flare', 'glow', 'charge', 'dynamite', 'strut', 'jack', 'rope'].includes(tool.kind)) this.ghost.position.set(e.x, e.y, e.z);
    else if (tool.kind === 'borer' || isEarth(tool.kind)) { this.ghost.position.set(e.x, e.y, e.z); this.ghost.rotation.y = Math.atan2(e.dx, e.dz); }
  }

  // a faint wire sphere and floor ring showing how far this support holds the roof (frames, struts and jacks)
  addReach(tool, plan) {
    if (!this.ghost || !plan.ent) return;
    const e = plan.ent; let r = 0, col = 0x9dffc4, cy = 0;
    if (tool.kind === 'frame') { const ft = FRAME_TYPES[e.kind]; if (!ft) return; r = ft.radius; col = plan.ok ? 0x9dffc4 : 0xff8a7a; cy = e.h / 2; }
    else if (tool.kind === 'strut') { r = 1.9; cy = 0.6; } else if (tool.kind === 'jack') { r = 2.7; cy = 0.6; } else if (tool.kind === 'rope') { r = 6; cy = 0.5; col = 0xcdb27a; } else return;
    const mat = new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.1, depthWrite: false });
    const sph = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), mat); sph.position.y = cy; sph.name = 'reach';
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.04, r, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03 - (tool.kind === 'frame' ? 0 : 0);
    // the ghost group is rotated for x-axis frames; keep the reach un-rotated by counter-rotating
    const grp = new THREE.Group(); grp.add(sph, ring); grp.name = 'reach';
    this.ghost.add(grp);
  }

  // ---------- builders ----------
  makeLantern() {
    const g = new THREE.Group();
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0x222, metalness: 0.9, roughness: 0.4, wireframe: true }));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.2, 1.6) }));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.05, 10), MATS.dark);
    cap.position.y = 0.15;
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 12), MATS.dark);
    hook.position.y = 0.22;
    g.add(cage, bulb, cap, hook);
    return g;
  }

  makeSimple(kind, ent) {
    const g = new THREE.Group();
    if (kind === 'rope') {
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 7), MATS.dark); stake.position.y = 0.45; stake.rotation.z = 0.12;
      const eye = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 12), MATS.steel); eye.position.set(0.04, 0.82, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0xcdb27a, roughness: 0.95 });
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 14), mat); coil.rotation.x = Math.PI / 2; coil.position.set(0.1, 0.1, 0.08);
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.5, 5), mat); line.position.set(0.3, 0.3, 0.5); line.rotation.set(1.1, 0.25, 0.5);
      g.add(stake, eye, coil, line);
    } else if (kind === 'marker') {
      const hues = [0xff6a9b, 0x6aa9ff, 0xffd34a, 0x7ef0a8, 0xc58bff];
      const col = hues[(ent && ent.id ? ent.id : 0) % hues.length];
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.3, 6), MATS.dark); pole.position.y = 0.65;
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.01), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2) })); flag.position.set(0.15, 1.15, 0);
      g.add(pole, flag);
    } else if (kind === 'glow') {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.4, 1.0) })); stick.position.y = 0.04; stick.rotation.z = Math.PI / 2;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.01, 4, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.4, 1.0) })); tip.name = 'tip'; tip.visible = false;
      g.add(stick, tip);
    } else if (kind === 'flare') {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 6), new THREE.MeshStandardMaterial({ color: 0xaa2218, roughness: 0.8 })); stick.position.y = 0.17; stick.rotation.z = 0.5;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 1.2, 0.5) })); tip.position.set(-0.09, 0.32, 0); tip.name = 'tip';
      g.add(stick, tip);
    } else if (kind === 'dynamite') {
      const red = new THREE.MeshStandardMaterial({ color: 0xd23a2a, roughness: 0.6 });
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 10), red); stick.position.y = 0.03; stick.rotation.z = Math.PI / 2; stick.position.y = 0.03;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 10), MATS.dark); band.rotation.z = Math.PI / 2; band.position.set(0, 0.03, 0);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 2.2, 0.6) })); led.position.set(0.15, 0.08, 0); led.name = 'led';
      const g2 = new THREE.Group(); g2.add(stick, band, led); g2.position.y = 0.03; g.add(g2);
    } else if (kind === 'charge') {
      const red = new THREE.MeshStandardMaterial({ color: 0xb02a1e, roughness: 0.7 });
      for (const x of [-0.045, 0, 0.045]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.26, 8), red); s.position.set(x, 0.13, 0); g.add(s); }
      const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 12), MATS.dark); tape.position.y = 0.13; g.add(tape);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), MATS.glowO); led.position.set(0, 0.28, 0); led.name = 'led'; g.add(led);
    } else if (kind === 'jack') {
      const orange = new THREE.MeshStandardMaterial({ color: 0xe0762a, roughness: 0.5, metalness: 0.5 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), MATS.dark); base.position.y = 0.025;
      const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 12), orange); ram.position.y = 0.6;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 10), MATS.steel); rod.position.y = 1.2;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.34), MATS.dark); plate.position.y = 1.37;
      g.add(base, ram, rod, plate);
    } else if (kind === 'strut') {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), MATS.timber); post.position.y = 0.55;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.14), MATS.timber); cap.position.y = 1.1;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.22), MATS.timber); foot.position.y = 0.02;
      g.add(post, cap, foot);
    }
    return g;
  }

  planSimple(kind, eye, dir) {
    const r = this.rayEmpty(eye, dir, 5);
    if (!r) return { ok: false, why: 'Aim at the floor or the pile' };
    const w = this.game.world;
    let { i, j, k } = r.last;
    let g = 0;
    while (j > 0 && !w.solid(i, j - 1, k) && g++ < 4) j--;
    if (j > 0 && !w.solid(i, j - 1, k)) return { ok: false, why: 'Needs a floor' };
    return { ok: true, ent: { x: cellX(i), y: j * C, z: cellZ(k), i, j, k } };
  }

  makeBeacon() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.18, 20), MATS.dark); base.position.y = 0.09;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.2, 12), MATS.steel); mast.position.y = 1.2;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.06), MATS.dark); panel.position.set(0, 1.4, 0.12);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 8, 28), MATS.glowG); ring.position.y = 2.35; ring.rotation.x = Math.PI / 2; ring.name = 'ring';
    g.add(base, mast, panel, ring);
    return g;
  }

  planBeacon(eye, dir) {
    const r = this.rayEmpty(eye, dir, 5);
    if (!r) return { ok: false, why: 'Aim at the floor' };
    const w = this.game.world;
    let { i, j, k } = r.last;
    let g = 0;
    while (j > 0 && !w.solid(i, j - 1, k) && g++ < 6) j--;
    if (j > 0 && !w.solid(i, j - 1, k)) return { ok: false, why: 'Needs ground' };
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let h = 0; h < 4; h++) if (w.solid(i + a, j + h, k + b)) return { ok: false, why: 'Needs a clear 3x3 area, 2.4 m high' };
    { const why = this.game.logi.cellTaken(i, j, k); if (why) return { ok: false, why: why === 'In the way' ? 'Something is in the way' : why }; }   // a belt, a rail piece or a shaft already stands in that cell
    return { ok: true, ent: { x: cellX(i), y: j * C, z: cellZ(k), i, j, k } };
  }

  makeRig() {
    const g = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(0.1, 2.7, 0.1);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const l = new THREE.Mesh(legGeo, MATS.yellow); l.position.set(sx * 0.95, 1.35, sz * 0.95); l.rotation.z = -sx * 0.06; l.rotation.x = sz * 0.06; g.add(l);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.34), MATS.dark); foot.position.set(sx * 1.0, 0.03, sz * 1.0); g.add(foot);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 2.2), MATS.yellow); top.position.y = 2.7; g.add(top);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.3, 16), MATS.dark); hub.position.y = 2.88; g.add(hub);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), MATS.glowO); lamp.position.set(0.9, 2.82, 0.9); g.add(lamp);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), MATS.dark);
    const claw = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.12, 12), MATS.dark);
    claw.add(palm);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.05), MATS.yellow);
      const a = (i / 3) * Math.PI * 2;
      f.position.set(Math.cos(a) * 0.11, -0.2, Math.sin(a) * 0.11); f.rotation.z = Math.cos(a) * 0.35; f.rotation.x = -Math.sin(a) * 0.35; claw.add(f);
    }
    g.add(cable, claw);
    return { group: g, cable, claw, lamp };
  }

  makeBorer(e) {
    const g = new THREE.Group();
    const wd = e.w * C - 0.1, ht = e.h * C - 0.1;
    const body = new THREE.Mesh(new THREE.BoxGeometry(wd, ht, 1.5), MATS.yellow);
    body.position.set(0, ht / 2, -0.2);
    const head = new THREE.Mesh(new THREE.ConeGeometry(Math.min(wd, ht) * 0.55, 0.75, 14, 1), MATS.dark);
    head.rotation.x = Math.PI / 2; head.position.set(0, ht / 2, 0.9);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.min(wd, ht) * 0.5, 0.04, 8, 28), MATS.glowO);
    ring.position.set(0, ht / 2, 0.58);
    const teeth = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.28, 0.07), MATS.steel);
      const a = (i / 8) * Math.PI * 2; t.position.set(Math.cos(a) * Math.min(wd, ht) * 0.4, Math.sin(a) * Math.min(wd, ht) * 0.4, 0.2); t.rotation.z = a; teeth.add(t);
    }
    teeth.position.set(0, ht / 2, 1.0);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(wd + 0.02, 0.1, 1.2), MATS.dark);
    stripe.position.set(0, ht * 0.8, -0.2);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), MATS.glowO);
    beacon.position.set(0, ht + 0.06, -0.5);
    g.add(body, head, ring, teeth, stripe, beacon);
    return { group: g, head, teeth, ring };
  }

  // ---------- adding ----------
  add(ent, silent = false) {
    const game = this.game;
    const w = game.world;
    const it = { ent, obj: null, t: 0 };
    if (ent.type === 'frame') {
      it.obj = buildFrameMesh(ent.kind, ent.axis, ent.w, ent.h, ent.yaw, frameDepth(ent));
      it.obj.position.set(ent.cx, ent.y0, ent.cz);
      const ft = FRAME_TYPES[ent.kind];
      ent.supportId = ent.supportId || ent.id;
      w.supports.push({ x: ent.cx, y: ent.y0 + ent.h / 2, z: ent.cz, r: ft.radius, b: ft.bonus, id: ent.id, kind: ent.kind, cap: capacityOf(ent.kind), born: game.time });
      game.queueLoad && game.queueLoad(ent.cx, ent.y0 + ent.h / 2, ent.cz);
    } else if (ent.type === 'beacon') {
      it.obj = this.makeBeacon();
      it.obj.position.set(ent.x, ent.y, ent.z);
      w.reserved.add((ent.j * NZ + ent.k) * NX + ent.i);
    } else if (['marker', 'flare', 'charge', 'strut', 'rope'].includes(ent.type)) {
      it.obj = this.makeSimple(ent.dyn ? 'dynamite' : ent.jack ? 'jack' : ent.glow ? 'glow' : ent.type, ent);
      it.obj.position.set(ent.x, ent.y, ent.z);
      if (ent.type === 'strut') { w.supports.push({ x: ent.x, y: ent.y + 0.6, z: ent.z, r: ent.jack ? 2.7 : 1.9, b: ent.jack ? 2 : 1, id: ent.id, kind: ent.jack ? 'jack' : 'strut', cap: capacityOf(ent.jack ? 'jack' : 'strut'), born: game.time }); game.queueLoad && game.queueLoad(ent.x, ent.y + 0.6, ent.z); }
      if (ent.type === 'flare') ent.born = ent.born ?? game.S.stats.playSecs;
    } else if (ent.type === 'lantern') {
      it.obj = this.makeLantern();
      it.obj.position.set(ent.x, ent.y, ent.z);
    } else if (ent.type === 'claw') {
      const r = this.makeRig();
      it.obj = r.group; it.rig = r;
      it.obj.position.set(ent.x, ent.y, ent.z);
      it.obj.rotation.y = ent.ry || 0;
      it.phase = 0; it.target = null; it.idle = 0;
    } else if (ent.type === 'borer') {
      const b = this.makeBorer(ent);
      it.obj = b.group; it.borer = b;
      ent.fx = ent.x; ent.fy = ent.y; ent.fz = ent.z;
      it.obj.position.set(ent.x, ent.y, ent.z);
      it.obj.rotation.y = Math.atan2(ent.dx, ent.dz);
      it.shield = { x: ent.x, y: ent.y + 0.9, z: ent.z, r: 3.6, b: 6, id: 'shield' + ent.id };
      w.supports.push(it.shield);
      it.timer = 0.5;
    } else if (isEarth(ent.type)) {
      Object.assign(it, addEarth(this, ent));
    } else if (catalogType(ent.type)) {   // catalog_*.js types: TYPES[type].add(machines, ent) => { obj, ... }
      const ct = catalogType(ent.type); Object.assign(it, ct.add ? ct.add(this, ent) : {});
      if (!it.obj) it.obj = new THREE.Group();
    }
    this.root.add(it.obj);
    this.items.set(ent.id, it);
    if (!ent.view) game.netEnt(ent);
    return it;
  }

  lights(camPos, out) {
    // nearest lanterns
    const arr = [];
    for (const it of this.items.values()) {
      if (it.ent.type !== 'lantern' && it.ent.type !== 'flare') continue;
      const d = (it.ent.x - camPos.x) ** 2 + (it.ent.y - camPos.y) ** 2 + (it.ent.z - camPos.z) ** 2;
      if (d < 40 * 40) arr.push([d, it.ent]);
    }
    furnishLights(this.game, camPos, arr);   // lamps, floodlights, strips and beacons from furnish.js (weighted by their radius), at most LIGHT_CAP real lights
    arr.sort((a, b) => a[0] - b[0]);
    return arr.slice(0, Math.min(out, LIGHT_CAP)).map((a) => a[1]);
  }

  count(type) { let n = 0; for (const it of this.items.values()) if (it.ent.type === type && !it.ent.done) n++; return n; }

  // ---------- runtime ----------
  // guest: only keep moving things where the host says they are
  guestUpdate(dt, time) {
    for (const it of this.items.values()) {
      const e = it.ent;
      if (e.type === 'claw') this.guestRig(it, dt);
      else if (e.type === 'borer') { const k = Math.min(1, dt * 6); const tx = cellX(e.i) + (e.dz !== 0 && e.w % 2 === 0 ? C / 2 : 0), tz = cellZ(e.k) + (e.dx !== 0 && e.w % 2 === 0 ? C / 2 : 0); it.obj.position.x += (tx - it.obj.position.x) * k; it.obj.position.z += (tz - it.obj.position.z) * k; if (it.borer) it.borer.teeth.rotation.z += dt * 7; }
      else if (isEarth(e.type)) guestEarth(this, it, dt, time);
      else if (e.type === 'beacon') { const rg = it.obj.getObjectByName('ring'); if (rg) rg.rotation.z = time * 1.5; }
      else if (e.type === 'lantern') it.obj.rotation.z = Math.sin(time * 1.3 + e.x) * 0.02;
      else if (e.type === 'flare') { const tp = it.obj.getObjectByName('tip'); if (tp) tp.scale.setScalar(0.8 + Math.sin(time * 23 + e.x) * 0.25); }
      else if (e.type === 'charge') { const led = it.obj.getObjectByName('led'); if (led) led.visible = Math.sin(time * 14) > 0; }
    }
  }

  // a guest's copy of a rig: the host says where the claw is aiming and how far along the swing is, and the arm moves the same way
  guestRig(it, dt) {
    const T = this.game.T, e = it.ent, r = it.rig; if (!r) return;
    const ax = e.x, ay = e.y + 2.75, az = e.z;
    r.lamp.material = (it.idle > 0) ? MATS.glowG : MATS.glowO;
    if (it.idle > 0 || !it.target) { if (it.idle > 0) it.idle -= dt; this.posClaw(it, ax, ay, az, ax, ay - 1.2, az, 0); return; }
    const rate = T.rigRate * compaction(e.x, e.z);
    it.phase = Math.min(1, (it.phase || 0) + dt * (e.pw ?? 0) / rate);
    const tg = it.target, tx = cellX(tg.i), ty = cellY(tg.j) + 0.1, tz = cellZ(tg.k);
    const q = it.phase < 0.45 ? it.phase / 0.45 : it.phase < 0.55 ? 1 : 1 - Math.min(1, (it.phase - 0.55) / 0.45);
    const k = q * q * (3 - 2 * q);
    this.posClaw(it, ax, ay, az, ax + (tx - ax) * k, ay - 1.2 + (ty - (ay - 1.2)) * k, az + (tz - az) * k, k);
  }

  update(dt, time) {
    const game = this.game, w = game.world, T = game.T;
    for (const it of this.items.values()) {
      const e = it.ent;
      if (e.type === 'claw') this.updateRig(it, dt, time);
      else if (e.type === 'borer') this.updateBorer(it, dt, time);
      else if (isEarth(e.type)) updateEarth(this, it, dt, time);
      else if (e.type === 'beacon') { const rg = it.obj.getObjectByName('ring'); if (rg) rg.rotation.z = time * 1.5; }
      else if (e.type === 'lantern') it.obj.rotation.z = Math.sin(time * 1.3 + e.x) * 0.02;
      else if (e.type === 'flare') { if (game.S.stats.playSecs - e.born > (e.glow ? 600 : 240)) this.expire.push(e); else { const tp = it.obj.getObjectByName('tip'); if (tp) tp.scale.setScalar(0.8 + Math.sin(time * 23 + e.x) * 0.25); } }
      else if (e.type === 'charge') {
        e.fuse -= dt;
        const led = it.obj.getObjectByName('led'); if (led) led.visible = Math.sin(e.fuse * (e.fuse < 2 ? 22 : 9)) > 0;
        if (e.fuse <= 0) this.expire.push(e);
      }
    }
    void w; void T;
    if (this.expire.length) {
      for (const e of this.expire.splice(0)) {
        const it = this.items.get(e.id);
        if (it) { this.disposeObj(it.obj); this.root.remove(it.obj); this.items.delete(e.id); }
        game.S.entities = game.S.entities.filter((x) => x.id !== e.id);
        game.netEntRemove(e);
        if (e.type === 'charge') game.detonate(e);
      }
    }
  }

  updateRig(it, dt, time) {
    const game = this.game, w = game.world, T = game.T, e = it.ent;
    const r = it.rig;
    const ax = e.x, ay = e.y + 2.75, az = e.z;
    const rate = T.rigRate * compaction(e.x, e.z);
    const reach = T.rigReach + 1.0;
    r.lamp.material = (it.idle > 0) ? MATS.glowG : MATS.glowO;
    if (it.idle > 0) {
      it.idle -= dt;
      this.posClaw(it, ax, ay, az, ax, ay - 1.2, az, 0);
      return;
    }
    if (!it.target) {
      // choose the highest exposed plush in reach
      let best = null, bs = -1e9;
      const rc = Math.ceil(reach / C);
      const ci = toI(ax), cj = toJ(ay), ck = toK(az);
      for (let dj = -rc; dj <= rc; dj++) for (let dk = -rc; dk <= rc; dk++) for (let di = -rc; di <= rc; di++) {
        const i = ci + di, j = cj + dj, k = ck + dk;
        const gs = w.get(i, j, k);
        if (gs === 0 || isSpecialCell(gs)) continue;
        const x = cellX(i), y = cellY(j), z = cellZ(k);
        const d = Math.hypot(x - ax, y - ay, z - az);
        if (d > reach) continue;
        // keep the pad under the rig
        const pi = toI(e.x), pk = toK(e.z), pj = toJ(e.y + 0.01);
        if (Math.abs(i - pi) <= 1 && Math.abs(k - pk) <= 1 && j < pj + 1) continue;
        if (!(!w.solid(i, j + 1, k) || !w.solid(i + 1, j, k) || !w.solid(i - 1, j, k) || !w.solid(i, j, k + 1) || !w.solid(i, j, k - 1) || !w.solid(i, j - 1, k))) continue;
        const score = j * 10 - Math.hypot(x - ax, z - az);
        if (score > bs) { bs = score; best = { i, j, k }; }
      }
      if (!best) { it.idle = 2.0; return; }
      it.target = best; it.phase = 0;
    }
    it.phase += dt * (e.pw ?? 0) / rate;
    const tg = it.target;
    const tx = cellX(tg.i), ty = cellY(tg.j) + 0.1, tz = cellZ(tg.k);
    let p;
    if (it.phase < 0.45) p = it.phase / 0.45;
    else if (it.phase < 0.55) p = 1;
    else p = 1 - Math.min(1, (it.phase - 0.55) / 0.45);
    const k = p * p * (3 - 2 * p);
    const cx = ax + (tx - ax) * k, cy = ay - 1.2 + (ty - (ay - 1.2)) * k, cz = az + (tz - az) * k;
    this.posClaw(it, ax, ay, az, cx, cy, cz, k);
    if (it.phase >= 0.5 && !it.picked) {
      it.picked = true;
      const taken = w.removeCell(tg.i, tg.j, tg.k);
      if (taken) game.rigPluck(taken, tx, ty, tz, e);
    }
    if (it.phase >= 1) { it.target = null; it.picked = false; it.phase = 0; }
  }

  posClaw(it, ax, ay, az, cx, cy, cz, k) {
    const r = it.rig;
    // claw hangs from the hub; cable stretches
    const hubY = ay, len = Math.max(0.1, hubY - cy);
    r.claw.position.set(cx - it.obj.position.x, cy - it.obj.position.y, cz - it.obj.position.z);
    r.cable.scale.set(1, len, 1);
    r.cable.position.set((cx + ax) / 2 - it.obj.position.x, (hubY + cy) / 2 - it.obj.position.y, (cz + az) / 2 - it.obj.position.z);
    r.cable.lookAt(cx, cy, cz);
    r.cable.rotateX(Math.PI / 2);
    r.claw.rotation.y += 0.02;
    void k;
  }

  updateBorer(it, dt, time) {
    const game = this.game, w = game.world, T = game.T, e = it.ent;
    const b = it.borer;
    b.teeth.rotation.z += dt * 7;
    b.ring.material = MATS.glowO;
    // smooth motion toward cell position
    const evenOff = e.w % 2 === 0 ? C / 2 : 0;
    const tx = cellX(e.i) + (e.dz !== 0 ? evenOff : 0), tz = cellZ(e.k) + (e.dx !== 0 ? evenOff : 0), ty = e.j * C;
    it.obj.position.x += (tx - it.obj.position.x) * Math.min(1, dt * 6);
    it.obj.position.z += (tz - it.obj.position.z) * Math.min(1, dt * 6);
    it.obj.position.y += (ty - it.obj.position.y) * Math.min(1, dt * 6);
    it.shield.x = it.obj.position.x; it.shield.z = it.obj.position.z; it.shield.y = ty + 0.9;
    if (e.done) { it.shield.b = 0; return; }
    it.timer -= dt * (e.pw ?? 0);
    if (it.timer > 0) return;
    it.timer = T.borerRate * compaction(cellX(e.i), cellZ(e.k));
    this.game.noteDist(cellX(e.i), cellZ(e.k));
    const nx = e.i + e.dx, nk = e.k + e.dz;
    if (nx < 3 || nx > NX - 4 || nk < 3 || nk > NZ - 4) { e.done = true; game.ui.toast({ icon: '🚇', title: 'Borer finished', text: 'It hit the edge of the hall.' }); return; }
    // carve slab
    const px = e.dz !== 0 ? 1 : 0, pz = e.dx !== 0 ? 1 : 0; // perpendicular axis
    const half = Math.floor((e.w - 1) / 2);
    let eaten = 0;
    for (let o = -half; o < e.w - half; o++) {
      for (let h = 0; h < e.h; h++) {
        const i = nx + px * o, k = nk + pz * o, j = e.j + h;
        if (w.get(i, j, k) === NEEDLE) continue;   // the cutter never eats The One: that cell stays in the pile (heavy equipment never leaves with it)
        const taken = w.removeCell(i, j, k);
        if (taken) { eaten++; game.borerEat(taken, cellX(i), cellY(j), cellZ(k)); }
      }
    }
    e.i = nx; e.k = nk;
    e.x = cellX(e.i); e.z = cellZ(e.k);
    e.steps = (e.steps || 0) + 1;
    game.fx.dust(cellX(nx) + e.dx * 0.8, e.j * C + 0.8, cellZ(nk) + e.dz * 0.8, 6, 0.8, 1);
    if (e.steps % FRAME_N === 0) {
      // lining behind the cutter: one 4x4x4 cube per 4 cells bored. Concrete where it holds, a stronger (paid) tier where the mountain presses too hard,
      // and the borer stops when nothing it can use would hold, exactly as a player's supports would buckle. A bore narrower than a cube is trimmed out.
      const axis = e.dx !== 0 ? 'x' : 'z', sgn = e.dx + e.dz > 0 ? 1 : -1;
      const order = Object.keys(FRAME_TYPES); const usable = order.filter((k) => k === 'concrete' || (T.frames.includes(k) && order.indexOf(k) > order.indexOf('concrete')));
      let chosen = null, why = '';
      for (const kind of usable) {
        const ft = FRAME_TYPES[kind], cost = kind === 'concrete' ? 0 : ft.cost; if (game.S.money < cost) { why = `it needs ${ft.name} here and cannot afford it`; continue; }
        const plan = this.frameFromCell(e.i - e.dx, e.j, e.k - e.dz, axis, kind, sgn, false);   // a borer always lines its bore, roof or not
        if (!plan.ok) { chosen = { skip: true }; break; }   // a cube already stands there, no roof to prop, something special in the way: no lining this time, the borer carries on
        const ent = { id: game.nextId(), type: 'frame', kind, axis: plan.ent.axis, cx: plan.ent.cx, cz: plan.ent.cz, y0: plan.ent.y0, w: plan.ent.w, h: plan.ent.h, d: plan.ent.d, gm: plan.ent.gm, glo: plan.ent.glo, gj: plan.ent.gj, yaw: plan.ent.yaw, auto: true };
        const taken = this.reamSection(plan.ent);
        // the cutter keeps boring: weigh the cube with the next 4 slabs of the bore cut as well, so it still holds before the next cube is set
        const half = Math.floor((e.w - 1) / 2), px = e.dz !== 0 ? 1 : 0, pz = e.dx !== 0 ? 1 : 0, ahead = [], onRm = w.onRemove; w.onRemove = null;   // a trial cut: no dust
        for (let sl = 1; sl <= FRAME_N; sl++) for (let o = -half; o < e.w - half; o++) for (let hh = 0; hh < e.h; hh++) { const it = w.removeCell(e.i + e.dx * sl + px * o, e.j + hh, e.k + e.dz * sl + pz * o, false); if (it) ahead.push([e.i + e.dx * sl + px * o, e.j + hh, e.k + e.dz * sl + pz * o, it.sp, it.vr]); }
        let holds = false; try { holds = this.supportHolds(plan.ent, kind, 'kind'); } finally { this.unreamSection(ahead); w.onRemove = onRm; }
        if (!holds) { this.unreamSection(taken); why = `${ft.name} would buckle under the mountain here`; continue; }
        chosen = { ent, cost, taken }; break;
      }
      if (chosen && chosen.skip) return;
      if (!chosen) { e.done = true; game.ui.toast({ icon: '🚇', title: 'Borer stopped', text: `The mountain presses too hard: ${why || 'no lining it has would hold'}. Better supports, or a narrower bore.` }); return; }
      for (const [ci, cj, ck] of chosen.taken) w.stabQueue.push({ i: ci, j: cj, k: ck });
      if (chosen.cost) { game.S.money -= chosen.cost; game.ui.setMoney(game.S.money); }
      game.S.entities.push(chosen.ent);
      this.add(chosen.ent);
    }
    void eaten; void time;
  }
}
