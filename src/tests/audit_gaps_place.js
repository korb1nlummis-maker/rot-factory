// audit_gaps.place.*: the paths that still laid or moved a piece onto a cell something else held (a Mine Rail piece, a door, a shaft), found by the audit of the gap pass:
// a down lift's tile and shaft, a Lift Frame, a Mech Scooper driving on, the belt a digging bot drops behind it, and cells that stay reserved after their piece is taken down.
import { makeRail } from './rail_lib.js';
import * as BP from '../beltparts.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, adv, toI, toK, cellX, cellZ } = ctx;
  const X = makeRail(ctx), R = X.R, K = X.K;
  const idx = (i, j, k) => (j * ctx.cfg.NZ + k) * ctx.cfg.NX + i;
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { X.clean(); for (const key of [...(g._auditReserved || [])]) w().reserved.delete(key); g._auditReserved = []; for (const t of [...L().tiles.values()]) if (!t.free && t.i >= toI(-30) && t.i <= toI(8) && t.k >= toK(-7) && t.k <= toK(6)) { L().remove(t); S().entities = S().entities.filter((x) => x.id !== t.id); } for (const it of [...g.machines.items.values()]) if (it.ent.type === 'liftframe') g.doDecon({ kind: 'mach', id: it.ent.id }); } });
  const k0 = () => X.ck(-2.2);
  const hold = (i, j, k) => { const key = idx(i, j, k); w().reserved.add(key); (g._auditReserved = g._auditReserved || []).push(key); };
  const UPB = { timber: 1, belts: 1, power: 1, beltLift: 1, beltUg: 1, mech: 1, jacks: 1, vault: 1, sorter: 1, depots: 1, fans: 1, claw: 1 };

  await guard('audit_gaps.place.a-down-lift-and-its-shaft-refuse-a-rail-cell', async () => {
    X.setup({ ...UPB, steel: 1, railShuttle: 1 }); const bad = [], i = X.ci(-12), k = k0(); X.line(i - 1, i + 1, 0, k);
    g.T = g.tune();
    // a down lift hangs from a tile at row 3 to the floor: its tile cell and every shaft cell must be free of rail
    const base = BP.liftProblem(g, 0, { i, j: 0, k, dir: 0, h: 3 }, 9); if (!base) bad.push('an up lift base was accepted on the rail');
    for (const j of [1, 2, 3]) { const why = BP.liftProblem(g, 0, { i, j, k, dir: 0, h: -j }, 9); if (!why) bad.push(`a down lift with its shaft through the rail cell (tile at row ${j}) was accepted`); }
    const ok = BP.liftProblem(g, 0, { i: i + 6, j: 3, k, dir: 0, h: -3 }, 9); if (ok && /rail|way|occupied/i.test(ok)) bad.push('a down lift on free cells was refused: ' + ok);
    // the same for a cell some other piece reserved in the shaft
    hold(i + 6, 1, k); const why2 = BP.liftProblem(g, 0, { i: i + 6, j: 3, k, dir: 0, h: -3 }, 9); if (!why2) bad.push('a down lift accepted a reserved cell in its shaft');
    const up = BP.liftProblem(g, 0, { i: i + 9, j: 0, k, dir: 0, h: 4 }, 9); hold(i + 9, 3, k); const up2 = BP.liftProblem(g, 0, { i: i + 9, j: 0, k, dir: 0, h: 4 }, 9);
    if (up) bad.push('test setup: ' + up); if (!up2) bad.push('an up lift accepted a reserved cell in its shaft');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('audit_gaps.place.a-lift-frame-refuses-a-rail-cell-and-the-reverse', async () => {
    X.setup({ ...UPB, steel: 1, railShuttle: 1 }); const bad = [], i = X.ci(-12), k = k0(); X.line(i - 1, i + 1, 0, k);
    S().up = { ...S().up, jacks: 1 }; g.T = g.tune();
    const why = BP.frameProblem(g, { i, j: 0, k }); if (!why) bad.push('a lift frame was set on a rail piece');
    const free = BP.frameProblem(g, { i: i + 6, j: 0, k }); if (free) bad.push('a lift frame on a free cell was refused: ' + free);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('audit_gaps.place.a-mech-scooper-does-not-drive-onto-a-rail-or-lift-the-rails-reservation', async () => {
    X.setup({ ...UPB, steel: 1, railShuttle: 1 }); const bad = [], i = X.ci(-14), k = k0(); X.line(i + 3, i + 5, 0, k);
    const m = K.tile('mech', cellX(i), cellZ(k), { dir: 0, buf: [], timer: 0, adv: 0, state: 'dig', out: 0 }); m.pw = 1; L().dirty = true;
    const key = idx(i + 3, 0, k);
    for (let n = 0; n < 40; n++) { m.pw = 1; m.timer = 0; g.time += 0.1; try { L().updateMech(m, 0.1); } catch (e) { return 'updateMech threw ' + e.message; } }
    if (m.i >= i + 3) bad.push('the mech drove onto the rail cell: now at ' + (m.i - i));
    if (!w().reserved.has(key)) bad.push('the rail cell lost its reservation');
    if (!R.sync(g).nodes.has(key)) bad.push('the rail piece is gone from the graph');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('audit_gaps.place.layBelt-never-lays-a-belt-on-a-held-cell', async () => {
    X.setup({ ...UPB, steel: 1, railShuttle: 1 }); const bad = [], i = X.ci(-12), k = k0(); X.line(i, i + 1, 0, k);
    if (g.layBelt(i, 0, k, 0)) bad.push('layBelt put a belt on a rail piece');
    if (L().tiles.has(idx(i, 0, k))) bad.push('a belt tile stands on the rail');
    hold(i + 5, 0, k); if (g.layBelt(i + 5, 0, k, 0)) bad.push('layBelt put a belt on a reserved cell');
    if (!g.layBelt(i + 8, 0, k, 0)) bad.push('layBelt refused a free cell');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('audit_gaps.place.taking-pieces-down-frees-every-cell-they-held', async () => {
    X.setup({ ...UPB, steel: 1, railShuttle: 1 }); const bad = [], i = X.ci(-12), k = k0();
    const before = w().reserved.size;
    const lift = K.tile('belt', cellX(i), cellZ(k), { lift: { h: 4 } }); L().dirty = true;
    const ug1 = K.tile('belt', cellX(i + 3), cellZ(k), { ug: { role: 'in', pair: null, span: 0 } });
    X.line(i + 6, i + 8, 0, k); const stn = X.station(i + 7, 0, k, 'base'); const car = X.cart(i + 6, 0, k);
    const vault = K.tile('vault', cellX(i + 10), cellZ(k));
    if (w().reserved.size <= before) return 'test setup: nothing reserved';
    for (const e of [lift, ug1, vault]) K.decon(e);
    for (const e of [car, stn, ...X.ents('rail')]) g.doDecon({ kind: 'mach', id: e.id });
    R.invalidate(g); adv(0.2);
    if (w().reserved.size !== before) bad.push(`${w().reserved.size - before} reserved cells were left behind`);
    for (let q = 0; q < 12; q++) for (let j = 0; j <= 4; j++) { const why = L().cellTaken(i + q, j, k); if (why) bad.push(`cell ${q},${j} still reads "${why}"`); }
    return bad.length === 0 || bad.join(' || ');
  });
}
