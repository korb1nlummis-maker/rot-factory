// audit_hose.* : the keys and the mouse around the laying mode, pressed for real: a click with a hose out must only anchor a route (the Plush Vacuum every hose owner has must not
// also pull plush off the wall), R must not punch, the wheel and the number keys, the planner keys, and what the words in the hints promise.
import { makeHoseKit } from './hose_lib.js';
import { pools } from '../plushdata.js';
import * as BP from '../beltplan.js';

const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

export default async function (ctx) {
  const { g, S, w, L, adv, tiles } = ctx;
  const H = makeHoseKit(ctx), B = H.B, T = B.T, io = H.io;
  const bad = (a) => a.length === 0 || a.join('; ');
  const done = () => { g.bplan = null; g.machines.setGhost(null); g.plan = null; g.keys.Mouse0 = false; g.vacT = 0; };
  const wall = () => { for (let di = 2; di <= 5; di++) for (let dk = -2; dk <= 2; dk++) for (let j = 0; j < 3; j++) w().setCell(H.o.i + di, j, H.o.k + dk, pools[0][(di + dk + j) & 3], 0); };
  const unwall = () => { for (let di = 2; di <= 5; di++) for (let dk = -2; dk <= 2; dk++) for (let j = 0; j < 3; j++) w().removeCell(H.o.i + di, j, H.o.k + dk, false); };

  await T('audit_hose.a-click-with-a-hose-out-anchors-a-route-and-does-not-vacuum-the-wall', async () => {
    H.setup(20); const b = []; wall(); S().carry = []; g.T.carry = 1e9; g.vacT = 0;
    // the control: bare hands, the same look, the same click: the vacuum takes plush (so the wall is in its cone)
    g.stowed = true; g.rebuildTools(); await H.aim(1, 0, 0); S().carry = []; io.mouseDown(0); adv(0.5); io.mouseUp(0); adv(0.1); const control = S().carry.length; S().carry = []; g.vacT = 0;
    if (control < 1) { unwall(); return 'the control click vacuumed nothing: the setup does not test anything (' + control + ')'; }
    unwall(); wall(); g.stowed = false; H.K.equip('hose'); await H.aim(1, 0, 0);
    S().carry = []; g.vacT = 0; io.mouseDown(0); adv(0.5); io.mouseUp(0); adv(0.1);
    if (!g.bplan || !g.bplan.start) b.push('the click did not anchor a route');
    if (S().carry.length) b.push(`a click that anchored a route also vacuumed ${S().carry.length} plush into your hands`);
    unwall(); done(); return bad(b);
  });

  await T('audit_hose.holding-the-button-over-the-wall-with-a-belt-out-does-not-vacuum-either', async () => {
    H.setup(0); const b = []; ctx.craft('belt', 10); H.K.equip('belt'); wall(); S().carry = []; g.T.carry = 1e9; g.vacT = 0;
    await H.aim(1, 0, 0); io.mouseDown(0); adv(1.0); io.mouseUp(0); adv(0.1);
    if (S().carry.length) b.push(`a belt out and the button held vacuumed ${S().carry.length} plush`);
    unwall(); done(); return bad(b);
  });

  await T('audit_hose.r-with-a-belt-or-hose-out-never-punches-and-a-route-keeps-it-too', async () => {
    H.setup(20); const b = []; let punches = 0; const real = g.punch; g.punch = function () { punches++; return real.apply(this, arguments); };
    try {
      await H.aim(0, 0, 0); io.tap('KeyR'); io.tap('KeyR'); if (punches) b.push('R punched with a hose out');
      io.click(0); io.tap('KeyR'); if (punches) b.push('R punched with a route anchored'); done();
      B.setup(); ctx.craft('belt', 5); H.K.equip('belt'); await H.aim(0, 0, 0); io.tap('KeyR'); if (punches) b.push('R punched with a belt out');
      io.tap('KeyP'); if (punches !== 1) b.push('P no longer punches (' + punches + ')');
    } finally { g.punch = real; }
    return bad(b);
  });

  await T('audit_hose.the-wheel-picks-the-route-shape-while-a-route-is-anchored-and-the-tool-otherwise', async () => {
    H.setup(30); const b = []; await H.aim(0, 0, 0); io.click(0); const pl = await H.aim(8, -4, 0); if (!pl.ok) return pl.why;
    const slot = g.buildIdx, v0 = g.bplan.variant; io.wheel(120); adv(0.05);
    if (g.buildIdx !== slot) b.push('the wheel changed the tool with a route anchored'); if (!g.bplan.manual) b.push('the wheel did not take the shape'); if (g.bplan.variant === v0) b.push('the shape did not change');
    for (let q = 0; q < 6; q++) { io.wheel(120); adv(0.02); await ctx.plan(); if (g.bplan.variant > 2 || g.bplan.variant < 0) b.push('shape ' + g.bplan.variant); }
    io.tap('KeyQ'); const s2 = g.buildIdx; io.tap('KeyQ'); io.wheel(120); if (g.buildIdx === s2 && !g.stowed) { /* wheel with nothing anchored steps the hotbar */ }
    done(); return bad(b);
  });

  await T('audit_hose.a-planner-line-and-a-click-route-never-share-a-start', async () => {
    H.setup(30); const b = []; io.tap('Period'); await H.aim(0, 0, 0); io.tap('KeyB'); if (!g.bplan.start) return 'no planner start';
    const s0 = JSON.stringify(g.bplan.start); io.click(0); if (JSON.stringify(g.bplan.start) !== s0 && g.bplan.click) b.push('a click re-anchored the planner');
    io.tap('Period'); if (g.bplan.on) b.push('the period key did not leave the planner'); if (g.bplan.start && !g.bplan.click) b.push('a start was kept after leaving the planner');
    // and the planner's own route can be cancelled with Q
    io.tap('Period'); await H.aim(0, 4, 0); io.tap('KeyB'); io.tap('KeyQ'); if (g.bplan.start) b.push('Q did not cancel the planner start');
    done(); return bad(b);
  });

  await T('audit_hose.every-hint-the-laying-mode-shows-is-true', async () => {
    H.setup(30); const b = []; await H.aim(0, 0, 0);
    const idle = io.hint(); if (/click/i.test(idle) && !/aim a whole route/.test(idle)) b.push('idle hint: ' + idle);
    io.click(0); const h1 = io.hint(); for (const w of ['R', 'Q']) if (!new RegExp(w).test(h1)) b.push(`the anchor hint does not mention ${w}: ${h1}`);
    await H.aim(6, 0, 0); const h2 = io.hint(); const m = /(\d+) pieces? \(([\d.]+) m\)/.exec(h2); const pl = g.plan; if (!m || +m[1] !== pl.route.tiles.length || Math.abs(+m[2] - pl.route.tiles.length * 0.6) > 0.06) b.push('length in the hint: ' + h2);
    if (!/plush per min/.test(h2)) b.push('no rate: ' + h2); const rate = +(/([\d,]+) plush per min/.exec(h2) || [0, '0'])[1].replace(/,/g, ''); if (!(rate > 0)) b.push('rate ' + rate);
    done(); return bad(b);
  });

  await T('audit_hose.the-laying-mode-hint-for-a-belt-is-true-too', async () => {
    B.setup(); H.setup(0); const b = []; ctx.craft('belt', 10); H.K.equip('belt'); await H.aim(0, 0, 0);
    if (!/aim a whole route/.test(io.hint()) || !/R/.test(io.hint())) b.push('belt hint: ' + io.hint());
    io.tap('KeyR'); await H.aim(0, 0, 0); const pl = g.plan; if (!pl || !pl.ent || pl.ent.dir !== 1) b.push('R did not turn the next belt (dir ' + (pl && pl.ent && pl.ent.dir) + ')');
    done(); return bad(b);
  });

  await T('audit_hose.random-routes-lay-exactly-what-was-previewed-and-conserve-items-and-money', async () => {
    H.setup(0); const b = [], r = rng(77); S().money = 1e8; delete S().items.hose; ctx.craft('hose', 25); H.K.equip('hose'); const price = 18; let laid = 0, skipped = 0;
    for (let n = 0; n < 16 && b.length < 4; n++) {
      const si = (r() * 22) | 0, sk = -16 + ((r() * 20) | 0), ei = Math.max(0, Math.min(24, si + ((r() * 17) | 0) - 8)), ek = Math.max(-20, Math.min(6, sk + ((r() * 13) | 0) - 6)), face = (r() * 4) | 0;
      if (H.tileAt(si, sk) || H.tileAt(ei, ek)) { skipped++; continue; }
      await H.aim(si, sk, face); io.click(0); if (!g.bplan || !g.bplan.start) { skipped++; done(); continue; }
      for (let q = (r() * 3) | 0; q > 0; q--) io.tap('KeyR');
      const pl = await H.aim(ei, ek, face); if (!pl || !pl.ok || !pl.route) { skipped++; io.tap('KeyQ'); done(); continue; }
      const tl = pl.route.tiles.map((t) => `${t.i},${t.k},${t.dir}`), cnt = tl.length, held = S().items.hose || 0, m0 = S().money, h0 = H.hoses().length;
      io.click(0); adv(0.05); H.rebuild(); const hs = H.hoses(); laid += cnt;
      if (hs.length - h0 !== cnt) { b.push(`route ${n}: previewed ${cnt}, laid ${hs.length - h0}`); break; }
      const have = new Set(hs.map((t) => `${t.i},${t.k},${t.dir}`)); const miss = tl.filter((x) => !have.has(x)); if (miss.length) b.push(`route ${n}: ${miss.length} previewed pieces are not where they were drawn (${miss[0]})`);
      const used = Math.min(held, cnt), want = (cnt - used) * price; if (Math.abs((m0 - S().money) - want) > 1e-6) b.push(`route ${n}: paid ${m0 - S().money}, wanted ${want}`);
      if ((S().items.hose || 0) !== held - used) b.push(`route ${n}: hoses ${held} -> ${S().items.hose || 0}, used ${used}`);
      if (Object.values(S().items).some((v) => !(v >= 0))) b.push('a bad stack ' + JSON.stringify(S().items));
      if (!S().items.hose) { ctx.craft('hose', 1); } if (g.bplan && g.bplan.start) io.tap('KeyQ'); done();
      const mouths = H.mouths().length, starts = hs.filter((t) => !t.fed).length; if (mouths !== starts) b.push('mouth count disagrees');
    }
    if (laid < 20) b.push(`only ${laid} pieces laid in the soak (${skipped} skipped)`);
    for (const t of H.hoses()) { if (![0, 1, 2, 3].includes(t.dir)) b.push('a piece with dir ' + t.dir); }
    return bad(b);
  });

  await T('audit_hose.leaves-nothing-behind', async () => { done(); B.cleanup(); g.beltRot = null; g._lastLaid = null; return !BP.plannerOn(g, { kind: 'belt', id: 'hose', hose: true }) || 'planner left on'; });
  void tiles; void L;
}
