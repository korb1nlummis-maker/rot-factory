import { species, SPECIAL_MIN, isSpecialCell } from './plushdata.js';
import { C, cellX, cellZ, toI, toJ, toK } from './config.js';
import { FUEL_MAX_RARITY, burnTime } from './power.js';
import { genHopper, genKindOf, genKw, secText } from './powerparts.js';
import * as NAV from './botnav.js';   // is there a way on foot to a machine on another level (the call routes, botroutes.js, ask the same graph)

// ---------------------------------------------------------------------------------------------------------------------------------
// Machines that run on plush, and the little robots that keep them fed.
//
// ONE FUEL RULE for every machine that eats plush (a generator of any rung, the Charging Station): it holds 50 plush by default
// (the Fuel Hoppers upgrades and the bigger rungs of the generator ladder raise a generator's hopper, as they always did), it takes
// Common to Epic and never Legendary, Mythic or The One, and how long (or how much charge) one plush gives is set by its rarity.
// fuelRoom() and fuelAccepts() are the only places that say whether a plush may go in: hands, throws, belts, sorters, bots and the
// host all ask them (logistics.js accept() calls fuelAccepts).
//
// BOTS KEEP MACHINES FUELED (the toggle 'Keep machines fueled', on by default, per crew and per bot):
//   * a bot with a load that is about to unload first tops up the machines in reach that have room for what it carries (the emptiest
//     first, the nearer one when two are about as empty), handing over its cheapest plush first, then takes the rest to its bin;
//   * an idle bot with nothing to carry goes SCOOPING when a generator that powers something in use, or a Charging Station, is under
//     40% full: it digs the nearest plush the machine may legally take and fills the machine;
//   * a bot reserves the slots it means to fill (b.fuelJob = { id, n, k }) so two bots never chase the same hopper;
//   * a machine on another level (more than 2.2 m above or below the bot: a catwalk, a stacked plate, the floor above) is fueled too: the bot walks
//     toward it, and when it cannot climb (stuck 6 s on the way, or 5 s at the foot with the machine out of reach) it phases up beside the machine,
//     as it phases home when stuck, hands the plush over and phases back down to its bin (see phaseUp, job.far);
//   * PRIORITY: when a generator that powers something, or a Charging Station, is under 15% full and no bot is idle, the digging bot nearest to it
//     (under its load limit, battery above 50%, not told to stay, with the switches on) finishes the cell it is on and then digs fuel for it from the face
//     where it stands, then goes back to its own dig. One such bot per machine, and never more than a quarter of the crew at once (see divertThink);
//   * low batteries still go first (a bot under 35% does nothing here), assigned bins still decide where the rest is sold.
// Nothing here makes plush: a plush is taken out of the pile (or out of the bot's bucket) and put into a hopper, and a bot that is
// interrupted keeps what it carries. Plush given to a machine is not sold.
// ---------------------------------------------------------------------------------------------------------------------------------
export const FUEL_HOLD = 50;                                  // what every plush-fed machine holds by default
export const CHARGE_PER = [0.34, 0.7, 1.5, 4.0];              // Charging Station: reserve units per plush by rarity (1.0 is one full bot battery)
export const CHARGER_CAP = 8, CHARGER_HOPPER = FUEL_HOLD, CHARGER_MAX_RARITY = 3;
export const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic'];
export const FUEL_RANGE = 60;      // metres: how far from where it stands a bot looks for a machine to fuel
export const SCOOP_BELOW = 0.4;    // a machine under this fraction of its hopper calls for a scooping bot
export const MAX_HOPS = 4;         // machines one bot tops up on one trip
export const HOME_RADIUS = 14;     // metres: a bot sets off to scoop only from this near its bin
export const IN_USE_KW = 0.1;      // a generator counts as 'in use' when its grid draws more than this
export const DIVERT_BELOW = 0.15;  // a machine under this fraction of its hopper pulls a digging bot off its dig when nobody is idle
export const DIVERT_SHARE = 0.25;  // at most this share of the crew is diverted at once
export const DIVERT_BATTERY = 0.5; // a digging bot needs more than this to be diverted
const GIVE_EVERY = 0.12, OK_BATTERY = 0.35, BAD_FOR = 90, HEIGHT = 2.2, PHASE_WALK = 6, PHASE_FOOT = 5;

