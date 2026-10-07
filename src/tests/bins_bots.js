// bins.bot.*: crew bots and carts with a bin of their own: where they walk, where they sell, what the battery allows, what a missing bin does. Run: `await __selftest('bins.bot.')`
import { kit } from './bins_lib.js';
import * as BINS from '../bins.js';
import { NEEDLE } from '../plushdata.js';
import { CART_CAP } from '../cart.js';

export default async function (ctx) {
  const { g, S, L, toI, toK, cellX, cellZ, craft } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const val = (sp) => g.valueOf(sp, 0, 0);
  const sold = (id) => BINS.today(g, id);

  await G('bins.bot.auto-is-the-sort-bin-exactly-as-before', async () => {
    const bad = [], b = K.mkBot(-6, 5), h = g.crew.home(), hb = g.crew.home(b), bp = K.bin();
    if (h.x !== bp.x || h.z !== bp.z + 1.6 || h.id !== BINS.HALL) bad.push('home() ' + JSON.stringify(h));
    if (hb.x !== h.x || hb.z !== h.z) bad.push('an Auto bot unloads elsewhere: ' + JSON.stringify(hb));
    b.carry = K.mix(5); const m0 = K.money(); g.crew.goHome(b); K.until(() => b.state === 'unload' && b.carry.length === 0, 140);
    if (K.money() - m0 !== 5 * val(3)) bad.push(`paid ${K.money() - m0}, 5 plush are worth ${5 * val(3)}`);
    if (sold(BINS.HALL).n !== 5) bad.push('tally at the SORT bin ' + sold(BINS.HALL).n);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.bot.walks-to-its-depot-and-sells-there-for-the-same-money', async () => {
    const bad = [], e = K.beacon(-2, 9); K.run(0.2); const b = K.mkBot(8, 3); b.dest = e.id; b.carry = K.mix(6);
    const m0 = K.money(); g.crew.goHome(b);
    if (b.state !== 'return' || Math.hypot(b.path[b.path.length - 1][0] - e.x, b.path[b.path.length - 1][1] - (e.z + 1.6)) > 0.01) bad.push('path does not end at the depot: ' + JSON.stringify(b.path[b.path.length - 1]));
    let atSale = null; K.until(() => { if (b.state === 'unload' && b.carry.length < 6 && !atSale) atSale = Math.hypot(b.x - e.x, b.z - e.z); return b.state === 'unload' && b.carry.length === 0; }, 200);
    if (b.carry.length) bad.push('it never sold: ' + b.state);
    if (atSale === null || atSale > 3.5) bad.push('sold ' + atSale + ' m from the depot');
    if (K.money() - m0 !== 6 * val(3)) bad.push(`paid ${K.money() - m0}, worth ${6 * val(3)}`);
    if (sold(e.id).n !== 6 || sold(BINS.HALL).n !== 0) bad.push(`tally depot ${sold(e.id).n} bin ${sold(BINS.HALL).n}`);
    if (!/Unloading at Depot A|Waiting at the bin|Hanging around/.test(g.crew.statusLine(b)) && !/unloads at Depot A/.test(g.crew.statusLine(b))) bad.push('status line: ' + g.crew.statusLine(b));
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.bot.never-sells-from-afar-and-idles-at-the-sort-bin-not-the-depot', async () => {
    const bad = [], e = K.beacon(-2, 9); K.run(0.2); const b = K.mkBot(K.bin().x, K.bin().z + 1.6); b.dest = e.id; b.carry = K.mix(3);
    b.state = 'unload'; b.cleared = true; b.timer = 0; const m0 = K.money(); K.run(0.5);
    if (K.money() !== m0 || b.carry.length !== 3) bad.push('it sold from the SORT bin with a depot assigned');
    if (b.state !== 'return') bad.push('state ' + b.state);
    // idle and waiting bots stay at the SORT bin
    const c = K.mkBot(4, 4); c.dest = e.id; c.state = 'idle'; K.run(40); if (Math.hypot(c.x - K.bin().x, c.z - K.bin().z) > 6) bad.push('an idle bot with a depot went to ' + c.x + ',' + c.z);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.bot.too-little-battery-for-a-far-depot-goes-to-a-charger-first-then-on-to-the-depot', async () => {
    const bad = [], e = K.beacon(-60, 9); K.corridor(-62, 0, 7.5); K.run(0.2); const b = K.mkBot(-4, 7); b.dest = e.id; b.carry = K.mix(4); b.battery = 0.05;
    const ch = K.rawTile('charger', toI(-5), toK(8), { reserve: 5 }); const seen = [];
    g.crew.goHome(b); seen.push(b.state);
    if (b.state !== 'chgwalk' || b.chgNext !== 'home') bad.push(`state ${b.state} next ${b.chgNext}`);
    if (!K.toasts.some((t) => /cannot reach Depot A on its battery, so it charges first/.test(t))) bad.push('it did not say so: ' + K.toasts);
    K.until(() => b.state === 'unload' && b.carry.length === 0, 300, 0.1); const m1 = K.money();
    if (b.carry.length || !(m1 > 1e12)) bad.push('never sold');
    if (sold(e.id).n !== 4) bad.push('sold at the wrong bin: depot ' + sold(e.id).n + ' bin ' + sold(BINS.HALL).n);
    if (b.dest !== e.id) bad.push('the bot lost its depot');
    void ch;
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.bot.no-charger-for-a-far-depot-means-the-sort-bin-this-trip-and-it-says-so', async () => {
    const bad = [], e = K.beacon(-60, 9); K.corridor(-62, 0, 7.5); K.run(0.2); const b = K.mkBot(-4, 7); b.dest = e.id; b.carry = K.mix(4); b.battery = 0.05;
    g.crew.goHome(b);
    if (b.state !== 'return' || !b.hallTrip) bad.push(`state ${b.state} hallTrip ${b.hallTrip}`);
    if (!K.toasts.some((t) => /cannot reach Depot A on its battery|farther|cannot reach/.test(t))) bad.push('no message: ' + K.toasts);
    K.until(() => b.state === 'unload' && b.carry.length === 0, 300); K.run(1);
    if (sold(BINS.HALL).n !== 4 || sold(e.id).n !== 0) bad.push(`sold: bin ${sold(BINS.HALL).n} depot ${sold(e.id).n}`);
    if (b.dest !== e.id || b.hallTrip) bad.push(`after the trip: dest ${b.dest} hallTrip ${b.hallTrip} (the assignment stays, the next trip tries it again)`);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.bot.a-depot-without-power-or-taken-down-sends-the-bot-to-the-sort-bin-and-says-so', async () => {
    const bad = [], e = K.beacon(-2, 9); K.run(0.2); const b = K.mkBot(2, 5); b.dest = e.id; b.carry = K.mix(3);
    K.off.add(e.id); K.run(0.2); g.crew.goHome(b);
    if (Math.abs(b.path[b.path.length - 1][0] - K.bin().x) > 0.01) bad.push('with the depot dark it should walk to the bin: ' + JSON.stringify(b.path[b.path.length - 1]));
    if (!K.toasts.some((t) => /Depot A has no power, so it uses Auto/.test(t))) bad.push('no unpowered message: ' + K.toasts);
    if (b.dest !== e.id) bad.push('the assignment must stay while the depot is only dark');
    K.off.delete(e.id); K.run(0.2); if (g.crew.home(b).id !== e.id) bad.push('power back, it should go to the depot again');
    K.gone(e); K.toasts.length = 0; const h = g.crew.home(b);
    if (h.id !== BINS.HALL || b.dest !== 0) bad.push(`gone: home ${h.id} dest ${b.dest}`);
    if (!K.toasts.some((t) => new RegExp(b.name + '.*is gone, so it goes back to Auto').test(t))) bad.push('no gone message: ' + K.toasts);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.bot.carrying-the-one-always-goes-to-the-sort-bin-and-its-gate', async () => {
    const bad = [], e = K.beacon(-2, 9); K.run(0.2); const b = K.mkBot(-6, 5); b.dest = e.id; b.carry = [{ sp: NEEDLE, vr: 0 }, ...K.mix(2)];
    const h = g.crew.home(b); if (h.id !== BINS.HALL) bad.push('a bot with The One would unload at ' + h.name);
    if (b.dest !== e.id) bad.push('the assignment was dropped');
    b.carry.shift(); if (g.crew.home(b).id !== e.id) bad.push('without The One it goes back to its depot');
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.bot.stuck-bot-phased-home-unloads-at-the-sort-bin-then-tries-its-depot-again', async () => {
    const bad = [], e = K.beacon(-2, 9); K.run(0.2); const b = K.mkBot(-6, 5); b.dest = e.id; b.carry = K.mix(3); g.crew.beam(b);
    if (!b.hallTrip || Math.hypot(b.x - K.bin().x, b.z - (K.bin().z + 1.6)) > 0.5) bad.push('the beam did not bring it to the SORT bin');
    K.until(() => b.state === 'unload' && b.carry.length === 0, 60);
    if (sold(BINS.HALL).n !== 3) bad.push('sold ' + sold(BINS.HALL).n + ' at the SORT bin');
    K.run(1); if (b.hallTrip) bad.push('hallTrip stayed set');
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.bot.a-cart-bound-for-a-depot-is-hauled-there-and-dumps-itself-only-there', async () => {
    const bad = [], e = K.beacon(-4, 2); K.run(0.2); craft('cart:1'); g.useCart(); const c = S().cart; c.mode = 'stay'; c.y = 0; c.dest = e.id; c.x = -4; c.z = 8;
    for (let q = 0; q < CART_CAP[1]; q++) c.load.push({ sp: 2, vr: 0 });
    // near the SORT bin the cart does not dump into it: it is bound for the depot
    const bp = K.bin(); c.x = bp.x - 1.5; c.z = bp.z + 1.5; const m0 = K.money(); for (let n = 0; n < 60; n++) g.autoDump(0.05);
    if (c.load.length !== CART_CAP[1] || K.money() !== m0) bad.push('the cart dumped into the SORT bin though it is bound for a depot: ' + c.load.length);
    // near the depot it dumps itself there
    c.x = e.x - 1.5; c.z = e.z + 1.5; for (let n = 0; n < 1200 && c.load.length; n++) g.autoDump(0.05);
    if (c.load.length) bad.push('still holds ' + c.load.length + ' at the depot');
    if (sold(e.id).n !== CART_CAP[1] || sold(BINS.HALL).n !== 0) bad.push(`tally depot ${sold(e.id).n} bin ${sold(BINS.HALL).n}`);
    // a bot hauls the full cart to the depot
    for (let q = 0; q < CART_CAP[1]; q++) c.load.push({ sp: 2, vr: 0 }); c.hauling = false; c.x = 10; c.z = 8;
    const b = K.mkBot(8, 8); b.state = 'idle'; let sawDest = 0; K.until(() => { if (b.haulDest === e.id) sawDest++; return c.load.length === 0 && b.state === 'idle'; }, 400);
    if (c.load.length) bad.push('the bot never emptied the cart: ' + c.load.length + ' ' + b.state);
    if (!sawDest) bad.push('the bot did not take the cart\'s depot');
    if (sold(e.id).n < CART_CAP[1] + 1) bad.push('the hauled load was not sold at the depot: ' + JSON.stringify(S().binStats) + ' ' + JSON.stringify(S().crew.map((q) => [q.state, q.haulDest, q.hallTrip, q.carry.length, +q.x.toFixed(1), +q.z.toFixed(1)])) + ' cart ' + c.load.length + ' ' + K.toasts.join(' / '));
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.bot.the-cart-with-its-depot-gone-or-dark-uses-the-nearest-sink-and-says-so', async () => {
    const bad = [], e = K.beacon(-4, 2); K.run(0.2); craft('cart:1'); g.useCart(); const c = S().cart; c.mode = 'stay'; c.y = 0; c.dest = e.id; const bp = K.bin();
    for (let q = 0; q < 5; q++) c.load.push({ sp: 2, vr: 0 }); c.x = bp.x - 1.5; c.z = bp.z + 1.5;
    K.off.add(e.id); K.run(0.2); for (let n = 0; n < 400 && c.load.length; n++) g.autoDump(0.05);
    if (c.load.length) bad.push('a cart bound for a dark depot stood at the bin and kept its load');
    if (!K.toasts.some((t) => /Your cart: Depot A has no power/.test(t))) bad.push('no message: ' + K.toasts);
    K.off.delete(e.id); K.gone(e); for (let q = 0; q < 3; q++) c.load.push({ sp: 2, vr: 0 }); for (let n = 0; n < 400 && c.load.length; n++) g.autoDump(0.05);
    if (c.dest || c.load.length) bad.push(`gone: dest ${c.dest} load ${c.load.length}`);
    void L; void cellX; void cellZ;
    return bad.length === 0 || bad.join(' || ');
  });
}
