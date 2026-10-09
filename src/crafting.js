import { FRAME_TYPES, GEAR, UPGRADES } from './upgrades.js';
import { CART_CAP, CART_NAMES, CART_PRICE } from './cart.js';
import { EARTH, earthTune } from './earth.js';
import { catalogRecipes } from './catalog.js';
import * as PI from './playerinv.js';

// How to use each thing, shown on the bench card and as a hint right after you craft it.
const USE = {
  frame: 'A hollow 4x4x4 cube (2.4 m each way). Dig the section out first: a frame never digs. Aim at the floor and press B: it anchors the roof around its centre. Aim next to a frame and it snaps a whole cube away on any side (in line, beside, above, below) to build tunnels, junctions and chambers. The hammer takes it back.',
  rope: 'Take it out and aim at the pile where you want to climb, press B. Within 6 m of it the footing holds and your steps barely loosen the slope. Plant one every few steps going up.',
  mfan: 'Take it out and aim at any frame (even one you turned): it clamps under the top beam and blows the way you are facing. One per frame. It needs power, like a Vent Fan: its own Power Cable from a live pole or generator.',
  marker: 'Aim at the floor and press B. It shows on your compass so you can find your way back.',
  glow: 'Aim and press B. A soft green light for 10 minutes, no power needed.',
  flare: 'Aim and press B. A bright light for 4 minutes, no power needed.',
  strut: 'Aim at the floor under a roof you do not trust and press B. It anchors the roof within about 1.9 m.',
  jack: 'Aim at the floor under bad ground and press B. A strong prop: anchors the roof within about 2.7 m.',
  dynamite: 'Aim at the pile and press B, then run. 4 second fuse, small blast. It hurts if you stand close.',
  charge: 'Aim at the pile and press B, then run. 6 second fuse, bigger blast. It hurts if you stand close.',
  lantern: 'Aim at a wall or the floor and press B. It lights the tunnel for good.',
  bulk: 'Aim at an empty cell and press B. A solid wall cell that never falls. The hammer or X takes it down.',
  belt: 'Aim at the floor and press B (hold B to lay a line, or press . for the Line Planner). Needs power: run a Power Cable from a live pole or generator to any one tile of the line (one cable powers the whole connected line).',
  ramp: 'Like a belt, but it climbs or drops one step. R flips up or down while you hold it.',
  splitter: 'Aim at a belt (it converts it) or the floor and press B. Plush arriving from behind leave forward, left and right in turn: feed several sorters, vaults or lines from one belt. Outputs that are full or missing are skipped.',
  gate: 'Aim at a belt (it converts it) or the floor and press B. Everything that passes is scanned. Not within a bin\'s pull. Walk through it to scan your bag.',
  charger: 'Place it, then press E on it with plush in your hands (or throw plush in, or belt it in, or let your bots keep it fueled). It holds 50 plush. Common 0.34, Uncommon 0.7, Rare 1.5 and Epic 4 of a bot battery each, up to 8. A bot that runs low walks to the nearest charger with charge instead of all the way home. Like every machine it needs a Power Cable (1 kW) from a live pole or generator: without one it charges nothing and bots skip it. Aim at a bot, press E, then E on a charger to send it there.',
  gen: 'Place it, then press E on it with plush in your hands to feed it fuel (or belt plush in, or let your bots keep it fueled). Holds 50 plush. Powers nothing until a Power Cable runs from it to a pole or a machine.',
  pole: 'A cable hub with ten sockets and no power of its own. Run a Power Cable from a generator to it, then more cable from it to machines or to the next pole. Standing near a generator links nothing.',
  cable: 'Take it out, click a generator, pole or machine, and a wire follows your crosshair. Click a second one to attach it. Cables are the ONLY way power travels: a generator powers nothing until it is wired, a Power Pole is a hub that is live only when a cable path joins it to a generator, and every machine needs its own cable to a live pole or generator (a belt line needs one cable on any tile). Two generators wired together add their power. Click empty air or press Q to cancel, click the same pair again (or hammer the wire) to take it down and get the cable back. A cable spans 14 m, more with Grid Range.',
  fan: 'Place it in a dusty tunnel and run a Power Cable to it from a live pole or generator. Clears dust within about 14 m.',
  sorter: 'Place it in a belt line. Press E on it to change what it sells and what it keeps.',
  vault: 'Place it at the end of a belt line. Press E on it to empty it into your hands.',
  mech: 'Place it facing the pile wall. It digs and loads the belt behind it. Needs its own Power Cable from a live pole or generator.',
  claw: 'Plant it on the pile surface. It plucks and sells plush in reach. Needs its own Power Cable from a live pole or generator. It does NOT check for the One.',
  borer: 'Place it against the pile wall (look at the base of the wall). It bores a lined tunnel on its own. Needs its own Power Cable from a live pole or generator. It never eats The One: that cell stays in the pile.',
  excavator: 'Stand it on open floor facing the pile wall (look at the base of the wall) and press B. It swings across a wide face and fills its hopper. Empty the hopper onto a belt behind it, with a Haul Truck, or by hand (E). Needs power. It stops where the mountain is too heavy for your best frame, and chokes on stale air without a Support Fan. It scoops The One too and keeps it in the hopper: E takes it, or a Haul Truck carries it through a Vehicle Scanner.',
  dozer: 'Stand it on open floor facing the pile wall and press B. Its blade shoves the foot of the pile out in rows: onto a belt behind it at full value, or down its chute at 85%. Needs power. It stops where the mountain is too heavy for your best frame, and chokes on stale air without a Support Fan. It scoops The One too and keeps it in the hopper: E takes it, or a Haul Truck carries it through a Vehicle Scanner.',
  wheel: 'Stand it on open floor facing the pile wall and press B. The wheel eats a huge face into a big hopper. Empty it onto a belt, with Haul Trucks, or by hand (E). Needs power. It stops where the mountain is too heavy for your best frame, and chokes on stale air without a Support Fan. It scoops The One too and keeps it in the hopper: E takes it, or a Haul Truck carries it through a Vehicle Scanner.',
  truck: 'Park it on open floor and press B: that is its yard. Run a Power Cable to it from a live pole or generator (it stays on that grid while it drives). When a digger\'s hopper fills it drives out, loads, hauls to the nearest bin or Depot Beacon, sells the load and drives home. Its drive needs power at the yard. Build a Vehicle Scanner on its road: a truck holding The One will not leave without one. E parks it or sends it back to work.',
  beacon: 'Place it anywhere: a remote bin, a fast travel point and a recall point.',
  cart: 'Press U to roll it out. It stays near you, plush you grab ride on it once your hands are full, and it unloads near the bin. U parks it or calls it back, X (standing next to it) stows it when empty.',
  medkit: 'Press K to heal 50 health.',
  canister: 'Automatic: it kicks in when you run out of air while trapped.',
  mat: 'Frames, struts, jacks and bulkheads are simply bought with Fluff when you craft them.',
};

