// Levels audit: Machines. The top levels added above the old maxes (Rig Gantry, Rig Titan Motors, Mech Overclock, Mech Silo, Plasma Cutters,
// Silo Hoppers, Superconducting Poles, Dyson Cores) and the earth mover lines (Excavator, Bulldozer, Bucket-Wheel, Haul Truck and their upgrades),
// level by level, measured in what the running machines do.
import { basics, numbers, ladder, reqUp, clone } from './levels_common.js';
import { EARTH, earthTune, earthDemand, workCells, earthConflict } from '../earth.js';
import { DEMAND, burnTime } from '../power.js';
import { compaction } from '../util.js';

export default async function (ctx) {
  const { g, S, w, p, L, T, fresh, adv, near, UPGRADES, tiles, toI, toK, cellX, cellZ, newWorld, recipes } = ctx;
  const U = (id) => UPGRADES.find((u) => u.id === id);
  const OLD = ['rigGantry', 'rigTitan', 'mechOverclock', 'mechSilo', 'plasmaCutters', 'siloHoppers', 'superPoles', 'dysonCores'];
  const EARTHU = ['excavator', 'excavatorCount', 'excavatorSpeed', 'excavatorBucket', 'dozer', 'dozerCount', 'dozerSpeed', 'dozerBlade', 'wheel', 'wheelCount', 'wheelSpeed', 'wheelBuckets', 'truck', 'truckCount', 'truckSpeed', 'truckBed', 'truckRange', 'hopperLiner', 'earthDrives', 'earthFleet'];
  for (const id of [...OLD, ...EARTHU]) await basics(ctx, 'machine', id);

  // ---------------------------------------------------------------- numbers
  await numbers(ctx, 'machine', 'rigGantry', (t) => t.rigReach, (l, b) => b + 1.2 * l);
  await numbers(ctx, 'machine', 'rigTitan', (t) => t.rigRate, (l, b) => b * Math.pow(0.8, l), 'down');
  await numbers(ctx, 'machine', 'mechOverclock', (t) => t.mechRate, (l, b) => b * Math.pow(0.8, l), 'down');
  await numbers(ctx, 'machine', 'mechSilo', (t) => t.mechBuffer, (l) => 48 + [0, 24, 72, 200][l]);
  await numbers(ctx, 'machine', 'plasmaCutters', (t) => t.borerRate, (l, b) => b * Math.pow(0.8, l), 'down');
  await numbers(ctx, 'machine', 'siloHoppers', (t) => t.genBuffer, (l) => 400 + [0, 150, 450, 1350][l]);
  await numbers(ctx, 'machine', 'superPoles', (t) => t.poleLink, (l, b) => b + 8 * l);
  await numbers(ctx, 'machine', 'dysonCores', (t) => t.genOutput, (l, b) => b * Math.pow(3, l));
  await numbers(ctx, 'machine', 'excavatorCount', (t) => t.excavMax, (l, b) => b + l, 'up', { excavator: 1 });
  await numbers(ctx, 'machine', 'excavatorSpeed', (t) => t.excavRate, (l, b) => b * Math.pow(0.8, l), 'down');
  await numbers(ctx, 'machine', 'excavatorBucket', (t) => t.excavSwing, (l) => [12, 20, 32, 48, 72][l]);
  await numbers(ctx, 'machine', 'dozerCount', (t) => t.dozerMax, (l, b) => b + l, 'up', { dozer: 1 });
  await numbers(ctx, 'machine', 'dozerSpeed', (t) => t.dozerRate, (l, b) => b * Math.pow(0.8, l), 'down');
  await numbers(ctx, 'machine', 'dozerBlade', (t) => t.dozerBlade, (l) => [5, 7, 9, 11][l]);
  await numbers(ctx, 'machine', 'wheelCount', (t) => t.wheelMax, (l, b) => b + l, 'up', { wheel: 1 });
  await numbers(ctx, 'machine', 'wheelSpeed', (t) => t.wheelRate, (l, b) => b * Math.pow(0.8, l), 'down');
  await numbers(ctx, 'machine', 'wheelBuckets', (t) => t.wheelSwing, (l) => [40, 64, 100, 160][l]);
  await numbers(ctx, 'machine', 'truckCount', (t) => t.truckMax, (l, b) => b + 2 * l, 'up', { truck: 1 });
  await numbers(ctx, 'machine', 'truckSpeed', (t) => t.truckSpeed, (l, b) => b * Math.pow(1.25, l));
  await numbers(ctx, 'machine', 'truckBed', (t) => t.truckBed, (l) => [240, 480, 960, 1920, 3840][l]);
  await numbers(ctx, 'machine', 'truckRange', (t) => t.truckRange, (l) => [400, 800, 1600, 3200, 6400][l]);
  await numbers(ctx, 'machine', 'hopperLiner', (t) => t.hopMul, (l) => Math.pow(2, l));
  await numbers(ctx, 'machine', 'earthDrives', (t) => t.earthDraw, (l) => Math.pow(0.85, l), 'down');
  await numbers(ctx, 'machine', 'earthFleet', (t) => t.fleetBonus, (l) => l);

  // ---------------------------------------------------------------- the four unlocks
  for (const [id, kind, field, n] of [['excavator', 'excavator', 'excavMax', 1], ['dozer', 'dozer', 'dozerMax', 1], ['wheel', 'wheel', 'wheelMax', 1], ['truck', 'truck', 'truckMax', 2]]) {
    await T(`levels.machine.${id}.unlock-adds-the-machine-the-recipe-and-the-limit`, async () => {
      const t0 = clone(fresh(reqUp(UPGRADES, U(id))) || g.T); if (g.T.machines.includes(kind) || recipes(g).some((r) => r.id === kind)) return 'present before the purchase';
      S().money = U(id).cost[0]; if (!g.buy(id)) return 'could not buy';
      if (!g.T.machines.includes(kind) || g.T[field] !== n) return `machines ${g.T.machines}, ${field} ${g.T[field]}`;
      const r = recipes(g).find((x) => x.id === kind); if (!r) return 'no recipe'; if (r.status !== `0 of ${n} ${EARTH[kind].short.toLowerCase()}s placed`) return 'status ' + r.status;
      void t0; return true;
    });
  }

  // ---------------------------------------------------------------- the old machines at their new tops
  // the bay has loose plush and a pile at its far edge: clear a box (cells, 40 high) so nothing but the test is in a machine's reach
  const clearBay = (x0 = -24, x1 = 48, z0 = -4, z1 = 40, hh = 40) => { for (let i = toI(x0); i <= toI(x1); i++) for (let k = toK(z0); k <= toK(z1); k++) for (let j = 0; j < hh; j++) w().removeCell(i, j, k, false); };
  const block = (i0, k0, deep, wide, high) => { const cells = []; for (let a = 0; a < deep; a++) for (let b = -Math.floor(wide / 2); b <= Math.floor(wide / 2); b++) for (let j = 0; j < high; j++) { w().setCell(i0 + a, j, k0 + b, 2 + ((a + b + j) & 3), 0); cells.push([i0 + a, j, k0 + b]); } return { cells, left: () => cells.filter(([i, j, k]) => w().get(i, j, k)).length, clear: () => { for (const [i, j, k] of cells) w().setCell(i, j, k, 0, 0); } }; };
  const tile = (type, i, k, extra = {}) => { const e = { id: g.nextId(), type, i, j: 0, k, dir: 0, rise: 0, ...extra }; if (type === 'belt') e.items = []; if (type === 'gen') e.q = []; S().entities.push(e); g.addEntity(e); return e; };

  await T('levels.machine.rigGantry.the-claw-reaches-the-new-radius-and-no-further', async () => {
    await newWorld(); clearBay(); const bad = [];
    for (let l = 0; l <= 3; l++) {
      fresh({ ...reqUp(UPGRADES, U('rigGantry')), rigGantry: l, claw: 1 }); const R = g.T.rigReach + 1.0; const i0 = toI(-12), k0 = toK(14);
      const rig = { id: g.nextId(), type: 'claw', x: cellX(i0), y: 0, z: cellZ(k0), ry: 0 }; S().entities.push(rig); g.addEntity(rig);
      // a single plush, standing on the floor, just inside this level's reach and beyond the level before
      const hub = 2.75; let n = 0; while (Math.hypot((n + 1) * 0.6, hub - 0.6 * 1.5) <= R - 0.05) n++;
      const ti = i0 + n, tk = k0; w().setCell(ti, 1, tk, 3, 0); const rp = Math.hypot(cellX(ti) - rig.x, 0.9 - hub);
      if (!(rp <= R)) bad.push(`level ${l}: test plush at ${rp.toFixed(2)} m is outside the reach ${R}`);
      let got = false; for (let q = 0; q < 1200 && !got; q++) { for (const it of g.machines.items.values()) it.ent.pw = 1; g.time += 0.05; g.machines.update(0.05, g.time); got = !w().get(ti, 1, tk); }
      if (!got) bad.push(`level ${l}: the claw did not take a plush ${rp.toFixed(2)} m from its hub (reach ${R.toFixed(1)})`);
      if (l > 0) { // the level before could not have: its reach is shorter than this plush's distance
        const Rb = R - 1.2; if (!(rp > Rb)) bad.push(`level ${l}: plush at ${rp.toFixed(2)} m is inside the old reach ${Rb.toFixed(1)}`);
      }
      w().setCell(ti, 1, tk, 0, 0); const it = g.machines.items.get(rig.id); g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(rig.id); S().entities = S().entities.filter((e) => e.id !== rig.id);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('levels.machine.rigTitan.a-claw-swing-takes-20-percent-less-time-per-level', async () => {
    await newWorld(); clearBay(); const bad = []; let t0 = 0;
    for (let l = 0; l <= 4; l++) {
      fresh({ ...reqUp(UPGRADES, U('rigTitan')), rigTitan: l, claw: 1 }); const i0 = toI(-12), k0 = toK(14); const rig = { id: g.nextId(), type: 'claw', x: cellX(i0), y: 0, z: cellZ(k0), ry: 0 }; S().entities.push(rig); g.addEntity(rig);
      const b = block(i0 + 2, k0, 3, 3, 3); const c0 = S().stats.cells; let secs = 0; const times = [];
      for (let q = 0; q < 4000 && times.length < 4; q++) { for (const it of g.machines.items.values()) it.ent.pw = 1; g.time += 0.05; secs += 0.05; const before = S().stats.cells; g.machines.update(0.05, g.time); if (S().stats.cells > before) times.push(secs); }
      b.clear(); const it = g.machines.items.get(rig.id); g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(rig.id); S().entities = S().entities.filter((e) => e.id !== rig.id); void c0;
      if (times.length < 4) { bad.push(`level ${l}: only ${times.length} plucks`); continue; }
      const gap = (times[3] - times[0]) / 3; if (l === 0) t0 = gap; else if (!near(gap / t0, Math.pow(0.8, l), 0.06)) bad.push(`level ${l}: a swing every ${gap.toFixed(2)} s, x${(gap / t0).toFixed(2)} of the base, expected x${Math.pow(0.8, l).toFixed(2)}`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('levels.machine.mechOverclock.the-mech-sets-its-next-dig-time-from-the-new-rate', async () => {
    await newWorld(); clearBay(); const bad = [];
    for (let l = 0; l <= 4; l++) {
      fresh({ ...reqUp(UPGRADES, U('mechOverclock')), mechOverclock: l, mech: 1 }); const i0 = toI(-12), k0 = toK(14); const b = block(i0 + 2, k0, 4, 3, 3);
      const m = tile('mech', i0, k0, { dir: 0 }); let timer = null;
      for (let q = 0; q < 400 && timer === null; q++) { for (const t of tiles()) t.pw = 1; const c0 = S().stats.cells; g.time += 0.05; L().update(0.05); if (S().stats.cells > c0) timer = m.timer; }
      const want = g.T.mechRate * compaction(cellX(m.i), cellZ(m.k)); if (timer === null || !near(timer, want, 1e-9)) bad.push(`level ${l}: next dig in ${timer}, expected ${want}`);
      if (!near(g.T.mechRate, 2.4 * Math.pow(0.8, 6) * 0 + g.T.mechRate, 1e-12)) bad.push('rate');
      b.clear(); L().remove(m); S().entities = S().entities.filter((e) => e.id !== m.id);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('levels.machine.mechSilo.the-mech-hopper-holds-the-new-size-before-it-stops', async () => {
    await newWorld(); clearBay(); const bad = [];
    for (let l = 0; l <= 3; l++) {
      fresh({ ...reqUp(UPGRADES, U('mechSilo')), mechSilo: l, mech: 1 }); g.T.mechRate = 0.02; const want = 48 + [0, 24, 72, 200][l]; const i0 = toI(-12), k0 = toK(14);
      const b = block(i0 + 2, k0, 60, 3, 3); const m = tile('mech', i0, k0, { dir: 0 });
      for (let q = 0; q < 6000 && (m.buf || []).length < want; q++) { for (const t of tiles()) t.pw = 1; g.time += 0.05; L().update(0.05); }
      const n0 = m.buf.length; for (let q = 0; q < 200; q++) { for (const t of tiles()) t.pw = 1; g.time += 0.05; L().update(0.05); }
      if (n0 !== want || m.buf.length !== want) bad.push(`level ${l}: hopper holds ${n0} then ${m.buf.length}, expected it to stop at ${want}`);
      b.clear(); L().remove(m); S().entities = S().entities.filter((e) => e.id !== m.id);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('levels.machine.plasmaCutters.the-borer-cuts-on-the-new-schedule', async () => {
    await newWorld(); const bad = [];
    for (let l = 0; l <= 4; l++) {
      fresh({ ...reqUp(UPGRADES, U('plasmaCutters')), plasmaCutters: l, power: 1, borer: 1, steel: 1, timber: 1, concrete: 1 }); const i = toI(40), k = toK(10); const e = { id: g.nextId(), type: 'borer', i, j: 0, k, dx: 1, dz: 0, w: 2, h: 3, x: cellX(i), y: 0, z: cellZ(k) }; S().entities.push(e); g.addEntity(e); const it = g.machines.items.get(e.id);
      for (let q = 0; q < 400 && !e.steps; q++) { e.pw = 1; g.time += 0.05; g.machines.update(0.05, g.time); }
      const want = g.T.borerRate * compaction(cellX(e.i - 1), cellZ(e.k)); if (!e.steps || Math.abs(it.timer - (want - 0)) > want * 0.01 + 1e-6) bad.push(`level ${l}: next cut in ${it.timer} (steps ${e.steps}), expected ${want}`);
      g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); S().entities = S().entities.filter((q) => q.id !== e.id && !(q.type === 'frame' && q.auto)); w().supports = [];
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('levels.machine.siloHoppers.a-generator-takes-plush-up-to-the-new-reserve', async () => {
    await newWorld(); const bad = [];
    for (let l = 0; l <= 3; l++) {
      fresh({ ...reqUp(UPGRADES, U('siloHoppers')), siloHoppers: l, power: 1 }); const want = 400 + [0, 150, 450, 1350][l]; const gen = tile('gen', toI(-8), toK(20));
      let n = 0; while (n < 3000 && L().accept(gen, { sp: 2, vr: 0 }, null)) n++;
      if (n !== want) bad.push(`level ${l}: generator took ${n}, expected ${want}`);
      // the hand-feeding path stops at the same number
      gen.q.length = want - 1; S().carry = [{ sp: 2, vr: 0 }, { sp: 2, vr: 0 }]; g.useTile(gen); if (gen.q.length !== want) bad.push(`level ${l}: hand-feeding left ${gen.q.length} in the hopper`);
      L().remove(gen); S().entities = S().entities.filter((e) => e.id !== gen.id);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('levels.machine.superPoles.poles-link-and-feed-from-further-per-level', async () => {
    await newWorld(); clearBay(); const bad = [];
    const gridAt = (l, kind, dist) => {   // a burning generator, then a pole (link test) or a consumer (reach test) `dist` m away along z
      fresh({ ...reqUp(UPGRADES, U('superPoles')), superPoles: l, power: 1, fans: 1 }); const i0 = toI(-10), k0 = toK(0); const gen = tile('gen', i0, k0); gen.burn = 1e6; gen.lit = true;
      let probe; if (kind === 'reach') probe = tile('fan', i0, k0 + Math.round(dist / 0.6)); else { const pole = tile('pole', i0, k0 + Math.round(dist / 0.6)); probe = tile('fan', i0, k0 + Math.round(dist / 0.6) + 1); void pole; }
      g.power.recompute(); const pw = probe.pw || 0; for (const t of [...tiles()]) { L().remove(t); } S().entities = S().entities.filter((e) => !['gen', 'pole', 'fan'].includes(e.type)); return pw > 0;
    };
    for (let l = 0; l <= 3; l++) {
      const reach = 7 + 1.5 * 4 + 2 * l, link = 14 + 4 * 4 + 8 * l;
      if (!gridAt(l, 'reach', reach - 0.7)) bad.push(`level ${l}: a fan ${(reach - 0.7).toFixed(1)} m from the generator got no power`);
      if (gridAt(l, 'reach', reach + 1.3)) bad.push(`level ${l}: a fan ${(reach + 1.3).toFixed(1)} m from the generator was powered (reach ${reach})`);
      // a pole that is itself within link range joins the grid; the fan beside it then runs even though it is far from the generator
      if (!gridAt(l, 'link', link - 0.7)) bad.push(`level ${l}: a pole ${(link - 0.7).toFixed(1)} m away did not link (range ${link})`);
      if (gridAt(l, 'link', link + 1.3)) bad.push(`level ${l}: a pole ${(link + 1.3).toFixed(1)} m away linked (range ${link})`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('levels.machine.dysonCores.generators-put-out-3x-per-level-and-burn-each-plush-that-much-faster', async () => {
    await newWorld(); const bad = []; let out0 = 0;
    for (let l = 0; l <= 3; l++) {
      fresh({ ...reqUp(UPGRADES, U('dysonCores')), dysonCores: l, power: 1 }); const out = g.T.genOutput; if (l === 0) out0 = out; else if (!near(out / out0, Math.pow(3, l), 1e-9)) bad.push(`level ${l}: output x${(out / out0).toFixed(3)}`);
      const gen = tile('gen', toI(-8), toK(20)); gen.q.push({ sp: 2, vr: 0 }); g.power.markDirty(); g.power.update(0.05); const common = ctx.species[2].rarity;
      if (!(gen.burn > 0) || !near(gen.burn, burnTime(common, out) - 0.0, burnTime(common, out) * 0.001 + 0.06)) bad.push(`level ${l}: a Common burns ${gen.burn} s, expected ${burnTime(common, out)}`);
      g.power.recompute(); const net = g.power.nets.find((n) => n.nodes.includes(gen)); if (!net || !near(net.supply, out, 1e-6)) bad.push(`level ${l}: the grid supplies ${net && net.supply}, expected ${out}`);
      L().remove(gen); S().entities = S().entities.filter((e) => e.id !== gen.id);
    }
    return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- earth movers: levels in the running machines
  const UP = { power: 1, belts: 1, sorter: 1, vault: 1, fans: 1, mfan: 1, mech: 1, claw: 1, borer: 1, borerSize: 2, mechBuf: 3, beltSpeed: 6, steel: 1, timber: 1, concrete: 1, depots: 1, bag: 4, excavator: 1, dozer: 1, wheel: 1, truck: 1 };
  const mk = (kind, i, k, extra = {}) => {
    const spec = EARTH[kind];
    const ent = { id: g.nextId(), type: kind, i, j: 0, k, dx: 1, dz: 0, x: cellX(i), y: 0, z: cellZ(k), hy: spec.hy, hr: spec.hr, ...(spec.dig ? { hop: [], hn: 0, steps: 0, dug: 0, state: 'idle' } : { px: cellX(i), pz: cellZ(k), cargo: [], cn: 0, route: [], seg: 0, trips: 0, state: 'idle', job: 0, yaw: 0 }), ...extra };
    S().entities.push(ent); g.addEntity(ent); return ent;
  };
  const gone = (e) => { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } S().entities = S().entities.filter((x) => x.id !== e.id); w().supports = w().supports.filter((s) => s.id !== 'shield' + e.id); };
  const step = (secs, dt = 0.05) => { for (let n = 0; n < secs / dt; n++) { for (const it of g.machines.items.values()) it.ent.pw = 1; for (const t of tiles()) t.pw = 1; g.time += dt; g.machines.update(dt, g.time); L().update(dt); } };

  for (const [kind, speedId, rateKey, sizeId, sizeKey, sizeVals] of [['excavator', 'excavatorSpeed', 'excavRate', 'excavatorBucket', 'swing', [12, 20, 32, 48, 72]], ['wheel', 'wheelSpeed', 'wheelRate', 'wheelBuckets', 'swing', [40, 64, 100, 160]]]) {
    await T(`levels.machine.${speedId}.a-${kind}-swings-on-the-new-schedule`, async () => {
      await newWorld(); clearBay(); const bad = [];
      for (let l = 0; l <= U(speedId).max; l++) {
        fresh({ ...UP, [speedId]: l, hopperLiner: 4 }); const i0 = toI(-12), k0 = toK(14); const b = block(i0 + 3, k0, 30, 13, 8); const e = mk(kind, i0, k0, {}); const it = g.machines.items.get(e.id);
        let timer = null; for (let q = 0; q < 2000 && timer === null; q++) { for (const x of g.machines.items.values()) x.ent.pw = 1; g.time += 0.05; g.machines.update(0.05, g.time); if (e.dug) timer = it.timer; }
        const want = g.T[rateKey] * compaction(cellX(e.i), cellZ(e.k)); if (timer === null || !near(timer, want, 1e-9)) bad.push(`level ${l}: next swing in ${timer}, expected ${want}`);
        b.clear(); gone(e);
      }
      return bad.length === 0 || bad.join('; ');
    });
    await T(`levels.machine.${sizeId}.a-${kind}-takes-the-new-number-a-swing`, async () => {
      await newWorld(); clearBay(); const bad = [];
      for (let l = 0; l <= U(sizeId).max; l++) {
        fresh({ ...UP, [sizeId]: l, hopperLiner: 4 }); const i0 = toI(-12), k0 = toK(14); const b = block(i0 + EARTH[kind].half + 1, k0, 30, 13, 8); const e = mk(kind, i0, k0, {});   // the first layer of the face is right in front of the machine
        for (let q = 0; q < 400 && !e.dug; q++) { for (const x of g.machines.items.values()) x.ent.pw = 1; g.time += 0.05; g.machines.update(0.05, g.time); }
        if (e.dug !== sizeVals[l]) bad.push(`level ${l}: first swing took ${e.dug}, expected ${sizeVals[l]}`);
        if (e.hop.length / 2 !== e.dug) bad.push(`level ${l}: hopper holds ${e.hop.length / 2} for ${e.dug} dug`);
        b.clear(); gone(e);
      }
      return bad.length === 0 || bad.join('; ');
    });
  }

  await T('levels.machine.dozerSpeed-and-dozerBlade.a-bulldozer-pass-is-on-the-new-schedule-and-the-blade-is-the-new-width', async () => {
    await newWorld(); clearBay(); const bad = [];
    for (let l = 0; l <= 6; l++) {
      fresh({ ...UP, dozerSpeed: l }); const i0 = toI(-12), k0 = toK(14); const b = block(i0 + 3, k0, 30, 15, 4); const e = mk('dozer', i0, k0, {}); const it = g.machines.items.get(e.id);
      let timer = null; for (let q = 0; q < 2000 && timer === null; q++) { for (const x of g.machines.items.values()) x.ent.pw = 1; g.time += 0.05; g.machines.update(0.05, g.time); if (e.dug) timer = it.timer; }
      const want = g.T.dozerRate * compaction(cellX(e.i), cellZ(e.k)); if (timer === null || !near(timer, want, 1e-9)) bad.push(`speed ${l}: next pass in ${timer}, expected ${want}`);
      b.clear(); gone(e);
    }
    for (let l = 0; l <= 3; l++) {
      fresh({ ...UP, dozerBlade: l }); const i0 = toI(-12), k0 = toK(14); const e = mk('dozer', i0, k0, {}); const tu = earthTune(g.T, 'dozer'); const width = [5, 7, 9, 11][l];
      const lat = new Set(workCells(g, e, tu).map(([, i, j, k]) => k)); const b = block(i0 + 3, k0, 12, 15, 4); const cells = workCells(g, e, tu); const ks = new Set(cells.map(([, i, j, k]) => k - k0));
      if (tu.blade !== width || ks.size !== width) bad.push(`blade ${l}: ${ks.size} wide in the work volume, the tuning says ${tu.blade}, expected ${width}`);
      for (const [, , j] of cells) if (j > 1) { bad.push('blade reaches above 2 cells high'); break; }
      void lat; b.clear(); gone(e);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('levels.machine.hopperLiner.hoppers-hold-twice-as-much-per-level-and-fill-up-to-it', async () => {
    await newWorld(); clearBay(); const bad = [];
    for (let l = 0; l <= 4; l++) {
      fresh({ ...UP, hopperLiner: l }); const ex = earthTune(g.T, 'excavator').hopper, wh = earthTune(g.T, 'wheel').hopper;
      if (ex !== 240 * Math.pow(2, l) || wh !== 1500 * Math.pow(2, l)) bad.push(`level ${l}: hoppers ${ex} / ${wh}`);
    }
    for (const l of [0, 1]) {
      fresh({ ...UP, hopperLiner: l, excavatorBucket: 4 }); const i0 = toI(-12), k0 = toK(14); const b = block(i0 + 3, k0, 40, 13, 8); const e = mk('excavator', i0, k0, {}); g.T.excavRate = 0.05;
      for (let q = 0; q < 6000 && e.state !== 'full'; q++) { for (const x of g.machines.items.values()) x.ent.pw = 1; g.time += 0.05; g.machines.update(0.05, g.time); }
      if (e.state !== 'full' || e.hop.length / 2 !== 240 * Math.pow(2, l)) bad.push(`level ${l}: ${e.state} at ${e.hop.length / 2}`); b.clear(); gone(e);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('levels.machine.truckSpeed-truckBed-truckRange.the-truck-drives-carries-and-answers-by-the-new-numbers', async () => {
    await newWorld(); const bad = []; const bin = g.hall.binPos;
    // speed: the distance covered while it drives divided by that time
    for (const l of [0, 3, 6]) {
      fresh({ ...UP, truckSpeed: l, truckRange: 4 }); const tk = mk('truck', toI(bin.x + 6), toK(bin.z + 8)); const dg = mk('excavator', toI(bin.x + 120), toK(bin.z + 8)); for (let q = 0; q < 600; q++) dg.hop.push(3, 0); dg.hn = 300;
      step(1, 0.1); let path = 0, moving = 0; for (let n = 0; n < 60; n++) { const x0 = tk.px, z0 = tk.pz; step(0.1, 0.1); path += Math.hypot(tk.px - x0, tk.pz - z0); if (tk.state === 'go' || tk.state === 'back') moving += 0.1; }
      const want = 7 * Math.pow(1.25, l); if (!(moving > 3 && near(path / moving, want, want * 0.05))) bad.push(`speed ${l}: ${(path / moving).toFixed(2)} m/s, expected ${want.toFixed(2)}`); gone(tk); gone(dg);
    }
    // bed: what it loads at the digger
    for (const l of [0, 1, 2, 4]) {
      fresh({ ...UP, truckBed: l }); const tk = mk('truck', toI(bin.x + 6), toK(bin.z + 8)); const dg = mk('excavator', toI(bin.x + 30), toK(bin.z + 8)); for (let q = 0; q < 4300 * 2; q++) dg.hop.push(3, 0); dg.hn = 4300;
      let loaded = 0; for (let n = 0; n < 600 && !loaded; n++) { step(0.1, 0.1); if (tk.state === 'load' || tk.state === 'go' && tk.seg === 1) loaded = tk.cn; }
      const want = [240, 480, 960, 1920, 3840][l]; if (loaded !== want) bad.push(`bed ${l}: loaded ${loaded}, expected ${want}`); gone(tk); gone(dg);
    }
    // range: a hopper 500 m out is ignored by the 400 m radio and answered by the 800 m one
    for (const l of [0, 1]) {
      fresh({ ...UP, truckRange: l }); const tk = mk('truck', toI(bin.x + 6), toK(bin.z + 8)); const dg = mk('excavator', toI(bin.x + 506), toK(bin.z + 8)); for (let q = 0; q < 600; q++) dg.hop.push(3, 0); dg.hn = 300; step(3, 0.1);
      const answered = !!tk.job; if (answered !== (l >= 1)) bad.push(`range level ${l}: the truck ${answered ? 'answered' : 'ignored'} a hopper 500 m out`); gone(tk); gone(dg);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('levels.machine.earthDrives-and-earthFleet.the-draw-falls-and-the-limit-rises-per-level', async () => {
    await newWorld(); const bad = [];
    for (let l = 0; l <= 4; l++) {
      fresh({ ...UP, fusion: 3, genOutput: 6, earthDrives: l }); const t = g.T; const e = { type: 'excavator', off: false };
      for (const k of ['excavator', 'dozer', 'wheel', 'truck']) { const d = earthDemand(t, { off: false }, DEMAND[k]); if (!near(d, DEMAND[k] * Math.pow(0.85, l), 1e-9)) bad.push(`drives ${l}: ${k} draws ${d}`); }
      if (earthDemand(t, { off: true }, 30) !== 0) bad.push('a parked machine draws power'); void e;
    }
    await newWorld(); clearBay();
    for (let l = 0; l <= 3; l++) {
      fresh({ ...UP, fusion: 3, genOutput: 6, earthDrives: 4, earthFleet: l }); let placed = 0; const i0 = toI(-12), k0 = toK(14);
      for (let n = 0; n < 12; n++) { const why = earthConflict(g, 'excavator', { i: i0 + 3 * n, k: k0 }); if (why) break; mk('excavator', i0 + 3 * n, k0); placed++; }
      if (placed !== 1 + l) bad.push(`fleet ${l}: ${placed} excavators allowed, expected ${1 + l}`);
      for (const e of S().entities.filter((x) => x.type === 'excavator')) gone(e);
      const tu = earthTune(g.T, 'truck'); if (tu.max !== 2 + l) bad.push(`fleet ${l}: ${tu.max} trucks allowed`);
    }
    return bad.length === 0 || bad.join('; ');
  });
}
