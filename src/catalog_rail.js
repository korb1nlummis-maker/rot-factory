// Catalog part: rail (the Mine Rail shuttle: track, stations and carts that rush you back to base from the work face).
// Rules (see catalog.js for the full contract): export exactly these four names, import nothing that imports upgrades.js,
// crafting.js, power.js or game.js at module level (they import catalog.js, so that would be a cycle). rail.js is a plain module of the game.
// UPGRADES: upgrade entries with ABSOLUTE costs (not multiplied by COST_SCALE). RECIPES: (g) => crafting bench rows (price is multiplied by K=3).
// DEMAND: { type: kW }. TYPES: { type: { cfg, copy, info, use, plan, build, ... } } (see catalog.js). The tool kind and the ent type share one key.
import * as R from './rail.js';

const enumOf = (list) => (v) => (list.includes(v) ? v : undefined);   // a validator returns undefined to refuse (the registry's REJECT is not importable here)
const text = (max) => (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max) : undefined);
const count = (g, type) => { let n = 0; for (const it of g.machines.items.values()) if (it.ent.type === type) n++; return n; };

export const UPGRADES = [
  { id: 'railShuttle', cat: 'mine', name: 'Mine Rail Shuttle', desc: 'Unlocks Mine Rail track, Rail Stations and Rail Carts. Lay a track along the tunnel floor from the base to the work face (hold B and walk; it turns, joins and climbs by itself), set a Rail Station at each end and a Cart on the track. Press E on the cart to sit in it, then Backspace rushes you home from anywhere along the line, and again sends you back out. A line runs at 8 m/s when a station on it stands within reach of a powered pole or generator, and at a hand crank crawl of 2 m/s when it does not. A cart also carries 120 plush hands free and sells them at the base bin.', max: 1, cost: [R.UNLOCK_PRICE], req: { id: 'steel', lvl: 1 }, effect: (t) => { t.railShuttle = true; } },
];

export const RECIPES = (g) => {
  const T = g.T || {}; if (!T.railShuttle) return [];
  return [
    { id: 'rail', kind: 'rail', icon: '🛤️', name: 'Mine Rail', short: 'Rail', price: R.PRICE.rail, batch: [1, 10, 50, 100],
      desc: 'One cell (0.6 m) of track for the mine shuttle. It joins the pieces beside it, bends at corners, branches into junctions and climbs or drops one cell at a time (45 degrees). Needs a floor and 3 cells of headroom, so dig the tunnel first.',
      use: 'Take it out, aim at the tunnel floor and press B, or hold B and walk to lay a line. Lay it from the base to the work face, then set a Rail Station at each end and a Rail Cart on the track. The hammer takes a piece back.',
      statusFn: (gg) => `${count(gg, 'rail')} of ${R.MAX_PIECES} pieces laid.` },
    { id: 'railstn', kind: 'railstn', icon: '🚉', name: 'Rail Station', short: 'Station', price: R.PRICE.railstn, batch: [1, 2, 5],
      desc: 'A station on a piece of track. A BASE station stands near the SORT bin (carts that stop within 7 m of the bin sell their loads), a FACE station marks the work end. A station within reach of a powered pole or generator runs its whole line at 8 m/s; without one the line is hand cranked at 2 m/s.',
      use: 'Take it out, aim at a piece of track and press B. It is a BASE station when it is within 45 m of the bin and a FACE station beyond. E on it switches BASE and FACE.',
      statusFn: (gg) => `${count(gg, 'railstn')} stations placed.` },
    { id: 'railcar', kind: 'railcar', icon: '🚃', name: 'Rail Cart', short: 'Cart', price: R.PRICE.railcar, batch: [1, 2, 5],
      desc: 'A mine cart for two that runs on Mine Rail. It carries you at line speed with the camera riding along, and it carries 120 plush with your hands free. Backspace calls the nearest cart to you and rushes you home, and sends you back out again from the base.',
      use: 'Take it out, aim at a piece of track and press B. E on it with plush in your hands loads them, E with empty hands sits you in it. In it: Backspace goes home (or back to the face from the base), E or Space hops off.',
      statusFn: (gg) => `${count(gg, 'railcar')} carts placed.` },
  ];
};

// a station draws 3 kW: power.js counts it as a consumer (a pole in reach or a cable wires it), and its .pw sets how fast its whole line runs
export const DEMAND = { railstn: R.STATION_KW };

const common = (extra = {}) => ({
  conflict: (g, e, tool) => R.conflict(g, e, tool),
  build: (g, tool, e) => R.buildFields(g, tool, e),
  ...extra,
});

export const TYPES = {
  rail: common({
    stat: 'railLaid', add: (m, e) => R.addRail(m, e), item: () => 'rail', onRemove: (g, e) => R.onRemoveRail(g, e),
    plan: (g, tool, eye, dir) => R.planRail(g, tool, eye, dir), preview: (g, tool, plan) => R.ghost(g, tool, plan),
    info: (g, e) => R.infoRail(g, e),
  }),
  railstn: common({
    stat: 'railStns', add: (m, e) => R.addStation(m, e), item: () => 'railstn', wireName: () => 'Rail Station', kw: () => R.STATION_KW,
    cfg: { role: enumOf(['base', 'face']), name: text(16) }, group: 'railstn', copy: ['role'],
    onCfg: (g, e) => R.rebuildStationObj(g, e),
    use: (g, e) => { const car = R.carBeside(g, e); if (car) return R.useCar(g, car, R.localWho(g)); const next = e.role === 'base' ? 'face' : 'base', r = g.setCfg(e, { role: next }); if (!r.ok) g.ui.hint(r.why || 'Could not change that', 2.5); else g.ui.hint(`This is now a ${next.toUpperCase()} station.`, 2.5); return true; },
    plan: (g, tool, eye, dir) => R.planStation(g, tool, eye, dir),
    info: (g, e) => R.infoStation(g, e),
  }),
  railcar: common({
    stat: 'railCarts', add: (m, e) => R.addCar(m, e), item: () => 'railcar', onRemove: (g, e) => R.onRemoveCar(g, e),
    cfg: { name: text(16) },
    use: (g, e) => R.useCar(g, e, R.localWho(g)),
    plan: (g, tool, eye, dir) => R.planCar(g, tool, eye, dir),
    info: (g, e) => R.infoCar(g, e),
    tick: (g, dt) => R.tick(g, dt, true), guestTick: (g, dt) => R.tick(g, dt, false),
    row: (g) => R.row(g), guestRow: (g, d) => R.applyRow(g, d),
  }),
};
