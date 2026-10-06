// Catalog part: furnish (Satisfactory wave 4, spec 4.5): storage crates, signs and lights. Owned by the furnish wave.
// The data (upgrades, bench rows, power demand) and every handler live in furnish.js; this file only exports the four registry names.
// Rules (see catalog.js): import nothing that imports upgrades.js, crafting.js, power.js or game.js at module level (a cycle).
import { FURN_UPGRADES, furnRecipes, FURN_DEMAND, makeTypes } from './furnish.js';

export const UPGRADES = FURN_UPGRADES;
export const RECIPES = (g) => furnRecipes(g);
export const DEMAND = FURN_DEMAND;
export const TYPES = makeTypes();
