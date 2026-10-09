// botroutes.perf.*: thirty bots and ten machines on a three level stacked base cost under 0.3 ms a frame for the call routes (g.botnav.stats()), a route is laid at most once every
// 1.5 s per bot, and a bot with no errand costs next to nothing. (a new world: the cubes are built in a sealed box of plush)
// Run: `await __selftest('botroutes.perf')`
import { kit, RT, threeLevels, stackKit } from './botroutes_lib.js';

export default async function (ctx) {
  const { g, S } = ctx;
  ctx.WORLD_TESTS.push('botroutes.perf');
  const K = stackKit(ctx), H = kit(ctx, { shell: false }), C = 0.6, NAV = H.NAV;
  const guard = (name, fn) => H.guard(name, fn, { setup: false });

  await guard('botroutes.perf.thirty-bots-and-ten-machines-on-three-levels-cost-under-three-tenths-of-a-millisecond-a-frame', async () => {
    const { Y } = await threeLevels(K);
    const mach = [H.gen(Y.m + 0, Y.lo + 1, 5), H.gen(Y.m + 0, Y.lo + 2, 5), H.gen(Y.m + 3, Y.lo + 1, 9), H.gen(Y.m + 3, Y.lo + 2, 9), H.charger(Y.m + 3, Y.lo + 3, 9, { reserve: 8 }), H.charger(Y.m + 0, Y.lo + 3, 5, { reserve: 8 })];
    for (let n = 0; n < 4; n++) mach.push(H.gen(Y.i0 + 5 + n, Y.lo + 3 + (n % 2 ? 0 : 0), 0));   // on the floor of the approach tunnel
    const undo = H.homeAt(H.cellX(Y.i0 + 4), H.cellZ(Y.lo + 1));
    try {
      const bots = []; for (let n = 0; n < 30; n++) { const b = H.mkBot(H.cellX(Y.i0 + 3 + (n % 8)), H.cellZ(Y.lo + (n >> 3) % 4), 0.02); bots.push(b); }
      const once = (on) => {
        RT.setEnabled(on); NAV.invalidate('perf'); NAV.resetStats(); g.botnav.resetStats();
        for (const t of mach) { if (t.type === 'gen') t.q.length = 0; } H.fillOthers(null); for (const t of mach) if (t.type === 'gen') t.q.length = 0;
        for (const [n, b] of bots.entries()) { b.carry = H.mix(3); b.x = H.cellX(Y.i0 + 3 + (n % 8)); b.z = H.cellZ(Y.lo + (n >> 3) % 4); b.y = 0.02; b.vy = 0; b.state = 'idle'; NAV.resetBot(b); b.fuelJob = null; b.fuelHops = 0; b.fuelBad = null; b.battery = n % 5 === 0 ? 0.2 : 1; }
        S().botCalls = [];
        for (const b of bots) g.crew.goHome(b);
        let ms = 0, n = 0, worst = 0, calls = 0, up = 0; const dt = 0.05, u0 = Object.getPrototypeOf(g.crew).update;
        g.crew.update = function (d, t) { const t0 = performance.now(); const r = u0.call(this, d, t); const e = performance.now() - t0; ms += e; n++; worst = Math.max(worst, e); calls = Math.max(calls, S().botCalls.length); for (const b of S().crew) if (b.y > 2.8) { up++; break; } return r; };
        try { for (let q = 0; q < 600; q++) { g.time += dt; g.updatePlay(dt); } } finally { delete g.crew.update; }
        return { per: ms / n, worst, st: g.botnav.stats(), calls, up, fed: mach.reduce((a, t) => a + (t.type === 'gen' ? t.q.length : 0), 0) };
      };
      const off = once(false), on = once(true); RT.setEnabled(true);
      const rtMs = on.st.ms / Math.max(1, on.st.frames), extra = on.per - off.per;
      ctx.g.__rtPerf = { rtMs, extra, off: off.per, on: on.per, worst: on.worst, st: on.st, calls: on.calls };
      if (on.st.frames < 500) return 'frames ' + on.st.frames;
      if (on.calls < 10) return 'only ' + on.calls + ' calls at once: ' + JSON.stringify(on.st);
      if (!(on.fed >= 12)) return `only ${on.fed} plush reached the machines: ` + JSON.stringify(on.st);
      if (rtMs >= 0.3) return `the call routes cost ${rtMs.toFixed(3)} ms a frame (${JSON.stringify(on.st)})`;
      if (extra >= 0.3) return `the crew costs ${extra.toFixed(3)} ms a frame more with the routes (${off.per.toFixed(3)} -> ${on.per.toFixed(3)})`;
      // a route is laid again at most once every 1.5 s per bot: 600 frames of 0.05 s are 30 s
      const cap = bots.length * (30 / RT.REPLAN + 2) * 2; if (on.st.lays > cap) return `${on.st.lays} lays in 30 s for 30 bots (limit ${cap})`;
      return true;
    } finally { undo(); RT.setEnabled(true); }
  });

  await guard('botroutes.perf.a-bot-with-no-errand-and-no-call-costs-one-function-call', async () => {
    const bots = []; for (let n = 0; n < 30; n++) bots.push(H.mkBot(H.cellX(-4 + n % 6), H.cellZ(4 + (n >> 3)), 0.02));
    for (const b of bots) b.state = 'idle';
    H.fillOthers(null); g.botnav.resetStats();
    const t0 = performance.now(); let n = 0; for (let q = 0; q < 4000; q++) for (const b of bots) { if (RT.think(g.crew, b, 0.05)) n++; } const e = performance.now() - t0;
    if (n) return 'it drove ' + n + ' idle bots';
    const per = e / (4000 * 30) * 1000; ctx.g.__rtIdle = per;   // microseconds a bot
    return per < 5 || `${per.toFixed(2)} us a bot`;
  });
}
