import * as THREE from 'three';
import { C, NX, NZ, cellX, cellZ, toI, toK } from './config.js';
import * as NAV from './botnav.js';
import * as FUEL from './botfuel.js';

// ---------------------------------------------------------------------------------------------------------------------------------
// CALL ROUTES: a maps app that calls a bot to where it is needed, and brings it back down afterwards.
//
// When a plush-fed machine needs fuel (a generator, a Charging Station) and a bot takes the errand, the machine lays an invisible ROUTE for it: a CALL, one per bot, owned by the
// machine (a machine holds several, one for each bot that promised it plush, and the promises are the hopper room already reserved, see botfuel.js reserved()). The same goes for a
// low battery: the bot maps a route to the nearest OPEN Charging Station it can really reach, and the station holds a slot for it.
//
//   * A call is the record { id, m (machine id), b (bot id), k ('fuel' | 'charge'), ph ('up' | 'down'), g (the last ground spot), f (the farm spot) } in S.botCalls: what a save keeps.
//     Its routes are runtime only (an array of cell indices each, never saved, never sent): `up` is the way from where the bot is to the machine, `back` the way from the machine
//     (or from the bot, once it is on its way down) to the ground cell where it left the floor and on to the plush it was farming. Nothing draws them in normal play;
//     g.botnav.debugRoutes(true) draws them for tests and screenshots.
//   * The bot walks the route with botnav.js (the same path, one search cache), and the route ADAPTS: it is laid again FROM THE BOT'S CELL, never from the machine, whenever the
//     world changed (botnav's version: a ramp, a stair, a ladder, a lift, a door, a plate), the bot was knocked off the line, or the machine moved, and never more than once
//     every REPLAN seconds for one bot. `passed` counts the route cells the bot has really stood in and only goes up.
//   * When the machine is full (or gone, or the player gave the bot an order) the call is not removed: it turns DOWN and guides the bot back to the ground (down ramps, stairs,
//     ladders and lifts, never a drop). It is removed once the bot stands on GROUND, and then the bot is released: it resumes its dig if the face is still there, else it picks a new
//     face, else it goes home. A bot that was given an order above ground goes down first, then follows the order.
//   * No way up (a sealed catwalk, a dead lift, a lock): one toast, the call is released and the machine is not offered to that bot for RETRY seconds (the other bots may take it).
//     A bot that is too weak for the round trip goes to the nearest open charger first.
//   * Calls persist as machine id plus bot id and are laid again on load. A bot that is above ground when a save loads gets its way down even if its call is gone.
//   * The guests see only the bots' positions and one more number in the crew row (field 21, codes CALLED, DOWN and CHARGE below, when the bot has no ramp or ladder word).
//
// Cost: routes are Float64Arrays of cell indices (the cell index is 35 bits), found by botnav's budgeted searches, one lay per bot every REPLAN seconds at most, and a bot with no
// call and no errand costs one function call (g.botnav.stats() reads the milliseconds).
// ---------------------------------------------------------------------------------------------------------------------------------
export const REPLAN = 1.5;         // seconds between two lays of the route of one bot, at most
export const RETRY = 60;           // seconds a machine is not offered again to a bot that found no way to it
export const SLOTS = 2;            // bots that charge at one station at once (one each side of it)
export const NOWAY_AFTER = 1.2;    // seconds a proven 'no way' stands before the call is released
export const STUCK_DOWN = 24;      // seconds a bot may fail to find its way down before it is set down on the ground (the old phase home, as a last resort)
export const CODE = { called: 9, down: 10, charge: 11 };
const FUEL_STATES = new Set(['goto', 'farm', 'advance', 'blocked', 'fwalk', 'fgive']);
const LAY_STATES = new Set(['fwalk', 'fgive', 'chgwalk', 'recharge']);
const LOW = 0.25;
const ROUTE_CAP = 600;

