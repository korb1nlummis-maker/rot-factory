// Detector gates and (Wave 7) detector arches. Wave 0 moved the walk-through scan here unchanged so later waves never edit game.js for it.
// game.playerGateScan(dt) forwards to playerScan(g, dt). Wave 7 extends this file (arch ents, target modes, sounds); catalog_detector.js registers the types.
//
// DETECTOR ARCH (wave 7a, first cut). You walk through it carrying plush:
//   nothing matches the target  -> a soft negative buzz (only when you carry something; an empty bag gets a quiet tick)
//   something matches           -> a two note da-ding, green and gold lamps, sparkles and a "MATCH" toast
//   The One mode and a match    -> the same da-ding, then the old win flow (foundNeedle) right away and the fanfare half a second later
// Targets: the One, a chosen species, a rarity (and better, or exactly), a species new to your Plushdex, a shiny variant.
// Two sizes share one ent type: type 'arch', size 1 = Detector Arch (4 x 4 cells), size 2 = Giant Detector Arch (8 x 7 cells, crown panel, plaza).
// Multiplayer: every player detects their own crossing on their own machine (zero latency sound). The host announces its own crossings with an
// `xrow` event and a guest tells the host with `cmd arch`, so both screens flash the same lamps. Settings travel through the generic `cfg` command.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C, cellX, cellZ } from './config.js';
import { NEEDLE, RARITY, species } from './plushdata.js';
import { speciesIcon } from './icons.js';

// The player walking through a belt mounted Detector Gate: carrying The One (hands or a cart within 4 m) raises the alarm and wins,
// anything else is a soft ding and a "SCAN CLEAR" hint. One crossing fires once (0.6 s cooldown shared by all gates).
export function playerScan(g, dt) {
  const p = g.player.pos, S = g.S;
  g._gateCd = (g._gateCd || 0) - dt;
  for (const t of g.logi.tiles.values()) {
    if (t.type !== 'belt' || !t.detector) continue;
    const dx = p.x - cellX(t.i), dz = p.z - cellZ(t.k);
    if (Math.abs(dx) > 3 || Math.abs(dz) > 3) { if (t._pIn) t._pIn = false; continue; }
    const d = t.dir || 0;
    const ax = [1, 0, -1, 0][d], az = [0, 1, 0, -1][d];
    const along = dx * ax + dz * az, lat = dx * -az + dz * ax;
    const inside = Math.abs(along) < 0.45 && Math.abs(lat) < 0.95 && p.y < t.j * C + 2.2;
    if (inside && !t._pIn && g._gateCd <= 0) {
      g._gateCd = 0.6;
      const cartN = S.cart && Math.hypot(S.cart.x - cellX(t.i), S.cart.z - cellZ(t.k)) < 4 ? S.cart.load.length : 0;
      const all = [...S.carry, ...(cartN ? S.cart.load : [])];
      if (all.some((x) => x.sp === NEEDLE)) { g.logi.setGate(t, true); g.foundNeedle('the gate'); }
      else {
        g.logi.setGate(t, false); t.flash = 0.35;
        g.gateDing(0.07, 0.05);
        S.stats.scans = (S.stats.scans || 0) + all.length;
        g.ui.hint(`<b>SCAN CLEAR</b> ${all.length} plush${cartN ? ' (with cart)' : ''}. The One is not in your bag.`, 2.5);
      }
    }
    t._pIn = inside;
  }
  archScan(g, dt);
}

// ======================================================================================================
// detector arch
// ======================================================================================================
export const MODES = ['one', 'species', 'rarity', 'fresh', 'variant'];
export const MODE_NAMES = { one: 'The One', species: 'A species', rarity: 'A rarity', fresh: 'New to the dex', variant: 'Shiny variant' };
const MODE_HELP = {
  one: 'Matches Il Rotto Supremo. A match is the win.',
  species: 'Matches one exact species.',
  rarity: 'Matches a rarity and better, or that rarity only.',
  fresh: 'Matches a species you have handled once or never, so a find stays flagged until you meet a second.',
  variant: 'Matches shiny plush.',
};
// size -> opening in cells (w across, h up), pylon and beam thickness in meters, and the price
export const SIZES = {
  1: { name: 'Detector Arch', short: 'Arch', w: 4, h: 4, pylon: 0.3, beam: 0.36, depth: 0.5, kw: 1.5, hr: 1.6 },
  2: { name: 'Giant Detector Arch', short: 'Giant Arch', w: 8, h: 7, pylon: 0.5, beam: 0.6, depth: 0.7, kw: 4, hr: 3.0 },
};
export const PRICES = { 1: 12000, 2: 220000 };   // what the bench charges (bench rows are divided by the K multiplier, see recipes)
const K_BENCH = 3;
export const sizeOfId = (id) => (id === 'archBig' ? 2 : id === 'arch' ? 1 : 0);   // the recipe id decides the size (a guest's tool.p is never trusted)
export const sizeOfTool = (tool) => sizeOfId(tool && tool.id) || 1;
const isArch = (e) => !!e && e.type === 'arch';
export const archSize = (e) => (e && e.size === 2 ? 2 : 1);

// the free opening in cells once the pylons and the beam are taken off (what carts, bots and trucks must fit through)
export function archClear(ent) { const s = SIZES[archSize(ent)]; return { w: Math.floor((s.w * C - s.pylon * 1.4) / C + 1e-6), h: Math.floor((s.h * C - s.beam - 0.1) / C + 1e-6) }; }

// ---------- per ent runtime state (never saved, never sent): crossing memory, lamp flash, power ----------
const STATE = new WeakMap();
function st(e) { let s = STATE.get(e); if (!s) { s = { in: false, along: null, cd: 0, flash: 0, kind: '', powered: false, pt: 0, last: null, rig: null }; STATE.set(e, s); } return s; }
export const archState = st;

