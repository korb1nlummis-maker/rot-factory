// elev.*: the Elevator, hoistway design (DESIGN_SATISFACTORY.md section 10). A big box cab (4 x 4 cells, 4 high) is set into a dug opening; you dig a hollow 4 x 4 shaft straight
// down from it and shore it like any tunnel; the rails then run out down the clear, shored, capped part by themselves, with a stop at every landing (a side tunnel or the edge
// of a pad that opens into the shaft). The elevator never digs. This file: placing it, the scan of the shaft (clear, shored, capped), landings, tiers, the support rule.
// Riding, carrying, crank, cuts, saves: elev_ride.js. Both roles of a game: elev_mp.js.
import { kit, UP } from './transit_lib.js';
import * as TR from '../transit.js';
import { infoFor } from '../info.js';
import { PAD } from '../plushdata.js';
import { recipes } from '../crafting.js';

export default async function (ctx) {
  const { T, g, S, w, p, adv, craft, plan, toI, toK, UPGRADES } = ctx;
  const X = kit(ctx), K = X.K, C = 0.6;
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { X.clean(); } });
  const LI = () => toI(-6), LK = () => toK(3);
  const text = (e) => infoFor(g, { kind: 'mach', id: e.id }).lines.join(' | ');
  const plushIn = (i0, k0, j0, j1, n = 10, pad = 3) => { let c = 0; for (let k = k0 - pad; k < k0 - pad + n; k++) for (let i = i0 - pad; i < i0 - pad + n; i++) for (let j = j0; j <= j1; j++) if (w().get(i, j, k)) c++; return c; };
  const frameAt = (L0, j0) => X.frame(L0, j0);

  await guard('elev.places-in-a-dug-opening-on-the-floor-or-a-pad-and-never-digs', async () => {
    X.setup(); const bad = [], i = LI(), k = LK();
    const r = await K.put('plift', i, k, { y: 0.0, back: 3.2 }); if (!r.ok) return 'elevator: ' + r.why; const E = r.made[0];
    if (E.type !== 'plift' || E.i0 !== i - 1 || E.k0 !== k - 1 || E.j !== 0 || E.cy !== 0 || E.rid !== 'plift' || E.tr !== 0 || E.ex !== 0) bad.push('elevator ent ' + JSON.stringify(E));
    if (S().items.plift) bad.push('item not used');
    // only the cab's own box is reserved, never the shaft below it (a collapse must be able to fill a shaft)
    for (const [j, want] of [[0, true], [3, true], [4, false]]) if (X.reservedAt(E.i0 + 1, j, E.k0 + 2) !== want) bad.push(`reserved at row ${j} is ${!want}`);
    // a second cab on the first is refused
    craft('plift', 1); K.equip('plift'); K.aim(i, k, { y: 0.0, back: 3.2 }); let pl = await plan(); if (pl.ok || !/in the way/.test(pl.why)) bad.push('a cab on a cab: ' + (pl.ok ? 'allowed' : pl.why));
    X.decon(E); if (X.reservedAt(E.i0, 0, E.k0) || S().items.plift !== 2) bad.push('the hammer left reserved cells or kept the item: ' + JSON.stringify(S().items));
    // plush in the opening: dig first. Plush over the opening (the roof) is fine: the opening is 4 high.
    K.aim(i, k, { y: 0.0, back: 3.2 }); w().setCell(i, 2, k, 2, 0); pl = await plan(); if (pl.ok || !/Dig out 1/.test(pl.why)) bad.push('plush in the opening: ' + (pl.ok ? 'ok' : pl.why)); w().setCell(i, 2, k, 0, 0);
    w().setCell(i + 2, 4, k, 2, 0); pl = await plan(); if (!pl.ok) bad.push('a roof over the opening was refused: ' + pl.why); w().setCell(i + 2, 4, k, 0, 0);
    // on a pad: it snaps to the pad and stands on top of it
    const pd = await K.put('pad:timber', i - 10, k, { y: 0.6, back: 2.6 }); if (!pd.ok) return 'pad: ' + pd.why; const P0 = pd.made[0];
    craft('plift', 1); K.equip('plift'); K.aim(P0.i0 + 1, P0.k0 + 1, { y: 0.6, back: 3.0 }); pl = await plan(); if (!pl.ok) return 'elevator on a pad: ' + pl.why;
    if (pl.ent.i0 !== P0.i0 || pl.ent.k0 !== P0.k0 || pl.ent.j !== 1) bad.push('did not snap to the pad: ' + JSON.stringify(pl.ent)); g.placeCurrent(g.curTool()); const E2 = X.ents('plift')[0]; if (!E2 || E2.cy !== 0.6) bad.push('home height on a pad ' + (E2 && E2.cy));
    // the host re-checks what a guest sends
    for (const [name, e] of [['float', { i0: 1.5, k0: 3, j: 0 }], ['string', { i0: '4', k0: 3, j: 0 }], ['no way to stand', { i0: i + 20, k0: k, j: 20 }], ['nothing', null], ['the hall roof', { i0: i + 20, k0: k, j: 70 }]]) if (!TR.conflictLift(g, e)) bad.push(name + ' was allowed');
    if (!/not the right item/.test(TR.conflictLift(g, { i0: i + 30, k0: k, j: 0 }, { id: 'jump' }) || '')) bad.push('the wrong item for an elevator was not refused');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.set-at-the-mouth-of-a-dug-shaft-it-needs-a-floor-beside-it', async () => {
    X.setup(); const bad = [], i0 = LI(), k0 = LK();
    X.block(i0, k0, 30); X.dig(i0, k0, 10, 23);   // a shaft already dug from row 10 to the opening at 20 to 23
    if (!/No way to stand/.test(TR.conflictLift(g, { i0, k0, j: 20 }) || '')) bad.push('a cab hung over a shaft with no floor beside it was allowed: ' + TR.conflictLift(g, { i0, k0, j: 20 }));
    X.tunnel({ i0, k0 }, 20, 0, 6);   // a tunnel floor beside the opening
    const why = TR.conflictLift(g, { i0, k0, j: 20 }); if (why) bad.push('a cab at the mouth of a shaft with a floor beside it was refused: ' + why);
    const L0 = X.make('plift', { i0, k0, j: 20, cy: 12, tg: null, q: [], dw: 0, dr: 1, tr: 0, ex: 0, rid: 'plift' }); TR.refreshShaft(g, L0);
    if (L0.tr !== 10 || L0.wr !== 9) bad.push(`the scan below the opening: tr ${L0.tr} stopped at row ${L0.wr}`);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.you-dig-the-tube-and-the-rails-run-out-down-it-by-themselves', async () => {
    X.setup(); const bad = [], L0 = X.lift(LI(), LK(), { home: 24, depth: 0, top: 40, frames: false, run: false }); X.powerCab(L0, 2); adv(0.7);
    if (L0.tr !== 0 || TR.floorsOf(g, L0).join() !== '24' || !/No shaft yet/.test(text(L0))) bad.push(`before digging: tr ${L0.tr} stops ${TR.floorsOf(g, L0)} text ${text(L0).slice(0, 300)}`);
    const n0 = plushIn(L0.i0, L0.k0, 0, 40); X.shaftDig(L0, 16); const dug = n0 - plushIn(L0.i0, L0.k0, 0, 40);
    if (dug !== 8 * 16) bad.push('the test dug ' + dug);
    adv(0.7); if (L0.tr !== 8) bad.push('after digging 8 rows tr is ' + L0.tr); if (!(L0.ex > 0 && L0.ex < 8) || !L0.xt) bad.push(`the rails are not running out: ex ${L0.ex} xt ${L0.xt}`);
    if (TR.kwOf(L0) !== 6) bad.push('the rails running out under power draw ' + TR.kwOf(L0)); if (TR.floorsOf(g, L0).join() !== '24') bad.push('a stop appeared before the rails got there: ' + TR.floorsOf(g, L0));
    adv(2.0); if (L0.ex !== 8 || L0.xt) bad.push(`the rails did not finish: ex ${L0.ex} xt ${L0.xt}`); if (TR.floorsOf(g, L0).join() !== '16,24') bad.push('stops ' + TR.floorsOf(g, L0)); if (TR.kwOf(L0) !== 0) bad.push('an idle elevator draws ' + TR.kwOf(L0));
    if (!/Reach: 4\.8 m below the home stop at 14\.4 m/.test(text(L0))) bad.push('readout: ' + text(L0).slice(0, 400));
    // the elevator never digs: only what the player dug is gone, and the opening and the shaft hold no extra plush
    if (n0 - plushIn(L0.i0, L0.k0, 0, 40) !== dug) bad.push('the elevator dug plush');
    // a deeper dig: the rails run out again, and the stop moves down
    X.shaftDig(L0, 13); adv(0.7); if (L0.tr !== 11) bad.push('the dig of 3 more rows: tr ' + L0.tr);   // 11 rows, then the tunnel rule says no more without a frame (the next test)
    adv(3.0); if (TR.floorsOf(g, L0).join() !== '13,24') bad.push('stops after the deeper dig: ' + TR.floorsOf(g, L0));
    // the guide rails of the mesh follow the reach
    const rails = g.machines.items.get(L0.id).obj.getObjectByName('rails'); const hs = []; rails.traverse((c) => { if (c.name === 'rail') hs.push(c.scale.y); });
    if (hs.length !== 4 || Math.abs(hs[0] - (11 + 4) * C) > 0.01) bad.push('rail heights ' + hs.map((h) => h.toFixed(2)));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.support-rule-an-unshored-stretch-is-refused-and-the-text-says-where', async () => {
    X.setup(); const bad = [], L0 = X.lift(LI(), LK(), { home: 24, depth: 14, top: 40, frames: false }); X.powerCab(L0, 2); adv(0.7);
    // the pile is 40 cells high around it: an unframed stretch may run SAFE_LEN 12 less 1 (one cell of it per 14 of pile above) = 11 rows from the nearest anchor, the home opening
    if (TR.shaftLimit(g, L0, 13) !== 11) bad.push('the limit at row 13 is ' + TR.shaftLimit(g, L0, 13));
    if (L0.tr !== 11 || L0.wy !== 'unsupported' || L0.wr !== 12) bad.push(`the scan: tr ${L0.tr} why ${L0.wy} at row ${L0.wr} (want 11, unsupported, 12)`);
    if (TR.floorsOf(g, L0).join() !== '13,24') bad.push('stops ' + TR.floorsOf(g, L0));
    let t = text(L0); if (!/not shored below 7\.8 m: no frame is near enough to 7\.2 m/.test(t)) bad.push('the readout does not say where: ' + t.slice(0, 500));
    const r = TR.requestFloor(g, L0, 10); if (!/not shored below 7\.8 m/.test(r)) bad.push('a call to a stretch that is not shored: ' + r);
    // the cab goes to the lowest shored stop and rides no further; the key from there says why
    L0.cy = 13 * C; L0.tg = null; if (!/not shored/.test(TR.rideGo(g, L0, -1) || '')) bad.push('down at the lowest stop does not say why: ' + TR.rideGo(g, L0, -1));
    // a frame stacked in the shaft shores it: the whole tube is served and the cause is just the bottom of the dig
    frameAt(L0, 10); adv(0.7); if (L0.tr !== 14 || L0.cut) bad.push(`after a frame at row 10: tr ${L0.tr} cut ${L0.cut}`); if (TR.floorsOf(g, L0).join() !== '10,24' && L0.ex < 14) { adv(4); } if (TR.floorsOf(g, L0).join() !== '10,24') bad.push('stops after the frame ' + TR.floorsOf(g, L0));
    // a support that is about to buckle (100% load) holds nothing
    const fr = w().supports.find((s) => s.kind === 'timber'); fr.load = 1.1; adv(0.7); if (L0.tr !== 11) bad.push('a frame at 110% still shored the shaft: tr ' + L0.tr);
    fr.load = 0.5; adv(0.7); if (L0.tr !== 14) bad.push('a frame at 50% did not shore it: tr ' + L0.tr); if (L0.sl !== 50 || !/busiest frame near the shaft carries 50%/.test(text(L0))) bad.push('the shoring load is not shown: sl ' + L0.sl);
    // the hammer takes the frame down: the shaft is unshored again, the rails draw in at once and a cab below it goes back up
    L0.cy = 10 * C; L0.tg = null; L0.ex = 14; const fe = S().entities.find((e) => e.type === 'frame'); X.decon(fe); w().supports = w().supports.filter((s) => s.id !== fe.id); adv(0.7);
    if (L0.tr !== 11) bad.push(`without the frame: tr ${L0.tr}`); adv(2.0); if (Math.abs(L0.cy - 13 * C) > 1e-6) bad.push('the cab below the shored part did not go back to its lowest stop: ' + L0.cy); adv(0.7); if (L0.ex !== 11) bad.push('the rails did not draw in once the cab was clear of them: ' + L0.ex);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.support-rule-follows-the-tunnel-rule-depth-and-tamping', async () => {
    X.setup(); const bad = [], w0 = w(), mk = (xm, zm, j) => ({ id: 0, i0: toI(xm), k0: toK(zm), j });
    const near = mk(-6, 3, 24), far = mk(700, 0, 24), farther = mk(3000, 0, 24);
    // near the bay under 40 cells of pile: 12 - floor(over / 14); far out the pile is the whole 72 cells and the distance costs 2 per 330 m past 40 m
    X.block(near.i0, near.k0, 40); const a = TR.shaftLimit(g, near, 20); if (a !== 12 - Math.floor((40 - 20 - 1) / 14)) bad.push('near the bay the limit at row 20 is ' + a);
    const b = TR.shaftLimit(g, far, 20); if (b !== 12 - Math.floor((72 - 20 - 1) / 14) - 2 * w0.depthPenalty(far.i0 + 2, far.k0 + 2)) bad.push('700 m out the limit at row 20 is ' + b + ' (want ' + (12 - 3 - 4) + ')');
    if (!(b < a)) bad.push('the limit does not shrink with the distance');
    if (TR.shaftLimit(g, farther, 20) !== 3) bad.push('very deep the limit is not the 3 row floor: ' + TR.shaftLimit(g, farther, 20));
    // Pile Tamping (stabBonus) adds 2 rows per level
    const tb = w0.stabBonus; try { w0.stabBonus = tb + 1; if (TR.shaftLimit(g, near, 20) !== a + 2) bad.push('tamping did not add 2 rows: ' + TR.shaftLimit(g, near, 20)); } finally { w0.stabBonus = tb; }
    // far out the pile is solid: a cab set there with no opening is told so
    const L1 = X.make('plift', { i0: far.i0, k0: far.k0, j: 24, cy: 14.4, tg: null, q: [], dw: 0, dr: 1, tr: 0, ex: 0, rid: 'plift' }); const hp = TR.scanShaft(g, L1);
    if (hp.wy !== 'home') bad.push('a cab in solid pile far out should say the opening is blocked: ' + hp.wy);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.travel-range-is-the-clear-shored-length-capped-per-tier', async () => {
    X.setup(); const bad = [], L0 = X.lift(LI(), LK(), { home: 50, depth: 46, top: 58 });   // a 46 row shaft (27.6 m) with a stack of frames the whole way
    if (g.T.hoistCap !== 24) bad.push('the first tier cap is ' + g.T.hoistCap);
    if (L0.tr !== 40 || L0.wy !== 'cap' || L0.wr !== 9) bad.push(`tier 1: tr ${L0.tr} why ${L0.wy} row ${L0.wr} (want 40 rows = 24 m, cap, 9)`);
    let t = text(L0); if (!/this tier 24 m/.test(t) || !/Deep Hoistways/.test(t)) bad.push('the readout does not name the cap: ' + t.slice(0, 500));
    if (/dig it deeper/.test(t)) bad.push('a capped shaft told the player to dig deeper');
    // the second tier: the whole shaft (the hall is 43.2 m, so it is the hall that ends it)
    S().up.transitHoist = 1; g.T = g.tune(); if (g.T.hoistCap !== 64) bad.push('the second tier cap is ' + g.T.hoistCap);
    adv(0.7); if (L0.tr !== 46 || L0.wy === 'cap') bad.push(`tier 2: tr ${L0.tr} why ${L0.wy}`);
    // dug to the hall floor: the elevator reaches it and says so
    const L2 = X.lift(LI() + 14, LK(), { home: 50, depth: 50, top: 58 }); adv(0.7); if (L2.tr !== 50 || L2.wy !== 'floor' || !/floor of the hall/.test(text(L2))) bad.push(`to the floor of the hall: tr ${L2.tr} why ${L2.wy}`);
    // no upgrade and no cap data (a test, an old game): the first tier
    delete S().up.transitHoist; g.T = g.tune(); delete g.T.hoistCap; if (TR.hoistCap(g) !== 24) bad.push('the default cap is ' + TR.hoistCap(g));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.landings-wherever-a-side-tunnel-or-a-pad-opens-into-the-shaft', async () => {
    X.setup(); const bad = [], L0 = X.lift(LI(), LK(), { home: 30, depth: 24, top: 40 });
    X.tunnel(L0, 30, 1, 6); X.tunnel(L0, 18, 0, 8); X.ledge(L0, 12, 2);
    // a low tunnel (only 2 rows high) is not a landing: nobody can walk it
    for (let d = 0; d < 5; d++) for (let u = 0; u < 4; u++) for (let r = 22; r < 24; r++) X.poke(L0.i0 + 4 + d, r, L0.k0 + u, 0, 0);
    adv(0.7); TR.refreshShaft(g, L0); L0.ex = L0.tr; adv(0.1);
    const sg = L0.sg.map((s) => s.join(':')).join(' '); if (sg !== '6:-1:0 12:2:1 18:0:1 30:1:1') bad.push('stops (row:side:u) ' + sg + ', want the bottom, a pad ledge on the west side, a tunnel on the east and the home landing on the south');
    if (TR.floorsOf(g, L0).join() !== '6,12,18,30') bad.push('floors ' + TR.floorsOf(g, L0));
    if (TR.landingAt(g, L0, 22)) bad.push('a 2 high tunnel counted as a landing'); if (TR.landingAt(g, L0, 24)) bad.push('a wall counted as a landing');
    // every landing has a call panel in the world (none at the bottom: it is a dead end)
    const it = g.machines.items.get(L0.id); const panels = it.obj.getObjectByName('panels'); if (!panels || panels.children.length !== 3) bad.push('call panels: ' + (panels && panels.children.length));
    const pp = TR.panelPos(L0, 0, 1); if (!panels || !panels.children.some((c) => Math.abs(c.position.y - 18 * C) < 1e-6 && Math.abs(c.position.x + L0.px - pp.x) < 1e-6)) bad.push('the panel for the east landing is not where it should be');
    // the readout and the pick: aim at a landing's panel and the readout names the landing
    const row = 18, eye = new ctx.V3(pp.x + 1.3, row * C + 1.2, pp.z), dir = new ctx.V3(pp.x - eye.x, row * C + 0.8 - eye.y, 0).normalize();
    const pk = TR.pick(g, eye, dir, 3.6); if (!pk || pk.ent.id !== L0.id || pk.row !== 18) bad.push('the pick did not find the panel: ' + JSON.stringify(pk && { id: pk.ent.id, row: pk.row }));
    if (!/Landing at 10\.8 m: E calls the cab here/.test(text(L0))) bad.push('the readout does not name the landing the player aims at: ' + text(L0).slice(0, 200));
    g.time += 1; if (/Landing at/.test(text(L0))) bad.push('the landing line stayed after the player looked away');
    // looking at the cab itself finds the cab and no panel row
    const pk2 = TR.pick(g, new ctx.V3(L0.px + 3, 30 * C + 1.0, L0.pz), new ctx.V3(-1, 0, 0), 4); if (!pk2 || pk2.row !== undefined) bad.push('the cab pick ' + JSON.stringify(pk2 && pk2.row));
    // a landing is read from the world: dig the tunnel's floor away and the stop goes
    for (let d = 0; d < 8; d++) for (let u = 0; u < 4; u++) X.poke(L0.i0 + 4 + d, 17, L0.k0 + u, 0, 0); adv(0.7); if (TR.floorsOf(g, L0).includes(18)) bad.push('a landing without ground under it stayed');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.the-shaft-is-held-for-the-build-rules-but-never-reserved', async () => {
    X.setup(); const bad = [], L0 = X.lift(LI(), LK(), { home: 24, depth: 12, top: 36 }), L = () => g.logi;
    for (const j of [12, 18, 23, 27]) if (!L().cellTaken(L0.i0 + 1, j, L0.k0 + 2)) bad.push('row ' + j + ' of the cab and shaft is free to build in');
    for (const j of [11, 28]) if (L().cellTaken(L0.i0 + 1, j, L0.k0 + 2)) bad.push('row ' + j + ' outside the shaft is taken');
    if (L().cellTaken(L0.i0 + 4, 18, L0.k0 + 1)) bad.push('a cell beside the shaft is taken');
    for (const j of [12, 18, 23]) if (X.reservedAt(L0.i0 + 1, j, L0.k0 + 2)) bad.push('the shaft at row ' + j + ' is reserved: a collapse could not fill it');
    if (!X.reservedAt(L0.i0 + 1, 24, L0.k0 + 2) || !X.reservedAt(L0.i0 + 1, 27, L0.k0 + 2) || X.reservedAt(L0.i0 + 1, 28, L0.k0 + 2)) bad.push('the cab box rows 24 to 27 are not the reserved ones');
    // plush that falls into the shaft is plain plush: the scan finds it
    w().setCell(L0.i0 + 1, 17, L0.k0 + 2, 2, 0); adv(0.7); if (L0.tr !== 6) bad.push('plush at row 17 did not shorten the reach to 6 rows: ' + L0.tr);
    // a belt in the shaft blocks it just the same
    w().setCell(L0.i0 + 1, 17, L0.k0 + 2, 0, 0); adv(0.7); if (L0.tr !== 12) bad.push('the reach did not come back: ' + L0.tr);
    g.logi.add({ id: g.nextId(), type: 'belt', i: L0.i0 + 2, j: 20, k: L0.k0 + 1, dir: 0, rise: 0, items: [] }); adv(0.7); if (L0.tr !== 3 || !L0.cut) bad.push(`a belt in the shaft: tr ${L0.tr} cut ${L0.cut}`);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.stale-air-and-the-shaft-depth-are-in-the-readout', async () => {
    X.setup(); const bad = [], far = X.make('plift', { i0: toI(700), k0: toK(0), j: 24, cy: 14.4, tg: null, q: [], dw: 0, dr: 1, tr: 0, ex: 0, rid: 'plift' }), near = X.make('plift', { i0: LI(), k0: LK(), j: 0, cy: 0, tg: null, q: [], dw: 0, dr: 1, tr: 0, ex: 0, rid: 'plift' });
    const tf = text(far), tn = text(near);
    if (!/Air at 70\d m out: 61% stale, hang a Support Fan on a shaft frame/.test(tf)) bad.push('far out: ' + tf.slice(0, 600)); if (!/Air at this distance is still fresh/.test(tn)) bad.push('near the bay: ' + tn.slice(0, 600));
    if (/[—–]|undefined|NaN/.test(tf + tn)) bad.push('bad text');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.bench-row-unlock-and-the-old-call-button', async () => {
    X.setup(); const bad = [], rows = recipes(g).filter((r) => /^(plift|callbtn)/.test(r.id));
    if (rows.map((r) => r.id).join() !== 'plift') bad.push('bench rows ' + rows.map((r) => r.id)); const r0 = rows[0]; if (!r0 || r0.name !== 'Elevator' || !/hollow/.test(r0.use || '')) bad.push('row ' + JSON.stringify(r0 && { n: r0.name }));
    const m0 = S().money; craft('plift', 1); const paid = m0 - S().money; if (paid !== 900000) bad.push('an elevator costs ' + paid + ', want 900,000 (10M wallets)');
    // Deep Hoistways is the second tier: 60M, needs Elevators, and no maxed-it flag
    const dh = UPGRADES.find((u) => u.id === 'transitHoist'); if (!dh || dh.cost[0] !== 60000000 || !dh.req || dh.req.id !== 'transitLift' || dh.fresh) bad.push('Deep Hoistways: ' + JSON.stringify(dh && { cost: dh.cost, req: dh.req }));
    // a call button cannot be set any more: landings have panels
    const why = TR.planCall().plan.why; if (!/built in/.test(why)) bad.push('planCall: ' + why); if (!/built in/.test(TR.conflictCall(g, {}))) bad.push('conflictCall'); if (TR.buildCall(g, {}, {}) !== null) bad.push('buildCall built one');
    return bad.length === 0 || bad.join(' || ');
  });
}
