import { h32, mulberry32 } from './util.js';
import { NX, NZ, C, cellX, cellZ } from './config.js';

// ---------------------------------------------------------------------------------------------
// Old workings: the warehouse is full of the tunnels past crews dug. They are generated from the seed
// (so the world can be arbitrarily large) and each ends in a dead end where someone was left behind.
// ---------------------------------------------------------------------------------------------
export const RS = 256; // region size in cells (~154 m)
export const REGIONS_X = Math.floor(NX / RS), REGIONS_Z = Math.floor(NZ / RS);

const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];

export function workingsInRegion(seed, rx, rz) {
  if (rx < 0 || rz < 0 || rx >= REGIONS_X || rz >= REGIONS_Z) return [];
  const rng = mulberry32(h32(rx, rz, seed ^ 0x5eed11));
  const out = [];
  const n = (rng() < 0.62 ? 1 : 0) + (rng() < 0.3 ? 1 : 0);
  for (let q = 0; q < n; q++) {
    const dir = (rng() * 4) | 0;
    const len = 28 + ((rng() * 95) | 0);
    const i0 = rx * RS + 16 + ((rng() * (RS - 32)) | 0), k0 = rz * RS + 16 + ((rng() * (RS - 32)) | 0);
    const ei = i0 + DX[dir] * len, ek = k0 + DZ[dir] * len;
    if (ei < 20 || ek < 20 || ei > NX - 20 || ek > NZ - 20) continue;
    // keep the start pocket and its first stretch clean
    if (Math.hypot(cellX(i0), cellZ(k0)) < 130 || Math.hypot(cellX(ei), cellZ(ek)) < 130) continue;
    const plugs = [];
    const np = (rng() * 3) | 0;
    for (let p = 0; p < np; p++) {
      const a = 8 + ((rng() * Math.max(1, len - 24)) | 0), l = 3 + ((rng() * 10) | 0);
      plugs.push([a, Math.min(len - 4, a + l)]);
    }
    out.push({ id: h32(rx, rz, q, seed), i0, k0, dir, len, plugs, barricade: rng() < 0.7, ei, ek });
  }
  return out;
}

// all workings that could touch columns around (ci, ck)
export function workingsNear(seed, ci, ck, reach = 130) {
  const r0x = Math.floor((ci - reach) / RS), r1x = Math.floor((ci + reach) / RS);
  const r0z = Math.floor((ck - reach) / RS), r1z = Math.floor((ck + reach) / RS);
  const res = [];
  for (let rz = r0z; rz <= r1z; rz++) for (let rx = r0x; rx <= r1x; rx++) for (const w of workingsInRegion(seed, rx, rz)) res.push(w);
  return res;
}

export function workingPlugged(w, t) {
  for (const [a, b] of w.plugs) if (t >= a && t <= b) return true;
  return false;
}

// ---------------------------------------------------------------------------------------------
// The people
// ---------------------------------------------------------------------------------------------
const FIRST = ['Marta', 'Dev', 'Ilse', 'Tomasz', 'Rhea', 'Ola', 'Bram', 'Noor', 'Cass', 'Viktor', 'Imani', 'Gus', 'Petra', 'Jun', 'Lucía', 'Hollis', 'Wren', 'Anders', 'Sade', 'Milo', 'Odette', 'Raj', 'Freya', 'Kofi', 'Yara', 'Ned', 'Sunniva', 'Ptolemy', 'Dagny', 'Abel'];
const LAST = ['Okafor', 'Lindqvist', 'Petrakis', 'Moreau', 'Nakamura', 'Duarte', 'Haldane', 'Osei', 'Brandt', 'Varga', 'Quill', 'Mbeki', 'Sorensen', 'Alder', 'Cobb', 'Ferreira', 'Ng', 'Rourke', 'Tamm', 'Vasko', 'Whitlock', 'Ibarra', 'Kessler', 'Dunmore', 'Laurent', 'Pell', 'Ashdown', 'Szabo', 'Thorne', 'Ueda'];