const FRAME_NOTE = {
  timber: 'Best for: your first tunnels near the bay.',
  steel: 'Best for: the first few hundred meters.',
  concrete: 'Best for: heavy ground under a lot of plush.',
  rebar: 'Best for: long hauls where the pile gets heavier.',
  titan: 'Best for: deep tunnels with a wide reach.',
  carbon: 'Best for: kilometers out, few frames needed.',
  plasma: 'Best for: far from the bay, where plush are dense.',
  voidl: 'Best for: the deep. Very long reach.',
  neutron: 'Best for: the far corners of the hall.',
  horizon: 'Best for: tunnels you never want to think about.',
};

// Building material: every frame is made from a material. Start with lumber, upgrade to safer ones.
// Stock is found (caches, old workings) or bought here in bulk (cheaper than the shortfall price while crafting).
export const MATERIALS = {};
const MATNAMES = { timber: 'Lumber', steel: 'Steel Beams', concrete: 'Concrete Mix', rebar: 'Rebar', titan: 'Titanium Billets', carbon: 'Carbon Cloth', plasma: 'Plasma Stock', voidl: 'Void Lattice Stock', neutron: 'Neutron Plate', horizon: 'Horizon Alloy' };
const MATFRAME = 4; // units per frame
for (const k of Object.keys(FRAME_TYPES)) MATERIALS[k] = { name: MATNAMES[k], icon: FRAME_TYPES[k].icon, unit: Math.max(1, Math.round(FRAME_TYPES[k].cost / MATFRAME)) };

