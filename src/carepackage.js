// Care Packages (DESIGN_SATISFACTORY.md, "Care Packages"). A small Courier Drone flies in with a crate, winches it down near the SORT bin (or the Depot
// nearest to you) and flies off. E on the crate (or walking into it) opens it and hands out helpful things.
//
//   When     one package every CARE.DAYS game days (the day counter, only in play, with the warehouse open, never while dead or in a menu), plus one package per
//            MILESTONES row (sales, rarities, first generator, depth, Plushdex share, the first tier of each upgrade branch). A milestone pays once (S.care.claimed).
//   What     TABLE is data: weight, quantity range, unlock gate. A roll takes 3 to 5 rows (a gold crate, 1 in 8 and always for a big milestone, takes 5 and carries
//            more plus one RARE thing). Cash is minutes of your income, never more than 15% of the cheapest upgrade you could buy. Nothing here can be The One.
//   Where    findSpot: the nearest clear floor spot around the base, never inside plush, a wall, a machine or the hall furniture.
//   Net      the host rolls, flies and opens; a guest sees the same drone and crate from the `xrow` rows of the type 'care' (catalog.js TYPES, registered below) and
//            opens one with the `careOpen` command. Items are the company's shared inventory (S.items), so whoever opens it, the pack is the same one.
//   Cost     nothing but a counter per frame while no drone flies and no crate stands (`tick` returns early; a 2 s poll watches the clock and the milestones).
//   Saves    S.care is plain JSON: the claimed ids, the schedule window, the queue, the crates on the ground and a drone in flight (which simply lands at load).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toI, toJ, toK } from './config.js';
import { TYPES } from './catalog.js';
import { recipes } from './crafting.js';
import { UPGRADES, CATS, FRAME_TYPES, isUnlocked } from './upgrades.js';
import { speciesCount, dexTally } from './plushdata.js';
import * as BINS from './bins.js';
import { mulberry32, fmt, clamp, escHtml } from './util.js';

// ------------------------------------------------------------------ tuning
export const CARE = {
  DAYS: 3,              // one scheduled package per this many game days
  GOLD_ODDS: 1 / 8,     // a gold crate
  POLL: 2,              // seconds between looks at the clock and the milestones
  REACH: 3.4,           // E reach to a crate (metres from the eye)
  WALK: 1.5,            // walking this close opens it
  NET_REACH: 6,         // the host accepts a guest's open within this many metres of where the guest is
  FAR: 40,              // deeper underground than this from the base and the crate waits at the bin
  MAX_CRATES: 6,        // crates standing at once; more packages wait in the queue
  MAX_QUEUE: 40,
  FLY_FROM: 110,        // metres out where the drone comes in and goes away
  ALT: 22,              // metres above the landing spot it cruises
  HOVER: 6.5,           // metres above the spot while it lowers the crate
  SPEED: 16,            // metres per second on the way in
  LOWER: 4.2,           // seconds of winching
  LEAVE: 6,             // seconds to climb and go
  CASH_MIN_S: 120, CASH_MAX_S: 300,   // cash is this many seconds of your income
  CASH_CAP: 0.15,       // ... never more than this share of the cheapest upgrade you can buy
  DISCOUNT: 0.10,
  CAP: 99,              // stack cap of anything not listed in CAPS
};
export const CAPS = { belt: 400, cable: 99, ramp: 99 };
export const capOf = (id) => CAPS[id] ?? CARE.CAP;
const T_A = CARE.FLY_FROM / CARE.SPEED, T_REL = T_A + CARE.LOWER, T_END = T_REL + CARE.LEAVE;
export const FLIGHT = { approach: T_A, release: T_REL, end: T_END };

// ------------------------------------------------------------------ the item table (data: tune here)
// kind 'item' (an S.items id), 'frame' (the best support the player has), 'cash', 'bat' (every bot's battery filled). need: the bench row that must exist (default the item id)
// or a function (X) => bool, X being the roll context. q: [min, max] before the progress scale. unique: never given twice. max: per roll.
export const TABLE = [
  { id: 'cash', kind: 'cash', name: 'Fluff', icon: '◈', w: 16, need: () => true },
  { id: 'medkit', kind: 'item', item: 'medkit', name: 'Medkit', icon: '🩹', w: 12, q: [1, 3] },
  { id: 'canister', kind: 'item', item: 'canister', name: 'Air Canister', icon: '🫧', w: 5, q: [1, 2] },
  { id: 'flare', kind: 'item', item: 'flare', name: 'Road Flare', icon: '🔥', w: 10, q: [2, 5] },
  { id: 'glow', kind: 'item', item: 'glow', name: 'Glow Stick', icon: '🟢', w: 10, q: [3, 8] },
  { id: 'marker', kind: 'item', item: 'marker', name: 'Survey Marker', icon: '🚩', w: 4, q: [2, 6] },
  { id: 'lantern', kind: 'item', item: 'lantern', name: 'Work Lantern', icon: '🏮', w: 9, q: [2, 6] },
  { id: 'hlamp', kind: 'item', item: 'hlamp', name: 'Hanging Lantern', icon: '🏮', w: 8, q: [1, 3] },
  { id: 'cable', kind: 'item', item: 'cable', name: 'Power Cable', icon: '🔌', w: 10, q: [2, 6] },
  { id: 'pole', kind: 'item', item: 'pole', name: 'Power Pole', icon: '⚡', w: 5, q: [1, 2] },
  { id: 'belt', kind: 'item', item: 'belt', name: 'Conveyor Belt', icon: '🛤️', w: 11, q: [10, 30] },
  { id: 'ramp', kind: 'item', item: 'ramp', name: 'Belt Ramp', icon: '📐', w: 4, q: [2, 6] },
  { id: 'strut', kind: 'item', item: 'strut', name: 'Strut', icon: '🪜', w: 9, q: [3, 8] },
  { id: 'jack', kind: 'item', item: 'jack', name: 'Hydraulic Jack', icon: '🛠️', w: 6, q: [1, 4] },
  { id: 'frame', kind: 'frame', name: 'Support Frame', icon: '🧱', w: 9, q: [1, 3], need: (X) => X.frames.length > 0 },
  { id: 'bulk', kind: 'item', item: 'bulk', name: 'Bulkhead Panel', icon: '🪧', w: 3, q: [4, 12] },
  { id: 'dynamite', kind: 'item', item: 'dynamite', name: 'Dynamite', icon: '🧨', w: 7, q: [2, 6] },
  { id: 'charge', kind: 'item', item: 'charge', name: 'Blasting Charge', icon: '🧨', w: 5, q: [1, 3] },
  { id: 'rope', kind: 'item', item: 'rope', name: 'Rope Anchor', icon: '🪢', w: 4, q: [1, 2] },
  { id: 'chargepack', kind: 'item', item: 'chargepack', name: 'Charge Pack', icon: '🔋', w: 6, q: [1, 2] },
  { id: 'bat', kind: 'bat', name: 'Bot Battery Set', icon: '🔋', w: 6, q: [1, 1], need: (X) => X.bots > 0 },
  // a first cart for someone who has none: a unique item, never given when you own one
  { id: 'cart1', kind: 'item', item: 'cart:1', name: 'Wheelbarrow', icon: '🛒', w: 14, q: [1, 1], unique: true, need: (X) => X.has('cart:1') && !X.hasCart },
];
// the rare thing in a gold crate (one of these). Every crate that is gold gets exactly one; Instant Haul has no gate, so it always has one to give.
export const RARE = [
  { id: 'haul', kind: 'haul', name: 'Instant Haul', icon: '⚡', w: 5, desc: 'sells what you carry right now, at the bin price' },
  { id: 'rig', kind: 'item', item: 'claw', name: 'Free Claw Rig', icon: '🦾', w: 3, q: [1, 1], need: (X) => X.has('claw') },
  { id: 'batset', kind: 'bat', name: 'Bot Battery Set', icon: '🔋', w: 4, need: (X) => X.bots > 0 },
  { id: 'disc', kind: 'disc', name: 'Upgrade Discount', icon: '🏷️', w: 5, need: (X) => !(X.S.care && X.S.care.disc > 0) && X.nextCost > 0, desc: '10% off your next upgrade' },
];

