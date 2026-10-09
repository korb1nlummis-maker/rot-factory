// care.*: Care Packages (src/carepackage.js): the schedule, the milestones, what is in a crate, where it lands, opening, saving, the log, the cost.
// The courier drone sleeps in every other test (selftest.js sets g.careOff); each test here wakes it for itself and puts everything back.
import * as CP from '../carepackage.js';
import { NEEDLE, species, speciesCount } from '../plushdata.js';
import { mulberry32 } from '../util.js';

export default async function (ctx) {
  const { T, g, S, w, p, fresh, tune, V3 } = ctx;
  const FULL = { timber: 1, steel: 1, firstaid: 1, markers: 1, lantern: 1, struts: 1, jacks: 1, dynamite: 1, charges: 3, power: 1, belts: 1, hlamp: 1, crew: 1, rope: 1, claw: 1, cart: 1, truckDock: 1, bulkhead: 1 };
  const DAY = 1440;
  const at = (day, minute = 100) => { S().gameMin = (day - 1) * DAY + minute; };
  const stub = { toasts: [], sent: [] };
  // wake the drone on a clean S.care; everything it did is undone by `done`
  const on = (up = {}, day = 1, keepQueue = false) => {
    fresh(up); g.careOff = false; CP.teardown(g); S().care = undefined; at(day); g.mode = 'play'; g.dead = false; g.blacking = false; g.ui.closeModals(); S().ending = null;
    p().pos.set(0, 0, 2); S().totalEarned = 0; S().stats.rar = [0, 0, 0, 0, 0, 0, 0]; S().stats.maxDepth = 0; S().stats.upgrades = 0; S().dex = {}; S().entities = S().entities.filter((e) => e.free);
    stub.toasts = []; stub.sent = []; const t0 = g.ui.toast; g.ui.toast = (t) => { stub.toasts.push(t); }; stub._toast = t0; stub._send = g.netSend; g.netSend = (m) => { stub.sent.push(JSON.parse(JSON.stringify(m))); };
    g.camSky = 1; const C = CP.ensure(g); if (!keepQueue) C.queue.length = 0; return C;   // (a game that starts with upgrades already bought has met their milestones: that backlog crate is its own test)
  };
  const done = () => { if (stub._toast) { g.ui.toast = stub._toast; stub._toast = null; } delete g.netSend; if (stub._send) stub._send = null; g.careOff = true; CP.teardown(g); S().care = undefined; g.coverDepth = Object.getPrototypeOf(g).coverDepth; delete g.isGuest; delete g.remote; g.ui.closeModals(); g.dead = false; };
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); } });
  const tick = (secs, dt = 0.25) => { for (let t = 0; t < secs; t += dt) { g.time += dt; CP.tick(g, dt); } };
  const land = () => { const C = S().care; C.drone = null; };
  const queueOf = (C) => C.queue.length + (C.drone ? 1 : 0) + C.crates.length;

  await guard('care.schedule-delivers-once-per-three-day-window', async () => {
    const C = on(FULL, 1); const sent = [];
    for (let d = 1; d <= 12; d++) {
      at(d, 100); tick(6); sent.push(C.sched);
      tick(20); C.drone = null; C.crates.length = 0; C.queue.length = 0;   // (nothing else delivers: clear the floor and the queue for the next window)
      at(d, 400); tick(6); C.drone = null; C.crates.length = 0; C.queue.length = 0;
    }
    // windows: days 1-3, 4-6, 7-9, 10-12. The game began in window 0, so the packages arrive at the start of windows 1, 2 and 3 (days 4, 7, 10), exactly once each
    return (C.sched === 3 && sent.join() === '0,0,0,1,1,1,2,2,2,3,3,3') || `delivered ${C.sched}: ${sent.join()}`;
  });
  await guard('care.schedule-waits-for-an-open-warehouse-a-live-player-and-no-menu', async () => {
    const C = on(FULL, 1);
    at(4, 100); g.dead = true; tick(6); const dead = C.sched + queueOf(C);
    g.dead = false; g.ui.open('journal'); tick(6); const menu = C.sched + queueOf(C); g.ui.closeModals();
    at(4, 800); tick(6); const closed = C.sched + queueOf(C);   // 20:00: the warehouse is shut
    g.mode = 'title'; at(4, 100); tick(6); const title = C.sched + queueOf(C); g.mode = 'play';
    const before = C.win; tick(6); const after = C.sched;
    return (dead === 0 && menu === 0 && closed === 0 && title === 0 && before === 0 && after === 1 && C.win === 1) || `dead ${dead} menu ${menu} closed ${closed} title ${title}; win ${before}->${C.win}, delivered ${after}`;
  });
  await guard('care.every-milestone-fires-once-and-is-saved', async () => {
    const C = on({}, 1);
    const set = {
      earn1000: () => { S().totalEarned = 1e3; }, earn10000: () => { S().totalEarned = 1e4; }, earn100000: () => { S().totalEarned = 1e5; }, earn1000000: () => { S().totalEarned = 1e6; }, earn10000000: () => { S().totalEarned = 1e7; },
      earn100000000: () => { S().totalEarned = 1e8; }, earn1000000000: () => { S().totalEarned = 1e9; },
      rare: () => { S().stats.rar[2] = 1; }, epic: () => { S().stats.rar[3] = 1; }, legend: () => { S().stats.rar[4] = 1; },
      gen1: () => { S().entities.push({ id: 9990001, type: 'gen', i: 1, j: 0, k: 1 }); },
      depth50: () => { S().stats.maxDepth = 50; }, depth100: () => { S().stats.maxDepth = 100; }, depth200: () => { S().stats.maxDepth = 200; },
    };
    for (const pct of [10, 25, 50, 75, 100]) set['dex' + pct] = () => { const n = Math.ceil(speciesCount * pct / 100); S().dex = {}; for (let q = 1; q <= n; q++) S().dex[q] = 1; };
    const branches = CP.MILESTONES.filter((m) => m.id.startsWith('br_'));
    const catOf = (id) => id.slice(3);
    for (const m of branches) set[m.id] = () => { const u = ctx.UPGRADES.find((x) => x.cat === catOf(m.id)); S().up[u.id] = 1; };
    const ids = CP.MILESTONES.map((m) => m.id), miss = ids.filter((id) => !set[id]);
    if (miss.length) return 'no trigger for ' + miss.join();
    const bad = [];
    for (const id of ids) {
      C.queue.length = 0; C.crates.length = 0; C.drone = null;
      set[id](); CP.tick(g, 0.01); g._care.pt = 0; CP.tick(g, 0.01);
      const hit = C.queue.filter((q) => (q.ids || []).includes(id)).length + C.crates.filter((c) => c.ms.includes(id)).length + (C.drone && C.drone.ms.includes(id) ? 1 : 0);
      if (!C.claimed[id]) bad.push(id + ' not claimed');
      else if (hit !== 1) bad.push(`${id} produced ${hit}`);
      g._care.pt = 0; CP.tick(g, 0.01); g._care.pt = 0; CP.tick(g, 0.01);   // asking again must not pay again
      const again = C.queue.filter((q) => (q.ids || []).includes(id)).length + C.crates.filter((c) => c.ms.includes(id)).length + (C.drone && C.drone.ms.includes(id) ? 1 : 0);
      if (again !== 1) bad.push(`${id} paid ${again} times`);
    }
    const copy = JSON.parse(JSON.stringify(S().care)); S().care = copy; CP.teardown(g); CP.tick(g, 0.01); g._care.pt = 0; CP.tick(g, 0.01);
    const n1 = copy.queue.length + copy.crates.length;
    for (const id of ids) if (!copy.claimed[id]) bad.push(id + ' lost in the save');
    return bad.length === 0 ? (n1 >= 0 || true) : bad.slice(0, 6).join('; ');
  });
  await guard('care.a-save-that-already-met-milestones-gets-one-gold-backlog-crate', async () => {
    fresh(FULL); g.careOff = false; CP.teardown(g); S().care = undefined; S().totalEarned = 2e5; S().stats.rar = [0, 0, 1, 0, 0, 0, 0]; at(1);
    const C = CP.ensure(g);
    return (C.queue.length === 1 && C.queue[0].big && C.queue[0].ids.includes('earn1000') && C.queue[0].ids.includes('earn100000') && C.queue[0].ids.includes('rare') && !C.claimed.earn1000000) || JSON.stringify(C.queue).slice(0, 200);
  });

  await guard('care.contents-follow-the-unlocks-and-never-hold-the-needle', async () => {
    on({}); const X0 = []; let kinds0 = new Set();
    for (let s = 1; s <= 60; s++) { const r = CP.rollPack(g, mulberry32(s), { gold: s % 2 === 0 }); for (const [id] of r.items) kinds0.add(id); for (const f of r.fx) X0.push(f[0]); }
    const noUp = [...kinds0].filter((id) => id !== 'claw');
    if (noUp.length) return 'with no upgrades the crate held ' + noUp.join();
    on(FULL); const seen = new Set(), recs = new Set(ctx.recipes(g).map((r) => r.id)), bad = [];
    for (let s = 1; s <= 400; s++) {
      const r = CP.rollPack(g, mulberry32(s * 7919), { gold: s % 4 === 0 });
      const n = r.items.length + r.fx.filter((f) => f[0] !== 'haul' && f[0] !== 'disc').length;
      for (const [id, q] of r.items) {
        seen.add(id);
        if (typeof id !== 'string' || /needle|one|^\d+$/i.test(id) || id === String(NEEDLE)) bad.push('needle-like ' + id);
        if (!recs.has(id)) bad.push(`${id} is not unlocked`);
        if (!(q >= 1 && q <= CP.capOf(id))) bad.push(`${id} x${q} beyond its cap`);
      }
      if (!(n >= 3 && n <= (r.gold ? 7 : 5))) bad.push(`${n} entries in a ${r.gold ? 'gold' : 'plain'} crate`);
      if (new Set(r.items.map((a) => a[0])).size !== r.items.length) bad.push('duplicate id');
    }
    for (const id of ['medkit', 'flare', 'glow', 'lantern', 'cable', 'belt', 'strut', 'jack', 'dynamite']) if (!seen.has(id)) bad.push('never rolled ' + id);
    return bad.length === 0 || bad.slice(0, 5).join('; ');
  });
  await guard('care.a-crate-never-goes-past-a-stack-cap-and-keeps-what-does-not-fit', async () => {
    const C = on(FULL); const cr = g.careDebug.drop(false, { land: true, items: [['medkit', 10], ['flare', 5], ['belt', 50]], fx: [] });
    S().items.medkit = 95; S().items.belt = 400; S().items.flare = 0;
    const r = CP.openCrate(g, cr.id, 'h');
    const it = S().items;
    return (r.ok && !r.empty && it.medkit === 99 && it.flare === 5 && it.belt === 400 && cr.items.length === 2 && cr.items.find((a) => a[0] === 'medkit')[1] === 6 && cr.items.find((a) => a[0] === 'belt')[1] === 50 && C.crates.length === 1) || JSON.stringify([r.ok, r.empty, it, cr.items]);
  });
  await guard('care.a-crate-with-nothing-that-fits-stays-shut', async () => {
    const C = on(FULL); const cr = g.careDebug.drop(false, { land: true, items: [['medkit', 4]], fx: [] }); S().items.medkit = 99;
    const r = CP.openCrate(g, cr.id, 'h');
    return (!r.ok && r.why === 'full' && C.crates.length === 1 && S().items.medkit === 99 && C.count === 0) || JSON.stringify(r);
  });
  await guard('care.a-unique-item-is-never-given-twice', async () => {
    const C = on(FULL); S().items['cart:1'] = 1;
    const X = []; for (let s = 1; s <= 200; s++) for (const [id] of CP.rollPack(g, mulberry32(s)).items) X.push(id);
    const cr = g.careDebug.drop(false, { land: true, items: [['cart:1', 1], ['medkit', 1]], fx: [] }); const r = CP.openCrate(g, cr.id, 'h');
    return (!X.includes('cart:1') && S().items['cart:1'] === 1 && S().items.medkit === 1 && cr.items.length === 0 && r.ok && C.crates.length === 0) || JSON.stringify([X.includes('cart:1'), S().items, cr.items, r.ok]);
  });
  await guard('care.cash-is-minutes-of-income-and-at-most-15-percent-of-the-next-upgrade', async () => {
    const C = on(FULL); const X = CP.rollContext(g), cash = (rate, next, gold = false, n = 300) => { X.rate = rate; X.nextCost = next; const v = []; for (let s = 1; s <= n; s++) for (const [k, q] of CP.rollPack(g, mulberry32(s + 99), { gold, X }).fx) if (k === 'cash') v.push(q); return v; };
    const bad = [], a = cash(40, 1e12), b = cash(500, 1000), c = cash(0.01, 1e12), d = cash(40, 1e12, true);
    if (!(Math.min(...a) >= 40 * 120 - 1 && Math.max(...a) <= 40 * 300)) bad.push(`plain cash ${Math.min(...a)}..${Math.max(...a)} is not 2 to 5 minutes of 40/s`);
    if (!(Math.max(...b) <= 150)) bad.push(`cash ${Math.max(...b)} beyond 15% of 1000`);
    if (!(Math.min(...c) >= 12)) bad.push(`a tiny income paid ${Math.min(...c)}`);
    if (!(Math.max(...d) <= 40 * 300 * 1.8 && Math.max(...d) > 40 * 300)) bad.push(`gold cash ${Math.max(...d)}`);
    const real = CP.rollContext(g); if (!(real.nextCost > 0)) bad.push('no next upgrade price');
    return bad.length === 0 || bad.join('; ');
  });
  await guard('care.gold-crate-odds-are-one-in-eight-and-big-milestones-are-always-gold', async () => {
    on(FULL); let gold = 0, N = 6000, bigGold = 0, rare = 0;
    for (let s = 1; s <= N; s++) { if (CP.rollPack(g, mulberry32(s * 31 + 7)).gold) gold++; }
    for (let s = 1; s <= 200; s++) { const r = CP.rollPack(g, mulberry32(s), { big: true }); if (r.gold) bigGold++; if (r.fx.some((f) => ['haul', 'disc', 'bat'].includes(f[0])) || r.items.some((a) => a[0] === 'claw')) rare++; }
    const pct = gold / N;
    return (pct > 0.1 && pct < 0.15 && bigGold === 200 && rare === 200) || `gold ${(pct * 100).toFixed(1)}%, big gold ${bigGold}/200, with a rare thing ${rare}/200`;
  });
  await guard('care.a-gold-crate-holds-more-than-a-plain-one', async () => {
    on({ ...FULL }); S().totalEarned = 1e6; let g1 = 0, p1 = 0, n = 150;
    for (let s = 1; s <= n; s++) { const a = CP.rollPack(g, mulberry32(s), { gold: true }), b = CP.rollPack(g, mulberry32(s), { gold: false }); g1 += a.items.reduce((t, x) => t + x[1], 0) + a.fx.length; p1 += b.items.reduce((t, x) => t + x[1], 0) + b.fx.length; }
    return g1 > p1 * 1.4 || `gold ${g1} plain ${p1}`;
  });
  await guard('care.rare-things-do-what-they-say', async () => {
    const C = on({ ...FULL, crew: 1 }); S().crew = [{ id: 1, battery: 0.1 }, { id: 2, battery: 0.4 }]; S().money = 100; S().carry = [];
    const a = g.careDebug.drop(true, { land: true, items: [], fx: [['bat', 1]] }); CP.openCrate(g, a.id, 'h'); const bat = S().crew.every((b) => b.battery === 1);
    const d = g.careDebug.drop(true, { land: true, items: [], fx: [['disc', 0.1]] }); CP.openCrate(g, d.id, 'h'); const disc = C.disc === 0.1;
    const cost = ctx.UPGRADES.find((u) => u.id === 'reach').cost[0]; S().money = 1e9; const m0 = S().money; S().up = { ...FULL }; delete S().up.reach; g.buy('reach'); const paid = m0 - S().money;
    const second = (() => { const m1 = S().money; g.buy('reach'); return m1 - S().money; })();
    S().crew = []; const h = g.careDebug.drop(true, { land: true, items: [], fx: [['haul', 25]] }); const m2 = S().money; CP.openCrate(g, h.id, 'h');
    return (bat && disc && paid === Math.round(cost * 0.9) && C.disc === 0 && second === ctx.UPGRADES.find((u) => u.id === 'reach').cost[1] && S().money === m2 + 25) || JSON.stringify({ bat, disc, paid, cost: cost * 0.9, second, d: C.disc });
  });

  await guard('care.it-lands-on-clear-floor-near-the-bin', async () => {
    on(FULL); const bp = g.hall.binPos, bad = [];
    for (let n = 0; n < 12; n++) {
      const sp = CP.findSpot(g, CP.baseFor(g), p().pos);
      const d = Math.hypot(sp.x - bp.x, sp.z - bp.z);
      if (sp.blocked) bad.push('blocked');
      if (d > 14) bad.push(`${d.toFixed(1)} m from the bin`);
      if (d < 1.9) bad.push('on the bin');
      for (const c of g.hall.colliders) if (Math.hypot(sp.x - c.x, sp.z - c.z) < (c.r || 1)) bad.push('inside a collider');
      const i = ctx.toI(sp.x), k = ctx.toK(sp.z); for (let j = 0; j < 4; j++) if (w().get(i, j, k) !== 0) bad.push('inside plush at row ' + j);
      S().care.crates.push({ id: 100 + n, x: sp.x, y: sp.y, z: sp.z, gold: 0, items: [], fx: [], ms: [], wait: 0 });   // (the next one must pick another spot)
    }
    const xs = new Set(S().care.crates.map((c) => c.x.toFixed(1) + ',' + c.z.toFixed(1)));
    return (bad.length === 0 && xs.size === 12) || bad.slice(0, 4).join('; ') + ' distinct ' + xs.size;
  });
  await guard('care.it-never-lands-inside-plush-or-a-wall', async () => {
    on(FULL); const sp0 = CP.findSpot(g, CP.baseFor(g), p().pos), i0 = ctx.toI(sp0.x), k0 = ctx.toK(sp0.z), cells = [];
    for (let di = -3; di <= 3; di++) for (let dk = -3; dk <= 3; dk++) for (let j = 0; j < 4; j++) { const c = [i0 + di, j, k0 + dk]; if (w().get(...c) === 0) { w().setCell(c[0], c[1], c[2], 2, 0); cells.push(c); } }
    try {
      const sp = CP.findSpot(g, CP.baseFor(g), p().pos), i = ctx.toI(sp.x), k = ctx.toK(sp.z);
      let hit = 0; for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) for (let j = 0; j < 4; j++) if (w().get(i + di, j, k + dk) !== 0) hit++;
      return (hit === 0 && Math.hypot(sp.x - sp0.x, sp.z - sp0.z) > 3 && !sp.blocked) || `${hit} cells in the way, moved ${Math.hypot(sp.x - sp0.x, sp.z - sp0.z).toFixed(1)} m`;
    } finally { for (const c of cells) w().setCell(c[0], c[1], c[2], 0, 0); }
  });
  await guard('care.deep-underground-the-drone-waits-at-the-bin-and-says-so', async () => {
    const C = on(FULL); const bp = g.hall.binPos;
    p().pos.set(200, 0, 40); g.coverDepth = () => 30;   // under a roof, 200 m from the hall
    const d = g.careDebug.drop(false, {}); const wait = d.wait, far = Math.hypot(d.tx - bp.x, d.tz - bp.z);
    const inbound = stub.toasts.some((t) => /inbound/.test(t.title));
    d.age = 20; CP.tick(g, 0.1);
    const t = stub.toasts.find((x) => /waiting at the bin/.test(x.title));
    return (wait === 1 && far < 14 && !inbound && !!t && C.crates.length === 1 && C.crates[0].wait === 1 && stub.sent.some((m) => m.t === 'toast' && /waiting/.test(m.title))) || JSON.stringify({ wait, far, inbound, toasts: stub.toasts.map((x) => x.title) });
  });
  await guard('care.near-the-hall-it-flies-and-says-so', async () => {
    const C = on(FULL); p().pos.set(0, 0, 2); const d = g.careDebug.drop(false, {});
    const t0 = stub.toasts.length; d.age = 5; CP.tick(g, 0.1); const mid = C.drone && !C.drone.released && C.crates.length === 0;
    d.age = CP.FLIGHT.release - 0.05; CP.tick(g, 0.2);
    return (d.wait === 0 && t0 === 1 && /inbound/.test(stub.toasts[0].title) && mid && C.crates.length === 1 && /landed/.test(stub.toasts[1].title) && /press E|walk into/i.test(stub.toasts[1].text)) || JSON.stringify(stub.toasts.map((x) => x.title));
  });
  await guard('care.a-crate-opens-once-and-only_once', async () => {
    const C = on(FULL); const cr = g.careDebug.drop(false, { land: true, items: [['medkit', 2]], fx: [['cash', 40]] }); S().money = 0; S().items = {};
    const a = CP.openCrate(g, cr.id, 'h'), b = CP.openCrate(g, cr.id, 'h');
    return (a.ok && a.empty && !b.ok && b.why === 'gone' && S().items.medkit === 2 && S().money === 40 && C.crates.length === 0 && C.count === 1) || JSON.stringify([a.ok, b, S().items, S().money]);
  });
  await guard('care.e-on-the-crate-opens-it-and-walking-into-it-does-too', async () => {
    const C = on(FULL); const cr = g.careDebug.drop(false, { land: true, items: [['medkit', 2]], fx: [] });
    p().pos.set(cr.x + 1.2, 0, cr.z + 1.2); p().yaw = Math.atan2(cr.x - p().pos.x, cr.z - p().pos.z); p().pitch = -0.2;
    S().items = {}; const hit = CP.useKey(g); const e = S().items.medkit === 2 && C.crates.length === 0;
    const c2 = g.careDebug.drop(false, { land: true, items: [['flare', 3]], fx: [] }); p().pos.set(c2.x + 5, 0, c2.z); tick(0.6, 0.1); const armed = g._care.armed.get(c2.id) === true && C.crates.length === 1;
    p().pos.set(c2.x + 0.5, 0, c2.z); tick(0.5, 0.1);
    return (hit && e && armed && C.crates.length === 0 && S().items.flare === 3) || JSON.stringify([hit, e, armed, C.crates.length, S().items]);
  });
  await guard('care.a-crate-that-lands-under-your-feet-waits-until-you-step-off', async () => {
    const C = on(FULL); const cr = g.careDebug.drop(false, { land: true, items: [['flare', 3]], fx: [] }); p().pos.set(cr.x, 0, cr.z); tick(1, 0.1);
    const stayed = C.crates.length === 1; p().pos.set(cr.x + 4, 0, cr.z); tick(0.5, 0.1); p().pos.set(cr.x, 0, cr.z); tick(0.5, 0.1);
    return (stayed && C.crates.length === 0) || `stayed ${stayed}, left ${C.crates.length}`;
  });
  await guard('care.save-and-load-with-a-crate-on-the-ground-and-a-drone-in-flight', async () => {
    const C = on(FULL); const a = g.careDebug.drop(true, { land: true, items: [['medkit', 2]], fx: [['cash', 7]] }); const d = g.careDebug.drop(false, {}); d.age = 3;
    const sch = JSON.stringify({ win: C.win, claimed: C.claimed, queue: C.queue });
    const raw = JSON.parse(JSON.stringify(S().care)); S().care = raw; CP.teardown(g); tick(0.5, 0.1);
    const C2 = S().care, ids = C2.crates.map((c) => c.id).sort().join(), ok1 = C2.crates.length === 2 && !C2.drone && ids === [a.id, d.id].sort().join();
    const landed = C2.crates.find((c) => c.id === d.id), same = landed && Math.abs(landed.x - d.tx) < 1e-6 && landed.items.length === d.pack.items.length;
    const view = g.renderer.scene.getObjectByName('carepackages'), crates = view ? view.children.length : 0;
    CP.openCrate(g, a.id, 'h');
    return (ok1 && same && crates === 2 && C2.crates.length === 1 && JSON.stringify({ win: C2.win, claimed: C2.claimed, queue: C2.queue }) === sch) || JSON.stringify([ok1, same, crates, C2.crates.length]);
  });
  await guard('care.the-real-save-round-trip-keeps-the-schedule', async () => {
    const C = on(FULL, 5); C.win = 1; C.claimed.rare = 1; C.disc = 0.1; g.careDebug.drop(false, { land: true });
    const s = JSON.parse(JSON.stringify({ S: S() })).S.care;
    return (s.win === 1 && s.claimed.rare === 1 && s.disc === 0.1 && s.crates.length === 1 && Array.isArray(s.queue)) || JSON.stringify(s).slice(0, 200);
  });

  await guard('care.the-log-lists-delivered-waiting-and-upcoming', async () => {
    const C = on({}); C.claimed.rare = 1; C.claimed.epic = 1; C.opened.rare = 1; S().totalEarned = 400;
    const host = document.createElement('div'); const el = CP.renderLog(g, host); const t = el.textContent;
    const rows = CP.logRows(g), by = (st) => rows.filter((r) => r.state === st).map((r) => r.id);
    const ach = (g.ui.renderAch(), document.getElementById('achGrid')); const inAch = !!ach.querySelector('#careLog');
    ach.querySelector('#careLog') && ach.querySelector('#careLog').remove();
    return (by('delivered').join() === 'rare' && by('waiting').join() === 'epic' && by('upcoming').length === rows.length - 2 && /DELIVERED \(1\)/.test(t) && /WAITING \(1\)/.test(t) && /UPCOMING/.test(t) && /Earn ◈ 1,000/.test(t) && /400 of 1,000/.test(t) && /next: day 4/.test(t) && inAch && rows.find((r) => r.id === 'earn1000').pct === 0.4) || JSON.stringify({ d: by('delivered'), w: by('waiting'), inAch, t: t.slice(0, 160) });
  });
  await guard('care.the-compass-marks-crates-and-nothing-else', async () => {
    const C = on(FULL); const none = CP.markers(g, p().pos).length; const cr = g.careDebug.drop(true, { land: true }); const m = CP.markers(g, p().pos);
    return (none === 0 && m.length === 1 && m[0].label === 'GOLD' && Number.isFinite(m[0].b)) || JSON.stringify(m);
  });
  await guard('care.a-drone-and-a-crate-are-a-few-draw-calls-and-leave-nothing-behind', async () => {
    const C = on(FULL); const geo0 = g.renderer.renderer.info.memory.geometries, kids0 = g.renderer.scene.children.length;
    const d = g.careDebug.drop(true, { quiet: true }); d.age = 8; CP.tick(g, 0.05);
    const root = g.renderer.scene.getObjectByName('carepackages'); const meshes = []; root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const withCrate = meshes.length; d.age = 30; CP.tick(g, 0.05); const crateOnly = []; root.traverse((o) => { if (o.isMesh) crateOnly.push(o); });
    g.careDebug.drop(false, { land: true }); CP.tick(g, 0.05);
    CP.teardown(g); const kids1 = g.renderer.scene.children.length;
    g.renderer.render(0.01, g.time);
    return (withCrate <= 6 && crateOnly.length <= 2 && kids1 === kids0 && !g.renderer.scene.getObjectByName('carepackages')) || `meshes ${withCrate}/${crateOnly.length}, scene ${kids0}->${kids1} roots ${g.renderer.scene.children.filter((o) => o.name === 'carepackages').length} drone ${JSON.stringify(C.drone && C.drone.age)}`;
  });
  await guard('care.idle-costs-nothing-per-tick', async () => {
    const C = on(FULL); C.rate = 10; S().dex = {}; for (let q = 1; q <= 400; q++) S().dex[q] = 1;
    for (let n = 0; n < 200; n++) { g.time += 0.016; CP.tick(g, 0.016); }   // warm up
    const N = 4000, t0 = performance.now(); for (let n = 0; n < N; n++) { g.time += 0.016; CP.tick(g, 0.016); } const per = (performance.now() - t0) / N;
    return per < 0.02 || `${per.toFixed(4)} ms per tick`;
  });
  await guard('care.a-soak-of-500-seeded-drops-never-throws-or-passes-a-cap', async () => {
    const C = on(FULL); const rng = mulberry32(2026), bad = []; S().totalEarned = 1e7; C.rate = 80;
    const ids = ['medkit', 'flare', 'glow', 'lantern', 'cable', 'belt', 'strut', 'jack', 'dynamite', 'charge', 'rope', 'chargepack', 'hlamp', 'pole', 'ramp', 'bulk', 'frame:steel', 'frame:timber', 'canister', 'marker', 'claw'];
    for (let n = 0; n < 500; n++) {
      const up = { ...FULL }; if (rng() < 0.5) delete up.crew; if (rng() < 0.3) delete up.firstaid; S().up = up; g.T = g.tune();
      for (const id of ids) S().items[id] = rng() < 0.4 ? CP.capOf(id) - ((rng() * 4) | 0) : (rng() * 30) | 0;
      S().crew = rng() < 0.5 ? [{ id: 1, battery: rng() }] : []; S().carry = [];
      const cr = g.careDebug.drop(rng() < 0.2 ? true : undefined, { land: true, quiet: true });
      try { CP.openCrate(g, cr.id, rng() < 0.5 ? 'h' : 'g'); } catch (e) { bad.push('threw ' + e.message); break; }
      for (const [id, q] of Object.entries(S().items)) if (q > CP.capOf(id) && ids.includes(id)) bad.push(`${id} ${q}`);
      if (C.crates.length) { C.crates.length = 0; }
      if (S().care.crates.length > CP.CARE.MAX_CRATES) bad.push('too many crates');
    }
    return bad.length === 0 || bad.slice(0, 4).join('; ');
  });
  await guard('care.far-from-the-hall-it-drops-at-your-nearest-depot', async () => {
    const C = on(FULL); const bx = -9, bz = 5;
    const e = { id: g.nextId(), type: 'beacon', x: bx, y: 0, z: bz, i: ctx.toI(bx), j: 0, k: ctx.toK(bz), pw: 1 }; S().entities.push(e); g.addEntity(e);
    try {
      p().pos.set(bx - 1, 0, bz + 3); const near = CP.baseFor(g); const sp = CP.findSpot(g, near, p().pos);
      p().pos.set(2, 0, -2); const home = CP.baseFor(g);
      return (near.kind === 'beacon' && Math.hypot(sp.x - bx, sp.z - bz) < 12 && home.kind === 'hall') || JSON.stringify([near.kind, home.kind, sp]);
    } finally { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } S().entities = S().entities.filter((x) => x.id !== e.id); }
  });
  await guard('care.crates-grow-with-progress', async () => {
    const C = on(FULL); S().stats.upgrades = 0; S().totalEarned = 0; const X0 = CP.rollContext(g); S().stats.upgrades = 80; S().totalEarned = 1e9; const X1 = CP.rollContext(g);
    let a = 0, b = 0; for (let s = 1; s <= 200; s++) { a += CP.rollPack(g, mulberry32(s), { gold: false, X: X0 }).items.reduce((t, x) => t + x[1], 0); b += CP.rollPack(g, mulberry32(s), { gold: false, X: X1 }).items.reduce((t, x) => t + x[1], 0); }
    return (X0.prog < 0.01 && X1.prog > 0.95 && b > a * 1.6) || `early ${a}, late ${b}, prog ${X0.prog} ${X1.prog}`;
  });
  await guard('care.the-rotor-hum-fades-with-distance-and-lets-go-of-the-audio-nodes', async () => {
    const C = on(FULL); const made = { osc: 0, nodes: 0, stopped: 0, disconnected: 0 };
    const node = (extra) => { made.nodes++; return { connect() {}, disconnect() { made.disconnected++; }, start() {}, stop() { made.stopped++; }, frequency: { value: 0, setTargetAtTime() {} }, gain: { value: 0, setTargetAtTime() {} }, pan: { value: 0, setTargetAtTime() {} }, ...extra }; };
    const fake = { currentTime: 0, createOscillator: () => { made.osc++; return node({}); }, createGain: () => node({}), createBiquadFilter: () => node({}), createStereoPanner: () => node({}) };
    const s = g.sound, c0 = s.ctx, d0 = s.dry; s.ctx = fake; s.dry = node({});
    try {
      const rt = { hum: null };
      const near = CP.humAt(g, rt, { x: p().pos.x + 3, y: 2, z: p().pos.z, crate: null }), mid = CP.humAt(g, rt, { x: p().pos.x + 15, y: 2, z: p().pos.z, crate: null }), far = CP.humAt(g, rt, { x: p().pos.x + 80, y: 2, z: p().pos.z, crate: null });
      const made1 = made.osc;
      CP.humAt(g, rt, null); await new Promise((r) => setTimeout(r, 600));
      return (near >= 0.99 && mid > 0 && mid < near && far === 0 && made1 === 2 && !rt.hum && made.stopped === 2 && made.disconnected >= 5) || JSON.stringify({ near, mid, far, made });
    } finally { s.ctx = c0; s.dry = d0; }
  });
  await guard('care.a-far-drone-starts-no-hum-at-all', async () => {
    on(FULL); const s = g.sound, c0 = s.ctx, d0 = s.dry; let n = 0; s.ctx = { currentTime: 0, createOscillator: () => { n++; throw new Error('should not start'); } }; s.dry = {};
    try { const rt = { hum: null }; const v = CP.humAt(g, rt, { x: 900, y: 3, z: 900, crate: null }); return (v === 0 && n === 0 && !rt.hum) || `v ${v}, oscillators ${n}`; } finally { s.ctx = c0; s.dry = d0; }
  });
  await guard('care.nothing-ticks-while-the-courier-sleeps', async () => {
    on(FULL); g.careOff = true; const cr = g.S.care; at(10); for (let n = 0; n < 40; n++) { g.time += 0.25; CP.tick(g, 0.25); }
    return (cr.queue.length === 0 && !cr.drone) || 'it ticked while off';
  });
}
