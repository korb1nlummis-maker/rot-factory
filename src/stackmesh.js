// Meshes for stacked building (wave 10): the ladder and the guard rails round the openings of a plate. No game imports (stack.js owns the logic).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C } from './config.js';
import { KIND_COLOR } from './buildmesh.js';

const mat = (color, rough = 0.5, metal = 0.6) => { const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); m.__shared = true; return m; };
const RAIL = mat(0x59636e, 0.45, 0.8), RUNG = mat(0xc9ccd1, 0.35, 0.8), YEL = mat(0xe8b81c, 0.5, 0.3);
const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const merged = (parts, m) => { const g = mergeGeometries(parts, false); parts.forEach((p) => p.dispose()); return new THREE.Mesh(g, m); };

const FACE = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// a ladder: two side rails and a rung every 0.3 m, fixed to the face of its cell that looks at `dir`. Local origin: the middle of the cell's floor, y up.
export function ladderObject(e) {
  const grp = new THREE.Group(), H = 4 * C + 0.95, [fx, fz] = FACE[(e.dir | 0) & 3];
  const off = C / 2 - 0.05, w = 0.24, parts = [], rungs = [];
  const across = (a, b) => (fx !== 0 ? box(a, b, 0.035, 0, 0, 0) : box(0.035, b, a, 0, 0, 0));
  void across;
  const px = fx * off, pz = fz * off, ax = fz !== 0 ? 1 : 0, az = fx !== 0 ? 1 : 0;   // the rails sit either side of the cell's middle line
  for (const s of [-1, 1]) parts.push(box(0.04, H, 0.04, px + ax * s * w, H / 2, pz + az * s * w));
  const n = Math.floor(H / 0.3);
  for (let q = 0; q < n; q++) rungs.push(fx !== 0 ? box(0.03, 0.03, w * 2, px, 0.18 + q * 0.3, pz) : box(w * 2, 0.03, 0.03, px, 0.18 + q * 0.3, pz));
  const r = merged(parts, YEL); r.name = 'ladder-rails'; grp.add(r);
  const u = merged(rungs, RUNG); u.name = 'ladder-rungs'; grp.add(u);
  return grp;
}

// guard rails along the inner edges of a plate's opening. cells: the plate's non-hole cells as a Set of 'dx,dz'; holes: the hole cells. Local origin: the plate's min corner at its floor row; the plate top is at y = C.
export function holeRails(cells, holes, mk) {
  const grp = new THREE.Group(), parts = [], H = 0.95, t = 0.04, y0 = C;
  const post = (x, z) => parts.push(box(t, H, t, x, y0 + H / 2, z));
  const bar = (x, z, sx, sz, y) => parts.push(box(sx, t, sz, x, y0 + y, z));
  for (const key of holes) {
    const [dx, dz] = key.split(',').map(Number);
    for (let d = 0; d < 4; d++) {
      const nx = dx + FACE[d][0], nz = dz + FACE[d][1];
      if (!cells.has(nx + ',' + nz)) continue;   // only the edge that touches plate
      const cx = (dx + 0.5) * C, cz = (dz + 0.5) * C, ex = cx + FACE[d][0] * C / 2, ez = cz + FACE[d][1] * C / 2;
      if (FACE[d][0] !== 0) { post(ex, cz - C / 2 + 0.04); post(ex, cz + C / 2 - 0.04); bar(ex, cz, t, C, H - t / 2); bar(ex, cz, t * 0.8, C, H * 0.5); }
      else { post(cx - C / 2 + 0.04, ez); post(cx + C / 2 - 0.04, ez); bar(cx, ez, C, t, H - t / 2); bar(cx, ez, C, t * 0.8, H * 0.5); }
    }
  }
  if (parts.length) { const m = merged(parts, RAIL); m.name = 'holerails'; grp.add(m); }
  grp.userData.holeRails = true;
  void mk; void KIND_COLOR;
  return grp;
}
