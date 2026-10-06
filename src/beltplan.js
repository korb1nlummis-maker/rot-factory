// The line planner (Satisfactory spec 4.1, wave 1A): with a belt in hand press . to switch the planner on. Click the start, aim the end, click again and
// the whole line is laid. Four route shapes (R, , or the wheel cycle them): horizontal first, vertical first, around and over (follows the floor, ramps
// a step up or down), under (underground pairs through whatever is in the way). It also upgrades a belt in place when you set a higher mark over it.
// Pure routing sits at the top (it only asks `probe.free(i,j,k)`), the game side below. game.js calls in with one line per hook.
// No imports of game.js, upgrades.js, crafting.js, power.js or machines.js (import cycle through the catalog).
import * as THREE from 'three';
import { C, NY, cellX, cellZ, idx } from './config.js';
import { TIER_NAMES, PLAN_MAX, markOn, UG_MIN, spanOf, tierOf, tierOfId, beltId, ugId, priceOf, ugPriceOf, rateOf, SPACING, K } from './beltdata.js';
import { DX, DZ, dirOfYaw } from './beltparts.js';

export const VARIANTS = ['Horizontal first', 'Vertical first', 'Around and over', 'Under'];
const isInt = Number.isInteger;
const RAMP_ID = 'ramp', RAMP_PRICE = 5 * K;   // the Belt Ramp recipe (Mk1 only)

// ---------------------------------------------------------------- routing
const heap = () => {
  const a = [];
  return {
    get size() { return a.length; },
    push(n) { a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } },
    pop() { const top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; },
  };
};

// probe.free(i,j,k): can a belt tile stand there (floor under it, nothing in it). Cached per route search.
export function makeProbe(g) {
  const L = g.logi, w = g.world, cache = new Map();
  return {
    free(i, j, k) {
      const key = idx(i, j, k); let v = cache.get(key);
      if (v === undefined) { v = isInt(i) && isInt(j) && isInt(k) && w.inside(i, j, k) && j >= 0 && j < NY; if (v) { const why = L.canPlace(i, j, k); v = !why || why === 'Too close'; } cache.set(key, v); }
      return v;
    },
  };
}

const sgn = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const dirOfStep = (di, dk) => (di > 0 ? 0 : di < 0 ? 2 : dk > 0 ? 1 : 3);

// the straight-line cells from s to e, moving along the first axis then the second (xFirst: east/west first)
function lCells(s, e, xFirst) {
  const out = [{ i: s.i, k: s.k }];
  let i = s.i, k = s.k;
  const goX = () => { while (i !== e.i) { i += sgn(e.i - i); out.push({ i, k }); } };
  const goZ = () => { while (k !== e.k) { k += sgn(e.k - k); out.push({ i, k }); } };
  if (xFirst) { goX(); goZ(); } else { goZ(); goX(); }
  return out;
}

// finish a cell list into tiles: each faces the next cell; the last one takes endDir (or keeps the way it was going)
function tilesOf(cells, j, endDir) {
  const t = [];
  for (let m = 0; m < cells.length; m++) {
    let dir;
    if (m < cells.length - 1) dir = dirOfStep(cells[m + 1].i - cells[m].i, cells[m + 1].k - cells[m].k);
    else dir = endDir != null ? endDir : m > 0 ? t[m - 1].dir : 0;
    t.push({ i: cells[m].i, j: cells[m].j ?? j, k: cells[m].k, dir, rise: 0, u: 0 });
  }
  return t;
}

// variants 0 and 1: an L shaped line on the start's level. Blocked cells are listed so the preview can show them red.
function routeL(probe, s, e, xFirst, endDir) {
  const cells = lCells(s, e, xFirst), blocked = [];
  for (const c of cells) if (!probe.free(c.i, s.j, c.k)) blocked.push({ i: c.i, j: s.j, k: c.k });
  const tiles = tilesOf(cells, s.j, endDir);
  if (e.j !== s.j) return { ok: false, why: 'The end is on another level. Try Around and over (it ramps up and down a step).', tiles, blocked };
  if (cells.length > PLAN_MAX) return { ok: false, why: `Too long: ${cells.length} tiles, ${PLAN_MAX} at most`, tiles, blocked };
  if (blocked.length) return { ok: false, why: blocked.length === 1 ? 'Something is in the way (try another route shape)' : `${blocked.length} cells are in the way (try another route shape)`, tiles, blocked };
  return { ok: true, tiles, blocked };
}

