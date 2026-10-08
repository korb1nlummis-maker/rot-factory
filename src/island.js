// ISLANDS: plush that has been cut off from the pile falls.
//
// The roof rules in world.js judge a roof over a cavity. They never ask whether a piece of the pile is still joined to anything. Dig under a slab, then cut its sides
// free, and the slab hung in the air. This module asks that question, and only about the neighbourhood of what was just dug.
//
// THE RULE. Two plush cells are joined when they share a face (6 neighbour connectivity: the lattice has no corner contacts that a real pile would hold, a plush
// touching another only along an edge or a corner is not supported by it). A group of cells joined to each other is HELD when any one of them
//   * stands on the hall floor (j = 0), or touches the world edge (the hall walls),
//   * is a bulkhead or a floor pad (player built structure never falls and holds what is on it),
//   * lies inside the reach of a support (a frame cube, a stack, a strut, a jack, an arch: the same sphere world.supportBonus uses), or
//   * belongs to a mass of ISLAND_CAP cells or more (the pile itself: the search gives up and calls it held).
// Anything else is an ISLAND. An island waits a short, believable time (DELAY_MIN to DELAY_MAX seconds, longer for a bigger slab and with the Creak Detector's longer warning), creaking and
// shedding dust, with the same HUD warning a failing roof gives. Then it is looked at once more (a support placed under it, a pad, or the player digging it back into the pile
// saves it) and whatever is still cut off lets go through game.releaseIsland: every plush becomes a loose body, with the rumble, shake, dust and slide chain of a cave-in.
//
// COST. Nothing scans the world. world.updateStability hands in the cells around every removed cell (the same queue the roof check uses). Each of them is a seed, and a seed
// is settled by the cheapest test that can: its own column down to the floor, then a short ray along each horizontal axis to a column that reaches the floor (a roof cell is
// held by the pile beside it), and only then a flood fill, depth first and downhill, with a hard cap. Cells found held are remembered for the rest of the tick so a hundred
// seeds in one pile cost one search. A tick spends at most budgetMs on seeds and the rest wait in the queue (capped, so a forged flood of edits cannot grow it).
import { NX, NY, NZ, cellX, cellY, cellZ } from './config.js';
import { BULK, PAD, CACHE, REMAINS, isSpecialCell } from './plushdata.js';

export const ISLAND_CAP = 4000;     // a group of this many cells or more is the pile (held). The flood fill never visits more cells than this
export const RAY_REACH = 24;        // how far the quick test walks sideways along a roof looking for a column that reaches the floor
export const QUIET_N = 6;           // a group of fewer plush than this is a stray one or two hanging after a dig: it drops after the minimum wait without the creak, the hint or the warning
export const DELAY_MIN = 1, DELAY_MAX = 3, DELAY_PER_CELL = 1 / 500;   // seconds before a cut off slab lets go: 1 s for a small one, 3 s for 1000 cells or more
export const ISLAND_BODIES = 1200;   // loose bodies a falling slab may have in the sim at once (game.releaseIsland); what is past that drops down its column instead
export const SEED_CAP = 60000;      // seeds waiting at most (a flood of forged edits drops the rest instead of growing the queue)
const MAX_SAMPLE = 48;              // creaking markers shown on a waiting island (its underside)
const HMASK = 65535;                // the scratch hash table of a flood (the stack never holds more than five times the cap)
const STACK = 3 * (5 * ISLAND_CAP + 64);
const ATT = -1;

