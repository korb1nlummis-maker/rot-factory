import { C, NX, NY, NZ, RC, HALL_HX, HALL_HZ, HALL_H, cellX, cellY, cellZ, toI, toJ, toK } from './config.js';
import { h32, quatFromHash } from './util.js';
import { NEEDLE } from './plushdata.js';

const RB = 0.3; // loose plush radius
const CAP = 2600;
const HSIZE = 16384;

// Resolve a sphere against the plush lattice. Mutates pos. Returns contact info in out.
export function resolveSphere(world, pos, r, out) {
  const R = r + RC, R2 = R * R;
  const ci = toI(pos.x), cj = toJ(pos.y), ck = toK(pos.z);
  let nx = 0, ny = 0, nz = 0, hits = 0, deep = 0, bestPen = -1;
  for (let dk = -1; dk <= 1; dk++) {
    const k = ck + dk;
    if (k < 0 || k >= NZ) continue;
    for (let dj = -1; dj <= 1; dj++) {
      const j = cj + dj;
      if (j < 0 || j >= NY) continue;
      for (let di = -1; di <= 1; di++) {
        const i = ci + di;
        if (i < 0 || i >= NX) continue;
        if (world.get(i, j, k) === 0) continue;
        const dx = pos.x - cellX(i), dy = pos.y - cellY(j), dz = pos.z - cellZ(k);
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= R2) continue;
        let d = Math.sqrt(d2);
        let ux, uy, uz;
        if (d < 0.14) {
          // deep inside: escape through the nearest open face
          let best = -1, bx = 0, by = 1, bz = 0;
          const ax = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
          for (const a of ax) {
            if (!world.solid(i + a[0], j + a[1], k + a[2])) {
              const s = dx * a[0] + dy * a[1] + dz * a[2] + (a[1] > 0 ? 0.05 : 0);
              if (s > best) { best = s; bx = a[0]; by = a[1]; bz = a[2]; }
            }
          }
          ux = bx; uy = by; uz = bz;
          deep++;
          d = 0;
        } else { ux = dx / d; uy = dy / d; uz = dz / d; }
        const pen = (R - d) * 0.92;
        if (pen > bestPen) { bestPen = pen; out.ci = i; out.cj = j; out.ck = k; }
        pos.x += ux * pen; pos.y += uy * pen; pos.z += uz * pen;
        nx += ux; ny += uy; nz += uz; hits++;
      }
    }
  }
  out.hits = hits; out.deep = deep;
  if (hits) {
    const l = Math.hypot(nx, ny, nz) || 1;
    out.nx = nx / l; out.ny = ny / l; out.nz = nz / l;
  } else { out.nx = 0; out.ny = 0; out.nz = 0; }
  return hits;
}

export class Sim {
  constructor(world) {
    this.world = world;
    this.n = 0;
    this.x = new Float32Array(CAP); this.y = new Float32Array(CAP); this.z = new Float32Array(CAP);
    this.vx = new Float32Array(CAP); this.vy = new Float32Array(CAP); this.vz = new Float32Array(CAP);
    this.q = new Float32Array(CAP * 4);
    this.sp = new Uint16Array(CAP); this.vr = new Uint8Array(CAP);
    this.rest = new Float32Array(CAP); this.age = new Float32Array(CAP);
    this.flag = new Uint8Array(CAP); // 1 thrown, 2 from collapse
    this.ox = new Float32Array(CAP); this.oz = new Float32Array(CAP);
    this.sq = new Float32Array(CAP); // squash amount, set on hard impacts
    this.bid = new Uint32Array(CAP); this.own = new Uint8Array(CAP); this.idc = 1; // stable ids for syncing, and who threw it (0 host, 1 guest)
    this.spawnHook = null;
    this.head = new Int32Array(HSIZE); this.next = new Int32Array(CAP);
    this.contact = { hits: 0, nx: 0, ny: 0, nz: 0, deep: 0 };
    this.colliders = []; // {x,z,r,h}
    this.bin = null;     // {x,z}
    this.player = null;  // {spheres: () => [{x,y,z,r}], vel}
    this.hooks = {};
    this.qt = [0, 0, 0, 0];
  }

  get count() { return this.n; }

  spawn(sp, vr, x, y, z, vx = 0, vy = 0, vz = 0, flag = 0, own = 0) {
    if (this.spawnHook) { const r = this.spawnHook(sp, vr, x, y, z, vx, vy, vz, flag); if (r !== undefined) return r; }
    this.lastIndex = -1;
    if (this.n >= CAP) return -1;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    quatFromHash(h32(sp, vr, i, (x * 100) | 0) >>> 0, this.qt);
    this.q[i * 4] = this.qt[0]; this.q[i * 4 + 1] = this.qt[1]; this.q[i * 4 + 2] = this.qt[2]; this.q[i * 4 + 3] = this.qt[3];
    this.sp[i] = sp; this.vr[i] = vr; this.rest[i] = 0; this.age[i] = 0; this.flag[i] = flag;
    this.ox[i] = x; this.oz[i] = z; this.sq[i] = 0;
    this.bid[i] = this.idc++; this.own[i] = own;
    return i;
  }