// variant 2: A* over the floor. A step may go up or down one cell (the tile it leaves becomes a ramp, and a ramp never turns).
function routeAround(probe, s, e, endDir) {
  if (!probe.free(s.i, s.j, s.k)) return { ok: false, why: 'The start is blocked', tiles: [], blocked: [{ i: s.i, j: s.j, k: s.k }] };
  if (!probe.free(e.i, e.j, e.k)) return { ok: false, why: 'The end is blocked', tiles: [], blocked: [{ i: e.i, j: e.j, k: e.k }] };
  const margin = 24, i0 = Math.min(s.i, e.i) - margin, i1 = Math.max(s.i, e.i) + margin, k0 = Math.min(s.k, e.k) - margin, k1 = Math.max(s.k, e.k) + margin;
  const key = (i, j, k, d) => ((((j + 2) * 4 + (d + 1)) * 100003 + (k - k0)) * 100003 + (i - i0));
  const open = heap(), best = new Map(), from = new Map();
  const h = (i, k, j) => Math.abs(i - e.i) + Math.abs(k - e.k) + Math.abs(j - e.j) * 0.5;
  const sk = key(s.i, s.j, s.k, -1);
  best.set(sk, 0); open.push({ i: s.i, j: s.j, k: s.k, d: -1, g: 0, f: h(s.i, s.k, s.j), key: sk });
  let goal = null, n = 0;
  while (open.size && n++ < 9000) {
    const cur = open.pop();
    if (cur.g > best.get(cur.key)) continue;
    if (cur.i === e.i && cur.k === e.k && cur.j === e.j) { goal = cur; break; }
    for (let dd = 0; dd < 4; dd++) {
      if (cur.d >= 0 && dd === ((cur.d + 2) & 3)) continue;
      const ni = cur.i + DX[dd], nk = cur.k + DZ[dd];
      if (ni < i0 || ni > i1 || nk < k0 || nk > k1) continue;
      for (const nj of [cur.j, cur.j + 1, cur.j - 1]) {
        if (nj !== cur.j && cur.d >= 0 && cur.d !== dd) continue;   // a ramp goes straight
        if (!probe.free(ni, nj, nk)) continue;
        const g2 = cur.g + 1 + (cur.d >= 0 && cur.d !== dd ? 0.4 : 0) + (nj !== cur.j ? 1.5 : 0);
        const kk = key(ni, nj, nk, dd);
        if (best.has(kk) && best.get(kk) <= g2) continue;
        best.set(kk, g2); from.set(kk, cur);
        open.push({ i: ni, j: nj, k: nk, d: dd, g: g2, f: g2 + h(ni, nk, nj), key: kk });
      }
    }
  }
  if (!goal) return { ok: false, why: 'No way through: everything around is blocked, or too steep', tiles: [], blocked: [] };
  const path = [];
  for (let c = goal; c; c = from.get(c.key)) path.push(c);
  path.reverse();
  const tiles = [];
  for (let m = 0; m < path.length; m++) {
    const c = path[m], nx = path[m + 1];
    tiles.push({ i: c.i, j: c.j, k: c.k, dir: nx ? dirOfStep(nx.i - c.i, nx.k - c.k) : (endDir != null ? endDir : m > 0 ? tiles[m - 1].dir : 0), rise: nx ? nx.j - c.j : 0, u: 0 });
  }
  if (tiles.length > PLAN_MAX) return { ok: false, why: `Too long: ${tiles.length} tiles, ${PLAN_MAX} at most`, tiles, blocked: [] };
  return { ok: true, tiles, blocked: [] };
}