export const ROLES = [
  { id: 'intern',   name: 'Intern',            minTier: 0, maxTier: 2 },
  { id: 'sorter',   name: 'Sorter',            minTier: 0, maxTier: 3 },
  { id: 'forklift', name: 'Forklift Operator', minTier: 1, maxTier: 4 },
  { id: 'surveyor', name: 'Surveyor',          minTier: 2, maxTier: 6 },
  { id: 'foreman',  name: 'Shift Foreman',     minTier: 3, maxTier: 7 },
  { id: 'engineer', name: 'Structural Engineer', minTier: 4, maxTier: 8 },
  { id: 'director', name: 'Site Director',     minTier: 5, maxTier: 9 },
];

export function tierOf(dist) { return Math.max(0, Math.min(9, Math.floor(Math.log2(1 + dist / 60)))); }

export function makeWorker(id, dist) {
  const rng = mulberry32(id);
  const tier = tierOf(dist);
  const eligible = ROLES.filter((r) => tier >= r.minTier && tier <= r.maxTier);
  // deeper means more senior people got further
  const role = eligible[Math.min(eligible.length - 1, Math.floor(Math.pow(rng(), 0.7) * eligible.length))];
  const name = `${FIRST[(rng() * FIRST.length) | 0]} ${LAST[(rng() * LAST.length) | 0]}`;
  return { name, role, tier, rng, dist };
}

const NOTES = {
  intern: [
    '"Told them I could handle the night shift. The pile talks at night. It says my name wrong, on purpose."',
    '"First week and I already know where every exit is not."',
    '"Day 3. They told me to just look for the shiny one. I have been pulling plush out for hours and every one squeaks at me like it knows."',
    '"If you find this, tell Mum I did not run away. The tunnel just got longer than the map said."',
    '"My lamp is dying. The foreman said hum when you are scared. I am humming."',
  ],
  sorter: [
    '"I started naming them. Gnocchi Gatto is Dave now. Dave has been in my pocket since Tuesday."',
    '"Sorting by rarity is easy. Sorting by how they look at you is not. The frog ones are watching."',
    '"Quota is 4,000 a shift. I did 4,012 and the bin was full anyway. Where do they all go?"',
    '"Found a Mythic Fantasma today and the whole crew cheered. Management asked if it was the one. It was not the one."',
  ],
  forklift: [
    '"Lost the pallet jack in a slide. Slides are not supposed to go uphill."',
    '"Backed the truck into the east aisle and the wall was warm. Warm. There is no sun in here."',
    '"I counted the pallet rows. The pile is not where it was last week. It moves when we sleep."',
    '"Cargo hold full. Nothing to unload it onto. Nowhere to go but further."',
  ],
  surveyor: [
    '"%d m. I measured twice. The tape measure was longer the second time."',
    '"My transit says we are %d m from the bay. The compass says east. The plush say go home."',
    '"Plotted what the old ledger told me. The prize was shelved far from every door. Past the corners, I think."',
    '"The pile gets heavier each kilometer. Frames that held at 300 m crumple at 1,500. Plan for it."',
  ],
  foreman: [
    '"Heard the roof go at 3 a.m. Counted heads. Counted again. One more than we started with."',
    '"Rule one: a frame every four meters. Rule two: a frame every four meters. I did not follow rule one."',
    '"Told the crew to back out when the roof creaked. Nobody listens. They listen now."',
    '"Bulkhead the tail when it goes. Never pull on the arch. I pulled on the arch."',
  ],
  engineer: [
    '"Load test failed. Load test passed. Load test did not run, and still reported."',
    '"The numbers say the roof should not hold at this depth. It held. That is worse."',
    '"I stopped trusting the load tables at 2,000 m. The pile pushes back. It pushes back on purpose."',
    '"Blueprint attached for a better lining. If you are reading this, you are deep enough to need it."',
  ],
  director: [
    '"Every director before me left a note. They all say the same thing. I will not write it down."',
    '"I signed the order to dig for it myself. The company knew where it was. They never said why we could not just ask."',
    '"The One is not a plush. I held it once. It was warm and it counted my breaths."',
    '"If you reach the end, do not take it to the surface. Take the door. Take the door."',
  ],
};
const TAIL = [
  'Left this lamp burning for whoever comes next.',
  'Whoever finds this: the squeaking is closer than it should be.',
  'I can still hear the belts from here, which is strange, because we never built any belts out this far.',
  'Do not follow the humming.',
  'I marked the wall with chalk. The chalk keeps rubbing off.',
];

