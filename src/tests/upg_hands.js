// Upgrade audit: Hands. Every upgrade is bought through g.buy and then checked by what the game does with it, at every level.
import { purchaseTests } from './upg_common.js';

export default async function (ctx) {
  const { g, S, w, p, sim, T, fresh, adv, aimPoint, near, V3, toI, toJ, toK, cellX, cellY, cellZ, UPGRADES, recipes, CART_CAP, CART_NAMES, craft, clearBodies } = ctx;
  const U = (id) => UPGRADES.find((u) => u.id === id);
  const placed = [];
  const clearCells = () => { for (const c of placed.splice(0)) w().setCell(c[0], c[1], c[2], 0, 0); };
  const put = (i, j, k) => { if (w().get(i, j, k)) return; w().setCell(i, j, k, 2 + ((i + j + k) & 3), 0); placed.push([i, j, k]); };
  // a block east of the player, aimed at its front-centre cell. dx0..dx1 deep, +-lat wide and high around the target.
  const block = (d, depth, lat, y = 1.5) => {
    clearCells();
    const ti = toI(3), tj = toJ(y), tk = toK(0);
    for (let a = 0; a < depth; a++) for (let b = -lat; b <= lat; b++) for (let c = -lat; c <= lat; c++) put(ti + a, tj + b, tk + c);
    const x = cellX(ti), yy = cellY(tj), z = cellZ(tk);
    const e = p().eyePos(new V3());
    p().pos.set(x - d, 0, z); p().vel.set(0, 0, 0);
    const e2 = p().eyePos(new V3()); void e;
    const dx = x - e2.x, dy = yy - e2.y;
    p().yaw = Math.atan2(dx, 0); p().pitch = Math.atan2(dy, Math.abs(dx));
    return { ti, tj, tk };
  };
  const eyeDir = () => [p().eyePos(new V3()), p().forward(new V3())];
  const target = () => { const [e, d] = eyeDir(); return g.findTarget(e, d); };
  const holdFrames = (n, dt = 0.016) => { // hold the grab key
    g.keys.KeyG = true; g.gDownAt = 0; g.holdBlock = false; let grabs = 0, last = S().carry.length;
    for (let q = 0; q < n; q++) { const [e, d] = eyeDir(); g.interact(dt, e, d); if (S().carry.length !== last) { grabs++; last = S().carry.length; } }
    g.keys.KeyG = false; return grabs;
  };
  const finish = () => { clearCells(); clearBodies(); };

  for (const [id, cat] of [['gloves', 'hands'], ['reach', 'hands'], ['bag', 'hands'], ['cart', 'hands'], ['scavenge', 'hands'], ['repeat', 'hands'], ['scoop', 'hands'], ['vac', 'hands'], ['throw', 'hands']]) await purchaseTests(ctx, id, cat);

  // ------------------------------------------------------------------ gloves
  await T('upg.hands.gloves.effect', async () => {
    fresh({ reach: 4, bag: 8 }); let prevCd = 1e9, prevFast = 1e9; const counts = [];
    for (let l = 0; l <= 7; l++) {
      S().up.gloves = l; g.T = g.tune();
      const ratio = Math.pow(0.84, l);
      if (!near(g.T.grabTime, 1.5 * ratio, 1e-9)) return `grabTime ${g.T.grabTime} at level ${l}`;
      block(2.0, 8, 2); S().carry = []; g.grabCd = 0;
      const tg = target(); if (!tg) return 'no target';
      g.instantGrab(tg, true);
      const fast = 0.05 + 0.1 * ratio;
      if (!near(g.grabCd, fast, 1e-9)) return `hold cooldown ${g.grabCd} at level ${l}, expected ${fast}`;
      if (!(g.grabCd < prevFast)) return `hold cooldown did not shrink at level ${l}`;
      prevFast = g.grabCd;
      const t2 = target(); g.grabCd = 0; g.instantGrab(t2, false);
      const tap = 0.12 + 0.28 * ratio;
      if (!near(g.grabCd, tap, 1e-9) || !(g.grabCd < prevCd)) return `tap cooldown ${g.grabCd} at level ${l}`;
      prevCd = g.grabCd;
      // grabs per held second, in the real hold loop
      block(2.0, 8, 2); S().carry = []; g.grabCd = 0; counts.push(holdFrames(Math.round(2.5 / 0.016)));
    }
    finish();
    for (let l = 1; l < counts.length; l++) if (counts[l] < counts[l - 1]) return 'grab count fell: ' + counts.join();
    if (!(counts[7] >= counts[0] * 1.7 && counts[3] > counts[0])) return 'gloves do not speed up holding: ' + counts.join();
    return true;
  });

  // ------------------------------------------------------------------ reach
  await T('upg.hands.reach.effect', async () => {
    fresh({}); const RC = 0.335; const R = (l) => 2.4 + 0.5 * l;
    const rows = [];
    for (let l = 0; l <= 4; l++) {
      if (l) { S().money = 1e12; if (!g.buy('reach')) return 'could not buy reach ' + l; }
      if (!near(g.T.reach, R(l), 1e-9)) return `T.reach ${g.T.reach} at level ${l}`;
      for (let k = 0; k <= 4; k++) {
        // a single plush whose near surface is 0.15 m inside the reach of level k
        const d = R(k) + RC - 0.15, o = clearCells();
        void o; const ti = toI(3), tj = toJ(1.5), tk = toK(0); put(ti, tj, tk);
        const e0 = p().eyePos(new V3()); void e0;
        p().pos.set(cellX(ti), 0, cellZ(tk)); const y0 = p().eyePos(new V3()).y; const dy = cellY(tj) - y0; const back = Math.sqrt(Math.max(0.01, d * d - dy * dy));
        p().pos.set(cellX(ti) - back, 0, cellZ(tk)); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = Math.atan2(dy, back);
        const tg = target(); const hit = !!(tg && tg.type === 'cell' && tg.i === ti && tg.k === tk);
        if (hit !== (k <= l)) return `level ${l}: plush at ${d.toFixed(2)} m (reach of level ${k}) ${hit ? 'was' : 'was not'} grabbable`;
        // and the real grab
        S().carry = []; g.grabCd = 0; g.curTargetRef = tg; g.gPress();
        const got = S().carry.length === 1; if (got !== (k <= l)) return `level ${l}: gPress at ${d.toFixed(2)} m gave ${got}`;
        rows.push(l + ':' + k + ':' + hit);
      }
    }
    finish(); return true;
  });

  // ------------------------------------------------------------------ bag
  await T('upg.hands.bag.effect', async () => {
    fresh({ reach: 4 }); const cap = [1, 3, 6, 10, 16, 26, 42, 70, 120]; const u = U('bag');
    if (!u.names || u.names.length !== u.max + 1) return 'names count';
    for (let l = 0; l <= 8; l++) {
      if (l) { S().money = 1e12; if (!g.buy('bag')) return 'could not buy bag ' + l; }
      if (g.T.carry !== cap[l]) return `capacity ${g.T.carry} at level ${l}`;
      if (l && !(cap[l] > cap[l - 1])) return 'capacity not increasing';
      // hands almost full, hold the grab key: it must stop exactly at the capacity
      block(2.0, 8, 2); S().carry = []; for (let q = 0; q < Math.max(0, cap[l] - 2); q++) S().carry.push({ sp: 2, vr: 0 }); g.grabCd = 0;
      holdFrames(120);
      if (S().carry.length !== cap[l]) return `holding the grab key filled ${S().carry.length} of ${cap[l]} at level ${l}`;
      if (g.storeRoom()) return 'storeRoom true when full at level ' + l;
      S().carry.pop(); if (!g.storeRoom()) return 'storeRoom false with room at level ' + l;
    }
    finish(); return true;
  });

  // ------------------------------------------------------------------ cart
  await T('upg.hands.cart.effect', async () => {
    fresh({ bag: 1 }); const desc = U('cart').desc;
    const caps = (desc.match(/\(([\d /]+)\)/) || [])[1];
    if (!caps || caps.split('/').map((s) => +s.trim()).join() !== CART_CAP.slice(1).join()) return 'desc capacities do not match CART_CAP: ' + caps;
    for (let i = 1; i <= 5; i++) if (!desc.includes(CART_NAMES[i])) return 'desc misses ' + CART_NAMES[i];
    for (let l = 0; l <= 5; l++) {
      if (l) { S().money = 1e12; if (!g.buy('cart')) return 'could not buy cart ' + l; }
      const ids = recipes(g).filter((r) => r.kind === 'cart').map((r) => r.id);
      const want = Array.from({ length: l }, (_, i) => 'cart:' + (i + 1));
      if (ids.join() !== want.join()) return `level ${l} recipes ${ids.join()}`;
      for (let t = 1; t <= l; t++) { const r = recipes(g).find((x) => x.id === 'cart:' + t); if (!(r.price > 0) || (t > 1 && !(r.price > recipes(g).find((x) => x.id === 'cart:' + (t - 1)).price)) || !r.desc.includes(String(CART_CAP[t]))) return 'recipe ' + t; }
      if (!l) continue;
      // craft the top tier, roll it out, and fill it: it takes exactly its capacity once your hands are full
      S().cart = null; g.cart.sync(); S().items = {}; S().money = 1e12; const m0 = S().money;
      craft('cart:' + l); if (S().items['cart:' + l] !== 1) return 'could not craft tier ' + l;
      if (m0 - S().money !== recipes(g).find((x) => x.id === 'cart:' + l).price) return `crafting charged ${m0 - S().money}`;
      p().pos.set(0, 0, 0); g.useCart(); const c = S().cart; if (!c || c.tier !== l) return 'no cart tier ' + l;
      c.x = 0; c.z = 1; c.y = 0; c.load.length = 0; S().carry = []; for (let q = 0; q < g.T.carry; q++) S().carry.push({ sp: 2, vr: 0 });
      let taken = 0; for (let q = 0; q < CART_CAP[l] + 5; q++) if (g.routeToCart({ sp: 2, vr: 0 }, new V3(0, 1, 0))) taken++;
      if (taken !== CART_CAP[l] || c.load.length !== CART_CAP[l]) return `tier ${l} took ${taken}, expected ${CART_CAP[l]}`;
    }
    S().cart = null; g.cart.sync(); finish(); return true;
  });

  // ------------------------------------------------------------------ scavenger magnet
  await T('upg.hands.scavenge.effect', async () => {
    fresh({ bag: 1 }); const R = [0, 3, 6, 10]; const pl = (d) => { clearBodies(); p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); sim().spawn(3, 0, d, 0.8, -1.4, 0, 0, 0, 0); };
    for (let l = 0; l <= 3; l++) {
      if (l) { S().money = 1e12; if (!g.buy('scavenge')) return 'could not buy ' + l; }
      if (g.T.scavRange !== R[l]) return 'scavRange ' + g.T.scavRange;
      for (let k = 1; k <= 3; k++) {
        const d = R[k] - 0.3; S().carry = []; pl(d); g._scT = 0; g.updateScavenge(0.2);
        const got = S().carry.length === 1; if (got !== (k <= l)) return `level ${l}: plush at ${d.toFixed(1)} m (range of level ${k}) ${got ? 'was' : 'was not'} collected`;
      }
      if (l) { S().carry = []; pl(R[l] + 0.5); g._scT = 0; g.updateScavenge(0.2); if (S().carry.length) return `level ${l} pulled from beyond ${R[l]} m`; }
    }
    // hands full + cart near: it rides on the cart
    fresh({ bag: 1, cart: 1, scavenge: 1 }); craft('cart:1'); p().pos.set(0, 0, -1.4); g.useCart(); const c = S().cart; c.x = 0; c.z = 0; c.y = 0; c.load.length = 0;
    S().carry = Array.from({ length: g.T.carry }, () => ({ sp: 2, vr: 0 })); clearBodies(); sim().spawn(3, 0, 1.5, 0.8, -1.4, 0, 0, 0, 0); g._scT = 0; g.updateScavenge(0.2);
    if (c.load.length !== 1) return 'did not go onto the cart';
    S().cart = null; g.cart.sync(); clearBodies(); return true;
  });

  // ------------------------------------------------------------------ auto-grip
  await T('upg.hands.repeat.effect', async () => {
    const run = (up) => {
      fresh({ bag: 8, reach: 4, ...up }); block(2.0, 8, 2); S().carry = []; g.grabCd = 0; g.keys.KeyG = true; g.gDownAt = 0; g.holdBlock = false;
      const [e, d] = eyeDir(); g.interact(0.016, e, d); const first = S().carry.length; const cd = g.grabCd; g.keys.KeyG = false;
      const n = holdFrames(Math.round(2 / 0.016)); return { first, cd, per: S().carry.length };
    };
    const a = run({}), b = run({ gloves: 0 }); void b;
    S().money = 1e12; const base = run({}); const ag = run({ repeat: 1 });
    if (base.first !== 1 || ag.first !== 2) return `plush per grab ${base.first} vs ${ag.first}`;
    if (!near(ag.cd, base.cd * 0.5, 1e-9)) return `pause ${ag.cd} vs ${base.cd}`;
    if (!(ag.per >= base.per * 3.2)) return `held for 2 s: ${base.per} vs ${ag.per}`;
    void a; finish(); return true;
  });

  // ------------------------------------------------------------------ scoop
  await T('upg.hands.scoop.effect', async () => {
    const S_ = [0, 1, 3, 6, 12];
    for (let l = 0; l <= 4; l++) {
      fresh({ bag: 8, reach: 4, scoop: l });
      if (g.T.scoop !== S_[l]) return 'T.scoop ' + g.T.scoop;
      // a block with a hollow centre: the target in front and plenty of exposed plush behind it
      block(2.0, 4, 1); S().carry = []; g.grabCd = 0; const tg = target(); if (!tg || tg.type !== 'cell') return 'no target';
      const n0 = S().stats.cells; g.instantGrab(tg);
      if (S().carry.length !== 1 + S_[l]) return `level ${l} scoop gave ${S().carry.length}, expected ${1 + S_[l]}`;
      if (S().stats.cells - n0 !== 1 + S_[l]) return 'cells count';
    }
    finish(); return true;
  });

  // ------------------------------------------------------------------ vacuum
  await T('upg.hands.vac.effect', async () => {
    const rate = [0, 3, 5, 8, 12, 18]; let prev = 0;
    for (let l = 1; l <= 5; l++) {
      fresh({ bag: 8, reach: 4, vac: l });
      if (g.T.vacRate !== rate[l]) return 'vacRate ' + g.T.vacRate;
      block(1.5, 12, 3); S().carry = []; g.grabCd = 0; const tg = target(); if (!tg) return 'no target';
      g.curTargetRef = tg; g.gPress(); // a tap now starts the vacuum burst instead of one grab
      if (S().carry.length !== 0 || !(g.vacT > 0)) return 'tap did not start the vacuum';
      for (let q = 0; q < 120; q++) { const [e, d] = eyeDir(); g.interact(0.016, e, d); }
      const got = S().carry.length, exp = Math.floor(1.8 * rate[l]);
      if (Math.abs(got - exp) > 1) return `level ${l} inhaled ${got} in one burst, expected about ${exp}`;
      if (!(got > prev)) return 'not more than the level before'; prev = got;
    }
    finish(); return true;
  });

  // ------------------------------------------------------------------ throwing arm
  await T('upg.hands.throw.effect', async () => {
    let prevRange = 0, prevSag = 1e9; const ranges = [];
    for (let l = 0; l <= 6; l++) {
      fresh({ throw: l }); if (g.T.throwPower !== 11 + 4 * l) return 'throwPower ' + g.T.throwPower;
      S().carry = [{ sp: 2, vr: 0 }]; clearBodies(); p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); p().yaw = 0; p().pitch = 0.1; adv(0.1); g.throwCd = 0; g.throwOne();
      if (sim().n !== 1) return 'no thrown plush';
      const f = p().forward(new V3()), pw = 11 + 4 * l;
      const v = Math.hypot(sim().vx[0] - f.x * pw, sim().vy[0] - (f.y * pw + 1.6), sim().vz[0] - f.z * pw); if (v > 1e-6) return 'launch velocity differs from throwPower: ' + v;
      const x0 = sim().x[0], y0 = sim().y[0], z0 = sim().z[0], vy0 = sim().vy[0], vh = Math.hypot(sim().vx[0], sim().vz[0]);
      let sag = null, range = 0, t = 0, d04 = null;
      for (; t < 6 && sim().n > 0; t += 1 / 120) { sim().step(1 / 120); if (!sim().n) break; const dh = Math.hypot(sim().x[0] - x0, sim().z[0] - z0); range = dh; if (d04 === null && t >= 0.4) d04 = dh; if (sag === null && dh >= 5) sag = (y0 + vy0 / vh * dh) - sim().y[0]; if (sim().y[0] < 0.45 && t > 0.15) break; }
      ranges.push(+range.toFixed(1));
      if (sag === null) return `level ${l} stopped at ${range.toFixed(1)} m, before 5 m`;
      if (d04 === null || !(d04 > prevRange) || d04 < vh * 0.4 * 0.85) return `level ${l}: ${d04 && d04.toFixed(2)} m in 0.4 s, level before ${prevRange.toFixed(2)}, free flight ${(vh * 0.4).toFixed(2)}`;
      if (!(sag < prevSag)) return `arc not flatter at level ${l}: sag ${sag.toFixed(2)} vs ${prevSag.toFixed(2)}`;
      prevRange = d04; prevSag = sag;
    }
    finish(); window.__throwRanges = ranges; return true;
  });
}
