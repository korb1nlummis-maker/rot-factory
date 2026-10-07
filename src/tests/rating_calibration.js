export default async function (ctx) {
  const { T, g, w, fresh, newWorld, FRAME_TYPES, capacityOf, loadOn, cellX, cellZ, toI, toK } = ctx;
  // dig the standard tunnel at (i, k): 4 wide, 4 high, len long. The old workings and caves scattered through the pile (different in every world) would add roof
  // area to the measurement, so a lane with a hollow near it is skipped for the next lane over.
  const carveClean = (i, k0, len, rc) => {
    for (let t = 0; t < 14; t++) {
      const k = k0 + t * (2 * rc + 6);   // the failed lane's tunnel is a hollow too: step clear of it
      for (let a = 0; a < len; a++) for (let b = 0; b < 4; b++) for (let j = 0; j < 4; j++) w().removeCell(i + a, j, k + b, false);
      let odd = 0; for (let a = -rc; a < len + rc; a++) for (let b = -rc; b < 4 + rc; b++) for (let j = 0; j < 12; j++) { const inT = a >= 0 && a < len && b >= 0 && b < 4 && j < 4, v = w().get(i + a, j, k + b); if (inT ? v : !v) odd++; }
      if (!odd) return k;
    }
    return k0;
  };
  await T('mining.depth-rating-text-is-true-for-every-tier', async () => {
    await newWorld(); fresh({}); const bad = []; let row = 0;
    for (const [kind, f] of Object.entries(FRAME_TYPES)) {
      if (!isFinite(f.maxDepth) || f.maxDepth * 1.2 > 2800) continue;
      const at = {};
      for (const mult of [0.8, 1.0, 1.2]) {
        // a real 4x4x4 cube in the middle of a standard 4 wide, 4 high tunnel that is longer than its reach: the support sits at the cube's centre
        const d = f.maxDepth * mult, i = toI(d), len = 2 * Math.ceil(f.radius / 0.6) + 4, k = carveClean(i, toK(40 + (row++) * 12), len, Math.ceil(f.radius / 0.6) + 2);
        const e = g.machines.frameEnt('x', kind, i + len / 2 - 2, k, 0); const s = { x: e.cx, y: e.y0 + e.h / 2, z: e.cz, r: f.radius, kind, cap: capacityOf(kind) }; at[mult] = loadOn(w(), s) / s.cap;
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
