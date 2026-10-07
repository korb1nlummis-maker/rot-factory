// rail.*: riding the Mine Rail: carts under way, speed on a powered and an unpowered line, the rush key, the return trip, plush loads sold at the bin, hopping off,
// a cut or blocked track, slopes, junctions, two carts on one line and the save.
import { makeRail } from './rail_lib.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, adv, V3, fresh, NEEDLE, toI, toK, cellX, cellZ } = ctx;
  const X = makeRail(ctx), R = X.R, C = 0.6;
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { X.clean(); } });
  const key = (code) => ({ code, preventDefault() {}, target: document.body, repeat: false, shiftKey: false });
  const press = (code) => { g.onKey(key(code), true); g.onKey(key(code), false); };
  const sit = (car) => { p().pos.set(car.x - 1.0, car.y, car.z); p().vel.set(0, 0, 0); return R.useCar(g, car, 'host'); };
  const idle = (car) => car.st !== 'run' && (car.spd || 0) === 0;

  await guard('rail.sit-in-the-cart-and-rush-home-along-the-track', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car;
    if (car.st !== 'idle') bad.push('a new cart is ' + car.st);
    if (!sit(car) || !car.riders.includes('host')) return 'could not sit: ' + JSON.stringify(car.riders);
    press('Backspace'); if (car.st !== 'run') return 'the rush key did not start the cart: ' + car.st + ' ' + car.why;
    let maxSep = 0, maxV = 0, moved = false; const x0 = car.x;
    let frames = 0; const t = X.until(() => { if (++frames > 2) maxSep = Math.max(maxSep, Math.hypot(p().pos.x - car.x, p().pos.z - car.z)); maxV = Math.max(maxV, car.spd); if (Math.abs(car.x - x0) > 3) moved = true; return idle(car) && moved; }, 20);
    const base = s.base; if (car.a !== R.keyOf(base)) bad.push('the cart did not stop at the base station');
    if (maxSep > 0.3) bad.push('the player strayed ' + maxSep.toFixed(2) + ' m from the cart');
    if (Math.hypot(p().pos.x - cellX(base.i), p().pos.z - cellZ(base.k)) > 0.5) bad.push('the player is not at the base: ' + p().pos.x.toFixed(1));
    if (maxV < 7.5 || maxV > 8.01) bad.push('top speed ' + maxV.toFixed(2));
    const len = (s.iBase - s.iFace - 1) * C; if (t < len / 8 || t > len / 8 + 4.5) bad.push(`ride took ${t.toFixed(1)} s for ${len.toFixed(1)} m`);
    if (!car.riders.includes('host')) bad.push('the rider was dropped on arrival');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.speed-is-8-powered-and-a-hand-crank-crawl-without-power', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.6);
    const comp = R.compOf(R.sync(g), R.keyOf(s.base)); if (!comp.powered || Math.abs(comp.speed - 8) > 0.01) bad.push('powered line speed ' + comp.speed);
    if (R.lineSpeed(g, R.keyOf(s.base)) < 7.99) bad.push('lineSpeed');
    let v1 = 0; R.dispatch(g, car, R.keyOf(s.base)); X.until(() => { v1 = Math.max(v1, car.spd); return idle(car); }, 20);
    // cut the power: the pole and the generator go, the line falls back to the crank
    for (const t of [...L().tiles.values()]) if (t.type === 'pole' || t.type === 'gen') { L().remove(t); S().entities = S().entities.filter((x) => x.id !== t.id); }
    g.power.markDirty(); adv(0.8);
    const comp2 = R.compOf(R.sync(g), R.keyOf(s.base)); if (comp2.powered || comp2.speed !== R.HAND_SPEED) bad.push('unpowered line speed ' + comp2.speed);
    R.dispatch(g, car, R.keyOf(s.face)); let v2 = 0, d = 0; const x0 = car.x; X.until(() => { v2 = Math.max(v2, car.spd); d = Math.abs(car.x - x0); return idle(car); }, 40, 0.1);
    if (v1 < 7.5 || v1 > 8.01) bad.push('powered top speed ' + v1.toFixed(2));
    if (v2 > 2.01 || v2 < 1.9) bad.push('hand crank top speed ' + v2.toFixed(2));
    if (d < 20) bad.push('the cranked cart only went ' + d.toFixed(1) + ' m');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.speed-readout-shows-in-the-cart', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.6); sit(car); press('Backspace'); X.until(() => car.spd > 6, 6);
    adv(0.1); const el = document.getElementById('railHud'); if (!el || el.style.display === 'none') return 'no readout while riding';
    const txt = el.textContent;
    if (!/MINE RAIL/.test(txt) || !/m\/s/.test(txt) || !/POWERED/.test(txt) || !/Backspace/.test(txt) || /undefined|NaN|[—–]/.test(txt)) bad.push('readout: ' + txt);
    const v = parseFloat((txt.match(/(\d+\.\d) m\/s/) || [])[1]); if (!(v > 5)) bad.push('speed in the readout ' + v);
    X.until(() => idle(car), 20); R.unseat(g, car, 'host'); adv(0.1); if (document.getElementById('railHud').style.display !== 'none') bad.push('readout stays after getting off');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.rush-key-on-foot-calls-the-nearest-cart-and-takes-you-home', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.6);
    p().pos.set(cellX(X.ci(-10)), 0, cellZ(s.k) + 3.0); p().vel.set(0, 0, 0);
    const sl = X.sayLog(); try { press('Backspace'); } finally { sl.restore(); }
    if (car.st !== 'run' || car.call !== 'host') bad.push('no cart was called: ' + car.st + ' ' + sl.log.join('|'));
    if (!sl.log.some((l) => /Cart called/.test(l))) bad.push('no call message: ' + sl.log.join('|'));
    // it comes to the nearest piece of track, you climb in on arrival and it carries you on to the base
    X.until(() => car.riders.includes('host'), 20); if (!car.riders.includes('host')) return 'the cart arrived but you were not seated: ' + car.st + ' ' + car.why;
    if (car.st !== 'run') bad.push('after boarding the cart is ' + car.st);
    X.until(() => idle(car), 20);
    if (car.a !== R.keyOf(s.base)) bad.push('not home');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.rush-key-with-no-track-or-no-cart-says-so', async () => {
    X.setup(); const bad = []; let sl = X.sayLog(); p().pos.set(cellX(X.ci(-10)), 0, cellZ(X.ck(0)));
    try { press('Backspace'); } finally { sl.restore(); } if (!sl.log.some((l) => /No track within/.test(l))) bad.push('no track: ' + sl.log.join('|'));
    X.line(X.ci(-12), X.ci(-4), 0, X.ck(-2.2)); sl = X.sayLog(); try { press('Backspace'); } finally { sl.restore(); } if (!sl.log.some((l) => /no free cart/.test(l))) bad.push('no cart: ' + sl.log.join('|'));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.return-trip-goes-back-to-the-face-from-the-base', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.6); sit(car); press('Backspace'); X.until(() => idle(car), 20);
    if (car.a !== R.keyOf(s.base)) return 'did not reach the base';
    const sl = X.sayLog(); try { press('Backspace'); } finally { sl.restore(); }
    if (car.st !== 'run' || car.dst !== R.keyOf(s.face)) bad.push('not heading to the face: ' + car.st + ' ' + car.dst + ' ' + sl.log.join('|'));
    X.until(() => idle(car), 20); if (car.a !== R.keyOf(s.face)) bad.push('not at the face'); if (!car.riders.includes('host')) bad.push('the rider fell off');
    // and from out on the line it goes home again, never to the face
    press('Backspace'); adv(0.5); const mid = car.dst; if (mid !== R.keyOf(s.base)) bad.push('from the face it did not go home');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.plush-load-rides-hands-free-and-sells-at-the-bin', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.6);
    S().carry = []; for (let n = 0; n < 40; n++) S().carry.push({ sp: 3 + (n % 5), vr: 0 }); S().carry.push({ sp: NEEDLE, vr: 0 });
    p().pos.set(car.x - 1.0, 0, car.z); const money0 = S().money, sold0 = S().stats.sold;
    R.useCar(g, car, 'host');
    if (car.cargo.length !== 40 || car.n !== 40) bad.push('loaded ' + car.cargo.length);
    if (S().carry.length !== 1 || S().carry[0].sp !== NEEDLE) bad.push('The One must stay in your hands: ' + S().carry.length);
    if (car.riders.length) bad.push('loading must not seat you');
    R.dispatch(g, car, R.keyOf(s.base)); X.until(() => idle(car), 25);
    X.until(() => car.cargo.length === 0, 8);
    if (car.cargo.length) bad.push('still carrying ' + car.cargo.length); if (car.n !== 0) bad.push('n ' + car.n);
    if (S().stats.sold - sold0 !== 40 || S().money <= money0) bad.push('sold ' + (S().stats.sold - sold0) + ' money ' + (S().money - money0));
    // the cap holds
    S().carry = []; for (let n = 0; n < 150; n++) S().carry.push({ sp: 3, vr: 0 }); R.useCar(g, car, 'host'); if (car.cargo.length !== R.CAR_CAP) bad.push('cap: ' + car.cargo.length);
    if (S().carry.length !== 150 - R.CAR_CAP) bad.push('left in hands ' + S().carry.length);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.loads-do-not-sell-away-from-the-bin', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.5);
    for (let n = 0; n < 10; n++) car.cargo.push({ sp: 3, vr: 0 }); car.n = 10; const m0 = S().money;
    R.dispatch(g, car, R.keyOf(s.face)); X.until(() => idle(car), 20); adv(2);
    if (car.cargo.length !== 10 || S().money !== m0) bad.push('sold at the face end: ' + car.cargo.length);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.hop-off-with-space-and-e-and-a-fast-cart-brakes-first', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.6);
    sit(car); g.keys.Space = true; adv(0.1); g.keys.Space = false; adv(0.1); if (car.riders.length) bad.push('Space did not hop off a parked cart');
    sit(car); g.keys.KeyE = true; adv(0.1); g.keys.KeyE = false; adv(0.1); if (car.riders.length) bad.push('E did not hop off a parked cart');
    sit(car); press('Backspace'); X.until(() => car.spd > 5, 6);
    g.keys.Space = true; adv(0.1); g.keys.Space = false; adv(0.05);
    if (!car.riders.includes('host')) bad.push('hopped off at speed'); if (!car.leave || !car.leave.includes('host')) bad.push('no braking request');
    const x1 = car.x; X.until(() => idle(car), 6); if (Math.abs(car.x - x1) > 9 || Math.abs(car.x - x1) < 1.5) bad.push('braking took ' + Math.abs(car.x - x1).toFixed(1) + ' m');
    if (car.riders.length) bad.push('still seated after the brake stop'); if (car.st !== 'idle') bad.push('state ' + car.st);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.e-on-the-aimed-cart-sits-you-and-e-again-gets-off', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.6);
    p().pos.set(car.x - 1.8, 0, car.z); p().vel.set(0, 0, 0); const e = p().eyePos(new V3()); const dx = car.x - e.x, dy = car.y + 0.4 - e.y, dz = car.z - e.z; p().yaw = Math.atan2(dx, dz); p().pitch = Math.atan2(dy, Math.hypot(dx, dz));
    g.renderer.camera.position.copy(p().eyePos(new V3())); g.useKey();
    if (!car.riders.includes('host')) bad.push('E on the aimed cart did not seat you: ' + JSON.stringify(car.riders));
    adv(0.1); if (!car.riders.includes('host')) bad.push('the E that seated you also hopped you off');
    g.onKey(key('KeyE'), true); adv(0.1); g.onKey(key('KeyE'), false); adv(0.1); if (car.riders.length) bad.push('E on your own cart did not get you off');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.a-cut-track-stops-the-cart-before-the-gap', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.6); sit(car); press('Backspace');
    X.until(() => car.x > cellX(s.iFace) + 9, 10);
    const cutI = X.ci(car.x) + 8, gone = s.track.find((e) => e.i === cutI); g.doDecon({ kind: 'mach', id: gone.id }); R.invalidate(g);
    const sl = X.sayLog(); try { X.until(() => car.st === 'blocked', 12); } finally { sl.restore(); }
    if (car.st !== 'blocked') return 'the cart is ' + car.st + ' at ' + car.x.toFixed(1);
    if (car.x > cellX(cutI) - 0.5 + 1e-6) bad.push('the cart reached the gap: ' + car.x.toFixed(2) + ' vs ' + cellX(cutI).toFixed(2));
    if (car.spd !== 0 || car.riders.length !== 1) bad.push('speed ' + car.spd + ' riders ' + car.riders.length);
    if (!/cut/.test(car.why) || !sl.log.some((l) => /cut/.test(l))) bad.push('no word about the cut: ' + car.why + ' ' + sl.log.join('|'));
    if (Math.hypot(p().pos.x - car.x, p().pos.z - car.z) > 0.3) bad.push('rider moved on');
    // with the way home gone, the rush key says so and the cart stays put
    const x1 = car.x; const sl2 = X.sayLog(); try { press('Backspace'); } finally { sl2.restore(); } adv(0.5);
    if (car.st === 'run' || Math.abs(car.x - x1) > 0.01) bad.push('rushed into a gap'); if (!sl2.log.some((l) => /track to the base is cut/.test(l))) bad.push('no refusal: ' + sl2.log.join('|'));
    // mend the track and it goes
    X.lay(gone.i, 0, gone.k); R.invalidate(g); press('Backspace'); X.until(() => idle(car), 20); if (car.a !== R.keyOf(s.base)) bad.push('did not get home after the repair');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.a-collapse-over-the-track-blocks-the-cart-and-clearing-it-frees-it', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.6); sit(car); press('Backspace');
    X.until(() => car.x > cellX(s.iFace) + 6, 10);
    const bi = X.ci(car.x) + 7; w().setCell(bi, 1, s.k, 3, 0);   // plush came down into the tunnel above the track
    X.until(() => car.st === 'blocked', 12); if (car.st !== 'blocked') return 'not blocked: ' + car.st;
    if (car.x > cellX(bi) + 1e-6) bad.push('drove into the pile'); if (!/blocking/.test(car.why)) bad.push('why: ' + car.why);
    w().setCell(bi, 1, s.k, 0, 0); press('Backspace'); X.until(() => idle(car), 20); if (car.a !== R.keyOf(s.base)) bad.push('did not get home once it was cleared');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.a-cart-whose-track-is-pulled-out-from-under-it-derails-and-can-be-set-back', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.6); sit(car);
    const under = s.track.find((e) => R.keyOf(e) === car.a); g.doDecon({ kind: 'mach', id: under.id }); R.invalidate(g); adv(0.2);
    if (car.st !== 'derailed' || car.riders.length) bad.push('state ' + car.st + ' riders ' + car.riders.length);
    const x0 = car.x; adv(1); if (car.x !== x0) bad.push('a derailed cart moved');
    p().pos.set(car.x - 1, 0, car.z); R.useCar(g, car, 'host'); if (car.st !== 'idle') bad.push('E did not set it back: ' + car.st);
    // a cart that runs onto a removed piece mid trip stops on the last good piece
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.slopes-carry-a-cart-up-and-down-at-45-degrees', async () => {
    X.setup(); const bad = [], k = X.ck(-2.2), i = X.ci(-12);
    X.line(i, i + 6, 0, k); for (let n = 7; n <= 13; n++) w().setCell(i + n, 0, k, 2, 0); X.line(i + 7, i + 13, 1, k);
    const car = X.cart(i, 0, k); R.invalidate(g); adv(0.3);
    const top = R.keyOf({ i: i + 13, j: 1, k }); let maxPitch = 0, yMax = 0; R.dispatch(g, car, top);
    X.until(() => { maxPitch = Math.max(maxPitch, car.pitch || 0); yMax = Math.max(yMax, car.y); return idle(car); }, 30, 0.1);
    if (car.a !== top) bad.push('did not reach the top'); if (Math.abs(maxPitch - Math.PI / 4) > 0.02) bad.push('pitch ' + maxPitch.toFixed(2)); if (Math.abs(car.y - (C + 0.04)) > 0.01) bad.push('top height ' + car.y.toFixed(3));
    const low = R.keyOf({ i, j: 0, k }); let minPitch = 0; R.dispatch(g, car, low); X.until(() => { minPitch = Math.min(minPitch, car.pitch || 0); return idle(car); }, 30, 0.1);
    if (car.a !== low) bad.push('did not come back down'); if (Math.abs(minPitch + Math.PI / 4) > 0.02) bad.push('down pitch ' + minPitch.toFixed(2)); if (Math.abs(car.y - 0.04) > 0.01) bad.push('low height ' + car.y.toFixed(3));
    // the player rides up it with the cart
    sit(car); R.dispatch(g, car, top); let sep = 0; X.until(() => { sep = Math.max(sep, Math.abs(p().pos.y - car.y)); return idle(car); }, 30, 0.1); if (sep > 0.05) bad.push('rider height off by ' + sep.toFixed(2));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.a-junction-sends-the-cart-down-the-branch-it-was-sent-to', async () => {
    X.setup(); const bad = [], k = X.ck(-2.2), i0 = X.ci(-20), i1 = X.ci(1);
    X.line(i0, i1, 0, k); const bk = k + 1; X.lineZ(bk, bk + 6, 0, X.ci(-8));   // a branch to the north from the middle of the line
    const west = X.station(i0, 0, k, 'face'), north = X.station(X.ci(-8), 0, bk + 6, 'face'), base = X.station(i1, 0, k, 'base');
    const car = X.cart(i0 + 1, 0, k); R.invalidate(g); adv(0.3);
    R.dispatch(g, car, R.keyOf(north)); X.until(() => idle(car), 30, 0.1); if (car.a !== R.keyOf(north)) bad.push('did not reach the branch end');
    sit(car); press('Backspace'); X.until(() => idle(car), 30, 0.1); if (car.a !== R.keyOf(base)) bad.push('from the branch it did not get home');
    press('Backspace'); X.until(() => idle(car), 30, 0.1); if (car.a !== R.keyOf(north)) bad.push('the return trip went to ' + (car.a === R.keyOf(west) ? 'the west face' : 'somewhere else'));
    const rs = R.sync(g); if (rs.comps.length !== 1) bad.push('lines ' + rs.comps.length);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.two-carts-share-one-line-and-both-get-home', async () => {
    X.setup(); const bad = [], s = X.std(), a = s.car, b = X.cart(s.iFace + 5, 0, s.k); R.invalidate(g); adv(0.5);
    sit(a); press('Backspace'); R.dispatch(g, b, R.keyOf(s.base));
    X.until(() => idle(a) && idle(b), 25);
    // carts do not overlap (gaps.rail.*): the second one queues behind the first, within two pieces of the base station
    const nearBase = (c) => Math.hypot(c.x - cellX(s.iBase), c.z - cellZ(s.k)) < 3 * C;
    if (!(a.a === R.keyOf(s.base) || b.a === R.keyOf(s.base)) || !nearBase(a) || !nearBase(b) || Math.hypot(a.x - b.x, a.z - b.z) < R.HEADWAY - 0.03) bad.push('they did not both arrive and queue: ' + a.st + ' ' + b.st);
    if (!R.seatedCar(g, 'host')) bad.push('rider lost');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.hammering-a-cart-gives-it-back-with-its-load-and-seats-empty', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.5); sit(car); for (let n = 0; n < 12; n++) car.cargo.push({ sp: 4, vr: 0 }); car.n = 12; S().carry = []; S().items.railcar = 0;
    const bodies0 = g.sim.n; g.doDecon({ kind: 'mach', id: car.id }); R.invalidate(g); adv(0.2);
    if (S().items.railcar !== 1) bad.push('item back: ' + S().items.railcar); if (S().carry.length + (g.sim.n - bodies0) !== 12) bad.push('the load was lost: hands ' + S().carry.length + ', on the floor ' + (g.sim.n - bodies0)); ctx.clearBodies();
    if (R.seatedCar(g, 'host')) bad.push('still seated in a removed cart'); if (document.getElementById('railHud') && document.getElementById('railHud').style.display !== 'none') bad.push('readout stays');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.survives-a-save-and-a-reload-with-cargo-but-no-riders', async () => {
    X.setup(); const bad = [], s = X.std(), car = s.car; adv(0.5); sit(car); for (let n = 0; n < 7; n++) car.cargo.push({ sp: 5, vr: 1 }); car.n = 7; press('Backspace'); X.until(() => car.x > cellX(s.iFace) + 8, 10);
    const raw = JSON.parse(JSON.stringify(S().entities.filter((e) => R.isRailType(e.type)))), counts = { rail: X.ents('rail').length, railstn: X.ents('railstn').length, railcar: X.ents('railcar').length };
    X.clean(); if (X.ents().length) return 'clean left ' + X.ents().length;
    for (const e of raw) { S().entities.push(e); g.addEntity(e); } R.invalidate(g); adv(0.3);
    const now = { rail: X.ents('rail').length, railstn: X.ents('railstn').length, railcar: X.ents('railcar').length };
    if (JSON.stringify(now) !== JSON.stringify(counts)) bad.push('counts ' + JSON.stringify(now) + ' vs ' + JSON.stringify(counts));
    const c2 = X.ents('railcar')[0]; if (!c2 || c2.riders.length || c2.st !== 'idle' || c2.spd !== 0) bad.push('the cart came back ' + (c2 && c2.st));
    if (c2.cargo.length !== 7 || c2.cargo[0].sp !== 5 || c2.cargo[0].vr !== 1) bad.push('cargo ' + c2.cargo.length);
    const rs = R.sync(g); if (rs.comps.length !== 1 || rs.comps[0].n !== s.track.length || rs.stns.length !== 2) bad.push('graph ' + rs.comps.map((c) => c.n));
    if (!rs.nodes.has(c2.a)) bad.push('the cart is not on a piece'); if (!g.machines.items.get(c2.id).obj.children.length) bad.push('no cart mesh after load');
    const nowCar = X.ents('railcar')[0]; R.dispatch(g, nowCar, R.keyOf(s.base)); X.until(() => idle(nowCar), 25); if (nowCar.a !== R.keyOf(s.base)) bad.push('the loaded cart does not run');
    for (const e of raw) if (e.type === 'rail' && !g.world.reserved.has(R.keyOf(e))) { bad.push('track cell not reserved after load'); break; }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.station-role-switches-with-e-and-follows-the-bin-distance', async () => {
    X.setup(); const bad = [], s = X.std(); adv(0.4); const far = { i: toI(-120), j: 0, k: toK(-2.2) }, near = { i: toI(1), j: 0, k: toK(-2.2) };
    if (R.stationRole(g, far) !== 'face' || R.stationRole(g, near) !== 'base') bad.push('auto role ' + R.stationRole(g, far) + '/' + R.stationRole(g, near));
    const stn = s.base; if (stn.role !== 'base') bad.push('setup'); const use = (await import('../catalog.js')).TYPES.railstn.use; use(g, stn); if (stn.role !== 'face') bad.push('E did not switch it to FACE: ' + stn.role);
    const info = infoFor(g, { kind: 'mach', id: stn.id }); if (!/FACE/.test(info.title)) bad.push('title ' + info.title);
    const it = g.machines.items.get(stn.id); if (it.obj.userData.base) bad.push('the post sign was not rebuilt');
    use(g, stn); if (stn.role !== 'base') bad.push('E did not switch it back');
    // a cart parked at a station takes the E for itself (you aimed past the post at the cart)
    const car = s.car; const r0 = s.face.role; use(g, s.face); if (s.face.role !== r0 || !car.riders.includes('host') && Math.hypot(car.x - p().pos.x, car.z - p().pos.z) < 4.5) bad.push('a parked cart did not take the E: ' + s.face.role + ' ' + car.riders);
    return bad.length === 0 || bad.join(' || ');
  });

  void fresh; void cellX; void cellZ;
}
