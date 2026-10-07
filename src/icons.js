import * as THREE from 'three';
import { makeArchGeometry, ARCH_NEEDLE } from './plushgeo.js';
import { species, PALETTES, NEEDLE, SPECIAL_MIN } from './plushdata.js';
import { patternGLSL, noiseGLSL } from './shaders.js';

// Renders species thumbnails with a tiny second WebGL context. Cached as data URLs.
const cache = new Map();      // species id -> data url (kept to ICON_CACHE entries: with 6,000+ species the dex would otherwise keep tens of MB of pictures)
const ICON_CACHE = 900;
const silhouettes = new Map(); // shape -> data url of the plain shape (what the Plushdex draws, black, for a species you have not found)
const patU = { value: 0 };
let rig = null;

function init() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setSize(128, 128, false);
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 10);
  cam.position.set(0.6, 0.5, 1.95);
  cam.lookAt(0, 0.1, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x887766, 1.8));
  const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(1, 2, 2); scene.add(d);
  const geos = [];
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  // patterned species (stripes, spots, two-tone) use the same pattern code as the pile (shaders.js)
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPat = patU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP2; varying vec3 vVC2;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP2 = position; vVC2 = color;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP2; varying vec3 vVC2; uniform float uPat;\n' + noiseGLSL + patternGLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (uPat > 0.5) diffuseColor.rgb = plushPattern(diffuseColor.rgb, uPat, vOP2, vVC2, 0.5);');
  };
  const mesh = new THREE.Mesh(geos[0], mat);
  mesh.rotation.y = -0.5;
  scene.add(mesh);
  rig = { r, scene, cam, geos, mesh, mat, canvas };
}

export function speciesIcon(id) {
  const hit = cache.get(id);
  if (hit !== undefined) { cache.delete(id); cache.set(id, hit); return hit; }   // most recently used goes last
  if (!rig) init();
  const s = species[id];
  if (!s) return '';
  const { r, scene, cam, geos, mesh, mat, canvas } = rig;
  mesh.geometry = geos[s.arch] || (geos[s.arch] = makeArchGeometry(s.arch, 1));
  mat.color.set(id === NEEDLE ? 0xffd24a : s.hex ? s.hex : PALETTES[s.pal][1]);
  patU.value = id < SPECIAL_MIN && s.pat ? s.pat : 0;
  r.render(scene, cam);
  const url = canvas.toDataURL('image/png');
  cache.set(id, url);
  if (cache.size > ICON_CACHE) cache.delete(cache.keys().next().value);
  return url;
}

// the picture of a species you have not found: only the shape counts (the Plushdex paints it black), so one per shape serves every species of it
export function silhouetteIcon(arch) {
  let url = silhouettes.get(arch);
  if (url) return url;
  if (!rig) init();
  const { r, scene, cam, geos, mesh, mat, canvas } = rig;
  mesh.geometry = geos[arch] || (geos[arch] = makeArchGeometry(arch, 1));
  mat.color.set(0xffffff); patU.value = 0;
  r.render(scene, cam);
  url = canvas.toDataURL('image/png');
  silhouettes.set(arch, url);
  return url;
}

// Turntable frames of The One for the dossier computer and kiosk screen.
let frames = null;
export function needleFrames(n = 24, size = 192) {
  if (frames) return frames;
  if (!rig) init();
  const { r, scene, cam, geos, mesh, mat, canvas } = rig;
  mesh.geometry = geos[ARCH_NEEDLE] || (geos[ARCH_NEEDLE] = makeArchGeometry(ARCH_NEEDLE, 1));
  mat.color.set(0xffd24a); patU.value = 0;
  const oldPos = cam.position.clone();
  frames = [];
  for (let i = 0; i < n; i++) {
    mesh.rotation.y = (i / n) * Math.PI * 2;
    r.render(scene, cam);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    c.getContext('2d').drawImage(canvas, 0, 0);
    frames.push(c);
  }
  mesh.rotation.y = -0.5;
  cam.position.copy(oldPos);
  void size;
  return frames;
}
