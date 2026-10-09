import { h32, mulberry32 } from './util.js';
import { HALL_HX, HALL_HZ, HALL_H, EXIT_X, cellX, cellY, cellZ } from './config.js';
import { FRAME_TYPES } from './upgrades.js';

// ---------------------------------------------------------------------------------------------
// Notes: the paper the old crews left behind. Every kind is flavor, and a good share also carry a REAL clue about where The One is.
//
// A clue is a region the needle is inside of. It is generated from the world seed and the place the note was found, never at random
// at read time, and it is true by construction. Two rules keep the search honest and keep it from becoming a coordinate:
//   1. the further out a note is found, the narrower its region (levelFor: 1 near the bay to 4 far out);
//   2. every region is a cell of a fixed lattice (bearings in steps of 15 degrees, distances in steps of 200 m, and so on), so no pile of notes
//      can ever cut a range finer than the finest lattice cell, and the middle of a range tells you nothing.
// Different kinds of clue cut the same needle from different sides (bearing, distance from the bay, distance from the EXIT, distance from a wall,
// height, a survey square), and the journal intersects them (summarize), never excluding the needle.
//
// This file is pure: no DOM and no game object. game.js and notebook.js do the placing, saving and showing.
// ---------------------------------------------------------------------------------------------

export const KINDS = {
  worker:    { id: 'worker',    name: 'Worker\'s note',          icon: '⛑️', where: 'the remains of lost workers' },
  shelving:  { id: 'shelving',  name: 'Shelving log',            icon: '📋', where: 'remains and old working mouths' },
  memo:      { id: 'memo',      name: 'Shift supervisor\'s memo', icon: '📝', where: 'remains of foremen and directors, old working mouths' },
  map:       { id: 'map',       name: 'Map scrap',               icon: '🗺️', where: 'surveyors\' remains and old working mouths' },
  manifest:  { id: 'manifest',  name: 'Delivery manifest',       icon: '🚚', where: 'supply caches and contract paperwork' },
  ledger:    { id: 'ledger',    name: 'Inventory ledger',        icon: '📒', where: 'supply caches and contract paperwork' },
  photo:     { id: 'photo',     name: 'Torn photograph',         icon: '🖼️', where: 'rare plush tags' },
  coded:     { id: 'coded',     name: 'Coded message',           icon: '🔐', where: 'depot beacon sets, contracts and the remains of directors' },
  paperwork: { id: 'paperwork', name: 'Facility paperwork',      icon: '📎', where: 'depot beacons far from the bay' },
};
export const KIND_IDS = Object.keys(KINDS);
export const DOC_KINDS = KIND_IDS.filter((k) => k !== 'worker' && k !== 'paperwork');   // the kinds a document can be (worker notes and beacon paperwork have their own code)

// ---------------------------------------------------------------------------------------------
// The truth, and the bearing convention the compass uses (0 = north = -z, 90 = east = +x)
// ---------------------------------------------------------------------------------------------
export function truthOf(needle) { return { x: cellX(needle.i), z: cellZ(needle.k), y: cellY(needle.j) }; }
export const bearingOf = (x, z) => ((Math.atan2(x, -z) * 180 / Math.PI) % 360 + 360) % 360;
export const wrap360 = (a) => ((a % 360) + 360) % 360;
const p3 = (a) => String(Math.round(wrap360(a)) % 360).padStart(3, '0');
const num = (n) => Math.round(n).toLocaleString('en-US');
const dec1 = (n) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');

// how specific a note found at this distance from the bay is: 1 (near) to 4 (deep)
export const LEVEL_AT = [300, 1000, 2200];
export function levelFor(dist) { let l = 1; for (const t of LEVEL_AT) if (dist >= t) l++; return l; }

// ---------------------------------------------------------------------------------------------
// Clue regions. type t: b bearing wedge {lo, w}, d distance from the bay, x distance from the EXIT, w distance from a wall (s: N S E W),
// h height above the floor, q survey square {x0, z0, s}. v is only how it is worded (c compass hint, load tables, pile above). f marks a free
// (not lattice) region, which only the old beacon paperwork uses.
// ---------------------------------------------------------------------------------------------
export const WIDTH = {
  b: [120, 60, 30, 15],
  d: [2400, 1200, 600, 200],
  x: [1200, 600, 300, 150],
  w: [2400, 1200, 600, 200],
  h: [20, 10, 5, 2.5],
  q: [1600, 800, 400, 200],
};
const UNIT = { b: 15, d: 200, x: 150, w: 200, h: 2.5 };
export const MIN_WIDTH = { b: 15, d: 200, x: 150, w: 200, h: 2.5, q: 200 };
const WALLS = { N: 'north', S: 'south', E: 'east', W: 'west' };
const wallDist = (s, x, z) => (s === 'N' ? z + HALL_HZ : s === 'S' ? HALL_HZ - z : s === 'E' ? HALL_HX - x : x + HALL_HX);

