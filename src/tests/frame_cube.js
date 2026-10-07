// Support frames are real cubes: 4 cells wide, 4 high and 4 deep (2.4 m), 4 corner pillars and a ring of beams on top, set in a section
// that was dug out first. They snap to each other in whole modules (4 cells) on all six sides. Run: `await __selftest('mining.frame-cube.')`
// (and `mp.frame-cube.`). Every test starts in a fresh world (the mining.frame prefix does that), so a sealed box of plush can be carved freely.
import { frameMembers, FRAME_W, FRAME_H, FRAME_D, FRAME_N, frameDepth } from '../machines.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, fresh, spot, dig, craft, selectTool, plan, placeNow, aimPoint, adv, toI, toK, cellX, cellZ, newWorld, THREE, FRAME_TYPES, capacityOf, loadOn, tiles } = ctx;
  const up = { timber: 1, steel: 1, concrete: 1, rebar: 1, titan: 1, carbon: 1, plasma: 1, voidl: 1, power: 1, belts: 1, fans: 1, mfan: 1 };
  const json = (m) => JSON.parse(JSON.stringify(m));
  const C = 0.6, M = () => g.machines;
  // a solid block of plush (so the ceiling and walls are exactly what the test carves), then a dug room inside it
  const solidBox = (i0, k0, nx, nz, nj) => { for (let i = i0; i < i0 + nx; i++) for (let k = k0; k < k0 + nz; k++) for (let j = 0; j < nj; j++) w().setCell(i, j, k, 2, 0); };
  const sealed = (nx = 40, nz = 24, nj = 14, upg = up) => { fresh(upg); const sp = spot(); const i0 = sp.i + 4, k0 = sp.k - 12; solidBox(i0, k0, nx, nz, nj); return { i0, k0 }; };
  const cube = (axis, kind, m, lo, j0) => { const e = M().frameEnt(axis, kind, m, lo, j0); delete e.clear; const ent = { id: g.nextId(), type: 'frame', ...e }; S().entities.push(ent); g.addEntity(ent); return ent; };
  const look = (x, z) => aimPoint(x, 0, z, 2.4);
  const solidCount = (i0, k0, nx, nz, nj) => { let n = 0; for (let i = i0; i < i0 + nx; i++) for (let k = k0; k < k0 + nz; k++) for (let j = 0; j < nj; j++) if (w().get(i, j, k)) n++; return n; };
  const tunnel = (wide = 4, high = 4, long = 30) => { fresh(up); let sp; for (const lane of [12, 22, 4, -8, 30]) { try { sp = spot(lane); } catch (e) { continue; } if (w().topAt(sp.i + 20, sp.k) >= 7) break; } dig(sp.i, sp.k - 2, long, wide, high, false); craft('frame:timber', 8); selectTool('frame:timber'); return sp; };

  await T('mining.frame-cube.a-placed-frame-is-a-4x4x4-hollow-cube-2.4-m-deep', async () => {
    const { i, k } = tunnel(); look(cellX(i + 14), cellZ(k - 1)); const pl = await plan(); if (!pl.ok) return pl.why;
    const e = pl.ent; if (Math.abs(e.w - 2.36) > 0.01 || Math.abs(e.h - 2.38) > 0.01 || Math.abs(e.d - 2.36) > 0.01) return `plan is ${e.w} x ${e.h} x ${e.d}`;
    if (Math.abs(FRAME_D - 4 * C) > 0.05 || FRAME_N !== 4) return 'module constants are off';
    if (e.clear.length) return 'a clear section planned with plush in it: ' + e.clear.length;
    const box0 = solidCount(i - 2, 0, 40, 40, 8) + solidCount(i - 2, toK(0) - 20, 40, 20, 8); const n = placeNow(); if (n !== 1) return 'not placed';
    const ent = S().entities.at(-1); if (Math.abs(ent.d - FRAME_D) > 1e-9 || frameDepth(ent) !== ent.d) return 'the saved entity has no depth: ' + ent.d;
    if (solidCount(i - 2, 0, 40, 40, 8) + solidCount(i - 2, toK(0) - 20, 40, 20, 8) !== box0) return 'placing a frame dug plush out';
    const it = M().items.get(ent.id); it.obj.rotation.y = 0; it.obj.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(it.obj), sz = bb.getSize(new THREE.Vector3());
    if (Math.abs(sz.x - 2.36) > 0.04 || Math.abs(sz.z - 2.36) > 0.04 || Math.abs(sz.y - 2.38) > 0.04) return `the mesh is ${sz.x.toFixed(2)} x ${sz.y.toFixed(2)} x ${sz.z.toFixed(2)} m, not a 2.36 cube`;
    const mem = frameMembers(ent.kind, ent.w, ent.h, ent.d); const pillars = mem.filter((q) => Math.abs(q.s[1] - ent.h) < 1e-6).length;
    const ring = mem.filter((q) => !q.plate && q.p[1] > ent.h - 0.25 && (q.s[0] >= ent.w - 0.01 || q.s[2] >= ent.d - 0.5)).length;
    if (pillars !== 4) return pillars + ' pillars'; if (ring < 4) return 'only ' + ring + ' top beams';
    const thick = mem.filter((q) => Math.abs(q.s[1] - ent.h) < 1e-6).every((q) => q.s[0] >= 0.15 && q.s[0] === q.s[2]); if (!thick) return 'pillars are thin or not square';
    return true;
  });

  await T('mining.frame-cube.placing-needs-a-dug-4x4x4-section-and-never-digs', async () => {
    // a pocket 4 wide, 4 high and only 3 long in the middle of solid pile: no cube fits however you aim
    const { i0, k0 } = sealed(); dig(i0 + 10, k0 + 10, 3, 4, 4, false); craft('frame:timber', 4); selectTool('frame:timber'); aimPoint(cellX(i0 + 11), 0, cellZ(k0 + 11), 0.6); let pl = await plan();
    if (pl.ok || !/dig out \d+ more plush/.test(pl.why) || pl.ent.clear.length < 16) return 'a 3 cell pocket took a 4 deep cube: ' + JSON.stringify([pl.ok, pl.why]);
    const n0 = solidCount(i0, k0, 40, 24, 14);
    dig(i0 + 13, k0 + 10, 1, 4, 4, false); const dug = n0 - solidCount(i0, k0, 40, 24, 14); aimPoint(cellX(i0 + 11), 0, cellZ(k0 + 11), 0.6); pl = await plan(); if (!pl.ok) return 'a dug 4x4x4 section was refused: ' + pl.why;
    const c0 = solidCount(i0, k0, 40, 24, 14); if (placeNow() !== 1) return 'not placed'; if (solidCount(i0, k0, 40, 24, 14) !== c0) return 'placing a frame dug ' + (c0 - solidCount(i0, k0, 40, 24, 14)) + ' plush out (the section was dug by hand: ' + dug + ')';
    // a bore 3 wide, or 3 high, is too tight as well
    const t2 = sealed(); dig(t2.i0 + 8, t2.k0 + 8, 12, 3, 4, false); craft('frame:timber', 2); selectTool('frame:timber'); aimPoint(cellX(t2.i0 + 12), 0, cellZ(t2.k0 + 9), 0.6); const a = await plan();
    const t3 = sealed(); dig(t3.i0 + 8, t3.k0 + 8, 12, 4, 3, false); craft('frame:timber', 2); selectTool('frame:timber'); aimPoint(cellX(t3.i0 + 12), 0, cellZ(t3.k0 + 9), 0.6); const b = await plan();
    return (!a.ok && !b.ok && a.ent.clear.length >= 16 && b.ent.clear.length >= 16) || `3 wide: ${a.ok}, 3 high: ${b.ok}`;
  });

  await T('mining.frame-cube.the-cube-starts-at-the-aimed-cell-and-runs-away-from-you', async () => {
    const { i, k } = tunnel(4, 4, 30); const aimedI = i + 10; look(cellX(aimedI), cellZ(k - 1)); const pl = await plan(); if (!pl.ok) return pl.why;
    if (pl.ent.gm !== aimedI) return `facing east, aimed at ${aimedI}: the cube starts at ${pl.ent.gm}`;
    // facing west the same aim puts the cube's far end on the aimed cell
    p().pos.set(cellX(aimedI) + 2.4, 0, cellZ(k - 1)); p().vel.set(0, 0, 0); p().yaw = -Math.PI / 2; p().pitch = -0.45; const eye = p().eyePos(new THREE.Vector3()), dir = p().forward(new THREE.Vector3());
    const aimed = M().rayEmpty(eye, dir, 5).last.i; const pw = M().planFrame(eye, dir, -Math.PI / 2, 'timber'); if (!pw.ok) return 'facing west: ' + pw.why; return (pw.ent.gm + 3 === aimed && pw.ent.axis === 'x') || `facing west, aimed at ${aimed}: the cube is at ${pw.ent.gm}`;
  });

  await T('mining.frame-cube.snaps-in-steps-of-4-on-all-six-sides', async () => {
    const { i0, k0 } = sealed(); const R = { m: i0 + 10, lo: k0 + 8, j: 0 };
    dig(i0 + 2, k0 + 2, 20, 16, 8, false);
    const A = cube('x', 'timber', R.m, R.lo, 0); craft('frame:timber', 8); selectTool('frame:timber'); g.frameYaw = null;
    const cx = A.cx, cz = A.cz, out = [];
    const sides = {
      'next in line': { at: [cx + 2.4, 0, cz], want: [R.m + 4, R.lo, 0] }, 'behind': { at: [cx - 2.4, 0, cz], want: [R.m - 4, R.lo, 0] },
      'beside it +': { at: [cx, 0, cz + 2.4], want: [R.m, R.lo + 4, 0] }, 'beside it -': { at: [cx, 0, cz - 2.4], want: [R.m, R.lo - 4, 0] },
    };
    for (const [name, s] of Object.entries(sides)) {
      aimPoint(s.at[0], s.at[1], s.at[2], 2.4); const pl = await plan(); if (!pl.ok) { out.push(name + ': ' + pl.why); continue; }
      const e = pl.ent; if (e.gm !== s.want[0] || e.glo !== s.want[1] || e.gj !== s.want[2]) out.push(`${name}: wanted ${s.want}, got ${e.gm},${e.glo},${e.gj}`);
      if (Math.abs(Math.hypot(e.cx - cx, e.cz - cz) - 2.4) > 0.01) out.push(name + ': not one module (2.4 m) away');
      if (!e.snap) out.push(name + ': no snap label');
    }
    // up: aim at the ceiling over the cube
    aimPoint(cx, 4.6, cz, 0.9); let pl = await plan(); if (!pl.ok || pl.ent.gj !== 4 || pl.ent.gm !== R.m || pl.ent.glo !== R.lo || !/above/.test(pl.ent.snap || '')) out.push('above it: ' + JSON.stringify([pl.ok, pl.why, pl.ent && [pl.ent.gm, pl.ent.glo, pl.ent.gj, pl.ent.snap]]));
    // down: a cube on the second level has the first level under it
    const B = cube('x', 'timber', R.m + 4, R.lo, 4); aimPoint(B.cx, 0, B.cz, 0.9); pl = await plan(); if (!pl.ok || pl.ent.gj !== 0 || pl.ent.gm !== R.m + 4 || pl.ent.glo !== R.lo || !pl.ent.snap) out.push('below it: ' + JSON.stringify([pl.ok, pl.why, pl.ent && [pl.ent.gm, pl.ent.glo, pl.ent.gj, pl.ent.snap]]));
    // aiming into a cube that stands: nothing to place; and a snapped cube never lands half inside another
    aimPoint(cx, 0, cz, 2.4); pl = await plan(); if (pl.ok) out.push('aiming into a standing cube planned another');
    return out.length === 0 || out.join(' | ');
  });

  await T('mining.frame-cube.a-run-of-cubes-lines-up-and-never-overlaps', async () => {
    const { i0, k0 } = sealed(); dig(i0 + 2, k0 + 10, 30, 4, 4, false); craft('frame:timber', 8); selectTool('frame:timber'); g.frameYaw = null;
    const m0 = i0 + 6, lo = k0 + 10; let prev = cube('x', 'timber', m0, lo, 0); const out = [];
    for (let n = 1; n < 5; n++) {
      aimPoint(prev.cx + 2.4, 0, prev.cz, 2.4); const pl = await plan(); if (!pl.ok) { out.push(`cube ${n}: ${pl.why}`); break; }
      if (pl.ent.gm !== m0 + 4 * n || pl.ent.glo !== lo) { out.push(`cube ${n} at ${pl.ent.gm},${pl.ent.glo}`); break; }
      placeNow(); prev = S().entities.at(-1);
    }
    const blocks = S().entities.filter((e) => e.type === 'frame').map((e) => M().frameBlock(e)); for (const b of blocks) if (b.n !== 4) out.push('block depth ' + b.n);
    const ms = blocks.map((b) => b.m).sort((a, b) => a - b); for (let n = 1; n < ms.length; n++) if (ms[n] - ms[n - 1] !== 4) out.push('gap or overlap between ' + ms[n - 1] + ' and ' + ms[n]);
    return out.length === 0 || out.join(' | ');
  });

  await T('mining.frame-cube.a-turned-frame-is-2.4-m-deep-and-cannot-cut-through-its-neighbour', async () => {
    fresh(up); const sp = spot(); let i = sp.i, k = sp.k; for (const lane of [20, 28, 6, -6]) { if (w().topAt(i + 12, k) >= 8) break; try { const q = spot(lane); i = q.i; k = q.k; } catch (e) { /* none */ } }
    dig(i, k - 6, 40, 12, 4, false); craft('frame:timber', 6); selectTool('frame:timber'); g.frameYaw = 1.2; look(cellX(i + 12), cellZ(k)); let pl = await plan(); if (!pl.ok) return pl.why;
    const e = pl.ent; if (!e.turned || Math.abs(e.d - 2.36) > 0.01 || Math.abs(e.w - 2.36) > 0.01) return 'turned frame is ' + e.w + ' x ' + e.d;
    placeNow(); const a = S().entities.at(-1); if (Math.abs(a.d - 2.36) > 0.01 || !a.turned) return 'saved turned frame lost its depth';
    const along = { x: Math.sin(1.2), z: Math.cos(1.2) };
    const at = async (dist) => { g.frameYaw = 1.2; look(a.cx + along.x * dist, a.cz + along.z * dist); return plan(); };
    const half = await at(1.2); if (half.ok) return 'a frame half a depth further along was allowed (it cuts through the first)';
    const flush = await at(2.38); if (!flush.ok) return 'a frame set flush 2.4 m along the first was refused: ' + flush.why;
    // the mesh: 2.36 deep in its own frame of reference
    const it = M().items.get(a.id); const rot = it.obj.rotation.y; it.obj.rotation.y = 0; it.obj.updateMatrixWorld(true); const sz = new THREE.Box3().setFromObject(it.obj).getSize(new THREE.Vector3()); it.obj.rotation.y = rot;
    return (Math.abs(sz.z - 2.36) < 0.04 && Math.abs(rot - 1.2) < 1e-9) || `turned mesh depth ${sz.z.toFixed(2)} rotation ${rot}`;
  });

  await T('mining.frame-cube.the-cube-section-is-supported-and-the-reach-is-centred-on-it', async () => {
    const { i, k } = tunnel(4, 4, 30); look(cellX(i + 14), cellZ(k - 1)); const pl = await plan(); if (!pl.ok) return pl.why; placeNow(); const e = S().entities.at(-1);
    const sup = w().supports.find((s) => s.id === e.id); if (!sup || Math.abs(sup.x - e.cx) > 1e-9 || Math.abs(sup.z - e.cz) > 1e-9 || Math.abs(sup.y - (e.y0 + e.h / 2)) > 1e-9) return 'the support is not at the cube centre';
    // every roof cell over the cube counts as supported
    const bad = []; const b = M().frameBlock(e); for (let a = 0; a < 4; a++) for (let c = 0; c < 4; c++) { const ii = b.m + a, kk = b.lo + c; const bonus = w().supportBonus(cellX(ii), 4 * C + C / 2, cellZ(kk)); if (!(bonus > 0)) bad.push(ii + ',' + kk); }
    return bad.length === 0 || 'unsupported roof cells over the cube: ' + bad.join(' ');
  });

  // dig the standard tunnel at (i, k): 4 wide, 4 high, len long. The old workings and caves scattered through the pile (different in every world) would add roof
  // area to the measurement, so a lane with a hollow near it is skipped for the next lane over.
  const carveClean = (i, k0, len, rc) => {
    for (let t = 0; t < 14; t++) {
      const k = k0 + t * (2 * rc + 6);   // the failed lane's tunnel is a hollow too: step clear of it
      for (let a = 0; a < len; a++) for (let b = 0; b < 4; b++) for (let j = 0; j < 4; j++) w().removeCell(i + a, j, k + b, false);
      let odd = 0; for (let a = -rc; a < len + rc; a++) for (let b = -rc; b < 4 + rc; b++) for (let j = 0; j < 12; j++) { const inT = a >= 0 && a < len && b >= 0 && b < 4 && j < 4, v = w().get(i + a, j, k + b); if (inT ? v : !v) odd++; }
      if (!odd) return k;
    }
    return k0;
  };
  await T('mining.frame-cube.every-tier-is-at-100-percent-load-at-its-rated-depth-in-a-standard-tunnel', async () => {
    await newWorld(); fresh(up); const bad = []; let row = 0;
    for (const [kind, f] of Object.entries(FRAME_TYPES)) {
      if (!isFinite(f.maxDepth) || f.maxDepth * 1.2 > 2800) continue;
      const at = {}, diag = {};
      for (const mult of [0.8, 1.0, 1.2]) {
        const d = f.maxDepth * mult, i = toI(d), len = 2 * Math.ceil(f.radius / C) + 4, k = carveClean(i, toK(40 + (row++) * 12), len, Math.ceil(f.radius / C) + 2);   // a 4 wide, 4 high tunnel longer than the reach: the cube sits in its middle
        const ent = cube('x', kind, i + len / 2 - 2, k, 0); const s = w().supports.find((q) => q.id === ent.id); at[mult] = loadOn(w(), s) / s.cap;
        let voids = 0, left = 0; for (let a = -8; a < len + 8; a++) for (let b = -8; b < 12; b++) for (let j = 0; j < 12; j++) { const inT = a >= 0 && a < len && b >= 0 && b < 4 && j < 4, v = w().get(i + a, j, k + b); if (inT) { if (v) left++; } else if (!v) voids++; }
        diag[mult] = `supports ${w().supports.length} voids ${voids} left ${left} top ${w().topAt(i, k)} seed ${S().seed}`;
      }
      if (!(at[1.0] > 0.93 && at[1.0] < 1.07)) bad.push(`${kind}: ${(at[1.0] * 100).toFixed(1)}% at its rating (${diag[1.0]})`);
      if (!(at[0.8] < 1)) bad.push(`${kind}: ${(at[0.8] * 100).toFixed(0)}% at 80% of its rating (${diag[0.8]})`);
      if (!(at[1.2] > 1)) bad.push(`${kind}: only ${(at[1.2] * 100).toFixed(0)}% at 120% of its rating`);
    }
    return bad.length === 0 || bad.join(' | ');
  });

  await T('mining.frame-cube.a-lined-tunnel-of-cubes-stands-far-past-the-unsupported-length', async () => {
    const { i, k } = tunnel(4, 4, 44); const n = 11; for (let q = 0; q < n; q++) cube('x', 'timber', i + 4 * q, k - 2, 0);
    for (let s = 0; s < 400; s++) w().stabQueue.push({ i: i + (s % 44), j: 4, k: k - 2 + (s % 4) });
    const hooks = { onCreak: () => {}, release: () => {}, onRegion: () => {} }; for (let q = 0; q < 60; q++) w().updateStability(1 / 60, g.T.warn, hooks);
    let hole = 0; for (let a = 0; a < 44; a++) for (let c = 0; c < 4; c++) for (let j = 0; j < 4; j++) if (w().get(i + a, j, k - 2 + c)) hole++;
    // and the same tunnel without a single frame is not safe: it is longer than the safe length
    return hole === 0 || `${hole} plush fell into the lined tunnel`;
  });

  await T('mining.frame-cube.hammer-takes-a-cube-down-from-inside-or-from-a-pillar-and-gives-it-back', async () => {
    const { i, k } = tunnel(4, 4, 30); look(cellX(i + 14), cellZ(k - 1)); await plan(); placeNow(); const e = S().entities.at(-1); S().items = {};
    selectTool('hammer'); g.stowed = false;
    // standing in the middle looking along the tunnel at the far pillar, then from outside at a corner pillar
    p().pos.set(e.cx - 0.9, 0, e.cz); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = -0.1; g.renderer.camera.position.copy(p().eyePos(new THREE.Vector3()));
    let ref = g.hammerTarget(); if (!ref || ref.id !== e.id) return 'the hammer found nothing from inside the cube: ' + JSON.stringify(ref);
    p().pos.set(e.cx - 3.4, 0, e.cz + 1.1); p().yaw = Math.PI / 2; p().pitch = 0.1; g.renderer.camera.position.copy(p().eyePos(new THREE.Vector3())); ref = g.hammerTarget(); if (!ref || ref.id !== e.id) return 'the hammer missed a pillar from outside: ' + JSON.stringify(ref);
    const named = g.describeRef(ref); if (!/4x4x4/.test(named || '')) return 'the hammer name does not say 4x4x4: ' + named;
    g.doDecon(ref);
    return (S().items['frame:timber'] === 1 && !w().supports.some((s) => s.id === e.id) && !S().entities.some((x) => x.id === e.id) && !M().items.has(e.id)) || 'cube not given back: ' + JSON.stringify(S().items);
  });

  await T('mining.frame-cube.a-support-fan-hangs-under-the-middle-of-the-top-beam', async () => {
    const { i, k } = tunnel(4, 4, 30); look(cellX(i + 14), cellZ(k - 1)); await plan(); placeNow(); const e = S().entities.at(-1);
    const spine = frameMembers(e.kind, e.w, e.h, e.d).find((q) => Math.abs(q.p[0]) < 1e-9 && q.p[1] > e.h - 0.3 && q.s[2] > 1.5); if (!spine) return 'there is no beam along the middle of the top';
    craft('mfan'); selectTool('mfan'); aimPoint(e.cx, e.y0 + e.h - 0.3, e.cz, 1.0); const pl = await plan(); if (!pl.ok) return pl.why;
    return (Math.abs(pl.ent.px - e.cx) < 1e-9 && Math.abs(pl.ent.pz - e.cz) < 1e-9 && pl.ent.py < e.y0 + e.h && pl.ent.py > e.y0 + e.h - 0.5) || 'fan is not under the middle of the top: ' + JSON.stringify([pl.ent.px - e.cx, pl.ent.py, pl.ent.pz - e.cz]);
  });

  await T('mining.frame-cube.a-pad-beside-a-cube-lines-up-edge-to-edge', async () => {
    const { i0, k0 } = sealed(40, 24, 14, { ...up, shellPads: 1, bulkhead: 1 }); dig(i0 + 2, k0 + 2, 30, 20, 8, false); const A = cube('x', 'timber', i0 + 10, k0 + 8, 0);
    const B = await import('../build.js'); craft('pad:timber'); selectTool('pad:timber'); aimPoint(A.cx + 2.4, 0, A.cz, 2.4); await plan(); const pl = g.plan;
    if (!pl || !pl.ok) return 'no pad plan: ' + (pl && pl.why); void B;
    return (pl.ent.i0 === A.gm + 4 && pl.ent.k0 === A.glo && /frame/.test(pl.ent.snap || '')) || `pad at ${pl.ent.i0},${pl.ent.k0} (${pl.ent.snap}), wanted ${A.gm + 4},${A.glo}`;
  });

  await T('mining.frame-cube.old-saves-load-one-cell-deep-frames-as-cubes', async () => {
    fresh(up); const sp = spot(); let i = sp.i, k = sp.k + 6; for (const lane of [18, 26, 8]) { if (w().topAt(i + 40, k) >= 8) break; try { const q = spot(lane); i = q.i; k = q.k; } catch (e) { /* none */ } }
    dig(i, k - 2, 30, 4, 4, false); dig(i + 20, k - 6, 8, 12, 4, false); dig(i + 34, k - 2, 3, 4, 4, false);
    const old = (axis, kind, m, lo, extra = {}) => ({ id: g.nextId(), type: 'frame', kind, axis, cx: axis === 'x' ? cellX(m) : cellX(lo) + 1.5 * C, cz: axis === 'x' ? cellZ(lo) + 1.5 * C : cellZ(m), y0: 0, w: 2.36, h: 2.38, gm: m, glo: lo, gj: 0, yaw: axis === 'x' ? Math.PI / 2 : 0, ...extra });
    const single = old('x', 'timber', i + 3, k - 2), run = []; for (let n = 0; n < 6; n++) run.push(old('x', 'timber', i + 10 + n, k - 2));
    const tight = old('x', 'steel', i + 35, k - 2);   // a pocket only 3 long: it cannot grow
    const turned = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'x', cx: cellX(i + 24), cz: cellZ(k) + 0.3, y0: 0, w: 2.36, h: 2.38, yaw: 0.4, turned: true };
    const fan = { id: g.nextId(), type: 'fan', mounted: true, frameId: single.id, px: single.cx, py: 2.1, pz: single.cz, fx: 1, fz: 0, fyaw: Math.PI / 2, dir: 0, i: toI(single.cx), j: 3, k: toK(single.cz) };
    const raw = json([single, ...run, tight, turned, fan]); const items0 = S().items['frame:timber'] || 0;
    S().entities = S().entities.filter((e) => e.free).concat(raw); const r = M().upgradeOldFrames(S()); for (const e of S().entities) if (!e.free) g.addEntity(e);
    const out = []; const frames = S().entities.filter((e) => e.type === 'frame');
    const one = frames.find((e) => e.id === single.id); if (!one || Math.abs(one.d - FRAME_D) > 1e-9 || one.gm !== i + 3) out.push('the single frame did not become a cube at its own cell: ' + JSON.stringify(one && [one.d, one.gm]));
    if (r.absorbed !== 4 || r.converted < 4) out.push('summary ' + JSON.stringify(r));
    if (S().items['frame:timber'] !== items0 + 4) out.push('absorbed frames were not given back: ' + S().items['frame:timber']);
    for (const f of frames) { if (f.id === tight.id) continue; if (f.d === undefined) out.push('a frame is still one cell deep: ' + f.id); else if (!f.turned) { const b = M().frameBlock(f); if (M().sectionSolid(b.axis, b.m, b.lo, b.j0).length) out.push('a converted cube stands on plush at ' + b.m); } }
    const t = frames.find((e) => e.id === tight.id); if (!t || t.d !== undefined) out.push('the frame in the tight pocket should stay as the old one cell deep frame'); else if (!M().items.get(t.id) || !w().supports.some((s) => s.id === t.id)) out.push('the old frame lost its support');
    const bl = frames.filter((f) => !f.turned && f.d !== undefined).map((f) => M().frameBlock(f)); for (const a of bl) for (const b of bl) if (a !== b && a.axis === b.axis && a.lo === b.lo && a.m < b.m + 4 && b.m < a.m + 4 && a.j0 === b.j0) out.push('two cubes overlap at ' + a.m + ' and ' + b.m);
    const tf = frames.find((e) => e.id === turned.id); if (!tf || Math.abs(tf.d - FRAME_D) > 1e-9 || !tf.turned || tf.yaw !== 0.4) out.push('the turned frame did not grow in place');
    const fn = tiles().find((q) => q.id === fan.id); if (!fn || fn.frameId !== single.id) out.push('the fan lost its frame');
    for (const f of frames) if (!w().supports.some((s) => s.id === f.id)) out.push('no support for ' + f.id);
    const again = M().upgradeOldFrames(S()); if (again.converted || again.absorbed) out.push('a second load changed things again: ' + JSON.stringify(again));
    return out.length === 0 || out.join(' | ');
  });

  await T('mining.frame-cube.the-roof-bolter-sets-one-cube-per-4-cells-of-advance', async () => {
    await newWorld(); fresh({ power: 1, belts: 1, sorter: 1, vault: 1, mech: 1, timber: 1, steel: 1, mechSpeed: 6, mechLayer: 1, mechBolt: 1 }); S().money = 1e12;
    const sp0 = spot(-6); const kk = sp0.k; let i0 = sp0.i; for (let g2 = 0; g2 < 60 && w().topAt(i0 + 8, kk) < 6; g2++) i0++;
    const mk = (type, i, j, k, extra = {}) => { const e = { id: g.nextId(), type, i, j, k, dir: 0, rise: 0, ...extra }; if (type === 'belt') e.items = []; S().entities.push(e); g.addEntity(e); return e; };
    const mech = mk('mech', i0 - 1, 0, kk, { dir: 0 }); for (let n = 1; n <= 4; n++) mk('belt', i0 - 1 - n, 0, kk, { dir: 2 }); mk('vault', i0 - 6, 0, kk, { dir: 2 });
    const calls = []; const orig = M().autoFrame.bind(M()); M().autoFrame = (...a) => { calls.push(mech.adv); return orig(...a); };
    const m0 = S().money; try { for (let n = 0; n < 3200; n++) { for (const t of tiles()) if (['mech', 'belt', 'vault', 'sorter'].includes(t.type)) t.pw = 1; g.time += 0.05; L().update(0.05); } } finally { M().autoFrame = orig; }
    const frames = S().entities.filter((e) => e.type === 'frame' && e.auto); const out = [];
    if (mech.adv < 8) return 'the mech only advanced ' + mech.adv; if (!frames.length) return 'no frames after ' + mech.adv + ' steps';
    if (calls.length !== Math.floor(mech.adv / 4) || calls.some((c) => c % 4 !== 0)) out.push(`autoFrame ran ${calls.length} times for ${mech.adv} steps at ${calls.slice(0, 6)}`);
    const bl = frames.map((f) => M().frameBlock(f)).sort((a, b) => a.m - b.m); for (const b of bl) if (b.n !== 4) out.push('lining depth ' + b.n);
    for (let n = 1; n < bl.length; n++) if ((bl[n].m - bl[n - 1].m) % 4 !== 0 || bl[n].m - bl[n - 1].m < 4) out.push('cubes ' + bl[n - 1].m + ' and ' + bl[n].m + ' do not line up');
    for (const f of frames) { const b = M().frameBlock(f); if (M().sectionSolid(b.axis, b.m, b.lo, b.j0).length) out.push('a cube stands in plush'); if (Math.abs(f.d - FRAME_D) > 1e-9 || Math.abs(f.h - FRAME_H) > 1e-9 || Math.abs(f.w - FRAME_W) > 1e-9) out.push('auto cube is not 4x4x4'); }
    const paid = m0 - S().money, want = 3 * mech.adv + frames.length * FRAME_TYPES.steel.cost; if (paid !== want) out.push(`paid ${paid}, expected ${want}`);
    return out.length === 0 || out.join(' | ');
  });

  // ---------------------------------------------------------------- multiplayer: the host re-checks the whole 4x4x4 section
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  let sent = []; const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  await T('mining.frame-cube.mp.the-host-rechecks-the-section-and-never-believes-a-guests-clear-list', async () => {
    try {
      const { i, k } = tunnel(4, 4, 6); look(cellX(i + 1), cellZ(k - 1)); const pl = await plan(); if (!pl.ok) return pl.why;
      const tool = { id: 'frame:timber', kind: 'frame', fk: 'timber' }; S().items['frame:timber'] = 5; role('host'); cap();
      const place = (ent) => { sent = []; const n0 = S().entities.length; g.netMessage({ t: 'cmd', c: 'place', d: json({ tool, ent }) }); return S().entities.length - n0; };
      const out = [], good = json(pl.ent);
      // a section with plush in it, whatever the guest says about it
      const bad1 = { ...good, gm: good.gm + 3, cx: cellX(good.gm + 3) + 1.5 * C, clear: [] };
      if (place(bad1) !== 0) out.push('a cube half in the pile was placed when the guest said clear: []');
      if (place({ ...good, d: 0.54 }) !== 0) out.push('a one cell deep frame from a guest was accepted');
      if (place({ ...good, w: 9 }) !== 0) out.push('a 9 m wide frame was accepted');
      if (place({ ...good, kind: 'steel' }) !== 0) out.push('a frame of the wrong kind was accepted');
      if (place({ ...good, cx: good.cx + 0.5 }) !== 0) out.push('a frame whose position does not match its grid cell was accepted');
      if (place({ ...good, gm: 'x' }) !== 0) out.push('a text grid origin was accepted');
      const pile = (() => { let n = 0; for (let a = 0; a < 40; a++) for (let c = -4; c < 6; c++) for (let j = 0; j < 4; j++) if (w().get(i + a, j, k + c)) n++; return n; })();
      const placed = place({ ...good, clear: [[i, 0, k], [i + 1, 1, k]] });
      const after = (() => { let n = 0; for (let a = 0; a < 40; a++) for (let c = -4; c < 6; c++) for (let j = 0; j < 4; j++) if (w().get(i + a, j, k + c)) n++; return n; })();
      if (placed !== 1) out.push('a valid cube was not placed: ' + placed); if (after !== pile) out.push('a guest list of cells to clear carved ' + (pile - after) + ' plush');
      if (!sent.some((m) => m.t === 'ent+' && m.ent.type === 'frame' && Math.abs(m.ent.d - FRAME_D) < 1e-9)) out.push('the new cube was not announced with its depth');
      if (place(good) !== 0) out.push('the same cube was placed twice');
      return out.length === 0 || out.join(' | ');
    } finally { done(); }
  });
}
