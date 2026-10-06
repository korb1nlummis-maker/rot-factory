import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { C, NX, NY, NZ, CS, CX, CY, CZ, QUALITY, cellX, cellY, cellZ } from './config.js';
import { h32, quatFromHash } from './util.js';
import { species, PALETTES, NEEDLE, BULK, REMAINS, CACHE, ARCH_COUNT } from './plushdata.js';
import { makeArchGeometry } from './plushgeo.js';
import { U, makePlushMaterial, ghostVert, ghostFrag, gradeShader } from './shaders.js';

const NA = ARCH_COUNT + 8; // 36 shapes + The One + bulkhead + gear + 4 fakes + cache
const A_NEEDLE = ARCH_COUNT, A_BULK = ARCH_COUNT + 1, A_REMAINS = ARCH_COUNT + 2;
const CAP_HI = 1100, CAP_LO = 3200, CAP_DYN = 700;
const hexCache = new Map();
function colOf(s0) {
  if (s0.hex) { let c = hexCache.get(s0.hex); if (!c) { const k = new THREE.Color(s0.hex); c = [k.r, k.g, k.b]; hexCache.set(s0.hex, c); } return c; }
  return palLin[s0.pal];
}
const STRIDE = 16;

// precomputed linear palette colors
const palLin = PALETTES.map(([, hex]) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
});
const remainsLin = [1, 1, 1];
const cacheLin = (() => { const c = new THREE.Color(0xb98a4a); return [c.r, c.g, c.b]; })();
const bulkLin = (() => { const c = new THREE.Color(0xa87a45); return [c.r, c.g, c.b]; })();
const needleLin = (() => { const c = new THREE.Color(0xffd24a); return [c.r, c.g, c.b]; })();


const _q4 = [0, 0, 0, 0];
// deterministic pose of the plush sitting in lattice cell (i,j,k): [x,y,z,qx,qy,qz,qw,scale,seed]
export function cellPose(i, j, k, v, out) {
  const h = h32(i, j, k, v + 7919);
  const h2 = Math.imul(h, 0x85ebca6b) ^ (h >>> 13);
  quatFromHash(h2 >>> 0, _q4);
  out[0] = cellX(i) + (((h >>> 0) & 255) / 255 - 0.5) * 0.1;
  out[1] = cellY(j) + (((h >>> 8) & 255) / 255 - 0.5) * 0.1;
  out[2] = cellZ(k) + (((h >>> 16) & 255) / 255 - 0.5) * 0.1;
  out[3] = _q4[0]; out[4] = _q4[1]; out[5] = _q4[2]; out[6] = _q4[3];
  out[7] = 1.1 + ((h >>> 24) & 31) / 31 * 0.1;
  out[8] = ((h >>> 5) & 255) / 255;
}

function compose(arr, o, px, py, pz, qx, qy, qz, qw, s) {
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
  arr[o] = (1 - (yy + zz)) * s; arr[o + 1] = (xy + wz) * s; arr[o + 2] = (xz - wy) * s; arr[o + 3] = 0;
  arr[o + 4] = (xy - wz) * s; arr[o + 5] = (1 - (xx + zz)) * s; arr[o + 6] = (yz + wx) * s; arr[o + 7] = 0;
  arr[o + 8] = (xz + wy) * s; arr[o + 9] = (yz - wx) * s; arr[o + 10] = (1 - (xx + yy)) * s; arr[o + 11] = 0;
  arr[o + 12] = px; arr[o + 13] = py; arr[o + 14] = pz; arr[o + 15] = 1;
}

function makeInstMesh(geom, cap, material) {
  const m = new THREE.InstancedMesh(geom, material, cap);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const ad = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  ad.setUsage(THREE.DynamicDrawUsage);
  geom.setAttribute('aData', ad);
  m.frustumCulled = false;
  m.count = 0;
  return m;
}
function flush(m, n) {
  m.count = n;
  m.visible = n > 0;
  const upd = (a, size) => { a.clearUpdateRanges(); if (n > 0) a.addUpdateRange(0, n * size); a.needsUpdate = n > 0; };
  upd(m.instanceMatrix, 16);
  upd(m.instanceColor, 3);
  upd(m.geometry.attributes.aData, 4);
}