// ---------- matching ----------
export function matchItem(g, ent, it) {
  if (!it) return false;
  const sp = species[it.sp]; if (!sp) return false;
  switch (ent.mode) {
    case 'species': return ent.target > 0 && it.sp === ent.target;
    case 'rarity': { const r = ent.rarity ?? 2; return ent.exact ? sp.rarity === r : sp.rarity >= r; }
    case 'fresh': { const n = g.S.dex[it.sp]; return !n || n <= 1; }
    case 'variant': return !!(it.vr & 128);
    default: return it.sp === NEEDLE;
  }
}
export function targetLabel(ent) {
  switch (ent.mode) {
    case 'species': return ent.target > 0 && species[ent.target] ? species[ent.target].name : 'a species (not picked yet)';
    case 'rarity': { const r = RARITY[ent.rarity ?? 2] || RARITY[2]; return ent.exact ? `${r.name} only` : r.id === 5 ? r.name : `${r.name} or better`; }
    case 'fresh': return 'a species new to your Plushdex';
    case 'variant': return 'a shiny variant';
    default: return 'The One';
  }
}

// the carry list a crossing scans: your hands, plus the cart load when the cart is within 4 m (6 m for the giant) of the arch
export function probeOf(g, ent) {
  const S = g.S, near = archSize(ent) === 2 ? 6 : 4;
  const cartN = S.cart && Math.hypot(S.cart.x - ent.cx, S.cart.z - ent.cz) < near ? S.cart.load : null;
  return cartN ? [...S.carry, ...cartN] : [...S.carry];
}

// ---------- power: a pole or generator in reach with some power. No power is fine for the player scan (battery); lamps need it ----------
export function powerOf(g, ent) {
  if (ent.pw !== undefined) return ent.pw > 0.05;   // the grid solver counts an arch as a consumer (power.js) and sets .pw; a cable can wire it too
  const reach = (g.T && g.T.poleReach || 0) + ent.w / 2, r2 = reach * reach, y = ent.y0 + 1.0;
  for (const net of g.power.nets || []) for (const n of net.nodes) {
    const [nx, ny, nz] = g.power.pos(n); const dx = ent.cx - nx, dz = ent.cz - nz, dy = y - ny;
    if (dx * dx + dz * dz + dy * dy * 0.5 <= r2 && (n.pw ?? 0) > 0.05) return true;
  }
  return false;
}

// ---------- sound level: base 0.1, scaled by the arch's volume setting and the distance (full inside 8 m, off at 60 m); giants are 1.5x ----------
export function volumeFor(g, ent) {
  const p = g.player.pos, d = Math.hypot(p.x - ent.cx, p.z - ent.cz), f = d <= 8 ? 1 : d >= 60 ? 0 : (60 - d) / 52;
  return 0.1 * (ent.volume ?? 0.7) * (archSize(ent) === 2 ? 1.5 : 1) * f;
}

// ---------- the reaction every screen shows for one crossing ----------
// kind: 'tick' (empty bag), 'bad' (nothing matched), 'ok' (a match). info: { mine, n, sp }
export function react(g, ent, kind, info = {}) {
  const s = st(ent), snd = g.sound, big = archSize(ent) === 2, vol = volumeFor(g, ent);
  const name = info.sp && species[info.sp] ? species[info.sp].name : '';
  s.flash = kind === 'ok' ? 1.5 : kind === 'bad' ? 0.95 : 0.3; s.kind = kind;
  s.last = { t: g.time, kind, n: info.n || 0, name };
  if (vol > 0.002 && snd) {
    if (kind === 'tick') { if (snd.archTick) snd.archTick(vol); }
    else if (kind === 'bad') { if (!ent.quiet && snd.archNotFound) snd.archNotFound(vol, big); }
    else if (snd.archFound) snd.archFound(vol);
  }
  const top = ent.y0 + ent.h;
  if (kind === 'ok' && g.fx && vol > 0.002) {
    g.fx.sparkle(ent.cx, top - 0.4, ent.cz, big ? 46 : 28, 1, 0.85, 0.4);
    g.fx.burst(ent.cx, top - 0.2, ent.cz, big ? 40 : 22, 0.4, 1, 0.5, big ? 4 : 3, 0.07, 1.4);
    g.fx.burst(ent.cx, top - 0.2, ent.cz, big ? 40 : 22, 1, 0.82, 0.3, big ? 4 : 3, 0.07, 1.4);
  }
  if (info.mine) {
    if (kind === 'ok') {
      const more = Math.max(0, (info.hits || 1) - 1);
      g.ui.toast({ img: info.sp && ent.mode !== 'one' ? safeIcon(info.sp) : undefined, icon: '✅', title: `MATCH: ${name || targetLabel(ent)}`, text: more ? `and ${more} more in your bag` : MODE_NAMES[ent.mode] || '', ms: 3200 });
    } else if (kind === 'bad') g.ui.hint(`<b>NOT FOUND:</b> none of what you carry matches ${targetLabel(ent)}.`, 2.8);
  }
}
function safeIcon(sp) { try { return speciesIcon(sp); } catch (e) { return undefined; } }

// ---------- the crossing test, run every frame from playerScan on every machine (host and guest) ----------
export function archScan(g, dt) {
  if (g.mode !== 'play') return;
  const p = g.player.pos;
  for (const it of g.machines.items.values()) {
    const e = it.ent; if (!isArch(e) || !Number.isFinite(e.cx)) continue;
    const s = st(e); if (s.cd > 0) s.cd -= dt;
    const dx = p.x - e.cx, dz = p.z - e.cz;
    if (Math.abs(dx) > 8 || Math.abs(dz) > 8) { s.in = false; s.along = null; continue; }
    const along = e.axis === 'x' ? dx : dz, lat = e.axis === 'x' ? dz : dx;
    const open = Math.abs(lat) < e.w / 2 - 0.12 && p.y > e.y0 - 1.0 && p.y < e.y0 + e.h - 0.6;
    const slab = open && Math.abs(along) < 0.45;
    // a fast step can jump the slab between two frames: a sign change right next to the plane counts too
    const jumped = open && s.along !== null && s.along * along < 0 && Math.abs(s.along) < 1.2 && Math.abs(along) < 1.2;
    if ((slab && !s.in || jumped) && s.cd <= 0) { s.cd = 0.6; cross(g, e, s); }
    s.in = slab; s.along = along;
  }
}

