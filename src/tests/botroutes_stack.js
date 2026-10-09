// botroutes.stack.*: the call on one, two and three levels of a stacked base (a stair between each), a ladder shared by two bots and a lift shared by two bots.
// Each bot has one call; the route goes up, stays while it fuels, comes down, and is removed on the ground. (a new world each: the cubes are built in a sealed box of plush)
// Run: `await __selftest('botroutes.stack')`
import { kit, RT, threeLevels, twoLevels, stackKit } from './botroutes_lib.js';

export default async function (ctx) {
  const { g, S } = ctx;
  ctx.WORLD_TESTS.push('botroutes.stack');
  const K = stackKit(ctx), H = kit(ctx, { shell: false }), C = 0.6, NAV = H.NAV;
  const guard = (name, fn) => H.guard(name, fn, { setup: false });
  const callOf = H.callOf;
  const tunnelBot = (Y, n = 0, y = 0.02) => H.mkBot(H.cellX(Y.i0 + 5 + (n % 2)), H.cellZ(Y.lo + 1 + (n >> 1)), y);

  // one trip: a bot with `n` plush is called to the machine `t` (a generator), and watched until it is back on the ground with the call gone
  const trip = (Y, t, n, o = {}) => {
    const b = o.bot || tunnelBot(Y); b.carry = H.mix(n); const n0 = H.count();
    g.crew.goHome(b); if (b.state !== 'fwalk') return { err: 'no errand: ' + b.state + ' ' + JSON.stringify([b.fuelBad, t.q.length]) };
    const seen = { ph: new Set(), up: 0, back: 0, top: 0, kinds: new Set(), status: new Set(), passed: 0 }, fol = H.follower();
    const rec = H.watch(b, o.secs || 140, () => !callOf(b) && b.state === 'idle' && b.carry.length === 0 && NAV.isGround(b), { each: (bb) => {
      fol.each(bb); seen.top = Math.max(seen.top, bb.y);
      const c = callOf(bb); if (c) { seen.ph.add(c.ph); const r = RT.routeOf(c); seen.up = Math.max(seen.up, r.up.length); seen.back = Math.max(seen.back, r.back.length); seen.passed = Math.max(seen.passed, r.passed); for (const id of r.up) seen.kinds.add(RT.decode(id).j); }
      seen.status.add(g.crew.statusLine(bb).split(',')[0]);
    } });
    return { b, rec, seen, fol, n0 };
  };

  await guard('botroutes.stack.two-levels-call-lay-follow-return', async (toasts) => {
    const { Y } = await twoLevels(K);
    const t = H.gen(Y.m + 0, Y.lo + 1, 5);          // on the upper plate (row 4), 3.0 m up
    const undo = H.homeAt(H.cellX(Y.i0 + 4), H.cellZ(Y.lo + 1)); try {
      const r = trip(Y, t, 6); if (r.err) return r.err;
      const { b, rec, seen, fol } = r;
      if (t.q.length !== 6) return `hopper ${t.q.length} of 6 (${rec.states.join()}, top ${seen.top.toFixed(2)}, ${toasts.join(' / ')})`;
      if (seen.top < 2.9) return 'never up: ' + seen.top.toFixed(2);
      if (!seen.ph.has('up') || !seen.ph.has('down')) return 'phases ' + [...seen.ph];
      if (seen.up < 5 || seen.back < 5) return `routes up ${seen.up} back ${seen.back}`;
      if (Math.max(...seen.kinds) < 4) return 'the route never reaches the upper plate: rows ' + [...seen.kinds];
      if (callOf(b) || !NAV.isGround(b)) return 'not released on the ground: ' + b.y.toFixed(2) + ' ' + H.dump();
      if (H.count() !== r.n0) return `plush ${H.count()} was ${r.n0}`;
      if (rec.maxGap > 0.3 || rec.minGap < -0.3 || rec.maxJump > 0.5 || rec.falls) return `moved badly: gap ${rec.minGap.toFixed(2)}..${rec.maxGap.toFixed(2)} jump ${rec.maxJump.toFixed(2)} falls ${rec.falls}`;
      if (fol.frames < 20 || fol.off > fol.frames * 0.1) return `follow ${fol.off} off of ${fol.frames}`;
      return ![...seen.status].every((s) => !/Heading back down/.test(s)) || 'statuses ' + [...seen.status];
    } finally { undo(); }
  });

  await guard('botroutes.stack.three-levels-call-lay-follow-return', async (toasts) => {
    const { Y } = await threeLevels(K);
    const t = H.gen(Y.m + 3, Y.lo + 1, 9);          // on the third level, 5.4 m up
    H.fillOthers(t);
    const undo = H.homeAt(H.cellX(Y.i0 + 4), H.cellZ(Y.lo + 1)); try {
      const pa = NAV.pathTo({ x: H.cellX(Y.i0 + 5), y: 0, z: H.cellZ(Y.lo + 1) }, { x: H.cellX(Y.m + 3), y: 9 * C, z: H.cellZ(Y.lo + 1) }, { sync: true, dy: 0.3 }); if (!pa.ok) return 'no path to the third level: ' + pa.why;
      const r = trip(Y, t, 7, { secs: 220 }); if (r.err) return r.err;
      const { b, rec, seen, fol } = r;
      if (t.q.length !== 7) return `hopper ${t.q.length} of 7 (${rec.states.join()}, top ${seen.top.toFixed(2)}, ${toasts.join(' / ')})`;
      if (seen.top < 5.2) return 'never reached the third level: ' + seen.top.toFixed(2);
      if (Math.max(...seen.kinds) < 8) return 'the route never reaches the third level: rows ' + [...seen.kinds];
      if (seen.up < 8 || seen.back < 8) return `routes up ${seen.up} back ${seen.back}`;
      if (callOf(b) || !NAV.isGround(b)) return 'not released on the ground: ' + b.y.toFixed(2) + ' ' + H.dump();
      if (H.count() !== r.n0) return `plush ${H.count()} was ${r.n0}`;
      if (rec.maxGap > 0.3 || rec.minGap < -0.3 || rec.maxJump > 0.5 || rec.falls) return `moved badly: gap ${rec.minGap.toFixed(2)}..${rec.maxGap.toFixed(2)} jump ${rec.maxJump.toFixed(2)} falls ${rec.falls}`;
      return (fol.frames >= 30 && fol.off <= fol.frames * 0.1) || `follow ${fol.off} off of ${fol.frames}`;
    } finally { undo(); }
  });

  await guard('botroutes.stack.two-bots-one-call-each-to-machines-on-the-upper-levels-all-come-down', async () => {
    const { Y } = await threeLevels(K);
    const a = H.gen(Y.m + 0, Y.lo + 1, 5), c = H.gen(Y.m + 3, Y.lo + 2, 9); H.fillOthers(null); a.q.length = 0; c.q.length = 0;
    const undo = H.homeAt(H.cellX(Y.i0 + 4), H.cellZ(Y.lo + 1)); try {
      const b1 = tunnelBot(Y, 0), b2 = tunnelBot(Y, 1); b1.carry = H.mix(5); b2.carry = H.mix(5); const n0 = H.count();
      g.crew.goHome(b1); g.crew.goHome(b2);
      let both = 0, close = 0;
      H.run(240, () => {
        const c1 = callOf(b1), c2 = callOf(b2); if (c1 && c2) both++;
        if (Math.hypot(b1.x - b2.x, b1.z - b2.z) < 0.18 && Math.abs(b1.y - b2.y) < 0.7 && (NAV.codeOf(b1) || NAV.codeOf(b2))) close++;
        return !c1 && !c2 && b1.state === 'idle' && b2.state === 'idle' && NAV.isGround(b1) && NAV.isGround(b2);
      });
      if (a.q.length + c.q.length !== 10) return `fed ${a.q.length} + ${c.q.length} of 10 (${b1.state} ${b1.y.toFixed(1)}, ${b2.state} ${b2.y.toFixed(1)})`;
      if (!both) return 'the two bots never had a call at once';
      if (close > 6) return `the bots overlapped for ${close} frames`;
      if (callOf(b1) || callOf(b2) || !NAV.isGround(b1) || !NAV.isGround(b2)) return 'not both down: ' + H.dump();
      return H.count() === n0 || `plush ${H.count()} was ${n0}`;
    } finally { undo(); }
  });

  await guard('botroutes.stack.two-bots-each-called-up-the-same-ladder-never-share-a-rung', async () => {
    const Y = K.yard({ levels: 2, east: true }); const [A] = K.stack(Y, ['steel', 'steel']);
    const a = await K.putPlate(A, 'f', 0, 0), b = await K.putPlate(A, 'c', 2, 0); if (!a.ok || !b.ok) return 'plates ' + (a.why || b.why);
    ctx.craft('ladder'); ctx.selectTool('ladder'); K.aimAt(K.cellX(Y.m + 1), 4 * C, K.cellZ(Y.lo + 2), 1.0); const pl = await ctx.plan(); if (!pl.ok) return 'ladder: ' + pl.why;
    ctx.placeNow(); K.tick(0.2); if (![...K.ST.ladders(g).values()].length) return 'no ladder';
    const t = H.gen(Y.m + 0, Y.lo + 1, 5); H.fillOthers(t); t.q.length = 0;
    const undo = H.homeAt(H.cellX(Y.i0 + 4), H.cellZ(Y.lo + 1)); try {
      const b1 = tunnelBot(Y, 0), b2 = tunnelBot(Y, 1); b1.carry = H.mix(5); b2.carry = H.mix(5); const n0 = H.count();
      const pa = NAV.pathTo({ x: b1.x, y: 0, z: b1.z }, { x: H.cellX(t.i), y: 3.0, z: H.cellZ(t.k) }, { sync: true }); if (!pa.ok || !NAV.stepList(pa).some((s) => s.kind === 'ladder')) return 'no ladder in the path';
      g.crew.goHome(b1); g.crew.goHome(b2);
      let over = 0, both = 0;
      H.run(240, () => {
        if (callOf(b1) && callOf(b2)) both++;
        if (NAV.codeOf(b1) === NAV.CODE.ladder && NAV.codeOf(b2) === NAV.CODE.ladder && Math.hypot(b1.x - b2.x, b1.z - b2.z) < 0.3 && Math.abs(b1.y - b2.y) < 0.5) over++;
        return !callOf(b1) && !callOf(b2) && b1.state === 'idle' && b2.state === 'idle' && NAV.isGround(b1) && NAV.isGround(b2);
      });
      if (t.q.length !== 10) return `fed ${t.q.length} of 10`;
      if (!both) return 'never two calls at once';
      if (over) return `two bots on one rung for ${over} frames`;
      if (callOf(b1) || callOf(b2) || !NAV.isGround(b1) || !NAV.isGround(b2)) return 'not both down: ' + H.dump();
      return H.count() === n0 || `plush ${H.count()} was ${n0}`;
    } finally { undo(); }
  });
}
