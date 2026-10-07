// audit.bins.perf-*: what the bins cost per call in a big world (2000 machines, 3000 belt tiles, 12 Depot Beacons), measured with timings. The numbers on a quiet machine are in the
// comments; the limits are 10 to 25 times that, so only a scan of every entity per lookup (what the first pass did for a depot saved before bins had numbers) fails them.
// Run: `await __selftest('audit.bins.perf')`
import { kit } from './bins_lib.js';
import * as BINS from '../bins.js';
import * as BP from '../binspanel.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { g, S, L, toI, toK } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const per = (f, n) => { f(); const a = performance.now(); for (let i = 0; i < n; i++) f(); return (performance.now() - a) / n * 1000; };   // microseconds per call
  const best = (f, n) => Math.min(per(f, n), per(f, n), per(f, n));

  await G('audit.bins.perf-a-lookup-by-id-never-scans-the-world-even-for-depots-saved-before-bins-had-numbers', async () => {
    const bad = [], made = [];
    try {
      for (let n = 0; n < 2000; n++) { const e = { id: g.nextId(), type: 'lantern', x: 200 + (n % 50), y: 0, z: 200 + Math.floor(n / 50), i: toI(200 + (n % 50)), j: 0, k: toK(200 + Math.floor(n / 50)) }; S().entities.push(e); g.addEntity(e); made.push(e); }
      const bs = []; for (let n = 0; n < 12; n++) bs.push(K.beacon(-30 + n * 3, 12));   // no numbers: the way every depot of an old save starts
      K.run(0.2);
      const us = { resolve: best(() => BINS.resolve(g, bs[7].id), 3000), pickHall: best(() => BINS.pickHall(g, bs[7].id), 3000), binById: best(() => BINS.binById(g, bs[11].id), 3000) };
      for (const [k, v] of Object.entries(us)) if (!(v < 4)) bad.push(`${k} takes ${v.toFixed(1)} us per call (a quiet machine: 0.2)`);
      // a belt end hands over a plush: both of its spots look at every bin
      const end = { dest: 0, i: 10, k: 10, dir: 0, type: 'belt', id: 99999999 };
      const e1 = best(() => BINS.endSink(g, end, [[3.0, -4.0], [2.5, -4.0]]), 1500); if (!(e1 < 250)) bad.push(`a belt end takes ${e1.toFixed(1)} us per plush (a quiet machine: 13)`);
      const e2 = best(() => BINS.endSink(g, { ...end, dest: bs[3].id }, [[-21, 12], [-21.5, 12]]), 1500); if (!(e2 < 250)) bad.push(`an assigned belt end takes ${e2.toFixed(1)} us per plush`);
    } finally { for (const e of made) { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } } S().entities = S().entities.filter((e) => !made.includes(e)); }
    return bad.length === 0 || bad.join(' || ');
  });

  await G('audit.bins.perf-the-hover-and-the-panel-stay-cheap-with-thousands-of-belts', async () => {
    const bad = [], made = [];
    try {
      for (let n = 0; n < 3000; n++) { const e = { id: g.nextId(), type: 'belt', i: 2200 + (n % 100), j: 0, k: 2200 + Math.floor(n / 100), dir: 0, rise: 0, items: [] }; S().entities.push(e); g.addEntity(e); made.push(e); }
      const bs = []; for (let n = 0; n < 12; n++) bs.push(K.beacon(-30 + n * 3, 12, { num: n })); K.run(0.2);
      const hover = best(() => infoFor(g, { kind: 'mach', id: bs[0].id }), 60);   // every frame you look at a depot: 0.1 ms with 3000 belts
      if (!(hover < 5000)) bad.push(`hovering a depot takes ${(hover / 1000).toFixed(2)} ms with 3000 belts`);
      const panel = best(() => BP.options(g, null), 6);   // once a second while the panel is open
      if (!(panel < 60000)) bad.push(`the panel's list takes ${(panel / 1000).toFixed(1)} ms with 3000 belts`);
      const subs = BINS.subjects(g).length; if (subs < 3000) bad.push('the belts are not counted: ' + subs);
    } finally { for (const e of made) { const t = L().byId.get(e.id); if (t) L().remove(t); } S().entities = S().entities.filter((e) => !made.includes(e)); }
    return bad.length === 0 || bad.join(' || ');
  });
}
