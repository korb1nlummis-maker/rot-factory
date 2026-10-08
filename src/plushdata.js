import { h32 } from './util.js';

// ---------------------------------------------------------------------------------------------------------------------------------
// THE SPECIES TABLE. Ids 1..LEGACY_COUNT (1,628) never change: same shape, color, pattern and rarity as in every earlier build. New ids run after them:
//   1629..3236  the 67 oldest shapes (not the Razzo) in the 24 newest colors
//   3237..4388  the 24 newest shapes in all 48 colors
//   4389..      patterned variants (stripes, spots, two-tone) of a hashed subset of shape x color pairs
// Every new species also has a REGION: a band of distance from Sorting Bay 07 in which it can turn up in the pile (lo..hi, see REGIONS).
// The 1,628 originals turn up everywhere (they are the bulk of the pile near the bay); the rest of the Plushdex has to be found by walking out.
// ---------------------------------------------------------------------------------------------------------------------------------
export const ARCH_COUNT = 92;
export const PAL_COUNT = 48;
export const LEGACY_COUNT = 1628;
const OLD_ARCH = 36, OLD_PAL = 16, OLD_TOTAL = OLD_ARCH * OLD_PAL;
const GEN2_ARCH = 48, GEN2_PAL = 20, GEN2_TOTAL = GEN2_ARCH * GEN2_PAL;
const GEN3_ARCH = 68, GEN3_PAL = 24;
const RAZZO_ARCH = 31; // volatile: never given a new color or pattern, so the volatile pool stays exactly as it was
// The special ids sit in their own high range, far above any regular species (regular ids stay below 20,000). Always use these constants, never the numbers.
export const SPECIAL_MIN = 60000; // every id from here up is a fake or a special cell, never a regular species
export const DECOY0 = 60000;      // 60000..60003: the gold fakes of The One
export const PAD = 60005;     // floor pad cell (Wave 3 build shell: a player built floor, catwalk plate or foundation that never falls). vr: low 4 bits = material index, bit 16 = thin (catwalk)
export const CACHE = 60006;   // a worker's supply cache
export const REMAINS = 60007; // what is left of a past worker
export const BULK = 60008;    // bulkhead panel (player-built wall, never falls)
export const NEEDLE = 60009;  // species id of The One
export const SPECIAL_MAX = 60009;
export const isSpecialCell = (sp) => sp === BULK || sp === REMAINS || sp === CACHE || sp === PAD;
// The ids of the specials before they moved up (saves from before the move are remapped on load, see state.js)
export const OLD_SPECIAL_MIN = 4090, SPECIAL_SHIFT = SPECIAL_MIN - OLD_SPECIAL_MIN;

