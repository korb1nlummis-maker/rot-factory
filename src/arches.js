// Giant arches: truck-width tunnel supports (Satisfactory spec 4.8, lead notes section 9).
// A normal tunnel is a run of 4x4x4 frame cubes (3 x 3 cells clear): minecarts, belts, lifts, fans and walkers. A giant tunnel is a run of arches 6, 8 or 12 cells
// wide (clear 5 x 4, 7 x 5 and 11 x 7 cells): Haul Trucks and the big diggers. An arch is a 4 cell deep module on the same 4 cell grid as a frame cube, made of any
// frame material you own, and it is a real support: it registers in world.supports with kind 'arch8:steel' and the load model in loadtrace.js rates it
// (a wide span is rated shallower than the same material as a frame: depth x 0.85, 0.7, 0.55).
// An arch set at the mouth of the pile (open on one side, the pile wall on the other) is a PORTAL: portal.js runs its auto-driver.
//
// The ent (type 'garch', in game.machines.items) is saved as: axis 'x'|'z' (the way the tunnel runs), gm (first cell along it), glo (first cell across), gj (floor row),
// span, mat, and for portals pd (+1 or -1: toward the pile), adv (slabs bored), off, lined, spent. Everything else (centre, size, yaw, clear) is derived in add().
// A guest never sends numbers it is believed on: the host rebuilds the whole ent from axis, gm, glo, gj and the item id.
//
// Import rule: this file is read through catalog_haul.js, which upgrades.js reaches, so nothing imported here may be used at the top level of this module.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C, cellX, cellZ, toI, toK } from './config.js';
import { FRAME_TYPES } from './upgrades.js';
import { ARCH_DEPTH, ARCH_SPANS, archKind, archReach, archRated, capacityOf, loadOn, parseArch, WARN_AT } from './loadtrace.js';

const K_BENCH = 3;
export const isArch = (e) => !!e && e.type === 'garch';
export const arches = (g) => { const out = []; for (const it of g.machines.items.values()) if (isArch(it.ent)) out.push(it.ent); return out; };
export const byId = (g, id) => { const it = g.machines.items.get(id); return it && isArch(it.ent) ? it.ent : null; };
export const MAT_NOUN = { timber: 'Timber', steel: 'Steel', concrete: 'Concrete', rebar: 'Rebar', titan: 'Titanium', carbon: 'Carbon', plasma: 'Plasma', voidl: 'Void', neutron: 'Neutron', horizon: 'Horizon' };
export const itemId = (span, mat) => `garch:${span}:${mat}`;
// 'garch:8:steel' -> { span, mat } or null (the host reads what an arch is made of from the item id, never from a guest's ent)
export function parseItem(id) {
  if (typeof id !== 'string') return null;
  const m = /^garch:(6|8|12):([a-z]+)$/.exec(id); if (!m || !FRAME_TYPES[m[2]]) return null;
  return { span: +m[1], mat: m[2] };
}
export const nameOf = (span, mat) => `${MAT_NOUN[mat] || mat || 'Giant'} ${(ARCH_SPANS[span] || { name: 'Arch' }).name}`;   // (a garbage ent never throws in a readout)
// before the bench multiplier: the frame's price times the span multiplier (arch6 4x, arch8 9x, arch12 22x: concrete arch8 is about 7,000)
export const priceOf = (span, mat) => Math.round(FRAME_TYPES[mat].cost * ARCH_SPANS[span].mul);
export const benchPrice = (span, mat) => priceOf(span, mat) * K_BENCH;
// units of the material it uses up when you hold stock (a frame uses 4 units for its whole price; the bench multiplier keeps the same 30% discount for stock)
export const matUnits = (span) => 4 * K_BENCH * ARCH_SPANS[span].mul;
export const spansOf = (T) => (T && T.archSpans) || [];
export const unlockedSpan = (T, span) => spansOf(T).includes(span);
export const rated = (span, mat) => archRated(span, mat);

