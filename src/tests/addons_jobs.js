// Add-on audit, part 3: every placed item does its job. Each test builds the thing through the real placement path
// (K.put aims, plans and places) and then runs the game loop to see the effect, with an unpowered or unplaced control where that matters.
import { makeKit, ALL_UP, FRAME_KEYS } from './addons_lib.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, V3, fresh, adv, plan, tiles, FRAME_TYPES, spot, dig, cellX, cellY, cellZ, toI, toJ, toK, species, NEEDLE, aimPoint } = ctx;
  const K = makeKit(ctx);
  const SP = (r) => Math.max(2, species.findIndex((s) => s && s.rarity === r && !s.volatile));
  const sup = (id) => w().supports.find((s) => s.id === id);
  const put = (id, x, z, dir = 0, o = {}) => K.put(id, { x, z, dir, ...o });
  const mk = (type, i, j, k, extra = {}) => { const e = { id: g.nextId(), type, i, j, k, dir: 0, rise: 0, ...extra }; if (type === 'belt') e.items = []; S().entities.push(e); g.addEntity(e); return e; };
  const grid = async (rows) => { for (const [id, x, z, d, o] of rows) { const r = await put(id, x, z, d, o); if (!r.ok) return `${id} at ${x},${z}: ${r.why}`; } return null; };
  const get = (e) => L().byId.get(e.id);
  const belts = () => tiles().filter((t) => t.type === 'belt' && !t.free).sort((a, b) => a.i - b.i || a.k - b.k);
  const lane = async () => { await ctx.newWorld(); fresh(ALL_UP); return K.lane(64, 8, 4); };

  // ------------------------------------------------------------------ generator, pole, belt, vault, ramp on the real grid
  const buildLine = async (z, withRamp = false) => {
    const rows = [['gen', -9.6, z - 2.4, 0], ['pole', -9.0, z - 1.2, 0]];
    for (let n = 0; n < 4; n++) rows.push(['belt', -8.4 + n * 0.6, z, 0]);
    if (!withRamp) rows.push(['vault', -6.0, z, 0]); else rows.push(['ramp', -6.0, z, 0, { ramp: 0 }]);
    const err = await grid(rows); if (err) return err;
    const gen = tiles().find((t) => t.type === 'gen'), pole = tiles().find((t) => t.type === 'pole');
    const bs = belts().filter((t) => t.k === toK(z)); K.wire(gen, pole); K.wire(pole, bs[0]);   // generator to pole, pole to the belt line (one cable on any tile powers the whole line)
    return { gen, pole, bs, vault: tiles().find((t) => t.type === 'vault'), ramp: tiles().find((t) => t.type === 'belt' && t.rise) };
  };
  await T('addons.job.generator-burns-fuel-and-powers-pole-belt-and-vault-line', async () => {
    fresh(ALL_UP); const rig = await buildLine(2.4); if (typeof rig === 'string') return rig; const { gen, pole, bs, vault } = rig; const bad = [];
    const first = bs[0]; const feed = () => { for (let q = 0; q < 5; q++) first.items.push({ sp: 3 + q, vr: 0, t: 0.02 + q * 0.3 }); };
    // control: no fuel, no power (belts only hand-crank at a crawl)
    feed(); adv(12); if ((first.pw || 0) > 0.05 || (pole.pw || 0) > 0.05) bad.push(`powered without fuel: belt ${first.pw}, pole ${pole.pw}`);
    // fuel it by hand with plush (E on the generator)
    S().carry = []; for (let q = 0; q < 12; q++) S().carry.push({ sp: 2, vr: 0 }); g.useTile(gen); if (gen.q.length === 0 || S().carry.length === 12) bad.push('generator took no fuel'); const fuel0 = gen.q.length + (gen.burn > 0 ? 1 : 0);
    adv(30); if (!(gen.burn > 0 || gen.q.length < fuel0)) bad.push('generator does not burn'); if (gen.q.length >= fuel0 && gen.burn <= 0) bad.push('fuel not consumed');
    if (!(pole.pw > 0.5) || !(first.pw > 0.5)) bad.push(`pole ${pole.pw} / belt ${first.pw} not powered`);
    if (vault.stored.length !== 5) bad.push('vault holds ' + vault.stored.length + ' of 5');
    // out of fuel: power drops again
    gen.q.length = 0; gen.burn = 0; g.power.markDirty(); adv(2); if ((first.pw || 0) > 0.05) bad.push('belt still powered with the generator out of fuel');
    return bad.length ? bad.join('; ') : true;
  });
  await T('addons.job.pole-carries-the-generators-power-to-a-belt-by-cable', async () => {
    fresh(ALL_UP); const bad = []; const err = await grid([['gen', -11, -1.2, 0], ['belt', -1.2, 6, 0]]); if (err) return err;
    const gen = tiles().find((t) => t.type === 'gen'), belt = belts()[0]; K.feedGen(gen, 12); adv(2);
    if ((belt.pw || 0) > 0.05) bad.push('belt 12 m from the generator is powered without a cable');
    const r = await put('pole', -6, 2.4, 0); if (!r.ok) return 'pole ' + r.why; adv(2);
    const pole = K.tileOf(r.ent); if ((belt.pw || 0) > 0.05 || (pole.pw || 0) > 0.05) bad.push('a pole standing between them carries power with no cable'); K.wire(gen, pole); K.wire(pole, belt); adv(2); if (!(belt.pw > 0.5) || !(pole.pw > 0.5)) bad.push(`pole did not carry the power: belt ${belt.pw} pole ${pole.pw}`);
    g.doDecon({ kind: 'tile', id: pole.id }); adv(2); if ((belt.pw || 0) > 0.05) bad.push('belt still powered after the pole was hammered'); if (S().cables.length) bad.push('the hammered pole left cables behind');
    return bad.length ? bad.join('; ') : true;
  });
  await T('addons.job.ramp-lifts-plush-up-one-step-and-down-ramp-drops', async () => {
    fresh(ALL_UP); const rig = await buildLine(2.4, true); if (typeof rig === 'string') return rig; const { gen, bs, ramp } = rig; const bad = [];
    if (!ramp || ramp.rise !== 1) return 'no up ramp'; const top = mk('vault', ramp.i + 1, ramp.j + 1, ramp.k, { dir: 0 }); K.feedGen(gen, 12);
    for (let q = 0; q < 4; q++) bs[0].items.push({ sp: 3 + q, vr: 0, t: 0.02 + q * 0.3 }); adv(30);
    if (get(top).stored.length !== 4) bad.push('vault one step up got ' + get(top).stored.length + ' of 4');
    // a down ramp
    const r2 = await put('ramp', -6.0, 6, 0, { ramp: 1 }); if (!r2.ok) return 'down ramp ' + r2.why; if (r2.ent.rise !== -1) bad.push('R-flipped ramp is not a down ramp');
    return bad.length ? bad.join('; ') : true;
  });

  // ------------------------------------------------------------------ sorting box
  await T('addons.job.sorter-sells-below-its-filter-and-passes-the-rest-to-the-vault', async () => {
    fresh({ ...ALL_UP, optics: 3 }); const bad = [];
    const err = await grid([['gen', -9.6, -1.2, 0], ['pole', -9.0, -0.6, 0], ['sorter', -8.4, 0, 0], ['vault', -7.8, 0, 0]]); if (err) return err;
    const gen = tiles().find((t) => t.type === 'gen'), so = tiles().find((t) => t.type === 'sorter'), vault = tiles().find((t) => t.type === 'vault'); K.wire(gen, tiles().find((t) => t.type === 'pole')); K.wire(tiles().find((t) => t.type === 'pole'), so); K.feedGen(gen, 30);
    const push = (sp, n) => { for (let q = 0; q < n; q++) L().accept(so, { sp, vr: 0 }, null); };
    // mode 0: sells everything
    let m0 = S().money; for (let n = 0; n < 4; n++) { push(SP(0), 2); adv(3); } if (!(S().money > m0) || vault.stored.length) bad.push(`sell-all: money +${S().money - m0}, vault ${vault.stored.length}`);
    // keep rare+ (E on the box cycles the filter): commons sold, a rare passes on to the vault
    g.useTile(so); g.useTile(so); if (so.filter !== 2) bad.push('E did not cycle to Keep Rare+: filter ' + so.filter);
    m0 = S().money; push(SP(0), 1); push(SP(3), 1); adv(8); if (vault.stored.length !== 1 || species[vault.stored[0].sp].rarity < 2) bad.push('rare+ not passed: vault ' + vault.stored.length); if (!(S().money > m0)) bad.push('common not sold under Keep Rare+');
    // pass everything
    so.filter = 0; so.mode = 5; const v0 = vault.stored.length; m0 = S().money; push(SP(0), 2); adv(8); if (vault.stored.length !== v0 + 2 || S().money !== m0) bad.push('pass-all mode sold or lost plush');
    // sorter also sucks in what you carry when you stand near
    return bad.length ? bad.join('; ') : true;
  });
  await T('addons.job.sorter-takes-nothing-without-power', async () => {
    fresh(ALL_UP); const err = await grid([['sorter', -8.4, 0, 0], ['vault', -7.8, 0, 0]]); if (err) return err; const so = tiles().find((t) => t.type === 'sorter'); L().accept(so, { sp: SP(0), vr: 0 }, null); const m0 = S().money; adv(10);
    return (S().money === m0 && so.q.length === 1) || `unpowered sorter sold (${S().money - m0}) or lost the plush (${so.q.length})`;
  });

  // ------------------------------------------------------------------ detector gate
  await T('addons.job.gate-scans-passing-plush-and-halts-the-line-on-the-one', async () => {
    fresh(ALL_UP); const bad = [];
    const err = await grid([['gen', -10.8, 5.4, 0], ['pole', -10.2, 6.0, 0], ...[0, 1, 2, 3, 4, 5].map((n) => ['belt', -9.6 + n * 0.6, 7.2, 0])]); if (err) return err;
    const gen = tiles().find((t) => t.type === 'gen'); K.feedGen(gen, 30); const bs = belts().filter((t) => t.k === toK(7.2));
    // convert the third belt into a gate with the real tool
    g.craftItem('gate', 1); K.equip('gate'); K.aimDir(cellX(bs[2].i), 0.1, cellZ(bs[2].k), 1, 1.6); const pl = await plan(); if (!pl.ok || pl.ent.id !== bs[2].id) return 'gate plan: ' + pl.why + ' ' + JSON.stringify(pl.ent && [pl.ent.type, pl.ent.id === bs[2].id]); g.placeCurrent(g.curTool()); const gate = get(bs[2]); if (!gate.detector) return 'not a gate';
    const s0 = S().stats.scans || 0; for (let q = 0; q < 4; q++) bs[0].items.push({ sp: 3 + q, vr: 0, t: 0.02 + q * 0.3 }); adv(25);
    if ((S().stats.scans || 0) - s0 < 4) bad.push('gate scanned ' + ((S().stats.scans || 0) - s0) + ' of 4'); if (gate.alarm) bad.push('alarm on ordinary plush');
    bs[0].items.push({ sp: NEEDLE, vr: 0, t: 0.1 }); adv(25);
    if (!gate.alarm || !gate.held) bad.push('no alarm / nothing held for the One'); if (!bs.every((t) => t.halt)) bad.push('line not halted');
    const wasEnd = S().ending; S().ending = wasEnd; return bad.length ? bad.join('; ') : true;
  });
  await T('addons.job.walking-through-a-placed-gate-scans-your-bag', async () => {
    fresh(ALL_UP); const r = await put('gate', -8.4, 7.2, 1); if (!r.ok) return r.why; const gate = K.tileOf(r.ent); const bad = [];
    S().carry = [{ sp: 3, vr: 0 }, { sp: 4, vr: 0 }]; const s0 = S().stats.scans || 0; p().pos.set(cellX(gate.i), 0, cellZ(gate.k) - 1.5); p().vel.set(0, 0, 0); g._gateCd = 0; gate._pIn = false;
    g.playerGateScan(0.1); p().pos.set(cellX(gate.i), 0, cellZ(gate.k)); g._gateCd = 0; g.playerGateScan(0.1);
    if ((S().stats.scans || 0) - s0 !== 2) bad.push('bag not scanned: ' + ((S().stats.scans || 0) - s0));
    return bad.length ? bad.join('; ') : true;
  });

  // ------------------------------------------------------------------ splitter
  await T('addons.job.splitter-deals-forward-left-right-and-skips-missing-outputs', async () => {
    fresh(ALL_UP); const bad = [];
    const err = await grid([['gen', -10.8, 2.4, 0], ['pole', -10.2, 3.0, 0], ['splitter', -8.4, 4.8, 0], ['belt', -9.0, 4.8, 0], ['belt', -9.6, 4.8, 0]]); if (err) return err;
    const gen = tiles().find((t) => t.type === 'gen'); K.feedGen(gen, 40); const sp = tiles().find((t) => t.splitter); const b0 = belts().find((t) => !t.splitter && t.k === sp.k);
    const mkV = (di, dk) => mk('vault', sp.i + di, 0, sp.k + dk); const fwd = mkV(1, 0), left = mkV(0, 1), right = mkV(0, -1); let fed = 0;
    for (let n = 0; n < 1500; n++) { K.powerAll(); if (n % 8 === 0 && fed < 24 && b0.items.length < 3) { b0.items.push({ sp: 3 + (fed % 7), vr: 0, t: 0 }); fed++; } g.time += 0.05; L().update(0.05); }
    const c = [fwd, left, right].map((v) => get(v).stored.length); if (c[0] + c[1] + c[2] !== fed || Math.max(...c) - Math.min(...c) > 2 || fed < 20) bad.push(`dealt ${c} of ${fed}; belt0 items ${b0.items.length} t ${b0.items.map((q) => q.t.toFixed(2))} pw ${b0.pw} halt ${b0.halt} next ${L().nextOf(b0) && L().nextOf(b0).type}; splitter at ${sp.i},${sp.k} dir ${sp.dir} outs ${L().splitOuts(sp).length}; tiles ${tiles().map((t) => t.type + (t.splitter ? 'S' : '') + ':' + t.i + ',' + t.k).join(' ')}`);
    L().remove(get(right)); S().entities = S().entities.filter((e) => e.id !== right.id); const before = c.slice(); let fed2 = 0;
    for (let n = 0; n < 1200; n++) { K.powerAll(); if (n % 8 === 0 && fed2 < 16 && b0.items.length < 3) { b0.items.push({ sp: 3, vr: 0, t: 0 }); fed2++; } g.time += 0.05; L().update(0.05); }
    const d = [fwd, left].map((v, q) => get(v).stored.length - before[q]); if (d[0] + d[1] !== fed2) bad.push(`with the right output gone: ${d} of ${fed2}`);
    return bad.length ? bad.join('; ') : true;
  });

  // ------------------------------------------------------------------ fans
  await T('addons.job.vent-fan-clears-dust-only-when-powered', async () => {
    const sp = await lane(); if (!sp) return 'no lane'; const { i, k } = sp, bad = []; const z = cellZ(k + 1), x = (n) => cellX(i + n);
    const err = await grid([['fan', x(12), z, 0]]); if (err) return err; const fan = tiles().find((t) => t.type === 'fan');
    const dustAfter = (secs) => { g.dust.cells.clear(); g.dust.add(x(12), 1.0, z, 1.5); const d0 = g.dust.at(x(12), 1.0, z); adv(secs); return [d0, g.dust.at(x(12), 1.0, z)]; };
    const off = dustAfter(6); if ((fan.pw || 0) > 0.05) bad.push('unpowered fan reports power ' + fan.pw);
    const err2 = await grid([['gen', x(6), z, 0], ['pole', x(8), z, 0]]); if (err2) return err2; K.feedGen(tiles().find((t) => t.type === 'gen'), 20);
    { const gT = tiles().find((t) => t.type === 'gen'), pT = tiles().find((t) => t.type === 'pole'); if ((fan.pw || 0) > 0.05) bad.push('the fan runs beside a live pole with no cable'); K.wire(gT, pT); K.wire(pT, fan); }
    const on = dustAfter(6); if (!(fan.pw > 0.5 && on[1] < on[0] * 0.3 && on[1] < off[1] * 0.5)) bad.push(`powered fan: pw ${fan.pw} dust ${on[0].toFixed(2)} -> ${on[1].toFixed(2)} (unpowered ${off[0].toFixed(2)} -> ${off[1].toFixed(2)})`);
    return bad.length ? bad.join('; ') : true;
  });
  await T('addons.job.support-fan-clears-the-tunnel-ahead-only-when-powered', async () => {
    const sp = await lane(); if (!sp) return 'no lane'; const { i, k } = sp, bad = []; g.craftItem('frame:timber', 1); g.craftItem('mfan', 1);
    K.equip('frame:timber'); aimPoint(cellX(i + 24), 0, cellZ(k + 1), 2.4); let pl = await plan(); if (!pl.ok) return 'frame ' + pl.why; g.placeCurrent(g.curTool()); const f = S().entities[S().entities.length - 1];
    K.equip('mfan'); p().pos.set(cellX(i + 20), 0, f.cz); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; { const e = p().eyePos(new V3()); p().pitch = Math.atan2(f.y0 + f.h - 0.3 - e.y, f.cx - e.x); } pl = await plan(); if (!pl.ok) return 'fan ' + pl.why; g.placeCurrent(g.curTool());
    const t = tiles().find((q) => q.mounted); if (!t) return 'no fan tile';
    const run = (pw) => { g.dust.cells.clear(); g.dust.add(f.cx + 9, 1.2, f.cz, 1.0); g.dust.add(f.cx - 9, 1.2, f.cz, 1.0); for (let n = 0; n < 12; n++) { g.dust.t = 0; t.pw = pw; g.dust.update(0.5); } return [g.dust.at(f.cx + 9, 1.2, f.cz), g.dust.at(f.cx - 9, 1.2, f.cz)]; };
    const off = run(0), on = run(1); if (!(off[0] > 0.25)) bad.push('dust vanished without power: ' + off[0].toFixed(2)); if (!(on[0] < off[0] * 0.3)) bad.push(`powered fan did not clear the tunnel ahead: ${on[0].toFixed(2)} vs ${off[0].toFixed(2)}`); if (!(on[0] < on[1] * 0.6)) bad.push(`ahead ${on[0].toFixed(2)} not clearer than behind ${on[1].toFixed(2)}`);
    // real grid: a generator, a pole and two cables power it for real
    g.craftItem('gen', 1); g.craftItem('pole', 1); K.equip('gen'); K.aimDir(cellX(i + 16), 0, cellZ(k + 1), 0, 2); pl = await plan(); if (pl.ok) { g.placeCurrent(g.curTool()); K.equip('pole'); K.aimDir(cellX(i + 18), 0, cellZ(k + 1), 0, 2); pl = await plan(); if (pl.ok) g.placeCurrent(g.curTool()); K.feedGen(tiles().find((q) => q.type === 'gen'), 12); { const gT = tiles().find((q) => q.type === 'gen'), pT = tiles().find((q) => q.type === 'pole'); if (gT && pT) { K.wire(gT, pT); K.wire(pT, t); } } adv(3); if (!(t.pw > 0.5)) bad.push('support fan not powered by a real generator and pole: pw ' + t.pw); } else bad.push('could not place generator in the tunnel: ' + pl.why);
    return bad.length ? bad.join('; ') : true;
  });

  // ------------------------------------------------------------------ light and markers
  await T('addons.job.lantern-flare-glow-light-the-nearest-spots-and-burn-out-on-time', async () => {
    fresh(ALL_UP); const err = await grid([['lantern', -8, 1.2, 0], ['flare', -8, 2.4, 0], ['glow', -8, 3.6, 0]]); if (err) return err; const bad = [];
    const near = g.machines.lights(new V3(-8, 1, 2.4), 6); const types = near.map((e) => e.type + (e.glow ? ':glow' : '')).sort().join(); if (types !== 'flare,flare:glow,lantern') bad.push('lights near them: ' + types);
    if (g.machines.lights(new V3(60, 1, 60), 6).length) bad.push('lights offered from 80 m away');
    const l = S().entities.find((e) => e.type === 'lantern'), fl = S().entities.find((e) => e.type === 'flare' && !e.glow), gl = S().entities.find((e) => e.glow);
    S().stats.playSecs = fl.born + 241; adv(0.2); if (g.machines.items.has(fl.id) || S().entities.some((e) => e.id === fl.id)) bad.push('flare did not burn out after 4 minutes'); if (!g.machines.items.has(gl.id)) bad.push('glow stick died before 10 minutes');
    S().stats.playSecs = gl.born + 601; adv(0.2); if (g.machines.items.has(gl.id)) bad.push('glow stick outlived 10 minutes'); if (!g.machines.items.has(l.id)) bad.push('lantern burned out (should last for good)');
    return bad.length ? bad.join('; ') : true;
  });
  await T('addons.job.marker-shows-on-the-compass', async () => {
    fresh({ ...ALL_UP, compass: 1 }); const r = await put('marker', -6, 3, 0); if (!r.ok) return r.why; const seen = []; const orig = g.ui.setCompass; g.ui.setCompass = (on, hd, ms, ro) => { seen.push(ms); }; g.hudT = 0; p().pos.set(-6, 0, -3); p().yaw = 0; adv(0.3); g.ui.setCompass = orig;
    const ms = seen.flat().filter((m) => m && m.label === 'M'); return ms.length >= 1 || 'no marker on the compass strip (' + seen.length + ' updates)';
  });

  // ------------------------------------------------------------------ props and frames hold the roof
  await T('addons.job.struts-jacks-and-every-frame-tier-anchor-the-roof-with-their-reach', async () => {
    const sp = await lane(); if (!sp) return 'no lane'; const { i, k } = sp, bad = []; S().money = 1e13;
    const cases = [...FRAME_KEYS.map((q) => ['frame:' + q, FRAME_TYPES[q].radius, FRAME_TYPES[q].bonus]), ['strut', 1.9, 1], ['jack', 2.7, 2]];
    for (const [n, [id, r, b]] of cases.entries()) {
      const x = cellX(i + 3 + n * 5), z = cellZ(k + 1); g.craftItem(id, 1); K.equip(id); g.frameYaw = null; aimPoint(x, 0, z, 2.4); const pl = await plan(); if (!pl.ok) { bad.push(id + ' ' + pl.why); continue; } g.placeCurrent(g.curTool());
      const e = S().entities[S().entities.length - 1]; const s = sup(e.id); if (!s) { bad.push(id + ' no support'); continue; }
      const bonuses = [w().supportBonus(s.x, s.y, s.z), w().supportBonus(s.x + r * 0.9, s.y, s.z), w().supportBonus(s.x + r + 0.5, s.y, s.z)]; g.doDecon({ kind: 'mach', id: e.id }); if (sup(e.id)) bad.push(id + ' support survived the hammer');
      const [here, inside, outside] = bonuses;
      if (here !== b || inside < b || outside >= b) bad.push(`${id}: bonus here ${here} inside ${inside} outside ${outside} want ${b} reach ${r}`);
    }
    // the roof above a long dug tunnel gets safer next to a prop
    const j = 4, a = { i: i + 40, k: k + 1 }; const m0 = w().stress(a.i, j, a.k);
    g.craftItem('jack', 1); K.equip('jack'); aimPoint(cellX(a.i), 0, cellZ(a.k), 2.4); const pl2 = await plan(); if (pl2.ok) { g.placeCurrent(g.curTool()); const m1 = w().stress(a.i, j, a.k); if (m0 && m1 && !(m1.margin > m0.margin)) bad.push(`roof margin ${m0.margin} -> ${m1.margin} did not improve next to a jack`); }
    return bad.length ? bad.slice(0, 6).join('; ') : true;
  });

  // ------------------------------------------------------------------ blasting
  const block = (i0, k0, n = 20, h = 12) => { for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let j = 0; j < h; j++) w().setCell(i0 + a, j, k0 + b, 2, 0); };
  const countIn = (ci, cj, ck, R) => { let n = 0; const RI = Math.ceil(R); for (let dk = -RI; dk <= RI; dk++) for (let dj = -RI; dj <= RI; dj++) for (let di = -RI; di <= RI; di++) if (di * di + dj * dj + dk * dk <= R * R && w().get(ci + di, cj + dj, ck + dk)) n++; return n; };
  await T('addons.job.dynamite-and-three-charge-tiers-blow-bigger-holes-after-their-fuse', async () => {
    const removed = {}; const bad = [];
    for (const [label, id, tier] of [['dyn', 'dynamite', 0], ['c1', 'charge', 1], ['c2', 'charge', 2], ['c3', 'charge', 3]]) {
      fresh({ ...ALL_UP, charges: tier || 1 }); S().money = 1e12; const i0 = toI(-6), k0 = toK(-1); block(i0, k0, 20, 12);
      // stand in the open west of the block, aim at its face, plant the charge on the floor against it
      g.craftItem(id, 1); K.equip(id); const fx = cellX(i0) - 0.3; K.aimDir(fx, 0, cellZ(k0 + 8), 0, 2.2); const pl = await plan(); if (!pl.ok) { bad.push(label + ' ' + pl.why); continue; }
      g.placeCurrent(g.curTool()); const e = S().entities[S().entities.length - 1]; if (e.type !== 'charge' || (id === 'charge' && e.tier !== tier) || (id === 'dynamite' && !e.dyn)) { bad.push(label + ' entity ' + JSON.stringify(e)); continue; }
      const R = e.dyn ? 2.2 : [0, 3, 4, 5][e.tier], ci = toI(e.x), cj = toJ(e.y + 0.3), ck = toK(e.z); const before = countIn(ci, cj, ck, R);
      p().pos.set(-12, 0, 8); p().vel.set(0, 0, 0); g.hp = g.hpMax;
      // before the fuse runs out nothing happens
      adv((e.fuse) - 0.6); if (countIn(ci, cj, ck, R) !== before) bad.push(label + ' blew early'); if (!g.machines.items.has(e.id)) bad.push(label + ' gone before the fuse');
      adv(1.2); const after = countIn(ci, cj, ck, R); removed[label] = before - after;
      if (g.machines.items.has(e.id) || S().entities.some((x) => x.id === e.id)) bad.push(label + ' still there after blowing');
      if (!(removed[label] >= before * 0.6)) bad.push(`${label}: removed ${removed[label]} of ${before} inside ${R} cells`);
      let far = 0; for (let dk = -R - 8; dk <= R + 8; dk++) if (w().get(ci - 0, cj, ck + dk) && Math.abs(dk) > R + 5) far++; void far;
    }
    if (!(removed.dyn < removed.c1 && removed.c1 < removed.c2 && removed.c2 < removed.c3)) bad.push('holes do not grow with the tier: ' + JSON.stringify(removed));
    return bad.length ? bad.join('; ') : true;
  });

  // ------------------------------------------------------------------ machines that dig or pluck: with and without power
  const pileRun = async (up, place, run) => {
    await ctx.newWorld(); fresh(up); S().money = 1e12; const sp = spot(); let tx = 0; for (let d = 1; d < 60; d++) if (w().topAt(sp.i + d, sp.k) >= 6) { tx = sp.i + d; break; } if (!tx) return 'no steep face';
    return place(sp, tx, run);
  };
  await T('addons.job.claw-rig-plucks-and-sells-with-power-and-idles-without', async () => {
    const out = {};
    for (const powered of [false, true]) {
      const r = await pileRun(ALL_UP, async (sp, tx) => {
        g.craftItem('claw', 1); K.equip('claw'); let so = tx - 1; while (so > sp.i - 8 && w().topAt(so, sp.k) > 0) so--;
        p().pos.set(cellX(so), 0, cellZ(sp.k)); p().vel.set(0, 0, 0); { const e = p().eyePos(new V3()); p().yaw = Math.atan2(cellX(tx) - e.x, 0); p().pitch = Math.atan2(1.2 - e.y, cellX(tx) - e.x); }
        const pl = await plan(); if (!pl.ok) return 'claw plan: ' + pl.why; g.placeCurrent(g.curTool()); const m0 = S().money, c0 = S().stats.cells || 0;
        for (let n = 0; n < 1800; n++) { if (powered) for (const it of g.machines.items.values()) it.ent.pw = 1; g.time += 0.05; g.machines.update(0.05, g.time); }
        out[powered] = [S().money - m0, (S().stats.cells || 0) - c0]; return null;
      }); if (typeof r === 'string') return r;
    }
    return (out.true[0] > 0 && out.true[1] > 15 && out.false[0] === 0 && out.false[1] === 0) || `claw powered ${out.true} unpowered ${out.false}`;
  });
  await T('addons.job.mech-scooper-digs-and-feeds-the-belt-with-power-and-idles-without', async () => {
    const out = {};
    for (const powered of [false, true]) {
      let pl, kk, i0; for (const ln of [-6, 12, 20, 28, 6, 34]) {
        await ctx.newWorld(); fresh({ ...ALL_UP, mechLayer: 1, mechBolt: 1 }); S().money = 1e12; let sp0; try { sp0 = spot(ln); } catch (e) { continue; } kk = sp0.k; i0 = sp0.i; for (let q = 0; q < 60 && w().topAt(i0 + 8, kk) < 6; q++) i0++;
        g.craftItem('mech', 1); K.equip('mech'); K.aimDir(cellX(i0 - 1), 0, cellZ(kk), 0, 2); pl = await plan(); if (pl.ok) break;
      }
      if (!pl || !pl.ok) return 'mech: ' + (pl && pl.why); g.placeCurrent(g.curTool()); const mech = S().entities[S().entities.length - 1]; if (mech.dir !== 0) return 'mech dir ' + mech.dir;
      for (let n = 1; n <= 4; n++) mk('belt', mech.i - n, mech.j, kk, { dir: 2 }); const vault = mk('vault', mech.i - 5, mech.j, kk, { dir: 2 }); const c0 = S().stats.cells || 0;
      for (let n = 0; n < 5200; n++) { if (powered) K.powerAll(); g.time += 0.05; L().update(0.05); }
      out[powered] = [(S().stats.cells || 0) - c0, get(vault).stored.length, `mech ${mech.i},${mech.k} dir ${mech.dir} buf ${mech.buf.length} state ${mech.state} belts ${tiles().filter((t) => t.type === 'belt').map((t) => t.i + ':' + t.k + ':' + t.items.length).join()} vault ${vault.i},${vault.k}`];
    }
    return (out.true[0] > 30 && out.true[1] > 25 && out.false[0] === 0 && out.false[1] === 0) || `mech powered ${out.true} unpowered ${out.false}`;
  });
  await T('addons.job.tunnel-borer-bores-a-lined-tunnel-with-power-and-idles-without', async () => {
    const out = {};
    for (const powered of [false, true]) {
      const r = await pileRun({ ...ALL_UP, borerSize: 2 }, async (sp) => {
        g.craftItem('borer', 1); K.equip('borer'); let placed = false; search: for (const di of [1, 0, 2, 3, 4]) for (const back of [1.5, 2.0, 2.5]) for (const pitch of [0, -0.1, -0.2]) { ctx.lookEast(cellX(sp.i + di) - back, cellZ(sp.k), pitch); const pl = await plan(); if (pl && pl.ok) { g.placeCurrent(g.curTool()); placed = true; break search; } } if (!placed) return 'borer not placed';
        const bor = [...g.machines.items.values()].find((x) => x.ent.type === 'borer'); const c0 = S().stats.cells || 0;
        for (let n = 0; n < 2400; n++) { if (powered) for (const it of g.machines.items.values()) it.ent.pw = 1; g.time += 0.05; g.machines.update(0.05, g.time); }
        out[powered] = [(S().stats.cells || 0) - c0, bor.ent.w, bor.ent.h, S().entities.filter((e) => e.type === 'frame').length]; return null;
      }); if (typeof r === 'string') return r;
    }
    return (out.true[0] > 20 && out.false[0] === 0) || `borer powered ${out.true} unpowered ${out.false}`;
  });
  await T('addons.job.depot-beacon-sells-what-you-carry-and-opens-travel', async () => {
    fresh(ALL_UP); const r = await put('beacon', -2.4, 8, 0); if (!r.ok) return r.why; const bc = K.itemOf(r.ent), bad = []; S().carry = []; for (let q = 0; q < 4; q++) S().carry.push({ sp: 2, vr: 0 });
    p().pos.set(bc.ent.x + 2, 0, bc.ent.z); const m0 = S().money; for (let n = 0; n < 80; n++) g.autoDump(0.1); if (S().carry.length || S().money <= m0) bad.push('beacon did not take and sell the carried plush');
    p().pos.set(bc.ent.x + 1.2, 0, bc.ent.z); p().yaw = Math.atan2(bc.ent.x - p().pos.x, bc.ent.z - p().pos.z); p().pitch = -0.2; adv(0.2); g.useKey(); if (g.ui.openModal !== 'travel') bad.push('E on the beacon did not open the travel menu'); g.ui.closeModals();
    return bad.length ? bad.join('; ') : true;
  });

  // ------------------------------------------------------------------ carried supplies
  await T('addons.job.cart-carries-plush-up-to-its-capacity', async () => {
    fresh(ALL_UP); g.craftItem('cart:1', 1); K.equip('cart:1'); g.useTool(g.curTool()); const bad = []; if (!S().cart) return 'cart did not roll out'; const cap = ctx.CART_CAP[1];
    S().carry = []; while (S().carry.length < g.T.carry) S().carry.push({ sp: 2, vr: 0 }); if (!g.storeRoom()) bad.push('full hands but a cart next to you and no room');
    S().cart.x = p().pos.x + 1; S().cart.z = p().pos.z; for (let q = 0; q < cap + 6; q++) { if (g.storeRoom()) S().cart.load.push({ sp: 2, vr: 0 }); } if (S().cart.load.length !== cap) bad.push('cart holds ' + S().cart.load.length + ' not ' + cap); if (g.storeRoom()) bad.push('storeRoom true with everything full');
    return bad.length ? bad.join('; ') : true;
  });
  await T('addons.job.medkit-heals-fifty-and-canister-saves-you-from-suffocating', async () => {
    fresh(ALL_UP); g.craftItem('medkit', 1); g.craftItem('canister', 1); const bad = []; g.hp = 20; g.useMedkit(); if (g.hp !== 70 || S().items.medkit) bad.push(`medkit: hp ${g.hp} left ${S().items.medkit}`);
    p().embedded = true; p().buried = 3; g.trapOn = true; g.airLeft = 0.05; g.updateTrapped(0.1); g.updateTrapped(0.1); p().embedded = false; p().buried = 0; if (!(g.airLeft > 39 && !S().items.canister)) bad.push('canister: air ' + g.airLeft + ' left ' + S().items.canister);
    return bad.length ? bad.join('; ') : true;
  });
}
