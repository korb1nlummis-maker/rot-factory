// The look of a Vacuum Hose: one ribbed tube per straight piece, a real quarter-circle bend where a line turns (not three stubs), a flared mouth and a ring at
// the open starting end. Shared by logistics.js (the placed hoses, instanced) and beltplan.js / game.js (the ghost you aim with), so the preview is the tube you get.
import * as THREE from 'three';
import { C } from './config.js';

export const R_BEND = C * 0.5;            // a bend turns inside one cell: a quarter circle of 0.3 m radius, from the middle of one edge to the middle of the next
const TUBE_R = 0.17, RIB = 0.03;          // tube radius and how far the ribs stand out
const DXY = [1, 0, -1, 0], DZY = [0, 1, 0, -1];
const rib = (u, ribs) => TUBE_R + RIB * (0.5 + 0.5 * Math.cos(u * ribs * Math.PI * 2));

// straight piece: a ribbed tube C long, axis along +z (the model's forward)
export function straightGeometry() {
  const prof = []; for (let k = 0; k <= 48; k++) { const u = k / 48; prof.push(new THREE.Vector2(rib(u, 6), (u - 0.5) * C)); }
  const g = new THREE.LatheGeometry(prof, 14); g.rotateX(Math.PI / 2); return g;
}

// a quarter circle of ribbed tube. Canonical frame: circle centre at the origin, the tube starts at (R, 0, 0) heading +z and ends at (0, 0, R) heading -x.
// `left` mirrors it (starts at (-R, 0, 0), ends heading +x), so both turns are drawn with a proper rotation (no mirrored matrices, no flipped lighting).
export function bendGeometry(left) {
  const N = 18, M = 14, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, th = u * Math.PI / 2, rr = rib(u, 5), cx = Math.cos(th), sz = Math.sin(th);
    for (let m = 0; m < M; m++) {
      const ph = m / M * Math.PI * 2, o = Math.cos(ph) * rr, y = Math.sin(ph) * rr;
      const px = (R_BEND + o) * cx, pz = (R_BEND + o) * sz;
      pos.push(left ? -px : px, y, pz);
    }
  }
  for (let i = 0; i < N; i++) for (let m = 0; m < M; m++) {
    const a = i * M + m, b = i * M + (m + 1) % M, c = (i + 1) * M + m, d = (i + 1) * M + (m + 1) % M;
    if (left) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

// the flared mouth and its ring (a funnel that opens toward the front of the open end)
export function mouthGeometry() { const g = new THREE.CylinderGeometry(0.2, 0.5, 0.4, 16, 1, true); g.rotateX(Math.PI / 2); return g; }
export function ringGeometry() { return new THREE.TorusGeometry(0.5, 0.035, 8, 20); }

// the bend of a tile whose feeder faces `cd` and which itself faces `dir` (both 0..3): where its circle sits and the two axes that turn the canonical bend into place.
// { right, ox, oz, xAxis: [x, z], zAxis: [x, z] } for a tile centred at (cx, cz); right says which of the two geometries to use.
export function bendFrame(cx, cz, cd, dir) {
  const hin = [DXY[cd], DZY[cd]], hout = [DXY[dir], DZY[dir]];
  const cross = hin[0] * hout[1] - hin[1] * hout[0], right = cross > 0;
  return { right, ox: cx - hin[0] * R_BEND + hout[0] * R_BEND, oz: cz - hin[1] * R_BEND + hout[1] * R_BEND, xAxis: right ? [-hout[0], -hout[1]] : [hout[0], hout[1]], zAxis: hin };
}

export const hoseMaterial = () => new THREE.MeshStandardMaterial({ color: 0x7fb4c8, roughness: 0.35, metalness: 0.15, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
export const mouthMaterial = () => new THREE.MeshStandardMaterial({ color: 0x4f7f93, roughness: 0.4, metalness: 0.25, side: THREE.DoubleSide });

// the ghost of a run of hose pieces. tiles = [{ i? , x, z, y, dir, from }]: x, z, y are the world centre and base height of the piece, dir where it faces, from the way its
// feeder faces (the same as dir for a straight piece). One mesh per piece, all with the ghost's colour. mouth: draw the flared mouth on the first piece.
let geo = null;
const shared = () => geo || (geo = { straight: straightGeometry(), right: bendGeometry(false), left: bendGeometry(true), mouth: mouthGeometry(), ring: ringGeometry() });
export function hoseGhost(tiles, mat, mouth) {
  const G = shared(), grp = new THREE.Group(), YAW = (d) => Math.atan2(DXY[d], DZY[d]);
  tiles.forEach((t, n) => {
    const y = t.y + 0.2;
    if (t.from != null && t.from !== t.dir && ((t.from + 2) & 3) !== t.dir) {
      const f = bendFrame(t.x, t.z, t.from, t.dir), m = new THREE.Mesh(f.right ? G.right : G.left, mat);
      m.matrixAutoUpdate = false; m.matrix.makeBasis(new THREE.Vector3(f.xAxis[0], 0, f.xAxis[1]), new THREE.Vector3(0, 1, 0), new THREE.Vector3(f.zAxis[0], 0, f.zAxis[1])).setPosition(f.ox, y, f.oz);
      grp.add(m);
    } else {
      const m = new THREE.Mesh(G.straight, mat); m.position.set(t.x, y, t.z); m.rotation.y = YAW(t.dir); m.scale.z = 1.04; grp.add(m);
    }
    if (mouth && n === 0 && (t.from == null || t.from === t.dir)) {
      const mm = new THREE.Mesh(G.mouth, mat), rm = new THREE.Mesh(G.ring, mat), yaw = YAW(t.dir);
      mm.rotation.y = rm.rotation.y = yaw; mm.position.set(t.x - DXY[t.dir] * (C * 0.5 + 0.2), y, t.z - DZY[t.dir] * (C * 0.5 + 0.2)); rm.position.set(t.x - DXY[t.dir] * (C * 0.5 + 0.4), y, t.z - DZY[t.dir] * (C * 0.5 + 0.4));
      grp.add(mm, rm);
    }
  });
  return grp;
}