export const ARCH_NAMES = [
  'Bean', 'Gatto', 'Squalo', 'Coccodrillo', 'Banana', 'Cappuccino', 'Rana',
  'Scarpa', 'Martello', 'Polpo', 'Coniglio', 'Papera', 'Uovo', 'Fantasma',
  'Pinguino', 'Orsetto', 'Tartaruga', 'Giraffa', 'Elefante', 'Riccio', 'Gufo', 'Medusa', 'Lumaca', 'Fungo',
  'Cactus', 'Ananas', 'Anguria', 'Pizza', 'Gelato', 'Ciambella', 'Dado', 'Razzo', 'Nuvola', 'Stella', 'Drago', 'Lampadina',
  'Zucca', 'Castello', 'Moka', 'Nido', 'Sardina', 'Aragosta', 'Pappagallo', 'Cavallo', 'Mongolfiera', 'Gondola', 'Tostapane', 'Pomodoro',
  'Ombrello', 'Bottiglia', 'Candela', 'Scimmia', 'Cigno', 'Canguro', 'Granchio', 'Ragno', 'Balena', 'Ape',
  'Carota', 'Bruco', 'Cuore', 'Saturno', 'Casetta', 'Locomotiva', 'Ciliegia', 'Peperoncino', 'Fenicottero', 'Tricheco',
  // the 24 newest shapes
  'Pecora', 'Maiale', 'Mucca', 'Volpe', 'Topo', 'Pesce', 'Farfalla', 'Cammello', 'Pollo', 'Bicicletta', 'Chitarra', 'Fragola',
  'Limone', 'Uva', 'Broccolo', 'Tazza', 'Libro', 'Orologio', 'Aeroplano', 'Barca', 'Fiore', 'Albero', 'Torre', 'Cornetto',
];
export const DECOYS = [DECOY0, DECOY0 + 1, DECOY0 + 2, DECOY0 + 3]; // gold fakes of The One
export const PREFIXES = [
  'Gnocchi', 'Biscotti', 'Pepperoni', 'Tiramisu', 'Mozzarello', 'Limoncello', 'Crostini', 'Zucchino',
  'Risotto', 'Pistacchio', 'Frullato', 'Panino', 'Spaghetto', 'Cannolo', 'Bruschetta', 'Affogato',
  'Carbonara', 'Gorgonzolo', 'Panettone', 'Amaretto',
  'Ravioli', 'Barolo', 'Focaccia', 'Radicchio',
  // the 24 newest colors
  'Prosecco', 'Pesto', 'Granita', 'Melanzana', 'Ricotta', 'Lasagna', 'Sorbetto', 'Espresso',
  'Mortadella', 'Senape', 'Mirtillo', 'Lampone', 'Carbone', 'Tartufo', 'Cedro', 'Mattone',
  'Muschio', 'Cipria', 'Cobalto', 'Laguna', 'Basilico', 'Cannella', 'Ribes', 'Stracciatella',
];
export const PALETTES = [
  ['Bubblegum', 0xff8fc4], ['Mint', 0x7ef0c4], ['Lavender', 0xb69cff], ['Sky', 0x6cc4ff],
  ['Custard', 0xffe066], ['Tangerine', 0xff9a3c], ['Coral', 0xff6f61], ['Lime', 0xa6e83c],
  ['Teal', 0x2cb8b0], ['Grape', 0x8a4fd8], ['Ketchup', 0xe0343c], ['Cream', 0xfff1d6],
  ['Cocoa', 0x9c6b4a], ['Cloud', 0xc9d3dc], ['Magenta', 0xe83cb4], ['Navy', 0x3a56c8],
  ['Peach', 0xffb68a], ['Slate', 0x5f7183], ['Rust', 0xb85a2e], ['Sunflower', 0xffc71f],
  ['Olive', 0x8a9a3b], ['Wine', 0x862646], ['Sand', 0xdcc48c], ['Orchid', 0xd27be0],
  ['Champagne', 0xf4eab0], ['Basil', 0x3f8f3a], ['Ice', 0x59e0f5], ['Aubergine', 0x4b2a6e],
  ['Snow', 0xf2f4f0], ['Brick', 0xd9552b], ['Sherbet', 0xf2b8e0], ['Espresso', 0x3a2418],
  ['Salmon', 0xe58f9a], ['Mustard', 0xb8962e], ['Indigo', 0x2b2f8f], ['Raspberry', 0xc2185b],
  ['Charcoal', 0x33363d], ['Truffle', 0x6b5a4a], ['Citron', 0xd4e157], ['Mattone', 0x8f2d2d],
  ['Moss', 0x566b3a], ['Blush', 0xf7c6c0], ['Cobalt', 0x1244f2], ['Lagoon', 0x3fa7d6],
  ['Fern', 0x1f6b45], ['Cinnamon', 0x906010], ['Currant', 0x5b1f9e], ['Greige', 0xa9b9a3],
];
// patterns: 0 plain, 1 stripes, 2 spots, 3 two-tone (the fragment shader draws them, see shaders.js; the name gets the suffix)
export const PATTERNS = ['', 'Rigato', 'Macchiato', 'Bicolore'];
export const PATTERN_LABELS = ['Plain', 'Striped', 'Spotted', 'Two-tone'];

