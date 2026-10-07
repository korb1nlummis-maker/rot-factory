// Catalog part: belts. Owned by wave 1A (4.1) and 2B (4.2).
// Rules (see catalog.js for the full contract): export exactly these four names, import nothing that imports upgrades.js,
// crafting.js, power.js, machines.js or game.js at module level (they import catalog.js, so that would be a cycle).
// UPGRADES: upgrade entries with ABSOLUTE costs (not multiplied by COST_SCALE). RECIPES: (g) => crafting bench rows (price is multiplied by K=3).
// DEMAND: { type: kW }. TYPES: { type: { cfg, copy, info, use, plan, build, ... } } (see catalog.js).
//
// Wave 1A: Mk1 to Mk6 belts, lifts, underground pairs, Lift Frames and the line planner. The numbers live in beltdata.js, the aim and
// placement code in beltparts.js (lift, underground, frame) and beltplan.js (planner, upgrade in place); logistics.js simulates them.
import * as THREE from 'three';
import { C, idx, cellX, cellZ } from './config.js';
import { V } from './catalog.js';
import {
  TIER_NAMES, TIER_MUL, TIER_KW, TIER_COST, SPACING, UG_SPAN, LIFT_FREE, FRAME_REACH, LIFT_FRAME_PRICE, K, CRANK,
  tierOf, rateOf, markOn, liftPriceOf, ugPriceOf, spanOf, framesNeeded, beltId, liftId, ugId, PART_PRICE, PART_KW, partOf,
} from './beltdata.js';
import * as SP from './splitparts.js';
import { openPanel as openSplitPanel } from './splitpanel.js';
import { planLift, previewLift, buildLift, liftConflict, planUg, buildUg, ugConflict, planFrame, buildFrame, frameConflict, makeFrameMesh, frameRating } from './beltparts.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const pct = (v) => `${Math.round((v ?? 0) * 100)}%`;
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];

