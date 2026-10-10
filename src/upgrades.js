// Upgrade tree. Each upgrade has levels; effect(t, level) mutates the tuning object.
// cat: hands | sort | mine | light | sense | move | machine
import { mergeUpgrades } from './catalog.js';
import { DEX_UNIT, speciesCount } from './plushdata.js';

// the dex bonus per discovered species: scaled to the size of the Plushdex so a full one pays 7.5x with the Appraiser, as it always did (1,628 species at +0.4% each)
const DEXPCT = (u) => (u * 100).toFixed(3).replace(/0+$/, '');

export const CATS = [
  { id: 'contracts', name: 'Contracts', icon: '📋', special: true },
  { id: 'hands', name: 'Hands', icon: '✋' },
  { id: 'sort', name: 'Sorting', icon: '♻️' },
  { id: 'mine', name: 'Mining & Supports', icon: '⛏️' },
  { id: 'light', name: 'Light', icon: '🔦' },
  { id: 'sense', name: 'Sensors', icon: '📡' },
  { id: 'move', name: 'Mobility', icon: '👟' },
  { id: 'crew', name: 'Crew', icon: '🤖' },
  { id: 'machine', name: 'Machines', icon: '⚙️' },
];

const geo = (base, mul, n) => Array.from({ length: n }, (_, i) => Math.round(base * Math.pow(mul, i)));