function cross(g, ent, s) {
  const probe = probeOf(g, ent), hits = probe.filter((x) => matchItem(g, ent, x));
  const kind = !probe.length ? 'tick' : hits.length ? 'ok' : 'bad', first = hits[0];
  g.S.stats.scans = (g.S.stats.scans || 0) + probe.length;
  if (kind === 'ok') g.S.stats.archHits = (g.S.stats.archHits || 0) + 1;   // achievement counter: a crossing that matched the arch's target
  react(g, ent, kind, { mine: true, n: probe.length, sp: first ? first.sp : 0, hits: hits.length });
  const d = { id: ent.id, k: kind, n: Math.min(2000, probe.length), sp: first ? first.sp : 0 };
  if (g.isGuest()) g.cmd('arch', d);
  else if (g.net.open && g.net.role === 'host') g.netSend({ t: 'xrow', k: 'arch', d: { ...d, by: 'h' } });
  void s;
  if (kind === 'ok' && ent.mode === 'one' && hits.some((x) => x.sp === NEEDLE)) win(g);
}

// da-ding now, the old win flow now (S.found is never delayed), the fanfare half a second behind the da-ding
function win(g) {
  const snd = g.sound, had = Object.prototype.hasOwnProperty.call(snd, 'found'), orig = snd.found;
  snd.found = function () { snd.found = orig; setTimeout(() => { try { orig.call(snd); } catch (e) { /* audio is optional */ } }, 500); };
  try { g.foundNeedle('the arch'); } finally { if (had) snd.found = orig; else delete snd.found; }
}

// host side of `cmd arch` from a guest: only a sane report from a guest standing near the arch is shown (and heard) here
export function guestCross(g, d) {
  if (!d || typeof d !== 'object' || g.isGuest()) return;
  const it = g.machines.items.get(d.id), e = it && it.ent; if (!isArch(e)) return;
  if (!['tick', 'bad', 'ok'].includes(d.k)) return;
  const n = Number.isInteger(d.n) && d.n >= 0 && d.n <= 2000 ? d.n : 0, sp = Number.isInteger(d.sp) && species[d.sp] ? d.sp : 0;
  const rp = g.remote && g.remote.pos; if (!rp || Math.hypot(rp.x - e.cx, rp.z - e.cz) > 12 || rp.y < e.y0 - 4 || rp.y > e.y0 + e.h + 3) return;   // the friend must really be there
  react(g, e, d.k === 'ok' && !sp ? 'bad' : d.k, { mine: false, n, sp });
}

// ---------- host rows and guest events (xrow k:'arch') ----------
const ROW = { last: '', t: 0 };
export function row(g) {
  const pw = {}; let any = false;
  for (const it of g.machines.items.values()) if (isArch(it.ent)) { pw[it.ent.id] = st(it.ent).powered ? 1 : 0; any = true; }
  if (!any) { ROW.last = ''; return null; }
  const s = JSON.stringify(pw); if (s === ROW.last && g.time - ROW.t < 5) return null;
  ROW.last = s; ROW.t = g.time; return { pw };
}
export function guestRow(g, d) {
  if (!d || typeof d !== 'object') return;
  if (d.pw && typeof d.pw === 'object') for (const it of g.machines.items.values()) if (isArch(it.ent) && Object.prototype.hasOwnProperty.call(d.pw, it.ent.id)) st(it.ent).powered = d.pw[it.ent.id] === 1;
  if (typeof d.k === 'string' && ['tick', 'bad', 'ok'].includes(d.k) && d.by === 'h') {
    const it = g.machines.items.get(d.id), e = it && it.ent; if (!isArch(e)) return;
    react(g, e, d.k, { mine: false, n: Number.isInteger(d.n) ? d.n : 0, sp: Number.isInteger(d.sp) && species[d.sp] ? d.sp : 0 });
  }
}

// ---------- cfg hooks ----------
export function check(g, ent, c) {
  const mode = c.mode ?? ent.mode, target = c.target ?? ent.target;
  if (c.target !== undefined && c.target !== 0 && !species[c.target]) return 'No such species';
  if (mode === 'species' && !(target > 0 && species[target])) return 'Pick a species first';
  return null;
}
export function onCfg(g, ent) { const s = st(ent); s.last = null; }

// ======================================================================================================
// placement: plan, build, conflict (the host re-derives everything from a few integers; a guest's numbers are never trusted)
// ======================================================================================================
const overlapsArch = (g, e) => {
  const box = (a) => { const hw = a.w / 2, hd = SIZES[archSize(a)].depth / 2; return a.axis === 'x' ? [a.cx - hd, a.cx + hd, a.cz - hw, a.cz + hw] : [a.cx - hw, a.cx + hw, a.cz - hd, a.cz + hd]; };
  const A = box(e);
  for (const it of g.machines.items.values()) {
    const o = it.ent; if (!isArch(o) || o === e || o.id === e.id) continue;
    const B = box(o); if (A[0] < B[1] - 0.05 && A[1] > B[0] + 0.05 && A[2] < B[3] - 0.05 && A[3] > B[2] + 0.05 && e.y0 < o.y0 + o.h - 0.05 && e.y0 + e.h > o.y0 + 0.05) return true;
  }
  return false;
};

