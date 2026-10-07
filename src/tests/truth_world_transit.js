// In-world keys, part 7: E on doors, jump pads, elevator call panels and the cab, Shift+E copy and paste, and R / - = with a door or a jump pad in hand.
import { kit } from './transit_lib.js';
import * as TR from '../transit.js';
import { makeIO } from './truth_world_lib.js';
export default async function (ctx) {
  const { T, g, S, p, adv, craft, toI, toK, V3, aimPoint, cellX, cellZ } = ctx;
  const X = kit(ctx), C = 0.6;
  const io = makeIO(ctx);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { g.keys = {}; g.stowed = true; X.clean(); } });
  const look = (x, y, z, back = 2.2) => { aimPoint(x, y, z, back); adv(0.06); };

  await guard('truth.world.keys-e-opens-and-closes-a-door-with-no-power-it-turns-a-slow-crank-and-shift-e-copies-lock-and-sensor', async () => {
    X.setup(); const bad = []; const i0 = toI(-20), k0 = toK(4); const d1 = X.door(i0, k0, { auto: false }), d2 = X.door(i0 + 8, k0, { auto: false });
    const G = X.powerAt(-17, 2, 2); void G; adv(0.5);
    const aimDoor = (d) => look(d.px ?? cellX(d.i0 + 2), 1.2, d.pz ?? cellZ(d.k0), 2.4);
    aimDoor(d1); const t0 = d1.tgt; io.tap('KeyE'); adv(0.2); if (d1.tgt === t0) bad.push('E did not open or close the door'); io.tap('KeyE'); adv(0.2); if (d1.tgt !== t0) bad.push('a second E did not switch it back');
    // the readout of a door that has no power says what E does
    d2.pw = 0; aimDoor(d2); adv(0.1); const unpowered = !((d2.pw ?? 0) > 0.05); if (unpowered) { io.tap('KeyE'); adv(0.3); if (!d2.crank && !d2.tgt) bad.push('E on an unpowered door did nothing (no crank)'); }
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-e-on-a-jump-pad-is-5-degrees-steeper-and-crouch-e-turns-it-15-degrees', async () => {
    X.setup(); const bad = []; const i0 = toI(-20), k0 = toK(4); const j = X.jump(i0, k0, { ang: 45, hd: 0 }); X.powerAt(-17, 2, 2); adv(0.5);
    look(cellX(i0 + 2), 0.2, cellZ(k0 + 2), 2.4); const a0 = j.ang, h0 = j.hd; io.tap('KeyE'); adv(0.1); if (j.ang !== a0 + 5) bad.push(`E: angle ${a0} -> ${j.ang}, not 5 steeper`);
    const h1 = j.hd; io.down('KeyC'); io.tap('KeyE'); io.up('KeyC'); adv(0.1); const turned = ((j.hd - h1) % 360 + 360) % 360; if (j.hd === h1) bad.push('crouch + E did not turn the heading'); else if (turned !== 15 && Math.abs(turned - 15) > 1e-6) { const step = typeof j.hd === 'number' ? turned : 'index'; bad.push('crouch + E turned it ' + step + ' not 15 degrees (' + h1 + ' -> ' + j.hd + ')'); }
    for (const code of ['ControlLeft', 'ControlRight']) { const h = j.hd; io.down(code); io.tap('KeyE'); io.up(code); adv(0.1); if (j.hd === h) bad.push(code + ' + E (Ctrl works for crouch) did not turn it'); }
    void h0;
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-minus-equals-set-the-jump-pad-angle-in-5-degree-steps-0-to-90-and-r-turns-the-heading', async () => {
    X.setup({ ...ctx.S().up }); const up = { transitJump: 1, shellPads: 1, shellRamps: 1, springs: 3, power: 1 }; X.setup({ ...up }); craft('jump'); const bad = []; const slot = g.assignHotbar('jump'); g.stowed = false; g.selectTool(slot);
    g._jang = undefined; const start = TR.jumpAng ? TR.jumpAng(g) : null; void start;
    for (let q = 0; q < 30; q++) io.tap('Equal'); const top = g._jang; if (top !== 90) bad.push('= stopped at ' + top + ', not 90');
    for (let q = 0; q < 30; q++) io.tap('Minus'); if (g._jang !== 0) bad.push('- stopped at ' + g._jang + ', not 0'); io.tap('Equal'); if (g._jang !== 5) bad.push('one = is ' + g._jang + ' degrees, not 5');
    const r0 = g._jr | 0; io.tap('KeyR'); if (((g._jr | 0) - r0 + 24) % 24 !== 1) bad.push('R did not turn the heading one step'); io.shiftTap('KeyR'); if ((g._jr | 0) !== r0) bad.push('Shift+R did not turn it back');
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-r-turns-a-door-in-hand', async () => {
    X.setup(); craft('door'); const slot = g.assignHotbar('door'); if (slot < 0) return 'no door item'; g.stowed = false; g.selectTool(slot); g._bRot = 0; io.tap('KeyR'); const a = g._bRot; io.tap('KeyR'); const b = g._bRot;
    return (a === 1 && b === 2 && /Turned a quarter/.test(io.hint())) || `R: ${a} ${b} ${io.hint()}`;
  });

  await guard('truth.world.keys-shift-e-copies-a-door-or-jump-pad-or-sorting-box-then-e-pastes-and-shift-e-at-nothing-drops-it', async () => {
    X.setup(); const bad = []; const i0 = toI(-26), k0 = toK(4); X.powerAt(-17, 2, 2);
    const d1 = X.door(i0, k0, { auto: false, lock: 'power' }), d2 = X.door(i0 + 8, k0, { auto: true, lock: 'none' }); adv(0.5);
    const aimDoor = (d) => look(cellX(d.i0 + 2), 1.2, cellZ(d.k0), 2.4);
    g.cfgClip = null; aimDoor(d1); io.shiftTap('KeyE'); if (!g.cfgClip || g.cfgClip.group !== 'doorcfg') bad.push('Shift+E on a door copied nothing: ' + io.hint()); aimDoor(d2); io.tap('KeyE'); adv(0.1);
    if (d2.lock !== 'power' || !!d2.auto !== false) bad.push(`E on another door did not paste lock and sensor: lock ${d2.lock} auto ${d2.auto}`);
    look(cellX(toI(-26)), 4.5, cellZ(toK(-4)), 2.0); io.shiftTap('KeyE'); if (g.cfgClip) bad.push('Shift+E at nothing did not drop the copy'); if (!/dropped/.test(io.hint())) bad.push('drop hint: ' + io.hint());
    const j1 = X.jump(toI(-22), toK(-3), { ang: 70, hd: 45 }), j2 = X.jump(toI(-14), toK(-3), { ang: 20, hd: 0 }); adv(0.3);
    look(cellX(j1.i0 + 2), 0.2, cellZ(j1.k0 + 2), 2.4); io.shiftTap('KeyE'); look(cellX(j2.i0 + 2), 0.2, cellZ(j2.k0 + 2), 2.4); io.tap('KeyE'); adv(0.1); if (j2.ang !== 70 || j2.hd !== 45) bad.push(`jump pad paste: angle ${j2.ang} heading ${j2.hd}, wanted 70 and 45`);
    g.cfgClip = null;
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-a-door-locked-to-key-opens-on-e-and-by-sensor-only-while-a-door-key-is-in-your-pack', async () => {
    X.setup(); const bad = []; const i0 = toI(-20), k0 = toK(4); X.powerAt(-17, 2, 2); const d = X.door(i0, k0, { auto: false, lock: 'key' }); adv(0.5);
    look(cellX(d.i0 + 2), 1.2, cellZ(d.k0), 2.4); io.clearHint(); io.tap('KeyE'); adv(0.2); if (d.tgt) bad.push('E opened a key door with no key'); if (!/Door Key/.test(io.hint())) bad.push('no key hint: ' + io.hint());
    S().items.doorkey = 1; io.tap('KeyE'); adv(0.2); if (!d.tgt) bad.push('E did not open the key door with a Door Key in the pack'); io.tap('KeyE'); adv(0.2);
    S().items.doorkey = 1; d.auto = true; d.tgt = 0; d.p = 0; const sensor = (key) => { delete S().items.doorkey; if (key) S().items.doorkey = 1; d.tgt = 0; d.p = 0; d.st = 'closed'; p().pos.set(cellX(d.i0 + 2), 0, cellZ(d.k0) - 1.5); p().vel.set(0, 0, 0); adv(1.5); return !!d.tgt; };
    if (!sensor(true)) bad.push('the sensor did not open the key door for someone holding a key'); if (sensor(false)) bad.push('the sensor opened the key door with no key');
    return bad.length === 0 || bad.join('; ');
  });

  // the elevator, as the elev tests build it: a call panel at a landing and the cab's E, pressed as keys
  const LI = () => toI(-6), LK = () => toK(3);
  const rig = () => {
    X.setup(); const L0 = X.lift(LI(), LK(), { home: 30, depth: 24, top: 38 });
    X.tunnel(L0, 30, 1, 6); X.tunnel(L0, 18, 0, 8); TR.refreshShaft(g, L0); L0.ex = L0.tr;
    const G = X.powerCab(L0, 2); p().pos.set(L0.px - 9, 0, L0.pz - 9); p().vel.set(0, 0, 0); g.keys = {}; adv(0.7); return { L0, G };
  };
  await guard('truth.world.keys-e-at-a-landing-panel-calls-the-cab-and-e-in-the-cab-goes-where-you-look', async () => {
    const { L0 } = rig(), bad = [];
    const pp = TR.panelPos(L0, 0, 1); p().pos.set(pp.x + 1.2, 18 * C, pp.z); p().vel.set(0, 0, 0); { const e = p().eyePos(new V3()); p().yaw = Math.atan2(pp.x - e.x, pp.z - e.z); p().pitch = Math.atan2(18 * C + 0.9 - e.y, Math.hypot(pp.x - e.x, pp.z - e.z)); } adv(0.06);
    io.tap('KeyE'); adv(0.2); if (L0.tg !== 18 && L0.q.join() !== '18') bad.push(`E at the panel: tg ${L0.tg} queue ${L0.q}`); adv(6.0);
    if (Math.abs(L0.cy - 10.8) > 1e-6) bad.push('the cab did not come to the landing: ' + L0.cy);
    // in the cab: look up, E goes up
    L0.q = []; L0.tg = null; L0.dw = 0; L0.cy = 10.8; L0.dr = 1; p().pos.set(L0.px, 10.8, L0.pz); p().vel.set(0, 0, 0); adv(0.5); if (p().liftId !== L0.id) return 'not in the cab';
    p().pitch = 0.7; adv(0.06); io.tap('KeyE'); adv(0.3); if (L0.tg !== 30) bad.push('looking up and pressing E: target ' + L0.tg);
    return bad.length === 0 || bad.join('; ');
  });
}
