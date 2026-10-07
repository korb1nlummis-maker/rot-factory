// audit_gaps.rail.*: adversarial checks of the rail queue and junction rules. Seeded random networks (lines, crossings, rings), several carts sent at random,
// invariants: no two carts overlap, a cart never skips through another, nothing stays stuck while nobody moves, riders stay in their seat.
import { makeRail } from './rail_lib.js';

export default async function (ctx) {
  const { T, g, S, p, adv, cellX, cellZ } = ctx;
  const X = makeRail(ctx), R = X.R, C = 0.6;
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { g.net.open = false; g.net.role = null; g.remote = null; delete g.netSend; g.netOut.length = 0; X.clean(); } });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const isIdle = (c) => c.st !== 'run';

  // a ring with a bar across: two junctions of 3 and a loop
  const layout = (shape) => {
    const k = X.ck(-5.5), i = X.ci(-16);
    if (shape === 'ring') { X.line(i, i + 9, 0, k); X.line(i, i + 9, 0, k + 5); X.lineZ(k + 1, k + 4, 0, i); X.lineZ(k + 1, k + 4, 0, i + 9); }
    if (shape === 'ladder') { X.line(i, i + 14, 0, k); X.line(i, i + 14, 0, k + 5); for (const d of [0, 7, 14]) X.lineZ(k + 1, k + 4, 0, i + d); }
    if (shape === 'cross') { X.line(i, i + 14, 0, k + 3); X.lineZ(k, k + 2, 0, i + 7); X.lineZ(k + 4, k + 6, 0, i + 7); }
    return { k, i };
  };

  for (const [shape, nCars, seed] of [['ring', 3, 1], ['ladder', 4, 2], ['cross', 4, 3], ['ladder', 5, 4], ['ring', 4, 5], ['cross', 3, 6]]) {
    await guard(`audit_gaps.rail.soak-${shape}-${nCars}-carts-seed-${seed}`, async () => {
      X.setup(); const bad = [], rnd = rng(seed * 7919); layout(shape); R.invalidate(g);
      const nodes = X.ents('rail'); const cars = [];
      const used = new Set();
      while (cars.length < nCars) { const n = nodes[Math.floor(rnd() * nodes.length)]; if (used.has(n.id)) continue; if (cars.some((c) => Math.hypot(cellX(n.i) - c.x, cellZ(n.k) - c.z) < 1.0)) continue; used.add(n.id); cars.push(X.cart(n.i, 0, n.k)); }
      R.invalidate(g); adv(0.4);
      const rider = cars[0]; p().pos.set(rider.x - 1, rider.y, rider.z); R.useCar(g, rider, 'host');
      let lastSig = 0, t = 0, minD = Infinity, stillT = 0, worstStill = 0, lastSend = 0, jumps = 0; const last = new Map(cars.map((c) => [c.id, [c.x, c.z]]));
      while (t < 150) {
        if (t - lastSend > 1.5) { lastSend = t; for (const c of cars) if (isIdle(c) && c.st !== 'derailed' && rnd() < 0.8) { const n = nodes[Math.floor(rnd() * nodes.length)]; R.dispatch(g, c, R.keyOf(n)); } }
        adv(0.05, 0.05); t += 0.05;
        for (let a = 0; a < cars.length; a++) {
          const c = cars[a]; const [lx, lz] = last.get(c.id); const step = Math.hypot(c.x - lx, c.z - lz); last.set(c.id, [c.x, c.z]); if (step > 0.5) jumps++;
          for (let b = a + 1; b < cars.length; b++) minD = Math.min(minD, dist(c, cars[b]));
        }
        // a cycle of carts that all stand still and each wait for the next is a deadlock; it must not last
        let cyc = false; for (const c0 of cars) { let cur = c0; for (let n = 0; n <= cars.length; n++) { const b = cars.find((o) => o.id === (cur.cache && cur.cache.blk)); if (!b || b.st !== 'run' || (b.spd || 0) > 0.05 || (cur.spd || 0) > 0.05) break; if (b === c0) { cyc = true; break; } cur = b; } if (cyc) break; }
        const sig = cars.reduce((a, c) => a + (c.cache.stl || 0) + (c.cache.dtr || 0), 0); if (sig !== lastSig) { lastSig = sig; stillT = 0; }   // a yield resolves the stand off it saw (the next one is a new one)
        if (cyc) { stillT += 0.05; worstStill = Math.max(worstStill, stillT); } else stillT = 0;
      }
      if (minD < C * 0.99) bad.push(`two carts came within ${minD.toFixed(2)} m (a cell is ${C})`);
      if (worstStill > 20) bad.push(`a ring of carts waiting for each other stood still for ${worstStill.toFixed(1)} s (deadlock): ` + cars.map((c) => `#${c.id} ${c.st} ${c.why || ''} blk=${c.cache && c.cache.blk}`).join('; '));
      if (jumps) bad.push(`${jumps} jumps of more than half a metre in one step`);
      if (rider.riders.includes('host') ? false : rider.st !== 'derailed') { /* hopped off by itself is fine only when it arrived */ }
      for (const c of cars) if (c.st === 'derailed') bad.push('a cart derailed');
      return bad.length === 0 || bad.join(' || ');
    });
  }


  // the track is cut and mended at random while carts run: nothing throws or goes NaN, carts that stay on the rails never overlap, a cut leaves riders safe
  for (const seed of [21, 22, 23]) {
    await guard(`audit_gaps.rail.soak-cut-and-mend-seed-${seed}`, async () => {
      X.setup(); const bad = [], rnd = rng(seed * 104729), k = X.ck(-5.5), i = X.ci(-16);
      X.line(i, i + 14, 0, k); X.line(i, i + 14, 0, k + 5); for (const d of [0, 7, 14]) X.lineZ(k + 1, k + 4, 0, i + d); R.invalidate(g);
      const all = X.ents('rail').map((e) => [e.i, e.j, e.k]); const cars = []; const used = new Set();
      while (cars.length < 4) { const n = all[Math.floor(rnd() * all.length)], key = n.join(); if (used.has(key) || cars.some((c) => Math.hypot(cellX(n[0]) - c.x, cellZ(n[2]) - c.z) < 1.0)) continue; used.add(key); cars.push(X.cart(n[0], 0, n[2])); }
      R.invalidate(g); adv(0.4); const rider = cars[0]; p().pos.set(rider.x - 1, rider.y, rider.z); R.useCar(g, rider, 'host');
      let t = 0, minD = Infinity, nextEdit = 2;
      while (t < 120) {
        if (t >= nextEdit) {
          nextEdit = t + 1 + rnd() * 3; const pieces = X.ents('rail');
          if (rnd() < 0.55 && pieces.length > 20) { const e = pieces[Math.floor(rnd() * pieces.length)]; g.doDecon({ kind: 'mach', id: e.id }); }
          else { const [ci, , ck] = all[Math.floor(rnd() * all.length)]; X.lay(ci, 0, ck); }
          R.invalidate(g);
        }
        for (const c of cars) if (c.st !== 'run' && c.st !== 'derailed' && rnd() < 0.05) { const n = X.ents('rail'); if (n.length) R.dispatch(g, c, R.keyOf(n[Math.floor(rnd() * n.length)])); }
        try { adv(0.05, 0.05); } catch (x) { return 'threw: ' + x.message; } t += 0.05;
        for (const c of cars) if (![c.x, c.y, c.z].every(Number.isFinite)) return 'a cart went NaN';
        for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) if (cars[a].st !== 'derailed' && cars[b].st !== 'derailed') minD = Math.min(minD, dist(cars[a], cars[b]));
      }
      if (minD < C * 0.99) bad.push(`two carts on the rails came within ${minD.toFixed(2)} m`);
      for (const c of cars) if (c.riders.length > 2) bad.push('too many riders');
      return bad.length === 0 || bad.join(' || ');
    });
  }

  await guard('audit_gaps.rail.a-ring-of-carts-that-all-want-the-next-carts-spot-does-not-lock', async () => {
    X.setup(); const bad = [], k = X.ck(-5.5), i = X.ci(-16);
    X.line(i, i + 9, 0, k); X.line(i, i + 9, 0, k + 4); X.lineZ(k + 1, k + 3, 0, i); X.lineZ(k + 1, k + 3, 0, i + 9); R.invalidate(g);
    // ring order, 10 + 3 + 10 + 3 = 26
    const ring = []; for (let d = 0; d < 10; d++) ring.push([i + d, k]); for (let d = 1; d <= 3; d++) ring.push([i + 9, k + d]); for (let d = 9; d >= 0; d--) ring.push([i + d, k + 4]); for (let d = 3; d >= 1; d--) ring.push([i, k + d]);
    const at = (n) => ring[(n + 26) % 26]; const ent = (n) => X.ents('rail').find((e) => e.i === at(n)[0] && e.k === at(n)[1]);
    const cars = [0, 9, 18].map((n) => X.cart(at(n)[0], 0, at(n)[1])); R.invalidate(g); adv(0.4);
    // each one wants the spot just beyond the next cart (the shorter way is forward for all of them)
    R.dispatch(g, cars[0], R.keyOf(ent(12))); R.dispatch(g, cars[1], R.keyOf(ent(21))); R.dispatch(g, cars[2], R.keyOf(ent(3)));
    let t = 0, minD = Infinity; while (t < 60 && !cars.every((c) => c.st !== 'run')) { adv(0.05, 0.05); t += 0.05; for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) minD = Math.min(minD, dist(cars[a], cars[b])); }
    if (!cars.every((c) => c.st !== 'run')) bad.push('carts still stuck after 60 s: ' + cars.map((c) => c.st + '/' + (c.why || '') + '/' + (c.spd || 0).toFixed(2)).join(', '));
    if (minD < R.HEADWAY - 0.03) bad.push('overlap ' + minD.toFixed(2));
    return bad.length === 0 || bad.join(' || ');
  });


  await guard('audit_gaps.rail.a-cart-takes-the-other-way-round-a-ring-when-a-cart-parks-in-its-way', async () => {
    X.setup(); const bad = [], k = X.ck(-5.5), i = X.ci(-16);
    X.line(i, i + 9, 0, k); X.line(i, i + 9, 0, k + 4); X.lineZ(k + 1, k + 3, 0, i); X.lineZ(k + 1, k + 3, 0, i + 9); R.invalidate(g);
    const ring = []; for (let d = 0; d < 10; d++) ring.push([i + d, k]); for (let d = 1; d <= 3; d++) ring.push([i + 9, k + d]); for (let d = 9; d >= 0; d--) ring.push([i + d, k + 4]); for (let d = 3; d >= 1; d--) ring.push([i, k + d]);
    const ent = (n) => X.ents('rail').find((e) => e.i === ring[(n + 26) % 26][0] && e.k === ring[(n + 26) % 26][1]);
    const A = X.cart(ring[0][0], 0, ring[0][1]); R.invalidate(g); adv(0.4);
    R.dispatch(g, A, R.keyOf(ent(12))); adv(0.6);                     // A sets off the short way (cells 1 .. 12)
    const P = X.cart(ring[8][0], 0, ring[8][1]); R.invalidate(g);      // a cart parks on cell 8, well in front of it
    let t = 0; while (t < 90 && !(A.st !== 'run')) { adv(0.05, 0.05); t += 0.05; if (dist(A, P) < R.HEADWAY - 0.03) { bad.push('overlap ' + dist(A, P).toFixed(2) + ' at ' + t.toFixed(1) + ' s, speed ' + (A.spd || 0).toFixed(2) + ' ' + A.st + ' dtr ' + A.cache.dtr + ' edge ' + !!A.cache.edge + ' u ' + (A.u || 0).toFixed(2)); break; } }
    if (A.st === 'run') bad.push('A never got there: ' + A.why + ' after ' + t.toFixed(0) + ' s'); else if (A.a !== R.keyOf(ent(12))) bad.push('A stopped at the wrong place: ' + A.st + ' ' + A.why);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('audit_gaps.rail.head-on-carts-on-one-track-do-not-stay-locked-forever', async () => {
    X.setup(); const bad = [], s = X.std(), a = s.car; adv(0.5);
    const b = X.cart(s.iBase - 2, 0, s.k); R.invalidate(g); adv(0.3);
    R.dispatch(g, a, R.keyOf(s.base)); R.dispatch(g, b, R.keyOf(s.face));
    X.until(() => false, 40);
    const stuck = (a.st === 'run' && (a.spd || 0) < 0.02) && (b.st === 'run' && (b.spd || 0) < 0.02);
    if (stuck) bad.push('both carts are still nose to nose after 40 s and both think they are on their way: ' + a.why + ' / ' + b.why);
    if (dist(a, b) < R.HEADWAY - 0.03) bad.push('overlap ' + dist(a, b).toFixed(2));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('audit_gaps.rail.a-cart-ahead-that-derails-or-is-taken-away-frees-the-queue', async () => {
    X.setup(); const bad = [], s = X.std(), f = s.car; adv(0.5);
    const lead = X.cart(s.iFace + 10, 0, s.k); R.invalidate(g); adv(0.3);
    R.dispatch(g, f, R.keyOf(s.base)); X.until(() => f.st === 'run' && (f.spd || 0) < 0.02 && /cart/i.test(f.why || ''), 15);
    if (!(f.st === 'run' && (f.spd || 0) < 0.02)) return 'the follower never queued ' + f.st + ' ' + f.spd;
    lead.st = 'derailed'; R.invalidate(g); X.until(() => f.st !== 'run', 20);
    // a derailed cart is off the rails: the follower must not wait for it for ever (it either drives on or says the track is blocked)
    if (f.st === 'run' && (f.spd || 0) < 0.02) bad.push('the follower waits for a derailed cart: ' + f.why);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('audit_gaps.rail.two-riders-in-one-cart-both-stay-and-both-can-hop-off-while-it-waits', async () => {
    X.setup(); const bad = [], s = X.std(), f = s.car; adv(0.5);
    const lead = X.cart(s.iFace + 12, 0, s.k); R.invalidate(g); adv(0.3);
    g.net.open = true; g.net.role = 'host'; g.netSend = () => {}; g.remote = { pos: { x: f.x, y: f.y, z: f.z }, update() {} };
    p().pos.set(f.x - 1, f.y, f.z); R.useCar(g, f, 'host'); R.seat(g, f, 'guest');
    if (f.riders.length !== 2) return 'could not seat both: ' + f.riders.join(',');
    R.dispatch(g, f, R.keyOf(s.base)); X.until(() => f.st === 'run' && (f.spd || 0) < 0.02 && /cart/i.test(f.why || ''), 15);
    if (f.riders.length !== 2) bad.push('a rider was lost while waiting');
    R.useCar(g, f, 'host'); if (f.riders.includes('host')) bad.push('host did not hop off');
    if (!f.riders.includes('guest')) bad.push('the guest was thrown out when the host left');
    void lead; return bad.length === 0 || bad.join(' || ');
  });
}
