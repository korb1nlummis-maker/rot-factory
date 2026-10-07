// transit.*: jump pads and cushion pads (wave 5, spec 4.6). The real Player steps through every flight, so "lands where previewed" is measured, not assumed.
import { kit } from './transit_lib.js';
import * as TR from '../transit.js';
import * as EXT from '../ext.js';
import { infoFor } from '../info.js';
import { PAD } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, adv, craft, selectTool, plan, toI, toK, cellX, cellZ, V3 } = ctx;
  const X = kit(ctx), K = X.K;
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { X.clean(); } });
  const JI = () => toI(-12), JK = () => toK(2);
  // a pad with a pole 2.6 m to its west and two generators; you stand far away
  const rig = (o = {}) => {
    X.setup(); const J = X.jump(JI(), JK(), { ang: o.ang ?? 45, hd: o.hd ?? 0 });
    const G = o.power === false ? null : X.powerAt(J.x - 2.6, J.z, 2);
    p().pos.set(J.x - 8, 0, J.z - 8); p().vel.set(0, 0, 0); g.keys = {}; adv(0.7); g.hp = 100; g.hpMax = 100; g.dead = false;
    return { J, G };
  };
  const stand = (J, dx = 0, dz = 0) => { p().pos.set(J.x + dx, J.y, J.z + dz); p().vel.set(0, 0, 0); p().onGround = true; p().flight = 0; p().launched = false; p().launchLock = 0; };
  // launch the host player from the pad the real way (the host tick) and fly them with the real Player until they touch down. Returns the landing and the numbers on the way.
  const fly = (J, o = {}) => {
    stand(J, o.dx || 0, o.dz || 0); TR.hostTick(g, 1 / 60); if (!p().flight) return { launched: false };
    const v0 = p().vel.clone(), speeds = []; let n = 0, land = null;
    const done = X.stepPlayer(8, 1 / 60, (q) => { n = q; speeds.push(Math.hypot(p().vel.x, p().vel.z)); if (q > 5 && p().onGround) { land = { x: p().pos.x, y: p().pos.y, z: p().pos.z, t: (q + 1) / 60 }; return true; } return false; });
    void done; return { launched: true, v0, land, speeds };
  };

  await guard('transit.jump-buffer-five-then-cooldown', async () => {
    const { J, G } = rig(); const bad = [];
    if (J.buf !== 5 || J.cool !== 0 || !(J.pw > 0.99)) bad.push(`start: buf ${J.buf} cool ${J.cool} pw ${J.pw}`);
    if (TR.kwOf(J) !== 0.1) bad.push('standby draw ' + TR.kwOf(J)); const net = X.P.netOf(G.pole); if (!(net && net.demand > 0.09 && net.demand < 0.12)) bad.push('standby grid demand ' + (net && net.demand));
    const res = []; for (let q = 0; q < 6; q++) res.push(TR.fireJump(g, J));
    if (res.slice(0, 5).some((r) => r !== null)) bad.push('the first five launches: ' + JSON.stringify(res)); if (!/recharging/.test(res[5] || '')) bad.push('the sixth launch was not refused: ' + res[5]);
    if (J.buf !== 0 || J.cool !== 22) bad.push(`after five: buf ${J.buf} cool ${J.cool}`);
    if (TR.kwOf(J) !== 6) bad.push('active draw ' + TR.kwOf(J)); adv(0.2); const net2 = X.P.netOf(G.pole); if (!(net2 && net2.demand > 5.9 && net2.demand < 6.2)) bad.push('active grid demand ' + (net2 && net2.demand));
    adv(10); if (!(J.cool > 11.5 && J.cool < 12.2) || J.buf !== 0) bad.push(`10 s into the cooldown: cool ${J.cool.toFixed(2)} buf ${J.buf}`); if (!/recharging/.test(TR.fireJump(g, J) || '')) bad.push('fired during the cooldown');
    adv(12.4); if (J.buf !== 5 || J.cool !== 0) bad.push(`after 22 s: buf ${J.buf} cool ${J.cool}`); if (TR.kwOf(J) !== 0.1) bad.push('standby draw after recharge ' + TR.kwOf(J));
    // a pad that is not empty gets its charges back one at a time (22 s over 5)
    TR.fireJump(g, J); TR.fireJump(g, J); adv(0.1); if (J.buf !== 3 || J.cool !== 0) bad.push(`two shots: buf ${J.buf} cool ${J.cool}`); adv(4.6); if (J.buf !== 4) bad.push('one charge back after 4.4 s: buf ' + J.buf); adv(4.6); if (J.buf !== 5) bad.push('both back after 8.8 s: buf ' + J.buf);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.jump-needs-power-and-can-be-switched-off', async () => {
    const { J } = rig({ power: false }); const bad = [];
    if (!/no power/.test(TR.fireJump(g, J) || '')) bad.push('fired with no power'); stand(J); TR.hostTick(g, 1 / 60); if (p().flight || p().launched) bad.push('a player was thrown by an unpowered pad'); if (J.buf !== 5) bad.push('a charge was spent with no power');
    p().pos.set(J.x - 8, 0, J.z - 8); X.powerAt(J.x - 2.6, J.z, 2); adv(0.8); if (!(J.pw > 0.99)) return 'setup: pw ' + J.pw;
    g.setCfg(J, { on: false }); if (!/switched off/.test(TR.fireJump(g, J) || '') || TR.kwOf(J) !== 0) bad.push('an off pad fired or draws ' + TR.kwOf(J)); stand(J); TR.hostTick(g, 1 / 60); if (p().flight) bad.push('an off pad threw a player');
    g.setCfg(J, { on: true }); stand(J); TR.hostTick(g, 1 / 60); if (!p().flight || J.buf !== 4) bad.push('a powered pad did not throw: flight ' + p().flight + ' buf ' + J.buf);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.jump-launch-velocity-and-flight-keep-their-momentum', async () => {
    const { J } = rig({ ang: 60, hd: 90 }); const bad = [];
    const r = fly(J); if (!r.launched) return 'no launch';
    const want = TR.launchVel(J), v = r.v0;
    if (Math.abs(v.x - want.vx) > 1e-9 || Math.abs(v.y - want.vy) > 1e-9 || Math.abs(v.z - want.vz) > 1e-9) bad.push(`launch ${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)} want ${want.vx.toFixed(3)},${want.vy.toFixed(3)},${want.vz.toFixed(3)}`);
    if (Math.abs(Math.hypot(want.vx, want.vy, want.vz) - 12) > 1e-9) bad.push('speed is not 12 m/s: ' + Math.hypot(want.vx, want.vy, want.vz)); if (!(want.vx > 5.9 && want.vx < 6.1 && Math.abs(want.vz) < 1e-9)) bad.push('60 degrees heading 90 should be 6 m/s east: ' + want.vx + ',' + want.vz);
    // no input: the sideways speed never changes until the feet touch down
    const air = r.speeds.slice(0, Math.max(1, r.speeds.length - 3)), spread = Math.max(...air) - Math.min(...air); if (spread > 1e-6) bad.push('sideways speed changed in flight by ' + spread);
    // steering: holding left bends it a little, never a lot
    stand(J); TR.hostTick(g, 1 / 60); const vx0 = p().vel.x, vz0 = p().vel.z; p().yaw = 0; for (let q = 0; q < 30; q++) { g.time += 1 / 60; p().update(1 / 60, { ...X.inputs(), right: 1 }, X.stats(), g.sim); }
    const dvz = p().vel.z - vz0, dvx = p().vel.x - vx0; if (!(Math.abs(dvx) < 2.2 && Math.abs(dvz) < 2.2 && Math.hypot(dvx, dvz) > 1.5)) bad.push(`half a second of steering changed the velocity by ${dvx.toFixed(2)}, ${dvz.toFixed(2)} (want about 2 m/s)`);
    // normal walking is as it was: on the ground the player still stops quickly and a walking jump is unchanged
    p().flight = 0; p().launched = false; stand(J, 0, -5); X.stepPlayer(0.3); if (Math.hypot(p().vel.x, p().vel.z) > 0.01) bad.push('a standing player is sliding: ' + Math.hypot(p().vel.x, p().vel.z));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.jump-trajectory-lands-where-previewed', async () => {
    const bad = [], cases = [[45, 0], [30, 90], [60, 200], [75, 330], [10, 45], [90, 0], [0, 270], [5, 135]];
    for (const [ang, hd] of cases) {
      const { J } = rig({ ang, hd }); const tr = TR.trajectory(g, J), r = fly(J);
      if (!r.launched || !r.land) { bad.push(`${ang}/${hd}: no landing`); X.clean(); continue; }
      const e = Math.hypot(r.land.x - tr.land.x, r.land.z - tr.land.z), et = Math.abs(r.land.t - tr.t);
      if (e > 0.6) bad.push(`${ang} degrees heading ${hd}: landed ${e.toFixed(2)} m from the preview (preview ${tr.land.x.toFixed(2)},${tr.land.z.toFixed(2)} real ${r.land.x.toFixed(2)},${r.land.z.toFixed(2)})`);
      if (et > 0.12) bad.push(`${ang}/${hd}: flight time ${r.land.t.toFixed(2)} s, preview ${tr.t.toFixed(2)} s`); if (tr.hit !== 'floor' && tr.hit !== 'ground') bad.push(`${ang}/${hd}: preview ended on ${tr.hit}`);
      if (Math.abs(tr.range - Math.hypot(tr.land.x - J.x, tr.land.z - J.z)) > 1e-9) bad.push('range ' + tr.range);
      // the preview points start on the pad and end at the landing
      const f = tr.pts[0], l = tr.pts[tr.pts.length - 1]; if (Math.hypot(f[0] - J.x, f[2] - J.z) > 0.01 || Math.abs(l[0] - tr.land.x) > 1e-9) bad.push('preview points do not run from the pad to the landing');
      X.clean(); if (bad.length > 6) break;
    }
    // a wall in the way ends the preview there, and the player really stops against it
    const { J } = rig({ ang: 20, hd: 90 }); for (let j = 0; j < 6; j++) for (let dz = -3; dz <= 3; dz++) w().setCell(toI(J.x) + 5, j, toK(J.z) + dz, 4098, 0);
    const tr = TR.trajectory(g, J); if (tr.hit !== 'wall' || tr.land.x > J.x + 3.6) bad.push('a wall 3 m ahead: preview ' + tr.hit + ' at ' + (tr.land.x - J.x).toFixed(2));
    for (let j = 0; j < 6; j++) for (let dz = -3; dz <= 3; dz++) w().setCell(toI(J.x) + 5, j, toK(J.z) + dz, 0, 0);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.jump-no-fall-damage-on-a-cushion-a-pad-or-the-pile', async () => {
    const { J } = rig(); const bad = [], H = 9.5;   // 9.5 m is about 20 m/s on landing: 40 points of damage on a hard floor
    const drop = (x, z, o = {}) => { g.hp = 100; g.dead = false; p().pos.set(x, o.y ?? H, z); p().vel.set(0, 0, 0); p().onGround = false; p().flight = 0; p().launched = !!o.launched; p().liftId = 0; X.stepPlayer(2.0); return 100 - g.hp; };
    const hard = drop(J.x + 8, J.z); if (!(hard > 30 && hard < 50)) bad.push('a bare floor landing hurt ' + hard.toFixed(1) + ', want about 40');
    const hardLaunched = drop(J.x + 8, J.z, { launched: true }); if (!(hardLaunched > 30)) bad.push('a launched player on a bare floor was not hurt: ' + hardLaunched.toFixed(1));
    // a cushion pad: any fall, launched or not
    const C0 = X.cushion(toI(J.x + 14), toK(J.z) - 2, 0); if (drop(C0.x, C0.z) !== 0) bad.push('a fall onto a Cushion Pad hurt'); if (drop(C0.x + 0.9, C0.z - 0.9, { launched: true }) !== 0) bad.push('a launched fall onto the edge of a Cushion Pad hurt'); if (drop(C0.x + 3, C0.z) < 30) bad.push('a fall just beside the cushion did not hurt');
    // the pile: soft after a launch only (an ordinary fall into plush is as it was)
    const pi = toI(J.x) + 20, pk = toK(J.z); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let j = 0; j < 3; j++) w().setCell(pi + a, j, pk + b, 2 + ((a + b + j) & 3), 0);
    const px = cellX(pi), pz = cellZ(pk); const soft = drop(px, pz, { launched: true, y: H + 1.8 }); if (soft !== 0) bad.push('a launched fall into the plush pile hurt: ' + soft.toFixed(1));
    const plain = drop(px, pz, { launched: false, y: H + 1.8 }); if (!(plain > 30)) bad.push('an ordinary fall into the pile changed: ' + plain.toFixed(1) + ' (it must stay as it was)');
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let j = 0; j < 3; j++) w().setCell(pi + a, j, pk + b, 0, 0);
    // another jump pad: soft after a launch, hard if you simply fell
    const J2 = X.jump(toI(J.x + 14), toK(J.z) + 4, { ang: 45 }); const onPad = drop(J2.x, J2.z, { launched: true }); if (onPad !== 0) bad.push('a launched landing on a Jump Pad hurt: ' + onPad.toFixed(1));
    // a floor pad and a catwalk stay hard
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) w().setCell(toI(J.x) - 12 + a, 0, toK(J.z) - 6 + b, PAD, 1); const fx = cellX(toI(J.x) - 10), fz = cellZ(toK(J.z) - 4);
    const hardPad = drop(fx, fz, { y: 0.6 + H, launched: true }); if (!(hardPad > 30)) bad.push('a launched fall onto a floor pad was soft: ' + hardPad.toFixed(1));
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) w().setCell(toI(J.x) - 12 + a, 0, toK(J.z) - 6 + b, 0, 0);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.jump-angle-heading-and-the-keys', async () => {
    const { J } = rig(); const bad = [];
    for (const [patch, ok] of [[{ ang: 50 }, true], [{ ang: 90 }, true], [{ ang: 0 }, true], [{ ang: 7 }, false], [{ ang: 95 }, false], [{ ang: -5 }, false], [{ ang: 45.5 }, false], [{ ang: '45' }, false], [{ hd: 15 }, true], [{ hd: 345 }, true], [{ hd: 10 }, false], [{ hd: 360 }, false], [{ on: false }, true], [{ on: 'no' }, false], [{ buf: 9 }, false], [{ cool: 0 }, false], [{ ang: 30, hd: 12 }, false]]) {
      const before = JSON.stringify([J.ang, J.hd, J.on]); const r = g.setCfg(J, patch); if (!!r.ok !== ok) bad.push(`${JSON.stringify(patch)} ${r.ok ? 'was accepted' : 'was refused: ' + r.why}`);
      if (!ok && JSON.stringify([J.ang, J.hd, J.on]) !== before) bad.push(JSON.stringify(patch) + ' changed the pad although it was refused'); g.setCfg(J, { on: true });
    }
    g.setCfg(J, { ang: 85, hd: 345 }); TR.useJump(g, J, false); if (J.ang !== 90) bad.push('E from 85 gave ' + J.ang); TR.useJump(g, J, false); if (J.ang !== 0) bad.push('E from 90 should wrap to 0, got ' + J.ang);
    TR.useJump(g, J, true); if (J.hd !== 0) bad.push('crouch + E from 345 should wrap to 0, got ' + J.hd); TR.useJump(g, J, true); if (J.hd !== 15) bad.push('crouch + E from 0 gave ' + J.hd); if (J.ang !== 0) bad.push('turning changed the angle');
    // - and = before placing; R turns the heading
    selectTool('hammer'); g.stowed = false; craft('jump', 1); K.equip('jump'); const tool = g.curTool(); g._jang = undefined;
    TR.zoopKey(g, tool, 1); if (g._jang !== 50) bad.push('= from the default gave ' + g._jang); for (let q = 0; q < 30; q++) TR.zoopKey(g, tool, 1); if (g._jang !== 90) bad.push('the angle runs past 90: ' + g._jang); for (let q = 0; q < 30; q++) TR.zoopKey(g, tool, -1); if (g._jang !== 0) bad.push('the angle runs below 0: ' + g._jang);
    if (TR.zoopKey(g, { kind: 'pad' }, 1)) bad.push('the pad zoop key was taken'); if (TR.rotateKey(g, { kind: 'belt' }, false)) bad.push('R was taken from a belt');
    g._jr = 0; TR.rotateKey(g, tool, false); if (g._jr !== 1) bad.push('R did not turn it'); TR.rotateKey(g, tool, true); TR.rotateKey(g, tool, true); if (g._jr !== 23) bad.push('Shift+R wraps to ' + g._jr);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.jump-places-with-a-path-preview-and-a-readout', async () => {
    X.setup(); X.powerAt(cellX(JI()) - 2.6, cellZ(JK()), 2); const bad = [], i = JI(), k = JK();
    g._jang = 60; g._jr = 0; craft('jump', 1); K.equip('jump'); K.aim(i, k, { y: 0.0, back: 3.0, yaw: Math.PI / 2 }); p().yaw = Math.PI / 2;
    const pl = await plan(); if (!pl.ok) return 'plan: ' + pl.why; const e = pl.ent;
    if (e.ang !== 60 || e.hd !== 90 || e.i0 !== i - 1 || e.k0 !== k - 1 || e.j !== 0) bad.push('plan ent ' + JSON.stringify(e));
    const gh = g.machines.ghost; let line = null; if (gh) gh.traverse((c) => { if (c.isLine) line = c; }); if (!line || line.geometry.drawRange.count < 10) bad.push('the placement ghost has no path line');
    if (!/degrees up, facing 90/.test(g._xInfo.lines.join(' ')) || !/Lands \d+\.\d m away/.test(g._xInfo.lines.join(' '))) bad.push('placement readout ' + JSON.stringify(g._xInfo));
    g.placeCurrent(g.curTool()); const J = X.ents('jump')[0]; if (!J || J.ang !== 60 || J.hd !== 90 || J.buf !== 5 || J.on !== true || J.rid !== 'jump') return 'placed ' + JSON.stringify(J);
    if (S().items.jump) bad.push('item not used');
    for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) if (!X.reservedAt(J.i0 + dx, 0, J.k0 + dz)) { bad.push('footprint not reserved'); break; }
    // aim at it with nothing in hand: the readout and the path line follow your crosshair
    g.stowed = true; selectTool('hammer'); K.aim(i, k, { y: 0.1, back: 2.8 }); adv(0.1); TR.lineTick(g);
    const inf = infoFor(g, { kind: 'mach', id: J.id }); const lines = inf.lines.join(' | '); const tr = TR.trajectory(g, J);
    if (!/^JUMP PAD · READY/.test(inf.title) || !lines.includes(`60 degrees up, facing 90 degrees`) || !lines.includes(`Lands ${tr.range.toFixed(1)} m away`) || !/Charges 5 of 5/.test(lines) || !/0\.1 kW standing by, 6 kW/.test(lines)) bad.push('readout ' + inf.title + ' ' + lines);
    if (/[—–]|undefined|NaN/.test(inf.title + lines)) bad.push('bad text');
    if (!TR.TS.line || !TR.TS.line.visible || TR.TS.line.userData.line.geometry.drawRange.count < 10) bad.push('no path line while aiming at the pad'); p().pos.set(J.x + 9, 0, J.z + 9); p().yaw = 0; g.renderer.camera.position.copy(p().eyePos(new V3())); TR.lineTick(g); if (TR.TS.line.visible) bad.push('the path line stays on when you look away');
    // refusals: plush in the space above, no ground
    g.stowed = false; craft('jump', 1); K.equip('jump'); const j0 = toI(J.x + 8); K.aim(j0, k, { y: 0.0, back: 3.0 }); w().setCell(j0, 2, k, 2, 0); const p2 = await plan(); if (p2.ok || !/Dig out 1/.test(p2.why)) bad.push('plush above: ' + (p2.ok ? 'ok' : p2.why)); w().setCell(j0, 2, k, 0, 0);
    if (!/No ground/.test(TR.flatCheck(g, { i0: j0, k0: k, j: 9 }, 3) || '')) bad.push('a pad in the air was allowed');
    // the host re-checks what a guest sends
    for (const [name, ee] of [['angle 7', { i0: j0, k0: k, j: 0, ang: 7 }], ['heading 10', { i0: j0, k0: k, j: 0, hd: 10 }], ['float', { i0: 1.5, k0: k, j: 0 }], ['taken', { i0: J.i0, k0: J.k0, j: 0 }], ['nothing', null]]) if (!TR.conflictJump(g, ee)) bad.push(name + ' was allowed');
    const made = TR.buildJump(g, { id: 'jump', kind: 'jump' }, { i0: j0, k0: k, j: 0, ang: 35, hd: 120, buf: 99, cool: 5, on: false }); if (!made || made.ang !== 35 || made.hd !== 120 || made.buf !== 5 || made.cool !== 0 || made.on !== true) bad.push('built from a message: ' + JSON.stringify(made));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.jump-does-not-throw-carts-or-trucks', async () => {
    const { J } = rig(); const bad = [];
    S().cart = { tier: 1, x: J.x, y: 0, z: J.z, yaw: 0, mode: 'park', load: [] }; g.cart.sync(); stand(J, 5, 5); p().pos.set(J.x + 8, 0, J.z + 8); for (let q = 0; q < 30; q++) TR.hostTick(g, 1 / 60); adv(0.5);
    if (J.buf !== 5) bad.push('a cart on the pad spent a charge'); if (Math.abs(S().cart.x - J.x) > 0.01 || S().cart.y > 0.05) bad.push('the cart moved: ' + JSON.stringify([S().cart.x - J.x, S().cart.y])); if (TR.launchesTrucks(g)) bad.push('trucks are launched'); g.T.jumpTrucks = true; if (!TR.launchesTrucks(g)) bad.push('the T.jumpTrucks switch is ignored'); delete g.T.jumpTrucks;
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.cushion-pad-places-readout-hammer-and-save-load', async () => {
    X.setup(); const bad = [], i = JI(), k = JK();
    const r = await K.put('cushion', i, k, { y: 0.0, back: 3.0 }); if (!r.ok) return 'cushion: ' + r.why; const C0 = r.made[0];
    if (C0.type !== 'cushion' || C0.i0 !== i - 1 || C0.k0 !== k - 1 || C0.j !== 0 || C0.rid !== 'cushion') bad.push('ent ' + JSON.stringify(C0));
    const inf = infoFor(g, { kind: 'mach', id: C0.id }); if (!inf || inf.title !== 'CUSHION PAD' || !/never hurts/.test(inf.lines.join(' '))) bad.push('readout ' + JSON.stringify(inf));
    const again = await K.put('cushion', i, k, { y: 0.0, back: 3.0 }); if (again.ok) bad.push('a second cushion on the first');
    const saved = JSON.parse(JSON.stringify(C0)); X.decon(C0); if (S().items.cushion !== 2 || X.reservedAt(C0.i0, 0, C0.k0)) bad.push('hammer: ' + JSON.stringify(S().items));
    S().entities.push(saved); g.addEntity(saved); const C1 = g.machines.items.get(saved.id).ent; if (!X.reservedAt(C1.i0, 0, C1.k0) || C1.y !== 0 || C1.x === undefined) bad.push('loaded ' + JSON.stringify({ x: C1.x, y: C1.y }));
    // a jump pad from an old save (only the corner and the row) gets the defaults
    const old = { id: g.nextId(), type: 'jump', i0: i + 12, k0: k, j: 0 }; S().entities.push(old); g.addEntity(old); const O = g.machines.items.get(old.id).ent; if (O.ang !== 45 || O.hd !== 0 || O.buf !== 5 || O.cool !== 0 || O.on !== true) bad.push('old save defaults ' + JSON.stringify({ ang: O.ang, hd: O.hd, buf: O.buf, on: O.on }));
    const junk = { id: g.nextId(), type: 'jump', i0: i + 20, k0: k, j: 0, ang: 47, hd: 13, buf: 99, cool: -4 }; S().entities.push(junk); g.addEntity(junk); const J2 = g.machines.items.get(junk.id).ent; if (J2.ang % 5 || J2.hd % 15 || J2.buf !== 5 || J2.cool !== 0) bad.push('junk normalized to ' + JSON.stringify({ ang: J2.ang, hd: J2.hd, buf: J2.buf, cool: J2.cool }));
    return bad.length === 0 || bad.join(' || ');
  });
}
