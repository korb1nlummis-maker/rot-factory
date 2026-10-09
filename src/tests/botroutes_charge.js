// botroutes.charge.*: a bot with a low battery maps a route to the nearest OPEN Charging Station it can really reach (holds charge, a free slot, a way there through the graph),
// follows it, charges, and the route brings it back down to the ground. A bot that can reach none says so once and goes home. A fuel trip that the battery cannot finish goes to the charger first.
// Run: `await __selftest('botroutes.charge')`
import { kit, RT } from './botroutes_lib.js';

export default async function (ctx) {
  const { g, S, w, L } = ctx;
  const X = kit(ctx), C = 0.6, NAV = X.NAV;
  const I0 = () => ctx.toI(-9), K0 = () => ctx.toK(2);
  const callOf = X.callOf;
  const arena = (P, ramps) => { X.clearAbove(P.i0 - 9, P.k0 - 3, 16, 12, 6); X.fence(P.pad, undefined, ramps); };
  const first = (s) => s.split(',')[0];

  await X.guard('botroutes.charge.a-low-battery-bot-takes-the-route-to-a-station-on-a-platform-charges-and-comes-down', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const ch = X.charger(P.i0 + 2, P.k0 + 2, 1, { reserve: 8 });
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.battery = 0.2; b.state = 'idle';
    const seen = { ph: new Set(), status: new Set(), up: 0, back: 0, k: new Set() }, fol = X.follower();
    const rec = X.watch(b, 90, () => !callOf(b) && b.battery > 0.9 && NAV.isGround(b), { each: (bb) => {
      fol.each(bb); const c = callOf(bb); if (c) { seen.ph.add(c.ph); seen.k.add(c.k + ':' + c.m); const r = RT.routeOf(c); seen.up = Math.max(seen.up, r.up.length); seen.back = Math.max(seen.back, r.back.length); }
      seen.status.add(first(g.crew.statusLine(bb)));
    } });
    if (b.battery < 0.9) return `battery ${b.battery.toFixed(2)} (${rec.states.join()}, ${toasts.join(' / ')})`;
    if (![...seen.k].every((k) => k === 'charge:' + ch.id) || !seen.k.size) return 'calls ' + [...seen.k];
    if (!seen.ph.has('up') || !seen.ph.has('down')) return 'phases ' + [...seen.ph];
    if (seen.up < 4 || seen.back < 4) return `routes ${seen.up} ${seen.back}`;
    if (!rec.states.includes('chgwalk') || !rec.states.includes('recharge')) return 'states ' + rec.states;
    if (![...seen.status].some((s) => /Going to charge/.test(s) || /going to charge/i.test(s))) return 'statuses ' + [...seen.status];
    if (![...seen.status].some((s) => /Heading back down/.test(s))) return 'statuses ' + [...seen.status];
    if (!NAV.isGround(b) || callOf(b)) return 'not released on the ground: ' + b.y.toFixed(2) + ' ' + X.dump();
    if (rec.maxGap > 0.25 || rec.minGap < -0.2) return `feet off the surface ${rec.minGap.toFixed(2)} .. ${rec.maxGap.toFixed(2)}`;
    return fol.off <= fol.frames * 0.1 || `off its route ${fol.off} of ${fol.frames}`;
  });

  await X.guard('botroutes.charge.the-nearest-open-reachable-station-wins-and-an-occupied-an-empty-and-a-sealed-one-are-skipped', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);                          // the far one: on a platform, with a ramp
    const Q = await X.platform(I0(), K0() + 12); arena(Q, Q.ramp); g.doDecon({ kind: 'mach', id: Q.ramp.id }); X.run(0.3); X.fence(Q.pad); NAV.invalidate('x');   // a sealed platform: no ramp
    const sealed = X.charger(Q.i0 + 2, Q.k0 + 2, 1, { reserve: 8 });
    const empty = X.charger(P.i0 - 6, P.k0 - 1, 0, { reserve: 0.02 });
    const busy = X.charger(P.i0 - 5, P.k0 + 6, 0, { reserve: 8 });
    const good = X.charger(P.i0 + 2, P.k0 + 2, 1, { reserve: 8 });
    const b = X.mkBot(X.cellX(P.i0 - 5), X.cellZ(P.k0 + 8)); b.battery = 0.2;
    const d1 = X.mkBot(X.cellX(P.i0 - 9), X.cellZ(P.k0 + 6)), d2 = X.mkBot(X.cellX(P.i0 - 9), X.cellZ(P.k0 + 7));
    for (const d of [d1, d2]) { d.chg = busy.id; d.state = 'recharge'; d.battery = 0.5; d.carry = []; d.tx = d.x; d.tz = d.z; }
    X.run(0.05);
    const pick = g.crew.chargerFor(b);
    if (pick !== good) return 'picked ' + (pick ? `${pick.type} at ${pick.i},${pick.k}` : 'nothing') + ' (good is ' + good.id + ', sealed ' + sealed.id + ', empty ' + empty.id + ', busy ' + busy.id + ') ' + toasts.join(' / ');
    // a slot frees up: the busy one is the nearest open one
    d2.state = 'idle'; d2.chg = null; const pick2 = g.crew.chargerFor(b); if (pick2 !== busy) return 'with a slot free it picked ' + (pick2 && pick2.id) + ' not ' + busy.id;
    // a reserve above the empty mark opens the empty one
    d1.state = 'idle'; d1.chg = null; empty.reserve = 3; const pick3 = g.crew.chargerFor(b); if (pick3 !== empty && pick3 !== busy) return 'picked ' + (pick3 && pick3.id);
    return true;
  });

  await X.guard('botroutes.charge.a-bot-that-can-reach-no-station-says-so-once-and-goes-home', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp); g.doDecon({ kind: 'mach', id: P.ramp.id }); X.run(0.3); X.fence(P.pad); NAV.invalidate('x');
    const ch = X.charger(P.i0 + 2, P.k0 + 2, 1, { reserve: 8 });
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.battery = 0.2;
    const rec = X.watch(b, 10);   // (a low battery bot wanders toward the bin and the old physics can climb a plush fence after that: ten seconds are the question)
    const n = toasts.filter((m) => /no way to a charger/i.test(m)).length; if (n !== 1) return `${n} toasts about the charger: ${toasts.join(' / ')}`;
    if (rec.states.includes('chgwalk')) return 'it set off for a station it cannot reach: ' + rec.states.join();
    if (ch.reserve < 7.99) return 'it charged: ' + ch.reserve;
    return X.RT.callOf(g, b) === null || 'a call: ' + X.dump();
  });

  await X.guard('botroutes.charge.two-bots-take-the-two-slots-of-one-station-and-a-third-waits-for-one-to-free', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const ch = X.charger(P.i0 + 2, P.k0 + 2, 1, { reserve: 8 });
    const bots = [0, 1, 2].map((n) => { const b = X.mkBot(X.cellX(P.i0 - 7 - n * 0.4), X.cellZ(P.k0 + 1 + n * 0.5)); b.battery = 0.2; return b; });
    X.run(0.3);
    const on = (b) => b.chg === ch.id; const n = bots.filter(on).length; if (n !== 2) return n + ' bots took the station, two slots: ' + bots.map((b) => b.state + '/' + b.chg).join();
    const calls = RT.callsOf(g, ch.id).length; X.run(0.5); if (RT.callsOf(g, ch.id).length !== 2) return `${RT.callsOf(g, ch.id).length} calls for ${n} bots (${calls} a moment ago)`;
    const third = bots.find((b) => !on(b)); if (!third || third.state === 'chgwalk') return 'the third is on its way too';
    let max = 0; X.run(120, () => { max = Math.max(max, bots.filter((b) => (b.state === 'recharge' || b.state === 'chgwalk') && b.chg === ch.id).length); return bots.every((b) => b.battery > 0.9 && NAV.isGround(b) && !callOf(b)); });
    if (max > 2) return 'three bots at once: ' + max;
    return bots.every((b) => b.battery > 0.85) || 'batteries ' + bots.map((b) => b.battery.toFixed(2)).join();
  });

  await X.guard('botroutes.charge.a-fuel-trip-the-battery-cannot-finish-goes-to-the-nearest-open-charger-first', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1); const ch = X.charger(P.i0 - 6, P.k0 + 6, 0, { reserve: 8 }); X.fillOthers(t); ch.q.length = 0;
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(6); b.battery = 0.5;
    g.crew.goHome(b); if (b.state !== 'fwalk') return 'no errand ' + b.state;
    b.battery = 0.22;   // it drops under the line on the way
    X.run(1.2); if (b.fuelJob) return 'the fuel job stayed: ' + JSON.stringify(b.fuelJob);
    if (b.state !== 'chgwalk' && b.state !== 'recharge') return 'not heading to the charger: ' + b.state;
    X.run(80, () => b.battery > 0.9);
    return b.battery > 0.9 || `battery ${b.battery.toFixed(2)} ${b.state} ${toasts.slice(-2).join(' / ')}`;
  });
}
