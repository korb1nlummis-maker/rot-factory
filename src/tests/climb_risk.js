export default async function (ctx) {
  const { T, g, S, w, p, fresh, stepSim, toI, toK, cellX, cellZ } = ctx;
  const high = () => { const k = toK(0) + 10; let d0 = 0; for (let d = 30; d < 90; d++) if (w().topAt(toI(0) + d, k) >= 36) { d0 = d; break; } const i = toI(0) + d0 + 4, t = w().topAt(i, k); p().pos.set(cellX(i), 25, cellZ(k)); p().footCell = { i, j: t - 1, k }; p().onGround = true; p().vel.set(0, 0, 0); return { i, k, t }; };
  const withRandom = (v, fn) => { const o = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = o; } };
  await T('slides.climbing-high-carries-you-down-with-a-slide-drops-some-plush-and-never-hurts', async () => {
    fresh({}); high(); p().pos.y = 14;   // (the footing gives way as a slide, wedge.js: the plush flow out from under you and carry you, nothing hits you)
    S().carry = []; for (let q = 0; q < 6; q++) S().carry.push({ sp: 2, vr: 0 }); g.hp = 100; const big0 = S().stats.bigSlides || 0;
    withRandom(0, () => { g._climbT = 5; g.climbRisk(0.1); });
    const a = g.wedge.cur; if (!a) return 'no slide started';
    if (g.hp < 100) return 'hit at the start: ' + (100 - g.hp); if (!(S().carry.length < 6 && S().carry.length >= 3)) return 'carried plush ' + S().carry.length + ' of 6 (a fifth to a half falls out of your hands)';
    const h0 = g.hp, orig = g.hurtPlayer, hits = []; g.hurtPlayer = function (n, why) { const h = g.hp; orig.call(g, n, why); hits.push([why, h - g.hp]); };
    try { stepSim(14); } finally { g.hurtPlayer = orig; }
    if (hits.some(([why, d]) => d > 0 && why !== 'fell too far')) return 'the slide hurt: ' + JSON.stringify(hits); if (!(h0 - g.hp <= 6)) return 'lost ' + (h0 - g.hp) + ' hp';
    return ((S().stats.bigSlides || 0) > big0) || 'no real slide (a dozen plush or more) followed';
  });
  await T('slides.climbing-gear-lowers-the-odds', async () => {
    const tries = (up) => { fresh(up); high(); let hits = 0; for (let n = 0; n < 40; n++) { high(); g.hp = 100; g.wedge.clear(); const f0 = S().stats.climbFalls || 0; withRandom(0.3, () => { g._climbT = 5; g.climbRisk(0.1); }); if ((S().stats.climbFalls || 0) > f0) hits++; } g.wedge.clear(); return hits; };   // a hit is a fall (a small patch or a slab)
    const a = tries({}), b = tries({ climb: 3 }); return (a > 0 && b === 0) || `odds at 25 m: no gear ${a}/40, gear 3 ${b}/40 (roll 0.3 should fall at 0.42 and miss at 0.1)`;
  });
  await T('slides.low-ground-is-safe-from-climb-risk', async () => { fresh({}); high(); p().pos.y = 4; g.hp = 100; withRandom(0, () => { g._climbT = 5; g.climbRisk(0.1); }); return g.hp === 100 || 'hurt on low ground'; });
  await T('slides.a-stray-plush-is-not-a-rockslide', async () => { fresh({}); S().stats.bigSlides = 0; S().stats.slides = 0; g.slide.burstN = 0; const { i, k, t } = high(); g.slide.topple(i, t - 1, k, 1, 0, 0.3, 1); return (S().stats.bigSlides || 0) === 0 || 'one plush counted as a rockslide'; });
}
