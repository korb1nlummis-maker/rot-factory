// vscan.*: the Vehicle Scanner (src/vehiclescan.js, src/catalog_scan.js): the unlock, the bench, setting it down, the sunk footings, power, the readout, settings and saves.
// The truck, digger and alarm rules are in vscan_haul.js, the host and guest side in vscan_mp.js. Run: `await __selftest('vscan.')`
import { makeKit } from './addons_lib.js';
import * as VS from '../vehiclescan.js';
import { PARTS, TYPES, CONFLICTS, DEMAND as CAT_DEMAND } from '../catalog.js';
import { DEMAND } from '../power.js';
import { EARTH } from '../earth.js';
import { infoFor } from '../info.js';
import { recipes } from '../crafting.js';
import { upgradeById, isUnlocked } from '../upgrades.js';
import { CONTROLS } from '../controls.js';
import { NEEDLE } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, p, V3, THREE, fresh, adv, toI, toK, cellX, cellZ, realSleep } = ctx;
  const K = makeKit(ctx);
  const UP = { detector: 1, archGate: 1, archGiant: 1, vscan: 1, power: 1, belts: 1 };
  const BAD = /undefined|NaN|\[object|Infinity/;
  const json = (m) => JSON.parse(JSON.stringify(m));
  const scans = () => [...g.machines.items.values()].map((it) => it.ent).filter((e) => e.type === 'vscan');
  // empty the section a scanner needs (12 wide, 10 high, one slice) plus the strip it stands on, so a test never depends on where plush lies
  const clearAt = (x, z, axis = 'z') => {
    const w = g.world, i0 = toI(x), k0 = toK(z);
    for (let a = -8; a <= 8; a++) for (let b = -8; b <= 8; b++) for (let j = 0; j < 13; j++) { const i = i0 + (axis === 'z' ? a : b), k = k0 + (axis === 'z' ? b : a); if (w.get(i, j, k)) w.removeCell(i, j, k, false); }
  };
  // one scanner on the bay floor without the tool pipeline (the vehicles drive along `axis`)
  const mk = (x, z, axis = 'z', extra = {}) => {
    K.clearBay(); clearAt(x, z, axis);
    const lat = axis === 'z' ? toI(x) : toK(z), m = axis === 'z' ? toK(z) : toI(x);
    const l = VS.layout(g, axis, m, lat - 5, 0); if (!l.ok) throw new Error('layout: ' + l.why);
    return g.placeEntity('vscan', { ...l.ent, ...extra });
  };
  // the first frame after a placement recomputes the grid (and zeroes an unwired scanner's power): let it pass, then give it power by hand
  const warm = (e) => { adv(0.1); g.power.dirty = false; g.power.t = 50; e.pw = 1; };   // (power is held on by hand: the unwired scanner would otherwise be solved back to 0 within the next frames)
  const pow = (e, secs, dt = 0.05) => { for (let n = 0; n < secs / dt; n++) { e.pw = 1; g.time += dt; g.updatePlay(dt); } };   // frames with power held on by hand
  const guard = (name, fn) => T(name, async () => {
    const fn0 = g.foundNeedle, mode0 = g.mode;
    try { g.mode = 'play'; return await fn(); } finally { g.foundNeedle = fn0; g.mode = mode0 === 'ended' ? 'play' : mode0; S().found = false; S().ending = null; S().needleLost = false; g.net.open = false; g.net.role = null; g.guestReady = false; delete g.netSend; g.stowed = true; g.rebuildTools(); g.cfgClip = null; g.alarmGate = null; if (g.ui.openModal) g.ui.closeModals(); }
  });

  // ---------------------------------------------------------------- catalog, unlock, bench
  await T('vscan.catalog-registers-the-scanner-with-its-unlock-demand-and-no-conflicts', async () => {
    const bad = [];
    const mine = CONFLICTS.filter((c) => /vscan|scan\b/.test(c)); if (mine.length) bad.push('catalog conflicts: ' + mine.join('; '));   // (other waves' own clashes are theirs to fix)
    if (!PARTS.scan || !PARTS.scan.TYPES.vscan || !TYPES.vscan) bad.push('type vscan not registered');
    const u = upgradeById('vscan');
    if (!u || u.cost[0] !== 12000000 || u.max !== 1 || !u.req || u.req.id !== 'archGiant' || u.cat !== 'machine') bad.push('unlock: ' + JSON.stringify(u && [u.cost, u.max, u.req, u.cat]));
    if (u && (BAD.test(u.name + u.desc) || /[–—]/.test(u.desc) || !/The One/.test(u.desc) || !/refuses to leave/.test(u.desc))) bad.push('unlock text: ' + u.desc);
    if (CAT_DEMAND.vscan !== 14 || DEMAND.vscan !== 14) bad.push(`demand ${CAT_DEMAND.vscan} / ${DEMAND.vscan}`);
    const h = TYPES.vscan; for (const k of ['plan', 'build', 'conflict', 'preview', 'add', 'info', 'use', 'tick', 'guestTick', 'row', 'guestRow', 'item', 'onRemove', 'cfg']) if (!h[k]) bad.push('handler missing: ' + k);
    return bad.length === 0 || bad.join(' || ');
  });

  await T('vscan.the-unlock-needs-the-giant-arch-and-opens-the-bench-row', async () => {
    const bad = []; fresh({ detector: 1 }); S().money = 1e12; S().stats.plush = 1e9;
    const u = upgradeById('vscan'); if (isUnlocked(u, { detector: 1, archGate: 1 }, S())) bad.push('unlocked without the giant arch');
    if (!isUnlocked(u, { detector: 1, archGate: 1, archGiant: 1 }, S())) bad.push('locked with the giant arch');
    fresh(UP); g.T = g.tune();
    const r = recipes(g).find((x) => x.id === 'vscan');
    if (!r || r.kind !== 'vscan' || r.price !== 6000000 || r.batch.join() !== '1' || !r.use || !r.statusFn || BAD.test(r.desc + r.use + r.statusFn()) || /[–—]/.test(r.desc + r.use)) bad.push('bench row: ' + JSON.stringify(r && [r.id, r.kind, r.price, r.batch]));
    fresh({ detector: 1, archGate: 1, archGiant: 1 }); g.T = g.tune(); if (recipes(g).some((x) => x.id === 'vscan')) bad.push('on the bench before the unlock');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('vscan.bench-charges-the-card-price-and-each-scanner-makes-the-next-35-percent-dearer', async () => {
    const bad = []; fresh(UP); g.T = g.tune(); S().money = 1e12; K.clearBay();
    const price = () => recipes(g).find((x) => x.id === 'vscan').price;   // the bench row already carries the K = 3 multiplier
    if (price() !== 6000000) bad.push('first price ' + price());
    const m0 = S().money; g.craftItem('vscan', 1); if (m0 - S().money !== 6000000 || S().items.vscan !== 1) bad.push(`crafted: paid ${m0 - S().money}, have ${S().items.vscan}`);
    mk(-8, 2); const second = price(); if (Math.abs(second - 6000000 * 1.35) > 3) bad.push('second price ' + second);
    mk(-8, 7); const third = price(); if (Math.abs(third - 6000000 * 1.35 * 1.35) > 3) bad.push('third price ' + third);
    if (VS.scanCost(0) !== 6000000 || VS.scanCost(2) !== Math.round(6000000 * 1.35 * 1.35)) bad.push('scanCost');
    // priced for a 10M wallet: the unlock and the first one together are in reach of the late game, not of the early one
    if (VS.UNLOCK + VS.PRICE < 1e7) bad.push('too cheap for a late game wallet');
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- placement
  await guard('vscan.tool-sets-it-down-facing-the-drive-and-the-hammer-hands-it-back', async () => {
    fresh(UP); const bad = []; K.clearBay();
    for (const [axis, dir, x, z] of [['z', 1, -8, 2.4], ['x', 0, -6, 6.6]]) {
      clearAt(x, z, axis);
      const r = await K.put('vscan', { x, z, dir, back: 2.4 }); if (!r.ok) { bad.push(`${axis}: ${r.why}`); continue; }
      const e = r.ent;
      if (e.type !== 'vscan' || e.axis !== axis) bad.push(`${axis}: ${JSON.stringify([e.type, e.axis])}`);
      if (Math.abs(e.w - (12 * 0.6 - 0.04)) > 1e-6 || Math.abs(e.h - (10 * 0.6 - 0.02)) > 1e-6 || e.hr !== VS.SIZE.hr) bad.push(`${axis}: size ${e.w} x ${e.h}`);
      if (e.volume !== 0.7 || e.quiet !== false || e.alarm !== false || e.held !== null || e.loads !== 0) bad.push(`${axis}: defaults ${JSON.stringify([e.volume, e.quiet, e.alarm, e.held, e.loads])}`);
      if (r.consumed !== 1) bad.push(`${axis}: consumed ${r.consumed}`);
      const it = g.machines.items.get(e.id); if (!it || !it.obj || it.obj.children.length < 8 || !it.vscan) bad.push(`${axis}: no mesh`);
      if (it && (Math.abs(it.obj.position.x - e.cx) > 1e-6 || Math.abs(it.obj.position.z - e.cz) > 1e-6 || Math.abs(it.obj.rotation.y - e.yaw) > 1e-6)) bad.push(`${axis}: mesh not at the ent`);
      if (e.x !== e.cx || e.z !== e.cz || e.y !== e.y0) bad.push(`${axis}: power spot ${e.x} ${e.y} ${e.z}`);
      g.doDecon({ kind: 'mach', id: e.id }); if (g.machines.items.has(e.id) || S().entities.some((x) => x.id === e.id)) bad.push(`${axis}: hammer left it`);
      if (S().items.vscan !== 1) bad.push(`${axis}: hammer gave ${JSON.stringify(S().items)}`); S().items = {};
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('vscan.placement-refuses-plush-belts-overlap-and-forged-requests', async () => {
    fresh(UP); const bad = []; K.clearBay(); const a = mk(-8, 3), w = g.world;
    const c = [toI(a.cx) + 1, 4, toK(a.cz)]; w.setCell(c[0], c[1], c[2], 2, 0);
    try {
      let l = VS.layout(g, 'z', toK(a.cz), toI(a.cx) - 6 + 0, 0); if (l.ok) bad.push('plush in the section was allowed');
      w.setCell(c[0], c[1], c[2], 0, 0); w.setCell(c[0], 9, c[2], 2, 0);
      l = VS.layout(g, 'z', toK(a.cz) + 5, toI(a.cx) - 5, 0); w.setCell(c[0], 9, c[2], 0, 0);
    } finally { w.setCell(c[0], c[1], c[2], 0, 0); w.setCell(c[0], 9, c[2], 0, 0); }
    // a plush in the top row is counted, with the number
    const b = toK(a.cz) + 6; clearAt(a.cx, cellZ(b), 'z'); w.setCell(toI(a.cx), 9, b, 2, 0); const top = VS.layout(g, 'z', b, toI(a.cx) - 5, 0); w.setCell(toI(a.cx), 9, b, 0, 0);
    if (top.ok || !/1 plush in the way/.test(top.why) || !/12 wide and 10 high/.test(top.why)) bad.push('top row plush: ' + top.why);
    // a belt in the section
    const bt = { id: g.nextId(), type: 'belt', i: toI(a.cx), j: 0, k: b, dir: 0, rise: 0, items: [] }; S().entities.push(bt); g.addEntity(bt);
    let l2 = VS.layout(g, 'z', b, toI(a.cx) - 5, 0); if (l2.ok || !/in the way/.test(l2.why)) bad.push('a belt in the section: ' + l2.why); g.doDecon({ kind: 'tile', id: bt.id });
    // two scanners on top of each other
    const ov = VS.layout(g, 'z', toK(a.cz), toI(a.cx) - 4, 0); if (ov.ok || !/already here/.test(ov.why)) bad.push('overlap: ' + ov.why);
    const far = VS.layout(g, 'z', toK(a.cz) + 4, toI(a.cx) - 5, 0); if (!far.ok) bad.push('a clean spot 4 cells on was refused: ' + far.why);
    // a floor that is not there, and the hall edge
    const fl = VS.layout(g, 'z', toK(a.cz) + 8, toI(a.cx) - 5, 3); if (fl.ok || !/solid floor/.test(fl.why)) bad.push('floating scanner: ' + fl.why);
    if (VS.layout(g, 'z', 5, -4, 0).ok) bad.push('outside the hall was allowed');
    // the host re-checks a guest's request: wrong item, junk numbers, an overlap
    const tool = { id: 'vscan', kind: 'vscan' };
    for (const [t, e, why] of [[{ id: 'belt', kind: 'vscan' }, a, 'item id belt'], [{ id: 'arch', kind: 'vscan' }, a, 'item id arch'], [tool, null, 'no ent'], [tool, { axis: 'q', gm: 1, glo: 1, gj: 0 }, 'bad axis'], [tool, { axis: 'x', gm: 1.5, glo: 1, gj: 0 }, 'fraction'], [tool, { axis: 'x', gm: 'a', glo: 1, gj: 0 }, 'string'], [tool, { axis: 'x', gm: -5, glo: 1, gj: 0 }, 'outside the hall'], [tool, { axis: 'z', gm: toK(a.cz), glo: toI(a.cx) - 5, gj: 0 }, 'overlap']]) {
      if (!g.placeConflict(t, e)) bad.push('host accepted ' + why);
    }
    if (g.placeConflict(tool, { axis: 'z', gm: toK(a.cz) + 8, glo: toI(a.cx) - 5, gj: 0 })) bad.push('host refused a clean request');
    // build() rebuilds everything from the integers: a forged centre or size never survives
    const made = VS.build(g, tool, { axis: 'z', gm: toK(a.cz) + 8, glo: toI(a.cx) - 5, gj: 0, cx: 999, w: 99, hr: 99, held: { sp: NEEDLE, vr: 0 }, alarm: true });
    if (!made || made.cx > 100 || made.w > 8 || made.hr !== VS.SIZE.hr || made.alarm || made.held) bad.push('forged fields survived: ' + JSON.stringify(made && [made.cx, made.w, made.hr, made.alarm, made.held]));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('vscan.the-ghost-shows-green-when-it-fits-and-red-when-it-does-not', async () => {
    fresh(UP); const bad = []; K.clearBay(); clearAt(-8, 3, 'z'); S().items.vscan = 1; K.equip('vscan'); K.aimDir(-8, 0, 3, 1, 2.4); await ctx.plan();
    if (!g.plan || !g.plan.ok) return 'plan: ' + (g.plan && g.plan.why);
    const M = g.machines; if (!M.ghost || !/^vscan/.test(M.ghostKey || '') || !/true$/.test(M.ghostKey)) bad.push('no green ghost: ' + M.ghostKey);
    if (Math.abs(M.ghost.position.x - g.plan.ent.cx) > 1e-6 || Math.abs(M.ghost.position.z - g.plan.ent.cz) > 1e-6) bad.push('ghost not at the plan');
    const w = g.world, c = [toI(g.plan.ent.cx), 3, toK(g.plan.ent.cz)]; w.setCell(c[0], c[1], c[2], 2, 0);
    try { await ctx.plan(); if (g.plan.ok || !/^vscan.*false$/.test(g.machines.ghostKey || '')) bad.push('no red ghost: ' + g.machines.ghostKey + ' ' + g.plan.ok); } finally { w.setCell(c[0], c[1], c[2], 0, 0); }
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- size and the sunk footings
  await guard('vscan.the-opening-fits-every-vehicle-with-room-to-spare', async () => {
    fresh(UP); const e = mk(-8, 3), bad = []; const c = e.clear;
    if (JSON.stringify(c) !== JSON.stringify(VS.clearOf())) bad.push('ent.clear and clearOf disagree');
    for (const [kind, spec] of Object.entries(EARTH)) {
      const wide = 2 * spec.half + 1;
      if (wide >= c.w || spec.hgt >= c.h) bad.push(`${kind} needs ${wide} x ${spec.hgt} cells, the opening is ${c.w} x ${c.h}`);
    }
    // the biggest thing that moves is the bucket wheel with its boom lifted: it is 11 wide as it digs, 6 cells (3.6 m) tall as it stands
    if (c.w < 9 || c.h < 8) bad.push('smaller than the spec: ' + JSON.stringify(c));
    if (e.w < 7 || e.h < 5.9) bad.push('arch is ' + e.w + ' x ' + e.h + ' m');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('vscan.the-footings-are-sunk-into-the-floor-and-the-arch-stands-above-it', async () => {
    fresh(UP); const e = mk(-8, 3), bad = [], it = g.machines.items.get(e.id);
    it.obj.updateMatrixWorld(true); const box = new THREE.Box3();   // only what is drawn: the alarm column and the held One are hidden until an alarm
    it.obj.traverse((o) => { let v = !!o.geometry; for (let q = o; q && v; q = q.parent) if (!q.visible) v = false; if (v) box.expandByObject(o, true); });
    if (Math.abs(box.min.y - (e.y0 - VS.SINK)) > 0.06) bad.push(`lowest point ${box.min.y.toFixed(3)}, expected ${(e.y0 - VS.SINK).toFixed(3)} (sunk ${VS.SINK} m)`);
    if (box.max.y < e.y0 + e.h) bad.push('arch tops out at ' + box.max.y.toFixed(2));
    if (Math.abs(it.obj.position.y - e.y0) > 1e-6) bad.push('the group origin is not the floor level');
    // the part above the floor is the arch: most of the height; the sunk part is a small slice of the whole
    const sunk = VS.SINK / (box.max.y - box.min.y); if (!(sunk > 0.05 && sunk < 0.15)) bad.push('sunk share ' + sunk.toFixed(3));
    if (VS.SINK < 0.3 || VS.SINK > 0.9) bad.push('"slightly sunk" is off: ' + VS.SINK);
    // width: it spans 12 cells, the footings reach out a little further
    const span = box.max.x - box.min.x, span2 = box.max.z - box.min.z; if (Math.max(span, span2) < 7.1) bad.push('arch span ' + span.toFixed(2) + ' / ' + span2.toFixed(2));
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- power
  await guard('vscan.a-pole-and-a-generator-power-it-and-the-grid-counts-its-14-kw', async () => {
    fresh(UP); const bad = []; K.clearBay(); S().money = 1e13;
    const gen = await K.put('gen', { x: -9, z: -1.2, dir: 0 }), pole = await K.put('pole', { x: -9, z: 1.2, dir: 0 }); if (!gen.ok || !pole.ok) return 'rig';
    const lit = mk(-8, 6), dark = mk(-8, 14); K.feedGen(K.tileOf(gen.ent), 12);
    S().items.cable = 4; { const a = g.cables.connect(gen.ent.id, pole.ent.id), b = g.cables.connect(pole.ent.id, lit.id); if (!a.ok || !b.ok) return 'wiring: ' + (a.why || b.why); }   // the near scanner has its cable, the dark one none
    for (const q of [lit, dark]) q.pw = 0; g.power.markDirty(); g.power.update(0.1); adv(1.0, 0.05);
    const net = g.power.nets.find((n) => n.nodes.some((x) => x.type === 'pole'));
    if (!(lit.pw > 0.05)) bad.push('the scanner next to the pole is not powered: ' + lit.pw);
    if (dark.pw > 0.05) bad.push('a scanner out of reach is powered: ' + dark.pw);
    if (!net || net.demand < 14 - 1e-6) bad.push('the grid does not count the 14 kW: ' + (net && net.demand));
    if (VS.powered(g, lit) !== true || VS.powered(g, dark) !== false) bad.push('powered() disagrees');
    if (!VS.scanState(lit).powered || VS.scanState(dark).powered) bad.push('lamp state follows power: ' + VS.scanState(lit).powered + ' ' + VS.scanState(dark).powered);
    const li = infoFor(g, { kind: 'mach', id: lit.id }), di = infoFor(g, { kind: 'mach', id: dark.id });
    if (!li.lit || di.lit || !/^Powered/.test(li.lines[1]) || !/^Needs 14 kW/.test(di.lines[1])) bad.push('readouts: ' + JSON.stringify([li.lit, li.lines[1], di.lit, di.lines[1]]));
    const lamps = (e) => g.machines.items.get(e.id).vscan.lamps.map((m) => m.color.getHex());
    if (lamps(lit).some((c) => c !== 0x2e8c4a)) bad.push('lit lamps ' + lamps(lit)); if (lamps(dark).some((c) => c !== 0x222222)) bad.push('dark lamps ' + lamps(dark));
    S().cables = []; g.cables.reset();   // (the cables of this test do not carry over)
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- the readout
  await guard('vscan.the-readout-follows-the-state-and-has-no-junk-text', async () => {
    fresh(UP); const e = mk(-8, 3), bad = []; warm(e); g.time += 0.2;
    const read = () => infoFor(g, { kind: 'mach', id: e.id });
    let r = read(); if (r.title !== 'VEHICLE SCANNER' || !r.lit || !/All clear/.test(r.lines[0]) || !/0 loads scanned/.test(r.lines.join('|')) || !/No load scanned yet/.test(r.lines.join('|'))) bad.push('idle: ' + JSON.stringify(r));
    if (!/7\.2 m wide, 6\.0 m high \(clear 9 x 8 cells\)/.test(r.lines.join('|')) || !/Footings sunk 0.6 m/.test(r.lines.join('|'))) bad.push('size line: ' + r.lines.join('|'));
    VS.react(g, e, 'clear', { n: 40 }); e.loads = 3; r = read(); if (!/Last load 0 s ago: clear \(40 plush\)/.test(r.lines.join('|')) || !/3 loads scanned/.test(r.lines.join('|'))) bad.push('after a scan: ' + r.lines.join('|'));
    e.alarm = true; e.held = { sp: NEEDLE, vr: 0 }; VS.react(g, e, 'alarm', { n: 99 }); r = read(); if (r.lit || !/^ALARM: The One was pulled out/.test(r.lines[0]) || !/Press E to take it/.test(r.lines[0]) || !/THE ONE found, load dumped \(99 plush\)/.test(r.lines.join('|'))) bad.push('alarm: ' + JSON.stringify(r));
    for (const state of [r, (e.alarm = false, e.held = null, e.pw = 0, VS.scanState(e).powered = false, read())]) { const all = state.title + state.lines.join(' '); if (BAD.test(all) || /[–—]/.test(all)) bad.push('junk in ' + all); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('vscan.the-panel-text-and-lamps-follow-clear-alarm-and-no-power', async () => {
    fresh(UP); const e = mk(-8, 3), bad = []; const rig = () => g.machines.items.get(e.id).vscan, st = VS.scanState(e);
    warm(e); adv(0.2); if (st.key !== 'false|true|0') bad.push('panel key ' + st.key);
    e.alarm = true; e.held = { sp: NEEDLE, vr: 0 }; adv(0.2); if (!rig().held.visible || !rig().column.visible || st.key !== 'true|true|0') bad.push('alarm props: ' + [rig().held.visible, rig().column.visible, st.key]);
    const reds = rig().lamps.filter((l) => l.color.getHex() === 0xff3322).length; if (!reds) bad.push('no red lamp under alarm');
    e.alarm = false; e.held = null; e.pw = 0; adv(0.2); if (rig().held.visible || rig().column.visible || rig().lamps.some((l) => l.color.getHex() !== 0x222222)) bad.push('lamps not dark with no power');
    e.loads = 7; pow(e, 0.2); if (st.key !== 'false|true|7') bad.push('loads counter did not redraw: ' + st.key);
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- the reaction and the sounds
  await guard('vscan.a-clear-load-ticks-softly-and-the-alarm-rings-the-da-ding-and-the-low-buzz', async () => {
    fresh(UP); const e = mk(-8, 3), bad = []; p().pos.set(e.cx, 0, e.cz - 5);
    const rec = () => { const calls = [], keep = {}; for (const k of ['tone', 'noise', 'thump']) keep[k] = g.sound[k]; g.sound.tone = (...a) => calls.push(['tone', ...a]); g.sound.noise = (...a) => calls.push(['noise', ...a]); g.sound.thump = (...a) => calls.push(['thump', ...a]); return { calls, off: () => { for (const k of Object.keys(keep)) g.sound[k] = keep[k]; } }; };
    let r = rec(); try { VS.react(g, e, 'clear', { n: 12 }); } finally { r.off(); }
    if (r.calls.length !== 1 || r.calls[0][1] !== 'sine' || r.calls[0][2] !== 700 || r.calls[0][5] > 0.3) bad.push('clear tick: ' + JSON.stringify(r.calls));
    e.quiet = true; r = rec(); try { VS.react(g, e, 'clear', { n: 12 }); } finally { r.off(); } if (r.calls.length) bad.push('quiet scanner ticked'); e.quiet = false;
    r = rec(); try { VS.react(g, e, 'alarm', { n: 12 }); } finally { r.off(); }
    const tn = r.calls.filter((c) => c[0] === 'tone');
    if (!tn.some((c) => c[1] === 'triangle' && c[2] === 659) || !tn.some((c) => c[1] === 'triangle' && c[2] === 988)) bad.push('no da-ding: ' + JSON.stringify(tn.map((c) => c.slice(1, 4))));
    if (!tn.some((c) => c[1] === 'square') || !tn.some((c) => c[1] === 'sawtooth') || !r.calls.some((c) => c[0] === 'thump' && c[2] === 70)) bad.push('no low buzz and thunk: ' + JSON.stringify(r.calls.map((c) => c[0] + c[2])));
    for (const c of tn) if (c[5] > 0.2) bad.push('too loud: ' + c[5]);
    // far away it is silent
    p().pos.set(e.cx + 90, 0, e.cz); r = rec(); try { VS.react(g, e, 'alarm', { n: 1 }); } finally { r.off(); } if (r.calls.length) bad.push('still audible at 90 m');
    // the klaxon repeats while the alarm stands (the gate's two square tones), and stops when it ends
    p().pos.set(e.cx, 0, e.cz - 5); warm(e); e.alarm = true; e.held = { sp: NEEDLE, vr: 0 }; r = rec(); try { adv(1.3, 0.05); } finally { r.off(); }
    const k = r.calls.filter((c) => c[0] === 'tone' && c[1] === 'square' && (c[2] === 880 || c[2] === 660)); if (k.length < 4) bad.push('klaxon played ' + k.length + ' tones in 1.3 s');
    e.alarm = false; e.held = null; r = rec(); try { adv(1.3, 0.05); } finally { r.off(); } if (r.calls.length) bad.push('klaxon went on after the alarm');
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- settings
  await guard('vscan.settings-are-volume-and-quiet-only-and-copy-paste-between-scanners', async () => {
    fresh(UP); const a = mk(-8, 3), b = mk(-8, 11), bad = [];
    if (!g.setCfg(a, { volume: 0.2, quiet: true }).ok || a.volume !== 0.2 || a.quiet !== true) bad.push('settings not applied');
    for (const patch of [{ alarm: true }, { held: { sp: NEEDLE, vr: 0 } }, { loads: 5 }, { cx: 9 }, { volume: 2 }, { volume: -1 }, { quiet: 'yes' }, {}, { volume: 0.3, junk: 1 }]) {
      const was = JSON.stringify([a.volume, a.quiet, a.alarm, a.held, a.loads, a.cx]); const r = g.setCfg(a, patch);
      if (r.ok || JSON.stringify([a.volume, a.quiet, a.alarm, a.held, a.loads, a.cx]) !== was) bad.push('accepted ' + JSON.stringify(patch));
    }
    g.copyCfg(a); const r = g.pasteCfg(b); if (!r.ok || b.volume !== 0.2 || b.quiet !== true) bad.push('paste: ' + JSON.stringify(r));
    // a different kind of machine does not take a scanner's settings
    const arch = g.placeEntity('arch', { size: 1, axis: 'z', gm: toK(-0.6), glo: toI(-3), gj: 0, cx: cellX(toI(-3)) + 0.9, cz: cellZ(toK(-0.6)), y0: 0, w: 2.36, h: 2.38, yaw: 0, mode: 'one', target: 0, rarity: 2, exact: false, volume: 0.7, quiet: false }); g.cfgClip = null; g.copyCfg(a); const r2 = g.pasteCfg(arch); if (r2.ok) bad.push('an arch took a scanner\'s settings');
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- saves
  await guard('vscan.saves-and-loads-with-the-alarm-and-an-old-save-gets-defaults', async () => {
    fresh(UP); const e = mk(-8, 3, 'z', { volume: 0.4, quiet: true, loads: 11 }), bad = [];
    e.alarm = true; e.held = { sp: NEEDLE, vr: 3 };
    const saved = json(S().entities.find((x) => x.id === e.id)); if (!saved.alarm || !saved.held || saved.held.sp !== NEEDLE || saved.loads !== 11 || saved.volume !== 0.4) bad.push('the entity does not hold its state: ' + JSON.stringify(saved));
    g.doDecon({ kind: 'mach', id: e.id }); S().items = {}; if (scans().length) return 'not removed';
    // load it back the way a save does: the same plain object through addEntity
    S().entities.push(saved); g.addEntity(saved); const back = scans()[0]; const it = g.machines.items.get(back.id);
    if (!back || !back.alarm || !back.held || back.held.sp !== NEEDLE || back.held.vr !== 3 || back.loads !== 11 || back.volume !== 0.4 || !back.quiet) bad.push('after load: ' + JSON.stringify(back));
    if (!it || !it.vscan || !it.vscan.held.visible) adv(0.1); if (!g.machines.items.get(back.id).vscan.held.visible) bad.push('the held One is not shown after a load');
    // an old save: only the bare fields, no settings and nothing about an alarm
    const old = { id: g.nextId(), type: 'vscan', axis: 'x', gm: toI(-4), glo: toK(10) - 5, gj: 0, cx: cellX(toI(-4)), cz: cellZ(toK(10) - 5) + 5.5 * 0.6, y0: 0 };
    K.clearBay(); clearAt(-4, 10, 'x'); S().entities.push(old); g.addEntity(old);
    if (old.volume !== 0.7 || old.quiet !== false || old.alarm !== false || old.held !== null || old.loads !== 0 || old.hr !== VS.SIZE.hr || !old.clear || !Number.isFinite(old.w) || !Number.isFinite(old.yaw)) bad.push('defaults: ' + JSON.stringify(old));
    // an alarm flag without a held item still keeps The One in the story (it can be taken), and a held item without the flag is dropped
    const odd = { id: g.nextId(), type: 'vscan', axis: 'z', gm: toK(-8), glo: toI(-9), gj: 0, cx: cellX(toI(-9)) + 3.3, cz: cellZ(toK(-8)), y0: 0, alarm: true };
    clearAt(-9, -8, 'z'); S().entities.push(odd); g.addEntity(odd); if (!odd.held || odd.held.sp !== NEEDLE) bad.push('alarm without a held item: ' + JSON.stringify(odd.held));
    const odd2 = { id: g.nextId(), type: 'vscan', axis: 'z', gm: toK(-2), glo: toI(1), gj: 0, cx: cellX(toI(1)) + 3.3, cz: cellZ(toK(-2)), y0: 0, held: { sp: NEEDLE, vr: 0 } };
    S().entities.push(odd2); g.addEntity(odd2); if (odd2.held !== null || odd2.alarm !== false) bad.push('a held item without the alarm flag: ' + JSON.stringify([odd2.alarm, odd2.held]));
    // a broken ent (no position) does not throw and shows nothing
    const broken = { id: g.nextId(), type: 'vscan' }; S().entities.push(broken); let threw = null; try { g.addEntity(broken); } catch (x) { threw = x; } if (threw) bad.push('a broken ent threw: ' + threw.message);
    S().entities = S().entities.filter((x) => x !== broken); const bi = g.machines.items.get(broken.id); if (bi) { g.machines.disposeObj(bi.obj); g.machines.root.remove(bi.obj); g.machines.items.delete(broken.id); }
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- text: controls, bench card, docs
  await T('vscan.the-controls-the-bench-card-and-the-chalkboard-tell-the-rule', async () => {
    const bad = []; const rows = CONTROLS.flatMap((grp) => grp.rows), E = rows.find((r) => r.codes && r.codes.includes('KeyE'));
    if (!E || !/Vehicle Scanner/.test(E.what) || !/takes it out/.test(E.what) || /[–—]/.test(E.what)) bad.push('the E row does not mention the scanner');
    fresh(UP); g.T = g.tune(); const r = recipes(g).find((x) => x.id === 'vscan'); for (const t of [r.desc, r.use]) if (!/The One/.test(t) || BAD.test(t) || /[–—]/.test(t)) bad.push('card text: ' + t);
    // the earth mover chalkboard and the bench cards tell the new rule instead of "they leave The One alone"
    const b = g.hall.boards.find((x) => /EARTH MOVERS/.test(x.title)); const txt = b ? [b.title, ...b.rows.map((q) => (Array.isArray(q) ? q.join(' ') : q)), b.foot].join('\n') : '';
    if (!/Vehicle Scanner/.test(txt) || /leave The One where it is/.test(txt) || b.overflow) bad.push('earth board: ' + txt);
    fresh({ ...UP, excavator: 1, dozer: 1, wheel: 1, truck: 1, borer: 1, beltSpeed: 6 }); g.T = g.tune();
    for (const [id, re] of [['excavator', /scoops The One/], ['dozer', /scoops The One/], ['wheel', /scoops The One/], ['truck', /Vehicle Scanner/], ['borer', /never eats The One/]]) {
      const c = recipes(g).find((x) => x.id === id); if (!c) { bad.push('no card ' + id); continue; }
      if (!re.test(c.use) || /leaves The One alone|does NOT check/i.test(c.use) || /[–—]/.test(c.use)) bad.push(`${id} card: ${c.use}`);
    }
    for (const id of ['excavator', 'dozer', 'wheel', 'truck', 'borer']) { const u = upgradeById(id); if (!u || /leaves The One alone|does NOT check/i.test(u.desc) || /[–—]/.test(u.desc)) bad.push('upgrade text ' + id); }
    return bad.length === 0 || bad.join(' || ');
  });
}
