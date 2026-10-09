// hose.* : what a hose does once it is laid. Only the open mouth sucks plush off the floor (not every piece), the last piece in suck range of a bin glows gold and the aim
// says so before you set it down, hoses and belts hand plush to each other both ways, the readouts tell the truth, and a save and load keeps the look and the mouth.
import { makeHoseKit } from './hose_lib.js';
import { pools } from '../plushdata.js';
import { infoFor } from '../info.js';
import { loadSaved } from '../state.js';
import { SAVE_KEY } from '../config.js';

export default async function (ctx) {
  const { g, S, L, adv, cellX, cellZ, toI, toK, tiles } = ctx;
  const H = makeHoseKit(ctx), B = H.B, T = B.T, io = H.io;
  const bad = (a) => a.length === 0 || a.join('; ');

  await T('hose.only-the-mouth-sucks-plush-off-the-floor', async () => {
    H.setup(); const b = [], sim = g.sim;
    for (let s = 0; s < 8; s++) await H.put(s, 0, 0);
    const vault = B.vaultAt(H.o.i + 8, H.o.k); H.rebuild(); const mouth = H.tileAt(0, 0), end = H.tileAt(7, 0), x0 = cellX(mouth.i), z0 = cellZ(mouth.k);
    const nearMouth = H.spill(x0 - 1.5, z0, pools[0][0]);                       // 1.5 m in front of the mouth: sucked
    const pastEnd = H.spill(cellX(end.i) + 1.4, z0 + 0.3, pools[0][1]);         // beside the vault, 5.6 m from the mouth: the end does not suck
    const onMiddle = H.spill(cellX(H.tileAt(6, 0).i), z0, pools[0][2]);         // lying on a middle piece 3.6 m from the mouth: a belt would take it, a hose does not
    if (nearMouth < 0 || pastEnd < 0 || onMiddle < 0) return 'could not spawn the plush';
    const n0 = sim.n; B.seconds(3);
    if (sim.n !== n0 - 1) b.push(`bodies ${n0} -> ${sim.n} (only the one at the mouth should be taken)`);
    if (vault.stored.length !== 1 || vault.stored[0].sp !== pools[0][0]) b.push('the vault holds ' + vault.stored.map((x) => x.sp).join());
    let farLeft = false, midLeft = false; for (let q = 0; q < sim.n; q++) { if (sim.sp[q] === pools[0][1]) farLeft = true; if (sim.sp[q] === pools[0][2]) midLeft = true; }
    if (!farLeft) b.push('the far end sucked a plush'); if (!midLeft) b.push('a middle piece picked up the plush lying on it');
    // a mouth with no power does not suck
    const q2 = H.spill(x0 - 1.0, z0, pools[0][3]); const n1 = sim.n;
    for (let n = 0; n < 20; n++) { g.time += 0.1; for (const t of tiles()) if (t.type === 'belt') t.pw = 0; L().update(0.1); }
    if (sim.n !== n1 || q2 < 0) b.push('an unpowered mouth sucked');
    return bad(b);
  });

  await T('hose.the-end-piece-in-suck-range-of-a-bin-glows-gold-and-the-aim-says-stop', async () => {
    H.setup(); const b = [], bp = H.bin(), k = toK(bp.z);
    // walk the hose toward the bin along z = bin.z: the pieces near the bin face it by themselves
    const xs = [-3.6, -3.0, -2.4, -1.8]; for (const dx of xs) await H.putAt(toI(bp.x + dx), k, 0);
    H.rebuild(); L().refreshSinks(5); const last = L().tileAt(toI(bp.x - 1.8), 0, k), first = L().tileAt(toI(bp.x - 3.6), 0, k);
    if (!last || !last.hose || !L().sinkSet.has(last.id)) b.push('the end piece next to the bin is not gold'); if (first && L().sinkSet.has(first.id)) b.push('the mouth piece is gold');
    if (L().sinkSet.size !== 1 || L().goldRing.count !== 1 || L().goldPlate.count !== 0) b.push(`gold: ${L().sinkSet.size} pieces, rings ${L().goldRing.count}, plates ${L().goldPlate.count}`);
    if (H.mouths().length !== 1) b.push('mouths ' + H.mouths().length);
    // the aim: one cell further toward the bin would still be the end piece in range: gold, and the hint says so
    io.clearHint(); let pl = await H.aimAt(toI(bp.x - 1.2), k, 0);
    if (pl && pl.ok) { if (!pl.gold) b.push('the aimed piece next to the bin is not gold'); if (!/This end feeds the bin: stop here/.test(io.hint())) b.push('hint: ' + io.hint()); }
    io.clearHint(); pl = await H.aimAt(toI(bp.x - 8), k + 5, 0); if (pl.gold) b.push('a far aimed piece is gold'); if (/stop here/.test(io.hint())) b.push('a far aim says stop: ' + io.hint());
    // and the readout of the gold end
    const info = infoFor(g, { kind: 'tile', id: last.id }); const txt = info ? info.title + ' ' + info.lines.join(' ') : 'no info'; if (!/FEEDS THE BIN/.test(txt) || !/stop here/.test(txt)) b.push('readout: ' + txt.slice(0, 160));
    return bad(b);
  });

  await T('hose.built-away-from-the-bin-and-turning-on-the-way-is-one-hose-ending-gold-at-the-bin', async () => {
    H.setup(); const b = [], bp = H.bin(), k = toK(bp.z);
    // the first piece goes next to the bin, then you walk away from it facing away and keep pressing B, turning the view north for the last pieces
    const xs = [-1.8, -2.4, -3.0, -3.6, -4.2, -4.8, -5.4]; for (const dx of xs) { const pl = await H.putAt(toI(bp.x + dx), k, 2); if (!pl.ok) b.push(`piece at ${dx}: ${pl.why}`); }
    for (let s = 1; s <= 3; s++) await H.putAt(toI(bp.x - 5.4), k + s, 1);   // turned south (+z) at the far end
    H.rebuild(); L().refreshSinks(5); const hs = H.hoses(), m = H.mouths();
    if (hs.length !== 10) b.push('pieces ' + hs.length); if (m.length !== 1) b.push('mouths ' + m.length); else if (H.follow(m[0]) !== 10) b.push('not one line: ' + H.follow(m[0]));
    const end = L().tileAt(toI(bp.x - 1.8), 0, k); if (!end || !L().sinkSet.has(end.id)) b.push('the end next to the bin is not gold'); if (L().mouthMesh.count !== 1) b.push('flared mouths ' + L().mouthMesh.count);
    if (L().bendN !== 1) b.push('bends ' + L().bendN);
    return bad(b);
  });

  await T('hose.a-belt-feeds-a-hose-and-a-hose-feeds-a-belt', async () => {
    H.setup(); const b = [], sp = pools[1][0], i = H.o.i, k = H.o.k;
    // belt, belt, belt, then hose (laid through the planner), into a vault
    B.lay(0, 3, i, k, 0); for (let s = 3; s < 7; s++) await H.put(s, 0, 0);
    const v = B.vaultAt(i + 7, k); H.rebuild();
    const first = H.tileAt(3, 0); if (!first || !first.hose || !first.fed) b.push('the first hose piece after the belt is not fed'); if (H.mouths().length !== 0) b.push('a belt feeds the hose but it shows a mouth: ' + H.mouths().length);
    if (L().mouthMesh.count !== 0) b.push('flared mouths drawn ' + L().mouthMesh.count);
    L().tileAt(i, 0, k).items.push({ sp, vr: 0, t: 0 }); B.seconds(14); if (v.stored.length !== 1) b.push('belt then hose: the vault holds ' + v.stored.length);
    // hose, hose, hose, then belts, into a vault
    for (const t of tiles()) if (t.type === 'belt' && !t.free) L().remove(t); S().entities = S().entities.filter((e) => e.type !== 'belt' || e.free); v.stored.length = 0; g._lastLaid = null;
    for (let s = 0; s < 3; s++) await H.put(s, 3, 0); B.lay(0, 3, i + 3, k + 3, 0); const v2 = B.vaultAt(i + 6, k + 3); H.rebuild();
    if (H.mouths().length !== 1) b.push('hose then belt: mouths ' + H.mouths().length);
    H.tileAt(0, 3).items.push({ sp, vr: 0, t: 0 }); B.seconds(14); if (v2.stored.length !== 1) b.push('hose then belt: the vault holds ' + v2.stored.length);
    return bad(b);
  });

  await T('hose.a-sorting-box-behind-the-first-piece-feeds-it-so-it-is-not-a-mouth', async () => {
    H.setup(); const b = [];
    g.placeEntity('sorter', { i: H.o.i, j: 0, k: H.o.k, dir: 0 }, { quiet: true, rebuild: false });
    for (let s = 1; s < 4; s++) await H.put(s, 0, 0);
    if (H.hoses().length !== 3) b.push('pieces ' + H.hoses().length); if (H.mouths().length !== 0) b.push('mouths ' + H.mouths().length); if (L().mouthMesh.count !== 0) b.push('flared mouths drawn ' + L().mouthMesh.count);
    return bad(b);
  });

  await T('hose.a-belt-set-beside-the-open-end-of-a-hose-turns-it-too', async () => {
    H.setup(); const b = [];
    for (let s = 0; s < 3; s++) await H.put(s, 0, 0);
    S().items.belt = 5; g.rebuildTools(); H.K.equip('belt'); const pl = await H.aim(2, -1, 3);
    if (!pl.ent.turnPrev) b.push('no turn planned for a belt beside a hose end'); else { io.tap('KeyB'); adv(0.05); const t = H.tileAt(2, 0); if (!t || t.dir !== 3 || !t.hose) b.push('the hose end did not turn north: ' + (t && t.dir)); }
    H.rebuild(); if (H.mouths().length !== 1) b.push('mouths ' + H.mouths().length);
    return bad(b);
  });

  await T('hose.readouts-name-the-mouth-and-the-pieces-and-the-ghost-is-the-tube', async () => {
    H.setup(); const b = [];
    for (let s = 0; s < 4; s++) await H.put(s, 0, 0);
    const mouth = H.tileAt(0, 0), mid = H.tileAt(2, 0);
    const a = infoFor(g, { kind: 'tile', id: mouth.id }), c = infoFor(g, { kind: 'tile', id: mid.id });
    if (!a || !/MOUTH/.test(a.title) || !/pulls loose plush/.test(a.lines.join(' '))) b.push('mouth readout: ' + (a && a.title)); if (!c || /MOUTH/.test(c.title) || !/Only the mouth/.test(c.lines.join(' '))) b.push('piece readout: ' + (c && c.title + ' ' + c.lines[1]));
    if (!/plush per min/.test(a.lines[0])) b.push('no rate: ' + a.lines[0]);
    // the aim: a tube (one mesh group of tubes), not the belt bed; the hint says how to lay on
    await H.aim(4, 0, 0); const gh = g.machines.ghost; let tubes = 0, boxes = 0; if (gh) gh.traverse((o) => { if (o.isMesh) { if (o.geometry.type === 'BoxGeometry') boxes++; else tubes++; } });
    if (!gh || tubes < 1 || boxes) b.push(`ghost: ${tubes} tube meshes, ${boxes} box meshes`);
    if (!/hold B to lay a line/.test(io.hint()) || !/click/.test(io.hint())) b.push('hint: ' + io.hint());
    return bad(b);
  });

  await T('hose.the-ghost-of-a-bend-and-of-the-first-piece-show-the-bend-and-the-mouth', async () => {
    H.setup(); const b = [];
    const meshes = () => { const o = { n: 0, ring: 0, mouth: 0 }; if (g.machines.ghost) g.machines.ghost.traverse((m) => { if (m.isMesh) { o.n++; if (m.geometry.type === 'TorusGeometry') o.ring++; if (m.geometry.type === 'CylinderGeometry') o.mouth++; } }); return o; };
    await H.aim(0, 0, 0); let m = meshes(); if (m.ring !== 1 || m.mouth !== 1) b.push(`the first piece: ring ${m.ring}, mouth ${m.mouth}`);
    for (let s = 0; s < 3; s++) await H.put(s, 0, 0);
    await H.aim(3, 0, 0); m = meshes(); if (m.ring || m.mouth) b.push('a piece in front of the line shows a mouth'); const straight = m.n;
    await H.aim(2, -1, 3); m = meshes(); if (m.ring || m.mouth) b.push('a piece beside the end shows a mouth'); if (m.n !== straight + 1) b.push(`the bend the last piece will take is not drawn (${m.n} meshes against ${straight})`);
    return bad(b);
  });

  await T('hose.a-save-and-load-keeps-the-hose-the-bends-and-the-one-mouth', async () => {
    H.setup(); const b = [];
    for (let s = 0; s < 3; s++) await H.put(s, 0, 0); for (let s = 1; s <= 3; s++) await H.put(2, -s, 3); for (let s = 3; s <= 5; s++) await H.put(s, -3, 0);
    H.rebuild(); const before = { n: H.hoses().length, bends: L().bendN, l: L().bendLMesh.count, r: L().bendRMesh.count, mouths: L().mouthMesh.count, tubes: L().hoseMesh.count, dirs: H.dirsOf().join('') };
    g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) return 'save failed';
    const raw = localStorage.getItem(SAVE_KEY); if (!/"hose":true/.test(raw)) b.push('the save does not carry the hose flag');
    const saved = loadSaved(); g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play'; H.rebuild();
    const after = { n: H.hoses().length, bends: L().bendN, l: L().bendLMesh.count, r: L().bendRMesh.count, mouths: L().mouthMesh.count, tubes: L().hoseMesh.count, dirs: H.dirsOf().join('') };
    if (JSON.stringify(before) !== JSON.stringify(after)) b.push(`before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
    if (H.mouths().length !== 1) b.push('mouths after the load ' + H.mouths().length);
    // and it can still be hammered, one hose back
    const n0 = S().items.hose || 0; const t = H.hoses()[3]; g.doDecon({ kind: 'tile', id: t.id }); if ((S().items.hose || 0) !== n0 + 1) b.push('the hammer gave back ' + ((S().items.hose || 0) - n0));
    return bad(b);
  });
}
