import { FRAME_TYPES, GEAR, UPGRADES } from './upgrades.js';
import { CART_CAP, CART_NAMES, CART_PRICE } from './cart.js';

// Everything you build is crafted first at the Crafting Table, then carried and set down with B.
export function recipes(g) {
  const T = g.T;
  const list = [];
  const out = [];
  const K = 3; // crafting is not cheap either
  for (const k of T.frames) list.push({ id: 'frame:' + k, kind: 'frame', fk: k, icon: FRAME_TYPES[k].icon, name: FRAME_TYPES[k].name, short: FRAME_TYPES[k].name.split(' ')[0], desc: `Props a tunnel roof. +${FRAME_TYPES[k].bonus} strength within ${FRAME_TYPES[k].radius} m.`, price: FRAME_TYPES[k].cost, batch: [1, 5, 10] });
  for (let t = 1; t <= T.cartTier; t++) list.push({ id: 'cart:' + t, kind: 'cart', icon: '🛒', name: CART_NAMES[t], short: CART_NAMES[t], desc: `Press U to roll it out. Follows you, carries ${CART_CAP[t]} plush and unloads near the bin.`, price: CART_PRICE[t], batch: [1, 1, 1] });
  if (T.markers) {
    list.push({ id: 'marker', kind: 'marker', icon: '🚩', name: 'Survey Marker', short: 'Marker', desc: 'Shows on your compass. Plant them to mark junctions and the way home.', price: 6, batch: [1, 5, 10] });
    list.push({ id: 'flare', kind: 'flare', icon: '🔥', name: 'Road Flare', short: 'Flare', desc: 'A bright light for four minutes. Needs no power.', price: 15, batch: [1, 5, 25] });
  }
  if (T.struts) list.push({ id: 'strut', kind: 'strut', icon: '🪜', name: 'Strut', short: 'Strut', desc: 'A single prop. +1 roof strength within about 2 m. Goes anywhere.', price: 8, batch: [1, 5, 25] });
  if (T.dynamite) list.push({ id: 'dynamite', kind: 'dynamite', icon: '🧨', name: 'Dynamite', short: 'Dynamite', desc: 'A stick with a 4 second fuse. Blows a small hole about 1.3 m across. Cheap, fast, and loud. Run.', price: 14, batch: [1, 5, 10] });
  if (T.charges) list.push({ id: 'charge', kind: 'charge', icon: '🧨', name: 'Blasting Charge', short: 'Charge', desc: `Blows a hole about ${[0, 1.8, 2.4, 3.0][T.charges]} m across after 6 seconds. Run.`, price: 40 * T.charges, batch: [1, 3, 5] });
  if (T.lantern) list.push({ id: 'lantern', kind: 'lantern', icon: '🏮', name: 'Work Lantern', short: 'Lantern', desc: 'Hang it up to light a tunnel.', price: 6, batch: [1, 5, 10] });
  if (T.bulkhead) list.push({ id: 'bulk', kind: 'bulk', icon: '🪧', name: 'Bulkhead Panel', short: 'Bulkhead', desc: 'A solid plank wall cell. Never falls. Hold the pile back.', price: 10, batch: [1, 10, 50] });
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
  for (const r of list) out.push(r.kind === 'frame' ? r : { ...r, price: Math.round(r.price * K) });
  return out;
}

// wearable gear: one piece per upgrade line, crafted tier by tier once the upgrade is unlocked
export function gearRecipes(g) {
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
  const cost = r.price * n;
  if (S.money < cost) { g.sound.error(); return false; }
  S.money -= cost;
  S.items[id] = (S.items[id] || 0) + n;
  g.ui.setMoney(S.money);
  g.sound.place();
  if (r.kind === 'cart') { g.rebuildTools(); g.ui.hint('Press <kbd>U</kbd> to roll the cart out.', 4); return true; }
  g.stowed = false;
  g.rebuildTools();
  const idx = g.tools.findIndex((t) => t.id === id);
  if (idx >= 0) g.buildIdx = idx;
  g.rebuildTools();
  return true;
}