// a Charging Station works only with a cable from a live grid (a normal 1 kW consumer: `pw` is the satisfaction of its grid, 0 with no cable)
export const chargerPowered = (t) => !!t && t.type === 'charger' && (t.pw ?? 0) > 0.05;
export const isFueled = (t) => !!t && (t.type === 'gen' || t.type === 'charger');
export const fuelCap = (g, t) => (!t ? 0 : t.type === 'gen' ? genHopper(g.T, t) : t.type === 'charger' ? CHARGER_HOPPER : 0);
export const fuelMaxRarity = (t) => (t && t.type === 'gen' ? FUEL_MAX_RARITY : t && t.type === 'charger' ? CHARGER_MAX_RARITY : -1);
// a real species id (a whole number below the specials: not The One, not a decoy, a pad, a cache, remains or a bulkhead, not a made-up number) has a rarity; anything else counts as 9 and no machine takes it
export const rarityOf = (item) => (item && Number.isInteger(item.sp) && item.sp > 0 && item.sp < SPECIAL_MIN && species[item.sp] ? species[item.sp].rarity : 9);
export const fuelRoom = (g, t) => (isFueled(t) && Array.isArray(t.q) ? Math.max(0, fuelCap(g, t) - t.q.length) : 0);
export const fuelTakes = (t, item) => isFueled(t) && rarityOf(item) <= fuelMaxRarity(t);   // would the machine take this plush if it had room?
export const fuelAccepts = (g, t, item) => fuelTakes(t, item) && fuelRoom(g, t) > 0;

// ------------------------------------------------------------------------------------------------------------ names and numbers
const letters = (n) => String.fromCharCode(65 + (n % 26)) + (n >= 26 ? Math.floor(n / 26) : '');
// what the crew calls a machine: 'Generator A', 'Turbine Generator B', 'Charging Station A' (the letters follow the machines' ids, per kind)
export function fuelName(g, t) {
  if (!t) return 'a machine';
  const gk = t.type === 'gen' ? genKindOf(t) : null;
  let n = 0;
  for (const o of machines(g)) if (o !== t && o.type === t.type && o.id < t.id && (!gk || genKindOf(o) === gk)) n++;   // (the short list of plush-fed machines, not every belt in the world)
  return `${t.type === 'charger' ? 'Charging Station' : gk.name} ${letters(n)}`;
}
export function longTime(sec) {
  if (!(sec >= 0)) return '0 s';
  if (sec < 3600) return secText(sec);
  if (sec < 86400) { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return m === 60 ? `${h + 1} h` : `${h} h ${m} min`; }
  const d = Math.floor(sec / 86400), h = Math.round((sec % 86400) / 3600); return h === 24 ? `${d + 1} d` : `${d} d ${h} h`;
}
// seconds one plush of rarity r runs a generator (its output is in kW)
export const runSeconds = (g, t, r) => burnTime(r, genKw(g.T, t));
// the hover lines both machines share: what one plush gives, how many it holds and how long a full hopper lasts
export function fuelLines(g, t) {
  const cap = fuelCap(g, t), per = [0, 1, 2, 3];
  if (t.type === 'gen') {
    return [
      `Per plush: ${per.map((r) => `${RARITY_NAMES[r]} ${longTime(runSeconds(g, t, r))}`).join(', ')}`,
      `Holds ${cap} plush. A full hopper lasts: ${per.map((r) => `${RARITY_NAMES[r]} ${longTime(cap * runSeconds(g, t, r))}`).join(', ')}`,
    ];
  }
  return [
    `Per plush: ${per.map((r) => `${RARITY_NAMES[r]} ${Math.round(CHARGE_PER[r] * 100)}% of a bot battery`).join(', ')}`,
    `Holds ${cap} plush. A full hopper refills this many empty bots: ${per.map((r) => `${RARITY_NAMES[r]} ${Math.floor(cap * CHARGE_PER[r])}`).join(', ')}`,
  ];
}

