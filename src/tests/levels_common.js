// Shared helpers for the levels_*.js audits of the upgrade lines added above the old maxes.
// No default export on purpose: the self test only runs files that export a default function.
import { fmt } from '../util.js';

export const clone = (o) => JSON.parse(JSON.stringify(o));
export const reqUp = (UPGRADES, u) => (u.req ? { [u.req.id]: u.req.lvl } : {});
export const byId = (UPGRADES, id) => UPGRADES.find((x) => x.id === id);

// the data, the real purchase path, the gate and the terminal card for one upgrade, level by level
export async function basics(ctx, cat, id) {
  const { g, S, T, fresh, UPGRADES, computeTuning, effLevels } = ctx;
  const u = UPGRADES.find((x) => x.id === id);
  const name = `levels.${cat}.${id}`;
  await T(name + '.data', async () => {
    if (!u) return 'no such upgrade';
    if (u.cat !== cat) return 'category ' + u.cat;
    if (!u.fresh) return 'not marked as an added line';
    if (u.cost.length !== u.max) return `cost has ${u.cost.length} entries for max ${u.max}`;
    for (let i = 0; i < u.cost.length; i++) {
      if (!(u.cost[i] >= 1e6) || u.cost[i] !== Math.round(u.cost[i])) return 'cost under a million or not whole at ' + i + ': ' + u.cost[i];
      if (i && !(u.cost[i] > u.cost[i - 1])) return `cost not increasing at level ${i + 1}`;
    }
    if (!u.req) return 'an added line must need an old one';
    const r = UPGRADES.find((x) => x.id === u.req.id); if (!r) return 'unknown requirement ' + u.req.id;
    if (u.req.lvl !== r.max) return `requires ${r.id} ${u.req.lvl}, not its top level ${r.max}`;
    if (!u.desc || /undefined|NaN/.test(u.desc) || /[—–]/.test(u.desc)) return 'bad description';
    return true;
  });
  await T(name + '.buy', async () => {
    fresh(reqUp(UPGRADES, u));
    for (let l = 0; l < u.max; l++) {
      const cost = u.cost[l]; S().money = cost - 1; const m0 = S().money;
      if (g.buy(id)) return `bought level ${l + 1} with ${m0} < ${cost}`;
      if (S().money !== m0 || (S().up[id] || 0) !== l) return 'failed buy changed state at level ' + (l + 1);
      S().money = cost + 7;
      if (!g.buy(id)) return `could not buy level ${l + 1} for ${cost}`;
      if (S().money !== 7) return `level ${l + 1} charged ${cost + 7 - S().money}, cost array says ${cost}`;
      if (S().up[id] !== l + 1) return `level is ${S().up[id]} after buying ${l + 1}`;
      if (JSON.stringify(g.T) !== JSON.stringify(computeTuning(effLevels(S()), S().boosts))) return `tuning not refreshed on purchase of level ${l + 1}`;
    }
    S().money = 1e15; if (g.buy(id)) return 'bought past max';
    return (S().money === 1e15 && S().up[id] === u.max) || 'state changed after max';
  });
  await T(name + '.gate', async () => {
    fresh({}); S().money = 1e15; if (g.buy(id)) return 'bought without ' + u.req.id;
    if (u.req.lvl > 1) { fresh({ [u.req.id]: u.req.lvl - 1 }); S().money = 1e15; if (g.buy(id)) return 'bought with ' + u.req.id + ' one level short'; }
    fresh(reqUp(UPGRADES, u)); S().money = 1e15; return g.buy(id) || 'refused although the requirement is met';
  });
  await T(name + '.terminal', async () => {
    fresh(reqUp(UPGRADES, u));
    for (let l = 0; l < u.max; l++) {
      S().money = u.cost[l] + 1; g.ui.shopCat = u.cat; g.ui.renderShop();
      const card = [...document.querySelectorAll('#shopGrid .card')].find((c) => c.querySelector('h3 span').textContent === u.name);
      if (!card) return 'no card in the terminal';
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

// buy the line level by level through g.buy (paying the real price) and return the tuning after each level: [level 0, level 1, ...]
export function ladder(ctx, id, extraUp = {}) {
  const { g, S, fresh, UPGRADES } = ctx; const u = UPGRADES.find((x) => x.id === id);
  fresh({ ...reqUp(UPGRADES, u), ...extraUp }); const out = [clone(g.T)];
  for (let l = 1; l <= u.max; l++) { S().money = u.cost[l - 1]; if (!g.buy(id)) throw new Error(`could not buy ${id} level ${l}`); out.push(clone(g.T)); }
  return out;
}

// every level moves the number the right way and lands exactly where the text says.
// get: the tuning value, want(l, base): what level l must give, better: 'up' or 'down' (which direction is stronger)
export async function numbers(ctx, cat, id, get, want, better = 'up', extraUp = {}) {
  const { T } = ctx;
  await T(`levels.${cat}.${id}.numbers`, async () => {
    const t = ladder(ctx, id, extraUp); const base = get(t[0]); const bad = [];
    for (let l = 1; l < t.length; l++) {
      const v = get(t[l]), w = want(l, base), prev = get(t[l - 1]);
      if (Math.abs(v - w) > Math.max(1e-9, Math.abs(w) * 1e-9)) bad.push(`level ${l}: ${v}, expected ${w}`);
      if (better === 'up' ? !(v > prev) : !(v < prev)) bad.push(`level ${l}: ${v} is not ${better === 'up' ? 'above' : 'below'} ${prev}`);
    }
    return bad.length === 0 || bad.join('; ');
  });
}
