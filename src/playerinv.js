// Per-player inventories in co-op (DESIGN_SATISFACTORY.md section 19, Wave 12).
//
// WHAT IS WHOSE
//   Per player: the crafted-item bag (S.items), the building material stock (S.mats), the hotbar, the selected tool and whether it is stowed, the Plush Vacuum and Scoop
//   dials, the carried plush (S.carry, already local to each page), the cart (S.cart / S.gcart, already one each), the journal. Shared: Fluff, upgrades and unlocks, gear
//   levels, contracts, the world, every machine, the power grid, the crew. The Plushdex, the achievements and the stats stay each player's own page, as before.
//
// WHERE THE BAGS LIVE
//   The host keeps its own bag where it always was (S.items, S.mats, S.hotbar) and every friend's bag in S.ginv = { v, n, bags: { [pid]: bag } }, saved with the world. A bag is
//   { pid, name, n, items, mats, hotbar, sel, st, vs, ss, seen }: n is the small player number (the host is 0, friends count up from 1, kept for good), seen the host's
//   play seconds when the friend last left. The pid is a random id the friend's browser makes once and keeps (localStorage); a friend whose pid is new but whose name
//   matches a kept bag gets that bag (and the bag moves to the new pid). Bags unclaimed for 24 hours of the host's play time are dropped; the host can clear them at once.
//
// ONE ACCESSOR
//   invFor(g, who) is the bag's item map for 'h' (the host), 'g' (the friend that is connected), a pid, or nothing (the player a command is running for). matsFor is the
//   same for the material stock. Everything that reads or writes S.items while a friend's command runs reads the friend's bag, because the host swaps S.items, S.mats,
//   S.hotbar, buildIdx and stowed to that bag for the length of the command (enter/leave, called by netCmd): crafting, buying, placing, hammer refunds, pickups, medkits,
//   flares, glow sticks, dynamite, supports, frames, cables, rigs, carts, care packs and supply caches all land in the right bag with no change of their own. Code that
//   must reach a bag that is not the acting one (a care pack, a refund to the owner, a gift) goes through invFor.
//
// OWNERSHIP
//   Every entity and cable built while a friend is connected carries `own`: 0 for the host, the friend's player number otherwise. Taking a piece down refunds the item to the
//   bag of the player who placed it while both are present (refundOwner/refund); a piece with no owner (built alone, before anyone could be asked) refunds the one who took it
//   down. Machine limits (rigs, borers) count the pieces you own against the shared upgrade level (ownedCount): each player may have rigMax rigs.
//
// WIRE
//   A friend sends commands as before; the host runs each against that friend's bag only (a command carries no bag id, so it cannot name another player's) and answers with
//   `inv` messages: { t:'inv', q: sequence, f?: 1 (the whole bag), i: [id, n, ...] items that changed (n 0 = gone), m: [...] same for materials, h, s, st, vs, ss, pn }.
//   They are coalesced (at most ten a second) and the friend applies them in order; a gap (or a duplicate or old one) is held or ignored, and a gap that stays asks for the
//   whole bag again (`invsync`). The friend reports its own hotbar layout and dials with `hb` when they change. A late joiner gets its bag in the world stream.
import { recipes } from './crafting.js';

export const BAG_IDS = 120;          // different things in one bag
export const BAG_MAX = 9999;         // of one thing
export const KEEP_SECS = 24 * 3600;  // a friend's bag is kept this many seconds of the host's play time
export const GIVE_RANGE = 3;         // metres between two players for a gift
export const GIVE_MAX = 999;
export const MIN_GAP = 0.1;          // seconds between two inv messages
export const MAX_DELTA = 40;         // slots in one delta (more is sent as the whole bag)
const ID_RE = /^[A-Za-z0-9:_.-]{1,32}$/;
const PID_RE = /^[A-Za-z0-9]{6,24}$/;
const BAD = new Set(['__proto__', 'constructor', 'prototype', 'hasOwnProperty', 'toString', 'valueOf']);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
const emptyBar = () => ['hammer', null, null, null, null, null, null, null, null];

export const validId = (s) => typeof s === 'string' && ID_RE.test(s) && !BAD.has(s);