  remove(i) {
    const l = --this.n;
    if (i !== l) {
      this.x[i] = this.x[l]; this.y[i] = this.y[l]; this.z[i] = this.z[l];
      this.vx[i] = this.vx[l]; this.vy[i] = this.vy[l]; this.vz[i] = this.vz[l];
      for (let t = 0; t < 4; t++) this.q[i * 4 + t] = this.q[l * 4 + t];
      this.sp[i] = this.sp[l]; this.vr[i] = this.vr[l]; this.rest[i] = this.rest[l]; this.age[i] = this.age[l]; this.flag[i] = this.flag[l]; this.ox[i] = this.ox[l]; this.oz[i] = this.oz[l]; this.sq[i] = this.sq[l]; this.bid[i] = this.bid[l]; this.own[i] = this.own[l];
    }
  }

  indexOfId(id) { for (let i = 0; i < this.n; i++) if (this.bid[i] === id) return i; return -1; }

  // ray vs loose bodies; returns {i, t} or null
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null, bt = maxT;
    for (let i = 0; i < this.n; i++) {
      const cx = this.x[i] - ox, cy = this.y[i] - oy, cz = this.z[i] - oz;
      const t = cx * dx + cy * dy + cz * dz;
      if (t < 0 || t > bt) continue;
      const px = cx - dx * t, py = cy - dy * t, pz = cz - dz * t;
      if (px * px + py * py + pz * pz < 0.1) { bt = t; best = i; }
    }
    return best === null ? null : { i: best, t: bt };
  }

  hashKey(x, y, z) {
    const a = Math.floor(x / 0.62), b = Math.floor(y / 0.62), c = Math.floor(z / 0.62);
    return ((Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) >>> 0) & (HSIZE - 1);
  }

  step(dtFrame) {
    if (!this.n) return;
    const sub = dtFrame > 1 / 50 ? 3 : 2;
    const dt = Math.min(dtFrame, 1 / 20) / sub;
    for (let s = 0; s < sub; s++) this.substep(dt);
  }

  substep(dt) {
    const w = this.world, n = this.n;
    const cont = this.contact;
    const pos = { x: 0, y: 0, z: 0 };
    const ps = this.player ? this.player.spheres() : [];
    // integrate + environment collisions
    for (let i = 0; i < n; i++) {
      let vx = this.vx[i], vy = this.vy[i], vz = this.vz[i];
      vy -= 16 * dt;
      const drag = 1 - 0.25 * dt;
      vx *= drag; vy *= drag; vz *= drag;
      pos.x = this.x[i] + vx * dt; pos.y = this.y[i] + vy * dt; pos.z = this.z[i] + vz * dt;
      this.age[i] += dt;
      if (this.sq[i] > 0.002) this.sq[i] *= Math.exp(-11 * dt); else this.sq[i] = 0;
      // lattice
      for (let it = 0; it < 2; it++) {
        if (resolveSphere(w, pos, RB, cont)) {
          const vn = vx * cont.nx + vy * cont.ny + vz * cont.nz;
          if (vn < 0) {
            const e = Math.abs(vn) > 3 ? 0.18 : 0.02;
            vx -= (1 + e) * vn * cont.nx; vy -= (1 + e) * vn * cont.ny; vz -= (1 + e) * vn * cont.nz;
            const f = Math.max(0, 1 - 6 * dt);
            // friction on tangential component
            const tn = vx * cont.nx + vy * cont.ny + vz * cont.nz;
            const tx = vx - tn * cont.nx, ty = vy - tn * cont.ny, tz = vz - tn * cont.nz;
            vx = tn * cont.nx + tx * f; vy = tn * cont.ny + ty * f; vz = tn * cont.nz + tz * f;
            if (vn < -1.5) this.sq[i] = Math.max(this.sq[i], Math.min(0.32, -vn * 0.045));
            if (vn < -4 && this.hooks.onImpact) this.hooks.onImpact(pos.x, pos.y, pos.z, -vn);
            if (vn < -3 && this.hooks.onKick) this.hooks.onKick(cont.ci, cont.cj, cont.ck, vx, vy, vz, -vn);
          }
        }
      }
      // floor / walls / ceiling
      if (pos.y < RB) { pos.y = RB; if (vy < 0) { if (vy < -4 && this.hooks.onImpact) this.hooks.onImpact(pos.x, pos.y, pos.z, -vy); vy *= -0.1; } const f = Math.max(0, 1 - 5 * dt); vx *= f; vz *= f; }
      if (pos.y > HALL_H - RB) { pos.y = HALL_H - RB; if (vy > 0) vy = 0; }
      if (pos.x > HALL_HX - RB) { pos.x = HALL_HX - RB; vx = Math.min(0, vx); }
      if (pos.x < -HALL_HX + RB) { pos.x = -HALL_HX + RB; vx = Math.max(0, vx); }
      if (pos.z > HALL_HZ - RB) { pos.z = HALL_HZ - RB; vz = Math.min(0, vz); }
      if (pos.z < -HALL_HZ + RB) { pos.z = -HALL_HZ + RB; vz = Math.max(0, vz); }
      // static cylinders (bin, terminal, crates)
      for (const c of this.colliders) {
        if (pos.y > c.h + RB) continue;
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const d = Math.hypot(dx, dz);
        if (c === this.binCol) continue;
        if (d < c.r + RB) {
          const k = (c.r + RB - d) / (d || 1);
          pos.x += dx * k; pos.z += dz * k;
          const vn = (vx * dx + vz * dz) / (d || 1);
          if (vn < 0) { vx -= 1.3 * vn * dx / (d || 1); vz -= 1.3 * vn * dz / (d || 1); }
        }
      }
      // bin
      const b = this.bin;
      if (b) {
        const dx = pos.x - b.x, dz = pos.z - b.z;
        const d = Math.hypot(dx, dz);
        const bc = this.binCatch || 0;
        if (d <= 0.86 + bc && pos.y < 1.0 + bc * 0.7 && pos.y > 0.2 && this.hooks.onBin && (d <= 0.86 || pos.y > 0.7)) {
          this.hooks.onBin(i, pos.x, pos.y, pos.z);
          this.flag[i] = 99;
          pos.y = -100;
        } else if (pos.y < 1.2 + RB) {
          if (d > 0.86 && d < 1.02 + RB) {
            const from = Math.hypot(this.x[i] - b.x, this.z[i] - b.z);
            const target = from > 0.94 ? 1.02 + RB : 0.86 - RB;
            if (from > 0.94 || pos.y < 1.2) {
              const k = (target - d) / (d || 1);
              pos.x += dx * k; pos.z += dz * k;
              const nvx = dx / (d || 1), nvz = dz / (d || 1);
              const vn = vx * nvx + vz * nvz;
              if ((from > 0.94 && vn < 0) || (from <= 0.94 && vn > 0)) { vx -= 1.4 * vn * nvx; vz -= 1.4 * vn * nvz; }
            }
          }
          if (pos.y > 0 && d <= 0.86 && pos.y < 0.3) pos.y = 0.3;
        }
      }
      this.x[i] = pos.x; this.y[i] = pos.y; this.z[i] = pos.z;
      this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
      // roll
      const sp2 = vx * vx + vz * vz;
      if (sp2 > 0.04) {
        const sp1 = Math.sqrt(sp2), ang = sp1 * dt / RB;
        const ax = vz / sp1, az = -vx / sp1;
        const hs = Math.sin(ang / 2), cs = Math.cos(ang / 2);
        const o = i * 4, qx = this.q[o], qy = this.q[o + 1], qz = this.q[o + 2], qw = this.q[o + 3];
        const rx = ax * hs, rz = az * hs;
        // r * q
        this.q[o] = cs * qx + rx * qw + 0 * qz - rz * qy;
        this.q[o + 1] = cs * qy + 0 * qw + rz * qx - rx * qz;
        this.q[o + 2] = cs * qz + rz * qw + rx * qy - 0 * qx;
        this.q[o + 3] = cs * qw - rx * qx - rz * qz;
        const l = Math.hypot(this.q[o], this.q[o + 1], this.q[o + 2], this.q[o + 3]) || 1;
        this.q[o] /= l; this.q[o + 1] /= l; this.q[o + 2] /= l; this.q[o + 3] /= l;
      }
    }
    // body-body
    this.head.fill(-1);
    for (let i = 0; i < n; i++) {
      const h = this.hashKey(this.x[i], this.y[i], this.z[i]);
      this.next[i] = this.head[h]; this.head[h] = i;
    }
    const D = 2 * RB, D2 = D * D;
    for (let i = 0; i < n; i++) {
      const ax = this.x[i], ay = this.y[i], az = this.z[i];
      const ca = Math.floor(ax / 0.62), cb = Math.floor(ay / 0.62), cc = Math.floor(az / 0.62);
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) for (let dc = -1; dc <= 1; dc++) {
        const h = ((Math.imul(ca + da, 73856093) ^ Math.imul(cb + db, 19349663) ^ Math.imul(cc + dc, 83492791)) >>> 0) & (HSIZE - 1);
        for (let j = this.head[h]; j !== -1; j = this.next[j]) {
          if (j <= i) continue;
          const dx = this.x[j] - ax, dy = this.y[j] - ay, dz = this.z[j] - az;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= D2 || d2 < 1e-8) continue;
          const d = Math.sqrt(d2), k = (D - d) / d * 0.5;
          this.x[i] -= dx * k; this.y[i] -= dy * k; this.z[i] -= dz * k;
          this.x[j] += dx * k; this.y[j] += dy * k; this.z[j] += dz * k;
          const nx = dx / d, ny = dy / d, nz = dz / d;
          const rv = (this.vx[j] - this.vx[i]) * nx + (this.vy[j] - this.vy[i]) * ny + (this.vz[j] - this.vz[i]) * nz;
          if (rv < 0) {
            const imp = -rv * 0.5 * 1.05;
            this.vx[i] -= nx * imp; this.vy[i] -= ny * imp; this.vz[i] -= nz * imp;
            this.vx[j] += nx * imp; this.vy[j] += ny * imp; this.vz[j] += nz * imp;
          }
          // mutual friction keeps heaps from sliding forever
          const f = Math.max(0, 1 - 2.5 * dt);
          this.vx[i] *= f; this.vz[i] *= f; this.vx[j] *= f; this.vz[j] *= f;
        }
      }
    }
    // player
    if (ps.length) {
      for (let i = 0; i < n; i++) {
        for (const sph of ps) {
          const dx = this.x[i] - sph.x, dy = this.y[i] - sph.y, dz = this.z[i] - sph.z;
          const R = RB + sph.r;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= R * R) continue;
          const d = Math.sqrt(d2) || 1e-4, k = (R - d) / d;
          this.x[i] += dx * k; this.y[i] += dy * k; this.z[i] += dz * k;
          const pv = this.player.vel;
          const nx = dx / d, ny = dy / d, nz = dz / d;
          const rv = (this.vx[i] - pv.x) * nx + (this.vy[i] - pv.y) * ny + (this.vz[i] - pv.z) * nz;
          if (rv < 0) {
            this.vx[i] -= 1.1 * rv * nx; this.vy[i] -= 1.1 * rv * ny; this.vz[i] -= 1.1 * rv * nz;
            if (rv < -3 && this.hooks.onPlayerHit) this.hooks.onPlayerHit(-rv);
          }
        }
      }
    }
    // consumed + settle
    for (let i = this.n - 1; i >= 0; i--) {
      if (this.flag[i] === 99) { this.remove(i); continue; }
      const sp2 = this.vx[i] ** 2 + this.vy[i] ** 2 + this.vz[i] ** 2;
      if (sp2 < 0.25) this.rest[i] += dt; else this.rest[i] = 0;
      if (this.rest[i] > 0.7 || (this.age[i] > 6 && this.rest[i] > 0.2)) {
        if (this.tryFreeze(i)) this.remove(i);
        else if (this.rest[i] > 1.8) { this.vx[i] += (Math.random() - 0.5) * 2; this.vy[i] += 2.2; this.vz[i] += (Math.random() - 0.5) * 2; this.rest[i] = 0.3; }
      }
    }
  }

  tryFreeze(i) {
    const w = this.world;
    if (this.y[i] < RB - 0.01) return false;
    const ci = toI(this.x[i]), cj = toJ(this.y[i]), ck = toK(this.z[i]);
    let best = null, bd = 1e9;
    const ps = this.player ? this.player.spheres() : [];
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = ci + di, b = cj + dj, c = ck + dk;
      if (!w.inside(a, b, c) || w.get(a, b, c) !== 0 || w.reserved.has((b * NZ + c) * NX + a)) continue;
      if (!w.solid(a, b - 1, c)) continue;
      const cx = cellX(a), cy = cellY(b), cz = cellZ(c);
      let blocked = false;
      for (const s of ps) { if ((cx - s.x) ** 2 + (cy - s.y) ** 2 + (cz - s.z) ** 2 < (s.r + 0.34) ** 2) { blocked = true; break; } }
      if (blocked) continue;
      const d = (cx - this.x[i]) ** 2 + (cy - this.y[i]) ** 2 + (cz - this.z[i]) ** 2;
      if (d < bd) { bd = d; best = [a, b, c]; }
    }
    if (!best || bd > 0.55 * 0.55) return false;
    if (this.sp[i] === NEEDLE) w.needle = { i: best[0], j: best[1], k: best[2] };
    w.setCell(best[0], best[1], best[2], this.sp[i], this.vr[i]);
    return true;
  }
}
