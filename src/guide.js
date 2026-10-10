// The Field Guide: every page of the in-game guide as plain data (no THREE, no DOM). The pages used to be chalkboards standing in the hall; the numbers
// on them still come from the game data (fan spacing, support ratings, arch spans, earth mover tuning ...) and src/tests/guide.js checks them.
// A page: { cat, title, rows, foot, overflow }. A row is a string, '#Heading' (a heading), or [left, right] (two columns). The Controls pages are built
// from the keybind table each time, so they always show the keys the player has chosen.
import { FRAME_TYPES, STRUT_DEPTH, defaultTuning } from './upgrades.js';
import { earthTune, EARTH_KW, STALE_CHOKE } from './earth.js';
import { fanSpacing, STALE_START, STALE_SPAN, STALE_OK, FAN_R, VENT_R } from './dust.js';
import { ARCH_SPANS } from './loadtrace.js';
import { VEHICLES, CUBE_CLEAR, ROAD, DOCK } from './haul.js';
import { KW as PORTAL_KW } from './portal.js';
import * as STACK_DATA from './stack.js';
import { CONTROLS } from './controls.js';
import * as KB from './keybinds.js';

// the categories of the menu, in order. 'How to Play' is the existing How to Play text (index.html), shown by the menu from the page itself.
export const CATEGORIES = ['How to Play', 'Getting Started', 'Digging and Support', 'Air and Depth', 'Machines and Power', 'Belts and Hoses', 'Crew and Bots', 'Hazards', 'Gear and Upgrades', 'Controls'];
const CAT = {
  'RULES OF THE SHIFT': 'Getting Started',
  'TUNNEL CRAFT': 'Digging and Support', 'HOW DEEP CAN IT GO?': 'Digging and Support', 'TUNNELS AND PORTALS': 'Digging and Support', 'STACKED BUILDING': 'Digging and Support',
  'AIR AT DEPTH': 'Air and Depth', 'HOW FANS WORK': 'Air and Depth',
  'POWER NEEDS WIRES': 'Machines and Power', 'EARTH MOVERS': 'Machines and Power',
  'BELTS AND HOSE': 'Belts and Hoses', 'BOTS AND THE CREW': 'Crew and Bots', 'SLIDES AND AVALANCHES': 'Hazards',
  'SURVIVING THE DEPTH': 'Gear and Upgrades', 'CARE AND NIGHT SHIFT': 'Gear and Upgrades',
};

// the line-fit rule (the old chalkboards measured pixels): a one column row, a two column row and a foot line must stay short enough to read at a glance
export const FIT = { single: 62, pair: 76, left: 34, foot: 80 };
export const pageText = (p) => [p.title, ...p.rows.map((r) => (Array.isArray(r) ? r.join(' ') : r)), p.foot].join('\n');
export function overflows(rows, foot = '') {
  for (const r of rows) { if (Array.isArray(r)) { if (r[0].length > FIT.left || r[0].length + r[1].length > FIT.pair) return true; } else if (r.length > FIT.single) return true; }
  return foot.split('\n').some((ln) => ln.length > FIT.foot);
}

// the Controls pages, one per group of the keybind table, with the keys the player has now
export function controlPages() {
  return CONTROLS.map((gr) => {
    const rows = gr.rows.map((r) => [r.name === 'Hotbar slots 1 to 9' ? '1 to 9' : r.chips.map((c) => c.label).join(' or '), r.name]);
    return { cat: 'Controls', title: 'CONTROLS: ' + gr.group.toUpperCase(), rows, foot: gr.group === 'Tools and building' ? 'Wires: Left click a machine, then another.' : gr.group === 'Moving' ? 'Pause menu, Controls tab: every key in full, and rebinding.' : '', overflow: false, controls: true };
  });
}