let ON = true;
export function setEnabled(v) { ON = !!v; }
export const isEnabled = () => ON;

const RS = new WeakMap();           // per game
const RT = new WeakMap();           // per call record: what is only runtime (the routes and the searches)
const idxOf = (i, j, k) => (j * NZ + k) * NX + i;
const cellI = (id) => id % NX, cellK = (id) => Math.floor(id / NX) % NZ, cellJ = (id) => Math.floor(id / (NX * NZ));
const rowOf = (y) => Math.max(0, Math.floor(y / C + 1e-6));
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function rs(g) {
  let r = RS.get(g);
  if (!r || r.S !== g.S) { r = { g, S: g.S, list: null, by: new Map(), said: new Map(), need: true, seq: 1, st: { frames: 0, ms: 0, worst: 0, lays: 0, replans: 0, opened: 0, released: 0, downs: 0, giveups: 0, landed: 0 }, spent: 0, dbg: null }; RS.set(g, r); }
  if (r.list !== g.S.botCalls) {   // a state that was just loaded (or reset by a test): the records in S are the calls
    if (!Array.isArray(g.S.botCalls)) g.S.botCalls = [];
    r.list = g.S.botCalls; r.by = new Map(); for (const c of r.list) if (c && Number.isInteger(c.b) && !r.by.has(c.b)) r.by.set(c.b, c); r.need = true;
  }
  return r;
}
const rt = (c) => { let x = RT.get(c); if (!x) { x = { up: null, back: null, upT: -99, backT: -99, upVer: -1, backVer: -1, upPend: null, backPend: null, pendVer: -1, mk: -1, noneT: -1, lastCell: -1, passed: 0, set: null, partial: false, nw: 0, dn: 0, said: false }; RT.set(c, x); } return x; };
export const callOf = (g, b) => (b ? rs(g).by.get(b.id) || null : null);
export const callsOf = (g, machineId) => rs(g).list.filter((c) => c.m === machineId);
export const routeOf = (c) => { const x = c ? RT.get(c) : null; return x ? { up: x.up ? Array.from(x.up) : [], back: x.back ? Array.from(x.back) : [], passed: x.passed, partial: x.partial } : { up: [], back: [], passed: 0, partial: false }; };
export const decode = (id) => ({ i: cellI(id), j: cellJ(id), k: cellK(id) });
export const cellIdx = (x, y, z) => idxOf(toI(x), rowOf(y), toK(z));

// ------------------------------------------------------------------------------------------------------------ what a bot is out to do
function wanted(g, b) {
  const j = b.fuelJob;
  if (j && FUEL_STATES.has(b.state)) { const t = g.logi.byId.get(j.id); if (t && FUEL.isFueled(t)) return { m: t.id, k: 'fuel', t }; }
  if (b.chg && (b.state === 'chgwalk' || b.state === 'recharge')) { const t = g.logi.byId.get(b.chg); if (t && t.type === 'charger') return { m: t.id, k: 'charge', t }; }
  return null;
}
const goalAt = (t, k) => ({ x: cellX(t.i), y: t.j * C, z: cellZ(t.k), r: k === 'charge' ? 1.8 : 1.6, dy: 0.35, floor: true });
const groundGoal = (p) => ({ x: p[0], y: p[1], z: p[2], r: 1.6, dy: 0.5, floor: true, ground: true });
// the pile floor or hall floor node under a point (not a plate, a ramp, a stair or a cab), as [x, y, z]; null when it stands on something built
const groundAt = (p) => { const n = NAV.graph.nodeAt(p); return n && n.t === NAV.T_GROUND ? [n.x, n.y, n.z] : null; };
const groundSpot = (crew, b) => groundAt(b) || (() => { const h = crew.home(b); return [h.x, h.y || 0, h.z]; })();

