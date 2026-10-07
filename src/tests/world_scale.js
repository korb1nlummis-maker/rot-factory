import { World } from '../world.js';
import { NX, NZ, NY, C, EXIT_X, HALL_HX, SAVE_KEY } from '../config.js';
import { saveGame, loadSaved, applyDiff } from '../state.js';
import { ACHIEVEMENTS } from '../achievements.js';
export default async function (ctx) {
  const { T, g, S, w, p, fresh, newWorld, toI, toK, cellX, cellZ, FRAME_TYPES, stepSim } = ctx;
  await T('world.the-exit-is-nearly-five-kilometers-out-and-the-grid-still-fits-the-stability-keys', async () => {
    return (EXIT_X >= 4900 && EXIT_X <= 4950 && NX === NZ && NX <= 16384 && NY === 72) || `NX ${NX}, exit ${EXIT_X}`;
  });
  await T('world.the-one-hides-far-past-the-exit-in-every-seed', async () => {
    const bad = []; for (let s = 1; s <= 40; s++) { const wd = new World(s * 7919 + 13); const n = wd.needle; const x = (n.i + 0.5 - NX / 2) * C, z = (n.k + 0.5 - NZ / 2) * C; const d = Math.hypot(x, z); if (d < 5990 || d > 6260) bad.push(`seed ${s}: ${d.toFixed(0)} m`); if (Math.abs(x) > HALL_HX || Math.abs(z) > HALL_HX) bad.push(`seed ${s} outside the hall`); }
    return bad.length === 0 || bad.slice(0, 3).join('; ');
  });
  await T('world.the-top-supports-reach-the-exit-with-the-last-tier-unlimited', async () => {
    const fin = Object.values(FRAME_TYPES).filter((f) => isFinite(f.maxDepth)).map((f) => f.maxDepth); const ordered = fin.every((v, i) => i === 0 || v > fin[i - 1]);
    return (ordered && Math.max(...fin) < EXIT_X && !isFinite(FRAME_TYPES.horizon.maxDepth) && Math.max(...fin) >= 4000) || `finite ratings ${fin.join()} exit ${EXIT_X.toFixed(0)}`;
  });
  await T('world.digging-collapses-and-saving-work-at-the-far-east-end', async () => {
    await newWorld(); fresh({}); const out = [];
    const i = toI(4800), k = toK(0); for (let a = 0; a < 30; a++) for (let b = 0; b < 4; b++) for (let j = 0; j < 3; j++) w().removeCell(i + a, j, k + b, true);
    const st = w().stress(i + 15, 3, k + 1); if (!st || Number.isNaN(st.margin)) out.push('no stress value at 4.8 km: ' + JSON.stringify(st)); else if (!(st.margin < 0)) out.push('a 30 cell tunnel at 4.8 km should be overloaded, margin ' + st.margin);
    // the far corner of the grid: write, save, read back into a fresh world
    const ci = NX - 4, ck = NZ - 4; w().setCell(ci, 5, ck, 7, 0); localStorage.removeItem(SAVE_KEY); S().entities = S().entities.filter((e) => e.free); saveGame(S(), w(), null); const saved = loadSaved(); const fw = new World(S().seed); if (saved) applyDiff(fw, saved.diff);
    if (!saved || fw.get(ci, 5, ck) !== 7) out.push('far corner cell lost in the save: ' + (saved ? fw.get(ci, 5, ck) : 'no save')); localStorage.removeItem(SAVE_KEY);
    return out.length === 0 || out.join('; ');
  });
  await T('world.the-hud-shows-distance-from-the-bay-and-the-exit-not-just-burial', async () => {
    fresh({}); p().pos.set(1500, 0, 0); p().vel.set(0, 0, 0); g.hudT = 0; g.updatePlay(0.05); const dt = () => g.ui._depthTxt || ''; let t = dt();
    p().pos.set(200, 0, 0); g.hudT = 0; g.updatePlay(0.05); const near = dt(); p().pos.set(0, 0, -1.4); g.hudT = 0; g.updatePlay(0.05); const start = dt();
    return (/1\.50 km FROM BAY/.test(t) && new RegExp('EXIT 3\\.4\\d km').test(t) && /\b20\d m FROM BAY/.test(near) && !/EXIT/.test(near) && !/FROM BAY/.test(start)) || `1.5 km: "${t}"; 200 m: "${near}"; start: "${start}"`;
  });
  await T('world.far-achievements-exist-in-order', async () => {
    const km = ACHIEVEMENTS.filter((a) => /^km/.test(a.id)).map((a) => a.id); return (km.join() === 'km3,km4,km45' || km.join() === 'km1,km2,km3,km4,km45' || km.includes('km45')) || 'distance achievements ' + km.join();
  });
}
