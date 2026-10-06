// Belt tiers, lifts and underground pairs: the numbers and the pure helpers (Satisfactory spec 4.1, wave 1A).
// No imports on purpose: logistics.js, catalog_belts.js and beltplan.js all read this file, so it can never be part of an import cycle.

export const TIER_NAMES = ['Mk1', 'Mk2', 'Mk3', 'Mk4', 'Mk5', 'Mk6'];
export const TIER_MUL = [1, 1.5, 2.25, 3.4, 5, 7.5];             // tile speed = T.beltSpeed x this
export const TIER_KW = [0.03, 0.05, 0.09, 0.16, 0.30, 0.55];     // power per tile (kW)
export const TIER_COST = [3, 12, 60, 300, 1500, 8000];           // per tile, before the bench's K=3
export const TIER_COLOR = [0xe0b020, 0xe8742a, 0xd23c3c, 0x8a55e0, 0x2a9de0, 0x2fd6a6];   // rail colors: yellow, orange, red, violet, blue, teal
export const K = 3;                                              // the bench multiplier on every non frame item
export const SPACING = 0.34;                                     // item spacing along a tile (tile lengths)
export const UG_SPAN = [4, 6, 8, 10, 12, 14];                    // furthest an underground entry may stand from its exit (cells), by mark
export const UG_MIN = 2;                                         // the nearest: one cell between the two ends
export const UG_END_COST = 40;                                   // per end at Mk1 (scales with the mark like belts)
export const LIFT_MIN = 2, LIFT_MAX = 24, LIFT_FREE = 8;         // lift height in cells; above LIFT_FREE one Lift Frame per started 8 cells
export const LIFT_FRAME_PRICE = 400;
export const FRAME_REACH = 1.3;                                  // a Lift Frame holds the lifts whose column is within this many metres
export const PLAN_MAX = 64;                                      // tiles in one planned line (about 38 m)
export const CRANK = 0.35;                                       // an unpowered belt creeps at this share of its speed (HAND_CRANK in logistics.js; a test keeps them equal)
export const HOP_MAX = 3;                                        // hand offs a tile may do in one update (keeps the rate independent of the frame time)

export const tierOf = (t) => { const v = t && t.tier; return Number.isInteger(v) && v > 0 && v < TIER_MUL.length ? v : 0; };
// which marks the player may use: T.beltMarks is a bit mask, one bit per mark bought (Mk1 is always there). Skipping a mark does not unlock it.
export const markOn = (T, tier) => tier === 0 || (Number.isInteger(tier) && tier > 0 && tier < TIER_MUL.length && ((((T && T.beltMarks) | 0) >> tier) & 1) === 1);
export const topMark = (T) => { const m = (T && T.beltMarks) | 0; for (let k = TIER_MUL.length - 1; k > 0; k--) if ((m >> k) & 1) return k; return 0; };
export const mulOf = (t) => TIER_MUL[tierOf(t)];
// power draw of one belt piece: the mark's kW, times the height for a lift (a lift is h tiles of belt standing up)
export const beltKw = (t) => TIER_KW[tierOf(t)] * (t.lift ? Math.abs(t.lift.h) : 1);
export const speedOf = (T, tier) => (T.beltSpeed || 1.6) * TIER_MUL[tier | 0];                // tiles per second at full power
export const rateOf = (T, tier) => speedOf(T, tier) / SPACING * 60;                          // items per minute: speed / spacing
export const priceOf = (tier) => TIER_COST[tier | 0] * K;                                    // bench price of one Mk tile
export const liftPriceOf = (tier) => 2 * TIER_COST[tier | 0] * K;                            // one lift cell
export const ugPriceOf = (tier) => Math.round(UG_END_COST * TIER_COST[tier | 0] / TIER_COST[0]) * K;   // one underground end
export const spanOf = (tier) => UG_SPAN[tier | 0];
export const framesNeeded = (h) => (h > LIFT_FREE ? Math.ceil(h / LIFT_FREE) - 1 : 0);

// the item id of a Mk tile, a lift or an underground end (tier 0 keeps the old ids so every old save and recipe is untouched)
export const beltId = (tier) => (tier > 0 ? 'belt:' + tier : 'belt');
export const liftId = (tier) => (tier > 0 ? 'lift:' + tier : 'lift');
export const ugId = (tier) => (tier > 0 ? 'ug:' + tier : 'ug');
// the tier a bench item id stands for, or -1 when it is not one of these ids
export function tierOfId(id, base) {
  if (typeof id !== 'string') return -1;
  if (id === base) return 0;
  const m = new RegExp('^' + base + ':([1-5])$').exec(id);
  return m ? +m[1] : -1;
}

// how long one tile is for the items on it (cells): 1 for a belt, the shaft plus half a cell each side for a lift (h < 0 goes down), the whole run for an underground entry
export function lenOf(t) {
  if (t.lift) return Math.abs(t.lift.h) + 1;
  if (t.ug && t.ug.role === 'in' && t.ug.pair != null) return Math.max(1, t.ug.span | 0);
  return 1;
}
// how many items fit on a tile: the same 0.34 spacing as everywhere, 3 on a plain belt
export const capOf = (len) => Math.floor(len / SPACING + 1e-9) + 1;
