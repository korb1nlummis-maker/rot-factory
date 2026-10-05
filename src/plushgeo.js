import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const DARK = [0.035, 0.03, 0.04];
const PINK = [1.35, 0.85, 0.95];
const LIGHT = [1.28, 1.28, 1.28];
const WARM = [1.4, 1.0, 0.55];
const SOLE = [0.45, 0.45, 0.5];

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

function ell(lod, sx, sy, sz, px, py, pz, tint = [1, 1, 1], rot = [0, 0, 0], opts = {}) {
  const small = Math.max(sx, sy, sz) < 0.085;
  const eye = opts.eye;
  if (lod === 0 && small && !eye) return null;
  const ws = lod === 1 ? (small ? 8 : 14) : small ? 4 : 7;
  const hs = lod === 1 ? (small ? 6 : 10) : small ? 3 : 5;
  const g = new THREE.SphereGeometry(1, ws, hs);
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _s.set(sx, sy, sz);
  _p.set(px, py, pz);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = tint[0]; col[i * 3 + 1] = tint[1]; col[i * 3 + 2] = tint[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function eyes(lod, y, z, sep = 0.1, r = 0.04) {
  return [
    ell(lod, r, r * 1.2, r * 0.8, -sep, y, z, DARK, [0, 0, 0], { eye: true }),
    ell(lod, r, r * 1.2, r * 0.8, sep, y, z, DARK, [0, 0, 0], { eye: true }),
  ];
}
function cheeks(lod, y, z, sep = 0.16) {
  return [
    ell(lod, 0.055, 0.03, 0.02, -sep, y, z, PINK),
    ell(lod, 0.055, 0.03, 0.02, sep, y, z, PINK),
  ];
}

const ARCHS = [
  // 0 Bean
  (L) => [ell(L, 0.27, 0.3, 0.26, 0, 0, 0), ...eyes(L, 0.07, 0.235, 0.09), ...cheeks(L, -0.03, 0.225)],
  // 1 Gatto
  (L) => [
    ell(L, 0.27, 0.25, 0.25, 0, 0, 0),
    ell(L, 0.075, 0.13, 0.045, -0.16, 0.26, 0, [1.1, 1.1, 1.1], [0, 0, 0.4]),
    ell(L, 0.075, 0.13, 0.045, 0.16, 0.26, 0, [1.1, 1.1, 1.1], [0, 0, -0.4]),
    ell(L, 0.03, 0.022, 0.02, 0, 0.0, 0.255, [1.3, 0.6, 0.7]),
    ell(L, 0.055, 0.055, 0.14, 0, -0.1, -0.27, [1.1, 1.1, 1.1]),
    ...eyes(L, 0.07, 0.22, 0.1), ...cheeks(L, -0.04, 0.215, 0.17),
  ],
  // 2 Squalo
  (L) => [
    ell(L, 0.2, 0.2, 0.37, 0, 0, 0),
    ell(L, 0.15, 0.11, 0.3, 0, -0.1, 0.04, LIGHT),
    ell(L, 0.035, 0.15, 0.11, 0, 0.23, -0.03, [0.85, 0.85, 0.9], [-0.4, 0, 0]),
    ell(L, 0.035, 0.15, 0.09, 0, 0.0, -0.4, [0.85, 0.85, 0.9], [0.5, 0, 0]),
    ell(L, 0.13, 0.03, 0.07, -0.2, -0.06, 0.08, [0.85, 0.85, 0.9], [0, 0, 0.5]),
    ell(L, 0.13, 0.03, 0.07, 0.2, -0.06, 0.08, [0.85, 0.85, 0.9], [0, 0, -0.5]),
    ...eyes(L, 0.07, 0.25, 0.13, 0.035),
  ],
  // 3 Coccodrillo
  (L) => [
    ell(L, 0.2, 0.17, 0.33, 0, 0, -0.02),
    ell(L, 0.14, 0.09, 0.2, 0, -0.03, 0.34, [1.05, 1.05, 1.05]),
    ell(L, 0.07, 0.07, 0.2, 0, 0.0, -0.4, [0.9, 0.9, 0.9]),
    ell(L, 0.06, 0.06, 0.06, -0.1, 0.16, 0.2, [1.1, 1.1, 1.1]),
    ell(L, 0.06, 0.06, 0.06, 0.1, 0.16, 0.2, [1.1, 1.1, 1.1]),
    ell(L, 0.025, 0.03, 0.02, -0.1, 0.18, 0.25, DARK, [0, 0, 0], { eye: true }),
    ell(L, 0.025, 0.03, 0.02, 0.1, 0.18, 0.25, DARK, [0, 0, 0], { eye: true }),
    ell(L, 0.06, 0.09, 0.06, -0.15, -0.14, 0.1, [0.9, 0.9, 0.9]),
    ell(L, 0.06, 0.09, 0.06, 0.15, -0.14, 0.1, [0.9, 0.9, 0.9]),
  ],
  // 4 Banana
  (L) => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      const t = (i - 2) * 0.42;
      out.push(ell(L, 0.12, 0.13, 0.12, Math.sin(t) * 0.36, Math.cos(t) * 0.3 - 0.15, 0, i === 0 || i === 4 ? [0.35, 0.3, 0.3] : [1, 1, 1], [0, 0, -t]));
    }
    out.push(...eyes(L, 0.17 - 0.15, 0.1, 0.05, 0.03), ...cheeks(L, 0.11 - 0.15, 0.1, 0.09));
    return out;
  },
  // 5 Cappuccino
  (L) => [
    ell(L, 0.2, 0.25, 0.2, 0, -0.04, 0),
    ell(L, 0.215, 0.09, 0.215, 0, 0.2, 0, [1.35, 1.3, 1.2]),
    ell(L, 0.06, 0.11, 0.045, 0.23, -0.03, 0, [0.9, 0.9, 0.9]),
    ell(L, 0.1, 0.045, 0.1, 0, -0.29, 0, [0.7, 0.7, 0.7]),
    ...eyes(L, 0.0, 0.19, 0.08, 0.035), ...cheeks(L, -0.08, 0.18, 0.13),
  ],
  // 6 Rana
  (L) => [
    ell(L, 0.31, 0.2, 0.26, 0, -0.03, 0),
    ell(L, 0.085, 0.085, 0.085, -0.14, 0.2, 0.12, [1.15, 1.15, 1.15]),
    ell(L, 0.085, 0.085, 0.085, 0.14, 0.2, 0.12, [1.15, 1.15, 1.15]),
    ell(L, 0.04, 0.04, 0.035, -0.14, 0.215, 0.19, DARK, [0, 0, 0], { eye: true }),
    ell(L, 0.04, 0.04, 0.035, 0.14, 0.215, 0.19, DARK, [0, 0, 0], { eye: true }),
    ell(L, 0.1, 0.06, 0.15, -0.27, -0.14, -0.08, [0.92, 0.92, 0.92]),
    ell(L, 0.1, 0.06, 0.15, 0.27, -0.14, -0.08, [0.92, 0.92, 0.92]),
    ...cheeks(L, -0.05, 0.22, 0.18),
  ],
  // 7 Scarpa
  (L) => [
    ell(L, 0.19, 0.17, 0.3, 0, -0.04, 0.0),
    ell(L, 0.185, 0.14, 0.13, 0, -0.05, 0.22, LIGHT),
    ell(L, 0.22, 0.05, 0.34, 0, -0.2, 0.02, SOLE),
    ell(L, 0.05, 0.14, 0.05, -0.08, 0.2, -0.1, [0.9, 0.9, 0.95]),
    ell(L, 0.05, 0.14, 0.05, 0.08, 0.2, -0.1, [0.9, 0.9, 0.95]),
    ...eyes(L, 0.07, 0.17, 0.08, 0.035),
  ],
  // 8 Martello
  (L) => [
    ell(L, 0.17, 0.33, 0.17, 0, 0, 0),
    ell(L, 0.045, 0.26, 0.045, 0.27, 0.02, 0.05, [0.55, 0.38, 0.28], [0, 0, -0.3]),
    ell(L, 0.06, 0.1, 0.06, -0.19, -0.02, 0.0, [0.95, 0.95, 0.95]),
    ell(L, 0.06, 0.1, 0.06, 0.18, -0.02, 0.03, [0.95, 0.95, 0.95]),
    ...eyes(L, 0.12, 0.155, 0.07, 0.038), ...cheeks(L, 0.03, 0.15, 0.1),
  ],
  // 9 Polpo
  (L) => {
    const out = [ell(L, 0.25, 0.22, 0.25, 0, 0.08, 0), ...eyes(L, 0.1, 0.22, 0.09), ...cheeks(L, 0.02, 0.21, 0.15)];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      out.push(ell(L, 0.06, 0.06, 0.17, Math.sin(a) * 0.2, -0.17, Math.cos(a) * 0.2, [1, 1, 1], [0.35, a, 0]));
    }
    return out;
  },
  // 10 Coniglio
  (L) => [
    ell(L, 0.22, 0.24, 0.2, 0, -0.05, 0),
    ell(L, 0.05, 0.21, 0.035, -0.09, 0.3, 0, [1.12, 1.12, 1.12], [0, 0, 0.12]),
    ell(L, 0.05, 0.21, 0.035, 0.09, 0.3, 0, [1.12, 1.12, 1.12], [0, 0, -0.12]),
    ell(L, 0.07, 0.07, 0.07, 0, -0.1, -0.22, LIGHT),
    ell(L, 0.025, 0.02, 0.02, 0, -0.02, 0.2, [1.3, 0.6, 0.7]),
    ...eyes(L, 0.04, 0.185, 0.08, 0.035), ...cheeks(L, -0.06, 0.18, 0.13),
  ],
  // 11 Papera
  (L) => [
    ell(L, 0.26, 0.22, 0.31, 0, -0.1, -0.03),
    ell(L, 0.17, 0.17, 0.17, 0, 0.13, 0.13),
    ell(L, 0.1, 0.04, 0.09, 0, 0.1, 0.29, WARM),
    ell(L, 0.045, 0.12, 0.17, -0.27, -0.06, -0.05, [0.95, 0.95, 0.95], [0, 0, 0.2]),
    ell(L, 0.045, 0.12, 0.17, 0.27, -0.06, -0.05, [0.95, 0.95, 0.95], [0, 0, -0.2]),
    ...eyes(L, 0.19, 0.25, 0.08, 0.03),
  ],
  // 12 Uovo
  (L) => [
    ell(L, 0.22, 0.25, 0.22, 0, -0.04, 0),
    ell(L, 0.18, 0.2, 0.18, 0, 0.1, 0),
    ell(L, 0.07, 0.04, 0.09, -0.1, -0.29, 0.04, WARM),
    ell(L, 0.07, 0.04, 0.09, 0.1, -0.29, 0.04, WARM),
    ...eyes(L, 0.06, 0.2, 0.08, 0.04), ...cheeks(L, -0.04, 0.2, 0.14),
  ],
  // 13 Fantasma
  (L) => {
    const out = [ell(L, 0.2, 0.28, 0.2, 0, 0.03, 0), ell(L, 0.05, 0.1, 0.04, -0.23, 0, 0.03, [1, 1, 1], [0, 0, 0.5]), ell(L, 0.05, 0.1, 0.04, 0.23, 0, 0.03, [1, 1, 1], [0, 0, -0.5])];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      out.push(ell(L, 0.085, 0.085, 0.085, Math.sin(a) * 0.14, -0.25, Math.cos(a) * 0.14));
    }
    out.push(...eyes(L, 0.1, 0.17, 0.08, 0.05), ell(L, 0.035, 0.05, 0.02, 0, -0.04, 0.19, DARK, [0, 0, 0], { eye: true }));
    return out;
  },

  // 14 Pinguino
  (L) => [ell(L, 0.24, 0.3, 0.22, 0, 0, 0, [0.55, 0.6, 0.75]), ell(L, 0.17, 0.24, 0.1, 0, -0.03, 0.15, [2.0, 2.0, 2.0]), ell(L, 0.055, 0.03, 0.05, 0, 0.1, 0.25, WARM), ell(L, 0.05, 0.15, 0.1, -0.25, -0.02, 0, [0.5, 0.55, 0.7], [0, 0, 0.3]), ell(L, 0.05, 0.15, 0.1, 0.25, -0.02, 0, [0.5, 0.55, 0.7], [0, 0, -0.3]), ell(L, 0.07, 0.03, 0.1, -0.1, -0.3, 0.06, WARM), ell(L, 0.07, 0.03, 0.1, 0.1, -0.3, 0.06, WARM), ...eyes(L, 0.14, 0.2, 0.08, 0.035)],
  // 15 Orsetto
  (L) => [ell(L, 0.25, 0.25, 0.23, 0, 0, 0), ell(L, 0.075, 0.075, 0.04, -0.17, 0.24, 0.0), ell(L, 0.075, 0.075, 0.04, 0.17, 0.24, 0.0), ell(L, 0.1, 0.075, 0.07, 0, -0.04, 0.2, LIGHT), ell(L, 0.035, 0.027, 0.025, 0, 0.0, 0.265, DARK, [0, 0, 0], { eye: true }), ell(L, 0.07, 0.09, 0.07, -0.17, -0.2, 0.08), ell(L, 0.07, 0.09, 0.07, 0.17, -0.2, 0.08), ...eyes(L, 0.09, 0.2, 0.1, 0.035), ...cheeks(L, -0.05, 0.2, 0.17)],
  // 16 Tartaruga
  (L) => [ell(L, 0.3, 0.19, 0.3, 0, 0.05, 0, [0.62, 0.78, 0.52]), ell(L, 0.22, 0.04, 0.22, 0, 0.2, 0, [0.5, 0.65, 0.42]), ell(L, 0.1, 0.09, 0.11, 0, -0.03, 0.3), ell(L, 0.07, 0.06, 0.1, -0.2, -0.12, 0.16), ell(L, 0.07, 0.06, 0.1, 0.2, -0.12, 0.16), ell(L, 0.07, 0.06, 0.1, -0.2, -0.12, -0.16), ell(L, 0.07, 0.06, 0.1, 0.2, -0.12, -0.16), ell(L, 0.04, 0.04, 0.08, 0, -0.08, -0.32), ...eyes(L, 0.0, 0.37, 0.05, 0.025)],
  // 17 Giraffa
  (L) => [ell(L, 0.2, 0.2, 0.22, 0, -0.12, 0), ell(L, 0.07, 0.22, 0.07, 0, 0.1, 0.1), ell(L, 0.1, 0.09, 0.13, 0, 0.3, 0.17), ell(L, 0.025, 0.06, 0.025, -0.05, 0.4, 0.14), ell(L, 0.025, 0.06, 0.025, 0.05, 0.4, 0.14), ell(L, 0.05, 0.05, 0.03, -0.12, -0.08, 0.17, [0.5, 0.35, 0.2]), ell(L, 0.05, 0.05, 0.03, 0.1, -0.15, 0.19, [0.5, 0.35, 0.2]), ell(L, 0.05, 0.05, 0.03, 0.0, -0.05, 0.2, [0.5, 0.35, 0.2]), ...eyes(L, 0.33, 0.27, 0.06, 0.025)],
  // 18 Elefante
  (L) => [ell(L, 0.26, 0.24, 0.27, 0, 0, -0.02), ell(L, 0.19, 0.19, 0.17, 0, 0.05, 0.2), ell(L, 0.045, 0.16, 0.14, -0.21, 0.07, 0.18), ell(L, 0.045, 0.16, 0.14, 0.21, 0.07, 0.18), ell(L, 0.045, 0.05, 0.2, 0, -0.1, 0.36), ell(L, 0.045, 0.07, 0.05, 0, -0.18, 0.5), ...eyes(L, 0.12, 0.34, 0.08, 0.03)],
  // 19 Riccio
  (L) => {
    const o = [ell(L, 0.26, 0.22, 0.27, 0, 0, -0.02), ell(L, 0.12, 0.1, 0.1, 0, -0.04, 0.25, LIGHT), ell(L, 0.03, 0.025, 0.025, 0, -0.02, 0.35, DARK, [0, 0, 0], { eye: true }), ...eyes(L, 0.03, 0.31, 0.06, 0.025)];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI - 0.1; o.push(ell(L, 0.04, 0.13, 0.04, Math.cos(a) * 0.24, 0.12 + Math.sin(a) * 0.15, -0.14 - Math.sin(a) * 0.06, [0.55, 0.5, 0.45], [0.5, 0, -Math.cos(a) * 0.9], { eye: true })); }
    return o;
  },
  // 20 Gufo
  (L) => [ell(L, 0.24, 0.3, 0.2, 0, 0, 0), ell(L, 0.09, 0.09, 0.03, -0.1, 0.11, 0.18, LIGHT, [0, 0, 0], { eye: true }), ell(L, 0.09, 0.09, 0.03, 0.1, 0.11, 0.18, LIGHT, [0, 0, 0], { eye: true }), ell(L, 0.035, 0.04, 0.03, -0.1, 0.11, 0.21, DARK, [0, 0, 0], { eye: true }), ell(L, 0.035, 0.04, 0.03, 0.1, 0.11, 0.21, DARK, [0, 0, 0], { eye: true }), ell(L, 0.04, 0.09, 0.03, -0.14, 0.3, 0, [1, 1, 1], [0, 0, -0.4]), ell(L, 0.04, 0.09, 0.03, 0.14, 0.3, 0, [1, 1, 1], [0, 0, 0.4]), ell(L, 0.04, 0.03, 0.05, 0, 0.03, 0.22, WARM), ell(L, 0.05, 0.15, 0.1, -0.25, -0.02, 0, [0.9, 0.9, 0.9], [0, 0, 0.3]), ell(L, 0.05, 0.15, 0.1, 0.25, -0.02, 0, [0.9, 0.9, 0.9], [0, 0, -0.3]), ell(L, 0.17, 0.12, 0.05, 0, -0.1, 0.17, LIGHT)],
  // 21 Medusa
  (L) => { const o = [ell(L, 0.26, 0.2, 0.26, 0, 0.1, 0), ...eyes(L, 0.12, 0.23, 0.09, 0.04), ...cheeks(L, 0.03, 0.22, 0.15)]; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; o.push(ell(L, 0.03, 0.17, 0.03, Math.sin(a) * 0.17, -0.18, Math.cos(a) * 0.17, [1.2, 1.2, 1.2], [Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25], { eye: true })); } return o; },
  // 22 Lumaca
  (L) => [ell(L, 0.12, 0.1, 0.32, 0, -0.17, 0), ell(L, 0.11, 0.11, 0.1, 0, -0.1, 0.3), ell(L, 0.22, 0.22, 0.12, 0, 0.05, -0.08, [0.85, 0.6, 0.45], [0, 0, 0]), ell(L, 0.13, 0.13, 0.13, 0, 0.05, -0.08, [0.7, 0.45, 0.32]), ell(L, 0.022, 0.1, 0.022, -0.05, 0.0, 0.34, [1, 1, 1], [0.2, 0, 0], { eye: true }), ell(L, 0.022, 0.1, 0.022, 0.05, 0.0, 0.34, [1, 1, 1], [0.2, 0, 0], { eye: true }), ell(L, 0.03, 0.03, 0.03, -0.05, 0.1, 0.36, DARK, [0, 0, 0], { eye: true }), ell(L, 0.03, 0.03, 0.03, 0.05, 0.1, 0.36, DARK, [0, 0, 0], { eye: true })],
  // 23 Fungo
  (L) => [ell(L, 0.3, 0.15, 0.3, 0, 0.12, 0), ell(L, 0.07, 0.03, 0.07, -0.12, 0.25, 0.1, [1.7, 1.7, 1.7]), ell(L, 0.06, 0.03, 0.06, 0.14, 0.24, -0.08, [1.7, 1.7, 1.7]), ell(L, 0.05, 0.03, 0.05, 0, 0.27, -0.14, [1.7, 1.7, 1.7]), ell(L, 0.12, 0.2, 0.12, 0, -0.12, 0, [1.7, 1.6, 1.4]), ...eyes(L, -0.08, 0.1, 0.05, 0.03), ...cheeks(L, -0.15, 0.1, 0.08)],
  // 24 Cactus
  (L) => [ell(L, 0.14, 0.3, 0.14, 0, 0, 0, [0.7, 1.1, 0.7]), ell(L, 0.1, 0.05, 0.05, -0.2, 0.05, 0, [0.7, 1.1, 0.7]), ell(L, 0.045, 0.1, 0.045, -0.27, 0.15, 0, [0.7, 1.1, 0.7]), ell(L, 0.1, 0.05, 0.05, 0.2, 0.0, 0, [0.7, 1.1, 0.7]), ell(L, 0.045, 0.1, 0.045, 0.27, 0.1, 0, [0.7, 1.1, 0.7]), ell(L, 0.06, 0.04, 0.06, 0, 0.32, 0, PINK), ...eyes(L, 0.08, 0.12, 0.05, 0.03), ...cheeks(L, 0.0, 0.12, 0.09)],
  // 25 Ananas
  (L) => { const o = [ell(L, 0.2, 0.26, 0.2, 0, -0.04, 0)]; for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; o.push(ell(L, 0.035, 0.15, 0.03, Math.sin(a) * 0.05, 0.3, Math.cos(a) * 0.05, [0.55, 1.2, 0.45], [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5], { eye: true })); } o.push(ell(L, 0.03, 0.03, 0.03, -0.12, -0.12, 0.17, [0.7, 0.55, 0.3]), ell(L, 0.03, 0.03, 0.03, 0.12, -0.12, 0.17, [0.7, 0.55, 0.3]), ell(L, 0.03, 0.03, 0.03, 0, -0.2, 0.18, [0.7, 0.55, 0.3]), ...eyes(L, 0.05, 0.18, 0.07, 0.03)); return o; },
  // 26 Anguria
  (L) => [ell(L, 0.3, 0.2, 0.17, 0, 0, 0, [0.35, 0.8, 0.4]), ell(L, 0.27, 0.17, 0.12, 0, 0, 0.07, [1.5, 0.45, 0.5]), ell(L, 0.025, 0.04, 0.02, -0.12, -0.04, 0.2, DARK, [0, 0, 0], { eye: true }), ell(L, 0.025, 0.04, 0.02, 0.12, -0.05, 0.2, DARK, [0, 0, 0], { eye: true }), ell(L, 0.025, 0.04, 0.02, 0.0, -0.1, 0.2, DARK, [0, 0, 0], { eye: true }), ...eyes(L, 0.06, 0.2, 0.07, 0.03)],
  // 27 Pizza
  (L) => [ell(L, 0.3, 0.3, 0.07, 0, 0, 0, [1.3, 1.1, 0.6]), ell(L, 0.26, 0.26, 0.06, 0, 0, 0.04, [1.3, 0.6, 0.45]), ell(L, 0.05, 0.05, 0.03, -0.12, -0.12, 0.09, [1.5, 0.3, 0.3]), ell(L, 0.05, 0.05, 0.03, 0.14, -0.04, 0.09, [1.5, 0.3, 0.3]), ell(L, 0.045, 0.045, 0.03, -0.04, -0.18, 0.09, [0.4, 0.8, 0.4]), ell(L, 0.045, 0.045, 0.03, 0.1, -0.16, 0.09, [1.5, 0.3, 0.3]), ...eyes(L, 0.08, 0.1, 0.08, 0.035), ...cheeks(L, 0.0, 0.1, 0.13)],
  // 28 Gelato
  (L) => [ell(L, 0.11, 0.22, 0.11, 0, -0.18, 0, WARM, [Math.PI, 0, 0]), ell(L, 0.21, 0.19, 0.21, 0, 0.1, 0), ell(L, 0.16, 0.14, 0.16, 0, 0.27, 0, [1.15, 1.15, 1.15]), ell(L, 0.045, 0.045, 0.045, 0, 0.4, 0, [1.8, 0.3, 0.3]), ...eyes(L, 0.1, 0.19, 0.07, 0.03), ...cheeks(L, 0.03, 0.18, 0.13)],
  // 29 Ciambella
  (L) => { const t = new THREE.TorusGeometry(0.2, 0.13, L === 1 ? 10 : 5, L === 1 ? 20 : 9); t.deleteAttribute('uv'); const n = t.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = 1; c[i * 3 + 1] = 1; c[i * 3 + 2] = 1; } t.setAttribute('color', new THREE.BufferAttribute(c, 3)); return [t, ell(L, 0.2, 0.2, 0.05, 0, 0, 0.1, [1.5, 0.9, 1.2]), ell(L, 0.025, 0.02, 0.02, -0.1, 0.17, 0.2, [1.8, 1.8, 1.2], [0, 0, 0.8], { eye: true }), ell(L, 0.025, 0.02, 0.02, 0.12, 0.12, 0.2, [1.2, 1.8, 1.8], [0, 0, -0.5], { eye: true }), ...eyes(L, -0.28, 0.06, 0.07, 0.03)]; },
  // 30 Dado
  (L) => { const bx = new THREE.BoxGeometry(0.4, 0.4, 0.4, 1, 1, 1); bx.deleteAttribute('uv'); const n = bx.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = 1.1; c[i * 3 + 1] = 1.1; c[i * 3 + 2] = 1.1; } bx.setAttribute('color', new THREE.BufferAttribute(c, 3)); return [bx, ell(L, 0.04, 0.04, 0.02, -0.1, 0.12, 0.2, DARK, [0, 0, 0], { eye: true }), ell(L, 0.04, 0.04, 0.02, 0.1, -0.12, 0.2, DARK, [0, 0, 0], { eye: true }), ell(L, 0.04, 0.04, 0.02, 0.1, 0.12, 0.2, DARK, [0, 0, 0], { eye: true }), ell(L, 0.04, 0.04, 0.02, -0.1, -0.12, 0.2, DARK, [0, 0, 0], { eye: true }), ell(L, 0.04, 0.04, 0.02, 0, 0, 0.2, DARK, [0, 0, 0], { eye: true }), ell(L, 0.04, 0.04, 0.02, 0.2, 0.1, 0.1, DARK, [0, 0, 0], { eye: true }), ell(L, 0.02, 0.04, 0.04, 0.2, -0.05, -0.1, DARK, [0, 0, 0], { eye: true })]; },
  // 31 Razzo
  (L) => [ell(L, 0.15, 0.3, 0.15, 0, 0, 0), ell(L, 0.1, 0.16, 0.1, 0, 0.3, 0, WARM), ell(L, 0.035, 0.12, 0.12, 0, -0.18, -0.12, [0.7, 0.7, 0.8], [0.3, 0, 0]), ell(L, 0.12, 0.12, 0.035, 0, -0.18, 0.0, [0.7, 0.7, 0.8]), ell(L, 0.075, 0.075, 0.03, 0, 0.08, 0.14, [1.6, 1.8, 2.0]), ell(L, 0.09, 0.05, 0.09, 0, -0.32, 0, [1.8, 1.0, 0.3]), ...eyes(L, -0.08, 0.14, 0.05, 0.03)],
  // 32 Nuvola
  (L) => [ell(L, 0.17, 0.15, 0.15, -0.16, -0.02, 0), ell(L, 0.2, 0.2, 0.18, 0, 0.05, 0), ell(L, 0.16, 0.14, 0.14, 0.17, -0.03, 0), ell(L, 0.12, 0.1, 0.12, -0.05, 0.2, 0), ...eyes(L, 0.05, 0.17, 0.08, 0.04), ...cheeks(L, -0.02, 0.17, 0.15)],
  // 33 Stella
  (L) => { const o = [ell(L, 0.17, 0.17, 0.12, 0, 0, 0)]; for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; o.push(ell(L, 0.07, 0.17, 0.08, Math.sin(a) * 0.2, Math.cos(a) * 0.2, 0, [1.1, 1.1, 1.1], [0, 0, -a], { eye: true })); } o.push(...eyes(L, 0.02, 0.1, 0.06, 0.03), ...cheeks(L, -0.05, 0.1, 0.1)); return o; },
  // 34 Drago
  (L) => [ell(L, 0.2, 0.2, 0.3, 0, 0, -0.02), ell(L, 0.14, 0.13, 0.14, 0, 0.13, 0.27), ell(L, 0.03, 0.08, 0.03, -0.07, 0.27, 0.25, LIGHT, [0.3, 0, 0.3]), ell(L, 0.03, 0.08, 0.03, 0.07, 0.27, 0.25, LIGHT, [0.3, 0, -0.3]), ell(L, 0.2, 0.03, 0.14, -0.22, 0.14, -0.05, [0.8, 0.8, 0.9], [0, 0, 0.4]), ell(L, 0.2, 0.03, 0.14, 0.22, 0.14, -0.05, [0.8, 0.8, 0.9], [0, 0, -0.4]), ell(L, 0.05, 0.05, 0.2, 0, -0.02, -0.4), ell(L, 0.03, 0.06, 0.04, 0, 0.2, 0.0, [1.3, 1.1, 0.6]), ell(L, 0.03, 0.06, 0.04, 0, 0.2, -0.12, [1.3, 1.1, 0.6]), ...eyes(L, 0.16, 0.38, 0.07, 0.03)],
  // 35 Lampadina
  (L) => [ell(L, 0.2, 0.22, 0.2, 0, 0.08, 0, [1.3, 1.25, 1.0]), ell(L, 0.1, 0.08, 0.1, 0, -0.16, 0, [0.6, 0.6, 0.65]), ell(L, 0.09, 0.025, 0.09, 0, -0.21, 0, [0.5, 0.5, 0.55]), ell(L, 0.03, 0.04, 0.02, 0, 0.2, 0, [2.0, 1.4, 0.5], [0, 0, 0], { eye: true }), ...eyes(L, 0.08, 0.18, 0.07, 0.035), ...cheeks(L, 0.01, 0.18, 0.12)],
];

