import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HALL_HX, HALL_HZ, HALL_H } from './config.js';
import { U } from './shaders.js';
import { mulberry32 } from './util.js';

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
  hall.termPos = new THREE.Vector3(-2.6, 0, -4.6);
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
  hall.craftPos = new THREE.Vector3(-6.4, 0, -6.4);
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
  hall.kioskPos = new THREE.Vector3(-0.2, 0, -8.4);
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

  // crates, pallets, props
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a7650, roughness: 0.8 });
  const palletMat = new THREE.MeshStandardMaterial({ color: 0x6b5233, roughness: 0.9 });
  const props = [[-5.8, -2.8, 1.1, 0.4], [-5.0, -3.6, 0.8, 1.1], [6.2, -6.2, 1.2, 0.2], [5.3, -7.0, 0.9, 0.7], [-1.2, -8.2, 1.0, 0.1]];
  for (const [px, pz, s, ry] of props) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.9, s), crateMat);
    c.position.set(px, s * 0.45 + 0.14, pz); c.rotation.y = ry;
    const p = new THREE.Mesh(new THREE.BoxGeometry(s * 1.15, 0.14, s * 1.15), palletMat);
    p.position.set(px, 0.07, pz); p.rotation.y = ry;
    scene.add(c, p);
    hall.colliders.push({ x: px, z: pz, r: s * 0.72, h: s * 0.9 + 0.14 });
  }

  // ---- signage: real-looking warehouse signs ----
  const signFont = 'Helvetica, Arial, sans-serif';
  // ISO-style emergency EXIT: green field, white border, running man and arrow, lit from inside
  const drawExit = (flip) => (g, w, h) => {
    g.fillStyle = '#0a7d3c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#eafff1'; g.lineWidth = 12; g.strokeRect(14, 14, w - 28, h - 28);
    // running man (simple pictogram). On the back face the pictograms are mirrored so the arrow still points east.
    g.save(); if (flip) { g.translate(w, 0); g.scale(-1, 1); }
    const cx = 170, cy = 200; g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineWidth = 22; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.arc(cx + 24, cy - 112, 24, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(cx + 14, cy - 76); g.lineTo(cx - 6, cy - 6); g.lineTo(cx - 52, cy + 22); g.stroke();
    g.beginPath(); g.moveTo(cx - 6, cy - 6); g.lineTo(cx + 40, cy + 36); g.lineTo(cx + 34, cy + 100); g.stroke();
    g.beginPath(); g.moveTo(cx + 12, cy - 66); g.lineTo(cx + 64, cy - 56); g.lineTo(cx + 96, cy - 82); g.stroke();
    g.beginPath(); g.moveTo(cx + 10, cy - 62); g.lineTo(cx - 46, cy - 38); g.stroke();
    // arrow east
    g.lineWidth = 26; g.beginPath(); g.moveTo(820, 192); g.lineTo(990, 192); g.stroke(); g.lineWidth = 22; g.beginPath(); g.moveTo(930, 130); g.lineTo(996, 192); g.lineTo(930, 254); g.stroke();
    g.restore();
    g.fillStyle = '#ffffff'; g.font = `800 190px ${signFont}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', 520, 196);
  };
  const exitTex = canvasTex(1024, 384, drawExit(false)), exitTexBack = canvasTex(1024, 384, drawExit(true));
  const mkEmerg = (x, y, z, ry) => {
    const grp = new THREE.Group(); grp.name = 'exitSign'; grp.position.set(x, y, z); grp.rotation.y = ry;
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.1), new THREE.MeshStandardMaterial({ color: 0x1a1d1f, roughness: 0.5, metalness: 0.8 }));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.86), new THREE.MeshBasicMaterial({ map: exitTex, toneMapped: false })); face.position.z = 0.056;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.86), new THREE.MeshBasicMaterial({ map: exitTexBack, toneMapped: false })); back.position.z = -0.056; back.rotation.y = Math.PI;
    grp.add(body, face, back);
    const chain = new THREE.CylinderGeometry(0.012, 0.012, 1.1, 6), cm = new THREE.MeshStandardMaterial({ color: 0x666b70, metalness: 0.9, roughness: 0.4 });
    for (const sx of [-1, 1]) { const c = new THREE.Mesh(chain, cm); c.position.set(sx * 1.0, 1.0, 0); grp.add(c); }
    const glow = new THREE.PointLight(0x40ff90, 5, 7, 1.6); glow.position.set(0, -0.1, 0.6); grp.add(glow);
    scene.add(grp); return grp;
  };
  mkEmerg(6.2, 3.0, 1.6, -0.12);
  mkEmerg(2.0, 3.4, -9.4, 0);
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
      'F or click = grab. Click again = throw.',
      'Stand near the bin: it eats what you carry.',
      'Cash buys bags, tools, crew (desk: E).',
      'Dig tunnels. Prop the roof or it falls.',
      'DO NOT CLIMB. Piles slide.',
      'Cannot find it? Exit is 3 km EAST  →',
    ];
    rules.forEach((t, n) => { const y = 168 + n * 74; g.fillText((n + 1) + '.', 52, y); g.fillText(t, 112, y + (n % 2 ? 2 : -2)); });
    g.lineWidth = 4; g.beginPath(); g.moveTo(112, 168 + 5 * 74 + 26); g.lineTo(420, 168 + 5 * 74 + 24); g.stroke(); // underline the warning
    // a chalk plush doodle
    g.beginPath(); g.arc(900, 640, 40, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(880, 630, 5, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(920, 630, 5, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(900, 650, 12, 0.1, Math.PI - 0.1); g.stroke();
  });
  const board = new THREE.Group(); board.name = 'chalkboard'; board.position.set(4.4, 0, 2.6); board.rotation.y = Math.atan2(-4.4, -4.0);
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
  hall.colliders.push({ x: 4.4, z: 2.6, r: 0.75, h: 2.4 });

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
