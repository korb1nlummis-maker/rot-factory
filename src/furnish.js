// Furnish (Satisfactory wave 4, spec 4.5): storage crates, signs and lights.
//   Storage   Locker (wall, 24 loose items), Parts Crate (floor, 100 stacks of building material), Plush Silo (belt in and out, species
//             filter, 2,000 plush), Dimensional Depot (one pool for every vault and silo in range, pull ports, 100,000 plush), Output Vault.
//   Signs     Sign Board (text, size, icon, tone, lit), Direction Sign (arrow), Depth Sign (depth and the frame it needs).
//   Lights    Ceiling Lamp (auto on under a roof), Floodlight (aimable cone), Strip Light, Warning Beacon (gate alarm or tripped breaker).
// Everything is host simulated. A guest only sees the ents (ent+), the 0.5 s `furnish` row (power and storage summaries) and asks for
// changes through the `cfg` command (settings, and the write only `act` key for storage transfers). See catalog.js for the contract.
//
// Import rule: catalog.js imports this file, so nothing here may import upgrades.js, crafting.js, power.js, game.js or ext.js at module
// level, and catalog.js's V is only touched inside functions. upgrades.js and crafting.js are reached lazily (dynamic import below).
import * as THREE from 'three';
import { C, cellX, cellZ, toI, toJ, toK, idx } from './config.js';
import { species, NEEDLE, RARITY } from './plushdata.js';
import { speciesIcon } from './icons.js';
import { V } from './catalog.js';

// ---------------------------------------------------------------- constants
export const KINDS = ['locker', 'pcrate', 'silo', 'dimdepot', 'sign', 'dsign', 'psign', 'clamp', 'flood', 'strip', 'wbeacon'];
const TYPE_SET = new Set(KINDS);
export const KW = { clamp: 0.5, flood: 6, strip: 0.15, wbeacon: 0.3, sign: 0.1, dsign: 0.1, psign: 0.1 };   // a lit sign draws 0.1 kW, an unlit one nothing
export const FURN_DEMAND = { ...KW };
export const CAP = { locker: 24, pcrate: 10000, silo: 2000, dimdepot: 100000 };   // items, material units (100 stacks of 100), plush, plush
export const STACK = 100;
export const DEPOT_RANGE = 36;         // m: vaults and silos this close to a depot share its pool
export const LIGHT_CAP = 24;           // real point lights considered per frame (the shader takes the nearest few, see game.js)
export const FLOOD_RANGE = 25;         // m
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
const YAWS = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];   // model +Z faces dir (the same table logistics.js uses)
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtN = (n) => Math.round(n).toLocaleString('en-US');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dirOfYaw = (yaw) => { const fx = Math.sin(yaw), fz = Math.cos(yaw); return Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 2) : (fz > 0 ? 1 : 3); };
const maxSp = () => NEEDLE - 1;   // any plush the game makes except The One (the decoys count: a belt can bring them)
const spName = (sp) => (species[sp] ? species[sp].name : '?');

export const SIGN_DIM = { 1: [0.8, 0.3], 2: [1.4, 0.5], 3: [2.2, 0.8] };   // panel width, height in m
export const TONES = { green: ['#0b8a3e', '#e6fff0'], red: ['#a31616', '#ffffff'], yellow: ['#e8b81c', '#1b1b1b'], blue: ['#1b4f9c', '#f2f7ff'], black: ['#15181c', '#f2f2f2'] };
export const ICONS = { none: '', warn: '⚠️', stop: '⛔', plush: '🧸', bin: '🗑️', power: '⚡', pick: '⛏️', door: '🚪', star: '⭐', lock: '🔒', box: '📦', help: 'ℹ️', fire: '🔥', exit: '🏃', species: '' };
const ARROWS = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'];

// ---------------------------------------------------------------- upgrades (absolute costs, no COST_SCALE) and bench rows
export const FURN_UPGRADES = [
  { id: 'furnSigns', cat: 'machine', name: 'Signs and Boards', desc: 'Unlocks Sign Boards, Direction Signs and Depth Signs. Label belt lines and doors, point the way out, or read the depth and the frame a tunnel needs. A lit sign draws 0.1 kW.', max: 1, cost: [30000], effect: (t) => { t.furnSigns = true; } },
  { id: 'furnStore', cat: 'machine', name: 'Storage Furniture', desc: 'Unlocks the Locker (wall mounted, 24 loose items such as dynamite and medkits) and the Parts Crate (100 stacks of building material). E opens them and moves items in and out.', max: 1, cost: [60000], req: { id: 'vault', lvl: 1 }, effect: (t) => { t.furnStore = true; } },
  { id: 'furnLamps', cat: 'light', name: 'Hall Lighting', desc: 'Unlocks the Ceiling Lamp (0.5 kW, 12 m, switches on by itself under a roof or frame), the Strip Light for catwalks and haul roads (0.15 kW per 2.4 m) and the Warning Beacon (flashes on a gate alarm or a tripped breaker). They draw from the grid and dim in a brownout.', max: 1, cost: [150000], req: { id: 'power', lvl: 1 }, effect: (t) => { t.furnLamps = true; } },
  { id: 'furnFlood', cat: 'light', name: 'Floodlights', desc: 'Unlocks the Floodlight: aimable, 6 kW, a 25 m cone. Aim it from its panel (E).', max: 1, cost: [1500000], req: { id: 'furnLamps', lvl: 1 }, effect: (t) => { t.furnFlood = true; } },
  { id: 'furnSilo', cat: 'machine', name: 'Plush Silos', desc: 'Unlocks the Plush Silo (2,000 plush, belt in and out, species filter) and the Output Vault, a Vault Crate that feeds the oldest plush onto the belt it faces.', max: 1, cost: [3000000], req: { id: 'furnStore', lvl: 1 }, effect: (t) => { t.furnSilo = true; } },
  { id: 'furnDepot', cat: 'machine', name: 'Dimensional Depot', desc: 'Unlocks the Dimensional Depot: every vault and silo within 36 m reports into one pool, E lists it, and a belt can pull a chosen species out of it. Holds 100,000 plush itself. Each one you own makes the next dearer.', max: 1, cost: [25000000], req: { id: 'furnSilo', lvl: 1 }, effect: (t) => { t.furnDepot = true; } },
];

// what the bench shows (price is what the player pays: the registry multiplies by K = 3, so each row stores a third)
const SHOW = { locker: 600, pcrate: 4000, silo: 150000, ovault: 600, dimdepot: 80000000, sign: 120, dsign: 360, psign: 900, clamp: 900, strip: 360, wbeacon: 1800, flood: 4500 };
const base = (id) => Math.max(1, Math.round(SHOW[id] / 3));
const DEPOT_GROWTH = 1.55;
const ICON = { locker: '🗄️', pcrate: '📦', silo: '🛢️', ovault: '📤', dimdepot: '🌌', sign: '🪧', dsign: '➡️', psign: '📏', clamp: '💡', flood: '🔦', strip: '🔆', wbeacon: '🚨' };
const NAME = { locker: 'Locker', pcrate: 'Parts Crate', silo: 'Plush Silo', ovault: 'Output Vault', dimdepot: 'Dimensional Depot', sign: 'Sign Board', dsign: 'Direction Sign', psign: 'Depth Sign', clamp: 'Ceiling Lamp', flood: 'Floodlight', strip: 'Strip Light', wbeacon: 'Warning Beacon' };
const USE = {
  locker: 'Take it out and aim at a wall. E opens it: move loose items (dynamite, medkits, flares, tools) between your pack and the locker. Holds 24.',
  pcrate: 'Aim at the floor and press B. E opens it: move building material between your stock and the crate. Holds 100 stacks of 100.',
  silo: 'Aim at the floor and press B. Belts that end at it fill it (2,000 plush). Plush leave through the face you were looking at, onto a belt. E sets a species filter and takes plush out.',
  ovault: 'Place it like a Vault Crate, facing a belt. It fills from a belt behind it and feeds the oldest plush onto the belt it faces.',
  dimdepot: 'Aim at the floor and press B. Every vault and silo within 36 m reports into one pool. E lists it and takes plush out. A belt on its face pulls the chosen species. Needs no power.',
  sign: 'Aim at a wall, the floor or the roof and press B. E edits the text, size, icon and colour. Lit signs need a pole in reach.',
  dsign: 'Aim at a wall, the floor or the roof and press B. E turns the arrow and sets a short label.',
  psign: 'Aim at a wall, the floor or the roof and press B. It prints how deep you are and the cheapest frame rated for it.',
  clamp: 'Aim at the roof (or a wall) and press B. Needs a pole in reach. On Auto it lights up under a roof or a frame. E picks Auto, On or Off.',
  flood: 'Aim at the floor, a wall or the roof and press B. Needs a pole in reach. E aims it: turn and tilt.',
  strip: 'Aim at a floor edge, a wall or the roof and press B. A 2.4 m bar. Needs a pole in reach.',
  wbeacon: 'Place it anywhere in reach of a pole. On Auto it flashes orange while a detector gate holds The One or a breaker on its grid has tripped.',
};
const owned = (g, id, type) => ((g.S.items && g.S.items[id]) || 0) + (g.machines ? g.machines.count(type) : 0);

export function furnRecipes(g) {
  const T = g.T, out = [];
  const row = (id, kind, extra = {}) => out.push({ id, kind, icon: ICON[id], name: NAME[id], short: extra.short || NAME[id].split(' ')[0], price: base(id), batch: extra.batch || [1, 2, 5], use: USE[id], ...extra });
  const placed = (type) => (g.machines ? g.machines.count(type) : 0);
  if (T.furnSigns) {
    row('sign', 'sign', { short: 'Sign', desc: 'A board with up to 32 characters, three sizes, an icon and a colour. Label belt lines, doors and arches.', statusFn: () => `${placed('sign')} placed` });
    row('dsign', 'dsign', { short: 'Arrow', desc: 'An arrow sign with a short label. Point the way to the exit, the bin or a depot.', statusFn: () => `${placed('dsign')} placed` });
    row('psign', 'psign', { short: 'Depth', desc: 'Prints the depth where it stands and the cheapest frame rated for it. A cheap survey aid for the load rules.', statusFn: () => `${placed('psign')} placed` });
  }
  if (T.furnStore) {
    row('locker', 'locker', { short: 'Locker', desc: 'Wall mounted, holds 24 loose items. Not for plush.', statusFn: () => `${placed('locker')} placed, 24 items each` });
    row('pcrate', 'pcrate', { short: 'Crate', desc: 'Holds 100 stacks of building material (10,000 units).', statusFn: () => `${placed('pcrate')} placed, 100 stacks each` });
  }
  if (T.furnLamps) {
    row('clamp', 'clamp', { short: 'Lamp', desc: 'Lights 12 m around it for 0.5 kW. Auto: on under a roof or a frame.', statusFn: () => `${placed('clamp')} placed` });
    row('strip', 'strip', { short: 'Strip', desc: 'A 2.4 m light bar for catwalks and roads, 0.15 kW.', batch: [1, 5, 10], statusFn: () => `${placed('strip')} placed` });
    row('wbeacon', 'wbeacon', { short: 'Beacon', desc: 'Flashes orange on a gate alarm or a tripped breaker. 0.3 kW.', statusFn: () => `${placed('wbeacon')} placed` });
  }
  if (T.furnFlood) row('flood', 'flood', { short: 'Flood', desc: 'An aimable 25 m cone for 6 kW. Set it up where the work is.', statusFn: () => `${placed('flood')} placed` });
  if (T.furnSilo) {
    row('silo', 'silo', { short: 'Silo', desc: 'Stores 2,000 plush. Belt in, belt out, species filter.', batch: [1, 1, 1], statusFn: () => `${placed('silo')} placed, 2,000 plush each` });
    row('ovault', 'ovault', { short: 'Out Vault', desc: 'A Vault Crate with an output: it pulls the oldest plush onto the belt it faces.', statusFn: () => `${g.logi ? [...g.logi.tiles.values()].filter((t) => t.type === 'vault' && t.out).length : 0} placed` });
  }
  if (T.furnDepot) {
    const n = owned(g, 'dimdepot', 'dimdepot');
    row('dimdepot', 'dimdepot', { short: 'Depot', batch: [1, 1, 1], price: Math.round(base('dimdepot') * Math.pow(DEPOT_GROWTH, n)), desc: 'One pool for every vault and silo within 36 m, 100,000 plush of its own, pull ports for belts.', statusFn: () => `${placed('dimdepot')} placed, each one costs ${DEPOT_GROWTH}x more` });
  }
  return out;
}

