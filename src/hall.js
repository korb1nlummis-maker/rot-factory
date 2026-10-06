import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HALL_HX, HALL_HZ, HALL_H } from './config.js';
import { U } from './shaders.js';
import { mulberry32 } from './util.js';
import { FRAME_TYPES, STRUT_DEPTH, defaultTuning } from './upgrades.js';
import { earthTune, EARTH_KW, STALE_CHOKE } from './earth.js';
import { fanSpacing, staleAt, STALE_START, STALE_SPAN, STALE_OK, FAN_R, VENT_R } from './dust.js';

function canvasTex(w, h, draw, repeat = null, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function concreteTex(rep) {
  return canvasTex(1024, 1024, (g, w, h) => {
    const rnd = mulberry32(5);
    g.fillStyle = '#74766b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14000; i++) {
      const v = 90 + rnd() * 60;
      g.fillStyle = `rgba(${v},${v + 2},${v - 6},${0.08 + rnd() * 0.18})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    for (let i = 0; i < 26; i++) {
      const x = rnd() * w, y = rnd() * h, r = 40 + rnd() * 160;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(40,42,34,${0.1 + rnd() * 0.14})`); gr.addColorStop(1, 'rgba(40,42,34,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.strokeStyle = 'rgba(30,30,26,0.55)'; g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
    g.strokeStyle = 'rgba(20,20,18,0.3)'; g.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y);
      for (let s = 0; s < 14; s++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.2) * 40; g.lineTo(x, y); }
      g.stroke();
    }
  }, rep);
}