// Signed slack of a point (x east, z south, metres) against a clue, in metres. Positive inside. Every one of them is 1-Lipschitz in the
// position, which is what lets summarize() test a grid of samples and still never lose the needle: a sample within half a grid step of the
// needle has a slack of at least minus that step.
export function margin(c, x, z) {
  switch (c.t) {
    case 'b': {
      const r = Math.hypot(x, z); if (r < 1e-6) return 0;
      const half = c.w / 2, a = Math.abs(((bearingOf(x, z) - (c.lo + half) + 540) % 360) - 180);
      const side = a <= half ? half - a : a - half, m = r * Math.sin(Math.min(Math.PI / 2, side * Math.PI / 180));   // the distance to the nearer edge of the wedge (the apex when the point is more than a right angle off)
      return a <= half ? m : -m;
    }
    case 'd': { const r = Math.hypot(x, z); return Math.min(r - c.lo, c.hi - r); }
    case 'x': { const r = Math.hypot(x - EXIT_X, z); return Math.min(r - c.lo, c.hi - r); }
    case 'w': { const u = wallDist(c.s, x, z); return Math.min(u - c.lo, c.hi - u); }
    case 'q': return Math.min(x - c.x0, c.x0 + c.s - x, z - c.z0, c.z0 + c.s - z);
    default: return Infinity;   // height clues are checked on their own axis
  }
}
export function clueHolds(c, truth) {
  if (c.t === 'h') return truth.y >= c.lo - 1e-9 && truth.y <= c.hi + 1e-9;
  return margin(c, truth.x, truth.z) >= -1e-6;
}
export const widthOf = (c) => (c.t === 'b' ? c.w : c.t === 'q' ? c.s : c.hi - c.lo);

// ---------------------------------------------------------------------------------------------
// Making a clue from the truth
// ---------------------------------------------------------------------------------------------
function bucket(v, wd) { const lo = Math.floor(v / wd + 1e-12) * wd; return lo; }

export function clueOfType(type, level, truth, rng, variant) {
  const L = Math.max(1, Math.min(4, level)) - 1;
  const bear = bearingOf(truth.x, truth.z);
  if (type === 'b') {
    let w = WIDTH.b[L];
    if (variant === 'c') w = L < 2 ? 90 : 45;   // a compass hint: a quarter, then an eighth of the compass (both multiples of the lattice step)
    return { t: 'b', lo: bucket(bear, w), w, ...(variant === 'c' ? { v: 'c' } : {}) };
  }
  if (type === 'd') { const w = WIDTH.d[L], lo = bucket(Math.hypot(truth.x, truth.z), w); return { t: 'd', lo, hi: lo + w, ...(variant ? { v: variant } : {}) }; }
  if (type === 'x') { const w = WIDTH.x[L], lo = bucket(Math.hypot(truth.x - EXIT_X, truth.z), w); return { t: 'x', lo, hi: lo + w }; }
  if (type === 'w') {
    const s = [truth.z < 0 ? 'N' : 'S', truth.x < 0 ? 'W' : 'E'][(rng() * 2) | 0], w = WIDTH.w[L], lo = bucket(wallDist(s, truth.x, truth.z), w);   // one of the two walls the needle is nearest to: a note measures from a wall it could sensibly be read against
    return { t: 'w', s, lo, hi: lo + w };
  }
  if (type === 'h') { const w = WIDTH.h[L], lo = bucket(truth.y, w); return { t: 'h', lo, hi: lo + w, ...(variant ? { v: variant } : {}) }; }
  if (type === 'q') { const s = WIDTH.q[L]; return { t: 'q', x0: bucket(truth.x, s), z0: bucket(truth.z, s), s }; }
  return null;
}

// which clue types each kind of paper carries, with weights ('c' compass hint, 'load' and 'pile' are worded variants of d and h)
const TYPES = {
  shelving: [['b', 4], ['c', 3]],
  memo:     [['d', 3], ['load', 3], ['pile', 2]],
  map:      [['b', 3], ['x', 3], ['w', 2], ['q', 1, 3]],
  manifest: [['d', 3], ['h', 3], ['w', 1]],
  ledger:   [['h', 3], ['pile', 2], ['load', 2], ['d', 1]],
  photo:    [['x', 4], ['w', 3], ['b', 1]],
  coded:    [['b', 2], ['d', 2], ['x', 2], ['h', 2], ['w', 1], ['q', 1, 3]],
};
// the share of notes of a kind that carry a real clue at all (the rest are flavor), before the level lifts it
const CLUE_P = { shelving: 0.55, memo: 0.65, map: 0.85, manifest: 0.7, ledger: 0.6, photo: 0.6, coded: 0.9 };
const LEVEL_P = [0.8, 0.95, 1.05, 1.15];

