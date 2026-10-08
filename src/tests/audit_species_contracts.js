// Audit of the species expansion, part 4: contracts. A "sell N plush of one shape" contract was priced as if every shape were one plush in 68. With 92 shapes and most
// of the new ones living in the far regions, a new shape can be 5 to 20 times rarer in the pile than an old one near the bay (and the Razzo is one plush in 60,000), so the pay
// has to follow how often the shape really turns up where the player has been, and a contract never asks for the Razzo.
import * as pd from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, fresh } = ctx;
  const { species, speciesCount, ARCH_COUNT, REGIONS } = pd;
  // the share of the pile one shape makes in a band
  const memo = new Map(), RAZZO = new Set(pd.volatilePool.map((id) => species[id].arch));
  const share = (arch, band) => { const key = arch * 8 + band; let s = memo.get(key); if (s === undefined) { s = 0; for (let id = 1; id <= speciesCount; id++) { const sp = species[id]; if (sp.arch === arch && !sp.volatile) s += pd.speciesChance(id, band); } memo.set(key, s); } return s; };
  const mean = (l) => l.reduce((a, b) => a + b, 0) / Math.max(1, l.length);

  await T('species.audit.shape-contracts-pay-for-how-rare-the-shape-is-and-never-ask-for-a-razzo', async () => {
    fresh({ contracts: 1, contractSlots: 3 }); const bad = [];
    for (const md of [0, 300, 3000]) {
      S().stats.maxDist = md; const reach = pd.bandOfDist(md), rows = []; let razzo = 0;
      for (let q = 0; q < 900; q++) {
        const c = g.contracts.make(); if (c.kind !== 'shape') continue;
        if (RAZZO.has(c.arch)) razzo++;
        let f = 0; for (let b = 0; b <= reach; b++) f = Math.max(f, share(c.arch, b));
        rows.push({ arch: c.arch, f, per: c.reward / c.need, need: c.need });
      }
      if (razzo) bad.push(`maxDist ${md}: ${razzo} contracts asked for the Razzo`);
      if (rows.length < 100) { bad.push(`maxDist ${md}: only ${rows.length} shape contracts in 900`); continue; }
      if (rows.some((r) => !(r.f > 0))) bad.push(`maxDist ${md}: a contract asks for a shape that cannot turn up within reach`);
      // pay per copy against the plush you have to dig up for it (need / share): about the same for every shape, however rare
      const value = rows.map((r) => r.per * r.f), ref = mean(value.filter((_, i) => rows[i].f > 0.01));
      const low = rows.filter((r, i) => value[i] < ref * 0.4);
      if (low.length) bad.push(`maxDist ${md}: ${low.length} of ${rows.length} shape contracts pay under 40% of the common rate per plush dug up (e.g. a shape that is ${(low[0].f * 100).toFixed(2)}% of the pile pays ${low[0].per.toFixed(0)} per copy)`);
      const rareCopy = mean(rows.filter((r) => r.f < 0.004).map((r) => r.per)), commonCopy = mean(rows.filter((r) => r.f > 0.01).map((r) => r.per));
      if (rows.some((r) => r.f < 0.004) && !(rareCopy > commonCopy * 2.5)) bad.push(`maxDist ${md}: a rare shape pays ${rareCopy.toFixed(0)} per copy, a common one ${commonCopy.toFixed(0)}`);
    }
    S().stats.maxDist = 0; void ARCH_COUNT; void REGIONS;
    return bad.length === 0 || bad.slice(0, 4).join('; ');
  });
}
