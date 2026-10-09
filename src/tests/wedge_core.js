// wedge.*: the slide (src/wedge.js, src/burial.js). It starts at the player's own spot with a short warning and no hit, begins as a few cells at the feet, widens as
// a wedge by entrainment (the cohesion of the pile grows with depth), ends by friction before any cap, keeps every plush, carries the player without hurting them
// and buries them by the pile that lands.
import { wk, WEDGE, BU } from './wedge_lib.js';

export default async function (ctx) {
  const { T: T0, g, S, w, p, sim, fresh } = ctx;
  const K = wk(ctx), { stand, seeded, lcg, play, slide, ride, shape, burial, wd, bu, plush, tagged, reset, logHurts, hi, C, toI, toK } = K;
  const T = async (name, fn) => T0(name, async () => { try { return await fn(); } finally { delete g.climbRisk; reset({}); } });
  const withRandom = (v, fn) => { const o = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = o; } };
  const climbHit = (r = 0) => { g._climbT = 5; withRandom(r, () => g.climbRisk(0.1)); };   // the footing check with a fixed roll (0 is under every odds)
  const hintText = () => (document.getElementById('hint') || {}).innerHTML || '';
  // a spread of starting places and sizes: [height, lane, direction]
  const SPOTS = [[22, 10, 1], [26, 14, -1], [30, 12, 1], [24, 18, 1], [28, 8, -1], [32, 16, 1], [21, 20, -1], [27, 11, 1], [25, 15, -1], [29, 9, 1]];
  const TWO = [[0.65, 0.6, 1.5], [1.3, 0.55, 1.7], [2.5, 0.5, 1.7]];   // the walkable bands of slope (a rise of 1.7 cells per cell of run at the most: a near-vertical face drops the plush straight down and a slide there can stay small: wedge_world.js soaks those)
  const E = { small: 0.1, medium: 0.5, big: 0.9 };
  // a seeded run of a slide of a class from the n-th spot; returns everything the tests want to know
  const run = (cls, n, o = {}) => {
    const [y, lane, dir] = SPOTS[n % SPOTS.length]; const q = stand(y, lane, dir, {}, TWO); const base = plush(q.i, q.k, 170);
    const a = seeded(900 + n * 31 + (cls === 'big' ? 7 : cls === 'medium' ? 3 : 0), () => slide(E[cls] + (n % 3) * 0.02, o));
    if (!a) return { none: true, y, lane, dir };
    const r = seeded(500 + n * 17, () => ride());
    const after = plush(q.i, q.k, 170), last = wd().last;
    return { a, r, last, land: r.land, cls: a.cls, rel: a.released, shape: shape(a), net: after.total - base.total, bury: burial(), q };
  };

  await T('wedge.the-footing-gives-way-with-a-short-warning-and-no-hit-and-a-real-wedge-counts', async () => {
    reset({}); hi(26); const f0 = S().stats.climbFalls || 0, c0 = S().stats.climbSlabs || 0, b0 = S().stats.bigSlides || 0; g.hp = 100;
    climbHit();
    const a = wd().cur; if (!a) return 'no slide started at 26 m with no gear';
    if (a.state !== 'warn') return 'no warning first: ' + a.state;
    if (!(a.warn0 >= 0.4 && a.warn0 <= 0.8)) return 'the warning lasts ' + a.warn0 + ' s (0.4 to 0.8)';
    if (!((S().stats.climbFalls || 0) > f0)) return 'the climb fall was not counted';
    if (g.hp !== 100) return 'hurt by the start: ' + g.hp;
    for (const k of ['crack', 'plan', 'slab', 'width', 'L', 'W', 'ci', 'rel']) if (k in a) return 'the old slab field "' + k + '" is still there';
    if (typeof wd().plan === 'function' || typeof wd().crackLine === 'function') return 'the slab planner or the crack line is still in the code';
    let t = 0, n0 = a.released; while (a.state === 'warn' && t < 2) { g.time += 1 / 60; g.updatePlay(1 / 60); t += 1 / 60; if (a.state === 'warn') n0 = a.released; }
    if (n0 !== 0) return 'cells let go during the warning: ' + n0;
    play(8);
    if (!(((wd().last && wd().last.released) || a.released) >= 40)) return 'fewer than 40 plush let go';
    if (!((S().stats.climbSlabs || 0) > c0) || !((S().stats.bigSlides || 0) > b0)) return 'a real wedge slide was not counted';
    return true;
  });

  await T('wedge.the-warning-is-0.4-s-when-you-move-and-0.8-s-when-you-stand-still-and-it-creaks-and-shifts-the-plush', async () => {
    const bad = [];
    stand(26); const spy = []; const o1 = wd().sfx, o2 = g.fx.dust; wd().sfx = function (k, ...r) { spy.push(k); return o1.call(this, k, ...r); }; g.fx.dust = function (...r) { spy.push('dust'); return o2.apply(this, r); };
    try {
      p().vel.set(2, 0, 0); let a = slide(0.5, { warn: undefined, speed: 2 }); if (!a || a.warn0 !== WEDGE.WARN_MOVE) bad.push('moving: ' + (a && a.warn0)); wd().clear(); play(0.1);
      p().vel.set(0, 0, 0); a = slide(0.5, { warn: undefined, speed: 0 }); if (!a || a.warn0 !== WEDGE.WARN_STILL) bad.push('still: ' + (a && a.warn0));
      play(0.3); if (!spy.includes('creak')) bad.push('no creak'); if (!spy.includes('dust')) bad.push('no dust at the feet');
    } finally { wd().sfx = o1; g.fx.dust = o2; }
    return bad.length === 0 || bad.join('; ');
  });

  await T('wedge.it-starts-as-3-to-12-cells-right-at-the-players-feet-the-top-layer-only', async () => {
    const bad = [], rows = [];
    for (let n = 0; n < 6; n++) {
      const cls = ['small', 'medium', 'big'][n % 3], q = stand(...SPOTS[n].slice(0, 1), SPOTS[n][1], SPOTS[n][2]);
      const a = seeded(70 + n, () => slide(E[cls])); if (!a) { bad.push('no slide ' + n); continue; }
      const feet = { x: p().pos.x, z: p().pos.z }; let t = 0; while (a.state === 'warn' && t < 3) { g.time += 1 / 60; g.updatePlay(1 / 60); t += 1 / 60; }
      const first = a.released, cols = a.cols.slice(0, a.seeds.length);
      rows.push(first);
      if (!(first >= 3 && first <= 12)) bad.push(`${cls}: ${first} cells at the start (3 to 12)`);
      if (!(cols.length >= 1 && cols.length <= 3)) bad.push(`${cls}: ${cols.length} columns at the apex (1 to 3)`);
      if (!cols.some((c) => c[0] === toI(feet.x) && c[1] === toK(feet.z))) bad.push(cls + ': the column under the boots did not go');
      for (const c of cols) { if (Math.hypot(ctx.cellX(c[0]) - feet.x, ctx.cellZ(c[1]) - feet.z) > 1.3) bad.push(cls + ': an apex column is not at the feet'); if (c[4] > 2 && a.seeds.length > 1) bad.push(cls + ': the apex is more than the top layer (' + c[4] + ' cells)'); }
      wd().clear(); bu().clear();
    }
    return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(rows);
  });

  await T('wedge.it-widens-with-distance-inside-the-spread-angle-and-the-bottom-is-much-wider-than-the-apex', async () => {
    const bad = [], rows = [];
    for (const [cls, minRatio, runs] of [['small', 2.5, 3], ['medium', 4, 5], ['big', 6, 5]]) for (let n = 0; n < runs; n++) {
      const x = run(cls, n); if (x.none) { bad.push('no slide ' + cls + n); continue; }
      const { a, shape: sh } = x, th = a.theta;
      rows.push(`${cls}${n}: ${sh.apexW.toFixed(1)} -> ${sh.bottomW.toFixed(1)} m (x${sh.ratio.toFixed(1)}) bins ${sh.bins.map((v) => v.toFixed(0)).join('/')} spread ${th.toFixed(0)}`);
      if (!(th >= 20 && th <= 35)) bad.push(`${cls}${n}: spread angle ${th} outside 20 to 35`);
      if (!(sh.ratio >= minRatio)) bad.push(`${cls}${n}: the bottom is x${sh.ratio.toFixed(1)} the apex (at least ${minRatio})`);
      if (!(sh.bins[1] >= sh.bins[0] && sh.bins[2] >= sh.bins[1] - C && Math.max(sh.bins[2], sh.bins[3]) > 1.3 * sh.bins[0])) bad.push(`${cls}${n}: does not widen down the slope (a cell of slack; the toe can be narrower where the pile is too low to give way): ${sh.bins.map((v) => v.toFixed(1))}`);
      let maxAng = 0; for (const c of a.cols) if (c[2] > 4) { const ang = Math.atan((Math.abs(c[3]) - a.a0) / c[2]) * 180 / Math.PI; if (ang > th + 4) bad.push(`${cls}${n}: a column at ${ang.toFixed(0)} degrees (spread ${th.toFixed(0)})`); maxAng = Math.max(maxAng, ang); }
      if (cls !== 'small' && !(maxAng >= 0.5 * th)) bad.push(`${cls}${n}: the edge only reaches ${maxAng.toFixed(0)} degrees of ${th.toFixed(0)}`);
    }
    window.__wedgeShape = rows;
    return bad.length === 0 || bad.slice(0, 6).join('; ') + ' ' + rows.join(' | ');
  });

  await T('wedge.sizes-come-out-of-the-energy-small-40-to-80-medium-150-to-400-big-450-to-900', async () => {
    const bad = [], rows = [];
    for (const [cls, lo, hi2] of [['small', 40, 80], ['medium', 150, 400], ['big', 450, 900]]) for (let n = 0; n < 5; n++) {
      const x = run(cls, n + 2); if (x.none) { bad.push('no slide ' + cls + n); continue; }
      rows.push(cls[0] + x.rel); if (x.a.cls !== cls) bad.push(`asked for ${cls}, got ${x.a.cls}`);
      if (!(x.rel >= lo && x.rel <= hi2)) bad.push(`${cls}: ${x.rel} plush (${lo} to ${hi2}) E0 ${x.a.E0.toFixed(0)} spent ${x.a.spent.toFixed(0)}`);
      if (x.a.spent > x.a.E0 + 3 * WEDGE.D_MAX) bad.push(`${cls}: spent ${x.a.spent} of an energy of ${x.a.E0}`);
    }
    // the energy follows the height, the steepness and the load (a pure function: size())
    reset({}); const at = (y, tan, carry, e) => wd().size({ x: 0, y, z: 0 }, carry, tan, () => 0.5, e);
    if (!(at(34, 1, 0).E0 > at(14, 1, 0).E0)) bad.push('height does not raise the energy'); if (!(at(24, 1.6, 0).E0 > at(24, 0.4, 0).E0)) bad.push('steepness does not raise the energy'); if (!(at(24, 1, 150).E0 > at(24, 1, 0).E0)) bad.push('load does not raise the energy');
    if (!(at(34, 1.6, 0).theta > at(12, 0.4, 0).theta)) bad.push('a steeper face from higher up does not spread wider');
    if (!(at(24, 1, 150).Lm > 0 && at(34, 1.6, 100).Lm > at(12, 0.5, 0).Lm)) bad.push('the wedge is not longer from higher up on a steeper face');
    window.__wedgeSizes = rows;
    return bad.length === 0 || bad.join('; ') + ' ' + rows.join(',');
  });

  await T('wedge.entrainment-strips-the-loose-surface-and-cannot-dig-deep', async () => {
    const bad = []; let ones = 0, all = 0, maxDeep = 0;
    for (let n = 0; n < 4; n++) {
      const x = run('big', n); if (x.none) { bad.push('no slide'); continue; }
      for (const c of x.a.cols) { all++; if (c[4] === 1) ones++; maxDeep = Math.max(maxDeep, c[4]); }
    }
    if (maxDeep > WEDGE.D_MAX) bad.push('a column was cut ' + maxDeep + ' cells deep (cohesion stops it at ' + WEDGE.D_MAX + ')');
    if (!(ones / Math.max(1, all) > 0.1)) bad.push('almost every column went as deep as the energy allowed (' + ones + ' of ' + all + ' only 1 cell)');
    // the threshold rises with the depth squared: a cell d deep needs THR_BASE + THR_DEPTH d^2 of speed squared
    for (let d = 1; d < WEDGE.D_MAX; d++) if (!(WEDGE.THR_BASE + WEDGE.THR_DEPTH * d * d > WEDGE.THR_BASE + WEDGE.THR_DEPTH * (d - 1) ** 2 * 1.5)) bad.push('the cohesion does not grow with depth');
    return bad.length === 0 || bad.join('; ');
  });

  await T('wedge.the-end-comes-from-friction-and-the-pile-before-any-cap', async () => {
    const bad = [], rows = []; let byFriction = 0, n = 0;
    for (const cls of ['small', 'medium', 'big']) for (let i = 0; i < 7; i++) {
      const x = run(cls, i + 4); if (x.none) continue; n++;
      const l = x.last, early = l.secs <= 0.75 * l.hard, ok = l.how === 'settled' && l.forced === 0 && !l.capped && early;   // (every body came to rest by itself: frozen by the slide's friction rule or settled by the sim's own rest rule; none was placed by a cap)
      if (ok) byFriction++; else rows.push(`${cls}${i}: ${l.how} forced ${l.forced} capped ${l.capped} ${l.secs}s of ${l.hard.toFixed(0)}`);
      if (x.net !== 0) bad.push(`${cls}${i}: plush ${x.net > 0 ? 'made' : 'lost'} ${Math.abs(x.net)}`);
      if (x.a.peakLive > WEDGE.BODY_CAP) bad.push('bodies over the cap: ' + x.a.peakLive);
      if (tagged() || wd().live) bad.push(`${cls}${i}: ${tagged()} tagged, live ${wd().live}`);
    }
    window.__wedgeEnd = { n, byFriction, rows };
    if (!(n >= 18 && byFriction >= Math.ceil(0.9 * n))) bad.push(`only ${byFriction} of ${n} ended by friction with a quarter of the time left: ` + rows.join(' | '));
    return bad.length === 0 || bad.join('; ');
  });

  await T('wedge.the-safety-caps-still-hold-a-hard-stop-a-travel-bound-and-a-body-cap-and-nothing-is-lost', async () => {
    const bad = [];
    for (const [name, size] of [['time', { hard: 1.5 }], ['travel', { travel: 3 }]]) {
      const q = stand(28), base = plush(q.i, q.k, 170);
      const a = seeded(55, () => slide(0.9, { size })); if (!a) { bad.push('no slide ' + name); continue; }
      if (size.travel) a.maxTravel = 3;
      let t = 0; while (wd().cur && t < 30) { g.time += 1 / 60; g.updatePlay(1 / 60); t += 1 / 60; if (sim().n > WEDGE.SIM_CAP + WEDGE.RELEASE_PER_TICK) { bad.push('bodies ' + sim().n); break; } }
      play(3); const l = wd().last;
      if (wd().cur) bad.push(name + ': did not end'); else if (name === 'time' && !(l.secs <= 1.5 + 4.5)) bad.push('the hard stop took ' + l.secs + ' s');
      if (!(l.capped || l.forced > 0)) bad.push(name + ': the safety net was never needed (' + JSON.stringify({ how: l.how, forced: l.forced, capped: l.capped }) + ')');
      const after = plush(q.i, q.k, 170); if (after.total !== base.total) bad.push(`${name}: plush ${after.total - base.total}`); if (tagged()) bad.push(name + ': tagged left');
      reset({});
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('wedge.the-slide-never-hits-the-player-and-the-ride-ends-at-rest', async () => {
    const bad = []; let carrySum = 0, carryN = 0;
    for (const [cls, n] of [['small', 0], ['medium', 1], ['big', 2], ['big', 3]]) {
      const q = stand(SPOTS[n][0], SPOTS[n][1], SPOTS[n][2], {}, TWO); g.hp = 100; const H = logHurts();
      const a = seeded(310 + n, () => slide(E[cls])); if (!a) { H.stop(); bad.push('no slide'); continue; }
      let swept = 0, vmax = 0; const r = seeded(311 + n, () => ride()); H.stop();
      const bad2 = H.log.filter((h) => h.dealt > 0 && h.why !== 'fell too far'); if (bad2.length) bad.push(`${cls}: hurt by ${JSON.stringify(bad2)}`);
      const fall = H.log.filter((h) => h.dealt > 0 && h.why === 'fell too far').reduce((s, h) => s + h.dealt, 0); if (fall > 6) bad.push(`${cls}: a fall cost ${fall}`);
      if (g.dead || g.hp < 90) bad.push(`${cls}: hp ${g.hp}`);
      if (!(r.swept > 0)) bad.push(cls + ': the player was never carried'); if (!(r.carried > 0.5)) bad.push(`${cls}: carried only ${r.carried.toFixed(1)} m`); if (!(r.drop > 0.5)) bad.push(`${cls}: went down ${r.drop.toFixed(1)} m`);
      if (!(r.speed < 1.5)) bad.push(`${cls}: still moving at ${r.speed.toFixed(1)} m/s`); if (p().swept > 0) bad.push(cls + ': still swept');
      void swept; void vmax; if (cls !== 'small') { carrySum += r.carried; carryN++; }
    }
    if (carryN && !(carrySum / carryN >= 3)) bad.push('a medium or big slide carried the player only ' + (carrySum / carryN).toFixed(1) + ' m on average');
    return bad.length === 0 || bad.join('; ');
  });

  await T('wedge.what-lands-on-the-player-buries-them-small-to-the-waist-or-chest-medium-to-the-chest-or-head-big-under-the-pile', async () => {
    const bad = [], rows = {};
    for (const [cls, need, runs] of [['small', 2, 10], ['medium', 3, 10], ['big', 3, 10]]) {
      let ok = 0, full = 0, dsum = 0, n = 0;
      for (let i = 0; i < runs; i++) {
        const x = run(cls, i); if (x.none) continue; n++;
        const lv = x.land ? x.land.lvl : 0, here = burial();
        if (lv >= need) ok++; else (rows.fail = rows.fail || []).push(`${cls}${i}:${JSON.stringify(x.land)} rel ${x.rel}`); if (lv >= 4) full++; dsum += here.depth;
        if (here.lvl > lv || here.lvl < lv - 1) bad.push(`${cls}${i}: the cells say ${here.lvl}, the landing says ${lv}`);   // (a waist deep ring can lift the player half a cell: one level at the most)
        if (cls === 'big' && lv < 4 && !x.land) bad.push(`${cls}${i}: no landing`);
        if (g.dead || g.hp < 50) bad.push(`${cls}${i}: hp ${g.hp}`);
      }
      rows[cls] = { ok, n, full, depth: +(dsum / Math.max(1, n)).toFixed(1) };
      if (!(n >= 8 && ok >= Math.ceil(0.8 * n))) bad.push(`${cls}: only ${ok} of ${n} buried to level ${need} or deeper`);
      if (cls === 'big' && !(full >= Math.ceil(0.5 * n))) bad.push(`big: only ${full} of ${n} fully buried`);
      if (cls !== 'small' && !(dsum / Math.max(1, n) >= 3.2)) bad.push(`${cls}: the mean burial is ${(dsum / n).toFixed(1)} cells (3 to 6 and more)`);
    }
    window.__wedgeBury = rows;
    return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(rows);
  });

  await T('wedge.a-buried-player-keeps-the-normal-air-and-digs-out-and-never-dies-of-the-slide', async () => {
    const bad = [];
    const x = run('big', 1); if (x.none) return 'no slide';
    if (!(x.land && x.land.lvl >= 3)) return 'not buried deep enough to test the dig out: ' + JSON.stringify(x.land);
    play(1.2); const air0 = g.airLeft;
    if (!(g.trapOn || p().buried > 0)) bad.push('the trapped system is not running at depth ' + x.land.lvl);
    if (!(air0 > 40)) bad.push('the air starts at ' + air0 + ' (the normal 60 s)');
    // punch your way out: the cap is dug through from below, a few cells, a few seconds
    let t = 0, tp = 0; const d0 = burial().depth;
    while (burial().lvl >= 3 && t < 60 && !g.dead) { g.time += 1 / 60; g.updatePlay(1 / 60); t += 1 / 60; tp += 1 / 60; if (tp >= 0.34) { tp = 0; g.punchT = 0; g.punch(true, true); } }
    if (burial().lvl >= 3) bad.push('could not dig out of depth ' + d0 + ' in ' + t.toFixed(0) + ' s');
    else if (!(t > 0.3)) bad.push('out at once');
    if (!(g.airLeft === undefined || g.airLeft > 0)) bad.push('out of air');
    if (g.dead) bad.push('died'); if (!(g.hp > 50)) bad.push('hp ' + g.hp);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wedge.gear-lowers-the-chance-and-shortens-the-carry-not-the-burial-and-a-rope-holds-the-slope', async () => {
    const bad = [];
    const hits = (up, rope) => {
      reset(up); g.T = g.tune(); hi(26); let n = 0, anchor = null;
      if (rope) { anchor = { id: 99991, type: 'rope', x: p().pos.x + 2, y: p().pos.y, z: p().pos.z }; g.machines.items.set(anchor.id, { ent: anchor }); }
      try { for (let r = 0; r < 40; r++) { wd().clear(); bu().clear(); wd().cool = 0; climbHit((r + 0.5) / 40); if (wd().cur) n++; } } finally { if (anchor) g.machines.items.delete(anchor.id); wd().clear(); }
      return n;
    };
    const h0 = hits({}), h1 = hits({ climb: 1 }), h2 = hits({ climb: 2 }), h3 = hits({ climb: 3 }), hb = hits({ boots: 4, springs: 3 }), hr = hits({}, true);
    if (!(h0 > h1 && h1 > h2 && h2 > h3)) bad.push(`Climbing Gear does not cut the chance step by step: ${[h0, h1, h2, h3]} of 40`); if (!(hb < h0)) bad.push(`boots and springs help nothing: ${hb} vs ${h0}`); if (hr !== 0) bad.push('a Rope Anchor did not hold the slope: ' + hr);
    // the carry is shorter and the same pile still buries
    reset({}); g.T = g.tune(); const s0 = wd().size({ x: 0, y: 28, z: 0 }, 0, 1, () => 0.5, 0.8); reset({ climb: 3 }); g.T = g.tune(); const s3 = wd().size({ x: 0, y: 28, z: 0 }, 0, 1, () => 0.5, 0.8);
    if (!(s3.travel < s0.travel * 0.8 && s3.carryMul < s0.carryMul)) bad.push(`the carry is not shorter with Climbing Gear 3: ${s3.travel.toFixed(1)} vs ${s0.travel.toFixed(1)} m`);
    if (s3.cls !== s0.cls || s3.E0 !== s0.E0) bad.push('gear changed the energy of a slide that has started (it only changes the odds and the carry)');
    reset({}); return bad.length === 0 || bad.join('; ');
  });

  await T('wedge.the-game-says-why-it-is-risky-or-safe', async () => {
    const bad = [];
    reset({}); hi(26); wd()._seen = {}; wd().advise(p().pos); let h = hintText();
    if (!/Slide risk/.test(h) || !/Climbing Gear/.test(h) || !/Rope/.test(h) || /slab/i.test(h)) bad.push('risky hint: ' + h.slice(0, 160));
    reset({ climb: 3 }); hi(26); g.T = g.tune(); wd()._seen = {}; wd().advise(p().pos); h = hintText();
    if (!/Gear helps/i.test(h) || !/Climbing Gear 3/.test(h)) bad.push('safe hint: ' + h.slice(0, 160));
    return bad.length === 0 || bad.join('; ');
  });

  await T('wedge.low-ground-and-flat-ground-do-not-slide', async () => {
    reset({}); hi(26); p().pos.y = 4; p().footCell = { i: toI(p().pos.x), j: 0, k: toK(p().pos.z) }; g.hp = 100; climbHit(); if (wd().cur) return 'a slide on low ground';
    // a dead flat spot cannot start one
    const q = hi(26); wd().clear(); const f = wd().slope; wd().slope = () => ({ dx: 1, dz: 0, tan: 0.05 }); try { const a = slide(0.5); if (a) return 'a slide started on a flat slope'; } finally { wd().slope = f; }
    return g.hp === 100 || 'hurt';
  });

  await T('wedge.the-slide-costs-little-per-frame-even-when-big', async () => {
    const bad = [], rows = [];
    for (let n = 0; n < 3; n++) {
      const q = stand(...SPOTS[n + 3].slice(0, 1), SPOTS[n + 3][1], SPOTS[n + 3][2]); const a = seeded(88 + n, () => slide(0.95)); if (!a) { bad.push('no slide'); continue; }
      const ms = [], own = []; let t = 0;
      seeded(89 + n, () => { while (wd().cur && t < 30) { const t0 = performance.now(); g.time += 1 / 60; g.updatePlay(1 / 60); ms.push(performance.now() - t0); t += 1 / 60; } });
      play(1);
      ms.sort((x, y) => x - y); const p95 = ms[Math.floor(ms.length * 0.95)], l = wd().last; rows.push(`${a.released} plush: p95 ${p95.toFixed(1)} ms, wedge tick avg ${l.perf.avg.toFixed(2)} max ${l.perf.max.toFixed(1)}`);
      if (!(p95 < 14)) bad.push(`frame p95 ${p95.toFixed(1)} ms with ${a.released} plush`); if (!(l.perf.avg < 2)) bad.push('the wedge tick averages ' + l.perf.avg.toFixed(2) + ' ms'); void own;
      window.__wedgePerf = rows;
    }
    return bad.length === 0 || bad.join('; ') + ' ' + rows.join(' | ');
  });

  await T('wedge.only-a-real-wedge-counts-for-the-rockslide-and-the-slide-achievements-and-the-text-says-slide', async () => {
    const bad = [];
    stand(27); S().stats.bigSlides = 0; S().stats.climbSlabs = 0; g.slide.burstN = 0; g.slide.burstCool = 0;
    const a = slide(0.05, { by: 'climb', size: { E0: 8, nExp: 6 } }); if (!a) return 'no slide';
    play(10);
    if (a.released >= WEDGE.REAL) bad.push('the tiny slide freed ' + a.released + ' (too many for the test)'); else if ((S().stats.climbSlabs || 0) || a.counted) bad.push('a wedge of ' + a.released + ' cells counted for the climbing achievement');
    wd().clear(); stand(27); S().stats.bigSlides = 0; S().stats.climbSlabs = 0; g.slide.burstCool = 0;
    const b = slide(0.5, { by: 'climb' }); if (!b) return bad.concat('no slide').join('; '); play(12);
    if ((S().stats.climbSlabs || 0) !== 1) bad.push('climbSlabs ' + S().stats.climbSlabs); if (!((S().stats.bigSlides || 0) >= 1)) bad.push('bigSlides ' + S().stats.bigSlides);
    const { ACHIEVEMENTS } = await import('../achievements.js'); const ach = (id) => ACHIEVEMENTS.find((x) => x.id === id);
    if (!ach('slab1') || !ach('slab1').check(S())) bad.push('the Sheet Slide achievement is not earned'); if (!ach('slide1').check(S())) bad.push('Rockslide is not earned');
    S().stats.climbSlabs = 0; if (ach('slab1').check(S())) bad.push('Sheet Slide earned with no slide');
    for (const id of ['slab1', 'slab10']) { const t = (ach(id).name || '') + ' ' + (ach(id).desc || ach(id).text || ''); if (/slab|avalanche/i.test(t)) bad.push(id + ' still says slab or avalanche: ' + t); }
    return bad.length === 0 || bad.join('; ');
  });
}
