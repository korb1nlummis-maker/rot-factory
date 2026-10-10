import { C, NX, NZ, cellX, cellY, cellZ, toI, toJ, toK } from './config.js';
import { isSpecialCell, NEEDLE } from './plushdata.js';

// ---------------------------------------------------------------------------------------------
// BURIAL. When a slide (wedge.js) is over, the plush that came to rest slumps against everyone in the runout: the player who rode it,
// a friend or a bot standing below it. Nobody is hit; what the slide does to you is a matter of how much plush lands on you.
//
//  1. Landing (onFinish, land): once everyone has stopped, the plush that really came to rest on the ground around anybody in the runout (the
//     columns round their cell that are higher than before the slide: the snapshot taken at the start) slumps against them: a ring of
//     plush fills the cells round them level by level (legs, waist, chest) and, when there is plenty left over, a cap closes over the head,
//     one to four cells thick for a big slide. The plush is taken from the top of that landed pile, so nothing is made or lost. The one who
//     rode the flow was carried to the thick of it and gets what landed within reach (RIDER_R, then POOL_FAR). A bot is lifted to the surface
//     afterwards (wedge.freeBots).
//  2. How deep (BOUND, DEPTH): a small slide buries to the waist or the chest, a medium one to the chest or under a cap, a big one under the
//     pile (a cap of several cells) most of the time. Gear lowers the odds and shortens the ride; it does not change what lands on you.
//  3. Being buried (update(), on the player's own machine; the cells are the same on a guest): the depth is read from the cells round you
//     (cover()). 1 = legs, 2 = waist: you wriggle out in about a second by walking at the way out. 3 = chest: you have to punch your way
//     out (R, right click, Space for up), the trapped system runs (air, a few seconds). 4 = a cap over your head: the same with the full air
//     dial. airLeft always starts at the normal 60 s (updateTrapped), a slide alone never kills.
// ---------------------------------------------------------------------------------------------
export const BU = {
  POOL_R: 3,              // cells round the buried cell that count as 'landed on you'
  RIDER_R: 6,             // the same for the one who rode the flow
  POOL_FAR: 20,           // cells round it the plush may slump in from (and the reach of a rider who was carried to the edge of the pile)
  POOL_MIN: 6,            // landed cells needed before anything slumps
  CAP_EXTRA: 6,           // landed cells left over after the ring that decide a cap
  DEPTH: [5, 12, 22, 38], // landed cells that make legs, waist, chest, under a cap
  BOUND: { small: [12, 30], medium: [26, 70], big: [44, 1e9] },   // what a slide of that size puts on one person: [least it tries to, most]
  CAP_LAYERS: { small: 1, medium: 2, big: 4 },
  CAP_STEP: 20,           // landed cells beyond the first cap's that add another layer
  SMALL: 110, LARGE: 420, // (released cells that make a slide small, medium or large when its class is not known)
  WRIGGLE: [0, 0.35, 0.65],   // s of walking at the way out per level of burial (legs, waist)
  SLOW: [1, 0.6, 0.35, 0.15, 0.05], // walking speed at each depth
  REST: 4,                // s after a slide that the footing is not rolled again
  WAIT: 2.5,              // s a landing waits for the player to come to rest
  RIDE_FRESH: 1,          // s before the end of the flow that the player must still have been carried to count as having ridden it
  ARM: 14,                // s after a slide that your own burial is watched
};
const SS = BU;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const LEVELS = ['free', 'legs', 'waist', 'chest', 'buried'];

export class Burial {
  constructor(game) {
    this.g = game;
    this.lvl = 0;            // how deep the local player is in (0 free, 1 legs, 2 waist, 3 chest, 4 under a cap)
    this.armT = 0;           // seconds your burial is still being watched after a slide
    this.on = false;         // the player is being held by a pile from a soft slide
    this.wig = 0; this.freeT = 0; this.scanT = 0;
    this.restT = 0;
    this.pend = null;        // a finished slide whose landing waits for everyone to stop
    this.last = null;        // numbers of the last landing (for the tests and the readout)
    this.log = [];           // landings of the last slide: [{ who, lvl, pool, placed }]
  }

