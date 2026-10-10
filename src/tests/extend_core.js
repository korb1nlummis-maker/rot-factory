// extend.* : growing a Vacuum Hose from its opening. With the hose out, aiming at the mouth outlines it and says a click extends it; the click anchors, a second click (or a
// press, drag and let go) lays the new stretch from where you aim to the old mouth, the old mouth becomes a plain joint and the far end of the new stretch is the mouth. The same
// pieces, price, items and cell rules as any hose. Plush already in the tube keep flowing. The hammer takes the new stretch down piece by piece. A save and load keeps it.
import { makeHoseKit } from './hose_lib.js';
import * as BP from '../beltplan.js';
import { pools } from '../plushdata.js';
import { loadSaved } from '../state.js';

export default async function (ctx) {
  const { g, S, L, adv, cellX, cellZ, tiles } = ctx;
  const H = makeHoseKit(ctx), B = H.B, T = B.T, io = H.io;
  const bad = (a) => a.length === 0 || a.join('; ');
  const done = () => { g.bplan = null; g.machines.setGhost(null); g.plan = null; };
  const craftHose = (n) => { delete S().items.hose; ctx.craft('hose', n); };
  const lay = async (n = 6) => { for (let s = 0; s < n; s++) await H.put(s, 0, 0); };
  const itemsIn = () => tiles().reduce((a, t) => a + (t.items ? t.items.length : 0), 0);
  const total = (vault) => g.sim.n + itemsIn() + vault.stored.length;

  await T('extend.a-hose-grows-from-its-opening-the-old-mouth-is-a-joint-and-the-new-end-is-the-intake', async () => {
    H.setup(80); const b = []; await lay(6);
    const vault = B.vaultAt(H.o.i + 6, H.o.k); H.rebuild(); const old = H.tileAt(0, 0);
    if (!old || H.mouths().length !== 1 || H.mouths()[0] !== old) return 'the setup line has ' + H.mouths().length + ' mouths';
    H.tileAt(3, 0).items.push({ sp: pools[0][0], vr: 0, t: 0.6 }, { sp: pools[0][1], vr: 0, t: 0.2 });   // two plush in flight inside the old tube
    // aiming at the mouth outlines it and says a click extends it (nothing is anchored yet, nothing is laid)
    let pl = await H.aim(0, 0, 0); if (!pl || !pl.ok || !pl.extAim || pl.extAim.i !== old.i) return 'no extend outline on the mouth: ' + JSON.stringify(pl && { ok: pl.ok, why: pl.why });
    if (!/Click<\/kbd> to extend/.test(io.hintHtml())) b.push('hint: ' + io.hint()); let meshes = 0; if (g.machines.ghost) g.machines.ghost.traverse((m) => { if (m.isMesh) meshes++; }); if (meshes < 2) b.push('the outline has ' + meshes + ' meshes');
    if (H.hoses().length !== 6) b.push('aiming laid something');
    io.click(0); const s0 = g.bplan; if (!s0 || !s0.on || !s0.click || !s0.start || !s0.start.ext || s0.start.ext.i !== old.i) return 'the click did not anchor an extension: ' + io.hint();
    if (!/Extending the opening/.test(io.hint())) b.push('anchor hint: ' + io.hint());
    const m0 = S().money, n0 = S().items.hose;
    pl = await H.aim(-8, 0, 0); if (!pl || !pl.ok || !pl.ext || pl.route.tiles.length !== 8) return 'route: ' + JSON.stringify([pl && pl.ok, pl && pl.why, pl && pl.route && pl.route.tiles.length]);
    if (pl.route.tiles.some((t) => t.dir !== 0 || t.rise || t.u)) b.push('the stretch is not eight straight pieces facing the old mouth'); const lastT = pl.route.tiles[7]; if (lastT.i !== H.o.i - 1 || lastT.k !== H.o.k) b.push('the stretch does not end beside the old mouth');
    if (!/extend the line: Vacuum Hose, 8 pieces \(4\.8 m\)/.test(io.hint().replace(/<[^>]+>/g, '')) || !/uses 8 you hold/.test(io.hint()) || !/new opening/.test(io.hint())) b.push('route hint: ' + io.hint());
    if (H.hoses().length !== 6) b.push('a hose was laid before the second click');
    // plush on the floor near the new far end, and one by the old mouth (which must not suck any more)
    const sim = g.sim, zc = cellZ(H.o.k);
    H.spill(cellX(H.o.i - 8) - 1.4, zc, pools[0][2]); H.spill(cellX(H.o.i - 8) - 1.0, zc + 0.4, pools[0][3]); H.spill(cellX(H.o.i - 7) - 0.6, zc - 0.5, pools[0][4]);
    H.spill(cellX(H.o.i) - 1.0, zc + 2.4, pools[0][5]);   // 2.4 m to the side of the old mouth and 4 m from the new one: nothing takes it
    const t0 = total(vault);
    io.click(0); adv(0.05); H.rebuild();
    const hs = H.hoses(); if (hs.length !== 14) return 'pieces ' + hs.length;
    const mouths = H.mouths(); if (mouths.length !== 1 || mouths[0].i !== H.o.i - 8 || mouths[0].k !== H.o.k) b.push('mouths: ' + mouths.map((m) => m.i - H.o.i).join());
    if (!old.fed) b.push('the old mouth is still an intake'); if (L().mouthMesh.count !== 1 || L().ringMesh.count !== 1) b.push('mouth meshes ' + L().mouthMesh.count);
    if (H.follow(mouths[0]) !== 14) b.push('not one line: ' + H.follow(mouths[0])); if (L().bendN !== 0) b.push('bends ' + L().bendN);
    if (hs.some((t) => t.tier || t.rise || !t.hose)) b.push('a new piece is not a plain hose');
    if ((S().items.hose || 0) !== n0 - 8 || Math.abs(S().money - m0) > 1e-9) b.push(`stock ${n0} -> ${S().items.hose}, money ${m0} -> ${S().money}`);
    if (!g.bplan.start || !g.bplan.start.ext || g.bplan.start.i !== H.o.i - 8) b.push('no carry on from the new mouth: ' + JSON.stringify(g.bplan.start && g.bplan.start.ext));
    if (total(vault) !== t0) b.push(`plush ${t0} -> ${total(vault)} when it was laid`);
    B.seconds(14);
    // the two in the old tube and the three at the new mouth reached the vault; the one by the old mouth is still on the floor; nothing was lost
    if (vault.stored.length !== 5) b.push('the vault holds ' + vault.stored.length + ' (wanted 2 from the old tube and 3 from the new mouth)');
    let left = false; for (let q = 0; q < sim.n; q++) if (sim.sp[q] === pools[0][5]) left = true; if (!left) b.push('the old mouth sucked');
    if (total(vault) !== t0) b.push(`plush ${t0} -> ${total(vault)}`);
    done(); return bad(b);
  });

  await T('extend.twice-in-a-row-by-click-and-by-drag', async () => {
    H.setup(80); const b = []; await lay(4); const vault = B.vaultAt(H.o.i + 4, H.o.k); void vault; H.rebuild();
    await H.aim(0, 0, 0); io.click(0); await H.aim(-2, 0, 0); io.click(0); adv(0.05);
    if (H.hoses().length !== 6 || H.mouths().length !== 1) b.push(`first stretch: ${H.hoses().length} pieces, ${H.mouths().length} mouths`);
    // it goes on from the new mouth with no new press on it
    let pl = await H.aim(-5, 0, 0); if (!pl || !pl.ok || pl.route.tiles.length !== 3) return 'second stretch ' + JSON.stringify([pl && pl.ok, pl && pl.why, pl && pl.route && pl.route.tiles.length]); io.click(0); adv(0.05);
    if (H.hoses().length !== 9 || H.mouths().length !== 1 || H.mouths()[0].i !== H.o.i - 5) b.push(`second stretch: ${H.hoses().length} pieces, mouth at ${H.mouths().map((m) => m.i - H.o.i)}`);
    io.tap('KeyQ'); if (g.bplan.start || g.bplan.on) b.push('Q did not put the extension down');
    // press on the mouth, drag deeper, let go: the stretch is laid, as the cord is
    pl = await H.aim(-5, 0, 0); if (!pl || !pl.extAim) return 'no outline on the new mouth';
    io.mouseDown(0); await H.aim(-9, 0, 0); io.mouseUp(0); await H.aim(-9, 0, 0); adv(0.05);
    if (H.hoses().length !== 13 || H.mouths().length !== 1 || H.mouths()[0].i !== H.o.i - 9) b.push(`drag: ${H.hoses().length} pieces, mouth at ${H.mouths().map((m) => m.i - H.o.i)}`);
    if (H.follow(H.mouths()[0]) !== 13) b.push('not one line after three extensions');
    // a drag is as long as the pieces you hold: with 2 hoses left a long drag lays 2 and says so
    done(); S().items.hose = 2; g.rebuildTools(); H.K.equip('hose'); pl = await H.aim(-9, 0, 0);
    io.mouseDown(0); pl = await H.aim(-13, 0, 0); if (!pl || !pl.cut || pl.route.tiles.length !== 2) b.push('the cord was not cut to what is held: ' + JSON.stringify(pl && [pl.ok, pl.why, pl.cut, pl.route && pl.route.tiles.length]));
    else if (pl.route.tiles[1].i !== H.o.i - 10) b.push('the cut took the wrong end: the pieces beside the old mouth must stay');
    io.mouseUp(0); await H.aim(-13, 0, 0); adv(0.05); if (H.hoses().length !== 15 || H.mouths()[0].i !== H.o.i - 11) b.push(`cut cord laid ${H.hoses().length}, mouth ${H.mouths().map((m) => m.i - H.o.i)}`);
    done(); return bad(b);
  });

  await T('extend.refused-on-ends-that-are-not-open-out-of-reach-without-money-and-on-blocked-cells', async () => {
    H.setup(80); const b = []; await lay(6); B.vaultAt(H.o.i + 6, H.o.k); H.rebuild();
    // the last piece and a middle piece are not loose starts: no outline (the last piece still carries a line on from its end, as ever)
    for (const di of [2, 5]) { const pl = await H.aim(di, 0, 0); if (pl && pl.extAim) b.push('a piece that is fed offers to extend: ' + di); }
    // a belt feeding the mouth makes it a joint
    const feeder = B.lay(0, 1, H.o.i - 1, H.o.k, 0); H.rebuild(); let pl = await H.aim(0, 0, 0); if (pl && pl.extAim) b.push('a fed mouth offers to extend'); g.doDecon({ kind: 'tile', id: feeder[0].id }); H.rebuild();
    // a belt in hand does not extend a hose, and a hose in hand does not extend a belt
    S().items.belt = 5; g.rebuildTools(); H.K.equip('belt'); pl = await H.aim(0, 0, 0); if (pl && pl.extAim) b.push('a belt in hand offers to extend a hose'); H.K.equip('hose');
    // a one piece line has no loose start (its end carries on, as before)
    const lone = g.placeEntity('belt', { i: H.o.i + 3, j: 0, k: H.o.k + 4, dir: 0, rise: 0, hose: true, items: [] }, { quiet: true, rebuild: false }); L().dirty = true; H.rebuild(); pl = await H.aim(3, 4, 0); if (pl && pl.extAim) b.push('a lone piece offers to extend');
    g.doDecon({ kind: 'tile', id: lone.id }); H.rebuild();
    // anchored: the aim on the old mouth itself, on a cell in the way, and no money and no hoses
    await H.aim(0, 0, 0); io.click(0); pl = await H.aim(0, 0, 0); if (!pl || pl.ok || !/new opening should be/.test(pl.why || '')) b.push('aiming at the old mouth: ' + JSON.stringify(pl && [pl.ok, pl.why]));
    const wallV = B.vaultAt(H.o.i - 5, H.o.k + 1); pl = await H.aim(-5, 1, 0); if (!pl || pl.ok) b.push('a stretch ending in a vault was allowed'); g.doDecon({ kind: 'tile', id: wallV.id });
    S().items.hose = 0; S().money = 0; g.rebuildTools(); pl = await H.aim(-6, 0, 0); if (!pl || pl.ok || !/Not enough money/.test(pl.why || '')) b.push('no money: ' + JSON.stringify(pl && [pl.ok, pl.why]));
    const n0 = H.hoses().length; io.click(0); adv(0.05); if (H.hoses().length !== n0) b.push('a stretch was laid with no money');
    done();
    // the cell beside the old mouth blocked on all three join sides: nothing to join
    S().money = 1e12; g.rebuildTools(); const blocks = [B.vaultAt(H.o.i - 1, H.o.k), B.vaultAt(H.o.i, H.o.k + 1), B.vaultAt(H.o.i, H.o.k - 1)]; H.rebuild(); void blocks;
    craftHose(80); H.K.equip('hose'); await H.aim(0, 0, 0); io.click(0); pl = await H.aim(-6, 0, 0); if (pl && pl.ok) b.push('a stretch with every join cell blocked was allowed: ' + (pl.route && pl.route.tiles.length));
    done(); for (const v of blocks) g.doDecon({ kind: 'tile', id: v.id }); H.rebuild();
    return bad(b);
  });

  await T('extend.the-host-refuses-forged-and-impossible-extensions', async () => {
    H.setup(80); const b = []; await lay(6); B.vaultAt(H.o.i + 6, H.o.k); H.rebuild();
    const t = (di) => [H.o.i + di, 0, H.o.k, 0, 0, 0], str = (a, c) => { const r = []; for (let d = a; d <= c; d++) r.push(t(d)); return r; };
    const count = () => H.hoses().length, c0 = count(), good = { i: H.o.i, j: 0, k: H.o.k };
    const tries = [
      ['a missing piece', 0, str(-3, -1), true, { i: H.o.i - 40, j: 0, k: H.o.k }], ['a piece that is fed', 0, str(5, 5), true, { i: H.o.i + 2, j: 0, k: H.o.k }],
      ['the wrong kind', 0, str(-3, -1), false, good], ['a forged mark', 2, str(-3, -1), true, good], ['non finite coordinates', 0, str(-3, -1), true, { i: NaN, j: 0, k: Infinity }],
      ['a string for a cell', 0, str(-3, -1), true, { i: '0', j: 0, k: 0 }], ['an id', 0, str(-3, -1), true, 7], ['a stretch that stops short', 0, str(-4, -2), true, good],
      ['a stretch from in front of the start', 0, [t(2), t(1)].map((x, n) => [x[0], 0, x[2], 2, 0, 0]), true, good], ['a ramp', 0, [[H.o.i - 2, 0, H.o.k, 0, 1, 0], [H.o.i - 1, 1, H.o.k, 0, 0, 0]], true, good],
      ['too long', 0, (() => { const r = []; for (let d = -65; d <= -1; d++) r.push(t(d)); return r; })(), true, good], ['a stretch that is not connected', 0, [t(-5), t(-1)], true, good],
    ];
    for (const [name, tier, tl, hose, ext] of tries) { const r = BP.lay(g, tier, tl, hose, ext); H.rebuild(); if (r.ok || count() !== c0) b.push(name + ' was laid: ' + JSON.stringify(r.why)); }
    // the real thing works, and a second try at the same start (now fed) does not
    const ok = BP.lay(g, 0, str(-3, -1), true, good); H.rebuild(); if (!ok.ok || count() !== c0 + 3) b.push('a good extension was refused: ' + ok.why);
    const again = BP.lay(g, 0, str(-3, -1), true, good); if (again.ok) b.push('the old mouth was extended a second time after it became a joint');
    const side = BP.lay(g, 0, [[H.o.i - 3, 0, H.o.k - 1, 1, 0, 0]], true, { i: H.o.i - 3, j: 0, k: H.o.k }); H.rebuild(); if (!side.ok) b.push('a side join was refused: ' + side.why); if (H.mouths().length !== 1) b.push('mouths ' + H.mouths().length);
    return bad(b);
  });

  await T('extend.the-hammer-takes-the-new-stretch-down-piece-by-piece-and-the-old-mouth-is-a-mouth-again', async () => {
    H.setup(80); const b = []; await lay(6); B.vaultAt(H.o.i + 6, H.o.k); H.rebuild(); const old = H.tileAt(0, 0);
    await H.aim(0, 0, 0); io.click(0); await H.aim(-5, 0, 0); io.click(0); adv(0.05); H.rebuild(); done(); if (H.hoses().length !== 11) return 'pieces ' + H.hoses().length;
    const n0 = S().items.hose || 0;
    ctx.selectTool('hammer');
    for (let d = -5; d <= -1; d++) { H.K.aimDir(cellX(H.o.i + d), 0, cellZ(H.o.k), 0, 2.0); adv(0.2); await ctx.plan(); io.click(0); adv(0.3); }
    H.rebuild(); if (H.hoses().length !== 6 || (S().items.hose || 0) !== n0 + 5) b.push(`after the hammer: ${H.hoses().length} pieces (${H.hoses().map((t) => t.i - H.o.i).join()}), ${(S().items.hose || 0) - n0} hoses back`);
    if (!H.tileAt(0, 0) || H.tileAt(0, 0) !== old || old.fed || H.mouths().length !== 1 || H.mouths()[0] !== old) b.push('the old mouth is not the mouth again'); if (H.follow(old) !== 6) b.push('the old line is not whole: ' + H.follow(old));
    H.K.equip('hose'); done(); return bad(b);
  });

  await T('extend.a-save-and-load-keeps-the-extended-line-and-its-one-mouth', async () => {
    H.setup(80); const b = []; await lay(6); B.vaultAt(H.o.i + 6, H.o.k); H.rebuild();
    await H.aim(0, 0, 0); io.click(0); await H.aim(-4, -3, 0); io.click(0); adv(0.05); done(); H.rebuild();
    const look = () => { H.rebuild(); return JSON.stringify({ n: H.hoses().length, bends: L().bendN, mouths: L().mouthMesh.count, tubes: L().hoseMesh.count, tiles: H.hoses().map((t) => `${t.i},${t.j},${t.k},${t.dir}`).sort(), mouth: H.mouths().map((t) => `${t.i},${t.k}`) }); };
    const before = look(); if (H.hoses().length !== 6 + 7 || H.mouths().length !== 1) return 'the extension did not lay 7: ' + H.hoses().length;
    g.noSave = false; g.mode = 'play'; const okS = g.save(); g.noSave = true; if (!okS) return 'save failed';
    const saved = loadSaved(); g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play';
    const after = look(); if (before !== after) b.push('before ' + before + ' after ' + after);
    // and it can be extended again after the load
    H.K.equip('hose'); S().money = 1e12; craftHose(40); H.K.equip('hose'); H.o.i = ctx.toI(-20); H.o.k = ctx.toK(6);
    const m = H.mouths()[0]; const pl = await (async () => { H.K.aimDir(cellX(m.i), 0, cellZ(m.k), 0, 2.0); return ctx.plan(); })(); if (!pl || !pl.extAim) b.push('the mouth of a loaded line does not offer to extend');
    done(); return bad(b);
  });

  await T('extend.aiming-costs-a-constant-and-extending-adds-nothing-to-the-tick', async () => {
    H.setup(200); const b = []; await lay(40); B.vaultAt(H.o.i + 40, H.o.k); H.rebuild();
    const bench = async (di) => { const t0 = performance.now(); for (let q = 0; q < 60; q++) { H.K.aimDir(cellX(H.o.i + di), 0, cellZ(H.o.k), 0, 2.0); await ctx.plan(); } return (performance.now() - t0) / 60; };
    const onMouth = await bench(0), onMiddle = await bench(20);
    if (onMouth > onMiddle * 3 + 3) b.push(`aiming at a mouth costs ${onMouth.toFixed(2)} ms, at a middle piece ${onMiddle.toFixed(2)} ms`);
    const tick = (n) => { const t0 = performance.now(); B.step(1 / 60, n); return (performance.now() - t0) / n; };
    L().dirty = true; tick(5); const flat = tick(120);
    await H.aim(0, 0, 0); io.click(0); await H.aim(-12, 0, 0); io.click(0); adv(0.05); done(); L().dirty = true; tick(5); const longer = tick(120);
    if (longer > flat * 1.6 + 0.2) b.push(`a tick costs ${flat.toFixed(3)} ms with 40 pieces and ${longer.toFixed(3)} ms with 52`);
    return bad(b);
  });
}
