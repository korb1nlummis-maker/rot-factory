// Catalog part: sborer. The Support Borer ("Tunnel Jumbo"): bores a tunnel and sets the supports you load into it before the roof needs them (see supportborer.js).
// Rules (see catalog.js for the full contract): export exactly these four names, import nothing that imports upgrades.js, crafting.js, power.js or game.js at module level
// (they import catalog.js, so that would be a cycle). All behavior lives in supportborer.js; this file only registers it. The cfg validators are built on first use.
import { V } from './catalog.js';
import * as SB from './supportborer.js';

let SPEC = null;
const spec = () => SPEC || (SPEC = { on: V.bool, sm: V.int(0, 1), sg: V.enum([0, 2, 3, 4]) });

export const UPGRADES = [
  { id: 'sborer', cat: 'machine', name: 'Support Borer', desc: 'Unlocks the Support Borer (a tunnel jumbo with a cherry-picker boom, 90,000 at the bench, 60% more for each one you run). Load it with the supports from your bag (frame cubes for the regular 4 x 4 tunnel, giant arches for a big one, up to 12) and it bores the tunnel column by column and sets a support before the roof needs one, using the world\'s own roof rule with 2 cells in hand. It stops by itself when it runs out and goes on when you load more. Draws 18 kW and needs a Power Cable. Needs the Tunnel Borer.', max: 1, cost: [UNLOCK()], req: { id: 'borer', lvl: 1 }, effect: (t) => { t.machines.push('sborer'); } },
];
function UNLOCK() { return SB.UNLOCK; }
export const RECIPES = (g) => SB.recipes(g);
export const DEMAND = { sborer: SB.KW_PARK };   // power.js counts it as a consumer; the kw handler gives what it draws right now
export const TYPES = {
  sborer: {
    cfg: () => spec(), group: 'sborer', stat: ['sborersBuilt'],
    item: SB.itemOf, onRemove: SB.onRemove,
    info: SB.info, use: SB.use,
    kw: (e) => SB.kwOf(e), pos: (g, e) => [e.x, e.y + 1.0, e.z], wireName: () => 'Support Borer',
    add: SB.add, plan: SB.plan, preview: SB.preview, build: SB.build, conflict: SB.conflict,
    tick: SB.tick, guestTick: SB.guestTick, row: SB.row, guestRow: SB.guestRow,
  },
};
