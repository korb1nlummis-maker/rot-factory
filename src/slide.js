import { cellX, cellY, cellZ, NX, NZ } from './config.js';
import { isSpecialCell } from './plushdata.js';

// ---------------------------------------------------------------------------------------------
// Granular slides. The pile has an angle of repose: a surface plush with a drop beside it can topple
// into the gap. Whenever a plush leaves a cell (dug out, kicked, landed on, blasted) the cells around
// it are re-checked, and every plush that topples or lands re-checks ITS neighbours, so one slip on a
// steep face becomes a rockslide that keeps feeding itself while the slope is steeper than the pile
// can hold. Energy fades as it spreads; compacted, buried plush resist.
// ---------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------
// THE RULES (so digging feels fair and avalanches are earned):
//  1. Only the open surface slides. Plush with plush above them (tunnel walls, the sides of a hole) are held by the pile.
//  2. A plush only topples toward a gap that is deep enough. How deep depends on how much energy the event carries:
//       calm digging / grabbing / walking low  -> a cliff of 4+ cells (2.4 m)
//       a violent event (hard kick, high climb) -> 3 cells, a big one -> 2, a blast or cave-in -> any drop of 2+
//     So you can dig a hole 2 m deep without it slumping, and a loose mini pile by a machine just sits there.
//  3. Piles under 5 cells (3 m) tall never slide on their own. Floor piles and thrown stacks are safe.
//  4. Props, frames, struts and jacks hold the plush near them (each point of support absorbs energy).
//  5. Energy only ever fades as a slide spreads, and a spot that just toppled rests for a few seconds.
// Energy sources (see game.js): digging 0.4, kicks by speed, climbing by height and load, blasts 2.2, cave-ins 1.6.
// ---------------------------------------------------------------------------------------------
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const key = (i, j, k) => (j * NZ + k) * NX + i;

export class Slides {
  constructor(game) {
    this.g = game;
    this.q = new Map(); // key -> { i, j, k, e }
    this.recent = 0;    // topples in the last moments, drives the rumble
    this.quiet = false;
    this.hot = new Map(); // cells that toppled lately rest for a moment so one spot cannot feed itself
    this.cool = 0;
    this.active = 0;
  }

  // is there a drop beside this cell that would let it topple?
  unstableAt(i, j, k) {
    const w = this.g.world;
    for (const [a, b] of DIRS) if (!w.solid(i + a, j, k + b) && !w.solid(i + a, j - 1, k + b)) return true;
    return false;
  }

  clear() { this.q.clear(); this.hot.clear(); this.recent = 0; }

  trigger(i, j, k, e = 1) {
    if (this.q.size > 5000) return;
    for (const [a, b, c] of [[0, 0, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 2, 0], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]]) this.add(i + a, j + b, k + c, e * (b ? 0.95 : 1));
  }

  // a whole patch of the surface lets go at once (the slope giving way under a climber): seeds every surface plush within r columns
  triggerPatch(i, k, e = 2.6, r = 3) {
    const w = this.g.world;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const d = Math.hypot(a, b); if (d > r + 0.3) continue;
      const t = w.topAt(i + a, k + b); if (t <= 1) continue;
      for (let dj = 1; dj <= 2; dj++) if (t - dj > 0) this.add(i + a, t - dj, k + b, e * (1 - 0.08 * d) * (dj > 1 ? 0.9 : 1));
    }
  }

  add(i, j, k, e) {
    const id = key(i, j, k), o = this.q.get(id);
    if (o) { if (e > o.e) o.e = e; } else this.q.set(id, { i, j, k, e });
  }

  update(dt) {
    this.recent = Math.max(0, this.recent - dt * 3);
    this.burstN = Math.max(0, (this.burstN || 0) - dt * 1.5); this.burstCool = Math.max(0, (this.burstCool || 0) - dt);
    if (this.hot.size > 600) { const now = this.g.time; for (const [k2, t] of this.hot) if (t < now) this.hot.delete(k2); }
    if (!this.q.size) { this.active = Math.max(0, this.active - dt); return; }
    const g = this.g, w = g.world;
    let budget = 36;
    const batch = [];
    for (const [id, c] of this.q) { batch.push(c); this.q.delete(id); if (batch.length >= budget) break; }
    for (const c of batch) {
      if (c.e < 0.22) continue;
      const { i, j, k } = c;
      if (w.topAt(i, k) <= 5 && c.e < 2) continue; // rule 3: short piles never slide
      const sp = w.get(i, j, k);
      if (!sp || isSpecialCell(sp) || j <= 0) continue;
      const rest = this.hot.get(key(i, j, k));
      if (rest && rest > this.g.time) continue;
      if (w.reserved && w.reserved.has((j * NZ + k) * NX + i)) continue;
      // buried plush are held by the weight on them; only a violent slide frees them
      const over = Math.max(0, w.topAt(i, k) - j - 1);
      // roofed plush (walls of a tunnel, anything with plush above it) are held in place by the pile; only the open surface slides.
      // Tunnel roofs are the stability system's job, not the slide engine's.
      const covered = w.solid(i, j + 1, k);
      const sup = w.supportBonus ? w.supportBonus(cellX(i), cellY(j), cellZ(k)) : 0; // rule 4
      const hold = over * 0.2 + (covered ? 1.6 : 0) + sup * 1.2;
      const e = c.e - hold;
      if (e < 0.2) continue;
      // find the way down: a free side whose floor is also missing
      let best = null, bs = 0;
      for (const [a, b] of DIRS) {
        if (w.solid(i + a, j, k + b)) continue;
        if (w.solid(i + a, j - 1, k + b)) continue;
        let drop = 1;
        while (drop < 4 && !w.solid(i + a, j - 1 - drop, k + b)) drop++;
        const sc = drop + Math.random() * 1.2;
        if (sc > bs) { bs = sc; best = { a, b, drop }; }
      }
      if (!best) continue;
      // rule 2: how deep must the gap be for this much energy?
      const need = e >= 2 ? 1 : e >= 1.4 ? 2 : e >= 0.9 ? 3 : 4;
      if (best.drop < need) continue;
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
    // a topple must not re-seed the slide as if someone dug here: its energy only ever fades
    this.quiet = true;
    const it = w.removeCell(i, j, k, true);
    this.quiet = false;
    if (!it) return;
    this.recent += 1;
    this.active = 2;
    // a real slide is a dozen plush or more in motion at once, not a stray plush rolling off
    this.burstN = Math.min(24, (this.burstN || 0) + 1); if (this.burstN >= 12 && !this.burstCool) { this.burstCool = 15; this.burstN = 0; g.S.stats.bigSlides = (g.S.stats.bigSlides || 0) + 1; }
    g.S.stats.slides = (g.S.stats.slides || 0) + 1;
    this.hot.set(key(i + a, j, k + b), g.time + 3);
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
    // a big slide keeps its energy longer (it drags the slope with it); a small one dies out fast
    const next = e * (e >= 1.8 ? 0.86 : 0.7 + 0.04 * drop);
    this.trigger(i, j, k, next);
    this.add(i + a, j, k + b, e * 0.5);
    // feel it
    const pd = Math.hypot(x - g.player.pos.x, z - g.player.pos.z);
    g.slideEvent(x, z, pd);
  }
}