// ------------------------------------------------------------------ state
function rt(g) { return g._pi || (g._pi = { stack: [], host: null, cur: 'h', pid: null, run: new Map(), stampId: 0, lastNext: -1, acc: 0 }); }
export function reset(g) { g._pi = null; g._pig = null; g._myN = 0; g._bagSwap = 0; g._rtLater = false; g._refundTo = undefined; }

export function store(g) {
  const S = g.S, v = S.ginv;
  if (!v || typeof v !== 'object' || !v.bags || typeof v.bags !== 'object') S.ginv = { v: 1, n: 0, bags: {} };
  else if (!(v.n >= 0)) v.n = Object.values(v.bags).reduce((m, b) => Math.max(m, (b && b.n) | 0), 0);
  return S.ginv;
}
export function cleanMap(m) {
  const out = {}; if (!m || typeof m !== 'object') return out;
  let n = 0;
  for (const k of Object.keys(m)) {
    if (!validId(k)) continue;
    const v = Math.floor(+m[k]); if (!(v >= 1)) continue;
    out[k] = Math.min(BAG_MAX, v); if (++n >= BAG_IDS) break;
  }
  return out;
}
const cleanHotbar = (h) => (Array.isArray(h) && h.length === 9 ? h.map((x) => (validId(x) ? x : null)) : emptyBar());
export function cleanBag(b, pid) {
  b.pid = pid; b.name = typeof b.name === 'string' ? b.name.slice(0, 14) : '';
  b.n = Math.max(1, Math.floor(+b.n) || 1);
  b.items = cleanMap(b.items); b.mats = cleanMap(b.mats); b.hotbar = cleanHotbar(b.hotbar);
  b.sel = Number.isInteger(b.sel) && b.sel >= 0 && b.sel <= 8 ? b.sel : 0; b.st = b.st === 0 ? 0 : 1;
  b.seen = Number.isFinite(+b.seen) ? +b.seen : 0;
  if (b.vs !== undefined && !(+b.vs >= 0 && +b.vs <= 100)) delete b.vs;
  if (b.ss !== undefined && !(+b.ss >= 0 && +b.ss <= 200)) delete b.ss;
  return b;
}
// a loaded game: what the save says is checked, and nothing of the last session's connection is kept
export function afterLoad(g) {
  reset(g);
  const S = g.S, v = S.ginv;
  if (!v) return;
  if (typeof v !== 'object' || !v.bags || typeof v.bags !== 'object') { S.ginv = undefined; return; }
  const out = {}; let top = 0;
  for (const pid of Object.keys(v.bags)) { const b = v.bags[pid]; if (!PID_RE.test(pid) && pid !== 'guest') continue; if (!b || typeof b !== 'object') continue; out[pid] = cleanBag(b, pid); top = Math.max(top, out[pid].n); }
  v.bags = out; v.v = 1; v.n = Math.max(top, v.n | 0);
}
const playSecs = (g) => +(g.S.stats && g.S.stats.playSecs) || 0;
export function bagFor(g, pid, name) {
  const st = store(g); let b = st.bags[pid];
  if (!b) { b = st.bags[pid] = { pid, name: String(name || '').slice(0, 14), n: ++st.n, items: {}, mats: {}, hotbar: emptyBar(), sel: 0, st: 1, seen: playSecs(g) }; }
  return b;
}
export const guestPid = (g) => rt(g).pid || 'guest';
export const curBag = (g) => bagFor(g, guestPid(g));
export function bagByNum(g, n) { const st = store(g); for (const pid of Object.keys(st.bags)) if (st.bags[pid].n === n) return st.bags[pid]; return null; }
const isGuestPage = (g) => !!(g.net && g.net.open && g.net.role === 'guest');

// who is acting right now: 'h' or the pid of the friend whose command is running
export function acting(g) { const pi = rt(g); if (pi.stack.length) return pi.cur; return g._actor === 'g' ? guestPid(g) : 'h'; }
const resolve = (g, who) => (who === undefined || who === null ? acting(g) : who === 'h' || who === 0 ? 'h' : who === 'g' ? guestPid(g) : String(who));
const hostMaps = (g) => rt(g).host || { items: g.S.items, mats: g.S.mats, hotbar: g.S.hotbar };
export function invFor(g, who) {
  if (isGuestPage(g)) return g.S.items;
  const w = resolve(g, who);
  if (w === 'h') { const h = hostMaps(g); return h.items || (h.items = {}); }
  return bagFor(g, w).items;
}
export function matsFor(g, who) {
  if (isGuestPage(g)) return g.S.mats || (g.S.mats = {});
  const w = resolve(g, who);
  if (w === 'h') { const h = hostMaps(g); return h.mats || (h.mats = {}); }
  return bagFor(g, w).mats;
}
// the player number of whoever acts: 0 for the host. On a friend's page it is the number the host told it.
export function ownerNum(g) { if (isGuestPage(g)) return g._myN | 0; const a = acting(g); return a === 'h' ? 0 : bagFor(g, a).n; }

