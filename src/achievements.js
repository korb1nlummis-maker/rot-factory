// Achievements. check(S) returns true when earned. S is the game state.
import { SPECIAL_MIN, DECOYS, speciesCount } from './plushdata.js';
import { UPGRADES, CATS } from './upgrades.js';
import { UPGRADES as CATALOG_UPGRADES } from './catalog.js';
const A = (id, name, desc, check, icon = '★', secret = false) => ({ id, name, desc, check, icon, secret });

export const ACHIEVEMENTS = [
  // Grabbing
  A('first', 'Hands On', 'Pick up your first plush.', (S) => S.stats.plush >= 1, '🧸'),
  A('p10', 'Warm Up', 'Pick up 10 plush.', (S) => S.stats.plush >= 10),
  A('p100', 'Getting a Feel', 'Pick up 100 plush.', (S) => S.stats.plush >= 100),
  A('p1k', 'Sorter', 'Pick up 1,000 plush.', (S) => S.stats.plush >= 1000),
  A('p10k', 'Shift Supervisor', 'Pick up 10,000 plush.', (S) => S.stats.plush >= 10000),
  A('p100k', 'Rot Baron', 'Pick up 100,000 plush.', (S) => S.stats.plush >= 100000),
  A('p1m', 'One in a Million', 'Process 1,000,000 plush.', (S) => S.stats.plush >= 1000000, '💎'),
  // Selling
  A('sell1', 'First Sale', 'Sell a plush at the bin.', (S) => S.stats.sold >= 1, '💰'),
  A('swish', 'Swish!', 'Throw a plush into the bin from 8m away.', (S) => S.stats.bestSwish >= 8, '🏀'),
  A('swish2', 'Half Court', 'Throw a plush into the bin from 18m away.', (S) => S.stats.bestSwish >= 18, '🏀'),
  A('combo5', 'On a Roll', 'Reach a x5 sell streak.', (S) => S.stats.bestStreak >= 5, '🔥'),
  A('combo20', 'Unstoppable', 'Reach a x20 sell streak.', (S) => S.stats.bestStreak >= 20, '🔥'),
  A('earn1k', 'Pocket Change', 'Earn 1,000 Fluff in total.', (S) => S.totalEarned >= 1000, '🪙'),
  A('earn100k', 'Fluff Mogul', 'Earn 100,000 Fluff in total.', (S) => S.totalEarned >= 100000, '🪙'),
  A('earn10m', 'Plush Tycoon', 'Earn 10,000,000 Fluff in total.', (S) => S.totalEarned >= 10000000, '🪙'),
  // Rarity
  A('rare1', 'Something Different', 'Find a Rare plush.', (S) => S.stats.rar[2] >= 1, '🔷'),
  A('epic1', 'Purple Patch', 'Find an Epic plush.', (S) => S.stats.rar[3] >= 1, '🟣'),
  A('leg1', 'Golden Hour', 'Find a Legendary plush.', (S) => S.stats.rar[4] >= 1, '🟠'),
  A('myth1', 'Impossible', 'Find a Mythic plush.', (S) => S.stats.rar[5] >= 1, '🌸'),
  A('shiny1', 'Ooh, Shiny', 'Find a shiny plush.', (S) => S.stats.shiny >= 1, '✨'),
  A('shiny10', 'Magpie', 'Find 10 shiny plush.', (S) => S.stats.shiny >= 10, '✨'),
  // Plushdex
  A('dex25', 'Collector', 'Discover 50 species.', (S) => Object.keys(S.dex).length >= 50, '📖'),
  A('dex75', 'Curator', 'Discover 150 species.', (S) => Object.keys(S.dex).length >= 150, '📖'),
  A('dex300', 'Archivist', 'Discover 300 species.', (S) => Object.keys(S.dex).length >= 300, '📖'),
  A('dex450', 'Taxonomist', 'Discover 450 species.', (S) => Object.keys(S.dex).filter((k) => +k < SPECIAL_MIN).length >= 450, '📖'),
  A('dex700', 'Field Guide', 'Discover 700 species.', (S) => Object.keys(S.dex).filter((k) => +k < SPECIAL_MIN).length >= 700, '📖'),
  A('dex850', 'Naturalist', 'Discover 850 species.', (S) => Object.keys(S.dex).filter((k) => +k < SPECIAL_MIN).length >= 850, '📖'),
  A('dexall', 'Gotta Squish Em All', `Discover all ${speciesCount} species.`, (S) => Object.keys(S.dex).filter((k) => +k < SPECIAL_MIN).length >= speciesCount, '📚'),
  A('fake1', 'Fool\'s Gold', 'Pick up a counterfeit Rotto Supremo.', (S) => DECOYS.some((d) => S.dex[d]), '🪙'),
  A('fakeall', 'Connoisseur of Fakes', 'Find all four counterfeits.', (S) => DECOYS.every((d) => S.dex[d]), '🪙'),
  A('remains1', 'Last Shift', 'Find the gear of a lost worker.', (S) => (S.stats.remains || 0) >= 1, '⛑️'),
  A('remains10', 'Grave Digger', 'Find the gear of 10 lost workers.', (S) => (S.stats.remains || 0) >= 10, '⛑️'),
  A('remains40', 'Memorial', 'Find the gear of 40 lost workers.', (S) => (S.stats.remains || 0) >= 40, '⛑️'),
  A('km1', 'One Kilometer', 'Be 1 km from Sorting Bay 07.', (S) => (S.stats.maxDist || 0) >= 1000, '📏'),
  A('km2', 'Two Kilometers', 'Be 2 km from Sorting Bay 07.', (S) => (S.stats.maxDist || 0) >= 2000, '📏'),
  A('km3', 'Far From the Bay', 'Be 3 km from Sorting Bay 07.', (S) => (S.stats.maxDist || 0) >= 3000, '📏'),
  A('km4', 'No One Comes This Far', 'Be 4 km from Sorting Bay 07.', (S) => (S.stats.maxDist || 0) >= 4000, '📏', true),
  A('km45', 'Almost Daylight', 'Be 4.5 km from Sorting Bay 07.', (S) => (S.stats.maxDist || 0) >= 4500, '📏'),
  A('slide1', 'Rockslide', 'Set off a real slide: a dozen plush or more tumbling at once.', (S) => (S.stats.bigSlides || 0) >= 1, '🏔️'),
  A('belt1', 'Industrial Revolution', 'Build a conveyor belt.', (S) => (S.stats.built || 0) >= 1, '🛤️'),
  A('mech1', 'Robot Labor', 'Build a Mech Scooper.', (S) => S.entities.some((e) => e.type === 'mech'), '🤖'),
  A('bulk1', 'Wall It Off', 'Build a bulkhead.', (S) => (S.stats.bulk || 0) >= 1, '🪧'),
  // Mining
  A('dig10', 'Burrow', 'Dig 10 meters of tunnel in total.', (S) => S.stats.cells * 0.6 / 6 >= 10, '⛏️'),
  A('dig100', 'Mole Person', 'Dig 100 meters of tunnel in total.', (S) => S.stats.cells * 0.6 / 6 >= 100, '⛏️'),
  A('dig1k', 'Earth Mover', 'Dig 1 kilometer of tunnel in total.', (S) => S.stats.cells * 0.6 / 6 >= 1000, '⛏️'),
  A('prop1', 'Safety First', 'Place a support frame.', (S) => S.stats.props >= 1, '🪵'),
  A('prop25', 'Timberman', 'Place 25 support frames.', (S) => S.stats.props >= 25, '🪵'),
  A('prop100', 'Structural Engineer', 'Place 100 support frames.', (S) => S.stats.props >= 100, '🏗️'),
  A('creak', 'Did You Hear That?', 'Hear a roof creak.', (S) => S.stats.creaks >= 1, '😬'),
  A('collapse1', 'Cave-In', 'Witness a collapse.', (S) => S.stats.collapses >= 1, '💥'),
  A('collapse25', 'Occupational Hazard', 'Witness 25 collapses.', (S) => S.stats.collapses >= 25, '💥'),
  A('buried', 'Buried Alive', 'Get buried under plush.', (S) => S.stats.buried >= 1, '⚰️'),
  A('buried5', 'Frequent Digger', 'Get buried 5 times.', (S) => S.stats.buried >= 5, '⚰️'),
  A('deep30', 'Ten Stories Down', 'Reach 10m below the surface of the pile.', (S) => S.stats.maxDepth >= 10, '🕳️'),
  A('deep60', 'Mantle', 'Reach 20m below the surface of the pile.', (S) => S.stats.maxDepth >= 20, '🕳️'),
  // Upgrades & machines
  A('up1', 'Investment', 'Buy your first upgrade.', (S) => S.stats.upgrades >= 1, '🛒'),
  A('up10', 'Tooled Up', 'Buy 10 upgrade levels.', (S) => S.stats.upgrades >= 10, '🛒'),
  A('up40', 'Fully Operational', 'Buy 40 upgrade levels.', (S) => S.stats.upgrades >= 40, '🛒'),
  A('bag16', 'Pack Mule', 'Carry capacity of 16 or more.', (S) => (S.up.bag || 0) >= 4, '🎒'),
  A('rig1', 'Automation', 'Place a Claw Rig.', (S) => S.stats.rigs >= 1, '🦾'),
  A('rig8', 'Claw Farm', 'Run 8 Claw Rigs at the same time.', (S) => S.entities.filter((e) => e.type === 'claw').length >= 8, '🦾'),
  A('borer1', 'Boring, Technically', 'Launch a Tunnel Borer.', (S) => S.stats.borers >= 1, '🚇'),
  A('lantern', 'Let There Be Light', 'Hang a Work Lantern.', (S) => S.stats.lanterns >= 1, '🏮'),
  A('lens', 'See the Strain', 'Buy the Stress Lens.', (S) => (S.up.stress || 0) >= 1, '👁️'),
  // Time / misc
  A('hour', 'Overtime', 'Play for one hour.', (S) => S.stats.playSecs >= 3600, '⏱️'),
  A('walk1k', 'Steps', 'Walk 1,000 meters.', (S) => S.stats.walked >= 1000, '👟'),
  A('toss100', 'Pitcher', 'Throw 100 plush.', (S) => S.stats.thrown >= 100, '⚾'),
  A('climb', 'King of the Pile', 'Climb 15m above the floor.', (S) => S.stats.maxHeight >= 15, '⛰️'),
  A('noprop', 'Brave or Foolish', 'Dig 5 meters below the surface without a support frame.', (S) => S.stats.noPropDeep, '🙈', true),
  // Endings
  A('cart1', 'Rolling', 'Roll out a cart.', (S) => !!S.cart || (S.stats.cartUsed || 0) > 0, '🛒'),
  A('cache1', 'Spare Parts', 'Open a worker\'s supply cache.', (S) => (S.stats.caches || 0) >= 1, '📦'),
  A('cache10', 'Scavenger', 'Open 10 supply caches.', (S) => (S.stats.caches || 0) >= 10, '📦'),
  A('gear1', 'Dressed for Work', 'Craft a piece of gear.', (S) => Object.values(S.gear || {}).some((v) => v > 0), '🧰'),
  A('scav1', 'Loose Ends', 'Craft a Scavenger Magnet.', (S) => ((S.gear || {}).scavenge || 0) >= 1, '🧲'),
  A('gold1', 'Golden Hour', 'Sell during a Golden Hour.', (S) => (S.stats.goldenSales || 0) >= 1, '🌟'),
  A('boom1', 'Fuse Burns', 'Have a Razzo go off in your hands.', (S) => (S.stats.boom || 0) >= 1, '🧨'),
  A('surge1', 'Lights Out', 'Live through a grid surge.', (S) => (S.stats.surges || 0) >= 1, '⚡'),
  A('crew1', 'Hired Help', 'Own a Scrapper Bot.', (S) => (S.crew || []).length >= 1, '🤖'),
  A('crew5', 'Small Army', 'Own five Scrapper Bots.', (S) => (S.crew || []).length >= 5, '🤖'),
  A('botlv', 'Growing Up', 'Level a bot up ten times.', (S) => (S.stats.botLevels || 0) >= 10, '📈'),
  A('contract1', 'Fulfilled', 'Complete a contract.', (S) => (S.stats.contracts || 0) >= 1, '📋'),
  A('contract20', 'Reliable Supplier', 'Complete 20 contracts.', (S) => (S.stats.contracts || 0) >= 20, '📋'),
  A('slide200', 'Landslide', 'Set off 200 plush slipping in one game.', (S) => (S.stats.slides || 0) >= 200, '⛰️'),
  A('slide3k', 'Moved a Mountain', 'Set off 3,000 plush slipping.', (S) => (S.stats.slides || 0) >= 3000, '🏔️'),
  A('cartshot', 'Nice Shot', 'Throw a plush into your cart.', (S) => (S.stats.cartCatch || 0) >= 1, '🏀'),
  A('cartshot50', 'Three Pointer', 'Land 50 plush in your cart.', (S) => (S.stats.cartCatch || 0) >= 50, '🏀'),
  A('binmag', 'Magnetic', 'Buy the Bin Magnet.', (S) => (S.up.magnet || 0) >= 1, '🧲'),
  A('probe', 'Careful Climber', 'Buy the Slope Probe.', (S) => (S.up.slopeprobe || 0) >= 1, '📐'),
  A('jack1', 'Jacked Up', 'Buy Hydraulic Jacks.', (S) => (S.up.jacks || 0) >= 1, '🛠️'),
  A('scan100', 'Clean Sweep', 'Scan 100 plush through detector gates.', (S) => (S.stats.scans || 0) >= 100, '🚨'),
  A('scan2k', 'Customs', 'Scan 2,000 plush through detector gates.', (S) => (S.stats.scans || 0) >= 2000, '🛂'),
  A('botscan', 'Checked In', 'Have a robot scanned at a gate.', (S) => (S.stats.botScans || 0) >= 1, '🤖'),
  A('botscan50', 'Regular Traffic', 'Scan robots through a gate 50 times.', (S) => (S.stats.botScans || 0) >= 50, '🤖'),
  A('split1', 'Fork in the Belt', 'Build a Belt Splitter.', (S) => (S.stats.splitters || 0) >= 1, '🔱'),
  A('split10', 'Distribution Network', 'Build 10 Belt Splitters.', (S) => (S.stats.splitters || 0) >= 10, '🔱'),
  A('belts50', 'Conveyor Belt Fan', 'Build 50 belts, machines and gates.', (S) => (S.stats.built || 0) >= 50, '🛤️'),
  A('belts300', 'Factory Floor', 'Build 300 belts, machines and gates.', (S) => (S.stats.built || 0) >= 300, '🏭'),
  A('die5', 'Slow Learner', 'Die five times.', (S) => (S.stats.deaths || 0) >= 5, '💀'),
  A('medic', 'Patched Up', 'Use a medkit.', (S) => (S.stats.medkits || 0) >= 1, '🩹'),
  A('tank', 'Deep Breath', 'Buy the Emergency Air Tank.', (S) => (S.up.airtank || 0) >= 1, '🫧'),
  A('hardhat4', 'Thick Skull', 'Fully upgrade the Hard Hat.', (S) => (S.up.hpmax || 0) >= 4, '⛑️'),
  A('lumber', 'Lumberjack', 'Own 100 building material at once.', (S) => Object.values(S.mats || {}).reduce((a, b) => a + b, 0) >= 100, '🪵'),
  A('dyn1', 'Stick of Dynamite', 'Buy Dynamite.', (S) => (S.up.dynamite || 0) >= 1, '🧨'),
  A('throw6', 'Cannon Arm', 'Max out the Throwing Arm.', (S) => (S.up.throw || 0) >= 6, '⚾'),
  A('died', 'Back From the Pile', 'Die in the warehouse and wake up on the floor.', (S) => (S.stats.deaths || 0) >= 1, '💀'),
  A('passout', 'Dust Lungs', 'Pass out from dust.', (S) => (S.stats.passedOut || 0) >= 1, '😵'),
  A('blast1', 'Fire in the Hole', 'Set off a blasting charge.', (S) => (S.stats.blasts || 0) >= 1, '🧨'),
  A('blast20', 'Quarryman', 'Set off 20 charges.', (S) => (S.stats.blasts || 0) >= 20, '🧨'),
  A('signed', 'Signed, Sealed', 'Sign the hiring form and start the job.', (S) => !!S.name, '🖊️'),
  A('day7', 'One Week In', 'Work through 7 days.', (S) => Math.floor((S.gameMin || 0) / 1440) + 1 >= 7, '📅'),
  A('day30', 'Lifer', 'Work through 30 days.', (S) => Math.floor((S.gameMin || 0) / 1440) + 1 >= 30, '📅'),
  A('day100', 'Institution', 'Work through 100 days.', (S) => Math.floor((S.gameMin || 0) / 1440) + 1 >= 100, '🏛️'),
  A('fan1', 'Fresh Air', 'Hang a Support Fan under a frame.', (S) => (S.stats.mfans || 0) >= 1, '🌀'),
  A('curve5', 'Bend in the Tunnel', 'Set 5 frames at a free angle.', (S) => (S.stats.turnedFrames || 0) >= 5, '↪️'),
  A('buckle1', 'Under Pressure', 'Lose a support to the weight of the mountain.', (S) => (S.stats.brokenSupports || 0) >= 1, '💥'),
  A('razzo1', 'Lit Fuse', 'Be there when a Razzo goes off.', (S) => (S.stats.razzos || 0) >= 1, '🧨', true),
  A('assay3', 'Prospector', 'Fully upgrade the Vein Assay.', (S) => (S.up.assay || 0) >= 3, '⛏️'),
  A('survey1', 'Surveyor', 'Buy the Structural Survey.', (S) => (S.up.survey || 0) >= 1, '📏'),
  A('theone', 'The One', 'Find Il Rotto Supremo.', (S) => S.ending === 'plush', '👑'),
  A('exit', 'Daylight', 'Dig your way out of the warehouse.', (S) => S.ending === 'exit', '🚪'),
  A('speed', 'Needle Speedrun', 'Find The One in under 30 minutes of play.', (S) => S.ending === 'plush' && S.stats.playSecs < 1800, '⚡', true),
];