function remove(R, c) {
  const at = R.list.indexOf(c); if (at >= 0) R.list.splice(at, 1);
  if (R.by.get(c.b) === c) R.by.delete(c.b);
  RT.delete(c); R.st.released++;
}
// the bot's call for this errand: a new one inherits where the bot came up from, so the way back down is never lost when one errand follows another
function open(crew, b, want, old) {
  const g = crew.game, R = rs(g);
  const c = { id: R.seq++, m: want.m, b: b.id, k: want.k, ph: 'up', g: old ? old.g : groundSpot(crew, b), f: old ? old.f : [b.x, b.z], t: g.time };
  if (old) remove(R, old);
  R.list.push(c); R.by.set(b.id, c); R.st.opened++;
  return c;
}

// ------------------------------------------------------------------------------------------------------------ routes
function cellsOf(ent) {
  const out = []; let last = -1;
  for (const s of NAV.stepList(ent)) {
    const id = idxOf(toI(s.x), rowOf(s.y), toK(s.z));
    if (id !== last) { out.push(id); last = id; }
    if (out.length >= ROUTE_CAP) break;
  }
  return Float64Array.from(out);
}
const lineCells = (a, z) => Float64Array.from([idxOf(toI(a.x), rowOf(a.y), toK(a.z)), idxOf(toI(z.x), rowOf(z.y), toK(z.z))]);
// one lay: from a point to a goal. { cells, partial } | { pend } | { none, why } | null (the bot has nothing to stand on: not an answer)
function lay(from, goal) {
  if (NAV.isGround(from) && NAV.isGround(goal) && !goal.door) return { cells: lineCells(from, goal), partial: false, line: true };   // the pile floor to the pile floor: the old straight walk, a line of two cells
  const ent = NAV.pathTo(from, goal, { r: goal.r, dy: goal.dy, floor: true, ground: !!goal.ground });
  if (ent.state === 'pending') return { pend: ent };
  if (ent.state === 'none') return ent.why === 'The bot has nothing to stand on' ? null : { none: true, why: ent.why };
  return { cells: cellsOf(ent), partial: !!ent.partial };
}
function displaced(b, x) {
  const up = x.up; if (!up || !up.length) return false;
  const bi = toI(b.x), bk = toK(b.z), bj = rowOf(b.y);
  for (let n = 0; n < up.length; n++) { const id = up[n]; if (Math.abs(cellI(id) - bi) <= 2 && Math.abs(cellK(id) - bk) <= 2 && Math.abs(cellJ(id) - bj) <= 3) return false; }
  return true;
}
function setRoute(x, which, res) {
  if (which === 'up') { x.up = res.cells; x.partial = !!res.partial; x.line = !!res.line; x.set = new Set(res.cells); } else x.back = res.cells;
}
// the way back: from the machine (or, going down, from the bot) to the ground cell and on to the farm spot
function backFrom(c, from) {
  const res = lay(from, groundGoal(c.g));
  if (res && res.cells) {
    const f = Float64Array.from([...res.cells, idxOf(toI(c.f[0]), rowOf(c.g[1]), toK(c.f[1]))]);
    return { cells: f, partial: res.partial };
  }
  return res;
}
// keep one route (up or back) current: lay it when it is stale (a new version, a bot off the line, a machine that moved), at most every REPLAN s, from where the bot is now
function keep(crew, b, c, t, x, now, which) {
  const g = crew.game, R = rs(g), ver = NAV.version();
  const pk = which === 'up' ? 'upPend' : 'backPend', tk = which === 'up' ? 'upT' : 'backT', vk = which === 'up' ? 'upVer' : 'backVer';
  if (x[pk]) {   // a search that was queued: ask again until it is done (a version change drops it: it would never finish)
    if (x.pendVer !== ver) x[pk] = null;
    else {
      const ent = x[pk];
      if (ent.state === 'pending') return;
      x[pk] = null; x[tk] = now; x[vk] = ver; R.st.lays++;
      if (ent.state === 'none') { if (which === 'up') { if (x.noneT < 0) x.noneT = now; x.nw++; } return; }
      x.noneT = -1; setRoute(x, which, which === 'up' ? { cells: cellsOf(ent), partial: !!ent.partial } : { cells: Float64Array.from([...cellsOf(ent), idxOf(toI(c.f[0]), rowOf(c.g[1]), toK(c.f[1]))]), partial: !!ent.partial }); return;
    }
  }
  const mk = t ? idxOf(t.i, t.j, t.k) : -1;
  const arr = which === 'up' ? x.up : x.back;
  const stale = !arr || x[vk] !== ver || (which === 'up' && (x.mk !== mk || (!x.line && displaced(b, x))));   // (a line of two cells, the floor to the floor, has no middle to be off)
  if (!stale || now - x[tk] < REPLAN) return;
  if (!NAV.onNode(crew, b) && which === 'up') return;   // in a cab or on a ladder: nothing to ask yet
  if (R.spent > 0.25) return;
  const from = which === 'up' || c.ph === 'down' ? b : { x: cellX(t.i), y: t.j * C, z: cellZ(t.k) };
  const res = which === 'up' ? lay(from, goalAt(t, c.k)) : backFrom(c, from);
  if (!res) return;
  x[tk] = now; x[vk] = ver; if (arr) R.st.replans++;
  if (res.pend) { x[pk] = res.pend; x.pendVer = ver; return; }
  R.st.lays++;
  if (res.none) { if (which === 'up') { if (x.noneT < 0) x.noneT = now; x.nw++; x.why = res.why; } return; }
  if (which === 'up') { x.noneT = -1; x.mk = mk; }
  setRoute(x, which, res);
}
// the bot's own cell, counted once when it is on the route
function progress(b, x) {
  const id = idxOf(toI(b.x), rowOf(b.y), toK(b.z));
  if (id !== x.lastCell) { x.lastCell = id; if (x.set && x.set.has(id)) x.passed++; }
}

