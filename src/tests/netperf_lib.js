// Shared harness for the netperf_*.js and mp_netperf.js tests (no default export, so the loader skips it).
// One page plays the host: g.net gets a FAKE data channel that records every message (type, bytes, simulated time) and models a link
// (bytes per second, a stall) through bufferedAmount. The real game loop (g.updatePlay) runs at a fixed 1/60 s step, so the numbers are per SIMULATED second
// and do not depend on how fast this machine is; the tick times are wall clock milliseconds. `replay` then plays the recorded stream back through the
// guest's receive path to time the guest.
import { RemotePlayer } from '../net.js';
import { pools } from '../plushdata.js';
import { BUDGET } from '../netperf.js';
import { makeBeltKit, UP_ALL } from './belts_lib.js';
import { kit as islandKit } from './island_lib.js';

export const UP = { ...UP_ALL, crew: 3, crewSlots: 8, claw: 1, borer: 1, rigCount: 5, mechCount: 5, fans: 1, mfan: 1, cart: 3, bag: 3 };
export const DT = 1 / 60;

const typeOf = (s) => { const m = /^\{"t":"([^"]*)"/.exec(s.length > 64 ? s.slice(0, 64) : s); return m ? m[1] : '?'; };
const pct = (a, q) => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };

export function makeRig(ctx) {
  const { g, S, w, p, sim, L, fresh, spot, toI, toK, cellX, cellY, cellZ } = ctx;
  const R = { t: 0, bw: Infinity, stalled: false, log: [], series: [], frames: 0, netMs: [], frameMs: [], rxMs: [], maxBuf: 0, drops: 0 };
  const dc = R.dc = {
    readyState: 'open', binaryType: 'arraybuffer', bufferedAmount: 0, bufferedAmountLowThreshold: 0, onopen: null, onclose: null, onmessage: null,
    send(str) { this.bufferedAmount += str.length; R.log.push({ t: R.t, type: typeOf(str), bytes: str.length, delay: R.bw !== Infinity && R.bw > 0 ? (R.stalled ? 99 : this.bufferedAmount / R.bw) : 0, raw: R.keepRaw ? str : null }); if (this.bufferedAmount > R.maxBuf) R.maxBuf = this.bufferedAmount; },
    close() { this.readyState = 'closed'; },
  };
  let origNetUpdate = null, saved = null;

  // ------------------------------------------------------------------ open / close the fake link
  R.open = (role = 'host', o = {}) => {
    saved = { open: g.net.open, role: g.net.role, dc: g.net.dc, ready: g.guestReady, remote: g.remote, onSet: g.world.onSet };
    R.keepRaw = !!o.keepRaw; R.log.length = 0; R.series.length = 0; R.t = 0; R.frames = 0; R.netMs = []; R.frameMs = []; R.rxMs = []; R.maxBuf = 0; dc.bufferedAmount = 0; dc.readyState = 'open';
    g.net.dc = dc; g.net.open = true; g.net.role = role; g.guestReady = role === 'guest';
    g.remote = new RemotePlayer(g.renderer.scene, 'Guest'); g.remote.pos.set(cellX(0) + 3, 0, 6); g.remote.target.copy(g.remote.pos);
    g.netOut.length = 0; g.netOpened();
    if (g.net.pipe && g.net.pipe.reset) g.net.pipe.reset();
    origNetUpdate = g.netUpdate;
    g.netUpdate = function (d) { const a = performance.now(); try { return origNetUpdate.call(this, d); } finally { R.netMs.push(performance.now() - a); } };
    R.log.length = 0;
  };
  R.close = () => {
    if (origNetUpdate) { delete g.netUpdate; origNetUpdate = null; }
    g.net.open = false; g.net.role = null; g.net.dc = null; g.guestReady = false;
    if (g.remote) { try { g.remote.dispose(g.renderer.scene); } catch (e) { /* ignore */ } g.remote = null; }
    if (g.world) { g.world.onSet = null; g.world.onCreakCell = null; }
    g.netOut.length = 0; g.creakOut = []; g._flQ = []; g.fliers.length = 0; g.netBodies && g.netBodies.clear();
    if (g.netPending) g.netPending.length = 0;
    delete g.netSend;
    if (g.net.inbox && g.net.inbox.reset) g.net.inbox.reset();
    if (g.net.pipe && g.net.pipe.reset) g.net.pipe.reset();
    if (g._worldGen) g._worldGen = null;
  };

  // ------------------------------------------------------------------ the net tick as it was before the traffic control (kept here so a test can measure both in one build)
  // cells every frame (4000 numbers at most), bodies as 11 floats each every 0.12 s, creak every frame, dyn every 0.17 s, shared every 0.6 s, no backpressure at all
  R.legacy = (on) => {
    const pipe = g.net.pipe;
    if (on) {
      pipe.hi = pipe.lo = Infinity; pipe.budget = {};
      g.netUpdate = function (dt) {
        if (!this.net.open) return;
        if (this.netOut.length) this.netSend({ t: 'cells', a: this.netOut.splice(0, 4000) });
        this._np = (this._np || 0) - dt;
        if (this._np <= 0) { this._np = 0.1; const p = this.player; this.netSend({ t: 'pos', x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), lamp: this.lampOn !== false }); }
        if (this.net.role === 'host') {
          this._nb = (this._nb || 0) - dt;
          if (this._nb <= 0) {
            this._nb = 0.12;
            const s = this.sim, p = this.player.pos, rp = this.remote ? this.remote.pos : null, a = [];
            for (let i = 0; i < s.n && a.length < 3300; i++) {
              const nearMe = (s.x[i] - p.x) ** 2 + (s.z[i] - p.z) ** 2 < 6400, nearHim = rp && (s.x[i] - rp.x) ** 2 + (s.z[i] - rp.z) ** 2 < 6400;
              if (!nearMe && !nearHim) continue;
              a.push(s.bid[i], s.sp[i], s.vr[i], +s.x[i].toFixed(2), +s.y[i].toFixed(2), +s.z[i].toFixed(2), +s.q[i * 4].toFixed(3), +s.q[i * 4 + 1].toFixed(3), +s.q[i * 4 + 2].toFixed(3), +s.q[i * 4 + 3].toFixed(3), +s.sq[i].toFixed(2));
            }
            this.netSend({ t: 'bodies', a });
          }
          if (this.creakOut && this.creakOut.length) this.netSend({ t: 'creak', a: this.creakOut.splice(0, 90) });
          this._nd = (this._nd || 0) - dt;
          if (this._nd <= 0 && this.remote) { this._nd = 0.17; this.sendDyn(); }
          this.flushFx(dt);
          this._ns = (this._ns || 0) - dt;
          if (this._ns <= 0) { this._ns = 0.6; this.sendShared(); }
        }
        if (this.net.role === 'host') { this._ntm = (this._ntm || 0) - dt; if (this._ntm <= 0) { this._ntm = 6; this.netSend({ t: 'time', gameMin: this.S.gameMin }); } }
        if (this.remote) this.remote.update(dt);
      };
    } else { delete g.netUpdate; pipe.hi = 128 * 1024; pipe.lo = 32 * 1024; pipe.budget = { ...BUDGET }; }
  };

  // ------------------------------------------------------------------ the frame loop
  R.stall = (on) => { R.stalled = !!on; };
  R.linkFrame = () => { if (!R.stalled && R.bw !== Infinity) dc.bufferedAmount = Math.max(0, dc.bufferedAmount - R.bw * DT); else if (!R.stalled) dc.bufferedAmount = 0; };
  R.frame = (each) => {
    R.t += DT; R.frames++; g.time += DT;
    R.linkFrame();
    if (each) each(R.frames, R.t);
    const a = performance.now(); g.updatePlay(DT); R.frameMs.push(performance.now() - a);
    if (R.frames % 30 === 0) R.series.push({ t: +R.t.toFixed(2), buf: dc.bufferedAmount, level: g.net.pipe ? g.net.pipe.level : 0, queued: g.net.pipe ? g.net.pipe.queue.length : 0, hostQ: g.netOut.length / 5 });
  };
  R.run = (secs, each) => { const n = Math.round(secs / DT); for (let q = 0; q < n; q++) R.frame(each); };
  // power every machine and tile (the tests do the same: nothing here is about the grid)
  R.power = () => { for (const it of g.machines.items.values()) it.ent.pw = 1; for (const t of L().tiles.values()) t.pw = 1; };

  // ------------------------------------------------------------------ what the host sent, in a window of simulated time
  R.sum = (t0 = 0, t1 = Infinity) => {
    const by = {}; let total = 0, n = 0, max = { bytes: 0, type: '' }; const perSec = new Map();
    for (const m of R.log) {
      if (m.t < t0 || m.t > t1) continue;
      const o = by[m.type] || (by[m.type] = { n: 0, bytes: 0, max: 0 }); o.n++; o.bytes += m.bytes; if (m.bytes > o.max) o.max = m.bytes;
      total += m.bytes; n++; if (m.bytes > max.bytes) max = { bytes: m.bytes, type: m.type };
      const s = Math.floor(m.t); perSec.set(s, (perSec.get(s) || 0) + m.bytes);
    }
    const dur = Math.max(1e-6, Math.min(t1, R.t) - t0), secs = [...perSec.values()];
    return { by, total, n, dur, kbs: total / dur / 1024, msgsPerSec: n / dur, max, peakSecKB: Math.max(0, ...secs) / 1024 };
  };
  R.line = (s) => `${s.kbs.toFixed(1)} KB/s ${s.msgsPerSec.toFixed(0)} msg/s max ${(s.max.bytes / 1024).toFixed(1)} KB (${s.max.type}) peak-1s ${s.peakSecKB.toFixed(0)} KB`;
  R.top = (s, k = 5) => Object.entries(s.by).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, k).map(([t, o]) => `${t} ${(o.bytes / s.dur / 1024).toFixed(1)}KB/s x${(o.n / s.dur).toFixed(0)} max${(o.max / 1024).toFixed(1)}K`).join(', ');
  // how long a message of a type waited behind the others on the link (seconds): p95 and max
  R.delay = (type, t0 = 0) => { const a = R.log.filter((m) => m.t >= t0 && (!type || m.type === type)).map((m) => m.delay); return { p95: pct(a, 0.95), max: Math.max(0, ...a), n: a.length }; };
  R.tick = (a = R.netMs) => ({ avg: a.reduce((x, y) => x + y, 0) / Math.max(1, a.length), p95: pct(a, 0.95), max: Math.max(0, ...a) });

  // ------------------------------------------------------------------ the world and the load
  const sp = pools[0][0];
  R.sp = sp;
  R.build = (o = {}) => {
    const out = { ents: 0 };
    if (o.island) { const K = islandKit(ctx); const A = K.arena(40, 40, UP); R.arena = A; R.K = K; }
    else { fresh(UP); }
    const BK = makeBeltKit(ctx); R.BK = BK;
    if (!o.island) BK.cleanup && BK.cleanup();
    return out;
  };
  // n belt lines of `len` tiles with plush on them, a vault at each end, powered; claws and generators around
  R.machines = (n = 60) => {
    const BK = R.BK; const made = []; const i0 = toI(-11), k0 = toK(-6);
    let belts = 0;
    const lines = [], vaults = [];
    const per = Math.max(1, Math.floor((n - 12) / 4));
    for (let ln = 0; ln < 4; ln++) { const line = BK.lay(0, per, i0, k0 + ln * 3, 0); lines.push(line); belts += line.length; vaults.push(BK.vaultAt(i0 + per, k0 + ln * 3)); }
    let m = belts + vaults.length;
    for (let q = 0; m < n && q < 8; q++, m++) made.push(g.placeEntity('claw', { x: cellX(i0 + 2 + q * 2), y: 0, z: cellZ(k0 + 14), i: i0 + 2 + q * 2, j: 0, k: toK(k0 + 14) }, { quiet: true, rebuild: false }));
    for (let q = 0; m < n; q++, m++) made.push(g.placeEntity('gen', { i: i0 + q, j: 0, k: k0 - 3, dir: 0, q: [], burn: 1e5, burnMax: 1e5 }, { quiet: true, rebuild: false }));
    L().dirty = true; R.lines = lines; R.vaults = vaults; R.claws = made;
    R.refill = () => { for (const line of lines) BK.dense(line); for (const v of vaults) if (v.stored && v.stored.length > 200) v.stored.length = 0; };
    R.refill();
    return { belts, vaults: vaults.length, other: made.length, total: belts + vaults.length + made.length };
  };
  R.bots = (n = 20) => { const bots = []; for (let q = 0; q < n; q++) { const b = g.crew.spawn(); b.x = -4 + (q % 10) * 0.8; b.z = 6 + Math.floor(q / 10) * 1.2; b.y = 0.3; b.vy = 0; b.battery = 1; b.state = 'idle'; b.carry = Array.from({ length: q % 7 }, () => ({ sp, vr: 0 })); bots.push(b); } R.botList = bots; return bots; };
  // a slope mouth to dig into
  R.slope = (lane = 12) => { const s = spot(lane); R.sp0 = s; return s; };
  R.guestPos = (x, y, z) => { g.netMessage({ t: 'pos', x, y, z, yaw: 0.3, pitch: 0, lamp: true }); };
  // per frame actions ------------------------------------------------------------------
  // both players dig: the host through the world (removeCell -> onSet), the guest by sending cells to the host
  R.digStep = (n) => {
    const s = R.sp0; if (!s) return;
    if (n % 4 === 0) { const a = Math.floor(n / 4); const i = s.i + (a % 40), k = s.k + ((a / 40 | 0) % 6); for (let j = 1; j < 4; j++) w().removeCell(i, j, k, true); }
    if (n % 6 === 0) { const a = Math.floor(n / 6); const i = s.i + 3 + (a % 40), k = s.k + 8 + ((a / 40 | 0) % 6); const j = 1 + (a % 3); const arr = [i, j, k, 0, 0]; g.netMessage({ t: 'cells', a: arr }); }
  };
  R.throwStep = (n) => {
    const s = R.sp0; if (!s) return;
    if (n % 30 === 0) { const x = cellX(s.i) - 2, z = cellZ(s.k); sim().spawn(sp, 0, x, 1.6, z, 6, 3, 0.5, 1, 0); }
    if (n % 30 === 15) g.netMessage({ t: 'spawn', a: [sp, 0, cellX(s.i) - 2, 1.6, cellZ(s.k) + 10, 6, 3, -0.4, 1] });
  };
  R.rigsStep = (n, perSec = 50) => { const bp = g.hall.binPos; const every = Math.max(1, Math.round(60 / perSec)); const per = perSec > 60 ? Math.round(perSec / 60) : 1; if (n % every) return; for (let q = 0; q < per; q++) g.rigPluck({ sp, vr: 0 }, bp.x - 8 - (q % 20) * 0.5, 1.4, bp.z + (n % 9) - 4, null); };
  R.avalanche = (n) => { const s = R.sp0; if (!s) return; if (n % 20 === 0) { g.slide.triggerPatch(s.i + 20 + (n / 20 % 8 | 0) * 6, s.k + 4, 3.2, 6); g.slide.trigger(s.i + 24, 14, s.k + 6, 3); } };
  R.portalStep = (n, perFrame = 3) => { const s = R.sp0; if (!s) return; for (let q = 0; q < perFrame; q++) { const a = n * perFrame + q; const i = s.i + 60 + (a % 200), j = 1 + ((a / 200 | 0) % 6), k = s.k + 20 + ((a / 1200 | 0) % 6); if (w().inside(i, j, k) && w().get(i, j, k)) w().removeCell(i, j, k, false); } };
  // a cave-in: nx*ny*nz cells let go at once, each with a cell diff for the guest
  R.caveIn = (i0, j0, k0, nx, ny, nz) => { let c = 0; for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) for (let d = 0; d < nz; d++) { w().setCell(i0 + a, j0 + b, k0 + d, 0, 0); c++; } return c; };
  R.fill = (i0, j0, k0, nx, ny, nz) => { for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) for (let d = 0; d < nz; d++) w().setCell(i0 + a, j0 + b, k0 + d, 2 + ((a + b + d) % 5), 0); };
  R.moveGuest = (n) => { if (n % 6 === 0) { const a = n / 60; g.netMessage({ t: 'pos', x: cellX(0) + 3 + Math.sin(a) * 4, y: 0, z: 6 + Math.cos(a) * 4, yaw: a, pitch: 0, lamp: true }); } };

  // ------------------------------------------------------------------ the guest: play the recorded host stream back through the guest's receive path
  // frames are grouped by the simulated second they were sent in 1/60 s slots, so a burst arrives as it was sent
  R.replay = (recs, o = {}) => {
    const savedRole = g.net.role, savedReady = g.guestReady, savedOpen = g.net.open;
    g.net.role = 'guest'; g.guestReady = true; g.net.open = true; g.netOut.length = 0;
    const deliver = (raw) => { if (g.net.rx) g.net.rx(raw); else g.netMessage(JSON.parse(raw)); };
    const frames = []; const bySlot = new Map();
    for (const m of recs) { const s = Math.round(m.t / DT); (bySlot.get(s) || bySlot.set(s, []).get(s)).push(m); }
    const last = Math.max(0, ...bySlot.keys());
    const rx = [], net = [], fr = [];
    const nu = g.netUpdate;
    g.netUpdate = function (d) { const a = performance.now(); try { return nu.call(this, d); } finally { net.push(performance.now() - a); } };
    const pre = o.before || null;
    try {
      for (let s = 0; s <= last && s < (o.max || 1e9); s++) {
        g.time += DT;
        const batch = bySlot.get(s) || [];
        if (pre) pre(batch);
        const a = performance.now();
        for (const m of batch) { if (m.raw) deliver(m.raw); }
        rx.push(performance.now() - a);
        const b = performance.now(); g.updatePlay(DT); fr.push(performance.now() - b);
      }
    } finally { g.netUpdate = nu; g.net.role = savedRole; g.guestReady = savedReady; g.net.open = savedOpen; }
    return { rx, net, frame: fr, tick: rx.map((v, q) => v + (net[q] || 0)) };
  };

  // a guest that was away (a background tab, a frozen page): everything the host sent in the meantime arrives in one go, then the frames run.
  // returns the time of the delivery itself, and the frame times that follow until the guest has caught up (or `max` frames)
  R.burst = (recs, o = {}) => {
    const savedRole = g.net.role, savedReady = g.guestReady, savedOpen = g.net.open;
    g.net.role = 'guest'; g.guestReady = true; g.net.open = true; g.netOut.length = 0;
    const deliver = (raw) => { if (g.net.rx) g.net.rx(raw); else g.netMessage(JSON.parse(raw)); };
    const nu = g.netUpdate; const net = []; g.netUpdate = function (d) { const a = performance.now(); try { return nu.call(this, d); } finally { net.push(performance.now() - a); } };
    const out = { deliverMs: 0, frames: [], netMs: net, pending: 0 };
    try {
      if (o.before) o.before(recs);
      const a = performance.now(); for (const m of recs) if (m.raw) deliver(m.raw); out.deliverMs = performance.now() - a;
      for (let q = 0; q < (o.max || 240); q++) { g.time += DT; const b = performance.now(); g.updatePlay(DT); out.frames.push(performance.now() - b); if (g.net.inbox && g.net.inbox.size && g.net.inbox.size() === 0 && q > 3) break; }
      out.pending = g.net.inbox && g.net.inbox.size ? g.net.inbox.size() : 0;
    } finally { g.netUpdate = nu; g.net.role = savedRole; g.guestReady = savedReady; g.net.open = savedOpen; }
    return out;
  };
  // put the cells the stream is about to write back the other way, so the guest really has to change them
  R.undoCells = (batch) => { const wd = w(); wd._remoteApply = true; try { for (const m of batch) { if (m.type !== 'cells' || !m.raw) continue; const a = JSON.parse(m.raw).a; for (let n = 0; n + 4 < a.length; n += 5) if (wd.inside(a[n], a[n + 1], a[n + 2])) wd.setCell(a[n], a[n + 1], a[n + 2], a[n + 3] === 0 ? 4 : 0, 0); } } finally { wd._remoteApply = false; } };

  // ------------------------------------------------------------------ one scenario: build, run, summarise, clean up
  // `each(n, t)` runs before every frame; the first `warm` seconds are not counted
  R.scenario = (name, o) => {
    const rec = { name };
    try {
      R.build(o.build || {});
      if (o.setup) o.setup(R);
      R.bw = o.bw ?? Infinity; R.stalled = false;
      if (o.legacy) R.legacy(true);
      R.open('host', { keepRaw: !!o.keepRaw });
      const each = o.stall ? (n, t) => { R.stalled = t >= o.stall[0] && t < o.stall[1]; if (o.each) o.each(n, t); } : o.each;
      if (o.warm) R.run(o.warm, each);
      const t0 = R.t, i0 = R.netMs.length, f0 = R.frameMs.length; R.maxBuf = 0;
      R.run(o.secs || 6, each);
      rec.delayPos = R.delay('pos', t0); rec.delayAll = R.delay(null, t0);
      const s = R.sum(t0 + 0.0001); rec.sum = s; rec.line = R.line(s); rec.top = R.top(s); rec.tick = R.tick(R.netMs.slice(i0)); rec.frame = R.tick(R.frameMs.slice(f0)); rec.maxBuf = R.maxBuf;
      rec.recs = R.log.filter((m) => m.t > t0); rec.series = R.series.slice(); rec.t0 = t0; rec.log = R.log.slice();
      rec.sim = sim().n; rec.queues = { netOut: g.netOut.length, creakOut: (g.creakOut || []).length, flQ: (g._flQ || []).length, fliers: g.fliers.length, stab: w().stabQueue.length };
      if (o.after) o.after(R, rec);
    } finally { R.close(); R.legacy(false); R.bw = Infinity; R.stalled = false; }
    (window.__netperf = window.__netperf || {})[name] = { delay: rec.delayPos && ('pos wait p95 ' + rec.delayPos.p95.toFixed(2) + ' s max ' + rec.delayPos.max.toFixed(2) + ' s, maxBuf ' + (rec.maxBuf / 1024).toFixed(0) + ' KB'), line: rec.line, top: rec.top, tick: rec.tick, frame: rec.frame, sim: rec.sim, queues: rec.queues, peak: rec.sum && rec.sum.peakSecKB, n: rec.sum && rec.sum.n };
    return rec;
  };

  return R;
}