function wallTex(len) {
  return canvasTex(512, 512, (g, w, h) => {
    const rnd = mulberry32(9);
    g.fillStyle = '#8b8d78'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      const gr = g.createLinearGradient(x, 0, x + 32, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0.38)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
      g.fillStyle = gr; g.fillRect(x, 0, 32, h);
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(60,50,30,${rnd() * 0.12})`;
      g.fillRect(rnd() * w, rnd() * h, 2, 20 + rnd() * 80);
    }
  }, [len / 2.4, 8]);
}

function fitFont(g, text, weight, maxW, size, font) {
  let px = size;
  g.font = `${weight} ${px}px ${font}`;
  while (g.measureText(text).width > maxW && px > 8) { px -= 2; g.font = `${weight} ${px}px ${font}`; }
  return px;
}

function labelTex(text, w, h, opts = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = opts.bg || 'rgba(0,0,0,0)';
    g.fillRect(0, 0, w, h);
    g.fillStyle = opts.fg || '#fff';
    const font = opts.font || 'Helvetica, Arial, sans-serif';
    fitFont(g, text, opts.weight || 800, w * 0.88, opts.size || h * 0.5, font);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

export function buildHall(scene) {
  const hall = { colliders: [], flicker: [], update: null };

  // environment for PBR props
  const pm = new THREE.PMREMGenerator(window.__renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.28;

  // lights (also mirrored into plush shader uniforms)
  const hemi = new THREE.HemisphereLight(0xcfd6b0, 0x3a3326, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xe9f0d6, 1.2);
  sun.position.set(6, 40, 4);
  scene.add(sun);

  // floor
  const floorTex = concreteTex([HALL_HX / 3, HALL_HZ / 3]);
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTex, color: 0xdddddd });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL_HX * 2, HALL_HZ * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // floor markings
  const markTex = canvasTex(1024, 1024, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#e8c518'; g.lineWidth = 14; g.setLineDash([60, 30]);
    g.strokeRect(70, 70, w - 140, h - 140);
    g.setLineDash([]);
    g.fillStyle = '#e8c518'; g.textAlign = 'center';
    fitFont(g, 'SORTING BAY 07', '800', w - 260, 70, 'Helvetica, Arial'); g.fillText('SORTING BAY 07', w / 2, 170);
    g.fillStyle = 'rgba(232,197,24,0.8)';
    fitFont(g, 'KEEP CLEAR / HARD HATS REQUIRED', '700', w - 260, 38, 'Helvetica, Arial'); g.fillText('KEEP CLEAR / HARD HATS REQUIRED', w / 2, 220);
    for (let i = 0; i < 18; i++) { g.fillStyle = i % 2 ? '#111' : '#e8c518'; g.fillRect(70 + i * 50, h - 120, 50, 28); }
  });
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshStandardMaterial({ map: markTex, transparent: true, roughness: 0.7, depthWrite: false }));
  mark.rotation.x = -Math.PI / 2; mark.position.set(0, 0.01, -2.5);
  scene.add(mark);

  // walls
  const wt = wallTex(HALL_HX * 2);
  const wmat = new THREE.MeshLambertMaterial({ map: wt, color: 0xcfd0b8 });
  const mkWall = (w, px, pz, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, HALL_H), wmat);
    m.position.set(px, HALL_H / 2, pz); m.rotation.y = ry; scene.add(m);
  };
  mkWall(HALL_HZ * 2, HALL_HX, 0, -Math.PI / 2);
  mkWall(HALL_HZ * 2, -HALL_HX, 0, Math.PI / 2);
  mkWall(HALL_HX * 2, 0, HALL_HZ, Math.PI);
  mkWall(HALL_HX * 2, 0, -HALL_HZ, 0);

  // ceiling + trusses + lights
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALL_HX * 2, HALL_HZ * 2), new THREE.MeshLambertMaterial({ color: 0x4d4f46 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = HALL_H; scene.add(ceil);
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x2b2d2a, roughness: 0.6, metalness: 0.7 });
  const SP = 12, RW = 11;
  const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(SP * (RW * 2 + 1), 0.7, 0.5), beamMat, RW * 2 + 1);
  scene.add(beams);
  const lightGeo = new THREE.BoxGeometry(5.2, 0.14, 0.7);
  const lightsA = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.4, 2.9), toneMapped: true }), 700);
  const lightsB = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.4, 2.9) }), 200);
  scene.add(lightsA, lightsB);
  hall.flicker.push(lightsB.material);
  const chain = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4), beamMat, 2600);
  scene.add(chain);
  for (const m of [beams, lightsA, lightsB, chain]) m.frustumCulled = false;
  const m4 = new THREE.Matrix4();
  const rnd = mulberry32(12);
  // the ceiling fixtures are a window of the endless grid that follows the player
  let lastGX = 1e9, lastGZ = 1e9;
  const relight = (gx, gz) => {
    let na = 0, nb = 0, nc = 0;
    for (let b = -RW; b <= RW; b++) { m4.makeTranslation(gx * SP, HALL_H - 0.4, (gz + b) * SP); beams.setMatrixAt(b + RW, m4); }
    beams.instanceMatrix.needsUpdate = true;
    for (let dz = -RW; dz <= RW; dz++) for (let dx = -RW; dx <= RW; dx++) {
      const ix = gx + dx, iz = gz + dz;
      const h = (Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663)) >>> 0;
      const x = ix * SP, z = iz * SP;
      for (const off of [-0.9, 0.9]) {
        m4.makeTranslation(x, HALL_H - 1.2, z + off);
        if ((h % 5 === 0) && nb < 200) lightsB.setMatrixAt(nb++, m4); else if (na < 700) lightsA.setMatrixAt(na++, m4);
        if (nc < 2600) for (const cx of [-2.2, 2.2]) { m4.makeTranslation(x + cx, HALL_H - 0.6, z + off); chain.setMatrixAt(nc++, m4); }
      }
    }
    lightsA.count = na; lightsB.count = nb; chain.count = nc;
    lightsA.instanceMatrix.needsUpdate = lightsB.instanceMatrix.needsUpdate = chain.instanceMatrix.needsUpdate = true;
  };
  relight(0, 0);
  hall.relight = (camPos) => {
    const gx = Math.round(camPos.x / SP), gz = Math.round(camPos.z / SP);
    if (gx !== lastGX || gz !== lastGZ) { lastGX = gx; lastGZ = gz; relight(gx, gz); }
  };

  // ---------- station ----------
  const station = new THREE.Group();
  station.position.set(0, 0, 0);
  scene.add(station);

  const steel = new THREE.MeshStandardMaterial({ color: 0x3b4a5a, roughness: 0.38, metalness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.7, metalness: 0.4 });
  const hazard = new THREE.MeshStandardMaterial({
    map: canvasTex(256, 64, (g, w, h) => { for (let i = -2; i < 12; i++) { g.fillStyle = i % 2 ? '#101010' : '#f0c814'; g.beginPath(); g.moveTo(i * 32, h); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 64, 0); g.lineTo(i * 32 + 32, h); g.fill(); } }, [6, 1]),
    roughness: 0.6, metalness: 0.2,
  });
  const glowG = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.6, 0.9) });
  const glowO = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.2, 0.2) });

  // The Bin
  hall.binPos = new THREE.Vector3(3.2, 0, -4.4);
  const bin = new THREE.Group();
  bin.position.copy(hall.binPos);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 0.86, 1.15, 40, 1, true), steel);
  shell.position.y = 0.575;
  const shellIn = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.78, 1.15, 40, 1, true), dark);
  shellIn.material = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.9, side: THREE.BackSide });
  shellIn.position.y = 0.575;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.97, 0.05, 12, 56), glowG);
  rim.rotation.x = Math.PI / 2; rim.position.y = 1.15;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.03, 0.97, 0.22, 40, 1, true), hazard);
  band.position.y = 0.42;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.18, 0.12, 40), dark);
  base.position.y = 0.06;
  const furnace = new THREE.Mesh(new THREE.CircleGeometry(0.8, 36), glowO);
  furnace.rotation.x = -Math.PI / 2; furnace.position.y = 0.16;
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshBasicMaterial({ map: labelTex('SORT', 256, 96, { fg: '#0f1418', bg: '#9ef0b4', size: 70 }) }));
  lbl.position.set(0, 0.78, 1.02); lbl.rotation.x = -0.06;
  bin.add(shell, shellIn, rim, band, base, furnace, lbl);
  const binLight = new THREE.PointLight(0xff7a22, 6, 7, 1.6);
  binLight.position.set(0, 0.9, 0);
  bin.add(binLight);
  station.add(bin);
  hall.binRim = rim; hall.binFurnace = furnace; hall.binLight = binLight;
  hall.colliders.push({ x: hall.binPos.x, z: hall.binPos.z, r: 1.08, h: 1.15 });

  // Terminal (shop)
  hall.termPos = new THREE.Vector3(-3.0, 0, -4.6);
  const term = new THREE.Group();
  term.position.copy(hall.termPos);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.9), new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.55 }));
  desk.position.y = 0.95;
  const legsG = new THREE.BoxGeometry(0.07, 0.95, 0.07);
  for (const sx of [-0.92, 0.92]) for (const sz of [-0.38, 0.38]) { const l = new THREE.Mesh(legsG, steel); l.position.set(sx, 0.47, sz); term.add(l); }
  const mon = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.62, 0.07), dark);
  mon.position.set(0, 1.42, -0.1); mon.rotation.x = -0.12;
  const termCanvas = document.createElement('canvas'); termCanvas.width = 512; termCanvas.height = 330;
  const termTex = new THREE.CanvasTexture(termCanvas); termTex.colorSpace = THREE.SRGBColorSpace;
  hall.drawTerminal = (money) => {
    const g = termCanvas.getContext('2d');
    g.fillStyle = '#04140a'; g.fillRect(0, 0, 512, 330);
    g.fillStyle = '#58ff9a'; g.font = '700 34px ui-monospace, Menlo, monospace';
    g.fillText('ROT FACTORY OS 2.1', 24, 56);
    g.font = '500 26px ui-monospace, Menlo, monospace'; g.fillStyle = '#3bd878';
    g.fillText('> FLUFF BALANCE', 24, 120);
    g.fillStyle = '#c8ffd9'; g.font = '700 54px ui-monospace, Menlo, monospace';
    g.fillText(String(Math.floor(money)).padStart(7, ' '), 24, 184);
    g.fillStyle = '#3bd878'; g.font = '500 24px ui-monospace, Menlo, monospace';
    g.fillText('> PRESS [E] TO OPEN SHOP', 24, 250);
    g.fillText('> OR [TAB] ANYWHERE', 24, 286);
    termTex.needsUpdate = true;
  };
  hall.drawTerminal(0);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.54), new THREE.MeshBasicMaterial({ map: termTex, toneMapped: false }));
  screen.position.set(0, 1.42, -0.06); screen.rotation.x = -0.12;
  term.add(desk, mon, screen);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.25, 12), dark);
  stand.position.set(0, 1.08, -0.1); term.add(stand);
  // lamp on desk
  const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), steel);
  lampPost.position.set(0.75, 1.24, 0.1);
  const lampHead = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.18, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x2b7a4b, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }));
  lampHead.position.set(0.75, 1.52, 0.1);
  term.add(lampPost, lampHead);
  const deskLight = new THREE.PointLight(0xffe2a0, 3.2, 8, 1.7);
  deskLight.position.set(0.75, 1.4, 0.2);
  term.add(deskLight);
  hall.deskLight = deskLight;
  station.add(term);
  hall.colliders.push({ x: hall.termPos.x, z: hall.termPos.z, r: 1.1, h: 1.0 });
  // flip terminal front toward spawn: monitor rotated so screen faces +z in local; terminal rotated toward origin
  term.rotation.y = Math.atan2(0 - hall.termPos.x, -1.4 - hall.termPos.z);


  // ---- crafting table ----
  hall.craftPos = new THREE.Vector3(-7.2, 0, -4.8);
  const bench = new THREE.Group();
  bench.position.copy(hall.craftPos);
  bench.rotation.y = Math.atan2(0 - hall.craftPos.x, -1.4 - hall.craftPos.z);
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.6 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.9), wood); top.position.y = 0.95;
  for (const sx of [-0.9, 0.9]) for (const sz of [-0.38, 0.38]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.1), wood); l.position.set(sx, 0.47, sz); bench.add(l); }
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.7), wood); shelf.position.y = 0.35;
  const vise = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.2), steel); vise.position.set(-0.7, 1.12, 0.2);
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.22), dark); anvil.position.set(0.3, 1.11, 0);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 8), dark); horn.rotation.z = -Math.PI / 2; horn.position.set(0.62, 1.12, 0);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), wood); handle.position.set(-0.2, 1.03, -0.2); handle.rotation.y = 0.5;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.1), steel); head.position.set(-0.4, 1.03, -0.28);
  const lampB = new THREE.PointLight(0xffd080, 2.8, 7, 1.8); lampB.position.set(0, 1.9, 0.4);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.2, 1.6) })); bulb.position.set(0, 1.9, 0.4);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 5), dark); cord.position.set(0, 2.35, 0.4);
  const cSign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.3), new THREE.MeshBasicMaterial({ map: labelTex('CRAFTING [E]', 512, 140, { fg: '#ffe9b0', bg: '#2b2418', size: 64 }), toneMapped: false })); cSign.position.set(0, 1.55, -0.4);
  bench.add(top, shelf, vise, anvil, horn, handle, head, lampB, bulb, cord, cSign);
  station.add(bench);
  hall.colliders.push({ x: hall.craftPos.x, z: hall.craftPos.z, r: 1.15, h: 1.1 });

  // ---- dossier kiosk: shows the target plush on a turntable ----
  hall.kioskPos = new THREE.Vector3(-0.1, 0, -7.8);
  const kiosk = new THREE.Group();
  kiosk.position.copy(hall.kioskPos);
  kiosk.rotation.y = Math.atan2(0 - hall.kioskPos.x, -1.4 - hall.kioskPos.z);
  const kBase = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 0.7), dark); kBase.position.y = 0.15;
  const kPost = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.3), steel); kPost.position.set(0, 0.9, -0.05);
  const kFrame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, 0.12), dark); kFrame.position.set(0, 2.0, 0);
  const kCanvas = document.createElement('canvas'); kCanvas.width = 640; kCanvas.height = 420;
  const kTex = new THREE.CanvasTexture(kCanvas); kTex.colorSpace = THREE.SRGBColorSpace; kTex.anisotropy = 8;
  const kScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.05), new THREE.MeshBasicMaterial({ map: kTex, toneMapped: false }));
  kScreen.position.set(0, 2.0, 0.07);
  const kLight = new THREE.PointLight(0xffd870, 2.6, 6, 1.8); kLight.position.set(0, 2.0, 0.9);
  kiosk.add(kBase, kPost, kFrame, kScreen, kLight);
  station.add(kiosk);
  hall.colliders.push({ x: hall.kioskPos.x, z: hall.kioskPos.z, r: 0.95, h: 1.4 });
  hall.drawKiosk = (frame, t) => {
    const g = kCanvas.getContext('2d');
    g.fillStyle = '#12100a'; g.fillRect(0, 0, 640, 420);
    const gr = g.createRadialGradient(320, 230, 10, 320, 230, 300);
    gr.addColorStop(0, 'rgba(255,210,90,0.28)'); gr.addColorStop(1, 'rgba(255,210,90,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 640, 420);
    g.strokeStyle = 'rgba(255,200,80,0.25)'; g.lineWidth = 1;
    for (let x = 0; x < 640; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 420); g.stroke(); }
    for (let y = 0; y < 420; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(640, y); g.stroke(); }
    g.fillStyle = '#ffcf5a'; g.font = '900 56px Helvetica, Arial'; g.textAlign = 'center';
    g.fillText('WANTED', 320, 62);
    g.font = '700 22px ui-monospace, Menlo, monospace'; g.fillStyle = '#f5e6b0';
    g.fillText('IL ROTTO SUPREMO', 320, 94);
    if (frame) g.drawImage(frame, 160, 100, 320, 320);
    g.textAlign = 'left'; g.font = '600 15px ui-monospace, Menlo, monospace'; g.fillStyle = '#d8c58a';
    g.fillText('GOLD / CROWNED', 24, 160); g.fillText('HALO RING', 24, 184); g.fillText('SQUEAKS ONCE', 24, 208);
    g.textAlign = 'right';
    g.fillText('LAST SEEN: UNKNOWN', 616, 160); g.fillText('REWARD: EXIT', 616, 184); g.fillText('PRESS [E]', 616, 208);
    g.fillStyle = `rgba(255,255,255,${0.04 + 0.03 * Math.sin(t * 40)})`; g.fillRect(0, (t * 90) % 420, 640, 3);
    kTex.needsUpdate = true;
  };
  hall.drawKiosk(null, 0);

  // ---- signage: real-looking warehouse signs ----
  const signFont = 'Helvetica, Arial, sans-serif';
  // ISO-style emergency EXIT: green field, white border, running man and arrow, lit from inside
  const drawExit = (flip) => (g, w, h) => {
    g.fillStyle = '#0a7d3c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#eafff1'; g.lineWidth = 12; g.strokeRect(14, 14, w - 28, h - 28);
    // running man (simple pictogram). On the back face the pictograms are mirrored so the arrow still points east.
    g.save(); // (no mirroring: the back face is turned around, so it already reads the right way)
    const cx = 250, cy = 200; g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineWidth = 22; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.arc(cx + 24, cy - 112, 24, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(cx + 14, cy - 76); g.lineTo(cx - 6, cy - 6); g.lineTo(cx - 52, cy + 22); g.stroke();
    g.beginPath(); g.moveTo(cx - 6, cy - 6); g.lineTo(cx + 40, cy + 36); g.lineTo(cx + 34, cy + 100); g.stroke();
    g.beginPath(); g.moveTo(cx + 12, cy - 66); g.lineTo(cx + 64, cy - 56); g.lineTo(cx + 96, cy - 82); g.stroke();
    g.beginPath(); g.moveTo(cx + 10, cy - 62); g.lineTo(cx - 46, cy - 38); g.stroke();
    // two heavy arrows pointing down: you walk on under the sign, toward the exit
    g.restore();
    for (const ax of [88, 936]) { g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineWidth = 30; g.lineCap = 'round'; g.beginPath(); g.moveTo(ax, 70); g.lineTo(ax, 250); g.stroke(); g.beginPath(); g.moveTo(ax - 52, 200); g.lineTo(ax, 300); g.lineTo(ax + 52, 200); g.closePath(); g.fill(); g.lineWidth = 18; g.stroke(); }
    g.fillStyle = '#ffffff'; g.font = `800 190px ${signFont}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', 640, 196);
  };
  const exitTex = canvasTex(1024, 384, drawExit(false)), exitTexBack = canvasTex(1024, 384, drawExit(true));
  // a big hanging exit sign: it glows green, hangs from four cords that run all the way to the ceiling, shows down arrows, and faces along the way to the exit
  const mkEmerg = (x, y, z, ry) => {
    const grp = new THREE.Group(); grp.name = 'exitSign'; grp.position.set(x, y, z); grp.rotation.y = ry;
    const W = 3.6, H = 1.35;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W + 0.14, H + 0.14, 0.16), new THREE.MeshStandardMaterial({ color: 0x1a1d1f, roughness: 0.5, metalness: 0.8 }));
    const glowMat = (tex) => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.15, 1.3, 1.15) });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), glowMat(exitTex)); face.position.z = 0.085;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), glowMat(exitTexBack)); back.position.z = -0.085; back.rotation.y = Math.PI;
    grp.add(body, face, back);
    const rise = Math.max(0.5, HALL_H - y - H / 2), cm = new THREE.MeshStandardMaterial({ color: 0x7a8086, metalness: 0.9, roughness: 0.35 });
    const cord = new THREE.CylinderGeometry(0.014, 0.014, rise, 6);
    for (const sx of [-1.6, 1.6]) for (const sz of [-0.05, 0.05]) { const c = new THREE.Mesh(cord, cm); c.position.set(sx, H / 2 + rise / 2, sz); grp.add(c); }
    for (const sx of [-1.6, 1.6]) { const plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.22), cm); plate.position.set(sx, H / 2 + rise, 0); grp.add(plate); }
    // soft halo on both sides so it reads as lit from inside, and light that spills on the floor below
    const halo = new THREE.MeshBasicMaterial({ color: 0x38ff8a, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    for (const sz of [0.12, -0.12]) { const h = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.12, H * 1.4), halo); h.position.z = sz; if (sz < 0) h.rotation.y = Math.PI; grp.add(h); }
    const glow = new THREE.PointLight(0x40ff90, 7, 10, 1.6); glow.position.set(0, -0.5, 0.0); grp.add(glow);
    scene.add(grp); return grp;
  };
  mkEmerg(6.2, 3.3, 1.6, Math.PI / 2);
  mkEmerg(2.4, 3.3, -9.4, Math.PI / 2);
  // ANSI-style DO NOT CLIMB: white plate, red ring and bar over a climbing figure, black text, on a bolted post
  const climbTex = canvasTex(512, 768, (g, w, h) => {
    g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c81414'; g.fillRect(0, 0, w, 150); g.fillStyle = '#fff'; g.font = `900 108px ${signFont}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('DANGER', w / 2, 84);
    g.strokeStyle = '#111'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    // climbing figure on a slope
    g.strokeStyle = '#111'; g.fillStyle = '#111'; g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); g.moveTo(90, 520); g.lineTo(250, 400); g.lineTo(420, 330); g.stroke();
    g.beginPath(); g.arc(300, 270, 26, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(292, 306); g.lineTo(262, 372); g.stroke(); g.beginPath(); g.moveTo(262, 372); g.lineTo(206, 408); g.stroke(); g.beginPath(); g.moveTo(262, 372); g.lineTo(300, 430); g.stroke();
    g.beginPath(); g.moveTo(288, 318); g.lineTo(346, 296); g.stroke(); g.beginPath(); g.moveTo(286, 322); g.lineTo(236, 348); g.stroke();
    // prohibition ring + bar
    g.strokeStyle = '#d01818'; g.lineWidth = 26; g.beginPath(); g.arc(256, 380, 168, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(140, 262); g.lineTo(372, 498); g.stroke();
    g.fillStyle = '#111'; g.font = `900 68px ${signFont}`; g.fillText('DO NOT CLIMB', w / 2, 612);
    g.font = `700 36px ${signFont}`; g.fillText('PLUSH PILES SLIDE WITHOUT WARNING', w / 2, 672); g.font = `600 30px ${signFont}`; g.fillText('Support tunnels. Stay off the slope.', w / 2, 716);
  });
  const mkClimb = (x, z, ry) => {
    const grp = new THREE.Group(); grp.name = 'climbSign'; grp.position.set(x, 0, z); grp.rotation.y = ry;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.1, 10), new THREE.MeshStandardMaterial({ color: 0x4c5258, metalness: 0.85, roughness: 0.4 })); post.position.y = 1.05;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.05, 20), new THREE.MeshStandardMaterial({ color: 0x23272b, metalness: 0.7, roughness: 0.5 })); base.position.y = 0.025;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.93, 0.025), new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.4, metalness: 0.2 })); plate.position.set(0, 1.55, 0.04);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.88), new THREE.MeshStandardMaterial({ map: climbTex, roughness: 0.35, metalness: 0.1 })); face.position.set(0, 1.55, 0.054);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.97, 0.012), new THREE.MeshStandardMaterial({ color: 0x777c80, metalness: 0.9, roughness: 0.35 })); rim.position.set(0, 1.55, 0.03);
    grp.add(post, base, rim, plate, face);
    scene.add(grp); hall.colliders.push({ x, z, r: 0.2, h: 2.1 }); return grp;
  };
  mkClimb(8.0, -2.6, -Math.PI / 2); mkClimb(8.0, 3.4, -Math.PI / 2); mkClimb(5.4, 7.0, Math.PI + 0.7); mkClimb(-5.4, 6.4, Math.PI - 0.7);
  mkClimb(-7.4, 0.8, Math.PI / 2);

  // ---- chalkboard on an easel: the rules of the game, in chalk ----
  const chalkTex = canvasTex(1024, 720, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#26342e'); gr.addColorStop(1, '#1b2622'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let n = 0; n < 900; n++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.045})`; g.fillRect(Math.random() * w, Math.random() * h, 30 + Math.random() * 120, 2 + Math.random() * 8); } // old chalk smears
    const chalk = '#f1eee2'; g.fillStyle = chalk; g.strokeStyle = chalk; g.textBaseline = 'middle';
    const hand = 'Chalkboard SE, Chalkduster, Bradley Hand, Segoe Print, Comic Sans MS, cursive';
    g.textAlign = 'center'; g.font = `700 64px ${hand}`; g.fillText('RULES OF THE SHIFT', w / 2, 62); g.lineWidth = 5; g.beginPath(); g.moveTo(230, 104); g.lineTo(790, 100); g.stroke();
    g.textAlign = 'left'; g.font = `500 41px ${hand}`;
    const rules = [
      'Millions of plush. ONE matters: the Rotto.',
      'Click = grab. Click again = throw.',
      'Stand near the bin: it eats what you carry.',
      'Cash buys bags, tools, crew (desk: E).',
      'Dig tunnels. Prop the roof. F = flashlight.',
      'DO NOT CLIMB. Piles slide.',
      'Cannot find it? Exit is 4.9 km EAST  →',
    ];
    rules.forEach((t, n) => { const y = 168 + n * 74; g.fillText((n + 1) + '.', 52, y); g.fillText(t, 112, y + (n % 2 ? 2 : -2)); });
    g.lineWidth = 4; g.beginPath(); g.moveTo(112, 168 + 5 * 74 + 26); g.lineTo(420, 168 + 5 * 74 + 24); g.stroke(); // underline the warning
    // a chalk plush doodle
    g.beginPath(); g.arc(900, 640, 40, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(880, 630, 5, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(920, 630, 5, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(900, 650, 12, 0.1, Math.PI - 0.1); g.stroke();
  });
  const board = new THREE.Group(); board.name = 'chalkboard'; board.position.set(8.0, 0, -11.2); board.rotation.y = 0;
  const boardWood = new THREE.MeshStandardMaterial({ color: 0x8a6238, roughness: 0.85 });
  const bf = new THREE.Mesh(new THREE.BoxGeometry(1.78, 1.28, 0.07), boardWood); bf.position.set(0, 1.45, 0);
  const bs = new THREE.Mesh(new THREE.PlaneGeometry(1.64, 1.15), new THREE.MeshStandardMaterial({ map: chalkTex, roughness: 0.95, metalness: 0 })); bs.position.set(0, 1.45, 0.037);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.12), boardWood); tray.position.set(0, 0.8, 0.07);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x6e4c2a, roughness: 0.9 });
  for (const sx of [-0.7, 0.7]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.9, 0.06), legMat); leg.position.set(sx, 0.9, -0.28); leg.rotation.x = 0.14; board.add(leg); }
  const frontLeg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), legMat); frontLeg.position.set(0, 0.4, 0.02);
  const chalkMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e4, roughness: 0.9 });
  for (const [cx, cl] of [[-0.3, 0.09], [-0.1, 0.07], [0.2, 0.11]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, cl, 8), chalkMat); c.rotation.z = Math.PI / 2; c.position.set(cx, 0.84, 0.08); board.add(c); }
  board.add(bf, bs, tray, frontLeg); board.scale.setScalar(1.3); scene.add(board);
  hall.colliders.push({ x: 8.0, z: -11.2, r: 0.75, h: 2.4 });

  // ---- the hub plaza: a darker mat with hazard-yellow edges under the service stations and the gallery ----
  { const mat = new THREE.Mesh(new THREE.PlaneGeometry(22, 14.4), new THREE.MeshLambertMaterial({ color: 0x3a3c37 })); mat.rotation.x = -Math.PI / 2; mat.position.set(-0.5, 0.012, -8.2); scene.add(mat);
    const ym = new THREE.MeshBasicMaterial({ color: 0xd9b429 });
    for (const [w, d, x, z] of [[22, 0.12, -0.5, -1.0], [22, 0.12, -0.5, -15.4], [0.12, 14.4, -11.5, -8.2], [0.12, 14.4, 10.5, -8.2]]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ym); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.016, z); scene.add(l); } }

  // ---- more chalkboards: how deep each piece can go, the air, what to carry, how to dig. Every number comes from the game data. ----
  hall.boards = [];
  const GAL_Z = -11.2; // the chalkboard gallery: one straight row behind the service stations
  const HAND = 'Chalkboard SE, Chalkduster, Bradley Hand, Segoe Print, Comic Sans MS, cursive';
  const fm = (v) => (isFinite(v) ? (v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + ' km' : v + ' m') : 'any depth');
  const makeBoard = (x, z, title, rows, foot = '', rot = 0) => {
    const rec = { title, rows, foot, overflow: false, x, z };
    const tex = canvasTex(1024, 720, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#26342e'); gr.addColorStop(1, '#1b2622'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let n = 0; n < 900; n++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.045})`; g.fillRect(Math.random() * w, Math.random() * h, 30 + Math.random() * 120, 2 + Math.random() * 8); }
      const chalk = '#f1eee2'; g.fillStyle = chalk; g.strokeStyle = chalk; g.textBaseline = 'middle'; g.textAlign = 'center'; g.font = `700 58px ${HAND}`; g.fillText(title, w / 2, 52);
      g.lineWidth = 5; g.beginPath(); g.moveTo(120, 92); g.lineTo(w - 120, 88); g.stroke(); g.textAlign = 'left';
      const n = rows.length, step = Math.min(56, (h - 190 - (foot ? 70 : 0)) / n), fs = Math.round(Math.min(40, step * 0.72));
      g.font = `500 ${fs}px ${HAND}`;
      rows.forEach((r, i) => {
        const y = 140 + i * step; const left = Array.isArray(r) ? r[0] : r, right = Array.isArray(r) ? r[1] : '';
        if (left.startsWith('#')) { g.font = `700 ${fs}px ${HAND}`; g.fillStyle = '#ffe9a8'; g.fillText(left.slice(1), 44, y); g.fillStyle = chalk; g.font = `500 ${fs}px ${HAND}`; return; }
        g.fillText(left, 44, y + (i % 2 ? 1 : -1)); if (g.measureText(left).width > (right ? 560 : 930)) rec.overflow = true;
        if (right) { g.textAlign = 'right'; g.fillText(right, w - 44, y); g.textAlign = 'left'; if (g.measureText(left).width + g.measureText(right).width > 920) rec.overflow = true; }
      });
      if (foot) { g.font = `600 ${Math.round(fs * 0.9)}px ${HAND}`; g.fillStyle = '#ffd98a'; g.textAlign = 'center'; foot.split('\n').forEach((ln, i) => { g.fillText(ln, w / 2, h - 52 + i * 34 - (foot.split('\n').length - 1) * 17); if (g.measureText(ln).width > 960) rec.overflow = true; }); }
    });
    const b = new THREE.Group(); b.name = 'chalkboard'; b.position.set(x, 0, z); b.rotation.y = rot; // the gallery row faces the bay; the east column faces west
    const bf2 = new THREE.Mesh(new THREE.BoxGeometry(1.78, 1.28, 0.07), boardWood); bf2.position.set(0, 1.45, 0);
    const bs2 = new THREE.Mesh(new THREE.PlaneGeometry(1.64, 1.15), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 })); bs2.position.set(0, 1.45, 0.037);
    const tr2 = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.12), boardWood); tr2.position.set(0, 0.8, 0.07);
    for (const sx of [-0.7, 0.7]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.9, 0.06), legMat); leg.position.set(sx, 0.9, -0.28); leg.rotation.x = 0.14; b.add(leg); }
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), legMat); fl.position.set(0, 0.4, 0.02);
    b.add(bf2, bs2, tr2, fl); b.scale.setScalar(1.3); scene.add(b); hall.colliders.push({ x, z, r: 0.75, h: 2.4 }); hall.boards.push(rec); return b;
  };
  // 1. how deep each support can go
  makeBoard(-8.0, GAL_Z, 'HOW DEEP CAN IT GO?', [
    ...Object.entries(FRAME_TYPES).map(([k, f]) => [`${f.name}`, `${fm(f.maxDepth)}   reach ${f.radius} m`]),
    ['Strut / Hydraulic Jack', `${STRUT_DEPTH.strut} m / ${STRUT_DEPTH.jack} m`],
  ], 'At 85% of its rating a support creaks. At 100% it breaks.\nWide rooms and long spans need more supports sharing the weight.');
  // 2. the air
  const fsp = (d) => { const s = fanSpacing(d); return isFinite(s) ? `a fan every ${s.toFixed(s < 10 ? 1 : 0)} m` : 'no fan needed'; };
  makeBoard(-4.0, GAL_Z, 'AIR AT DEPTH', [
    `Past ${STALE_START} m the air in a tunnel goes stale.`,
    `Fresh enough to ${Math.round(STALE_START + STALE_OK * STALE_SPAN)} m. Then you cough.`,
    '#Support Fans: how many',
    ...[400, 500, 600, 800, 1000, 1500].map((d) => [`at ${d} m deep`, fsp(d)]),
    `A Support Fan blows ${FAN_R} m the way you face.`,
    `Rule: spacing = ${STALE_OK} x ${FAN_R} / stale. Needs power.`,
  ], 'Vent Fan: ' + VENT_R + ' m all around. Respirator: 20% less dust per level.\nCough = walk out. Pass out = you wake at a depot.');
  // 3. what to carry, by depth
  makeBoard(0.0, GAL_Z, 'SURVIVING THE DEPTH', [
    ['0 to 150 m', 'timber, struts, lantern, flares'],
    ['150 to 380 m', 'steel frames, Structural Survey'],
    ['375 m and up', 'Support Fans, Respirator'],
    ['800 m and up', 'concrete, Air Tank, a Depot'],
    ['1,300 m and up', 'rebar, Hard Hat, Padding'],
    ['4.9 km', 'the exit. Bring everything.'],
    '#Always',
    ['Stress Lens', 'amber = soon, red = now'],
    ['Rope Anchors', 'safe footing on the slope'],
    ['Depot Beacon', 'recall and sell far out'],
    ['Medkit, canister', 'first aid and 40 s of air'],
  ], 'The Survey shows depth, load and the fan spacing you need.');
  // 4. how to dig
  makeBoard(4.0, GAL_Z, 'TUNNEL CRAFT', [
    '1. Dig the 4 x 4 section out first.',
    '2. Set a frame. It never digs for you.',
    '3. Left and Right turn a frame: curves.',
    '4. Down arrow: back to the grid.',
    `5. Unsupported roof: about 7 m near the top,`,
    '    less the deeper and heavier it gets.',
    '6. Frames, struts and jacks share the load.',
    '7. Hammer a support to read its load.',
    '8. Tamping adds 1.2 m of safe roof a level.',
    '9. A creaking roof is about to fall. Leave.',
  ], 'Remove supports and the tunnel comes down.');

  // 6 and 7. the controls: short versions of the pause menu's Controls tab (a test checks every key named here is a real control)
  hall.controlBoards = [
    ['CONTROLS: MOVING AND HANDS', [
      '#Moving', ['W A S D', 'walk'], ['Shift', 'sprint'], ['Space', 'jump (hold: punch up)'], ['C or Ctrl', 'crouch'],
      '#Hands', ['Left click', 'grab (hold) / throw'], ['Z', 'throw one'], ['Right click or P', 'punch'], ['E', 'use what you aim at'],
      ['F', 'flashlight'], ['K', 'medkit'], ['U', 'cart out / stow'], ['H (hold)', 'recall to depot'],
    ], 'Pause menu, Controls tab: every key in full.', ['KeyW', 'ShiftLeft', 'Space', 'KeyC', 'Mouse0', 'KeyZ', 'Mouse2', 'KeyE', 'KeyF', 'KeyK', 'KeyU', 'KeyH']],
    ['CONTROLS: TOOLS AND SCREENS', [
      '#Tools and building', ['1 to 9, [ ]', 'pick a hotbar tool'], ['Q', 'tool away / out'], ['B (hold)', 'set down / lay belts'], ['Left Right', 'turn a frame'],
      ['Down', 'frame back to grid'], ['X', 'take back what you aim at'], ['I', 'inventory'],
      '#Crew and screens', ['V', 'crew panel'], ['T / Y', 'dig ahead / call home'], ['Tab', 'upgrade terminal'], ['N  L  J', 'dex, journal, awards'], ['Esc', 'pause menu'],
    ], 'Wires: Left click a machine, then another.', ['Digit1', 'KeyQ', 'KeyB', 'ArrowLeft', 'ArrowDown', 'KeyX', 'KeyI', 'KeyV', 'KeyT', 'KeyY', 'Tab', 'KeyN', 'KeyL', 'KeyJ', 'Escape']],
  ];
  hall.controlBoards.forEach(([title, rows, foot], n) => makeBoard(8.8, -8.6 + n * 3.2, title, rows, foot, -Math.PI / 2));

  // 5. the earth movers: what they dig, what they need, what stops them. Every number comes from the game data.
  { const T0 = defaultTuning(), ex = earthTune(T0, 'excavator'), dz = earthTune(T0, 'dozer'), wh = earthTune(T0, 'wheel'), tk = earthTune(T0, 'truck'); const choke = Math.round(STALE_START + STALE_CHOKE * STALE_SPAN);
    makeBoard(8.8, -2.2, 'EARTH MOVERS', [
      ['Excavator', `${2 * ex.latHalf + 1} x ${ex.vert} face, ${ex.hopper} hopper`],
      ['Bulldozer', `${dz.blade} wide blade, ${dz.vert} high`],
      ['Bucket-Wheel', `${2 * wh.latHalf + 1} x ${wh.vert} face, ${wh.hopper} hopper`],
      ['Haul Truck', `${tk.bed} plush, ${tk.range} m radio`],
      '#Rules',
      'Hopper full? A belt behind it, a truck, or E.',
      'The canopy is rated like your best frame:',
      '    too heavy for it and the machine halts.',
      `Past ${choke} m stale air stops it: hang a fan.`,
      'They leave The One where it is.',
    ], `Power: Excavator ${EARTH_KW.excavator} kW, Dozer ${EARTH_KW.dozer}, Wheel ${EARTH_KW.wheel}, Truck ${EARTH_KW.truck}.\nTrucks sell at the bin or a Depot Beacon.`); }

  // EXIT door in +X wall
  const door = new THREE.Group();
  door.position.set(HALL_HX - 0.05, 0, 0);
  door.rotation.y = -Math.PI / 2;
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x4f5a4f, roughness: 0.5, metalness: 0.8 });
  const dl = new THREE.Mesh(new THREE.BoxGeometry(2.1, 3.8, 0.12), doorMat); dl.position.set(-1.1, 1.9, 0);
  const dr = new THREE.Mesh(new THREE.BoxGeometry(2.1, 3.8, 0.12), doorMat); dr.position.set(1.1, 1.9, 0);
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: labelTex('EXIT', 256, 80, { fg: '#e6fff0', bg: '#0b8a3e', size: 64 }), toneMapped: false }));
  exitSign.position.set(0, 4.3, 0.1);
  const light = new THREE.PointLight(0x4dff9a, 14, 14, 1.5); light.position.set(0, 3, 1.2);
  door.add(dl, dr, exitSign, light);
  hall.doorLight = light;
  scene.add(door);

  // dust motes
  const nm = 500;
  const mp = new Float32Array(nm * 3);
  for (let i = 0; i < nm; i++) { mp[i * 3] = (rnd() - 0.5) * 36; mp[i * 3 + 1] = rnd() * 16; mp[i * 3 + 2] = (rnd() - 0.5) * 36; }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xfff6d0, size: 0.05, transparent: true, opacity: 0.4, depthWrite: false, sizeAttenuation: true }));
  scene.add(motes);
  hall.motes = motes;

  hall.level = 1;
  // 0 = pitch dark (closed / grid down), 1 = lights on
  hall.setLevel = (v) => {
    hall.level = v;
    const c = new THREE.Color(0.25, 0.05, 0.03).lerp(new THREE.Color(3.2, 3.4, 2.9), v);
    lightsA.material.color.copy(c); lightsB.material.color.copy(c);
    sun.intensity = 0.05 + 1.15 * v; hemi.intensity = 0.03 + 0.52 * v;
  };
  hall.update = (t, camPos) => {
    hall.relight(camPos);
    hall.doorLight.intensity = camPos.x > HALL_HX - 80 ? 14 : 0;
    // the ceiling panel flickers in the warehouse, but never behind the title screen (it read as the logo blinking)
    hall.flicker[0].color.setScalar(hall.calm ? 1.9 : 0.7 + 2.5 * (Math.sin(t * 31) * Math.sin(t * 7.3) > -0.82 ? 1 : 0.15));
    hall.binRim.material.color.setRGB(0.4, 2.2 + Math.sin(t * 3) * 0.5, 0.9);
    hall.binLight.intensity = 5 + Math.sin(t * 9) * 0.8 + Math.sin(t * 23) * 0.6;
    motes.position.set(Math.round(camPos.x / 36) * 36, 0, Math.round(camPos.z / 36) * 36);
    const arr = mg.attributes.position.array;
    for (let i = 0; i < nm; i++) {
      arr[i * 3] += Math.sin(t * 0.3 + i) * 0.0008;
      arr[i * 3 + 1] += Math.cos(t * 0.2 + i * 0.7) * 0.0006;
    }
    mg.attributes.position.needsUpdate = true;
  };
  hall.sun = sun; hall.hemi = hemi;
  return hall;
}