// ---------------------------------------------------------------- lazy access to upgrades.js and crafting.js (importing them at module level would be a cycle)
let UPG = null, CRAFT = null;
setTimeout(() => { import('./upgrades.js').then((m) => { UPG = m; }).catch(() => {}); import('./crafting.js').then((m) => { CRAFT = m; }).catch(() => {}); }, 0);
const FALLBACK_FRAMES = [['timber', 'Timber Frame', 150], ['steel', 'Steel Frame', 380], ['concrete', 'Concrete Lining', 800], ['rebar', 'Rebar Cage', 1300], ['titan', 'Titanium Rib', 1800], ['carbon', 'Carbon Weave', 2300], ['plasma', 'Plasma Arch', 3200], ['voidl', 'Void Lattice', 3900], ['neutron', 'Neutron Shell', 4500], ['horizon', 'Event Horizon', Infinity]];

// depth the way the load rules measure it (supportDepth in upgrades.js is the distance from the bay), and the cheapest frame rated for it
export const depthAt = (x, z) => Math.hypot(x, z);
export function frameFor(depth) {
  const list = UPG ? Object.entries(UPG.FRAME_TYPES).map(([k, f]) => [k, f.name, f.maxDepth]) : FALLBACK_FRAMES;
  for (const [k, name, max] of list) if (max >= depth) return { key: k, name, max };
  return null;
}

// ---------------------------------------------------------------- plush stores: { "sp:vr": count }, oldest key first. Shade bits are dropped (shiny stays) so a store stays small.
const keyOf = (sp, vr) => sp + ':' + (vr & 128);
const mapTotal = (m) => { let n = 0; if (m) for (const k in m) n += m[k]; return n; };
const mapAdd = (m, sp, vr, n = 1) => { const k = keyOf(sp, vr); m[k] = (m[k] || 0) + n; };
function mapPeek(m, sp = -1) { if (!m) return null; for (const k in m) { const c = k.indexOf(':'), s = +k.slice(0, c); if (sp >= 0 && s !== sp) continue; return { k, sp: s, vr: +k.slice(c + 1) }; } return null; }
function mapDrop(m, k) { if (--m[k] <= 0) delete m[k]; }
function mapBySpecies(m) { const o = {}; if (m) for (const k in m) { const s = +k.slice(0, k.indexOf(':')); o[s] = (o[s] || 0) + m[k]; } return o; }
const topSpecies = (o, n) => Object.entries(o).map(([s, c]) => [+s, c]).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, n);

// ---------------------------------------------------------------- shared state (one game per page)
export const FS = { g: null, list: [], silos: [], depots: [], frames: [], vaults: [], outs: [], at: -9, n: -1, sum: {}, seenNets: new WeakSet(), lastNets: null, lastRow: '', lastRowT: -99, panel: null, powerT: 0, alarmT: 0, alarm: false, netOpen: false, covT: 0, timer: 0, flash: false };

function scan(g) {
  FS.g = g; FS.at = g.time; FS.n = g.machines.items.size;
  const list = [], silos = [], depots = [], frames = [];
  for (const it of g.machines.items.values()) {
    const e = it.ent;
    if (TYPE_SET.has(e.type)) { list.push(it); if (e.type === 'silo') silos.push(it); else if (e.type === 'dimdepot') depots.push(it); } else if (e.type === 'frame') frames.push(e);
  }
  const vaults = [], outs = [], strays = [];
  for (const t of g.logi.tiles.values()) {
    if (t.type !== 'vault') continue;
    if (t.intakeFor) { if (!g.machines.items.has(t.intakeFor)) strays.push(t); } else { vaults.push(t); if (t.out) outs.push(t); }
  }
  for (const t of strays) g.logi.remove(t);   // the silo or depot it fed is gone (a reset, a guest edit): never leave a hidden crate behind
  Object.assign(FS, { list, silos, depots, frames, vaults, outs });
  return FS;
}
export function scanNow(g) { return scan(g); }
function lists(g) { if (FS.g !== g || FS.n !== g.machines.items.size || g.time - FS.at > 0.25 || g.time < FS.at) scan(g); return FS; }
// test helper: forget guest side state and any hidden intake crate (fresh() in the self test drops the machines but not the tiles)
export function resetFurnish(g) { FS.sum = {}; FS.lastRow = ''; FS.lastRowT = -99; FS.panel = null; for (const t of [...g.logi.tiles.values()]) if (t.intakeFor) g.logi.remove(t); FS.g = null; FS.n = -1; }

// ---------------------------------------------------------------- geometry of a placement
export function heightOf(kind, mount, size) {
  switch (kind) {
    case 'locker': return 1.2;
    case 'pcrate': return 0.5;
    case 'silo': case 'dimdepot': return 2.4;
    case 'sign': case 'dsign': case 'psign': { const ph = SIGN_DIM[size || 1][1]; return mount === 'floor' ? 0.9 + ph : mount === 'ceiling' ? ph + 0.6 : ph; }
    case 'clamp': return mount === 'floor' ? 1.7 : mount === 'wall' ? 0.3 : 0.1;
    case 'flood': return mount === 'floor' ? 1.5 : 0.5;
    case 'strip': return 0.06;
    case 'wbeacon': return mount === 'wall' ? 0.35 : 0.4;
    default: return 0.5;
  }
}
const FLOOD_HEAD = { floor: 1.3, wall: 0.25, ceiling: 0.25 };   // height of the lamp head above the bottom of the model
const SMALL = new Set(['sign', 'dsign', 'psign', 'clamp', 'flood', 'strip', 'wbeacon']);
const MOUNTS = { locker: ['wall'], pcrate: ['floor'], silo: ['floor'], dimdepot: ['floor'], sign: ['floor', 'wall', 'ceiling'], dsign: ['floor', 'wall', 'ceiling'], psign: ['floor', 'wall', 'ceiling'], clamp: ['floor', 'wall', 'ceiling'], flood: ['floor', 'wall', 'ceiling'], strip: ['floor', 'wall', 'ceiling'], wbeacon: ['floor', 'wall', 'ceiling'] };
const MOUNT_WHY = { locker: 'Aim at a wall', pcrate: 'Aim at the floor', silo: 'Aim at the floor', dimdepot: 'Aim at the floor' };

// x, y (bottom), z, h and the facing for a placement, derived from the cell, the mount and the facing (never trusted from a guest)
export function layout(kind, mount, i, j, k, face, size) {
  const h = heightOf(kind, mount, size);
  let x = cellX(i), z = cellZ(k), y = j * C;
  if (mount === 'ceiling') y = (j + 1) * C - h;
  else if (mount === 'wall') { x = cellX(i) - DX[face] * (C / 2); z = cellZ(k) - DZ[face] * (C / 2); y = Math.max(0, j * C + C / 2 - h / 2); }
  return { x, y, z, h, yaw: YAWS[face] };
}

// ---------------------------------------------------------------- placement planning
// which surface the crosshair is on: the empty cell in front of it, the kind of surface and (for a wall) which way it faces
function aimSurface(g, eye, dir) {
  const w = g.world, r = g.machines.rayEmpty(eye, dir, 5);
  if (!r) return null;
  const { i, j, k } = r.last;
  const N = [[0, 1, 0, 'floor', 0], [0, -1, 0, 'ceiling', 0], [1, 0, 0, 'wall', 0], [-1, 0, 0, 'wall', 2], [0, 0, 1, 'wall', 1], [0, 0, -1, 'wall', 3]];   // outward normal of the surface, its kind, its dir index
  let best = null, bs = 0.12;
  for (const [nx, ny, nz, mount, face] of N) {
    const solid = ny === 1 && j === 0 ? true : w.solid(i - nx, j - ny, k - nz);
    if (!solid) continue;
    const s = -(dir.x * nx + dir.y * ny + dir.z * nz);
    if (s > bs) { bs = s; best = { mount, i, j, k, face }; }
  }
  if (best) return best;
  // open air: stand it on the floor under the crosshair
  let jj = j, n = 0;
  while (jj > 0 && !w.solid(i, jj - 1, k) && n++ < 6) jj--;
  if (jj > 0 && !w.solid(i, jj - 1, k)) return null;
  return { mount: 'floor', i, j: jj, k, face: 0 };
}

function occupied(g, kind, s, ignoreId) {
  const key = (e) => `${e.mount}|${e.i}|${e.j}|${e.k}|${e.mount === 'wall' ? e.dir : 0}`;
  const mine = `${s.mount}|${s.i}|${s.j}|${s.k}|${s.mount === 'wall' ? s.face : 0}`;
  for (const it of lists(g).list) {
    const e = it.ent; if (e.id === ignoreId) continue;
    if (key(e) === mine) return true;
    // a locker is two cells tall: another one on the same stretch of wall must clear it
    if (e.mount === 'wall' && s.mount === 'wall' && e.i === s.i && e.k === s.k && e.dir === s.face && (kind === 'locker' || e.type === 'locker') && Math.abs(e.j - s.j) < 2) return true;
  }
  return false;
}

// shared validation, used by the host's aim step and by its re-check of a guest's placement. Returns a reason or null.
function placeCheck(g, kind, s) {
  const w = g.world;
  if (!(MOUNTS[kind] || []).includes(s.mount)) return MOUNT_WHY[kind] || 'It does not go there';
  if (![s.i, s.j, s.k, s.face].every(Number.isInteger) || s.face < 0 || s.face > 3 || !w.inside(s.i, s.j, s.k)) return 'Out of reach';
  if (w.solid(s.i, s.j, s.k)) return 'Blocked';
  if (s.mount === 'floor' && s.j > 0 && !w.solid(s.i, s.j - 1, s.k)) return 'Needs a floor';
  if (s.mount === 'ceiling' && !w.solid(s.i, s.j + 1, s.k)) return 'Needs a roof above';
  if (s.mount === 'wall' && !w.solid(s.i - DX[s.face], s.j, s.k - DZ[s.face])) return 'Needs a wall';
  if (s.mount === 'floor') {
    if (g.logi.tiles.has(idx(s.i, s.j, s.k))) return 'Occupied';
    const p = g.player.pos;   // never set one down inside the player
    if (Math.abs(cellX(s.i) - p.x) < 0.5 && Math.abs(cellZ(s.k) - p.z) < 0.5 && p.y < (s.j + 1) * C && p.y + 1.7 > s.j * C) return 'Too close';
  }
  if (kind === 'silo' || kind === 'dimdepot') { for (let h = 1; h < 4; h++) if (w.solid(s.i, s.j + h, s.k)) return 'Needs 2.4 m of room above'; }
  if (occupied(g, kind, s)) return 'Something is already there';
  return null;
}