// ------------------------------------------------------------------------------------------------------------ who wants what
export const enabled = (g, b) => !!b && g.S.crewFuel !== false && !b.fuelOff;
// the machines that eat plush, rebuilt twice a second (a world with thousands of belts is not walked for every bot)
export function machines(g) {
  const c = g._fuelMach, now = g.time || 0;
  if (c && c.L === g.logi && Math.abs(now - c.t) < 0.5 && c.n === g.logi.tiles.size) return c.list;
  const list = []; for (const t of g.logi.tiles.values()) if (t.type === 'gen' || t.type === 'charger') list.push(t);
  g._fuelMach = { L: g.logi, t: now, n: g.logi.tiles.size, list };
  return list;
}
// slots other bots have promised to fill (a bot that reserved them is on its way)
const JOB_STATES = new Set(['goto', 'farm', 'advance', 'blocked', 'fwalk', 'fgive']);   // (a job a bot no longer works on reserves nothing, whatever left it behind)
export function reserved(g, t, except) {
  let n = 0;
  for (const b of g.S.crew || []) { const j = b.fuelJob; if (j && j.id === t.id && b !== except && JOB_STATES.has(b.state)) n += Math.max(0, j.n | 0); }
  return n;
}
export const freeRoom = (g, t, except) => Math.max(0, fuelRoom(g, t) - reserved(g, t, except));
const fillOf = (g, t, except) => (t.q.length + reserved(g, t, except)) / Math.max(1, fuelCap(g, t));
// does a machine call for a scooping bot? a generator on a grid that is in use, a Charging Station that holds little charge, and under 40% of a hopper
export function starving(g, t) {
  if (!isFueled(t) || fuelCap(g, t) <= 0 || t.q.length >= fuelCap(g, t) * SCOOP_BELOW) return false;
  if (t.type === 'gen') { const net = g.power && g.power.netOfEnt ? g.power.netOfEnt(t) : null; return !!net && net.demand > IN_USE_KW; }   // a grid that wants more than a stray belt's trickle
  return chargerPowered(t) && (t.reserve || 0) < CHARGER_CAP * 0.5;   // (a station with no cable charges nobody: nothing to keep fueled)
}
const isBad = (g, b, t) => !!b.fuelBad && b.fuelBad[t.id] > (g.time || 0);
const markBad = (g, b, id) => { b.fuelBad = b.fuelBad || {}; b.fuelBad[id] = (g.time || 0) + BAD_FOR; };
// a machine on another level that the graph proves nobody can walk to (no ramp, stair, ladder or working lift, a lock): the bot says so once, the machine is not offered to it for a minute, other bots may take it
export const NO_WAY_FOR = 60;
function farBlocked(g, b, t) {
  if (!isFar(t, b) || !NAV.isEnabled()) return false;
  const to = { x: cellX(t.i), y: t.j * C, z: cellZ(t.k) };
  if (NAV.isGround(b) && NAV.isGround(to)) return false;   // (pile floor to pile floor, a post of plush or a pit: the old walk and the phase up handle it, as they always did)
  const nw = NAV.noWay(b, to, { r: 1.6, dy: 0.35, floor: true }); if (!nw) return false;
  b.fuelBad = b.fuelBad || {}; b.fuelBad[t.id] = (g.time || 0) + NO_WAY_FOR;
  const said = g._fuelNoWay || (g._fuelNoWay = {});
  if (!((said[b.id] || -1e9) > (g.time || 0))) { said[b.id] = (g.time || 0) + NO_WAY_FOR; g.ui.toast({ icon: '🤖', title: `${b.name}: ${nw.why || 'No way up'}`, text: `It found no way up to ${fuelName(g, t)}. It tries again in a minute; another bot may take it.`, ms: 5000 }); }
  return true;
}

