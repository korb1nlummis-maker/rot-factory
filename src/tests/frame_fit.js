export default async function (ctx) {
  const { T, fresh, spot, dig, craft, selectTool, plan, placeNow, lookEast, cellX, cellZ, S, w, UPGRADES } = ctx;
  const up = { timber: 1, steel: 1, struts: 1, jacks: 1 };
  await T('mining.frame-fits-a-4x4-tunnel-wherever-you-aim', async () => {
    const bad = [];
    for (const off of [0, 1, 2, 3]) {
      fresh(up); const { i, k } = spot(); dig(i, k - 1 + off, 22, 4, 4, false); craft('frame:timber'); selectTool('frame:timber');
      for (const aimK of [k + off, k + off + 1, k + off + 2]) { lookEast(cellX(i + 14) - 1.4, cellZ(aimK) + 0.1, -0.2); const pl = await plan(); if (!pl.ok) bad.push(`dug@${off} aim@${aimK - k}: ${pl.why}`); }
    }
    return bad.length === 0 || bad.slice(0, 3).join(' | ');
  });
  await T('mining.frame-in-a-tight-tunnel-says-how-much-to-dig', async () => {
    fresh(up); const { i, k } = spot(); dig(i, k, 22, 2, 3, false); craft('frame:timber'); selectTool('frame:timber'); lookEast(cellX(i + 14) - 1.4, cellZ(k) + 0.3, -0.2); const pl = await plan();
    return (!pl.ok && /dig out \d+ more plush/.test(pl.why) && !pl.ent.snap) || 'plan ' + JSON.stringify([pl.ok, pl.why]);
  });
  await T('mining.support-ghost-shows-reach-sphere', async () => {
    fresh(up); const { i, k } = spot(); dig(i, k - 1, 22, 4, 4, false); craft('frame:steel'); selectTool('frame:steel'); lookEast(cellX(i + 14) - 1.4, cellZ(k) + 0.3, -0.2); await plan();
    const ghost = ctx.g.machines.ghost; let found = null; ghost && ghost.traverse((o) => { if (o.name === 'reach' && o.children.length) found = o; });
    const sph = found && found.children.find((c) => c.geometry && c.geometry.parameters && c.geometry.parameters.radius);
    return (sph && Math.abs(sph.geometry.parameters.radius - 3.4) < 1e-6) || 'no reach sphere of radius 3.4 on the steel frame ghost';
  });
}
