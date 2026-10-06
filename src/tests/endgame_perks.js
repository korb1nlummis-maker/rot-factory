import { UPGRADES } from '../upgrades.js';
export default async function (ctx) {
  const { T, g, S, fresh } = ctx;
  const ids = ['midas', 'exchange', 'titanGrip', 'longArm', 'fusion', 'rigSwarm', 'mechLegion', 'borerLegion', 'overdrive'];
  const base = () => { fresh({}); return g.tune(); };
  await T('endgame.perks-exist-cost-millions-and-need-the-old-maxes', async () => {
    const bad = [];
    for (const id of ids) {
      const u = UPGRADES.find((x) => x.id === id); if (!u) { bad.push('missing ' + id); continue; }
      if (u.cost[0] < 1e6) bad.push(id + ' first level under 1M');
      for (let n = 1; n < u.cost.length; n++) if (u.cost[n] <= u.cost[n - 1]) bad.push(id + ' cost not rising');
      if (u.cost.length !== u.max) bad.push(id + ' cost/max mismatch');
      const pre = UPGRADES.find((x) => x.id === u.req.id); if (!pre || u.req.lvl !== pre.max) bad.push(id + ' req ' + u.req.id + ' ' + u.req.lvl + ' not the top level');
    }
    return bad.length === 0 || bad.join('; ');
  });
  await T('endgame.every-level-changes-the-numbers-the-right-way', async () => {
    const b = base(); const bad = [];
    const eff = { midas: (t) => t.sellMult, exchange: (t) => t.dexBonus || 0, titanGrip: (t) => -t.grabTime, longArm: (t) => t.reach, fusion: (t) => t.genOutput, rigSwarm: (t) => t.rigMax, mechLegion: (t) => t.mechMax, borerLegion: (t) => t.borerMax, overdrive: (t) => t.beltSpeed };
    for (const id of ids) {
      let prev = eff[id](b); const u = UPGRADES.find((x) => x.id === id);
      for (let l = 1; l <= u.max; l++) { fresh({ [id]: l }); const t = g.tune(); const v = eff[id](t); if (!(v > prev)) bad.push(`${id} lvl ${l}: ${v} not above ${prev}`); prev = v; }
    }
    return bad.length === 0 || bad.join('; ');
  });
  await T('endgame.buying-spends-the-money-and-respects-the-requirement', async () => {
    fresh({}); S().money = 1e9; const u = UPGRADES.find((x) => x.id === 'midas');
    const blocked = !g.canBuy || true; const before = S().money; g.buy('midas'); const noReq = (S().up.midas || 0) === 0;
    fresh({ haggle: 10 }); S().money = 1e9; g.buy('midas'); const lvl = S().up.midas || 0; const spent = 1e9 - S().money;
    return (noReq && lvl === 1 && spent === u.cost[0]) || `without prerequisite bought ${!noReq}, with it level ${lvl}, spent ${spent} vs ${u.cost[0]}`;
  });
  await T('endgame.frame-tiers-start-at-20-million-for-concrete-and-keep-climbing', async () => {
    const order = ['steel', 'concrete', 'rebar', 'titan', 'carbon', 'plasma', 'voidl', 'neutron', 'horizon']; const c = order.map((id) => UPGRADES.find((u) => u.id === id).cost[0]);
    const bad = []; if (c[1] !== 20e6) bad.push('concrete costs ' + c[1]); for (let n = 1; n < c.length; n++) if (c[n] < c[n - 1] * 4) bad.push(order[n] + ' is not at least 4x ' + order[n - 1]);
    fresh({}); S().money = 25e6; g.buy('concrete'); if ((S().up.concrete || 0) !== 0) bad.push('bought concrete without steel');
    return bad.length === 0 || bad.join('; ');
  });
}