function pickWeighted(rng, rows, level) {
  const ok = rows.filter((r) => !r[2] || level >= r[2]);
  let t = 0; for (const r of ok) t += r[1];
  let x = rng() * t; for (const r of ok) { x -= r[1]; if (x < 0) return r[0]; }
  return ok[ok.length - 1][0];
}

// ---------------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------------
const OCT = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const QUARTER = { 0: 'north-east', 90: 'south-east', 180: 'south-west', 270: 'north-west' };
const frameNames = () => Object.keys(FRAME_TYPES);
// the frames that cannot stand at the far end of a distance band, and the cheapest one that can
function ratingLine(lo, hi) {
  const ks = frameNames();
  const need = ks.find((k) => FRAME_TYPES[k].maxDepth >= hi) || ks[ks.length - 1];
  const weak = ks.filter((k) => FRAME_TYPES[k].maxDepth < lo).pop();
  const nm = FRAME_TYPES[need].name;
  const rated = isFinite(FRAME_TYPES[need].maxDepth) ? `rated to ${num(FRAME_TYPES[need].maxDepth)} m` : 'rated for any depth';
  return `${weak ? FRAME_TYPES[weak].name + ' will not hold there. ' : ''}${nm} (${rated}) is the lightest frame that does`;
}
export function clause(c) {
  switch (c.t) {
    case 'b': {
      if (c.v === 'c') return c.w >= 90 ? `in the ${QUARTER[c.lo % 360]} quarter of the hall` : `between ${OCT[(c.lo / 45) % 8]} and ${OCT[(c.lo / 45 + 1) % 8]} on the compass`;
      return `on bearing ${p3(c.lo)} to ${p3(c.lo + c.w)} degrees from Bay 07`;
    }
    case 'd': return c.v === 'load' ? `where the load tables read weight x${dec1(1 + c.lo / 150)} to x${dec1(1 + c.hi / 150)}` : `${num(c.lo)} to ${num(c.hi)} m from Bay 07`;
    case 'x': return `${num(c.lo)} to ${num(c.hi)} m from the EXIT doors`;
    case 'w': return `${num(c.lo)} to ${num(c.hi)} m in from the ${WALLS[c.s]} wall`;
    case 'h': return c.v === 'pile' ? `under ${dec1(HALL_H - c.hi)} to ${dec1(HALL_H - c.lo)} m of pile` : `${dec1(c.lo)} to ${dec1(c.hi)} m off the floor`;
    case 'q': return `inside the survey square E ${num(c.x0)} to ${num(c.x0 + c.s)} m, S ${num(c.z0)} to ${num(c.z0 + c.s)} m`;
    default: return '';
  }
}
// a one-line reading of a clue for the journal (what it adds to the search)
export function clueLine(c) {
  switch (c.t) {
    case 'b': return c.v === 'c' ? `Compass: ${clause(c).replace(/^in the /, '').replace(' of the hall', '')}` : `Bearing: ${p3(c.lo)}° to ${p3(c.lo + c.w)}°`;
    case 'd': return c.v === 'load' ? `Load tables: ${clause(c).replace('where the load tables read ', '')}` : `Distance from the bay: ${num(c.lo)} to ${num(c.hi)} m`;
    case 'x': return `Distance from the EXIT doors: ${num(c.lo)} to ${num(c.hi)} m`;
    case 'w': return `From the ${WALLS[c.s]} wall: ${num(c.lo)} to ${num(c.hi)} m`;
    case 'h': return c.v === 'pile' ? `Pile above it: ${dec1(HALL_H - c.hi)} to ${dec1(HALL_H - c.lo)} m` : `Height: ${dec1(c.lo)} to ${dec1(c.hi)} m off the floor`;
    case 'q': return `Survey square: E ${num(c.x0)} to ${num(c.x0 + c.s)} m, S ${num(c.z0)} to ${num(c.z0 + c.s)} m`;
    default: return '';
  }
}

