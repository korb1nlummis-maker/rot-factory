// Lantern light. A lantern, a flare, a glow stick and a hanging lantern are small warm lamps, not blinding orbs: the glass is a modest emissive (under the bloom threshold, so it
// cannot flare to a white blob), a soft halo sprite limited in size and opacity keeps it readable from far away, and the LIGHT is the real thing:
//   * the plush shader (shaders.js, uPt) lights walls, floor and plush around it within its radius, with the falloff in shaders.js (1 / (1 + 0.14 d^2), faded to nothing at the radius);
//   * a small pool of real THREE.PointLights (POOL, never one per lantern) follows the nearest few sources and lights the standard materials: frames, machines, belts, the hall floor.
// game.glowSources() builds the list of sources (position, radius, colour, key) for both; this file only turns that list into lights, and holds the numbers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const POOL = 4;                       // real point lights in the scene, always (a changing light count would recompile every material)
export const LANTERN_R = 15;                 // plush shader radius (m) of a lantern
export const FLARE_R = 15, GLOW_R = 9;       // a flare burns as bright as a lantern, a glow stick lights a smaller green room
export const LANTERN_COLOR = [3.4, 2.6, 1.3];
export const FLARE_COLOR = [3.4, 1.5, 0.6];
export const GLOW_COLOR = [0.7, 2.6, 1.3];
export const BULB = [1.05, 0.78, 0.4];      // emissive glass: stays under the bloom threshold (0.92 after the tone curve)
export const REAL_I = 9;                     // candela of a real point light at full level (per unit of the source's strongest colour channel / 3)
export const REAL_R = 15;
export const FLARE_LIFE = 240, GLOW_LIFE = 600;   // seconds a flare and a glow stick burn (machines.js expires them)
export const FLARE_FADE = 40, GLOW_FADE = 90;     // the last seconds of it, in which it dies down to nothing

// how much of its light a flare or a glow stick still gives `age` seconds after it was set: a flare burns hard, flickers and dies down in its last 40 s;
// a glow stick dims slowly all its life (the chemicals run out) and goes out over its last 90 s
export function flareLevel(age, glow = false, time = 0, seed = 0) {
  const life = glow ? GLOW_LIFE : FLARE_LIFE, fade = glow ? GLOW_FADE : FLARE_FADE;
  if (!(age >= 0)) return 1;
  if (age >= life) return 0;
  const f = Math.min(1, (life - age) / fade);
  const base = glow ? 1 - 0.45 * Math.pow(age / life, 2) : 1;
  const flick = glow ? 1 : 0.9 + 0.1 * Math.sin(time * 23 + seed) * Math.sin(time * 7.3 + seed * 1.7);
  return Math.max(0, Math.min(1, base * f * flick));
}

// the age of a flare or glow stick: the host knows it from the play clock it was set at; a guest's play clock is its own, so a guest sees a full flare until the host takes it down
export const ageOf = (g, e) => (g.isGuest && g.isGuest() ? -1 : g.S.stats.playSecs - (e.born ?? g.S.stats.playSecs));

// ---------------------------------------------------------------- the body
// one geometry for every lantern, built once: all the iron (base, cap, ring, four bars) is one mesh and the glass another, so a lantern with its halo is three draw calls (the one before was four) and
// 100 lanterns share two uploaded buffers. Marked shared: removing a lantern must not free what the others draw with (machines.disposeObj skips it).
let bodyGeo = null;
export function lanternGeometry() {
  if (bodyGeo) return bodyGeo;
  const parts = [], add = (geo, x, y, z) => { geo.translate(x, y, z); parts.push(geo); };
  add(new THREE.CylinderGeometry(0.078, 0.085, 0.025, 12), 0, 0.0125, 0);
  add(new THREE.CylinderGeometry(0.03, 0.08, 0.035, 12), 0, 0.2125, 0);
  add(new THREE.TorusGeometry(0.04, 0.006, 6, 14), 0, 0.26, 0);
  for (let q = 0; q < 4; q++) add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.18, 4), Math.cos(q * Math.PI / 2 + 0.785) * 0.066, 0.11, Math.sin(q * Math.PI / 2 + 0.785) * 0.066);
  const iron = mergeGeometries(parts); for (const p of parts) p.dispose();
  const glass = new THREE.CylinderGeometry(0.058, 0.064, 0.17, 12);
  iron.userData.shared = true; glass.userData.shared = true;
  return (bodyGeo = { iron, glass });
}

