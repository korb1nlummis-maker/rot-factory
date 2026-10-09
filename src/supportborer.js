// The Support Borer ("Tunnel Jumbo"): a cherry-picker style rig that bores a tunnel forward one column at a time and sets the supports behind its cutter by itself, from the
// supports you load into it. It is the Tunnel Borer's loop and the Portal's lining, but with the player's own supports (items from the bag) and the world's own roof rule:
//   * CLASS. What it bores follows what it holds: a frame cube (`frame:<mat>`) bores the regular 4 wide, 4 high tunnel, a giant arch (`garch:<span>:<mat>`) bores that arch's
//     span x height. Empty, it keeps the class it had (the regular tunnel at first). The bore is cut one column (one cell deep, the whole section) per beat.
//   * THE SAFE LIMIT. Before every column it cuts, it TRIES the cut (the cells are lifted out and put back, as the Portal weighs a lining) and asks the world's own roof rule
//     (world.stress: cavityLen, the safe length by depth, SUP_EXTRA and the thin cap rule) for the margin of the roof over that column. The margin is the number of cells the roof
//     still stands past its nearest anchor. When it would fall under SAFETY (2 cells) a support goes in first, so a cut column never has less than 2 cells in hand, and the unsupported
//     span never passes the safe limit. With no support to set (out, or Dig only) it stops BEFORE the cut that would pass the line. If a support cannot go in (no room, too weak for
//     the depth) it stops and says why.
//   * THE SUPPORT. It is set through the placement code a player uses (game.placeCurrent: the frame snapping and section rules, the strain test, stacking rules, the arch load check
//     and buckling refusal, sounds, ownership), one item taken from its load. A support is set 4 columns long in the bored section, one column back from the cutter (`back`), or flush
//     with the face when there is only room for that. It never sets a support it does not hold.
//   * LOAD. E with matching supports in your own bag loads them (up to CAP) and shows "Supports 7/12". E with nothing to load starts and stops it. Crouch + E empties it into your
//     bag, or (when it is already empty) steps its mode: supports at need, a support every 2, 3 or 4 cubes, or Dig only.
//   * It stops, and says why, when power is lost, when the next slab holds a wall, remains, a cache or a machine, when The One is ahead (it never cuts it), when the bore would open
//     into a cavity or another tunnel, when stale air is too thick, at the edge of the hall, and when a support cannot be set. It resumes by itself when the reason is gone.
// The host simulates; a guest draws what the host's 0.5 s row says and sends `sborer` commands (use, alt) that the host validates (range, the guest's own bag).
// State on the ent (saved): sk sn sm sg cl on fa lat bl steps placed dest. Runtime: bs bwhy.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C, NX, NZ, cellX, cellY, cellZ, idx } from './config.js';
import { NEEDLE, species, isSpecialCell } from './plushdata.js';
import { FRAME_TYPES } from './upgrades.js';
import { ARCH_SPANS } from './loadtrace.js';
import { compaction } from './util.js';
import * as A from './arches.js';
import * as VS from './vehiclescan.js';
import * as BINS from './bins.js';
import * as NB from './notebook.js';
import * as STACK from './stack.js';
import { sellBatch, STALE_CHOKE } from './earth.js';

export const CAP = 12;               // supports it carries
export const KW = 18;                // kW while it cuts or sets a support
export const KW_WAIT = 1.5;          // kW while it is on but halted
export const KW_PARK = 0.3;          // kW while it is stopped
export const SAFETY = 2;             // columns of roof it keeps in hand past the cut it makes (margin of the world's roof rule)
export const CELLS_PER_S = 8;        // cells a second at the base Cutter Head (a Portal does 12)
export const SET_TIME = 1.4;         // seconds a support takes to set
export const RETRY = 1.5;            // seconds between looks while it is halted
export const PRICE = 90000;          // the first rig at the bench; each one you run makes the next 60% dearer
export const GROWTH = 1.6;
export const UNLOCK = 450000;
export const REACH = 7;              // metres a guest may stand from it to use it
const K_BENCH = 3;
export const PSTATES = ['off', 'nopower', 'dig', 'set', 'out', 'need', 'blocked', 'breach', 'one', 'weak', 'room', 'done', 'hold', 'choke'];
export const MODES = ['Supports at need', 'A support every 2 cubes', 'A support every 3 cubes', 'A support every 4 cubes', 'Dig only'];   // index = modeIndex(e)
const TEXT = {
  off: 'Stopped: press E to start it',
  nopower: 'No power: run a Power Cable to it from a live pole or generator',
  dig: 'Boring the tunnel',
  set: 'Setting a support',
  out: 'Out of supports: load more',
  need: 'Dig only: the roof needs a support before the next cut. Set one by hand, or switch to Supports',
  blocked: 'Blocked: a wall, a pad, a machine or a belt stands in the bore',
  breach: 'Stopped short: the next cut would open into a cavity or another tunnel',
  one: 'Stopped short: THE ONE is ahead. It never cuts it',
  weak: 'Halted: the supports it holds would not bear the mountain here',
  room: 'Halted: there is no room behind the cutter to set a support',
  done: 'Finished: it reached the edge of the hall',
  hold: 'Stopped short: remains or a supply cache ahead',
  choke: 'Choking on stale air: a Support Fan must blow near the cutter',
};
export const isSB = (e) => !!e && e.type === 'sborer';
export const rigs = (g) => { const out = []; for (const it of g.machines.items.values()) if (isSB(it.ent)) out.push(it.ent); return out; };
export const byId = (g, id) => { const it = g.machines.items.get(id); return it && isSB(it.ent) ? it.ent : null; };
export const cost = (count) => Math.round(PRICE * Math.pow(GROWTH, count));
const LIVE = new Set();   // ids of the rigs this page made (so an idle tick looks at rigs, not at every frame and arch in the world)
const isInt = Number.isInteger;

