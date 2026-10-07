// audit_arches.haul.*: the audit of wave 6 (trucks, docks, roads and what the aim picks inside a giant arch). Each test was written to fail first against the code as built.
// Run: `await __selftest('audit_arches.haul.')`
import { UP as UPX, ARCH } from './portal_lib.js';
import { UP_BASE } from './belts_lib.js';
import * as HAUL from '../haul.js';
import * as EXT from '../ext.js';
import { EARTH, useEarth } from '../earth.js';
import { infoFor, findInfoRef } from '../info.js';
import { recipes } from '../crafting.js';

const UP = { ...UPX, ...UP_BASE, truck: 1, excavator: 1, haulRoad: 1, truckDock: 1 };
export default async function (ctx) {
  const { T, g, S, w, p, L, fresh, newWorld, toI, toK, cellX, cellZ, clearBodies, craft } = ctx;
  const world = async (up = UP) => { await newWorld(); fresh(up); S().money = 1e13; g.surgeT = 1e9; clearBodies(); clearYard(); };
  const clearYard = () => { for (let i = toI(-52); i <= toI(8); i++) for (let k = toK(-26); k <= toK(18); k++) for (let j = 0, top = w().topAt(i, k); j < top; j++) if (w().get(i, j, k)) w().removeCell(i, j, k, false); };
  const mk = (type, i, k, extra = {}) => { const spec = EARTH[type]; const ent = { id: g.nextId(), type, i, j: 0, k, dx: -1, dz: 0, x: cellX(i), y: 0, z: cellZ(k), hy: spec.hy, hr: spec.hr, ...(spec.dig ? { hop: [], hn: 0, steps: 0, dug: 0, state: 'idle' } : { px: cellX(i), pz: cellZ(k), cargo: [], cn: 0, route: [], seg: 0, trips: 0, state: 'idle', job: 0, yaw: 0 }), ...extra }; S().entities.push(ent); g.addEntity(ent); return ent; };
  const run = (secs, dt = 0.1) => { for (let n = 0; n < secs / dt; n++) { for (const it of g.machines.items.values()) it.ent.pw = it.ent.off && it.ent.type !== 'truck' && it.ent.type !== 'excavator' ? 0 : 1; for (const q of L().tiles.values()) q.pw = 1; g.time += dt; g.machines.update(dt, g.time); HAUL.dockTick(g, dt); L().update(dt); } };

  // The truck stops dead at 0 kJ. A Truck Dock charges whatever is parked in it, and the readout tells you to park one under it, but a dead truck never looked at its battery again:
  // it sat at "Out of battery" for ever with a full battery and only a Charge Pack item got it going.
  await T('audit_arches.haul.a-dead-truck-in-a-powered-dock-drives-on-once-it-holds-15-percent', async () => {
    await world(); const bad = [], tk = mk('truck', toI(-50), toK(0)), it = g.machines.items.get(tk.id), cap = HAUL.battCap(g.T);
    tk.batt = 100; tk.route = [[-10, 0, 'dig'], [0, 0, 'sink'], [tk.px, tk.pz, 'home']]; tk.seg = 0; tk.state = 'go'; run(5);
    if (tk.state !== 'dead') return 'it did not run dry: ' + tk.state;
    run(300, 1); if (tk.state !== 'dead' || tk.batt !== 0) bad.push(`without a dock it moved on: ${tk.state} ${tk.batt}`);
    const dk = g.placeEntity('dock', { ax: 'x', i0: toI(tk.px) - 2, k0: toK(tk.pz) - 1, j: 0 }, { quiet: true });
    run(60, 1); if (tk.state !== 'dead') bad.push('it drove on at ' + Math.round(100 * tk.batt / cap) + '% (under the 15% line)'); if (!(tk.batt > 0)) bad.push('the dock did not charge it');
    let t = 0; while (t < 900 && tk.state === 'dead') { run(1, 1); t++; }
    if (tk.state !== 'go') bad.push(`after ${t} s it is "${tk.state}" at ${Math.round(100 * tk.batt / cap)}%`); else { if (tk.batt < HAUL.BATT.low * cap - 100) bad.push('it drove on at ' + Math.round(100 * tk.batt / cap) + '%'); if (tk.why) bad.push('it still says why: ' + tk.why); if (t < 600) bad.push('it woke after only ' + t + ' s: 15% of the battery is ' + Math.round(HAUL.BATT.low * cap / HAUL.BATT.charge) + ' s of a 25 kW dock'); }
    const x0 = tk.px; run(3, 1); if (tk.state === 'go' && !(Math.abs(tk.px - x0) > 1)) bad.push('it says go and stands still');
    void dk; void it;
    return bad.length === 0 || bad.join('; ');
  });

  await T('audit_arches.haul.a-truck-that-runs-dry-at-its-own-yard-is-charged-by-the-yard-and-drives-on', async () => {
    await world(); const bad = [], tk = mk('truck', toI(-50), toK(0)), cap = HAUL.battCap(g.T);
    tk.batt = 0; tk.state = 'dead'; tk.resume = 'idle'; tk.route = []; tk.seg = 0; let t = 0; while (t < 1200 && tk.state === 'dead') { run(1, 1); t++; }
    if (tk.state === 'dead') bad.push(`still dead after ${t} s at ${Math.round(100 * tk.batt / cap)}% in its own yard`); else if (t < 600 || t > 760) bad.push(`it woke after ${t} s (15% at 25 kW is 720 s)`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('audit_arches.haul.an-unpowered-dock-wakes-nothing-and-a-charge-pack-still-does', async () => {
    await world(); const bad = [], tk = mk('truck', toI(-50), toK(0)), it = g.machines.items.get(tk.id);
    tk.batt = 100; tk.route = [[-10, 0, 'dig'], [0, 0, 'sink'], [tk.px, tk.pz, 'home']]; tk.seg = 0; tk.state = 'go'; run(5); if (tk.state !== 'dead') return 'not dead ' + tk.state;
    const dk = g.placeEntity('dock', { ax: 'x', i0: toI(tk.px) - 2, k0: toK(tk.pz) - 1, j: 0 }, { quiet: true });
    // an unpowered dock charges nothing
    for (let n = 0; n < 200; n++) { for (const q of g.machines.items.values()) q.ent.pw = q.ent.type === 'dock' ? 0 : 1; g.time += 1; g.machines.update(1, g.time); HAUL.dockTick(g, 1); }
    if (tk.state !== 'dead' || tk.batt !== 0) bad.push(`an unpowered dock changed it: ${tk.state} ${tk.batt}`);
    S().items.chargepack = 1; const r = useEarth(g, it, 10); if (tk.state === 'dead' || S().items.chargepack) bad.push('the pack did not wake it: ' + JSON.stringify(r) + ' ' + tk.state);
    void dk;
    return bad.length === 0 || bad.join('; ');
  });

  // A ray from outside meets the box of an arch before it meets what stands inside it: the hammer took the roof down when you aimed at the digger parked under it.
  await T('audit_arches.haul.the-hammer-and-the-readout-pick-a-machine-standing-in-an-arch-not-the-arch', async () => {
    await world(); const bad = [], gm = toI(-30), glo = toK(0), l = ARCH.layout(g, 'x', gm, glo, 0, 6, 'steel', { free: true }); if (!l.ok) return l.why;
    const a = g.placeEntity('garch', { axis: 'x', gm, glo, gj: 0, span: 6, mat: 'steel' }, { quiet: true }), ex = mk('excavator', gm + 2, glo + 3), outside = mk('excavator', gm + 14, glo + 3);
    const aimAt = (e, back, y) => { p().pos.set(a.cx - 1.2 - back, 0, e.z); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0; const eye = g.renderer.camera.position; p().eyePos(eye); p().pitch = Math.atan2((e.y + (y ?? e.hy)) - eye.y, Math.hypot(e.x - eye.x, e.z - eye.z)); };
    for (const back of [2.2, 3.0]) {
      aimAt(ex, back); const ref = g.findDeconRef(); if (!ref || ref.id !== ex.id) bad.push(`X at ${back} m picks ${ref && (ref.id === a.id ? 'the arch' : ref.id)}`);
      const ir = findInfoRef(g); if (!ir || ir.id !== ex.id) bad.push(`the readout at ${back} m reads ${ir && (ir.id === a.id ? 'the arch' : ir.id)}`);
    }
    // the arch is still hammered where nothing stands in it: aim at the rib high on the wall
    const gm2 = toI(-44), l2 = ARCH.layout(g, 'x', gm2, glo, 0, 6, 'steel', { free: true }); if (!l2.ok) return l2.why; const a2 = g.placeEntity('garch', { axis: 'x', gm: gm2, glo, gj: 0, span: 6, mat: 'steel' }, { quiet: true });
    p().pos.set(a2.cx - 3.5, 0, a2.cz); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0.35; p().eyePos(g.renderer.camera.position); const r2 = g.findDeconRef(); if (!r2 || r2.id !== a2.id) bad.push('an arch with nothing in it can no longer be picked: ' + JSON.stringify(r2));
    const i2 = findInfoRef(g); if (!i2 || i2.id !== a2.id) bad.push('an empty arch can no longer be read: ' + JSON.stringify(i2));
    // a machine well outside the box does not hide the arch in front of it
    aimAt(outside, 3.0); p().pitch = 0.05; const r3 = g.findDeconRef(); if (r3 && r3.id === outside.id && Math.hypot(outside.x - g.renderer.camera.position.x, outside.z - g.renderer.camera.position.z) > 4) bad.push('a far machine won over the arch in front of it');
    return bad.length === 0 || bad.join('; ');
  });

  // E: aimedEnt took the nearest centre, so the arch (with its big reach) beat a switch or a door standing inside it, and on a Portal that parked the driver
  await T('audit_arches.haul.e-on-a-switch-inside-an-arch-uses-the-switch-not-the-arch', async () => {
    await world(); const bad = [], gm = toI(-30), glo = toK(0), l = ARCH.layout(g, 'x', gm, glo, 0, 6, 'steel', { free: true }); if (!l.ok) return l.why;
    const a = g.placeEntity('garch', { axis: 'x', gm, glo, gj: 0, span: 6, mat: 'steel' }, { quiet: true });
    const sw = g.placeEntity('switch', { x: a.cx + 0.4, y: 0, z: a.cz + 0.9, ry: 0, mount: 'floor', on: false }, { quiet: true }); if (!sw) return 'no switch';
    const eye = g.renderer.camera.position; let n = 0;
    for (const back of [1.6, 2.0, 2.6]) {
      p().pos.set(sw.x - back, 0, sw.z); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0; p().eyePos(eye); p().pitch = Math.atan2((0.5) - eye.y, back); const got = EXT.aimedEnt(g);
      if (!got || got.id !== sw.id) bad.push(`${back} m before it: E would use ${got && (got.type === 'garch' ? 'the arch' : got.type)}`); else n++;
    }
    // looking at the arch itself still finds the arch (nothing inside it is aimed at)
    p().pos.set(a.cx - 3.2, 0, a.cz - 1.2); p().yaw = Math.PI / 2 + 0.2; p().pitch = 0.0; p().eyePos(eye); const o = EXT.aimedEnt(g); if (o && o.type !== 'garch' && o.id !== sw.id) bad.push('unexpected ' + o.type); void n;
    return bad.length === 0 || bad.join('; ');
  });

  // the unlock, the chalkboard and the readme all say 220,000 at the bench: the bench rounded the price per K first and sold it for 219,999
  await T('audit_arches.haul.the-truck-dock-costs-exactly-what-the-unlock-says-and-roads-and-packs-too', async () => {
    await world(); const bad = [], rows = recipes(g), price = (id) => { const r = rows.find((x) => x.id === id); return r ? r.price : null; };
    if (price('dock') !== 220000) bad.push('dock ' + price('dock')); if (price('road') !== 24) bad.push('road ' + price('road')); if (price('chargepack') !== 3000) bad.push('pack ' + price('chargepack'));
    const m0 = S().money; craft('dock', 1); if (m0 - S().money !== 220000) bad.push('paid ' + (m0 - S().money));
    return bad.length === 0 || bad.join('; ');
  });

  // the trip was costed on the straight line to the digger: a route that winds round a wall (or down a bent tunnel) is longer, and a truck with just enough for the straight line ran dry on the way
  await T('audit_arches.haul.a-trip-is-costed-on-the-route-it-will-drive-not-the-straight-line', async () => {
    await world(); const bad = [], wall = (x0, x1, z0, z1, rows = 8) => { for (let i = toI(x0); i <= toI(x1); i++) for (let k = toK(z0); k <= toK(z1); k++) for (let j = 0; j < rows; j++) w().setCell(i, j, k, 2, 0); };
    wall(-28, -26, -26, 14); for (let i = toI(-14); i <= toI(-4); i++) for (let k = toK(-4); k <= toK(4); k++) for (let j = 6; j < 9; j++) w().setCell(i, j, k, 2, 0);   // a long wall to go round, a roof over the digger (a tunnel end)
    const tk = mk('truck', toI(-44), toK(0)), dg = mk('excavator', toI(-10), toK(0), { off: true }); dg.hop = []; for (let q = 0; q < 100; q++) dg.hop.push(3, 0); dg.hn = 100;
    const back = [dg.x - dg.dx * (EARTH.excavator.half + 2) * 0.6, dg.z], r = HAUL.jobRoute(g, { x: tk.px, z: tk.pz, y: 0 }, { x: back[0], z: back[1], y: 0 });
    if (!r.ok || !r.tun) return 'no tunnel route: ' + JSON.stringify([r.ok, r.tun, r.why]); const straight = Math.hypot(back[0] - tk.px, back[1] - tk.pz); if (!(r.len > straight * 1.25)) return `the route is only ${r.len.toFixed(0)} m against ${straight.toFixed(0)} m`;
    const leg2 = 9, enough = HAUL.tripNeed(g.T, straight + leg2) * 1.05;   // covers the straight line to the digger and back, not the way round the wall
    if (!(HAUL.tripNeed(g.T, r.len + leg2) > enough + 80)) return 'the test route is not long enough to tell';
    tk.batt = enough; tk.cache = {}; run(1.5); if (tk.state !== 'idle' || !/Charging for the trip/.test(tk.why || '')) bad.push(`with ${Math.round(enough)} kJ (the straight line costs less, the route more) it set off: ${tk.state} ${tk.why || ''}`);
    tk.batt = HAUL.battCap(g.T); tk.cache = {}; run(3); if (tk.state === 'idle') bad.push('a full truck did not go');
    return bad.length === 0 || bad.join('; ');
  });

  // a damaged arch in a save (no whole numbers for its section, a span that is not one) used to make every placement, the truck router and the hammer throw for the rest of the game
  // outTile took any belt beside a short end, whichever way it ran: a belt running into the pad made the dock a sink, and the truck unloaded onto a dead end (a minute of patience a trip)
  await T('audit_arches.haul.a-belt-that-runs-into-the-dock-is-not-its-outlet-one-that-runs-away-is', async () => {
    const bad = [], belt = (i, k, dir) => g.placeEntity('belt', { i, j: 0, k, dir, rise: 0, items: [] }, { quiet: true, rebuild: false });
    for (const ax of ['x', 'z']) for (const end of [0, 1]) {
      await world(); const dk = g.placeEntity('dock', { ax, i0: toI(-30), k0: toK(-4), j: 0 }, { quiet: true }), b = HAUL.dockBox(dk);
      // the cell just past the short end, in line with the pad's middle
      const at = ax === 'x' ? [end ? b.i1 + 1 : b.i0 - 1, b.k0 + 1] : [b.i0 + 1, end ? b.k1 + 1 : b.k0 - 1], away = ax === 'x' ? (end ? 0 : 2) : (end ? 1 : 3), into = (away + 2) % 4;
      const t = belt(at[0], at[1], into); L().dirty = true; if (HAUL.isSink(g, dk)) bad.push(`${ax} end ${end}: a belt running into the pad made it a sink`);
      g.logi.remove(t); S().entities = S().entities.filter((q) => q.id !== t.id); const t2 = belt(at[0], at[1], away); L().dirty = true; if (!HAUL.isSink(g, dk)) bad.push(`${ax} end ${end}: a belt running away is not an outlet`); void t2;
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('audit_arches.haul.a-damaged-arch-entity-is-inert-and-never-poisons-placing-routing-or-the-hammer', async () => {
    await world(); const bad = [], odd = [{ span: 99, mat: 'nothing', gm: 'x' }, { axis: 'q', span: 6, mat: 'steel', gm: 1.5, glo: 2, gj: 0 }, { span: 8, mat: 'steel', gm: 4, glo: null, gj: 0 }];
    const ids = []; for (const o of odd) { const e = { id: g.nextId(), type: 'garch', ...o }; S().entities.push(e); g.addEntity(e); ids.push(e.id); }
    const tryit = (label, f) => { try { f(); } catch (er) { bad.push(label + ' threw ' + er.message); } };
    tryit('layout', () => { const l = ARCH.layout(g, 'x', toI(-30), toK(0), 0, 6, 'steel'); if (!l.ok && /Bad/.test(l.why)) bad.push('layout: ' + l.why); });
    tryit('blockTaken', () => g.machines.blockTaken('x', toI(-30), toK(0), 0)); tryit('archTaken', () => ARCH.archTaken(g, { i0: 0, i1: 4000, k0: 0, k1: 4000, j0: 0, j1: 40 }));
    tryit('planRoute', () => HAUL.planRoute(g, { x: -40, z: 0, j: 0 }, { x: -10, z: 0, j: 0 }, HAUL.TRUCK)); tryit('supportIndex', () => HAUL.supportIndex(g));
    for (const id of ids) { tryit('hammer ' + id, () => g.doDecon({ kind: 'mach', id })); if (S().entities.some((q) => q.id === id)) bad.push('the hammer left damaged arch ' + id); }
    tryit('a real arch still places after them', () => { const l = ARCH.layout(g, 'x', toI(-30), toK(0), 0, 6, 'steel', { free: true }); if (!l.ok) bad.push('layout after: ' + l.why); });
    return bad.length === 0 || bad.join('; ');
  });

  await T('audit_arches.haul.a-garbage-arch-never-throws-in-a-readout-or-a-cable-name', async () => {
    await world(); const bad = [], odd = { id: g.nextId(), type: 'garch', span: 99, mat: 'nothing', gm: 'x' }; S().entities.push(odd); g.addEntity(odd);
    try { const n = ARCH.nameOf(odd.span, odd.mat); if (!/Arch/.test(n)) bad.push('name ' + n); } catch (e) { bad.push('nameOf threw ' + e.message); }
    try { const { catalogType } = await import('../catalog.js'); const h = catalogType('garch'); const nm = h.wireName(odd); if (typeof nm !== 'string' || !nm) bad.push('wireName ' + nm); } catch (e) { bad.push('wireName threw ' + e.message); }
    try { infoFor(g, { kind: 'mach', id: odd.id }); } catch (e) { bad.push('info threw ' + e.message); }
    return bad.length === 0 || bad.join('; ');
  });
}