// the plan step the catalog calls while the tool is in hand (and the guest's own preview of it)
function planFor(kind) {
  return (g, tool, eye, dir, yaw) => {
    const s = aimSurface(g, eye, dir);
    if (!s) return { plan: { ok: false, why: MOUNT_WHY[kind] || 'Aim at a surface' }, cost: 0 };
    if (kind === 'silo' || kind === 'dimdepot') s.face = dirOfYaw(yaw);                                   // the output face looks where you look, like a vault
    else if (s.mount !== 'wall') s.face = (dirOfYaw(yaw) + 2) & 3;                                        // a sign or lamp on the floor or roof faces you
    const why = placeCheck(g, kind, s);
    const size = 1, L = layout(kind, s.mount, s.i, s.j, s.k, s.face, size);
    const ent = { mount: s.mount, i: s.i, j: s.j, k: s.k, dir: s.face, x: L.x, y: L.y, z: L.z, h: L.h, yawDeg: Math.round(((yaw * 180 / Math.PI) % 360 + 360) % 360) };
    return { plan: { ok: !why, why, ent }, cost: 0 };
  };
}
// the ghost while the item is in hand: the real model in translucent green (or red when it cannot go there)
function previewFor(kind) {
  return (g, tool, plan) => {
    const m = g.machines, e = plan && plan.ent;
    if (!e) { m.showPreview(null, null); return; }
    const key = `f${kind}${plan.ok}${e.mount}${e.dir}${e.h}${Math.round((e.yawDeg || 0) / 15)}`;
    if (m.ghostKey !== key) {
      const fake = { type: kind, mount: e.mount, dir: e.dir, x: 0, y: 0, z: 0, h: e.h, size: 1, text: 'SIGN', tone: 'green', icon: 'none', arrow: 0, deg: e.yawDeg || 0, tilt: -15, mode: 'on' };
      const obj = buildObj(fake), mat = new THREE.MeshBasicMaterial({ color: plan.ok ? 0x5dffa0 : 0xff5a4a, transparent: true, opacity: 0.4, depthWrite: false });
      obj.traverse((c) => { if (c.isMesh) { c.material = mat; if (c.name === 'beam') c.visible = false; } });
      m.setGhost(obj, key);
    }
    if (m.ghost) m.ghost.position.set(e.x, e.y, e.z);
  };
}
const conflictFor = (kind) => (g, e) => {
  if (!e || typeof e !== 'object') return 'Nothing to place';
  const s = { mount: e.mount, i: e.i, j: e.j, k: e.k, face: e.dir };
  return placeCheck(g, kind, s);
};
function buildFor(kind) {
  return (g, tool, e) => {
    const face = e.dir | 0, size = 1;
    const L = layout(kind, e.mount, e.i, e.j, e.k, face, size);
    const f = { type: kind, mount: e.mount, i: e.i, j: e.j, k: e.k, dir: face, x: L.x, y: L.y, z: L.z, h: L.h };
    if (kind === 'sign' || kind === 'dsign' || kind === 'psign') { f.size = 1; f.tone = kind === 'psign' ? 'yellow' : kind === 'dsign' ? 'blue' : 'green'; f.lit = false; if (kind === 'sign') { f.text = 'SIGN'; f.icon = 'none'; f.sp = 0; } if (kind === 'dsign') { f.text = ''; f.arrow = 0; } }
    if (kind === 'clamp' || kind === 'wbeacon') f.mode = 'auto';
    if (kind === 'strip') f.mode = 'on';
    if (kind === 'flood') { f.mode = 'on'; f.tilt = -15; f.deg = e.mount === 'wall' ? [90, 0, 270, 180][face] : Number.isFinite(e.yawDeg) ? ((Math.round(e.yawDeg) % 360) + 360) % 360 : 0; }
    if (kind === 'locker' || kind === 'pcrate' || kind === 'silo' || kind === 'dimdepot') f.cargo = {};
    if (kind === 'silo' || kind === 'dimdepot') f.filter = -1;
    if (SMALL.has(kind)) f.hr = 0.35;   // a wider aim cone: a sign or lamp on a roof is hard to hit
    return f;
  };
}

// ---------------------------------------------------------------- the Output Vault: a normal vault tile with out:true
const ovaultPlan = (g, tool, eye, dir, yaw) => {
  const r = g.planLogi({ kind: 'vault' }, eye, dir, yaw);
  const pl = r.plan; if (pl && pl.ent) pl.ent = { ...pl.ent, out: true };
  return { plan: pl, cost: 0 };
};

// ---------------------------------------------------------------- materials and meshes
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.5, ...o });
const bas = (r, g2, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g2, b), toneMapped: false });
const M = {
  steel: std(0x59636e, { metalness: 0.85, roughness: 0.4 }), dark: std(0x1d2024, { roughness: 0.6, metalness: 0.6 }), yellow: std(0xe8b81c, { metalness: 0.3, roughness: 0.5 }),
  wood: std(0x7a5a36, { metalness: 0.05, roughness: 0.85 }), woodDark: std(0x4d371f, { metalness: 0.05, roughness: 0.9 }), locker: std(0x3f6277, { metalness: 0.4, roughness: 0.55 }), lockerDoor: std(0x4b7690, { metalness: 0.4, roughness: 0.5 }),
  silo: std(0xaeb6bc, { metalness: 0.7, roughness: 0.35 }), voidM: std(0x15101f, { metalness: 0.9, roughness: 0.25 }), lensOff: std(0x6b665c, { metalness: 0.2, roughness: 0.5 }), flashOff: std(0x5a3010, { metalness: 0.2, roughness: 0.5 }),
  glowG: bas(0.4, 3, 1), glowO: bas(3.4, 1.4, 0.3), glowR: bas(3.6, 0.3, 0.2), glowW: bas(3.2, 3.0, 2.4), glowC: bas(1.2, 2.4, 3.2), glowP: bas(1.7, 0.6, 3.4), glowBar: bas(2.2, 2.9, 3.4),
};
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt, rb, h, m, n = 16) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n), m);
const at = (m, x, y, z, name) => { m.position.set(x, y, z); if (name) m.name = name; return m; };

// the label on a Parts Crate or Silo is one shared texture
let _labels = {};
function labelTex(text, bg, fg) {
  const key = text + bg + fg; if (_labels[key]) return _labels[key];
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 256, 96); x.fillStyle = fg; x.font = '800 54px Helvetica, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; _labels[key] = t; return t;
}

function buildLocker() {
  const g = new THREE.Group(), w = 0.5, h = 1.2, d = 0.3;
  g.add(at(box(w, h, d, M.locker), 0, h / 2, d / 2));
  for (const s of [-1, 1]) {
    g.add(at(box(w / 2 - 0.02, h - 0.1, 0.02, M.lockerDoor), s * (w / 4), h / 2, d + 0.011));
    g.add(at(box(0.02, 0.16, 0.03, M.steel), s * 0.04, h * 0.48, d + 0.035));
    for (let v = 0; v < 3; v++) g.add(at(box(w / 2 - 0.12, 0.012, 0.01, M.dark), s * (w / 4), h * 0.82 + v * 0.03, d + 0.024));
  }
  g.add(at(box(0.05, 0.03, 0.02, M.glowG), 0, h - 0.06, d + 0.02, 'led'));
  g.add(at(box(0.04, 0.9, 0.012, M.dark), 0, h * 0.46, d + 0.022));
  return g;
}
function buildCrate() {
  const g = new THREE.Group(), s = 0.56, h = 0.46;
  g.add(at(box(s, h, s, M.wood), 0, h / 2, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(box(0.06, h + 0.02, 0.06, M.steel), sx * (s / 2 - 0.02), h / 2, sz * (s / 2 - 0.02)));
  g.add(at(box(s + 0.04, 0.05, s + 0.04, M.woodDark), 0, h + 0.02, 0));
  g.add(at(box(s - 0.1, 0.03, 0.06, M.steel), 0, h * 0.5, s / 2 + 0.005));
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.13), new THREE.MeshBasicMaterial({ map: labelTex('PARTS', '#e8b81c', '#1b1b1b') }));
  lab.position.set(0, h * 0.5, s / 2 + 0.02); g.add(lab);
  return g;
}
function buildSilo() {
  const g = new THREE.Group();
  g.add(at(cyl(0.29, 0.31, 0.12, M.dark, 20), 0, 0.06, 0));
  g.add(at(cyl(0.27, 0.27, 1.8, M.silo, 24), 0, 1.02, 0));
  g.add(at(cyl(0.05, 0.27, 0.34, M.silo, 24), 0, 2.09, 0));
  g.add(at(cyl(0.07, 0.07, 0.06, M.dark, 12), 0, 2.29, 0));
  for (const y of [0.45, 1.05, 1.65]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.275, 0.018, 6, 28), M.yellow); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); }
  g.add(at(box(0.09, 1.3, 0.03, M.dark), 0, 1.1, 0.275));
  const fill = at(box(0.05, 1.26, 0.02, M.glowG), 0, 0.47, 0.285, 'fill'); fill.geometry.translate(0, 0.63, 0); fill.position.y = 0.47; fill.scale.y = 0.001; g.add(fill);
  g.add(at(box(0.16, 0.16, 0.3, M.yellow), 0, 0.3, 0.38, 'chute'));
  g.add(at(box(0.1, 0.05, 0.14, M.dark), 0, 0.2, 0.46));
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), new THREE.MeshBasicMaterial({ map: labelTex('SILO', '#2b2418', '#ffe9b0') })); lab.position.set(0, 1.78, 0.275); g.add(lab);
  return g;
}
function buildDepot() {
  const g = new THREE.Group();
  g.add(at(cyl(0.3, 0.32, 0.1, M.dark, 6), 0, 0.05, 0));
  g.add(at(box(0.4, 2.0, 0.4, M.voidM), 0, 1.1, 0));
  for (const [y, n] of [[0.75, 'ring1'], [1.35, 'ring2'], [1.95, 'ring3']]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.02, 6, 30), M.glowP); r.rotation.x = Math.PI / 2; r.position.y = y; r.name = n; g.add(r); }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), M.glowP); gem.position.y = 2.28; gem.name = 'gem'; g.add(gem);
  g.add(at(box(0.16, 0.16, 0.3, M.yellow), 0, 0.3, 0.38, 'chute'));
  g.add(at(box(0.3, 0.8, 0.012, M.dark), 0, 1.0, 0.206));
  const fill = at(box(0.2, 0.7, 0.014, M.glowP), 0, 0.65, 0.212, 'fill'); fill.geometry.translate(0, 0.35, 0); fill.position.y = 0.65; fill.scale.y = 0.001; g.add(fill);
  return g;
}