// the fields of an arch whose section starts at along index m, lateral origin lo and floor level j0 (cells), or { ok:false, why }
export function layout(g, size, axis, m, lo, j0) {
  const S = SIZES[size]; if (!S || (axis !== 'x' && axis !== 'z')) return { ok: false, why: 'Bad arch' };
  for (const v of [m, lo, j0]) if (!Number.isInteger(v)) return { ok: false, why: 'Bad arch' };
  const w = g.world; let n = 0;
  const cell = (a, b) => (axis === 'x' ? [m, j0 + b, lo + a] : [lo + a, j0 + b, m]);
  for (let a = 0; a < S.w; a++) for (let b = 0; b < S.h; b++) { const [i, j, k] = cell(a, b); if (!w.inside(i, j, k)) return { ok: false, why: 'Outside the hall' }; if (w.solid(i, j, k)) n++; }
  const ent = {
    size, axis, gm: m, glo: lo, gj: j0,
    cx: axis === 'x' ? cellX(m) : cellX(lo) + ((S.w - 1) / 2) * C, cz: axis === 'x' ? cellZ(lo) + ((S.w - 1) / 2) * C : cellZ(m), y0: j0 * C,
    w: S.w * C - 0.04, h: S.h * C - 0.02, yaw: axis === 'x' ? Math.PI / 2 : 0, hr: S.hr,
    mode: 'one', target: 0, rarity: 2, exact: false, volume: 0.7, quiet: false, clear: null,
  };
  ent.clear = archClear(ent);
  if (n) return { ok: false, why: `Dig this section out first: ${n} plush in the way (it needs ${S.w} wide and ${S.h} high)`, ent };
  for (const a of [0, S.w - 1]) { const [i, j, k] = cell(a, 0); if (j0 > 0 && !w.solid(i, j0 - 1, k)) return { ok: false, why: 'Both legs need solid floor under them', ent }; }
  if (overlapsArch(g, ent)) return { ok: false, why: 'Another arch is already here', ent };
  for (const a of [0, S.w - 1]) for (let b = 0; b < S.h; b++) { const [i, j, k] = cell(a, b); const why = g.logi.cellTaken(i, j, k); if (why) return { ok: false, why: 'A leg would stand on something (a belt, a rail piece or a shaft)', ent }; }   // the two legs need their cells; the middle may carry a belt or a track under the span
  return { ok: true, ent };
}

export function plan(g, tool, eye, dir, yaw) {
  const size = sizeOfTool(tool), S = SIZES[size], w = g.world, M = g.machines;
  const no = (why, ent) => ({ plan: { ok: false, why, ent }, cost: 0 });
  const r = M.rayEmpty(eye, dir, 6);
  if (!r) return no('Aim at the floor where the arch should stand');
  let { i, j, k } = r.last, guard = 0;
  while (j > 0 && !w.solid(i, j - 1, k) && guard++ < 8) j--;
  if (j > 0 && !w.solid(i, j - 1, k)) return no('No floor here');
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  let axis = Math.abs(fx) > Math.abs(fz) ? 'x' : 'z', m = axis === 'x' ? i : k, lo = (axis === 'x' ? k : i) - (S.w / 2 - 1), j0 = j, snap = '';
  // the small arch has a frame's 4 x 4 footprint: near a frame line it takes the frame's lateral window and floor, so it sits in line with the frames
  if (size === 1) {
    let best = null, bd = 7;
    for (const it of M.items.values()) {
      const f = it.ent; if (f.type !== 'frame' || f.turned) continue;
      const b = M.frameBlock(f), al = b.axis === 'x' ? i : k, la = b.axis === 'x' ? k : i;
      if (la < b.lo - 1 || la > b.lo + 4 || j < b.j0 - 1 || j > b.j0 + 4) continue;
      const d = al < b.m ? b.m - al : al > b.m + b.n - 1 ? al - (b.m + b.n - 1) : 0; if (d < bd) { bd = d; best = { b, al }; }
    }
    // a frame is a hollow cube 4 cells deep: the arch stands just outside it, on the side you aim at (an old one cell deep frame: right after it)
    if (best) { const bb = best.b; axis = bb.axis; lo = bb.lo; j0 = bb.j0; m = best.al >= bb.m && best.al < bb.m + bb.n ? (bb.n === 1 ? bb.m + 1 : (best.al - bb.m) * 2 < bb.n ? bb.m - 1 : bb.m + bb.n) : best.al; snap = 'in line with the frames'; }
  }
  const L = layout(g, size, axis, m, lo, j0);
  if (L.ent && snap) L.ent.snap = snap;
  return { plan: L.ok ? { ok: true, ent: L.ent } : { ok: false, why: L.why, ent: L.ent }, cost: 0 };
}

export function conflict(g, e, tool) {
  if (!tool || (tool.id !== 'arch' && tool.id !== 'archBig')) return 'That is not an arch';
  if (!e || typeof e !== 'object') return 'Nothing to place';
  const L = layout(g, sizeOfTool(tool), e.axis, e.gm, e.glo, e.gj);
  return L.ok ? null : L.why;
}

export function build(g, tool, e) {
  const L = layout(g, sizeOfTool(tool), e && e.axis, e && e.gm, e && e.glo, e && e.gj);
  if (!L.ok) return null;
  return { type: 'arch', ...L.ent };
}

export function preview(g, tool, pl) {
  const M = g.machines, e = pl && pl.ent;
  if (!e || !Number.isFinite(e.cx)) { M.showPreview(null, null); return; }
  const key = `arch${archSize(e)}${e.axis}${pl.ok}`;
  if (!M.ghost || M.ghostKey !== key) M.setGhost(buildArchMesh(archSize(e), { ghost: pl.ok ? 0x9dffc4 : 0xff8a7a }).group, key);
  M.ghost.position.set(e.cx, e.y0, e.cz); M.ghost.rotation.y = e.yaw || 0;
}

