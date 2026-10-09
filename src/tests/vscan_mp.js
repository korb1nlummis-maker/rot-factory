// mp.vscan.*: the Vehicle Scanner for a host and a guest, no network: one page plays both roles by switching g.net.role and capturing g.netSend.
// The host owns the ent, the trucks and the alarm; the guest sees the same arch, lamps, alarm and trucks and presses E through a command the host checks.
import { makeKit } from './addons_lib.js';
import * as VS from '../vehiclescan.js';
import * as EXT from '../ext.js';
import { EARTH, STATES, earthRow, applyEarthRow } from '../earth.js';
import { infoFor } from '../info.js';
import { NEEDLE } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, p, V3, fresh, adv, toI, toK, cellX, cellZ } = ctx;
  const K = makeKit(ctx);
  const UP = { detector: 1, archGate: 1, archGiant: 1, vscan: 1, power: 1, belts: 1, truck: 1 };
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => {
    const fn0 = g.foundNeedle, mode0 = g.mode, remote0 = g.remote;
    try { g.mode = 'play'; return await fn(); } finally { done(); g.foundNeedle = fn0; g.remote = remote0; g.mode = mode0 === 'ended' ? 'play' : mode0; S().found = false; S().ending = null; S().needleLost = false; g.alarmGate = null; g.stowed = true; g.rebuildTools(); g.cfgClip = null; if (g.ui.openModal) g.ui.closeModals(); }
  });
  const rec = () => {
    const calls = [], keep = {}; for (const k of ['tone', 'noise', 'thump']) keep[k] = g.sound[k];
    g.sound.tone = (...a) => calls.push(['tone', ...a]); g.sound.noise = (...a) => calls.push(['noise', ...a]); g.sound.thump = (...a) => calls.push(['thump', ...a]);
    return { calls, off: () => { for (const k of Object.keys(keep)) g.sound[k] = keep[k]; } };
  };
  const toneN = (r) => r.calls.filter((c) => c[0] === 'tone');
  const clearAt = (x, z, axis = 'z') => { const w = g.world, i0 = toI(x), k0 = toK(z); for (let a = -8; a <= 8; a++) for (let b = -8; b <= 8; b++) for (let j = 0; j < 13; j++) { const i = i0 + (axis === 'z' ? a : b), k = k0 + (axis === 'z' ? b : a); if (w.get(i, j, k)) w.removeCell(i, j, k, false); } };
  const mk = (x, z, axis = 'z') => {
    K.clearBay(); clearAt(x, z, axis); const lat = axis === 'z' ? toI(x) : toK(z), m = axis === 'z' ? toK(z) : toI(x);
    const l = VS.layout(g, axis, m, lat - 5, 0); if (!l.ok) throw new Error('layout: ' + l.why); return g.placeEntity('vscan', l.ent);
  };
  const scans = () => [...g.machines.items.values()].map((it) => it.ent).filter((e) => e.type === 'vscan');
  // drop the scanner from this world and show it again the way a guest does: from the host's messages
  const toGuest = (msgs) => { done(); for (const e of scans()) g.removeViewEnt(e.id); role('guest'); cap(); for (const m of msgs) g.netMessage(json(m)); };
  const truckAt = (e) => ({ id: 77, type: 'truck', px: e.cx, pz: e.cz, cargo: [3, 0, 3, 0], cn: 2 });

  await guard('mp.vscan.ent-plus-and-the-late-joiner-list-show-the-same-scanner-with-the-same-readout-and-the-alarm', async () => {
    fresh(UP); const bad = []; role('host'); cap(); const e = mk(-8, 3); g.setCfg(e, { volume: 0.4, quiet: true });
    e.alarm = true; e.held = { sp: NEEDLE, vr: 0 }; e.loads = 6; g.netSend({ t: 'ent-', id: e.id }); g.netSend({ t: 'ent+', ent: g.stripEnt(e) });
    const hostInfo = JSON.stringify(infoFor(g, { kind: 'mach', id: e.id }));
    const plus = ofType('ent+').filter((m) => m.ent.id === e.id).pop(); if (!plus) return 'host did not announce the scanner';
    for (const k of ['items', 'q', 'cache', 'hist', 'cargo', 'hop']) if (k in plus.ent) bad.push('transient field sent: ' + k);
    if (plus.ent.volume !== 0.4 || plus.ent.quiet !== true || plus.ent.alarm !== true || !plus.ent.held || plus.ent.held.sp !== NEEDLE || plus.ent.loads !== 6 || plus.ent.type !== 'vscan') bad.push('ent+ lacks the state: ' + JSON.stringify(plus.ent));
    const id = e.id; sent.length = 0; g.sendWorld(); const lists = ofType('ents'); const late = lists.flatMap((m) => m.list).find((x) => x.id === id); if (!late || !late.alarm || late.loads !== 6 || late.hr !== VS.SIZE.hr) bad.push('the late joiner list lacks the scanner: ' + JSON.stringify(late));
    toGuest([plus]); const v = S().entities.find((x) => x.id === id); if (!v || !v.view || !v.alarm) return 'guest has no copy ' + bad.join('; ');
    const it = g.machines.items.get(id); if (!it || !it.obj || !it.vscan || it.obj.children.length < 8) bad.push('guest drew no mesh');
    if (Math.abs(it.obj.position.x - e.cx) > 1e-6 || Math.abs(it.obj.position.z - e.cz) > 1e-6 || Math.abs(it.obj.rotation.y - e.yaw) > 1e-6) bad.push('guest mesh is somewhere else');
    VS.scanState(v).powered = VS.scanState(e).powered; const gi = infoFor(g, { kind: 'mach', id }); if (JSON.stringify(gi) !== hostInfo) bad.push('readouts differ: ' + JSON.stringify(gi) + ' vs ' + hostInfo);
    adv(0.2); if (!g.machines.items.get(id).vscan.held.visible || !g.machines.items.get(id).vscan.column.visible) bad.push('the guest does not show the held One and the red column');
    // the late joiner path builds the same thing, alarm included
    for (const x of scans()) g.removeViewEnt(x.id); for (const m of lists) g.netMessage(json(m)); const lv = scans().find((x) => x.id === id); if (!lv || !lv.alarm || !lv.held || !g.machines.items.get(id).vscan) bad.push('late joiner copy missing or without the alarm');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.vscan.guest-place-command-is-rebuilt-by-the-host-and-forgeries-change-nothing', async () => {
    fresh(UP); const bad = []; K.clearBay(); clearAt(-8, 3, 'z'); S().money = 1e12;
    role('guest'); cap(); S().items.vscan = 3; K.equip('vscan'); K.aimDir(-8, 0, 3, 1, 2.4); await ctx.plan(); if (!g.plan || !g.plan.ok) return 'guest plan: ' + (g.plan && g.plan.why);
    const n0 = S().entities.length; g.placeCurrent(g.curTool()); const c = sent.find((m) => m.t === 'cmd' && m.c === 'place');
    if (!c || S().entities.length !== n0 || c.d.tool.id !== 'vscan' || c.d.tool.kind !== 'vscan') return 'guest did not only send the command: ' + JSON.stringify(c);
    done(); role('host'); cap(); const have = S().items.vscan; g.netMessage(json(c)); const made = scans(); if (made.length !== 1) bad.push('host built ' + made.length);
    if (!ofType('ent+').some((m) => m.ent.type === 'vscan')) bad.push('host did not announce the scanner');
    S().items.vscan = have; const good = json(c); sent.length = 0;
    const forged = [
      { ...good, d: { tool: good.d.tool, ent: { ...good.d.ent, gm: good.d.ent.gm + 14, cx: 999, w: 99, h: 99, hr: 99, alarm: true, held: { sp: NEEDLE, vr: 0 }, loads: 9000, volume: 50 } } },
      { ...good, d: { tool: { id: 'belt', kind: 'vscan' }, ent: { ...good.d.ent, gm: good.d.ent.gm + 20 } } },
      { ...good, d: { tool: { id: 'arch', kind: 'vscan' }, ent: { ...good.d.ent, gm: good.d.ent.gm + 24 } } },
      { ...good, d: { tool: good.d.tool, ent: { ...good.d.ent } } },
    ];
    S().items.belt = 5; for (const f of forged) g.netMessage(json(f));
    const after = scans(); const odd = after.filter((a) => a.cx > 100 || a.w > 8 || a.hr !== VS.SIZE.hr || a.alarm || a.held || a.loads || a.volume !== 0.7); if (odd.length) bad.push('a forged field survived: ' + JSON.stringify(odd.map((a) => [a.cx, a.w, a.hr, a.alarm, a.loads, a.volume])));
    if (after.length !== 2) bad.push('scanners after forgeries: ' + after.length + ' (one clean extra expected: the belt, the arch id and the overlap were refused)');
    if (S().items.belt !== 5) bad.push('a belt was used up as a scanner');
    if (!sent.some((m) => m.t === 'toast')) bad.push('the guest was not told about a refusal');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.vscan.guest-cfg-sets-volume-and-quiet-and-nothing-else-and-both-screens-agree', async () => {
    fresh(UP); const bad = []; role('host'); cap(); const e = mk(-8, 3), id = e.id, plus = ofType('ent+').pop();
    toGuest([plus]); const patch = { volume: 0.25, quiet: true }; const r = g.setCfg(id, patch); const cmd = sent.find((m) => m.t === 'cmd' && m.c === 'cfg');
    if (!r.ok || !cmd || JSON.stringify(cmd.d.patch) !== JSON.stringify(patch)) bad.push('no cfg command: ' + JSON.stringify(cmd));
    if (scans()[0].volume !== 0.7) bad.push('the guest changed its own copy first');
    sent.length = 0; for (const bp of [{ alarm: false }, { held: null }, { loads: 0 }, { volume: 9 }]) if (g.setCfg(id, bp).ok) bad.push('guest sent ' + JSON.stringify(bp));
    done(); for (const x of scans()) g.removeViewEnt(x.id); S().entities.push({ ...json(plus.ent), view: false }); g.addEntity(S().entities[S().entities.length - 1]); role('host'); cap();
    const he = scans()[0]; he.alarm = true; he.held = { sp: NEEDLE, vr: 0 };   // the host's alarm must survive a guest's settings message
    for (const bp of [{ alarm: false }, { held: null }, { loads: 99 }, { cx: 5 }]) g.netMessage(json({ t: 'cmd', c: 'cfg', d: { id, patch: bp } })); if (!he.alarm || !he.held || he.loads || he.cx > 100) bad.push('a guest cleared the alarm or changed the machine: ' + JSON.stringify([he.alarm, he.held, he.loads]));
    he.alarm = false; he.held = null; g.netMessage(json(cmd)); if (he.volume !== 0.25 || !he.quiet) bad.push('host did not apply: ' + JSON.stringify([he.volume, he.quiet]));
    const minus = sent.findIndex((m) => m.t === 'ent-'), plus2 = sent.findIndex((m) => m.t === 'ent+'); if (minus < 0 || plus2 < minus) bad.push('ent- then ent+ expected');
    const msgs = json(sent.filter((m) => m.t === 'ent-' || m.t === 'ent+')), hostInfo = JSON.stringify(infoFor(g, { kind: 'mach', id }));
    toGuest(msgs); const gv = scans()[0]; if (!gv || gv.volume !== 0.25 || !gv.quiet) bad.push('guest copy not refreshed'); VS.scanState(gv).powered = VS.scanState(he).powered;
    if (JSON.stringify(infoFor(g, { kind: 'mach', id })) !== hostInfo) bad.push('readouts differ after the change');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.vscan.a-scanned-load-is-announced-and-the-guest-flashes-and-hears-it-by-distance', async () => {
    fresh(UP); const bad = []; role('host'); cap(); const e = mk(-8, 3), id = e.id; e.pw = 1; const truck = truckAt(e);
    p().pos.set(e.cx, 0, e.cz - 5); let r = rec(); try { VS.scanLoad(g, truck, e); } finally { r.off(); }
    const row = ofType('xrow').find((m) => m.k === 'vscan' && m.d.ev === 'scan'); if (!row || row.d.id !== id || row.d.k !== 'clear' || row.d.n !== 2 || row.d.by !== 'h' || row.d.ld !== 1) bad.push('host did not announce: ' + JSON.stringify(row));
    if (!toneN(r).some((c) => c[1] === 'sine' && c[2] === 700)) bad.push('host did not hear the tick');
    const alarmTruck = { ...truckAt(e), cargo: [NEEDLE, 0, 3, 0], cn: 2 }; sent.length = 0; r = rec(); try { VS.scanLoad(g, alarmTruck, e); } finally { r.off(); }
    const alarm = ofType('xrow').find((m) => m.k === 'vscan' && m.d.ev === 'scan'); if (!alarm || alarm.d.k !== 'alarm' || alarm.d.ld !== 2) bad.push('alarm event: ' + JSON.stringify(alarm));
    if (!ofType('ent+').some((m) => m.ent.id === id && m.ent.alarm === true && m.ent.held)) bad.push('the alarm did not reach the guest as an ent+');
    if (!ofType('toast').some((m) => /VEHICLE SCANNER ALARM/.test(m.title))) bad.push('the guest got no alarm toast');
    if (alarmTruck.cargo.length !== 2 || VS.hasOne(alarmTruck.cargo)) bad.push('The One is still in the bed');
    // the guest shows the same scan
    e.alarm = false; e.held = null; toGuest([json({ t: 'ent+', ent: g.stripEnt(e) })]); const ge = scans()[0]; VS.scanState(ge).powered = true; p().pos.set(ge.cx, 0, ge.cz - 6);
    r = rec(); try { g.netMessage(json({ t: 'xrow', k: 'vscan', d: row.d })); } finally { r.off(); }
    if (VS.scanState(ge).kind !== 'clear' || !toneN(r).some((c) => c[2] === 700) || ge.loads !== 1) bad.push('guest did not react to the clear scan: ' + JSON.stringify([VS.scanState(ge).kind, ge.loads]));
    r = rec(); try { g.netMessage(json({ t: 'xrow', k: 'vscan', d: alarm.d })); } finally { r.off(); }
    if (VS.scanState(ge).kind !== 'alarm' || !toneN(r).some((c) => c[2] === 988) || !toneN(r).some((c) => c[1] === 'square')) bad.push('guest did not react to the alarm scan');
    EXT.update(g, 0.05, true); const lamps = g.machines.items.get(id).vscan.lamps.map((m) => m.color.getHex()); if (!lamps.some((c) => c === 0x45ff7a || c === 0xffd24a || c === 0xff3322)) bad.push('guest lamps did not flash: ' + lamps);
    p().pos.set(ge.cx + 95, 0, ge.cz); r = rec(); try { g.netMessage(json({ t: 'xrow', k: 'vscan', d: row.d })); } finally { r.off(); } if (r.calls.length) bad.push('a far guest still heard it');
    sent.length = 0; g.netMessage(json({ t: 'xrow', k: 'vscan', d: { ...row.d, by: 'g' } })); if (sent.length) bad.push('guest sent something on an event');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.vscan.the-half-second-row-carries-power-alarm-and-loads-and-an-unchanged-row-is-not-resent', async () => {
    fresh({ ...UP, genOutput: 2 }); const bad = []; role('host'); cap(); const a = mk(-8, 3), b = mk(-8, 12);   // (23 kW per generator: the 14 kW scanner runs at full power)
    { const t = (type, x, z) => { const e = { id: g.nextId(), type, i: toI(x), j: 0, k: toK(z), dir: 0, rise: 0 }; S().entities.push(e); g.addEntity(e); return g.logi.byId.get(e.id); }; const gen = t('gen', -10, 1), pole = t('pole', -9.4, 1); gen.burn = 1e5; gen.burnMax = 1e5; gen.lit = true; S().items.cable = 4; g.cables.connect(gen.id, pole.id); g.cables.connect(pole.id, a.id); }   // the scanner a has a cable to a live pole, b has none
    adv(0.1); adv(0.6); if (!(a.pw > 0.95) || (b.pw || 0) !== 0) return `setup: a ${a.pw}, b ${b.pw}`;
    a.alarm = true; a.held = { sp: NEEDLE, vr: 0 }; a.loads = 4;
    g.time += 6; g._extRow = 0; sent.length = 0; EXT.update(g, 0.1, false); const row = ofType('xrow').find((m) => m.k === 'vscan');
    if (!row || row.d.pw[a.id] !== 1 || row.d.pw[b.id] !== 0 || row.d.al[a.id] !== 1 || row.d.al[b.id] !== 0 || row.d.ld[a.id] !== 4) return 'row: ' + JSON.stringify(row);
    sent.length = 0; g._extRow = 0; EXT.update(g, 0.1, false); if (ofType('xrow').some((m) => m.k === 'vscan')) bad.push('an unchanged row was sent again at once');
    a.alarm = false; a.held = null; g.time += 0.2; sent.length = 0; g._extRow = 0; EXT.update(g, 0.1, false); const r2 = ofType('xrow').find((m) => m.k === 'vscan'); if (!r2 || r2.d.al[a.id] !== 0) bad.push('the cleared alarm was not sent');
    // the guest: fresh copies start dark and calm, then the row decides
    a.alarm = true; a.held = { sp: NEEDLE, vr: 0 }; const plus = json(scans().map((x) => ({ t: 'ent+', ent: g.stripEnt(x) }))); a.alarm = false; a.held = null;
    toGuest(plus); const ga = scans().find((x) => x.id === a.id), gb = scans().find((x) => x.id === b.id); for (const x of scans()) if (VS.scanState(x).powered) bad.push('a fresh guest copy starts powered');
    g.netMessage(json({ t: 'xrow', k: 'vscan', d: row.d })); EXT.update(g, 0.05, true);
    if (!VS.scanState(ga).powered || VS.scanState(gb).powered || !ga.alarm || !ga.held || gb.alarm || ga.loads !== 4) bad.push('guest flags are wrong: ' + JSON.stringify([VS.scanState(ga).powered, VS.scanState(gb).powered, ga.alarm, gb.alarm, ga.loads]));
    g.netMessage(json({ t: 'xrow', k: 'vscan', d: r2.d })); if (ga.alarm || ga.held || g.alarmGate === ga) bad.push('the cleared alarm did not reach the guest');
    const idle = (e) => g.machines.items.get(e.id).vscan.lamps.map((m) => m.color.getHex()); EXT.update(g, 0.05, true); if (idle(ga).some((c) => c !== 0x2e8c4a)) bad.push('guest lit lamps ' + idle(ga)); if (idle(gb).some((c) => c !== 0x222222)) bad.push('guest dark lamps ' + idle(gb));
    // junk rows change nothing and throw nothing
    ga.alarm = false; for (const d of [null, 5, 'x', { pw: 5 }, { al: 'x' }, { ld: { [ga.id]: 'many' } }, { pw: { 99999: 1 } }, { k: 'alarm', id: 'x', by: 'h' }, { k: 'alarm', id: ga.id, by: 'g' }, { k: 'evil', id: ga.id, by: 'h' }, { al: { [ga.id]: 7 } }]) g.netMessage(json({ t: 'xrow', k: 'vscan', d }));
    if (!VS.scanState(ga).powered || ga.alarm || ga.loads !== 4) bad.push('a junk row changed the state: ' + JSON.stringify([VS.scanState(ga).powered, ga.alarm, ga.loads]));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.vscan.a-guest-presses-e-on-the-alarm-and-the-host-hands-over-the-one-only-to-a-friend-standing-there', async () => {
    fresh(UP); const bad = []; role('host'); cap(); const e = mk(-8, 3), id = e.id; VS.raise(g, e, { sp: NEEDLE, vr: 0 }); const plus = ofType('ent+').pop();
    toGuest([plus]); const ge = scans()[0]; if (!ge.alarm) return 'guest has no alarm'; p().pos.set(ge.cx, 0, ge.cz - 3);
    sent.length = 0; const used = VS.use(g, ge); const cmd = sent.find((m) => m.t === 'cmd' && m.c === 'vscan'); if (used !== true || !cmd || cmd.d.id !== id) return 'no vscan command: ' + JSON.stringify(sent);
    if (!ge.alarm) bad.push('the guest cleared the alarm itself');
    // the guest's own game has a quiet scanner: E only reports, no command
    ge.alarm = false; ge.held = null; sent.length = 0; VS.use(g, ge); if (sent.some((m) => m.c === 'vscan')) bad.push('a command for a quiet scanner'); ge.alarm = true; ge.held = { sp: NEEDLE, vr: 0 };
    // host side: back on the host with the alarm up
    done(); for (const x of scans()) g.removeViewEnt(x.id); S().entities.push({ ...json(plus.ent), view: false }); g.addEntity(S().entities[S().entities.length - 1]); role('host'); cap(); const he = scans()[0];
    g.remote = null; g.netMessage(json(cmd)); if (!he.alarm || ofType('give').length) bad.push('handed over with no friend present');
    g.remote = { pos: new V3(he.cx + 60, 0, he.cz) }; g.netMessage(json(cmd)); if (!he.alarm || ofType('give').length) bad.push('handed over to a friend 60 m away');
    g.remote = { pos: new V3(he.cx, 30, he.cz) }; g.netMessage(json(cmd)); if (!he.alarm || ofType('give').length) bad.push('handed over to a friend 30 m above');
    for (const d of [null, 5, 'x', { id: 'nope' }, { id: {} }, { id: he.id + 9999 }]) g.netMessage({ t: 'cmd', c: 'vscan', d: json(d) }); if (!he.alarm || ofType('give').length) bad.push('junk commands changed something');
    g.remote = { pos: new V3(he.cx, 0, he.cz - 4) }; sent.length = 0; g.netMessage(json(cmd));
    const give = ofType('give')[0]; if (!give || give.items.length !== 1 || give.items[0].sp !== NEEDLE) bad.push('no give of The One: ' + JSON.stringify(give));
    if (he.alarm || he.held || g.alarmGate === he) bad.push('the host alarm did not clear');
    if (!ofType('ent+').some((m) => m.ent.id === id && !m.ent.alarm)) bad.push('the guest was not told the alarm ended');
    // a second press has nothing left to give
    sent.length = 0; g.netMessage(json(cmd)); if (ofType('give').length) bad.push('The One was handed over twice');
    // the guest's give handler is the win flow
    done(); role('guest'); cap(); let won = 0; const f0 = g.foundNeedle; g.foundNeedle = () => { won++; }; try { g.netMessage(json(give)); } finally { g.foundNeedle = f0; } if (won !== 1) bad.push('the guest did not win on the give: ' + won);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.vscan.trucks-show-scan-dump-hold-refuse-and-the-one-flag-on-the-guest-with-the-same-readout', async () => {
    fresh(UP); const bad = []; role('host'); cap(); const b = g.hall.binPos;
    const tk = { id: g.nextId(), type: 'truck', i: toI(b.x + 6), j: 0, k: toK(b.z + 8), dx: 1, dz: 0, x: cellX(toI(b.x + 6)), y: 0, z: cellZ(toK(b.z + 8)), hy: EARTH.truck.hy, hr: EARTH.truck.hr, px: b.x + 6, pz: b.z + 8, cargo: [NEEDLE, 0, 3, 0], cn: 2, route: [], seg: 0, trips: 2, state: 'refuse', job: 0, yaw: 0 };
    S().entities.push(tk); g.addEntity(tk); const it = g.machines.items.get(tk.id);
    const hostInfo = json(infoFor(g, { kind: 'mach', id: tk.id })); if (!/Will not leave/.test(hostInfo.lines[0]) || !hostInfo.lines.some((l) => /THE ONE is aboard/.test(l))) bad.push('host readout: ' + JSON.stringify(hostInfo));
    const plus = json({ t: 'ent+', ent: g.stripEnt(tk) }); if (plus.ent.cargo) bad.push('the cargo travels in ent+'); const row = earthRow(it); if (row.length < 14 || row[13] !== 1) bad.push('row ' + JSON.stringify(row));
    done(); g.removeViewEnt(tk.id); role('guest'); cap(); g.netMessage(plus);
    const git = g.machines.items.get(tk.id); if (!git) return 'the guest did not build the truck'; const ge = git.ent; ge.trips = 2; ge.cn = 2;
    for (const [state, re] of [['refuse', /Will not leave/], ['scan', /Stopped under the Vehicle Scanner/], ['dump', /Dumping the whole load/], ['hold', /Held in line/]]) {
      const r = row.slice(); r[4] = STATES.indexOf(state); applyEarthRow(git, r); const gi = infoFor(g, { kind: 'mach', id: tk.id }); if (!re.test(gi.lines[0])) bad.push(`guest ${state}: ${gi.lines[0]}`);
    }
    const r2 = row.slice(); r2[4] = STATES.indexOf('refuse'); applyEarthRow(git, r2); const gi2 = infoFor(g, { kind: 'mach', id: tk.id }); if (!gi2.lines.some((l) => /THE ONE is aboard/.test(l))) bad.push('the guest readout lacks The One: ' + JSON.stringify(gi2.lines));
    r2[13] = 0; applyEarthRow(git, r2); if (infoFor(g, { kind: 'mach', id: tk.id }).lines.some((l) => /THE ONE is aboard/.test(l))) bad.push('the guest still says The One is aboard after the flag cleared');
    g.guestEarth = null; for (let n = 0; n < 3; n++) adv(0.05);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.vscan.guest-hammer-asks-the-host-and-the-scanner-leaves-both-screens', async () => {
    fresh(UP); const bad = []; role('host'); cap(); const e = mk(-8, 7), id = e.id, plus = ofType('ent+').pop(); toGuest([plus]);
    K.equip('hammer'); K.aimDir(e.cx, e.y0 + e.h / 2, e.cz, 1, 2.6); adv(0.05); g.renderer.camera.position.copy(p().eyePos(new V3())); sent.length = 0; g.deconstruct();
    const c = sent.find((m) => m.t === 'cmd' && m.c === 'decon'); if (!c || c.d.id !== id) return 'guest hammer did not ask the host: ' + JSON.stringify(sent.map((m) => m.t + (m.c || '')));
    if (!scans().length) bad.push('the guest removed it on its own');
    done(); for (const x of scans()) g.removeViewEnt(x.id); const raw = { ...json(plus.ent), view: false }; S().entities.push(raw); g.addEntity(raw); role('host'); cap(); g.netMessage(json(c));
    if (scans().length || !ofType('ent-').some((m) => m.id === id)) bad.push('the host did not remove and announce it'); if (S().items.vscan !== 1) bad.push('the item did not come back: ' + JSON.stringify(S().items));
    toGuest([plus, ...sent.filter((m) => m.t === 'ent-')]); if (scans().length) bad.push('the guest still shows it after ent-');
    return bad.length === 0 || bad.join(' || ');
  });
}