// Everything you build is crafted first at the Crafting Table, then carried and set down with B.
export function recipes(g) {
  const T = g.T;
  const list = [];
  const out = [];
  const K = 3; // crafting is not cheap either
  for (const k of T.frames) list.push({ id: 'frame:' + k, kind: 'frame', fk: k, icon: FRAME_TYPES[k].icon, name: FRAME_TYPES[k].name, short: FRAME_TYPES[k].name.split(' ')[0], desc: `A hollow cube, 4 x 4 x 4 cells (2.4 m). Anchors the roof within ${FRAME_TYPES[k].radius} m of its centre, so the unsupported tunnel length starts again from here. Stronger frames reach further. Rated to ${isFinite(FRAME_TYPES[k].maxDepth) ? FRAME_TYPES[k].maxDepth + ' m deep' : 'any depth'}: set deeper than that and it breaks.`, price: FRAME_TYPES[k].cost, batch: [1, 5, 10], mat: k, matN: MATFRAME });
  for (const k of T.frames) list.push({ id: 'mat:' + k, kind: 'mat', mk: k, icon: MATERIALS[k].icon, name: MATERIALS[k].name, short: MATERIALS[k].name, desc: 'Building material. Frames use ' + MATFRAME + ' each. Stock up here at a discount, or find it in caches and old workings.', price: Math.max(1, Math.round(MATERIALS[k].unit * 0.7)), batch: [10, 50, 250] });
  for (let t = 1; t <= T.cartTier; t++) list.push({ id: 'cart:' + t, kind: 'cart', icon: '🛒', name: CART_NAMES[t], short: CART_NAMES[t], desc: `Press U to roll it out. Follows you, carries ${CART_CAP[t]} plush and unloads near the bin.`, price: CART_PRICE[t], batch: [1] });
  if (T.markers) {
    list.push({ id: 'marker', kind: 'marker', icon: '🚩', name: 'Survey Marker', short: 'Marker', desc: 'Shows on your compass. Plant them to mark junctions and the way home.', price: 6, batch: [1, 5, 10] });
    list.push({ id: 'glow', kind: 'glow', icon: '🟢', name: 'Glow Stick', short: 'Glow', desc: 'A soft green light for ten minutes. Dimmer than a flare, lasts more than twice as long. Needs no power.', price: 5, batch: [1, 10, 25] });
    list.push({ id: 'flare', kind: 'flare', icon: '🔥', name: 'Road Flare', short: 'Flare', desc: 'A bright light for four minutes. Needs no power.', price: 15, batch: [1, 5, 25] });
  }
  if (T.jacks) list.push({ id: 'jack', kind: 'jack', icon: '🛠️', name: 'Hydraulic Jack', short: 'Jack', desc: 'A screw prop for bad ground. Anchors the roof within about 2.7 m. Crafted with Fluff.', price: 70, batch: [1, 5, 10], mat: 'steel', matN: 1 });
  if (T.struts) list.push({ id: 'strut', kind: 'strut', icon: '🪜', name: 'Strut', short: 'Strut', desc: 'A single prop. Anchors the roof within about 1.9 m. Goes anywhere.', price: 8, batch: [1, 5, 25], mat: 'timber', matN: 1 });
  if (T.firstAid) {
    list.push({ id: 'medkit', kind: 'supply', icon: '🩹', name: 'Medkit', short: 'Medkit', desc: 'Press K to heal 50 health.', price: 30, batch: [1, 5, 10] });
    list.push({ id: 'canister', kind: 'supply', icon: '🫧', name: 'Air Canister', short: 'Canister', desc: 'Kicks in by itself when you run out of air while trapped: 40 more seconds to dig out.', price: 55, batch: [1, 3, 5] });
  }
  if (T.dynamite) list.push({ id: 'dynamite', kind: 'dynamite', icon: '🧨', name: 'Dynamite', short: 'Dynamite', desc: 'A stick with a 4 second fuse. Blows a small hole about 1.3 m in radius. Cheap, fast, and loud. Run.', price: 14, batch: [1, 5, 10] });
  if (T.charges) list.push({ id: 'charge', kind: 'charge', icon: '🧨', name: 'Blasting Charge', short: 'Charge', desc: `Blows a hole about ${[0, 1.8, 2.4, 3.0][T.charges]} m in radius after 6 seconds. Run.`, price: 40 * T.charges, batch: [1, 3, 5] });
  if (T.lantern) list.push({ id: 'lantern', kind: 'lantern', icon: '🏮', name: 'Work Lantern', short: 'Lantern', desc: 'Hang it up to light a tunnel.', price: 6, batch: [1, 5, 10] });
  if (T.bulkhead) list.push({ id: 'bulk', kind: 'bulk', icon: '🪧', name: 'Bulkhead Panel', short: 'Bulkhead', desc: 'A solid plank wall cell. Never falls. Hold the pile back.', price: 10, batch: [1, 10, 50], mat: 'timber', matN: 2 });
  if (T.vac > 0) list.push({ id: 'hose', kind: 'belt', hose: true, icon: '🌀', name: 'Vacuum Hose', short: 'Hose', desc: 'A powered suction hose: one tube with a single flared mouth at its open start. The mouth pulls in loose plush within 3.5 m, and plush ride the hose at twice belt speed. It bends in smooth curves (set a piece beside the open end and it turns), lays like a belt (hold B, or click to aim a whole route) and has no splitters or gates. Run it to the bin: the last piece glows gold when its end is in suck range, so you know to stop there.', price: 6, batch: [10, 50, 100] });
  if (T.machines.includes('belt')) {
    list.push({ id: 'belt', kind: 'belt', icon: '🛤️', name: 'Conveyor Belt', short: 'Belt', desc: 'Carries plush. Needs power. Place a line by holding B.', price: 3, batch: [10, 50, 100] });
    list.push({ id: 'ramp', kind: 'belt', ramp: true, icon: '📐', name: 'Belt Ramp', short: 'Ramp', desc: 'A belt that climbs or drops one step. R flips up/down.', price: 5, batch: [1, 5, 10] });
  }
  if (T.machines.includes('splitter')) list.push({ id: 'splitter', kind: 'splitter', icon: '🔱', name: 'Belt Splitter', short: 'Splitter', desc: 'Sends plush forward, left and right in turn.', price: 30, batch: [1, 3, 5] });
  if (T.machines.includes('gate')) list.push({ id: 'gate', kind: 'gate', icon: '🚨', name: 'Detector Gate', short: 'Gate', desc: 'Set it over a belt (or on bare floor). Scans everything passing through. Red alarm and a held item if it is The One. Crew bots check in at the nearest gate before unloading.', price: 25, batch: [1, 3, 5] });
  if (T.machines.includes('gen')) list.push({ id: 'gen', kind: 'gen', icon: '🔥', name: 'Generator', short: 'Generator', desc: 'Burns Common to Epic plush for power: at 8 kW a Common lasts 4.5 minutes, an Uncommon 12, a Rare 30 and an Epic 75 (turbine upgrades burn them faster). Hold it plush with E or throw plush into it. It powers nothing until a Power Cable runs from it to a pole or machine; two generators wired together add their power (4 sockets).', price: g.genCost(), batch: [1, 2, 5] });
  if (T.machines.includes('charger')) list.push({ id: 'charger', kind: 'charger', icon: '🔋', name: 'Charging Station', short: 'Charger', desc: 'Bots recharge here instead of walking home. Feed it Common to Epic plush: a Common gives 0.34 of a bot battery, an Uncommon 0.7, a Rare 1.5 and an Epic 4 (holds 8). Needs a Power Cable (1 kW) from a live grid like every machine.', price: g.chargerCost(), batch: [1, 2, 3] });
  if (T.machines.includes('pole')) list.push({ id: 'cable', kind: 'cable', icon: '🔌', name: 'Power Cable', short: 'Cable', desc: 'The only way power travels. Run it by hand from a generator to a pole, from a pole to a machine, or from one generator to another to add their power. Spans 14 m (more with Grid Range). Every machine needs its own cable (a belt line needs one on any tile); machines next to a pole or generator get nothing without it.', price: 6, batch: [1, 5, 10] });
  if (T.machines.includes('pole')) list.push({ id: 'pole', kind: 'pole', icon: '⚡', name: 'Power Pole', short: 'Pole', desc: 'A hub with ten cable sockets and no power of its own: it is dead until a cable joins it to a generator, then run more wire from the pole to machines or to other poles. Its lamp is lit only while its grid has supply.', price: 20, batch: [1, 5, 10] });
  if (T.machines.includes('fan')) list.push({ id: 'fan', kind: 'fan', icon: '🌬️', name: 'Vent Fan', short: 'Fan', desc: 'Clears dust within 14 m when powered. Needs its own Power Cable to a live pole or generator.', price: 240, batch: [1, 2, 5] });
  if (T.rope) list.push({ id: 'rope', kind: 'rope', icon: '🪢', name: 'Rope Anchor', short: 'Rope', desc: 'A stake and a rope. Everything within 6 m is roped in: the slope will not give way under you.', price: 45, batch: [1, 3, 5] });
  if (T.machines.includes('mfan')) list.push({ id: 'mfan', kind: 'mfan', icon: '🌀', name: 'Support Fan', short: 'S.Fan', desc: 'Clamps under a frame and blows fresh air the way you face, 20 m down the tunnel. Deep tunnels go stale: past 375 m you need one every 0.25 x 20 / stale(d) metres (about 13 m at 500 m deep, 5 m at 1,000 m). Needs power.', price: 150, batch: [1, 2, 5] });
  if (T.machines.includes('sorter')) list.push({ id: 'sorter', kind: 'sorter', icon: '🗃️', name: 'Sorting Box', short: 'Sorter', desc: 'Sells or passes plush by rarity. Sucks in what you carry.', price: g.sorterCost(), batch: [1, 2, 5] });
  if (T.machines.includes('vault')) list.push({ id: 'vault', kind: 'vault', icon: '🧰', name: 'Vault Crate', short: 'Vault', desc: 'Stores plush at the end of a line.', price: 140, batch: [1, 2, 5] });
  if (T.machines.includes('mech')) list.push({ id: 'mech', kind: 'mech', icon: '🤖', name: 'Mech Scooper', short: 'Mech', desc: 'Digs the face ahead and loads the belt behind it.', price: g.mechCost(), batch: [1, 2, 3] });
  if (T.depots) list.push({ id: 'beacon', kind: 'beacon', icon: '📡', name: 'Depot Beacon', short: 'Depot', desc: 'Remote sorting point, fast travel and recall point. Turns up clues.', price: g.beaconCost(), batch: [1, 1, 1] });
  if (T.machines.includes('claw')) list.push({ id: 'claw', kind: 'claw', icon: '🦾', name: 'Claw Rig', short: 'Claw Rig', desc: 'Plucks the highest plush in reach and sells it. Needs power.', price: g.rigCost(), batch: [1, 2, 3] });
  if (T.machines.includes('borer')) list.push({ id: 'borer', kind: 'borer', icon: '🚇', name: 'Tunnel Borer', short: 'Borer', desc: 'Bores a lined tunnel on its own. Needs power.', price: g.borerCost(), batch: [1, 1, 1] });
  for (const kind of ['excavator', 'dozer', 'wheel', 'truck']) if (T.machines.includes(kind)) {
    const sp = EARTH[kind];
    list.push({ id: kind, kind, icon: sp.icon, name: sp.name, short: sp.short, price: g.earthCost(kind), batch: [1, 1, 1], desc: kind === 'truck' ? 'Hauls plush from a digger\'s hopper to the bin or a Depot Beacon and back. Needs power at its yard.' : kind === 'dozer' ? 'Pushes the foot of the pile out in rows onto a belt, or down its chute. Needs power.' : kind === 'wheel' ? 'A huge wheel that eats an 11 wide, 6 high face into a big hopper. Needs power.' : 'Swings a bucket across a wide face and fills a hopper. Needs power.' });
  }
  { const have = new Set(list.map((r) => r.id)); for (const r of catalogRecipes(g)) if (!have.has(r.id)) list.push(r); }   // catalog_*.js bench rows (price gets the K multiplier below)
  const cartTier = g.myCart() ? g.myCart().tier : [5, 4, 3, 2, 1].find((t) => (g.S.items['cart:' + t] || 0) > 0) || 0;
  const status = (r) => {
    if (r.kind === 'cart') { const t = +r.id.split(':')[1]; return cartTier >= t ? (cartTier === t ? (g.myCart() ? `In use: rolled out (${g.myCart().load.length}/${CART_CAP[t]})` : 'You have this one in your pack') : 'You already have a better cart') : (cartTier ? `Upgrade from your ${CART_NAMES[cartTier]}: +${CART_CAP[t] - CART_CAP[cartTier]} capacity` : 'You have no cart yet'); }
    if (r.kind === 'frame') { const f = FRAME_TYPES[r.fk]; return `Rated to ${isFinite(f.maxDepth) ? f.maxDepth + ' m' : 'any'} depth. Reach ${f.radius} m from the centre of its 2.4 m cube: set them flush (4 cells apart) for a solid lining, or leave a gap near the surface and let the reach cover it: closer together the deeper you go. ${FRAME_NOTE[r.fk] || ''}`; }
    if (r.kind === 'claw') return `${PI.ownedCount(g, 'claw')} of ${g.T.rigMax} rigs placed${g.net && g.net.open ? ' by you' : ''}`;
    if (r.kind === 'mech') return `${g.logi.count('mech')} of ${g.T.mechMax} mechs placed`;
    if (r.kind === 'borer') return `${PI.ownedCount(g, 'borer')} of ${g.T.borerMax} borers placed${g.net && g.net.open ? ' by you' : ''}`;
    if (EARTH[r.kind]) return `${g.machines.count(r.kind)} of ${earthTune(g.T, r.kind).max} ${EARTH[r.kind].short.toLowerCase()}s placed`;
    return r.statusFn ? r.statusFn(g, r) : '';
  };
  for (const r of list) { const rr = (r.kind === 'frame' || r.kind === 'mat') ? r : { ...r, price: Math.round(r.price * K) }; out.push({ ...rr, use: USE[r.id] || r.use || USE[r.kind] || '', status: status(r) }); }
  return out;
}

