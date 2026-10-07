import { findInfoRef } from '../info.js';
export default async function (ctx) {
  const { T, g, S, fresh, spot, toI, toK, cellX, cellZ, w, THREE } = ctx;
  await T('info.a-frame-reads-out-only-when-you-look-at-its-wood-not-from-inside', async () => {
    fresh({ timber: 1 }); const sp = spot(); const i0 = sp.i + 6, k0 = sp.k - 2; for (let a = -2; a < 8; a++) for (let b = -2; b < 8; b++) for (let j = 0; j < 6; j++) w().removeCell(i0 + a, j, k0 + b, false);
    const e = g.machines.frameEnt('x', 'timber', i0, k0, 0); delete e.clear; const ent = { id: g.nextId(), type: 'frame', ...e }; S().entities.push(ent); g.addEntity(ent);
    const cam = g.renderer.camera, P = g.player; const aim = (x, y, z, yaw, pitch) => { cam.position.set(x, y, z); P.yaw = yaw; P.pitch = pitch; };
    const bad = []; const w2 = ent.w / 2, d2 = (ent.d || 2.36) / 2;
    // inside the cube, looking straight down its open axis: nothing of the frame is in the way
    aim(ent.cx - d2 + 0.3, 1.3, ent.cz, Math.PI / 2, 0); if (findInfoRef(g) && findInfoRef(g).id === ent.id) bad.push('read out the frame from the hollow inside it');
    // outside, looking at the corner pillar
    const px = ent.cx - d2, pz = ent.cz - w2; aim(px - 2.2, 1.3, pz, Math.PI / 2, 0); const r = findInfoRef(g); if (!r || r.id !== ent.id) bad.push('did not read out the frame when looking at a pillar: ' + JSON.stringify(r));
    return bad.length === 0 || bad.join('; ');
  });
  await T('light.depth-only-exists-under-a-roof-not-in-an-open-pit', async () => {
    const { fresh, spot } = ctx; fresh({ timber: 1, survey: 1 }); const sp = spot(); const bad = [];
    const x = cellX(sp.i + 40), z = cellZ(sp.k);
    // an open pit: nothing above the head
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) for (let j = 0; j < 80; j++) w().removeCell(sp.i + 40 + a, j, sp.k + b, false);
    const open = g.coverDepth({ x, y: 0, z }); if (open !== 0) bad.push('open pit reads depth ' + open.toFixed(0));
    // the same spot under a roof
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) w().setCell(sp.i + 40 + a, 6, sp.k + b, 2, 0);
    const under = g.coverDepth({ x, y: 0, z }); if (!(under > 20)) bad.push('under a roof reads depth ' + under.toFixed(0));
    return bad.length === 0 || bad.join('; ');
  });
  await T('hud.tunnel-depth-dial-reads-the-distance-against-the-best-frame', async () => {
    const D = (id) => g.ui.dials.read(id), bad = [];
    g.ui.setTunnel(0, 380, 'Steel'); if (D('tunnel').on) bad.push('shown in the open');
    g.ui.setTunnel(120, 380, 'Steel'); let d = D('tunnel'); if (!d.on || d.val !== '120' || d.unit !== 'm' || d.state !== 'ok') bad.push('120 m: ' + JSON.stringify([d.on, d.val, d.unit, d.state]));
    g.ui.setTunnel(340, 380, 'Steel'); d = D('tunnel'); if (d.state !== 'warn') bad.push('340 of 380 should warn, got ' + d.state);
    g.ui.setTunnel(500, 380, 'Steel'); d = D('tunnel'); if (d.state !== 'crit' || d.frac !== 1) bad.push('500 of 380 should be critical and full: ' + d.state + ' ' + d.frac);
    g.ui.setTunnel(1500, 800, 'Concrete'); d = D('tunnel'); if (d.val !== '1.50' || d.unit !== 'km') bad.push('1500 m should read 1.50 km: ' + d.val + ' ' + d.unit);
    g.ui.setTunnel(0, 380, 'Steel'); return bad.length === 0 || bad.join('; ');
  });
  await T('slides.a-creaking-roof-sheds-a-little-plush-off-nearby-slopes-but-never-a-stream', async () => {
    const { fresh, spot } = ctx; fresh({ timber: 1 }); const sp = spot(); const x = cellX(sp.i), z = cellZ(sp.k), bad = [];
    g.mode = 'play'; g.slide.clear(); g._shedT = 0; g.time += 100;
    let fired = 0; for (let n = 0; n < 12; n++) { g.slide.clear(); if (g.shedOffSlope(x, z, 2)) fired++; }
    if (fired !== 1) bad.push(`12 calls in the same moment started ${fired} sheds, expected 1 (cooldown)`);
    g.slide.clear(); g._shedT = 0; g.time += 60; let seeded = 0; for (let n = 0; n < 40 && !seeded; n++) { g._shedT = 0; g.slide.clear(); g.shedOffSlope(x + n * 2, z, 2); seeded = g.slide.q.size; }
    if (!seeded) bad.push('a shed never seeded any slide');
    if (seeded > 400) bad.push('a single shed seeded ' + seeded + ' cells: that is a landslide, not a trickle');
    g._shedT = g.time + 30; g.slide.clear(); if (g.shedOffSlope(x, z, 2) || g.slide.q.size) bad.push('a shed fired during its cooldown');
    return bad.length === 0 || bad.join('; ');
  });
  await T('air.creaks-and-collapses-throw-dust-and-the-oxygen-and-suffocation-dials-react', async () => {
    const { fresh } = ctx; fresh({ timber: 1 }); const bad = []; const P = g.player.pos; g.dust.cells.clear(); g.dust.level = 0; g.dust.lung = 0;
    const at = () => g.dust.at(P.x, P.y + 1.5, P.z);
    const d0 = at(); g.onCreak(P.x + 1, P.y + 1.5, P.z, 1); const d1 = at(); if (!(d1 > d0)) bad.push(`a creak left no dust (${d0} -> ${d1})`);
    g.supportFailFx(P.x + 1, P.y + 1.5, P.z, 'A frame', 1.2); const d2 = at(); if (!(d2 > d1 + 0.2)) bad.push(`a buckling support left little dust (${d1} -> ${d2})`);
    // the dials: clean air first, then a dust cloud, then lungs going
    const D = (id) => g.ui.dials.read(id); g.dust.cells.clear(); g.dust.level = 0; g.dust.lung = 0;
    g.ui.setOxy(1, true, 'CLEAN'); if (D('oxy').val !== '100%' || D('oxy').state !== 'ok') bad.push('clean air: ' + JSON.stringify([D('oxy').val, D('oxy').state]));
    g.ui.setOxy(0.5, true, 'DUSTY'); if (D('oxy').state !== 'warn') bad.push('50% oxygen should warn, got ' + D('oxy').state);
    g.ui.setOxy(0.2, true, 'STALE'); if (D('oxy').state !== 'crit') bad.push('20% oxygen should be critical');
    g.ui.setOxy(1, false); if (D('oxy').on) bad.push('oxygen shown in the open');
    g.ui.setSuffocation(0.7, true, 'COUGHING'); if (D('suffoc').state !== 'crit' || D('suffoc').val !== '70%') bad.push('lungs at 70% : ' + JSON.stringify([D('suffoc').state, D('suffoc').val]));
    g.ui.setSuffocation(0, false); if (D('suffoc').on) bad.push('suffocation shown with clean lungs');
    return bad.length === 0 || bad.join('; ');
  });
}
