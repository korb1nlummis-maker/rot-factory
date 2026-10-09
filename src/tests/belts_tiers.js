// belts.* (wave 1A): belt marks Mk1 to Mk6, speed and power per tile, upgrade in place, corner arcs, bench rows and unlock upgrades, readouts.
import { makeBeltKit, UP_ALL, UP_BASE } from './belts_lib.js';
import { TIER_NAMES, TIER_MUL, TIER_KW, TIER_COST, TIER_COLOR, UG_SPAN, rateOf, priceOf, tierOf, CRANK, SPACING, markOn, topMark } from '../beltdata.js';
import { HAND_CRANK } from '../logistics.js';
import { STRUT_DEPTH, upgradeById } from '../upgrades.js';
import { FRAME_RATING, FRAME_RATING_JACK } from '../beltparts.js';
import { CONFLICTS } from '../catalog.js';
import { infoFor } from '../info.js';
import { recipes } from '../crafting.js';
import { DEMAND } from '../power.js';

export default async function (ctx) {
  const { T: T0, g, S, p, L, THREE, tiles, toI, toK, cellX, cellZ } = ctx;
  const B = makeBeltKit(ctx), K = B.K;
  const T = B.T; void T0;
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const rec = (id) => recipes(g).find((r) => r.id === id);

  await T('belts.tier-table-matches-the-spec-and-the-other-files', async () => {
    const bad = [];
    const spec = [282, 423, 635, 960, 1410, 2120];
    for (let k = 0; k < 6; k++) { const r = rateOf({ beltSpeed: 1.6 }, k); if (Math.abs(r - spec[k]) / spec[k] > 0.01) bad.push(`${TIER_NAMES[k]} prints ${r.toFixed(0)}, spec says about ${spec[k]}`); }
    if (JSON.stringify(TIER_MUL) !== '[1,1.5,2.25,3.4,5,7.5]') bad.push('multipliers ' + TIER_MUL);
    if (JSON.stringify(TIER_KW) !== '[0.03,0.05,0.09,0.16,0.3,0.55]') bad.push('kW ' + TIER_KW);
    if (JSON.stringify(TIER_COST) !== '[3,12,60,300,1500,8000]') bad.push('cost ' + TIER_COST);
    if (JSON.stringify(UG_SPAN) !== '[4,6,8,10,12,14]') bad.push('spans ' + UG_SPAN);
    if (CRANK !== HAND_CRANK) bad.push(`CRANK ${CRANK} differs from HAND_CRANK ${HAND_CRANK}`);
    if (FRAME_RATING !== STRUT_DEPTH.strut || FRAME_RATING_JACK !== STRUT_DEPTH.jack) bad.push('lift frame depth ratings differ from STRUT_DEPTH');
    if (DEMAND.belt !== TIER_KW[0]) bad.push(`DEMAND.belt ${DEMAND.belt} is not the Mk1 draw`);
    if (CONFLICTS.length) bad.push('catalog conflicts: ' + CONFLICTS.join('; '));
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.tier-speed-matches-printed-throughput', async () => {
    const bad = [];
    for (let k = 0; k < 6; k++) {
      B.setup(UP_BASE); const i = B.i0(), kk = B.k0(), line = B.lay(k, 20, i, kk, 0), v = B.vaultAt(i + 20, kk);
      const m = B.measure(line, v), printed = rateOf(g.T, k);
      if (m.count < m.total) bad.push(`${TIER_NAMES[k]}: only ${m.count} of ${m.total} arrived`);
      else if (Math.abs(m.rate - printed) / printed > 0.05) bad.push(`${TIER_NAMES[k]}: measured ${m.rate.toFixed(0)} per min, printed ${printed.toFixed(0)}`);
      const t0 = line[5], info = infoFor(g, { kind: 'tile', id: t0.id }), txt = info ? info.lines.join(' | ') : '';
      if (!txt.includes(`${Math.round(printed).toLocaleString('en-US')} plush per min`)) bad.push(`${TIER_NAMES[k]} hover does not print ${Math.round(printed)}: ${txt.slice(0, 90)}`);
    }
    // the printed number follows the belt upgrades too
    B.setup({ ...UP_BASE, beltSpeed: 2 }); const t = B.lay(2, 3, B.i0(), B.k0())[0]; const info = infoFor(g, { kind: 'tile', id: t.id });
    const want = Math.round(rateOf(g.T, 2)).toLocaleString('en-US'); if (!info.lines.join(' ').includes(want + ' plush per min')) bad.push('upgraded belt speed is not in the readout, wanted ' + want);
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.rate-does-not-depend-on-the-frame-time', async () => {
    const done = {};
    for (const dt of [0.1, 1 / 60, 0.005]) {
      B.setup({ ...UP_BASE, beltSpeed: 3 }); const i = B.i0(), kk = B.k0(), line = B.lay(3, 20, i, kk, 0), v = B.vaultAt(i + 20, kk);
      const m = B.measure(line, v, dt); if (m.count < m.total) return `dt ${dt}: only ${m.count} of ${m.total} arrived`; done[dt] = m.done;
    }
    const ref = done[0.005];
    return (Math.abs(done[0.1] - ref) <= 0.1 + ref * 0.1 && Math.abs(done[1 / 60] - ref) <= 0.03 + ref * 0.06) || `all plush arrived after ${JSON.stringify(done)} s`;
  });

  await T('belts.slow-tile-sets-line-rate', async () => {
    B.setup(UP_BASE); const i = B.i0(), kk = B.k0(), line = B.lay(3, 20, i, kk, 0), v = B.vaultAt(i + 20, kk);
    const slow = line[8]; delete slow.tier; L().dirty = true;
    const m = B.measure(line, v), r1 = rateOf(g.T, 0), r3 = rateOf(g.T, 3), tail = m.tailRate(15);
    const bad = [];
    if (Math.abs(tail - r1) / r1 > 0.1) bad.push(`settled rate ${tail.toFixed(0)}, a Mk1 tile passes ${r1.toFixed(0)} (Mk4 ${r3.toFixed(0)})`);
    const info = infoFor(g, { kind: 'tile', id: line[15].id }), txt = info ? info.lines.join(' | ') : '';
    if (!/slowest is Mk1 7 tiles behind/.test(txt) || !txt.includes(`${Math.round(r1)} per min`)) bad.push('bottleneck line: ' + txt.slice(0, 200));
    const own = infoFor(g, { kind: 'tile', id: slow.id }); if (own && /slowest is/.test(own.lines.join(' '))) bad.push('the slow tile calls itself the bottleneck of a line it limits: ' + own.lines.join(' | '));
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.upgrade-in-place-refunds', async () => {
    B.setup(UP_ALL); const bad = []; const spot = { x: -6.6, z: 1.2, dir: 0 };
    let r = await K.put('belt', spot); if (!r.ok) return 'could not place the Mk1 belt: ' + r.why;
    const tile = L().byId.get(r.ent.id); tile.items.push({ sp: B.sp, vr: 0, t: 0.4 }); const n0 = S().entities.length, id0 = tile.id;
    r = await K.put('belt:1', spot); if (!r.ok) return 'no upgrade plan: ' + r.why;
    if (!/upgrade this belt from Mk1 to Mk2/.test(r.hint)) bad.push('hint: ' + String(r.hint).slice(0, 80));
    if (tile.tier !== 1 || L().byId.get(id0) !== tile || S().entities.length !== n0) bad.push(`tile after the upgrade: tier ${tile.tier}, same tile ${L().byId.get(id0) === tile}, ents ${n0} -> ${S().entities.length}`);
    if (tile.items.length !== 1 || tile.items[0].t !== 0.4) bad.push('the plush on the tile were disturbed');
    if (S().items.belt !== 1 || (S().items['belt:1'] || 0) !== 0) bad.push('refund: ' + JSON.stringify(S().items));
    // Mk4 over Mk2 hands back a Mk2
    r = await K.put('belt:3', spot); if (!r.ok) bad.push('Mk2 to Mk4 refused: ' + r.why); else if (tile.tier !== 3 || S().items['belt:1'] !== 1) bad.push(`Mk2 to Mk4: tier ${tile.tier}, items ${JSON.stringify(S().items)}`);
    // the same or a lower mark is not an upgrade
    const again = await K.put('belt:3', spot); if (again.ok) bad.push('set Mk4 over Mk4');
    const lower = await K.put('belt:1', spot); if (lower.ok || tile.tier !== 3) bad.push('set Mk2 over Mk4: ' + lower.ok);
    // a ramp keeps its mark (it is always Mk1)
    const rp = await K.put('ramp', { x: -4.2, z: 2.4, dir: 3, ramp: 0 }); if (rp.ok) { const up = await K.put('belt:1', { x: -4.2, z: 2.4, dir: 3 }); if (up.ok) bad.push('a ramp was upgraded'); }
    // the hammer hands back the mark
    const held = S().items['belt:3'] || 0; g.doDecon({ kind: 'tile', id: tile.id }); if (S().items['belt:3'] !== held + 1) bad.push('the hammer returned ' + JSON.stringify(S().items));
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.holding-b-lays-the-mark-in-hand-and-upgrades-what-it-crosses', async () => {
    B.setup(UP_ALL); const bad = []; const i = B.i0(), kk = B.k0();
    B.lay(0, 3, i, kk, 0); S().money = 1e12; g.craftItem('belt:1', 6); K.equip('belt:1');
    g.keys.KeyB = true;
    for (let q = 0; q < 5; q++) { K.aimDir(cellX(i + q), 0, cellZ(kk), 0, 2.0); await ctx.plan(); }
    g.keys.KeyB = false; g.lastPaint = '';
    const row = []; for (let q = 0; q < 5; q++) row.push(L().tileAt(i + q, 0, kk));
    if (row.some((t) => !t)) bad.push('cells left empty: ' + row.map((t) => (t ? tierOf(t) : '-')).join(''));
    else if (row.some((t) => tierOf(t) !== 1)) bad.push('marks along the row: ' + row.map((t) => tierOf(t)).join(''));
    if (S().items.belt !== 3 || S().items['belt:1'] !== 1) bad.push('items after painting: ' + JSON.stringify(S().items));
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.power-per-tile-follows-the-mark', async () => {
    B.setup(UP_ALL); const i = B.i0(), kk = B.k0();
    const pole = g.placeEntity('pole', { i: i + 2, j: 0, k: kk + 2, dir: 0 }, { quiet: true, rebuild: false });
    const rows = []; for (let k = 0; k < 6; k++) rows.push(B.lay(k, 2, i, kk - 4 + k, 0));
    S().items.cable = 10; for (const row of rows) { const r = g.cables.connect(pole.id, row[0].id); if (!r.ok) return 'wiring a line: ' + r.why; }   // one cable per line powers both of its tiles
    g.power.recompute();
    const net = g.power.nets.find((n) => n.nodes.some((x) => x.type === 'pole')); if (!net) return 'no grid';
    const want = TIER_KW.reduce((a, b) => a + b * 2, 0);
    return near(net.demand, want, 1e-6) || `grid demand ${net.demand}, six marks of two tiles draw ${want}`;
  });

  await T('belts.unpowered-belt-crawls-at-its-marks-speed', async () => {
    B.setup(UP_BASE); const bad = [];
    for (const k of [0, 3]) {
      const t = B.lay(k, 2, B.i0(), B.k0() + 2 * k, 0)[0]; t.pw = undefined; t.items = [{ sp: B.sp, vr: 0, t: 0 }];
      for (let q = 0; q < 10; q++) { g.time += 0.05; L().update(0.05); t.pw = undefined; }
      const want = g.T.beltSpeed * TIER_MUL[k] * HAND_CRANK * 0.5; if (!near(t.items[0].t, want, 0.03)) bad.push(`${TIER_NAMES[k]} crept ${t.items[0].t.toFixed(3)}, wanted ${want.toFixed(3)}`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.corner-arc-keeps-item-order', async () => {
    B.setup(UP_BASE); const bad = []; const i = B.i0(), kk = B.k0();
    const a = B.lay(2, 3, i, kk, 0), b = B.lay(2, 3, i + 3, kk, 1); const line = [...a, ...b]; B.vaultAt(i + 3, kk + 3);
    L().rebuildBelts(); const corner = b[0];
    if (corner.cd !== 0) return 'no corner at the turn: cd ' + corner.cd;
    { const nb = tiles().filter((t) => t.type === 'belt').length; if (L().bedMesh.count !== nb - 1 || L().railMesh.count !== 2 * (nb - 1) || L().bendBedR.count + L().bendBedL.count !== 1 || L().bendRailR.count + L().bendRailL.count !== 1 || L().cornerN !== 1) bad.push(`arc meshes: beds ${L().bedMesh.count}, rails ${L().railMesh.count}, bend decks ${L().bendBedR.count + L().bendBedL.count}, corners ${L().cornerN} for ${nb} tiles (an arc is one curved deck and two curved rails of its own)`); }
    const objs = [{ sp: B.sp, vr: 0, t: 0.9 }, { sp: B.sp, vr: 0, t: 0.56 }, { sp: B.sp, vr: 0, t: 0.22 }]; a[2].items = objs.slice();
    const prog = (it) => { for (let q = 0; q < line.length; q++) if (line[q].items.includes(it)) return q + Math.min(1, it.t); return 99; };
    const pos = () => { const m = new Map(); L().forEachItem((it, x, y, z) => m.set(it, [x, z])); return m; };
    let prev = pos(), worst = 0, order = true, cornered = false;
    for (let s = 0; s < 240; s++) {
      B.step(1 / 60);
      const cur = pos(); const pr = objs.map(prog);
      if (!(pr[0] >= pr[1] && pr[1] >= pr[2])) order = false;
      for (const it of objs) { const x = prev.get(it), y = cur.get(it); if (x && y) worst = Math.max(worst, Math.hypot(x[0] - y[0], x[1] - y[1])); }
      if (corner.items.length && corner.items[0].t > 0.3 && corner.items[0].t < 0.7) { const [x, z] = cur.get(corner.items[0]) || []; if (x !== undefined && Math.abs(x - cellX(corner.i)) > 0.02 && Math.abs(z - cellZ(corner.k)) > 0.02) cornered = true; }
      prev = cur;
    }
    const step = g.T.beltSpeed * TIER_MUL[2] * 0.6 / 60;
    if (!order) bad.push('plush swapped places on the bend');
    if (worst > step * 1.8 + 0.005) bad.push(`an item jumped ${worst.toFixed(3)} m in one frame, a frame is ${step.toFixed(3)} m`);
    if (!cornered) bad.push('items cut straight through the middle of the corner cell instead of riding the arc');
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.rails-are-tinted-by-the-mark', async () => {
    B.setup(UP_BASE); const i = B.i0(), kk = B.k0();
    const line = []; for (let k = 0; k < 6; k++) line.push(...B.lay(k, 1, i + k, kk, 0)); L().rebuildBelts();
    const arr = L().railMesh.instanceColor.array, bad = [];
    for (let k = 0; k < 6; k++) {
      const c = new THREE.Color(TIER_COLOR[k]), at = tiles().filter((t) => t.type === 'belt').indexOf(line[k]) * 2;
      for (const r of [at, at + 1]) if (!near(arr[r * 3], c.r, 1e-4) || !near(arr[r * 3 + 1], c.g, 1e-4) || !near(arr[r * 3 + 2], c.b, 1e-4)) bad.push(`${TIER_NAMES[k]} rail ${r}: ${[...arr.slice(r * 3, r * 3 + 3)].map((x) => x.toFixed(3))} wanted ${[c.r, c.g, c.b].map((x) => x.toFixed(3))}`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.bench-lists-the-marks-you-unlocked-at-the-right-price', async () => {
    const bad = [];
    B.setup({ belts: 1, power: 1, beltSpeed: 3, beltMk2: 1, beltMk3: 1 });
    const ids = recipes(g).map((r) => r.id);
    for (const id of ['belt', 'ramp', 'belt:1', 'belt:2']) if (!ids.includes(id)) bad.push('missing ' + id);
    for (const id of ['belt:3', 'belt:4', 'belt:5', 'lift', 'ug', 'liftframe', 'lift:3', 'ug:3']) if (ids.includes(id)) bad.push('should not be listed yet: ' + id);
    for (const id of ['lift:1', 'ug:2']) if (!ids.includes(id)) bad.push('a mark brings its own lift and underground: missing ' + id);
    for (let k = 1; k <= 2; k++) { const r = rec('belt:' + k); if (r && r.price !== TIER_COST[k] * 3) bad.push(`${r.id} price ${r.price}, wanted ${TIER_COST[k] * 3}`); if (r && !/upgrade it in place/.test(r.use)) bad.push(`${r.id} use text is not its own: ${r.use.slice(0, 50)}`); }
    S().money = 1e9; const m0 = S().money; g.craftItem('belt:2', 10); if (S().items['belt:2'] !== 10 || m0 - S().money !== 10 * 60 * 3) bad.push(`crafting 10 Mk3 belts: items ${S().items['belt:2']}, charged ${m0 - S().money}`);
    B.setup({ belts: 1, power: 1, beltSpeed: 6, beltMk2: 1, beltLift: 1 });
    const li = recipes(g).map((r) => r.id); for (const id of ['lift', 'lift:1', 'liftframe']) if (!li.includes(id)) bad.push('missing ' + id); if (li.includes('ug')) bad.push('ug without its upgrade');
    if (rec('lift') && rec('lift').price !== 2 * 3 * 3) bad.push('a Mk1 lift cell costs ' + rec('lift').price + ', wanted 18'); if (rec('lift:1') && rec('lift:1').price !== 2 * 12 * 3) bad.push('a Mk2 lift cell costs ' + rec('lift:1').price);
    B.setup({ belts: 1, power: 1, beltSpeed: 6, beltUg: 1 });
    if (!recipes(g).some((r) => r.id === 'ug') || rec('ug').price !== 120) bad.push('ug price ' + (rec('ug') && rec('ug').price));
    B.setup({ belts: 1, power: 1 }); if (recipes(g).some((r) => /^(belt:|lift|ug)/.test(r.id))) bad.push('marks listed with no upgrade');
    B.setup({ power: 1 }); if (recipes(g).some((r) => /^(belt|lift|ug)/.test(r.id))) bad.push('belts listed with no belts upgrade');
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.unlock-upgrades-cost-and-follow-the-chain', async () => {
    const bad = []; const want = { beltMk2: [150000, 'beltSpeed', 3], beltMk3: [1200000, 'beltSpeed', 6], beltMk4: [6000000, 'overdrive', 1], beltMk5: [30000000, 'overdrive', 2], beltMk6: [150000000, 'overdrive', 3] };
    for (const [id, [cost, req, lvl]] of Object.entries(want)) { const u = upgradeById(id); if (!u) { bad.push('no upgrade ' + id); continue; } if (u.cost[0] !== cost || u.req.id !== req || u.req.lvl !== lvl || u.max !== 1) bad.push(`${id}: cost ${u.cost}, needs ${u.req.id} ${u.req.lvl}`); if (/—|undefined/.test(u.desc)) bad.push(id + ' text'); }
    B.setup({ belts: 1, power: 1, beltSpeed: 3 }); S().money = 150000 - 1; if (g.buy('beltMk2')) return 'bought Mk2 one coin short';
    S().money = 150000; if (!g.buy('beltMk2') || !markOn(g.T, 1) || markOn(g.T, 2) || S().money !== 0) bad.push(`Mk2: marks ${g.T.beltMarks}, money ${S().money}`);
    S().money = 1e9; if (g.buy('beltMk3')) bad.push('bought Mk3 without Belt Motors 6');
    S().up.beltSpeed = 6; if (!g.buy('beltMk3') || !markOn(g.T, 2)) bad.push('Mk3 after Belt Motors 6: ' + g.T.beltMarks);
    if (g.buy('beltMk4')) bad.push('bought Mk4 without Overdrive');
    S().up.overdrive = 3; for (const id of ['beltMk4', 'beltMk5', 'beltMk6']) if (!g.buy(id)) bad.push('could not buy ' + id); if (topMark(g.T) !== 5 || [1, 2, 3, 4, 5].some((k) => !markOn(g.T, k))) bad.push('marks ' + g.T.beltMarks);
    // a mark you skipped stays locked: Mk3 alone does not bring Mk2
    B.setup({ belts: 1, power: 1, beltSpeed: 6, beltMk3: 1 }); if (markOn(g.T, 1) || !markOn(g.T, 2) || recipes(g).some((r) => r.id === 'belt:1') || !recipes(g).some((r) => r.id === 'belt:2')) bad.push('skipping Mk2: marks ' + g.T.beltMarks);
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.hover-text-has-the-mark-the-speed-and-the-line', async () => {
    B.setup(UP_BASE); const bad = []; const i = B.i0(), kk = B.k0(), line = B.lay(1, 6, i, kk, 0);
    const info = infoFor(g, { kind: 'tile', id: line[2].id }); if (!info) return 'no readout';
    if (info.title !== 'BELT MK2') bad.push('title ' + info.title);
    const txt = info.lines.join(' | ');
    for (const part of ['Mk2 belt: 424 plush per min', 'Line of 6: runs at 424 per min', 'Speed 2.4 tiles per second']) if (!txt.includes(part)) bad.push(`missing "${part}" in ${txt}`);
    // unpowered: the live number drops to the hand crank
    line[2].pw = 0; const dim = infoFor(g, { kind: 'tile', id: line[2].id }).lines.join(' | '); if (!/148 right now/.test(dim)) bad.push('no live number when unpowered: ' + dim.slice(0, 120));
    // a plain Mk1 belt keeps the old readout and adds the rate
    const one = B.lay(0, 1, i, kk + 3, 0)[0]; const t1 = infoFor(g, { kind: 'tile', id: one.id }); if (t1.title !== 'BELT' || !t1.lines.some((l) => /^Mk1 belt: 282 plush per min/.test(l)) || !t1.lines.some((l) => /Speed 1.6 tiles per second/.test(l))) bad.push('Mk1 readout: ' + JSON.stringify(t1.lines.slice(0, 3)));
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.tiles-without-a-mark-behave-as-mk1-and-keep-their-numbers', async () => {
    // an old save has no tier on its belts: they must be Mk1 everywhere, with the speed they always had
    B.setup(UP_BASE); const i = B.i0(), kk = B.k0(); const old = B.lay(0, 12, i, kk, 0); for (const t of old) delete t.tier;
    const v = B.vaultAt(i + 12, kk); const m = B.measure(old, v);
    const bad = []; if (tierOf(old[0]) !== 0) bad.push('tierOf ' + tierOf(old[0]));
    if (Math.abs(m.rate - 1.6 / SPACING * 60) / (1.6 / SPACING * 60) > 0.05) bad.push(`old belts moved ${m.rate.toFixed(0)} per min, they always did ${(1.6 / SPACING * 60).toFixed(0)}`);
    return bad.length === 0 || bad.join('; ');
  });
}