// ---- The long tail: tiers of 10 / 100 / 1,000 / 10,000 and up for the things you do all game, the earth movers, and every new upgrade line.
// ACH_TABLE lists how each of these is earned (id, the number it needs, and a setter) so the self test can prove every one is reachable.
export const ACH_TABLE = [];
const fmtN = (n) => n.toLocaleString('en-US');
// a counter in S.stats (key) that has to reach each number in turn. rows: [id, n, name, text]; text may use {n}
const stat = (key, icon, rows) => { for (const [id, n, name, text] of rows) { const get = (S) => (S.stats[key] || 0); ACHIEVEMENTS.push(A(id, name, text.replace('{n}', fmtN(n)), (S) => get(S) >= n, icon)); ACH_TABLE.push({ id, n, kind: 'stat', key }); } };
// anything else that reduces to a number: get(S) reads it, set(S, v) writes it for the test
const calc = (icon, get, set, rows) => { for (const [id, n, name, text] of rows) { ACHIEVEMENTS.push(A(id, name, text.replace('{n}', fmtN(n)), (S) => get(S) >= n, icon)); ACH_TABLE.push({ id, n, kind: 'calc', get, set }); } };
const ents = (type) => (S) => S.entities.filter((e) => e.type === type && !e.done).length;
const addEnts = (type) => (S, v) => { S.entities = S.entities.filter((e) => e.type !== type); for (let i = 0; i < v; i++) S.entities.push({ id: 9000 + i, type, i: i * 9, j: 0, k: 0 }); };