// ---------------------------------------------------------------- upgrades (absolute prices, built for 10M+ wallets)
// Mk2 and Mk3 follow Belt Motors, Mk4 to Mk6 follow Belt Overdrive. T.beltMarks is a bit mask of the marks bought (see markOn in beltdata.js):
// each upgrade brings its own mark's belts, lifts and underground ends, and Mk1 lifts and ends come from Belt Lifts and Underground Belts.
const mk = (tier, cost, req, blurb) => ({
  id: `beltMk${tier + 1}`, cat: 'machine', name: `Belt ${TIER_NAMES[tier]}`, max: 1, cost: [cost], req,
  desc: `Unlocks ${TIER_NAMES[tier]} belts, lifts and underground ends at the bench: ${TIER_MUL[tier]}x the speed of a Mk1 belt on top of every belt upgrade you own (${fmt(rateOf({ beltSpeed: 1.6 }, tier))} plush per min per belt before upgrades), ${blurb}. Set a ${TIER_NAMES[tier]} belt over a lower mark to upgrade it in place.`,
  effect: (t) => { t.beltMarks = (t.beltMarks | 0) | (1 << tier); },
});
export const UPGRADES = [
  { id: 'beltLift', cat: 'machine', name: 'Belt Lifts', max: 1, cost: [24000], req: { id: 'beltSpeed', lvl: 2 },
    desc: 'Unlocks Belt Lifts and Lift Frames: a belt that stands up to 24 cells (14.4 m) tall and sets plush down one cell ahead at the top. Press Comma and Period to set the height. Over 8 cells a lift needs one Lift Frame beside it for each started 8 cells, or it sways and stands still.',
    effect: (t) => { t.liftOn = true; } },
  { id: 'beltUg', cat: 'machine', name: 'Underground Belts', max: 1, cost: [60000], req: { id: 'beltSpeed', lvl: 3 },
    desc: 'Unlocks underground ends: place an entry, then its exit in line ahead, up to 4 cells apart (6, 8, 10, 12 and 14 for the higher marks). Plush pass under belts, frames and plush pile without carving anything.',
    effect: (t) => { t.ugOn = true; } },
  mk(1, 150000, { id: 'beltSpeed', lvl: 3 }, `${(UG_SPAN[1])} cell undergrounds`),
  mk(2, 1200000, { id: 'beltSpeed', lvl: 6 }, `${(UG_SPAN[2])} cell undergrounds`),
  mk(3, 6000000, { id: 'overdrive', lvl: 1 }, `${(UG_SPAN[3])} cell undergrounds`),
  mk(4, 30000000, { id: 'overdrive', lvl: 2 }, `${(UG_SPAN[4])} cell undergrounds`),
  mk(5, 150000000, { id: 'overdrive', lvl: 3 }, `${(UG_SPAN[5])} cell undergrounds`),
  // wave 2B: mergers and splitters with rules. Absolute prices, like every catalog upgrade.
  { id: 'beltMerge', cat: 'machine', name: 'Belt Mergers', max: 1, cost: [450000], req: { id: 'splitter', lvl: 1 },
    desc: 'Unlocks Belt Mergers: a belt piece that takes plush from up to three lines (its back and both sides) and lets each waiting lane push in turn, so a busy lane can never starve the others. Set one over a belt (it keeps its mark) or on the floor.',
    effect: (t) => { t.mergeOn = true; } },
  { id: 'prioMerge', cat: 'machine', name: 'Priority Mergers', max: 1, cost: [2500000], req: { id: 'beltMerge', lvl: 1 },
    desc: 'Unlocks Priority Mergers: a merger whose three inputs are ranked (E sets the order). The best lane goes first and a lane below it only gets the gaps the better lanes leave, so a rare lane keeps flowing ahead of bulk.',
    effect: (t) => { t.pmergeOn = true; } },
  { id: 'smartSplit', cat: 'machine', name: 'Smart Splitters', max: 1, cost: [2000000], req: { id: 'beltSpeed', lvl: 4 },
    desc: 'Unlocks Smart Splitters: a splitter with one rule on each output (E opens the rules): a rarity range, one species, shiny, The One, Any, None, Anything else, or Overflow, which only gets what the other outputs refuse because they are full. Set one over a belt or a plain splitter.',
    effect: (t) => { t.smartOn = true; } },
  { id: 'progSplit', cat: 'machine', name: 'Programmable Splitters', max: 1, cost: [40000000], req: { id: 'smartSplit', lvl: 1 },
    desc: 'Unlocks Programmable Splitters: up to eight rules on each output, a default output for what nothing claims, and a best-output-first order. Needs Smart Splitters. Set one over a belt, a splitter or a Smart Splitter (its rules carry over).',
    effect: (t) => { t.progOn = true; } },
];

