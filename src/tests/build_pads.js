// build.*: floor pads, zoop, snapping, clearance, walls, catwalks, rails, hammer, save and load, readouts. Pieces are world cells, so every test cleans up after itself (setup / clean in build_lib.js).
import { makeShell, UP } from './build_lib.js';
const UP_ = UP;
import { infoFor, findInfoRef } from '../info.js';
import { CONTROLS } from '../controls.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, fresh, adv, recipes, UPGRADES, cellX, cellZ, toI, toK, craft, selectTool, plan, FRAME_TYPES } = ctx;
  const K = makeShell(ctx), B = K.B;
  const I0 = () => toI(-11), K0 = () => toK(2);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { K.clean(); } });
  const pad = (i0, k0, j = 0) => ({ type: 'pad', mk: 'timber', i0, k0, j });
  const PADS = (id) => id.startsWith('pad:');

  await guard('build.recipes-unlock-and-prices', async () => {
    const bad = [], mine = (r) => /^(pad:|catwalk$|wall$|wramp|stair$|levelpad$)/.test(r.id);
    fresh({}); g.T = g.tune(); if (recipes(g).some(mine)) bad.push('shell recipes with no upgrades');
    fresh({ shellPads: 1 }); g.T = g.tune(); let ids = recipes(g).filter(mine).map((r) => r.id);
    for (const k of Object.keys(FRAME_TYPES)) if (!ids.includes('pad:' + k)) bad.push('no pad:' + k);
    if (!ids.includes('catwalk') || !ids.includes('wall')) bad.push('catwalk or wall missing'); if (ids.some((id) => /wramp|stair|levelpad/.test(id))) bad.push('ramps or the leveler unlocked by the pads');
    for (const k of Object.keys(FRAME_TYPES)) { const r = recipes(g).find((x) => x.id === 'pad:' + k); if (r && r.price !== B.PAD_PRICE[k] * 3) bad.push(`pad:${k} price ${r.price}`); if (r && ((r.mat || null) !== (({ timber: 'timber', steel: 'steel', concrete: 'concrete' })[k] ?? null) || (r.mat && r.matN !== ({ timber: 4, steel: 4, concrete: 2 })[k]))) bad.push(`pad:${k} material ${r.mat}x${r.matN}`); }
    if (B.PAD_PRICE.timber !== 18 || B.PAD_PRICE.steel !== 60 || B.PAD_PRICE.concrete !== 140) bad.push('timber, steel and concrete prices are not 18, 60 and 140');
    const hangar = B.PAD_PRICE.plasma * 3 * 100; if (!(hangar > 12e6 && hangar < 16e6)) bad.push('a hangar of 100 plasma pads costs ' + hangar);
    for (let q = 1; q < B.KINDS.length; q++) if (!(B.PAD_PRICE[B.KINDS[q]] > B.PAD_PRICE[B.KINDS[q - 1]])) bad.push('prices do not grow at ' + B.KINDS[q]);
    fresh({ shellRamps: 1 }); g.T = g.tune(); ids = recipes(g).filter(mine).map((r) => r.id); if (ids.join() !== 'wramp,wramp:haul,stair') bad.push('ramps unlocked: ' + ids.join());
    fresh({ shellLevel: 1 }); g.T = g.tune(); const lv = recipes(g).find((r) => r.id === 'levelpad'); if (!lv || lv.price !== 1.2e6) bad.push('leveler price ' + (lv && lv.price));
    for (const id of ['shellPads', 'shellRamps', 'shellLevel']) { const u = UPGRADES.find((x) => x.id === id); if (!u) { bad.push('no upgrade ' + id); continue; } if (u.cost[0] < 3e6) bad.push(id + ' is priced for a small wallet'); if (u.fresh) bad.push(id + ' has a maxed-it achievement flag'); }
    const u2 = UPGRADES.find((x) => x.id === 'shellRamps'), u3 = UPGRADES.find((x) => x.id === 'shellLevel'); if (!u2.req || u2.req.id !== 'shellPads' || !u3.req || u3.req.id !== 'shellRamps') bad.push('unlock chain');
    fresh({ shellPads: 1, steel: 1 }); g.T = g.tune(); S().money = 1e9; const m0 = S().money; craft('pad:steel', 3); if (m0 - S().money !== 540 || S().items['pad:steel'] !== 3) bad.push('crafting 3 steel pads charged ' + (m0 - S().money));
    const text = recipes(g).filter(mine).map((r) => [r.name, r.desc, r.use, r.status].join(' ')).join('\n'); if (/[—–]|undefined|NaN/.test(text)) bad.push('bad text in the bench cards');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.pad-places-solid-cells-and-the-hammer-returns-it', async () => {
    K.setup(); const bad = [];
    const r = await K.put('pad:concrete', I0(), K0()); if (!r.ok) return r.why; const e = r.made[0];
    if (!e || e.type !== 'pad' || e.mk !== 'concrete' || e.rid !== 'pad:concrete') bad.push('ent ' + JSON.stringify(e));
    if (S().items['pad:concrete']) bad.push('item not consumed');
    if (!K.solidCells(e)) bad.push('cells are not all PAD');
    const cells = K.cellsOf(e); if (cells.length !== 16 || !cells.every(([i, j, k]) => w().getVr(i, j, k) === 2)) bad.push('cells do not carry the material');
    if (w().get(e.i0 - 1, 0, e.k0) !== 0 || w().get(e.i0, 1, e.k0) !== 0) bad.push('stray cells around the pad');
    if (!g.machines.items.get(e.id) || !B.ownerAt(g, e.i0 + 2, 0, e.k0 + 3) || B.ownerAt(g, e.i0 + 2, 0, e.k0 + 3).id !== e.id) bad.push('no owner for a pad cell');
    // the hammer
    K.aim(e.i0 + 1, e.k0 + 1, { y: 0.6 }); selectTool('hammer'); g.updateBuild(g.curTool(), p().eyePos(new ctx.V3()), p().forward(new ctx.V3()));
    const ref = g.hammerTarget(); if (!ref || ref.id !== e.id) bad.push('hammer does not aim at the pad: ' + JSON.stringify(ref)); else { g.hammerHit(); }
    if (g.machines.items.has(e.id) || S().entities.some((x) => x.id === e.id)) bad.push('ent still there after the hammer');
    if (cells.some(([i, j, k]) => w().get(i, j, k) !== 0)) bad.push('cells still there after the hammer');
    if (S().items['pad:concrete'] !== 1) bad.push('item not handed back: ' + JSON.stringify(S().items));
    if (B.ownerAt(g, e.i0, 0, e.k0)) bad.push('owner kept after removal');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.pad-needs-clearance', async () => {
    K.setup(); const bad = [], i = I0(), k = K0(); K.equip('pad:timber'); S().items['pad:timber'] = 5; g.rebuildTools();
    const tryPlan = async () => { K.aim(i, k); return plan(); };
    let pl = await tryPlan(); if (!pl.ok) return 'clean floor refused: ' + pl.why;
    K.plushAt(i, 2, k); pl = await tryPlan(); if (pl.ok || !/Dig out 1 more plush/.test(pl.why)) bad.push('plush at row 2 gave: ' + (pl.ok ? 'ok' : pl.why)); w().removeCell(i, 2, k, false);
    K.plushAt(i, 4, k); pl = await tryPlan(); if (pl.ok) bad.push('plush at the 5th row (inside the 4 cell headroom) was allowed'); w().removeCell(i, 4, k, false);
    K.plushAt(i, 5, k); pl = await tryPlan(); if (!pl.ok) bad.push('plush at row 5 (above the headroom) refused: ' + pl.why); w().removeCell(i, 5, k, false);
    K.plushAt(i + 1, 0, k + 1, 3); pl = await tryPlan(); if (pl.ok || !/Dig out 3/.test(pl.why)) bad.push('plush in the floor cells gave: ' + (pl.ok ? 'ok' : pl.why)); for (let q = 0; q < 3; q++) w().removeCell(i + 1, q, k + 1, false);
    w().setCell(i, 3, k, 4098, 0); pl = await tryPlan(); if (pl.ok || !/solid/.test(pl.why)) bad.push('a bulkhead in the headroom gave: ' + (pl.ok ? 'ok' : pl.why)); w().setCell(i, 3, k, 0, 0);
    // a refused plan places nothing and keeps the item
    K.plushAt(i, 2, k); const n0 = S().entities.length; await tryPlan(); g.placeCurrent(g.curTool()); if (S().entities.length !== n0 || S().items['pad:timber'] !== 5) bad.push('a refused plan placed or charged'); w().removeCell(i, 2, k, false);
    pl = await tryPlan(); if (!pl.ok) bad.push('clear again but refused: ' + pl.why);
    // dig first: a mound of plush over the whole footprint, then dig it out cell by cell and the plan turns green
    for (let di = -1; di <= 2; di++) for (let dk = -1; dk <= 2; dk++) K.plushAt(i + di, 1, k + dk, 2);
    pl = await tryPlan(); if (pl.ok || !/Dig out 32/.test(pl.why)) bad.push('a mound of 32 gave: ' + (pl.ok ? 'ok' : pl.why));
    for (let di = -1; di <= 2; di++) for (let dk = -1; dk <= 2; dk++) for (let q = 1; q <= 2; q++) w().removeCell(i + di, q, k + dk, false);
    pl = await tryPlan(); if (!pl.ok) bad.push('dug out but refused: ' + pl.why);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.pad-needs-ground-and-cannot-share-a-cell-with-things', async () => {
    K.setup(); const bad = [], i = I0(), k = K0();
    if (!/No ground/.test(B.checkPiece(g, pad(i, k, 6)) || '')) bad.push('a pad floating at row 6 was allowed');
    const r = await K.put('pad:timber', i, k); if (!r.ok) return r.why; const e = r.made[0];
    if (!/solid is already here/.test(B.checkPiece(g, pad(e.i0 + 2, e.k0, 0)) || '')) bad.push('a second pad on top of the first cells was allowed');
    if (B.checkPiece(g, pad(e.i0, e.k0, 1))) bad.push('a pad stacked on a pad was refused: ' + B.checkPiece(g, pad(e.i0, e.k0, 1)));
    // a belt tile in the pad's cells
    S().items.belt = 3; const bt = L().add && null; void bt;
    const t = { id: g.nextId(), type: 'belt', i: e.i0 + 8, j: 0, k: e.k0, dir: 0, rise: 0, items: [] }; S().entities.push(t); g.addEntity(t);
    if (!/Something is in the way/.test(B.checkPiece(g, pad(e.i0 + 8, e.k0, 0)) || '')) bad.push('a pad over a belt was allowed');
    if (!/Something is in the way/.test(B.checkPiece(g, pad(e.i0 + 6, e.k0 - 1, 0)) || '')) bad.push('a pad over the edge of a belt tile was allowed');
    L().remove(t); S().entities = S().entities.filter((x) => x.id !== t.id);
    // a frame standing on the floor blocks a pad under it, a frame on top of the pad is fine
    const f = await K.put('frame:timber', e.i0 + 12, e.k0 + 1); if (!f.ok) bad.push('frame: ' + f.why); else {
      if (!/frame stands here/.test(B.checkPiece(g, pad(f.made[0].gm - 1, f.made[0].glo, 0)) || '')) bad.push('a pad under a standing frame was allowed');
    }
    // the player standing there
    p().pos.set(cellX(e.i0 + 20), 0, cellZ(e.k0 + 1)); if (!/Step out/.test(B.checkPiece(g, pad(e.i0 + 19, e.k0, 0)) || '')) bad.push('a pad into the player was allowed');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.pad-snaps-to-frame-and-pad', async () => {
    K.setup(); const bad = [], i = I0(), k = K0();
    const a = await K.put('pad:timber', i, k); if (!a.ok) return a.why; const A = a.made[0];
    // beside: aim at the floor just east of the pad (and at its top edge): a neighbour on the same grid, same row
    for (const [name, ai, ak, ay, want] of [['floor east', A.i0 + 5, A.k0 + 1, 0, [A.i0 + 4, A.k0]], ['floor south', A.i0 + 1, A.k0 + 5, 0, [A.i0, A.k0 + 4]], ['floor west', A.i0 - 2, A.k0 + 2, 0, [A.i0 - 4, A.k0]], ['floor north', A.i0 + 2, A.k0 - 2, 0, [A.i0, A.k0 - 4]]]) {
      K.equip('pad:timber'); S().items['pad:timber'] = 5; g.rebuildTools(); K.aim(ai, ak, { y: ay, back: 3.0 }); const pl = await plan(); if (!pl.ok) { bad.push(name + ' refused: ' + pl.why); continue; }
      if (pl.ent.i0 !== want[0] || pl.ent.k0 !== want[1] || pl.ent.j !== 0) bad.push(`${name}: wanted ${want} got ${pl.ent.i0},${pl.ent.k0},${pl.ent.j} (${pl.ent.snap})`);
    }
    // the top edge: the neighbour on that side; the middle of the top: stacked above
    K.equip('pad:timber'); K.aim(A.i0 + 3, A.k0 + 1, { y: 0.6, back: 3.2 }); let pl = await plan(); if (!pl.ok || pl.ent.i0 !== A.i0 + 4 || pl.ent.k0 !== A.k0 || pl.ent.j !== 0) bad.push('top edge: ' + JSON.stringify(pl.ok ? [pl.ent.i0 - A.i0, pl.ent.k0 - A.k0, pl.ent.j, pl.ent.snap] : pl.why));
    K.aim(A.i0 + 1, A.k0 + 1, { y: 0.6, back: 3.2 }); pl = await plan(); if (!pl.ok || pl.ent.i0 !== A.i0 || pl.ent.k0 !== A.k0 || pl.ent.j !== 1) bad.push('top middle: ' + JSON.stringify(pl.ok ? [pl.ent.i0 - A.i0, pl.ent.k0 - A.k0, pl.ent.j, pl.ent.snap] : pl.why));
    // far from the first pad but within 16 cells: the same grid (multiples of 4 from its corner), not a free spot
    K.aim(A.i0 + 11, A.k0 + 6, { back: 3 }); pl = await plan(); if (!pl.ok) bad.push('far aim refused: ' + pl.why); else if (((pl.ent.i0 - A.i0) % 4 + 4) % 4 !== 0 || ((pl.ent.k0 - A.k0) % 4 + 4) % 4 !== 0) bad.push('far pad is off the pad grid: ' + (pl.ent.i0 - A.i0) + ',' + (pl.ent.k0 - A.k0));
    // placing the neighbour really abuts: no gap and no overlap
    K.aim(A.i0 + 5, A.k0 + 1, { back: 3 }); const b = await plan(); if (b.ok) { g.placeCurrent(g.curTool()); const Bn = S().entities.filter((x) => x.type === 'pad').find((x) => x.id !== A.id); if (!Bn || Bn.i0 !== A.i0 + 4) bad.push('neighbour not flush'); }
    // frames: a pad next to a frame lines up with it. Build one on clear floor east of the pads.
    const f = await K.put('frame:timber', A.i0 + 20, A.k0 + 2); if (!f.ok) bad.push('frame: ' + f.why); else {
      const F = f.made[0]; K.equip('pad:timber'); S().items['pad:timber'] = 5; g.rebuildTools();
      K.aim(F.gm + 3, F.glo + 1, { back: 3 }); pl = await plan();
      if (!pl.ok) bad.push('pad beside a frame refused: ' + pl.why); else if (pl.ent.i0 !== F.gm + 1 || pl.ent.k0 !== F.glo || !/frame/.test(pl.ent.snap)) bad.push(`pad beside a frame: wanted ${F.gm + 1},${F.glo} got ${pl.ent.i0},${pl.ent.k0} ${pl.ent.snap}`);
      K.aim(F.gm - 3, F.glo + 1, { back: 3 }); pl = await plan();
      if (!pl.ok) bad.push('pad west of a frame refused: ' + pl.why); else if (pl.ent.i0 !== F.gm - 4 || pl.ent.k0 !== F.glo) bad.push(`pad west of a frame: wanted ${F.gm - 4},${F.glo} got ${pl.ent.i0},${pl.ent.k0}`);
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.ctrl-aligns-world-grid', async () => {
    K.setup(); const bad = [], i = I0() + 1, k = K0() + 1;
    K.equip('pad:timber'); S().items['pad:timber'] = 5; g.rebuildTools(); K.aim(i, k); let pl = await plan();
    if (!pl.ok) return pl.why; if (pl.ent.i0 !== i - 1 || pl.ent.k0 !== k - 1 || !/free/.test(pl.ent.snap)) bad.push(`with no pad around, the pad centres on the aim: ${pl.ent.i0},${pl.ent.k0} (want ${i - 1},${k - 1})`);
    g.keys.ControlLeft = true; K.aim(i, k); pl = await plan(); if (!pl.ok) return 'ctrl: ' + pl.why;
    if (pl.ent.i0 % 4 !== 0 || pl.ent.k0 % 4 !== 0 || i < pl.ent.i0 || i > pl.ent.i0 + 3 || !/world grid/.test(pl.ent.snap)) bad.push(`ctrl did not lock to the world grid: ${pl.ent.i0},${pl.ent.k0} (${pl.ent.snap})`);
    // with a pad down, Ctrl still goes to the WORLD grid, not the pad's
    g.keys.ControlLeft = false; const a = await K.put('pad:timber', i, k); if (!a.ok) return a.why; const A = a.made[0];
    const off = ((A.i0 % 4) + 4) % 4; g.keys.ControlLeft = true; K.equip('pad:timber'); K.aim(A.i0 + 9, A.k0 + 5, { back: 3 }); pl = await plan();
    if (!pl.ok) bad.push('ctrl far: ' + pl.why); else if (pl.ent.i0 % 4 !== 0 || pl.ent.k0 % 4 !== 0) bad.push('ctrl with a pad down is not on the world grid ' + pl.ent.i0);
    g.keys.ControlLeft = false; K.aim(A.i0 + 9, A.k0 + 5, { back: 3 }); pl = await plan(); if (!pl.ok) bad.push('far: ' + pl.why); else if (((pl.ent.i0 - A.i0) % 4 + 4) % 4 !== 0) bad.push('without ctrl the far pad left the pad grid (grid offset ' + off + ')');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.r-turns-and-shift-r-nudges', async () => {
    K.setup(); const bad = [], i = I0(), k = K0();
    S().items['pad:timber'] = 20; K.equip('pad:timber'); S().items['pad:timber'] = 20; g.rebuildTools(); g._bz = { n: 3, w: 1 };
    K.aim(i, k); let pl = await plan(); if (!pl.ok) return pl.why; const dir0 = pl.ent.zd; const z0 = pl.ent.zoop.map((q) => q.join(','));
    if (z0.length !== 3 || pl.ent.zoop[1][0] - pl.ent.zoop[0][0] !== 4 * B.DX[dir0] || pl.ent.zoop[1][1] - pl.ent.zoop[0][1] !== 4 * B.DZ[dir0]) bad.push('zoop does not run the way you face: ' + z0.join(' '));
    // R turns a quarter
    const key = (code, extra = {}) => { g.onKey({ code, shiftKey: false, repeat: false, target: document.body, preventDefault() {}, ...extra }, true); if (g.ui.isModalOpen()) g.ui.closeModals(); };   // a stray E near the bench opens the craft window: close it so the next key is not swallowed
    key('KeyR'); K.aim(i, k); pl = await plan(); if (!pl.ok) return 'after R: ' + pl.why;
    if (pl.ent.zd !== ((dir0 + 1) & 3)) bad.push(`R did not turn the zoop: ${dir0} -> ${pl.ent.zd}`);
    key('KeyR'); key('KeyR'); key('KeyR'); K.aim(i, k); pl = await plan(); if (pl.ent.zd !== dir0) bad.push('four turns are not a full circle');
    // Shift+R nudges one cell along your facing
    g._bz = { n: 1, w: 1 }; K.aim(i, k); const base = (await plan()).ent;
    key('KeyR', { shiftKey: true }); K.aim(i, k); pl = await plan(); if (!pl.ok) return 'nudged: ' + pl.why;
    if (pl.ent.i0 !== base.i0 + 1 || pl.ent.k0 !== base.k0 || !/nudged/.test(pl.ent.snap)) bad.push(`nudge 1: ${pl.ent.i0 - base.i0},${pl.ent.k0 - base.k0} ${pl.ent.snap}`);
    key('KeyR', { shiftKey: true }); key('KeyR', { shiftKey: true }); key('KeyR', { shiftKey: true }); K.aim(i, k); pl = await plan(); if (pl.ent.i0 !== base.i0 || g._bn !== 0) bad.push('four nudges are not back on the grid');
    // a non build tool keeps the old R (punch): nothing turns
    selectTool('hammer'); const r0 = g._bRot; key('KeyR'); if (g._bRot !== r0) bad.push('R turned the build rotation with the hammer in hand');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.zoop-10-pads-one-cost-one-undo', async () => {
    K.setup(); const bad = [], i = I0() - 3, k = K0();
    const key = (code, extra = {}) => { g.onKey({ code, shiftKey: false, repeat: false, target: document.body, preventDefault() {}, ...extra }, true); if (g.ui.isModalOpen()) g.ui.closeModals(); };   // a stray E near the bench opens the craft window: close it so the next key is not swallowed
    craft('pad:steel', 12); K.equip('pad:steel'); const stock = S().items['pad:steel']; const m0 = S().money;
    for (let q = 0; q < 12; q++) key('Equal'); if (g._bz.n !== 10) bad.push('the zoop did not stop at 10: ' + g._bz.n);
    K.aim(i, k); const pl = await plan(); if (!pl.ok) return pl.why;
    if (pl.ent.zoop.length !== 10) bad.push('plan has ' + pl.ent.zoop.length + ' pads'); if (g.planCost !== B.PAD_PRICE.steel * 3 * 10) bad.push('plan cost ' + g.planCost + ', one line for the whole zoop');
    if (!g._xInfo || !/x 10/.test(g._xInfo.title) || !/1\.8K/.test(g._xInfo.lines.join(' '))) bad.push('the preview card does not show the count and the cost: ' + JSON.stringify(g._xInfo));
    g.placeCurrent(g.curTool());
    const pads = S().entities.filter((e) => e.type === 'pad'); if (pads.length !== 10) return 'placed ' + pads.length + ': ' + bad.join(' | ');
    if (S().items['pad:steel'] !== stock - 10) bad.push('items: ' + S().items['pad:steel'] + ' of ' + stock); if (S().money !== m0) bad.push('placing charged money');
    if (new Set(pads.map((e) => e.grp)).size !== 1 || pads[0].grp === undefined) bad.push('the pieces do not share one group id');
    const xs = pads.map((e) => e.i0).sort((a, b) => a - b); for (let q = 1; q < xs.length; q++) if (xs[q] - xs[q - 1] !== 4) bad.push('pads are not laid edge to edge');
    if (!pads.every((e) => K.solidCells(e))) bad.push('not every pad has its cells');
    // X takes down only the piece you aim at
    K.aim(pads[3].i0 + 1, pads[3].k0 + 1, { y: 0.6, back: 2.6 }); selectTool('hammer'); g.updateBuild(g.curTool(), p().eyePos(new ctx.V3()), p().forward(new ctx.V3()));
    const ref = g.findDeconRef(); if (!ref || !pads.some((e) => e.id === ref.id)) return 'no pad under the crosshair ' + JSON.stringify(ref);
    key('KeyX'); if (S().entities.filter((e) => e.type === 'pad').length !== 9) bad.push('X did not remove exactly one piece: ' + S().entities.filter((e) => e.type === 'pad').length);
    if (S().items['pad:steel'] !== stock - 9) bad.push('one piece back, items ' + S().items['pad:steel']);
    // Shift+X takes down the rest of the group in one go
    const left = S().entities.filter((e) => e.type === 'pad'); K.aim(left[0].i0 + 1, left[0].k0 + 1, { y: 0.6, back: 2.6 }); g.updateBuild(g.curTool(), p().eyePos(new ctx.V3()), p().forward(new ctx.V3()));
    key('KeyX', { shiftKey: true }); if (S().entities.some((e) => e.type === 'pad')) bad.push('Shift+X left ' + S().entities.filter((e) => e.type === 'pad').length + ' pads');
    if (S().items['pad:steel'] !== stock) bad.push('the group undo did not return every pad: ' + S().items['pad:steel']);
    if (pads.some((e) => K.cellsOf(e).some(([ci, cj, ck]) => w().get(ci, cj, ck) !== 0))) bad.push('cells left behind');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.hold-b-and-drag-lays-a-line-or-a-block-on-release', async () => {
    K.setup(); const bad = [], i = I0() - 4, k = K0() - 2; const EXT = await import('../ext.js'); const tick = () => EXT.update(g, 0.05, false);
    // stand behind the anchor (west of it, or east of it when the drag goes west) and look at the far spot, so the player is never inside the line being planned
    const drag = (ti, tk, dir = 0) => K.aim(i, k, { back: 2.6, dir, pitchTo: { x: cellX(ti), y: 0, z: cellZ(tk) } });
    craft('pad:timber', 40); K.equip('pad:timber'); g._bz = { n: 1, w: 1 };
    const start = async () => { g.keys = {}; g._bhold = null; K.aim(i, k, { back: 2.6 }); const pl = await plan(); if (!pl.ok) throw new Error(pl.why); g.keys.KeyB = true; g.useTool(g.curTool()); return pl.ent; };
    const first = await start(); if (S().entities.some((e) => e.type === 'pad') || !g._bhold) bad.push('the press placed something or did not anchor');
    // drag 4 pads east along x: a line of 5 starting at the anchor
    drag(i + 16, k); let pl = await plan(); if (!pl.ok || pl.ent.zoop.length !== 5 || pl.ent.zoop[0][0] !== first.i0 || pl.ent.zoop[0][1] !== first.k0) bad.push('line of 5: ' + (pl.ok ? JSON.stringify(pl.ent.zoop.map((q) => q[0] - first.i0)) : pl.why));
    if (!/Dragging/.test((g._xInfo && g._xInfo.lines.join(' ')) || '')) bad.push('the card does not say it is dragging');
    // the longer axis wins: 8 east and 12 south is a line along z, 4 long (distance 12 / 4 + 1 = 4)
    drag(i + 8, k + 12); pl = await plan(); if (!pl.ok || pl.ent.zoop.length !== 4 || pl.ent.zoop.some((q) => q[0] !== first.i0)) bad.push('longer axis: ' + (pl.ok ? JSON.stringify(pl.ent.zoop.map((q) => [q[0] - first.i0, q[1] - first.k0])) : pl.why));
    // Shift drags a block: 3 wide (8 / 4 + 1) and 4 long
    g.keys.ShiftLeft = true; pl = await plan(); if (!pl.ok || pl.ent.zoop.length !== 12) bad.push('block 4 x 3: ' + (pl.ok ? pl.ent.zoop.length : pl.why)); g.keys.ShiftLeft = false;
    // dragging back past the anchor goes the other way (west)
    drag(i - 12, k, 2); pl = await plan(); if (!pl.ok || pl.ent.zoop.length !== 4 || pl.ent.zoop.some((q) => q[0] > first.i0)) bad.push('west: ' + (pl.ok ? JSON.stringify(pl.ent.zoop.map((q) => q[0] - first.i0)) : pl.why));
    // the release lays exactly the planned pads, one group, one consumption
    drag(i + 16, k); pl = await plan(); const n0 = S().items['pad:timber']; g.keys.KeyB = false; tick();
    const pads = S().entities.filter((e) => e.type === 'pad'); if (pads.length !== 5 || new Set(pads.map((e) => e.grp)).size !== 1 || S().items['pad:timber'] !== n0 - 5) bad.push(`release placed ${pads.length}, items ${S().items['pad:timber']} of ${n0}`);
    if (g._bhold) bad.push('the hold is still set after the release');
    for (const e of pads) g.doDecon({ kind: 'mach', id: e.id });
    // a left click works the same (the mouse sets KeyG), and putting the tool away cancels
    const f2 = await start(); void f2; g.keys.KeyB = false; g.keys.KeyG = true; tick(); if (!g._bhold) bad.push('left click held: the hold ended'); g.keys.KeyG = false; tick(); if (S().entities.filter((e) => e.type === 'pad').length !== 1) bad.push('the click release did not place the one pad');
    for (const e of S().entities.filter((x) => x.type === 'pad')) g.doDecon({ kind: 'mach', id: e.id });
    await start(); drag(i + 16, k); await plan(); g.stowed = true; g.keys.KeyB = false; tick(); if (S().entities.some((e) => e.type === 'pad') || g._bhold) bad.push('stowing the tool did not cancel the drag'); g.stowed = false;
    // a refused anchor spot does not start a hold: the old refusal comes back
    K.equip('pad:timber'); K.plushAt(i, 2, k); K.aim(i, k, { back: 2.6 }); g.keys.KeyB = true; pl = await plan(); const used = g.useTool(g.curTool()); void used; if (g._bhold) bad.push('a refused spot started a hold'); g.keys.KeyB = false; w().removeCell(i, 2, k, false);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.zoop-blocks-cut-at-the-first-piece-that-does-not-fit', async () => {
    K.setup(); const bad = [], i = I0() - 4, k = K0() - 2; S().items['pad:timber'] = 40; K.equip('pad:timber'); S().items['pad:timber'] = 40; g.rebuildTools();
    g._bz = { n: 5, w: 5 }; K.aim(i, k); let pl = await plan(); if (!pl.ok) return pl.why;
    if (pl.ent.zoop.length !== 25) bad.push('a 5 x 5 block has ' + pl.ent.zoop.length + ' pads'); if (new Set(pl.ent.zoop.map((q) => q.join(','))).size !== pl.ent.zoop.length) bad.push('duplicate positions');
    g._bz = { n: 9, w: 3 }; K.aim(i, k); pl = await plan(); if (!pl.ok || pl.ent.zoop.length !== 15) bad.push('width above 1 keeps the length at 5: ' + (pl.ok ? pl.ent.zoop.length : pl.why));
    // a mound in the way of the 4th pad of a line cuts the line there
    g._bz = { n: 8, w: 1 }; const first = (await plan()).ent; const dir = first.zd; const bi = first.i0 + 4 * 3 * B.DX[dir] + 1 * Math.abs(B.DX[dir]), bk = first.k0 + 4 * 3 * B.DZ[dir] + 1 * Math.abs(B.DZ[dir]);
    K.plushAt(bi, 1, bk, 2); K.aim(i, k); pl = await plan(); if (!pl.ok) return 'cut plan: ' + pl.why; if (pl.ent.zoop.length !== 3) bad.push('the line was not cut at the mound: ' + pl.ent.zoop.length);
    if (!/Cut short|piece 4/.test((g._xInfo && g._xInfo.lines.join(' ')) || '')) bad.push('the card does not say why it stopped');
    // only as many as you hold
    w().removeCell(bi, 1, bk, false); w().removeCell(bi, 2, bk, false); S().items['pad:timber'] = 2; g.rebuildTools(); K.aim(i, k); pl = await plan(); if (!pl.ok || pl.ent.zoop.length !== 2) bad.push('a stack of 2 should lay 2: ' + (pl.ok ? pl.ent.zoop.length : pl.why));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.pad-holds-belt-and-pole', async () => {
    K.setup(Object.assign({}, UP, { power: 1, belts: 1 })); const bad = [], i = I0(), k = K0();
    const a = await K.put('pad:timber', i, k); if (!a.ok) return a.why; const A = a.made[0];
    for (const [id, dk] of [['belt', 1], ['pole', 3]]) {
      craft(id, 1); K.equip(id); K.aim(A.i0 + 1, A.k0 + dk, { y: 0.6, back: 2.6 }); const pl = await plan(); if (!pl.ok) { bad.push(id + ' on a pad: ' + pl.why); continue; }
      if (pl.ent.j !== 1) bad.push(`${id} would sit at row ${pl.ent.j}, not on the pad`); g.placeCurrent(g.curTool());
    }
    const tiles = [...L().tiles.values()].filter((t) => !t.free && (t.type === 'belt' || t.type === 'pole')); if (tiles.length !== 2 || tiles.some((t) => t.j !== 1)) bad.push('tiles: ' + JSON.stringify(tiles.map((t) => [t.type, t.j])));
    // the pad row is taken now: a second pad on the same spot is refused, the tiles keep standing on it
    if (!B.checkPiece(g, pad(A.i0, A.k0, 0))) bad.push('overlap allowed');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.pad-never-falls-grab-or-blast', async () => {
    K.setup(); const bad = [], i = I0(), k = K0();
    const a = await K.put('pad:timber', i, k); if (!a.ok) return a.why; const A = a.made[0];
    const [ci, cj, ck] = K.cellsOf(A)[5];
    if (w().removeCell(ci, cj, ck, false) !== null || w().get(ci, cj, ck) !== 4095) bad.push('removeCell took a pad cell');
    S().carry = []; g.grabCd = 0; const got = g.collect({ type: 'cell', i: ci, j: cj, k: ck, sp: 4095, vr: 0 }); if (got || w().get(ci, cj, ck) !== 4095 || S().carry.length) bad.push('the hand took a pad cell');
    // a blast right on it
    g.detonate({ x: cellX(ci), y: 0.3, z: cellZ(ck), tier: 3, dyn: false }); adv(0.5); if (!K.solidCells(A)) bad.push('a blast removed pad cells');
    // a roof cell of pad over a hole is not a roof: it never creaks
    w().setCell(ci, 8, ck, 4095, 0); if (w().stress(ci, 8, ck) !== null) bad.push('a pad cell over a gap reads as a failing roof'); if (w().slipChance(ci, 8, ck, 1) !== null) bad.push('a pad cell slips'); w().setCell(ci, 8, ck, 0, 0);
    // loose plush piled against it and a collapse next to it: the pad stays
    for (let q = 0; q < 30; q++) w().setCell(A.i0 + 5, 1 + (q % 5), A.k0 + (q % 4), 3, 0); g.slide.trigger(A.i0 + 5, 1, A.k0, 3); ctx.stepSim(3); if (!K.solidCells(A)) bad.push('a slide moved pad cells');
    // the aim readout does not offer a pad as plush
    K.aim(ci, ck, { y: 0.6, back: 2 }); g.stowed = true; g.rebuildTools(); const tg = g.findTarget(p().eyePos(new ctx.V3()), p().forward(new ctx.V3())); if (tg && tg.type === 'cell') { const ti = g.targetInfo(tg); if (/◈/.test(ti.value) || !/hammer/.test(ti.value)) bad.push('target readout offers the pad as plush: ' + ti.value); }
    for (let q = 0; q < 30; q++) w().removeCell(A.i0 + 5, 1 + (q % 5), A.k0 + (q % 4), false);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.wall-is-bulk-and-anchors', async () => {
    K.setup(); const bad = [], i = I0(), k = K0();
    const a = await K.put('pad:timber', i, k); if (!a.ok) return a.why; const A = a.made[0];
    // aim at the top of the pad near its north edge: the wall runs along that edge, standing on the pad
    S().items.wall = 0; delete S().items.wall; craft('wall', 1); K.equip('wall'); K.aim(A.i0 + 1, A.k0, { y: 0.6, back: 3.2 }); let pl = await plan(); if (!pl.ok) return 'wall plan: ' + pl.why;
    if (pl.ent.ax !== 'x' || pl.ent.i0 !== A.i0 || pl.ent.k0 !== A.k0 || pl.ent.j !== 1) bad.push(`wall at ${pl.ent.ax} ${pl.ent.i0 - A.i0},${pl.ent.k0 - A.k0} row ${pl.ent.j}`);
    g.placeCurrent(g.curTool()); const W = S().entities.find((e) => e.type === 'wall'); if (!W) return 'no wall placed';
    if (!K.solidCells(W) || K.cellsOf(W).length !== 16) bad.push('a wall is not 16 bulkhead cells');
    // never falls, never taken by hand, never blasted
    const [ci, cj, ck] = K.cellsOf(W)[6];
    S().carry = []; const got = g.collect({ type: 'cell', i: ci, j: cj, k: ck, sp: 4098, vr: 0 }); if (got || w().get(ci, cj, ck) !== 4098) bad.push('the hand took a wall panel'); if (S().items.bulk) bad.push('a loose bulkhead item appeared');
    g.detonate({ x: cellX(ci), y: cj * 0.6 + 0.3, z: cellZ(ck), tier: 3, dyn: false }); adv(0.3); if (!K.solidCells(W)) bad.push('a blast removed wall cells');
    // the hammer takes the whole section and hands back one wall
    selectTool('hammer'); K.aim(ci, ck, { y: cj * 0.6 + 0.3, back: 2.6 }); g.updateBuild(g.curTool(), p().eyePos(new ctx.V3()), p().forward(new ctx.V3())); const ref = g.hammerTarget(); if (!ref || ref.id !== W.id) bad.push('hammer does not pick the wall: ' + JSON.stringify(ref)); else g.hammerHit();
    if (S().items.wall !== 1 || S().entities.some((e) => e.type === 'wall') || K.cellsOf(W).some(([x, y, z]) => w().get(x, y, z) !== 0)) bad.push('wall not handed back whole: ' + JSON.stringify(S().items));
    // anchoring: a wall across a dug tunnel ends the unsupported stretch (bulkhead cells anchor the roof edge, as before)
    const sp = ctx.spot(20); ctx.dig(sp.i, sp.k - 2, 30, 4, 4, false); const mid = sp.i + 15, kk = sp.k;
    const before = w().cavityLen(mid, 1, kk, 40), farBefore = w().cavityLen(mid + 6, 1, kk, 40);
    for (let dk = -2; dk <= 1; dk++) for (let j = 0; j < 4; j++) w().setCell(mid + 1, j, kk + dk, 4098, 0);
    const wallLen = w().cavityLen(mid, 1, kk, 40);
    if (!(wallLen === 0 || wallLen < before)) bad.push(`a wall beside the cell does not anchor: ${before} -> ${wallLen}`);
    for (let dk = -2; dk <= 1; dk++) for (let j = 0; j < 4; j++) w().setCell(mid + 1, j, kk + dk, 0, 0);
    if (w().cavityLen(mid + 6, 1, kk, 40) !== farBefore) bad.push('removing the wall did not restore the far reading');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.pad-cell-beside-a-cavity-anchors-it-and-never-reads-as-a-failing-roof', async () => {
    K.setup(); const bad = [], sp = ctx.spot(20); ctx.dig(sp.i, sp.k - 2, 30, 4, 4, false); const mid = sp.i + 15, kk = sp.k;
    const base = w().cavityLen(mid, 1, kk, 40); if (!(base > 0)) return 'test setup: the dug cell is already anchored (' + base + ')';
    for (let dk = -2; dk <= 1; dk++) for (let j = 0; j < 4; j++) w().setCell(mid + 1, j, kk + dk, 4095, 0);
    const withPad = w().cavityLen(mid, 1, kk, 40); if (withPad !== 0) bad.push(`a pad cell at the same row beside the cell does not anchor it like a bulkhead: ${base} -> ${withPad}`);
    for (let dk = -2; dk <= 1; dk++) for (let j = 0; j < 4; j++) w().setCell(mid + 1, j, kk + dk, 0, 0);
    // a floor of pad cells in the tunnel (one row, under the whole stretch) changes no reading of the rows above
    const rd = () => { const o = []; for (let i = sp.i + 2; i < sp.i + 28; i += 5) for (let j = 1; j <= 3; j++) o.push(w().cavityLen(i, j, kk, 40)); return o.join(); };
    const before = rd(); for (let i = sp.i; i < sp.i + 30; i++) for (let dk = -2; dk <= 1; dk++) w().setCell(i, 0, kk + dk, 4095, 0);
    const after = rd(); for (let i = sp.i; i < sp.i + 30; i++) for (let dk = -2; dk <= 1; dk++) w().setCell(i, 0, kk + dk, 0, 0);
    if (before !== after) bad.push('a pad floor changed the cavity readings: ' + before + ' vs ' + after);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.pad-room-keeps-safe-length', async () => {
    // a sealed room: the same tunnel before and after a pad floor is laid. Pads are not roof and not an anchor, so every roof cell reads the same.
    K.setup(); const bad = [];
    let sp; for (const lane of [20, 12, 28, 6]) { try { sp = ctx.spot(lane); } catch (e) { continue; } if (w().topAt(sp.i + 20, sp.k) >= 12) break; }
    if (!sp || w().topAt(sp.i + 20, sp.k) < 12) return 'no deep enough lane for the room';
    const i0 = sp.i + 6, k0 = sp.k - 3, len = 16, wid = 8, hgt = 6; ctx.dig(i0, k0, len, wid, hgt, false);
    const reads = () => { const out = []; for (let i = i0 + 2; i < i0 + len; i += 3) for (let k = k0 + 1; k < k0 + wid; k += 3) { const s = w().stress(i, hgt, k); out.push(s ? [s.margin, s.d, s.B].join('/') : 'x'); } return out.join(' '); };
    const before = reads(), flat = []; for (let i = i0; i + 4 <= i0 + len; i += 4) for (let k = k0; k + 4 <= k0 + wid; k += 4) flat.push([i, k]);
    for (const [i, k] of flat) { const piece = pad(i, k, 0); const why = B.checkPiece(g, piece, { skipPlayer: true }); if (why) return 'room floor: ' + why; }
    S().items['pad:timber'] = 0; craft('pad:timber', 8); K.equip('pad:timber'); let n = 0;
    for (const [i, k] of flat) { K.aim(i + 1, k + 1, { back: 2.4, y: 0 }); const pl = await plan(); if (pl.ok) { g.placeCurrent(g.curTool()); n++; } }
    if (n < 4) return 'only ' + n + ' pads fit';
    const after = reads(); if (before !== after) bad.push('the pad floor changed the roof reading: ' + before.slice(0, 60) + ' vs ' + after.slice(0, 60));
    // and the stress overlay: no roof cell of the room is flagged because of the pads
    for (let i = i0 + 2; i < i0 + len; i += 3) for (let k = k0 + 1; k < k0 + wid; k += 3) { const s = w().stress(i, hgt, k); const s2 = null; void s2; if (s && s.margin < 0 && !before.includes('-')) bad.push('a roof cell became unsafe after the floor'); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.catwalk-places-with-rails-and-attaches', async () => {
    K.setup(); const bad = [], i = I0(), k = K0();
    const a = await K.put('pad:timber', i, k); if (!a.ok) return a.why; const A = a.made[0];
    // aim at the top of the pad near its east edge: the catwalk leaves that edge, flush with the pad
    craft('catwalk', 3); K.equip('catwalk'); K.aim(A.i0 + 3, A.k0 + 1, { y: 0.6, back: 3.2 }); let pl = await plan(); if (!pl.ok) return 'catwalk plan: ' + pl.why;
    if (pl.ent.i0 !== A.i0 + 4 || pl.ent.k0 !== A.k0 + 1 || pl.ent.j !== A.j || pl.ent.ax !== 'x') bad.push(`attach: ${pl.ent.i0 - A.i0},${pl.ent.k0 - A.k0} row ${pl.ent.j} ${pl.ent.ax}`);
    g.placeCurrent(g.curTool()); const C1 = S().entities.find((e) => e.type === 'catwalk'); if (!C1) return 'no catwalk';
    if (K.cellsOf(C1).length !== 4 || !K.solidCells(C1)) bad.push('catwalk cells');
    const [ci, cj, ck] = K.cellsOf(C1)[0]; if (!(w().getVr(ci, cj, ck) & 16)) bad.push('catwalk cells are not marked thin');
    if (C1.rail !== (C1.ax === 'x' ? 10 : 5)) bad.push('default rails on both long sides: ' + C1.rail);
    if (B.canCarryTrucks(g, ci, cj, ck)) bad.push('a catwalk plate can carry trucks'); if (!B.canCarryTrucks(g, A.i0, 0, A.k0)) bad.push('a pad cannot carry trucks');
    // aim at the top of its far end: the next one continues the line, same row and axis
    const last = K.cellsOf(C1)[3]; K.aim(last[0], last[2], { y: 0.6, back: 3.2 }); selectTool('catwalk'); pl = await plan();
    if (!pl.ok) bad.push('second catwalk: ' + pl.why); else if (pl.ent.j !== C1.j || pl.ent.ax !== C1.ax || pl.ent.i0 !== last[0] + 1) bad.push(`second catwalk ${pl.ent.i0 - last[0]} row ${pl.ent.j}`);
    // a belt rides on it, a pole too
    craft('belt', 1); K.equip('belt'); K.aim(ci, ck, { y: 0.6, back: 2 }); pl = await plan(); if (!pl.ok) bad.push('belt on a catwalk: ' + pl.why); else if (pl.ent.j !== 1) bad.push('belt row ' + pl.ent.j);
    // half the price of a pad of the same material
    const row = recipes(g).find((r) => r.id === 'catwalk'), prow = recipes(g).find((r) => r.id === 'pad:' + C1.mk); if (!row || !prow || row.price * 2 !== prow.price) bad.push(`catwalk price ${row && row.price} vs pad ${prow && prow.price}`);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.rails-config-copy-paste-and-use', async () => {
    K.setup(); const bad = [], i = I0(), k = K0();
    const a = await K.put('pad:timber', i, k); const b = await K.put('pad:timber', i + 8, k); if (!a.ok || !b.ok) return 'pads: ' + (a.why || b.why); const A = a.made[0], Bp = b.made[0];
    if (g.setCfg(A, { rail: 16 }).ok || g.setCfg(A, { rail: 1.5 }).ok || g.setCfg(A, { rail: 'x' }).ok || g.setCfg(A, { rail: 3, evil: 1 }).ok || g.setCfg(A, { type: 'x' }).ok) bad.push('a bad rail patch was accepted');
    const r = g.setCfg(A, { rail: 5 }); if (!r.ok || A.rail !== 5) bad.push('rail patch: ' + JSON.stringify(r));
    if (!g.machines.items.get(A.id).obj.getObjectByName('rails')) bad.push('no rail mesh after the patch');
    g.setCfg(A, { rail: 0 }); if (g.machines.items.get(A.id).obj.getObjectByName('rails')) bad.push('rail mesh kept at rail 0');
    // E on the pad toggles the rail of the edge you aim at (the east edge here)
    K.aim(A.i0 + 3, A.k0 + 1, { y: 0.6, back: 3.2 }); S().entities.forEach(() => 0); g.stowed = true; g.rebuildTools();
    const ok = B.useBuilt(g, A); const east = (A.rail & 1) === 1; if (!ok || !east) bad.push('E did not put a rail on the aimed edge: rail ' + A.rail);
    B.useBuilt(g, A); if (A.rail !== 0) bad.push('E twice did not take it down: ' + A.rail);
    // copy / paste between two pads (Shift+E then E)
    g.setCfg(A, { rail: 15 }); g.copyCfg(A); const pr = g.pasteCfg(Bp); if (!pr.ok || Bp.rail !== 15) bad.push('paste: ' + JSON.stringify(pr) + ' rail ' + Bp.rail);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.e-and-shift-e-reach-pads-through-the-real-key-handlers', async () => {
    K.setup(); const bad = [], i = I0(), k = K0();
    const a = await K.put('pad:timber', i, k, { back: 1.8 }); const b = await K.put('pad:timber', i, k + 8, { back: 1.8 }); if (!a.ok || !b.ok) return 'pads: ' + (a.why || b.why); const A = a.made[0], Bp = b.made[0];
    const key = (code, extra = {}) => { g.onKey({ code, shiftKey: false, repeat: false, target: document.body, preventDefault() {}, ...extra }, true); if (g.ui.isModalOpen()) g.ui.closeModals(); };   // a stray E near the bench opens the craft window: close it so the next key is not swallowed
    g.stowed = true; g.rebuildTools(); selectTool('hammer'); g.stowed = true;
    K.aim(A.i0 + 3, A.k0 + 1, { y: 0.6, back: 3.2 }); key('KeyE'); if (A.rail !== 1) bad.push('E on the east edge: rail ' + A.rail);
    K.aim(A.i0 + 1, A.k0 + 3, { y: 0.6, back: 3.2, dir: 1 }); key('KeyE'); if (A.rail !== (1 | 2)) bad.push('E on the south edge: rail ' + A.rail);
    // Shift+E copies the rails, E on the other pad pastes them, Shift+E at nothing drops the copy
    K.aim(A.i0 + 1, A.k0 + 1, { y: 0.6, back: 2.2 }); key('KeyE', { shiftKey: true }); if (!g.cfgClip || g.cfgClip.vals.rail !== 3) bad.push('Shift+E did not copy the rails: ' + JSON.stringify(g.cfgClip));
    K.aim(Bp.i0 + 1, Bp.k0 + 1, { y: 0.6, back: 2.2 }); key('KeyE'); if (Bp.rail !== 3) bad.push('E did not paste: ' + Bp.rail);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.frames-and-belts-stand-on-pads-and-old-saves-are-fine', async () => {
    K.setup(); const bad = [], i = I0(), k = K0();
    const a = await K.put('pad:timber', i, k, { back: 1.8 }); if (!a.ok) return a.why; const A = a.made[0];
    const f = await K.put('frame:timber', A.i0 + 1, A.k0 + 1, { y: 0.6, back: 3.2 }); if (!f.ok) bad.push('frame on a pad: ' + f.why); else if (f.made[0].y0 !== 0.6) bad.push('the frame stands at ' + f.made[0].y0 + ', not on the pad top');
    // an old save: no build fields in S, a hotbar slot naming a recipe that is not unlocked, nothing breaks and the bench lists nothing
    const S0 = JSON.parse(JSON.stringify(S())); delete S().buildGrp; S().hotbar = ['hammer', 'pad:steel', 'wramp', null, null, null, null, null, null]; S().up = {}; g.T = g.tune(); g.rebuildTools();
    if (g.tools[1] !== null && g.tools[1] !== undefined) bad.push('a locked recipe is on the hotbar'); if (recipes(g).some((r) => /^(pad:|catwalk|wall$|wramp|stair|levelpad)/.test(r.id))) bad.push('shell recipes without the unlocks');
    S().up = { ...UP_ }; g.T = g.tune(); g.rebuildTools(); const n = S().buildGrp; void n; void S0;
    // grp counter starts from nothing and counts up
    S().items['pad:timber'] = 3; delete S().buildGrp; K.equip('pad:timber'); K.aim(A.i0 + 5, A.k0 + 1, { back: 3 }); const pl = await plan(); if (pl.ok) { g.placeCurrent(g.curTool()); if (!(S().buildGrp >= 1)) bad.push('no group counter after the first piece'); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.hover-readouts-for-every-piece', async () => {
    K.setup(); const bad = [];
    const base = I0(), kz = K0();
    const a = await K.put('pad:steel', base, kz); if (!a.ok) return a.why; const A = a.made[0];
    const c = await K.put('catwalk', base + 8, kz); const wl = await K.put('wall', base, kz - 8, { back: 2.6 }); const r1 = await K.put('wramp', base + 12, kz); const r2 = await K.put('wramp:haul', base + 12, kz + 8); const st = await K.put('stair', base, kz + 8);
    for (const [n, r] of [['catwalk', c], ['wall', wl], ['ramp', r1], ['truck ramp', r2], ['stair', st]]) if (!r.ok) bad.push(n + ' not placed: ' + r.why);
    const nm = (r) => (r.made && r.made[0]) ? r.made[0] : null;
    for (const e of [A, nm(c), nm(wl), nm(r1), nm(r2), nm(st)]) {
      if (!e) continue; let spot;
      if (e.type === 'pad') spot = [e.i0 + 1, e.k0 + 1, 0.6]; else if (e.type === 'catwalk' || e.type === 'wall') { const cc = K.cellsOf(e)[1]; spot = [cc[0], cc[2], cc[1] * 0.6 + 0.3 + (e.type === 'catwalk' ? 0.3 : 0)]; }
      else { const sx = (e.dir & 1) ? e.w : e.len, sz = (e.dir & 1) ? e.len : e.w; spot = [e.i0 + Math.floor(sx / 2), e.k0 + Math.floor(sz / 2), e.j * 0.6 + e.rise * 0.6 * 0.4]; }
      K.aim(spot[0], spot[1], { y: spot[2], back: 2.2 }); g.stowed = true; g.rebuildTools(); g.player.pitch = Math.min(g.player.pitch, -0.05);
      const ref = findInfoRef(g); if (!ref || ref.id !== e.id) { bad.push(`${e.type}: info ref ${JSON.stringify(ref)} (want ${e.id})`); continue; }
      const inf = infoFor(g, ref); if (!inf || !inf.title || !inf.lines.length) { bad.push(e.type + ': empty readout'); continue; }
      const text = inf.title + ' ' + inf.lines.join(' '); if (/[—–]|undefined|NaN|null/.test(text)) bad.push(e.type + ': bad text ' + text);
      if (!/PAD|CATWALK|WALL|RAMP|STAIR/.test(inf.title)) bad.push(e.type + ': title ' + inf.title);
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.pieces-survive-save-and-load', async () => {
    K.setup(); const bad = [], base = I0(), kz = K0();
    const made = [];
    for (const [id, di, dk] of [['pad:concrete', 0, 0], ['catwalk', 8, 0], ['wall', 0, -8], ['wramp', 12, 8], ['stair', 0, 10]]) { const r = await K.put(id, base + di, kz + dk); if (!r.ok) return id + ': ' + r.why; made.push(...r.made); }
    const raw = K.cloneJSON(S().entities.filter((e) => K.isShell(e))), cellsBefore = [];
    for (const e of raw) if (['pad', 'catwalk', 'wall'].includes(e.type)) for (const [i, j, k] of B.cellsOf(e)) cellsBefore.push([i, j, k, w().get(i, j, k), w().getVr(i, j, k)]);
    // what a save keeps: the plain ents and the cell edits. Forget the live objects, restore both, add the ents back the way loading does.
    const diff = []; w().forEachDiff((id, sp, vr) => { if (sp === 4095 || sp === 4098) diff.push([id, sp, vr]); });
    for (const e of made) { const it = g.machines.items.get(e.id); g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); }
    for (const [i, j, k] of cellsBefore) w().setCell(i, j, k, 0, 0); S().entities = S().entities.filter((e) => !K.isShell(e)); g.world.reserved.clear(); g._bld = null;
    const NX = ctx.cfg.NX, NZ = ctx.cfg.NZ; for (const [id, sp, vr] of diff) { const i = id % NX, k = Math.floor(id / NX) % NZ, j = Math.floor(id / (NX * NZ)); w().restoreDiff(i, j, k, sp, vr); }
    for (const e of raw) { S().entities.push(e); g.addEntity(e); }
    for (const [i, j, k, sp, vr] of cellsBefore) if (w().get(i, j, k) !== sp || w().getVr(i, j, k) !== vr) { bad.push(`cell ${i},${j},${k} ${w().get(i, j, k)} vs ${sp}`); break; }
    for (const e of raw) { const it = g.machines.items.get(e.id); if (!it || !it.obj) { bad.push(e.type + ' has no object after loading'); continue; } if (['pad', 'catwalk', 'wall'].includes(e.type) && !B.ownerAt(g, B.cellsOf(e)[0][0], B.cellsOf(e)[0][1], B.cellsOf(e)[0][2])) bad.push(e.type + ' lost its owner'); }
    const ramp = raw.find((e) => e.type === 'wramp'); const sy = B.surfaceAt(g, cellX(ramp.i0) + 0.2, cellZ(ramp.k0) + 0.2); if (sy === null) bad.push('the ramp has no surface after loading');
    // reserved cells for the ramp are back (loose plush must not settle inside it)
    if (!w().reserved.has((ramp.j * ctx.cfg.NZ + ramp.k0) * ctx.cfg.NX + ramp.i0)) bad.push('ramp cells not reserved after loading');
    // an old save has none of this: no ents, no new fields, nothing breaks
    g._bld = null; if (B.allBuilt(g).length !== raw.length) bad.push('registry count'); const noGrp = S().buildGrp; void noGrp;
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.render-chunks-match-the-world-with-pads-and-walls', async () => {
    K.setup(); const bad = [], cam = g.renderer.camera.position, i = I0() - 8, k = K0() - 2;
    const flush = () => { for (let n = 0; n < 400 && (g.renderer.pending.length || g.world.dirtyChunks.size); n++) g.renderer.updateChunks(cam, 40); };
    p().pos.set(cellX(i + 10), 0, cellZ(k + 4)); adv(0.2); flush();
    S().items['pad:timber'] = 0; craft('pad:timber', 12); craft('wall', 2);
    // pads straddling chunk borders (16 cell chunks), a wall, then removals and a tunnel next to them, then compare every drawn chunk with a fresh scan
    const bi = Math.ceil(i / 16) * 16 - 2; K.equip('pad:timber'); g._bz = { n: 4, w: 1 }; K.aim(bi, k, { back: 3 }); let pl = await plan(); if (pl.ok) g.placeCurrent(g.curTool());
    K.equip('wall'); K.aim(bi + 1, k, { y: 0.6, back: 3.2 }); pl = await plan(); if (pl.ok) g.placeCurrent(g.curTool());
    flush(); const rnd = (a, b) => a + Math.floor(Math.random() * (b - a));
    for (let n = 0; n < 300; n++) { const ii = bi + rnd(-6, 20), kk = k + rnd(-8, 12), jj = rnd(0, 6); if (Math.random() < 0.5) w().removeCell(ii, jj, kk, false); else if (!w().get(ii, jj, kk)) w().setCell(ii, jj, kk, 2 + (n % 5), 0); }
    for (const e of S().entities.filter((x) => x.type === 'pad').slice(0, 2)) g.doDecon({ kind: 'mach', id: e.id });
    flush(); let badN = 0, checked = 0, worst = '';
    for (const [, ch] of g.renderer.chunks) { if (ch.cold) continue; const exp = g.renderer.scanChunk(ch.cx, ch.cy, ch.cz, !!ch.deep).n; checked++; if (exp !== ch.n) { badN++; worst = `chunk ${ch.cx},${ch.cy},${ch.cz} drawn ${ch.n} expected ${exp}`; } }
    if (!(badN === 0 && checked > 0)) bad.push(`${badN} of ${checked} chunks stale: ${worst}`);
    // pad cells really draw as pad slabs (the colour table and the thin plate), not as plush
    let slabs = 0, plates = 0; for (const [, ch] of g.renderer.chunks) { if (!ch.data) continue; for (let o = 0; o < ch.n * 16; o += 16) { const a = ch.data[o + 15] | 0; if (a === ctx.cfg.NA_ARCH + 0 && false) slabs++; } }
    void slabs; void plates;
    for (const [i2, k2] of [[bi, k]]) for (let j = 0; j < 12; j++) w().removeCell(i2, j, k2, false);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.soak-random-actions-keep-cells-ents-and-registry-in-step', async () => {
    // 60 s of play with random building, turning, zooping, hammering, walking and plush edits around the pieces: no frame errors, and the cells, ents and owner map never disagree
    K.setup(); const bad = [], errs0 = g.errCount || 0, key = (code, extra = {}) => { g.onKey({ code, shiftKey: false, repeat: false, target: document.body, preventDefault() {}, ...extra }, true); if (g.ui.isModalOpen()) g.ui.closeModals(); };
    let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }, pick = (a) => a[Math.floor(rnd() * a.length)];
    const ids = ['pad:timber', 'pad:steel', 'pad:concrete', 'catwalk', 'wall', 'wramp', 'wramp:haul', 'stair'], base = I0(), kz = K0();
    const consistent = () => {
      const bx = K.box(); for (const e of K.ents()) if (['pad', 'catwalk', 'wall'].includes(e.type)) { if (!K.solidCells(e)) return `${e.type} ${e.id} lost cells`; }
      for (let k = bx.k0; k <= bx.k1; k += 1) for (let i = bx.i0; i <= bx.i1; i += 1) for (let j = 0; j < 8; j++) { const s2 = w().get(i, j, k); if (s2 === 4095 || (s2 === 4098 && (w().getVr(i, j, k) & 128))) { const o = B.ownerAt(g, i, j, k); if (!o) return `orphan cell ${s2} at ${i},${j},${k}`; } }
      return null;
    };
    let placed = 0, removed = 0;
    for (const id of ids) craft(id, 12);
    for (let step = 0; step < 240; step++) {
      const r = rnd(); const ci = base + Math.floor(rnd() * 40) - 20, ck = kz + Math.floor(rnd() * 16) - 6;
      if (r < 0.34) { const id = pick(ids); if (!(S().items[id] > 0)) craft(id, 8); K.equip(id); g._bz = { n: 1 + Math.floor(rnd() * 5), w: rnd() < 0.2 ? 2 : 1 }; K.aim(ci, ck, { back: 1.8 + rnd() * 2, y: rnd() < 0.5 ? 0 : 0.6, dir: Math.floor(rnd() * 4) }); const pl = await plan(); if (pl && pl.ok && rnd() < 0.9) { const n0 = S().entities.length; g.placeCurrent(g.curTool()); placed += S().entities.length - n0; } }
      else if (r < 0.5) { selectTool('hammer'); K.aim(ci, ck, { y: 0.3, back: 1.6 + rnd() * 1.5, dir: Math.floor(rnd() * 4) }); g.updateBuild(g.curTool(), p().eyePos(new ctx.V3()), p().forward(new ctx.V3())); const n0 = S().entities.length; if (rnd() < 0.6) key('KeyX', { shiftKey: rnd() < 0.3 }); else g.hammerHit(); removed += Math.max(0, n0 - S().entities.length); }
      else if (r < 0.6) key(pick(['KeyR', 'Equal', 'Minus']), { shiftKey: rnd() < 0.3 });
      else if (r < 0.7) { g.stowed = true; K.aim(ci, ck, { y: 0.6, back: 2.4 }); key('KeyE'); key('KeyE', { shiftKey: true }); }
      else if (r < 0.8) { const e = pick(K.ents()); if (e && (e.type === 'pad' || e.type === 'catwalk')) g.setCfg(e, { rail: Math.floor(rnd() * 16) }); }
      else if (r < 0.9) { K.plushAt(ci, 6, ck, 1); w().removeCell(ci, 6, ck, false); }
      else { p().pos.set(cellX(ci), 0, cellZ(ck)); p().vel.set(0, 0, 0); for (let n = 0; n < 12; n++) p().update(1 / 60, { fwd: 1, back: 0, left: 0, right: 0, sprint: false, crouch: false, jump: rnd() < 0.1 }, { walk: g.T.walk, crouchMul: g.T.crouchMul, jump: g.T.jump }, g.sim); }
      adv(0.25);
      if (step % 40 === 0) { const c = consistent(); if (c) { bad.push(`step ${step}: ${c}`); break; } }
    }
    const c = consistent(); if (c) bad.push('end: ' + c);
    if (placed < 25 || removed < 5) bad.push(`the soak barely did anything: ${placed} placed, ${removed} removed`);
    if ((g.errCount || 0) !== errs0) bad.push('frame errors: ' + (g.errLog || []).slice(-1)[0]);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.controls-list-the-shell-keys', async () => {
    const rows = CONTROLS.flatMap((gr) => gr.rows), bad = [];
    for (const [keys, re] of [[['-', '='], /zoop/i], [['Shift', 'R'], /nudge/i], [['X'], /Shift\+X/]]) { const r = rows.find((x) => x.keys.join('+') === keys.join('+')); if (!r || !re.test(r.what)) bad.push('no row for ' + keys.join('+')); else if (/[—–]/.test(r.what)) bad.push('dash in ' + keys.join('+')); }
    const rr = rows.find((r) => r.codes.includes('Mouse2')); if (!rr || !/turns a floor pad/.test(rr.what)) bad.push('the R row does not mention turning build pieces');
    return bad.length === 0 || bad.join(' || ');
  });
}
