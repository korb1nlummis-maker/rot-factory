// Upgrade tree. Each upgrade has levels; effect(t, level) mutates the tuning object.
// cat: hands | sort | mine | light | sense | move | machine

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
  { id: 'repeat', cat: 'hands', name: 'Auto-Grip', desc: 'Holding F or left click grabs two plush at a time, twice as fast.', max: 1, cost: [40], effect: (t) => { t.autoRepeat = true; } },
  { id: 'scoop', cat: 'hands', name: 'Scoop Hands', desc: 'Each grab also scoops neighbouring plush along your aim: 1 / 3 / 6 / 12 extra per grab. Bigger scoops pull the pile apart faster.', max: 4, cost: [120, 480, 1900, 7800], req: { id: 'bag', lvl: 2 }, effect: (t, l) => { t.scoop = [0, 1, 3, 6, 12][l]; } },
  { id: 'vac', cat: 'hands', name: 'Plush Vacuum', desc: 'Tapping F now inhales plush in a cone for a couple of seconds instead of grabbing one. Upgrades raise suction rate: 3 / 5 / 8 / 12 / 18 plush per second.', max: 5, cost: [650, 1800, 5200, 15000, 42000], req: { id: 'bag', lvl: 3 }, effect: (t, l) => { t.vac = l; t.vacRate = [0, 3, 5, 8, 12, 18][l]; } },
  { id: 'throw', cat: 'hands', name: 'Throwing Arm', desc: 'Hurl plush faster, further and flatter. Six levels: from a gentle toss (11 m/s) up to a cannon shot (35 m/s).', max: 6, cost: [25, 120, 600, 3200, 18000, 100000], effect: (t, l) => { t.throwPower = 11 + l * 4; } },

  // ---------------- SORTING ----------------
  { id: 'contracts', cat: 'sort', name: 'Contract Board', desc: 'Buyers post standing orders (rarity, species, shape, shiny). Sell matching plush anywhere and the contract pays out a bonus, sometimes with a permanent boost. Find them under the Contracts tab.', max: 1, cost: [700], effect: (t) => { t.contractSlots += 3; } },
  { id: 'contractSlots', cat: 'sort', name: 'More Contracts', desc: 'One more contract slot per level.', max: 3, cost: [4000, 40000, 400000], req: { id: 'contracts', lvl: 1 }, effect: (t, l) => { t.contractSlots += l; } },
  { id: 'haggle', cat: 'sort', name: 'Haggling', desc: '+20% of the base sell price per level (level 10 pays 3x).', max: 10, cost: geo(25, 2.0, 10), effect: (t, l) => { t.sellMult *= 1 + 0.2 * l; } },
  { id: 'streak', cat: 'sort', name: 'Hot Hands', desc: 'Sales within 4.5 s of each other build a combo worth +6% per plush in a row. Everyone can reach a 6 plush combo; each level raises the cap by 8 (14, 22, 30, 38, 46).', max: 5, cost: [30, 140, 700, 3500, 16000], effect: (t, l) => { t.streakCap = 6 + l * 8; } },
  { id: 'magnet', cat: 'sort', name: 'Bin Magnet', desc: 'The bin catches throws from further away: the mouth is 0.45 m wider per level and the pull reaches further out.', max: 3, cost: [60, 320, 1500], effect: (t, l) => { t.binCatch = 0.0 + l * 0.45; } },
  { id: 'dump', cat: 'sort', name: 'Long-Range Suction', desc: 'The bin already sucks in plush you carry when you are within 3.8 m. This widens the pull to 7.8, 13.8, then 25.8 m (your cart gets 80% of that). Gates and sorters must stay outside the pull.', max: 3, cost: [90, 700, 5200], effect: (t, l) => { t.autoDump = 3.8 + [0, 4, 10, 22][l]; } },
  { id: 'dex', cat: 'sort', name: 'Plushdex Appraiser', desc: '+1.5% sell price for every species you have discovered.', max: 1, cost: [180], effect: (t) => { t.dexBonus = 0.015; } },
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
  { id: 'survey', cat: 'mine', name: 'Structural Survey', desc: 'A clipboard readout: how deep you are, the strongest frame you own and its rating, how much weight the pile above you is pressing, and the load on the nearest support. Amber at 85%, red when it is about to buckle.', max: 1, cost: [800], req: { id: 'timber', lvl: 1 }, effect: (t) => { t.survey = true; } },
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
  { id: 'jacks', cat: 'mine', name: 'Hydraulic Jacks', desc: 'Unlocks Hydraulic Jacks: a single prop with a wider reach than a strut (2.7 m against 1.9 m). Made from Steel Beams. Place with B anywhere on the floor.', max: 1, cost: [1400], req: { id: 'steel', lvl: 1 }, effect: (t) => { t.jacks = true; } },
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
  { id: 'crew', cat: 'crew', name: 'Scrapper Bot', desc: 'A little robot crew member. It follows you around, and when you give the order it digs a tunnel in a direction, hauls plush back to the bin and recharges. It levels up as it works: bigger, stronger, faster, wider tunnels. Press V for the crew panel, T to send the crew digging the way you face, Y to call them home. Aim at a bot and press E to pick it, then E on a target to give it an order. Also unlocks the Charging Station.', max: 1, cost: [1800], needs: 150, req: { id: 'bag', lvl: 3 }, effect: (t) => { t.crewMax += 1; t.machines.push('charger'); } },
  { id: 'crewSlots', cat: 'crew', name: 'More Scrappers', desc: 'Another bot hatches at the bin, up to nine in all. Needs 400 plush handled, and each bot costs 2.3x the one before.', max: 8, cost: geo(3500, 2.3, 8), needs: 400, req: { id: 'crew', lvl: 1 }, effect: (t, l) => { t.crewMax += l; } },
  { id: 'crewHaul', cat: 'crew', name: 'Bigger Buckets', desc: 'Bots haul 40% of their base load more per trip per level (a fresh bot carries 6, 8, 11, 13, then 16).', max: 4, cost: geo(1500, 3, 4), req: { id: 'crew', lvl: 1 }, effect: (t, l) => { t.crewHaul = 1 + 0.4 * l; } },
  { id: 'crewSpeed', cat: 'crew', name: 'Servo Tuning', desc: 'Bots dig 20% faster per level (walking speed is unchanged).', max: 6, cost: geo(2200, 2.6, 6), req: { id: 'crew', lvl: 1 }, effect: (t, l) => { t.crewSpeed = 1 + 0.2 * l; } },
  { id: 'crewBattery', cat: 'crew', name: 'Long-Life Cells', desc: 'Bots run 60% longer per level before they need to recharge, digging or walking.', max: 4, cost: geo(1800, 2.8, 4), req: { id: 'crew', lvl: 1 }, effect: (t, l) => { t.crewBattery = 1 + 0.6 * l; } },
  { id: 'crewBelt', cat: 'crew', name: 'Belt Kit', desc: 'Bots lay a conveyor behind them as they dig. When the line reaches the bin (or a sorter), they stop hauling and drop plush straight on the belt. Each belt tile costs 3 Fluff. Needs Conveyor Belts and a powered line.', max: 1, cost: [12000], needs: 3000, req: { id: 'belts', lvl: 1 }, effect: (t) => { t.crewBelt = true; } },
  { id: 'crewBolt', cat: 'crew', name: 'Bot Bolter', desc: 'Bots brace the roof every third step with the best frame you own and can afford, paid from your Fluff. Needs a frame upgrade such as Timber Frames.', max: 1, cost: [26000], needs: 8000, req: { id: 'crewBelt', lvl: 1 }, effect: (t) => { t.crewBolt = true; } },

  // ---------------- MACHINES ----------------
  { id: 'claw', cat: 'machine', name: 'Claw Rig', desc: 'Unlocks the Claw Rig recipe. Plants itself on the pile and plucks the highest plush in reach, auto-selling them. It does NOT check for The One: if it plucks it, it is sold. Needs power.', max: 1, cost: [900], req: { id: 'power', lvl: 1 }, effect: (t) => { t.machines.push('claw'); t.rigMax += 2; } },
  { id: 'rigCount', cat: 'machine', name: 'More Rigs', desc: 'Allows two more Claw Rigs at once.', max: 5, cost: geo(1400, 2.3, 5), req: { id: 'claw', lvl: 1 }, effect: (t, l) => { t.rigMax += 2 * l; } },
  { id: 'rigSpeed', cat: 'machine', name: 'Rig Motors', desc: 'Claw Rigs grab faster.', max: 6, cost: geo(700, 2.3, 6), req: { id: 'claw', lvl: 1 }, effect: (t, l) => { t.rigRate *= Math.pow(0.78, l); } },
  { id: 'rigReach', cat: 'machine', name: 'Rig Boom', desc: 'Longer arms: bigger area per rig.', max: 4, cost: geo(1100, 2.6, 4), req: { id: 'claw', lvl: 1 }, effect: (t, l) => { t.rigReach += 1.2 * l; } },
  { id: 'power', cat: 'machine', name: 'Power Grid', desc: 'Unlocks Generators and Power Poles. Generators burn Common to Epic plush for power (1.5, 4, 10 and 25 minutes each at 8 kW). Poles link generators together and feed machines within reach. Belts, sorters, mechs, borers, rigs and fans all need power.', max: 1, cost: [450], req: { id: 'bag', lvl: 2 }, effect: (t) => { t.machines.push('gen'); t.machines.push('pole'); } },
  { id: 'genOutput', cat: 'machine', name: 'Turbine Upgrades', desc: 'Each level makes generators put out 70% more power than the level before (and burn each plush faster).', max: 6, cost: geo(1200, 2.6, 6), req: { id: 'power', lvl: 1 }, effect: (t, l) => { t.genOutput *= Math.pow(1.7, l); } },
  { id: 'gridRange', cat: 'machine', name: 'Grid Range', desc: 'Poles link and reach further.', max: 4, cost: geo(500, 2.8, 4), req: { id: 'power', lvl: 1 }, effect: (t, l) => { t.poleLink += 4 * l; t.poleReach += 1.5 * l; } },
  { id: 'genBuffer', cat: 'machine', name: 'Fuel Hoppers', desc: 'Generators hold more plush in reserve.', max: 3, cost: [800, 4000, 20000], req: { id: 'power', lvl: 1 }, effect: (t, l) => { t.genBuffer = [8, 16, 32, 64][l]; } },
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
  { id: 'mechBolt', cat: 'machine', name: 'Roof Bolter', desc: 'Mechs try to place a support frame every third step, using the best frame you own and can pay for. Costs Fluff. Open ground with no roof to prop gets none.', max: 1, cost: [11000], req: { id: 'mechLayer', lvl: 1 }, effect: (t) => { t.mechBolt = true; } },
  { id: 'borer', cat: 'machine', name: 'Tunnel Borer', desc: 'Unlocks the Tunnel Borer. Drives a lined tunnel forward through the pile on its own, selling what it eats. It does NOT check for The One.', max: 1, cost: [9000], req: { id: 'steel', lvl: 1 }, effect: (t) => { t.machines.push('borer'); t.borerMax += 1; } },
  { id: 'borerCount', cat: 'machine', name: 'Borer Fleet', desc: 'One more Tunnel Borer at once.', max: 4, cost: geo(16000, 2.6, 4), req: { id: 'borer', lvl: 1 }, effect: (t, l) => { t.borerMax += l; } },
  { id: 'borerSpeed', cat: 'machine', name: 'Cutter Head', desc: 'Borers dig faster.', max: 6, cost: geo(7000, 2.4, 6), req: { id: 'borer', lvl: 1 }, effect: (t, l) => { t.borerRate *= Math.pow(0.78, l); } },
  { id: 'borerSize', cat: 'machine', name: 'Wide Bore', desc: 'Bigger tunnel cross-section for borers you place afterwards: 4x4, then 5x4 (up from 2x3).', max: 2, cost: [22000, 90000], req: { id: 'borer', lvl: 1 }, effect: (t, l) => { t.borerW = [3, 4, 5][l]; t.borerH = [3, 4, 4][l]; } },
];

