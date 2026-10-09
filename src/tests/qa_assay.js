// Adversarial QA of Vein Assay, Structural Survey, climb risk and slide counting.
export default async function (ctx) {
  const { T, g, S, w, p, fresh, adv, stepSim, tune, toI, toK, cellX, cellY, cellZ, cfg } = ctx;
  const VEIN_T = 0.8;
  const el = (id) => document.getElementById(id);
  const rd = (id) => g.ui.dials.read(id), dialEl = (id) => document.getElementById('dial-' + id);
  const withRandom = (v, fn) => { const o = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = o; } };
  const high = () => { const k = toK(0) + 10; let d0 = 0; for (let d = 30; d < 90; d++) if (w().topAt(toI(0) + d, k) >= 36) { d0 = d; break; } const i = toI(0) + d0 + 4, t = w().topAt(i, k); p().pos.set(cellX(i), 25, cellZ(k)); p().footCell = { i, j: t - 1, k }; p().onGround = true; p().vel.set(0, 0, 0); return { i, k, t }; };

  await T('qa.assay.nearest-vein-is-a-real-vein-in-range-and-nothing-closer-was-missed', async () => {
    fresh({}); const bad = []; let found = 0;
    for (const [x, y, z, R] of [[0, 8, 0, 60], [0, 8, 0, 150], [200, 12, -40, 60], [-30, 1, 300, 150], [900, 20, 100, 150], [-2900, 5, 2900, 150], [2990, 30, -2990, 150]]) {
      const v = w().nearestVein(x, y, z, R); if (!v) continue; found++;
      const i = cfg.toI(v.x), j = cfg.toJ(v.y), k = cfg.toK(v.z);
      if (!(w().veinAt(i, j, k) > VEIN_T)) bad.push(`not a vein at ${x},${z}`); if (!(j < w().baseTop(i, k))) bad.push(`the vein reported near ${x},${z} hangs in open air (cell height ${j}, pile top ${w().baseTop(i, k)})`); if (v.d > R + 8) bad.push(`vein ${v.d.toFixed(0)} m away outside range ${R}`);
      // brute force the same coarse grid: nothing meaningfully closer
      const ci = cfg.toI(x), ck = cfg.toK(z), cj = cfg.toJ(y); let bestD = 1e9; const RC = Math.ceil(R / 0.6);
      for (const dj of [0, -8, 8, -16, 16, -32]) { const jj = cj + dj; if (jj < 1 || jj > cfg.NY - 2) continue; for (let dk = -RC; dk <= RC; dk += 3) for (let di = -RC; di <= RC; di += 3) { if (di * di + dk * dk > RC * RC) continue; const a = ci + di, b = ck + dk; if (!w().inside(a, jj, b)) continue; if (w().veinAt(a, jj, b) > VEIN_T && jj < w().baseTop(a, b)) bestD = Math.min(bestD, Math.hypot(cfg.cellX(a) - x, cfg.cellY(jj) - y, cfg.cellZ(b) - z)); } }
      if (bestD < v.d - 3.5) bad.push(`a vein ${bestD.toFixed(1)} m away exists but ${v.d.toFixed(1)} m was reported`);
    }
    for (const [x, y, z] of [[0, -50, 0], [0, 5000, 0], [NaN, 3, 0], [1e9, 3, 1e9], [-1e9, 3, 0]]) { let v; try { v = w().nearestVein(x, y, z, 60); } catch (e) { bad.push(`threw for ${x},${y},${z}: ${e.message}`); continue; } if (v && !(Number.isFinite(v.x + v.y + v.z + v.d))) bad.push('non finite result'); }
    return (found >= 2 && bad.length === 0) || `veins found ${found}; ${bad.join('; ')}`;
  });

  await T('qa.assay.the-long-range-search-is-cheap-enough-to-run-every-second', async () => {
    fresh({}); w().nearestVein(0, 8, 0, 150); const ms = []; for (const [x, z] of [[0, 0], [400, 100], [-700, 300], [1500, -900], [2400, 200]]) { const a = performance.now(); w().nearestVein(x, 8, z, 150); ms.push(performance.now() - a); }
    const mx = Math.max(...ms); return mx < 40 || `a 150 m assay search takes up to ${mx.toFixed(1)} ms (${ms.map((v) => v.toFixed(1))}), run once a second`;
  });

  await T('qa.assay.pointer-turns-the-right-way-and-reads-the-distance', async () => {
    fresh({ assay: 3 }); tune({ assay: 3 }); g.T.assayRange = 150; const v0 = w().nearestVein(300, 20, 0, 150); if (!v0) return 'no vein near the test spot in this world (not a failure of the game)';
    const aim = (face) => { p().pos.set(v0.x - 25, v0.y - 1, v0.z); g.T.assayRange = 150; p().vel.set(0, 0, 0); p().yaw = face; g._veinNext = 0; g.hudT = 0; g.updateHud(0.016); return { rel: +/rotate\((-?[\d.]+)deg\)/.exec(dialEl('vein').querySelector('.ar').style.transform)[1], txt: rd('vein').val }; };
    aim(0); const vn = g._vein; if (!vn) return 'the game found no vein to point at'; const toward = Math.atan2(vn.x - p().pos.x, vn.z - p().pos.z);
    const ahead = aim(toward), left = aim(toward - Math.PI / 2), right = aim(toward + Math.PI / 2), behind = aim(toward + Math.PI);   // the player's right hand is yaw - 90 degrees: facing toward + 90 puts the vein on the right
    const near = (a, b) => Math.abs(((a - b + 540) % 360) - 180) < 4;
    if (!near(ahead.rel, -90)) return 'ahead should point up (-90), got ' + ahead.rel; if (!near(right.rel, 0)) return 'vein on the right should point right (0), got ' + right.rel; if (!near(left.rel, 180)) return 'vein on the left should point left (180), got ' + left.rel; if (!near(behind.rel, 90)) return 'behind should point down (90), got ' + behind.rel;
    if (!/^\d+ m/.test(ahead.txt)) return 'distance text: ' + ahead.txt;
    g.T.assayRange = 0.5; g._veinNext = 0; g.hudT = 0; g.updateHud(0.016); return /no vein in range/.test(rd('vein').val) || 'out of range still points somewhere: ' + rd('vein').val;
  });

  await T('qa.assay.meter-reads-higher-in-a-vein-than-in-barren-pile-and-hides-without-the-upgrade', async () => {
    fresh({ assay: 1 }); tune({ assay: 1 }); const v0 = w().nearestVein(300, 20, 0, 150); if (!v0) return 'no vein near the test spot in this world';
    const bar = (x, y, z) => { p().pos.set(x, y, z); g.hudT = 0; g.updateHud(0.016); return rd('vein').frac; };
    // a barren spot: nowhere around it does the vein noise get high
    let bare = null; const ci = cfg.toI(v0.x), ck = cfg.toK(v0.z), cj = cfg.toJ(v0.y);
    for (let d = 20; d < 400 && !bare; d += 6) { let m = 0; for (const [a, b, c] of [[0, 0, 0], [4, 0, 0], [-4, 0, 0], [0, 0, 4], [0, 0, -4], [0, 3, 0]]) m = Math.max(m, w().veinAt(ci + d + a, cj + b, ck + c)); if (m < 0.45) bare = { x: cfg.cellX(ci + d), z: cfg.cellZ(ck) }; }
    if (!bare) return 'no barren spot found near the test vein';
    const inVein = bar(v0.x, v0.y, v0.z), away = bar(bare.x, v0.y, bare.z); if (!(inVein > away + 0.2)) return `meter in the vein ${inVein} vs barren pile ${away}`;
    fresh({}); tune({}); g.hudT = 0; g.updateHud(0.016); return !rd('vein').on || 'assay readout shows without the upgrade';
  });

  await T('qa.survey.colours-and-wording-follow-the-load', async () => {
    fresh({ survey: 1 }); tune({ survey: 1 }); const { i, k, t } = high(); p().pos.set(cellX(i), 0.2, cellZ(k)); const bad = [];
    const sup = { id: 'qa-s', x: p().pos.x + 1, y: 1.2, z: p().pos.z, r: 3.4, kind: 'steel', cap: 1 }; w().supports.push(sup); const base = ctx.loadOn(w(), sup); sup.cap = base > 0 ? base / 0.5 : 1;
    const read = (ratio) => { sup.cap = base > 0 ? base / ratio : 1e9; g._svNext = 0; g.updateSurvey(); return { txt: rd('support').info.load, cls: ({ crit: 'red', warn: 'amber' })[rd('support').state] || '' }; };
    if (base > 0) { const a = read(0.5), b = read(0.9), c = read(0.99); if (a.cls !== '' || !/50%/.test(a.txt)) bad.push('50% -> ' + JSON.stringify(a)); if (b.cls !== 'amber') bad.push('90% -> ' + JSON.stringify(b)); if (c.cls !== 'red') bad.push('99% -> ' + JSON.stringify(c)); }
    sup.cap = Infinity; g._svNext = 0; g.updateSurvey(); if (/NaN|Infinity/.test(rd('support').info.load + rd('support').val)) bad.push('infinite capacity shows ' + rd('support').info.load);
    w().supports = w().supports.filter((s) => s !== sup); p().pos.set(cellX(i + 400), 0.2, cellZ(k)); g._svNext = 0; g.updateSurvey(); if (!/no support within 8 m/.test(rd('support').info.load)) bad.push('far from any support: ' + rd('support').info.load);
    tune({}); g.updateSurvey(); if (['frame', 'support', 'stale'].some((id) => rd(id).on)) bad.push('survey shows without the upgrade');
    return bad.length === 0 || bad.join('; ');
  });

  await T('qa.survey.always-finite-depth-and-pressure-text', async () => {
    fresh({ survey: 1 }); tune({ survey: 1 }); const bad = [];
    for (const [x, y, z] of [[0, 0, 0], [-20, 0, 5], [3000, 0, 0], [-3100, 0, 0], [0, 40, 0], [0, -5, 0], [2990, 0, 2990]]) { p().pos.set(x, y, z); g._svNext = 0; g.updateSurvey(); const t = rd('frame').info.depth + rd('frame').info.press + rd('frame').info.best + rd('frame').sub + rd('frame').val; if (/NaN|Infinity|undefined/.test(t)) bad.push(`${x},${y},${z}: ${t}`); }
    tune({}); return bad.length === 0 || bad.join('; ');
  });

  await T('qa.climb.no-falls-while-passed-out-and-never-nan-damage', async () => {
    fresh({}); high(); g.hp = 100; g.blacking = true; withRandom(0, () => { g._climbT = 5; g.climbRisk(0.1); }); const hurtOut = g.hp < 100; g.blacking = false; g.hp = 100;
    S().carry = []; for (let q = 0; q < 40; q++) S().carry.push({ sp: 2, vr: 0 }); high(); withRandom(0, () => { g._climbT = 5; g.climbRisk(0.1); }); const fin = Number.isFinite(g.hp) && g.hp >= 0;
    return (!hurtOut && fin) || (hurtOut ? 'the pile gave way under a player who was out cold' : 'hp is ' + g.hp);
  });

  await T('qa.climb.a-guest-suffers-the-same-hazard-and-the-host-runs-the-soft-slide', async () => {
    // (the guest asks the host for a slide: mp_wedge.js)
    fresh({}); high(); p().pos.y = 14; g.hp = 100; const sent = []; const was = g.isGuest, cmd = g.cmd; g.isGuest = () => true; g.cmd = (t, d) => { sent.push([t, d]); }; const tri = g.slide.triggerPatch.bind(g.slide); let localSlide = 0; g.slide.triggerPatch = () => { localSlide++; };
    withRandom(0, () => { g._climbT = 5; g.climbRisk(0.1); }); g.isGuest = was; g.cmd = cmd; g.slide.triggerPatch = tri;
    return (g.hp === 100 && sent.some((m) => m[0] === 'sslide') && !sent.some((m) => m[0] === 'patch') && localSlide === 0 && !g.wedge.cur) || `guest hp ${g.hp}, commands ${JSON.stringify(sent.map((m) => m[0]))}, local slides ${localSlide}`;   // (nothing hits the guest; it asks the host for a soft slide with sslide, softslide.js)
  });

  await T('qa.slides.a-giant-slide-counts-once-per-cooldown-not-once-per-plush', async () => {
    fresh({}); S().stats.bigSlides = 0; g.slide.burstN = 0; g.slide.burstCool = 0; const { i, k, t } = high();
    for (let n = 0; n < 400; n++) g.slide.topple(i + (n % 6), t - 1, k + ((n / 6) | 0) % 6, 1, 0, 0.4, 1);
    const counted = S().stats.bigSlides || 0; const cap = g.slide.burstN; g.slide.burstCool = 0; g.slide.topple(i, t - 1, k, 1, 0, 0.3, 1); const lone = (S().stats.bigSlides || 0) - counted;
    return (counted >= 1 && counted <= 40 && cap <= 24 && lone === 0) || `400 topples counted ${counted}, burst counter ${cap}, then a lone stray plush counted ${lone}`;
  });
}
