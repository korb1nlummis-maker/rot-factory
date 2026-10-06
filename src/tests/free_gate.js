export default async function (ctx) {
  const { T, g, S, cellX, cellZ, newWorld } = ctx;
  await T('boot.free-gate-is-close-but-clear-of-the-bin', async () => {
    await newWorld(); const e = S().entities.find((x) => x.free && x.detector); if (!e) return 'no free gate';
    const x = cellX(e.i), z = cellZ(e.k), bp = g.hall.binPos, st = g.player.pos;
    const dBin = Math.hypot(x - bp.x, z - bp.z), dStart = Math.hypot(x - 0, z + 1.4);
    return (dStart <= 8 && dBin >= g.gateClearance()) || `gate ${dStart.toFixed(1)} m from the start, ${dBin.toFixed(1)} m from the bin (needs >= ${g.gateClearance().toFixed(1)})`;
  });
}
