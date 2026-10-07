// The visible beam of daylight in a shaft dug up and out of the pile (see holelight.js for the light itself). One soft vertical sheet per shaft that always turns to face
// you, brightest near the opening and pooling at the foot, so a shaft reads as a column of light in an otherwise dark tunnel. It fades out when you stand in the bright hall
// (nothing to see against daylight), with the hall level (at night the hole gives only what the hall gives) and with the depth of the shaft. When the shaft is blocked or filled
// it is no longer a hole, so the beam is gone on the next refresh (any edit refreshes it).
import * as THREE from 'three';
import { C, cellX, cellZ, toI, toK } from './config.js';
import { U } from './shaders.js';
import * as HL from './holelight.js';

const CAP = 48, POOL_CAP = 600;
const vert = /* glsl */ `
attribute float aK;
varying vec2 vP; varying float vK; varying vec3 vW;
void main(){
  vec3 ctr = instanceMatrix[3].xyz;
  float wd = length(instanceMatrix[0].xyz), ht = length(instanceMatrix[1].xyz);
  vec3 to = cameraPosition - ctr; to.y = 0.0;
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), to + vec3(1e-4, 0.0, 0.0)));
  vec3 wp = ctr + rt * position.x * wd + vec3(0.0, 1.0, 0.0) * position.y * ht;
  vP = position.xy; vK = aK; vW = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const frag = /* glsl */ `