// ---------------------------------------------------------------- what a load is
// 'frame:steel' -> { cl: 0, mat, name } ; 'garch:8:steel' -> { cl: 8, mat, name } ; anything else null
export function parseKind(g, id) {
  if (typeof id !== 'string') return null;
  const T = (g && g.T) || {};
  let m = /^frame:([a-z]+)$/.exec(id);
  if (m) { const ft = FRAME_TYPES[m[1]]; return ft && (T.frames || []).includes(m[1]) ? { cl: 0, mat: m[1], name: ft.name } : null; }
  const a = A.parseItem(id);
  if (a) return (T.frames || []).includes(a.mat) && A.unlockedSpan(T, a.span) ? { cl: a.span, mat: a.mat, name: A.nameOf(a.span, a.mat) } : null;
  return null;
}
const matIndex = (mat) => Object.keys(FRAME_TYPES).indexOf(mat);
// the supports in a bag (an item map), strongest first
export function loadable(g, bag) {
  const out = [];
  for (const [id, n] of Object.entries(bag || {})) { if (!(n > 0)) continue; const k = parseKind(g, id); if (k) out.push({ id, n, ...k }); }
  out.sort((a, b) => matIndex(b.mat) - matIndex(a.mat) || a.cl - b.cl);
  return out;
}
export const dimsOf = (cl) => (cl ? { sw: cl, sh: ARCH_SPANS[cl].h } : { sw: 4, sh: 4 });
const loOf = (e) => e.lat - (dimsOf(e.cl).sw >> 1) + 1;
const sgnOf = (e) => (e.dx + e.dz > 0 ? 1 : -1);
const axisX = (e) => e.dx !== 0;
// sg is the cubes per support (0 at need, 2, 3 or 4); the mode index is 0 at need, 1..3 every 2..4 cubes, 4 Dig only
const spacingOf = (e) => ((e.sm | 0) === 1 ? 0 : (e.sg | 0));
export const modeIndex = (e) => ((e.sm | 0) === 1 ? 4 : e.sg >= 2 && e.sg <= 4 ? e.sg - 1 : 0);
function setMode(e, mi) { if (mi >= 4) { e.sm = 1; e.sg = 0; } else { e.sm = 0; e.sg = mi === 0 ? 0 : mi + 1; } }

// ---------------------------------------------------------------- the geometry of the bore
// the column at along index a: every cell of the section
export function colCells(e, a) {
  const { sw, sh } = dimsOf(e.cl), lo = loOf(e), out = [], x = axisX(e);
  for (let l = 0; l < sw; l++) for (let b = 0; b < sh; b++) out.push(x ? [a, e.j + b, lo + l] : [lo + l, e.j + b, a]);
  return out;
}
// put the ent's cell and world position where its front column is
export function syncPos(e) {
  const { sw } = dimsOf(e.cl), lo = loOf(e), mid = lo + (sw - 1) / 2;
  if (axisX(e)) { e.i = e.fa; e.k = e.lat; e.x = cellX(e.fa); e.z = cellZ(lo) + ((sw - 1) / 2) * C; } else { e.i = e.lat; e.k = e.fa; e.x = cellX(lo) + ((sw - 1) / 2) * C; e.z = cellZ(e.fa); }
  e.y = e.j * C; void mid;
}

// ---------------------------------------------------------------- tell the player (host and guest)
function announce(g, icon, title, text) { VS.announce(g, icon, title, text, { ms: 7000 }); }
function say(g, text, secs = 3.5) {   // to whoever pressed E: a guest's command answers over the net, the host's own press is a hint
  if (g._actor === 'g' && g.net && g.net.open && g.net.role === 'host') g.netSend({ t: 'toast', icon: '🚧', title: 'Support Borer', text: String(text).slice(0, 120) });
  else g.ui.hint(text, secs);
}
function sync(g, e) { if (g.net && g.net.open && g.net.role === 'host') { g.netSend({ t: 'ent-', id: e.id }); g.netSend({ t: 'ent+', ent: g.stripEnt(e) }); } g.power.markDirty(); }
function setState(g, e, bs, why = '', loud = false) {
  const changed = e.bs !== bs;
  e.bs = bs; e.bwhy = why;
  if (changed && loud) {
    if (bs === 'out') { announce(g, '🚧', 'Out of supports: load more', 'The Support Borer stopped at a safe point. Load more supports (E with them in your bag) and it goes on by itself.'); if (g.sound && g.sound.error) g.sound.error(); }
    else announce(g, '🚧', 'Support Borer halted', why || TEXT[bs]);
    g.S.stats.sborerHalts = (g.S.stats.sborerHalts || 0) + 1;
  }
}

