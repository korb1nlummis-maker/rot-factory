import * as PD from '../plushdata.js';
// cavein.*: the roof rules for the two tunnel classes (Wave 6 tuning). The tunnel rule in world.js (a tunnel stands as long as no stretch runs further than the safe length from an
// anchor, the safe length shrinks with the pile above and the distance from the bay, grows with Pile Tamping) must give the same safe length at every width, so a 4 wide cube tunnel
// and a 12 wide giant arch tunnel both stay open when they are lined at the spacing their supports cover, and both really cave in when the supports are skipped.
// Run: `await __selftest('cavein.')`
import { makeKit, UP } from './portal_lib.js';
import { CAVITY_CAP, CAVITY_PER_STEP } from '../world.js';
import { ARCH_SPANS } from '../loadtrace.js';

export default async function (ctx) {
  const { T, g, S, w, fresh, newWorld, stepSim, toI, toK, cellX, cellZ, sim, clearBodies } = ctx;
  const K = makeKit(ctx);
  const clearCols = (i0, k0, nx, nz) => { for (let i = i0; i < i0 + nx; i++) for (let k = k0; k < k0 + nz; k++) for (let j = 0, top = w().topAt(i, k); j < top; j++) if (w().get(i, j, k)) w().removeCell(i, j, k, false); };
  // a pile block `rows` high with its open face to the west and a bore `wd` wide, `ht` high, `len` long cut into it from the face (all at once, as a machine would)
  const bore = (wd, ht, o = {}) => {
    const rows = o.rows ?? 30, len = o.len ?? 60; let i0, k0;
    if (!o.dist) { const sp = ctx.spot(o.lane ?? 12); i0 = sp.i + 8; k0 = sp.k - ((wd >> 1) + 8); clearCols(i0 - 12, k0 - 2, len + 24, wd + 20); K.solidBox(i0, k0, len + 6, wd + 16, rows); }
    else { i0 = toI(o.dist); k0 = toK(60); }
    const lo = k0 + 8 + (o.dist ? 0 : 0);
    for (let a = 0; a < len; a++) for (let b = 0; b < wd; b++) for (let j = 0; j < ht; j++) w().removeCell(i0 + a, j, lo + b, o.queue !== false);
    if (o.dist) w().supports.push({ x: cellX(i0 - 2), y: 1.5, z: cellZ(lo + (wd >> 1)), r: 6, b: 10, id: 'cavein-mouth' });   // a pseudo anchor at the mouth: deep in the pile there is no open sky to anchor it
    return { i0, lo, wd, ht, len, k0 };
  };
  const addSup = (cls, mat, m, lo, wd) => {
    if (cls === 'cube') { const e = g.machines.frameEnt('x', mat, m, lo, 0); delete e.clear; const ent = { id: g.nextId(), type: 'frame', ...e }; S().entities.push(ent); g.addEntity(ent); return ent; }
    return g.placeEntity('garch', { axis: 'x', gm: m, glo: lo, gj: 0, span: wd, mat }, { quiet: true });
  };
  // line the bore: a support module every `every` cells starting at the mouth
  const line = (b, cls, mat, every) => { const out = []; for (let m = b.i0; m + 3 < b.i0 + b.len; m += every) out.push(addSup(cls, mat, m, b.lo, b.wd)); return out; };
  // run the real stability loop for `sec` seconds; what happened to the roof
  const hooks = () => ({ onCreak: (x, y, z, n) => g.onCreak(x, y, z, n), release: (a, b, c) => g.releaseCell(a, b, c), onRegion: (x, y, z) => g.queueLoad(x, y, z) });
  const watch = (sec) => {
    const co0 = S().stats.collapses || 0; let creaks = 0, loose = 0; const orig = g.onCreak.bind(g); g.onCreak = (...a) => { creaks++; return orig(...a); };
    try { for (let n = 0; n < sec / 0.5; n++) { g.time += 0.5; stepSim(0.5); loose = Math.max(loose, sim().n); } } finally { g.onCreak = orig; }
    return { collapses: (S().stats.collapses || 0) - co0, creaks, loose };
  };
  const world = async (up = UP) => { await newWorld(); fresh(up); S().money = 1e13; g.surgeT = 1e9; clearBodies(); };
  const firstBad = (b) => { let first = -1, B = 0; for (let a = 0; a < b.len && first < 0; a++) for (let q = 0; q < b.wd; q++) { const s = w().stress(b.i0 + a, b.ht, b.lo + q); if (s) { B = s.B; if (s.margin < 0) { first = a; break; } } } return { first, B }; };

  await T('cavein.the-safe-length-of-an-unsupported-tunnel-is-the-same-at-every-width-even-with-the-deepest-tamping', async () => {
    const bad = [], rows = [];
    for (const tamp of [0, 8]) for (const wd of [2, 4, 6, 8, 12, 16, 24]) {
      await world({ ...UP, tamp }); const b = bore(wd, 5, { rows: 30, len: 70, queue: false }); const r = firstBad(b); rows.push(`tamp ${tamp} w${wd}: first bad cell ${r.first} of limit ${r.B}`);
      if (r.first < 0) bad.push(`tamp ${tamp} width ${wd}: no failing roof in 70 cells (limit ${r.B})`); else if (!(r.first >= r.B - 2 && r.first <= r.B + 1)) bad.push(`tamp ${tamp} width ${wd}: the roof first fails at ${r.first}, the limit is ${r.B}`);
    }
    // and it was not so before: with the old fixed allowance of 500 cells the same wide tunnels failed early
    await world({ ...UP, tamp: 8 }); w().capPerStep = 0; const b24 = bore(24, 5, { rows: 30, len: 70, queue: false }); const old = firstBad(b24); w().capPerStep = undefined;
    if (!(old.first >= 0 && old.first < old.B - 5)) bad.push(`the old allowance should fail early at width 24: first ${old.first} of ${old.B}`);
    if (CAVITY_CAP !== 500 || CAVITY_PER_STEP < 40) bad.push('the allowance constants moved');
    return bad.length === 0 || bad.join('; ');
  });

  await T('cavein.a-wide-hall-is-judged-by-the-distance-to-its-anchors-not-by-how-many-cells-it-has', async () => {
    await world({ ...UP, tamp: 8 }); const bad = [];
    // a hall 40 cells (24 m) wide with a bulkhead wall across it 20 cells in: the roof 20 cells past the wall is 19 from an anchor and the limit is 27, so it stands
    const b = bore(40, 5, { rows: 30, len: 60, queue: false }); for (let k = b.lo; k < b.lo + 40; k++) for (let j = 0; j < 5; j++) w().setCell(b.i0 + 20, j, k, PD.BULK, 0);
    const probe = (a) => w().stress(b.i0 + a, 5, b.lo + 20);
    const near = probe(28), far = probe(40); if (!near || !far) return 'no roof cell';
    if (!(near.d === 7 && near.margin >= 0)) bad.push(`8 cells past the wall: distance ${near.d} margin ${near.margin}`);
    if (!(far.d === 19 && far.margin >= 0)) bad.push(`20 cells past the wall: distance ${far.d} margin ${far.margin} (limit ${far.B}); the search ran out of cells at ${CAVITY_CAP + CAVITY_PER_STEP * (far.B + 1)}`);
    w().capPerStep = 0; const oldFar = probe(40); w().capPerStep = undefined; if (!(oldFar.d === Infinity)) bad.push('the old fixed allowance would have called that roof unsupported: it gave ' + oldFar.d);
    return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- the real loop: lined stands, unlined falls
  const CLASSES = [['cube', 'steel', 4, 4, 8], ['arch6', 'steel', 6, 5, 12], ['arch8', 'steel', 8, 6, 12], ['arch12', 'steel', 12, 8, 12]];
  for (const [cls, mat, wd, ht, every] of CLASSES) await T(`cavein.${cls}-tunnel-lined-every-${every}-cells-stands-and-unlined-it-caves-in-near-the-bay`, async () => {
    const bad = [];
    await world(); let b = bore(wd, ht, { rows: 32, len: 56 }); const sups = line(b, cls === 'cube' ? 'cube' : 'arch', mat, every); let r = watch(40);
    if (r.collapses > 0 || r.loose > 8) bad.push(`lined (${sups.length} supports): collapses ${r.collapses}, loose ${r.loose}, creaks ${r.creaks}`);
    await world(); b = bore(wd, ht, { rows: 32, len: 56 }); r = watch(40);
    if (!(r.collapses > 0 || r.loose > 8)) bad.push(`unlined: nothing fell (creaks ${r.creaks})`);
    return bad.length === 0 || bad.join('; ');
  });
  for (const [cls, mat, wd, ht, every] of CLASSES) await T(`cavein.${cls}-tunnel-at-500-m-lined-every-${every}-cells-stands-and-unlined-it-caves-in`, async () => {
    const bad = [], up = { ...UP, rebar: 1, titan: 1 }, mt = 'titan';
    await world(up); let b = bore(wd, ht, { dist: 500, len: 48 }); const sups = line(b, cls === 'cube' ? 'cube' : 'arch', mt, every); let r = watch(40);
    if (r.collapses > 0 || r.loose > 8) bad.push(`lined (${sups.length} supports): collapses ${r.collapses}, loose ${r.loose}, creaks ${r.creaks}`);
    await world(up); b = bore(wd, ht, { dist: 500, len: 48 }); r = watch(40);
    if (!(r.collapses > 0 || r.loose > 8)) bad.push(`unlined: nothing fell (creaks ${r.creaks})`);
    return bad.length === 0 || bad.join('; ');
  });
}
