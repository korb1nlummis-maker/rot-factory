// arch.*: giant arches, the truck-width supports (src/arches.js, the arch branch of src/loadtrace.js). Run: `await __selftest('arch.')`
import { makeKit, UP, ARCH, PORTAL } from './portal_lib.js';
import { ARCH_SPANS, ARCH_DEPTH, archKind, archRated, archReach, capacityOf, loadOn, BASE_LOAD, PRESS, parseArch } from '../loadtrace.js';
import { FRAME_TYPES } from '../upgrades.js';
import { recipes } from '../crafting.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, w, p, fresh, newWorld, craft, selectTool, plan, placeNow, aimPoint, toI, toJ, toK, cellX, cellZ, THREE } = ctx;
  const K = makeKit(ctx);
  const world = async (up = UP) => { await newWorld(); fresh(up); S().money = 1e12; g.surgeT = 1e9; };
  const press = (d) => 1 + d / PRESS;
  const carveClean = (i, k0, len, wd, ht, rc, lanes = 14) => {
    for (let t = 0; t < lanes; t++) {
      const k = k0 + t * (wd + 2 * rc + 6);
      for (let a = 0; a < len; a++) for (let b = 0; b < wd; b++) for (let j = 0; j < ht; j++) w().removeCell(i + a, j, k + b, false);
      let odd = 0; for (let a = -rc; a < len + rc; a++) for (let b = -rc; b < wd + rc; b++) for (let j = 0; j < 14; j++) { const inT = a >= 0 && a < len && b >= 0 && b < wd && j < ht, v = w().get(i + a, j, k + b); if (inT ? v : !v) odd++; }
      if (!odd) return k;
    }
    return null;
  };
  const arch = (span, mat, m, lo, extra = {}) => g.placeEntity('garch', { axis: 'x', gm: m, glo: lo, gj: 0, span, mat, ...extra }, { quiet: true });
  const supOf = (e) => w().supports.find((s) => s.id === e.id);

  // ---------------------------------------------------------------- the load model
  const calibrate = (span) => async () => {
    await world(); const bad = []; let row = 0;
    for (const [mat, f] of Object.entries(FRAME_TYPES)) {
      if (!isFinite(f.maxDepth)) continue;
      const rated = archRated(span, mat), r = archReach(span, mat), s = ARCH_SPANS[span], at = {};
      for (const mult of [0.8, 1.0, 1.2]) {
        // on a circle of radius d around the start (the pile presses by the distance from the start, not by x): a different bearing for every try
        // (a lane that is not clean is NOT slid sideways: that moves the arch off the circle and the pile presses harder there, so it read 105 to 120% at its rating in a world with old
        // workings near the first lane. The next bearing is tried instead.)
        const d = rated * mult, len = 2 * Math.ceil(r / 0.6) + 8, rc = Math.ceil(r / 0.6) + 2; let k = null, i = 0;
        for (let tries = 0; tries < 12 && k === null; tries++) {
          const ang = 0.08 + 0.1 * (row++ % 6) + 0.031 * tries; i = toI(d * Math.cos(ang)); const k0 = toK(d * Math.sin(ang));
          // inside 140 m the natural pile is lower than the 43 m the rating is defined under: build the full pile there
          if (rated < 140) for (let a = -rc; a < len + rc; a++) for (let b = 0; b < span + 2 * rc; b++) for (let j = 0; j < 72; j++) if (!w().get(i + a, j, k0 + b)) w().setCell(i + a, j, k0 + b, 2, 0);
          k = carveClean(i, k0 + (rated < 140 ? rc : 0), len, span, s.h, rc, 1);
        }
        if (k === null) { bad.push(`${mat}: no clean lane at ${Math.round(d)} m`); continue; }
        const e = arch(span, mat, i + (len >> 1) - 2, k), sup = supOf(e); at[mult] = loadOn(w(), sup) / sup.cap; K.gone(e);
      }
      if (!(at[1.0] > 0.93 && at[1.0] < 1.07)) bad.push(`${mat}: ${(at[1.0] * 100).toFixed(1)}% at its rating`);
      if (!(at[0.8] < 1)) bad.push(`${mat}: ${(at[0.8] * 100).toFixed(0)}% at 80% of its rating`);
      void 0;
      if (!(at[1.2] > 1)) bad.push(`${mat}: only ${(at[1.2] * 100).toFixed(0)}% at 120% of its rating`);
    }
    return bad.length === 0 || bad.join(' | ');
  };
  for (const span of [6, 8, 12]) await T(`arch.calibrated-100pct-at-rated-depth-all-tiers-span-${span}`, calibrate(span));

  await T('arch.wide-span-rated-shallower-than-frame-and-the-spec-examples-hold', async () => {
    const bad = [];
    for (const [mat, f] of Object.entries(FRAME_TYPES)) for (const span of [6, 8, 12]) {
      const rt = archRated(span, mat); if (!isFinite(f.maxDepth)) { if (isFinite(rt)) bad.push(`${mat} arch${span} is rated though the frame is unlimited`); continue; }
      if (!(rt < f.maxDepth)) bad.push(`${mat} arch${span}: ${rt} not shallower than the frame ${f.maxDepth}`);
      if (Math.abs(rt - f.maxDepth * ARCH_SPANS[span].derate) > 1e-9) bad.push(`${mat} arch${span}: not frame x derate`);
    }
    if (!(archRated(12, 'steel') < archRated(8, 'steel') && archRated(8, 'steel') < archRated(6, 'steel'))) bad.push('a wider span is not rated shallower');
    const near = (a, b) => Math.abs(a - b) <= b * 0.02;
    if (!near(archRated(8, 'steel'), 266)) bad.push('steel arch8 ' + archRated(8, 'steel')); if (!near(archRated(8, 'concrete'), 560)) bad.push('concrete arch8 ' + archRated(8, 'concrete'));
    if (!near(archRated(8, 'rebar'), 910)) bad.push('rebar arch8 ' + archRated(8, 'rebar')); if (!near(archRated(12, 'titan'), 990)) bad.push('titanium arch12 ' + archRated(12, 'titan'));
    // the capacity function answers for a kind string, and Event Horizon is unlimited
    if (capacityOf('arch8:horizon') !== Infinity) bad.push('horizon arch has a limit'); if (!(capacityOf('arch8:steel') > 0 && isFinite(capacityOf('arch8:steel')))) bad.push('no capacity for arch8:steel');
    if (parseArch('arch9:steel') || parseArch('arch8:nothing') || parseArch('arch8:__proto__') || parseArch('frame')) bad.push('parseArch took a bad kind');
    return bad.length === 0 || bad.join('; ');
  });

  await T('arch.clear-opening-is-span-minus-one-by-height-minus-one-and-the-ribs-keep-to-it', async () => {
    const want = { 6: [5, 4], 8: [7, 5], 12: [11, 7] }, bad = [];
    for (const span of [6, 8, 12]) {
      const s = ARCH_SPANS[span]; if (s.cw !== want[span][0] || s.ch !== want[span][1] || s.cw !== span - 1 || s.ch !== s.h - 1) bad.push(`span ${span} clear ${s.cw} x ${s.ch}`);
      const { pts, xc, Hs } = ARCH.ribPoints(span), inner = xc - ARCH.RIB / 2;
      if (inner + 1e-6 < (s.cw * 0.6) / 2) bad.push(`span ${span}: the ribs leave ${(inner * 2).toFixed(2)} m, the clear opening is ${(s.cw * 0.6).toFixed(2)} m`);
      // the underside of the crown stays above the clear height all across the clear width
      for (const [x, y] of pts) if (Math.abs(x) <= (s.cw * 0.6) / 2 && y - ARCH.RIB / 2 < s.ch * 0.6 - 1e-6) bad.push(`span ${span}: the crown dips to ${(y - ARCH.RIB / 2).toFixed(2)} m at x ${x.toFixed(2)}`);
      if (Math.abs(Hs - s.ch * 0.6) > 1e-9) bad.push('shoulder height');
    }
    return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- placing
  await T('arch.span-roof-cells-must-be-dug-and-it-never-digs', async () => {
    await world(); const st = K.site({ span: 8, dist: 200 }); const out = [];
    craft('garch:8:steel', 3); selectTool('garch:8:steel');
    // a narrow corridor (2 wide, 3 high) into the pile and you at its end looking at the wall: every window of an 8 x 6 x 4 section holds plush
    const lat = st.lo + 3; K.clearBox(st.i0 + 4, lat, 18, 2, 3);
    p().pos.set(cellX(st.i0 + 17), 0, cellZ(lat) + 0.3); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0; let pl = await plan();
    if (pl.ok || !/Dig this section out first: \d+ plush in the way/.test(pl.why || '')) out.push('a corridor wall: ' + JSON.stringify([pl.ok, pl.why]));
    // dig the whole section (a cube 8 wide, 6 high, 4 long) at the end of it and it is accepted
    K.clearBox(st.i0 + 19, st.lo, 4, 8, 6); p().pos.set(cellX(st.i0 + 17), 0, cellZ(lat) + 0.3); p().yaw = Math.PI / 2; pl = await plan();
    if (!pl.ok) out.push('a dug section was refused: ' + pl.why); else {
      const e = pl.ent; if (e.span !== 8 || e.clear.w !== 7 || e.clear.h !== 5 || e.w < 4.7 || e.h < 3.5) out.push('plan ent ' + JSON.stringify([e.span, e.clear, e.w, e.h]));
      const count = () => { let n = 0; for (let i = st.i0 + 2; i < st.i0 + 30; i++) for (let k = st.lo - 3; k < st.lo + 12; k++) for (let j = 0; j < 14; j++) if (w().get(i, j, k)) n++; return n; };
      const before = count(); if (placeNow() !== 1) out.push('not placed'); if (count() !== before) out.push(`placing it changed ${before - count()} plush`);
    }
    return out.length === 0 || out.join('; ');
  });

  await T('arch.is-a-real-support-with-the-kind-reach-and-capacity-the-load-model-reads', async () => {
    await world(); const st = K.site({ span: 8, dist: 200 }); K.clearBox(st.i0 - 12, st.lo, 4, 8, 6); const e = arch(8, 'steel', st.i0 - 12, st.lo);
    const s = supOf(e); if (!s) return 'not registered'; const out = [];
    if (s.kind !== 'arch8:steel') out.push('kind ' + s.kind); if (Math.abs(s.x - e.cx) > 1e-9 || Math.abs(s.z - e.cz) > 1e-9 || Math.abs(s.y - (e.y0 + e.h / 2)) > 1e-9) out.push('not centred on the arch');
    if (s.cap !== capacityOf('arch8:steel')) out.push('cap'); if (Math.abs(s.r - archReach(8, 'steel')) > 1e-9) out.push('reach ' + s.r); if (s.b !== FRAME_TYPES.steel.bonus) out.push('anchor bonus ' + s.b);
    // every roof cell over the section counts as supported (the tunnel rule reads this sphere)
    let bad = 0; for (let a = 0; a < 4; a++) for (let l = 0; l < 8; l++) if (!(w().supportBonus(cellX(st.i0 - 12 + a), 3.5 * 0.6 + 0.3, cellZ(st.lo + l)) > 0)) bad++;
    if (bad) out.push(bad + ' roof cells over the arch are not supported');
    return out.length === 0 || out.join('; ');
  });

  await T('arch.a-frame-cube-and-an-arch-cannot-share-cells-and-two-arches-cannot-overlap', async () => {
    await world(); const st = K.site({ span: 6, dist: 160 }); const out = [];
    K.clearBox(st.i0 - 30, st.lo - 2, 40, 12, 8); const a = arch(6, 'steel', st.i0 - 20, st.lo);
    // a cube set inside the arch is refused by the frame planner
    const fe = g.machines.frameEnt('x', 'timber', st.i0 - 20, st.lo, 0); const hit = g.machines.blockTaken('x', st.i0 - 20, st.lo, 0); if (!hit || hit.id !== a.id) out.push('blockTaken did not see the arch');
    craft('frame:timber', 2); selectTool('frame:timber'); aimPoint(cellX(st.i0 - 19), 0.3, cellZ(st.lo + 2), 2.2); const pl = await plan();
    if (pl.ok && pl.ent.gm >= a.gm && pl.ent.gm < a.gm + 4 && pl.ent.glo < a.glo + 6 && pl.ent.glo + 4 > a.glo) out.push('a frame cube was planned inside the arch'); void fe;
    // and the other way round
    const f = g.machines.frameEnt('x', 'timber', st.i0 - 12, st.lo, 0); delete f.clear; const fr = { id: g.nextId(), type: 'frame', ...f }; S().entities.push(fr); g.addEntity(fr);
    const L = ARCH.layout(g, 'x', st.i0 - 12, st.lo, 0, 6, 'steel'); if (L.ok || !/frame/i.test(L.why)) out.push('an arch over a frame: ' + JSON.stringify([L.ok, L.why]));
    const L2 = ARCH.layout(g, 'x', a.gm + 2, a.glo, 0, 6, 'steel'); if (L2.ok || !/overlap/i.test(L2.why)) out.push('two arches overlap: ' + JSON.stringify([L2.ok, L2.why]));
    const L3 = ARCH.layout(g, 'x', a.gm + 4, a.glo, 0, 6, 'steel'); if (!L3.ok) out.push('the next module in line was refused: ' + L3.why);
    return out.length === 0 || out.join('; ');
  });

  await T('arch.snaps-a-whole-module-along-the-run-and-the-hint-shows-the-load', async () => {
    await world(); const st = K.site({ span: 8, dist: 160 }); const out = [];
    K.clearBox(st.i0 - 30, st.lo, 24, 8, 6); craft('garch:8:steel', 4); selectTool('garch:8:steel');
    aimPoint(cellX(st.i0 - 24), 0.2, cellZ(st.lo + 3), 2.4); let pl = await plan(); if (!pl.ok) return pl.why; if (placeNow() !== 1) return 'not placed'; const a = S().entities.find((e) => e.type === 'garch');
    // aim at the cells just past its far end: the next arch snaps to gm + 4 across the same section
    aimPoint(cellX(a.gm + 5), 0.2, cellZ(a.glo + 3), 2.0); p().yaw = Math.PI / 2; pl = await plan(); if (!pl.ok) return 'next in line: ' + pl.why;
    if (pl.ent.gm !== a.gm + 4 || pl.ent.glo !== a.glo || pl.ent.snap !== 'next in line') out.push(`snapped to ${pl.ent.gm},${pl.ent.glo} ${pl.ent.snap}`);
    if (!/% of its limit here/.test(pl.hintText || '')) out.push('the preview does not show the load: ' + pl.hintText);
    return out.length === 0 || out.join('; ');
  });

  await T('arch.one-that-would-buckle-is-refused-with-the-load-and-a-stronger-one-is-offered', async () => {
    await world(); const st = K.site({ span: 6, dist: 700 }); const out = [];
    // a corridor out of the room behind the mouth and a 6 x 5 x 4 section at the end of it, deep in the pile at 700 m: a timber arch (rated 128 m) cannot carry that
    const lat = st.lo + 2; K.clearBox(st.i0 + 2, lat, 18, 2, 3); K.clearBox(st.i0 + 19, st.lo, 4, 6, 5);
    craft('garch:6:timber', 1); selectTool('garch:6:timber'); p().pos.set(cellX(st.i0 + 17), 0, cellZ(lat) + 0.3); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0; const pl = await plan();
    if (pl.ok) out.push('a timber arch was allowed at 700 m: ' + JSON.stringify(pl.ent && pl.ent.ratio));
    else if (!/would buckle here: \d+% load at \d+ m deep/.test(pl.why)) out.push('refusal text: ' + pl.why);
    // the host re-checks a guest's plan the same way
    const why = ARCH.conflict(g, { axis: 'x', gm: st.i0 + 19, glo: st.lo, gj: 0 }, { id: 'garch:6:timber' }); if (!why || !/buckle/.test(why)) out.push('the host accepted the overloaded arch: ' + why);
    // titanium (rated 1,530 m as a 6 wide arch) is fine here
    if (ARCH.conflict(g, { axis: 'x', gm: st.i0 + 19, glo: st.lo, gj: 0 }, { id: 'garch:6:titan' }) !== null) out.push('titanium refused at 700 m');
    return out.length === 0 || out.join('; ');
  });

  // ---------------------------------------------------------------- the load shares and buckling
  await T('arch.buckles-and-sheds-load-onto-neighbors-and-the-load-queue-drops-none', async () => {
    await world(); const out = []; const names = []; const keep = g.supportFailFx.bind(g); g.supportFailFx = (x, y, z, name) => { names.push(name); return keep(x, y, z, name); };
    try {
      // three steel arch6 in a row, 12 cells apart, at 500 m: rated 323 m alone, so each is over its limit, and they share cells
      const len = 40, i = toI(500), k = carveClean(i, toK(60), len, 6, 5, 6); if (k === null) return 'no clean lane';
      const ents = [0, 1, 2].map((n) => arch(6, 'steel', i + 4 + n * 12, k)); g.time += 5; g.loadQ = new Set(); for (const e of ents) g.queueLoad(e.cx, 1, e.cz);
      if (g.loadQ.size !== 3) out.push('queue holds ' + g.loadQ.size); const before = ents.map((e) => loadOn(w(), supOf(e)) / supOf(e).cap);
      if (!(before.every((r) => r > 1))) out.push('setup: ' + before.map((r) => r.toFixed(2)));
      const pump = (n, d = 0.4) => { for (let q = 0; q < n; q++) { g.time += d; g._loadT = 0; g.updateLoads(d); } };
      pump(8); pump(30);
      const left = ents.filter((e) => supOf(e)).length; const unweighed = w().supports.filter((s) => s.load === undefined && s.kind && s.kind.startsWith('arch')).length;
      if (left !== 0 || g.loadQ.size !== 0) out.push(`${left} of 3 overloaded arches still stand, ${unweighed} never weighed, queue ${g.loadQ.size}`);
      if (!names.some((n) => /Steel Haul Arch/.test(n))) out.push('failure text names ' + JSON.stringify(names.slice(0, 3)));
      // a lone neighbour carries more when the arch beside it goes
      const a = arch(6, 'concrete', i + 4, k), b = arch(6, 'concrete', i + 12, k); const ra = loadOn(w(), supOf(a)) / supOf(a).cap; K.gone(b); const ra2 = loadOn(w(), supOf(a)) / supOf(a).cap; if (!(ra2 > ra)) out.push(`the load did not move onto the neighbour: ${ra.toFixed(3)} then ${ra2.toFixed(3)}`);
    } finally { g.supportFailFx = keep; }
    return out.length === 0 || out.join('; ');
  });

  await T('arch.hammer-gives-the-arch-back-and-puts-the-roof-under-the-tunnel-rule-again', async () => {
    await world(); const st = K.site({ span: 6, dist: 200 }); K.clearBox(st.i0 - 12, st.lo, 4, 6, 5); const e = arch(6, 'steel', st.i0 - 12, st.lo); S().items = {};
    w().stabQueue.length = 0; g.loadQ = new Set(); g.doDecon({ kind: 'mach', id: e.id });
    const out = []; if (S().items['garch:6:steel'] !== 1) out.push('item ' + JSON.stringify(S().items)); if (supOf(e)) out.push('support left'); if (g.machines.items.has(e.id)) out.push('mesh left'); if (S().entities.some((q) => q.id === e.id)) out.push('ent left');
    if (!w().stabQueue.length) out.push('the roof was not queued to be checked again');
    return out.length === 0 || out.join('; ');
  });

  await T('arch.hammer-and-aim-pick-a-rib-a-pillar-or-the-hollow-inside', async () => {
    await world(); const st = K.site({ span: 8, dist: 200 }); K.clearBox(st.i0 - 20, st.lo, 8, 8, 6); const e = arch(8, 'steel', st.i0 - 20, st.lo); const eye = new THREE.Vector3(), dir = new THREE.Vector3(); const out = [];
    // from outside, looking at the side pillar
    p().pos.set(e.cx, 0, e.cz + 4.5); p().vel.set(0, 0, 0); p().yaw = Math.PI; p().pitch = 0.0; g.renderer.camera.position.copy(p().eyePos(eye));
    let ref = g.hammerTarget(); if (!ref || ref.id !== e.id) out.push('outside, at a pillar: ' + JSON.stringify(ref));
    // from inside, looking along the tunnel at its ribs
    p().pos.set(e.cx - 1.0, 0, e.cz); p().yaw = Math.PI / 2; g.renderer.camera.position.copy(p().eyePos(eye)); ref = g.hammerTarget(); if (!ref || ref.id !== e.id) out.push('inside, looking along it: ' + JSON.stringify(ref));
    const info = infoFor(g, ref || { kind: 'mach', id: e.id }); if (!info || !/STEEL WIDE ARCH/.test(info.title) || !/Carries \d+%/.test(info.lines.join(' '))) out.push('readout ' + JSON.stringify(info && info.title));
    p().pos.set(e.cx, 0, e.cz + 40); p().yaw = 0; g.renderer.camera.position.copy(p().eyePos(eye)); ref = g.hammerTarget(); if (ref && ref.id === e.id) out.push('picked it from 40 m away');
    void dir; return out.length === 0 || out.join('; ');
  });

  await T('arch.carries-a-support-fan-like-a-frame', async () => {
    await world(); const st = K.site({ span: 8, dist: 200 }); K.clearBox(st.i0 - 20, st.lo, 8, 8, 6); const e = arch(8, 'steel', st.i0 - 20, st.lo);
    craft('mfan', 1); selectTool('mfan'); aimPoint(e.cx, e.y0 + e.h - 0.3, e.cz, 3.0); p().yaw = Math.PI / 2; const pl = await plan(); if (!pl.ok) return 'no fan plan: ' + pl.why;
    if (pl.ent.frameId !== e.id || Math.abs(pl.ent.px - e.cx) > 1e-6) return 'the fan is not clamped under the arch';
    if (placeNow() !== 1) return 'not placed'; S().items = {}; g.doDecon({ kind: 'mach', id: e.id });
    return ([...g.logi.tiles.values()].every((t) => !t.mounted) && S().items.mfan === 1) || 'the fan stayed or was lost with the arch';
  });

  // ---------------------------------------------------------------- unlocks, bench, saves
  await T('arch.unlock-chain-prices-and-bench-rows', async () => {
    fresh({ timber: 1, steel: 1, concrete: 1 }); S().money = 1e12; const bad = [];
    if (recipes(g).some((r) => r.kind === 'garch')) bad.push('arch rows without Wide Arches');
    fresh({ timber: 1, steel: 1, concrete: 1, archWide: 1 }); let rows = recipes(g).filter((r) => r.kind === 'garch');
    if (rows.length !== 6 || rows.some((r) => r.id.includes(':12:'))) bad.push('Wide Arches gave ' + rows.map((r) => r.id).join(','));
    fresh({ timber: 1, steel: 1, concrete: 1, archWide: 1, archHall: 1 }); rows = recipes(g).filter((r) => r.kind === 'garch'); if (rows.length !== 6) bad.push('Cathedral Arches without a Haul Truck gave ' + rows.length + ' rows');
    fresh({ timber: 1, steel: 1, concrete: 1, archWide: 1, archHall: 1, truck: 1 }); rows = recipes(g).filter((r) => r.kind === 'garch'); if (rows.length !== 9) bad.push('Cathedral Arches and a Haul Truck gave ' + rows.length + ' rows');
    const c8 = rows.find((r) => r.id === 'garch:8:concrete'), s6 = rows.find((r) => r.id === 'garch:6:steel'), c12 = rows.find((r) => r.id === 'garch:12:concrete');
    if (c8.price !== 780 * 9 * 3 || s6.price !== 210 * 4 * 3 || c12.price !== 780 * 22 * 3) bad.push(`prices ${c8.price} ${s6.price} ${c12.price}`);
    const up = (id) => ctx.UPGRADES.find((u) => u.id === id);
    if (up('archWide').cost[0] !== 2.5e6 || up('archWide').req.id !== 'steel' || up('archHall').cost[0] !== 60e6 || up('archHall').req.id !== 'concrete' || up('portal').cost[0] < 10e6) bad.push('upgrade ids or prices');
    if (!(c8.use && c8.desc && c8.statusFn)) bad.push('card text missing'); if (!/Rated to 560 m/.test(c8.desc)) bad.push('card does not say the rating: ' + c8.desc.slice(0, 200));
    return bad.length === 0 || bad.join('; ');
  });

  await T('arch.crafting-uses-stock-first-at-the-frame-discount-and-charges-the-rest', async () => {
    fresh({ ...UP }); S().money = 1e9; S().mats = {}; const r = recipes(g).find((x) => x.id === 'garch:8:steel'), full = r.price;
    craft('garch:8:steel'); const paid = 1e9 - S().money; if (paid !== full) return `paid ${paid} not the bench price ${full}`;
    S().money = 1e9; S().mats = { steel: r.matN }; craft('garch:8:steel'); const withStock = 1e9 - S().money; if (withStock !== 0 || (S().mats.steel || 0) !== 0) return `with the stock it paid ${withStock}, left ${S().mats.steel}`;
    S().money = 1e9; S().mats = { steel: Math.round(r.matN / 2) }; craft('garch:8:steel'); const half = 1e9 - S().money; if (!(half > 0 && half < full)) return `half stock paid ${half} of ${full}`;
    // the stock discount is the frame's: stock bought at the bench (70% of a unit) comes to 70% of the bench price
    const unit = Math.max(1, Math.round(210 / 4)), cost = Math.round(r.matN * unit * 0.7); return (Math.abs(cost / full - 0.7) < 0.05) || `stock for one arch costs ${cost}, bench price ${full}`;
  });

  await T('arch.survives-save-and-load-and-an-old-entity-without-fields', async () => {
    await world(); const st = K.site({ span: 12, dist: 200 }); K.clearBox(st.i0 - 20, st.lo - 2, 8, 12, 8); const e = arch(12, 'titan', st.i0 - 20, st.lo); const raw = JSON.parse(JSON.stringify(S().entities));
    K.gone(e); w().supports = []; for (const x of raw) { S().entities.push(x); g.addEntity(x); } S().entities = S().entities.filter((q, n, a) => a.findIndex((z) => z.id === q.id) === n);
    const e2 = S().entities.find((q) => q.id === e.id), s = e2 && supOf(e2); const out = [];
    if (!s || s.kind !== 'arch12:titan') out.push('support lost on reload'); if (!e2 || e2.clear.w !== 11 || e2.clear.h !== 7) out.push('derived fields missing');
    if (!g.machines.items.get(e.id)) out.push('no mesh');
    // the saved entity holds only the plain fields and no live numbers
    const keys = Object.keys(raw.find((q) => q.id === e.id)); for (const bad of ['_head', 'rig']) if (keys.includes(bad)) out.push('saved ' + bad);
    return out.length === 0 || out.join('; ');
  });

  await T('arch.garbage-in-an-entity-never-breaks-the-world', async () => {
    await world(); const out = [];
    for (const f of [{ span: 7, mat: 'steel' }, { span: 8, mat: 'banana' }, { span: 8, mat: 'steel', gm: 'x' }, { span: 8, mat: '__proto__', gm: 1, glo: 1, gj: 0 }, { span: 8, mat: 'steel', gm: 1, glo: 1, gj: 0.5 }, { span: 8, mat: 'steel', gm: 1e9, glo: 1, gj: 0 }]) {
      try { const e = { id: g.nextId(), type: 'garch', axis: 'x', gm: 1, glo: 1, gj: 0, ...f }; S().entities.push(e); g.addEntity(e); K.run(0.2); } catch (err) { out.push(JSON.stringify(f) + ': ' + err.message); }
    }
    const L = ARCH.layout(g, 'q', 1, 1, 0, 8, 'steel'); if (L.ok) out.push('a bad axis was laid out');
    return out.length === 0 || out.join('; ');
  });
}