  clear() { this.restT = 0; this.pend = null; this.lvl = 0; this.armT = 0; this.on = false; this.wig = 0; this.freeT = 0; this.last = null; this.log = []; }

  // wedge.start calls this: what the ground looked like before, so the pile that lands afterwards can be told from the pile that was there
  onStart(a) {
    const w = this.g.world, pad = Math.min(60, Math.ceil((a.maxTravel + 6) / C));
    const [x0, x1, z0, z1] = a.bbox, i0 = x0 - pad, k0 = z0 - pad, wd = x1 - x0 + 2 * pad + 1, ht = z1 - z0 + 2 * pad + 1;
    const top = new Int16Array(wd * ht);
    for (let k = 0; k < ht; k++) for (let i = 0; i < wd; i++) top[k * wd + i] = w.topAt(i0 + i, k0 + k);
    a.snap = { i0, k0, wd, ht, top };
    this.log = [];
  }

  // a world was just loaded: nothing of a slide or a burial survives a save (no landing is pending, nobody is watched), and a player saved with the
  // body inside plush (a save made while a slide was running or right after one) is set on top of it instead of being loaded into the pile
  afterLoad() {
    this.clear();
    const g = this.g, w = g.world, p = g.player; if (!p || !w) return;
    const i = toI(p.pos.x), k = toK(p.pos.z), y0 = p.pos.y;
    const inPile = () => { const jb = toJ(p.pos.y + 0.05); return w.solid(i, jb, k) || w.solid(i, jb + 1, k); };
    if (!inPile()) return;
    for (let n = 0; n < 60 && inPile(); n++) p.pos.y = (toJ(p.pos.y + 0.05) + 1) * C;
    if (inPile()) { p.pos.y = y0; return; }
    p.vel.set(0, 0, 0); p.onGround = false;
  }

  // ======================= landing =======================
  gain(a, i, k) {
    const s = a.snap; if (!s) return 0;
    const x = i - s.i0, z = k - s.k0; if (x < 0 || z < 0 || x >= s.wd || z >= s.ht) return 0;
    return Math.max(0, this.g.world.topAt(i, k) - s.top[z * s.wd + x]);
  }

  // the slide is over: the pile that came to rest slumps against everyone in the runout, once they have stopped (at most SS.WAIT s later)
  onFinish(a, how) {
    const g = this.g;
    this.restT = g.time + SS.REST;   // (no new footing roll for a moment after any slide)
    if (!a.snap || g.isGuest()) return;
    this.pend = { a, how, t: 0 }; this.armT = SS.ARM;
  }
  tick(dt) {
    const pe = this.pend; if (!pe) return;
    pe.t += dt;
    const g = this.g, sp = (o) => (o && o.vel ? Math.hypot(o.vel.x, o.vel.z) : 0);
    if (pe.t < SS.WAIT && (sp(g.player) > 0.8 || !g.player.onGround || (g.remote && g.net && g.net.open && sp(g.remote) > 0.8))) return;
    this.pend = null; this.land(pe.a, pe.how);
  }
  land(a, how) {
    const g = this.g;
    this.log = [];
    const targets = [];
    if (g.mode === 'play' && !g.dead && !g.blacking) targets.push({ who: 'player', pos: g.player.pos, local: true });
    if (g.remote && g.net && g.net.open && g.net.role === 'host') targets.push({ who: 'guest', pos: g.remote.pos });
    for (const b of (g.S && g.S.crew) || []) if (Number.isFinite(b.x + b.y + b.z)) targets.push({ who: 'bot:' + (b.name || b.id), pos: { x: b.x, y: b.y, z: b.z }, bot: b });
    const pockets = targets.map((t) => ({ i: toI(t.pos.x), k: toK(t.pos.z), j: toJ(t.pos.y + 0.05) }));
    targets.forEach((t, n) => { const r = this.landOn(a, t, pockets, n); if (r) this.log.push(r); });
    this.last = { how, cells: a.released, released: a.released, cls: a.cls, landings: this.log.map((l) => ({ ...l })) };
    if (this.log.length) g.wedge.freeBots();   // a bot under the pile is lifted to the surface
  }

