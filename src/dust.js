import { cellX, cellY, cellZ, toI, toJ, toK } from './config.js';

// ---------------------------------------------------------------------------------------------------
// Dust. Every plush pulled out of the pile, every collapse and every machine cut puts dust into the air
// of the tunnel. It lingers where the air is trapped, leaks out into open space, and is cleared by
// powered fans. Breathing it builds up "lung load" until you cough, slow down and eventually pass out.
// ---------------------------------------------------------------------------------------------------
const SX = 3, SY = 2.4;

// ---- stale air: the deeper the tunnel, the worse the air in it, unless fans are pushing fresh air in ----
// stale(d) climbs from 0 at 150 m to 1 at 1050 m deep. A support fan throws fresh air up to FAN_R metres down the tunnel, and the
// fresh share falls off linearly with distance, so just short of the next fan along the tunnel the stale level is stale(d) * s / FAN_R
// (s = spacing). Staying under STALE_OK (just below the cough threshold) therefore needs
//     spacing <= STALE_OK * FAN_R / stale(d)       and for a tunnel of length L at depth d:  fans = ceil(L / spacing)
export const STALE_START = 150, STALE_SPAN = 900, FAN_R = 20, STALE_OK = 0.25, VENT_R = 14;
export const staleAt = (depth) => Math.max(0, Math.min(1, (depth - STALE_START) / STALE_SPAN));
// metres between support fans that keeps the air breathable at this depth (Infinity: no fans needed yet)
export const fanSpacing = (depth) => { const S = staleAt(depth); return S <= STALE_OK ? Infinity : (STALE_OK * FAN_R) / S; };
export const fansNeeded = (depth, length) => { const s = fanSpacing(depth); return isFinite(s) ? Math.ceil(length / s) : 0; };
const K = (ix, iy, iz) => (iy + 64) * 1e10 + (iz + 40000) * 1e5 + (ix + 40000);

export class Dust {
  constructor(game) {
    this.game = game;
    this.cells = new Map();
    this.t = 0;
    this.lung = 0;
    this.level = 0;
    this.coughT = 4;
  }

  clear() { this.cells.clear(); this.lung = 0; this.level = 0; this.recover = 0; this.hostLevel = 0; this.coughT = 4; }

  add(x, y, z, a) {
    if (this.game.isGuest && this.game.isGuest()) return;   // the dust field is simulated on the host only (a guest breathes what the host says is at its head)
    const ix = Math.floor(x / SX), iy = Math.floor(y / SY), iz = Math.floor(z / SX);
    const k = K(ix, iy, iz);
    const v = (this.cells.get(k) || 0) + a;
    this.cells.set(k, Math.min(2, v));
  }

  at(x, y, z) {
    return this.cells.get(K(Math.floor(x / SX), Math.floor(y / SY), Math.floor(z / SX))) || 0;
  }