// ------------------------------------------------------------------ the swap
export function enter(g, who) {
  const pi = rt(g), S = g.S;
  if (!pi.stack.length) pi.host = { items: S.items, mats: S.mats, hotbar: S.hotbar, buildIdx: g.buildIdx, stowed: g.stowed };
  pi.stack.push({ items: S.items, mats: S.mats, hotbar: S.hotbar, buildIdx: g.buildIdx, stowed: g.stowed, who: pi.cur });
  const w = resolve(g, who ?? 'g');
  if (w === 'h') { const h = pi.host; S.items = h.items; S.mats = h.mats; S.hotbar = h.hotbar; g.buildIdx = h.buildIdx; g.stowed = h.stowed; }
  else { const b = bagFor(g, w); S.items = b.items; S.mats = b.mats; S.hotbar = b.hotbar; g.buildIdx = b.sel; g.stowed = !!b.st; }
  pi.cur = w; g._bagSwap = pi.stack.length;
}
export function leave(g) {
  const pi = rt(g), S = g.S, ctx = pi.stack.pop(); if (!ctx) return;
  if (pi.cur === 'h') { const h = pi.host; if (h) { h.items = S.items; h.mats = S.mats; h.hotbar = S.hotbar; h.buildIdx = g.buildIdx; h.stowed = g.stowed; } }
  else { const b = bagFor(g, pi.cur); b.items = S.items; b.mats = S.mats; b.hotbar = Array.isArray(S.hotbar) && S.hotbar.length === 9 ? S.hotbar : b.hotbar; b.sel = Number.isInteger(g.buildIdx) ? Math.max(0, Math.min(8, g.buildIdx)) : 0; b.st = g.stowed ? 1 : 0; }
  S.items = ctx.items; S.mats = ctx.mats; S.hotbar = ctx.hotbar; g.buildIdx = ctx.buildIdx; g.stowed = ctx.stowed; pi.cur = ctx.who;
  g._bagSwap = pi.stack.length;
  if (!pi.stack.length) { pi.host = null; if (g._rtLater) { g._rtLater = false; g.rebuildTools(); } }
}
export function runAs(g, who, fn) { enter(g, who); try { return fn(); } finally { leave(g); } }