// ---------------------------------------------------------------- the roof rule: try the cut, ask the world
// the least margin (cells of roof still standing past the nearest anchor) of the roof over this column once it is cut; Infinity when there is no roof to weigh
export function trialMargin(g, e, a) {
  const w = g.world, { sw, sh } = dimsOf(e.cl), lo = loOf(e), x = axisX(e), cut = [], onRm = w.onRemove, onSet = w.onSet;
  let worst = Infinity;
  w.onRemove = null; w.onSet = null;   // a trial: no dust, and nothing for a guest to hear (the cells go back before anyone looks)
  try {
    for (const [i, j, k] of colCells(e, a)) { const it = w.removeCell(i, j, k, false); if (it) cut.push([i, j, k, it.sp, it.vr]); }
    for (let l = 0; l < sw; l++) {
      const st = w.stress(x ? a : lo + l, e.j + sh, x ? lo + l : a);
      if (st && st.margin < worst) worst = st.margin;
    }
  } finally {
    for (const [i, j, k, sp, vr] of cut) w.setCell(i, j, k, sp, vr);
    w.onRemove = onRm; w.onSet = onSet;
  }
  return worst;
}

// ---------------------------------------------------------------- setting a support through the player's own placement
// window 'back': the 4 columns ending one before the front column (the cutter keeps its own column, and an arch is never a Portal); 'flush': the last 4 columns
function sectionStart(e, win) { const s = sgnOf(e); return s > 0 ? e.fa - (win === 'back' ? 4 : 3) : e.fa + (win === 'back' ? 1 : 0); }
// can this support be set in this window? { ok, tool, planEnt, why, weak }
function planSupport(g, e, win) {
  const M = g.machines, k = parseKind(g, e.sk), axis = axisX(e) ? 'x' : 'z', m = sectionStart(e, win), lo = loOf(e);
  if (!k) return { ok: false, why: 'It holds nothing it can set' };
  if (k.cl === 0) {
    const ent = M.frameEnt(axis, k.mat, m, lo, e.j), plan = { ok: true, ent }, tool = { id: e.sk, kind: 'frame', fk: k.mat };
    const why = M.frameConflict(k.mat, ent) || STACK.cubeWhy(g, ent, k.mat);
    if (why) return { ok: false, why, room: true };
    const st = g.strainOf(tool, plan);
    if (st.state === 'break') return { ok: false, weak: true, why: `${st.name} would break here: ${st.pct}% load at ${Math.round(st.d)} m deep${st.next && FRAME_TYPES[st.next] ? '. Load ' + FRAME_TYPES[st.next].name + ' or better' : ''}` };
    return { ok: true, tool, plan, planEnt: ent };
  }
  const L = A.layout(g, axis, m, lo, e.j, k.cl, k.mat);
  if (!L.ok) return { ok: false, why: L.why, weak: /buckle/.test(L.why), room: !/buckle/.test(L.why) };
  return { ok: true, tool: { id: e.sk, kind: 'garch', p: { span: k.cl, mat: k.mat } }, plan: { ok: true, ent: L.ent }, planEnt: { axis, gm: m, glo: lo, gj: e.j } };
}
// the support goes in exactly as if a player set it: one item in the bag, game.placeCurrent, and the item is gone. Returns the new ent or null.
function placeVia(g, e, p) {
  const S = g.S, id = p.tool.id, before = S.items[id] || 0, id0 = S.nextId, hint = g.ui.hint, portal = g.T.portal, plan0 = g.plan;
  S.items[id] = before + 1;
  g.ui.hint = () => {}; g.T.portal = false;   // (no hint for every cube, and a lining arch at the face is not a Portal)
  try { g.plan = p.plan.ent && p.tool.kind === 'garch' ? { ok: true, ent: p.planEnt } : p.plan; g.placeCurrent(p.tool); }
  finally { g.ui.hint = hint; g.T.portal = portal; g.plan = plan0; if (before > 0) S.items[id] = before; else delete S.items[id]; }
  let made = null; for (let q = S.entities.length - 1; q >= 0 && S.entities[q].id >= id0; q--) { const o = S.entities[q]; if (o.type === 'frame' || o.type === 'garch') { made = o; break; } }
  if (made && isInt(e.own)) made.own = e.own;
  return made;
}
function setSupport(g, it, win) {
  const e = it.ent, p = planSupport(g, e, win);
  if (!p.ok) return p;
  const made = placeVia(g, e, p);
  if (!made) return { ok: false, why: 'The support could not be set', room: true };
  e.sn = Math.max(0, (e.sn | 0) - 1); e.placed = (e.placed | 0) + 1; e.bl = win === 'back' ? 1 : 0;
  g.S.stats.sborerSet = (g.S.stats.sborerSet || 0) + 1;
  it.setT = SET_TIME;
  sync(g, e);
  return { ok: true, made };
}

// ---------------------------------------------------------------- one beat of one rig (host)
function count(g, taken) {
  const S = g.S, sp = taken.sp; S.stats.plush++; S.stats.rar[species[sp].rarity]++; S.stats.cells++; S.stats.sborerDug = (S.stats.sborerDug || 0) + 1;
  if (taken.vr & 128) S.stats.shiny++;
  g.registerDex(sp, true);
}
const rateOf = (g, e) => { const { sw, sh } = dimsOf(e.cl); return (sw * sh) / CELLS_PER_S * ((g.T && g.T.borerRate ? g.T.borerRate : 12.2) / 12.2); };
function openShare(w, cells) { let n = 0; for (const [i, j, k] of cells) if (!w.solid(i, j, k)) n++; return n / Math.max(1, cells.length); }

