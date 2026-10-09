import { C, NX, NY, NZ, cellX, cellY, cellZ, toI, toJ, toK } from './config.js';
import { isSpecialCell, NEEDLE } from './plushdata.js';

// ---------------------------------------------------------------------------------------------
// THE SLIDE (one mechanic). Up on the pile the footing can give way. There is no crack and no punch: a creak, the plush under your boots
// shift and sink (0.4 to 0.8 s), and then the footing goes. The slide is a WEDGE that grows from where you stand, like loose snow:
//
//  1. Trigger (game.climbRisk): the player's own spot, from the height, the gear and the load. Not a hit. A rope anchor holds the slope.
//  2. Apex: only the TOP LAYER of 2 or 3 columns under your feet (1 or 2 cells deep) breaks away. Everything else is entrainment.
//  3. Entrainment (grow): moving plush touch the surface plush beside and below them. A column next to the slide (inside the wedge angle,
//     20 to 35 degrees each side of the downhill line, wider on a steeper face, from higher up and with a heavier load) is released when the
//     moving mass beside it carries enough energy. The cohesion of the pile grows with depth: a cell d cells under the surface needs
//     THR_BASE + THR_DEPTH x d^2 (m^2/s^2 of speed squared), so the flow strips the loose layer (1 to 3 cells) and cannot dig deeper.
//     Each cell that joins costs energy: it takes from the slide's energy budget E0 (cells x (1 + COST_D x d^2)) and it shares the momentum
//     of the bodies that triggered it (their speed drops by m/(m + cells)). The wedge is the footprint this cascade leaves. Nothing is planned.
//  4. Stopping: every moving body loses speed to friction that grows with the plush piled round it (the density of the flow) and with the
//     height of the pile that has already landed under it, with the slope flattening, and, as E0 is spent, the flow loses its push. A body
//     slower than V_STOP for FREEZE_T seconds is frozen back into a cell, the pile at the bottom grows, friction grows for what arrives
//     behind it, and the slide stacks up from the bottom. The body cap, the time cap and the travel bound are a safety net only.
//  5. Sizes come out of the energy E0 (height, steepness, load, gear): a small slide frees about 40 to 80 plush, a medium one 150 to 400, a big
//     one 450 to 900.
//  6. The player rides the flow (no hp from the slide, the existing bounded fall damage only) and the pile that lands buries them (burial.js).
// Multiplayer: the host simulates. avwarn carries the wedge parameters (apex, direction, spread, length, seed), the guest sees the same
// cells through the usual cell diffs and the capped body stream, and asks with the `sslide` command which the host judges again.
// ---------------------------------------------------------------------------------------------
export const WEDGE = {
  H_MIN: 8,                 // m: the footing can give way from here
  H_HIGH: 19,               // m: Rope Anchors and Climbing Gear are worth mentioning from here (hint only)
  MIN_TAN: 0.2,             // the least slope a slide can start on
  SPREAD: [20, 35],         // degrees each side of the downhill line
  APEX_COLS: [2, 3],        // columns that break away under your feet
  APEX_CELLS: [3, 12],      // cells at the start
  E_BAND: { small: [46, 74], medium: [185, 430], big: [560, 940] },   // energy E0 (cell units) of the three sizes
  COST_AVG: 1.4,            // cells per energy unit on average (the sizes below are E0 / this)
  COST_D: 0.6,              // extra energy a cell costs per depth squared
  THR_BASE: 5, THR_DEPTH: 14, D_MAX: 3,   // speed squared (m^2/s^2) needed to free a cell at depth 0, and the rise per depth squared
  E_MIN_ENT: 4,             // horizontal speed squared a body must have to free anything
  RATE: 9,                  // per second: how fast a column next to fast plush lets go
  MAX_CELLS: 900,           // a slide never frees more than this (a safety net: the energy sizes it)
  BODY_CAP: 1500, SIM_CAP: 2300, RELEASE_PER_TICK: 90,
  WARN_STILL: 0.8, WARN_MOVE: 0.4,
  HARD: [12, 20],           // s after the first release: whatever is left is placed (a safety net)
  TRAVEL: [24, 44],         // m a body may run at the most (a safety net: the friction ends a normal slide well before)
  VMAX: [6, 10], ACC: 8, RIDE: 5,
  MU0: 0.10, MU_N: 0.024, MU_P: 0.16, MU_SPENT: 0.30, MU_FLAT: 0.5,   // extra friction (x gravity): base, per body round it, per cell of landed pile, once E0 is spent, on the flat
  FRONT_FILL: 0.7, FRONT_COLS: 1.3, FRONT_SLACK: 3,   // the front may not outrun the wedge: a column at u cells is free only while what has been spent would fill 70% of the wedge to within 3 cells of it (1.3 energy a column)
  V_STOP: 0.7, FREEZE_T: 0.3,
  GEAR_CARRY: 0.45,         // gear at the top shortens the carry by this much
  COOL: [6, 18], GUEST_CD: 5,
  REAL: 12,                 // cells that make it a real slide (the Rockslide achievement)
  WHY: 'were thrown down the pile by a slide',
};
const P = WEDGE;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const G = 15;
const mulberry = (s) => () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// what the climber has on: Climbing Gear (3 tiers) matters most, shoes and springs a little. (A rope anchor is checked apart.)
export function gearOf(T) {
  const climb = T.climb || 0;
  const boots = clamp(((T.walk || 4) - 4) / 2, 0, 1), springs = clamp(((T.jump || 6) - 6) / 2.7, 0, 1);
  const score = Math.min(1, 0.34 * climb + 0.08 * boots + 0.06 * springs);
  return { climb, boots, springs, score };
}

export class Wedge {
  constructor(game) {
    this.g = game;
    this.cur = null;          // the slide in progress (host only)
    this.last = null;         // numbers of the last finished slide
    this.cool = 0;
    this.stress = 0;          // every footing check that held up high makes the next one a little likelier
    this.live = 0;            // loose bodies of the slide right now
    this.rideT = 0; this.ridePeak = 0; this.rideV = 0; this.shieldLeft = 0;
    this.roll = 0;            // camera roll while carried
    this.perf = { n: 0, ms: 0, max: 0 };
    this.guestT = 0; this.guestRun = 0; this.dMin = 1e9;
    this.botWatch = 0; this.botT = 0;
    this.ask = 0;             // guest: seconds a request to the host is still waiting for its warning
    this.guestOn = 0;         // guest: seconds the host's slide is believed to be running (until its avend)
    this.guestCd = 0;         // host: a guest may ask again at this g.time
    this.gw = null;           // guest: the wedge the host announced (apex, direction, spread, length, seed)
    this._seen = {};
  }

