// mp.care.audit.*: adversarial co-op tests for Care Packages. One page plays both roles by switching g.net.role (like mp_care.js).
import * as CP from '../carepackage.js';
import * as EXT from '../ext.js';

export default async function (ctx) {
  const { T, g, S, p, fresh, V3 } = ctx;
  const FULL = { timber: 1, steel: 1, firstaid: 1, markers: 1, lantern: 1, struts: 1, jacks: 1, power: 1, belts: 1, crew: 1 };
  const json = (m) => JSON.parse(JSON.stringify(m));
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const keep = {};
  const setup = () => {
    fresh(FULL); g.careOff = false; CP.teardown(g); S().care = undefined; S().gameMin = 100; g.mode = 'play'; g.dead = false; g.ui.closeModals(); S().ending = null; S().totalEarned = 0;
    S().stats.rar = [0, 0, 0, 0, 0, 0, 0]; S().stats.maxDepth = 0; S().dex = {}; S().entities = S().entities.filter((e) => e.free);
    if (!keep.toast) keep.toast = g.ui.toast; g.ui.toast = () => {}; keep.send = g.netSend; g.netSend = () => {}; p().pos.set(0, 0, 2); g.camSky = 1;
    const C = CP.ensure(g); C.queue.length = 0; return C;
  };
  const done = () => { if (keep.toast) { g.ui.toast = keep.toast; keep.toast = null; } delete g.netSend; delete g.remote; role(null); g.net.role = undefined; g.careOff = true; CP.teardown(g); S().care = undefined; g.netOut.length = 0; g.ui.closeModals(); };
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); } });

  await guard('mp.care.audit.a-host-ignores-a-care-row-a-guest-sends', async () => {
    const C = setup(); role('host');
    const cr = g.careDebug.drop(false, { land: true, quiet: true, items: [['medkit', 2]], fx: [] });
    S().carry.length = 0; S().carry.push({ sp: 1, vr: 0 });
    const s0 = JSON.stringify([C.crates, C.claimed, C.disc, C.drone, S().carry, S().money]);
    EXT.guestRow(g, 'care', { c: [[999, 0, 0, 0, 1, 0, []]], d: [5, 0, 0, 0, 0, 0, 1, 1, 0, 0], cl: ['earn1e9'], op: ['x'], q: 50, w: 99, disc: 0.9, n: 7, p: { e: 1e30, r: [9, 9, 9, 9, 9], br: [], dp: 0, dx: 0, gen: 0 } });
    EXT.guestRow(g, 'care', { ev: 'haul' });
    const s1 = JSON.stringify([C.crates, C.claimed, C.disc, C.drone, S().carry, S().money]);
    return (s0 === s1 && S().care === C && C.crates[0].id === cr.id && !C.view) || 'the host took a guest\'s row: ' + s1.slice(0, 200);
  });

  await guard('mp.care.audit.both-players-opening-in-one-moment-hand-out-one-pack', async () => {
    const C = setup(); role('host');
    const cr = g.careDebug.drop(false, { land: true, quiet: true, items: [['medkit', 3]], fx: [['cash', 40]] }); S().items = {}; S().money = 0;
    g.remote = { pos: new V3(cr.x + 0.8, 0, cr.z) }; p().pos.set(cr.x + 0.8, 0, cr.z + 0.3);
    const a = CP.openCrate(g, cr.id, 'h'), b = CP.guestOpen(g, { id: cr.id }), c = CP.openCrate(g, cr.id, 'g');
    return (a.ok && !b.ok && !c.ok && S().items.medkit === 3 && S().money === 40 && C.count === 1 && C.crates.length === 0) || JSON.stringify([a.ok, b, c, S().items, S().money, C.count]);
  });

  await guard('mp.care.audit.a-guest-reads-bad-numbers-without-drawing-them', async () => {
    setup(); role('guest');
    const bad = [];
    const rows = [
      { c: [[1, 1e9, 0, 0, 0, 0, []]], d: null }, { c: [[1, NaN, 0, 0, 0, 0, []]], d: null }, { c: [[1, 0, 1e9, 0, 0, 0, []]], d: null },
      { c: [[1, 0, 0, 0, 0, 0, 'x']], d: null }, { c: Array.from({ length: 500 }, (_, i) => [i, 0, 0, 0, 0, 0, []]), d: null },
      { c: [], d: [1, 0, 0, 0, 1e9, 0, 0, 0, 0, 0] }, { c: [], d: [1, 0, 0, 0, 0, 0, -5, 0, 0, 0] }, { c: [], d: 'x' }, { c: 'x', d: [] },
      { cl: Array.from({ length: 5000 }, (_, i) => 'a' + i), op: [{}], q: 1e12, w: -3, disc: 'a', n: {}, p: { r: [], br: [1, 2] } },
    ];
    for (const r of rows) { try { EXT.guestRow(g, 'care', json(r)); EXT.update(g, 0.016, true); } catch (e) { bad.push('threw ' + e.message); } }
    const C = S().care;
    if (C.crates.length > 12) bad.push(C.crates.length + ' crates kept');
    if (Object.keys(C.claimed).length > 200) bad.push('claimed grew to ' + Object.keys(C.claimed).length);
    if (C.queue.length > 60) bad.push('queue ' + C.queue.length);
    return bad.length === 0 || bad.slice(0, 3).join('; ');
  });
}