function cutColumn(g, it, a) {
  const e = it.ent, w = g.world, flat = [];
  for (const [i, j, k] of colCells(e, a)) { const t = w.removeCell(i, j, k); if (t) { count(g, t); flat.push(t.sp, t.vr); } }
  if (flat.length) { const pk = BINS.pickHall(g, e.dest); if (pk.why) BINS.fallback(g, { k: 'ent', o: e }, pk.why, pk.named ? pk.named.name : ''); sellBatch(g, flat, 1, pk.bin.id); }
  e.fa = a; syncPos(e); e.bl = (e.bl | 0) + 1; e.steps = (e.steps | 0) + 1;
  g.noteDist(e.x, e.z);
  g.fx.dust(e.x + e.dx * 0.9, e.j * C + 0.9, e.z + e.dz * 0.9, 6, 0.8, 1);
  return flat.length;
}

// what one beat does; returns the seconds to the next beat
function beat(g, it) {
  const e = it.ent, w = g.world, sgn = sgnOf(e), a = e.fa + sgn, mode = modeIndex(e), { sw, sh } = dimsOf(e.cl);
  const halt = (bs, why, loud = true) => { setState(g, e, bs, why || TEXT[bs], loud); return RETRY; };
  if (a < 4 || a > (axisX(e) ? NX : NZ) - 5) { e.on = false; setState(g, e, 'done', TEXT.done, true); g.ui.toast({ icon: '🚧', title: 'Support Borer finished', text: 'It hit the edge of the hall.' }); sync(g, e); return 5; }
  const cells = colCells(e, a);
  for (const [i, j, k] of cells) if (!w.inside(i, j, k)) return halt('done', TEXT.done);
  NB.scan(g, 'Support Borer', e.x, e.z, 5);
  const hold = NB.holdFor(g, 'Support Borer', cells); if (hold) return halt('hold', hold);
  let needle = false, block = false;
  for (const [i, j, k] of cells) { const sp = w.get(i, j, k); if (sp === NEEDLE) needle = true; else if (isSpecialCell(sp) || g.logi.cellTaken(i, j, k)) block = true; }
  if (needle) return halt('one');
  if (block) return halt('blocked');
  // an open cavity or another tunnel: this column, or the wall after it, is mostly open air
  if (openShare(w, cells) >= 0.5) return halt('breach');
  { const next2 = colCells(e, a + sgn); if (next2.every(([i, j, k]) => w.inside(i, j, k)) && openShare(w, next2) >= 0.5) return halt('breach'); }
  if (g.dust && g.dust.stale({ x: cellX(axisX(e) ? a : e.i), y: e.j * C + 1.6, z: cellZ(axisX(e) ? e.k : a) }) > STALE_CHOKE) return halt('choke', `${TEXT.choke}`, false);
  // the roof rule
  const bl = e.bl | 0, margin = trialMargin(g, e, a), sg = spacingOf(e);
  const forced = sg > 0 && bl >= 4 * sg;
  if (margin < SAFETY || forced) {
    const have = (e.sn | 0) > 0 && mode !== 4;
    if (!have) {
      if (margin < SAFETY) return halt(mode === 4 ? 'need' : 'out', undefined, true);   // stop BEFORE the cut that would pass the line
    } else if (bl >= 4) {
      let r = null;
      for (const win of bl >= 5 ? ['back', 'flush'] : ['flush']) { r = setSupport(g, it, win); if (r.ok) break; if (r.weak) break; }
      if (!r.ok) {
        if (margin < SAFETY || r.weak) return halt(r.weak ? 'weak' : 'room', r.why, true);   // (a support that is only due by spacing and cannot go in does not stop a roof that is still safe)
      } else { setState(g, e, 'set'); return SET_TIME; }
    } else if (margin < 0) return halt('room', 'The roof here needs a support, and there is no room behind the cutter to set one yet (it needs 4 columns). Set one by hand first.', true);
  }
  if (margin < 0) return halt('room', 'The roof here needs a support first: set one by hand behind the cutter.', true);   // (never cut a column the roof rule would call unsupported)
  void sw; void sh;
  setState(g, e, 'dig'); e.warned = '';
  cutColumn(g, it, a);
  return rateOf(g, e) * compaction(e.x, e.z);
}

function step(g, it, dt) {
  const e = it.ent;
  if (!e.on) { if (e.bs !== 'off') e.bs = 'off'; return; }
  const pw = e.pw ?? 0;
  if (pw < 0.05) { if (e.bs !== 'nopower') setState(g, e, 'nopower', TEXT.nopower); return; }
  it.timer = (it.timer ?? 0) - dt * pw; if (it.timer > 0) return;
  // a halted rig only looks again when something changed (a load, a mode, power) or every 10 s: a trial cut is not free
  const key = `${e.sn}|${e.sm}|${e.sg}|${e.sk}|${e.cl}`;
  if (['out', 'need', 'room', 'weak', 'blocked', 'breach', 'one', 'hold', 'choke', 'done'].includes(e.bs) && it.haltKey === key && g.time - (it.haltT || 0) < 10) { it.timer = RETRY; return; }
  const prev = e.bs, d = beat(g, it);
  if (['out', 'need', 'room', 'weak', 'blocked', 'breach', 'one', 'hold', 'choke'].includes(e.bs)) { it.haltKey = key; it.haltT = g.time; } else it.haltKey = '';
  if (prev !== e.bs && (e.bs === 'dig' || prev === 'dig')) sync(g, e);
  it.timer = d;
}