// bots walk in straight lines and stop at a wall: can this walk be made on foot? Anything solid at head height along it (a room of the player's built around a machine, a bulkhead, the
// pile itself) says no. A bot that is sent into one stands against it for 25 s and is phased home, so it is never sent.
function walkClear(g, b, path) {
  const w = g.world, j = Math.max(0, toJ(b.y)); let px = b.x, pz = b.z;
  for (const [x, z] of path) {
    const n = Math.max(1, Math.ceil(Math.hypot(x - px, z - pz) / 0.3));
    for (let s = 1; s <= n; s++) { const i = toI(px + (x - px) * s / n), k = toK(pz + (z - pz) * s / n); for (let v = 1; v < 3; v++) if (w.solid(i, j + v, k)) return false; }   // (one cell up is a lip a bot hops)
    px = x; pz = z;
  }
  return true;
}
const isFar = (t, b) => Math.abs(t.j * C - b.y) > HEIGHT;
// the machine a bot should fuel next from where it stands: the emptiest first, the nearer one when two are about as empty.
// want(t) -> how many slots this bot would fill there (0: skip it)
function choose(crew, b, want) {
  const g = crew.game, cands = [];
  for (const t of machines(g)) {
    if (g.logi.byId.get(t.id) !== t || isBad(g, b, t)) continue;
    const far = isFar(t, b);   // (another level: the walk is a straight line, the last step a phase)
    const d = Math.hypot(cellX(t.i) - b.x, cellZ(t.k) - b.z); if (d > FUEL_RANGE) continue;
    const n = want(t); if (n <= 0) continue;
    cands.push({ t, n, d, far, f: fillOf(g, t, b) });
  }
  const h = crew.home(b);
  while (cands.length) {
    let lo = 2; for (const c of cands) if (c.f < lo) lo = c.f;
    let best = null; for (const c of cands) if (c.f <= lo + 0.1 && (!best || c.d < best.d)) best = c;
    const path = crew.routePath(b, cellX(best.t.i), cellZ(best.t.k), 0.9);
    if (!best.far && !walkClear(g, b, path)) markBad(g, b, best.t.id);   // (walled in: not asked about again for a while)
    else if (best.far && farBlocked(g, b, best.t)) { /* no way up: dropped for a minute */ }
    else if (crew.canReach(b, [...path, [h.x, h.z]])) return best;
    cands.splice(cands.indexOf(best), 1);
  }
  return null;
}