export function guidePages() {
  const pages = [];
  const add = (title, rows, foot = '') => { const p = { cat: CAT[title], title, rows, foot, overflow: overflows(rows, foot) }; pages.push(p); return p; };
  const fm = (v) => (isFinite(v) ? (v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + ' km' : v + ' m') : 'any depth');
  // 0. the rules of the shift (the easel by the start)
  add('RULES OF THE SHIFT', [
    'Millions of plush. ONE matters: the Rotto.',
    'Click = grab. - = scoop, [ ] = vacuum.',
    'Stand near the bin: it eats what you carry.',
    'Cash buys bags, tools, belts, crew (E).',
    'Dig tunnels. Prop the roof. F = flashlight.',
    'DO NOT CLIMB. Piles slide.',
    'Cannot find it? Exit is 4.9 km EAST.',
  ].map((r, n) => `${n + 1}. ${r}`), `Press ${KB.keyText('guide')} any time to open this guide.`);
  // 1. how deep each support can go
  add('HOW DEEP CAN IT GO?', [
    ...Object.entries(FRAME_TYPES).map(([k, f]) => [`${f.name}`, `${fm(f.maxDepth)}   reach ${f.radius} m`]),
    ['Strut / Hydraulic Jack', `${STRUT_DEPTH.strut} m / ${STRUT_DEPTH.jack} m`],
  ], 'At 85% of its rating a support creaks. At 100% it breaks.\nWide rooms and long spans need more supports sharing the weight.');
  // 2. the air
  const fsp = (d) => { const s = fanSpacing(d); return isFinite(s) ? `a fan every ${s.toFixed(s < 10 ? 1 : 0)} m` : 'no fan needed'; };
  add('AIR AT DEPTH', [
    `Past ${STALE_START} m the air in a tunnel goes stale.`,
    `Fresh enough to ${Math.round(STALE_START + STALE_OK * STALE_SPAN)} m. Then you cough.`,
    '#Support Fans: how many',
    ...[400, 500, 600, 800, 1000, 1500].map((d) => [`at ${d} m deep`, fsp(d)]),
    `A Support Fan blows ${FAN_R} m the way you face.`,
    `Rule: spacing = ${STALE_OK} x ${FAN_R} / stale. Needs power.`,
  ], 'Vent Fan: ' + VENT_R + ' m all around. Respirator: 20% less dust per level.\nCough = walk out. Pass out = you wake at a depot.');
  // 2b. how fans work: direction, spacing, power
    add('HOW FANS WORK', [
    '#Support Fan',
    'Aim at a frame, press B: it clamps under the top beam.',
    'It blows the way YOU face when you set it down:',
    '    face deeper, toward the work face, so fresh air',
    '    runs INTO the tunnel and pushes stale air back out.',
    `Reach ${FAN_R} m. A wall, plush or a shut door stops it.`,
    '#How close',
    ...[300, 500, 800, 1200].map((d) => [`at ${d} m deep`, fsp(d)]),
    `Rule: spacing = ${STALE_OK} x ${FAN_R} / stale. Overlap beats gaps.`,
    '#Power',
    'No power, no air. Run a cable to it from a live pole.',
    'A brownout makes every fan on the grid weaker.',
  ], `Vent Fan: ${VENT_R} m all around, for rooms and junctions.\nCough or a dim screen edge = fans too far apart.`);

  // 3. what to carry, by depth
  add('SURVIVING THE DEPTH', [
    ['0 to 150 m', 'timber, struts, lantern, flares'],
    ['150 to 380 m', 'steel frames, Structural Survey'],
    ['375 m and up', 'Support Fans, Respirator'],
    ['800 m and up', 'concrete, Air Tank, a Depot'],
    ['1,300 m and up', 'rebar, Hard Hat, Padding'],
    ['4.9 km', 'the exit. Bring everything.'],
    '#Always',
    ['Stress Lens', 'amber = soon, red = now'],
    ['Rope Anchors', 'safe footing on the slope'],
    ['Depot Beacon', 'recall and sell far out'],
    ['Medkit, canister', 'first aid and 40 s of air'],
  ], 'The Survey shows depth, load and the fan spacing you need.');
  // 4. how to dig
  add('TUNNEL CRAFT', [
    '1. Dig a 4 x 4 x 4 room out first.',
    '2. Set a frame: a 2.4 m cube. No digging.',
    '3. Left and Right turn a frame: curves.',
    '4. Cubes snap on any side. Down: grid.',
    `5. Unsupported roof: about 7 m near the top,`,
    '    less the deeper and heavier it gets.',
    '6. Frames, struts and jacks share the load.',
    '7. Hammer a support to read its load.',
    '8. Tamping adds 1.2 m of safe roof a level.',
    '9. A creaking roof is about to fall. Leave.',
    '10. A shaft up and out lets daylight down.',
  ], 'Remove supports and the tunnel comes down.\nMine Rail: hold B to lay track, Backspace rushes you home.');

  // 5b. power: wires are the only way it travels
  add('POWER NEEDS WIRES', [
    '#Cables are the only link',
    ['Generator', 'burns plush, powers nothing alone'],
    ['Power Pole', 'a hub: dead till a generator is wired'],
    ['Every machine', 'its own cable (a belt line: one)'],
    ['Charging Station', '1 kW: it needs a cable too'],
    ['Two generators', 'wired together add their power'],
    ['One cable', `${defaultTuning().cableLen} m, more with Grid Range`],
    ['Burn time, 8 kW', 'Common 4.5, Uncommon 12, Rare 30, Epic 75 min'],
    '#Build order',
    '1. A generator, fed plush.',
    '2. Cable: generator to pole. The lamp lights.',
    '3. Cable: pole to each machine, or to the next pole.',
  ], 'Standing next to a pole or generator is not enough.\nNo cable, no power. The info panel says Not wired.');

  // 5. the earth movers: what they dig, what they need, what stops them. Every number comes from the game data.
  { const T0 = defaultTuning(), ex = earthTune(T0, 'excavator'), dz = earthTune(T0, 'dozer'), wh = earthTune(T0, 'wheel'), tk = earthTune(T0, 'truck'); const choke = Math.round(STALE_START + STALE_CHOKE * STALE_SPAN);
    add('EARTH MOVERS', [
      ['Excavator', `${2 * ex.latHalf + 1} x ${ex.vert} face, ${ex.hopper} hopper`],
      ['Bulldozer', `${dz.blade} wide blade, ${dz.vert} high`],
      ['Bucket-Wheel', `${2 * wh.latHalf + 1} x ${wh.vert} face, ${wh.hopper} hopper`],
      ['Haul Truck', `${tk.bed} plush, ${tk.range} m radio`],
      '#Rules',
      'Hopper full? A belt behind it, a truck, or E.',
      'The canopy is rated like your best frame:',
      '    too heavy for it and the machine halts.',
      `Past ${choke} m stale air stops it: hang a fan.`,
      'A Vehicle Scanner catches The One.',
    ], `Power: Excavator ${EARTH_KW.excavator} kW, Dozer ${EARTH_KW.dozer}, Wheel ${EARTH_KW.wheel}, Truck ${EARTH_KW.truck}.\nTrucks sell at the bin or a Depot Beacon.`); }

  // 6. the two tunnel classes, the arches and the Portal (wave 6). Every number comes from the game data.
  { const A6 = ARCH_SPANS[6], A8 = ARCH_SPANS[8], A12 = ARCH_SPANS[12], pct = (s) => Math.round(s.derate * 100), clear = (v) => `${v.w} x ${v.h}`;
    add('TUNNELS AND PORTALS', [
      '#Normal tunnel: frame cubes',
      [`4 x 4 x 4 cube`, `${clear(CUBE_CLEAR)} cells clear`],
      'Minecart, belt, lift, fan, walker.',
      '#Giant tunnel: arches (4 deep)',
      [`Haul Arch ${A6.span} wide`, `${A6.cw} x ${A6.ch} clear, ${pct(A6)}% depth`],
      [`Wide Arch ${A8.span} wide`, `${A8.cw} x ${A8.ch} clear, ${pct(A8)}% depth`],
      [`Cathedral ${A12.span} wide`, `${A12.cw} x ${A12.ch} clear, ${pct(A12)}% depth`],
      [`Haul Truck needs`, `${clear(VEHICLES.truck)} clear`],
      [`Bucket-Wheel needs`, `${clear(VEHICLES.wheel)} clear`],
      '#Portal',
      'A giant arch at the pile mouth bores and lines.',
      'Halts when the mountain presses. Needs fans.',
      'Never takes The One without a Scanner.',
    ], `Portal ${PORTAL_KW[6]} / ${PORTAL_KW[8]} / ${PORTAL_KW[12]} kW. Roads ${ROAD.speed}x speed. Docks ${DOCK.charge} kW.`); }

  // 7. stacked building inside the pile (wave 10): levels, plates, stairs, ladders and the load column. The numbers come from the game data.
  { const ST = STACK_DATA;
    add('STACKED BUILDING', [
      '#A level inside a cube',
      [`${ST.LEVEL} rows`, `1 plate row + ${ST.LEVEL - 1} clear`],
      `Fits the walker, cart, belt and lift.`,
      '#Plates: a Floor Pad aimed into a cube',
      [ST.OPENINGS[0].name, 'the whole 4 x 4 floor'],
      [ST.OPENINGS[1].name, `half: ${ST.OPENINGS[1].holes} open cells`],
      [ST.OPENINGS[2].name, `${ST.OPENINGS[2].holes} open cells`],
      '#Up one level',
      ['Switchback stair', '2 Stairs, 2.4 m'],
      ['Ladder', 'rim of an opening'],
      ['Belt lift or ramp, elevator', 'through the openings'],
      '#Load',
      'A cube on a cube is one column.',
      'The cube at the bottom carries the lot.',
    ], `Stacked Building unlocks at ${(ST.UNLOCK / 1e6).toFixed(0)}M. Aim a Wall at a cube for a door frame.`); }

  // 8. belts and the vacuum hose, the crew, slides and avalanches, care packages and Night Shift (the numbers are checked against the game data by tests/guide.js)
  add('BELTS AND HOSE', [
    '#Laying',
    'Hold B and sweep: a line, bends and all.',
    'Click, aim, click: the whole route is laid.',
    'Press, drag, let go: a cord, bends put in.',
    '#Reading it',
    'Chevron arrows show which way it carries.',
    'A gold last piece feeds a bin. Stop there.',
    '#Belt intake (always on)',
    ['Free with belts', '2 plush a second within 2 m'],
    ['Belt Intake upgrade', 'up to 256 a second, 6 m'],
    '#Vacuum Hose',
    ['The mouth sucks', 'loose plush within 3.5 m'],
    ['It runs', 'twice as fast as a belt'],
  ], 'One cable on any tile powers a whole belt line.\nMk2 to Mk6: set a higher mark over a belt.');
  add('BOTS AND THE CREW', [
    '#Crew panel (V)',
    'T: dig the way you face. Y: all home.',
    'Aim at a bot, E, aim at a target, E.',
    '#Battery',
    'Under 25%: it looks for a Charging Station.',
    'A 1 kW machine: it needs a cable like any.',
    'No cable, no charge, and no bot is sent to it.',
    '#Fuel duty',
    'Bots top up generators and stations,',
    'and dig fuel for one that runs low.',
    '#Floors',
    'Ramps, stairs, ladders, powered lifts and doors.',
    'No way up? It says so and tries again later.',
  ], 'Keep machines fueled (crew panel) and each bot\'s Fuel duty.\nA machine that needs a bot calls it along a route.');
  add('SLIDES AND AVALANCHES', [
    '#What risks a slide',
    ['Height', 'worse the higher you climb'],
    ['A steep face', 'and a heavy load'],
    '#One slide, three sizes',
    ['8 to 19 m up', 'mostly small wedges'],
    ['Over 19 m, steep', 'wide, long, deep burial'],
    '#Cut the risk',
    ['Climbing Gear', 'three levels'],
    ['Rope Anchor', 'roped in within 6 m'],
    '#Buried? Dig out',
    ['Legs or waist', 'walk out, about a second'],
    ['Chest', 'punch: R or right click'],
    ['Under the pile', 'Space punches up. Watch the air.'],
  ], 'A slide buries friends and bots below you too.\nDo not climb the piles.');
  add('CARE AND NIGHT SHIFT', [
    '#Care packages',
    ['Courier drone', 'every 3 game days'],
    ['And at', 'milestones: rarity, depth, Plushdex'],
    ['The crate lands', 'by the SORT bin. E opens it.'],
    ['Inside', '3 to 5 things you can use'],
    ['GOLD crate', 'rare, holds more'],
    ['The log', 'J, the achievements screen'],
    '#Night Shift',
    ['Closing time', '19:00, dark until 07:00'],
    ['The red button', 'in the hub: E to buy'],
    ['Price', '100M, for the whole team'],
    'Lights stay on after closing, for good.',
  ], 'Deep underground, a crate waits at the bin.\nYour helmet lamp works either way.');
  const ctl = controlPages(); pages.push(...ctl);
  return pages;
}
