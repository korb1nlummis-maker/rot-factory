// mp.care.*: Care Packages in co-op with no network. One page plays both roles by switching g.net.role and capturing g.netSend (like mp_stack.js).
// The host rolls the package, flies the drone and opens the crate; the guest sees them from `xrow` rows of the type 'care' and opens with the `careOpen` command.
import * as CP from '../carepackage.js';
import * as EXT from '../ext.js';
import * as PIN from '../playerinv.js';
import { mulberry32 } from '../util.js';

export default async function (ctx) {
  const { T, g, S, p, fresh, V3 } = ctx;
  const FULL = { timber: 1, steel: 1, firstaid: 1, markers: 1, lantern: 1, struts: 1, jacks: 1, power: 1, belts: 1, crew: 1 };
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  let toasts = [];
  const setup = (up = FULL) => {
    fresh(up); g.careOff = false; CP.teardown(g); S().care = undefined; S().gameMin = 100; g.mode = 'play'; g.dead = false; g.ui.closeModals(); S().ending = null; S().totalEarned = 0; S().stats.rar = [0, 0, 0, 0, 0, 0, 0]; S().stats.maxDepth = 0; S().dex = {}; S().entities = S().entities.filter((e) => e.free);
    toasts = []; if (!g._toast) g._toast = g.ui.toast; g.ui.toast = (t) => { toasts.push(t); }; p().pos.set(0, 0, 2); g.camSky = 1;
    const C = CP.ensure(g); C.queue.length = 0; return C;
  };
  const done = () => { if (g._toast) { g.ui.toast = g._toast; g._toast = null; } delete g.netSend; delete g.cmd; delete g.remote; role(null); g.net.role = undefined; g.careOff = true; CP.teardown(g); S().care = undefined; g.netOut.length = 0; g.ui.closeModals(); };
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); } });
  const rowOf = () => { g._extRow = 0; sent.length = 0; EXT.update(g, 0.016, false); const m = sent.filter((x) => x.t === 'xrow' && x.k === 'care'); return m.length ? m[m.length - 1].d : null; };
  const asGuest = (fn) => { const keep = JSON.stringify(S().care); role('guest'); try { return fn(); } finally { role('host'); CP.teardown(g); S().care = JSON.parse(keep); } };

  await guard('mp.care.the-host-sends-the-drone-and-the-crate-in-rows', async () => {
    const C = setup(); role('host'); cap();
    const d = g.careDebug.drop(false, { quiet: true }); d.age = 3.1;
    const r1 = rowOf();
    const ok1 = r1 && Array.isArray(r1.d) && r1.d[0] === d.id && Math.abs(r1.d[6] - 3.1) < 0.5 && r1.c.length === 0;
    d.age = CP.FLIGHT.release - 0.01; CP.tick(g, 0.05); const r2 = rowOf();
    const ok2 = r2 && r2.c.length === 1 && r2.c[0][0] === d.id && r2.d && r2.d[8] === 1;
    d.age = CP.FLIGHT.end; CP.tick(g, 0.05); const r3 = rowOf();
    return (ok1 && ok2 && r3 && r3.c.length === 1 && r3.d === null) || JSON.stringify([r1, r2, r3]);
  });
  await guard('mp.care.a-quiet-moment-sends-nothing-but-a-heartbeat', async () => {
    setup(); role('host'); cap(); g.careDebug.drop(false, { land: true, quiet: true });
    let n = 0, first = rowOf(); for (let q = 0; q < 12; q++) if (rowOf()) n++;
    return (first && n >= 2 && n <= 4) || `first ${!!first}, ${n} rows in 12 quiet half seconds`;
  });
  await guard('mp.care.a-guest-sees-the-same-drone-and-crate', async () => {
    const C = setup(); role('host'); cap(); const cr = g.careDebug.drop(false, { land: true, quiet: true }); const d = g.careDebug.drop(true, { quiet: true }); d.age = 2.2;
    const second = rowOf();
    const res = asGuest(() => {
      const seen = [];
      EXT.guestRow(g, 'care', json(second));
      const G = S().care, ok = [!!G.drone && G.drone.id === d.id, Math.abs(G.drone.age - 2.2) < 0.6, G.crates.length === 1 && G.crates[0].id === cr.id, G.drone.gold === 1];
      const a0 = G.drone.age; EXT.update(g, 1.0, true); const aged = G.drone.age - a0 > 0.9;   // the guest advances the flight itself between rows
      const root = g.renderer.scene.getObjectByName('carepackages'); const kids = root ? root.children.length : 0;   // a drone group and a crate
      return { ok, aged, kids, items: G.crates[0].items };
    });
    return (res.ok.every(Boolean) && res.aged && res.kids === 2 && res.items === undefined) || JSON.stringify(res);
  });
  await guard('mp.care.the-guest-draws-the-crate-before-the-next-row-arrives', async () => {
    setup(); role('host'); cap(); const d = g.careDebug.drop(false, { quiet: true }); d.age = 3; const row = rowOf();
    const kids = asGuest(() => { EXT.guestRow(g, 'care', json(row)); S().care.drone.age = CP.FLIGHT.release + 0.5; EXT.update(g, 0.016, true); const root = g.renderer.scene.getObjectByName('carepackages'); return root.children.length; });
    return kids === 2 || `${kids} things drawn`;
  });
  await guard('mp.care.a-guest-opens-with-e-and-the-host-hands-it-out-once', async () => {
    setup(); const C = () => S().care; role('host'); cap(); const cr = g.careDebug.drop(false, { land: true, quiet: true, items: [['medkit', 3], ['flare', 2]], fx: [['cash', 50]] }); S().items = {}; S().money = 0;
    const row = rowOf(); let cmdSent = null;
    asGuest(() => {
      EXT.guestRow(g, 'care', json(row)); g.cmd = (c, d) => { cmdSent = [c, json(d)]; };
      p().pos.set(cr.x + 1.2, 0, cr.z + 1.2); p().yaw = Math.atan2(cr.x - p().pos.x, cr.z - p().pos.z); p().pitch = -0.2;
      CP.useKey(g);
    });
    const asked = cmdSent && cmdSent[0] === 'careOpen' && cmdSent[1].id === cr.id;
    // the host runs it as the guest
    g.remote = { pos: new V3(cr.x + 1, 0, cr.z + 1) }; sent.length = 0;
    g.netCmd('careOpen', cmdSent[1]); const items1 = json(PIN.invFor(g, 'g')), money1 = S().money, shared = sent.filter((m) => m.t === 'shared');
    g.netCmd('careOpen', cmdSent[1]); g.netCmd('careOpen', cmdSent[1]);   // the same command again (a double click, a resend): nothing more
    return (asked && items1.medkit === 3 && items1.flare === 2 && money1 === 50 && !S().items.medkit && S().money === 50 && C().crates.length === 0 && C().count === 1 && shared.length >= 1 && !shared[0].items
      && sent.some((m) => m.t === 'toast' && /care package/i.test(m.title))) || JSON.stringify({ asked, items1, money1, crates: C().crates.length, shared: shared.length });
  });
  await guard('mp.care.a-forged-open-is-refused', async () => {
    setup(); const C = () => S().care; role('host'); cap(); const cr = g.careDebug.drop(false, { land: true, quiet: true, items: [['medkit', 3]], fx: [['cash', 50]] }); S().items = {}; S().money = 0;
    const snap = () => JSON.stringify([S().items, PIN.invFor(g, 'g'), S().money, C().crates.length, C().count]); const s0 = snap();
    const bad = [];
    const tryIt = (label, d, pos) => { g.remote = pos === null ? null : { pos: pos || new V3(cr.x + 1, 0, cr.z + 1) }; try { g.netCmd('careOpen', d); } catch (e) { bad.push(label + ' threw ' + e.message); } if (snap() !== s0) bad.push(label + ' opened it'); };
    tryIt('far', { id: cr.id }, new V3(cr.x + 40, 0, cr.z)); tryIt('another floor', { id: cr.id }, new V3(cr.x, 30, cr.z)); tryIt('nobody there', { id: cr.id }, null);
    tryIt('nan position', { id: cr.id }, new V3(NaN, 0, 0));
    for (const [label, id] of [['string id', String(cr.id)], ['float id', cr.id + 0.5], ['negative id', -1], ['no such id', 99999], ['null', null], ['object', {}], ['array', [cr.id]], ['bigint-ish', 1e300], ['nan', NaN], ['undefined', undefined]]) tryIt(label, { id });
    for (const d of [null, undefined, 5, 'x', [], [cr.id], () => 1]) tryIt('payload ' + typeof d, d);
    // the guest's own game never opens anything on its own say (a guest runs no host code)
    role('guest'); g.remote = { pos: new V3(cr.x, 0, cr.z) }; try { CP.guestOpen(g, { id: cr.id }); } catch (e) { bad.push('guest threw'); } role('host'); if (snap() !== s0) bad.push('a guest-side call opened it');
    g.remote = { pos: new V3(cr.x + 1, 0, cr.z + 1) }; g.netCmd('careOpen', { id: cr.id, items: [['claw', 99]], fx: [['cash', 1e12]], x: 0 });   // extra fields never matter: what is in the crate is what the host rolled
    return (bad.length === 0 && PIN.invFor(g, 'g').medkit === 3 && !S().items.medkit && S().money === 50 && !PIN.invFor(g, 'g').claw) || bad.slice(0, 4).join('; ') + ' ' + snap();
  });
  await guard('mp.care.the-host-opens-for-a-guest-who-walks-into-it', async () => {
    const C = setup(); role('host'); cap(); const cr = g.careDebug.drop(false, { land: true, quiet: true, items: [['medkit', 1]], fx: [] }); S().items = {}; p().pos.set(cr.x + 30, 0, cr.z);
    g.remote = { pos: new V3(cr.x + 5, 0, cr.z) }; for (let n = 0; n < 6; n++) { g.time += 0.1; CP.tick(g, 0.1); }
    const armed = C.crates.length === 1; g.remote.pos.set(cr.x + 0.4, 0, cr.z); for (let n = 0; n < 6; n++) { g.time += 0.1; CP.tick(g, 0.1); }
    return (armed && C.crates.length === 0 && PIN.invFor(g, 'g').medkit === 1 && !S().items.medkit && sent.some((m) => m.t === 'toast' && /opened/.test(m.title))) || `armed ${armed}, crates ${C.crates.length}, items ${JSON.stringify(PIN.invFor(g, 'g'))}`;
  });
  await guard('mp.care.the-schedule-runs-on-the-hosts-day-counter-and-a-guest-never-rolls', async () => {
    setup(); const C = () => S().care; role('host'); cap(); S().gameMin = 3 * 1440 + 100;
    // a guest's frame: its copy of the day counter moves, and nothing is queued or flown on its side
    asGuest(() => { S().gameMin = 9 * 1440 + 100; for (let n = 0; n < 40; n++) { g.time += 0.25; EXT.update(g, 0.25, true); } });
    const keepMin = S().gameMin;
    const quiet = C().queue.length === 0 && !C().drone && C().crates.length === 0 && C().sched === 0;
    S().gameMin = 3 * 1440 + 100; for (let n = 0; n < 30; n++) { g.time += 0.25; EXT.update(g, 0.25, false); }
    return (quiet && C().sched === 1 && (C().drone || C().crates.length)) || JSON.stringify({ quiet, sched: C().sched, drone: !!C().drone });
  });
  await guard('mp.care.claimed-milestones-are-shared-like-points', async () => {
    setup({}); role('host'); cap(); S().totalEarned = 2e3; S().stats.rar[2] = 1; CP.tick(g, 0.01); g._care.pt = 0; CP.tick(g, 0.01); S().care.opened.rare = 1; const row = rowOf();
    const res = asGuest(() => { EXT.guestRow(g, 'care', json(row)); const G = S().care; const rows = CP.logRows(g), st = (id) => rows.find((r) => r.id === id).state; return { claimed: Object.keys(G.claimed).sort().join(), rare: st('rare'), earn: st('earn1000'), epic: st('epic'), pct: rows.find((r) => r.id === 'earn10000').pct }; });
    return (res.claimed === 'earn1000,rare' && res.rare === 'delivered' && res.earn === 'waiting' && res.epic === 'upcoming' && Math.abs(res.pct - 0.2) < 0.01) || JSON.stringify(res);
  });
  await guard('mp.care.the-upgrade-discount-is-the-hosts-and-shows-on-the-guests-price', async () => {
    const C = setup(); role('host'); cap(); C.disc = 0.1; CP.tick(g, 0.01); const row = rowOf();
    const price = asGuest(() => { EXT.guestRow(g, 'care', json(row)); return CP.priceOf(g, 1000); });
    return price === 900 || 'guest sees ' + price;
  });
  await guard('mp.care.an-instant-haul-opened-by-the-guest-sells-the-guests-carry', async () => {
    const C = setup(); role('host'); cap(); const cr = g.careDebug.drop(true, { land: true, quiet: true, items: [], fx: [['haul', 10]] }); S().money = 0;
    g.remote = { pos: new V3(cr.x, 0, cr.z + 1) }; sent.length = 0; g.netCmd('careOpen', { id: cr.id });
    const ev = sent.find((m) => m.t === 'xrow' && m.k === 'care' && m.d && m.d.ev === 'haul');
    let sold = -1;
    asGuest(() => { S().carry = [{ sp: 3, vr: 0 }, { sp: 4, vr: 0 }]; const was = g.sellAll; g.sellAll = () => { sold = S().carry.length; S().carry = []; }; try { EXT.guestRow(g, 'care', ev.d); } finally { g.sellAll = was; } });
    return (!!ev && S().money === 10 && sold === 2) || JSON.stringify({ ev: !!ev, money: S().money, sold });
  });
  await guard('mp.care.a-guest-pack-goes-in-the-guests-own-bag-when-there-is-one', async () => {
    setup(); const C = () => S().care; role('host'); cap(); const cr = g.careDebug.drop(false, { land: true, quiet: true, items: [['medkit', 3]], fx: [] }); S().items = { medkit: 1 };
    PIN.invFor(g, 'g').medkit = 98; g.remote = { pos: new V3(cr.x, 0, cr.z + 1) };
    try { g.netCmd('careOpen', { id: cr.id }); const r = { host: S().items.medkit, guest: PIN.invFor(g, 'g').medkit, left: C().crates.length ? C().crates[0].items[0] : null }; return (r.host === 1 && r.guest === 99 && JSON.stringify(r.left) === '["medkit",2]') || JSON.stringify(r); } finally { S().ginv = undefined; }
  });
  await guard('mp.care.garbage-rows-never-throw-and-never-put-a-crate-in-the-wrong-place', async () => {
    setup(); role('host'); cap();
    const rows = [null, 5, 'x', [], {}, { c: 'no' }, { c: [[1]] }, { c: [[1, 'a', 'b', 'c']] }, { c: [[1, NaN, 0, 0]] }, { c: [[1, 1e9, 0, 0]] }, { c: new Array(500).fill([1, 1, 0, 1]) }, { d: [1, 2] }, { d: [1, NaN, 0, 0, 0, 0, 0] }, { d: 'x' }, { cl: [1, {}, 'ok'], op: 'nope', p: { r: 'x', br: 4 } }, { q: 1e9 }, { w: 'x', disc: 99, n: 'z' }, { ev: 'haul' }, { ev: 5 }];
    const bad = [];
    asGuest(() => { for (const r of rows) { try { EXT.guestRow(g, 'care', r); g.guestTickCare && 0; EXT.update(g, 0.016, true); } catch (e) { bad.push(JSON.stringify(r).slice(0, 40) + ' threw ' + e.message); } }
      const G = S().care; if (G.crates.some((c) => !Number.isFinite(c.x + c.y + c.z))) bad.push('a crate with no place'); if (G.crates.length > 12) bad.push(G.crates.length + ' crates'); if (!(G.disc >= 0 && G.disc <= 1)) bad.push('discount ' + G.disc); });
    return bad.length === 0 || bad.slice(0, 3).join('; ');
  });
  await guard('mp.care.a-guest-hears-nothing-from-a-drone-far-away', async () => {
    setup(); role('host'); cap(); const d = g.careDebug.drop(false, { quiet: true, x: 4000, z: 4000 }); d.age = 4; const row = rowOf();
    const res = asGuest(() => { EXT.guestRow(g, 'care', json(row)); EXT.update(g, 0.1, true); const rt = g._care; return { hum: !!rt.hum, v: g.sound.voice(d.tx, 8, d.tz, 'hum').gain }; });
    return (!res.hum && res.v === 0) || JSON.stringify(res);
  });
}