// ------------------------------------------------------------------------------------------------------------ giving plush
function start(crew, b, t, n, kind) {
  b.fuelJob = { id: t.id, n, k: kind };
  if (isFar(t, b)) b.fuelJob.far = true;
  b.path = crew.routePath(b, cellX(t.i), cellZ(t.k), 0.9); b.pi = 0; b.state = 'fwalk'; b.scanT = 0; b.stall = 0;
  b.fuelHops = (b.fuelHops | 0) + 1;
}
// a bot with a load that is about to unload: the next machine in reach with room for something it carries. True when it set off.
export function tryTopUp(crew, b) {
  const g = crew.game;
  if (!enabled(g, b) || !b.carry.length || b.deliver || (b.fuelHops | 0) >= MAX_HOPS || b.battery < OK_BATTERY) return false;
  const pick = choose(crew, b, (t) => Math.min(freeRoom(g, t, b), b.carry.reduce((a, it) => a + (fuelTakes(t, it) ? 1 : 0), 0)));
  if (!pick) return false;
  start(crew, b, pick.t, pick.n, 'give');
  return true;
}
// can the bot walk from where it stands to the pile face the scan found? The scan reads a bulkhead, a pad, a cache or remains as open ground (an order of the player's may send a bot
// across them and it waits at the wall), so a bot that sets off on its own first checks every cell on the way.
function wayClear(g, b, nf) {
  const w = g.world, dx = [1, 0, -1, 0][nf.dir], dz = [0, 1, 0, -1][nf.dir], j = Math.max(0, toJ(b.y));
  let i = toI(b.x), k = toK(b.z);
  for (let s = 0; s < 400; s++) {
    for (let v = 0; v < 3; v++) { const c = w.get(i, j + v, k); if (c && isSpecialCell(c)) return false; }
    if (i === nf.face.i && k === nf.face.k) return true;
    i += dx; k += dz;
  }
  return false;
}
// would an idle bot answer a call for fuel? (the switches, not told to stay, an empty bucket, a battery that is not low, and near its bin)
function canScoop(crew, b) {
  const g = crew.game;
  if (!enabled(g, b) || b.stay || b.carry.length || b.deliver || b.battery < OK_BATTERY + 0.1) return false;
  const hh = crew.home(), hb = crew.home(b); if (Math.min(Math.hypot(b.x - hh.x, b.z - hh.z), Math.hypot(b.x - hb.x, b.z - hb.z)) > HOME_RADIUS) return false;   // a bot out in the mine (it finished charging there) walks back first: the nearest face out there is somebody's tunnel wall
  return true;
}
// an idle bot with an empty bucket: dig fuel for the emptiest machine that calls for it. True when it set off.
export function tryScoop(crew, b) {
  const g = crew.game;
  if (!canScoop(crew, b)) return false;
  const pick = choose(crew, b, (t) => (starving(g, t) ? freeRoom(g, t, b) : 0));
  if (!pick) return false;
  const nf = crew.nearestFace(b.x, b.y, b.z);
  if (!nf || nf.d > 100 || !wayClear(g, b, nf)) { b.fuelT = 20; return false; }   // no pile to dig near here, or a wall of the player's in the way: look again later
  const n = Math.min(pick.n, crew.capacity(b));
  if (!crew.order(b, nf.dir, b.x, b.y, b.z, true)) { b.fuelT = 20; return false; }
  b.fuelJob = { id: pick.t.id, n, k: 'scoop' }; b.scoopHome = true; b.stay = false;
  return true;
}
// the idle bot polls about once a second and a half
export function idleThink(crew, b, dt) {
  if (b.fuelUp && !b.fuelJob) phaseDown(crew.game, b);   // (idle on a catwalk after an errand that was cut short: back to the bin)
  b.fuelT = (b.fuelT || 0) - dt; if (b.fuelT > 0) return;
  b.fuelT = 1.5 + (b.id % 5) * 0.1;
  if (b.carry.length) { if (tryTopUp(crew, b)) return; } else tryScoop(crew, b);
}
// plush the bot may dig for its job: only what the machine will take (not The One, not a special, not a plush that is too valuable)
export function legalCell(crew, b, sp) {
  const j = b.fuelJob, t = j ? crew.game.logi.byId.get(j.id) : null;
  return !!t && rarityOf({ sp }) <= fuelMaxRarity(t);
}
// a scooping bot after each plush: enough in the bucket (or the machine got full some other way)? Then it walks to the machine.
export function scoopCheck(crew, b) {
  const j = b.fuelJob; if (!j || j.k !== 'scoop') return false;
  const g = crew.game, t = g.logi.byId.get(j.id);
  if (!t || !isFueled(t)) { b.fuelJob = null; if (j.dv) return false; crew.goHome(b); return true; }
  const want = Math.min(j.n, crew.capacity(b));
  const have = b.carry.reduce((a, it) => a + (fuelTakes(t, it) ? 1 : 0), 0);   // (a diverted digger may already carry plush the machine will not take: only the rest counts)
  if (have < want && fuelRoom(g, t) > have) return false;
  if (!have) { b.fuelJob = null; if (j.dv) return false; crew.goHome(b); return true; }   // (a diverted digger whose machine got full some other way just digs on)
  start(crew, b, t, have, 'give');
  return true;
}
// nothing to dig that fits (or a wall): back to the bin with what it has, the machine is left alone for a while
export function scoopFail(crew, b) {
  const j = b.fuelJob, g = crew.game, t = j ? g.logi.byId.get(j.id) : null;
  b.fuelJob = null;
  if (b.carry.length && t && isFueled(t) && b.carry.some((it) => fuelTakes(t, it))) { start(crew, b, t, b.carry.length, 'give'); return; }   // what it did dig still goes to the machine
  if (j) markBad(g, b, j.id);
  crew.goHome(b);
}

