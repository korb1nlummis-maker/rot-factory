// haul.contract.*: the two tunnel classes and what each vehicle needs (lead notes, section 9; src/haul.js).
// A normal tunnel is a run of 4x4x4 frame cubes (3 x 3 cells clear) for walkers, belts, belt lifts, Mine Rail carts and fans. A giant tunnel is a run of arches
// (clear 5 x 4, 7 x 5, 11 x 7) for Haul Trucks and the big diggers. Every test here builds the tunnel the way a player does (a bore in the pile, supports along it) and
// drives the REAL vehicle through it: the real Player, a real rail cart with a rider, plush on real belts and a real belt lift, a real Haul Truck on its route.
// Run: `await __selftest('haul.contract.')` (about a minute: run the groups with a longer prefix on a slow machine)
import { makeRail, UP as RAIL_UP } from './rail_lib.js';
import { makeBeltKit, UP_BASE } from './belts_lib.js';
import { UP as UPX, ARCH } from './portal_lib.js';
import * as HAUL from '../haul.js';
import { ARCH_SPANS } from '../loadtrace.js';
import { EARTH, planEarth, earthTune } from '../earth.js';
import { NEEDLE, BULK } from '../plushdata.js';
import { infoFor } from '../info.js';

const CLASSES = [['cube', 'timber', 4, 4], ['cube', 'concrete', 4, 4], ['arch6', 'steel', 6, 5], ['arch8', 'steel', 8, 6], ['arch12', 'steel', 12, 8]];
const UPALL = { ...UPX, ...RAIL_UP, ...UP_BASE, truck: 1, excavator: 1, wheel: 1, dozer: 1, borerSize: 2 };

