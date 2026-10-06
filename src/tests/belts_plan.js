// belts.* (wave 1A): the line planner. Click a start, aim an end, click again: the whole line is laid. Four route shapes, snapping to the bin, a sorter or the open end of a line,
// the shortfall bought at the bench price, the 64 tile limit, and the host's check of everything a guest asks for.
import { makeBeltKit, UP_ALL, UP_BASE } from './belts_lib.js';
import * as BP from '../beltplan.js';
import { priceOf, ugPriceOf, rateOf, tierOf } from '../beltdata.js';
import { BULK, pools } from '../plushdata.js';
import { DX, DZ } from '../beltparts.js';

export default async function (ctx) {
  const { T: T0, g, S, w, p, L, tiles, toI, toK, cellX, cellZ } = ctx;
  const B = makeBeltKit(ctx), K = B.K;
  const T = B.T; void T0;
  const walls = [];
  const wall = (i, j, k) => { w().setCell(i, j, k, BULK, 0); walls.push([i, j, k]); };
  const unwall = () => { for (const [i, j, k] of walls.splice(0)) w().setCell(i, j, k, 0, 0); };
  const holdKeys = (code) => g.onKey({ code, repeat: false, preventDefault() {} }, true);
  const raw = (r) => r.tiles.map((t) => [t.i, t.j, t.k, t.dir, t.rise, t.u]);
  const nBelts = () => tiles().filter((t) => t.type === 'belt').length;
  const aim = async (i, k) => { K.aimDir(cellX(i), 0, cellZ(k), 0, 2.0); return ctx.plan(); };
  const click = () => g.placeCurrent(g.curTool());
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cell = () => ({ i0: toI(-11), k0: toK(0.3) });

  await T('belts.planner-routes-around-wall', async () => {
    B.setup(UP_ALL); const bad = []; const { i0, k0 } = cell(); unwall();
    // a wall four high and seven wide across the straight line, ten cells long
    for (let j = 0; j < 4; j++) for (let k = k0 - 3; k <= k0 + 3; k++) wall(i0 + 5, j, k);
    const s = { i: i0, j: 0, k: k0 }, e = { i: i0 + 10, j: 0, k: k0 };
    const straight = BP.route(g, s, e, 0, 0);
    if (straight.ok || !straight.blocked.length || !straight.blocked.every((b) => b.i === i0 + 5)) bad.push('the straight route should be refused with the wall cells listed: ' + JSON.stringify([straight.ok, straight.blocked.length]));
    const around = BP.route(g, s, e, 2, 0);
    if (!around.ok) bad.push('no way around: ' + around.why);
    else {
      const ts = around.tiles; if (ts[0].i !== s.i || ts[0].k !== s.k || ts[ts.length - 1].i !== e.i || ts[ts.length - 1].k !== e.k) bad.push('the route does not run from the start to the end');
      for (let m = 0; m < ts.length - 1; m++) if (ts[m + 1].i !== ts[m].i + DX[ts[m].dir] || ts[m + 1].k !== ts[m].k + DZ[ts[m].dir] || ts[m + 1].j !== ts[m].j + ts[m].rise) { bad.push('the line is not connected at ' + m); break; }
      if (ts.some((t) => w().solid(t.i, t.j, t.k))) bad.push('a tile stands inside the wall');
      if (ts.some((t) => t.rise)) bad.push('it ramped over a four cell wall');
      if (ts.length < 11 + 8 || ts.length > 11 + 12) bad.push('detour length ' + ts.length + ' tiles');
    }
    // a one cell wall can be climbed with a ramp up and a ramp down
    unwall(); for (let k = k0 - 3; k <= k0 + 3; k++) wall(i0 + 5, 0, k);
    const over = BP.route(g, s, e, 2, 0); if (!over.ok) bad.push('low wall: ' + over.why); else if (!over.tiles.some((t) => t.rise === 1) || !over.tiles.some((t) => t.rise === -1)) bad.push('low wall: no ramps up and down in ' + over.tiles.length + ' tiles');
    // sealed all round: no route, and it says so
    unwall(); for (let j = 0; j < 4; j++) for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) wall(e.i + di, j, e.k + dk); const sealed = BP.route(g, s, e, 2, 0); if (sealed.ok || !/No way through/.test(sealed.why)) bad.push('walked through a sealed ring: ' + sealed.ok + ' ' + sealed.why);
    unwall();
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.planner-under-bridges-what-is-in-the-way', async () => {
    B.setup(UP_ALL); const bad = []; const { i0, k0 } = cell(); unwall();
    const s = { i: i0, j: 0, k: k0 }, e = { i: i0 + 9, j: 0, k: k0 };
    B.lay(0, 3, i0 + 2, k0 - 1, 1);   // a belt crossing the line
    for (let j = 0; j < 4; j++) { wall(i0 + 5, j, k0); wall(i0 + 6, j, k0); }   // and a wall two thick
    const r = BP.route(g, s, e, 3, 0);
    if (!r.ok) return 'under refused: ' + r.why;
    const ends = r.tiles.filter((t) => t.u); if (ends.length !== 4 || ends.map((t) => t.u).join() !== '1,2,1,2') bad.push('underground ends ' + ends.map((t) => t.u).join());
    const free = BP.route(g, s, e, 0, 0); if (free.ok) bad.push('the plain route went through the obstacles');
    // too much in the way for a Mk1 underground (span 4)
    unwall(); for (let q = 0; q < 5; q++) wall(i0 + 4 + q, 0, k0); const long = BP.route(g, { ...s }, { ...e, i: i0 + 11 }, 3, 0); if (long.ok || !/at most/.test(long.why)) bad.push('five cells under at Mk1: ' + long.ok + ' ' + long.why);
    const mk3 = BP.route(g, s, { ...e, i: i0 + 11 }, 3, 2); if (!mk3.ok) bad.push('five cells under at Mk3 (span 8): ' + mk3.why);
    // a turn inside the bridged stretch is refused: an underground pair goes straight
    unwall(); wall(i0 + 9, 0, k0); wall(i0 + 9, 0, k0 + 1); const bend = BP.route(g, s, { i: i0 + 9, j: 0, k: k0 + 4 }, 3, 0); if (bend.ok && bend.tiles.some((t) => t.u)) { const a = bend.tiles.findIndex((t) => t.u === 1), b = bend.tiles.findIndex((t) => t.u === 2); const c = bend.tiles.slice(a, b + 1); if (new Set(c.map((t) => t.dir)).size !== 1) bad.push('a pair turned'); }
    unwall();
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.planner-snaps-to-bin', async () => {
    B.setup(UP_ALL); const bad = []; unwall(); const bp = g.hall.binPos;
    // aim near the bin and the end moves to the cell that feeds it, facing it
    const a = { i: toI(bp.x - 3.0), j: 0, k: toK(bp.z) };
    const eye = { x: cellX(a.i) - 1.0, y: 1.6, z: cellZ(a.k) - 0.4 }, dir = new ctx.V3(0.55, -0.8, 0.2).normalize();
    const aimed = g.logi.aimCell(eye, dir); if (!aimed) return 'no aim cell';
    const en = BP.snapEnd(g, aimed, { i: aimed.i - 6, j: 0, k: aimed.k }, eye, dir);
    if (en.note !== 'feeds the bin') return 'no bin snap: ' + JSON.stringify(en);
    const x = cellX(en.i), z = cellZ(en.k), d = en.dir;
    if (!(g.sinkNear(x + DX[d] * 0.6, z + DZ[d] * 0.6) || g.sinkNear(x, z))) bad.push('the snapped end does not reach the bin');
    // the whole thing through the planner: the line is laid, plush ride it into the bin and pay
    S().money = 1e12; g.craftItem('belt', 12); K.equip('belt'); holdKeys('Period');
    const start = { i: en.i - 6, k: en.k };
    let pl = await aim(start.i, start.k); if (!pl || !pl.ok || !pl.planner) return 'start plan: ' + JSON.stringify(pl && pl.why); click();
    if (!g.bplan.start) return 'the start was not set';
    K.aimDir(x, 0, z, 0, 2.0); pl = await ctx.plan(); if (!pl.ok || !pl.route) return 'line plan: ' + pl.why;
    if (pl.end.note !== 'feeds the bin') bad.push('the planner did not snap to the bin: ' + JSON.stringify(pl.end));
    const n0 = nBelts(); click(); const laid = tiles().filter((t) => t.type === 'belt'); if (laid.length - n0 !== pl.route.tiles.length || !laid.length) return `laid ${laid.length - n0} of ${pl.route.tiles.length}`;
    const first = L().tileAt(start.i, 0, start.k); first.items.push({ sp: pools[1][0], vr: 0, t: 0 }); const m0 = S().money;
    for (let q = 0; q < 900; q++) { for (const t of tiles()) if (t.type === 'belt') t.pw = 1; g.time += 0.05; L().update(0.05); }
    const left = tiles().reduce((n, t) => n + (t.items ? t.items.length : 0), 0); if (left !== 0 || S().money <= m0) bad.push(`the plush did not reach the bin: ${left} left, money ${m0} -> ${S().money}`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.planner-lays-the-whole-line-and-charges-the-shortfall', async () => {
    B.setup(UP_ALL); const bad = []; unwall(); const { i0, k0 } = cell();
    S().money = 1e12; g.craftItem('belt:2', 4); K.equip('belt:2'); holdKeys('Period'); S().money = 100000; const m0 = S().money;
    let pl = await aim(i0, k0); if (!pl.ok) return 'start: ' + pl.why; click();
    pl = await aim(i0 + 9, k0); if (!pl.ok || !pl.route) return 'line: ' + (pl.why || 'no route');
    const price = priceOf(2); const want = 6 * price;
    if (g.planCost !== want) bad.push(`the plan says ${g.planCost}, the shortfall is 6 x ${price}`);
    if (!/10 tiles/.test(pl.hintText) || !/Mk3/.test(pl.hintText) || !pl.hintText.includes(Math.round(rateOf(g.T, 2)).toLocaleString('en-US') + ' plush per min') || !/buys 6 more for/.test(pl.hintText)) bad.push('hint: ' + String(pl.hintText).slice(0, 220));
    const n0 = nBelts(), ents0 = S().entities.length; click();
    const row = []; for (let q = 0; q < 10; q++) row.push(L().tileAt(i0 + q, 0, k0));
    if (row.some((t) => !t || tierOf(t) !== 2 || t.dir !== 0)) bad.push('tiles: ' + row.map((t) => (t ? tierOf(t) + ':' + t.dir : '-')).join(' '));
    if (nBelts() - n0 !== 10 || S().entities.length - ents0 !== 10) bad.push('laid ' + (nBelts() - n0));
    if ((S().items['belt:2'] || 0) !== 0 || m0 - S().money !== want) bad.push(`items ${JSON.stringify(S().items)}, charged ${m0 - S().money}, wanted ${want}`);
    if (g.bplan.start) bad.push('the planner kept its start after laying');
    // too poor: refused, nothing taken
    S().money = 100; const before = nBelts();
    pl = await aim(i0, k0 + 3); click(); pl = await aim(i0 + 9, k0 + 3); if (pl.ok) bad.push('a 10 tile line was allowed with ◈ 100'); else if (!/Not enough money/.test(pl.why || '')) bad.push('why: ' + pl.why);
    click(); if (nBelts() !== before || S().money !== 100) bad.push('a refused line placed something or charged');
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.planner-start-snaps-to-the-open-end-of-a-line-and-a-sorter', async () => {
    B.setup(UP_ALL); const bad = []; unwall(); const { i0, k0 } = cell(); S().money = 1e12; g.craftItem('belt', 3); K.equip('belt'); holdKeys('Period');
    const line = B.lay(0, 3, i0, k0, 0);
    let pl = await aim(i0 + 2, k0); if (!pl.ok || pl.startCell.i !== i0 + 3 || pl.startCell.dir !== 0 || !/open end/.test(pl.hintText)) bad.push('open end: ' + JSON.stringify([pl.ok, pl.why, pl.startCell, String(pl.hintText).slice(0, 80)]));
    // a tile in the middle of a line is not an open end: it is just occupied
    pl = await aim(i0 + 1, k0); if (pl.ok) bad.push('a start on top of a belt was allowed');
    const sorter = g.placeEntity('sorter', { i: i0, j: 0, k: k0 + 4, dir: 1 }, { quiet: true, rebuild: false }); void sorter;
    pl = await aim(i0, k0 + 4); if (!pl.ok || pl.startCell.k !== k0 + 5 || pl.startCell.dir !== 1 || !/sorter output/.test(pl.hintText)) bad.push('sorter output: ' + JSON.stringify([pl.ok, pl.why, pl.startCell]));
    void line;
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.planner-shapes-and-the-keys-that-pick-them', async () => {
    B.setup(UP_ALL); const bad = []; unwall(); const { i0, k0 } = cell(); S().money = 1e12; g.craftItem('belt', 40); K.equip('belt'); holdKeys('Period');
    if (!g.bplan.on) return 'Period did not switch the planner on';
    let pl = await aim(i0, k0); click();
    pl = await aim(i0 + 6, k0 + 5); if (!pl.route || !pl.ok) return 'no route: ' + pl.why;
    const r0 = pl.route.tiles, corner = (ts) => ts.find((t, m) => m && ts[m - 1].dir !== t.dir);
    const c0 = corner(r0);   // the tile that turns
    if (!c0 || c0.i !== i0 + 6 || c0.k !== k0) bad.push('horizontal first should turn at the far column: ' + JSON.stringify(c0));
    if (r0.length !== 12) bad.push('an L from (0,0) to (6,5) is 12 tiles, got ' + r0.length);
    holdKeys('KeyR'); if (g.bplan.variant !== 1) bad.push('R did not pick the next shape: ' + g.bplan.variant);
    pl = await aim(i0 + 6, k0 + 5); const r1 = pl.route.tiles, c1 = corner(r1);
    if (!c1 || c1.i !== i0 || c1.k !== k0 + 5) bad.push('vertical first should turn at the far row: ' + JSON.stringify(c1));
    holdKeys('Comma'); if (g.bplan.variant !== 2) bad.push('Comma did not pick the next shape: ' + g.bplan.variant);
    // the wheel picks the shape once a start is set (and still steps the hotbar otherwise)
    const slot = g.buildIdx; window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 })); if (g.bplan.variant !== 3 || g.buildIdx !== slot) bad.push(`wheel: shape ${g.bplan.variant}, slot ${slot} -> ${g.buildIdx}`);
    for (const v of [0, 1, 2, 3]) { g.bplan.variant = v; g.bplan._r = null; const q = await aim(i0 + 6, k0 + 5); if (!q.route || q.route.tiles.length < 12) bad.push(`shape ${v}: ${q.route && q.route.tiles.length} tiles`); }
    g.bplan.variant = 0; g.bplan._r = null;
    // Period again: the planner is off and a belt is a single belt again (the old path)
    holdKeys('Period'); if (g.bplan.on) bad.push('Period twice left the planner on'); pl = await aim(i0 + 8, k0 + 8); if (!pl.ok || pl.route || pl.planner) bad.push('the old single belt plan is gone: ' + JSON.stringify([pl.ok, !!pl.route, pl.planner]));
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.planner-line-limit-is-64-tiles', async () => {
    B.setup(UP_ALL); const bad = []; unwall();
    // a corridor north of the bay, cleared for the test: 70 cells long
    const i0 = toI(-13), k = toK(13.5); for (let q = 0; q < 70; q++) for (let j = 0; j < 2; j++) if (w().get(i0 + q, j, k)) w().removeCell(i0 + q, j, k, false);
    const ok = BP.route(g, { i: i0, j: 0, k }, { i: i0 + 63, j: 0, k }, 0, 0); const over = BP.route(g, { i: i0, j: 0, k }, { i: i0 + 64, j: 0, k }, 0, 0);
    if (!ok.ok || ok.tiles.length !== 64) bad.push(`64 tiles: ${ok.ok} ${ok.tiles.length} ${ok.why}`);
    if (over.ok || !/Too long: 64 tiles at most/.test(over.why)) bad.push('65 tiles: ' + over.ok + ' ' + over.why);
    const far = BP.route(g, { i: i0, j: 0, k }, { i: i0 + 400, j: 0, k: k + 300 }, 2, 0); if (far.ok) bad.push('a 700 cell line was planned');
    const lay64 = BP.lay(g, 0, raw(ok)); if (!lay64.ok || lay64.n !== 64) bad.push('laying 64: ' + JSON.stringify(lay64.why || lay64.n));
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.planner-under-lays-paired-ends-and-plush-pass', async () => {
    B.setup(UP_ALL); const bad = []; unwall(); const { i0, k0 } = cell(); S().money = 1e12;
    wall(i0 + 4, 0, k0); wall(i0 + 5, 0, k0);
    const r = BP.route(g, { i: i0, j: 0, k: k0 }, { i: i0 + 9, j: 0, k: k0 }, 3, 0); if (!r.ok) return 'route: ' + r.why;
    S().items = { belt: 4 }; const m0 = S().money; const res = BP.lay(g, 0, raw(r)); if (!res.ok) return 'lay: ' + res.why;
    // 6 belts and 2 underground ends: the 4 held belts used up, 2 bought, 2 ends bought
    const wantMoney = 2 * priceOf(0) + 2 * ugPriceOf(0); if (m0 - S().money !== wantMoney) bad.push(`charged ${m0 - S().money}, wanted ${wantMoney}`);
    const ends = tiles().filter((t) => t.ug); const entry = ends.find((t) => t.ug.role === 'in'), exit = ends.find((t) => t.ug.role === 'out');
    if (!entry || !exit || entry.ug.pair !== exit.id || exit.ug.pair !== entry.id || entry.ug.span !== 3) bad.push('pair: ' + JSON.stringify(ends.map((t) => t.ug)));
    const v = B.vaultAt(i0 + 10, k0); const first = L().tileAt(i0, 0, k0); first.items.push({ sp: B.sp, vr: 0, t: 0 }); B.seconds(12, 0.05);
    if (v.stored.length !== 1) bad.push('the plush did not come out the other side: ' + v.stored.length);
    // without the unlock it is refused
    B.setup({ ...UP_ALL, beltUg: 0 }); wall(i0 + 4, 0, k0); wall(i0 + 5, 0, k0); const r2 = BP.route(g, { i: i0, j: 0, k: k0 }, { i: i0 + 9, j: 0, k: k0 }, 3, 0); if (r2.ok || !/not unlocked/.test(r2.why)) bad.push('under without the upgrade: ' + r2.ok + ' ' + r2.why);
    unwall();
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.planner-host-check-rejects-bad-lines-and-places-nothing', async () => {
    B.setup(UP_ALL); const bad = []; unwall(); const { i0, k0 } = cell(); S().money = 1e12;
    const good = []; for (let q = 0; q < 5; q++) good.push([i0 + q, 0, k0, 0, 0, 0]);
    const rows = {
      'a gap': [good[0], good[2]], 'duplicate': [good[0], good[1], good[1]], 'a bend that does not follow': [[i0, 0, k0, 0, 0, 0], [i0, 0, k0 + 1, 0, 0, 0]],
      'a float': [[i0 + 0.5, 0, k0, 0, 0, 0]], 'a string': [['x', 0, k0, 0, 0, 0]], 'a bad dir': [[i0, 0, k0, 7, 0, 0]], 'a bad rise': [[i0, 0, k0, 0, 2, 0]], 'short rows': [[i0, 0, k0]], 'empty': [], 'not an array': 'abc', 'null': null,
      'too many': Array.from({ length: 65 }, (_, q) => [i0 + q, 0, k0, 0, 0, 0]), 'out of the hall': [[-5, 0, k0, 0, 0, 0]], 'an exit first': [[i0, 0, k0, 0, 0, 2]],
      'an unpaired entry': [[i0, 0, k0, 0, 0, 1], [i0 + 1, 0, k0, 0, 0, 0]], 'an exit facing wrong': [[i0, 0, k0, 0, 0, 1], [i0 + 3, 0, k0, 1, 0, 2]], 'an underground too long': [[i0, 0, k0, 0, 0, 1], [i0 + 9, 0, k0, 0, 0, 2]], 'an adjacent pair': [[i0, 0, k0, 0, 0, 1], [i0 + 1, 0, k0, 0, 0, 2]],
      'a ramp that is not under': [[i0, 0, k0, 0, 1, 1]],
    };
    const n0 = nBelts(), m0 = S().money;
    for (const [name, r] of Object.entries(rows)) { const res = BP.lay(g, 0, r); if (res.ok) bad.push('accepted ' + name); }
    for (const [name, tier] of [['a locked mark', 5], ['a negative mark', -1], ['a text mark', 'x'], ['a fractional mark', 0.5]]) { S().up = { ...UP_ALL, beltMk6: 0, beltMk5: 0 }; g.T = g.tune(); const res = BP.lay(g, tier, good); if (res.ok) bad.push('accepted ' + name); }
    // an occupied cell
    B.lay(0, 1, i0 + 2, k0, 0); const occ = BP.lay(g, 0, good); if (occ.ok || !/Occupied/.test(occ.why)) bad.push('through a belt: ' + occ.why);
    // a guest command with junk does not throw and answers with a toast
    const sent = []; g.netSend = (m) => sent.push(m); role('host'); try { for (const d of [null, 5, 'x', {}, { tier: 0 }, { tier: 0, tiles: 'x' }, { tier: 0, tiles: [[1]] }]) g.netMessage({ t: 'cmd', c: 'bplan', d: JSON.parse(JSON.stringify(d)) }); } finally { delete g.netSend; role(null); }
    if (nBelts() - n0 !== 1 || S().money !== m0) bad.push(`rejected lines changed the world: belts ${nBelts() - n0} (1 was laid on purpose), money ${m0 - S().money}`);
    if (!sent.some((m) => m.t === 'toast')) bad.push('no toast for a refused line');
    // a good line goes through, exactly once
    const fine = BP.lay(g, 0, good.map((r) => [r[0], r[1], r[2] + 3, r[3], r[4], r[5]])); if (!fine.ok || fine.n !== 5) bad.push('a good line: ' + JSON.stringify(fine.why));
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.planner-cleanup', async () => { unwall(); B.cleanup(); return true; });
}
