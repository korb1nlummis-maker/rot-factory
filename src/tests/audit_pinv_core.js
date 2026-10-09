// audit.pinv.*: an adversary's pass over per-player inventories (src/playerinv.js). Each test tries to make an item, lose an item, or spend what is not yours.
import * as PIN from '../playerinv.js';

export default async function (ctx) {
  const { T, g, S, p, fresh, V3, recipes } = ctx;
  const FULL = { timber: 1, steel: 1, firstaid: 1, markers: 1, lantern: 1, struts: 1, jacks: 1, power: 1, belts: 1, crew: 1, claw: 1 };
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const fakeRemote = (x, y, z) => ({ pos: new V3(x, y, z), vel: new V3(), update() {}, dispose() {}, set() {}, setHeld() {}, spheres() { return []; } });
  const GB = () => PIN.invFor(g, 'g');
  const price = (id) => recipes(g).find((r) => r.id === id).price;
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); g.remote = null; g._actor = null; g.stowed = true; g.dead = false; } });
  const setup = () => { fresh(FULL); role('host'); cap(); g.remote = fakeRemote(2, 0, 0); p().pos.set(0, 0, 0); PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); };

  await guard('mp.pinv.audit.a-gift-into-a-bag-with-every-slot-used-is-refused-not-lost', async () => {
    setup(); S().items = { marker: 5 };
    const full = {}; for (let n = 0; n < PIN.BAG_IDS; n++) full['junk' + n] = 1;
    PIN.curBag(g).items = full;
    const r = PIN.hostGive(g, 'marker', 3); PIN.capBag(PIN.curBag(g));
    const tot = (S().items.marker | 0) + (GB().marker | 0);
    // and the other way round: the host bag is full of kinds, the friend gives
    S().items = { marker: 0 }; delete S().items.marker; for (let n = 0; n < PIN.BAG_IDS; n++) S().items['hjunk' + n] = 1; GB().marker = 4; delete PIN.curBag(g).items.junk0;
    g.netCmd('giveitem', { id: 'marker', n: 2 });
    const tot2 = (S().items.marker | 0) + (GB().marker | 0);
    return (tot === 5 && tot2 === 4 && !r.ok) || `host to friend total ${tot} (want 5, ok=${r.ok}), friend to host total ${tot2} (want 4)`;
  });

  await guard('mp.pinv.audit.a-friends-huge-craft-is-not-charged-for-what-the-bag-cannot-hold', async () => {
    setup(); S().money = 1e9; const m0 = S().money;
    g.netCmd('craft', { id: 'marker', n: 1e6 });
    const got = GB().marker | 0, paid = m0 - S().money;
    return paid === got * price('marker') || `paid ${paid} for ${got} markers (${got * price('marker')} fair)`;
  });

  await guard('mp.pinv.audit.a-forged-tool-kind-cannot-turn-a-marker-into-a-rig', async () => {
    setup(); GB().marker = 2; S().money = 1e7;
    const before = S().entities.filter((e) => e.type === 'claw').length;
    g.netCmd('place', { tool: { id: 'marker', kind: 'claw' }, ent: { type: 'claw', x: 30, y: 0, z: 30 } });
    g.netCmd('place', { tool: { id: 'marker', kind: 'borer' }, ent: { type: 'borer', x: 40, y: 0, z: 40 } });
    const made = S().entities.filter((e) => e.type === 'claw' || e.type === 'borer').length - before;
    for (const e of [...S().entities]) if (e.type === 'claw' || e.type === 'borer') { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } }
    S().entities = S().entities.filter((e) => e.type !== 'claw' && e.type !== 'borer');
    return made === 0 || `${made} rigs made from markers`;
  });

  await guard('mp.pinv.audit.a-dead-player-cannot-hand-items-over', async () => {
    setup(); S().items = { marker: 3 }; g.dead = true;
    const r = PIN.giveKey(g, 'marker', 1);
    g.dead = false;
    return (!r && S().items.marker === 3 && !GB().marker) || `gave while dead: ${JSON.stringify([r, S().items, GB()])}`;
  });

  await guard('mp.pinv.audit.reconnect-and-replay-never-grow-a-bag', async () => {
    setup(); GB().marker = 4; PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); PIN.hello(g, { name: 'Ann', pid: 'annpid123456' });
    const b = PIN.snapshot(g), m = b.i; const i = m.indexOf('marker');
    const bags = Object.keys(S().ginv.bags).length;
    return (m[i + 1] === 4 && bags === 1) || `marker ${m[i + 1]} bags ${bags}`;
  });

  await guard('mp.pinv.audit.hb-flood-and-invsync-flood-stay-small', async () => {
    setup(); GB().marker = 2; sent.length = 0;
    for (let n = 0; n < 60; n++) { g.netCmd('hb', { h: ['hammer', 'marker', null, null, null, null, null, null, null], s: n % 9, st: 0 }); g.netCmd('invsync', {}); }
    const inv = sent.filter((m) => m.t === 'inv');
    return inv.length <= 12 || `${inv.length} inv messages for 60 hb and 60 invsync`;
  });

  await guard('mp.pinv.audit.the-guest-cannot-name-the-hosts-bag-with-a-pid-or-an-actor-field', async () => {
    setup(); S().items = { marker: 5 }; const keep = JSON.stringify(S().items);
    const bad = [];
    for (const [c, d] of [['spend', { id: 'marker', who: 'h', pid: 'h', actor: 'h' }], ['craft', { id: 'marker', n: 1, who: 'h', pid: 'h' }], ['place', { tool: { id: 'marker', kind: 'marker', who: 'h' }, ent: { x: 9, y: 0, z: 9 }, who: 'h' }]]) {
      g.netCmd(c, d); if (JSON.stringify(S().items) !== keep) { bad.push(c + ' changed the host bag ' + JSON.stringify(S().items)); S().items = { marker: 5 }; }
    }
    return bad.length === 0 || bad.join('; ') + ' guest ' + JSON.stringify(GB());
  });
  await guard('mp.pinv.audit.the-late-join-snapshot-of-a-full-bag-stays-small', async () => {
    setup(); const b = PIN.curBag(g); for (let n = 0; n < PIN.BAG_IDS; n++) { b.items['item' + n] = 9999; b.mats['mat' + n] = 9999; }
    const m = PIN.snapshot(g), size = JSON.stringify(m).length;
    return size < 6500 || `a full bag snapshot is ${size} bytes`;
  });

  await guard('mp.pinv.audit.a-piece-taken_down_twice_refunds_once_and_a_rejoin_keeps_the_owner', async () => {
    setup(); const bad = [];
    GB().marker = 2; const x = 40;
    g.netCmd('place', { tool: { id: 'marker', kind: 'marker' }, ent: { x, y: 0, z: 5 } });
    const e = S().entities.find((q) => q.type === 'marker' && Math.abs(q.x - x) < 0.5);
    if (!e) return 'the friend could not place a marker: ' + JSON.stringify(GB());
    if (e.own !== PIN.curBag(g).n) bad.push('owner mark ' + e.own);
    // the friend leaves and comes back from a browser that forgot its id: the same name gets the bag, and the piece still belongs to it
    PIN.guestLeft(g); PIN.hello(g, { name: 'Ann', pid: 'newpid987654' });
    if (e.own !== PIN.curBag(g).n) bad.push('owner mark does not follow the bag ' + e.own + ' vs ' + PIN.curBag(g).n);
    const before = (GB().marker | 0) + (S().items.marker | 0);
    g.doDecon({ kind: 'mach', id: e.id }); g.doDecon({ kind: 'mach', id: e.id }); g.netCmd('decon', { kind: 'mach', id: e.id });
    const after = (GB().marker | 0) + (S().items.marker | 0);
    if (after !== before + 1) bad.push(`taken down three times: ${before} -> ${after}`);
    if ((GB().marker | 0) !== 2 || (S().items.marker | 0) !== 0) bad.push('the refund went to the wrong bag ' + JSON.stringify([GB(), S().items]));
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.pinv.audit.a-hotbar-report-of-items-not-owned-gives-nothing', async () => {
    setup(); S().items = { marker: 3 }; const before = S().entities.length;
    g.netCmd('hb', { h: ['hammer', 'marker', 'lantern', null, null, null, null, null, null], s: 1, st: 0 });
    g.netCmd('place', { tool: { id: 'marker', kind: 'marker' }, ent: { x: 50, y: 0, z: 5 } });
    g.netCmd('place', { tool: { id: 'lantern', kind: 'lantern' }, ent: { x: 54, y: 0, z: 5 } });
    return (S().entities.length === before && S().items.marker === 3) || `placed from nothing: ${S().entities.length - before} pieces, host bag ${JSON.stringify(S().items)}`;
  });
}