// ---------------------------------------------------------------- geometry of a placed arch
export function derive(axis, m, lo, j0, span, mat) {
  const s = ARCH_SPANS[span];
  const cx = axis === 'x' ? cellX(m) + 1.5 * C : cellX(lo) + ((span - 1) / 2) * C;
  const cz = axis === 'x' ? cellZ(lo) + ((span - 1) / 2) * C : cellZ(m) + 1.5 * C;
  return {
    axis, gm: m, glo: lo, gj: j0, span, mat, kind: archKind(span, mat),
    cx, cz, y0: j0 * C, x: cx, y: j0 * C, z: cz, w: span * C - 0.04, h: s.h * C - 0.02, d: ARCH_DEPTH * C - 0.04,
    yaw: axis === 'x' ? Math.PI / 2 : 0, hr: span * C * 0.6 + 1.6, clear: { w: s.cw, h: s.ch },
  };
}
// the cells an arch fills, as index ranges (the section that must be dug out)
export function boxOf(e) {
  const s = ARCH_SPANS[e.span], n = ARCH_DEPTH;
  return e.axis === 'x' ? { i0: e.gm, i1: e.gm + n - 1, k0: e.glo, k1: e.glo + e.span - 1, j0: e.gj, j1: e.gj + s.h - 1 }
    : { i0: e.glo, i1: e.glo + e.span - 1, k0: e.gm, k1: e.gm + n - 1, j0: e.gj, j1: e.gj + s.h - 1 };
}
export const cellOf = (e, a, l, b) => (e.axis === 'x' ? [e.gm + a, e.gj + b, e.glo + l] : [e.glo + l, e.gj + b, e.gm + a]);
export const sectionCells = (e) => { const out = [], s = ARCH_SPANS[e.span]; for (let a = 0; a < ARCH_DEPTH; a++) for (let l = 0; l < e.span; l++) for (let b = 0; b < s.h; b++) out.push(cellOf(e, a, l, b)); return out; };
const overlap3 = (a, b) => a.i0 <= b.i1 && b.i0 <= a.i1 && a.k0 <= b.k1 && b.k0 <= a.k1 && a.j0 <= b.j1 && b.j0 <= a.j1;

// is this box taken by another arch or by a grid frame (machines.blockTaken asks this for frames)? Returns the ent or null.
export function archTaken(g, box, skipId) {
  for (const it of g.machines.items.values()) { const o = it.ent; if (!isArch(o) || o.id === skipId || o.gm === undefined) continue; if (overlap3(box, boxOf(o))) return o; }
  return null;
}
function frameTaken(g, e) {
  const M = g.machines, box = boxOf(e);
  for (const it of M.items.values()) {
    const f = it.ent; if (f.type !== 'frame') continue;
    if (f.turned) {   // a free frame: its centre and size on the floor plan
      if (Math.abs(f.y0 - e.y0) > Math.min(e.h, f.h || e.h) - 0.15) continue;
      const dx = Math.abs(f.cx - e.cx), dz = Math.abs(f.cz - e.cz), hx = (e.axis === 'x' ? e.d : e.w) / 2 + (f.w || 2.36) / 2, hz = (e.axis === 'x' ? e.w : e.d) / 2 + (f.w || 2.36) / 2;
      if (dx < hx - 0.05 && dz < hz - 0.05) return f;
      continue;
    }
    if (overlap3(box, M.blockBox(M.frameBlock(f)))) return f;
  }
  return null;
}

// ---------------------------------------------------------------- the load an arch would carry here
export function predict(g, e) {
  const cap = capacityOf(e.kind), r = archReach(e.span, e.mat);
  if (!isFinite(cap)) return { ratio: 0, cap, r };
  const hyp = { x: e.cx, y: e.y0 + e.h / 2, z: e.cz, r, kind: e.kind, cap, id: 'hyp' };
  return { ratio: loadOn(g.world, hyp) / cap, cap, r };
}

