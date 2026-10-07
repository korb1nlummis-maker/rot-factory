// bins.portal.*: a Portal credits what it cuts to its own bin (the same slab, the same money), and a bin that is dark or gone sends it back to the nearest. Run: `await __selftest('bins.portal.')`
import { makeKit, UP, PORTAL } from './portal_lib.js';
import * as BINS from '../bins.js';

export default async function (ctx) {
  const { T, g, S, fresh, newWorld, toI, toK, cellX, cellZ } = ctx;
  const K = makeKit(ctx);
  const world = async () => { await newWorld(); fresh(UP); S().money = 1e12; S().binStats = {}; g._binSaid = new Map(); g.surgeT = 1e9; K.fast(); };
  const beacon = (x, z) => { const e = { id: g.nextId(), type: 'beacon', x, y: 0, z, i: toI(x), j: 0, k: toK(z) }; S().entities.push(e); g.addEntity(e); return g.machines.items.get(e.id).ent; };
  const sold = (id) => BINS.today(g, id);

  await T('bins.portal.a-portal-credits-its-cuttings-to-its-own-bin-and-the-nearest-on-auto', async () => {
    await world(); const bad = [], st = K.site({ span: 6 }), e = K.mouth(st, 'steel'); if (!PORTAL.isPortal(e)) return 'the mouth arch is not a Portal';
    const d = beacon(cellX(st.i0) - 30, cellZ(st.k0) + 60);
    // Auto: the nearest bin to the Portal (this one is nowhere near the depot)
    const near = BINS.nearest(g, e.cx, e.cz).id; if (!K.until(() => e.adv >= 2, 90)) return 'it never bored: ' + e.ps;
    if (!(sold(near).n > 0)) bad.push(`Auto: nothing counted at the nearest bin (${near}): ${JSON.stringify(S().binStats)}`);
    // its own bin
    const n0 = sold(d.id).n, m0 = S().money; g.setCfg(e, { dest: d.id }); if (!K.until(() => e.adv >= 4, 90)) return 'it stopped boring: ' + e.ps;
    if (!(sold(d.id).n > n0)) bad.push('nothing counted at its depot: ' + JSON.stringify(S().binStats)); if (!(S().money > m0)) bad.push('it was not paid');
    // the same cuttings are worth the same: two slabs sold at the depot pay what two slabs sold at the nearest bin did, per plush
    const perPlush = (id) => { const t = BINS.totals(g, id); return t.n ? t.v / t.n : 0; }; if (sold(near).n && sold(d.id).n && Math.abs(perPlush(near) - perPlush(d.id)) > perPlush(near) * 0.5) bad.push(`price per plush differs a lot: ${perPlush(near)} vs ${perPlush(d.id)}`);
    // dark: the nearest again, and it says so
    const toasts = []; const t0 = g.ui.toast.bind(g.ui); g.ui.toast = (o) => { toasts.push(o.title + ' | ' + (o.text || '')); return t0(o); };
    try {
      const keep = d.pw; d.off = true; const a = sold(near).n; const run0 = K.run; void run0; void keep;
      // the kit powers every machine that is not parked: park the depot's power by a stepper of our own
      for (let q = 0; q < 900 && e.adv < 7; q++) { for (const it of g.machines.items.values()) it.ent.pw = it.ent.id === d.id ? 0 : 1; for (const t of g.logi.tiles.values()) t.pw = 1; g.time += 0.1; PORTAL.tick(g, 0.1); }
      if (!(sold(near).n > a)) bad.push('with its depot dark the Portal did not sell at the nearest bin');
      if (!toasts.some((t) => /Portal: Depot A has no power, so it uses Auto/.test(t))) bad.push('no message: ' + toasts);
    } finally { g.ui.toast = t0; }
    if (e.dest !== d.id) bad.push('the assignment must stay while the depot is only dark');
    return bad.length === 0 || bad.join(' || ');
  });
}