export const UPGRADES = [
  // ---------------- HANDS ----------------
  { id: 'gloves', cat: 'hands', name: 'Grippy Gloves', desc: 'Shorter pause between grabs while you hold the grab key. Your fingers learn the pile: the pause is halved by the top level.', max: 7, cost: geo(8, 2.25, 7), effect: (t, l) => { t.grabTime *= Math.pow(0.84, l); } },
  { id: 'reach', cat: 'hands', name: 'Telescoping Grabber', desc: 'Reach further into the pile: +0.5 m of grab distance per level.', max: 4, cost: [18, 70, 260, 900], effect: (t, l) => { t.reach += 0.5 * l; } },
  { id: 'bag', cat: 'hands', name: 'Carry Capacity', desc: 'Tote, pack, cart, pallet jack. Hold more plush before you have to walk back.', max: 8, cost: [14, 45, 130, 360, 950, 2600, 7200, 19000], effect: (t, l) => { t.carry = [1, 3, 6, 10, 16, 26, 42, 70, 120][l]; }, names: ['Bare Hands', 'Tote Bag', 'Backpack', 'Hiker Pack', 'Wheelbarrow', 'Hand Cart', 'Pallet Jack', 'Forklift Fork', 'Gantry Hopper'] },
  { id: 'cart', cat: 'hands', name: 'Carts', desc: 'Unlocks carts to craft: Wheelbarrow, Hand Cart, Pallet Cart, Trolley, Flatbed. Press U to roll one out. It follows you, and plush you grab ride on it up to its capacity (24 / 60 / 150 / 400 / 1000). Park it near the bin or a sorter and it unloads itself.', max: 5, cost: geo(300, 3.2, 5), req: { id: 'bag', lvl: 1 }, effect: (t, l) => { t.cartTier = l; } },
  { id: 'scavenge', cat: 'hands', name: 'Scavenger Magnet', desc: 'Loose plush lying on the floor (after a collapse, a throw, a spill) fly into your hands, or onto your cart when your hands are full, when they are within 3 / 6 / 10 m of you.', max: 3, cost: [500, 5000, 50000], effect: (t, l) => { t.scavRange = [0, 3, 6, 10][l]; } },
  { id: 'repeat', cat: 'hands', name: 'Auto-Grip', desc: 'Holding left click grabs two plush at a time, twice as fast.', max: 1, cost: [40], effect: (t) => { t.autoRepeat = true; } },
  { id: 'scoop', cat: 'hands', name: 'Scoop Hands', desc: 'Each grab also scoops neighbouring plush along your aim: 1 / 3 / 6 / 12 extra per grab. Bigger scoops pull the pile apart faster.', max: 4, cost: [120, 480, 1900, 7800], req: { id: 'bag', lvl: 2 }, effect: (t, l) => { t.scoop = [0, 1, 3, 6, 12][l]; } },
  { id: 'vac', cat: 'hands', name: 'Plush Vacuum', desc: 'Tapping left click now inhales plush in a cone for a couple of seconds instead of grabbing one. Upgrades raise suction rate: 3 / 5 / 8 / 12 / 18 plush per second. The VACUUM dial (minus and plus buttons, or [ and ] with bare hands) sets how much of it you use, from 0 to 100 percent; it starts at 30 percent.', max: 5, cost: [650, 1800, 5200, 15000, 42000], req: { id: 'bag', lvl: 3 }, effect: (t, l) => { t.vac = l; t.vacRate = [0, 3, 5, 8, 12, 18][l]; } },
  { id: 'throw', cat: 'hands', name: 'Throwing Arm', desc: 'Hurl plush faster, further and flatter. Six levels: from a gentle toss (11 m/s) up to a cannon shot (35 m/s).', max: 6, cost: [25, 120, 600, 3200, 18000, 100000], effect: (t, l) => { t.throwPower = 11 + l * 4; } },

  // ---------------- SORTING ----------------
  { id: 'contracts', cat: 'sort', name: 'Contract Board', desc: 'Buyers post standing orders (rarity, species, shape, shiny). Sell matching plush anywhere and the contract pays out a bonus, sometimes with a permanent boost. Find them under the Contracts tab.', max: 1, cost: [700], effect: (t) => { t.contractSlots += 3; } },
  { id: 'contractSlots', cat: 'sort', name: 'More Contracts', desc: 'One more contract slot per level.', max: 3, cost: [4000, 40000, 400000], req: { id: 'contracts', lvl: 1 }, effect: (t, l) => { t.contractSlots += l; } },
  { id: 'haggle', cat: 'sort', name: 'Haggling', desc: '+14% of the base sell price per level (level 10 pays 2.4x).', max: 10, cost: geo(25, 2.0, 10), effect: (t, l) => { t.sellMult *= 1 + 0.14 * l; } },
  { id: 'streak', cat: 'sort', name: 'Hot Hands', desc: 'Sales within 4.5 s of each other build a combo worth +4.5% per plush in a row. Everyone can reach a 6 plush combo; each level raises the cap by 8 (14, 22, 30, 38, 46).', max: 5, cost: [30, 140, 700, 3500, 16000], effect: (t, l) => { t.streakCap = 6 + l * 8; } },
  { id: 'magnet', cat: 'sort', name: 'Bin Magnet', desc: 'The bin catches throws from further away: the mouth is 0.45 m wider per level and the pull reaches further out.', max: 3, cost: [60, 320, 1500], effect: (t, l) => { t.binCatch = 0.0 + l * 0.45; } },
  { id: 'binpull', cat: 'sort', name: 'Bin Throughput', desc: 'Bins pull plush in faster: each pull takes a whole batch instead of one. 2, 4, 8, 16, 32, 64, 128, then 256 plush at a time, for the plush you carry and the plush on your cart, at the bin and at every Depot Beacon. Needs Long-Range Suction.', max: 8, cost: [150, 700, 3200, 15000, 70000, 320000, 1500000, 7000000], req: { id: 'dump', lvl: 1 }, effect: (t, l) => { t.binBatch = [1, 2, 4, 8, 16, 32, 64, 128, 256][l]; } },
  { id: 'dump', cat: 'sort', name: 'Long-Range Suction', desc: 'The bin already sucks in plush you carry when you are within 3.8 m. This widens the pull to 7.8, 13.8, then 25.8 m (your cart gets the same distance as you). Gates and sorters must stay outside the pull.', max: 3, cost: [90, 700, 5200], effect: (t, l) => { t.autoDump = 3.8 + [0, 4, 10, 22][l]; } },
  { id: 'dex', cat: 'sort', name: 'Plushdex Appraiser', desc: `+${DEXPCT(DEX_UNIT)}% sell price for every species you have discovered (the Plushdex has ${speciesCount.toLocaleString('en-US')}, so a full dex pays about 7.5x).`, max: 1, cost: [180], effect: (t) => { t.dexBonus = DEX_UNIT; } },
  { id: 'shinyEye', cat: 'sort', name: "Collector's Loupe", desc: 'Shiny plush are worth 8x instead of 5x.', max: 1, cost: [1200], effect: (t) => { t.shinyMult = 8; } },

  // ---------------- MINING ----------------
  { id: 'timber', cat: 'mine', name: 'Timber Frames', desc: 'Unlocks the Timber Frame recipe. Props a tunnel roof. Place one every few meters. Wood only stands to 150 m deep: below that it creaks, then breaks when you set it.', max: 1, cost: [30], effect: (t) => { t.frames.push('timber'); } },
  { id: 'steel', cat: 'mine', name: 'Steel Frames', desc: 'Stronger frames that reach further. Rated to 380 m deep.', max: 1, cost: [420], req: { id: 'timber', lvl: 1 }, effect: (t) => { t.frames.push('steel'); } },
  { id: 'concrete', cat: 'mine', name: 'Concrete Lining', desc: 'Poured lining for deep tunnels. Rated to 800 m deep.', max: 1, cost: [3800], req: { id: 'steel', lvl: 1 }, effect: (t) => { t.frames.push('concrete'); } },
  { id: 'rebar', cat: 'mine', name: 'Rebar Cages', desc: 'Reinforced arches. The pile gets heavier the further you go from the bay.', max: 1, cost: [32000], req: { id: 'concrete', lvl: 1 }, effect: (t) => { t.frames.push('rebar'); } },
  { id: 'titan', cat: 'mine', name: 'Titanium Ribs', desc: 'Light, brutal strength.', max: 1, cost: [260000], req: { id: 'rebar', lvl: 1 }, effect: (t) => { t.frames.push('titan'); } },
  { id: 'carbon', cat: 'mine', name: 'Carbon Weave', desc: 'Woven carbon arches.', max: 1, cost: [2100000], req: { id: 'titan', lvl: 1 }, effect: (t) => { t.frames.push('carbon'); } },
  { id: 'plasma', cat: 'mine', name: 'Plasma-Cured Arches', desc: 'Fused lining that shrugs off kilometers of plush.', max: 1, cost: [17000000], req: { id: 'carbon', lvl: 1 }, effect: (t) => { t.frames.push('plasma'); } },
  { id: 'voidl', cat: 'mine', name: 'Void Lattice', desc: 'You are not sure what it is made of. It does not fall.', max: 1, cost: [140000000], req: { id: 'plasma', lvl: 1 }, effect: (t) => { t.frames.push('voidl'); } },
  { id: 'neutron', cat: 'mine', name: 'Neutron Shell', desc: 'Matter you should not be able to buy.', max: 1, cost: [1100000000], req: { id: 'voidl', lvl: 1 }, effect: (t) => { t.frames.push('neutron'); } },
  { id: 'horizon', cat: 'mine', name: 'Event Horizon Arch', desc: 'The pile stops pressing. Mostly.', max: 1, cost: [9000000000], req: { id: 'neutron', lvl: 1 }, effect: (t) => { t.frames.push('horizon'); } },
  { id: 'tamp', cat: 'mine', name: 'Pile Tamping', desc: 'Compacts the whole pile. +1.2 m of safe unsupported tunnel per level, everywhere.', max: 8, cost: geo(320, 3.4, 8), req: { id: 'timber', lvl: 1 }, effect: (t, l) => { t.stabBonus += l; } },
  { id: 'creak', cat: 'mine', name: 'Creak Sensor', desc: 'More warning before a roof lets go.', max: 3, cost: [70, 340, 1600], effect: (t, l) => { t.warn += 0.55 * l; } },
  { id: 'stress', cat: 'mine', name: 'Stress Lens', desc: 'Highlights plush that are about to fall (amber) or will fall (red).', max: 1, cost: [520], req: { id: 'timber', lvl: 1 }, effect: (t) => { t.stressLens = true; } },
  { id: 'survey', cat: 'mine', name: 'Structural Survey', desc: 'Three dials beside your hotbar: how deep you are against the strongest frame you own (and its rating, with the weight of the pile above), the load on the nearest support, and how stale the air is down here. Amber at 85%, red when it is about to buckle.', max: 1, cost: [800], req: { id: 'timber', lvl: 1 }, effect: (t) => { t.survey = true; } },
  { id: 'bulkhead', cat: 'mine', name: 'Bulkhead Panels', desc: 'Plank panels you build into empty cells. They never fall and loose plush stack against them. Wall off a collapse, seal a bad tunnel, build pillars. F on a panel removes it.', max: 1, cost: [140], req: { id: 'timber', lvl: 1 }, effect: (t) => { t.bulkhead = true; } },
  { id: 'markers', cat: 'mine', name: 'Markers & Flares', desc: 'Unlocks Survey Markers (show on your compass, so you can find your way back) and Road Flares (a bright light that burns for four minutes, no power needed).', max: 1, cost: [90], effect: (t) => { t.markers = true; } },
  { id: 'struts', cat: 'mine', name: 'Quick Struts', desc: 'Unlocks Struts: a cheap single prop you can set down anywhere, with a small support reach. Not a frame, but it buys you time.', max: 1, cost: [120], effect: (t) => { t.struts = true; } },
  { id: 'dynamite', cat: 'mine', name: 'Dynamite', desc: 'Unlocks Dynamite: a cheap stick with a 4 second fuse that blasts a small hole. Craft it at the bench, aim at the pile and press B. The blast hurts if you are close, and shaking loosens the roof.', max: 1, cost: [260], effect: (t) => { t.dynamite = true; } },
  { id: 'charges', cat: 'mine', name: 'Blasting Charges', desc: 'Unlocks Charges. Set one against the pile, run, and it blows a hole when the fuse ends (6 s). Bigger levels, bigger holes. Blasting throws dust, loosens everything nearby, and the blast hurts if you are close.', max: 3, cost: [1500, 12000, 100000], req: { id: 'timber', lvl: 1 }, effect: (t, l) => { t.charges = l; } },
  { id: 'climb', cat: 'move', name: 'Climbing Gear', desc: 'Pitons, rope and grippy soles. Plush slip away under your feet 25% less per tier on steep slopes.', max: 3, cost: [200, 1500, 12000], effect: (t, l) => { t.climb = l; } },
  { id: 'hpmax', cat: 'mine', name: 'Reinforced Hard Hat', desc: 'More health. +25 max health per level.', max: 4, cost: [90, 700, 5200, 42000], effect: (t, l) => { t.hpBonus = 25 * l; } },
  { id: 'padding', cat: 'mine', name: 'Impact Padding', desc: 'Foam and kevlar under your overalls. Falls, blasts and falling plush hurt 10% less per level.', max: 4, cost: [120, 900, 6500, 48000], effect: (t, l) => { t.dmgCut = 0.1 * l; } },
  { id: 'firstaid', cat: 'mine', name: 'First Aid Station', desc: 'Unlocks Medkits (K heals 50) and Air Canisters (kick in on their own when you run out of air while trapped) at the bench.', max: 1, cost: [160], effect: (t) => { t.firstAid = true; } },
  { id: 'slopeprobe', cat: 'mine', name: 'Slope Probe', desc: 'A clinometer on your wrist. Warns UNSTABLE SLOPE when the plush under or beside you can slide.', max: 1, cost: [380], effect: (t) => { t.slopeProbe = true; } },
  { id: 'jacks', cat: 'mine', name: 'Hydraulic Jacks', desc: 'Unlocks Hydraulic Jacks: a single prop with a wider reach than a strut (2.7 m against 1.9 m). Crafted with Fluff. Place with B anywhere on the floor.', max: 1, cost: [1400], req: { id: 'steel', lvl: 1 }, effect: (t) => { t.jacks = true; } },
  { id: 'airtank', cat: 'mine', name: 'Emergency Air Tank', desc: 'Buried or trapped, you have 60 seconds of air to dig out. Each level adds 30 more.', max: 5, cost: [150, 800, 4500, 30000, 220000], effect: (t, l) => { t.airTank = l; } },
  { id: 'resp', cat: 'mine', name: 'Respirator', desc: 'Dust gets into your lungs in enclosed tunnels. Each level filters 20% more.', max: 4, cost: [120, 900, 7000, 60000], effect: (t, l) => { t.resp = l; } },
  { id: 'hardhat', cat: 'mine', name: 'Hard Hat', desc: 'Falling plush hurt 30% less (on top of Impact Padding), and collapses shake the screen less.', max: 1, cost: [45], effect: (t) => { t.shakeMul = 0.45; t.plushCut = 0.3; } },
  { id: 'airmon', cat: 'sense', name: 'Air Monitor', desc: 'A gauge for the dust in the air around you and the load in your lungs.', max: 1, cost: [150], effect: (t) => { t.airmon = true; } },
  { id: 'compass', cat: 'sense', name: 'Brass Compass', desc: 'A heading strip with N/E/S/W and your coordinates from the sorting bay. Essential for keeping a tunnel straight.', max: 1, cost: [60], effect: (t) => { t.compass = true; } },
  { id: 'plan', cat: 'sense', name: 'Floor Plan', desc: 'Marks the EXIT door on your compass strip with its distance.', max: 1, cost: [350], req: { id: 'compass', lvl: 1 }, effect: (t) => { t.exitMarker = true; } },

  // ---------------- LIGHT ----------------
  { id: 'lamp', cat: 'light', name: 'Headlamp', desc: 'Brighter and reaches further: +3 m of beam and +28% brightness per level.', max: 5, cost: [10, 55, 260, 1300, 6500], effect: (t, l) => { t.lampRange = 10 + l * 3; t.lampPower = 1 + l * 0.28; } },
  { id: 'lantern', cat: 'light', name: 'Work Lanterns', desc: 'Unlocks the Work Lantern recipe. Hang them in the tunnel to light the way back.', max: 1, cost: [60], effect: (t) => { t.lantern = true; } },

  // ---------------- SENSORS ----------------
  { id: 'scan', cat: 'sense', name: 'Squeak Ear', desc: 'You can faintly hear The One. Tiers: 1 close-range squeaks (7 m), 2 a signal meter (16 m), 3 a bearing arrow and a ONE mark on your compass (40 m), 4 the distance (120 m), 5 the height difference (350 m), then long-range arrays: 900 m, 2.8 km and 6.8 km.', max: 8, cost: [90, 700, 6000, 90000, 1500000, 40000000, 900000000, 60000000000], effect: (t, l) => { t.scan = l; t.scanRange = [0, 7, 16, 40, 120, 350, 900, 2800, 6800][l]; } },
  { id: 'locator', cat: 'sense', name: 'Remains Locator', desc: 'A detector tuned to old gear. It marks the nearest abandoned dig on your compass strip (GEAR), out to 45 / 110 / 260 / 600 m. Old crews carry useful things.', max: 4, cost: [800, 9000, 150000, 4000000], req: { id: 'compass', lvl: 1 }, effect: (t, l) => { t.locator = l; t.locatorRange = [0, 45, 110, 260, 600][l]; } },
  { id: 'assay', cat: 'sense', name: 'Vein Assay', desc: 'Veins of rare plush drift through the whole pile, about 4 times richer in rare plush than the rest. Level 1: a meter that climbs as you get within a few metres of one. Level 2: a pointer to the nearest vein within 60 m, with the distance. Level 3: the pointer reaches 150 m and shows which way is up or down.', max: 3, cost: [2200, 14000, 90000], effect: (t, l) => { t.assay = true; t.assayLvl = l; t.assayRange = [0, 0, 60, 150][l]; } },
  { id: 'depots', cat: 'machine', name: 'Depot Beacons', desc: 'Unlocks Depot Beacons: remote sorting points that sell what you carry, open the terminal, set your recall point, and fast-travel between each other. Beacons set far out (250 m, 900 m, 1,900 m and 3,200 m from the bay) also turn up old paperwork: a clue to where The One was shelved.', max: 1, cost: [2500], req: { id: 'bag', lvl: 3 }, effect: (t) => { t.depots = true; } },

  // ---------------- MOBILITY ----------------
  { id: 'boots', cat: 'move', name: 'Running Shoes', desc: '+12% walking speed per level.', max: 4, cost: [20, 90, 420, 1900], effect: (t, l) => { t.walk *= 1 + 0.12 * l; } },
  { id: 'knees', cat: 'move', name: 'Knee Pads', desc: 'Crawl faster in tunnels.', max: 3, cost: [28, 150, 800], effect: (t, l) => { t.crouchMul += 0.15 * l; } },
  { id: 'rope', cat: 'move', name: 'Rope Anchors', desc: 'Unlocks Rope Anchors: stake one into the pile and everything within 6 m is roped in. The slope will not give way under you there, and your steps hardly loosen it. Plant a few going up and the climb is safe.', max: 1, cost: [400], req: { id: 'climb', lvl: 1 }, effect: (t) => { t.rope = true; } },
  { id: 'springs', cat: 'move', name: 'Spring Insoles', desc: 'Jump higher. The pile is steep.', max: 3, cost: [45, 260, 1400], effect: (t, l) => { t.jump += 0.9 * l; } },

  // ---------------- CREW ----------------
  { id: 'crew', cat: 'crew', name: 'Scrapper Bot', desc: 'A little robot crew member. It follows you around, and when you give the order it digs a tunnel in a direction, hauls plush back to the bin and recharges. It levels up as it works: bigger, stronger, faster, wider tunnels. Press V for the crew panel, T to send the crew digging the way you face, Y to call them home. Aim at a bot and press E to pick it, then E on a target to give it an order. Also unlocks the Charging Station (like every machine it needs a Power Cable from a live grid).', max: 1, cost: [1800], needs: 150, req: { id: 'bag', lvl: 3 }, effect: (t) => { t.crewMax += 1; t.machines.push('charger'); } },
  { id: 'crewSlots', cat: 'crew', name: 'More Scrappers', desc: 'Another bunk for a Scrapper Bot, up to nine in all. Needs 400 plush handled, and each bunk costs 2.3x the one before. The bot that fills a bunk is crafted at the Crafting Table (Robots tab).', max: 8, cost: geo(3500, 2.3, 8), needs: 400, req: { id: 'crew', lvl: 1 }, effect: (t, l) => { t.crewMax += l; } },
  { id: 'crewHaul', cat: 'crew', name: 'Bigger Buckets', desc: 'Bots haul 40% of their base load more per trip per level (a fresh bot carries 6, 8, 11, 13, then 16).', max: 4, cost: geo(1500, 3, 4), req: { id: 'crew', lvl: 1 }, effect: (t, l) => { t.crewHaul = 1 + 0.4 * l; } },
  { id: 'crewSpeed', cat: 'crew', name: 'Servo Tuning', desc: 'Bots dig 20% faster per level (walking speed is unchanged).', max: 6, cost: geo(2200, 2.6, 6), req: { id: 'crew', lvl: 1 }, effect: (t, l) => { t.crewSpeed = 1 + 0.2 * l; } },
  { id: 'crewBattery', cat: 'crew', name: 'Long-Life Cells', desc: 'Bots run 60% longer per level before they need to recharge, digging or walking.', max: 4, cost: geo(1800, 2.8, 4), req: { id: 'crew', lvl: 1 }, effect: (t, l) => { t.crewBattery = 1 + 0.6 * l; } },
  { id: 'crewBelt', cat: 'crew', name: 'Belt Kit', desc: 'Bots lay a conveyor behind them as they dig. When the line reaches the bin (or a sorter), they stop hauling and drop plush straight on the belt. Each belt tile costs 3 Fluff. Needs Conveyor Belts and a powered line.', max: 1, cost: [12000], needs: 3000, req: { id: 'belts', lvl: 1 }, effect: (t) => { t.crewBelt = true; } },
  { id: 'crewBolt', cat: 'crew', name: 'Bot Bolter', desc: 'Bots set a 2.4 m cube frame (4x4x4) behind them every fourth step, the best you own and can afford, paid from your Fluff. They trim the bore out to fit the cube. Needs a frame upgrade such as Timber Frames.', max: 1, cost: [26000], needs: 8000, req: { id: 'crewBelt', lvl: 1 }, effect: (t) => { t.crewBolt = true; } },
  { id: 'scholar', cat: 'crew', name: 'Bot Scholar', desc: 'Bots that dig beside a worker\'s remains lift the note out and carry it home to the bin, where it lands in your Field Journal by itself (with its clue, if it holds one). Level 1 carries one note and reaches 3 m, level 2 two notes and 4.5 m, level 3 four notes and 7 m. Supply caches still need you (E). Without this, bots only flag what they find (a mark on the compass, a toast, a line in the crew panel) and stop short of it. Needs 12,000 plush handled.', max: 3, cost: geo(60000, 3, 3), needs: 12000, req: { id: 'crew', lvl: 1 }, effect: (t, l) => { t.scholar = l; } },

  // ---------------- MACHINES ----------------
  { id: 'claw', cat: 'machine', name: 'Claw Rig', desc: 'Unlocks the Claw Rig recipe. Plants itself on the pile and plucks the highest plush in reach, auto-selling them. It does NOT check for The One: if it plucks it, it is sold. Needs power.', max: 1, cost: [900], req: { id: 'power', lvl: 1 }, effect: (t) => { t.machines.push('claw'); t.rigMax += 4; } },
  { id: 'rigCount', cat: 'machine', name: 'More Rigs', desc: 'Allows five more Claw Rigs at once per level. You start with four, so ten levels reach 54 rigs.', max: 10, cost: geo(1400, 2.3, 10), req: { id: 'claw', lvl: 1 }, effect: (t, l) => { t.rigMax += 5 * l; } },
  { id: 'rigSpeed', cat: 'machine', name: 'Rig Motors', desc: 'Claw Rigs grab faster.', max: 6, cost: geo(700, 2.3, 6), req: { id: 'claw', lvl: 1 }, effect: (t, l) => { t.rigRate *= Math.pow(0.78, l); } },
  { id: 'rigReach', cat: 'machine', name: 'Rig Boom', desc: 'Longer arms: bigger area per rig.', max: 4, cost: geo(1100, 2.6, 4), req: { id: 'claw', lvl: 1 }, effect: (t, l) => { t.rigReach += 1.2 * l; } },
  { id: 'power', cat: 'machine', name: 'Power Grid', desc: 'Unlocks Generators and Power Poles. Generators burn Common to Epic plush for power (4.5, 12, 30 and 75 minutes each at 8 kW). Poles are hubs: wire a cable from a generator to a pole and the pole is live, then run more wire from it. Every machine needs its own cable (a belt line needs one cable on any tile). Two generators wired together add their power. Belts, sorters, mechs, borers, rigs and fans all need power.', max: 1, cost: [450], req: { id: 'bag', lvl: 2 }, effect: (t) => { t.machines.push('gen'); t.machines.push('pole'); } },
  { id: 'genOutput', cat: 'machine', name: 'Turbine Upgrades', desc: 'Each level makes generators put out 70% more power than the level before (and burn each plush faster).', max: 6, cost: geo(1200, 2.6, 6), req: { id: 'power', lvl: 1 }, effect: (t, l) => { t.genOutput *= Math.pow(1.7, l); } },
  { id: 'gridRange', cat: 'machine', name: 'Grid Range', desc: 'A Power Cable spans 4 m further per level (14 m to start, 30 m at the top). Cables are the only way power travels.', max: 4, cost: geo(500, 2.8, 4), req: { id: 'power', lvl: 1 }, effect: (t, l) => { t.cableLen += 4 * l; } },
  { id: 'genBuffer', cat: 'machine', name: 'Fuel Hoppers', desc: 'Generators hold more plush in reserve: 100, 200, then 400 (they start at 50, like the Charging Station). Your bots top them up.', max: 3, cost: [800, 4000, 20000], req: { id: 'power', lvl: 1 }, effect: (t, l) => { t.genBuffer = [50, 100, 200, 400][l]; } },
  { id: 'fans', cat: 'machine', name: 'Vent Fans', desc: 'Unlocks Vent Fans. Powered fans clear dust from tunnels within about 14 m.', max: 1, cost: [600], req: { id: 'power', lvl: 1 }, effect: (t) => { t.machines.push('fan'); } },
  { id: 'mfan', cat: 'machine', name: 'Support Fans', desc: 'Unlocks Support Fans: a powered ducted fan you clamp under a frame, which blows fresh air the way you were facing, clearing dust and stale air up to 20 m down the tunnel in front of it. The deeper you dig the staler the air: fresh until about 375 m, then you need a fan every (0.25 x 20 / stale) metres, where stale runs from 0 at 150 m to 1 at 1,050 m. Needs power like any machine.', max: 1, cost: [900], req: { id: 'fans', lvl: 1 }, effect: (t) => { t.machines.push('mfan'); } },
  { id: 'splitter', cat: 'machine', name: 'Belt Splitters', desc: 'Unlocks Splitters: a belt piece that sends plush forward, left and right in turn, so one line can feed several sorters, vaults or lines. Set one on the floor or over an existing belt.', max: 1, cost: [1200], req: { id: 'belts', lvl: 1 }, effect: (t) => { t.machines.push('splitter'); } },
  { id: 'detector', cat: 'machine', name: 'Detector Gate', desc: 'A metal-detector arch you set over a belt. Everything that rolls through gets scanned: green beep for ordinary plush, RED alarm and the line holds the item when it is The One. Build as many as you like. Bots and mechs only protect The One if it passes a gate: anything that reaches the bin unscanned is sold, and The One cannot be sold back.', max: 1, cost: [30], req: { id: 'bag', lvl: 1 }, effect: (t) => { t.machines.push('gate'); } },
  { id: 'belts', cat: 'machine', name: 'Conveyor Belts', desc: 'Unlocks belts (R toggles ramp up/down). Run plush from the pile to the bin or sorters, through tunnels and up slopes. Lay a line by holding B. Needs power.', max: 1, cost: [350], req: { id: 'power', lvl: 1 }, effect: (t) => { t.machines.push('belt'); } },
  { id: 'beltSpeed', cat: 'machine', name: 'Belt Motors', desc: 'Faster belts and sorting boxes: +30% speed per level.', max: 6, cost: geo(450, 2.4, 6), req: { id: 'belts', lvl: 1 }, effect: (t, l) => { t.beltSpeed *= Math.pow(1.3, l); } },
  { id: 'sorter', cat: 'machine', name: 'Sorting Box', desc: 'A processing box. Sells what falls under its filter and passes the rest on. Also sucks in plush you carry when you are near, so build them at the face.', max: 1, cost: [600], req: { id: 'belts', lvl: 1 }, effect: (t) => { t.machines.push('sorter'); } },
  { id: 'optics', cat: 'machine', name: 'Rarity Optics', desc: 'Sorting Boxes learn to keep rarer plush instead of selling it. Each level adds one tier to the filter, from Uncommon+ up to Mythic+. Press E on a box to cycle its filter.', max: 5, cost: geo(1200, 2.5, 5), req: { id: 'sorter', lvl: 1 }, effect: (t, l) => { t.sorterTiers = l; } },
  { id: 'vault', cat: 'machine', name: 'Vault Crate', desc: 'Stores plush at the end of a line. E empties it into your hands.', max: 1, cost: [900], req: { id: 'sorter', lvl: 1 }, effect: (t) => { t.machines.push('vault'); } },
  { id: 'mech', cat: 'machine', name: 'Mech Scooper', desc: 'A little digging robot. Scoops plush from the face in front of it and loads them onto the belt behind. Marches forward when the face is clear.', max: 1, cost: [2600], req: { id: 'sorter', lvl: 1 }, effect: (t) => { t.machines.push('mech'); t.mechMax += 1; } },
  { id: 'mechCount', cat: 'machine', name: 'Mech Fleet', desc: 'Run more Mech Scoopers at once.', max: 8, cost: geo(4200, 2.0, 8), req: { id: 'mech', lvl: 1 }, effect: (t, l) => { t.mechMax += l; } },
  { id: 'mechSpeed', cat: 'machine', name: 'Hydraulics', desc: 'Mechs scoop faster.', max: 6, cost: geo(3000, 2.3, 6), req: { id: 'mech', lvl: 1 }, effect: (t, l) => { t.mechRate *= Math.pow(0.8, l); } },
  { id: 'mechBuf', cat: 'machine', name: 'Mech Hopper', desc: 'Bigger onboard buffer so mechs keep working while a belt backs up.', max: 3, cost: [3500, 12000, 40000], req: { id: 'mech', lvl: 1 }, effect: (t, l) => { t.mechBuffer = [6, 12, 24, 48][l]; } },
  { id: 'mechLayer', cat: 'machine', name: 'Belt Layer', desc: 'Mechs lay a belt behind them as they advance (3 Fluff each), so a tunnel line builds itself.', max: 1, cost: [7000], req: { id: 'mech', lvl: 1 }, effect: (t) => { t.mechLayer = true; } },
  { id: 'mechBolt', cat: 'machine', name: 'Roof Bolter', desc: 'Mechs set a 2.4 m cube frame (4x4x4) behind them every fourth step, using the best frame you own and can pay for, trimming their bore out to fit it. Costs Fluff. Open ground with no roof to prop gets none.', max: 1, cost: [11000], req: { id: 'mechLayer', lvl: 1 }, effect: (t) => { t.mechBolt = true; } },
  { id: 'borer', cat: 'machine', name: 'Tunnel Borer', desc: 'Unlocks the Tunnel Borer. Drives a lined tunnel forward through the pile on its own, selling what it eats. It never eats The One: that cell stays in the pile.', max: 1, cost: [9000], req: { id: 'steel', lvl: 1 }, effect: (t) => { t.machines.push('borer'); t.borerMax += 1; } },
  { id: 'borerCount', cat: 'machine', name: 'Borer Fleet', desc: 'One more Tunnel Borer at once.', max: 4, cost: geo(16000, 2.6, 4), req: { id: 'borer', lvl: 1 }, effect: (t, l) => { t.borerMax += l; } },
  { id: 'borerSpeed', cat: 'machine', name: 'Cutter Head', desc: 'Borers dig faster.', max: 6, cost: geo(7000, 2.4, 6), req: { id: 'borer', lvl: 1 }, effect: (t, l) => { t.borerRate *= Math.pow(0.78, l); } },
  { id: 'borerSize', cat: 'machine', name: 'Wide Bore', desc: 'Bigger tunnel cross-section for borers you place afterwards: 4x4, then 5x4 (up from 2x3).', max: 2, cost: [22000, 90000], req: { id: 'borer', lvl: 1 }, effect: (t, l) => { t.borerW = [3, 4, 5][l]; t.borerH = [3, 4, 4][l]; } },
];

