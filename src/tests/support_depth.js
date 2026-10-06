export default async function (ctx) {
  const { T, g, S, fresh, cellX, cellZ, FRAME_TYPES } = ctx;
  const stub = (kind, x, z) => ({ id: 'frame:' + kind, kind: 'frame', fk: kind, plan: { ok: true, ent: { kind, axis: 'x', cx: x, cz: z, y0: 0, w: 2.36, h: 2.38, gm: 1, glo: 1, gj: 0, clear: [] } } });
  const tryPlace = (kind, x, z) => { const t = stub(kind, x, z); S().items[t.id] = 1; g.plan = t.plan; const n0 = S().entities.length; g.placeCurrent(t); return { placed: S().entities.length - n0, left: S().items[t.id] || 0 }; };
  await T('mining.depth-ratings-table-is-ordered-and-reaches-the-exit', async () => {
    const ds = Object.values(FRAME_TYPES).map((f) => f.maxDepth); for (let i = 1; i < ds.length; i++) if (!(ds[i] > ds[i - 1])) return 'ratings not rising at tier ' + i;
    return (FRAME_TYPES.voidl.maxDepth >= 3000 && !isFinite(FRAME_TYPES.horizon.maxDepth)) || 'the exit is 3000 m out and needs a tier rated for it';
  });
  // an 8 x 8 room, 4 high, carved at a spot `dist` metres out: a wide roof under the real pile
  const room = (dist, n = 8) => { const i = ctx.toI(dist), k = ctx.toK(10); for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let j = 0; j < 4; j++) ctx.w().removeCell(i + a, j, k + b, false); return { x: cellX(i + n / 2), z: cellZ(k + n / 2) }; };
  const sup = (kind, x, z) => ({ x, y: 1.2, z, r: FRAME_TYPES[kind].radius, kind, cap: ctx.capacityOf(kind) });
  const ratio = (kind, x, z) => ctx.loadOn(ctx.w(), sup(kind, x, z)) / ctx.capacityOf(kind);
  await T('mining.shallow-support-sets-normally', async () => { fresh({ timber: 1 }); const r = tryPlace('timber', 20, 10); return (r.placed === 1 && r.left === 0) || JSON.stringify(r); });
  await T('mining.load-grows-with-depth-and-roof-area', async () => {
    ctx.fresh({ timber: 1 }); const a = room(60, 8), b = room(400, 8), c = room(400, 4); const ra = ratio('timber', a.x, a.z), rb = ratio('timber', b.x, b.z), rc = ratio('timber', c.x, c.z);
    return (rb > ra * 1.5 && rb > rc) || `timber load: 60 m ${ra.toFixed(2)}, 400 m ${rb.toFixed(2)}, 400 m narrow ${rc.toFixed(2)}`;
  });
  await T('mining.too-heavy-support-breaks-and-is-lost', async () => {
    ctx.fresh({ timber: 1, steel: 1, concrete: 1 }); const r0 = room(400, 8); const rt = ratio('timber', r0.x, r0.z), rc = ratio('concrete', r0.x, r0.z);
    if (!(rt > 1)) return 'timber should be overloaded in a wide room 400 m deep: ' + rt.toFixed(2); if (!(rc < 1)) return 'concrete should hold there: ' + rc.toFixed(2);
    const place = (kind) => { const t = { id: 'frame:' + kind, kind: 'frame', fk: kind, plan: { ok: true, ent: { kind, axis: 'x', cx: r0.x, cz: r0.z, y0: 0, w: 2.36, h: 2.38, gm: 1, glo: 1, gj: 0, clear: [] } } }; S().items[t.id] = 1; g.plan = t.plan; const n0 = S().entities.length; g.placeCurrent(t); return { placed: S().entities.length - n0, left: S().items[t.id] || 0 }; };
    const a = place('timber'); const b = place('concrete'); return (a.placed === 0 && a.left === 0 && b.placed === 1) || `timber ${JSON.stringify(a)} concrete ${JSON.stringify(b)}`;
  });
  await T('mining.supports-share-the-weight', async () => {
    ctx.fresh({ steel: 1 }); const r0 = room(300, 8); const solo = ratio('steel', r0.x, r0.z);
    const mk = (dx) => { const e = { id: g.nextId(), type: 'frame', kind: 'steel', axis: 'x', cx: r0.x + dx, cz: r0.z, y0: 0, w: 2.36, h: 2.38, gm: 1, glo: 1, gj: 0 }; S().entities.push(e); g.addEntity(e); return e; };
    const a = mk(0); const withB = ctx.loadOn(ctx.w(), ctx.w().supports.find((q) => q.id === a.id)) / ctx.capacityOf('steel'); mk(1.2);
    const shared = ctx.loadOn(ctx.w(), ctx.w().supports.find((q) => q.id === a.id)) / ctx.capacityOf('steel'); return (shared < withB * 0.75) || `one ${withB.toFixed(2)} two ${shared.toFixed(2)} (solo ${solo.toFixed(2)})`;
  });
  await T('mining.losing-a-support-overloads-its-neighbour-and-it-buckles', async () => {
    ctx.fresh({ steel: 1, concrete: 1 }); const r0 = room(250, 8); const ents = [];
    for (const dx of [-0.9, 0.9]) { const e = { id: g.nextId(), type: 'frame', kind: 'steel', axis: 'x', cx: r0.x + dx, cz: r0.z, y0: 0, w: 2.36, h: 2.38, gm: 1, glo: 1, gj: 0 }; S().entities.push(e); g.addEntity(e); ents.push(e); }
    g.time += 5; for (const e of ents) g.queueLoad(e.cx, 1, e.cz); for (let n = 0; n < 12; n++) g.updateLoads(0.4);
    const both = ents.map((e) => ctx.w().supports.find((q) => q.id === e.id)).filter(Boolean).length;
    if (both !== 2) return 'a frame buckled while both were up (' + both + ' left); loads ' + ents.map((e) => { const q = ctx.w().supports.find((x) => x.id === e.id); return q && q.load; }).join();
    // knock one down by hand: its share lands on the other
    g.doDecon({ kind: 'mach', id: ents[0].id }); for (let n = 0; n < 20; n++) { g.queueLoad(ents[1].cx, 1, ents[1].cz); g.updateLoads(0.4); }
    const left = ctx.w().supports.some((q) => q.id === ents[1].id); const L = ctx.loadOn(ctx.w(), { x: ents[1].cx, y: 1.2, z: ents[1].cz, r: 3.4, id: 'probe', kind: 'steel', cap: 1 }) / ctx.capacityOf('steel');
    return (!left || L <= 1) || 'the remaining frame carries ' + L.toFixed(2) + ' and did not buckle';
  });
  await T('mining.depth-warning-messages-fire-once-as-you-go-deeper', async () => {
    fresh({ timber: 1, steel: 1 }); S().depthWarn = {}; const seen = []; const old = g.ui.hint; g.ui.hint = (t) => { seen.push(String(t)); };
    for (const x of [10, 100, 140, 145, 200, 300, 330, 400, 410]) { g.player.pos.set(x, 0, 0); g._depthT = 0; g.depthCheck(0.01); g._depthT = 0; g.depthCheck(0.01); }
    g.ui.hint = old; const creakWood = seen.filter((t) => /wood is starting to creak under the pressure of the mountain/.test(t)).length, brokeWood = seen.filter((t) => /wood can't take it/.test(t)).length, creakSteel = seen.filter((t) => /steel is starting to creak/.test(t)).length, brokeSteel = seen.filter((t) => /steel can't take it/.test(t)).length;
    return (creakWood === 1 && brokeWood === 1 && creakSteel === 1 && brokeSteel === 1) || `wood creak ${creakWood} break ${brokeWood}, steel creak ${creakSteel} break ${brokeSteel}`;
  });
  await T('mining.auto-bolters-skip-supports-too-weak-for-the-depth', async () => {
    fresh({ timber: 1, mech: 1, mechBolt: 1 }); S().money = 1e12; const n0 = S().entities.length; const toI = ctx.toI, toK = ctx.toK;
    const world = ctx.w(); // a frame needs a roof; just check that the choice respects the rating by asking for a deep spot and a shallow one
    const kinds = []; const orig = g.machines.frameFromCell; g.machines.frameFromCell = function (i, j, k, axis, kind) { kinds.push(kind); return { ok: false, why: 'stub' }; };
    g.machines.autoFrame(toI(200), 0, toK(10), 0); g.machines.autoFrame(toI(50), 0, toK(10), 0); g.machines.frameFromCell = orig; void n0; void world;
    return (kinds.join() === 'timber') || 'tiers tried: ' + kinds.join();
  });
}
