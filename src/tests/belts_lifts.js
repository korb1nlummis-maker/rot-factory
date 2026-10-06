// belts.* (wave 1A): lifts. They carry plush up to 24 cells (down as well), reserve their shaft, need Lift Frames above 8 cells, cost a piece per cell
// and give every piece back to the hammer.
import { makeBeltKit, UP_ALL, UP_BASE } from './belts_lib.js';
import { framesNeeded, TIER_MUL, TIER_KW, TIER_NAMES, rateOf } from '../beltdata.js';
import { frameProblem, frameRating, FRAME_RATING, FRAME_RATING_JACK } from '../beltparts.js';
import { infoFor } from '../info.js';
import { recipes } from '../crafting.js';
import { C, idx as ctxIdx } from '../config.js';

export default async function (ctx) {
  const { T: T0, g, S, w, p, L, tiles, toI, toK, cellX, cellZ } = ctx;
  const B = makeBeltKit(ctx), K = B.K;
  const T = B.T; void T0;
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const at = () => ({ i: toI(-8), k: toK(0.3) });
  const holdKeys = (code) => g.onKey({ code, repeat: false, preventDefault() {} }, true);

  // a lift of height h (negative = down) with a two tile feeder behind it, a belt and a vault where it lets go, and the frames it needs
  const rig = (h, o = {}) => {
    const { tier = 0, frames = true } = o, ht = Math.abs(h), dn = h < 0, { i, k } = at(), j0 = dn ? ht : 0, j1 = dn ? 0 : ht;
    const feeder = B.lay(tier, 2, i - 2, k, 0, j0);
    const lift = g.placeEntity('belt', { i, j: j0, k, dir: 0, rise: 0, lift: { h }, items: [], ...(tier ? { tier } : {}) }, { quiet: true, rebuild: false });
    if (!dn) B.floorAt(i + 1, j1 - 1, k);
    const top = B.lay(tier, 1, i + 1, k, 0, j1)[0], v = B.vaultAt(i + 2, k, j1), fr = [];
    if (frames) for (let n = 0; n < framesNeeded(ht); n++) fr.push(B.frameAt(i, k + (n % 2 ? -1 : 1) * (1 + Math.floor(n / 2))));
    L().dirty = true;
    return { lift, feeder, top, v, fr, i, k };
  };
  // seconds until one plush put on the first feeder tile reaches the vault
  const trip = (r, cap = 60) => {
    r.feeder[0].items = [{ sp: B.sp, vr: 0, t: 0 }]; let s = 0;
    while (s < cap && r.v.stored.length < 1) { B.step(0.02); s += 0.02; }
    return r.v.stored.length ? s : -1;
  };

  await T('belts.lift-carries-plush-up-24-cells', async () => {
    B.setup(UP_BASE); const bad = []; const r = rig(24);
    // five plush ride up together, in order
    const sps = [2, 7, 12, 20, 33];
    r.feeder[0].items = [{ sp: sps[0], vr: 0, t: 0.9 }, { sp: sps[1], vr: 0, t: 0.56 }, { sp: sps[2], vr: 0, t: 0.22 }];
    r.feeder[1].items = [{ sp: sps[3], vr: 0, t: 0.9 }, { sp: sps[4], vr: 0, t: 0.56 }]; r.feeder[1].items.sort((a, b) => b.t - a.t);
    const ys = []; for (let s = 0; s < 60 * 18 && r.v.stored.length < 5; s++) { B.step(1 / 60); if (s % 30 === 0) L().forEachItem((it, x, y) => { if (it.sp === sps[3]) ys.push(y); }); }
    if (r.v.stored.length !== 5) bad.push(`only ${r.v.stored.length} of 5 reached the top`);
    const order = r.v.stored.map((x) => x.sp).join(); if (order !== [sps[3], sps[4], sps[0], sps[1], sps[2]].join()) bad.push('order changed: ' + order);
    const top = 24 * C + 0.2; if (Math.max(...ys) < top * 0.9 || Math.min(...ys) > 0.5) bad.push(`heights seen ${Math.min(...ys).toFixed(2)} to ${Math.max(...ys).toFixed(2)}, the top is ${top.toFixed(2)}`);
    for (let q = 1; q < ys.length; q++) if (ys[q] < ys[q - 1] - 1e-6) { bad.push('a plush went down on the way up'); break; }
    // one plush alone: feeder 2 tiles + the shaft (24 cells plus half a cell either side) + the top tile, all at 1.6 tiles per second
    B.setup(UP_BASE); const r2 = rig(24), t = trip(r2), want = (2 + 25 + 1) / 1.6;
    if (!near(t, want, want * 0.05)) bad.push(`one plush took ${t.toFixed(1)} s, wanted ${want.toFixed(1)}`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.lift-runs-at-its-marks-speed', async () => {
    const bad = [];
    for (const tier of [0, 2, 5]) {
      B.setup(UP_BASE); const r = rig(6, { tier }), t = trip(r), want = (2 + 7 + 1) / (1.6 * TIER_MUL[tier]);
      if (!near(t, want, want * 0.06 + 0.04)) bad.push(`${TIER_NAMES[tier]} took ${t.toFixed(2)} s, wanted ${want.toFixed(2)}`);
    }
    // a dense stream up a lift is its mark's printed rate (the lift is the slowest part only when it is the only part of its mark: everything here is Mk4)
    B.setup(UP_BASE); const r = rig(6, { tier: 3 }), m = B.measure([...r.feeder, r.lift, r.top], r.v);
    if (m.count < m.total) bad.push(`a dense stream delivered ${m.count} of ${m.total}`);
    else { const rate = m.tailRate(15), want = rateOf(g.T, 3); if (Math.abs(rate - want) / want > 0.08) bad.push(`stream rate ${rate.toFixed(0)}, printed ${want.toFixed(0)}`); }
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.lift-goes-down-too', async () => {
    B.setup(UP_BASE); const bad = []; const r = rig(-12), t = trip(r), want = (2 + 13 + 1) / 1.6;
    if (!near(t, want, want * 0.05)) bad.push(`down trip ${t.toFixed(1)} s, wanted ${want.toFixed(1)}`);
    const { i, k } = at();
    // the shaft hangs below the tile: 12 cells, none of them above it
    let below = 0, above = 0; for (let q = 1; q <= 14; q++) { if (L().cols.has(ctxIdx(i, 12 - q, k))) below++; if (L().cols.has(ctxIdx(i, 12 + q, k))) above++; }
    if (below !== 12 || above !== 0) bad.push(`shaft cells below ${below} (12), above ${above} (0)`);
    const info = infoFor(g, { kind: 'tile', id: r.lift.id }); if (!info || !/DOWN/.test(info.title) || !/down 12 cells/.test(info.lines.join(' '))) bad.push('readout: ' + (info && info.title + ' ' + info.lines.join(' | ')));
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.lift-reserves-column', async () => {
    B.setup(UP_ALL); const bad = []; const { i, k } = at(), before = new Set(w().reserved);
    const lift = g.placeEntity('belt', { i, j: 0, k, dir: 0, rise: 0, lift: { h: 6 }, items: [] }, { quiet: true, rebuild: false });
    const cells = [1, 2, 3, 4, 5, 6].map((q) => ctxIdx(i, q, k));
    if (!cells.every((c) => w().reserved.has(c) && L().cols.get(c) === lift)) bad.push('shaft cells are not all reserved');
    if (w().reserved.size !== before.size + 1 + 6) bad.push(`reserved grew by ${w().reserved.size - before.size}, wanted 7`);
    for (const j of [1, 3, 6]) if (L().canPlace(i, j, k) !== 'Occupied') bad.push(`a belt may be set in the shaft at height ${j}: ${L().canPlace(i, j, k)}`);
    if (L().canPlace(i, 7, k) !== 'Needs a floor') bad.push('the cell above the shaft should be ordinary: ' + L().canPlace(i, 7, k));
    // the hammer finds it anywhere up the shaft
    const eye = { x: cellX(i) - 1.5, y: 3 * C + 0.3, z: cellZ(k) }; const hit = L().pick(eye, { x: 1, y: 0, z: 0 }, 3); if (hit !== lift) bad.push('pick missed the shaft');
    g.doDecon({ kind: 'tile', id: lift.id });
    if (L().cols.size !== 0 || w().reserved.size !== before.size || [...before].some((c) => !w().reserved.has(c))) bad.push(`after the hammer: ${L().cols.size} shaft cells, reserved ${w().reserved.size} vs ${before.size}`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.lift-over-8-cells-needs-frames-or-stands-still', async () => {
    B.setup(UP_BASE); const bad = []; const r = rig(12, { frames: false }), { i, k } = at();
    if (trip(r, 40) >= 0) bad.push('an unsupported 12 cell lift carried plush');
    const lit = infoFor(g, { kind: 'tile', id: r.lift.id }); if (!lit || !/UNSUPPORTED/.test(lit.title) || !/needs 1 Lift Frame/.test(lit.lines.join(' '))) bad.push('readout: ' + (lit && lit.title));
    const lamp = L().objs.get(r.lift.id).userData.lamp; if (!(lamp.material.color.r > 1 && lamp.material.color.g < 1)) bad.push('lamp is not red');
    B.frameAt(i + 5, k);   // too far to count
    L().update(0.02); if (L().liftSupport(r.lift).ok) bad.push('a frame 3 m away held the lift');
    B.frameAt(i, k + 1); B.step(0.02);
    if (!L().liftSupport(r.lift).ok) bad.push('a frame beside it did not hold the lift');
    const t = trip(r); if (t < 0) bad.push('the held lift still did not move'); const ok = infoFor(g, { kind: 'tile', id: r.lift.id }); if (/UNSUPPORTED/.test(ok.title) || !/Held steady by 1 of 1/.test(ok.lines.join(' '))) bad.push('supported readout: ' + ok.title + ' ' + ok.lines[1]);
    // 8 cells need none, 17 need two
    if (framesNeeded(8) !== 0 || framesNeeded(9) !== 1 || framesNeeded(16) !== 1 || framesNeeded(17) !== 2 || framesNeeded(24) !== 2) bad.push('framesNeeded 8/9/16/17/24: ' + [8, 9, 16, 17, 24].map(framesNeeded));
    B.setup(UP_BASE); const r2 = rig(8, { frames: false }); if (trip(r2, 40) < 0) bad.push('an 8 cell lift needed a frame');
    B.setup(UP_BASE); const r3 = rig(20, { frames: false }); B.frameAt(at().i, at().k + 1); B.step(0.02); if (L().liftSupport(r3.lift).ok) bad.push('one frame held a 20 cell lift'); B.frameAt(at().i, at().k - 1); B.step(0.02); if (!L().liftSupport(r3.lift).ok) bad.push('two frames did not hold a 20 cell lift');
    // a frame placed through the tool needs a floor and respects the depth rating
    B.setup(UP_ALL); const placed = await K.put('liftframe', { x: -6.6, z: 2.4 }); if (!placed.ok) bad.push('could not set a Lift Frame: ' + placed.why); else if (!g.machines.items.has(placed.ent.id) || placed.ent.type !== 'liftframe') bad.push('no frame in the machines map');
    else { const f = placed.ent; g.doDecon({ kind: 'mach', id: f.id }); if (S().items.liftframe !== 1 || g.machines.items.has(f.id)) bad.push('the hammer did not take the frame down and give it back'); }
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.lift-frame-is-rated-like-a-strut', async () => {
    B.setup({ ...UP_ALL, jacks: 0 }); const bad = [];
    if (frameRating({}) !== FRAME_RATING || frameRating({ jacks: true }) !== FRAME_RATING_JACK) bad.push('rating table');
    // a floor cell deeper than the strut rating (the open bay is within it)
    const x = -140, z = 0.3, i = toI(x), k = toK(z), orig = [w().get(i, 0, k), 0];
    const sp = w().get(i, 0, k); if (sp) w().removeCell(i, 0, k, false);
    try {
      const why = frameProblem(g, { i, j: 0, k }); if (!/Too deep for a lift frame: rated 110 m/.test(why || '')) bad.push('at 140 m with no jacks: ' + why);
      S().up.jacks = 1; g.T = g.tune(); const why2 = frameProblem(g, { i, j: 0, k }); if (why2) bad.push('with Hydraulic Jacks (rated 320 m): ' + why2);
    } finally { if (sp) w().setCell(i, 0, k, sp, 0); }
    void orig;
    const ok = frameProblem(g, { i: toI(-6), j: 0, k: toK(5) }); if (ok) bad.push('a frame in the bay: ' + ok);
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.lift-tool-takes-one-piece-per-cell-and-the-hammer-gives-them-back', async () => {
    B.setup(UP_ALL); const bad = []; g.liftH = 6; S().items.lift = 8; g.rebuildTools();
    const r = await K.put('lift', { x: -6.6, z: 1.2, dir: 0 }); if (!r.ok) return 'could not place the lift: ' + r.why;
    const t = L().byId.get(r.ent.id);
    if (!t || t.type !== 'belt' || !t.lift || t.lift.h !== 6 || t.rise !== 0) bad.push('the tile: ' + JSON.stringify(t && { type: t.type, lift: t.lift }));
    if (r.consumed !== 6 || S().items.lift !== 2) bad.push(`a 6 cell lift took ${r.consumed} pieces, ${S().items.lift} left of 8`);
    if (!/lift up, 6 cells/.test(r.hint)) bad.push('hint: ' + String(r.hint).slice(0, 100));
    g.doDecon({ kind: 'tile', id: t.id }); if (S().items.lift !== 8) bad.push('the hammer gave back ' + (S().items.lift - 2) + ' pieces, wanted 6');
    if (L().tiles.size !== 0 && [...L().tiles.values()].some((x) => x.lift)) bad.push('the lift is still there');
    // fewer pieces than cells: refused, nothing taken
    S().items.lift = 3; g.rebuildTools(); const r2 = await K.put('lift', { x: -6.6, z: 1.2, dir: 0 });
    if (r2.ok || !/takes 6 lift pieces/.test(r2.why || '') || S().items.lift !== 3) bad.push('with 3 pieces: ' + JSON.stringify({ ok: r2.ok, why: r2.why, have: S().items.lift }));
    // down: R flips, the shaft goes below the tile (needs a raised floor to hang from: refused at ground level)
    holdKeys('KeyR'); // lift in hand: R flips it
    g.liftH = 6; S().items.lift = 8; g.rebuildTools(); K.equip('lift'); g.liftDown = true; const r3 = await K.put('lift', { x: -6.6, z: 1.2, dir: 0 });
    if (r3.ok) bad.push('a down lift at ground level went through the floor'); else if (!/through the floor/.test(r3.why || '')) bad.push('down at ground level: ' + r3.why);
    g.liftDown = false;
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.lift-height-keys-and-limits', async () => {
    B.setup(UP_ALL); const bad = []; S().items.lift = 30; g.rebuildTools(); K.equip('lift'); g.liftH = undefined;
    holdKeys('Period'); if (g.liftH !== 5) bad.push('Period from the default 4 gave ' + g.liftH);
    for (let q = 0; q < 10; q++) holdKeys('Comma'); if (g.liftH !== 2) bad.push('Comma stops at ' + g.liftH + ', not 2');
    for (let q = 0; q < 40; q++) holdKeys('Period'); if (g.liftH !== 24) bad.push('Period stops at ' + g.liftH + ', not 24');
    const before = g.liftDown; holdKeys('KeyR'); if (g.liftDown === before) bad.push('R did not flip the lift'); holdKeys('KeyR'); if (g.liftDown !== before) bad.push('R twice did not come back');
    // with a belt in hand the same keys are the planner's, not the lift's
    S().items.belt = 5; g.rebuildTools(); K.equip('belt'); const h0 = g.liftH; holdKeys('Period'); if (g.liftH !== h0) bad.push('Period moved the lift height with a belt in hand'); if (!g.bplan || !g.bplan.on) bad.push('Period did not switch the planner on'); holdKeys('Period'); if (g.bplan.on) bad.push('Period twice left the planner on');
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.lift-draws-power-per-cell-of-height', async () => {
    B.setup(UP_ALL); const { i, k } = at();
    g.placeEntity('pole', { i: i + 2, j: 0, k: k + 2, dir: 0 }, { quiet: true, rebuild: false });
    g.placeEntity('belt', { i, j: 0, k, dir: 0, rise: 0, lift: { h: 10 }, tier: 2, items: [] }, { quiet: true, rebuild: false });
    g.placeEntity('belt', { i: i - 1, j: 0, k: k - 3, dir: 0, rise: 0, lift: { h: -4 }, items: [] }, { quiet: true, rebuild: false });   // a down lift needs the floor under its bottom: not checked here
    g.power.recompute(); const net = g.power.nets.find((n) => n.nodes.some((x) => x.type === 'pole'));
    const want = TIER_KW[2] * 10 + TIER_KW[0] * 4; return (net && near(net.demand, want, 1e-6)) || `grid demand ${net && net.demand}, wanted ${want}`;
  });

  await T('belts.lift-bench-rows-price-a-piece-per-cell', async () => {
    B.setup(UP_ALL); const bad = []; const r = recipes(g).find((x) => x.id === 'lift:3');
    if (!r || r.price !== 2 * 300 * 3) bad.push('Mk4 lift piece ' + (r && r.price));
    S().money = 1e9; const m0 = S().money; g.craftItem('lift:3', 12); if (S().items['lift:3'] !== 12 || m0 - S().money !== 12 * 1800) bad.push('crafting 12 Mk4 lift pieces cost ' + (m0 - S().money));
    const ids = recipes(g).map((x) => x.id).filter((id) => /^lift/.test(id)); if (ids.join() !== 'lift,lift:1,lift:2,lift:3,lift:4,lift:5,liftframe') bad.push('lift rows ' + ids.join());
    if (!/Lift Frames beside it/.test(recipes(g).find((x) => x.id === 'lift').desc)) bad.push('lift description does not mention frames');
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.lift-cleanup', async () => { B.cleanup(); return true; });
}