// Everything is expensive on purpose: the early game is slow hand work, and the numbers only open up with machines.
export const COST_SCALE = 8;  // price pacing: once you grab fast, income compounds, so prices must climb with it (was 12: the early and middle game felt too far apart)
for (const u of UPGRADES) u.cost = u.cost.map((c) => Math.round(c * COST_SCALE));

// Endgame perks: priced for runs that already own the whole tree (millions to hundreds of millions). Not scaled again.
const ENDGAME = [
  { id: 'nightshift', cat: 'machine', name: 'Night Shift', desc: 'Keep the warehouse lights on after closing time. Press the red button on the stand in the middle of the hall (or buy it here). Your helmet lamp still works the same. One purchase for the whole team.', max: 1, cost: [100e6], effect: (t) => { t.nightShift = true; } },
  { id: 'midas', cat: 'sort', name: 'Midas Contract', desc: 'A standing deal with the richest buyers: every sale pays x1.35 per level, on top of Haggling. Needs Haggling at level 10.', max: 5, cost: [2.5e6, 9e6, 32e6, 110e6, 400e6], req: { id: 'haggle', lvl: 10 }, effect: (t, l) => { t.sellMult *= Math.pow(1.35, l); } },
  { id: 'exchange', cat: 'sort', name: 'Plushdex Exchange', desc: `Collectors pay for completeness: +${DEXPCT(DEX_UNIT / 2)}% sell price per discovered species, per level (a full dex adds 3.3x per level), on top of the Appraiser. Needs the Appraiser.`, max: 3, cost: [4e6, 20e6, 100e6], req: { id: 'dex', lvl: 1 }, effect: (t, l) => { t.dexBonus = (t.dexBonus || 0) + (DEX_UNIT / 2) * l; } },
  { id: 'titanGrip', cat: 'hands', name: 'Titan Grip', desc: 'Servo-assisted fingers: the pause between grabs shrinks by 20% per level. Needs Grippy Gloves at the top level.', max: 3, cost: [1.5e6, 7e6, 30e6], req: { id: 'gloves', lvl: 7 }, effect: (t, l) => { t.grabTime *= Math.pow(0.8, l); } },
  { id: 'longArm', cat: 'hands', name: 'Gantry Arms', desc: 'Reach another 1.5 m per level. Needs the Telescoping Grabber at the top level.', max: 3, cost: [2e6, 9e6, 40e6], req: { id: 'reach', lvl: 4 }, effect: (t, l) => { t.reach += 1.5 * l; } },
  { id: 'fusion', cat: 'machine', name: 'Fusion Cores', desc: 'Generators put out 2.5x the power per level, on top of Turbine Upgrades (and burn each plush that much faster). Needs Turbines at the top level.', max: 3, cost: [3e6, 15e6, 75e6], req: { id: 'genOutput', lvl: 6 }, effect: (t, l) => { t.genOutput *= Math.pow(2.5, l); } },
  { id: 'rigSwarm', cat: 'machine', name: 'Rig Swarm', desc: 'Six more Claw Rigs per level and 25% faster motors. Needs More Rigs at the top level.', max: 3, cost: [3.5e6, 16e6, 70e6], req: { id: 'rigCount', lvl: 10 }, effect: (t, l) => { t.rigMax += 6 * l; t.rigRate *= Math.pow(0.75, l); } },
  { id: 'mechLegion', cat: 'machine', name: 'Mech Legion', desc: 'Eight more Mech Scoopers per level and 25% faster hydraulics. Needs Mech Fleet at the top level.', max: 3, cost: [4e6, 18e6, 80e6], req: { id: 'mechCount', lvl: 8 }, effect: (t, l) => { t.mechMax += 8 * l; t.mechRate *= Math.pow(0.75, l); } },
  { id: 'borerLegion', cat: 'machine', name: 'Borer Legion', desc: 'Three more Tunnel Borers per level and 25% faster cutter heads. Needs Borer Fleet at the top level.', max: 3, cost: [6e6, 28e6, 120e6], req: { id: 'borerCount', lvl: 4 }, effect: (t, l) => { t.borerMax += 3 * l; t.borerRate *= Math.pow(0.75, l); } },
  { id: 'overdrive', cat: 'machine', name: 'Belt Overdrive', desc: 'Belts and sorting boxes run 1.5x faster per level, on top of Belt Motors. Needs Belt Motors at the top level.', max: 3, cost: [2e6, 10e6, 45e6], req: { id: 'beltSpeed', lvl: 6 }, effect: (t, l) => { t.beltSpeed *= Math.pow(1.5, l); } },
];
UPGRADES.push(...ENDGAME);