// ---------------------------------------------------------------- layout: the one rule for placing (aim, host re-check, portal lining)
// opts.free: skip the load check (a portal that weighs the section itself), opts.skip: an ent id the section may overlap (itself)
export function layout(g, axis, m, lo, j0, span, mat, opts = {}) {
  const bad = (why) => ({ ok: false, why });
  if (axis !== 'x' && axis !== 'z') return bad('Bad arch');
  for (const v of [m, lo, j0]) if (!Number.isInteger(v)) return bad('Bad arch');
  if (!ARCH_SPANS[span] || !FRAME_TYPES[mat]) return bad('Bad arch');
  const w = g.world, s = ARCH_SPANS[span], e = derive(axis, m, lo, j0, span, mat);
  let n = 0, blocked = 0;
  for (const [i, j, k] of sectionCells(e)) {
    if (j < 0 || !w.inside(i, j, k)) return { ok: false, why: 'Outside the hall', ent: e };
    if (w.solid(i, j, k)) n++; else if (g.logi.cellTaken(i, j, k)) blocked++;
  }
  if (n) return { ok: false, why: `Dig this section out first: ${n} plush in the way (a ${span} wide, ${s.h} high, ${ARCH_DEPTH} long cube of cells)`, ent: e, dig: n };
  if (blocked) return { ok: false, why: 'Something is in the way: a belt, a machine or a shaft stands in the section', ent: e };
  if (j0 > 0) for (const [a, l] of [[0, 0], [0, span - 1], [ARCH_DEPTH - 1, 0], [ARCH_DEPTH - 1, span - 1]]) { const [i, , k] = cellOf(e, a, l, 0); if (!w.solid(i, j0 - 1, k)) return { ok: false, why: 'All four feet need solid floor under them', ent: e }; }
  const box = boxOf(e), other = archTaken(g, box, opts.skip);
  if (other) return { ok: false, why: other.gm === m && other.glo === lo && other.gj === j0 ? 'An arch is already here' : 'This arch would overlap another one', ent: e };
  const fr = frameTaken(g, e); if (fr) return { ok: false, why: 'A frame is in the way: this arch would cut through it', ent: e };
  if (!opts.free) {
    const pr = predict(g, e); e.ratio = pr.ratio;
    const d = Math.hypot(e.cx, e.cz), rt = rated(span, mat);
    if (pr.ratio > 1) return { ok: false, why: `The ${nameOf(span, mat)} would buckle here: ${Math.round(pr.ratio * 100)}% load at ${Math.round(d)} m deep (rated to ${isFinite(rt) ? Math.round(rt) + ' m' : 'any depth'}). A stronger tier, or more supports to share the roof.`, ent: e };
  }
  return { ok: true, ent: e };
}

// which end of the section is the pile wall? +1 or -1 along the axis, 0 when it is not a mouth (open on both sides, or buried on both)
export function portalDir(g, e) {
  const w = g.world, s = ARCH_SPANS[e.span]; let n = [0, 0], t = 0;
  for (let l = 0; l < e.span; l++) for (let b = 0; b < s.h; b++) {
    t++;
    const [i1, j1, k1] = cellOf(e, ARCH_DEPTH, l, b), [i0, j0, k0] = cellOf(e, -1, l, b);
    if (w.solid(i1, j1, k1)) n[0]++;
    if (w.solid(i0, j0, k0)) n[1]++;
  }
  const f = n[0] / t, b = n[1] / t;
  if (f >= 0.6 && b <= 0.3) return 1;
  if (b >= 0.6 && f <= 0.3) return -1;
  return 0;
}