export const itemOf = (ent) => (archSize(ent) === 2 ? 'archBig' : 'arch');
export function onRemove(g, ent) { const s = STATE.get(ent); if (s && s.rig && s.rig.tex) s.rig.tex.dispose(); STATE.delete(ent); if (PANEL && PANEL.id === ent.id && g.ui.openModal === 'archPanel') g.ui.closeModals(); }

// ======================================================================================================
// bench rows
// ======================================================================================================
export function recipes(g) {
  const T = g.T || {}, m = T.machines || [], out = [], count = (sz) => { let n = 0; for (const it of g.machines.items.values()) if (isArch(it.ent) && archSize(it.ent) === sz) n++; return n; };
  if (m.includes('arch')) out.push({
    id: 'arch', kind: 'arch', icon: '⛩️', name: SIZES[1].name, short: SIZES[1].short, price: PRICES[1] / K_BENCH, batch: [1, 2, 3], p: { size: 1 },
    desc: 'A steel walk-through arch, 2.4 m wide and 2.4 m tall. Carry plush through it: a soft buzz when nothing you carry is what it looks for, a two note da-ding when something is. E picks the target.',
    use: 'Set it down with B (it faces the way you look, so you walk through it), then press E on it to pick what it looks for. It works without power; lamps need a pole.',
    statusFn: () => `${count(1)} placed. 1.5 kW for the lamps. Fits a 4 x 4 frame line.`,
  });
  if (m.includes('archBig')) out.push({
    id: 'archBig', kind: 'arch', icon: '🏛️', name: SIZES[2].name, short: SIZES[2].short, price: PRICES[2] / K_BENCH, batch: [1, 1, 1], p: { size: 2 },
    desc: 'The giant arch: 4.8 m wide and 4.2 m tall, a lit crown panel that shows its target, a 6 m crowd plaza and a louder buzz with a low thunk. Wide enough for carts, bots and Haul Trucks.',
    use: 'Set it down with B where you can see the crown panel from the approach, then press E on it to pick the target. It needs a clear section 8 wide and 7 high.',
    statusFn: () => `${count(2)} placed. 4 kW for the lamps and crown. Clear opening 7 x 6 cells.`,
  });
  return out;
}

// ======================================================================================================
// readout (hover)
// ======================================================================================================
export function info(g, ent) {
  const s = st(ent), S = SIZES[archSize(ent)], lines = [];
  lines.push(`Looking for: ${targetLabel(ent)}`);
  lines.push(`Mode: ${MODE_NAMES[ent.mode] || 'The One'}. ${MODE_HELP[ent.mode] || ''}`);
  lines.push(s.powered ? `Powered. Lamps and crown are lit (${S.kw} kW).` : `No power: it still scans you from its battery, but the lamps stay dark. A pole or generator within reach lights it (${S.kw} kW).`);
  if (s.last) { const ago = Math.max(0, Math.round(g.time - s.last.t)); lines.push(s.last.kind === 'ok' ? `Last scan ${ago} s ago: MATCH ${s.last.name || ''}`.trim() : s.last.kind === 'bad' ? `Last scan ${ago} s ago: not found (${s.last.n} plush)` : `Last scan ${ago} s ago: nothing carried`); }
  else lines.push('Nothing scanned yet.');
  lines.push(`Walk through it carrying plush: a match rings a da-ding, no match buzzes, an empty bag only ticks.${ent.quiet ? ' Quiet mode: no buzz.' : ''}`);
  lines.push(`Opening ${(S.w * C).toFixed(1)} m wide, ${(S.h * C).toFixed(1)} m high${archSize(ent) === 2 ? ', clear for carts, bots and Haul Trucks' : ''}. E picks the target, Shift+E copies its settings.`);
  return { title: S.name.toUpperCase(), lit: s.powered, lines };
}

// ======================================================================================================
// meshes
// ======================================================================================================
const MAT = {
  steel: new THREE.MeshStandardMaterial({ color: 0x77879a, roughness: 0.35, metalness: 0.9 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.6, metalness: 0.4 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xe8b82a, roughness: 0.55, metalness: 0.2 }),
};
const _m4 = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function addBox(list, sx, sy, sz, x, y, z, rz = 0) {
  const gm = new THREE.BoxGeometry(sx, sy, sz); _e.set(0, 0, rz); _q.setFromEuler(_e); _p.set(x, y, z); _m4.compose(_p, _q, _s); gm.applyMatrix4(_m4); list.push(gm);
}

