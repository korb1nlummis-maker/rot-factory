// mp.audit_gaps.*: the audit of the multiplayer gap items. One page plays both roles by switching g.net.role and capturing g.netSend (see mp_rail.js).
import { makeRail } from './rail_lib.js';
import * as PP from '../powerparts.js';
import { TYPES } from '../catalog.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, p, L, adv, V3, fresh, tiles, cellX, cellZ } = ctx;
  const X = makeRail(ctx), R = X.R;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); g.remote = null; g.netOut.length = 0; };
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); X.clean(); } });
  const fakeRemote = (pos) => ({ pos, update() {}, lampOn: false, yaw: 0, pitch: 0, spheres() { return []; } });
  const coins = () => { const calls = []; const orig = g.sound.coin; g.sound.coin = (...a) => { calls.push(a); }; return { calls, restore: () => { g.sound.coin = orig; } }; };

  await guard('mp.audit_gaps.a-grid-with-no-power-parts-still-reaches-the-guests-load-meter', async () => {
    X.setup(); role('host'); cap(); const bad = [];
    const s = X.std(); g.remote = fakeRemote(new V3(s.base.x, 0, s.base.z + 1)); adv(1.2);   // a generator, a pole and two stations: no switch, battery, breaker or meter anywhere
    const net = g.power.nets.find((n) => n.loads && n.loads['Rail Station']); if (!net) return 'the host grid has no rail station load';
    { const row = g.power.packRow(); if (row && row.e.length) bad.push('test setup: the host sends part rows although no power part exists'); }   // (the grids themselves are sent now: a guest reads them)
    sent.length = 0; g.sendDyn(); const dyn = sent.find((m) => m.t === 'dyn'); if (!dyn || !dyn.grid) return 'the dyn message carries no grid near the friend';
    const hostHud = (() => { g._pwHud = true; g._pwHudT = 0; PP.hudTick(g, 0.3); const el = document.getElementById('pwMeterHud'); return el ? el.querySelector('.pwh-t').textContent + ' | ' + el.querySelector('.pwh-l').textContent : ''; })();
    p().pos.set(s.base.x, 0, s.base.z + 1);
    const saved = g.power.nets, savedById = g.power.netById; g.power.nets = []; g.power.netById = new Map();
    try {
      done(); role('guest'); g.netMessage(json(dyn)); g._pwHud = true; g._pwHudT = 0; PP.hudTick(g, 0.3);
      const el = document.getElementById('pwMeterHud'); const guestHud = el ? el.querySelector('.pwh-t').textContent + ' | ' + el.querySelector('.pwh-l').textContent : '';
      if (!/Grid .* kW supplied/.test(guestHud)) bad.push('the guest M readout says "' + guestHud + '"');
      if (!/Rail Station 3\.0 kW/.test(guestHud)) bad.push('the guest does not see the station load: "' + guestHud + '"');
      if (guestHud !== hostHud) bad.push(`readouts differ:\n  guest ${guestHud}\n  host  ${hostHud}`);
    } finally { g.power.nets = saved; g.power.netById = savedById; g._pwHud = false; if (document.getElementById('pwMeterHud')) document.getElementById('pwMeterHud').style.display = 'none'; g.guestGrid = null; }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.audit_gaps.a-forged-sale-feedback-from-a-guest-makes-no-sound-on-the-host', async () => {
    fresh({ belts: 1 }); role('host'); cap(); g.remote = fakeRemote(new V3(-100, 0, 0)); const bad = [], k = coins(), money = S().money, sold = S().stats.sold;
    try { g.coinCd = 0; g.netMessage({ t: 'sale', fb: 1 }); g.netMessage({ t: 'sale', fb: 1, sp: 3, vr: 0, dist: 99 }); } finally { k.restore(); }
    if (k.calls.length) bad.push('the host played ' + k.calls.length + ' coins for a message that only a host may send');
    if (S().money !== money || S().stats.sold !== sold) bad.push('a feedback message changed the money');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.audit_gaps.one-automatic-sale-is-one-coin-on-each-screen', async () => {
    fresh({ belts: 1 }); role('host'); cap(); g.remote = fakeRemote(new V3(-100, 0, 0)); const bad = [], k = coins();
    p().pos.set(g.hall.binPos.x + 2, 0, g.hall.binPos.z); g.sound._win = null;   // (a coin is heard from the bin: stand next to it)
    try { g.coinCd = 0; g.sellAuto(1, 0, 1); } finally { k.restore(); }
    if (k.calls.length !== 1) bad.push('the host heard ' + k.calls.length + ' coins for one sale');
    const fb = sent.filter((m) => m.t === 'sale'); if (fb.length !== 1 || !fb[0].fb) bad.push('messages ' + JSON.stringify(fb));
    const m = json(fb[0]); if (!(Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.z))) bad.push('the message does not say where the coin rang: ' + JSON.stringify(m));
    done(); role('guest'); cap(); const k2 = coins(); const money = S().money; g.sound._win = null;
    try { g.coinCd = 0; g.netMessage(m); } finally { k2.restore(); }
    if (k2.calls.length !== 1) bad.push('the guest heard ' + k2.calls.length + ' coins'); if (sent.length) bad.push('the guest answered with ' + JSON.stringify(sent)); if (S().money !== money) bad.push('the guest was paid again');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.audit_gaps.a-guest-sees-the-rail-as-taken-when-it-aims-a-belt-a-pole-or-a-light', async () => {
    X.setup(); role('host'); cap(); g.remote = fakeRemote(new V3(-100, 0, 0)); const bad = [];
    const i = X.ci(-12), k = X.ck(-2.2); X.line(i, i + 3, 0, k);
    const plus = S().entities.filter((e) => R.isRailType(e.type)).map((e) => ({ t: 'ent+', ent: g.stripEnt(e) }));
    // a fresh guest: nothing of the host's rail is known, and the guest never reserves cells itself
    for (const e of S().entities.filter((x) => R.isRailType(x.type))) { g.world.reserved.delete(R.keyOf(e)); g.removeViewEnt(e.id); } R.invalidate(g);
    done(); role('guest'); cap(); for (const m of plus) g.netMessage(json(m)); R.invalidate(g); R.sync(g, true);
    for (const e of S().entities.filter((x) => x.type === 'rail')) if (g.world.reserved.has(R.keyOf(e))) bad.push('test setup: the guest reserved a rail cell');
    for (const di of [0, 2]) {
      if (!g.logi.canPlace(i + di, 0, k)) bad.push('the guest planner accepts a belt on rail piece ' + di);
      if (!g.logi.cellTaken(i + di, 0, k)) bad.push('cellTaken is blind to rail piece ' + di + ' on a guest');
    }
    if (g.logi.canPlace(i + 6, 0, k)) bad.push('the guest planner refuses a free cell: ' + g.logi.canPlace(i + 6, 0, k));
    // and takes it away again when the host takes the track down
    for (const e of S().entities.filter((x) => x.type === 'rail')) g.netMessage({ t: 'ent-', id: e.id }); R.invalidate(g); R.sync(g, true);
    if (g.logi.cellTaken(i, 0, k)) bad.push('the cell stays taken after the host took the track down: ' + g.logi.cellTaken(i, 0, k));
    // the same for a Leveling Pad the host sent
    const lv = { id: 4242424, type: 'levelpad', i: i + 8, j: 0, k, dir: 0, size: 1, mk: 'timber', on: false, st: 'idle', slot: 0, rid: 'levelpad', grp: 1 }; g.netMessage(json({ t: 'ent+', ent: lv }));
    if (g.world.reserved.has(R.keyOf(lv))) bad.push('test setup: the guest reserved the pad cell');
    if (!g.logi.canPlace(i + 8, 0, k)) bad.push('the guest planner accepts a belt on a Leveling Pad'); else { /* ok */ }
    g.netMessage({ t: 'ent-', id: lv.id }); if (g.logi.cellTaken(i + 8, 0, k)) bad.push('the pad cell stays taken after the pad is gone');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.audit_gaps.the-load-meter-counts-the-same-number-of-kinds-on-both-screens', async () => {
    X.setup(); role('host'); cap(); g.remote = fakeRemote(new V3(-100, 0, 0)); const bad = [], K = X.K, fake = [];
    try {
      for (let n = 0; n < 11; n++) { const type = 'auditk' + n; TYPES[type] = { add: () => ({}), kw: () => 0.5 + n * 0.1, wireName: () => 'Kind ' + n }; fake.push(type); }
      const gen = K.gen(-9, 2), pole = K.pole(-8, 2), pole2 = K.pole(-8, 4); K.wire(gen, pole); K.wire(pole, pole2); g.power.markDirty(); adv(0.5);   // two poles: the 11 kinds and the meter need 12 sockets
      fake.forEach((type, n) => { const m = K.mach(type, -7.6 + (n % 4) * 0.3, 1.2 + Math.floor(n / 4) * 0.3); K.wire(n < 6 ? pole : pole2, m); });
      const meter = K.part('meter', -8.6, 3.0); K.wire(pole2, meter); g.power.markDirty(); adv(1.2);
      const hostInfo = JSON.stringify(infoFor(g, { kind: 'mach', id: meter.id }).lines); if (!/and \d+ more kinds/.test(hostInfo)) return 'test setup: the host readout lists no overflow: ' + hostInfo;
      const row = json(g.power.packRow()), saved = g.power.nets, byId = g.power.netById;
      done(); role('guest'); g.power.applyRow(row);
      const guestInfo = JSON.stringify(infoFor(g, { kind: 'mach', id: meter.id }).lines);
      if (guestInfo !== hostInfo) bad.push(`readouts differ:\n  guest ${guestInfo}\n  host  ${hostInfo}`);
      g.power.nets = saved; g.power.netById = byId;
    } finally { for (const t of fake) delete TYPES[t]; done(); for (const e of [...S().entities]) if (/^auditk|^meter$/.test(e.type)) g.doDecon({ kind: 'mach', id: e.id }); }
    return bad.length === 0 || bad.join(' || ');
  });
}