// ------------------------------------------------------------------ milestones (data)
const earn = (v) => ({ id: 'earn' + v, name: `Earn ◈ ${fmt(v)}`, icon: '🪙', goal: v, big: v >= 1e7, val: (P) => P.e, num: true });
export const MILESTONES = [
  ...[1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9].map(earn),
  { id: 'rare', name: 'Find a Rare plush', icon: '🔷', goal: 1, val: (P) => P.r[2] },
  { id: 'epic', name: 'Find an Epic plush', icon: '🟣', goal: 1, val: (P) => P.r[3] },
  { id: 'legend', name: 'Find a Legendary plush', icon: '🟠', goal: 1, big: true, val: (P) => P.r[4] },
  { id: 'gen1', name: 'Place your first generator', icon: '🔥', goal: 1, val: (P) => P.gen },
  ...[50, 100, 200].map((m) => ({ id: 'depth' + m, name: `Reach ${m} m deep`, icon: '🕳️', goal: m, big: m >= 200, val: (P) => P.dp, unit: ' m' })),
  ...[10, 25, 50, 75, 100].map((p) => ({ id: 'dex' + p, name: `Plushdex ${p}%`, icon: '📖', goal: p, big: p >= 75, val: (P) => P.dx, unit: '%' })),
  ...CATS.filter((c) => !c.special).map((c) => ({ id: 'br_' + c.id, name: `First ${c.name} upgrade`, icon: c.icon, goal: 1, val: (P) => (P.br.includes(c.id) ? 1 : 0) })),
];
export const msById = (id) => MILESTONES.find((m) => m.id === id);

// ------------------------------------------------------------------ state
const day = (g) => g.dayNumber();
export const windowOf = (d) => Math.floor((d - 1) / CARE.DAYS);
const EMPTY = Object.freeze({ claimed: {}, opened: {}, queue: [], crates: [], drone: null, disc: 0, win: 0, prog: null });
export const stateOf = (g) => (g.S && g.S.care) || EMPTY;   // read only (the log, markers): never creates

export function progressOf(S) {
  const rar = (S.stats && S.stats.rar) || [];
  const dx = dexTally(S.dex || {}).n;
  const br = [];
  for (const u of UPGRADES) if ((S.up[u.id] || 0) > 0 && u.cat && !br.includes(u.cat)) br.push(u.cat);
  let gen = 0; for (const e of S.entities || []) if (e.type === 'gen' && !e.free) { gen = 1; break; }
  return { e: S.totalEarned || 0, r: [0, 1, 2, 3, 4].map((q) => rar[q] || 0), dp: (S.stats && S.stats.maxDepth) || 0, dx: Math.floor((dx / speciesCount) * 1000) / 10, gen, br };
}
const msValue = (m, P) => (P ? m.val(P) : 0);
const msDone = (m, P) => msValue(m, P) >= m.goal;

function fresh() { return { v: 1, claimed: {}, opened: {}, win: 0, queue: [], crates: [], drone: null, disc: 0, rate: 0, n: 1, count: 0, prog: null, sched: 0 }; }

// the S.care of the host (created once). A save from before care packages that already met milestones is paid once, as ONE gold backlog package.
export function ensure(g) {
  const S = g.S;
  let C = S.care;
  if (!C || typeof C !== 'object') {
    C = S.care = fresh();
    C.win = windowOf(day(g));
    const P = C.prog = progressOf(S), ids = [];
    for (const m of MILESTONES) if (msDone(m, P)) { C.claimed[m.id] = 1; ids.push(m.id); }
    if (ids.length) C.queue.push({ k: 'ms', ids, big: true });
    const ps = S.stats ? S.stats.playSecs || 0 : 0;
    C.rate = (S.totalEarned || 0) / Math.max(120, ps);
  }
  for (const k of ['claimed', 'opened']) if (!C[k] || typeof C[k] !== 'object' || Array.isArray(C[k])) C[k] = {};
  for (const k of ['queue', 'crates']) if (!Array.isArray(C[k])) C[k] = [];
  for (const k of ['disc', 'rate', 'n', 'count', 'win', 'sched']) if (!Number.isFinite(C[k])) C[k] = k === 'n' ? 1 : 0;
  if (C.drone && typeof C.drone !== 'object') C.drone = null;
  return C;
}

// ------------------------------------------------------------------ rolling a package
export function rollContext(g) {
  const S = g.S, T = g.T || {}, ids = new Set(recipes(g).map((r) => r.id));
  let nextCost = 0;
  for (const u of UPGRADES) { const l = S.up[u.id] || 0; if (l >= u.max || !isUnlocked(u, S.up, S)) continue; const c = u.cost[l]; if (c > 0 && (!nextCost || c < nextCost)) nextCost = c; }
  const frames = (T.frames || []).filter((k) => FRAME_TYPES[k]);
  const hasCart = !!S.cart || !!S.gcart || Object.keys(S.items || {}).some((k) => k.startsWith('cart:') && S.items[k] > 0);
  const prog = clamp(Math.log10(1 + (S.totalEarned || 0)) / 9 * 0.6 + ((S.stats && S.stats.upgrades) || 0) / 80 * 0.4, 0, 1);
  const rate = Math.max((S.care && S.care.rate) || 0, 0);
  return { g, S, T, has: (id) => ids.has(id), nextCost, frames, hasCart, bots: (S.crew || []).length, prog, rate };
}
const eligible = (e, X) => {
  if (e.need) return typeof e.need === 'function' ? !!e.need(X) : X.has(e.need);
  if (e.unique && (X.S.items[e.item] | 0) > 0) return false;
  return e.kind === 'item' ? X.has(e.item) : true;
};
function pickWeighted(list, rng) {
  let t = 0; for (const e of list) t += e.w;
  let r = rng() * t;
  for (let i = 0; i < list.length; i++) { r -= list[i].w; if (r < 0) return i; }
  return list.length - 1;
}
export function cashFor(X, rng, gold) {
  let raw = X.rate * (CARE.CASH_MIN_S + rng() * (CARE.CASH_MAX_S - CARE.CASH_MIN_S)) * (gold ? 1.8 : 1);
  raw = Math.max(raw, 12);
  if (X.nextCost > 0) raw = Math.min(raw, X.nextCost * CARE.CASH_CAP);
  return Math.floor(raw);
}
const qtyOf = (e, X, rng, gold) => {
  const q = e.q || [1, 1];
  let n = (q[0] + rng() * (q[1] - q[0])) * (1 + 1.5 * X.prog) * (gold ? 1.75 : 1);
  if (q[1] === 1) n = 1;
  return clamp(Math.round(n), 1, Math.min(e.max || 1e9, e.item ? capOf(e.item) : CARE.CAP));
};
// a package: { gold, items: [[id, n]], fx: [[kind, value]] }. Pure given the game state and rng, so a seeded roll can be tested.
export function rollPack(g, rng, o = {}) {
  const X = o.X || rollContext(g);
  const gold = o.gold !== undefined ? !!o.gold : o.big ? true : rng() < CARE.GOLD_ODDS;
  const bag = TABLE.filter((e) => eligible(e, X));
  const want = gold ? 5 : 3 + ((rng() * 3) | 0);
  const items = [], fx = [], used = new Set();
  let guard = 0;
  while ((items.length + fx.length) < want && bag.length && guard++ < 40) {
    const e = bag.splice(pickWeighted(bag, rng), 1)[0];
    const n = qtyOf(e, X, rng, gold);
    if (e.kind === 'cash') { const c = cashFor(X, rng, gold); if (c >= 1) fx.push(['cash', c]); }
    else if (e.kind === 'bat') fx.push(['bat', 1]);
    else if (e.kind === 'frame') { const ks = X.frames.slice(-2), k = ks[rng() < 0.65 ? ks.length - 1 : 0]; const id = 'frame:' + k; if (!used.has(id)) { used.add(id); items.push([id, n]); } }
    else if (!used.has(e.item)) { used.add(e.item); items.push([e.item, n]); }
  }
  if (gold) {
    const rare = RARE.filter((e) => eligible(e, X));
    const e = rare.length ? rare[pickWeighted(rare, rng)] : RARE[0];
    if (e.kind === 'haul') { const hv = Math.max(1, Math.floor(X.rate * 30)); fx.push(['haul', X.nextCost > 0 ? Math.min(hv, Math.max(1, Math.floor(X.nextCost * CARE.CASH_CAP))) : hv]); }   // (the same 15% cap as cash: the bonus is not a way round it)
    else if (e.kind === 'bat') fx.push(['bat', 1]);
    else if (e.kind === 'disc') fx.push(['disc', CARE.DISCOUNT]);
    else if (!used.has(e.item)) { used.add(e.item); items.push([e.item, 1]); }
    else items.push([e.item, 1]);
  }
  if (!items.length && !fx.length) { const c = cashFor(X, rng, gold); fx.push(['cash', Math.max(1, c)]); }
  return { gold, items, fx };
}