// ---------------------------------------------------------------- E: load, start and stop, unload, mode
function heldId(g) { if (g.stowed || !g.tools) return ''; const t = g.tools[g.buildIdx]; return t && t.id && t.have !== 0 ? String(t.id) : ''; }
function kindText(g, e) { const k = parseKind(g, e.sk); return k ? k.name : 'nothing'; }
// host (or a command run for a guest: S.items is that player's bag): what pressing E (op 'use') or crouch + E (op 'alt') does
export function act(g, e, op, pref) {
  const S = g.S, bag = S.items;
  if (op === 'alt') {
    if ((e.sn | 0) > 0) {   // empty it into the bag (it stops first)
      const id = e.sk, n = e.sn | 0; e.on = false; e.bs = 'off'; e.sn = 0;
      S.items[id] = (S.items[id] || 0) + n; g.rebuildTools(); sync(g, e);
      say(g, `Unloaded ${n} ${kindText(g, { sk: id })} into your bag. Supports 0/${CAP}.`); return true;
    }
    const mi = (modeIndex(e) + 1) % MODES.length; setMode(e, mi); sync(g, e);
    say(g, `Support Borer: ${MODES[mi]}.`); return true;
  }
  const held = e.sn | 0, list = loadable(g, bag);
  let pick = null;
  if (held > 0) pick = list.find((k) => k.id === e.sk);
  else pick = list.find((k) => k.id === pref) || list[0];
  if (pick && held < CAP) {
    const n = Math.min(CAP - held, pick.n);
    if (n > 0) {
      if (held === 0) { e.cl = pick.cl; syncPos(e); }
      e.sk = pick.id; e.sn = held + n; S.items[pick.id] -= n; if (S.items[pick.id] <= 0) delete S.items[pick.id];
      e.bs = e.on ? e.bs : 'off'; wake(g, e);
      g.rebuildTools(); sync(g, e);
      say(g, `Supports ${e.sn}/${CAP} (${pick.name}). ${e.on ? 'It goes on.' : 'Press E again to start it.'}`); return true;
    }
  }
  e.on = !e.on; if (!e.on) e.bs = 'off';
  wake(g, e); sync(g, e);
  say(g, e.on ? `Support Borer running. Supports ${e.sn | 0}/${CAP}.` : 'Support Borer stopped.');
  return true;
}
function wake(g, e) { const it = g.machines.items.get(e.id); if (it) { it.haltKey = ''; it.timer = 0; } }

export function use(g, e) {
  if (g.isGuest()) { g.cmd('sborer', { id: e.id, op: g.player && g.player.crouch ? 'alt' : 'use', h: heldId(g) }); return true; }
  return act(g, e, g.player && g.player.crouch ? 'alt' : 'use', heldId(g));
}
// the host's side of a guest's command: everything is looked at again, nothing in it is a count
export function guestCmd(g, d) {
  if (!d || typeof d !== 'object' || g.isGuest()) return;
  const e = isInt(d.id) ? byId(g, d.id) : null; if (!e) return;
  if (d.op !== 'use' && d.op !== 'alt') return;
  const rp = g.remote && g.remote.pos; if (!rp || Math.hypot(rp.x - e.x, rp.z - e.z) > REACH + 3 || Math.abs(rp.y - (e.y || 0)) > 8) return;   // they must stand at it
  const pref = typeof d.h === 'string' && d.h.length <= 32 ? d.h : '';
  act(g, e, d.op, pref);
}