// local frame: the opening is across x, you walk along z, y is up; the group origin is the bottom centre of the opening
export function buildArchMesh(size, opts = {}) {
  const S = SIZES[size], W = S.w * C - 0.04, H = S.h * C - 0.02, pw = S.pylon, bh = S.beam, D = S.depth, big = size === 2;
  const group = new THREE.Group(), steel = [], dark = [], yellow = [], t = big ? 0.07 : 0.05;
  for (const sx of [-1, 1]) {
    const px = sx * (W / 2 - pw / 2);
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) addBox(steel, t, H, t, px + cx * (pw / 2 - t / 2), H / 2, cz * (D / 2 - t / 2));
    const n = Math.max(2, Math.round(H / 0.6)), seg = (H - bh) / n;
    for (let q = 0; q <= n; q++) for (const cz of [-1, 1]) addBox(steel, pw, t * 0.8, t * 0.8, px, q * seg, cz * (D / 2 - t / 2));
    for (let q = 0; q < n; q++) for (const cz of [-1, 1]) { const L = Math.hypot(pw, seg), a = Math.atan2(seg, pw) * (q % 2 ? -1 : 1); addBox(steel, L, t * 0.7, t * 0.7, px, q * seg + seg / 2, cz * (D / 2 - t / 2), a); }
    addBox(dark, pw + 0.2, 0.06, D + 0.2, px, 0.03, 0);
  }
  addBox(steel, W, bh, D, 0, H - bh / 2, 0);
  const sn = Math.floor(W / 0.42);
  for (let q = 0; q < sn; q++) { const x = (q - (sn - 1) / 2) * 0.42; if (Math.abs(x) > W / 2 - pw - 0.15) continue; for (const cz of [-1, 1]) addBox(yellow, 0.16, bh * 0.55, 0.02, x, H - bh * 0.5, cz * (D / 2 + 0.011), 0.6); }
  // sign carrier on top of the beam
  const pwid = big ? W * 0.62 : W * 0.78, ph = big ? 1.0 : 0.42, py = H + 0.1 + ph / 2;
  addBox(dark, pwid + 0.12, ph + 0.1, 0.1, 0, py, 0);
  for (const sx of [-1, 1]) addBox(dark, 0.07, 0.12, 0.07, sx * pwid * 0.4, H + 0.05, 0);
  if (big) {   // crowd plaza: a dark apron 6 m deep with yellow edge lines and rail posts
    addBox(dark, W + 1.6, 0.04, 6.0, 0, 0.02, 0);
    for (const sx of [-1, 1]) { addBox(yellow, 0.08, 0.045, 6.0, sx * (W / 2 + 0.7), 0.025, 0); for (const z of [-2.8, -1.4, 0, 1.4, 2.8]) addBox(dark, 0.07, 0.9, 0.07, sx * (W / 2 + 0.78), 0.45, z); addBox(yellow, 0.05, 0.05, 5.6, sx * (W / 2 + 0.78), 0.86, 0); }
  }
  const lamps = [], ghost = opts.ghost !== undefined;
  if (ghost) {
    const gm = mergeGeometries([...steel, ...dark, ...yellow]), mat = new THREE.MeshBasicMaterial({ color: opts.ghost, transparent: true, opacity: 0.42, depthWrite: false });
    group.add(new THREE.Mesh(gm, mat)); return { group, lamps };
  }
  for (const [list, mat] of [[steel, MAT.steel], [dark, MAT.dark], [yellow, MAT.yellow]]) if (list.length) group.add(new THREE.Mesh(mergeGeometries(list), mat));
  // three lamps on each face of the beam, one material per lamp so the flash can chase
  const lampMats = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: 0x222222 }));
  const lg = new THREE.SphereGeometry(big ? 0.11 : 0.075, 10, 8);
  for (let q = 0; q < 3; q++) for (const cz of [-1, 1]) { const l = new THREE.Mesh(lg, lampMats[q]); l.position.set((q - 1) * W * 0.22, H - bh * 0.5, cz * (D / 2 + 0.05)); group.add(l); }
  // the target panel: a canvas texture on both faces
  const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = Math.round(384 * (ph / pwid));
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  for (const cz of [1, -1]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(pwid, ph), pm); pl.position.set(0, py, cz * 0.056); if (cz < 0) pl.rotation.y = Math.PI; group.add(pl); }
  return { group, lamps: lampMats, canvas, tex, panelMat: pm, key: '' };
}

function drawLabel(rig, ent, img) {
  const cv = rig.canvas, c = cv.getContext('2d'), W = cv.width, H = cv.height;
  const col = ent.mode === 'rarity' ? (RARITY[ent.rarity ?? 2] || RARITY[2]).color : '#ffd24a';
  c.fillStyle = '#0d1114'; c.fillRect(0, 0, W, H); c.strokeStyle = col; c.lineWidth = 6; c.strokeRect(4, 4, W - 8, H - 8);
  let x = 18; const sp = ent.mode === 'one' ? NEEDLE : ent.mode === 'species' ? ent.target : 0;
  if (img) { const s = H - 24; c.drawImage(img, 12, 12, s, s); x = s + 26; }
  else if (sp) x = 18;
  const head = ent.mode === 'one' ? 'THE ONE' : ent.mode === 'species' ? (species[ent.target] ? species[ent.target].name : 'PICK A SPECIES') : ent.mode === 'rarity' ? (RARITY[ent.rarity ?? 2] || RARITY[2]).name.toUpperCase() + (ent.exact ? ' ONLY' : ent.rarity >= 5 ? '' : ' +') : ent.mode === 'fresh' ? 'NEW TO DEX' : 'SHINY';
  c.fillStyle = col; c.textBaseline = 'middle'; c.textAlign = 'left';
  let fs = Math.round(H * 0.34); c.font = `800 ${fs}px Helvetica, Arial, sans-serif`;
  while (c.measureText(head).width > W - x - 14 && fs > 12) { fs -= 2; c.font = `800 ${fs}px Helvetica, Arial, sans-serif`; }
  c.fillText(head, x, H * 0.42);
  c.fillStyle = '#9fb0a0'; c.font = `700 ${Math.round(H * 0.17)}px Helvetica, Arial, sans-serif`; c.fillText((MODE_NAMES[ent.mode] || '').toUpperCase() + '  DETECTOR', x, H * 0.76);
  rig.tex.needsUpdate = true;
}
function refreshLabel(ent, rig) {
  const key = `${ent.mode}|${ent.target}|${ent.rarity}|${ent.exact}`; if (rig.key === key) return; rig.key = key;
  drawLabel(rig, ent, null);
  const sp = ent.mode === 'one' ? NEEDLE : ent.mode === 'species' ? ent.target : 0;
  if (sp && species[sp]) { const url = safeIcon(sp); if (url) { const im = new Image(); im.onload = () => { if (rig.key === key) drawLabel(rig, ent, im); }; im.src = url; } }
}