const FRAMES = {
  shelving: [
    (k) => `Shelving log, last page: "Gold crate re-shelved. By the tags it is ${k}. Initial here."`,
    (k) => `Row log: "The prize lot is ${k}. Not my aisle, not my problem."`,
    (k) => `Shelving log, torn corner: "Moved the gold crate again. It is ${k}."`,
  ],
  memo: [
    (k) => `Shift supervisor's memo: "The prize lot is ${k}. This is not for the crew."`,
    (k) => `Memo to all foremen: "For the record, the gold crate is ${k}. Burn after reading."`,
    (k) => `Supervisor's memo: "Do not go looking. The prize lot is ${k}, and we lost two crews learning that."`,
  ],
  map: [
    (k) => `Map scrap: a pencil mark says the prize is ${k}, then a smudged X.`,
    (k) => `Map scrap: half a floor plan. A hand has written that the gold crate is ${k}.`,
    (k) => `Map scrap: the margin reads "prize lot ${k}", underlined twice.`,
  ],
  manifest: [
    (k) => `Delivery manifest: "Item: one gold crate. Destination: it is ${k}. Receiver signature: none."`,
    (k) => `Manifest, carbon copy: "Gold crate delivered. Per the driver it is ${k}. The forklift would not go further."`,
    (k) => `Bill of lading: "1 x gold crate, handle with care. Final position: ${k}."`,
  ],
  ledger: [
    (k) => `Inventory ledger: "Item 0001 (gold, one only) is ${k}. Do not recount."`,
    (k) => `Stocktake page: "All lines agree except the gold crate, which is ${k}."`,
    (k) => `Ledger entry in green ink: "Prize lot, ${k}. Cross-checked twice."`,
  ],
  photo: [
    (k) => `Torn photograph. On the back, in pen: "Taken where the gold crate is ${k}."`,
    (k) => `A snapshot of a shelf, torn across the middle. The caption says the crate is ${k}.`,
    (k) => `Torn photograph, a crate glowing at the edge of the frame. Written under it: "${k}".`,
  ],
  coded: [
    (k) => `THE PRIZE LOT IS ${k.toUpperCase()}. DESTROY THIS PAGE.`,
    (k) => `RELAY TO ALL DEPOTS: THE GOLD CRATE IS ${k.toUpperCase()}. ACKNOWLEDGE.`,
  ],
};

const FLAVOR = {
  shelving: [
    'Aisle 14, bay C: 212 units of Gnocchi Gatto, shelved face out. Bay D: nobody remembers shelving this. Please do not shelve this.',
    'Row 31 recount: the plush on the top shelf have moved again. Initial each shelf you check.',
    'Shelf 9-B restocked three times this week. It is full every morning. Do not ask where it comes from.',
    'Pallet tags for the east aisle are all printed with tomorrow\'s date.',
    'Count sheet: 4,008 on the shelf, 4,000 on the manifest. The extra eight are watching the door.',
  ],
  memo: [
    'To all shifts: the break room microwave is not a sorting bin. Stop feeding it plush. It is learning.',
    'Reminder: harness checks are before the shift, not after the cave-in.',
    'Per management, the phrase "the pile is breathing" is not to be used in incident reports.',
    'Overtime is approved for anyone who can explain the squeaking in aisle 6.',
    'Please stop naming the plush. Please. Dave is not a valid employee ID.',
  ],
  map: [
    'A scrap of a hand-drawn map. Every corridor is labeled YOU ARE HERE.',
    'A map corner showing the bay and a great many arrows that all point at each other.',
    'Half a floor plan. Someone has drawn a small smiling face where the exit should be.',
    'A map with the north arrow pointing down. Under it: "It was up yesterday."',
  ],
  manifest: [
    'Manifest 7731: 40 crates of assorted plush, 1 crate marked "plush, assorted, do not open". Receiver: illegible.',
    'Delivery slip: the truck arrived on time. The driver did not. The truck is still idling in dock 3.',
    'Bill of lading: 12 pallets, 11 signatures, 1 pawprint.',
    'Manifest for a delivery that was never ordered, signed by a manager who was not here that day.',
  ],
  ledger: [
    'Ledger page: opening stock 9,000,000. Closing stock 9,000,004. Auditor\'s note: nobody is missing.',
    'Inventory line 88: "Misc, squeaky." Quantity: yes.',
    'Stocktake: every count agrees to the unit. This is the problem.',
    'A ledger column that adds up to a different number each time you add it.',
  ],
  photo: [
    'A torn photograph of a smiling crew in front of a very large pile. The last person in the row is blurred.',
    'A photo of a shelf, torn across the middle. Someone circled a plush in red, then crossed out the circle.',
    'A snapshot of a night shift. Everyone is looking at the camera. Nobody was holding it.',
  ],
  coded: [
    'RELAY CHECK. ALL QUIET. ALL TOO QUIET.',
    'DEPOT NINE REPORTS NOTHING UNUSUAL. THE SQUEAKING IS NOT UNUSUAL.',
    'TEST TRANSMISSION. IF YOU CAN READ THIS, STOP READING THIS.',
  ],
};

const A0 = 'A'.charCodeAt(0);
export function caesar(text, k) {
  let o = '';
  for (const ch of String(text)) { const c = ch.charCodeAt(0); if (c >= A0 && c < A0 + 26) o += String.fromCharCode(A0 + ((c - A0 + k) % 26 + 26) % 26); else o += ch; }
  return o;
}

