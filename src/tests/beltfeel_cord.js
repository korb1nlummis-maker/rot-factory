// beltfeel.cord-* : laying a belt or a hose like a cord. Hold B and sweep the aim, or hold the mouse button and drag (press where the line starts, aim along the way it should go,
// let go): the route follows the aim with its bends already in, and it is as long as the pieces you hold (a cord has the length you carry), never longer. Let go, press again at
// its open end and the next stretch turns the other way: an L, an S and a U are one, two and two draws. Every piece goes down through the real aim, the real B key and the
// real mouse events. What stands afterwards is compared with a path worked out from the corner points alone (each piece faces the next, a bend is where the facing changes).
import { makeHoseKit, UP_HOSE } from './hose_lib.js';

export default async function (ctx) {
  const { g, S, L, adv, tiles, toI, toK, cellX, cellZ } = ctx;
  const H = makeHoseKit(ctx), T = H.B.T, K = H.B.K, io = H.io, o = H.o;
  const bad = (a) => a.length === 0 || a.join('; ');
  const UPX = { ...UP_HOSE, depots: 1 };
  const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
  const dirOf = (di, dk) => (di > 0 ? 0 : di < 0 ? 2 : dk > 0 ? 1 : 3);
  const setup = (kind, n) => { H.setup(0, UPX); for (const t of [...tiles()]) if (t.type === 'belt') L().remove(t);   // (a new game has a starter belt in the bay)
    delete S().items[kind]; if (n) ctx.craft(kind, n); K.equip(kind); g.beltRot = null; g._lastLaid = null; g.bplan = null; };
  const line = (kind) => tiles().filter((t) => t.type === 'belt' && !!t.hose === (kind === 'hose'));
  // the unit steps along a polyline of corner cells (relative to the origin)
  const walk = (pts) => { const out = [[...pts[0]]]; let [i, k] = pts[0]; for (let n = 1; n < pts.length; n++) { const [ti, tk] = pts[n]; while (i !== ti || k !== tk) { if (i !== ti) i += Math.sign(ti - i); else k += Math.sign(tk - k); out.push([i, k]); } } return out; };
  // what each piece of such a path must be: facing the next piece (the last keeps the way it was going), a bend where the facing changes (cd = the way it was fed)
  const expectOf = (cells) => cells.map((c, n) => { const nx = cells[n + 1], pv = cells[n - 1], din = pv ? dirOf(c[0] - pv[0], c[1] - pv[1]) : null, dir = nx ? dirOf(nx[0] - c[0], nx[1] - c[1]) : din; return { i: c[0], k: c[1], dir, cd: pv && din !== dir ? din : null }; });
  const compare = (kind, cells, name) => {
    const b = [], want = expectOf(cells), have = line(kind); L().rebuildBelts();
    if (have.length !== want.length) b.push(`${name}: ${have.length} pieces, expected ${want.length}`);
    for (const w of want) {
      const t = L().tileAt(o.i + w.i, 0, o.k + w.k); if (!t) { b.push(`${name}: no piece at ${w.i},${w.k}`); continue; }
      if (t.dir !== w.dir) b.push(`${name}: piece ${w.i},${w.k} faces ${t.dir}, expected ${w.dir}`);
      if ((t.cd ?? null) !== w.cd) b.push(`${name}: piece ${w.i},${w.k} ${t.cd == null ? 'is straight' : 'bends from ' + t.cd}, expected ${w.cd == null ? 'straight' : 'a bend from ' + w.cd}`);
    }
    const first = L().tileAt(o.i + cells[0][0], 0, o.k + cells[0][1]); let n = 0, t = first; const seen = new Set(); while (t && t.type === 'belt' && !seen.has(t.id)) { seen.add(t.id); n++; t = L().nextOf(t); }
    if (n !== want.length) b.push(`${name}: not one line (${n} of ${want.length} connected)`);
    if (kind === 'hose' && H.mouths().length !== 1) b.push(`${name}: ${H.mouths().length} mouths`);
    return b;
  };
  // hold B and sweep along the path, facing the way each stretch goes (the way a player looks while drawing it)
  const sweep = async (pts) => { const cells = walk(pts); await H.hold(cells.map((c, n) => { const nx = cells[n + 1], pv = cells[n - 1]; return [c[0], c[1], nx ? dirOf(nx[0] - c[0], nx[1] - c[1]) : dirOf(c[0] - pv[0], c[1] - pv[1])]; }), dirOf(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])); return cells; };
  // press the mouse button on the cell, aim along the stops, let go on the last one
  const drag = async (from, stops, d = 0) => {
    await H.aim(from[0], from[1], d); io.mouseDown(0); await ctx.plan();
    let pl = null; for (const s of stops) pl = await H.aim(s[0], s[1], s[2] ?? d);
    let amber = 0; if (g.machines.ghost) g.machines.ghost.traverse((m) => { if (m.isMesh && m.material && m.material.color && m.material.color.getHex() === 0xff9a2a) amber++; });
    const during = { plan: pl, hint: io.hint(), on: !!(g.bplan && g.bplan.on), amber, key: g.machines.ghostKey || '' };
    io.mouseUp(0); await ctx.plan(); adv(0.05); return during;
  };
  const shapes = {
    L: { legs: [{ from: [0, 0], to: [5, -4] }], path: [[0, 0], [5, 0], [5, -4]] },
    S: { legs: [{ from: [0, 0], to: [4, -3] }, { from: [4, -4], to: [8, -4] }], path: [[0, 0], [4, 0], [4, -4], [8, -4]] },
    U: { legs: [{ from: [0, 0], to: [5, -2] }, { from: [5, -3], to: [0, -3] }], path: [[0, 0], [5, 0], [5, -3], [0, -3]] },
  };

  for (const kind of ['belt', 'hose']) {
    await T(`beltfeel.cord-holding-B-and-sweeping-lays-an-L-an-S-and-a-U-with-the-bends-in-(${kind})`, async () => {
      const b = [];
      for (const [name, sh] of Object.entries(shapes)) {
        setup(kind, 60); const n0 = S().items[kind]; const cells = await sweep(sh.path);
        b.push(...compare(kind, cells, `${kind} ${name} by B`));
        if (n0 - (S().items[kind] || 0) !== cells.length) b.push(`${kind} ${name}: ${n0 - (S().items[kind] || 0)} pieces used for ${cells.length}`);
      }
      return bad(b);
    });

    await T(`beltfeel.cord-holding-the-mouse-and-dragging-lays-an-L-an-S-and-a-U-with-the-bends-in-(${kind})`, async () => {
      const b = [];
      for (const [name, sh] of Object.entries(shapes)) {
        setup(kind, 60);
        if (!(S().items[kind] > 0)) return 'nothing to lay';
        let first = true;
        for (const leg of sh.legs) {
          const d = await drag(leg.from, [leg.to], first ? 0 : dirOf(leg.to[0] - leg.from[0], leg.to[1] - leg.from[1]) || 0);
          if (!d.plan || !d.plan.route) { b.push(`${kind} ${name}: the aim showed no route during the drag`); break; }
          first = false;
        }
        b.push(...compare(kind, walk(sh.path), `${kind} ${name} by mouse`));
      }
      return bad(b);
    });

    await T(`beltfeel.cord-the-drag-is-as-long-as-the-pieces-you-hold-and-never-buys-more-(${kind})`, async () => {
      const b = [], held = 6;
      setup(kind, held); const money = S().money;
      const d = await drag([0, 0], [[14, 0]]);
      if (!d.plan || !d.plan.route || d.plan.route.tiles.length !== held) b.push(`the preview showed ${d.plan && d.plan.route ? d.plan.route.tiles.length : 'no'} pieces for ${held} held`);
      if (!/hold 6|6 piece|6 held/i.test(d.hint)) b.push('the hint does not say the cord is cut by what you hold: ' + d.hint);
      if (d.amber !== 1) b.push(`the hologram shows ${d.amber} markers where the cord stops short (one wanted)`);
      const laid = line(kind); if (laid.length !== held) b.push(`${laid.length} pieces laid for ${held} held`);
      if ((S().items[kind] || 0) !== 0) b.push(`${S().items[kind]} left in the pack`);
      if (S().money !== money) b.push(`money changed by ${S().money - money}: the cord bought pieces`);
      const last = L().tileAt(o.i + held - 1, 0, o.k); if (!last || L().nextOf(last)) b.push('the end of the cord is not an open end'); else if (last.dir !== 0) b.push('the end faces ' + last.dir);
      // a bend inside the held length is laid with it: an L of 11 cells cut at 8 = six east, then two north
      setup(kind, 8); await drag([0, 0], [[5, -5]]); const c8 = compare(kind, walk([[0, 0], [5, 0], [5, -2]]), `${kind} cut L`); b.push(...c8);
      // holding B and sweeping far past the pieces you carry places exactly what you carry
      setup(kind, held); await sweep([[0, 0], [14, 0]]); if (line(kind).length !== held) b.push(`B sweep: ${line(kind).length} pieces for ${held} held`);
      // carry on from the open end: the next draw starts there and turns (the bend is the first piece of the new stretch)
      setup(kind, held); await drag([0, 0], [[14, 0]]); ctx.craft(kind, 4); K.equip(kind);
      await drag([held, 0], [[held, -3]], 3); b.push(...compare(kind, walk([[0, 0], [held, 0], [held, -3]]), `${kind} carried on`));
      return bad(b);
    });

    await T(`beltfeel.cord-a-press-without-a-drag-only-anchors-and-right-click-drops-a-drag-(${kind})`, async () => {
      const b = []; setup(kind, 20);
      await H.aim(0, 0, 0); io.mouseDown(0); await ctx.plan(); io.mouseUp(0); await ctx.plan(); adv(0.05);
      if (line(kind).length) b.push('a plain click laid something'); if (!(g.bplan && g.bplan.on && g.bplan.start)) b.push('the click did not anchor the route');
      await H.aim(4, 0, 0); io.click(0); await ctx.plan(); adv(0.05); if (line(kind).length !== 5) b.push(`click then click laid ${line(kind).length} of 5`);
      setup(kind, 20); await H.aim(0, 0, 0); io.mouseDown(0); await ctx.plan(); await H.aim(5, 0, 0); io.click(2); await ctx.plan(); io.mouseUp(0); await ctx.plan(); adv(0.05);
      if (line(kind).length) b.push('a drag dropped with a right click still laid ' + line(kind).length);
      return bad(b);
    });
  }

  // the gold end: the last piece of a drawn cord within suck range of a bin glows gold, as its preview does while you draw
  const goldAt = async (kind, label, prep) => {
    const b = [], rel = (i, k) => [i - o.i, k - o.k];
    // a cord that stops far from every bin is plain (more than 6 m: the end does not snap to the bin either)
    setup(kind, 40); let target = await prep(); let end = rel(target.i, target.k);
    let d = await drag([end[0] - 12, end[1]], [[end[0] - 8, end[1]]]);
    if (d.plan && d.plan.gold) b.push(`${label}: the preview of a cord far from the bin is gold`);
    L().refreshSinks(5); if (L().sinkSet.size) b.push(`${label}: a plain end is gold`);
    // one that ends in reach of the bin is gold in the preview (the hologram, the hint) and when it is down
    setup(kind, 40); target = await prep(); end = rel(target.i, target.k); const start = [end[0] - 5, end[1]];
    await H.aim(start[0], start[1], 0); io.mouseDown(0); await ctx.plan();
    const pl = await H.aim(end[0], end[1], 0);
    if (!pl || !pl.route) b.push(`${label}: no route to the bin`);
    else {
      if (!pl.gold) b.push(`${label}: the route to the bin is not gold`);
      if (!/feeds the bin/.test(io.hint())) b.push(`${label}: the hint does not say the end feeds the bin: ` + io.hint());
      if (!/^bptrueg/.test(g.machines.ghostKey || '')) b.push(`${label}: the hologram is not gold (key ${g.machines.ghostKey && g.machines.ghostKey.slice(0, 10)})`);
      let golds = 0; if (g.machines.ghost) g.machines.ghost.traverse((m) => { if (m.isMesh && m.material && m.material.color && m.material.color.getHex() === 0xffc928) golds++; }); if (!golds) b.push(`${label}: no gold in the hologram`);
    }
    io.mouseUp(0); await ctx.plan(); adv(0.05); L().refreshSinks(5);
    const ts = line(kind), last = ts.find((t) => !L().nextOf(t));
    if (!last || !L().sinkSet.has(last.id)) b.push(`${label}: the last piece is not gold once laid`); if (ts.some((t) => t !== last && L().sinkSet.has(t.id))) b.push(`${label}: a piece that is not the last is gold`);
    if (kind === 'hose' ? L().goldRing.count !== 1 : L().goldPlate.count !== 1) b.push(`${label}: gold pieces drawn ${kind === 'hose' ? L().goldRing.count : L().goldPlate.count}`);
    return b;
  };
  let nb = 0;   // (a cell a beacon stood in stays reserved after the next fresh game: every beacon of this file gets cells of its own)
  for (const kind of ['belt', 'hose']) {
    await T(`beltfeel.cord-the-end-at-the-SORT-bin-is-gold-in-the-preview-and-when-laid-(${kind})`, async () => {
      const bp = g.hall.binPos; return bad(await goldAt(kind, `${kind} at the SORT bin`, async () => ({ i: toI(bp.x - 1.8), k: toK(bp.z) })));
    });
    await T(`beltfeel.cord-the-end-at-a-Depot-Beacon-is-gold-in-the-preview-and-when-laid-(${kind})`, async () => {
      let why = null;
      const b = await goldAt(kind, `${kind} at a Depot Beacon`, async () => { const r = await K.put('beacon', { x: -6 - 3 * (nb++), z: -3 }); if (!r.ok) why = 'no beacon: ' + r.why; K.equip(kind); const e = r.ent || { x: -6, z: -3 }; return { i: toI(e.x - 1.2), k: toK(e.z) }; });
      return why || bad(b);
    });
  }

  // a machine at the end (a vault) is not a bin: the cord snaps to it and says so, but nothing glows gold there
  for (const kind of ['belt']) {
    await T(`beltfeel.cord-an-end-at-a-machine-feeds-it-without-the-gold-and-an-assigned-bin-end-stays-gold-(${kind})`, async () => {
      const b = []; setup(kind, 40);
      const vi = toI(-6), vk = toK(-6), v = g.placeEntity('vault', { i: vi, j: 0, k: vk, dir: 0 }, { quiet: true, rebuild: false }); void v;
      await H.aim(vi - 6 - o.i, vk - o.k, 0); io.mouseDown(0); await ctx.plan(); const pl = await H.aim(vi - o.i, vk - o.k, 0);
      if (!pl || !pl.route) b.push('no route to the vault'); else { if (pl.gold) b.push('the end at a vault is gold'); if (!/feeds into the vault/.test(io.hint())) b.push('the hint does not say it feeds the vault: ' + io.hint()); }
      io.mouseUp(0); await ctx.plan(); adv(0.05); L().refreshSinks(5); if (L().sinkSet.size) b.push('a belt that ends at a vault is gold');
      // a belt end assigned to a bin (its `dest`) is still the end of a line within suck range of a bin: gold
      setup(kind, 40); const bp = g.hall.binPos, ti = toI(bp.x - 1.8), tk = toK(bp.z);
      await H.aim(ti - 5 - o.i, tk - o.k, 0); io.mouseDown(0); await ctx.plan(); await H.aim(ti - o.i, tk - o.k, 0); io.mouseUp(0); await ctx.plan(); adv(0.05);
      const last = tiles().find((t) => t.type === 'belt' && !L().nextOf(t)); if (!last) return bad(b.concat('no line'));
      last.dest = -1; L().refreshSinks(5); if (!L().sinkSet.has(last.id)) b.push('an end assigned to the SORT bin is not gold');
      return bad(b);
    });
  }
}
