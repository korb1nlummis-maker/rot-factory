// Merger and splitter rules (Satisfactory spec 4.2, wave 2B): the pure part. Nothing here touches three, the game or the world, so a test can
// run it on plain objects. logistics.js asks `route` which outputs a plush may try (and in what order), and `mergePick` which input of a merger
// may push next; the panel (splitpanel.js) and the readouts use the names and colors below.
import { species, NEEDLE, RARITY, SPECIAL_MIN, DECOYS } from './plushdata.js';

// ---------------------------------------------------------------- numbers
export const SLOT_NAMES = ['Forward', 'Right', 'Left'];   // output slots of a splitter, in the order splitOuts lists them (dir, dir + 1, dir + 3)
export const LANE_NAMES = ['Back', 'Left', 'Right'];      // input lanes of a merger: where the plush come from (dir, dir + 1 = they travel right so they come from the left, dir + 3)
export const MAX_RULES = { 1: 1, 2: 8 };                  // rules per output: Smart Splitter 1, Programmable Splitter 8
export const KINDS = ['any', 'none', 'overflow', 'undef', 'rarity', 'species', 'one', 'shiny'];
export const KIND_NAMES = { any: 'Any', none: 'None', overflow: 'Overflow', undef: 'Anything else', rarity: 'Rarity', species: 'Species', one: 'The One', shiny: 'Shiny' };
export const KIND_HELP = {
  any: 'Takes every plush that no output claims by name.',
  none: 'Takes nothing: this output is switched off.',
  overflow: 'Takes plush only when every output that wants them is full.',
  undef: 'Takes the plush that no other output claims, so nothing is left to wait.',
  rarity: 'Takes plush of a rarity range, for example Rare and better.',
  species: 'Takes one chosen species.',
  one: 'Takes The One, and nothing else.',
  shiny: 'Takes shiny plush of any species.',
};
export const LOOKAHEAD = 0.34;   // a priority merger lets a busier lane claim the next gap when its first plush is this close to the end of its tile (one spacing)
export const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

// ---------------------------------------------------------------- rules
export const defaultRules = () => [[{ k: 'any' }], [{ k: 'any' }], [{ k: 'any' }]];
export const isPerm = (a) => Array.isArray(a) && a.length === 3 && [0, 1, 2].every((n) => a.includes(n));

const rarityOf = (sp) => (species[sp] ? species[sp].rarity : 0);
const rname = (r) => (RARITY[r] ? RARITY[r].name : 'The One');

// does a rule claim this plush by name (rarity, species, The One, shiny)? Any, None, Overflow and Undefined never claim anything by name.
export function matches(rule, item) {
  if (!rule || !item) return false;
  switch (rule.k) {
    case 'rarity': { const r = rarityOf(item.sp), lo = rule.v | 0, hi = rule.w === undefined ? 6 : rule.w; return r >= lo && r <= hi; }   // The One counts as rarity 6, so "Mythic and better" holds it
    case 'species': return item.sp === rule.v;
    case 'one': return item.sp === NEEDLE;
    case 'shiny': return (item.vr & 128) !== 0;
    default: return false;
  }
}

export function ruleName(r) {
  if (!r) return '?';
  switch (r.k) {
    case 'rarity': { const lo = r.v | 0, hi = r.w === undefined ? 6 : r.w; return lo === hi ? `${rname(lo)} only` : hi >= 6 ? (lo <= 0 ? 'Every rarity' : `${rname(lo)} and better`) : lo <= 0 ? `${rname(hi)} and worse` : `${rname(lo)} to ${rname(hi)}`; }
    case 'species': return species[r.v] ? species[r.v].name : `Species ${r.v}`;
    default: return KIND_NAMES[r.k] || String(r.k);
  }
}

// the lamp color of a rule on the splitter mesh (hex)
export function ruleColor(r) {
  if (!r) return 0x555a60;
  switch (r.k) {
    case 'any': return 0x66ff99; case 'none': return 0x4a4f55; case 'overflow': return 0xff9a3c; case 'undef': return 0x4ab8ff;
    case 'rarity': { const lo = Math.max(0, Math.min(5, r.v | 0)); return parseInt(RARITY[lo].color.slice(1), 16); }
    case 'species': return 0xffe066; case 'one': return 0xfff3a0; case 'shiny': return 0xff7bd5;
    default: return 0x888888;
  }
}