// ------------------------------------------------------------------ a friend's command
export function beginCmd(g) {
  const pi = rt(g);
  stamp(g, 0);   // whatever the host built until now is the host's
  enter(g, 'g');
  const ui = g.ui;
  if ((pi.depth = (pi.depth | 0) + 1) === 1 && ui && typeof ui.hint === 'function') {   // what the command would tell the host on screen is the friend's to read
    pi.hintWas = ui.hint; pi.hintOwn = Object.prototype.hasOwnProperty.call(ui, 'hint'); pi.hints = [];
    ui.hint = (text, secs) => { if (pi.hints.length < 3) pi.hints.push([String(text), secs]); };
  }
}
export function endCmd(g, c) {
  const pi = rt(g), b = curBag(g);
  stamp(g, b.n);
  leave(g);
  const ui = g.ui;
  if ((pi.depth = Math.max(0, (pi.depth | 0) - 1)) === 0 && pi.hintWas) {
    if (pi.hintOwn) ui.hint = pi.hintWas; else delete ui.hint;
    pi.hintWas = null; const h = pi.hints || []; pi.hints = null;
    if (h.length && g.net && g.net.open) g.netSend({ t: 'hint', text: h[0][0].slice(0, 600), s: +h[0][1] || 4 });
  }
  capBag(b);
  touch(g);
  flush(g, false);
  if (ui && (c === 'craft' || c === 'craftGear' || c === 'buy' || c === 'giveitem') && ui.openModal === 'craft') ui.renderCraft();
}
export function touch(g) { const r = run(g); r.dirty = true; }
// how many of a recipe a friend's craft may make: what the bag can hold. The host charges for what is made, so a count the bag would cut (or a new kind in a bag with every slot used)
// must never be paid for. A cart, the bots and anything unknown go through unchanged (their own rules). Returns the count to craft (0: nothing).
export function craftLimit(g, id, n) {
  n = Math.floor(+n); if (typeof id !== 'string') return n;
  let r; try { r = recipes(g).find((x) => x.id === id); } catch (e) { r = null; }
  if (!r || r.kind === 'cart') return n;
  const m = r.kind === 'mat' ? g.S.mats : g.S.items, key = r.kind === 'mat' ? r.mk : id;
  if (!m || !validId(key)) return n;
  if (!(key in m) && Object.keys(m).length >= BAG_IDS) return 0;
  return n <= BAG_MAX - (m[key] | 0) ? n : 0;   // (more than the bag holds is refused whole: the friend is not charged for a part of it)
}
// the tool a friend's `place` names must be what its item really is: the friend says WHICH item it spends, never what it turns into (a marker named as a rig would be a free rig).
// The feature code (belts, stacks, power, transit ...) keeps judging the rest of the tool against the piece.
export function toolOk(g, t) {
  if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !validId(t.id)) return false;
  let r; try { r = recipes(g).find((x) => x.id === t.id); } catch (e) { r = null; }
  return !!r && r.kind !== 'mat' && r.kind !== 'cart' && r.kind === t.kind;
}
export function capBag(b) {
  let ch = false;
  for (const key of ['items', 'mats']) {
    const m = b[key]; let n = 0;
    for (const k of Object.keys(m)) {
      if (!validId(k) || !(m[k] >= 1)) { delete m[k]; ch = true; continue; }
      if (!Number.isInteger(m[k])) { m[k] = Math.floor(m[k]); ch = true; }
      if (m[k] > BAG_MAX) { m[k] = BAG_MAX; ch = true; }
      if (++n > BAG_IDS) { delete m[k]; ch = true; }
    }
  }
  return ch;
}

// ------------------------------------------------------------------ who built what
export function stamp(g, num) {
  const S = g.S, pi = rt(g), lo = pi.stampId; let max = lo;
  if (pi.stampNext === S.nextId) return;   // (no id has been handed out since the last look: nothing is new)
  for (const e of S.entities || []) if (e.id > lo) { if (e.own === undefined) e.own = num; if (e.id > max) max = e.id; }
  for (const c of S.cables || []) if (c.id > lo) { if (c.own === undefined) c.own = num; if (c.id > max) max = c.id; }
  pi.stampId = max; pi.stampNext = S.nextId;
}
// a piece's owner number for a refund: only while both players are present, and only when it is known
export function refundOwner(g, ref) {
  if (!ref || !g.net || !g.net.open || g.net.role === 'guest') return undefined;
  let o;
  if (ref.kind === 'cable') { const c = (g.S.cables || []).find((x) => x.id === ref.id); o = c && c.own; }
  else if (ref.kind === 'tile' || ref.kind === 'mach') { const e = g.S.entities.find((x) => x.id === ref.id); o = e && e.own; }
  return Number.isInteger(o) ? o : undefined;
}
// give an item back to the player numbered `own`. false when that is the acting player (the caller then does the ordinary thing) or the bag is gone.
export function refund(g, own, id, n = 1) {
  if (!Number.isInteger(own) || !g.net || !g.net.open || g.net.role === 'guest') return false;
  const a = acting(g), anum = a === 'h' ? 0 : bagFor(g, a).n;
  if (own === anum) return false;
  if (own === 0) { const m = hostMaps(g).items; m[id] = (m[id] || 0) + n; if (g._bagSwap) g._rtLater = true; else g.rebuildTools(); return true; }
  const b = bagByNum(g, own); if (!b) return false;
  b.items[id] = Math.min(BAG_MAX, (b.items[id] || 0) + n); touch(g); return true;
}
// how many pieces of a type the acting player has (rigs, borers): the limit of the upgrade applies to each player. Alone, the whole world's.
export function ownedCount(g, type) {
  const net = g.net;
  if (!net || !net.open) return g.machines.count(type);
  const me = ownerNum(g); let n = 0;
  for (const it of g.machines.items.values()) if (it.ent.type === type && ((it.ent.own === undefined ? 0 : it.ent.own) | 0) === me) n++;
  return n;
}