// ---------------------------------------------------------------- bench rows
const ICON = { belt: '🛤️', lift: '🛗', ug: '🕳️' };
export const RECIPES = (g) => {
  const T = g.T, out = [];
  const marks = [1, 2, 3, 4, 5].filter((k) => markOn(T, k));
  const use = 'Aim at the floor and press B (hold B to lay a line, press . for the Line Planner), or set it over a lower mark belt to upgrade it in place: you get the old belt back.';
  for (const k of marks) {
    out.push({
      id: beltId(k), kind: 'belt', p: { tier: k }, icon: ICON.belt, name: `Conveyor Belt ${TIER_NAMES[k]}`, short: `Belt ${TIER_NAMES[k]}`, price: TIER_COST[k], batch: [10, 50, 100],
      desc: `${TIER_NAMES[k]}: ${TIER_MUL[k]}x the speed of a Mk1 belt (${fmt(rateOf(T, k))} plush per min at your belt speed), draws ${TIER_KW[k]} kW per tile. A line is only as fast as its slowest tile.`, use,
      statusFn: () => `${fmt(rateOf(T, k))} plush per min per belt, ${TIER_KW[k]} kW per tile`,
    });
  }
  // lifts and underground ends: the Mk1 ones come with their own upgrade, every other mark brings its own with the mark
  for (const [kind, base, name, desc, use2, price] of [
    ['lift', T.liftOn, 'Belt Lift', 'Raises plush up to 24 cells (14.4 m): one piece per cell of height, so a 6 cell lift takes 6 pieces. Taller than 8 cells it needs Lift Frames beside it.', 'Aim at the floor where the lift starts (feed it from behind or the side) and press B. It faces the way you look and sets plush down one cell ahead, as many cells higher as you chose with <kbd>,</kbd> and <kbd>.</kbd> (<kbd>R</kbd> flips it down). Build the belt that takes them at the top.', liftPriceOf],
    ['ug', T.ugOn, 'Underground Belt', 'One end of an underground pair. Plush enter the first end and come out of the second, up to 4 cells apart (more for higher marks), passing under belts, frames and plush pile.', 'Aim at the floor and press B for the entry, then set the exit in line ahead of it (2 or more cells away, within its span). Whatever lies between is left alone.', ugPriceOf],
  ]) {
    for (const k of [0, ...marks]) {
      if (k === 0 && !base) continue;
      const id = kind === 'lift' ? liftId(k) : ugId(k);
      out.push({
        id, kind, p: { tier: k }, icon: ICON[kind], name: `${name} ${TIER_NAMES[k]}`, short: `${kind === 'lift' ? 'Lift' : 'Ug'} ${TIER_NAMES[k]}`, price: price(k) / K, batch: kind === 'lift' ? [2, 8, 24] : [2, 6, 12],
        desc: `${desc} ${TIER_NAMES[k]}: ${fmt(rateOf(T, k))} plush per min${kind === 'ug' ? `, spans up to ${spanOf(k)} cells` : ''}.`, use: use2,
        statusFn: () => (kind === 'lift' ? `${fmt(rateOf(T, k))} plush per min, draws ${TIER_KW[k]} kW per cell of height` : `${fmt(rateOf(T, k))} plush per min, span ${spanOf(k)} cells, ${TIER_KW[k]} kW per end`),
      });
    }
  }
  if (T.liftOn) out.push({
    id: 'liftframe', kind: 'liftframe', icon: '🗼', name: 'Lift Frame', short: 'Lift Frame', price: LIFT_FRAME_PRICE, batch: [1, 2, 4],
    desc: `A steel scaffold that holds a tall lift steady. A lift over ${LIFT_FREE} cells needs one for each started ${LIFT_FREE} cells (2 for 17 to 24), standing within ${FRAME_REACH} m of its column. Stands like a strut: rated to ${frameRating(T)} m deep${T.jacks ? '' : ' (Hydraulic Jacks raise it)'}.`,
    use: 'Aim at the floor right beside a tall lift and press B. The lift stops swaying and runs as soon as it has all its frames.',
    statusFn: (gg) => `${[...gg.machines.items.values()].filter((it) => it.ent.type === 'liftframe').length} placed`,
  });
  // mergers and splitters with rules (wave 2B): each is a belt tile, so it runs at the mark of the belt under it
  const partUse = 'Aim at a belt and press B to turn it into this (the belt keeps its mark, its plush ride on and the piece it replaces comes back), or aim at the floor. Build the lines into it, then E.';
  const rows = {
    merger: { desc: 'Takes plush from up to three lines at once: its back and both sides. Each lane that has plush waiting gets a turn in order, so one busy line cannot starve the others (a plain belt side-merge favors whoever arrives first).', use: partUse + ' It has nothing to set.', status: () => `Fair round robin between three lines, ${PART_KW.merger} kW` },
    pmerger: { desc: 'A merger whose inputs are ranked. The best lane goes first, and a lane below it only gets the gaps the better ones leave. Put a rare lane ahead of bulk.', use: partUse + ' E sets the order of the lanes, Shift+E copies it.', status: () => `Ranked lanes, ${PART_KW.pmerger} kW` },
    ssplit: { desc: 'A splitter with one rule on each output: a rarity range, one species, shiny, The One, Any, None, Anything else or Overflow. A plush goes to an output that names it, else to Any, else to Anything else. Overflow only gets what the others refuse because they are full. A plush nothing takes waits.', use: partUse + ' E opens the rules, Shift+E copies them. Unpowered it deals out in turn like a plain splitter.', status: () => `One rule per output, ${PART_KW.ssplit} kW` },
    psplit: { desc: 'A splitter with up to eight rules on each output, a default output for what nothing claims, and a best-output-first order. A Smart Splitter turns into one with its rules kept.', use: partUse + ' E opens the rules, Shift+E copies them. Unpowered it deals out in turn like a plain splitter.', status: () => `Eight rules per output, ${PART_KW.psplit} kW` },
  };
  for (const id of SP.PART_IDS) {
    if (!SP.unlocked(T, id)) continue;
    const spec = SP.PARTS[id], r = rows[id];
    out.push({ id, kind: id, icon: spec.icon, name: spec.name, short: spec.short, price: PART_PRICE[id], batch: id === 'psplit' ? [1, 2, 3] : [1, 3, 5], desc: r.desc, use: r.use, statusFn: r.status });
  }
  return out;
};

