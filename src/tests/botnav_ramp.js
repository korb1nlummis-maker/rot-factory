// botnav.ramp.*: a bot walks a ramp up to a platform and back down (the fuel errand to a generator on the platform, then home), its feet on the surface the whole way.
// Run: `await __selftest('botnav.ramp')`
import { kit, rar, sp } from './botnav_lib.js';

export default async function (ctx) {
  const { g, S } = ctx;
  const X = kit(ctx), C = 0.6;
  const I0 = () => ctx.toI(-9), K0 = () => ctx.toK(2);

  await X.guard('botnav.ramp.the-graph-has-the-ramp-and-pathTo-gives-the-steps', async () => {
    const P = await X.platform(I0(), K0()); X.run(0.2);
    const from = { x: X.cellX(P.i0 - 6), y: 0, z: X.cellZ(P.k0 + 2) }, to = { x: X.cellX(P.i0 + 2), y: C, z: X.cellZ(P.k0 + 2) };
    const r = X.NAV.pathTo(from, to, { sync: true }); if (!r.ok) return 'no path: ' + r.why;
    const kinds = X.NAV.stepList(r).map((s) => s.kind), legs = X.NAV.legs(r);
    if (!kinds.includes('ramp')) return 'the path never takes the ramp: ' + kinds.join();
    if (!legs.some((l) => l.kind === 'ramp' && l.rise > 0.4 && l.rise < 0.7)) return 'no ramp leg of about 0.6 m: ' + JSON.stringify(legs);
    const last = X.NAV.stepList(r).pop(); if (Math.abs(last.y - C) > 0.01) return 'the last step is at ' + last.y;
    if (!X.NAV.reachable(from, to)) return 'reachable says no';
    if (X.NAV.isGround(to)) return 'the pad top counts as ground'; if (!X.NAV.isGround(from)) return 'the floor does not count as ground';
    const s = X.NAV.nearestSafeDown({ x: to.x, y: C + 3, z: to.z }); if (!s || Math.abs(s.y - C) > 0.01 || !s.built) return 'nearestSafeDown ' + JSON.stringify(s);
    return true;
  });

  await X.guard('botnav.ramp.a-bot-fuels-a-generator-on-a-platform-and-comes-back-down', async (toasts) => {
    const P = await X.platform(I0(), K0());
    X.clearAbove(P.i0 - 8, P.k0 - 2, 14, 10, 4); X.fence(P.pad, undefined, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2), 0.3); b.carry = X.mix(8); const n0 = X.count();
    g.crew.goHome(b);
    if (b.state !== 'fwalk') return 'the bot did not set off to the generator: ' + b.state;
    let upY = -1;
    const rec = X.watch(b, 60, () => b.state === 'idle' && b.carry.length === 0 && X.NAV.isGround(b), { each: (bb) => { if (bb.y > upY) upY = bb.y; } });
    if (t.q.length !== 8) return `the hopper holds ${t.q.length} of 8 (${rec.states.join()}, y max ${upY.toFixed(2)})`;
    if (upY < 0.55) return 'the bot never got up on the platform: max y ' + upY.toFixed(2);
    if (rec.maxGap > 0.2 || rec.minGap < -0.16) return `the feet left the surface: gap ${rec.minGap.toFixed(2)} .. ${rec.maxGap.toFixed(2)} at ${JSON.stringify(rec.atMin)} / ${JSON.stringify(rec.atMax)}`;
    if (rec.maxJump > 0.5) return 'the bot jumped ' + rec.maxJump.toFixed(2) + ' m in a frame';
    if (!rec.codes.has(X.NAV.CODE.ramp)) return 'the status never said Taking the ramp: ' + [...rec.codes];
    if (X.count() !== n0) return `plush count ${X.count()} was ${n0}`;
    if (!X.NAV.isGround(b)) return 'the bot ended up on ' + b.y.toFixed(2);
    return toasts.every((m) => !/No way up/.test(m)) || 'toasts ' + toasts.join(' / ');
  });
}
