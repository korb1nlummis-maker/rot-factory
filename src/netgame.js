// The game's side of co-op traffic control (see netperf.js for the pipe and the inbox): what is sent how often and how big, the guest's body stream,
// the late joiner's world in slices, the ping, the F3 numbers and the "connection slow" badge. Functions take the game as their first argument.
import { compactCells } from './netperf.js';
import { species } from './plushdata.js';

// seconds between messages for pipe levels 0 (fine), 1 (slow), 2 (bad)
export const IV = { pos: [0.1, 0.15, 0.3], bodies: [0.14, 0.22, 0.38], dyn: [0.17, 0.34, 0.7], fl: [0.08, 0.16, 0.32], creak: [0.15, 0.3, 0.6], shared: [0.6, 1.2, 2.4] };
export const CELL_RATE = 8000;       // cells per second the pipe may carry (about 130 KB/s of JSON)
export const CELL_BURST = 800;       // cells in one message at most
export const BODY_CAP = 220;         // bodies in one message at most (scaled down while the link is slow)
export const DYN_BUDGET = 40000;     // bytes per second of dyn rows: a big factory sends them less often, never more
export const BODY_R2 = 6400;         // bodies within 80 m of either player are sent
const WORLD_MSGS = 10, WORLD_BYTES = 48 * 1024, WORLD_MS = 4;

const now = () => performance.now();

// ------------------------------------------------------------------ what the host believes of a friend's messages (a forged or broken one must not freeze it)
// the plush a friend throws: a real species, a whole variant, numbers that are numbers, a position that is on the map and a speed a throw can have
export function validSpawn(a) {
  if (!Array.isArray(a) || a.length < 9) return false;
  const sp = a[0], vr = a[1];
  if (!(Number.isInteger(sp) && sp > 0 && species[sp] !== undefined && Number.isInteger(vr) && vr >= 0 && vr < 256)) return false;
  for (let n = 2; n < 5; n++) if (!(Math.abs(a[n]) < 1e4)) return false;      // (NaN, a string and Infinity all fail this)
  for (let n = 5; n < 8; n++) if (!(Math.abs(a[n]) < 120)) return false;
  return a[8] === 0 || a[8] === 1 || a[8] === 2;
}
// messages only a host ever sends: a host that receives one ignores it (a forged 'shared' would rewrite its money, a 'world' would restart its game)
export const HOST_ONLY = new Set(['world', 'diff', 'ents', 'ready', 'shared', 'dyn', 'dynb', 'bodies', 'creak', 'isl', 'time', 'fl', 'ent+', 'ent-', 'cables', 'nflag', 'nflags', 'nclue', 'toast', 'note', 'give', 'nope', 'xrow', 'sale', 'boom', 'razzo', 'slide', 'sfail', 'swarn', 'sbreak', 'sstrain', 'chint', 'avwarn', 'avrun', 'avend', 'avride']);