// ---------------------------------------------------------------- readouts
const powerLine = (t) => ((t.pw ?? 0) > 0.05 ? `Powered ${pct(t.pw)}` : 'No power: link it to a pole or a generator');

// the line a tile sits on: walk what it feeds (ahead) and what feeds it (behind). Cached for half a second.
export function lineScan(g, t) {
  const L = g.logi, key = `${t.id}:${L.tiles.size}:${Math.floor((g.time || 0) * 2)}`;
  if (g._beltScan && g._beltScan.key === key) return g._beltScan.res;
  const dist = new Map([[t.id, 0]]); let cur = t, d = 0;
  while (d < 400) { const nx = L.nextOf(cur); if (!nx || nx.type !== 'belt' || dist.has(nx.id)) break; d++; dist.set(nx.id, d); cur = nx; }
  const rev = new Map();
  for (const u of L.tiles.values()) { if (u.type !== 'belt') continue; const nx = L.nextOf(u); if (nx && nx.type === 'belt') { const l = rev.get(nx.id); if (l) l.push(u); else rev.set(nx.id, [u]); } }
  const q = [[t, 0]];
  for (let h = 0; h < q.length && q.length < 800; h++) { const [u, du] = q[h]; for (const p of rev.get(u.id) || []) if (!dist.has(p.id)) { dist.set(p.id, du - 1); q.push([p, du - 1]); } }
  let min = tierOf(t), at = 0, n = 0;
  for (const [id, dd] of dist) { const x = L.byId.get(id); if (!x) continue; n++; const tr = tierOf(x); if (tr < min || (tr === min && Math.abs(dd) < Math.abs(at) && tr < tierOf(t))) { min = tr; at = dd; } }
  const res = { n, min, at };
  g._beltScan = { key, res };
  return res;
}

const kindName = (t) => (t.lift ? 'lift' : t.ug ? 'underground end' : 'belt');
function rateLines(g, t) {
  const tier = tierOf(t), rate = rateOf(g.T, tier) * (t.hose ? 2 : 1), out = [];   // a vacuum hose runs at twice the belt speed
  const pw = t.halt ? 0 : Math.max(t.pw ?? 0, CRANK), now = rate * pw;
  out.push(`${TIER_NAMES[tier]} ${t.hose ? 'vacuum hose' : kindName(t)}: ${fmt(rate)} plush per min${now < rate * 0.97 ? `, ${fmt(now)} right now` : ''}`);
  const ln = lineScan(g, t);
  if (ln.n > 1) out.push(ln.min < tier ? `Line of ${ln.n}: slowest is Mk${ln.min + 1}${ln.at ? ` ${Math.abs(ln.at)} tile${Math.abs(ln.at) > 1 ? 's' : ''} ${ln.at > 0 ? 'ahead' : 'behind'}` : ''}, so it runs at ${fmt(rateOf(g.T, ln.min))} per min` : `Line of ${ln.n}: runs at ${fmt(rate)} per min`);
  return out;
}

