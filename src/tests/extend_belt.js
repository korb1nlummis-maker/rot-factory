// extend.belt-* : a belt line grows from its loose START (the end nothing feeds) the same way a hose grows from its mouth: aim at it with a belt out, click, aim where the line
// should now start, click. The new tiles go through the line planner (ramps down and up an uneven floor, curves, the shapes), join as one line, take the line's OWN mark, and
// whatever rides the belt keeps riding. Merges, lifts and the host's checks are the same as for any line.
import { makeBeltKit, UP_ALL } from './belts_lib.js';
import * as BP from '../beltplan.js';
import { priceOf } from '../beltdata.js';
import { BULK, pools } from '../plushdata.js';
import { C } from '../config.js';

export default async function (ctx) {
  const { g, S, w, L, adv, tiles, toI, toK, cellX, cellZ } = ctx;
  const B = makeBeltKit(ctx), K = B.K, T = B.T;
  const bad = (a) => a.length === 0 || a.join('; ');
  const walls = [];
  const wall = (i, j, k) => { w().setCell(i, j, k, BULK, 0); walls.push([i, j, k]); };
  const unwall = () => { for (const [i, j, k] of walls.splice(0)) w().setCell(i, j, k, 0, 0); };
  const done = () => { g.bplan = null; g.machines.setGhost(null); g.plan = null; };
  const o = { a: 0, k: 0 };
  const setup = () => { B.setup(UP_ALL); unwall(); S().money = 1e12; S().items.belt = 60; S().items.ramp = 0; o.a = toI(-5); o.k = toK(0.3); };
  const aimAt = async (i, k, y = 0) => { K.aimDir(cellX(i), y, cellZ(k), 0, 2.0); return ctx.plan(); };
  const itemsIn = () => tiles().reduce((a, t) => a + (t.items ? t.items.length : 0), 0);
  const follow = (from) => { let n = 0, t = from; const seen = new Set(); while (t && t.type === 'belt' && !seen.has(t.id)) { seen.add(t.id); n++; t = L().nextOf(t); } return n; };
  const starts = () => { L().rebuildBelts(); return tiles().filter((t) => t.type === 'belt' && !t.fed && !L().isFed(t) && L().nextOf(t)); };
  const sp = pools[0][0];
  const click = () => { window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })); };

  await T('extend.belt-a-line-grows-upstream-down-an-uneven-floor-keeps-its-mark-and-its-plush-flow-on', async () => {
    setup(); const b = [], a = o.a, k = o.k;
    const line = B.lay(2, 6, a, k, 0); const vault = B.vaultAt(a + 6, k); L().dirty = true; L().rebuildBelts();
    const placed = B.dense(line);   // the old line is packed with plush, all riding to the vault
    // the floor is a step higher where the new start will be: the stretch has to come down a ramp
    for (let i = a - 8; i <= a - 4; i++) for (let kk = k - 3; kk <= k + 3; kk++) wall(i, 0, kk);
    K.equip('belt');   // a Mk1 belt in hand: the line's own Mk2 is what is laid
    let pl = await aimAt(a, k); if (!pl || !pl.ok || !pl.extAim || pl.extAim.tier !== 2) return 'no outline on the start of the line: ' + JSON.stringify(pl && [pl.ok, pl.why, pl.extAim]);
    if (!/Click<\/kbd> to extend/.test(document.getElementById('hint').innerHTML)) b.push('hover hint: ' + document.getElementById('hint').textContent);
    click();
    if (!g.bplan || !g.bplan.start || !g.bplan.start.ext) return 'the click did not anchor: ' + document.getElementById('hint').textContent;
    pl = await aimAt(a - 6, k, C + 0.05); if (!pl || !pl.ok || !pl.route) return 'route: ' + JSON.stringify(pl && [pl.ok, pl.why]);
    const rt = pl.route.tiles; if (rt.length !== 6 || rt.filter((t) => t.rise).length !== 1 || rt[0].j !== 1 || rt[5].j !== 0 || rt[5].dir !== 0 || rt[5].i !== a - 1) b.push('the stretch: ' + JSON.stringify(rt.map((t) => [t.i - a, t.j, t.dir, t.rise])));
    if (!/Mk3 belt \(the line's own mark\)/.test(document.getElementById('hint').textContent) || !/ramp/.test(document.getElementById('hint').textContent)) b.push('hint: ' + document.getElementById('hint').textContent);
    const m0 = S().money, tot0 = itemsIn() + vault.stored.length;
    const far = pl.route.tiles[0]; g.placeCurrent(g.curTool()); adv(0.05); L().rebuildBelts();
    const first = L().tileAt(far.i, far.j, far.k); if (!first) return 'nothing was laid at the far end';
    if (follow(first) !== 12) b.push('not one line: ' + follow(first)); const sts = starts(); if (sts.length !== 1 || sts[0] !== first) b.push('loose starts: ' + sts.map((t) => `${t.i - a},${t.j}`));
    const stretch = rt.map((t) => L().tileAt(t.i, t.j, t.k)); if (stretch.some((t) => !t)) return 'a tile is missing';
    for (const t of stretch) if (t.rise ? t.tier : (t.tier || 0) !== 2) b.push(`a new tile has mark ${t.tier} (rise ${t.rise})`);
    const paid = m0 - S().money, want = 5 * priceOf(2) + 5 * 3; if (Math.abs(paid - want) > 1e-6) b.push(`paid ${paid}, wanted ${want}`);
    if (itemsIn() + vault.stored.length !== tot0) b.push('plush changed when it was laid: ' + tot0 + ' -> ' + (itemsIn() + vault.stored.length));
    first.items.push({ sp, vr: 0, t: 0.2 }); const total = placed + 1;
    B.seconds(25); if (vault.stored.length !== total) b.push(`the vault holds ${vault.stored.length}, wanted ${total} (the plush on the old belts and the one on the new start)`);
    done(); unwall(); return bad(b);
  });

  await T('extend.belt-a-feeder-of-a-merge-grows-and-the-merge-still-merges', async () => {
    setup(); const b = [], a = o.a, k = o.k;
    const main = B.lay(0, 7, a, k, 0), feed = B.lay(0, 3, a + 3, k - 3, 1); const vault = B.vaultAt(a + 7, k); L().dirty = true; L().rebuildBelts(); void main;
    const fm = L().feedMap.get(main[3].id); if (!fm || fm.length !== 2) return 'the merge is not a merge: ' + (fm && fm.length);
    K.equip('belt'); let pl = await aimAt(a + 3, k - 3); if (!pl || !pl.extAim || pl.extAim.i !== a + 3) return 'no outline on the start of the feeder: ' + JSON.stringify(pl && [pl.ok, pl.why]);
    pl = await aimAt(a + 3, k - 3); g.placeCurrent(g.curTool()); if (!g.bplan.start || !g.bplan.start.ext) return 'B did not anchor it';
    pl = await aimAt(a + 1, k - 8); if (!pl || !pl.ok) return 'route: ' + JSON.stringify(pl && [pl.ok, pl.why]);
    if (pl.route.tiles.length < 7) b.push('the stretch is ' + pl.route.tiles.length + ' tiles'); const far = pl.route.tiles[0];
    g.placeCurrent(g.curTool()); adv(0.05); L().rebuildBelts(); const first = L().tileAt(far.i, far.j, far.k); if (!first) return 'not laid';
    if (follow(first) !== pl.route.tiles.length + 3 + 4) b.push('not one line into the merge: ' + follow(first));
    if (L().feedMap.get(main[3].id).length !== 2) b.push('the merge lost a feeder');
    first.items.push({ sp, vr: 0, t: 0.1 }, { sp: pools[0][1], vr: 0, t: 0.1 + 0.0 }); main[0].items.push({ sp: pools[0][2], vr: 0, t: 0.1 });
    B.seconds(30); if (vault.stored.length !== 3) b.push('the vault holds ' + vault.stored.length + ' of 3');
    done(); return bad(b);
  });

  await T('extend.belt-a-lift-takes-a-stretch-straight-behind-it-only', async () => {
    setup(); const b = [], a = o.a, k = o.k;
    const lift = g.placeEntity('belt', { i: a, j: 0, k, dir: 0, rise: 0, lift: { h: 2 }, items: [] }, { quiet: true, rebuild: false });
    B.lay(0, 2, a + 1, k, 0, 2); const vault = B.vaultAt(a + 3, k, 2); L().dirty = true; L().rebuildBelts();
    K.equip('belt'); let pl = await aimAt(a, k); if (!pl || !pl.extAim || !pl.extAim.flat) return 'no outline on the foot of the lift: ' + JSON.stringify(pl && [pl.ok, pl.why]);
    pl = await aimAt(a, k); g.placeCurrent(g.curTool()); pl = await aimAt(a - 4, k + 2); if (!pl || !pl.ok) return 'route: ' + JSON.stringify(pl && [pl.ok, pl.why]);
    const lt = pl.route.tiles[pl.route.tiles.length - 1]; if (lt.i !== a - 1 || lt.k !== k || lt.dir !== 0) b.push('the stretch does not come in from straight behind the lift: ' + JSON.stringify([lt.i - a, lt.k - k, lt.dir]));
    const far = pl.route.tiles[0]; g.placeCurrent(g.curTool()); adv(0.05); L().rebuildBelts(); const first = L().tileAt(far.i, far.j, far.k); if (!first) return 'not laid';
    first.items.push({ sp, vr: 0, t: 0.3 }); B.seconds(25); if (vault.stored.length !== 1) b.push('the plush did not ride up the lift: ' + vault.stored.length);
    // a side join onto a lift is refused by the host
    const r = BP.lay(g, 0, [[a, 0, k - 1, 1, 0, 0]], false, { i: a, j: 0, k }); if (r.ok) b.push('a side join onto a lift was laid');
    done(); return bad(b);
  });

  await T('extend.belt-refusals-and-the-host-check', async () => {
    setup(); const b = [], a = o.a, k = o.k;
    B.lay(2, 6, a, k, 0); B.vaultAt(a + 6, k); L().dirty = true; L().rebuildBelts(); K.equip('belt');
    for (const di of [3, 5]) { const pl = await aimAt(a + di, k); if (pl && pl.extAim) b.push('a fed piece offers to extend ' + di); }
    const t = (d) => [a + d, 0, k, 0, 0, 0], good = { i: a, j: 0, k }, c0 = tiles().filter((x) => x.type === 'belt').length;
    const bads = [['a forged mark', 0, [t(-2), t(-1)], false, good], ['the hose flag', 2, [t(-2), t(-1)], true, good], ['a missing piece', 2, [t(-2), t(-1)], false, { i: a - 30, j: 0, k }], ['not beside the start', 2, [t(-3), t(-2)], false, good], ['a fed piece', 2, [t(-2)], false, { i: a + 2, j: 0, k }], ['bad numbers', 2, [t(-2), t(-1)], false, { i: 1.5, j: 0, k }]];
    for (const [name, tier, tl, hose, ext] of bads) { const r = BP.lay(g, tier, tl, hose, ext); if (r.ok) b.push(name + ' was laid'); }
    if (tiles().filter((x) => x.type === 'belt').length !== c0) b.push('a refused extension left tiles behind');
    // no money and none held: the click lays nothing and the hint says why; a wall across the way blocks every join
    S().money = 0; S().items.belt = 0; S().items['belt:2'] = 0; g.rebuildTools(); ctx.selectTool('hammer'); S().items.belt = 3; g.rebuildTools(); K.equip('belt');
    await aimAt(a, k); click();
    let pl = await aimAt(a - 4, k); if (!pl || pl.ok || !/Not enough money/.test(pl.why || '')) b.push('no money: ' + JSON.stringify(pl && [pl.ok, pl.why]));
    S().money = 1e12; for (let j = 0; j < 3; j++) for (let kk = k - 3; kk <= k + 3; kk++) wall(a - 2, j, kk); g.bplan._r = null; pl = await aimAt(a - 4, k); if (!pl || !pl.ok || pl.route.tiles.some((x) => x.i === a - 2 && Math.abs(x.k - k) <= 3 && x.j < 3)) b.push('a wall across the way was ignored or no way round it was found: ' + JSON.stringify(pl && [pl.ok, pl.why, pl.route && pl.route.tiles.map((x) => [x.i - a, x.j, x.k - k])]));
    done(); unwall(); return bad(b);
  });

  await T('extend.belt-the-hammer-takes-the-stretch-down-and-gives-back-what-was-laid', async () => {
    setup(); const b = [], a = o.a, k = o.k;
    B.lay(2, 6, a, k, 0); B.vaultAt(a + 6, k); L().dirty = true; L().rebuildBelts(); K.equip('belt'); S().items['belt:2'] = 0;
    await aimAt(a, k); click();
    const pl = await aimAt(a - 5, k); if (!pl || !pl.ok) return 'route ' + JSON.stringify(pl && [pl.ok, pl.why]); g.placeCurrent(g.curTool()); adv(0.05); done(); L().rebuildBelts();
    if (starts().length !== 1 || starts()[0].i !== a - 5) return 'the new start is not at -5: ' + starts().map((x) => x.i - a);
    ctx.selectTool('hammer');
    for (let d = -5; d <= -1; d++) { K.aimDir(cellX(a + d), 0, cellZ(k), 0, 2.0); adv(0.2); await ctx.plan(); click(); adv(0.3); }
    L().rebuildBelts(); if (S().items['belt:2'] !== 5) b.push('refund: ' + S().items['belt:2'] + ' Mk2 belts back, wanted 5');
    const st = starts(); if (st.length !== 1 || st[0].i !== a || follow(st[0]) !== 6) b.push('the old line is not whole with its old start: ' + st.map((x) => x.i - a));
    done(); return bad(b);
  });
}
