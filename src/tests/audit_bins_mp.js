// mp.bins.audit.*: the audit of the bins wave with a friend: forged bot orders and names, a guest renaming a depot, and a late joiner who is sent a depot saved before bins had numbers.
// One page plays both roles by switching g.net.role, like mp_bins. Run: `await __selftest('mp.bins.audit')`
import { kit } from './bins_lib.js';
import * as BINS from '../bins.js';

export default async function (ctx) {
  const { g, S, toI, toK } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const ofType = (t) => K.sent.filter((m) => m.t === t);

  await G('mp.bins.audit-a-forged-bot-order-names-no-bin-it-is-not-and-changes-nothing', async () => {
    const bad = [], d = K.beacon(8, 10, { num: 0 }); K.run(0.2); const b = K.mkBot(2, 5), vault = K.rawTile('vault', toI(-3), toK(7)), tk = K.mkEarth('truck', toI(-2), toK(2));
    K.role('host'); K.cap();
    const tgts = [{ k: 'bin', id: vault.id }, { k: 'bin', id: tk.id }, { k: 'bin', id: 0 }, { k: 'bin', id: -2 }, { k: 'bin', id: 1e9 }, { k: 'bin', id: '5' }, { k: 'bin', id: 1.5 }, { k: 'bin', id: { a: 1 } }, { k: 'bin', id: null }, { k: 'bin', id: [d.id] }, { k: 'bin', id: NaN }];
    for (const tgt of tgts) {
      K.sent.length = 0; b.dest = 0; let threw = null;
      try { g.netMessage({ t: 'cmd', c: 'crew', d: K.json({ act: 'ctx', id: b.id, tgt }) }); } catch (e) { threw = e.message; }
      if (threw) bad.push('threw on ' + JSON.stringify(tgt) + ': ' + threw);
      if (b.dest) bad.push('a forged bin ' + JSON.stringify(tgt) + ' set the bot\'s bin to ' + b.dest);
      if (!K.sent.some((m) => m.t === 'toast')) bad.push('no answer for ' + JSON.stringify(tgt));
    }
    // the real ones still work
    K.sent.length = 0; g.netMessage({ t: 'cmd', c: 'crew', d: K.json({ act: 'ctx', id: b.id, tgt: { k: 'bin', id: d.id } }) }); if (b.dest !== d.id) bad.push('a real depot was refused: ' + b.dest);
    g.netMessage({ t: 'cmd', c: 'crew', d: K.json({ act: 'ctx', id: b.id, tgt: { k: 'bin' } }) }); if (b.dest !== BINS.HALL && b.dest !== 0) bad.push('the SORT bin order left ' + b.dest);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('mp.bins.audit-a-guest-renames-a-depot-and-both-screens-show-the-same-clean-name', async () => {
    const bad = [], d = K.beacon(8, 10, { num: 0 }); K.run(0.2);
    K.role('host'); K.cap();
    const tries = [['Deep Dig', 'Deep Dig'], ['<img src=x onerror=alert(1)>', 'img src=x onerror=al'], ['​‮', ''], ['x'.repeat(40), 'x'.repeat(20)], [7, null], [null, null], [['a'], null], [{ n: 1 }, null], ['  ', '']];
    for (const [typed, want] of tries) {
      K.sent.length = 0; const before = d.name; g.netMessage({ t: 'cmd', c: 'cfg', d: K.json({ id: d.id, patch: { name: typed } }) });
      const plus = ofType('ent+').find((m) => m.ent.id === d.id);
      if (want === null) { if (plus || d.name !== before) bad.push('a name of ' + JSON.stringify(typed) + ' was taken: ' + JSON.stringify(d.name)); if (!ofType('toast').length) bad.push('no answer for ' + JSON.stringify(typed)); continue; }
      if (d.name !== want) bad.push(`typed ${JSON.stringify(typed)}, kept ${JSON.stringify(d.name)}, wanted ${JSON.stringify(want)}`);
      if (!plus || plus.ent.name !== want) bad.push('the guest was told ' + JSON.stringify(plus && plus.ent.name) + ' not ' + JSON.stringify(want));
      if (BINS.nameOf(g, d) !== (want || 'Depot A')) bad.push('the name shown: ' + BINS.nameOf(g, d));
    }
    // a depot's name is all a guest may change on it: nothing else rides along
    K.sent.length = 0; g.netMessage({ t: 'cmd', c: 'cfg', d: K.json({ id: d.id, patch: { name: 'ok', dest: BINS.HALL } }) }); if (d.dest || d.name === 'ok') bad.push('a patch with a bin on a depot was half applied: ' + JSON.stringify([d.name, d.dest]));
    g.netMessage({ t: 'cmd', c: 'cfg', d: K.json({ id: d.id, patch: JSON.parse('{"__proto__":{"name":"x"},"name":"p"}') }) }); if (({}).name !== undefined) bad.push('the prototype was touched');
    return bad.length === 0 || bad.join(' || ');
  });

  await G('mp.bins.audit-a-late-joiner-gets-depots-saved-before-bins-had-numbers-with-the-same-names-as-the-host', async () => {
    const bad = [], a = K.beacon(8, 10), b = K.beacon(-2, 9); K.run(0.2);
    if (Number.isInteger(a.num) || Number.isInteger(b.num)) return 'the fixture should have no numbers';
    K.role('host'); K.cap(); g.sendWorld(); const all = ofType('ents').flatMap((m) => m.list), ea = all.find((e) => e.id === a.id), eb = all.find((e) => e.id === b.id);
    const host = BINS.listBins(g).map((x) => x.name).join();
    K.done(); for (const e of [a, b]) g.removeViewEnt(e.id); K.role('guest'); K.cap();
    for (const e of [ea, eb]) g.netMessage({ t: 'ent+', ent: K.json(e) });
    const guest = BINS.listBins(g).map((x) => x.name).join();
    if (guest !== host) bad.push(`the host lists ${host}, the guest ${guest}`);
    if (g.beaconList().map((x) => x.name).join() !== ['Sorting Bay 07', ...BINS.listBins(g).slice(1).map((x) => x.name)].join()) bad.push('the travel menu of the guest: ' + g.beaconList().map((x) => x.name));
    return bad.length === 0 || bad.join(' || ');
  });

  await G('mp.bins.audit-a-guests-sale-at-a-depot-that-is-gone-pays-the-same-and-counts-nowhere', async () => {
    const bad = [], d = K.beacon(8, 10, { num: 0 }); K.run(0.2); K.role('host'); K.cap();
    const val = g.valueOf(3, 0, 0), id = d.id; K.gone(d); BINS.onBeaconGone(g, id);
    const m0 = K.money(); g.netMessage({ t: 'cmd', c: 'sell', d: { sp: 3, vr: 0, dist: 0, streak: false, bin: id } });
    if (K.money() - m0 !== val) bad.push(`paid ${K.money() - m0}, worth ${val}`);
    if (S().binStats[id]) bad.push('a tally for a bin that is gone: ' + JSON.stringify(S().binStats[id]));
    return bad.length === 0 || bad.join(' || ');
  });
}
