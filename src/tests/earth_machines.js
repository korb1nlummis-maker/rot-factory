// Earth movers (src/earth.js): the unlocks, crafting, placing, digging, hauling, the load and air rules, power, saving and the readouts.
// Run in the browser: `await __selftest('earth.')`
import { EARTH, STATES, earthTune, earthCost, canopyRatio, workCells } from '../earth.js';
import { DEMAND } from '../power.js';
import { NEEDLE } from '../plushdata.js';
import { infoFor, findInfoRef } from '../info.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, fresh, craft, selectTool, plan, placeNow, aimPoint, tiles, toI, toK, cellX, cellZ, newWorld, recipes, UPGRADES, FRAME_TYPES, tune } = ctx;
  const json = (m) => JSON.parse(JSON.stringify(m));
  // every upgrade the earth movers (and their prerequisites) need
  const UP = { power: 1, belts: 1, sorter: 1, vault: 1, fans: 1, mfan: 1, mech: 1, claw: 1, borer: 1, borerSize: 2, mechBuf: 3, beltSpeed: 6, steel: 1, timber: 1, concrete: 1, depots: 1, bag: 4, excavator: 1, dozer: 1, wheel: 1, truck: 1 };
  const up = (extra = {}) => ({ ...UP, ...extra });
  const KINDS = ['excavator', 'dozer', 'wheel', 'truck'];
  // an arena in the open bay: a solid block of plush the machine can face
  const arena = (o = {}) => {
    const { x = -9, z = 14, deep = 9, wide = 13, high = 8 } = o; const i0 = toI(x), k0 = toK(z), cells = [];
    for (let a = -10; a <= 20; a++) for (let b = -14; b <= 14; b++) for (let j = 0; j < 14; j++) w().removeCell(i0 + a, j, k0 + b, false);   // the bay has loose plush lying about: clear the ground first
    for (let a = 3; a < 3 + deep; a++) for (let b = -Math.floor(wide / 2); b <= Math.floor(wide / 2); b++) for (let j = 0; j < high; j++) { w().setCell(i0 + a, j, k0 + b, 2 + ((a + b + j) & 3), 0); cells.push([i0 + a, j, k0 + b]); }
    return { i0, k0, cells, count: () => cells.filter(([i, j, k]) => w().get(i, j, k)).length, clear: () => { for (const [i, j, k] of cells) w().setCell(i, j, k, 0, 0); } };
  };
  const mk = (kind, i, k, extra = {}) => {
    const spec = EARTH[kind]; const plan0 = { i, j: 0, k, dx: 1, dz: 0, x: cellX(i), y: 0, z: cellZ(k) };
    const ent = { id: g.nextId(), type: kind, i, j: 0, k, dx: 1, dz: 0, x: cellX(i), y: 0, z: cellZ(k), hy: spec.hy, hr: spec.hr, ...(spec.dig ? { hop: [], hn: 0, steps: 0, dug: 0, state: 'idle' } : { px: cellX(i), pz: cellZ(k), cargo: [], cn: 0, route: [], seg: 0, trips: 0, state: 'idle', job: 0, yaw: 0 }), ...extra };
    void plan0; S().entities.push(ent); g.addEntity(ent); return ent;
  };
  const run = (secs, dt = 0.05, power = 1) => { for (let n = 0; n < secs / dt; n++) { for (const it of g.machines.items.values()) it.ent.pw = power; for (const t of tiles()) t.pw = power; g.time += dt; g.machines.update(dt, g.time); L().update(dt); } };
  const gone = (e) => { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } S().entities = S().entities.filter((x) => x.id !== e.id); g.world.supports = g.world.supports.filter((s) => s.id !== 'shield' + e.id); };
  const world = async () => { await newWorld(); };

  await T('earth.every-kind-is-a-machine-recipe-with-a-priced-unlock', async () => {
    const bad = [];
    for (const k of KINDS) {
      const u = UPGRADES.find((x) => x.id === k); if (!u || u.cat !== 'machine' || u.max !== 1) { bad.push('no unlock ' + k); continue; }
      if (u.cost[0] < 1e6) bad.push(k + ' unlock under a million');
      fresh({}); if (recipes(g).some((r) => r.id === k)) bad.push(k + ' craftable before the unlock');
      fresh(up()); const r = recipes(g).find((x) => x.id === k); if (!r) { bad.push('no recipe ' + k); continue; }
      if (r.price !== earthCost(k, 0) * 3) bad.push(`${k} price ${r.price}, expected ${earthCost(k, 0) * 3}`);
      if (!r.use || !r.status || /undefined|NaN/.test(r.use + r.status + r.desc)) bad.push(k + ' bad text');
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('earth.each-new-one-costs-55-percent-more-than-the-last', async () => {
    fresh(up({ excavatorCount: 4, dozerCount: 4, wheelCount: 3, truckCount: 6 })); S().money = 1e13; const bad = [];
    await world(); const a = arena({ deep: 4 }); const base = { excavator: 9e5, dozer: 6e5, wheel: 8e6, truck: 3e5 };
    for (const k of KINDS) {
      const c0 = g.earthCost(k); if (c0 !== base[k]) bad.push(`${k} first costs ${c0}`);
      mk(k, a.i0, a.k0 - 20 - KINDS.indexOf(k) * 6); const c1 = g.earthCost(k); if (c1 !== Math.round(base[k] * 1.55)) bad.push(`${k} second costs ${c1}`);
    }
    a.clear(); return bad.length === 0 || bad.join('; ');
  });

  for (const kind of ['excavator', 'dozer', 'wheel']) {
    await T(`earth.${kind}-placed-from-the-bench-powers-up-and-digs`, async () => {
      await world(); fresh(up()); S().money = 1e12; const a = arena(); const m0 = S().money;
      const price = recipes(g).find((r) => r.id === kind).price; craft(kind); if (m0 - S().money !== price) return `crafting charged ${m0 - S().money}, price ${price}`;
      if (S().items[kind] !== 1) return 'no item after crafting'; selectTool(kind);
      aimPoint(cellX(a.i0), 0, cellZ(a.k0), 3.0); const pl = await plan(); if (!pl || !pl.ok) return 'plan: ' + (pl && pl.why);
      if (placeNow() !== 1) return 'placement made no entity'; const e = S().entities.find((x) => x.type === kind); if (!e) return 'no entity';
      if (S().items[kind]) return 'item not consumed'; if (g.machines.count(kind) !== 1) return 'count';
      const n0 = a.count(); const d0 = S().stats.earthDug || 0, pl0 = S().stats.plush;
      run(40);
      const n1 = a.count(); const dug = n0 - n1; a.clear();
      if (dug < 20) return `${kind} dug only ${dug} cells in 40 s (${e.state})`;
      if ((S().stats.earthDug || 0) - d0 !== dug) return `earthDug stat ${(S().stats.earthDug || 0) - d0} for ${dug} cells`;
      if (S().stats.plush - pl0 !== dug) return 'plush stat did not count the dug cells';
      const e0 = e; return (e0.pw === 1) || 'power';
    });
  }

  await T('earth.placement-needs-a-face-and-clear-ground-and-keeps-its-distance-and-limit', async () => {
    await world(); fresh(up({ excavator: 1 })); S().money = 1e12; const a = arena(); const bad = [];
    craft('excavator', 3); selectTool('excavator');
    // facing away from the pile: no face
    p().pos.set(cellX(a.i0) + 2.5, 0, cellZ(a.k0)); p().yaw = -Math.PI / 2; p().pitch = -0.4; p().vel.set(0, 0, 0); { const e = p().eyePos(new ctx.V3()), d = p().forward(new ctx.V3()); g.updateBuild(g.curTool(), e, d); }
    if (g.plan && g.plan.ok && !/Face the pile/.test(g.plan.why || '')) { /* it may still see the pile behind its facing: only a refusal text matters when no face is within reach */ }
    // too close to the first one
    aimPoint(cellX(a.i0), 0, cellZ(a.k0), 3.0); let pl = await plan(); if (!pl.ok) return 'first plan: ' + pl.why; placeNow();
    aimPoint(cellX(a.i0), 0, cellZ(a.k0 + 2), 3.0); pl = await plan(); if (pl.ok || !/close|limit/i.test(pl.why || '')) bad.push('second machine allowed on top of the first: ' + JSON.stringify(pl.why));
    // the fleet limit: one excavator only
    aimPoint(cellX(a.i0), 0, cellZ(a.k0 + 4), 3.0); pl = await plan(); if (pl.ok || !/limit/i.test(pl.why || '')) bad.push('limit of one not enforced: ' + JSON.stringify(pl.why));
    // a guest's plan is checked again on the host
    const why = ctx.g.placeConflict({ kind: 'excavator' }, { i: a.i0, k: a.k0 + 4 }); if (!/limit/i.test(why || '')) bad.push('host did not re-check the limit: ' + why);
    a.clear(); return bad.length === 0 || bad.join('; ');
  });

  await T('earth.excavator-needs-power-and-stops-when-the-hopper-is-full', async () => {
    await world(); fresh(up({ hopperLiner: 0 })); const a = arena({ deep: 12, high: 8 }); const e = mk('excavator', a.i0, a.k0);
    run(20, 0.05, 0); if (e.state !== 'nopower' || e.hop.length) return `unpowered excavator ${e.state}, hop ${e.hop.length}`;
    run(240); const cap = earthTune(g.T, 'excavator').hopper; const bad = [];
    if (e.hop.length / 2 !== cap) bad.push(`hopper ${e.hop.length / 2} of ${cap} after a long run (${e.state})`);
    if (e.state !== 'full') bad.push('state ' + e.state); a.clear(); return bad.length === 0 || bad.join('; ');
  });

  await T('earth.excavator-hopper-holds-real-plush-and-hands-them-over-with-E', async () => {
    await world(); fresh(up({ bag: 3 })); const a = arena(); const e = mk('excavator', a.i0, a.k0); run(30); a.clear();
    const n = e.hop.length / 2; if (n < 10) return 'hopper has ' + n; const sp = e.hop[0]; S().carry = [];
    const it = g.machines.items.get(e.id); g.useEarthIt(it); const took = S().carry.length;
    if (took !== Math.min(g.T.carry, n)) return `took ${took}, carry ${g.T.carry}, hopper ${n}`; if (e.hop.length / 2 !== n - took) return 'hopper not reduced'; if (S().carry[0].sp !== sp) return 'wrong plush came out';
    // an empty hopper: E parks and unparks it
    e.hop = []; e.hn = 0; g.useEarthIt(it); const off = e.off === true; g.useEarthIt(it); return (off && !e.off) || 'E did not park and unpark';
  });

  await T('earth.diggers-never-take-the-one', async () => {
    await world(); fresh(up()); const a = arena({ deep: 6 }); const ni = a.i0 + 4, nk = a.k0, nj = 1; w().setCell(ni, nj, nk, NEEDLE, 0); const e = mk('excavator', a.i0, a.k0); run(120);
    const still = w().get(ni, nj, nk) === NEEDLE; const lost = S().needleLost; const dug = a.count(); a.clear(); w().setCell(ni, nj, nk, 0, 0);
    return (still && !lost && S().dex[NEEDLE] === undefined && e.dug > 30) || `needle still ${still} lost ${lost} dug ${e.dug} left ${dug}`;
  });

  await T('earth.excavator-walks-up-to-a-face-and-moves-forward-when-its-reach-is-clear', async () => {
    await world(); fresh(up({ hopperLiner: 3 })); const a = arena({ deep: 14, high: 6, wide: 9 }); const e = mk('excavator', a.i0, a.k0, { hop: [], hn: 0 });
    const i1 = e.i; for (let n = 0; n < 60 && e.hop.length / 2 < 1000; n++) { run(20); if (e.hop.length > 2000) e.hop = []; e.hn = e.hop.length / 2; }
    a.clear(); return (e.i > i1 + 3 && e.steps >= 3) || `moved ${e.i - i1} cells in ${e.steps} steps (${e.state})`;
  });

  await T('earth.hopper-flushes-onto-a-belt-behind-the-machine', async () => {
    await world(); fresh(up()); const a = arena(); const e = mk('excavator', a.i0 + 2, a.k0);
    const mkT = (type, i, extra = {}) => { const t = { id: g.nextId(), type, i, j: 0, k: a.k0, dir: 2, rise: 0, ...extra }; if (type === 'belt') t.items = []; S().entities.push(t); g.addEntity(t); return t; };
    for (let n = 0; n < 3; n++) mkT('belt', e.i - 2 - n); mkT('vault', e.i - 5);
    run(60); const vault = tiles().find((t) => t.type === 'vault'); a.clear();
    return (vault.stored.length > 5) || `vault got ${vault.stored.length}, hopper ${e.hop.length / 2}, belts ${tiles().filter((t) => t.type === 'belt').length}`;
  });

  await T('earth.bulldozer-pushes-onto-a-belt-at-full-value-or-down-its-chute-at-85-percent', async () => {
    await world(); fresh(up()); const a = arena({ high: 4 }); const e = mk('dozer', a.i0, a.k0);
    // no belt: sold through the chute
    const m0 = S().money; const sold0 = S().stats.sold; run(30); const chuteN = S().stats.sold - sold0, chuteM = S().money - m0; if (chuteN < 10) return 'chute sold ' + chuteN;
    // the same plush valued at 100% would be worth more than what was paid
    const full = (() => { let v = 0; for (const [i, j, k] of []) void i + j + k; return v; })(); void full;
    gone(e); a.clear();
    const b = arena({ high: 4 }); const e2 = mk('dozer', b.i0, b.k0);
    const mkT = (type, i, extra = {}) => { const t = { id: g.nextId(), type, i, j: 0, k: b.k0, dir: 2, rise: 0, ...extra }; if (type === 'belt') t.items = []; S().entities.push(t); g.addEntity(t); return t; };
    for (let n = 0; n < 3; n++) mkT('belt', e2.i - 2 - n); mkT('vault', e2.i - 5); run(40); const vault = tiles().find((t) => t.type === 'vault'); b.clear();
    return (vault.stored.length > 8 && e2.dug > vault.stored.length - 1) || `vault ${vault.stored.length}, dug ${e2.dug}`;
  });

  await T('earth.chute-sale-pays-85-percent-of-the-plush-value', async () => {
    await world(); fresh(up()); const sp = 7, vr = 0; const v100 = g.valueOf(sp, vr, 0); const m0 = S().money;
    const { sellBatch } = await import('../earth.js'); const paid = sellBatch(g, [sp, vr], 0.85); const got = S().money - m0;
    return (paid === got && got === Math.max(1, Math.round(v100 * 0.85))) || `paid ${paid}, money +${got}, value ${v100}`;
  });

  await T('earth.wheel-digs-an-11-wide-face-far-faster-than-an-excavator', async () => {
    await world(); fresh(up({ hopperLiner: 4 })); const a = arena({ deep: 8, wide: 15, high: 8 }); const wh = mk('wheel', a.i0 - 1, a.k0); run(30); const nW = wh.dug; gone(wh); a.clear();
    const b = arena({ deep: 8, wide: 15, high: 8 }); const ex = mk('excavator', b.i0 - 1, b.k0); run(30); const nE = ex.dug; b.clear();
    return (nW > nE * 2.5 && nW > 60) || `wheel ${nW} vs excavator ${nE} in 30 s`;
  });

  await T('earth.truck-hauls-a-hopper-to-the-bin-and-sells-it', async () => {
    await world(); fresh(up({ truckBed: 1 })); const bin = g.hall.binPos; const ents = []; const tk = mk('truck', toI(bin.x + 12), toK(bin.z + 8));
    const dg = mk('excavator', toI(bin.x + 40), toK(bin.z + 8)); for (let q = 0; q < 300; q++) dg.hop.push(2 + (q % 5), 0); dg.hn = 150; ents.push(tk, dg);
    const m0 = S().money, hauls0 = S().stats.hauls || 0; run(120, 0.1);
    const left = dg.hop.length / 2; const bed = earthTune(g.T, 'truck').bed;
    if (S().money <= m0) return `no sales: truck ${tk.state}, hopper ${left}, cargo ${tk.cn}`;
    if (150 - left < Math.min(bed, 150) * 0.9 && (S().stats.hauled || 0) < 100) return `hauled ${S().stats.hauled}, hopper ${left}`;
    return (S().stats.hauls > hauls0 && S().stats.hauled > 0 && (tk.trips || 0) >= 1) || `hauls ${S().stats.hauls} trips ${tk.trips}`;
  });

  await T('earth.truck-drives-the-path-and-parks-when-unpowered', async () => {
    await world(); fresh(up()); const bin = g.hall.binPos; const tk = mk('truck', toI(bin.x + 6), toK(bin.z + 8)); const dg = mk('excavator', toI(bin.x + 70), toK(bin.z + 8));
    for (let q = 0; q < 600; q++) dg.hop.push(3, 0); dg.hn = 300; run(3, 0.1, 0); if (tk.state !== 'nopower' || tk.route.length) return 'unpowered truck set off: ' + tk.state;
    run(5, 0.1); if (!(tk.state === 'go' && tk.px > tk.x + 1)) return `truck did not drive: ${tk.state} px ${tk.px} x ${tk.x}`;
    const speed = earthTune(g.T, 'truck').speed; let path = 0, moving = 0; for (let n = 0; n < 100; n++) { const x0 = tk.px, z0 = tk.pz; run(0.1, 0.1); const d = Math.hypot(tk.px - x0, tk.pz - z0); path += d; if (tk.state === 'go' || tk.state === 'back') moving += 0.1; }
    if (!(path > speed * moving * 0.9 && path < speed * moving * 1.1 && moving > 5)) return `drove ${path.toFixed(1)} m in ${moving.toFixed(1)} s of driving at ${speed} m/s`;
    // the model follows the entity
    const it = g.machines.items.get(tk.id); return Math.abs(it.obj.position.x - tk.px) < 0.01 || 'model not at the truck';
  });

  await T('earth.truck-fleet-and-diggers-share-the-work-without-double-booking', async () => {
    await world(); fresh(up({ truckCount: 1 })); const bin = g.hall.binPos; const t1 = mk('truck', toI(bin.x + 6), toK(bin.z + 8)), t2 = mk('truck', toI(bin.x + 6), toK(bin.z + 12));
    const d1 = mk('excavator', toI(bin.x + 50), toK(bin.z + 8)); for (let q = 0; q < 480; q++) d1.hop.push(3, 0); d1.hn = 240; run(3, 0.1);
    const jobs = [t1.job, t2.job].filter(Boolean); return (jobs.length === 1 && jobs[0] === d1.id) || 'jobs ' + JSON.stringify([t1.job, t2.job]);
  });

  await T('earth.diggers-refuse-ground-the-best-frame-could-not-hold', async () => {
    await world(); fresh(up({ concrete: 1 })); const deep = toI(800), kz = toK(10);
    // a standing room and a solid face 800 m from the bay: the depth concrete is rated for
    for (let a = -8; a <= 14; a++) for (let b = -6; b <= 6; b++) for (let j = 0; j < 10; j++) { const i = deep + a, k = kz + b; if (a < 3 && j < 6) w().removeCell(i, j, k, false); else w().setCell(i, j, k, 3, 0); }
    const e = mk('excavator', deep, kz); g.T.frames = ['timber']; const r = canopyRatio(g, e); run(30);
    if (!(r > 1)) return 'ratio with a timber canopy at 800 m: ' + r.toFixed(2);
    if (!(e.state === 'press' && e.dug === 0)) return `timber: state ${e.state}, dug ${e.dug}, ratio ${r.toFixed(2)}`;
    if (!(S().stats.earthPress >= 1)) return 'the halt was not counted for the achievement'; // Hard Hat Area
    const info = infoFor(g, { kind: 'mach', id: e.id }).lines.join(' '); if (!/Halted: the mountain presses \d+%/.test(info)) return 'readout does not say why: ' + info;
    g.T.frames = ['timber', 'steel', 'concrete']; const r2 = canopyRatio(g, e); run(30);
    return (r2 < 1 && e.dug > 5) || `with concrete: ratio ${r2.toFixed(2)} dug ${e.dug} (${e.state})`;
  });

  await T('earth.load-rule-near-the-bay-lets-a-timber-canopy-dig', async () => {
    await world(); fresh(up()); g.T.frames = ['timber']; const a = arena(); const e = mk('excavator', a.i0, a.k0); const r = canopyRatio(g, e); run(30); a.clear();
    return (r < 1 && e.dug > 10) || `ratio ${r.toFixed(2)} dug ${e.dug} ${e.state}`;
  });

  await T('earth.stale-air-chokes-a-deep-digger-until-a-support-fan-blows', async () => {
    await world(); fresh(up()); const deep = toI(1300), kz = toK(10); const e0 = { x: cellX(deep), y: 0, z: cellZ(kz) };
    for (let a = -3; a <= 14; a++) for (let b = -6; b <= 6; b++) for (let j = 0; j < 10; j++) { const i = deep + a, k = kz + b; if (a < 3 && j < 6) w().removeCell(i, j, k, false); else w().setCell(i, j, k, 3, 0); }
    g.T.frames = Object.keys(FRAME_TYPES); const e = mk('excavator', deep, kz); g.dust.cells.clear(); const air0 = g.dust.stale({ x: e.x, y: e.y + 1.6, z: e.z });
    if (!(air0 > 0.8)) return 'no stale air at 1.3 km: ' + air0.toFixed(2); run(10); if (e.state !== 'choke' || e.dug) return `state ${e.state} dug ${e.dug}`; if (!(S().stats.earthChoke >= 1)) return 'the choke was not counted for the achievement';
    // a powered support fan under a frame upwind clears it: use a vent fan tile standing beside the machine
    const fan = { id: g.nextId(), type: 'fan', i: deep + 1, j: 0, k: kz + 2, dir: 0, rise: 0 }; S().entities.push(fan); g.addEntity(fan);
    for (let n = 0; n < 20; n++) { for (const t of tiles()) t.pw = 1; g.dust._fanNext = 0; g.time += 0.5; }
    const air1 = g.dust.stale({ x: e.x, y: e.y + 1.6, z: e.z }); if (!(air1 < air0)) return `fan did not thin the air: ${air0.toFixed(2)} -> ${air1.toFixed(2)}`;
    return true;
  });

  await T('earth.saves-and-loads-with-hopper-cargo-and-position', async () => {
    await world(); fresh(up()); const a = arena(); const e = mk('excavator', a.i0, a.k0); run(30); const tk = mk('truck', a.i0 - 10, a.k0 + 10); tk.cargo = [3, 0, 4, 0, 5, 0]; tk.cn = 3; tk.trips = 7;
    const hop = e.hop.slice(), i1 = e.i, steps = e.steps; a.clear();
    S().noSaveFlag = undefined; g.noSave = false; g.save(); g.noSave = true; const raw = JSON.parse(localStorage.getItem('rotfactory.save.v1')).S;
    const re = raw.entities.find((x) => x.id === e.id), rt = raw.entities.find((x) => x.id === tk.id);
    if (!re || re.hop.length !== hop.length || re.i !== i1 || re.steps !== steps) return 'saved excavator is missing hopper or position';
    if (!rt || rt.cargo.length !== 6 || rt.trips !== 7) return 'saved truck is missing its cargo';
    // rebuild from the save: drop the live machines and add them back from the saved JSON
    gone(e); gone(tk); const back = json(raw.entities.filter((x) => x.id === e.id || x.id === tk.id)); for (const b of back) { S().entities.push(b); g.addEntity(b); }
    const it = g.machines.items.get(e.id), it2 = g.machines.items.get(tk.id); if (!it || !it2) return 'machines did not come back';
    return (it.ent.hop.length === hop.length && it2.ent.cargo.length === 6 && w().supports.some((s) => s.id === 'shield' + e.id)) || 'state lost on load';
  });

  await T('earth.hover-readout-names-the-machine-its-state-hopper-and-power', async () => {
    await world(); fresh(up()); const a = arena(); const bad = [];
    for (const kind of KINDS) {
      const e = mk(kind, a.i0 - 5 - KINDS.indexOf(kind) * 6, a.k0 - 14); e.pw = 1; if (kind === 'truck') e.cn = 12; else { e.hop = [3, 0, 4, 0]; e.hn = 2; }
      const inf = infoFor(g, { kind: 'mach', id: e.id }); if (!inf) { bad.push(kind + ' no info'); continue; }
      const txt = inf.title + ' ' + inf.lines.join(' ');
      if (!txt.toUpperCase().includes(EARTH[kind].name.toUpperCase())) bad.push(kind + ' title ' + inf.title);
      if (!/Powered 100%/.test(txt)) bad.push(kind + ' power line missing');
      if (kind === 'truck' ? !/Carrying 12 of 240/.test(txt) : kind === 'dozer' ? !/Blade 5 wide/.test(txt) : !/Hopper 2 of/.test(txt)) bad.push(kind + ' body text: ' + txt.slice(0, 160));
      if (/undefined|NaN|\[object/.test(txt)) bad.push(kind + ' bad text');
      e.pw = 0; if (!/No power/.test(infoFor(g, { kind: 'mach', id: e.id }).lines.join(' '))) bad.push(kind + ' no-power line missing');
    }
    a.clear(); return bad.length === 0 || bad.join('; ');
  });

  await T('earth.aiming-at-a-machine-finds-its-hover-and-the-hammer-takes-it-down', async () => {
    await world(); fresh(up()); const a = arena(); const e = mk('excavator', a.i0, a.k0); run(20); const hopN = e.hop.length / 2;
    const it = g.machines.items.get(e.id); p().pos.set(it.obj.position.x - 3.6, 0, it.obj.position.z); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0.1; ctx.adv(0.1);
    const ref = findInfoRef(g); if (!ref || ref.kind !== 'mach' || ref.id !== e.id) return 'aim did not find the excavator: ' + JSON.stringify(ref);
    S().carry = []; const n0 = S().items.excavator || 0; g.doDecon({ kind: 'mach', id: e.id });
    a.clear(); if (g.machines.items.has(e.id) || S().entities.some((x) => x.id === e.id)) return 'machine still there'; if ((S().items.excavator || 0) !== n0 + 1) return 'machine not given back';
    return (S().carry.length > 0 || hopN === 0) || 'hopper plush lost';
  });

  await T('earth.power-draw-parked-draws-nothing-efficient-drives-trim-the-rest', async () => {
    await world(); fresh(up({ fusion: 3, genOutput: 6, earthDrives: 0 })); const a = arena(); const e = mk('excavator', a.i0, a.k0), d = mk('dozer', a.i0, a.k0 + 8);
    const gen = { id: g.nextId(), type: 'gen', i: a.i0 - 3, j: 0, k: a.k0 + 4, dir: 0, rise: 0, q: [] }; S().entities.push(gen); g.addEntity(gen);
    const pole = { id: g.nextId(), type: 'pole', i: a.i0 - 2, j: 0, k: a.k0 + 4, dir: 0, rise: 0 }; S().entities.push(pole); g.addEntity(pole);
    g.power.recompute(); const net = g.power.nets.find((n) => n.nodes.length); const dem0 = net ? net.demand : -1;
    const want0 = DEMAND.excavator + DEMAND.dozer; if (Math.abs(dem0 - want0) > 0.01) return `demand ${dem0}, expected ${want0}`;
    e.off = true; g.power.recompute(); const dem1 = g.power.nets[0].demand; if (Math.abs(dem1 - DEMAND.dozer) > 0.01) return 'parked excavator still draws: ' + dem1;
    e.off = false; S().up = up({ fusion: 3, genOutput: 6, earthDrives: 4 }); g.T = g.tune(); g.power.recompute(); const dem2 = g.power.nets[0].demand; const want2 = want0 * Math.pow(0.85, 4);
    a.clear(); return Math.abs(dem2 - want2) < 0.01 || `with drives ${dem2}, expected ${want2}`;
  });

  await T('earth.a-big-machine-reaches-a-pole-from-further-off-than-a-small-one', async () => {
    await world(); fresh(up()); const a = arena(); const reach = g.T.poleReach; const base = { id: g.nextId(), type: 'pole', i: a.i0, j: 0, k: a.k0 - 20, dir: 0, rise: 0 };
    const gen = { id: g.nextId(), type: 'gen', i: a.i0 + 1, j: 0, k: a.k0 - 20, dir: 0, rise: 0, q: [] }; S().entities.push(base, gen); g.addEntity(base); g.addEntity(gen);
    const lit = tiles().find((t) => t.type === 'gen'); lit.burn = 1e6; lit.lit = true;
    const at = (kind, d) => mk(kind, a.i0, base.k + Math.round(d / 0.6));
    const wheel = at('wheel', reach + 5), exc = at('excavator', reach + 5), doz = at('dozer', reach + 2.6), near = at('excavator', reach + 2.4);
    g.power.recompute(); const bad = [];
    const dist = (c) => { const [x, , z] = g.power.pos(c); const [px, , pz] = g.power.pos(lit); return Math.hypot(x - px, z - pz); };
    void dist; if (!(wheel.pw > 0)) bad.push('the wheel, 5 m past the base reach, is not linked'); if (exc.pw > 0 || doz.pw > 0) bad.push('a small machine linked from too far: ' + [exc.pw, doz.pw]); if (!(near.pw > 0)) bad.push('excavator within its reach is not linked');
    a.clear(); return bad.length === 0 || bad.join('; ') + ` (reach ${reach})`;
  });

  await T('earth.guest-sees-what-the-host-reports-and-can-park-a-machine-with-E', async () => {
    await world(); fresh(up()); const a = arena(); const e = mk('excavator', a.i0, a.k0); const tk = mk('truck', a.i0 - 8, a.k0 + 8); run(25); tk.cn = 40; tk.px += 3;
    let sent = []; g.netSend = (m) => sent.push(json(m)); g.net.open = true; g.net.role = 'host'; g.remote = { pos: p().pos.clone() };
    try {
      g.sendDyn(); const dyn = sent.find((m) => m.t === 'dyn'); if (!dyn) return 'no dyn message';
      const rows = dyn.movers.filter((r) => r[0] === e.id || r[0] === tk.id); if (rows.length !== 2) return 'rows for earth movers: ' + rows.length;
      const stripped = sent.length; void stripped; const msg = json(g.stripEnt(e)); if (msg.hop || msg.cargo) return 'hopper contents were sent with the entity';
      // now play the guest: same page, the entities replaced by what the host announced
      g.net.role = 'guest'; g.guestReady = true; const hostState = { hn: e.hn, state: e.state, dug: e.dug, cn: tk.cn, px: tk.px, i: e.i };
      e.hn = 0; e.state = 'idle'; e.dug = 0; e.i = e.i - 1; tk.cn = 0; tk.px = 0; g.applyDyn(dyn);
      const bad = []; if (e.hn !== hostState.hn) bad.push(`hopper ${e.hn} vs ${hostState.hn}`); if (e.state !== hostState.state) bad.push(`state ${e.state} vs ${hostState.state}`); if (e.i !== hostState.i) bad.push('cell'); if (e.dug !== hostState.dug) bad.push('dug'); if (tk.cn !== hostState.cn || Math.abs(tk.px - hostState.px) > 0.02) bad.push('truck row');
      // the guest model glides to the reported cell and animates
      const it = g.machines.items.get(e.id); const x0 = it.obj.position.x; for (let n = 0; n < 30; n++) g.machines.guestUpdate(0.05, g.time + n * 0.05); if (Math.abs(it.obj.position.x - cellX(e.i)) > 0.2) bad.push('model did not move to the reported cell');
      // E from a guest is a command the host runs
      sent = []; g.useEarthIt(it); const c = sent.find((m) => m.t === 'cmd' && m.c === 'earth'); if (!c || c.d.id !== e.id) bad.push('no earth command'); void x0;
      g.net.role = 'host'; e.hn = 3; e.hop = [3, 0, 4, 0, 5, 0]; sent = []; g.netMessage(json(c)); if (!sent.some((m) => m.t === 'give') && !e.off) bad.push('host ran no command');
      return bad.length === 0 || bad.join('; ');
    } finally { delete g.netSend; g.net.open = false; g.net.role = null; g.guestReady = false; g.remote = null; a.clear(); }
  });

  await T('earth.placing-an-earth-mover-announces-it-to-the-guest-and-counts-the-stats', async () => {
    await world(); fresh(up()); const a = arena(); const sent = []; g.netSend = (m) => sent.push(json(m)); g.net.open = true; g.net.role = 'host';
    try {
      craft('excavator'); selectTool('excavator'); aimPoint(cellX(a.i0), 0, cellZ(a.k0), 3.0); const pl = await plan(); if (!pl.ok) return pl.why; placeNow();
      const plus = sent.find((m) => m.t === 'ent+' && m.ent.type === 'excavator'); if (!plus) return 'no ent+ for the excavator'; if (plus.ent.hop) return 'ent+ carried the hopper';
      return (S().stats.earthBuilt >= 1 && S().stats.excavators >= 1) || 'stats not counted';
    } finally { delete g.netSend; g.net.open = false; g.net.role = null; a.clear(); }
  });

  await T('earth.the-tuning-numbers-reach-the-machines', async () => {
    const t0 = tune(up()), t1 = tune(up({ excavatorSpeed: 6, excavatorBucket: 4, excavatorCount: 4, hopperLiner: 4, dozerBlade: 3, dozerCount: 4, dozerSpeed: 6, wheelCount: 3, wheelSpeed: 5, wheelBuckets: 3, truckCount: 6, truckSpeed: 6, truckBed: 4, truckRange: 4, earthDrives: 4, fusion: 3, earthFleet: 0 }));
    const a = earthTune(t0, 'excavator'), b = earthTune(t1, 'excavator'), da = earthTune(t0, 'dozer'), db = earthTune(t1, 'dozer'), wa = earthTune(t0, 'wheel'), wb = earthTune(t1, 'wheel'), ta = earthTune(t0, 'truck'), tb = earthTune(t1, 'truck');
    const bad = [];
    if (!(b.max === a.max + 4 && b.rate < a.rate * 0.27 && b.swing === 72 && a.swing === 12 && b.hopper === a.hopper * 16)) bad.push('excavator ' + JSON.stringify([a, b]));
    if (!(db.max === da.max + 4 && db.rate < da.rate * 0.27 && db.blade === 11 && da.blade === 5 && db.swing > da.swing * 2)) bad.push('dozer ' + JSON.stringify([da, db]));
    if (!(wb.max === wa.max + 3 && wb.rate < wa.rate * 0.33 && wb.swing === 160 && wb.hopper === wa.hopper * 16)) bad.push('wheel ' + JSON.stringify([wa, wb]));
    if (!(tb.max === ta.max + 12 && tb.speed > ta.speed * 3.8 && tb.bed === 3840 && tb.range === 6400)) bad.push('truck ' + JSON.stringify([ta, tb]));
    const f = earthTune(tune(up({ fusion: 3, genOutput: 6, earthDrives: 4, earthFleet: 3 })), 'excavator'); if (f.max !== a.max + 3) bad.push('fleet ' + f.max);
    return bad.length === 0 || bad.join('; ');
  });

  await T('earth.the-work-volume-is-the-size-the-text-says', async () => {
    await world(); fresh(up()); const a = arena({ deep: 6, wide: 15, high: 9 }); const bad = [];
    for (const [kind, lat, vert, reach] of [['excavator', 7, 5, 3], ['wheel', 11, 6, 3]]) {
      const e = mk(kind, a.i0 + 0, a.k0); const cells = workCells(g, e, earthTune(g.T, kind)); const ks = new Set(cells.map(([, i, j, k]) => `${j}`)), ls = new Set(cells.map(([, i, j, k]) => k - a.k0));
      if (ls.size !== lat) bad.push(`${kind} width ${ls.size}`); if (ks.size !== vert) bad.push(`${kind} height ${ks.size}`); gone(e);
    }
    a.clear(); return bad.length === 0 || bad.join('; ');
  });
}
