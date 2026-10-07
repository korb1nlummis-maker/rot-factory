// audit_gaps.power.*: a seeded random soak over the grid solver with every kind of catalog consumer. Each step places or takes down poles, generators, fans, rail stations and furnish lights,
// wires cables and moves time. Invariants: a grid's demand is exactly the sum of what its consumers draw (nothing counted twice, nothing dropped), every consumer's pw is its grid's
// satisfaction, two recomputes give the same numbers, and a save and reload in the middle brings the same totals back.
import { makeRail } from './rail_lib.js';
import { catalogKw, isCatalogConsumer, DEMAND } from '../power.js';
import { beltKw } from '../beltdata.js';

export default async function (ctx) {
  const { T, g, S, L, adv, toI, toK, cellX, cellZ } = ctx;
  const X = makeRail(ctx), K = X.K;
  const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const FURN = ['clamp', 'flood', 'strip', 'sign', 'wbeacon'];
  const entsNow = () => [...L().tiles.values(), ...[...g.machines.items.values()].map((i) => i.ent)];
  const kwOf = (e) => (e.type === 'fan' ? DEMAND.fan : e.type === 'belt' ? beltKw(e) : e.type === 'gen' || e.type === 'pole' ? 0 : isCatalogConsumer(e.type) ? catalogKw(g, e) : null);

  const check = (step, bad) => {
    const sums = new Map();
    for (const e of entsNow()) {
      const kw = kwOf(e); if (kw === null) continue;
      const net = g.power.netOfEnt(e);
      if (!net) { if ((e.pw || 0) > 1e-9) bad.push(`${step}: ${e.type} ${e.id} has pw ${e.pw} with no grid`); continue; }
      sums.set(net, (sums.get(net) || 0) + kw);
      if (Math.abs((e.pw || 0) - net.sat) > 1e-6) bad.push(`${step}: ${e.type} ${e.id} pw ${e.pw} but its grid is at ${net.sat}`);
    }
    for (const n of g.power.nets) {
      if (!Number.isFinite(n.demand) || n.demand < 0) bad.push(`${step}: net demand ${n.demand}`);
      const want = sums.get(n) || 0; if (Math.abs(n.demand - want) > 1e-6) bad.push(`${step}: net ${n.id} demand ${n.demand.toFixed(3)} but its consumers draw ${want.toFixed(3)}`);
      const lsum = Object.values(n.loads || {}).reduce((a, b) => a + b, 0); if (Math.abs(lsum - n.demand) > 1e-6) bad.push(`${step}: net ${n.id} lists ${lsum.toFixed(3)} kW of loads for ${n.demand.toFixed(3)} kW of demand`);
    }
  };

  await T('audit_gaps.power.soak.random-edits-count-every-consumer-exactly-once-and-a-reload-brings-the-totals-back', async () => {
    const bad = [];
    try {
      for (const seed of [5, 77, 9001]) {
        X.setup(); S().items.cable = 400; const R = rng(seed), pick = (a) => a[Math.floor(R() * a.length)];
        const k = X.ck(-2.2), iA = X.ci(-26), iB = X.ci(-4); X.line(iA, iB, 0, k);
        for (let step = 0; step < 220 && bad.length < 6; step++) {
          const r = R();
          try {
            if (r < 0.14) { const x = -16 + Math.floor(R() * 20) * 1.0, z = Math.floor(R() * 9); if (!g.logi.canPlace(toI(x), 0, toK(z))) K.tile('pole', x, z); }
            else if (r < 0.24) { const x = -16 + Math.floor(R() * 20) * 1.0, z = Math.floor(R() * 9); if (!g.logi.canPlace(toI(x), 0, toK(z))) K.gen(x, z); }
            else if (r < 0.38) { const x = -16 + Math.floor(R() * 20) * 1.0, z = Math.floor(R() * 9); if (!g.logi.canPlace(toI(x), 0, toK(z))) K.fan(x, z); }
            else if (r < 0.52) { const t = pick(FURN), x = -16 + R() * 20, z = R() * 9; K.mach(t, x, z, { y: 1.0, h: 0.1, mount: 'ceiling', dir: 0, mode: 'on', on: true }); }
            else if (r < 0.62) { const stn = X.ents('railstn'); if (stn.length < 3) { const i = iA + 2 + Math.floor(R() * (iB - iA - 3)); if (!X.ents('railstn').some((q) => q.i === i)) X.station(i, 0, k, 'face'); } }
            else if (r < 0.80) { const w = entsNow().filter((e) => e.type === 'gen' || e.type === 'pole' || e.type === 'fan' || e.type === 'railstn' || FURN.includes(e.type)); const a = pick(w), b = pick(w); if (a && b && a !== b) g.cables.connect(a.id, b.id); }
            else if (r < 0.92) { const w = entsNow().filter((e) => (e.type === 'gen' || e.type === 'pole' || e.type === 'fan' || e.type === 'railstn' || FURN.includes(e.type)) && !e.free); const e = pick(w); if (e) g.doDecon({ kind: g.logi.byId.get(e.id) ? 'tile' : 'mach', id: e.id }); }
            else if (r < 0.96) g.power.markDirty();
          } catch (x) { bad.push(`step ${step}: threw ${x.message}`); break; }
          adv(0.2 + R() * 0.7, 0.1); g.power.recompute();   // (a machine taken down by the hammer is dropped from the grid at the next solve, at most 0.8 s later)
          check(step, bad);
          // two recomputes in a row agree
          if (step % 40 === 39) { const a = g.power.nets.map((n) => [n.id, +n.demand.toFixed(6), +n.supply.toFixed(6)]).sort((p, q) => p[0] - q[0]); g.power.recompute(); const b = g.power.nets.map((n) => [n.id, +n.demand.toFixed(6), +n.supply.toFixed(6)]).sort((p, q) => p[0] - q[0]); if (JSON.stringify(a) !== JSON.stringify(b)) bad.push(`${step}: a second recompute changed the grids`); }
        }
        // a save and a reload: every entity and cable goes out and comes back
        const total = () => g.power.nets.reduce((a, n) => a + n.demand, 0), before = total(), cables = g.cables.list().length;
        const rawE = JSON.parse(JSON.stringify(S().entities.filter((e) => !e.free))), rawC = JSON.parse(JSON.stringify(S().cables));
        for (const e of entsNow()) if (!e.free && (kwOf(e) !== null)) g.doDecon({ kind: g.logi.byId.get(e.id) ? 'tile' : 'mach', id: e.id });
        g.power.markDirty(); adv(0.3); if (total() > 1e-9) bad.push(`seed ${seed}: ${total().toFixed(3)} kW left after everything was taken down`);
        S().cables = rawC; for (const e of rawE) { if (g.logi.byId.get(e.id) || g.machines.items.has(e.id)) continue; if (e.type === 'rail' || e.type === 'railstn' || e.type === 'railcar') { S().entities.push(e); g.addEntity(e); } else if (kwOf(e) !== null) { S().entities.push(e); g.addEntity(e); } }
        for (const e of rawE) if ((e.type === 'gen' || e.type === 'pole') && !g.logi.byId.get(e.id)) { S().entities.push(e); g.addEntity(e); }
        g.power.markDirty(); adv(0.5);
        if (Math.abs(total() - before) > 1e-6) bad.push(`seed ${seed}: ${before.toFixed(3)} kW before the reload, ${total().toFixed(3)} after`);
        if (g.cables.list().length !== cables) bad.push(`seed ${seed}: ${cables} cables before, ${g.cables.list().length} after`);
        check('reload ' + seed, bad);
      }
    } finally { X.clean(); for (const e of entsNow()) if (!e.free && (e.type === 'gen' || e.type === 'pole' || e.type === 'fan' || FURN.includes(e.type))) { try { g.doDecon({ kind: g.logi.byId.get(e.id) ? 'tile' : 'mach', id: e.id }); } catch (x) { /* gone */ } } g.cables.reset(); S().cables = []; g.power.markDirty(); }
    void cellX; void cellZ; void T;
    return bad.length === 0 || bad.slice(0, 6).join(' || ');
  });
}