// ------------------------------------------------------------------------------------------------------------ the frame
// once a frame, from Crew.update (the host or a single player)
export function tick(crew, dt) {
  const g = crew.game, R = rs(g);
  R.spent = 0; R.st.frames++;
  if (!ON || (g.isGuest && g.isGuest())) return;
  const t0 = nowMs();
  if (R.need) loadFix(crew, R);
  // calls of bots that are gone (removed, died) or machines that vanished for a bot that is already on the ground
  if (R.list.length) {
    const ids = new Set((g.S.crew || []).map((b) => b.id));
    for (const c of [...R.list]) if (!ids.has(c.b)) remove(R, c);
  }
  R.pruneT = (R.pruneT || 0) - dt;
  if (R.pruneT <= 0 && R.said.size) {   // the words a bot said (so it says them once a minute): forgotten with the bot, or when the minute is up
    R.pruneT = 2; const ids = new Set((g.S.crew || []).map((b) => b.id)), now = g.time || 0;
    for (const [k, until] of [...R.said]) if (!(until > now) || !ids.has(Math.abs(k))) R.said.delete(k);
  }
  if (R.dbg && R.dbg.on) debugDraw(g, R, dt);
  const ms = nowMs() - t0; R.st.ms += ms; if (ms > R.st.worst) R.st.worst = ms;
}
// loading a save: the records are re-checked, and a bot above the ground that has no call still gets its way down
function loadFix(crew, R) {
  const g = crew.game; R.need = false;
  if (!g.world || !g.logi) return;
  const bots = new Map((g.S.crew || []).map((b) => [b.id, b]));
  for (const c of [...R.list]) {
    const bad = !c || !bots.has(c.b) || !['fuel', 'charge'].includes(c.k) || (c.ph !== 'up' && c.ph !== 'down') || !Array.isArray(c.g) || !Array.isArray(c.f) || (c.ph === 'up' && !g.logi.byId.get(c.m));
    if (bad || R.by.get(c.b) !== c) { remove(R, c); if (R.by.get(c.b) === c) R.by.delete(c.b); continue; }
    if (c.ph === 'up' && !wanted(g, bots.get(c.b))) c.ph = 'down';   // the errand did not survive the load (the machine is gone, the job was dropped): the way down is still owed
  }
  R.by = new Map(R.list.map((c) => [c.b, c]));
  for (const c of R.list) if (Number.isInteger(c.id) && c.id >= R.seq) R.seq = c.id + 1;   // (a loaded save keeps its ids: a new call must not reuse one)
  for (const b of bots.values()) if (!R.by.has(b.id) && !NAV.groundNow(crew, b) && NAV.elevated(crew, b)) {
    const c = { id: R.seq++, m: 0, b: b.id, k: 'fuel', ph: 'down', g: groundSpot(crew, b), f: [b.x, b.z], t: g.time }; R.list.push(c); R.by.set(b.id, c); R.st.downs++;
  }
}
export function afterLoad(crew) { const R = rs(crew.game); R.need = true; }