export function nameOf(id) {
  if (id.startsWith('frame:')) return (FRAME_TYPES[id.slice(6)] || { name: id }).name;
  const e = TABLE.find((t) => t.item === id) || RARE.find((t) => t.item === id);
  return e ? e.name : id;
}
export function describePack(p) {
  const out = [];
  for (const [k, v] of p.fx || []) out.push(k === 'cash' ? `◈ ${fmt(v)}` : k === 'bat' ? 'Bot Battery Set' : k === 'haul' ? 'Instant Haul' : k === 'disc' ? `${Math.round(v * 100)}% off your next upgrade` : k);
  for (const [id, n] of p.items || []) out.push(`${nameOf(id)}${n > 1 ? ' x' + n : ''}`);
  return out.join(', ');
}

// ------------------------------------------------------------------ where it lands
const _v = new THREE.Vector3();
function clearAt(g, x, y, z, fine) {
  // fine: the crate's own footprint (0.9 m) and three rows (a narrow tunnel); otherwise a 3 by 3 footprint, four rows high (open floor)
  const w = g.world, j0 = Math.max(0, toJ(y + 0.05)), rows = fine ? 3 : 4;
  const ia = fine ? toI(x - 0.46) : toI(x) - 1, ib = fine ? toI(x + 0.46) : toI(x) + 1, ka = fine ? toK(z - 0.46) : toK(z) - 1, kb = fine ? toK(z + 0.46) : toK(z) + 1;
  const i = toI(x), k = toK(z);
  for (let kk = ka; kk <= kb; kk++) for (let ii = ia; ii <= ib; ii++) {
    for (let dj = 0; dj < rows; dj++) if (!w.inside(ii, j0 + dj, kk) || w.get(ii, j0 + dj, kk) !== 0) return false;
    if (fine && j0 > 0 && w.get(ii, j0 - 1, kk) === 0) return false;   // the whole footprint stands on something
  }
  if (j0 > 0 && w.get(i, j0 - 1, k) === 0) return false;   // something to stand on
  for (const c of g.hall.colliders || []) if (Math.hypot(x - c.x, z - c.z) < (c.r || 1) + (fine ? 0.6 : 0.95)) return false;
  for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) for (let dj = 0; dj < 2; dj++) if (g.logi.tileAt(i + di, j0 + dj, k + dk)) return false;
  for (const it of g.machines.items.values()) {
    const e = it.ent, ex = e.cx ?? e.px ?? e.x, ez = e.cz ?? e.pz ?? e.z;
    if (Number.isFinite(ex + ez) && Math.hypot(x - ex, z - ez) < 1.5 + (e.hr || 0) && Math.abs((e.y0 ?? e.y ?? 0) - y) < 4) return false;
  }
  for (const c of g.S.care ? g.S.care.crates : []) if (Math.hypot(x - c.x, z - c.z) < 1.6) return false;
  return true;
}
// the base the drone serves: the bin (the SORT bin or a powered Depot Beacon) nearest to you; the hall's own when you are deep underground
export function baseFor(g, hall = false) {
  const hb = BINS.hallBin(g), p = g.player.pos;
  let best = hb, bd = Math.hypot(hb.x - p.x, hb.z - p.z);
  if (!hall) for (const b of BINS.listBins(g)) { if (!BINS.usable(b)) continue; const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bd) { bd = d; best = b; } }
  return best;
}
// the nearest clear floor spot around a base, preferring the side you stand on. { x, y, z }, or the base itself when nothing around it is clear
export function findSpot(g, base, toward) {
  const y0 = base.y || 0, ang0 = toward ? Math.atan2(toward.z - base.z, toward.x - base.x) : Math.PI / 2;
  for (let r = 2.6; r <= 32; r += 0.6) {
    const n = Math.max(8, Math.round(r * 3));
    for (let a = 0; a < n; a++) {
      const th = ang0 + (a % 2 ? 1 : -1) * Math.ceil(a / 2) * (Math.PI * 2 / n);
      const x = base.x + Math.cos(th) * r, z = base.z + Math.sin(th) * r;
      if (clearAt(g, x, y0, z)) return { x, y: y0, z };
    }
  }
  // a tunnel too narrow for a 3 by 3 footprint (a Depot in a two cell tunnel): the crate's own footprint, searched in finer steps
  for (let r = 1.2; r <= 32; r += 0.3) {
    const n = Math.max(12, Math.round(r * 2 * Math.PI / 0.22));
    for (let a = 0; a < n; a++) {
      const th = ang0 + (a % 2 ? 1 : -1) * Math.ceil(a / 2) * (Math.PI * 2 / n);
      const x = base.x + Math.cos(th) * r, z = base.z + Math.sin(th) * r;
      if (clearAt(g, x, y0, z, true)) return { x, y: y0, z };
    }
  }
  return { x: base.x, y: y0, z: base.z, blocked: true };   // (the bin or beacon stands on open floor: better there than inside rock)
}

// ------------------------------------------------------------------ the host side
export const ready = (g) => g.mode === 'play' && !g.dead && !g.blacking && !(g.S && g.S.ending) && !(g.ui && g.ui.isModalOpen && g.ui.isModalOpen()) && g.isOpen();

const rtOf = (g) => {
  let rt = g._care;
  if (rt && rt.S === g.S) return rt;
  if (rt) retire(g, rt);
  rt = g._care = { S: g.S, pt: 1, clk: 0, rev: 1, sentRev: 0, hb: 0, nt: 0, view: null, hum: null, seen: null, lastE: null, lastClk: 0, armed: new Map(), cool: new Map(), hinted: new Set(), live: false };
  const C = g.S.care;
  if (C && !g.isGuest() && C.view) adopt(g, C);   // a guest's picture of the host's crates, now that the host is gone
  if (C && !g.isGuest() && C.drone) { if (!C.drone.released) { C.drone.age = T_REL; release(g, C.drone, true); } C.drone = null; }   // a drone in the air when the game was saved simply lands
  return rt;
};
const bump = (g) => { const rt = g._care; if (rt) rt.rev++; };

