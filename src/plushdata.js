import { h32 } from './util.js';

export const ARCH_COUNT = 48;
export const PAL_COUNT = 20; // 48 shapes x 20 colors = 960 species, plus fakes and The One. Ids 1..576 are the original 36 x 16 and never change.
const OLD_ARCH = 36, OLD_PAL = 16, OLD_TOTAL = OLD_ARCH * OLD_PAL;
export const NEEDLE = 999; // species id of The One
export const BULK = 998;   // bulkhead panel (player-built wall, never falls)
export const REMAINS = 997; // what is left of a past worker
export const CACHE = 996;   // a worker's supply cache
export const isSpecialCell = (sp) => sp === BULK || sp === REMAINS || sp === CACHE;

export const ARCH_NAMES = [
  'Bean', 'Gatto', 'Squalo', 'Coccodrillo', 'Banana', 'Cappuccino', 'Rana',
  'Scarpa', 'Martello', 'Polpo', 'Coniglio', 'Papera', 'Uovo', 'Fantasma',
  'Pinguino', 'Orsetto', 'Tartaruga', 'Giraffa', 'Elefante', 'Riccio', 'Gufo', 'Medusa', 'Lumaca', 'Fungo',
  'Cactus', 'Ananas', 'Anguria', 'Pizza', 'Gelato', 'Ciambella', 'Dado', 'Razzo', 'Nuvola', 'Stella', 'Drago', 'Lampadina',
  'Zucca', 'Castello', 'Moka', 'Nido', 'Sardina', 'Aragosta', 'Pappagallo', 'Cavallo', 'Mongolfiera', 'Gondola', 'Tostapane', 'Pomodoro',
];
export const DECOYS = [990, 991, 992, 993]; // gold fakes of The One
export const PREFIXES = [
  'Gnocchi', 'Biscotti', 'Pepperoni', 'Tiramisu', 'Mozzarello', 'Limoncello', 'Crostini', 'Zucchino',
  'Risotto', 'Pistacchio', 'Frullato', 'Panino', 'Spaghetto', 'Cannolo', 'Bruschetta', 'Affogato',
  'Carbonara', 'Gorgonzolo', 'Panettone', 'Amaretto',
];
export const PALETTES = [
  ['Bubblegum', 0xff8fc4], ['Mint', 0x7ef0c4], ['Lavender', 0xb69cff], ['Sky', 0x6cc4ff],
  ['Custard', 0xffe066], ['Tangerine', 0xff9a3c], ['Coral', 0xff6f61], ['Lime', 0xa6e83c],
  ['Teal', 0x2cb8b0], ['Grape', 0x8a4fd8], ['Ketchup', 0xe0343c], ['Cream', 0xfff1d6],
  ['Cocoa', 0x9c6b4a], ['Cloud', 0xc9d3dc], ['Magenta', 0xe83cb4], ['Navy', 0x3a56c8],
  ['Peach', 0xffb68a], ['Slate', 0x5f7183], ['Rust', 0xb85a2e], ['Sunflower', 0xffc71f],
];

export const RARITY = [
  { id: 0, name: 'Common',    color: '#c9d1d9', css: 'common',    value: 1,   weight: 0.645 },
  { id: 1, name: 'Uncommon',  color: '#5fe08a', css: 'uncommon',  value: 2,   weight: 0.22 },
  { id: 2, name: 'Rare',      color: '#4ba3ff', css: 'rare',      value: 5,   weight: 0.09 },
  { id: 3, name: 'Epic',      color: '#b86bff', css: 'epic',      value: 18,  weight: 0.034 },
  { id: 4, name: 'Legendary', color: '#ffb02e', css: 'legendary', value: 80,  weight: 0.0085 },
  { id: 5, name: 'Mythic',    color: '#ff4d8d', css: 'mythic',    value: 500, weight: 0.0025 },
  { id: 6, name: 'THE ONE',   color: '#fff3a0', css: 'theone',    value: 0,    weight: 0 },
];

const SPECIES_TOTAL = ARCH_COUNT * PAL_COUNT;
export const species = []; // index = species id (1..SPECIES_TOTAL), 0 unused
export const pools = RARITY.map(() => []);

(function build() {
  // The original 576 species keep their ids, shapes, colors and rarities forever (saves and dex entries depend on them).
  const archOf = new Array(SPECIES_TOTAL + 1), palOf = new Array(SPECIES_TOTAL + 1);
  for (let s = 1; s <= OLD_TOTAL; s++) { archOf[s] = (s - 1) % OLD_ARCH; palOf[s] = Math.floor((s - 1) / OLD_ARCH); }
  // new ids: the old shapes in the new colors first, then the new shapes in every color
  let id = OLD_TOTAL + 1;
  for (let pal = OLD_PAL; pal < PAL_COUNT; pal++) for (let arch = 0; arch < OLD_ARCH; arch++) { archOf[id] = arch; palOf[id] = pal; id++; }
  for (let arch = OLD_ARCH; arch < ARCH_COUNT; arch++) for (let pal = 0; pal < PAL_COUNT; pal++) { archOf[id] = arch; palOf[id] = pal; id++; }
  const rarityOf = {};
  const assign = (from, to, seed, counts) => {
    const order = [];
    for (let s = from; s <= to; s++) order.push(s);
    order.sort((a, b) => h32(a, seed) - h32(b, seed));
    let p = 0;
    counts.forEach((c, r) => { for (let n = 0; n < c; n++) rarityOf[order[p++]] = r; });
  };
  assign(1, OLD_TOTAL, 77, [262, 160, 90, 44, 14, 6]);
  assign(OLD_TOTAL + 1, SPECIES_TOTAL, 78, [175, 107, 60, 29, 9, 4]);
  for (let s = 1; s <= SPECIES_TOTAL; s++) {
    const arch = archOf[s], pal = palOf[s];
    const r = rarityOf[s] ?? 0;
    const name = `${PREFIXES[pal]} ${ARCH_NAMES[arch]}`;
    species[s] = { id: s, arch, pal, rarity: r, name, volatile: arch === 31 };
    pools[r].push(s);
  }
  species[NEEDLE] = { id: NEEDLE, arch: ARCH_COUNT, pal: 99, rarity: 6, name: 'Il Rotto Supremo' };
  species[BULK] = { id: BULK, arch: ARCH_COUNT + 1, pal: 98, rarity: 0, name: 'Bulkhead Panel' };
  species[REMAINS] = { id: REMAINS, arch: ARCH_COUNT + 2, pal: 97, rarity: 0, name: 'Abandoned Gear' };
  species[CACHE] = { id: CACHE, arch: ARCH_COUNT + 7, pal: 94, rarity: 0, name: 'Supply Cache' };
  const fakes = [['Il Rotto Supremino', 0xffd24a], ['Il Rotto Suppremo', 0xf4c840], ['Rotto Supremo II', 0xffd860], ['Il Rotto Supremo (Replica)', 0xffcc3c]];
  DECOYS.forEach((id, n) => { species[id] = { id, arch: ARCH_COUNT + 3 + n, pal: 95, rarity: 5, name: fakes[n][0], hex: fakes[n][1], decoy: true }; pools[5].push(id); });
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
