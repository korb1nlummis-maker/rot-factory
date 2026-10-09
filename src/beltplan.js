// The line planner (Satisfactory spec 4.1, wave 1A): with a belt in hand press . to switch the planner on. Click the start, aim the end, click again and
// the whole line is laid. Four route shapes (R, , or the wheel cycle them): horizontal first, vertical first, around and over (follows the floor, ramps
// a step up or down), under (underground pairs through whatever is in the way). It also upgrades a belt in place when you set a higher mark over it.
// Pure routing sits at the top (it only asks `probe.free(i,j,k)`), the game side below. game.js calls in with one line per hook.
// No imports of game.js, upgrades.js, crafting.js, power.js or machines.js (import cycle through the catalog).
import * as THREE from 'three';
import { C, NY, cellX, cellZ, idx } from './config.js';
import { TIER_NAMES, PLAN_MAX, markOn, UG_MIN, spanOf, tierOf, tierOfId, beltId, ugId, priceOf, ugPriceOf, hosePriceOf, rateOf, SPACING, K, HOSE_PLAN_VARIANTS } from './beltdata.js';
import { hoseGhost, bendFrame } from './hosegeo.js';
import { bendBedGeometry } from './beltgeo.js';
import { DX, DZ, dirOfYaw } from './beltparts.js';
import { actSound } from './worldsound.js';   // a line a friend lays is heard from where it lies

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
function routeAround(probe, s, e, endDir, flat) {
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
      for (const nj of flat ? [cur.j] : [cur.j, cur.j + 1, cur.j - 1]) {   // (a hose stays on one level: no ramps)
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
export function route(g, s, e, variant, tier, hose) {
  const probe = makeProbe(g);
  const endDir = e.dir != null ? e.dir : null;
  if (s.i === e.i && s.k === e.k && s.j === e.j) return { ok: probe.free(s.i, s.j, s.k), why: probe.free(s.i, s.j, s.k) ? null : 'Blocked', tiles: tilesOf([{ i: s.i, k: s.k }], s.j, endDir ?? s.dir ?? 0), blocked: [] };
  if (Math.abs(s.i - e.i) + Math.abs(s.k - e.k) + 1 > PLAN_MAX) return { ok: false, why: `Too long: ${PLAN_MAX} tiles at most. Lay it in pieces.`, tiles: tilesOf(lCells(s, e, true).slice(0, 1), s.j, endDir ?? 0), blocked: [] };
  let r;
  if (variant === 0) r = routeL(probe, s, e, true, endDir);
  else if (variant === 1) r = routeL(probe, s, e, false, endDir);
  else if (variant === 2) r = routeAround(probe, s, e, endDir, !!hose);
  else if (hose) return { ok: false, why: 'A hose cannot go under: pick another shape', tiles: [], blocked: [] };
  else r = routeUnder(probe, s, e, endDir, tier);
  if (variant === 3 && !(tier > 0 || g.T.ugOn) && r.ok && r.tiles.some((t) => t.u)) return { ...r, ok: false, why: 'Underground belts are not unlocked yet' };
  // a last tile that faces straight back at the one before it would be head on: nothing could pass
  if (r.ok && r.tiles.length > 1) { const a = r.tiles[r.tiles.length - 2], b = r.tiles[r.tiles.length - 1]; if (a.u !== 1 && ((b.dir + 2) & 3) === a.dir) return { ...r, ok: false, why: 'The last piece would face back into the line' }; }
  return r;
}

// what a route uses: tiles of the mark, ramps, underground ends
export function needOf(tiles, tier, hose) {
  const need = {};
  if (hose) { need.hose = tiles.length; return need; }
  for (const t of tiles) { const id = t.u ? ugId(tier) : t.rise ? RAMP_ID : beltId(tier); need[id] = (need[id] || 0) + 1; }
  return need;
}
const unitPrice = (id, tier) => (id === 'hose' ? hosePriceOf() : id === RAMP_ID ? RAMP_PRICE : tierOfId(id, 'ug') >= 0 ? ugPriceOf(tier) : priceOf(tier));

// held items first, the shortfall bought at the bench price. { buy: money, lines: [...], short: bool }
export function costOf(g, tiles, tier, hose) {
  const need = needOf(tiles, tier, hose), items = g.S.items || {};
  let money = 0, held = 0, bought = 0;
  for (const [id, n] of Object.entries(need)) { const have = items[id] || 0, buy = Math.max(0, n - have); money += buy * unitPrice(id, tier); held += n - buy; bought += buy; }
  return { need, money, held, bought, ok: money <= g.S.money };
}

// ---------------------------------------------------------------- snapping
const nearBin = (g, a) => { const bp = g.hall && g.hall.binPos; return bp ? Math.hypot(cellX(a.i) - bp.x, cellZ(a.k) - bp.z) : Infinity; };
const faceDir = (fx, fz) => (Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 2) : (fz > 0 ? 1 : 3));

// the start: the open end of a line (carry on from it), the mouth of a sorter or a mech, else where you aim. belt: it carries on a belt or hose (the new piece is fed by it)
export function snapStart(g, a, eye, dir) {
  const L = g.logi, t = L.tileAt(a.i, a.j, a.k) || L.pick(eye, dir, 4.5);   // the cell you aim at first: the first tile along the ray is often one in front of it
  if (t && t.type === 'belt' && !t.lift && !(t.ug && t.ug.role === 'in' && t.ug.pair != null) && !L.nextOf(t) && !t.detector) {
    const c = { i: t.i + DX[t.dir], j: t.j + (t.rise || 0), k: t.k + DZ[t.dir], dir: t.dir };
    return { ...c, belt: true, note: 'continues the open end of a line' };
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
// Two ways in. The Line Planner (. key): B sets the start, B lays the line. The laying mode (left click with a belt or a hose in hand, like the build gun): the first click
// anchors a route (at the open end of a line, a sorter or a mech if you aim at one), the preview shows the whole curved route to where you aim with its length and cost,
// the next click lays all of it and carries on from its end (Q or right click puts the pencil down). Both use the same routing and the same host check.
const state = (g) => g.bplan || (g.bplan = { on: false, start: null, variant: 0 });
export const toolTier = (tool) => (tool && tool.kind === 'belt' && !tool.ramp && !tool.hose ? tierOfId(tool.id, 'belt') : -1);
export const isHoseTool = (tool) => !!(tool && tool.kind === 'belt' && tool.hose && !tool.ramp);
export const lineTier = (tool) => (isHoseTool(tool) ? 0 : toolTier(tool));   // the tool lays a routed line: a belt of a mark (0..5) or a hose (0), else -1
const nVariants = (tool) => (isHoseTool(tool) ? HOSE_PLAN_VARIANTS : VARIANTS.length);
const fmtN = (n) => Math.round(n).toLocaleString('en-US');

// The cord: while the button is held (and while a stretch you drew goes on from its open end) a line is as long as the pieces you hold, so you draw as far as you carry and no
// further. How many of the route's tiles the pack covers (a ramp is a Belt Ramp, an underground end is a pair): the first that are not covered, and everything after, are cut.
function cordLimit(g, tiles, tier, hose) {
  const have = g.S.items || {}, used = {}; let n = 0;
  for (let m = 0; m < tiles.length; m++) {
    const t = tiles[m], id = hose ? 'hose' : t.u ? ugId(tier) : t.rise ? RAMP_ID : beltId(tier), take = t.u === 1 ? 2 : 1;
    if ((used[id] || 0) + take > (have[id] || 0)) break;
    used[id] = (used[id] || 0) + take; n += take; if (t.u === 1) m++;
  }
  return n;
}

function lineHint(g, tool, tier, r, cost, p) {
  const s = state(g), n = r.tiles.length, hose = isHoseTool(tool), rate = rateOf(g.T, tier) * (hose ? 2 : 1);
  const ug = r.tiles.filter((t) => t.u === 1).length, ramps = r.tiles.filter((t) => t.rise).length;
  const stock = cost.bought ? `uses ${cost.held} you hold, buys ${cost.bought} more for ◈ ${fmtN(cost.money)}` : `uses ${cost.held} you hold`;
  const what = hose ? 'Vacuum Hose' : TIER_NAMES[tier], unit = hose ? (n === 1 ? 'piece' : 'pieces') : 'tiles';
  const shape = s.click && !s.manual ? `Auto (${VARIANTS[p.variant]})` : VARIANTS[p.variant];
  const gold = p.gold ? ' · <b>This end feeds the bin: stop here.</b>' : p.end && p.end.note && /feeds the/.test(p.end.note) ? ` · this end ${p.end.note.replace('feeds', 'feeds into')}` : '';
  const cord = s.click && (s.hold || s.cord), cut = p.cut ? ` · <b>You hold ${n} ${unit}: the cord stops here, ${p.cut} short of where you aim.</b> Let go, then press at its end to carry on (it turns the way you aim)` : '';
  return `<kbd>${cord ? 'Let go' : s.click ? 'Click' : 'B'}</kbd> lay the ${cord ? 'cord' : s.click ? 'route' : 'line'}: ${what}, ${n} ${unit} (${(n * C).toFixed(1)} m)${ug ? `, ${ug} underground` : ''}${ramps ? `, ${ramps} ramp${ramps > 1 ? 's' : ''} (Mk1)` : ''}, ${fmtN(rate)} plush per min, ${stock}${gold}${cut} · <kbd>R</kbd> shape: ${shape} · <kbd>Q</kbd> cancel`;
}

// the route for the aimed end. The planner uses the shape you chose; the laying mode picks one itself (the L that does not turn back on the line, the long leg first, else the other
// L, else around) until you press R.
function routeFor(g, s, en, tier, hose, nVar) {
  const tryV = (v) => { const r = route(g, s.start, en, v, tier, hose); if (r.ok && s.start.cont && r.tiles.length && ((r.tiles[0].dir + 2) & 3) === s.start.dir) return { ...r, ok: false, why: 'The line cannot turn back on itself' }; return r; };
  if (s.manual || !s.click) { const v = ((s.variant % nVar) + nVar) % nVar; return { r: tryV(v), v }; }
  const st = s.start, first = (st.cont ? (st.dir & 1) === 0 : Math.abs(en.i - st.i) >= Math.abs(en.k - st.k)) ? 0 : 1;
  let firstR = null;
  for (const v of [first, 1 - first, 2]) { if (v >= nVar) continue; const r = tryV(v); if (!firstR) firstR = { r, v }; if (r.ok) return { r, v }; }
  return firstR;
}

// aim step with a belt or hose in hand. Returns null when it is a normal piece (the old placement runs), else { plan, cost }.
export function plan(g, tool, eye, dir, yaw) {
  const tier = lineTier(tool); if (tier < 0) return null;
  const s = state(g), L = g.logi, a = L.aimCell(eye, dir), hose = isHoseTool(tool);
  if (plannerOn(g, tool)) {
    if (!a) return { plan: { ok: false, why: 'Aim at the floor', planner: true }, cost: 0 };
    if (!s.start) {
      const sp = snapStart(g, a, eye, dir), d = sp.dir != null ? sp.dir : dirOfYaw(yaw);
      const why = L.canPlace(sp.i, sp.j, sp.k);
      const bad = why && why !== 'Too close' ? why : null;
      return { plan: { ok: !bad, why: bad, planner: true, startCell: { i: sp.i, j: sp.j, k: sp.k, dir: d, cont: !!sp.belt }, ent: { type: 'belt', i: sp.i, j: sp.j, k: sp.k, dir: d, rise: 0 }, hintText: bad ? null : `Line planner: <kbd>B</kbd> sets the start${sp.note ? ' (' + sp.note + ')' : ''}, then aim the end. <kbd>.</kbd> leaves the planner` }, cost: 0 };
    }
    const en = snapEnd(g, a, s.start, eye, dir), nVar = nVariants(tool);
    const key = `${s.start.i},${s.start.j},${s.start.k},${s.start.dir}|${en.i},${en.j},${en.k},${en.dir}|${s.variant}|${s.click ? (s.manual ? 'm' : 'a') : 'p'}|${tier}|${hose ? 'h' : ''}|${L.tiles.size}`;
    let rr = s._r && s._rk === key ? s._r : null;
    if (!rr) { rr = routeFor(g, s, en, tier, hose, nVar); s._r = rr; s._rk = key; }
    let r = rr.r; s.shown = rr.v;
    if (s.click && (s.hold || s.cord) && r.tiles.length) {   // the cord (see cordLimit): as long as the pieces held
      if (s.hold && r.tiles.length > 1) s.hold.moved = true;   // the aim has left the cell the press began on: this is a drag
      const n = cordLimit(g, r.tiles, tier, hose);
      if (n < r.tiles.length) r = { ...r, tiles: r.tiles.slice(0, n), cut: r.tiles.length - n, ok: n > 0 && r.ok, why: n > 0 ? r.why : `You hold none of ${hose ? 'the hose' : 'this belt'}: craft some (a click, not a drag, buys what you do not hold)` };
    }
    const cost = costOf(g, r.tiles, tier, hose);
    let why = r.ok ? null : r.why;
    if (r.ok && !markOn(g.T, tier)) why = 'That belt mark is not unlocked';
    if (r.ok && hose && !(g.T.vac > 0)) why = 'The Vacuum Hose is not unlocked yet';
    if (r.ok && !cost.ok) why = `Not enough money: ◈ ${fmtN(cost.money)} for what you do not hold`;
    const ok = !why, lastT = r.tiles[r.tiles.length - 1];
    const gold = !!(ok && lastT && L.wouldSink({ i: lastT.i, j: lastT.j, k: lastT.k, dir: lastT.dir, rise: lastT.rise || 0, ug: lastT.u ? { role: lastT.u === 1 ? 'in' : 'out' } : undefined }));   // the last piece within suck range of a bin glows gold
    const p = { ok, why, planner: true, route: r, cut: r.cut || 0, tier, hose, variant: rr.v, gold, end: en, ent: r.tiles[0] ? { type: 'belt', ...r.tiles[0] } : { type: 'belt', i: a.i, j: a.j, k: a.k, dir: 0, rise: 0 } };
    p.hintText = ok ? lineHint(g, tool, tier, r, cost, p) : null;
    return { plan: p, cost: cost.money };
  }
  if (tier > 0 && a && !hose) {
    const t = L.tileAt(a.i, a.j, a.k);
    if (t && t.type === 'belt' && !t.lift && !t.ug && !t.rise && !t.hose && tierOf(t) < tier) {
      const ok = markOn(g.T, tier);
      return { plan: { ok, why: ok ? null : 'That belt mark is not unlocked', ent: { type: 'tierbelt', id: t.id, i: t.i, j: t.j, k: t.k, dir: t.dir, rise: 0, tier }, hintText: ok ? `<kbd>B</kbd> upgrade this belt from ${TIER_NAMES[tierOf(t)]} to ${TIER_NAMES[tier]} (the old belt comes back to you)` : null }, cost: 0 };
    }
  }
  return null;
}

// the route preview: the whole route as it will stand. A belt route is a bed per tile with quarter arcs at the corners; a hose route is the hose itself (ribbed tube, real bends,
// the flared mouth where it starts). Green when it can be laid, red when not (with a red box on every blocked cell), gold when its last piece is in suck range of a bin.
// the preview is rebuilt for every cell you aim at: its pieces are shared, never new geometry each time (a geometry nobody disposes stays in the graphics card)
const GEOS = new Map();
const geoOf = (key, make) => { let v = GEOS.get(key); if (!v) { v = make(); GEOS.set(key, v); } return v; };
const boxOf = (a, b, c) => geoOf(`box${a},${b},${c}`, () => new THREE.BoxGeometry(a, b, c));
export function ghost(g, tool, p) {
  if (!p || !p.route) return false;
  const r = p.route, hose = !!p.hose, st = state(g).start, cont = st && st.cont ? st.dir : null, gold = !!p.gold;
  const key = `bp${p.ok}${gold ? 'g' : ''}${hose ? 'h' : ''}${cont}${p.cut ? 'c' + p.cut : ''}|${r.tiles.map((t) => `${t.i},${t.j},${t.k},${t.dir},${t.rise},${t.u}`).join(';')}|${r.blocked.length}`;
  if (g.machines.ghostKey !== key) {
    const grp = new THREE.Group();
    const col = gold ? 0xffc928 : p.ok ? 0x5dffa0 : 0xff5a4a;
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: gold ? 0.62 : 0.42, depthWrite: false });
    const bad = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.45, depthWrite: false });
    const yawOf = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
    // the way each piece is fed: the piece before it (when it points at it), or the open end the route carries on from
    const from = r.tiles.map((t, m) => {
      if (t.u || t.rise) return t.dir;
      const pv = r.tiles[m - 1];
      if (pv) return !pv.u && !pv.rise && pv.i + DX[pv.dir] === t.i && pv.k + DZ[pv.dir] === t.k && pv.j === t.j ? pv.dir : t.dir;
      return cont != null ? cont : t.dir;
    });
    if (hose) {
      const list = r.tiles.map((t, m) => ({ x: cellX(t.i), z: cellZ(t.k), y: t.j * C, dir: t.dir, from: from[m] }));
      grp.add(hoseGhost(list, mat, cont == null));
      const lt = r.tiles[r.tiles.length - 1];
      if (gold && lt) { const ring = new THREE.Mesh(geoOf('torus', () => new THREE.TorusGeometry(0.3, 0.04, 8, 20)), mat); ring.position.set(cellX(lt.i), lt.j * C + 0.2, cellZ(lt.k)); ring.rotation.y = yawOf[lt.dir]; grp.add(ring); }
    } else {
      r.tiles.forEach((t, m) => {
        const arc = from[m] !== t.dir && ((from[m] + 2) & 3) !== t.dir;
        const pivot = new THREE.Group(); pivot.position.set(cellX(t.i), t.j * C, cellZ(t.k)); if (!arc) pivot.rotation.y = yawOf[t.dir];
        const arrowAt = new THREE.Group();
        if (arc) {
          // a real quarter circle of deck, the one the placed corner is drawn with (beltgeo.js), in world axes; the arrow sits where the plush leave it
          const bx = DX[t.dir] * C * 0.5, bz = DZ[t.dir] * C * 0.5, f = bendFrame(cellX(t.i), cellZ(t.k), from[m], t.dir);
          const deck = new THREE.Mesh(geoOf(f.right ? 'bendR' : 'bendL', () => bendBedGeometry(!f.right)), mat);
          deck.matrixAutoUpdate = false; deck.matrix.makeBasis(new THREE.Vector3(f.xAxis[0], 0, f.xAxis[1]), new THREE.Vector3(0, 1, 0), new THREE.Vector3(f.zAxis[0], 0, f.zAxis[1])).setPosition(f.ox, t.j * C + 0.055, f.oz); grp.add(deck);
          arrowAt.position.set(bx * 0.5, 0, bz * 0.5); arrowAt.rotation.y = yawOf[t.dir];
        } else {
          const box = new THREE.Mesh(boxOf(0.56, t.u ? 0.4 : 0.08, 0.56), mat); box.position.y = t.u ? 0.2 : 0.05;
          if (t.rise) { box.rotation.x = -t.rise * Math.PI / 4; box.position.y += 0.3 * Math.sign(t.rise); box.scale.z = 1.4; }
          pivot.add(box); arrowAt.position.set(0, 0, 0.18);
        }
        const arr = new THREE.Mesh(geoOf('cone', () => new THREE.ConeGeometry(0.09, 0.22, 4)), mat); arr.rotation.x = Math.PI / 2; arr.position.y = t.u ? 0.5 : 0.12;
        arrowAt.add(arr); pivot.add(arrowAt); grp.add(pivot);
      });
      const lt = r.tiles[r.tiles.length - 1];
      if (gold && lt) { const plate = new THREE.Mesh(boxOf(0.5, 0.03, 0.58), mat); plate.position.set(cellX(lt.i), lt.j * C + 0.1, cellZ(lt.k)); plate.rotation.y = yawOf[lt.dir]; grp.add(plate); }
    }
    if (p.cut && r.tiles.length) { const lt = r.tiles[r.tiles.length - 1], stop = new THREE.Mesh(boxOf(0.56, 0.05, 0.56), new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.55, depthWrite: false })); stop.position.set(cellX(lt.i + DX[lt.dir]), (lt.j + (lt.rise || 0)) * C + 0.04, cellZ(lt.k + DZ[lt.dir])); grp.add(stop); }   // the cell the cord would have gone on to: it stops short of it
    for (const b of r.blocked) { const m = new THREE.Mesh(boxOf(0.58, 0.58, 0.58), bad); m.position.set(cellX(b.i), b.j * C + 0.29, cellZ(b.k)); grp.add(m); }
    g.machines.setGhost(grp, key);
  }
  if (g.machines.ghost) g.machines.ghost.position.set(0, 0, 0);
  return true;
}