export class Renderer {
  constructor(canvas, world, quality = 'high') {
    this.world = world;
    this.canvas = canvas;
    this.q = QUALITY[quality] || QUALITY.high;
    this.qName = quality;
    this.dynScale = 1;
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.q.pr));
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.scene.background = U.uFogColor.value.clone();
    this.scene.fog = new THREE.FogExp2(U.uFogColor.value.clone(), U.uFogDensity.value);
    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.04, 220);
    this.scene.add(this.camera);

    this.material = makePlushMaterial();
    this.hi = []; this.lo = []; this.dyn = [];
    for (let a = 0; a < NA; a++) {
      const gh = makeArchGeometry(a, 1), gl = makeArchGeometry(a, 0), gd = makeArchGeometry(a, 1);
      this.hiGeo = this.hiGeo || [];
      this.hiGeo[a] = gh;
      const capH = a === A_NEEDLE ? 4 : a === A_BULK ? 2500 : a === A_REMAINS ? 600 : a > A_REMAINS ? 300 : CAP_HI;
      const capL = a === A_NEEDLE ? 4 : a === A_BULK ? 3000 : a === A_REMAINS ? 800 : a > A_REMAINS ? 400 : CAP_LO;
      const capD = a === A_NEEDLE ? 16 : a >= A_BULK ? 120 : CAP_DYN;
      const mh = makeInstMesh(gh, capH, this.material), ml = makeInstMesh(gl, capL, this.material), md = makeInstMesh(gd, capD, this.material);
      this.scene.add(mh, ml, md);
      this.hi.push(mh); this.lo.push(ml); this.dyn.push(md);
    }
    this.hiCount = new Int32Array(NA); this.loCount = new Int32Array(NA); this.dynCount = new Int32Array(NA);

    // target ghost
    this.ghostMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 0.9, 0.5) }, uAlpha: { value: 1 }, uTime: U.uTime },
      vertexShader: ghostVert, fragmentShader: ghostFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.ghost = new THREE.Mesh(this.hiGeo[0], this.ghostMat);
    this.ghost.visible = false; this.ghost.frustumCulled = false;
    this.scene.add(this.ghost);

    // stress overlay
    const bg = new THREE.BoxGeometry(C * 0.96, C * 0.96, C * 0.96);
    this.stressMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending });
    this.stress = new THREE.InstancedMesh(bg, this.stressMat, 500);
    this.stress.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(500 * 3), 3);
    this.stress.count = 0; this.stress.frustumCulled = false;
    this.scene.add(this.stress);

    // chunks
    this.chunks = new Map();
    this.pending = [];
    this.instDirty = true;
    this.lastRebuild = 0;
    this.lastRebuildPos = new THREE.Vector3(1e9, 0, 0);

    this.initComposer();
    window.addEventListener('resize', () => this.resize());
  }

  setWorld(w) {
    this.world = w;
    this.chunks.clear();
    this.pending = [];
    this.instDirty = true;
    this.lastHx = undefined;
  }

  initComposer() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: this.q.msaa, depthBuffer: true });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(64, w >> 1), Math.max(64, h >> 1)), this.q.bloom, 0.7, 0.92);
    this.bloom.enabled = this.q.bloom > 0;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(gradeShader);
    this.grade.uniforms.uCA.value = this.q.ca ? 0.0016 : 0;
    this.composer.addPass(this.grade);
  }

  // adaptive resolution: scale the internal pixel ratio between 0.5x and 1x of the preset
  setDynScale(s) {
    s = Math.max(0.5, Math.min(1, s));
    if (Math.abs(s - this.dynScale) < 0.01) return;
    this.dynScale = s;
    const pr = Math.min(window.devicePixelRatio, this.q.pr) * s;
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setQuality(name) {
    this.qName = name;
    this.q = QUALITY[name] || QUALITY.high;
    this.dynScale = 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.q.pr));
    this.bloom.strength = this.q.bloom;
    this.composer.dispose();
    this.initComposer();
    this.instDirty = true;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------- chunks ----------------
  scanChunk(cx, cy, cz) {
    const w = this.world;
    const ci = (cy * CZ + cz) * CX + cx;
    const i0 = cx * CS, j0 = cy * CS, k0 = cz * CS;
    const i1 = Math.min(NX, i0 + CS), j1 = Math.min(NY, j0 + CS), k1 = Math.min(NZ, k0 + CS);
    if (!w.chunkMod[ci]) {
      let minT = 1e9, maxT = 0;
      for (let k = Math.max(0, k0 - 1); k <= Math.min(NZ - 1, k1); k++) {
        for (let i = Math.max(0, i0 - 1); i <= Math.min(NX - 1, i1); i++) {
          const t = w.topAt(i, k);
          if (t < minT) minT = t;
          if (t > maxT) maxT = t;
        }
      }
      if (j0 + CS < minT || j0 > maxT + 1) return { n: 0, data: null };
    }
    // padded copy of the chunk (1 cell border) so neighbor tests are plain array reads
    const P = CS + 2;
    const pad = this._pad || (this._pad = new Uint16Array(P * P * P));
    for (let dj = 0; dj < P; dj++) for (let dk = 0; dk < P; dk++) for (let di = 0; di < P; di++) {
      const i = i0 - 1 + di, j = j0 - 1 + dj, k = k0 - 1 + dk;
      pad[(dj * P + dk) * P + di] = (i < 0 || i >= NX || k < 0 || k >= NZ || j < 0 || j >= NY) ? 0xffff : w.get(i, j, k);
    }
    const out = [];
    const pose = new Float32Array(9);
    for (let j = j0; j < j1; j++) {
      for (let k = k0; k < k1; k++) {
        for (let i = i0; i < i1; i++) {
          const pi = (j - j0 + 1) * P * P + (k - k0 + 1) * P + (i - i0 + 1);
          const s = pad[pi];
          if (!s) continue;
          let cnt = 0, skyBest = 0;
          for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
            if (!di && !dj && !dk) continue;
            const v = pad[pi + dj * P * P + dk * P + di];
            if (v !== 0) { cnt++; continue; }
            const ni = i + di, nj = j + dj, nk = k + dk;
            const t = w.topAt(ni, nk);
            const sk = nj >= t ? 1 : Math.exp(-(t - nj - 1) * 0.3);
            const w2 = (di && dj ? 0 : 1) * (di && dk ? 0 : 1) * (dj && dk ? 0 : 1) ? 1 : 0.8;
            if (sk * w2 > skyBest) skyBest = sk * w2;
          }
          if (cnt === 26) continue;
          const ao = Math.min(1, Math.max(0.3, 1 - (cnt - 14) * 0.075));
          const v = w.getVr(i, j, k);
          cellPose(i, j, k, v, pose);
          const s0 = species[s];
          const arch = s0 ? s0.arch : 0;
          let col, shade = 0.9 + ((v & 127) / 127) * 0.2, flag = (v & 128) ? 1 : 0;
          if (s === NEEDLE) { col = needleLin; shade = 1; flag = 2; }
          else if (s === BULK) { col = bulkLin; shade = 0.9 + ((v & 127) / 127) * 0.15; flag = 0; }
          else if (s === REMAINS) { col = remainsLin; shade = 1; flag = 0; }
          else if (s === CACHE) { col = cacheLin; shade = 0.9 + ((v & 127) / 127) * 0.2; flag = 0; }
          else col = colOf(s0);
          out.push(
            pose[0], pose[1], pose[2], pose[3], pose[4], pose[5], pose[6], pose[7],
            ao, skyBest, flag, pose[8],
            col[0] * shade, col[1] * shade, col[2] * shade, arch,
          );
        }
      }
    }
    return { n: out.length / STRIDE, data: new Float32Array(out) };
  }

  updateChunks(cam, budgetMs = 5) {
    const w = this.world;
    const t0 = performance.now();
    const R = this.q.renderR;
    const cs = CS * C;
    const hx = Math.floor((cam.x + (NX * C) / 2) / cs), hy = Math.floor(cam.y / cs), hz = Math.floor((cam.z + (NZ * C) / 2) / cs);
    const rr = Math.ceil(R / cs) + 1;
    // dirty chunks
    if (w.dirtyChunks.size) {
      const list = [...w.dirtyChunks];
      w.dirtyChunks.clear();
      for (const ci of list) if (this.chunks.has(ci)) this.pending.push(ci);
    }
    // missing chunks
    if (this.lastHx !== hx || this.lastHy !== hy || this.lastHz !== hz || this.q !== this.lastQ) {
      this.lastHx = hx; this.lastHy = hy; this.lastHz = hz; this.lastQ = this.q;
      for (let dy = -rr; dy <= rr; dy++) for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
        const cx = hx + dx, cy = hy + dy, cz = hz + dz;
        if (cx < 0 || cy < 0 || cz < 0 || cx >= CX || cy >= CY || cz >= CZ) continue;
        const bx = cx * cs - (NX * C) / 2, by = cy * cs, bz = cz * cs - (NZ * C) / 2;
        const ddx = Math.max(bx - cam.x, 0, cam.x - (bx + cs)), ddy = Math.max(by - cam.y, 0, cam.y - (by + cs)), ddz = Math.max(bz - cam.z, 0, cam.z - (bz + cs));
        if (ddx * ddx + ddy * ddy + ddz * ddz > R * R) continue;
        const ci = (cy * CZ + cz) * CX + cx;
        if (!this.chunks.has(ci)) { this.chunks.set(ci, { cx, cy, cz, n: 0, data: null, cold: true }); this.pending.push(ci); }
      }
      // unload far
      for (const [ci, ch] of this.chunks) {
        const bx = ch.cx * cs - (NX * C) / 2, by = ch.cy * cs, bz = ch.cz * cs - (NZ * C) / 2;
        const ddx = Math.max(bx - cam.x, 0, cam.x - (bx + cs)), ddy = Math.max(by - cam.y, 0, cam.y - (by + cs)), ddz = Math.max(bz - cam.z, 0, cam.z - (bz + cs));
        if (ddx * ddx + ddy * ddy + ddz * ddz > (R + 5) * (R + 5)) { this.chunks.delete(ci); this.instDirty = true; }
      }
    }
    if (this.pending.length) {
      // nearest first
      const px = cam.x, py = cam.y, pz = cam.z;
      const dist = (ci) => {
        const ch = this.chunks.get(ci);
        if (!ch) return 1e9;
        const cx = ch.cx * cs - (NX * C) / 2 + cs / 2, cy = ch.cy * cs + cs / 2, cz = ch.cz * cs - (NZ * C) / 2 + cs / 2;
        return (cx - px) ** 2 + (cy - py) ** 2 + (cz - pz) ** 2;
      };
      this.pending.sort((a, b) => dist(a) - dist(b));
      const seen = new Set();
      while (this.pending.length && performance.now() - t0 < budgetMs) {
        const ci = this.pending.shift();
        if (seen.has(ci)) continue;
        seen.add(ci);
        const ch = this.chunks.get(ci);
        if (!ch) continue;
        const res = this.scanChunk(ch.cx, ch.cy, ch.cz);
        ch.n = res.n; ch.data = res.data; ch.cold = false;
        this.instDirty = true;
      }
    }
  }

  rebuildInstances(cam, force = false) {
    const now = performance.now();
    const moved = cam.distanceToSquared(this.lastRebuildPos) > 9.0;
    if (!force && !(this.instDirty && now - this.lastRebuild > 30) && !moved) return;
    this.instDirty = false;
    this.lastRebuild = now;
    this.lastRebuildPos.copy(cam);
    const hi2 = this.q.hiR * this.q.hiR;
    const hc = this.hiCount, lc = this.loCount;
    hc.fill(0); lc.fill(0);
    const cx = cam.x, cy = cam.y, cz = cam.z;
    for (const ch of this.chunks.values()) {
      const d = ch.data;
      if (!d) continue;
      for (let e = 0, o = 0; e < ch.n; e++, o += STRIDE) {
        const a = d[o + 15] | 0;
        const dx = d[o] - cx, dy = d[o + 1] - cy, dz = d[o + 2] - cz;
        const isHi = dx * dx + dy * dy + dz * dz < hi2;
        const m = isHi ? this.hi[a] : this.lo[a];
        const cnt = isHi ? hc : lc;
        const n = cnt[a];
        if (n >= m.instanceMatrix.count) continue;
        cnt[a] = n + 1;
        compose(m.instanceMatrix.array, n * 16, d[o], d[o + 1], d[o + 2], d[o + 3], d[o + 4], d[o + 5], d[o + 6], d[o + 7]);
        const ca = m.instanceColor.array;
        ca[n * 3] = d[o + 12]; ca[n * 3 + 1] = d[o + 13]; ca[n * 3 + 2] = d[o + 14];
        const aa = m.geometry.attributes.aData.array;
        aa[n * 4] = d[o + 8]; aa[n * 4 + 1] = d[o + 9]; aa[n * 4 + 2] = d[o + 10]; aa[n * 4 + 3] = d[o + 11];
      }
    }
    for (let a = 0; a < NA; a++) { flush(this.hi[a], hc[a]); flush(this.lo[a], lc[a]); }
  }

  // ---------------- dynamic plush (loose bodies, held items, fliers) ----------------
  beginDynamic() { this.dynCount.fill(0); }
  addDynamic(sp, vr, x, y, z, qx, qy, qz, qw, s = 1, ao = 0.9, sky = 1, sq = 0) {
    const s0 = species[sp];
    if (!s0) return;
    const a = s0.arch;
    const m = this.dyn[a];
    const n = this.dynCount[a];
    if (n >= m.instanceMatrix.count) return;
    this.dynCount[a] = n + 1;
    compose(m.instanceMatrix.array, n * 16, x, y, z, qx, qy, qz, qw, s);
    if (sq > 0.004) {
      // squash toward the ground along world Y, bulge sideways, keep the base planted
      const a = m.instanceMatrix.array, o = n * 16, yf = 1 - sq, xz = 1 + sq * 0.55;
      a[o] *= xz; a[o + 2] *= xz; a[o + 1] *= yf; a[o + 4] *= xz; a[o + 6] *= xz; a[o + 5] *= yf; a[o + 8] *= xz; a[o + 10] *= xz; a[o + 9] *= yf;
      a[o + 13] -= sq * 0.3 * s;
    }
    let col, shade = 0.9 + ((vr & 127) / 127) * 0.2, flag = (vr & 128) ? 1 : 0;
    if (sp === NEEDLE) { col = needleLin; shade = 1; flag = 2; } else if (sp === BULK) { col = bulkLin; shade = 1; flag = 0; } else if (sp === REMAINS) { col = remainsLin; shade = 1; flag = 0; } else if (sp === CACHE) { col = cacheLin; shade = 1; flag = 0; } else col = colOf(s0);
    const ca = m.instanceColor.array;
    ca[n * 3] = col[0] * shade; ca[n * 3 + 1] = col[1] * shade; ca[n * 3 + 2] = col[2] * shade;
    const aa = m.geometry.attributes.aData.array;
    aa[n * 4] = ao; aa[n * 4 + 1] = sky; aa[n * 4 + 2] = flag; aa[n * 4 + 3] = ((vr * 37) & 255) / 255;
  }
  endDynamic() { for (let a = 0; a < NA; a++) flush(this.dyn[a], this.dynCount[a]); }

  setGhost(sp, x, y, z, qx, qy, qz, qw, s, color) {
    if (!sp) { this.ghost.visible = false; return; }
    const s0 = species[sp];
    this.ghost.geometry = this.hiGeo[s0.arch];
    this.ghost.position.set(x, y, z);
    this.ghost.quaternion.set(qx, qy, qz, qw);
    this.ghost.scale.setScalar(s * 1.1);
    if (color) this.ghostMat.uniforms.uColor.value.set(color);
    this.ghost.visible = true;
  }

  setStress(list) {
    const m = this.stress;
    const n = Math.min(list.length, 500);
    const mat = new THREE.Matrix4();
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const s = list[i];
      mat.makeTranslation(s.x, s.y, s.z);
      m.setMatrixAt(i, mat);
      c.setRGB(s.sev > 1 ? 1.0 : 0.8, s.sev > 1 ? 0.12 : 0.5, s.sev > 1 ? 0.08 : 0.05);
      m.setColorAt(i, c);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.visible = n > 0;
  }

  render(dt, time) {
    U.uTime.value = time;
    this.grade.uniforms.uTime.value = time % 100;
    this.composer.render(dt);
  }
}