export const RARITY = [
  { id: 0, name: 'Common',    color: '#c9d1d9', css: 'common',    value: 1,   weight: 0.645 },
  { id: 1, name: 'Uncommon',  color: '#5fe08a', css: 'uncommon',  value: 2,   weight: 0.22 },
  { id: 2, name: 'Rare',      color: '#4ba3ff', css: 'rare',      value: 4,   weight: 0.09 },
  { id: 3, name: 'Epic',      color: '#b86bff', css: 'epic',      value: 12,  weight: 0.034 },
  { id: 4, name: 'Legendary', color: '#ffb02e', css: 'legendary', value: 40,  weight: 0.0085 },
  { id: 5, name: 'Mythic',    color: '#ff4d8d', css: 'mythic',    value: 150, weight: 0.0025 },
  { id: 6, name: 'THE ONE',   color: '#fff3a0', css: 'theone',    value: 0,    weight: 0 },
];

// ---------------------------------------------------------------------------------------------------------------------------------
// REGIONS: bands of distance from the bay. A new species spawns only in its band(s); the originals spawn in every band.
// ---------------------------------------------------------------------------------------------------------------------------------
export const REGIONS = [
  { id: 0, name: 'Bay Floor',    from: 0,    to: 150 },
  { id: 1, name: 'The Stacks',   from: 150,  to: 400 },
  { id: 2, name: 'Midden Hills', from: 400,  to: 900 },
  { id: 3, name: 'Deep Pile',    from: 900,  to: 2000 },
  { id: 4, name: 'Far Reaches',  from: 2000, to: 4000 },
  { id: 5, name: 'Exit Road',    from: 4000, to: 1e9 },
];
export const REGION_COUNT = REGIONS.length;
const BAND_D2 = [REGIONS[1].from ** 2, REGIONS[2].from ** 2, REGIONS[3].from ** 2, REGIONS[4].from ** 2, REGIONS[5].from ** 2];
export function bandOfD2(d2) { return d2 < BAND_D2[0] ? 0 : d2 < BAND_D2[1] ? 1 : d2 < BAND_D2[2] ? 2 : d2 < BAND_D2[3] ? 3 : d2 < BAND_D2[4] ? 4 : 5; }
export const bandOfDist = (d) => bandOfD2(d * d);
export const bandAt = (x, z) => bandOfD2(x * x + z * z);
export const regionRange = (r) => `${r.from >= 1000 ? r.from / 1000 + ' km' : r.from + ' m'} to ${r.to >= 1e8 ? 'the exit' : r.to >= 1000 ? r.to / 1000 + ' km' : r.to + ' m'}`;
// how many of the plush the pile makes in each band are drawn from the pool of species that only exist in that band (the rest come from the originals)
export const REGION_SHARE = [0.12, 0.30, 0.45, 0.55, 0.65, 0.72];
const SHARE_BYTE = REGION_SHARE.map((s) => Math.round(s * 256));
// species with their home band (lo) = band 0 and: lo of each group, in new-species order (the remainder goes to the last band)
const BAND_COUNTS = [520, 600, 800, 1000, 1200];
const SPAN_PCT = 30;   // this share of the new species also turns up in the next band out
const PATTERN_PCT = 18; // chance in 1000/10 that a shape x color pair has a patterned variant, per pattern

const RARITY_SHARES = [262, 160, 90, 44, 14, 6]; // of 576: the count shares of every group of species (the spawn weights are in RARITY)
function splitCounts(n) {
  const q = RARITY_SHARES.map((s) => (n * s) / 576), c = q.map(Math.floor);
  let rem = n - c.reduce((a, b) => a + b, 0);
  const order = q.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rem > 0; k++, rem--) c[order[k % 6][1]]++;
  return c;
}

export const species = []; // index = species id (1..speciesCount), 0 unused, then undefined up to SPECIAL_MIN (a dense array: lookups stay fast), then the specials
export const pools = RARITY.map(() => []);       // the originals (and the decoys) by rarity: what the pile is made of and what old code means by "a species of rarity r"
export const allPools = RARITY.map(() => []);    // every regular species by rarity
export const regional = REGIONS.map(() => RARITY.map(() => [])); // [band][rarity]: the new species that can spawn in that band
export const volatilePool = []; // Razzo plush: not part of the normal rarity pools, they turn up on their own roll (see pickSpecies)
export const regionTotals = REGIONS.map(() => 0); // species by home band (lo): the Plushdex count per region
export let speciesCount = 0;

