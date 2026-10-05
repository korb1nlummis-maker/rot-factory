// Rough pacing model for a greedy player. Not a playtest: it estimates how long the exit (3.07 km) and
// the hidden plush (~4.1 km) take if the player always buys the cheapest useful upgrade and digs one tunnel.
import { UPGRADES, computeTuning, isUnlocked, FRAME_TYPES } from '../src/upgrades.js';
import { RARITY } from '../src/plushdata.js';

const avgBase = RARITY.slice(0, 6).reduce((a, r) => a + r.weight * r.value, 0) * (1 + 4 / 140);
const comp = (d) => Math.pow(1 + d / 100, 1.4);
const SKIP = new Set(['hardhat', 'creak', 'stress', 'lantern', 'assay', 'plan', 'compass', 'springs', 'knees', 'boots', 'reach', 'shinyEye', 'throw', 'magnet', 'dump', 'repeat', 'streak', 'vac', 'depots', 'scan']);

function run(target, opts = {}) {
  let t = 0, money = 0, d = 0, L = {}, dex = 0;
  const dt = 30;
  let hours = {};
  for (let step = 0; step < 4e6 && d < target; step++) {
    const T = computeTuning(L);
    // buy cheapest useful upgrade repeatedly
    for (let guard = 0; guard < 50; guard++) {
      let best = null;
      for (const u of UPGRADES) {
        if (SKIP.has(u.id) && !(u.id === 'scan' && d > 3000)) continue;
        const lvl = L[u.id] || 0;
        if (lvl >= u.max || !isUnlocked(u, L)) continue;
        const c = u.cost[lvl];
        if (c <= money && (!best || c < best.c)) best = { u, c };
      }
      if (!best) break;
      money -= best.c; L[best.u.id] = (L[best.u.id] || 0) + 1;
    }
    const T2 = computeTuning(L);
    const slab = L.borer ? T2.borerW * T2.borerH : L.mech ? 9 : 6;
    const c = comp(d);
    const stepTime = L.borer ? T2.borerRate * c : L.mech ? T2.mechRate * c * slab : T2.grabTime * c * slab * 1.6;
    const bestFrame = Math.max(0, ...T2.frames.map((f) => FRAME_TYPES[f].bonus));
    const pen = Math.floor(Math.max(0, d - 40) / 330);
    const over = d > 46 ? 2 : 0;
    const need = over + pen - T2.stabBonus; // frame bonus needed
    const ok = bestFrame >= need && (d < 20 || T2.frames.length > 0 || need <= 0);
    const frameKind = T2.frames.length ? T2.frames[T2.frames.length - 1] : null;
    const frameCostPerM = frameKind ? FRAME_TYPES[frameKind].cost / 4 : 0;
    // plush per second
    let pps = slab / stepTime;
    // extra mechs / rigs work nearer the start
    if (L.mech) pps += Math.max(0, T2.mechMax - 1) / (T2.mechRate * comp(d * 0.35));
    if (L.claw) pps += Math.min(T2.rigMax, 8) / (T2.rigRate * 1.2) * 0.25; // pocket surface runs dry, heavy discount
    const mult = T2.sellMult * (1 + d / 200) * (1 + T2.dexBonus * 120);
    money += pps * avgBase * mult * dt * 1.15;
    const mps = 0.6 / stepTime;
    const dd = ok ? mps * dt : 0;
    const cost = frameCostPerM * dd;
    if (money >= cost) { money -= cost; d += dd; }
    t += dt;
    for (const h of [10, 25, 50, 100, 200, 400, 800]) if (!hours[h] && t / 3600 >= h) hours[h] = Math.round(d);
    if (t / 3600 > 3000) break;
  }
  return { hours: (t / 3600).toFixed(1), d: Math.round(d), L, snap: hours };
}

const exit = run(3072);
console.log('EXIT   ', exit.hours, 'h  reached', exit.d, 'm   distance at h:', JSON.stringify(exit.snap));
const one = run(4100);
console.log('NEEDLE ', one.hours, 'h  reached', one.d, 'm');