// variant 3: the L shaped line, with an underground pair bridging each run of blocked cells
function routeUnder(probe, s, e, endDir, tier) {
  if (e.j !== s.j) return { ok: false, why: 'The end is on another level. Try Around and over.', tiles: [], blocked: [] };
  let last = null;
  for (const xFirst of [true, false]) {
    const cells = lCells(s, e, xFirst), n = cells.length;
    const blocked = cells.map((c) => !probe.free(c.i, s.j, c.k)), bl = [];
    cells.forEach((c, m) => { if (blocked[m]) bl.push({ i: c.i, j: s.j, k: c.k }); });
    const dirs = []; for (let m = 0; m < n - 1; m++) dirs.push(dirOfStep(cells[m + 1].i - cells[m].i, cells[m + 1].k - cells[m].k));
    const corner = (m) => m > 0 && m < n - 1 && dirs[m - 1] !== dirs[m];   // the line turns at cell m
    // runs of blocked cells (two runs with a single free cell between them become one: an end needs a cell of its own)
    const runs = [];
    for (let m = 0; m < n; m++) {
      if (!blocked[m]) continue;
      const lastRun = runs[runs.length - 1];
      if (lastRun && m - lastRun.b <= 2) lastRun.b = m; else runs.push({ a: m, b: m });
    }
    let why = null;
    const span = spanOf(tier);
    for (const r of runs) {
      const a = r.a - 1, b = r.b + 1;
      if (a < 0 || b > n - 1) { why = a < 0 ? 'The start is blocked' : 'The end is blocked'; break; }
      if (blocked[a] || blocked[b]) { why = 'No free cell to dive from or surface on'; break; }
      if (b - a > span) { why = `Too much in the way for a ${TIER_NAMES[tier]} underground: ${b - a} cells, ${span} at most`; break; }
      for (let m = a + 1; m <= b; m++) if (corner(m) && !(m === b && b === n - 1)) { why = 'An underground pair cannot turn. Try the other L shape.'; break; }
      if (why) break;
    }
    if (why) { last = { ok: false, why, tiles: tilesOf(cells, s.j, endDir), blocked: bl }; continue; }   // (nothing to lay: show the plain L with its blocked cells)
    const tiles = [];
    let m = 0; let ri = 0;
    while (m < n) {
      const r = runs[ri];
      if (r && m === r.a - 1) {
        const a = r.a - 1, b = r.b + 1, dir = dirs[a];
        tiles.push({ i: cells[a].i, j: s.j, k: cells[a].k, dir, rise: 0, u: 1, span: b - a });
        tiles.push({ i: cells[b].i, j: s.j, k: cells[b].k, dir: b < n - 1 ? dirs[b] : (endDir != null ? endDir : dir), rise: 0, u: 2, span: b - a });
        m = b + 1; ri++; continue;
      }
      tiles.push({ i: cells[m].i, j: s.j, k: cells[m].k, dir: m < n - 1 ? dirs[m] : (endDir != null ? endDir : m > 0 ? dirs[m - 1] : 0), rise: 0, u: 0 });
      m++;
    }
    last = { ok: !why, why, tiles, blocked: bl, cellsN: n };
    if (!why) {
      if (tiles.length > PLAN_MAX) { last = { ok: false, why: `Too long: ${tiles.length} tiles, ${PLAN_MAX} at most`, tiles, blocked: bl }; continue; }
      return last;
    }
  }
  return last;
}

// the one entry point: s, e = { i, j, k, dir? } (dir is the way the last tile must face when something forces it)
export function route(g, s, e, variant, tier) {
  const probe = makeProbe(g);
  const endDir = e.dir != null ? e.dir : null;
  if (s.i === e.i && s.k === e.k && s.j === e.j) return { ok: probe.free(s.i, s.j, s.k), why: probe.free(s.i, s.j, s.k) ? null : 'Blocked', tiles: tilesOf([{ i: s.i, k: s.k }], s.j, endDir ?? s.dir ?? 0), blocked: [] };
  if (Math.abs(s.i - e.i) + Math.abs(s.k - e.k) + 1 > PLAN_MAX) return { ok: false, why: `Too long: ${PLAN_MAX} tiles at most. Lay it in pieces.`, tiles: tilesOf(lCells(s, e, true).slice(0, 1), s.j, endDir ?? 0), blocked: [] };
  let r;
  if (variant === 0) r = routeL(probe, s, e, true, endDir);
  else if (variant === 1) r = routeL(probe, s, e, false, endDir);
  else if (variant === 2) r = routeAround(probe, s, e, endDir);
  else r = routeUnder(probe, s, e, endDir, tier);
  if (variant === 3 && !(tier > 0 || g.T.ugOn) && r.ok && r.tiles.some((t) => t.u)) return { ...r, ok: false, why: 'Underground belts are not unlocked yet' };
  // a last tile that faces straight back at the one before it would be head on: nothing could pass
  if (r.ok && r.tiles.length > 1) { const a = r.tiles[r.tiles.length - 2], b = r.tiles[r.tiles.length - 1]; if (a.u !== 1 && ((b.dir + 2) & 3) === a.dir) return { ...r, ok: false, why: 'The last piece would face back into the line' }; }
  return r;
}

