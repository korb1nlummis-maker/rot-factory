import { FRAME_TYPES } from './upgrades.js';

// Everything you build is crafted first at the Crafting Table, then carried and set down with B.
export function recipes(g) {
  const T = g.T;
  const list = [];
  for (const k of T.frames) list.push({ id: 'frame:' + k, kind: 'frame', fk: k, icon: FRAME_TYPES[k].icon, name: FRAME_TYPES[k].name, short: FRAME_TYPES[k].name.split(' ')[0], desc: `Props a tunnel roof. +${FRAME_TYPES[k].bonus} strength within ${FRAME_TYPES[k].radius} m.`, price: FRAME_TYPES[k].cost, batch: [1, 5, 10] });
  if (T.lantern) list.push({ id: 'lantern', kind: 'lantern', icon: '🏮', name: 'Work Lantern', short: 'Lantern', desc: 'Hang it up to light a tunnel.', price: 6, batch: [1, 5, 10] });
  if (T.bulkhead) list.push({ id: 'bulk', kind: 'bulk', icon: '🪧', name: 'Bulkhead Panel', short: 'Bulkhead', desc: 'A solid plank wall cell. Never falls. Hold the pile back.', price: 10, batch: [1, 10, 50] });
  if (T.machines.includes('belt')) {
    list.push({ id: 'belt', kind: 'belt', icon: '🛤️', name: 'Conveyor Belt', short: 'Belt', desc: 'Carries plush. Needs power. Place a line by holding B.', price: 3, batch: [10, 50, 100] });
    list.push({ id: 'ramp', kind: 'belt', ramp: true, icon: '📐', name: 'Belt Ramp', short: 'Ramp', desc: 'A belt that climbs or drops one step. R flips up/down.', price: 5, batch: [1, 5, 10] });
  }
  if (T.machines.includes('gen')) list.push({ id: 'gen', kind: 'gen', icon: '🔥', name: 'Generator', short: 'Generator', desc: 'Burns Common to Rare plush for power.', price: g.genCost(), batch: [1, 2, 5] });
  if (T.machines.includes('pole')) list.push({ id: 'pole', kind: 'pole', icon: '⚡', name: 'Power Pole', short: 'Pole', desc: 'Links generators and feeds machines nearby.', price: 20, batch: [1, 5, 10] });
  if (T.machines.includes('fan')) list.push({ id: 'fan', kind: 'fan', icon: '🌬️', name: 'Vent Fan', short: 'Fan', desc: 'Clears dust within 14 m when powered.', price: 240, batch: [1, 2, 5] });
  if (T.machines.includes('sorter')) list.push({ id: 'sorter', kind: 'sorter', icon: '🗃️', name: 'Sorting Box', short: 'Sorter', desc: 'Sells or passes plush by rarity. Sucks in what you carry.', price: g.sorterCost(), batch: [1, 2, 5] });
  if (T.machines.includes('vault')) list.push({ id: 'vault', kind: 'vault', icon: '🧰', name: 'Vault Crate', short: 'Vault', desc: 'Stores plush at the end of a line.', price: 140, batch: [1, 2, 5] });
  if (T.machines.includes('mech')) list.push({ id: 'mech', kind: 'mech', icon: '🤖', name: 'Mech Scooper', short: 'Mech', desc: 'Digs the face ahead and loads the belt behind it.', price: g.mechCost(), batch: [1, 2, 3] });
  if (T.depots) list.push({ id: 'beacon', kind: 'beacon', icon: '📡', name: 'Depot Beacon', short: 'Depot', desc: 'Remote sorting point, fast travel and recall point. Turns up clues.', price: g.beaconCost(), batch: [1, 1, 1] });
  if (T.machines.includes('claw')) list.push({ id: 'claw', kind: 'claw', icon: '🦾', name: 'Claw Rig', short: 'Claw Rig', desc: 'Plucks the highest plush in reach and sells it. Needs power.', price: g.rigCost(), batch: [1, 2, 3] });
  if (T.machines.includes('borer')) list.push({ id: 'borer', kind: 'borer', icon: '🚇', name: 'Tunnel Borer', short: 'Borer', desc: 'Bores a lined tunnel on its own. Needs power.', price: g.borerCost(), batch: [1, 1, 1] });
  return list;
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
  g.stowed = false;
  g.rebuildTools();
  const idx = g.tools.findIndex((t) => t.id === id);
  if (idx >= 0) g.buildIdx = idx;
  g.rebuildTools();
  return true;
}
