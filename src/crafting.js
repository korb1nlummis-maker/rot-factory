import { FRAME_TYPES, GEAR, UPGRADES } from './upgrades.js';
import { CART_CAP, CART_NAMES, CART_PRICE } from './cart.js';

// How to use each thing, shown on the bench card and as a hint right after you craft it.
const USE = {
  frame: 'A 4x4 square (2.4 m) section. Aim at the floor, press B: it carves out its section and anchors the roof around it. Aim next to a frame and it snaps on any side (in line, beside, above, below) to build tunnels, junctions and chambers. Hold B to lay a lining. X takes it back.',
  marker: 'Aim at the floor and press B. It shows on your compass so you can find your way back.',
  glow: 'Aim and press B. A soft green light for 10 minutes, no power needed.',
  flare: 'Aim and press B. A bright light for 4 minutes, no power needed.',
  strut: 'Aim at the floor under a roof you do not trust and press B. It anchors the roof within about 2 m.',
  jack: 'Aim at the floor under bad ground and press B. A strong prop: anchors the roof within about 2.7 m.',
  dynamite: 'Aim at the pile and press B, then run. 4 second fuse, small blast. It hurts if you stand close.',
  charge: 'Aim at the pile and press B, then run. 6 second fuse, bigger blast. It hurts if you stand close.',
  lantern: 'Aim at a wall or the floor and press B. It lights the tunnel for good.',
  bulk: 'Aim at an empty cell and press B. A solid wall cell that never falls. F takes it down.',
  belt: 'Aim at the floor and press B (hold B to lay a line). Needs power from a generator and poles.',
  ramp: 'Like a belt, but it climbs or drops one step. R flips up or down while you hold it.',
  gate: 'Aim at a belt (it converts it) or the floor and press B. Everything that passes is scanned. Not within a bin\'s pull. Walk through it to scan your bag.',
  gen: 'Place it, then press E on it with plush in your hands to feed it fuel (or belt plush in). Powers machines through poles.',
  pole: 'Place it near generators and machines to link the grid.',
  fan: 'Place it in a dusty tunnel. Needs power. Clears dust within about 14 m.',
  sorter: 'Place it in a belt line. Press E on it to change what it sells and what it keeps.',
  vault: 'Place it at the end of a belt line. Press E on it to empty it into your hands.',
  mech: 'Place it facing the pile wall. It digs and loads the belt behind it. Needs power.',
  claw: 'Plant it on the pile surface. It plucks and sells plush in reach. Needs power. It does NOT check for the One.',
  borer: 'Place it against the pile wall (look at the base of the wall). It bores a lined tunnel on its own. Needs power. It does NOT check for the One.',
  beacon: 'Place it anywhere: a remote bin, a fast travel point and a recall point.',
  cart: 'Press U to roll it out. It stays near you, plush you grab ride on it once your hands are full, and it unloads near the bin. U parks it or calls it back, X stows it when empty.',
  medkit: 'Press K to heal 50 health.',
  canister: 'Automatic: it kicks in when you run out of air while trapped.',
  mat: 'Raw building material. Frames, struts and bulkheads use it automatically when you craft them.',
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
  for (const k of T.frames) list.push({ id: 'frame:' + k, kind: 'frame', fk: k, icon: FRAME_TYPES[k].icon, name: FRAME_TYPES[k].name, short: FRAME_TYPES[k].name.split(' ')[0], desc: `Anchors the roof within ${FRAME_TYPES[k].radius} m, so the unsupported tunnel length starts again from here. Stronger frames reach further.`, price: FRAME_TYPES[k].cost, batch: [1, 5, 10], mat: k, matN: MATFRAME });
  for (const k of T.frames) list.push({ id: 'mat:' + k, kind: 'mat', mk: k, icon: MATERIALS[k].icon, name: MATERIALS[k].name, short: MATERIALS[k].name, desc: 'Building material. Frames use ' + MATFRAME + ' each. Stock up here at a discount, or find it in caches and old workings.', price: Math.max(1, Math.round(MATERIALS[k].unit * 0.7)), batch: [10, 50, 250] });
  for (let t = 1; t <= T.cartTier; t++) list.push({ id: 'cart:' + t, kind: 'cart', icon: '🛒', name: CART_NAMES[t], short: CART_NAMES[t], desc: `Press U to roll it out. Follows you, carries ${CART_CAP[t]} plush and unloads near the bin.`, price: CART_PRICE[t], batch: [1] });
  if (T.markers) {
    list.push({ id: 'marker', kind: 'marker', icon: '🚩', name: 'Survey Marker', short: 'Marker', desc: 'Shows on your compass. Plant them to mark junctions and the way home.', price: 6, batch: [1, 5, 10] });
    list.push({ id: 'glow', kind: 'glow', icon: '🟢', name: 'Glow Stick', short: 'Glow', desc: 'A soft green light for ten minutes. Dimmer than a flare, lasts more than twice as long. Needs no power.', price: 5, batch: [1, 10, 25] });
    list.push({ id: 'flare', kind: 'flare', icon: '🔥', name: 'Road Flare', short: 'Flare', desc: 'A bright light for four minutes. Needs no power.', price: 15, batch: [1, 5, 25] });
  }
  if (T.jacks) list.push({ id: 'jack', kind: 'jack', icon: '🛠️', name: 'Hydraulic Jack', short: 'Jack', desc: 'A screw prop for bad ground. Anchors the roof within about 2.7 m and adds safe length. Costs Steel Beams to craft.', price: 70, batch: [1, 5, 10], mat: 'steel', matN: 1 });
  if (T.struts) list.push({ id: 'strut', kind: 'strut', icon: '🪜', name: 'Strut', short: 'Strut', desc: 'A single prop. Anchors the roof within about 1.9 m. Goes anywhere.', price: 8, batch: [1, 5, 25], mat: 'timber', matN: 1 });
  if (T.firstAid) {
    list.push({ id: 'medkit', kind: 'supply', icon: '🩹', name: 'Medkit', short: 'Medkit', desc: 'Press K to heal 50 health.', price: 30, batch: [1, 5, 10] });
    list.push({ id: 'canister', kind: 'supply', icon: '🫧', name: 'Air Canister', short: 'Canister', desc: 'Kicks in by itself when you run out of air while trapped: 40 more seconds to dig out.', price: 55, batch: [1, 3, 5] });
  }
  if (T.dynamite) list.push({ id: 'dynamite', kind: 'dynamite', icon: '🧨', name: 'Dynamite', short: 'Dynamite', desc: 'A stick with a 4 second fuse. Blows a small hole about 1.3 m across. Cheap, fast, and loud. Run.', price: 14, batch: [1, 5, 10] });
  if (T.charges) list.push({ id: 'charge', kind: 'charge', icon: '🧨', name: 'Blasting Charge', short: 'Charge', desc: `Blows a hole about ${[0, 1.8, 2.4, 3.0][T.charges]} m across after 6 seconds. Run.`, price: 40 * T.charges, batch: [1, 3, 5] });
  if (T.lantern) list.push({ id: 'lantern', kind: 'lantern', icon: '🏮', name: 'Work Lantern', short: 'Lantern', desc: 'Hang it up to light a tunnel.', price: 6, batch: [1, 5, 10] });
  if (T.bulkhead) list.push({ id: 'bulk', kind: 'bulk', icon: '🪧', name: 'Bulkhead Panel', short: 'Bulkhead', desc: 'A solid plank wall cell. Never falls. Hold the pile back.', price: 10, batch: [1, 10, 50], mat: 'timber', matN: 2 });
  if (T.machines.includes('belt')) {
    list.push({ id: 'belt', kind: 'belt', icon: '🛤️', name: 'Conveyor Belt', short: 'Belt', desc: 'Carries plush. Needs power. Place a line by holding B.', price: 3, batch: [10, 50, 100] });
    list.push({ id: 'ramp', kind: 'belt', ramp: true, icon: '📐', name: 'Belt Ramp', short: 'Ramp', desc: 'A belt that climbs or drops one step. R flips up/down.', price: 5, batch: [1, 5, 10] });
  }
  if (T.machines.includes('gate')) list.push({ id: 'gate', kind: 'gate', icon: '🚨', name: 'Detector Gate', short: 'Gate', desc: 'Set it over a belt (or on bare floor). Scans everything passing through. Red alarm and a held item if it is The One. Crew bots check in at the nearest gate before unloading.', price: 25, batch: [1, 3, 5] });
  if (T.machines.includes('gen')) list.push({ id: 'gen', kind: 'gen', icon: '🔥', name: 'Generator', short: 'Generator', desc: 'Burns Common to Rare plush for power.', price: g.genCost(), batch: [1, 2, 5] });
  if (T.machines.includes('pole')) list.push({ id: 'pole', kind: 'pole', icon: '⚡', name: 'Power Pole', short: 'Pole', desc: 'Links generators and feeds machines nearby.', price: 20, batch: [1, 5, 10] });
  if (T.machines.includes('fan')) list.push({ id: 'fan', kind: 'fan', icon: '🌬️', name: 'Vent Fan', short: 'Fan', desc: 'Clears dust within 14 m when powered.', price: 240, batch: [1, 2, 5] });
  if (T.machines.includes('sorter')) list.push({ id: 'sorter', kind: 'sorter', icon: '🗃️', name: 'Sorting Box', short: 'Sorter', desc: 'Sells or passes plush by rarity. Sucks in what you carry.', price: g.sorterCost(), batch: [1, 2, 5] });
  if (T.machines.includes('vault')) list.push({ id: 'vault', kind: 'vault', icon: '🧰', name: 'Vault Crate', short: 'Vault', desc: 'Stores plush at the end of a line.', price: 140, batch: [1, 2, 5] });
  if (T.machines.includes('mech')) list.push({ id: 'mech', kind: 'mech', icon: '🤖', name: 'Mech Scooper', short: 'Mech', desc: 'Digs the face ahead and loads the belt behind it.', price: g.mechCost(), batch: [1, 2, 3] });
  if (T.depots) list.push({ id: 'beacon', kind: 'beacon', icon: '📡', name: 'Depot Beacon', short: 'Depot', desc: 'Remote sorting point, fast travel and recall point. Turns up clues.', price: g.beaconCost(), batch: [1, 1, 1] });
  if (T.machines.includes('claw')) list.push({ id: 'claw', kind: 'claw', icon: '🦾', name: 'Claw Rig', short: 'Claw Rig', desc: 'Plucks the highest plush in reach and sells it. Needs power.', price: g.rigCost(), batch: [1, 2, 3] });
  if (T.machines.includes('borer')) list.push({ id: 'borer', kind: 'borer', icon: '🚇', name: 'Tunnel Borer', short: 'Borer', desc: 'Bores a lined tunnel on its own. Needs power.', price: g.borerCost(), batch: [1, 1, 1] });
  const cartTier = g.S.cart ? g.S.cart.tier : [5, 4, 3, 2, 1].find((t) => (g.S.items['cart:' + t] || 0) > 0) || 0;
  const status = (r) => {
    if (r.kind === 'cart') { const t = +r.id.split(':')[1]; return cartTier >= t ? (cartTier === t ? (g.S.cart ? `In use: rolled out (${g.S.cart.load.length}/${CART_CAP[t]})` : 'You have this one in your pack') : 'You already have a better cart') : (cartTier ? `Upgrade from your ${CART_NAMES[cartTier]}: +${CART_CAP[t] - CART_CAP[cartTier]} capacity` : 'You have no cart yet'); }
    if (r.kind === 'frame') { const f = FRAME_TYPES[r.fk]; return `Reach ${f.radius} m: about one every ${Math.round(f.radius * 2 + 4)} m of tunnel near the surface, closer when deep. ${FRAME_NOTE[r.fk] || ''}`; }
    if (r.kind === 'claw') return `${g.machines.count('claw')} of ${g.T.rigMax} rigs placed`;
    if (r.kind === 'mech') return `${g.logi.count('mech')} of ${g.T.mechMax} mechs placed`;
    if (r.kind === 'borer') return `${g.machines.count('borer')} of ${g.T.borerMax} borers placed`;
    return '';
  };
  for (const r of list) { const rr = r.kind === 'frame' ? r : { ...r, price: Math.round(r.price * K) }; out.push({ ...rr, use: USE[r.id] || USE[r.kind] || '', status: status(r) }); }
  return out;
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
  const S = g.S;
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
  if (r.use) g.ui.hint(`<b>${r.name}</b> crafted${idx >= 0 ? ` and put on hotbar slot <kbd>${idx + 1}</kbd>. Press <kbd>${idx + 1}</kbd> to take it out, <kbd>Q</kbd> to put it away` : '. Your hotbar is full: open the inventory (<kbd>I</kbd>) to choose a slot'}. ${r.use}`, 9);
  return true;
}