// one bot, from the top of Crew.think. True when the route layer walked the bot this frame (the old states wait until it is back on the ground).
export function think(crew, b, dt) {
  const g = crew.game; if (!ON || (g.isGuest && g.isGuest())) return false;
  const R = rs(g), want = wanted(g, b); let c = R.by.get(b.id);
  if (!want && !c) { if (!OFFLEDGE.has(b.state) || !stranded(crew, b, R)) return false; c = R.by.get(b.id); }
  const t0 = nowMs(), now = g.time || 0;
  try {
    if (want) {
      if (!c || c.m !== want.m || c.k !== want.k) c = open(crew, b, want, c);
      else if (c.ph === 'down') c.ph = 'up';   // a new errand while on its way down: it goes on up (the anchor is kept)
    } else if (c.ph === 'up') { toDown(crew, b, c); if (R.by.get(b.id) !== c) return false; }   // (on the ground already: the call went with the errand)
    if (!c) return false;
    const x = rt(c);
    // where it came up from: the last ground spot, and the plush it was farming
    if (c.ph === 'up') {
      if (b.state === 'farm' || b.state === 'advance') c.f = [b.x, b.z];
      x.gT = (x.gT || 0) - dt; if (x.gT <= 0) { x.gT = 0.25; const ga = groundAt(b); if (ga) c.g = ga; }
    }
    if (c.ph === 'down') return goDown(crew, b, c, x, now, dt, R);
    return want ? serve(crew, b, c, want.t, x, now, R) : false;
  } finally { const ms = nowMs() - t0; R.spent += ms; R.st.ms += ms; if (ms > R.st.worst) R.st.worst = ms; }
}
// a bot that was given a dig on a platform (it followed the player up there, then an order came): the old dig walk knows no ramp and would stand at the edge until it was phased home
// after 25 s, so it is given its way down like any bot that is up there with no call. Looked at twice a second.
const OFFLEDGE = new Set(['goto', 'farm', 'advance']);
const CHK = new WeakMap();
function stranded(crew, b, R) {
  const g = crew.game, now = g.time || 0; if ((CHK.get(b) || 0) > now) return false;
  CHK.set(b, now + 0.5);
  if (NAV.groundNow(crew, b) || !NAV.elevated(crew, b)) return false;
  const c = { id: R.seq++, m: 0, b: b.id, k: 'fuel', ph: 'down', g: groundSpot(crew, b), f: [b.x, b.z], t: now };
  R.list.push(c); R.by.set(b.id, c); R.st.downs++; return true;
}
// the errand is over (or was ended): on the ground the call just goes, above it the call turns to the way down
function toDown(crew, b, c) {
  const g = crew.game, R = rs(g), x = rt(c);
  if (NAV.groundNow(crew, b)) { remove(R, c); return; }
  c.ph = 'down'; x.back = null; x.backT = -99; x.backPend = null; x.dn = 0; x.nw = 0; R.st.downs++;
}
// the walk to the machine: lay the route, keep it current, watch the battery and the machine
function serve(crew, b, c, t, x, now, R) {
  const g = crew.game;
  if (LAY_STATES.has(b.state)) {
    keep(crew, b, c, t, x, now, 'up');
    if (!x.back || x.backVer !== NAV.version() || x.back.length < 2) keep(crew, b, c, t, x, now, 'back');
    progress(b, x);
    if (x.noneT >= 0 && now - x.noneT >= NOWAY_AFTER && x.upVer === NAV.version()) { giveUp(crew, b, c, t, x, R); return false; }
  }
  if (c.k === 'fuel' && b.state === 'fwalk') {
    if (FUEL.fuelRoom(g, t) <= 0) { FUEL.endGive(crew, b, false); return false; }   // filled by someone else on the way: nothing to carry up there
    const len = (x.up ? x.up.length : 0) + (x.back ? x.back.length : 0), need = (len * C * 1.2 / (1.5 + b.level * 0.06)) * 0.004 / g.T.crewBattery;
    if (b.battery < LOW || b.battery - need < 0.06) { b.fuelBad = b.fuelBad || {}; b.fuelBad[c.m] = now + 90; crew.lowBattery(b); return false; }   // too weak for the round trip: the nearest open charger first (and the machine is not asked about again for a while, or the bin would send it straight back)
  }
  return false;
}
// no way: one toast, the call is released and the machine is left alone by this bot for RETRY seconds
function giveUp(crew, b, c, t, x, R) {
  const g = crew.game, now = g.time || 0; R.st.giveups++;
  if (NAV.codeOf(b) !== NAV.CODE.noway && !((R.said.get(b.id) || -1e9) > now)) {
    R.said.set(b.id, now + RETRY);
    g.ui.toast({ icon: '🤖', title: `${b.name}: No way up`, text: `It found no way to ${c.k === 'charge' ? 'a Charging Station' : FUEL.fuelName(g, t)}, so it dropped the call. It tries again in a minute; another bot may take it.`, ms: 5000 });
  }
  if (c.k === 'charge') {
    b.chgBad = b.chgBad || {}; b.chgBad[c.m] = now + RETRY;
    if (b.state === 'chgwalk' || b.state === 'recharge') { b.chg = null; b.chgNext = null; crew.goHome(b); }   // (it goes home, as it does when there is no station at all)
  } else {
    b.fuelBad = b.fuelBad || {}; b.fuelBad[c.m] = now + RETRY;
    FUEL.dropJob(g, b);
    if (b.carry.length) crew.goHome(b); else if (b.origin && !b.scoopHome) crew.resumeDig(b); else if (b.scoopHome) crew.goHome(b); else b.state = 'idle';
  }
  x.noneT = -1; toDown(crew, b, c);   // (on the ground the call goes at once, up there it turns to the way down)
}

