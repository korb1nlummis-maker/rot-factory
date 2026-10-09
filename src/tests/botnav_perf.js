// botnav.perf.*: thirty bots on a three level stacked base (a stair from the floor to the second level, another to the third, a generator on each) cost under 0.3 ms a frame, and the
// searches are shared: bots that start from the same spot for the same place are answered from the cache. (a new world, a sealed yard in the pile: stack_lib.js)
// Run: `await __selftest('botnav.perf')`
import { kit as stackKit } from './stack_lib.js';
import { kit } from './botnav_lib.js';

export default async function (ctx) {
  const { g, S } = ctx;
  ctx.WORLD_TESTS.push('botnav.perf');
  const K = stackKit(ctx), H = kit(ctx, { shell: false }), NAV = H.NAV, C = 0.6;
  const guard = (name, fn) => H.guard(name, fn, { setup: false });
  const threeLevels = async () => {
    const Y = K.yard({ levels: 3, east: true }); const [A, B2] = K.stack(Y, ['steel', 'steel', 'steel']);
    const f = await K.putPlate(A, 'f', 0, 0), l2 = await K.putPlate(A, 'c', 1, 0), l3 = await K.putPlate(B2, 'c', 1, 2);   // (the second landing turned half way round: its stair stands on the solid half of the floor the first one opens in)
    if (!f.ok || !l2.ok || !l3.ok) throw new Error('plates ' + [f.why, l2.why, l3.why]);
    const s1 = await K.putStair(A, 0); if (!s1.ok) throw new Error('stair 1: ' + s1.why);
    const s2 = await K.putStair(B2, 2); if (!s2.ok) throw new Error('stair 2: ' + s2.why);
    K.tick(0.3); return Y;
  };

  await guard('botnav.perf.thirty-bots-on-a-three-level-base-cost-under-three-tenths-of-a-millisecond-a-frame', async () => {
    const Y = await threeLevels();
    const gens = [H.gen(Y.m + 0, Y.lo + 1, 5), H.gen(Y.m + 0, Y.lo + 2, 5), H.gen(Y.m + 3, Y.lo + 1, 9), H.gen(Y.m + 3, Y.lo + 2, 9)];
    const undo = H.homeAt(H.cellX(Y.i0 + 4), H.cellZ(Y.lo + 1));
    try {
      // reaches the third level on foot?
      const pa = NAV.pathTo({ x: H.cellX(Y.i0 + 5), y: 0, z: H.cellZ(Y.lo + 1) }, { x: H.cellX(Y.m + 3), y: 9 * C, z: H.cellZ(Y.lo + 1) }, { sync: true, dy: 0.3 });
      if (!pa.ok) return 'no path to the third level: ' + pa.why;
      const bots = []; for (let n = 0; n < 30; n++) { const b = H.mkBot(H.cellX(Y.i0 + 3 + (n % 8)), H.cellZ(Y.lo + (n >> 3) % 4), 0.02); b.carry = H.mix(3); bots.push(b); }
      const once = (on) => {
        NAV.setEnabled(on); NAV.invalidate('perf'); NAV.resetStats();
        for (const t of gens) t.q.length = 0; H.fillOthers(null); for (const t of gens) t.q.length = 0;
        for (const b of bots) { b.carry = H.mix(3); b.x = H.cellX(Y.i0 + 3 + (bots.indexOf(b) % 8)); b.z = H.cellZ(Y.lo + (bots.indexOf(b) >> 3) % 4); b.y = 0.02; b.vy = 0; b.state = 'idle'; NAV.resetBot(b); b.fuelJob = null; b.fuelHops = 0; b.fuelBad = null; }
        for (const b of bots) g.crew.goHome(b);
        let ms = 0, n = 0, worst = 0; const dt = 0.05, u0 = Object.getPrototypeOf(g.crew).update;
        g.crew.update = function (d, t) { const t0 = performance.now(); const r = u0.call(this, d, t); const e = performance.now() - t0; ms += e; n++; worst = Math.max(worst, e); return r; };   // (the crew's own update inside the real frame, timed)
        try { for (let q = 0; q < 500; q++) { g.time += dt; g.updatePlay(dt); } } finally { delete g.crew.update; }
        return { per: ms / n, worst, st: NAV.stats(), up: bots.filter((b) => b.y > 2.8).length, fed: gens.reduce((a, t) => a + t.q.length, 0) };
      };
      const off = once(false), on = once(true); NAV.setEnabled(true);
      const navMs = on.st.frameMs / Math.max(1, on.st.frames), extra = on.per - off.per;
      ctx.g.__navPerf = { navMs, extra, off: off.per, on: on.per, worst: on.worst, st: on.st, up: on.up, fed: on.fed };
      if (on.st.frames < 400) return 'frames ' + on.st.frames;
      if (!(on.fed >= 12)) return `only ${on.fed} plush reached the generators on the upper levels (${on.up} bots up): ` + JSON.stringify(on.st);
      if (navMs >= 0.3) return `botnav itself costs ${navMs.toFixed(3)} ms a frame (${JSON.stringify(on.st)})`;
      if (extra >= 0.3) return `the crew costs ${extra.toFixed(3)} ms a frame more than without it (${off.per.toFixed(3)} -> ${on.per.toFixed(3)})`;
      return true;
    } finally { undo(); NAV.setEnabled(true); }
  });

  await guard('botnav.perf.the-path-cache-answers-bots-that-start-from-the-same-place', async () => {
    const Y = await threeLevels(); NAV.resetStats();
    const from = { x: H.cellX(Y.i0 + 5), y: 0, z: H.cellZ(Y.lo + 1) }, to = { x: H.cellX(Y.m), y: 5 * C, z: H.cellZ(Y.lo + 1) };
    for (let n = 0; n < 30; n++) NAV.pathTo(from, to, { sync: true, dy: 0.3 });
    const st = NAV.stats(), rate = st.hits / (st.hits + st.misses);
    if (st.misses !== 1 || st.hits !== 29) return 'counters ' + JSON.stringify(st);
    NAV.invalidate('x'); NAV.pathTo(from, to, { sync: true, dy: 0.3 }); const s2 = NAV.stats();
    return (s2.misses === 2 && rate > 0.95) || 'after a new version ' + JSON.stringify(s2);
  });
}
