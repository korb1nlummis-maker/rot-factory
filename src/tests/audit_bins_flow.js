// audit.bins.flow-*: the audit of the bins wave, one test for each thing the first pass of the builder let through. Run: `await __selftest('audit.bins.flow')`
import { kit } from './bins_lib.js';
import { CART_CAP } from '../cart.js';
import { makeKit as powerKit } from './power_lib.js';
import * as BINS from '../bins.js';
import * as EXT from '../ext.js';

export default async function (ctx) {
  const { g, S, L, toI, toK, craft } = ctx;
  const K = kit(ctx);
  const G = K.guard;

  await G('audit.bins.flow-who-is-assigned-lists-only-things-that-can-be-assigned', async () => {
    const bad = [], e = K.beacon(-2, 4); K.run(0.2);
    const det = K.rawTile('belt', toI(-8), toK(2), { detector: true }), spl = K.rawTile('belt', toI(-8), toK(0), { splitter: true }), lift = K.rawTile('belt', toI(-8), toK(-2), { lift: true }), belt = K.rawTile('belt', toI(-10), toK(2));
    const subs = BINS.subjects(g).filter((s) => s.k === 'ent').map((s) => s.o);
    for (const t of [det, spl, lift]) if (subs.includes(t)) bad.push('a ' + (t.detector ? 'Detector Gate' : t.splitter ? 'splitter' : 'lift') + ' is counted as something that can be assigned a bin');
    if (!subs.includes(belt)) bad.push('a plain belt is missing');
    // the free gate of every new world is a Detector Gate too
    for (const s of BINS.subjects(g)) if (s.k === 'ent' && !BINS.assignable(s.o)) bad.push('not assignable but listed: ' + s.o.type);
    void e;
    return bad.length === 0 || bad.join(' || ');
  });

  await G('audit.bins.flow-a-depot-taken-down-takes-its-tally-with-it-and-a-sale-on-its-way-there-counts-nowhere', async () => {
    const bad = [], e = K.beacon(-2, 4, { num: 0 }), f = K.beacon(-6, 6, { num: 1 }); K.run(0.2);
    BINS.note(g, e.id, 5, 50); BINS.note(g, f.id, 2, 20);
    g.doDecon({ kind: 'mach', id: e.id });
    if (S().binStats[e.id]) bad.push('the tally of a depot that is gone is still kept: ' + JSON.stringify(S().binStats[e.id]));
    BINS.note(g, e.id, 3, 30);   // a truck that was on its way when the depot was hammered
    if (S().binStats[e.id]) bad.push('a sale credited a bin that is not there');
    if (BINS.today(g, f.id).n !== 2) bad.push('another depot lost its tally');
    const money = () => K.money(), m0 = money(); g.sellAuto(3, 0, 1, e.id); if (!(money() > m0)) bad.push('the sale itself must still pay');
    return bad.length === 0 || bad.join(' || ');
  });

  await G('audit.bins.flow-a-depot-saved-before-bins-had-numbers-is-numbered-once-not-on-every-lookup', async () => {
    const bad = [], a = K.beacon(-2, 4), b = K.beacon(-6, 6); K.run(0.2);
    if (Number.isInteger(a.num) || Number.isInteger(b.num)) return 'the fixture should have no numbers';
    // the hot paths (a bot's every tick, a belt end's every plush) ask for a bin by id: that must fix the numbers, not search every entity each time
    BINS.resolve(g, b.id);
    if (!Number.isInteger(a.num) || !Number.isInteger(b.num) || a.num === b.num) bad.push(`numbers after one lookup: ${a.num} ${b.num}`);
    const names = [BINS.nameOf(g, a), BINS.nameOf(g, b)].join(); if (names !== 'Depot A,Depot B') bad.push('names ' + names);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('audit.bins.flow-a-bot-that-never-finished-a-trip-to-the-sort-bin-asks-the-battery-again', async () => {
    const bad = [], e = K.beacon(-8, 9); K.run(0.2); K.corridor(-10, 3, 7.5);
    const b = K.mkBot(-2, 7); b.dest = e.id; b.carry = K.mix(3); b.battery = 1; b.hallTrip = true;   // the last trip was cut short (an order interrupted it) and the bot has charged since
    g.crew.goHome(b);
    const end = b.path[b.path.length - 1];
    if (Math.hypot(end[0] - e.x, end[1] - (e.z + 1.6)) > 0.05) bad.push('a full battery should walk to the depot, the path ends at ' + JSON.stringify(end));
    if (b.hallTrip) bad.push('hallTrip stayed');
    return bad.length === 0 || bad.join(' || ');
  });

  await G('audit.bins.flow-a-name-is-shown-as-typed-in-the-travel-menu-and-an-invisible-name-is-no-name', async () => {
    const bad = [], e = K.beacon(-2, 4, { num: 0 }); K.run(0.2);
    let r = g.setCfg(e, { name: '​​' }); if (!r.ok || BINS.nameOf(g, e) !== 'Depot A') bad.push('a name of zero width characters: ' + JSON.stringify(BINS.nameOf(g, e)));
    r = g.setCfg(e, { name: '‮SORT bin' }); if (/‮/.test(e.name)) bad.push('a right to left override was kept');
    r = g.setCfg(e, { name: 'x'.repeat(19) + '😀' }); if (/[\ud800-\udbff]$/.test(e.name)) bad.push('a symbol was cut in half: ' + JSON.stringify(e.name.slice(-2)));
    g.setCfg(e, { name: 'R&amp;D <3 &lt;b&gt;' });
    g.mode = 'play'; g.ui.open('travel');
    const row = [...document.querySelectorAll('#travelList .trow')].find((x) => /R&amp;D/.test(x.querySelector('b').textContent));
    if (!row) bad.push('the travel menu does not show the name as it was typed: ' + [...document.querySelectorAll('#travelList .trow b')].map((x) => x.textContent));
    g.ui.closeModals();
    return bad.length === 0 || bad.join(' || ');
  });

  await G('audit.bins.flow-a-line-cache-is-never-part-of-what-a-guest-or-a-save-is-sent', async () => {
    const bad = [], b = K.bin(), ie = toI(b.x) - 2, k = toK(b.z);
    for (let i = ie - 5; i <= ie; i++) K.rawTile('belt', i, k, { dir: 0 }); K.rawTile('belt', ie - 5, k - 1, { dir: 1 }); const m = K.rawTile('mech', ie - 4, k - 1, { dir: 0, buf: [], out: 0, adv: 0, state: 'dig' }); m.timer = 1e9;
    K.run(0.2); g.setCfg(m, { dest: BINS.HALL }); m.buf = K.mix(3); K.run(5);
    const wire = g.stripEnt(m), text = JSON.stringify(m);
    for (const key of Object.keys(m)) if (/^_/.test(key) || m[key] instanceof Map || m[key] instanceof Set) bad.push('the mech carries runtime state in its own fields: ' + key);
    if (/_lc|lockT/.test(JSON.stringify(wire)) || /_lc|lockT/.test(text)) bad.push('what a guest or a save gets carries the cache: ' + Object.keys(wire));
    void EXT; void L; void S;
    return bad.length === 0 || bad.join(' || ');
  });

  await G('audit.bins.flow-a-bot-with-a-bin-of-its-own-hauls-a-carts-load-to-the-carts-bin', async () => {
    const bad = [], d1 = K.beacon(-4, 2, { num: 0 }), d2 = K.beacon(-10, 10, { num: 1 }); K.run(0.2); K.corridor(-12, 8, 6, 12);
    craft('cart:1'); g.useCart(); const c = S().cart; c.mode = 'stay'; c.y = 0; c.dest = d1.id; c.x = 10; c.z = 8;
    for (let q = 0; q < CART_CAP[1]; q++) c.load.push({ sp: 2, vr: 0 });
    const b = K.mkBot(8, 8); b.state = 'idle'; b.dest = d2.id;   // the bot unloads at its own bin when it digs, the cart's load is the cart's
    K.until(() => c.load.length === 0 && b.state === 'idle' && !b.carry.length, 400);
    if (c.load.length) return 'the bot never emptied the cart: ' + c.load.length + ' ' + b.state;
    const at1 = BINS.today(g, d1.id).n, at2 = BINS.today(g, d2.id).n;
    if (at1 < CART_CAP[1] || at2) bad.push(`the cart is bound for the first depot but its load was sold ${at1} there and ${at2} at the bot's own depot`);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('audit.bins.flow-a-loaded-game-does-not-inherit-what-the-last-game-already-said', async () => {
    const bad = [], d = K.beacon(-2, 4, { num: 0 }); K.run(0.2); const t = K.rawTile('mech', toI(-8), toK(4)); g.setCfg(t, { dest: d.id });
    K.off.add(d.id); K.run(0.2); BINS.fallback(g, { k: 'ent', o: t }, 'unpowered', 'Depot A');
    if (!g._binSaid || g._binSaid.size !== 1) return 'the fixture did not say anything: ' + (g._binSaid && g._binSaid.size);
    const key = 'rotfactory.save.v1', kept = localStorage.getItem(key), noSave0 = g.noSave;
    try { g.noSave = false; g.mode = 'play'; if (!g.save()) return 'save failed'; const { loadSaved } = await import('../state.js'); const sv = loadSaved(); g.loadWorld(sv.S, sv); }
    finally { g.noSave = noSave0; if (kept === null) localStorage.removeItem(key); else localStorage.setItem(key, kept); g.mode = 'play'; }
    if (g._binSaid.size) bad.push('the new game starts hushed for ' + g._binSaid.size + ' message(s)');
    return bad.length === 0 || bad.join(' || ');
  });

  await G('audit.bins.flow-a-depot-on-a-real-grid-is-a-bin-while-its-generator-burns-and-is-dark-when-it-stops', async () => {
    const bad = [], P = powerKit(ctx); P.reset({ power: 1, belts: 1, depots: 1, crew: 1, crewSlots: 3 });
    const G2 = P.grid(-6, 4, { gens: 1 }), d = P.mach('beacon', -4.6, 4, { num: 0 }), bot = K.mkBot(-2, 6); bot.dest = d.id; P.wire(G2.pole, d);   // a depot runs on its own cable to the pole
    const step = (secs) => { for (let n = 0; n < secs / 0.1; n++) { g.time += 0.1; g.power.update(0.1); } };
    step(1);
    if (!((d.pw ?? 0) > 0.05)) return 'the depot has no power on a grid with a burning generator: ' + d.pw;
    if (BINS.resolve(g, d.id).bin === null || g.crew.home(bot).id !== d.id) bad.push('a powered depot was not used');
    K.toasts.length = 0; G2.gens[0].burn = 0; G2.gens[0].lit = false; g.power.markDirty(); step(1);
    if ((d.pw ?? 0) > 0.05) bad.push('the depot still has power with the generator out: ' + d.pw);
    const r = BINS.resolve(g, d.id); if (r.bin || r.why !== 'unpowered') bad.push('a dark depot should resolve as unpowered: ' + JSON.stringify(r.why));
    if (g.crew.home(bot).id !== BINS.HALL || !K.toasts.some((t) => /Depot A has no power, so it uses Auto/.test(t))) bad.push('the bot did not fall back and say so: ' + g.crew.home(bot).id + ' ' + K.toasts);
    // the surge: the whole grid goes down for 40 s, and the bot comes back to the depot when it ends
    G2.gens[0].burn = 1e5; G2.gens[0].lit = true; g.power.markDirty(); step(1); if (g.crew.home(bot).id !== d.id) bad.push('power back, the bot should use the depot again');
    g.power.outage = true; g.power.markDirty(); step(1); if (g.crew.home(bot).id !== BINS.HALL) bad.push('in a surge the bot should use the SORT bin');
    g.power.outage = false; g.power.markDirty(); step(1); if (g.crew.home(bot).id !== d.id) bad.push('after the surge the bot should use the depot again');
    return bad.length === 0 || bad.join(' || ');
  });
}
