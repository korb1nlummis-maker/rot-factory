// audit botfuel: the cost of keeping machines fueled. 50 bots and 100 machines must plan fuel errands in a small share of a frame, an unreachable or unusable machine must not
// make every bot re-plan it every poll, and nothing the planner does may grow with the number of machines a bot cannot use. Run: `await __selftest('botfuel.audit-perf')`
import { kit, UP, sp, mixOf } from './botfuel_lib.js';

export default async function (ctx) {
  const { g, S, toI, toK } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const opt = { up: UP };

  // 100 machines on a lattice in the bay (half generators on a live grid, half Charging Stations), 50 bots at the bin
  const field = (nGen = 50, nChg = 50) => {
    const out = { gens: [], chargers: [] };
    let n = 0;
    const spot = () => { const c = n++ % 10, r = Math.floor(n / 10); return [-11 + c * 2.4, -8 + r * 2.2]; };
    for (let q = 0; q < nGen; q++) { const [x, z] = spot(); const t = K.gen(x, z); K.grid(x, z, 1); out.gens.push(t); }
    for (let q = 0; q < nChg; q++) { const [x, z] = spot(); const t = K.charger(x, z); t.dig = 1e9; out.chargers.push(t); }
    return out;
  };
  const timeIt = (sec, dt = 0.05) => {
    const ms = []; const t0 = performance.now(); let worst = 0;
    for (let n = 0; n < sec / dt; n++) {
      for (const t of g.logi.tiles.values()) t.pw = Math.max(t.pw || 0, 1);
      g.time += dt; const a = performance.now(); g.crew.update(dt, g.time); const d = performance.now() - a; ms.push(d); if (d > worst) worst = d;
    }
    ms.sort((a, b) => a - b);
    return { mean: ms.reduce((a, b) => a + b, 0) / ms.length, p95: ms[Math.floor(ms.length * 0.95)], worst, wall: performance.now() - t0 };
  };

  await G('botfuel.audit-perf-fifty-bots-and-a-hundred-machines-plan-in-a-small-share-of-a-frame', async () => {
    const f = field();
    const h = g.crew.home(); const bots = []; for (let q = 0; q < 50; q++) { const b = K.mkBot(h.x + (q % 10) * 0.4 - 2, h.z + 1 + Math.floor(q / 10) * 0.4); b.level = 6; bots.push(b); }
    // 25 bots come in with a mixed load, 25 sit idle with an empty bucket (they poll for a machine to scoop for)
    bots.forEach((b, q) => { if (q % 2) { b.carry = mixOf([0, 1, 2, 3, 4, 0, 1, 2]); b.state = 'return'; b.path = [[h.x, h.z]]; b.pi = 0; } });
    const off = (() => { S().crewFuel = false; const r = timeIt(30); S().crewFuel = undefined; return r; })();
    for (const b of bots) { b.fuelJob = null; b.fuelHops = 0; b.fuelDone = false; b.fuelT = 0; }
    bots.forEach((b, q) => { b.state = q % 2 ? 'return' : 'idle'; b.carry = q % 2 ? mixOf([0, 1, 2, 3, 4, 0, 1, 2]) : []; b.path = [[h.x, h.z]]; b.pi = 0; b.battery = 1; });
    const on = timeIt(30); const jobs = bots.filter((b) => b.fuelJob).length, hops = bots.reduce((a, b) => a + (b.fuelHops | 0), 0), hop = f.gens.reduce((a, t) => a + t.q.length, 0) + f.chargers.reduce((a, t) => a + t.q.length, 0), face = !!g.crew.nearestFace(h.x, 0.3, h.z + 1);
    const bad = [];
    if (on.mean > 3) bad.push(`mean ${on.mean.toFixed(2)} ms per crew update (switch off ${off.mean.toFixed(2)} ms)`);
    if (on.p95 > 12) bad.push(`p95 ${on.p95.toFixed(2)} ms`);
    if (on.worst > 40) bad.push(`worst frame ${on.worst.toFixed(1)} ms`);
    if (!jobs || !hop) bad.push(`the planner did nothing (jobs ${jobs}, hoppers hold ${hop}): the timing means nothing`);
    return bad.length === 0 || bad.join('; ') + ` (face ${face}; on: mean ${on.mean.toFixed(2)} p95 ${on.p95.toFixed(2)} worst ${on.worst.toFixed(1)}; off: mean ${off.mean.toFixed(2)}; jobs ${jobs} hops ${hops} hoppers hold ${hop} face ${face})`;
  }, opt);

  await G('botfuel.audit-perf-machines-nobody-can-use-are-not-replanned-every-poll', async () => {
    // 100 machines on another floor (a bot at ground level skips them) and 100 full ones: a poll must cost almost nothing, whatever the machine count
    const h = g.crew.home();
    for (let q = 0; q < 100; q++) { const t = K.gen(-11 + (q % 10) * 2.4, -8 + Math.floor(q / 10) * 2.2); for (let n = 0; n < 50; n++) t.q.push({ sp: sp(0), vr: 0 }); }
    const bots = []; for (let q = 0; q < 50; q++) { const b = K.mkBot(h.x + (q % 10) * 0.4 - 2, h.z + 1 + Math.floor(q / 10) * 0.4); b.carry = mixOf([0, 0, 0, 0]); b.state = 'return'; b.path = [[h.x, h.z]]; b.pi = 0; bots.push(b); }
    const r = timeIt(10);
    return r.mean < 2 || `mean ${r.mean.toFixed(2)} ms per update with only full machines about`;
  }, opt);
}
