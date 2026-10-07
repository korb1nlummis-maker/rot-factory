// mp.arch.*, mp.portal.*, mp.haul.*: giant arches, the Portal, haul roads, docks and the truck rows for a host and a guest, no network: one page plays both roles
// by switching g.net.role and capturing g.netSend (the same way mp.vscan.* does). The host owns the ents, the Portal's progress and the trucks; the guest draws the same
// thing, asks through commands the host rebuilds from a few integers, and a forged field never survives.
import { makeKit, UP, ARCH, PORTAL } from './portal_lib.js';
import * as HAUL from '../haul.js';
import { EARTH, STATES, earthRow, applyEarthRow } from '../earth.js';
import { infoFor } from '../info.js';
import { capacityOf } from '../loadtrace.js';

export default async function (ctx) {
  const { T, g, S, w, p, V3, fresh, newWorld, adv, craft, selectTool, plan, aimPoint, toI, toK, cellX, cellZ, clearBodies } = ctx;
  const K = makeKit(ctx);
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => {
    const mode0 = g.mode, remote0 = g.remote;
    try { g.mode = 'play'; await newWorld(); fresh(UP); S().money = 1e13; g.surgeT = 1e9; clearBodies(); K.fast(); return await fn(); } finally { done(); g.remote = remote0; g.mode = mode0 === 'ended' ? 'play' : mode0; g.stowed = true; g.rebuildTools(); g.cfgClip = null; }
  });
  const ents = (type) => [...g.machines.items.values()].map((it) => it.ent).filter((e) => e.type === type);
  const toGuest = (msgs, type) => { done(); for (const e of ents(type)) g.removeViewEnt(e.id); role('guest'); cap(); for (const m of msgs) g.netMessage(json(m)); };

  // ---------------------------------------------------------------- arches
  await guard('mp.arch.ent-plus-and-the-late-joiner-list-show-the-same-arch-and-readout', async () => {
    const st = K.site({ span: 8 }); K.clearBox(st.i0 - 20, st.lo, 8, 8, 6); role('host'); cap();
    const e = g.placeEntity('garch', { axis: 'x', gm: st.i0 - 20, glo: st.lo, gj: 0, span: 8, mat: 'steel' }, { quiet: true }); const bad = [];
    const plus = ofType('ent+').filter((m) => m.ent.id === e.id).pop(); if (!plus) return 'the host did not announce the arch';
    for (const k of ['items', 'cache', 'hist', 'cargo', 'hop']) if (k in plus.ent) bad.push('transient field sent: ' + k);
    if (plus.ent.span !== 8 || plus.ent.mat !== 'steel' || plus.ent.gm !== e.gm || plus.ent.type !== 'garch') bad.push('ent+ lacks the plain fields: ' + JSON.stringify(plus.ent));
    const hostInfo = JSON.stringify(infoFor(g, { kind: 'mach', id: e.id })); sent.length = 0; g.sendWorld(); const lists = ofType('ents'); const late = lists.flatMap((m) => m.list).find((x) => x.id === e.id); if (!late || late.span !== 8) bad.push('the late joiner list lacks the arch');
    const id = e.id; toGuest([plus], 'garch'); const v = S().entities.find((x) => x.id === id); if (!v || !v.view) return 'guest has no copy ' + bad.join('; ');
    const it = g.machines.items.get(id); if (!it || !it.obj || it.obj.children.length < 1) bad.push('the guest drew no mesh'); else if (Math.abs(it.obj.position.x - e.cx) > 1e-6 || Math.abs(it.obj.rotation.y - e.yaw) > 1e-6) bad.push('the guest mesh is elsewhere');
    if (!w().supports.some((s) => s.id === id && s.kind === 'arch8:steel')) bad.push('the guest world has no support for it');
    const gi = JSON.stringify(infoFor(g, { kind: 'mach', id })); if (gi.replace(/Carries \d+%/, '') !== hostInfo.replace(/Carries \d+%/, '')) bad.push('readouts differ: ' + gi.slice(0, 200) + ' vs ' + hostInfo.slice(0, 200));
    for (const x of ents('garch')) g.removeViewEnt(x.id); for (const m of lists) g.netMessage(json(m)); if (!ents('garch').some((x) => x.id === id)) bad.push('late joiner copy missing');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.arch.guest-place-command-is-rebuilt-by-the-host-and-forgeries-change-nothing', async () => {
    const st = K.site({ span: 6 }); const bad = []; K.clearBox(st.i0 - 24, st.lo, 20, 6, 5);
    role('guest'); cap(); S().items['garch:6:steel'] = 3; g.rebuildTools(); selectTool('garch:6:steel'); aimPoint(cellX(st.i0 - 22), 0.2, cellZ(st.lo + 2), 2.4); await plan(); if (!g.plan || !g.plan.ok) return 'guest plan: ' + (g.plan && g.plan.why);
    const n0 = S().entities.length; g.placeCurrent(g.curTool()); const c = sent.find((m) => m.t === 'cmd' && m.c === 'place');
    if (!c || S().entities.length !== n0 || c.d.tool.id !== 'garch:6:steel' || c.d.tool.kind !== 'garch') return 'guest did not only send the command: ' + JSON.stringify(c && c.d && c.d.tool);
    done(); role('host'); cap(); const have = S().items['garch:6:steel']; g.netMessage(json(c)); let made = ents('garch'); if (made.length !== 1) bad.push('host built ' + made.length);
    if (!ofType('ent+').some((m) => m.ent.type === 'garch')) bad.push('host did not announce the arch');
    S().items['garch:6:steel'] = have; const good = json(c); sent.length = 0;
    // the item id decides what it is, never the numbers the guest sent
    const forged = [
      { ...good, d: { tool: good.d.tool, ent: { ...good.d.ent, gm: good.d.ent.gm + 8, span: 12, mat: 'horizon', cx: 999, w: 99, h: 99, hr: 99, clear: { w: 99, h: 99 }, pd: 1, adv: 500, lined: 500, spent: 1e12, kind: 'arch12:horizon', cap: 1e12 } } },
      { ...good, d: { tool: { id: 'garch:12:steel', kind: 'garch' }, ent: { ...good.d.ent, gm: good.d.ent.gm + 12 } } },
      { ...good, d: { tool: { id: 'garch:6:banana', kind: 'garch' }, ent: { ...good.d.ent, gm: good.d.ent.gm + 16 } } },
      { ...good, d: { tool: { id: 'belt', kind: 'garch' }, ent: { ...good.d.ent, gm: good.d.ent.gm + 4 } } },
      { ...good, d: { tool: good.d.tool, ent: { ...good.d.ent } } },
    ];
    S().items.belt = 5; for (const f of forged) g.netMessage(json(f));
    const after = ents('garch'); const odd = after.filter((a) => a.cx > 100 || a.span !== 6 || a.mat !== 'steel' || a.hr > 10 || a.clear.w !== 5 || a.pd || a.adv || a.spent || a.kind !== 'arch6:steel');
    if (odd.length) bad.push('a forged field survived: ' + JSON.stringify(odd.map((a) => [a.cx, a.span, a.mat, a.pd, a.adv, a.spent, a.kind])));
    if (after.length !== 2) bad.push('arches after the forgeries: ' + after.length + ' (the same-cell repeat, the locked span, the bad material and the belt are refused; the shifted one is a clean extra)');
    if (S().items.belt !== 5) bad.push('a belt was used up as an arch'); if (!sent.some((m) => m.t === 'toast')) bad.push('the guest was not told about a refusal');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.arch.an-arch-that-buckles-on-the-host-is-gone-on-the-guest-with-its-name', async () => {
    const st = K.site({ span: 6, dist: 640 }); const lat = st.lo + 2; K.clearBox(st.i0 + 2, lat, 24, 2, 3); K.clearBox(st.i0 + 19, st.lo, 12, 6, 5);
    role('host'); cap(); const e = g.placeEntity('garch', { axis: 'x', gm: st.i0 + 19, glo: st.lo, gj: 0, span: 6, mat: 'timber' }, { quiet: true }); const s = w().supports.find((q) => q.id === e.id);
    sent.length = 0; g.failSupport(s, 1.4); const bad = [];
    if (!sent.some((m) => m.t === 'ent-' && m.id === e.id)) bad.push('no ent- for the buckled arch'); const sf = ofType('sfail')[0]; if (!sf || !/Timber Haul Arch/.test(sf.name)) bad.push('sfail names ' + (sf && sf.name));
    if (g.machines.items.has(e.id) || w().supports.some((q) => q.id === e.id)) bad.push('the host still has it'); const msgs = json(sent);
    // the guest had it, now removes it
    done(); role('host'); const e2 = g.placeEntity('garch', { axis: 'x', gm: st.i0 + 19, glo: st.lo, gj: 0, span: 6, mat: 'timber' }, { quiet: true }); const plus = { t: 'ent+', ent: g.stripEnt(e2) }; toGuest([plus], 'garch'); if (!ents('garch').some((x) => x.id === e2.id)) return 'the guest never got it: ' + bad.join('; ');
    g.netMessage({ t: 'ent-', id: e2.id }); if (ents('garch').some((x) => x.id === e2.id)) bad.push('ent- did not remove it on the guest'); void msgs;
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- the Portal
  await guard('mp.portal.the-row-carries-progress-and-the-guest-draws-the-cutter-where-the-host-has-it', async () => {
    const st = K.site({ span: 6 }), e = K.mouth(st, 'steel'); role('host'); cap(); const bad = [];
    K.until(() => e.lined >= 1 && e.adv >= 6, 60); const row = PORTAL.row(g); if (!row || !row[e.id] || row[e.id][0] !== e.adv || row[e.id][4] !== e.lined) return 'row ' + JSON.stringify(row);
    if (PORTAL.row(g) !== null) bad.push('an unchanged row was sent again');
    const plus = { t: 'ent+', ent: g.stripEnt(e) }, arches = ents('garch').filter((a) => a.id !== e.id).map((a) => ({ t: 'ent+', ent: g.stripEnt(a) })), rowMsg = { t: 'xrow', k: 'garch', d: json(row) };
    toGuest([plus, ...arches, rowMsg], 'garch'); const v = ents('garch').find((x) => x.id === e.id); if (!v || v.adv !== e.adv || v.lined !== e.lined || v.pd !== 1) return 'the guest copy: ' + JSON.stringify(v && [v.adv, v.lined, v.pd]) + ' ' + bad.join('; ');
    adv(1.0); const it = g.machines.items.get(e.id); if (!it.drv) bad.push('the guest drew no cutter'); else { const want = e.pd * v.adv * 0.6; if (Math.abs(it.drv.group.position.z - want) > 0.2) bad.push(`the cutter is at ${it.drv.group.position.z.toFixed(2)}, the host has it at ${want.toFixed(2)}`); }
    // a bad row never changes anything
    g.netMessage({ t: 'xrow', k: 'garch', d: { [e.id]: ['x', null, 1] } }); g.netMessage({ t: 'xrow', k: 'garch', d: { [e.id]: [1e9, 99, 1e9, 9, 1e9, 1, 1] } }); g.netMessage({ t: 'xrow', k: 'garch', d: { __proto__: { x: 1 }, constructor: [1] } });
    if (v.adv > 5000 || !Number.isFinite(v.adv)) bad.push('a forged row set the progress to ' + v.adv); const t0 = v.adv; PORTAL.tick(g, 5); if (v.adv !== t0) bad.push('a guest ran the driver');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.portal.guest-cfg-parks-and-starts-it-and-forgeries-are-rejected', async () => {
    const st = K.site({ span: 6 }), e = K.mouth(st, 'steel'); const bad = []; role('guest'); cap();
    const r = g.setCfg(e, { off: true }); const c = sent.find((m) => m.t === 'cmd' && m.c === 'cfg'); if (!r.ok || !c) return 'the guest did not send a cfg command: ' + JSON.stringify(r); if (e.off) bad.push('the guest changed it itself');
    done(); role('host'); cap(); g.netMessage(json(c)); if (!e.off) bad.push('the host did not park it'); if (!ofType('ent+').some((m) => m.ent.id === e.id && m.ent.off === true)) bad.push('the host did not announce it');
    for (const patch of [{ adv: 99 }, { lined: 40 }, { pd: -1 }, { span: 12 }, { mat: 'horizon' }, { off: 1 }, { off: true, adv: 5 }]) { const before = JSON.stringify([e.adv, e.lined, e.pd, e.span, e.mat]); g.netMessage({ t: 'cmd', c: 'cfg', d: { id: e.id, patch } }); if (JSON.stringify([e.adv, e.lined, e.pd, e.span, e.mat]) !== before) bad.push('a guest changed ' + JSON.stringify(patch)); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.portal.a-late-joiner-gets-the-bored-tunnel-lined-and-the-state', async () => {
    const st = K.site({ span: 6 }), e = K.mouth(st, 'steel'); role('host'); cap(); K.until(() => e.lined >= 2, 80); const bad = []; sent.length = 0; g.sendWorld(); const lists = ofType('ents'), flat = lists.flatMap((m) => m.list);
    const late = flat.find((x) => x.id === e.id); if (!late || late.adv !== e.adv || late.lined !== e.lined || late.pd !== 1 || late.spent !== e.spent) return 'late list: ' + JSON.stringify(late);
    const n = flat.filter((x) => x.type === 'garch').length; if (n !== 1 + e.lined) bad.push(`${n} arches in the list, ${1 + e.lined} stand`);
    const cells = []; for (const [i, j, k] of PORTAL.slabCells(e, PORTAL.slabA(e, 2))) cells.push(w().solid(i, j, k)); if (cells.some(Boolean)) bad.push('the host slab is not empty');
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- roads, docks, trucks
  await guard('mp.haul.road-and-dock-ent-plus-guest-place-and-the-late-joiner', async () => {
    const bad = []; role('host'); cap();
    const rd = g.placeEntity('road', { i0: toI(-30), k0: toK(0), j: 0 }, { quiet: true }), dk = g.placeEntity('dock', { ax: 'x', i0: toI(-20), k0: toK(-8), j: 0 }, { quiet: true });
    const plus = ofType('ent+').filter((m) => m.ent.id === rd.id || m.ent.id === dk.id); if (plus.length !== 2) return 'ent+ for road and dock: ' + plus.length;
    sent.length = 0; g.sendWorld(); const late = ofType('ents').flatMap((m) => m.list); if (!late.some((x) => x.id === rd.id && x.i0 === rd.i0) || !late.some((x) => x.id === dk.id && x.ax === 'x')) bad.push('late joiner list lacks road or dock');
    toGuest(plus, 'road'); for (const e of ents('dock')) g.removeViewEnt(e.id); for (const m of plus) g.netMessage(json(m)); if (!ents('road').length || !ents('dock').length) return 'guest has no copies: ' + bad.join('; ');
    const gd = ents('dock')[0]; if (!g.machines.items.get(gd.id).dock) bad.push('the guest drew no dock'); const info = infoFor(g, { kind: 'mach', id: gd.id }); if (!info || !/TRUCK DOCK/.test(info.title)) bad.push('guest dock readout');
    // the guest asks to lay a plate, the host rebuilds it from the integers and refuses a plate on top of another
    done(); role('guest'); cap(); S().items.road = 2; g.rebuildTools(); selectTool('road'); K.clearBox(toI(-26), toK(4), 8, 8, 4); aimPoint(cellX(toI(-24)), 0.1, cellZ(toK(6)), 2.4); await plan(); if (!g.plan || !g.plan.ok) return 'guest road plan: ' + (g.plan && g.plan.why);
    g.placeCurrent(g.curTool()); const c = sent.find((m) => m.t === 'cmd' && m.c === 'place'); if (!c) return 'no place command'; done(); role('host'); cap(); g.netMessage(json(c)); const nRoads = ents('road').length;
    const forged = json(c); forged.d.ent = { ...forged.d.ent, i0: forged.d.ent.i0 + 2, x: 5, cx: 5, price: 0 }; g.netMessage(forged); g.netMessage(json(c)); if (ents('road').length !== nRoads) bad.push('a plate overlapping another one was laid: ' + ents('road').length + ' vs ' + nRoads);
    for (const r of ents('road')) if (r.x !== undefined || r.cx !== undefined || r.price !== undefined) bad.push('a forged field survived on a plate');
    const fd = { t: 'cmd', c: 'place', d: { tool: { id: 'dock', kind: 'dock' }, ent: { ax: 'x', i0: toI(-20) + 2, k0: toK(-8), j: 0 } } }; const dn = ents('dock').length; S().items.dock = 1; g.netMessage(fd); if (ents('dock').length !== dn) bad.push('a dock was set on top of another dock');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.haul.the-truck-row-puts-the-guest-truck-on-the-tunnel-floor-and-an-old-row-still-works', async () => {
    const tk = { id: g.nextId(), type: 'truck', i: toI(-3), j: 0, k: toK(4), dx: 1, dz: 0, x: cellX(toI(-3)), y: 0, z: cellZ(toK(4)), px: cellX(toI(-3)), pz: cellZ(toK(4)), cargo: [], cn: 0, route: [], seg: 0, trips: 0, state: 'idle', job: 0, yaw: 0, hy: EARTH.truck.hy, hr: EARTH.truck.hr };
    role('host'); cap(); S().entities.push(tk); g.addEntity(tk); const it = g.machines.items.get(tk.id); tk.state = 'go'; tk.bp = 41; tk.py = 1.8; tk.px += 3; const row = earthRow(it), bad = [];
    if (row.length !== 16 || row[14] !== 41 || row[15] !== 1.8 || STATES[row[4]] !== 'go') bad.push('row ' + JSON.stringify(row));
    const plus = { t: 'ent+', ent: g.stripEnt(tk) }; toGuest([plus], 'truck'); const gt = ents('truck').find((x) => x.id === tk.id); if (!gt) return 'no guest truck';
    const git = g.machines.items.get(tk.id); applyEarthRow(git, row); if (gt.bp !== 41 || gt.py !== 1.8 || gt.state !== 'go') bad.push('the guest row: ' + JSON.stringify([gt.bp, gt.py, gt.state]));
    for (let n = 0; n < 60; n++) g.machines.guestUpdate(0.05, g.time += 0.05); if (Math.abs(git.obj.position.y - 1.8) > 0.2) bad.push('the guest truck is at y ' + git.obj.position.y.toFixed(2) + ', the host drives at 1.8 (a tunnel floor row)');
    applyEarthRow(git, row.slice(0, 14)); if (gt.py !== 1.8) bad.push('an old row cleared the height');
    const info = infoFor(g, { kind: 'mach', id: tk.id }); if (!info || !/Battery 41%/.test(info.lines.join(' '))) bad.push('the guest readout lacks the battery: ' + JSON.stringify(info && info.lines));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.haul.the-dock-row-carries-charging-and-power-to-the-guest', async () => {
    role('host'); cap(); const dk = g.placeEntity('dock', { ax: 'x', i0: toI(-20), k0: toK(-8), j: 0 }, { quiet: true }); dk.ch = 1; dk.pw = 0.8; const bad = [];
    const row = HAUL.dockRow(g); if (!row || row[dk.id][0] !== 1 || row[dk.id][1] !== 80) return 'row ' + JSON.stringify(row); if (HAUL.dockRow(g) !== null) bad.push('an unchanged row was sent again');
    toGuest([{ t: 'ent+', ent: g.stripEnt(dk) }], 'dock'); g.netMessage({ t: 'xrow', k: 'dock', d: json(row) }); const gd = ents('dock')[0]; if (!gd || gd.ch !== 1 || Math.abs(gd.pw - 0.8) > 1e-9) return 'guest dock ' + JSON.stringify(gd && [gd.ch, gd.pw]) + ' ' + bad.join('; ');
    g.netMessage({ t: 'xrow', k: 'dock', d: { [gd.id]: ['x', 5] } }); g.netMessage({ t: 'xrow', k: 'dock', d: null }); if (gd.ch !== 1) bad.push('a bad row changed the dock');
    return bad.length === 0 || bad.join(' || ');
  });
}
