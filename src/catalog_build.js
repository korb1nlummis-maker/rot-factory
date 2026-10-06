// Catalog part: build (Wave 3, the build shell: floor pads, catwalks, walls, ramps, stairs and the Leveling Pad machine; the blueprint copy of wave 8 may add to this file later).
// Rules (see catalog.js for the full contract): export exactly these four names, import nothing that imports upgrades.js,
// crafting.js, power.js or game.js at module level (they import catalog.js, so that would be a cycle). build.js is a plain module of the game.
// UPGRADES: upgrade entries with ABSOLUTE costs (not multiplied by COST_SCALE). RECIPES: (g) => crafting bench rows (price is multiplied by K=3).
// DEMAND: { type: kW }. TYPES: { type: { cfg, copy, info, use, plan, build, ... } } (see catalog.js). The tool kind and the ent type share one key.
import * as B from './build.js';
import { walkStep } from './build.js';

const rail = (v) => (Number.isInteger(v) && v >= 0 && v <= 15 ? v : undefined);   // a validator returns undefined to refuse (the registry's REJECT is not importable here)
const bool = (v) => (typeof v === 'boolean' ? v : undefined);

// ---------- unlocks (absolute prices, sized for the 10M+ wallets of the late game) ----------
export const UPGRADES = [
  { id: 'shellPads', cat: 'mine', name: 'Foundation Pads', desc: 'Unlocks Floor Pads (4 x 4 cells, one deep, in every frame material you own), Catwalks and Walls. A pad is a flat, solid floor that never falls and carries no roof load: belts, poles, frames and trucks stand on it. Pads snap to each other and to frames. Hold B and drag (or use - and =) to zoop a line of up to 10 (Shift: a block up to 5 x 5) in one go, X takes one piece down, Shift+X the whole zoop. Pads need clear ground and 4 cells of headroom: dig first.', max: 1, cost: [3000000], req: { id: 'steel', lvl: 1 }, effect: (t) => { t.shellPads = true; } },
  { id: 'shellRamps', cat: 'mine', name: 'Ramps and Stairs', desc: 'Unlocks the Ramp (rises one cell over two), the Truck Ramp (one cell over three, shallow enough for a Haul Truck) and the Stair (two cells over four). Aim at the side of a pad and the piece climbs up to it.', max: 1, cost: [6000000], req: { id: 'shellPads', lvl: 1 }, effect: (t) => { t.shellRamps = true; } },
  { id: 'shellLevel', cat: 'machine', name: 'Leveling Pad', desc: 'Unlocks the Leveling Pad machine: it digs out a box of plush in front of it and lays a floor of pads, one 4 x 4 slot at a time, so you do not dig by hand. Draws 15 kW, pays for each pad as it lays it.', max: 1, cost: [12000000], req: { id: 'shellRamps', lvl: 1 }, effect: (t) => { t.shellLevel = true; } },
];

// Pads of the first three materials can be made from your Lumber, Steel Beams or Concrete Mix stock (the bench rule: stock must be cheaper than buying the shortfall, so the units are
// 4, 4 and 2). Heavier pads cost more than a unit of their own material is worth, so they are bought outright. Catwalks, ramps, stairs and walls use Lumber for their frames.
const PAD_MAT = { timber: 4, steel: 4, concrete: 2 };
const count = (g, type) => { let n = 0; for (const it of g.machines.items.values()) if (it.ent.type === type) n++; return n; };
const USE_PAD = 'Take it out, aim at the floor or at the side of a pad and press B: a 4 x 4 floor that snaps to other pads and to frames. The 4 x 4 x 4 space above must be empty: dig first. Hold B (or left click) and drag along a line, then let go, to lay up to 10 in one go for one cost (Shift: drag a block up to 5 x 5), or set the count with - and = (Shift: the width) and just press B. R turns it, Shift+R nudges it a cell, Ctrl locks it to the world grid. X takes one piece down, Shift+X the whole zoop. E on a pad puts up or takes down a rail on the edge you aim at.';