// ----- signs
const gl = (e) => ICONS[e.icon] || '';
export function signLines(e) {
  if (e.type === 'psign') { const d = depthAt(e.x, e.z), f = frameFor(d); return { icon: '📏', text: `DEPTH ${fmtN(d)} m`, sub: f ? (isFinite(f.max) ? `${f.name}, rated ${fmtN(f.max)} m` : `${f.name}`) : '' }; }
  if (e.type === 'dsign') return { arrow: (e.arrow | 0) & 7, text: e.text || '' };
  return { icon: e.icon === 'species' ? 'sp' : gl(e), text: e.text || '' };
}
function drawSign(e, tex) {
  const [w, h] = SIGN_DIM[e.size || 1], pw = Math.round(w * 256), ph = Math.round(h * 256);
  const c = tex.image, x = c.getContext('2d');
  const [bg, fg] = TONES[e.tone] || TONES.green, L = signLines(e);
  x.clearRect(0, 0, pw, ph); x.fillStyle = bg; x.fillRect(0, 0, pw, ph);
  x.strokeStyle = fg; x.globalAlpha = 0.8; x.lineWidth = Math.max(3, ph * 0.03); x.strokeRect(ph * 0.05, ph * 0.05, pw - ph * 0.1, ph * 0.9); x.globalAlpha = 1;
  let left = ph * 0.12, right = pw - ph * 0.12;
  const mid = ph / 2;
  if (L.arrow !== undefined) {
    const a = L.arrow * Math.PI / 4, s = ph * 0.3;
    x.save(); x.translate(ph * 0.5, mid); x.rotate(-a); x.fillStyle = fg;
    x.beginPath(); x.moveTo(s, 0); x.lineTo(0, -s * 0.8); x.lineTo(0, -s * 0.3); x.lineTo(-s, -s * 0.3); x.lineTo(-s, s * 0.3); x.lineTo(0, s * 0.3); x.lineTo(0, s * 0.8); x.closePath(); x.fill(); x.restore();
    left = ph * 1.0;
  } else if (L.icon === 'sp') {
    const sp = e.sp | 0; left = ph * 0.95;
    if (sp > 0 && species[sp]) { const im = new Image(); im.onload = () => { x.drawImage(im, ph * 0.1, ph * 0.1, ph * 0.8, ph * 0.8); tex.needsUpdate = true; }; try { im.src = speciesIcon(sp); } catch (err) { /* no WebGL for the thumbnail */ } }
  } else if (L.icon) {
    x.font = `${Math.round(ph * 0.55)}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = fg; x.fillText(L.icon, ph * 0.5, mid + 3); left = ph * 0.95;
  }
  const lines = L.sub ? [L.text, L.sub] : [L.text];
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  const fit = (t, maxW, size) => { let px = size; x.font = `800 ${px}px Helvetica, Arial, sans-serif`; while (x.measureText(t).width > maxW && px > 10) { px -= 2; x.font = `800 ${px}px Helvetica, Arial, sans-serif`; } return px; };
  const maxW = right - left, cx = (left + right) / 2;
  if (lines.length === 2) { fit(lines[0], maxW, ph * 0.36); x.fillText(lines[0], cx, ph * 0.38); fit(lines[1], maxW, ph * 0.2); x.fillText(lines[1], cx, ph * 0.7); }
  else if (lines[0]) {
    let t = lines[0]; const px = fit(t, maxW, ph * 0.5);
    if (px < ph * 0.22 && t.includes(' ')) {   // too long for one line: break it near the middle
      const sp = t.split(' '); let best = 1, bd = 1e9; for (let q = 1; q < sp.length; q++) { const a = sp.slice(0, q).join(' ').length, b = sp.slice(q).join(' ').length; if (Math.abs(a - b) < bd) { bd = Math.abs(a - b); best = q; } }
      const l1 = sp.slice(0, best).join(' '), l2 = sp.slice(best).join(' ');
      const p2 = Math.min(fit(l1, maxW, ph * 0.34), fit(l2, maxW, ph * 0.34)); x.font = `800 ${p2}px Helvetica, Arial, sans-serif`; x.fillText(l1, cx, ph * 0.34); x.fillText(l2, cx, ph * 0.68);
    } else { x.font = `800 ${px}px Helvetica, Arial, sans-serif`; x.fillText(t, cx, mid + 2); }
  }
  tex.needsUpdate = true;
}
function buildSign(e) {
  const g = new THREE.Group(), [w, h] = SIGN_DIM[e.size || 1], m = e.mount || 'wall';
  const pw = Math.round(w * 256), ph = Math.round(h * 256);
  const c = document.createElement('canvas'); c.width = pw; c.height = ph;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; drawSign(e, tex);
  const py = m === 'floor' ? 0.9 : 0;
  g.add(at(box(w, h, 0.04, M.dark), 0, py + h / 2, 0.02));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, h - 0.04), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.05 })); face.position.set(0, py + h / 2, 0.042); face.name = 'face'; g.add(face);
  if (m === 'floor') for (const s of [-1, 1]) g.add(at(box(0.045, 0.9, 0.045, M.steel), s * (w / 2 - 0.1), 0.45, 0.02));
  if (m === 'ceiling') for (const s of [-1, 1]) g.add(at(box(0.015, 0.6, 0.015, M.steel), s * (w / 2 - 0.08), h + 0.3, 0.02));
  if (m === 'wall') for (const s of [-1, 1]) { const bolt = at(cyl(0.015, 0.015, 0.03, M.steel, 8), s * (w / 2 - 0.05), h - 0.05, 0.05); bolt.rotation.x = Math.PI / 2; g.add(bolt); }
  g.userData = { tex, face, bright: new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), dim: face.material };
  return g;
}

// ----- lights
function buildClamp(e) {
  const g = new THREE.Group(), m = e.mount;
  if (m === 'ceiling') { g.add(at(cyl(0.26, 0.26, 0.07, M.dark, 20), 0, 0.065, 0)); g.add(at(cyl(0.22, 0.22, 0.03, M.lensOff, 20), 0, 0.015, 0, 'lens')); }
  else if (m === 'wall') { g.add(at(box(0.05, 0.05, 0.26, M.steel), 0, 0.2, 0.13)); g.add(at(box(0.12, 0.1, 0.03, M.dark), 0, 0.2, 0.01)); g.add(at(cyl(0.17, 0.17, 0.07, M.dark, 18), 0, 0.2, 0.28)); g.add(at(cyl(0.14, 0.14, 0.03, M.lensOff, 18), 0, 0.165, 0.28, 'lens')); }
  else { g.add(at(cyl(0.2, 0.22, 0.06, M.dark, 16), 0, 0.03, 0)); g.add(at(cyl(0.025, 0.025, 1.55, M.steel, 8), 0, 0.8, 0)); g.add(at(cyl(0.2, 0.2, 0.07, M.dark, 18), 0, 1.62, 0)); g.add(at(cyl(0.16, 0.16, 0.03, M.lensOff, 18), 0, 1.585, 0, 'lens')); }
  return g;
}
function buildFlood(e) {
  const g = new THREE.Group(), m = e.mount;
  if (m === 'floor') { g.add(at(box(0.34, 0.1, 0.34, M.dark), 0, 0.05, 0)); g.add(at(cyl(0.025, 0.025, 1.1, M.steel, 8), 0, 0.65, 0)); g.add(at(box(0.04, 0.2, 0.04, M.steel), 0, 1.2, 0)); }
  else if (m === 'wall') { g.add(at(box(0.16, 0.16, 0.03, M.dark), 0, 0.25, 0.01)); g.add(at(box(0.05, 0.05, 0.16, M.steel), 0, 0.25, 0.09)); }
  else { g.add(at(box(0.2, 0.04, 0.2, M.dark), 0, 0.48, 0)); g.add(at(box(0.04, 0.12, 0.04, M.steel), 0, 0.4, 0)); }
  const head = new THREE.Group(); head.name = 'head'; head.position.set(0, FLOOD_HEAD[m] || 0.25, m === 'wall' ? 0.18 : 0);
  head.add(at(box(0.36, 0.26, 0.2, M.dark), 0, 0, 0));
  head.add(at(box(0.31, 0.21, 0.02, M.lensOff), 0, 0, 0.11, 'lens'));
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1.7, 8, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.rotation.x = -Math.PI / 2; beam.position.z = 4.1; beam.name = 'beam'; beam.visible = false; head.add(beam);
  g.add(head);
  return g;
}
function buildStrip(e) {
  const g = new THREE.Group(), flat = e.mount !== 'wall';   // along the way you looked on a floor or roof, along the wall on a wall
  g.add(at(flat ? box(0.08, 0.06, 2.4, M.dark) : box(2.4, 0.06, 0.08, M.dark), 0, 0.03, flat ? 0 : 0.04));
  g.add(at(flat ? box(0.05, 0.03, 2.34, M.lensOff) : box(2.34, 0.03, 0.05, M.lensOff), 0, 0.045, flat ? 0 : 0.045, 'bar'));
  return g;
}
function buildBeacon(e) {
  const g = new THREE.Group(), m = e.mount;
  if (m === 'wall') { g.add(at(box(0.06, 0.06, 0.1, M.steel), 0, 0.18, 0.05)); g.add(at(cyl(0.1, 0.1, 0.04, M.dark, 14), 0, 0.18, 0.12).rotateX(Math.PI / 2)); const d = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.flashOff); d.rotation.x = Math.PI / 2; d.position.set(0, 0.18, 0.14); d.name = 'dome'; g.add(d); }
  else if (m === 'ceiling') { g.add(at(cyl(0.12, 0.12, 0.05, M.dark, 14), 0, 0.375, 0)); const d = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), M.flashOff); d.position.y = 0.2; d.name = 'dome'; g.add(d); g.add(at(box(0.015, 0.1, 0.015, M.steel), 0, 0.3, 0)); }
  else { g.add(at(cyl(0.16, 0.18, 0.12, M.dark, 14), 0, 0.06, 0)); g.add(at(cyl(0.09, 0.09, 0.1, M.yellow, 12), 0, 0.17, 0)); const d = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.flashOff); d.position.y = 0.22; d.name = 'dome'; g.add(d); }
  return g;
}

function buildObj(e) {
  let g;
  switch (e.type) {
    case 'locker': g = buildLocker(); break;
    case 'pcrate': g = buildCrate(); break;
    case 'silo': g = buildSilo(); break;
    case 'dimdepot': g = buildDepot(); break;
    case 'sign': case 'dsign': case 'psign': g = buildSign(e); break;
    case 'clamp': g = buildClamp(e); break;
    case 'flood': g = buildFlood(e); break;
    case 'strip': g = buildStrip(e); break;
    default: g = buildBeacon(e);
  }
  g.position.set(e.x, e.y, e.z);
  g.rotation.y = YAWS[(e.dir | 0) & 3];
  if (e.type === 'flood') { const head = g.getObjectByName('head'); if (head) { head.rotation.order = 'YXZ'; head.rotation.y = ((e.deg || 0) * Math.PI / 180) - g.rotation.y; head.rotation.x = -(e.tilt || 0) * Math.PI / 180; } }
  return g;
}
const disposeTex = (obj) => { if (obj && obj.userData && obj.userData.tex) { obj.userData.tex.dispose(); if (obj.userData.bright) obj.userData.bright.dispose(); } };

// ---------------------------------------------------------------- power: lights and lit signs find their grid the way every consumer does (nearest node in pole reach)
export function furnKw(e) {
  const k = KW[e.type]; if (k === undefined) return undefined;
  if (e.type === 'sign' || e.type === 'dsign' || e.type === 'psign') return e.lit ? k : 0;
  return e.mode === 'off' ? 0 : k;
}
function resolvePower(g) {
  const P = g.power; if (!P || !P.nets) return;
  const reach2 = g.T.poleReach * g.T.poleReach, add = new Map(), L = lists(g);
  for (const it of L.list) {
    const e = it.ent; if (KW[e.type] === undefined) continue;
    const ex = e.x, ey = e.y + (e.h || 0.5) / 2, ez = e.z;
    let best = null, bd = 1e12;
    for (const net of P.nets) for (const n of net.nodes) { const [px, py, pz] = P.pos(n); const dx = ex - px, dz = ez - pz, dy = ey - py, d = dx * dx + dz * dz + dy * dy * 0.5; if (d <= reach2 && d < bd) { bd = d; best = net; } }
    it.net = best; if (e.type === 'wbeacon') it.trip = tripped(it);
    if (best) add.set(best, (add.get(best) || 0) + (furnKw(e) || 0));
  }
  // The grid answers for what it feeds: add our load to each grid once per recompute (power.js builds new net objects every time), unless power.js
  // counts catalog consumers itself (it then sets P.catalogConsumers). A tripped grid stays at 0, a battery covers the extra kW like any other load.
  if (!P.catalogConsumers) for (const [net, kw] of add) {
    if (FS.seenNets.has(net) || kw <= 0) continue;
    FS.seenNets.add(net); net.demand += kw; net.furn = kw;
    const gen = net.gen ?? net.supply;
    net.supply = net.tripped ? 0 : (net.charged && net.demand > gen ? net.demand : gen);
    net.sat = net.demand <= 1e-6 ? (net.supply > 0 ? 1 : 0) : Math.min(1, net.supply / net.demand);
  }
  for (const it of L.list) { const e = it.ent; if (KW[e.type] === undefined) continue; const pw = it.net ? it.net.sat : 0; if (Math.abs((e.pw ?? -1) - pw) > 0.004) e.pw = pw; }
  FS.lastNets = P.nets;
}

// ---------------------------------------------------------------- light state and visuals
const LIGHTS = { clamp: { r: 12, c: [2.4, 2.1, 1.6] }, flood: { r: 17, c: [2.8, 2.7, 2.5] }, strip: { r: 6, c: [1.5, 1.9, 2.3] }, wbeacon: { r: 8, c: [3.0, 1.2, 0.3] } };
function covered(g, e) {
  const w = g.world;
  for (let h = 1; h <= 6; h++) if (w.solid(e.i, e.j + h, e.k)) return true;
  for (const f of lists(g).frames) if (Math.hypot(f.cx - e.x, f.cz - e.z) < 2.6 && f.y0 + (f.h || 2.4) >= e.y - 0.5 && f.y0 <= e.y + 3) return true;
  return false;
}
function alarmNow(g) {
  if (g.alarmGate) return true;
  for (const t of g.logi.tiles.values()) if (t.detector && t.alarm) return true;
  return false;
}
function tripped(it) {
  const net = it.net; if (!net) return false;
  if (net.tripped === true) return true;
  for (const n of net.nodes || []) if (n.tripped === true) return true;
  return false;
}
const flash = (time) => (Math.sin(time * 9) > 0 ? 1 : 0);
function levelOf(g, it, time) {
  const e = it.ent, pw = e.pw ?? 0, lvl = Math.min(1, pw);
  if (e.type === 'wbeacon') {
    const m = e.mode || 'auto'; if (m === 'off') return 0;
    // a beacon on a tripped grid flashes from its own small battery (the grid itself is down), the rest needs power
    if (m === 'auto' && it.trip) return Math.max(lvl, 0.8) * flash(time);
    if (pw <= 0.05) return 0;
    if (m === 'on') return lvl * flash(time);
    return FS.alarm ? lvl * flash(time) : 0;
  }
  if (pw <= 0.05) return 0;
  switch (e.type) {
    case 'sign': case 'dsign': case 'psign': return e.lit ? lvl : 0;
    case 'clamp': { const m = e.mode || 'auto'; if (m === 'off') return 0; if (m === 'on') return lvl; return it.cov ? lvl : 0; }
    case 'flood': case 'strip': return e.mode === 'off' ? 0 : lvl;
    default: return 0;
  }
}
function paint(it, lvl) {
  const o = it.obj, e = it.ent, on = lvl > 0.02;
  const set = (name, mat) => { const m = o.getObjectByName(name); if (m && m.material !== mat) m.material = mat; };
  switch (e.type) {
    case 'sign': case 'dsign': case 'psign': { const u = o.userData; if (u && u.face) u.face.material = on ? u.bright : u.dim; break; }
    case 'clamp': set('lens', on ? M.glowW : M.lensOff); break;
    case 'flood': { set('lens', on ? M.glowW : M.lensOff); const b = o.getObjectByName('beam'); if (b) b.visible = on; break; }
    case 'strip': set('bar', on ? M.glowBar : M.lensOff); break;
    case 'wbeacon': set('dome', on ? M.glowO : M.flashOff); break;
    default: break;
  }
}
function updateLights(g, dt, guest) {
  const L = lists(g), time = g.time;
  FS.covT -= dt;
  const recov = FS.covT <= 0; if (recov) FS.covT = 1;
  for (const it of L.list) {
    const e = it.ent;
    if (e.type === 'clamp' && recov) it.cov = covered(g, e);
    if (e.type === 'depot' || e.type === 'dimdepot') { for (const n of ['ring1', 'ring2', 'ring3']) { const r = it.obj.getObjectByName(n); if (r) r.rotation.z += dt * (n === 'ring2' ? -1.2 : 0.9); } const gem = it.obj.getObjectByName('gem'); if (gem) { gem.rotation.y += dt * 1.5; gem.position.y = 2.28 + Math.sin(time * 2 + e.x) * 0.04; } }
    if (KW[e.type] === undefined) continue;
    const lvl = levelOf(g, it, time), key = Math.round(lvl * 20) + (lvl > 0.02 ? 100 : 0);
    if (it.key !== key) { it.key = key; it.lvl = lvl; paint(it, lvl); } else it.lvl = lvl;
  }
  void guest;
}

// what machines.lights(camPos, out) merges in: [score, light] pairs. A light is a plain object { type, x, y, z, lr, lc } the renderer reads.
export function furnishLights(g, camPos, arr) {
  const L = lists(g);
  for (const it of L.list) {
    const e = it.ent, spec = LIGHTS[e.type]; if (!spec || (it.lvl ?? 0) <= 0.02) continue;
    let x = e.x, y = e.y + (e.type === 'clamp' ? (e.mount === 'floor' ? 1.6 : e.mount === 'wall' ? 0.15 : 0.04) : e.type === 'flood' ? FLOOD_HEAD[e.mount] || 0.25 : e.type === 'wbeacon' ? 0.25 : 0.1), z = e.z, r = spec.r;
    if (e.type === 'flood') {   // the cone is lit as one point 8 m down the beam, or where the beam meets the floor when it points down
      const yaw = (e.deg || 0) * Math.PI / 180, t = (e.tilt || 0) * Math.PI / 180, sn = Math.sin(t), cs = Math.cos(t);
      const d = sn < -0.02 ? clamp((y - 0.6) / -sn, 1, 8) : 8;
      x += Math.sin(yaw) * cs * d; z += Math.cos(yaw) * cs * d; y += sn * d; r = 17;
    }
    const d2 = (x - camPos.x) ** 2 + (y - camPos.y) ** 2 + (z - camPos.z) ** 2;
    if (d2 > (r + 34) ** 2) continue;
    const ld = it.ld || (it.ld = { type: e.type, x, y, z, lr: r, lc: [0, 0, 0] });
    ld.x = x; ld.y = y; ld.z = z; ld.lr = r;
    const k = it.lvl; ld.lc[0] = spec.c[0] * k; ld.lc[1] = spec.c[1] * k; ld.lc[2] = spec.c[2] * k;
    arr.push([d2 * (9 / r) * (9 / r), ld]);
  }
  return arr;
}

// ---------------------------------------------------------------- storage: summaries (also what the 0.5 s row carries to a guest)
const isStore = (t) => t === 'locker' || t === 'pcrate' || t === 'silo' || t === 'dimdepot';
function vaultsNear(g, x, z) { const R2 = DEPOT_RANGE * DEPOT_RANGE; return lists(g).vaults.filter((t) => (cellX(t.i) - x) ** 2 + (cellZ(t.k) - z) ** 2 <= R2); }
function silosNear(g, x, z, self) { const R2 = DEPOT_RANGE * DEPOT_RANGE; return lists(g).silos.filter((it) => it.ent.id !== self && (it.ent.x - x) ** 2 + (it.ent.z - z) ** 2 <= R2).map((it) => it.ent); }
// every plush a depot can reach: its own store, then silos, then vaults in range
export function poolOf(g, depot) {
  const own = depot.cargo || {}, by = mapBySpecies(own);
  let total = mapTotal(own), nSilo = 0, nVault = 0;
  for (const s of silosNear(g, depot.x, depot.z, depot.id)) { nSilo++; const b = mapBySpecies(s.cargo); for (const k in b) { by[k] = (by[k] || 0) + b[k]; total += b[k]; } }
  for (const t of vaultsNear(g, depot.x, depot.z)) { nVault++; for (const it of t.stored || []) { by[it.sp] = (by[it.sp] || 0) + 1; total++; } }
  return { own: mapTotal(own), total, by, nSilo, nVault };
}
export function poolTake(g, depot, sp = -1) {
  const own = depot.cargo || (depot.cargo = {});
  let p = mapPeek(own, sp); if (p) { mapDrop(own, p.k); return { sp: p.sp, vr: p.vr }; }
  for (const s of silosNear(g, depot.x, depot.z, depot.id)) { p = mapPeek(s.cargo, sp); if (p) { mapDrop(s.cargo, p.k); return { sp: p.sp, vr: p.vr }; } }
  for (const t of vaultsNear(g, depot.x, depot.z)) { const n = (t.stored || []).findIndex((it) => sp < 0 || it.sp === sp); if (n >= 0) return t.stored.splice(n, 1)[0]; }
  return null;
}
function poolPeek(g, depot, sp = -1) {
  const own = depot.cargo || {};
  let p = mapPeek(own, sp); if (p) return { sp: p.sp, vr: p.vr, from: 'own' };
  for (const s of silosNear(g, depot.x, depot.z, depot.id)) { p = mapPeek(s.cargo, sp); if (p) return { sp: p.sp, vr: p.vr, from: 'silo' }; }
  for (const t of vaultsNear(g, depot.x, depot.z)) { const it = (t.stored || []).find((q) => sp < 0 || q.sp === sp); if (it) return { sp: it.sp, vr: it.vr, from: 'vault' }; }
  return null;
}
export function summaryOf(g, e) {
  if (e.type === 'locker' || e.type === 'pcrate') { const c = {}; for (const k in e.cargo || {}) c[k] = e.cargo[k]; return { c, t: mapTotal(e.cargo) }; }
  if (e.type === 'silo') return { n: mapTotal(e.cargo), f: e.filter ?? -1, s: topSpecies(mapBySpecies(e.cargo), 80) };
  if (e.type === 'dimdepot') { const p = poolOf(g, e); return { n: p.own, p: p.total, v: p.nVault, o: p.nSilo, f: e.filter ?? -1, s: topSpecies(p.by, 200) }; }
  return null;
}
const sumOf = (g, e) => (g.isGuest() ? FS.sum[e.id] || null : summaryOf(g, e));

// ---------------------------------------------------------------- storage actions (host side; a guest asks through cfg { act })
const lockerOk = (id) => id && !/^cart:/.test(id) && id !== 'hammer';
function label(e) { return NAME[e.type] || 'Storage'; }
export function doAct(g, e, a, actor = 'host') {
  const S = g.S, T = g.T, toGuest = actor === 'guest';
  const say = (text) => { if (toGuest) g.netSend({ t: 'toast', icon: ICON[e.type] || '📦', title: label(e), text }); else g.ui.hint(text, 3); };
  const give = (items) => {
    if (!items.length) return;
    if (toGuest) { g.netSend({ t: 'give', items }); return; }
    for (const it of items) { if (it.sp === NEEDLE) { g.foundNeedle('the ' + label(e).toLowerCase()); continue; } if (S.carry.length < T.carry) S.carry.push({ sp: it.sp, vr: it.vr }); else g.sim.spawn(it.sp, it.vr, e.x, e.y + 1.2, e.z, 0, 1, 0, 0); }
    g.ui.setCarry(S.carry, T.carry);
  };
  const cargo = e.cargo && typeof e.cargo === 'object' && !Array.isArray(e.cargo) ? e.cargo : (e.cargo = {});
  if (e.type === 'locker' || e.type === 'pcrate') {
    const mats = e.type === 'pcrate', bag = mats ? (S.mats = S.mats || {}) : S.items, cap = CAP[e.type], id = String(a.id || '');
    if (a.k === 'put') {
      if (!hasOwn(bag, id) || !(bag[id] > 0)) return say('You have none of those.');
      if (!mats && !lockerOk(id)) return say('That does not go in a locker.');
      const room = cap - mapTotal(cargo), n = Math.min(Math.max(1, a.n | 0), bag[id], room);
      if (n <= 0) return say(mats ? 'The crate is full.' : 'The locker is full.');
      bag[id] -= n; if (bag[id] <= 0) delete bag[id]; cargo[id] = (hasOwn(cargo, id) ? cargo[id] : 0) + n;
      g.rebuildTools(); return say(`Stored ${n}. ${mapTotal(cargo)} of ${fmtN(cap)}${mats ? ' units' : ''} used.`);
    }
    if (a.k === 'take') {
      if (!hasOwn(cargo, id) || !(cargo[id] > 0)) return say('There is none of that here.');
      const n = Math.min(Math.max(1, a.n | 0), cargo[id]);
      cargo[id] -= n; if (cargo[id] <= 0) delete cargo[id]; bag[id] = (hasOwn(bag, id) ? bag[id] : 0) + n;
      g.rebuildTools(); return say(`Took ${n}. ${mapTotal(cargo)} of ${fmtN(cap)}${mats ? ' units' : ''} left in it.`);
    }
    return null;
  }
  if (e.type === 'silo' || e.type === 'dimdepot') {
    const cap = CAP[e.type];
    if (a.k === 'dep') {
      const src = toGuest ? (a.items || []) : S.carry, back = [];
      let count = mapTotal(cargo), n = 0;
      for (let q = toGuest ? 0 : src.length - 1; toGuest ? q < src.length : q >= 0; q += toGuest ? 1 : -1) {
        const it = src[q];
        if (!it || it.sp === NEEDLE || !species[it.sp] || count >= cap) { if (toGuest && it) back.push(it); continue; }
        mapAdd(cargo, it.sp, it.vr); count++; n++; g.registerDex(it.sp, true);
        if (!toGuest) src.splice(q, 1);
      }
      if (toGuest) give(back); else g.ui.setCarry(S.carry, T.carry);
      return say(n ? `Stored ${n} plush. ${fmtN(count)} of ${fmtN(cap)}.` : count >= cap ? 'It is full.' : 'Nothing you carry fits in it.');
    }
    if (a.k === 'get') {
      const sp = a.sp === undefined ? -1 : a.sp, depot = e.type === 'dimdepot';
      const room = toGuest ? 64 : Math.max(0, T.carry - S.carry.length), want = Math.min(Math.max(1, a.n | 0), room, 512);
      if (want <= 0) return say('Your hands are full.');
      const out = [];
      for (let q = 0; q < want; q++) {
        let it = null;
        if (depot) it = poolTake(g, e, sp); else { const p = mapPeek(cargo, sp); if (p) { mapDrop(cargo, p.k); it = { sp: p.sp, vr: p.vr }; } }
        if (!it) break; out.push(it);
      }
      give(out);
      return say(out.length ? `Took ${out.length} plush.` : (sp >= 0 ? `No ${spName(sp)} in it.` : 'It is empty.'));
    }
  }
  return null;
}

// what the hammer does to a full store: loose items return to the pack, plush fill your hands and the rest are sold, The One is never sold
export function refund(g, e) {
  const S = g.S, T = g.T;
  if (e.type === 'locker' || e.type === 'pcrate') {
    const bag = e.type === 'pcrate' ? (S.mats = S.mats || {}) : S.items;
    for (const k in e.cargo || {}) { if (!(e.cargo[k] > 0)) continue; bag[k] = (hasOwn(bag, k) ? bag[k] : 0) + e.cargo[k]; }
    e.cargo = {}; g.rebuildTools(); return;
  }
  if (e.type === 'silo' || e.type === 'dimdepot') {
    const tile = g.logi.byId.get(-e.id); if (tile) { for (const it of tile.stored || []) mapAdd(e.cargo || (e.cargo = {}), it.sp, it.vr); tile.stored = []; g.logi.remove(tile); }
    let kept = 0, sold = 0, money = 0;
    for (const k in e.cargo || {}) {
      const c = k.indexOf(':'), sp = +k.slice(0, c), vr = +k.slice(c + 1); let n = e.cargo[k];
      while (n > 0 && (sp === NEEDLE || S.carry.length < T.carry)) { if (sp === NEEDLE) { g.foundNeedle('the ' + label(e).toLowerCase()); n--; continue; } S.carry.push({ sp, vr }); n--; kept++; }
      if (n > 0 && sp !== NEEDLE) { const v = Math.max(1, Math.round(g.valueOf(sp, vr, 0) * (g.golden > 0 ? 2 : 1))); money += v * n; sold += n; }
    }
    if (money) { S.money += money; S.totalEarned = (S.totalEarned || 0) + money; S.stats.sold = (S.stats.sold || 0) + sold; g.ui.setMoney(S.money); g.ui.gain(money); }
    e.cargo = {}; g.ui.setCarry(S.carry, T.carry);
    if (kept || sold) g.ui.hint(`${label(e)} emptied: ${kept} plush in your hands${sold ? `, ${fmtN(sold)} sold for ${fmtN(money)}` : ''}.`, 5);
  }
}

// ---------------------------------------------------------------- machines.js add hook, intake crates, output ports
function ensureIntake(g, ent) {
  if (ent.view || g.logi.byId.has(-ent.id)) return;
  if (g.logi.tiles.has(idx(ent.i, ent.j, ent.k))) return;
  const tile = { id: -ent.id, type: 'vault', i: ent.i, j: ent.j, k: ent.k, dir: ent.dir | 0, rise: 0, stored: [], view: true, fixed: true, intakeFor: ent.id };
  g.logi.add(tile);
  const o = g.logi.objs.get(tile.id); if (o) o.visible = false;   // the belt feeds the silo through a hidden crate that is emptied into it every frame
}
function addFor(machines, ent) {
  const g = machines.game, obj = buildObj(ent);
  if ((ent.type === 'silo' || ent.type === 'dimdepot') && !ent.view) { if (!ent.cargo || typeof ent.cargo !== 'object' || Array.isArray(ent.cargo)) ent.cargo = {}; ensureIntake(g, ent); }
  return { obj, lvl: 0, key: -1 };
}
function rebuild(g, e) {
  const it = g.machines.items.get(e.id); if (!it) return;
  const old = it.obj; disposeTex(old); g.machines.disposeObj(old); g.machines.root.remove(old);
  it.obj = buildObj(e); g.machines.root.add(it.obj); it.key = -1; it.lvl = 0;
  if (e.type === 'silo' || e.type === 'dimdepot') it.gauge = -1;
}
function setGauge(it, frac) {
  const f = it.obj && it.obj.getObjectByName('fill'); if (!f) return;
  const q = Math.round(clamp(frac, 0, 1) * 50); if (it.gauge === q) return; it.gauge = q; f.scale.y = Math.max(0.001, q / 50);
  const col = f.material; void col;
}

// one item per belt spacing at the belt speed
const outRate = (g) => g.T.beltSpeed / 0.34;
function outFace(g, t, dir) { return g.logi.tiles.get(idx(t.i + DX[dir], t.j, t.k + DZ[dir])); }

function hostTick(g, dt) {
  const L = lists(g);
  if (g.net.open !== FS.netOpen) { FS.netOpen = g.net.open; FS.lastRow = ''; }
  // power: whenever the grid was rebuilt, and at least twice a second
  FS.powerT -= dt;
  if (FS.powerT <= 0 || g.power.nets !== FS.lastNets) { FS.powerT = 0.5; resolvePower(g); }
  FS.alarmT -= dt; if (FS.alarmT <= 0) { FS.alarmT = 0.5; FS.alarm = alarmNow(g); }
  updateLights(g, dt, false);
  const rate = outRate(g);
  for (const it of L.silos.concat(L.depots)) {
    const e = it.ent, depot = e.type === 'dimdepot';
    if (!e.cargo || typeof e.cargo !== 'object' || Array.isArray(e.cargo)) e.cargo = {};
    if (!(e.view)) ensureIntake(g, e);
    // intake: what the belts delivered to the hidden crate goes into the store (the crate keeps backing the belt up when the store is full)
    const tile = g.logi.byId.get(-e.id);
    if (tile && tile.stored.length) { let count = mapTotal(e.cargo); const cap = CAP[e.type]; while (tile.stored.length && count < cap) { const q = tile.stored.shift(); mapAdd(e.cargo, q.sp, q.vr); count++; } }
    // output: the face it looks at, one plush per belt spacing, the filtered species or the oldest
    it.acc = Math.min(2, (it.acc || 0) + dt * rate);
    const sp = e.filter ?? -1;
    while (it.acc >= 1) {
      const belt = outFace(g, e, e.dir | 0); if (!belt || belt.type === 'vault' && belt.intakeFor === e.id) break;
      const p = depot ? poolPeek(g, e, sp) : mapPeek(e.cargo, sp);
      if (!p) break;
      if (!g.logi.accept(belt, { sp: p.sp, vr: p.vr }, e.dir | 0)) break;
      if (depot) poolTake(g, e, sp); else mapDrop(e.cargo, p.k);
      it.acc -= 1;
    }
    if (it.acc > 1.5 && !outFace(g, e, e.dir | 0)) it.acc = 1;
    setGauge(it, mapTotal(e.cargo) / CAP[e.type]);
  }
  // Output Vaults: the oldest plush onto the belt they face
  for (const t of L.outs) {
    t.acc = Math.min(2, (t.acc || 0) + dt * rate);
    ensureOutMark(g, t);
    while (t.acc >= 1 && t.stored.length) {
      const belt = outFace(g, t, t.dir | 0); if (!belt || !g.logi.accept(belt, t.stored[0], t.dir | 0)) break;
      t.stored.shift(); t.acc -= 1;
    }
    if (!t.stored.length || !outFace(g, t, t.dir | 0)) t.acc = Math.min(t.acc, 1);
  }
  // a row for the guests of the host's storage and power
}
function guestTick(g, dt) {
  lists(g); updateLights(g, dt, true);
  for (const it of FS.list) {
    const e = it.ent; if (e.type !== 'silo' && e.type !== 'dimdepot') continue;
    const s = FS.sum[e.id]; setGauge(it, s ? (e.type === 'silo' ? s.n : s.n) / CAP[e.type] : 0);
  }
  for (const t of g.logi.tiles.values()) if (t.type === 'vault' && t.out) ensureOutMark(g, t);
}
// a yellow chute on the face an Output Vault feeds (host and guest)
function ensureOutMark(g, t) {
  const o = g.logi.objs.get(t.id); if (!o || o.userData.outMark) return;
  const ch = box(0.2, 0.14, 0.22, M.yellow); ch.position.set(0, 0.2, 0.34); o.add(ch);
  const ar = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4), M.glowO); ar.rotation.x = Math.PI / 2; ar.position.set(0, 0.2, 0.48); o.add(ar);
  o.userData.outMark = true; o.rotation.y = YAWS[(t.dir | 0) & 3];
}

// the 0.5 s row: power per ent and the storage summaries (sent when something changed, and every 5 s regardless)
function rowFor(g) {
  const L = lists(g), d = { pw: [], st: {}, al: FS.alarm ? 1 : 0, tr: [] };
  for (const it of L.list) {
    const e = it.ent;
    if (it.trip) d.tr.push(e.id);
    if (KW[e.type] !== undefined) d.pw.push(e.id, Math.round(clamp(e.pw ?? 0, 0, 1) * 100));
    if (isStore(e.type)) d.st[e.id] = summaryOf(g, e);
  }
  if (!d.pw.length && !Object.keys(d.st).length) { FS.lastRow = ''; return null; }   // nothing furnished: stay silent
  const s = JSON.stringify(d);
  if (s === FS.lastRow && g.time - FS.lastRowT < 5) return null;
  FS.lastRow = s; FS.lastRowT = g.time;
  return d;
}
function guestRowFor(g, d) {
  if (!d || typeof d !== 'object') return;
  if (Array.isArray(d.pw)) for (let q = 0; q + 1 < d.pw.length && q < 4000; q += 2) { const id = d.pw[q], v = d.pw[q + 1]; if (!Number.isFinite(id) || !Number.isFinite(v)) continue; const it = g.machines.items.get(id); if (it && KW[it.ent.type] !== undefined) it.ent.pw = clamp(v, 0, 100) / 100; }
  FS.alarm = !!d.al;   // a gate alarm and a tripped breaker are the host's to know: the beacons on a guest's screen flash from this
  if (Array.isArray(d.tr)) { const tr = new Set(d.tr); for (const it of lists(g).list) if (it.ent.type === 'wbeacon') it.trip = tr.has(it.ent.id); }
  if (d.st && typeof d.st === 'object') { const st = {}; for (const k of Object.keys(d.st).slice(0, 2000)) { const s = d.st[k]; if (s && typeof s === 'object') st[k] = s; } FS.sum = st; }
}

// ---------------------------------------------------------------- readouts
function powerText(e) { return (e.pw ?? 0) > 0.05 ? `Powered ${Math.round((e.pw ?? 0) * 100)}%` : 'No power: link it to a pole or a generator'; }
function nameOfItem(g, id) { const r = CRAFT && CRAFT.recipes(g).find((q) => q.id === id); return r ? r.name : id; }
function infoFor(kind) {
  return (g, e) => {
    const nm = NAME[e.type];
    if (e.type === 'locker' || e.type === 'pcrate') {
      const s = sumOf(g, e), mats = e.type === 'pcrate', cap = CAP[e.type];
      const items = s ? Object.entries(s.c).slice(0, 4).map(([k, n]) => `${n} ${mats && CRAFT ? (CRAFT.MATERIALS[k] || {}).name || k : nameOfItem(g, k)}`).join(', ') : '';
      return { title: nm.toUpperCase(), lit: true, lines: [s ? `${fmtN(s.t)} of ${fmtN(cap)} ${mats ? `units (${Math.ceil(s.t / STACK)} of 100 stacks)` : 'items'}` : 'Reading it...', items || 'Empty', 'E opens it and moves items in and out.'] };
    }
    if (e.type === 'silo' || e.type === 'dimdepot') {
      const s = sumOf(g, e), depot = e.type === 'dimdepot', cap = CAP[e.type], f = s ? s.f : e.filter ?? -1;
      const lines = [s ? `${fmtN(s.n)} of ${fmtN(cap)} plush stored` : 'Reading it...'];
      if (depot && s) lines.push(`Pool in ${DEPOT_RANGE} m: ${fmtN(s.p)} plush (${s.o} silos, ${s.v} vaults, this depot ${fmtN(s.n)})`);
      lines.push(`Belt out: the face it looks at. ${f >= 0 ? `Pulls only ${spName(f)}` : 'Pulls the oldest first'}.`);
      lines.push(depot ? 'E lists the pool and takes plush out. Belts at it fill it. Needs no power.' : 'Belts that end at it fill it. E sets the filter and takes plush out.');
      return { title: nm.toUpperCase(), lit: true, lines };
    }
    if (e.type === 'sign' || e.type === 'dsign' || e.type === 'psign') {
      const l = signLines(e), lines = [];
      if (e.type === 'psign') { const d = depthAt(e.x, e.z), f = frameFor(d); lines.push(`Depth here: ${fmtN(d)} m`, f ? `Cheapest frame rated for it: ${f.name}${isFinite(f.max) ? ` (to ${fmtN(f.max)} m)` : ''}` : 'No frame is rated this deep'); }
      else if (e.type === 'dsign') lines.push(`Arrow ${ARROWS[l.arrow]}${e.text ? `  "${e.text}"` : ''}`); else lines.push(`"${e.text || ''}"`);
      lines.push(e.lit ? powerText(e) : 'Unlit: draws no power', `Size ${e.size || 1} of 3. E edits it.`);
      return { title: nm.toUpperCase(), lit: !!e.lit && (e.pw ?? 0) > 0.05, lines };
    }
    const on = (e.pw ?? 0) > 0.05, mode = e.mode || (e.type === 'clamp' || e.type === 'wbeacon' ? 'auto' : 'on');
    const lines = [powerText(e), `Mode: ${mode}${e.type === 'clamp' && mode === 'auto' ? ` (${(FS.list.find((q) => q.ent.id === e.id) || {}).cov ? 'under a roof: on' : 'open: off'})` : ''}`, `Draws ${KW[e.type]} kW${e.type === 'strip' ? ' per 2.4 m' : ''}`];
    if (e.type === 'flood') lines.push(`Aimed ${e.deg || 0} degrees, tilt ${e.tilt || 0}, lights ${FLOOD_RANGE} m`);
    if (e.type === 'wbeacon') lines.push(`Flashes on a gate alarm or a tripped breaker${FS.alarm ? ' (ALARM NOW)' : ''}`);
    lines.push('E opens its panel.');
    return { title: nm.toUpperCase(), lit: on, lines };
  };
}

// ---------------------------------------------------------------- the panel (one modal, built on first use)
function ensurePanel() {
  let m = document.getElementById('furn'); if (m) return m;
  m = document.createElement('div'); m.id = 'furn'; m.className = 'modal hidden';
  m.innerHTML = '<div class="panel narrow" style="width:min(600px,94vw)"><header><h2 id="furnT">FURNISH</h2><button class="x" id="furnX">✕</button></header><div id="furnB" style="padding:14px 20px 18px;overflow:auto;display:flex;flex-direction:column;gap:12px;font-size:13px"></div></div>';
  document.body.appendChild(m);
  m.addEventListener('mousedown', (ev) => { if (ev.target === m) closePanel(); });
  m.querySelector('#furnX').onclick = closePanel;
  m.addEventListener('click', onPanelClick);
  m.addEventListener('change', onPanelChange);
  m.addEventListener('keydown', (ev) => { if (ev.code === 'Escape') closePanel(); if (ev.code === 'Enter' && ev.target && ev.target.tagName === 'INPUT') { const b = m.querySelector('[data-a="save"]'); if (b) b.click(); } });
  return m;
}
function closePanel() { clearInterval(FS.timer); FS.panel = null; if (FS.g) FS.g.ui.closeModals(); }
export function openPanel(g, e) {
  FS.g = g; FS.panel = { id: e.id }; ensurePanel(); renderPanel(g, true); g.openModal('furn');
  clearInterval(FS.timer);
  FS.timer = setInterval(() => { if (!FS.panel || g.ui.openModal !== 'furn') { clearInterval(FS.timer); return; } renderPanel(g, false); }, 700);
}
const btn = (label, attrs, cls = '') => `<button ${attrs} class="${cls}" style="padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:rgba(255,255,255,0.08);color:var(--ink)">${label}</button>`;
const sect = (title, body) => `<div style="background:rgba(255,255,255,0.045);border:1px solid rgba(255,255,255,0.09);border-radius:12px;padding:10px 12px"><div style="color:var(--dim);font-size:11px;letter-spacing:0.18em;margin-bottom:6px">${title}</div>${body}</div>`;

function renderPanel(g, force) {
  const m = document.getElementById('furn'); if (!m || !FS.panel) return;
  const it = g.machines.items.get(FS.panel.id); if (!it) { closePanel(); return; }
  const e = it.ent, body = m.querySelector('#furnB'), kind = e.type;
  const editing = kind === 'sign' || kind === 'dsign' || kind === 'psign' || kind === 'flood';
  if (!force && (editing || (document.activeElement && m.contains(document.activeElement) && document.activeElement.tagName === 'SELECT'))) return;
  const keep = body.scrollTop;
  m.querySelector('#furnT').textContent = NAME[kind].toUpperCase();
  let h = '';
  if (kind === 'locker' || kind === 'pcrate') h = renderItems(g, e);
  else if (kind === 'silo' || kind === 'dimdepot') h = renderPlush(g, e);
  else if (kind === 'sign' || kind === 'dsign' || kind === 'psign') h = renderSign(g, e);
  else h = renderLight(g, e);
  body.innerHTML = h; body.scrollTop = keep;
}
function renderItems(g, e) {
  const mats = e.type === 'pcrate', s = sumOf(g, e) || { c: {}, t: 0 }, cap = CAP[e.type], S = g.S;
  const bag = mats ? S.mats || {} : S.items;
  const nm = (k) => (mats ? (CRAFT && CRAFT.MATERIALS[k] ? `${CRAFT.MATERIALS[k].icon} ${CRAFT.MATERIALS[k].name}` : k) : nameOfItem(g, k));
  const row = (k, n, a) => `<div style="display:flex;gap:6px;align-items:center;justify-content:space-between;padding:3px 0"><span>${esc(nm(k))} <b>x${fmtN(n)}</b></span><span style="display:flex;gap:4px">${btn('1', `data-a="${a}" data-id="${esc(k)}" data-n="1"`)}${btn('10', `data-a="${a}" data-id="${esc(k)}" data-n="10"`)}${btn('All', `data-a="${a}" data-id="${esc(k)}" data-n="all"`)}</span></div>`;
  const mine = Object.keys(bag).filter((k) => bag[k] > 0 && (mats || lockerOk(k)));
  const inside = Object.keys(s.c).filter((k) => s.c[k] > 0);
  return `<div style="color:var(--dim)">${fmtN(s.t)} of ${fmtN(cap)} ${mats ? `units used (${Math.ceil(s.t / STACK)} of 100 stacks)` : 'items used'}</div>`
    + sect('IN YOUR PACK', mine.map((k) => row(k, bag[k], 'put')).join('') || '<span style="color:var(--dim)">Nothing that fits.</span>')
    + sect(`IN THE ${mats ? 'CRATE' : 'LOCKER'}`, inside.map((k) => row(k, s.c[k], 'take')).join('') || '<span style="color:var(--dim)">Empty.</span>');
}
function renderPlush(g, e) {
  const depot = e.type === 'dimdepot', s = sumOf(g, e) || { n: 0, p: 0, v: 0, o: 0, f: -1, s: [] }, cap = CAP[e.type];
  const carry = g.S.carry.filter((q) => q.sp !== NEEDLE).length;
  const f = s.f ?? -1, list = s.s || [], inList = list.some(([sp]) => sp === f);
  const opts = [`<option value="-1"${f < 0 ? ' selected' : ''}>Any (oldest first)</option>`].concat(list.slice().sort((a, b) => spName(a[0]).localeCompare(spName(b[0]))).map(([sp, n]) => `<option value="${sp}"${sp === f ? ' selected' : ''}>${esc(spName(sp))} (${fmtN(n)})</option>`));
  if (f >= 0 && !inList) opts.push(`<option value="${f}" selected>${esc(spName(f))} (none now)</option>`);
  const rows = list.slice(0, 40).map(([sp, n]) => `<div style="display:flex;gap:6px;align-items:center;justify-content:space-between;padding:2px 0"><span>${esc(spName(sp))} <span style="color:var(--dim)">${esc((RARITY[species[sp].rarity] || {}).name || '')}</span> <b>x${fmtN(n)}</b></span><span style="display:flex;gap:4px">${btn('1', `data-a="get" data-sp="${sp}" data-n="1"`)}${btn('10', `data-a="get" data-sp="${sp}" data-n="10"`)}${btn('Fit', `data-a="get" data-sp="${sp}" data-n="all"`)}</span></div>`).join('');
  return `<div style="color:var(--dim)">${fmtN(s.n)} of ${fmtN(cap)} plush stored${depot ? `. Pool within ${DEPOT_RANGE} m: <b style="color:var(--ink)">${fmtN(s.p)}</b> (${s.o} silos, ${s.v} vaults)` : ''}</div>`
    + sect('FILTER FOR THE BELT OUT', `<select data-a="filter" style="width:100%;padding:6px;border-radius:8px;background:rgba(0,0,0,0.35);color:var(--ink);border:1px solid var(--line)">${opts.join('')}</select><div style="color:var(--dim);font-size:12px;margin-top:6px">The belt on the face it looks at gets one plush per belt spacing.</div>`)
    + sect('YOUR HANDS', `<div style="display:flex;gap:8px;flex-wrap:wrap">${btn(`Store what I carry (${carry})`, 'data-a="dep"')}${btn('Take any 10', 'data-a="get" data-sp="-1" data-n="10"')}${btn('Take any, as many as fit', 'data-a="get" data-sp="-1" data-n="all"')}</div>`)
    + sect(depot ? 'THE POOL' : 'CONTENTS', rows || '<span style="color:var(--dim)">Empty.</span>');
}
function renderSign(g, e) {
  const sel = (id, opts, cur) => `<select id="${id}" style="padding:6px;border-radius:8px;background:rgba(0,0,0,0.35);color:var(--ink);border:1px solid var(--line)">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const fld = (label, inner) => `<label style="display:flex;gap:10px;align-items:center;justify-content:space-between">${label}${inner}</label>`;
  let h = '';
  if (e.type === 'sign') h += fld('Text', `<input id="fText" maxlength="32" value="${esc(e.text || '')}" style="flex:1;margin-left:12px;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,0.35);color:var(--ink);border:1px solid var(--line)">`);
  if (e.type === 'dsign') h += fld('Label', `<input id="fText" maxlength="16" value="${esc(e.text || '')}" style="flex:1;margin-left:12px;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,0.35);color:var(--ink);border:1px solid var(--line)">`) + fld('Arrow', sel('fArrow', ARROWS.map((a, q) => [q, a]), e.arrow | 0));
  if (e.type === 'sign') {
    h += fld('Icon', sel('fIcon', Object.keys(ICONS).map((k) => [k, k === 'species' ? 'A plush species' : `${ICONS[k] || ''} ${k}`]), e.icon || 'none'));
    const sp = Array.from({ length: species.length - 1 }, (_, q) => q + 1).filter((q) => g.S.dex && g.S.dex[q] !== undefined).sort((a, b) => spName(a).localeCompare(spName(b)));
    h += fld('Species (for the plush icon)', sel('fSp', [[0, 'none']].concat(sp.map((q) => [q, spName(q)])), e.sp | 0));
  }
  h += fld('Size', sel('fSize', [[1, '1 small'], [2, '2 medium'], [3, '3 large']], e.size || 1)) + fld('Colour', sel('fTone', Object.keys(TONES).map((k) => [k, k]), e.tone || 'green'));
  h += fld('Lit (0.1 kW)', `<input id="fLit" type="checkbox"${e.lit ? ' checked' : ''}>`);
  if (e.type === 'psign') h += `<div style="color:var(--dim)">It prints the depth where it stands (${fmtN(depthAt(e.x, e.z))} m) and the cheapest frame rated for it.</div>`;
  return h + `<div style="display:flex;gap:8px;justify-content:flex-end">${btn('Save', 'data-a="save"', 'primary')}${btn('Close', 'data-a="close"')}</div>`;
}
function renderLight(g, e) {
  const modes = e.type === 'clamp' || e.type === 'wbeacon' ? ['auto', 'on', 'off'] : ['on', 'off'], cur = e.mode || modes[0];
  let h = `<div style="color:var(--dim)">${powerText(e)}. Draws ${KW[e.type]} kW${e.type === 'strip' ? ' per 2.4 m' : ''}.</div>`;
  h += sect('MODE', `<div style="display:flex;gap:8px">${modes.map((m) => btn(m.toUpperCase(), `data-a="mode" data-v="${m}"`, m === cur ? 'sel' : '').replace('background:rgba(255,255,255,0.08)', m === cur ? 'background:var(--accent);color:#1a2008' : 'background:rgba(255,255,255,0.08)')).join('')}</div><div style="color:var(--dim);font-size:12px;margin-top:6px">${e.type === 'clamp' ? 'Auto: on under a roof or a frame.' : e.type === 'wbeacon' ? 'Auto: flashes on a gate alarm or a tripped breaker.' : ''}</div>`);
  if (e.type === 'flood') h += sect('AIM', `<label style="display:flex;gap:10px;align-items:center">Turn <input id="fDeg" type="range" min="0" max="359" value="${e.deg || 0}" style="flex:1"> <span id="fDegV">${e.deg || 0}</span></label><label style="display:flex;gap:10px;align-items:center">Tilt <input id="fTilt" type="range" min="-85" max="85" value="${e.tilt || 0}" style="flex:1"> <span id="fTiltV">${e.tilt || 0}</span></label><div style="display:flex;justify-content:flex-end;margin-top:8px">${btn('Aim', 'data-a="aim"')}</div>`);
  return h;
}
function onPanelClick(ev) {
  const b = ev.target.closest('[data-a]'); if (!b || !FS.panel) return;
  const g = FS.g, it = g.machines.items.get(FS.panel.id); if (!it) return;
  const e = it.ent, a = b.dataset.a, $ = (id) => document.getElementById(id);
  let r = null;
  if (a === 'close') { closePanel(); return; }
  if (a === 'put' || a === 'take') r = g.setCfg(e, { act: { k: a, id: b.dataset.id, n: b.dataset.n === 'all' ? 100000 : +b.dataset.n } });
  else if (a === 'dep') {
    if (g.isGuest()) {
      const items = g.S.carry.filter((q) => q.sp !== NEEDLE).slice(0, 64).map((q) => ({ sp: q.sp, vr: q.vr & 255 }));
      if (!items.length) { g.ui.hint('You carry nothing that fits.', 2); return; }
      r = g.setCfg(e, { act: { k: 'dep', items } });
      if (r.ok) { for (const q of items) { const n = g.S.carry.findIndex((c) => c.sp === q.sp && c.vr === q.vr); if (n >= 0) g.S.carry.splice(n, 1); } g.ui.setCarry(g.S.carry, g.T.carry); }
    } else r = g.setCfg(e, { act: { k: 'dep' } });
  } else if (a === 'get') {
    const room = Math.max(0, g.T.carry - g.S.carry.length), n = b.dataset.n === 'all' ? Math.max(1, room) : +b.dataset.n;
    r = g.setCfg(e, { act: { k: 'get', sp: +b.dataset.sp, n } });
  } else if (a === 'mode') r = g.setCfg(e, { mode: b.dataset.v });
  else if (a === 'aim') r = g.setCfg(e, { deg: +$('fDeg').value | 0, tilt: +$('fTilt').value | 0 });
  else if (a === 'save') {
    const patch = {}, val = (id) => { const el = $(id); return el ? el.value : undefined; };
    if (e.type !== 'psign') { if (val('fText') !== undefined) patch.text = val('fText'); }
    if (e.type === 'dsign') patch.arrow = +val('fArrow') | 0;
    if (e.type === 'sign') { patch.icon = val('fIcon'); patch.sp = +val('fSp') | 0; }
    patch.size = +val('fSize'); patch.tone = val('fTone'); patch.lit = !!$('fLit').checked;
    r = g.setCfg(e, patch);
    if (r.ok) { g.sound.place(); g.ui.hint('Saved.', 1.5); }
  }
  if (r && !r.ok) { g.sound.error(); g.ui.hint(r.why || 'Could not do that', 2.5); }
  if (!g.isGuest()) renderPanel(g, true);
}
function onPanelChange(ev) {
  const t = ev.target; if (!FS.panel || !t) return;
  const g = FS.g, it = g.machines.items.get(FS.panel.id); if (!it) return;
  if (t.dataset && t.dataset.a === 'filter') { const r = g.setCfg(it.ent, { filter: +t.value }); if (r && !r.ok) g.ui.hint(r.why, 2.5); }
  if (t.id === 'fDeg') { const s = document.getElementById('fDegV'); if (s) s.textContent = t.value; }
  if (t.id === 'fTilt') { const s = document.getElementById('fTiltV'); if (s) s.textContent = t.value; }
}

// ---------------------------------------------------------------- the catalog handlers
const toneKeys = () => Object.keys(TONES);
function cfgFor(kind) {
  const act = () => V.obj({ k: V.enum(['put', 'take', 'dep', 'get']), id: V.str(40), n: V.int(0, 100000), sp: V.int(-1, maxSp()), items: V.arr(64, V.obj({ sp: V.int(1, maxSp()), vr: V.int(0, 255) })) });
  const size = V.int(1, 3), tone = V.enum(toneKeys()), lit = V.bool;
  switch (kind) {
    case 'sign': return { text: V.str(32), size, tone, icon: V.enum(Object.keys(ICONS)), sp: V.int(0, maxSp()), lit };
    case 'dsign': return { text: V.str(16), arrow: V.int(0, 7), size, tone, lit };
    case 'psign': return { size, tone, lit };
    case 'clamp': case 'wbeacon': return { mode: V.enum(['auto', 'on', 'off']) };
    case 'flood': return { mode: V.enum(['on', 'off']), deg: V.int(0, 359), tilt: V.int(-85, 85) };
    case 'strip': return { mode: V.enum(['on', 'off']) };
    case 'locker': case 'pcrate': return { act: act() };
    case 'silo': case 'dimdepot': return { filter: V.int(-1, maxSp()), act: act() };
    default: return {};
  }
}
const VISUAL = new Set(['text', 'size', 'tone', 'icon', 'sp', 'arrow', 'deg', 'tilt', 'lit']);   // a change of these redraws the model

function checkFor(kind) {
  return (g, e, c, actor) => {
    if (c.filter !== undefined && c.filter >= 0 && !species[c.filter]) return 'That is not a species';
    if (c.sp !== undefined && c.sp > 0 && !species[c.sp]) return 'That is not a species';
    if (c.act) {
      const a = c.act;
      if (actor === 'guest' && g.remote && g.remote.pos && Math.hypot(g.remote.pos.x - e.x, g.remote.pos.z - e.z) > 9) return 'Too far away';
      if ((kind === 'locker' || kind === 'pcrate') && !(a.k === 'put' || a.k === 'take')) return 'A crate takes items, not plush';
      if ((kind === 'silo' || kind === 'dimdepot') && !(a.k === 'dep' || a.k === 'get')) return 'A silo takes plush, not items';
      if ((a.k === 'put' || a.k === 'take') && !a.id) return 'Which item?';
      if (a.k === 'get' && a.sp !== undefined && a.sp >= 0 && !species[a.sp]) return 'That is not a species';
      if (a.k === 'dep' && actor === 'guest' && !(a.items && a.items.length)) return 'Nothing to store';
      if (a.items) for (const it of a.items) if (!species[it.sp]) return 'That is not a species';
      g._furnActor = actor;
    }
    return null;
  };
}
function relayout(e) { const L = layout(e.type, e.mount, e.i, e.j, e.k, e.dir | 0, e.size || 1); e.x = L.x; e.y = L.y; e.z = L.z; e.h = L.h; }
function onCfgFor(kind) {
  return (g, e, c) => {
    if (c.act) { const a = c.act; delete e.act; const actor = g._furnActor || 'host'; g._furnActor = null; doAct(g, e, a, actor); }
    if (c.size !== undefined && (kind === 'sign' || kind === 'dsign' || kind === 'psign')) relayout(e);
    if (Object.keys(c).some((k) => VISUAL.has(k))) rebuild(g, e);
    else if (c.mode !== undefined) { const it = g.machines.items.get(e.id); if (it) it.key = -1; }
    FS.lastRow = '';
  };
}

export function makeTypes() {
  const T = {};
  const common = (kind, extra = {}) => {
    T[kind] = {
      cfg: () => cfgFor(kind), check: checkFor(kind), onCfg: onCfgFor(kind), info: infoFor(kind), add: addFor,
      plan: planFor(kind), preview: previewFor(kind), build: buildFor(kind), conflict: conflictFor(kind),
      use: (g, e) => { openPanel(g, e); return true; },
      onRemove: (g, e) => { const it = g.machines.items.get(e.id); if (it) disposeTex(it.obj); if (isStore(e.type)) refund(g, e); },
      ...extra,
    };
  };
  for (const k of KINDS) common(k);
  for (const k of Object.keys(KW)) { T[k].consumer = true; T[k].kw = furnKw; }   // for power.js: these are consumers on a grid, kW from furnKw(ent) (lit signs, lamps in mode off draw nothing)
  T.locker.copy = []; T.pcrate.copy = [];
  T.silo.copy = ['filter']; T.silo.group = 'plushstore'; T.dimdepot.copy = ['filter']; T.dimdepot.group = 'plushstore';
  for (const k of ['sign', 'dsign', 'psign']) T[k].group = 'sign';
  T.sign.copy = ['size', 'tone', 'icon', 'lit']; T.dsign.copy = ['size', 'tone', 'lit']; T.psign.copy = ['size', 'tone', 'lit'];
  T.clamp.copy = ['mode']; T.flood.copy = ['mode', 'tilt']; T.strip.copy = ['mode']; T.wbeacon.copy = ['mode'];
  // the Output Vault is a tool only: it builds a normal vault tile with out:true
  T.ovault = { plan: ovaultPlan, build: (g, tool, e) => ({ type: 'vault', i: e.i, j: e.j, k: e.k, dir: e.dir, rise: 0, out: true }), conflict: (g, e) => (g.logi.canPlace(e.i, e.j, e.k) || (g.T.furnSilo ? null : 'Not unlocked')) };
  // vault tiles: an Output Vault comes back as its own item, a silo's hidden intake crate answers for the silo
  T.vault = {
    item: (e) => (e.out ? 'ovault' : undefined),
    info: (g, e) => { if (!e.intakeFor) return null; const o = g.machines.items.get(e.intakeFor); return o ? T[o.ent.type].info(g, o.ent) : null; },
    infoExtra: (g, e) => (e.out && !e.intakeFor ? [`OUTPUT: pulls the oldest plush onto the belt it faces${(g.logi.tiles.get(idx(e.i + DX[e.dir | 0], e.j, e.k + DZ[e.dir | 0])) ? '' : ' (no belt there)')}`] : []),
    use: (g, e) => { if (!e.intakeFor) return false; const o = g.machines.items.get(e.intakeFor); if (!o) return false; openPanel(g, o.ent); return true; },
  };
  // the per frame work (host and guest) and the 0.5 s row live on a pseudo type so they run once per frame, not once per ent
  T.furnish = { tick: hostTick, guestTick, row: rowFor, guestRow: guestRowFor };
  return T;
}