// what a route uses: tiles of the mark, ramps, underground ends
export function needOf(tiles, tier) {
  const need = {};
  for (const t of tiles) { const id = t.u ? ugId(tier) : t.rise ? RAMP_ID : beltId(tier); need[id] = (need[id] || 0) + 1; }
  return need;
}
const unitPrice = (id, tier) => (id === RAMP_ID ? RAMP_PRICE : tierOfId(id, 'ug') >= 0 ? ugPriceOf(tier) : priceOf(tier));

// held items first, the shortfall bought at the bench price. { buy: money, lines: [...], short: bool }
export function costOf(g, tiles, tier) {
  const need = needOf(tiles, tier), items = g.S.items || {};
  let money = 0, held = 0, bought = 0;
  for (const [id, n] of Object.entries(need)) { const have = items[id] || 0, buy = Math.max(0, n - have); money += buy * unitPrice(id, tier); held += n - buy; bought += buy; }
  return { need, money, held, bought, ok: money <= g.S.money };
}

// ---------------------------------------------------------------- snapping
const nearBin = (g, a) => { const bp = g.hall && g.hall.binPos; return bp ? Math.hypot(cellX(a.i) - bp.x, cellZ(a.k) - bp.z) : Infinity; };
const faceDir = (fx, fz) => (Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 2) : (fz > 0 ? 1 : 3));

// the start: the open end of a line (carry on from it), the mouth of a sorter or a mech, else where you aim
export function snapStart(g, a, eye, dir) {
  const L = g.logi, t = L.tileAt(a.i, a.j, a.k) || L.pick(eye, dir, 4.5);   // the cell you aim at first: the first tile along the ray is often one in front of it
  if (t && t.type === 'belt' && !t.lift && !(t.ug && t.ug.role === 'in' && t.ug.pair != null) && !L.nextOf(t) && !t.detector) {
    const c = { i: t.i + DX[t.dir], j: t.j + (t.rise || 0), k: t.k + DZ[t.dir], dir: t.dir };
    return { ...c, note: 'continues the open end of a line' };
  }
  if (t && t.type === 'sorter') return { i: t.i + DX[t.dir], j: t.j, k: t.k + DZ[t.dir], dir: t.dir, note: 'starts at the sorter output' };
  if (t && t.type === 'mech') return { i: t.i - DX[t.dir], j: t.j, k: t.k - DZ[t.dir], dir: (t.dir + 2) & 3, note: 'starts behind the mech' };
  return { i: a.i, j: a.j, k: a.k, note: null };
}

// the end: the bin (the last piece faces it, close enough that it sucks plush in), a sorter's back, a vault or generator side, else where you aim
export function snapEnd(g, a, start, eye, dir) {
  const L = g.logi, w = g.world, probe = makeProbe(g);
  const t = L.tileAt(a.i, a.j, a.k) || L.pick(eye, dir, 4.5);
  if (t && t.type === 'sorter') {
    const c = { i: t.i - DX[t.dir], j: t.j, k: t.k - DZ[t.dir], dir: t.dir };
    if (probe.free(c.i, c.j, c.k)) return { ...c, note: 'feeds the sorter' };
  }
  if (t && (t.type === 'vault' || t.type === 'gen' || t.type === 'charger')) {
    let best = null, bd = Infinity;
    for (let d = 0; d < 4; d++) {
      const c = { i: t.i - DX[d], j: t.j, k: t.k - DZ[d], dir: d };
      if (!probe.free(c.i, c.j, c.k)) continue;
      const dist = Math.abs(c.i - start.i) + Math.abs(c.k - start.k); if (dist < bd) { bd = dist; best = c; }
    }
    if (best) return { ...best, note: `feeds the ${t.type}` };
  }
  const bp = g.hall && g.hall.binPos;
  if (bp && nearBin(g, a) < 6) {
    let best = null, bd = Infinity;
    for (let di = -6; di <= 6; di++) for (let dk = -6; dk <= 6; dk++) {
      const i = a.i + di, k = a.k + dk, x = cellX(i), z = cellZ(k), r = Math.hypot(x - bp.x, z - bp.z);
      if (r < 1.0 || r > 2.6 || !probe.free(i, a.j, k)) continue;
      const d = faceDir(bp.x - x, bp.z - z);
      if (!g.sinkNear(x + DX[d] * C, z + DZ[d] * C) && !g.sinkNear(x, z)) continue;
      const dist = Math.abs(di) + Math.abs(dk); if (dist < bd) { bd = dist; best = { i, j: a.j, k, dir: d }; }
    }
    if (best) return { ...best, note: 'feeds the bin' };
  }
  void w;
  return { i: a.i, j: a.j, k: a.k, note: null };
}