// ---------------------------------------------------------------- aiming
export function planOf(g, tool, eye, dir, yaw) {
  const w = g.world, M = g.machines, no = (why, ent) => ({ plan: { ok: false, why, ent }, cost: 0 });
  const a = parseItem(tool && tool.id); if (!a) return no('That is not an arch');
  const T = g.T || {};
  if (!unlockedSpan(T, a.span)) return no('Not unlocked yet');
  if (!(T.frames || []).includes(a.mat)) return no('You do not own that material yet');
  const r = M.rayEmpty(eye, dir, 7);
  if (!r) return no('Aim at the tunnel floor where the arch should stand');
  let { i, j, k } = r.last, guard = 0;
  while (j > 0 && !w.solid(i, j - 1, k) && guard++ < 8) j--;
  if (j > 0 && !w.solid(i, j - 1, k)) return no('No floor here');
  const fx = Math.sin(yaw), fz = Math.cos(yaw), axis = Math.abs(fx) > Math.abs(fz) ? 'x' : 'z', sgn = (axis === 'x' ? fx : fz) >= 0 ? 1 : -1;
  const al = axis === 'x' ? i : k, lat0 = axis === 'x' ? k : i, s = ARCH_SPANS[a.span];
  // next to an arch of the same size and way: snap a whole module along it
  let best = null, bd = 4.5;
  for (const o of arches(g)) {
    if (o.axis !== axis || o.span !== a.span || o.gj < 0 || o.gm === undefined) continue;
    if (Math.abs(o.cx - cellX(i)) > 8 || Math.abs(o.cz - cellZ(k)) > 8) continue;
    for (const dm of [ARCH_DEPTH, -ARCH_DEPTH]) {
      const m = o.gm + dm, c = derive(axis, m, o.glo, o.gj, a.span, a.mat), d = Math.hypot(c.cx - cellX(i), c.cz - cellZ(k));
      if (d < bd && !archTaken(g, boxOf(c))) { bd = d; best = { m, lo: o.glo, j: o.gj, side: dm > 0 ? 'next in line' : 'behind it' }; }
    }
  }
  let m, lo, j0 = j, snap = null;
  if (best) { m = best.m; lo = best.lo; j0 = best.j; snap = best.side; }
  else {
    // the section starts at the aimed cell and runs away from you, centred across the cell you aim at. Fit it to what you dug: take the window with the fewest plush in it.
    const starts = sgn > 0 ? [al, al - 1, al - 2, al - 3] : [al - 3, al - 2, al - 1, al];
    const lats = []; for (let q = 0; q <= s.span; q++) lats.push(lat0 - s.span / 2 + 1 + (q % 2 ? (q + 1) / 2 : -q / 2));
    let bc = 1e9; m = starts[0]; lo = lat0 - s.span / 2 + 1;
    search: for (const jj of [j, j - 1, j + 1]) {
      if (jj < 0 || (jj !== j && jj > 0 && !w.solid(i, jj - 1, k))) continue;
      for (const ms of starts) for (const ll of lats) {
        const c = derive(axis, ms, ll, jj, a.span, a.mat); let cnt = 0;
        for (const [ci, cj, ck] of sectionCells(c)) { if (w.solid(ci, cj, ck)) { cnt++; if (cnt >= bc) break; } }
        if (cnt < bc) { bc = cnt; m = ms; lo = ll; j0 = jj; if (bc === 0) break search; }
      }
    }
  }
  const L = layout(g, axis, m, lo, j0, a.span, a.mat);
  if (!L.ok) return no(L.why, L.ent);
  const ent = L.ent; if (snap) ent.snap = snap;
  const pd = g.T && g.T.portal ? portalDir(g, ent) : 0;
  const rt = rated(a.span, a.mat), d = Math.hypot(ent.cx, ent.cz), pct = Math.round((ent.ratio || 0) * 100);
  let hint = `<kbd>B</kbd> set down ${nameOf(a.span, a.mat)} (${(a.span * C).toFixed(1)} m wide, clear ${s.cw} x ${s.ch} cells) · ${pct}% of its limit here (${Math.round(d)} m deep, rated ${isFinite(rt) ? Math.round(rt) + ' m' : 'any depth'})${snap ? ' · snaps ' + snap : ''}`;
  if ((ent.ratio || 0) > WARN_AT) hint += ' · it will creak: more supports nearby share the weight';
  if (pd) hint += ' · <b>PORTAL</b>: a powered driver will bore the tunnel into the pile and set arches behind it';
  ent.pd = pd; return { plan: { ok: true, ent, hintText: hint }, cost: 0 };
}
export const plan = planOf;

