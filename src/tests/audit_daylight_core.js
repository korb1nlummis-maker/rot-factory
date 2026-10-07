// holelight.audit.* (core): what the first daylight wave left out, found by the auditor.
//  - the chunks you SEE (renderer.chunks, built by the real updateChunks with its dirty list and cascade) must equal a fresh scan after any edit, not only the fresh scans the
//    wave's own tests compare; a shaft opened or capped at its top lights or darkens its foot even when the foot is more than one chunk level below the edit
//  - the entrance glow of renderEnv (a tunnel stays lit 7 m from where the sky was last open) must not outlive the hole it came from
import * as HL from '../holelight.js';
import { U } from '../shaders.js';
import { mulberry32 } from '../util.js';
import { PAD } from '../plushdata.js';
import { kit as hlKit } from './holelight_lib.js';

export default async function (ctx) {
  const { T, g, toI, toK, cellX, cellY, cellZ, newWorld, fresh, THREE } = ctx;
  const K = hlKit(ctx), W = K.W;
  const HT = (name, fn) => T(name, async () => { await newWorld(); fresh({}); g.hall.level = 1; g._entr = null; try { return await fn(); } finally { g.hall.level = 1; } });
  const R = () => g.renderer;
  const pump = (cam, n = 60) => { const r = R(); for (let q = 0; q < n; q++) { r.updateChunks(cam, 500); if (!r.pending.length && !(r.spill && r.spill.length) && !W().dirtyChunks.size) break; } };
  // every loaded chunk against a fresh scan at the depth it was built with: the list of those that show stale light
  const stale = () => {
    const bad = [];
    for (const ch of R().chunks.values()) {
      if (!ch.data || ch.cold) continue;
      const res = R().scanChunk(ch.cx, ch.cy, ch.cz, ch.deep);
      // (the plain sky of a buried plush, exp(-0.3 n) of a column far above, has always lagged by a hair: that is not light, so a drift of float 9 under 0.01 is let go)
      if (res.n !== ch.n) { bad.push(`chunk ${ch.cx},${ch.cy},${ch.cz}: ${ch.n} plush shown, ${res.n} now`); continue; }
      for (let q = 0; q < res.n * 16; q++) if (res.data[q] !== ch.data[q] && !(q % 16 === 9 && Math.abs(res.data[q] - ch.data[q]) < 0.01)) { bad.push(`chunk ${ch.cx},${ch.cy},${ch.cz}: plush ${(q / 16) | 0} float ${q % 16} shows ${ch.data[q]}, a fresh scan gives ${res.data[q]}`); break; }
    }
    return bad;
  };
  const shown = (r, i, j, k) => {   // the hole light of the plush at (i, j, k) as it is drawn now (null: no plush drawn there)
    for (const ch of R().chunks.values()) if (ch.cx === (i >> 4) && ch.cy === (j >> 4) && ch.cz === (k >> 4)) { const m = new Map(); K.readChunk({ n: ch.n, data: ch.data }, m); const e = m.get(i + ',' + j + ',' + k); return e ? e.hole : null; }
    return null;
  };

  // a shaft that goes up past two chunk levels: its foot is in level 0, its mouth in level 2 or 3
  const deepRig = (shaft) => K.rig({ depth: 40, shaft, left: 3, right: 10, wide: 4 });

  await HT('holelight.audit.a-deep-shaft-opened-at-the-top-lights-its-foot-in-the-displayed-chunks', async () => {
    const bad = [], r = deepRig(false); if (!(r.T0 >= 36)) return 'the rig is only ' + r.T0 + ' cells deep: the test needs a shaft that spans three chunk levels';
    const cam = R().camera.position; cam.set(cellX(r.iS + 3), 1.5, cellZ(r.kS)); pump(cam);
    const s0 = stale(); if (s0.length) return 'stale before any shaft: ' + s0.slice(0, 2).join('; ');
    // dig it as a player does: up the column one cell at a time, the last cell (the one that opens it to the hall) alone
    for (let j = r.rows; j < r.T0 - 1; j++) W().removeCell(r.iS, j, r.kS, false);
    pump(cam); if (W().topAt(r.iS, r.kS) !== r.T0) return 'the shaft was opened early: top ' + W().topAt(r.iS, r.kS);
    const foot = (d) => shown(r, r.iS + d, 1, r.k0 - 1);
    if (foot(1) !== null && foot(1) > 0) bad.push('the foot is lit before the shaft is open: ' + foot(1));
    W().removeCell(r.iS, r.T0 - 1, r.kS, false); pump(cam);
    if (W().topAt(r.iS, r.kS) !== 0) return 'the last cell did not open the column: top ' + W().topAt(r.iS, r.kS);
    const sm = stale(); if (sm.length) bad.push('after opening it: ' + sm.slice(0, 2).join('; '));
    if (!(foot(1) > 0.05)) bad.push('the foot of the open shaft shows ' + foot(1) + ' in the displayed chunk');
    // cap it again with a plate in the top cell: the foot goes dark
    W().setCell(r.iS, r.T0 - 1, r.kS, PAD, 17); pump(cam);
    const sc = stale(); if (sc.length) bad.push('after capping it: ' + sc.slice(0, 2).join('; '));
    if (foot(1) !== null && foot(1) > 0) bad.push('the foot still shows ' + foot(1) + ' with the shaft capped');
    W().setCell(r.iS, r.T0 - 1, r.kS, 0, 0); pump(cam);
    const sr = stale(); if (sr.length) bad.push('after re-digging it: ' + sr.slice(0, 2).join('; '));
    if (!(foot(1) > 0.05)) bad.push('the foot shows ' + foot(1) + ' after re-digging');
    return bad.length === 0 || bad.join('; ');
  });

  await HT('holelight.audit.a-cap-laid-on-the-rim-of-a-shaft-high-above-its-foot-darkens-the-foot', async () => {
    // the cap is in a chunk level that holds no hole light at all (the shaft is 40 cells deep, the cap goes on its mouth three levels up)
    const bad = [], r = deepRig(true);
    const cam = R().camera.position; cam.set(cellX(r.iS + 3), 1.5, cellZ(r.kS)); pump(cam);
    const foot = (d) => shown(r, r.iS + d, 1, r.k0 - 1);
    if (!(foot(1) > 0.05)) return 'the foot of the open shaft shows ' + foot(1);
    const t = r.T0 - 1;
    // the neighbours of the mouth are the rim: lay a plate on top of the shaft's own column one level over the old rim
    W().setCell(r.iS, t, r.kS, PAD, 17); W().setCell(r.iS, t + 1, r.kS, PAD, 17); pump(cam);
    const s = stale(); if (s.length) bad.push(s.slice(0, 2).join('; '));
    if (foot(1) !== null && foot(1) > 0) bad.push('the foot still shows ' + foot(1) + ' with the mouth capped');
    return bad.length === 0 || bad.join('; ');
  });

  await HT('holelight.audit.random-edits-around-a-deep-shaft-never-leave-a-displayed-chunk-stale', async () => {
    // four shafts of different depth and different place against the chunk borders (one so high that its mouth is not loaded), 40 rounds of three random edits each
    // (dig, fill, plate, a shaft from a cell up and out, a skimmed column top), the real updateChunks pumped after each round
    const bad = [];
    for (const [seed, depth, col] of [[5150, 40, 0], [6161, 55, 13], [7272, 66, 7], [8383, 30, 15]]) {
      await newWorld(); fresh({}); g.hall.level = 1;
      const rnd = mulberry32(seed), kk = toK(7); let at = toI(10); while ((at & 15) !== col || W().topAt(at, kk + 1) < depth) at++;
      const r = K.rig({ at, left: 3, right: 12, wide: 4, depth }), w = W();
      const cam = R().camera.position; cam.set(cellX(r.iS + 3), 1.5, cellZ(r.kS)); pump(cam);
      const pick = (a, b) => a + Math.floor(rnd() * (b - a + 1));
      for (let round = 0; round < 40 && !bad.length; round++) {
        for (let q = 0; q < 3; q++) {
          const i = pick(r.i0 - 3, r.i1 + 3), k = pick(r.k0 - 3, r.k0 + r.wide + 2), roll = rnd(), t = w.topAt(i, k), j = roll < 0.5 ? pick(0, r.rows + 2) : pick(Math.max(0, t - 4), Math.min(70, t));
          if (roll < 0.30) { if (w.get(i, j, k)) w.removeCell(i, j, k, false); }
          else if (roll < 0.50) { if (!w.get(i, j, k)) w.setCell(i, j, k, 5, 0); }
          else if (roll < 0.65) { if (!w.get(i, j, k)) w.setCell(i, j, k, PAD, 17); }
          else if (roll < 0.85) { for (let jj = j; jj < t; jj++) if (w.get(i, jj, k)) w.removeCell(i, jj, k, false); }   // a shaft from here up and out
          else { if (t > 0) w.removeCell(i, t - 1, k, false); }                                                          // skim the top of the column
        }
        pump(cam); const s = stale(); if (s.length) bad.push(`depth ${depth} (shaft ${r.T0} cells), round ${round}: ` + s.slice(0, 2).join('; '));
      }
    }
    return bad.length === 0 || bad.join('; ');
  });

  await HT('holelight.audit.blocking-the-hole-over-you-ends-the-tunnel-glow-too', async () => {
    // standing in or at the foot of the shaft the hole is an entrance (sky > 0.6), which renderEnv remembers so a tunnel stays lit for its first 7 m. A hole that is shut
    // is no entrance: the glow and the camera light must not keep the tunnel lit round a shaft that lets nothing down.
    const bad = [], r = K.rig({ right: 30 }), P = new THREE.Vector3(cellX(r.iS), cellY(2), cellZ(r.kS));
    const settle = () => { for (let q = 0; q < 60; q++) g.renderEnv(0.1, P); };
    g.camSky = 0; g._entr = { x: -60, z: 0 }; settle();
    if (!(U.uCamSky.value > 0.9)) return 'not lit in the open shaft: ' + U.uCamSky.value;
    const jb = K.block(r, 'plate'); settle();
    if (!(U.uCamSky.value < 0.35)) bad.push('uCamSky is ' + U.uCamSky.value.toFixed(2) + ' under the shut shaft (the entrance memory keeps it lit)');
    if (!(U.uGlow.value < 0.05)) bad.push('uGlow is ' + U.uGlow.value.toFixed(2) + ' under the shut shaft');
    P.x += 6; settle(); if (!(U.uGlow.value < 0.05)) bad.push('uGlow is ' + U.uGlow.value.toFixed(2) + ' 6 m down the tunnel from the shut shaft');
    P.x -= 6; K.unblock(r, jb); settle();
    if (!(U.uCamSky.value > 0.9)) bad.push('not lit again after re-digging: ' + U.uCamSky.value);
    // walking away from an OPEN shaft keeps the glow for 7 m, as for any tunnel mouth (the rule the hole joins)
    P.x += 6; settle(); if (!(U.uGlow.value > 0.2)) bad.push('the glow 6 m from an open shaft is ' + U.uGlow.value.toFixed(2));
    return bad.length === 0 || bad.join('; ');
  });
  await HT('holelight.audit.a-save-loaded-in-the-middle-of-a-dig-shows-the-same-light-in-the-displayed-chunks', async () => {
    // the shaft is opened and the game saved before the renderer has looked at the edit (the chunks on screen still show the old light); the loaded game must draw the light of the cells
    const bad = [], r = deepRig(false), cam = R().camera.position; cam.set(cellX(r.iS + 3), 1.5, cellZ(r.kS)); pump(cam);
    for (let j = r.rows; j < r.T0; j++) W().removeCell(r.iS, j, r.kS, false);   // not pumped: the displayed chunks are dark
    const before = K.scanAll(r);
    g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) return 'g.save() failed';
    const { loadSaved } = await import('../state.js'); const saved = loadSaved(); if (!saved) return 'nothing saved';
    g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play';
    cam.set(cellX(r.iS + 3), 1.5, cellZ(r.kS)); pump(cam, 200);
    const d = K.same(before, K.scanAll(r)); if (d) bad.push('the loaded cells light differently: ' + d);
    const s = stale(); if (s.length) bad.push('after loading: ' + s.slice(0, 2).join('; '));
    const v = shown(r, r.iS + 1, 1, r.k0 - 1); if (!(v > 0.05)) bad.push('the foot of the loaded shaft shows ' + v);
    for (let q = 0; q < 4; q++) g.renderEnv(0.1, cam); if (g.shafts.beams.length !== 1) bad.push('beams after loading: ' + g.shafts.beams.length);
    return bad.length === 0 || bad.join('; ');
  });
  await HT('holelight.audit.a-mouth-too-high-to-be-loaded-still-lights-and-darkens-the-foot-below-it', async () => {
    // a pile 66 cells (40 m) high: the mouth of the shaft lies in a chunk the renderer has not loaded (it draws 30 m round you at high quality), yet the foot you stand at does
    // change when it is opened or capped. The edit is in the dirty list but there is no chunk record to cascade from.
    const bad = [], r = K.rig({ depth: 66, shaft: false, left: 3, right: 10, wide: 4 }); if (!(r.T0 >= 64)) return 'the rig is only ' + r.T0 + ' cells deep';
    const cam = R().camera.position; cam.set(cellX(r.iS + 3), 1.5, cellZ(r.kS)); pump(cam);
    const mouth = (((r.T0 - 1) >> 4) * 1024 + (r.kS >> 4)) * 1024 + (r.iS >> 4);
    if (R().chunks.has(mouth)) return 'the chunk of the mouth is loaded: the premise of the test is gone (render radius ' + R().q.renderR + ' m)';
    const foot = (d) => shown(r, r.iS + d, 1, r.k0 - 1);
    K.dig(r); pump(cam);
    if (W().topAt(r.iS, r.kS) !== 0) return 'the shaft is not open';
    const s1 = stale(); if (s1.length) bad.push('after opening it: ' + s1.slice(0, 2).join('; '));
    if (!(foot(1) > 0.05)) bad.push('the foot of the open shaft shows ' + foot(1));
    W().setCell(r.iS, r.T0 - 1, r.kS, PAD, 17); pump(cam);
    const s2 = stale(); if (s2.length) bad.push('after capping it: ' + s2.slice(0, 2).join('; '));
    if (foot(1) !== null && foot(1) > 0) bad.push('the foot still shows ' + foot(1) + ' with the mouth capped');
    W().setCell(r.iS, r.T0 - 1, r.kS, 0, 0); pump(cam);
    if (!(foot(1) > 0.05)) bad.push('the foot shows ' + foot(1) + ' after re-digging');
    return bad.length === 0 || bad.join('; ');
  });
}
