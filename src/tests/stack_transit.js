// stack.transit.*: belts, belt lifts, belt ramps, the elevator, the Mine Rail and the vehicle contract through plated cubes and stacks (wave 10).
// A level is one plate row and three clear rows: the clear section of a cube tunnel (3 x 3 cells) is what the walker, the cart, belts and lifts already fit.
import { kit, UP } from './stack_lib.js';
import { makeBeltKit } from './belts_lib.js';
import { makeRail } from './rail_lib.js';
import { kit as transitKit, UP as TUP } from './transit_lib.js';
import * as TR from '../transit.js';
import * as HAUL from '../haul.js';
import * as BP from '../beltparts.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, adv, toI, toK, cellX, cellZ, V3 } = ctx;
  const K = kit(ctx), W = K.W, C = 0.6;
  const BK = makeBeltKit(ctx), X = makeRail(ctx), R = X.R;
  // two levels: a full floor plate in the lower cube, and the plate of the one above with an opening (op, turned od)
  const levels = async (op, od = 0, o = {}) => {
    const Y = K.yard({ levels: 2, east: true, up: { ...UP, ...(o.up || {}) }, ...o }); const [A, B2] = K.stack(Y, ['steel', 'steel']);
    const a = await K.putPlate(A, 'f', 0, 0); if (!a.ok) throw new Error('lower plate: ' + a.why);
    const b = await K.putPlate(A, 'c', op, od); if (!b.ok) throw new Error('upper plate: ' + b.why);
    return { Y, A, B2 };
  };
  const place = (type, f) => g.placeEntity(type, { items: [], ...f }, { quiet: true, rebuild: false });
  const ups = () => { g.S.up.beltLift = 1; g.S.up.beltMotors = 3; g.T = g.tune(); g.rebuildTools(); };

  await T('stack.transit.a-belt-lift-through-a-shaft-plate-carries-plush-up-a-level-and-a-full-plate-refuses-it', async () => {
    const { Y } = await levels(2, 0); ups();
    const c = { i: Y.m + 2, j: 1, k: Y.lo + 2, dir: 2, h: 4 };
    const why = BP.liftProblem(g, 0, c, 4); if (why) return 'the opening refuses a 4 cell lift: ' + why;
    const feeder = BK.lay(0, 1, Y.m + 3, Y.lo + 2, 2, 1), lift = place('belt', { i: c.i, j: 1, k: c.k, dir: 2, rise: 0, lift: { h: 4 } });
    const top = BK.lay(0, 1, Y.m + 1, Y.lo + 2, 2, 5), v = BK.vaultAt(Y.m, Y.lo + 2, 5);
    const m = BK.measure([...feeder, lift, ...top], v, 1 / 60, 30);
    if (m.count !== m.total || m.total < 8) return `the lift delivered ${m.count} of ${m.total}`;
    // a full plate has no opening: the shaft is in the way
    const Z = await levels(0, 0, { dx: 80 }); ups(); const why2 = BP.liftProblem(g, 0, { i: Z.Y.m + 2, j: 1, k: Z.Y.lo + 2, dir: 2, h: 4 }, 4);
    return /in the way/.test(why2 || '') || 'a lift went up through a full plate: ' + why2;
  });

  await T('stack.transit.a-belt-ramp-climbs-a-level-through-a-landing-and-carries-plush', async () => {
    const { Y } = await levels(1, 0); ups();
    // the opening is the +x strip (cells x 2 and 3): the ramp climbs along z in column 2 and turns onto the plate at the top
    const tiles = [[2, 1, 0, 1], [2, 2, 1, 1], [2, 3, 2, 1], [2, 4, 3, 2]];
    p().pos.set(cellX(Y.m - 6), 0, cellZ(Y.lo + 2));   // out of the way: nobody builds into a person
    for (const [dx, j, dz] of tiles) { const why = g.logi.canPlace(Y.m + dx, j, Y.lo + dz); if (why) return `a ramp tile at ${dx},${j},${dz} is refused inside the cube: ${why}`; }
    const feeder = BK.lay(0, 1, Y.m + 3, Y.lo, 2, 1);
    const ramp = tiles.map(([dx, j, dz, d]) => place('belt', { i: Y.m + dx, j, k: Y.lo + dz, dir: d, rise: 1 }));
    const top = BK.lay(0, 1, Y.m + 1, Y.lo + 3, 2, 5), v = BK.vaultAt(Y.m, Y.lo + 3, 5);
    const m = BK.measure([...feeder, ...ramp, ...top], v, 1 / 60, 40);
    if (m.count !== m.total || m.total < 6) return `the ramp delivered ${m.count} of ${m.total}`;
    // outside a cube the same tiles still need a floor under them
    const why = g.logi.canPlace(Y.m + 30, 4, Y.lo - 2); return /floor|Blocked/.test(why || '') || 'a belt tile hung in the open with no floor: ' + why;
  });

  await T('stack.transit.the-elevator-stops-at-every-plated-landing-and-carries-you-between-them', async () => {
    const X2 = transitKit(ctx), up = { ...TUP, steel: 1, stackKit: 1, beltLift: 1 };
    X2.setup(up);
    const i0 = toI(-8), k0 = toK(-3), L0 = X2.lift(i0, k0, { home: 12, depth: 12, frames: false, top: 18 });
    for (const j0 of [0, 4, 8]) X2.frame(L0, j0, 'steel');
    K.dig(i0 + 4, 0, k0, 4, 12, 4); const side = [0, 4, 8].map((j0) => K.cube('steel', i0 + 4, k0, j0));
    for (const c of side) { const r = await K.putPlate(c, 'f', 0, 0); if (!r.ok) return 'a landing plate: ' + r.why; }
    TR.refreshShaft(g, L0); L0.ex = L0.tr;
    const rows = TR.floorsOf(g, L0).join();
    if (!/(^|,)1,5,9,12$/.test(rows)) return 'the stops should be the plated landings 1, 5 and 9 under the home stop 12 (and the bottom): ' + rows;
    const G = X2.powerCab(L0, 2); p().pos.set(L0.px, 12 * C, L0.pz); p().vel.set(0, 0, 0); g.keys = {}; adv(0.4);
    if (TR.requestFloor(g, L0, 5) !== 'ok') return 'the call for the middle level was refused'; adv(8);
    if (Math.abs(L0.cy - 5 * C) > 1e-6 || Math.abs(p().pos.y - 5 * C) > 0.06) return `at the middle level: cab ${L0.cy.toFixed(2)} you ${p().pos.y.toFixed(2)}`;
    // step off east onto the plate of that level: the cab floor is level with it
    p().pos.set(L0.px + 1.7, 5 * C, L0.pz); p().vel.set(0, 0, 0); X2.stepPlayer(0.6);
    const ok = Math.abs(p().pos.y - 3.0) < 0.2 && !p().liftId; X2.clean(); void G;
    return ok || `stepping onto the landing plate: y ${p().pos.y.toFixed(2)} liftId ${p().liftId}`;
  });

  await T('stack.transit.a-plate-laid-in-the-shaft-cuts-it-and-the-elevator-says-where', async () => {
    const X2 = transitKit(ctx), up = { ...TUP, steel: 1, stackKit: 1 };
    X2.setup(up); const i0 = toI(-8), k0 = toK(-3), L0 = X2.lift(i0, k0, { home: 12, depth: 12, frames: false, top: 18 });
    const cubes = [0, 4, 8].map((j0) => X2.frame(L0, j0, 'steel')); TR.refreshShaft(g, L0);
    if (L0.wy !== 'floor' || L0.tr !== 12) { X2.clean(); return 'the clear column is not a shaft to the floor: ' + JSON.stringify([L0.wy, L0.tr]); }
    const r = await K.putPlate(cubes[1], 'f', 0, 0); if (!r.ok) { X2.clean(); return r.why; }
    TR.refreshShaft(g, L0); const cut = L0.wy !== 'floor' || L0.tr < 12; const txt = infoFor(g, { kind: 'mach', id: L0.id }).lines.join(' | '); X2.clean();
    return (cut && /shaft|plate|blocked|pad|ends/i.test(txt)) || `a plate in the shaft did not cut it: ${L0.wy}, reach ${L0.tr}, readout: ${txt}`;
  });

  const railRide = async () => {
    const Y = K.yard({ east: true, up: { ...UP, railShuttle: 1 } }); K.dig(Y.m + 4, 0, Y.lo, 8, 4, 4);
    const cubes = [0, 4, 8].map((n) => K.cube('steel', Y.m + n, Y.lo, 0)); const bay = [];
    for (const c of cubes) { const r = await K.putPlate(c, 'f', 0, 0); if (!r.ok) return 'plate: ' + r.why; bay.push(r.e); }
    // the track on the plates: row 1, three clear cells over it
    const bad = []; const k = Y.lo + 1;
    for (let i = Y.m; i < Y.m + 12; i++) { const r = X.lay(i, 1, k); if (r.why) { bad.push(`rail at ${i - Y.m}: ${r.why}`); break; } }
    if (bad.length) return bad.join(' | ');
    const face = X.station(Y.m, 1, k, 'face'), base = X.station(Y.m + 11, 1, k, 'base'), car = X.cart(Y.m + 1, 1, k);
    R.invalidate(g); adv(0.3);
    p().pos.set(car.x - 0.6, car.y, car.z); p().vel.set(0, 0, 0); if (!R.useCar(g, car, 'host')) return 'could not sit in the cart on the plate';
    R.dispatch(g, car, R.keyOf(base)); let maxY = -1, minY = 99; const t = X.until(() => { maxY = Math.max(maxY, car.y); minY = Math.min(minY, car.y); return car.st !== 'run' && (car.spd || 0) === 0 && Math.abs(car.x - cellX(Y.m + 11)) < 0.8; }, 40, 0.1);
    if (Math.abs(car.x - cellX(Y.m + 11)) > 0.9) return `the cart stopped at ${car.x.toFixed(2)}, the base is at ${cellX(Y.m + 11).toFixed(2)} after ${t.toFixed(1)} s (${car.st}: ${car.why})`;
    if (Math.abs(p().pos.y - car.y) > 0.5 || !car.riders.includes('host')) return 'the rider was left behind';
    return (minY > 0.5 && maxY < 1.4) || `the cart left the plate level: ${minY.toFixed(2)} to ${maxY.toFixed(2)}`;
  };
  await T('stack.transit.a-mine-rail-cart-with-a-rider-runs-the-length-of-a-plated-tunnel', async () => { try { return await railRide(); } finally { X.clean(); adv(0.1); } });   // (X.clean takes the track and the cart down: the rail state outlives a new world until a rail tick, and its stale cells made the next test's route "blocked by the pile")

  await T('stack.transit.the-contract-walkers-pass-a-plated-tunnel-and-a-haul-truck-is-refused-with-the-reason', async () => {
    const Y = K.yard({ east: true }); K.dig(Y.m + 4, 0, Y.lo, 8, 4, 4); const cubes = [0, 4, 8].map((n) => K.cube('steel', Y.m + n, Y.lo, 0));
    for (const c of cubes) { const r = await K.putPlate(c, 'f', 0, 0); if (!r.ok) return 'plate: ' + r.why; }
    const from = { x: cellX(Y.m - 6), z: cellZ(Y.lo + 2), j: 0 }, to = { x: cellX(Y.m + 10), z: cellZ(Y.lo + 2), j: 1 }, bad = [];
    const walker = HAUL.planRoute(g, from, to, HAUL.VEHICLES.walker, { straight: false }); if (!walker.ok) bad.push('a walker was refused: ' + walker.why);
    for (const v of ['minecart', 'shuttle', 'lift', 'belt']) { const r = HAUL.planRoute(g, from, to, HAUL.VEHICLES[v], { straight: false }); if (!r.ok) bad.push(v + ' was refused: ' + r.why); }
    const truck = HAUL.planRoute(g, from, to, HAUL.TRUCK, { straight: false });
    if (truck.ok) bad.push('a Haul Truck was routed through a cube tunnel'); else if (!/too narrow \(.*a Haul Truck needs 5 x 4\)/.test(truck.why || '')) bad.push('the refusal does not say why: ' + truck.why);
    return bad.length === 0 || bad.join(' | ');
  });
}