// ---------------------------------------------------------------- robots (crew bots)
// The Scrapper Bot upgrade unlocks the first bot and its hatch. More Scrappers and the Bot Foundry now buy a bunk (a crew slot, the same price as
// before); the bot that fills it is crafted at the bench. What the bench charges follows what hiring a bot costs: BOT_SHARE of the price of the
// upgrade level that used to hatch that bot, so a bot is never cheaper than it was and each one owned makes the next dearer.
export const BOT_ID = 'bot:scrapper';
export const BOT_SHARE = 0.5;
// what the upgrade tree charged for the bot at index n (0 = the first bot): the Scrapper Bot upgrade, then More Scrappers, then the Bot Foundry
export function botHireCost(n) {
  const line = (id) => (UPGRADES.find((u) => u.id === id) || { cost: [0] }).cost;
  const a = line('crew'), b = line('crewSlots'), c = line('foundry');
  if (n <= 0) return a[0];
  if (n <= b.length) return b[n - 1];
  if (n <= b.length + c.length) return c[n - 1 - b.length];
  return Math.round(c[c.length - 1] * Math.pow(2.4, n - b.length - c.length));
}
export const botPrice = (n) => Math.max(1, Math.round(botHireCost(n) * BOT_SHARE));
// what crafting `count` bots costs when `have` are already out: each one is priced by how many there are by then
export const botQuote = (have, count) => { let c = 0; for (let k = 0; k < count; k++) c += botPrice(have + k); return c; };
const botCount = (g) => ((g.S && g.S.crew) || []).length;
const BOT_USE = 'Automatic: the new bot hatches at the bin and follows you. V opens the crew panel, T sends the crew digging the way you face, Y calls them home. Aim at a bot and press E to give it an order.';