// the host's re-check of a guest's plan: everything comes from a few integers and the item id
export function conflict(g, e, tool) {
  const a = parseItem(tool && tool.id); if (!a) return 'That is not an arch';
  if (!e || typeof e !== 'object') return 'Nothing to place';
  const T = g.T || {};
  if (!unlockedSpan(T, a.span)) return 'That arch is not unlocked';
  if (!(T.frames || []).includes(a.mat)) return 'You do not own that material';
  const L = layout(g, e.axis, e.gm, e.glo, e.gj, a.span, a.mat);
  return L.ok ? null : L.why;
}
export function build(g, tool, e) {
  const a = parseItem(tool && tool.id); if (!a || !e) return null;
  const L = layout(g, e.axis, e.gm, e.glo, e.gj, a.span, a.mat); if (!L.ok) return null;
  const f = L.ent; const pd = g.T && g.T.portal ? portalDir(g, f) : 0;
  const out = { type: 'garch', axis: f.axis, gm: f.gm, glo: f.glo, gj: f.gj, span: a.span, mat: a.mat };
  if (pd) { out.pd = pd; out.adv = 0; out.lined = 0; out.spent = 0; out.off = false; }
  return out;
}
export const itemOfEnt = (e) => itemId(e.span, e.mat);
export function preview(g, tool, pl) {
  const M = g.machines, e = pl && pl.ent, a = parseItem(tool && tool.id);
  if (!e || !a || !Number.isFinite(e.cx)) { M.showPreview(null, null); return; }
  const key = `garch${e.axis}${a.span}${pl.ok}${e.pd ? 'p' : ''}`;
  if (!M.ghost || M.ghostKey !== key) M.setGhost(buildMesh(a.span, a.mat, { ghost: pl.ok ? (e.pd ? 0xffd24a : 0x9dffc4) : 0xff8a7a }).group, key);
  M.ghost.position.set(e.cx, e.y0, e.cz); M.ghost.rotation.y = e.yaw || 0;
}