// ---------------------------------------------------------------- the halo
let haloTex = null;
function haloTexture() {
  if (haloTex) return haloTex;
  const n = 64, cv = document.createElement('canvas'); cv.width = cv.height = n;
  const c = cv.getContext('2d'), gr = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = gr; c.fillRect(0, 0, n, n);
  haloTex = new THREE.CanvasTexture(cv);
  return haloTex;
}
// a soft additive sprite, warm and never white (its colour times its opacity stays under the bloom threshold). Its opacity and size are set per frame (haloFade) from the distance and the lamp's level.
export function makeHalo(rgb = [1, 0.62, 0.28], size = 0.7) {
  const m = new THREE.SpriteMaterial({ map: haloTexture(), color: new THREE.Color(rgb[0], rgb[1], rgb[2]), transparent: true, opacity: HALO_BASE, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const s = new THREE.Sprite(m); s.scale.set(size, size, 1); s.name = 'halo'; s.userData.base = HALO_BASE; s.userData.size = size; s.renderOrder = 3;
  return s;
}
export const HALO_BASE = 0.8;
// close up the halo thins out to a hint (it would be a haze over the glass); from far away it is what you see, a warm dot that grows a little with distance so it stays readable across a long tunnel
export function haloFade(halo, dist, level = 1) {
  if (!halo) return;
  const t = Math.min(1, Math.max(0, (dist - 0.4) / 3.2)), size = halo.userData.size || 0.7;
  halo.material.opacity = (halo.userData.base || HALO_BASE) * level * (0.1 + 0.9 * t * t * (3 - 2 * t));
  const grow = 1 + Math.min(1.6, Math.max(0, (dist - 5) / 12));
  halo.scale.set(size * grow, size * grow, 1);
  halo.visible = level > 0.02;
}

// ---------------------------------------------------------------- the real light pool
export function init(g) {
  if (g.lanternPool) return g.lanternPool;
  const pool = [];
  for (let i = 0; i < POOL; i++) {
    const L = new THREE.PointLight(0xffc880, 0, REAL_R, 1.8);
    L.name = 'lanternPool' + i; L.userData = { key: null, level: 0, want: 0 }; L.castShadow = false;
    g.renderer.scene.add(L); pool.push(L);
  }
  g.lanternPool = pool;
  return pool;
}

// sources: the list game.glowSources() made, nearest first; every entry that asks for a real light (real: true) is given one of the POOL, kept on the same light while it stays among the nearest
export function update(g, sources, dt) {
  const pool = g.lanternPool || init(g);
  const want = [];
  for (const s of sources) { if (s && s.real && want.length < POOL) want.push(s); }
  const taken = new Set();
  // lights already on a source keep it
  for (const s of want) { const L = pool.find((q) => q.userData.key === s.key && !taken.has(q)); if (L) { taken.add(L); s._L = L; } }
  // the others take a free (or dark) light
  for (const s of want) {
    if (s._L) continue;
    let L = pool.find((q) => !taken.has(q) && q.userData.key === null) || pool.find((q) => !taken.has(q) && q.userData.level < 0.03) || pool.find((q) => !taken.has(q));
    if (!L) continue;
    taken.add(L); L.userData.key = s.key; L.userData.level = Math.min(L.userData.level, 0.2); s._L = L;   // a light that changes hands starts again from dim, so a bright one never jumps to another lantern
  }
  const k = Math.min(1, dt * 7);
  for (const L of pool) {
    const s = want.find((q) => q._L === L);
    if (s) {
      const m = Math.max(s.cr, s.cg, s.cb, 1e-3);
      L.color.setRGB(Math.min(1, s.cr / m), Math.min(1, s.cg / m), Math.min(1, s.cb / m));
      L.position.set(s.x, s.y, s.z);
      L.distance = Math.max(6, Math.min(REAL_R, s.r));
      L.userData.want = REAL_I * (m / 3);
    } else { L.userData.want = 0; }
    L.userData.level += (L.userData.want - L.userData.level) * k;
    L.intensity = L.userData.level < 0.01 ? 0 : L.userData.level;
    if (L.userData.want === 0 && L.userData.level < 0.02) L.userData.key = null;
  }
  for (const s of want) delete s._L;
  return pool;
}

// ---------------------------------------------------------------- one source for the shader and the pool
// e: a light entry from machines.lights(): a lantern, a flare or a glow stick (an ent), or a furnish.js light (carries its own radius lr and colour lc)
// -> { x, y, z, r, cr, cg, cb, d: -1, key, real }, or null when it has burnt out
export function sourceOf(g, e) {
  if (e.lc) return { x: e.x, y: e.y, z: e.z, r: e.lr, cr: e.lc[0], cg: e.lc[1], cb: e.lc[2], d: -1, key: 'f' + Math.round(e.x * 4) + ',' + Math.round(e.y * 4) + ',' + Math.round(e.z * 4), real: true };
  if (e.type === 'flare') {
    const k = flareLevel(ageOf(g, e), !!e.glow, g.time, e.x); if (k <= 0.02) return null;
    const c = e.glow ? GLOW_COLOR : FLARE_COLOR, r = (e.glow ? GLOW_R : FLARE_R) * (0.55 + 0.45 * k);
    return { x: e.x, y: e.y + 0.3, z: e.z, r, cr: c[0] * k, cg: c[1] * k, cb: c[2] * k, d: -1, key: 'e' + e.id, real: true };
  }
  return { x: e.x, y: e.y + 0.14, z: e.z, r: LANTERN_R, cr: LANTERN_COLOR[0], cg: LANTERN_COLOR[1], cb: LANTERN_COLOR[2], d: -1, key: 'e' + e.id, real: true };
}

// a flare or a glow stick as it burns down: the tip, the stick and the halo follow the level (the light follows it through sourceOf)
export function paintFlare(g, it, level) {
  const o = it.obj; if (!o) return;
  const e = it.ent, tip = o.getObjectByName('tip'), halo = o.getObjectByName('halo');
  if (e.glow) {
    const st = o.children[0];
    if (st && st.material && st.material.color) { const b = st.userData.base || (st.userData.base = st.material.color.clone()); st.material.color.copy(b).multiplyScalar(0.25 + 0.75 * level); }
  } else if (tip && tip.material && tip.material.color) { const b = tip.userData.base || (tip.userData.base = tip.material.color.clone()); tip.material.color.copy(b).multiplyScalar(0.3 + 0.7 * level); }
  if (halo) haloFade(halo, g.renderer.camera.position.distanceTo(o.position), level);
}
export function tickHalo(g, it, level = 1) {
  const halo = it.obj && it.obj.getObjectByName('halo');
  if (halo) haloFade(halo, g.renderer.camera.position.distanceTo(it.obj.position), level);
}
