export default async function (ctx) {
  const { T, g, S, w, p, fresh, stepSim, toI, toK, cellX, cellZ } = ctx;
  const high = () => { const k = toK(0) + 10; let d0 = 0; for (let d = 30; d < 90; d++) if (w().topAt(toI(0) + d, k) >= 36) { d0 = d; break; } const i = toI(0) + d0 + 4, t = w().topAt(i, k); p().pos.set(cellX(i), 25, cellZ(k)); p().footCell = { i, j: t - 1, k }; p().onGround = true; p().vel.set(0, 0, 0); return { i, k, t }; };
  const withRandom = (v, fn) => { const o = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = o; } };
  await T('slides.climbing-high-hurts-drops-plush-and-starts-a-real-slide', async () => {
    fresh({}); high(); S().carry = []; for (let q = 0; q < 6; q++) S().carry.push({ sp: 2, vr: 0 }); g.hp = 100; const big0 = S().stats.bigSlides || 0;
    withRandom(0, () => { g._climbT = 5; g.climbRisk(0.1); });
    if (!(g.hp < 100)) return 'no damage from the pile giving way'; if (S().carry.length !== 3) return 'carried plush kept: ' + S().carry.length; if (!(Math.hypot(p().vel.x, p().vel.z) > 3)) return 'not shoved down the slope';
    stepSim(8); return ((S().stats.bigSlides || 0) > big0) || 'no real slide (a dozen plush or more) followed';
  });
  await T('slides.climbing-gear-lowers-the-odds', async () => {
    const tries = (up) => { fresh(up); high(); let hits = 0; for (let n = 0; n < 40; n++) { high(); g.hp = 100; withRandom(0.3, () => { g._climbT = 5; g.climbRisk(0.1); }); if (g.hp < 100) hits++; } return hits; };
    const a = tries({}), b = tries({ climb: 3 }); return (a > 0 && b === 0) || `odds at 25 m: no gear ${a}/40, gear 3 ${b}/40 (roll 0.3 should fall at 0.42 and miss at 0.1)`;
  });
  await T('slides.low-ground-is-safe-from-climb-risk', async () => { fresh({}); high(); p().pos.y = 4; g.hp = 100; withRandom(0, () => { g._climbT = 5; g.climbRisk(0.1); }); return g.hp === 100 || 'hurt on low ground'; });
  await T('slides.a-stray-plush-is-not-a-rockslide', async () => { fresh({}); S().stats.bigSlides = 0; S().stats.slides = 0; g.slide.burstN = 0; const { i, k, t } = high(); g.slide.topple(i, t - 1, k, 1, 0, 0.3, 1); return (S().stats.bigSlides || 0) === 0 || 'one plush counted as a rockslide'; });
}