// ------------------------------------------------------------------ the per frame net tick (both roles)
export function update(g, dt) {
  const net = g.net;
  if (!net.open) return;
  const t0 = now(), st = net.stats, pipe = net.pipe;
  if (g.world && !g.world.onSet) g.world.onSet = (i, j, k, sp, vr) => { g.netOut.push(i, j, k, sp, vr); };   // (a new world while connected, or a hook another system took off: cell edits must never go unsent)
  net.inbox.frame(); net.inbox.drain(3);   // what arrived in a flood is handled a few ms a frame
  pipe.pump(dt);
  const lv = pipe.level, q = pipe.quality();
  // cell edits: a token bucket (so a cave-in of thousands of cells is a few seconds of steady traffic, not one huge burst), identical edits merged
  g._cellTok = Math.min(CELL_BURST, (g._cellTok === undefined ? CELL_BURST : g._cellTok) + dt * CELL_RATE * q);
  if (!g.netOut.length) g._cmpAt = 0;
  g._nt = (g._nt || 0) - dt;   // at most twenty cell messages a second: a dig is a few big messages, not one small one every frame
  if (g.netOut.length && (g._nt <= 0 || g.netOut.length >= CELL_BURST * 5 / 2)) {
    // (a long queue is looked through for repeated edits when it has doubled since the last time, not at every message: that was a full scan of a million numbers twenty times a second)
    if (g.netOut.length > (g._cmpAt || 200000)) { const c = compactCells(g.netOut); if (c !== g.netOut) { g.netOut.length = 0; for (let n = 0; n < c.length; n++) g.netOut.push(c[n]); } g._cmpAt = Math.max(200000, g.netOut.length * 2); }
    else if (g._cmpAt && g.netOut.length < 200000) g._cmpAt = 0;
    const n = Math.min(CELL_BURST, Math.floor(g._cellTok), Math.floor(g.netOut.length / 5));
    if (n > 0) { g._cellTok -= n; g._nt = 0.05; g.netSend({ t: 'cells', a: g.netOut.splice(0, n * 5) }); }
  }
  g._np = (g._np || 0) - dt;
  if (g._np <= 0) {
    g._np = IV.pos[lv];
    const p = g.player;
    g.netSend({ t: 'pos', x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), lamp: g.lampOn !== false });
  }
  if (net.role === 'host') {
    g._nb = (g._nb || 0) - dt;
    if (g._nb <= 0) { g._nb = IV.bodies[lv]; const a = now(); sendBodies(g, q); st.time('bodies', now() - a); }
    g._nc = (g._nc || 0) - dt;
    if (g.creakOut && g.creakOut.length && g._nc <= 0) { g._nc = IV.creak[lv]; g.netSend({ t: 'creak', a: g.creakOut.splice(0, 90) }); }
    g._nd = (g._nd || 0) - dt;
    if (g._nd <= 0 && g.remote) {
      const a = now(); g.sendDyn(); st.time('dyn', now() - a);
      g._nd = Math.max(IV.dyn[lv], (st.lastBytes.dyn || 0) / DYN_BUDGET);   // a big factory sends its rows less often
    }
    g.flushFx(dt);
    g._ns = (g._ns || 0) - dt;
    if (g._ns <= 0) { g._ns = IV.shared[lv]; periodicShared(g); }
    g._ntm = (g._ntm || 0) - dt; if (g._ntm <= 0) { g._ntm = 6; g.netSend({ t: 'time', gameMin: g.S.gameMin }); }
    if (g._worldGen) pumpWorld(g);
  }
  g._npg = (g._npg === undefined ? 2 : g._npg) - dt;   // (the first ping goes after two seconds)
  if (g._npg <= 0) { g._npg = 2; g.netSend({ t: 'png', ts: now() }); }
  if (g.remote) g.remote.update(dt);
  st.time('tick', now() - t0);
  st.roll();
  slowBadge(g, dt);
  if (g.showFps || g._netEl) overlay(g, dt);
}

export function ping(g, m) { g.netSend({ t: 'pog', ts: m.ts }); }
export function pong(g, m) {
  const rtt = now() - m.ts;
  if (!(rtt >= 0 && rtt < 1e6)) return;
  const st = g.net.stats; st.rtt = rtt; if (rtt > st.rttMax) st.rttMax = rtt;
  g.net.pipe.setRtt(rtt);
}

