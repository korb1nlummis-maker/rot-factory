// gaps.rail.*: Mine Rail carts follow each other (headway of 1.5 cells), wait at a junction by a right of way, never overlap, and riders stay safe.
// Also the placement rules that keep a belt, a pole, a vault or a lift shaft off a rail cell and the reverse (logistics canPlace reads the reserved cells).
import { makeRail } from './rail_lib.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, adv, V3, toI, toK, cellX, cellZ } = ctx;
  const X = makeRail(ctx), R = X.R, C = 0.6;
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { X.clean(); } });
  const idle = (car) => car.st !== 'run' && (car.spd || 0) === 0;
  const HEAD = () => R.HEADWAY;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const sit = (car) => { p().pos.set(car.x - 1.0, car.y, car.z); p().vel.set(0, 0, 0); return R.useCar(g, car, 'host'); };
  // run the loop for up to `max` s, tracking the smallest centre distance between any two carts
  const watch = (cars, max, stop = () => false, dt = 0.05) => {
    let min = Infinity, t = 0; while (t < max && !stop()) { adv(dt, dt); t += dt; for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) min = Math.min(min, dist(cars[a], cars[b])); }
    return { min, t };
  };

  await guard('gaps.rail.headway-is-one-and-a-half-cells', async () => {
    if (!(Math.abs(R.HEADWAY - 1.5 * C) < 1e-9)) return 'HEADWAY ' + R.HEADWAY;
    return true;
  });

  await guard('gaps.rail.a-cart-stops-behind-a-stopped-cart-and-goes-on-when-it-leaves', async () => {
    X.setup(); const bad = [], s = X.std(), f = s.car; adv(0.5);
    const lead = X.cart(s.iFace + 14, 0, s.k); R.invalidate(g); adv(0.3);
    R.dispatch(g, f, R.keyOf(s.base));
    const w1 = watch([f, lead], 12);
    if (w1.min < HEAD() - 0.03) bad.push('the carts came within ' + w1.min.toFixed(2) + ' m of each other (headway ' + HEAD().toFixed(2) + ')');
    const gap = lead.x - f.x; if (!(gap > HEAD() - 0.03 && gap < HEAD() + 0.7)) bad.push('the follower stopped ' + gap.toFixed(2) + ' m behind');
    if (f.st !== 'run' || (f.spd || 0) > 0.05) bad.push('the follower should wait on its way: ' + f.st + ' ' + f.spd);
    if (!/cart/i.test(f.why || '')) bad.push('no reason given: "' + f.why + '"');
    const inf = infoFor(g, { kind: 'mach', id: f.id }); if (!inf.lines.join(' ').match(/waiting/i)) bad.push('readout does not say it waits: ' + inf.lines.join(' | '));
    // the leader drives off: the follower resumes and both end at the base, still apart
    R.dispatch(g, lead, R.keyOf(s.base)); const w2 = watch([f, lead], 25, () => idle(f) && idle(lead));
    if (w2.min < HEAD() - 0.03) bad.push('overlap while resuming ' + w2.min.toFixed(2));
    if (!idle(f) || !idle(lead)) bad.push('they did not both arrive: ' + f.st + ' ' + lead.st);
    const end = dist(f, lead); if (end < HEAD() - 0.03 || end > HEAD() + 1.3) bad.push('queue at the base ' + end.toFixed(2) + ' m apart');
    if (Math.abs(lead.x - cellX(s.iBase)) > 0.05) bad.push('the leader is not on the base station');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.rail.a-fast-cart-never-catches-a-cart-that-is-slowing-for-a-stop', async () => {
    X.setup(); const bad = [], s = X.std(), f = s.car; adv(0.5);
    const lead = X.cart(s.iFace + 6, 0, s.k); R.invalidate(g); adv(0.3);
    const mid = X.ents('rail').find((e) => e.i === s.iFace + 16);   // the leader stops half way, the follower is sent to the base past it
    R.dispatch(g, lead, R.keyOf(mid)); R.dispatch(g, f, R.keyOf(s.base));
    const w1 = watch([f, lead], 25, () => idle(lead) && f.st === 'run' && (f.spd || 0) < 0.02);
    if (w1.min < HEAD() - 0.03) bad.push('the follower ran up to ' + w1.min.toFixed(2) + ' m');
    if (!idle(lead)) bad.push('the leader should have stopped: ' + lead.st);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.rail.head-on-carts-stop-apart-and-riders-stay-seated', async () => {
    X.setup(); const bad = [], s = X.std(), a = s.car; adv(0.5);
    const b = X.cart(s.iBase - 2, 0, s.k); R.invalidate(g); adv(0.3);
    if (!sit(a)) return 'could not sit'; R.dispatch(g, a, R.keyOf(s.base)); R.dispatch(g, b, R.keyOf(s.face));
    const w1 = watch([a, b], 14);
    if (w1.min < HEAD() - 0.03) bad.push('they passed through each other: closest ' + w1.min.toFixed(2));
    if (a.st === 'derailed' || b.st === 'derailed') bad.push('a cart derailed');
    if (!a.riders.includes('host') || !R.seatedCar(g, 'host')) bad.push('the rider was dropped');
    if (Math.hypot(p().pos.x - a.x, p().pos.z - a.z) > 0.3) bad.push('the rider is not in the cart');
    if (!(a.x < b.x) ) bad.push('they swapped places');
    if ((a.spd || 0) > 0.05 || (b.spd || 0) > 0.05) bad.push('they should be waiting nose to nose: ' + a.spd + ' ' + b.spd);
    // one of them is taken away: the other drives on
    g.doDecon({ kind: 'mach', id: b.id }); R.invalidate(g); const w2 = watch([a], 20, () => idle(a));
    if (a.a !== R.keyOf(s.base)) bad.push('the cart did not get home once the way cleared: ' + a.st + ' ' + a.why);
    void w2;
    return bad.length === 0 || bad.join(' || ');
  });

  // a T: a west arm and a north arm meet at J and the stem runs east to the base
  const tee = () => {
    const k = X.ck(-2.2), iJ = X.ci(-10), iBase = X.ci(0);
    const west = X.line(iJ - 12, iJ - 1, 0, k), north = X.lineZ(k + 1, k + 12, 0, iJ), stem = X.line(iJ, iBase, 0, k);
    const base = X.station(iBase, 0, k, 'base'); const nTip = X.ents('rail').find((e) => e.i === iJ && e.k === k + 12), wTip = X.ents('rail').find((e) => e.i === iJ - 12 && e.k === k);
    X.power(cellX(iBase), cellZ(k) + 1.0); R.invalidate(g); adv(0.4);
    return { k, iJ, iBase, base, west, north, stem, nTip, wTip };
  };

  const run2 = (A, B, dst) => {
    R.dispatch(g, A, dst); R.dispatch(g, B, dst);
    let min = Infinity, waited = 0, who = null, t = 0; const first = { A: null, B: null };
    while (t < 40 && !(idle(A) && idle(B))) {
      adv(0.05, 0.05); t += 0.05; min = Math.min(min, dist(A, B));
      for (const [n, c] of [['A', A], ['B', B]]) { if (c.st === 'run' && /junction/i.test(c.why || '')) { waited += 0.05; who = who || n; } if (!first[n] && Math.hypot(c.x - cellX(tee.iJ), c.z - cellZ(tee.k)) < 0.05) first[n] = t; }
    }
    return { min, waited, who, t, first };
  };
  tee.iJ = 0; tee.k = 0;   // run2 reads where the junction is from here

  await guard('gaps.rail.two-carts-at-a-junction-take-turns-and-never-overlap', async () => {
    X.setup(); const bad = [], t = tee(); tee.iJ = t.iJ; tee.k = t.k;
    const A = X.cart(t.iJ - 6, 0, t.k), B = X.cart(t.iJ, 0, t.k + 6); R.invalidate(g); adv(0.3);
    const r = run2(A, B, R.keyOf(t.base));
    if (r.min < HEAD() * 0.9) bad.push('the carts came within ' + r.min.toFixed(2) + ' m of each other');
    if (!idle(A) || !idle(B)) bad.push('they did not both arrive: ' + A.st + ' ' + B.st + ' ' + A.why + ' ' + B.why);
    if (!(r.waited > 0.1)) bad.push('nobody waited at the junction');
    if (A.id < B.id && r.who !== 'B') bad.push('the lower id (equal distance) should go first, but ' + r.who + ' waited');
    if (r.first.A !== null && r.first.B !== null && !(r.first.A < r.first.B)) bad.push('A should cross the junction first: ' + JSON.stringify(r.first));
    const end = dist(A, B); if (end < HEAD() - 0.03) bad.push('they ended ' + end.toFixed(2) + ' m apart');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.rail.the-cart-nearer-to-the-junction-has-the-right-of-way', async () => {
    X.setup(); const bad = [], t = tee(); tee.iJ = t.iJ; tee.k = t.k;
    const A = X.cart(t.iJ - 10, 0, t.k), B = X.cart(t.iJ, 0, t.k + 3); R.invalidate(g); adv(0.3);   // A is 10 cells out, B only 3
    const r = run2(A, B, R.keyOf(t.base));
    if (r.min < HEAD() * 0.9) bad.push('the carts came within ' + r.min.toFixed(2) + ' m');
    if (!idle(A) || !idle(B)) bad.push('not both arrived');
    if (r.who !== 'A') bad.push('the farther cart A should be the one that waits, got ' + r.who);
    if (!(B.x > A.x)) bad.push('B (nearer the junction) should end ahead of A at the base');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.rail.a-rider-in-the-waiting-cart-is-safe-and-can-hop-off', async () => {
    X.setup(); const bad = [], t = tee();
    const park = X.cart(t.iJ + 5, 0, t.k), B = X.cart(t.iJ, 0, t.k + 6); R.invalidate(g); adv(0.3);   // a cart parked on the stem, B comes down the north arm
    if (!sit(B)) return 'could not sit'; const hp = g.hp;
    R.dispatch(g, B, R.keyOf(t.base)); let held = 0, off = 0, n = 0;
    while (n++ < 400 && !(B.st === 'run' && (B.spd || 0) < 0.02 && /cart/i.test(B.why || ''))) { adv(0.05, 0.05); if (!B.riders.includes('host')) bad.push('the rider was dropped on the way'); }
    if (!(B.st === 'run' && (B.spd || 0) < 0.02)) return 'B never queued behind the parked cart: ' + B.st + ' ' + B.spd + ' ' + B.why;
    for (let q = 0; q < 40; q++) { adv(0.05, 0.05); held++; off = Math.max(off, Math.hypot(p().pos.x - B.x, p().pos.z - B.z)); }
    if (off > 0.3) bad.push('the waiting rider strayed ' + off.toFixed(2) + ' m'); if (g.hp < hp) bad.push('the rider took damage ' + (hp - g.hp));
    if (dist(B, park) < HEAD() - 0.03) bad.push('B is inside the headway of the parked cart: ' + dist(B, park).toFixed(2));
    R.useCar(g, B, 'host'); if (B.riders.includes('host')) bad.push('E did not hop off a waiting cart');
    if (Math.hypot(p().pos.x - B.x, p().pos.z - B.z) > 1.0) bad.push('the player was left ' + Math.hypot(p().pos.x - B.x, p().pos.z - B.z).toFixed(1) + ' m from the cart');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.rail.a-new-cart-cannot-be-set-down-inside-the-headway-of-another', async () => {
    X.setup(); const bad = [], s = X.std(); adv(0.3);
    const here = s.car, near = X.ents('rail').find((e) => e.i === here.i + 1 && e.k === s.k), diag = X.ents('rail').find((e) => e.i === here.i + 2 && e.k === s.k), far = X.ents('rail').find((e) => e.i === here.i + 3 && e.k === s.k);
    for (const [name, e, want] of [['next cell', near, false], ['two cells', diag, true], ['three cells', far, true]]) {
      const why = R.conflict(g, { type: 'railcar', i: e.i, j: e.j, k: e.k }, { kind: 'railcar', id: 'railcar' });
      if ((why === null) !== want) bad.push(`${name}: ${why}`);
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.rail.two-carts-saved-on-one-piece-pull-apart-and-both-get-home', async () => {
    X.setup(); const bad = [], s = X.std(), a = s.car; adv(0.5);
    const node = R.keyOf(s.face) + 1, e = X.ents('rail').find((r) => R.keyOf(r) === node);
    const b = g.placeEntity('railcar', R.buildFields(g, { kind: 'railcar' }, { type: 'railcar', i: e.i, j: e.j, k: e.k }), { quiet: true }); R.invalidate(g); adv(0.2);   // an old save could hold two carts on one piece
    if (Math.hypot(a.x - b.x, a.z - b.z) > 0.01) return 'test setup: the carts are not on one piece';
    R.dispatch(g, a, R.keyOf(s.base)); R.dispatch(g, b, R.keyOf(s.base));
    const w1 = watch([a, b], 6); const sep = dist(a, b); if (sep < HEAD() - 0.03) bad.push('still overlapping after 6 s: ' + sep.toFixed(2));
    watch([a, b], 30, () => idle(a) && idle(b)); if (!idle(a) || !idle(b)) bad.push('they did not both arrive: ' + a.st + ' ' + b.st);
    void w1;
    return bad.length === 0 || bad.join(' || ');
  });
}