// the bench rows for robots (they are not items in your pack: crafting one hatches a bot). Locked until the Scrapper Bot upgrade.
export function botRecipes(g) {
  const T = g.T || {}, out = [];
  if (!(T.crewMax > 0)) return out;
  const have = botCount(g), free = Math.max(0, T.crewMax - have);
  const slotUp = have >= 9 ? 'Bot Foundry' : 'More Scrappers';
  out.push({
    id: BOT_ID, kind: 'bot', icon: '🤖', name: 'Scrapper Bot', short: 'Scrapper', price: botPrice(have), batch: [1, 2, 3], use: BOT_USE,
    desc: 'A little robot crew member. It follows you, digs a tunnel when you give the order, hauls plush back to the bin and recharges at a Charging Station. It levels up as it works: bigger, stronger, faster. Each bot you own makes the next one dearer, and every bot needs a free bunk (More Scrappers and the Bot Foundry add bunks).',
    status: `${have} of ${T.crewMax} bunks used${free > 0 ? `, ${free} free` : `. No free bunk: buy ${slotUp} at the terminal`}`,
    free, have, quote: (n) => botQuote(have, n),
  });
  return out;
}

// everything the bench lists: the recipes (no raw material) and the robots
export const benchRecipes = (g) => [...recipes(g).filter((r) => r.kind !== 'mat'), ...botRecipes(g)];

