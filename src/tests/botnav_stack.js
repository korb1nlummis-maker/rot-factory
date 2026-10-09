// botnav.stack.*: bots in a stacked base. A stair between two cubes, a ladder up a plate opening, plates as floors, and the rule that a bot never steps off an edge on purpose.
// (a new world each: the cubes are built in a sealed box of plush, stack_lib.js yard)
// Run: `await __selftest('botnav.stack')`
import { kit as stackKit } from './stack_lib.js';
import { kit, rar } from './botnav_lib.js';

export default async function (ctx) {
  const { g, S, w, p } = ctx;
  ctx.WORLD_TESTS.push('botnav.stack');
  const K = stackKit(ctx), H = kit(ctx, { shell: false }), C = 0.6, NAV = H.NAV;
  const guard = (name, fn) => H.guard(name, fn, { setup: false });
  // two cubes, a floor plate in the lower one and a landing (opening turned to od) as the floor of the upper one, and the switchback stair between them
  const base = async (stairs = true) => {
    const Y = K.yard({ levels: 2, east: true }); const [A, B2] = K.stack(Y, ['steel', 'steel']);
    const a = await K.putPlate(A, 'f', 0, 0); if (!a.ok) throw new Error('lower plate: ' + a.why);
    const b = await K.putPlate(A, 'c', 1, 0); if (!b.ok) throw new Error('upper landing: ' + b.why);
    let st = null; if (stairs) { st = await K.putStair(A, 0); if (!st.ok) throw new Error('stair: ' + st.why); }
    K.tick(0.2); return { Y, A, B2, plateA: a.e, plateB: b.e, stair: st };
  };
  const tunnelBot = (Y, y = 0.02) => H.mkBot(H.cellX(Y.i0 + 5), H.cellZ(Y.lo + 1), y);

  await guard('botnav.stack.a-bot-fuels-a-generator-on-the-upper-plate-up-the-stair-and-comes-back', async (toasts) => {
    const { Y } = await base();
    const t = H.gen(Y.m + 0, Y.lo + 1, 5);          // on the upper plate (row 4), 3.0 m up
    const undo = H.homeAt(H.cellX(Y.i0 + 4), H.cellZ(Y.lo + 1)); try {
    const b = tunnelBot(Y); b.carry = H.mix(6); const n0 = H.count();
    const from = { x: b.x, y: 0, z: b.z }, to = { x: H.cellX(Y.m), y: 3.0, z: H.cellZ(Y.lo + 1) };
    const pa = NAV.pathTo(from, to, { sync: true }); if (!pa.ok) return 'no path: ' + pa.why + ' ' + JSON.stringify(NAV.stats());
    const kinds = new Set(NAV.stepList(pa).map((s) => s.kind)); if (!kinds.has('stair')) return 'the path has no stair: ' + [...kinds];
    g.crew.goHome(b); if (b.state !== 'fwalk') return 'no errand: ' + b.state + ' ' + JSON.stringify({ bad: b.fuelBad, hops: b.fuelHops, done: b.fuelDone, t: [t.i, t.j, t.k, t.q.length], b: [b.x, b.y, b.z], bat: b.battery, mach: ctx.L().tiles.size });
    let top = 0, snapAt = null; const rec = H.watch(b, 90, () => b.state === 'idle' && b.carry.length === 0 && NAV.isGround(b), { dbg: 14, each: (bb) => { top = Math.max(top, bb.y); if (bb.state === 'fgive' && !snapAt) snapAt = { y: bb.y, log: g._navDbg.slice(-12) }; } });
    if (t.q.length !== 6) return `hopper ${t.q.length} of 6 (${rec.states.join()}, top ${top.toFixed(2)}, ${toasts.join(' / ')})`;
    if (top < 2.9) return 'never reached the upper plate: top ' + top.toFixed(2);
    if (rec.maxGap > 0.3 || rec.minGap < -0.3) return `feet off the surface: ${rec.minGap.toFixed(2)} .. ${rec.maxGap.toFixed(2)} at ${JSON.stringify(rec.atMin)} ${JSON.stringify(rec.atMax)} fgive at ${JSON.stringify(snapAt)}`;
    if (rec.maxJump > 0.5) return 'jumped ' + rec.maxJump.toFixed(2); if (rec.falls) return 'fell ' + rec.falls + ' times';
    if (!rec.codes.has(NAV.CODE.stair)) return 'the status never said Taking the stairs: ' + [...rec.codes];
    if (H.count() !== n0) return `plush ${H.count()} was ${n0}`;
    return toasts.every((m) => !/No way up/.test(m)) || toasts.join(' / ');
    } finally { undo(); }
  });

  await guard('botnav.stack.a-ladder-takes-a-bot-up-to-the-plate-and-down-again', async (toasts) => {
    const Y = K.yard({ levels: 2, east: true }); const [A, B2] = K.stack(Y, ['steel', 'steel']);
    const a = await K.putPlate(A, 'f', 0, 0); const b = await K.putPlate(A, 'c', 2, 0); if (!a.ok || !b.ok) return 'plates ' + (a.why || b.why);
    ctx.craft('ladder'); ctx.selectTool('ladder'); K.aimAt(K.cellX(Y.m + 1), 4 * C, K.cellZ(Y.lo + 2), 1.0); const pl = await ctx.plan(); if (!pl.ok) return 'ladder: ' + pl.why;
    ctx.placeNow(); K.tick(0.2);
    const L = [...K.ST.ladders(g).values()][0]; if (!L) return 'no ladder';
    const t = H.gen(Y.m + 0, Y.lo + 1, 5);
    const undo = H.homeAt(H.cellX(Y.i0 + 4), H.cellZ(Y.lo + 1)); try {
    const b0 = H.mkBot(H.cellX(Y.i0 + 5), H.cellZ(Y.lo + 1)); b0.carry = H.mix(5);
    const pa = NAV.pathTo({ x: b0.x, y: 0, z: b0.z }, { x: t.i !== undefined ? H.cellX(t.i) : 0, y: 3.0, z: H.cellZ(t.k) }, { sync: true });
    if (!pa.ok || !NAV.stepList(pa).some((s) => s.kind === 'ladder')) return 'no ladder in the path: ' + pa.why + ' ' + NAV.stepList(pa).map((s) => s.kind);
    g.crew.goHome(b0); let top = 0, climbing = 0;
    const rec = H.watch(b0, 90, () => b0.state === 'idle' && b0.carry.length === 0 && NAV.isGround(b0), { each: (bb) => { top = Math.max(top, bb.y); if (NAV.codeOf(bb) === NAV.CODE.ladder) climbing++; } });
    if (t.q.length !== 5) return `hopper ${t.q.length} of 5 (${rec.states.join()}, top ${top.toFixed(2)})`;
    if (top < 2.9) return 'top ' + top.toFixed(2); if (!climbing) return 'never climbing'; if (rec.falls) return 'fell ' + rec.falls;
    if (rec.maxJump > 0.45) return 'jumped ' + rec.maxJump.toFixed(2);
    return NAV.isGround(b0) || 'not down again: ' + b0.y.toFixed(2);
    } finally { undo(); }
  });

  await guard('botnav.stack.a-bot-on-a-plate-with-no-way-down-says-so-once-and-never-steps-off', async (toasts) => {
    const { Y } = await base(false);                          // no stair: the upper plate is reachable by nothing
    const b = H.mkBot(H.cellX(Y.m), H.cellZ(Y.lo + 1), 3.0); b.carry = H.mix(3);
    NAV.invalidate('test'); K.tick(0.1);
    const t0 = b.y; g.crew.sendHome(b);
    const rec = H.watch(b, 12);
    if (rec.minY < t0 - 0.2) return `it stepped off: y went down to ${rec.minY.toFixed(2)} from ${t0.toFixed(2)}`;
    if (b.y < 2.8) return 'it is not on the plate: ' + b.y.toFixed(2);
    const n = toasts.filter((m) => /No way up/.test(m)).length; if (n !== 1) return `${n} No way up toasts: ${toasts.join(' / ')}`;
    if (!/No way up/.test(g.crew.statusLine(b))) return 'status: ' + g.crew.statusLine(b);
    return true;
  });
}
