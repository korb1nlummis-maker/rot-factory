export default async function (ctx) {
  const { T, g, w, fresh, newWorld, FRAME_TYPES, capacityOf, loadOn, cellX, cellZ, toI, toK } = ctx;
  await T('mining.depth-rating-text-is-true-for-every-tier', async () => {
    await newWorld(); fresh({}); const bad = []; let row = 0;
    for (const [kind, f] of Object.entries(FRAME_TYPES)) {
      if (!isFinite(f.maxDepth) || f.maxDepth * 1.2 > 2800) continue;
      const at = {};
      for (const mult of [0.8, 1.0, 1.2]) {
        const d = f.maxDepth * mult, i = toI(d), k = toK(40 + (row++) * 12), len = Math.round(2 * f.radius / 0.6);
        for (let a = 0; a < len; a++) for (let b = 0; b < 4; b++) for (let j = 0; j < 4; j++) w().removeCell(i + a, j, k + b, false);
        const s = { x: cellX(i + len / 2), y: 1.2, z: cellZ(k + 2), r: f.radius, kind, cap: capacityOf(kind) }; at[mult] = loadOn(w(), s) / s.cap;
      }
      if (!(at[1.0] > 0.93 && at[1.0] < 1.07)) bad.push(`${kind}: ${(at[1.0] * 100).toFixed(0)}% at its rating`);
      if (!(at[0.8] < 1)) bad.push(`${kind}: ${(at[0.8] * 100).toFixed(0)}% already at 80% of its rating`);
      if (!(at[1.2] > 1)) bad.push(`${kind}: only ${(at[1.2] * 100).toFixed(0)}% at 120% of its rating (it should have buckled)`);
    }
    return bad.length === 0 || bad.join(' | ');
  });
  await T('survival.buying-the-air-tank-while-buried-adds-air-now', async () => {
    fresh({}); g.trapOn = true; g.airLeft = 20; g.S.money = 1e9; const before = g.airLeft; const ok = g.buy('airtank'); const after = g.airLeft; g.trapOn = false; g.airLeft = undefined;
    return (ok && after === before + 30) || `bought ${ok}, air ${before} -> ${after}`;
  });
}