// craft `n` robots: they hatch through the crew's own spawn, only into free bunks, and are paid all together or not at all
function craftBots(g, n) {
  const S = g.S, T = g.T;
  S.crew = S.crew || [];
  const have = S.crew.length, free = (T.crewMax || 0) - have;
  if (!(T.crewMax > 0) || free < 1 || n > free) { g.sound.error(); if (g.ui && g.ui.hint) g.ui.hint(!(T.crewMax > 0) ? 'Unlock the Scrapper Bot at the terminal first.' : 'No free bunk for another bot. More Scrappers and the Bot Foundry at the terminal add bunks.', 3.5); return false; }
  const cost = botQuote(have, n);
  if (S.money < cost) { g.sound.error(); return false; }
  S.money -= cost;
  for (let k = 0; k < n; k++) g.crew.spawn();
  g.ui.setMoney(S.money);
  g.sound.place();
  g.ui.toast({ icon: '🤖', title: n > 1 ? `${n} Scrapper Bots crafted` : 'Scrapper Bot crafted', text: `Hatched at the bin: ${S.crew.length} of ${T.crewMax} bunks used.`, ms: 3500 });
  return true;
}

// wearable gear: one piece per upgrade line, crafted tier by tier once the upgrade is unlocked
export function gearRecipes(g) {
  if (!g.GEAR_CRAFTING) return [];
  const S = g.S, out = [];
  for (const id of GEAR) {
    const u = UPGRADES.find((x) => x.id === id);
    const bought = S.up[id] || 0, have = (S.gear && S.gear[id]) || 0;
    if (bought > have) {
      const tier = have + 1;
      const name = u.names ? u.names[tier] : `${u.name} ${tier}`;
      out.push({ id, tier, name, line: u.name, desc: u.desc, price: Math.max(5, Math.round(u.cost[tier - 1] * 0.3)), have, bought, max: u.max });
    }
  }
  return out;
}