// ---------------------------------------------------------------------------------------------
// Where each kind of paper turns up, and how likely a place is to have one at all
// ---------------------------------------------------------------------------------------------
const BY_ROLE = {
  intern:   { shelving: 3, photo: 1 },
  sorter:   { shelving: 4, photo: 1 },
  forklift: { shelving: 3, manifest: 2 },
  surveyor: { map: 4, shelving: 1 },
  foreman:  { memo: 4, shelving: 1 },
  engineer: { memo: 3, coded: 1, map: 1 },
  director: { memo: 2, coded: 2 },
};
const BY_SOURCE = {
  cache:    { manifest: 4, ledger: 4, photo: 0.5 },
  working:  { map: 3, shelving: 2, memo: 1 },
  beacon:   { coded: 1 },
  plush:    { photo: 1 },
  contract: { manifest: 3, ledger: 3, coded: 2 },
};
export const DOC_CHANCE = { remains: 0.8, cache: 0.6, working: 1, beacon: 1, plush: 1, contract: 0.55 };
export const SOURCE_NAME = { remains: 'Remains', cache: 'Supply cache', working: 'Old working', beacon: 'Depot relay', plush: 'Rare plush', contract: 'Contract' };

function pickKind(rng, table) {
  const ks = Object.keys(table); let t = 0; for (const k of ks) t += table[k];
  let x = rng() * t; for (const k of ks) { x -= table[k]; if (x < 0) return k; }
  return ks[ks.length - 1];
}

// Make the paper found at a place. src: { source, key: [a, b, c] (the cell it lies at, or an id), dist (metres from the bay), role (remains), p (override the chance), kind (force) }.
// Returns null when this place has none. The same seed and place always give the same paper.
export function makeDoc(seed, needle, src) {
  const key = src.key || [0, 0, 0], source = src.source;
  const rng = mulberry32(h32(key[0] | 0, key[1] | 0, key[2] | 0, (seed ^ 0x6e07e5) + h32(source.length, source.charCodeAt(0))));
  const chance = src.p !== undefined ? src.p : DOC_CHANCE[source];
  const roll = rng();
  if (roll >= chance) return null;
  const dist = Math.max(0, +src.dist || 0), level = levelFor(dist);
  const table = source === 'remains' ? (BY_ROLE[src.role] || BY_ROLE.sorter) : BY_SOURCE[source];
  const kind = src.kind || pickKind(rng, table);
  const doc = { id: `${source.slice(0, 2)}:${key.map((n) => Math.round(n)).join('.')}`, kind, title: KINDS[kind].name, source, dist: Math.round(dist), lvl: level, text: '', clue: null };
  const wantClue = rng() < Math.min(1, CLUE_P[kind] * LEVEL_P[level - 1]);
  const frames = FRAMES[kind];
  if (wantClue) {
    const truth = truthOf(needle);
    let type = pickWeighted(rng, TYPES[kind], level), variant;
    if (type === 'c') { type = 'b'; variant = 'c'; } else if (type === 'load') { type = 'd'; variant = 'load'; } else if (type === 'pile') { type = 'h'; variant = 'pile'; }
    const clue = clueOfType(type, level, truth, rng, variant);
    doc.clue = clue;
    let k = clause(clue);
    if (clue.v === 'load') k += `. ${ratingLine(clue.lo, clue.hi)}`;
    const line = frames[(rng() * frames.length) | 0](k);
    if (kind === 'coded') { const sh = 1 + ((rng() * 24) | 0); doc.cipher = `${caesar(line, sh)}`; doc.key = sh; doc.text = line; }
    else doc.text = line;
  } else {
    const pool = FLAVOR[kind], line = pool[(rng() * pool.length) | 0];
    if (kind === 'coded') { const sh = 1 + ((rng() * 24) | 0); doc.cipher = caesar(line, sh); doc.key = sh; doc.text = line; } else doc.text = line;
  }
  return doc;
}