// ---------------------------------------------------------------- placement
function footOk(g, i, j, k) { const w = g.world; return j === 0 || w.solid(i, j - 1, k); }
export function check(g, ent) {
  const w = g.world, no = (why) => ({ ok: false, why });
  if (!ent || typeof ent !== 'object') return no('Nothing to place');
  for (const v of [ent.i, ent.j, ent.k]) if (!isInt(v)) return no('Bad rig');
  if (!((ent.dx === 0) !== (ent.dz === 0)) || Math.abs(ent.dx) > 1 || Math.abs(ent.dz) > 1 || !isInt(ent.dx) || !isInt(ent.dz)) return no('Bad rig');
  if (ent.j < 0 || !w.inside(ent.i, ent.j, ent.k) || ent.i < 6 || ent.k < 6 || ent.i > NX - 7 || ent.k > NZ - 7) return no('Not here');
  if (w.solid(ent.i, ent.j, ent.k) || w.solid(ent.i, ent.j + 1, ent.k)) return no('Stand it in an open tunnel or on open floor, facing the pile wall');
  if (!footOk(g, ent.i, ent.j, ent.k)) return no('Needs ground');
  if (g.logi.cellTaken(ent.i, ent.j, ent.k)) return no('Something is in the way');
  let face = false;
  for (let f = 1; f <= 2 && !face; f++) for (let v = 0; v < 4; v++) if (w.solid(ent.i + ent.dx * f, ent.j + v, ent.k + ent.dz * f)) { face = true; break; }
  if (!face) return no('Face the pile wall: it bores the way you face (stand right at the face)');
  for (const o of rigs(g)) if (Math.hypot(o.i - ent.i, o.k - ent.k) < 6) return no('Too close to another Support Borer');
  return { ok: true };
}
export function plan(g, tool, eye, dir, yaw) {
  const M = g.machines, w = g.world, no = (why, ent) => ({ plan: { ok: false, why, ent }, cost: 0 });
  const r = M.rayEmpty(eye, dir, 6);
  if (!r) return no('Aim at the floor at the face of the pile');
  let { i, j, k } = r.last, guard = 0;
  while (j > 0 && !w.solid(i, j - 1, k) && guard++ < 8) j--;
  const fx = Math.sin(yaw), fz = Math.cos(yaw); let dx = 0, dz = 0;
  if (Math.abs(fx) > Math.abs(fz)) dx = Math.sign(fx); else dz = Math.sign(fz);
  // the face may be a few cells ahead: stand it in the last open cell before the wall
  let found = false;
  for (let st = 0; st < 6 && !found; st++) {
    const ci = i + dx * st, ck = k + dz * st;
    if (w.solid(ci, j, ck) && st > 0) break;
    if (w.solid(ci + dx, j, ck + dz) || w.solid(ci + dx, j + 1, ck + dz) || w.solid(ci + dx, j + 2, ck + dz) || w.solid(ci + dx, j + 3, ck + dz)) { i = ci; k = ck; found = true; }
  }
  const ent = { i, j, k, dx, dz, x: cellX(i), y: j * C, z: cellZ(k) };
  if (!found) return no('Face the pile wall (stand at the face of a tunnel)', ent);
  const c = check(g, ent);
  return c.ok ? { plan: { ok: true, ent }, cost: 0 } : no(c.why, ent);
}
export function conflict(g, e, tool) {
  if (!tool || tool.id !== 'sborer') return 'That is not a Support Borer';
  const c = check(g, e); return c.ok ? null : c.why;
}
export function build(g, tool, e) {
  const c = check(g, e); if (!c.ok) return null;
  if (!g.S.stats.hintSborer) { g.S.stats.hintSborer = 1; g.ui.hint('<b>Support Borer</b> set. Run a Power Cable to it. <kbd>E</kbd> loads the supports from your bag (frame cubes: the regular tunnel, giant arches: that arch\'s tunnel), <kbd>E</kbd> again starts and stops it, <kbd>C</kbd>+<kbd>E</kbd> empties it or changes its mode. It sets a support before the roof needs one and stops when it runs out.', 14); }
  return { type: 'sborer', i: e.i, j: e.j, k: e.k, dx: e.dx, dz: e.dz, x: cellX(e.i), y: e.j * C, z: cellZ(e.k), lat: axisX(e) ? e.k : e.i, fa: axisX(e) ? e.i : e.k, hr: 2.2, sk: '', sn: 0, sm: 0, sg: 0, cl: 0, on: false, bl: 0, steps: 0, placed: 0 };
}
export const itemOf = () => 'sborer';
export function onRemove(g, ent) {
  LIVE.delete(ent.id);
  if (g.isGuest() || !((ent.sn | 0) > 0) || !ent.sk) return;
  g.giveItem(ent.sk, ent.sn | 0);   // the supports it still held go back to whoever built it (or to you)
}

// ---------------------------------------------------------------- bench row
export function recipes(g) {
  const T = g.T || {}, out = [];
  if (!(T.machines || []).includes('sborer')) return out;
  const n = rigs(g).length;
  out.push({
    id: 'sborer', kind: 'sborer', icon: '🚧', name: 'Support Borer', short: 'Jumbo', price: Math.round(cost(n) / K_BENCH), batch: [1],
    desc: 'A tunnel jumbo with a cherry-picker boom. It bores the tunnel one column at a time and sets the supports you load into it (frame cubes for the regular tunnel, giant arches for a big one) before the roof needs them, then stops by itself when it runs out. Needs power.',
    use: 'Stand it at the face of a tunnel, facing the pile wall, and press B. Run a Power Cable to it (18 kW). E loads the supports from your bag (up to 12), E again starts and stops it, crouch + E empties it into your bag (or, when empty, steps its mode: supports at need, every 2, 3 or 4 cubes, or Dig only).',
    statusFn: () => `${n} placed. Each one you run makes the next 60% dearer.`,
  });
  return out;
}

// ---------------------------------------------------------------- readout
export const kwOf = (e) => (!e.on ? KW_PARK : e.bs === 'dig' || e.bs === 'set' ? KW : KW_WAIT);
export function info(g, e) {
  const k = parseKind(g, e.sk), { sw, sh } = dimsOf(e.cl), st = e.bs || (e.on ? 'dig' : 'off'), lines = [];
  lines.push(st === 'off' || !TEXT[st] ? (e.on ? 'Running' : TEXT.off) : (e.bwhy && ['weak', 'room', 'hold', 'breach', 'blocked'].includes(st) ? e.bwhy : TEXT[st]));
  lines.push(`Supports ${e.sn | 0}/${CAP}${(e.sn | 0) > 0 ? ' (' + (k ? k.name : e.sk) + ')' : ''}. Mode: ${MODES[modeIndex(e)]}.`);
  lines.push(`Bores ${sw} wide and ${sh} high (${(sw * C).toFixed(1)} x ${(sh * C).toFixed(1)} m): ${e.cl ? 'a giant arch tunnel' : 'the regular cube tunnel'}. ${((e.steps | 0) * C).toFixed(1)} m bored, ${e.placed | 0} supports set. Draws ${KW} kW while it works.`);
  lines.push('It sets a support when the roof rule says the next cut would leave less than 2 cells in hand, and stops before that cut when it has none.');
  lines.push('E loads supports from your bag, or starts and stops it. Crouch + E empties it, or when empty steps its mode.');
  return { title: 'SUPPORT BORER', lit: !!e.on && st !== 'nopower', lines };
}

