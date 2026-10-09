// audit_lag_forged.js: a friend's messages (or a broken build's) must never be able to freeze or poison the host: NaN and Infinity, ids that are not species,
// a flood, and messages that only the host ever sends. Every test runs a few real frames afterwards: a host that throws in its frame loop looks frozen.
import { RemotePlayer } from '../net.js';
import * as NG from '../netgame.js';
import { DECOYS, NEEDLE } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, w, p, sim, fresh, clearBodies, cellX, cellY, cellZ, toI, toJ, toK } = ctx;
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  let sent = [];
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(JSON.parse(JSON.stringify(m))); }; };
  const done = () => {
    delete g.netSend; role(null); if (g.remote) { try { g.remote.dispose(g.renderer.scene); } catch (e) { /* ignore */ } g.remote = null; }
    g.netOut.length = 0; g.net.inbox.reset(); g.net.pipe.reset(); g.netBodies.clear(); g.netPending.length = 0; clearBodies();
  };
  const G = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); } });
  const host = () => { fresh({}); clearBodies(); role('host'); cap(); p().pos.set(0, 0, 3); g.remote = new RemotePlayer(g.renderer.scene, 'Guest'); g.remote.pos.set(0, 0, 8); g.remote.target.copy(g.remote.pos); };
  // what a wire message looks like after JSON: 1e999 really arrives as Infinity
  const wire = (s) => JSON.parse(s);
  const rec = (k, v) => { (window.__lagperf = window.__lagperf || {})[k] = v; };
  const frames = (n) => { const e0 = g.errCount || 0; const a = performance.now(); for (let q = 0; q < n; q++) { g.time += 1 / 60; g.updatePlay(1 / 60); } return { errs: (g.errCount || 0) - e0, ms: (performance.now() - a) / n }; };
  const finiteSim = () => { for (let i = 0; i < sim().n; i++) if (!Number.isFinite(sim().x[i] + sim().y[i] + sim().z[i] + sim().vx[i] + sim().vy[i] + sim().vz[i])) return i; return -1; };

  await G('lag.audit.forged-pos-cannot-poison-the-friend-sphere-or-the-plush', async () => {
    host(); sim().spawn(3, 0, 0, 2, 7.5, 0, 0, 0, 1);
    for (const raw of ['{"t":"pos","x":"abc","y":0,"z":8,"yaw":0,"pitch":0}', '{"t":"pos","x":1e999,"y":0,"z":8,"yaw":0,"pitch":0}', '{"t":"pos","x":0,"y":null,"z":{},"yaw":[],"pitch":"q"}', '{"t":"pos","x":1e30,"y":-1e30,"z":0,"yaw":0,"pitch":0}']) {
      g.netMessage(wire(raw)); const f = frames(20);
      const rp = g.remote.pos, tg = g.remote.target;
      if (!Number.isFinite(rp.x + rp.y + rp.z + tg.x + tg.y + tg.z + g.remote.yaw + g.remote.pitch)) return `the friend's position became ${rp.x},${rp.y},${rp.z} (target ${tg.x},${tg.y},${tg.z}) after ${raw.slice(0, 50)}`;
      if (Math.abs(tg.x) > 1000 || Math.abs(tg.y) > 1000 || Math.abs(tg.z) > 1000) return `the friend was moved to ${tg.x},${tg.y},${tg.z} by one message`;
      if (f.errs) return 'frame errors after ' + raw.slice(0, 50) + ': ' + (g.errLog || []).slice(-1)[0];
      if (finiteSim() >= 0) return 'a plush went NaN after ' + raw.slice(0, 50);
      const sp = g.remote.spheres()[0]; if (!Number.isFinite(sp.x + sp.y + sp.z + sp.vel.x + sp.vel.y + sp.vel.z)) return 'the friend collision spheres are not finite: ' + JSON.stringify(sp);
    }
    return true;
  });

  await G('lag.audit.forged-spawn-is-rejected-and-a-real-throw-still-works', async () => {
    host(); const n0 = sim().n;
    const bad = [
      [30000, 0, 1, 2, 3, 0, 0, 0, 1], [70000, 0, 1, 2, 3, 0, 0, 0, 1], [-5, 0, 1, 2, 3, 0, 0, 0, 1], [3, 0, 'x', 2, 3, 0, 0, 0, 1], [3, 0, 1, 2, 3, 1e30, 0, 0, 1],
      [3, 0, 1e30, 2, 3, 0, 0, 0, 1], [3, 999, 1, 2, 3, 0, 0, 0, 1], [3, 0, 1, 2, 3, 0, 0, 0, 77], [3.5, 0, 1, 2, 3, 0, 0, 0, 1],
    ];
    const errs = [];
    for (const a of bad) { try { g.netMessage({ t: 'spawn', a }); } catch (e) { errs.push(String(e).slice(0, 60)); } }
    g.netMessage({ t: 'spawn', a: 7 }); g.netMessage({ t: 'spawn' }); g.netMessage({ t: 'spawn', a: [] });
    const f = frames(60);
    if (sim().n !== n0) return `${sim().n - n0} plush were made from forged spawn messages`;
    if (errs.length) return 'a forged spawn threw: ' + errs[0];
    if (f.errs) return 'frame errors: ' + (g.errLog || []).slice(-1)[0];
    g.netMessage({ t: 'spawn', a: [5, 1, 0.5, 1.4, 3.2, 0.5, 2, -1, 1] });
    if (sim().n !== n0 + 1) return 'a real throw was refused';
    // every plush a friend can hold can be thrown: the regular ones, The One and its gold fakes
    for (const id of [1, 77, 1360, NEEDLE, ...DECOYS]) if (!NG.validSpawn([id, 0, 0, 1, 0, 1, 1, 1, 1])) return 'a throw of the plush id ' + id + ' was refused';
    return true;
  });

  await G('lag.audit.forged-cells-with-ids-that-are-no-species-are-refused', async () => {
    host(); const s = ctx.spot(); const i = s.i + 6, k = s.k, j = 2;
    const before = w().get(i, j, k);
    let u = 1; while (ctx.species[u] !== undefined) u++;   // the first id that is no species
    const bad = [u, 30000, 60010, 65535];
    for (const sp of bad) { g.netMessage({ t: 'cells', a: [i, j, k, sp, 0] }); if (w().get(i, j, k) === sp) { w().setCell(i, j, k, before, 0); return `a cell was set to the id ${sp}, which is no species`; } }
    g.netMessage({ t: 'cells', a: [i, j, k, 0, 0] });
    if (w().get(i, j, k) !== 0) return 'a dig from the friend was refused';
    const f = frames(30); if (f.errs) return 'frame errors: ' + (g.errLog || []).slice(-1)[0];
    void before; return true;
  });

  await G('lag.audit.a-position-after-a-stall-is-not-a-speed-that-hurts-plush-and-the-friend', async () => {
    host(); const r = g.remote;
    g.netMessage({ t: 'pos', x: 0, y: 0, z: 8, yaw: 0, pitch: 0 });
    r._lastSet -= 4000;   // four seconds of silence on the link, then one message carrying the whole way the friend walked
    g.netMessage({ t: 'pos', x: 40, y: 0, z: 8, yaw: 0, pitch: 0 });
    const sp = r.vel.length(); if (sp > 25) return `the friend's sphere moves at ${sp.toFixed(0)} m/s after a stall: a plush next to them would be hit at that speed`;
    // and it is still a real speed while they sprint
    r._lastSet -= 100; g.netMessage({ t: 'pos', x: 40.6, y: 0, z: 8, yaw: 0, pitch: 0 });
    return r.vel.length() > 3 || 'a sprint (6 m/s) is no longer a speed: ' + r.vel.length().toFixed(1);
  });

  await G('lag.audit.a-flood-of-forged-messages-is-bounded-in-memory-and-per-frame-time', async () => {
    host(); const s = ctx.spot();
    const inbox = g.net.inbox; inbox.reset();
    const a = []; for (let q = 0; q < 800; q++) a.push(s.i + 5 + (q % 40), 1 + (q % 12), s.k - 20 + ((q / 40) | 0), 0, 0);
    const raw = JSON.stringify({ t: 'cells', a });
    let cut = false; for (let q = 0; q < 20000 && !cut; q++) { inbox.push(raw); cut = !g.net.open; }   // (a closed link delivers nothing more)   // 20,000 messages (800 cells each, 16 million edits) arriving in one go
    const bytes = raw.length * inbox.size();
    const worst = []; let total = 0;
    for (let q = 0; q < 120; q++) { const t0 = performance.now(); g.time += 1 / 60; g.updatePlay(1 / 60); const ms = performance.now() - t0; worst.push(ms); total += ms; }
    const p95 = [...worst].sort((x, y) => x - y)[Math.floor(worst.length * 0.95)];
    window.__lagperf = Object.assign(window.__lagperf || {}, { flood: { cut, queued: inbox.size(), MB: +(bytes / 1048576).toFixed(0), frameP95: +p95.toFixed(1), frameMax: +Math.max(...worst).toFixed(1) } });
    if (p95 > 40) return `frames took ${p95.toFixed(0)} ms (p95) while a flood was being handled`;
    // a peer that has sent this much (a gigabyte of text) is not a friend: the link is closed, or the backlog is cut. Nothing may keep growing without a limit.
    return (bytes < 128 * 1048576 && cut) || `${(bytes / 1048576).toFixed(0)} MB of unhandled messages held, link cut: ${cut}`;
  });

  await G('lag.audit.the-host-ignores-messages-that-only-a-host-sends', async () => {
    host(); const money = S().money, nEnt = S().entities.length;
    g.netMessage({ t: 'shared', money: 5, te: 5, up: { digSpeed: 99 }, gear: {}, items: {}, mats: {}, boosts: {}, contracts: [], gameMin: 1 });
    g.netMessage({ t: 'time', gameMin: 123 }); g.netMessage({ t: 'ent-', id: S().entities[0] ? S().entities[0].id : 1 });
    g.netMessage({ t: 'toast', icon: 'x', title: 'hello', text: 'x' });
    const bad = []; if (S().money !== money) bad.push('money overwritten'); if (S().entities.length !== nEnt) bad.push('an entity removed'); 
    return bad.length === 0 || 'the host obeyed a guest message: ' + bad.join(', ');
  });
  // every command a friend can send, with garbage in `d`: nothing may leave a number that is not a number in the host's money, stock or plush, and the loop must keep running
  await G('lag.audit.garbage-commands-never-poison-the-host-or-break-its-frame-loop', async () => {
    host(); S().money = 1000; S().totalEarned = 1000;
    const cmds = ['buy', 'craft', 'craftGear', 'place', 'decon', 'cfg', 'bplan', 'rail', 'vscan', 'arch', 'cable', 'earth', 'tile', 'feed', 'sell', 'bindest', 'reroll', 'cart', 'spend', 'cartpop', 'cartload', 'bulk', 'open', 'pnote', 'pay', 'tread', 'avclimb', 'patch', 'fuse', 'razzo', 'clearDust', 'crew', 'nonsense'];
    let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const atoms = [null, 0, -1, 1, 1e9, 'x', '', true, [], {}, [1, 2], { id: 'q' }, { id: 1e999 }, { sp: 'a', vr: null }, { n: 'x' }, { i: 1.5, j: 2, k: 3 }, { x: 1e999, y: 0, z: 0 }];
    const wire2 = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v === Infinity ? 1e999 : v)).replace(/1e999/g, '1e999'));
    const poison = [], thrown = [];
    const fields = ['id', 'sp', 'vr', 'n', 'i', 'j', 'k', 'kk', 'x', 'y', 'z', 'e', 'dist', 'bin', 'room', 'items', 'tool', 'ent', 'act', 'dir', 'a', 'b', 'patch', 'k'];
    const finite = () => { const bad = []; for (const k of ['money', 'totalEarned']) if (!Number.isFinite(S()[k])) bad.push(k); for (const [k, v] of Object.entries(S().items || {})) if (!Number.isFinite(v)) bad.push('items.' + k); if (!Number.isFinite(g.hp)) bad.push('hp'); const p0 = p().pos; if (!Number.isFinite(p0.x + p0.y + p0.z)) bad.push('player'); if (finiteSim() >= 0) bad.push('a plush'); return bad; };
    for (const c of cmds) {
      for (let q = 0; q < 24; q++) {
        let d = atoms[Math.floor(rnd() * atoms.length)];
        if (q % 2) { d = {}; for (let f = 0; f < 1 + Math.floor(rnd() * 5); f++) d[fields[Math.floor(rnd() * fields.length)]] = atoms[Math.floor(rnd() * atoms.length)]; }
        try { g.netMessage(JSON.parse(JSON.stringify({ t: 'cmd', c, d }))); } catch (e) { thrown.push(c + ': ' + String(e).slice(0, 70)); }
        const b = finite(); if (b.length) { poison.push(c + ' with ' + JSON.stringify(d).slice(0, 80) + ' left ' + b.join()); S().money = 1000; S().totalEarned = 1000; for (const k of Object.keys(S().items || {})) if (!Number.isFinite(S().items[k])) S().items[k] = 0; if (!Number.isFinite(g.hp)) g.hp = 100; }
      }
    }
    const f = frames(120);
    rec('garbageCmds', { thrown: thrown.length, poisoned: poison.length, frameErrs: f.errs });
    if (poison.length) return poison.slice(0, 3).join(' | ');
    if (f.errs) return 'frame errors after garbage commands: ' + (g.errLog || []).slice(-1)[0];
    return true;
  });
}