  clear() {
    this.cur = null; this.cool = 0; this.botWatch = 0; this.ask = 0; this.guestOn = 0; this.guestRun = 0; this.stress = 0; this.live = 0; this.rideT = 0; this.ridePeak = 0; this.rideV = 0; this.roll = 0; this.shieldLeft = 0; this.gw = null; this._seen = {};
    const s = this.g.sim; if (s && s.tag) for (let i = 0; i < s.n; i++) s.tag[i] = 0;
    if (this.g.player) this.g.player.swept = 0;
  }

  // ======================= the odds and the size =======================
  // the footing check of climbRisk is scaled by this (gear and repeated stress)
  oddsMul() {
    const gear = gearOf(this.g.T);
    return (1 - 0.12 * gear.boots - 0.08 * gear.springs) * (1 + 0.05 * Math.min(6, this.stress));
  }
  // climbRisk calls this when the check held (high up): the next one is a little likelier
  holdUp(pos) { if (pos.y >= P.H_HIGH) this.stress = Math.min(6, this.stress + 1); }

  // the hint that says why it is safe or why it is not (once per state)
  advise(pos) {
    const g = this.g;
    if (pos.y < P.H_HIGH || !g.ui) return;
    const roped = g.ropedIn(pos), gear = gearOf(g.T);
    const key = roped ? 'rope' : gear.climb >= 3 ? 'gear' : 'risk';
    if (this._seen[key]) return; this._seen[key] = true;
    if (key === 'risk') g.ui.hint(`<b>Slide risk.</b> Above ${P.H_HIGH} m the footing can go and a widening slide carries you down and buries you: the higher, the steeper and the heavier you are, the bigger it is. Climbing Gear and Rope Anchors planted as you climb lower the odds and shorten the ride.`, 7);
    else if (key === 'gear') g.ui.hint('<b>Gear helps.</b> Climbing Gear 3 gives the best odds and the shortest ride. A slide can still start, and what lands on you still buries you.', 5);
  }

  // the energy E0 of a slide that starts at pos on a slope of steepness tan carrying carryN plush (a pure function of the numbers and the roll)
  size(pos, carryN, tan, rnd = Math.random, eForce) {
    const g = this.g, gear = gearOf(g.T);
    const hN = clamp((pos.y - P.H_MIN) / 32, 0, 1), sN = clamp((tan - 0.3) / 1.3, 0, 1), lN = clamp(carryN / Math.max(1, g.T.carry || 1), 0, 1);
    const e = eForce ?? clamp(0.36 * hN + 0.16 * sN + 0.24 * lN + 0.14 * (1 - gear.score) * (0.4 + 0.6 * hN) + 0.10 * rnd(), 0, 1);
    const cls = e < 0.3 ? 'small' : e < 0.7 ? 'medium' : 'big';
    const [b0, b1] = P.E_BAND[cls], t = cls === 'small' ? e / 0.3 : cls === 'medium' ? (e - 0.3) / 0.4 : (e - 0.7) / 0.3;
    const E0 = lerp(b0, b1, clamp(t, 0, 1));
    const nExp = E0 / P.COST_AVG;
    const wide = clamp(0.45 * sN + 0.35 * hN + 0.20 * lN + (rnd() - 0.5) * 0.2, 0, 1);
    const theta = lerp(P.SPREAD[0], P.SPREAD[1], wide), tanT = Math.tan(theta * Math.PI / 180);
    const c0 = 3, D0 = e < 0.4 ? 1 : 2;
    const a0c = c0 * 0.5 + 0.25, Davg = (cls === 'small' ? 1.2 : cls === 'medium' ? 1.7 : 2.0) * 0.8, Cn = 1.55 * nExp / Davg;
    const Lc = (-a0c + Math.sqrt(a0c * a0c + tanT * Cn)) / tanT;   // cells: the wedge has room for 1.55 x the cells the energy can free
    const carryMul = 1 - P.GEAR_CARRY * gear.score;
    return {
      e, E0, cls, nExp: Math.round(nExp), theta, tanT, c0, D0, Lm: Lc * C, a0: a0c * C, carryMul,
      hard: lerp(P.HARD[0], P.HARD[1], e), vmax: lerp(P.VMAX[0], P.VMAX[1], e),
      travel: lerp(P.TRAVEL[0], P.TRAVEL[1], e) * carryMul + Lc * C * 0.3,
    };
  }