// ---------------------------------------------------------------- placing
// after a route is laid in the laying mode: carry on from its open end (the next click lays the next stretch), unless it ended at a bin, a sorter, a vault or a generator
function carryOn(g, s, p) {
  const last = p.route && p.route.tiles[p.route.tiles.length - 1];
  const endsThere = p.gold || (p.end && p.end.note && /feeds the/.test(p.end.note)) || !last || last.u;
  s._r = null; s.manual = false;
  if (s.click && !endsThere) {
    const c = { i: last.i + DX[last.dir], j: last.j + (last.rise || 0), k: last.k + DZ[last.dir], dir: last.dir, cont: true };
    const why = g.logi.canPlace(c.i, c.j, c.k);
    if (!why || why === 'Too close') { s.start = c; return true; }
  }
  s.start = null; s.cord = false; s.hold = null; if (s.click) { s.on = false; s.click = false; }
  return false;
}

// left click with a belt or a hose in hand (game.useTool). With the planner off it anchors a route at the aimed cell (the open end of a line, a sorter output, a mech, else the floor);
// with a route anchored (or the planner on) it is the same as B. Returns true when it handled the click.
export function clickLay(g, tool) {
  if (g._forGuest || lineTier(tool) < 0) return false;
  if (plannerOn(g, tool)) { const s0 = g.bplan; if (s0.click && s0.cord && s0.start) { s0.hold = { moved: false, t: g.time }; return true; } return false; }   // (a stretch you drew goes on from its end: the press is the start of the next draw, it lays when you let go)
  if (g.plan && g.plan.ent && g.plan.ent.type === 'tierbelt') return false;   // a higher mark aimed at a lower belt: the click upgrades it, as B does
  const e = g._bEye, d = g._bDir; if (!e || !d) return false;
  const L = g.logi, a = L.aimCell(e, d);
  if (!a) { g.sound.error(); g.ui.hint('Aim at the floor to start a route.', 2); return true; }
  const sp = snapStart(g, a, e, d), dr = sp.dir != null ? sp.dir : dirOfYaw(g.player.yaw), why = L.canPlace(sp.i, sp.j, sp.k);
  if (why && why !== 'Too close') { g.sound.error(); g.ui.hint(why, 2); return true; }
  const s = state(g); Object.assign(s, { on: true, click: true, manual: false, id: tool.id, slot: tool.slot, start: { i: sp.i, j: sp.j, k: sp.k, dir: dr, cont: !!sp.belt }, _r: null, variant: 0, hold: { moved: false, t: g.time }, cord: false });   // (the press may be the start of a draw: see dragTick) g.machines.setGhost(null);
  g.sound.tone('triangle', 520, 700, 0.07, 0.06);
  g.ui.hint(`Route started${sp.note ? ' (' + sp.note + ')' : ''}. Aim where it should end: the preview shows the whole route with its length and cost, <kbd>click</kbd> lays it. <kbd>R</kbd> changes its shape, <kbd>Q</kbd> or right click cancels.`, 4);
  return true;
}