  decode(k) {
    const ix = (k % 1e5) - 40000;
    const iz = (Math.floor(k / 1e5) % 1e5) - 40000;
    const iy = Math.floor(k / 1e10) - 64;
    return [ix, iy, iz];
  }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    const step = 0.5;
    this.t = step;
    const g = this.game, w = g.world;
    const fans = [];
    const mfans = [];
    for (const t of g.logi.tiles.values()) if (t.type === 'fan' && t.pw > 0.15) { if (t.mounted) mfans.push([t.px, t.py, t.pz, t.pw, t.fx, t.fz]); else fans.push([cellX(t.i), t.j * 0.6 + 0.8, cellZ(t.k), t.pw]); }
    const next = new Map();
    const bump = (k, a) => { next.set(k, (next.get(k) || 0) + a); };
    for (const [k, v] of this.cells) {
      const [ix, iy, iz] = this.decode(k);
      const cx = (ix + 0.5) * SX, cy = (iy + 0.5) * SY, cz = (iz + 0.5) * SX;
      const i = toI(cx), j = toJ(cy), kk = toK(cz);
      const open = j >= w.topAt(i, kk);                 // sky above: dust spreads into the hall and vanishes
      let decay = 0.012 + (open ? 0.35 : 0);
      for (const f of fans) {
        const d = Math.hypot(f[0] - cx, f[1] - cy, f[2] - cz);
        if (d < 14) decay += 0.45 * f[3] * (1 - d / 14);
      }
      // a support fan drives fresh air down the tunnel the way it faces: strong in the cone in front of it, a little behind
      for (const f of mfans) {
        const rx = cx - f[0], ry = cy - f[1], rz = cz - f[2], d = Math.hypot(rx, ry, rz); if (d > 22) continue;
        const along = (rx * f[4] + rz * f[5]) / (d || 1);
        if (along > 0.3 && d < 20) decay += 1.2 * f[3] * (1 - d / 20) * Math.min(1, (along - 0.3) / 0.4);
        else if (d < 6) decay += 0.3 * f[3] * (1 - d / 6);
      }
      let nv = v * Math.exp(-decay * step);
      // leak toward empty neighbours
      const share = nv * 0.05;
      let out = 0;
      for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
        const ni = toI(cx + a * SX), nj = toJ(cy + b * SY), nk = toK(cz + c * SX);
        if (!w.solid(ni, nj, nk)) { bump(K(ix + a, iy + b, iz + c), share * 0.5); out += share * 0.5; }
      }
      nv -= out;
      if (nv > 0.004) bump(k, nv);
    }
    this.cells = next;
    if (this.cells.size > 4000) {
      // drop the faintest
      const arr = [...this.cells.entries()].sort((a, b) => a[1] - b[1]).slice(this.cells.size - 3000);
      this.cells = new Map(arr);
    }
  }

  // how bad the air is where the head is: deep enclosed tunnels go stale, fresh air from powered fans cancels it
  stale(head) {
    const g = this.game, w = g.world; if (!w) return 0;
    const depth = Math.hypot(head.x, head.z), S = staleAt(depth); if (S <= 0) return 0;
    if (toJ(head.y) >= w.topAt(toI(head.x), toK(head.z))) return 0;   // open to the hall: the air is fine
    // fans: refresh the list twice a second
    if (!(this._fanNext > g.time)) { this._fanNext = g.time + 0.5; this._fans = []; for (const t of g.logi.tiles.values()) if (t.type === 'fan' && t.pw > 0.15) this._fans.push(t.mounted ? { x: t.px, y: t.py, z: t.pz, pw: t.pw, fx: t.fx, fz: t.fz } : { x: cellX(t.i), y: t.j * 0.6 + 0.8, z: cellZ(t.k), pw: t.pw }); }
    let stale = 1;
    for (const f of this._fans) {
      const rx = head.x - f.x, ry = head.y - f.y, rz = head.z - f.z, d = Math.hypot(rx, ry, rz); let q = 0;
      if (f.fx !== undefined && d < 1.5) q = f.pw; // right under the fan the air is moving fully
      else if (f.fx !== undefined) { const along = (rx * f.fx + rz * f.fz) / (d || 1); if (along > 0.3 && d < FAN_R) q = f.pw * (1 - d / FAN_R) * Math.min(1, (along - 0.3) / 0.4); else if (d < 6) q = 0.3 * f.pw * (1 - d / 6); }
      else if (d < VENT_R) q = 0.6 * f.pw * (1 - d / VENT_R);
      stale *= 1 - Math.min(1, q);
    }
    return S * stale;
  }

  // called every frame with the player's head position. Returns lung-related effects.
  breathe(dt, head, T) {
    if (!Number.isFinite(this.lung)) this.lung = 0; if (!Number.isFinite(this.level)) this.level = 0;
    const d = Math.max(this.at(head.x, head.y, head.z), this.hostLevel || 0, this.stale(head));
    this.level += (d - this.level) * Math.min(1, dt * 3);
    const resist = 1 - 0.2 * T.resp;
    const rec = this.recover > 0 ? 0.25 : 1; if (this.recover > 0) this.recover -= dt; // just woken up: your lungs forgive a lot for a minute
    if (this.level > 0.3) this.lung = Math.min(1.05, this.lung + (this.level - 0.25) * 0.045 * resist * dt * 6 * rec);
    else if (this.level < 0.12) this.lung = Math.max(0, this.lung - 0.04 * dt * (1 + T.resp * 0.3));
    return this.lung;
  }
}
