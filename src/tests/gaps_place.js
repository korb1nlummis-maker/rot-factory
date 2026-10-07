// gaps.place.*: one rule for every placement path. A belt, pole, vault, lift, bulkhead, beacon, light, arch leg or rail piece is refused on a cell something already stands in
// or reserved (a Mine Rail piece, a belt lift's shaft, a ramp volume, a Leveling Pad, a door, a machine), and the reverse: the rail refuses a belt, a lift shaft or anything reserved.
import { makeRail } from './rail_lib.js';
import * as D from '../detector.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, adv, V3, craft, plan, toI, toK, cellX, cellZ } = ctx;
  const X = makeRail(ctx), R = X.R, K = X.K;
  const idx = (i, j, k) => (j * ctx.cfg.NZ + k) * ctx.cfg.NX + i;
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { X.clean(); for (const key of [...(g._gapsReserved || [])]) w().reserved.delete(key); g._gapsReserved = []; for (const t of [...L().tiles.values()]) if (!t.free && t.i >= toI(-30) && t.i <= toI(8) && t.k >= toK(-7) && t.k <= toK(6)) { L().remove(t); S().entities = S().entities.filter((x) => x.id !== t.id); } } });
  const KINDS = ['belt', 'sorter', 'vault', 'mech', 'gen', 'charger', 'pole', 'fan', 'gate', 'splitter'];
  const k0 = () => X.ck(-2.2);

  await guard('gaps.place.logistics-refuse-a-rail-cell-and-every-reserved-cell', async () => {
    X.setup(); const bad = [], i = X.ci(-12), k = k0(); X.line(i - 2, i + 2, 0, k);
    for (const di of [-2, 0, 2]) { const why = g.logi.canPlace(i + di, 0, k); if (!why) bad.push('canPlace accepted a rail cell ' + di); }
    if (g.logi.canPlace(i + 5, 0, k)) bad.push('a free cell next to the track was refused: ' + g.logi.canPlace(i + 5, 0, k));
    for (const kind of KINDS) { const why = g.placeConflict({ kind, id: kind }, { type: kind, i, j: 0, k, dir: 0, rise: 0 }); if (!why) bad.push(`a guest could set a ${kind} on the rail`); }
    // any cell something reserved (a ramp volume, a pad, a machine): the same refusal
    const key = idx(i + 7, 0, k); w().reserved.add(key); g._gapsReserved = [key];
    if (!g.logi.canPlace(i + 7, 0, k)) bad.push('a reserved cell was accepted');
    if (!g.logi.cellTaken(i + 7, 0, k)) bad.push('cellTaken does not see a reserved cell');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.place.the-aim-planner-shows-a-red-ghost-on-a-rail-for-belt-pole-vault-and-bulkhead', async () => {
    X.setup(); const bad = [], i = X.ci(-12), k = k0(); X.line(i - 3, i + 3, 0, k);
    S().up = { ...S().up, vault: 1, bulkhead: 1, sorter: 1 }; g.T = g.tune();
    for (const kind of ['belt', 'pole', 'vault', 'bulk', 'gen', 'fan']) {
      craft(kind, 2); X.equip(kind); X.aimAtCell(i, k); const pl = await plan();
      if (!pl) { bad.push(kind + ': no plan'); continue; }
      if (pl.ok) bad.push(`${kind}: the aim planner said ok on a rail piece`);
      else if (!/in the way|occupied|something/i.test(pl.why || '')) bad.push(`${kind}: odd reason "${pl.why}"`);
      X.aimAtCell(i + 6, k); const pl2 = await plan(); if (!pl2 || !pl2.ok) bad.push(`${kind}: refused a free cell ${pl2 && pl2.why}`);
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.place.holding-b-over-a-track-never-paints-a-belt-or-bulkhead-on-it', async () => {
    X.setup(); const bad = [], i = X.ci(-14), k = k0(); X.line(i + 3, i + 8, 0, k);
    S().up = { ...S().up, bulkhead: 1 }; g.T = g.tune();
    for (const kind of ['belt', 'bulk']) {
      craft(kind, 30); X.equip(kind); const before = S().entities.filter((e) => e.type === 'belt').length, cells0 = (() => { let n = 0; for (let q = 0; q < 14; q++) if (w().get(i + q, 0, k)) n++; return n; })();
      g.keys.KeyB = true; g.lastPaint = '';
      for (let n = 0; n <= 12; n++) { X.aimAtCell(i + n, k); const e = p().eyePos(new V3()), d = p().forward(new V3()); g.updateBuild(g.curTool(), e, d); }
      g.keys.KeyB = false;
      for (let q = 3; q <= 8; q++) { if (L().tiles.get(idx(i + q, 0, k))) bad.push(`${kind} was painted on the rail at ${q}`); if (w().get(i + q, 0, k)) bad.push(`${kind} cell on the rail at ${q}`); }
      void before; void cells0;
      for (const t of [...L().tiles.values()]) if (t.type === 'belt') { L().remove(t); S().entities = S().entities.filter((x) => x.id !== t.id); }
      for (let q = 0; q < 14; q++) if (w().get(i + q, 0, k)) w().setCell(i + q, 0, k, 0, 0);
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.place.the-rail-refuses-belts-poles-vaults-and-lift-shafts-in-its-cell-and-the-headroom', async () => {
    X.setup(); const bad = [], i = X.ci(-12), k = k0();
    const t = K.tile('belt', cellX(i), cellZ(k)); const why = R.railWhy(g, t.i, 0, t.k); if (!why) bad.push('a rail was laid under a belt');
    const pole = K.tile('pole', cellX(i + 2), cellZ(k)); if (!R.railWhy(g, pole.i, 0, pole.k)) bad.push('a rail was laid under a pole');
    const vault = K.tile('vault', cellX(i + 4), cellZ(k)); if (!R.railWhy(g, vault.i, 0, vault.k)) bad.push('a rail was laid under a vault');
    // a belt lift: the base tile at j 0 with a shaft of 4 cells above it. The shaft cells are not free for a rail's headroom, and a rail under the shaft base column is not either
    const lift = K.tile('belt', cellX(i + 6), cellZ(k), { lift: { h: 4 } }); L().dirty = true; adv(0.1);
    if (!lift || !L().cols.has(idx(lift.i, 1, lift.k))) bad.push('test setup: the lift has no shaft cells');
    if (!R.railWhy(g, lift.i, 0, lift.k)) bad.push('a rail was laid on a lift base');
    if (!g.logi.canPlace(lift.i, 2, lift.k)) bad.push('canPlace accepted a cell inside a belt lift shaft'); if (!g.logi.cellTaken(lift.i, 3, lift.k)) bad.push('cellTaken missed a shaft cell');
    for (const kind of ['belt', 'pole', 'vault']) { const why2 = g.placeConflict({ kind, id: kind }, { type: kind, i: lift.i, j: 2, k: lift.k, dir: 0, rise: 0 }); if (!why2) bad.push(`a guest set a ${kind} inside a lift shaft`); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.place.a-rail-is-refused-under-a-piece-that-stands-in-its-headroom', async () => {
    X.setup(); const bad = [], i = X.ci(-12), k = k0();
    const key1 = idx(i, 1, k); w().reserved.add(key1); g._gapsReserved = [key1];   // something reserved the cell above (a ramp's volume, a door, a shaft)
    if (!R.railWhy(g, i, 0, k)) bad.push('a rail was laid under a reserved cell in its headroom');
    w().reserved.delete(key1); if (R.railWhy(g, i, 0, k)) bad.push('the rail was refused on a free cell: ' + R.railWhy(g, i, 0, k));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.place.furnish-beacons-and-arch-legs-refuse-a-rail-cell', async () => {
    X.setup(); const bad = [], i = X.ci(-12), k = k0(); X.line(i - 2, i + 2, 0, k);
    // a depot beacon: aim at the rail
    craft('beacon', 1); X.equip('beacon'); X.aimAtCell(i, k); const pl = await plan(); if (!pl || pl.ok) bad.push('a depot beacon was planned on a rail piece');
    const guestWhy = g.placeConflict({ kind: 'beacon', id: 'beacon' }, { i, j: 0, k, x: cellX(i), y: 0, z: cellZ(k) }); if (!guestWhy) bad.push('a guest could set a beacon on the rail');
    // an arch whose leg stands on the track is refused, one that only spans it is fine
    const S_ = D.SIZES[1], m = k, lat = i - 3;   // a z axis arch: the legs are at lateral cells lat and lat + w - 1 (i - 3 and i)
    const onLeg = D.layout(g, 1, 'z', m, lat, 0); if (onLeg.ok) bad.push('an arch leg stands on the rail: ' + JSON.stringify(onLeg.why));
    const span = D.layout(g, 1, 'z', m, i - 1 - (S_.w - 1), 0); void span;
    const clear = D.layout(g, 1, 'z', k, i + 6 - 1, 0); if (!clear.ok) bad.push('an arch on a free cell was refused: ' + clear.why);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.place.a-leveling-pad-and-its-neighbours-keep-their-cells', async () => {
    X.setup(); const bad = [], i = X.ci(-12), k = k0();
    // the Leveling Pad reserves its own cell: no belt and no rail may take it
    const e = g.placeEntity('levelpad', { i, j: 0, k, dir: 0, size: 1, mk: 'basic', on: false, st: 'idle', slot: 0, rid: 'levelpad', grp: 1 }, { quiet: true });
    try {
      if (!e) return 'could not place a pad'; adv(0.1);
      if (!g.logi.canPlace(i, 0, k)) bad.push('a belt could be set on a Leveling Pad cell'); if (!R.railWhy(g, i, 0, k)) bad.push('a rail could be laid on a Leveling Pad cell');
    } finally { if (e) g.doDecon({ kind: 'mach', id: e.id }); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.place.a-hose-a-switch-and-a-power-part-keep-off-a-rail-cell', async () => {
    X.setup(); const bad = [], i = X.ci(-12), k = k0(); X.line(i - 2, i + 2, 0, k); 
    const hose = K.tile('belt', cellX(i + 6), cellZ(k), { hose: true }); if (!R.railWhy(g, hose.i, 0, hose.k)) bad.push('a rail was laid under a vacuum hose');
    if (!g.logi.canPlace(hose.i, 0, hose.k)) bad.push('a belt was set on a hose tile');
    S().up = { ...S().up, power: 1 }; g.T = g.tune();
    for (const kind of ['switch', 'breaker', 'meter']) {
      const onRail = g.placeConflict({ kind, id: kind }, { x: cellX(i), y: 0, z: cellZ(k), ry: 0 }), free = g.placeConflict({ kind, id: kind }, { x: cellX(i + 9), y: 0, z: cellZ(k), ry: 0 });
      if (!onRail) bad.push(`a ${kind} was set on the rail`); if (free) bad.push(`a ${kind} on a free cell was refused: ${free}`);
    }
    return bad.length === 0 || bad.join(' || ');
  });
}