function announce(g, t) {
  if (g.ui) g.ui.toast(t);
  g.netSend({ t: 'toast', icon: t.icon, title: t.title, text: t.text });
}
const BEAR = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export function whereText(g, x, z) {
  const p = g.player.pos, d = Math.hypot(x - p.x, z - p.z);
  const b = ((Math.atan2(x - p.x, -(z - p.z)) * 180 / Math.PI) % 360 + 360) % 360;
  return d < 4 ? 'right next to you' : `about ${Math.round(d / 5) * 5} m ${BEAR[Math.round(b / 45) % 8]} of you`;
}

function chime(g) {   // the alert to you: two soft rising notes (not placed in the world: it is for whoever plays)
  const s = g.sound; if (!s || !s.tone) return;
  [660, 880, 1320].forEach((f, i) => s.tone('triangle', f, f, 0.38, 0.09, i * 0.11));
}
function landSound(g, x, y, z, gold) {
  const s = g.sound && g.sound.at ? g.sound.at(x, y + 0.4, z, 'fall') : null;
  if (s && s.audible) { s.thump(0.28, 110); }
  const p = g.sound && g.sound.at ? g.sound.at(x, y + 0.6, z, 'ping') : null;
  if (p && p.audible) [880, 1175, gold ? 1760 : 1568].forEach((f, i) => p.tone('sine', f, f, 0.5, 0.1, 0.1 + i * 0.1));
  if (g.fx && g.fx.sparkle) g.fx.sparkle(x, y + 0.6, z, gold ? 28 : 16, 1, gold ? 0.82 : 0.9, gold ? 0.25 : 0.5);
}

// one pending package leaves the queue and a drone takes off with it (host)
export function dispatch(g, q, o = {}) {
  const C = ensure(g), S = g.S;
  rtOf(g);   // (so a drone started before the first frame is not "a drone from the save" that lands at once)
  const rng = mulberry32((S.seed ^ Math.imul(C.n + 7, 2654435761)) >>> 0);
  let base = baseFor(g);
  const p = g.player.pos;
  const deep = !o.here && g.coverDepth() > 0 && Math.hypot(base.x - p.x, base.z - p.z) > CARE.FAR;
  if (deep) base = baseFor(g, true);
  const spot = findSpot(g, base, p);
  const ms = q.ids || (q.id ? [q.id] : []);
  const pack = rollPack(g, rng, { big: !!q.big, gold: q.gold });
  const d = { id: C.n++, tx: spot.x, ty: spot.y, tz: spot.z, ang: rng() * Math.PI * 2, ang2: rng() * Math.PI * 2, age: o.age || 0, gold: pack.gold ? 1 : 0, pack, ms, wait: deep ? 1 : 0, released: 0 };
  C.drone = d; C.sched = (C.sched || 0) + (q.k === 'day' ? 1 : 0);
  bump(g);
  const what = q.k === 'day' ? 'Scheduled delivery' : ms.length > 1 ? 'Milestones reached' : `Milestone: ${(msById(ms[0]) || { name: 'reached' }).name}`;
  if (!deep && !o.quiet) { announce(g, { icon: '🚁', title: pack.gold ? 'Gold care package inbound' : 'Care package inbound', text: `${what}. The courier drone is coming in ${base.kind === 'hall' ? 'to the SORT bin' : 'to ' + escHtml(base.name)}. Look up.`, ms: 6500 }); chime(g); }
  return d;
}

function release(g, d, quiet) {
  const C = g.S.care;
  const cr = { id: d.id, x: d.tx, y: d.ty, z: d.tz, gold: d.gold ? 1 : 0, items: d.pack.items.map((a) => a.slice()), fx: d.pack.fx.map((a) => a.slice()), ms: d.ms || [], wait: d.wait ? 1 : 0 };
  C.crates.push(cr); d.released = 1;
  bump(g);
  if (!quiet) {
    landSound(g, cr.x, cr.y, cr.z, cr.gold);
    const where = whereText(g, cr.x, cr.z);
    announce(g, d.wait
      ? { icon: '📦', title: 'Care package waiting at the bin', text: 'The drone left it at the SORT bin while you were deep underground. It stays there until you come for it.', ms: 7500 }
      : { icon: cr.gold ? '🎁' : '📦', title: cr.gold ? 'Gold care package landed' : 'Care package landed', text: `${where}. Press E on the crate or walk into it.`, ms: 7000 });
  }
  return cr;
}

// turn a queue of triggers into packages (host, every POLL seconds)
function poll(g, rt) {
  const S = g.S, C = ensure(g);
  const ok = ready(g);
  // income: a slow average of what is earned per second, for the cash in a crate
  const E = S.totalEarned || 0;
  if (rt.lastE === null) { rt.lastE = E; rt.lastClk = rt.clk; }
  else if (rt.clk - rt.lastClk >= 20) { const inst = Math.max(0, (E - rt.lastE) / (rt.clk - rt.lastClk)); C.rate = C.rate > 0 ? C.rate * 0.7 + inst * 0.3 : inst; rt.lastE = E; rt.lastClk = rt.clk; }
  // milestones: each pays once
  const P = C.prog = progressOf(S);
  for (const m of MILESTONES) {
    if (C.claimed[m.id] || !msDone(m, P)) continue;
    C.claimed[m.id] = 1;
    if (C.queue.length < CARE.MAX_QUEUE) C.queue.push({ k: 'ms', ids: [m.id], big: !!m.big });
    bump(g);
  }
  // the schedule: one per window of CARE.DAYS days, only while the warehouse is open and you are playing
  const w = windowOf(day(g));
  if (ok && w > C.win) { C.win = w; if (C.queue.length < CARE.MAX_QUEUE) C.queue.push({ k: 'day' }); bump(g); }
  if (ok && !C.drone && C.queue.length && C.crates.length < CARE.MAX_CRATES) dispatch(g, C.queue.shift());
}