// ---------------------------------------------------------------- the game side
const state = (g) => g.bplan || (g.bplan = { on: false, start: null, variant: 0 });
export const toolTier = (tool) => (tool && tool.kind === 'belt' && !tool.ramp && !tool.hose ? tierOfId(tool.id, 'belt') : -1);
const fmtN = (n) => Math.round(n).toLocaleString('en-US');

function lineHint(g, tool, tier, r, cost) {
  const n = r.tiles.length, rate = rateOf(g.T, tier);
  const ug = r.tiles.filter((t) => t.u === 1).length, ramps = r.tiles.filter((t) => t.rise).length;
  const stock = cost.bought ? `uses ${cost.held} you hold, buys ${cost.bought} more for ◈ ${fmtN(cost.money)}` : `uses ${cost.held} you hold`;
  return `<kbd>B</kbd> lay the line: ${TIER_NAMES[tier]}, ${n} tiles (${(n * C).toFixed(1)} m)${ug ? `, ${ug} underground` : ''}${ramps ? `, ${ramps} ramp${ramps > 1 ? 's' : ''} (Mk1)` : ''}, ${fmtN(rate)} plush per min, ${stock} · <kbd>R</kbd> shape: ${VARIANTS[state(g).variant]}`;
}

// aim step with a belt in hand. Returns null when it is a normal belt (the old placement runs), else { plan, cost }.
export function plan(g, tool, eye, dir, yaw) {
  const tier = toolTier(tool); if (tier < 0) return null;
  const s = state(g), L = g.logi, a = L.aimCell(eye, dir);
  if (plannerOn(g, tool)) {
    if (!a) return { plan: { ok: false, why: 'Aim at the floor', planner: true }, cost: 0 };
    if (!s.start) {
      const sp = snapStart(g, a, eye, dir), d = sp.dir != null ? sp.dir : dirOfYaw(yaw);
      const why = L.canPlace(sp.i, sp.j, sp.k);
      const bad = why && why !== 'Too close' ? why : null;
      return { plan: { ok: !bad, why: bad, planner: true, startCell: { i: sp.i, j: sp.j, k: sp.k, dir: d }, ent: { type: 'belt', i: sp.i, j: sp.j, k: sp.k, dir: d, rise: 0 }, hintText: bad ? null : `Line planner: <kbd>B</kbd> sets the start${sp.note ? ' (' + sp.note + ')' : ''}, then aim the end. <kbd>.</kbd> leaves the planner` }, cost: 0 };
    }
    const en = snapEnd(g, a, s.start, eye, dir);
    const key = `${s.start.i},${s.start.j},${s.start.k},${s.start.dir}|${en.i},${en.j},${en.k},${en.dir}|${s.variant}|${tier}|${L.tiles.size}`;
    let r = s._r && s._rk === key ? s._r : null;
    if (!r) { r = route(g, s.start, en, s.variant, tier); s._r = r; s._rk = key; }
    const cost = costOf(g, r.tiles, tier);
    let why = r.ok ? null : r.why;
    if (r.ok && !markOn(g.T, tier)) why = 'That belt mark is not unlocked';
    if (r.ok && !cost.ok) why = `Not enough money: ◈ ${fmtN(cost.money)} for what you do not hold`;
    const ok = !why;
    return { plan: { ok, why, planner: true, route: r, tier, end: en, ent: r.tiles[0] ? { type: 'belt', ...r.tiles[0] } : { type: 'belt', i: a.i, j: a.j, k: a.k, dir: 0, rise: 0 }, hintText: ok ? lineHint(g, tool, tier, r, cost) : null }, cost: cost.money };
  }
  if (tier > 0 && a) {
    const t = L.tileAt(a.i, a.j, a.k);
    if (t && t.type === 'belt' && !t.lift && !t.ug && !t.rise && !t.hose && tierOf(t) < tier) {
      const ok = markOn(g.T, tier);
      return { plan: { ok, why: ok ? null : 'That belt mark is not unlocked', ent: { type: 'tierbelt', id: t.id, i: t.i, j: t.j, k: t.k, dir: t.dir, rise: 0, tier }, hintText: ok ? `<kbd>B</kbd> upgrade this belt from ${TIER_NAMES[tierOf(t)]} to ${TIER_NAMES[tier]} (the old belt comes back to you)` : null }, cost: 0 };
    }
  }
  return null;
}