// ------------------------------------------------------------------ the friend arrives and leaves (host)
export function myPid() {
  if (myPid.v) return myPid.v;
  let v = '';
  try { v = localStorage.getItem('rotfactory.pid') || ''; } catch (e) { /* storage unavailable */ }
  if (!PID_RE.test(v)) {
    v = ''; const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
    try { const u = new Uint8Array(12); crypto.getRandomValues(u); for (const x of u) v += a[x % 36]; } catch (e) { for (let q = 0; q < 12; q++) v += a[(Math.random() * 36) | 0]; }
    try { localStorage.setItem('rotfactory.pid', v); } catch (e) { /* storage unavailable */ }
  }
  return (myPid.v = v);
}
export function purge(g) {
  const st = store(g), t = playSecs(g), cur = rt(g).pid;
  for (const pid of Object.keys(st.bags)) if (pid !== cur && t - (st.bags[pid].seen || 0) > KEEP_SECS) delete st.bags[pid];
}
export function clearBags(g) {
  const st = store(g), cur = rt(g).pid; let n = 0;
  for (const pid of Object.keys(st.bags)) if (pid !== cur) { delete st.bags[pid]; n++; }
  return n;
}
export function hello(g, m) {
  const pi = rt(g), st = store(g), name = String((m && m.name) || '').slice(0, 14);
  let pid = m && typeof m.pid === 'string' && PID_RE.test(m.pid) ? m.pid : '';
  purge(g);
  if (!pid) pid = 'guest';
  if (!st.bags[pid] && name) {   // a friend whose browser forgot its id: the bag kept under the same name comes back
    for (const k of Object.keys(st.bags)) { const b = st.bags[k]; if (k !== pi.pid && b.name && b.name.toLowerCase() === name.toLowerCase()) { delete st.bags[k]; b.pid = pid; st.bags[pid] = b; break; } }
  }
  const b = bagFor(g, pid, name); b.name = name || b.name; b.seen = playSecs(g);
  pi.pid = pid; pi.run.delete(pid);
  pi.stampId = 0; pi.stampNext = -1; stamp(g, 0);   // everything standing when a friend first comes is the host's
  return b;
}
export function guestLeft(g) {
  const pi = rt(g);
  if (pi.pid) { const b = store(g).bags[pi.pid]; if (b) b.seen = playSecs(g); pi.run.delete(pi.pid); }
  pi.pid = null;
}