// Beyond the endgame: a new top above the old maxes of every line (each needs the old top level, so nothing that exists changes), plus the
// earth movers (Excavator, Bulldozer, Bucket-Wheel Excavator, Haul Truck, see earth.js). Priced for runs that own the whole tree
// (tens of millions up to hundreds of billions). Not scaled again.
const MORE = [
  // ---------------- HANDS ----------------
  { id: 'exo', cat: 'hands', name: 'Exo Gauntlets', desc: 'Powered gauntlets: the pause between grabs shrinks by 18% per level, on top of Titan Grip. Needs Titan Grip at the top level.', max: 4, cost: geo(4e7, 2.4, 4), req: { id: 'titanGrip', lvl: 3 }, effect: (t, l) => { t.grabTime *= Math.pow(0.82, l); } },
  { id: 'cargo', cat: 'hands', name: 'Cargo Hold', desc: 'Your pack grows into a cargo hold: +60, +160, +400, then +1,000 carry capacity on top of Carry Capacity. Needs the Gantry Hopper (Carry Capacity at the top level).', max: 4, cost: geo(3e7, 2.5, 4), req: { id: 'bag', lvl: 8 }, effect: (t, l) => { t.carry += [0, 60, 160, 400, 1000][l]; } },
  { id: 'crane', cat: 'hands', name: 'Crane Arms', desc: 'Reach another 2 m per level, on top of Gantry Arms. Needs Gantry Arms at the top level.', max: 3, cost: geo(3e7, 4, 3), req: { id: 'longArm', lvl: 3 }, effect: (t, l) => { t.reach += 2 * l; } },
  { id: 'bucketHands', cat: 'hands', name: 'Bucket Hands', desc: 'Each grab scoops 16, 40, 90, then 200 more plush along your aim, on top of Scoop Hands (the scoop tube widens as it grows). Needs Scoop Hands at the top level.', max: 4, cost: geo(2.5e7, 2.8, 4), req: { id: 'scoop', lvl: 4 }, effect: (t, l) => { t.scoop += [0, 16, 40, 90, 200][l]; } },
  { id: 'railArm', cat: 'hands', name: 'Rail Arm', desc: 'A magnetic rail behind your throw: +6 m/s per level on top of the Throwing Arm. Needs the Throwing Arm at the top level.', max: 3, cost: geo(2.2e7, 3, 3), req: { id: 'throw', lvl: 6 }, effect: (t, l) => { t.throwPower += 6 * l; } },
  { id: 'gravWell', cat: 'hands', name: 'Gravity Well', desc: 'Loose plush fly to you from a further 12, 30, then 70 m, on top of the Scavenger Magnet. Needs the Scavenger Magnet at the top level.', max: 3, cost: geo(2e7, 3.2, 3), req: { id: 'scavenge', lvl: 3 }, effect: (t, l) => { t.scavRange += [0, 12, 30, 70][l]; } },

  // ---------------- SORTING ----------------
  { id: 'auction', cat: 'sort', name: 'Auction House', desc: 'Every sale goes to the highest bidder: x1.5 per level, on top of the Midas Contract. Needs the Midas Contract at the top level.', max: 5, cost: geo(1e9, 3.4, 5), req: { id: 'midas', lvl: 5 }, effect: (t, l) => { t.sellMult *= Math.pow(1.5, l); } },
  { id: 'fever', cat: 'sort', name: 'Fever Pitch', desc: 'Raises the Hot Hands combo cap by 16 per level. Needs Hot Hands at the top level.', max: 3, cost: geo(2.5e7, 3, 3), req: { id: 'streak', lvl: 5 }, effect: (t, l) => { t.streakCap += 16 * l; } },
  { id: 'tractor', cat: 'sort', name: 'Tractor Beam', desc: 'The bin mouth is 0.6 m wider per level, on top of the Bin Magnet. Needs the Bin Magnet at the top level.', max: 3, cost: geo(1.5e7, 3, 3), req: { id: 'magnet', lvl: 3 }, effect: (t, l) => { t.binCatch += 0.6 * l; } },
  { id: 'registry', cat: 'sort', name: 'Species Registry', desc: `+${DEXPCT(DEX_UNIT / 2)}% sell price per discovered species, per level (a full dex adds 3.3x per level), on top of the Exchange. Needs the Plushdex Exchange at the top level.`, max: 3, cost: geo(6e7, 3, 3), req: { id: 'exchange', lvl: 3 }, effect: (t, l) => { t.dexBonus = (t.dexBonus || 0) + (DEX_UNIT / 2) * l; } },
  { id: 'prism', cat: 'sort', name: 'Prismatic Loupe', desc: 'Shiny plush are worth 4 more times the base price per level (on top of the Loupe: 12x, 16x, 20x, then 24x). Needs the Collector\'s Loupe.', max: 4, cost: geo(2e7, 2.6, 4), req: { id: 'shinyEye', lvl: 1 }, effect: (t, l) => { t.shinyMult += 4 * l; } },
  { id: 'brokerage', cat: 'sort', name: 'Brokerage', desc: 'One more contract slot per level, on top of More Contracts. Needs More Contracts at the top level.', max: 4, cost: geo(2e7, 4, 4), req: { id: 'contractSlots', lvl: 3 }, effect: (t, l) => { t.contractSlots += l; } },

  // ---------------- MINING AND SUPPORTS ----------------
  { id: 'bedrockTamp', cat: 'mine', name: 'Bedrock Tamping', desc: 'Compacts the whole pile further: +1.2 m of safe unsupported tunnel per level, everywhere, on top of Pile Tamping. Needs Pile Tamping at the top level.', max: 4, cost: geo(3e7, 2.8, 4), req: { id: 'tamp', lvl: 8 }, effect: (t, l) => { t.stabBonus += l; } },
  { id: 'seismo', cat: 'mine', name: 'Seismograph', desc: 'A longer warning before a roof lets go: +0.55 s per level on top of the Creak Sensor. Needs the Creak Sensor at the top level.', max: 3, cost: geo(1.5e7, 3, 3), req: { id: 'creak', lvl: 3 }, effect: (t, l) => { t.warn += 0.55 * l; } },
  { id: 'ablative', cat: 'mine', name: 'Ablative Helm', desc: '+40 max health per level, on top of the Reinforced Hard Hat. Needs the Reinforced Hard Hat at the top level.', max: 5, cost: geo(1e7, 2.6, 5), req: { id: 'hpmax', lvl: 4 }, effect: (t, l) => { t.hpBonus += 40 * l; } },
  { id: 'reactive', cat: 'mine', name: 'Reactive Armor', desc: 'Falls, blasts and falling plush hurt another 5% less per level, on top of Impact Padding (the cut from the two stops at 60%). Needs Impact Padding at the top level.', max: 4, cost: geo(1.2e7, 2.7, 4), req: { id: 'padding', lvl: 4 }, effect: (t, l) => { t.dmgCut += 0.05 * l; } },
  { id: 'rebreather', cat: 'mine', name: 'Rebreather', desc: 'A closed-circuit rig: 90 more seconds of air per level when you are buried or trapped, on top of the Emergency Air Tank. Needs the Air Tank at the top level.', max: 3, cost: geo(8e6, 3, 3), req: { id: 'airtank', lvl: 5 }, effect: (t, l) => { t.airTank += 3 * l; } },

  // ---------------- LIGHT ----------------
  { id: 'searchlight', cat: 'light', name: 'Searchlight', desc: 'A roof-rack searchlight: +4 m of beam and +30% brightness per level, on top of the Headlamp. Needs the Headlamp at the top level.', max: 4, cost: geo(6e6, 3, 4), req: { id: 'lamp', lvl: 5 }, effect: (t, l) => { t.lampRange += 4 * l; t.lampPower += 0.3 * l; } },
  { id: 'beamFocus', cat: 'light', name: 'Beam Focus', desc: 'A tight lens: +6 m of beam per level, on top of the Searchlight. Needs the Searchlight at the top level.', max: 3, cost: geo(4e7, 3, 3), req: { id: 'searchlight', lvl: 4 }, effect: (t, l) => { t.lampRange += 6 * l; } },

  // ---------------- SENSORS ----------------
  { id: 'deepArray', cat: 'sense', name: 'Deep Array', desc: 'Squeak Ear arrays reach 1.5x further per level, so the signal meter reads stronger from any distance. Needs the Squeak Ear at the top level.', max: 4, cost: geo(1.5e12, 3, 4), req: { id: 'scan', lvl: 8 }, effect: (t, l) => { t.scanRange *= Math.pow(1.5, l); } },
  { id: 'radar', cat: 'sense', name: 'Remains Radar', desc: 'The compass marks the 2, 3, then 4 nearest abandoned digs (GEAR) instead of only the nearest. Needs the Remains Locator at the top level.', max: 3, cost: geo(3e7, 3.3, 3), req: { id: 'locator', lvl: 4 }, effect: (t, l) => { t.locatorCount += l; } },
  { id: 'seismicAssay', cat: 'sense', name: 'Seismic Assay', desc: 'The Vein Assay meter starts climbing sooner and reads stronger: 0.1 lower on its scale per level, so a vein shows from further away. Needs the Vein Assay at the top level.', max: 3, cost: geo(4e7, 3.2, 3), req: { id: 'assay', lvl: 3 }, effect: (t, l) => { t.assayFloor -= 0.1 * l; } },

  // ---------------- MOBILITY ----------------
  { id: 'hover', cat: 'move', name: 'Hover Boots', desc: '+10% walking speed per level, on top of Running Shoes. Needs Running Shoes at the top level.', max: 5, cost: geo(5e6, 2.7, 5), req: { id: 'boots', lvl: 4 }, effect: (t, l) => { t.walk *= 1 + 0.1 * l; } },
  { id: 'crawlRails', cat: 'move', name: 'Crawl Rails', desc: 'Crawl another 10% faster per level in tunnels, on top of Knee Pads. Needs Knee Pads at the top level.', max: 3, cost: geo(4e6, 3, 3), req: { id: 'knees', lvl: 3 }, effect: (t, l) => { t.crouchMul += 0.1 * l; } },
  { id: 'rocketBoots', cat: 'move', name: 'Rocket Boots', desc: 'Jump higher still: +0.7 per level, on top of Spring Insoles. Needs Spring Insoles at the top level.', max: 3, cost: geo(6e6, 3, 3), req: { id: 'springs', lvl: 3 }, effect: (t, l) => { t.jump += 0.7 * l; } },

  // ---------------- CREW ----------------
  { id: 'foundry', cat: 'crew', name: 'Bot Foundry', desc: 'Another bunk for a Scrapper Bot per level, on top of the nine from More Scrappers. Craft the bots at the Crafting Table (Robots tab). Needs More Scrappers at the top level.', max: 6, cost: geo(3e7, 2.4, 6), req: { id: 'crewSlots', lvl: 8 }, effect: (t, l) => { t.crewMax += l; } },
  { id: 'titanBuckets', cat: 'crew', name: 'Titan Buckets', desc: 'Bots haul another 40% of their base load per trip per level, on top of Bigger Buckets. Needs Bigger Buckets at the top level.', max: 4, cost: geo(2e7, 2.8, 4), req: { id: 'crewHaul', lvl: 4 }, effect: (t, l) => { t.crewHaul += 0.4 * l; } },
  { id: 'servoOC', cat: 'crew', name: 'Overclocked Servos', desc: 'Bots dig another 20% faster per level, on top of Servo Tuning. Needs Servo Tuning at the top level.', max: 5, cost: geo(2.5e7, 2.6, 5), req: { id: 'crewSpeed', lvl: 6 }, effect: (t, l) => { t.crewSpeed += 0.2 * l; } },
  { id: 'fusionCells', cat: 'crew', name: 'Fusion Cells', desc: 'Bots run another 60% longer per level before they need to recharge, on top of Long-Life Cells. Needs Long-Life Cells at the top level.', max: 4, cost: geo(2e7, 2.8, 4), req: { id: 'crewBattery', lvl: 4 }, effect: (t, l) => { t.crewBattery += 0.6 * l; } },

  // ---------------- MACHINES ----------------
  { id: 'rigGantry', cat: 'machine', name: 'Rig Gantry', desc: 'Claw Rig arms reach another 1.2 m per level, on top of the Rig Boom. Needs the Rig Boom at the top level.', max: 3, cost: geo(3e7, 3, 3), req: { id: 'rigReach', lvl: 4 }, effect: (t, l) => { t.rigReach += 1.2 * l; } },
  { id: 'rigTitan', cat: 'machine', name: 'Rig Titan Motors', desc: 'Claw Rigs grab 20% faster per level, on top of Rig Motors. Needs Rig Motors at the top level.', max: 4, cost: geo(2e7, 2.8, 4), req: { id: 'rigSpeed', lvl: 6 }, effect: (t, l) => { t.rigRate *= Math.pow(0.8, l); } },
  { id: 'mechOverclock', cat: 'machine', name: 'Mech Overclock', desc: 'Mechs scoop 20% faster per level, on top of Hydraulics. Needs Hydraulics at the top level.', max: 4, cost: geo(2.5e7, 2.8, 4), req: { id: 'mechSpeed', lvl: 6 }, effect: (t, l) => { t.mechRate *= Math.pow(0.8, l); } },
  { id: 'mechSilo', cat: 'machine', name: 'Mech Silo', desc: 'Mech hoppers hold 24, 72, then 200 more plush. Needs the Mech Hopper at the top level.', max: 3, cost: geo(1.5e7, 3, 3), req: { id: 'mechBuf', lvl: 3 }, effect: (t, l) => { t.mechBuffer += [0, 24, 72, 200][l]; } },
  { id: 'plasmaCutters', cat: 'machine', name: 'Plasma Cutters', desc: 'Tunnel Borers dig 20% faster per level, on top of the Cutter Head. Needs the Cutter Head at the top level.', max: 4, cost: geo(3e7, 2.8, 4), req: { id: 'borerSpeed', lvl: 6 }, effect: (t, l) => { t.borerRate *= Math.pow(0.8, l); } },
  { id: 'siloHoppers', cat: 'machine', name: 'Silo Hoppers', desc: 'Generators hold 150, 450, then 1,350 more plush in reserve. Needs Fuel Hoppers at the top level.', max: 3, cost: geo(1e7, 3, 3), req: { id: 'genBuffer', lvl: 3 }, effect: (t, l) => { t.genBuffer += [0, 150, 450, 1350][l]; } },
  { id: 'superPoles', cat: 'machine', name: 'Superconducting Poles', desc: 'A Power Cable spans 8 m further per level, on top of Grid Range (up to 54 m). Needs Grid Range at the top level.', max: 3, cost: geo(2e7, 3, 3), req: { id: 'gridRange', lvl: 4 }, effect: (t, l) => { t.cableLen += 8 * l; } },
  { id: 'dysonCores', cat: 'machine', name: 'Dyson Cores', desc: 'Generators put out 3x the power per level, on top of Fusion Cores (and burn each plush that much faster). Needs Fusion Cores at the top level.', max: 3, cost: geo(4e8, 4, 3), req: { id: 'fusion', lvl: 3 }, effect: (t, l) => { t.genOutput *= Math.pow(3, l); } },

  // ---- Earth movers. Each unlock needs a different old tree at its top; the Haul Truck and the diggers work together (see earth.js).
  { id: 'excavator', cat: 'machine', name: 'Excavator', desc: 'Unlocks the Excavator: a big tracked digger that stands in front of the pile wall and swings its bucket across a 7 wide, 5 high face, filling a 240 plush hopper. Empty the hopper onto a belt behind it, with a Haul Truck, or by hand (E). It stops where the mountain presses harder than the best frame you own could bear, and chokes on stale air without a Support Fan. It scoops The One too and keeps it in the hopper (E takes it, a Haul Truck carries it through a Vehicle Scanner). Needs power (30 kW). Needs the Wide Bore at the top level.', max: 1, cost: [6e6], req: { id: 'borerSize', lvl: 2 }, effect: (t) => { t.machines.push('excavator'); t.excavMax += 1; } },
  { id: 'excavatorCount', cat: 'machine', name: 'Excavator Fleet', desc: 'Run one more Excavator at once per level.', max: 4, cost: geo(9e6, 2.2, 4), req: { id: 'excavator', lvl: 1 }, effect: (t, l) => { t.excavMax += l; } },
  { id: 'excavatorSpeed', cat: 'machine', name: 'Boom Hydraulics', desc: 'Excavators swing 20% faster per level.', max: 6, cost: geo(8e6, 2.3, 6), req: { id: 'excavator', lvl: 1 }, effect: (t, l) => { t.excavRate *= Math.pow(0.8, l); } },
  { id: 'excavatorBucket', cat: 'machine', name: 'Bigger Bucket', desc: 'An Excavator bucket takes 20, 32, 48, then 72 plush a swing (up from 12).', max: 4, cost: geo(1.2e7, 2.4, 4), req: { id: 'excavator', lvl: 1 }, effect: (t, l) => { t.excavSwing = [12, 20, 32, 48, 72][l]; } },
  { id: 'dozer', cat: 'machine', name: 'Bulldozer', desc: 'Unlocks the Bulldozer: a low tracked pusher that keeps a wide blade in the foot of the pile and shoves whole rows out of it. It pushes plush onto a belt, sorter or vault behind it at full value, or down its own chute at 85% when there is none. It stops where the mountain presses harder than the best frame you own could bear, and chokes on stale air without a Support Fan. It scoops The One too and keeps it aboard (E takes it, a Haul Truck carries it through a Vehicle Scanner). Needs power (22 kW). Needs the Mech Hopper at the top level.', max: 1, cost: [4e6], req: { id: 'mechBuf', lvl: 3 }, effect: (t) => { t.machines.push('dozer'); t.dozerMax += 1; } },
  { id: 'dozerCount', cat: 'machine', name: 'Dozer Fleet', desc: 'Run one more Bulldozer at once per level.', max: 4, cost: geo(6e6, 2.2, 4), req: { id: 'dozer', lvl: 1 }, effect: (t, l) => { t.dozerMax += l; } },
  { id: 'dozerSpeed', cat: 'machine', name: 'Pusher Drive', desc: 'Bulldozers make a pass 20% faster per level.', max: 6, cost: geo(5e6, 2.3, 6), req: { id: 'dozer', lvl: 1 }, effect: (t, l) => { t.dozerRate *= Math.pow(0.8, l); } },
  { id: 'dozerBlade', cat: 'machine', name: 'Wide Blade', desc: 'A Bulldozer blade is 7, 9, then 11 plush wide (up from 5).', max: 3, cost: geo(8e6, 2.6, 3), req: { id: 'dozer', lvl: 1 }, effect: (t, l) => { t.dozerBlade = [5, 7, 9, 11][l]; } },
  { id: 'wheel', cat: 'machine', name: 'Bucket-Wheel Excavator', desc: 'Unlocks the Bucket-Wheel Excavator: an enormous rail-mounted digger whose spinning wheel eats an 11 wide, 6 high face, 40 plush at a time, into a 1,500 plush hopper. Empty the hopper onto a belt, with Haul Trucks, or by hand (E). It stops where the mountain presses harder than the best frame you own could bear, and chokes on stale air without a Support Fan. It scoops The One too and keeps it in the hopper (E takes it, a Haul Truck carries it through a Vehicle Scanner). Needs power (80 kW). Needs Excavator Fleet at the top level.', max: 1, cost: [4.5e7], req: { id: 'excavatorCount', lvl: 4 }, effect: (t) => { t.machines.push('wheel'); t.wheelMax += 1; } },
  { id: 'wheelCount', cat: 'machine', name: 'Wheel Fleet', desc: 'Run one more Bucket-Wheel Excavator at once per level.', max: 3, cost: geo(6e7, 2.6, 3), req: { id: 'wheel', lvl: 1 }, effect: (t, l) => { t.wheelMax += l; } },
  { id: 'wheelSpeed', cat: 'machine', name: 'Wheel Drive', desc: 'Bucket-Wheel Excavators turn 20% faster per level.', max: 5, cost: geo(4e7, 2.4, 5), req: { id: 'wheel', lvl: 1 }, effect: (t, l) => { t.wheelRate *= Math.pow(0.8, l); } },
  { id: 'wheelBuckets', cat: 'machine', name: 'Wheel Buckets', desc: 'The wheel takes 64, 100, then 160 plush a turn (up from 40).', max: 3, cost: geo(5e7, 2.6, 3), req: { id: 'wheel', lvl: 1 }, effect: (t, l) => { t.wheelSwing = [40, 64, 100, 160][l]; } },
  { id: 'truck', cat: 'machine', name: 'Haul Truck', desc: 'Unlocks the Haul Truck (you may run two). Park it in a yard and run a Power Cable to it from a live pole or generator (a truck is a machine like any other): when a digger\'s hopper fills it drives out along a straight route, loads up to 240 plush, hauls them to the nearest bin or Depot Beacon, sells them and drives back. Its drive needs power (10 kW) at its yard. A Vehicle Scanner on its road checks every load: a truck holding The One will not leave without one. Needs Belt Motors at the top level.', max: 1, cost: [3e6], req: { id: 'beltSpeed', lvl: 6 }, effect: (t) => { t.machines.push('truck'); t.truckMax += 2; } },
  { id: 'truckCount', cat: 'machine', name: 'Truck Fleet', desc: 'Run two more Haul Trucks at once per level.', max: 6, cost: geo(3e6, 1.9, 6), req: { id: 'truck', lvl: 1 }, effect: (t, l) => { t.truckMax += 2 * l; } },
  { id: 'truckSpeed', cat: 'machine', name: 'Diesel Swap', desc: 'Haul Trucks drive 25% faster per level.', max: 6, cost: geo(4e6, 2.1, 6), req: { id: 'truck', lvl: 1 }, effect: (t, l) => { t.truckSpeed *= Math.pow(1.25, l); } },
  { id: 'truckBed', cat: 'machine', name: 'Big Beds', desc: 'A Haul Truck carries 480, 960, 1,920, then 3,840 plush a trip (up from 240).', max: 4, cost: geo(5e6, 2.5, 4), req: { id: 'truck', lvl: 1 }, effect: (t, l) => { t.truckBed = [240, 480, 960, 1920, 3840][l]; } },
  { id: 'truckRange', cat: 'machine', name: 'Dispatch Radio', desc: 'Trucks answer hoppers 800, 1,600, 3,200, then 6,400 m from their yard (up from 400).', max: 4, cost: geo(4e6, 2.6, 4), req: { id: 'truck', lvl: 1 }, effect: (t, l) => { t.truckRange = [400, 800, 1600, 3200, 6400][l]; } },
  { id: 'hopperLiner', cat: 'machine', name: 'Hopper Liners', desc: 'Excavator and Bucket-Wheel hoppers hold 2x, 4x, 8x, then 16x the plush. Needs the Excavator.', max: 4, cost: geo(1.5e7, 2.5, 4), req: { id: 'excavator', lvl: 1 }, effect: (t, l) => { t.hopMul *= Math.pow(2, l); } },
  { id: 'earthDrives', cat: 'machine', name: 'Efficient Drives', desc: 'Earth movers draw 15% less power per level. Needs Fusion Cores at the top level.', max: 4, cost: geo(3e7, 2.6, 4), req: { id: 'fusion', lvl: 3 }, effect: (t, l) => { t.earthDraw *= Math.pow(0.85, l); } },
  { id: 'earthFleet', cat: 'machine', name: 'Fleet Contracts', desc: 'One more of every earth mover you have unlocked per level. Needs Efficient Drives at the top level.', max: 3, cost: geo(9e7, 3, 3), req: { id: 'earthDrives', lvl: 4 }, effect: (t, l) => { t.fleetBonus += l; } },
];
UPGRADES.push(...MORE);
for (const u of [...ENDGAME, ...MORE]) u.fresh = true;   // the lines added after the original tree: each gets a 'maxed it' achievement

