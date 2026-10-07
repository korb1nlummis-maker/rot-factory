// stack.audit.walk-*: the audit of wave 10, walking the building with the real Player: sprint, jump and crouch on the switchback stair in every turn, head bumps under plates, the
// ladder from every side and a seeded random wanderer over three levels that must never end up stuck inside a cell (stack.js, build.js walkStep, player.js).
import { kit, UP } from './stack_lib.js';

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export default async function (ctx) {
  const { T, g, S, p, adv, craft, selectTool, plan } = ctx;
  const K = kit(ctx), W = K.W, ST = K.ST, C = 0.6;
  const twoLevels = async (od = 0, o = {}) => {
    const Y = K.yard({ levels: 2, east: true, ...o }); const [A, B2] = K.stack(Y, ['steel', 'steel']);
    const a = await K.putPlate(A, 'f', 0, 0); if (!a.ok) throw new Error('lower plate: ' + a.why);
    const b = await K.putPlate(A, 'c', 1, od); if (!b.ok) throw new Error('upper landing: ' + b.why);
    return { Y, A, B2 };
  };
  const centre = (i, k) => ({ x: K.cellX(i), z: K.cellZ(k) });
  const route = (Y, od) => { const cell = (x, z) => { const [a, b] = ST.turnCell(x, z, od); return centre(Y.m + a, Y.lo + b); }; return [cell(3, 0), cell(3, 3), cell(2, 3), cell(2, 0), cell(1, 0)]; };
  // steer toward a point with the given extra keys; `each` runs every step (jump bursts, checks)
  const steer = (target, inp = {}, max = 4, each = null) => {
    for (let n = 0; n < max * 60; n++) {
      const dx = target.x - p().pos.x, dz = target.z - p().pos.z, d = Math.hypot(dx, dz); if (d < 0.18) return true;
      p().yaw = Math.atan2(dx, dz); K.walk(1 / 60, { fwd: 1, ...(typeof inp === 'function' ? inp(n) : inp) }, null, 1 / 60); if (each && each(n)) return false;
    }
    return false;
  };
  const sane = () => Number.isFinite(p().pos.x + p().pos.y + p().pos.z) && !p().embedded;
  const solidAround = () => { const x = p().pos.x, z = p().pos.z, y = p().pos.y; return W().solid(ctx.toI(x), ctx.toJ(y + 0.9), ctx.toK(z)) && W().solid(ctx.toI(x), ctx.toJ(y + 0.3), ctx.toK(z)); };

  await T('stack.audit.walk-sprinting-up-and-down-the-switchback-in-every-turn-reaches-the-top-and-comes-back', async () => {
    const bad = [];
    for (let od = 0; od < 4; od++) {
      const { Y, A } = await twoLevels(od, { dx: od * 70 }); const r = await K.putStair(A, od); if (!r.ok) { bad.push(`od ${od}: ${r.why}`); continue; } K.tick(0.1);
      const R = route(Y, od); p().pos.set(R[0].x, 0.62, R[0].z); p().vel.set(0, 0, 0); p().pitch = 0; K.walk(0.3, {});
      let ok = true, maxY = 0;
      for (const tgt of R) if (!steer(tgt, { sprint: true }, 4, () => { maxY = Math.max(maxY, p().pos.y); return !sane(); })) { ok = false; bad.push(`od ${od}: sprint stuck at ${p().pos.x.toFixed(2)}, ${p().pos.y.toFixed(2)}, ${p().pos.z.toFixed(2)} for ${tgt.x.toFixed(2)}, ${tgt.z.toFixed(2)}`); break; }
      K.walk(0.4, {}); if (ok && Math.abs(p().pos.y - 3.0) > 0.35) bad.push(`od ${od}: sprint ended at y ${p().pos.y.toFixed(2)}`);
      if (maxY > 3.0 + 0.5) bad.push(`od ${od}: shot up to ${maxY.toFixed(2)}`);
      if (ok) { const back = [...R].reverse().slice(1); for (const tgt of back) if (!steer(tgt, { sprint: true }, 4)) { bad.push(`od ${od}: sprint down stuck at y ${p().pos.y.toFixed(2)}`); break; } K.walk(0.6, {}); if (p().pos.y > 1.0) bad.push(`od ${od}: not back down: ${p().pos.y.toFixed(2)}`); }
    }
    return bad.length === 0 || bad.join(' | ');
  });

  await T('stack.audit.walk-jumping-all-the-way-up-the-switchback-never-sticks-and-never-passes-through-the-plate', async () => {
    const bad = [];
    for (let od = 0; od < 4; od++) {
      const { Y, A } = await twoLevels(od, { dx: od * 70 }); const r = await K.putStair(A, od); if (!r.ok) { bad.push(`od ${od}: ${r.why}`); continue; } K.tick(0.1);
      const R = route(Y, od); p().pos.set(R[0].x, 0.62, R[0].z); p().vel.set(0, 0, 0); p().pitch = 0; K.walk(0.3, {});
      let ok = true, below = 0;
      for (const tgt of R) if (!steer(tgt, (n) => ({ jump: n % 25 < 3, sprint: n % 90 > 40 }), 6, () => { if (!sane() || solidAround()) { below++; return true; } return false; })) { ok = false; bad.push(`od ${od}: jumping, stuck at ${p().pos.x.toFixed(2)}, ${p().pos.y.toFixed(2)}, ${p().pos.z.toFixed(2)} (${below} bad frames)`); break; }
      K.walk(0.6, {}); if (ok && Math.abs(p().pos.y - 3.0) > 0.4) bad.push(`od ${od}: jumping ended at y ${p().pos.y.toFixed(2)}`);
    }
    return bad.length === 0 || bad.join(' | ');
  });

  await T('stack.audit.walk-crouching-or-slowed-by-dust-up-the-switchback-and-onto-the-plate-in-every-turn', async () => {
    // a slow walker pushes so softly into the edge of the plate that the collision only lifts the feet a hair and the snap to the stair tread pulled them down again
    const bad = [], w0 = g.T.walk;
    try {
      for (const [mi, [name, inp, mul]] of [['crouching', { crouch: true }, 1], ['slowed to 55%', {}, 0.55], ['slowed to 40%', {}, 0.4]].entries()) for (let od = 0; od < 4; od++) {
        const { Y, A } = await twoLevels(od, { dx: (mi * 4 + od) * 60 }); g.T.walk = w0 * mul;
        const r = await K.putStair(A, od); if (!r.ok) { bad.push(`${name} od ${od}: ${r.why}`); continue; } K.tick(0.1); g.T.walk = w0 * mul;
        const R = route(Y, od); p().pos.set(R[0].x, 0.62, R[0].z); p().vel.set(0, 0, 0); p().pitch = 0; K.walk(0.3, {});
        let ok = true; for (const tgt of R) if (!steer(tgt, inp, 10)) { ok = false; bad.push(`${name} od ${od}: stuck at ${p().pos.x.toFixed(2)}, ${p().pos.y.toFixed(2)}, ${p().pos.z.toFixed(2)}`); break; }
        K.walk(0.5, {}); if (ok && Math.abs(p().pos.y - 3.0) > 0.4) bad.push(`${name} od ${od}: ended at y ${p().pos.y.toFixed(2)}`);
        // and back down the way you came: the lip must not hold a slow walker up on the plate
        if (ok) { for (const tgt of [...R].reverse().slice(1)) if (!steer(tgt, inp, 10)) { bad.push(`${name} od ${od}: stuck on the way down at y ${p().pos.y.toFixed(2)}`); ok = false; break; } if (ok) { K.walk(0.8, {}); if (p().pos.y > 1.0) bad.push(`${name} od ${od}: not back down: y ${p().pos.y.toFixed(2)}`); } }
      }
    } finally { g.T.walk = w0; }
    return bad.length === 0 || bad.join(' | ');
  });

  await T('stack.audit.walk-jumping-under-a-ceiling-plate-bumps-the-head-and-never-wedges-you', async () => {
    // a level is one plate row and three clear rows (1.8 m): a full jump under the next level's plate must bounce off it
    const { Y, A } = await twoLevels(0);   // the top plate of A's level is the landing; a full plate on a second column is the roof over the walker
    K.dig(Y.m + 4, 0, Y.lo, 4, 8, 4); const D = K.cube('steel', Y.m + 4, Y.lo, 0), E = K.cube('steel', Y.m + 4, Y.lo, 4);
    const a = await K.putPlate(D, 'f', 0, 0), b = await K.putPlate(D, 'c', 0, 0); if (!a.ok || !b.ok) return 'plates: ' + (a.why || b.why);
    K.tick(0.2); p().pos.set(K.cellX(Y.m + 5), 0.62, K.cellZ(Y.lo + 1)); p().vel.set(0, 0, 0); p().pitch = 0; p().yaw = 0;
    let maxHead = 0, wedged = 0;
    const inD = () => p().pos.x > K.cellX(Y.m + 4) - 0.3 && p().pos.x < K.cellX(Y.m + 7) + 0.3 && p().pos.z > K.cellZ(Y.lo) - 0.3 && p().pos.z < K.cellZ(Y.lo + 3) + 0.3;
    K.walk(6, { jump: true, fwd: 1 }, (n) => { if (inD()) maxHead = Math.max(maxHead, p().pos.y + 1.7); if (!sane() || solidAround()) wedged++; if (n % 120 === 60) p().yaw += 1.57; return false; });
    const roof = (E.y0) + 0.0;   // underside of the next level's plate (row 4 of the stack)
    if (wedged) return `${wedged} frames wedged in a cell`;
    if (maxHead > roof + 0.15) return `the head went to ${maxHead.toFixed(2)} m through the plate at ${roof.toFixed(2)} m`;
    K.walk(0.6, {}); return (sane() && p().pos.y < 1.0) || 'ended at y ' + p().pos.y.toFixed(2);
  });

  await T('stack.audit.walk-the-ladder-from-every-side-and-over-the-top-onto-the-plate', async () => {
    const bad = [];
    for (let d = 0; d < 4; d++) {
      const Y = K.yard({ levels: 2, east: true, dx: d * 70 }); const [A, B2] = K.stack(Y, ['steel', 'steel']);
      const a = await K.putPlate(A, 'f', 0, 0); const b = await K.putPlate(A, 'c', 2, d); if (!a.ok || !b.ok) { bad.push(`shaft ${d}: ` + (a.why || b.why)); continue; }
      // the opening of the shaft plate is a 2 x 2 corner; hang the ladder on the cell of it next to a plate cell, looking at the rim
      const hole = []; for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) if (K.B.holeAt(2, d, dx, dz)) hole.push([dx, dz]);
      craft('ladder'); selectTool('ladder'); let placed = null;
      const rim = []; for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) if (!K.B.holeAt(2, d, dx, dz) && hole.some(([hx, hz]) => Math.abs(hx - dx) + Math.abs(hz - dz) === 1)) rim.push([dx, dz]);
      for (const [dx, dz] of rim) { K.aimAt(K.cellX(Y.m + dx), 4 * C, K.cellZ(Y.lo + dz), 1.0); await plan(); if (g.plan && g.plan.ok) { K.placeNow(); placed = S().entities.at(-1); break; } }
      if (!placed || placed.type !== 'ladder') { bad.push(`shaft ${d}: no ladder could be hung`); continue; }
      K.tick(0.2);
      for (const mode of ['W', 'Space']) {
        p().pos.set(K.cellX(placed.i), 0.62, K.cellZ(placed.k)); p().vel.set(0, 0, 0); p().pitch = 0;
        // face the plate cell the ladder climbs to
        const dxs = [1, 0, -1, 0], dzs = [0, 1, 0, -1]; p().yaw = Math.atan2(dxs[placed.dir], dzs[placed.dir]);
        K.walk(3.0, mode === 'W' ? { fwd: 1 } : { jump: true, fwd: 1 });
        if (!(p().pos.y > 2.4 + 0.5)) bad.push(`shaft ${d} ${mode}: only reached y ${p().pos.y.toFixed(2)}`);
        else if (!sane()) bad.push(`shaft ${d} ${mode}: not sane at the top`);
      }
    }
    return bad.length === 0 || bad.join(' | ');
  });

  // ---- a random wanderer over three levels, stairs and a ladder: never inside a cell, never NaN, never far from the building
  const SEEDS = globalThis.__stackWalkSeeds || [3, 17, 41];
  for (const seed of SEEDS) {
    await T(`stack.audit.walk-wanderer-seed-${seed}-never-ends-up-inside-the-building`, async () => {
      const R = rng(seed), Y = K.yard({ levels: 3, east: true, rows: 40 }); K.dig(Y.m + 4, 0, Y.lo, 4, 12, 4);
      const cs = [0, 4, 8].map((j0) => K.cube('steel', Y.m, Y.lo, j0)), cs2 = [0, 4, 8].map((j0) => K.cube('steel', Y.m + 4, Y.lo, j0));
      await K.putPlate(cs[0], 'f', 0, 0); await K.putPlate(cs[0], 'c', 1, 0); await K.putStair(cs[0], 0); await K.putPlate(cs[1], 'c', 1, 0); await K.putStair(cs[1], 0);
      await K.putPlate(cs2[0], 'f', 0, 0); await K.putPlate(cs2[0], 'c', 2, 0);
      craft('ladder'); selectTool('ladder'); K.aimAt(K.cellX(Y.m + 5), 4 * C, K.cellZ(Y.lo + 2), 1.0, 0.62); await plan(); if (g.plan && g.plan.ok) K.placeNow();
      K.tick(0.3); p().pos.set(K.cellX(Y.m - 3), 0, K.cellZ(Y.lo + 2)); p().vel.set(0, 0, 0); p().pitch = 0; p().yaw = Math.PI / 2;
      let held = {}, bad = [], buriedFrames = 0, maxY = 0;
      for (let n = 0; n < 60 * 40 && bad.length < 3; n++) {
        if (n % 24 === 0) { held = { fwd: R() < 0.8 ? 1 : 0, back: R() < 0.1 ? 1 : 0, left: R() < 0.2 ? 1 : 0, right: R() < 0.2 ? 1 : 0, sprint: R() < 0.3, crouch: R() < 0.12, jump: R() < 0.2 }; p().yaw += (R() - 0.5) * 2.2; }
        g.time += 1 / 60; p().update(1 / 60, K.inputs(held), K.stats(), g.sim);
        maxY = Math.max(maxY, p().pos.y);
        if (!sane()) bad.push(`step ${n}: not sane (${p().pos.x}, ${p().pos.y}, ${p().pos.z}) embedded ${p().embedded}`);
        if (solidAround()) { if (++buriedFrames > 40) bad.push(`step ${n}: inside a solid cell for ${buriedFrames} frames at ${p().pos.x.toFixed(2)}, ${p().pos.y.toFixed(2)}, ${p().pos.z.toFixed(2)}`); } else buriedFrames = 0;
        if (p().pos.y < -2 || Math.abs(p().pos.x - K.cellX(Y.m)) > 40) bad.push(`step ${n}: left the building area at ${p().pos.x.toFixed(1)}, ${p().pos.y.toFixed(1)}`);
        if (n % 120 === 119) g.updatePlay && 0;
      }
      return bad.length === 0 || bad.join(' | ');
    });
  }
}
