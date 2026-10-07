// Catalog part: detector. Owned by wave 7 (4.9): the walk-through Detector Arch and the Giant Detector Arch (type 'arch', size 1 or 2).
// Rules (see catalog.js for the full contract): export exactly these four names, import nothing that imports upgrades.js,
// crafting.js, power.js or game.js at module level (they import catalog.js, so that would be a cycle).
// All behavior lives in detector.js; this file only registers it. The cfg validators are built on first use because catalog.js imports this file.
import { V } from './catalog.js';
import * as D from './detector.js';
import { NEEDLE } from './plushdata.js';

let SPEC = null;
const spec = () => SPEC || (SPEC = { mode: V.enum(D.MODES), target: V.int(0, NEEDLE), rarity: V.int(0, 5), exact: V.bool, volume: V.num(0, 1), quiet: V.bool });

export const UPGRADES = [
  { id: 'archGate', cat: 'machine', name: 'Detector Arch', desc: 'Unlocks the Detector Arch (12,000 at the bench): a steel walk-through arch 2.4 m wide and 2.4 m tall. Carry plush through it. Nothing matches: a soft buzz (only when you carry something). A match: a two note da-ding, green and gold lamps. Press E on it to choose what it looks for: The One, a species from your Plushdex, a rarity, a species new to your Plushdex, or a shiny. In The One mode a match is the win. It scans you without power; the lamps need a pole (1.5 kW). Needs the Detector Gate.', max: 1, cost: [120000], req: { id: 'detector', lvl: 1 }, effect: (t) => { t.machines.push('arch'); } },
  { id: 'archGiant', cat: 'machine', name: 'Giant Detector Arch', desc: 'Unlocks the Giant Detector Arch (220,000 at the bench): 4.8 m wide and 4.2 m tall with a lit crown panel that shows its target, a 6 m crowd plaza and a louder buzz with a low thunk. Wide enough for carts, bots and Haul Trucks. Draws 4 kW for its lamps. Needs the Detector Arch.', max: 1, cost: [3000000], req: { id: 'archGate', lvl: 1 }, effect: (t) => { t.machines.push('archBig'); } },
];
export const RECIPES = (g) => D.recipes(g);
export const DEMAND = { arch: 1.5 };   // the walk-through arch; the giant draws 4 kW (see detector.js SIZES). power.js counts every arch as a consumer (the kw handler below gives the size's draw).
export const TYPES = {
  arch: {
    stat: 'archBuilt', cfg: () => spec(), group: 'arch', check: D.check, onCfg: D.onCfg,
    item: D.itemOf, onRemove: D.onRemove,
    info: D.info, use: D.use,
    kw: (e) => D.SIZES[D.archSize(e)].kw, pos: (g, e) => [e.cx, e.y0 + 1.0, e.cz], reach: (g, e) => e.w / 2, wireName: (e) => D.SIZES[D.archSize(e)].name,   // the grid solver and the cable tool read these
    add: D.add, plan: D.plan, preview: D.preview, build: D.build, conflict: D.conflict,
    tick: D.tick, guestTick: D.guestTick, row: D.row, guestRow: D.guestRow,
  },
};