// ------------------------------------------------------------------ bodies: the host's loose plush, packed as small integers
// [id, species, variant, x*100, y*100, z*100, qx*250, qy*250, qz*250, qw*250, squash*100] per body, nearest to either player first; far ones less often.
// `k` (every half second): the ids of everything in range, so the guest can drop what is gone.
export function sendBodies(g, q) {
  const s = g.sim, p = g.player.pos, rp = g.remote ? g.remote.pos : null;
  const cap = Math.max(24, Math.round(BODY_CAP * q)), tick = g._nbTick = ((g._nbTick | 0) + 1) | 0;
  const idx = [], dd = [], all = [];
  for (let i = 0; i < s.n; i++) {
    const dx = s.x[i] - p.x, dz = s.z[i] - p.z; let d2 = dx * dx + dz * dz;
    if (rp) { const ex = s.x[i] - rp.x, ez = s.z[i] - rp.z, e2 = ex * ex + ez * ez; if (e2 < d2) d2 = e2; }
    if (d2 >= BODY_R2) continue;
    all.push(s.bid[i]);
    if ((tick + s.bid[i]) % (d2 < 1600 ? 1 : d2 < 3025 ? 2 : d2 < 4900 ? 3 : 4)) continue;   // plush far away (small on the screen) update every second, third or fourth time (past 40, 55 and 70 m)
    idx.push(i); dd.push(d2);
  }
  if (!all.length && !g._nbLast) return;   // nothing to say, and the guest was told so already
  let order = idx;
  const sentAt = g._nbSent || (g._nbSent = new Map());   // body id -> the tick it was last sent
  if (idx.length > cap) {
    // more bodies than one message holds (an avalanche, a cave-in): the nearest 60% go every time, the rest of the message goes to the ones that have waited longest
    // (never sent first, the nearer first among equals). Without that the guest never sees the bodies past the cap, and the ones it has stop where they were last sent.
    const o = idx.map((_, n) => n).sort((a, b) => dd[a] - dd[b]), keep = Math.ceil(cap * 0.6);
    order = o.slice(0, keep).map((n) => idx[n]);
    const rest = o.slice(keep).map((n) => idx[n]), wait = (i) => { const t = sentAt.get(s.bid[i]); return t === undefined ? 1e9 : (tick - t) | 0; };
    rest.sort((x, y) => wait(y) - wait(x));   // (a stable sort: equal waits stay in distance order)
    for (let n = 0; n < rest.length && order.length < cap; n++) order.push(rest[n]);
  }
  for (const i of order) sentAt.set(s.bid[i], tick);
  const a = [];
  for (const i of order) {
    a.push(s.bid[i], s.sp[i], s.vr[i], Math.round(s.x[i] * 100), Math.round(s.y[i] * 100), Math.round(s.z[i] * 100), Math.round(s.q[i * 4] * 250), Math.round(s.q[i * 4 + 1] * 250), Math.round(s.q[i * 4 + 2] * 250), Math.round(s.q[i * 4 + 3] * 250), Math.round(s.sq[i] * 100));
  }
  const msg = { t: 'bodies', p: 1, a };
  if (!(tick % Math.max(1, Math.round(0.5 / IV.bodies[g.net.pipe.level | 0]))) || !all.length) {
    msg.k = all;
    if (sentAt.size > all.length) { const live = new Set(all); for (const id of [...sentAt.keys()]) if (!live.has(id)) sentAt.delete(id); }   // (what left the range or the world is forgotten)
  }
  g._nbLast = all.length;
  if (!a.length && !msg.k) return;
  g.netSend(msg);
}

export function applyBodies(g, m) {
  const a = m.a; if (!Array.isArray(a)) return;
  const packed = m.p === 1, nb = g.netBodies, seen = packed ? null : new Set();
  for (let n = 0; n + 10 < a.length; n += 11) {
    const id = a[n]; if (seen) seen.add(id);
    let x, y, z, q0, q1, q2, q3, sq;
    if (packed) { x = a[n + 3] / 100; y = a[n + 4] / 100; z = a[n + 5] / 100; q0 = a[n + 6] / 250; q1 = a[n + 7] / 250; q2 = a[n + 8] / 250; q3 = a[n + 9] / 250; sq = a[n + 10] / 100; }
    else { x = a[n + 3]; y = a[n + 4]; z = a[n + 5]; q0 = a[n + 6]; q1 = a[n + 7]; q2 = a[n + 8]; q3 = a[n + 9]; sq = a[n + 10]; }
    if (!(x === x && y === y && z === z)) continue;
    let b = nb.get(id);
    if (!b) { if (nb.size > 4000) continue; b = { id, x, y, z, q: [q0, q1, q2, q3] }; nb.set(id, b); }
    b.sp = a[n + 1]; b.vr = a[n + 2]; b.tx = x; b.ty = y; b.tz = z; b.tq = [q0, q1, q2, q3]; b.sq = sq;
  }
  if (Array.isArray(m.k)) { const keep = new Set(m.k); for (const id of [...nb.keys()]) if (!keep.has(id)) nb.delete(id); }
  else if (seen) for (const id of [...nb.keys()]) if (!seen.has(id)) nb.delete(id);
}