stat('plush', '🧸', [
  ['p10m', 1e7, 'Avalanche Season', 'Pick up {n} plush.'], ['p100m', 1e8, 'Pile Eater', 'Pick up {n} plush.'],
  ['p1b', 1e9, 'Billion Club', 'Pick up {n} plush.'], ['p10b', 1e10, 'The Pile Remembers', 'Pick up {n} plush.'],
]);
stat('sold', '💰', [
  ['sold10', 10, 'Open for Business', 'Sell {n} plush.'], ['sold100', 100, 'Regular Hours', 'Sell {n} plush.'], ['sold1k', 1e3, 'Steady Trade', 'Sell {n} plush.'],
  ['sold10k', 1e4, 'Volume Seller', 'Sell {n} plush.'], ['sold100k', 1e5, 'Wholesale', 'Sell {n} plush.'], ['sold1m', 1e6, 'Fluff Warehouse', 'Sell {n} plush.'],
  ['sold10m', 1e7, 'Bulk Buyer\'s Dream', 'Sell {n} plush.'], ['sold100m', 1e8, 'Market Mover', 'Sell {n} plush.'],
]);
stat('thrown', '⚾', [
  ['toss1k', 1e3, 'Bullpen', 'Throw {n} plush.'], ['toss10k', 1e4, 'Closer', 'Throw {n} plush.'], ['toss100k', 1e5, 'Hall of Fame Arm', 'Throw {n} plush.'], ['toss1m', 1e6, 'Throwing Machine', 'Throw {n} plush.'],
]);
stat('walked', '👟', [
  ['walk10k', 1e4, 'Long Shift', 'Walk {n} meters.'], ['walk100k', 1e5, 'Marathon Man', 'Walk {n} meters.'], ['walk1m', 1e6, 'Around the World', 'Walk {n} meters.'],
]);
calc('⛏️', (S) => S.stats.cells * 0.6 / 6, (S, v) => { S.stats.cells = v * 10; }, [
  ['dig10k', 1e4, 'Subway Builder', 'Dig {n} meters of tunnel in total (10 km).'], ['dig100k', 1e5, 'Continental', 'Dig {n} meters of tunnel in total (100 km).'], ['dig1m', 1e6, 'Through the Earth', 'Dig {n} meters of tunnel in total (1,000 km).'],
]);
stat('props', '🪵', [
  ['prop500', 500, 'Forest Floor', 'Place {n} support frames.'], ['prop2k', 2500, 'Scaffolder', 'Place {n} support frames.'], ['prop10k', 1e4, 'Cathedral Builder', 'Place {n} support frames.'], ['prop100k', 1e5, 'Steelworks', 'Place {n} support frames.'],
]);
stat('collapses', '💥', [
  ['collapse100', 100, 'Unlucky Charm', 'Witness {n} collapses.'], ['collapse1k', 1e3, 'Disaster Area', 'Witness {n} collapses.'], ['collapse10k', 1e4, 'Plate Tectonics', 'Witness {n} collapses.'],
]);
stat('buried', '⚰️', [
  ['buried25', 25, 'Mole Hill', 'Get buried {n} times.'], ['buried100', 100, 'Pile Magnet', 'Get buried {n} times.'], ['buried500', 500, 'Compost', 'Get buried {n} times.'],
]);
stat('deaths', '💀', [
  ['die25', 25, 'Nine Lives, Nearly Three Times', 'Die {n} times.'], ['die100', 100, 'Revolving Door', 'Die {n} times.'],
]);
calc('🪙', (S) => S.totalEarned, (S, v) => { S.totalEarned = v; }, [
  ['earn1b', 1e9, 'Fluff Billionaire', 'Earn {n} Fluff in total.'], ['earn100b', 1e11, 'Plush Empire', 'Earn {n} Fluff in total.'],
  ['earn10t', 1e13, 'Beyond Money', 'Earn {n} Fluff in total.'], ['earn1qa', 1e15, 'Economy of One', 'Earn {n} Fluff in total.'],
]);
stat('upgrades', '🛒', [
  ['up100', 100, 'Well Equipped', 'Buy {n} upgrade levels.'], ['up200', 200, 'Serious Hardware', 'Buy {n} upgrade levels.'], ['up300', 300, 'Nearly Everything', 'Buy {n} upgrade levels.'], ['up400', 400, 'Tech Tree Climber', 'Buy {n} upgrade levels.'], ['up500', 500, 'Five Hundred Club', 'Buy {n} upgrade levels.'],
]);
stat('shiny', '✨', [
  ['shiny100', 100, 'Glitter Bomb', 'Find {n} shiny plush.'], ['shiny1k', 1e3, 'Disco Pile', 'Find {n} shiny plush.'], ['shiny10k', 1e4, 'Supernova', 'Find {n} shiny plush.'],
]);
// rarity tiers live in S.stats.rar[tier]
const rar = (tier, icon, rows) => { for (const [id, n, name, text] of rows) { ACHIEVEMENTS.push(A(id, name, text.replace('{n}', fmtN(n)), (S) => ((S.stats.rar || [])[tier] || 0) >= n, icon)); ACH_TABLE.push({ id, n, kind: 'rar', tier }); } };
rar(2, '🔷', [['rare100', 100, 'Blue Chip', 'Find {n} Rare plush.'], ['rare1k', 1e3, 'Sapphire Vein', 'Find {n} Rare plush.'], ['rare10k', 1e4, 'Deep Blue', 'Find {n} Rare plush.']]);
rar(3, '🟣', [['epic100', 100, 'Amethyst', 'Find {n} Epic plush.'], ['epic1k', 1e3, 'Royal Purple', 'Find {n} Epic plush.']]);
rar(4, '🟠', [['leg10', 10, 'Gold Rush', 'Find {n} Legendary plush.'], ['leg100', 100, 'Dragon Hoard', 'Find {n} Legendary plush.']]);
rar(5, '🌸', [['myth3', 3, 'Rare Air', 'Find {n} Mythic plush.'], ['myth10', 10, 'Mythbuster', 'Find {n} Mythic plush.'], ['myth100', 100, 'Beyond Legend', 'Find {n} Mythic plush.']]);
calc('⏱️', (S) => S.stats.playSecs / 3600, (S, v) => { S.stats.playSecs = v * 3600; }, [
  ['hour10', 10, 'Double Shift', 'Play for {n} hours.'], ['hour100', 100, 'Company Man', 'Play for {n} hours.'], ['hour500', 500, 'Part of the Furniture', 'Play for {n} hours.'],
]);
calc('📅', (S) => Math.floor((S.gameMin || 0) / 1440) + 1, (S, v) => { S.gameMin = (v - 1) * 1440; }, [
  ['day365', 365, 'Anniversary', 'Work through {n} days.'], ['day1000', 1000, 'Warehouse Lore', 'Work through {n} days.'],
]);
stat('bestStreak', '🔥', [
  ['combo50', 50, 'Fire Alarm', 'Reach a x{n} sell streak.'], ['combo100', 100, 'Infinite Combo', 'Reach a x{n} sell streak.'], ['combo250', 250, 'Never Stop', 'Reach a x{n} sell streak.'],
]);
stat('bestSwish', '🏀', [
  ['swish30', 30, 'Downtown', 'Throw a plush into the bin from {n}m away.'], ['swish50', 50, 'Buzzer Beater', 'Throw a plush into the bin from {n}m away.'],
]);
stat('goldenSales', '🌟', [
  ['gold100', 100, 'Golden Touch', 'Make {n} sales during Golden Hours.'], ['gold1k', 1e3, 'Midas Hour', 'Make {n} sales during Golden Hours.'], ['gold10k', 1e4, 'Gilded Age', 'Make {n} sales during Golden Hours.'],
]);
stat('contracts', '📋', [
  ['contract100', 100, 'Preferred Vendor', 'Complete {n} contracts.'], ['contract500', 500, 'Trusted Partner', 'Complete {n} contracts.'], ['contract2k', 2000, 'Exclusive Supplier', 'Complete {n} contracts.'],
]);
stat('botLevels', '📈', [
  ['botlv100', 100, 'Mentor', 'Level bots up {n} times.'], ['botlv1k', 1e3, 'Headhunter', 'Level bots up {n} times.'], ['botlv5k', 5e3, 'Academy', 'Level bots up {n} times.'],
]);
calc('🤖', (S) => (S.crew || []).length, (S, v) => { S.crew = Array.from({ length: v }, (_, i) => ({ id: 8000 + i })); }, [
  ['crew9', 9, 'Full Roster', 'Own {n} Scrapper Bots.'], ['crew15', 15, 'Foundry Floor', 'Own {n} Scrapper Bots.'],
]);
stat('scans', '🛂', [
  ['scan20k', 2e4, 'Border Control', 'Scan {n} plush through detector gates.'], ['scan200k', 2e5, 'Surveillance State', 'Scan {n} plush through detector gates.'], ['scan2m', 2e6, 'Omniscient Gate', 'Scan {n} plush through detector gates.'],
]);
stat('botScans', '🤖', [
  ['botscan500', 500, 'Daily Commute', 'Scan robots through a gate {n} times.'], ['botscan5k', 5e3, 'Rush Hour', 'Scan robots through a gate {n} times.'],
]);
stat('splitters', '🔱', [
  ['split100', 100, 'Spaghetti Belts', 'Build {n} Belt Splitters.'], ['split500', 500, 'Interchange', 'Build {n} Belt Splitters.'],
]);
stat('built', '🏭', [
  ['belts1k', 1e3, 'Assembly Line', 'Build {n} belts, machines and gates.'], ['belts5k', 5e3, 'Megafactory', 'Build {n} belts, machines and gates.'],
  ['belts25k', 25e3, 'Industrial Complex', 'Build {n} belts, machines and gates.'], ['belts100k', 1e5, 'Rot City', 'Build {n} belts, machines and gates.'],
]);
stat('blasts', '🧨', [
  ['blast100', 100, 'Demolition Crew', 'Set off {n} charges.'], ['blast1k', 1e3, 'Mountain Remover', 'Set off {n} charges.'], ['blast10k', 1e4, 'Big Bang', 'Set off {n} charges.'],
]);
stat('caches', '📦', [['cache50', 50, 'Hoarder', 'Open {n} supply caches.'], ['cache250', 250, 'Pack Rat', 'Open {n} supply caches.']]);
stat('medkits', '🩹', [['medic10', 10, 'Field Nurse', 'Use {n} medkits.'], ['medic100', 100, 'Paramedic', 'Use {n} medkits.']]);
stat('mfans', '🌀', [['fan10', 10, 'Ventilation Engineer', 'Hang {n} Support Fans.'], ['fan50', 50, 'Wind Tunnel', 'Hang {n} Support Fans.']]);
stat('turnedFrames', '↪️', [['curve50', 50, 'Winding Road', 'Set {n} frames at a free angle.'], ['curve500', 500, 'Spiral Staircase', 'Set {n} frames at a free angle.']]);
stat('brokenSupports', '💥', [['buckle10', 10, 'Stress Test', 'Lose {n} supports to the weight of the mountain.'], ['buckle100', 100, 'Structural Failure', 'Lose {n} supports to the weight of the mountain.']]);
stat('cartCatch', '🏀', [['cartshot500', 500, 'Hoops', 'Land {n} plush in your cart.'], ['cartshot5k', 5e3, 'Dunk Contest', 'Land {n} plush in your cart.']]);
stat('slides', '⛰️', [['slide50k', 5e4, 'Scree Slope', 'Set off {n} plush slipping.'], ['slide1m', 1e6, 'Mountain on the Move', 'Set off {n} plush slipping.']]);
stat('bigSlides', '🏔️', [['bigslide25', 25, 'Avalanche Chaser', 'Set off {n} real slides.'], ['bigslide250', 250, 'Avalanche Magnet', 'Set off {n} real slides.']]);
stat('creaks', '😬', [['creak100', 100, 'Light Sleeper', 'Hear {n} roofs creak.'], ['creak1k', 1e3, 'Haunted Roof', 'Hear {n} roofs creak.']]);
stat('ropes', '🪢', [['rope1', 1, 'On a Rope', 'Plant a Rope Anchor.'], ['rope25', 25, 'Belay Team', 'Plant {n} Rope Anchors.'], ['rope250', 250, 'Rope Bridge', 'Plant {n} Rope Anchors.']]);
stat('bulk', '🪧', [['bulk25', 25, 'Wall Builder', 'Build {n} bulkheads.'], ['bulk250', 250, 'Great Wall', 'Build {n} bulkheads.']]);
stat('lanterns', '🏮', [['lantern25', 25, 'Light Show', 'Hang {n} Work Lanterns.'], ['lantern250', 250, 'Lighthouse Keeper', 'Hang {n} Work Lanterns.']]);
stat('rigs', '🦾', [['rig100', 100, 'Claw Dynasty', 'Place {n} Claw Rigs in total.']]);
stat('borers', '🚇', [['borer5', 5, 'Drilling Team', 'Launch {n} Tunnel Borers.'], ['borer25', 25, 'Bore Hole Industries', 'Launch {n} Tunnel Borers.']]);
calc('🦾', ents('claw'), addEnts('claw'), [['rig30', 30, 'Claw Empire', 'Run {n} Claw Rigs at the same time.']]);
calc('🤖', ents('mech'), addEnts('mech'), [['mech10', 10, 'Mech Platoon', 'Run {n} Mech Scoopers at the same time.'], ['mech30', 30, 'Mech Division', 'Run {n} Mech Scoopers at the same time.']]);
calc('🔥', ents('gen'), addEnts('gen'), [['gen5', 5, 'Power Plant', 'Run {n} generators at the same time.'], ['gen25', 25, 'Grid Operator', 'Run {n} generators at the same time.']]);