// the route preview: one ghost per tile (underground ends tall, ramps tilted) and a red box on every blocked cell
export function ghost(g, tool, p) {
  if (!p || !p.route) return false;
  const r = p.route;
  const key = `bp${p.ok}|${r.tiles.map((t) => `${t.i},${t.j},${t.k},${t.dir},${t.rise},${t.u}`).join(';')}|${r.blocked.length}`;
  if (g.machines.ghostKey !== key) {
    const grp = new THREE.Group();
    const good = new THREE.MeshBasicMaterial({ color: 0x5dffa0, transparent: true, opacity: 0.4, depthWrite: false }), bad = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.45, depthWrite: false });
    const yawOf = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
    for (const t of r.tiles) {
      const pivot = new THREE.Group(); pivot.position.set(cellX(t.i), t.j * C, cellZ(t.k)); pivot.rotation.y = yawOf[t.dir];
      const mat = p.ok ? good : bad;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.56, t.u ? 0.4 : 0.08, 0.56), mat); box.position.y = t.u ? 0.2 : 0.05;
      if (t.rise) { box.rotation.x = -t.rise * Math.PI / 4; box.position.y += 0.3; box.scale.z = 1.4; }
      const arr = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 4), mat); arr.rotation.x = Math.PI / 2; arr.position.set(0, t.u ? 0.5 : 0.12, 0.18);
      pivot.add(box, arr); grp.add(pivot);
    }
    for (const b of r.blocked) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.58), bad); m.position.set(cellX(b.i), b.j * C + 0.29, cellZ(b.k)); grp.add(m); }
    g.machines.setGhost(grp, key);
  }
  if (g.machines.ghost) g.machines.ghost.position.set(0, 0, 0);
  return true;
}

// ---------------------------------------------------------------- placing
// placeCurrent step 0. In planner mode a click sets the start or lays the line. Returns true when it handled the click.
export function handle(g, tool) {
  if (g._forGuest) return false;   // the host is running a guest's place command: that is not this player's planner click
  if (!plannerOn(g, tool)) return false;
  const s = g.bplan;
  const p = g.plan; g.plan = null;
  if (!p || !p.planner || !p.ok) { g.sound.error(); if (p && p.why) g.ui.hint(p.why, 2.5); return true; }
  if (!s.start) { s.start = { ...p.startCell }; s._r = null; g.sound.tone('triangle', 520, 700, 0.07, 0.06); g.ui.hint(`Start set. Aim at the end and press <kbd>B</kbd>. <kbd>R</kbd> changes the shape of the line.`, 3); return true; }
  const tiles = p.route.tiles.map((t) => [t.i, t.j, t.k, t.dir, t.rise, t.u]);
  if (g.isGuest()) { g.cmd('bplan', { tier: p.tier, tiles }); g.sound.place(); s.start = null; s._r = null; return true; }
  const r = lay(g, p.tier, tiles);
  if (!r.ok) { g.sound.error(); g.ui.hint(r.why, 3); } else { s.start = null; s._r = null; g.ui.hint(`${r.n} tiles laid.`, 2.5); }
  return true;
}

