// bins.machine.*: haul trucks and diggers, a bulldozer's chute, a borer and a claw rig with a bin of their own: where the load goes, the same money, what a bin that is
// gone, dark or too far does. Run: `await __selftest('bins.machine.')`
import { kit } from './bins_lib.js';
import * as BINS from '../bins.js';
import * as HAUL from '../haul.js';

export default async function (ctx) {
  const { g, S, w, toI, toK, cellX, cellZ, spot } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const val = (sp) => g.valueOf(sp, 0, 0);
  const sold = (id) => BINS.today(g, id);
  const tags = (e) => (e.route || []).map((r) => r[2] || '-').join(',');
  const sinkPt = (e) => { const r = (e.route || []).find((q) => q[2] === 'sink'); return r ? { x: r[0], z: r[1] } : null; };
  const done = (tk, n = 1, secs = 240) => K.until(() => (tk.trips || 0) >= n && tk.state === 'idle', secs);

  await G('bins.machine.a-truck-on-auto-hauls-to-the-nearest-bin-as-before-and-the-tally-follows', async () => {
    const bad = [], b = K.bin(), d = K.beacon(b.x + 38, b.z + 8); K.run(0.2); const { tk } = K.site(); const m0 = K.money();
    if (!K.until(() => tk.job, 20)) return 'the truck never took the job';
    const sp = sinkPt(tk); if (Math.hypot(sp.x - d.x, sp.z - d.z) > 4) bad.push('Auto should be the depot beside the digger: sink ' + JSON.stringify(sp));
    if (!done(tk)) bad.push('trip never ended: ' + tk.state);
    if (sold(d.id).n !== 240 || sold(BINS.HALL).n !== 0) bad.push(`tally depot ${sold(d.id).n} bin ${sold(BINS.HALL).n}`);
    if (K.money() - m0 < 240 * val(3) * 0.99 || K.money() - m0 > 240 * val(3) * 1.01) bad.push(`paid ${K.money() - m0}, worth ${240 * val(3)}`);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.machine.a-truck-assigned-to-the-sort-bin-passes-the-nearer-depot-and-the-same-money-is-paid', async () => {
    const bad = [], b = K.bin(), d = K.beacon(b.x + 38, b.z + 8); K.run(0.2); const { tk } = K.site(); g.setCfg(tk, { dest: BINS.HALL }); const m0 = K.money();
    if (!K.until(() => tk.job, 20)) return 'the truck never took the job';
    const sp = sinkPt(tk); if (Math.hypot(sp.x - b.x, sp.z - b.z) > 5) bad.push('the sink should be the SORT bin: ' + JSON.stringify(sp));
    if (!done(tk)) bad.push('trip never ended: ' + tk.state);
    if (sold(BINS.HALL).n !== 240 || sold(d.id).n !== 0) bad.push(`tally bin ${sold(BINS.HALL).n} depot ${sold(d.id).n}`);
    const paid = K.money() - m0; if (paid < 240 * val(3) * 0.99 || paid > 240 * val(3) * 1.01) bad.push(`paid ${paid}, worth ${240 * val(3)}`);
    if (tk.sinkBin !== BINS.HALL) bad.push('sinkBin ' + tk.sinkBin);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.machine.a-digger-with-a-bin-sends-every-truck-that-hauls-it-there-and-the-trucks-own-bin-wins', async () => {
    const bad = [], b = K.bin(), d = K.beacon(b.x + 38, b.z + 8), d2 = K.beacon(b.x + 12, b.z + 20); K.run(0.2);
    const { tk, dg } = K.site(); g.setCfg(dg, { dest: d2.id });
    if (!K.until(() => tk.job, 20)) return 'the truck never took the job';
    let sp = sinkPt(tk); if (Math.hypot(sp.x - d2.x, sp.z - d2.z) > 4) bad.push('the digger\'s depot should be the sink: ' + JSON.stringify(sp));
    if (!done(tk)) bad.push('trip ended? ' + tk.state);
    if (sold(d2.id).n !== 240) bad.push('digger depot tally ' + sold(d2.id).n);
    // now the truck has its own: that one wins over the digger's
    dg.hop = Array.from({ length: 480 }, (_, q) => (q % 2 ? 0 : 3)); dg.hn = 240; g.setCfg(tk, { dest: BINS.HALL });
    if (!K.until(() => tk.job, 30)) return 'second job never started';
    sp = sinkPt(tk); if (Math.hypot(sp.x - b.x, sp.z - b.z) > 5) bad.push('the truck\'s own bin should win: ' + JSON.stringify(sp));
    void d;
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.machine.a-truck-with-a-bin-still-drives-through-the-vehicle-scanner-on-its-road', async () => {
    const bad = [], b = K.bin(), d = K.beacon(b.x + 8, b.z + 8); K.run(0.2); const { tk } = K.site(); g.setCfg(tk, { dest: BINS.HALL });
    const sc = K.scanner(b.x + 25, b.z + 8, 'x');
    if (!K.until(() => tk.job, 20)) return 'the truck never took the job';
    if (tags(tk) !== 'dig,scanA,scan,scanC,sink,home' || tk.sc !== sc.id) bad.push(`route ${tags(tk)} through ${tk.sc} (scanner ${sc.id})`);
    const sp = sinkPt(tk); if (Math.hypot(sp.x - b.x, sp.z - b.z) > 5) bad.push('sink ' + JSON.stringify(sp));
    if (!done(tk, 1, 300)) bad.push('trip never ended: ' + tk.state);
    if (sold(BINS.HALL).n !== 240) bad.push('tally ' + sold(BINS.HALL).n);
    void d;
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.machine.a-load-with-the-one-never-leaves-for-a-depot-without-a-scanner', async () => {
    const bad = [], b = K.bin(), d = K.beacon(b.x + 38, b.z + 8); K.run(0.2); const { tk } = K.site({ one: true }); g.setCfg(tk, { dest: d.id }); let won = 0; const f0 = g.foundNeedle; g.foundNeedle = () => { won++; };
    try {
      K.until(() => tk.state === 'refuse', 60);
      if (tk.state !== 'refuse') bad.push('the truck with The One should refuse to leave: ' + tk.state);
      if (sold(d.id).n !== 0 || won) bad.push('The One got through: ' + sold(d.id).n + ' ' + won);
    } finally { g.foundNeedle = f0; }
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.machine.a-bin-too-far-for-one-charge-is-set-aside-for-the-nearest-and-the-truck-says-so', async () => {
    const bad = [], b = K.bin(), base0 = HAUL.BATT.base;
    try {
      HAUL.BATT.base = 20000;   // one charge now reaches about 1.6 km (a trip there and back at 40 kW)
      const far = K.beacon(b.x + 1750, b.z + 8); K.run(0.2); const { tk } = K.site(); tk.batt = 20000; g.setCfg(tk, { dest: far.id });
      if (!K.until(() => tk.job, 20)) return 'the truck never took the job';
      const sp = sinkPt(tk); if (Math.hypot(sp.x - b.x, sp.z - b.z) > 5) bad.push('it should use the nearest bin: ' + JSON.stringify(sp));
      if (!K.toasts.some((t) => /Haul Truck: Depot A is farther than a charge can take it, so it uses Auto/.test(t))) bad.push('no message: ' + K.toasts);
      if (tk.dest !== far.id) bad.push('the assignment must stay');
    } finally { HAUL.BATT.base = base0; }
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.machine.a-dark-or-removed-depot-sends-a-truck-to-the-nearest-bin-and-says-so', async () => {
    const bad = [], b = K.bin(), d = K.beacon(b.x + 45, b.z + 80); K.run(0.2); const { tk } = K.site(); g.setCfg(tk, { dest: d.id }); K.off.add(d.id); K.run(0.2);
    if (!K.until(() => tk.job, 20)) return 'the truck never took the job';
    const sp = sinkPt(tk); if (!sp || Math.hypot(sp.x - b.x, sp.z - b.z) > 5) bad.push('a dark depot: the sink should be the SORT bin ' + JSON.stringify(sp));
    if (!K.toasts.some((t) => /Haul Truck: Depot A has no power, so it uses Auto/.test(t))) bad.push('no dark message: ' + K.toasts);
    if (tk.dest !== d.id) bad.push('assignment dropped while only dark');
    K.gone(d); K.toasts.length = 0; tk.state = 'idle'; tk.job = 0; tk.route = []; K.run(2.5);
    if (tk.dest) bad.push('gone: the assignment must be cleared, dest ' + tk.dest);
    if (!K.toasts.some((t) => /Haul Truck: the bin it was assigned to is gone/.test(t))) bad.push('no gone message: ' + K.toasts);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.machine.a-bulldozer-chute-sells-at-its-own-bin-for-the-chute-price', async () => {
    const bad = [], b = K.bin(), d = K.beacon(b.x + 5, b.z + 14); K.run(0.2); const dz = K.mkEarth('dozer', toI(-2), toK(2)); g.setCfg(dz, { dest: d.id });
    dz.hop = [3, 0, 3, 0, 3, 0, 3, 0]; dz.hn = 4; const m0 = K.money(); K.run(1.5);
    if (dz.hop.length) bad.push('the chute did not sell: ' + dz.hop.length);
    if (sold(d.id).n !== 4 || sold(BINS.HALL).n !== 0) bad.push(`tally depot ${sold(d.id).n} bin ${sold(BINS.HALL).n}`);
    const paid = K.money() - m0; if (!(paid > 0) || paid > 4 * val(3)) bad.push('chute price ' + paid + ' vs ' + 4 * val(3));
    // a dozer on Auto credits the nearest bin
    g.setCfg(dz, { dest: 0 }); dz.hop = [3, 0, 3, 0]; dz.hn = 2; K.run(1.5); if (sold(BINS.HALL).n !== 2 || sold(d.id).n !== 4) bad.push(`Auto should credit the nearest bin (the SORT bin here): bin ${sold(BINS.HALL).n} depot ${sold(d.id).n}`);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.machine.a-borer-and-a-claw-rig-sell-at-their-bin-and-send-the-plush-flying-there', async () => {
    const bad = [], b = K.bin(), d = K.beacon(-2, 9); K.run(0.2);
    const bo = K.mach('borer', -4, 6, { dx: 1, dz: 0, w: 2, h: 3 }), cl = K.mach('claw', 6, 10);
    for (const [name, ent, fn] of [['borer', bo, () => g.borerEat({ sp: 3, vr: 0 }, 0, 0, 0, bo)], ['claw', cl, () => g.rigPluck({ sp: 3, vr: 0 }, 1, 1, 1, cl)]]) {
      const n0 = g.fliers.length; g.setCfg(ent, { dest: d.id }); const m0 = K.money(); fn();
      if (K.money() - m0 !== val(3)) bad.push(`${name} paid ${K.money() - m0}, worth ${val(3)}`);
      if (sold(d.id).n !== (name === 'borer' ? 1 : 2)) bad.push(`${name} tally depot ${sold(d.id).n}`);
      if (name === 'claw') { const f = g.fliers[g.fliers.length - 1]; if (g.fliers.length <= n0 || Math.hypot(f.to.x - d.x, f.to.z - d.z) > 0.01) bad.push('the claw\'s plush should fly to the depot: ' + (f && [f.to.x, f.to.z])); }
      // Auto is the SORT bin, as before
      g.setCfg(ent, { dest: 0 }); const h0 = sold(BINS.HALL).n; fn(); if (sold(BINS.HALL).n !== h0 + 1) bad.push(name + ' on Auto should credit the SORT bin');
      if (name === 'claw') { const f = g.fliers[g.fliers.length - 1]; if (Math.hypot(f.to.x - b.x, f.to.z - b.z) > 0.01) bad.push('Auto claw plush should fly to the SORT bin'); }
    }
    // dark: back to the SORT bin and it says so
    g.setCfg(bo, { dest: d.id }); K.off.add(d.id); K.run(0.2); const h1 = sold(BINS.HALL).n; g.borerEat({ sp: 3, vr: 0 }, 0, 0, 0, bo);
    if (sold(BINS.HALL).n !== h1 + 1 || !K.toasts.some((t) => /Tunnel Borer: Depot A has no power/.test(t))) bad.push('dark depot: ' + sold(BINS.HALL).n + ' ' + K.toasts);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.machine.a-real-claw-rig-at-the-pile-sells-what-it-plucks-at-its-bin', async () => {
    const bad = [], d = K.beacon(-2, 9); let sp; try { sp = spot(12); } catch (e) { return true; }
    K.run(0.2); const cl = K.mach('claw', cellX(sp.i) - 1.2, cellZ(sp.k)); g.setCfg(cl, { dest: d.id });
    K.until(() => sold(d.id).n > 0, 40);
    if (!(sold(d.id).n > 0)) bad.push('the rig plucked nothing in 40 s (or sold it elsewhere: bin ' + sold(BINS.HALL).n + ')'); else if (sold(BINS.HALL).n) bad.push('some went to the SORT bin: ' + sold(BINS.HALL).n);
    void w; void S;
    return bad.length === 0 || bad.join(' || ');
  });
}
