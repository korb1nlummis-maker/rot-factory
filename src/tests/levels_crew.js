// Levels audit: Crew. Bot Foundry, Titan Buckets, Overclocked Servos and Fusion Cells, level by level, measured on real bots:
// the roster, a bot's bucket, its dig time and how fast its battery drains.
import { basics, numbers, reqUp } from './levels_common.js';

export default async function (ctx) {
  const { g, S, T, fresh, near, UPGRADES } = ctx;
  const U = (id) => UPGRADES.find((u) => u.id === id);
  for (const id of ['foundry', 'titanBuckets', 'servoOC', 'fusionCells']) await basics(ctx, 'crew', id);

  await numbers(ctx, 'crew', 'foundry', (t) => t.crewMax, (l) => 8 + l);
  await numbers(ctx, 'crew', 'titanBuckets', (t) => t.crewHaul, (l) => 2.6 + 0.4 * l);
  await numbers(ctx, 'crew', 'servoOC', (t) => t.crewSpeed, (l) => 2.2 + 0.2 * l);
  await numbers(ctx, 'crew', 'fusionCells', (t) => t.crewBattery, (l) => 3.4 + 0.6 * l);

  await T('levels.crew.foundry.every-level-adds-a-bunk-the-bench-fills-it-and-the-panel-counts-them', async () => {
    const bad = [];
    for (let l = 0; l <= 6; l++) {
      fresh({ crew: 1, crewSlots: 8, foundry: l }); g.crew.sync(); const want = 9 + l;
      if (g.T.crewMax !== want || S().crew.length !== 1) bad.push(`level ${l}: crewMax ${g.T.crewMax}, ${S().crew.length} bots, expected ${want} bunks and the one bot of the Scrapper Bot upgrade`);
      S().money = 1e15; if (!g.craftItem('bot:scrapper', want - 1) || S().crew.length !== want) bad.push(`level ${l}: the bench made ${S().crew.length} bots, expected ${want}`);
      if (g.craftItem('bot:scrapper', 1) || S().crew.length !== want) bad.push(`level ${l}: a bot was crafted with no free bunk`);
      if (new Set(S().crew.map((b) => b.id)).size !== S().crew.length || new Set(S().crew.map((b) => b.name)).size !== S().crew.length) bad.push(`level ${l}: duplicate bot ids or names`);
      g.ui.renderCrew(); const t = document.getElementById('crewCount').textContent; if (t !== `${want} / ${want} bots`) bad.push(`level ${l}: panel says "${t}"`);
    }
    // buying a level adds a bunk right then and no bot until one is crafted
    fresh({ ...reqUp(UPGRADES, U('foundry')), crew: 1 }); g.crew.sync(); const n0 = S().crew.length, m0 = g.T.crewMax; S().money = U('foundry').cost[0]; S().stats.plush = 1e9; g.buy('foundry');
    if (S().crew.length !== n0 || g.T.crewMax !== m0 + 1) bad.push(`buying: ${n0} -> ${S().crew.length} bots, bunks ${m0} -> ${g.T.crewMax}`);
    S().money = 1e15; g.craftItem('bot:scrapper', 1); if (S().crew.length !== n0 + 1) bad.push(`crafting: ${n0} -> ${S().crew.length} bots`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('levels.crew.titanBuckets.the-bucket-grows-40-percent-of-its-base-per-level', async () => {
    const bad = []; let prev = 0;
    for (let l = 0; l <= 4; l++) {
      fresh({ ...reqUp(UPGRADES, U('titanBuckets')), crew: 1, titanBuckets: l }); g.crew.sync(); const b = S().crew[0];
      for (const lvl of [1, 5, 20]) { b.level = lvl; const want = Math.round((4 + lvl * 2) * (2.6 + 0.4 * l)); if (g.crew.capacity(b) !== want) bad.push(`level ${l}, bot level ${lvl}: carries ${g.crew.capacity(b)}, expected ${want}`); }
      b.level = 1; const cap = g.crew.capacity(b); if (!(cap > prev)) bad.push(`level ${l}: bucket ${cap} not above ${prev}`); prev = cap;
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('levels.crew.servoOC.bots-dig-faster-per-level', async () => {
    const bad = []; let base = 0;
    for (let l = 0; l <= 5; l++) {
      fresh({ ...reqUp(UPGRADES, U('servoOC')), crew: 1, servoOC: l }); g.crew.sync(); const b = S().crew[0]; b.level = 1;
      const t = g.crew.digTime(b, 3, 3); if (l === 0) base = t; else { const want = (2.2 + 0.2 * l) / 2.2; if (!near(base / t, want, 0.002)) bad.push(`level ${l}: dig time x${(base / t).toFixed(3)} faster, expected x${want.toFixed(3)}`); }
      if (l && !(t < base)) bad.push('not faster than level 0');
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('levels.crew.fusionCells.batteries-last-longer-per-level-digging-and-walking', async () => {
    const bad = []; const drain = [];
    for (let l = 0; l <= 4; l++) {
      fresh({ ...reqUp(UPGRADES, U('fusionCells')), crew: 1, fusionCells: l }); g.crew.sync(); const b = S().crew[0];   // (g.time is never set back: a throttle somewhere else in the suite would wait for the old time all over again)
      b.battery = 1; b.state = 'return'; b.path = [[b.x + 800, b.z]]; b.pi = 0; b.scanned = true; const t1 = g.time; for (let n = 0; n < 100; n++) { g.time += 0.05; g.crew.update(0.05, g.time); } const walk = (1 - b.battery) / (g.time - t1);
      b.battery = 1; b.carry = []; b.state = 'farm'; b.timer = 99; const t0 = g.time; for (let n = 0; n < 200; n++) { g.time += 0.05; g.crew.update(0.05, g.time); } const farm = (1 - b.battery) / (g.time - t0);
      drain.push([farm, walk]);
    }
    for (let l = 1; l <= 4; l++) for (const [n, name] of [[0, 'farming'], [1, 'walking']]) { const want = drain[0][n] * 3.4 / (3.4 + 0.6 * l); if (!near(drain[l][n], want, want * 0.08)) bad.push(`level ${l} ${name} drain ${drain[l][n].toFixed(5)}/s, expected ${want.toFixed(5)}`); if (!(drain[l][n] < drain[l - 1][n])) bad.push(`level ${l} ${name} drains no slower than the level before`); }
    return bad.length === 0 || bad.join('; ');
  });
}
