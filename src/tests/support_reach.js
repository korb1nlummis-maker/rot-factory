import { kit } from './island_lib.js';
import { UP } from './portal_lib.js';
import { SUP_EXTRA, GRACE_T, GRACE_FULL, GRACE_END } from '../world.js';
import { ISL_GRACE } from '../island.js';
import { BULK } from '../plushdata.js';
// support_reach.*: how far a support holds the roof, and how long a roof that is just past it waits (world.js SUP_EXTRA, GRACE_T, GRACE_FULL, GRACE_END; island.js ISL_GRACE).
// The problem: deep in the pile the unsafe length past a support is 4 to 6 cells (1,000 to 500 m out) and a roof that went over it fell within 0.4 to 1.4 s, so a player who had set one cube could
// dig the four cells the next one needs, overshoot by a cell or two, and the roof came down before he could aim and set it. Now a roof whose nearest anchor is a support holds SUP_EXTRA
// more cells (1.8 m), and a roof up to GRACE_FULL cells past that waits GRACE_T seconds longer (fading to nothing at GRACE_END cells over), so a few cells too many can still be saved by the
// next support. Nothing else was loosened: a roof held by the open mouth or a wall, a roof with no support in reach, a big cavern and a roof GRACE_END or more cells past a support fall as before.
// The old numbers are measured in the same test by setting `world.supExtra`, `world.graceT` and `world.islGrace` to 0 (the "old" rule).
// Run: `await __selftest('support_reach.')`. Each test builds its own tunnel (4 wide, 4 high, sealed, with the first cube at the west end so the cube is the only anchor) in a fresh world.
export default async function (ctx) {
  const { T, g, S, fresh, newWorld, stepSim, toI, toK, sim, clearBodies } = ctx;
  const K = kit(ctx);
  const W = () => g.world;
  const WD = 4, HT = 4;   // the tunnel a cube makes: 4 wide, 4 high (cells)
  const oldRule = () => { W().supExtra = 0; W().graceT = 0; W().islGrace = 0; };
  const newRule = () => { W().supExtra = undefined; W().graceT = undefined; W().islGrace = undefined; };
  // a tunnel `len` cells long starting at the cube's west face (a = 0), in a pile `dist` metres out (0: the bay slope, a block of `rows` rows). The cube (a = 0 .. 3) is set when `mat` is given.
  // `mouth`: the tunnel starts at the open face of the block (the open air is its anchor); `plug`: a bulkhead wall across it at a = 0 (a wall is its anchor).
  const scene = async (o = {}) => {
    const dist = o.dist || 0, len = o.len ?? 30, up = { ...UP, ...(o.up || {}) };
    await newWorld(); fresh(up); S().money = 1e13; g.surgeT = 1e9; clearBodies();
    let i0, lo;
    if (!dist) { const A = K.arena(len + 40, WD + 40, up); K.block(A.i0, 0, A.k0, len + 20, o.rows ?? 32, WD + 20); i0 = A.i0 + (o.mouth ? 0 : 10); lo = A.k0 + 10; }
    else { i0 = toI(dist); lo = toK(60); }
    K.dig(i0, 0, lo, len, HT, WD, false);   // (the cells are open; nothing is queued until a test digs on purpose)
    if (o.plug) for (let q = 0; q < WD; q++) for (let j = 0; j < HT; j++) W().setCell(i0, j, lo + q, BULK, 0);
    W().creaking.clear(); W().stabQueue.length = 0; W().chimney.clear(); g._shedT = g.time + 1e9; g.collapseT = 99;
    const cube = o.mat ? K.cube(o.mat, i0, lo, 0) : null;
    return { i0, lo, len, cube, dist };
  };
  // the stress of the roof cell over column a (q: which of the 4 rows across)
  const roof = (s, a, q = 1) => W().stress(s.i0 + a, HT, s.lo + q);
  // the first column of a tunnel that is already dug to its full length whose roof is judged unsupported (-1: none)
  const firstBad = (s) => { for (let a = 0; a < s.len; a++) for (let q = 0; q < WD; q++) { const st = roof(s, a, q); if (st && st.margin < 0) return { a, B: st.B, st }; } return { a: -1, B: (roof(s, 0, 1) || {}).B }; };
  // columns of roof that hold past the cube's east face (a = 4)
  const held = (s) => { const f = firstBad(s); return f.a < 0 ? Infinity : f.a - 4; };
  const matFor = (dist) => (dist >= 500 ? 'concrete' : 'steel');
  // The real stability loop: the player has dug the tunnel to the last column that holds (with the first cube at its end), then digs `n` more columns at once and sets the next cube (a = 4 .. 7)
  // `place` seconds later (null: never). Returns the seconds until the first roof cell let go (-1: none did within `sec`), the most roof cells missing at once and the last column that held.
  const drop = async (o) => {
    const s0 = await scene({ ...o, len: 48 }); if (o.old) oldRule();
    const hold = firstBad(s0).a;
    const s = await scene({ ...o, len: hold }); if (o.old) oldRule();
    const roofN = () => { let n = 0; for (let a = 0; a < hold + 12; a++) for (let q = 0; q < WD; q++) if (W().get(s.i0 + a, HT, s.lo + q)) n++; return n; };
    K.dig(s.i0 + hold, 0, s.lo, o.n, HT, WD, true);
    const n1 = roofN(); let tFirst = -1, placed = false, peak = 0;
    for (let t = 0; t < (o.sec ?? 8); t += 0.1) {
      if (o.place !== null && o.place !== undefined && !placed && t >= o.place) { K.cube(o.mat, s.i0 + 4, s.lo, 0); W().stabQueue.push({ i: s.i0 + 5, j: HT, k: s.lo + 1 }); placed = true; }
      stepSim(0.1, 1 / 30);
      const now = roofN(); if (tFirst < 0 && now < n1) tFirst = +(t + 0.1).toFixed(1);
      peak = Math.max(peak, n1 - now);   // (the rubble of a fall can fill the tunnel up to its roof row again, so the loss is the most roof cells missing at once)
    }
    return { hold, tFirst, lost: peak };
  };

  // [dist, material, columns held past the cube's face before, after]: measured with one cube at the end of a sealed 4 x 4 tunnel (the old rule is world.supExtra = 0)
  const REACH = [[0, 'timber', 13, 16], [0, 'steel', 14, 17], [0, 'concrete', 16, 19], [0, 'titan', 18, 21],
    [200, 'timber', 10, 13], [200, 'steel', 11, 14], [200, 'concrete', 13, 16], [200, 'titan', 15, 18],
    [500, 'timber', 8, 11], [500, 'steel', 9, 12], [500, 'concrete', 11, 14], [500, 'titan', 13, 16],
    [1000, 'timber', 6, 9], [1000, 'steel', 7, 10], [1000, 'concrete', 9, 12], [1000, 'titan', 11, 14]];
  await T('support_reach.a-cube-holds-3-more-columns-of-tunnel-than-it-did-at-every-depth-and-in-every-material', async () => {
    if (SUP_EXTRA !== 3) return 'SUP_EXTRA moved: ' + SUP_EXTRA + ' (update the tables)';
    const bad = [];
    for (const [dist, mat, before, after] of REACH) {
      const s = await scene({ dist, mat, len: 48 }); const nw = held(s); oldRule(); const od = held(s);
      // (a band of one cell for the natural pile: its height and the old workings near it can differ by a seed)
      if (nw - od !== SUP_EXTRA) bad.push(`${dist} m ${mat}: ${od} before, ${nw} after (should be ${SUP_EXTRA} more)`);
      if (Math.abs(od - before) > 1 || Math.abs(nw - after) > 1) bad.push(`${dist} m ${mat}: table says ${before} -> ${after}, measured ${od} -> ${nw}`);
    }
    return bad.length === 0 || bad.slice(0, 5).join('; ');
  });

  await T('support_reach.the-safe-length-by-depth-is-unchanged-and-deep-is-still-tighter-than-shallow', async () => {
    const B = [], held1 = [];
    for (const dist of [0, 200, 500, 1000]) { const s = await scene({ dist, mat: 'steel', len: 48 }); B.push(roof(s, 30).B); held1.push(held(s)); }   // (a roof cell 30 columns out is beyond every cube's reach, so its limit is the plain safe length)
    if (B.join() !== '11,8,6,4') return 'the safe length by depth moved: ' + B.join() + ' (11, 8, 6, 4 near the bay, 200, 500, 1000 m)';
    for (let q = 1; q < 4; q++) if (!(held1[q] < held1[q - 1])) return 'a cube holds no less of the roof deeper down: ' + held1.join();
    return true;
  });

  await T('support_reach.an-open-mouth-and-a-wall-hold-no-further-than-before-the-extra-is-for-supports-only', async () => {
    const bad = [];
    for (const o of [{ mouth: true }, { plug: true }]) {
      const s = await scene({ ...o, len: 40 }); const nw = firstBad(s); oldRule(); const od = firstBad(s);
      if (nw.a < 0 || nw.a !== od.a) bad.push(`${o.mouth ? 'open mouth' : 'bulkhead wall'}: first failing column ${od.a} before, ${nw.a} after (nothing should change)`);
      if (nw.a >= 0 && !(nw.a >= nw.B - 1 && nw.a <= nw.B + 2)) bad.push(`${o.mouth ? 'open mouth' : 'wall'}: fails at ${nw.a}, the safe length is ${nw.B}`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('support_reach.the-grace-is-full-for-1-to-3-cells-over-fades-to-nothing-at-6-and-never-applies-without-a-support', async () => {
    const s = await scene({ dist: 500, mat: 'concrete', len: 40 }); const f = firstBad(s), bad = [];
    if (GRACE_FULL !== 3 || GRACE_END !== 6 || GRACE_T !== 2.5) return 'grace constants moved: ' + [GRACE_T, GRACE_FULL, GRACE_END];
    const want = [GRACE_T, GRACE_T, GRACE_T, GRACE_T * 2 / 3, GRACE_T / 3, 0, 0];   // 1, 2, 3, 4, 5, 6 and 7 cells over
    for (let over = 1; over <= 7; over++) {
      const st = roof(s, f.a + over - 1); if (!st) { bad.push(`no roof at ${over} over`); continue; }
      const gr = st.grace || 0; if (Math.abs(gr - want[over - 1]) > 1e-9) bad.push(`${over} cells over: grace ${gr.toFixed(2)} s, expected ${want[over - 1].toFixed(2)}`);
      if (over < GRACE_END && st.margin !== -over) bad.push(`${over} cells over: margin ${st.margin}`);
    }
    // a roof far from every anchor falls as always, and the open mouth has no grace at all (it was never a support's job)
    const far = roof(s, f.a + 9); if (!far || far.grace || far.margin !== -Infinity) bad.push('a roof far from every anchor must fall as always: ' + JSON.stringify(far));
    const m = await scene({ mouth: true, len: 40 }); const mf = firstBad(m); for (let a = mf.a; a < mf.a + 6; a++) { const st = roof(m, a); if (st && (st.grace || 0) !== 0) bad.push(`open mouth roof at column ${a} has grace ${st.grace}`); }
    return bad.length === 0 || bad.join('; ');
  });

  // digging 1, 2 and 3 cells past what the cube holds: before, the roof let go in under a second; now there are about 3 s to set the next cube (a = 4 .. 7), which saves all of it
  for (const dist of [0, 500, 1000]) await T(`support_reach.digging-1-2-and-3-cells-too-far-${dist === 0 ? 'near-the-bay' : 'at-' + dist + '-m'}-gives-time-to-set-the-next-support`, async () => {
    const bad = [], mat = matFor(dist);
    for (const n of [1, 2, 3]) {
      const old = await drop({ dist, mat, n, old: true, place: null, sec: 4 });
      const none = await drop({ dist, mat, n, place: null, sec: 6 });
      const set = await drop({ dist, mat, n, place: 2, sec: 7 });
      if (!(old.tFirst > 0 && old.tFirst <= 1.6)) bad.push(`n ${n}: the old roof should go within 1.6 s, it went at ${old.tFirst}`);
      if (!(none.tFirst >= 2.7 && none.tFirst <= 4.4)) bad.push(`n ${n}: with no support the roof should let go after 2.7 to 4.4 s (it creaks, then falls), it went at ${none.tFirst}`);
      if (none.lost < n * 2) bad.push(`n ${n}: with no support set, the roof must still fall (lost ${none.lost})`);
      if (set.lost !== 0 || set.tFirst >= 0) bad.push(`n ${n}: the next cube set at 2 s should save the roof, it lost ${set.lost} (first at ${set.tFirst})`);
      if (!(old.hold + SUP_EXTRA === none.hold)) bad.push(`n ${n}: the tunnel holds ${old.hold} columns before and ${none.hold} after`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('support_reach.digging-6-cells-too-far-still-collapses-even-with-the-next-support-set-in-time', async () => {
    const bad = [];
    for (const dist of [0, 500]) {
      const mat = matFor(dist);
      const none = await drop({ dist, mat, n: 6, place: null, sec: 6 }); const set = await drop({ dist, mat, n: 6, place: 2, sec: 7 });
      if (!(none.tFirst > 0 && none.tFirst <= 1.6)) bad.push(`${dist} m: 6 cells over should go as fast as ever (first at ${none.tFirst} s)`);
      if (none.lost < 20) bad.push(`${dist} m: 6 cells over with no support lost only ${none.lost} roof cells of 24`);
      if (!(set.lost > 0)) bad.push(`${dist} m: 6 cells over, the second cube cannot hold the end of the tunnel (lost ${set.lost})`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('support_reach.a-big-cavern-with-one-cube-in-it-still-collapses', async () => {
    const bad = [], seen = [];
    for (const old of [true, false]) {
      const A = K.arena(60, 60, UP); K.block(A.i0, 0, A.k0, 50, 30, 50); const r = { i: A.i0 + 10, k: A.k0 + 10 };
      if (old) oldRule(); else newRule();
      K.dig(r.i, 0, r.k, 30, 4, 30, false); W().creaking.clear(); W().stabQueue.length = 0; K.cube('steel', r.i, r.k, 0);
      // the whole roof is asked about (a real dig asks cell by cell)
      for (let a = 0; a < 30; a += 3) for (let b = 0; b < 30; b += 3) W().stabQueue.push({ i: r.i + a, j: 4, k: r.k + b });
      K.stand(A.i0 + 2, A.k0 + 2); const co = S().stats.collapses || 0; let peak = 0;
      for (let t = 0; t < 40; t += 0.5) { stepSim(0.5, 1 / 30); peak = Math.max(peak, 900 - K.count(r.i, 4, r.k, 30, 1, 30)); }   // (the rubble can fill the room up to the roof row again: the most roof cells missing at once)
      const rubble = K.count(r.i, 0, r.k, 30, 4, 30) - K.count(r.i, 0, r.k, 4, 4, 4);
      seen.push(`${old ? 'old' : 'new'}: peak ${peak}, rubble ${rubble}, collapses ${(S().stats.collapses || 0) - co}`);
      if (!((S().stats.collapses || 0) > co) || peak < 150 || rubble < 800) bad.push(`${old ? 'old' : 'new'} rule: a 30 x 30 cavern with one cube lost at most ${peak} of 900 roof cells and holds ${rubble} rubble (collapses ${(S().stats.collapses || 0) - co})`);
    }
    newRule();
    globalThis.__meas = seen;
    return bad.length === 0 || bad.join('; ');
  });

  await T('support_reach.a-thin-cap-over-a-wide-room-gets-no-grace', async () => {
    const A = K.arena(50, 50, UP); K.block(A.i0, 0, A.k0, 40, 5, 40); K.dig(A.i0 + 8, 0, A.k0 + 8, 24, 3, 24, false);
    const st = W().stress(A.i0 + 20, 3, A.k0 + 20);
    if (!(st && st.thin && st.margin < 0)) return 'a 24 wide room under 2 cells of cover should be a thin cap: ' + JSON.stringify(st);
    return !(st.grace) || 'a thin cap got a grace of ' + st.grace;
  });

  await T('support_reach.a-cut-off-slab-waits-1-and-a-half-seconds-longer-but-a-stray-plush-or-two-does-not', async () => {
    const bad = [];
    const hang = async (nx, nj, nz, old) => {
      const A = K.arena(40, 40, UP); if (old) oldRule(); else newRule();
      const a = { i: A.i0 + 10, j: 4, k: A.k0 + 10 }; K.block(a.i, a.j, a.k, nx, nj, nz); K.stand(A.i0 + 2, A.k0 + 2);
      const f0 = S().stats.islandFalls || 0; W().stabQueue.push({ i: a.i, j: a.j, k: a.k });
      const seen = K.until(() => W().isl.list.size > 0, 2), t = K.until(() => (S().stats.islandFalls || 0) > f0 || K.count(a.i, a.j, a.k, nx, nj, nz) < nx * nj * nz, 9);
      return seen < 0 || t < 0 ? -1 : seen + t;
    };
    const bigOld = await hang(10, 3, 10, true), bigNew = await hang(10, 3, 10, false), tinyOld = await hang(1, 1, 3, true), tinyNew = await hang(1, 1, 3, false);
    newRule();
    if (!(bigOld > 0 && bigNew - bigOld > ISL_GRACE - 0.3 && bigNew - bigOld < ISL_GRACE + 0.4)) bad.push(`a 300 plush slab fell after ${bigOld} s before and ${bigNew} s after (${ISL_GRACE} s more expected)`);
    if (!(tinyOld > 0 && Math.abs(tinyNew - tinyOld) < 0.3)) bad.push(`a stray 3 plush hang changed: ${tinyOld} s before, ${tinyNew} s after`);
    return bad.length === 0 || bad.join('; ');
  });
}
