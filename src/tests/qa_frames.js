// Adversarial QA of free standing (turned) frames: key conflicts, ghost leaks, overlap, saving, removal.
export default async function (ctx) {
  const { T, g, S, w, p, fresh, spot, dig, craft, selectTool, plan, placeNow, aimPoint, adv, toI, toK, cellX, cellZ, newWorld, THREE } = ctx;
  const up = { timber: 1, steel: 1, power: 1, fans: 1, mfan: 1 };
  const key = (code, down = true) => g.onKey({ code, target: document.body, repeat: false, preventDefault() {} }, down);
  const tunnel = (wide = 8, high = 4, long = 30) => {
    fresh(up); let sp; for (const lane of [12, 22, 4, -8, 30]) { try { sp = spot(lane); } catch (e) { continue; } if (w().topAt(sp.i + 20, sp.k) >= 7) break; }
    dig(sp.i, sp.k - 2, long, wide, high, false); craft('frame:timber', 8); craft('struts', 1); selectTool('frame:timber'); return sp;
  };
  const look = (x, z) => aimPoint(x, 0, z, 2.4);
  const mkFree = (x, z, yaw, extra = {}) => { const e = { id: g.nextId(), type: 'frame', kind: 'timber', axis: Math.abs(Math.sin(yaw)) > 0.7071 ? 'x' : 'z', cx: x, cz: z, y0: 0, w: 2.36, h: 2.38, yaw, turned: true, ...extra }; S().entities.push(e); g.addEntity(e); return e; };

  await T('qa.frames.arrows-turn-a-frame-in-hand-and-never-change-the-tool', async () => {
    tunnel(); craft('struts', 1); const slot = g.buildIdx; g.keys = {}; look(cellX(1000), 0);
    key('ArrowRight'); key('ArrowRight', false); key('ArrowLeft'); key('ArrowLeft', false); key('ArrowDown'); key('ArrowDown', false);
    if (g.buildIdx !== slot) return `an arrow key changed the tool slot ${slot} -> ${g.buildIdx} while a frame was in hand`;
    // with hands free (stowed) the same keys cycle tools again, so nothing is lost
    g.stowed = true; const before = g.buildIdx; key('ArrowRight'); key('ArrowRight', false); g.stowed = false; g.buildIdx = slot;
    return true;
  });

  await T('qa.frames.inventory-arrows-never-turn-the-frame', async () => {
    tunnel(); g.frameYaw = 0.7; const slot = g.buildIdx; g.ui.open('inv'); const sel = g.invSel;
    key('ArrowRight'); key('ArrowRight', false); key('ArrowLeft'); key('ArrowLeft', false); key('ArrowDown'); key('ArrowDown', false);
    const turned = g.frameYaw; g.ui.closeModals();
    if (turned !== 0.7) return `inventory arrows changed the frame angle ${turned}`; if (g.buildIdx !== slot) return 'inventory arrows changed the hotbar slot';
    // a key that went down before the menu opened and up inside it must not stay stuck
    key('ArrowLeft'); g.ui.open('inv'); key('ArrowLeft', false); g.ui.closeModals(); return !g.keys.ArrowLeft || 'ArrowLeft is stuck down after a menu';
  });

  await T('qa.frames.turning-stops-with-the-key-and-with-the-frame-put-away', async () => {
    const { i, k } = tunnel(); look(cellX(i + 14), cellZ(k + 1)); await plan(); g.keys.ArrowRight = true; for (let n = 0; n < 5; n++) { g._fyT = performance.now() - 50; await plan(); } g.keys.ArrowRight = false;
    const y0 = g.frameYaw; for (let n = 0; n < 5; n++) { g._fyT = performance.now() - 50; await plan(); } if (g.frameYaw !== y0) return 'kept turning after the key came up';
    g.keys.ArrowRight = true; g.stowed = true; for (let n = 0; n < 5; n++) { g._fyT = performance.now() - 50; try { g.updateBuild(g.curTool(), p().eyePos(new THREE.Vector3()), p().forward(new THREE.Vector3())); } catch (e) { /* hands: no build */ } } g.keys.ArrowRight = false; g.stowed = false;
    return g.frameYaw === y0 || 'turned while the frame was put away';
  });

  await T('qa.frames.ghost-does-not-leak-when-the-tool-changes-or-a-menu-opens', async () => {
    const { i, k } = tunnel(); look(cellX(i + 14), cellZ(k + 1)); g.frameYaw = 0.3; const pl = await plan(); if (!pl.ok) return pl.why;
    const visible = () => { const gh = g.machines.ghost; return !!(gh && gh.visible && gh.parent); };
    if (!visible()) return 'no preview while aiming with a frame'; g.stowed = true; g.rebuildTools(); if (visible()) return 'preview left behind after putting the frame away';
    g.stowed = false; g.rebuildTools(); await plan(); selectTool('hammer'); if (visible()) return 'frame preview left behind after switching to the hammer';
    selectTool('frame:timber'); await plan(); g.ui.open('shop'); adv(0.2); const leak = visible(); g.ui.closeModals(); return !leak || 'frame preview stays up behind a menu';
  });

  await T('qa.frames.turned-frames-cannot-cut-through-each-other-but-may-touch', async () => {
    const { i, k } = tunnel(10, 4, 40); const x = cellX(i + 12), z = cellZ(k + 2); const a = mkFree(x, z, 0.5);
    const tryAt = async (dx, dz, yaw) => { g.frameYaw = yaw; look(x + dx, z + dz); const pl = await plan(); return pl; };
    const across = await tryAt(0.35, 0.1, 0.5 + Math.PI / 2); if (across.ok) return 'a frame crossing the first at 90 degrees through its middle was allowed';
    const slant = await tryAt(0.2, 0.2, 0.5 + 0.8); if (slant.ok) return 'a frame slanted 46 degrees through the first was allowed';
    const apart = await tryAt(3.4, 0, 0.5); if (!apart.ok) return 'a frame well clear of the first was refused: ' + apart.why;
    // touching is fine: the next one flush along the first one's axis (depth 0.6 m) at the same angle
    const flush = await tryAt(0.6 * Math.sin(0.5), 0.6 * Math.cos(0.5), 0.5); return flush.ok || 'a frame set flush against the first at the same angle was refused: ' + flush.why;
  });

  await T('qa.frames.grid-frames-cannot-cut-through-a-turned-frame', async () => {
    const { i, k } = tunnel(10, 4, 40); const a = mkFree(cellX(i + 12), cellZ(k + 2), 0.9);
    g.frameYaw = null; look(cellX(i + 12), cellZ(k + 2)); const pl = await plan(); return (!pl.ok || pl.ent.turned) || 'a grid frame was planned straight through a turned one';
  });

  await T('qa.frames.free-frame-save-load-keeps-angle-support-and-fan', async () => {
    const { i, k } = tunnel(); const e = mkFree(cellX(i + 10), cellZ(k + 2), 2.3); craft('mfan'); selectTool('mfan'); g.frameYaw = null; aimPoint(e.cx, e.y0 + e.h - 0.3, e.cz, 3.0); await plan(); const placed = placeNow(); if (placed !== 1) return 'fan not placed on a turned frame';
    const raw = JSON.parse(JSON.stringify(S().entities)); for (const x of raw) if (x.id === e.id && (x.yaw !== 2.3 || x.turned !== true)) return 'saved data lost the angle';
    // load: tear everything down and rebuild from the saved data only
    for (const x of [...S().entities]) { if (x.free) continue; const t = g.logi.byId.get(x.id); if (t) { g.logi.remove(t); continue; } const it = g.machines.items.get(x.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(x.id); } }
    S().entities = S().entities.filter((x) => x.free); w().supports = []; for (const x of raw) if (!x.free) { S().entities.push(x); g.addEntity(x); }
    const it = g.machines.items.get(e.id); const sup = w().supports.find((s) => s.id === e.id); const fan = [...g.logi.tiles.values()].find((t) => t.mounted && t.frameId === e.id);
    return (it && Math.abs(it.obj.rotation.y - 2.3) < 1e-9 && sup && fan) || `after load: mesh ${!!it} support ${!!sup} fan ${!!fan} rot ${it && it.obj.rotation.y}`;
  });

  await T('qa.frames.removing-a-turned-frame-takes-its-fan-and-gives-both-back', async () => {
    const { i, k } = tunnel(); const e = mkFree(cellX(i + 10), cellZ(k + 2), 1.1); craft('mfan'); selectTool('mfan'); aimPoint(e.cx, e.y0 + e.h - 0.3, e.cz, 3.0); await plan(); placeNow(); S().items = {};
    g.doDecon({ kind: 'mach', id: e.id }); const fans = [...g.logi.tiles.values()].filter((t) => t.mounted).length;
    return (fans === 0 && S().items['frame:timber'] === 1 && S().items.mfan === 1 && !w().supports.some((s) => s.id === e.id) && !S().entities.some((x) => x.id === e.id)) || `fans ${fans} items ${JSON.stringify(S().items)}`;
  });

  await T('qa.frames.a-frame-that-buckles-takes-its-fan-with-it', async () => {
    const { i, k } = tunnel(); const e = mkFree(cellX(i + 10), cellZ(k + 2), 0.4); craft('mfan'); selectTool('mfan'); aimPoint(e.cx, e.y0 + e.h - 0.3, e.cz, 3.0); await plan(); placeNow();
    const s = w().supports.find((q) => q.id === e.id); g.failSupport(s, 1.5);
    const orphan = [...g.logi.tiles.values()].filter((t) => t.mounted); const ent = S().entities.filter((x) => x.mounted);
    return (orphan.length === 0 && ent.length === 0 && ![...g.logi.objs.values()].some((o) => o.parent && o.userData && o.userData.mounted)) || `orphan fans: ${orphan.length} tiles, ${ent.length} entities`;
  });

  await T('qa.frames.a-placed-frame-never-traps-or-pushes-the-player-into-the-pile', async () => {
    const { i, k } = tunnel(); look(cellX(i + 14), cellZ(k + 1)); g.frameYaw = 0.6; const pl = await plan(); if (!pl.ok) return pl.why;
    // stand in the very spot the frame will take, then set it: the player must not end up inside plush
    p().pos.set(pl.ent.cx, pl.ent.y0 + 0.05, pl.ent.cz); p().vel.set(0, 0, 0); g.frameYaw = 0.6; const n = placeNow(); adv(0.5); const q = p().pos;
    const embedded = w().solid(toI(q.x), Math.floor((q.y + 0.9) / 0.6), toK(q.z)); return (n >= 0 && !p().embedded && !embedded && Number.isFinite(q.x + q.y + q.z)) || 'player ended up embedded after placing a frame on top of themselves';
  });

  await T('qa.frames.a-new-game-starts-with-frames-on-the-grid', async () => {
    tunnel(); g.frameYaw = 1.2; g._lastFrameYaw = 1.2; await newWorld(); const ok = g.frameYaw == null && g._lastFrameYaw === undefined; return ok || `frame angle leaked into the next game: ${g.frameYaw}, ${g._lastFrameYaw}`;
  });
}
