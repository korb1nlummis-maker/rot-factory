import { kit } from './island_lib.js';
import { UP } from './portal_lib.js';
import { World } from '../world.js';
import { SEED_CAP } from '../island.js';
// mp.island.*: slabs cut off from the pile in multiplayer, no network (one page plays both roles by switching g.net.role and capturing g.netSend, as in mp_core.js).
// The host simulates everything: it finds the slab (also when a guest's dig cut it off), waits, lets it go, and tells the guest (isl, creak, boom, cells, bodies). A guest never
// runs the check and cannot make the host chew through a flood of forged cell edits.
// Run: `await __selftest('mp.island.')`
export default async function (ctx) {
  const { T, g, S, p, sim, fresh, cellX, cellY, cellZ } = ctx;
  const K = kit(ctx), W = K.W;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); if (g.world) { g.world.onSet = null; g.world.onCreakCell = null; } g.netOut.length = 0; };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); g.dead = false; g.blacking = false; } });
  const hostWorld = () => { role('host'); cap(); g.world.onSet = (i, j, k, sp, vr) => g.netOut.push(i, j, k, sp, vr); g.world.onCreakCell = (i, j, k) => { if (g.creakOut && g.creakOut.length < 200) g.creakOut.push(i, j, k); }; g.creakOut = []; g.netOut.length = 0; };
  const flush = () => { for (let n = 0; n < 400 && g.netOut.length; n++) { g._nt = 0; g.netUpdate(0.2); } g._nt = 0; g.netUpdate(0.2); };
  // the guest's world: the host's diff (what sendWorld sends a late joiner), then whatever the host says next
  const guestOf = (diffs) => { const host = g.world, gw = new World(g.S.seed); g.world = gw; role('guest'); try { for (const m of diffs) g.netMessage(json(m)); } finally { g.world = host; role('host'); } return gw; };
  const feed = (gw, msgs) => { const host = g.world; g.world = gw; role('guest'); try { for (const m of msgs) g.netMessage(json(m)); } finally { g.world = host; role('host'); } };
  const same = (gw, a, j0, nj) => { let bad = 0; for (let i = a.i0; i < a.i0 + a.nx; i++) for (let k = a.k0; k < a.k0 + a.nz; k++) for (let j = j0; j < j0 + nj; j++) if (gw.get(i, j, k) !== W().get(i, j, k)) bad++; return bad; };

  await guard('mp.island.the-host-announces-the-slab-and-its-fall-and-the-guest-ends-with-the-same-world', async () => {
    const A = K.arena(40, 40, UP); const a = { i: A.i0 + 10, j: 4, k: A.k0 + 10 }; K.block(a.i, a.j, a.k, 10, 3, 10); K.stand(A.i0 + 2, A.k0 + 2);
    hostWorld(); g.sendWorld(); const gw = guestOf(json(ofType('diff'))); if (same(gw, A, 0, 12)) return 'the late joiner does not see the same hanging slab: ' + same(gw, A, 0, 12) + ' cells differ';
    sent.length = 0; W().stabQueue.push({ i: a.i + 2, j: 4, k: a.k + 2 });
    if (K.until(() => W().isl.list.size > 0, 2) < 0) return 'not noticed';
    flush(); const warn = ofType('isl')[0], creak = ofType('creak');
    if (!warn || warn.n !== 300 || !(warn.sec >= 1 && warn.sec <= 3.1) || !Array.isArray(warn.b) || warn.b.length !== 5) return 'the host did not announce the slab: ' + JSON.stringify(warn);
    if (!creak.length || !creak[0].a.length) return 'the host sent no creak for the guest to hear';
    const f0 = S().stats.islandFalls || 0; K.until(() => (S().stats.islandFalls || 0) > f0, 5); K.run(8); flush();
    if (!ofType('boom').length) return 'no boom message for the guest to hear';
    const removed = ofType('cells').reduce((n, m) => { for (let q = 0; q < m.a.length; q += 5) if (m.a[q + 3] === 0) n++; return n; }, 0);
    if (removed < 300) return `only ${removed} cells of the slab were announced as gone`;
    feed(gw, sent); const diff = same(gw, A, 0, 12);
    return diff === 0 || `after the fall the guest's world differs from the host's in ${diff} cells`;
  });

  await guard('mp.island.the-guest-hears-and-reads-the-warning-and-never-runs-the-check', async () => {
    const A = K.arena(40, 40, UP); const hint = K.spy(g.ui, 'hint'), creak = K.spy(g.sound, 'creak'), rum = K.spy(g.sound, 'rumble');
    try {
      role('guest'); cap(); p().pos.set(cellX(A.i0 + 15), 0, cellZ(A.k0 + 15));
      const b = [A.i0 + 10, A.i0 + 19, A.k0 + 10, A.k0 + 19, 4];
      g.netMessage({ t: 'isl', x: cellX(A.i0 + 15), y: 3, z: cellZ(A.k0 + 15), n: 300, sec: 1.6, b });
      if (!hint.args.some((x) => /over your head/.test(String(x[0])))) return 'a guest standing under the slab got no warning';
      if (creak.n < 1) return 'no creak for the guest';
      hint.args.length = 0; p().pos.set(cellX(A.i0 + 2), 0, cellZ(A.k0 + 2)); g.netMessage({ t: 'isl', x: 0, y: 0, z: 0, n: 300, sec: 1.6, b });
      if (hint.args.some((x) => /over your head/.test(String(x[0])))) return 'a guest 13 cells away is told the slab is over its head';
      for (const bad of [{ t: 'isl' }, { t: 'isl', x: NaN, y: 'a', z: null, n: {}, b: 5 }, { t: 'isl', x: 1, y: 1, z: 1, n: 1, b: [1, 2] }]) { try { g.netMessage(bad); } catch (e) { return 'a forged isl message threw: ' + e.message; } }
      g.netMessage({ t: 'boom', x: cellX(A.i0 + 15), y: 3, z: cellZ(A.k0 + 15) }); if (rum.n < 1) return 'no rumble for the guest';
      // the guest world never judges a roof: its queue is emptied every frame and nothing registers
      W().stabQueue.push({ i: A.i0 + 12, j: 4, k: A.k0 + 12 }); K.block(A.i0 + 10, 4, A.k0 + 10, 10, 3, 10); g.updatePlay(0.05);
      return (W().stabQueue.length === 0 && !W().isl.list.size) || 'the guest queued or judged a roof';
    } finally { hint.stop(); creak.stop(); rum.stop(); }
  });

  await guard('mp.island.a-guest-dig-that-cuts-a-slab-off-is-judged-and-dropped-by-the-host', async () => {
    const A = K.arena(60, 40, UP); const i0 = A.i0 + 8, k0 = A.k0 + 10, rows = 12;
    K.block(i0, 0, k0, 20, rows, 14); K.dig(i0, 0, k0 + 5, 20, 3, 4); K.stand(A.i0 + 2, A.k0 + 2);   // a tunnel through a pile block: it stands (shorter than the safe length from each mouth)
    hostWorld(); K.run(6); const top = () => K.count(i0, rows - 3, k0 + 5, 20, 3, 4);
    if (top() !== 240) return 'the tunnel did not stand';
    // the guest digs a trench on each side of the roof and sends the cells (what the guest's own game announces for every plush it takes out)
    const a = []; for (const z of [k0 + 3, k0 + 4, k0 + 9, k0 + 10]) for (let x = 0; x < 20; x++) for (let j = 3; j < rows; j++) a.push(i0 + x, j, z, 0, 0);
    for (let q = 0; q < a.length; q += 4000) g.netMessage({ t: 'cells', a: a.slice(q, q + 4000) });
    if (!W().stabQueue.length) return 'the host did not queue the guest edits for the roof and island checks';
    const f0 = S().stats.islandFalls || 0; sent.length = 0; K.run(18); flush();
    if ((S().stats.islandFalls || 0) === f0 || !ofType('isl').length) return 'the host never found the slab the guest cut off (falls ' + ((S().stats.islandFalls || 0) - f0) + ', warnings ' + ofType('isl').length + ')';
    return top() <= 20 || `${top()} of 240 plush in the top layers still hang after the guest cut the roof off`;
  });

  await guard('mp.island.a-late-joiner-in-the-middle-of-the-wait-ends-with-the-host-world', async () => {
    const A = K.arena(40, 40, UP); const a = { i: A.i0 + 10, j: 4, k: A.k0 + 10 }; K.block(a.i, a.j, a.k, 10, 3, 10); K.stand(A.i0 + 2, A.k0 + 2);
    hostWorld(); W().stabQueue.push({ i: a.i + 2, j: 4, k: a.k + 2 }); if (K.until(() => W().isl.list.size > 0, 2) < 0) return 'not noticed';
    K.run(0.5); flush(); sent.length = 0; g.sendWorld(); const gw = guestOf(json(ofType('diff'))); sent.length = 0;     // the guest joins with the slab still up
    if (K.count(a.i, a.j, a.k, 10, 3, 10) !== 300 || same(gw, A, 0, 12)) return 'the joiner did not get the world as it was';
    const f0 = S().stats.islandFalls || 0; K.until(() => (S().stats.islandFalls || 0) > f0, 5); K.run(10); flush(); feed(gw, sent);
    const diff = same(gw, A, 0, 12); return diff === 0 || `the late joiner's world differs in ${diff} cells after the fall`;
  });

  await guard('mp.island.forged-guest-cell-messages-cannot-stall-the-host-or-grow-its-queues', async () => {
    const A = K.arena(60, 60, UP); K.block(A.i0 + 5, 0, A.k0 + 5, 50, 14, 50); K.stand(A.i0 + 2, A.k0 + 2); hostWorld();
    const ri = () => A.i0 + 5 + ((Math.random() * 50) | 0), rk = () => A.k0 + 5 + ((Math.random() * 50) | 0);
    const big = []; for (let n = 0; n < 200000; n++) big.push(ri(), 1 + ((Math.random() * 13) | 0), rk(), 0, 0);   // a million numbers: 200,000 removals
    const junk = [NaN, 1.5, -3, 1e12, 'x', null, undefined, {}, [], 7, 99999999, 0.1];
    const garbage = []; for (let n = 0; n < 2000; n++) garbage.push(junk[n % 12], junk[(n * 7) % 12], junk[(n * 3) % 12], junk[(n * 5) % 12], junk[(n * 11) % 12]);
    const msgs = [{ t: 'cells', a: big }, { t: 'cells', a: garbage }, { t: 'cells', a: 'not an array' }, { t: 'cells' }, { t: 'cells', a: [A.i0 + 6, 3, A.k0 + 6, 70000, 5, A.i0 + 6, 4, A.k0 + 6, 5, 999] }];
    const before = W().diffCount; let worst = 0;
    for (const m of msgs) { const t0 = performance.now(); try { g.netMessage(m); } catch (e) { return 'a forged cells message threw: ' + e.message; } worst = Math.max(worst, performance.now() - t0); }
    if (worst > 1500) return `one forged message took ${worst.toFixed(0)} ms`;
    if (W().get(A.i0 + 6, 3, A.k0 + 6) === 70000 || W().get(A.i0 + 6, 4, A.k0 + 6) === 5 && W().getVr(A.i0 + 6, 4, A.k0 + 6) === 999) return 'an out of range plush species or variant was written into the world';
    if (W().stabQueue.length > 30001) return 'the roof queue grew to ' + W().stabQueue.length;
    let tick = 0; for (let n = 0; n < 300; n++) { const t0 = performance.now(); g.time += 1 / 60; g.slide.update(1 / 60); sim().step(1 / 60); W().updateStability(1 / 60, g.T.warn, g.stabHooks()); tick = Math.max(tick, performance.now() - t0); }
    if (W().isl.pending() > SEED_CAP) return 'the island queue grew to ' + W().isl.pending();
    void before; return tick < 80 || `a host tick took ${tick.toFixed(0)} ms with the flood queued`;
  });

  await guard('mp.island.a-guest-has-the-same-island-after-a-chain-of-collapses-with-both-roles-in-the-loop', async () => {
    // a thin cap and a slab in one world: whatever falls on the host is in the guest's world after its messages, and the plush count is the same
    const A = K.arena(60, 60, UP); const P = { i: A.i0 + 6, k: A.k0 + 6 }; K.block(P.i, 0, P.k, 30, 4, 30); K.stand(A.i0 + 1, A.k0 + 1);
    hostWorld(); g.sendWorld(); const gw = guestOf(json(ofType('diff'))); sent.length = 0;
    K.dig(P.i + 6, 0, P.k + 6, 16, 3, 16); K.dig(P.i - 1, 0, P.k + 13, 7, 3, 2);       // a 16 by 16 room under a 1 cell cap
    K.run(30); flush(); feed(gw, sent);
    const diff = same(gw, { i0: P.i - 2, k0: P.k - 2, nx: 34, nz: 34 }, 0, 8);
    return diff === 0 || `the guest's world differs from the host's in ${diff} cells after the cap came down`;
  });
}