// the host's check of a list of [i, j, k, dir, rise, u] tiles: contiguous, free, unlocked, affordable. Returns { ok, why, tiles, cost }.
export function validate(g, tier, raw) {
  if (!isInt(tier) || tier < 0 || tier >= TIER_NAMES.length) return { ok: false, why: 'Bad belt mark' };
  if (!markOn(g.T, tier)) return { ok: false, why: 'That belt mark is not unlocked yet' };
  if (!Array.isArray(raw) || !raw.length || raw.length > PLAN_MAX) return { ok: false, why: `A line is 1 to ${PLAN_MAX} tiles` };
  const L = g.logi, w = g.world, tiles = [], seen = new Set();
  for (const r of raw) {
    if (!Array.isArray(r) || r.length !== 6) return { ok: false, why: 'Bad line' };
    const [i, j, k, dir, rise, u] = r;
    if (![i, j, k, dir, rise, u].every(isInt) || dir < 0 || dir > 3 || rise < -1 || rise > 1 || u < 0 || u > 2 || (u && rise)) return { ok: false, why: 'Bad line' };
    if (!w.inside(i, j, k)) return { ok: false, why: 'Out of the hall' };
    const key = idx(i, j, k); if (seen.has(key)) return { ok: false, why: 'The line crosses itself' }; seen.add(key);
    const why = L.canPlace(i, j, k); if (why && why !== 'Too close') return { ok: false, why };
    tiles.push({ i, j, k, dir, rise, u });
  }
  for (let m = 0; m < tiles.length; m++) {
    const t = tiles[m], nx = tiles[m + 1];
    if (t.u === 1) {
      if (!(tier > 0 || g.T.ugOn)) return { ok: false, why: 'Underground belts are not unlocked yet' };
      if (!nx || nx.u !== 2 || nx.dir !== t.dir || nx.j !== t.j) return { ok: false, why: 'Bad underground pair' };
      const d = Math.abs(nx.i - t.i) + Math.abs(nx.k - t.k);
      if (nx.i - t.i !== DX[t.dir] * d || nx.k - t.k !== DZ[t.dir] * d || d < UG_MIN || d > spanOf(tier)) return { ok: false, why: 'Bad underground pair' };
      t.span = d; m++; continue;   // the exit is checked as part of the pair; the tile after it must follow the exit
    }
    if (t.u === 2) return { ok: false, why: 'Bad underground pair' };
    if (nx && (nx.i !== t.i + DX[t.dir] || nx.j !== t.j + t.rise || nx.k !== t.k + DZ[t.dir])) return { ok: false, why: 'The line is not connected' };
  }
  // the tile after an underground exit must follow it
  for (let m = 0; m < tiles.length - 1; m++) { const t = tiles[m]; if (t.u === 2) { const nx = tiles[m + 1]; if (nx.i !== t.i + DX[t.dir] || nx.j !== t.j || nx.k !== t.k + DZ[t.dir]) return { ok: false, why: 'The line is not connected' }; } }
  const cost = costOf(g, tiles, tier);
  if (!cost.ok) return { ok: false, why: `Not enough money: ◈ ${fmtN(cost.money)} for what you do not hold` };
  return { ok: true, tiles, cost };
}

// host: lay a validated line. Takes the items you hold, buys the shortfall, links the underground pairs.
export function lay(g, tier, raw) {
  const v = validate(g, tier, raw); if (!v.ok) return v;
  const S = g.S, need = v.cost.need;
  for (const [id, n] of Object.entries(need)) { const have = S.items[id] || 0, use = Math.min(have, n); if (use) { S.items[id] = have - use; if (S.items[id] <= 0) delete S.items[id]; } }
  if (v.cost.money) { S.money -= v.cost.money; g.ui.setMoney(S.money); }
  let entry = null;
  const placed = [];
  for (const t of v.tiles) {
    const f = { i: t.i, j: t.j, k: t.k, dir: t.dir, rise: t.rise, items: [] };
    if (tier > 0 && !t.rise) f.tier = tier;   // ramps stay Mk1
    if (t.u === 1) f.ug = { role: 'in', pair: null, span: t.span };
    if (t.u === 2) f.ug = { role: 'out', pair: entry ? entry.id : null, span: entry ? entry.ug.span : 0 };
    const ent = g.placeEntity('belt', f, { quiet: true, rebuild: false });
    if (!ent) return { ok: false, why: 'Could not place' };
    if (t.u === 1) entry = ent; else if (t.u === 2) entry = null;
    placed.push(ent);
  }
  S.stats.built = (S.stats.built || 0) + placed.length;
  g.sound.place(); g.rebuildTools();
  return { ok: true, n: placed.length, ents: placed };
}

// guest command 'bplan'
export function runCmd(g, d) {
  if (!d || typeof d !== 'object') return;
  const r = lay(g, d.tier, d.tiles);
  if (!r.ok) g.netSend({ t: 'toast', icon: '⚠️', title: 'Could not lay that line', text: String(r.why || 'Refused').slice(0, 80) });
}

