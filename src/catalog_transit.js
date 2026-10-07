// Catalog part: transit (Satisfactory wave 5, spec 4.6): doors, the hoistway Elevator (its call panels are built into landings; the old call button type only loads from old saves), jump pads and cushion pads.
// The data (unlocks, bench rows, power demand) and every handler live in transit.js; this file only exports the four registry names.
// Rules (see catalog.js): import nothing that imports upgrades.js, crafting.js, power.js or game.js at module level (a cycle).
import { TRANSIT_UPGRADES, transitRecipes, DEMAND as TRANSIT_DEMAND, makeTypes, kwOf, powerPos, nameOf } from './transit.js';

export const UPGRADES = TRANSIT_UPGRADES;
export const RECIPES = (g) => transitRecipes(g);
export const DEMAND = TRANSIT_DEMAND;
export const TYPES = makeTypes();
// power.js counts every machine that has a `kw` handler as a consumer, and the cable tool wires it: what a door, lift or pad draws now, where its cable clips on, its name
for (const [k, key] of [['door', 'doorsBuilt'], ['plift', 'platformLifts'], ['jump', 'jumpPads']]) TYPES[k].stat = key;   // achievement counters
for (const k of ['door', 'plift', 'jump']) { const h = TYPES[k]; h.kw = (e) => kwOf(e); h.pos = (g, e) => powerPos(e); h.wireName = (e) => nameOf(e); }
