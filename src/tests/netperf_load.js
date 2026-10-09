// netperf.load.*: what the host sends per simulated second in each stress scenario, against budgets (see netperf_lib.js for how the load is made).
// Numbers are bytes of JSON written to the data channel. Run: `await __selftest('netperf.load.')`; the numbers are in window.__netperf afterwards.
import { makeRig } from './netperf_lib.js';

export const BUDGET = { steadyKBs: 60, burstKBs: 250, peakSecKB: 300, maxMsgKB: 64, tickP95: 6 };

export default async function (ctx) {
  const { T, g, w } = ctx;
  const R = makeRig(ctx);
  const stressEach = (n) => { R.power(); if (n % 60 === 0) R.refill(); R.digStep(n); R.throwStep(n); R.rigsStep(n, 50); R.avalanche(n); R.portalStep(n, 3); R.moveGuest(n); if (n === 240) { const s = R.sp0; R.fill(s.i + 4, 1, s.k - 20, 30, 25, 30); } if (n === 300) { const s = R.sp0; R.caveIn(s.i + 4, 1, s.k - 20, 30, 25, 30); } };
  const check = (rec, o) => {
    const s = rec.sum, bad = [];
    if (s.kbs > o.kbs) bad.push(`${s.kbs.toFixed(1)} KB/s over the ${o.kbs} KB/s budget`);
    if (s.peakSecKB > (o.peak ?? BUDGET.peakSecKB)) bad.push(`busiest second ${s.peakSecKB.toFixed(0)} KB`);
    if (s.max.bytes > BUDGET.maxMsgKB * 1024) bad.push(`a ${s.max.type} message of ${(s.max.bytes / 1024).toFixed(1)} KB`);
    if (rec.tick.p95 > BUDGET.tickP95) bad.push(`host net tick p95 ${rec.tick.p95.toFixed(1)} ms`);
    const q = rec.queues; if (q.netOut > 5 * 60000 || q.creakOut > 200 || q.flQ > 48 || q.fliers > 320 || q.stab > 50000 || rec.sim > 2600) bad.push('a queue grew: ' + JSON.stringify(q) + ' bodies ' + rec.sim);
    for (const [t, kb] of Object.entries(o.types || {})) { const b = s.by[t]; const v = b ? b.bytes / s.dur / 1024 : 0; if (v > kb) bad.push(`${t} ${v.toFixed(1)} KB/s over ${kb}`); }
    return bad.length === 0 || (rec.line + ' | ' + bad.join('; '));
  };
  const S = (name, o, lim) => T('netperf.load.' + name, async () => check(R.scenario(name, o), lim));
  await S('steady-both-digging-and-throwing', { setup: (R) => R.slope(), each: (n) => { R.digStep(n); R.throwStep(n); R.moveGuest(n); }, warm: 1, secs: 8 }, { kbs: BUDGET.steadyKBs, types: { bodies: 55 } });
  await S('machines60-bots20-belts-and-rigs-running', { setup: (R) => { R.slope(); R.machines(60); R.bots(20); }, each: (n) => { R.power(); if (n % 60 === 0) R.refill(); R.moveGuest(n); }, warm: 1, secs: 8 }, { kbs: BUDGET.steadyKBs, types: { dyn: 40 } });
  await S('rigs50-throwing-flights', { setup: (R) => R.slope(), each: (n) => { R.rigsStep(n, 50); R.moveGuest(n); }, warm: 1, secs: 6 }, { kbs: BUDGET.steadyKBs, types: { fl: 24 } });
  await S('avalanche', { setup: (R) => R.slope(), each: (n) => { R.avalanche(n); R.digStep(n); R.moveGuest(n); }, warm: 1, secs: 8 }, { kbs: 120, types: { bodies: 90 } });
  await S('portal-bore-cells', { setup: (R) => R.slope(), each: (n) => { R.portalStep(n, 3); R.moveGuest(n); }, warm: 1, secs: 6 }, { kbs: BUDGET.steadyKBs });
  await S('cave-in-22k-cells', { setup: (R) => R.slope(), each: (n) => { if (n === 120) { const s = R.sp0; R.fill(s.i + 4, 1, s.k - 20, 30, 25, 30); } if (n === 180) { const s = R.sp0; R.caveIn(s.i + 4, 1, s.k - 20, 30, 25, 30); } R.moveGuest(n); }, warm: 1, secs: 8 }, { kbs: 120, peak: BUDGET.burstKBs, types: { cells: 130 } });
  await S('stress-all-at-once', { setup: (R) => { R.slope(); R.machines(60); R.bots(20); }, each: stressEach, warm: 1, secs: 10 }, { kbs: BUDGET.burstKBs, peak: BUDGET.peakSecKB, types: { bodies: 90, cells: 140, fl: 24 } });
  // the island collapse (island.js hands a slab to the sim a batch at a time): the roof check, the bodies and the cell edits it makes
  await T('netperf.load.island-collapse', async () => {
    const rec = R.scenario('island-collapse', { build: { island: true }, setup: (R) => { const A = R.arena, K = R.K; const a = { i: A.i0 + 10, j: 4, k: A.k0 + 10 }; K.block(a.i, a.j, a.k, 10, 3, 10); K.stand(A.i0 + 2, A.k0 + 2); R.sp0 = { i: A.i0 + 2, k: A.k0 + 2 }; R.isl = a; }, each: (n) => { R.power(); if (n === 30) w().stabQueue.push({ i: R.isl.i + 2, j: 4, k: R.isl.k + 2 }); R.moveGuest(n); }, warm: 0.5, secs: 14 });
    const slab = (g.S.stats.islandFalls || 0); void slab;
    return check(rec, { kbs: BUDGET.steadyKBs, peak: BUDGET.burstKBs });
  });
}