// ------------------------------------------------------------------------------------------------------------ the way down
function goDown(crew, b, c, x, now, dt, R) {
  const g = crew.game;
  if (NAV.groundNow(crew, b)) { land(crew, b, c, R); return false; }
  b.stuckT = 0; b.lastX = undefined;
  keep(crew, b, c, null, x, now, 'back');
  progress(b, x);
  x.dn += dt;
  let goal = groundGoal(c.g);
  if (x.nw >= 1 && NAV.codeOf(b) === NAV.CODE.noway) { const h = crew.home(b); goal = groundGoal([h.x, h.y || 0, h.z]); }   // the spot it came up from is gone: the bin is on the ground too
  const r = NAV.drive(crew, b, goal, dt);
  if (r === 1) { if (NAV.codeOf(b) === NAV.CODE.noway) x.nw += dt; else x.nw = Math.min(x.nw, 0); }
  if (r === 2 && NAV.groundNow(crew, b)) { land(crew, b, c, R); return false; }
  if (r !== 1) x.nw += dt;
  if (x.dn > STUCK_DOWN && x.nw > 8 && !NAV.onNode(crew, b)) setDown(crew, b, c, R);   // not on anything the graph knows (it is nowhere): set down
  else if (x.nw > STUCK_DOWN) setDown(crew, b, c, R);
  return true;
}
// the last resort for a bot that cannot walk down: set down on the ground where it came up (the old phase home, with a toast)
function setDown(crew, b, c, R) {
  const g = crew.game;
  g.fx.sparkle(b.x, b.y + 0.4, b.z, 12, 0.5, 0.9, 1);
  b.x = c.g[0]; b.z = c.g[2]; b.y = c.g[1] + 0.05; b.vy = 0; b.stuckT = 0; b.lastX = undefined; NAV.resetBot(b);
  g.fx.sparkle(b.x, b.y + 0.4, b.z, 12, 0.5, 0.9, 1); R.st.landed++;
  g.ui.toast({ icon: '🤖', title: `${b.name}: no way down`, text: 'It found no way down from there, so it was set down where it came up.', ms: 4000 });
  land(crew, b, c, R);
}
// back on the ground: the call goes, the bot is released to its day
function land(crew, b, c, R) {
  remove(R, c); b.stuckT = 0; b.lastX = undefined;
  if (b.state === 'goto' && b.origin && !b.scoopHome) {   // its dig: the face if it is still there, else the nearest one, else home
    const j = Math.max(0, Math.floor(b.y / C + 1e-6));
    if (crew.findFace(b.origin[0], j, b.origin[1], b.dir)) crew.resumeDig(b);
    else { const nf = crew.nearestFace(b.x, b.y, b.z); if (!(nf && nf.d <= 100 && crew.order(b, nf.dir, b.x, b.y, b.z, true))) crew.goHome(b); }
  } else if (b.state === 'return' && !b.gatePending && !(b.scanT > 0)) { const h = crew.home(b); b.path = crew.routePath(b, h.x, h.z); b.pi = 0; }
}

