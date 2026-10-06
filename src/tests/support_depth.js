export default async function (ctx) {
  const { T, g, S, fresh, cellX, cellZ, FRAME_TYPES } = ctx;
  const stub = (kind, x, z) => ({ id: 'frame:' + kind, kind: 'frame', fk: kind, plan: { ok: true, ent: { kind, axis: 'x', cx: x, cz: z, y0: 0, w: 2.36, h: 2.38, gm: 1, glo: 1, gj: 0, clear: [] } } });
  const tryPlace = (kind, x, z) => { const t = stub(kind, x, z); S().items[t.id] = 1; g.plan = t.plan; const n0 = S().entities.length; g.placeCurrent(t); return { placed: S().entities.length - n0, left: S().items[t.id] || 0 }; };
  await T('mining.depth-ratings-table-is-ordered-and-reaches-the-exit', async () => {
    const ds = Object.values(FRAME_TYPES).map((f) => f.maxDepth); for (let i = 1; i < ds.length; i++) if (!(ds[i] > ds[i - 1])) return 'ratings not rising at tier ' + i;
    return (FRAME_TYPES.voidl.maxDepth >= 3000 && !isFinite(FRAME_TYPES.horizon.maxDepth)) || 'the exit is 3000 m out and needs a tier rated for it';
  });
  await T('mining.shallow-support-sets-normally', async () => { fresh({ timber: 1 }); const r = tryPlace('timber', 20, 10); return (r.placed === 1 && r.left === 0) || JSON.stringify(r); });
  await T('mining.too-deep-support-breaks-and-is-lost', async () => {
    fresh({ timber: 1, steel: 1 }); const r = tryPlace('timber', 400, 10); if (r.placed !== 0 || r.left !== 0) return 'timber at 400 m: ' + JSON.stringify(r); if (S().entities.some((e) => e.type === 'frame')) return 'a broken frame still stands';
    const r2 = tryPlace('steel', 300, 10); const r3 = tryPlace('steel', 600, 10); return (r2.placed === 1 && r3.placed === 0) || `steel at 300 m ${JSON.stringify(r2)}, at 600 m ${JSON.stringify(r3)}`;
  });
  await T('mining.near-the-limit-support-creaks-but-holds', async () => { fresh({ timber: 1 }); const seen = []; const old = g.ui.hint; g.ui.hint = (t) => { seen.push(String(t)); }; const r = tryPlace('timber', 135, 10); g.ui.hint = old; return (r.placed === 1 && seen.some((t) => /creaking under the pressure of the mountain/.test(t))) || JSON.stringify(r) + ' ' + seen.join('|').slice(0, 200); });
  await T('mining.struts-and-jacks-have-depth-limits', async () => {
    fresh({ struts: 1, jacks: 1 }); const tryS = (kind, x) => { const t = { id: kind, kind, plan: { ok: true, ent: { x, y: 0, z: 10 } } }; S().items[kind] = 1; g.plan = t.plan; const n0 = S().entities.length; g.placeCurrent(t); return S().entities.length - n0; };
    return (tryS('strut', 50) === 1 && tryS('strut', 200) === 0 && tryS('jack', 200) === 1 && tryS('jack', 500) === 0) || 'strut/jack depth limits wrong';
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