// ------------------------------------------------------------------ opening
function applyFx(g, kind, v, opener) {
  const S = g.S, C = S.care;
  if (kind === 'cash') { S.money += v; if (g.ui) { g.ui.setMoney(S.money); if (opener !== 'g') g.ui.gain(v); } return true; }
  if (kind === 'bat') { for (const b of S.crew || []) b.battery = 1; return true; }
  if (kind === 'disc') { if (C.disc > 0) return false; C.disc = v; return true; }
  if (kind === 'haul') {
    if (v > 0) { S.money += v; if (g.ui) g.ui.setMoney(S.money); }
    if (opener === 'g') g.netSend({ t: 'xrow', k: 'care', d: { ev: 'haul' } });
    else if (S.carry.length && g.sellAll) g.sellAll();
    return true;
  }
  return true;
}
// put what fits into the shared inventory; what does not fit stays in the crate. Returns the text of what was handed over.
// whose bag a pack goes in: today the company has one (S.items). When the per-player bags of DESIGN_SATISFACTORY.md section 19 exist (S.ginv, the guest's), a guest's pack goes there.
export const invFor = (g, opener) => { const S = g.S; if (opener === 'g' && S.ginv && typeof S.ginv === 'object') return S.ginv; S.items = S.items || {}; return S.items; };
// a cart of any tier, in a bag or out on the floor, means you own one (the first cart is for someone who has none)
const ownsCart = (g, inv) => !!(g.S.cart || g.S.gcart) || [inv, g.S.items || {}].some((b) => Object.keys(b).some((k) => k.startsWith('cart:') && b[k] > 0));
export function grant(g, cr, opener = 'h') {
  const S = g.S, got = [], inv = invFor(g, opener);
  const items = [];
  for (const it of cr.items) {
    const [id, n] = it, have = inv[id] | 0, room = Math.max(0, capOf(id) - have);
    const unique = TABLE.some((t) => t.item === id && t.unique);
    const give = unique && ownsCart(g, inv) ? 0 : Math.min(n, room);
    if (give > 0) { inv[id] = have + give; got.push([id, give]); }
    if (n - give > 0 && !unique) items.push([id, n - give]);   // (a unique thing that is not wanted is gone, not left to hold the crate shut for ever)
  }
  cr.items = items;
  const fx = [];
  const gotFx = [];
  for (const f of cr.fx) { if (applyFx(g, f[0], f[1], opener)) gotFx.push(f); else fx.push(f); }
  cr.fx = fx;
  if (got.length && g.rebuildTools) g.rebuildTools();
  return { items: got, fx: gotFx };
}
export function openCrate(g, id, opener = 'h') {
  const C = g.S.care; if (!C) return { ok: false, why: 'none' };
  const i = C.crates.findIndex((c) => c.id === id);
  if (i < 0) return { ok: false, why: 'gone' };
  const cr = C.crates[i], pack = grant(g, cr, opener);
  const gave = pack.items.length || pack.fx.length;
  const text = describePack(pack) || 'Nothing you still need.';
  const empty = !cr.items.length && !cr.fx.length;
  const rt = g._care;
  if (!gave && !empty) { if (rt) rt.cool.set(id, rt.clk + 6); return { ok: false, why: 'full' }; }
  if (empty) { C.crates.splice(i, 1); for (const m of cr.ms || []) C.opened[m] = 1; C.count = (C.count | 0) + 1; if (rt) { rt.armed.delete(id); rt.cool.delete(id); rt.hinted.delete(id); } }
  bump(g);
  const icon = cr.gold ? '🎁' : '📦';
  const mine = { icon, title: cr.gold ? 'Gold care package opened' : 'Care package opened', text: (empty ? '' : 'Some of it did not fit; the rest stays in the crate. ') + text, ms: 8000 };
  const theirs = { icon, title: 'Your friend opened a care package', text, ms: 6000 };
  if (opener === 'g') { g.netSend({ t: 'toast', ...mine }); if (g.ui) g.ui.toast(theirs); }
  else { if (g.ui) g.ui.toast(mine); g.netSend({ t: 'toast', ...theirs }); }
  if (g.sound && opener !== 'g') g.sound.ach();
  if (g.fx && g.fx.sparkle) g.fx.sparkle(cr.x, cr.y + 0.7, cr.z, cr.gold ? 30 : 16, 1, cr.gold ? 0.85 : 0.9, cr.gold ? 0.3 : 0.5);
  if (g.sendShared && g.net && g.net.open && g.net.role === 'host') g.sendShared();
  return { ok: true, empty, pack, text };
}
// the guest command `careOpen` { id }: idempotent (a crate that is gone does nothing) and refused unless a real crate stands within reach of where the guest is
export function guestOpen(g, d) {
  if (g.isGuest()) return { ok: false, why: 'guest' };
  if (!d || typeof d !== 'object' || !Number.isInteger(d.id)) return { ok: false, why: 'bad' };
  const C = g.S.care, cr = C && C.crates.find((c) => c.id === d.id);
  if (!cr) return { ok: false, why: 'gone' };
  const rp = g.remote && g.remote.pos;
  if (!rp || !Number.isFinite(rp.x + rp.y + rp.z)) return { ok: false, why: 'nobody' };
  if (Math.hypot(rp.x - cr.x, rp.z - cr.z) > CARE.NET_REACH || Math.abs(rp.y - cr.y) > 5) return { ok: false, why: 'far' };
  return openCrate(g, d.id, 'g');
}

// ------------------------------------------------------------------ E, walking into it, the compass
const _fw = new THREE.Vector3(), _eye = new THREE.Vector3();
export function crateAim(g) {
  const C = stateOf(g); if (!C.crates.length) return null;
  const eye = g.player.eyePos(_eye), dir = g.player.forward(_fw);
  let best = null, bd = CARE.REACH;
  for (const c of C.crates) {
    _v.set(c.x - eye.x, c.y + 0.45 - eye.y, c.z - eye.z); const d = _v.length();
    if (d > bd) continue;
    if (d > 1.7 && _v.normalize().dot(dir) < 0.78) continue;
    bd = d; best = c;
  }
  return best;
}
export function useKey(g) {
  const c = crateAim(g); if (!c) return false;
  if (g.isGuest()) { g.cmd('careOpen', { id: c.id }); return true; }
  const r = openCrate(g, c.id, 'h');
  if (!r.ok && r.why === 'full') { g.sound.error(); g.ui.hint('Your pack is already full of what is in the crate. Use some up and come back.', 3.5); }
  return true;
}
const EMPTY_M = [];
export function markers(g, pos) {
  const C = stateOf(g); if (!C.crates.length) return EMPTY_M;
  const out = [];
  for (const c of C.crates) {
    const d = Math.hypot(c.x - pos.x, c.z - pos.z);
    out.push({ b: ((Math.atan2(c.x - pos.x, -(c.z - pos.z)) * 180 / Math.PI) % 360 + 360) % 360, label: c.gold ? 'GOLD' : 'CARE', color: c.gold ? '#ffd24d' : '#7ee7ff', d });
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, 3);
}
// upgrades: the discount from a gold crate shows in the price and is used up by the next purchase
export function priceOf(g, cost) { const d = stateOf(g).disc; return d > 0 ? Math.max(1, Math.round(cost * (1 - d))) : cost; }
export function paid(g) { const C = g.S.care; if (C && C.disc > 0) { C.disc = 0; bump(g); } }