// ------------------------------------------------------------------------------------------------------------ Charging Stations
const chargersBy = (g, t, except) => { let n = 0; for (const o of g.S.crew || []) if (o !== except && o.chg === t.id && (o.state === 'chgwalk' || o.state === 'recharge')) n++; return n; };
export const slotsFree = (g, t, except) => Math.max(0, SLOTS - chargersBy(g, t, except));
// the nearest charger that holds charge, has a free slot, is within range and can really be reached from where the bot stands. A bot that finds none it can reach says so once.
export function chargerFor(crew, b, range) {
  const g = crew.game, now = g.time || 0, cands = [];
  for (const t of g.logi.tiles.values()) {
    if (t.type !== 'charger' || !((t.reserve || 0) > 0.05) || !FUEL.chargerPowered(t)) continue;   // (an unwired or dead station is not open)
    const d = Math.hypot(cellX(t.i) - b.x, cellZ(t.k) - b.z); if (d < range) cands.push({ t, d });
  }
  if (!cands.length) return null;
  cands.sort((a, z) => a.d - z.d);
  if (!ON || (g.isGuest && g.isGuest())) return cands[0].t;
  let dead = 0, open = 0;
  for (const { t } of cands) {
    if (b.chgBad && b.chgBad[t.id] > now) continue;
    if (slotsFree(g, t, b) <= 0) continue;
    open++;
    const to = { x: cellX(t.i), y: t.j * C, z: cellZ(t.k) };
    const nb = NAV.graph.nodeAt(b), nt = NAV.graph.nodeAt(to);   // (a station with nothing to stand on, or two pile floors, is the old walk's business: the graph answers between two floors, one of them built)
    if (nt && !(nt.t === NAV.T_GROUND && (!nb || nb.t === NAV.T_GROUND))) {
      if (!nb) { open--; continue; }   // (a bot in the air or inside a wall cannot be asked: not a way, not a refusal)
      const r = NAV.pathTo(b, to, { r: 1.8, dy: 0.35, floor: true, sync: true });
      if (r.state === 'none') { if (r.why === 'The bot has nothing to stand on') open--; else dead++; continue; }
    }
    return t;
  }
  if (open && dead === open) {
    const R = rs(g);
    if (!((R.said.get(-b.id) || -1e9) > now)) { R.said.set(-b.id, now + RETRY); g.ui.toast({ icon: '🪫', title: `${b.name}: no way to a charger`, text: 'No Charging Station with charge in it can be reached from here, so it goes home.', ms: 5000 }); }
  }
  return null;
}

