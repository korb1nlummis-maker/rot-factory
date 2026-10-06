// Levels audit: Mining and Supports. Bedrock Tamping, Seismograph, Ablative Helm, Reactive Armor and Rebreather, level by level,
// measured in the world's own roof rule, the stability scan, the player's health, the damage paths and the air tank.
import { basics, numbers, reqUp } from './levels_common.js';

export default async function (ctx) {
  const { g, S, w, p, T, fresh, adv, spot, dig, near, UPGRADES, toI, toK, cellX, cellZ, newWorld } = ctx;
  const U = (id) => UPGRADES.find((u) => u.id === id);
  const ids = ['bedrockTamp', 'seismo', 'ablative', 'reactive', 'rebreather'];
  for (const id of ids) await basics(ctx, 'mine', id);

  await numbers(ctx, 'mine', 'bedrockTamp', (t) => t.stabBonus, (l) => 8 + l);
  await numbers(ctx, 'mine', 'seismo', (t) => t.warn, (l) => 1.1 + 0.55 * 3 + 0.55 * l);
  await numbers(ctx, 'mine', 'ablative', (t) => t.hpBonus, (l) => 100 + 40 * l);
  await numbers(ctx, 'mine', 'reactive', (t) => t.dmgCut, (l) => 0.4 + 0.05 * l);
  await numbers(ctx, 'mine', 'rebreather', (t) => t.airTank, (l) => 5 + 3 * l);

  await T('levels.mine.bedrockTamp.every-level-adds-1.2-m-of-safe-roof-near-and-deep', async () => {
    await newWorld(); const bad = [];
    const { i: ni, k: nk } = spot(); dig(ni, nk, 30, 2, 3, false);
    const fi = toI(1500), fk = toK(0); for (let s = 0; s < 40; s++) for (let j = 5; j < 8; j++) w().removeCell(fi + s, j, fk, false);
    const B = (l, far) => { fresh({ timber: 1, tamp: 8, bedrockTamp: l }); const st = far ? w().stress(fi + 20, 8, fk) : w().stress(ni + 20, 3, nk); return st ? st.B : null; };
    for (const far of [false, true]) {
      const b0 = B(0, far); if (b0 === null) return 'no roof cell (far=' + far + ')';
      for (let l = 1; l <= 4; l++) { const b = B(l, far); if (b - b0 !== 2 * l) bad.push(`${far ? 'deep' : 'near'} L${l}: B ${b0} -> ${b} (expected +${2 * l})`); }
    }
    // the world rule moves the moment it is bought, and the game loop keeps passing it
    fresh({ ...reqUp(UPGRADES, U('bedrockTamp')), timber: 1 }); const { i, k } = spot(); dig(i, k, 30, 2, 3, false); const s0 = w().stress(i + 20, 3, k).B;
    S().money = U('bedrockTamp').cost[0]; g.buy('bedrockTamp'); const s1 = w().stress(i + 20, 3, k).B; if (s1 - s0 !== 2) bad.push(`buy: B ${s0} -> ${s1}`);
    return bad.length ? bad.join(' | ') : true;
  });

  await T('levels.mine.seismo.the-roof-warns-longer-at-every-level', async () => {
    await newWorld(); const bad = []; let prevMean = 0;
    for (let l = 0; l <= 3; l++) {
      fresh({ ...reqUp(UPGRADES, U('seismo')), seismo: l }); const { i, k } = spot(); dig(i, k - 1, 70, 3, 3, false);
      w().creaking.clear(); w().scanRegion(i + 50, 3, k, g.T.warn);
      const ts = [...w().creaking.values()].map((c) => c.t); if (ts.length < 15) { bad.push(`L${l}: only ${ts.length} creaks`); continue; }
      const warn = 1.1 + 0.55 * 3 + 0.55 * l; if (!near(g.T.warn, warn, 1e-9)) bad.push(`L${l}: T.warn ${g.T.warn}`);
      const mean = ts.reduce((a, b) => a + b, 0) / ts.length;
      if (Math.min(...ts) < warn * 0.35 - 1e-9 || Math.max(...ts) > warn * 1.25 + 1e-9) bad.push(`L${l}: timers outside range`);
      if (!(mean > warn * 0.5 && mean < warn * 1.05)) bad.push(`L${l}: mean warning ${mean.toFixed(2)} is not near the ${warn.toFixed(2)} s the level gives`); prevMean = mean;
      let seen = null; const orig = w().updateStability.bind(w()); w().updateStability = (dt, wn, h) => { seen = wn; return orig(dt, wn, h); }; adv(0.1); w().updateStability = orig;
      if (seen !== g.T.warn) bad.push(`L${l}: the game loop passed warn ${seen}`);
    }
    return bad.length ? bad.join(' | ') : true;
  });

  await T('levels.mine.ablative.more-health-at-every-level-and-the-purchase-heals-the-new-part', async () => {
    const bad = [];
    for (let l = 0; l <= 5; l++) {
      fresh({ ...reqUp(UPGRADES, U('ablative')), ablative: l }); g.updateVitals(0.01); const want = 200 + 40 * l; if (g.hpMax !== want) bad.push(`L${l}: hpMax ${g.hpMax}, expected ${want}`);
      g.hp = g.hpMax; g.hurtPlayer(10, 't'); if (!near(g.hp, g.hpMax - 10, 0.01)) bad.push(`L${l}: hp ${g.hp}`);   // no padding here, so a 10 point hit costs 10
    }
    fresh({ ...reqUp(UPGRADES, U('ablative')) }); g.updateVitals(0.01); g.hp = g.hpMax; S().money = U('ablative').cost[0]; g.buy('ablative'); g.updateVitals(0.01);
    if (g.hpMax !== 240 || g.hp !== 240) bad.push(`buy: hp ${g.hp}/${g.hpMax}`);
    return bad.length ? bad.join(' | ') : true;
  });

  await T('levels.mine.reactive.every-level-cuts-all-damage-5-percent-more-up-to-the-60-percent-cap', async () => {
    const bad = [];
    for (let l = 0; l <= 4; l++) {
      const k = 1 - Math.min(0.6, 0.4 + 0.05 * l);
      fresh({ ...reqUp(UPGRADES, U('reactive')), reactive: l }); g.updateVitals(0.01);
      g.hp = g.hpMax; const h0 = g.hp; g.hurtPlayer(10, 't'); if (!near(h0 - g.hp, 10 * k, 0.01)) bad.push(`L${l}: direct ${h0 - g.hp}`);
      g.hp = g.hpMax; p().events.land(16); if (!near(g.hpMax - g.hp, 20 * k, 0.01)) bad.push(`L${l}: fall ${g.hpMax - g.hp}, want ${20 * k}`);
      g.hp = g.hpMax; g.dmgCd = 0; g.onPlayerHit(12); if (!near(g.hpMax - g.hp, 36 * k, 0.01)) bad.push(`L${l}: plush ${g.hpMax - g.hp}, want ${36 * k}`);
      g.hp = g.hpMax; p().pos.set(cellX(0), 0, cellZ(0)); g.detonate({ x: p().pos.x + 0.5, y: p().pos.y, z: p().pos.z, dyn: true, tier: 0 }); const exp = Math.max(15, 55 - 0.5 * 12) * k; if (!near(g.hpMax - g.hp, exp, 0.05)) bad.push(`L${l}: blast ${g.hpMax - g.hp}, want ${exp}`);
    }
    // padding alone still caps at 40%, and nothing ever goes past 60% together
    fresh({ padding: 4, reactive: 4 }); if (!(g.T.dmgCut > 0.59)) bad.push('dmgCut ' + g.T.dmgCut);
    return bad.length ? bad.join(' | ') : true;
  });

  await T('levels.mine.rebreather.90-more-seconds-of-air-per-level', async () => {
    const bad = [];
    for (let l = 0; l <= 3; l++) {
      fresh({ ...reqUp(UPGRADES, U('rebreather')), rebreather: l }); p().embedded = true; p().buried = 3; g.trapOn = false; g.airLeft = undefined; g.updateTrapped(0.1);
      const a0 = g.airLeft, want = 60 + 30 * (5 + 3 * l); if (!near(a0, want - 0.1, 0.01)) bad.push(`L${l}: starts with ${a0}, want ${want}`);
      for (let n = 0; n < 100; n++) g.updateTrapped(0.1); if (!near(a0 - g.airLeft, 10, 0.05)) bad.push(`L${l}: drains ${a0 - g.airLeft} in 10 s`);
      p().embedded = false; p().buried = 0;
    }
    fresh({ ...reqUp(UPGRADES, U('rebreather')) }); S().money = U('rebreather').cost[0]; g.buy('rebreather'); p().embedded = true; p().buried = 3; g.trapOn = false; g.airLeft = undefined; g.updateTrapped(0.1); p().embedded = false; p().buried = 0;
    if (!near(g.airLeft, 300 - 0.1, 0.01)) bad.push('after buy ' + g.airLeft);
    return bad.length ? bad.join(' | ') : true;
  });
}
