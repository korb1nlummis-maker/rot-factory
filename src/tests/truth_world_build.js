// In-world keys, part 3: the building keys (B, hold B, left click drag, - =, R, Shift+R, Ctrl, X, Shift+X, E on a pad) exactly as the controls table words them.
import { makeShell, UP } from './build_lib.js';
import { makeIO } from './truth_world_lib.js';
export default async function (ctx) {
  const { T, g, S, adv, craft, toI, toK, plan, cellX, cellZ } = ctx;
  const K = makeShell(ctx);
  const io = makeIO(ctx);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { K.clean(); } });
  const pads = () => S().entities.filter((e) => e.type === 'pad');
  const kinds = (t) => S().entities.filter((e) => e.type === t);

  await guard('truth.world.keys-hold-b-and-drag-lays-pads-in-one-go-up-to-10-and-shift-drags-a-block-up-to-5x5', async () => {
    K.setup(); craft('pad:timber', 40); K.equip('pad:timber'); const bad = []; const i = toI(-26), k = toK(0);
    const drag = async (di, dk, shift, i = toI(-26), k = toK(6), stand = 0) => { K.aim(i, k, { back: 2.6 }); await plan(); io.down('KeyB'); if (!g._bhold) return 'B did not anchor a drag'; K.aim(i + stand, k + (stand ? 5 : 0), { back: 2.6, pitchTo: { x: cellX(i + di), y: 0, z: cellZ(k + dk) } });   // the crosshair reaches 18 m: walk along for a long line
 if (shift) io.down('ShiftLeft', { shiftKey: true }); adv(0.1); await plan(); io.up('KeyB'); adv(0.1); if (shift) io.up('ShiftLeft'); return null; };
    let r = await drag(16, 0, false, i, k); if (r) return r; if (pads().length !== 5) bad.push(`hold B and drag 16 cells laid ${pads().length} pads, not 5`);
    K.clean(); K.setup(); craft('pad:timber', 40); K.equip('pad:timber'); r = await drag(40, 0, false, toI(-26), toK(6), 30); if (r) return r; if (pads().length !== 10) bad.push(`a long drag laid ${pads().length} pads, not the "up to 10" the table says`);
    K.clean(); K.setup(); craft('pad:timber', 40); K.equip('pad:timber'); r = await drag(16, 16, true, toI(-26), toK(-4)); if (r) return r; if (pads().length !== 25) bad.push(`Shift + drag laid ${pads().length} pads, not a 5 x 5 block`);
    // left click holds the same drag
    K.clean(); K.setup(); craft('pad:timber', 40); K.equip('pad:timber'); K.aim(i, k, { back: 2.6 }); await plan(); io.mouseDown(0); if (!g._bhold) bad.push('left click did not anchor a drag'); K.aim(i, k, { back: 2.6, pitchTo: { x: cellX(i + 8), y: 0, z: cellZ(k) } }); adv(0.1); await plan(); io.mouseUp(0); adv(0.1); if (pads().length !== 3) bad.push(`left click and drag laid ${pads().length} pads, not 3`);
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-minus-equals-set-the-zoop-and-shift-the-width-and-the-leveling-pad-size-is-1-to-3', async () => {
    K.setup({ ...UP }); craft('pad:timber', 40); craft('catwalk', 20); craft('wall', 20); const bad = []; const i = toI(-26), k = toK(0);
    for (const [id, n] of [['pad:timber', 10], ['catwalk', 10], ['wall', 10]]) {
      K.clean(); K.setup(); craft(id, 40); K.equip(id); g._bz = { n: 1, w: 1 };
      for (let q = 0; q < 14; q++) io.tap('Equal'); K.aim(i, k, { back: 2.6, dir: id === 'wall' ? 1 : 0 }); const pl = await plan(); const got = pl && pl.ent && pl.ent.zoop ? pl.ent.zoop.length : 0; if (got !== n) bad.push(`${id}: = x14 gave ${got}, not up to ${n}`);
      for (let q = 0; q < 14; q++) io.tap('Minus'); const pl2 = await plan(); if (!pl2.ent || pl2.ent.zoop.length !== 1) bad.push(`${id}: - x14 did not come back to one`);
    }
    K.clean(); K.setup(); craft('pad:timber', 40); K.equip('pad:timber'); g._bz = { n: 1, w: 1 }; for (let q = 0; q < 14; q++) io.tap('Equal'); for (let q = 0; q < 8; q++) io.shiftTap('Equal'); K.aim(i, k, { back: 2.6 }); const pw = await plan();
    if (!pw.ent || pw.ent.zw !== 5 || pw.ent.zn > 5 || pw.ent.zoop.length > 25) bad.push(`Shift + = : width ${pw.ent && pw.ent.zw}, length ${pw.ent && pw.ent.zn}`);
    K.clean(); K.setup(); craft('levelpad'); K.equip('levelpad'); g._bz = { n: 10, w: 1 }; K.aim(i, k, { back: 2.6 }); io.tap('Minus'); let pl3 = await plan(); const s1 = pl3.ent && pl3.ent.size; if (s1 !== 2) bad.push('Leveling Pad: - from a stale long zoop number (10) should step 3 to 2 at once, size ' + s1);
    for (let q = 0; q < 5; q++) io.tap('Minus'); pl3 = await plan(); if (pl3.ent.size !== 1) bad.push('Leveling Pad - does not reach size 1: ' + pl3.ent.size); for (let q = 0; q < 8; q++) io.tap('Equal'); pl3 = await plan(); if (pl3.ent.size !== 3) bad.push('Leveling Pad = does not stop at 3: ' + pl3.ent.size);
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-r-turns-and-shift-r-nudges-a-floor-pad-catwalk-or-wall-and-ctrl-locks-a-pad-to-the-world-grid', async () => {
    K.setup(); const bad = []; const i = toI(-26), k = toK(0);
    for (const id of ['pad:timber', 'catwalk', 'wall']) {
      K.clean(); K.setup(); craft(id, 4); K.equip(id); g._bn = 0; g._bRot = 0; g._bz = { n: 1, w: 1 }; K.aim(i, k, { back: 2.6 }); const a = await plan(); const e0 = a.ent;
      const dirOf = (e) => (e.zd !== undefined ? e.zd : e.ax); const d0 = dirOf(e0); const x0 = e0.i0, z0 = e0.k0;
      io.tap('KeyR'); const b = await plan(); if (dirOf(b.ent) === d0 && (b.ent.i0 === x0 && b.ent.k0 === z0)) bad.push(`${id}: R did not turn it`);
      g._bRot = 0; io.shiftTap('KeyR'); const c = await plan(); if (c.ent.i0 === x0 && c.ent.k0 === z0) bad.push(`${id}: Shift+R did not move it one cell off the grid (${io.hint()})`);
      const seen = [g._bn]; for (let q = 0; q < 3; q++) { io.shiftTap('KeyR'); seen.push(g._bn); } if (seen.join() !== '1,2,3,0') bad.push(`${id}: Shift+R does not cycle 0 to 3 (${seen.join()})`);
    }
    K.clean(); K.setup(); craft('pad:timber', 4); K.equip('pad:timber'); g._bn = 0; K.aim(i, k, { back: 2.6 }); io.down('ControlLeft'); const world = await plan(); io.up('ControlLeft'); if (!/world grid/.test(world.ent.snap || '') && !/world grid/.test(document.getElementById('hint').textContent + JSON.stringify(g._xInfo || {}))) bad.push('Ctrl did not lock the pad to the world grid: ' + world.ent.snap);
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-x-takes-one-piece-and-shift-x-the-whole-zoop-and-the-hammer-does-one-piece', async () => {
    K.setup(); craft('pad:timber', 8); K.equip('pad:timber'); const bad = []; const i = toI(-26), k = toK(0); g._bz = { n: 4, w: 1 }; g._bRot = 0;
    K.aim(i, k, { back: 2.6 }); await plan(); io.tap('KeyB'); adv(0.1); const made = pads().length; if (made !== 4) return `a 4 zoop laid ${made}`; const back0 = S().items['pad:timber'] || 0;
    g.stowed = true; g.rebuildTools(); K.aim(i + 1, k + 1, { y: 0.6, back: 2.2 }); adv(0.1); io.tap('KeyX'); const after1 = pads().length; if (after1 !== 3) bad.push(`X took ${made - after1} pieces, not one`); if ((S().items['pad:timber'] || 0) !== back0 + 1) bad.push('X did not give the pad back');
    K.aim(i + 5, k + 1, { y: 0.6, back: 2.2 }); adv(0.1); io.shiftTap('KeyX'); if (pads().length !== 0) bad.push(`Shift+X left ${pads().length} of the zoop`);
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-e-on-a-pad-puts-up-or-takes-down-a-rail-on-the-edge-you-aim-at', async () => {
    K.setup(); craft('pad:timber', 2); K.equip('pad:timber'); g._bz = { n: 1, w: 1 }; const bad = []; const i = toI(-26), k = toK(0); K.aim(i, k, { back: 2.6 }); await plan(); io.tap('KeyB'); adv(0.1); const A = pads()[0]; if (!A) return 'no pad';
    g.stowed = true; g.rebuildTools(); K.aim(A.i0 + 3, A.k0 + 1, { y: 0.6, back: 3.2 }); adv(0.1); io.tap('KeyE'); if ((A.rail | 0) !== 1) bad.push('E on the east edge: rail ' + A.rail); io.tap('KeyE'); if ((A.rail | 0) !== 0) bad.push('E again did not take it down: ' + A.rail);
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-e-on-a-leveling-pad-stops-and-runs-it-and-the-hint-names-the-state-it-is-in-now', async () => {
    K.setup(); craft('levelpad'); K.equip('levelpad'); const bad = []; K.aim(toI(-22), toK(3), { back: 2.6 }); await plan(); io.tap('KeyB'); adv(0.1);
    const e = S().entities.find((x) => x.type === 'levelpad'); if (!e) return 'no leveling pad was set down'; g.stowed = true; g.rebuildTools(); K.aim(e.i, e.k, { y: 0.3, back: 2.0 }); adv(0.1);
    const on0 = !!e.on; io.clearHint(); io.tap('KeyE'); if (!!e.on === on0) bad.push('E did not switch the pad'); const word = (/running/.test(io.hint()) ? 'on' : /stopped/.test(io.hint()) ? 'off' : '?'); if (word !== (e.on ? 'on' : 'off')) bad.push(`the hint "${io.hint()}" does not match the pad (${e.on ? 'on' : 'off'})`);
    io.clearHint(); io.tap('KeyE'); const word2 = (/running/.test(io.hint()) ? 'on' : /stopped/.test(io.hint()) ? 'off' : '?'); if (!!e.on !== on0 || word2 !== (e.on ? 'on' : 'off')) bad.push(`second E: "${io.hint()}" with the pad ${e.on ? 'on' : 'off'}`);
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-shift-x-takes-down-a-whole-catwalk-or-wall-zoop-and-x-takes-one-piece', async () => {
    const bad = []; const i = toI(-26), k = toK(0);
    for (const [id, type, dir] of [['catwalk', 'catwalk', 0], ['wall', 'wall', 1]]) {
      K.clean(); K.setup(); craft(id, 8); K.equip(id); g._bz = { n: 3, w: 1 }; g._bRot = 0; K.aim(i, k, { back: 2.6, dir }); await plan(); io.tap('KeyB'); adv(0.1);
      const mine = () => S().entities.filter((e) => e.type === type); const n = mine().length; if (n !== 3) { bad.push(`${id}: a 3 zoop laid ${n}`); continue; }
      g.stowed = true; g.rebuildTools(); const a = mine()[1]; const ci = a.i0 + 1, ck = type === 'wall' ? a.k0 + 1 : a.k0;
      K.aim(ci, type === 'wall' ? ck : ck + 3, { back: type === 'wall' ? 2.2 : 0, dir: type === 'wall' ? dir : 1, pitchTo: { x: cellX(ci), y: 0.3, z: cellZ(ck) } }); adv(0.1); io.shiftTap('KeyX'); if (mine().length !== 0) bad.push(`${id}: Shift+X left ${mine().length} of ${n}`);
    }
    return bad.length === 0 || bad.join('; ');
  });
}