(function build() {
  const archOf = [0], palOf = [0], patOf = [0];
  const add = (arch, pal, pat) => { archOf.push(arch); palOf.push(pal); patOf.push(pat); };
  // The original 576 species keep their ids, shapes, colors and rarities forever (saves and dex entries depend on them).
  for (let s = 1; s <= OLD_TOTAL; s++) add((s - 1) % OLD_ARCH, Math.floor((s - 1) / OLD_ARCH), 0);
  // new ids: the old shapes in the new colors first, then the new shapes in every color
  for (let pal = OLD_PAL; pal < GEN2_PAL; pal++) for (let arch = 0; arch < OLD_ARCH; arch++) add(arch, pal, 0);
  for (let arch = OLD_ARCH; arch < GEN2_ARCH; arch++) for (let pal = 0; pal < GEN2_PAL; pal++) add(arch, pal, 0);
  // ids 961..: the newest shapes in the 20 colors, then the newest colors in every shape (no new Razzo)
  for (let arch = GEN2_ARCH; arch < GEN3_ARCH; arch++) for (let pal = 0; pal < GEN2_PAL; pal++) add(arch, pal, 0);
  for (let pal = GEN2_PAL; pal < GEN3_PAL; pal++) for (let arch = 0; arch < GEN3_ARCH; arch++) { if (arch === RAZZO_ARCH) continue; add(arch, pal, 0); }
  if (archOf.length - 1 !== LEGACY_COUNT) throw new Error('legacy species count changed: ' + (archOf.length - 1));
  // 1629..: the 24 newest colors on the 67 oldest shapes, then the 24 newest shapes in all 48 colors, then the patterned variants
  for (let pal = GEN3_PAL; pal < PAL_COUNT; pal++) for (let arch = 0; arch < GEN3_ARCH; arch++) { if (arch === RAZZO_ARCH) continue; add(arch, pal, 0); }
  for (let arch = GEN3_ARCH; arch < ARCH_COUNT; arch++) for (let pal = 0; pal < PAL_COUNT; pal++) add(arch, pal, 0);
  for (let pat = 1; pat < PATTERNS.length; pat++) for (let arch = 0; arch < ARCH_COUNT; arch++) {
    if (arch === RAZZO_ARCH) continue;
    for (let pal = 0; pal < PAL_COUNT; pal++) if (h32(arch * 64 + pal, pat, 0xc0ffee) % 1000 < PATTERN_PCT * 10) add(arch, pal, pat);
  }
  const TOTAL = archOf.length - 1;
  speciesCount = TOTAL;

  const rarityOf = new Uint8Array(TOTAL + 1), lo = new Uint8Array(TOTAL + 1), hi = new Uint8Array(TOTAL + 1);
  const assign = (list, seed, counts) => {
    const order = list.slice().sort((a, b) => h32(a, seed) - h32(b, seed) || a - b);
    let p = 0;
    counts.forEach((c, r) => { for (let n = 0; n < c; n++) rarityOf[order[p++]] = r; });
  };
  const range = (from, to) => { const o = []; for (let s = from; s <= to; s++) o.push(s); return o; };
  assign(range(1, OLD_TOTAL), 77, [262, 160, 90, 44, 14, 6]);
  assign(range(OLD_TOTAL + 1, GEN2_TOTAL), 78, [175, 107, 60, 29, 9, 4]);
  assign(range(GEN2_TOTAL + 1, 1360), 79, [182, 111, 63, 30, 10, 4]); // 400, same shares as the 576
  assign(range(1361, LEGACY_COUNT), 80, [122, 75, 42, 20, 6, 3]); // 268
  // the originals live in every band
  for (let s = 1; s <= LEGACY_COUNT; s++) { lo[s] = 0; hi[s] = REGION_COUNT - 1; }
  // the new species: sort by hash, cut into bands, give each band the same rarity shares, and let a part of them reach one band further out
  const fresh = range(LEGACY_COUNT + 1, TOTAL).sort((a, b) => h32(a, 4242) - h32(b, 4242) || a - b);
  const groups = REGIONS.map(() => []);
  let at = 0;
  for (let b = 0; b < REGION_COUNT; b++) { const n = b < BAND_COUNTS.length ? BAND_COUNTS[b] : fresh.length - at; for (let q = 0; q < n; q++) groups[b].push(fresh[at++]); }
  groups.forEach((list, b) => {
    for (const s of list) { lo[s] = b; hi[s] = b < REGION_COUNT - 1 && h32(s, 777) % 100 < SPAN_PCT ? b + 1 : b; }
    assign(list, 90 + b, splitCounts(list.length));
  });

  for (let s = 1; s <= TOTAL; s++) {
    const arch = archOf[s], pal = palOf[s], pat = patOf[s], r = rarityOf[s];
    const name = `${PREFIXES[pal]} ${ARCH_NAMES[arch]}${pat ? ' ' + PATTERNS[pat] : ''}`;
    species[s] = { id: s, arch, pal, pat, rarity: r, name, volatile: arch === RAZZO_ARCH, lo: lo[s], hi: hi[s], legacy: s <= LEGACY_COUNT };
    regionTotals[lo[s]]++;
    if (species[s].volatile) { volatilePool.push(s); continue; }
    allPools[r].push(s);
    if (s <= LEGACY_COUNT) pools[r].push(s);
    else for (let b = lo[s]; b <= hi[s]; b++) regional[b][r].push(s);
  }
  for (let s = TOTAL + 1; s < SPECIAL_MIN; s++) species[s] = undefined; // keep the array dense and fast (a sparse one falls back to a slow dictionary)
  species[NEEDLE] = { id: NEEDLE, arch: ARCH_COUNT, pal: 99, pat: 0, rarity: 6, name: 'Il Rotto Supremo', lo: 0, hi: 5 };
  species[BULK] = { id: BULK, arch: ARCH_COUNT + 1, pal: 98, pat: 0, rarity: 0, name: 'Bulkhead Panel', lo: 0, hi: 5 };
  species[REMAINS] = { id: REMAINS, arch: ARCH_COUNT + 2, pal: 97, pat: 0, rarity: 0, name: 'Abandoned Gear', lo: 0, hi: 5 };
  species[CACHE] = { id: CACHE, arch: ARCH_COUNT + 7, pal: 94, pat: 0, rarity: 0, name: 'Supply Cache', lo: 0, hi: 5 };
  species[PAD] = { id: PAD, arch: ARCH_COUNT + 8, pal: 93, pat: 0, rarity: 0, name: 'Floor Pad', lo: 0, hi: 5 };
  const fakes = [['Il Rotto Supremino', 0xffd24a], ['Il Rotto Suppremo', 0xf4c840], ['Rotto Supremo II', 0xffd860], ['Il Rotto Supremo (Replica)', 0xffcc3c]];
  DECOYS.forEach((id, n) => { species[id] = { id, arch: ARCH_COUNT + 3 + n, pal: 95, pat: 0, rarity: 5, name: fakes[n][0], hex: fakes[n][1], decoy: true, lo: 0, hi: 5 }; pools[5].push(id); });
})();

