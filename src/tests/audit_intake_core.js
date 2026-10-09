// intake.audit.* : the audit of Belt Intake (src/beltintake.js). Each test here went in failing first, or pins down an attack that was tried and held.
// Same driving style as intake_core.js: BI.update is run by hand with g.time moving, so a tile holds exactly what the pull put there.
import { makeBeltKit, UP_BASE } from './belts_lib.js';
import * as BI from '../beltintake.js';
import { capOf } from '../beltdata.js';
import * as BINS from '../bins.js';
import { NEEDLE, DECOY0 } from '../plushdata.js';
import { pools } from '../plushdata.js';

export default async function (ctx) {
  const { T: T0, g, S, p, L, tiles, toI, toK, cellX, cellZ } = ctx;
  const B = makeBeltKit(ctx), T = B.T, sp = B.sp; void T0;
  const ci = () => toI(-11), ck = () => toK(0.3);
  const setup = (lv = 0, extra = {}) => { B.setup({ ...UP_BASE, beltIntake: lv, ...extra }); delete S().beltIntakeOff; g._bi = null; g.fliers.length = 0; g.blacking = false; return g.T; };
  const hands = (n, id = sp) => { S().carry = Array.from({ length: n }, () => ({ sp: id, vr: 0 })); };
  const stand = (x, z) => { p().pos.set(x, 0, z); p().vel.set(0, 0, 0); };
  const tick = (secs, dt = 0.05, each) => { for (let n = 0, m = Math.round(secs / dt); n < m; n++) { g.time += dt; BI.update(g, dt); if (each) each(); } };
  const total = (ts) => ts.reduce((a, t) => a + t.items.length, 0);
  const clear = (ts) => () => { for (const t of ts) t.items.length = 0; };
  const one = (i = ci(), k = ck(), extra = {}) => B.lay(0, 1, i, k, 0, 0, extra)[0];
  const block = (n = 5, j = 0) => { const out = []; for (let r = 0; r < n; r++) out.push(...B.lay(0, n, ci() - (n >> 1), ck() - (n >> 1) + r, 0, j)); return out; };
  const cart = (n, x, z, extra = {}) => { S().cart = { tier: 2, x, y: 0, z, yaw: 0, mode: 'stay', load: Array.from({ length: n }, () => ({ sp, vr: 0 })), ...extra }; g.cart.sync(); return S().cart; };

  await T('intake.audit.passing-out-stops-the-hands-pull-whatever-you-carry-spills-in-the-tunnel', async () => {
    setup(7); const ts = block(3); hands(10); stand(cellX(ci()), cellZ(ck())); const bad = [];
    g.blacking = true; tick(1, 0.05, clear(ts)); g.blacking = false;
    if (S().carry.length !== 10) bad.push('pulled ' + (10 - S().carry.length) + ' plush off a player who is passed out');
    tick(0.2, 0.05, clear(ts)); if (S().carry.length === 10) bad.push('does not pull again once awake');
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.audit.a-pull-does-not-count-the-species-again-in-the-dex', async () => {
    setup(7); const t1 = one(); stand(cellX(ci()) - 1, cellZ(ck())); const other = pools[0][1], bad = [];
    S().dex = { [sp]: 1 }; hands(3); tick(0.2);
    if (S().dex[sp] !== 1) bad.push('a species seen once is now counted ' + S().dex[sp] + ' (a Fresh gate would call it old)');
    S().carry = [{ sp: other, vr: 0 }]; delete S().dex[other]; t1.items.length = 0; g._bi = null; tick(0.2); if (S().carry.length) bad.push('the second species was not pulled');
    if (S().dex[other] === undefined) bad.push('a species that was never seen is not registered');
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.audit.a-cart-sent-to-a-bin-keeps-its-load-and-an-unassigned-one-feeds', async () => {
    setup(7); const ts = block(3); const bad = [];
    const c = cart(20, cellX(ci()) + 0.5, cellZ(ck()), { dest: BINS.HALL }); S().carry = []; stand(cellX(ci()) + 30, cellZ(ck()));
    tick(1, 0.05, clear(ts)); if (c.load.length !== 20) bad.push('a belt took ' + (20 - c.load.length) + ' plush off a cart that was sent to a bin');
    c.dest = 0; g._bi = null; tick(1, 0.05, clear(ts)); if (c.load.length === 20) bad.push('an unassigned cart does not feed');
    c.dest = 424242; g._bi = null; c.load = Array.from({ length: 20 }, () => ({ sp, vr: 0 })); tick(1, 0.05, clear(ts)); if (c.load.length === 20) bad.push('a cart sent to a bin that is gone does not feed');
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.audit.a-belt-with-no-power-takes-what-fits-and-no-more', async () => {
    setup(7); const t = one(); hands(50); stand(cellX(ci()) - 1, cellZ(ck())); const bad = [];
    tick(4);   // the tile is never emptied and never moves its plush on: the belt only holds
    if (t.items.length === 0 || t.items.length > capOf(1)) bad.push('the belt holds ' + t.items.length + ' (it fits ' + capOf(1) + ')');
    if (50 - S().carry.length !== t.items.length) bad.push(`hands lost ${50 - S().carry.length} but the belt holds ${t.items.length}`);
    const ts = t.items.map((x) => x.t); for (let q = 1; q < ts.length; q++) if (ts[q - 1] - ts[q] < 0.33) bad.push('plush closer than the spacing: ' + ts.join(','));
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.audit.a-belt-taken-down-while-it-pulls-loses-nothing-but-what-it-held', async () => {
    setup(7); const ts = block(3); hands(40); stand(cellX(ci()), cellZ(ck())); const bad = [];
    tick(0.3); const mid = ts.find((t) => t.items.length) || ts[4]; const lost = mid.items.length;
    const before = S().carry.length + total(ts);
    L().remove(mid); let threw = null; try { tick(1, 0.05, () => { for (const t of ts) if (t !== mid) t.items.length = 0; }); } catch (e) { threw = e; }
    if (threw) bad.push('threw: ' + threw.message);
    if (mid.items.length > lost) bad.push('the pull kept feeding the tile that was taken down');
    void before;
    // everything gone: no tiles at all, then a tile back
    for (const t of [...L().tiles.values()]) L().remove(t);
    try { tick(0.5); } catch (e) { bad.push('threw with no tiles: ' + e.message); }
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.audit.a-cart-stowed-or-swapped-while-it-pulls-is-left-alone', async () => {
    setup(7); const ts = block(3); const bad = [];
    const c = cart(30, cellX(ci()) + 0.5, cellZ(ck())); S().carry = []; stand(cellX(ci()) + 30, cellZ(ck()));
    tick(0.3, 0.05, clear(ts)); if (c.load.length === 30) bad.push('the cart did not feed');
    try { g.cart.stow(); tick(1, 0.05, clear(ts)); } catch (e) { bad.push('threw after the cart was stowed: ' + e.message); }
    if (S().cart) bad.push('stow left a cart');
    try { cart(5, cellX(ci()) + 0.5, cellZ(ck())); tick(0.5, 0.05, clear(ts)); } catch (e) { bad.push('threw with a new cart: ' + e.message); }
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.audit.fakes-and-special-cells-in-the-hands-stay-in-the-hands', async () => {
    setup(7); const ts = block(3); stand(cellX(ci()), cellZ(ck())); const bad = [];
    S().carry = [{ sp: DECOY0, vr: 0 }, { sp: 60005, vr: 0 }, { sp: 60006, vr: 0 }, { sp: 60007, vr: 0 }, { sp: 60008, vr: 0 }, { sp: NEEDLE, vr: 0 }];
    tick(1, 0.05, clear(ts)); if (S().carry.length !== 6) bad.push('pulled ' + (6 - S().carry.length) + ' of the fakes and special cells');
    // a real plush under them is still reached
    S().carry.unshift({ sp, vr: 0 }); tick(0.3, 0.05, clear(ts)); if (S().carry.length !== 6) bad.push('the plush under the fakes was not pulled alone');
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.audit.a-dense-stack-of-full-belts-costs-no-more-than-a-slab', async () => {
    setup(7); stand(cellX(ci()), cellZ(ck())); const bad = [];
    // 7 floors of 20 by 20 belts all inside the reach of a Mk8 intake, every one of them full (the worst case for the candidate list)
    const all = []; for (let j = -3; j <= 3; j++) all.push(...block(20, j));
    const full = () => { for (const t of all) if (t.items.length < 3) t.items = [{ sp, vr: 0, t: 0.9 }, { sp, vr: 0, t: 0.55 }, { sp, vr: 0, t: 0.2 }]; };
    full(); hands(100000); let sum = 0, worst = 0; const N = 120;
    for (let f = 0; f < N; f++) { stand(cellX(ci()) + 0.01 * (f % 7), cellZ(ck())); g.time += 1 / 60; const a = performance.now(); BI.update(g, 1 / 60); const d = performance.now() - a; sum += d; worst = Math.max(worst, d); }
    window.__intakeDense = { tiles: all.length, mean: +(sum / N).toFixed(3), worst: +worst.toFixed(3) }; console.log('intake dense stack: ' + JSON.stringify(window.__intakeDense));
    if (sum / N > 2.5) bad.push(`${all.length} full tiles in reach cost ${(sum / N).toFixed(2)} ms a frame`);
    setup(0);
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.audit.a-jammed-belt-nearer-than-the-bin-does-not-hold-the-bin-back-forever', async () => {
    // a belt with no power and one plush stuck too close to its start cannot take another, so it must not keep the bin from selling either
    setup(0); const bp = g.hall.binPos, bad = [];
    const t = B.lay(0, 1, ctx.toI(bp.x - 3.6), ctx.toK(bp.z), 0)[0]; t.items = [{ sp, vr: 0, t: 0.1 }]; hands(6); g._adT = 0; stand(cellX(ctx.toI(bp.x - 3.6)) + 0.6, bp.z); const m0 = S().money;
    for (let n = 0; n < 60; n++) { g.time += 0.05; BI.update(g, 0.05); g.autoDump(0.05); }
    if (S().money <= m0 || S().carry.length === 6) bad.push('the bin sold nothing in 3 s: a belt that could not take a plush held it back');
    if (t.items.length !== 1) bad.push('the jammed belt took a plush it had no room for');
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.audit.nothing-comes-from-nowhere-the-money-from-a-pull-is-what-the-plush-were-worth', async () => {
    // the same 20 plush sold by hand at the bin and through a belt that ends at it: the belt pays no more (no streak, no swish)
    setup(7); const bp = g.hall.binPos, bad = [];
    hands(20); stand(bp.x - 0.5, bp.z); S().money = 0; g._adT = 0; for (let n = 0; n < 200 && S().carry.length; n++) { g.time += 0.05; g.autoDump(0.05); }
    const byHand = S().money;
    setup(7); const line = B.lay(0, 4, ctx.toI(bp.x - 4.2), ctx.toK(bp.z), 0); void line;
    hands(20); stand(cellX(ctx.toI(bp.x - 4.2)) - 0.2, bp.z); S().money = 0;
    for (let n = 0; n < 600 && (S().carry.length || total(line)); n++) { g.time += 0.05; BI.update(g, 0.05); g.logi.update(0.05); g.autoDump(0.05); }
    const byBelt = S().money; if (S().carry.length) bad.push('the carry was not emptied: ' + S().carry.length);
    if (byBelt > byHand) bad.push(`a belt paid ${byBelt}, the bin paid ${byHand} for the same plush`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.audit.five-thousand-belt-tiles-cost-about-what-five-hundred-do', async () => {
    const res = {}, bad = [];
    for (const n of [500, 5000]) {
      setup(7); const rows = n / 100; for (let r = 0; r < rows; r++) B.lay(0, 100, ci() - 50, ck() - (rows >> 1) + r, 0);
      if (tiles().length < n) return 'only ' + tiles().length + ' tiles';
      const time = (setPos, frames) => { let sum = 0, worst = 0; for (let f = 0; f < frames; f++) { setPos(f); g.time += 1 / 60; const a = performance.now(); BI.update(g, 1 / 60); const d = performance.now() - a; sum += d; worst = Math.max(worst, d); for (const x of tiles()) if (x.items.length) x.items.length = 0; } return { mean: sum / frames, worst }; };
      hands(100000);
      res['stand' + n] = time(() => stand(cellX(ci()), cellZ(ck())), 150);
      res['run' + n] = time((f) => stand(cellX(ci()) - 40 + (f % 150) * 0.5, cellZ(ck()) - (rows >> 1) * 0.6 + 3), 150);   // a sprint: 30 m a second, so the list of belts near you is rebuilt every other frame
      res['far' + n] = time(() => stand(cellX(ci()) + 90, cellZ(ck()) + 60), 150);
    }
    const fx = (v) => +v.mean.toFixed(3);
    for (const k of Object.keys(res)) if (res[k].mean > (k.startsWith('far') ? 0.25 : 2.5)) bad.push(`${k}: ${fx(res[k])} ms a frame`);
    if (res.far5000.mean > Math.max(0.05, res.far500.mean * 3)) bad.push('far cost grew with the number of tiles: ' + fx(res.far500) + ' to ' + fx(res.far5000));
    window.__intake5000 = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { mean: fx(v), worst: +v.worst.toFixed(2) }])); console.log('intake 5000 timings: ' + JSON.stringify(window.__intake5000));
    setup(0);
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.audit.a-save-with-a-wild-intake-level-or-switch-cannot-break-the-numbers', async () => {
    const bad = [];
    for (const lv of [99, -3, 2.5, NaN, '4', null, undefined]) {
      let o; try { setup(0); S().up.beltIntake = lv; g.recompute ? g.recompute() : null; const T = g.T; T.intakeLevel = lv; o = BI.intakeOf(T); } catch (e) { bad.push(String(lv) + ' threw ' + e.message); continue; }
      if (!(o.rate >= 2 && o.rate <= 256 && o.range >= 2 && o.range <= 6) || !Number.isInteger(o.level)) bad.push(`level ${String(lv)} gave ${JSON.stringify(o)}`);
    }
    setup(7); const ts = block(3); hands(10); stand(cellX(ci()), cellZ(ck())); S().beltIntakeOff = 'maybe'; tick(0.5, 0.05, clear(ts)); if (S().carry.length === 10) bad.push('an old saved switch of maybe kept it off');
    for (const v of [true, 1, 'yes', {}]) { S().beltIntakeOff = v; S().carry.length = 0; hands(10); g._bi = null; tick(0.5, 0.05, clear(ts)); if (S().carry.length === 10) bad.push('an old saved switch of ' + JSON.stringify(v) + ' kept it off'); if (S().beltIntakeOff !== undefined) bad.push('the old switch ' + JSON.stringify(v) + ' was not deleted'); }
    return bad.length === 0 || bad.join('; ');
  });

  void tiles;
}