// machines.js add() hook: the mesh of an arch ent (also what a guest, a loaded save and a late joiner build)
export function add(machines, ent) {
  ent.size = archSize(ent); ent.axis = ent.axis === 'x' ? 'x' : 'z';
  if (!MODES.includes(ent.mode)) ent.mode = 'one';
  if (!Number.isFinite(ent.rarity)) ent.rarity = 2; if (!Number.isFinite(ent.target)) ent.target = 0; if (!Number.isFinite(ent.volume)) ent.volume = 0.7; ent.exact = !!ent.exact; ent.quiet = !!ent.quiet;
  const S = SIZES[ent.size];
  if (!Number.isFinite(ent.cx) || !Number.isFinite(ent.cz) || !Number.isFinite(ent.y0)) return { obj: new THREE.Group() };
  if (!Number.isFinite(ent.w)) ent.w = S.w * C - 0.04; if (!Number.isFinite(ent.h)) ent.h = S.h * C - 0.02; if (!Number.isFinite(ent.yaw)) ent.yaw = ent.axis === 'x' ? Math.PI / 2 : 0; ent.hr = S.hr; ent.clear = archClear(ent);
  const rig = buildArchMesh(ent.size);
  rig.group.position.set(ent.cx, ent.y0, ent.cz); rig.group.rotation.y = ent.yaw;
  refreshLabel(ent, rig); st(ent).rig = rig;
  return { obj: rig.group, arch: rig };
}

// per frame (host and guest): power on the host, lamp colors and the panel text on both
const LAMP_OFF = 0x222222, LAMP_IDLE = 0x2e8c4a;
function visuals(g, dt, host) {
  for (const it of g.machines.items.values()) {
    const e = it.ent; if (!isArch(e)) continue;
    const s = st(e), rig = s.rig; if (!rig || !rig.lamps.length) continue;
    if (host) { s.pt -= dt; if (s.pt <= 0) { s.pt = 0.5; s.powered = powerOf(g, e); } }
    if (s.flash > 0) s.flash -= dt;
    refreshLabel(e, rig);
    const L = rig.lamps;
    if (!s.powered) { for (const l of L) l.color.setHex(LAMP_OFF); rig.panelMat.color.setHex(0x555555); continue; }
    rig.panelMat.color.setHex(0xffffff);
    if (s.flash > 0) {
      const el = (s.kind === 'ok' ? 1.5 : s.kind === 'bad' ? 0.95 : 0.3) - s.flash;
      if (s.kind === 'bad') { const on = (el < 0.2) || (el > 0.4 && el < 0.6); for (const l of L) l.color.setHex(on ? 0xff3322 : 0x3a0f0c); }
      else if (s.kind === 'ok') { const ph = Math.floor(el * 8); L.forEach((l, q) => l.color.setHex((ph + q) % 2 ? 0x45ff7a : 0xffd24a)); }
      else for (const l of L) l.color.setHex(0xffffff);
    } else for (const l of L) l.color.setHex(LAMP_IDLE);
  }
}
export function tick(g, dt) { visuals(g, dt, true); }
export function guestTick(g, dt) { visuals(g, dt, false); }

// ======================================================================================================
// the target panel (E on an arch): mode buttons, a species list, a rarity picker, volume and quiet
// ======================================================================================================
let PANEL = null;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function speciesChoices(g, filter = '') {
  const S = g.S, ids = new Set(), out = [], f = filter.trim().toLowerCase();
  for (const c of S.contracts || []) if (c && c.kind === 'species' && species[c.sp]) { ids.add(c.sp); out.push({ id: c.sp, contract: true }); }
  const dex = Object.keys(S.dex || {}).map(Number).filter((id) => species[id] && id !== NEEDLE && !ids.has(id));
  dex.sort((a, b) => species[b].rarity - species[a].rarity || species[a].name.localeCompare(species[b].name));
  for (const id of dex) out.push({ id, contract: false });
  return out.filter((o) => !f || species[o.id].name.toLowerCase().includes(f) || RARITY[species[o.id].rarity].name.toLowerCase().includes(f));
}

function ensurePanel(g) {
  if (PANEL && PANEL.el.isConnected) return PANEL;
  const el = document.createElement('div'); el.id = 'archPanel'; el.className = 'modal hidden';
  el.innerHTML = '<div class="panel narrow" style="width:min(560px,94vw)"><header><h2 id="archTitle">DETECTOR ARCH</h2><button class="x" id="archX">&#10005;</button></header><div class="menu" id="archBody"></div></div>';
  document.body.appendChild(el);
  PANEL = { el, id: null, pending: null, filter: '', sig: '', timer: 0 };
  el.querySelector('#archX').addEventListener('click', () => g.ui.closeModals());
  el.addEventListener('mousedown', (e) => { if (e.target === el) g.ui.closeModals(); });
  document.addEventListener('keydown', (e) => { if (e.code === 'Escape' && g.ui.openModal === 'archPanel') g.ui.closeModals(); });
  return PANEL;
}
const curEnt = (g) => { const it = PANEL && g.machines.items.get(PANEL.id); return it && isArch(it.ent) ? it.ent : null; };
const sigOf = (e) => [e.mode, e.target, e.rarity, e.exact, e.volume, e.quiet].join('|');

