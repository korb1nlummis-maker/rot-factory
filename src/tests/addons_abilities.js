// Add-on audit, part 7: the player's own abilities, driven through the real key path (g.onKey), plus the inventory and hotbar keys.
import { makeKit, ALL_UP } from './addons_lib.js';

export default async function (ctx) {
  const { T, g, S, w, p, sim, V3, fresh, plushWall, standBeforeWall, clearBodies, adv, lookEast, sleep } = ctx;
  const K = makeKit(ctx);
  const key = (code, down = true) => (code === 'Click' ? g.onMouse({ button: 0, preventDefault() {} }, down) : g.onKey({ code, preventDefault() {}, repeat: false, target: document.body }, down));
  const tap = (code) => { key(code, true); key(code, false); };
  const target = () => { const eye = p().eyePos(new V3()), dir = p().forward(new V3()); g.curTargetRef = g.findTarget(eye, dir); return g.curTargetRef; };
  const hold = (frames = 120) => { key('Click', true); g.gDownAt = 0; for (let n = 0; n < frames; n++) { g.grabCd = Math.max(0, g.grabCd - 0.016); const eye = p().eyePos(new V3()), dir = p().forward(new V3()); g.curTargetRef = g.findTarget(eye, dir); g.interact(0.016, eye, dir); } key('Click', false); };

  await T('addons.ability.grab-with-bare-hands-only-and-the-pack-fills', async () => {
    await ctx.newWorld();
    fresh({ bag: 3, struts: 1 }); plushWall(30); standBeforeWall(); await sleep(40); const bad = [];
    // a tool in hand: F uses the tool and does not grab
    S().money = 1e12; g.craftItem('strut', 1); K.equip('strut'); if (!target()) return 'no target'; const n0 = S().carry.length; const e0 = S().entities.length; tap('Click'); if (S().carry.length !== n0) bad.push('F with a tool out still grabbed');
    K.stow(); g.holdBlock = false; target(); tap('Click'); if (S().carry.length !== n0 + 1) bad.push('F with bare hands did not grab: ' + (S().carry.length - n0)); void e0;
    return bad.length ? bad.join('; ') : true;
  });
  await T('addons.ability.throw-with-a-tap-and-punch-with-r', async () => {
    await ctx.newWorld();
    fresh({ bag: 3 }); const bad = []; S().carry.push({ sp: 2, vr: 0 }, { sp: 3, vr: 0 }); lookEast(0, -1.4, 0.1); clearBodies(); g.throwCd = 0; g.curTargetRef = null; const t0 = S().stats.thrown || 0; tap('Click'); if ((S().stats.thrown || 0) !== t0 + 1 || S().carry.length !== 1) bad.push('tap with plush in hand did not throw');
    if (sim().n < 1) bad.push('no flying plush after a throw');
    // punch: R clears plush in front
    fresh({}); plushWall(30); standBeforeWall(); const i0 = ctx.toI(-0.9), k0 = ctx.toK(1.2); const cells = () => { let c = 0; for (let di = 0; di < 3; di++) for (let dj = 1; dj <= 3; dj++) for (let dk = 0; dk < 6; dk++) if (w().get(i0 + di, dj, k0 + dk)) c++; return c; };
    const b = cells(); if (b < 10) bad.push('test wall missing'); p().pos.set(0.3, 0, 0.55); p().vel.set(0, 0, 0); p().yaw = 0; p().pitch = 0.05; g.punchT = 0; tap('KeyR'); if (!(cells() < b)) bad.push('R punched nothing');
    // with a ramp out R flips the ramp instead of punching
    S().money = 1e12; fresh(ALL_UP); g.craftItem('ramp', 1); K.equip('ramp'); const m0 = g.rampMode; tap('KeyR'); if (g.rampMode === m0) bad.push('R did not flip the ramp');
    return bad.length ? bad.join('; ') : true;
  });
  await T('addons.ability.vacuum-scoop-and-auto-grip-change-what-one-input-collects', async () => {
    await ctx.newWorld();
    const bad = [];
    const run = async (up, how) => { fresh({ bag: 8, reach: 3, gloves: 3, ...up }); plushWall(40); standBeforeWall(); await sleep(40); target(); if (how === 'hold') hold(40); else if (how === 'vac') { tap('Click'); for (let q = 0; q < 90; q++) { const eye = p().eyePos(new V3()), dir = p().forward(new V3()); g.interact(0.016, eye, dir); } } else { g.holdBlock = false; tap('Click'); } return S().carry.length; };
    const plain = await run({}, 'tap'), scoop = await run({ scoop: 4 }, 'tap'); if (!(plain === 1 && scoop > 1)) bad.push(`scoop: ${plain} vs ${scoop}`);
    const v0 = await run({}, 'vac'), v1 = await run({ vac: 5 }, 'vac'); if (!(v1 > v0 + 1)) bad.push(`vacuum: ${v0} vs ${v1}`);
    const h0 = await run({}, 'hold'), h1 = await run({ repeat: 1 }, 'hold'); if (!(h0 > 0 && h1 >= h0 * 2)) bad.push(`auto-grip: ${h0} vs ${h1}`);
    return bad.length ? bad.join('; ') : true;
  });
  await T('addons.ability.inventory-key-hotbar-numbers-q-and-x', async () => {
    await ctx.newWorld();
    fresh(ALL_UP); S().money = 1e12; const bad = []; for (const id of ['strut', 'lantern', 'belt']) g.craftItem(id, 2); S().hotbar = ['hammer', null, null, null, null, null, null, null, null]; g.rebuildTools();
    tap('KeyI'); if (g.ui.openModal !== 'inv') bad.push('I did not open the inventory'); g.ui.invSel = 'lantern'; tap('Digit4'); if (S().hotbar[3] !== 'lantern') bad.push('number in the inventory did not assign: ' + JSON.stringify(S().hotbar)); tap('KeyX'); if (S().hotbar[3]) bad.push('X in the inventory did not clear the slot'); g.ui.invSel = 'strut'; tap('Digit2'); tap('KeyI'); if (g.ui.openModal) bad.push('I did not close the inventory');
    tap('Digit2'); if (g.curTool().id !== 'strut') bad.push('number did not take the tool out: ' + g.curTool().kind); tap('Digit2'); if (g.curTool().kind !== 'hands') bad.push('same number did not put it away'); tap('Digit1'); if (g.curTool().kind !== 'hammer') bad.push('1 is not the hammer'); tap('KeyQ'); if (g.curTool().kind !== 'hands') bad.push('Q did not stow'); tap('KeyQ'); if (g.curTool().kind !== 'hammer') bad.push('Q did not take the tool out');
    tap('Digit5'); if (g.curTool().kind !== 'hands') bad.push('empty slot is not bare hands');
    // X removes what you aim at with any tool out
    g.craftItem('lantern', 1); K.equip('lantern'); const r = await K.put('lantern', { x: -6, z: 1.2, dir: 0 }); if (!r.ok) return 'lantern ' + r.why; K.equip('strut'); K.aimDir(r.ent.x, r.ent.y + 0.3, r.ent.z, 0, 1.5); adv(0.05); g.renderer.camera.position.copy(p().eyePos(new V3())); const n0 = S().entities.length; tap('KeyX'); if (S().entities.length !== n0 - 1) bad.push('X did not take down the aimed lantern');
    return bad.length ? bad.join('; ') : true;
  });
}
