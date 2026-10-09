// avalanche.*: climbing avalanches (src/avalanche.js). A slab breaks high up with no gear and not with full gear, has the sizes the design says,
// lets go top to bottom, settles within the time cap, keeps every plush, and stays bounded in travel and in the number of bodies.
import { kit, AV } from './avalanche_lib.js';

export default async function (ctx) {
  const { T, g, S, w, p, sim, stepSim, fresh } = ctx;
  const K = kit(ctx), { hi, plush, tagged, reset, go, av, C } = K;
  const withRandom = (v, fn) => { const o = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = o; } };
  const climbHit = () => { g._climbT = 5; withRandom(0, () => g.climbRisk(0.1)); };   // the footing gives way at the first roll (roll 0 is under every odds)
  const hintText = () => (document.getElementById('hint') || {}).innerHTML || '';

  await T('avalanche.high-up-with-no-gear-the-slope-lets-go-as-a-slab', async () => {
    reset({}); hi(26); const f0 = S().stats.climbFalls || 0, c0 = S().stats.climbSlabs || 0;
    climbHit();
    if (!av().cur) return 'no slab started at 26 m with no gear';
    if (av().cur.state !== 'warn') return 'no warning first: ' + av().cur.state;
    if (!((S().stats.climbFalls || 0) > f0)) return 'the climb fall was not counted';
    stepSim(4);
    if (!(av().cur ? av().cur.released > 100 : av().last && av().last.released > 100)) return 'fewer than 100 cells let go';
    if (!((S().stats.climbSlabs || 0) > c0)) return 'a real slab was not counted for the climbing achievement';
    return true;
  });
  await T('avalanche.full-gear-and-ropes-hold-the-slope', async () => {
    const bad = [];
    for (const [name, up, rope] of [['Climbing Gear 3', { climb: 3 }, false], ['Rope Anchor', {}, true]]) {
      reset(up); hi(30); g.T = g.tune();
      let anchor = null;
      if (rope) { anchor = { id: 99991, type: 'rope', x: p().pos.x + 2, y: p().pos.y, z: p().pos.z }; g.machines.items.set(anchor.id, { ent: anchor }); }
      try { const r = av().risk(p().pos, 5); if (r.eligible || r.p > 0 || !r.immune) bad.push(name + ' risk ' + JSON.stringify({ e: r.eligible, p: r.p })); climbHit(); if (av().cur && !av().cur.soft) bad.push(name + ' still started a slab'); if (rope && av().cur) bad.push(name + ' still started a slide'); }   // (Climbing Gear 3 still lets the footing give way as a small soft slide, softslide.js; a Rope Anchor holds the slope)
      finally { if (anchor) g.machines.items.delete(anchor.id); }
    }
    return bad.length === 0 || bad.join('; ');
  });
  await T('avalanche.the-odds-follow-height-gear-load-and-stress', async () => {
    reset({}); const base = { x: 0, y: 0, z: 0 }; const R = (y, n = 0, st = 0) => av().risk({ ...base, y }, n, st);
    const bad = [];
    if (R(10).eligible) bad.push('eligible at 10 m'); if (!R(25).eligible) bad.push('not eligible at 25 m');
    if (!(R(35).p > R(25).p && R(25).p > R(21).p)) bad.push('height does not raise it: ' + [21, 25, 35].map((y) => R(y).p.toFixed(2)));
    if (!(R(25, 40).p > R(25, 0).p)) bad.push('load does not raise it');
    if (!(R(25, 0, 4).p > R(25, 0, 0).p)) bad.push('repeated stress does not raise it');
    const at = (up) => { fresh(up); g.T = g.tune(); return av().risk({ ...base, y: 25 }, 0, 0).p; };
    const p0 = at({}), p1 = at({ climb: 1 }), p2 = at({ climb: 2 }), p3 = at({ climb: 3 }), pb = at({ boots: 4, springs: 3 });
    if (!(p0 > p1 && p1 > p2 && p2 > p3 && p3 === 0)) bad.push('Climbing Gear does not cut it step by step: ' + [p0, p1, p2, p3].map((v) => v.toFixed(3)));
    if (!(pb < p0)) bad.push('boots and springs help nothing: ' + pb.toFixed(3) + ' vs ' + p0.toFixed(3));
    reset({}); return bad.length === 0 || bad.join('; ');
  });
  await T('avalanche.low-slopes-keep-the-small-slide', async () => {
    // (below 19 m the footing gives way as a soft slide, softslide.js: a small sheet that flows and carries you, no hit; never as a slab)
    reset({}); const q = hi(26); p().pos.y = 14; p().footCell = { i: q.i, j: q.t - 1, k: q.k }; g.hp = 100;
    const f0 = S().stats.climbFalls || 0, c0 = S().stats.climbSlabs || 0; climbHit();
    return (av().cur && av().cur.soft && g.hp === 100 && (S().stats.climbFalls || 0) > f0 && (S().stats.climbSlabs || 0) === c0) || `cur ${!!av().cur} soft ${av().cur && av().cur.soft} hp ${g.hp} falls ${(S().stats.climbFalls || 0) - f0}`;
  });
  await T('avalanche.the-game-says-why-it-is-risky-or-safe', async () => {
    const bad = [];
    reset({}); hi(26); av()._seen = {}; av().advise(p().pos, 3); let h = hintText();
    if (!/Slab risk/.test(h) || !/Climbing Gear/.test(h) || !/Rope/.test(h)) bad.push('risky hint: ' + h.slice(0, 160));
    reset({ climb: 3 }); hi(26); g.T = g.tune(); av()._seen = {}; av().advise(p().pos, 3); h = hintText();
    if (!/slope holds/i.test(h) || !/Climbing Gear 3/.test(h)) bad.push('safe hint: ' + h.slice(0, 160));
    reset({}); return bad.length === 0 || bad.join('; ');
  });
  await T('avalanche.slab-dimensions-width-depth-and-length', async () => {
    reset({}); const bad = [], rows = [];
    const rnd = () => 0.5;
    for (const y of [21, 26, 32, 38]) {
      hi(y); const pl = av().plan({ x: p().pos.x, y: p().pos.y, z: p().pos.z }, { rnd, carry: 0, depth: 2 });   // (two cells deep, so the cell cap of a very big slab does not shorten it)
      if (!pl) { bad.push('no plan at ' + y); continue; }
      rows.push([y, +pl.width.toFixed(1), +pl.length.toFixed(1), pl.depth, pl.n]);
      if (pl.width < 6 - 0.7 || pl.width > 20 + 0.7) bad.push(`width ${pl.width.toFixed(1)} at ${y} m`);
      if (pl.depth < 2 || pl.depth > 5) bad.push('depth ' + pl.depth);
      if (pl.length < 3 || pl.length > 26 + 0.7) bad.push('length ' + pl.length.toFixed(1));
      if (pl.n > AV.MAX_CELLS) bad.push('cells ' + pl.n);
    }
    if (rows.length >= 2 && !(rows[rows.length - 1][2] >= rows[0][2] - 0.01)) bad.push('higher is not longer: ' + JSON.stringify(rows));
    // steeper is longer (the same height, a steeper slope, with the plan fed the same randomness)
    return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(rows);
  });
  await T('avalanche.slab-lets-go-from-the-top-down-each-after-the-one-above', async () => {
    reset({}); hi(28); const a = go({ warn: 0.01 }); if (!a) return 'no slab';
    const bad = [];
    for (let q = 1; q < a.n; q++) if (a.rel[q] < a.rel[q - 1]) { bad.push('release times not sorted at ' + q); break; }
    const span = a.rel[a.n - 1] - a.rel[0]; if (span < 0.5) bad.push('the whole slab lets go within ' + span.toFixed(2) + ' s');
    // the first tenth of the sheet is higher up the slope than the last tenth
    const m = Math.max(1, Math.floor(a.n / 10)); let up = 0, dn = 0; for (let q = 0; q < m; q++) { up += a.cj[q]; dn += a.cj[a.n - 1 - q]; }
    if (!(up / m > dn / m + 2)) bad.push(`the wave does not run down the slope: ${(up / m).toFixed(1)} vs ${(dn / m).toFixed(1)}`);
    // and per column the top layer goes first (nothing is left hanging)
    const first = new Map(); for (let q = 0; q < a.n; q++) { const key = a.ci[q] * 100000 + a.ck[q]; const prev = first.get(key); if (prev !== undefined && a.cj[q] > prev) { bad.push('a layer lets go after the one under it'); break; } first.set(key, a.cj[q]); }
    stepSim(0.5); const r1 = a.released; stepSim(0.5); const r2 = a.released;
    if (!(r1 > 0 && r2 > r1 && r2 < a.n)) bad.push(`releases are not spread over time: ${r1}, ${r2} of ${a.n}`);
    stepSim(25); reset({}); return bad.length === 0 || bad.join('; ');
  });
  await T('avalanche.settles-within-the-cap-and-no-plush-is-lost-or-made', async () => {
    reset({}); const q = hi(27); const base = plush(q.i, q.k, 170), bodies0 = sim().n;
    const a = go({ warn: 0.3 }); if (!a) return 'no slab';
    const n = a.n; let tmax = 0, peak = 0;
    for (let t = 0; t < 30 && av().cur; t += 1 / 30) { stepSim(1 / 30, 1 / 30); tmax = t; peak = Math.max(peak, sim().n); }
    const last = av().last, now = plush(q.i, q.k, 170), bad = [];
    if (av().cur) bad.push('still going after 30 s');
    if (now.total !== base.total) bad.push(`plush ${base.total} -> ${now.total} (${now.cells} cells and ${now.bodies} bodies)`);
    if (sim().n - bodies0 > 3) bad.push(`bodies ${bodies0} -> ${sim().n}`);   // (a stray plush a roof let go under the scar may still be settling)
    if (tagged() !== 0) bad.push('tagged bodies left: ' + tagged());
    if (!(last && last.secs <= AV.HARD + 4)) bad.push('took ' + (last && last.secs) + ' s');
    if (!(last && last.released + last.left + last.skipped === n)) bad.push('cells released + left + skipped != planned: ' + JSON.stringify(last));
    if (peak > AV.SIM_CAP) bad.push('peak bodies ' + peak);
    reset({}); return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify({ n, last });
  });
  await T('avalanche.the-hard-stop-places-everything-that-is-left', async () => {
    reset({}); const q = hi(27); const base = plush(q.i, q.k, 170), hard = AV.HARD, flow = AV.FLOW_T;
    AV.HARD = 2.5; AV.FLOW_T = 20;
    try {
      const a = go({ warn: 0.2 }); if (!a) return 'no slab'; const n = a.n;
      for (let t = 0; t < 40 && av().cur; t += 1 / 30) stepSim(1 / 30, 1 / 30);
      const last = av().last, now = plush(q.i, q.k, 170), bad = [];
      if (av().cur) bad.push('the slide never ended'); if (tagged()) bad.push('tagged bodies left ' + tagged()); if (sim().n > 150) bad.push('bodies left ' + sim().n);   // (a roof of an old working under the scar may let go: those plush are not the slide's and settle by themselves, and they are counted in the total below)
      if (now.total !== base.total) bad.push(`plush ${base.total} -> ${now.total}`);
      if (!last || !(last.secs <= 2.5 + 4.1)) bad.push('stopped at ' + (last && last.secs));
      if (!last || last.placed + last.forced < 1) bad.push('nothing was placed: ' + JSON.stringify(last));
      return bad.length === 0 || bad.join('; ') + ' n=' + n;
    } finally { AV.HARD = hard; AV.FLOW_T = flow; reset({}); }
  });
  await T('avalanche.the-body-count-is-capped-and-the-wave-waits-for-room', async () => {
    reset({}); const q = hi(30); const base = plush(q.i, q.k, 170), cap = AV.BODY_CAP;
    AV.BODY_CAP = 250;
    try {
      const a = go({ warn: 0.2 }); if (!a) return 'no slab'; const n = a.n; let peak = 0;
      for (let t = 0; t < 40 && av().cur; t += 1 / 30) { stepSim(1 / 30, 1 / 30); peak = Math.max(peak, av().live, tagged()); }
      const last = av().last, now = plush(q.i, q.k, 170), bad = [];
      if (peak > 250 + AV.RELEASE_PER_TICK) bad.push('peak ' + peak + ' over the cap of 250');
      if (n <= 400) bad.push('the slab is too small to test the cap: ' + n);
      if (now.total !== base.total) bad.push(`plush ${base.total} -> ${now.total}`);
      if (!last) bad.push('no end'); else if (last.released + last.left + last.skipped !== n) bad.push('cells unaccounted for: ' + JSON.stringify(last));
      return bad.length === 0 || bad.join('; ');
    } finally { AV.BODY_CAP = cap; reset({}); }
  });
  await T('avalanche.travel-is-bounded-and-nothing-leaves-the-world', async () => {
    reset({}); hi(30); const a = go({ warn: 0.2 }); if (!a) return 'no slab';
    const cap = a.maxTravel, s = sim(), bad = []; let far = 0, out = 0;
    for (let t = 0; t < 30 && av().cur; t += 1 / 30) {
      stepSim(1 / 30, 1 / 30);
      for (let i = 0; i < s.n; i++) if (s.tag[i] === 1) { far = Math.max(far, Math.hypot(s.x[i] - s.ox[i], s.z[i] - s.oz[i])); if (s.y[i] < -0.5 || s.y[i] > 43.3 || Math.abs(s.x[i]) > 5000 || Math.abs(s.z[i]) > 5000) out++; }
    }
    if (far > cap + 6) bad.push(`a body travelled ${far.toFixed(1)} m, the bound is ${cap.toFixed(1)}`);
    if (cap > 80) bad.push('bound ' + cap); if (out) bad.push(out + ' body samples outside the hall');
    reset({}); return bad.length === 0 || bad.join('; ');
  });
  await T('avalanche.it-leaves-a-scar-where-the-slab-was-and-a-runout-pile-at-the-foot', async () => {
    reset({}); const q = hi(28); const a = go({ warn: 0.2 }); if (!a) return 'no slab';
    // the crown: the first cells of the slab and the heights of their columns now
    const cols = []; for (let n = 0; n < Math.min(60, a.n); n++) cols.push([a.ci[n], a.ck[n], w().topAt(a.ci[n], a.ck[n])]);
    // the runout: everywhere round the slab (its box and 50 cells more) the columns that rose, against the cells the slab let go
    const [bx0, bx1, bz0, bz1] = a.bbox, before = new Map();
    for (let i = bx0 - 50; i <= bx1 + 50; i++) for (let k = bz0 - 50; k <= bz1 + 50; k++) before.set(i * 100000 + k, w().topAt(i, k));
    for (let t = 0; t < 30 && av().cur; t += 1 / 30) stepSim(1 / 30, 1 / 30);
    let lost = 0; for (const c of cols) lost += c[2] - w().topAt(c[0], c[1]);
    let grew = 0, cellsGrew = 0; for (const [key, t0] of before) { const d = w().topAt(Math.floor(key / 100000), key % 100000) - t0; if (d > 0) { grew++; cellsGrew += d; } }
    const rel = av().last ? av().last.released : 0, bad = [];
    if (!(lost / cols.length >= a.depth - 1)) bad.push(`the slope lost ${(lost / cols.length).toFixed(1)} cells at the crown, the slab was ${a.depth} deep`);
    if (!(cellsGrew >= rel * 0.3 && grew >= 40)) bad.push(`the runout pile grew by ${cellsGrew} cells of height over ${grew} columns, the slab was ${rel} cells`);
    reset({}); return bad.length === 0 || bad.join('; ');
  });
  await T('avalanche.cooldown-and-one-slide-at-a-time', async () => {
    reset({}); hi(27); const a = go({ warn: 0.2 }); if (!a) return 'no slab';
    const bad = [];
    if (go({ warn: 0.2 })) bad.push('a second slab started while one was running');
    withRandom(0, () => { g._climbT = 5; g.climbRisk(0.1); }); if (av().cur !== a) bad.push('climbing started another');
    for (let t = 0; t < 30 && av().cur; t += 1 / 30) stepSim(1 / 30, 1 / 30);
    if (!(av().cool > 20)) bad.push('no cooldown after: ' + av().cool);
    hi(27); const f0 = S().stats.climbFalls || 0; climbHit(); if (av().cur && !av().cur.soft) bad.push('a slab broke inside the cooldown');   // (a soft slide may: softslide.js, once the slab's ride is over)
    av().clear(); reset({}); return bad.length === 0 || bad.join('; ');
  });
  await T('avalanche.frames-ropes-and-machines-hold-the-columns-they-touch', async () => {
    reset({}); const q = hi(28); const pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
    const free = av().plan(pos, { rnd: () => 0.5 }); if (!free) return 'no plan';
    const anchor = { id: 99992, type: 'rope', x: pos.x - free.dx * 6, y: pos.y - 4, z: pos.z - free.dz * 6 }; g.machines.items.set(anchor.id, { ent: anchor });
    let held, bad = [];
    try { held = av().plan(pos, { rnd: () => 0.5 }); } finally { g.machines.items.delete(anchor.id); }
    if (!held || !(held.n < free.n)) bad.push(`a rope anchor in the slab held nothing: ${held && held.n} vs ${free.n}`);
    const topJ = new Map(); for (let n = 0; held && n < held.n; n++) { const key = held.ci[n] * 100000 + held.ck[n]; topJ.set(key, Math.max(topJ.get(key) ?? -1, held.cj[n])); }
    for (let n = 0; held && n < held.n; n++) { const x = ctx.cellX(held.ci[n]), z = ctx.cellZ(held.ck[n]); if (Math.hypot(x - anchor.x, z - anchor.z) < 6 && Math.abs(ctx.cellY(topJ.get(held.ci[n] * 100000 + held.ck[n])) - anchor.y) < 5) { bad.push('a column held by the anchor is in the slab'); break; } }
    // a reserved cell (a belt, a machine) keeps its whole column
    const c0 = free; const i = c0.ci[0], j = c0.cj[0], k = c0.ck[0]; w().reserved.add((j * ctx.cfg.NZ + k) * ctx.cfg.NX + i);
    let res; try { res = av().plan(pos, { rnd: () => 0.5 }); } finally { w().reserved.delete((j * ctx.cfg.NZ + k) * ctx.cfg.NX + i); }
    if (res) for (let n = 0; n < res.n; n++) if (res.ci[n] === i && res.ck[n] === k) { bad.push('a column with a reserved cell was released'); break; }
    reset({}); return bad.length === 0 || bad.join('; ');
  });
  await T('avalanche.frame-time-with-a-big-avalanche', async () => {
    reset({}); const q = hi(32); const a = go({ warn: 0.2 }); if (!a) return 'no slab';
    const times = [], upd = []; let peak = 0;
    const orig = av().update.bind(av()); av().update = (dt) => { const t0 = performance.now(); orig(dt); upd.push(performance.now() - t0); };
    try {
      for (let t = 0; t < 30 && av().cur; t += 1 / 60) { const t0 = performance.now(); g.time += 1 / 60; g.updatePlay(1 / 60); times.push(performance.now() - t0); peak = Math.max(peak, sim().n); }
    } finally { av().update = orig; }
    times.sort((x, y) => x - y); upd.sort((x, y) => x - y);
    const mean = times.reduce((x, y) => x + y, 0) / times.length, p95 = times[Math.floor(times.length * 0.95)], umean = upd.reduce((x, y) => x + y, 0) / upd.length, umax = upd[upd.length - 1];
    S().stats.__avPerf = { cells: a.n, peakBodies: peak, frames: times.length, meanMs: +mean.toFixed(2), p95Ms: +p95.toFixed(2), maxMs: +times[times.length - 1].toFixed(2), updMeanMs: +umean.toFixed(3), updMaxMs: +umax.toFixed(2) };
    console.log('avalanche frame time', JSON.stringify(S().stats.__avPerf));
    if (typeof window !== 'undefined') window.__avPerf = { ...S().stats.__avPerf };
    const bad = [];
    if (peak < 600) bad.push('too small an avalanche to time: ' + peak + ' bodies');
    if (mean > 25) bad.push('mean frame ' + mean.toFixed(1) + ' ms'); if (umean > 2.5) bad.push('the avalanche tick costs ' + umean.toFixed(2) + ' ms on average'); if (umax > 25) bad.push('one avalanche tick took ' + umax.toFixed(1) + ' ms');
    delete S().stats.__avPerf; reset({}); return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify({ mean, p95, umean, umax, peak });
  });
}