// the total of regular species (the Plushdex goal); the dex bonus to the sell price is scaled so a full Plushdex pays what it always did (see DEX_UNIT)
export const DEX_FULL = 1628 * 0.004; // +650% at a full dex with the Appraiser alone: 7.5x
export const DEX_UNIT = DEX_FULL / speciesCount; // sell price bonus per discovered species (the Appraiser); Exchange and Registry add half of it per level

const VEIN_W = [0.30, 0.45, 2.4, 4.2, 5.0, 5.0];
const VEIN_SUM = VEIN_W.reduce((a, b, i) => a + b * RARITY[i].weight, 0);

// The rarity roll is a 24 bit number; these are the thresholds of the six rarities as integers (roll < acc is the same as x < ceil(acc * 2^24)), so a pick is a few compares
const rollLimits = (vein) => { let acc = 0; const t = new Int32Array(6); for (let i = 0; i < 6; i++) { acc += vein ? (VEIN_W[i] * RARITY[i].weight) / VEIN_SUM : RARITY[i].weight; t[i] = Math.ceil(acc * 16777216); } return t; };
const LIM = rollLimits(false), LIM_VEIN = rollLimits(true);
// the pools as typed arrays (what pickSpecies reads): the originals by rarity, and the new species by band x rarity (band * 7 + rarity)
const LEG = pools.map((p) => Int32Array.from(p));
const REG = [].concat(...regional.map((b) => b.map((r) => Int32Array.from(r))));
const SHARE_B = Int32Array.from(SHARE_BYTE);