// ------------------------------------------------------------------------------------------------------------ priority: a starving machine and a crew that is all digging
// Only idle bots scoop (tryScoop). When a generator that powers something, or a Charging Station, is under 15% full and no bot is idle, the digging bot nearest to it is pulled
// off its dig: it finishes the cell it is on (b.divert = the machine's id; startDivert runs when its dig timer is up), digs fuel from the face where it stands (the same errand
// with job.dv, the machine's plush only, kept in the bucket), hands it over and goes back to its own dig. One bot per machine, a quarter of the crew at most.
const DIGGING = new Set(['goto', 'farm', 'advance']);
const isDiverted = (b) => !!b.divert || !!(b.fuelJob && b.fuelJob.dv);
function goable(crew, b, t) {
  const g = crew.game, h = crew.home(b), path = crew.routePath(b, cellX(t.i), cellZ(t.k), 0.9);
  return (isFar(t, b) ? !farBlocked(g, b, t) : walkClear(g, b, path)) && crew.canReach(b, [...path, [h.x, h.z]]);
}
function canDivert(crew, b, t) {
  const g = crew.game;
  if (!enabled(g, b) || b.stay || !DIGGING.has(b.state) || b.scoopHome || !b.origin || b.fuelJob || b.divert || b.deliver) return false;
  if (!(b.battery > DIVERT_BATTERY) || b.carry.length >= crew.capacity(b) || isBad(g, b, t)) return false;
  if (Math.hypot(cellX(t.i) - b.x, cellZ(t.k) - b.z) > FUEL_RANGE) return false;
  return goable(crew, b, t);
}
// once a second, from the crew's update (the host or a single player; a guest only watches)
export function divertThink(crew, dt) {
  const g = crew.game; crew._divT = (crew._divT || 0) - dt; if (crew._divT > 0) return; crew._divT = 1;
  const list = g.S.crew || []; if (!list.length || g.S.crewFuel === false) return;
  for (const b of list) if (b.state === 'idle' && canScoop(crew, b)) return;   // an idle bot answers on its own poll
  const cap = Math.floor(list.length * DIVERT_SHARE + 1e-9); let used = 0; for (const b of list) if (isDiverted(b)) used++;
  if (used >= cap) return;
  const calls = machines(g).filter((t) => g.logi.byId.get(t.id) === t && starving(g, t) && t.q.length < fuelCap(g, t) * DIVERT_BELOW)
    .sort((a, c) => a.q.length / fuelCap(g, a) - c.q.length / fuelCap(g, c));   // the emptiest first
  for (const t of calls) {
    if (used >= cap) break;
    if (list.some((b) => b.divert === t.id || (b.fuelJob && b.fuelJob.dv && b.fuelJob.id === t.id)) || freeRoom(g, t) <= 0) continue;   // one bot per machine, and nobody else has promised the room
    let best = null, bd = 1e9;
    for (const b of list) { if (!canDivert(crew, b, t)) continue; const d = Math.hypot(cellX(t.i) - b.x, t.j * C - b.y, cellZ(t.k) - b.z); if (d < bd) { bd = d; best = b; } }
    if (best) { best.divert = t.id; used++; }
  }
}
// the diverted bot's dig timer is up (the cell it was on is dug): the errand starts here, from the face it stands at. True when it did.
export function startDivert(crew, b) {
  const g = crew.game, t = g.logi.byId.get(b.divert); b.divert = null;
  if (!t || !isFueled(t) || !starving(g, t) || t.q.length >= fuelCap(g, t) * DIVERT_BELOW) return false;
  if (!enabled(g, b) || b.stay || b.fuelJob || b.scoopHome || !(b.battery > DIVERT_BATTERY) || isBad(g, b, t)) return false;
  const junk = b.carry.reduce((a, it) => a + (fuelTakes(t, it) ? 0 : 1), 0), n = Math.min(freeRoom(g, t, b), crew.capacity(b) - junk);
  if (n <= 0) return false;
  b.fuelJob = { id: t.id, n, k: 'scoop', dv: 1 };
  return true;
}