// High-end frame unlocks are priced for runs that own everything else: Concrete is a 20M purchase and each tier after costs about 6x the last. Absolute prices, not scaled.
const FRAME_PRICES = { steel: 2e6, concrete: 20e6, rebar: 120e6, titan: 720e6, carbon: 4.3e9, plasma: 26e9, voidl: 156e9, neutron: 940e9, horizon: 5.6e12 };
for (const u of UPGRADES) if (FRAME_PRICES[u.id] && u.cat === 'mine') u.cost = [FRAME_PRICES[u.id]];
mergeUpgrades(UPGRADES);   // the Satisfactory catalog parts (catalog_*.js): absolute costs, appended last so no id above changes


export const FRAME_TYPES = {
  timber:   { name: 'Timber Frame',     cost: 36,      bonus: 1, radius: 2.5, maxDepth: 150, color: 0x9a6b3a, icon: '🪵' },
  steel:    { name: 'Steel Frame',      cost: 210,      bonus: 2, radius: 3.4, maxDepth: 380, color: 0x77879a, icon: '🔩' },
  concrete: { name: 'Concrete Lining',  cost: 780,     bonus: 3, radius: 4.4, maxDepth: 800, color: 0xb9b7ac, icon: '🏛️' },
  rebar:    { name: 'Rebar Cage',       cost: 4500,    bonus: 4, radius: 5.0, maxDepth: 1300, color: 0x8a6a58, icon: '⛓️' },
  titan:    { name: 'Titanium Rib',     cost: 27000,    bonus: 5, radius: 5.6, maxDepth: 1800, color: 0xb7c3d0, icon: '🔷' },
  carbon:   { name: 'Carbon Weave',     cost: 156000,   bonus: 6, radius: 6.2, maxDepth: 2300, color: 0x2b2f36, icon: '⬛' },
  plasma:   { name: 'Plasma Arch',      cost: 900000,  bonus: 7, radius: 6.8, maxDepth: 3200, color: 0x7ad7ff, icon: '🌀' },
  voidl:    { name: 'Void Lattice',     cost: 16200000, bonus: 8, radius: 7.6, maxDepth: 3900, color: 0xb078ff, icon: '🕳️' },
  neutron:  { name: 'Neutron Shell',    cost: 99000000, bonus: 9, radius: 8.4, maxDepth: 4500, color: 0xfff0b0, icon: '⚛️' },
  horizon:  { name: 'Event Horizon',    cost: 630000000, bonus: 10, radius: 9.2, maxDepth: Infinity, color: 0x101018, icon: '⚫' },
};

