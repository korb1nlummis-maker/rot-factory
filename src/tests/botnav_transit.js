// botnav.lift.* and botnav.door.*: a bot calls the elevator at its panel, waits, rides and steps off (never with no power or through a cut shaft), and opens a powered door (a key lock or a dead door stops it, and it says so).
// Run: `await __selftest('botnav.lift')` / `await __selftest('botnav.door')`
import { kit as transitKit } from './transit_lib.js';
import * as TR from '../transit.js';
import { kit } from './botnav_lib.js';

export default async function (ctx) {
  const { g, S, w, adv, toI, toK } = ctx;
  const X = transitKit(ctx), H = kit(ctx, { shell: false }), C = 0.6, NAV = H.NAV;
  H.force.on = false;
  const G = (name, fn) => H.guard(name, async (toasts) => { H.force.on = false; X.setup(); try { return await fn(toasts); } finally { X.clean(); H.force.on = true; } }, { setup: false });
  const LI = () => toI(-6), LK = () => toK(3);
  // the elevator of the audit tests, small: home at 4.8 m, a shaft down to the floor, a tunnel west at the floor and a ledge east at the home row (an upper floor with a cliff edge)
  const shaft = (o = {}) => {
    const L0 = X.lift(LI(), LK(), { home: 8, depth: 8, top: 12 }); X.tunnel(L0, 0, 2, 8); X.ledge(L0, 8, 0);
    if (o.power !== false) X.powerCab(L0, 2);
    TR.refreshShaft(g, L0); L0.ex = L0.tr; adv(0.7);
    return L0;
  };
  const west = (L0) => H.mkBot(H.cellX(L0.i0 - 9), H.cellZ(L0.k0 + 1), 0.02);
  const upper = (L0) => ({ i: L0.i0 + 5, k: L0.k0 + 1 });

  await G('botnav.lift.a-bot-calls-the-elevator-rides-it-up-and-fuels-a-generator-on-the-upper-floor', async (toasts) => {
    const L0 = shaft(); if (!((L0.pw ?? 0) > 0.05)) return 'the cab has no power: ' + L0.pw;
    const u = upper(L0), t = H.gen(u.i, u.k, 8); H.fillOthers(t); const b = west(L0); b.carry = H.mix(7); const n0 = H.count() - 0;
    const pa = NAV.pathTo({ x: b.x, y: 0, z: b.z }, { x: H.cellX(u.i), y: 8 * C, z: H.cellZ(u.k) }, { sync: true });
    if (!pa.ok) return 'no path: ' + pa.why + ' floors ' + TR.floorsOf(g, L0) + ' sg ' + JSON.stringify(L0.sg);
    const ks = NAV.stepList(pa).map((s) => s.kind); if (!ks.includes('cabIn') || !ks.includes('ride') || !ks.includes('cabOut')) return 'the path does not use the cab: ' + ks.join();
    g.crew.goHome(b); if (b.state !== 'fwalk') return 'no errand: ' + b.state;
    let top = 0; const rec = H.watch(b, 120, () => b.state === 'idle' && b.carry.length === 0 && NAV.isGround(b), { each: (bb) => { top = Math.max(top, bb.y); } });
    if (t.q.length !== 7) return `hopper ${t.q.length} of 7 (${rec.states.join()}, top ${top.toFixed(2)}, codes ${[...rec.codes]}, ${toasts.join(' / ')})`;
    if (top < 4.7) return 'top ' + top.toFixed(2);
    for (const c of [NAV.CODE.lift, NAV.CODE.ride]) if (!rec.codes.has(c)) return 'the status never showed ' + c + ': ' + [...rec.codes];
    if (rec.falls) return 'fell ' + rec.falls; if (rec.maxJump > 0.5) return 'jumped ' + rec.maxJump.toFixed(2) + ' at ' + JSON.stringify(rec.atJump);
    if (H.count() !== n0) return `plush ${H.count()} was ${n0}`;
    return NAV.isGround(b) || 'ended at ' + b.y.toFixed(2);
  });

  await G('botnav.lift.a-lift-with-no-power-is-a-blocked-edge-and-the-bot-says-so', async (toasts) => {
    const L0 = shaft({ power: false }); adv(0.3);
    if ((L0.pw ?? 0) > 0.05) return 'the cab has power';
    const u = upper(L0), t = H.gen(u.i, u.k, 8); H.fillOthers(t); const b = west(L0); b.carry = H.mix(4);
    const from = { x: b.x, y: 0, z: b.z }, to = { x: H.cellX(u.i), y: 8 * C, z: H.cellZ(u.k) };
    if (NAV.reachable(from, to)) return 'reachable says yes through a dead lift';
    const pa = NAV.pathTo(from, to, { sync: true }); if (pa.ok || !/no power/i.test(pa.why)) return 'why: ' + pa.why;
    g.crew.goHome(b); const rec = H.watch(b, 5);
    if (rec.codes.has(NAV.CODE.lift) || rec.codes.has(NAV.CODE.ride) || Math.abs(L0.cy - 8 * C) > 0.05) return 'the bot called the dead lift: ' + [...rec.codes] + ' cab ' + L0.cy;
    if (!toasts.some((m) => /no power/i.test(m))) return 'no toast about the power: ' + toasts.join(' / ');
    if (!/No way up|no power/i.test(g.crew.statusLine(b)) && !(b.state === 'return' && !b.fuelJob)) return 'status: ' + g.crew.statusLine(b);   // (the call routes release a call that has no way: the bot goes home at once)
    return b.y < 3.0 || 'the bot is at ' + b.y.toFixed(2);   // (it never got to the upper floor, 4.8 m: with no way up the call is released and the bot goes home, over whatever the old physics lets it climb)   // (what the old rules do after the stuck timer, a phase up to the machine, is the fuel code's business and happens later)
  });

  await G('botnav.lift.power-coming-on-opens-the-edge-and-going-off-closes-it', async () => {
    const L0 = shaft({ power: false }); adv(0.3); const u = upper(L0);
    const from = { x: H.cellX(L0.i0 - 9), y: 0, z: H.cellZ(L0.k0 + 1) }, to = { x: H.cellX(u.i), y: 8 * C, z: H.cellZ(u.k) };
    if (NAV.reachable(from, to)) return 'reachable with no power';
    X.powerCab(L0, 2); adv(0.9); H.run(0.6);
    if (!NAV.reachable(from, to)) return 'not reachable with power (pw ' + L0.pw + ', v ' + NAV.version() + ')';
    for (const c of g.cables.of(L0.id)) g.cables.remove(c.id, false); g.power.markDirty(); adv(0.9); H.run(0.6);
    return !NAV.reachable(from, to) || 'still reachable after the cable went (pw ' + L0.pw + ')';
  });

  await G('botnav.lift.a-cut-shaft-is-not-ridden', async (toasts) => {
    const L0 = shaft(); const u = upper(L0);
    const from = { x: H.cellX(L0.i0 - 9), y: 0, z: H.cellZ(L0.k0 + 1) }, to = { x: H.cellX(u.i), y: 8 * C, z: H.cellZ(u.k) };
    if (!NAV.reachable(from, to)) return 'not reachable to begin with';
    X.poke(L0.i0 + 1, 4, L0.k0 + 1, 2, 0); adv(1.0); H.run(0.6);               // a plush in the shaft halfway down: the cab stays at the last clear landing
    return !NAV.reachable(from, to) || 'reachable through a cut shaft: stops ' + TR.floorsOf(g, L0);
  });

  // ---- doors ----
  // a room 4 wide behind a 4 wide door in a wall of plush, a Charging Station inside, a pole and generators outside for the door's power
  const room = (o = {}) => {
    const i0 = toI(-6), k0 = toK(4);
    for (let i = i0 - 3; i < i0 + 8; i++) for (let k = k0; k < k0 + 9; k++) for (let j = 0; j < 6; j++) if (!w().get(i, j, k)) X.poke(i, j, k, 2, 0);
    for (let i = i0; i < i0 + 4; i++) for (let k = k0; k < k0 + 8; k++) for (let j = 0; j < 4; j++) if (w().get(i, j, k)) X.poke(i, j, k, 0, 0);
    const D = X.door(i0, k0, { lock: o.lock || 'none', auto: o.auto === undefined ? true : o.auto });
    if (o.power !== false) { X.powerAt(H.cellX(i0 + 1), H.cellZ(k0 - 4), 2); }
    adv(0.7);
    const ch = H.charger(i0 + 1, k0 + 4, 0, { reserve: 4 }); H.fillOthers(ch);
    const bot = H.mkBot(H.cellX(i0 + 1), H.cellZ(k0 - 6), 0.02); bot.battery = 0.5;
    return { i0, k0, D, ch, bot, inside: H.cellZ(k0 + 1) };
  };
  const toCharger = (R) => g.crew.command(R.bot, { k: 'tile', id: R.ch.id }, true);

  await G('botnav.door.a-powered-door-opens-for-a-bot-on-its-way-to-a-charging-station', async (toasts) => {
    const R = room(); if (!((R.D.pw ?? 0) > 0.05)) return 'the door has no power: ' + R.D.pw;
    const b = R.bot; const pa = NAV.pathTo({ x: b.x, y: 0, z: b.z }, { x: H.cellX(R.i0 + 1), y: 0, z: H.cellZ(R.k0 + 4) }, { sync: true }); if (!pa.ok) return 'no path: ' + pa.why;
    if (!NAV.stepList(pa).some((s) => s.door === R.D.id)) return 'the path does not go through the door: ' + JSON.stringify(NAV.stepList(pa).map((s) => s.kind + (s.door ? '#' : '')).join());
    const r = toCharger(R); if (!r.ok) return 'command: ' + r.msg;
    let inside = false, maxP = 0; const rec = H.watch(b, 60, () => b.battery > 0.9, { each: (bb) => { if (bb.z > R.inside) inside = true; maxP = Math.max(maxP, R.D.p); } });
    if (!inside) return `the bot never got in (${rec.states.join()}, door ${R.D.p}, max ${maxP.toFixed(2)}, ${toasts.join(' / ')})`;
    if (maxP < 0.99) return 'the door never opened: ' + maxP;
    return b.battery > 0.9 || 'battery ' + b.battery.toFixed(2);
  });

  await G('botnav.door.a-key-lock-blocks-the-bot-and-it-reports-it', async (toasts) => {
    const R = room({ lock: 'key' }); const b = R.bot;
    if (NAV.reachable({ x: b.x, y: 0, z: b.z }, { x: H.cellX(R.i0 + 1), y: 0, z: H.cellZ(R.k0 + 4) })) return 'reachable through a key lock';
    toCharger(R); const rec = H.watch(b, 10, null, { dbg: 8 });
    if (R.ch.reserve < 3.99) return 'the bot charged anyway: ' + JSON.stringify({ states: rec.states, dbg: rec.dbg, toasts: toasts.slice(-2), at: [b.x, b.y, b.z], z: R.inside });
    if (!toasts.some((m) => /key lock/i.test(m))) return 'no toast about the lock: ' + toasts.join(' / ');
    return R.D.p < 0.1 || 'the key locked door moved: ' + R.D.p;
  });

  await G('botnav.door.a-door-with-no-power-is-shut-to-a-bot', async (toasts) => {
    const R = room({ power: false }); const b = R.bot; adv(0.3);
    if (NAV.reachable({ x: b.x, y: 0, z: b.z }, { x: H.cellX(R.i0 + 1), y: 0, z: H.cellZ(R.k0 + 4) })) return 'reachable through a dead door';
    toCharger(R); H.watch(b, 8);
    return (R.ch.reserve > 3.99 && R.D.p < 0.1) || `charger ${R.ch.reserve} door ${R.D.p}`;
  });
}