// ---------------------------------------------------------------- upgrading in place
// host re-check of a guest's upgrade ('tierbelt') or of a Mk tile it asks for. Returns a reason or null.
export function conflict(g, tool, e) {
  // the tool a guest names must be one of the belt items (belt, a Mk tile, ramp, hose) and say the same thing twice
  if (tool && tool.kind === 'belt' && !(tool.id === 'ramp' ? !!tool.ramp && !tool.hose : tool.id === 'hose' ? !!tool.hose && !tool.ramp : tierOfId(tool.id, 'belt') >= 0 && !tool.ramp && !tool.hose)) return 'That is not a belt';
  const tier = toolTier(tool);
  if (tier > 0 && !markOn(g.T, tier)) return 'That belt mark is not unlocked yet';
  if (e && e.type === 'tierbelt') {
    if (tier <= 0) return 'Not an upgrade';
    const t = g.logi.byId.get(e.id);
    if (!t || t.type !== 'belt') return 'That belt is gone';
    if (t.lift || t.ug || t.rise || t.hose) return 'That piece keeps its mark';
    return tierOf(t) >= tier ? 'It is already that mark or better' : null;
  }
  return null;
}

// placeCurrent for a 'tierbelt': swap the mark, hand back the old belt. The item was taken already. Returns true when it applied.
export function applyTier(g, tool, e) {
  const t = g.logi.byId.get(e.id), tier = toolTier(tool);
  if (!t || tier <= 0 || conflict(g, tool, e)) { g.giveItem(tool.id); return true; }
  const old = tierOf(t);
  t.tier = tier; g.logi.dirty = true;
  g.giveItem(beltId(old));
  g.netSend({ t: 'ent-', id: t.id }); g.netSend({ t: 'ent+', ent: g.stripEnt(t) });
  g.power.markDirty(); g.sound.place();
  return true;
}

// new belts take the mark of the item you set down (ramps and hoses stay Mk1)
export function stamp(g, tool, ent) { const tier = toolTier(tool); if (tier > 0 && !ent.rise) ent.tier = tier; }

// ---------------------------------------------------------------- keys
const heightHint = (g) => g.ui.hint(`Lift height: <b>${g.liftH}</b> cells (${(g.liftH * C).toFixed(1)} m).`, 1.5);
// Period / Comma. Returns true when it did something.
export function key(g, code) {
  const tool = g.curTool && g.curTool(); if (!tool) return false;
  if (tool.kind === 'lift') {
    const h = Math.max(2, Math.min(24, (g.liftH | 0) || 4)); g.liftH = Math.max(2, Math.min(24, h + (code === 'Period' ? 1 : -1))); heightHint(g); return true;
  }
  if (toolTier(tool) < 0) return false;
  const s = state(g);
  if (code === 'Period') {
    s.on = !(s.on && s.id === tool.id && s.slot === tool.slot); s.id = tool.id; s.slot = tool.slot; s.start = null; s._r = null; g.machines.setGhost(null);
    g.ui.hint(s.on ? '<b>Line planner on.</b> <kbd>B</kbd> sets the start (or aim at the open end of a line), aim the end, <kbd>B</kbd> lays the whole line. <kbd>R</kbd> or <kbd>,</kbd> changes the shape. <kbd>.</kbd> turns it off.' : 'Line planner off. Hold <kbd>B</kbd> to lay belts one by one.', 5);
    return true;
  }
  if (plannerOn(g, tool)) { cycle(g, 1); return true; }
  return false;
}
// R, Comma or the wheel while the planner is on: the next route shape
export function cycle(g, step) { const s = state(g); s.variant = (s.variant + step + VARIANTS.length) % VARIANTS.length; s._r = null; g.ui.hint(`Route shape: <b>${VARIANTS[s.variant]}</b>`, 1.5); }
// R: flips a lift up/down, or picks the next route shape while the planner is on. Returns true when it did something.
export function rKey(g, tool) {
  if (tool && tool.kind === 'lift') { g.liftDown = !g.liftDown; g.machines.setGhost(null); g.ui.hint(`Lift goes <b>${g.liftDown ? 'down' : 'up'}</b>.`, 1.5); return true; }
  if (plannerOn(g, tool)) { cycle(g, 1); return true; }
  return false;
}
// the planner belongs to the belt item it was switched on with: another tool, another belt mark or a rebuilt hotbar leave it off
export const plannerOn = (g, tool) => !!(g.bplan && g.bplan.on && toolTier(tool) >= 0 && g.bplan.id === tool.id && g.bplan.slot === tool.slot);
void SPACING;
