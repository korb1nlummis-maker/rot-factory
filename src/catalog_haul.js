// Catalog part: haul. Wave 6 (spec 4.7 and 4.8, lead notes section 9): giant arches, the Portal, haul roads and truck docks.
// Rules (see catalog.js for the full contract): export exactly these four names, import nothing that imports upgrades.js,
// crafting.js, power.js or game.js at module level (they import catalog.js, so that would be a cycle).
// All behavior lives in arches.js, portal.js and haul.js; this file only registers it. The cfg validators are built on first use because catalog.js imports this file.
import { V } from './catalog.js';
import * as ARCH from './arches.js';
import * as PORTAL from './portal.js';
import * as HAUL from './haul.js';

let SPEC = null;
const spec = () => SPEC || (SPEC = { off: V.bool });

export const UPGRADES = [
  { id: 'archWide', cat: 'mine', name: 'Wide Arches', desc: 'Unlocks the Haul Arch (6 cells wide, clear 5 x 4: one truck lane) and the Wide Arch (8 wide, clear 7 x 5: two lanes or a Bucket-Wheel Excavator) in every frame material you own. They are 4 cells deep like a frame cube, support the roof like one and are rated shallower the wider they are (x0.85 and x0.7 of the frame). Dig the section out first. Price at the bench: the frame price times 4 or 9, times 3.', max: 1, cost: [2.5e6], req: { id: 'steel', lvl: 1 }, effect: (t) => { (t.archSpans || (t.archSpans = [])).push(6, 8); } },
  { id: 'archHall', cat: 'mine', name: 'Cathedral Arches', desc: 'Unlocks the Cathedral Arch: 12 cells wide, 8 high (clear 11 x 7), rated to 55% of the frame depth. Room for the biggest diggers side by side and a truck road beside them. Needs Concrete Lining, and its bench rows appear once you also own the Haul Truck. Price at the bench: the frame price times 22, times 3.', max: 1, cost: [60e6], req: { id: 'concrete', lvl: 1 }, effect: (t) => { (t.archSpans || (t.archSpans = [])).push(12); } },
  { id: 'portal', cat: 'machine', name: 'Portal Driver', desc: 'A giant arch set at the mouth of the pile (open on one side, the pile wall on the other) becomes a Portal: a powered auto-driver that bores the tunnel to the arch\'s size, one slab at a time, and sets the next arch behind it every 4 cells, spending Fluff for the arches. It uses the cheapest tier you own that the load tracing says will hold, halts with "the mountain presses N%" where none does, needs a Support Fan for stale air and never cuts The One without a powered Vehicle Scanner on the line. Draws 150, 260 or 480 kW by span. Needs Wide Arches.', max: 1, cost: [45e6], req: { id: 'archWide', lvl: 1 }, effect: (t) => { t.portal = true; } },
  { id: 'haulRoad', cat: 'machine', name: 'Haul Roads', desc: 'Unlocks Haul Road Plates (24 at the bench): 2.4 m square plates of road painted on the floor, laid edge to edge (hold B and walk). Haul Trucks drive 1.4 times as fast on a road and their router prefers it to open ground. Needs the Haul Truck.', max: 1, cost: [1.5e6], req: { id: 'truck', lvl: 1 }, effect: (t) => { t.haulRoad = true; } },
  { id: 'truckDock', cat: 'machine', name: 'Truck Docks', desc: 'Unlocks the Truck Dock (220,000 at the bench) and Charge Packs: a 4 x 6 cell pad where a Haul Truck charges its battery at 25 kW, and, with a belt at one end, a place trucks unload onto the belt instead of the bin. Needs Haul Roads.', max: 1, cost: [6e6], req: { id: 'haulRoad', lvl: 1 }, effect: (t) => { t.truckDock = true; } },
];
export const RECIPES = (g) => [...ARCH.recipes(g), ...HAUL.recipes(g)];
export const DEMAND = {};   // the Portal and a dock draw by their kw handlers; a plain arch and a road plate draw nothing
export const TYPES = {
  garch: {
    cfg: () => spec(), group: 'garch',
    check: (g, ent, clean) => (clean.off !== undefined && !PORTAL.isPortal(ent) ? 'That arch is not a Portal' : null),
    item: ARCH.itemOfEnt, onRemove: ARCH.onRemove, stat: ['garches'], holds: ARCH.holds,
    info: (g, ent) => ARCH.info(g, ent, PORTAL.lines), use: PORTAL.use,
    add: PORTAL.add, plan: ARCH.plan, preview: ARCH.preview, build: ARCH.build, conflict: ARCH.conflict,
    kw: (ent) => PORTAL.kwOf(ent), pos: (g, ent) => [ent.cx, ent.y0 + 1, ent.cz], wireName: (ent) => (PORTAL.isPortal(ent) ? 'Portals' : ARCH.nameOf(ent.span, ent.mat)),
    tick: PORTAL.tick, guestTick: PORTAL.guestTick, row: PORTAL.row, guestRow: PORTAL.guestRow,
  },
  road: {
    item: () => 'road', onRemove: HAUL.roadRemove, stat: ['roadPlates'],
    info: HAUL.roadInfo, add: HAUL.roadAdd, plan: HAUL.roadPlan, preview: HAUL.roadPreview, build: HAUL.roadBuild, conflict: HAUL.roadConflict,
  },
  dock: {
    item: () => 'dock', stat: ['docksBuilt'],
    info: HAUL.dockInfo, add: HAUL.dockAdd, plan: HAUL.dockPlan, preview: HAUL.dockPreview, build: HAUL.dockBuild, conflict: HAUL.dockConflict,
    kw: (ent) => HAUL.dockKw(ent), pos: HAUL.dockPos, wireName: () => 'Truck Docks',
    tick: HAUL.dockTick, guestTick: HAUL.dockGuestTick, row: HAUL.dockRow, guestRow: HAUL.dockGuestRow,
  },
};
