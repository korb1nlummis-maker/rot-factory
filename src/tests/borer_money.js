// bormoney.*: what the Tunnel Borer earns. Every plush it cuts goes through game.borerEat -> sellAuto, so the money after K cells must equal the sum of the sale prices
// of those cells: at the SORT bin, at a named bin (a Depot Beacon), for a borer a friend owns (the money is the shared pool), and for the plush a lining cube displaces.
// The borer works where no coin rings, so it keeps its own tally (e.earned, e.eatN) that its readout shows, and it says so in a toast now and then.
import * as BINS from '../bins.js';
import * as INFO from '../info.js';
export default async function (ctx) {
  const { T, g, S, w, fresh, toI, toK, cellX, cellZ } = ctx;
  const UP = { power: 1, belts: 1, borer: 1, borerSize: 2, steel: 1, timber: 1, concrete: 1, depots: 1 };
  let at = 0;
  // a powered borer facing the pile; each run uses a fresh stretch of the pile (z row) so an earlier run's tunnel is not in the way
  const run = (steps, { dist = 70, dest, own, bw = 4, bh = 4, up = {}, golden, mk } = {}) => {
    fresh({ ...UP, ...up }); S().money = 1e9; g.T.borerRate = 0.05; g.time += 1000; at += 1000;
    if (mk) dest = mk().id;
    const i = toI(dist), k = toK(10 + 12 * at / 1000); let e = { id: g.nextId(), type: 'borer', i, j: 0, k, dx: 1, dz: 0, w: bw, h: bh, x: cellX(i), y: 0, z: cellZ(k) };
    if (dest) e.dest = dest; if (own !== undefined) e.own = own;
    S().entities.push(e); g.addEntity(e); e = g.machines.items.get(e.id).ent;   // (the machine keeps its own copy of the entity)
    const ate = [], be = g.borerEat.bind(g); g.borerEat = (t, x, y, z, ent) => { ate.push([t.sp, t.vr]); return be(t, x, y, z, ent); };
    const toasts = [], t0 = g.ui.toast.bind(g.ui); g.ui.toast = (o) => { toasts.push(o); return t0(o); };
    const m0 = S().money, st0 = S().stats.plush, tot0 = S().totalEarned, vo = g.valueOf.bind(g); const prices = [];
    g.valueOf = (a, b, c) => { const r = vo(a, b, c); prices.push(r); return r; };
    if (golden) g.golden = golden;
    try {
      for (let n = 0; n < 4000 && (e.steps || 0) < steps && !e.done; n++) { for (const x of g.machines.items.values()) x.ent.pw = 1; g.time += 1; g.machines.update(1, g.time); }
    } finally { g.borerEat = be; g.valueOf = vo; g.ui.toast = t0; if (golden) g.golden = 0; }
    return { e, ate, prices, toasts, dm: S().money - m0, plush: S().stats.plush - st0, earned: S().totalEarned - tot0 };
  };
  const price = (r) => r.prices.reduce((a, b) => a + b, 0);   // every price asked is a price paid (each cell is valued once, in sellAuto)
  const beacon = () => { const b = g.hall.binPos, e = { id: g.nextId(), type: 'beacon', x: b.x + 30, y: 0, z: b.z + 8, i: toI(b.x + 30), j: 0, k: toK(b.z + 8) }; S().entities.push(e); g.addEntity(e); return e; };

  await T('bormoney.default-bin-pays-the-sum-of-the-cells', async () => {
    const r = run(8);
    if (r.ate.length < 20) return `ate only ${r.ate.length}`;
    if (r.plush !== r.ate.length) return `stats.plush ${r.plush} vs ate ${r.ate.length}`;
    if (r.dm !== r.earned) return `money ${r.dm} vs totalEarned ${r.earned}`;
    return (r.dm === price(r) && r.e.earned === r.dm && r.e.eatN === r.ate.length) || `ate ${r.ate.length} money ${r.dm} prices ${price(r)} tally ${r.e.earned}/${r.e.eatN}`;
  });
  await T('bormoney.the-plush-a-lining-cube-displaces-are-sold-too', async () => {
    const r = run(9, { bw: 3, bh: 3, up: { borerSize: 0 } });
    const frames = S().entities.filter((q) => q.type === 'frame' && q.auto).length;
    return (frames >= 2 && r.ate.length > r.e.steps * 9 && r.dm === price(r)) || `frames ${frames} ate ${r.ate.length} (bored ${r.e.steps * 9}) money ${r.dm} prices ${price(r)}`;
  });
  await T('bormoney.a-named-bin-pays-the-same-money-and-keeps-the-tally', async () => {
    let d; const r = run(8, { mk: () => (d = beacon()) }); const t = BINS.totals(g, d.id);
    return (r.ate.length > 20 && r.dm === price(r) && t.n === r.ate.length && t.v === r.dm) || `ate ${r.ate.length} money ${r.dm} prices ${price(r)} depot tally ${JSON.stringify(t)}`;
  });
  await T('bormoney.a-depot-that-does-not-work-falls-back-to-the-sort-bin-and-still-pays', async () => {
    const r = run(6, { dest: 987654 });   // a bin that is gone
    return (r.ate.length > 10 && r.dm === price(r)) || `ate ${r.ate.length} money ${r.dm} prices ${price(r)}`;
  });
  await T('bormoney.a-borer-a-friend-placed-pays-the-shared-pool', async () => {
    const was = [g.net.open, g.net.role]; g.net.open = true; g.net.role = 'host';
    const sent = g.netSend; g.netSend = () => {};
    try {
      const r = run(6, { own: 1 });
      return (r.ate.length > 10 && r.dm === price(r) && r.earned === r.dm) || `ate ${r.ate.length} money ${r.dm} prices ${price(r)} earned ${r.earned}`;
    } finally { g.net.open = was[0]; g.net.role = was[1]; if (sent) g.netSend = sent; else delete g.netSend; }
  });
  await T('bormoney.the-golden-hour-doubles-what-it-sells-like-a-hand-sale', async () => {
    const r = run(5, { golden: 60 });
    return (r.ate.length > 10 && r.dm === 2 * price(r)) || `ate ${r.ate.length} money ${r.dm} prices ${price(r)}`;
  });
  await T('bormoney.an-unpowered-borer-cuts-and-earns-nothing', async () => {
    fresh(UP); g.time += 1000; const i = toI(70), k = toK(100); let e = { id: g.nextId(), type: 'borer', i, j: 0, k, dx: 1, dz: 0, w: 4, h: 4, x: cellX(i), y: 0, z: cellZ(k) };
    S().entities.push(e); g.addEntity(e); e = g.machines.items.get(e.id).ent; const m0 = S().money;
    for (let n = 0; n < 20; n++) { for (const x of g.machines.items.values()) x.ent.pw = 0; g.time += 1; g.machines.update(1, g.time); }
    return (S().money === m0 && !e.steps) || `money ${S().money - m0} steps ${e.steps}`;
  });
  await T('bormoney.the-readout-and-a-toast-say-what-it-earned', async () => {
    const r = run(8);
    const line = (INFO.infoFor(g, { kind: 'mach', id: r.e.id }) || { lines: [] }).lines.join(' | ');
    const toast = r.toasts.find((t) => /Tunnel Borer earned/.test(t.title || ''));
    return (!!toast && r.e.earned === r.dm && line.includes(`Sold ${r.e.eatN} plush for`)) || `line ${line} toasts ${r.toasts.map((t) => t.title).join()} earned ${r.e.earned} money ${r.dm}`;
  });
}