// a rule that can be saved and sent: known kind, only the numbers that kind uses (so two equal rules compare equal and nothing else rides along)
export function cleanRule(r) {
  if (!r || typeof r !== 'object' || !KINDS.includes(r.k)) return null;
  if (r.k === 'rarity') {
    const lo = r.v, hi = r.w === undefined ? 6 : r.w;
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || hi > 6 || lo > hi) return null;
    return hi === 6 ? { k: 'rarity', v: lo } : { k: 'rarity', v: lo, w: hi };
  }
  if (r.k === 'species') { const s = species[r.v]; if (!Number.isInteger(r.v) || !s || (r.v >= SPECIAL_MIN && !DECOYS.includes(r.v))) return null; return { k: 'species', v: r.v }; }   // a real species or one of the four fakes
  return { k: r.k };
}

// the rules of a splitter as three clean lists, or null. level 1 = Smart (one rule per output), 2 = Programmable (up to eight).
export function cleanRules(rules, level) {
  if (!Array.isArray(rules) || rules.length !== 3) return null;
  const out = [];
  for (const list of rules) {
    if (!Array.isArray(list) || list.length > (MAX_RULES[level] || 1)) return null;
    const c = [];
    for (const r of list) { const k = cleanRule(r); if (!k) return null; c.push(k); }
    out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------- the splitter: which outputs may take this plush, in order
// t: { rules, mode: 'rr' | 'prio', prio: [slot, slot, slot] (best first), def: -1..2, rr, orr }; slots: the output slots that have a tile; item: { sp, vr }
// Resolution: outputs that claim the plush by name; if none, outputs with Any; if none, outputs that take what nothing claims (Anything else, or the default output).
// Those are tried in turn (round robin from t.rr, or best priority first). Overflow outputs follow, but only after every one of those refused.
export function route(t, slots, item) {
  const rules = Array.isArray(t.rules) && t.rules.length === 3 ? t.rules : defaultRules();
  const exp = [], any = [], und = [], ovf = [];
  for (const s of slots) {
    let e = false, a = false, u = t.def === s, o = false;
    for (const r of rules[s] || []) {
      if (r.k === 'any') a = true; else if (r.k === 'undef') u = true; else if (r.k === 'overflow') o = true; else if (r.k !== 'none' && matches(r, item)) e = true;
    }
    if (e) exp.push(s); if (a) any.push(s); if (u) und.push(s); if (o) ovf.push(s);
  }
  const pool = exp.length ? exp : any.length ? any : und;
  const turn = (list, from) => list.slice().sort((x, y) => ((x - from + 3) % 3) - ((y - from + 3) % 3));
  const first = t.mode === 'prio' && isPerm(t.prio) ? pool.slice().sort((x, y) => t.prio.indexOf(x) - t.prio.indexOf(y)) : turn(pool, (t.rr | 0) % 3);
  const spill = turn(ovf.filter((s) => !pool.includes(s)), (t.orr | 0) % 3);
  return { order: first.concat(spill), primary: first.length };
}

// ---------------------------------------------------------------- the merger: which input lane pushes next
// ready[s]: lane s has a plush waiting at the end of its last tile. claim[s]: its first plush is within one spacing of the end and the line is live.
// Round robin: the next ready lane at or after `mrr`. Priority (lanes best first): the best lane that claims the gap takes it when it is ready; a lane
// that claims but is not there yet holds the gap for it (-1), so a lane below it never slips in front. Returns the lane, or -1.
export function mergePick(ready, claim, prio, mrr, lanes) {
  if (prio) {
    for (const s of (isPerm(lanes) ? lanes : [0, 1, 2])) if (claim[s]) return ready[s] ? s : -1;
    return -1;
  }
  for (let q = 0; q < 3; q++) { const s = ((mrr | 0) + q) % 3; if (ready[s]) return s; }
  return -1;
}

// the lane (0 back, 1 left, 2 right) a plush travelling in direction `from` arrives on a merger facing `dir`; -1 when it would be head on
export function laneOf(dir, from) { const rel = (from - dir + 4) & 3; return rel === 0 ? 0 : rel === 1 ? 1 : rel === 3 ? 2 : -1; }
