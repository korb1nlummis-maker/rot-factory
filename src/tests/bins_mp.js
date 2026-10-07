// mp.bins.*: bins with a friend. The host simulates and sells; a guest asks (`cfg` for machines and belt ends, `bindest` for bots and its own cart), the host checks every
// request, the ents, the crew rows, the cart and the bins' own 0.5 s row carry what a guest's panels and readouts show. One page plays both roles by switching g.net.role.
// Run: `await __selftest('mp.bins.')`
import { kit } from './bins_lib.js';
import * as BINS from '../bins.js';
import * as BP from '../binspanel.js';
import * as XT from '../ext.js';
import { infoFor } from '../info.js';
import { TYPES } from '../catalog.js';

export default async function (ctx) {
  const { g, S, L, toI, toK, craft } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const ofType = (t) => K.sent.filter((m) => m.t === t);
  const cmds = (c) => K.sent.filter((m) => m.t === 'cmd' && m.c === c);
  const val = (sp) => g.valueOf(sp, 0, 0);
  // the guest's view of the crew and the carts replaces S.crew and S.cart on this one page: keep the host's own and put them back
  const keep = () => ({ crew: S().crew, cart: S().cart, hcart: S().hcart });
  const restore = (k) => { S().crew = k.crew; S().cart = k.cart; S().hcart = k.hcart; g.crew.sync(); };
  const showAsGuest = (plus) => { K.done(); K.role('guest'); K.cap(); g.netMessage(K.json(plus)); };

  await G('mp.bins.host-announces-a-bin-with-ent-minus-then-ent-plus-and-a-guest-asks-with-cfg', async () => {
    const bad = [], d = K.beacon(8, 10, { name: 'Deep' }); K.run(0.2); const tk = K.mkEarth('truck', toI(-2), toK(2)), belt = K.rawTile('belt', toI(-4), toK(0), { dir: 0 }), mech = K.rawTile('mech', toI(-6), toK(0), { dir: 0, buf: [] });
    for (const [name, ent] of [['truck', tk], ['belt end', belt], ['mech', mech]]) {
      K.role('host'); K.cap(); const r = g.setCfg(ent, { dest: d.id }); const minus = K.sent.findIndex((m) => m.t === 'ent-' && m.id === ent.id), plus = K.sent.findIndex((m) => m.t === 'ent+' && m.ent.id === ent.id);
      if (!r.ok || minus < 0 || plus < minus) bad.push(`${name}: host order ${K.sent.map((m) => m.t)}`);
      const ann = K.sent[plus] && K.sent[plus].ent; if (!ann || ann.dest !== d.id) bad.push(name + ': ent+ does not carry the bin');
      // a guest sees the ent with the bin and asks to change it; its own copy waits for the host
      const plusMsg = K.json(K.sent[plus]); g.removeViewEnt(ent.id); showAsGuest(plusMsg);
      const view = L().byId.get(ent.id) || (g.machines.items.get(ent.id) || {}).ent; if (!view || view.dest !== d.id) { bad.push(name + ': guest copy ' + JSON.stringify(view && view.dest)); continue; }
      K.cap(); const gr = g.setCfg(view, { dest: BINS.HALL }); const cmd = cmds('cfg')[0];
      if (!gr.ok || !cmd || cmd.d.id !== ent.id || JSON.stringify(cmd.d.patch) !== '{"dest":-1}') bad.push(name + ': guest command ' + JSON.stringify(cmd));
      if (view.dest !== d.id) bad.push(name + ': the guest changed its own copy');
      // the host runs it as the guest
      K.done(); g.removeViewEnt(ent.id); const hostEnt = JSON.parse(JSON.stringify({ ...ent, view: undefined })); S().entities.push(hostEnt); g.addEntity(hostEnt); K.role('host'); K.cap(); g.netMessage(K.json(cmd));
      const he = L().byId.get(ent.id) || (g.machines.items.get(ent.id) || {}).ent; if (!he || he.dest !== BINS.HALL) bad.push(name + ': host did not apply ' + (he && he.dest));
      K.done();
      // for the next ent on this loop
      if (name === 'truck') { Object.assign(tk, he); }
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await G('mp.bins.a-guest-picks-the-bin-of-a-bot-and-of-its-own-cart-through-bindest', async () => {
    const bad = [], d = K.beacon(8, 10); K.run(0.2); const b = K.mkBot(2, 5); craft('cart:1'); g.useCart(); S().gcart = { tier: 1, mode: 'follow', x: 0, y: 0, z: 0, yaw: 0, load: [] };
    // guest side: the bot as the guest sees it, and its own cart (S.cart on the guest)
    const hostSide = keep(); K.role('host'); K.cap(); g.sendDyn(); const dyn = ofType('dyn')[0]; K.done(); K.role('guest'); K.cap(); g.applyDyn(K.json(dyn)); const v = S().crew.find((x) => x.id === b.id); if (!v || v === b) return 'the guest has no view of the bot';
    let r = BINS.assign(g, { k: 'bot', o: v }, d.id); let cmd = cmds('bindest')[0];
    if (!r.ok || !cmd || cmd.d.k !== 'bot' || cmd.d.id !== b.id || cmd.d.dest !== d.id) bad.push('bot command ' + JSON.stringify(cmd));
    if (v.dest) bad.push('the guest set it on its own view');
    // the host applies it
    K.done(); restore(hostSide); K.role('host'); K.cap(); g.netMessage(K.json(cmd)); if (b.dest !== d.id) bad.push('the host did not set the bot: ' + b.dest);
    // dyn carries it back
    K.cap(); g.sendDyn(); const dyn2 = ofType('dyn')[0]; const row = dyn2.crew.find((q) => q[0] === b.id); if (!row || row[17] !== d.id) bad.push('crew row ' + JSON.stringify(row && row.slice(15)));
    K.done(); K.role('guest'); g.applyDyn(K.json(dyn2)); const v2 = S().crew.find((x) => x.id === b.id); if (v2.dest !== d.id) bad.push('the guest does not see the bot\'s bin');
    if (!/unloads at Depot A \(\d+ m\)/.test(g.crew.statusLine(v2))) bad.push('guest status line: ' + g.crew.statusLine(v2));
    K.done(); restore(hostSide);
    // its own cart
    K.role('host'); K.cap(); g.sendDyn(); const dynC = ofType('dyn')[0]; K.done(); K.role('guest'); K.cap(); g.applyDyn(K.json(dynC)); const mine = S().cart; if (!mine) return 'the guest has no cart view';
    r = BINS.assign(g, { k: 'cart', o: mine, key: 'cart' }, BINS.HALL); cmd = cmds('bindest').find((m) => m.d.k === 'cart');
    if (!r.ok || !cmd) bad.push('cart command ' + JSON.stringify(cmd));
    K.done(); restore(hostSide); K.role('host'); K.cap(); const hostCart = S().cart; g.netCmd('bindest', K.json(cmd.d));
    if (S().gcart.dest !== BINS.HALL || hostCart.dest) bad.push(`the command must set the guest's own cart: gcart ${S().gcart.dest} host cart ${hostCart.dest}`);
    // dyn gives it back as the guest's cart view
    K.cap(); g.sendDyn(); const dynD = ofType('dyn')[0]; if (!dynD.gcart || dynD.gcart.dest !== BINS.HALL || dynD.cart.dest) bad.push('packed carts ' + JSON.stringify([dynD.cart && dynD.cart.dest, dynD.gcart && dynD.gcart.dest]));
    K.done(); K.role('guest'); g.applyDyn(K.json(dynD)); if (S().cart.dest !== BINS.HALL) bad.push('the guest cart view lost its bin');
    K.done(); restore(hostSide);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('mp.bins.forged-requests-are-refused-with-a-toast-and-change-nothing', async () => {
    const bad = [], d = K.beacon(8, 10); K.run(0.2); const b = K.mkBot(2, 5), tk = K.mkEarth('truck', toI(-2), toK(2)), vault = K.rawTile('vault', toI(-3), toK(7)), frame = K.mach('frame', -4, 12, { kind: 'timber', cx: -4, cz: 12, y0: 0, w: 4, h: 4 });
    craft('cart:1'); g.useCart(); S().gcart = { tier: 1, mode: 'follow', x: 0, y: 0, z: 0, yaw: 0, load: [] };
    K.role('host'); K.cap();
    const forged = [
      ['bindest', { k: 'bot', id: b.id, dest: 1.5 }], ['bindest', { k: 'bot', id: b.id, dest: '3' }], ['bindest', { k: 'bot', id: b.id, dest: 999999 }], ['bindest', { k: 'bot', id: b.id, dest: -2 }], ['bindest', { k: 'bot', id: b.id, dest: tk.id }],
      ['bindest', { k: 'bot', id: 424242, dest: d.id }], ['bindest', { k: 'bot', dest: d.id }], ['bindest', { k: 'ent', id: tk.id, dest: d.id }], ['bindest', { k: 'cart', key: 'cart', dest: 999999 }], ['bindest', null], ['bindest', 5], ['bindest', 'bot'],
      ['cfg', { id: tk.id, patch: { dest: 1.5 } }], ['cfg', { id: tk.id, patch: { dest: tk.id } }], ['cfg', { id: tk.id, patch: { dest: 99999 } }], ['cfg', { id: tk.id, patch: { dest: d.id, bogus: 1 } }],
      ['cfg', { id: vault.id, patch: { dest: d.id } }], ['cfg', { id: frame.id, patch: { dest: d.id } }], ['cfg', { id: b.id, patch: { dest: d.id } }], ['cfg', { id: tk.id, patch: JSON.parse('{"__proto__":{"dest":1}}') }],
    ];
    for (const [c, dd] of forged) {
      K.sent.length = 0; g.netMessage({ t: 'cmd', c, d: K.json(dd) });
      if (K.sent.some((m) => m.t === 'ent+' || m.t === 'ent-')) bad.push('a refused request was announced: ' + c + ' ' + JSON.stringify(dd));
      if (dd && typeof dd === 'object' && !K.sent.some((m) => m.t === 'toast')) bad.push('no toast for ' + c + ' ' + JSON.stringify(dd));
    }
    if (b.dest || tk.dest || vault.dest || frame.dest || S().gcart.dest || S().cart.dest || ({}).dest) bad.push(`something changed: bot ${b.dest} truck ${tk.dest} vault ${vault.dest} frame ${frame.dest} carts ${S().gcart.dest}/${S().cart.dest}`);
    // a request that is fine goes through, for the right cart
    K.sent.length = 0; g.netMessage({ t: 'cmd', c: 'bindest', d: { k: 'cart', dest: d.id } }); if (S().gcart.dest !== d.id || S().cart.dest) bad.push(`a guest asked for its cart: gcart ${S().gcart.dest} host cart ${S().cart.dest}`);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('mp.bins.the-hosts-sales-and-fallbacks-reach-the-guest-as-toasts-and-a-guest-never-clears-anything', async () => {
    const bad = [], d = K.beacon(8, 10); K.run(0.2); const tk = K.mkEarth('truck', toI(-2), toK(2)); g.setCfg(tk, { dest: d.id });
    // host: a dark bin says so on both screens
    K.role('host'); K.cap(); K.off.add(d.id); K.run(0.2); g._binSaid = new Map(); const r = BINS.resolve(g, d.id); BINS.fallback(g, { k: 'ent', o: tk }, r.why, r.named.name);
    const t = ofType('toast')[0]; if (!t || !/Haul Truck: Depot A has no power/.test(t.text)) bad.push('toast to the guest: ' + JSON.stringify(t));
    // a bin that is gone: host clears and re-announces the ent
    K.sent.length = 0; K.gone(d); BINS.onBeaconGone(g, d.id); if (tk.dest) bad.push('not cleared'); if (!K.sent.some((m) => m.t === 'ent+' && m.ent.id === tk.id && !m.ent.dest)) bad.push('the guest was not told the bin is gone: ' + K.sent.map((m) => m.t));
    // guest: nothing is simulated or cleared there
    K.done(); K.role('guest'); K.cap(); const e2 = K.beacon(8, 12); const tk2 = { ...tk, id: g.nextId(), dest: 99999, view: true }; S().entities.push(tk2); g.addEntity(tk2);
    BINS.fallback(g, { k: 'ent', o: tk2 }, 'gone'); if (tk2.dest !== 99999 || K.sent.length) bad.push('a guest cleared or sent: ' + tk2.dest + ' ' + K.sent.length); void e2;
    return bad.length === 0 || bad.join(' || ');
  });

  await G('mp.bins.the-bins-row-gives-a-guest-power-sales-and-numbers-and-a-late-joiner-sees-names', async () => {
    const bad = [], a = K.beacon(8, 10, { name: 'Deep Dig' }), b = K.beacon(-2, 9); K.run(0.2); BINS.ensureNums(g); BINS.note(g, a.id, 7, 700); BINS.note(g, BINS.HALL, 3, 90);
    K.off.add(b.id); K.run(0.2);
    K.role('host'); K.cap(); const row = TYPES.beacon.row(g); if (!row) return 'no row'; K.sent.length = 0; XT.update(g, 0.6, false); const xr = ofType('xrow').find((m) => m.k === 'beacon');
    if (!xr) return 'the host did not send the row: ' + K.sent.map((m) => m.t);
    // a late joiner: the world message lists every ent with its name and number; drop them all and apply what the host sent
    K.sent.length = 0; g.sendWorld(); const lists = ofType('ents'); const all = lists.flatMap((m) => m.list);
    const ea = all.find((e) => e.id === a.id), eb = all.find((e) => e.id === b.id); if (!ea || ea.name !== 'Deep Dig' || ea.num !== 0 || !eb || eb.num !== 1) bad.push('world ents: ' + JSON.stringify([ea && [ea.name, ea.num], eb && [eb.name, eb.num]]));
    const rowMsg = K.json(xr); const stats = K.json(S().binStats);
    K.done(); for (const e of [a, b]) g.removeViewEnt(e.id); K.role('guest'); K.cap(); S().binStats = {};
    for (const e of [ea, eb]) g.netMessage({ t: 'ent+', ent: K.json({ ...e }) });
    const ga = g.machines.items.get(a.id).ent, gb = g.machines.items.get(b.id).ent;
    ga.pw = 0; gb.pw = 1;   // (whatever the ents carried when they were announced: the row is what keeps power right)
    g.netMessage(rowMsg);
    if (!(ga.pw > 0.5) || gb.pw !== 0) bad.push(`power on the guest: ${ga.pw} ${gb.pw}`);
    if (BINS.today(g, a.id).n !== 7 || BINS.today(g, a.id).v !== 700 || BINS.today(g, BINS.HALL).n !== 3 || JSON.stringify(S().binStats) !== JSON.stringify(stats)) bad.push('sales on the guest: ' + JSON.stringify(S().binStats));
    // what the guest's panel and readouts show
    const ops = BP.options(g, null); const names = ops.filter((o) => o.kind !== 'auto').map((o) => o.name).join(); if (names !== 'SORT bin,Deep Dig,Depot B') bad.push('guest names ' + names);
    if (!ops.find((o) => o.id === a.id).powered || ops.find((o) => o.id === b.id).powered) bad.push('guest power flags');
    const info = infoFor(g, { kind: 'mach', id: a.id }); if (!/DEEP DIG/.test(info.title) || !info.lines.some((l) => /Sold here today: 7 plush for ◈700/.test(l))) bad.push('guest beacon readout: ' + info.title + ' ' + info.lines);
    // a row from a guest is never believed by a host
    K.done(); K.role('host'); ga.pw = 0; g.netMessage({ t: 'xrow', k: 'beacon', d: { pw: [a.id, 100, 0], st: { 5: { d: 1, n: 99, v: 99, tn: 99, tv: 99 } } } }); if (ga.pw !== 0 && ga.pw !== undefined) bad.push('a host believed a row'); if (S().binStats[5]) bad.push('a host took a guest\'s tally');
    return bad.length === 0 || bad.join(' || ');
  });

  await G('mp.bins.a-guests-sell-command-counts-at-a-real-bin-only-and-the-money-is-the-same', async () => {
    const bad = [], d = K.beacon(8, 10); K.run(0.2); K.role('host'); K.cap();
    const m0 = S().money; g.netMessage({ t: 'cmd', c: 'sell', d: { sp: 3, vr: 0, dist: 0, streak: false, bin: d.id } }); const paid1 = S().money - m0;
    const m1 = S().money; g.netMessage({ t: 'cmd', c: 'sell', d: { sp: 3, vr: 0, dist: 0, streak: false, bin: BINS.HALL } }); const paid2 = S().money - m1;
    if (paid1 !== paid2 || !(paid1 > 0)) bad.push(`depot paid ${paid1}, bin paid ${paid2}`);
    for (const junk of [999999, '5', 1.5, null, {}, -7]) { const h = BINS.today(g, BINS.HALL).n; g.netMessage({ t: 'cmd', c: 'sell', d: { sp: 3, vr: 0, dist: 0, bin: junk } }); if (BINS.today(g, BINS.HALL).n !== h + 1) bad.push('a bad bin id ' + JSON.stringify(junk) + ' should count at the SORT bin'); }
    if (BINS.today(g, d.id).n !== 1) bad.push('depot tally ' + BINS.today(g, d.id).n);
    void val;
    return bad.length === 0 || bad.join(' || ');
  });

  await G('mp.bins.the-sort-bin-and-depots-are-listed-the-same-on-both-screens', async () => {
    const bad = [], a = K.beacon(8, 10, { name: 'Deep Dig' }), c = K.beacon(-2, 9); K.run(0.2); BINS.ensureNums(g);
    const host = BINS.listBins(g).map((b) => `${b.id === BINS.HALL ? 'hall' : b.name}`).join();
    K.role('host'); K.cap(); const mine = [a, c].map((e) => K.json(g.stripEnt(e))); K.done();
    for (const e of [a, c]) g.removeViewEnt(e.id); K.role('guest'); for (const e of mine) g.netMessage({ t: 'ent+', ent: e });
    const guest = BINS.listBins(g).map((b) => `${b.id === BINS.HALL ? 'hall' : b.name}`).join(); if (guest !== host) bad.push(`host ${host} guest ${guest}`);
    // an old ent that has no number (an old save sent before the host numbered it) still gets its place-order name on the guest
    const e3 = { id: g.nextId(), type: 'beacon', x: -4, y: 0, z: 9, i: toI(-4), j: 0, k: toK(9), view: true }; S().entities.push(e3); g.addEntity(e3);
    if (!/^Depot [A-Z]$/.test(BINS.nameOf(g, e3))) bad.push('unnumbered beacon on a guest: ' + BINS.nameOf(g, e3));
    return bad.length === 0 || bad.join(' || ');
  });
}