precision highp float;
uniform float uBeam; uniform float uTime;
varying vec2 vP; varying float vK; varying vec3 vW;
void main(){
  float h = vP.y + 0.5;
  float side = pow(clamp(1.0 - abs(vP.x) * 2.0, 0.0, 1.0), 2.0);
  float up = mix(0.30, 1.0, pow(h, 1.3));
  float pool = clamp(1.0 - h / 0.07, 0.0, 1.0) * 0.55;
  float lip = smoothstep(1.0, 0.86, h);
  float dust = 0.78 + 0.22 * sin(vW.y * 2.1 - uTime * 0.6 + vW.x * 4.3 + vW.z * 3.1) * sin(vW.y * 0.9 + uTime * 0.35);
  float a = (up + pool) * side * lip * dust * vK * uBeam;
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.70) * a * 0.6, 1.0);
}`;

// the pool of daylight on the hall floor round the foot of a shaft that reaches it (a tunnel on the floor has no plush under it to light, so the floor gets a patch of light:
// one quad per air cell at floor level, the four corner values the average of the cells that meet there, so it fades smoothly and stops at the walls, doors and plush)
const poolVert = /* glsl */ `
attribute vec4 aC;
varying vec2 vUv; varying vec4 vC;
void main(){
  vUv = position.xz + 0.5; vC = aC;
  vec4 mv = viewMatrix * instanceMatrix * vec4(position, 1.0);
  float d = length(mv.xyz);
  mv.xyz *= max(0.2, (d - 0.32) / d);   // 32 cm toward the eye along the line of sight (same place on the screen): the hall floor is one plane 9.8 km wide, whose depth is only good to a few decimetres, and would hide a patch lying on it
  gl_Position = projectionMatrix * mv;
}`;
const poolFrag = /* glsl */ `
precision highp float;
uniform float uPool;
varying vec2 vUv; varying vec4 vC;
void main(){
  float v = mix(mix(vC.x, vC.y, vUv.x), mix(vC.z, vC.w, vUv.x), vUv.y);
  gl_FragColor = vec4(vec3(1.0, 0.94, 0.74) * v * v * uPool, 1.0);
}`;

export class LightShafts {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aK = new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1); this.aK.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aK', this.aK);
    this.uBeam = { value: 0 };
    const mat = new THREE.ShaderMaterial({ uniforms: { uBeam: this.uBeam, uTime: U.uTime }, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, mat, CAP);
    this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    scene.add(this.mesh);
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(POOL_CAP * 4), 4); this.aC.setUsage(THREE.DynamicDrawUsage);
    pg.setAttribute('aC', this.aC);
    this.uPool = { value: 0 };
    const pm = new THREE.ShaderMaterial({ uniforms: { uPool: this.uPool }, vertexShader: poolVert, fragmentShader: poolFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.pool = new THREE.InstancedMesh(pg, pm, POOL_CAP);
    this.pool.count = 0; this.pool.visible = false; this.pool.frustumCulled = false; this.pool.renderOrder = 3;
    scene.add(this.pool);
    this.scratch = HL.makeScratch();
    this.world = null; this.rev = -1; this.ci = 0; this.ck = 0; this.age = 99; this.list = []; this.beams = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
  }

  // the sheets: connected hole columns (eight way) make one shaft
  refresh(w, ci, ck) {
    const cols = HL.findHoles(w, ci, ck, 32, this.list);
    const seen = new Set(), key = (c) => c.k * 16384 + c.i, byKey = new Map(cols.map((c) => [key(c), c]));
    const beams = [];
    for (const c of cols) {
      if (seen.has(key(c))) continue;
      const stack = [c]; seen.add(key(c));
      let i0 = c.i, i1 = c.i, k0 = c.k, k1 = c.k, t = c.t, rim = c.rim, kk = 0, n = 0;
      while (stack.length) {
        const q = stack.pop(); n++;
        if (q.i < i0) i0 = q.i; if (q.i > i1) i1 = q.i; if (q.k < k0) k0 = q.k; if (q.k > k1) k1 = q.k;
        if (q.t < t) t = q.t; if (q.rim > rim) rim = q.rim; kk += HL.strength(q.rim - q.t);
        for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
          const o = byKey.get((q.k + dk) * 16384 + q.i + di);
          if (o && !seen.has(key(o))) { seen.add(key(o)); stack.push(o); }
        }
      }
      const ex = (i1 - i0 + 1) * C, ez = (k1 - k0 + 1) * C;
      beams.push({ x: (cellX(i0) + cellX(i1)) / 2, z: (cellZ(k0) + cellZ(k1)) / 2, y0: t * C, y1: rim * C + 0.25, wd: Math.hypot(ex, ez) * 0.85 + 0.1, k: kk / n });
    }
    beams.sort((a, b) => (a.x - cellX(ci)) ** 2 + (a.z - cellZ(ck)) ** 2 - (b.x - cellX(ci)) ** 2 - (b.z - cellZ(ck)) ** 2);
    this.beams = beams.slice(0, CAP);
    const m = this._m, q = this._q, s = this._s, p = this._p;
    this.beams.forEach((b, n) => {
      const ht = b.y1 - b.y0;
      p.set(b.x, b.y0 + ht / 2, b.z); s.set(b.wd, ht, 1);
      m.compose(p, q.identity(), s); this.mesh.setMatrixAt(n, m); this.aK.array[n] = b.k;
    });
    this.mesh.count = this.beams.length;
    this.mesh.instanceMatrix.needsUpdate = true; this.aK.needsUpdate = true;
    this.refreshPool(w);
    this.world = w; this.ci = ci; this.ck = ck; this.age = 0;
  }

  // the floor pool: the level 0 light of every window that holds a shaft reaching the floor
  refreshPool(w) {
    const cells = new Map(), done = new Set();
    for (const b of this.beams.slice(0, 8)) {
      const ci = toI(b.x), ck = toK(b.z), wk = (ck >> 4) * 4096 + (ci >> 4);
      if (b.y0 > 0 || done.has(wk)) continue;
      done.add(wk);
      const S = HL.windowFor(w, (ci >> 4) * 16, 1, (ck >> 4) * 16, this.scratch, 0);
      if (!S.hf) continue;
      const Wd = S.Wd;
      for (let z = 1; z < Wd - 1; z++) for (let x = 1; x < Wd - 1; x++) {
        const v = S.hf[z * Wd + x]; if (v <= 0) continue;
        const key = (S.kb + z) * 16384 + S.ib + x; if ((cells.get(key) || 0) < v) cells.set(key, v);
      }
    }
    const val = (i, k) => cells.get(k * 16384 + i) || 0, air = (i, k) => w.get(i, 0, k) === 0;
    const corner = (a, b, c, d) => { let s = 0, n = 0; for (const q of [a, b, c, d]) if (air(q[0], q[1])) { s += val(q[0], q[1]); n++; } return n ? s / n : 0; };
    const m = this._m, q = this._q, sc = this._s, p = this._p;
    let n = 0;
    for (const [key] of cells) {
      if (n >= POOL_CAP) break;
      const i = key % 16384, k = (key - i) / 16384;
      const c00 = corner([i - 1, k - 1], [i, k - 1], [i - 1, k], [i, k]), c10 = corner([i, k - 1], [i + 1, k - 1], [i, k], [i + 1, k]);
      const c01 = corner([i - 1, k], [i, k], [i - 1, k + 1], [i, k + 1]), c11 = corner([i, k], [i + 1, k], [i, k + 1], [i + 1, k + 1]);
      if (Math.max(c00, c10, c01, c11) < 0.01) continue;
      p.set(cellX(i), 0.03, cellZ(k)); sc.set(C, 1, C); m.compose(p, q.identity(), sc); this.pool.setMatrixAt(n, m);
      this.aC.array[n * 4] = c00; this.aC.array[n * 4 + 1] = c10; this.aC.array[n * 4 + 2] = c01; this.aC.array[n * 4 + 3] = c11; n++;
    }
    this.pool.count = n; this.pool.instanceMatrix.needsUpdate = true; this.aC.needsUpdate = true;
  }

  // k: how much beam to show (0..1): the hall level, and none in the daylit hall
  update(w, rev, camPos, dt, k, lv = k) {
    this.age += dt;
    const ci = toI(camPos.x), ck = toK(camPos.z);
    if (w !== this.world || rev !== this.rev || this.age > 2 || Math.abs(ci - this.ci) > 5 || Math.abs(ck - this.ck) > 5) { this.rev = rev; this.refresh(w, ci, ck); }
    this.uBeam.value = k;
    this.mesh.visible = this.beams.length > 0 && k > 0.004;
    this.uPool.value = lv * 0.5;
    this.pool.visible = this.pool.count > 0 && lv > 0.004;
  }
}
