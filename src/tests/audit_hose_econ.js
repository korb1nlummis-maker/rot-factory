// audit_hose.* : money, the gold end, save and load in the middle of laying, and what the hose costs a frame. Everything goes through the real placement path.
import { makeHoseKit } from './hose_lib.js';
import { pools } from '../plushdata.js';
import { loadSaved } from '../state.js';
import { kit as binsKit } from './bins_lib.js';

export default async function (ctx) {
  const { g, S, L, adv, toI, toK, cellX, cellZ, tiles } = ctx;
  const H = makeHoseKit(ctx), B = H.B, T = B.T, io = H.io;
  const bad = (a) => a.length === 0 || a.join('; ');
  const done = () => { g.bplan = null; g.machines.setGhost(null); g.plan = null; };

  await T('audit_hose.a-bought-route-costs-what-the-bench-charges-for-the-same-pieces', async () => {
    H.setup(0); const b = []; S().money = 1e7; delete S().items.hose;
    const m0 = S().money; ctx.craft('hose', 10); const bench = (m0 - S().money) / 10; if (!(bench > 0)) return 'the bench charged ' + bench;
    S().items.hose = 1; g.rebuildTools(); H.K.equip('hose'); S().money = 1e7;   // (the tool has to be out: with none in the pack the hands are)
    await H.aim(0, 0, 0); io.click(0); const pl = await H.aim(9, 0, 0); if (!pl || !pl.ok) return 'no route: ' + (pl && pl.why);
    const n = pl.route.tiles.length; const m1 = S().money; io.click(0); adv(0.05);
    const paid = (m1 - S().money) / (n - 1); if (H.hoses().length !== n) b.push(`laid ${H.hoses().length} of ${n}`);
    if (Math.abs(paid - bench) > 1e-6) b.push(`a bought piece costs ${paid} on a route, ${bench} at the bench`);
    done(); return bad(b);
  });

  await T('audit_hose.a-route-uses-what-you-hold-first-and-never-goes-below-zero', async () => {
    H.setup(0); const b = []; S().money = 1e7; delete S().items.hose; ctx.craft('hose', 3); H.K.equip('hose');
    await H.aim(0, 0, 0); io.click(0); const pl = await H.aim(7, 0, 0); if (!pl.ok) return pl.why;
    const m0 = S().money; io.click(0); adv(0.05);
    if (H.hoses().length !== 8) b.push('laid ' + H.hoses().length); if ((S().items.hose || 0) !== 0) b.push('hoses left ' + S().items.hose); if (Object.values(S().items).some((v) => !(v >= 0))) b.push('a negative or NaN stack: ' + JSON.stringify(S().items));
    const per = 18; if (Math.abs((m0 - S().money) - 5 * per) > 1e-6) b.push(`paid ${m0 - S().money} for 5 bought pieces`);
    // not enough money: nothing is laid and nothing is spent
    done(); S().money = 20; await H.aim(0, 5, 0); io.click(0); await H.aim(7, 5, 0); const hs = H.hoses().length, m1 = S().money; io.click(0); adv(0.05);
    if (H.hoses().length !== hs || S().money !== m1) b.push('a route was laid or charged without the money'); done(); return bad(b);
  });

  await T('audit_hose.hammering-a-whole-hose-gives-back-exactly-what-was-laid', async () => {
    H.setup(0); const b = []; S().money = 1e7; delete S().items.hose; ctx.craft('hose', 12); H.K.equip('hose');
    const n0 = S().items.hose;
    await H.hold([[0, 0], [1, 0], [3, 1], [5, 1], [6, 3]], 0); const laid = H.hoses().length;
    if (n0 - (S().items.hose || 0) !== laid) b.push(`spent ${n0 - (S().items.hose || 0)} for ${laid} pieces`);
    for (const t of H.hoses()) g.doDecon({ kind: 'tile', id: t.id });
    if ((S().items.hose || 0) !== n0) b.push(`got back ${(S().items.hose || 0)} of ${n0}`); if (H.hoses().length) b.push('pieces left ' + H.hoses().length);
    return bad(b);
  });

  await T('audit_hose.a-save-and-load-in-the-middle-of-a-route-keeps-the-hose-and-drops-the-route', async () => {
    H.setup(30); const b = [];
    for (let s = 0; s < 4; s++) await H.put(s, 0, 0);
    io.tap('KeyR'); await H.aim(4, 0, 0); io.click(0); if (!g.bplan || !g.bplan.start) return 'no route anchored'; if (!g._lastLaid) return 'no last piece remembered';
    g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) return 'save failed';
    const saved = loadSaved(); g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play'; H.rebuild();
    if (g.bplan && (g.bplan.on || g.bplan.start)) b.push('the route survived the load'); if (g._lastLaid) b.push('the last piece survived the load'); if (g.beltRot) b.push('the quarter turn survived the load');
    if (g.machines.ghost) b.push('the ghost of the old route is still there');
    if (H.hoses().length !== 4 || H.mouths().length !== 1) b.push(`after the load ${H.hoses().length} pieces, ${H.mouths().length} mouths`);
    // aiming now plans a plain piece, not a route from the old anchor
    H.K.equip('hose'); const pl = await H.aim(4, 0, 0); if (pl && pl.planner) b.push('the aim still plans a route'); done(); return bad(b);
  });

  // ---------------------------------------------------------------- gold: it must tell the truth
  await T('audit_hose.gold-in-the-preview-is-gold-after-the-piece-is-down-and-gold-ends-really-sell', async () => {
    H.setup(40); const b = [], bp = H.bin(), bi = toI(bp.x), bk = toK(bp.z); let checked = 0, golds = 0;
    S().money = 0;
    for (let di = -3; di <= 3; di++) for (let dk = -3; dk <= 3; dk++) {
      for (const face of [0, 1, 2, 3]) {
        const i = bi + di, k = bk + dk; if (Math.hypot(cellX(i) - bp.x, cellZ(k) - bp.z) < 1.0) continue;
        g._lastLaid = null; g.beltRot = null; const pl = await H.aimAt(i, k, face); if (!pl || !pl.ok || !pl.ent || pl.planner) continue;
        const wasGold = !!pl.gold, ent = { ...pl.ent }; io.tap('KeyB'); adv(0.05); H.rebuild();
        const t = L().tileAt(ent.i, ent.j, ent.k); if (!t) { b.push(`nothing placed at ${i},${k}`); continue; }
        L().refreshSinks(5); const isGold = L().sinkSet.has(t.id); checked++;
        if (wasGold !== isGold && !(t.dir !== ent.dir)) b.push(`cell ${di},${dk} facing ${face}: the preview said gold=${wasGold}, the piece is gold=${isGold}`);
        if (isGold) {
          golds++; const m0 = S().money, sold0 = S().stats.plush; t.items.push({ sp: pools[0][0], vr: 0, t: 0.99 }); t.pw = 1;
          for (let n = 0; n < 30; n++) { t.pw = 1; g.time += 0.1; L().update(0.1); }
          if (t.items.length) b.push(`a gold end at ${di},${dk} facing ${t.dir} did not pass its plush on`); else if (!(S().money > m0) && !(S().stats.plush > sold0)) b.push(`a gold end at ${di},${dk} facing ${t.dir} lost its plush without a sale`);
        }
        L().remove(t); S().entities = S().entities.filter((e) => !(e.type === 'belt' && e.i === ent.i && e.k === ent.k));
        if (b.length > 6) break;
      }
      if (b.length > 6) break;
    }
    if (checked < 40 || golds < 4) b.push(`only ${checked} cells checked, ${golds} gold`);
    return bad(b);
  });

  await T('audit_hose.the-gold-ring-shows-at-once-when-the-last-piece-is-set-down-next-to-the-bin', async () => {
    H.setup(40); const b = [], bp = H.bin(), k = toK(bp.z);
    // the preview was gold; the piece you set down must not wait most of a second to be gold too (the sinks are only re-read about once a second)
    for (const dx of [-5.4, -4.8, -4.2, -3.6, -3.0]) await H.putAt(toI(bp.x + dx), k, 0);
    L().update(0.01); L().update(0.01);
    const before = L().goldRing.count; if (before !== 0) b.push('a gold ring before the end is in range: ' + before);
    await H.putAt(toI(bp.x - 2.4), k, 0); L().update(0.01); L().update(0.01);
    const last = L().tileAt(toI(bp.x - 2.4), 0, k); if (!last) return 'no piece';
    if (!L().sinkSet.has(last.id) || L().goldRing.count !== 1) b.push(`two frames after the last piece is down: gold set ${L().sinkSet.has(last.id)}, rings ${L().goldRing.count}`);
    // and taking the end back off moves the gold to the new end at once
    g.doDecon({ kind: 'tile', id: last.id }); L().update(0.01); L().update(0.01); if (L().goldRing.count !== 0) b.push('the gold ring stayed after the piece was taken down: ' + L().goldRing.count);
    return bad(b);
  });

  await T('audit_hose.a-gold-end-next-to-a-depot-beacon-sells-there-powered-or-not-and-a-far-end-is-not-gold', async () => {
    H.setup(40); const b = [], K2 = binsKit(ctx); K2.bay(); const bx = -8.0, bz = 3.0, bc = K2.beacon(bx, bz); bc.pw = 1;
    const bi = toI(bx), bk = toK(bz); S().money = 0; let golds = 0, tried = 0;
    for (const powered of [true, false]) {
      for (const [di, dk, face] of [[-2, 0, 0], [2, 0, 2], [0, -2, 1], [0, 2, 3], [-3, 0, 0], [4, 0, 2], [-1, -1, 0], [3, 3, 2]]) {
        g._lastLaid = null; g.beltRot = null; const i = bi + di, k = bk + dk; const pl = await H.aimAt(i, k, face); if (!pl || !pl.ok || pl.planner) continue;
        const wasGold = !!pl.gold; io.tap('KeyB'); adv(0.05); H.rebuild(); const t = L().tileAt(pl.ent.i, 0, pl.ent.k); if (!t) { b.push('nothing placed'); continue; }
        L().refreshSinks(5); const isGold = L().sinkSet.has(t.id); tried++; if (wasGold !== isGold && t.dir === pl.ent.dir) b.push(`beacon ${di},${dk}: preview gold=${wasGold} placed gold=${isGold}`);
        if (isGold) {
          golds++; const m0 = S().money, st0 = S().stats.plush; t.items.push({ sp: pools[0][0], vr: 0, t: 0.99 });
          for (let n = 0; n < 30; n++) { t.pw = 1; bc.pw = powered ? 1 : 0; g.time += 0.1; L().update(0.1); }
          if (t.items.length || !(S().money > m0 || S().stats.plush > st0)) b.push(`a gold end by the ${powered ? 'powered' : 'unpowered'} beacon at ${di},${dk} did not sell (${t.items.length} left)`);
        }
        L().remove(t); S().entities = S().entities.filter((e) => !(e.type === 'belt' && e.i === pl.ent.i && e.k === pl.ent.k));
      }
    }
    if (golds < 2) b.push(`only ${golds} gold ends of ${tried}`);
    K2.gone(bc); return bad(b);
  });

  await T('audit_hose.a-mixed-line-of-hose-and-belt-pieces-with-bends-carries-every-plush-the-mouth-takes-into-the-vault', async () => {
    H.setup(0); const b = [], i = H.o.i, k = H.o.k, sim = g.sim;
    // hose 5 east, belt 3 south, hose 4 east, belt 3 north, a vault at the end
    const path = []; const seg = (n, d, hose) => { for (let q = 0; q < n; q++) path.push({ d, hose }); };
    seg(5, 0, true); seg(3, 1, false); seg(4, 0, true); seg(3, 3, false);
    let ci = i, ck = k; const tl = [];
    for (const st of path) { tl.push({ i: ci, k: ck, ...st }); ci += H.DX[st.d]; ck += H.DZ[st.d]; }
    for (let n = 0; n < tl.length; n++) { const t = tl[n], nx = tl[n + 1] || { i: ci, k: ck }; const d = nx.i > t.i ? 0 : nx.i < t.i ? 2 : nx.k > t.k ? 1 : 3; g.placeEntity('belt', { i: t.i, j: 0, k: t.k, dir: d, rise: 0, items: [], ...(t.hose ? { hose: true } : {}) }, { quiet: true, rebuild: false }); }
    const vault = B.vaultAt(ci, ck); H.rebuild();
    if (H.mouths().length !== 1) return 'mouths ' + H.mouths().length; const mouth = H.mouths()[0], x0 = cellX(mouth.i), z0 = cellZ(mouth.k);
    const N = 30, n0 = sim.n; let made = 0; for (let q = 0; q < N; q++) { const id = H.spill(x0 - 0.8 - (q % 5) * 0.4, z0 + ((q / 5 | 0) - 3) * 0.3, pools[q % 3][q % 2]); if (id >= 0) made++; }
    if (made < N) return 'could only spill ' + made;
    B.seconds(60); const got = vault.stored.length, left = tiles().reduce((a, t) => a + (t.type === 'belt' ? t.items.length : 0), 0), loose = sim.n - n0;
    if (got !== N) b.push(`the vault holds ${got} of ${N} (${left} still on the line, ${loose} still loose)`);
    if (left) b.push(left + ' plush stuck on the line');
    return bad(b);
  });

  // ---------------------------------------------------------------- what it costs a frame
  await T('audit_hose.a-mouth-with-nothing-to-suck-does-not-scan-every-body-every-frame', async () => {
    H.setup(40); const b = []; const sim = g.sim; const bodies = [];
    for (let s = 0; s < 3; s++) await H.put(0, -s * 4, 0);          // three one-piece hoses four cells apart (past the three a press joins): three mouths
    H.rebuild(); if (H.mouths().length !== 3) return 'mouths ' + H.mouths().length;
    for (let q = 0; q < 200; q++) bodies.push(H.spill(cellX(H.o.i) + 20 + (q % 10), cellZ(H.o.k) + (q / 10 | 0) * 0.2, pools[0][q % 4]));   // plush out of every mouth's reach
    let reads = 0, val = sim.n; Object.defineProperty(sim, 'n', { get() { reads++; return val; }, set(v) { val = v; }, configurable: true });
    let scans = 0; const orig = L().hoseIntake; L().hoseIntake = function (t, dt) { const r0 = reads; const out = orig.call(this, t, dt); if (reads > r0) scans++; return out; };
    try { for (let n = 0; n < 120; n++) { for (const t of tiles()) if (t.type === 'belt') t.pw = 1; g.time += 1 / 60; L().update(1 / 60); } }
    finally { L().hoseIntake = orig; delete sim.n; sim.n = val; }
    if (scans > 3 * 12) b.push(`${scans} full scans of the plush in 2 s for 3 mouths (every frame would be 360)`);
    return bad(b);
  });

  await T('audit_hose.aiming-a-route-around-builds-no-new-geometry-for-each-aim', async () => {
    // a geometry nobody disposes stays in the graphics card for good: the preview of a route is rebuilt for every cell you aim at, so its pieces must be shared, not new each time
    B.setup(); H.setup(0); const b = []; ctx.craft('belt', 40); H.K.equip('belt'); await H.aim(0, 0, 0); io.click(0); if (!g.bplan.start) return 'no anchor';
    const geos = () => { const set = new Set(); if (g.machines.ghost) g.machines.ghost.traverse((m) => { if (m.isMesh) set.add(m.geometry.uuid); }); return set; };
    await H.aim(6, -3, 0); const a = geos(); if (a.size < 1) return 'no ghost';
    let fresh = 0; for (const [di, dk] of [[7, -3], [8, -2], [6, 4], [9, 0]]) { await H.aim(di, dk, 0); for (const u of geos()) if (!a.has(u)) fresh++; }
    if (fresh > 6) b.push(`${fresh} new geometries over four aims (each one stays in the graphics card)`);
    done(); return bad(b);
  });

  await T('audit_hose.rebuilding-and-running-a-big-hose-network-costs-no-more-than-the-same-belts', async () => {
    H.setup(0); const b = []; S().money = 1e9; const N = 1500, perf = (window.__hosePerf = window.__hosePerf || {});
    // (the free starter belt keeps its entity: its tile stays, and a tile with no entity broke the next test that checks the world agrees with itself)
    const lay = (hose) => { for (const t of tiles()) if (t.type === 'belt' && !t.free) L().remove(t); S().entities = S().entities.filter((e) => e.type !== 'belt' || e.free); for (let q = 0; q < N; q++) g.placeEntity('belt', { i: H.o.i + (q % 25) * 1, j: 0, k: H.o.k + Math.floor(q / 25) * 2 - 20, dir: q % 25 === 24 ? 1 : 0, rise: 0, items: [], ...(hose ? { hose: true } : {}) }, { quiet: true, rebuild: false }); };
    const best = (fn, n = 5) => { let m = 1e9; for (let r = 0; r < n; r++) { const t0 = performance.now(); fn(); m = Math.min(m, performance.now() - t0); } return m; };
    const run = (hose) => { lay(hose); const rebuild = best(() => L().rebuildBelts()); for (const t of tiles()) if (t.type === 'belt') t.pw = 1; const upd = best(() => { for (const t of tiles()) if (t.type === 'belt') t.pw = 1; g.time += 1 / 60; L().update(1 / 60); }, 20); return { rebuild, upd }; };
    const belts = run(false), hoses = run(true); perf.rebuildBelts = belts.rebuild; perf.rebuildHoses = hoses.rebuild; perf.updateBelts = belts.upd; perf.updateHoses = hoses.upd;
    if (hoses.rebuild > belts.rebuild * 4 + 5) b.push(`rebuilding ${N} hoses took ${hoses.rebuild.toFixed(1)} ms against ${belts.rebuild.toFixed(1)} ms for belts`);
    if (hoses.upd > belts.upd * 3 + 4) b.push(`running ${N} hoses took ${hoses.upd.toFixed(2)} ms a frame against ${belts.upd.toFixed(2)} ms for belts`);
    // the aim with a hose out and a big network standing (the plan, the run, the ghost) must stay cheap
    S().items.hose = 50; g.rebuildTools(); H.K.equip('hose');
    const aimOnce = (di, dk) => { H.K.aimDir(cellX(H.o.i + di), 0, cellZ(H.o.k + dk), 0, 2.0); const e = ctx.p().eyePos(new ctx.V3()), d = ctx.p().forward(new ctx.V3()); g.updateBuild(g.curTool(), e, d); };
    perf.aimMs = best(() => { for (let q = 0; q < 10; q++) aimOnce(3 + q, 6 + (q % 3)); }, 5) / 10;
    if (perf.aimMs > 12) b.push(`one aim with a hose out and ${N} pieces standing takes ${perf.aimMs.toFixed(1)} ms`);
    for (const t of tiles()) if (t.type === 'belt' && !t.free) L().remove(t); S().entities = S().entities.filter((e) => e.type !== 'belt' || e.free);
    return bad(b);
  });
}
