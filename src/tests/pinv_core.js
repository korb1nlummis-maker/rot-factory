// pinv.*: per-player inventories (src/playerinv.js), the parts that need no second player: single player is unchanged, the accessor and the swap, the sanitising of bags, the
// numbers and owner marks, the give key and the inventory click, the texts. The two-player behaviour is in mp_pinv.js (prefix mp.pinv.).
import * as PIN from '../playerinv.js';
import { CONTROLS } from '../controls.js';

export default async function (ctx) {
  const { T, g, S, p, fresh, V3, recipes } = ctx;
  const FULL = { timber: 1, steel: 1, firstaid: 1, markers: 1, lantern: 1, struts: 1, jacks: 1, power: 1, belts: 1, crew: 1, claw: 1 };
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const fakeRemote = (x, y, z) => ({ pos: new V3(x, y, z), vel: new V3(), update() {}, dispose() {}, set() {}, setHeld() {}, spheres() { return []; } });
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); g.remote = null; g._actor = null; g.stowed = true; } });
  const ents = (type) => S().entities.filter((e) => e.type === type);
  const hostPlace = (id, kind, x, z) => { g.plan = { ok: true, ent: { x, y: 0, z } }; g.placeCurrent({ id, kind }); g.plan = null; };

  await guard('pinv.single-player-is-unchanged', async () => {
    fresh(FULL); const bad = [];
    g.craftItem('marker', 2); hostPlace('marker', 'marker', 6, 3);
    const e = ents('marker')[0];
    if (!e) return 'nothing placed';
    if (e.own !== undefined) bad.push('an owner mark in single player ' + e.own);
    if (S().ginv !== undefined) bad.push('a bag store in single player');
    if (S().items.marker !== 1) bad.push('items ' + JSON.stringify(S().items));
    g.doDecon({ kind: 'mach', id: e.id }); if (S().items.marker !== 2) bad.push('refund ' + JSON.stringify(S().items));
    if (g._bagSwap || g._refundTo !== undefined) bad.push('swap state left');
    if (PIN.ownedCount(g, 'claw') !== g.machines.count('claw')) bad.push('owned count differs alone');
    if (PIN.invFor(g) !== S().items || PIN.invFor(g, 'h') !== S().items || PIN.matsFor(g) !== S().mats) bad.push('invFor is not the host bag alone');
    return bad.length === 0 || bad.join('; ');
  });
  await guard('pinv.invfor-is-one-accessor-for-the-host-the-friend-and-the-acting-player', async () => {
    fresh(FULL); role('host'); cap(); const bad = [];
    const host = S().items, mats = S().mats, bar = S().hotbar;
    const gi = PIN.invFor(g, 'g'); if (gi === host || PIN.invFor(g, 'h') !== host) bad.push('the two bags are one');
    if (PIN.invFor(g) !== host) bad.push('acting default is not the host');
    PIN.runAs(g, 'g', () => {
      if (S().items !== gi || S().mats === mats || S().hotbar === bar) bad.push('not swapped inside');
      if (PIN.invFor(g) !== gi || PIN.invFor(g, 'h') !== host || PIN.invFor(g, 'g') !== gi) bad.push('invFor inside the swap');
      if (PIN.acting(g) === 'h') bad.push('acting is the host inside');
      PIN.runAs(g, 'h', () => { if (S().items !== host || PIN.invFor(g) !== host) bad.push('nested host swap'); });
      if (S().items !== gi) bad.push('not back to the friend after a nested swap');
    });
    if (S().items !== host || S().mats !== mats || S().hotbar !== bar || g._bagSwap) bad.push('not restored');
    try { PIN.runAs(g, 'g', () => { throw new Error('boom'); }); } catch (e) { /* expected */ }
    if (S().items !== host || S().hotbar !== bar || g._bagSwap || PIN.acting(g) !== 'h') bad.push('not restored after a throw');
    // the friend's page has one bag: its own S.items, whoever is asked
    role('guest'); if (PIN.invFor(g, 'h') !== S().items || PIN.invFor(g, 'g') !== S().items) bad.push('guest page invFor'); role('host');
    return bad.length === 0 || bad.join('; ');
  });
  await guard('pinv.the-hosts-hotbar-is-redrawn_after_a_friends_command_not_during', async () => {
    fresh(FULL); role('host'); cap(); g.craftItem('marker', 1); const before = g.tools.map((t) => t && t.id + t.count).join();
    let during = null; PIN.runAs(g, 'g', () => { S().items.strut = 9; g.rebuildTools(); during = g.tools.map((t) => t && t.id + t.count).join(); });
    const after = g.tools.map((t) => t && t.id + t.count).join();
    return (during === before && after === before && !g.tools.some((t) => t && t.id === 'strut') && !g._rtLater) || JSON.stringify({ before, during, after });
  });
  await guard('pinv.maps-are-cleaned-and-capped', async () => {
    const m = PIN.cleanMap({ marker: 5, strut: 5e9, 'bad id': 1, '__proto__': 3, constructor: 2, neg: -4, nan: NaN, str: 'x', frac: 2.9, zero: 0, ok_1: 1 });
    const bad = [];
    if (m.marker !== 5 || m.strut !== PIN.BAG_MAX || m.frac !== 2 || m.ok_1 !== 1) bad.push('values ' + JSON.stringify(m));
    for (const k of ['bad id', 'constructor', 'neg', 'nan', 'str', 'zero']) if (Object.prototype.hasOwnProperty.call(m, k)) bad.push('kept ' + k);
    if (Object.getPrototypeOf(m) !== Object.prototype) bad.push('prototype changed');
    const big = {}; for (let n = 0; n < 500; n++) big['it' + n] = 1; if (Object.keys(PIN.cleanMap(big)).length !== PIN.BAG_IDS) bad.push('ids not capped');
    if (Object.keys(PIN.cleanMap(null)).length || Object.keys(PIN.cleanMap('x')).length || Object.keys(PIN.cleanMap([1, 2])).length > 2) bad.push('non-maps');
    return bad.length === 0 || bad.join('; ');
  });
  await guard('pinv.player-numbers-are-stable-and-the-host-is-zero', async () => {
    fresh(FULL); role('host'); cap(); const bad = [];
    const a = PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }), b = PIN.hello(g, { name: 'Bob', pid: 'bobpid654321' });
    if (a.n !== 1 || b.n !== 2) bad.push('numbers ' + [a.n, b.n]);
    if (PIN.ownerNum(g) !== 0) bad.push('the host is not 0');
    PIN.runAs(g, 'g', () => { if (PIN.ownerNum(g) !== 2) bad.push('acting number ' + PIN.ownerNum(g)); });
    PIN.guestLeft(g); PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); if (PIN.curBag(g).n !== 1 || S().ginv.n !== 2) bad.push('number changed on rejoin');
    PIN.clearBags(g); const c = PIN.hello(g, { name: 'Cy', pid: 'cypid1234567' }); if (c.n !== 3) bad.push('a number was handed out twice: ' + c.n);
    role('guest'); g._myN = 7; if (PIN.ownerNum(g) !== 7) bad.push('guest page number'); g._myN = 0; role('host');
    return bad.length === 0 || bad.join('; ');
  });
  await guard('pinv.owner-marks-stamp-each-new-piece-once-and-only-in-co-op-ids', async () => {
    fresh(FULL); role('host'); cap(); const bad = [];
    g.craftItem('marker', 3); hostPlace('marker', 'marker', 6, 3); const e1 = ents('marker')[0]; delete e1.own;
    PIN.stamp(g, 0); if (e1.own !== 0) bad.push('first stamp ' + e1.own);
    hostPlace('marker', 'marker', 9, 3); const e2 = ents('marker')[1]; PIN.stamp(g, 5); if (e2.own !== 5 || e1.own !== 0) bad.push('second stamp ' + [e1.own, e2.own]);
    PIN.stamp(g, 9); if (e2.own !== 5) bad.push('restamped');
    // the stamp goes out with the piece (a friend's page can count its own rigs)
    if (g.stripEnt(e2).own !== 5) bad.push('own is not sent');
    // a friend's arrival makes everything standing the host's
    S().entities.forEach((e) => { delete e.own; }); PIN.hello(g, { name: 'Ann', pid: 'annpid123456' }); if (!ents('marker').every((e) => e.own === 0)) bad.push('hello did not claim the old pieces');
    return bad.length === 0 || bad.join('; ');
  });
  await guard('pinv.shift-click-and-the-slash-key-hand-an-item-over', async () => {
    fresh(FULL); role('host'); cap(); g.remote = fakeRemote(1.5, 0, 0); p().pos.set(0, 0, 0); const bad = [];
    g.craftItem('marker', 12); g.stowed = false; g.selectTool(S().hotbar.indexOf('marker'));
    const key = (shift) => g.onKey({ code: 'Slash', shiftKey: !!shift, preventDefault() {}, target: document.body }, true);
    key(false); if (S().items.marker !== 11 || PIN.invFor(g, 'g').marker !== 1) bad.push('one ' + JSON.stringify([S().items, PIN.invFor(g, 'g')]));
    key(true); if (S().items.marker !== 1 || PIN.invFor(g, 'g').marker !== 11) bad.push('ten ' + JSON.stringify([S().items, PIN.invFor(g, 'g')]));
    g.remote.pos.set(5, 0, 0); key(false); if (S().items.marker !== 1) bad.push('gave from 5 m');
    g.remote.pos.set(1.5, 0, 0); g.stowed = true; key(false); if (S().items.marker !== 1) bad.push('gave with nothing in hand');
    // the inventory: shift+click hands one of the clicked item
    const nm = recipes(g).find((r) => r.id === 'marker').name; const before = S().items.marker | 0;
    g.ui.invSel = null; g.ui.open('inv'); if (!/Shift\+click/.test(document.getElementById('invInfo').textContent)) bad.push('the pack does not say how to hand something over');
    const slot = [...document.querySelectorAll('#invGrid .islot')].find((el) => el.title === nm);
    if (!slot) bad.push('no slot for ' + nm); else {
      slot.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); if ((S().items.marker | 0) !== before - 1 || PIN.invFor(g, 'g').marker !== 12) bad.push('shift+click ' + JSON.stringify([S().items, PIN.invFor(g, 'g')]));
      const keepSel = g.ui.invSel; slot.dispatchEvent(new MouseEvent('click', { bubbles: true })); if ((S().items.marker | 0) !== before - 1) bad.push('a plain click gave something'); void keepSel;
    }
    g.ui.closeModals();
    // alone, the key only says so
    role(null); g.remote = null; key(false);
    return bad.length === 0 || bad.join('; ');
  });
  await guard('pinv.texts-say-what-is-shared-and-what-is-yours', async () => {
    const how = document.getElementById('howto').textContent, multi = document.getElementById('multi').textContent, bad = [];
    if (/there is no separate bag/i.test(how)) bad.push('How to Play still says there is no separate bag');
    if (!/your own pack/i.test(how) || !/3 m/.test(how) || !/placed/.test(how)) bad.push('How to Play lacks the pack rules');
    if (/crafted items[^.]*are all shared/i.test(multi)) bad.push('the Play Together window still shares crafted items');
    if (!/own pack/i.test(multi)) bad.push('the Play Together window lacks the pack');
    const rows = CONTROLS.flatMap((x) => x.rows); const give = rows.find((r) => r.codes.includes('Slash'));
    if (!give || !/friend/.test(give.what) || !/3 m/.test(give.what)) bad.push('controls has no give key');
    if (!document.getElementById('mpForget')) bad.push('no clear button');
    return bad.length === 0 || bad.join('; ');
  });
  await guard('pinv.the-bench-and-the-rig-readouts-say-whose-count-it-is', async () => {
    fresh({ ...FULL, rigCount: 1 }); role('host'); cap(); const bad = [];
    const row = () => recipes(g).find((r) => r.id === 'claw'), st = () => { const r = row(); return r && typeof r.status === 'string' ? r.status : r && r.status; };
    role(null); const alone = st(); role('host'); const together = st();
    if (!/rigs placed$/.test(alone || '')) bad.push('alone: ' + alone);
    if (!/rigs placed by you$/.test(together || '')) bad.push('together: ' + together);
    return bad.length === 0 || bad.join('; ');
  });
}
