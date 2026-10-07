// The remesh as it was before daylight through holes (src/render.js at the last commit, `this` renamed to R): the baseline of the cost test and of "no hole means exactly the
// old light". No default export, so the self test loader skips this file.
import { NX, NY, NZ, CS, CX, CZ, cellX, cellY, cellZ } from '../config.js';
import { species, PALETTES, NEEDLE, BULK, REMAINS, CACHE, PAD, ARCH_COUNT } from '../plushdata.js';
import { cellPose } from '../render.js';
import * as THREE from 'three';

const STRIDE = 16;
const A_PAD = ARCH_COUNT + 8, A_PADTHIN = ARCH_COUNT + 9;
const hexCache = new Map();
const palLin = PALETTES.map(([, hex]) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; });
function colOf(s0) {
  if (s0.hex) { let c = hexCache.get(s0.hex); if (!c) { const k = new THREE.Color(s0.hex); c = [k.r, k.g, k.b]; hexCache.set(s0.hex, c); } return c; }
  return palLin[s0.pal];
}
const remainsLin = [1, 1, 1];
const cacheLin = (() => { const c = new THREE.Color(0xb98a4a); return [c.r, c.g, c.b]; })();
const bulkLin = (() => { const c = new THREE.Color(0xa87a45); return [c.r, c.g, c.b]; })();
const needleLin = (() => { const c = new THREE.Color(0xffd24a); return [c.r, c.g, c.b]; })();
const padLin = [0x9a6b3a, 0x77879a, 0xb9b7ac, 0x8a6a58, 0xb7c3d0, 0x2b2f36, 0x7ad7ff, 0xb078ff, 0xfff0b0, 0x14141e].map((h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; });

export function legacyScan(R, cx, cy, cz, deep = false) {
  const w = R.world;
  const ci = (cy * CZ + cz) * CX + cx;
  const i0 = cx * CS, j0 = cy * CS, k0 = cz * CS;
  const i1 = Math.min(NX, i0 + CS), j1 = Math.min(NY, j0 + CS), k1 = Math.min(NZ, k0 + CS);
  if (!w.chunkMod[ci]) {
    let minT = 1e9, maxT = 0;
    for (let k = Math.max(0, k0 - 1); k <= Math.min(NZ - 1, k1); k++) {
      for (let i = Math.max(0, i0 - 1); i <= Math.min(NX - 1, i1); i++) {
        const t = w.topAt(i, k);
        if (t < minT) minT = t;
        if (t > maxT) maxT = t;
      }
    }
    if (j0 + CS < minT || j0 > maxT + 1) return { n: 0, data: null };
  }
  // padded copy of the chunk (2 cell border) so neighbor tests are plain array reads
  const B = 2, P = CS + 2 * B;
  const pad = R._pad2 || (R._pad2 = new Uint16Array(P * P * P));
  for (let dj = 0; dj < P; dj++) for (let dk = 0; dk < P; dk++) for (let di = 0; di < P; di++) {
    const i = i0 - B + di, j = j0 - B + dj, k = k0 - B + dk;
    pad[(dj * P + dk) * P + di] = (i < 0 || i >= NX || k < 0 || k >= NZ || j < 0 || j >= NY) ? 0xffff : w.get(i, j, k);
  }
  // near the camera the shell is one layer thicker so you never see between the lumps of the surface you stand on
  let ring = null;
  if (deep) {
    ring = R._ring || (R._ring = new Uint8Array(P * P * P));
    ring.fill(0);
    for (let dj = 1; dj < P - 1; dj++) for (let dk = 1; dk < P - 1; dk++) for (let di = 1; di < P - 1; di++) {
      const pi2 = (dj * P + dk) * P + di;
      if (!pad[pi2]) continue;
      let open = false;
      for (let a2 = -1; a2 <= 1 && !open; a2++) for (let b2 = -1; b2 <= 1 && !open; b2++) for (let c2 = -1; c2 <= 1; c2++) {
        if (!pad[pi2 + a2 * P * P + b2 * P + c2]) { open = true; break; }
      }
      if (open) ring[pi2] = 1;
    }
  }
  const out = [];
  const pose = new Float32Array(9);
  for (let j = j0; j < j1; j++) {
    for (let k = k0; k < k1; k++) {
      for (let i = i0; i < i1; i++) {
        const pi = (j - j0 + B) * P * P + (k - k0 + B) * P + (i - i0 + B);
        const s = pad[pi];
        if (!s) continue;
        let cnt = 0, skyBest = 0;
        for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj && !dk) continue;
          const v = pad[pi + dj * P * P + dk * P + di];
          if (v !== 0) { cnt++; continue; }
          const ni = i + di, nj = j + dj, nk = k + dk;
          const t = w.topAt(ni, nk);
          const sk = nj >= t ? 1 : Math.exp(-(t - nj - 1) * 0.3);
          const w2 = (di && dj ? 0 : 1) * (di && dk ? 0 : 1) * (dj && dk ? 0 : 1) ? 1 : 0.8;
          if (sk * w2 > skyBest) skyBest = sk * w2;
        }
        if (cnt === 26) {
          if (!deep) continue;
          let near = false;
          for (let dj = -1; dj <= 1 && !near; dj++) for (let dk = -1; dk <= 1 && !near; dk++) for (let di = -1; di <= 1; di++) {
            if (ring[pi + dj * P * P + dk * P + di]) { near = true; break; }
          }
          if (!near) continue;
        }
        const ao = Math.min(1, Math.max(0.3, 1 - (cnt - 14) * 0.075));
        const v = w.getVr(i, j, k);
        cellPose(i, j, k, v, pose);
        const s0 = species[s];
        let arch = s0 ? s0.arch : 0;
        let col, shade = 0.9 + ((v & 127) / 127) * 0.2, flag = (v & 128) ? 1 : 0;
        if (s === NEEDLE) { col = needleLin; shade = 1; flag = 2; }
        else if (s === BULK) {
          col = bulkLin; shade = 0.9 + ((v & 127) / 127) * 0.15; flag = 0;
          if (v & 128) { pose[0] = cellX(i); pose[1] = cellY(j); pose[2] = cellZ(k); pose[3] = 0; pose[4] = 0; pose[5] = 0; pose[6] = 1; pose[7] = 1; }   // a wall section piece (build.js): panels set square and flush, not tumbled like loose bulkheads
        }
        else if (s === REMAINS) { col = remainsLin; shade = 1; flag = 0; }
        else if (s === CACHE) { col = cacheLin; shade = 0.9 + ((v & 127) / 127) * 0.2; flag = 0; }
        else if (s === PAD) {
          // a floor pad is a flat, upright, exactly cell sized slab (no random tilt or size like a plush); a catwalk plate (vr bit 16) is the thin deck
          col = padLin[Math.min(padLin.length - 1, v & 15)]; shade = 0.8; flag = 0;   // the flat top takes the full hall light, so it is set a little darker than the frame of the same material
          pose[0] = cellX(i); pose[1] = cellY(j); pose[2] = cellZ(k); pose[3] = 0; pose[4] = 0; pose[5] = 0; pose[6] = 1; pose[7] = 1; pose[8] = 0.5;
          arch = (v & 16) ? A_PADTHIN : A_PAD;
        }
        else col = colOf(s0);
        out.push(
          pose[0], pose[1], pose[2], pose[3], pose[4], pose[5], pose[6], pose[7],
          ao, skyBest, flag, pose[8],
          col[0] * shade, col[1] * shade, col[2] * shade, arch,
        );
      }
    }
  }
  return { n: out.length / STRIDE, data: new Float32Array(out) };
}