// ------------------------------------------------------------------ the shared numbers: the heavy part (upgrades, gear, items ...) only when it changed
export function periodicShared(g) {
  const S = g.S;
  const heavy = JSON.stringify([S.up, S.gear, S.items, S.mats, S.boosts, S.contracts, S.clues || [], S.clueLevel || 0, g.world.needle.i, g.world.needle.j, g.world.needle.k]);
  g._shT = (g._shT || 0) + 1;
  if (heavy !== g._shKey || g._shT >= 5) { g._shKey = heavy; g._shT = 0; g.sendShared(); return; }
  g.netSend({
    t: 'shared', money: S.money, te: S.totalEarned, gameMin: S.gameMin, golden: g.golden || 0, outage: g.outage || 0, ending: S.ending || null,
    eco: { md: S.stats.maxDist || 0, dx: g.dexN(), pl: S.stats.plush || 0 },
  });
}

// ------------------------------------------------------------------ dyn: a message that would be big carries its belts in several
export function sendDyn(g, body) {
  const belts = body.belts;
  const rows = []; let cur = [], cs = 0;
  for (const a of belts) { const sz = 6 + a.length * 4.5; if (cs + sz > 24000 && cur.length) { rows.push(cur); cur = []; cs = 0; } cur.push(a); cs += sz; }
  rows.push(cur);
  // belt power rows ride along only when they changed (or every two seconds): a big factory sends thousands of them
  const bpw = body.bpw; let bk = null;
  if (bpw.length > 600) { bk = bpw.join(); const t = g.time; if (bk === g._bpwKey && t - (g._bpwT || 0) < 2) body = { ...body, bpw: undefined }; else { g._bpwKey = bk; g._bpwT = t; } }
  g.netSend({ t: 'dyn', ...body, belts: rows[0] });
  for (let q = 1; q < rows.length && q < 16; q++) g.netSend({ t: 'dynb', p: q, belts: rows[q] });
}
export function applyBelts(g, belts) {
  const L = g.logi;
  if (!Array.isArray(belts)) return;
  for (const a of belts) {
    const t = L.byId.get(a[0]); if (!t) continue;
    const its = [];
    for (let n = 1; n < a.length; n += 3) its.push({ sp: a[n], vr: a[n + 1], t: a[n + 2] / 100 });
    t.items = its;
  }
}

// ------------------------------------------------------------------ the late joiner's world, a few slices a frame
export function* worldSteps(g) {
  const w = g.world;
  yield { t: 'world', seed: g.S.seed, gameMin: g.S.gameMin };
  for (const a of w.diffSlices(3000)) yield { t: 'diff', a };
  let cur = [], cs = 0;
  for (const e of g.S.entities) {
    const o = g.stripEnt(e), sz = JSON.stringify(o).length;
    if (cur.length && (cs + sz > 32000 || cur.length >= 100)) { yield { t: 'ents', list: cur }; cur = []; cs = 0; }
    cur.push(o); cs += sz;
  }
  if (cur.length) yield { t: 'ents', list: cur };
  yield { t: 'cables', list: g.cables.list().map((c) => ({ id: c.id, a: c.a, b: c.b })) };
  yield { t: 'nflags', list: (g.S.nflags || []).slice(0, 40) };
  yield 'shared';
  yield { t: 'ready' };
}
// everything at once (what the tests and any caller that wants the whole thing now use)
export function sendWorldNow(g) {
  for (const m of worldSteps(g)) { if (m === 'shared') g.sendShared(); else g.netSend(m); }
}
export function beginWorld(g) { g._worldGen = worldSteps(g); g._worldSent = 0; pumpWorld(g); }
// a few slices per frame, and none while the link is behind
export function pumpWorld(g) {
  const gen = g._worldGen; if (!gen) return;
  const net = g.net, pipe = net.pipe, st = net.stats, t0 = now();
  let bytes = 0, n = 0;
  while (n < WORLD_MSGS && bytes < WORLD_BYTES && now() - t0 < WORLD_MS) {
    if (pipe.queue.length || pipe.buffered() >= pipe.hi) return;
    const r = gen.next();
    if (r.done) { g._worldGen = null; return; }
    const m = r.value;
    if (m === 'shared') g.sendShared(); else { g.netSend(m); bytes += st.lastBytes[m.t] || 4000; }
    g._worldSent++; n++;
  }
}