// what lies between the two ends of an underground pair
function crossing(g, ent, span) {
  const L = g.logi, w = g.world; const cnt = { belts: 0, other: 0, plush: 0, frames: 0 };
  const frames = [...g.machines.items.values()].filter((it) => it.ent.type === 'frame').map((it) => it.ent);
  for (let m = 1; m < span; m++) {
    const i = ent.i + DX[ent.dir] * m, k = ent.k + DZ[ent.dir] * m, x = cellX(i), z = cellZ(k), y = (ent.j + 0.5) * C;
    const t = L.tiles.get(idx(i, ent.j, k)) || L.cols.get(idx(i, ent.j, k));
    if (t) { if (t.type === 'belt') cnt.belts++; else cnt.other++; } else if (w.solid(i, ent.j, k)) cnt.plush++;
    // a frame is a hollow cube (an old save may still hold the one cell deep kind): its depth is along its axis, its width across it
    if (frames.some((f) => { const hd = (f.d !== undefined ? f.d : C - 0.06) / 2 + 0.05; return (f.axis === 'z' ? Math.abs(f.cz - z) <= hd && Math.abs(f.cx - x) <= (f.w || 2.4) / 2 + 0.05 : Math.abs(f.cx - x) <= hd && Math.abs(f.cz - z) <= (f.w || 2.4) / 2 + 0.05) && y >= f.y0 - 0.1 && y <= f.y0 + f.h + 0.1; })) cnt.frames++;
  }
  const parts = []; if (cnt.belts) parts.push(`${cnt.belts} belt${cnt.belts > 1 ? 's' : ''}`); if (cnt.other) parts.push(`${cnt.other} machine${cnt.other > 1 ? 's' : ''}`); if (cnt.frames) parts.push(`${cnt.frames} frame cell${cnt.frames > 1 ? 's' : ''}`); if (cnt.plush) parts.push(`${cnt.plush} plush cell${cnt.plush > 1 ? 's' : ''}`);
  return parts.length ? parts.join(', ') : 'open floor';
}

const liftInfo = (g, t) => {
  const h = Math.abs(t.lift.h), dn = t.lift.h < 0, sup = g.logi.liftSupport(t), nx = g.logi.nextOf(t), ok = sup.ok && (t.pw ?? 0) > 0.05;
  return {
    title: `BELT LIFT ${TIER_NAMES[tierOf(t)].toUpperCase()}${dn ? ' (DOWN)' : ''}${sup.ok ? '' : ' · UNSUPPORTED'}`, lit: ok,
    lines: [
      `Carrying ${t.items.length} plush ${dn ? 'down' : 'up'} ${h} cells (${(h * C).toFixed(1)} m)`,
      sup.need ? (sup.ok ? `Held steady by ${sup.have} of ${sup.need} Lift Frame${sup.need > 1 ? 's' : ''}` : `UNSUPPORTED: it needs ${sup.need} Lift Frame${sup.need > 1 ? 's' : ''} within ${FRAME_REACH} m of it (${sup.have} there). It stands still until they are.`) : `Up to ${LIFT_FREE} cells needs no frame`,
      nx ? `Feeds ${nx.type === 'belt' ? 'the belt' : nx.type} at the ${dn ? 'bottom' : 'top'}` : `Nothing at the ${dn ? 'bottom' : 'top'} yet: build a belt, sorter or vault ${h} cells ${dn ? 'down' : 'up'}, one cell ahead`,
      (t.pw ?? 0) > 0.05 ? powerLine(t) : 'Unpowered: hand-cranked at a crawl. A pole near a generator makes it full speed.',
    ],
  };
};

const ugInfo = (g, t) => {
  const L = g.logi, isIn = t.ug.role === 'in', other = t.ug.pair != null ? L.byId.get(t.ug.pair) : null;
  const lines = [`Carrying ${t.items.length} plush`];
  if (isIn && other) lines.push(`Span ${t.ug.span} cells (${(t.ug.span * C).toFixed(1)} m): passes under ${crossing(g, t, t.ug.span)}`);
  else if (!isIn && other) lines.push(`Span ${t.ug.span} cells (${(t.ug.span * C).toFixed(1)} m): passes under ${crossing(g, other, t.ug.span)}`);
  else lines.push(isIn ? `Not paired yet: set its exit in line ahead, ${2} to ${spanOf(tierOf(t))} cells away` : 'Its entry is gone: nothing reaches this exit');
  lines.push(`${TIER_NAMES[tierOf(t)]} reaches ${spanOf(tierOf(t))} cells`);
  lines.push((t.pw ?? 0) > 0.05 ? powerLine(t) : 'Unpowered: hand-cranked at a crawl. A pole near a generator makes it full speed.');
  return { title: `UNDERGROUND ${isIn ? 'ENTRY' : 'EXIT'} ${TIER_NAMES[tierOf(t)].toUpperCase()}`, lit: (t.pw ?? 0) > 0.05 && !!other, lines };
};

