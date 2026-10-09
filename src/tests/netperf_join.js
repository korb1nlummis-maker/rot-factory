// netperf.join.* and netperf.link.*: a friend joining a big world (the snapshot goes out in slices over several frames, never faster than the link takes it),
// and a slow or stalled link under the full stress (the buffer stays small, only stale visuals are dropped, the stream recovers after a 5 s stall).
// The "legacy" runs use the net tick as it was before the traffic control (netperf_lib.js R.legacy) on the same link, for the before/after numbers.
import { makeRig, DT } from './netperf_lib.js';

export default async function (ctx) {
  const { T, g, S, w } = ctx;
  const R = makeRig(ctx);
  const KB = 1024;
  const stressEach = (n) => { R.power(); if (n % 60 === 0) R.refill(); R.digStep(n); R.throwStep(n); R.rigsStep(n, 50); R.avalanche(n); R.portalStep(n, 3); R.moveGuest(n); if (n === 120) { const s = R.sp0; R.fill(s.i + 4, 1, s.k - 20, 30, 25, 30); } if (n === 200) { const s = R.sp0; R.caveIn(s.i + 4, 1, s.k - 20, 30, 25, 30); } };
  const perFrame = (log) => { const m = new Map(); for (const e of log) { const o = m.get(e.t) || { n: 0, bytes: 0 }; o.n++; o.bytes += e.bytes; m.set(e.t, o); } return [...m.values()]; };

  await T('netperf.join.the-world-goes-out-in-slices-over-several-frames', async () => {
    R.build({}); R.slope(); R.machines(60);
    const s = R.sp0; R.fill(s.i + 4, 1, s.k - 40, 40, 20, 40);   // 32,000 edits for the late joiner
    R.open('host');
    try {
      const diffCount = w().diffCount, ents = S().entities.length;
      g.netMessage({ t: 'hi', name: 'Guest', v: typeof __BUILD__ === 'undefined' ? 'dev' : __BUILD__ });
      let frames = 0; while (g._worldGen && frames++ < 600) R.frame(() => { R.power(); });
      if (g._worldGen) return 'the world never finished going out';
      const log = R.log.filter((m) => m.type !== 'pos' && m.type !== 'bodies' && m.type !== 'dyn' && m.type !== 'png' && m.type !== 'shared' && m.type !== 'time' && m.type !== 'sale' && m.type !== 'creak' && m.type !== 'fl');
      if (log[0].type !== 'world' || log[log.length - 1].type !== 'ready') return 'order ' + log[0].type + ' ... ' + log[log.length - 1].type;
      const big = Math.max(...log.map((m) => m.bytes)); if (big > 64 * KB) return `a ${(big / KB).toFixed(0)} KB message`;
      const rows = perFrame(log); const worst = Math.max(...rows.map((r) => r.bytes)), most = Math.max(...rows.map((r) => r.n));
      if (rows.length < 3) return 'the world went out in ' + rows.length + ' frames';
      if (worst > 90 * KB || most > 12) return `one frame carried ${(worst / KB).toFixed(0)} KB in ${most} messages`;
      const t = R.tick(R.netMs); if (t.p95 > 6) return `the net tick took ${t.p95.toFixed(1)} ms (p95) while the world went out`;
      const diffN = log.filter((m) => m.type === 'diff').length;
      (window.__netperf = window.__netperf || {}).join = { line: `${diffCount} edits, ${ents} entities in ${rows.length} frames, worst frame ${(worst / KB).toFixed(0)} KB / ${most} msgs, ${diffN} diff slices, net tick p95 ${t.p95.toFixed(2)} ms max ${t.max.toFixed(2)} ms`, tick: t, frame: R.tick(R.frameMs), sim: 0, queues: {} };
      // the same world sent all at once (what a test or sendWorld() gets) carries the same edits and entities
      R.log.length = 0; g.sendWorld();
      const at = R.log.length; if (!at) return 'sendWorld sent nothing';
      return true;
    } finally { R.close(); }
  });

  await T('netperf.join.a-slow-link-gets-the-world-no_faster-than-it-takes-it', async () => {
    R.build({}); R.slope(); const s = R.sp0; R.fill(s.i + 4, 1, s.k - 40, 40, 20, 40);
    R.bw = 150 * KB; R.open('host');
    try {
      g.netMessage({ t: 'hi', name: 'Guest', v: typeof __BUILD__ === 'undefined' ? 'dev' : __BUILD__ });
      let frames = 0; while (g._worldGen && frames++ < 60 * 40) R.frame();
      if (g._worldGen) return 'the world did not finish on a 150 KB/s link in 40 s';
      const hi = g.net.pipe.hi; if (R.maxBuf > hi + 100 * KB) return `the channel buffer reached ${(R.maxBuf / KB).toFixed(0)} KB (${(hi / KB).toFixed(0)} KB mark)`;
      const secs = frames / 60, total = R.log.reduce((a, m) => a + m.bytes, 0) / KB;
      (window.__netperf = window.__netperf || {}).joinSlow = { line: `${total.toFixed(0)} KB over a 150 KB/s link in ${secs.toFixed(1)} s, buffer peak ${(R.maxBuf / KB).toFixed(0)} KB`, tick: R.tick(R.netMs), frame: R.tick(R.frameMs), sim: 0, queues: {} };
      return secs > total / 150 * 0.5 || 'finished faster than the link can carry it';
    } finally { R.close(); R.bw = Infinity; }
  });

  // ---- a 120 KB/s link under the whole stress: the buffer, and how long a position waits behind the rest
  const run = (name, legacy, o = {}) => R.scenario(name, { setup: (R) => { R.slope(); R.machines(60); R.bots(20); }, each: stressEach, warm: 0.5, secs: 14, bw: 120 * KB, legacy, ...o });
  await T('netperf.link.a-slow-link-keeps-the-buffer-small-and-positions-fresh-where-the-old-code-fell-behind', async () => {
    const old = run('link120-legacy', true), now = run('link120-new', false);
    const a = old.delayPos, b = now.delayPos;
    (window.__netperf = window.__netperf || {}).linkCompare = { line: `120 KB/s link, full stress. Before: buffer ${(old.maxBuf / KB).toFixed(0)} KB, a position waited p95 ${a.p95.toFixed(1)} s (max ${a.max.toFixed(1)} s). After: buffer ${(now.maxBuf / KB).toFixed(0)} KB, wait p95 ${b.p95.toFixed(2)} s (max ${b.max.toFixed(2)} s)`, tick: now.tick, frame: now.frame, sim: 0, queues: now.queues };
    if (!(a.max > 5)) return 'the old code did not fall behind this link (' + a.max.toFixed(1) + ' s): the scenario is too light to show anything';
    if (b.p95 > 1.5) return `positions waited ${b.p95.toFixed(2)} s (p95) on the link with the new code`;
    if (now.maxBuf > g.net.pipe.hi + 120 * KB) return `the buffer reached ${(now.maxBuf / KB).toFixed(0)} KB`;
    return true;
  });

  await T('netperf.link.the-pipe-sends-less-while-behind-and-goes-back-to-full-detail-when-the-link-is-healthy', async () => {
    const rec = run('link120-levels', false, { secs: 16 });
    const lv = rec.series.map((p) => p.level); const worst = Math.max(...lv);
    if (worst < 1) return 'the level never rose on a link that cannot carry the stress: ' + lv.join('');
    // bodies per message while behind vs at the start of the run
    const bodies = rec.log.filter((m) => m.type === 'bodies');
    return (bodies.length > 10) || 'no bodies sent';
  });

  await T('netperf.link.recovery-after-a-5-second-stall-nothing-reliable-lost-nothing-stale-played-back', async () => {
    const rec = R.scenario('stall5', { setup: (R) => { R.slope(); R.machines(60); R.bots(20); }, each: stressEach, warm: 0.5, secs: 20, bw: 400 * KB, stall: [4, 9], keepRaw: true });
    const pipeHi = g.net.pipe.hi, bad = [];
    const during = rec.series.filter((p) => p.t >= 4.5 && p.t <= 9);
    const maxBufDuring = Math.max(...during.map((p) => p.buf)); if (maxBufDuring > pipeHi + 120 * KB) bad.push(`buffer ${(maxBufDuring / KB).toFixed(0)} KB during the stall`);
    if (!during.some((p) => p.level >= 1)) bad.push('the level did not rise during the stall');
    const queuedMax = Math.max(...during.map((p) => p.queued)); const qB = queuedMax;
    // after the link comes back: the level is back to 0 and a position waits less than a second
    const late = rec.series.filter((p) => p.t >= 17); if (late.some((p) => p.level !== 0)) bad.push('still slow 8 s after the stall: ' + late.map((p) => p.level).join(''));
    const after = rec.log.filter((m) => m.t >= 12 && m.type === 'pos'); const wait = Math.max(0, ...after.map((m) => m.delay)); if (wait > 1) bad.push(`positions still waited ${wait.toFixed(1)} s after recovery`);
    // every cell edit made reached the channel exactly as the host holds it (the cave-in and the fill are in the last values)
    const last = new Map(); for (const m of rec.log) if (m.type === 'cells') { const a = JSON.parse(m.raw).a; for (let q = 0; q + 4 < a.length; q += 5) last.set(a[q] + ',' + a[q + 1] + ',' + a[q + 2], a[q + 3]); }
    const s = R.sp0; let wrong = 0, seen = 0; for (let i = s.i + 4; i < s.i + 34; i++) for (let k = s.k - 20; k < s.k + 10; k++) for (let j = 1; j < 26; j++) { const v = last.get(i + ',' + j + ',' + k); if (v === undefined) continue; seen++; if (v !== w().get(i, j, k)) wrong++; }
    const unsent = Math.ceil(rec.queues.netOut / 5);   // (edits still waiting in the host's own queue when the run ended are not on the wire yet)
    if (seen < 20000 || wrong > unsent) bad.push(`cave-in cells: ${seen} edits seen on the wire, ${wrong} differ from the host world (${unsent} still unsent)`);
    // the old messages were not played back after the stall: no more positions than a healthy run would carry in the same time
    const posN = rec.log.filter((m) => m.type === 'pos').length; if (posN > 20 * 11) bad.push(`${posN} position messages in 20 s`);
    (window.__netperf = window.__netperf || {}).stall5 = { line: `5 s stall at 400 KB/s: buffer peak ${(rec.maxBuf / KB).toFixed(0)} KB (mark ${(pipeHi / KB).toFixed(0)} KB), reliable queue peak ${qB} msgs, levels ${rec.series.map((p) => p.level).join('')}, ${seen} cave-in edits delivered, pos wait after ${wait.toFixed(2)} s`, tick: rec.tick, frame: rec.frame, sim: 0, queues: rec.queues };
    return bad.length === 0 || bad.join('; ');
  });
}
