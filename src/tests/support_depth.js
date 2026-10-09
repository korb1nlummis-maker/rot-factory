import { kit } from './island_lib.js';
import { UP } from './portal_lib.js';
import { SUP_EXTRA, GRACE_T } from '../world.js';
import { FRAME_TYPES } from '../upgrades.js';
import { ARCH_SPANS } from '../loadtrace.js';
// support_depth.*: how much tunnel a player can dig past the LAST support before the roof lets go, for both tunnel classes (the 4 x 4 cube tunnel and the giant arch tunnels of span 6, 8 and 12)
// at every depth band (the bay, 200, 500 and 1,000 m) and in every frame material. The ask (user): at least 2 structure cubes of depth, 8 columns (4.8 m), past the last support, so that
// two further cubes can be set before the roof comes down. `held` is the number of columns past the support's far face whose roof still stands with no grace at all; the grace (GRACE_T) comes on top.
// Each scene is a sealed tunnel with the support at its west end (so it is the only anchor), in a fresh world: the same scene as support_reach.js.
// Run: `await __selftest('support_depth.')`. The measured table is also left in `globalThis.__sdTable` for the report.
export const NEED = 8;   // columns (2 cubes of 4)
export default async function (ctx) {
  const { T: T0, g, S, fresh, newWorld, toI, toK, clearBodies } = ctx;
  const T = (name, fn) => T0(name, async () => { try { return await fn(); } finally { await newWorld(); } });
  const K = kit(ctx);
  const W = () => g.world;
  const MATS = Object.keys(FRAME_TYPES);
  const DEPTHS = [0, 200, 500, 1000];
  const scene = async (dist, cls, mat, len = 48) => {
    const up = { ...UP }, hgt = cls === 'cube' ? 4 : ARCH_SPANS[cls].h, wd = cls === 'cube' ? 4 : cls;
    await newWorld(); fresh(up); S().money = 1e13; g.surgeT = 1e9; clearBodies();
    let i0, lo;
    if (!dist) { const A = K.arena(len + 40, wd + 40, up); K.block(A.i0, 0, A.k0, len + 20, 32, wd + 20); i0 = A.i0 + 10; lo = A.k0 + 10; }
    else { i0 = toI(dist); lo = toK(60); }
    K.dig(i0, 0, lo, len, hgt, wd, false);
    W().creaking.clear(); W().stabQueue.length = 0; W().chimney.clear(); g._shedT = g.time + 1e9; g.collapseT = 99;
    if (cls === 'cube') K.cube(mat, i0, lo, 0);
    else g.placeEntity('garch', { axis: 'x', gm: i0, glo: lo, gj: 0, span: cls, mat }, { quiet: true, rebuild: false });
    return { i0, lo, len, hgt, wd };
  };
  // the first column (counted from the support's west face) whose roof is judged unsupported, and how many columns past its far face still hold
  const heldOf = (s) => { for (let a = 0; a < s.len; a++) for (let q = 0; q < s.wd; q++) { const st = W().stress(s.i0 + a, s.hgt, s.lo + q); if (st && st.margin < 0) return a - 4; } return Infinity; };
  const table = globalThis.__sdTable = {};
  // measured columns past the far face of the support, per depth (bay, 200, 500, 1,000 m), in the order of FRAME_TYPES (timber steel concrete rebar titan carbon plasma voidl neutron horizon)
  const PIN = {
    cube: [[16, 17, 19, 20, 21, 22, 23, 24, 26, 27], [13, 14, 16, 17, 18, 19, 20, 21, 23, 24], [11, 12, 14, 15, 16, 17, 18, 19, 21, 22], [9, 10, 12, 13, 14, 15, 16, 17, 19, 20]],
    6: [[19, 19, 19, 20, 21, 22, 23, 24, 26, 27], [16, 16, 16, 17, 18, 19, 20, 21, 23, 24], [14, 14, 14, 15, 16, 17, 18, 19, 21, 22], [12, 12, 12, 13, 14, 15, 16, 17, 19, 20]],
    8: [[21, 21, 21, 21, 21, 21, 22, 24, 25, 27], [18, 18, 18, 18, 18, 18, 19, 21, 22, 24], [16, 16, 16, 16, 16, 16, 17, 19, 20, 22], [14, 14, 14, 14, 14, 14, 15, 17, 18, 20]],
    12: [Array(10).fill(26), Array(10).fill(23), Array(10).fill(21), Array(10).fill(19)],
  };
  for (const cls of ['cube', 6, 8, 12]) {
    await T(`support_depth.${cls === 'cube' ? 'cube' : 'arch' + cls}-tunnel-holds-at-least-2-cubes-of-depth-past-the-last-support-at-every-depth-and-material`, async () => {
      if (SUP_EXTRA < 3 || GRACE_T < 2.5) return 'support reach constants moved down';
      const bad = [], rows = table[cls] = {};
      for (let d = 0; d < DEPTHS.length; d++) {
        const dist = DEPTHS[d]; rows[dist] = {};
        for (let m = 0; m < MATS.length; m++) {
          const mat = MATS[m], s = await scene(dist, cls, mat), h = heldOf(s); rows[dist][mat] = h;
          if (!(h >= NEED)) bad.push(`${cls} ${dist} m ${mat}: holds ${h} columns, needs ${NEED}`);
          if (Math.abs(h - PIN[cls][d][m]) > 1) bad.push(`${cls} ${dist} m ${mat}: table says ${PIN[cls][d][m]}, measured ${h}`);
        }
      }
      return bad.length === 0 || bad.slice(0, 8).join('; ');
    });
  }
}
