// audit_avalanche_player.js: adversarial checks of what a climbing avalanche does to the player (src/avalanche.js): who counts as a rider, a death in the flow,
// the stop at the bottom, being buried by the runout, and the damage shield.
import { kit, AV } from './avalanche_lib.js';

export default async function (ctx) {
  const { T, g, S, w, p, sim, stepSim, toI, toK } = ctx;
  const K = kit(ctx), { hi, reset, go, ride, logHurts, av, C } = K;
  const frames = (n, dt = 0.05) => { for (let q = 0; q < n; q++) { g.time += dt; g.updatePlay(dt); } };
  // stand the player at u metres along the slab's downhill axis and v across it, on the surface there
  const stand = (a, u, v) => {
    const x = a.x + a.dx * u - a.dz * v, z = a.z + a.dz * u + a.dx * v, i = toI(x), k = toK(z), t = w().topAt(i, k);
    p().pos.set(x, t * C, z); p().footCell = { i, j: t - 1, k }; p().onGround = true; p().vel.set(0, 0, 0); p().swept = 0;
  };

  // how many times the slab dragged the player with no plush near it (the rider rule: applyRide with nothing around) while fn runs
  const fallbackCalls = (fn) => { let n = 0; const o = av().applyRide.bind(av()); av().applyRide = (vx, vy, vz, c, dt) => { if (c === 0) n++; return o(vx, vy, vz, c, dt); }; try { fn(); } finally { delete av().applyRide; } return n; };
  // a spot on the surface clear of the slab (at least `extra` m outside its width) that is a slope the flow could drag a player down: { u, v } or null
  const beside = (a, extra = 6) => {
    for (const side of [1, -1]) for (const u of [2, 5, 8]) {
      const v = side > 0 ? a.vMax + extra : a.vMin - extra, x = a.x + a.dx * u - a.dz * v, z = a.z + a.dz * u + a.dx * v, i = toI(x), k = toK(z), t = w().topAt(i, k);
      const sl = av().slope(i, k); if (t * C > 6 && sl && sl.tan > 0.25) return { u, v };
    }
    return null;
  };

  await T('avalanche.audit.a-player-who-steps-out-of-the-slab-during-the-warning-is-not-dragged-after-it', async () => {
    const bad = [];
    try {
      reset({}); hi(30); const a = go({ warn: 0.6 }); if (!a) return 'no slab';
      if (!a.rider) return 'the player was not inside the slab at the start (test set up wrongly)';
      // during the warning the player runs 14 m sideways, clear of the sheet (the slab is at most 20 m wide)
      const sp = beside(a, 6); if (!sp) return 'no slope beside the slab to stand on (test set up wrongly)'; stand(a, sp.u, sp.v);
      const drag = fallbackCalls(() => ride(14, 0.05));
      if (drag) bad.push('the slope dragged the player who had stepped out of the slab for ' + drag + ' frames (plush that really reaches the player may still carry it)');
      return bad.length === 0 || bad.join('; ');
    } finally { reset({}); }
  });

  await T('avalanche.audit.a-player-in-a-tunnel-under-the-slab-is-not-a-rider', async () => {
    const bad = [];
    try {
      reset({}); hi(30); const pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
      const free = av().plan(pos, { rnd: () => 0.5, depth: 3 }); if (!free) return 'no plan';
      let q = 0; for (let n = 0; n < free.n; n++) if (w().topAt(free.ci[n], free.ck[n]) >= 80) { q = n; break; }
      const ci = free.ci[q], ck = free.ck[q], t = w().topAt(ci, ck), top = t - 3 - 12, j0 = top - 4; if (j0 < 4) return 'the slope is too low at the test spot';
      for (let a = -5; a < 5; a++) for (let b = -5; b < 5; b++) for (let j = j0; j < top; j++) w().removeCell(ci + a, j, ck + b, false);   // a 10 x 10 x 4 cell room, 7 m of pile over it and 2 m of slab on top
      w().creaking.clear(); w().stabQueue.length = 0; g._shedT = g.time + 1e9;
      p().pos.set(ctx.cellX(ci), j0 * C + 0.02, ctx.cellZ(ck)); p().vel.set(0, 0, 0); p().footCell = { i: ci, j: j0 - 1, k: ck }; p().onGround = true; p().swept = 0; g.hp = 100;
      const a = go({ warn: 0.3, depth: 3 }); if (!a) return 'no slab';
      if (a.rider) bad.push('the player in the tunnel was marked as a rider at the start');
      let swept = 0, vmax = 0; const y0 = p().pos.y;
      ride(14, 0.05, () => { if (p().swept > 0) swept++; vmax = Math.max(vmax, Math.hypot(p().vel.x, p().vel.z)); });
      if (swept) bad.push('the player in the tunnel was carried for ' + swept + ' frames'); if (vmax > 3) bad.push('and pushed to ' + vmax.toFixed(1) + ' m/s');
      if (g.hp < 100) bad.push('and hurt: ' + (100 - g.hp));
      void y0;
      return bad.length === 0 || bad.join('; ');
    } finally { reset({}); }
  });

  await T('avalanche.audit.a-player-who-dies-and-wakes-up-elsewhere-is-not-swept-by-the-old-slab', async () => {
    const bad = [];
    try {
      reset({}); hi(30); const a = go({ warn: 0.3 }); if (!a) return 'no slab';
      frames(14); if (!(p().swept > 0)) return 'the player was not being carried at 0.7 s';
      // the player dies in the flow (any cause); a moment later it wakes up at a depot high on another slope (the recall's place)
      g.hp = 100; g.dead = true; frames(4); g.dead = false; g.blacking = false;
      // the depot is on a different part of the pile, on a slope beside the slab
      const sp = beside(a, 8); if (!sp) return 'no slope beside the slab to wake up on (test set up wrongly)'; stand(a, sp.u, sp.v);
      const drag = fallbackCalls(() => ride(8, 0.05));
      if (drag) bad.push('the slope dragged the player who woke up elsewhere for ' + drag + ' frames');
      return bad.length === 0 || bad.join('; ');
    } finally { reset({}); }
  });

  await T('avalanche.audit.after-the-ride-the-player-can-always-get-out-of-the-runout', async () => {
    const bad = [], rows = [];
    try {
      for (const [y, dir] of [[26, 1], [30, -1], [34, 1]]) {
        reset({}); hi(y, 10, dir); const a = go({ warn: 0.3 }); if (!a) { bad.push('no slab at ' + y); continue; }
        // the player rides, then stands still at the bottom with the runout settling round (the worst case for burying)
        ride(30, 0.05); frames(100);
        const row = { y, emb: !!p().embedded, buried: +p().buried.toFixed(1), hp: Math.round(g.hp) }; rows.push(row);
        if (p().embedded || p().buried > 0.3) {
          // the game's own way out: punch with the key held. It has to work within a few seconds
          g.keys.Space = true; let t = 0; while ((p().embedded || p().buried > 0.3) && t < 8) { frames(1); t += 0.05; } g.keys.Space = false;
          row.out = +t.toFixed(1); if (t >= 8) bad.push('still stuck after 8 s of punching ' + JSON.stringify(row));
        }
        if (g.dead) bad.push('dead ' + JSON.stringify(row));
      }
      return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(rows);
    } finally { g.keys.Space = false; reset({}); }
  });

  await T('avalanche.audit.every-ride-ends-with-the-flow-state-clean', async () => {
    const bad = [];
    try {
      reset({}); hi(30); const a = go({ warn: 0.3 }); if (!a) return 'no slab';
      ride(40, 0.05); frames(40);
      if (p().swept > 0) bad.push('swept ' + p().swept.toFixed(2) + ' after the ride'); if (av().rideT > 0) bad.push('rideT ' + av().rideT); if (Math.abs(av().roll) > 0.001) bad.push('camera roll ' + av().roll.toFixed(3));
      if (av().shieldLeft > 0.01 && !av().cur) bad.push('the damage shield is still up: ' + av().shieldLeft);
      // and the shield is off: a plain hard landing hurts in full again
      g.hp = 100; g.hurtPlayer(30, 'fell too far'); if (g.hp !== 70) bad.push('a fall after the ride was cut to ' + (100 - g.hp));
      return bad.length === 0 || bad.join('; ');
    } finally { reset({}); }
  });

  await T('avalanche.audit.a-fall-near-the-slab-but-not-in-it-is-not-cushioned', async () => {
    const bad = [];
    try {
      reset({}); hi(30); const a = go({ warn: 0.2 }); if (!a) return 'no slab';
      frames(30);   // the slab is flowing
      const sp = beside(a, 8); if (!sp) return 'no slope beside the slab (test set up wrongly)'; stand(a, sp.u, sp.v); p().swept = 0; av().rideT = 0; av().dMin = 12; av().shieldLeft = 12;   // the player is 12 m from the nearest body, standing clear and not carried
      g.hp = 100; g.hurtPlayer(30, 'fell too far');
      if (g.hp > 70.01) bad.push('a fall near a slide was cut to ' + (100 - g.hp) + ' for a player who is not in the flow');
      return bad.length === 0 || bad.join('; ');
    } finally { reset({}); }
  });
}