const NEEDLE_FN = (L) => {
    const GOLD = [1.5, 1.25, 0.6];
    const out = [ell(L, 0.28, 0.3, 0.27, 0, -0.02, 0), ...eyes(L, 0.06, 0.24, 0.1, 0.05), ...cheeks(L, -0.04, 0.235, 0.17)];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      out.push(ell(L, 0.04, 0.11, 0.04, Math.sin(a) * 0.13, 0.33, Math.cos(a) * 0.13, GOLD, [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3], { eye: true }));
    }
    out.push(ell(L, 0.15, 0.04, 0.15, 0, 0.27, 0, GOLD, [0, 0, 0], { eye: true }));
    const halo = new THREE.TorusGeometry(0.24, 0.022, 8, L === 1 ? 28 : 12);
    halo.rotateX(Math.PI / 2); halo.translate(0, 0.55, 0); halo.deleteAttribute('uv');
    const hn = halo.attributes.position.count, hc = new Float32Array(hn * 3);
    for (let i = 0; i < hn; i++) { hc[i * 3] = 2.0; hc[i * 3 + 1] = 1.7; hc[i * 3 + 2] = 0.7; }
    halo.setAttribute('color', new THREE.BufferAttribute(hc, 3));
    out.push(halo);
    return out;
  };

