// care.audit.*: adversarial tests for Care Packages (src/carepackage.js). Each one was written to fail first against the builder's code.
// The courier sleeps in every other test (g.careOff); each test wakes it for itself and puts everything back.
import * as CP from '../carepackage.js';
import * as EXT from '../ext.js';
import { mulberry32 } from '../util.js';

export default async function (ctx) {
  const { T, g, S, w, p, fresh, V3 } = ctx;
  const FULL = { timber: 1, steel: 1, firstaid: 1, markers: 1, lantern: 1, struts: 1, jacks: 1, dynamite: 1, charges: 3, power: 1, belts: 1, hlamp: 1, crew: 1, rope: 1, claw: 1, cart: 1, truckDock: 1, bulkhead: 1 };
  const DAY = 1440;
  const stub = { toasts: [] };
  const on = (up = {}, day = 1) => {
    fresh(up); g.careOff = false; CP.teardown(g); S().care = undefined; S().gameMin = (day - 1) * DAY + 100; g.mode = 'play'; g.dead = false; g.blacking = false; g.ui.closeModals(); S().ending = null;
    p().pos.set(0, 0, 2); S().totalEarned = 0; S().stats.rar = [0, 0, 0, 0, 0, 0, 0]; S().stats.maxDepth = 0; S().stats.upgrades = 0; S().dex = {}; S().entities = S().entities.filter((e) => e.free);
    stub.toasts = []; stub.t0 = g.ui.toast; g.ui.toast = (t) => { stub.toasts.push(t); };
    g.camSky = 1; const C = CP.ensure(g); C.queue.length = 0; return C;
  };
  const done = () => {
    if (stub.t0) { g.ui.toast = stub.t0; stub.t0 = null; }
    delete g.netSend; delete g.isGuest; delete g.remote; g.net.open = false; g.net.role = undefined; g.guestReady = false;
    g.careOff = true; CP.teardown(g); S().care = undefined; g.ui.closeModals(); g.dead = false;
  };
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); } });
  const tick = (secs, dt = 0.25) => { for (let t = 0; t < secs; t += dt) { g.time += dt; CP.tick(g, dt); } };
  const json = (m) => JSON.parse(JSON.stringify(m));

  await guard('care.audit.a-guest-that-keeps-the-world-after-the-host-quits-can-still-play', async () => {
    // the guest's S.care is a picture of the host's: crates with no contents, a drone with no pack. When the host leaves, the guest's game runs the host code on it.
    on(FULL);
    g.net.open = true; g.net.role = 'guest'; g.guestReady = true;
    const row = { c: [[7, 3, 0, 3, 0, 0, []]], d: [8, 10, 0, 10, 0.5, 1.5, 6.0, 0, 0, 0], cl: ['rare'], op: [], q: 1, w: 0, disc: 0, n: 0, p: null };
    EXT.guestRow(g, 'care', json(row));
    S().care.drone.age = 2;
    g.net.open = false; g.net.role = undefined; g.guestReady = false;   // netClosed(): the same world, now run by you
    const bad = [];
    try { tick(12, 0.5); } catch (e) { bad.push('tick threw ' + e.message); }
    const C = S().care;
    if (C.drone && C.drone.id === 8) bad.push('the drone from the old host is still in the air');
    for (const c of C.crates) if (!Array.isArray(c.items) || !Array.isArray(c.fx)) bad.push('crate ' + c.id + ' has no contents');
    const ids = C.crates.map((c) => c.id);
    if (!ids.includes(7)) bad.push('the crate on the floor vanished');
    if (!ids.includes(8)) bad.push('the crate the drone was bringing never landed');
    const ns = new Set(ids); if (ns.size !== ids.length) bad.push('duplicate crate ids');
    for (const c of C.crates) { p().pos.set(c.x + 1, 0, c.z + 1); try { const r = CP.openCrate(g, c.id, 'h'); if (!r.ok && r.why !== 'full') bad.push('open ' + c.id + ' ' + r.why); } catch (e) { bad.push('open threw ' + e.message); } }
    if (!(C.n > 8)) bad.push('the id counter would hand out id ' + C.n + ' again');
    try { g.careDebug.drop(false, { land: true, quiet: true }); const q = C.crates.map((c) => c.id); if (new Set(q).size !== q.length) bad.push('a new drop reused an id'); } catch (e) { bad.push('drop threw ' + e.message); }
    return bad.length === 0 || bad.slice(0, 4).join('; ');
  });

  await guard('care.audit.a-unique-leftover-does-not-strand-the-crate', async () => {
    const C = on(FULL); S().items['cart:1'] = 1; S().items.medkit = 0;
    const cr = g.careDebug.drop(false, { land: true, quiet: true, ids: ['rare'], items: [['cart:1', 1], ['medkit', 1]], fx: [] });
    const r = CP.openCrate(g, cr.id, 'h');
    const bad = [];
    if (!(r.ok && r.empty)) bad.push(`open ok ${r.ok} empty ${r.empty}`);
    if (C.crates.length !== 0) bad.push(`${C.crates.length} crate(s) left on the floor holding ${JSON.stringify(cr.items)}`);
    if (S().items['cart:1'] !== 1) bad.push('a second wheelbarrow');
    if (C.count !== 1 || !C.opened.rare) bad.push('the milestone never counted as delivered');
    // any tier of cart counts as owning one
    S().care.crates.length = 0; S().items = { 'cart:3': 1 };
    const c2 = g.careDebug.drop(false, { land: true, quiet: true, items: [['cart:1', 1], ['flare', 2]], fx: [] }); CP.openCrate(g, c2.id, 'h');
    if (S().items['cart:1']) bad.push('gave a wheelbarrow to someone who owns a better cart');
    if (S().care.crates.length) bad.push('the crate stayed after the cart was refused');
    // a rolled pack never holds a cart for someone who already rolls one
    return bad.length === 0 || bad.join('; ');
  });

  await guard('care.audit.instant-haul-cash-respects-the-15-percent-cap', async () => {
    const C = on({}); C.rate = 1e6;
    const X = CP.rollContext(g), cap = Math.max(1, Math.floor(X.nextCost * CP.CARE.CASH_CAP));
    const vals = [];
    for (let s = 1; s <= 300; s++) for (const f of CP.rollPack(g, mulberry32(s * 31), { gold: true }).fx) if (f[0] === 'haul') vals.push(f[1]);
    if (!vals.length) return 'no Instant Haul rolled in 300 gold crates';
    const worst = Math.max(...vals);
    return (X.nextCost > 0 && worst <= cap) || `Instant Haul adds up to ${worst} on top of the sale; the cap for cash is ${cap} (15% of the cheapest upgrade, ${X.nextCost})`;
  });

  await guard('care.audit.a-narrow-tunnel-still-gets-its-crate-inside-the-tunnel', async () => {
    on(FULL);
    const sp0 = CP.findSpot(g, CP.baseFor(g), p().pos), i0 = ctx.toI(sp0.x) + 6, k0 = ctx.toK(sp0.z), W = w(), orig = W.get.bind(W);
    // the world is solid plush four rows high everywhere except a tunnel two cells wide (1.2 m): a crate (0.9 m) fits in it, a 3 by 3 footprint does not
    const inTunnel = (i, k) => (i === i0 || i === i0 + 1) && Math.abs(k - k0) <= 8;
    W.get = (i, j, k) => (j >= 0 && j < 4 && !inTunnel(i, k) ? 2 : orig(i, j, k));
    try {
      const base = { x: (ctx.cellX(i0) + ctx.cellX(i0 + 1)) / 2, y: 0, z: ctx.cellZ(k0) };
      const sp = CP.findSpot(g, base, null), i = ctx.toI(sp.x), k = ctx.toK(sp.z);
      return (inTunnel(i, k) && !sp.blocked) || `landed at cell ${i},${k} (tunnel ${i0}..${i0 + 1}, ${k0 - 8}..${k0 + 8}) blocked ${!!sp.blocked}`;
    } finally { delete W.get; }
  });

  await guard('care.audit.skipping-many-days-pays-one-scheduled-package', async () => {
    const C = on(FULL, 1); tick(3);
    const at = (d) => { S().gameMin = (d - 1) * DAY + 100; };
    at(20); tick(6); const a = C.sched + C.queue.length;   // nineteen days of sleep: one package, not six
    C.drone = null; C.crates.length = 0; C.queue.length = 0; at(21); tick(6); const b = C.sched + C.queue.length + (C.drone ? 1 : 0) - 1;   // the same window: nothing more
    C.drone = null; C.crates.length = 0; at(22); tick(6); const c = C.sched;
    return (a === 1 && C.win === 7 && b === 0 && c === 2) || `after the skip ${a} (window ${C.win}), the same window ${b} more, next window total ${c}`;
  });

  await guard('care.audit.a-long-frame-hitch-lands-the-crate-and-sends-the-drone-away', async () => {
    const C = on(FULL); const d = g.careDebug.drop(false, { quiet: true });
    g.time += 100; CP.tick(g, 100);
    return (!C.drone && C.crates.length === 1 && C.crates[0].id === d.id) || `drone ${!!C.drone} crates ${C.crates.length}`;
  });

  await guard('care.audit.a-reload-before-the-drone-leaves-cannot-reroll-the-pack', async () => {
    const C = on(FULL); const rolls = [];
    for (let n = 0; n < 3; n++) {
      const s = json(S().care), n0 = s.n; S().care = s; CP.teardown(g);
      const d = g.careDebug.drop(false, { quiet: true }); rolls.push(JSON.stringify([d.pack, d.gold])); s.drone = null; s.crates.length = 0; s.n = n0;   // (the same save, loaded again)
    }
    return (new Set(rolls).size === 1) || 'three loads of one save gave ' + new Set(rolls).size + ' different packs: ' + rolls.join(' | ').slice(0, 500);
  });

  await guard('care.audit.the-log-fits-a-phone-panel', async () => {
    on(FULL); const C = S().care; C.claimed.rare = 1; C.opened.earn1000 = 1; C.claimed.earn1000 = 1; C.queue.push({ k: 'ms' }, { k: 'ms' });
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-5000px;top:0;width:280px;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:10px;overflow:visible';
    document.body.appendChild(host);
    try {
      const el = CP.renderLog(g, host);
      const wide = el.scrollWidth - 280, over = [...el.querySelectorAll('.ac')].filter((c) => c.scrollWidth > c.clientWidth + 1).length;
      const rows = el.querySelectorAll('.ac').length;
      return (wide <= 1 && over === 0 && rows === CP.MILESTONES.length) || `the log is ${el.scrollWidth}px wide in a 280px panel, ${over} cards overflow, ${rows} rows`;
    } finally { host.remove(); }
  });

  await guard('care.audit.nothing-piles-up-over-many-deliveries', async () => {
    const C = on(FULL); const root0 = g.renderer.scene.children.length;
    for (let n = 0; n < 40; n++) {
      const d = g.careDebug.drop(n % 5 === 0, { quiet: true }); tick(CP.FLIGHT.end + 1, 0.5);
      const c = C.crates.find((x) => x.id === d.id); if (c) CP.openCrate(g, c.id, 'h'); for (const x of C.crates.slice()) CP.openCrate(g, x.id, 'h');
      S().items = {}; C.crates.length = 0; tick(1);
    }
    const rt = g._care;
    return (g.renderer.scene.children.length <= root0 && !rt.view && rt.armed.size === 0 && rt.cool.size === 0 && rt.hinted.size === 0) || `scene ${root0}->${g.renderer.scene.children.length}, view ${!!rt.view}, armed ${rt.armed.size}, cool ${rt.cool.size}, hinted ${rt.hinted.size}`;
  });
}
