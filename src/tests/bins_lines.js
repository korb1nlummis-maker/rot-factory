// bins.line.*: the end of a belt line, a mech scooper and a Mine Rail line with a bin of their own. A belt can only sell where it touches, so its bin picks between the bins
// it touches; a mech only feeds a line that reaches its bin; a rail line sells only at its bin. Run: `await __selftest('bins.line.')`
import { kit } from './bins_lib.js';
import { makeRail } from './rail_lib.js';
import * as BINS from '../bins.js';
import * as R from '../rail.js';

export default async function (ctx) {
  const { g, S, L, toI, toK, cellX, cellZ } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const val = (sp) => g.valueOf(sp, 0, 0);
  const sold = (id) => BINS.today(g, id);
  // a straight east line of belts on row k from cell i0 to i1; the plush that reach the last tile are handed to whatever it touches
  const east = (i0, i1, k) => { const out = []; for (let i = i0; i <= i1; i++) out.push(K.rawTile('belt', i, k, { dir: 0 })); return out; };
  const feed = (t, n = 1, sp = 3) => { for (let q = 0; q < n; q++) t.items.push({ sp, vr: 0, t: 0.95 }); };
  const flush = (secs = 3) => { for (let n = 0; n < secs / 0.1; n++) { for (const t of ctx.tiles()) t.pw = 1; g.time += 0.1; L().update(0.1); } };
  const front = (t) => ({ x: cellX(t.i) + 0.6, z: cellZ(t.k) });

  await G('bins.line.a-belt-end-between-two-bins-sells-where-it-is-assigned-and-the-nearest-on-auto', async () => {
    const bad = [], b = K.bin(), ie = toI(b.x) - 2, k = toK(b.z); const line = east(ie - 3, ie, k), end = line[line.length - 1], f = front(end);
    if (Math.hypot(f.x - b.x, f.z - b.z) >= BINS.HALL_REACH) return 'the test line does not reach the bin: ' + Math.hypot(f.x - b.x, f.z - b.z);
    const d = K.beacon(f.x, f.z - 1.2), far = K.beacon(-2, 9); K.run(0.2);
    // Auto: the nearest of the bins it touches, as before
    const near = Math.hypot(f.x - b.x, f.z - b.z) <= 1.2 ? BINS.HALL : d.id; feed(end, 2); flush();
    if (sold(near).n !== 2) bad.push(`Auto: expected the nearest (${near}) to take 2, tally bin ${sold(BINS.HALL).n} depot ${sold(d.id).n}`);
    // assigned to the depot it touches: sold there, same money
    g.setCfg(end, { dest: d.id }); const m0 = K.money(); feed(end, 3); flush();
    if (sold(d.id).n !== 3 + (near === d.id ? 2 : 0)) bad.push('assigned to the depot: tally ' + sold(d.id).n);
    if (K.money() - m0 !== 3 * val(3)) bad.push(`paid ${K.money() - m0}, worth ${3 * val(3)}`);
    // assigned to the SORT bin
    g.setCfg(end, { dest: BINS.HALL }); const h0 = sold(BINS.HALL).n; feed(end, 2); flush(); if (sold(BINS.HALL).n !== h0 + 2) bad.push('assigned to the SORT bin: ' + sold(BINS.HALL).n);
    // assigned to a bin it does not touch: Auto here, and it says so (the assignment stays)
    g.setCfg(end, { dest: far.id }); K.toasts.length = 0; const n0 = sold(near).n; feed(end, 2); flush(); if (sold(near).n !== n0 + 2) bad.push('a bin out of reach should sell at the nearest touched one');
    if (!K.toasts.some((t) => /Belt end cannot reach Depot B from here, so it uses Auto/.test(t))) bad.push('no message: ' + K.toasts);
    if (end.dest !== far.id) bad.push('the assignment was dropped');
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.line.a-belt-end-whose-bin-has-no-power-sells-at-what-it-touches-and-says-so', async () => {
    const bad = [], b = K.bin(), ie = toI(b.x) - 2, k = toK(b.z); const line = east(ie - 3, ie, k), end = line[line.length - 1], f = front(end);
    const d = K.beacon(f.x, f.z - 1.2); K.run(0.2); g.setCfg(end, { dest: d.id }); K.off.add(d.id); K.run(0.2); const near = Math.hypot(f.x - b.x, f.z - b.z) <= 1.2 ? BINS.HALL : d.id;
    feed(end, 2); flush(); if (sold(near).n !== 2) bad.push('dark depot: tally at the nearest ' + sold(near).n);
    if (!K.toasts.some((t) => /Belt end: Depot A has no power, so it uses Auto/.test(t))) bad.push('no message: ' + K.toasts);
    // a belt that ends where no bin is sells nothing, assigned or not (it never did)
    const lone = east(toI(-4), toI(-1), toK(2)); const e2 = lone[lone.length - 1]; g.setCfg(e2, { dest: BINS.HALL }); const before = K.money(); feed(e2, 2); flush(); if (K.money() !== before) bad.push('a belt far from every bin sold');
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.line.a-mech-with-a-bin-only-feeds-a-line-that-reaches-it-and-auto-feeds-any', async () => {
    const bad = [], b = K.bin(), ie = toI(b.x) - 2, k = toK(b.z);
    const mkLine = (iEnd, kk) => { const a = K.rawTile('belt', iEnd - 5, kk - 1, { dir: 1 }); const main = east(iEnd - 5, iEnd, kk); const m = K.rawTile('mech', iEnd - 4, kk - 1, { dir: 0, buf: [], out: 0, adv: 0, state: 'dig' }); m.timer = 1e9; return { a, main, m, end: main[main.length - 1] }; };   // (the mech never digs: the test feeds its buffer)
    const L1 = mkLine(ie, k), f1 = front(L1.end);   // ends at the SORT bin
    const d = K.beacon(2, 2);
    K.run(0.2);
    // Auto: the plush go down the line to the SORT bin
    L1.m.buf = K.mix(3); flush(8); if (sold(BINS.HALL).n !== 3 || L1.m.buf.length) bad.push(`Auto mech: sold ${sold(BINS.HALL).n}, buffer ${L1.m.buf.length}`);
    // a mech assigned to the depot whose line only reaches the SORT bin: nothing leaves it, the readout says why
    g.setCfg(L1.m, { dest: d.id }); L1.m.buf = K.mix(3); const h0 = sold(BINS.HALL).n; flush(8);
    if (L1.m.buf.length !== 3 || sold(BINS.HALL).n !== h0) bad.push(`a locked mech fed the wrong line: buffer ${L1.m.buf.length}, sold ${sold(BINS.HALL).n - h0}`);
    if (!BINS.infoLines(g, L1.m).some((l) => /^Held: the belt it feeds does not reach that bin/.test(l))) bad.push('the readout does not say the mech is held: ' + BINS.infoLines(g, L1.m));
    // assigned to the SORT bin the same line is fine
    g.setCfg(L1.m, { dest: BINS.HALL }); flush(8); if (L1.m.buf.length || sold(BINS.HALL).n !== h0 + 3) bad.push(`assigned to the bin the line reaches: buffer ${L1.m.buf.length}, sold ${sold(BINS.HALL).n - h0}`);
    // a dark or removed bin: it is Auto again (it feeds), and says so
    g.setCfg(L1.m, { dest: d.id }); K.off.add(d.id); K.run(0.2); L1.m.buf = K.mix(2); K.toasts.length = 0; flush(8);
    if (L1.m.buf.length) bad.push('a mech whose bin is dark should feed any line: ' + L1.m.buf.length);
    if (!K.toasts.some((t) => /Mech Scooper: Depot A has no power, so it uses Auto/.test(t))) bad.push('no message: ' + K.toasts);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.line.a-mech-feeds-a-line-that-ends-at-its-bin-and-the-hover-says-what-holds-it', async () => {
    const bad = [], i1 = toI(-0.2), k1 = toK(0.6);
    const a = K.rawTile('belt', i1 - 6, k1 - 1, { dir: 1 }), main = east(i1 - 6, i1, k1), m = K.rawTile('mech', i1 - 5, k1 - 1, { dir: 0, buf: [], out: 0, adv: 0, state: 'dig' }), end = main[main.length - 1], f = front(end);
    m.timer = 1e9; const d = K.beacon(f.x + 0.4, f.z + 1.0); K.run(0.2); void a;
    g.setCfg(m, { dest: d.id }); m.buf = K.mix(4); flush(10);
    if (m.buf.length) bad.push('the mech held back plush for a line that reaches its depot: ' + m.buf.length);
    if (sold(d.id).n !== 4) bad.push(`the line ends at the depot, tally ${sold(d.id).n} (bin ${sold(BINS.HALL).n})`);
    return bad.length === 0 || bad.join(' || ');
  });

  // ------------------------------------------------------------------ the Mine Rail
  const RL = makeRail(ctx);
  const railTest = (name, fn) => ctx.T(name, async () => {
    let stop = () => {};
    try { RL.setup(); g.mode = 'play'; S().money = 1e12; S().binStats = {}; g._binSaid = new Map(); K.off.clear(); K.toasts.length = 0; stop = K.watch(); return await fn(); }
    finally { stop(); RL.clean(); g.cfgClip = null; if (g.ui.openModal) g.ui.closeModals(); }
  });
  const load = (car, n = 5) => { car.cargo = Array.from({ length: n }, () => ({ sp: 3, vr: 0 })); car.n = n; };
  const nearBin = () => { const b = K.bin(); return { x: b.x, z: b.z }; };
  void nearBin;

  await railTest('bins.line.a-cart-sells-at-the-nearest-bin-on-auto-and-only-at-the-bin-of-its-line-when-assigned', async () => {
    const bad = [], std = RL.std(); const b = K.bin(), d = K.beacon(-20, 1.0); RL.power(-19.1, 1.6); R.invalidate(g); g.power.markDirty(); ctx.adv(0.5);
    if (!(d.pw > 0.05)) return 'the depot has no power in the test grid';
    const nearD = RL.cart(RL.ci(-19), 0, std.k), nearBin2 = RL.cart(RL.ci(0.2), 0, std.k);
    // Auto: each cart sells at the bin it stops by
    load(nearD, 3); load(nearBin2, 3); ctx.adv(3);
    if (sold(d.id).n !== 3 || sold(BINS.HALL).n !== 3) bad.push(`Auto: depot ${sold(d.id).n} bin ${sold(BINS.HALL).n}`);
    // the line assigned to the SORT bin (any station on it): the cart by the depot keeps its load, the cart by the bin sells
    g.setCfg(std.base, { dest: BINS.HALL }); load(nearD, 3); load(nearBin2, 3); const d0 = sold(d.id).n, h0 = sold(BINS.HALL).n; ctx.adv(3);
    if (sold(d.id).n !== d0 || nearD.cargo.length !== 3) bad.push('the cart by the depot sold though its line is assigned to the SORT bin');
    if (sold(BINS.HALL).n !== h0 + 3) bad.push('the cart by the bin did not sell: ' + (sold(BINS.HALL).n - h0));
    // the line assigned to the depot: the other way round
    g.setCfg(std.base, { dest: d.id }); load(nearBin2, 3); const d1 = sold(d.id).n, h1 = sold(BINS.HALL).n; ctx.adv(3);
    if (sold(BINS.HALL).n !== h1 || nearBin2.cargo.length !== 3) bad.push('the cart by the bin sold though its line is assigned to the depot');
    if (sold(d.id).n !== d1 + 3) bad.push('the cart by the depot did not sell: ' + (sold(d.id).n - d1));
    // a cart with a bin of its own beats its line
    g.setCfg(nearBin2, { dest: BINS.HALL }); const h2 = sold(BINS.HALL).n; ctx.adv(3); if (sold(BINS.HALL).n !== h2 + 3) bad.push('the cart\'s own bin should win over its line\'s');
    const paid = (() => { const m0 = K.money(); load(nearD, 4); ctx.adv(3); return K.money() - m0; })();
    if (paid !== 4 * val(3)) bad.push(`paid ${paid}, worth ${4 * val(3)}`);
    void b; void R;
    return bad.length === 0 || bad.join(' || ');
  });

  await railTest('bins.line.a-line-that-never-comes-near-its-bin-or-whose-bin-is-dark-sells-at-the-nearest-and-says-so', async () => {
    const bad = [], std = RL.std(); const far = K.beacon(8, 5.5);   // the track runs along z -2.2: this depot is 7.7 m off it
    RL.power(8.9, 5.5); R.invalidate(g); ctx.adv(0.5); g.setCfg(std.base, { dest: far.id }); const car = RL.cart(RL.ci(0.2), 0, std.k); load(car, 3); K.toasts.length = 0; ctx.adv(3);
    if (sold(BINS.HALL).n !== 3) bad.push('an unreachable bin: the cart should sell at the nearest one: ' + sold(BINS.HALL).n);
    if (!K.toasts.some((t) => /Rail Cart cannot reach Depot A from here, so it uses Auto/.test(t))) bad.push('no message: ' + K.toasts);
    const near = K.beacon(-6, 0.5); R.invalidate(g); g.setCfg(std.base, { dest: near.id }); g._binSaid = new Map(); const car2 = RL.cart(RL.ci(0.2), 0, std.k); load(car2, 2); K.toasts.length = 0;   // (no pole reaches it: it is dark)
    ctx.adv(3);
    if (!K.toasts.some((t) => /Depot B has no power, so it uses Auto/.test(t))) bad.push('no dark message: ' + K.toasts);
    return bad.length === 0 || bad.join(' || ');
  });
}
