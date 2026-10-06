// build.*: ramps, truck ramps and stairs (walkable colliders, not cells), the player's walk hook, landings, clearance and the hammer.
import { makeShell, DX, DZ } from './build_lib.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, adv, V3, cellX, cellZ, toI, toK, craft, selectTool, plan } = ctx;
  const K = makeShell(ctx), B = K.B, C = 0.6;
  const I0 = () => toI(-11), K0 = () => toK(2);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { p().crouch = false; K.clean(); } });
  const stats = () => ({ walk: g.T.walk, crouchMul: g.T.crouchMul, jump: g.T.jump });
  const input = (o = {}) => ({ fwd: 1, back: 0, left: 0, right: 0, sprint: false, crouch: false, jump: false, ...o });
  // walk the player from (x, z) along dir for `secs`, returning the samples [x, y, z]
  const walk = (x, z, dir, secs, o = {}) => {
    p().pos.set(x, o.y ?? 0, z); p().vel.set(0, 0, 0); p().yaw = Math.atan2(DX[dir], DZ[dir]); p().pitch = 0; p().crouch = false; p().stepOff = 0;
    const out = []; for (let n = 0; n < secs * 60; n++) { p().update(1 / 60, input(o.input), stats(), g.sim); out.push([p().pos.x, p().pos.y, p().pos.z]); } return out;
  };
  const cx = (e) => cellX(e.i0) - 0.3, cz = (e) => cellZ(e.k0) - 0.3;     // the min corner of a footprint

  await guard('build.ramp-walkable-and-truck-slope', async () => {
    K.setup(); const bad = [], i = I0(), k = K0();
    adv(0.1); if (typeof p().walk !== 'function') return 'the player has no walk hook after a few frames';
    const r = await K.put('wramp', i, k, { dir: 0 }); if (!r.ok) return 'ramp: ' + r.why; const R = r.made[0];
    if (R.dir !== 0 || R.w !== 2 || R.len !== 2 || R.rise !== 1) bad.push('shape ' + JSON.stringify([R.dir, R.w, R.len, R.rise]));
    // the surface rises linearly from the floor to one cell over two
    const x0 = cx(R), zc = cz(R) + C; const hs = [0.01, 0.3, 0.6, 0.9, 1.19].map((u) => B.surfaceAt(g, x0 + u, zc));
    const want = [0.01, 0.3, 0.6, 0.9, 1.19].map((u) => Math.min(1, u / 1.2) * C); hs.forEach((h, q) => { if (h === null || Math.abs(h - want[q]) > 0.01) bad.push(`surface at ${q}: ${h} want ${want[q]}`); });
    if (B.surfaceAt(g, x0 + 1.3, zc) !== null || B.surfaceAt(g, x0 + 0.5, zc + 1.4) !== null) bad.push('a surface outside the footprint');
    // slope numbers: 1 cell over 2 is steep for trucks; the truck ramp is 1 over 3
    if (Math.abs(B.slopeOf(R) - 0.5) > 1e-9 || B.truckOk(R)) bad.push('a plain ramp is not for trucks (slope ' + B.slopeOf(R) + ')');
    // walking up it from the floor: the feet follow the slope up to one cell (0.6 m) and stay there on the pad top beyond
    const up = walk(x0 - 1.5, zc, 0, 2.2); const top = Math.max(...up.map((a) => a[1])); const mid = up.find((a) => a[0] > x0 + 0.5); if (!mid || mid[1] < 0.2 || mid[1] > 0.45) bad.push('on the slope at its middle the feet are at ' + (mid && mid[1].toFixed(2)));
    if (top < 0.55 || top > 0.75) bad.push('top of the climb ' + top.toFixed(2));
    // the climb is smooth: no single step of the feet above 0.12 m on the slope itself
    let jump = 0; for (let q = 1; q < up.length; q++) if (up[q][0] > x0 && up[q][0] < x0 + 1.2) jump = Math.max(jump, Math.abs(up[q][1] - up[q - 1][1])); if (jump > 0.12) bad.push('the climb is jerky: ' + jump.toFixed(3));
    // and down the other way
    const down = walk(x0 + 1.15, zc, 2, 1.0, { y: 0.6 }); const lo = down[down.length - 1]; if (lo[1] > 0.1 || lo[0] > x0) bad.push('walking down ended at ' + lo.map((v) => v.toFixed(2)));
    // the flank is solid: walking sideways into the high end from the floor does not get you onto the slope or inside it
    const side = walk(x0 + 0.9, zc - 1.6, 1, 1.5); const inside = side.some((a) => a[0] > x0 + 0.3 && a[0] < x0 + 1.15 && a[2] > zc - 0.55 && a[2] < zc + 0.55 && a[1] < 0.3); if (inside) bad.push('walked into the flank of the ramp at the floor');
    // the high end wall from the floor beyond it: blocked, not walked through
    // (the ground there is level with the ramp's foot, so the high end is a 0.6 m wall: the player steps up onto the top like any one cell ledge, never into the wedge)
    const beyond = walk(x0 + 1.9, zc, 2, 1.0); const wedge = beyond.some((a) => a[0] > x0 + 0.2 && a[0] < x0 + 1.1 && a[1] < 0.2); if (wedge) bad.push('walked into the wedge from its high end at floor level');
    // the truck ramp: 4 wide, 1 over 3, gentle enough
    const t = await K.put('wramp:haul', i + 8, k, { dir: 0 }); if (!t.ok) bad.push('truck ramp: ' + t.why); else { const TR = t.made[0]; if (TR.w !== 4 || TR.len !== 3 || !B.truckOk(TR) || Math.abs(B.slopeOf(TR) - 1 / 3) > 1e-9) bad.push('truck ramp shape/slope ' + JSON.stringify([TR.w, TR.len, B.slopeOf(TR)])); const tx = cx(TR); const hh = B.surfaceAt(g, tx + 1.79, cz(TR) + 1.2); if (hh === null || Math.abs(hh - C * 1.79 / 1.8) > 0.02) bad.push('truck ramp surface ' + hh); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.stair-has-treads-and-meets-a-raised-pad', async () => {
    K.setup(); const bad = [], i = I0(), k = K0(); adv(0.1);
    // a raised landing: two pads stacked, then a stair that climbs to the upper one (it is 2 cells up)
    const a = await K.put('pad:timber', i, k, { back: 1.8 }); if (!a.ok) return a.why; const A = a.made[0];
    K.equip('pad:timber'); S().items['pad:timber'] = 3; g.rebuildTools(); K.aim(A.i0 + 1, A.k0 + 1, { y: 0.6, back: 3.2 }); let pl = await plan(); if (!pl.ok || pl.ent.j !== 1) return 'stacked pad: ' + (pl.ok ? pl.ent.j : pl.why); g.placeCurrent(g.curTool());
    const U = S().entities.filter((e) => e.type === 'pad').find((e) => e.j === 1); if (!U) return 'no upper pad';
    // aim at the top of the upper pad near its west edge: the stair climbs to it from the floor (rise 2 cells: 1.2 m)
    craft('stair', 2); K.equip('stair'); K.aim(U.i0, U.k0 + 1, { y: 1.2, back: 3.2 }); pl = await plan(); if (!pl.ok) return 'stair plan: ' + pl.why;
    if (pl.ent.j !== 0 || pl.ent.dir !== 0 || pl.ent.i0 !== U.i0 - 4 || pl.ent.len !== 4 || pl.ent.rise !== 2) bad.push('stair plan ' + JSON.stringify(pl.ent));
    g.placeCurrent(g.curTool()); const St = S().entities.find((e) => e.type === 'stair'); if (!St) return 'no stair placed';
    const x0 = cx(St), zc = cz(St) + C / 2;
    // 8 treads of 0.15 m, each 0.3 m deep: the surface steps up at 0.3 m intervals
    const hs = []; for (let n = 0; n < 8; n++) hs.push(B.surfaceAt(g, x0 + n * 0.3 + 0.15, zc)); for (let n = 0; n < 8; n++) if (hs[n] === null || Math.abs(hs[n] - (n + 1) * 0.15) > 0.011) bad.push(`tread ${n}: ${hs[n]}`);
    if (!g.machines.items.get(St.id).obj.getObjectByName('body')) bad.push('no stair mesh');
    // walk up the stair and onto the upper pad (the camera eases up each tread: the step offset is used)
    const up = walk(x0 - 1.2, zc, 0, 3.0); const topY = Math.max(...up.map((a) => a[1])); if (topY < 1.15) bad.push('did not reach the upper pad: top ' + topY.toFixed(2));
    const onTop = up.filter((a) => a[0] > cellX(U.i0) && a[0] < cellX(U.i0 + 3)); if (!onTop.length || onTop.some((a) => a[1] < 1.1)) bad.push('not standing on the upper pad: ' + onTop.map((a) => a[1].toFixed(2)).slice(0, 5));
    // a landing pad that has no ground under it is allowed next to the stair top (it rests on the stair): lay one at the stair's north side? no, beyond its high end
    const land = B.landingCells(St); if (!land.length || land.some((c) => c[1] !== St.j + St.rise - 1)) bad.push('landing cells ' + JSON.stringify(land));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.landing-pad-rests-on-the-stair-top', async () => {
    K.setup(); const bad = [], i = I0(), k = K0();
    // a stair on open floor, then a pad 2 cells up over its high end with nothing under it: only the stair top carries it
    const st = await K.put('stair', i, k, { dir: 0 }); if (!st.ok) return st.why; const St = st.made[0];
    const land = B.landingCells(St)[0]; const piece = { type: 'pad', mk: 'timber', i0: land[0], k0: land[2] - 1, j: land[1] };
    const why = B.checkPiece(g, piece, { skipPlayer: true }); if (why) bad.push('a pad on the stair landing was refused: ' + why);
    const far = { type: 'pad', mk: 'timber', i0: land[0] + 6, k0: land[2] - 1, j: land[1] }; if (!B.checkPiece(g, far, { skipPlayer: true })) bad.push('a floating pad away from the stair was allowed');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.slopes-need-clear-ground-and-headroom', async () => {
    K.setup(); const bad = [], i = I0(), k = K0(); craft('wramp', 3); craft('stair', 3); K.equip('wramp');
    const tryAt = async (id, di, dk, o = {}) => { K.equip(id); K.aim(i + di, k + dk, { dir: 0, ...o }); return plan(); };
    let pl = await tryAt('wramp', 0, 0); if (!pl.ok) return 'clear floor refused: ' + pl.why;
    K.plushAt(i + 1, 1, k, 1); pl = await tryAt('wramp', 0, 0); if (pl.ok || !/Dig out/.test(pl.why)) bad.push('plush on the footprint was allowed: ' + (pl.ok ? 'ok' : pl.why)); w().removeCell(i + 1, 1, k, false);
    K.plushAt(i, 3, k, 1); pl = await tryAt('wramp', 0, 0); if (pl.ok) bad.push('plush in the headroom of a ramp was allowed'); w().removeCell(i, 3, k, false);
    K.plushAt(i, 4, k, 1); pl = await tryAt('wramp', 0, 0); if (!pl.ok) bad.push('a ramp needs rise + 3 = 4 rows: plush at row 4 should be fine, got ' + pl.why); pl = await tryAt('stair', 0, 0); if (pl.ok) bad.push('a stair needs 5 rows: plush at row 4 was allowed'); w().removeCell(i, 4, k, false);
    K.plushAt(i, 5, k, 1); pl = await tryAt('stair', 0, 0); if (!pl.ok) bad.push('plush at row 5 is above a stair: ' + pl.why); w().removeCell(i, 5, k, false);
    // a belt on the floor under it
    const bt = { id: g.nextId(), type: 'belt', i: i + 1, j: 0, k, dir: 0, rise: 0, items: [] }; S().entities.push(bt); g.addEntity(bt); pl = await tryAt('wramp', 0, 0); if (pl.ok) bad.push('a ramp over a belt was allowed'); L().remove(bt); S().entities = S().entities.filter((x) => x.id !== bt.id);
    // two ramps do not share a column
    K.equip('wramp'); K.aim(i, k); pl = await plan(); g.placeCurrent(g.curTool()); pl = await tryAt('wramp', 0, 0); if (pl.ok) bad.push('a second ramp on the first was allowed');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.ramp-and-stair-hammer-pick-and-return', async () => {
    K.setup(); const bad = [], i = I0(), k = K0(); adv(0.1);
    for (const [id, dk] of [['wramp', 0], ['stair', 6]]) {
      const r = await K.put(id, i, k + dk, { dir: 0 }); if (!r.ok) { bad.push(id + ': ' + r.why); continue; } const E = r.made[0];
      const s = B.cellsOf ? null : null; void s;
      const x0 = cx(E), zc = cz(E) + (E.w * C) / 2, y = E.rise * C * 0.3;
      // aim at the slope from the side: the hammer picks it
      g.stowed = true; K.aim(E.i0 + 1, E.k0, { y, back: 2.4, pitchTo: { x: x0 + 0.6, y, z: zc } }); selectTool('hammer'); g.updateBuild(g.curTool(), p().eyePos(new V3()), p().forward(new V3()));
      const ref = g.hammerTarget(); if (!ref || ref.id !== E.id) { bad.push(`${id}: hammer ref ${JSON.stringify(ref)}`); continue; }
      const cells = []; for (let r2 = 0; r2 < E.rise; r2++) for (let dz = 0; dz < ((E.dir & 1) ? E.len : E.w); dz++) for (let dx = 0; dx < ((E.dir & 1) ? E.w : E.len); dx++) cells.push((( E.j + r2) * ctx.cfg.NZ + E.k0 + dz) * ctx.cfg.NX + E.i0 + dx);
      if (!cells.every((c) => w().reserved.has(c))) bad.push(id + ': its cells are not reserved');
      g.hammerHit(); if (S().items[id] !== 1 || S().entities.some((e) => e.id === E.id) || g.machines.items.has(E.id)) bad.push(id + ' not handed back');
      if (cells.some((c) => w().reserved.has(c))) bad.push(id + ': reserved cells kept'); if (B.surfaceAt(g, x0 + 0.5, zc) !== null) bad.push(id + ': still walkable after the hammer');
    }
    return bad.length === 0 || bad.join(' || ');
  });
}
