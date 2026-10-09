// hose.* : the Vacuum Hose as a player lays it. One hose with exactly one flared mouth at its open start, however it is built (from the source toward the bin, from the bin
// back to the source, from the middle, with the mouse swept while B is held); it bends in real quarter circles like a belt does; R turns the next piece; the hammer and X give
// every piece back. Every piece goes down through the real planner and a real B key press.
import { makeHoseKit } from './hose_lib.js';

export default async function (ctx) {
  const { g, S, L, adv } = ctx;
  const H = makeHoseKit(ctx), T = H.B.T, io = H.io;
  const bad = (a) => a.length === 0 || a.join('; ');

  await T('hose.built-from-the-source-toward-the-bin-has-one-mouth', async () => {
    H.setup(); const b = [];
    for (let s = 0; s < 6; s++) { const pl = await H.put(s, 0, 0); if (!pl || !pl.ok) b.push(`piece ${s}: ${pl && pl.why}`); }
    const hs = H.hoses(); if (hs.length !== 6) b.push('pieces laid ' + hs.length);
    const m = H.mouths(); if (m.length !== 1) b.push('mouths ' + m.length); else if (m[0].i !== H.o.i) b.push('the mouth is not the first piece');
    if (L().mouthMesh.count !== 1 || L().ringMesh.count !== 1) b.push(`flared mouths drawn ${L().mouthMesh.count}, rings ${L().ringMesh.count}`);
    if (H.follow(m[0]) !== 6) b.push('the pieces are not one line: ' + H.follow(m[0]));
    if (L().hoseMesh.count !== 6 || L().bendN !== 0) b.push(`straight tubes ${L().hoseMesh.count}, bends ${L().bendN}`);
    return bad(b);
  });

  await T('hose.built-from-the-bin-back-to-the-source-has-one-mouth', async () => {
    H.setup(); const b = [];
    // the first piece goes down at the east end facing east (toward the bin); then you walk west, facing west, and keep pressing B
    let pl = await H.put(8, 0, 0); if (!pl.ok) return pl.why;
    for (let s = 7; s >= 3; s--) { pl = await H.put(s, 0, 2); if (!pl.ok) b.push(`piece ${s}: ${pl.why}`); }
    const hs = H.hoses(); if (hs.length !== 6) b.push('pieces laid ' + hs.length);
    if (hs.some((t) => t.dir !== 0)) b.push('a piece faces away from the line: ' + H.dirsOf().join(''));
    const m = H.mouths(); if (m.length !== 1) b.push('mouths ' + m.length); else if (m[0].i !== H.o.i + 3) b.push('the mouth is not at the far (west) end');
    if (L().mouthMesh.count !== 1) b.push('flared mouths drawn ' + L().mouthMesh.count);
    if (m[0] && H.follow(m[0]) !== 6) b.push('not one line');
    return bad(b);
  });

  await T('hose.built-from-the-middle-outward-has-one-mouth', async () => {
    H.setup(); const b = [];
    await H.put(0, 0, 0); await H.put(1, 0, 0); await H.put(-1, 0, 2); await H.put(2, 0, 0); await H.put(-2, 0, 2);
    const hs = H.hoses(); if (hs.length !== 5) b.push('pieces laid ' + hs.length); if (hs.some((t) => t.dir !== 0)) b.push('dirs ' + H.dirsOf().join(''));
    const m = H.mouths(); if (m.length !== 1 || (m[0] && m[0].i !== H.o.i - 2)) b.push('mouths ' + m.map((t) => t.i - H.o.i).join(','));
    if (L().mouthMesh.count !== 1) b.push('flared mouths drawn ' + L().mouthMesh.count);
    return bad(b);
  });

  await T('hose.a-piece-beside-the-open-end-turns-it-and-the-bend-is-a-real-arc', async () => {
    H.setup(); const b = [];
    for (let s = 0; s < 4; s++) await H.put(s, 0, 0);
    const pl = await H.aim(3, -1, 3); if (!pl.ent.turnPrev || pl.ent.dir !== 3) b.push('no turn planned: ' + JSON.stringify(pl.ent));
    for (let s = 1; s <= 3; s++) await H.put(3, -s, 3);
    const hs = H.hoses(); if (hs.length !== 7) b.push('pieces ' + hs.length);
    const corner = H.tileAt(3, 0); if (!corner || corner.dir !== 3 || corner.cd !== 0) b.push('the turned piece is not a bend: ' + JSON.stringify(corner && { dir: corner.dir, cd: corner.cd }));
    if (L().bendN !== 1) b.push('bends drawn ' + L().bendN); if (L().hoseMesh.count !== 6) b.push('straight tubes ' + L().hoseMesh.count);
    if (H.mouths().length !== 1) b.push('mouths ' + H.mouths().length); if (L().mouthMesh.count !== 1) b.push('flared mouths ' + L().mouthMesh.count);
    return bad(b);
  });

  await T('hose.s-bend-and-u-turn-have-smooth-bends-of-the-right-hand-and-one-mouth', async () => {
    H.setup(); const b = [];
    // east x3, north x3 (a left turn), east x3 (a right turn): an S
    for (let s = 0; s < 3; s++) await H.put(s, 0, 0);
    for (let s = 1; s <= 3; s++) await H.put(2, -s, 3);
    for (let s = 3; s <= 5; s++) await H.put(s, -3, 0);
    if (H.hoses().length !== 9) b.push('S pieces ' + H.hoses().length);
    const left = L().bendLMesh.count, right = L().bendRMesh.count; if (left !== 1 || right !== 1) b.push(`S bends: left ${left}, right ${right}`);
    if (H.mouths().length !== 1) b.push('S mouths ' + H.mouths().length);
    // a U turn: east x3, south x3 (a right turn), west x3 (another right turn): two bends of the same hand
    for (const t of H.hoses()) L().remove(t); S().entities = S().entities.filter((e) => !e.hose); g._lastLaid = null; adv(0.05);
    for (let s = 0; s < 3; s++) await H.put(s, -8, 0);
    for (let s = -7; s <= -5; s++) await H.put(2, s, 1);
    for (let s = 1; s >= -1; s--) await H.put(s, -5, 2);
    H.rebuild(); const l2 = L().bendLMesh.count, r2 = L().bendRMesh.count; if (!(l2 === 0 && r2 === 2)) b.push(`U bends: left ${l2}, right ${r2}`);
    if (H.mouths().length !== 1) b.push('U mouths ' + H.mouths().length);
    return bad(b);
  });

  await T('hose.holding-b-and-sweeping-the-mouse-lays-one-connected-line', async () => {
    H.setup(); const b = [];
    // the aim steps diagonally and jumps two cells: without the cells between, each piece would be a line of its own with its own mouth
    const cells = [[0, 0], [1, 0], [2, 1], [3, 1], [5, 1], [6, 3], [7, 4], [7, 6], [8, 7]];
    const have0 = S().items.hose; await H.hold(cells, 0);
    const hs = H.hoses(); const used = have0 - (S().items.hose || 0); if (used !== hs.length) b.push(`used ${used} hoses for ${hs.length} pieces`);
    const m = H.mouths(); if (m.length !== 1) b.push('mouths ' + m.length + ' of ' + hs.length + ' pieces');
    if (m[0] && H.follow(m[0]) !== hs.length) b.push(`the line from the mouth is ${H.follow(m[0])} of ${hs.length} pieces`);
    for (const [di, dk] of cells) if (!H.tileAt(di, dk)) b.push(`no piece at the aimed cell ${di},${dk}`);
    if (L().mouthMesh.count !== 1) b.push('flared mouths ' + L().mouthMesh.count); if (L().bendN < 4) b.push('bends drawn ' + L().bendN);
    return bad(b);
  });

  await T('hose.holding-b-and-walking-straight-lays-a-line-and-turning-the-view-curves-it', async () => {
    H.setup(); const b = [];
    await H.hold(Array.from({ length: 10 }, (_, s) => [s, 0]), 0); if (H.hoses().length !== 10 || H.mouths().length !== 1) b.push(`straight: ${H.hoses().length} pieces, ${H.mouths().length} mouths`);
    // now turn the view north and keep holding B: the line curves
    await H.hold(Array.from({ length: 6 }, (_, s) => [9, -s - 1]), 3);
    if (H.hoses().length < 15 || H.mouths().length !== 1) b.push(`turned: ${H.hoses().length} pieces, ${H.mouths().length} mouths`);
    const m = H.mouths()[0]; if (m && H.follow(m) !== H.hoses().length) b.push('the turned line is not one line');
    if (L().bendN < 1) b.push('no bend drawn');
    return bad(b);
  });

  await T('hose.a-single-press-a-few-cells-past-the-last-piece-joins-it-but-a-far-one-starts-a-new-hose', async () => {
    H.setup(); const b = [];
    await H.put(0, 0, 0); await H.put(1, 0, 0); await H.put(4, 0, 0);   // two cells of gap: filled
    if (H.hoses().length !== 5 || H.mouths().length !== 1) b.push(`near: ${H.hoses().length} pieces, ${H.mouths().length} mouths`);
    await H.put(10, 3, 0);   // far: its own hose
    if (H.hoses().length !== 6 || H.mouths().length !== 2) b.push(`far: ${H.hoses().length} pieces, ${H.mouths().length} mouths`);
    return bad(b);
  });

  await T('hose.r-turns-the-next-piece-a-quarter-turn-and-the-mouse-turns-it-back', async () => {
    H.setup(); const b = [];
    let pl = await H.aim(0, 0, 0); if (pl.ent.dir !== 0) return 'the piece does not face the way I look: ' + pl.ent.dir;
    io.clearHint(); io.tap('KeyR'); const rh = io.hint(); pl = await H.aim(0, 0, 0); if (pl.ent.dir !== 1) b.push('R once gave dir ' + pl.ent.dir); if (!/quarter turn/.test(rh)) b.push('hint: ' + rh);
    io.tap('KeyR'); pl = await H.aim(0, 0, 0); if (pl.ent.dir !== 2) b.push('R twice gave dir ' + pl.ent.dir);
    io.tap('KeyR'); io.tap('KeyR'); pl = await H.aim(0, 0, 0); if (pl.ent.dir !== 0) b.push('R four times gave dir ' + pl.ent.dir);
    io.tap('KeyR'); pl = await H.aim(0, 0, 0); const turned = pl.ent.dir === 1; pl = await H.aim(0, 0, 2); if (!turned || pl.ent.dir !== 2) b.push('turning the mouse did not set the turn back: ' + pl.ent.dir);
    // the turned piece is what B sets down
    io.tap('KeyR'); await H.put(0, 4, 2); const t = H.tileAt(0, 4); if (!t || t.dir !== 3) b.push('B set the piece down facing ' + (t && t.dir));
    return bad(b);
  });

  await T('hose.a-piece-in-front-of-the-end-keeps-going-when-you-look-back-along-the-line', async () => {
    H.setup(); const b = [];
    for (let s = 0; s < 3; s++) await H.put(s, 0, 0);
    const pl = await H.put(3, 0, 2); if (!pl.ok) return pl.why;   // standing east of the end, facing west: the piece would face the end head on
    const t = H.tileAt(3, 0); if (!t || t.dir !== 0) b.push('the piece in front of the end faces ' + (t && t.dir) + ', not on along the line');
    if (H.mouths().length !== 1) b.push('mouths ' + H.mouths().length); if (H.follow(H.mouths()[0]) !== 4) b.push('not one line');
    // a turn is still a turn: facing north there makes the piece a bend
    await H.put(4, 0, 3); const u = H.tileAt(4, 0); if (!u || u.dir !== 3) b.push('a piece in front of the end, faced north, does not turn: ' + (u && u.dir));
    return bad(b);
  });

  await T('hose.a-loop-around-an-obstacle-swept-with-the-mouse-is-one-hose-with-one-mouth', async () => {
    H.setup(); const b = [];
    for (let di = 3; di <= 5; di++) for (let dk = -2; dk <= -1; dk++) H.B.floorAt(H.o.i + di, 0, H.o.k + dk);   // a block of bulkhead in the middle of the loop
    // the player faces along each leg of the loop (so never stands in the block): east, north, east, south, west
    const path = []; for (let s = 0; s <= 2; s++) path.push([s, 0, 0]); for (let s = 1; s <= 3; s++) path.push([2, -s, 3]); for (let s = 3; s <= 6; s++) path.push([s, -3, 0]); for (let s = -2; s <= 0; s++) path.push([6, s, 1]); path.push([5, 0, 2], [4, 0, 2]);
    await H.hold(path, 0);
    const hs = H.hoses(), m = H.mouths(); if (hs.length !== path.length) b.push(`${hs.length} pieces for ${path.length} cells`); if (m.length !== 1) b.push('mouths ' + m.length);
    if (m[0] && H.follow(m[0]) !== hs.length) b.push('the loop is not one line: ' + H.follow(m[0]) + ' of ' + hs.length); if (L().bendN !== 4) b.push('bends ' + L().bendN);
    const last = H.tileAt(4, 0); if (!last || last.dir !== 2) b.push('the loop does not end heading west: ' + (last && last.dir));
    return bad(b);
  });

  await T('hose.the-hammer-and-x-take-a-piece-down-and-give-one-hose-back', async () => {
    H.setup(10); const b = [];
    for (let s = 0; s < 5; s++) await H.put(s, 0, 0);
    const n0 = S().items.hose || 0, c0 = H.hoses().length;
    // the hammer (slot 1): aim at a piece and click
    ctx.selectTool('hammer'); H.K.aimDir(ctx.cellX(H.o.i + 2), 0, ctx.cellZ(H.o.k), 0, 2.0); await ctx.plan(); io.click(0); adv(0.05);
    if (H.hoses().length !== c0 - 1 || (S().items.hose || 0) !== n0 + 1) b.push(`hammer: pieces ${H.hoses().length}, hoses ${S().items.hose || 0} (was ${c0} and ${n0})`);
    // X with the hose in hand
    H.K.equip('hose'); H.K.aimDir(ctx.cellX(H.o.i + 4), 0, ctx.cellZ(H.o.k), 0, 2.0); await ctx.plan(); io.tap('KeyX'); adv(0.05);
    if (H.hoses().length !== c0 - 2 || (S().items.hose || 0) !== n0 + 2) b.push(`X: pieces ${H.hoses().length}, hoses ${S().items.hose || 0}`);
    // what is left of the line is still sound: the cut is one open end, the first piece still the only mouth of its part
    const m = H.mouths(); if (m.length < 1) b.push('no mouth left');
    return bad(b);
  });

  await T('hose.no-splitter-or-junction-goes-on-a-hose', async () => {
    H.setup(); const b = [];
    for (let s = 0; s < 3; s++) await H.put(s, 0, 0);
    S().items.splitter = 2; g.rebuildTools(); H.K.equip('splitter'); const pl = await H.aim(1, 0, 0);
    if (pl && pl.ok) b.push('a splitter plan on a hose is ok: ' + (pl.ent && pl.ent.type));
    if (pl && !/no splitters/.test(pl.why || '')) b.push('the reason: ' + (pl && pl.why));
    const t = H.tileAt(1, 0); if (t.splitter) b.push('the hose piece became a splitter');
    return bad(b);
  });
}
