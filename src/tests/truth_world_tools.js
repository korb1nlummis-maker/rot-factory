// In-world keys, part 10: the hammer (click and its readout), X on a power cable, B for a Support Fan, the Detector Gate's E, and T's direction word.
import { makeKit, ALL_UP } from './addons_lib.js';
import { makeKit as makePowerKit, UP as POWER_UP } from './power_lib.js';
import { NEEDLE } from '../plushdata.js';
import { makeIO, clearBay } from './truth_world_lib.js';
export default async function (ctx) {
  const { T, g, S, p, L, fresh, adv, craft, selectTool, aimPoint, cellX, cellZ, toI, toK, V3 } = ctx;
  const K = makeKit(ctx);
  const io = makeIO(ctx);
  const guard = (name, fn) => T(name, async () => { const f0 = g.foundNeedle; try { return await fn(); } finally { g.foundNeedle = f0; g.keys = {}; g.stowed = true; g.alarmGate = null; g.cables.cancel(); } });
  const look = (x, y, z, back = 2.0) => { aimPoint(x, y, z, back); adv(0.06); };
  const frame = (x, z, extra = {}) => { const e = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'z', cx: x, cz: z, y0: 0, w: 2.38, h: 2.38, yaw: 0, ...extra }; S().entities.push(e); g.addEntity(e); return e; };

  await guard('truth.world.keys-the-hammer-click-takes-down-what-you-aim-at-and-gives-it-back-and-the-readout-says-so', async () => {
    fresh(ALL_UP); clearBay(ctx); const bad = []; const r = await K.put('belt', { x: -6.6, z: 1.2, dir: 1 }); if (!r.ok) return r.why; const n0 = S().items.belt || 0;
    selectTool('hammer'); look(cellX(r.ent.i), 0.1, cellZ(r.ent.k), 1.6); if (!/Click: knock down <b>BELT|Click: knock down Belt/i.test(io.hintHtml().replace(/<\/?b>/g, '')) && !/knock down/i.test(io.hint())) bad.push('hammer hint: ' + io.hint());
    io.click(0); adv(0.05); if (S().entities.some((e) => e.id === r.ent.id) || (S().items.belt || 0) !== n0 + 1) bad.push('a click with the hammer did not take the belt down and give it back');
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-aiming-the-hammer-at-a-support-reads-its-load-as-the-tunnel-craft-board-says', async () => {
    fresh(ALL_UP); clearBay(ctx); const bad = []; const fe = g.machines.frameEnt('x', 'timber', toI(-8), toK(3), 0); delete fe.clear; const f = { id: g.nextId(), type: 'frame', ...fe }; S().entities.push(f); g.addEntity(f); adv(0.5); for (let n = 0; n < 40; n++) { g.updateLoads && g.updateLoads(0.5); adv(0.1); }
    selectTool('hammer'); look(f.cx - 1.1, 1.0, f.cz - 1.1, 2.0); const h = io.hint(); if (!/Click: knock down/.test(h)) bad.push('hammer hint: ' + h); if (!/load \d+%/.test(h)) bad.push('the hammer readout does not show the load: ' + h);
    g.doDecon({ kind: 'mach', id: f.id });
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-x-and-the-hammer-take-a-power-cable-down-and-give-the-cable-back', async () => {
    const P = makePowerKit(ctx); P.reset(POWER_UP, false); const bad = []; const a = P.pole(-9, 3), b = P.pole(-9, 8); S().items.cable = 1; const r = P.wire(a, b); S().items.cable = 0; if (!r.ok) return 'wire: ' + r.why;
    const pa = g.cables.attach(a), pb = g.cables.attach(b), pts = g.cables.curve(pa, pb), mid = pts[pts.length >> 1];   // the wire sags in the middle g.stowed = true; g.rebuildTools();
    // the readout of the wire says "Hammer it, or press X"
    look(mid[0], mid[1], mid[2], 2.0); const c = g.cables.list()[0]; if (!c) return 'no cable'; const ref = g.cables.hit(g.renderer.camera.position, p().forward(new V3()), 4.5); if (!ref) return 'the aim does not hit the wire (' + p().pos.x.toFixed(1) + ')';
    io.tap('KeyX'); adv(0.1); if (g.cables.list().length || S().items.cable !== 1) bad.push('X did not take the cable down: ' + g.cables.list().length + ' cables, ' + S().items.cable + ' in the pack');
    S().items.cable = 1; P.wire(a, b); S().items.cable = 0; selectTool('hammer'); look(mid[0], mid[1], mid[2], 2.0); io.click(0); adv(0.1); if (g.cables.list().length || S().items.cable !== 1) bad.push('the hammer did not take the cable down');
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-b-clamps-a-support-fan-under-the-aimed-frame-blowing-the-way-you-face', async () => {
    fresh({ ...ALL_UP, mfan: 1, fans: 1 }); clearBay(ctx); const bad = []; const f = frame(-8, 3, { axis: 'z' }); craft('mfan'); selectTool('mfan');
    p().pos.set(f.cx, 0, f.cz - 4.0); p().vel.set(0, 0, 0); p().yaw = 0; { const e = p().eyePos(new V3()); p().pitch = Math.atan2(f.y0 + f.h - 0.3 - e.y, 4.0); } adv(0.1); const n0 = S().entities.length; io.clearHint(); io.tap('KeyB'); adv(0.1);
    const fan = [...L().tiles.values()].find((t) => t.type === 'fan' && t.mounted && t.frameId === f.id); if (!fan) return 'B did not clamp a fan under the frame (' + io.hint() + ')'; if (S().entities.length !== n0 + 1) bad.push('entities ' + (S().entities.length - n0));
    if (!(fan.fz > 0.9)) bad.push(`the fan blows (${fan.fx.toFixed(2)}, ${fan.fz.toFixed(2)}), not the way I faced (+z)`);
    // one per frame
    craft('mfan'); selectTool('mfan'); p().pos.set(f.cx, 0, f.cz - 4.0); adv(0.1); const pl = await ctx.plan(); if (pl && pl.ok) bad.push('a second fan was offered for the same frame');
    g.doDecon({ kind: 'tile', id: fan.id }); g.doDecon({ kind: 'mach', id: f.id });
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-e-on-a-detector-gate-that-holds-the-one-takes-it-and-on-a-quiet-one-says-all-clear', async () => {
    fresh(ALL_UP); clearBay(ctx); const bad = []; let won = 0; g.foundNeedle = () => { won++; };
    const r = await K.put('gate', { x: -8.4, z: 7.2, dir: 2 }); if (!r.ok) return 'gate: ' + r.why; const t = L().byId.get(r.ent.id);
    look(cellX(t.i), 0.5, cellZ(t.k), 1.8); io.clearHint(); io.tap('KeyE'); if (!/all clear/.test(io.hint())) bad.push('quiet gate: ' + io.hint());
    t.alarm = true; t.held = { sp: NEEDLE, vr: 0 }; g.logi.setGate && g.logi.setGate(t, true); io.tap('KeyE'); adv(0.1); if (!won && t.held) bad.push('E did not take The One out of the alarmed gate');
    g.doDecon({ kind: 'tile', id: t.id });
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-t-sends-the-crew-the-way-you-face-and-names-the-compass-direction', async () => {
    fresh(ALL_UP); clearBay(ctx); const bad = []; g.crew.spawn();
    for (const [yaw, word] of [[Math.PI / 2, 'east'], [0, 'south'], [-Math.PI / 2, 'west'], [Math.PI, 'north']]) {
      p().pos.set(-6, 0, 2); p().vel.set(0, 0, 0); p().yaw = yaw; p().pitch = 0; adv(0.06); io.clearHint(); io.tap('KeyT'); const h = io.hint(); const fw = p().forward(new V3()); const hdg = ((Math.atan2(fw.x, -fw.z) * 180 / Math.PI) + 360) % 360, compass = ['north', 'east', 'south', 'west'][Math.round(hdg / 90) % 4];
      if (!(h.includes(word) || /No pile/.test(h)) || compass !== word) bad.push(`facing ${compass} on the compass: T said "${h}"`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  // hold B and walk: belts (belts test), bulkheads, haul road plates and Mine Rail all lay a line as you go, X takes a road plate up
  await guard('truth.world.keys-hold-b-and-walk-lays-bulkheads-road-plates-and-rail-and-x-takes-a-road-plate-up', async () => {
    const all = Object.fromEntries(ctx.UPGRADES.map((u) => [u.id, u.max])); fresh(all); S().money = 1e13; clearBay(ctx); const bad = [];
    const clear = () => { const c = ctx.w(); for (let di = -4; di <= 24; di++) for (let dk = -6; dk <= 6; dk++) for (let j = 0; j < 9; j++) if (c.get(toI(-12) + di, j, toK(0) + dk)) c.removeCell(toI(-12) + di, j, toK(0) + dk, false); };
    for (const [id, kind, count] of [['bulk', 'bulk', (e0, c0) => ctx.w().get(toI(-12) + 3, 0, toK(0)) !== 0 || ctx.w().get(toI(-12) + 4, 0, toK(0)) !== 0], ['road', 'road', () => S().entities.filter((e) => e.type === 'road').length], ['rail', 'rail', () => S().entities.filter((e) => e.type === 'rail').length]]) {
      clear(); S().items = {}; S().hotbar = ['hammer', null, null, null, null, null, null, null, null]; g.rebuildTools(); craft(id, 12); selectTool(id); const i0 = toI(-12), k0 = toK(0);
      const n0 = id === 'bulk' ? 0 : count(); aimPoint(cellX(i0), 0.0, cellZ(k0), 2.0); adv(0.1); await ctx.plan(); io.down('KeyB');
      for (let s2 = 0; s2 < 14; s2++) { aimPoint(cellX(i0 + s2 * (id === 'road' ? 4 : 1)), 0.0, cellZ(k0), 2.0); adv(0.08); } io.up('KeyB'); adv(0.1);
      const laid = id === 'bulk' ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((d) => ctx.w().get(i0 + d, 0, k0) !== 0).length : count() - n0;
      if (laid < 3) bad.push(`holding B with ${id} in hand laid ${laid}`);
      if (id === 'road' && laid >= 2) { g.stowed = true; g.rebuildTools(); const r = S().entities.filter((e) => e.type === 'road')[1]; const have = S().items.road || 0; const x = r.x ?? cellX(r.i0), z = r.z ?? cellZ(r.k0); aimPoint(x, 0, z, 2.0); adv(0.1); io.tap('KeyX'); if (S().entities.filter((e) => e.type === 'road').length !== laid - 1 || (S().items.road || 0) !== have + 1) bad.push('X did not take one road plate up'); }
      for (const en of [...S().entities]) if (['road', 'rail'].includes(en.type)) g.doDecon({ kind: 'mach', id: en.id }); clear();
    }
    return bad.length === 0 || bad.join('; ');
  });

  // a wire chain through hanging lanterns, clicked the way the table says: generator to the first lantern, then that lantern to the next
  await guard('truth.world.keys-cable-clicks-chain-generator-to-lantern-to-lantern', async () => {
    const HL = await import('../hanglamp.js'); const P = makePowerKit(ctx); P.reset(POWER_UP, false); const bad = [];
    const gen = P.gen(-10, 8); const fr = [0, 1].map((q) => frame(-10 + q * 2.6, 3)); const ls = fr.map((f) => g.placeEntity('hlamp', HL.lampFields(f, 0), { quiet: true }));
    craft('cable'); S().items.cable = 5; selectTool('cable');
    const aimAtLamp = (l) => { aimPoint(l.x, l.y + 0.1, l.z, 1.8); adv(0.06); };
    const aimAtGen = () => { aimPoint(cellX(gen.i), 0.5, cellZ(gen.k), 1.8); adv(0.06); };
    aimAtGen(); io.click(0); aimAtLamp(ls[0]); io.click(0); if (!g.cables.find(gen.id, ls[0].id)) bad.push('generator to the first lantern did not connect: ' + io.hint());
    aimAtLamp(ls[0]); io.click(0); aimAtLamp(ls[1]); io.click(0); if (!g.cables.find(ls[0].id, ls[1].id)) bad.push('first lantern to the next did not connect: ' + io.hint());
    for (const l of ls) g.doDecon({ kind: 'mach', id: l.id }); for (const f of fr) g.doDecon({ kind: 'mach', id: f.id });
    return bad.length === 0 || bad.join('; ');
  });
}