const DECOY_BASE = (L, crown, halo, ears) => {
  const GOLD = [1.35, 1.15, 0.55];
  const out = [ell(L, 0.27, 0.29, 0.26, 0, -0.02, 0), ...eyes(L, 0.06, 0.235, 0.09, 0.04), ...cheeks(L, -0.04, 0.23, 0.16)];
  if (crown) { for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; out.push(ell(L, 0.04, 0.1, 0.04, Math.sin(a) * 0.13, 0.32, Math.cos(a) * 0.13, GOLD, [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3], { eye: true })); } out.push(ell(L, 0.15, 0.04, 0.15, 0, 0.26, 0, GOLD, [0, 0, 0], { eye: true })); }
  if (ears) { out.push(ell(L, 0.07, 0.12, 0.04, -0.17, 0.24, 0, [1, 1, 1], [0, 0, 0.4]), ell(L, 0.07, 0.12, 0.04, 0.17, 0.24, 0, [1, 1, 1], [0, 0, -0.4])); }
  if (halo) { const h = new THREE.TorusGeometry(0.2, 0.02, 8, L === 1 ? 24 : 10); h.rotateX(Math.PI / 2); h.translate(0, 0.52, 0); h.deleteAttribute('uv'); const hn = h.attributes.position.count, hc = new Float32Array(hn * 3); for (let i = 0; i < hn; i++) { hc[i * 3] = 1.6; hc[i * 3 + 1] = 1.4; hc[i * 3 + 2] = 0.7; } h.setAttribute('color', new THREE.BufferAttribute(hc, 3)); out.push(h); }
  return out;
};
const DECOYS = [
  (L) => DECOY_BASE(L, true, false, false),   // crown, no halo
  (L) => DECOY_BASE(L, false, true, false),   // halo, no crown
  (L) => DECOY_BASE(L, true, true, true),     // everything, plus ears
  (L) => DECOY_BASE(L, true, true, false).map((g, i) => (i === 0 ? g : g)), // a near perfect fake; the species name gives it away
];