// Q or right click: put the route (or the planner's start) down. Returns true when it cancelled something, so the key does not stow the tool or punch.
export function cancel(g) {
  const s = g.bplan, tool = g.curTool && g.curTool();
  if (!s || !s.start || !tool || !plannerOn(g, tool)) return false;
  s.start = null; s._r = null; s.hold = null; s.cord = false; if (s.click) { s.on = false; s.click = false; }
  g.machines.setGhost(null); g.plan = null; g.ui.hint('Route cancelled.', 1.5); g.sound.tone('sine', 420, 300, 0.06, 0.05);
  return true;
}

// the laying mode belongs to the piece it was started with: any other tool (the hammer, the hands) ends it
export function guard(g, tool) { const s = g.bplan; if (s && s.click && s.on && !plannerOn(g, tool)) { s.on = false; s.click = false; s.start = null; s._r = null; s.hold = null; s.cord = false; if (g.machines) g.machines.setGhost(null); } }

// Hold and draw (once per aim step, game.updateBuild): the press that anchored a route (or began the next stretch of a cord) is a draw while the button is down. Let go after
// aiming somewhere else and the whole route is laid (as long as the pieces you hold: plan() cuts it); let go on the cell you pressed and it stays anchored for a second click.
export function dragTick(g, tool) {
  const s = g.bplan, h = s && s.hold; if (!h) return;
  if (!s.click || !s.on || !s.start || !plannerOn(g, tool) || (g.ui && g.ui.isModalOpen && g.ui.isModalOpen())) { s.hold = null; return; }
  if (g.keys && g.keys.KeyG) return;   // the button is still down
  s.hold = null;
  if (!h.moved && !s.cord) return;
  const p = g.plan;
  if (!p || !p.planner || !p.ok || !p.route) { g.sound.error(); if (p && p.why) g.ui.hint(p.why, 2.5); return; }
  s.cord = true;   // (carryOn ends it again when the stretch ended at a bin or could not go on)
  g.placeCurrent(tool);
}

