import { h32 } from './util.js';

export const ARCH_COUNT = 36;
export const PAL_COUNT = 16; // 36 shapes x 16 colors = 576 species, plus fakes and The One
export const NEEDLE = 999; // species id of The One
export const BULK = 998;   // bulkhead panel (player-built wall, never falls)
export const REMAINS = 997; // what is left of a past worker

export const ARCH_NAMES = [
  'Bean', 'Gatto', 'Squalo', 'Coccodrillo', 'Banana', 'Cappuccino', 'Rana',
  'Scarpa', 'Martello', 'Polpo', 'Coniglio', 'Papera', 'Uovo', 'Fantasma',
  'Pinguino', 'Orsetto', 'Tartaruga', 'Giraffa', 'Elefante', 'Riccio', 'Gufo', 'Medusa', 'Lumaca', 'Fungo',
  'Cactus', 'Ananas', 'Anguria', 'Pizza', 'Gelato', 'Ciambella', 'Dado', 'Razzo', 'Nuvola', 'Stella', 'Drago', 'Lampadina',
];
export const DECOYS = [990, 991, 992, 993]; // gold fakes of The One
export const PREFIXES = [
  'Gnocchi', 'Biscotti', 'Pepperoni', 'Tiramisu', 'Mozzarello', 'Limoncello', 'Crostini', 'Zucchino',
  'Risotto', 'Pistacchio', 'Frullato', 'Panino', 'Spaghetto', 'Cannolo', 'Bruschetta', 'Affogato',
];
export const PALETTES = [
  ['Bubblegum', 0xff8fc4], ['Mint', 0x7ef0c4], ['Lavender', 0xb69cff], ['Sky', 0x6cc4ff],
  ['Custard', 0xffe066], ['Tangerine', 0xff9a3c], ['Coral', 0xff6f61], ['Lime', 0xa6e83c],
  ['Teal', 0x2cb8b0], ['Grape', 0x8a4fd8], ['Ketchup', 0xe0343c], ['Cream', 0xfff1d6],
  ['Cocoa', 0x9c6b4a], ['Cloud', 0xc9d3dc], ['Magenta', 0xe83cb4], ['Navy', 0x3a56c8],
];

export const RARITY = [
  { id: 0, name: 'Common',    color: '#c9d1d9', css: 'common',    value: 1,    weight: 0.62 },
  { id: 1, name: 'Uncommon',  color: '#5fe08a', css: 'uncommon',  value: 4,    weight: 0.22 },
  { id: 2, name: 'Rare',      color: '#4ba3ff', css: 'rare',      value: 16,   weight: 0.10 },
  { id: 3, name: 'Epic',      color: '#b86bff', css: 'epic',      value: 80,   weight: 0.045 },
  { id: 4, name: 'Legendary', color: '#ffb02e', css: 'legendary', value: 500,  weight: 0.012 },
  { id: 5, name: 'Mythic',    color: '#ff4d8d', css: 'mythic',    value: 4000, weight: 0.003 },
  { id: 6, name: 'THE ONE',   color: '#fff3a0', css: 'theone',    value: 0,    weight: 0 },
];

const SPECIES_TOTAL = ARCH_COUNT * PAL_COUNT;
export const species = []; // index = species id (1..SPECIES_TOTAL), 0 unused
export const pools = RARITY.map(() => []);

(function build() {
  const order = [];
  for (let s = 1; s <= SPECIES_TOTAL; s++) order.push(s);
  order.sort((a, b) => h32(a, 77) - h32(b, 77));
  // distribution of species across rarity tiers (sums to 224)
  const counts = [262, 160, 90, 44, 14, 6];
  let p = 0;
  const rarityOf = {};
  counts.forEach((c, r) => { for (let n = 0; n < c; n++) rarityOf[order[p++]] = r; });
  for (let s = 1; s <= SPECIES_TOTAL; s++) {
    const arch = (s - 1) % ARCH_COUNT;
    const pal = Math.floor((s - 1) / ARCH_COUNT);
    const r = rarityOf[s] ?? 0;
    const name = `${PREFIXES[pal]} ${ARCH_NAMES[arch]}`;
    species[s] = { id: s, arch, pal, rarity: r, name };
    pools[r].push(s);
  }
  species[NEEDLE] = { id: NEEDLE, arch: 36, pal: 99, rarity: 6, name: 'Il Rotto Supremo' };
  species[BULK] = { id: BULK, arch: 37, pal: 98, rarity: 0, name: 'Bulkhead Panel' };
  species[REMAINS] = { id: REMAINS, arch: 38, pal: 97, rarity: 0, name: 'Abandoned Gear' };
  const fakes = [['Il Rotto Supremino', 0xffd24a], ['Il Rotto Suppremo', 0xf4c840], ['Rotto Supremo II', 0xffd860], ['Il Rotto Supremo (Replica)', 0xffcc3c]];
  DECOYS.forEach((id, n) => { species[id] = { id, arch: 39 + n, pal: 95, rarity: 5, name: fakes[n][0], hex: fakes[n][1], decoy: true }; pools[5].push(id); });
})();

export const speciesCount = SPECIES_TOTAL;

const VEIN_W = [0.30, 0.45, 2.4, 4.2, 5.0, 5.0];
const VEIN_SUM = VEIN_W.reduce((a, b, i) => a + b * RARITY[i].weight, 0);

export function pickSpecies(h1, h2, vein = false) {
  const roll = (h2 >>> 8) / 16777216;
  let acc = 0, r = 0;
  for (let i = 0; i < 6; i++) {
    acc += vein ? (VEIN_W[i] * RARITY[i].weight) / VEIN_SUM : RARITY[i].weight;
    if (roll < acc) { r = i; break; }
  }
  const pool = pools[r];
  return pool[h1 % pool.length];
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