// ------------------------------------------------------------------------------------------------------------ the words
export function codeOf(g, b) {
  if (!b) return 0;
  if (g.isGuest && g.isGuest()) { const n = b.nvc | 0; return n >= CODE.called ? n : 0; }
  const c = rs(g).by.get(b.id); if (!c) return 0;
  if (c.ph === 'down') return CODE.down;
  if (c.k === 'charge' && (b.state === 'chgwalk')) return CODE.charge;
  if (c.k === 'fuel' && b.state === 'fwalk') return CODE.called;
  return 0;
}
export function statusText(g, b) {
  const n = codeOf(g, b);
  if (n === CODE.down) return 'Heading back down';
  if (n === CODE.charge) return 'Going to charge';
  if (n === CODE.called) { const j = b.fuelJob, t = j ? g.logi.byId.get(j.id) : null; return t ? `Called to ${FUEL.fuelName(g, t)}` : 'Called to a machine'; }
  return '';
}

// ------------------------------------------------------------------------------------------------------------ the debug overlay and the API on g.botnav
function debugDraw(g, R, dt) {
  const d = R.dbg; d.t -= dt; if (d.t > 0) return; d.t = 0.4;
  if (!d.group) { d.group = new THREE.Group(); d.group.name = 'botRoutes'; g.renderer.scene.add(d.group); }
  for (const ch of [...d.group.children]) { d.group.remove(ch); ch.geometry.dispose(); ch.material.dispose(); }
  d.lines = 0;
  for (const c of R.list) {
    const x = RT.get(c); if (!x) continue;
    for (const [arr, col] of [[x.up, c.k === 'charge' ? 0x44ccff : 0xffaa22], [x.back, 0x66dd66]]) {
      if (!arr || arr.length < 2) continue;
      const pts = []; for (const id of arr) pts.push(cellX(cellI(id)), cellJ(id) * C + 0.25, cellZ(cellK(id)));
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col, depthTest: false, transparent: true })); ln.renderOrder = 999; ln.frustumCulled = false;
      d.group.add(ln); d.lines++;
    }
  }
}
export function install(g) {
  const api = {
    debugRoutes: (on = true) => {
      const R = rs(g);
      if (!R.dbg) R.dbg = { on: false, t: 0, group: null, lines: 0 };
      R.dbg.on = !!on; R.dbg.t = 0;
      if (!on && R.dbg.group) { for (const ch of [...R.dbg.group.children]) { R.dbg.group.remove(ch); ch.geometry.dispose(); ch.material.dispose(); } R.dbg.lines = 0; }
      else if (on) debugDraw(g, R, 1);
      return R.dbg.lines;
    },
    routes: () => rs(g).list.map((c) => ({ ...c, ...routeOf(c) })),
    calls: () => rs(g).list,
    stats: () => ({ ...rs(g).st, calls: rs(g).list.length, said: rs(g).said.size }),
    resetStats: () => { const s = rs(g).st; for (const k of Object.keys(s)) s[k] = 0; },
    group: () => (rs(g).dbg ? rs(g).dbg.group : null),
  };
  g.botnav = Object.assign(g.botnav || {}, api);
  return api;
}
