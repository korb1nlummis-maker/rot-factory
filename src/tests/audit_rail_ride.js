// audit_rail.*: the adversarial pass over the Mine Rail shuttle (src/rail.js). Each test was written to fail against the first build and pins one defect:
// the economy of the cart's auto-sell, a real save and load taken mid ride, rubble that lands in front of a moving cart, and boarding a moving cart.
import { makeRail } from './rail_lib.js';
import { loadSaved } from '../state.js';

export default async function (ctx) {
  const { T, g, S, w, p, adv, NEEDLE, cellX, cellZ } = ctx;
  const X = makeRail(ctx), R = X.R;
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { X.clean(); } });
  const key = (code) => ({ code, preventDefault() {}, target: document.body, repeat: false, shiftKey: false });
  const press = (code) => { g.onKey(key(code), true); g.onKey(key(code), false); };
  const sit = (car) => { p().pos.set(car.x - 1.0, car.y, car.z); p().vel.set(0, 0, 0); return R.useCar(g, car, 'host'); };
  const idle = (car) => car.st !== 'run' && (car.spd || 0) === 0;

  await guard('audit_rail.cart-sales-pay-the-plain-price-with-no-streak-bonus', async () => {
    // The belts and machines pay valueOf(sp, vr, 0) through sellAuto. A cart that sold through the hand-sale path stacked the throwing streak (+4.5% a plush) on a 120 plush load.
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.6);
    const load = []; for (let n = 0; n < 60; n++) load.push({ sp: 3 + (n % 7), vr: n % 5 === 0 ? 128 : 0 });
    car.cargo = load.map((a) => ({ ...a })); car.n = load.length;
    g.golden = 0; g.streak.n = 0; g.streak.t = 0;
    const want = load.reduce((a, it) => a + Math.max(1, Math.round(g.valueOf(it.sp, it.vr, 0))), 0);
    const m0 = S().money, best0 = S().stats.bestStreak;
    R.dispatch(g, car, R.keyOf(s.base)); X.until(() => idle(car), 25); X.until(() => car.cargo.length === 0, 12);
    if (car.cargo.length) bad.push('still carrying ' + car.cargo.length);
    const got = S().money - m0;
    if (got !== want) bad.push(`paid ${got}, the plain price of the load is ${want}`);
    if (S().stats.bestStreak !== best0) bad.push('the cart moved the hand-throw streak record');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('audit_rail.a-real-save-and-load-mid-ride-leaves-no-phantom-cart-or-rider', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.6);
    sit(car); for (let n = 0; n < 9; n++) car.cargo.push({ sp: 5, vr: 1 }); car.n = 9; press('Backspace'); X.until(() => car.x > cellX(s.iFace) + 6, 10);
    const id = car.id;
    g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) return 'g.save() failed';
    const saved = loadSaved(); if (!saved || !saved.S) return 'nothing came back from loadSaved';
    g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play'; adv(0.4);
    const live = g.machines.items.get(id); if (!live) return 'the cart is not in the loaded world';
    const rs = R.sync(g);
    if (!rs.cars.includes(live.ent)) bad.push('the rail graph still holds the cart of the world that was thrown away');
    if (R.seatedCar(g, 'host')) bad.push('the player is still seated in a cart that no longer exists');
    const hud = document.getElementById('railHud'); if (hud && hud.style.display !== 'none') bad.push('the speed readout stays up after the load');
    if (live.ent.riders.length || live.ent.st !== 'idle') bad.push('the loaded cart is ' + live.ent.st + ' with riders ' + JSON.stringify(live.ent.riders));
    if (live.ent.cargo.length !== 9) bad.push('the real save lost the cargo: ' + live.ent.cargo.length);
    // it still drives
    const c2 = live.ent; R.dispatch(g, c2, R.keyOf(s.base)); X.until(() => idle(c2), 30);
    if (c2.a !== R.keyOf(s.base)) bad.push('the loaded cart did not drive home');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('audit_rail.rubble-landing-in-the-next-cell-mid-trip-stops-the-cart-short-of-it', async () => {
    // the cart is already on its way to the next piece when the roof comes down into it: it must not carry its rider into the pile
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.6); sit(car); press('Backspace');
    X.until(() => car.x > cellX(s.iFace) + 6, 10);
    const c = car.cache; if (!c.edge) { X.until(() => car.cache.edge && car.u > 0.15 && car.u < 0.5, 2, 0.01); }
    if (!car.cache.edge) return 'no edge to test on';
    const bi = R.sync(g).nodes.get(car.b).i;
    const pileX = cellX(bi); w().setCell(bi, 1, s.k, 3, 0);
    X.until(() => idle(car) || car.st === 'blocked', 6);
    if (car.st !== 'blocked') bad.push('state ' + car.st);
    if (car.x > pileX - 0.29) bad.push(`the cart is at ${car.x.toFixed(2)} inside the cell of the pile at ${pileX.toFixed(2)}`);
    if (Math.hypot(p().pos.x - car.x, p().pos.z - car.z) > 0.3) bad.push('rider off the cart');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('audit_rail.the-rush-key-on-foot-does-not-board-a-cart-that-is-moving', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.6);
    R.dispatch(g, car, R.keyOf(s.base)); X.until(() => car.spd > 5 && car.x > cellX(s.iFace) + 8, 10);
    p().pos.set(car.x + 2.0, 0, car.z); p().vel.set(0, 0, 0); p().pos.z = car.z + 1.2;
    R.rush(g, 'host');
    if (car.riders.includes('host')) bad.push('the rush key put you into a cart doing ' + car.spd.toFixed(1) + ' m/s');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('audit_rail.a-machine-set-on-the-track-stops-the-cart-before-it', async () => {
    // belts, poles and vaults may be set down on a rail cell (the belt rules do not know about rail): the cart must stop before one, never drive through it
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.6);
    sit(car); press('Backspace'); X.until(() => car.x > cellX(s.iFace) + 3, 10);
    const ahead = X.ci(car.x) + 9, tile = X.K.pole(cellX(ahead), cellZ(s.k)); if (!tile) return 'the pole did not go down';
    R.invalidate(g); X.until(() => idle(car), 20);
    if (car.st !== 'blocked') bad.push('state ' + car.st + ' at ' + car.x.toFixed(2));
    if (car.x > cellX(ahead) - 0.29) bad.push('the cart is in the cell of the pole: ' + car.x.toFixed(2) + ' vs ' + cellX(ahead).toFixed(2));
    if (!/blocking/.test(car.why || '')) bad.push('why: ' + car.why);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('audit_rail.rock-falling-onto-the-cart-puts-the-rider-off-instead-of-riding-inside-the-pile', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.6); sit(car); press('Backspace');
    X.until(() => car.x > cellX(s.iFace) + 6, 10);
    const at = R.sync(g).nodes.get(car.cache.edge && car.u >= 0.5 ? car.b : car.a); if (!at) return 'the cart was not on a piece';
    w().setCell(at.i, 1, s.k, 3, 0);   // the roof comes down on the cart
    adv(0.3);
    if (car.riders.length) bad.push('the rider is still seated inside the pile');
    if (car.st === 'run' || car.spd > 0.01) bad.push('the cart is still moving: ' + car.st + ' ' + car.spd.toFixed(2));
    const x1 = car.x; adv(1); if (Math.abs(car.x - x1) > 0.01) bad.push('the cart rolled on out of the pile');
    return bad.length === 0 || bad.join(' || ');
  });

  void NEEDLE;
}
