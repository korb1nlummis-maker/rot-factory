// Block by block load tracing, in the spirit of 7 Days to Die's structural integrity.
// Every plush that roofs a gap carries the weight of the pile above it, and that weight is pressed harder the deeper into the
// mountain it is (PRESS metres from the start doubles it). A roof cell hands its weight to the supports whose reach covers it,
// sharing equally when several do. A support that ends up carrying more than it can bear buckles, and its share drops onto its
// neighbours, which may buckle in turn.
import { C, cellX, cellY, cellZ, toI, toJ, toK } from './config.js';
import { FRAME_TYPES, STRUT_DEPTH } from './upgrades.js';

export const BASE_LOAD = 2150;   // a frame is rated for a standard 4 wide tunnel (about 32 roof cells under 60 cells of pile) at its rated depth
export const PRESS = 150;        // metres of depth that add 100% to the weight of the pile
export const MAX_OVER = 64;      // cells of pile above a roof cell that still add weight
export const WARN_AT = 0.85;

export const pressure = (x, z) => 1 + Math.hypot(x, z) / PRESS;
const press = (d) => 1 + d / PRESS;

// capacity in load units. Derived from the depth rating so the two always agree.
export function capacityOf(kind) {
  if (FRAME_TYPES[kind]) { const f = FRAME_TYPES[kind]; return isFinite(f.maxDepth) ? BASE_LOAD * (f.radius / 2.5) * press(f.maxDepth) : Infinity; } // a longer reach carries the roof of a longer stretch of tunnel
  if (kind === 'jack') return 800 * press(STRUT_DEPTH.jack);
  return 480 * press(STRUT_DEPTH.strut);
}

const inside = (s, x, y, z) => { const dx = x - s.x, dy = y - s.y, dz = z - s.z; return dx * dx + dy * dy + dz * dz < s.r * s.r; };

// the load a support s carries now. `others` can add supports that are not placed yet (for previews).
export function loadOn(w, s, others = []) {
  const near = [];
  for (const o of w.supports) if (o !== s && o.cap !== undefined && o.id !== s.id && Math.hypot(o.x - s.x, o.z - s.z) < s.r + 9.4) near.push(o);
  for (const o of others) near.push(o);
  const ci = toI(s.x), ck = toK(s.z), rc = Math.ceil(s.r / C) + 1;
  const j0 = Math.max(1, toJ(s.y - s.r)), j1 = toJ(s.y + s.r) + 1;
  let load = 0;
  for (let k = ck - rc; k <= ck + rc; k++) for (let i = ci - rc; i <= ci + rc; i++) {
    const top = w.topAt(i, k); if (top <= j0) continue;
    const x = cellX(i), z = cellZ(k); const pr = press(Math.hypot(x, z));
    for (let j = j0; j <= j1 && j < top; j++) {
      if (!w.solid(i, j, k) || w.solid(i, j - 1, k)) continue;      // only a roof: solid with a gap under it
      const y = cellY(j);
      if (!inside(s, x, y, z)) continue;
      let n = 1; for (const o of near) if (inside(o, x, y, z)) n++;
      load += (Math.min(MAX_OVER, Math.max(0, top - j - 1)) + 1) * pr / n;
    }
  }
  return load;
}

export function ratioOf(w, s, others) { const cap = s.cap === undefined ? capacityOf(s.kind) : s.cap; return isFinite(cap) ? loadOn(w, s, others) / cap : 0; }