// How deep (metres from the start, toward the exit 4.9 km out) a support can stand. The mountain presses harder the deeper you go:
// near its limit a support creaks, past it the support breaks the moment you set it. Struts and jacks are weaker than frames.
export const STRUT_DEPTH = { strut: 110, jack: 320 };
export const supportDepth = (x, z) => Math.hypot(x, z);
export function betterThan(kind) { const ks = Object.keys(FRAME_TYPES); const n = FRAME_TYPES[kind].maxDepth; return ks.find((k) => FRAME_TYPES[k].maxDepth > n * 1.0001) || null; }

// Wearable efficiency upgrades (they work as soon as you buy them).
export const GEAR = ['gloves', 'reach', 'bag', 'boots', 'knees', 'springs', 'lamp', 'resp', 'scoop', 'vac', 'scavenge', 'climb'];
export function effLevels(S) {
  const e = { ...S.up };
  const g = S.gear || {};
  // wearable upgrades work the moment you buy them (no separate crafting step)
  void g;
  return e;
}

export function defaultTuning() {
  return {
    grabTime: 1.5, reach: 2.4, carry: 1, autoRepeat: false, locator: 0, locatorRange: 0, exitMarker: false, assay: false, depots: false, scoop: 0, vac: 0, vacRate: 0, throwPower: 11,
    sellMult: 1, streakCap: 6, binCatch: 0, binBatch: 1, autoDump: 3.8, dexBonus: 0, shinyMult: 5,
    frames: [], stabBonus: 0, warn: 1.1, stressLens: false, nightShift: false, survey: false, shakeMul: 1, compass: false,
    lampRange: 9, lampPower: 1, lantern: false,
    scan: 0, scanRange: 0,
    walk: 4.0, crouchMul: 0.5, jump: 6.0,
    scholar: 0, crewMax: 0, crewHaul: 1, crewSpeed: 1, crewBattery: 1, crewBelt: false, crewBolt: false,
    markers: false, dynamite: false, hpBonus: 0, jacks: false, slopeProbe: false, dmgCut: 0, firstAid: false, struts: false, charges: 0, climb: 0, scavRange: 0, cartTier: 0, contractSlots: 0, genOutput: 8, cableLen: 14, genBuffer: 50, resp: 0, airTank: 0, airmon: false,
    beltSpeed: 1.6, sorterTiers: 0, mechMax: 0, mechRate: 2.4, mechBuffer: 6, mechLayer: false, mechBolt: false, bulkhead: false,
    machines: [], rigMax: 0, rigRate: 2.4, rigReach: 3.2, borerMax: 0, borerRate: 12.2, borerW: 2, borerH: 3,
    excavMax: 0, excavRate: 4.0, excavSwing: 12, dozerMax: 0, dozerRate: 3.5, dozerBlade: 5, wheelMax: 0, wheelRate: 3.0, wheelSwing: 40,
    truckMax: 0, truckSpeed: 7, truckBed: 240, truckRange: 400, hopMul: 1, earthDraw: 1, fleetBonus: 0, locatorCount: 1, assayFloor: 0.55,
  };
}

export function computeTuning(levels, boosts) {
  const t = defaultTuning();
  for (const u of UPGRADES) {
    const l = levels[u.id] || 0;
    if (l > 0) u.effect(t, l);
  }
  if (boosts) {
    t.sellMult *= 1 + boosts.sell;
    const m = boosts.digMul;
    t.grabTime *= m; t.mechRate *= m; t.borerRate *= m; t.rigRate *= m; t.excavRate *= m; t.dozerRate *= m; t.wheelRate *= m;
    t.carry += boosts.carry;
    t.stabBonus += boosts.stab;
    t.scanRange *= 1 + boosts.scan;
  }
  return t;
}

export function upgradeById(id) { return UPGRADES.find((u) => u.id === id); }

export function needsText(u, S) {
  if (u.needs && S && S.stats.plush < u.needs) return `Needs ${u.needs.toLocaleString('en-US')} plush handled`;
  return null;
}

export function isUnlocked(u, levels, S) {
  if (u.needs && S && S.stats.plush < u.needs) return false;
  if (!u.req) return true;
  return (levels[u.req.id] || 0) >= u.req.lvl;
}
