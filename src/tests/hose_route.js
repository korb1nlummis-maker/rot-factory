// hose.route.* and belts.route-*: the Satisfactory style laying mode, for hoses and for belts. A left click with a belt or a hose in hand anchors a route (at the open end of a line if
// you aim at one), the preview shows the whole curved route to where you aim with its length and cost and turns gold when its end feeds a bin, the next click lays all of it and
// carries on from its end, Q or right click puts it down. The Line Planner (the period key) and hold B stay as they were, and both work with hoses.
import { makeHoseKit } from './hose_lib.js';
import * as BP from '../beltplan.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { g, S, L, adv, cellX, cellZ, toI, toK, tiles } = ctx;
  const H = makeHoseKit(ctx), B = H.B, T = B.T, io = H.io;
  const bad = (a) => a.length === 0 || a.join('; ');
  const done = () => { g.bplan = null; g.machines.setGhost(null); g.plan = null; };
  const ghostMeshes = () => { let n = 0; if (g.machines.ghost) g.machines.ghost.traverse((m) => { if (m.isMesh) n++; }); return n; };

  await T('hose.route.the-line-planner-lays-a-hose-line-and-charges-the-shortfall-at-the-hose-price', async () => {
    H.setup(10); const b = [], price = 6 * 3; io.tap('Period'); if (!g.bplan || !g.bplan.on) return 'the period key did not turn the planner on for a hose';
    let pl = await H.aim(0, 0, 0); if (!pl || !pl.planner || !pl.ok) return 'no start plan: ' + (pl && pl.why); io.tap('KeyB'); if (!g.bplan.start) return 'B did not set the start';
    pl = await H.aim(9, -4, 0); if (!pl || !pl.ok || !pl.hose || pl.route.tiles.length !== 14) return 'route: ' + JSON.stringify([pl && pl.ok, pl && pl.why, pl && pl.route && pl.route.tiles.length]);
    if (Math.abs(pl.route.tiles.length - 14) || !/Vacuum Hose, 14 pieces \(8\.4 m\)/.test(io.hintHtml().replace(/<[^>]+>/g, ''))) b.push('hint: ' + io.hint());
    if (pl.route.tiles.some((t) => t.rise || t.u)) b.push('a hose route has ramps or an underground'); if (ghostMeshes() < 14) b.push('the route ghost has ' + ghostMeshes() + ' meshes');
    const m0 = S().money, n0 = S().items.hose; io.tap('KeyB'); adv(0.05);
    const hs = H.hoses(); if (hs.length !== 14) b.push('hoses laid ' + hs.length); if (hs.some((t) => t.tier || t.rise || !t.hose)) b.push('a laid piece is not a plain hose');
    if (Math.abs((m0 - S().money) - 4 * price) > 1e-6) b.push(`paid ${m0 - S().money}, wanted ${4 * price} for 4 hoses`); if ((S().items.hose || 0) !== 0 || n0 !== 10) b.push('hose stock ' + n0 + ' -> ' + S().items.hose);
    if (H.mouths().length !== 1) b.push('mouths ' + H.mouths().length); if (g.bplan.start) b.push('the start was kept after laying');
    // R never offers an underground for a hose
    H.setup(30); io.tap('Period'); await H.aim(0, 0, 0); io.tap('KeyB'); for (let q = 0; q < 7; q++) { io.tap('KeyR'); pl = await H.aim(8, 0, 0); if (g.bplan.variant > 2 || (pl.route && pl.route.tiles.some((t) => t.u))) b.push('R offered shape ' + g.bplan.variant); }
    io.tap('Period'); return bad(b);
  });

  await T('hose.route.a-click-anchors-the-whole-route-the-next-click-lays-it-and-it-carries-on', async () => {
    H.setup(40); const b = [];
    let pl = await H.aim(0, 0, 0); io.click(0); if (!g.bplan || !g.bplan.on || !g.bplan.click || !g.bplan.start) return 'a click did not anchor a route: ' + io.hint();
    if (!/Route started/.test(io.hint())) b.push('anchor hint: ' + io.hint());
    pl = await H.aim(8, -3, 0); if (!pl || !pl.ok || !pl.planner || pl.route.tiles.length !== 12) return 'route: ' + JSON.stringify([pl && pl.ok, pl && pl.why, pl && pl.route && pl.route.tiles.length]);
    const hint = io.hint(); if (!/Click lay the route: Vacuum Hose, 12 pieces \(7\.2 m\)/.test(hint) || !/uses 12 you hold/.test(hint) || !/Auto \(/.test(hint) || !/Q.*cancel/.test(hint)) b.push('hint: ' + hint);
    if (S().entities.some((e) => e.hose)) b.push('a hose was laid before the second click');
    io.click(0); adv(0.05); const hs = H.hoses(); if (hs.length !== 12) b.push('the second click laid ' + hs.length);
    if (H.mouths().length !== 1 || L().bendN !== 1) b.push(`one hose: mouths ${H.mouths().length}, bends ${L().bendN}`);
    // it carries on from the open end, going on the way the last piece faces
    const s = g.bplan; if (!s.on || !s.start || !s.start.cont || s.start.i !== H.o.i + 8 || s.start.k !== H.o.k - 4) b.push('no carry on from the end: ' + JSON.stringify(s.start));
    pl = await H.aim(8, -10, 0); if (!pl || !pl.ok || pl.route.tiles.length !== 7) b.push('second stretch ' + JSON.stringify([pl && pl.ok, pl && pl.why, pl && pl.route && pl.route.tiles.length])); io.click(0); adv(0.05);
    if (H.hoses().length !== 19 || H.mouths().length !== 1) b.push(`after two stretches: ${H.hoses().length} pieces, ${H.mouths().length} mouths`);
    const m = H.mouths()[0]; if (m && H.follow(m) !== 19) b.push('not one line: ' + H.follow(m));
    done(); return bad(b);
  });

  await T('hose.route.q-and-right-click-put-the-route-down-before-they-stow-or-punch', async () => {
    H.setup(20); const b = []; let punches = 0; const realPunch = g.punch; g.punch = function () { punches++; return realPunch.apply(this, arguments); };
    await H.aim(0, 0, 0); io.click(0); if (!g.bplan.start) return 'no anchor';
    io.tap('KeyQ'); if (g.bplan.start || g.bplan.on) b.push('Q did not cancel the route'); if (g.stowed) b.push('Q stowed the tool instead of cancelling'); if (!/cancelled/i.test(io.hint())) b.push('hint: ' + io.hint());
    io.tap('KeyQ'); if (!g.stowed) b.push('a second Q did not stow the tool'); io.tap('KeyQ'); if (g.stowed) b.push('a third Q did not take it out again');
    await H.aim(0, 0, 0); io.click(0); if (!g.bplan.start) return 'no second anchor'; io.click(2); adv(0.05); if (g.bplan.start || g.bplan.on) b.push('right click did not cancel the route'); if (punches) b.push('right click punched while a route was anchored');
    // another tool ends the laying mode too
    await H.aim(0, 0, 0); io.click(0); ctx.selectTool('hammer'); adv(0.1); await ctx.plan(); if (g.bplan.on || g.bplan.start) b.push('the hammer did not end the route'); H.K.equip('hose');
    // with no route Q stows as it always did
    io.tap('KeyQ'); if (!g.stowed) b.push('Q with no route did not stow'); io.tap('KeyQ');
    g.punch = realPunch; done(); return bad(b);
  });

  await T('hose.route.the-route-turns-gold-when-its-end-feeds-the-bin-and-says-stop', async () => {
    H.setup(40); const b = [], bp = H.bin(), k = toK(bp.z);
    await H.aimAt(toI(bp.x - 6.0), k, 0); io.click(0); if (!g.bplan.start) return 'no anchor';
    let pl = await H.aimAt(toI(bp.x - 1.8), k, 0);
    if (!pl.ok) return 'no route to the bin: ' + pl.why; if (!pl.gold) b.push('the route to the bin is not gold'); if (!/This end feeds the bin: stop here/.test(io.hint())) b.push('hint: ' + io.hint());
    if (pl.end.note !== 'feeds the bin') b.push('snap: ' + JSON.stringify(pl.end));
    pl = await H.aimAt(toI(bp.x - 6.0), k + 8, 0); if (pl.gold || /stop here/.test(io.hint())) b.push('a route away from the bin is gold');
    await H.aimAt(toI(bp.x - 1.8), k, 0); io.click(0); adv(0.05); L().refreshSinks(5);
    if (L().goldRing.count !== 1) b.push('gold rings after laying ' + L().goldRing.count); if (g.bplan.on || g.bplan.start) b.push('the route carried on after it fed the bin');
    done(); return bad(b);
  });

  await T('belts.route-a-click-lays-a-belt-route-from-the-open-end-of-a-line-in-its-direction', async () => {
    B.setup(); H.setup(0); const b = [], i = H.o.i, k = H.o.k; S().items.belt = 0; ctx.craft('belt', 30); H.K.equip('belt');
    B.lay(0, 3, i, k, 0); H.rebuild();
    // aim at the last belt: the route starts in the cell in front of it, going its way
    await H.aim(2, 0, 0); io.click(0); const s = g.bplan; if (!s || !s.start || !s.start.cont || s.start.i !== i + 3 || s.start.dir !== 0) return 'no anchor at the open end: ' + JSON.stringify(s && s.start);
    let pl = await H.aim(8, -4, 0); if (!pl.ok || pl.route.tiles[0].i !== i + 3 || pl.route.tiles[0].dir !== 0) b.push('the route does not carry on east: ' + JSON.stringify(pl.route && pl.route.tiles[0]));
    // aiming behind the line: the route does not turn back on the belt, it turns away at once
    pl = await H.aim(-3, -4, 0); if (!pl.ok || ((pl.route.tiles[0].dir + 2) & 3) === 0) b.push('the route turns back on the line: ' + JSON.stringify([pl.ok, pl.why, pl.route.tiles[0]]));
    pl = await H.aim(8, -4, 0); const n0 = tiles().filter((t) => t.type === 'belt' && !t.free).length; io.click(0); adv(0.05); const n1 = tiles().filter((t) => t.type === 'belt' && !t.free).length; if (n1 - n0 !== pl.route.tiles.length) b.push(`laid ${n1 - n0} of ${pl.route.tiles.length}`);
    const first = L().tileAt(i + 3, 0, k); if (!first || first.hose || first.dir !== 0) b.push('the first belt of the route is wrong'); if (L().cornerN < 1) b.push('no corner drawn');
    // R makes the shape yours: it stops choosing
    io.tap('KeyR'); if (!g.bplan.manual) b.push('R did not make the shape manual');
    done(); return bad(b);
  });

  await T('belts.route-the-preview-draws-arcs-at-the-corners-and-the-length-and-cost-in-the-hint', async () => {
    B.setup(); H.setup(0); const b = []; ctx.craft('belt', 3); H.K.equip('belt');
    await H.aim(0, 0, 0); io.click(0); const pl = await H.aim(6, 4, 0); if (!pl.ok) return pl.why;
    const hint = io.hint(); if (!/Click lay the route: Mk1, 11 tiles \(6\.6 m\)/.test(hint) || !/uses 3 you hold, buys 8 more for/.test(hint)) b.push('hint: ' + hint);
    // 11 tiles, one of them a corner drawn as a curved deck (beltgeo.js, the one the placed corner has): 10 flat beds + 1 curved deck + 11 arrows (+ no blocked boxes)
    const boxes = [], decks = []; g.machines.ghost.traverse((m) => { if (m.isMesh && m.geometry.type === 'BoxGeometry') boxes.push(m); else if (m.isMesh && m.geometry.type === 'BufferGeometry' && m.geometry.attributes.uv) decks.push(m); }); if (boxes.length !== 10 || decks.length !== 1) b.push(`bed boxes ${boxes.length}, curved decks ${decks.length}`);
    done(); return bad(b);
  });

  await T('belts.route-hold-b-and-sweep-the-mouse-lays-one-connected-belt-line', async () => {
    B.setup(); H.setup(0); const b = []; ctx.craft('belt', 40); H.K.equip('belt');
    await H.hold([[0, 0], [1, 0], [2, 1], [3, 1], [5, 1], [6, 3], [7, 4]], 0);
    const bl = tiles().filter((t) => t.type === 'belt' && !t.free); const used = 40 - (S().items.belt || 0); if (used !== bl.length) b.push(`used ${used} belts for ${bl.length} tiles`);
    let starts = 0; for (const t of bl) { H.rebuild(); if (!t.fed) starts++; } if (starts !== 1) b.push('line starts ' + starts);
    for (const [di, dk] of [[0, 0], [3, 1], [5, 1], [7, 4]]) if (!H.tileAt(di, dk)) b.push(`no belt at ${di},${dk}`);
    // a plain press does not bridge for a belt (only a hose does)
    H.setup(0); ctx.craft('belt', 10); H.K.equip('belt'); await H.put(0, 0, 0); await H.put(4, 0, 0); if (tiles().filter((t) => t.type === 'belt' && !t.free).length !== 2) b.push('a single press bridged for a belt');
    return bad(b);
  });

  await T('belts.route-a-belt-set-behind-the-start-of-a-line-faces-into-it-only-when-you-face-away', async () => {
    B.setup(); H.setup(0); const b = []; ctx.craft('belt', 12); H.K.equip('belt');
    await H.put(5, 0, 0); await H.put(4, 0, 2); const t = H.tileAt(4, 0); if (!t || t.dir !== 0) b.push('a belt placed behind the start facing away does not face into it: ' + (t && t.dir));
    // building on (the piece you laid last): the next one beside it, facing a new way, bends into it
    await H.put(4, -1, 3); const w = H.tileAt(4, -1); if (!w || w.dir !== 1) b.push('the piece beside the one you just laid does not feed it: ' + (w && w.dir));
    // a line of its own, laid later beside the start of an old one, is left alone
    adv(20); await H.put(5, 3, 0); adv(20); await H.put(4, 3, 3); const u = H.tileAt(4, 3); if (!u || u.dir !== 3) b.push('a new line beside another was pulled into it: ' + (u && u.dir));
    return bad(b);
  });

  await T('hose.route.guard-leaves-nothing-behind', async () => { done(); H.B.cleanup(); return BP.plannerOn(g, { kind: 'belt', id: 'hose', hose: true }) === false || 'planner state left on'; });
  void cellX; void cellZ; void infoFor;
}
