// Catalog part: bins (assign a destination bin to bots, carts, earth movers, trucks, borers, claw rigs, mechs, rail lines and belt ends; name the Depot Beacons).
// Rules (see catalog.js): export exactly UPGRADES, RECIPES, DEMAND, TYPES; import nothing that imports upgrades.js, crafting.js, power.js or game.js.
// The `dest` setting itself is added to the cfg of every assignable thing by ext.js (cfgSpec calls bins.extendSpec), so Shift+E copy, E paste, the guest's
// `cfg` command and the host's check all carry it; the types below only make the ones that had no handler at all aimable (the aim looks for a handler)
// and give the Depot Beacon its name.
import { V, REJECT } from './catalog.js';
import * as BINS from './bins.js';

export const UPGRADES = [];
export const RECIPES = () => [];
export const DEMAND = {};

// one group, so a destination copied from a truck pastes onto a borer or a belt end
let NAME_CFG = null;
const plain = () => ({ group: 'bindest' });

export const TYPES = {
  truck: plain(), excavator: plain(), dozer: plain(), wheel: plain(), borer: plain(), claw: plain(), mech: plain(),
  beacon: {
    cfg: () => NAME_CFG || (NAME_CFG = { name: (v) => { const r = V.str(20)(v); return r === REJECT ? r : r.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '').replace(/[\ud800-\udbff]$/, '').trim(); } }), copy: [], group: 'beacon',   // (built on first use: catalog.js imports this file before V exists)
    info: (g, e) => ({
      title: `DEPOT BEACON: ${BINS.nameOf(g, e).toUpperCase()}`, lit: (e.pw ?? 0) > 0.05,
      lines: [...BINS.beaconLines(g, e), (e.pw ?? 0) > 0.05 ? 'Powered: bots and machines assigned to it use it.' : 'No power: what is assigned to it uses Auto until a cable from a live pole or generator reaches it.', 'Sorts and sells what you carry, fast travel and recall point.', 'E opens the travel menu.'],
    }),
    row: (g) => BINS.row(g), guestRow: (g, d) => BINS.guestRow(g, d),
  },
};