function pickItem(b, t) {
  let at = -1, lo = 99;
  for (let q = 0; q < b.carry.length; q++) { const it = b.carry[q]; if (!fuelTakes(t, it)) continue; const r = rarityOf(it); if (r < lo) { lo = r; at = q; } }
  return at;   // the cheapest plush first: the valuable ones are the last to be burnt and the first to be sold
}
export function thinkGive(crew, b, dt) {
  const g = crew.game, j = b.fuelJob, t = j ? g.logi.byId.get(j.id) : null;
  if (!t || !isFueled(t)) { endGive(crew, b, false); return; }
  const x = cellX(t.i), z = cellZ(t.k);
  b.tx = j.up ? x : x + (b.x < x ? -0.9 : 0.9); b.tz = z;   // (a bot phased up to a catwalk stands on the machine's own cell: the walk to a side could step off the edge)
  if (j.far && !j.up && isFar(t, b)) { b.stall = (b.stall || 0) + dt; if (b.stall > PHASE_FOOT) phaseUp(crew, b, t); return; }   // at the foot of it with the machine out of reach: phase up
  if (Math.hypot(x - b.x, z - b.z) > 2.4) { b.stall = (b.stall || 0) + dt; if (b.stall > 8) endGive(crew, b, true); return; }
  b.timer -= dt; if (b.timer > 0) return;
  b.timer = GIVE_EVERY;
  if (j.n > 0) {
    const at = pickItem(b, t);
    if (at >= 0) {
      const it = b.carry[at];
      if (g.logi.accept(t, it, null)) { b.carry.splice(at, 1); j.n--; gave(crew, b, t, it); return; }
    }
  }
  endGive(crew, b, false);
}
function gave(crew, b, t, it) {
  const g = crew.game, S = g.S;
  const first = !(S.stats.botFuel > 0);
  S.stats.botFuel = (S.stats.botFuel || 0) + 1;
  if (t.type === 'gen') g.power.markDirty();
  const x = cellX(t.i), y = t.j * C + 0.9, z = cellZ(t.k);
  if (g.fliers && g.fliers.length < 200) g.flyFx({ sp: it.sp, vr: it.vr, from: { x: b.x, y: b.y + 0.6, z: b.z }, to: { x, y, z }, t: 0, dur: 0.3, arc: 0.6 });   // the plush leaps from the bucket into the hopper
  g.fx.fluff && g.fx.fluff(x, y, z, 1, 0.6, 0.2, 5);
  if ((b._fuelSnd || 0) < g.time) { b._fuelSnd = g.time + 0.35; g.sound.at(b.x, b.y + 0.6, b.z, 'bot').tone('triangle', 520, 760, 0.07, 0.05); }
  if (first) {
    const text = `${b.name} is topping up ${fuelName(g, t)}. Bots keep machines fueled while they are idle or on their way to unload. Turn it off in the crew panel (V).`;
    g.ui.toast({ icon: '🤖', title: 'Bots fuel your machines', text, ms: 7000 });
    g.netSend && g.netSend({ t: 'toast', icon: '🤖', title: 'Bots fuel your machines', text });
  }
}
// a bot cannot climb to a machine on another level (stuck 6 s on the walk, or 5 s at the foot): it phases up beside it, the way a stuck bot phases home, and hands the plush over
export function phaseUp(crew, b, t) {
  const g = crew.game, j = b.fuelJob; if (!j || !t) return false;
  g.fx.sparkle(b.x, b.y + 0.4, b.z, 12, 0.5, 0.9, 1);
  b.x = cellX(t.i); b.z = cellZ(t.k); b.y = t.j * C + 0.05; b.vy = 0; b.stuckT = 0; b.stall = 0; b.timer = 0; b.lastX = undefined;
  j.up = true; b.fuelUp = true; b.state = 'fgive'; b.path = []; b.pi = 0; b.scanT = 0;
  g.fx.sparkle(b.x, b.y + 0.4, b.z, 12, 0.5, 0.9, 1);
  const said = g._fuelPhaseSaid || (g._fuelPhaseSaid = {});
  if (!((said[b.id] || -1e9) > (g.time || 0))) { said[b.id] = (g.time || 0) + 60; g.ui.toast({ icon: '🤖', title: `${b.name} phased up`, text: `It could not climb to ${fuelName(g, t)}, so it phased there to fuel it and will phase back to its bin.`, ms: 4000 }); }
  return true;
}
// a stuck bot on the way to a machine on another level: phase up instead of waiting for the 25 s beam home
export function phaseStuck(crew, b) {
  const j = b.fuelJob, t = j ? crew.game.logi.byId.get(j.id) : null;
  return !!(j && j.far && !j.up && t && isFueled(t) && phaseUp(crew, b, t));
}
// back from a catwalk (or the floor above, or a pit): down to the bin it unloads at, where it goes on with its day
export function phaseDown(g, b) {
  if (!b.fuelUp) return;
  b.fuelUp = false;
  const h = g.crew.home(b);
  g.fx.sparkle(b.x, b.y + 0.4, b.z, 12, 0.5, 0.9, 1);
  b.x = h.x; b.z = h.z; b.y = (h.y || 0) + 0.6; b.vy = 0; b.stuckT = 0; b.lastX = undefined;
  g.fx.sparkle(b.x, b.y + 0.4, b.z, 12, 0.5, 0.9, 1);
}
export function endGive(crew, b, failed) {
  const g = crew.game, j = b.fuelJob;
  if (failed && j) markBad(g, b, j.id);
  b.fuelJob = null; b.stall = 0; b.timer = 0;
  if (b.carry.length) {
    if (tryTopUp(crew, b)) return;   // the next machine in reach
    phaseDown(g, b);
    const h = crew.home(b);
    b.path = crew.routePath(b, h.x, h.z); b.pi = 0; b.state = 'return'; b.scanned = false; b.fuelDone = true;   // the rest goes to its bin
    return;
  }
  phaseDown(g, b);
  if (b.scoopHome) { const h = crew.home(b); b.path = crew.routePath(b, h.x, h.z); b.pi = 0; b.state = 'return'; b.scanned = false; b.fuelDone = true; return; }
  if (b.origin) crew.resumeDig(b); else b.state = 'idle';
}