function drawPanel(g, full) {
  const e = curEnt(g); if (!e) { g.ui.closeModals(); return; }
  const P = PANEL, body = P.el.querySelector('#archBody'), mode = P.pending || e.mode;
  P.el.querySelector('#archTitle').textContent = SIZES[archSize(e)].name.toUpperCase();
  if (full || !body.firstChild) {
    body.innerHTML = `<div id="archNow" style="font-weight:800;color:var(--accent)"></div>
      <div class="menu-row" id="archModes">${MODES.map((m) => `<button data-mode="${m}">${esc(MODE_NAMES[m])}</button>`).join('')}</div>
      <div id="archHelp" style="font-size:12px;color:var(--dim)"></div>
      <div id="archOpts"></div>
      <label>Volume <input type="range" id="archVol" min="0" max="100"></label>
      <label>Quiet (no buzz, keeps the da-ding) <input type="checkbox" id="archQuiet"></label>
      <div style="font-size:12px;color:var(--dim)"><kbd>Esc</kbd> closes. <kbd>Shift</kbd>+<kbd>E</kbd> on an arch copies these settings, <kbd>E</kbd> on another pastes them.</div>`;
    for (const b of body.querySelectorAll('#archModes button')) b.addEventListener('click', () => chooseMode(g, b.dataset.mode));
    const vol = body.querySelector('#archVol'); vol.addEventListener('change', () => { const x = curEnt(g); if (x) g.setCfg(x, { volume: +vol.value / 100 }); });
    const q = body.querySelector('#archQuiet'); q.addEventListener('change', () => { const x = curEnt(g); if (x) g.setCfg(x, { quiet: q.checked }); });
    P.optsKey = '';
  }
  body.querySelector('#archNow').textContent = `Looking for: ${targetLabel(e)}`;
  for (const b of body.querySelectorAll('#archModes button')) { const on = b.dataset.mode === mode; b.style.borderColor = on ? 'var(--accent)' : ''; b.style.background = on ? 'rgba(215,242,106,0.16)' : ''; b.style.color = on ? 'var(--accent)' : ''; }
  body.querySelector('#archHelp').textContent = MODE_HELP[mode] || '';
  const vol = body.querySelector('#archVol'); if (document.activeElement !== vol) vol.value = Math.round((e.volume ?? 0.7) * 100);
  body.querySelector('#archQuiet').checked = !!e.quiet;
  const key = mode + '|' + (mode === 'rarity' ? `${e.rarity}|${e.exact}` : mode === 'species' ? e.target : '');
  if (P.optsKey !== key || full) { P.optsKey = key; drawOpts(g, e, mode); }
  P.sig = sigOf(e);
}

function drawOpts(g, e, mode) {
  const box = PANEL.el.querySelector('#archOpts');
  if (mode === 'rarity') {
    box.innerHTML = `<label>Rarity <select id="archRar">${RARITY.slice(0, 6).map((r) => `<option value="${r.id}"${r.id === e.rarity ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <label>That rarity only <input type="checkbox" id="archExact"${e.exact ? ' checked' : ''}></label>`;
    const sel = box.querySelector('#archRar'), ex = box.querySelector('#archExact');
    const send = () => { const x = curEnt(g); if (x) { PANEL.pending = null; g.setCfg(x, { mode: 'rarity', rarity: +sel.value, exact: ex.checked }); } };
    sel.addEventListener('change', send); ex.addEventListener('change', send);
  } else if (mode === 'species') {
    box.innerHTML = '<input id="archFilter" placeholder="Filter your Plushdex by name or rarity" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:rgba(255,255,255,0.08);color:var(--ink);font:inherit"><div id="archList" style="max-height:230px;overflow:auto;margin-top:8px;display:grid;gap:4px"></div>';
    const f = box.querySelector('#archFilter'); f.value = PANEL.filter;
    for (const ev of ['keydown', 'keyup', 'keypress']) f.addEventListener(ev, (x) => x.stopPropagation());
    f.addEventListener('input', () => { PANEL.filter = f.value; drawList(g); });
    drawList(g);
  } else box.innerHTML = '';
}

function drawList(g) {
  const e = curEnt(g), list = PANEL.el.querySelector('#archList'); if (!list || !e) return;
  const rows = speciesChoices(g, PANEL.filter), shown = rows.slice(0, 60);
  list.innerHTML = shown.length ? shown.map((o) => { const s = species[o.id], on = e.mode === 'species' && e.target === o.id; return `<button data-sp="${o.id}" style="text-align:left;padding:6px 10px;border-radius:8px;border:1px solid ${on ? 'var(--accent)' : 'var(--line)'};background:${on ? 'rgba(215,242,106,0.16)' : 'rgba(255,255,255,0.05)'};color:${RARITY[s.rarity].color};font:inherit;font-weight:700">${esc(s.name)} <span style="color:var(--dim);font-weight:500">${esc(RARITY[s.rarity].name)}${o.contract ? ' · contract' : ''}</span></button>`; }).join('') + (rows.length > shown.length ? `<div style="color:var(--dim);font-size:12px">${rows.length - shown.length} more: type to narrow the list</div>` : '') : '<div style="color:var(--dim);font-size:13px">Nothing in your Plushdex matches. Only species you have handled (and your contract species) can be picked.</div>';
  for (const b of list.querySelectorAll('button[data-sp]')) b.addEventListener('click', () => { const x = curEnt(g); if (x) { PANEL.pending = null; g.setCfg(x, { mode: 'species', target: +b.dataset.sp }); setTimeout(() => { if (curEnt(g)) drawPanel(g, false); }, 60); } });
}

function chooseMode(g, mode) {
  const e = curEnt(g); if (!e) return;
  if (mode === 'species' && !(e.target > 0)) { PANEL.pending = 'species'; drawPanel(g, false); return; }
  PANEL.pending = null; g.setCfg(e, { mode }); drawPanel(g, false);
}

export function use(g, ent) {
  const P = ensurePanel(g); P.id = ent.id; P.pending = null; P.filter = '';
  g.openModal('archPanel'); drawPanel(g, true);
  clearInterval(P.timer); P.timer = setInterval(() => {
    if (g.ui.openModal !== 'archPanel') { clearInterval(P.timer); return; }
    const e = curEnt(g); if (!e) { g.ui.closeModals(); return; }
    if (sigOf(e) !== P.sig) { P.pending = null; drawPanel(g, false); } else { const n = P.el.querySelector('#archNow'); if (n) n.textContent = `Looking for: ${targetLabel(e)}`; }
  }, 400);
  return true;
}
