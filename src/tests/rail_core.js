// rail.*: Mine Rail track, stations and carts (src/rail.js, src/catalog_rail.js): the unlock, laying track, joining, turns, junctions, slopes, the hammer and the readouts.
import { makeRail, UP } from './rail_lib.js';
import { PARTS, CONFLICTS } from '../catalog.js';
import { CONTROLS, RESERVED_KEYS } from '../controls.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, adv, V3, craft, selectTool, plan, fresh, recipes, toI, toK, cellX, cellZ } = ctx;
  const X = makeRail(ctx), R = X.R, C = 0.6;
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { X.clean(); } });
  const hasBad = (s) => /[—–]|undefined|NaN/.test(s);

  await guard('rail.unlock-adds-three-bench-rows-at-sane-prices', async () => {
    fresh({}); let rows = recipes(g).filter((r) => ['rail', 'railstn', 'railcar'].includes(r.id)); const bad = [];
    if (rows.length) bad.push('rows before the unlock');
    fresh({ ...UP }); g.T = g.tune(); rows = recipes(g).filter((r) => ['rail', 'railstn', 'railcar'].includes(r.id));
    if (rows.length !== 3) return 'rows after the unlock: ' + rows.length;
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    if (by.rail.kind !== 'rail' || by.railstn.kind !== 'railstn' || by.railcar.kind !== 'railcar') bad.push('kinds');
    if (!(by.rail.price < by.railstn.price && by.railstn.price < by.railcar.price)) bad.push('price order ' + [by.rail.price, by.railstn.price, by.railcar.price]);
    if (R.UNLOCK_PRICE < 5e6) bad.push('the unlock must be priced for a 10M wallet');
    for (const r of rows) { const txt = [r.name, r.desc, r.use, r.statusFn(g)].join('\n'); if (hasBad(txt)) bad.push(r.id + ' text: ' + txt.slice(0, 60)); }
    const up = ctx.UPGRADES.find((u) => u.id === 'railShuttle'); if (!up || up.cost[0] !== R.UNLOCK_PRICE || hasBad(up.desc)) bad.push('upgrade entry');
    if (!PARTS.rail || CONFLICTS.some((c) => /rail/i.test(c))) bad.push('registry: ' + CONFLICTS.join(';'));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.every-bench-row-crafts-and-can-be-held', async () => {
    X.setup(); const bad = [];
    for (const id of ['rail', 'railstn', 'railcar']) { S().items[id] = 0; craft(id, 1); if (!(S().items[id] > 0)) bad.push(id + ' not crafted'); selectTool(id); const t = g.curTool(); if (t.kind !== id) bad.push(id + ' tool kind ' + t.kind); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.lay-by-aim-then-hold-b-lays-a-line', async () => {
    X.setup(); const k = X.ck(-2.2), i0 = X.ci(-12); const bad = [];
    craft('rail', 40); X.equip('rail'); const before = S().items.rail;
    X.aimAtCell(i0, k); let pl = await plan(); if (!pl || !pl.ok || pl.ent.type !== 'rail') return 'no plan: ' + JSON.stringify(pl && pl.why);
    g.placeCurrent(g.curTool()); if (X.ents('rail').length !== 1 || S().items.rail !== before - 1) bad.push('single place: ' + X.ents('rail').length);
    // hold B and walk east along the cells
    g.keys.KeyB = true; g.lastPaint = '';
    for (let n = 1; n <= 10; n++) { X.aimAtCell(i0 + n, k); const e = p().eyePos(new V3()), d = p().forward(new V3()); g.updateBuild(g.curTool(), e, d); }
    g.keys.KeyB = false;
    const got = X.ents('rail').map((e) => e.i).sort((a, b) => a - b);
    if (got.length < 11 || got[0] !== i0 || got[got.length - 1] !== i0 + 10 || got.some((v, n) => v !== i0 + n)) bad.push('line: ' + got.join(','));
    if (S().items.rail !== before - got.length) bad.push('items ' + S().items.rail + ' of ' + before + ' after ' + got.length);
    // a second try on a laid cell is refused
    X.aimAtCell(i0 + 3, k); pl = await plan(); if (pl.ok) bad.push('laid track on a laid cell');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.refuses-a-bad-floor-no-headroom-and-solid-cells', async () => {
    X.setup(); const bad = [], k = X.ck(0.5), i = X.ci(-6);
    if (R.railWhy(g, i, 1, k) !== 'Needs a floor') bad.push('floating: ' + R.railWhy(g, i, 1, k));
    w().setCell(i, 0, k, 2, 0); if (R.railWhy(g, i, 0, k) !== 'Blocked') bad.push('inside plush: ' + R.railWhy(g, i, 0, k));
    w().setCell(i, 0, k, 0, 0);
    w().setCell(i, 2, k, 2, 0); if (R.railWhy(g, i, 0, k) !== 'Needs 3 cells of headroom') bad.push('headroom: ' + R.railWhy(g, i, 0, k));
    w().setCell(i, 2, k, 0, 0);
    if (R.railWhy(g, i, 0, k)) bad.push('a clear floor cell was refused: ' + R.railWhy(g, i, 0, k));
    X.lay(i, 0, k); if (R.railWhy(g, i, 0, k) !== 'Track is already here') bad.push('double: ' + R.railWhy(g, i, 0, k));
    if (R.railWhy(g, 1.5, 0, k) !== 'Out of bounds') bad.push('float coordinates accepted');
    const belt = { id: g.nextId(), type: 'belt', i: i + 1, j: 0, k, dir: 0, rise: 0, items: [] }; S().entities.push(belt); g.addEntity(belt); if (R.railWhy(g, i + 1, 0, k) !== 'Something is in the way') bad.push('belt cell: ' + R.railWhy(g, i + 1, 0, k));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.pieces-join-turn-and-branch-into-junctions', async () => {
    X.setup(); const bad = [], k = X.ck(-2.2), i = X.ci(-10);
    X.line(i, i + 5, 0, k); X.lineZ(k + 1, k + 4, 0, i + 5);   // an east run that turns north
    const Rg = R.sync(g); const deg = (e) => Rg.adj.get(R.keyOf(e)).length / 2;
    const kc = (ii, kk) => Rg.nodes.get(require_key(ii, 0, kk));
    if (deg(kc(i, k)) !== 1 || deg(kc(i + 3, k)) !== 2 || deg(kc(i + 5, k)) !== 2 || deg(kc(i + 5, k + 4)) !== 1) bad.push('degrees ' + [deg(kc(i, k)), deg(kc(i + 3, k)), deg(kc(i + 5, k)), deg(kc(i + 5, k + 4))]);
    if (Rg.comps.length !== 1 || Rg.comps[0].n !== 10) bad.push('one line of ten, got ' + Rg.comps.map((c) => c.n));
    // a branch off the middle makes a three way junction and the pieces are one line again
    X.lineZ(k - 3, k - 1, 0, i + 2); const R2 = R.sync(g); const jn = R2.nodes.get(require_key(i + 2, 0, k));
    if (R2.adj.get(R.keyOf(jn)).length / 2 !== 3) bad.push('junction degree ' + R2.adj.get(R.keyOf(jn)).length / 2);
    if (R2.comps.length !== 1) bad.push('the branch is a separate line');
    // a cell on the far side of a gap is its own line
    X.lay(i + 12, 0, k); if (R.sync(g).comps.length !== 2) bad.push('a gap should split lines');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.slopes-join-one-cell-up-and-down', async () => {
    X.setup(); const bad = [], k = X.ck(-2.2), i = X.ci(-10);
    X.line(i, i + 3, 0, k);
    for (let n = 4; n <= 8; n++) { w().setCell(i + n, 0, k, 2, 0); }   // a raised floor of plush, one cell high
    for (let n = 4; n <= 8; n++) { const r = X.lay(i + n, 1, k); if (r.why) return 'high piece ' + r.why; }
    const Rg = R.sync(g), a = Rg.adj.get(require_key(i + 3, 0, k)), lens = a.filter((_, n) => n % 2 === 1);
    if (!lens.some((v) => Math.abs(v - Math.hypot(C, C)) < 1e-6)) bad.push('no slope edge: ' + lens);
    if (Rg.comps.length !== 1) bad.push('the climb splits the line: ' + Rg.comps.length);
    // and it is passable one way and the other (breadth first from either end)
    const lo = require_key(i, 0, k), hi = require_key(i + 8, 1, k);
    const up = R.bfs(g, Rg, lo, (q) => q === hi), down = R.bfs(g, Rg, hi, (q) => q === lo);
    if (!up || !down || up.path.length !== 8 || down.path.length !== 8) bad.push('route lengths ' + (up && up.path.length) + '/' + (down && down.path.length));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.hammer-and-aim-find-the-piece-under-the-crosshair', async () => {
    X.setup(); const bad = [], k = X.ck(-2.2), i = X.ci(-10);
    const pieces = X.line(i, i + 8, 0, k); adv(0.1);
    X.aimAtCell(i + 5, k, { back: 2.4 }); const e = p().eyePos(new V3()), d = p().forward(new V3());
    const hit = R.pickRail(g, e, d, 5); if (!hit || hit.ent.i !== i + 5) bad.push('pick found ' + (hit && hit.ent.i) + ' wanted ' + (i + 5));
    const ref = g.findDeconRef(); if (!ref || ref.kind !== 'mach' || ref.id !== pieces[5].id) bad.push('hammer ref ' + JSON.stringify(ref));
    S().items.rail = 0; g.doDecon(ref); R.invalidate(g);
    if (S().items.rail !== 1 || X.ents('rail').length !== 8 || g.world.reserved.has(R.keyOf(pieces[5]))) bad.push('hammer did not return the piece: ' + S().items.rail);
    if (g.describeRef(ref) !== null && g.describeRef({ kind: 'mach', id: pieces[4].id }) !== 'Mine Rail') bad.push('hammer name ' + g.describeRef({ kind: 'mach', id: pieces[4].id }));
    if (R.sync(g).comps.length !== 2) bad.push('cutting a piece should split the line');
    // the aim readout asks for the same piece
    X.aimAtCell(i + 2, k, { back: 2.4 }); const f = (await import('../info.js')).findInfoRef(g); if (!f || f.id !== pieces[2].id) bad.push('readout ref ' + JSON.stringify(f));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.readouts-for-track-station-and-cart', async () => {
    X.setup(); const bad = [], T0 = X.std({ power: true }); adv(0.5);
    const a = infoFor(g, { kind: 'mach', id: T0.track[3].id }), b = infoFor(g, { kind: 'mach', id: T0.base.id }), c = infoFor(g, { kind: 'mach', id: T0.car.id });
    for (const [n, r] of [['rail', a], ['station', b], ['cart', c]]) { if (!r || !r.title || !r.lines.length) { bad.push(n + ' has no readout'); continue; } if (hasBad(r.title + r.lines.join('\n'))) bad.push(n + ' text: ' + r.title + r.lines.join('|')); }
    if (a && !/MINE RAIL/.test(a.title)) bad.push('rail title ' + a.title);
    if (a && !a.lines.some((l) => /Powered: carts run at 8 m\/s/.test(l))) bad.push('rail power line: ' + a.lines.join('|'));
    if (b && (!/BASE/.test(b.title) || !b.lines.some((l) => /Powered/.test(l)))) bad.push('station: ' + b.title + b.lines.join('|'));
    if (c && !c.lines.some((l) => /0 of 120 plush/.test(l))) bad.push('cart: ' + c.lines.join('|'));
    // an unpowered line says so
    for (const t of [...L().tiles.values()]) if (t.type === 'pole' || t.type === 'gen') { L().remove(t); S().entities = S().entities.filter((x) => x.id !== t.id); }
    g.power.markDirty(); adv(0.6); const d = infoFor(g, { kind: 'mach', id: T0.track[3].id });
    if (!d.lines.some((l) => /Hand cranked/.test(l))) bad.push('unpowered rail line: ' + d.lines.join('|'));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.controls-row-is-listed-and-the-key-is-not-reserved', async () => {
    const rows = CONTROLS.flatMap((gr) => gr.rows), row = rows.find((r) => r.codes.includes('Backspace')), bad = [];
    if (!row || !/Mine Rail/.test(row.what) || hasBad(row.what)) bad.push('controls row ' + JSON.stringify(row));
    if ('Backspace' in RESERVED_KEYS) bad.push('Backspace is still reserved');
    const e = rows.find((r) => r.codes.includes('KeyE') && /Rail Cart/.test(r.what)); if (!e || hasBad(e.what)) bad.push('E row');
    const src = await (await fetch('/src/game.js')).text(); const a = src.indexOf('  onKey(e, down) {'), b = src.indexOf('  onMouse(e, down) {'); const KBm = await import('../keybinds.js'); if (!KBm.hasCode('railHome', 'Backspace') || !src.slice(a, b).includes("case 'railHome'")) bad.push('the table does not bind Backspace to the rush key, or game.js does not run it');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('rail.tunnel-craft-board-names-the-shuttle-and-still-fits', async () => {
    const b = g.hall.boards.find((x) => /TUNNEL CRAFT/.test(x.title)); if (!b) return 'no tunnel craft board'; const bad = [];
    if (!/Mine Rail/.test(b.foot) || !/Backspace/.test(b.foot)) bad.push('foot: ' + b.foot); if (b.overflow) bad.push('the board runs off the chalk'); if (hasBad(b.foot)) bad.push('bad characters');
    if (b.rows.length < 9) bad.push('the frame rows are gone: ' + b.rows.length);
    return bad.length === 0 || bad.join(' || ');
  });

  function require_key(i, j, k) { return R.keyOf({ i, j, k }); }
  void toI; void toK; void cellX; void cellZ; void w;
}
