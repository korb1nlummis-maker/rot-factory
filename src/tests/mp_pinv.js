// mp.pinv.*: per-player inventories in co-op (DESIGN_SATISFACTORY.md section 19, src/playerinv.js). No network: one page plays both roles by switching g.net.role and
// capturing g.netSend (like mp_core.js). The host's bag is S.items; a friend's is PIN.invFor(g, 'g'). A friend's page is played by a mirror: its own S.items, hotbar and
// message state, swapped in only while an `inv` message is applied (asGuest below).
import * as PIN from '../playerinv.js';
import * as NG from '../netgame.js';
import { RemotePlayer } from '../net.js';
import { mulberry32 } from '../util.js';
import { CACHE } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, p, fresh, V3, recipes, realSleep } = ctx;
  const FULL = { timber: 1, steel: 1, firstaid: 1, markers: 1, lantern: 1, struts: 1, jacks: 1, power: 1, belts: 1, crew: 1, claw: 1 };
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [], mirror, gruntime, gout, traffic = {};
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; traffic = {}; g.netSend = (m) => { const j = json(m); sent.push(j); const o = traffic[j.t] || (traffic[j.t] = { n: 0, b: 0 }); o.n++; o.b += JSON.stringify(j).length; }; };
  const done = () => { delete g.netSend; role(null); };
  const GB = () => PIN.invFor(g, 'g');
  const HB = () => PIN.invFor(g, 'h');
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); g.remote = null; g._actor = null; g.stowed = true; } });
  const setup = (up = FULL) => {
    fresh(up); role('host'); cap(); g.remote = fakeRemote(2, 0, 0); p().pos.set(0, 0, 0);
    mirror = { items: {}, mats: {}, hotbar: ['hammer', null, null, null, null, null, null, null, null], bi: 0, st: true, myN: 0 }; gruntime = null; gout = [];
  };
  const fakeRemote = (x, y, z) => ({ pos: new V3(x, y, z), vel: new V3(), update() {}, dispose() {}, set() {}, setHeld() {}, spheres() { return []; } });
  const price = (id) => recipes(g).find((r) => r.id === id).price;
  const ofType = (t) => sent.filter((m) => m.t === t);
  const eq = (a, b) => JSON.stringify(Object.keys(a).sort().map((k) => [k, a[k]])) === JSON.stringify(Object.keys(b).sort().map((k) => [k, b[k]]));
  // the friend's page: apply messages to its own mirror (its own S.items, hotbar and message state), the host's state put back after
  const asGuest = (msgs) => {
    const keep = { items: S().items, mats: S().mats, hotbar: S().hotbar, bi: g.buildIdx, st: g.stowed, myN: g._myN, pig: g._pig, send: g.netSend, role: g.net.role, open: g.net.open, ready: g.guestReady };
    role('guest'); g._pig = gruntime; g._myN = mirror.myN; S().items = mirror.items; S().mats = mirror.mats; S().hotbar = mirror.hotbar; g.buildIdx = mirror.bi; g.stowed = mirror.st;
    g.netSend = (m) => { gout.push(json(m)); };
    try { for (const m of msgs) PIN.applyInv(g, m); } finally {
      gruntime = g._pig; mirror = { items: S().items, mats: S().mats, hotbar: S().hotbar, bi: g.buildIdx, st: g.stowed, myN: g._myN };
      S().items = keep.items; S().mats = keep.mats; S().hotbar = keep.hotbar; g.buildIdx = keep.bi; g.stowed = keep.st; g._myN = keep.myN; g._pig = keep.pig; g.netSend = keep.send; g.net.role = keep.role; g.net.open = keep.open; g.guestReady = keep.ready;
      g.rebuildTools();
    }
  };
  const guestTick = () => { const keep = { pig: g._pig, send: g.netSend, role: g.net.role, ready: g.guestReady }; role('guest'); g._pig = gruntime; g.netSend = (m) => { gout.push(json(m)); }; try { PIN.tick(g, 0.1); } finally { gruntime = g._pig; g._pig = keep.pig; g.netSend = keep.send; g.net.role = keep.role; g.guestReady = keep.ready; } };
  const pump = (ms = 130) => realSleep(ms).then(() => { PIN.tick(g, 0.3); });
  const marker = (x, z) => ({ tool: { id: 'marker', kind: 'marker' }, ent: { x, y: 0, z } });
  const hostPlace = (id, kind, x, z) => { g.plan = { ok: true, ent: { x, y: 0, z } }; g.placeCurrent({ id, kind }); g.plan = null; };
  const ents = (type) => S().entities.filter((e) => e.type === type);

  await guard('mp.pinv.a-guest-craft-goes-in-the-guests-bag-and-takes-shared-fluff', async () => {
    setup(); const m0 = S().money; g.netCmd('craft', { id: 'marker', n: 3 });
    const bad = [];
    if (GB().marker !== 3) bad.push('guest bag ' + JSON.stringify(GB()));
    if (S().items.marker) bad.push('the host bag got markers ' + JSON.stringify(S().items));
    if (S().money !== m0 - price('marker') * 3) bad.push(`fluff ${m0 - S().money} for 3`);
    if (JSON.stringify(S().hotbar) !== JSON.stringify(['hammer', null, null, null, null, null, null, null, null])) bad.push('the host hotbar changed ' + JSON.stringify(S().hotbar));
    if (g.buildIdx !== 0 || g.stowed !== true) bad.push(`host tool changed ${g.buildIdx} ${g.stowed}`);
    if (g.tools.some((t) => t && t.id === 'marker')) bad.push('the host bar shows the guest marker');
    if (!PIN.curBag(g).hotbar.includes('marker')) bad.push('the guest hotbar has no marker slot ' + JSON.stringify(PIN.curBag(g).hotbar));
    if (g._bagSwap) bad.push('still swapped');
    return bad.length === 0 || bad.join('; ');
  });
  await guard('mp.pinv.fluff-drops-for-both-screens-while-the-bag-stays-the-guests', async () => {
    setup(); const m0 = S().money; g.netCmd('craft', { id: 'marker', n: 2 }); const sh = ofType('shared').pop(), cost = price('marker') * 2;
    if (!sh || sh.money !== m0 - cost || S().money !== m0 - cost) return 'the shared message does not carry the new balance ' + JSON.stringify([sh && sh.money, S().money, m0 - cost]);
    // the guest's screen: the balance follows, its bag does not move
    const keep = { items: S().items, mats: S().mats, money: S().money, role: g.net.role }; role('guest'); S().items = { mine: 3 }; S().mats = {}; S().money = 5; g._sharedKey = null; g.applyShared(json(sh)); const ok = S().money === sh.money && S().items.mine === 3 && !S().items.marker;
    S().items = keep.items; S().mats = keep.mats; S().money = keep.money; role('host');
    return ok || 'the guest screen did not follow the shared balance or lost its bag';
  });
  await guard('mp.pinv.a-host-craft-goes-in-the-hosts-bag-only', async () => {
    setup(); g.craftItem('marker', 2);
    return (S().items.marker === 2 && !GB().marker && S().hotbar.includes('marker') && !PIN.curBag(g).hotbar.includes('marker')) || JSON.stringify([S().items, GB(), S().hotbar]);
  });
  await guard('mp.pinv.two-players-hold-different-tools-and-items', async () => {
    setup(); g.craftItem('marker', 2); g.craftItem('lantern', 1); g.netCmd('craft', { id: 'strut', n: 4 });
    g.stowed = false; g.selectTool(S().hotbar.indexOf('marker')); const hostTool = g.curTool().id;
    g.netCmd('hb', { h: ['hammer', null, 'strut', null, null, null, null, null, null], s: 2, st: 0 });
    const gb = PIN.curBag(g);
    return (hostTool === 'marker' && gb.sel === 2 && gb.st === 0 && gb.hotbar[2] === 'strut' && S().items.marker === 2 && S().items.lantern === 1 && !S().items.strut && GB().strut === 4 && !GB().marker && g.buildIdx === S().hotbar.indexOf('marker'))
      || JSON.stringify({ hostTool, gb, host: S().items, guest: GB() });
  });
  await guard('mp.pinv.the-guests-craft-hint-is-not-shown-to-the-host-and-goes-to-the-guest', async () => {
    setup(); const seen = []; const orig = g.ui.hint; g.ui.hint = (t) => { seen.push(t); };
    try { g.netCmd('craft', { id: 'marker', n: 1 }); } finally { g.ui.hint = orig; }
    const hint = ofType('hint')[0];
    return (seen.length === 0 && hint && /crafted/.test(hint.text) && typeof g.ui.hint === 'function') || JSON.stringify({ seen: seen.length, hint });
  });
  await guard('mp.pinv.a-guest-place-spends-the-guests-marker-not-the-hosts', async () => {
    setup(); S().items.marker = 5; g.netCmd('craft', { id: 'marker', n: 2 });
    g.netCmd('place', marker(10, 3));
    const e = ents('marker');
    return (e.length === 1 && GB().marker === 1 && S().items.marker === 5 && e[0].own === PIN.curBag(g).n && PIN.curBag(g).n >= 1) || JSON.stringify({ n: e.length, guest: GB(), host: S().items, own: e[0] && e[0].own });
  });
  await guard('mp.pinv.a-guest-with-no-markers-cannot-place-with-the-hosts', async () => {
    setup(); S().items.marker = 5; const n0 = S().entities.length;
    g.netCmd('place', marker(10, 3));
    return (S().entities.length === n0 && S().items.marker === 5 && !GB().marker) || JSON.stringify({ ents: S().entities.length - n0, host: S().items, guest: GB() });
  });
  await guard('mp.pinv.forged-commands-never-touch-the-other-bag', async () => {
    setup(); g.remote.pos.set(50, 0, 0); S().items = { marker: 5, lantern: 2, medkit: 1 }; const keep = JSON.stringify(S().items), bad = [];
    const other = PIN.bagFor(g, 'otherpid123', 'Zed'); other.items = { marker: 9 }; const okeep = JSON.stringify(other);
    const cmds = [['spend', { id: 'marker' }], ['spend', { id: 'medkit', pid: 'otherpid123' }], ['spend', { id: '__proto__' }], ['spend', null], ['spend', { id: { a: 1 } }], ['craft', { id: '__proto__', n: 1 }], ['craft', { id: 'constructor', n: 2 }],
      ['craft', { id: 'marker', n: -5 }], ['craft', { id: 'marker', n: NaN }], ['craft', { id: 'marker', n: 1e9 }], ['craft', { id: ['marker'], n: 1 }], ['place', { tool: { id: 'lantern', kind: 'lantern' }, ent: { x: 1, y: 0, z: 1 } }],
      ['place', { tool: { id: 'medkit', kind: 'medkit' }, ent: { x: 1, y: 0, z: 1 } }], ['hb', { h: new Array(500).fill('marker') }], ['hb', { h: ['__proto__', 1, 2, 3, 4, 5, 6, 7, 8] }], ['hb', 5], ['hb', null], ['giveitem', { id: 'marker', n: 3 }],
      ['giveitem', { id: 'marker', n: -3 }], ['giveitem', { id: 'marker', n: 'x' }], ['giveitem', { id: '__proto__', n: 1 }], ['giveitem', null], ['invsync', 5], [5, {}], [null, null], [{}, []]];
    for (const [c, d] of cmds) {
      try { g.netCmd(c, d); } catch (e) { if (!/Cannot read|null|undefined/.test(e.message)) bad.push(c + ' threw ' + e.message); }
      if (JSON.stringify(S().items) !== keep) bad.push(`${c} ${JSON.stringify(d).slice(0, 40)} changed the host bag ${JSON.stringify(S().items)}`);
      if (JSON.stringify(other) !== okeep) bad.push(c + ' changed the other friend bag');
      if (g._bagSwap) bad.push(c + ' left the bag swapped');
    }
    const gb = PIN.curBag(g);
    if (gb.hotbar.length !== 9 || gb.hotbar.some((x) => x !== null && typeof x !== 'string')) bad.push('hotbar ' + JSON.stringify(gb.hotbar));
    if (Object.keys(GB()).some((k) => !PIN.validId(k) || !(GB()[k] >= 1))) bad.push('bad guest bag ' + JSON.stringify(GB()));
    return bad.length === 0 || bad.slice(0, 5).join('; ');
  });
  await guard('mp.pinv.an-inv-message-sent-to-a-host-is-ignored', async () => {
    setup(); S().items = { marker: 5 }; g.netMessage({ t: 'inv', q: 3, f: 1, i: ['marker', 999, 'claw', 3], m: [], h: ['claw', null, null, null, null, null, null, null, null] });
    g.netMessage({ t: 'hint', text: 'x' }); g.netMessage({ t: 'shared', money: 1, te: 1, up: {}, gear: {}, boosts: {}, items: { claw: 5 } });
    return (S().items.marker === 5 && !S().items.claw && S().money > 1e6 && S().hotbar[0] === 'hammer') || JSON.stringify([S().items, S().money]);
  });
  await guard('mp.pinv.shared-message-carries-no-bag-and-the-guest-keeps-its-own', async () => {
    setup(); S().items = { secretforhost: 4 }; S().mats = { timber: 7 }; g.sendShared(); const m = ofType('shared')[0];
    if (!m || m.items !== undefined || m.mats !== undefined || /secretforhost/.test(JSON.stringify(m))) return 'shared carries the bag ' + JSON.stringify(m).slice(0, 200);
    NG.periodicShared(g); NG.periodicShared(g); if (sent.some((x) => /secretforhost/.test(JSON.stringify(x)))) return 'periodic shared leaked the host bag';
    // a guest page keeps its own bag when the host's shared message arrives
    const gm = json(m); fresh(FULL); role('guest'); S().items = { mine: 2 }; S().mats = { steel: 1 }; g.applyShared(gm);
    return (S().items.mine === 2 && S().mats.steel === 1) || 'the shared message overwrote the guest bag ' + JSON.stringify(S().items);
  });
  await guard('mp.pinv.the-late-joiner-gets-its-own-bag-in-the-world-stream-and-never-the-hosts', async () => {
    setup(); S().items = { hostonlything: 4, marker: 1 }; PIN.hello(g, { name: 'Ann', pid: 'annpid123456' });
    GB().marker = 2; GB().strut = 7; PIN.curBag(g).hotbar[1] = 'strut';
    const msgs = []; for (const m of NG.worldSteps(g)) { if (typeof m === 'string') continue; msgs.push(json(m)); }
    const text = JSON.stringify(msgs), invs = msgs.filter((m) => m.t === 'inv');
    const inv = invs[0], shared = msgs.filter((m) => m.t === 'shared');
    return (invs.length === 1 && inv.f === 1 && inv.pn === PIN.curBag(g).n && eq(Object.fromEntries(inv.i.reduce((a, v, n, arr) => (n % 2 ? a : [...a, [v, arr[n + 1]]]), [])), { marker: 2, strut: 7 }) && inv.h[1] === 'strut' && !/hostonlything/.test(text) && msgs[msgs.length - 1].t === 'ready' && msgs.indexOf(inv) === msgs.length - 2)
      || JSON.stringify({ invs: invs.length, inv, leak: /hostonlything/.test(text), last: msgs[msgs.length - 1].t });
  });
  await guard('mp.pinv.deltas-are-small-sequenced-and-the-guest-mirror-follows', async () => {
    setup(); PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); PIN.flush(g, true); asGuest(ofType('inv')); sent.length = 0;
    const bad = [];
    for (let n = 0; n < 5; n++) { g.netCmd('craft', { id: 'marker', n: 1 }); PIN.flush(g, true); }
    const invs = ofType('inv'); if (invs.length !== 5) bad.push('inv messages ' + invs.length);
    for (let n = 1; n < invs.length; n++) if (invs[n].q !== invs[n - 1].q + 1) bad.push('sequence ' + invs.map((m) => m.q));
    if (invs.some((m) => m.f)) bad.push('a delta was a full bag');
    const biggest = Math.max(...invs.map((m) => JSON.stringify(m).length)); if (biggest > 200) bad.push('delta of ' + biggest + ' bytes');
    asGuest(invs); if (!eq(mirror.items, GB())) bad.push('mirror ' + JSON.stringify(mirror.items) + ' vs ' + JSON.stringify(GB()));
    if (JSON.stringify(mirror.hotbar) !== JSON.stringify(PIN.curBag(g).hotbar)) bad.push('mirror hotbar ' + JSON.stringify(mirror.hotbar));
    return bad.length === 0 || bad.join('; ');
  });
  await guard('mp.pinv.a-burst-of-commands-is-coalesced-into-a-few-messages', async () => {
    setup(); PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); PIN.flush(g, true); asGuest(ofType('inv')); sent.length = 0;
    for (let n = 0; n < 30; n++) g.netCmd('craft', { id: 'marker', n: 1 });
    const burst = ofType('inv').length; await pump(); const after = ofType('inv').length;
    asGuest(ofType('inv'));
    return (burst <= 2 && after <= 3 && GB().marker === 30 && mirror.items.marker === 30) || JSON.stringify({ burst, after, bag: GB().marker, mirror: mirror.items.marker });
  });
  await guard('mp.pinv.a-lost-message-leaves-a-gap-and-a-resync-heals-it', async () => {
    setup(); PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); PIN.flush(g, true); asGuest(ofType('inv')); sent.length = 0;
    const bad = [];
    for (let n = 0; n < 4; n++) { g.netCmd('craft', { id: 'marker', n: 1 }); PIN.flush(g, true); }
    const m = ofType('inv'); asGuest([m[0], m[2], m[3]]);   // the second is lost
    if (mirror.items.marker !== 1) bad.push('applied past a gap: ' + mirror.items.marker);
    await realSleep(600); gout.length = 0; guestTick(); const ask = gout.find((x) => x.t === 'cmd' && x.c === 'invsync');
    if (!ask) bad.push('no resync asked ' + JSON.stringify(gout));
    sent.length = 0; g.netCmd('invsync', {}); const full = ofType('inv').find((x) => x.f); if (!full) bad.push('no whole bag came back');
    asGuest(full ? [full] : []); if (mirror.items.marker !== 4) bad.push('after resync ' + mirror.items.marker);
    asGuest([m[3], m[0]]); if (mirror.items.marker !== 4) bad.push('old messages applied ' + mirror.items.marker);   // (late copies of what the whole bag already covers)
    return bad.length === 0 || bad.join('; ');
  });
  await guard('mp.pinv.reordered-and-duplicated-messages-are-applied-once-in-order', async () => {
    setup(); PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); PIN.flush(g, true); asGuest(ofType('inv')); sent.length = 0;
    for (let n = 0; n < 4; n++) { g.netCmd('craft', { id: 'marker', n: 1 }); g.netCmd('craft', { id: 'strut', n: 2 }); PIN.flush(g, true); }
    const m = ofType('inv'); asGuest([m[2], m[1], m[1], m[3], m[0], m[0], m[2]]);
    return (eq(mirror.items, GB()) && gout.every((x) => x.c !== 'invsync')) || JSON.stringify({ mirror: mirror.items, bag: GB(), gout: gout.length });
  });
  await guard('mp.pinv.resync-is-rate-limited', async () => {
    setup(); PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); sent.length = 0;
    for (let n = 0; n < 50; n++) g.netCmd('invsync', {});
    return ofType('inv').length <= 2 || 'a flood of invsync made ' + ofType('inv').length + ' whole bags';
  });
  await guard('mp.pinv.a-guest-hotbar-report-reaches-the-host-without-an-echo', async () => {
    setup(); PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); PIN.flush(g, true); asGuest(ofType('inv')); sent.length = 0;
    // the guest page changes its hotbar and dials: its tick reports it before any other command
    role('guest'); const keepPig = g._pig; g._pig = gruntime; const keep = { h: S().hotbar, b: g.buildIdx, s: g.stowed, v: S().vacSet }; S().hotbar = ['hammer', 'strut', null, null, null, null, null, null, null]; g.buildIdx = 1; g.stowed = false; S().vacSet = 40;
    gout.length = 0; g.netSend = (m) => { gout.push(json(m)); }; g.cmd('craft', { id: 'marker', n: 1 }); const order = gout.map((m) => m.c);
    S().hotbar = keep.h; g.buildIdx = keep.b; g.stowed = keep.s; S().vacSet = keep.v; gruntime = g._pig; g._pig = keepPig; cap(); role('host');
    const hb = gout.find((m) => m.c === 'hb'); if (!hb || order[0] !== 'hb' || order[1] !== 'craft') return 'hb not first ' + JSON.stringify(order);
    g.netCmd('hb', hb.d); const bag = PIN.curBag(g);
    PIN.flush(g, true); const echo = ofType('inv').filter((m) => m.h);
    return (bag.hotbar[1] === 'strut' && bag.sel === 1 && bag.st === 0 && bag.vs === 40 && echo.length === 0) || JSON.stringify({ bag, echo: echo.length });
  });
  await guard('mp.pinv.give-needs-three-metres-and-moves-between-the-two-bags', async () => {
    setup(); S().items = { marker: 5 }; const bad = [];
    g.remote.pos.set(2, 0, 0); let r = PIN.hostGive(g, 'marker', 2); if (!r.ok || S().items.marker !== 3 || GB().marker !== 2) bad.push('host give ' + JSON.stringify([r, S().items, GB()]));
    if (!sent.some((m) => m.t === 'toast' && /gave/i.test(m.title))) bad.push('no toast to the friend');
    g.remote.pos.set(4, 0, 0); r = PIN.hostGive(g, 'marker', 1); if (r.ok || S().items.marker !== 3 || GB().marker !== 2) bad.push('gave from 4 m ' + JSON.stringify(r));
    g.netCmd('giveitem', { id: 'marker', n: 1 }); if (S().items.marker !== 3 || GB().marker !== 2) bad.push('the guest gave from 4 m');
    g.remote.pos.set(1, 0, 1); g.netCmd('giveitem', { id: 'marker', n: 1 }); if (S().items.marker !== 4 || GB().marker !== 1) bad.push('guest give ' + JSON.stringify([S().items, GB()]));
    g.netCmd('giveitem', { id: 'marker', n: 50 }); if (S().items.marker !== 5 || GB().marker) bad.push('guest give more than it has ' + JSON.stringify([S().items, GB()]));
    g.netCmd('giveitem', { id: 'strut', n: 1 }); if (S().items.strut) bad.push('gave what it does not have');
    g.remote = null; r = PIN.hostGive(g, 'marker', 1); if (r.ok) bad.push('gave to nobody');
    g.remote = fakeRemote(0, 40, 0); r = PIN.hostGive(g, 'marker', 1); if (r.ok) bad.push('gave through the floor');
    g.remote = fakeRemote(NaN, 0, 0); r = PIN.hostGive(g, 'marker', 1); if (r.ok) bad.push('gave to NaN');
    return bad.length === 0 || bad.join('; ');
  });
  await guard('mp.pinv.give-respects-the-bag-cap', async () => {
    setup(); S().items = { marker: 50 }; GB().marker = PIN.BAG_MAX - 10; const r = PIN.hostGive(g, 'marker', 30);
    return (r.ok && r.n === 10 && GB().marker === PIN.BAG_MAX && S().items.marker === 40) || JSON.stringify([r, S().items, GB()]);
  });
  await guard('mp.pinv.taking-a-piece-down-refunds-the-player-who-placed-it', async () => {
    setup(); const bad = [];
    g.craftItem('marker', 3); g.netCmd('craft', { id: 'marker', n: 3 });
    hostPlace('marker', 'marker', 5, 5); g.netCmd('place', marker(8, 5));
    const [hm, gm] = ents('marker'); if (!hm || !gm || hm.own !== 0 || gm.own < 1) return 'owners ' + JSON.stringify([hm && hm.own, gm && gm.own]);
    // the guest takes down the host's piece: the host gets it back, the guest nothing
    g.netCmd('decon', { kind: 'mach', id: hm.id }); if (S().items.marker !== 3 || GB().marker !== 2) bad.push('guest took down the host piece ' + JSON.stringify([S().items, GB()]));
    // the host takes down the guest's piece: the guest's bag gets it
    g.doDecon({ kind: 'mach', id: gm.id }); if (S().items.marker !== 3 || GB().marker !== 3) bad.push('host took down the guest piece ' + JSON.stringify([S().items, GB()]));
    if (ents('marker').length) bad.push('pieces left');
    // own piece: own bag
    g.netCmd('place', marker(9, 9)); const mine = ents('marker')[0]; g.netCmd('decon', { kind: 'mach', id: mine.id }); if (GB().marker !== 3) bad.push('own piece ' + GB().marker);
    // a piece nobody owns goes to the one who takes it down
    hostPlace('marker', 'marker', 12, 5); PIN.stamp(g, 0); const lone = ents('marker')[0]; delete lone.own; g.netCmd('decon', { kind: 'mach', id: lone.id }); if (GB().marker !== 4) bad.push('unowned piece ' + GB().marker);
    // the friend is gone: a host takes down its own and the friend's pieces for itself
    g.netCmd('place', marker(14, 9)); const theirs = ents('marker')[0]; role(null); g.doDecon({ kind: 'mach', id: theirs.id }); role('host');
    if (S().items.marker !== 3 + 0 && S().items.marker !== 4) bad.push('alone host refund ' + S().items.marker);
    return bad.length === 0 || bad.join('; ');
  });
  await guard('mp.pinv.cable-refund-follows-the-cable-owner', async () => {
    setup(); const bad = [];
    const a = { id: g.nextId(), type: 'pole', i: 0, j: 0, k: 0 }, b = { id: g.nextId(), type: 'pole', i: 3, j: 0, k: 0 };
    const rec = { id: g.nextId(), a: a.id, b: b.id, own: 0 }; g.cables.list().push(rec);
    PIN.runAs(g, 'g', () => g.cables.remove(rec.id, true));   // (a guest command takes the host's cable down)
    if (S().items.cable !== 1 || GB().cable) bad.push('host cable ' + JSON.stringify([S().items, GB()]));
    const rec2 = { id: g.nextId(), a: a.id, b: b.id, own: PIN.curBag(g).n }; g.cables.list().push(rec2); g.cables.remove(rec2.id, true);   // (the host takes the guest's down)
    if (!GB().cable || S().items.cable !== 1) bad.push('guest cable ' + JSON.stringify([S().items, GB()]));
    g.cables.reset(); S().cables = [];
    return bad.length === 0 || bad.join('; ');
  });
  await guard('mp.pinv.rig-limits-count-each-players-own-rigs', async () => {
    setup({ ...FULL, rigCount: 1 }); const max = g.T.rigMax; if (!(max >= 4)) return 'rigMax ' + max;
    const claw = (x, own) => { const e = { id: g.nextId(), type: 'claw', x, y: 0, z: 0, ry: 0, own }; S().entities.push(e); g.machines.add(e); };
    for (let n = 0; n < max; n++) claw(10 + n * 5, 0);                                   // the host is at its limit
    const why = (x) => g.placeConflict({ id: 'claw', kind: 'claw' }, { x, y: 0, z: 0 });
    const bad = [];
    if (!/limit/.test(PIN.runAs(g, 'h', () => why(200)) || '')) bad.push('the host is not at its limit');
    if (PIN.runAs(g, 'g', () => why(200))) bad.push('the guest was refused: ' + PIN.runAs(g, 'g', () => why(200)));
    const n1 = PIN.curBag(g).n; for (let n = 0; n < max; n++) claw(300 + n * 5, n1);
    if (!/limit/.test(PIN.runAs(g, 'g', () => why(600)) || '')) bad.push('the guest is not at its limit');
    if (PIN.ownedCount(g, 'claw') !== max) bad.push('host count ' + PIN.ownedCount(g, 'claw'));
    // on the friend's page the count is its own too
    role('guest'); g._myN = n1; const mine = PIN.ownedCount(g, 'claw'); g._myN = 0; const his = PIN.ownedCount(g, 'claw'); role('host');
    if (mine !== max || his !== max) bad.push(`guest page counts ${mine}/${his}`);
    // the label says whose
    const row = recipes(g).find((r) => r.id === 'claw'); if (!row) bad.push('no claw row');
    for (const e of ents('claw')) { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } }
    S().entities = S().entities.filter((e) => e.type !== 'claw');
    return bad.length === 0 || bad.join('; ');
  });
  await guard('mp.pinv.rejoin-restores-the-bag-by-id-and-by-name-and-others-start-empty', async () => {
    setup(); const bad = [];
    PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); g.netCmd('craft', { id: 'marker', n: 4 }); const n = PIN.curBag(g).n; PIN.guestLeft(g);
    const saved = JSON.parse(JSON.stringify(S().ginv));                                    // the host save
    S().ginv = saved; PIN.afterLoad(g);
    PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); if (GB().marker !== 4 || PIN.curBag(g).n !== n) bad.push('same id ' + JSON.stringify(GB()));
    PIN.guestLeft(g); PIN.hello(g, { name: 'ann', pid: 'newbrowser99' }); if (GB().marker !== 4 || PIN.curBag(g).n !== n || Object.keys(S().ginv.bags).length !== 1) bad.push('same name, new browser ' + JSON.stringify(S().ginv.bags));
    PIN.guestLeft(g); PIN.hello(g, { name: 'Bob', pid: 'bobpid654321' }); if (GB().marker || PIN.curBag(g).n === n || Object.keys(S().ginv.bags).length !== 2) bad.push('a stranger got a bag ' + JSON.stringify(GB()));
    // the rejoining friend is sent the bag in the world stream
    PIN.guestLeft(g); PIN.hello(g, { name: 'Ann', pid: 'newbrowser99' }); const inv = [...NG.worldSteps(g)].filter((m) => typeof m !== 'string' && m.t === 'inv')[0];
    if (!inv || inv.i.indexOf('marker') < 0) bad.push('no bag in the stream');
    return bad.length === 0 || bad.join('; ');
  });
  await guard('mp.pinv.a-kept-bag-expires-after-24-hours-of-play-or-when-cleared', async () => {
    setup(); const bad = [];
    PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); GB().marker = 2; PIN.guestLeft(g);
    S().stats.playSecs = (S().stats.playSecs || 0) + 3600; PIN.hello(g, { name: 'Bob', pid: 'bobpid654321' }); if (!S().ginv.bags.annpid123456) bad.push('dropped after one hour');
    PIN.guestLeft(g); S().stats.playSecs += PIN.KEEP_SECS; PIN.hello(g, { name: 'Bob', pid: 'bobpid654321' }); if (S().ginv.bags.annpid123456) bad.push('kept after a day');
    PIN.guestLeft(g); PIN.hello(g, { name: 'Cy', pid: 'cypid1234567' }); GB().strut = 1; PIN.guestLeft(g); const n = PIN.clearBags(g); if (n < 1 || Object.keys(S().ginv.bags).length) bad.push('clear left ' + JSON.stringify(Object.keys(S().ginv.bags)));
    return bad.length === 0 || bad.join('; ');
  });
  await guard('mp.pinv.the-save-holds-every-bag-and-an-old-save-gets-the-host-bag-only', async () => {
    setup(); const bad = [];
    S().items = { belt: 3 }; S().mats = { timber: 5 };
    // an old save: shared S.items, no S.ginv; a flat S.ginv from a draft is thrown away
    S().ginv = undefined; PIN.afterLoad(g); S().ginv = { medkit: 98 }; PIN.afterLoad(g); if (S().ginv !== undefined) bad.push('a flat ginv survived');
    PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); const b = PIN.curBag(g);
    if (S().items.belt !== 3 || S().mats.timber !== 5) bad.push('host bag changed');
    if (Object.keys(b.items).length || Object.keys(b.mats).length || b.hotbar[0] !== 'hammer' || b.hotbar.slice(1).some((x) => x)) bad.push('the first guest bag is not the starter kit ' + JSON.stringify(b));
    // the save: two friends, round trip through JSON, nothing lost, nothing crossed
    b.items.marker = 2; PIN.guestLeft(g); PIN.hello(g, { name: 'Bob', pid: 'bobpid654321' }); PIN.curBag(g).items.strut = 3;
    const text = JSON.stringify({ items: S().items, ginv: S().ginv }); const back = JSON.parse(text); S().ginv = back.ginv; PIN.afterLoad(g);
    if (S().ginv.bags.annpid123456.items.marker !== 2 || S().ginv.bags.bobpid654321.items.strut !== 3 || S().ginv.bags.annpid123456.items.strut || S().ginv.n !== 2) bad.push('round trip ' + text.slice(0, 300));
    // garbage in a save is cleaned
    S().ginv = { v: 1, n: 1, bags: { annpid123456: { n: 1, items: { marker: 1e12, '__proto__': 4, 'a b': 3, strut: -2, ok: 1.7 }, mats: 'x', hotbar: 'no', sel: 99 }, 'bad pid!': { n: 2 }, bobpid654321: null } }; PIN.afterLoad(g);
    const c = S().ginv.bags.annpid123456; if (!c || c.items.marker !== PIN.BAG_MAX || c.items.ok !== 1 || Object.keys(c.items).length !== 2 || c.hotbar.length !== 9 || c.sel !== 0 || Object.keys(S().ginv.bags).length !== 1) bad.push('garbage ' + JSON.stringify(S().ginv));
    return bad.length === 0 || bad.join('; ');
  });
  await guard('mp.pinv.a-bag-has-a-size-cap', async () => {
    setup(); PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); const b = PIN.curBag(g), bad = [];
    b.items.marker = 5e6; for (let n = 0; n < 200; n++) b.items['thing' + n] = 5; b.items.bad = NaN; b.items['x y'] = 3; b.mats.timber = -1;
    PIN.capBag(b); if (Object.keys(b.items).length > PIN.BAG_IDS) bad.push('ids ' + Object.keys(b.items).length); if (b.items.marker !== PIN.BAG_MAX) bad.push('count ' + b.items.marker); if ('bad' in b.items || 'x y' in b.items || 'timber' in b.mats) bad.push('junk kept');
    // crafting more than a stack holds is clamped on the way out too
    g.netCmd('craft', { id: 'marker', n: PIN.BAG_MAX }); if (GB().marker > PIN.BAG_MAX) bad.push('craft past the cap ' + GB().marker);
    // a delta never carries more than MAX_DELTA slots: more is sent as the whole bag
    sent.length = 0; PIN.flush(g, true); sent.length = 0; for (let n = 0; n < 100; n++) b.items['more' + n] = 1; for (const k of Object.keys(b.items).filter((k) => k.startsWith('thing')).slice(0, 80)) delete b.items[k];
    PIN.flush(g, true); const m = ofType('inv')[0]; if (!m || !m.f) bad.push('a big change was not sent as the whole bag ' + JSON.stringify(m).slice(0, 80));
    if (m && JSON.stringify(m).length > 6000) bad.push('whole bag of ' + JSON.stringify(m).length);
    return bad.length === 0 || bad.join('; ');
  });
  await guard('mp.pinv.a-supply-cache-opened-by-the-friend-goes-in-the-friends-bag', async () => {
    setup(); g.mode = 'play';
    const w = ctx.w(), { i, k } = ctx.spot(); w.setCell(i, 3, k, CACHE, 0);
    const rng = Math.random; Math.random = () => 0.3;   // (the roll that lands on an item of the bench)
    try { g.remote = fakeRemote(ctx.cellX(i), 0, ctx.cellZ(k)); g.netCmd('open', { k: 'cache', i, j: 3, kk: k }); } finally { Math.random = rng; }
    const hostGot = Object.keys(S().items).length, guestKinds = Object.keys(GB());
    const inv = ofType('inv').find((m) => m.i && m.i.length);
    return (hostGot === 0 && guestKinds.length === 1 && GB()[guestKinds[0]] >= 1 && inv) || JSON.stringify({ hostGot, guest: GB(), inv: !!inv });
  });
  await guard('mp.pinv.the-avatar-shows-the-tool-in-hand-and-the-plush-carried', async () => {
    setup(); const bad = [];
    g.craftItem('marker', 1); g.stowed = false; g.selectTool(S().hotbar.indexOf('marker')); S().carry = [{ sp: 3, vr: 0 }, { sp: 4, vr: 0 }];
    g._np = 0; sent.length = 0; NG.update(g, 0.01); const pos = ofType('pos')[0];
    if (!pos || pos.tl !== 'marker' || pos.cr !== 2) bad.push('pos ' + JSON.stringify(pos));
    g.stowed = true; g._np = 0; sent.length = 0; NG.update(g, 0.01); const pos2 = ofType('pos')[0]; if (!pos2 || pos2.tl !== undefined) bad.push('stowed pos ' + JSON.stringify(pos2));
    S().carry = [];
    const rp = new RemotePlayer(g.renderer.scene, 'Ann'); g.remote = rp;
    g.netMessage({ t: 'pos', x: 1, y: 0, z: 1, yaw: 0, pitch: 0, lamp: true, tl: 'marker', cr: 3 });
    if (rp.heldId !== 'marker' || rp.heldPlush !== 3 || !rp.held || !rp.held.visible || !rp.heldIcon) bad.push('avatar ' + JSON.stringify([rp.heldId, rp.heldPlush, !!rp.held, rp.heldIcon]));
    g.netMessage({ t: 'pos', x: 1, y: 0, z: 1, yaw: 0, pitch: 0, lamp: true }); if (rp.held && rp.held.visible) bad.push('the badge stays after the tool is put away');
    for (const tl of [5, {}, '__proto__', 'x'.repeat(80), null]) { try { g.netMessage({ t: 'pos', x: 1, y: 0, z: 1, yaw: 0, pitch: 0, lamp: true, tl, cr: -4 }); } catch (e) { bad.push('forged tl threw ' + e.message); } }
    rp.dispose(g.renderer.scene); g.remote = null;
    return bad.length === 0 || bad.join('; ');
  });
  await guard('mp.pinv.two-grabbers-of-one-plush-the-slower-one-is-told-it-is-gone', async () => {
    setup(); const sim = ctx.sim(); const i = sim.spawn(3, 0, 1, 1, 1, 0, 0, 0, 1, 1), bid = sim.bid[i];
    const n0 = sim.n; g.netMessage({ t: 'take', id: bid, sp: 3, vr: 0 }); const took = sim.n === n0 - 1 && !ofType('nope').length;
    g.netMessage({ t: 'take', id: bid, sp: 3, vr: 0 }); const nope = ofType('nope')[0];
    role('guest'); S().carry = [{ sp: 3, vr: 0 }]; g.netMessage(json(nope || { t: 'nope', sp: 3, vr: 0 })); const dropped = S().carry.length === 0; S().carry = []; role('host');
    return (took && nope && nope.sp === 3 && dropped) || JSON.stringify({ took, nope, dropped });
  });
  await guard('mp.pinv.dying-costs-only-your-own-hands-and-leaves-both-bags', async () => {
    setup(); const bad = [];
    S().items = { marker: 2 }; GB().strut = 3; S().carry = [{ sp: 3, vr: 0 }]; const kept = JSON.stringify([S().items, GB()]);
    g.die('were crushed'); await realSleep(1700);
    if (JSON.stringify([S().items, GB()]) !== kept) bad.push('a bag changed in a death ' + JSON.stringify([S().items, GB()]));
    if (S().carry.length) bad.push('the hands were not spilled');
    return bad.length === 0 || bad.join('; ');
  });
  await guard('mp.pinv.the-host-leaving-and-the-guest-leaving-keep-both-bags', async () => {
    setup(); PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); GB().marker = 3; S().items = { strut: 2 };
    g.netClosed(); const after = JSON.stringify([S().items, S().ginv.bags.annpid123456.items, PIN.guestPid(g)]);
    // a second connection of the same friend: the same bag
    role('host'); PIN.hello(g, { name: 'Ann', pid: 'annpid123456' });
    return (after === JSON.stringify([{ strut: 2 }, { marker: 3 }, 'guest']) && GB().marker === 3) || after;
  });
  await guard('mp.pinv.a-second-hello-from-a-forged-id-does-not-reach-another-bag', async () => {
    setup(); PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); GB().marker = 3; PIN.guestLeft(g);
    for (const pid of [5, null, {}, '__proto__', 'x', 'a'.repeat(40), '../etc']) { PIN.hello(g, { name: 'Eve', pid }); PIN.guestLeft(g); }
    PIN.hello(g, { name: 'Ann', pid: 'annpid123456' });
    return (GB().marker === 3 && Object.keys(S().ginv.bags).every((k) => /^[A-Za-z0-9]{6,24}$/.test(k) || k === 'guest')) || JSON.stringify(Object.keys(S().ginv.bags));
  });

  // 200 seeded random actions by two players: nothing is made or lost. Markers and lanterns are crafted (by either), carried in the two bags, set down in the world, taken down by
  // either (to whoever placed them), handed over and used up.
  for (const seed of [11, 4242]) await guard('mp.pinv.soak-200-random-actions-conserve-every-item-seed-' + seed, async () => {
    setup(); PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); PIN.flush(g, true); asGuest(ofType('inv')); sent.length = 0;
    const rnd = mulberry32(seed), pick = (a) => a[(rnd() * a.length) | 0], IDS = ['marker', 'lantern'];
    const crafted = { marker: 0, lantern: 0 }, used = { marker: 0, lantern: 0 }, bad = [], tally = { craft: 0, place: 0, decon: 0, give: 0, spend: 0 };
    const total = (id) => (S().items[id] | 0) + (GB()[id] | 0) + ents(id).length;
    const kindOf = { marker: 'marker', lantern: 'lantern' };
    let nextX = 20;
    for (let step = 0; step < 200 && bad.length < 3; step++) {
      const who = rnd() < 0.5 ? 'h' : 'g', id = pick(IDS), a = rnd();
      g.remote.pos.set(rnd() < 0.8 ? 1.5 : 6, 0, 0);
      if (a < 0.25) { const n = 1 + ((rnd() * 3) | 0); if (who === 'h') g.craftItem(id, n); else g.netCmd('craft', { id, n }); crafted[id] += n; tally.craft++; }
      else if (a < 0.5) { const bag = who === 'h' ? S().items : GB(); const x = (nextX += 4); if (who === 'h') { if ((bag[id] | 0) > 0) { hostPlace(id, kindOf[id], x, 5); tally.place++; } } else { g.netCmd('place', { tool: { id, kind: kindOf[id] }, ent: { x, y: 0, z: 5 } }); tally.place++; } }
      else if (a < 0.7) { const list = ents(id); if (list.length) { const e = pick(list); if (who === 'h') g.doDecon({ kind: 'mach', id: e.id }); else g.netCmd('decon', { kind: 'mach', id: e.id }); tally.decon++; } }
      else if (a < 0.85) { const n = 1 + ((rnd() * 2) | 0); if (who === 'h') PIN.hostGive(g, id, n); else g.netCmd('giveitem', { id, n }); tally.give++; }
      else if (a < 0.93) { if (who === 'h') { if ((S().items[id] | 0) > 0) { S().items[id]--; if (!S().items[id]) delete S().items[id]; used[id]++; } } else { const had = GB()[id] | 0; g.netCmd('spend', { id }); used[id] += had - (GB()[id] | 0); } tally.spend++; }
      else { PIN.flush(g, true); const m = ofType('inv'); sent = sent.filter((x) => x.t !== 'inv'); asGuest(m); }
      for (const k of IDS) if (total(k) !== crafted[k] - used[k]) bad.push(`step ${step} (${who} ${a.toFixed(2)}) ${k}: ${total(k)} != ${crafted[k]} - ${used[k]}`);
      if (g._bagSwap) bad.push('swapped at step ' + step);
    }
    PIN.flush(g, true); asGuest(ofType('inv'));
    const inv = traffic.inv || { n: 0, b: 0 }; if (inv.n > 200 || inv.b / Math.max(1, inv.n) > 400) bad.push(`inv traffic ${inv.n} messages, ${Math.round(inv.b / Math.max(1, inv.n))} bytes each`);
    if (!eq(mirror.items, GB())) bad.push('the guest mirror ' + JSON.stringify(mirror.items) + ' differs from the bag ' + JSON.stringify(GB()));
    for (const e of [...S().entities]) if (e.type === 'marker' || e.type === 'lantern') { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } }
    S().entities = S().entities.filter((e) => e.type !== 'marker' && e.type !== 'lantern');
    return bad.length === 0 || bad.slice(0, 3).join('; ') + ' ' + JSON.stringify(tally);
  });
}