// placeCurrent step 0. In planner mode a click sets the start or lays the line. Returns true when it handled the click.
export function handle(g, tool) {
  if (g._forGuest) return false;   // the host is running a guest's place command: that is not this player's planner click
  if (!plannerOn(g, tool)) return false;
  const s = g.bplan;
  const p = g.plan; g.plan = null;
  if (!p || !p.planner || !p.ok) { g.sound.error(); if (p && p.why) g.ui.hint(p.why, 2.5); return true; }
  if (!s.start) { s.start = { ...p.startCell }; s._r = null; g.sound.tone('triangle', 520, 700, 0.07, 0.06); g.ui.hint(`Start set. Aim at the end and press <kbd>B</kbd>. <kbd>R</kbd> changes the shape of the line.`, 3); return true; }
  const tiles = p.route.tiles.map((t) => [t.i, t.j, t.k, t.dir, t.rise, t.u]);
  if (g.isGuest()) { g.cmd('bplan', { tier: p.tier, tiles, hose: !!p.hose }); g.sound.place(); carryOn(g, s, p); return true; }
  const r = lay(g, p.tier, tiles, p.hose);
  if (!r.ok) { g.sound.error(); g.ui.hint(r.why, 3); } else { g.ui.hint(`${r.n} ${p.hose ? (r.n === 1 ? 'hose piece' : 'hose pieces') : 'tiles'} laid.${carryOn(g, s, p) ? ' It carries on from the end: aim the next stretch, <kbd>Q</kbd> to stop.' : ''}`, 2.5); }
  return true;
}

