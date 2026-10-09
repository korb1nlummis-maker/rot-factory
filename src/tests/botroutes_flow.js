// botroutes.flow.*: the call. A generator on a platform needs fuel, a bot is called, walks the route up the ramp, fuels it, and the route guides it back DOWN to the ground before the
// call goes; the route is laid again from the bot when the world changes; a full or vanished machine, an order of the player's and a save that loads mid-trip all end on the ground.
// Run: `await __selftest('botroutes.flow')`
import { kit, RT } from './botroutes_lib.js';

export default async function (ctx) {
  const { g, S, w, L } = ctx;
  const X = kit(ctx), C = 0.6, NAV = X.NAV;
  const I0 = () => ctx.toI(-9), K0 = () => ctx.toK(2);
  const callOf = X.callOf;
  const arena = (P, ramps) => { X.clearAbove(P.i0 - 9, P.k0 - 3, 16, 12, 6); X.fence(P.pad, undefined, ramps); };
  const home = () => g.crew.home();
  const atHome = (b) => Math.hypot(b.x - home().x, b.z - home().z) < 3;
  const first = (s) => s.split(',')[0];

  await X.guard('botroutes.flow.a-call-is-laid-followed-up-the-ramp-and-removed-on-the-ground', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2), 0.02); b.carry = X.mix(8); const n0 = X.count();
    g.crew.goHome(b); if (b.state !== 'fwalk') return 'no errand: ' + b.state;
    const seen = { ph: new Set(), up: 0, back: 0, status: new Set(), passed: 0, recs: 0, kinds: new Set() }, fol = X.follower();
    const rec = X.watch(b, 80, () => !callOf(b) && b.state === 'idle' && b.carry.length === 0, { each: (bb) => {
      fol.each(bb);
      const c = callOf(bb); if (c) { seen.recs++; seen.ph.add(c.ph); seen.kinds.add(c.k + ':' + c.m); const r = RT.routeOf(c); seen.up = Math.max(seen.up, r.up.length); seen.back = Math.max(seen.back, r.back.length); seen.passed = Math.max(seen.passed, r.passed); }
      seen.status.add(first(g.crew.statusLine(bb)));
    } });
    if (t.q.length !== 8) return `hopper ${t.q.length} of 8 (${rec.states.join()}, ${toasts.join(' / ')})`;
    if (!seen.ph.has('up') || !seen.ph.has('down')) return 'phases ' + [...seen.ph];
    if (![...seen.kinds].every((k) => k === 'fuel:' + t.id)) return 'the call was for ' + [...seen.kinds];
    if (seen.up < 4 || seen.back < 4) return `routes up ${seen.up} back ${seen.back}`;
    if (seen.passed < 3) return 'the bot stood in only ' + seen.passed + ' route cells';
    if (callOf(b)) return 'the call is still there';
    if (!NAV.isGround(b)) return 'not on the ground: ' + b.y.toFixed(2);
    if (X.count() !== n0) return `plush ${X.count()} was ${n0}`;
    if (![...seen.status].some((s) => /^called to generator a/i.test(s) || /called to generator a/i.test(s))) return 'statuses ' + [...seen.status];
    if (![...seen.status].some((s) => /^Heading back down/.test(s))) return 'statuses ' + [...seen.status];
    if (fol.frames < 20) return 'followed ' + fol.frames + ' frames';
    if (fol.off > fol.frames * 0.1) return `the bot was off its route in ${fol.off} of ${fol.frames} frames (worst ${fol.worst} cells)`;
    if (rec.maxGap > 0.25 || rec.minGap < -0.2) return `feet off the surface ${rec.minGap.toFixed(2)} .. ${rec.maxGap.toFixed(2)}`;
    return S().botCalls.length === 0 || 'records left: ' + X.dump();
  });

  await X.guard('botroutes.flow.the-route-remembers-the-way-back-to-the-ground-spot-and-the-farm-spot', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2), 0.02); b.carry = X.mix(8); g.crew.goHome(b);
    const x0 = b.x, z0 = b.z;
    X.watch(b, 40, () => b.state === 'fgive' && b.y > 0.5);
    const c = callOf(b); if (!c) return 'no call at the generator (' + b.state + ' y ' + b.y.toFixed(2) + ')';
    const r = RT.routeOf(c);
    if (r.up.length < 4) return 'the way up was not kept: ' + r.up.length;
    if (r.back.length < 4) return 'the way back was not laid while it fuels: ' + r.back.length;
    const last = RT.decode(r.back[r.back.length - 1]), end = RT.decode(r.back[r.back.length - 2]);
    if (Math.abs(c.g[0] - x0) > 6 || Math.abs(c.g[2] - z0) > 3) return `the ground anchor ${c.g.map((v) => v.toFixed(1))} is not where it came up from (${x0.toFixed(1)}, ${z0.toFixed(1)})`;
    if (c.g[1] > 0.3) return 'the ground anchor is up at ' + c.g[1];
    if (Math.abs(last.i - ctx.toI(c.f[0])) > 1 || Math.abs(last.k - ctx.toK(c.f[1])) > 1) return 'the way back does not end at the farm spot';
    const hi = r.back.map((id) => RT.decode(id).j).reduce((a, j) => Math.max(a, j), 0); if (hi < 1) return 'the way back never leaves the floor';
    const first = RT.decode(r.back[0]); if (Math.abs(first.i - t.i) > 2 || Math.abs(first.k - t.k) > 2) return 'the way back does not start at the machine';
    return true;
  });

  await X.guard('botroutes.flow.a-ramp-taken-down-mid-trip-lays-the-route-again-from-the-bot-over-the-other-ramp', async (toasts) => {
    const P = await X.platform2(I0(), K0()); arena(P, [P.ramp, P.ramp2]);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(6); const n0 = X.count();
    NAV.invalidate('test'); g.crew.goHome(b);
    let removed = 0, before = null, after = null, passedBefore = 0, stRe0 = 0, minPassed = 1e9;
    const rec = X.watch(b, 100, () => !callOf(b) && b.state === 'idle' && b.carry.length === 0 && NAV.isGround(b), { each: (bb) => {
      const c = callOf(bb);
      if (!removed && c && bb.y > 0.22 && bb.x > X.cellX(P.ramp.i0) - 0.3) { removed = g.time; before = RT.routeOf(c); passedBefore = before.passed; stRe0 = g.botnav.stats().replans; g.doDecon({ kind: 'mach', id: P.ramp.id }); }
      if (removed && !after && c && g.time - removed > 2.0) { after = RT.routeOf(c); }
      if (removed && c) { const p = RT.routeOf(c).passed; minPassed = Math.min(minPassed, p); }
    } });
    if (!removed) return 'the bot never got onto the ramp (' + rec.states.join() + ')';
    if (t.q.length !== 6) return `hopper ${t.q.length} of 6 (${rec.states.join()}, ${toasts.join(' / ')})`;
    if (!after) return 'no route two seconds after the ramp went';
    const e = RT.decode(after.up[0]); if (Math.abs(e.i - ctx.toI(b.x)) > 40) return 'the new route starts nowhere near the bot';
    if (g.botnav.stats().replans <= stRe0) return 'the route was never laid again: ' + JSON.stringify(g.botnav.stats());
    if (minPassed < passedBefore) return `the progress went back: ${passedBefore} -> ${minPassed}`;
    if (X.count() !== n0) return `plush ${X.count()} was ${n0}`;
    if (!rec.codes.has(NAV.CODE.ramp)) return 'never on a ramp';
    return NAV.isGround(b) || 'not on the ground: ' + b.y.toFixed(2);
  });

  await X.guard('botroutes.flow.a-machine-filled-by-someone-else-mid-call-keeps-the-route-only-to-get-back-down', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1); X.fillOthers(t);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(8);
    g.crew.goHome(b); let full = false, down = 0, downUp = 0;
    const rec = X.watch(b, 80, () => full && !callOf(b) && NAV.isGround(b) && g.time > 0, { each: (bb) => {
      if (!full && bb.y > 0.35 && bb.state === 'fwalk') { full = true; while (t.q.length < 50) t.q.push({ sp: X.sp(0), vr: 0 }); }
      const c = callOf(bb); if (c && c.ph === 'down') { down++; if (bb.y > downUp) downUp = bb.y; }
    } });
    if (!full) return 'the bot never got up the ramp: ' + rec.states.join();
    if (down < 10) return 'the call never turned to the way down (' + down + ' frames)';
    if (callOf(b)) return 'the call stayed';
    if (t.q.length !== 50) return 'the hopper changed: ' + t.q.length;
    if (b.fuelJob) return 'the job stayed ' + JSON.stringify(b.fuelJob);
    if (rec.minGap < -0.2 || rec.maxGap > 0.25) return `feet off the surface ${rec.minGap.toFixed(2)} .. ${rec.maxGap.toFixed(2)}`;
    return NAV.isGround(b) || 'not on the ground ' + b.y.toFixed(2);
  });

  await X.guard('botroutes.flow.a-machine-removed-mid-call-leaves-a-route-down-and-then-the-bot-is-released', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1); X.fillOthers(t); const id = t.id;
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(8); const n0 = X.count();
    g.crew.goHome(b); let gone = false, down = 0;
    const rec = X.watch(b, 80, () => gone && !callOf(b) && NAV.isGround(b), { each: (bb) => {
      if (!gone && bb.y > 0.35 && bb.state === 'fwalk') { gone = true; L().remove(L().byId.get(id)); S().entities = S().entities.filter((e) => e.id !== id); g._fuelMach = null; }
      const c = callOf(bb); if (c && c.ph === 'down') down++;
    } });
    if (!gone) return 'never got up: ' + rec.states.join();
    if (down < 10) return 'no way down was kept (' + down + ' frames)';
    if (!NAV.isGround(b)) return 'not on the ground ' + b.y.toFixed(2);
    if (callOf(b)) return 'a call is left';
    return S().botCalls.length === 0 || 'records left ' + X.dump();
  });

  await X.guard('botroutes.flow.an-order-above-the-ground-drops-the-call-and-keeps-the-way-down', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(8); const n0 = X.count();
    g.crew.goHome(b);
    X.watch(b, 60, () => !!(b.y > 0.5 && callOf(b)));
    if (!(b.y > 0.5)) return 'not up: ' + b.y.toFixed(2) + ' ' + b.state;
    g.crew.follow(b);   // the player's order
    if (b.fuelJob) return 'the job stayed';
    X.run(0.2); const c = callOf(b);
    if (!c || c.ph !== 'down') return 'the call after the order: ' + X.dump();
    if (!/Heading back down/.test(g.crew.statusLine(b))) return 'status: ' + g.crew.statusLine(b);
    const y0 = b.y; let minGap = 9;
    const rec = X.watch(b, 30, () => !callOf(b) && NAV.isGround(b));
    if (rec.minGap < -0.2 || rec.maxGap > 0.25) return `feet off the surface ${rec.minGap.toFixed(2)} .. ${rec.maxGap.toFixed(2)}`;
    if (callOf(b) || !NAV.isGround(b)) return 'not down: ' + b.y.toFixed(2) + ' ' + X.dump();
    if (b.state !== 'follow') return 'the order did not stand: ' + b.state;
    return X.count() === n0 || 'plush ' + X.count();
  });

  await X.guard('botroutes.flow.no-way-up-says-so-once-releases-the-call-and-tries-again-after-a-minute', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1); X.fillOthers(t);
    g.doDecon({ kind: 'mach', id: P.ramp.id }); X.run(0.5); X.fence(P.pad); NAV.invalidate('test');   // (and the gap the ramp left is walled: a one pad platform is a curb a bot may step up)
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(5); const o = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 1)); o.carry = X.mix(0);
    b.fuelJob = { id: t.id, n: 5, k: 'give' }; b.path = [[X.cellX(P.i0 - 1), X.cellZ(P.k0 + 2)]]; b.pi = 0; b.state = 'fwalk';   // (the fuel rule would not offer a sealed machine: the errand is set by hand)
    X.run(40, () => b.fuelJob === null);
    const nu = toasts.filter((m) => /No way up/.test(m)).length; if (nu !== 1) return `${nu} No way up toasts: ${toasts.join(' / ')}`;
    if (b.fuelJob) return 'the call was not released: ' + JSON.stringify(b.fuelJob) + ' ' + b.state;
    if (!(b.fuelBad && b.fuelBad[t.id] > g.time + 50)) return 'the machine is not held back from this bot: ' + JSON.stringify(b.fuelBad);
    if (o.fuelBad && o.fuelBad[t.id]) return 'another bot was held back too';
    if (callOf(b)) return 'a call is left: ' + X.dump();
    if (t.q.length) return 'it fueled a sealed machine';
    // the way is built again: the bot tries again once the minute is up
    X.clearAbove(P.pad.i0 - 3, P.pad.k0 - 1, 3, 6, 4); const r = await X.K.put('wramp', P.pad.i0 - 2, P.pad.k0 + 1, { dir: 0, back: 2.6 }); if (!r.ok) return 'ramp: ' + r.why;
    while (t.q.length) t.q.pop(); b.carry = X.mix(5); b.state = 'idle'; X.run(2);
    const until = b.fuelBad[t.id]; X.run(until - 1 - g.time); if (b.fuelJob) return 'it came back before the minute was up';
    X.run(1.2);   // (the minute is up)
    b.x = X.cellX(P.i0 - 7); b.z = X.cellZ(P.k0 + 2); b.y = 0.02; b.vy = 0; b.state = 'idle'; b.fuelT = 0; NAV.resetBot(b);   // (the pile between the bin and the platform is the old walk's business: back at the foot of the ramp, asked at once)
    const rec2 = X.watch(b, 60, () => t.q.length === 5);
    return t.q.length === 5 || `the retry gave ${t.q.length} plush (states ${rec2.states.join()} ${b.state}, ${JSON.stringify(b.fuelJob)}, bad ${JSON.stringify(b.fuelBad)} at ${g.time.toFixed(0)}, carry ${b.carry.length}, reach ${NAV.reachable({ x: b.x, y: 0, z: b.z }, { x: X.cellX(t.i), y: C, z: X.cellZ(t.k) }, { r: 1.6, dy: 0.35 })}, ${toasts.slice(-2).join(' / ')})`;
  });

  await X.guard('botroutes.flow.two-bots-two-calls-one-machine-and-the-promises-add-up', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1); for (let n = 0; n < 30; n++) t.q.push({ sp: X.sp(0), vr: 0 }); X.fillOthers(t); while (t.q.length > 30) t.q.pop();
    const a = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)), c2 = X.mkBot(X.cellX(P.i0 - 7.5), X.cellZ(P.k0 + 1)); a.carry = X.mix(15); c2.carry = X.mix(15);
    g.crew.goHome(a); g.crew.goHome(c2); X.run(0.3);
    const calls = RT.callsOf(g, t.id); if (calls.length !== 2) return calls.length + ' calls: ' + X.dump();
    if (calls[0].b === calls[1].b) return 'two calls for one bot';
    const res = S().crew.reduce((n, q) => n + (q.fuelJob && q.fuelJob.id === t.id ? q.fuelJob.n : 0), 0); if (t.q.length + res > 50) return `over-promised ${t.q.length}+${res}`;
    let over = 0, near = 0;
    X.run(120, () => { if (t.q.length > 50) over++; if (Math.hypot(a.x - c2.x, a.z - c2.z, a.y - c2.y) < 0.15) near++; return !callOf(a) && !callOf(c2) && NAV.isGround(a) && NAV.isGround(c2) && a.state === 'idle' && c2.state === 'idle'; });
    if (over) return 'the hopper went over 50';
    if (t.q.length > 50) return 'hopper ' + t.q.length;
    if (callOf(a) || callOf(c2)) return 'calls left ' + X.dump();
    return NAV.isGround(a) && NAV.isGround(c2) || 'not both down';
  });

  await X.guard('botroutes.flow.a-save-that-loads-mid-call-and-mid-return-goes-on-and-a-bot-up-there-with-no-call-still-comes-down', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(10); const n0 = X.count();
    const reload = () => {   // what a save and a load keep: the state as JSON (the crew and the calls in it), nothing of the runtime
      const j = JSON.parse(JSON.stringify({ crew: S().crew, calls: S().botCalls })); S().crew.length = 0; for (const q of j.crew) S().crew.push(q); S().botCalls = j.calls;
      for (const q of S().crew) NAV.resetBot(q); g.crew.sync(); NAV.invalidate('load'); return S().crew.find((q) => q.id === b.id);
    };
    g.crew.goHome(b);
    X.watch(b, 40, () => b.y > 0.5 && callOf(b) && callOf(b).ph === 'up'); if (!callOf(b)) return 'no call mid-way up';
    const rec0 = JSON.stringify(callOf(b));
    const b2 = reload(); if (b2 !== b && !b2) return 'lost the bot';
    const c2 = RT.callOf(g, b2); if (!c2 || c2.m !== t.id || c2.b !== b2.id) return 'the call did not survive the load: ' + X.dump() + ' was ' + rec0;
    X.run(0.2); const r1 = RT.routeOf(RT.callOf(g, b2)); // (laid again within a second or two)
    X.watch(b2, 60, () => b2.state === 'fgive' || t.q.length >= 3); X.run(0.1);
    const r2 = RT.routeOf(RT.callOf(g, b2) || { id: -1 }); if (!RT.callOf(g, b2)) return 'the call vanished after the load';
    if (r2.up.length < 2 || r2.back.length < 2) return 'the routes were not laid again after the load: ' + JSON.stringify([r1.up.length, r2.up.length, r2.back.length]);
    // mid-return: down phase
    X.watch(b2, 60, () => { const c = callOf(b2); return c && c.ph === 'down' && b2.y > 0.4; });
    const cd = callOf(b2); if (!cd || cd.ph !== 'down') return 'no way down phase: ' + b2.state + ' ' + X.dump();
    const b3 = reload(); const c3 = RT.callOf(g, b3); if (!c3 || c3.ph !== 'down') return 'the way down did not survive the load: ' + X.dump();
    const rec = X.watch(b3, 40, () => !RT.callOf(g, b3) && NAV.isGround(b3));
    if (RT.callOf(g, b3) || !NAV.isGround(b3)) return 'after the load it stayed up there: ' + b3.y.toFixed(2) + ' ' + X.dump();
    if (X.count() !== n0) return `plush ${X.count()} was ${n0}`;
    // a bot that is up there with no call at all (an older save): it is given its way down
    const b4 = X.mkBot(X.cellX(P.i0 + 2), X.cellZ(P.k0 + 1), C + 0.02); b4.state = 'idle'; X.run(0.1); NAV.invalidate('x');
    if (NAV.isGround(b4)) return 'the bot is not on the pad';
    S().botCalls = []; g.crew.sync(); X.run(0.3);
    const c4 = RT.callOf(g, b4); if (!c4 || c4.ph !== 'down') return 'no way down for the bot up there: ' + X.dump();
    X.run(40, () => !RT.callOf(g, b4) && NAV.isGround(b4));
    return NAV.isGround(b4) || 'still up: ' + b4.y.toFixed(2);
  });

  await X.guard('botroutes.flow.a-bot-knocked-off-the-route-gets-a-new-one-from-where-it-lands-and-still-arrives', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(6); const n0 = X.count();
    g.crew.goHome(b); X.run(2.5); let knocked = false, before = 0, startNear = null;
    const rec = X.watch(b, 100, () => !callOf(b) && b.state === 'idle' && b.carry.length === 0 && NAV.isGround(b), { each: (bb) => {
      if (!knocked && callOf(bb) && bb.x > X.cellX(P.i0 - 4)) { knocked = g.time; before = g.botnav.stats().replans; bb.x -= 3.0; bb.z += 2.4; bb.y = 0.02; NAV.resetBot(bb); }
      if (knocked && !startNear && g.time - knocked > 2.5) { const c = callOf(bb); if (c) { const r = RT.routeOf(c); if (r.up.length) { const d = RT.decode(r.up[0]); startNear = Math.max(Math.abs(d.i - ctx.toI(bb.x)), Math.abs(d.k - ctx.toK(bb.z))); } } }
    } });
    if (!knocked) return 'the bot never got near the ramp: ' + rec.states.join();
    if (g.botnav.stats().replans <= before) return 'no new route after the knock: ' + JSON.stringify(g.botnav.stats());
    if (startNear !== null && startNear > 6) return 'the new route starts ' + startNear + ' cells from the bot (it was laid from somewhere else)';
    if (t.q.length !== 6) return `hopper ${t.q.length} of 6 (${rec.states.join()}, ${toasts.join(' / ')})`;
    if (X.count() !== n0) return `plush ${X.count()} was ${n0}`;
    return NAV.isGround(b) && !callOf(b) || 'not on the ground: ' + b.y.toFixed(2);
  });

  await X.guard('botroutes.flow.a-bot-that-is-removed-mid-call-takes-its-call-and-its-promise-with-it', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(6); g.crew.goHome(b); X.run(2.0);
    if (!callOf(b) || RT.callsOf(g, t.id).length !== 1) return 'no call to begin with: ' + X.dump();
    if (X.FUEL.reserved(g, t) !== 6) return 'reserved ' + X.FUEL.reserved(g, t);
    S().crew.splice(S().crew.indexOf(b), 1); X.run(0.3);
    if (RT.callsOf(g, t.id).length) return 'the call stayed: ' + X.dump();
    return X.FUEL.reserved(g, t) === 0 || 'the promise stayed: ' + X.FUEL.reserved(g, t);
  });

  await X.guard('botroutes.flow.the-debug-overlay-draws-the-routes-for-tests-and-nothing-draws-them-in-normal-play', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(6); g.crew.goHome(b);
    X.run(2.5);
    const grp = () => g.renderer.scene.getObjectByName('botRoutes');
    if (grp() && grp().children.length) return 'something is drawn in normal play';
    const n = g.botnav.debugRoutes(true); if (!(n >= 1)) return 'lines ' + n;
    const lines = grp().children.length; if (lines < 1) return 'no line objects';
    const pos = grp().children[0].geometry.getAttribute('position'); if (pos.count < 3) return 'a short line ' + pos.count;
    g.botnav.debugRoutes(false); if (grp() && grp().children.length) return 'still drawn after off';
    return true;
  });
}
