import * as THREE from 'three';
import { HALL_HX, HALL_HZ, HALL_H, RC, C, cellX, cellY, cellZ, toI, toJ, toK, NX, NZ, NY } from './config.js';
import { resolveSphere } from './sim.js';
import { clamp } from './util.js';

const R = 0.3;

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3(0, 0.5, -1.5);
    this.vel = new THREE.Vector3();
    this.yaw = 0;      // 0 faces +Z in three? we use forward = (sin yaw, 0, cos yaw)
    this.pitch = 0;
    this.crouch = false;
    this.eyeH = 1.55;
    this.onGround = false;
    this.stepOff = 0;
    this.bob = 0;
    this.buried = 0;
    this.embedded = false;
    this.contact = { hits: 0, nx: 0, ny: 0, nz: 0, deep: 0 };
    this.tmp = { x: 0, y: 0, z: 0 };
    this.landVel = 0;
    this.footTimer = 0;
    this.speedNow = 0;
    this.sphereBuf = [{ x: 0, y: 0, z: 0, r: R }, { x: 0, y: 0, z: 0, r: R }, { x: 0, y: 0, z: 0, r: R }];
    this.sphereCount = 3;
    this.events = { land: null, step: null };
    this.shakeAmt = 0;
    this.footCell = null;
    this.walk = null;   // (player) => true when standing on a ramp or stair; installed by build.js
    this.ride = null;   // (player) => true when standing on a lift car (it carries you); installed by transit.js
    this.landSafe = null;   // (player) => true when a fall here does no harm (a Cushion Pad, or a Jump Pad or the plush pile after a launch); installed by transit.js
    this.flight = 0;    // seconds since a Jump Pad threw you (0 = not flying): while it runs your sideways speed is kept, only steered a little
    this.launched = false; this.launchLock = 0; this.liftId = 0;
  }

  offsets() { return this.crouch ? [0.3, 0.72] : [0.3, 0.82, 1.32]; }

  spheres() {
    const o = this.offsets();
    this.sphereCount = o.length;
    for (let i = 0; i < o.length; i++) {
      const s = this.sphereBuf[i];
      s.x = this.pos.x; s.y = this.pos.y + o[i]; s.z = this.pos.z;
    }
    return this.sphereBuf.slice(0, o.length);
  }

  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  eyePos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.eyeH + this.stepOff + Math.sin(this.bob * 2) * 0.018 * Math.min(1, this.speedNow / 3), this.pos.z);
  }

  // max penetration across the body spheres at a candidate position
  penetration(px, py, pz) {
    const o = this.offsets();
    let worst = 0;
    const w = this.world;
    for (const off of o) {
      const x = px, y = py + off, z = pz;
      const ci = toI(x), cj = toJ(y), ck = toK(z);
      const Rr = R + RC;
      for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj, k = ck + dk;
        if (w.get(i, j, k) === 0) continue;
        const d = Math.hypot(x - cellX(i), y - cellY(j), z - cellZ(k));
        if (Rr - d > worst) worst = Rr - d;
      }
    }
    if (py < -0.001) worst = Math.max(worst, -py);
    return worst;
  }

  update(dt, input, stats, sim) {
    dt = Math.min(dt, 1 / 20);
    const w = this.world;
    // crouch
    const wantCrouch = input.crouch;
    if (wantCrouch !== this.crouch) {
      if (wantCrouch) this.crouch = true;
      else if (this.penetration(this.pos.x, this.pos.y + 0.5, this.pos.z) < 0.02 || this.penetration(this.pos.x, this.pos.y, this.pos.z) < 0.02) {
        // stand only if there is headroom
        const prev = this.crouch; this.crouch = false;
        if (this.penetration(this.pos.x, this.pos.y, this.pos.z) > 0.08) this.crouch = prev;
      }
    }
    const targetEye = this.crouch ? 0.95 : 1.55;
    this.eyeH += (targetEye - this.eyeH) * Math.min(1, dt * 12);

    // wish direction
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    let mx = (input.right - input.left), mz = (input.fwd - input.back);
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const wx = fx * mz + rx * mx, wz = fz * mz + rz * mx;
    let speed = stats.walk * (this.crouch ? stats.crouchMul : input.sprint ? 1.55 : 1);
    // squishy ground slows you a little
    if (this.onGround && this.pos.y > 0.6) speed *= 0.92;
    if (this.flight > 0) {
      // thrown by a Jump Pad: the momentum is yours until you land, the keys only steer it a little
      this.flight += dt;
      if (ml > 0) { this.vel.x += wx * 4 * dt; this.vel.z += wz * 4 * dt; }
    } else {
      const accel = this.onGround ? 46 : 9;
      const tx = wx * speed, tz = wz * speed;
      const dvx = tx - this.vel.x, dvz = tz - this.vel.z;
      const dl = Math.hypot(dvx, dvz);
      const maxd = accel * dt;
      if (dl > maxd) { this.vel.x += dvx / dl * maxd; this.vel.z += dvz / dl * maxd; } else { this.vel.x = tx; this.vel.z = tz; }
    }

    this.vel.y -= 21 * dt;
    if (input.jump && this.onGround) { this.vel.y = stats.jump; this.onGround = false; }

    // integrate in small steps
    const total = this.vel.length() * dt;
    const steps = Math.max(1, Math.ceil(total / 0.12));
    const sdt = dt / steps;
    let grounded = false;
    let blockedH = false;
    this.embedded = false;
    for (let s = 0; s < steps; s++) {
      const ox = this.pos.x, oz = this.pos.z;
      this.pos.x += this.vel.x * sdt;
      this.pos.y += this.vel.y * sdt;
      this.pos.z += this.vel.z * sdt;
      // collide
      for (let it = 0; it < 3; it++) {
        const o = this.offsets();
        for (let b = 0; b < o.length; b++) {
          const t = this.tmp;
          t.x = this.pos.x; t.y = this.pos.y + o[b]; t.z = this.pos.z;
          const hits = resolveSphere(w, t, R, this.contact);
          if (hits) {
            const dx = t.x - this.pos.x, dy = t.y - this.pos.y - o[b], dz = t.z - this.pos.z;
            this.pos.x += dx; this.pos.y += dy; this.pos.z += dz;
            const c = this.contact;
            const vn = this.vel.x * c.nx + this.vel.y * c.ny + this.vel.z * c.nz;
            if (vn < 0) {
              this.vel.x -= vn * c.nx; this.vel.y -= vn * c.ny; this.vel.z -= vn * c.nz;
            }
            if (c.ny > 0.55 && b === 0) { grounded = true; this.footCell = { i: c.ci, j: c.cj, k: c.ck }; }
            else if (Math.abs(c.ny) < 0.6) blockedH = true;
            if (it === 2 && c.deep > 0) this.embedded = true;
          }
        }
      }
      if (this.pos.y < 0) { this.pos.y = 0; if (this.vel.y < 0) this.vel.y = 0; grounded = true; }
      const hh = HALL_H - (this.crouch ? 1.05 : 1.65);
      if (this.pos.y > hh) { this.pos.y = hh; if (this.vel.y > 0) this.vel.y = 0; }
      this.pos.x = clamp(this.pos.x, -HALL_HX + R, HALL_HX - R);
      this.pos.z = clamp(this.pos.z, -HALL_HZ + R, HALL_HZ - R);
      // walkable surfaces that are not plush cells (build shell ramps and stairs, build.js): the hook lifts the feet onto the slope, keeps its sides solid and says whether you stand on it
      if (this.walk && this.walk(this)) grounded = true;
      // a lift car under the feet carries them (transit.js)
      if (this.ride && this.ride(this)) grounded = true;
      // static props
      if (sim) {
        for (const c of sim.colliders) {
          if (this.pos.y > c.h) continue;
          const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
          const d = Math.hypot(dx, dz), rr = c.r + R;
          if (d < rr) { const k = (rr - d) / (d || 1); this.pos.x += dx * k; this.pos.z += dz * k; blockedH = true; }
        }
        const b = sim.bin;
        if (b && this.pos.y < 1.1) {
          const dx = this.pos.x - b.x, dz = this.pos.z - b.z, d = Math.hypot(dx, dz), rr = 1.12 + R;
          if (d < rr) { const k = (rr - d) / (d || 1); this.pos.x += dx * k; this.pos.z += dz * k; blockedH = true; }
        }
      }
      // step assist
      if (blockedH && grounded && (wx || wz)) {
        const l = Math.hypot(wx, wz) || 1;
        for (const h of [0.66, 0.5]) {
          const nx = this.pos.x + (wx / l) * 0.14, nz = this.pos.z + (wz / l) * 0.14, ny = this.pos.y + h;
          if (this.penetration(nx, ny, nz) < 0.025) {
            this.pos.set(nx, ny, nz);
            this.stepOff -= h;
            this.vel.y = 0;
            break;
          }
        }
      }
      void ox; void oz;
    }
    const wasAir = !this.onGround;
    this.onGround = grounded;
    if (grounded && wasAir && this.landVel < -3.5 && this.events.land) this.events.land(-this.landVel, this.landSafe ? !!this.landSafe(this) : false);
    if (grounded) { if (this.flight > 0.15) { this.flight = 0; this.launched = false; } else if (this.flight === 0 && wasAir) this.launched = false; }   // landed: the flight ends (the first 0.15 s still count as the take off)
    this.landVel = this.vel.y;
    if (grounded && !ml) { this.vel.x *= 0.5; this.vel.z *= 0.5; }
    // camera smoothing offset decays
    this.stepOff += (0 - this.stepOff) * Math.min(1, dt * 10);
    this.speedNow = Math.hypot(this.vel.x, this.vel.z);
    if (grounded && this.speedNow > 0.5) {
      this.bob += dt * this.speedNow * (this.crouch ? 1.6 : 1.9);
      this.footTimer += dt * this.speedNow;
      if (this.footTimer > (this.crouch ? 0.8 : 1.15)) { this.footTimer = 0; if (this.events.step) this.events.step(this.speedNow); }
    }
    this.buried = this.embedded ? this.buried + dt : Math.max(0, this.buried - dt * 2);
  }
}
