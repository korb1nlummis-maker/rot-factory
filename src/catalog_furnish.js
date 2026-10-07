// Catalog part: furnish (Satisfactory wave 4, spec 4.5): storage crates, signs and lights. Owned by the furnish wave.
// The data (upgrades, bench rows, power demand) and every handler live in furnish.js; this file only exports the four registry names.
// Rules (see catalog.js): import nothing that imports upgrades.js, crafting.js, power.js or game.js at module level (a cycle).
import { FURN_UPGRADES, furnRecipes, FURN_DEMAND, makeTypes, KW, NAME, KINDS as FURN_KINDS } from './furnish.js';

export const UPGRADES = FURN_UPGRADES;
export const RECIPES = (g) => furnRecipes(g);
export const DEMAND = FURN_DEMAND;
export const TYPES = makeTypes();
// the solver counts every light and sign (kw is furnKw, set in makeTypes): where the cable clips on and the name it shows
for (const k of Object.keys(TYPES)) if (FURN_KINDS.includes(k)) TYPES[k].stat = ['furnPieces'].concat(KW[k] !== undefined && !/sign/.test(k) ? ['furnLights'] : []);   // achievement counters
for (const k of Object.keys(KW)) { const h = TYPES[k]; h.pos = (g, e) => [e.x, e.y + (e.h || 0.5) / 2, e.z]; h.wireName = () => NAME[k]; }