// You only ever run one cart. Crafting a better one upgrades it (in place if it is rolled out, keeping its load).
function craftCart(g, r) {
  const S = g.S, tier = +r.id.split(':')[1];
  const have = Math.max(S.cart ? S.cart.tier : 0, ...[1, 2, 3, 4, 5].filter((t) => (S.items['cart:' + t] || 0) > 0));
  if (have >= tier) { g.sound.error(); g.ui.hint(`You already have a ${CART_NAMES[have]} (${CART_CAP[have]} plush). Craft a better cart to upgrade.`, 4); return false; }
  if (S.money < r.price) { g.sound.error(); return false; }
  S.money -= r.price;
  for (let t = 1; t <= 5; t++) delete S.items['cart:' + t];
  if (Array.isArray(S.hotbar)) S.hotbar = S.hotbar.map((x) => (x && x.startsWith('cart:') ? 'cart:' + tier : x)); // an old cart slot follows the upgrade
  if (S.cart) {
    S.cart.tier = tier;
    g.cart.sync();
    g.ui.hint(`Cart upgraded to a <b>${CART_NAMES[tier]}</b>: now carries ${CART_CAP[tier]}. Its load stays.`, 6);
  } else {
    S.items['cart:' + tier] = 1;
    const slot = g.assignHotbar('cart:' + tier);
    g.ui.hint(`<b>${CART_NAMES[tier]}</b> crafted (${CART_CAP[tier]} plush)${slot >= 0 ? ` and put on hotbar slot <kbd>${slot + 1}</kbd>` : ''}. ${USE.cart}`, 8);
  }
  g.ui.setMoney(S.money); g.sound.place(); g.rebuildTools();
  return true;
}