export default async function (ctx) {
  const { T, g, S, w, p, L, fresh, newWorld, toI, toK, cellX, cellZ, clearBodies, adv } = ctx;
  const X = makeRail(ctx), R = X.R, B = makeBeltKit(ctx), C = 0.6;
  const world = async () => { await newWorld(); X.setup(UPALL); S().money = 1e13; g.surgeT = 1e9; clearBodies(); };
  const done = async () => { try { X.clean(); } catch (e) { /* ignore */ } await newWorld(); };
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { await done(); } });

  // ---------------------------------------------------------------- the tunnel: a pile block with the open face to the east, a bore along x, supports flush all the way
  // returns { cls, mat, span, rows, L (cells), iEast (the first bore cell at the open face), iWest, lo, kc, floorJ }
  const tunnel = (cls, mat, wd, ht, len = 28) => {
    // clear a big yard (the bay is only a few metres wide): x -52..8 m, z -26..18 m
    for (let i = toI(-52); i <= toI(8); i++) for (let k = toK(-26); k <= toK(18); k++) for (let j = 0, top = w().topAt(i, k); j < top; j++) if (w().get(i, j, k)) w().removeCell(i, j, k, false);
    const iEast = toI(-29), iWest = iEast - len + 1, kc = toK(-1.2), lo = kc - (wd >> 1) + (wd % 2 ? 0 : 1) - (wd % 2 ? 0 : 0);
    const blockW = wd + 12, k0 = lo - 6, rows = ht + 5;
    for (let i = iWest - 6; i <= iEast; i++) for (let k = k0; k < k0 + blockW; k++) for (let j = 0; j < rows; j++) w().setCell(i, j, k, 2, 0);
    for (let i = iWest; i <= iEast; i++) for (let k = lo; k < lo + wd; k++) for (let j = 0; j < ht; j++) w().removeCell(i, j, k, false);
    // supports: cubes or arches, one every 4 cells, the first at the east mouth
    const ents = [];
    for (let m = iWest; m + 3 <= iEast; m += 4) {
      if (cls === 'cube') { const e = g.machines.frameEnt('x', mat, m, lo, 0); delete e.clear; const ent = { id: g.nextId(), type: 'frame', ...e }; S().entities.push(ent); g.addEntity(ent); ents.push(ent); }
      else ents.push(g.placeEntity('garch', { axis: 'x', gm: m, glo: lo, gj: 0, span: wd, mat }, { quiet: true }));
    }
    return { cls, mat, wd, ht, len, iEast, iWest, lo, kc, ents, k0, blockW };
  };
  const centre = (t) => t.lo + (t.wd >> 1);    // the lane vehicles drive along
  const stepAll = (secs, dt = 0.1, each = null) => {
    for (let n = 0; n < secs / dt; n++) {
      for (const it of g.machines.items.values()) it.ent.pw = it.ent.off && it.ent.type !== 'truck' && it.ent.type !== 'excavator' ? 0 : 1;
      for (const q of L().tiles.values()) q.pw = 1;
      g.time += dt; g.machines.update(dt, g.time); L().update(dt); if (each) each(n);
    }
  };

  // ---------------------------------------------------------------- the numbers themselves
  await T('haul.contract.table-matches-what-the-supports-and-the-vehicles-really-are', async () => {
    const bad = [];
    // a cube is 3 x 3 clear for every material (pillar 0.2 to 0.28 m, beam under 0.28 m): check against the real frame members
    const { frameMembers, FRAME_W, FRAME_H, FRAME_D } = await import('../machines.js');
    for (const kind of ['timber', 'steel', 'concrete', 'rebar', 'titan', 'carbon', 'plasma', 'voidl', 'neutron', 'horizon']) {
      const mem = frameMembers(kind, FRAME_W, FRAME_H, FRAME_D); const pillars = mem.filter((q) => Math.abs(q.s[1] - FRAME_H) < 1e-6);
      const pw = Math.max(...pillars.map((q) => q.s[0])); const beams = mem.filter((q) => !q.plate && q.p[1] > FRAME_H - 0.3).map((q) => q.s[1]); const bt = beams.length ? Math.max(...beams) : 0;
      const wide = Math.floor((FRAME_W - 2 * pw) / C + 1e-6), high = Math.floor((FRAME_H - bt) / C + 1e-6);
      if (wide !== HAUL.CUBE_CLEAR.w || high !== HAUL.CUBE_CLEAR.h) bad.push(`${kind} cube is ${wide} x ${high} clear, the table says ${HAUL.CUBE_CLEAR.w} x ${HAUL.CUBE_CLEAR.h}`);
    }
    for (const span of [6, 8, 12]) { const s = ARCH_SPANS[span], t = HAUL.TUNNEL_CLASSES['arch' + span]; if (t.w !== s.cw || t.h !== s.ch) bad.push(`arch${span}`); }
    // what each vehicle needs against what each class offers: the lead's rule
    const want = { cube: ['walker', 'belt', 'lift', 'minecart', 'shuttle', 'fan'], arch6: ['walker', 'belt', 'lift', 'minecart', 'shuttle', 'fan', 'dozer', 'excavator', 'truck'], arch8: ['walker', 'belt', 'lift', 'minecart', 'shuttle', 'fan', 'dozer', 'excavator', 'truck', 'wheel'], arch12: ['walker', 'belt', 'lift', 'minecart', 'shuttle', 'fan', 'dozer', 'excavator', 'truck', 'wheel'] };
    for (const [cls, list] of Object.entries(want)) for (const v of Object.keys(HAUL.VEHICLES)) { const fit = HAUL.fits(HAUL.VEHICLES[v], HAUL.TUNNEL_CLASSES[cls]); if (fit !== list.includes(v)) bad.push(`${v} in ${cls}: ${fit}`); }
    // the truck is 3 x 3 cells plus a cell of margin on each side and over the top, and its real mesh fits inside that with room to spare
    const tr = HAUL.TRUCK; if (tr.w !== 5 || tr.h !== 4) bad.push('truck need ' + tr.w + 'x' + tr.h);
    const e = EARTH.truck; if (2 * e.half + 1 !== 3) bad.push('the truck is not 3 cells wide');
    return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- walking
  for (const [cls, mat, wd, ht] of CLASSES) await guard(`haul.contract.a-walker-crosses-a-${cls}-tunnel-lined-with-${mat}`, async () => {
    await world(); const t = tunnel(cls, mat, wd, ht, 24), kz = cellZ(centre(t)) + (wd % 2 ? 0 : 0.3);
    p().pos.set(cellX(t.iEast + 3), 0, kz); p().vel.set(0, 0, 0); p().yaw = -Math.PI / 2; p().pitch = 0; p().onGround = true;
    const inp = { fwd: 1, back: 0, left: 0, right: 0, sprint: false, crouch: false, jump: false }, st = { walk: g.T.walk, crouchMul: g.T.crouchMul, jump: g.T.jump };
    let q = 0; for (; q < 60 * 12; q++) { g.time += 1 / 60; p().update(1 / 60, inp, st, g.sim); if (p().pos.x < cellX(t.iWest) + 0.6) break; }
    const x = p().pos.x; return (x < cellX(t.iWest) + 0.9 && p().pos.y < 0.3) || `stopped at ${x.toFixed(1)} m of ${cellX(t.iWest).toFixed(1)} after ${(q / 60).toFixed(1)} s (y ${p().pos.y.toFixed(2)})`;
  });

  // ---------------------------------------------------------------- the Mine Rail cart with a rider (the shuttle)
  for (const [cls, mat, wd, ht] of CLASSES) await guard(`haul.contract.the-rail-shuttle-rides-end-to-end-through-a-${cls}-tunnel-lined-with-${mat}`, async () => {
    await world(); const t = tunnel(cls, mat, wd, ht, 24), k = centre(t), bad = [];
    const iFace = t.iWest + 1, iBase = t.iEast - 1; const track = X.line(iFace, iBase, 0, k); if (track.length < 20) return 'short track';
    const base = X.station(iBase, 0, k, 'base'), face = X.station(iFace, 0, k, 'face'), car = X.cart(iFace + 1, 0, k);
    X.power(cellX(iBase), cellZ(k + 1)); R.invalidate(g); adv(0.3);
    p().pos.set(car.x - 1.0, car.y, car.z); p().vel.set(0, 0, 0); if (!R.useCar(g, car, 'host') || !car.riders.includes('host')) return 'could not sit in the cart';
    R.dispatch(g, car, R.keyOf(base)); const x0 = car.x; let maxSep = 0;
    let frames = 0; X.until(() => { if (++frames > 3) maxSep = Math.max(maxSep, Math.hypot(p().pos.x - car.x, p().pos.z - car.z)); return car.st !== 'run' && (car.spd || 0) === 0 && Math.abs(car.x - x0) > 5; }, 30);
    if (car.a !== R.keyOf(base)) bad.push('the cart did not reach the east station: ' + car.st + ' ' + (car.why || '')); if (Math.abs(car.x - x0) < (iBase - iFace - 3) * C) bad.push('only travelled ' + Math.abs(car.x - x0).toFixed(1) + ' m');
    if (!car.riders.includes('host')) bad.push('the rider was dropped'); if (maxSep > 0.3) bad.push('the rider strayed ' + maxSep.toFixed(2) + ' m');
    // the headroom rule the rail uses (cell + 2 above) holds for every piece of the line
    for (const e of track) if (!R.clearAt(g, e)) { bad.push('a piece is blocked at ' + e.i); break; }
    return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- belts and belt lifts
  for (const [cls, mat, wd, ht] of CLASSES) await guard(`haul.contract.a-belt-line-and-a-belt-lift-run-through-a-${cls}-tunnel-lined-with-${mat}`, async () => {
    await world(); const t = tunnel(cls, mat, wd, ht, 24), k = centre(t), bad = [];
    // a belt along the bore from the west end to the vault at the east mouth, plush fed at the far end
    const line = B.lay(0, t.len - 2, t.iWest + 1, k, 0, 0); const v = B.vaultAt(t.iEast, k, 0); L().dirty = true;
    const sp = 3; line[0].items = [{ sp, vr: 0, t: 0.5 }, { sp, vr: 0, t: 0.15 }]; B.seconds(30);
    if (v.stored.length < 2) bad.push(`only ${v.stored.length} of 2 plush came down the belt`);
    // a belt lift as tall as the bore allows: it stands on the floor of the tunnel and lets go in the top row under the roof
    const hmax = ht - 1, i = t.iWest + 8, k2 = k - 1;
    const feeder = B.lay(0, 2, i - 2, k2, 0, 0); const lift = g.placeEntity('belt', { i, j: 0, k: k2, dir: 0, rise: 0, lift: { h: hmax }, items: [] }, { quiet: true, rebuild: false });
    w().setCell(i + 1, hmax - 1, k2, BULK, 0); const top = B.lay(0, 1, i + 1, k2, 0, hmax)[0], v2 = B.vaultAt(i + 2, k2, hmax); L().dirty = true; void top; void lift;
    feeder[0].items = [{ sp: 3, vr: 0, t: 0.9 }]; B.seconds(25);
    if (v2.stored.length !== 1) bad.push(`a ${hmax} cell lift in a ${ht} high bore carried ${v2.stored.length} of 1 plush`);
    // one cell taller and it would let go inside the roof
    if (!L().canPlace(i + 1, ht, k2)) bad.push('a lift one cell taller than the bore could set its top belt in the roof');
    return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- the diggers: where may each one stand? (planEarth reads the cells it needs)
  for (const [cls, mat, wd, ht] of CLASSES) await guard(`haul.contract.diggers-stand-in-a-${cls}-tunnel-only-where-they-fit`, async () => {
    await world(); const t = tunnel(cls, mat, wd, ht, 24), k = centre(t), bad = [];
    const want = { cube: { excavator: false, dozer: false, wheel: false }, arch6: { excavator: true, dozer: true, wheel: false }, arch8: { excavator: true, dozer: true, wheel: true }, arch12: { excavator: true, dozer: true, wheel: true } }[cls];
    for (const kind of ['excavator', 'dozer', 'wheel']) {
      // stand inside, look west along the bore at the floor in front of the pile wall at its end
      p().pos.set(cellX(t.iWest + 9), 0, cellZ(k) + 0.3); p().vel.set(0, 0, 0); p().yaw = -Math.PI / 2; p().pitch = -0.35; g.renderer.camera.position.copy(p().eyePos(new ctx.V3()));
      const eye = p().eyePos(new ctx.V3()), dir = p().forward(new ctx.V3()), r = planEarth(g.machines, kind, eye, dir, p().yaw);
      const ok = !!r.ok; if (ok !== want[kind]) bad.push(`${kind}: ${ok ? 'fits' : 'refused (' + r.why + ')'}, expected ${want[kind] ? 'to fit' : 'to be refused'}`);
      if (!ok && want[kind] && /Face the pile wall/.test(r.why)) bad.push(`${kind}: no wall found ahead`);
      if (!ok && !want[kind] && !/clear|Ground|close|room/i.test(r.why || '')) bad.push(`${kind}: refused for the wrong reason: ${r.why}`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- the Haul Truck: a searched route in, a load out, driven for real
  const site = (t, o = {}) => {
    const k = centre(t), yardI = toI(-23.0), yardK = toK(4.2);
    const mk = (type, i, kk, extra) => { const spec = EARTH[type]; const ent = { id: g.nextId(), type, i, j: 0, k: kk, dx: -1, dz: 0, x: cellX(i), y: 0, z: cellZ(kk), hy: spec.hy, hr: spec.hr, ...(spec.dig ? { hop: [], hn: 0, steps: 0, dug: 0, state: 'idle' } : { px: cellX(i), pz: cellZ(kk), cargo: [], cn: 0, route: [], seg: 0, trips: 0, state: 'idle', job: 0, yaw: 0 }), ...extra }; S().entities.push(ent); g.addEntity(ent); return ent; };
    const dg = mk('excavator', t.iWest + 6, k, { off: true }), tk = mk('truck', yardI, yardK, {});
    const hop = []; for (let q = 0; q < (o.n ?? 120); q++) hop.push(3, 0); dg.hop = hop; dg.hn = hop.length / 2;
    return { dg, tk, k };
  };
  for (const [cls, mat, wd, ht] of CLASSES.filter((c) => c[0] !== 'cube')) await guard(`haul.contract.a-haul-truck-drives-into-a-${cls}-tunnel-loads-and-hauls-out`, async () => {
    await world(); const t = tunnel(cls, mat, wd, ht, 28), { dg, tk } = site(t), bad = [];
    let maxY = 0, inside = false, vias = 0, hi = null; const money0 = S().money, it = g.machines.items.get(tk.id);
    stepAll(240, 0.1, () => { const x = tk.px; if (x < cellX(t.iEast - 2) && x > cellX(t.iWest)) { inside = true; if (it.obj.position.y > maxY) { maxY = it.obj.position.y; hi = [tk.state, tk.seg, +tk.px.toFixed(1), +tk.pz.toFixed(1), tk.py, JSON.stringify(tk.route.map((r) => [+r[0].toFixed(1), +r[1].toFixed(1), r[2]]))]; } } if (tk.route) vias = Math.max(vias, tk.route.filter((r) => r[2] === 'via').length); });
    if (tk.trips < 1) bad.push(`no trip finished in 240 s: ${tk.state} ${tk.why || ''} at ${tk.px.toFixed(1)},${tk.pz.toFixed(1)} job ${tk.job}`);
    if (!inside) bad.push('the truck never entered the tunnel'); if (maxY > 1.0) bad.push('the truck drove over the top of the pile (y ' + maxY.toFixed(1) + ' m) instead of on the tunnel floor ' + JSON.stringify(hi));
    if (!(S().money > money0)) bad.push('the load was not sold'); if (vias < 1) bad.push('the route had no searched corners'); if (dg.hop.length) bad.push(`${dg.hop.length / 2} plush left in the hopper`);
    return bad.length === 0 || bad.join('; ');
  });
  for (const [cls, mat, wd, ht] of CLASSES.filter((c) => c[0] === 'cube')) await guard(`haul.contract.a-haul-truck-is-refused-by-a-${cls}-tunnel-lined-with-${mat}-and-says-what-is-too-narrow`, async () => {
    await world(); const t = tunnel(cls, mat, wd, ht, 28), { dg, tk } = site(t), bad = []; const toasts = []; const t0 = g.ui.toast.bind(g.ui); g.ui.toast = (o) => { toasts.push(o.title + ' | ' + (o.text || '')); return t0(o); };
    try { stepAll(40); } finally { g.ui.toast = t0; }
    if (tk.trips !== 0 || tk.job) bad.push('a truck drove into a cube tunnel: trips ' + tk.trips + ' job ' + tk.job); if (dg.hop.length / 2 !== 120) bad.push('the hopper was emptied');
    if (!/route blocked by .*(frame|tunnel).* too narrow/i.test(tk.why || '')) bad.push('the reason: ' + JSON.stringify(tk.why)); if (!toasts.some((x) => /cannot get through/.test(x))) bad.push('no toast: ' + toasts.join(' / '));
    const r = infoFor(g, { kind: 'mach', id: tk.id }); if (!r || !/too narrow/.test(r.lines.join(' '))) bad.push('the hover text does not say why: ' + JSON.stringify(r && r.lines) + ' state ' + tk.state + ' why ' + tk.why);
    return bad.length === 0 || bad.join('; ');
  });
}