export const RECIPES = (g) => {
  const T = g.T || {}, out = [], frames = T.frames || [];
  const bk = B.bestKind(frames);
  if (T.shellPads) for (const k of B.KINDS) {   // every material is on the bench once the pads are unlocked (a kind you have no stock of is bought at the full price while crafting), the price is what tiers them
    out.push({ id: 'pad:' + k, kind: 'pad', p: { mk: k }, icon: B.KIND_ICON[k], name: `${B.KIND_NAME[k]} Floor Pad`, short: 'Pad', price: B.padPrice(k), batch: [1, 10, 25], ...(PAD_MAT[k] ? { mat: k, matN: PAD_MAT[k] } : {}),
      desc: `A flat 4 x 4 floor (2.4 m square), one cell deep. Never falls, takes no roof load, holds belts, poles, frames and trucks. Made of ${B.KIND_NAME[k]} stock.`, use: USE_PAD,
      statusFn: (gg) => `${count(gg, 'pad')} pads placed. Needs clear ground and 4 cells of headroom.` });
  }
  if (T.shellPads) out.push({ id: 'catwalk', kind: 'catwalk', p: { mk: bk }, icon: '🪜', name: `${B.KIND_NAME[bk]} Catwalk`, short: 'Catwalk', price: B.pricePer('catwalk', 'catwalk', bk), batch: [1, 10, 25], mat: 'timber', matN: 2,
    desc: 'A thin deck, one cell wide and four long, with rails on both sides. Holds belts and poles but not trucks. Half the price of a pad. Made of your best frame material.',
    use: 'Aim at the floor, or at the end or side of a pad or another catwalk, and press B: it runs the way you face (or away from the plate you aim at). - and = lay up to 10 end to end, R turns it. E toggles the rail on the edge you aim at.',
    statusFn: (gg) => `${count(gg, 'catwalk')} catwalks placed. Needs 3 cells of headroom.` });
  if (T.shellPads) out.push({ id: 'wall', kind: 'wall', p: { mk: 'timber' }, icon: '🧱', name: 'Wall Section', short: 'Wall', price: B.pricePer('wall', 'wall', 'timber'), batch: [1, 5, 10], mat: 'timber', matN: 32,
    desc: 'A 4 x 4 wall of bulkhead panels. Never falls, holds the pile back and anchors the roof beside it. The same price as 16 Bulkhead Panels.',
    use: 'Aim at the top of a pad and the wall goes along the nearest edge; aim at the floor and it stands across your view. - and = lay up to 10 in a row, R turns it. X takes a whole section down and gives it back.',
    statusFn: (gg) => `${count(gg, 'wall')} wall sections placed.` });
  if (T.shellRamps) {
    out.push({ id: 'wramp', kind: 'wramp', p: { mk: bk }, icon: '📐', name: `${B.KIND_NAME[bk]} Ramp`, short: 'Ramp', price: B.pricePer('wramp', 'wramp', bk), batch: [1, 5, 10], mat: 'timber', matN: 2,
      desc: 'A walkable ramp, 2 x 2 cells, rising one cell (0.6 m) over two. About 27 degrees: fine on foot, too steep for trucks.', use: 'Aim at the side of a pad and the ramp climbs up to it, or aim at the floor and it rises the way you face. R turns it.',
      statusFn: (gg) => `${count(gg, 'wramp')} ramps placed.` });
    out.push({ id: 'wramp:haul', kind: 'wramp', p: { mk: bk }, icon: '🚧', name: `${B.KIND_NAME[bk]} Truck Ramp`, short: 'Truck Ramp', price: B.pricePer('wramp', 'wramp:haul', bk), batch: [1, 5, 10], mat: 'timber', matN: 4,
      desc: 'A wide ramp, 4 x 3 cells, rising one cell over three: gentle enough for a Haul Truck (up to one cell of rise per three of run).', use: 'Aim at the side of a pad and the ramp climbs up to it, or aim at the floor and it rises the way you face. R turns it.',
      statusFn: (gg) => `${count(gg, 'wramp')} ramps placed.` });
    out.push({ id: 'stair', kind: 'stair', p: { mk: bk }, icon: '🪜', name: `${B.KIND_NAME[bk]} Stair`, short: 'Stair', price: B.pricePer('stair', 'stair', bk), batch: [1, 5, 10], mat: 'timber', matN: 2,
      desc: 'A stair, 1 x 4 cells, rising two cells (1.2 m) over four, with rails. It meets a pad two cells up.', use: 'Aim at the side of a raised pad and the stair climbs up to it, or aim at the floor and it rises the way you face. R turns it.',
      statusFn: (gg) => `${count(gg, 'stair')} stairs placed.` });
  }
  if (T.shellLevel) out.push({ id: 'levelpad', kind: 'levelpad', p: { mk: bk }, icon: '🏗️', name: 'Leveling Pad', short: 'Leveler', price: B.LEVEL_PRICE, batch: [1, 1, 1],
    desc: 'A machine that digs out a box of plush in front of it and floors it with pads, one 4 x 4 slot at a time. Draws 15 kW and pays for each pad it lays.',
    use: 'Set it on open floor facing the area (it needs a pole or generator within reach). - and = choose the size, 1 to 3 pads on a side. E starts and stops it. It skips slots with a machine, a wall or The One in them and never digs out The One.',
    statusFn: (gg) => `${count(gg, 'levelpad')} placed.` });
  return out;
};

