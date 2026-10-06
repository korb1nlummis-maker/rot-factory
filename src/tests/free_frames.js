export default async function (ctx) {
  const { T, g, S, w, p, fresh, spot, dig, craft, selectTool, plan, placeNow, aimPoint, adv, toI, toK, cellX, cellZ, newWorld } = ctx;
  const up = { timber: 1, steel: 1 };
  const tunnel = (wide = 8, high = 4, long = 30) => { fresh(up); const { i, k } = spot(); dig(i, k - 2, long, wide, high, false); craft('frame:timber', 6); selectTool('frame:timber'); return { i, k }; };
  const look = (x, z) => { aimPoint(x, 0, z, 2.4); };
  await T('mining.free-frame-turns-smoothly-with-arrow-keys-and-leaves-the-grid', async () => {
    const { i, k } = tunnel(); look(cellX(i + 14), cellZ(k + 1)); await plan(); const t0 = g.frameYaw; if (t0 != null) return 'yaw already free';
    const seen = []; g.keys.ArrowRight = true; for (let n = 0; n < 12; n++) { g._fyT = performance.now() - 50; await plan(); seen.push(g.frameYaw); } g.keys.ArrowRight = false;
    let mono = true; for (let n = 1; n < seen.length; n++) if (!(seen[n] > seen[n - 1])) mono = false; const step = seen[1] - seen[0];
    if (!mono || step < 0.03 || step > 0.12) return `not smooth: ${seen.slice(0, 4).map((v) => v.toFixed(3))} step ${step}`;
    const pl = g.plan; return (pl.ent.turned === true && Math.abs(pl.ent.yaw - g.frameYaw) < 1e-9) || 'plan is not free ' + JSON.stringify(pl.ent.turned);
  });
  await T('mining.arrow-keys-still-cycle-tools-when-no-frame-is-equipped', async () => { fresh(up); craft('struts', 1); g.stowed = true; g.frameYaw = null; const f = g.frameEquipped(); return f === false || 'frameEquipped true with hands'; });
  await T('mining.free-frame-places-at-an-angle-and-stays-turned', async () => {
    const { i, k } = tunnel(); g.frameYaw = 0.5; look(cellX(i + 14), cellZ(k + 1)); const pl = await plan(); if (!pl.ok) return pl.why; const n = placeNow(); const e = S().entities.find((x) => x.type === 'frame');
    if (n !== 1 || !e || !e.turned || Math.abs(e.yaw - 0.5) > 1e-9) return 'entity ' + JSON.stringify(e && [e.turned, e.yaw]);
    const it = g.machines.items.get(e.id); const raw = JSON.parse(JSON.stringify(S().entities)).find((x) => x.id === e.id);
    return (Math.abs(it.obj.rotation.y - 0.5) < 1e-9 && raw.yaw === 0.5 && w().supports.some((s) => s.id === e.id)) || 'mesh rotation ' + it.obj.rotation.y;
  });
  await T('mining.free-frame-needs-room-at-its-angle', async () => {
    fresh(up); let sp = spot(); for (const lane of [20, 28, 6, -6]) { if (w().topAt(sp.i + 12, sp.k) >= 8) break; try { sp = spot(lane); } catch (e) { /* none */ } } const { i, k } = sp;
    // a sealed pocket 1.2 m long and 2.4 m wide, deep in the pile: a frame whose width runs across it fits, one whose width runs along it does not
    for (let x = i + 6; x < i + 16; x++) for (let z = k - 5; z < k + 6; z++) for (let j = 0; j < 7; j++) w().setCell(x, j, z, 2, 0); // solid plush all round, so the pocket is exactly what we dig
    dig(i + 10, k - 1, 2, 4, 4, false); const cx = (cellX(i + 10) + cellX(i + 11)) / 2, cz = (cellZ(k - 1) + cellZ(k + 2)) / 2, W = 4 * 0.6 - 0.04, H = 4 * 0.6 - 0.02, D = 0.54;
    const across = g.machines.orientedClear(cx, cz, Math.PI / 2, 0, W, D, H), along = g.machines.orientedClear(cx, cz, 0, 0, W, D, H), slant = g.machines.orientedClear(cx, cz, Math.PI / 2 - 0.35, 0, W, D, H);
    return (across.length === 0 && along.length > 8 && slant.length > 0) || `blocking cells: across ${across.length}, along ${along.length}, slanted ${slant.length}`;
  });
  await T('mining.free-frames-chain-into-a-curve-without-snapping', async () => {
    const { i, k } = tunnel(10, 4, 40); const ids = []; let yaw = 0;
    for (let n = 0; n < 5; n++) { g.frameYaw = yaw; look(cellX(i + 6 + n * 3), cellZ(k + 2)); const pl = await plan(); if (!pl.ok) return `frame ${n}: ${pl.why}`; placeNow(); ids.push(S().entities[S().entities.length - 1]); yaw += 0.12; }
    const ys = ids.map((e) => e.yaw); const free = ids.every((e) => e.turned); const cur = ys.every((v, n) => n === 0 || v > ys[n - 1]);
    return (free && cur && new Set(ids.map((e) => e.id)).size === 5) || 'curve ' + ys.map((v) => v.toFixed(2));
  });
  await T('mining.arrow-down-returns-frames-to-the-grid', async () => { const { i, k } = tunnel(); g.frameYaw = 0.7; look(cellX(i + 14), cellZ(k + 1)); await plan(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true })); await plan(); return (g.frameYaw === null && g.plan.ent.gm !== undefined && !g.plan.ent.turned) || 'still free ' + g.frameYaw; });
}