// ------------------------------------------------------------------ sending the bag (host)
function run(g) {
  const pi = rt(g), pid = pi.pid || 'guest';
  let r = pi.run.get(pid); if (!r) { r = { q: 0, sent: null, t: 0, dirty: false, ask: 0 }; pi.run.set(pid, r); }
  return r;
}
const copyMap = (m) => Object.assign({}, m);
const hbKey = (b) => JSON.stringify([b.hotbar, b.sel, b.st ? 1 : 0, b.vs ?? null, b.ss ?? null]);
const flat = (m) => { const a = []; for (const k of Object.keys(m)) a.push(k, m[k]); return a; };
function remember(r, b) { r.sent = { items: copyMap(b.items), mats: copyMap(b.mats), hb: hbKey(b), n: b.n }; }
export function snapshot(g) {
  const b = curBag(g), r = run(g);
  capBag(b);
  const m = { t: 'inv', q: ++r.q, f: 1, pn: b.n, i: flat(b.items), m: flat(b.mats), h: b.hotbar.slice(), s: b.sel, st: b.st ? 1 : 0 };
  if (b.vs !== undefined) m.vs = b.vs; if (b.ss !== undefined) m.ss = b.ss;
  remember(r, b); r.t = now(); r.dirty = false;
  return m;
}
function diffOf(old, cur) {
  const out = [];
  for (const k of Object.keys(cur)) if (old[k] !== cur[k]) out.push(k, cur[k]);
  for (const k of Object.keys(old)) if (!(k in cur)) out.push(k, 0);
  return out;
}
export function delta(g) {
  const b = curBag(g), r = run(g);
  if (!r.sent) return snapshot(g);
  const i = diffOf(r.sent.items, b.items), mm = diffOf(r.sent.mats, b.mats), hb = hbKey(b), hbChanged = hb !== r.sent.hb;
  if (!i.length && !mm.length && !hbChanged) return null;
  if (i.length / 2 + mm.length / 2 > MAX_DELTA) return snapshot(g);
  const m = { t: 'inv', q: ++r.q };
  if (i.length) m.i = i; if (mm.length) m.m = mm;
  if (hbChanged) { m.h = b.hotbar.slice(); m.s = b.sel; m.st = b.st ? 1 : 0; }
  remember(r, b); return m;
}
export function flush(g, force) {
  if (!g.net || !g.net.open || g.net.role !== 'host' || g._worldGen) return false;
  const r = run(g), t = now();
  if (!force && t - r.t < MIN_GAP) { r.dirty = true; return false; }
  const m = delta(g);
  r.dirty = false; if (!m) return false;
  r.t = t; g.netSend(m); return true;
}
export function snapshotMsg(g) { return snapshot(g); }
// a friend asks for the whole bag again (a gap it could not close)
export function resync(g) { const r = run(g), t = now(); if (t - r.ask < 0.5) return false; r.ask = t; g.netSend(snapshot(g)); return true; }
// the friend's own report of its hotbar and dials
export function runHb(g, d) {
  if (!d || typeof d !== 'object') return false;
  const b = curBag(g), r = run(g);
  if (Array.isArray(d.h) && d.h.length === 9 && d.h.every((x) => x === null || validId(x))) b.hotbar = d.h.slice();
  if (Number.isInteger(d.s) && d.s >= 0 && d.s <= 8) b.sel = d.s;
  if (d.st === 0 || d.st === 1) b.st = d.st;
  if (typeof d.vs === 'number' && d.vs >= 0 && d.vs <= 100) b.vs = Math.round(d.vs);
  if (typeof d.ss === 'number' && d.ss >= 0 && d.ss <= 200) b.ss = Math.round(d.ss);
  const pi = rt(g); if (pi.stack.length && pi.cur === b.pid) { g.S.hotbar = b.hotbar; g.buildIdx = b.sel; g.stowed = !!b.st; }   // (a command runs with this bag swapped in: the swapped copies follow)
  if (r.sent) r.sent.hb = hbKey(b);   // (it is what the friend already has: no echo)
  return true;
}

// ------------------------------------------------------------------ the per frame tick (both roles)
export function tick(g, dt) {
  const net = g.net; if (!net || !net.open) return;
  if (net.role === 'host') hostTick(g, dt); else guestTick(g, dt);
}
function hostTick(g, dt) {
  const pi = rt(g); if (!pi.pid || g._worldGen) return;
  if (g.S.nextId !== pi.lastNext) { pi.lastNext = g.S.nextId; stamp(g, 0); }
  pi.acc += dt;
  const r = run(g);
  if (r.dirty || pi.acc >= 0.25) { if (pi.acc >= 0.25) pi.acc = 0; flush(g, false); }
}

