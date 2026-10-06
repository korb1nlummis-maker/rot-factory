import { staleAt, fanSpacing, fansNeeded, STALE_OK, FAN_R } from '../dust.js';
import { buildMountFan, MOUNT_FAN } from '../mountfan.js';
import * as THREE from 'three';
export default async function (ctx) {
  const { T, g, S, w, p, fresh, spot, dig, newWorld, toI, toK, cellX, cellZ } = ctx;
  const headAt = (x, z) => ({ x, y: 1.5, z });
  await T('dust.air-math-matches-the-formula', async () => {
    const bad = []; if (staleAt(100) !== 0 || staleAt(150) !== 0) bad.push('stale before 150 m'); if (Math.abs(staleAt(600) - 0.5) > 1e-9 || staleAt(2000) !== 1) bad.push('stale curve');
    if (isFinite(fanSpacing(375)) || !isFinite(fanSpacing(376))) bad.push('fans should start being needed just past 375 m');
    for (const d of [500, 750, 1000, 2000]) { const want = STALE_OK * FAN_R / staleAt(d); if (Math.abs(fanSpacing(d) - want) > 1e-9) bad.push('spacing at ' + d); }
    if (fansNeeded(500, 100) !== Math.ceil(100 / fanSpacing(500)) || fansNeeded(300, 100) !== 0) bad.push('fansNeeded');
    if (!(fanSpacing(1000) < fanSpacing(500) && fanSpacing(2000) <= fanSpacing(1000))) bad.push('deeper must need denser fans'); return bad.length === 0 || bad.join('; ');
  });
  await T('dust.deep-enclosed-tunnels-go-stale-and-shallow-ones-do-not', async () => {
    await newWorld(); fresh({}); const out = [];
    const carve = (d) => { const i = toI(d), k = toK(60); for (let a = 0; a < 30; a++) for (let b = 0; b < 4; b++) for (let j = 0; j < 4; j++) w().removeCell(i + a, j, k + b, false); return { x: cellX(i + 12), z: cellZ(k + 2) }; };
    const shallow = carve(60), mid = carve(500), deep = carve(1000);
    g.dust._fanNext = 0; const a = g.dust.stale(headAt(shallow.x, shallow.z)), b = g.dust.stale(headAt(mid.x, mid.z)), c = g.dust.stale(headAt(deep.x, deep.z));
    if (a !== 0) out.push('shallow tunnel stale ' + a); if (Math.abs(b - staleAt(Math.hypot(mid.x, mid.z))) > 1e-9) out.push('500 m stale ' + b); if (!(c > b)) out.push('deeper not staler');
    // open air above the pile is fine at any depth
    const up = g.dust.stale({ x: deep.x, y: 0.6 * (w().topAt(toI(deep.x), toK(deep.z)) + 3), z: deep.z }); if (up !== 0) out.push('open air stale ' + up); return out.length === 0 || out.join('; ');
  });
  await T('dust.fans-at-the-calculated-spacing-keep-the-air-breathable-and-wider-spacing-does-not', async () => {
    await newWorld(); fresh({}); const D = 700; const i0 = toI(D), k0 = toK(80), zc = cellZ(k0 + 2); const sm = fanSpacing(D); const results = {};
    for (let a = 0; a < 90; a++) for (let b = 0; b < 4; b++) for (let j = 0; j < 4; j++) w().removeCell(i0 + a, j, k0 + b, false);
    const run = (spacing) => {
      for (const e of [...S().entities]) if (e.type === 'fan') { const t = g.logi.byId.get(e.id); if (t) g.logi.remove(t); S().entities = S().entities.filter((x) => x.id !== e.id); }
      const x0 = cellX(i0 + 2); const n = Math.floor(48 / spacing);
      for (let q = 0; q < n; q++) { const x = x0 + q * spacing; const e = { id: g.nextId(), type: 'fan', mounted: true, frameId: 'f' + q, px: x, py: 1.95, pz: zc, fx: 1, fz: 0, fyaw: Math.PI / 2, dir: 0, i: toI(x), j: 3, k: toK(zc) }; S().entities.push(e); g.addEntity(e); g.logi.byId.get(e.id).pw = 1; }
      g.dust._fanNext = 0; let worst = 0; for (let x = x0; x < x0 + n * spacing - 0.01; x += 0.4) worst = Math.max(worst, g.dust.stale(headAt(x, zc))); return worst;
    };
    results.good = run(sm * 0.95); results.double = run(sm * 2.0); results.none = (() => { for (const e of [...S().entities]) if (e.type === 'fan') { const t = g.logi.byId.get(e.id); if (t) g.logi.remove(t); } S().entities = S().entities.filter((x) => x.type !== 'fan'); g.dust._fanNext = 0; return g.dust.stale(headAt(cellX(i0 + 30), zc)); })();
    return (results.good <= STALE_OK * 1.08 && results.double > STALE_OK * 1.3 && results.none > results.double * 0.95) || `at ${D} m (spacing ${sm.toFixed(1)} m): worst stale with fans at 95% of it ${results.good.toFixed(3)}, at twice it ${results.double.toFixed(3)}, with none ${results.none.toFixed(3)}`;
  });
  await T('dust.stale-air-fills-your-lungs-until-the-fans-run', async () => {
    await newWorld(); fresh({}); const D = 900, i0 = toI(D), k0 = toK(90), zc = cellZ(k0 + 2); for (let a = 0; a < 30; a++) for (let b = 0; b < 4; b++) for (let j = 0; j < 4; j++) w().removeCell(i0 + a, j, k0 + b, false);
    const head = headAt(cellX(i0 + 12), zc); g.dust.cells.clear(); g.dust.lung = 0; g.dust.level = 0; g.dust._fanNext = 0; for (let n = 0; n < 600; n++) { g.time += 0.05; g.dust.breathe(0.05, head, g.T); } const bad = g.dust.lung;
    const e = { id: g.nextId(), type: 'fan', mounted: true, frameId: 'f', px: head.x - 3, py: 1.95, pz: zc, fx: 1, fz: 0, fyaw: Math.PI / 2, dir: 0, i: toI(head.x - 3), j: 3, k: toK(zc) }; S().entities.push(e); g.addEntity(e); g.logi.byId.get(e.id).pw = 1;
    g.dust.cells.clear(); g.dust.lung = 0; g.dust.level = 0; g.dust._fanNext = 0; for (let n = 0; n < 600; n++) { g.time += 0.05; g.dust.breathe(0.05, head, g.T); } const good = g.dust.lung;
    return (bad > 0.5 && good < bad * 0.4) || `30 s breathing at ${D} m: lung ${bad.toFixed(2)} without a fan, ${good.toFixed(2)} with one 3 m behind you`;
  });
  await T('dust.digging-raises-more-dust-the-deeper-the-pile', async () => {
    await newWorld(); fresh({}); g.dust.cells.clear(); const at = (d) => { const i = toI(d), k = toK(1); g.dust.cells.clear(); g.world.onRemove(i, 2, k); return Math.max(0, ...[...g.dust.cells.values()]); };
    const a = at(20), b = at(900); return (b > a * 3.5 && b < a * 5) || `dust from one cell: ${a.toFixed(4)} near the bay, ${b.toFixed(4)} at 900 m`;
  });
  await T('dust.support-fans-hang-above-head-height-and-are-small', async () => {
    const m = buildMountFan(); m.position.y = 0; m.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(m); const h = 2.38, y0 = 0; const hungY = y0 + h - MOUNT_FAN.drop;
    const low = hungY + box.min.y, wide = box.max.x - box.min.x, high = box.max.y - box.min.y;
    return (low >= 1.8 && wide <= 0.4 && high <= 0.5) || `lowest point ${low.toFixed(2)} m, width ${wide.toFixed(2)} m, height ${high.toFixed(2)} m (a standing head is about 1.7 m)`;
  });
  await T('dust.survey-and-air-monitor-state-the-fan-spacing-for-the-depth', async () => {
    fresh({ timber: 1, survey: 1, airmon: 1 }); S().up.survey = 1; g.T = g.tune(); p().pos.set(500, 0, 0); p().vel.set(0, 0, 0); g._svNext = 0; g.updateSurvey(); const t = document.getElementById('svAir').textContent; const want = Math.floor(fanSpacing(500));
    return (t.includes(`Support Fan every ${want} m`) && /stale air 39%/.test(t)) || `survey says "${t}", rule says ${want} m`;
  });
}
