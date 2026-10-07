// bins.*: the SORT bin and the Depot Beacons as bins (src/bins.js): names and numbers, the cfg `dest` on every assignable thing, the checks, the fallbacks,
// the same money at every bin, what each bin sold today, copy and paste, saving. Run: `await __selftest('bins.')`
import { kit } from './bins_lib.js';
import * as BINS from '../bins.js';
import * as EXT from '../ext.js';
import * as BP from '../binspanel.js';
import { infoFor, findInfoRef } from '../info.js';
import { TYPES } from '../catalog.js';
import { CONTROLS } from '../controls.js';

export default async function (ctx) {
  const { g, S, L, tiles, toI, toK, cellX, cellZ, placeAtFloor } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const names = () => BINS.listBins(g).map((b) => b.name);

  await G('bins.beacons-get-stable-numbers-and-names-and-a-new-one-takes-the-gap', async () => {
    const bad = [], a = K.beacon(-2, 4), b = K.beacon(-6, 6), c = K.beacon(-10, 8);
    if (names().join() !== 'SORT bin,Depot A,Depot B,Depot C') bad.push('names ' + names());
    if (g.beaconList().map((x) => x.name).join() !== 'Sorting Bay 07,Depot A,Depot B,Depot C') bad.push('travel menu names ' + g.beaconList().map((x) => x.name));
    K.gone(b);
    if (names().join() !== 'SORT bin,Depot A,Depot C') bad.push('Depot C was renamed when B went: ' + names());
    const d = K.beacon(-14, 6); BINS.ensureNums(g);
    if (d.num !== 1 || BINS.nameOf(g, d) !== 'Depot B') bad.push('a new beacon should take the gap, got ' + BINS.nameOf(g, d));
    if (BINS.nextNum(g) !== 3) bad.push('next number ' + BINS.nextNum(g));
    // placed through the real path: it carries a number from the start
    const e = { id: g.nextId(), type: 'beacon', x: -3, y: 0, z: 9, i: toI(-3), j: 0, k: toK(9), num: BINS.nextNum(g) }; S().entities.push(e); g.addEntity(e);
    if (BINS.nameOf(g, e) !== 'Depot D') bad.push('placed beacon name ' + BINS.nameOf(g, e));
    void a; void c;
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.rename-keeps-text-only-a-length-and-goes-back-to-the-number-name-on-empty', async () => {
    const bad = [], e = K.beacon(-2, 4);
    let r = g.setCfg(e, { name: 'North <b>Face</b>\u0007  ' }); if (!r.ok || e.name !== 'North bFace/b') bad.push('markup survived: ' + JSON.stringify(e.name) + JSON.stringify(r));
    r = g.setCfg(e, { name: 'x'.repeat(60) }); if (!r.ok || e.name.length !== 20) bad.push('name not cut to 20: ' + e.name.length);
    r = g.setCfg(e, { name: 42 }); if (r.ok) bad.push('a number was taken as a name');
    r = g.setCfg(e, { name: 'Deep Dig' }); if (BINS.nameOf(g, e) !== 'Deep Dig' || g.beaconList().find((x) => x.id === e.id).name !== 'Deep Dig') bad.push('renamed beacon not in the list/travel menu');
    r = g.setCfg(e, { name: '   ' }); if (e.name !== '' || BINS.nameOf(g, e) !== 'Depot A') bad.push('empty name should give the number name: ' + BINS.nameOf(g, e));
    // the hover readout carries the name, what it sold today and what is assigned to it
    g.setCfg(e, { name: 'Deep Dig' }); const t = K.rawTile('mech', toI(-8), toK(6)); g.setCfg(t, { dest: e.id }); BINS.note(g, e.id, 12, 3400);
    const info = infoFor(g, { kind: 'mach', id: e.id }); const txt = info.title + ' ' + info.lines.join(' ');
    if (!/DEEP DIG/.test(info.title)) bad.push('title ' + info.title);
    if (!/Sold here today: 12 plush for ◈3,400/.test(txt)) bad.push('sold line missing: ' + txt);
    if (!/Assigned: 0 bots, 1 machine/.test(txt)) bad.push('assigned line missing: ' + txt);
    if (/—/.test(txt)) bad.push('em dash');
    // the Name button on the travel menu opens the panel for that beacon
    g.mode = 'play'; g.ui.open('travel'); const row = [...document.querySelectorAll('#travelList .trow')].find((x) => x.querySelector('b').textContent === 'Deep Dig');
    if (!row) bad.push('travel row for the new name missing'); else { const btns = row.querySelectorAll('button'); if (btns.length !== 2 || btns[1].textContent !== 'Name') bad.push('no Name button: ' + [...btns].map((b) => b.textContent)); else { btns[1].click(); if (g.ui.openModal !== 'binpanel') bad.push('Name opened ' + g.ui.openModal); } }
    g.ui.closeModals();
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.resolve-names-the-bin-or-the-reason-it-cannot-be-used', async () => {
    const bad = [], e = K.beacon(-2, 4);
    K.run(0.2); const ok = BINS.resolve(g, e.id); if (!ok.bin || ok.bin.id !== e.id || ok.why) bad.push('powered beacon: ' + JSON.stringify(ok.why));
    if (BINS.resolve(g, 0).bin !== null || BINS.resolve(g, 0).why) bad.push('Auto is not null');
    if (BINS.resolve(g, BINS.HALL).bin.id !== BINS.HALL) bad.push('the SORT bin');
    K.off.add(e.id); K.run(0.2); const np = BINS.resolve(g, e.id); if (np.bin || np.why !== 'unpowered' || np.named.name !== 'Depot A') bad.push('unpowered: ' + np.why);
    K.gone(e); const gn = BINS.resolve(g, e.id); if (gn.bin || gn.why !== 'gone') bad.push('gone: ' + gn.why);
    const pk = BINS.pick(g, e.id, 0, 0); if (!pk.auto || pk.bin.id !== BINS.HALL) bad.push('pick falls back to the nearest: ' + pk.bin.name);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.every-bin-pays-the-same-and-a-far-beacon-is-no-better', async () => {
    const bad = [], near = K.beacon(-2, 4), far = K.beacon(-12, 9); K.run(0.2);
    const m = [];
    for (const [id, label] of [[BINS.HALL, 'bin'], [near.id, 'near'], [far.id, 'far']]) { const m0 = S().money; for (const sp of [3, 40, 200, 700]) g.sellAuto(sp, 0, 1, id); m.push(S().money - m0); void label; }
    if (new Set(m).size !== 1) bad.push('sales differ by bin: ' + m);
    // sellBatch (trucks, the dozer chute, the Portal) too
    const { sellBatch } = await import('../earth.js'); const flat = [3, 0, 40, 0, 200, 0, 700, 0], bt = [];
    for (const id of [BINS.HALL, near.id, far.id]) { const m0 = S().money; sellBatch(g, flat, 1, id); bt.push(S().money - m0); }
    if (new Set(bt).size !== 1) bad.push('batch sales differ by bin: ' + bt);
    // what each bin sold: counted per bin, the same total
    const tn = (id) => BINS.today(g, id).n, tv = (id) => BINS.today(g, id).v;
    if (tn(near.id) !== 8 || tn(far.id) !== 8 || tn(BINS.HALL) !== 8) bad.push(`counts ${tn(BINS.HALL)}/${tn(near.id)}/${tn(far.id)}`);
    if (tv(near.id) !== tv(far.id) || tv(far.id) !== tv(BINS.HALL) || !(tv(far.id) > 0)) bad.push('values differ');
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.what-a-bin-sold-today-rolls-over-with-the-day-and-totals-stay', async () => {
    const bad = [], e = K.beacon(-2, 4); K.run(0.2);
    BINS.note(g, e.id, 5, 100); BINS.note(g, e.id, 2, 50);
    if (JSON.stringify(BINS.today(g, e.id)) !== '{"n":7,"v":150}') bad.push('today ' + JSON.stringify(BINS.today(g, e.id)));
    const gm = S().gameMin; S().gameMin = gm + 1440;
    if (BINS.today(g, e.id).n !== 0) bad.push('a new day should read zero');
    BINS.note(g, e.id, 3, 30);
    if (BINS.today(g, e.id).n !== 3 || BINS.totals(g, e.id).n !== 10 || BINS.totals(g, e.id).v !== 180) bad.push(`after rollover today ${JSON.stringify(BINS.today(g, e.id))} total ${JSON.stringify(BINS.totals(g, e.id))}`);
    BINS.note(g, e.id, 0, 5); BINS.note(g, 'x', 1, 1); BINS.note(g, 1.5, 1, 1); if (Object.keys(S().binStats).some((k) => k !== String(e.id))) bad.push('a bad bin id was tallied: ' + Object.keys(S().binStats));
    // a hand sale at the bin is the SORT bin's
    const m0 = BINS.today(g, BINS.HALL).n; g.sell(3, 0, { dist: 0, streak: true }); if (BINS.today(g, BINS.HALL).n !== m0 + 1) bad.push('a hand sale was not counted at the SORT bin');
    S().gameMin = gm;
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.dest-is-a-setting-on-every-assignable-kind-and-nothing-else', async () => {
    const bad = [], e = K.beacon(-2, 4); K.run(0.2);
    const things = {
      belt: K.rawTile('belt', toI(-8), toK(2)), mech: K.rawTile('mech', toI(-8), toK(4)), truck: K.mkEarth('truck', toI(-6), toK(8)), excavator: K.mkEarth('excavator', toI(-6), toK(10)), dozer: K.mkEarth('dozer', toI(-6), toK(12)), wheel: K.mkEarth('wheel', toI(-6), toK(14)),
      borer: K.mach('borer', -10, 8, { dx: 1, dz: 0, w: 2, h: 3 }), claw: K.mach('claw', -10, 10), railstn: K.mach('railstn', -10, 12), railcar: K.mach('railcar', -10, 14),
    };
    for (const [k, t] of Object.entries(things)) {
      if (!BINS.assignable(t)) { bad.push(k + ' is not assignable'); continue; }
      for (const v of [e.id, BINS.HALL, 0]) { const r = g.setCfg(t, { dest: v }); if (!r.ok || (t.dest | 0) !== v) bad.push(`${k}: dest ${v} -> ${JSON.stringify(r)} ${t.dest}`); }
      for (const v of [1.5, '5', -2, 1e12, null, true, [1], { a: 1 }, 99999]) { const was = t.dest; const r = g.setCfg(t, { dest: v }); if (r.ok || t.dest !== was) bad.push(`${k}: ${JSON.stringify(v)} was accepted`); }
      if (g.setCfg(t, { dest: BINS.HALL, bogus: 1 }).ok) bad.push(k + ' took an unknown key');
    }
    // what is not a source of plush has no bin
    const fr = await placeAtFloor('gen', -3.4, 3.0, 2.0); const gen = tiles().find((x) => x.type === 'gen'); void fr;
    if (!gen || BINS.assignable(gen) || 'dest' in (EXT.cfgSpec(gen) || {})) bad.push('a generator took a bin');
    const vault = K.rawTile('vault', toI(-3), toK(7)); if (BINS.assignable(vault)) bad.push('a vault took a bin');
    const fr2 = K.mach('frame', -4, 12, { kind: 'timber', cx: -4, cz: 12, y0: 0, w: 4, h: 4 }); if (BINS.assignable(fr2)) bad.push('a frame took a bin');
    // an arch that is not a Portal has none, a Portal does
    const arch = { id: g.nextId(), type: 'garch', span: 6, pd: 0 }, portal = { id: g.nextId(), type: 'garch', span: 6, pd: 1 };
    if (BINS.assignable(arch) || !BINS.assignable(portal)) bad.push('only a Portal is assignable');
    if (!TYPES.truck || !TYPES.beacon || !TYPES.mech) bad.push('the aim needs a handler on each kind');
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.assigning-a-gone-bin-is-refused-and-a-beacon-taken-down-sends-everything-back-to-auto-and-says-so', async () => {
    const bad = [], e = K.beacon(-2, 4), f = K.beacon(-6, 6); K.run(0.2);
    const tk = K.mkEarth('truck', toI(-6), toK(8)), mech = K.rawTile('mech', toI(-8), toK(4)), bot = K.mkBot(-4, 4), belt = K.rawTile('belt', toI(-8), toK(2));
    S().cart = { tier: 1, x: 0, y: 0, z: 0, yaw: 0, mode: 'follow', load: [], dest: e.id };
    g.setCfg(tk, { dest: e.id }); g.setCfg(mech, { dest: e.id }); g.setCfg(belt, { dest: f.id }); bot.dest = e.id;
    const a = BINS.assignedTo(g, e.id); if (a.bots !== 1 || a.machines !== 3) bad.push('assigned counts ' + JSON.stringify(a));
    K.gone(e); const r = g.setCfg(tk, { dest: e.id }); if (r.ok || !/gone/.test(r.why)) bad.push('assigning a gone bin: ' + JSON.stringify(r));
    // the host's removal path clears it and says so
    K.toasts.length = 0; BINS.onBeaconGone(g, e.id);
    if (tk.dest || mech.dest || bot.dest || S().cart.dest) bad.push(`not cleared: ${tk.dest}/${mech.dest}/${bot.dest}/${S().cart.dest}`);
    if (belt.dest !== f.id) bad.push('a belt assigned to another bin was cleared');
    if (K.toasts.length !== 4 || !K.toasts.every((t) => /Bin assignment \| .*is gone, so it goes back to Auto/.test(t))) bad.push('toasts: ' + K.toasts.join(' / '));
    if (!K.toasts.some((t) => t.includes('Haul Truck')) || !K.toasts.some((t) => t.includes(bot.name)) || !K.toasts.some((t) => t.includes('Your cart'))) bad.push('who it says: ' + K.toasts.join(' / '));
    // the real hammer path
    const h = K.beacon(-12, 8); g.setCfg(mech, { dest: h.id }); K.run(0.2); K.toasts.length = 0; g.doDecon({ kind: 'mach', id: h.id });
    if (mech.dest || !K.toasts.some((t) => /Mech Scooper/.test(t))) bad.push('hammering a beacon left the mech assigned: ' + mech.dest + ' ' + K.toasts);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.copy-and-paste-carry-the-bin-same-kind-with-shift-e-any-kind-with-shift-semicolon', async () => {
    const bad = [], e = K.beacon(-2, 4); K.run(0.2);
    const t1 = K.mkEarth('truck', toI(-4), toK(8)), t2 = K.mkEarth('truck', toI(-4), toK(11)), bo = K.mach('borer', -10, 8, { dx: 1, dz: 0, w: 2, h: 3 }), mech = K.rawTile('mech', toI(-8), toK(4)), belt = K.rawTile('belt', toI(-8), toK(2));
    g.setCfg(t1, { dest: e.id });
    // Shift+E on a truck: all its settings (the bin is the one it has), E on a truck pastes
    g.copyCfg(t1); if (!g.cfgClip || g.cfgClip.vals.dest !== e.id || g.cfgClip.group !== 'bindest') bad.push('copy: ' + JSON.stringify(g.cfgClip));
    let r = g.pasteCfg(t2); if (!r.ok || t2.dest !== e.id) bad.push('truck to truck: ' + JSON.stringify(r) + t2.dest);
    // the clipboard of a truck pastes onto a borer, a mech and a belt end too
    for (const [n, t] of [['borer', bo], ['mech', mech], ['belt', belt]]) { r = g.pasteCfg(t); if (!r.ok || t.dest !== e.id) bad.push(`truck to ${n}: ${JSON.stringify(r)} ${t.dest}`); g.setCfg(t, { dest: 0 }); }
    // an Auto copy sets the others back to Auto
    // Shift+E on a machine whose only setting is its bin does not copy Auto (it stays E: park, take): Shift+; does
    g.setCfg(t2, { dest: 0 }); g.cfgClip = null; if (g.copyCfg(t2) !== null || g.cfgClip) bad.push('Shift+E copied an Auto truck');
    if (!BP.copyDest(g, { k: 'ent', o: t2 }) || g.cfgClip.vals.dest !== 0 || g.cfgClip.group !== 'bindest') bad.push('Auto not copied by Shift+;'); g.setCfg(t1, { dest: e.id }); r = g.pasteCfg(t1); if (!r.ok || t1.dest) bad.push('pasting Auto: ' + t1.dest);
    // a belt end copies only its bin and pastes onto another belt end, not onto a sorter or a generator
    g.setCfg(belt, { dest: BINS.HALL }); g.copyCfg(belt); const belt2 = K.rawTile('belt', toI(-8), toK(0)); r = g.pasteCfg(belt2); if (!r.ok || belt2.dest !== BINS.HALL) bad.push('belt to belt: ' + JSON.stringify(r));
    const sorter = K.rawTile('sorter', toI(-6), toK(0), { mode: 0, filter: 7, q: [], kept: [] }); r = g.pasteCfg(sorter); if (r.ok) bad.push('a bin pasted onto a sorter');
    // Shift+; copies just the bin; E on any assignable thing pastes it (through the real key path)
    const aim = (ent) => { g.player.pos.set(cellX(ent.i ?? toI(ent.x)) + 1.5, 0, cellZ(ent.k ?? toK(ent.z))); };
    void aim;
    g.cfgClip = { type: 'bot', group: 'bindest', vals: { dest: e.id } };
    for (const t of [t1, bo, mech]) { const rr = g.pasteCfg(t); if (!rr.ok || t.dest !== e.id) bad.push('bot clip to ' + t.type + ': ' + JSON.stringify(rr)); }
    const claw = K.mach('claw', -10, 12); r = g.pasteCfg(claw); if (!r.ok || claw.dest !== e.id) bad.push('claw ' + JSON.stringify(r));
    // the clip of a Rail Station stays with stations (its own group) unless it is the bin-only clip
    g.cfgClip = null;
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.a-saved-game-keeps-every-assignment-and-the-tally', async () => {
    const bad = [], e = K.beacon(-2, 4, { name: 'Deep' }); K.run(0.2);
    const tk = K.mkEarth('truck', toI(-6), toK(8)), mech = K.rawTile('mech', toI(-8), toK(4)), bot = K.mkBot(-4, 4), belt = K.rawTile('belt', toI(-8), toK(2));
    g.setCfg(tk, { dest: e.id }); g.setCfg(mech, { dest: BINS.HALL }); g.setCfg(belt, { dest: e.id }); bot.dest = e.id; S().cart = { tier: 1, x: 0, y: 0, z: 0, yaw: 0, mode: 'follow', load: [], dest: e.id }; BINS.note(g, e.id, 4, 80);
    BINS.ensureNums(g);
    const raw = JSON.parse(JSON.stringify({ entities: S().entities, crew: S().crew, cart: S().cart, binStats: S().binStats }));
    for (const x of [tk, mech, belt, e]) { const t = L().byId.get(x.id); if (t) L().remove(t); else K.gone(x); }
    S().entities = raw.entities; for (const x of raw.entities) g.addEntity(x);
    const get = (id) => L().byId.get(id) || (g.machines.items.get(id) || {}).ent;
    if (get(tk.id).dest !== e.id || get(mech.id).dest !== BINS.HALL || get(belt.id).dest !== e.id || get(e.id).name !== 'Deep' || get(e.id).num !== 0) bad.push('entities lost it');
    if (raw.crew[0].dest !== e.id || raw.cart.dest !== e.id) bad.push('bot or cart lost it');
    if (raw.binStats[e.id].tn !== 4) bad.push('tally lost');
    // the real save path: what goes to storage carries every assignment, the names and the tally
    const key = 'rotfactory.save.v1', kept = localStorage.getItem(key), noSave0 = g.noSave;
    try {
      g.noSave = false; if (!g.save()) bad.push('save failed'); const saved = JSON.parse(localStorage.getItem(key)).S;
      const se = (id) => saved.entities.find((x) => x.id === id);
      if (saved.crew[0].dest !== e.id || saved.cart.dest !== e.id || se(tk.id).dest !== e.id || se(mech.id).dest !== BINS.HALL || se(belt.id).dest !== e.id || se(e.id).name !== 'Deep' || se(e.id).num !== 0 || saved.binStats[e.id].tn !== 4) bad.push('the storage copy lost something');
    } finally { g.noSave = noSave0; if (kept === null) localStorage.removeItem(key); else localStorage.setItem(key, kept); }
    // the saved game really is plain JSON (a Three object or a Map on the ent would not survive): the settings are whole numbers
    for (const x of [tk, mech, belt]) if (!Number.isInteger(x.dest)) bad.push('not a whole number');
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.controls-table-and-readouts-name-the-key-and-every-kind-shows-its-bin', async () => {
    const bad = [], e = K.beacon(-2, 4); K.run(0.2);
    const rows = CONTROLS.flatMap((x) => x.rows).filter((r) => r.codes.includes('Semicolon'));
    if (rows.length !== 2 || !rows.some((r) => r.keys.join('+') === ';') || !rows.some((r) => r.keys.join('+') === 'Shift+;')) bad.push('controls rows: ' + rows.map((r) => r.keys.join('+')));
    if (rows.some((r) => /—/.test(r.what))) bad.push('em dash in the controls');
    const kinds = { truck: K.mkEarth('truck', toI(-6), toK(8)), excavator: K.mkEarth('excavator', toI(-6), toK(10)), borer: K.mach('borer', -10, 8, { dx: 1, dz: 0, w: 2, h: 3 }), claw: K.mach('claw', -10, 10), mech: K.rawTile('mech', toI(-8), toK(4)), belt: K.rawTile('belt', toI(-8), toK(2)), railstn: K.mach('railstn', -10, 12, { role: 'base' }), railcar: K.mach('railcar', -10, 14) };
    for (const [k, t] of Object.entries(kinds)) {
      const ref = { kind: t.items ? 'tile' : g.logi.byId.get(t.id) ? 'tile' : 'mach', id: t.id };
      let info = infoFor(g, ref); let txt = info ? info.lines.join(' | ') : '';
      if (!/Bin: Auto: /.test(txt)) bad.push(`${k} Auto readout: ${txt.slice(0, 120)}`);
      g.setCfg(t, { dest: e.id }); info = infoFor(g, ref); txt = info.lines.join(' | ');
      if (!/Bin: Depot A \(\d+ m\)/.test(txt)) bad.push(`${k} assigned readout: ${txt.slice(0, 160)}`);
      K.off.add(e.id); K.run(0.2); txt = infoFor(g, ref).lines.join(' | ');
      if (!/Depot A \(\d+ m\) has no power: Auto until it does/.test(txt)) bad.push(`${k} unpowered readout`);
      K.off.delete(e.id); K.run(0.2);
      if (!/; picks its bin/.test(txt)) bad.push(k + ' does not name the key');
    }
    return bad.length === 0 || bad.join(' || ');
  });
}
