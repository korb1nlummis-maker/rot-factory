// Catalog part: transit. Owned by wave 5 (4.6). Wave 0 left it empty on purpose.
// Rules (see catalog.js for the full contract): export exactly these four names, import nothing that imports upgrades.js,
// crafting.js, power.js or game.js at module level (they import catalog.js, so that would be a cycle).
// UPGRADES: upgrade entries with ABSOLUTE costs (not multiplied by COST_SCALE). RECIPES: (g) => crafting bench rows (price is multiplied by K=3).
// DEMAND: { type: kW }. TYPES: { type: { cfg, copy, info, use, plan, build, ... } } (see catalog.js).
export const UPGRADES = [];
export const RECIPES = (g) => [];
export const DEMAND = {};
export const TYPES = {};
