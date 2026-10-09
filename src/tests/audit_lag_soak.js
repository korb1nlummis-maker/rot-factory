// audit_lag_soak.js: random soaks of the whole net layer on a bad link. After the events and the link have settled, what the host sent must rebuild the host's world
// exactly in a guest (cells), the host's plush must be conserved (cells plus bodies), and no queue may have grown without a limit.
// One page plays both roles: the guest is simulated by putting the region back to how it was, then feeding the recorded stream through the guest's receive path.
import { makeRig, DT } from './netperf_lib.js';
import { kit as islandKit } from './island_lib.js';

export default async function (ctx) {
  const { T, g, w, sim, cellX, cellZ, clearBodies } = ctx;
  const R = makeRig(ctx);
  const KB = 1024;
  const rec = (k, v) => { (window.__lagperf = window.__lagperf || {})[k] = v; };
  // a seeded random so a failure can be run again
  const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const region = (s, di0, di1, dk0, dk1, dj1) => ({ i0: s.i + di0, i1: s.i + di1, k0: s.k + dk0, k1: s.k + dk1, j1: dj1 });
  const take = (b) => { const out = new Uint16Array((b.i1 - b.i0) * (b.k1 - b.k0) * b.j1), vr = new Uint8Array(out.length); let n = 0; for (let i = b.i0; i < b.i1; i++) for (let k = b.k0; k < b.k1; k++) for (let j = 0; j < b.j1; j++) { out[n] = w().inside(i, j, k) ? w().get(i, j, k) : 0; vr[n] = w().inside(i, j, k) ? w().getVr(i, j, k) : 0; n++; } return { sp: out, vr }; };
  const put = (b, snap) => { const wd = w(); wd._remoteApply = true; try { let n = 0; for (let i = b.i0; i < b.i1; i++) for (let k = b.k0; k < b.k1; k++) for (let j = 0; j < b.j1; j++) { if (wd.inside(i, j, k) && (wd.get(i, j, k) !== snap.sp[n] || wd.getVr(i, j, k) !== snap.vr[n])) wd.setCell(i, j, k, snap.sp[n], snap.vr[n]); n++; } } finally { wd._remoteApply = false; } };
  const diff = (b, a, c) => { let n = 0, first = null, idx = 0; for (let i = b.i0; i < b.i1; i++) for (let k = b.k0; k < b.k1; k++) for (let j = 0; j < b.j1; j++) { if (a.sp[idx] !== c.sp[idx] || a.vr[idx] !== c.vr[idx]) { n++; if (!first) first = [i, j, k, a.sp[idx], c.sp[idx]]; } idx++; } return { n, first }; };

  const soak = (seed, secs, links) => {
    const r = rng(seed), out = {};
    R.build({}); R.slope(); R.machines(60); R.bots(12);
    const s = R.sp0, box = region(s, -12, 150, -70, 70, 34);
    const start = take(box);
    R.bw = links[0]; R.stalled = false; R.open('host', { keepRaw: true });
    const evAt = new Map(); for (let q = 0; q < secs; q++) { const t = Math.floor(r() * 60 * secs); evAt.set(t, ['dig', 'avalanche', 'cave', 'fill', 'portal', 'rig', 'throw'][Math.floor(r() * 7)]); }
    let linkN = 0;
    const each = (n, t) => {
      R.power(); if (n % 60 === 0) R.refill();
      if (n % 240 === 0) { R.bw = links[(linkN++) % links.length]; R.stalled = r() < 0.2; }
      if (n % 240 === 120) R.stalled = false;
      R.moveGuest(n);
      const ev = evAt.get(n);
      if (ev === 'dig') { const a = Math.floor(r() * 30); for (let q = 0; q < 12; q++) for (let j = 1; j < 4; j++) w().removeCell(s.i + a + q, j, s.k + Math.floor(r() * 6), true); }   // (the host digs; a guest dig is not in the host's stream, so it is left out of this comparison)
      else if (ev === 'avalanche') for (let q = 0; q < 6; q++) R.avalanche(20 * q);
      else if (ev === 'cave') R.caveIn(s.i + 4 + Math.floor(r() * 20), 1, s.k - 30 + Math.floor(r() * 10), 10 + Math.floor(r() * 20), 5 + Math.floor(r() * 15), 10 + Math.floor(r() * 20));
      else if (ev === 'fill') R.fill(s.i + 4 + Math.floor(r() * 20), 1, s.k - 30 + Math.floor(r() * 10), 10 + Math.floor(r() * 20), 5 + Math.floor(r() * 15), 10 + Math.floor(r() * 20));
      if (ev === 'portal' || (n % 3 === 0 && ev === undefined && r() < 0.01)) R.portalStep(n, 6);
      if (ev === 'rig') for (let q = 0; q < 20; q++) R.rigsStep(q * 3, 50);
      if (ev === 'throw') for (let q = 0; q < 10; q++) R.throwStep(q * 30);
    };
    R.run(secs, each);
    // the link is healthy again: let everything drain and the plush settle
    R.bw = Infinity; R.stalled = false;
    R.run(25, (n) => { R.power(); });
    clearBodies(); R.run(3, (n) => { R.power(); });   // (a plush that was still bouncing would freeze into a cell at any moment: the last edit of the run may not be on the wire yet)
    const q0 = { netOut: g.netOut.length, queue: g.net.pipe.queue.length, slots: g.net.pipe.slots.size, inbox: g.net.inbox.size() };
    const pending = g.netOut.slice();   // (the engine may still be settling a slab or a roof: the edits of the last frames are in the host's own queue, and go to the guest too)
    out.queues = q0; out.sim = sim().n; out.final = take(box);
    out.cells = R.log.filter((m) => m.type === 'cells').length; out.maxBuf = R.maxBuf; out.log = R.log.map((m) => ({ type: m.type, raw: m.type === 'cells' ? m.raw : null }));
    out.sum = R.sum(0);
    // the guest: the region as it was, then the stream
    R.close();
    put(box, start);
    g.net.role = 'guest'; g.guestReady = true; g.net.open = true;
    try { for (const m of out.log) if (m.raw) g.net.rx(m.raw); if (pending.length) g.net.rx(JSON.stringify({ t: 'cells', a: pending })); let guard = 0; while (g.net.inbox.size() > 0 && guard++ < 1e5) g.net.inbox.drain(50); } finally { g.net.open = false; g.net.role = null; g.guestReady = false; g.net.inbox.reset(); }
    out.guest = take(box); out.box = box; out.start = start;
    put(box, start); clearBodies();   // (the world goes back to how it was for the next test: no loose plush left over for a test that fakes the friend with a stub)
    return out;
  };

  const check = (name, o) => {
    const d = diff(o.box, o.final, o.guest);
    const bad = [];
    if (d.n) bad.push(`${d.n} cells differ between the host and the guest rebuilt from the stream (first at ${JSON.stringify(d.first)})`);
    const q = o.queues; if (q.netOut > 200 || q.queue || q.slots > 4) bad.push('the queues did not drain on a healthy link: ' + JSON.stringify(q));
    rec(name, { cells: o.cells, KBs: +o.sum.kbs.toFixed(1), peakKB: +o.sum.peakSecKB.toFixed(0), maxBufKB: +(o.maxBuf / KB).toFixed(0), bodies: o.sim, differ: d.n });
    return bad.length === 0 || bad.join('; ');
  };

  for (const seed of [11, 4242]) {
    await T(`lag.soak.the-cell-stream-rebuilds-the-host-world-in-the-guest-seed-${seed}`, async () => { try { return check('soak' + seed, soak(seed, 24, [Infinity, 150 * KB, 60 * KB, 400 * KB, 30 * KB])); } finally { R.close(); R.bw = Infinity; R.stalled = false; clearBodies(); } });
  }

  // the host loses no plush and makes none out of nothing while the net layer runs on a bad link: every plush that leaves a cell is a loose body or a cell again
  // (tally() counts every setCell of the engine: removed - added - loose bodies = 0)
  await T('lag.soak.plush-is-conserved-through-slides-and-cave-ins-while-the-link-is-bad', async () => {
    R.build({}); R.slope(); const s = R.sp0;
    const K = islandKit(ctx), tally = K.tally();
    R.bw = 60 * KB; R.open('host');
    try {
      R.run(1, () => R.power()); tally.mark();
      R.run(14, (n) => { if (n % 20 === 0) { g.slide.triggerPatch(s.i + 20 + (n / 20 % 8 | 0) * 6, s.k + 4, 3.2, 6); g.slide.trigger(s.i + 24, 14, s.k + 6, 3); } R.moveGuest(n); if (n === 200) w().stabQueue.push({ i: s.i + 30, j: 8, k: s.k + 4 }); });
      R.bw = Infinity; R.run(30, () => R.power());
      rec('conserve', { removed: tally.removed(), added: tally.added(), loose: sim().n, net: tally.net() });
      return (tally.removed() > 200 && tally.net() === 0) || `removed ${tally.removed()}, added ${tally.added()}, ${sim().n} loose: ${tally.net()} plush lost or made`;
    } finally { tally.stop(); R.close(); R.bw = Infinity; clearBodies(); await ctx.newWorld(); }   // (the last test of the lag files leaves a clean world for whatever runs next)
  });
}
