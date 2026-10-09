// botroutes.audit.flow.*: adversarial checks of the call routes: a battery that dies mid-route, a way down that is gone, orders and removals mid-call, a charger that runs dry or is taken
// down while a bot is on it, a station that a third bot is sent to, a save that loads mid charge, and the memory the layer keeps.
// Run: `await __selftest('botroutes.audit.flow')`
import { kit, RT } from './botroutes_lib.js';

export default async function (ctx) {
  const { g, S, L } = ctx;
  const X = kit(ctx), C = 0.6, NAV = X.NAV;
  const I0 = () => ctx.toI(-9), K0 = () => ctx.toK(2);
  const callOf = X.callOf;
  const arena = (P, ramps) => { X.clearAbove(P.i0 - 9, P.k0 - 3, 16, 12, 6); X.fence(P.pad, undefined, ramps); };
  const reload = (b) => {   // what a save and a load keep: the state as JSON (the crew and the calls in it), nothing of the runtime
    const j = JSON.parse(JSON.stringify({ crew: S().crew, calls: S().botCalls })); S().crew.length = 0; for (const q of j.crew) S().crew.push(q); S().botCalls = j.calls;
    for (const q of S().crew) NAV.resetBot(q); g.crew.sync(); NAV.invalidate('load'); return S().crew.find((q) => q.id === b.id);
  };

  await X.guard('botroutes.audit.flow.a-battery-that-dies-on-the-ramp-still-ends-on-the-ground-with-no-call', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(8); const n0 = X.count();
    g.crew.goHome(b); let hit = false;
    const rec = X.watch(b, 150, () => hit && !callOf(b) && NAV.isGround(b) && b.state !== 'fwalk', { each: (bb) => { if (!hit && bb.y > 0.3 && bb.state === 'fwalk') { hit = true; bb.battery = 0.0; } } });
    if (!hit) return 'never got on the ramp: ' + rec.states.join();
    if (!NAV.isGround(b)) return `still up at ${b.y.toFixed(2)} in ${b.state} (${rec.states.join()}) ${X.dump()} ${toasts.slice(-2).join(' / ')}`;
    if (callOf(b)) return 'a call is left ' + X.dump();
    if (b.battery < -0.01 || !Number.isFinite(b.battery)) return 'battery ' + b.battery;
    return X.count() === n0 || `plush ${X.count()} was ${n0}`;
  });

  await X.guard('botroutes.audit.flow.a-battery-that-dies-while-heading-back-down-still-gets-down', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(8);
    g.crew.goHome(b); let hit = false;
    const rec = X.watch(b, 150, () => hit && !callOf(b) && NAV.isGround(b), { each: (bb) => { const c = callOf(bb); if (!hit && c && c.ph === 'down' && bb.y > 0.3) { hit = true; bb.battery = 0.0; } } });
    if (!hit) return 'never headed down: ' + rec.states.join();
    return (NAV.isGround(b) && !callOf(b)) || `still up at ${b.y.toFixed(2)} ${b.state} ${X.dump()} ${toasts.slice(-2).join(' / ')}`;
  });

  await X.guard('botroutes.audit.flow.a-sealed-platform-sets-the-bot-down-after-the-last-resort-delay-with-one-toast', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(8); const n0 = X.count();
    g.crew.goHome(b); X.watch(b, 40, () => b.y > 0.5 && b.state === 'fgive'); if (b.y < 0.5) return 'never got up: ' + b.state + ' ' + b.y.toFixed(2);
    g.doDecon({ kind: 'mach', id: P.ramp.id }); X.run(0.5); X.fence(P.pad); NAV.invalidate('seal');
    const t0 = g.time;
    const rec = X.watch(b, 60, () => !callOf(b) && NAV.isGround(b));
    if (!NAV.isGround(b) || callOf(b)) return `never came down: y ${b.y.toFixed(2)} ${b.state} ${X.dump()} ${toasts.slice(-2).join(' / ')}`;
    if (g.time - t0 > 40) return 'took ' + (g.time - t0).toFixed(1) + ' s';
    const nd = toasts.filter((m) => /no way down/i.test(m)).length; if (nd > 1) return nd + ' no-way-down toasts';
    const gap = b.y - X.support(b.x, b.y, b.z); if (gap < -0.25 || gap > 0.3) return 'set down at a bad height: ' + gap.toFixed(2);
    return X.count() === n0 || `plush ${X.count()} was ${n0}`;
  });

  await X.guard('botroutes.audit.flow.sending-a-bot-home-or-standing-it-mid-charge-walk-frees-the-slot-and-brings-it-down', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const ch = X.charger(P.i0 + 2, P.k0 + 2, 1, { reserve: 8 });
    for (const order of ['sendHome', 'stand']) {
      const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.battery = 0.2; b.state = 'idle';
      X.watch(b, 40, () => b.state === 'chgwalk' && b.y > 0.3); if (!(b.y > 0.3)) return order + ': never up ' + b.state + ' ' + b.y.toFixed(2);
      g.crew[order](b); X.run(0.1);
      if (RT.slotsFree(g, ch) !== 2) return order + ': slots free ' + RT.slotsFree(g, ch);
      const c = callOf(b); if (!c || c.ph !== 'down') return order + ': call ' + X.dump();
      X.watch(b, 40, () => !callOf(b) && NAV.isGround(b)); if (callOf(b) || !NAV.isGround(b)) return order + ': not down ' + b.y.toFixed(2) + ' ' + X.dump();
      S().crew.splice(S().crew.indexOf(b), 1); X.run(0.2);
    }
    return true;
  });

  await X.guard('botroutes.audit.flow.a-charger-taken-down-under-a-charging-bot-brings-it-down', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const ch = X.charger(P.i0 + 2, P.k0 + 2, 1, { reserve: 8 });
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.battery = 0.2; b.state = 'idle'; let gone = false;
    X.watch(b, 60, () => b.state === 'recharge' && b.y > 0.3); if (b.state !== 'recharge') return 'never charging ' + b.state;
    L().remove(L().byId.get(ch.id)); S().entities = S().entities.filter((e) => e.id !== ch.id); g._fuelMach = null;
    X.watch(b, 60, () => !callOf(b) && NAV.isGround(b));
    if (!NAV.isGround(b)) return `still up: ${b.y.toFixed(2)} ${b.state} ${X.dump()} ${toasts.slice(-2).join(' / ')}`;
    return !callOf(b) || 'a call is left ' + X.dump();
  });

  await X.guard('botroutes.audit.flow.a-station-that-runs-dry-under-a-bot-with-no-other-station-does-not_leave_it_up_there', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const ch = X.charger(P.i0 + 2, P.k0 + 2, 1, { reserve: 0.1 });
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.battery = 0.05; b.state = 'idle';
    X.watch(b, 120, () => ch.reserve < 0.01 && b.state === 'lowbat');
    if (b.state !== 'lowbat') return 'the station never ran dry on it: ' + b.state + ' reserve ' + ch.reserve.toFixed(2) + ' battery ' + b.battery.toFixed(2);
    X.run(60, () => NAV.isGround(b) && !callOf(b));
    if (!NAV.isGround(b)) return `left up there: y ${b.y.toFixed(2)} ${b.state} ${X.dump()} ${toasts.slice(-2).join(' / ')}`;
    return !callOf(b) || 'a call is left ' + X.dump();
  });

  await X.guard('botroutes.audit.flow.the-player-cannot-send-a-third-bot-to-a-station-whose-two-slots-are-taken', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const ch = X.charger(P.i0 + 2, P.k0 + 2, 1, { reserve: 8 });
    const bots = [0, 1, 2].map((n) => X.mkBot(X.cellX(P.i0 - 7 - n * 0.4), X.cellZ(P.k0 + 1 + n * 0.5)));
    for (const b of bots.slice(0, 2)) g.crew.command(b, { k: 'tile', id: ch.id }, true);
    const n2 = bots.filter((b) => b.chg === ch.id).length; if (n2 !== 2) return 'two orders put ' + n2 + ' bots on the station';
    const it = g.crew.intent(bots[2], { k: 'tile', id: ch.id });
    if (it.ok) { g.crew.command(bots[2], { k: 'tile', id: ch.id }, true); const n3 = bots.filter((b) => b.chg === ch.id && (b.state === 'chgwalk' || b.state === 'recharge')).length; return 'a third order was taken: ' + n3 + ' bots on a two slot station (' + it.text + ')'; }
    return true;
  });

  await X.guard('botroutes.audit.flow.a-save-that-loads-mid-charge-walk-keeps-the-call-and-the-bot-charges-and-comes-down', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const ch = X.charger(P.i0 + 2, P.k0 + 2, 1, { reserve: 8 });
    let b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.battery = 0.2; b.state = 'idle';
    const lg = []; const r0 = X.watch(b, 40, () => b.state === 'chgwalk' && b.y > 0.12 && !!callOf(b), { each: (bb) => { if (bb.state === 'chgwalk' && lg.length < 400) lg.push(bb.y.toFixed(2) + (callOf(bb) ? 'c' : '-')); } }); if (!callOf(b)) return 'no call mid-way: ' + b.state + ' ' + X.dump() + ' states ' + r0.states.join() + ' y ' + r0.maxY.toFixed(2) + ' t ' + r0.t.toFixed(1) + ' ' + lg.filter((v, i) => i % 8 === 0).join(' ');
    b = reload(b); const c = RT.callOf(g, b); if (!c || c.k !== 'charge' || c.m !== ch.id) return 'the charge call did not survive: ' + X.dump();
    X.watch(b, 120, () => b.battery > 0.9 && !RT.callOf(g, b) && NAV.isGround(b));
    if (b.battery < 0.9) return 'did not charge: ' + b.battery.toFixed(2) + ' ' + b.state;
    return (NAV.isGround(b) && !RT.callOf(g, b)) || 'not down / call left: ' + b.y.toFixed(2) + ' ' + X.dump();
  });

  await X.guard('botroutes.audit.flow.a-dig-order-given-up-on-the-platform-brings-the-bot-down-and-then-it-digs', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(8);
    g.crew.goHome(b); X.watch(b, 40, () => b.y > 0.5 && !!callOf(b)); if (!(b.y > 0.5)) return 'not up ' + b.state;
    const ok = g.crew.order(b, 0, X.cellX(P.i0 - 6), 0, X.cellZ(P.k0 - 1 + 0)); if (!ok) return 'no face to order a dig at (the arena changed)';
    b.fuelBad = { [t.id]: g.time + 999 };   // (a starving generator would pull the only digger off its dig again: that is the fuel rule, not the call)
    X.run(0.2); const c = callOf(b); if (!c || c.ph !== 'down') return 'no way down after the dig order: ' + X.dump() + ' ' + b.state;
    const seen = new Set(); const rec = X.watch(b, 40, () => !callOf(b) && NAV.isGround(b), { each: (bb) => seen.add(bb.state) });
    if (callOf(b) || !NAV.isGround(b)) return 'not down: ' + b.y.toFixed(2) + ' ' + X.dump() + ' ' + [...seen].join();
    if (rec.minGap < -0.2 || rec.maxGap > 0.25) return `feet off the surface ${rec.minGap.toFixed(2)} .. ${rec.maxGap.toFixed(2)}`;
    X.run(20, () => b.state === 'farm' || b.state === 'advance'); X.run(0.1);
    return ['goto', 'farm', 'advance', 'return'].includes(b.state) || 'the dig order was lost: ' + b.state + ' ' + [...seen].join();
  });

  await X.guard('botroutes.audit.flow.a-long-walk-on-the-floor-to-a-machine-on-the-floor-is-not-laid-again-and-again', async () => {
    const P = await X.platform(I0(), K0()); X.clearAbove(P.i0 - 9, P.k0 - 12, 16, 24, 6); X.fence(P.pad, undefined, P.ramp);
    const t = X.gen(P.i0 - 8, P.k0 - 10, 0);
    const b = X.mkBot(X.cellX(P.i0 - 8), X.cellZ(P.k0 + 9), 0.02); b.carry = X.mix(6);
    g.botnav.resetStats(); g.crew.goHome(b); if (b.state !== 'fwalk') return 'no errand ' + b.state;
    let frames = 0; const x0 = b.x, z0 = b.z;
    X.watch(b, 40, () => b.state === 'fgive' || t.q.length >= 6, { each: () => { frames++; } });
    const st = g.botnav.stats(), walked = Math.hypot(b.x - x0, b.z - z0);
    if (walked < 8) return 'it walked only ' + walked.toFixed(1) + ' m: ' + b.state + ' ' + JSON.stringify(st);
    // a straight walk over the floor is one line: laying it again every 1.5 s for the length of the walk is churn
    return st.replans <= 2 || `${st.replans} replans and ${st.lays} lays for a straight ${walked.toFixed(0)} m walk (${(frames * 0.05).toFixed(0)} s)`;
  });

  await X.guard('botroutes.audit.flow.a-dig-order-given-to-a-bot-that-stands-on-a-platform-with-no-call-walks-it-down-and-does-not-phase-it-home', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const b = X.mkBot(X.cellX(P.i0 + 2), X.cellZ(P.k0 + 2), C + 0.02); b.state = 'idle'; X.run(0.2); NAV.invalidate('x');
    if (NAV.isGround(b)) return 'the bot is not on the pad';
    if (RT.callOf(g, b)) { S().botCalls.length = 0; g.crew.sync(); }
    const ok = g.crew.order(b, 0, X.cellX(P.i0 - 6), 0, X.cellZ(P.k0 - 1 + 0)); if (!ok) return 'no face (the arena changed)';
    const seen = new Set(); const rec = X.watch(b, 40, () => NAV.isGround(b) && !callOf(b) && b.state !== 'goto' || b.state === 'return' && NAV.isGround(b), { each: (bb) => seen.add(bb.state) });
    if (toasts.some((m) => /got stuck \|/.test(m))) return 'it was phased home: ' + toasts.filter((m) => /stuck/.test(m)).join(' / ');
    if (!NAV.isGround(b)) return 'still on the platform after ' + rec.t.toFixed(0) + ' s: ' + b.state + ' ' + b.y.toFixed(2);
    if (rec.minGap < -0.2 || rec.maxGap > 0.25) return `feet off the surface ${rec.minGap.toFixed(2)} .. ${rec.maxGap.toFixed(2)}`;
    return true;
  });

  await X.guard('botroutes.audit.flow.a-save-that-loads-after-the-machine-is-gone-still-brings-the-bot-down-and-keeps-no-dead-call', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1); const id = t.id; X.fillOthers(t);
    let b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(8); const n0 = X.count();
    g.crew.goHome(b); X.watch(b, 40, () => b.y > 0.4 && !!callOf(b)); if (!(b.y > 0.4)) return 'not up';
    L().remove(L().byId.get(id)); S().entities = S().entities.filter((e) => e.id !== id); g._fuelMach = null;
    b = reload(b);   // (the save was taken with the call 'up' and the machine is not there when it loads)
    X.run(0.3); const c = RT.callOf(g, b); if (c && c.ph === 'up') return 'an up call for a machine that is gone: ' + X.dump();
    X.watch(b, 40, () => !RT.callOf(g, b) && NAV.isGround(b));
    if (!NAV.isGround(b) || RT.callOf(g, b)) return 'not down: ' + b.y.toFixed(2) + ' ' + X.dump();
    const ids = S().botCalls.map((q) => q.id); if (new Set(ids).size !== ids.length) return 'duplicate call ids ' + ids;
    return true;
  });

  await X.guard('botroutes.audit.flow.the-layer-forgets-a-bot-that-is-gone-in-every-table-it-keeps', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    X.charger(P.i0 + 2, P.k0 + 2, 1, { reserve: 8 });
    g.doDecon({ kind: 'mach', id: P.ramp.id }); X.run(0.5); X.fence(P.pad); NAV.invalidate('x');   // a sealed platform: a low battery bot says 'no way to a charger' once (and is remembered for a minute)
    let said = 0;
    for (let n = 0; n < 10; n++) {
      const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.battery = 0.2;
      X.run(1.0); said = Math.max(said, g.botnav.stats().said);
      S().crew.splice(S().crew.indexOf(b), 1); X.run(0.3);
    }
    const st = g.botnav.stats();
    if (said < 1) return 'the probe never made the layer remember a word (' + JSON.stringify(st) + ')';
    if (st.calls !== 0) return 'calls left ' + X.dump();
    X.run(6);
    return g.botnav.stats().said === 0 || `${g.botnav.stats().said} remembered words for bots that are gone (most ${said})`;
  });
}
