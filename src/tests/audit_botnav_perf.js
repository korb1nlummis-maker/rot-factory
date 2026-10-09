// botnav.audit.perf.*: sixty bots on a three level base, timed; two bots on one ladder; the node table after many searches.
// Run: `await __selftest('botnav.audit.perf')`
import { kit as stackKit } from './stack_lib.js';
import { kit } from './botnav_lib.js';

export default async function (ctx) {
  const { g, S } = ctx;
  ctx.WORLD_TESTS.push('botnav.audit.perf');
  const K = stackKit(ctx), H = kit(ctx, { shell: false }), NAV = H.NAV, C = 0.6;
  const guard = (name, fn) => H.guard(name, fn, { setup: false });
  const threeLevels = async () => {
    const Y = K.yard({ levels: 3, east: true }); const [A, B2] = K.stack(Y, ['steel', 'steel', 'steel']);
    const f = await K.putPlate(A, 'f', 0, 0), l2 = await K.putPlate(A, 'c', 1, 0), l3 = await K.putPlate(B2, 'c', 1, 2);
    if (!f.ok || !l2.ok || !l3.ok) throw new Error('plates ' + [f.why, l2.why, l3.why]);
    const s1 = await K.putStair(A, 0); if (!s1.ok) throw new Error('stair 1: ' + s1.why);
    const s2 = await K.putStair(B2, 2); if (!s2.ok) throw new Error('stair 2: ' + s2.why);
    K.tick(0.3); return Y;
  };

  await guard('botnav.audit.perf.sixty-bots-on-a-three-level-base-stay-within-a-frame-budget', async () => {
    const Y = await threeLevels();
    const gens = [H.gen(Y.m + 0, Y.lo + 1, 5), H.gen(Y.m + 0, Y.lo + 2, 5), H.gen(Y.m + 3, Y.lo + 1, 9), H.gen(Y.m + 3, Y.lo + 2, 9)];
    const undo = H.homeAt(H.cellX(Y.i0 + 4), H.cellZ(Y.lo + 1));
    try {
      const bots = []; for (let n = 0; n < 60; n++) { const b = H.mkBot(H.cellX(Y.i0 + 3 + (n % 8)), H.cellZ(Y.lo + ((n >> 3) % 4)), 0.02); b.carry = H.mix(3); bots.push(b); }
      const once = (on) => {
        NAV.setEnabled(on); NAV.invalidate('perf'); NAV.resetStats();
        for (const t of gens) t.q.length = 0; H.fillOthers(null); for (const t of gens) t.q.length = 0;
        bots.forEach((b, n) => { b.carry = H.mix(3); b.x = H.cellX(Y.i0 + 3 + (n % 8)); b.z = H.cellZ(Y.lo + ((n >> 3) % 4)); b.y = 0.02; b.vy = 0; b.state = 'idle'; NAV.resetBot(b); b.fuelJob = null; b.fuelHops = 0; b.fuelBad = null; });
        for (const b of bots) g.crew.goHome(b);
        let ms = 0, n = 0, worst = 0; const dt = 0.05, u0 = Object.getPrototypeOf(g.crew).update;
        g.crew.update = function (d, t) { const t0 = performance.now(); const r = u0.call(this, d, t); const e = performance.now() - t0; ms += e; n++; worst = Math.max(worst, e); return r; };
        try { for (let q = 0; q < 600; q++) { g.time += dt; g.updatePlay(dt); } } finally { delete g.crew.update; }
        return { per: ms / n, worst, st: NAV.stats(), up: bots.filter((b) => b.y > 2.8).length, fed: gens.reduce((a, t) => a + t.q.length, 0) };
      };
      const off = once(false), on = once(true); NAV.setEnabled(true);
      const navMs = on.st.frameMs / Math.max(1, on.st.frames);
      g.__navPerf60 = { navMs, extra: on.per - off.per, off: off.per, on: on.per, worst: on.worst, worstOff: off.worst, st: on.st, up: on.up, fed: on.fed };
      if (navMs >= 0.6) return `botnav costs ${navMs.toFixed(3)} ms a frame for 60 bots (${JSON.stringify(on.st)})`;
      if (on.per - off.per >= 0.8) return `the crew costs ${(on.per - off.per).toFixed(3)} ms a frame more with 60 bots`;
      if (on.worst > 25) return `a single crew update took ${on.worst.toFixed(1)} ms`;
      return true;
    } finally { undo(); NAV.setEnabled(true); }
  });

  await guard('botnav.audit.perf.thirty-bots-following-a-running-player-over-two-levels-stay-within-budget', async () => {
    const Y = await threeLevels(); const bots = [];
    for (let n = 0; n < 30; n++) { const b = H.mkBot(H.cellX(Y.i0 + 3 + (n % 8)), H.cellZ(Y.lo + ((n >> 3) % 4)), 0.02); g.crew.follow(b); bots.push(b); }
    NAV.resetStats(); NAV.invalidate('perf'); NAV.resetStats();
    const P = ctx.p(); let worstQ = 0, up = 0;
    const y0 = 5 * C;   // the second plate (row 5 is the upper landing)
    for (let q = 0; q < 1200; q++) {
      const ph = q * 0.05, x = H.cellX(Y.m) + Math.sin(ph * 0.6) * 1.0, z = H.cellZ(Y.lo + 1) + Math.sin(ph * 0.9) * 0.9;
      P.pos.set(x, q < 600 ? 3.0 : 0, z); P.vel.set(0, 0, 0);
      g.time += 0.05; g.updatePlay(0.05); worstQ = Math.max(worstQ, NAV.stats().queue);
    }
    up = bots.filter((b) => b.y > 2.4).length;
    const st = NAV.stats(), navMs = st.frameMs / Math.max(1, st.frames);
    g.__navFollow = { navMs, st, worstQ, up };
    if (navMs >= 0.5) return `following costs ${navMs.toFixed(3)} ms a frame (${JSON.stringify(st)})`;
    return worstQ < 400 || 'the search queue grew to ' + worstQ;
  });

  await guard('botnav.audit.perf.two-bots-do-not-share-a-ladder-rung', async () => {
    const Y = K.yard({ levels: 2, east: true }); const [A, B2] = K.stack(Y, ['steel', 'steel']);
    const a = await K.putPlate(A, 'f', 0, 0); const b = await K.putPlate(A, 'c', 2, 0); if (!a.ok || !b.ok) return 'plates ' + (a.why || b.why);
    ctx.craft('ladder'); ctx.selectTool('ladder'); K.aimAt(K.cellX(Y.m + 1), 4 * C, K.cellZ(Y.lo + 2), 1.0); const pl = await ctx.plan(); if (!pl.ok) return 'ladder: ' + pl.why;
    ctx.placeNow(); K.tick(0.2);
    const t1 = H.gen(Y.m + 0, Y.lo + 1, 5), t2 = H.gen(Y.m + 0, Y.lo + 2, 5); H.fillOthers(null); t1.q.length = 0; t2.q.length = 0;
    const undo = H.homeAt(H.cellX(Y.i0 + 4), H.cellZ(Y.lo + 1));
    try {
      const b1 = H.mkBot(H.cellX(Y.i0 + 5), H.cellZ(Y.lo + 1)), b2 = H.mkBot(H.cellX(Y.i0 + 5), H.cellZ(Y.lo + 1) + 0.1); b1.carry = H.mix(4); b2.carry = H.mix(4);
      g.crew.goHome(b1); g.crew.goHome(b2);
      let both = 0, close = 0;
      H.watch(b1, 150, () => t1.q.length + t2.q.length >= 8 && b1.state === 'idle' && b2.state === 'idle', { each: () => {
        const c1 = NAV.codeOf(b1) === NAV.CODE.ladder, c2 = NAV.codeOf(b2) === NAV.CODE.ladder;
        if (c1 && c2) { both++; if (Math.hypot(b1.x - b2.x, b1.z - b2.z) < 0.3 && Math.abs(b1.y - b2.y) < 0.5) close++; }
      } });
      if (t1.q.length + t2.q.length !== 8) return `only ${t1.q.length + t2.q.length} of 8 plush up the ladder`;
      return close === 0 || `the two bots hung on the same rung for ${close} frames (${both} frames on the ladder together)`;
    } finally { undo(); }
  });
}