// the host's check of a list of [i, j, k, dir, rise, u] tiles: contiguous, free, unlocked, affordable. Returns { ok, why, tiles, cost }.
export function validate(g, tier, raw, hose) {
  if (!isInt(tier) || tier < 0 || tier >= TIER_NAMES.length) return { ok: false, why: 'Bad belt mark' };
  if (!markOn(g.T, tier)) return { ok: false, why: 'That belt mark is not unlocked yet' };
  if (hose && (tier !== 0 || !(g.T.vac > 0))) return { ok: false, why: 'The Vacuum Hose is not unlocked yet' };
  if (!Array.isArray(raw) || !raw.length || raw.length > PLAN_MAX) return { ok: false, why: `A line is 1 to ${PLAN_MAX} tiles` };
  const L = g.logi, w = g.world, tiles = [], seen = new Set();
  for (const r of raw) {
    if (!Array.isArray(r) || r.length !== 6) return { ok: false, why: 'Bad line' };
    const [i, j, k, dir, rise, u] = r;
    if (![i, j, k, dir, rise, u].every(isInt) || dir < 0 || dir > 3 || rise < -1 || rise > 1 || u < 0 || u > 2 || (u && rise) || (hose && (rise || u))) return { ok: false, why: 'Bad line' };
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
  if (tiles.length > 1) { const a = tiles[tiles.length - 2], b = tiles[tiles.length - 1]; if (a.u !== 1 && ((b.dir + 2) & 3) === a.dir) return { ok: false, why: 'The last piece would face back into the line' }; }   // (as route() refuses it: a head on pair passes nothing)
  const cost = costOf(g, tiles, tier, hose);
  if (!cost.ok) return { ok: false, why: `Not enough money: ◈ ${fmtN(cost.money)} for what you do not hold` };
  return { ok: true, tiles, cost };
}

// host: lay a validated line. Takes the items you hold, buys the shortfall, links the underground pairs.
export function lay(g, tier, raw, hose) {
  const v = validate(g, tier, raw, hose); if (!v.ok) return v;
  const S = g.S, need = v.cost.need;
  for (const [id, n] of Object.entries(need)) { const have = S.items[id] || 0, use = Math.min(have, n); if (use) { S.items[id] = have - use; if (S.items[id] <= 0) delete S.items[id]; } }
  if (v.cost.money) { S.money -= v.cost.money; g.ui.setMoney(S.money); }
  let entry = null;
  const placed = [];
  for (const t of v.tiles) {
    const f = { i: t.i, j: t.j, k: t.k, dir: t.dir, rise: t.rise, items: [] };
    if (hose) f.hose = true;   // a vacuum hose line: its first piece is the mouth
    else if (tier > 0 && !t.rise) f.tier = tier;   // ramps stay Mk1
    if (t.u === 1) f.ug = { role: 'in', pair: null, span: t.span };
    if (t.u === 2) f.ug = { role: 'out', pair: entry ? entry.id : null, span: entry ? entry.ug.span : 0 };
    const ent = g.placeEntity('belt', f, { quiet: true, rebuild: false });
    if (!ent) return { ok: false, why: 'Could not place' };
    if (t.u === 1) entry = ent; else if (t.u === 2) entry = null;
    placed.push(ent);
  }
  S.stats.built = (S.stats.built || 0) + placed.length;
  { const e0 = placed[0]; actSound(g, e0 ? { x: cellX(e0.i), y: e0.j * C + 0.5, z: cellZ(e0.k) } : null).place(); } g.rebuildTools();
  return { ok: true, n: placed.length, ents: placed };
}

// guest command 'bplan'
export function runCmd(g, d) {
  if (!d || typeof d !== 'object') return;
  const r = lay(g, d.tier, d.tiles, !!d.hose);
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
  g.power.markDirty(); actSound(g, { x: cellX(t.i), y: t.j * C + 0.5, z: cellZ(t.k) }).place();
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
  if (lineTier(tool) < 0) return false;
  const s = state(g);
  if (code === 'Period') {
    s.on = !(s.on && s.id === tool.id && s.slot === tool.slot); s.id = tool.id; s.slot = tool.slot; s.start = null; s._r = null; s.click = false; s.manual = false; s.hold = null; s.cord = false; g.machines.setGhost(null);
    g.ui.hint(s.on ? '<b>Line planner on.</b> <kbd>B</kbd> sets the start (or aim at the open end of a line), aim the end, <kbd>B</kbd> lays the whole line. <kbd>R</kbd> or <kbd>,</kbd> changes the shape. <kbd>.</kbd> turns it off.' : 'Line planner off. Hold <kbd>B</kbd> to lay belts one by one.', 5);
    return true;
  }
  if (plannerOn(g, tool)) { cycle(g, 1); return true; }
  return false;
}
// R, Comma or the wheel while the planner is on: the next route shape
export function cycle(g, step) {
  const s = state(g), tool = g.curTool && g.curTool(), n = tool ? nVariants(tool) : VARIANTS.length;
  if (s.click && !s.manual) { s.variant = s.shown != null ? s.shown : s.variant; s.manual = true; }   // the laying mode picks the shape until you press R, then it is yours
  s.variant = (((s.variant % n) + n) % n + step + n) % n; s._r = null; g.ui.hint(`Route shape: <b>${VARIANTS[s.variant]}</b>`, 1.5);
}
// R: flips a lift up/down, or picks the next route shape while the planner is on. Returns true when it did something.
export function rKey(g, tool) {
  if (tool && tool.kind === 'lift') { g.liftDown = !g.liftDown; g.machines.setGhost(null); g.ui.hint(`Lift goes <b>${g.liftDown ? 'down' : 'up'}</b>.`, 1.5); return true; }
  if (plannerOn(g, tool)) { cycle(g, 1); return true; }
  if (tool && tool.kind === 'belt' && !tool.ramp) {   // a belt or a hose in hand and no route: R turns the next piece a quarter turn from the way you face (the mouse turns it back)
    const d = dirOfYaw(g.player.yaw), br = g.beltRot, off = br && br.base === d ? (br.off + 1) & 3 : 1;
    g.beltRot = off ? { base: d, off } : null; g.plan = null; g.machines.setGhost(null);
    g.ui.hint(off ? `Next piece turned a quarter turn (${off * 90} degrees right). <kbd>R</kbd> again turns it more; turning the mouse sets it back.` : 'Next piece faces the way you look.', 2);
    return true;
  }
  return false;
}
// the planner belongs to the belt item it was switched on with: another tool, another belt mark or a rebuilt hotbar leave it off
export const plannerOn = (g, tool) => !!(g.bplan && g.bplan.on && lineTier(tool) >= 0 && g.bplan.id === tool.id && g.bplan.slot === tool.slot);
void SPACING;
