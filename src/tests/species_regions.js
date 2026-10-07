// Regional rarity: the new species only exist in a band of distance from the bay, the originals everywhere. A player who stays by the bay can find at most a third
// of the Plushdex; the full one needs the whole 4.9 km. Every way a plush comes into being (the pile, caches, contracts) follows the same bands.
import * as pd from '../plushdata.js';
import { World } from '../world.js';
import { toI, toK, cellX, cellZ } from '../config.js';

const SIX = [[0, 50], [1, 270], [2, 650], [3, 1400], [4, 3000], [5, 4600]];   // [band, a distance inside it in metres]

export default async function (ctx) {
  const { T, g, S, w, sim, fresh, newWorld } = ctx;
  const { species, speciesCount, REGIONS, REGION_SHARE, regional, pools } = pd;
  const allowed = (sp, band) => { const s = species[sp]; return !!s && (s.volatile || s.decoy || s.legacy || (band >= s.lo && band <= s.hi)); };
  const hashes = function* (n, seed) { let h = seed; for (let q = 0; q < n; q++) { h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; const h2 = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; yield [h >>> 4, (h2 ^ Math.imul(q, 2654435761)) >>> 0, q % 3 === 0]; } };

  await T('species.six-bands-with-the-agreed-distances', async () => {
    const want = [[0, 0], [149.9, 0], [150, 1], [399.9, 1], [400, 2], [899, 2], [900, 3], [1999, 3], [2000, 4], [3999, 4], [4000, 5], [4900, 5], [7000, 5]];
    const bad = want.filter(([d, b]) => pd.bandOfDist(d) !== b); if (bad.length) return 'bands wrong for ' + JSON.stringify(bad);
    if (pd.bandAt(90, 120) !== 1 || pd.bandAt(-3000, 4000) !== 5 || pd.bandAt(0, -149) !== 0) return 'bandAt';
    if (REGIONS.map((r) => r.from).join() !== '0,150,400,900,2000,4000') return 'region starts ' + REGIONS.map((r) => r.from);
    if (REGIONS.some((r, i) => i > 0 && r.from !== REGIONS[i - 1].to)) return 'regions have gaps';
    for (let b = 0; b < 6; b++) if (!(REGION_SHARE[b] > 0 && REGION_SHARE[b] < 1)) return 'share ' + b;
    return REGION_SHARE.every((s, i) => i === 0 || s > REGION_SHARE[i - 1]) || 'the regional share does not grow with distance';
  });

  await T('species.20000-picks-per-band-stay-inside-their-band', async () => {
    const bad = [];
    for (let b = 0; b < 6; b++) {
      let fresh2 = 0, tot = 0; const seen = new Set();
      for (const [h1, h2, vein] of hashes(20000, 0x1000 + b * 77)) {
        const sp = pd.pickSpecies(h1, h2, vein, b); seen.add(sp);
        if (!allowed(sp, b)) { bad.push(`band ${b}: ${species[sp].name} (home ${species[sp].lo}..${species[sp].hi})`); if (bad.length > 5) return bad.join('; '); }
        const s = species[sp]; if (!s.volatile) { tot++; if (!s.legacy && !s.decoy) fresh2++; }
      }
      const share = fresh2 / tot; if (Math.abs(share - REGION_SHARE[b]) > 0.02) bad.push(`band ${b}: ${share.toFixed(3)} of the picks are regional, wanted ${REGION_SHARE[b]}`);
      if (b > 0 && seen.size < 1000) bad.push(`band ${b} shows only ${seen.size} different species in 20,000 picks`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('species.a-bay-only-player-can-find-at-most-35-percent', async () => {
    const reach = (band) => { let n = 0; for (let id = 1; id <= speciesCount; id++) if (allowed(id, band) && !species[id].decoy && (species[id].legacy || species[id].lo <= band)) n++; return n; };
    const ever = new Set(); for (const [h1, h2, vein] of hashes(20000, 0x5151)) ever.add(pd.pickSpecies(h1, h2, vein, 0));
    const near = reach(0), share = near / speciesCount;
    if (!(share <= 0.35 && share >= 0.25)) return `a bay-only player can reach ${near} of ${speciesCount} (${(share * 100).toFixed(1)}%), wanted 25% to 35%`;
    const outside = [...ever].filter((id) => !species[id].decoy && !species[id].legacy && species[id].lo > 0); if (outside.length) return 'the bay band showed species of another band: ' + species[outside[0]].name;
    if (ever.size > near + 4) return 'more species at the bay than the table allows';
    // every band opens up more: the share a player has reached grows with the distance and only the whole 4.9 km completes the dex
    const prog = REGIONS.map((r, b) => reach(b)); const cum = []; for (let b = 0; b < 6; b++) { const set = new Set(); for (let id = 1; id <= speciesCount; id++) if (species[id].legacy || species[id].lo <= b) set.add(id); cum.push(set.size / speciesCount); }
    if (!cum.every((c, i) => i === 0 || c > cum[i - 1])) return 'the reachable share does not grow with each band: ' + cum.map((c) => c.toFixed(3));
    if (cum[1] > 0.45 || cum[3] > 0.75 || cum[4] > 0.9) return 'too much of the dex within reach too early: ' + cum.map((c) => c.toFixed(3));
    if (Math.abs(cum[5] - 1) > 1e-9) return 'not every species is reachable somewhere';
    if (pd.regionTotals[5] < speciesCount * 0.1) return 'fewer than 10% of the species live beyond 4 km: ' + pd.regionTotals[5];
    void prog;
    return true;
  });

  await T('species.every-band-has-species-of-every-rarity-and-near-the-bay-has-rare-ones', async () => {
    for (let b = 0; b < 6; b++) for (let r = 0; r < 6; r++) if (regional[b][r].length < 3) return `band ${b} rarity ${r}: ${regional[b][r].length} species`;
    for (let b = 0; b < 6; b++) { let n = 0; for (let id = 1629; id <= speciesCount; id++) if (species[id].lo === b) n++; if (n < 400) return `band ${b} has only ${n} species of its own`; }
    const nearRare = regional[0][2].length + regional[0][3].length + regional[0][4].length + regional[0][5].length; return nearRare >= 40 || 'only ' + nearRare + ' rare or better new species near the bay';
  });

  await T('species.the-generated-pile-follows-the-bands', async () => {
    const world = new World(0x5eed1234), bad = [];
    for (const [band, d] of SIX) {
      const x0 = d, ci = toI(x0) >> 4, ck = toK(0) >> 4; let cells = 0, fresh2 = 0; const seen = new Set();
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        const col = world.col(ci + a, ck + b);
        for (let n = 0; n < col.sp.length; n++) { const sp = col.sp[n]; if (!sp || sp >= pd.SPECIAL_MIN) continue; cells++; seen.add(sp); if (!allowed(sp, pd.bandAt(cellX((ci + a) * 16 + (n & 15)), cellZ((ck + b) * 16 + ((n >> 4) & 15))))) { if (bad.length < 4) bad.push(`at ${x0} m: ${species[sp].name}`); } if (!species[sp].legacy && !species[sp].decoy) fresh2++; }
      }
      if (cells < 3000) bad.push(`band ${band}: only ${cells} plush generated`);
      const share = fresh2 / cells; if (cells >= 3000 && Math.abs(share - REGION_SHARE[band]) > 0.04) bad.push(`band ${band}: ${share.toFixed(3)} regional plush, wanted ${REGION_SHARE[band]}`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('species.the-edge-of-a-band-switches-at-the-distance', async () => {
    const world = new World(0xabcdef01), bad = []; let sawNewAcross = false;
    for (const edge of [150, 400, 900, 2000, 4000]) {
      const band = pd.bandOfDist(edge + 2), below = band - 1;
      for (const [dist, b] of [[edge - 6, below], [edge + 6, band]]) {
        const i0 = toI(dist) & ~15, k0 = toK(0) & ~15; const col = world.col(i0 >> 4, k0 >> 4);
        for (let n = 0; n < col.sp.length; n++) { const sp = col.sp[n]; if (!sp || sp >= pd.SPECIAL_MIN) continue; const x = cellX(i0 + (n & 15)), z = cellZ(k0 + ((n >> 4) & 15)); const real = pd.bandAt(x, z); if (!allowed(sp, real)) { if (bad.length < 4) bad.push(`edge ${edge}: ${species[sp].name} at ${Math.hypot(x, z).toFixed(0)} m`); } if (real === band && species[sp].lo === band) sawNewAcross = true; }
        void b;
      }
    }
    return (bad.length === 0 && sawNewAcross) || bad.join('; ') || 'no species of the outer bands near their edges';
  });

  await T('species.caches-hold-the-species-of-the-band-they-are-opened-in', async () => {
    const bad = [];
    for (let b = 0; b < 6; b++) {
      let n = 0, fresh2 = 0, tot = 0; let h = 0x4242 + b;
      for (let r = 2; r <= 5; r++) for (let q = 0; q < 3000; q++) { h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; const u1 = (h >>> 8) / 16777216, u2 = (Math.imul(h, 0x9e3779b1) >>> 8) / 16777216; const sp = pd.pickByRarity(r, b, u1, u2); n++; if (!allowed(sp, b) || species[sp].rarity !== r) { if (bad.length < 4) bad.push(`band ${b} rarity ${r}: ${species[sp].name}`); } tot++; if (!species[sp].legacy && !species[sp].decoy) fresh2++; }
      if (Math.abs(fresh2 / tot - REGION_SHARE[b]) > 0.03) bad.push(`band ${b}: ${(fresh2 / tot).toFixed(3)} of the cache plush are regional`);
    }
    // a real far cache, opened: the stash that spills out is of that distance
    await newWorld(); fresh({}); const x = 3100, z = 0; const ci = toI(x), cj = 4, ck = toK(z);
    const realRandom = Math.random; let first = true, s0 = 12345; const lcg = () => { s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };
    try {
      for (let rep = 0; rep < 6; rep++) {
        w().setCell(ci + rep, cj, ck, pd.CACHE, 3); first = true; Math.random = () => (first ? (first = false, 0.97) : lcg());
        const n0 = sim().n; g.openCache(ci + rep, cj, ck);
        for (let q = n0; q < sim().n; q++) { const sp = sim().sp[q]; if (!allowed(sp, 4)) bad.push('a 3 km cache gave ' + species[sp].name); }
        if (sim().n === n0) bad.push('the stash branch gave no plush');
        while (sim().n > n0) sim().remove(sim().n - 1);
      }
    } finally { Math.random = realRandom; for (let rep = 0; rep < 6; rep++) w().setCell(ci + rep, cj, ck, 0, 0); }
    return bad.length === 0 || bad.slice(0, 5).join('; ');
  });

  await T('species.plush-taken-from-a-far-cell-keep-the-species-the-pile-made', async () => {
    await newWorld(); fresh({}); const world = w(); const bad = []; let taken = 0;
    for (const [band, d] of SIX.slice(1)) {
      const i = toI(d) + 3, k = toK(0) + 2; let j = 0; while (j < 70 && !world.get(i, j, k)) j++;
      const sp = world.get(i, 30, k), vr = world.getVr(i, 30, k); if (!sp) continue;
      if (!allowed(sp, band)) bad.push(`the pile at ${d} m holds ${species[sp].name}`);
      S().carry = []; g.collect({ type: 'cell', i, j: 30, k, sp, vr }); const it = S().carry[0];
      if (it) { taken++; if (it.sp !== sp) bad.push('the plush changed species on the way out'); }
    }
    return (bad.length === 0 && taken >= 3) || bad.join('; ') || 'only ' + taken + ' far cells could be taken';
  });

  await T('species.contracts-name-species-the-player-has-reached', async () => {
    fresh({ contracts: 1, contractSlots: 3 }); const bad = []; const bandOf = pd.bandOfDist;
    for (const md of [0, 120, 300, 800, 1500, 3000, 4800]) {
      S().stats.maxDist = md; let n = 0, far = 0;
      for (let q = 0; q < 160; q++) {
        const c = g.contracts.make(); if (!(c.reward > 0) || !Number.isFinite(c.reward)) bad.push('reward ' + c.reward);
        if (c.kind !== 'species') continue; n++;
        const s = species[c.sp]; if (!s) { bad.push('no species ' + c.sp); continue; }
        if (!s.legacy && s.lo > bandOf(md)) bad.push(`at ${md} m a contract asks for ${s.name} from band ${s.lo}`);
        if (!s.legacy) far++;
        if (!c.desc.includes(s.name)) bad.push('desc ' + c.desc);
      }
      if (n < 10) bad.push(`maxDist ${md}: only ${n} species contracts in 160`);
      if (md >= 3000 && far < n * 0.15) bad.push(`maxDist ${md}: only ${far} of ${n} species contracts name a new species`);
      if (md === 0 && far === 0 && n > 30) { /* the bay band has a few new species of its own: none is not an error */ }
    }
    S().stats.maxDist = 0;
    return bad.length === 0 || bad.slice(0, 5).join('; ');
  });

  await T('species.contract-pay-grows-with-how-rare-the-species-is-in-its-band', async () => {
    const common = species.findIndex((s) => s && s.legacy && s.rarity === 0), mythic = species.findIndex((s) => s && s.legacy && s.rarity === 5 && !s.volatile);
    const farRare = species.findIndex((s) => s && s.lo === 5 && s.rarity === 4);
    const c0 = pd.speciesChance(common, 0), c1 = pd.speciesChance(mythic, 0), c2 = pd.speciesChance(farRare, 5);
    if (!(c0 > c1 && c1 > 0 && c2 > 0 && c0 > c2)) return `chances ${c0} ${c1} ${c2}`;
    if (pd.speciesChance(farRare, 2) !== 0 || pd.speciesChance(farRare, 4) !== 0) return 'a far species has a chance in the wrong band';
    let sum = 0; for (let id = 1; id <= speciesCount; id++) sum += pd.speciesChance(id, 3); return Math.abs(sum - 1) < 0.01 || 'chances in band 3 add up to ' + sum.toFixed(4) + ' (razzo and decoys excluded)';
  });
}
