// botroutes.audit.perf.*: sixty bots and twenty machines on a three level stacked base, timed (the call routes alone, the whole crew with and without them, the worst single frame), and sixty
// low battery bots that cannot reach any of twenty Charging Stations (the question 'can I reach it' must not cost a frame each second per bot).
// Run: `await __selftest('botroutes.audit.perf')`
import { kit, RT, threeLevels, stackKit } from './botroutes_lib.js';

export default async function (ctx) {
  const { g, S } = ctx;
  ctx.WORLD_TESTS.push('botroutes.audit.perf');
  const K = stackKit(ctx), H = kit(ctx, { shell: false }), C = 0.6, NAV = H.NAV;
  const guard = (name, fn) => H.guard(name, fn, { setup: false });
  const spots = (Y) => { const o = []; for (const row of [5, 9]) for (const i of [0, 1, 2, 3]) for (const k of [1, 2]) o.push([Y.m + i, Y.lo + k, row]); return o; };

  await guard('botroutes.audit.perf.sixty-bots-and-twenty-machines-on-three-levels-stay-within-the-frame-budget', async () => {
    const { Y } = await threeLevels(K);
    const mach = []; spots(Y).forEach(([i, k, row], n) => mach.push(n % 8 === 7 ? H.charger(i, k, row, { reserve: 8 }) : H.gen(i, k, row)));
    for (let n = 0; n < 4; n++) mach.push(H.gen(Y.i0 + 5 + n, Y.lo + 3, 0));
    const undo = H.homeAt(H.cellX(Y.i0 + 4), H.cellZ(Y.lo + 1));
    try {
      const bots = []; for (let n = 0; n < 60; n++) bots.push(H.mkBot(H.cellX(Y.i0 + 3 + (n % 8)), H.cellZ(Y.lo + (n >> 3) % 4), 0.02));
      const once = (on) => {
        RT.setEnabled(on); NAV.invalidate('perf'); NAV.resetStats(); g.botnav.resetStats();
        for (const t of mach) if (t.type === 'gen') t.q.length = 0; H.fillOthers(null); for (const t of mach) if (t.type === 'gen') t.q.length = 0;
        for (const [n, b] of bots.entries()) { b.carry = H.mix(3); b.x = H.cellX(Y.i0 + 3 + (n % 8)); b.z = H.cellZ(Y.lo + (n >> 3) % 4); b.y = 0.02; b.vy = 0; b.state = 'idle'; NAV.resetBot(b); b.fuelJob = null; b.fuelHops = 0; b.fuelBad = null; b.battery = n % 4 === 0 ? 0.2 : 1; }
        S().botCalls = [];
        for (const b of bots) g.crew.goHome(b);
        let ms = 0, n = 0, worst = 0, calls = 0, up = 0; const dt = 0.05, u0 = Object.getPrototypeOf(g.crew).update, big = [];
        g.crew.update = function (d, t) { const t0 = performance.now(); const r = u0.call(this, d, t); const e = performance.now() - t0; ms += e; n++; worst = Math.max(worst, e); if (e > 8) big.push(+e.toFixed(1)); calls = Math.max(calls, S().botCalls.length); for (const b of S().crew) if (b.y > 2.8) { up++; break; } return r; };
        try { for (let q = 0; q < 800; q++) { g.time += dt; g.updatePlay(dt); } } finally { delete g.crew.update; }
        return { per: ms / n, worst, big, st: g.botnav.stats(), nav: NAV.stats(), calls, up, fed: mach.reduce((a, t) => a + (t.type === 'gen' ? t.q.length : 0), 0) };
      };
      const off = once(false), on = once(true); RT.setEnabled(true);
      const rtMs = on.st.ms / Math.max(1, on.st.frames), extra = on.per - off.per;
      g.__rtPerf60 = { rtMs, extra, off: off.per, on: on.per, worst: on.worst, worstOff: off.worst, big: on.big.length, st: on.st, calls: on.calls, up: on.up, fed: on.fed, nav: on.nav };
      if (on.calls < 15) return 'only ' + on.calls + ' calls at once: ' + JSON.stringify(on.st);
      if (rtMs >= 0.5) return `the call routes cost ${rtMs.toFixed(3)} ms a frame for 60 bots and 20 machines (${JSON.stringify(on.st)})`;
      if (extra >= 1.0) return `the crew costs ${extra.toFixed(3)} ms a frame more with the routes (${off.per.toFixed(3)} -> ${on.per.toFixed(3)})`;
      if (on.worst > 25) return `a single crew update took ${on.worst.toFixed(1)} ms (${on.big.join()})`;
      const cap = bots.length * (40 / RT.REPLAN + 2) * 2; if (on.st.lays > cap) return `${on.st.lays} lays in 40 s for 60 bots (limit ${cap})`;
      return true;
    } finally { undo(); RT.setEnabled(true); }
  });

  await guard('botroutes.audit.perf.sixty-low-battery-bots-that-reach-no-station-cost-no-frame-spike', async () => {
    const { Y, s1, s2 } = await threeLevels(K);
    for (const s of [s1, s2]) for (const e of (s.made || [])) g.doDecon({ kind: 'mach', id: e.id });   // the upper floors are sealed: no station on them can be reached
    K.tick(0.3); NAV.invalidate('seal');
    const mach = []; spots(Y).slice(0, 16).forEach(([i, k, row]) => mach.push(H.charger(i, k, row, { reserve: 8 })));
    for (let n = 0; n < 4; n++) mach.push(H.charger(Y.i0 + 5 + n, Y.lo + 3, 0, { reserve: 8 }));   // (four on the floor that are open and near: the chase is for the sealed ones that are nearer)
    const undo = H.homeAt(H.cellX(Y.i0 + 4), H.cellZ(Y.lo + 1));
    try {
      const bots = []; for (let n = 0; n < 60; n++) { const b = H.mkBot(H.cellX(Y.i0 + 3 + (n % 8)), H.cellZ(Y.lo + (n >> 3) % 4), 0.02); b.battery = 0.1; bots.push(b); }
      for (const t of mach.slice(16)) t.reserve = 0.04;   // the floor ones hold no charge: every bot has twenty candidates and none it can use
      NAV.resetStats(); g.botnav.resetStats();
      let worst = 0, ms = 0, n = 0; const dt = 0.05, u0 = Object.getPrototypeOf(g.crew).update, big = [];
      g.crew.update = function (d, t) { const t0 = performance.now(); const r = u0.call(this, d, t); const e = performance.now() - t0; ms += e; n++; worst = Math.max(worst, e); if (e > 12) big.push(+e.toFixed(1)); return r; };
      try { for (let q = 0; q < 600; q++) { g.time += dt; g.updatePlay(dt); } } finally { delete g.crew.update; }
      const st = NAV.stats();
      g.__rtPerfLow = { per: ms / n, worst, big: big.length, st };
      if (ms / n >= 1.5) return `the crew costs ${(ms / n).toFixed(2)} ms a frame (worst ${worst.toFixed(1)}; ${JSON.stringify(st)})`;
      if (worst > 40) return `a single crew update took ${worst.toFixed(1)} ms (${big.join()}; ${JSON.stringify(st)})`;
      return true;
    } finally { undo(); }
  });
}