// ---------------------------------------------------------------------------------------------
// The old paperwork a Depot Beacon far from the bay turns up (levels 1 to 4 at 250, 900, 1900 and 3200 m). Level 1 to 3 keep the free wording they always had;
// level 4 used to print the needle's exact coordinates behind a "give or take", now it names a 200 m survey square.
// ---------------------------------------------------------------------------------------------
export function paperwork(seed, needle, level) {
  const t = truthOf(needle), bearing = bearingOf(t.x, t.z), dist = Math.hypot(t.x, t.z);
  const rnd = mulberry32((seed ^ (level * 7919)) >>> 0);
  const half = [70, 35, 15, 6][level - 1];
  const off = (rnd() - 0.5) * half * 0.8;
  const lo = wrap360(bearing + off - half), hi = wrap360(bearing + off + half);
  const band = [0, 500, 200, 70][level - 1];
  const dm = Math.round((dist + (rnd() - 0.5) * band * 0.6) / 10) * 10;
  const wr = (a) => String(Math.round(wrap360(a))).padStart(3, '0');
  const b = { t: 'b', lo: wrap360(bearing + off - half), w: half * 2, f: 1 };
  const d = { t: 'd', lo: dm - band / 2, hi: dm + band / 2, f: 1 };
  if (level === 1) return { text: `Row ledger: the prize lot was shelved between bearing ${wr(lo)}° and ${wr(hi)}° from Bay 07.`, clues: [b] };
  if (level === 2) return { text: `Forklift log: a gold crate went out along bearing ${wr(lo)}° to ${wr(hi)}°, roughly ${(dm - band / 2).toFixed(0)} to ${(dm + band / 2).toFixed(0)} m.`, clues: [b, d] };
  if (level === 3) return { text: `Shift memo: aisle sweep found the gold crate wedged ${(dm - band / 2).toFixed(0)}-${(dm + band / 2).toFixed(0)} m out, bearing ${wr(lo)}° to ${wr(hi)}°.`, clues: [b, d] };
  const q = clueOfType('q', 4, t, rnd);
  const cx = q.x0 + q.s / 2, cz = q.z0 + q.s / 2;
  return { text: `Last manifest: the One sits near E ${cx.toFixed(0)}, S ${cz.toFixed(0)} (give or take ${q.s / 2} m).`, clues: [q] };
}
// the level of a stored paperwork line (its first words never change); 0 when it is not one
export function paperworkLevel(text) {
  const s = String(text);
  if (s.startsWith('Row ledger')) return 1;
  if (s.startsWith('Forklift log')) return 2;
  if (s.startsWith('Shift memo')) return 3;
  if (s.startsWith('Last manifest')) return 4;
  return 0;
}
// every clue region the paperwork lines of a save stand for
export function paperworkClues(seed, needle, lines) {
  const out = [], seen = new Set();
  for (const text of lines || []) { const l = paperworkLevel(text); if (!l || seen.has(l)) continue; seen.add(l); out.push(...paperwork(seed, needle, l).clues); }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Putting the clues together
// ---------------------------------------------------------------------------------------------
const DA = 0.5, DR = 25;   // coarse grid: half a degree and 25 m
const RMAX = Math.ceil(Math.hypot(HALL_HX, HALL_HZ) / DR) * DR;
const sig = (cs) => JSON.stringify(cs.map((c) => [c.t, c.lo, c.hi, c.w, c.s, c.x0, c.z0]));
const memo = new Map();

// The combined picture of every clue: the smallest bearing range, distance band and height that still contain every point the clues allow. The region is found by testing a polar
// grid against the exact slack of each clue (see margin) with the tolerance of the grid step, then the ranges are widened by that same step, so the needle is always inside.
export function summarize(clues) {
  const list = (clues || []).filter((c) => c && c.t);
  const key = sig(list);
  if (memo.has(key)) return memo.get(key);
  const res = solve(list);
  if (memo.size > 40) memo.clear();
  memo.set(key, res);
  return res;
}

function solve(list) {
  const hs = list.filter((c) => c.t === 'h');
  let hLo = 0, hHi = HALL_H;
  for (const c of hs) { hLo = Math.max(hLo, c.lo); hHi = Math.min(hHi, c.hi); }
  const geo = list.filter((c) => c.t !== 'h');
  const out = { n: list.length, bearing: null, dist: null, height: hs.length ? (hHi >= hLo ? { lo: hLo, hi: hHi } : null) : null, conflict: hs.length > 0 && hHi < hLo, pts: [], box: null, area: null };
  if (!geo.length) return out;
  // pass 1: the whole hall at the coarse step, constraints in order of how much they cut
  const pass = (aFrom, aSpan, rFrom, rTo, da, dr) => {
    const na = Math.max(1, Math.round(aSpan / da)), nr = Math.max(1, Math.round((rTo - rFrom) / dr));
    const xs = [], zs = [], rs = [], as = [];
    for (let ia = 0; ia < na; ia++) {
      const th = aFrom + (ia + 0.5) * da, s = Math.sin(th * Math.PI / 180), c = Math.cos(th * Math.PI / 180);
      for (let ir = 0; ir < nr; ir++) { const r = rFrom + (ir + 0.5) * dr; xs.push(r * s); zs.push(-r * c); rs.push(r); as.push(th); }
    }
    let idx = []; for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i]) <= HALL_HX + 80 && Math.abs(zs[i]) <= HALL_HZ + 80) idx.push(i);
    const order = geo.slice().sort((p, q) => (p.t === 'b' ? 0 : p.t === 'd' ? 1 : 2) - (q.t === 'b' ? 0 : q.t === 'd' ? 1 : 2));
    for (const c of order) {
      const keep = [];
      for (const i of idx) {
        if (c.t === 'b') {   // a bearing is tested in degrees: the needle's nearest sample is at most half a grid step off in angle (near the bay a metre tolerance would let every bearing through)
          const half = c.w / 2, a = Math.abs(((as[i] - (c.lo + half) + 540) % 360) - 180);
          if (a - half <= da / 2 + 1e-9 || rs[i] < 1e-6) keep.push(i);
          continue;
        }
        const tol = Math.hypot(dr / 2, rs[i] * da * Math.PI / 360) + 1e-6;
        if (margin(c, xs[i], zs[i]) >= -tol) keep.push(i);
      }
      idx = keep; if (!idx.length) break;
    }
    return { idx, xs, zs, rs, as, da, dr };
  };
  const arc = (r) => {
    // the smallest arc of bearings that holds every kept sample: the circle minus its largest empty gap
    const bins = Math.round(360 / r.da), has = new Uint8Array(bins);
    for (const i of r.idx) has[Math.min(bins - 1, Math.floor(r.as[i] / r.da))] = 1;
    let best = 0, bestAt = 0;
    for (let q = 0, run = 0, at = 0; q < 2 * bins; q++) {
      if (!has[q % bins]) { if (run === 0) at = q; run++; if (run > best && run < bins) { best = run; bestAt = at; } } else run = 0;
    }
    if (best === 0) return { lo: 0, w: 360 };
    return { lo: wrap360(((bestAt + best) % bins) * r.da - r.da / 2), w: Math.min(360, (bins - best) * r.da + r.da) };
  };
  let p = pass(0, 360, 0, RMAX, DA, DR);
  if (!p.idx.length) { out.conflict = true; return out; }
  let a = arc(p), rLo = Infinity, rHi = 0;
  for (const i of p.idx) { if (p.rs[i] < rLo) rLo = p.rs[i]; if (p.rs[i] > rHi) rHi = p.rs[i]; }
  rLo -= DR / 2; rHi += DR / 2;
  // pass 2: a tighter picture inside the window the first pass found (only when it is small enough to be worth it)
  if (a.w <= 60 && rHi - rLo <= 2500) {
    const pad = DA; const from = wrap360(a.lo - pad), span = Math.min(360, a.w + 2 * pad);
    const q = pass(from, span, Math.max(0, rLo - DR), rHi + DR, 0.1, 5);
    if (q.idx.length) {
      // angles in pass 2 start at `from`, which may be past 360 after the wrap: keep them as bearings
      const bins = Math.round(span / q.da); let lo = Infinity, hi = -Infinity, r0 = Infinity, r1 = 0;
      for (const i of q.idx) { const rel = q.as[i] - from; if (rel < lo) lo = rel; if (rel > hi) hi = rel; if (q.rs[i] < r0) r0 = q.rs[i]; if (q.rs[i] > r1) r1 = q.rs[i]; }
      void bins;
      a = { lo: wrap360(from + lo - q.da / 2), w: Math.min(360, hi - lo + q.da) };
      rLo = Math.max(0, r0 - q.dr / 2); rHi = r1 + q.dr / 2; p = q;
    }
  }
  out.bearing = a.w >= 359 ? null : { lo: a.lo, w: a.w };
  out.dist = rHi - rLo >= RMAX - 2 * DR ? null : { lo: rLo, hi: rHi };
  const pts = [], step = Math.max(1, Math.floor(p.idx.length / 700));
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let n = 0; n < p.idx.length; n++) { const i = p.idx[n]; if (p.xs[i] < x0) x0 = p.xs[i]; if (p.xs[i] > x1) x1 = p.xs[i]; if (p.zs[i] < z0) z0 = p.zs[i]; if (p.zs[i] > z1) z1 = p.zs[i]; if (n % step === 0) pts.push([Math.round(p.xs[i]), Math.round(p.zs[i])]); }
  out.pts = pts; out.box = { x0, x1, z0, z1 };
  return out;
}

