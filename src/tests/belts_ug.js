// belts.* (wave 1A): underground pairs. An entry and an exit in line, up to 4 cells apart at Mk1 (6, 8, 10, 12, 14 for the higher marks), carrying plush under belts,
// frames and plush pile without carving anything.
import { makeBeltKit, UP_ALL, UP_BASE } from './belts_lib.js';
import { UG_SPAN, TIER_NAMES } from '../beltdata.js';
import { BULK } from '../plushdata.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T: T0, g, S, w, p, L, tiles, toI, toK, cellX, cellZ } = ctx;
  const B = makeBeltKit(ctx), K = B.K;
  const T = B.T; void T0;
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const row = () => toK(0.3);

  await T('belts.ug-pair-crosses-belt-and-frame', async () => {
    B.setup(UP_BASE); const bad = [], k = row();
    S().up.beltUg = 1; g.T = g.tune();
    // a timber frame in the way (a 2.4 m cube: the line runs through its three inner cells), then the entry and the exit two cells either side of it
    const fr = await K.put('frame:timber', { x: cellX(toI(-6)), z: cellZ(k), dir: 0 }); if (!fr.ok) return 'could not set a frame: ' + fr.why;
    const ci = toI(fr.ent.cx), kk = toK(fr.ent.cz);
    const a = await K.put('ug', { x: cellX(ci - 2), z: cellZ(kk), dir: 0 }); if (!a.ok) return 'entry refused: ' + a.why;
    const b = await K.put('ug', { x: cellX(ci + 2), z: cellZ(kk), dir: 0 }); if (!b.ok) return 'exit refused: ' + b.why;
    const entry = L().byId.get(a.ent.id), exit = L().byId.get(b.ent.id);
    if (entry.ug.role !== 'in' || exit.ug.role !== 'out' || entry.ug.pair !== exit.id || exit.ug.pair !== entry.id || entry.ug.span !== 4) return `pairing: ${JSON.stringify([entry.ug, exit.ug])}`;
    // under them: a crossing belt line (one cell before the frame), the frame itself, and a plush cell
    const cross = B.lay(0, 3, ci - 1, kk - 1, 1); B.vaultAt(ci - 1, kk + 2); const crossVault = [...L().tiles.values()].find((t) => t.type === 'vault' && t.i === ci - 1 && t.k === kk + 2);
    w().setCell(ci + 1, 0, kk, BULK, 0);
    const feeder = B.lay(0, 2, ci - 4, kk, 0), v = B.vaultAt(ci + 3, kk);
    feeder[0].items = [{ sp: B.sp, vr: 0, t: 0 }]; cross[0].items = [{ sp: B.sp + 1, vr: 0, t: 0 }];
    let s = 0; while (s < 12 && (v.stored.length < 1 || crossVault.stored.length < 1)) { B.step(0.02); s += 0.02; }
    if (v.stored.length !== 1 || v.stored[0].sp !== B.sp) bad.push('the plush did not come out of the exit: ' + v.stored.length);
    if (crossVault.stored.length !== 1 || crossVault.stored[0].sp !== B.sp + 1) bad.push('the crossing belt was disturbed: ' + crossVault.stored.length);
    if (w().get(ci + 1, 0, kk) !== BULK) bad.push('the cell it passes under was carved');
    // transit: two feeder tiles, the whole run (4 cells) on the entry, the exit tile, all at 1.6 tiles per second (the vault is the next hop)
    const want = (2 + 4 + 1) / 1.6; if (!near(s, want, want * 0.07)) bad.push(`transit took ${s.toFixed(2)} s, wanted ${want.toFixed(2)}`);
    const info = infoFor(g, { kind: 'tile', id: entry.id }), txt = info ? info.lines.join(' | ') : '';
    if (!/UNDERGROUND ENTRY MK1/.test(info.title) || !/Span 4 cells \(2\.4 m\): passes under 1 belt, 3 frame cells, 1 plush cell/.test(txt)) bad.push('entry readout: ' + info.title + ' ' + txt);
    const info2 = infoFor(g, { kind: 'tile', id: exit.id }); if (!/passes under 1 belt, 3 frame cells, 1 plush cell/.test(info2.lines.join(' '))) bad.push('exit readout: ' + info2.lines.join(' | '));
    w().setCell(ci + 1, 0, kk, 0, 0);
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.ug-span-follows-the-mark', async () => {
    const bad = [], k = row();
    for (const tier of [0, 2]) {
      const id = tier ? 'ug:' + tier : 'ug', span = UG_SPAN[tier], i0 = toI(-12);
      B.setup(UP_ALL);
      const a = await K.put(id, { x: cellX(i0), z: cellZ(k), dir: 0 }); if (!a.ok) { bad.push(`${TIER_NAMES[tier]} entry: ${a.why}`); continue; }
      // one cell too far: it is not the exit, it becomes a second entry
      const far = await K.put(id, { x: cellX(i0 + span + 1), z: cellZ(k), dir: 0 });
      if (!far.ok || L().byId.get(far.ent.id).ug.role !== 'in' || L().byId.get(a.ent.id).ug.pair != null) bad.push(`${TIER_NAMES[tier]} ${span + 1} cells away: ${far.ok ? JSON.stringify(L().byId.get(far.ent.id).ug) : far.why}`);
      const ok = await K.put(id, { x: cellX(i0 + span), z: cellZ(k), dir: 0 });
      if (!ok.ok || L().byId.get(ok.ent.id).ug.role !== 'out' || L().byId.get(ok.ent.id).ug.span !== span || L().byId.get(a.ent.id).ug.pair !== ok.ent.id) bad.push(`${TIER_NAMES[tier]} ${span} cells away did not pair: ${ok.ok ? JSON.stringify(L().byId.get(ok.ent.id).ug) : ok.why}`);
      if (L().byId.get(a.ent.id).tier !== (tier || undefined)) bad.push('the entry has the wrong mark ' + L().byId.get(a.ent.id).tier);
    }
    // next door is not an exit either: it becomes its own entry
    B.setup(UP_ALL); { const i1 = toI(-12); const a1 = await K.put('ug', { x: cellX(i1), z: cellZ(k), dir: 0 }), adj = await K.put('ug', { x: cellX(i1 + 1), z: cellZ(k), dir: 0 }); if (!a1.ok || !adj.ok || L().byId.get(adj.ent.id).ug.role !== 'in' || L().byId.get(a1.ent.id).ug.pair != null) bad.push('an adjacent end paired'); }
    // the mark's own item: a Mk1 end does not pair with a Mk3 end
    B.setup(UP_ALL); const i0 = toI(-12);
    const m1 = await K.put('ug', { x: cellX(i0), z: cellZ(k), dir: 0 }), m3 = await K.put('ug:2', { x: cellX(i0 + 3), z: cellZ(k), dir: 0 });
    if (m1.ok && m3.ok && L().byId.get(m3.ent.id).ug.role !== 'in') bad.push('a Mk3 end paired with a Mk1 entry');
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.ug-hammering-one-end-unpairs-the-other-and-a-new-exit-pairs-again', async () => {
    B.setup(UP_ALL); const bad = [], k = row(), i0 = toI(-12);
    const a = await K.put('ug', { x: cellX(i0), z: cellZ(k), dir: 0 }), b = await K.put('ug', { x: cellX(i0 + 3), z: cellZ(k), dir: 0 }); if (!a.ok || !b.ok) return 'placing: ' + a.why + ' ' + b.why;
    const entry = L().byId.get(a.ent.id), exit = L().byId.get(b.ent.id); entry.items = [{ sp: B.sp, vr: 0, t: 0.5 }];
    g.doDecon({ kind: 'tile', id: exit.id });
    if (entry.ug.pair != null) bad.push('the entry still points at the removed exit');
    if (S().items.ug !== 1) bad.push('the hammer gave back ' + JSON.stringify(S().items));
    if (entry.items.length !== 1) bad.push('the plush on the entry were lost');
    const info = infoFor(g, { kind: 'tile', id: entry.id }); if (!/Not paired yet/.test(info.lines.join(' '))) bad.push('unpaired readout: ' + info.lines.join(' | '));
    // an unpaired entry holds its plush: nothing leaves it
    B.step(0.02, 150); if (entry.items.length !== 1) bad.push('an unpaired entry let a plush go');
    const again = await K.put('ug', { x: cellX(i0 + 3), z: cellZ(k), dir: 0 }); if (!again.ok || entry.ug.pair !== again.ent.id) bad.push('a new exit did not pair');
    g.doDecon({ kind: 'tile', id: entry.id }); const ex2 = L().byId.get(again.ent.id); if (ex2.ug.pair != null) bad.push('the exit still points at the removed entry'); const lone = infoFor(g, { kind: 'tile', id: ex2.id }); if (!/Its entry is gone/.test(lone.lines.join(' '))) bad.push('exit readout: ' + lone.lines.join(' | '));
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.ug-ends-take-plush-only-from-the-right-places', async () => {
    B.setup(UP_BASE); const bad = [], k = row(), i0 = toI(-12);
    const a = await K.put('ug', { x: cellX(i0), z: cellZ(k), dir: 0 }), b = await K.put('ug', { x: cellX(i0 + 3), z: cellZ(k), dir: 0 }); if (!a.ok || !b.ok) return 'placing';
    const entry = L().byId.get(a.ent.id), exit = L().byId.get(b.ent.id);
    // nothing but its own entry pushes into an exit: not from behind, not from the side
    const behind = B.lay(0, 1, i0 + 2, k, 0)[0], side = B.lay(0, 1, i0 + 3, k - 1, 1)[0];
    behind.items = [{ sp: B.sp, vr: 0, t: 1 }]; side.items = [{ sp: B.sp, vr: 0, t: 1 }];
    B.step(0.02, 60); if (exit.items.length) bad.push('the exit took plush from a belt');
    // the entry takes them from behind and from the side, but not head on
    const feeder = B.lay(0, 1, i0 - 1, k, 0)[0], sider = B.lay(0, 1, i0, k + 1, 3)[0], head = B.lay(0, 1, i0 + 1, k, 2)[0]; void head;
    feeder.items = [{ sp: B.sp, vr: 0, t: 1 }]; sider.items = [{ sp: B.sp, vr: 0, t: 1 }];
    B.step(0.02, 25); if (entry.items.length < 2) bad.push(`the entry took ${entry.items.length} of 2 (behind and side)`);
    if (L().accept(entry, { sp: B.sp, vr: 0 }, 2)) bad.push('the entry took plush head on');
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.ug-runs-at-its-marks-speed-and-its-rate', async () => {
    const bad = [], k = row();
    B.setup(UP_BASE); S().up.beltUg = 1; S().up.beltMk4 = 1; g.T = g.tune(); const i0 = toI(-12);
    const f = B.lay(3, 2, i0, k, 0);
    const en = g.placeEntity('belt', { i: i0 + 2, j: 0, k, dir: 0, rise: 0, tier: 3, items: [], ug: { role: 'in', pair: null, span: 0 } }, { quiet: true, rebuild: false });
    const ex = g.placeEntity('belt', { i: i0 + 8, j: 0, k, dir: 0, rise: 0, tier: 3, items: [], ug: { role: 'out', pair: en.id, span: 6 } }, { quiet: true, rebuild: false });
    if (en.ug.pair !== ex.id || en.ug.span !== 6) return 'adding an exit did not pair it: ' + JSON.stringify(en.ug);
    const v = B.vaultAt(i0 + 9, k); L().dirty = true;
    const m = B.measure([...f, en, ex], v), want = 1.6 * 3.4 / 0.34 * 60;
    if (m.count < m.total) bad.push(`dense stream: ${m.count} of ${m.total}`); else if (Math.abs(m.tailRate(15) - want) / want > 0.08) bad.push(`stream rate ${m.tailRate(15).toFixed(0)}, a Mk4 belt is ${want.toFixed(0)}`);
    return bad.length === 0 || bad.join('; ');
  });
}
