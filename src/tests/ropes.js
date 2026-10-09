export default async function (ctx) {
  const { T, g, S, w, p, fresh, craft, selectTool, plan, placeNow, aimPoint, spot, toI, toK, cellX, cellZ, recipes, UPGRADES, newWorld } = ctx;
  const up = { climb: 1, rope: 1 };
  const high = () => { const k = toK(0) + 10; let d0 = 0; for (let d = 30; d < 90; d++) if (w().topAt(toI(0) + d, k) >= 36) { d0 = d; break; } const i = toI(0) + d0 + 4, t = w().topAt(i, k); p().pos.set(cellX(i), 25, cellZ(k)); p().footCell = { i, j: t - 1, k }; p().onGround = true; p().vel.set(0, 0, 0); return { i, k, t }; };
  await T('rope.anchors-need-climbing-gear-and-cost-something', async () => {
    fresh({}); if (recipes(g).some((r) => r.id === 'rope')) return 'craftable without the upgrade'; const u = UPGRADES.find((x) => x.id === 'rope'); if (!u || u.req.id !== 'climb') return 'upgrade or requirement missing';
    S().money = 1e9; if (g.buy('rope')) return 'bought without Climbing Gear'; S().up.climb = 1; if (!g.buy('rope')) return 'could not buy with Climbing Gear'; g.T = g.tune(); const r = recipes(g).find((x) => x.id === 'rope'); return (r && r.price > 0 && S().up.rope === 1) || 'recipe missing after buying';
  });
  await T('rope.plants-on-the-slope-and-holds-the-climber', async () => {
    await newWorld(); fresh(up); craft('rope', 2); selectTool('rope'); const h = high(); const gx = cellX(h.i), gz = cellZ(h.k);
    // stake it into the pile surface where the climber stands
    const e = { id: g.nextId(), type: 'rope', x: gx, y: 25, z: gz }; S().entities.push(e); g.addEntity(e);
    g.hp = 100; g.wedge.clear(); const f0 = S().stats.climbFalls || 0; for (let n = 0; n < 40; n++) { g._climbT = 5; const r0 = Math.random; Math.random = () => 0; try { g.climbRisk(0.1); } finally { Math.random = r0; } } const roped = (S().stats.climbFalls || 0) - f0, slideNear = !!g.wedge.cur;
    // (nothing hits you any more when the footing gives way: a slide is what the rope prevents)
    // (9 m down the slope: 9 m the other way the pile top can be flat and at the ceiling, where no slide can start)
    p().pos.set(gx - 9, 25, gz); g.hp = 100; g._climbT = 5; const f1 = S().stats.climbFalls || 0; { const r0 = Math.random; Math.random = () => 0; try { g.climbRisk(0.1); } finally { Math.random = r0; } }
    const far = (S().stats.climbFalls || 0) - f1, slideFar = !!g.wedge.cur; g.wedge.clear();
    return (roped === 0 && !slideNear && far === 1 && slideFar) || `falls near the rope ${roped} (slide ${slideNear}), 9 m away ${far} (slide ${slideFar})`;
  });
  await T('rope.steps-barely-loosen-a-roped-slope', async () => {
    fresh(up); const h = high(); const got = []; const orig = g.slide.trigger.bind(g.slide); g.slide.trigger = (i, j, k, e) => { got.push(e); };
    g.treadOn(1, false); const bare = got[0]; const e = { id: g.nextId(), type: 'rope', x: p().pos.x, y: 25, z: p().pos.z }; S().entities.push(e); g.addEntity(e); g.treadOn(1, false); const roped = got[1]; g.slide.trigger = orig;
    return (roped < bare * 0.25) || `energy bare ${bare}, roped ${roped}`;
  });
  await T('rope.placement-consumes-one-saves-and-hammers-back', async () => {
    fresh(up); const { i, k } = spot(); craft('rope', 2); selectTool('rope'); aimPoint(cellX(i + 3), 0, cellZ(k), 2.2); const pl = await plan(); if (!pl.ok) return pl.why; const n = placeNow();
    const e = S().entities.find((x) => x.type === 'rope'); if (n !== 1 || !e || S().items.rope !== 1) return 'placement ' + JSON.stringify([n, !!e, S().items.rope]);
    const raw = JSON.parse(JSON.stringify(S().entities)).find((x) => x.type === 'rope'); if (!raw || raw.x !== e.x) return 'not in save data'; if (!g.machines.items.get(e.id) || !g.machines.items.get(e.id).obj) return 'no mesh';
    g.doDecon({ kind: 'mach', id: e.id }); return (S().items.rope === 2 && !g.machines.items.get(e.id) && !S().entities.some((x) => x.id === e.id)) || 'not returned on hammer: ' + JSON.stringify(S().items);
  });
}
