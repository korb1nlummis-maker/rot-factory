// "Every button that says it does something must do it" (in-world keys, part 1): movement, hands, cart, recall, hotbar, screens.
// Each test presses the real key (a KeyboardEvent on window) or mouse button and checks the effect the controls table / hint / chalkboard claims.
import { makeIO, WORLD_UP } from './truth_world_lib.js';
import { CONTROLS } from '../controls.js';
import { recipes } from '../crafting.js';
import { findInfoRef, infoFor } from '../info.js';
export default async function (ctx) {
  const { T, g, S, p, adv, fresh, craft, selectTool, plushWall, standBeforeWall, clearBodies, sim, realSleep, V3, near, placeAtFloor, aimPoint } = ctx;
  const io = makeIO(ctx);
  const hold = (codes, secs, o) => { for (const c of codes) io.down(c, o); adv(secs); for (const c of codes) io.up(c, o); };

  await T('truth.world.keys-wasd-shift-space-and-c-or-ctrl-do-what-the-controls-table-says', async () => {
    fresh({}); const bad = [];
    const run = (codes, secs = 1) => { p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); p().yaw = 0; p().pitch = 0; adv(0.4); const s = p().pos.clone(); hold(codes, secs); return p().pos.clone().sub(s); };
    p().yaw = 0; p().pitch = 0; const fwd = p().forward(new V3()); const w = run(['KeyW']), s = run(['KeyS']), a = run(['KeyA']), d = run(['KeyD']);
    if (w.dot(fwd) < 2) bad.push('W did not walk forward ' + w.length().toFixed(2)); if (s.dot(fwd) > -1) bad.push('S did not walk back'); if (Math.abs(a.x) + Math.abs(a.z) < 2 || a.dot(d) > 0) bad.push('A and D do not strafe opposite ways');
    const walk = w.length(); const sl = run(['KeyW', 'ShiftLeft']).length(), sr = run(['KeyW', 'ShiftRight'], 1).length();
    if (sl < walk * 1.3) bad.push(`left Shift did not sprint (${sl.toFixed(2)} vs walking ${walk.toFixed(2)})`); if (sr < walk * 1.3) bad.push('right Shift did not sprint (Shift is the sprint key)');
    p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); adv(0.5); let top = 0; io.down('Space'); for (let n = 0; n < 12; n++) { adv(0.05); top = Math.max(top, p().pos.y); } io.up('Space'); if (top < 0.3) bad.push('Space did not jump ' + top.toFixed(2));
    for (const c of ['KeyC', 'ControlLeft', 'ControlRight']) { p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); adv(0.3); io.down(c); adv(0.3); const on = p().crouch; io.up(c); adv(0.5); if (!on) bad.push(c + ' did not crouch'); if (p().crouch) bad.push('did not stand up after ' + c); }
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-left-click-grabs-hold-keeps-grabbing-click-with-plush-throws-and-z-throws-one', async () => {
    fresh({ bag: 3, gloves: 3, reach: 3 }); plushWall(40); standBeforeWall(); adv(0.2); const bad = [];
    const n0 = S().carry.length; io.click(0); adv(0.05); if (S().carry.length !== n0 + 1) bad.push('a left click did not grab the plush you look at');
    S().carry.length = 0; g.grabCd = 0; io.mouseDown(0); g.gDownAt = 0;   /* a held button counts as held after 160 ms: skip the wait */ for (let n = 0; n < 160; n++) { g.grabCd = Math.max(0, g.grabCd - 0.02); adv(0.02); } io.mouseUp(0);
    if (S().carry.length !== g.T.carry) bad.push(`holding left click filled ${S().carry.length} of ${g.T.carry} (hint "${io.hint()}", modal ${g.ui.openModal}, bodies ${sim().n}, mode ${g.mode}, tool ${g.curTool().kind}, vacT ${g.vacT}, holdBlock ${g.holdBlock}, grabCd ${g.grabCd})`);
    clearBodies(); const t0 = S().stats.thrown || 0, c0 = S().carry.length; g.throwCd = 0; g.curTargetRef = null; p().pitch = 0.1; io.click(0); if ((S().stats.thrown || 0) !== t0 + 1 || S().carry.length !== c0 - 1) bad.push('left click while holding plush did not throw one');
    g.throwCd = 0; adv(0.2); const c1 = S().carry.length; io.tap('KeyZ'); if (S().carry.length !== c1 - 1) bad.push('Z did not throw one plush');
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-right-click-r-and-p-all-punch-plush-loose', async () => {
    fresh({}); const bad = []; const tries = [['right click', () => io.click(2)], ['R', () => io.tap('KeyR')], ['P', () => io.tap('KeyP')]];
    for (const [name, fn] of tries) { plushWall(40); standBeforeWall(); p().pos.set(0, 0, 0.5); adv(0.1); clearBodies(); await realSleep(340); fn(); if (sim().n < 1) bad.push(name + ' punched nothing loose'); }
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-f-and-o-both-switch-the-flashlight-and-say-so', async () => {
    fresh({}); const bad = []; g.lampOn = true;
    for (const c of ['KeyF', 'KeyO']) { io.clearHint(); io.tap(c); const off = g.lampOn === false && /Flashlight off/.test(io.hint()); io.tap(c); const on = g.lampOn !== false && /Flashlight on/.test(io.hint()); if (!off || !on) bad.push(`${c} off ${off} on ${on}`); }
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-k-uses-a-medkit-and-heals-50', async () => {
    fresh(WORLD_UP()); craft('medkit', 2); g.hp = 20; io.tap('KeyK'); const a = g.hp, left = S().items.medkit; g.hp = 100; io.tap('KeyK'); const full = S().items.medkit;
    const tip = recipes(g).find((r) => r.id === 'medkit').use; const claim = +/heal (\d+)/.exec(tip)[1];
    return (near(a, 20 + claim, 0.01) && claim === 50 && left === 1 && full === 1) || `hp ${a}, claim ${claim}, medkits ${left}/${full}`;
  });

  await T('truth.world.keys-u-rolls-out-parks-and-calls-the-cart-as-its-hint-says', async () => {
    fresh(WORLD_UP()); craft('cart:1'); p().pos.set(0, 0, 2); p().yaw = 0; const bad = [];
    io.clearHint(); io.tap('KeyU'); const c = S().cart; if (!c) return 'U did not roll the cart out'; if (c.mode !== 'follow') bad.push('a new cart does not follow'); if (S().items['cart:1']) bad.push('rolling it out kept the item in the pack');
    io.tap('KeyU'); if (c.mode !== 'stay') bad.push('U did not park it'); if (!/U makes it follow again/.test(io.hint())) bad.push('parked hint: ' + io.hint()); io.tap('KeyU'); if (c.mode !== 'follow') bad.push('U did not make it follow again'); if (!/U parks it, X next to it stows it when empty/.test(io.hint())) bad.push('follow hint: ' + io.hint());
    c.mode = 'stay'; c.x = p().pos.x + 12; c.z = p().pos.z; io.tap('KeyU'); if (c.mode !== 'follow') bad.push('U from far away did not call it back');
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-x-next-to-the-cart-stows-it-when-empty-and-u-does-not', async () => {
    fresh(WORLD_UP()); craft('cart:1'); p().pos.set(0, 0, 2); p().yaw = Math.PI; p().pitch = 0; g.useCart(); const c = S().cart; c.mode = 'stay'; c.x = p().pos.x + 1.8; c.z = p().pos.z + 0.4; c.y = 0; adv(0.1); const bad = [];
    c.load.push({ sp: 2, vr: 0 }); io.clearHint(); io.tap('KeyX'); if (!S().cart) bad.push('X stowed a cart that still had plush in it'); if (!/Empty the cart first/.test(io.hint())) bad.push('no "Empty the cart first" message: ' + io.hint());
    c.load.length = 0; io.tap('KeyX'); if (S().cart || S().items['cart:1'] !== 1) bad.push('X next to the empty cart (looking away from it) did not stow it');
    g.useCart(); const c2 = S().cart; c2.mode = 'stay'; c2.x = p().pos.x + 1.8; c2.z = p().pos.z; adv(0.1); io.tap('KeyU'); io.tap('KeyU'); io.tap('KeyU'); if (!S().cart) bad.push('U stowed the cart (the chalkboard says "cart out / stow")');
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.hammer-click-on-the-cart-stows-it-like-the-cart-readout-says', async () => {
    fresh(WORLD_UP()); craft('cart:1'); g.useCart(); const c = S().cart; c.mode = 'stay'; p().pos.set(0, 0, 2); p().yaw = 0; p().pitch = 0; const f = p().forward(new V3()); c.x = p().pos.x + f.x * 2; c.z = p().pos.z + f.z * 2; c.y = 0; adv(0.1);
    selectTool('hammer'); adv(0.1); const ref = findInfoRef(g); const lines = ref && infoFor(g, ref); const txt = lines ? lines.lines.join(' ') : '';
    io.click(0); adv(0.05); const stowed = !S().cart && S().items['cart:1'] === 1; return (stowed && /hammer it to stow/.test(txt)) || `readout "${txt}", stowed ${stowed}`;
  });

  await T('truth.world.keys-hold-h-for-2.5-s-recalls-to-the-nearest-depot', async () => {
    fresh(WORLD_UP()); const claim = +/(\d+(?:\.\d+)?) seconds/.exec(CONTROLS.flatMap((gr) => gr.rows).find((r) => r.keys.includes('H')).what)[1];
    { const ci = ctx.toI(6), ck = ctx.toK(-9); for (let di = -3; di <= 3; di++) for (let dk = -3; dk <= 3; dk++) for (let j = 0; j < 5; j++) ctx.w().removeCell(ci + di, j, ck + dk, false); }
    const r = await placeAtFloor('beacon', 6, -9, 2.2); if (!r.ok) return 'no depot: ' + r.why; g.stowed = true; const bc = [...g.machines.items.values()].find((x) => x.ent.type === 'beacon');
    p().pos.set(8, 0, -9); p().vel.set(0, 0, 0); const bay = Math.hypot(8, -9 + 1.4); io.down('KeyH'); adv(claim - 0.3); const early = Math.hypot(p().pos.x - 8, p().pos.z + 9) < 0.5; adv(0.6); io.up('KeyH');
    const dBeacon = Math.hypot(p().pos.x - 6, p().pos.z + 9), dBay = Math.hypot(p().pos.x, p().pos.z + 1.4);
    g.doDecon({ kind: 'mach', id: bc.ent.id });   // a placed depot reserves its cells: take it down again so the next run can place one
    return (early && dBeacon < 3 && dBay > 6 && claim === 2.5) || `claim ${claim}, stayed put early ${early}, ends ${dBeacon.toFixed(1)} m from the depot and ${dBay.toFixed(1)} from the bay (bay was ${bay.toFixed(1)})`;
  });
}