const plainInfo = (g, t) => {
  const tier = tierOf(t);
  return {
    title: `BELT ${TIER_NAMES[tier].toUpperCase()}`, lit: (t.pw ?? 0) > 0.05,
    lines: [`Carrying ${t.items.length} plush`, `Speed ${((g.T.beltSpeed || 1) * TIER_MUL[tier]).toFixed(1)} tiles per second`, (t.pw ?? 0) > 0.05 ? powerLine(t) : 'Unpowered: hand-cranked at a crawl. A pole near a generator makes it full speed.', t.cd != null ? 'Bends here: it takes plush from the side.' : 'Place the next belt facing a new way to bend the line.', 'Set a higher mark belt over it to upgrade it. Ends in a sorter, vault, generator, charging station or the SORT bin and feeds it.'],
  };
};

// ---------------------------------------------------------------- types
export const TYPES = {
  // the belt tile itself (tier, lift and ug are plain fields on it). No `plan` here: tool kind 'belt' keeps the old placement path.
  belt: {
    item: (t) => (t.merger || t.smart ? partOf(t) : t.lift ? liftId(tierOf(t)) : t.ug ? ugId(tierOf(t)) : (t.detector || t.splitter || t.hose || t.rise) ? undefined : tierOf(t) > 0 ? beltId(tierOf(t)) : undefined),
    onRemove: (g, t) => {
      if (t.lift) g.giveItem(liftId(tierOf(t)), t.lift.h - 1);   // the hammer hands back every piece of the lift (the first one comes through `item`)
    },
    info: (g, t) => (t.merger || t.smart ? SP.info(g, t) : t.lift ? liftInfo(g, t) : t.ug ? ugInfo(g, t) : (tierOf(t) > 0 && !t.detector && !t.splitter && !t.hose && !t.rise ? plainInfo(g, t) : null)),
    infoExtra: (g, t) => (t.detector ? [] : rateLines(g, t)),   // a gate keeps its own readout first (the alarm line)
    // settings of a Smart or Programmable Splitter (rules, order, default) and a Priority Merger (lane order): cfg and copy/paste (Shift+E, E), the panel on E
    cfg: (t) => SP.cfgOf(t, V),
    check: (g, t, c) => SP.check(g, t, c),
    onCfg: (g, t, c) => SP.onCfg(g, t, c),
    use: (g, t) => {
      if (t.smart || t.merger === 'prio') { openSplitPanel(g, t.id); return true; }
      if (t.merger) { g.ui.hint('Belt Merger: it takes plush from its back and both sides in turn. It has nothing to set.', 3); return true; }
      return false;
    },
  },
  // the four parts as tools (merger, pmerger, ssplit, psplit): aim at a belt to convert it, or at the floor
  splitpart: { kinds: SP.PART_IDS, plan: SP.plan, preview: SP.preview, build: SP.build, conflict: SP.conflict },
  lift: { stat: 'beltLifts', plan: planLift, preview: previewLift, build: buildLift, conflict: liftConflict },
  ug: { stat: 'beltUgs', plan: planUg, build: buildUg, conflict: ugConflict },
  liftframe: {
    plan: planFrame, build: buildFrame, conflict: frameConflict,
    add: (machines, ent) => ({ obj: makeFrameMesh(ent) }),
    info: (g, e) => {
      let n = 0; for (const t of g.logi.lifts) if (Math.hypot(cellX(t.i) - e.x, cellZ(t.k) - e.z) <= FRAME_REACH) n++;
      return { title: 'LIFT FRAME', lit: true, lines: [n ? `Holds ${n} lift${n > 1 ? 's' : ''} beside it steady` : 'No tall lift within reach: set it within 1.3 m of a lift column', `Rated to ${frameRating(g.T)} m deep, like a strut`] };
    },
  },
};

export const DEMAND = {};
void SPACING; void THREE;
