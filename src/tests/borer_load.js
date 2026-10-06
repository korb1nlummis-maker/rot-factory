export default async function (ctx) {
  const { T, g, S, w, fresh, toI, toK, cellX, cellZ } = ctx;
  const runBorer = (dist, up) => {
    fresh({ power: 1, belts: 1, borer: 1, borerSize: 2, steel: 1, timber: 1, concrete: 1, ...up }); S().money = 1e12; g.T.borerRate = 0.05;
    const i = toI(dist), k = toK(10); const e = { id: g.nextId(), type: 'borer', i, j: 0, k, dx: 1, dz: 0, w: 4, h: 4, x: cellX(i), y: 0, z: cellZ(k) };
    S().entities.push(e); g.addEntity(e); const it = g.machines.items.get(e.id);
    for (let n = 0; n < 6000 && !e.done && S().entities.filter((q) => q.type === 'frame' && q.auto).length < 12; n++) { for (const x of g.machines.items.values()) x.ent.pw = 1; g.time += 1; g.machines.update(1, g.time); }
    return { e, it, linings: S().entities.filter((q) => q.type === 'frame' && q.auto).map((q) => q.kind) };
  };
  await T('machines.borer-lines-with-concrete-where-it-holds', async () => { const r = runBorer(60, {}); return (r.linings.length > 3 && r.linings.every((k) => k === 'concrete')) || 'linings ' + r.linings.join(); });
  await T('machines.borer-stops-where-no-lining-would-hold', async () => { const r = runBorer(2200, {}); return (r.e.done === true && r.linings.length < 12) || `done ${r.e.done} linings ${r.linings.join()}`; });
  await T('machines.borer-switches-to-a-stronger-tier-when-concrete-would-buckle', async () => {
    const r = runBorer(2200, { rebar: 1, titan: 1 }); const L = r.linings; const first = L.findIndex((k) => k !== 'concrete');
    return (first > 0 && L.slice(first).every((k) => k === 'rebar' || k === 'titan') && L.slice(first).length >= 4) || 'linings ' + L.join() + ' done ' + r.e.done;
  });
}
