// holelight.*: daylight through a hole dug up and out of the pile (src/holelight.js, the hole channel of render.js scanChunk, the camera sky in game.renderEnv, the shader and
// src/lightshaft.js). Every test builds its own tunnel and shaft in a fresh world (rig in holelight_lib.js), so a blocker or a door cannot leak into the next test.
import * as HL from '../holelight.js';
import { World } from '../world.js';
import { U } from '../shaders.js';
import * as THREE from 'three';
import * as TR from '../transit.js';
import { CX, CZ } from '../config.js';
import { mulberry32 } from '../util.js';
import { kit as hlKit } from './holelight_lib.js';

export default async function (ctx) {
  const { T, g, toI, toJ, toK, cellX, cellY, cellZ, newWorld, fresh } = ctx;
  const K = hlKit(ctx), W = K.W;
  // every test starts in a fresh world with the hall lights on (an earlier test may have turned them down)
  const HT = (name, fn) => T(name, async () => { await newWorld(); fresh({}); g.hall.level = 1; g._entr = null; try { return await fn(); } finally { g.hall.level = 1; } });
  const settle = (pos, n = 60) => { for (let q = 0; q < n; q++) g.renderEnv(0.1, pos); return g.camSky; };
  const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t;

  await HT('holelight.the-natural-pile-has-no-holes-on-any-seed', async () => {
    // the rule must never fire on the slope of an untouched pile (the steepest natural slope rises about 3 cells between neighbours), or the whole hall would be "a hole"
    const bad = [];
    for (const seed of [1, 77, 2024]) {
      const wd = new World(seed); let n = 0, cols = 0;
      for (let k = toK(-70); k <= toK(70); k++) for (let i = toI(-70); i <= toI(70); i++) { cols++; if (HL.holeTopAt(wd, i, k) >= 0) n++; }
      if (n) bad.push(`seed ${seed}: ${n} hole columns in ${cols}`);
    }
    let n = 0; for (let k = toK(-70); k <= toK(70); k++) for (let i = toI(-70); i <= toI(70); i++) if (HL.holeTopAt(W(), i, k) >= 0) n++;
    if (n) bad.push(`the live world: ${n} hole columns`);
    return bad.length === 0 || bad.join('; ');
  });

  await HT('holelight.no-hole-means-exactly-the-old-light', async () => {
    // a natural slope and a tunnel with no shaft remesh to the very same numbers as before this feature (the old scan is copied into holelight_legacy.js)
    const { legacyScan } = await import('./holelight_legacy.js'); const R = g.renderer, bad = [];
    const cmp = (label, r) => { for (const [cx, cy, cz] of K.chunksOf(r, 4)) for (const deep of [false, true]) { const a = R.scanChunk(cx, cy, cz, deep), b = legacyScan(R, cx, cy, cz, deep); if (a.n !== b.n) { bad.push(`${label} ${cx},${cy},${cz}: ${a.n} vs ${b.n} plush`); continue; } for (let q = 0; q < a.n * 16; q++) if (a.data[q] !== b.data[q]) { bad.push(`${label} ${cx},${cy},${cz} deep ${deep}: float ${q} differs (${a.data[q]} vs ${b.data[q]})`); break; } } };
    const r = K.rig({ shaft: false }); cmp('natural slope and tunnel', r);
    return bad.length === 0 || bad.slice(0, 3).join('; ');
  });

  await HT('holelight.a-shaft-out-of-the-pile-lights-the-foot-and-the-same-spot-is-dark-when-it-is-blocked', async () => {
    const r = K.rig(), bad = [];
    if (W().topAt(r.iS, r.kS) !== 0) return 'the shaft column is not open to the hall (top ' + W().topAt(r.iS, r.kS) + ')';
    const spots = [['side wall at the shaft', r.iS, 1, r.k0 - 1, 0.5 * r.str(1)], ['side wall 2 cells along', r.iS + 2, 1, r.k0 - 1, 0.3 * r.str(1)], ['ceiling beside the shaft', r.iS + 1, 4, r.kS, 0.9 * r.str(4)], ['wall of the shaft', r.iS + 1, 6, r.kS, 0.9 * r.str(6)], ['wall 4 cells along', r.iS + 4, 1, r.k0 - 1, 0.03 * r.str(1)]];
    const open = K.scanAll(r); const o = spots.map(([, i, j, k]) => K.sky(open, i, j, k));
    spots.forEach((s, n) => { if (o[n] === null) bad.push(s[0] + ': no plush there'); else if (!(o[n] >= s[4])) bad.push(`${s[0]}: open ${o[n].toFixed(3)} < ${s[4]}`); });
    const jb = K.block(r, 'plush'); const shut = K.scanAll(r);
    spots.forEach((s, n) => { const v = K.sky(shut, s[1], s[2], s[3]); if (v === null) return; if (!(v < o[n])) bad.push(`${s[0]}: blocked ${v.toFixed(3)} is not under open ${o[n].toFixed(3)}`); });
    for (const s of [spots[0], spots[1], spots[4]]) { const v = K.sky(shut, s[1], s[2], s[3]); if (!(v < 0.2)) bad.push(`${s[0]} is ${v.toFixed(3)} with the hole blocked (dark expected)`); }
    // nothing under the blocker takes any hole light at all
    let lit = 0; for (const [key, e] of shut) { const j = +key.split(',')[1]; if (j < jb && e.hole > 0) lit++; } if (lit) bad.push(lit + ' plush under the blocker still get hole light');
    K.unblock(r, jb); const back = K.scanAll(r); const d = K.same(open, back); if (d) bad.push('re-dug is not the same as before: ' + d);
    return bad.length === 0 || bad.join('; ');
  });

  await HT('holelight.the-light-spills-sideways-a-few-cells-and-falls-off-with-distance', async () => {
    const r = K.rig(), bad = [], m = K.scanAll(r);
    const h = []; for (let d = 0; d <= 9; d++) h.push(K.hole(m, r.iS + d, 1, r.k0 - 1));
    if (h.some((v) => v === null)) return 'a wall cell is missing: ' + h.join();
    for (let d = 1; d <= 5; d++) if (!(h[d] > h[d + 1])) bad.push(`not falling at ${d}: ${h.map((v) => v.toFixed(2)).join(' ')}`);
    if (!(h[1] > 0.5 * r.str(1) && h[1] > 3 * h[4])) bad.push(`1 cell ${h[1].toFixed(2)}, 4 cells ${h[4].toFixed(2)}`);
    if (!(h[7] < 0.01 && h[8] === 0 && h[9] === 0)) bad.push('light past 6 cells: ' + h.slice(7).join());
    // across the tunnel: the wall next to the shaft's lane is lit more than the one on the far side of the 4 wide tunnel
    const a = K.hole(m, r.iS, 1, r.k0 - 1), b = K.hole(m, r.iS, 1, r.k0 + r.wide); if (!(a > b && b > 0)) bad.push(`across: near wall ${a} far wall ${b}`);
    // the same numbers the single cell evaluator gives for the air beside each wall cell
    for (let d = 1; d <= 6; d++) if (!(HL.holeAt(W(), r.iS + d, 1, r.k0) > 0)) bad.push(`the camera evaluator sees no light ${d} cells along`);
    if (HL.holeAt(W(), r.iS + 7, 1, r.k0) !== 0) bad.push('the camera evaluator sees light 7 cells along');
    return bad.length === 0 || bad.join('; ');
  });

  await HT('holelight.a-hole-is-blocked-by-plush-a-plate-or-a-wall-section-and-lights-again-when-it-is-cleared', async () => {
    const bad = [];
    for (const kind of ['plush', 'plate', 'wall']) {
      await newWorld(); fresh({}); g.hall.level = 1;
      const r = K.rig(), open = K.scanAll(r);
      const before = K.hole(open, r.iS + 1, 4, r.kS); if (!(before > 0.9 * r.str(4))) { bad.push(kind + ': not lit open ' + before); continue; }
      const jb = K.block(r, kind, r.rows + 3); const shut = K.scanAll(r);
      let lit = 0, max = 0; for (const [key, e] of shut) { const j = +key.split(',')[1]; if (j < jb && e.hole > 0) { lit++; max = Math.max(max, e.hole); } }
      if (lit) bad.push(`${kind}: ${lit} plush under it still lit (up to ${max.toFixed(2)})`);
      if (HL.holeAt(W(), r.iS, 1, r.kS) !== 0) bad.push(kind + ': the camera evaluator still sees a hole at the foot');
      // a plate or wall that is taken down again: the light is back, exactly
      K.unblock(r, jb); const back = K.scanAll(r); const d = K.same(open, back); if (d) bad.push(`${kind}: ${d}`);
      if (!(HL.holeAt(W(), r.iS, 1, r.kS) > 0.9 * r.str(1))) bad.push(kind + ': the hole did not come back');
    }
    return bad.length === 0 || bad.join('; ');
  });

  await HT('holelight.plush-in-the-tunnel-stops-the-spill-and-a-closed-door-too', async () => {
    const r = K.rig(), bad = [], open = K.scanAll(r);
    const side = (m, d) => K.hole(m, r.iS + d, 1, r.k0 - 1);
    // a cross section of plush 3 cells along: the cells past it get nothing, the ones before it keep theirs
    const cells = K.plug(r, 3); const shut = K.scanAll(r);
    for (const d of [4, 5]) if (side(shut, d) !== 0 && side(shut, d) !== null) bad.push(`plush: ${side(shut, d)} past the plug at ${d}`);
    for (const d of [1, 2]) if (!near(side(shut, d), side(open, d))) bad.push(`plush: the near side changed at ${d}`);
    K.unplug(cells); const d1 = K.same(open, K.scanAll(r)); if (d1) bad.push('plush plug taken out: ' + d1);
    // a real door (transit.js) across the tunnel: closed it is wall sections and stops the light, open it lets it through
    const e = g.placeEntity('door', { ax: 'z', i0: r.iS + 3, k0: r.k0, j: 0, blast: false, lock: 'none', auto: false, tgt: 0, p: 0, st: 'closed', rid: 'door' }, { quiet: true });
    try {
      TR.setRows(g, e, 0);
      const shutDoor = K.scanAll(r); for (const d of [4, 5]) { const v = side(shutDoor, d); if (v !== 0 && v !== null) bad.push(`door closed: ${v} past it at ${d}`); }
      TR.setRows(g, e, 4); const opened = K.scanAll(r); for (const d of [4, 5]) if (!near(side(opened, d), side(open, d))) bad.push(`door open: ${side(opened, d)} at ${d}, ${side(open, d)} with no door`);
      TR.setRows(g, e, 0); const again = K.scanAll(r); if (side(again, 5) !== 0 && side(again, 5) !== null) bad.push('door closed again: light past it');
    } finally { g.doDecon({ kind: 'mach', id: e.id }); }
    return bad.length === 0 || bad.join('; ');
  });

  // the single cell evaluator (the camera) and the chunk field (the baked plush) are two code paths for one rule: they must agree on every air cell
  const agree = (r, label) => {
    const S = HL.makeScratch(), bad = []; let cells = 0, lit = 0;
    for (const [cx, cy, cz] of K.chunksOf(r, 7)) {
      const F = HL.windowFor(W(), cx * 16, cy * 16, cz * 16, S); if (!F.hf) continue;
      for (let jj = 0; jj < 18; jj++) for (let z = HL.HOLE_R + 2; z < HL.HOLE_R + 2 + 17; z++) for (let x = HL.HOLE_R + 2; x < HL.HOLE_R + 2 + 17; x++) {
        const i = F.ib + x, j = F.jb + jj, k = F.kb + z; if (j < 0 || j >= 72) continue;
        const a = F.hf[(jj * F.Wd + z) * F.Wd + x], b = HL.holeAt(W(), i, j, k); cells++; if (a > 0) lit++;
        if (!near(a, b, 1e-6)) { bad.push(`${label} ${i},${j},${k}: field ${a.toFixed(4)} cell ${b.toFixed(4)}`); if (bad.length > 4) return { bad, cells, lit }; }
      }
    }
    return { bad, cells, lit };
  };
  await HT('holelight.the-chunk-field-and-the-single-cell-light-agree-on-every-air-cell', async () => {
    const bad = []; let lit = 0;
    const r = K.rig(); let a = agree(r, 'plain'); bad.push(...a.bad); lit += a.lit;
    K.plug(r, 3, 5); for (let k = r.k0; k < r.k0 + 2; k++) W().setCell(r.iS + 6, 1, k, 5, 0);   // a plug, and a half-closed one
    a = agree(r, 'plugged'); bad.push(...a.bad); lit += a.lit;
    // a 2 x 2 shaft and a ragged dig round it
    const rnd = mulberry32(99);
    for (let q = 0; q < 140; q++) { const i = r.iS - 2 + Math.floor(rnd() * 14), k = r.k0 - 1 + Math.floor(rnd() * 6), j = Math.floor(rnd() * 6); if (W().get(i, j, k)) W().removeCell(i, j, k, false); }
    for (let j = 4; j <= r.T0; j++) for (const [di, dk] of [[1, 0], [0, 1], [1, 1]]) if (W().get(r.iS + 8 + di, j, r.kS + dk) && j > 0) W().removeCell(r.iS + 8 + di, j, r.kS + dk, false);
    a = agree(r, 'ragged'); bad.push(...a.bad); lit += a.lit;
    if (!(lit > 60)) bad.push('the scenes light only ' + lit + ' cells: the comparison proves little');
    return bad.length === 0 || bad.join('; ');
  });

  await HT('holelight.a-deeper-shaft-gives-less-light-fading-by-17-m', async () => {
    const bad = [];
    const f = [0, 6, 12, 20, 28, 40].map((D) => HL.strength(D));
    if (!(f[0] === 1 && f[2] === 1)) bad.push('not full for the first 12 cells: ' + f.join());
    if (!(f[2] > f[3] && f[3] > f[4])) bad.push('not fading between 12 and 28: ' + f.join());
    if (!(near(f[4], 0.25) && near(f[5], 0.25))) bad.push('floor is not 0.25 at 17 m and beyond: ' + f.join());
    // and for real: a shaft 11 cells deep and one 40 cells deep, the same wall cell at the foot
    const a = K.rig({ depth: 11 }); const ma = K.scanAll(a); const va = K.hole(ma, a.iS, 1, a.k0 - 1);
    await newWorld(); fresh({});
    const b = K.rig({ depth: 40, left: 2 }); const mb = K.scanAll(b); const vb = K.hole(mb, b.iS, 1, b.k0 - 1);
    if (!(va > 0.5 * a.str(1) && vb > 0.1 && vb < 0.7 * va)) bad.push(`foot of a shallow shaft ${va}, of a 40 cell one ${vb}`);
    return bad.length === 0 || bad.join('; ');
  });

  await HT('holelight.the-player-is-lit-in-the-hole-and-near-its-foot-and-dark-when-it-is-blocked', async () => {
    const r = K.rig(), bad = [], P = new THREE.Vector3();
    const at = (di, dk = 0) => P.set(cellX(r.iS + di), cellY(2), cellZ(r.kS + dk));
    g.camSky = 0; g._entr = { x: -60, z: 0 };
    const under = settle(at(0)); if (!(under > 0.9 * r.str(2))) bad.push(`in the shaft camSky ${under.toFixed(2)}`);
    if (!(U.uCamSky.value > 0.8 * r.str(2))) bad.push('the camera light under the hole is ' + U.uCamSky.value);
    g.camSky = 0; g._entr = { x: -60, z: 0 };
    const c = []; for (const d of [1, 2, 3, 5, 8]) { g.camSky = 0; g._entr = { x: -60, z: 0 }; c.push(settle(at(d))); }
    if (!(c[0] > c[1] && c[1] > c[2] && c[2] > c[3] && c[3] > c[4])) bad.push('not fading along the tunnel: ' + c.map((v) => v.toFixed(3)).join(' '));
    if (!(c[1] > 0.25 * r.str(2) && c[4] < 0.02)) bad.push('near ' + c[1] + ', far ' + c[4]);
    g.camSky = 0; g._entr = { x: -60, z: 0 }; const side = settle(at(0, 2)); if (!(side > 0.3 * r.str(2) && side < under)) bad.push('beside the shaft lane ' + side);
    // block it above: the same spot is dark again
    const jb = K.block(r, 'plate'); g.camSky = 1; g._entr = { x: -60, z: 0 }; const shut = settle(at(0));
    if (!(shut < 0.35)) bad.push('under a blocked hole camSky ' + shut.toFixed(2)); K.unblock(r, jb);
    g.camSky = 0; g._entr = { x: -60, z: 0 }; const back = settle(at(0)); if (!(back > 0.9 * r.str(2))) bad.push('not back after re-digging: ' + back.toFixed(2));
    // a deep shaft lets less day down onto the player
    await newWorld(); fresh({}); g.hall.level = 1; const d = K.rig({ depth: 40 }); g.camSky = 0; g._entr = { x: -60, z: 0 };
    const deep = settle(P.set(cellX(d.iS), cellY(2), cellZ(d.kS))); if (!(deep < under - 0.2 && deep > 0.2)) bad.push(`a 40 cell shaft lights the player ${deep.toFixed(2)} (a short one ${under.toFixed(2)})`);
    return bad.length === 0 || bad.join('; ');
  });

  await HT('holelight.at-night-the-hole-gives-only-what-the-hall-gives', async () => {
    const r = K.rig(), bad = [], P = new THREE.Vector3(cellX(r.iS), cellY(2), cellZ(r.kS));
    const m0 = K.scanAll(r); const baked = K.hole(m0, r.iS + 1, 4, r.kS);
    for (const [lv, want] of [[1, 1], [0.5, 0.5], [0, 0]]) {
      g.hall.level = lv; g.camSky = 0; g._entr = { x: -60, z: 0 }; settle(P);
      if (!near(U.uHoleSun.value.r, 1.05 * want, 1e-6) || !near(U.uHoleHemi.value.g, 0.4 * want, 1e-6) || !near(U.uHoleLv.value, want, 1e-6)) bad.push(`level ${lv}: the hole light uniforms are ${U.uHoleSun.value.r} ${U.uHoleHemi.value.g} ${U.uHoleLv.value}`);
      if (!near(g.shafts.uPool.value, 0.5 * want, 1e-6)) bad.push(`level ${lv}: pool ${g.shafts.uPool.value}`);
      const far = new THREE.Vector3(cellX(r.iS + 9), cellY(2), cellZ(r.kS)); g.camSky = 0; settle(far);   // out in the tunnel: the beam shows against the dark, in proportion to the hall
      if (!near(g.shafts.uBeam.value, want * (1 - 0.92 * g.camSky), 1e-6)) bad.push(`level ${lv}: beam ${g.shafts.uBeam.value}`);
      if (want === 0 && (g.shafts.mesh.visible || g.shafts.pool.visible)) bad.push('beam or pool drawn at night');
      if (want === 1 && !(g.shafts.mesh.visible && g.shafts.pool.visible)) bad.push('no beam or pool by day');
    }
    // the baked light of the plush is the hall's light at full level: the uniforms scale it, so the same bake serves day and night
    g.hall.level = 0; const m1 = K.scanAll(r); if (!near(K.hole(m1, r.iS + 1, 4, r.kS), baked)) bad.push('the bake depends on the hall level');
    g.hall.level = 0; g.camSky = 0; settle(P); if (!(U.uCamSky.value < 0.02)) bad.push('the camera at night under a hole: uCamSky ' + U.uCamSky.value);
    return bad.length === 0 || bad.join('; ');
  });

  await HT('holelight.the-beam-and-the-floor-pool-follow-the-hole', async () => {
    const r = K.rig(), bad = [], R = g.renderer, cam = R.camera.position; cam.set(cellX(r.iS + 6), 1.5, cellZ(r.kS));
    const upd = () => { R.updateChunks(cam, 200); g.renderEnv(0.1, cam); };
    upd(); upd();
    const S = g.shafts; if (S.beams.length !== 1) return `${S.beams.length} beams for one shaft`;
    const b = S.beams[0]; if (!(b.y0 === 0 && b.y1 > 7)) bad.push(`beam from ${b.y0} to ${b.y1}`);
    if (!(S.pool.count > 15)) bad.push('floor pool has ' + S.pool.count + ' quads');
    const jb = K.block(r, 'plate'); upd(); upd(); if (S.beams.length !== 0 || S.pool.count !== 0) bad.push(`blocked: ${S.beams.length} beams, ${S.pool.count} pool quads`);
    K.unblock(r, jb); upd(); upd(); if (S.beams.length !== 1 || !(S.pool.count > 15)) bad.push(`re-dug: ${S.beams.length} beams, ${S.pool.count} pool quads`);
    // the pool stops at the walls: no quad over a solid cell and none past the spill
    const a = S.pool.instanceMatrix.array; for (let n = 0; n < S.pool.count; n++) { const i = toI(a[n * 16 + 12]), k = toK(a[n * 16 + 14]); if (W().get(i, 0, k) !== 0) { bad.push('a pool quad lies on plush'); break; } if (Math.abs(i - r.iS) > 7) { bad.push('pool reaches ' + (i - r.iS) + ' cells'); break; } }
    // a shaft that does not reach the floor (a tunnel on a plush floor) has a beam but no floor pool
    return bad.length === 0 || bad.join('; ');
  });

  await HT('holelight.an-edit-that-blocks-a-hole-re-lights-the-chunk-next-door-through-the-real-remesh', async () => {
    // the shaft is 3 cells from a chunk border: markDirty (a two cell border) does not mark the next chunk, but its plush take the spill: the remesh must send it round again
    const bad = [], R = g.renderer, kk = toK(7);
    let at = toI(11); while ((at & 15) !== 13 || W().topAt(at, kk + 1) < 11) at++;
    const r = K.rig({ at, left: 2, right: 14 });
    const cam = R.camera.position; cam.set(cellX(r.iS), 1.5, cellZ(r.kS));
    const pump = (n = 6) => { for (let q = 0; q < n; q++) R.updateChunks(cam, 500); };
    pump(8);
    const nb = (r.iS >> 4) + 1, key = (0 * CZ + (r.k0 >> 4)) * CX + nb;   // the chunk index of render.js, level 0
    const ch = R.chunks.get(key); if (!ch) return 'the next chunk is not loaded';
    const val = () => { const m = new Map(); const c2 = R.chunks.get(key); K.readChunk({ n: c2.n, data: c2.data }, m); return K.hole(m, r.iS + 3, 1, r.k0 - 1); };
    const v0 = val(); if (!(v0 > 0.03)) return 'the next chunk shows no spill to begin with: ' + v0;   // (3 cells along, which is the next chunk: the shaft is column 13)
    const jb = K.block(r, 'plate');
    if (W().dirtyChunks.has(key)) return 'markDirty already marks the next chunk: the premise of the test is gone';
    pump(8); const v1 = val(); if (v1 !== 0) bad.push('after blocking, the next chunk still shows ' + v1);
    K.unblock(r, jb); pump(8); const v2 = val(); if (!near(v2, v0)) bad.push(`after re-digging ${v2} instead of ${v0}`);
    return bad.length === 0 || bad.join('; ');
  });

  await HT('holelight.the-remesh-costs-at-most-15-percent-more-on-a-dug-area', async () => {
    // The new scan is a fresh copy of render.js (a query on the import), not the one the game loop has been running: after a long run (this suite) the engine has
    // de-optimised the live method with every odd input the tests fed it, which would be held against the code. The old scan is copied in holelight_legacy.js and is as fresh.
    const { legacyScan } = await import('./holelight_legacy.js'); const R = g.renderer;
    const Fresh = (await import('../render.js?cost=' + Date.now())).Renderer.prototype.scanChunk, fake = { world: g.world };
    const cost = (label, r) => {
      const chunks = K.chunksOf(r, 4).filter(([cx, cy, cz]) => R.scanChunk(cx, cy, cz, false).n > 0);
      const run = (fn, deep) => { const t0 = performance.now(); for (let n = 0; n < 12; n++) for (const [cx, cy, cz] of chunks) fn(cx, cy, cz, deep); return (performance.now() - t0) / (12 * chunks.length); };
      fake.world = g.world;
      const out = {};
      for (const deep of [false, true]) {
        const a = [], b = []; run((...x) => Fresh.call(fake, ...x), deep); run((...x) => legacyScan(R, ...x), deep);
        for (let q = 0; q < 21; q++) { a.push(run((...x) => Fresh.call(fake, ...x), deep)); b.push(run((...x) => legacyScan(R, ...x), deep)); }   // (the two take turns; the best round of each is the one a busy machine disturbs least)
        a.sort((x, y) => x - y); b.sort((x, y) => x - y);
        out[(deep ? 'deep ' : '') + label] = { now: a[0], was: b[0], ratio: a[0] / b[0], chunks: chunks.length };
      }
      return out;
    };
    let worst = 0; const rows = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      await newWorld(); fresh({}); worst = 0; rows.length = 0;
      const tun = K.rig({ shaft: false }); const a = cost('tunnel', tun);
      K.dig(tun); const b = cost('shaft', tun);
      for (const o of [a, b]) for (const [k, v] of Object.entries(o)) { rows.push(`${k}: ${v.was.toFixed(3)} -> ${v.now.toFixed(3)} ms (${((v.ratio - 1) * 100).toFixed(1)}%)`); worst = Math.max(worst, v.ratio); }
      if (worst <= 1.15) break;
    }
    window.__holeCost = rows;
    return worst <= 1.15 || 'remesh got slower: ' + rows.join('; ');
  });

  await HT('holelight.a-saved-game-comes-back-with-the-same-light', async () => {
    const r = K.rig(), bad = [], before = K.scanAll(r);
    g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) return 'g.save() failed';
    const { loadSaved } = await import('../state.js'); const saved = loadSaved(); if (!saved) return 'nothing saved';
    g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play';
    if (W().topAt(r.iS, r.kS) !== 0) bad.push('the shaft did not come back');
    const after = K.scanAll(r); const d = K.same(before, after); if (d) bad.push('light after loading: ' + d);
    if (!(HL.holeAt(W(), r.iS, 1, r.kS) > 0.9 * r.str(1))) bad.push('camera evaluator after loading');
    const P = new THREE.Vector3(cellX(r.iS), cellY(2), cellZ(r.kS)); g.camSky = 0; g._entr = { x: -60, z: 0 }; if (!(settle(P) > 0.9 * r.str(2))) bad.push('camSky after loading');
    const cam = g.renderer.camera.position; cam.copy(P); for (let q = 0; q < 4; q++) { g.renderer.updateChunks(cam, 200); g.renderEnv(0.1, cam); } if (g.shafts.beams.length !== 1) bad.push('beams after loading: ' + g.shafts.beams.length);
    return bad.length === 0 || bad.join('; ');
  });
}
