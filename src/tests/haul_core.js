import * as PD from '../plushdata.js';
// haul.*: the truck router, haul roads, truck docks, the truck battery (src/haul.js, the truck branch of src/earth.js). Run: `await __selftest('haul.')`
import { UP as UPX } from './portal_lib.js';
import { makeBeltKit, UP_BASE } from './belts_lib.js';
import * as HAUL from '../haul.js';
import { EARTH, STATES, earthRow, applyEarthRow, useEarth, earthTune } from '../earth.js';
import { recipes } from '../crafting.js';
import { infoFor } from '../info.js';

const UP = { ...UPX, ...UP_BASE, truck: 1, excavator: 1, haulRoad: 1, truckDock: 1 };
export default async function (ctx) {
  const { T, g, S, w, p, L, fresh, newWorld, toI, toK, cellX, cellZ, clearBodies, craft, selectTool, plan, placeNow, aimPoint, THREE } = ctx;
  const B = makeBeltKit(ctx), C = 0.6;
  const world = async (up = UP) => { await newWorld(); fresh(up); S().money = 1e13; g.surgeT = 1e9; clearBodies(); clearYard(); };
  const clearYard = () => { for (let i = toI(-52); i <= toI(8); i++) for (let k = toK(-26); k <= toK(18); k++) for (let j = 0, top = w().topAt(i, k); j < top; j++) if (w().get(i, j, k)) w().removeCell(i, j, k, false); };
  const wall = (x0, x1, z0, z1, rows = 8) => { for (let i = toI(x0); i <= toI(x1); i++) for (let k = toK(z0); k <= toK(z1); k++) for (let j = 0; j < rows; j++) w().setCell(i, j, k, 2, 0); };
  const mk = (type, i, k, extra = {}) => { const spec = EARTH[type]; const ent = { id: g.nextId(), type, i, j: 0, k, dx: -1, dz: 0, x: cellX(i), y: 0, z: cellZ(k), hy: spec.hy, hr: spec.hr, ...(spec.dig ? { hop: [], hn: 0, steps: 0, dug: 0, state: 'idle' } : { px: cellX(i), pz: cellZ(k), cargo: [], cn: 0, route: [], seg: 0, trips: 0, state: 'idle', job: 0, yaw: 0 }), ...extra }; S().entities.push(ent); g.addEntity(ent); return ent; };
  const run = (secs, dt = 0.1, each = null) => {
    for (let n = 0; n < secs / dt; n++) {
      for (const it of g.machines.items.values()) it.ent.pw = it.ent.off && it.ent.type !== 'truck' && it.ent.type !== 'excavator' ? 0 : 1;
      for (const q of L().tiles.values()) q.pw = 1;
      g.time += dt; g.machines.update(dt, g.time); HAUL.dockTick(g, dt); L().update(dt); if (each) each(n);
    }
  };
  const until = (cond, secs = 90, dt = 0.1) => { let t = 0; while (t < secs && !cond()) { run(dt, dt); t += dt; } return cond(); };
  const road = (i0, k0, j = 0) => g.placeEntity('road', { i0, k0, j }, { quiet: true, rebuild: false });
  const hop = (d, n = 120, sp = 3) => { const h = []; for (let q = 0; q < n; q++) h.push(sp, 0); d.hop = h; d.hn = n; };

  // ---------------------------------------------------------------- the router
  await T('haul.router-goes-around-a-wall-and-a-frame-and-says-so-when-there-is-no-way', async () => {
    await world(); const bad = [], A = { x: -44, z: 0, j: 0 }, Bp = { x: -10, z: 0, j: 0 };
    let r = HAUL.planRoute(g, A, Bp, HAUL.TRUCK); if (!r.ok || r.pts.length !== 2) bad.push('open ground: ' + JSON.stringify([r.ok, r.pts && r.pts.length]));
    wall(-28, -26, -26, 6); r = HAUL.planRoute(g, A, Bp, HAUL.TRUCK);
    if (!r.ok) bad.push('around the wall: ' + r.why); else { if (!(r.len > 36 && Math.max(...r.pts.map((q) => q[1])) > 6)) bad.push('did not go around the end of the wall: ' + JSON.stringify(r.pts.map((q) => q.map((v) => +v.toFixed(1))))); for (const q of r.pts) if (w().solid(toI(q[0]), 0, toK(q[1]))) bad.push('a waypoint stands in the pile'); }
    // a frame cube in the open: the route keeps its 5 x 5 window off it
    const fe = g.machines.frameEnt('x', 'steel', toI(-20), toK(-1), 0); delete fe.clear; const fr = { id: g.nextId(), type: 'frame', ...fe }; S().entities.push(fr); g.addEntity(fr);
    r = HAUL.planRoute(g, { x: -24, z: -0.4, j: 0 }, { x: -14, z: -0.4, j: 0 }, HAUL.TRUCK); if (!r.ok) bad.push('around the frame: ' + r.why); else if (!(r.pts.some((q) => Math.abs(q[1] + 0.4) > 1.2))) bad.push('the route went through a frame cube: ' + JSON.stringify(r.pts.map((q) => q.map((v) => +v.toFixed(1)))));
    // closed in all round: no route, and it says the pile blocks every way
    wall(-28, -26, 6, 18); r = HAUL.planRoute(g, A, Bp, HAUL.TRUCK); if (r.ok || !/no way through/i.test(r.why || '')) bad.push('a closed wall gave ' + JSON.stringify([r.ok, r.why]));
    return bad.length === 0 || bad.join('; ');
  });

  await T('haul.router-prefers-roads-and-a-truck-drives-1.4-times-as-fast-on-one', async () => {
    await world(); const bad = [];
    // two ways round a wall: a road along the longer one wins when it costs less than the open ground
    wall(-28, -26, -26, 6); for (let n = 0; n < 12; n++) road(toI(-44) + n * 4, toK(7.5)); for (let n = 0; n < 8; n++) road(toI(-24) + n * 4, toK(7.5));
    const r = HAUL.planRoute(g, { x: -44, z: 0, j: 0 }, { x: -10, z: 0, j: 0 }, HAUL.TRUCK); if (!r.ok) return r.why;
    if (!(r.pts.some((q) => q[1] > 4))) bad.push('the route ignored the road: ' + JSON.stringify(r.pts.map((q) => q.map((v) => +v.toFixed(1)))));
    // speed: the same truck, the same 3 s, on a plate and off it
    await world(); road(toI(-44), toK(-1)); for (let n = 1; n < 20; n++) road(toI(-44) + n * 4, toK(-1));
    const dist = (z) => { const tk = mk('truck', toI(-44), toK(z)); tk.route = [[-1, z, 'dig'], [0, 0, 'sink'], [tk.px, tk.pz, 'home']]; tk.seg = 0; tk.state = 'go'; run(3); const d = Math.hypot(tk.px - cellX(toI(-44)), tk.pz - cellZ(toK(z))); return d; };
    const on = dist(-0.9), off = dist(10.3);
    if (!(off > 17 && off < 25)) bad.push('off the road it drove ' + off.toFixed(1) + ' m in 3 s'); if (Math.abs(on / off - 1.4) > 0.06) bad.push(`on the road ${on.toFixed(1)} m vs ${off.toFixed(1)} m: ratio ${(on / off).toFixed(2)}`);
    return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- road plates: bench, placing, snapping, the hammer
  await T('haul.road-plates-need-the-upgrade-lay-edge-to-edge-and-the-hammer-takes-them-up', async () => {
    fresh({ ...UP, haulRoad: 0, truckDock: 0 }); if (recipes(g).some((r) => r.id === 'road' || r.id === 'dock')) return 'road or dock craftable without their upgrades';
    await world(); const r = recipes(g).find((x) => x.id === 'road'); if (!r || r.price !== 24 || !r.use) return 'bench row ' + JSON.stringify(r && [r.price, !!r.use]);
    craft('road', 4); selectTool('road'); const out = [];
    aimPoint(cellX(toI(-30)), 0.1, cellZ(toK(0)), 2.6); let pl = await plan(); if (!pl.ok) return pl.why; if (placeNow() !== 1) return 'not placed'; const a = S().entities.find((e) => e.type === 'road');
    // aim at the cell past its far edge: the next plate snaps edge to edge
    aimPoint(cellX(a.i0 + 5), 0.1, cellZ(a.k0 + 1), 2.2); p().yaw = Math.PI / 2; pl = await plan(); if (!pl.ok) return 'next plate: ' + pl.why;
    if (!((pl.ent.i0 === a.i0 + 4 || pl.ent.i0 === a.i0 - 4) && pl.ent.k0 === a.k0 || (pl.ent.k0 === a.k0 + 4 || pl.ent.k0 === a.k0 - 4) && pl.ent.i0 === a.i0)) out.push(`not edge to edge: ${pl.ent.i0 - a.i0}, ${pl.ent.k0 - a.k0}`);
    // never on top of another plate
    if (HAUL.roadWhy(g, a.i0 + 2, a.k0, 0) === null) out.push('overlapping plates were allowed'); if (!/already here/.test(HAUL.roadWhy(g, a.i0, a.k0, 0))) out.push('same cells: ' + HAUL.roadWhy(g, a.i0, a.k0, 0));
    // plush on the floor, or no floor under it, refuses
    w().setCell(a.i0 + 9, 0, a.k0, 2, 0); if (!HAUL.roadWhy(g, a.i0 + 8, a.k0, 0)) out.push('a plate over plush');
    // the hammer finds it by its slab and gives the item back
    S().items = {}; selectTool('hammer'); g.stowed = false; p().pos.set(cellX(a.i0 + 1) - 2.2, 0, cellZ(a.k0 + 2)); p().yaw = Math.PI / 2; p().pitch = -0.5; g.renderer.camera.position.copy(p().eyePos(new THREE.Vector3()));
    const ref = g.hammerTarget(); if (!ref || ref.id !== a.id) out.push('hammer: ' + JSON.stringify(ref)); else { g.doDecon(ref); if (S().items.road !== 1 || g.machines.items.has(a.id)) out.push('the plate did not come back'); }
    return out.length === 0 || out.join('; ');
  });

  // ---------------------------------------------------------------- docks
  const dockRig = async (o = {}) => {
    await world(); const kz = toK(-6), i0 = toI(-34), dk = g.placeEntity('dock', { ax: 'x', i0, k0: kz - 2, j: 0 }, { quiet: true });
    const b = HAUL.dockBox(dk), belts = o.belt === false ? [] : B.lay(0, 3, b.i1 + 1, kz, 0, 0), v = o.belt === false ? null : B.vaultAt(b.i1 + 4, kz, 0); L().dirty = true;
    return { dk, b, belts, v, kz };
  };
  await T('haul.dock-is-a-sink-with-a-belt-and-the-truck-unloads-onto-it-not-into-the-bin', async () => {
    const { dk, v } = await dockRig(); const bad = [];
    const dg = mk('excavator', toI(-48), toK(-6), { off: true }); hop(dg, 120); const tk = mk('truck', toI(-46), toK(0)); const money0 = S().money;
    if (!HAUL.isSink(g, dk)) return 'the dock does not see its belt'; const sn = (await import('../earth.js')).sinkNear(g, dg.x, dg.z); if (sn.dock !== dk.id) return 'the sink is ' + JSON.stringify(sn);
    if (!until(() => tk.trips >= 1 && v.stored.length >= 120, 120)) bad.push(`after 120 s: ${tk.state} trips ${tk.trips} vault ${v.stored.length}`);
    if (S().money > money0 + 50) bad.push('the load was sold instead of belted: +' + (S().money - money0)); if (tk.cargo.length) bad.push('cargo left aboard'); if (!(S().stats.dockUnloaded >= 120)) bad.push('stat ' + S().stats.dockUnloaded);
    return bad.length === 0 || bad.join('; ');
  });
  await T('haul.dock-without-a-belt-is-not-a-sink-and-The-One-never-goes-on-its-belt', async () => {
    const { dk } = await dockRig({ belt: false }); const bad = [];
    if (HAUL.isSink(g, dk)) bad.push('a dock with no belt is a sink'); const dg = mk('excavator', toI(-48), toK(-6), { off: true }); const sn = (await import('../earth.js')).sinkNear(g, dg.x, dg.z); if (sn.dock) bad.push('the truck would unload at a bare dock');
    // The One in a bed at a dock with a belt: it is never fed to the belt
    const r = await dockRig(); const tk = mk('truck', toI(-34), toK(-6)); tk.cargo = [3, 0, PD.NEEDLE, 64, 3, 0]; tk.cn = 3; tk.py = 0; let res = false;
    for (let n = 0; n < 200 && res === false; n++) { res = HAUL.unloadTo(g, r.dk, tk, 0.1); B.seconds(0.1); }
    if (tk.cargo.indexOf(PD.NEEDLE) < 0 || tk.cargo.length !== 2) bad.push('The One left the bed or the rest stayed: ' + JSON.stringify(tk.cargo)); if (res !== 'one') bad.push('unloadTo returned ' + res);
    B.seconds(20); if (r.v.stored.some((x) => x.sp === PD.NEEDLE)) bad.push('The One is in the vault'); if (r.v.stored.length !== 2) bad.push('the vault holds ' + r.v.stored.length + ' of the 2 other plush');
    return bad.length === 0 || bad.join('; ');
  });
  await T('haul.a-backed-up-dock-belt-makes-the-truck-wait-a-minute-and-then-sell-the-rest-never-lose-it', async () => {
    const { dk, v } = await dockRig(); const bad = []; v.stored = []; for (let q = 0; q < 5000; q++) v.stored.push({ sp: 3, vr: 0 });   // a full vault: nothing more goes in
    const dg = mk('excavator', toI(-48), toK(-6), { off: true }); hop(dg, 60); const tk = mk('truck', toI(-46), toK(0)); const money0 = S().money;
    if (!until(() => tk.state === 'unload', 60)) return 'the truck never reached the dock: ' + tk.state + ' ' + (tk.why || ''); const t0 = g.time;
    if (!until(() => tk.trips >= 1, 90)) bad.push('the truck waited for ever: ' + tk.state + ' cargo ' + tk.cargo.length / 2);
    const waited = g.time - t0; if (waited < 55 || waited > 80) bad.push('waited ' + waited.toFixed(0) + ' s'); if (!(S().money > money0)) bad.push('the load was not sold after the wait'); if (tk.cargo.length) bad.push('cargo left');
    void dk; return bad.length === 0 || bad.join('; ');
  });
  await T('haul.dock-charges-a-parked-truck-at-25-kW-and-draws-power-only-then', async () => {
    const { dk } = await dockRig({ belt: false }); const bad = []; const tk = mk('truck', toI(-60), toK(-6)); const cap = HAUL.battCap(g.T); const c = HAUL.dockCentre(dk);
    tk.px = c.x; tk.pz = c.z; tk.py = 0; tk.batt = 30000; tk.state = 'idle'; run(0.5); const b0 = tk.batt; run(10); const gain = tk.batt - b0;
    if (!(gain > 230 && gain < 270)) bad.push('charged ' + gain.toFixed(0) + ' kJ in 10 s, 25 kW makes 250'); if (HAUL.dockKw(dk) !== 25) bad.push('draw while charging ' + HAUL.dockKw(dk));
    tk.px += 20; run(1); if (HAUL.dockKw(dk) !== 0.1) bad.push('draw when empty ' + HAUL.dockKw(dk)); tk.batt = cap - 1; tk.px = c.x; run(3); if (tk.batt > cap + 1e-6) bad.push('over capacity ' + tk.batt);
    // an unpowered dock does nothing
    tk.batt = 30000; for (let n = 0; n < 50; n++) { for (const it of g.machines.items.values()) it.ent.pw = it.ent.type === 'dock' ? 0 : 1; g.time += 0.1; g.machines.update(0.1, g.time); HAUL.dockTick(g, 0.1); } if (tk.batt > 30000.5) bad.push('an unpowered dock charged');
    return bad.length === 0 || bad.join('; ');
  });
  await T('haul.dock-places-only-on-clear-floor-with-a-pad-4-high-and-comes-back-with-the-hammer', async () => {
    await world(); const bad = [], kz = toK(-6), i0 = toI(-34); w().setCell(i0 + 2, 2, kz, 2, 0);
    if (!/plush in the way/.test(HAUL.dockWhy(g, 'x', i0, kz - 2, 0) || '')) bad.push('a plush over the pad'); w().removeCell(i0 + 2, 2, kz, false);
    const dk = g.placeEntity('dock', { ax: 'x', i0, k0: kz - 2, j: 0 }, { quiet: true }); if (!/already here/.test(HAUL.dockWhy(g, 'x', i0 + 2, kz - 2, 0) || '')) bad.push('overlap ' + HAUL.dockWhy(g, 'x', i0 + 2, kz - 2, 0));
    S().items = {}; g.doDecon({ kind: 'mach', id: dk.id }); if (S().items.dock !== 1) bad.push('the dock did not come back');
    if (HAUL.dockWhy(g, 'q', 1, 1, 0) === null || HAUL.dockWhy(g, 'x', 1.5, 1, 0) === null) bad.push('bad numbers accepted');
    return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- the battery
  await T('haul.truck-battery-drains-while-driving-charges-at-the-yard-and-gates-a-trip', async () => {
    await world(); const bad = [], T0 = g.T; const cap = HAUL.battCap(T0); if (cap !== 120000) bad.push('capacity ' + cap);
    const tk = mk('truck', toI(-44), toK(0)); run(0.3); if (!(Math.abs(tk.batt - cap) < 1)) bad.push('a new truck holds ' + tk.batt);
    tk.route = [[-10, 0, 'dig'], [0, 0, 'sink'], [tk.px, tk.pz, 'home']]; tk.seg = 0; tk.state = 'go'; const b0 = tk.batt; run(5); const used = b0 - tk.batt; if (!(used > 195 && used < 205)) bad.push('5 s of driving drew ' + used.toFixed(0) + ' kJ, 40 kW makes 200');
    // parked at its yard it charges back (25 kW)
    tk.px = tk.x; tk.pz = tk.z; tk.state = 'idle'; tk.route = []; tk.batt = 50000; run(10); if (!(tk.batt > 50240 && tk.batt < 50260)) bad.push('yard charge ' + (tk.batt - 50000).toFixed(0));
    // a trip it cannot finish on what it holds waits (and says so), a full battery goes
    const dg = mk('excavator', toI(-14), toK(0), { off: true }); hop(dg, 100); tk.batt = 60; tk.cache = {}; run(3); if (tk.state !== 'idle' || !/Charging for the trip/.test(tk.why || '')) bad.push(`a flat truck set off: ${tk.state} ${tk.why}`);
    tk.batt = cap; if (!until(() => tk.state === 'go' || tk.trips > 0, 20)) bad.push('a full truck did not go: ' + tk.state);
    // Dispatch Radio adds 50% battery a level (level 2: double)
    S().up.truckRange = 2; g.T = g.tune(); if (HAUL.battCap(g.T) !== 240000) bad.push('radio level 2 capacity ' + HAUL.battCap(g.T)); S().up.truckRange = 0; g.T = g.tune();
    return bad.length === 0 || bad.join('; ');
  });
  await T('haul.a-truck-that-runs-dry-stops-and-a-charge-pack-puts-30-percent-back', async () => {
    await world(); const bad = []; const tk = mk('truck', toI(-50), toK(0)); const it = g.machines.items.get(tk.id); tk.batt = 100; tk.route = [[-10, 0, 'dig'], [0, 0, 'sink'], [tk.px, tk.pz, 'home']]; tk.seg = 0; tk.state = 'go'; run(5);
    if (tk.state !== 'dead' || tk.batt !== 0) return `not dead: ${tk.state} batt ${tk.batt}`; const x0 = tk.px; run(3); if (tk.px !== x0) bad.push('a dead truck moved');
    S().items.chargepack = 0; let r = useEarth(g, it, 10); if (!/Charge Pack/.test(r.msg || '') || tk.state !== 'dead') bad.push('without a pack: ' + JSON.stringify(r));
    S().items.chargepack = 2; r = useEarth(g, it, 10); if (tk.state !== 'go' || Math.abs(tk.batt - 0.3 * HAUL.battCap(g.T)) > 1 || S().items.chargepack !== 1) bad.push(`with a pack: ${tk.state} ${tk.batt} packs ${S().items.chargepack}`);
    const rc = recipes(g).find((x) => x.id === 'chargepack'); if (!rc || rc.price !== 3000) bad.push('the pack costs ' + (rc && rc.price));
    const info = infoFor(g, { kind: 'mach', id: tk.id }); if (!info || !/Battery \d+%/.test(info.lines.join(' '))) bad.push('the truck readout has no battery line');
    return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- saves and rows
  await T('haul.truck-roads-and-docks-survive-a-save-and-an-old-truck-loads-full', async () => {
    await world(); const bad = []; const tk = mk('truck', toI(-44), toK(0)); tk.batt = 5555; tk.tun = true; road(toI(-30), toK(0)); const dk = g.placeEntity('dock', { ax: 'z', i0: toI(-20), k0: toK(-8), j: 0 }, { quiet: true });
    const raw = JSON.parse(JSON.stringify(S().entities)); for (const e of [...S().entities]) { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } } S().entities = S().entities.filter((e) => e.free);
    for (const e of raw) { if (e.id === tk.id) delete e.batt; if (!e.free) { S().entities.push(e); g.addEntity(e); } }
    const t2 = S().entities.find((e) => e.id === tk.id); if (!t2 || t2.batt !== HAUL.battCap(g.T)) bad.push('an old truck without a battery holds ' + (t2 && t2.batt));
    if (!S().entities.some((e) => e.type === 'road') || !S().entities.some((e) => e.type === 'dock' && e.ax === 'z')) bad.push('road or dock lost'); if (!g.machines.items.get(dk.id)) bad.push('no dock mesh'); run(2);
    return bad.length === 0 || bad.join('; ');
  });
  await T('haul.earth-rows-grow-by-two-fields-and-an-old-row-still-applies', async () => {
    await world(); const tk = mk('truck', toI(-44), toK(0)); const it = g.machines.items.get(tk.id); tk.bp = 63; tk.py = 1.8; const row = earthRow(it); const bad = [];
    if (row.length !== 16 || row[14] !== 63 || row[15] !== 1.8) bad.push('row ' + JSON.stringify(row.slice(12))); if (!STATES.includes('dead') || !STATES.includes('blocked') || STATES.indexOf('refuse') !== 17) bad.push('state table moved: ' + STATES.join());
    const old = row.slice(0, 14); const e2 = { ...tk }; const it2 = { ent: e2 }; applyEarthRow(it2, old); if (e2.bp !== undefined && e2.bp !== tk.bp) bad.push('an old row changed the battery'); applyEarthRow(it2, row); if (e2.bp !== 63 || e2.py !== 1.8) bad.push('new row ' + e2.bp + ' ' + e2.py);
    return bad.length === 0 || bad.join('; ');
  });
  await T('haul.readouts-for-road-dock-and-a-blocked-truck-are-plain-text', async () => {
    await world(); const rd = road(toI(-30), toK(0)); const dk = g.placeEntity('dock', { ax: 'x', i0: toI(-20), k0: toK(-8), j: 0 }, { quiet: true }); const bad = [];
    for (const [e, want] of [[rd, /HAUL ROAD PLATE/], [dk, /TRUCK DOCK/]]) { const r = infoFor(g, { kind: 'mach', id: e.id }); const txt = r ? r.title + ' ' + r.lines.join(' ') : ''; if (!want.test(txt) || /undefined|NaN/.test(txt)) bad.push('readout: ' + txt.slice(0, 160)); }
    return bad.length === 0 || bad.join('; ');
  });
}
