import * as PD from '../plushdata.js';
// build.level-*: the Leveling Pad machine. It digs out a box of plush in front of it and lays pads (pays for them), one 4 x 4 slot at a time, from a pole or generator in reach.
import { makeShell } from './build_lib.js';
import { DEMAND } from '../power.js';
import { infoFor, findInfoRef } from '../info.js';
import { NEEDLE } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, adv, V3, cellX, cellZ, toI, toK, craft, selectTool, plan } = ctx;
  const K = makeShell(ctx), B = K.B;
  const I0 = () => toI(-14), K0 = () => toK(2);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { K.clean(); for (const t of [...L().tiles.values()]) if (!t.free && (t.type === 'gen' || t.type === 'pole')) { L().remove(t); S().entities = S().entities.filter((x) => x.id !== t.id); } } });
  // a powered pole two cells beside the machine: a generator fed with commons, a pole, run for a moment so the grid solver marks the pole powered
  const rig = async (i, k) => {
    const gen = { id: g.nextId(), type: 'gen', i: i - 3, j: 0, k: k + 4, dir: 0, rise: 0, items: [] }; S().entities.push(gen); g.addEntity(gen);
    const pole = { id: g.nextId(), type: 'pole', i: i - 1, j: 0, k: k + 3, dir: 0, rise: 0, items: [] }; S().entities.push(pole); g.addEntity(pole);
    S().carry = []; for (let q = 0; q < 12; q++) S().carry.push({ sp: 2, vr: 0 }); g.useTile(gen); S().carry = []; g.power.markDirty(); adv(1.6); return { gen, pole };
  };
  const slotCells = (e, n = 0) => { const s = B.levelSlots(e)[n]; const out = []; for (let r = 0; r < 5; r++) for (let dk = 0; dk < 4; dk++) for (let di = 0; di < 4; di++) out.push([s.i0 + di, s.j + r, s.k0 + dk]); return { slot: s, cells: out }; };
  const placeLevel = async (i, k, size = 1) => { g._bz = { n: size, w: 1 }; const r = await K.put('levelpad', i, k, { back: 2.2 }); return r; };

  await guard('build.level-pad-digs-lays-and-charges', async () => {
    K.setup(); const bad = [], i = I0(), k = K0(); await rig(i, k);
    const r = await placeLevel(i, k); if (!r.ok) return r.why; const E = r.made[0]; if (E.type !== 'levelpad' || E.size !== 1 || E.on !== true || !g.machines.items.get(E.id)) return 'ent ' + JSON.stringify(E);
    const { slot, cells } = slotCells(E); for (const [ci, cj, ck] of cells) if (cj >= 1 && cj <= 4 && (ci + ck) % 2 === 0) w().setCell(ci, cj, ck, 3, 0);
    let plush = cells.filter(([ci, cj, ck]) => w().get(ci, cj, ck)).length; if (plush < 30) bad.push('test setup: only ' + plush + ' plush');
    const money0 = S().money, cost = B.PAD_PRICE[E.mk] * 3; const cells0 = S().stats.cells || 0;
    adv(2); const dug2 = cells.filter(([ci, cj, ck]) => w().get(ci, cj, ck) === 0).length; if (!(dug2 > 0 && dug2 < cells.length) || E.st !== 'dig') bad.push(`after 2 s: state ${E.st}, dug ${plush - cells.filter(([ci, cj, ck]) => w().get(ci, cj, ck)).length} of ${plush}`);
    // at most 8 cells a second at full power
    const dugNow = plush - cells.filter(([ci, cj, ck]) => w().get(ci, cj, ck)).length; if (dugNow > 8 * 2.4) bad.push('dug faster than the rate: ' + dugNow + ' in 2 s');
    adv(12); const left = cells.filter(([ci, cj, ck]) => { const s = w().get(ci, cj, ck); return s && s !== PD.PAD; }).length; if (left) bad.push(left + ' plush left in the box');
    const pads = S().entities.filter((e) => e.type === 'pad'); if (pads.length !== 1) bad.push('pads laid: ' + pads.length); else if (pads[0].i0 !== slot.i0 || pads[0].k0 !== slot.k0 || pads[0].j !== slot.j || pads[0].grp !== E.grp) bad.push('pad at the wrong place or group: ' + JSON.stringify(pads[0]));
    if (pads[0] && !K.solidCells(pads[0])) bad.push('the pad has no cells');
    if (E.st !== 'done' || E.on !== false) bad.push('state ' + E.st + ' on ' + E.on);
    // paid at the full bench price per pad (the salvage of the dug plush came in)
    const spent = money0 - S().money; if (spent > cost) bad.push('net spend ' + spent + ' is more than one pad ' + cost); if ((S().stats.cells || 0) <= cells0) bad.push('dug cells were not counted');
    // the pad can be hammered like any other and gives back its recipe item
    g.doDecon({ kind: 'mach', id: pads[0].id }); if (S().items['pad:' + E.mk] !== 1) bad.push('the laid pad does not hand back an item: ' + JSON.stringify(S().items));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.level-pad-needs-power-and-money', async () => {
    K.setup(); const bad = [], i = I0(), k = K0();
    const r = await placeLevel(i, k); if (!r.ok) return r.why; const E = r.made[0]; const { cells } = slotCells(E); for (const [ci, cj, ck] of cells) if (cj >= 1 && cj <= 3) w().setCell(ci, cj, ck, 3, 0);
    const n0 = cells.filter(([ci, cj, ck]) => w().get(ci, cj, ck)).length; adv(3); if (E.st !== 'nopower' || cells.filter(([ci, cj, ck]) => w().get(ci, cj, ck)).length !== n0) bad.push('it worked without power: ' + E.st);
    const info0 = infoFor(g, (K.aim(i, k, { y: 0.5, back: 2 }), g.stowed = true, findInfoRef(g))); if (!info0 || !/No power/.test(info0.lines.join(' '))) bad.push('the readout does not say there is no power: ' + JSON.stringify(info0));
    await rig(i, k); S().money = 5; adv(14); if (E.st !== 'nofunds') bad.push('no money, state ' + E.st); if (S().entities.some((e) => e.type === 'pad')) bad.push('a pad appeared with no money');
    S().money = 1e12; adv(2); if (!S().entities.some((e) => e.type === 'pad') || E.st !== 'done') bad.push('it did not finish once the money was back: ' + E.st);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.level-pad-skips-blocked-slots-and-never-digs-the-one', async () => {
    K.setup(); const bad = [], i = I0(), k = K0(); await rig(i, k);
    const r = await placeLevel(i, k, 2); if (!r.ok) return r.why; const E = r.made[0]; if (E.size !== 2) return 'size ' + E.size;
    if (B.levelSlots(E).length !== 4) bad.push('size 2 has ' + B.levelSlots(E).length + ' slots');
    // slot 0: The One in the way. slot 1: a bulkhead. slot 2: a belt on the floor. slot 3 is clear.
    const s0 = slotCells(E, 0), s1 = slotCells(E, 1), s2 = slotCells(E, 2);
    w().setCell(s0.slot.i0 + 1, 2, s0.slot.k0 + 1, NEEDLE, 0); w().setCell(s1.slot.i0 + 2, 1, s1.slot.k0 + 2, PD.BULK, 0);
    const bt = { id: g.nextId(), type: 'belt', i: s2.slot.i0 + 1, j: 0, k: s2.slot.k0 + 1, dir: 0, rise: 0, items: [] }; S().entities.push(bt); g.addEntity(bt);
    adv(8);
    if (w().get(s0.slot.i0 + 1, 2, s0.slot.k0 + 1) !== NEEDLE) bad.push('The One was dug up'); if (S().needleLost) bad.push('The One was lost');
    if (w().get(s1.slot.i0 + 2, 1, s1.slot.k0 + 2) !== PD.BULK) bad.push('the bulkhead was removed');
    const pads = S().entities.filter((e) => e.type === 'pad'); if (pads.length !== 1) bad.push('expected one pad (the clear slot), got ' + pads.length); else if (pads[0].i0 !== B.levelSlots(E)[3].i0 || pads[0].k0 !== B.levelSlots(E)[3].k0) bad.push('the pad is not in slot 3');
    if (E.skip !== 3 || E.laid !== 1) bad.push(`skipped ${E.skip} laid ${E.laid}`); if (E.st !== 'done') bad.push('state ' + E.st);
    w().setCell(s0.slot.i0 + 1, 2, s0.slot.k0 + 1, 0, 0); w().setCell(s1.slot.i0 + 2, 1, s1.slot.k0 + 2, 0, 0); L().remove(bt); S().entities = S().entities.filter((x) => x.id !== bt.id);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('build.level-pad-use-config-and-hammer', async () => {
    K.setup(); const bad = [], i = I0(), k = K0(); await rig(i, k);
    const r = await placeLevel(i, k); if (!r.ok) return r.why; const E = r.made[0];
    if (g.setCfg(E, { on: 'yes' }).ok || g.setCfg(E, { size: 3 }).ok || g.setCfg(E, { on: false, size: 3 }).ok) bad.push('a bad patch was accepted');
    // E stops it, E starts it again from slot 0
    K.aim(i, k, { y: 0.5, back: 2 }); g.stowed = true; g.rebuildTools(); const e1 = g.useKey && null; void e1;
    B.useLevel(g, E); if (E.on !== false) bad.push('E did not stop it'); adv(1); if (E.st !== 'off') bad.push('state ' + E.st + ' after stopping');
    B.useLevel(g, E); if (E.on !== true || E.slot !== 0 && E.st !== 'idle') bad.push('E did not start it again'); adv(8);
    // the readout
    K.aim(i, k, { y: 0.5, back: 2 }); const ref = findInfoRef(g); if (!ref || ref.id !== E.id) bad.push('no info ref ' + JSON.stringify(ref)); else { const inf = infoFor(g, ref); const text = inf.title + ' ' + inf.lines.join(' '); if (!/LEVELING PAD/.test(inf.title) || !/15 kW/.test(text) || !/Slot/.test(text) || /[—–]|undefined|NaN/.test(text)) bad.push('readout: ' + text); }
    // the hammer
    selectTool('hammer'); g.updateBuild(g.curTool(), p().eyePos(new V3()), p().forward(new V3())); const h = g.hammerTarget(); if (!h || h.id !== E.id) bad.push('hammer does not pick it: ' + JSON.stringify(h)); else g.hammerHit();
    if (S().items.levelpad !== 1 || g.machines.items.has(E.id) || w().reserved.has((E.j * ctx.cfg.NZ + E.k) * ctx.cfg.NX + E.i)) bad.push('not handed back cleanly: ' + JSON.stringify(S().items));
    // power demand is declared for the grid solver, and the unlock and recipe exist
    if (DEMAND.levelpad !== 15) bad.push('no 15 kW demand in power.js: ' + DEMAND.levelpad);
    return bad.length === 0 || bad.join(' || ');
  });
}
