import { cellX, cellY, cellZ, NX, NZ } from './config.js';
import { isSpecialCell } from './plushdata.js';

// ---------------------------------------------------------------------------------------------
// Granular slides. The pile has an angle of repose: a surface plush with a drop beside it can topple
// into the gap. Whenever a plush leaves a cell (dug out, kicked, landed on, blasted) the cells around
// it are re-checked, and every plush that topples or lands re-checks ITS neighbours, so one slip on a
// steep face becomes a rockslide that keeps feeding itself while the slope is steeper than the pile
// can hold. Energy fades as it spreads; compacted, buried plush resist.
// ---------------------------------------------------------------------------------------------
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const key = (i, j, k) => (j * NZ + k) * NX + i;

export class Slides {
  constructor(game) {
    this.g = game;
    this.q = new Map(); // key -> { i, j, k, e }
    this.recent = 0;    // topples in the last moments, drives the rumble
    this.cool = 0;
    this.active = 0;
  }

  clear() { this.q.clear(); this.recent = 0; }

  trigger(i, j, k, e = 1) {
    if (this.q.size > 5000) return;
    for (const [a, b, c] of [[0, 0, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 2, 0], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]]) this.add(i + a, j + b, k + c, e * (b ? 0.95 : 1));
  }

  add(i, j, k, e) {
    const id = key(i, j, k), o = this.q.get(id);
    if (o) { if (e > o.e) o.e = e; } else this.q.set(id, { i, j, k, e });
  }

  update(dt) {
    this.recent = Math.max(0, this.recent - dt * 3);
    if (!this.q.size) { this.active = Math.max(0, this.active - dt); return; }
    const g = this.g, w = g.world;
    let budget = 36;
    const batch = [];
    for (const [id, c] of this.q) { batch.push(c); this.q.delete(id); if (batch.length >= budget) break; }
    for (const c of batch) {
      if (c.e < 0.22) continue;
      const { i, j, k } = c;
      const sp = w.get(i, j, k);
      if (!sp || isSpecialCell(sp) || j <= 0) continue;
      if (w.reserved && w.reserved.has((j * NZ + k) * NX + i)) continue;
      // buried plush are held by the weight on them; only a violent slide frees them
      const over = Math.max(0, w.topAt(i, k) - j - 1);
      const hold = over * 0.09;
      const e = c.e - hold;
      if (e < 0.2) continue;
      // find the way down: a free side whose floor is also missing
      let best = null, bs = 0;
      for (const [a, b] of DIRS) {
        if (w.solid(i + a, j, k + b)) continue;
        if (w.solid(i + a, j - 1, k + b)) continue;
        let drop = 1;
        if (!w.solid(i + a, j - 2, k + b)) drop = 2;
        if (!w.solid(i + a, j - 2, k + b) && !w.solid(i + a, j - 3, k + b)) drop = 3;
        const sc = drop + Math.random() * 1.2;
        if (sc > bs) { bs = sc; best = { a, b, drop }; }
      }
      if (!best) continue;
      // the pile under a cell that is fully braced from below by neighbours on the far side holds it a bit
      let brace = 0;
      for (const [a, b] of DIRS) if (w.solid(i - a, j, k - b)) brace++;
      const p = Math.min(0.95, (0.16 + 0.34 * e + 0.12 * (best.drop - 1)) * (1 - 0.1 * brace));
      if (Math.random() > p) { if (e > 0.5 && Math.random() < 0.5) this.add(i, j, k, e * 0.8); continue; }
      this.topple(i, j, k, best.a, best.b, e, best.drop);
    }
  }

  topple(i, j, k, a, b, e, drop) {
    const g = this.g, w = g.world;
    const it = w.removeCell(i, j, k, true);
    if (!it) return;
    this.recent += 1;
    this.active = 2;
    g.S.stats.slides = (g.S.stats.slides || 0) + 1;
    const x = cellX(i), y = cellY(j), z = cellZ(k);
    const sp = 1.4 + 1.1 * e + 0.5 * drop;
    if (g.sim.n < 1700) { const bi = g.sim.spawn(it.sp, it.vr, x + a * 0.15, y, z + b * 0.15, a * sp + (Math.random() - 0.5) * 0.6, 0.4, b * sp + (Math.random() - 0.5) * 0.6, 2); if (bi >= 0) g.sim.en[bi] = e * 0.85; }
    else {
      // too many loose bodies: drop it straight to where it would land so the slide keeps going without the cost
      let ni = i + a, nk = k + b, nj = j;
      while (nj > 0 && !w.solid(ni, nj - 1, nk) && nj > j - 6) nj--;
      if (!w.get(ni, nj, nk) && nj >= 0) w.setCell(ni, nj, nk, it.sp, it.vr);
      this.add(ni, nj, nk, e * 0.85);
    }
    if (Math.random() < 0.18) g.fx.dust(x, y, z, 2, 0.5, 0.6);
    // the gap it leaves: the plush above and beside it are now on a steeper face
    const next = e * (0.7 + 0.04 * drop);
    this.trigger(i, j, k, next);
    this.add(i + a, j, k + b, e * 0.5);
    // feel it
    const pd = Math.hypot(x - g.player.pos.x, z - g.player.pos.z);
    if (pd < 22) g.slideFeel(pd);
  }
}