// One plush of the pile. `band` is the distance band of the spot (bandAt / bandOfD2): the originals fill the pile everywhere, and in every band a share of the
// plush (REGION_SHARE) comes from the species that only exist at that distance. Band 0 with the default share keeps 88% of the old picks exactly as they were.
export function pickSpecies(h1, h2, vein = false, band = 0) {
  // one plush in about 60,000 is a Razzo: a lit fuse in your hands and a blast that can bring a tunnel down
  if ((h2 & 0xff) === 0xa7 && ((h1 >>> 5) % 240) === 0) return volatilePool[(h1 >>> 11) % volatilePool.length];
  const x = h2 >>> 8, T = vein ? LIM_VEIN : LIM;
  const r = x < T[2] ? (x < T[0] ? 0 : x < T[1] ? 1 : 2) : (x < T[3] ? 3 : x < T[4] ? 4 : 5);
  if ((Math.imul(h1, 0x9e3779b1) >>> 24) < SHARE_B[band]) { const reg = REG[band * 7 + r]; if (reg.length !== 0) return reg[h1 % reg.length]; }
  const pool = LEG[r];
  return pool[h1 % pool.length];
}

// A species of rarity r for a spot in `band`, from two uniform numbers (supply caches and the like): the same regional rule as the pile
export function pickByRarity(r, band, u1, u2) {
  const reg = regional[band][r];
  const pool = reg.length !== 0 && u2 < REGION_SHARE[band] ? reg : pools[r];
  return pool[Math.min(pool.length - 1, (u1 * pool.length) | 0)];
}

// the chance that one plush the pile makes in `band` is species sp (not counting a rich vein, which only changes the rarity weights)
export function speciesChance(sp, band, vein = false) {
  const s = species[sp];
  if (!s || s.volatile || s.rarity > 5 || band < s.lo || band > s.hi) return 0;
  let w = RARITY[s.rarity].weight;
  if (vein) w = (VEIN_W[s.rarity] * w) / VEIN_SUM;
  const reg = regional[band][s.rarity];
  if (s.legacy || s.decoy) return w * (1 - (reg.length ? REGION_SHARE[band] : 0)) / pools[s.rarity].length;
  return w * REGION_SHARE[band] / reg.length;
}
export const inBand = (sp, band) => { const s = species[sp]; return !!s && band >= s.lo && band <= s.hi; };

// how many regular species a Plushdex object holds, and by home region and rarity. The achievements and the UI ask often, so the answer is kept until the dex changes:
// game.registerDex calls touchDex() when a species is new; code that edits a dex object in place (a test, a save loader) calls touchDex() too, or passes force.
let dexRev = 0, dexMemo = null;
export const touchDex = () => { dexRev++; };
export function dexTally(dex, force = false) {
  if (!force && dexMemo && dexMemo.d === dex && dexMemo.rev === dexRev) return dexMemo.v;
  const out = { n: 0, byRegion: REGIONS.map(() => 0), byRarity: [0, 0, 0, 0, 0, 0] };
  for (const k in dex) {
    const id = +k;
    if (id >= SPECIAL_MIN || !(id >= 1 && id <= speciesCount)) continue;
    const s = species[id];
    out.n++; out.byRegion[s.lo]++; out.byRarity[s.rarity]++;
  }
  dexMemo = { d: dex, rev: dexRev, v: out };
  return out;
}

export function colorOf(sp, vr, out) {
  // returns linear-ish rgb via THREE.Color elsewhere; here return hex + shade multiplier
  const s = species[sp];
  if (!s) return 0xffffff;
  if (sp === NEEDLE) return 0xffd24a;
  const shade = 0.88 + ((vr & 127) / 127) * 0.24;
  return { hex: PALETTES[s.pal][1], shade };
}

export function sellValue(sp, vr) {
  const s = species[sp];
  if (!s) return 1;
  let v = RARITY[s.rarity].value;
  if (vr & 128) v *= 5; // shiny
  return v;
}
