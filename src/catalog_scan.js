// Catalog part: scan. The Vehicle Scanner: a big arch set into the floor that every Haul Truck load drives through (see vehiclescan.js).
// Rules (see catalog.js for the full contract): export exactly these four names, import nothing that imports upgrades.js,
// crafting.js, power.js or game.js at module level (they import catalog.js, so that would be a cycle).
// All behavior lives in vehiclescan.js; this file only registers it. The cfg validators are built on first use because catalog.js imports this file.
import { V } from './catalog.js';
import * as VS from './vehiclescan.js';

let SPEC = null;
const spec = () => SPEC || (SPEC = { volume: V.num(0, 1), quiet: V.bool });

export const UPGRADES = [
  { id: 'vscan', cat: 'machine', name: 'Vehicle Scanner', desc: 'Unlocks the Vehicle Scanner (6,000,000 at the bench, 35% more for each one you run): a steel arch 7.2 m wide and 6 m tall set 0.6 m into the floor, wide and tall enough for every truck and digger. Haul Trucks route through the nearest powered one on their way to the bin and stop under it while the load is scanned. A load that holds The One is dumped on the ground at the arch, the alarm sounds and every truck routed through waits until you take The One (E). Without a powered scanner on its road a truck refuses to leave with The One aboard. Draws 14 kW. Needs the Giant Detector Arch.', max: 1, cost: [VS.UNLOCK], req: { id: 'archGiant', lvl: 1 }, effect: (t) => { t.machines.push('vscan'); } },
];
export const RECIPES = (g) => VS.recipes(g);
export const DEMAND = { vscan: VS.SIZE.kw };   // power.js counts a vscan as a consumer (one line in its consumer list)
export const TYPES = {
  vscan: {
    cfg: () => spec(), group: 'vscan', check: VS.check,
    item: VS.itemOf, onRemove: VS.onRemove,
    info: VS.info, use: VS.use,
    add: VS.add, plan: VS.plan, preview: VS.preview, build: VS.build, conflict: VS.conflict,
    tick: VS.tick, guestTick: VS.guestTick, row: VS.row, guestRow: VS.guestRow,
  },
};