// ---------------------------------------------------------------- the mesh: a tracked body, a boom that reaches the roof with a basket, and a cutter drum
const MATS = {
  yellow: new THREE.MeshStandardMaterial({ color: 0xe8b81c, roughness: 0.5, metalness: 0.3 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.5, metalness: 0.8 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x77879a, roughness: 0.35, metalness: 0.9 }),
};
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
function box(list, sx, sy, sz, x, y, z, rx = 0) { const gm = new THREE.BoxGeometry(sx, sy, sz); _e.set(rx, 0, 0); _q.setFromEuler(_e); _p.set(x, y, z); _m4.compose(_p, _q, _s); gm.applyMatrix4(_m4); list.push(gm); }
function cylX(list, r, len, x, y, z) { const gm = new THREE.CylinderGeometry(r, r, len, 12); gm.rotateZ(Math.PI / 2); gm.translate(x, y, z); list.push(gm); }
const merged = (list, mat) => new THREE.Mesh(mergeGeometries(list), mat);
// local frame: +z is the way it bores, the origin is the floor under the FRONT column; the body stands behind it
export function buildMesh(opts = {}) {
  const group = new THREE.Group(), yel = [], dk = [], st = [];
  for (const s of [-1, 1]) { box(dk, 0.38, 0.5, 2.5, s * 0.66, 0.25, -1.55); for (let q = -2; q <= 2; q++) box(st, 0.44, 0.06, 0.12, s * 0.66, 0.04, -1.55 + q * 0.45); }
  box(yel, 1.5, 0.5, 2.3, 0, 0.78, -1.55); box(yel, 0.9, 0.35, 1.0, 0, 1.2, -2.0); box(st, 0.55, 0.5, 0.5, -0.4, 1.55, -2.05); box(dk, 0.2, 0.9, 0.2, 0, 1.2, -1.0);
  box(dk, 0.24, 0.24, 1.7, 0, 0.9, -0.15);   // the cutter arm
  const drumList = []; cylX(drumList, 0.5, 1.5, 0, 0.9, 0.85);
  for (let q = 0; q < 8; q++) { const a = (q / 8) * Math.PI * 2; box(drumList, 1.52, 0.14, 0.14, 0, 0.9 + Math.sin(a) * 0.55, 0.85 + Math.cos(a) * 0.55); }
  const boomList = [], basket = [];
  box(boomList, 0.2, 0.2, 2.8, 0, 0, 1.4); box(basket, 0.9, 0.08, 0.7, 0, 0.0, 2.9);
  for (const sx of [-1, 1]) box(basket, 0.06, 0.4, 0.7, sx * 0.45, 0.22, 2.9); box(basket, 0.9, 0.4, 0.06, 0, 0.22, 3.25);
  if (opts.ghost !== undefined) {
    const gm = mergeGeometries([...yel, ...dk, ...st, ...drumList, ...boomList, ...basket]), mat = new THREE.MeshBasicMaterial({ color: opts.ghost, transparent: true, opacity: 0.42, depthWrite: false });
    group.add(new THREE.Mesh(gm, mat)); return { group };
  }
  group.add(merged(yel, MATS.yellow), merged(dk, MATS.dark), merged(st, MATS.steel));
  const drum = merged(drumList, MATS.dark); drum.position.set(0, 0, 0); const dg = new THREE.Group(); dg.position.set(0, 0.9, 0.85); drum.position.set(0, -0.9, -0.85); dg.add(drum); group.add(dg);
  const boom = new THREE.Group(); boom.position.set(0, 1.35, -1.0); boom.add(merged(boomList, MATS.yellow), merged(basket, MATS.steel)); group.add(boom);
  const cubeMat = new THREE.MeshStandardMaterial({ color: 0x9a7b4f, roughness: 0.7, metalness: 0.2 }), cube = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), cubeMat); cube.position.set(0, 0.3, 2.9); boom.add(cube);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x222222 }), lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), lampMat); lamp.position.set(0.4, 1.5, -2.45); group.add(lamp);
  return { group, drum: dg, boom, cube, cubeMat, lampMat };
}
export function add(machines, ent) {
  const T = machines.game.T;   // (a saved rig is cleaned: every field is a plain number, flag or a short id)
  ent.dx = ent.dx > 0 ? 1 : ent.dx < 0 ? -1 : 0; ent.dz = ent.dx !== 0 ? 0 : ent.dz > 0 ? 1 : -1;
  ent.cl = ent.cl === 6 || ent.cl === 8 || ent.cl === 12 ? ent.cl : 0; ent.sn = isInt(ent.sn) ? Math.max(0, Math.min(CAP, ent.sn)) : 0; ent.sk = typeof ent.sk === 'string' && /^[A-Za-z0-9:_.-]{0,32}$/.test(ent.sk) ? ent.sk : '';
  if (!ent.sk) ent.sn = 0;
  ent.sm = ent.sm === 1 ? 1 : 0; ent.sg = ent.sg === 2 || ent.sg === 3 || ent.sg === 4 ? ent.sg : 0; ent.on = !!ent.on;
  for (const k of ['bl', 'steps', 'placed']) if (!isInt(ent[k]) || ent[k] < 0) ent[k] = 0;
  if (!isInt(ent.lat)) ent.lat = ent.dx !== 0 ? ent.k : ent.i; if (!isInt(ent.fa)) ent.fa = ent.dx !== 0 ? ent.i : ent.k;
  ent.hr = 2.2; syncPos(ent); void T;
  const rig = buildMesh(), scale = ent.cl === 6 ? 1.15 : ent.cl === 8 ? 1.3 : ent.cl === 12 ? 1.55 : 1;
  rig.group.position.set(ent.x, ent.y, ent.z); rig.group.rotation.y = Math.atan2(ent.dx, ent.dz); rig.group.scale.setScalar(scale);
  LIVE.add(ent.id);
  return { obj: rig.group, sb: rig, timer: 0.5, setT: 0 };
}
export function preview(g, tool, pl) {
  const M = g.machines, e = pl && pl.ent;
  if (!e || !isInt(e.i)) { M.showPreview(null, null); return; }
  const key = `sborer${e.dx}${e.dz}${pl.ok}`;
  if (!M.ghost || M.ghostKey !== key) M.setGhost(buildMesh({ ghost: pl.ok ? 0x9dffc4 : 0xff8a7a }).group, key);
  M.ghost.position.set(cellX(e.i), e.j * C, cellZ(e.k)); M.ghost.rotation.y = Math.atan2(e.dx, e.dz);
}