// ------------------------------------------------------------------------------------------------------------ bookkeeping
// the bot stops all fuel work (a new order, a stuck bot, a low battery). A scooping bot still walks home before it idles.
export function dropJob(g, b, bad) {
  if (bad && b.fuelJob) { markBad(g, b, b.fuelJob.id); b.fuelT = Math.max(b.fuelT || 0, 120); }   // (a bot that had to be phased home does not set off again for two minutes)
  b.fuelJob = null; b.divert = null;
  phaseDown(g, b);
}
export function afterUnload(b) { b.fuelHops = 0; b.fuelDone = false; b.divert = null; }
// loading a save (the host): a job whose machine is gone is dropped, a bot walking to hand plush over with no job walks home
export function afterLoad(crew, b) {
  const g = crew.game, j = b.fuelJob;
  b.divert = null; b.fuelUp = false;   // (a pending diversion is not kept in a save; a bot saved on a catwalk is on whatever it stood on)
  const now = g.time || 0;   // (the clock in a save is the one of the session that wrote it: a time further off than any wait is from another session, and is forgotten)
  if (b.fuelBad) for (const id of Object.keys(b.fuelBad)) if (!(b.fuelBad[id] <= now + BAD_FOR)) delete b.fuelBad[id];
  if (b._fuelSnd > now + 1) b._fuelSnd = 0;
  if (j && (!g.logi.byId.get(j.id) || typeof j.n !== 'number' || !['scoop', 'give'].includes(j.k))) { b.fuelJob = null; }
  if ((b.state === 'fwalk' || b.state === 'fgive') && !b.fuelJob) { if (b.carry.length) { b.fuelDone = true; crew.goHome(b); } else b.state = 'idle'; }
  if (b.fuelJob && b.fuelJob.k === 'scoop' && !['goto', 'farm', 'advance', 'blocked'].includes(b.state)) b.fuelJob = null;
}
// a guest sees the little puff where a bot hands plush over
export function guestFx(crew, b, dt) {
  if (b.state !== 'fgive' || !b.fuelJob) return;
  b._gfx = (b._gfx || 0) - dt; if (b._gfx > 0) return; b._gfx = 0.4;
  const g = crew.game, t = g.logi.byId.get(b.fuelJob.id); if (!t) return;
  g.fx.fluff && g.fx.fluff(cellX(t.i), t.j * C + 0.9, cellZ(t.k), 1, 0.6, 0.2, 5);
}
// the host's side of the toggles: id 0 is the whole crew
export function setToggle(g, id, on) {
  if (typeof on !== 'boolean' || !Number.isInteger(id) || id < 0) return false;   // (anything but a true or a false, or a whole id, is ignored)
  if (id === 0) { g.S.crewFuel = on ? undefined : false; if (!on) for (const x of g.S.crew || []) { x.fuelJob = null; x.divert = null; phaseDown(g, x); } return true; }   // (off calls back every bot already on an errand, as a bot's own switch does)
  const b = (g.S.crew || []).find((x) => x.id === id); if (!b) return false;
  b.fuelOff = on ? undefined : true; if (!on) { b.fuelJob = null; b.divert = null; phaseDown(g, b); }
  return true;
}
// one plain sentence for the status line and the panel
export function statusText(g, b) {
  const j = b.fuelJob, t = j ? g.logi.byId.get(j.id) : null;
  if (!j || !t) return '';
  if (b.state === 'fwalk' || b.state === 'fgive') return `Fueling ${fuelName(g, t)}`;
  if (j.k === 'scoop' && ['goto', 'farm', 'advance', 'blocked'].includes(b.state)) return `Scooping fuel for ${fuelName(g, t)}`;
  return '';
}