  // the landed pile round one pocket: take cells from the tops of the columns that grew, set them round the pocket level by level
  landOn(a, t, pockets, self) {
    const g = this.g, w = g.world;
    const i0 = pockets[self].i, k0 = pockets[self].k, jb = pockets[self].j;
    if (!w.inside(i0, jb, k0) || (!t.bot && !t.local && t.pos.y > w.topAt(i0, k0) * C + 2.5)) return null;   // (a friend up in the air is not on the pile; the one who rode it is, wherever it threw them)       // up in the air, not on the pile
    // the one who rode the sheet was in the middle of it: what came to rest within RIDER_R round them fell on them; anybody else is reached by what lands within POOL_R
    const rode = (t.local && a.carried && a.t - (a.carriedAt || 0) <= SS.RIDE_FRESH) || (t.who === 'guest' && a.by === 'guest'); let PR = rode ? SS.RIDER_R : SS.POOL_R;   // (carried at some point is not enough: a player who touched the flow and then got clear of it is a bystander)
    const cols = []; let pool = 0;   // pool: landed within PR (what fell on you); cols: everything that can slump in from POOL_FAR
    for (let dk = -SS.POOL_FAR; dk <= SS.POOL_FAR; dk++) for (let di = -SS.POOL_FAR; di <= SS.POOL_FAR; di++) {
      if (Math.abs(di) <= 1 && Math.abs(dk) <= 1) continue;
      const gn = this.gain(a, i0 + di, k0 + dk); if (!gn) continue;
      cols.push({ i: i0 + di, k: k0 + dk, gn }); if (Math.abs(di) <= PR && Math.abs(dk) <= PR) pool += gn;
    }
    const cls0 = a.cls || (Math.max(1, a.released || 1) < SS.SMALL ? 'small' : a.released < SS.LARGE ? 'medium' : 'big');
    if (rode && pool < SS.BOUND[cls0][0]) { PR = SS.POOL_FAR; pool = 0; for (const c of cols) if (Math.abs(c.i - i0) <= PR && Math.abs(c.k - k0) <= PR) pool += c.gn; }   // (carried to the edge of the pile: what is round you within the reach of the slump still fell on you)
    const res = { who: t.who, pool, placed: 0, lvl: 0, cap: false, B: 0, want: 0, rode, at: [+t.pos.x.toFixed(2), +t.pos.y.toFixed(2), +t.pos.z.toFixed(2)] };
    if (pool < SS.POOL_MIN) { res.lvl = this.coverAt(i0, jb, k0).lvl; return res; }
    // how much of it settles on you: the landed pile, bounded by what a slide of this size can put on one person (a small one never more than your waist, a big one never less than your chest)
    { const n = Math.max(1, a.released || 1), cls = a.cls || (n < SS.SMALL ? 'small' : n < SS.LARGE ? 'medium' : 'big'), bd = SS.BOUND[cls];
      const lo = bd[0] * (rode ? 1 : clamp(pool / 12, 0, 1)), hi = bd[1];
      res.B = clamp(pool, Math.min(lo, hi), hi); res.cls = cls; }
    let want = 0; for (let q = 0; q < SS.DEPTH.length; q++) if (res.B >= SS.DEPTH[q]) want = q + 1;
    res.want = want;
    if (t.bot) { res.lvl = want; res.bot = true; return res; }   // a bot cannot dig: it is only counted as buried that deep, and freeBots (wedge.js) lifts it to the surface of the pile that landed on it
    let poolLeft = 0; for (const c of cols) poolLeft += c.gn;
    const others = new Set(); pockets.forEach((q, n) => { if (n === self) return; for (let dj = 0; dj <= 3; dj++) others.add(((jb + dj) * NZ + q.k) * NX + q.i); });
    const take = () => {
      let best = null; for (const c of cols) if (c.gn > 0 && (!best || c.gn > best.gn)) best = c;
      if (!best) return null;
      const top = w.topAt(best.i, best.k), j = top - 1, sp = w.get(best.i, j, best.k);
      if (!sp || isSpecialCell(sp) || sp === NEEDLE || w.reserved.has((j * NZ + best.k) * NX + best.i)) { best.gn = 0; return take(); }
      const vr = w.getVr(best.i, j, best.k); w.setCell(best.i, j, best.k, 0, 0); w.stabQueue.push({ i: best.i, j, k: best.k }); best.gn--;
      return { sp, vr };
    };
    const left = () => { let n = 0; for (const c of cols) n += c.gn; return n; };
    const free = (i, j, k) => w.inside(i, j, k) && w.get(i, j, k) === 0 && !w.reserved.has((j * NZ + k) * NX + i) && !others.has((j * NZ + k) * NX + i);
    // stack plush in column (i, k) until cell j is filled (the downhill side of a slope is lower: the ring needs something under it)
    const build = (i, j, k) => {
      if (w.solid(i, j, k)) return true;
      const t0 = w.topAt(i, k); if (j - t0 > 6) return false;
      for (let jj = t0; jj <= j; jj++) {
        if (!free(i, jj, k)) return false;
        const c = take(); if (!c) return false;
        w.setCell(i, jj, k, c.sp, c.vr); res.placed++;
      }
      return true;
    };
    const ringAt = (L) => { const j = jb + L; return [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([a2, b2]) => [i0 + a2, j, k0 + b2, a2 * b2 === 0]); };
    const outerAt = (L) => { const j = jb + L; return [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2]].map(([a2, b2]) => [i0 + a2, j, k0 + b2]); };
    // the four cells beside you level by level first (they are what makes you buried), then the diagonals while the landed pile allows
    let lvl = 0;
    for (let L = 0; L < Math.min(3, want); L++) {
      let ok = true;
      for (const [i, j, k, orth] of ringAt(L)) if (orth && !build(i, j, k)) ok = false;
      if (!ok) break; lvl++;
    }
    for (let L = 0; L < lvl; L++) for (const [i, j, k, orth] of ringAt(L)) if (!orth && left() >= 3) build(i, j, k);
    // a chest deep or deeper burial is two cells thick: an outer ring (a plus of the 12 cells at distance 2) at each level, while the landed pile allows
    if (lvl >= 3 && want >= 3) {
      for (let L = 0; L < lvl; L++) { if (left() < 12 || res.placed > 110) break; for (const [i, j, k] of outerAt(L)) build(i, j, k); }
    }
    if (lvl === 3 && want >= 4 && left() >= 5 + SS.CAP_EXTRA) {
      // a cap over the head: one cell, and for the bigger slides up to CAP_LAYERS of them while the landed pile allows (CAP_STEP cells for each)
      const layers = Math.min(SS.CAP_LAYERS[res.cls] || 1, 1 + Math.floor(Math.max(0, res.B - SS.DEPTH[3]) / SS.CAP_STEP));
      let n = 0;
      for (let c2 = 0; c2 < layers; c2++) {
        if (c2 > 0 && left() < 10) break;
        let ok = true;
        for (const [i, j, k, orth] of ringAt(3 + c2)) if (orth && !build(i, j, k)) ok = false;
        if (!ok || !free(i0, jb + 3 + c2, k0)) break;
        const c = take(); if (!c) break;
        w.setCell(i0, jb + 3 + c2, k0, c.sp, c.vr); res.placed++; n++;
      }
      res.cap = n > 0; res.capLayers = n;
    }
    // a slide of this size cannot leave you deeper than `want`: whatever the ground round you already held beyond that rolls off down the slope
    this.trim(a, i0, jb, k0, want, res);
    // the plush that slumps in round you fits snugly: you end up in the middle of your cell, not wedged against a side (the local player only: a friend's body is theirs)
    if (t.local && res.placed && this.coverAt(i0, jb, k0).lvl >= 1) { const p = g.player; p.pos.x = cellX(i0); p.pos.z = cellZ(k0); p.vel.set(0, Math.min(0, p.vel.y), 0); }
    res.lvl = this.coverAt(i0, jb, k0).lvl; res.depth = Math.min(3, res.lvl) + (res.capLayers || 0); delete res.cls;
    if (res.placed) g.fx.dust(t.pos.x, t.pos.y + 0.8, t.pos.z, 8, 0.8, 0.9);
    return res;
  }

  trim(a, i0, jb, k0, want, res) {
    const g = this.g, w = g.world, ax = Math.abs(a.dx) >= Math.abs(a.dz), sx = ax ? Math.sign(a.dx) || 1 : 0, sz = ax ? 0 : Math.sign(a.dz) || 1;
    for (let n = 0; n < 4; n++) {
      const cv = this.coverAt(i0, jb, k0); if (cv.lvl <= want) return;
      const L = cv.cap ? 3 : want, j = jb + L;
      for (const [da, db] of ax ? [[sx, 0], [sx, 1], [sx, -1]] : [[0, sz], [1, sz], [-1, sz]]) {
        const i = i0 + da, k = k0 + db, it = w.removeCell(i, j, k, true); if (!it) continue;
        if (!this.shove(it, i0, jb, k0, sx, sz)) w.setCell(i, j, k, it.sp, it.vr);   // (set down a few cells off, not rolled back into the gap)
        res.trimmed = (res.trimmed || 0) + 1;
      }
    }
  }

  // ======================= how deep =======================
  // read from the cells round a pocket: the number of levels from the feet up (to the head) whose four sides are all plush, and a cap over the head
  coverAt(i0, jb, k0) {
    const w = this.g.world; let lvl = 0;
    for (let L = 0; L < 3; L++) {
      const j = jb + L;
      if (!(w.solid(i0 + 1, j, k0) && w.solid(i0 - 1, j, k0) && w.solid(i0, j, k0 + 1) && w.solid(i0, j, k0 - 1))) break;
      lvl++;
    }
    const cap = lvl >= 3 && w.solid(i0, jb + 3, k0);
    return { lvl: cap ? 4 : lvl, cap };
  }
  cover(pos) { return this.coverAt(toI(pos.x), toJ(pos.y + 0.05), toK(pos.z)); }
  name() { return LEVELS[this.lvl] || 'free'; }

  // walking speed and jumping while held (game.js asks)
  slow() { return this.on ? SS.SLOW[this.lvl] ?? 1 : 1; }
  jumpMul() { return this.on && this.lvl >= 2 ? (this.lvl >= 3 ? 0 : 0.3) : 1; }

  // the guest was told the host's slide ended: it watches its own burial from now on
  arm() { this.armT = SS.ARM; this.restT = this.g.time + SS.REST; }
  // no new roll of the footing while a landing waits, while you are held by a pile, or in the few seconds after a slide
  resting() { return !!this.pend || this.on || this.g.time < this.restT; }

  // ======================= the player's own burial =======================
  update(dt) {
    const g = this.g, p = g.player;
    if (g.dead || g.blacking || g.mode !== 'play') { if (this.on) { this.on = false; this.lvl = 0; } return; }
    if (this.armT > 0) this.armT -= dt;
    if (!this.on && this.armT <= 0) return;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.1;
      const cv = this.cover(p.pos), was = this.lvl;
      this.lvl = cv.lvl;
      if (cv.lvl > 0 && !this.on) { this.on = true; this.freeT = 0; if (cv.lvl >= 2) this.hintFor(cv.lvl); }
      if (this.on && cv.lvl === 0) { this.freeT += 0.1; if (this.freeT > 0.8) { this.on = false; this.wig = 0; } } else this.freeT = 0;
      if (this.lvl > was && this.on) this.hintFor(this.lvl);
    }
    if (!this.on) return;
    // the trapped system (air, the buried overlay, Space punches up) reads p.buried
    if (this.lvl >= 3) p.buried = Math.max(p.buried, 1.5); else if (this.lvl === 2) p.buried = Math.max(p.buried, 0.9);
    if (this.lvl >= 1 && this.lvl <= 2) this.wriggle(dt);
    else this.wig = 0;
  }

  hintFor(lvl) {
    const g = this.g, ui = g.ui; if (!ui) return;
    if (lvl === 2) ui.hint('<b>Buried to the waist.</b> Wriggle out: keep walking the way you want to go.', 4);
    else if (lvl === 3) ui.hint('<b>Buried to the chest.</b> Punch your way out: <kbd>R</kbd> or right click at the plush in front of you.', 5);
    else if (lvl >= 4) ui.hint('<b>Buried under the pile.</b> Hold <kbd>Space</kbd> to punch up, <kbd>R</kbd> to punch ahead. Watch your air.', 6);
  }

  // walking at the way out loosens the plush in that direction: the cells at the top of the ring (and the two beside) are shoved loose
  wriggle(dt) {
    const g = this.g, p = g.player, k = g.keys || {};
    const locked = document.pointerLockElement === g.canvas && !(g.ui && g.ui.isModalOpen && g.ui.isModalOpen());
    const mx = (locked && k.KeyD ? 1 : 0) - (locked && k.KeyA ? 1 : 0), mz = (locked && k.KeyW ? 1 : 0) - (locked && k.KeyS ? 1 : 0);
    if (!mx && !mz) { this.wig = Math.max(0, this.wig - dt); return; }
    this.wig += dt;
    if (this.wig < SS.WRIGGLE[this.lvl]) return;
    this.wig = 0;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), wx = fx * mz + -fz * mx, wz = fz * mz + fx * mx;
    this.openToward(wx, wz);
  }
  // the plush that was shoved loose goes to rest a few cells off, on the ground, never back into the gap (nor onto you)
  shove(it, i0, jb, k0, sx, sz) {
    const g = this.g, w = g.world;
    for (let r = 2; r <= 5; r++) for (let q = 0; q < 24; q++) {
      const ang = (q / 24) * 6.2832, a2 = Math.round(Math.cos(ang) * r), b2 = Math.round(Math.sin(ang) * r);
      if (sx * a2 + sz * b2 < 0 && r < 4) continue;   // (not behind you where you may want to climb out)
      const i = i0 + a2, k = k0 + b2, j = w.topAt(i, k);
      if (!w.inside(i, j, k) || w.get(i, j, k) !== 0 || w.reserved.has((j * NZ + k) * NX + i) || j > jb + 3) continue;
      w.setCell(i, j, k, it.sp, it.vr); return true;
    }
    if (g.sim.n < 2300) g.sim.spawn(it.sp, it.vr, cellX(i0 + sx * 3), cellY(jb + 2), cellZ(k0 + sz * 3), sx, 0.5, sz, 0); else return false;
    return true;
  }
  openToward(wx, wz) {
    const g = this.g, w = g.world, p = g.player, i0 = toI(p.pos.x), k0 = toK(p.pos.z), jb = toJ(p.pos.y + 0.05);
    const j = jb + Math.max(0, this.lvl - 1);
    const ax = Math.abs(wx) >= Math.abs(wz), sx = ax ? Math.sign(wx) : 0, sz = ax ? 0 : Math.sign(wz);
    // a corridor two cells deep and three wide at that level: you shove through the loose plush, not just the first of it
    const spots = ax ? [[sx, 0], [sx, 1], [sx, -1], [2 * sx, 0], [2 * sx, 1], [2 * sx, -1]] : [[0, sz], [1, sz], [-1, sz], [0, 2 * sz], [1, 2 * sz], [-1, 2 * sz]];
    let n = 0;
    for (const [a2, b2] of spots) {
      const i = i0 + a2, k = k0 + b2, it = w.removeCell(i, j, k, true);
      if (!it) continue; n++;
      this.shove(it, i0, jb, k0, sx, sz);
    }
    if (n) { g.fx.dust(p.pos.x + sx * 0.6, p.pos.y + 0.5 + 0.6 * (this.lvl - 1), p.pos.z + sz * 0.6, 4, 0.5, 0.6); g.sound.thump(0.12, 90); }
    return n;
  }
}
