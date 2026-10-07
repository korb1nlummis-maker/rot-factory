// holelight.audit.* (soak): daylight through holes against an independent reference and under random edits (auditor of the daylight wave).
//  - the reference below is written from the rule in the header of holelight.js using only world.get (it never calls topAt or any holelight function), so a mistake shared by
//    the two evaluators of holelight.js (the camera's holeAt and the chunk field windowFor) cannot hide behind their agreeing with each other
//  - world.topAt is checked against the cells after every batch of edits (the light reads nothing else about a column)
//  - what the real remesh bakes into each plush (render.js scanChunk, both depths) is compared with the reference too, so the box that trims the field lookups cannot lose light
import * as HL from '../holelight.js';
import { NY } from '../config.js';
import { mulberry32 } from '../util.js';
import { PAD, BULK } from '../plushdata.js';
import { kit as hlKit } from './holelight_lib.js';

export default async function (ctx) {
  const { T, g, newWorld, fresh } = ctx;
  const K = hlKit(ctx), W = K.W;
  const HT = (name, fn) => T(name, async () => { await newWorld(); fresh({}); g.hall.level = 1; g._entr = null; try { return await fn(); } finally { g.hall.level = 1; } });

  // ---------------------------------------------------------------- the reference (cells only)
  const mk = (w) => {
    const topC = new Map(), top = (i, k) => { const key = k * 16384 + i; let t = topC.get(key); if (t === undefined) { t = NY; while (t > 0 && w.get(i, t - 1, k) === 0) t--; topC.set(key, t); } return t; };
    const O4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const strength = (D) => { const t = Math.min(1, Math.max(0, (D - 12) / 16)); return 1 - 0.75 * t * t * (3 - 2 * t); };
    // the top level of the hole in this column, or -1, and the rim
    const hole = (i, k) => {
      const t = top(i, k); let walls = 0, rim = 0, wall = 1e9;
      for (const [a, b] of O4) if (top(i + a, k + b) >= t + 2) walls++;
      if (walls < 2) return null;
      for (const [a, b] of D8) { const n1 = top(i + a, k + b), n2 = top(i + 2 * a, k + 2 * b); rim = Math.max(rim, n1); wall = Math.min(wall, Math.max(n1, n2)); }
      const jt = Math.min(rim - 3, wall - 2);
      return jt >= t ? { jt, rim } : null;
    };
    const air = (i, j, k) => w.get(i, j, k) === 0;
    const own = (i, j, k) => { if (j < top(i, k)) return 0; const h = hole(i, k); return h && h.jt >= j ? strength(h.rim - j) : 0; };   // a cell open to the hall
    // the light at an air cell
    const at = (i, j, k) => {
      if (j < 0 || j >= NY || !air(i, j, k)) return 0;
      if (j >= top(i, k)) return own(i, j, k);
      const dist = new Map([[k * 16384 + i, 0]]); let wave = [[i, k]];
      for (let d = 0; d < 6; d++) {
        const next = []; let best = 0;
        for (const [ci, ck] of wave) for (const [a, b] of D8) {
          const ni = ci + a, nk = ck + b, key = nk * 16384 + ni;
          if (dist.has(key)) continue;
          if (a && b && !(air(ni, j, ck) && air(ci, j, nk))) continue;   // no cutting the corner of a solid cell
          dist.set(key, d + 1);
          if (!air(ni, j, nk)) continue;
          if (j >= top(ni, nk)) { best = Math.max(best, own(ni, j, nk)); continue; }   // open to the hall: a hole cell gives its light, any other is a dead end
          next.push([ni, nk]);
        }
        if (best > 0) return best * Math.pow(1 - (d + 1) / 7, 3);
        wave = next; if (!wave.length) break;
      }
      return 0;
    };
    return { top, at, hole };
  };

  // the cells of the scene to look at: a box round the rig
  const box = (r, pad = 9) => ({ i0: r.i0 - pad, i1: r.i1 + pad, k0: r.k0 - pad, k1: r.k0 + r.wide + pad, j1: r.T0 + 2 });

  // random edits near the tunnel and the shaft, with the kinds of thing a player does: dig, fill, lay a plate or a wall section, open a new shaft, plug a tunnel
  const edit = (r, rnd, n) => {
    const w = W(), b = box(r, 5), pick = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
    for (let q = 0; q < n; q++) {
      const roll = rnd(), i = pick(b.i0, b.i1), k = pick(b.k0, b.k1), j = roll < 0.7 ? pick(0, r.rows + 4) : pick(0, b.j1);
      if (roll < 0.30) { if (w.get(i, j, k)) w.removeCell(i, j, k, false); }
      else if (roll < 0.45) { if (!w.get(i, j, k)) w.setCell(i, j, k, 5, 0); }
      else if (roll < 0.55) { if (!w.get(i, j, k)) w.setCell(i, j, k, PAD, 17); }
      else if (roll < 0.62) { if (!w.get(i, j, k)) w.setCell(i, j, k, BULK, 240); }
      else if (roll < 0.80) { const t = w.topAt(i, k); for (let jj = j; jj < t; jj++) if (w.get(i, jj, k)) w.removeCell(i, jj, k, false); }   // a shaft from here up and out
      else if (roll < 0.88) { const t = w.topAt(i, k); for (let jj = Math.max(0, t - 3); jj < t + 1 && jj < b.j1; jj++) if (!w.get(i, jj, k)) w.setCell(i, jj, k, 5, 0); }   // a cap at the top of a column
      else if (roll < 0.94) { const t = w.topAt(i, k); if (t > 0) w.removeCell(i, t - 1, k, false); }                    // skim the top of a column
      else { for (let kk = r.k0; kk < r.k0 + r.wide; kk++) for (let jj = 0; jj < r.rows; jj++) if (!w.get(i, jj, kk)) w.setCell(i, jj, kk, 5, 0); }   // a plug across the tunnel
    }
  };

  // what the reference says every plush of the scene should have baked in (the same rules as aroundField of render.js: the best light of the 26 neighbours, 0.8 off a face)
  const bakedRef = (ref, i, j, k) => {
    let best = 0;
    for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj && !dk) continue;
      const w2 = ((di && dj ? 0 : 1) * (di && dk ? 0 : 1) * (dj && dk ? 0 : 1)) ? 1 : 0.8;
      const h = ref.at(i + di, j + dj, k + dk); if (h * w2 > best) best = h * w2;
    }
    return Math.min(1, best);
  };

  const compare = (r, ref, label, bad, lim = 6) => {
    const w = W(), b = box(r); let cells = 0, lit = 0;
    // 1. world.topAt against the cells
    for (let k = b.k0; k <= b.k1; k++) for (let i = b.i0; i <= b.i1; i++) if (w.topAt(i, k) !== ref.top(i, k)) { bad.push(`${label}: topAt ${i},${k} is ${w.topAt(i, k)}, the cells say ${ref.top(i, k)}`); if (bad.length >= lim) return { cells, lit }; }
    // 2. the camera's evaluator and the chunk field against the reference, on every air cell of the box
    const S = HL.makeScratch();
    for (const [cx, cy, cz] of K.chunksOf({ i0: b.i0, i1: b.i1, k0: b.k0, wide: b.k1 - b.k0 }, 0)) {
      const F = HL.windowFor(w, cx * 16, cy * 16, cz * 16, S);
      for (let jj = 0; jj < 18; jj++) for (let z = HL.HOLE_R + 2; z < HL.HOLE_R + 19; z++) for (let x = HL.HOLE_R + 2; x < HL.HOLE_R + 19; x++) {
        const i = cx * 16 - 9 + x, k = cz * 16 - 9 + z, j = cy * 16 - 1 + jj;
        if (j < 0 || j >= NY || i < b.i0 || i > b.i1 || k < b.k0 || k > b.k1 || j > b.j1) continue;
        const want = ref.at(i, j, k), cell = HL.holeAt(w, i, j, k), field = F.on && F.hf ? F.hf[(jj * F.Wd + z) * F.Wd + x] : 0;
        if (w.get(i, j, k) === 0) { cells++; if (want > 0) lit++; }
        if (Math.abs(cell - want) > 1e-6) { bad.push(`${label}: holeAt ${i},${j},${k} is ${cell.toFixed(4)}, the reference says ${want.toFixed(4)}`); if (bad.length >= lim) return { cells, lit }; }
        if (Math.abs(field - want) > 1e-6 && w.get(i, j, k) === 0) { bad.push(`${label}: field ${i},${j},${k} is ${field.toFixed(4)}, the reference says ${want.toFixed(4)}`); if (bad.length >= lim) return { cells, lit }; }
      }
    }
    // 3. what the remesh bakes into each plush, shallow and deep
    for (const deep of [false, true]) {
      const m = new Map();
      for (const [cx, cy, cz] of K.chunksOf({ i0: b.i0, i1: b.i1, k0: b.k0, wide: b.k1 - b.k0 }, 0)) K.readChunk(g.renderer.scanChunk(cx, cy, cz, deep), m);
      for (const [key, e] of m) {
        const [i, j, k] = key.split(',').map(Number);
        if (i < b.i0 + 1 || i > b.i1 - 1 || k < b.k0 + 1 || k > b.k1 - 1 || j > b.j1) continue;
        const want = bakedRef(ref, i, j, k);
        if (Math.abs(e.hole - want) > 1e-5) { bad.push(`${label}: the remesh (deep ${deep}) bakes ${e.hole.toFixed(4)} at plush ${key}, the reference says ${want.toFixed(4)}`); if (bad.length >= lim) return { cells, lit }; }
      }
    }
    return { cells, lit };
  };

  for (const seed of [11, 202, 3003]) {
    await HT('holelight.audit.soak-random-edits-match-the-reference-seed-' + seed, async () => {
      const rnd = mulberry32(seed), bad = [];
      const r = K.rig({ depth: 9 + (seed % 5), right: 12 + (seed % 7), wide: 3 + (seed % 3) });
      let lit = 0, cells = 0;
      for (let round = 0; round < 7 && bad.length < 6; round++) {
        if (round) edit(r, rnd, 18 + Math.floor(rnd() * 25));
        const ref = mk(W()), c = compare(r, ref, 'round ' + round, bad); lit += c.lit; cells += c.cells;
      }
      if (!(lit > 100)) bad.push(`only ${lit} lit air cells in ${cells} over the soak: the scenes prove little`);
      return bad.length === 0 || bad.join('; ');
    });
  }
}