// the plain words for a summary, for the journal and the achievements
export function describeSummary(s) {
  const rows = [];
  rows.push(!s.bearing ? 'Bearing: unknown' : s.bearing.w > 180 ? `Bearing anywhere except ${p3(s.bearing.lo + s.bearing.w)}° to ${p3(s.bearing.lo)}°` : `Bearing ${p3(s.bearing.lo)}° to ${p3(s.bearing.lo + s.bearing.w)}° (${Math.round(s.bearing.w)}° wide)`);
  rows.push(!s.dist ? 'Distance: unknown' : s.dist.lo <= 30 ? `Distance up to ${num(Math.ceil(s.dist.hi / 10) * 10)} m from the bay` : `Distance ${num(Math.floor(s.dist.lo / 10) * 10)} to ${num(Math.ceil(s.dist.hi / 10) * 10)} m from the bay`);
  rows.push(s.height ? `Height ${dec1(s.height.lo)} to ${dec1(s.height.hi)} m off the floor` : 'Height: unknown');
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Anything that arrives from outside (a friend's message, a save) is checked before it is used. A clue must be a cell of its lattice (so it can never be
// narrower than the finest one), a text is plain and short, and the caller can still test it against the needle (clueHolds).
// ---------------------------------------------------------------------------------------------
const okNum = (n) => typeof n === 'number' && Number.isFinite(n);
const onLattice = (v, u) => Math.abs(v / u - Math.round(v / u)) < 1e-6;
export function cleanClue(c) {
  if (!c || typeof c !== 'object' || typeof c.t !== 'string') return null;
  const v = c.v === 'c' || c.v === 'load' || c.v === 'pile' ? c.v : undefined;
  if (c.t === 'b') { if (!okNum(c.lo) || !okNum(c.w) || !(WIDTH.b.includes(c.w) || c.w === 90 || c.w === 45) || c.lo < 0 || c.lo >= 360 || !onLattice(c.lo, UNIT.b)) return null; return { t: 'b', lo: c.lo, w: c.w, ...(v === 'c' ? { v } : {}) }; }
  if (c.t === 'd' || c.t === 'x' || c.t === 'w' || c.t === 'h') {
    if (!okNum(c.lo) || !okNum(c.hi) || c.lo < 0 || c.hi > 20000 || !WIDTH[c.t].includes(c.hi - c.lo) || !onLattice(c.lo, UNIT[c.t])) return null;
    if (c.t === 'w') { if (typeof c.s !== 'string' || !WALLS[c.s]) return null; return { t: 'w', s: c.s, lo: c.lo, hi: c.hi }; }
    return { t: c.t, lo: c.lo, hi: c.hi, ...(v && (v === 'load' && c.t === 'd' || v === 'pile' && c.t === 'h') ? { v } : {}) };
  }
  if (c.t === 'q') { if (!okNum(c.x0) || !okNum(c.z0) || !okNum(c.s) || !WIDTH.q.includes(c.s) || !onLattice(c.x0, c.s) || !onLattice(c.z0, c.s) || Math.abs(c.x0) > 20000 || Math.abs(c.z0) > 20000) return null; return { t: 'q', x0: c.x0, z0: c.z0, s: c.s }; }
  return null;
}
const plain = (s, n) => (typeof s === 'string' ? s : typeof s === 'number' && Number.isFinite(s) ? String(s) : '').replace(/[<>\u0000-\u001f]/g, ' ').slice(0, n);   // only text and numbers become text
export function cleanDoc(d) {
  if (!d || typeof d !== 'object') return null;
  if (!DOC_KINDS.includes(d.kind)) return null;
  const id = plain(d.id, 40); if (!/^[a-z]{2}:-?\d+(\.-?\d+){0,2}$/.test(id)) return null;
  const out = { id, kind: d.kind, title: KINDS[d.kind].name, source: typeof d.source === 'string' && SOURCE_NAME[d.source] ? d.source : 'remains', dist: okNum(d.dist) ? Math.max(0, Math.min(20000, Math.round(d.dist))) : 0, lvl: okNum(d.lvl) ? Math.max(1, Math.min(4, Math.round(d.lvl))) : 1, text: plain(d.text, 600), clue: null };
  if (!out.text) return null;
  if (d.clue) { const c = cleanClue(d.clue); if (!c) return null; out.clue = c; }
  if (d.kind === 'coded' && okNum(d.key) && d.key >= 1 && d.key <= 25) { out.key = Math.round(d.key); out.cipher = plain(d.cipher, 600); }
  if (okNum(d.t)) out.t = d.t;
  if (d.from) out.from = plain(d.from, 80);
  return out;
}

// every clue a save and its friend have: the docs it read, the clues it heard from its partner, and the paperwork
export function cluesOf(S, seed, needle) {
  const out = [];
  for (const d of S.papers || []) if (d && d.clue) out.push(d.clue);
  for (const d of S.heard || []) if (d && d.clue) out.push(d.clue);
  out.push(...paperworkClues(seed, needle, S.clues));
  return out;
}
// the kinds a save has read so far, and how many notes
export function kindsRead(S) {
  const k = new Set();
  if ((S.notes || []).length) k.add('worker');
  for (const d of S.papers || []) if (d && KINDS[d.kind]) k.add(d.kind);
  if ((S.clues || []).length) k.add('paperwork');
  return k;
}
export const noteTotal = (S) => (S.notes || []).length + (S.papers || []).length + (S.clues || []).length;