export function craftGear(g, id) {
  const r = gearRecipes(g).find((x) => x.id === id);
  if (!r) return false;
  if (g.S.money < r.price) { g.sound.error(); return false; }
  g.S.money -= r.price;
  g.S.gear[id] = r.tier;
  g.ui.setMoney(g.S.money);
  g.sound.buy();
  g.refreshTuning();
  g.ui.toast({ icon: '🧰', title: `Crafted ${r.name}`, text: 'Equipped. It works now.', ms: 3500 });
  return true;
}

export function craft(g, id, n) {
  if (typeof id !== 'string') return false;   // a guest's command is untrusted: a number or an object for an id must not throw on the host
  const S = g.S;
  n = Math.floor(+n);
  if (!(n >= 1) && id.indexOf('cart:') !== 0) return false;
  if (id === BOT_ID) return n >= 1 && craftBots(g, n);
  const r = recipes(g).find((x) => x.id === id);
  if (!r) return false;
  S.mats = S.mats || {};
  if (r.kind === 'cart') return craftCart(g, r);
  if (r.kind === 'mat') {
    const c = r.price * n;
    if (S.money < c) { g.sound.error(); return false; }
    S.money -= c; S.mats[r.mk] = (S.mats[r.mk] || 0) + n;
    g.ui.setMoney(S.money); g.sound.place();
    return true;
  }
  let cost = r.price * n;
  let use = 0;
  if (r.mat) {
    // stock first; any shortfall is bought on the spot at the full unit price
    const need = r.matN * n, have = S.mats[r.mat] || 0;
    use = Math.min(need, have);
    cost = Math.round((need - use) * (r.price / r.matN));
  }
  if (S.money < cost) { g.sound.error(); return false; }
  S.money -= cost;
  if (use) { S.mats[r.mat] -= use; if (S.mats[r.mat] <= 0) delete S.mats[r.mat]; }
  S.items[id] = (S.items[id] || 0) + n;
  g.ui.setMoney(S.money);
  g.sound.place();
  g.rebuildTools();
  // like picking something up in Minecraft: it goes into the first free hotbar slot (and becomes the selected slot)
  let idx = g.assignHotbar(id);
  if (idx >= 0) g.buildIdx = idx;
  g.rebuildTools();
  if (r.use) g.ui.hint(`<b>${r.name}</b> crafted${idx >= 0 ? ` and put on hotbar slot <kbd>${idx + 1}</kbd>. ${g.stowed ? `Press <kbd>${idx + 1}</kbd> to take it out, <kbd>Q</kbd> to put it away` : `It is the tool in your hand now: <kbd>Q</kbd> puts it away`}` : '. Your hotbar is full: open the inventory (<kbd>I</kbd>) to choose a slot'}. ${r.use}`, 9);
  return true;
}

