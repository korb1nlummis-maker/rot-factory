import * as THREE from 'three';
import { C, NX, NY, NZ, HALL_HX, HALL_HZ, cellX, cellY, cellZ, toI, toJ, toK } from './config.js';
import { FRAME_TYPES, supportDepth } from './upgrades.js';
import { capacityOf, loadOn } from './loadtrace.js';
import { sellValue, NEEDLE, BULK, REMAINS, isSpecialCell } from './plushdata.js';
import { compaction } from './util.js';

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

export function buildFrameMesh(kind, axis, w, h, yaw) {
  const g = new THREE.Group();
  const m = MATS[kind];
  const heavy = kind === 'concrete' || kind === 'rebar' || kind === 'carbon' || kind === 'plasma' || kind === 'voidl' || kind === 'neutron' || kind === 'horizon';
  const t = heavy ? 0.26 : kind === 'steel' || kind === 'titan' ? 0.12 : 0.15;
  const depth = C - 0.06;
  // a hollow box, one cell deep: 4 vertical pillars at the corners and 4 beams around the top, open on every side
  // (no sill, so you can walk through it and build off any face)
  const d = depth;
  const pillar = new THREE.BoxGeometry(t, h, t);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pl = new THREE.Mesh(pillar, m); pl.position.set(sx * (w / 2 - t / 2), h / 2, sz * (d / 2 - t / 2)); g.add(pl);
  }
  const bw = new THREE.BoxGeometry(w, t, t), bd = new THREE.BoxGeometry(t, t, d - 2 * t);
  for (const sz of [-1, 1]) { const b1 = new THREE.Mesh(bw, m); b1.position.set(0, h - t / 2, sz * (d / 2 - t / 2)); g.add(b1); }
  for (const sx of [-1, 1]) { const b2 = new THREE.Mesh(bd, m); b2.position.set(sx * (w / 2 - t / 2), h - t / 2, 0); g.add(b2); }
  if (kind === 'steel' || kind === 'titan') {
    // yellow bolt plates at the top corners
    const plate = new THREE.BoxGeometry(t * 1.6, t * 1.6, 0.03);
    for (const sx of [-1, 1]) { const pl = new THREE.Mesh(plate, MATS.yellow); pl.position.set(sx * (w / 2 - t / 2), h - t / 2, d / 2 + 0.016); g.add(pl); }
  }
  g.rotation.y = yaw !== undefined ? yaw : axis === 'x' ? Math.PI / 2 : 0; // the box's open faces point along the tunnel
  return g;
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

  // ---- 4x4 frame modules. Every frame is a square 4 cells wide and 4 cells high (2.4 m) and one cell deep. They snap to each
  // other on ANY side: next in line (flush), left or right (a wider room), above or below (stacked levels), so a run of
  // frames builds a tunnel, a junction or a chamber. Placing one carves out its 4x4 section.
  frameBlock(f) {
    // block origin of an existing frame: along index m, lateral origin lo, vertical origin j0
    if (f.gm !== undefined) return { axis: f.axis, m: f.gm, lo: f.glo, j0: f.gj };
    const lat = f.axis === 'x' ? f.cz : f.cx, along = f.axis === 'x' ? f.cx : f.cz;
    const base = f.axis === 'x' ? cellZ(0) : cellX(0), abase = f.axis === 'x' ? cellX(0) : cellZ(0);
    return { axis: f.axis, m: Math.round((along - abase) / C) + (f.axis === 'x' ? toI(0) : toK(0)), lo: Math.round((lat - base) / C - 1.5) + (f.axis === 'x' ? toK(0) : toI(0)), j0: Math.round(f.y0 / C) };
  }
  frameEnt(axis, kind, m, lo, j0) {
    const cx = axis === 'x' ? cellX(m) : cellX(lo) + 1.5 * C, cz = axis === 'x' ? cellZ(lo) + 1.5 * C : cellZ(m);
    const e = { axis, kind, cx, cz, y0: j0 * C, w: 4 * C - 0.04, h: 4 * C - 0.02, gm: m, glo: lo, gj: j0, yaw: axis === 'x' ? Math.PI / 2 : 0 };
    // cells this section occupies (the 4x4 square at index m)
    e.clear = [];
    const w = this.game.world;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      const i = axis === 'x' ? m : lo + a, k = axis === 'x' ? lo + a : m, j = j0 + b;
      if (j >= 0 && w.inside(i, j, k) && w.get(i, j, k)) e.clear.push([i, j, k]);
    }
    return e;
  }
  planFrame(eye, dir, yaw, kind, freeYaw = null) {
    if (freeYaw !== null) return this.planFreeFrame(eye, dir, kind, freeYaw);
    const w = this.game.world;
    const r = this.rayEmpty(eye, dir, 5);
    if (!r) return { ok: false, why: 'Aim at the tunnel floor or at a frame' };
    let { i, j, k } = r.last;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let axis = Math.abs(fx) > Math.abs(fz) ? 'x' : 'z';
    let m, lo, j0;
    // aiming into a frame that is already built: nothing to place
    if (!r.hitSolid) for (const it of this.items.values()) {
      const f = it.ent; if (f.type !== 'frame' || f.turned) continue;
      const b = this.frameBlock(f);
      const am = b.axis === 'x' ? i : k, al = b.axis === 'x' ? k : i;
      if (am === b.m && al >= b.lo && al <= b.lo + 3 && j >= b.j0 && j <= b.j0 + 3) return { ok: false, why: 'Frame already here. Aim at its side, top or bottom to add another.' };
    }
    // ---- snap to a neighbouring frame on any of its six sides. What you point at decides which side: if the aim ray ends in
    // (or against) a spot that belongs to one of the sections around a frame, that section is chosen; otherwise the nearest one.
    const Q = r.hitSolid ? r.hitSolid : { i, j, k };
    const P = { x: cellX(Q.i), y: cellY(Q.j) + 0.6, z: cellZ(Q.k) };
    let best = null, bd = C * 7, inside = false;
    for (const it of this.items.values()) {
      const f = it.ent;
      if (f.type !== 'frame' || f.turned) continue;
      const b = this.frameBlock(f);
      const cand = [[1, 0, 0], [-1, 0, 0], [0, 4, 0], [0, -4, 0], [0, 0, 4], [0, 0, -4]];
      for (const [dm, dl, dj] of cand) {
        const cm = b.m + dm, cl = b.lo + dl, cj = b.j0 + dj;
        const cx = b.axis === 'x' ? cellX(cm) : cellX(cl) + 1.5 * C, cz = b.axis === 'x' ? cellZ(cl) + 1.5 * C : cellZ(cm), cy = cj * C + 2 * C;
        const along = b.axis === 'x' ? Q.i : Q.k, lat = b.axis === 'x' ? Q.k : Q.i;
        const has = along === cm && lat >= cl && lat <= cl + 3 && Q.j >= cj && Q.j <= cj + 3;
        const d = Math.hypot(cx - P.x, cy - P.y, cz - P.z);
        if ((has && !inside) || (has === inside && d < bd)) { inside = inside || has; bd = d; best = { b, cm, cl, cj, side: dm ? 'next in line' : dl ? 'beside it' : dj > 0 ? 'above it' : 'below it' }; }
      }
    }
    if (best) { axis = best.b.axis; m = best.cm; lo = best.cl; j0 = best.cj; }
    else {
      let guard = 0;
      while (j > 0 && !w.solid(i, j - 1, k) && guard++ < 8) j--;
      if (j > 0 && !w.solid(i, j - 1, k)) return { ok: false, why: 'No floor here: aim at the floor, or next to another frame' };
      // fit the 4x4 section to the tunnel you dug: try the few windows around the aimed spot and take the one with the fewest
      // plush still in the way (a clear window wins, and the one centred on your aim wins a tie)
      m = axis === 'x' ? i : k; const lat0 = axis === 'x' ? k : i;
      let bestC = 1e9;
      for (const dl of [-2, -1, -3, 0]) for (const dj of [0, -1, 1]) {
        const jj = j + dj; if (jj < 0) continue;
        if (dj !== 0 && !w.solid(i, jj - 1, k) && jj > 0) continue; // a frame stands on the floor
        const trial = this.frameEnt(axis, kind, m, lat0 + dl, jj); const n = trial.clear.length;
        if (n < bestC) { bestC = n; lo = lat0 + dl; j0 = jj; }
        if (n === 0) break;
      }
      if (lo === undefined) { lo = lat0 - 1; j0 = j; }
    }
    if (j0 < 0) return { ok: false, why: 'Below the floor' };
    const e = this.frameEnt(axis, kind, m, lo, j0);
    for (const it of this.items.values()) {
      const f = it.ent; if (f.type !== 'frame' || f.turned) continue;
      const b = this.frameBlock(f);
      if (b.axis === axis && b.m === m && b.lo === lo && b.j0 === j0) return { ok: false, why: 'Frame already here' };
    }
    // a frame holds up a section that is already dug: it never digs for you
    if (e.clear.length) return { ok: false, why: `This tunnel is too tight for a 4x4 frame: dig out ${e.clear.length} more plush (a frame needs 4 wide and 4 high)`, ent: e };
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
  planFreeFrame(eye, dir, kind, fy) {
    const w = this.game.world;
    const r = this.rayEmpty(eye, dir, 5);
    if (!r) return { ok: false, why: 'Aim at the tunnel floor' };
    let { i, j, k } = r.last; let guard = 0;
    while (j > 0 && !w.solid(i, j - 1, k) && guard++ < 8) j--;
    if (j > 0 && !w.solid(i, j - 1, k)) return { ok: false, why: 'No floor here: aim at the floor' };
    const y0 = j * C; let cx = cellX(i), cz = cellZ(k);
    if (dir.y < -0.02) { const t = (y0 + 0.02 - eye.y) / dir.y; if (t > 0 && t < 6) { cx = eye.x + dir.x * t; cz = eye.z + dir.z * t; } }
    const wd = 4 * C - 0.04, h = 4 * C - 0.02, d = C - 0.06;
    const e = { axis: Math.abs(Math.sin(fy)) > 0.7071 ? 'x' : 'z', yaw: fy, turned: true, kind, cx, cz, y0, w: wd, h };
    e.clear = this.orientedClear(cx, cz, fy, y0, wd, d, h);
    for (const it of this.items.values()) { const f = it.ent; if (f.type === 'frame' && Math.hypot(f.cx - cx, f.cz - cz) < 0.45 && Math.abs(f.y0 - y0) < 0.3) return { ok: false, why: 'A frame is already here', ent: e }; }
    if (e.clear.length) return { ok: false, why: `The tunnel is too tight for a frame at this angle: dig out ${e.clear.length} more plush, or turn it with Left / Right`, ent: e };
    e.snap = 'free, turned ' + Math.round(((fy % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 180 / Math.PI) + '°';
    return { ok: true, ent: e };
  }

  // measure the tunnel cross-section at floor cell (i,j,k) and describe a frame that fits it
  frameFromCell(i, j, k, axis, kind) {
    const w = this.game.world;
    const dx = axis === 'x' ? 0 : 1, dz = axis === 'x' ? 1 : 0; // perpendicular step
    let L = 0, R = 0;
    while (L < 5 && !w.solid(i - dx * (L + 1), j, k - dz * (L + 1))) L++;
    while (R < 5 && !w.solid(i + dx * (R + 1), j, k + dz * (R + 1))) R++;
    if (L >= 5 || R >= 5 || L + R + 1 > 5) return { ok: false, why: 'Too wide to frame' };
    let H = 0;
    while (H < 7 && !w.solid(i, j + H, k)) H++;
    if (H >= 7) return { ok: false, why: 'No roof to prop' };
    if (H < 2) return { ok: false, why: 'Too low for a frame' };
    const wc = L + R + 1;
    const pi = i + dx * ((R - L) / 2), pk = k + dz * ((R - L) / 2);
    const cx = cellX(0) + pi * C, cz = cellZ(0) + pk * C;
    const e = { axis, kind, cx, cz, y0: j * C, w: wc * C - 0.04, h: H * C - 0.02 };
    // snapping: a frame placed within a few cells of another one along the tunnel takes its profile (same centre line, width
    // and height) so a run of frames lines up into one tunnel. Right next to it (one cell) it sits flush, forming a lining.
    let near = null, nd = 1e9;
    for (const it of this.items.values()) {
      const f = it.ent;
      if (f.type !== 'frame' || f.turned || f.axis !== axis || Math.abs(f.y0 - e.y0) > 0.3) continue;
      const along = axis === 'x' ? Math.abs(f.cx - cx) : Math.abs(f.cz - cz);
      const lat = axis === 'x' ? Math.abs(f.cz - cz) : Math.abs(f.cx - cx);
      if (along < 0.3 && lat < 0.35) return { ok: false, why: 'Frame already here' };
      if (along <= C * 4.2 && lat <= f.w * 0.6 + 0.4 && along < nd) { nd = along; near = f; }
    }
    if (near) {
      const fits = e.w <= near.w + C * 0.6 && e.w >= near.w - C * 0.6 && Math.abs(e.h - near.h) <= C * 1.2;
      if (fits) {
        if (axis === 'x') e.cz = near.cz; else e.cx = near.cx;
        e.w = near.w; e.h = near.h;
        e.snap = nd < C * 1.5 ? 'flush' : 'aligned';
      }
    }
    return { ok: true, ent: e };
  }

  // used by mechs with the Roof Bolter: brace the tunnel behind them with the best frame they can pay for
  autoFrame(i, j, k, dir) {
    const g = this.game, T = g.T;
    const axis = (dir === 0 || dir === 2) ? 'x' : 'z';
    const kinds = [...T.frames].reverse();
    for (const kind of kinds) {
      const cost = FRAME_TYPES[kind].cost;
      if (g.S.money < cost) continue;
      if (supportDepth(cellX(i), cellZ(k)) > FRAME_TYPES[kind].maxDepth) continue; // too weak for this depth: the crew will not set it
      const plan = this.frameFromCell(i, j, k, axis, kind);
      if (!plan.ok) return false;
      const e = plan.ent;
      { const cap = capacityOf(kind); if (isFinite(cap)) { const hyp = { x: e.cx, y: e.y0 + e.h / 2, z: e.cz, r: FRAME_TYPES[kind].radius, kind, cap }; if (loadOn(g.world, hyp) > cap) continue; } } // the crew will not set a frame that would buckle
      g.S.money -= cost; g.ui.setMoney(g.S.money);
      const ent = { id: g.nextId(), type: 'frame', kind: e.kind, axis: e.axis, cx: e.cx, cz: e.cz, y0: e.y0, w: e.w, h: e.h, paid: cost, auto: true };
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
      if (tool.kind === 'frame') { key = `f${e.kind}${e.axis}${e.w.toFixed(2)}${e.h.toFixed(2)}${plan.ok}`; make = () => ghostify(buildFrameMesh(e.kind, e.axis, e.w, e.h, 0), plan.ok); }
      else if (tool.kind === 'lantern') { key = `l${plan.ok}`; make = () => ghostify(this.makeLantern(), plan.ok); }
      else if (tool.kind === 'beacon') { key = `bc${plan.ok}`; make = () => ghostify(this.makeBeacon(), plan.ok); }
      else if (['marker', 'flare', 'glow', 'charge', 'dynamite', 'strut', 'jack'].includes(tool.kind)) { key = `${tool.kind}${plan.ok}`; make = () => ghostify(this.makeSimple(tool.kind, null), plan.ok); }
      else if (tool.kind === 'claw') { key = `c${plan.ok}`; make = () => ghostify(this.makeRig().group, plan.ok); }
      else if (tool.kind === 'borer') { key = `b${e.dx}${e.dz}${e.w}${e.h}${plan.ok}`; make = () => ghostify(this.makeBorer(e).group, plan.ok); }
    } else { if (this.ghost) this.setGhost(null); return; }
    if (key !== this.ghostKey) { this.setGhost(make(), key); this.addReach(tool, plan); }
    const e = plan.ent;
    if (tool.kind === 'frame') { this.ghost.position.set(e.cx, e.y0, e.cz); this.ghost.rotation.y = e.yaw !== undefined ? e.yaw : e.axis === 'x' ? Math.PI / 2 : 0; }
    else if (tool.kind === 'lantern') this.ghost.position.set(e.x, e.y, e.z);
    else if (tool.kind === 'claw' || tool.kind === 'beacon' || ['marker', 'flare', 'glow', 'charge', 'dynamite', 'strut', 'jack'].includes(tool.kind)) this.ghost.position.set(e.x, e.y, e.z);
    else if (tool.kind === 'borer') { this.ghost.position.set(e.x, e.y, e.z); this.ghost.rotation.y = Math.atan2(e.dx, e.dz); }
  }

  // a faint wire sphere and floor ring showing how far this support holds the roof (frames, struts and jacks)
  addReach(tool, plan) {
    if (!this.ghost || !plan.ent) return;
    const e = plan.ent; let r = 0, col = 0x9dffc4, cy = 0;
    if (tool.kind === 'frame') { const ft = FRAME_TYPES[e.kind]; if (!ft) return; r = ft.radius; col = plan.ok ? 0x9dffc4 : 0xff8a7a; cy = e.h / 2; }
    else if (tool.kind === 'strut') { r = 1.9; cy = 0.6; } else if (tool.kind === 'jack') { r = 2.7; cy = 0.6; } else return;
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
    if (kind === 'marker') {
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
      it.obj = buildFrameMesh(ent.kind, ent.axis, ent.w, ent.h, ent.yaw);
      it.obj.position.set(ent.cx, ent.y0, ent.cz);
      const ft = FRAME_TYPES[ent.kind];
      ent.supportId = ent.supportId || ent.id;
      w.supports.push({ x: ent.cx, y: ent.y0 + ent.h / 2, z: ent.cz, r: ft.radius, b: ft.bonus, id: ent.id, kind: ent.kind, cap: capacityOf(ent.kind), born: game.time });
      game.queueLoad && game.queueLoad(ent.cx, ent.y0 + ent.h / 2, ent.cz);
    } else if (ent.type === 'beacon') {
      it.obj = this.makeBeacon();
      it.obj.position.set(ent.x, ent.y, ent.z);
      w.reserved.add((ent.j * NZ + ent.k) * NX + ent.i);
    } else if (['marker', 'flare', 'charge', 'strut'].includes(ent.type)) {
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
    arr.sort((a, b) => a[0] - b[0]);
    return arr.slice(0, out).map((a) => a[1]);
  }

  count(type) { let n = 0; for (const it of this.items.values()) if (it.ent.type === type && !it.ent.done) n++; return n; }

  // ---------- runtime ----------
  // guest: only keep moving things where the host says they are
  guestUpdate(dt, time) {
    for (const it of this.items.values()) {
      const e = it.ent;
      if (e.type === 'borer') { const k = Math.min(1, dt * 6); const tx = cellX(e.i) + (e.dz !== 0 && e.w % 2 === 0 ? C / 2 : 0), tz = cellZ(e.k) + (e.dx !== 0 && e.w % 2 === 0 ? C / 2 : 0); it.obj.position.x += (tx - it.obj.position.x) * k; it.obj.position.z += (tz - it.obj.position.z) * k; if (it.borer) it.borer.teeth.rotation.z += dt * 7; }
      else if (e.type === 'beacon') { const rg = it.obj.getObjectByName('ring'); if (rg) rg.rotation.z = time * 1.5; }
      else if (e.type === 'lantern') it.obj.rotation.z = Math.sin(time * 1.3 + e.x) * 0.02;
      else if (e.type === 'flare') { const tp = it.obj.getObjectByName('tip'); if (tp) tp.scale.setScalar(0.8 + Math.sin(time * 23 + e.x) * 0.25); }
      else if (e.type === 'charge') { const led = it.obj.getObjectByName('led'); if (led) led.visible = Math.sin(time * 14) > 0; }
    }
  }

  update(dt, time) {
    const game = this.game, w = game.world, T = game.T;
    for (const it of this.items.values()) {
      const e = it.ent;
      if (e.type === 'claw') this.updateRig(it, dt, time);
      else if (e.type === 'borer') this.updateBorer(it, dt, time);
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
        const taken = w.removeCell(i, j, k);
        if (taken) { eaten++; game.borerEat(taken, cellX(i), cellY(j), cellZ(k)); }
      }
    }
    e.i = nx; e.k = nk;
    e.x = cellX(e.i); e.z = cellZ(e.k);
    e.steps = (e.steps || 0) + 1;
    game.fx.dust(cellX(nx) + e.dx * 0.8, e.j * C + 0.8, cellZ(nk) + e.dz * 0.8, 6, 0.8, 1);
    if (e.steps % 2 === 0) {
      // lining behind the cutter: concrete where it holds, a stronger (paid) tier where the mountain presses too hard, and the borer
      // stops when nothing it can use would hold, exactly as a player's supports would buckle
      const mk = (kind) => { const ent = { id: game.nextId(), type: 'frame', kind, axis: e.dx !== 0 ? 'x' : 'z', cx: cellX(e.i - e.dx), cz: cellZ(e.k - e.dz), y0: e.j * C, w: e.w * C - 0.04, h: e.h * C - 0.02, auto: true }; if (e.w % 2 === 0) { if (e.dx !== 0) ent.cz += C / 2; else ent.cx += C / 2; } return ent; };
      const order = Object.keys(FRAME_TYPES); const usable = order.filter((k) => k === 'concrete' || (T.frames.includes(k) && order.indexOf(k) > order.indexOf('concrete')));
      let chosen = null, why = '';
      for (const kind of usable) {
        const ft = FRAME_TYPES[kind], cost = kind === 'concrete' ? 0 : ft.cost; if (game.S.money < cost) { why = `it needs ${ft.name} here and cannot afford it`; continue; }
        const ent = mk(kind); const cap = capacityOf(kind);
        if (isFinite(cap)) {
          // weigh the new lining and the linings of the same kind around it with the new one in place: a dense line only holds if all of it holds
          const hyp = { x: ent.cx, y: ent.y0 + ent.h / 2, z: ent.cz, r: ft.radius, kind, cap, id: ent.id };
          w.supports.push(hyp); let worst = 0;
          for (const q of w.supports) if (q.kind === kind && q.cap !== undefined && Math.hypot(q.x - hyp.x, q.z - hyp.z) < ft.radius * 2) worst = Math.max(worst, loadOn(w, q) / q.cap);
          w.supports.pop();
          if (worst > 1) { why = `${ft.name} would buckle under the mountain here`; continue; }
        }
        chosen = { ent, cost }; break;
      }
      if (!chosen) { e.done = true; game.ui.toast({ icon: '🚇', title: 'Borer stopped', text: `The mountain presses too hard: ${why || 'no lining it has would hold'}. Better supports, or a narrower bore.` }); return; }
      if (chosen.cost) { game.S.money -= chosen.cost; game.ui.setMoney(game.S.money); }
      game.S.entities.push(chosen.ent);
      this.add(chosen.ent);
    }
    void eaten; void time;
  }
}
