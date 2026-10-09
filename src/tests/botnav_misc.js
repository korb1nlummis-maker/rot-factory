// botnav.*: the rest of the navigation rules on a one pad platform with ramps. A sealed floor says 'No way up', a ramp taken down mid trip means a new path, a collapse and a build move
// the version, a follow bot climbs after you, a cart on a platform is hauled to the bin, the path cache works, the crew costs little, and a save holds nothing of a path.
// Run: `await __selftest('botnav.')`
import { kit, rar } from './botnav_lib.js';
import * as BINS from '../bins.js';

export default async function (ctx) {
  const { g, S, w, p } = ctx;
  const X = kit(ctx), C = 0.6, NAV = X.NAV;
  const I0 = () => ctx.toI(-9), K0 = () => ctx.toK(2);
  const arena = (P, ramps) => { X.clearAbove(P.i0 - 9, P.k0 - 3, 16, 12, 4); X.fence(P.pad, undefined, ramps); };

  await X.guard('botnav.sealed.a-platform-with-no-ramp-says-no-way-up-once-and-the-old-rules-apply', async (toasts) => {
    const r = await X.K.put('pad:timber', I0(), K0(), { back: 1.8 }); if (!r.ok) return r.why; const pad = r.made[0];
    X.clearAbove(pad.i0 - 9, pad.k0 - 3, 16, 12, 4); X.fence(pad);
    const t = X.gen(pad.i0 + 2, pad.k0 + 2, 1);
    const b = X.mkBot(X.cellX(pad.i0 - 7), X.cellZ(pad.k0 + 2)); b.carry = X.mix(5);
    const from = { x: b.x, y: 0, z: b.z }, to = { x: X.cellX(pad.i0 + 2), y: C, z: X.cellZ(pad.k0 + 2) };
    if (NAV.reachable(from, to, { dy: 0.3 })) return 'reachable with no ramp';
    b.fuelJob = { id: t.id, n: 5, k: 'give' }; b.path = [[X.cellX(pad.i0 + 2) - 0.9, X.cellZ(pad.k0 + 2)]]; b.pi = 0; b.state = 'fwalk';   // (the fuel rule would not send a bot at a walled in machine: the errand is set by hand)
    const rec = X.watch(b, 9);
    const n = toasts.filter((m) => /No way up/.test(m)).length; if (n !== 1) return `${n} No way up toasts: ${toasts.join(' / ')}`;
    if (!(/No way up/.test(g.crew.statusLine(b)) && /No way up/.test(g.crew.headStatus(b))) && !(b.state === 'return' && !b.fuelJob)) return 'status: ' + g.crew.statusLine(b);   // (the call routes, botroutes.js, release a call that has no way: the bot goes home at once instead of waiting for the stuck timer)
    // the old behavior then: stuck 25 s and phased home
    X.run(30, () => b.state === 'return' && Math.hypot(b.x - g.crew.home().x, b.z - g.crew.home().z) < 3);
    return (Math.hypot(b.x - g.crew.home().x, b.z - g.crew.home().z) < 3 || b.state === 'return' || b.state === 'unload' || b.state === 'idle') || `still at ${b.x.toFixed(1)}, ${b.z.toFixed(1)} ${b.state}`;
  });

  await X.guard('botnav.version.a-ramp-taken-down-mid-climb-means-a-new-path-over-the-other-ramp', async (toasts) => {
    const P = await X.platform2(I0(), K0()); arena(P, [P.ramp, P.ramp2]);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(6); const n0 = X.count();
    NAV.invalidate('test'); const v0 = NAV.version();
    g.crew.goHome(b); let removed = false, vAfter = 0;
    const rec = X.watch(b, 90, () => b.state === 'idle' && b.carry.length === 0 && NAV.isGround(b), { each: (bb) => {
      if (!removed && bb.y > 0.22 && bb.x > X.cellX(P.ramp.i0) - 0.3) { removed = true; g.doDecon({ kind: 'mach', id: P.ramp.id }); vAfter = NAV.version(); }
    } });
    if (!removed) return 'the bot never got on the ramp (' + rec.states.join() + ' ' + JSON.stringify(rec.atMax) + ')';
    if (!(vAfter > v0)) return `the version did not move: ${v0} -> ${vAfter}`;
    if (t.q.length !== 6) return `hopper ${t.q.length} of 6 (${rec.states.join()}, ${toasts.join(' / ')})`;
    if (X.count() !== n0) return `plush ${X.count()} was ${n0}`;
    return NAV.isGround(b) || 'not on the floor at the end: ' + b.y.toFixed(2);
  });

  await X.guard('botnav.version.a-build-or-a-collapse-moves-the-version-and-the-cache-starts-over', async () => {
    const P = await X.platform(I0(), K0()); X.run(0.3);
    const from = { x: X.cellX(P.i0 - 6), y: 0, z: X.cellZ(P.k0 + 2) }, to = { x: X.cellX(P.i0 + 2), y: C, z: X.cellZ(P.k0 + 2) };
    NAV.resetStats(); const a = NAV.pathTo(from, to, { sync: true, dy: 0.2 }); if (!a.ok) return 'no path';
    const b = NAV.pathTo(from, to, { sync: true, dy: 0.2 }); if (b !== a) return 'the second ask did not come from the cache';
    const st = NAV.stats(); if (st.hits !== 1 || st.misses !== 1) return 'cache counters ' + JSON.stringify(st);
    const v0 = NAV.version();
    for (let di = 0; di < 4; di++) for (let dk = 0; dk < 4; dk++) w().setCell(P.pad.i0 + di, 0, P.pad.k0 + dk, 0, 0);   // what a collapse does: the plate's cells go
    const v1 = NAV.version(); if (!(v1 > v0)) return 'a collapse did not move the version';
    const c = NAV.pathTo(from, to, { sync: true, dy: 0.2 }); if (c.ok) return 'a path over a plate that is gone';
    const v2 = NAV.version(); for (let di = 0; di < 4; di++) for (let dk = 0; dk < 4; dk++) w().setCell(P.pad.i0 + di, 0, P.pad.k0 + dk, ctx.__pad || X.PAD, 0);
    return NAV.version() > v2 || 'putting the plate back did not move it';
  });

  await X.guard('botnav.follow.a-follow-bot-climbs-the-ramp-the-player-used', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); g.crew.follow(b);
    p().pos.set(X.cellX(P.i0 + 2), C, X.cellZ(P.k0 + 2)); p().vel.set(0, 0, 0);
    let top = 0; const rec = X.watch(b, 40, () => b.y > 0.58 && Math.hypot(b.x - p().pos.x, b.z - p().pos.z) < 3.4, { each: (bb) => { top = Math.max(top, bb.y); p().pos.set(X.cellX(P.i0 + 2), C, X.cellZ(P.k0 + 2)); p().vel.set(0, 0, 0); } });
    if (top < 0.55) return 'the follow bot never got up: ' + top.toFixed(2) + ' ' + rec.states.join();
    if (Math.hypot(b.x - p().pos.x, b.z - p().pos.z) > 3.6) return 'not near the player: ' + Math.hypot(b.x - p().pos.x, b.z - p().pos.z).toFixed(1);
    if (rec.maxGap > 0.2 || rec.minGap < -0.2) return `feet off the surface ${rec.minGap.toFixed(2)} .. ${rec.maxGap.toFixed(2)}`;
    // the player comes back down: the bot follows
    p().pos.set(X.cellX(P.i0 - 6), 0, X.cellZ(P.k0 + 2)); p().vel.set(0, 0, 0);
    X.watch(b, 40, () => b.y < 0.1 && Math.hypot(b.x - p().pos.x, b.z - p().pos.z) < 3.4, { each: () => { p().pos.set(X.cellX(P.i0 - 6), 0, X.cellZ(P.k0 + 2)); p().vel.set(0, 0, 0); } });
    return (b.y < 0.1 && Math.hypot(b.x - p().pos.x, b.z - p().pos.z) < 3.6) || `the bot stayed up: y ${b.y.toFixed(2)}, ${Math.hypot(b.x - p().pos.x, b.z - p().pos.z).toFixed(1)} m from the player`;
  });

  await X.guard('botnav.haul.a-bot-fetches-a-cart-load-from-a-platform-and-sells-it-at-the-bin', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    S().cart = { tier: 1, x: X.cellX(P.i0 + 2), y: C, z: X.cellZ(P.k0 + 2), yaw: 0, mode: 'stay', load: X.mix(5, 1) }; g.cart.sync();
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.state = 'haulgo'; b.haulKey = 'cart'; b.origin = null; b.trail = [];
    const m0 = S().money; let top = 0;
    const rec = X.watch(b, 120, () => S().money > m0 && b.state === 'idle', { each: (bb) => { top = Math.max(top, bb.y); S().cart.x = X.cellX(P.i0 + 2); S().cart.z = X.cellZ(P.k0 + 2); S().cart.y = C; } });
    if (top < 0.3) return 'never took the ramp: ' + top.toFixed(2) + ' ' + rec.states.join();
    if (S().cart.load.length) return 'the cart still holds ' + S().cart.load.length;
    return S().money > m0 || 'nothing sold: ' + rec.states.join();
  });

  await X.guard('botnav.bin.a-bot-takes-its-load-to-a-depot-beacon-set-on-a-platform', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const x = X.cellX(P.i0 + 2), z = X.cellZ(P.k0 + 1) - BINS.UNLOAD_OFFSET + 1.2;   // (the bot stands 1.6 m south of the beacon: that is on the pad)
    const e = { id: g.nextId(), type: 'beacon', x, y: C, z, i: ctx.toI(x), j: 1, k: ctx.toK(z) }; S().entities.push(e); g.addEntity(e); const bk = g.machines.items.get(e.id).ent; bk.pw = 1;
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(4, 1); b.dest = bk.id; const m0 = S().money; let top = 0;
    g.crew.sendHome(b); if (b.state !== 'return') return 'state ' + b.state;
    const home = g.crew.home(b); if (Math.abs(home.y - C) > 0.01) return 'the bin is at ' + home.y;
    const rec = X.watch(b, 90, () => S().money > m0 && b.state === 'idle', { each: (bb) => { top = Math.max(top, bb.y); } });
    if (top < 0.5) return 'never got up: ' + top.toFixed(2) + ' ' + rec.states.join();
    return S().money > m0 || 'nothing sold: ' + rec.states.join() + ' ' + b.carry.length;
  });

  await X.guard('botnav.save.a-bot-saved-mid-climb-holds-no-path-and-finishes-after-the-reload', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(5);
    g.crew.goHome(b);
    X.watch(b, 40, () => b.y > 0.3);
    if (b.y <= 0.3) return 'never reached the ramp';
    const saved = JSON.stringify(S().crew); if (/nv|steps|rec"/.test(Object.keys(b).join(' '))) return 'nav keys on the bot: ' + Object.keys(b).join();
    if (saved.length > 4000) return 'the bot is ' + saved.length + ' bytes in a save';
    // a new session: nothing but the save
    const back = JSON.parse(saved); S().crew.length = 0; for (const o of back) S().crew.push(o); g.crew.clear(); g.crew.sync();
    const b2 = S().crew[0]; NAV.resetBot(b2); NAV.invalidate('reload');
    X.watch(b2, 60, () => b2.state === 'idle' && b2.carry.length === 0 && NAV.isGround(b2));
    return t.q.length === 5 || `hopper ${t.q.length} of 5, bot ${b2.state} at ${b2.y.toFixed(2)}`;
  });
}