// ------------------------------------------------------------------ the friend's side
export function guestReset(g) { g._pig = null; gst(g); g._myN = 0; }
function gst(g) { return g._pig || (g._pig = { q: -1, pend: new Map(), gapAt: 0, askAt: 0, hbKey: hbKeyOf(g), hbAt: 0 }); }
const flatToMap = (a) => { const o = {}; if (Array.isArray(a)) for (let n = 0; n + 1 < a.length; n += 2) if (validId(a[n]) && a[n + 1] >= 1) o[a[n]] = Math.min(BAG_MAX, Math.floor(a[n + 1])); return o; };
function patch(map, a) { if (!Array.isArray(a)) return; for (let n = 0; n + 1 < a.length; n += 2) { const k = a[n], v = Math.floor(+a[n + 1]); if (!validId(k)) continue; if (v >= 1) map[k] = Math.min(BAG_MAX, v); else delete map[k]; } }
function hbKeyOf(g) { const S = g.S; return JSON.stringify([S.hotbar, g.buildIdx, g.stowed ? 1 : 0, S.vacSet ?? null, S.scoopSet ?? null]); }
function applyOne(g, m) {
  const S = g.S;
  if (m.f) { S.items = flatToMap(m.i); S.mats = flatToMap(m.m); } else { S.items = S.items || {}; S.mats = S.mats || {}; patch(S.items, m.i); patch(S.mats, m.m); }
  if (Number.isInteger(m.pn)) g._myN = m.pn;
  if (Array.isArray(m.h) && m.h.length === 9 && m.h.every((x) => x === null || validId(x))) S.hotbar = m.h.slice();
  if (Number.isInteger(m.s) && m.s >= 0 && m.s <= 8) g.buildIdx = m.s;
  if (m.st === 0 || m.st === 1) g.stowed = !!m.st;
  if (typeof m.vs === 'number') S.vacSet = m.vs;
  if (typeof m.ss === 'number') S.scoopSet = m.ss;
  g.rebuildTools();
  gst(g).hbKey = hbKeyOf(g);
  const ui = g.ui; if (ui) { if (ui.openModal === 'craft') ui.renderCraft(); if (ui.openModal === 'inv') ui.renderInventory(); if (ui.openModal === 'shop') ui.renderShop(); }
}
function drain(g) {
  const p = gst(g);
  for (;;) { const m = p.pend.get(p.q + 1); if (!m) break; p.pend.delete(p.q + 1); p.q = m.q; applyOne(g, m); }
  for (const q of [...p.pend.keys()]) if (q <= p.q) p.pend.delete(q);
  if (!p.pend.size) p.gapAt = 0;
}
export function applyInv(g, m) {
  if (!m || typeof m !== 'object' || !Number.isInteger(m.q)) return;
  const p = gst(g);
  if (m.f) { if (m.q <= p.q && p.q - m.q < 1e6) return; p.q = m.q; applyOne(g, m); drain(g); return; }
  if (m.q <= p.q) return;   // (a copy, or one that came late: the bag is already past it)
  if (m.q === p.q + 1 && p.q >= 0) { p.q = m.q; applyOne(g, m); drain(g); return; }
  p.pend.set(m.q, m); if (!p.gapAt) p.gapAt = now();
  if (p.pend.size > 16) askSync(g);
}
function askSync(g) { const p = gst(g), t = now(); if (t - p.askAt < 1) return; p.askAt = t; p.pend.clear(); p.gapAt = 0; g.cmd('invsync', {}); }
// a craft puts the new item on the first free hotbar slot, on the host: the host must know the layout it starts from (everything else waits for the tick)
export function beforeCmd(g, c) { if (c === 'craft') guestHb(g, true); }
function guestHb(g, force) {
  const p = gst(g), key = hbKeyOf(g), t = now();
  if (key === p.hbKey) return;
  if (!force && t - p.hbAt < 0.2) return;
  p.hbKey = key; p.hbAt = t;
  const S = g.S, d = { h: Array.isArray(S.hotbar) ? S.hotbar.slice(0, 9) : emptyBar(), s: g.buildIdx | 0, st: g.stowed ? 1 : 0 };
  if (typeof S.vacSet === 'number') d.vs = S.vacSet; if (typeof S.scoopSet === 'number') d.ss = S.scoopSet;
  g.netSend({ t: 'cmd', c: 'hb', d });
}
function guestTick(g) {
  const p = g._pig; if (!p) return;
  if (p.pend.size && p.gapAt && now() - p.gapAt > 0.5) askSync(g);
  guestHb(g, false);
}