// ---------------------------------------------------------------- a ray at an arch (the hammer and the readout): pillars, ribs or the hollow inside it
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
export function pick(g, eye, dir, maxT = 3.6) {
  let best = null, bt = maxT + 2.6;
  for (const it of g.machines.items.values()) {
    const e = it.ent; if (!isArch(e) || e.cx === undefined) continue;
    const ox = eye.x - e.cx, oz = eye.z - e.cz; if (Math.abs(ox) > e.w + e.d + maxT + 3 || Math.abs(oz) > e.w + e.d + maxT + 3) continue;
    const cs = Math.cos(e.yaw), sn = Math.sin(e.yaw);
    _o.set(ox * cs - oz * sn, eye.y - e.y0, ox * sn + oz * cs); _d.set(dir.x * cs - dir.z * sn, dir.y, dir.x * sn + dir.z * cs);
    const lo = [-e.w / 2, 0, -e.d / 2], hi = [e.w / 2, e.h, e.d / 2], o = [_o.x, _o.y, _o.z], v = [_d.x, _d.y, _d.z];
    let t0 = 0, t1 = maxT, hit = true, from = 0;
    for (let a = 0; a < 3 && hit; a++) {
      if (Math.abs(v[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) hit = false; continue; }
      let ta = (lo[a] - o[a]) / v[a], tb = (hi[a] - o[a]) / v[a]; if (ta > tb) { const q = ta; ta = tb; tb = q; }
      if (ta > t0) { t0 = ta; from = 1; } if (tb < t1) t1 = tb; if (t0 > t1) hit = false;
    }
    if (!hit) continue;
    const inside = o[0] > lo[0] && o[0] < hi[0] && o[1] > lo[1] && o[1] < hi[1] && o[2] > lo[2] && o[2] < hi[2];
    const t = inside ? t1 + 2.5 : t0;   // standing inside it: whatever else you look at wins, the wall of the arch is the last resort
    void from;
    if (t < bt) { bt = t; best = it; }
  }
  return best ? { ent: best.ent, t: bt } : null;
}

// is a placed machine (an entry of machines.items) standing inside this arch's box? A ray from outside meets the box of an arch before it meets what stands in it, so the hammer
// and the readout let such a machine win: the hammer never takes the roof down when you aimed at the digger parked under it
export function holds(arch, it) {
  if (!arch || !it || !it.ent || arch.gm === undefined || it.ent === arch) return false;
  const e = it.ent, p = it.obj && it.obj.position, ok = (v) => Number.isFinite(v);
  const x = p && ok(p.x) ? p.x : (e.cx ?? e.px ?? e.x), z = p && ok(p.z) ? p.z : (e.cz ?? e.pz ?? e.z), y = p && ok(p.y) ? p.y : (e.y0 ?? e.y ?? 0);
  if (!ok(x) || !ok(z) || !ok(y)) return false;
  const b = boxOf(arch), i = toI(x), k = toK(z), j = Math.floor((y + 0.05) / C);
  return i >= b.i0 && i <= b.i1 && k >= b.k0 && k <= b.k1 && j >= b.j0 && j <= b.j1;
}

// ---------------------------------------------------------------- bench rows and the price paid by a machine
export function recipes(g) {
  const T = g.T || {}, out = [], frames = T.frames || [];
  for (const span of [6, 8, 12]) {
    if (!unlockedSpan(T, span)) continue;
    if (span === 12 && !(T.machines || []).includes('truck')) continue;   // the Cathedral Arch is for the biggest diggers and the trucks that serve them: it needs the Haul Truck too (spec 4.8)
    const s = ARCH_SPANS[span];
    for (const mat of frames) {
      const ft = FRAME_TYPES[mat], rt = rated(span, mat);
      const count = arches(g).filter((e) => e.span === span && e.mat === mat).length;
      out.push({
        id: itemId(span, mat), kind: 'garch', icon: ft.icon, name: nameOf(span, mat), short: `${MAT_NOUN[mat]} ${s.short}`,
        price: priceOf(span, mat), batch: [1, 2, 5], mat, matN: matUnits(span),
        desc: `A ${span * C} m wide, ${(s.h * C).toFixed(1)} m tall, 2.4 m deep arch (clear ${s.cw} x ${s.ch} cells, ${(s.cw * C).toFixed(1)} x ${(s.ch * C).toFixed(1)} m): ${span === 6 ? 'one truck lane' : span === 8 ? 'two lanes, or a Bucket-Wheel Excavator' : 'a cathedral for trucks and the biggest diggers'}. Rated to ${isFinite(rt) ? Math.round(rt) + ' m' : 'any depth'} (a ${ft.name} is rated to ${isFinite(ft.maxDepth) ? ft.maxDepth + ' m' : 'any depth'}: a wide span carries more roof). Reach ${archReach(span, mat).toFixed(1)} m from its centre.`,
        use: 'Dig a section out first (it never digs): the arch stands in a cube of cells 4 long, across and up as wide and tall as it is. Aim at the tunnel floor, B sets it down; the next one snaps a whole module along it. Set at the mouth of the pile (open on one side, the pile wall on the other) it becomes a Portal.',
        statusFn: () => `${count} placed. Needs ${span} x ${s.h} x 4 cells dug out. Stock: buy ${MAT_NOUN[mat]} at the bench and each arch uses ${matUnits(span)} units at a 30% discount.`,
        p: { span, mat },
      });
    }
  }
  return out;
}
// what a machine pays for the arch it sets: stock first, the shortfall at the unit price (the same rule as the bench), so a machine and a player pay alike
export function charge(g, span, mat, dry = false) {
  const S = g.S, need = matUnits(span), have = (S.mats && S.mats[mat]) || 0, use = Math.min(need, have);
  const cost = Math.round((need - use) * (benchPrice(span, mat) / need));
  if (S.money < cost) return { ok: false, cost, use };
  if (!dry) { S.money -= cost; if (use) { S.mats[mat] -= use; if (S.mats[mat] <= 0) delete S.mats[mat]; } g.ui.setMoney(S.money); }
  return { ok: true, cost, use };
}

// ---------------------------------------------------------------- readout
export function info(g, ent, extra) {
  if (ent.cx === undefined) return null;
  const s = ARCH_SPANS[ent.span], ft = FRAME_TYPES[ent.mat], rt = rated(ent.span, ent.mat), lines = [];
  const sup = g.world.supports.find((q) => q.id === ent.id);
  let ratio = sup && sup.load !== undefined ? sup.load : predict(g, ent).ratio;
  const d = Math.hypot(ent.cx, ent.cz);
  if (extra) for (const l of extra(g, ent)) lines.push(l);
  lines.push(`${(ent.span * C).toFixed(1)} m wide, ${(s.h * C).toFixed(1)} m tall, 2.4 m deep. Clear opening ${s.cw} x ${s.ch} cells (${(s.cw * C).toFixed(1)} x ${(s.ch * C).toFixed(1)} m).`);
  lines.push(`Carries ${Math.round(ratio * 100)}% of what it can bear here (${Math.round(d)} m from the start). Rated to ${isFinite(rt) ? Math.round(rt) + ' m' : 'any depth'}: ${ft.name} is ${isFinite(ft.maxDepth) ? ft.maxDepth + ' m' : 'unlimited'} as a frame, a ${ent.span} wide span gets ${Math.round(s.derate * 100)}% of it.`);
  lines.push(`Holds the roof within ${archReach(ent.span, ent.mat).toFixed(1)} m of its centre. ${ent.span === 6 ? 'Fits a Haul Truck, a Bulldozer or an Excavator.' : ent.span === 8 ? 'Fits trucks in two lanes and a Bucket-Wheel Excavator.' : 'Fits everything, two wheels abreast.'}`);
  if (ratio > WARN_AT) lines.push('It is creaking: put another support beside it to share the weight.');
  return { title: nameOf(ent.span, ent.mat).toUpperCase(), lit: true, lines };
}

// ---------------------------------------------------------------- mesh: parabolic ribs, pillars and purlins, origin at the middle of the floor
const _m4 = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function addBox(list, sx, sy, sz, x, y, z, rz = 0) { const gm = new THREE.BoxGeometry(sx, sy, sz); _e.set(0, 0, rz); _q.setFromEuler(_e); _p.set(x, y, z); _m4.compose(_p, _q, _s); gm.applyMatrix4(_m4); list.push(gm); }
const MATS = new Map();
function matFor(mat) {
  let m = MATS.get(mat);
  if (!m) { const ft = FRAME_TYPES[mat] || FRAME_TYPES.timber; m = new THREE.MeshStandardMaterial({ color: ft.color, roughness: mat === 'timber' || mat === 'concrete' ? 0.85 : 0.45, metalness: mat === 'timber' || mat === 'concrete' ? 0.05 : 0.6 }); MATS.set(mat, m); }
  return m;
}
export const RIB = 0.28;   // m: the rib is this thick, so the inside face sits exactly (span - 1) cells apart
export function ribPoints(span) {
  const s = ARCH_SPANS[span], W = span * C - 0.04, H = s.h * C - 0.02, xc = W / 2 - RIB / 2, Hs = s.ch * C, pts = [];
  for (let q = 0; q <= 7; q++) { const x = -xc + (2 * xc * q) / 7; pts.push([x, Hs + (H - RIB / 2 - Hs) * (1 - (x / xc) * (x / xc))]); }
  return { pts, xc, Hs, W, H };
}
export function buildMesh(span, mat, opts = {}) {
  const { pts, xc, Hs, W } = ribPoints(span), D = ARCH_DEPTH * C - 0.04, rd = 0.18, list = [];
  for (const z of [-D / 2 + rd / 2, 0, D / 2 - rd / 2]) {
    for (const sx of [-1, 1]) addBox(list, RIB, Hs, rd, sx * xc, Hs / 2, z);
    for (let q = 0; q < 7; q++) { const [x0, y0] = pts[q], [x1, y1] = pts[q + 1]; addBox(list, Math.hypot(x1 - x0, y1 - y0) + 0.03, RIB, rd, (x0 + x1) / 2, (y0 + y1) / 2, z, Math.atan2(y1 - y0, x1 - x0)); }
  }
  for (const [x, y] of pts) addBox(list, 0.1, 0.1, D, x, y + RIB / 2 - 0.02, 0);
  for (const sx of [-1, 1]) { addBox(list, 0.12, 0.12, D, sx * xc, 0.9, 0); addBox(list, 0.12, 0.12, D, sx * xc, Hs - 0.1, 0); }
  addBox(list, W, 0.04, D, 0, 0.02, 0);
  const geo = mergeGeometries(list); for (const q of list) q.dispose();
  const group = new THREE.Group();
  if (opts.ghost !== undefined) { group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: opts.ghost, transparent: true, opacity: 0.42, depthWrite: false }))); return { group }; }
  group.add(new THREE.Mesh(geo, matFor(mat)));
  return { group };
}

