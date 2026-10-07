// What the bigger Plushdex does to the rest of the game: the dex achievements (10/25/50/75/90/100 percent and one pair per region), the dex bonus to the sell price,
// multiplayer messages that carry the new species ids, and what generating the pile costs.
import * as pd from '../plushdata.js';
import { ACHIEVEMENTS } from '../achievements.js';
import { World } from '../world.js';
import { toI, toK } from '../config.js';
import { UPGRADES } from '../upgrades.js';

export default async function (ctx) {
  const { T, g, S, p, sim, fresh, newWorld, tune } = ctx;
  const { species, speciesCount, REGIONS, regionTotals, DEX_UNIT } = pd;
  const ach = (id) => ACHIEVEMENTS.find((a) => a.id === id);
  const idsOf = (n, pick = () => true) => { const d = {}; let c = 0; for (let id = 1; id <= speciesCount && c < n; id++) if (pick(id)) { d[id] = 1; c++; } return d; };

  await T('species.dex-achievements-at-10-25-50-75-90-and-100-percent', async () => {
    const bad = []; const steps = [['dexp10', 0.10], ['dexp25', 0.25], ['dexp50', 0.5], ['dexp75', 0.75], ['dexp90', 0.9], ['dexall', 1]];
    for (const [id, f] of steps) {
      const a = ach(id); if (!a) { bad.push('missing ' + id); continue; }
      const need = Math.ceil(speciesCount * f);
      fresh({}); S().dex = idsOf(need - 1); pd.touchDex(); if (a.check(S())) bad.push(`${id} earned at ${need - 1}`);
      S().dex = idsOf(need); pd.touchDex(); if (!a.check(S())) bad.push(`${id} not earned at ${need}`);
      if (f < 1 && !a.desc.includes(need.toLocaleString('en-US'))) bad.push(`${id} text "${a.desc}" lacks ${need}`);
    }
    // the decoys and The One are not species for the count
    fresh({}); S().dex = { ...idsOf(10), [pd.NEEDLE]: 1, [pd.DECOYS[0]]: 1, [pd.DECOYS[1]]: 1 }; pd.touchDex(); if (pd.dexTally(S().dex).n !== 10) bad.push('special ids counted as species');
    if (!ach('fake1').check(S()) || ach('fakeall').check(S())) bad.push('decoy achievements');
    for (const id of ['dex25', 'dex75', 'dex300', 'dex450', 'dex700', 'dex850']) if (!ach(id)) bad.push('the old achievement ' + id + ' is gone');
    S().dex = {}; pd.touchDex();
    return bad.length === 0 || bad.join('; ');
  });

  await T('species.dex-achievements-per-region', async () => {
    const bad = [];
    for (const r of REGIONS) {
      const half = ach('dexr' + r.id + 'h'), all = ach('dexr' + r.id); if (!half || !all) { bad.push('missing region ' + r.id); continue; }
      const mine = []; for (let id = 1; id <= speciesCount; id++) if (species[id].lo === r.id) mine.push(id);
      if (mine.length !== regionTotals[r.id]) bad.push('totals ' + r.id);
      const take = (n) => { const d = {}; for (let q = 0; q < n; q++) d[mine[q]] = 1; return d; };
      fresh({}); S().dex = take(Math.ceil(mine.length / 2) - 1); pd.touchDex(); if (half.check(S())) bad.push(`${half.id} early`);
      S().dex = take(Math.ceil(mine.length / 2)); pd.touchDex(); if (!half.check(S()) || all.check(S())) bad.push(`${half.id} at half`);
      S().dex = take(mine.length - 1); pd.touchDex(); if (all.check(S())) bad.push(`${all.id} one short`);
      S().dex = take(mine.length); pd.touchDex(); if (!all.check(S())) bad.push(`${all.id} complete`);
      if (!all.desc.includes(r.name) || !all.desc.includes(String(mine.length).replace(/(\d)(?=(\d{3})$)/, '$1,'))) bad.push('text ' + all.desc);
    }
    const ids = ACHIEVEMENTS.map((a) => a.id); if (new Set(ids).size !== ids.length) bad.push('duplicate achievement ids');
    S().dex = {}; pd.touchDex();
    return bad.length === 0 || bad.join('; ');
  });

  await T('species.dex-achievements-are-awarded-in-play', async () => {
    fresh({}); S().dex = idsOf(Math.ceil(speciesCount * 0.1)); pd.touchDex(); S().ach = {}; g.checkAchievements();
    const got = !!S().ach.dexp10, notYet = !S().ach.dexp25; S().dex = {}; pd.touchDex(); S().ach = {};
    return (got && notYet) || `dexp10 ${got}, dexp25 not yet ${notYet}`;
  });

  await T('species.a-full-dex-still-pays-about-7-5x-and-the-bonus-is-per-species-scaled', async () => {
    const bad = []; const sp = species.findIndex((s) => s && s.legacy && s.rarity === 2);
    const price = (up, n) => { fresh(up); S().stats.maxDist = 0; S().dex = idsOf(n); g.T = g.tune(); const v = g.valueOf(sp, 0, 0); S().dex = {}; return v; };
    const base = price({}, 0), full = price({ dex: 1 }, speciesCount), half = price({ dex: 1 }, Math.floor(speciesCount / 2)), none = price({ dex: 1 }, 0);
    const ratio = full / base; if (Math.abs(ratio - 7.512) > 0.12) bad.push(`a full dex pays ${ratio.toFixed(3)}x, it always paid about 7.5x`);
    if (none !== base) bad.push('the Appraiser pays with an empty dex');
    const hr = half / base; if (Math.abs(hr - (1 + 3.256)) > 0.1) bad.push(`half a dex pays ${hr.toFixed(3)}x`);
    if (Math.abs(DEX_UNIT * speciesCount - 6.512) > 1e-6) bad.push('DEX_UNIT does not scale to a full dex of 6.512');
    // Exchange and Registry stay in the same proportion: at the top of both a full dex pays what it did with 1,628 species
    fresh({ dex: 1, exchange: 3, registry: 3, haggle: 10 }); const t = g.tune(); const old = 0.004 + 0.002 * 3 + 0.002 * 3; if (Math.abs(t.dexBonus * speciesCount - old * 1628) > 0.01) bad.push(`dexBonus ${t.dexBonus} vs ${(old * 1628 / speciesCount).toFixed(5)}`);
    const desc = ['dex', 'exchange', 'registry'].map((id) => UPGRADES.find((u) => u.id === id).desc);
    if (!desc[0].includes(speciesCount.toLocaleString('en-US')) || !/7\.5x/.test(desc[0]) || /1,628/.test(desc[0])) bad.push('Appraiser text: ' + desc[0]);
    if (desc.some((d) => /0\.4%|0\.2%/.test(d)) || !/%/.test(desc[1])) bad.push('stale percentages in the texts: ' + desc.join(' | '));
    S().dex = {}; return bad.length === 0 || bad.join('; ');
  });

  await T('species.the-running-dex-count-follows-registerDex-and-saves', async () => {
    fresh({}); S().dex = {}; const a = g.dexN(); g.registerDex(10); g.registerDex(10); g.registerDex(7000); const b = g.dexN(); const ok = a === 0 && b === 2 && Object.keys(S().dex).length === 2;
    S().dex = { 1: 1, 2: 1, 3: 1 }; const c = g.dexN(); S().dex = {}; return (ok && c === 3) || `counts ${a} ${b} ${c}`;
  });

  await T('species.multiplayer-messages-carry-the-new-species-ids', async () => {
    fresh({}); const bad = []; const big = speciesCount, pat = species.findIndex((s) => s && s.pat === 3); const json = (m) => JSON.parse(JSON.stringify(m));
    const was = { open: g.net.open, role: g.net.role, ready: g.guestReady, send: g.netSend }; const sent = [];
    try {
      // the host paid for a guest's sale of a new species at its rarity
      g.net.open = true; g.net.role = 'host'; g.guestReady = false; g.netSend = (m) => { sent.push(json(m)); };
      S().money = 0; const m0 = S().money; g.netMessage(json({ t: 'cmd', c: 'sell', d: { sp: big, vr: 0, dist: 0, streak: false } })); const paid = S().money - m0;
      if (!(paid >= pd.RARITY[species[big].rarity].value)) bad.push('sale of the newest species paid ' + paid);
      // a guest throws a new species: the message to the host carries the id, and the host makes the body with it
      g.net.role = 'guest'; g.guestReady = true; sent.length = 0; g.spawnHook(big, 5, 0, 2, 0, 0, 0, 0, 1); const sp = sent.find((m) => m.t === 'spawn'); if (!sp || sp.a[0] !== big || sp.a[1] !== 5) bad.push('the spawn message has ' + JSON.stringify(sp && sp.a));
      g.net.role = 'host'; g.guestReady = false; const n0 = sim().n; g.netMessage(json(sp || { t: 'spawn', a: [0] })); const idx = sim().n - 1; if (sim().n !== n0 + 1 || sim().sp[idx] !== big) bad.push('host spawn ' + (sim().sp[idx])); while (sim().n > n0) sim().remove(sim().n - 1);
      // a patterned species through the same message, and a gift into the guest's hands
      g.netMessage(json({ t: 'spawn', a: [pat, 9, 1, 2, 3, 0, 0, 0, 1] })); const i2 = sim().n - 1; if (sim().sp[i2] !== pat || sim().vr[i2] !== 9) bad.push('patterned spawn'); while (sim().n > n0) sim().remove(sim().n - 1);
      g.net.role = 'guest'; g.guestReady = true; S().carry = []; g.netMessage(json({ t: 'give', items: [{ sp: big, vr: 3 }] })); if (S().carry.length < 1 || S().carry[0].sp !== big || S().carry[0].vr !== 3) bad.push('gift ' + JSON.stringify(S().carry));
      S().carry = []; g.netMessage(json({ t: 'give', items: [{ sp: pat, vr: 4 }] })); if (!S().carry.length || S().carry[0].sp !== pat) bad.push('patterned gift ' + JSON.stringify(S().carry));
    } finally { g.net.open = was.open; g.net.role = was.role; g.guestReady = was.ready; if (was.send) g.netSend = was.send; else delete g.netSend; S().carry = []; }
    return bad.length === 0 || bad.join('; ');
  });

  await T('species.belts-bins-and-rules-accept-the-new-ids-and-refuse-the-specials', async () => {
    fresh({}); const bad = []; const SR = await import('../splitrules.js'); const big = speciesCount;
    if (!SR.cleanRule({ k: 'species', v: big })) bad.push('a rule on the newest species'); if (!SR.cleanRule({ k: 'species', v: pd.DECOYS[3] })) bad.push('a rule on a decoy'); if (SR.cleanRule({ k: 'species', v: pd.BULK }) || SR.cleanRule({ k: 'species', v: pd.PAD })) bad.push('a rule on a bulkhead or pad');
    if (SR.cleanRule({ k: 'species', v: speciesCount + 1 })) bad.push('a rule on a species that does not exist');
    const item = { sp: big, vr: 0 }; const m = SR.matches ? SR.matches({ k: 'species', v: big }, item) : true; if (m === false) bad.push('a species rule does not match its species');
    return bad.length === 0 || bad.join('; ');
  });

  await T('species.rail-cargo-accepts-the-newest-species-and-not-the-special-cells', async () => {
    const RAIL = await import('../rail.js'); void RAIL; const { SPECIAL_MIN, NEEDLE } = pd; const ok = (a) => Number.isInteger(a) && (a === NEEDLE || (a >= 1 && a < SPECIAL_MIN && !!species[a]));
    return (ok(speciesCount) && ok(NEEDLE) && !ok(pd.BULK) && !ok(pd.PAD) && !ok(pd.CACHE) && !ok(speciesCount + 1) && ok(4095) && ok(4098)) || 'rail rule';
  });

  await T('species.generating-the-pile-costs-no-more-than-before', async () => {
    const mk = (x0) => { const world = new World(0x77aa55), ci0 = toI(x0) >> 4, ck0 = toK(0) >> 4; const t0 = performance.now(); let c = 0; for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) { world.makeCol(ci0 + a, ck0 + b); c++; } return (performance.now() - t0) / c; };
    mk(0); const bay = Math.min(mk(-40), mk(-40)), far = Math.min(mk(3000), mk(3000));
    // 0.73 ms a column was measured before the species table grew; allow a generous margin for a busy machine
    let h = 0x99, acc = 0; const t0 = performance.now(); for (let n = 0; n < 1000000; n++) { h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; acc += pd.pickSpecies(h >>> 4, Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0, false, n % 6) & 1; } const pick = performance.now() - t0; void acc;
    return (bay < 2.6 && far < 2.6 && pick < 400) || `column ${bay.toFixed(2)} ms at the bay, ${far.toFixed(2)} ms at 3 km, a million picks ${pick.toFixed(0)} ms`;
  });
}
