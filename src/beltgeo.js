// The bend of a belt: a real quarter circle (an annulus sector) of deck and two curved rails, not three straight beds fanned round a corner. One piece turns inside one cell,
// on the same circle as the Vacuum Hose bend (hosegeo.js: centre at the cell's inner corner, 0.3 m radius, from the middle of one edge to the middle of the next), so the
// bed spans 0.05 m to 0.55 m from the centre, as wide as the straight bed (0.5 m), and the rails stand where the straight rails do (0.27 m either side of the centre line).
// Canonical frame (the same as hosegeo.bendGeometry): circle centre at the origin, the belt starts at (R, 0, 0) heading +Z and ends at (0, 0, R) heading -X; `left` mirrors it
// (so both turns are drawn with a proper rotation, never a mirrored matrix). Heights are relative to the middle of the bed (the straight bed box is 0.05 thick).
// The deck's texture runs along the curve and its v falls the way plush travel (the same direction as on a straight bed, whose chevrons point forward and slide forward).
import * as THREE from 'three';
import { C } from './config.js';

export const R_BEND = C * 0.5;
export const BED_HALF = 0.25, RAIL_OFF = 0.27, BED_T = 0.025;
const N = 14;
const V_SPAN = (Math.PI / 2 * R_BEND) / C;   // the centre line is this many belt lengths long: the texture repeats once per cell length

// sweep profiles round the circle. A profile is a list of { r, y, nr, ny, u } points (r: radius, nr/ny: the normal's radial and vertical part, u: texture across);
// walls = true samples one dark spot of the texture instead of running it along
function sweep(left, profiles) {
  const sx = left ? -1 : 1, pos = [], nor = [], uv = [], idx = [];
  for (const { pts, walls } of profiles) {
    const base = pos.length / 3, K = pts.length;
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI / 2, c = Math.cos(th), s = Math.sin(th), v = 1 - V_SPAN * (i / N);
      for (const p of pts) { pos.push(sx * p.r * c, p.y, p.r * s); nor.push(sx * p.nr * c, p.ny, p.nr * s); uv.push(walls ? 0.05 : p.u, walls ? 0.5 : v); }
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < K - 1; k++) {
      const a = base + i * K + k, b = a + 1, c2 = a + K, d = c2 + 1;
      for (const t of [[a, b, c2], [b, d, c2]]) {   // wind each triangle so it faces the way the vertex normal does
        const [p, q, r] = t, ux = pos[q * 3] - pos[p * 3], uy = pos[q * 3 + 1] - pos[p * 3 + 1], uz = pos[q * 3 + 2] - pos[p * 3 + 2], wx = pos[r * 3] - pos[p * 3], wy = pos[r * 3 + 1] - pos[p * 3 + 1], wz = pos[r * 3 + 2] - pos[p * 3 + 2];
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        if (nx * nor[p * 3] + ny * nor[p * 3 + 1] + nz * nor[p * 3 + 2] >= 0) idx.push(p, q, r); else idx.push(p, r, q);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

// the deck: the top face (textured), and the inner and outer walls
export function bendBedGeometry(left) {
  const ri = R_BEND - BED_HALF, ro = R_BEND + BED_HALF, t = BED_T;
  return sweep(left, [
    { pts: [{ r: ri, y: t, nr: 0, ny: 1, u: 0 }, { r: ro, y: t, nr: 0, ny: 1, u: 1 }] },
    { pts: [{ r: ri, y: t, nr: -1, ny: 0, u: 0 }, { r: ri, y: -t, nr: -1, ny: 0, u: 0 }], walls: true },
    { pts: [{ r: ro, y: -t, nr: 1, ny: 0, u: 0 }, { r: ro, y: t, nr: 1, ny: 0, u: 0 }], walls: true },
  ]);
}

// the two rails (0.04 wide, 0.1 high, the way the straight rails stand: from 0.01 below the middle of the bed to 0.09 above it)
export function bendRailGeometry(left) {
  const prof = [];
  for (const rc of [R_BEND - RAIL_OFF, R_BEND + RAIL_OFF]) {
    const a = rc - 0.02, b = rc + 0.02, y0 = -0.01, y1 = 0.09;
    prof.push({ pts: [{ r: b, y: y0, nr: 1, ny: 0, u: 0 }, { r: b, y: y1, nr: 1, ny: 0, u: 0 }], walls: true });
    prof.push({ pts: [{ r: b, y: y1, nr: 0, ny: 1, u: 0 }, { r: a, y: y1, nr: 0, ny: 1, u: 0 }], walls: true });
    prof.push({ pts: [{ r: a, y: y1, nr: -1, ny: 0, u: 0 }, { r: a, y: y0, nr: -1, ny: 0, u: 0 }], walls: true });
  }
  return sweep(left, prof);
}