// ---------------------------------------------------------------- add (machines.js hook: a fresh arch, a loaded save, a guest and a late joiner all build here)
export function add(machines, ent) {
  const g = machines.game, w = g.world;
  ent.axis = ent.axis === 'x' ? 'x' : 'z';
  const span = ARCH_SPANS[ent.span] ? ent.span : 8, mat = FRAME_TYPES[ent.mat] ? ent.mat : 'timber';
  if (![ent.gm, ent.glo, ent.gj].every(Number.isInteger)) { ent.span = span; ent.mat = mat; delete ent.gm; return { obj: new THREE.Group() }; }   // a damaged entity is inert: no section, so no placement, router or hammer ever measures it (they skip an arch with no gm)
  Object.assign(ent, derive(ent.axis, ent.gm, ent.glo, ent.gj, span, mat));
  if (ent.pd !== 1 && ent.pd !== -1) ent.pd = 0;
  if (!Number.isFinite(ent.adv) || ent.adv < 0) ent.adv = 0;
  if (!Number.isFinite(ent.lined) || ent.lined < 0) ent.lined = 0;
  if (!Number.isFinite(ent.spent) || ent.spent < 0) ent.spent = 0;
  ent.off = !!ent.off;
  const rig = buildMesh(span, mat);
  rig.group.position.set(ent.cx, ent.y0, ent.cz); rig.group.rotation.y = ent.yaw;
  const ft = FRAME_TYPES[mat], cap = capacityOf(ent.kind);
  ent.supportId = ent.id;
  w.supports = w.supports.filter((q) => q.id !== ent.id);
  w.supports.push({ x: ent.cx, y: ent.y0 + ent.h / 2, z: ent.cz, r: archReach(span, mat), b: ft.bonus, id: ent.id, kind: ent.kind, cap, born: g.time });
  g.queueLoad && g.queueLoad(ent.cx, ent.y0 + ent.h / 2, ent.cz);
  return { obj: rig.group, garch: rig };
}

// taking one down (the hammer): the roof it held goes back under the tunnel rule and the supports that shared its load are weighed again
export function onRemove(g, ent) {
  if (g.dropMountedFans) g.dropMountedFans(ent.id, true);
  if (ent.gm === undefined || !ARCH_SPANS[ent.span]) return;
  const w = g.world, bx = boxOf(ent), ci = (bx.i0 + bx.i1) >> 1, ck = (bx.k0 + bx.k1) >> 1;
  const R = Math.ceil(archReach(ent.span, ent.mat) / C) + 2;
  for (let a = -R; a <= R; a += 4) for (let b = -R; b <= R; b += 4) for (const dj of [2, 5, 8]) w.stabQueue.push({ i: ci + a, j: ent.gj + dj, k: ck + b });
  if (!(g.isGuest && g.isGuest())) w.isl.sphere(ci, ent.gj + 3, ck, Math.min(18, R));   // (and every plush with air against it in its reach: a narrow slab can lie between the grid points above)
  if (g.queueLoad) g.queueLoad(ent.cx, ent.y0 + 1, ent.cz);
}
