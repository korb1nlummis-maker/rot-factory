// Catalog part: stack (Wave 10, stacked modular building inside the pile: plates, the switchback stair and ladders that snap into frame cubes, and the load
// column of cubes standing on cubes). Same rules as the other catalog files (see catalog.js): export exactly these four names and import nothing that
// imports upgrades.js, crafting.js, power.js or game.js at module level. The plates are the ordinary Floor Pad and the stair flights the ordinary Stair
// (build.js); stack.js installs the hooks that make them snap into cubes.
import * as ST from './stack.js';
import * as B from './build.js';
import * as M from './buildmesh.js';
import { ladderObject } from './stackmesh.js';
import { C, cellX, cellZ } from './config.js';

export const UPGRADES = [
  { id: 'stackKit', cat: 'mine', name: 'Stacked Building', desc: 'Unlocks building inside the frame cubes. Aim a Floor Pad into a cube and it snaps in as a floor plate (the bottom row) or a ceiling plate (the top row), as a full plate, a landing (half a plate, with an opening for stairs, ramps and belt ramps) or a shaft plate (a 2 x 2 opening for a belt lift or a ladder). A level is one plate row and three clear rows, the same 3 x 3 cells the Mine Rail cart, belts, lifts and you already fit. Aim two Stairs into a cube for a switchback stair to the level above, hang Ladders on the rim of an opening, and stack cubes on cubes: a column of cubes carries the load of the cubes above it down to the floor.', max: 1, cost: [ST.UNLOCK], req: { id: 'shellRamps', lvl: 1 }, effect: (t) => { t.stackKit = true; } },
];

const count = (g, type) => { let n = 0; for (const it of g.machines.items.values()) if (it.ent.type === type) n++; return n; };
export const RECIPES = (g) => {
  const T = g.T || {}, out = [];
  if (T.stackKit) {
    const bk = B.bestKind(T.frames);
    out.push({ id: 'ladder', kind: 'ladder', p: { mk: bk }, icon: '🪜', name: `${B.KIND_NAME[bk]} Ladder`, short: 'Ladder', price: ST.ladderPrice(bk), batch: [1, 5, 10], mat: 'timber', matN: 2,
      desc: 'A hatch ladder, one level (2.4 m) high. It hangs on the rim of an opening in a plate (a landing or a shaft plate) and takes you up to the plate above. Made of your best frame material.',
      use: 'Take it out and aim at the edge of an opening in a plate, from below or from above, and press B. W or Space climbs, S goes down, and at the top keep pressing W to step onto the plate.',
      statusFn: (gg) => `${count(gg, 'ladder')} ladders hung.` });
  }
  return out;
};

export const DEMAND = {};

const ladderGhost = (g, tool, plan) => {
  const mc = g.machines; if (!plan || !plan.ent) { mc.setGhost(null); return; }
  const e = plan.ent, key = `bl${plan.ok}${e.i},${e.j},${e.k},${e.dir}`;
  if (mc.ghostKey !== key) mc.setGhost(M.ghostBoxes([{ x0: cellX(e.i) - C / 2, x1: cellX(e.i) + C / 2, z0: cellZ(e.k) - C / 2, z1: cellZ(e.k) + C / 2, y0: e.j * C, y1: (e.j + ST.LADDER_H) * C }], plan.ok), key);
};
const installHooks = (g) => { if (g.player && g.player.climb == null) g.player.climb = (pl, input, dt) => ST.climbStep(g, pl, input, dt); ST.liftOnto(g, g.player); };

export const TYPES = {
  ladder: {
    plan: (g, tool, eye, dir) => ST.planLadder(g, tool, eye, dir),
    preview: ladderGhost,
    stat: 'stackLadders',
    build: (g, tool, e) => ST.buildLadder(g, tool, e),
    conflict: (g, e) => ST.conflictLadder(g, e),
    add: (m, e) => ST.addLadder(m, e, ladderObject),
    item: () => 'ladder',
    onRemove: (g, e) => ST.removeLadder(g, e),
    info: (g, e) => ({ title: `${B.KIND_NAME[e.mk] || 'Timber'} LADDER`.toUpperCase(), lit: true, lines: [`Hangs on the rim of a plate opening, one level (${(e.h).toFixed(1)} m)`, 'W or Space climbs, S goes down, keep pressing W at the top to step onto the plate', 'The hammer or X takes it down and gives it back'] }),
    tick: installHooks, guestTick: installHooks,
  },
};
