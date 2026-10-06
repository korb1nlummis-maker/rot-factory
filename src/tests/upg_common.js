// Shared helpers for the upgrade audit tests (upg_hands.js, upg_move.js, upg_light.js, upg_sense.js).
// No default export on purpose: the self test only runs files that export a default function.
import { fmt } from '../util.js';

// data sanity + the real purchase path for one upgrade, level by level
export async function purchaseTests(ctx, id, cat) {
  const { g, S, T, fresh, UPGRADES, computeTuning, effLevels } = ctx;
  const u = UPGRADES.find((x) => x.id === id);
  const reqUp = () => (u.req ? { [u.req.id]: u.req.lvl } : {});
  const name = `upg.${cat}.${id}`;
  await T(name + '.data', async () => {
      if (!u) return 'no such upgrade';
      if (u.cat !== cat) return 'category ' + u.cat;
      if (u.cost.length !== u.max) return `cost has ${u.cost.length} entries for max ${u.max}`;
      for (let i = 0; i < u.cost.length; i++) {
        if (!(u.cost[i] > 0) || u.cost[i] !== Math.round(u.cost[i])) return 'bad cost at ' + i + ': ' + u.cost[i];
        if (i && !(u.cost[i] > u.cost[i - 1])) return `cost not increasing at level ${i + 1}: ${u.cost[i - 1]} -> ${u.cost[i]}`;
      }
      if (u.req) { const r = UPGRADES.find((x) => x.id === u.req.id); if (!r || u.req.lvl > r.max) return 'bad req'; }
      if (!u.desc || /undefined/.test(u.desc)) return 'bad desc';
      return true;
    });
  await T(name + '.buy', async () => {
      fresh(reqUp());
      for (let l = 0; l < u.max; l++) {
        const cost = u.cost[l];
        S().money = cost - 1; const m0 = S().money;
        if (g.buy(id)) return `bought level ${l + 1} with ${m0} < ${cost}`;
        if (S().money !== m0 || (S().up[id] || 0) !== l) return 'failed buy changed state at level ' + (l + 1);
        S().money = cost + 7;
        if (!g.buy(id)) return `could not buy level ${l + 1} for ${cost}`;
        if (S().money !== 7) return `level ${l + 1} charged ${cost + 7 - S().money}, cost array says ${cost}`;
        if (S().up[id] !== l + 1) return `level is ${S().up[id]} after buying ${l + 1}`;
        const ref = computeTuning(effLevels(S()), S().boosts);
        if (JSON.stringify(g.T) !== JSON.stringify(ref)) return `tuning not refreshed on purchase of level ${l + 1}`;
      }
      S().money = 1e12; if (g.buy(id)) return 'bought past max';
      return (S().money === 1e12 && S().up[id] === u.max) || 'state changed after max';
    });
  await T(name + '.gate', async () => {
      if (!u.req) return true;
      fresh({}); S().money = 1e12;
      if (g.buy(id)) return 'bought without ' + u.req.id;
      if (u.req.lvl > 1) { fresh({ [u.req.id]: u.req.lvl - 1 }); S().money = 1e12; if (g.buy(id)) return 'bought with ' + u.req.id + ' one level short'; }
      fresh(reqUp()); S().money = 1e12; return g.buy(id) || 'refused although requirement met';
    });
  await T(name + '.terminal', async () => {
      fresh(reqUp());
      for (let l = 0; l < u.max; l++) {
        S().money = u.cost[l] + 1; g.ui.shopCat = u.cat; g.ui.renderShop();
        const card = [...document.querySelectorAll('#shopGrid .card')].find((c) => c.querySelector('h3 span').textContent === u.name);
        if (!card) return 'no card in terminal';
        const btn = card.querySelector('button');
        if (btn.disabled) return 'terminal button disabled at level ' + (l + 1);
        if (!btn.textContent.includes(fmt(u.cost[l]))) return `terminal shows "${btn.textContent.trim()}", expected ${fmt(u.cost[l])}`;
        if (card.querySelectorAll('.pips i.on').length !== l) return 'pips wrong';
        const m0 = S().money; btn.click();
        if (S().money !== m0 - u.cost[l] || S().up[id] !== l + 1) return 'terminal click charged ' + (m0 - S().money);
      }
      g.ui.renderShop();
      const card = [...document.querySelectorAll('#shopGrid .card')].find((c) => c.querySelector('h3 span').textContent === u.name);
      return (card && /MAXED/.test(card.querySelector('button').textContent)) || 'not MAXED at the end';
    });
}