// ------------------------------------------------------------------ giving an item to the friend (or to the host)
// who: 'h' gives to the friend, 'g' gives to the host (what the friend's command means). The host judges everything.
export function transfer(g, from, to, id, n) {
  if (!g.net || !g.net.open || g.net.role === 'guest') return { ok: false, why: 'Only while you play together' };
  if (!validId(id)) return { ok: false, why: 'That is not something you have' };
  n = Math.floor(+n); if (!(n >= 1)) return { ok: false, why: 'Nothing to give' }; n = Math.min(n, GIVE_MAX);
  const r = g.remote, p = g.player && g.player.pos;
  if (!r || !r.pos || !p || !Number.isFinite(r.pos.x + r.pos.y + r.pos.z) || Math.hypot(r.pos.x - p.x, r.pos.y - p.y, r.pos.z - p.z) > GIVE_RANGE) return { ok: false, why: `Your friend is more than ${GIVE_RANGE} m away` };
  const a = invFor(g, from), b = invFor(g, to);
  const have = a[id] | 0; if (have < 1) return { ok: false, why: 'You do not have that' };
  if (!(id in b) && Object.keys(b).length >= BAG_IDS) return { ok: false, why: 'Their bag has no room for another kind of thing' };   // (capBag would drop it: the gift would be lost)
  const room = Math.max(0, BAG_MAX - (b[id] | 0)), give = Math.min(n, have, room);
  if (give < 1) return { ok: false, why: 'Their bag is full of that' };
  a[id] = have - give; if (a[id] <= 0) delete a[id];
  b[id] = (b[id] | 0) + give;
  if (from === 'h' || to === 'h') { if (g._bagSwap) g._rtLater = true; else g.rebuildTools(); }
  touch(g);
  return { ok: true, n: give };
}
// the host hands something to the friend (the key and the inventory click on the host call this; a friend's call is the `giveitem` command)
export function hostGive(g, id, n) {
  const r = transfer(g, 'h', 'g', id, n);
  if (r.ok) { flush(g, false); g.netSend({ t: 'toast', icon: '🎁', title: 'Your friend gave you something', text: `${r.n} x ${itemName(g, id)}`, ms: 4000 }); }
  return r;
}
// the key or the inventory click: both players come here. The check of range is made on both sides (the friend's page to save a message, the host to be sure).
export function giveKey(g, id, n) {
  if (!g.net || !g.net.open || !g.remote) { g.ui.hint('Nobody to give it to: this works when you play together.', 2.5); return false; }
  const r = g.remote, p = g.player.pos;
  if (g.dead || g.blacking) { g.ui.hint('Not while you are down.', 2); return false; }
  if (!validId(id)) { g.ui.hint('Take out the thing you want to give first (or Shift+click it in the inventory).', 3); return false; }
  if (Math.hypot(r.pos.x - p.x, r.pos.y - p.y, r.pos.z - p.z) > GIVE_RANGE) { g.ui.hint(`Your friend is more than ${GIVE_RANGE} m away. Stand next to them.`, 3); return false; }
  if ((g.S.items[id] | 0) < 1) { g.ui.hint('You do not have that.', 2); return false; }
  n = Math.max(1, Math.min(GIVE_MAX, Math.floor(+n) || 1));
  if (g.net.role === 'guest') { g.cmd('giveitem', { id, n }); return true; }
  const res = hostGive(g, id, n);
  g.ui.hint(res.ok ? `Gave ${res.n} x ${itemName(g, id)} to your friend.` : res.why, 3);
  return res.ok;
}
export function guestGive(g, d) {
  const r = transfer(g, 'g', 'h', d && d.id, d && d.n);
  if (!r.ok) g.netSend({ t: 'hint', text: r.why, s: 3 });
  else { g.ui.toast({ icon: '🎁', title: 'Your friend gave you something', text: `${r.n} x ${itemName(g, d.id)}`, ms: 4000 }); g.netSend({ t: 'hint', text: `Gave ${r.n} x ${itemName(g, d.id)} to your friend.`, s: 3 }); }
  return r;
}
export function itemName(g, id) { try { const r = recipes(g).find((x) => x.id === id); return r ? r.name : id; } catch (e) { return id; } }

// ------------------------------------------------------------------ what the other player holds, drawn on their avatar
const iconCache = new Map();
export function iconOf(g, id) {
  if (id === 'hammer') return '🔨';
  if (iconCache.has(id)) return iconCache.get(id);
  let ic = '🔧';
  try { const r = recipes(g).find((x) => x.id === id); if (r && r.icon) ic = r.icon; } catch (e) { /* recipes not ready */ }
  iconCache.set(id, ic); return ic;
}
export function heldNow(g) { if (g.stowed || !g.tools) return ''; const t = g.tools[g.buildIdx]; return t && t.id && t.have !== 0 ? String(t.id) : ''; }
export function heldSeen(g, m) {
  const r = g.remote; if (!r || typeof r.setHeld !== 'function') return;
  const id = typeof m.tl === 'string' && validId(m.tl) ? m.tl : '', n = Number.isInteger(m.cr) && m.cr > 0 ? Math.min(999, m.cr) : 0;
  r.setHeld(id ? iconOf(g, id) : '', n, id);
}