// ------------------------------------------------------------------ the picture (shared by host and guest)
const GEO = { built: false };
function col(geo, hex) { const n = geo.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color(hex); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; }
const bx = (w, h, d, x, y, z, hex, ry = 0) => { const q = new THREE.BoxGeometry(w, h, d); if (ry) q.rotateY(ry); q.translate(x, y, z); return col(q, hex); };
function build() {
  if (GEO.built) return GEO;
  const crate = (wood, slat, ribbon, bow) => mergeGeometries([bx(0.9, 0.9, 0.9, 0, 0.45, 0, wood), bx(0.93, 0.07, 0.93, 0, 0.12, 0, slat), bx(0.93, 0.07, 0.93, 0, 0.78, 0, slat),
    bx(0.15, 0.93, 0.93, 0, 0.465, 0, ribbon), bx(0.93, 0.93, 0.15, 0, 0.465, 0, ribbon), bx(0.3, 0.07, 0.1, -0.1, 0.99, 0, bow, 0.6), bx(0.3, 0.07, 0.1, 0.1, 0.99, 0, bow, -0.6)]);
  GEO.crate = crate(0xa4743f, 0x7d5528, 0xd8302f, 0xe84a3a);
  GEO.gold = crate(0xf2b933, 0xc2861c, 0x7a2fc4, 0x9a52e6);
  const parts = [bx(0.46, 0.12, 0.46, 0, 0, 0, 0x2c313a), bx(0.3, 0.09, 0.3, 0, 0.1, 0, 0xff8a1f), bx(1.12, 0.04, 0.07, 0, 0.02, 0, 0x20242b, Math.PI / 4), bx(1.12, 0.04, 0.07, 0, 0.02, 0, 0x20242b, -Math.PI / 4),
    bx(0.12, 0.1, 0.12, 0, -0.1, 0, 0x8a919c), bx(0.06, 0.06, 0.04, 0, 0.02, 0.24, 0xff3b30), bx(0.5, 0.03, 0.03, 0, -0.13, 0.2, 0x20242b), bx(0.5, 0.03, 0.03, 0, -0.13, -0.2, 0x20242b)];
  const rot = [], disc = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    parts.push(col(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8).translate(sx * 0.4, 0.06, sz * 0.4), 0x555b66));
    disc.push(new THREE.CircleGeometry(0.34, 20).rotateX(-Math.PI / 2).translate(sx * 0.4, 0.14, sz * 0.4));
  }
  GEO.drone = mergeGeometries(parts); GEO.rotors = mergeGeometries(disc);
  GEO.cable = new THREE.BoxGeometry(0.02, 1, 0.02).translate(0, -0.5, 0);
  GEO.beam = new THREE.CylinderGeometry(0.07, 0.42, 1, 12, 1, true).translate(0, 0.5, 0);
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d');
  cx.clearRect(0, 0, 64, 64); cx.strokeStyle = 'rgba(220,240,255,0.9)'; cx.lineWidth = 3;
  for (let a = 0; a < 3; a++) { cx.beginPath(); cx.arc(32, 32, 10 + a * 8, a, a + 1.5); cx.stroke(); }
  GEO.tex = new THREE.CanvasTexture(cv); GEO.tex.center.set(0.5, 0.5);
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.25, ...o });
  GEO.mCrate = std({ emissive: 0x2a1a08, emissiveIntensity: 0.6 });
  GEO.mGold = std({ roughness: 0.35, metalness: 0.7, emissive: 0x8a5a00, emissiveIntensity: 0.9 });
  GEO.mDrone = std({ emissive: 0x15181c, emissiveIntensity: 0.8 });
  GEO.mRotor = new THREE.MeshBasicMaterial({ map: GEO.tex, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  GEO.mCable = new THREE.MeshBasicMaterial({ color: 0x1b1d22 });
  GEO.mBeam = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  GEO.mBeamG = new THREE.MeshBasicMaterial({ color: 0xffd24d, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  GEO.built = true;
  return GEO;
}
export function disposeGeo() {
  if (!GEO.built) return;
  for (const k of Object.keys(GEO)) { const o = GEO[k]; if (o && o.dispose) o.dispose(); }
  for (const k of Object.keys(GEO)) delete GEO[k];
  GEO.built = false;
}

const ease = (t) => 1 - (1 - t) * (1 - t), smooth = (t) => t * t * (3 - 2 * t), lerp = (a, b, t) => a + (b - a) * t;
// where the drone is (and the crate under it) at an age in seconds. o: { x, y, z, yaw, crate: y of the hanging crate or null, cable: its length }
export function dronePose(d, age, o = {}) {
  const sx = d.tx + Math.cos(d.ang) * CARE.FLY_FROM, sz = d.tz + Math.sin(d.ang) * CARE.FLY_FROM, sy = d.ty + CARE.ALT;
  const ex = d.tx + Math.cos(d.ang2) * CARE.FLY_FROM, ez = d.tz + Math.sin(d.ang2) * CARE.FLY_FROM;
  const hy = d.ty + CARE.HOVER;
  if (age < T_A) {
    const u = ease(clamp(age / T_A, 0, 1));
    o.x = lerp(sx, d.tx, u); o.z = lerp(sz, d.tz, u); o.y = lerp(sy, hy, u); o.yaw = Math.atan2(d.tx - sx, d.tz - sz); o.crate = o.y - 1.1;
  } else if (age < T_REL) {
    const u = smooth((age - T_A) / CARE.LOWER);
    o.x = d.tx; o.z = d.tz; o.y = hy + Math.sin(age * 2.4) * 0.05; o.yaw = Math.atan2(d.tx - sx, d.tz - sz); o.crate = lerp(hy - 1.1, d.ty, u);
  } else {
    const u = clamp((age - T_REL) / CARE.LEAVE, 0, 1), v = u * u;
    o.x = lerp(d.tx, ex, v); o.z = lerp(d.tz, ez, v); o.y = lerp(hy, sy, v); o.yaw = Math.atan2(ex - d.tx, ez - d.tz); o.crate = null;
  }
  o.cable = o.crate === null ? 0 : Math.max(0, o.y - 0.1 - (o.crate + 0.9));
  return o;
}

function ensureView(g, rt) {
  if (rt.view) return rt.view;
  const root = new THREE.Group(); root.name = 'carepackages';
  g.renderer.scene.add(root);
  rt.view = { root, drone: null, crates: new Map(), t: 0 };
  return rt.view;
}
function makeCrate(G, gold) {
  const grp = new THREE.Group();
  const m = new THREE.Mesh(gold ? G.gold : G.crate, gold ? G.mGold : G.mCrate);
  const beam = new THREE.Mesh(G.beam, gold ? G.mBeamG : G.mBeam); beam.scale.set(1, gold ? 30 : 12, 1); beam.frustumCulled = false;
  grp.add(m, beam); grp.userData.beam = beam;
  return grp;
}
function makeDrone(G, gold) {
  const grp = new THREE.Group(); grp.scale.setScalar(1.25);
  const body = new THREE.Mesh(G.drone, G.mDrone), rot = new THREE.Mesh(G.rotors, G.mRotor), cab = new THREE.Mesh(G.cable, G.mCable);
  const hang = new THREE.Mesh(gold ? G.gold : G.crate, gold ? G.mGold : G.mCrate);
  grp.add(body, rot, cab, hang); grp.userData = { cab, hang };
  return grp;
}
function disposeView(rt) {
  const v = rt.view; if (!v) return;
  if (v.root.parent) v.root.parent.remove(v.root);
  rt.view = null;
}
const _pose = {};
function syncView(g, rt, C, dt) {
  const G = build(), V = ensureView(g, rt);
  V.t += dt;
  G.tex.rotation += dt * 55;
  // the drone
  const d = C.drone;
  if (d && d.age < T_END) {
    if (!V.drone || V.drone.userData.id !== d.id) { if (V.drone) V.root.remove(V.drone); V.drone = makeDrone(G, d.gold); V.drone.userData.id = d.id; V.root.add(V.drone); }
    dronePose(d, d.age, _pose);
    const dr = V.drone, u = dr.userData;
    dr.position.set(_pose.x, _pose.y, _pose.z); dr.rotation.set(Math.sin(V.t * 3) * 0.02, _pose.yaw, Math.cos(V.t * 2.3) * 0.02);
    u.hang.visible = _pose.crate !== null; u.cab.visible = u.hang.visible;
    if (u.hang.visible) { const k = 1 / dr.scale.x; u.hang.position.set(0, (_pose.crate - _pose.y) * k, 0); u.cab.scale.y = Math.max(0.01, _pose.cable * k); u.cab.position.set(0, -0.1, 0); u.hang.scale.setScalar(1 / dr.scale.x); }
  } else if (V.drone) { V.root.remove(V.drone); V.drone = null; }
  // the crates on the ground (a guest also draws the one the drone is about to put down, so there is no gap before the next row)
  const want = new Map();
  for (const c of C.crates) want.set(c.id, c);
  if (d && d.age >= T_REL && d.age < T_END && !want.has(d.id)) want.set(d.id, { id: d.id, x: d.tx, y: d.ty, z: d.tz, gold: d.gold });
  for (const [id, grp] of V.crates) if (!want.has(id)) { V.root.remove(grp); V.crates.delete(id); }
  for (const [id, c] of want) {
    let grp = V.crates.get(id);
    if (!grp) { grp = makeCrate(G, c.gold); V.crates.set(id, grp); V.root.add(grp); }
    grp.position.set(c.x, c.y, c.z);
  }
  const pulse = 0.14 + 0.06 * Math.sin(V.t * 3);
  G.mBeam.opacity = pulse; G.mBeamG.opacity = pulse + 0.07;
  humStep(g, rt, d && d.age < T_END ? dronePose(d, d.age, _pose) : null);
}

// the rotor hum: one function. Two detuned saws through a low-pass into the sound bus, its gain, pan and brightness from the positional voice (spatial.js), so it swells and fades with distance
export function humAt(g, rt, pose) {
  const s = g.sound; if (!s || !s.voice) return 0;
  const v = pose ? s.voice(pose.x, pose.y, pose.z, 'hum') : null;
  const gain = v ? v.gain : 0;
  if (!s.ctx || !s.dry) return gain;   // (no audio device: the number is still the number)
  if (!rt.hum) {
    if (gain < 0.01) return gain;
    const c = s.ctx, o1 = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), gn = c.createGain(), pan = c.createStereoPanner ? c.createStereoPanner() : null;
    o1.type = o2.type = 'sawtooth'; o1.frequency.value = 118; o2.frequency.value = 121.5; lp.type = 'lowpass'; lp.frequency.value = 420; gn.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(gn); if (pan) { gn.connect(pan); pan.connect(s.dry); } else gn.connect(s.dry);
    o1.start(); o2.start();
    rt.hum = { o1, o2, lp, gn, pan, quiet: 0 };
  }
  const h = rt.hum, t = s.ctx.currentTime;
  h.gn.gain.setTargetAtTime(gain * 0.07, t, 0.12);
  if (v) { h.lp.frequency.setTargetAtTime(Math.max(160, Math.min(900, v.lp * 0.04 + 140)), t, 0.2); if (h.pan) h.pan.pan.setTargetAtTime(v.pan, t, 0.1); h.o1.frequency.setTargetAtTime(118 + (pose.crate === null ? 14 : 0), t, 0.4); }
  h.quiet = gain < 0.01 ? h.quiet + 1 : 0;
  if (!pose || h.quiet > 90) stopHum(rt, s);
  return gain;
}
const humStep = (g, rt, pose) => { if (rt.hum || pose) humAt(g, rt, pose); };
function stopHum(rt, s) {
  const h = rt.hum; if (!h) return; rt.hum = null;
  try { h.gn.gain.setTargetAtTime(0, s.ctx.currentTime, 0.08); } catch (e) { /* closed context */ }
  setTimeout(() => { for (const n of [h.o1, h.o2]) { try { n.stop(); } catch (e) { /* stopped */ } } for (const n of [h.o1, h.o2, h.lp, h.gn, h.pan]) { try { n && n.disconnect(); } catch (e) { /* gone */ } } }, 400);
}
// everything this module put in the scene and the audio graph (a new game, or the end of the last crate)
function retire(g, rt) {
  stopHum(rt, g.sound || {});
  disposeView(rt);
  rt.live = false;
}
export function teardown(g) { const rt = g._care; if (rt) { retire(g, rt); g._care = null; } disposeGeo(); }

// ------------------------------------------------------------------ the frame
function hostStep(g, rt, C, dt) {
  const d = C.drone;
  if (d) {
    d.age += dt;
    if (!d.released && d.age >= T_REL) release(g, d, false);
    if (d.age >= T_END) { C.drone = null; bump(g); }
  }
  if (C.crates.length) {
    rt.nt -= dt;
    if (rt.nt <= 0) {
      rt.nt = 0.1;
      const pp = g.player.pos, rp = g.remote && g.remote.pos;
      for (const c of C.crates) {
        const dh = Math.hypot(pp.x - c.x, pp.z - c.z), dy = pp.y - c.y;
        const dr = rp && Number.isFinite(rp.x + rp.z) ? Math.hypot(rp.x - c.x, rp.z - c.z) : 1e9, dyr = rp ? rp.y - c.y : 9;
        const nearMe = dh < CARE.WALK && dy > -1 && dy < 2.4 && !g.dead && g.mode === 'play';
        const nearHim = dr < CARE.WALK && dyr > -1 && dyr < 2.4;
        if (dh > 2.6 && dr > 2.6) rt.armed.set(c.id, true);
        if ((nearMe || nearHim) && rt.armed.get(c.id) && !(rt.cool.get(c.id) > rt.clk) && !(g.ui && g.ui.isModalOpen && g.ui.isModalOpen() && nearMe && !nearHim)) { openCrate(g, c.id, nearMe ? 'h' : 'g'); break; }
        if (dh < 7 && !rt.hinted.has(c.id)) { rt.hinted.add(c.id); g.ui.hint(`Care package: press <kbd>E</kbd> on it, or walk into it.`, 3.5); }
      }
    }
  }
}

// a guest's S.care is a picture of the host's (crates with no contents, a drone with no pack). When the host leaves, the same world is yours to run:
// give every crate contents, land the drone, and never reuse an id.
function adopt(g, C) {
  delete C.view;
  let top = 0; for (const c of C.crates) top = Math.max(top, c.id | 0); if (C.drone) top = Math.max(top, C.drone.id | 0);
  C.n = Math.max(C.n | 0, top + 1);
  const fill = (id, gold) => rollPack(g, mulberry32(((g.S.seed | 0) ^ Math.imul((id | 0) + 11, 2654435761)) >>> 0), { gold: !!gold });
  for (const c of C.crates) if (!Array.isArray(c.items) || !Array.isArray(c.fx)) { const q = fill(c.id, c.gold); c.items = q.items; c.fx = q.fx; if (!Array.isArray(c.ms)) c.ms = []; }
  const d = C.drone; C.drone = null;
  if (d && !C.crates.some((c) => c.id === d.id)) { const q = fill(d.id, d.gold); C.crates.push({ id: d.id, x: d.tx, y: d.ty, z: d.tz, gold: d.gold ? 1 : 0, items: q.items, fx: q.fx, ms: [], wait: d.wait ? 1 : 0 }); }
  C.queue = C.queue.map(() => ({ k: 'ms', ids: [], big: false }));
  const rt = g._care; if (rt) { rt.seen = null; rt.rev++; }
}
export function tick(g, dt) {
  if (g.careOff) return;
  const rt = rtOf(g);
  if (g.S.care && g.S.care.view) adopt(g, g.S.care);
  rt.clk += dt;
  rt.pt -= dt;
  if (rt.pt <= 0) { rt.pt = CARE.POLL; poll(g, rt); }
  const C = g.S.care;
  if (!C) return;
  if (!C.drone && !C.crates.length) { if (rt.live) { retire(g, rt); rt.live = false; } return; }
  rt.live = true;
  hostStep(g, rt, C, dt);
  syncView(g, rt, C, dt);
}

// ------------------------------------------------------------------ the guest
export function guestTick(g, dt) {
  const C = g.S && g.S.care;
  const rt = rtOf(g);
  if (!C || (!C.drone && !C.crates.length)) { if (rt.live) { retire(g, rt); rt.live = false; } return; }
  rt.live = true;
  if (C.drone) C.drone.age += dt;
  syncView(g, rt, C, dt);
}
const num = (v, lo = -1e5, hi = 1e5) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
export function row(g) {
  const C = g.S.care; if (!C) return null;
  const rt = rtOf(g);
  rt.hb++;
  if (!C.drone && rt.sentRev === rt.rev && rt.hb < 4) return null;
  rt.sentRev = rt.rev; if (!C.drone) rt.hb = 0;
  const r1 = (v) => Math.round(v * 10) / 10, d = C.drone;
  return {
    c: C.crates.map((c) => [c.id, r1(c.x), r1(c.y), r1(c.z), c.gold ? 1 : 0, c.wait ? 1 : 0, (c.ms || []).slice(0, 4)]),
    d: d ? [d.id, r1(d.tx), r1(d.ty), r1(d.tz), +d.ang.toFixed(3), +d.ang2.toFixed(3), +d.age.toFixed(2), d.gold ? 1 : 0, d.released ? 1 : 0, d.wait ? 1 : 0] : null,
    cl: Object.keys(C.claimed), op: Object.keys(C.opened), q: C.queue.length, w: C.win, disc: C.disc, n: C.count | 0, p: C.prog,
  };
}
export function guestRow(g, d) {
  if (!d || typeof d !== 'object') return;
  if (d.ev === 'haul') { if (g.S.carry.length && g.sellAll) g.sellAll(); return; }
  const S = g.S, C = S.care && typeof S.care === 'object' ? S.care : (S.care = fresh());
  const rt = rtOf(g);
  C.view = 1;
  const crates = [];
  for (const a of Array.isArray(d.c) ? d.c.slice(0, 12) : []) {
    if (!Array.isArray(a)) continue;
    const id = num(a[0], 0, 1e9), x = num(a[1]), y = num(a[2], -50, 200), z = num(a[3]);
    if (id === null || x === null || y === null || z === null) continue;
    crates.push({ id, x, y, z, gold: a[4] ? 1 : 0, wait: a[5] ? 1 : 0, ms: Array.isArray(a[6]) ? a[6].filter((s) => typeof s === 'string').slice(0, 4) : [] });
  }
  const seen = rt.seen;
  if (seen) for (const c of crates) if (!seen.has(c.id)) { landSound(g, c.x, c.y, c.z, c.gold); const w = whereText(g, c.x, c.z); g.ui.hint(`A care package landed ${w}. <kbd>E</kbd> opens it.`, 4); }
  rt.seen = new Set(crates.map((c) => c.id));
  C.crates = crates;
  const a = d.d;
  if (Array.isArray(a)) {
    const id = num(a[0], 0, 1e9), tx = num(a[1]), ty = num(a[2], -50, 200), tz = num(a[3]), ang = num(a[4], -20, 20), ang2 = num(a[5], -20, 20), age = num(a[6], 0, 600);
    if (id !== null && tx !== null && ty !== null && tz !== null && ang !== null && ang2 !== null && age !== null) {
      if (!C.drone || C.drone.id !== id) { C.drone = { id, tx, ty, tz, ang, ang2, age, gold: a[7] ? 1 : 0, released: a[8] ? 1 : 0, wait: a[9] ? 1 : 0 }; chimeSoft(g, rt); }
      else { C.drone.released = a[8] ? 1 : 0; if (Math.abs(C.drone.age - age) > 0.35) C.drone.age = age; }
    }
  } else C.drone = null;
  const ids = (l) => { const o = {}; for (const s of Array.isArray(l) ? l.slice(0, 200) : []) if (typeof s === 'string' && s.length < 24) o[s] = 1; return o; };
  C.claimed = ids(d.cl); C.opened = ids(d.op);
  C.win = num(d.w, 0, 1e6) ?? 0; C.disc = num(d.disc, 0, 1) ?? 0; C.count = num(d.n, 0, 1e6) ?? 0;
  C.queue = new Array(Math.min(60, Math.max(0, num(d.q, 0, 1e4) | 0))).fill({ k: 'ms' });
  C.prog = d.p && typeof d.p === 'object' && Array.isArray(d.p.r) && Array.isArray(d.p.br) ? { e: num(d.p.e, 0, 1e30) ?? 0, r: d.p.r.slice(0, 7).map((v) => num(v, 0, 1e12) ?? 0), dp: num(d.p.dp, 0, 1e5) ?? 0, dx: num(d.p.dx, 0, 100) ?? 0, gen: d.p.gen ? 1 : 0, br: d.p.br.filter((s) => typeof s === 'string').slice(0, 20) } : C.prog;
}
const chimeSoft = (g, rt) => { chime(g); };

// ------------------------------------------------------------------ the log (on the achievements screen)
export function logRows(g) {
  const C = stateOf(g), P = (g.isGuest() ? C.prog : null) || (g.S ? progressOf(g.S) : null);
  return MILESTONES.map((m) => {
    const v = msValue(m, P), state = C.opened[m.id] ? 'delivered' : C.claimed[m.id] ? 'waiting' : 'upcoming';
    return { id: m.id, name: m.name, icon: m.icon, state, big: !!m.big, pct: Math.max(0, Math.min(1, v / m.goal)), val: v, goal: m.goal, unit: m.unit || '' };
  });
}
export function nextDay(g) { const C = stateOf(g); return (C.win + 1) * CARE.DAYS + 1; }
export function renderLog(g, host) {
  const rows = logRows(g), C = stateOf(g);
  const by = { waiting: [], upcoming: [], delivered: [] };
  for (const r of rows) by[r.state].push(r);
  by.upcoming.sort((a, b) => b.pct - a.pct);
  const card = (r) => `<div class="ac ${r.state === 'delivered' ? 'done' : ''}" data-care="${r.id}"><div class="i">${r.icon}</div><div style="flex:1"><b>${r.name}${r.big ? ' (gold)' : ''}</b><span>${r.state === 'delivered' ? 'Delivered and opened' : r.state === 'waiting' ? 'Waiting: a crate is on its way or on the floor' : `${r.unit === '%' ? r.val.toFixed(1) : r.unit === ' m' ? r.val.toFixed(0) : fmt(r.val)}${r.unit} of ${fmt(r.goal)}${r.unit}`}</span><div style="height:4px;margin-top:5px;border-radius:2px;background:rgba(255,255,255,0.1);overflow:hidden"><i style="display:block;height:100%;width:${Math.round(r.pct * 100)}%;background:#ffb02e"></i></div></div></div>`;
  const el = document.createElement('div');
  el.id = 'careLog'; el.style.cssText = 'grid-column:1/-1;display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));margin-top:10px';
  const nd = nextDay(g), now = g.dayNumber ? g.dayNumber() : 1;
  el.innerHTML = `<div style="grid-column:1/-1"><h3 style="margin:8px 0 2px;font-size:14px;letter-spacing:0.12em">CARE PACKAGES</h3><div style="font-size:12px;color:var(--dim)">The courier drone brings a crate every ${CARE.DAYS} days (next: day ${nd}${nd > now ? `, in ${nd - now} day${nd - now > 1 ? 's' : ''}` : ''}) and one for each milestone below, once. ${C.disc > 0 ? `<b>${Math.round(C.disc * 100)}% off your next upgrade is waiting.</b> ` : ''}${C.queue.length ? `${C.queue.length} waiting for the drone. ` : ''}${C.count | 0} opened so far.</div></div>`
    + (by.waiting.length ? `<div style="grid-column:1/-1;font-size:12px;letter-spacing:0.1em;color:var(--dim)">WAITING (${by.waiting.length})</div>${by.waiting.map(card).join('')}` : '')
    + `<div style="grid-column:1/-1;font-size:12px;letter-spacing:0.1em;color:var(--dim)">UPCOMING (${by.upcoming.length})</div>${by.upcoming.map(card).join('')}`
    + (by.delivered.length ? `<div style="grid-column:1/-1;font-size:12px;letter-spacing:0.1em;color:var(--dim)">DELIVERED (${by.delivered.length})</div>${by.delivered.map(card).join('')}` : '');
  const old = host.querySelector('#careLog'); if (old) old.remove();
  host.appendChild(el);
  return el;
}

// ------------------------------------------------------------------ debug and tests
export function install(g) {
  g.careDebug = {
    // drop(gold): a package starts now, whatever the clock, the menus or the queue say. opts: { land: true } puts the crate down at once, { x, z } picks the spot, { seed }, { items, fx } a fixed pack
    drop(gold, opts = {}) {
      const C = ensure(g);
      const d = dispatch(g, { k: 'dbg', gold: gold === undefined ? undefined : !!gold, big: !!opts.big, ids: opts.ids }, { quiet: opts.quiet, here: opts.here });
      if (opts.x !== undefined) { d.tx = opts.x; d.tz = opts.z; if (opts.y !== undefined) d.ty = opts.y; }
      if (opts.items) d.pack.items = opts.items.map((a) => a.slice());
      if (opts.fx) d.pack.fx = opts.fx.map((a) => a.slice());
      if (opts.land) { d.age = T_REL; release(g, d, true); C.drone = null; return C.crates[C.crates.length - 1]; }
      return d;
    },
    state: () => g.S.care, reset() { teardown(g); g.S.care = undefined; return ensure(g); }, rt: () => g._care, roll: (seed, gold) => rollPack(g, mulberry32(seed), { gold }),
    poll: () => { const rt = rtOf(g); poll(g, rt); }, spot: () => findSpot(g, baseFor(g), g.player.pos),
  };
}
TYPES.care = { tick, guestTick, row, guestRow };