export const DEMAND = { levelpad: B.LEVEL_KW };

const installWalk = (g) => { if (g.player && g.player.walk == null) g.player.walk = (pl) => walkStep(g, pl); B.holdTick(g); };   // the player's ramp and stair hook, and the end of a hold-and-drag zoop
const shellType = (extra = {}) => ({
  add: (m, e) => B.addBuild(m, e),
  item: (e) => B.itemOfBuild(e),
  onRemove: (g, e) => B.removeBuild(g, e),
  info: (g, e) => B.infoBuilt(g, e),
  build: (g, tool, e) => B.buildPieces(g, tool, e),
  conflict: (g, e, tool) => B.conflictOf(g, tool.kind, tool.id, e),
  preview: (g, tool, plan) => B.previewPieces(g, tool, plan),
  ...extra,
});

export const TYPES = {
  pad: shellType({
    cfg: { rail }, copy: ['rail'], group: 'shellrail', use: (g, e) => B.useBuilt(g, e), onCfg: (g, e) => B.rebuildRails(g, e),
    plan: (g, tool, eye, dir, yaw) => B.planPad(g, tool, eye, dir, yaw),
    tick: installWalk, guestTick: installWalk,      // one hook for the player's ramp and stair walking, installed once for the whole shell
  }),
  catwalk: shellType({ cfg: { rail }, copy: ['rail'], group: 'shellrail', use: (g, e) => B.useBuilt(g, e), onCfg: (g, e) => B.rebuildRails(g, e), plan: (g, tool, eye, dir, yaw) => B.planCatwalk(g, tool, eye, dir, yaw) }),
  wall: shellType({ plan: (g, tool, eye, dir, yaw) => B.planWall(g, tool, eye, dir, yaw) }),
  wramp: shellType({ plan: (g, tool, eye, dir, yaw) => B.planSlope(g, tool, eye, dir, yaw) }),
  stair: shellType({ plan: (g, tool, eye, dir, yaw) => B.planSlope(g, tool, eye, dir, yaw) }),
  levelpad: shellType({
    cfg: { on: bool }, onCfg: (g, e, clean) => B.onLevelCfg(g, e, clean),
    info: (g, e) => B.infoLevel(g, e), use: (g, e) => B.useLevel(g, e),
    plan: (g, tool, eye, dir, yaw) => B.planLevel(g, tool, eye, dir, yaw),
    tick: (g, dt) => B.tickLevels(g, dt),
    row: (g) => B.levelRow(g), guestRow: (g, d) => B.applyLevelRow(g, d),
  }),
};
