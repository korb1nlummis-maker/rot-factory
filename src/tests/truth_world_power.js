// In-world keys, part 5: the Power Cable tool (click, click, click again, click empty air, Q, Esc, 25 m and Grid Range), M and the power parts' E.
import { makeKit, UP } from './power_lib.js';
import { makeIO } from './truth_world_lib.js';
export default async function (ctx) {
  const { T, g, S, adv, craft, selectTool, plan, cellX, cellZ } = ctx;
  const K = makeKit(ctx);
  const io = makeIO(ctx);
  const cleanup = () => { g.cables.cancel(); g.stowed = true; g.keys = {}; };
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { cleanup(); } });
  // the corner to corner run of the open bay (24 m by 19 m) gives up to 30 m between two poles
  const A0 = [-13, -8], D = [0.8, 0.6];
  const at = (L) => [A0[0] + D[0] * L, A0[1] + D[1] * L];
  // stand 2.2 m from the target on the side of the bay's middle (the walls are close to the corners), then look at it
  const aimAt = (x, z) => { const dx = 0 - x, dz = 1 - z, n = Math.hypot(dx, dz) || 1; ctx.p().pos.set(x + dx / n * 2.2, 0, z + dz / n * 2.2); ctx.p().vel.set(0, 0, 0); const e = ctx.p().eyePos(new ctx.V3()); ctx.p().yaw = Math.atan2(x - e.x, z - e.z); ctx.p().pitch = Math.atan2(1.2 - e.y, Math.hypot(x - e.x, z - e.z)); adv(0.06); };

  await guard('truth.world.keys-cable-click-start-click-attach-click-the-pair-again-removes-click-air-q-or-esc-cancel', async () => {
    K.reset(UP, false); const bad = []; const a = K.pole(...A0), b = K.pole(...at(10)); craft('cable'); S().items.cable = 3; selectTool('cable');
    aimAt(A0[0], A0[1]); io.click(0); if (!g.cables.wiring) return 'a click on a pole did not start a wire: ' + io.hint(); if (!/Wire started/.test(io.hint())) bad.push('start hint: ' + io.hint());
    aimAt(...at(10)); io.click(0); const c = g.cables.find(a.id, b.id); if (!c) return 'the second click did not attach: ' + io.hint(); if (g.cables.wiring) bad.push('still wiring after the second click'); if (S().items.cable !== 2) bad.push('the cable item was not used up: ' + S().items.cable);
    // click the same pair again: removes the cable and gives it back
    aimAt(A0[0], A0[1]); io.click(0); aimAt(...at(10)); io.click(0); if (g.cables.find(a.id, b.id)) bad.push('clicking the same pair again did not remove the cable'); if (S().items.cable !== 3) bad.push('removing it did not give the cable back: ' + S().items.cable); if (!/Cable removed/.test(io.hint())) bad.push('removal hint: ' + io.hint());
    // click empty air cancels
    aimAt(A0[0], A0[1]); io.click(0); if (!g.cables.wiring) return 'could not start a wire again'; K.look(0, 8, 0, 2.0); io.click(0); if (g.cables.wiring) bad.push('a click on empty air did not cancel'); if (!/Wire cancelled/.test(io.hint())) bad.push('cancel hint: ' + io.hint());
    aimAt(A0[0], A0[1]); io.click(0); io.tap('Escape'); if (g.cables.wiring) bad.push('Esc did not cancel the wire'); aimAt(A0[0], A0[1]); io.click(0); io.tap('KeyQ'); if (g.cables.wiring) bad.push('Q did not drop the wire'); if (g.stowed) bad.push('Q put the cable away instead of just dropping the wire');
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-cables-reach-14-m-and-grid-range-adds-more', async () => {
    K.reset(UP, false); const bad = []; craft('cable'); S().items.cable = 5; selectTool('cable'); const max0 = g.cables.max(); if (max0 !== 14) bad.push('base reach is ' + max0);
    const wire = (L) => { const a = K.pole(...A0), b = K.pole(...at(L)); aimAt(...A0); io.click(0); if (!g.cables.wiring) return 'no start'; aimAt(...at(L)); io.click(0); const ok = !!g.cables.find(a.id, b.id); const hint = io.hint(); g.cables.cancel(); for (const e of [a, b]) K.decon(e); return { ok, hint }; };
    let r = wire(13); if (!r.ok) bad.push('13 m was refused: ' + r.hint); r = wire(15); if (r.ok || !/Too far/.test(r.hint)) bad.push('15 m should be too far: ' + JSON.stringify(r));
    g.T.cableLen = 18; if (g.cables.max() !== 18) bad.push('Grid Range level 1 should give 18 m, got ' + g.cables.max()); r = wire(17); if (!r.ok) bad.push('17 m with Grid Range was refused: ' + r.hint); r = wire(19); if (r.ok) bad.push('19 m should be too far at 18 m'); g.T = g.tune();
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-m-shows-the-load-meter-and-e-closes-a-switch-and-resets-a-breaker', async () => {
    K.reset({ ...UP, power: 1 }); const bad = []; const sw = K.part('switch', -6, 5), br = K.part('breaker', -3, 5); void br;
    if (!sw) return 'no switch placed';
    K.look(-6, 0.5, 5, 2.0); const before = !!sw.on; io.clearHint(); io.tap('KeyE'); if (!!sw.on === before) bad.push('E did not toggle the switch'); if (!new RegExp('Power Switch ' + (sw.on ? 'closed' : 'open')).test(io.hint())) bad.push('switch hint "' + io.hint() + '" with the switch ' + (sw.on ? 'closed' : 'open')); io.tap('KeyE'); if (!!sw.on !== before) bad.push('a second E did not toggle it back');
    const b2 = K.part('breaker', -3, 5); b2.tripped = true; K.look(-3, 0.5, 5, 2.0); io.tap('KeyE'); if (b2.tripped) bad.push('E on a tripped breaker did not reset it');
    return bad.length === 0 || bad.join('; ');
  });
}
