export default async function (ctx) {
  const { T, g, S, w, p, fresh, newWorld, adv, toI, toK, toJ, cellX, cellY, cellZ, species, UPGRADES } = ctx;
  const VEIN_T = 0.8;
  await T('veins.rare-plush-gather-in-veins-at-every-depth', async () => {
    await newWorld(); const bad = [];
    for (const d of [60, 500, 1500, 2700]) {
      let v = 0, rv = 0, o = 0, ro = 0; const i0 = toI(d), k0 = toK(0);
      for (let a = 0; a < 90; a += 2) for (let b = -60; b < 60; b += 2) for (let j = 2; j < 30; j += 3) { const i = i0 + a, k = k0 + b; if (!w().solid(i, j, k)) continue; const rare = (species[w().get(i, j, k)] || { rarity: 0 }).rarity >= 2; if (w().veinAt(i, j, k) > VEIN_T) { v++; if (rare) rv++; } else { o++; if (rare) ro++; } }
      if (v < 200) bad.push(`${d} m: only ${v} vein cells`); else if (!((rv / v) > 3 * (ro / o))) bad.push(`${d} m: vein ${(rv / v).toFixed(2)} vs rest ${(ro / o).toFixed(2)}`);
    }
    return bad.length === 0 || bad.join(' | ');
  });
  await T('veins.are-the-same-after-the-chunk-is-forgotten-and-regenerated', async () => {
    await newWorld(); const i = toI(300), k = toK(5), j = 8; const before = []; for (let a = 0; a < 20; a++) before.push(w().get(i + a, j, k)); w().evict(toI(0), toK(0), 2); for (let n = 0; n < 5; n++) w().evict(toI(0), toK(0), 2);
    const after = []; for (let a = 0; a < 20; a++) after.push(w().get(i + a, j, k)); return before.join() === after.join() || 'cells changed after regenerating';
  });
  await T('veins.nearest-vein-is-really-a-vein-and-really-nearest', async () => {
    await newWorld(); const bad = [];
    for (const [x, z] of [[80, 5], [500, 40], [1300, -30], [2100, 10]]) {
      const y = 6; const r = w().nearestVein(x, y, z, 150); if (!r) { bad.push(`${x}: none within 150 m`); continue; }
      if (!(w().veinAt(toI(r.x), toJ(r.y), toK(r.z)) > VEIN_T)) bad.push(`${x}: not a vein`);
      // nothing at the same height is clearly closer (the search samples every 3 cells, so allow that much)
      const cj = toJ(y); let closer = 1e9; for (let dk = -150; dk <= 150; dk += 2) for (let di = -150; di <= 150; di += 2) { const i = toI(x) + di, k = toK(z) + dk; if (w().inside(i, cj, k) && w().veinAt(i, cj, k) > VEIN_T) closer = Math.min(closer, Math.hypot(di, dk) * 0.6); }
      if (r.d > closer + 3.6 + 0.01 && r.d > 2) bad.push(`${x}: reported ${r.d.toFixed(1)} m but one is ${closer.toFixed(1)} m away`);
    }
    return bad.length === 0 || bad.join(' | ');
  });
  await T('veins.assay-levels-1-2-3-show-meter-pointer-and-height', async () => {
    fresh({}); await newWorld(); fresh({}); S().money = 1e12; if (UPGRADES.find((u) => u.id === 'assay').max !== 3) return 'assay should have 3 levels';
    const show = (lvl) => { S().up.assay = lvl; g.T = g.tune(); p().pos.set(300, 0, 5); g._veinNext = 0; g.time += 2; adv(0.3); const d = g.ui.dials.read('vein'); return { meter: d.on, ptr: d.on && d.rot !== null, txt: d.val }; };
    const l0 = show(0), l1 = show(1), l2 = show(2), l3 = show(3);
    if (l0.meter) return 'meter without the upgrade'; if (!l1.meter || l1.ptr) return 'level 1 should be the meter only ' + JSON.stringify(l1); if (!l2.ptr || !/ m$|no vein/.test(l2.txt)) return 'level 2 needs the pointer ' + JSON.stringify(l2);
    if (g.T.assayRange !== 150) return 'level 3 range ' + g.T.assayRange; return true;
  });
  await T('veins.assay-pointer-points-at-the-vein', async () => {
    fresh({}); await newWorld(); fresh({ assay: 2 }); g.T = g.tune(); p().pos.set(300, 0, 5); p().vel.set(0, 0, 0); g._veinNext = 0; g.time += 2; adv(0.2); const v = g._vein; if (!v) return 'no vein found near 300 m';
    g._veinNext = 1e12; p().vel.set(0, 0, 0); p().yaw = Math.atan2(v.x - p().pos.x, v.z - p().pos.z); adv(0.02); p().yaw = Math.atan2(v.x - p().pos.x, v.z - p().pos.z); adv(0.0501); const a = document.querySelector('#dial-vein .ar').style.transform; const deg = parseFloat(/rotate\((-?[\d.]+)deg/.exec(a)[1]);
    return (Math.abs(((deg + 90 + 540) % 360) - 180) < 12) || 'arrow rotation ' + deg + ' when facing the vein (expect -90, up)';
  });
}
