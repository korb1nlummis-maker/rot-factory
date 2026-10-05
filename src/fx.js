import * as THREE from 'three';

class Layer {
  constructor(scene, max, additive) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.aStart = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4); this.aCol.setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1); this.aSize.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aCol', this.aCol);
    g.setAttribute('aSize', this.aSize);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vC;
        void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.2, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = smoothstep(0.5, 0.05, r); gl_FragColor = vec4(vC.rgb, vC.a * a); }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.mat = m;
  }
  add(x, y, z, vx, vy, vz, r, g, b, a, size, life, grav, drag, grow) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.aStart[i] = a;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const l = --this.n;
        if (i !== l) {
          for (let t = 0; t < 3; t++) { this.pos[i * 3 + t] = this.pos[l * 3 + t]; this.vel[i * 3 + t] = this.vel[l * 3 + t]; }
          for (let t = 0; t < 4; t++) this.col[i * 4 + t] = this.col[l * 4 + t];
          this.size[i] = this.size[l]; this.life[i] = this.life[l]; this.maxLife[i] = this.maxLife[l];
          this.grav[i] = this.grav[l]; this.drag[i] = this.drag[l]; this.grow[i] = this.grow[l]; this.aStart[i] = this.aStart[l];
        }
        i--; continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = this.life[i] / this.maxLife[i];
      this.col[i * 4 + 3] = this.aStart[i] * Math.min(1, k * 2.2) * Math.min(1, (1 - k) * 12 + 0.2);
      this.size[i] += this.grow[i] * dt;
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}

export class FX {
  constructor(scene) {
    this.norm = new Layer(scene, 6000, false);
    this.add = new Layer(scene, 2500, true);
  }
  setScale(h) { this.norm.mat.uniforms.uScale.value = h * 0.8; this.add.mat.uniforms.uScale.value = h * 0.8; }
  update(dt) { this.norm.update(dt); this.add.update(dt); }

  dust(x, y, z, count = 10, spread = 0.5, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283, s = Math.random() * spread;
      const t = 0.35 + Math.random() * 0.2;
      this.norm.add(x + Math.cos(a) * s * 0.4, y + Math.random() * 0.3, z + Math.sin(a) * s * 0.4,
        Math.cos(a) * s * power, 0.2 + Math.random() * power * 0.9, Math.sin(a) * s * power,
        0.55 * t + 0.28, 0.5 * t + 0.27, 0.42 * t + 0.22, 0.34, 0.22 + Math.random() * 0.3, 1.8 + Math.random() * 1.8, -0.05, 1.3, 0.25);
    }
  }
  fluff(x, y, z, r, g, b, count = 8) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283, u = Math.random() * 2 - 1, s = 0.6 + Math.random() * 1.2;
      this.norm.add(x, y, z, Math.cos(a) * s * (1 - Math.abs(u) * 0.5), u * s + 0.8, Math.sin(a) * s * (1 - Math.abs(u) * 0.5),
        Math.min(1, r * 0.6 + 0.5), Math.min(1, g * 0.6 + 0.5), Math.min(1, b * 0.6 + 0.5), 0.9, 0.05 + Math.random() * 0.06, 0.7 + Math.random() * 0.6, 3.0, 1.2, 0);
    }
  }
  sparkle(x, y, z, count = 14, r = 1, g = 0.85, b = 0.4) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283, u = Math.random() * 2 - 1, s = 0.5 + Math.random() * 2.2;
      this.add.add(x, y, z, Math.cos(a) * s, u * s + 0.6, Math.sin(a) * s, r, g, b, 0.9, 0.04 + Math.random() * 0.06, 0.5 + Math.random() * 0.8, 2.2, 1.6, 0);
    }
  }
  coin(x, y, z, count = 5) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283, s = 0.4 + Math.random();
      this.add.add(x, y, z, Math.cos(a) * s, 2.2 + Math.random() * 1.5, Math.sin(a) * s, 1.6, 1.25, 0.3, 0.95, 0.07, 0.9, 7, 0.8, 0);
    }
  }
  burst(x, y, z, count, r, g, b, speed = 2, size = 0.1, life = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283, u = Math.random() * 2 - 1, s = speed * (0.4 + Math.random() * 0.8), q = Math.sqrt(1 - u * u);
      this.add.add(x, y, z, Math.cos(a) * s * q, u * s, Math.sin(a) * s * q, r, g, b, 0.9, size, life * (0.6 + Math.random() * 0.6), 0.5, 1.2, 0);
    }
  }
}