  // ======================= the trigger =======================
  // climbRisk (game.js) calls this when the footing gave way. true when a slide runs (or was asked for)
  onClimbHit(pos, carryN) {
    const g = this.g;
    if (this.cur || this.guestOn > 0) return false;
    if (this.ask > 0) return true;                        // a guest's request is on its way
    if (this.cool > 0 || g.burial.resting()) return false;
    const vel = g.player.vel, speed = Math.hypot(vel.x, vel.z);
    if (g.isGuest()) {
      const sl = this.slope(toI(pos.x), toK(pos.z)); if (!sl || sl.tan < P.MIN_TAN) return false;
      this.ask = 3;
      g.cmd('sslide', { x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), n: carryN, sp: +speed.toFixed(2), cl: g.T.climb || 0 });
      return true;
    }
    const a = this.start(pos, { speed, carry: carryN, by: 'climb' });
    if (!a) return false;
    this.dropLoad(0.2 + 0.25 * a.e);                      // some of what you carry falls out of your hands
    return true;
  }

  // part of what you carry falls out of your hands
  dropLoad(frac = 0.5) {
    const g = this.g, p = g.player;
    const lose = Math.min(g.S.carry.length, Math.ceil(g.S.carry.length * frac));
    for (let n = 0; n < lose; n++) { const it = g.S.carry.pop(); g.sim.spawn(it.sp, it.vr, p.pos.x, p.pos.y + 1.2, p.pos.z, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, 0); }
    if (lose) g.ui.setCarry(g.S.carry, g.T.carry);
    return lose;
  }

  // the host runs a slide for a guest whose footing gave way. Everything it says is judged again: where the guest really is, how high, how often.
  fromGuest(d) {
    const g = this.g;
    if (g.isGuest() || !g.remote || !d || this.cur || this.cool > 0) return false;
    if (this.guestCd > g.time) return false;
    const rp = g.remote.pos, claim = { x: +d.x, y: +d.y, z: +d.z };
    if (!Number.isFinite(claim.x + claim.y + claim.z) || !Number.isFinite(rp.x + rp.y + rp.z)) return false;
    if (Math.hypot(claim.x - rp.x, claim.z - rp.z) > 8 || Math.abs(claim.y - rp.y) > 8) return false;   // it has to be where the guest really is
    if (rp.y < P.H_MIN - 1) return false;                                                               // and high enough that the footing can give way
    if (g.ropedIn(rp)) return false;
    const pos = { x: rp.x, y: rp.y, z: rp.z };            // the host's own view of the guest is what it judges and breaks
    const n = clamp(Math.round(+d.n || 0), 0, 200), sp = clamp(+d.sp || 0, 0, 20);
    this.guestCd = g.time + P.GUEST_CD;
    return !!this.start(pos, { speed: sp, carry: n, by: 'guest', climb: clamp(Math.round(+d.cl || 0), 0, 3) });
  }

  // ======================= the ground =======================
  // downhill direction and steepness at a column (cells of rise per cell of run), from three windows
  slope(i0, k0) {
    const w = this.g.world; let gi = 0, gk = 0;
    for (const s of [2, 4, 6]) { gi += w.topAt(i0 - s, k0) - w.topAt(i0 + s, k0); gk += w.topAt(i0, k0 - s) - w.topAt(i0, k0 + s); }
    const gm = Math.hypot(gi, gk);
    return gm < 1e-6 ? null : { dx: gi / gm, dz: gk / gm, tan: gm / 24 };
  }
  // where the flow would end up: follow the steepest way down from here to the floor
  foot(x, z) {
    const w = this.g.world; let path = 0, flat = 0;
    for (let n = 0; n < 260; n++) {
      const i = toI(x), k = toK(z), t = w.topAt(i, k);
      if (t <= 2) break;
      const s = this.slope(i, k);
      if (!s || s.tan < 0.06) { if (++flat > 10) break; if (!s) break; } else flat = 0;
      x += (s ? s.dx : 0) * C; z += (s ? s.dz : 0) * C; path += C;
    }
    return { x, z, path };
  }

  // anything that holds the surface of a column: a machine within a metre, a rope anchor, a support, a belt, a rail, a frame (logi.cellTaken in the three cells above the surface)
  held(i, k, a) {
    const key = k * NX + i; let b = a.holdMemo.get(key);
    if (b !== undefined) return b;
    const g = this.g, w = g.world, lg = g.logi, x = cellX(i), z = cellZ(k);
    b = false;
    if (a.hold.has(key) || a.hold.has(key + 1) || a.hold.has(key - 1) || a.hold.has(key + NX) || a.hold.has(key - NX)) b = true;
    if (!b && lg) { const t = w.topAt(i, k); for (let j = t; j < t + 3 && !b; j++) b = !!lg.cellTaken(i, j, k); }
    if (!b && w.supports && w.supports.length > 0 && w.supportBonus(x, cellY(w.topAt(i, k) - 1), z) > 0) b = true;
    if (!b) for (const e of a.ropes) if (Math.hypot(e.x - x, e.z - z) < 6 && Math.abs(e.y - cellY(w.topAt(i, k) - 1)) < 5) { b = true; break; }
    a.holdMemo.set(key, b);
    return b;
  }

  // ======================= start =======================
  // start a slide at pos (host). o: speed (how fast the climber moves, for the warning), carry, by, rnd, e (a size), warn, size (overrides)
  start(pos, o = {}) {
    const g = this.g, w = g.world;
    if (this.cur || g.isGuest()) return null;
    const i0 = toI(pos.x), k0 = toK(pos.z), sl = this.slope(i0, k0);
    if (!sl || sl.tan < (o.minTan ?? P.MIN_TAN)) return null;
    const rnd = o.rnd || Math.random;
    const sz = { ...this.size(pos, o.carry || 0, sl.tan, rnd, o.e), ...(o.size || {}) };
    const { dx, dz } = sl, ax = cellX(i0), az = cellZ(k0);
    // anything standing near the slide holds its columns
    const reach = sz.Lm + 10, hold = new Set(), ropes = [];
    for (const it of g.machines.items.values()) {
      const e = it.ent; if (!e) continue;
      if (e.type === 'rope') { ropes.push(e); continue; }
      if (!Number.isFinite(e.x + e.z) || Math.hypot(e.x - pos.x, e.z - pos.z) > reach) continue;
      const ci = toI(e.x), ck = toK(e.z), r = Math.ceil(1.0 / C);
      for (let a2 = -r; a2 <= r; a2++) for (let b2 = -r; b2 <= r; b2++) hold.add((ck + b2) * NX + ci + a2);
    }
    const st = { dx, dz, ax, az, a0: sz.a0, tanT: sz.tanT, Lm: sz.Lm, holdMemo: new Map(), hold, ropes };
    // the apex: the columns round your boots nearest to the downhill line through your spot
    const cand = [];
    for (let db = -1; db <= 1; db++) for (let da = -1; da <= 1; da++) {
      const i = i0 + da, k = k0 + db, px = cellX(i) - ax, pz = cellZ(k) - az, u = px * dx + pz * dz, v = -px * dz + pz * dx;
      if (u < -0.5 * C || u > 0.9 * C || Math.abs(v) > sz.c0 * C * 0.5 + 0.01) continue;
      cand.push({ i, k, u, v, s: Math.abs(v) + 0.3 * Math.abs(u) });
    }
    cand.sort((p, q) => p.s - q.s);
    const seeds = [];
    for (const c of cand) {
      if (seeds.length >= sz.c0) break;
      const t = w.topAt(c.i, c.k);
      if (t < 6 || t >= NY || (c.i !== i0 || c.k !== k0) && this.held(c.i, c.k, st)) continue;
      seeds.push(c);
    }
    if (!seeds.some((c) => c.i === i0 && c.k === k0) || this.held(i0, k0, st)) return null;   // your own column has to be free to go
    const D0 = clamp(Math.min(Math.max(sz.D0, Math.ceil(P.APEX_CELLS[0] / seeds.length)), Math.floor(P.APEX_CELLS[1] / seeds.length)), 1, 3);   // (a top layer of 1 or 2 cells; 3 only when the apex is a single column)
    const warn = o.warn ?? (o.speed > 1.2 ? P.WARN_MOVE : P.WARN_STILL);
    const f = this.foot(pos.x, pos.z);
    // the ground as it is, to tell the pile that lands from the pile that was there (burial.js): the wedge and a margin the flow can run
    const cx = [ax, ax + dx * sz.Lm - dz * (sz.a0 + sz.Lm * sz.tanT), ax + dx * sz.Lm + dz * (sz.a0 + sz.Lm * sz.tanT)], cz = [az, az + dz * sz.Lm + dx * (sz.a0 + sz.Lm * sz.tanT), az + dz * sz.Lm - dx * (sz.a0 + sz.Lm * sz.tanT)];
    const bbox = [Math.min(...cx.map(toI)), Math.max(...cx.map(toI)), Math.min(...cz.map(toK)), Math.max(...cz.map(toK))];
    const seed = (Math.floor(rnd() * 4294967295) >>> 0) || 1;
    const a = this.cur = {
      ...st, ...sz, state: 'warn', warn, warn0: warn, t: 0, age: 0, by: o.by || 'test', seed, rng: mulberry(seed),
      x: pos.x, y: pos.y, z: pos.z, cx: pos.x, cy: pos.y, cz: pos.z, seeds, D0, nSeed: 0,
      front: new Map(), freed: new Set(), bad: new Set(), ef: new Map(), ef2: new Map(), cnt: new Map(), cost: new Map(), slow: new Map(),
      cols: [], growing: false, spent: 0, drv: 1, released: 0, skipped: 0, placed: 0, frozen: 0, forced: 0, peakLive: 0, tFirst: 0, tLast: 0, fxT: 0, sndT: 0, netT: 0, rideNetT: 0, bbox,
      maxTravel: Math.min(sz.travel, f.path * 1.2 + 6), foot: f, acc: P.ACC, ride: P.RIDE, rider: false, counted: false,
    };
    this.perf = { n: 0, ms: 0, max: 0, relMs: 0, flowMs: 0 };
    this.last = null; this.shieldLeft = 6; this.dMin = 1e9; this.botWatch = a.hard + 30;
    g.burial.onStart(a);
    // a climber standing in the wedge is a rider for as long as it flows
    a.rider = this.inRider(a);
    this.warnFx(a, true);
    this.net({ t: 'avwarn', x: +pos.x.toFixed(1), y: +pos.y.toFixed(1), z: +pos.z.toFixed(1), dx: +dx.toFixed(3), dz: +dz.toFixed(3), a: +sz.theta.toFixed(1), l: +sz.Lm.toFixed(1), n: sz.nExp, sd: seed, s: +warn.toFixed(2) });
    if (g.ui) g.ui.hint('<b>The footing gives way.</b> The plush under your boots shift and slide, and more of the slope lets go below you. Let it carry you.', 4);
    return a;
  }

  net(m) { const g = this.g; if (g.net && g.net.open && g.net.role === 'host') g.netSend(m); }

  // is the local player inside the wedge's reach and on its surface
  inRider(a) {
    const g = this.g, q = g.player.pos, px = q.x - a.ax, pz = q.z - a.az, u = px * a.dx + pz * a.dz, v = -px * a.dz + pz * a.dx;
    if (g.dead) return false;
    return q.y > 1.5 && q.y > g.world.topAt(toI(q.x), toK(q.z)) * C - 3 && u >= -1.5 && u <= a.Lm + 1.5 && Math.abs(v) <= a.a0 + Math.max(0, u) * a.tanT + 1.5;
  }

  // ======================= the tick =======================
  update(dt) {
    const g = this.g;
    this.cool = Math.max(0, this.cool - dt);
    if (g.burial) g.burial.tick(dt);   // a finished slide lands its pile once everyone has stopped
    if (this.stress > 0) this.stress = Math.max(0, this.stress - dt * 0.04);
    if (this.botWatch > 0) { this.botWatch -= dt; this.botT -= dt; if (this.botT <= 0) { this.botT = 0.5; this.freeBots(); } }
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
    this.grow(a, dt);
    const t2 = performance.now();
    this.flow(a, dt);
    const t3 = performance.now();
    this.runFx(a, dt);
    // the end comes from the flow itself: the energy is spent, the front has nothing left to take, every body has frozen
    if (a.growing) { const why = a.t > a.hard * 0.6 ? 'time' : this.live === 0 && a.t > a.tFirst + 0.6 ? 'stalled' : a.front.size === 0 ? 'full' : ''; if (why) { a.growing = false; a.grewEnd = why; } }
    if (!a.growing && this.live === 0) this.finish(a, 'settled');
    else if (a.t > a.hard) { a.growing = false; if (this.live > 0) { a.capped = true; } if (a.t > a.hard + 4) { this.sweep(a, 1e9); this.finish(a, 'timeout'); } }
    const ms = performance.now() - t0;
    const pf = this.perf; pf.n++; pf.ms += ms; pf.max = Math.max(pf.max, ms); pf.relMs += t2 - t1; pf.flowMs += t3 - t2;
    this.rideTick(dt);
  }

  // the warning is over: the footing goes. Your column and the ones beside it let go (the top layer), and the cascade starts.
  startRun(a) {
    const g = this.g;
    if (a.rider) a.rider = this.inRider(a);   // a player who used the warning to step out of the wedge is no rider
    let n = 0;
    for (const c of a.seeds) n += this.releaseCol(a, c.i, c.k, a.D0, 1);
    if (!n) { this.finish(a, 'blocked'); return; }
    a.nSeed = n; a.growing = true; a.tFirst = a.t;
    a.cols.length = 0; for (const c of a.seeds) a.cols.push([c.i, c.k, c.u, c.v]);
  }

  // is this column inside the wedge; u, v in metres from the apex along and across the downhill line
  inWedge(a, i, k) {
    const px = cellX(i) - a.ax, pz = cellZ(k) - a.az, u = px * a.dx + pz * a.dz, v = -px * a.dz + pz * a.dx;
    return u >= -0.5 * C && u <= a.Lm && Math.abs(v) <= a.a0 + Math.max(0, u) * a.tanT;
  }

  // free the top `De` cells of column (i, k) as loose bodies. Returns the cells freed (the column stays put when something holds it).
  releaseCol(a, i, k, De, v0f = 0) {
    const g = this.g, w = g.world, s = g.sim, key = k * NX + i;
    if (a.freed.has(key)) return 0;
    const t = w.topAt(i, k);
    if (t < 6 || t - De < 3 || t >= NY) { a.bad.add(key); return 0; }
    if ((i !== toI(a.ax) || k !== toK(a.az)) && this.held(i, k, a)) { a.bad.add(key); return 0; }
    for (let l = 0; l < De; l++) { const j = t - 1 - l, sp = w.get(i, j, k); if (!sp || isSpecialCell(sp) || w.reserved.has((j * NZ + k) * NX + i)) { De = l; break; } }
    if (De < 1) { a.bad.add(key); return 0; }
    const room = Math.min(P.BODY_CAP - this.live, P.SIM_CAP - s.n);
    if (room < De) return 0;
    const orm = w.onRemove; w.onRemove = null;   // one dust cloud for the slide (runFx), not one puff per cell
    let got = 0;
    try {
      for (let l = 0; l < De; l++) {
        const j = t - 1 - l, it = w.removeCell(i, j, k, false);
        if (!it) { a.skipped++; break; }
        if (l === De - 1) w.stabQueue.push({ i, j, k });   // the roof under the scar is asked, one cell a column
        const v0 = 2.2 + 2.2 * a.e;
        const bi = s.spawn(it.sp, it.vr, cellX(i), cellY(j) + 0.05, cellZ(k), a.dx * v0 + (Math.random() - 0.5) * 0.8, 0.25, a.dz * v0 + (Math.random() - 0.5) * 0.8, 2);
        if (bi < 0) { w.setCell(i, j, k, it.sp, it.vr); a.skipped++; break; }   // no room in the sim: the cell goes back, nothing is lost
        s.tag[bi] = 1; s.en[bi] = 0.01;   // (a body that carries a trace of slide energy hits the pile without starting little slides of its own)
        got++;
      }
    } finally { w.onRemove = orm; }
    if (!got) { a.bad.add(key); return 0; }
    a.freed.add(key); a.front.delete(key);
    a.released += got; this.live += got; a.tLast = a.t;
    let cost = 0; for (let d = 0; d < got; d++) cost += 1 + P.COST_D * d * d; a.spent += cost;
    g.S.stats.slides = (g.S.stats.slides || 0) + got;
    if (!a.counted && a.released >= P.REAL) {   // a real slide: counted once, for the Rockslide, Avalanche Chaser and Out From Under achievements
      a.counted = true; g.S.stats.bigSlides = (g.S.stats.bigSlides || 0) + 1;
      if (a.by === 'climb' || a.by === 'guest') g.S.stats.climbSlabs = (g.S.stats.climbSlabs || 0) + 1;
      g.slide.burstCool = Math.max(g.slide.burstCool || 0, 15);   // the topple counter does not count the same slide a second time
    }
    if (a.cols.length < 2400) { const px = cellX(i) - a.ax, pz = cellZ(k) - a.az; a.cols.push([i, k, px * a.dx + pz * a.dz, -px * a.dz + pz * a.dx, got, +a.t.toFixed(2)]); }
    // the neighbours of a freed column can be taken next (inside the wedge only)
    for (let db = -1; db <= 1; db++) for (let da = -1; da <= 1; da++) {
      if (!da && !db) continue;
      const ni = i + da, nk = k + db, nkey = nk * NX + ni;
      if (a.freed.has(nkey) || a.bad.has(nkey) || a.front.has(nkey) || !this.inWedge(a, ni, nk)) continue;
      if (a.front.size < 900) a.front.set(nkey, { i: ni, k: nk });
    }
    return got;
  }

  // ENTRAINMENT. A column next to the slide lets go when the plush moving beside it carry enough energy for the cell's depth; the cascade is the wedge.
  grow(a, dt) {
    if (!a.growing || !a.front.size) return;
    const g = this.g, w = g.world, ef = a.ef;
    let budget = Math.min(P.RELEASE_PER_TICK, P.BODY_CAP - this.live, P.SIM_CAP - g.sim.n, P.MAX_CELLS - a.released);
    const left = a.E0 - a.spent;
    if (left <= 0 || a.released >= P.MAX_CELLS) { a.growing = false; a.grewEnd = left <= 0 ? 'energy' : 'cap'; return; }
    if (budget <= 0) return;
    const pick = [];
    // how far down a wedge that spreads over the full angle could be filled with the energy spent so far (a finger cannot outrun it)
    const tT = a.tanT, a0c = a.a0 / C, ucap = (-a0c + Math.sqrt(a0c * a0c + tT * (a.spent + 4) / (P.FRONT_COLS * P.FRONT_FILL))) / tT + P.FRONT_SLACK;
    for (const [key, c] of a.front) {
      if (((cellX(c.i) - a.ax) * a.dx + (cellZ(c.k) - a.az) * a.dz) / C > ucap) continue;
      // the fastest body within two columns, and where it is
      let E = 0, ek = -1;
      for (let dk = -2; dk <= 2; dk++) for (let di = -2; di <= 2; di++) { const q = ef.get((c.k + dk) * NX + c.i + di); if (q !== undefined && q > E) { E = q; ek = (c.k + dk) * NX + c.i + di; } }
      if (E < P.E_MIN_ENT) continue;
      const t = w.topAt(c.i, c.k);
      const gi = w.topAt(c.i - 2, c.k) - w.topAt(c.i + 2, c.k), gk = w.topAt(c.i, c.k - 2) - w.topAt(c.i, c.k + 2), tan = Math.hypot(gi, gk) / 4;
      const sF = clamp(tan / 0.7, 0.35, 1.5);
      const rate = P.RATE * Math.min(2.5, E / 20) * sF;
      if (a.rng() > 1 - Math.exp(-rate * dt)) continue;
      // cohesion rises with depth: the cell d under the surface needs THR_BASE + THR_DEPTH d^2 of speed squared
      let De = 0; while (De < P.D_MAX && E >= P.THR_BASE + P.THR_DEPTH * De * De) De++;
      if (De < 1 || t < 6) continue;
      pick.push({ c, De, ek, E });
    }
    for (const q of pick) {
      if (budget <= 0 || a.spent >= a.E0) break;
      const De = Math.min(q.De, budget), got = this.releaseCol(a, q.c.i, q.c.k, De);
      if (got) { budget -= got; a.cost.set(q.ek, (a.cost.get(q.ek) || 0) + got); }   // the momentum of the bodies that freed it is shared with what joined
      else a.front.delete(q.c.k * NX + q.c.i);
    }
  }

  // every live body of the slide: friction (growing with the plush round it and the pile under it), the push of the slope while energy is left,
  // momentum shared with what joined, freezing the ones that have slowed down, the safety bounds, and who rides
  flow(a, dt) {
    const g = this.g, s = g.sim, w = g.world, bu = g.burial;
    const pl = g.player.pos, host = g.net && g.net.open && g.net.role === 'host' && g.remote;
    const rp = host ? g.remote.pos : null;
    const hard = a.t > a.hard;
    a.drv = clamp(1 - a.spent / a.E0, 0, 1);
    let uMax = -1e9, live = 0, cx = 0, cy = 0, cz = 0, cn = 0, dMin = 1e9, nA = 0, ax = 0, ay = 0, az = 0, nB = 0, bx = 0, by = 0, bz = 0;
    let budget = hard ? 220 : 80, placed = 0;
    const cnt = a.cnt, cnt2 = new Map(), ef2 = new Map(), slow = a.slow, slow2 = new Map(), cost = a.cost;
    const top = (i, k) => w.topAt(i, k);
    for (let i = s.n - 1; i >= 0; i--) {
      if (s.tag[i] !== 1) continue;
      const x = s.x[i], y = s.y[i], z = s.z[i];
      let vx = s.vx[i], vy = s.vy[i], vz = s.vz[i];
      const ci = toI(x), ck = toK(z), key = ck * NX + ci, tp = top(ci, ck) * C, age = s.age[i];
      cnt2.set(key, (cnt2.get(key) || 0) + 1);
      let frozeNow = false, flat = false;
      if (y - tp < 2.2) {
        let nLoc = 0; for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) nLoc += cnt.get((ck + dk) * NX + ci + di) || 0;
        const gi = top(ci - 3, ck) - top(ci + 3, ck), gk = top(ci, ck - 3) - top(ci, ck + 3), gm = Math.hypot(gi, gk), tan = gm / 6;
        // momentum shared with the cells that joined beside this body
        const dm = cost.get(key); if (dm) { const m = Math.max(2, nLoc); const f = m / (m + dm); vx *= f; vz *= f; }
        flat = tan <= 0.12;
        // the slope pushes the flow while there is energy left in it
        if (!flat && a.drv > 0 && age < 9) { const sp = Math.hypot(vx, vz); if (sp < a.vmax) { const acc = a.acc * Math.min(1.2, tan / 0.8) * a.drv * dt / gm; vx += gi * acc; vz += gk * acc; } }
        // friction: more with the flow round it, more with the pile already landed under it, much more on the flat, more once the energy is spent
        const gain = bu.gain(a, ci, ck);
        const mu = P.MU0 + P.MU_N * Math.min(nLoc, 20) + P.MU_P * Math.min(gain, 8) + P.MU_SPENT * (1 - a.drv) + (flat ? P.MU_FLAT : 0);
        const sp = Math.hypot(vx, vz), ns = Math.max(0, sp - mu * G * dt);
        if (sp > 1e-6) { const f = ns / sp; vx *= f; vz *= f; }
        const sp2 = Math.hypot(vx, vz);
        if (sp2 > a.vmax) { const f = a.vmax / sp2; vx *= f; vz *= f; }
        s.vx[i] = vx; s.vz[i] = vz;
        // slow for a moment: frozen back into a cell (the pile grows, friction grows for what arrives behind it)
        if (sp2 < P.V_STOP && y - tp < 1.3) {
          const tm = (slow.get(s.bid[i]) || 0) + dt;
          // (on a steep face with no pile under it a slow body is only catching its breath: it freezes after 4 x as long)
          if (tm >= P.FREEZE_T * (tan > 0.75 && gain < 2 ? 4 : 1) && budget > 0) { budget--; if (this.place(i)) { placed++; a.frozen++; continue; } }
          slow2.set(s.bid[i], tm);
        }
      }
      const sp2 = vx * vx + vz * vz;
      if (sp2 > P.E_MIN_ENT && y - tp < 2.0) { const q = ef2.get(key); if (q === undefined || sp2 > q) ef2.set(key, sp2); }
      const dxp = x - pl.x, dzp = z - pl.z, dyp = y - (pl.y + 0.9), d2p = dxp * dxp + dyp * dyp + dzp * dzp;
      if (d2p < dMin) dMin = d2p;
      if (d2p < 14 && sp2 > 4) { nA++; ax += vx; ay += vy; az += vz; }   // (only plush that really flow carry you: the ones still settling round your feet do not hold you back)
      if (rp) { const ex = x - rp.x, ey = y - (rp.y + 0.9), ez = z - rp.z; if (ex * ex + ey * ey + ez * ez < 14) { nB++; bx += vx; by += vy; bz += vz; } }
      if ((live & 7) === 0) { cx += x; cy += y; cz += z; cn++; }
      { const u = (x - a.ax) * a.dx + (z - a.az) * a.dz; if (u > uMax) uMax = u; }
      // the safety bounds: time is up, or it has run further than the bound
      let done = false;
      if (hard) done = true;
      else if (Math.hypot(x - s.ox[i], z - s.oz[i]) > a.maxTravel) done = true;
      if (done && budget > 0) { budget--; if (this.place(i)) { placed++; a.forced++; continue; } }
      live++;
    }
    a.ef = ef2; a.cnt = cnt2; a.slow = slow2; a.cost = new Map();
    a.placed += placed; this.live = live; a.peakLive = Math.max(a.peakLive, live);
    this.dMin = Math.sqrt(dMin); a.uMax = live ? uMax : a.uMax;
    a.cx = cn ? cx / cn : a.cx; a.cy = cn ? cy / cn : a.cy; a.cz = cn ? cz / cn : a.cz; a.cn = cn;
    if (g.dead) a.rider = false;
    if (nA >= 3) this.applyRide(ax / nA, ay / nA, az / nA, nA, dt);
    else if (a.rider && a.released > 0 && live > 0 && pl.y > 1.5 && !g.dead) this.applyRide(0, 0, 0, 0, dt);   // no plush within reach: the slope still carries the rider (while it is behind the front of the flow)
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

  // the last resort: every body of the slide is placed now
  sweep(a, max) {
    const s = this.g.sim; let n = 0;
    for (let i = s.n - 1; i >= 0 && n < max; i--) if (s.tag[i] === 1 && this.place(i)) { n++; a.forced++; }
    this.live = 0; for (let i = 0; i < s.n; i++) if (s.tag[i] === 1) this.live++;
  }

  finish(a, how) {
    const g = this.g;
    this.last = { how, E0: a.E0, spent: a.spent, cls: a.cls, nExp: a.nExp, released: a.released, skipped: a.skipped, placed: a.placed, frozen: a.frozen, forced: a.forced, peakLive: a.peakLive, secs: +a.t.toFixed(2), hard: a.hard, capped: !!a.capped, grewEnd: a.grewEnd || '', front: a.front.size, theta: a.theta, apex: a.nSeed, Lm: a.Lm, by: a.by, perf: { ...this.perf, avg: this.perf.n ? this.perf.ms / this.perf.n : 0 } };
    this.cur = null; this.live = 0;
    this.cool = lerp(P.COOL[0], P.COOL[1], a.e);
    this.freeBots(); this.botWatch = 25;
    if (g.burial) g.burial.onFinish(a, how);   // the pile settles round whoever it carried: how deep they are buried (burial.js)
    this.net({ t: 'avend', x: +(a.cx || a.x).toFixed(1), z: +(a.cz || a.z).toFixed(1), c: +this.cool.toFixed(1) });
    this.sfx('thud', a.cx || a.x, 1, a.cz || a.z, 1);
    g.dust.add(a.cx || a.x, 1, a.cz || a.z, 0.05);
  }

  // a bot that stood still on the pile can end up inside the runout: it is lifted to the surface of its column
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
    const sl = this.slope(toI(p.pos.x), toK(p.pos.z)), a = this.cur;
    // the slope pulls you down with the flow (less once its energy is spent) for as long as you are behind the front of it: you never run ahead of the slide
    const pu = a ? (p.pos.x - a.ax) * a.dx + (p.pos.z - a.az) * a.dz : 0;
    if (sl && sl.tan > 0.15 && a && p.pos.y > 1.2 && a.rider && pu < (a.uMax ?? 0) - 1.0) {
      const sp = Math.hypot(p.vel.x, p.vel.z);
      if (sp < a.vmax - 3) { const acc = a.ride * Math.min(1, sl.tan / 0.7) * Math.max(0.45, a.drv) * dt; p.vel.x += sl.dx * acc; p.vel.z += sl.dz * acc; }
    }
    // out in front of the flow you are braked: you come to rest with the plush that is about to land, not ahead of it
    if (a && a.rider && a.t > 0.5 && a.uMax !== undefined && pu > a.uMax - 0.3) { const kb = Math.min(1, 5 * dt); p.vel.x -= p.vel.x * kb; p.vel.z -= p.vel.z * kb; }
    if (a) {   // the flow funnels you toward its own centre line, so you end inside the pile you rode, and it carries you only as far as its plush may run
      const px = p.pos.x - a.x, pz = p.pos.z - a.z, v = -px * a.dz + pz * a.dx, kv = Math.min(1.5, Math.abs(v)) * 2.2 * dt * Math.sign(-v);
      p.vel.x += -a.dz * kv; p.vel.z += a.dx * kv;
      const dd = Math.hypot(px, pz); if (dd > a.maxTravel * 0.8) { const kd = Math.min(1, 6 * dt); p.vel.x -= p.vel.x * kd; p.vel.z -= p.vel.z * kd; }
    }
    this.noteRide(Math.hypot(p.vel.x, p.vel.z), dt);
  }
  noteRide(speed, dt) {
    if (this.rideT <= 0) this.shieldLeft = 6;   // the damage budget of one ride
    this.rideT = 0.7; this.rideV = Math.max(speed, this.rideV * Math.exp(-dt / 0.3));
    this.roll = Math.sin(this.g.time * 3.3) * 0.1 * Math.min(1, speed / 8);
    this.g.shake = Math.max(this.g.shake, 0.28 * this.g.T.shakeMul);
  }
  // the host told the guest it is in the flow
  rideFromHost(m) {
    const g = this.g, p = g.player, vx = +m.vx, vy = +m.vy, vz = +m.vz;
    if (!Number.isFinite(vx + vy + vz) || g.mode !== 'play') return;
    const c = (v) => clamp(v, -P.VMAX[1] * 1.5, P.VMAX[1] * 1.5);
    const k = 0.55;
    p.vel.x += (c(vx) - p.vel.x) * k; p.vel.z += (c(vz) - p.vel.z) * k; if (c(vy) < p.vel.y) p.vel.y += (c(vy) - p.vel.y) * k;
    p.swept = 0.5;
    this.noteRide(Math.hypot(p.vel.x, p.vel.z), 0.1);
  }
  rideTick(dt) {
    if (this.rideT <= 0) { this.roll *= Math.exp(-dt * 4); if (this.shieldLeft > 0 && !this.cur) this.shieldLeft = Math.max(0, this.shieldLeft - dt * 6); return; }
    const p = this.g.player, sp = Math.hypot(p.vel.x, p.vel.z);
    this.rideV = Math.max(sp, this.rideV * Math.exp(-dt / 0.3));
    this.rideT -= dt;
    if (this.rideT <= 0) {   // the ride is over: it sets you down gently, nothing at the stop
      this.rideV = 0; p.swept = 0;
      if (this.cur === null && !this.g.isGuest()) this.g.S.stats.rides = (this.g.S.stats.rides || 0) + 1;
    }
  }
  // hurtPlayer calls this: the plush that flows under and around you is not a blow. Only a real fall still costs a few points (at most six in all).
  shield(n, why) {
    const bu = this.g.burial;
    if (bu && why === 'were crushed under falling plush' && (bu.on || bu.armT > 0)) return 0;   // (plush shaken loose while a pile holds you, or in the seconds after it, costs nothing)
    const riding = this.rideT > 0;
    if (!(riding || (this.cur && this.dMin < 30))) return n;
    if (why === P.WHY || why === 'were crushed under falling plush' || why === 'the pile gave way') return 0;
    if (why === 'fell too far') { const room = Math.max(0, this.g.hp - 12); n = Math.min(n, 3, this.shieldLeft, room); this.shieldLeft = Math.max(0, this.shieldLeft - n); return n; }
    return n;
  }

  // ======================= what you see and hear =======================
  sfx(kind, x, y, z, p = 1) {
    const s = this.g.sound; if (!s || !Number.isFinite(x + y + z)) return;
    if (kind === 'creak') s.at(x, y, z, 'creak').creak(0.4);
    else if (kind === 'rumble') { const v = s.at(x, y, z, 'slide'); v.rumble(p); v.soft(0.1); }
    else if (kind === 'debris') s.at(x, y, z, 'fall').debris(Math.min(0.25, 0.1 * p));
    else if (kind === 'thud') s.at(x, y, z, 'fall').thump(0.3 * p, 70);
  }
  // the warning: dust at the feet and along the two edges the wedge will have (the footing shifts and sinks a little)
  edgeFx(x, z, dx, dz, theta, len, seed, fx, n = 6) {
    const wd = this.g.world, rnd = mulberry(seed || 1), tn = Math.tan(theta * Math.PI / 180);
    for (let q = 0; q < n; q++) {
      const u = (0.2 + 0.8 * (q + rnd()) / n) * Math.min(len, 8), v = (q % 2 ? 1 : -1) * (0.5 + u * tn);
      const px = x + dx * u - dz * v, pz = z + dz * u + dx * v;
      fx(px, wd.topAt(toI(px), toK(pz)) * C + 0.1, pz);
    }
  }
  warnFx(a, first, dt = 0) {
    const g = this.g;
    if (first) {
      this.sfx('creak', a.x, a.y, a.z); this.sfx('creak', a.x, a.y + 1, a.z);
      g.shake = Math.max(g.shake, 0.12 * g.T.shakeMul);
    }
    a.fxT -= dt;
    if (first || a.fxT <= 0) {
      a.fxT = 0.12;
      g.fx.dust(a.x, a.y, a.z, 3, 0.4, 0.6);
      this.edgeFx(a.x, a.z, a.dx, a.dz, a.theta, a.Lm, a.seed, (px, py, pz) => g.fx.dust(px, py, pz, 1, 0.5, 0.6));
    }
  }
  runFx(a, dt) {
    const g = this.g, s = g.sim;
    a.sndT -= dt; a.fxT -= dt; a.netT -= dt;
    const prog = clamp(a.spent / a.E0, 0, 1), fade = a.growing ? 1 : clamp(1 - (a.t - a.tLast) / 7, 0.2, 1);
    const power = (0.55 + 0.75 * prog) * fade * clamp(this.live / 400, 0.4, 1.3);
    if (a.sndT <= 0 && this.live > 0) { a.sndT = 0.9; this.sfx('rumble', a.cx, a.cy, a.cz, power); this.sfx('debris', a.cx, a.cy, a.cz, power); }
    if (a.fxT <= 0 && this.live > 0) {
      a.fxT = 0.06; let n = 0;
      for (let q = 0; q < 10 && s.n > 0; q++) { const i = (Math.random() * s.n) | 0; if (s.tag[i] !== 1) continue; if (Math.hypot(s.vx[i], s.vz[i]) > 2.5) { g.fx.dust(s.x[i], s.y[i] + 0.2, s.z[i], 2, 0.9, 0.9); n++; } }
      if (n) g.dust.add(a.cx, a.cy + 0.5, a.cz, 0.0015 * n);
    }
    if (this.live > 20 && this.dMin < 26) g.shake = Math.max(g.shake, Math.min(0.7, (1 - this.dMin / 26) * 0.7 * clamp(this.live / 300, 0.3, 1)) * g.T.shakeMul);
    if (a.netT <= 0 && this.live > 0) { a.netT = 0.5; this.net({ t: 'avrun', x: +a.cx.toFixed(1), y: +a.cy.toFixed(1), z: +a.cz.toFixed(1), p: +power.toFixed(2), n: this.live }); }
  }

  // ======================= the guest =======================
  guestMsg(m) {
    const g = this.g, num = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(+v) ? +v : NaN;   // (null, an object or an empty string is not a number)
    switch (m.t) {
      case 'avwarn': {
        const x = num(m.x), y = num(m.y), z = num(m.z), dx = num(m.dx), dz = num(m.dz), th = clamp(num(m.a), 8, 45), len = clamp(num(m.l), 2, 80), n = clamp(num(m.n), 0, 3000), sd = num(m.sd);
        if (!Number.isFinite(x + y + z + dx + dz + th + len + n + sd)) return;
        this.guestOn = P.HARD[1] + 12;   // the host's slide runs (until its avend); the slope is not asked for a second one
        this.gw = { x, y, z, dx, dz, a: th, l: len, n, sd };
        if (this.ask > 0) { this.ask = 0; this.dropLoad(0.3); }   // the answer to this guest's request: some of what it carries falls out of its hands
        this.sfx('creak', x, y, z); g.shake = Math.max(g.shake, 0.08 * g.T.shakeMul);
        g.fx.dust(x, y, z, 3, 0.4, 0.6);
        this.edgeFx(x, z, dx, dz, th, len, sd, (px, py, pz) => g.fx.dust(px, py, pz, 1, 0.5, 0.6));
        if (Math.hypot(x - g.player.pos.x, z - g.player.pos.z) < 40) g.ui.hint('<b>The footing gives way!</b> A wedge of the slope is letting go and flowing downhill.', 4);
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
      case 'avend': {
        const x = num(m.x), z = num(m.z); if (Number.isFinite(x + z)) this.sfx('thud', x, 1, z, 1);
        this.guestRun = 0; this.guestOn = 0; this.cool = clamp(num(m.c) || P.COOL[0], 0, P.COOL[1] + 2); if (g.burial) g.burial.arm();
        break;
      }
      case 'avride': this.rideFromHost(m); break;
    }
  }
  // the connection closed: a guest no longer believes the host's slide runs, and stops waiting for an answer
  netLost() { this.guestOn = 0; this.ask = 0; this.guestRun = 0; this.gw = null; }
  guestUpdate(dt) {
    this.rideTick(dt);
    if (this.guestRun > 0) this.guestRun -= dt;
    this.cool = Math.max(0, this.cool - dt); this.ask = Math.max(0, this.ask - dt); this.guestOn = Math.max(0, this.guestOn - dt);
    if (this.stress > 0) this.stress = Math.max(0, this.stress - dt * 0.04);   // (the host's clock, update(), does not run on a guest)
  }
}