// Every player runs one cart of their own (the host acting for a guest means the guest's). Crafting a better one upgrades it (in place if it is rolled out, keeping its load).
function craftCart(g, r) {
  const S = g.S, tier = +r.id.split(':')[1];
  const key = g.myCartKey(), mine = S[key];
  const have = Math.max(mine ? mine.tier : 0, ...[1, 2, 3, 4, 5].filter((t) => (S.items['cart:' + t] || 0) > 0));
  if (have >= tier) { g.sound.error(); g.cartSay(`You already have a ${CART_NAMES[have]} (${CART_CAP[have]} plush). Craft a better cart to upgrade.`, 4); return false; }
  if (S.money < r.price) { g.sound.error(); return false; }
  S.money -= r.price;
  for (let t = 1; t <= 5; t++) delete S.items['cart:' + t];
  if (Array.isArray(S.hotbar)) S.hotbar = S.hotbar.map((x) => (x && x.startsWith('cart:') ? 'cart:' + tier : x)); // an old cart slot follows the upgrade
  if (mine) {
    mine.tier = tier;
    g.cartInst(key).sync();
    g.cartSay(`Cart upgraded to a <b>${CART_NAMES[tier]}</b>: now carries ${CART_CAP[tier]}. Its load stays.`, 6);
  } else {
    S.items['cart:' + tier] = 1;
    const slot = g.assignHotbar('cart:' + tier);
    g.cartSay(`<b>${CART_NAMES[tier]}</b> crafted (${CART_CAP[tier]} plush)${slot >= 0 ? ` and put on hotbar slot <kbd>${slot + 1}</kbd>` : ''}. ${USE.cart}`, 8);
  }
  g.ui.setMoney(S.money); g.sound.place(); g.rebuildTools();
  return true;
}