// ---- Earth movers (src/earth.js)
stat('excavators', '🏗️', [['exc1', 1, 'Dig Site', 'Place an Excavator.'], ['exc10', 10, 'Quarry Boss', 'Place {n} Excavators in total.']]);
stat('dozers', '🚜', [['doz1', 1, 'Push It', 'Place a Bulldozer.'], ['doz10', 10, 'Blade Runner', 'Place {n} Bulldozers in total.']]);
stat('wheels', '⚙️', [['whl1', 1, 'Wheel of Fortune', 'Place a Bucket-Wheel Excavator.'], ['whl5', 5, 'Strip Mine', 'Place {n} Bucket-Wheel Excavators in total.']]);
stat('trucks', '🚛', [['trk1', 1, 'Long Haul', 'Place a Haul Truck.'], ['trk10', 10, 'Convoy', 'Place {n} Haul Trucks in total.']]);
calc('🏗️', ents('excavator'), addEnts('excavator'), [['excf4', 4, 'Dig Crew', 'Run {n} Excavators at the same time.'], ['excf8', 8, 'Excavation Army', 'Run {n} Excavators at the same time.']]);
calc('🚜', ents('dozer'), addEnts('dozer'), [['dozf4', 4, 'Dozer Line', 'Run {n} Bulldozers at the same time.'], ['dozf8', 8, 'Bulldozer Brigade', 'Run {n} Bulldozers at the same time.']]);
calc('⚙️', ents('wheel'), addEnts('wheel'), [['whlf3', 3, 'Triple Wheel', 'Run {n} Bucket-Wheel Excavators at the same time.'], ['whlf6', 6, 'Wheel Works', 'Run {n} Bucket-Wheel Excavators at the same time.']]);
calc('🚛', ents('truck'), addEnts('truck'), [['trkf6', 6, 'Haulage Firm', 'Run {n} Haul Trucks at the same time.'], ['trkf14', 14, 'Logistics Empire', 'Run {n} Haul Trucks at the same time.']]);
calc('🏗️', (S) => ['excavator', 'dozer', 'wheel', 'truck'].filter((t) => S.entities.some((e) => e.type === t && !e.done)).length, (S, v) => { S.entities = S.entities.filter((e) => !['excavator', 'dozer', 'wheel', 'truck'].includes(e.type)); ['excavator', 'dozer', 'wheel', 'truck'].slice(0, v).forEach((t, i) => S.entities.push({ id: 9100 + i, type: t, i: i * 9, j: 0, k: 0 })); }, [['fleet4', 4, 'Full Fleet', 'Have one of each earth mover standing: Excavator, Bulldozer, Bucket-Wheel and Haul Truck.']]);
stat('earthBuilt', '🏗️', [['earth100', 100, 'Heavy Equipment Dealer', 'Place {n} earth movers in total.']]);
stat('earthDug', '⛏️', [
  ['ed10', 10, 'First Bite', 'Dig {n} plush out with earth movers.'], ['ed100', 100, 'Scoop and Dump', 'Dig {n} plush out with earth movers.'], ['ed1k', 1e3, 'Moving Earth', 'Dig {n} plush out with earth movers.'],
  ['ed10k', 1e4, 'Crater Maker', 'Dig {n} plush out with earth movers.'], ['ed100k', 1e5, 'Open Pit', 'Dig {n} plush out with earth movers.'], ['ed1m', 1e6, 'Landscape Architect', 'Dig {n} plush out with earth movers.'],
  ['ed10m', 1e7, 'Mountain Removal', 'Dig {n} plush out with earth movers.'],
]);
stat('hauled', '🚛', [
  ['hl100', 100, 'First Load', 'Haul {n} plush to the bin with Haul Trucks.'], ['hl1k', 1e3, 'Truckload', 'Haul {n} plush to the bin with Haul Trucks.'], ['hl10k', 1e4, 'Freight Day', 'Haul {n} plush to the bin with Haul Trucks.'],
  ['hl100k', 1e5, 'Supply Chain', 'Haul {n} plush to the bin with Haul Trucks.'], ['hl1m', 1e6, 'Million Mile Club', 'Haul {n} plush to the bin with Haul Trucks.'], ['hl10m', 1e7, 'Rail Baron', 'Haul {n} plush to the bin with Haul Trucks.'],
]);
stat('hauls', '🚛', [
  ['trip1', 1, 'Delivery', 'Finish a Haul Truck trip.'], ['trip10', 10, 'Regular Route', 'Finish {n} Haul Truck trips.'], ['trip100', 100, 'Commuter', 'Finish {n} Haul Truck trips.'],
  ['trip1k', 1e3, 'Road Warrior', 'Finish {n} Haul Truck trips.'], ['trip10k', 1e4, 'Eternal Highway', 'Finish {n} Haul Truck trips.'],
]);
stat('earthPress', '🛑', [['press1', 1, 'Hard Hat Area', 'Have an earth mover halted because the mountain was too heavy for your best frame.']]);
stat('earthChoke', '😮‍💨', [['choke1', 1, 'Need a Fan', 'Have an earth mover choke on stale air.']]);