// ---------------------------------------------------------------- per frame
const LAMP = { off: 0x555555, nopower: 0x222222, dig: 0x45ff7a, set: 0x45ff7a, out: 0xffb02a, need: 0xffb02a, weak: 0xffb02a, room: 0xffb02a, choke: 0xffb02a, blocked: 0xff8a2a, breach: 0xff8a2a, hold: 0xff8a2a, one: 0xff3a2a, done: 0x3a8cff };
function visuals(g, dt, host) {
  for (const id of LIVE) {
    const it = g.machines.items.get(id), e = it && it.ent;
    if (!e || e.type !== 'sborer' || !it.sb) { if (!it || !e || e.type !== 'sborer') LIVE.delete(id); continue; }
    if (!host) { if (!isInt(e.fa)) continue; syncPos(e); }
    const k = Math.min(1, dt * 6), o = it.obj, sc = e.cl === 6 ? 1.15 : e.cl === 8 ? 1.3 : e.cl === 12 ? 1.55 : 1; if (o.scale.x !== sc) o.scale.setScalar(sc);
    o.position.x += (e.x - o.position.x) * k; o.position.z += (e.z - o.position.z) * k; o.position.y += (e.y - o.position.y) * k;
    const working = e.on && (e.bs === 'dig' || e.bs === 'set');
    if (it.setT > 0) it.setT -= dt;
    const rig = it.sb, want = it.setT > 0 ? 0.85 : 0.12;
    if (working || it.setT > 0 || Math.abs(rig.boom.rotation.x + want) > 0.01) rig.boom.rotation.x += (-want - rig.boom.rotation.x) * Math.min(1, dt * 4);
    if (working) rig.drum.rotation.x += dt * (e.bs === 'dig' ? 7 : 1.5);
    rig.cube.visible = (e.sn | 0) > 0;
    if (it.cubeKey !== e.sk) { it.cubeKey = e.sk; const kd = parseKind(g, e.sk), ft = kd && FRAME_TYPES[kd.mat]; if (ft) rig.cubeMat.color.set(ft.color); }
    const lc = LAMP[e.bs || 'off'] ?? 0x555555; if (it.lampKey !== lc) { it.lampKey = lc; rig.lampMat.color.setHex(lc); }
  }
}
export function tick(g, dt) {
  if (g.isGuest && g.isGuest()) return;
  if (!LIVE.size) return;
  for (const id of LIVE) { const it = g.machines.items.get(id); if (it && it.ent && it.ent.type === 'sborer' && it.sb) step(g, it, dt); }
  visuals(g, dt, true);
}
export function guestTick(g, dt) { if (LIVE.size) visuals(g, dt, false); }

// ---------------------------------------------------------------- guests: a 0.5 s row of what the host's rigs are doing
const ROW = { last: '', t: 0 };
export function row(g) {
  if (!LIVE.size) return null;
  const out = {}; let any = false;
  for (const id of LIVE) { const it = g.machines.items.get(id), e = it && it.ent; if (!e || e.type !== 'sborer') continue; out[e.id] = [e.fa, Math.max(0, PSTATES.indexOf(e.bs || 'off')), e.sn | 0, Math.round((e.pw ?? 0) * 100), e.on ? 1 : 0, e.bl | 0, e.steps | 0, e.placed | 0]; any = true; }
  if (!any) { ROW.last = ''; return null; }
  const s = JSON.stringify(out); if (s === ROW.last && g.time - ROW.t < 5) return null;
  ROW.last = s; ROW.t = g.time; return out;
}
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export function guestRow(g, d) {
  if (!d || typeof d !== 'object' || (g.net && g.net.open && g.net.role === 'host')) return;
  for (const e of rigs(g)) {
    if (!has(d, e.id)) continue; const a = d[e.id]; if (!Array.isArray(a) || a.length < 6 || !a.every((v) => Number.isFinite(v))) continue;
    e.fa = Math.max(0, Math.min(Math.max(NX, NZ), a[0] | 0)); e.bs = PSTATES[a[1]] || 'off'; e.sn = Math.max(0, Math.min(CAP, a[2] | 0)); e.pw = a[3] / 100; e.on = a[4] === 1; e.bl = Math.max(0, a[5] | 0);
    if (a.length > 6) e.steps = Math.max(0, a[6] | 0); if (a.length > 7) e.placed = Math.max(0, a[7] | 0);
  }
}