export function noteFor(w) {
  const pool = NOTES[w.role.id];
  let t = pool[(w.rng() * pool.length) | 0];
  t = t.replace('%d', Math.round(w.dist));
  const tail = w.tier >= 4 && w.rng() < 0.6 ? ' ' + TAIL[(w.rng() * TAIL.length) | 0] : '';
  return `${t}${tail}`;
}

// reward: depends on who they were and how deep. Returns a descriptor; game applies it.
export function rewardFor(w) {
  const r = w.rng, t = w.tier, role = w.role.id;
  const scale = Math.pow(2.6, t);
  switch (role) {
    case 'intern': return { kind: 'cash', amount: Math.round(300 * scale * (0.7 + r() * 0.7)), text: 'A pay envelope, never collected.' };
    case 'sorter': return r() < 0.5 ? { kind: 'sell', amount: 0.02 + t * 0.006, text: 'A sorting checklist that shaves a little off every deal.' } : { kind: 'cash', amount: Math.round(900 * scale), text: 'A stash of tokens from the sorting floor.' };
    case 'forklift': return { kind: 'carry', amount: 1 + Math.floor(t / 2), text: 'A good set of straps and a hand truck. You can carry more.' };
    case 'surveyor': return r() < 0.7 ? { kind: 'clue', amount: t, text: 'A surveyor\'s field book with measured coordinates.' } : { kind: 'scan', amount: 0.06, text: 'A tuned geophone. The detectors reach further.' };
    case 'foreman': return t >= 5 && r() < 0.5 ? { kind: 'stab', amount: 1, text: 'The foreman\'s tamping rod and pile charts. Roofs hold better everywhere.' } : { kind: 'dig', amount: 0.04, text: 'The foreman\'s crew roster and shift plan. Machines work faster.' };
    case 'engineer': return { kind: 'blueprint', amount: 1, text: 'A structural blueprint. One of your upgrades improves for free.' };
    default: return r() < 0.5 ? { kind: 'dig', amount: 0.07, text: 'The director\'s master schedule. Every machine runs faster.' } : { kind: 'sell', amount: 0.08, text: 'A signed supply contract. Buyers pay more.' };
  }
}

export function describeBoosts(b) {
  const rows = [];
  if (b.sell) rows.push(`+${Math.round(b.sell * 100)}% sale price`);
  if (b.dig) rows.push(`-${Math.round((1 - b.digMul) * 100)}% dig time`);
  if (b.carry) rows.push(`+${b.carry} carry`);
  if (b.stab) rows.push(`+${b.stab} roof strength`);
  if (b.scan) rows.push(`+${Math.round(b.scan * 100)}% detector range`);
  return rows.join(' · ');
}

export function emptyBoosts() { return { sell: 0, dig: 0, digMul: 1, carry: 0, stab: 0, scan: 0 }; }

export function applyBoost(b, rw) {
  if (rw.kind === 'sell') b.sell += rw.amount;
  else if (rw.kind === 'dig') { b.dig += rw.amount; b.digMul *= 1 - rw.amount; }
  else if (rw.kind === 'carry') b.carry += rw.amount;
  else if (rw.kind === 'stab') b.stab += rw.amount;
  else if (rw.kind === 'scan') b.scan += rw.amount;
}

export const CELL_M = C;
