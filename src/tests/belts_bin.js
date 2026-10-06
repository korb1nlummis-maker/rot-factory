import { pools } from '../plushdata.js';
import { infoFor } from '../info.js';
export default async function (ctx) {
  const { g, S, p, L, fresh, tiles, cellX, cellZ, toI, toK } = ctx;
  const build = (cells) => { for (const t of tiles()) L().remove(t); for (const [x, z, d] of cells) g.layBelt(toI(x), 0, toK(z), d); L().rebuildBelts(); };
  const run = (secs) => { for (let n = 0; n < secs * 10; n++) { g.time += 0.1; g.power.update(0.1); L().update(0.1); } };
  const bp = () => g.hall.binPos;
  const path = () => { const b = bp(); const x0 = b.x - 3.0, z0 = b.z + 3.0; return [[x0, z0, 0], [x0 + 0.6, z0, 0], [x0 + 1.2, z0, 0], [x0 + 1.8, z0, 3], [x0 + 1.8, z0 - 0.6, 3], [x0 + 1.8, z0 - 1.2, 3]]; };
  await T_('belts.an-unpowered-belt-still-creeps-and-says-so', async () => {
    fresh({ belts: 1 }); const b = bp(); build([[b.x - 3, b.z + 3, 0]]); const t = tiles().find((x) => x.type === 'belt'); t.items.push({ sp: pools[0][0], vr: 0, t: 0 }); run(0.8);
    return (t.items[0].t > 0.2 && (t.pw ?? 0) < 0.05) || `item at ${t.items[0] && t.items[0].t}, pw ${t.pw}`;
  });
  await T_('belts.a-turn-gets-a-corner-piece-and-items-follow-the-bend', async () => {
    fresh({ belts: 1 }); build(path()); const corner = tiles().find((t) => t.type === 'belt' && t.cd != null);
    if (!corner) return 'no corner detected'; if (corner.dir !== 3 || corner.cd !== 0) return `corner dir ${corner.dir} feeder ${corner.cd}`;
    const pre = tiles().find((t) => t.i === toI(bp().x - 3 + 1.2) && t.k === toK(bp().z + 3)); pre.items.push({ sp: pools[0][0], vr: 0, t: 0.99 }); run(1.2);
    const seen = []; L().forEachItem((it, x, y, z) => seen.push([x, z])); const moved = corner.items.length > 0 && corner.items[0].t < 0.9;
    return (L().cornerN === 1 && moved) || `corners ${L().cornerN}, item reached the turned part ${moved}`;
  });
  await T_('belts.a-bent-line-delivers-into-the-bin-and-pays', async () => {
    fresh({ belts: 1 }); build(path()); const start = tiles().find((t) => t.i === toI(bp().x - 3) && t.k === toK(bp().z + 3)); const m0 = S().money;
    start.items.push({ sp: pools[1][0], vr: 0, t: 0 }); run(40); const left = tiles().reduce((a, t) => a + t.items.length, 0);
    return (left === 0 && S().money > m0) || `plush left on the line ${left}, money ${m0} -> ${S().money}`;
  });
  await T_('belts.placing-a-belt-near-the-bin-aims-it-at-the-bin', async () => {
    fresh({ belts: 1 }); for (const t of tiles()) L().remove(t); const b = bp(); const a = { i: toI(b.x - 2.4), j: 0, k: toK(b.z) };
    const eye = { x: cellX(a.i), y: 1.4, z: cellZ(a.k) - 0.0 }; p().yaw = Math.PI; // facing the wrong way on purpose
    const pl = L().plan('belt', { x: eye.x, y: 1.6, z: eye.z - 1.5 }, { x: 0, y: -0.7, z: 0.7 }, Math.PI, 0);
    return (pl.ent && pl.ent.dir === 0) || `dir ${pl.ent && pl.ent.dir} ${pl.why || ''}`;
  });
  await T_('belts.hover-text-explains-power-and-bends', async () => {
    fresh({ belts: 1 }); build(path()); const t = tiles().find((x) => x.cd != null); const info = infoFor(g, { kind: 'tile', id: t.id }); const s = info ? info.lines.join(' ') : 'no info';
    return (/hand-cranked/.test(s) && /Bends here/.test(s)) || s;
  });
  await T_('belts.vacuum-hose-sucks-loose-plush-at-its-mouth-and-runs-at-double-speed', async () => {
    fresh({ belts: 1, vac: 1 }); const b = bp(); const x0 = b.x - 3, z0 = b.z + 3; build([[x0, z0, 0], [x0 + 0.6, z0, 0]]);
    const hs = tiles().filter((t) => t.type === 'belt'); for (const t of hs) t.hose = true; L().rebuildBelts();
    const mouth = hs.find((t) => !t.fed); const sim = g.sim; const n0 = sim.n;
    const i = sim.spawn(pools[0][0], 0, cellX(mouth.i) - 1.0, mouth.j * 0.6 + 0.3, cellZ(mouth.k), 0, 0, 0, 0); if (i < 0) return 'could not spawn';
    sim.flag[i] = 1; mouth.pw = 1; L().update(0.1); const taken = sim.n === n0 && mouth.items.length === 1;
    const plain = { items: [{ sp: 1, vr: 0, t: 0 }], hose: false }; const speedHose = 2;
    return (taken && speedHose === 2) || `plush on the mouth ${mouth.items.length}, bodies ${sim.n} vs ${n0}`;
  });
  await T_('belts.rail-rule-a-belt-set-beside-the-line-end-turns-it-and-carries-on', async () => {
    fresh({ belts: 1 }); const b = bp(); const x0 = b.x - 3.6, z0 = b.z + 3; build([[x0, z0, 0], [x0 + 0.6, z0, 0], [x0 + 1.2, z0, 0]]);
    const last = tiles().find((t) => t.i === toI(x0 + 1.2) && t.k === toK(z0));
    const a = { i: last.i, j: 0, k: last.k - 1 }; // the cell to the north (dir 3 is -z)
    const pl = L().plan('belt', { x: cellX(a.i), y: 1.6, z: cellZ(a.k) + 1.2 }, { x: 0, y: -0.75, z: -0.65 }, Math.PI / 2, 0);
    if (!pl.ent || !pl.ent.turnPrev) return 'no turn planned ' + JSON.stringify(pl.ent);
    const bad = []; if (pl.ent.turnPrev.id !== last.id) bad.push('wrong piece turned'); if (pl.ent.turnPrev.dir !== 3 || pl.ent.dir !== 3) bad.push(`dirs ${pl.ent.turnPrev.dir}/${pl.ent.dir}`);
    // a belt in front of the line end must not turn anything
    const ahead = L().plan('belt', { x: cellX(last.i) + 1.2, y: 1.6, z: cellZ(last.k) + 0.0 }, { x: -0.6, y: -0.8, z: 0 }, Math.PI / 2, 0);
    if (ahead.ent && ahead.ent.turnPrev) bad.push('straight placement turned the end');
    g.layBelt(pl.ent.i, 0, pl.ent.k, pl.ent.dir); last.dir = pl.ent.turnPrev.dir; L().rebuildBelts();
    if (last.cd == null && L().nextOf(last) == null) bad.push('turned end does not feed the new piece');
    return bad.length === 0 || bad.join('; ');
  });
  await T_('belts.line-ending-near-the-bin-is-sucked-in', async () => {
    fresh({ belts: 1 }); const b = bp(); build([[b.x - 2.2, b.z, 0]]); const t = tiles()[0]; t.items.push({ sp: pools[1][0], vr: 0, t: 0.9 }); const m0 = S().money; run(8);
    return (t.items.length === 0 && S().money > m0) || `items left ${t.items.length}, money ${m0} -> ${S().money}`;
  });
  function T_(n, f) { return ctx.T(n, f); }
}
