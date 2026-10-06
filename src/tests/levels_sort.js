// Levels audit: Sorting. Auction House, Fever Pitch, Tractor Beam, Species Registry, Prismatic Loupe and Brokerage, level by level,
// measured in sale prices, the sell streak, the real bin, the Plushdex bonus, shiny prices and the contract board.
import { basics, numbers, reqUp } from './levels_common.js';

export default async function (ctx) {
  const { g, S, sim, T, fresh, near, UPGRADES, species } = ctx;
  const U = (id) => UPGRADES.find((u) => u.id === id);
  const ids = ['auction', 'fever', 'tractor', 'registry', 'prism', 'brokerage'];
  for (const id of ids) await basics(ctx, 'sort', id);
  const spOf = (r) => { for (let i = 1; i < 960; i++) if (species[i] && species[i].rarity === r) return i; throw new Error('no species of rarity ' + r); };

  await numbers(ctx, 'sort', 'auction', (t) => t.sellMult, (l, b) => b * Math.pow(1.5, l));
  await numbers(ctx, 'sort', 'fever', (t) => t.streakCap, (l) => 46 + 16 * l);
  await numbers(ctx, 'sort', 'tractor', (t) => t.binCatch, (l, b) => b + 0.6 * l);
  await numbers(ctx, 'sort', 'registry', (t) => t.dexBonus, (l) => 0.006 + 0.002 * l);
  await numbers(ctx, 'sort', 'prism', (t) => t.shinyMult, (l) => 8 + 4 * l);
  await numbers(ctx, 'sort', 'brokerage', (t) => t.contractSlots, (l) => 3 + l);

  await T('levels.sort.auction.every-sale-pays-1.5x-per-level', async () => {
    const sp = spOf(5); let prev = 0, v0 = 0;
    for (let l = 0; l <= 5; l++) {
      fresh({ ...reqUp(UPGRADES, U('auction')), auction: l }); S().stats.maxDist = 0; S().dex = {};
      const v = g.valueOf(sp, 0, 0); if (l === 0) v0 = v; if (!(v > prev)) return `level ${l}: price ${v} not above ${prev}`; prev = v;
      if (Math.abs(v / v0 - Math.pow(1.5, l)) > 0.003 * Math.pow(1.5, l)) return `level ${l}: price ${v} is x${(v / v0).toFixed(3)}, expected x${Math.pow(1.5, l).toFixed(3)}`;
      // the real sale pays it
      const m0 = S().money; g.sell(sp, 0, { dist: 0, streak: false }); if (S().money - m0 !== v) return `level ${l}: the bin paid ${S().money - m0}, price ${v}`;
    }
    return true;
  });

  await T('levels.sort.fever.the-combo-cap-rises-and-pays-4.5-percent-a-plush-up-to-it', async () => {
    const sp = spOf(4); let prevTop = 0;
    for (let l = 0; l <= 3; l++) {
      fresh({ ...reqUp(UPGRADES, U('fever')), fever: l }); S().stats.maxDist = 0; S().dex = {}; const cap = g.T.streakCap; if (cap !== 46 + 16 * l) return 'cap ' + cap;
      const base = g.valueOf(sp, 0, 0), at = (n) => g.valueOf(sp, 0, n) / base;
      if (Math.abs(at(cap) - (1 + 0.045 * (cap - 1))) > 0.01) return `level ${l}: x${at(cap).toFixed(3)} at the cap, expected x${(1 + 0.045 * (cap - 1)).toFixed(3)}`;
      if (Math.abs(at(cap + 200) - at(cap)) > 1e-9) return `level ${l}: the combo kept growing past its cap`;
      if (!(at(cap) > prevTop)) return 'the top of the combo did not rise'; prevTop = at(cap);
      // the real streak: sales within 4.5 s of each other count up
      g.streak.n = 0; g.streak.t = 0; for (let q = 0; q < cap + 10; q++) g.sell(sp, 0, { dist: 0, streak: true });
      if (!(S().stats.bestStreak >= cap)) return `level ${l}: best streak ${S().stats.bestStreak} below the cap ${cap}`;
    }
    return true;
  });

  await T('levels.sort.tractor.the-bin-catches-wider-throws-per-level', async () => {
    const bp = g.hall.binPos; const res = [];
    const maxMiss = (l) => {
      fresh({ ...reqUp(UPGRADES, U('tractor')), tractor: l }); let best = -1;
      for (let m = 0; m <= 9.01; m += 0.25) {
        let hitBoth = 0;
        for (const sgn of [1, -1]) {
          ctx.clearBodies(); sim().binCatch = g.T.binCatch;
          const sx = 0.4, sz = -0.6; const tx = bp.x, tz = bp.z + sgn * m; const dx = tx - sx, dz = tz - sz, Ld = Math.hypot(dx, dz); const t = Ld / 9; const vy = (-0.5 + 7.5 * t * t) / t;
          const m0 = S().money; sim().spawn(3, 0, sx, 1.5, sz, dx / Ld * 9, vy, dz / Ld * 9, 1);
          for (let q = 0; q < 300; q++) { sim().step(1 / 60); if (!sim().n) break; }
          if (S().money > m0) hitBoth++;
        }
        if (hitBoth === 2) best = m; else if (m > best + 0.8) break;
      }
      return best;
    };
    for (let l = 0; l <= 3; l++) { res.push(maxMiss(l)); if (!near(sim().binCatch, 1.35 + 0.6 * l, 1e-9)) return `the sim's catch is ${sim().binCatch} at level ${l}`; }
    ctx.clearBodies();
    for (let l = 1; l <= 3; l++) if (!(res[l] > res[l - 1])) return 'catch width did not grow at level ' + l + ': ' + res.join(',');
    // buying it moves the live physics at once
    fresh({ ...reqUp(UPGRADES, U('tractor')) }); sim().binCatch = 0; S().money = U('tractor').cost[0]; g.buy('tractor'); return near(sim().binCatch, 1.35 + 0.6, 1e-9) || 'purchase left the sim at ' + sim().binCatch;
  });

  await T('levels.sort.registry.collectors-pay-more-per-discovered-species', async () => {
    const sp = spOf(3); let prev = 0, v0 = 0;
    for (let l = 0; l <= 3; l++) {
      fresh({ ...reqUp(UPGRADES, U('registry')), haggle: 10, midas: 5, registry: l }); S().stats.maxDist = 0; S().dex = {}; for (let n = 1; n <= 400; n++) S().dex[n] = 1;
      const v = g.valueOf(sp, 0, 0); if (!(v > prev)) return `level ${l}: price ${v} not above ${prev}`; prev = v; if (l === 0) v0 = v;
      const want = (1 + (0.006 + 0.002 * l) * 400) / (1 + 0.006 * 400); if (Math.abs(v / v0 - want) > 0.003 * want) return `level ${l}: x${(v / v0).toFixed(3)}, expected x${want.toFixed(3)}`;
    }
    // with an empty dex it pays nothing extra
    fresh({ ...reqUp(UPGRADES, U('registry')), registry: 3 }); S().stats.maxDist = 0; S().dex = {}; const a = g.valueOf(sp, 0, 0); fresh({}); S().stats.maxDist = 0; S().dex = {}; const b = g.valueOf(sp, 0, 0); return a === b || `no species found but ${a} vs ${b}`;
  });

  await T('levels.sort.prism.shiny-plush-are-worth-more-at-every-level', async () => {
    const sp = spOf(2); let prev = 0;
    for (let l = 0; l <= 4; l++) {
      fresh({ ...reqUp(UPGRADES, U('prism')), prism: l }); S().stats.maxDist = 0; S().dex = {}; const plain = g.valueOf(sp, 0, 0), shiny = g.valueOf(sp, 128, 0);
      if (Math.abs(shiny / plain - (8 + 4 * l)) > 0.05) return `level ${l}: shiny pays x${(shiny / plain).toFixed(2)}, expected x${8 + 4 * l}`;
      if (!(shiny > prev)) return 'not above the level before'; prev = shiny;
    }
    // without the Loupe the shiny bonus is the old x5
    fresh({}); S().stats.maxDist = 0; S().dex = {}; const p0 = g.valueOf(sp, 0, 0), s0 = g.valueOf(sp, 128, 0); return Math.abs(s0 / p0 - 5) < 0.05 || 'base shiny bonus changed: x' + (s0 / p0);
  });

  await T('levels.sort.brokerage.more-contract-slots-on-the-board-and-in-the-terminal', async () => {
    for (let l = 0; l <= 4; l++) {
      fresh({ ...reqUp(UPGRADES, U('brokerage')), contracts: 1, brokerage: l }); S().contracts = []; g.contracts.fill(); const want = 3 + 3 + l;
      if (g.T.contractSlots !== want || S().contracts.length !== want) return `level ${l}: ${S().contracts.length} contracts for ${g.T.contractSlots} slots, expected ${want}`;
      g.ui.shopCat = 'contracts'; g.ui.renderShop(); const cards = document.querySelectorAll('#shopGrid .card').length; if (cards !== want) return `level ${l}: the terminal shows ${cards} contracts`;
    }
    // buying a level fills the new slot at once
    fresh({ ...reqUp(UPGRADES, U('brokerage')), contracts: 1 }); S().contracts = []; g.contracts.fill(); const n0 = S().contracts.length; S().money = U('brokerage').cost[0]; g.buy('brokerage');
    return (S().contracts.length === n0 + 1) || `${n0} -> ${S().contracts.length} contracts after buying`;
  });
}