// ------------------------------------------------------------------ what a guest holds back while it is still loading the world: the newest of each visual kind, not all of them
const HOLD_LATEST = new Set(['pos', 'dyn', 'bodies', 'time']);
const HOLD_FX = new Set(['fl', 'creak', 'slide', 'dynb']);
export function hold(g, m) {
  const P = g.netPending, t = m.t;
  if (t === 'sale' && m.fb) return;   // only the sound of a sale the host made: a late joiner would hear the coins of the seconds before it arrived, all at once
  if (HOLD_LATEST.has(t) || t === 'shared') {
    const L = P._last || (P._last = new Map()), old = L.get(t);
    if (old) {
      const i = P.lastIndexOf(old);
      if (t === 'shared') { if (i >= 0) { const merged = { ...old, ...m }; P[i] = merged; L.set(t, merged); return; } } else if (i >= 0) P.splice(i, 1);
    }
    L.set(t, m);
  } else if (HOLD_FX.has(t)) {
    let n = 0; for (let i = P.length - 1; i >= 0 && n < 64; i--) if (HOLD_FX.has(P[i].t)) n++;
    if (n >= 64) return;
  }
  P.push(m);
}
// the held messages go to the front of the inbox: they are handled over the next frames, not all in this one
export function replayHeld(g, list) {
  if (g.net.inbox && g.net.inbox.prepend) g.net.inbox.prepend(list); else for (const x of list) g.netMessage(x);
  if (g.netPending && g.netPending._last) g.netPending._last.clear();
}

// ------------------------------------------------------------------ what the player sees: the slow badge and the F3 numbers
export function slowBadge(g, dt) {
  const net = g.net, pipe = net.pipe, st = net.stats;
  const gap = net.lastRx ? now() - net.lastRx : 0;
  const slow = pipe.level >= 1 || st.rtt > 1500 || (g.net.role === 'guest' && g.guestReady && gap > 2500);
  g._slowT = slow ? (g._slowT || 0) + dt : Math.max(0, (g._slowT || 0) - dt * 0.7);
  const show = g._slowT > 0.6;
  if (show === !!g._slowOn) { if (show && g._slowEl) g._slowEl.title = `${(pipe.buffered() / 1024).toFixed(0)} KB waiting, round trip ${st.rtt.toFixed(0)} ms`; return; }
  g._slowOn = show;
  if (typeof document === 'undefined') return;
  let el = g._slowEl;
  if (!el) {
    el = g._slowEl = document.createElement('div'); el.id = 'netSlow';
    el.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:45;padding:4px 12px;border-radius:14px;background:rgba(120,60,10,0.85);color:#ffe8c0;font:600 12px ui-monospace,Menlo,monospace;pointer-events:none;';
    el.textContent = 'Connection slow: sending less detail'; document.body.appendChild(el);
  }
  el.style.display = show ? 'block' : 'none';
}
export function overlay(g, dt) {
  const net = g.net;
  g._ovT = (g._ovT || 0) - dt; if (g._ovT > 0) return; g._ovT = 0.5;
  if (typeof document === 'undefined') return;
  let el = g._netEl;
  if (!el) {
    el = g._netEl = document.createElement('pre'); el.id = 'netStat';
    el.style.cssText = 'position:fixed;left:8px;top:22px;z-index:40;margin:0;padding:2px 8px;border-radius:0 0 6px 6px;font:600 11px ui-monospace,Menlo,monospace;color:#b8ffb0;background:rgba(0,0,0,0.55);pointer-events:none;white-space:pre;';
    document.body.appendChild(el);
  }
  if (!g.showFps) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const pipe = net.pipe;
  el.textContent = net.role + '\n' + net.stats.report({ buffered: pipe.buffered(), queued: pipe.queue.length, inbox: net.inbox.size(), level: pipe.level }).join('\n');
}
export function hideOverlay(g) { if (g._netEl) g._netEl.style.display = 'none'; if (g._slowEl) g._slowEl.style.display = 'none'; g._slowOn = false; g._slowT = 0; }

