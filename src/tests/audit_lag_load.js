// audit_lag_load.js: the host's net tick and the wire under loads bigger than netperf.load.* uses (a huge factory, a guest that digs a lot), measured in simulated seconds.
// Numbers go to window.__lagperf. Run: `await __selftest('lag.load.')`
import { makeRig, DT } from './netperf_lib.js';
import { makeBeltKit, UP_ALL } from './belts_lib.js';
import * as NG from '../netgame.js';
import { compactCells } from '../netperf.js';

export default async function (ctx) {
  const { T, g, w } = ctx;
  const R = makeRig(ctx);
  const KB = 1024;
  const rec = (k, v) => { (window.__lagperf = window.__lagperf || {})[k] = v; };

  await T('lag.load.a-huge-factory-keeps-the-wire-and-the-host-tick-small', async () => {
    const r = R.scenario('huge', { setup: (R) => { R.slope(); const m = R.machines(1200); rec('hugeBuilt', m); R.bots(40); }, each: (n) => { R.power(); if (n % 60 === 0) R.refill(); R.moveGuest(n); }, warm: 1, secs: 8 });
    rec('huge', { line: r.line, top: r.top, tick: r.tick, frame: r.frame, queues: r.queues });
    const bad = [];
    if (r.sum.kbs > 120) bad.push(`${r.sum.kbs.toFixed(0)} KB/s`);
    if (r.tick.p95 > 6) bad.push(`net tick p95 ${r.tick.p95.toFixed(1)} ms`);
    if (r.sum.max.bytes > 64 * KB) bad.push(`a ${r.sum.max.type} of ${(r.sum.max.bytes / KB).toFixed(0)} KB`);
    return bad.length === 0 || bad.join('; ') + ' | ' + r.line + ' | ' + r.top;
  });
  // a big collapse: 80,000 cells let go in one frame (an island, a mine). The cell queue is long for many seconds: what a frame costs must not grow with the length of the queue.
  await T('lag.load.a-long-cell-queue-costs-the-same-per-frame-as-a-short-one', async () => {
    R.build({}); R.slope(); R.open('host');
    try {
      const s = R.sp0;
      const queue = (N) => { for (let q = 0; q < N; q++) g.netOut.push(s.i + (q % 80), 1 + ((q / 80 | 0) % 20), s.k - 40 + ((q / 1600 | 0) % 50), 0, 0); };   // N different cells, as w.setCell would queue them
      const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      const phase = (N) => { g.netOut.length = 0; g.net.pipe.reset(); queue(N); const i0 = R.netMs.length; for (let f = 0; f < 90; f++) { if (g.netOut.length < N * 4) queue(0); R.frame(); } const ms = R.netMs.slice(i0); return { avg: avg(ms), max: Math.max(...ms), left: g.netOut.length / 5 }; };
      const a = phase(12000), c0 = compactCells.calls | 0, b = phase(80000), looks = (compactCells.calls | 0) - c0;
      rec('longQueue', { short: a, long: b, looks });
      if (looks > 4) return `the queue of 80000 cells was looked through ${looks} times in 1.5 s (once when it has doubled is enough)`;
      return b.avg < 3 * a.avg + 1.5 || `a net tick takes ${b.avg.toFixed(2)} ms (max ${b.max.toFixed(0)}) with 80000 cells queued and ${a.avg.toFixed(2)} ms with 12000`;
    } finally { R.close(); }
  });
  // a factory of 8,000 belts with plush on them inside the 75 m the rows cover: every message must stay under what a data channel carries (256 KB is the least a browser agrees to: a longer send throws and the row is lost for good; half of that is the limit here)
  await T('lag.load.a-factory-of-eight-thousand-belts-sends-no-message-a-data-channel-could-refuse', async () => {
    ctx.fresh(UP_ALL); const K = makeBeltKit(ctx); K.cleanup && K.cleanup();
    const i0 = ctx.toI(-14), k0 = ctx.toK(-30), lines = [];
    for (let ln = 0; ln < 80; ln++) lines.push(K.lay(0, 100, i0, k0 + ln, 0));
    for (const line of lines) K.dense(line);
    for (const t of ctx.tiles()) t.pw = 1;
    const sent = []; const prev = g.netSend;
    g.net.open = true; g.net.role = 'host'; g.remote = { pos: { x: ctx.cellX(i0 + 50), y: 0, z: ctx.cellZ(k0 + 40) }, update() {} }; ctx.p().pos.set(ctx.cellX(i0 + 50), 0, ctx.cellZ(k0 + 40));
    g.netSend = (m) => { sent.push({ t: m.t, n: JSON.stringify(m).length }); };
    try {
      g._bpwKey = undefined; g.sendDyn();
      const big = sent.reduce((a, m) => (m.n > a.n ? m : a), { n: 0, t: '' }), total = sent.reduce((a, m) => a + m.n, 0);
      rec('eightK', { messages: sent.length, biggest: big, totalKB: +(total / KB).toFixed(0), belts: ctx.tiles().filter((t) => t.type === 'belt').length });
      return big.n <= 128 * KB || `a ${big.t} message of ${(big.n / KB).toFixed(0)} KB (${sent.length} messages, ${(total / KB).toFixed(0)} KB in all)`;
    } finally { if (prev) g.netSend = prev; else delete g.netSend; g.net.open = false; g.net.role = null; g.remote = null; }
  });
  // the long queue is still compacted (repeated edits of one cell merge, the last value wins), now that it is looked through only when it has doubled
  await T('lag.load.a-long-queue-of-repeated-edits-is-merged-and-the-last-value-wins', async () => {
    R.build({}); R.slope(); R.open('host', { keepRaw: true }); g._cmpAt = 0;
    try {
      const s = R.sp0, D = 12000, E = 60000, want = new Map();
      for (let q = 0; q < E; q++) { const c = q % D, i = s.i + (c % 80), j = 1 + (((c / 80) | 0) % 20), k = s.k - 40 + ((c / 1600) | 0), sp = q < E - D ? 3 : 0; g.netOut.push(i, j, k, sp, 0); want.set(i + ',' + j + ',' + k, sp); }   // each of 12,000 cells edited five times: solid, solid, solid, solid, then dug
      R.run(12, () => {});
      const got = new Map(); let sentCells = 0;
      for (const m of R.log) if (m.type === 'cells') { const a = JSON.parse(m.raw).a; for (let q = 0; q + 4 < a.length; q += 5) { got.set(a[q] + ',' + a[q + 1] + ',' + a[q + 2], a[q + 3]); sentCells++; } }
      let wrong = 0; for (const [key, v] of want) if (got.get(key) !== v) wrong++;
      rec('mergedQueue', { queued: E, distinct: D, sent: sentCells, wrong, left: g.netOut.length / 5 });
      if (wrong) return `${wrong} cells ended with another value than the last edit`;
      return sentCells < E * 0.5 || `${sentCells} cell edits sent for ${D} cells (${E} edits queued): repeated edits were not merged`;
    } finally { R.close(); }
  });
}
