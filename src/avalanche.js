import { C, NX, NY, NZ, cellX, cellY, cellZ, toI, toJ, toK } from './config.js';
import { isSpecialCell, NEEDLE } from './plushdata.js';

// ---------------------------------------------------------------------------------------------
// CLIMBING AVALANCHES. High up the pile, with the wrong gear, the slope can let go as a SLAB: a sheet of plush a few cells thick
// that cracks along a line above you, then slides down the face like snow, carries you with it, and comes to rest in a runout pile at
// the foot of the slope. Below the slab line, for good gear and during the cooldown the footing gives way as a small SOFT slide instead
// (softslide.js): the same machinery started with soft: true (a smaller slab, its own flow time and travel bound, no hit, and the pile that lands decides how deep it buries).
//
//  1. Earned: only above H0 (19 m, a bit under half the 43 m hall), on a slope of at least MIN_SLOPE, with no Rope Anchor in reach and
//     without Climbing Gear 3. The odds climb with height, load and repeated stress, and fall with gear (risk()). Gear says why in a hint.
//  2. A slab (plan()): 6 to 20 m wide, 2 to 5 cells (1.2 to 3 m) deep, 6 to 26 m long (longer the higher and the steeper), never more than
//     MAX_CELLS. It follows the surface, so the scar is as thick as the slab, and it thins to one cell over its last 30% (a toe, not a wall). Frames, props, rope anchors, machines and special cells hold
//     the columns they touch.
//  3. A crack and a warning (0.4 s if you are moving, 0.8 s if you stand still): a creak and a line of dust along the crown, then the
//     cells let go in a wave from the top of the slab downward (WAVE m/s), each a moment after the one above it.
//  4. Released cells become loose bodies tagged for this slide (sim.tag). Each frame they are driven down the local slope (a little
//     fluidized, so the sheet flows), damped on the flat, frozen into the pile when they slow down, and everything left is placed
//     into the runout when the time is up (HARD seconds) or a body has gone further than the travel bound. Nothing is lost: a
//     placed body becomes a cell, a cell that could not be released stays where it was.
//  5. The player is swept: inside the flow the player's velocity follows the plush around them, the keys only steer a little, and damage
//     is capped (shield()) so a slide alone never kills. A hard stop at the bottom costs a few points at most.
//  6. Cost is bounded: BODY_CAP live bodies, at most RELEASE_PER_TICK cells a tick, and the work of a tick is timed (perf).
// Multiplayer: the host simulates everything. The guest sees the cells go (the usual cell diffs), the bodies (netgame.js's capped body stream,
// nearest first), and hears and feels it from small `av*` messages (a warning, a run update twice a second, an end, and the ride velocity).
// ---------------------------------------------------------------------------------------------
export const AV = {
  H0: 19, H1: 38,               // m above the floor: slabs only break above H0
  MIN_SLOPE: 0.5,               // rise over run under the feet (27 degrees) at the least
  W_MIN: 6, W_MAX: 20,          // width in m
  D_MIN: 2, D_MAX: 5,           // depth in cells
  L_MIN: 6, L_MAX: 26,          // length in m
  MAX_CELLS: 3200,
  BODY_CAP: 1500,               // live bodies of one slide
  SIM_CAP: 2300,                // never push the whole sim past this
  RELEASE_PER_TICK: 90,
  WAVE: 11,                     // m/s the crack runs down the slab
  BACK: 2.0,                    // m of slab above the climber
  BACK_SOFT: 1.2,               // the same for a small soft slide (softslide.js)
  WARN_STILL: 0.8, WARN_MOVE: 0.4,
  FLOW_T: 9,                    // s the sheet is driven down the slope
  HARD: 18,                     // s after the first release: whatever is left is placed into the pile
  COOL: 30,                     // s before the next slab can break
  COOL_SOFT: 6,                 // s before the next slide of any kind after a small soft one (softslide.js)
  VMAX: 13, ACC: 10,           // flow speed cap (m/s) and downslope drive (m/s^2 at a steep face)
  REAL: 12,                     // cells that make it a real slide (the Rockslide achievement)
  WHY: 'were thrown down the pile by an avalanche',
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// what the climber has on: Climbing Gear (3 tiers) matters most, shoes and springs a little. (There is no grapple in the game yet; a rope anchor is checked apart.)
export function gearOf(T) {
  const climb = T.climb || 0;
  const boots = clamp(((T.walk || 4) - 4) / 2, 0, 1), springs = clamp(((T.jump || 6) - 6) / 2.7, 0, 1);
  const score = Math.min(1, 0.34 * climb + 0.08 * boots + 0.06 * springs);
  return { climb, boots, springs, score, immune: climb >= 3 };
}

export class Avalanches {
  constructor(game) {
    this.g = game;
    this.cur = null;          // the slide in progress (host only)
    this.last = null;         // numbers of the last finished slide
    this.cool = 0;
    this.stress = 0;          // repeated stress: every check that held up high makes the next one likelier
    this.live = 0;            // loose bodies of the slide right now
    this.rideT = 0; this.ridePeak = 0; this.rideV = 0; this.shieldLeft = 0; this.rideSoft = false;
    this.roll = 0;            // camera roll while carried
    this.perf = { n: 0, ms: 0, max: 0 };
    this.guestT = 0; this.guestRun = 0; this.dMin = 1e9;
    this.botWatch = 0; this.botT = 0;   // seconds left of looking for a bot buried in the runout (during the slide and for a while after it)
    this.ask = 0;             // guest: seconds a request to the host is still waiting for its warning
    this.guestOn = 0;         // guest: seconds the host's slab is believed to be running (until its avend)
    this._seen = {};
  }

  clear() {
    this.cur = null; this.cool = 0; this.botWatch = 0; this.ask = 0; this.guestOn = 0; this.guestRun = 0; this.stress = 0; this.live = 0; this.rideT = 0; this.ridePeak = 0; this.rideV = 0; this.roll = 0; this.shieldLeft = 0; this.rideSoft = false; this._seen = {};
    const s = this.g.sim; if (s && s.tag) for (let i = 0; i < s.n; i++) s.tag[i] = 0;
    if (this.g.player) this.g.player.swept = 0;
  }

  // ======================= the odds =======================
  // what would happen to a climber at pos carrying n plush (a pure function of the gear, the height and the stress)
  risk(pos, carryN = 0, stress = this.stress) {
    const g = this.g, gear = gearOf(g.T), h = pos.y;
    const r = { h, gear, eligible: false, immune: false, p: 0, why: '', roped: false };
    if (h < AV.H0) { r.why = `below ${AV.H0} m the slope only slips in small patches`; return r; }
    if (g.ropedIn(pos)) { r.roped = true; r.immune = true; r.why = 'a Rope Anchor holds the slope here'; return r; }
    if (gear.immune) { r.immune = true; r.why = 'Climbing Gear 3 holds the slope'; return r; }
    const load = clamp(carryN / Math.max(1, g.T.carry || 1), 0, 1);
    const f = Math.pow(1 - gear.score, 1.5);
    r.p = clamp((0.2 + 0.035 * (h - AV.H0) + 0.08 * Math.min(6, stress) + 0.12 * load) * f, 0, 0.9);
    r.eligible = true;
    r.why = gear.climb ? `Climbing Gear ${gear.climb} of 3 only cuts the odds` : 'no Climbing Gear and no Rope Anchor in reach';
    return r;
  }

  // the hint that says why it is safe or why it is not (once per state)
  advise(pos, carryN) {
    const g = this.g, r = this.risk(pos, carryN);
    if (r.h < AV.H0) return;
    const key = r.roped ? 'rope' : r.immune ? 'gear' : 'risk';
    if (this._seen[key] || !g.ui) return;
    this._seen[key] = true;
    if (key === 'risk') g.ui.hint(`<b>Slab risk.</b> Above ${AV.H0} m a whole sheet of the pile can break away and carry you down: ${r.why}. Climbing Gear 3 or Rope Anchors planted as you climb make it safe.`, 7);
    else if (key === 'gear') g.ui.hint('<b>The slope holds.</b> Climbing Gear 3 keeps the pile from breaking away under you. Small patches can still slip.', 5);
  }

  // climbRisk (game.js) calls this when the footing gave way. true when it became a real slab (the caller then skips the old patch slide)
  onClimbHit(pos, fc, carryN) {
    const g = this.g;
    if (this.cur || this.cool > 0 || this.guestOn > 0) return false;   // (a guest knows the host's slab and cooldown from its avwarn and avend)
    if (this.ask > 0) return true;                                      // (a guest's request is on its way: no second one, no small patch on top)
    const r = this.risk(pos, carryN);
    if (!r.eligible) return false;
    if (Math.random() > r.p) { this.stress = Math.min(6, this.stress + 1); return false; }
    const vel = g.player.vel, speed = Math.hypot(vel.x, vel.z);
    if (g.isGuest()) {
      // the host judges the slope and the gear again and runs it; the guest drops what it carries (its own plush) when the warning comes back, not before
      this.ask = 3;
      g.cmd('avclimb', { x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), n: carryN, sp: +speed.toFixed(2) });
      return true;
    }
    if (!this.start(pos, { speed, carry: carryN, by: 'climb' })) return false;
    this.dropLoad(0);
    return true;
  }

  // half of what you carry falls out of your hands (a soft slide: less)
  dropLoad(frac = 0.5) {
    const g = this.g, p = g.player;
    const lose = Math.min(g.S.carry.length, Math.ceil(g.S.carry.length * frac));
    for (let n = 0; n < lose; n++) { const it = g.S.carry.pop(); g.sim.spawn(it.sp, it.vr, p.pos.x, p.pos.y + 1.2, p.pos.z, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, 0); }
    if (lose) g.ui.setCarry(g.S.carry, g.T.carry);
    return lose;
  }

  // the host runs a slab for a guest that climbed (a forged or stale request changes nothing: it is judged again here)
  fromGuest(d) {
    const g = this.g;
    if (g.isGuest() || !g.remote || !d || this.cur || this.cool > 0) return false;
    const rp = g.remote.pos, claim = { x: +d.x, y: +d.y, z: +d.z };
    if (!Number.isFinite(claim.x + claim.y + claim.z) || !Number.isFinite(rp.x + rp.y + rp.z)) return false;
    if (Math.hypot(claim.x - rp.x, claim.z - rp.z) > 8 || Math.abs(claim.y - rp.y) > 8) return false;   // it has to be where the guest really is
    const pos = { x: rp.x, y: rp.y, z: rp.z };   // and the host's own view of the guest is what it judges and breaks (the guest's numbers only say it is asking)
    const r = this.risk(pos, Math.max(0, Math.min(200, +d.n || 0)));
    if (!r.eligible) return false;
    return this.start(pos, { speed: Math.max(0, Math.min(20, +d.sp || 0)), carry: Math.max(0, Math.min(200, +d.n || 0)), by: 'guest' });
  }

  // ======================= the slab =======================
  // downhill direction and steepness at a column (cells of rise per cell of run), from three windows
  slope(i0, k0) {
    const w = this.g.world; let gi = 0, gk = 0;
    for (const s of [2, 4, 6]) { gi += w.topAt(i0 - s, k0) - w.topAt(i0 + s, k0); gk += w.topAt(i0, k0 - s) - w.topAt(i0, k0 + s); }
    const gm = Math.hypot(gi, gk);
    return gm < 1e-6 ? null : { dx: gi / gm, dz: gk / gm, tan: gm / 24 };
  }

  // where the sheet would end up: follow the steepest way down from here to the floor (a bench of a few metres on the way does not end it)
  foot(x, z) {
    const w = this.g.world; let path = 0, flat = 0;
    for (let n = 0; n < 260; n++) {
      const i = toI(x), k = toK(z), t = w.topAt(i, k);
      if (t <= 2) break;
      const s = this.slope(i, k);
      if (!s || s.tan < 0.06) { if (++flat > 10) break; if (!s) break; } else flat = 0;
      const dx = s ? s.dx : 0, dz = s ? s.dz : 0;
      x += dx * C; z += dz * C; path += C;
    }
    return { x, z, path };
  }

  rope(x, y, z) {
    for (const it of this.g.machines.items.values()) { const e = it.ent; if (e.type === 'rope' && Math.hypot(e.x - x, e.z - z) < 6 && Math.abs(e.y - y) < 5) return true; }
    return false;
  }

  // the cells of a slab that breaks at pos. Returns null when the slope is too flat or nothing can be released.
  plan(pos, o = {}) {
    const g = this.g, w = g.world, rnd = o.rnd || Math.random;
    const i0 = toI(pos.x), k0 = toK(pos.z);
    const sl = this.slope(i0, k0);
    if (!sl || sl.tan < (o.minTan ?? AV.MIN_SLOPE)) return null;
    const back = o.back ?? AV.BACK;   // (m of slab above the climber: a small slide under your feet starts closer)
    const { dx, dz } = sl, h = pos.y, hh = Math.max(0, h - AV.H0);
    const load = clamp((o.carry || 0) / Math.max(1, g.T.carry || 1), 0, 1);
    let L = clamp(7 + hh * 0.55 + (sl.tan - 0.6) * 9 + (rnd() - 0.5) * 2, AV.L_MIN, AV.L_MAX);
    const Wm = clamp(6.5 + hh * 0.6 + rnd() * 3 + load * 2, AV.W_MIN, AV.W_MAX);
    const depth = clamp(2 + Math.floor(hh / 7 + load * 1.5 + rnd() * 1.5), AV.D_MIN, AV.D_MAX);
    if (o.L) L = o.L; if (o.W) { /* a test may ask for a size */ }
    const W = o.W || Wm, D = o.depth || depth;
    const ropes = []; for (const it of g.machines.items.values()) { const e = it.ent; if (e.type === 'rope') ropes.push(e); }
    const hasSup = w.supports && w.supports.length > 0;
    // anything standing on the slope holds its column and the columns beside it, so it keeps its floor: a belt, a rail piece, a shaft, a door or a frame cell (what logi.cellTaken says
    // is taken in the three cells above the surface) and any machine within a metre
    const lg = g.logi, hold = new Set(), busyMemo = new Map();
    for (const it of g.machines.items.values()) {
      const e = it.ent; if (!e || e.type === 'rope' || !Number.isFinite(e.x + e.z) || Math.hypot(e.x - pos.x, e.z - pos.z) > L + W + 6) continue;
      const ci = toI(e.x), ck = toK(e.z), r = Math.ceil(1.0 / C);
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) hold.add((ck + b) * NX + ci + a);
    }
    const busy = (i, k) => {
      const key = k * NX + i; let b = busyMemo.get(key);
      if (b === undefined) { b = hold.has(key); if (!b && lg) { const t = w.topAt(i, k); for (let j = t; j < t + 3 && !b; j++) b = !!lg.cellTaken(i, j, k); } busyMemo.set(key, b); }
      return b;
    };
    let cells = null;
    for (let tries = 0; tries < 7; tries++) {
      cells = [];
      const R = Math.ceil((L + W) / C * 0.75) + 2;
      for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
        const i = i0 + a, k = k0 + b;
        const x = cellX(i), z = cellZ(k), px = x - pos.x, pz = z - pos.z;
        const u = px * dx + pz * dz, v = -px * dz + pz * dx;
        if (u < -back || u > L - back || Math.abs(v) > W / 2) continue;
        const t = w.topAt(i, k);
        // the toe of the slab thins out over its last 30% (a wedge: no wall of intact pile at the lower edge for the sheet to pile up against)
        const tail = L - back - u, De = tail >= L * 0.3 ? D : Math.max(1, Math.round(D * tail / (L * 0.3)));
        if (t < 6 || t - De < 3 || t >= NY) continue;
        if (busy(i, k) || busy(i + 1, k) || busy(i - 1, k) || busy(i, k + 1) || busy(i, k - 1)) continue;
        if (hasSup && w.supportBonus(x, cellY(t - 1), z) > 0) continue;
        let held = false;
        for (const e of ropes) if (Math.hypot(e.x - x, e.z - z) < 6 && Math.abs(e.y - cellY(t - 1)) < 5) { held = true; break; }
        if (held) continue;
        let ok = true;
        for (let l = 0; l < De; l++) { const j = t - 1 - l, sp = w.get(i, j, k); if (!sp || isSpecialCell(sp) || w.reserved.has((j * NZ + k) * NX + i)) { ok = false; break; } }
        if (!ok) continue;
        const noise = (((i * 73856093) ^ (k * 19349663)) >>> 0) % 1000 / 1000;
        for (let l = 0; l < De; l++) cells.push({ i, j: t - 1 - l, k, u, v, l, t: (u + back) / AV.WAVE + l * 0.06 + noise * 0.12 + Math.abs(v) / Math.max(1, W) * 0.15, bot: l === De - 1 });
      }
      if (cells.length <= AV.MAX_CELLS) break;
      L = Math.max(AV.L_MIN, L * 0.85); if (o.L) break;
    }
    if (!cells.length) return null;
    if (cells.length > AV.MAX_CELLS) cells.length = AV.MAX_CELLS;
    cells.sort((p, q) => p.t - q.t);
    const n = cells.length, ci = new Int32Array(n), cj = new Int32Array(n), ck = new Int32Array(n), rel = new Float32Array(n), bot = new Uint8Array(n);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, uMin = 1e9, uMax = -1e9, vMin = 1e9, vMax = -1e9;
    for (let q = 0; q < n; q++) {
      const c = cells[q]; ci[q] = c.i; cj[q] = c.j; ck[q] = c.k; rel[q] = c.t; bot[q] = c.bot ? 1 : 0;
      x0 = Math.min(x0, c.i); x1 = Math.max(x1, c.i); z0 = Math.min(z0, c.k); z1 = Math.max(z1, c.k);
      uMin = Math.min(uMin, c.u); uMax = Math.max(uMax, c.u); vMin = Math.min(vMin, c.v); vMax = Math.max(vMax, c.v);
    }
    const f = this.foot(pos.x, pos.z);
    return {
      n, ci, cj, ck, rel, bot, dx, dz, depth: D, tan: sl.tan, back,
      width: vMax - vMin + C, length: uMax - uMin + C, uMin, uMax, vMin, vMax,
      bbox: [x0, x1, z0, z1], foot: f, maxTravel: o.maxTravel ?? Math.min(80, f.path * 1.35 + 18 + (uMax - uMin) * 0.3),
    };
  }

  // start a slab at pos (host). o: speed (how fast the climber moves, for the warning), carry, by
  start(pos, o = {}) {
    const g = this.g;
    if (this.cur || g.isGuest()) return false;
    const pl = this.plan(pos, o);
    if (!pl) return false;
    const warn = o.warn ?? (o.speed > 1.2 ? AV.WARN_MOVE : AV.WARN_STILL);
    this.cur = Object.assign(pl, {
      state: 'warn', warn, warn0: warn, t: 0, age: 0, next: 0, x: pos.x, y: pos.y, z: pos.z, by: o.by || 'test',
      soft: !!o.soft, flowT: o.flowT ?? AV.FLOW_T, hard: o.hard ?? AV.HARD, vmax: o.vmax ?? AV.VMAX, acc: o.acc ?? AV.ACC, ride: o.ride ?? 7, meta: o.meta || null,   // (a soft slide, softslide.js, is a small slab with its own bounds)
      cx: pos.x, cy: pos.y, cz: pos.z, released: 0, skipped: 0, placed: 0, peakLive: 0, tFirst: 0, tLast: 0, runMsT: 0, fxT: 0, sndT: 0, netT: 0, rideNetT: 0, forced: 0, cells0: pl.n,
    });
    if (o.soft && g.softslide) g.softslide.onStart(this.cur);   // (the ground as it was, to tell the pile that lands from the pile that was there)
    this.perf = { n: 0, ms: 0, max: 0, relMs: 0, flowMs: 0 };
    this.last = null; this.shieldLeft = o.soft ? 6 : 12; this.rideSoft = !!o.soft; this.dMin = 1e9; this.botWatch = this.cur.hard + 30;
    // a climber standing inside the slab is a rider for as long as the sheet flows, even when the plush around them rush off ahead
    { const q = g.player.pos, c = this.cur, px = q.x - pos.x, pz = q.z - pos.z, u = px * c.dx + pz * c.dz, v = -px * c.dz + pz * c.dx;
      c.rider = q.y > 1.5 && q.y > g.world.topAt(toI(q.x), toK(q.z)) * C - 3 && u >= c.uMin - 0.6 && u <= c.uMax + 0.6 && v >= c.vMin - 0.6 && v <= c.vMax + 0.6; }   // (on the slab, not in a tunnel under it)
    this.warnFx(this.cur, true);
    this.net({ t: 'avwarn', x: +pos.x.toFixed(1), y: +pos.y.toFixed(1), z: +pos.z.toFixed(1), dx: +pl.dx.toFixed(3), dz: +pl.dz.toFixed(3), w: +pl.width.toFixed(1), l: +pl.length.toFixed(1), s: +warn.toFixed(2), ...(o.soft ? { k: 's' } : {}) });
    if (g.ui) g.ui.hint(o.soft ? '<b>The pile gives way under your boots.</b> It flows downhill and takes you with it. Let it carry you.' : '<b>The slope cracks above you!</b> A whole sheet of the pile is letting go. Hold on, you will ride it down.', 4);
    return true;
  }

  net(m) { const g = this.g; if (g.net && g.net.open && g.net.role === 'host') g.netSend(m); }

  // ======================= the tick =======================
  update(dt) {
    const g = this.g;
    this.cool = Math.max(0, this.cool - dt);
    if (g.softslide) g.softslide.tick(dt);   // (a finished soft slide lands its pile once everyone has stopped)
    if (this.stress > 0) this.stress = Math.max(0, this.stress - dt * 0.04);
    if (this.botWatch > 0) { this.botWatch -= dt; this.botT -= dt; if (this.botT <= 0) { this.botT = 0.5; this.freeBots(); } }   // (bots in the path: see freeBots)
    const a = this.cur;
    if (!a) { this.rideTick(dt); return; }
    const t0 = performance.now();
    a.age += dt;
    if (a.state === 'warn') {
      a.warn -= dt; this.warnFx(a, false, dt);
      if (a.warn <= 0) { a.state = 'run'; a.t = 0; this.startRun(a); }
      this.rideTick(dt);
      return;
    }
    a.t += dt;
    const t1 = performance.now();
    this.release(a, dt);
    const t2 = performance.now();
    this.flow(a, dt);
    const t3 = performance.now();
    this.runFx(a, dt);
    if (a.t > a.hard && a.next < a.n) { a.left = a.n - a.next; a.next = a.n; }   // the time is up: what has not let go stays in the slope
    if (a.next >= a.n && this.live === 0) this.finish(a, 'settled');
    else if (a.t > a.hard + 4) { this.sweep(a, 1e9); this.finish(a, 'timeout'); }
    const ms = performance.now() - t0;
    const pf = this.perf; pf.n++; pf.ms += ms; pf.max = Math.max(pf.max, ms); pf.relMs += t2 - t1; pf.flowMs += t3 - t2;
    this.rideTick(dt);
  }

  // the warning is over and the sheet lets go: a player who used the warning to step out of the slab's footprint, or who is down in a tunnel under it, is no rider
  startRun(a) {
    const g = this.g, pl = g.player.pos;
    if (!a.rider) return;
    const px = pl.x - a.x, pz = pl.z - a.z, u = px * a.dx + pz * a.dz, v = -px * a.dz + pz * a.dx;
    if (g.dead || u < a.uMin - 1.5 || u > a.uMax + 1.5 || v < a.vMin - 1.5 || v > a.vMax + 1.5 || pl.y < g.world.topAt(toI(pl.x), toK(pl.z)) * C - 4) a.rider = false;
  }

  // cells let go from the crown downward, each a moment after the one above, as long as there is room for their bodies
  release(a, dt) {
    const g = this.g, w = g.world, s = g.sim;
    const room = Math.min(AV.BODY_CAP - this.live, AV.SIM_CAP - s.n);
    let budget = Math.min(AV.RELEASE_PER_TICK, room), got = 0;
    if (budget <= 0 || a.next >= a.n || a.rel[a.next] > a.t) return;
    const orm = w.onRemove; w.onRemove = null;   // one dust cloud for the slab (runFx), not one puff per cell
    try {
      while (a.next < a.n && a.rel[a.next] <= a.t && budget > 0) {
        const q = a.next++, i = a.ci[q], j = a.cj[q], k = a.ck[q];
        const it = w.removeCell(i, j, k, false);
        if (!it) { a.skipped++; continue; }
        if (a.bot[q]) w.stabQueue.push({ i, j, k });   // the roofs under the scar are asked, one cell a column
        const sp = 1 + 0.5 * Math.min(1, (a.rel[q] - a.rel[0]) / 1.5);
        const v0 = 1.6 + 0.08 * a.length * sp;
        const bi = s.spawn(it.sp, it.vr, cellX(i), cellY(j) + 0.05, cellZ(k), a.dx * v0 + (Math.random() - 0.5) * 0.8, 0.25, a.dz * v0 + (Math.random() - 0.5) * 0.8, 2);
        if (bi < 0) { w.setCell(i, j, k, it.sp, it.vr); a.skipped++; continue; }   // no room in the sim: the cell goes back, nothing is lost
        s.tag[bi] = 1; s.en[bi] = 0.01;   // (a body that carries a trace of slide energy hits the pile without starting little slides of its own: onKick and onFreeze read it)
        a.released++; budget--; got++;
        if (!a.tFirst) a.tFirst = a.t;
      }
    } finally { w.onRemove = orm; }
    if (got) {
      a.tLast = a.t; this.live += got;
      g.S.stats.slides = (g.S.stats.slides || 0) + got;
      if (!a.counted && a.released >= AV.REAL) {   // a real slide: counted once, for the Rockslide and Avalanche Chaser achievements (a small soft slide is a Rockslide, not an avalanche)
        a.counted = true; g.S.stats.bigSlides = (g.S.stats.bigSlides || 0) + 1; if (!a.soft) g.S.stats.avalanches = (g.S.stats.avalanches || 0) + 1;
        if (!a.soft && (a.by === 'climb' || a.by === 'guest')) g.S.stats.climbSlabs = (g.S.stats.climbSlabs || 0) + 1;
        g.slide.burstCool = Math.max(g.slide.burstCool || 0, 15);   // the topple counter does not count the same slide a second time
      }
    }
  }

  // every live body of the slide: drive it down the face, slow it on the flat, freeze the slow ones, bound the travel, carry the riders
  flow(a, dt) {
    const g = this.g, s = g.sim, w = g.world;
    const pl = g.player.pos, host = g.net && g.net.open && g.net.role === 'host' && g.remote;
    const rp = host ? g.remote.pos : null;
    const hard = a.t > a.hard, drive = a.t < a.flowT;
    let live = 0, cx = 0, cy = 0, cz = 0, cn = 0, dMin = 1e9, nA = 0, ax = 0, ay = 0, az = 0, nB = 0, bx = 0, by = 0, bz = 0;
    let budget = hard ? 220 : 60, placed = 0;
    const top = (i, k) => w.topAt(i, k);
    for (let i = s.n - 1; i >= 0; i--) {
      if (s.tag[i] !== 1) continue;
      const x = s.x[i], y = s.y[i], z = s.z[i];
      let vx = s.vx[i], vy = s.vy[i], vz = s.vz[i];
      const age = s.age[i], ci = toI(x), ck = toK(z), tp = top(ci, ck) * C;
      // the sheet is driven down the slope while it flows (a little fluidized, like snow), and braked on the flat
      let flat = false;
      if (y - tp < 2.5) {
        const gi = top(ci - 3, ck) - top(ci + 3, ck), gk = top(ci, ck - 3) - top(ci, ck + 3), gm = Math.hypot(gi, gk), tan = gm / 6;
        if (tan > 0.15) {
          if (drive && age < 6) {   // fluidized: the sheet is pushed toward a speed that grows with the steepness, so a bench or a jam does not stop it
            const sp = Math.hypot(vx, vz), vt = 2.5 + 9 * Math.min(1, tan / 0.9);
            if (sp < vt && sp < a.vmax) { const acc = a.acc * dt / gm; vx += gi * acc; vz += gk * acc; }
          }
        } else if (y - tp < 1.2) { flat = true; const k = Math.max(0, 1 - 2.4 * dt); vx *= k; vz *= k; }
        s.vx[i] = vx; s.vz[i] = vz;
      }
      const sp2 = vx * vx + vy * vy + vz * vz;
      // where it is for the rest of the world
      const dxp = x - pl.x, dzp = z - pl.z, dyp = y - (pl.y + 0.9), d2p = dxp * dxp + dyp * dyp + dzp * dzp;
      if (d2p < dMin) dMin = d2p;
      if (d2p < 14) { nA++; ax += vx; ay += vy; az += vz; }
      if (rp) { const ex = x - rp.x, ey = y - (rp.y + 0.9), ez = z - rp.z; if (ex * ex + ey * ey + ez * ez < 14) { nB++; bx += vx; by += vy; bz += vz; } }
      if ((live & 7) === 0) { cx += x; cy += y; cz += z; cn++; }
      // the end of its life: travelled too far, time is up, far away and slow, or slow on the flat after the flow
      let done = false;
      if (hard) done = true;
      else if (Math.hypot(x - s.ox[i], z - s.oz[i]) > a.maxTravel) done = true;
      else if (age > 1.2 && sp2 < 1.0 && (flat || !drive || age > 3)) done = true;
      else if (!drive && sp2 < 9) done = true;   // the flow is over: whatever is still creeping goes into the pile
      else if (age > 2 && sp2 < 9 && d2p > 3600 && (!rp || (x - rp.x) ** 2 + (z - rp.z) ** 2 > 3600)) done = true;
      if (done && budget > 0) { budget--; if (this.place(i)) { placed++; continue; } }
      live++;
    }
    a.placed += placed; this.live = live; a.peakLive = Math.max(a.peakLive, live);
    this.dMin = Math.sqrt(dMin);
    a.cx = cn ? cx / cn : a.cx; a.cy = cn ? cy / cn : a.cy; a.cz = cn ? cz / cn : a.cz; a.cn = cn;
    if (g.dead) a.rider = false;   // a player who dies and wakes up somewhere else is not carried by the old slab (the flow sets who rides at its start: see startRun)
    if (nA >= 3) this.applyRide(ax / nA, ay / nA, az / nA, nA, dt);
    else if (a.rider && a.released > 0 && a.t < (a.soft ? 0.9 : a.flowT + 1) && pl.y > 1.5 && !g.dead) this.applyRide(0, 0, 0, 0, dt);   // no plush within reach: the slope still carries the rider
    if (rp && nB >= 3) {
      a.rideNetT -= dt;
      if (a.rideNetT <= 0) { a.rideNetT = 0.1; this.net({ t: 'avride', vx: +(bx / nB).toFixed(2), vy: +(by / nB).toFixed(2), vz: +(bz / nB).toFixed(2), n: nB }); }
    }
  }

  // put a loose body into the pile: nearest supported gap first, then the top of the nearest column. Never loses it.
  place(i) {
    const g = this.g, s = g.sim, w = g.world;
    if (s.tryFreeze(i) || s.forceFreeze(i)) { s.remove(i); return true; }
    const ci = toI(s.x[i]), ck = toK(s.z[i]), pl = g.player.pos;
    for (let r = 0; r <= 8; r++) {
      for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dk)) !== r) continue;
        const a = ci + di, c = ck + dk, j = w.topAt(a, c);
        if (j >= NY || !w.inside(a, j, c) || w.get(a, j, c) !== 0 || w.reserved.has((j * NZ + c) * NX + a)) continue;
        if ((cellX(a) - pl.x) ** 2 + (cellZ(c) - pl.z) ** 2 < 0.5 && Math.abs(cellY(j) - pl.y - 0.5) < 1.2) continue;   // not on top of the player
        if (s.sp[i] === NEEDLE) w.needle = { i: a, j, k: c };
        w.setCell(a, j, c, s.sp[i], s.vr[i]);
        s.remove(i);
        return true;
      }
    }
    return false;
  }

  // the last resort: every body of the slide is placed now (budgeted by the caller's loop count)
  sweep(a, max) {
    const s = this.g.sim; let n = 0;
    for (let i = s.n - 1; i >= 0 && n < max; i--) if (s.tag[i] === 1 && this.place(i)) { n++; a.forced++; }
    this.live = 0; for (let i = 0; i < s.n; i++) if (s.tag[i] === 1) this.live++;
  }

  finish(a, how) {
    const g = this.g;
    this.last = { how, cells: a.cells0, released: a.released, skipped: a.skipped, left: a.left || 0, placed: a.placed, forced: a.forced, peakLive: a.peakLive, secs: +(a.t).toFixed(2), width: a.width, length: a.length, depth: a.depth, by: a.by, perf: { ...this.perf, avg: this.perf.n ? this.perf.ms / this.perf.n : 0 } };
    this.cur = null; this.live = 0;
    if (a.soft) this.cool = Math.max(this.cool, AV.COOL_SOFT);   // (a small slide does not use up the slope: the next slab can come soon, but not at once)
    else { this.cool = AV.COOL; this.stress = 0; }
    this.freeBots(); this.botWatch = 25;
    if (g.softslide) g.softslide.onFinish(a, how);   // the pile settles round whoever it carried: how deep they are buried (softslide.js)
    this.net({ t: 'avend', x: +(a.cx || a.x).toFixed(1), z: +(a.cz || a.z).toFixed(1), ...(a.soft ? { k: 's' } : {}) });
    this.sfx('thud', a.cx || a.x, 1, a.cz || a.z, 1);
    g.dust.add(a.cx || a.x, 1, a.cz || a.z, 0.05);
  }

  // a bot that stood still on the pile can end up inside the runout (the sim only keeps the player's own body clear of settling plush): it is lifted to the surface of its column
  freeBots() {
    const g = this.g, w = g.world, crew = g.S && g.S.crew; if (!crew || !g.crew) return;
    for (const b of crew) {
      if (!Number.isFinite(b.x + b.y + b.z)) continue;
      const i = toI(b.x), k = toK(b.z);
      if (w.solid(i, toJ(b.y + g.crew.radius(b)), k)) { b.y = w.topAt(i, k) * C + 0.05; b.vy = 0; }
    }
  }

  // ======================= the rider =======================
  // the plush around you carry you: your velocity follows theirs, the keys steer a little
  applyRide(vx, vy, vz, n, dt) {
    const g = this.g, p = g.player;
    const k = Math.min(1, 7 * dt) * Math.min(1, n / 6);
    p.vel.x += (vx - p.vel.x) * k; p.vel.z += (vz - p.vel.z) * k;
    if (vy < p.vel.y) p.vel.y += (vy - p.vel.y) * k;
    p.swept = 0.5;
    // on top of the sheet you go where it goes: the slope keeps pulling you down it while it flows, so you reach the foot with it
    const sl = this.slope(toI(p.pos.x), toK(p.pos.z)), a = this.cur;
    if (sl && sl.tan > 0.15 && a && a.t < a.flowT + 1 && p.pos.y > 1.2 && (!a.soft || n >= 3 || a.t < 0.9)) {   // (a soft slide only drives you while plush is round you: you never run ahead of the sheet)
      const sp = Math.hypot(p.vel.x, p.vel.z);
      if (sp < a.vmax - 3) { const acc = a.ride * Math.min(1, sl.tan / 0.7) * dt; p.vel.x += sl.dx * acc; p.vel.z += sl.dz * acc; }
    }
    // a soft slide carries you at most as far as its plush may run: past that you slow to a stop (inside the runout, not beyond it)
    if (a && a.soft) {   // (and the sheet funnels you toward its own centre line, so you end inside the pile you rode)
      const px = p.pos.x - a.x, pz = p.pos.z - a.z, v = -px * a.dz + pz * a.dx, kv = Math.min(1.5, Math.abs(v)) * 2.2 * dt * Math.sign(-v);
      p.vel.x += -a.dz * kv * 1; p.vel.z += a.dx * kv * 1;
      const dd = Math.hypot(px, pz); if (dd > a.maxTravel * 0.8) { const kd = Math.min(1, 6 * dt); p.vel.x -= p.vel.x * kd; p.vel.z -= p.vel.z * kd; } }
    this.noteRide(Math.hypot(p.vel.x, p.vel.z), dt);
  }
  noteRide(speed, dt) {
    if (this.rideT <= 0) this.shieldLeft = this.rideSoft ? 6 : 12;   // the damage budget of one ride
    this.rideT = 0.7; this.rideV = Math.max(speed, this.rideV * Math.exp(-dt / 0.3));
    this.roll = Math.sin(this.g.time * 3.3) * 0.1 * Math.min(1, speed / 8);
    this.g.shake = Math.max(this.g.shake, 0.28 * this.g.T.shakeMul);
  }
  // the host told the guest it is in the flow
  rideFromHost(m) {
    const g = this.g, p = g.player, vx = +m.vx, vy = +m.vy, vz = +m.vz;
    if (!Number.isFinite(vx + vy + vz) || g.mode !== 'play') return;
    const c = (v) => clamp(v, -AV.VMAX * 1.5, AV.VMAX * 1.5);
    const k = 0.55;
    p.vel.x += (c(vx) - p.vel.x) * k; p.vel.z += (c(vz) - p.vel.z) * k; if (c(vy) < p.vel.y) p.vel.y += (c(vy) - p.vel.y) * k;
    p.swept = 0.5;
    this.noteRide(Math.hypot(p.vel.x, p.vel.z), 0.1);
  }
  rideTick(dt) {
    if (this.rideT <= 0) { this.roll *= Math.exp(-dt * 4); if (this.shieldLeft > 0 && !this.cur) this.shieldLeft = Math.max(0, this.shieldLeft - dt * 6); return; }
    const g = this.g, p = g.player, sp = Math.hypot(p.vel.x, p.vel.z);
    this.rideV = Math.max(sp, this.rideV * Math.exp(-dt / 0.3));
    this.rideT -= dt;
    if (this.rideT <= 0) {   // the ride is over: a hard stop at the bottom costs a few points, a soft one nothing
      const hit = this.rideV - sp;
      if (hit > 7 && !g.dead && !this.rideSoft) g.hurtPlayer(Math.min(10, (hit - 7) * 1.5), AV.WHY);   // (a soft slide, softslide.js, sets you down gently: nothing at the stop)
      this.rideV = 0; p.swept = 0;
      if (this.cur === null && !g.isGuest()) g.S.stats.rides = (g.S.stats.rides || 0) + 1;
    }
  }
  // hurtPlayer calls this: while a slide carries you, falling plush and hard landings cost a little and never everything
  shield(n, why) {
    const sf = this.g.softslide;
    if (sf && why === 'were crushed under falling plush' && (sf.on || sf.armT > 0)) return 0;   // (plush shaken loose while a soft slide holds you, or in the seconds after it, costs nothing)
    const riding = this.rideT > 0;
    if (!(riding || (this.cur && this.dMin < 30))) return n;
    if (this.rideSoft && (why === AV.WHY || why === 'were crushed under falling plush' || why === 'the pile gave way')) return 0;
    if (this.rideSoft && why === 'fell too far') { const room = Math.max(0, this.g.hp - 12); n = Math.min(n, 3, this.shieldLeft, room); this.shieldLeft = Math.max(0, this.shieldLeft - n); return n; }   // (a fall while a soft slide carries you: at most a few points, six in all)   // a soft slide never hurts: the plush that flows under and around you is not a blow (a real fall still is, below)
    const mine = why === AV.WHY;
    // plush that hits you near the flow is cushioned; a landing or a patch that gives way is only cushioned while the flow is carrying you (a jump off a ledge beside the slide is not)
    if (!mine && why !== 'were crushed under falling plush' && !(riding && (why === 'fell too far' || why === 'the pile gave way'))) return n;
    const g = this.g, room = Math.max(0, g.hp - 12);
    n = Math.min(n, mine ? 8 : 4, mine ? 8 : this.shieldLeft, room);
    this.shieldLeft = Math.max(0, this.shieldLeft - n);
    return n;
  }

  // ======================= what you see and hear =======================
  // all the sound of an avalanche is here (positional: sound.at(x, y, z, class))
  sfx(kind, x, y, z, p = 1) {
    const s = this.g.sound; if (!s || !Number.isFinite(x + y + z)) return;
    if (kind === 'creak') s.at(x, y, z, 'creak').creak(0.4);
    else if (kind === 'rumble') { const v = s.at(x, y, z, 'slide'); v.rumble(p); v.soft(0.1); }
    else if (kind === 'debris') s.at(x, y, z, 'fall').debris(Math.min(0.25, 0.1 * p));
    else if (kind === 'thud') s.at(x, y, z, 'fall').thump(0.3 * p, 70);
  }

  crackLine(x, y, z, dx, dz, w, count, fx, back = AV.BACK) {   // a line of dust along the crown, across the slope
    const g = this.g, wd = g.world;
    for (let n = 0; n < count; n++) {
      const v = (n / Math.max(1, count - 1) - 0.5) * w, px = x - dx * back - dz * v, pz = z - dz * back + dx * v;
      const t = wd.topAt(toI(px), toK(pz));
      fx(px, t * C + 0.1, pz);
    }
  }
  warnFx(a, first, dt = 0) {
    const g = this.g;
    if (first) {
      this.sfx('creak', a.x, a.y, a.z); this.sfx('creak', a.x, a.y + 1, a.z);
      g.shake = Math.max(g.shake, 0.18 * g.T.shakeMul);
    }
    a.fxT -= dt;
    if (first || a.fxT <= 0) { a.fxT = 0.12; this.crackLine(a.x, a.y, a.z, a.dx, a.dz, a.width, 14, (px, py, pz) => g.fx.dust(px, py, pz, 1, 0.5, 0.6), a.back); }
  }
  runFx(a, dt) {
    const g = this.g, s = g.sim;
    a.sndT -= dt; a.fxT -= dt; a.netT -= dt;
    const prog = a.n ? a.next / a.n : 1, fade = a.next >= a.n ? clamp(1 - (a.t - a.tLast) / 7, 0.2, 1) : 1;
    const power = (0.55 + 0.75 * prog) * fade * clamp(this.live / 400, 0.4, 1.3);
    if (a.sndT <= 0 && this.live > 0) { a.sndT = 0.9; this.sfx('rumble', a.cx, a.cy, a.cz, power); this.sfx('debris', a.cx, a.cy, a.cz, power); }
    if (a.fxT <= 0 && this.live > 0) {
      a.fxT = 0.06; let n = 0;
      for (let q = 0; q < 10 && s.n > 0; q++) { const i = (Math.random() * s.n) | 0; if (s.tag[i] !== 1) continue; if (Math.hypot(s.vx[i], s.vz[i]) > 2.5) { g.fx.dust(s.x[i], s.y[i] + 0.2, s.z[i], 2, 0.9, 0.9); n++; } }
      if (n) g.dust.add(a.cx, a.cy + 0.5, a.cz, 0.0015 * n);
    }
    // shake: the nearer the sheet, the harder
    if (this.live > 20 && this.dMin < 26) g.shake = Math.max(g.shake, Math.min(0.7, (1 - this.dMin / 26) * 0.7 * clamp(this.live / 300, 0.3, 1)) * g.T.shakeMul);
    if (a.netT <= 0 && this.live > 0) { a.netT = 0.5; this.net({ t: 'avrun', x: +a.cx.toFixed(1), y: +a.cy.toFixed(1), z: +a.cz.toFixed(1), p: +power.toFixed(2), n: this.live }); }
  }

  // ======================= the guest =======================
  guestMsg(m) {
    const g = this.g, num = (v) => Number.isFinite(+v) ? +v : NaN;
    switch (m.t) {
      case 'avwarn': {
        const x = num(m.x), y = num(m.y), z = num(m.z), dx = num(m.dx), dz = num(m.dz), w = clamp(num(m.w), 2, 40);
        if (!Number.isFinite(x + y + z + dx + dz + w)) return;
        this.guestOn = AV.HARD + 12;   // the host's slab runs (until its avend); the slope is not asked for a second one
        this.rideSoft = m.k === 's';
        if (this.ask > 0) { this.ask = 0; this.dropLoad(m.k === 's' ? 0.3 : 0.5); }   // the answer to this guest's request: half of what it carries falls out of its hands
        this.sfx('creak', x, y, z); g.shake = Math.max(g.shake, 0.12 * g.T.shakeMul);
        this.crackLine(x, y, z, dx, dz, w, 14, (px, py, pz) => g.fx.dust(px, py, pz, 1, 0.5, 0.6), m.k === 's' ? AV.BACK_SOFT : AV.BACK);
        if (Math.hypot(x - g.player.pos.x, z - g.player.pos.z) < 40) g.ui.hint(m.k === 's' ? '<b>The pile gives way!</b> A patch of the slope is flowing downhill.' : '<b>The slope cracks!</b> A sheet of the pile is letting go.', 4);
        break;
      }
      case 'avrun': {
        const x = num(m.x), y = num(m.y), z = num(m.z), pw = clamp(num(m.p), 0, 2), n = num(m.n);
        if (!Number.isFinite(x + y + z + pw + n)) return;
        this.sfx('rumble', x, y, z, pw); this.sfx('debris', x, y, z, pw);
        const d = Math.hypot(x - g.player.pos.x, z - g.player.pos.z);
        if (d < 26) g.shake = Math.max(g.shake, Math.min(0.7, (1 - d / 26) * 0.7) * g.T.shakeMul);
        for (let q = 0; q < 4; q++) g.fx.dust(x + (Math.random() - 0.5) * 6, y, z + (Math.random() - 0.5) * 6, 2, 0.9, 0.9);
        this.guestRun = 1.5;
        break;
      }
      case 'avend': { const x = num(m.x), z = num(m.z); if (Number.isFinite(x + z)) this.sfx('thud', x, 1, z, 1); this.guestRun = 0; this.guestOn = 0; this.cool = m.k === 's' ? AV.COOL_SOFT : AV.COOL; if (m.k === 's' && g.softslide) g.softslide.arm(); break; }
      case 'avride': this.rideFromHost(m); break;
    }
  }
  guestUpdate(dt) {
    this.rideTick(dt);
    if (this.guestRun > 0) this.guestRun -= dt;
    this.cool = Math.max(0, this.cool - dt); this.ask = Math.max(0, this.ask - dt); this.guestOn = Math.max(0, this.guestOn - dt);
    if (this.stress > 0) this.stress = Math.max(0, this.stress - dt * 0.04);   // (the host's clock, update(), does not run on a guest)
  }
}
