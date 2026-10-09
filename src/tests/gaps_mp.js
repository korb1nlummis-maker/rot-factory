// mp.gaps.*: multiplayer parity for the things the Satisfactory waves left open: the guest hears the coin when a belt or a Mine Rail cart sells at the bin (one message per 0.12 s,
// and the guest never sells it a second time), a vault's stored count reads the same on the guest, the Leveling Pad says why it skipped a slot, and a cart that waits in a queue
// reads the same on both screens. One page plays both roles by switching g.net.role and capturing g.netSend (see mp_rail.js).
import { makeRail } from './rail_lib.js';
import { infoFor } from '../info.js';
import { pools } from '../plushdata.js';
import * as B from '../build.js';

export default async function (ctx) {
  const { T, g, S, p, L, adv, V3, fresh, tiles, toI, toK, cellX, cellZ } = ctx;
  const X = makeRail(ctx), R = X.R;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); g.remote = null; g.netOut.length = 0; };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); X.clean(); for (const t of tiles()) L().remove(t); } });
  const fakeRemote = (pos) => ({ pos, update() {}, lampOn: false, yaw: 0, pitch: 0 });
  const bp = () => g.hall.binPos;
  const coins = () => { const calls = []; const orig = g.sound.coin; g.sound.coin = (...a) => { calls.push(a); }; return { calls, restore: () => { g.sound.coin = orig; } }; };
  const runBelts = (secs) => { for (let n = 0; n < secs * 10; n++) { g.time += 0.1; g.coinCd -= 0.1; g.power.update(0.1); L().update(0.1); } };
  const binPath = () => { const b = bp(), x0 = b.x - 3.0, z0 = b.z + 3.0; return [[x0, z0, 0], [x0 + 0.6, z0, 0], [x0 + 1.2, z0, 0], [x0 + 1.8, z0, 3], [x0 + 1.8, z0 - 0.6, 3], [x0 + 1.8, z0 - 1.2, 3]]; };

  await guard('mp.gaps.the-host-tells-the-guest-about-an-automatic-sale-at-most-once-per-0.12-s', async () => {
    fresh({ belts: 1 }); role('host'); cap(); g.remote = fakeRemote(new V3(-100, 0, 0)); const bad = [];
    g.coinCd = 0; const k = coins();
    try { for (let n = 0; n < 12; n++) g.sellAuto(1, 0, 1); } finally { k.restore(); }
    const fb = ofType('sale').filter((m) => m.fb); if (fb.length !== 1) bad.push('12 sales in one frame sent ' + fb.length + ' sale messages');
    if (fb[0] && (fb[0].sp !== undefined || fb[0].vr !== undefined)) bad.push('the message carries a plush: ' + JSON.stringify(fb[0]));
    for (let n = 0; n < 3; n++) { g.coinCd -= 0.05; g.sellAuto(1, 0, 1); } g.time += 0.2; g.coinCd = 0.0; g.sellAuto(1, 0, 1);   // (the message to the guest has its own 0.12 s of game time: a coin nobody hears must not hold it)
    if (ofType('sale').filter((m) => m.fb).length < 2) bad.push('no second message once the 0.12 s passed');
    // alone (no friend connected) nothing is sent
    done(); cap(); g.coinCd = 0; g.sellAuto(1, 0, 1); if (ofType('sale').length) bad.push('a message went out with no friend connected');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.gaps.a-belt-selling-plush-at-the-bin-is-heard-by-the-guest', async () => {
    fresh({ belts: 1 }); role('host'); cap(); g.remote = fakeRemote(new V3(-100, 0, 0)); const bad = []; p().pos.set(bp().x + 2, 0, bp().z); g.sound._win = null;   // (the host hears the coin from the bin: it stands next to it)
    for (const t of tiles()) L().remove(t); for (const [x, z, d] of binPath()) g.layBelt(toI(x), 0, toK(z), d); L().rebuildBelts();
    const start = tiles().find((t) => t.i === toI(bp().x - 3) && t.k === toK(bp().z + 3)); const m0 = S().money; g.coinCd = 0;
    for (let n = 0; n < 3; n++) start.items.push({ sp: pools[1][0], vr: 0, t: n * 0.3 });
    const k = coins(); try { runBelts(40); } finally { k.restore(); }
    if (!(S().money > m0)) bad.push('the belt sold nothing');
    const fb = ofType('sale').filter((m) => m.fb); if (fb.length < 1) bad.push('the guest was told of no sale'); if (fb.length > 3) bad.push('too many messages for 3 plush: ' + fb.length);
    if (k.calls.length < 1) bad.push('the host did not hear it either');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.gaps.a-rail-cart-selling-at-the-bin-is-heard-by-the-guest', async () => {
    X.setup(); role('host'); cap(); g.remote = fakeRemote(new V3(-100, 0, 0)); const bad = [], s = X.std(), car = s.car; adv(0.6);
    for (let n = 0; n < 20; n++) car.cargo.push({ sp: 3, vr: 0 }); car.n = 20; const t0 = g.time;
    R.dispatch(g, car, R.keyOf(s.base)); X.until(() => car.st !== 'run' && car.cargo.length === 0, 40); const secs = g.time - t0;
    if (car.cargo.length) bad.push('the cart did not sell: ' + car.cargo.length);
    const fb = ofType('sale').filter((m) => m.fb); if (fb.length < 2) bad.push('a 20 plush load sent only ' + fb.length + ' messages');
    if (fb.length > secs / 0.12 + 2) bad.push(`${fb.length} messages in ${secs.toFixed(1)} s is over the rate limit`);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.gaps.the-guest-plays-the-coin-once-per-0.12-s-and-never-sells-the-plush-again', async () => {
    fresh({}); done(); role('guest'); cap(); const bad = [], k = coins(), money = S().money, sold = S().stats.sold;
    p().pos.set(bp().x + 2, 0, bp().z); g.sound._win = null;   // (a coin is heard from the bin: stand next to it; the voice limiter's window is real time, which a test does not wait for)
    const at = { x: bp().x, y: 1.2, z: bp().z };
    try {
      g.coinCd = 0; g.netMessage({ t: 'sale', fb: 1, ...at }); g.netMessage({ t: 'sale', fb: 1, ...at }); g.netMessage({ t: 'sale', fb: 1, ...at });
      if (k.calls.length !== 1) bad.push('three messages inside 0.12 s played ' + k.calls.length + ' coins');
      g.coinCd = 0; g.sound._win = null; g.netMessage({ t: 'sale', fb: 1, ...at }); if (k.calls.length !== 2) bad.push('no coin after the cooldown');
    } finally { k.restore(); }
    if (sent.some((m) => m.t === 'cmd' && m.c === 'sell')) bad.push('the guest sold the plush back to the host');
    if (S().money !== money || S().stats.sold !== sold) bad.push('the guest changed its own money or sales');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.gaps.a-vault-count-reaches-the-guests-hover-readout', async () => {
    fresh({ belts: 1, vault: 1 }); role('host'); cap(); g.remote = fakeRemote(new V3(-100, 0, 0)); const bad = [];
    for (const t of tiles()) L().remove(t);
    const b = bp(); const e = { id: g.nextId(), type: 'vault', i: toI(b.x - 6), j: 0, k: toK(b.z + 6), dir: 0, rise: 0, items: [] }; S().entities.push(e); g.addEntity(e); const v = L().byId.get(e.id);
    for (let n = 0; n < 7; n++) v.stored.push({ sp: 2, vr: 0 });
    const hostInfo = JSON.stringify(infoFor(g, { kind: 'tile', id: v.id })); if (!/7 of/.test(hostInfo)) bad.push('host readout: ' + hostInfo);
    sent.length = 0; g.sendDyn(); const dyn = ofType('dyn')[0]; if (!dyn) return 'no dyn message';
    const row = dyn.tiles.find((a) => a[0] === v.id); if (!row || row[7] !== 7) bad.push('the dyn row of the vault carries ' + (row && row[7]));
    // the guest: its vault has no stored array contents (they never travel)
    done(); role('guest'); v.stored = []; g.netMessage(json(dyn)); const guestInfo = JSON.stringify(infoFor(g, { kind: 'tile', id: v.id }));
    if (guestInfo !== hostInfo) bad.push(`guest readout differs: ${guestInfo} vs ${hostInfo}`);
    // it follows the host down as well as up
    done(); role('host'); cap(); v.stored.length = 0; v.stored.push({ sp: 2, vr: 0 }); g.sendDyn(); const d2 = ofType('dyn')[0]; done(); role('guest'); g.netMessage(json(d2)); if (!/1 of/.test(JSON.stringify(infoFor(g, { kind: 'tile', id: v.id })))) bad.push('the count did not follow the host down');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.gaps.the-leveling-pad-says-why-it-skipped-and-how-powered-it-is-on-both-screens', async () => {
    X.setup(); const bad = [];
    const i = X.ci(-12), k = X.ck(-2.2);
    const e = g.placeEntity('levelpad', { i, j: 0, k, dir: 0, size: 1, mk: 'timber', on: false, st: 'blocked', slot: 1, skip: 1, laid: 0, dug: 3, rid: 'levelpad', grp: 1, why: 'something solid is in the way' }, { quiet: true });
    try {
      e.pw = 0.62; role('host'); cap(); g.remote = fakeRemote(new V3(-100, 0, 0));
      const hostInfo = JSON.stringify(infoFor(g, { kind: 'mach', id: e.id })); if (!/something solid is in the way/.test(hostInfo) || !/Powered 62%/.test(hostInfo)) bad.push('host readout: ' + hostInfo);
      const row = json(B.levelRow(g)); done(); role('guest');
      delete e.why; delete e.pw; delete e.pwv; e.st = 'idle'; e.slot = 0; e.skip = 0; e.dug = 0; B.applyLevelRow(g, row);
      const guestInfo = JSON.stringify(infoFor(g, { kind: 'mach', id: e.id })); if (guestInfo !== hostInfo) bad.push(`guest readout differs:\n  guest ${guestInfo}\n  host  ${hostInfo}`);
    } finally { done(); g.doDecon({ kind: 'mach', id: e.id }); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.gaps.a-cart-waiting-in-a-queue-reads-the-same-on-the-guest', async () => {
    X.setup(); role('host'); cap(); g.remote = fakeRemote(new V3(-100, 0, 0)); const bad = [], s = X.std(), f = s.car; adv(0.5);
    const lead = X.cart(s.iFace + 14, 0, s.k); R.invalidate(g); adv(0.3);
    R.dispatch(g, f, R.keyOf(s.base)); X.until(() => f.st === 'run' && (f.spd || 0) < 0.02 && /cart/i.test(f.why || ''), 20);
    if (!/cart/i.test(f.why || '')) return 'the follower never waited: ' + f.st + ' ' + f.why;
    sent.length = 0; adv(0.2); const rows = ofType('xrow').filter((m) => m.k === 'railcar'); const row = rows[rows.length - 1]; if (!row) return 'no cart row while waiting';
    const hostInfo = JSON.stringify(infoFor(g, { kind: 'mach', id: f.id }));
    const plus = S().entities.filter((e) => R.isRailType(e.type)).map((e) => ({ t: 'ent+', ent: g.stripEnt(e) }));
    for (const e of S().entities.filter((x) => R.isRailType(x.type))) { if (e.type === 'rail') g.world.reserved.delete(R.keyOf(e)); g.removeViewEnt(e.id); } R.invalidate(g);
    done(); role('guest'); cap(); for (const m of plus) g.netMessage(json(m)); R.invalidate(g); R.sync(g, true);
    g.netMessage(json({ t: 'xrow', k: 'railcar', d: { cars: row.d.cars, stns: [] } }));
    const gf = S().entities.find((e) => e.id === f.id); const guestInfo = JSON.stringify(infoFor(g, { kind: 'mach', id: gf.id }));
    if (!/Waiting for the cart ahead/.test(guestInfo)) bad.push('the guest does not see the wait: ' + guestInfo);
    const strip = (s2) => s2.replace(/Line speed[^"]*"/, '"');   // the line speed needs the station rows, which this row leaves out
    if (strip(guestInfo) !== strip(hostInfo)) bad.push(`readouts differ:\n  guest ${guestInfo}\n  host  ${hostInfo}`);
    void lead;
    return bad.length === 0 || bad.join(' || ');
  });
}
