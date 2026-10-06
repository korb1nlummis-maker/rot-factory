// mp.belts.* (wave 1A): marks, lifts, underground pairs, Lift Frames and planned lines on both screens, with no network (one page plays both roles by switching g.net.role).
// The host builds and simulates; the guest only draws what it is told, asks for changes with commands, and never trusts its own copy.
import { makeBeltKit, UP_ALL, UP_BASE } from './belts_lib.js';
import * as BP from '../beltplan.js';
import { tierOf, framesNeeded } from '../beltdata.js';
import { BULK } from '../plushdata.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T: T0, g, S, w, p, L, tiles, toI, toK, cellX, cellZ } = ctx;
  const B = makeBeltKit(ctx), K = B.K, json = B.json;
  const T = B.T; void T0;
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); B.cleanup(); } });
  const view = (t) => JSON.stringify({ i: t.i, j: t.j, k: t.k, dir: t.dir, rise: t.rise || 0, tier: t.tier || 0, lift: t.lift || null, ug: t.ug || null });
  const views = () => { const o = {}; for (const t of tiles()) if (t.type === 'belt' && !t.free) o[t.id] = view(t); return o; };   // (the Welcome Gate is the world's, not the test's)
  const diffViews = (a, b) => { const bad = []; for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[id] !== b[id]) bad.push(`tile ${id}: host ${a[id]} guest ${b[id]}`); return bad; };
  const frames = () => [...g.machines.items.values()].filter((it) => it.ent.type === 'liftframe').map((it) => it.ent.id + ':' + it.ent.x.toFixed(2) + ',' + it.ent.z.toFixed(2)).sort().join();
  const toGuest = (msgs, up = UP_ALL) => { done(); B.setup(up); role('guest'); cap(); for (const m of msgs) g.netMessage(json(m)); };
  const cellsOfLifts = () => [...L().cols.keys()].sort((a, b) => a - b).join();
  const itemsAt = () => { const a = []; L().forEachItem((it, x, y, z) => a.push([+x.toFixed(3), +y.toFixed(3), +z.toFixed(3)])); return a.sort((u, v) => u[0] - v[0] || u[1] - v[1] || u[2] - v[2]); };

  // a host world with every new part: a Mk3 line with a bend, a 10 cell Mk3 lift with its frame, and an underground pair
  const buildHost = () => {
    const i0 = toI(-11), k0 = toK(0.3), made = {};
    made.line = B.lay(2, 4, i0, k0, 0); made.turn = B.lay(2, 3, i0 + 4, k0, 1);
    B.floorAt(i0 + 3, 9, k0 + 6);
    made.lift = g.placeEntity('belt', { i: i0 + 2, j: 0, k: k0 + 6, dir: 0, rise: 0, lift: { h: 10 }, tier: 2, items: [] }, { quiet: true, rebuild: false });
    made.frame = B.frameAt(i0 + 2, k0 + 7);
    made.top = B.lay(2, 1, i0 + 3, k0 + 6, 0, 10)[0];
    made.entry = g.placeEntity('belt', { i: i0, j: 0, k: k0 - 4, dir: 0, rise: 0, tier: 1, items: [], ug: { role: 'in', pair: null, span: 0 } }, { quiet: true, rebuild: false });
    made.exit = g.placeEntity('belt', { i: i0 + 5, j: 0, k: k0 - 4, dir: 0, rise: 0, tier: 1, items: [], ug: { role: 'out', pair: made.entry.id, span: 5 } }, { quiet: true, rebuild: false });
    L().dirty = true; made.i0 = i0; made.k0 = k0;
    return made;
  };

  await guard('mp.belts.tier-lift-ug-sync', async () => {
    B.setup(UP_ALL); role('host'); cap(); const m = buildHost(); L().update(0.05);
    const host = { views: views(), beds: L().bedMesh.count, rails: L().railMesh.count, corners: L().cornerN, cols: cellsOfLifts(), frames: frames() };
    const plus = ofType('ent+').length; if (plus < 12) return 'host announced only ' + plus + ' ents';
    const sentEnts = sent.slice();
    toGuest(sentEnts); L().update(0.05);
    const bad = diffViews(host.views, views());
    if (L().bedMesh.count !== host.beds || L().railMesh.count !== host.rails || L().cornerN !== host.corners) bad.push(`meshes: beds ${L().bedMesh.count}/${host.beds}, rails ${L().railMesh.count}/${host.rails}, corners ${L().cornerN}/${host.corners}`);
    if (cellsOfLifts() !== host.cols) bad.push('shaft cells differ'); if (frames() !== host.frames) bad.push('lift frames differ: ' + frames() + ' vs ' + host.frames);
    const lift = L().byId.get(m.lift.id); if (!lift || !L().objs.has(lift.id)) bad.push('the guest has no lift mesh'); else if (!L().liftSupport(lift).ok) bad.push('the guest does not see the lift as supported');
    const entry = L().byId.get(m.entry.id), exit = L().byId.get(m.exit.id); if (!entry || entry.ug.pair !== exit.id || exit.ug.pair !== entry.id || entry.ug.span !== 5) bad.push('the pair on the guest: ' + JSON.stringify([entry && entry.ug, exit && exit.ug]));
    // the plush never travel in an ent message
    for (const e of ofType('ent+')) if (e.ent.items !== undefined || e.ent.cache !== undefined) bad.push('transient fields in ent+: ' + Object.keys(e.ent).join());
    // the readouts match on both screens
    for (const id of [m.lift.id, m.entry.id, m.line[1].id]) { const a = infoFor(g, { kind: 'tile', id }); if (!a || /undefined|NaN/.test(a.title + a.lines.join())) bad.push('guest readout ' + id + ': ' + (a && a.lines.join('|'))); }
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.belts.items-sit-at-the-same-spot-on-a-lift-and-under-the-ground', async () => {
    B.setup(UP_BASE); role('host'); cap(); const m = buildHost(); const i0 = m.i0;
    m.lift.items = [{ sp: B.sp + 2, vr: 0, t: 10.4 }, { sp: B.sp + 1, vr: 0, t: 4.6 }, { sp: B.sp, vr: 0, t: 0.3 }];
    m.entry.items = [{ sp: B.sp + 1, vr: 0, t: 3.3 }, { sp: B.sp, vr: 0, t: 0.3 }]; m.exit.items = [{ sp: B.sp, vr: 0, t: 0.8 }, { sp: B.sp + 2, vr: 0, t: 0.2 }];
    m.turn[0].items = [{ sp: B.sp + 3, vr: 0, t: 0.4 }]; m.line[2].items = [{ sp: B.sp + 4, vr: 0, t: 0.7 }];
    p().pos.set(cellX(i0), 0, cellZ(m.k0)); const plusMsgs = sent.slice(); sent = []; g.remote = { pos: p().pos.clone() }; g.sendDyn(); g.remote = null; const dyn = json(ofType('dyn')[0]);
    L().rebuildBelts(); const hostPos = itemsAt();
    if (hostPos.length !== 3 + 1 + 1 + 1 + 1) return 'host shows ' + hostPos.length + ' items (a plush under the ground is not drawn)';
    toGuest(plusMsgs, UP_BASE); L().update(0.05); g.applyDyn(dyn); const guestPos = itemsAt();
    if (guestPos.length !== hostPos.length) return `guest shows ${guestPos.length} items, host ${hostPos.length}`;
    for (let n = 0; n < hostPos.length; n++) for (let q = 0; q < 3; q++) if (Math.abs(hostPos[n][q] - guestPos[n][q]) > 0.02) return `item ${n} differs: host ${hostPos[n]} guest ${guestPos[n]}`;
    // the guest moves them on its own between rows at the host's speeds: after half a second both agree on where the lift plush are
    const lift = L().byId.get(m.lift.id); const t0 = lift.items.map((x) => x.t);
    L().visualOnly = true; for (let q = 0; q < 10; q++) { g.time += 0.05; for (const t of tiles()) if (t.type === 'belt') t.pw = 1; L().update(0.05); } L().visualOnly = false;
    const moved = lift.items.map((x, n) => x.t - t0[n]); const want = 1.6 * 2.25 * 0.5; if (Math.abs(moved[2] - want) > 0.1) return 'the guest moved the lowest lift plush ' + moved[2].toFixed(2) + ', wanted ' + want.toFixed(2);
    return true;
  });

  await guard('mp.belts.guest-places-a-lift-an-underground-end-and-an-upgrade-through-the-host', async () => {
    B.setup(UP_ALL); const bad = []; const k0 = toK(0.3);
    // ---- a lift
    g.liftH = 6; S().items.lift = 8; g.rebuildTools(); role('guest'); cap();
    const r = await K.put('lift', { x: -6.6, z: 1.2, dir: 0 }); if (!r.ok) return 'guest plan: ' + r.why;
    const cmd = sent.find((x) => x.t === 'cmd' && x.c === 'place'); if (!cmd || cmd.d.tool.kind !== 'lift' || cmd.d.tool.id !== 'lift' || cmd.d.ent.lift.h !== 6) return 'no place command: ' + JSON.stringify(cmd);
    if (S().entities.some((e) => e.lift) || S().items.lift !== 8) bad.push('the guest changed its own world before the host answered');
    done(); role('host'); cap(); g.netMessage(json(cmd)); const plus = ofType('ent+').find((x) => x.ent.lift);
    if (!plus || plus.ent.lift.h !== 6 || plus.ent.type !== 'belt') bad.push('the host did not announce the lift: ' + JSON.stringify(ofType('ent+').map((x) => x.ent.type)));
    if (S().items.lift !== 2) bad.push('the host took ' + (8 - S().items.lift) + ' pieces, wanted 6');
    const liftEnt = plus && L().byId.get(plus.ent.id);
    // ---- an underground pair (second end through the same path)
    S().items.ug = 4; g.rebuildTools(); done(); role('guest'); cap();
    const a = await K.put('ug', { x: -10.2, z: -1.2, dir: 0 }); const ca = sent.find((x) => x.c === 'place');
    done(); role('host'); cap(); if (ca) g.netMessage(json(ca)); const entry = ofType('ent+').map((x) => x.ent).find((x) => x.ug);
    done(); role('guest'); cap(); const b = await K.put('ug', { x: -8.4, z: -1.2, dir: 0 }); const cb = sent.find((x) => x.c === 'place');
    done(); role('host'); cap(); if (cb) g.netMessage(json(cb)); const exit = ofType('ent+').map((x) => x.ent).find((x) => x.ug && x.ug.role === 'out');
    if (!a.ok || !b.ok || !entry || !exit || exit.ug.pair !== entry.id || exit.ug.span !== 3) bad.push('pair: ' + JSON.stringify([a.ok, b.ok, entry && entry.ug, exit && exit.ug]));
    const hostEntry = entry && L().byId.get(entry.id); if (hostEntry && hostEntry.ug.pair !== (exit && exit.id)) bad.push('the host entry is not linked');
    if (!ofType('ent-').some((x) => entry && x.id === entry.id)) bad.push('the host did not re-announce the entry that got its exit (ent- then ent+)');
    // ---- an upgrade in place
    B.lay(0, 1, toI(-4), k0, 0); const tile = L().tileAt(toI(-4), 0, k0); S().items['belt:2'] = 3; g.rebuildTools(); done(); role('guest'); cap();
    const u = await K.put('belt:2', { x: cellX(toI(-4)), z: cellZ(k0), dir: 0 }); const cu = sent.find((x) => x.c === 'place'); if (!u.ok || !cu || cu.d.ent.type !== 'tierbelt') return bad.concat('upgrade command: ' + JSON.stringify(cu && cu.d.ent)).join('; ');
    done(); role('host'); cap(); g.netMessage(json(cu));
    if (tile.tier !== 2 || S().items.belt !== 1 || S().items['belt:2'] !== 2) bad.push(`the host after the upgrade: tier ${tile.tier}, items ${JSON.stringify(S().items)}`);
    const minus = sent.findIndex((x) => x.t === 'ent-' && x.id === tile.id), plus2 = sent.findIndex((x) => x.t === 'ent+' && x.ent.id === tile.id); if (minus < 0 || plus2 < minus || sent[plus2].ent.tier !== 2) bad.push('the host must send ent- then ent+ with the new mark');
    void liftEnt;
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.belts.a-guest-cannot-forge-lifts-ends-or-lines', async () => {
    B.setup(UP_ALL); const bad = []; role('host'); cap(); const i = toI(-8), k = toK(2.4);
    S().items.lift = 5; S().items.ug = 2; S().items['belt:1'] = 1;
    const n0 = S().entities.length, items0 = JSON.stringify(S().items), money0 = S().money;
    const place = (tool, ent) => { sent = []; g.netMessage({ t: 'cmd', c: 'place', d: json({ tool, ent }) }); };
    const lift = (h, extra = {}) => ({ type: 'belt', i, j: 0, k, dir: 0, rise: 0, lift: { h }, ...extra });
    const cases = {
      'a lift taller than 24': [{ id: 'lift', kind: 'lift' }, lift(40)], 'a lift of 1': [{ id: 'lift', kind: 'lift' }, lift(1)], 'a fractional lift': [{ id: 'lift', kind: 'lift' }, lift(2.5)], 'a text height': [{ id: 'lift', kind: 'lift' }, lift('9')],
      'more pieces than held': [{ id: 'lift', kind: 'lift' }, lift(8)], 'a bad direction': [{ id: 'lift', kind: 'lift' }, lift(3, { dir: 9 })], 'a bad cell': [{ id: 'lift', kind: 'lift' }, lift(3, { i: 'x' })], 'a cell outside the hall': [{ id: 'lift', kind: 'lift' }, lift(3, { i: -4 })],
      'no lift field': [{ id: 'lift', kind: 'lift' }, { type: 'belt', i, j: 0, k, dir: 0 }], 'a lift field that is not an object': [{ id: 'lift', kind: 'lift' }, { type: 'belt', i, j: 0, k, dir: 0, lift: 5 }],
      'a belt id for a lift tool': [{ id: 'belt', kind: 'lift' }, lift(3)], 'a mark it does not own': [{ id: 'lift:5', kind: 'lift' }, lift(3)], 'a lift item for a belt tool': [{ id: 'lift', kind: 'belt' }, lift(3)],
      'an end with a made up partner': [{ id: 'ug', kind: 'ug' }, { type: 'belt', i, j: 0, k, dir: 0, ug: { role: 'out', pair: 123456, span: 3 } }], 'an end with a bad role': [{ id: 'ug', kind: 'ug' }, { type: 'belt', i, j: 0, k, dir: 0, ug: { role: 'both', pair: null } }],
      'an end with no ug field': [{ id: 'ug', kind: 'ug' }, { type: 'belt', i, j: 0, k, dir: 0 }], 'an entry that names a partner': [{ id: 'ug', kind: 'ug' }, { type: 'belt', i, j: 0, k, dir: 0, ug: { role: 'in', pair: 77, span: 3 } }],
      'an upgrade of nothing': [{ id: 'belt:1', kind: 'belt' }, { type: 'tierbelt', id: 987654, i, j: 0, k, dir: 0, rise: 0, tier: 1 }], 'an upgrade with no tool mark': [{ id: 'belt', kind: 'belt' }, { type: 'tierbelt', id: 987654, i, j: 0, k, dir: 0, rise: 0, tier: 1 }],
      'a frame for a lift tool': [{ id: 'lift', kind: 'liftframe' }, { type: 'liftframe', i, j: 0, k }], 'a frame nowhere': [{ id: 'liftframe', kind: 'liftframe' }, { type: 'liftframe', i: 'q', j: 0, k }],
    };
    for (const [name, [tool, ent]] of Object.entries(cases)) { place(tool, ent); if (S().entities.length !== n0 || JSON.stringify(S().items) !== items0) bad.push(name + ' changed the world: ' + S().entities.length + ' ents, ' + JSON.stringify(S().items)); if (ofType('ent+').length) bad.push(name + ' was announced'); }
    // one plain, valid request still works, and cannot be repeated onto the same cell
    place({ id: 'lift', kind: 'lift' }, lift(5)); if (S().entities.length !== n0 + 1 || (S().items.lift || 0) !== 0) bad.push('a valid lift of 5 was not placed: ' + S().entities.length + ' ' + JSON.stringify(S().items));
    S().items.lift = 5; place({ id: 'lift', kind: 'lift' }, lift(5)); if (S().entities.length !== n0 + 1) bad.push('a second lift went onto the same cell');
    if (S().money !== money0) bad.push('money changed');
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.belts.guest-planner-line-is-laid-by-the-host-and-reaches-the-guest', async () => {
    B.setup(UP_ALL); const bad = []; const i0 = toI(-11), k0 = toK(0.3) + 5; S().money = 1e12; g.craftItem('belt:1', 3); K.equip('belt:1');
    role('guest'); cap(); g.onKey({ code: 'Period', repeat: false, preventDefault() {} }, true);
    const aim = async (i, k) => { K.aimDir(cellX(i), 0, cellZ(k), 0, 2.0); return ctx.plan(); };
    let pl = await aim(i0, k0); if (!pl.ok) return 'guest start: ' + pl.why; g.placeCurrent(g.curTool());
    pl = await aim(i0 + 7, k0 + 3); if (!pl.ok || !pl.route) return 'guest line: ' + pl.why; const n0 = S().entities.length; g.placeCurrent(g.curTool());
    const cmd = sent.find((x) => x.t === 'cmd' && x.c === 'bplan'); if (!cmd) return 'no bplan command: ' + JSON.stringify(sent.map((x) => x.t));
    if (cmd.d.tiles.length !== 11 || cmd.d.tier !== 1) bad.push('command: ' + cmd.d.tiles.length + ' tiles, tier ' + cmd.d.tier);
    if (S().entities.length !== n0) bad.push('the guest placed tiles itself');
    done(); role('host'); cap(); const items0 = S().items['belt:1'], m0 = S().money; g.netMessage(json(cmd));
    const plus = ofType('ent+').filter((x) => x.ent.type === 'belt'); if (plus.length !== 11) bad.push('the host announced ' + plus.length + ' tiles');
    if (S().items['belt:1'] !== undefined || m0 - S().money !== 8 * 12 * 3) bad.push(`the host charged ${m0 - S().money} and kept ${S().items['belt:1']} of ${items0} held (wanted 8 x 36)`);
    const host = views(); toGuest(sent); const g2 = views(); bad.push(...diffViews(host, g2));
    // the guest's own tiles come from the host: every one marked Mk2
    { const off = tiles().filter((t) => t.type === 'belt' && !t.free && !(t.view && tierOf(t) === 1)); if (off.length) bad.push(`${off.length} guest tiles are not host views of Mk2, e.g. ${JSON.stringify({ id: off[0].id, view: off[0].view, tier: off[0].tier, rise: off[0].rise })}`); }
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.belts.late-joiner-gets-every-mark-lift-and-underground', async () => {
    B.setup(UP_ALL); role('host'); cap(); const m = buildHost(); const host = views(), fr = frames();
    sent = []; g.sendWorld(); const ents = sent.filter((x) => x.t === 'ents'); if (!ents.length) return 'sendWorld sent no ents';
    toGuest(ents); L().update(0.05); const bad = diffViews(host, views()); if (frames() !== fr) bad.push('frames differ: ' + frames());
    const lift = L().byId.get(m.lift.id); if (!lift || !lift.lift || lift.lift.h !== 10 || lift.tier !== 2 || !L().objs.has(lift.id)) bad.push('the lift on the late joiner');
    if (framesNeeded(10) !== 1 || !L().liftSupport(lift).ok) bad.push('the late joiner cannot see the frame');
    const exit = L().byId.get(m.exit.id), entry = L().byId.get(m.entry.id); if (!exit || !entry || entry.ug.pair !== exit.id || exit.ug.pair !== entry.id) bad.push('the pair did not come through the ents batch');
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.belts.hammering-an-underground-end-or-a-lift-reaches-the-guest', async () => {
    B.setup(UP_ALL); role('host'); cap(); const m = buildHost(); const plusAll = sent.slice(); L().update(0.05);
    sent = []; g.doDecon({ kind: 'tile', id: m.exit.id }); const msgs = sent.slice();
    if (!msgs.some((x) => x.t === 'ent-' && x.id === m.exit.id)) return 'no ent- for the exit';
    if (!msgs.some((x) => x.t === 'ent+' && x.ent.id === m.entry.id && x.ent.ug.pair === null)) return 'the entry was not re-announced unpaired: ' + JSON.stringify(msgs.map((x) => x.t));
    sent = []; g.doDecon({ kind: 'tile', id: m.lift.id }); const msgs2 = sent.slice(); if (!msgs2.some((x) => x.t === 'ent-' && x.id === m.lift.id)) return 'no ent- for the lift';
    const hostCols = L().cols.size, hostViews = views();
    toGuest([...plusAll, ...msgs, ...msgs2]); L().update(0.05);
    const bad = diffViews(hostViews, views()); if (L().cols.size !== hostCols) bad.push(`shaft cells ${L().cols.size} vs host ${hostCols}`);
    const entry = L().byId.get(m.entry.id); if (!entry || entry.ug.pair !== null) bad.push('the guest entry kept its pair');
    return bad.length === 0 || bad.join('; ');
  });
}
