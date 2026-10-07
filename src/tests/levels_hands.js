// Levels audit: Hands. The lines added above the old maxes (Exo Gauntlets, Cargo Hold, Crane Arms, Bucket Hands, Cyclone Vacuum, Rail Arm, Gravity Well).
// Each is bought through g.buy at every level and measured in what the game does with it.
import { basics, numbers, reqUp } from './levels_common.js';

export default async function (ctx) {
  const { g, S, w, p, sim, T, fresh, adv, near, V3, toI, toJ, toK, cellX, cellY, cellZ, UPGRADES, clearBodies } = ctx;
  const U = (id) => UPGRADES.find((u) => u.id === id);
  const ids = ['exo', 'cargo', 'crane', 'bucketHands', 'cyclone', 'railArm', 'gravWell'];
  for (const id of ids) await basics(ctx, 'hands', id);

  const placed = [];
  const clearCells = () => { for (const c of placed.splice(0)) w().setCell(c[0], c[1], c[2], 0, 0); };
  const put = (i, j, k) => { if (w().get(i, j, k)) return; w().setCell(i, j, k, 2 + ((i + j + k) & 3), 0); placed.push([i, j, k]); };
  const clearBay = () => { for (let a = -30; a <= 40; a++) for (let b = -14; b <= 14; b++) for (let j = 0; j < 8; j++) w().removeCell(toI(0) + a, j, toK(0) + b, false); };
  // a block east of the player, aimed at its front-centre cell: depth deep, +-lat wide and high around the target
  const block = (d, depth, lat, y = 1.5, checker = false) => {
    clearCells(); const ti = toI(3), tj = toJ(y), tk = toK(0);   // checker: every other cell, so every plush is exposed and a big scoop has plenty to take
    for (let a = 0; a < depth; a++) for (let b = -lat; b <= lat; b++) for (let c = -lat; c <= lat; c++) if (!checker || ((a + b + c) & 1) === 0) put(ti + a, tj + b, tk + c);
    const x = cellX(ti), yy = cellY(tj), z = cellZ(tk); p().pos.set(x - d, 0, z); p().vel.set(0, 0, 0);
    const e2 = p().eyePos(new V3()); const dx = x - e2.x, dy = yy - e2.y; p().yaw = Math.atan2(dx, 0); p().pitch = Math.atan2(dy, Math.abs(dx));
    return { ti, tj, tk };
  };
  const eyeDir = () => [p().eyePos(new V3()), p().forward(new V3())];
  const target = () => { const [e, d] = eyeDir(); return g.findTarget(e, d); };
  const finish = () => { clearCells(); clearBodies(); };

  // ---------------------------------------------------------------- numbers
  await numbers(ctx, 'hands', 'exo', (t) => t.grabTime, (l, b) => b * Math.pow(0.82, l), 'down');
  await numbers(ctx, 'hands', 'cargo', (t) => t.carry, (l) => 120 + [0, 60, 160, 400, 1000][l]);
  await numbers(ctx, 'hands', 'crane', (t) => t.reach, (l, b) => b + 2 * l);   // (base: the old top Gantry Arms, 2.4 + 4.5 m)
  await numbers(ctx, 'hands', 'bucketHands', (t) => t.scoop, (l) => 12 + [0, 16, 40, 90, 200][l]);
  await numbers(ctx, 'hands', 'cyclone', (t) => t.vacRate, (l) => 18 + [0, 12, 28, 55, 100][l]);
  await numbers(ctx, 'hands', 'railArm', (t) => t.throwPower, (l, b) => b + 6 * l);
  await numbers(ctx, 'hands', 'gravWell', (t) => t.scavRange, (l) => 10 + [0, 12, 30, 70][l]);

  // ---------------------------------------------------------------- exo gauntlets: the real pause between grabs
  await T('levels.hands.exo.effect', async () => {
    fresh({ ...reqUp(UPGRADES, U('exo')), reach: 4, bag: 8 }); let prevFast = 1e9, prevTap = 1e9; clearBay();
    for (let l = 0; l <= 4; l++) {
      S().up.exo = l; g.T = g.tune(); const ratio = g.T.grabTime / 1.5;
      block(2.0, 8, 2); S().carry = []; g.grabCd = 0; const tg = target(); if (!tg) { finish(); return 'no target'; }
      g.instantGrab(tg, true); const fast = 0.05 + 0.1 * ratio; if (!near(g.grabCd, fast, 1e-9)) { finish(); return `hold pause ${g.grabCd} at level ${l}, expected ${fast}`; }
      if (!(g.grabCd < prevFast)) { finish(); return 'hold pause did not shrink at level ' + l; } prevFast = g.grabCd;
      g.grabCd = 0; g.instantGrab(target(), false); const tap = 0.12 + 0.28 * ratio; if (!near(g.grabCd, tap, 1e-9) || !(g.grabCd < prevTap)) { finish(); return `tap pause ${g.grabCd} at level ${l}`; } prevTap = g.grabCd;
    }
    // bought through the game, the top level is a grab every ~0.1 s
    finish(); return near(prevFast, 0.05 + 0.1 * (1.5 * Math.pow(0.8, 3) * Math.pow(0.82, 4) / 1.5), 1e-9) || 'top pause ' + prevFast;
  });

  // ---------------------------------------------------------------- cargo hold: the hands stop at the new capacity
  await T('levels.hands.cargo.effect', async () => {
    fresh({ ...reqUp(UPGRADES, U('cargo')), reach: 4 }); clearBay(); const cap = [120, 180, 280, 520, 1120];
    for (let l = 0; l <= 4; l++) {
      S().up.cargo = l; g.T = g.tune(); if (g.T.carry !== cap[l]) { finish(); return `capacity ${g.T.carry} at level ${l}`; }
      block(2.0, 8, 2); S().carry = []; for (let q = 0; q < cap[l] - 2; q++) S().carry.push({ sp: 2, vr: 0 }); g.grabCd = 0;
      g.keys.KeyG = true; g.gDownAt = 0; g.holdBlock = false; for (let q = 0; q < 120; q++) { const [e, d] = eyeDir(); g.interact(0.016, e, d); } g.keys.KeyG = false;
      if (S().carry.length !== cap[l]) { finish(); return `holding the grab key filled ${S().carry.length} of ${cap[l]} at level ${l}`; }
      if (g.storeRoom()) { finish(); return 'storeRoom true when full at level ' + l; }
      S().carry.pop(); if (!g.storeRoom()) { finish(); return 'storeRoom false with room at level ' + l; }
    }
    // the HUD says so
    g.ui.setCarry(S().carry, g.T.carry); const hud = g.ui.dials.read('carry').unit; finish();
    return hud === '/ 1120' || 'HUD shows ' + hud;
  });

  // ---------------------------------------------------------------- crane arms: plush just inside the new reach can be grabbed
  await T('levels.hands.crane.effect', async () => {
    fresh({ ...reqUp(UPGRADES, U('crane')) }); clearBay(); const RC = 0.335; const R = (l) => 2.4 + 4.5 + 2 * l;   // Gantry Arms at the top level (the requirement) already give +4.5 m
    for (let l = 0; l <= 3; l++) {
      S().up.crane = l; g.T = g.tune(); if (!near(g.T.reach, R(l), 1e-9)) { finish(); return `T.reach ${g.T.reach} at level ${l}`; }
      for (let k = 0; k <= 3; k++) {
        const d = R(k) + RC - 0.15; clearCells(); const ti = toI(3) + 6, tj = toJ(1.5), tk = toK(0); put(ti, tj, tk);
        p().pos.set(cellX(ti), 0, cellZ(tk)); const y0 = p().eyePos(new V3()).y; const dy = cellY(tj) - y0; const back = Math.sqrt(Math.max(0.01, d * d - dy * dy));
        p().pos.set(cellX(ti) - back, 0, cellZ(tk)); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = Math.atan2(dy, back);
        const tg = target(); const hit = !!(tg && tg.type === 'cell' && tg.i === ti && tg.k === tk);
        if (hit !== (k <= l)) { finish(); return `level ${l}: plush at ${d.toFixed(2)} m (reach of level ${k}) ${hit ? 'was' : 'was not'} grabbable`; }
        S().carry = []; g.grabCd = 0; g.curTargetRef = tg; g.gPress(); const got = S().carry.length === 1; if (got !== (k <= l)) { finish(); return `level ${l}: gPress at ${d.toFixed(2)} m gave ${got}`; }
      }
    }
    finish(); return true;
  });

  // ---------------------------------------------------------------- bucket hands: each grab takes the new number
  await T('levels.hands.bucketHands.effect', async () => {
    fresh({ ...reqUp(UPGRADES, U('bucketHands')), bag: 8, reach: 4 }); S().scoopSet = 1e9; clearBay(); let prev = 0; const got = [];
    for (let l = 0; l <= 4; l++) {
      S().up.bucketHands = l; g.T = g.tune(); const want = 12 + [0, 16, 40, 90, 200][l];
      block(2.0, 14, 6, 1.5, true); S().carry = []; g.grabCd = 0; const tg = target(); if (!tg || tg.type !== 'cell') { finish(); return 'no target'; }
      const c0 = S().stats.cells; g.instantGrab(tg); const n = S().carry.length; got.push(n);
      if (n > 1 + want) { finish(); return `level ${l} took ${n}, more than 1 + ${want}`; }
      if (S().stats.cells - c0 !== n) { finish(); return 'cells count differs from plush taken'; }
      if (!(n > prev)) { finish(); return `level ${l} took ${n}, not more than the level before (${prev}): ${got}`; } prev = n;
      if (l === 0 && n !== 13) { finish(); return 'old scoop changed: ' + n; }   // Scoop Hands at the top: the target and 12 more
    }
    finish(); return prev >= 100 || 'the top level took only ' + prev + ': ' + got;
  });

  // ---------------------------------------------------------------- cyclone vacuum: more plush in one burst, the cone opens with it
  await T('levels.hands.cyclone.effect', async () => {
    fresh({ ...reqUp(UPGRADES, U('cyclone')), bag: 8, cargo: 4, reach: 4 }); clearBay(); let prev = 0; const got = [];   // room for the biggest burst
    for (let l = 0; l <= 4; l++) {
      S().up.cyclone = l; g.T = g.tune(); const rate = 18 + [0, 12, 28, 55, 100][l];
      block(1.5, 16, 11, 1.5, true); S().carry = []; g.grabCd = 0; const tg = target(); if (!tg) { finish(); return 'no target'; }
      g.curTargetRef = tg; g.gPress(); if (S().carry.length !== 0 || !(g.vacT > 0)) { finish(); return 'tap did not start the vacuum'; }
      for (let q = 0; q < 130; q++) { const [e, d] = eyeDir(); g.interact(0.016, e, d); }
      const n = S().carry.length, exp = Math.floor(1.8 * rate); got.push(n);
      if (n > exp + 1) { finish(); return `level ${l} inhaled ${n}, more than the rate allows (${exp})`; }
      if (!(n > prev)) { finish(); return `level ${l} inhaled ${n}, not more than the level before (${prev}): ${got}`; }
      if (l === 0 && Math.abs(n - exp) > 1) { finish(); return `the old top level changed: ${n} vs ${exp}`; }
      prev = n;
    }
    finish(); return prev >= 100 || 'the top level inhaled only ' + prev + ': ' + got;
  });

  // ---------------------------------------------------------------- rail arm: faster throws, real launch speed
  await T('levels.hands.railArm.effect', async () => {
    fresh({ ...reqUp(UPGRADES, U('railArm')) }); let prev = 0;
    for (let l = 0; l <= 3; l++) {
      S().up.railArm = l; g.T = g.tune(); const pw = 35 + 6 * l; if (g.T.throwPower !== pw) return `throwPower ${g.T.throwPower}`;
      S().carry = [{ sp: 2, vr: 0 }]; clearBodies(); p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); p().yaw = 0; p().pitch = 0.1; adv(0.1); g.throwCd = 0; g.throwOne();
      if (sim().n !== 1) return 'no thrown plush';
      const f = p().forward(new V3()); const v = Math.hypot(sim().vx[0] - f.x * pw, sim().vy[0] - (f.y * pw + 1.6), sim().vz[0] - f.z * pw); if (v > 1e-3) return 'launch velocity differs from throwPower: ' + v;
      const sp = Math.hypot(sim().vx[0], sim().vy[0], sim().vz[0]); if (!(sp > prev)) return 'not faster than the level before'; prev = sp;
      // it still lands in the world: a few seconds of flight stay inside the hall and never tunnel through the floor
      for (let t = 0; t < 4 && sim().n > 0; t += 1 / 120) sim().step(1 / 120); if (sim().n && sim().y[0] < -0.5) return 'fell through the floor at level ' + l;
    }
    clearBodies(); return true;
  });

  // ---------------------------------------------------------------- gravity well: plush fly in from the new range
  await T('levels.hands.gravWell.effect', async () => {
    fresh({ ...reqUp(UPGRADES, U('gravWell')), bag: 3 }); const R = [10, 22, 40, 80]; clearBodies();
    const pl = (d) => { clearBodies(); p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); sim().spawn(3, 0, d, 0.8, -1.4, 0, 0, 0, 0); };
    for (let l = 0; l <= 3; l++) {
      S().up.gravWell = l; g.T = g.tune(); if (g.T.scavRange !== R[l]) return `scavRange ${g.T.scavRange} at level ${l}`;
      for (let k = 0; k <= 3; k++) { const d = R[k] - 0.5; S().carry = []; pl(d); g._scT = 0; g.updateScavenge(0.2); const got = S().carry.length === 1; if (got !== (k <= l)) return `level ${l}: plush at ${d.toFixed(1)} m (range of level ${k}) ${got ? 'was' : 'was not'} collected`; }
      S().carry = []; pl(R[l] + 1); g._scT = 0; g.updateScavenge(0.2); if (S().carry.length) return `level ${l} pulled from beyond ${R[l]} m`;
    }
    clearBodies(); return true;
  });
}