// Everything is expensive on purpose: the early game is slow hand work, and the numbers only open up with machines.
export const COST_SCALE = 5;
for (const u of UPGRADES) u.cost = u.cost.map((c) => Math.round(c * COST_SCALE));

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
    sellMult: 1, streakCap: 6, binCatch: 0, autoDump: 3.8, dexBonus: 0, shinyMult: 5,
    frames: [], stabBonus: 0, warn: 1.1, stressLens: false, survey: false, shakeMul: 1, compass: false,
    lampRange: 9, lampPower: 1, lantern: false,
    scan: 0, scanRange: 0,
    walk: 4.0, crouchMul: 0.5, jump: 6.0,
    crewMax: 0, crewHaul: 1, crewSpeed: 1, crewBattery: 1, crewBelt: false, crewBolt: false,
    markers: false, dynamite: false, hpBonus: 0, jacks: false, slopeProbe: false, dmgCut: 0, firstAid: false, struts: false, charges: 0, climb: 0, scavRange: 0, cartTier: 0, contractSlots: 0, genOutput: 8, poleLink: 14, poleReach: 7, genBuffer: 8, resp: 0, airTank: 0, airmon: false,
    beltSpeed: 1.6, sorterTiers: 0, mechMax: 0, mechRate: 2.4, mechBuffer: 6, mechLayer: false, mechBolt: false, bulkhead: false,
    machines: [], rigMax: 0, rigRate: 2.4, rigReach: 3.2, borerMax: 0, borerRate: 12.2, borerW: 2, borerH: 3,
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
    t.grabTime *= m; t.mechRate *= m; t.borerRate *= m; t.rigRate *= m;
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