const kOf = (i, j, k) => (j * NZ + k) * NX + i;
const DI = [0, 0, 1, -1, 0, 0], DJ = [1, -1, 0, 0, 0, 0], DK = [0, 0, 0, 0, 1, -1];   // up first, down last: the flood explores downhill first (a stack pops the last push)
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Islands {
  constructor(world) {
    this.w = world;
    this.off = false;           // a test can switch the whole thing off
    this.q = []; this.qh = 0; this.qSet = new Set();
    this.list = new Map();      // id -> island
    this.cellIsl = new Map();   // cell key -> island (cells of islands waiting or falling: a seed in one is already known)
    this.nextId = 1;
    this.budgetMs = 2;          // per tick, for seeds
    this.scanMs = 3;            // per tick, for the scan that follows a load
    this.att = new Set();       // cells found held during this tick
    this.hk = new Float64Array(HMASK + 1); this.hs = new Uint32Array(HMASK + 1); this.stamp = 0;
    this.st = new Int32Array(STACK); this.ord = new Int32Array(3 * (ISLAND_CAP + 8));
    this.lastN = 0;             // cells the last flood visited (this.ord)
    this.why = null;            // what held the last group that was found held: ['floor' | 'edge' | 'column' | 'cap' | 'support' | 'specials', i, j, k] (a debugging aid and a test hook)
    this.scan = null;           // the pending scan of a loaded world
    this.stats = { seeds: 0, quick: 0, floods: 0, visited: 0, capped: 0, islands: 0, released: 0, dropped: 0, ms: 0, maxMs: 0, maxFloodMs: 0 };
  }

  // ---------------------------------------------------------------- seeds
  push(i, j, k) {
    if (j <= 0 || j >= NY || i < 0 || i >= NX || k < 0 || k >= NZ || !this.w.get(i, j, k)) return;
    const key = kOf(i, j, k);
    if (this.qSet.has(key)) return;
    if (this.q.length - this.qh >= SEED_CAP) { this.stats.dropped++; return; }
    this.qSet.add(key); this.q.push(key);
  }
  // an edit at (i, j, k): the cell and the six around it may now hang loose
  around(i, j, k) { this.push(i, j, k); for (let d = 0; d < 6; d++) this.push(i + DI[d], j + DJ[d], k + DK[d]); }
  pending() { return this.q.length - this.qh; }
  // every plush cell with air against it inside a sphere (centre and radius in cells): the neighbourhood of a support that has just gone. The roof checks that come with a taken down
  // frame look at points 4 cells apart, and a narrow slab that only the frame held can lie between them.
  sphere(ci, cj, ck, r) {
    const w = this.w, r2 = r * r; let n = 0;
    for (let j = Math.max(1, cj - r); j <= Math.min(NY - 2, cj + r); j++) for (let k = Math.max(0, ck - r); k <= Math.min(NZ - 1, ck + r); k++) for (let i = Math.max(0, ci - r); i <= Math.min(NX - 1, ci + r); i++) {
      const di = i - ci, dj = j - cj, dk = k - ck; if (di * di + dj * dj + dk * dk > r2 || !w.get(i, j, k)) continue;
      if (w.get(i, j - 1, k) && w.get(i, j + 1, k) && w.get(i + 1, j, k) && w.get(i - 1, j, k) && w.get(i, j, k + 1) && w.get(i, j, k - 1)) continue;   // buried in the pile: nothing to ask
      this.push(i, j, k); if (++n >= 4000) return n;
    }
    return n;
  }

  // ---------------------------------------------------------------- the questions
  // the column under a solid cell reaches the floor (or a bulkhead or pad) without a gap
  colHeld(i, j, k) {
    const col = this.w.col(i >> 4, k >> 4), sp = col.sp, base = (k & 15) * 16 + (i & 15);
    for (let jj = j; jj >= 0; jj--) { const s = sp[jj * 256 + base]; if (!s) return false; if (s === BULK || s === PAD) return true; }
    return true;
  }
  // a cheap proof that a solid cell is part of the pile: its own column, or one of the four columns reached by walking along the cell's level
  quickHeld(i, j, k) {
    const w = this.w;
    if (this.colHeld(i, j, k)) return true;
    for (let d = 2; d < 6; d++) {
      const di = DI[d], dk = DK[d];
      for (let n = 1; n <= RAY_REACH; n++) {
        const ci = i + di * n, ck = k + dk * n;
        if (ci < 0 || ci >= NX || ck < 0 || ck >= NZ) return true;       // the hall wall holds it
        const s = w.get(ci, j, ck);
        if (!s) break;
        if (s === BULK || s === PAD || this.colHeld(ci, j, ck)) return true;
      }
    }
    return false;
  }
  // the whole group a cell belongs to. Returns ATT when it is held, or the number of cells (in this.ord, 3 ints each) of an island. this.lastN is how many cells the search visited.
  flood(i0, j0, k0) {
    const w = this.w, hk = this.hk, hs = this.hs, st = this.st, ord = this.ord;
    let stamp = ++this.stamp; if (stamp > 4294967000) { hs.fill(0); this.stamp = stamp = 1; }
    const t0 = now();
    let sp = 0, n = 0;
    const mark = (i, j, k) => {
      const key = kOf(i, j, k);
      let h = ((i * 73856093) ^ (j * 19349663) ^ (k * 83492791)) & HMASK;
      while (hs[h] === stamp) { if (hk[h] === key) return false; h = (h + 1) & HMASK; }
      hs[h] = stamp; hk[h] = key; return true;
    };
    mark(i0, j0, k0); st[0] = i0; st[1] = j0; st[2] = k0; sp = 1;
    let held = false;
    while (sp > 0) {
      sp--; const i = st[sp * 3], j = st[sp * 3 + 1], k = st[sp * 3 + 2];
      ord[n * 3] = i; ord[n * 3 + 1] = j; ord[n * 3 + 2] = k; n++;
      if (j === 0 || i === 0 || i === NX - 1 || k === 0 || k === NZ - 1 || this.colHeld(i, j, k)) { held = true; this.why = [j === 0 ? 'floor' : i === 0 || i === NX - 1 || k === 0 || k === NZ - 1 ? 'edge' : 'column', i, j, k]; break; }
      if (n >= ISLAND_CAP) { held = true; this.why = ['cap', i, j, k]; this.stats.capped++; break; }
      for (let d = 0; d < 6; d++) {
        const ni = i + DI[d], nj = j + DJ[d], nk = k + DK[d];
        if (nj < 0 || nj >= NY || ni < 0 || ni >= NX || nk < 0 || nk >= NZ) continue;
        if (!w.get(ni, nj, nk)) continue;
        if (mark(ni, nj, nk)) { st[sp * 3] = ni; st[sp * 3 + 1] = nj; st[sp * 3 + 2] = nk; sp++; }
      }
    }
    this.lastN = n; this.stats.floods++; this.stats.visited += n;
    if (!held) {   // a group of nothing but caches and remains has no plush to drop: it stays where it is (and is not asked about again)
      let plush = false; for (let q = 0; q < n && !plush; q++) if (!isSpecialCell(w.get(ord[q * 3], ord[q * 3 + 1], ord[q * 3 + 2]))) plush = true;
      if (!plush) { held = true; this.why = ['specials']; }
      else if (n <= 64) {   // a plush or two that came to rest on a cache or remains left hanging by an earlier fall: they stay (else they would fall onto it again for ever)
        for (let q = 0; q < n && !held; q++) { const b = w.get(ord[q * 3], ord[q * 3 + 1] - 1, ord[q * 3 + 2]); if (b === CACHE || b === REMAINS) { held = true; this.why = ['on a cache']; } }
      }
    }
    if (!held && w.supports.length) {            // a frame, a prop or a stack reaches into the group: it is held (the same reach the roof rules use)
      for (let q = 0; q < n; q++) if (w.supportBonus(cellX(ord[q * 3]), cellY(ord[q * 3 + 1]), cellZ(ord[q * 3 + 2])) > 0) { held = true; this.why = ['support', ord[q * 3], ord[q * 3 + 1], ord[q * 3 + 2]]; break; }
    }
    const ms = now() - t0; if (ms > this.stats.maxFloodMs) this.stats.maxFloodMs = ms;
    return held ? ATT : n;
  }
  // a seed's verdict: ATT (held), 0 (not a plush), or the size of an island left in this.ord
  analyze(i, j, k) {
    const w = this.w;
    this.lastN = 0;   // (a verdict from the cheap tests leaves no group behind in this.ord: callers read lastN only after a search, and a stale one marked a whole older slab as held)
    const s = w.get(i, j, k); if (!s) return 0;
    if (j <= 0 || s === BULK || s === PAD) return ATT;
    const key = kOf(i, j, k);
    if (this.att.has(key)) return ATT;
    if (this.quickHeld(i, j, k)) { this.stats.quick++; this.att.add(key); this.why = ['quick', i, j, k]; return ATT; }
    const r = this.flood(i, j, k);
    if (r === ATT) { const o = this.ord; for (let q = 0; q < this.lastN; q++) this.att.add(kOf(o[q * 3], o[q * 3 + 1], o[q * 3 + 2])); }
    return r;
  }
  // test hook: is this plush part of an island right now (no queue, no timers, nothing registered)
  isIsland(i, j, k) { this.att.clear(); const r = this.analyze(i, j, k); return r > 0 ? r : 0; }

  // ---------------------------------------------------------------- the per tick work
  update(dt, warn, hooks) {
    if (this.off || !hooks || !hooks.releaseIsland) { this.q.length = 0; this.qh = 0; this.qSet.clear(); return; }
    const t0 = now();
    this.att.clear();
    this.drain(this.budgetMs, warn, hooks);
    if (this.scan) this.scanStep(this.scanMs, warn, hooks);
    if (this.list.size) this.tickIslands(dt, hooks);
    const ms = now() - t0; this.stats.ms = ms; if (ms > this.stats.maxMs) this.stats.maxMs = ms;
  }
  // settle the seeds at once (tests and tools); returns how many islands were registered
  settle(warn = 1.1, hooks = null, maxMs = 1e9) {
    const n0 = this.list.size; this.att.clear();
    if (hooks) this.drain(maxMs, warn, hooks);
    return this.list.size - n0;
  }
  drain(ms, warn, hooks) {
    const t0 = now(); let n = 0;
    let fl = this.stats.floods;
    while (this.qh < this.q.length) {
      if (((n & 15) === 15 || this.stats.floods !== fl) && now() - t0 > ms) break;   // (a search can cost a whole flood: the clock is read after every one, not every 16th seed)
      fl = this.stats.floods;
      const key = this.q[this.qh++]; this.qSet.delete(key); n++;
      const i = key % NX, q1 = Math.floor(key / NX), k = q1 % NZ, j = Math.floor(q1 / NZ);
      this.stats.seeds++;
      this.seed(i, j, k, warn, hooks);
    }
    if (this.qh > 2048 && this.qh * 2 > this.q.length) { this.q = this.q.slice(this.qh); this.qh = 0; }
    else if (this.qh >= this.q.length) { this.q.length = 0; this.qh = 0; }
  }
  seed(i, j, k, warn, hooks) {
    if (this.cellIsl.has(kOf(i, j, k))) return;
    const n = this.analyze(i, j, k);
    if (n > 0) this.register(n, warn, hooks);
  }

  // ---------------------------------------------------------------- an island found
  register(n, warn, hooks) {
    const w = this.w, ord = this.ord;
    let minJ = 1e9, maxJ = -1, i0 = 1e9, i1 = -1, k0 = 1e9, k1 = -1, sx = 0, sy = 0, sz = 0;
    for (let q = 0; q < n; q++) {
      const i = ord[q * 3], j = ord[q * 3 + 1], k = ord[q * 3 + 2];
      if (j < minJ) minJ = j; if (j > maxJ) maxJ = j; if (i < i0) i0 = i; if (i > i1) i1 = i; if (k < k0) k0 = k; if (k > k1) k1 = k; sx += i; sy += j; sz += k;
    }
    // bottom first: the underside lets go, then what stood on it
    const span = maxJ - minJ + 1, cnt = new Int32Array(span + 1);
    for (let q = 0; q < n; q++) cnt[ord[q * 3 + 1] - minJ + 1]++;
    for (let s = 1; s <= span; s++) cnt[s] += cnt[s - 1];
    const cells = new Int32Array(3 * n);
    for (let q = 0; q < n; q++) { const at = cnt[ord[q * 3 + 1] - minJ]++; cells[at * 3] = ord[q * 3]; cells[at * 3 + 1] = ord[q * 3 + 1]; cells[at * 3 + 2] = ord[q * 3 + 2]; }
    let delay = Math.min(DELAY_MAX, Math.max(DELAY_MIN, DELAY_MIN + n * DELAY_PER_CELL)) * Math.min(2, Math.max(1, warn / 1.1));
    // a slab found again after more digging (it joined one already waiting) keeps the shorter wait
    const merged = new Set();
    for (let q = 0; q < n; q++) { const o = this.cellIsl.get(kOf(cells[q * 3], cells[q * 3 + 1], cells[q * 3 + 2])); if (o) merged.add(o); }
    for (const o of merged) if (o.state !== 'wait') return null;   // it hangs on a slab that is already falling: the slab's own re-check picks the rest up when it is down
    for (const o of merged) { delay = Math.min(delay, o.t); this.unregister(o); }
    const isl = {
      id: this.nextId++, n, cells, from: 0, state: 'wait', t: delay, delay, age: 0, fxT: 0.25, marks: [],
      i0, i1, k0, k1, j0: minJ, j1: maxJ,
      x: cellX(Math.round(sx / n)), y: cellY(Math.round(sy / n)), z: cellZ(Math.round(sz / n)),
    };
    this.list.set(isl.id, isl);
    for (let q = 0; q < n; q++) this.cellIsl.set(kOf(cells[q * 3], cells[q * 3 + 1], cells[q * 3 + 2]), isl);
    // creaking markers on the underside: the HUD warning, the dust near the player and the guest's creak all read world.creaking
    isl.quiet = n < QUIET_N;
    let nb = 0; while (!isl.quiet && nb < n && cells[nb * 3 + 1] <= minJ + 1) nb++;
    const stride = Math.max(1, Math.floor(nb / MAX_SAMPLE));
    for (let q = 0; q < nb && isl.marks.length < MAX_SAMPLE; q += stride) {
      const i = cells[q * 3], j = cells[q * 3 + 1], k = cells[q * 3 + 2];
      const id = (j * NZ + k) * NX + i;
      if (w.creaking.has(id) || isSpecialCell(w.get(i, j, k))) continue;
      w.creaking.set(id, { i, j, k, t: delay + 0.5, isl: isl.id });
      isl.marks.push(id);
      if (w.onCreakCell) w.onCreakCell(i, j, k);
    }
    this.stats.islands++;
    if (globalThis.__islLog && globalThis.__islLog.length < 400) globalThis.__islLog.push([n, i0, minJ, k0, new Error().stack.split('\n').slice(2, 5).join(' < ')]);   // dev tool: which test or tool cut something off
    if (!isl.quiet && hooks.onIsland) hooks.onIsland(isl);
    return isl;
  }
  unregister(isl) {
    const c = isl.cells;
    for (let q = 0; q < isl.n; q++) { const key = kOf(c[q * 3], c[q * 3 + 1], c[q * 3 + 2]); if (this.cellIsl.get(key) === isl) this.cellIsl.delete(key); }
    for (const id of isl.marks) { const m = this.w.creaking.get(id); if (m && m.isl === isl.id) this.w.creaking.delete(id); }
    isl.marks.length = 0;
    this.list.delete(isl.id);
  }

  tickIslands(dt, hooks) {
    for (const isl of [...this.list.values()]) {
      if (isl.state === 'wait') {
        isl.age += dt; isl.t -= dt; isl.fxT -= dt;
        for (const id of isl.marks) { const m = this.w.creaking.get(id); if (m) m.t = Math.max(m.t, 0.3); }   // the markers outlive the wait (the roof loop never lets go of them)
        if (isl.fxT <= 0) { isl.fxT = 0.35 + Math.random() * 0.3; if (!isl.quiet && hooks.onIslandFx) hooks.onIslandFx(isl); }
        if (isl.t <= 0) this.letGo(isl, hooks);
      } else this.fall(isl, hooks);
    }
  }
  // the wait is over: look again. Cells dug away since are gone; a support, a pad or a dig back into the pile may hold the rest.
  letGo(isl, hooks) {
    const w = this.w;
    this.att.clear();
    const keep = []; const seen = new Set();
    const c = isl.cells;
    for (let q = 0; q < isl.n; q++) {
      const i = c[q * 3], j = c[q * 3 + 1], k = c[q * 3 + 2];
      const key = kOf(i, j, k);
      if (seen.has(key) || !w.get(i, j, k)) continue;
      const r = this.analyze(i, j, k);
      const o = this.ord;
      if (r === ATT) { isl.savedBy = this.why; seen.add(key); for (let m = 0; m < this.lastN; m++) seen.add(kOf(o[m * 3], o[m * 3 + 1], o[m * 3 + 2])); continue; }
      for (let m = 0; m < r; m++) { keep.push(o[m * 3], o[m * 3 + 1], o[m * 3 + 2]); seen.add(kOf(o[m * 3], o[m * 3 + 1], o[m * 3 + 2])); }
    }
    this.unregisterCells(isl);
    if (!keep.length) { this.finish(isl, false); return; }
    // the survivors fall (bottom first). They are one group or several, all cut off.
    const n = keep.length / 3, ord = Int32Array.from(keep), idx = Array.from({ length: n }, (_, q) => q).sort((a, b) => ord[a * 3 + 1] - ord[b * 3 + 1]);
    const cells = new Int32Array(3 * n);
    for (let q = 0; q < n; q++) { cells[q * 3] = ord[idx[q] * 3]; cells[q * 3 + 1] = ord[idx[q] * 3 + 1]; cells[q * 3 + 2] = ord[idx[q] * 3 + 2]; }
    isl.cells = cells; isl.n = n; isl.from = 0; isl.state = 'fall';
    for (let q = 0; q < n; q++) this.cellIsl.set(kOf(cells[q * 3], cells[q * 3 + 1], cells[q * 3 + 2]), isl);
    this.fall(isl, hooks);
  }
  unregisterCells(isl) {
    const c = isl.cells;
    for (let q = 0; q < isl.n; q++) { const key = kOf(c[q * 3], c[q * 3 + 1], c[q * 3 + 2]); if (this.cellIsl.get(key) === isl) this.cellIsl.delete(key); }
    for (const id of isl.marks) { const m = this.w.creaking.get(id); if (m && m.isl === isl.id) this.w.creaking.delete(id); }
    isl.marks.length = 0;
  }
  // hand the cells to the game a batch at a time (the loose body limit decides how many)
  fall(isl, hooks) {
    const from = hooks.releaseIsland(isl.cells, isl.from, isl.n, isl);
    this.stats.released += Math.max(0, from - isl.from);
    isl.from = Math.max(isl.from, from);
    if (isl.from >= isl.n) this.finish(isl, true);
  }
  finish(isl, fell) {
    const w = this.w, c = isl.cells;
    this.unregister(isl);
    if (!fell) this.lastSaved = isl.savedBy || ['nothing was left'];
    // what hung on the slab, and what it hung over, is looked at again: the roof under it, the rim it tore away from, the pile it dropped on. (A slab that was saved is asked about as well: while it
    // waited, the roof rule left its cells alone, so a cell that was overloaded the whole time has never been looked at.)
    const step = Math.max(1, Math.floor(isl.n / 160));
    for (let q = 0; q < isl.n; q += step) w.stabQueue.push({ i: c[q * 3], j: c[q * 3 + 1], k: c[q * 3 + 2] });
  }

  // ---------------------------------------------------------------- after a load
  // A saved world may hold a slab that was cut off (the player saved during the wait, or an older version never checked). Every edit in the save is a seed, spread over many ticks.
  afterLoad() {
    const w = this.w;
    this.scan = { keys: [...w.diffCols.keys()], ki: 0, it: null, cx: 0, cz: 0, done: 0 };
  }
  scanStep(ms, warn, hooks) {
    const s = this.scan, w = this.w, t0 = now(); let n = 0;
    const NCX = NX >> 4;
    while (s) {
      if (!s.it) {
        if (s.ki >= s.keys.length) { this.scan = null; return; }
        const key = s.keys[s.ki++], d = w.diffCols.get(key); if (!d) continue;
        s.cx = key % NCX; s.cz = Math.floor(key / NCX); s.it = d.entries();
      }
      const e = s.it.next();
      if (e.done) { s.it = null; continue; }
      const b = e.value[0], li = b & 15, lk = (b >> 4) & 15, j = b >> 8, i = s.cx * 16 + li, k = s.cz * 16 + lk;
      this.seedAround(i, j, k, warn, hooks);
      s.done++;
      if ((++n & 31) === 31 && now() - t0 > ms) return;
    }
  }
  seedAround(i, j, k, warn, hooks) {
    const cs = [[i, j, k]]; for (let d = 0; d < 6; d++) cs.push([i + DI[d], j + DJ[d], k + DK[d]]);
    for (const [a, b, c] of cs) {
      if (b <= 0 || b >= NY || a < 0 || a >= NX || c < 0 || c >= NZ) continue;
      this.seed(a, b, c, warn, hooks);
    }
  }
}

export { isSpecialCell };