// ---- The Satisfactory waves: rail, power parts, belt marks, lifts and undergrounds, the generator ladder, the build shell, furnishing, transit, the arches, the vehicle scanner and cables.
// Their unlock lines are not 'fresh' upgrades (no per line Maxed achievement, the wave tests pin that), so each wave has counters and these tables instead.
stat('railLaid', '🛤️', [
  ['rail1', 1, 'First Spike', 'Lay a piece of Mine Rail.'], ['rail100', 100, 'Track Gang', 'Lay {n} pieces of Mine Rail.'],
  ['rail1k', 1e3, 'Railroad Builder', 'Lay {n} pieces of Mine Rail.'], ['rail10k', 1e4, 'Transcontinental', 'Lay {n} pieces of Mine Rail.'],
]);
stat('railRides', '🚃', [
  ['ride1', 1, 'All Aboard', 'Ride a Mine Rail cart to the end of the line.'], ['ride25', 25, 'Commuter Line', 'Finish {n} rides on a Mine Rail cart.'], ['ride250', 250, 'Season Ticket', 'Finish {n} rides on a Mine Rail cart.'],
]);
stat('railHomes', '🏠', [
  ['rushhome1', 1, 'Rush Home', 'Rush home to the base on a Mine Rail cart.'], ['rushhome25', 25, 'Express Service', 'Rush home on a Mine Rail cart {n} times.'], ['rushhome250', 250, 'Last Train Home', 'Rush home on a Mine Rail cart {n} times.'],
]);
stat('railMeters', '📏', [
  ['railm1k', 1e3, 'Ticket Punched', 'Ride {n} meters on Mine Rail carts.'], ['railm10k', 1e4, 'Long Line', 'Ride {n} meters on Mine Rail carts.'], ['railm100k', 1e5, 'Grand Tour', 'Ride {n} meters on Mine Rail carts.'],
]);
stat('railHauled', '🧸', [
  ['railhaul100', 100, 'Cart Load', 'Haul {n} plush to the bin by Mine Rail cart.'], ['railhaul10k', 1e4, 'Ore Train', 'Haul {n} plush to the bin by Mine Rail cart.'], ['railhaul1m', 1e6, 'Plush Freight', 'Haul {n} plush to the bin by Mine Rail cart.'],
]);
stat('pwSwitches', '🔌', [['pwsw1', 1, 'Flip It', 'Build a Power Switch.'], ['pwsw10', 10, 'Panel Board', 'Build {n} Power Switches.'], ['pwsw100', 100, 'Switchyard', 'Build {n} Power Switches.']]);
stat('pwBreakers', '⚡', [['pwbrk1', 1, 'Breaker Box', 'Build a Breaker Box.'], ['pwbrk10', 10, 'Fuse Board', 'Build {n} Breaker Boxes.'], ['pwbrk100', 100, 'Relay Hall', 'Build {n} Breaker Boxes.']]);
stat('pwTrips', '🚨', [['pwtrip1', 1, 'Overcurrent', 'Trip a breaker with too much load.'], ['pwtrip25', 25, 'Short Fuse', 'Trip a breaker {n} times.'], ['pwtrip250', 250, 'Brownout Veteran', 'Trip a breaker {n} times.']]);
stat('pwBatteries', '🔋', [['pwbat1', 1, 'Stored Energy', 'Build a Battery.'], ['pwbat10', 10, 'Battery Bank', 'Build {n} Batteries.'], ['pwbat100', 100, 'Grid Storage', 'Build {n} Batteries.']]);
stat('beltLifts', '🛗', [['lift1', 1, 'Going Up', 'Build a Belt Lift.'], ['lift25', 25, 'Vertical Integration', 'Build {n} Belt Lifts.'], ['lift250', 250, 'Skyline Conveyor', 'Build {n} Belt Lifts.']]);
stat('beltUgs', '🕳️', [['ug1', 1, 'Under the Floor', 'Build an Underground Belt end.'], ['ug25', 25, 'Subway Lines', 'Build {n} Underground Belt ends.'], ['ug250', 250, 'Mole Tunnels', 'Build {n} Underground Belt ends.']]);
stat('shellPieces', '🧱', [
  ['shell1', 1, 'Foundations', 'Set down a floor pad, catwalk, wall, ramp or stair.'], ['shell100', 100, 'Floor Plan', 'Set down {n} pads, catwalks, walls, ramps and stairs.'],
  ['shell1k', 1e3, 'General Contractor', 'Set down {n} pads, catwalks, walls, ramps and stairs.'], ['shell10k', 1e4, 'Master Builder', 'Set down {n} pads, catwalks, walls, ramps and stairs.'],
]);
stat('levelPads', '🏗️', [['lvlpad1', 1, 'Leveled Ground', 'Set down a Leveling Pad.'], ['lvlpad10', 10, 'Site Foreman', 'Set down {n} Leveling Pads.']]);
stat('furnPieces', '🪑', [
  ['furn1', 1, 'Moving In', 'Set down a locker, crate, silo, sign or light.'], ['furn25', 25, 'Interior Decorator', 'Set down {n} lockers, crates, silos, signs and lights.'],
  ['furn250', 250, 'Facilities Manager', 'Set down {n} lockers, crates, silos, signs and lights.'], ['furn2500', 2500, 'Hall Designer', 'Set down {n} lockers, crates, silos, signs and lights.'],
]);
stat('furnLights', '💡', [['furnlit1', 1, 'Mood Lighting', 'Set down a lamp, floodlight, strip light or warning beacon.'], ['furnlit100', 100, 'Light Show Crew', 'Set down {n} lamps, floodlights, strip lights and warning beacons.']]);
stat('doorsBuilt', '🚪', [['door1', 1, 'Open Door Policy', 'Build a Door.'], ['door25', 25, 'Doorman', 'Build {n} Doors.'], ['door250', 250, 'Airlock Engineer', 'Build {n} Doors.']]);
stat('platformLifts', '🛗', [['plift1', 1, 'Going Down', 'Build a Platform Lift.'], ['plift10', 10, 'Elevator Operator', 'Build {n} Platform Lifts.']]);
stat('jumpPads', '🦘', [['jump1', 1, 'Spring in Your Step', 'Build a Jump Pad.'], ['jump25', 25, 'Trampoline Park', 'Build {n} Jump Pads.']]);
stat('archBuilt', '⛩️', [['arch1', 1, 'Gatekeeper', 'Build a Detector Arch.'], ['arch10', 10, 'Checkpoint Network', 'Build {n} Detector Arches.']]);
stat('archHits', '✅', [
  ['archhit1', 1, 'Match!', 'Walk through a Detector Arch that matches what you carry.'], ['archhit100', 100, 'Sharp Eyes', 'Match what you carry at a Detector Arch {n} times.'],
  ['archhit1k', 1e3, 'Never Misses', 'Match what you carry at a Detector Arch {n} times.'], ['archhit10k', 1e4, 'Customs Legend', 'Match what you carry at a Detector Arch {n} times.'],
]);
stat('vscans', '🚛', [
  ['vscan1', 1, 'Heavy Inspection', 'Have a truck scanned at a Vehicle Scanner.'], ['vscan100', 100, 'Weigh Station', 'Scan {n} truck loads at Vehicle Scanners.'],
  ['vscan1k', 1e3, 'Fleet Inspector', 'Scan {n} truck loads at Vehicle Scanners.'], ['vscan10k', 1e4, 'Port Authority', 'Scan {n} truck loads at Vehicle Scanners.'],
]);
stat('vscanAlarms', '🚨', [['vsalarm1', 1, 'Caught in the Beam', 'Have a Vehicle Scanner catch The One on a truck.'], ['vsalarm10', 10, 'Stop That Truck', 'Have a Vehicle Scanner catch The One {n} times.']]);
const owned = (S, ids) => ids.filter((id) => ((S.up || {})[id] || 0) >= 1).length;
const setOwned = (ids) => (S, v) => { S.up = S.up || {}; ids.forEach((id, n) => { if (n < v) S.up[id] = 1; else delete S.up[id]; }); };
const MARKS = ['beltMk2', 'beltMk3', 'beltMk4', 'beltMk5', 'beltMk6'], RUNGS = ['genTurbine', 'genPlant', 'genStation', 'genTitan'];
const LINES = CATALOG_UPGRADES.map((u) => u.id);   // every unlock line the Satisfactory waves added (the rail shuttle, the shell, transit, furnish, the arches, the scanner, the marks, the ladder ...)
calc('🛤️', (S) => owned(S, MARKS), setOwned(MARKS), [
  ['beltmk1', 1, 'Mark Up', 'Buy a belt mark above Mk1.'], ['beltmk3', 3, 'Express Lines', 'Own {n} belt marks above Mk1.'], ['beltmk5', 5, 'Top of the Line', 'Own all {n} belt marks above Mk1.'],
]);
calc('🔥', (S) => owned(S, RUNGS), setOwned(RUNGS), [
  ['genrung1', 1, 'Turbine Hall', 'Unlock the Turbine Generator.'], ['genrung2', 2, 'Power Plant Row', 'Unlock {n} rungs of the generator ladder.'], ['genrung4', 4, 'Titan Tamer', 'Unlock all {n} rungs of the generator ladder.'],
]);
calc('🔓', (S) => owned(S, LINES), setOwned(LINES), [
  ['lines1', 1, 'First Blueprint', 'Buy an unlock from the builder tree: belt marks, power parts, the build shell, furnishing, doors, arches, the scanner or the Mine Rail.'],
  ['lines8', 8, 'Wing Two', 'Buy {n} builder unlocks.'], ['lines16', 16, 'Industrial Park', 'Buy {n} builder unlocks.'], ['lines25', 25, 'Master Plan', 'Buy {n} builder unlocks.'],
]);
stat('cables', '🔌', [
  ['cable1', 1, 'Wired In', 'Wire a Power Cable.'], ['cable10', 10, 'Electrician', 'Wire {n} Power Cables.'], ['cable100', 100, 'Cable Management', 'Wire {n} Power Cables.'], ['cable1k', 1e3, 'Spaghetti Junction', 'Wire {n} Power Cables.'],
]);

// ---- Every new upgrade line, and every category: take each to its top
export const MAXED = [];
for (const u of UPGRADES) {
  if (!u.fresh) continue;
  const id = 'max_' + u.id;
  ACHIEVEMENTS.push(A(id, `Maxed: ${u.name}`, u.max === 1 ? `Buy ${u.name}.` : `Take ${u.name} to level ${u.max}.`, (S) => (S.up[u.id] || 0) >= u.max, '🏅'));
  MAXED.push({ id, upgrade: u.id, max: u.max });
}
export const MASTERS = [];
for (const c of CATS) {
  if (c.special) continue;
  const id = 'master_' + c.id;
  ACHIEVEMENTS.push(A(id, `${c.name} Master`, `Take every ${c.name} upgrade to its top level.`, (S) => UPGRADES.filter((u) => u.cat === c.id).every((u) => (S.up[u.id] || 0) >= u.max), c.icon));
  MASTERS.push({ id, cat: c.id });
}
ACHIEVEMENTS.push(A('upall', 'Fully Upgraded', 'Take every upgrade in the game to its top level.', (S) => UPGRADES.every((u) => (S.up[u.id] || 0) >= u.max), '👑'));
