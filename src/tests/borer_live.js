// borlive.*: an upgrade reaches the Tunnel Borers that are already running (Cutter Head: the wait for the next slab rescales; Wide Bore: the bore grows from the next slab, never shrinks).
export default async function (ctx) {
  const { T, g, S, fresh, toI, toK, cellX, cellZ } = ctx;
  const UP = { power: 1, belts: 1, borer: 1, steel: 1, timber: 1, concrete: 1 };
  const place = (k0) => {
    fresh({ ...UP }); S().money = 1e9; g.time += 1000;
    const i = toI(70), k = toK(k0); let e = { id: g.nextId(), type: 'borer', i, j: 0, k, dx: 1, dz: 0, w: 2, h: 3, x: cellX(i), y: 0, z: cellZ(k) };
    S().entities.push(e); g.addEntity(e); return g.machines.items.get(e.id);
  };
  const step = (n) => { for (let q = 0; q < n; q++) { for (const x of g.machines.items.values()) x.ent.pw = 1; g.time += 1; g.machines.update(1, g.time); } };
  await T('borlive.wide-bore-grows-a-running-borer-and-never-shrinks-it', async () => {
    const it = place(20), e = it.ent; g.T.borerRate = 0.05; step(60);
    if (!(e.steps >= 1)) return 'the borer did not start: steps ' + e.steps;
    if (!(e.w === 2 && e.h === 3)) return `placed at ${e.w}x${e.h}`;
    S().up.borerSize = 2; g.T = g.tune(); g.T.borerRate = 0.05; step(40);
    const bad = [];
    if (!(e.w >= g.T.borerW && e.h >= g.T.borerH && e.w >= 5)) bad.push(`still ${e.w}x${e.h} after Wide Bore (${g.T.borerW}x${g.T.borerH})`);
    if (!(it.obj.scale.x > 1.5)) bad.push('the model did not grow: ' + it.obj.scale.x);
    const w1 = e.w; S().up.borerSize = 0; g.T = g.tune(); g.T.borerRate = 0.05; step(5); if (e.w !== w1) bad.push('the bore shrank to ' + e.w);
    return bad.length === 0 || bad.join('; ');
  });
  await T('borlive.cutter-head-speeds-up-the-wait-of-a-running-borer', async () => {
    const it = place(32), e = it.ent; g.T.borerRate = 12; step(1); it.timer = 10; it.rateSeen = 12;
    S().up.borerSpeed = 6; g.T = g.tune(); const r = g.T.borerRate; if (!(r < 12)) return 'no faster cutter at Cutter Head 6: ' + r;
    g.machines.updateBorer(it, 0.0001, g.time);
    return (it.timer < 10 * r / 12 + 0.01 && it.timer > 0) || `timer ${it.timer} (wanted about ${10 * r / 12})`;
  });
}