function plank(w, h, d, px, py, pz, tint) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(px, py, pz);
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = tint[0]; col[i * 3 + 1] = tint[1]; col[i * 3 + 2] = tint[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export const ARCH_NEEDLE = 36, ARCH_BULK = 37, ARCH_REMAINS = 38, ARCH_DECOY0 = 39;

export function makeArchGeometry(arch, lod) {
  if (arch === ARCH_REMAINS) {
    // a hard hat, a pair of boots and a clipboard left behind
    const parts = [];
    const hat = new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); hat.translate(0, 0.0, 0);
    const brim = new THREE.CylinderGeometry(0.27, 0.27, 0.025, 16); brim.translate(0, 0.0, 0);
    const boot1 = new THREE.BoxGeometry(0.12, 0.1, 0.24); boot1.translate(-0.12, -0.2, 0.08);
    const boot2 = new THREE.BoxGeometry(0.12, 0.1, 0.24); boot2.translate(0.12, -0.22, -0.06);
    const board = new THREE.BoxGeometry(0.22, 0.02, 0.3); board.translate(0.0, -0.25, -0.18); board.rotateY(0.4);
    const cols = { 0: [1.0, 0.82, 0.12], 1: [1.0, 0.82, 0.12], 2: [0.12, 0.1, 0.08], 3: [0.12, 0.1, 0.08], 4: [0.8, 0.7, 0.5] };
    [hat, brim, boot1, boot2, board].forEach((g, n) => {
      g.deleteAttribute('uv');
      const c = cols[n], m = g.attributes.position.count, a = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      if (g.index === null) { /* keep merge consistent */ }
      parts.push(g);
    });
    const g = mergeGeometries(parts.map((p) => (p.index ? p : p)), false);
    g.computeBoundingSphere();
    return g;
  }
  if (arch === ARCH_BULK) {
    // bulkhead: three stacked planks with dark gaps and corner posts
    const parts = [];
    for (let i = 0; i < 3; i++) parts.push(plank(0.56, 0.17, 0.56, 0, -0.19 + i * 0.19, 0, [1.0 - i * 0.06, 0.97 - i * 0.05, 0.95]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(plank(0.08, 0.6, 0.08, sx * 0.26, 0, sz * 0.26, [0.75, 0.7, 0.66]));
    const g = mergeGeometries(parts, false);
    g.computeBoundingSphere();
    return g;
  }
  const fn = arch === ARCH_NEEDLE ? NEEDLE_FN : arch >= ARCH_DECOY0 ? DECOYS[arch - ARCH_DECOY0] : ARCHS[arch];
  const parts = fn(lod).filter(Boolean);
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  return g;
}
