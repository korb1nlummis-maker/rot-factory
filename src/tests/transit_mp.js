// mp.transit.*: doors, lifts and jump pads in multiplayer with no network. One page plays both roles by switching g.net.role and capturing g.netSend.
// The host simulates everything: it moves the leaf, sets the world cells, carries the car, spends the pad's charges and announces ents (ent+), cells and the 0.5 s `transit` row.
// A guest only draws what it is told and asks with `cfg` and `place`; its own player rides and launches from what the host says.
import { kit } from './transit_lib.js';
import * as TR from '../transit.js';
import * as EXT from '../ext.js';
import { infoFor } from '../info.js';
import { RemotePlayer } from '../net.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, adv, craft, V3, toI, toK, cellX, cellZ, plan } = ctx;
  const X = kit(ctx), K = X.K;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); if (g.world) g.world.onSet = null; g.netOut.length = 0; if (g.remote) { g.remote.dispose(g.renderer.scene); g.remote = null; } };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); X.clean(); } });
  const hostWorld = () => { role('host'); cap(); g.world.onSet = (i, j, k, sp, vr) => g.netOut.push(i, j, k, sp, vr); g.netOut.length = 0; };
  const flush = () => { g._nt = 0; g.netUpdate(0.2); };
  const row = () => { g._extRow = 0; EXT.update(g, 0, false); };   // the host's 0.5 s rows, now, without moving anything
  const friend = (x, y, z) => { if (!g.remote) g.remote = new RemotePlayer(g.renderer.scene, 'Friend'); g.remote.pos.set(x, y, z); g.remote.target.set(x, y, z); };
  const I0 = () => toI(-14), K0 = () => toK(3);
  // one of everything on the host: a door half open, an elevator mid-flight with landings and its rails running out, a pad with charges spent, a cushion
  const buildAll = () => {
    const out = {}, i0 = I0(), k0 = K0();
    out.door = X.door(i0, k0, { lock: 'key', auto: false });
    out.lift = X.lift(i0 + 8, k0, { home: 12, depth: 10, top: 18 }); X.tunnel(out.lift, 12, 1, 6); X.tunnel(out.lift, 6, 0, 6); TR.refreshShaft(g, out.lift); out.lift.ex = out.lift.tr;
    out.jump = X.jump(i0 + 20, k0, { ang: 55, hd: 120 }); out.cush = X.cushion(i0 + 28, k0, 0);
    const G = X.powerAt(out.door.px, out.door.pz - 2.0, 2); X.powerCab(out.lift, 1); X.powerAt(out.jump.x - 2.6, out.jump.z, 1);
    p().pos.set(out.door.px, 0, out.door.pz - 12); p().vel.set(0, 0, 0); adv(0.7); void G;
    return out;
  };
  // the states a guest must show: mid motion, frozen in place
  const freeze = (o) => {
    const D = o.door; D.p = 0.37; D.tgt = 1; D.draw = 1; TR.setRows(g, D, TR.freedOf(D.p)); D.st = 'opening';
    const Lf = o.lift; Lf.cy = 5.55; Lf.tg = 6; Lf.mv = -1; Lf.q = [2]; Lf.xt = 1; Lf.ex = Lf.tr - 0.5; const J = o.jump; J.buf = 3; J.cool = 0; J.act = 0;
    row();
  };
  const wipeEnt = (e) => {
    const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); }
    if (e.type === 'door') TR.removeDoor(g, e); else if (e.type === 'plift') TR.removeLift(g, e); else if (e.type === 'callbtn') g.world.reserved.delete(X.idx(e.i, e.j, e.k)); else TR.removeFlat(g, e);
    S().entities = S().entities.filter((x) => x.id !== e.id);
  };
  const reads = (ents) => ents.map((e) => JSON.stringify(infoFor(g, { kind: 'mach', id: e.id })));
  const describe = (e) => { const o = {}; for (const k of ['type', 'ax', 'i0', 'k0', 'j', 'blast', 'lock', 'auto', 'tgt', 'lid', 'i', 'k', 'ang', 'hd', 'rid']) if (e[k] !== undefined) o[k] = e[k]; return o; };

  await guard('mp.transit.door-lift-state', async () => {
    X.setup(); hostWorld(); const bad = [], o = buildAll(); flush();
    const mine = [o.door, o.lift, o.jump, o.cush];
    freeze(o); flush();
    const plus = ofType('ent+').filter((m) => TR.isTransit(m.ent.type)), rows = ofType('xrow').filter((m) => m.k === 'transit'), cells = ofType('cells');
    if (plus.length !== mine.length) bad.push(`the host announced ${plus.length} of ${mine.length} ents`); if (!rows.length) return 'no transit row was sent';
    const hostEnts = mine.map((e) => json(e)), hostRead = reads(mine), hostCells = TR.allDoorCells(o.door).map(([i, j, k]) => [i, j, k, w().get(i, j, k), w().getVr(i, j, k)]);
    const told = new Map(); for (const m of cells) for (let q = 0; q < m.a.length; q += 5) told.set(m.a[q] + ',' + m.a[q + 1] + ',' + m.a[q + 2], [m.a[q + 3], m.a[q + 4]]);
    for (const [i, j, k, sp, vr] of hostCells) { const t = told.get(i + ',' + j + ',' + k); if (!t || t[0] !== sp || t[1] !== vr) { bad.push(`door cell ${i},${j},${k} was not announced right: ${JSON.stringify(t)} vs ${sp}/${vr}`); break; } }
    const msgs = json([...ofType('cells'), ...plus, rows[rows.length - 1]]);
    // the guest: nothing yet, then the host's messages
    for (const e of mine) wipeEnt(e); done(); role('guest'); cap();
    for (const m of msgs) g.netMessage(json(m)); EXT.update(g, 0, true);
    const ge = hostEnts.map((h) => S().entities.find((x) => x.id === h.id));
    ge.forEach((e, n) => { if (!e || !e.view || !g.machines.items.get(hostEnts[n].id)) bad.push(hostEnts[n].type + ' is missing on the guest'); else if (JSON.stringify(describe(e)) !== JSON.stringify(describe(hostEnts[n]))) bad.push(`${hostEnts[n].type} differs: ${JSON.stringify(describe(e))} vs ${JSON.stringify(describe(hostEnts[n]))}`); });
    for (const [i, j, k, sp, vr] of hostCells) if (w().get(i, j, k) !== sp || w().getVr(i, j, k) !== vr) { bad.push(`guest door cell ${i},${j},${k} is ${w().get(i, j, k)}/${w().getVr(i, j, k)}, host ${sp}/${vr}`); break; }
    const D = ge[0], Lf = ge[1], J = ge[2];
    if (D && !(Math.abs(D.p - 0.37) < 0.002 && D.tgt === 1 && D.draw === 1)) bad.push(`door state on the guest: p ${D.p} tgt ${D.tgt} draw ${D.draw}`);
    if (Lf && !(Math.abs(Lf.cy - 5.55) < 0.011 && Lf.tg === 6 && Lf.mv === -1 && Lf.q.length === 1 && Lf.tr === 10 && Math.abs(Lf.ex - 9.5) < 0.11 && Lf.xt === 1 && Lf.sg.length === 3 && Lf.wy === hostEnts[1].wy)) bad.push(`elevator state on the guest: cy ${Lf.cy} tg ${Lf.tg} mv ${Lf.mv} q ${Lf.q} tr ${Lf.tr} ex ${Lf.ex} xt ${Lf.xt} stops ${JSON.stringify(Lf.sg)} why ${Lf.wy}`);
    if (J && !(J.buf === 3 && J.cool === 0 && J.pw > 0.99)) bad.push(`pad state on the guest: buf ${J.buf} cool ${J.cool} pw ${J.pw}`);
    const guestRead = reads(ge.filter(Boolean)); guestRead.forEach((r, n) => { if (r !== hostRead[n]) bad.push(`${hostEnts[n].type} readout differs:\n  guest ${r}\n  host  ${hostRead[n]}`); });
    // a guest never writes the cells of a door and never reserves anything: both come from the host
    const D2 = { id: g.nextId(), type: 'door', ax: 'x', i0: I0() + 8, k0: K0() + 8, j: 0, view: true, p: 0, tgt: 0 }; S().entities.push(D2); g.addEntity(D2); if (X.closedCells(D2) || X.reservedAt(D2.i0, 0, D2.k0)) bad.push('a guest view of a door wrote cells or reserved them'); wipeEnt(D2);
    // the guest's own tick keeps the leaf and the car moving between rows
    const p0 = D.p; EXT.update(g, 0.2, true); if (!(D.p > p0 + 0.1)) bad.push('the guest door did not carry on between rows: ' + D.p); const y0 = Lf.cy; EXT.update(g, 0.2, true); if (!(Lf.cy < y0 - 0.4)) bad.push('the guest cab did not carry on between rows: ' + Lf.cy);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.transit.late-joiner-sees-everything-with-its-state', async () => {
    X.setup(); hostWorld(); const bad = [], o = buildAll(); freeze(o); flush(); const mine = [o.door, o.lift, o.jump, o.cush], hostEnts = mine.map((e) => json(e)), hostRead = reads(mine);
    const hostCells = TR.allDoorCells(o.door).map(([i, j, k]) => [i, j, k, w().get(i, j, k), w().getVr(i, j, k)]);
    cap(); g.sendWorld(); const msgs = json(sent.filter((m) => m.t === 'diff' || m.t === 'ents')); if (!msgs.some((m) => m.t === 'diff') || !msgs.some((m) => m.t === 'ents')) return 'sendWorld sent ' + sent.map((m) => m.t).join();
    row(); const rowMsg = json(sent.filter((m) => m.t === 'xrow' && m.k === 'transit').pop());
    for (const e of mine) wipeEnt(e); done(); role('guest'); cap();
    for (const m of msgs) g.netMessage(json(m)); g.netMessage(json(rowMsg)); EXT.update(g, 0, true);
    for (const [i, j, k, sp, vr] of hostCells) if (w().get(i, j, k) !== sp || w().getVr(i, j, k) !== vr) { bad.push(`late joiner door cell ${i},${j},${k}: ${w().get(i, j, k)} vs ${sp}`); break; }
    const ge = hostEnts.map((h) => S().entities.find((x) => x.id === h.id)); ge.forEach((e, n) => { if (!e || !e.view) bad.push('a late joiner lacks the ' + hostEnts[n].type); });
    const guestRead = reads(ge.filter(Boolean)); guestRead.forEach((r, n) => { if (r !== hostRead[n]) bad.push(`${hostEnts[n].type} readout differs for a late joiner:\n  guest ${r}\n  host  ${hostRead[n]}`); });
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.transit.guest-asks-and-the-host-decides', async () => {
    X.setup(); hostWorld(); const bad = [], o = buildAll(), D = o.door, Lf = o.lift, J = o.jump;
    const guestAsks = (id, patch) => { role('guest'); cap(); const r = g.setCfg(id, patch); const cmd = json(sent.filter((m) => m.t === 'cmd').pop() || null); done(); hostWorld(); return { r, cmd }; };
    const hostRuns = (cmd) => { sent.length = 0; if (!cmd) return null; g.netMessage(json(cmd)); return { toast: ofType('toast')[0] }; };
    // a locked door: the guest is refused, and with a key (items are shared) it opens
    let a = guestAsks(D, { tgt: 1 }); if (!a.r.ok || !a.cmd || a.cmd.c !== 'cfg') bad.push('the guest request did not become a cfg command: ' + JSON.stringify(a)); let h = hostRuns(a.cmd); if (D.tgt !== 0 || !h.toast || !/Door Key/.test(h.toast.text)) bad.push('a locked door opened for a guest, or no toast: ' + D.tgt + ' ' + JSON.stringify(h));
    S().items.doorkey = 1; a = guestAsks(D, { tgt: 1 }); hostRuns(a.cmd); if (D.tgt !== 1) bad.push('with a key the guest could not open it'); delete S().items.doorkey;
    // bad settings are refused whole
    for (const [name, patch] of [['unknown key', { p: 1 }], ['bad lock', { lock: 'laser' }], ['bad target', { tgt: 5 }], ['mixed', { auto: true, lock: 7 }]]) { const before = JSON.stringify([D.p, D.lock, D.auto, D.tgt]); a = guestAsks(D, patch); if (a.r.ok) bad.push(name + ' was accepted by the guest side check'); hostRuns(json({ t: 'cmd', c: 'cfg', d: { id: D.id, patch } })); if (JSON.stringify([D.p, D.lock, D.auto, D.tgt]) !== before) bad.push(name + ' changed the door'); }
    // the elevator: a stop call and the rider keys (stops are the home row 12, the east landing 6 and the bottom 2)
    a = guestAsks(Lf, { call: 6 }); hostRuns(a.cmd); if (Lf.q.join() !== '6' && Lf.tg !== 6) bad.push('the guest call did not reach the elevator: q ' + Lf.q + ' tg ' + Lf.tg); if (Lf.call !== undefined) bad.push('the write only key was left on the ent');
    a = guestAsks(Lf, { call: 3 }); h = hostRuns(a.cmd); if (!h.toast || Lf.q.length > 1) bad.push('a call to a row that is not a stop was taken'); Lf.q = []; Lf.tg = null; Lf.cy = 2 * 0.6;
    a = guestAsks(Lf, { go: 1 }); hostRuns(a.cmd); if (Lf.q.join() !== '6' && Lf.tg !== 6) bad.push('the rider key up did not reach the elevator'); if (Lf.go !== undefined) bad.push('go was left on the ent'); Lf.q = []; Lf.tg = null; Lf.cy = 2 * 0.6;
    a = guestAsks(Lf, { go: -1 }); h = hostRuns(a.cmd); if (!h.toast || !/lowest stop/.test(h.toast.text)) bad.push('down at the bottom: ' + JSON.stringify(h));
    for (const patch of [{ call: 99 }, { call: -1 }, { go: 2 }, { cy: 5 }, { tg: 3 }]) { const before = Lf.cy; hostRuns(json({ t: 'cmd', c: 'cfg', d: { id: Lf.id, patch } })); if (Lf.cy !== before || Lf.tg === 3) bad.push(JSON.stringify(patch) + ' moved the cab'); }
    // the jump pad: angle and heading in their steps only, never charges
    a = guestAsks(J, { ang: 70, hd: 30 }); hostRuns(a.cmd); if (J.ang !== 70 || J.hd !== 30) bad.push('a guest angle change was lost: ' + J.ang + ' ' + J.hd);
    for (const patch of [{ ang: 71 }, { hd: 31 }, { buf: 5 }, { cool: 0 }, { ang: 60, hd: 31 }]) { const before = JSON.stringify([J.ang, J.hd, J.buf, J.cool]); hostRuns(json({ t: 'cmd', c: 'cfg', d: { id: J.id, patch } })); if (JSON.stringify([J.ang, J.hd, J.buf, J.cool]) !== before) bad.push(JSON.stringify(patch) + ' changed the pad'); }
    // an ent that does not exist, and a type with no settings
    h = hostRuns(json({ t: 'cmd', c: 'cfg', d: { id: 424242, patch: { tgt: 1 } } })); if (!h.toast) bad.push('a missing ent gave no toast'); h = hostRuns(json({ t: 'cmd', c: 'cfg', d: { id: o.cush.id, patch: { x: 1 } } })); if (!h.toast) bad.push('a cushion has no settings and said nothing');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.transit.guest-places-and-the-host-checks-it', async () => {
    X.setup(); const bad = [], i = I0(), k = K0();
    craft('door:blast', 1); craft('plift', 1); craft('jump', 1); craft('cushion', 1); K.equip('door');   // the hand ends on the door
    // the guest's plan becomes one `place` command carrying the ent
    role('guest'); cap(); K.aim(i, k, { y: 1.0, back: 3.4 }); const pl = await plan(); if (!pl.ok) { done(); return 'guest plan: ' + pl.why; }
    const n0 = S().entities.length, items0 = S().items.door; g.placeCurrent(g.curTool()); const cmds = sent.filter((m) => m.t === 'cmd');
    if (cmds.length !== 1 || cmds[0].c !== 'place' || cmds[0].d.ent.type !== 'door') bad.push('the door was not one place message: ' + JSON.stringify(sent.map((m) => m.t + (m.c ? ':' + m.c : '')))); if (S().entities.length !== n0 || S().items.door !== items0) bad.push('a guest placed or paid on its own');
    const cmd = json(cmds[0] || {}); done(); hostWorld(); X.clean(); X.setup(); hostWorld(); craft('door', 1); craft('door:blast', 1); craft('plift', 1); craft('jump', 1); craft('cushion', 1);
    g.netMessage(json(cmd)); const D = X.ents('door')[0]; if (!D || !X.closedCells(D) || S().items.door) bad.push('the host did not build the guest door: ' + JSON.stringify(D)); if (ofType('ent+').filter((m) => m.ent.type === 'door').length !== 1) bad.push('the door was not announced');
    // tampering
    const tool = (o = {}) => ({ id: 'door', kind: 'door', ...o }), msg = (t, e) => ({ t: 'cmd', c: 'place', d: { tool: t, ent: e } });
    const free = { type: 'door', ax: 'x', i0: I0() + 12, k0: K0() + 6, j: 0 };
    for (const [name, t, e] of [['float', tool(), { ...free, i0: 5.5 }], ['string', tool(), { ...free, k0: '3' }], ['bad axis', tool(), { ...free, ax: 'q' }], ['negative row', tool(), { ...free, j: -3 }], ['a door in the air', tool(), { ...free, j: 20 }], ['replace a wall that is not there', tool(), { ...free, replaces: 77777 }], ['an elevator id for a door tool', tool({ id: 'plift' }), free], ['a pad with bad angle', tool({ id: 'jump', kind: 'jump' }), { type: 'jump', i0: 5, k0: 5, j: 0, ang: 7 }], ['a call button with no lift', tool({ id: 'callbtn', kind: 'callbtn' }), { type: 'callbtn', lid: 123, i: 5, j: 0, k: 5 }], ['nothing', tool(), null], ['no tool', null, free]]) {
      sent.length = 0; const n1 = S().entities.length, it1 = JSON.stringify(S().items); try { g.netMessage(json(msg(t, e))); } catch (x) { bad.push(name + ' threw ' + x.message); } if (S().entities.length !== n1 || JSON.stringify(S().items) !== it1) bad.push(name + ' changed the world or the items'); }
    // a message that claims a blast door with the plain door item is built as the item says
    sent.length = 0; S().items.door = 1; g.netMessage(json(msg(tool(), { ...free, blast: true, lock: 'power', tgt: 1, p: 1 }))); const D2 = X.ents('door').find((e) => e.i0 === free.i0); if (!D2 || D2.blast || D2.lock !== 'none' || D2.p !== 0 || D2.tgt !== 0) bad.push('the message chose blast, the lock or the state: ' + JSON.stringify(D2));
    // plush in the way is refused with a toast
    sent.length = 0; S().items.door = 1; w().setCell(free.i0 + 12 + 1, 1, free.k0, 2, 0); const n2 = S().entities.length; g.netMessage(json(msg(tool(), { ...free, i0: free.i0 + 12 }))); if (S().entities.length !== n2 || !ofType('toast').length) bad.push('plush in the way was not refused with a toast'); w().setCell(free.i0 + 12 + 1, 1, free.k0, 0, 0);
    // an elevator built from a message takes only its place: rails, stops, a reach or a cut that the message claims are not believed
    sent.length = 0; g.netMessage(json(msg(tool({ id: 'plift', kind: 'plift' }), { type: 'plift', i0: I0() - 4, k0: K0() + 6, j: 0, tr: 30, ex: 30, cy: 5, sg: [[0, 0, 0]], cut: 4, wy: 'cap' }))); const Lf = X.ents('plift')[0];
    if (!Lf) bad.push('the guest elevator was not built'); else if (Lf.tr !== 0 || Lf.ex !== 0 || Lf.cy !== 0 || Lf.cut || Lf.wy !== 'bottom' && Lf.wy !== 'home' && Lf.wy !== 'floor' && Lf.wy !== 'blocked') bad.push('the elevator took more than its place from the message: ' + JSON.stringify({ tr: Lf.tr, ex: Lf.ex, cy: Lf.cy, cut: Lf.cut, wy: Lf.wy }));
    // the old call button cannot be forged
    sent.length = 0; craft('callbtn', 1); const nb0 = X.ents('callbtn').length; g.netMessage(json(msg(tool({ id: 'callbtn', kind: 'callbtn' }), { type: 'callbtn', lid: Lf ? Lf.id : 0, i: I0() - 4, j: 0, k: K0() + 6 }))); if (X.ents('callbtn').length !== nb0 || !ofType('toast').length) bad.push('a forged call button was built or gave no toast');
    // a jump pad built from a message takes only its angle and heading
    sent.length = 0; const jp = { type: 'jump', i0: I0() + 20, k0: K0() + 6, j: 0, ang: 35, hd: 120, buf: 0, cool: 99, on: false }; g.netMessage(json(msg(tool({ id: 'jump', kind: 'jump' }), jp))); const J = X.ents('jump')[0]; if (!J || J.ang !== 35 || J.hd !== 120 || J.buf !== 5 || J.cool !== 0 || J.on !== true) bad.push('the pad took more than its angle: ' + JSON.stringify(J));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.transit.guest-hammer-takes-a-door-down-on-the-host', async () => {
    X.setup(); hostWorld(); const bad = [], o = buildAll(); S().items = {};
    role('guest'); cap(); g.cmd('decon', { kind: 'mach', id: o.door.id }); const cmd = json(sent.filter((m) => m.t === 'cmd').pop()); done(); hostWorld(); sent.length = 0;
    g.netMessage(json(cmd)); if (g.machines.items.has(o.door.id) || !X.openCells(o.door) || S().items.door !== 1) bad.push('the host did not take the door down: ' + JSON.stringify(S().items)); if (!ofType('ent-').some((m) => m.id === o.door.id)) bad.push('the guest was not told');
    // taking the elevator down hands back the item and the cab's reserved box
    sent.length = 0; g.netMessage(json({ t: 'cmd', c: 'decon', d: { kind: 'mach', id: o.lift.id } })); if (X.ents('plift').length || S().items.plift !== 1 || X.reservedAt(o.lift.i0 + 1, 12, o.lift.k0 + 1)) bad.push('elevator hammer: ' + JSON.stringify(S().items)); if (!ofType('ent-').some((m) => m.id === o.lift.id)) bad.push('the guest was not told the elevator was gone');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.transit.the-friend-opens-doors-and-blocks-them-and-the-cab', async () => {
    X.setup(); hostWorld(); const bad = [], i0 = I0(), k0 = K0();
    const D = X.door(i0, k0, { auto: true }); X.powerAt(D.px, D.pz - 2.0, 2); p().pos.set(D.px, 0, D.pz - 12); adv(0.7);
    // the friend walks up (the host sees them through the position messages): the sensor opens the door for them
    friend(D.px, 0, D.pz - 2.0); adv(1.2); if (D.p !== 1 || !X.openCells(D)) bad.push('the sensor did not open for the friend: p ' + D.p);
    friend(D.px, 0, D.pz - 8); adv(3.2); if (D.p !== 0 || !X.closedCells(D)) bad.push('the door did not close behind the friend: p ' + D.p);
    // the friend stands in the doorway: it will not close on them
    g.setCfg(D, { auto: false, tgt: 1 }); adv(1.2); friend(D.px, 0, D.pz); g.setCfg(D, { tgt: 0 }); let min = 1; for (let q = 0; q < 40; q++) { adv(0.05); min = Math.min(min, D.p); } if (min < 0.3 || D.blk !== 'person') bad.push(`the door closed on the friend: lowest ${min.toFixed(2)} blk ${D.blk}`);
    // a friend under the cab stops it: the cab comes down on a person only as far as 2.2 m over their head
    const Lf = X.lift(i0 + 8, k0, { home: 12, depth: 10, top: 18 }); X.powerCab(Lf, 2); adv(0.6); friend(D.px, 0, D.pz - 8); TR.requestFloor(g, Lf, 2); adv(3.4); if (Math.abs(Lf.cy - 1.2) > 1e-6) bad.push('setup: cab at ' + Lf.cy);
    TR.requestFloor(g, Lf, 12); adv(4.0); if (Math.abs(Lf.cy - 7.2) > 1e-6) bad.push('setup: the cab did not go home: ' + Lf.cy);
    friend(Lf.px, 1.2, Lf.pz); TR.requestFloor(g, Lf, 2); adv(2.4); if (!Lf.blk || !(Lf.cy > 1.2 + 1.9 && Lf.cy < 1.2 + 2.7)) bad.push(`the cab came down on the friend: cy ${Lf.cy.toFixed(2)} blk ${Lf.blk}`);
    friend(Lf.px - 6, 0, Lf.pz - 6); adv(2.0); if (Math.abs(Lf.cy - 1.2) > 1e-6) bad.push('the cab did not go on once the friend left: ' + Lf.cy);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.transit.jump-pad-throws-the-friend-through-the-host', async () => {
    X.setup(); hostWorld(); const bad = [], J = X.jump(I0(), K0(), { ang: 40, hd: 270 }); X.powerAt(J.x - 2.6, J.z, 2); p().pos.set(J.x + 8, 0, J.z + 8); adv(0.8);
    // the friend steps on: the host spends a charge and sends the launch
    friend(J.x, 0, J.z); sent.length = 0; TR.hostTick(g, 1 / 60); const ev = ofType('xrow').filter((m) => m.k === 'transit' && m.d.ev);
    if (ev.length !== 1 || ev[0].d.ev.k !== 'launch' || ev[0].d.ev.id !== J.id || J.buf !== 4) bad.push('the host did not send exactly one launch and spend one charge: ' + JSON.stringify(ev) + ' buf ' + J.buf);
    const want = TR.launchVel(J), v = ev[0] && ev[0].d.ev; if (v && (Math.abs(v.vx - want.vx) > 0.001 || Math.abs(v.vy - want.vy) > 0.001 || Math.abs(v.vz - want.vz) > 0.001)) bad.push('the launch velocity differs from the pad: ' + JSON.stringify(v));
    // standing on it does not fire it again for a moment (the lock), then again
    sent.length = 0; for (let q = 0; q < 20; q++) TR.hostTick(g, 1 / 60); if (J.buf !== 4) bad.push('fired again inside the lock: buf ' + J.buf); adv(0.9); friend(J.x, 0, J.z); sent.length = 0; TR.hostTick(g, 1 / 60); if (J.buf !== 3) bad.push('did not fire again after the lock: buf ' + J.buf);
    // the guest side: its own player is thrown when the host says so and it is near the pad
    const msg = json(ev[0]); done(); role('guest'); cap(); p().pos.set(J.x + 0.4, 0, J.z - 0.2); p().vel.set(0, 0, 0); p().flight = 0; g.netMessage(json(msg));
    if (!(p().flight > 0 && p().launched && Math.abs(p().vel.x - v.vx) < 0.001 && Math.abs(p().vel.y - v.vy) < 0.001)) bad.push('the guest player was not thrown: flight ' + p().flight + ' vel ' + p().vel.x.toFixed(2));
    p().flight = 0; p().launched = false; p().vel.set(0, 0, 0); p().pos.set(J.x + 9, 0, J.z); g.netMessage(json(msg)); if (p().flight > 0) bad.push('a guest far from the pad was thrown');
    // bad events are ignored
    for (const ev2 of [{ k: 'launch', id: J.id, vx: 99, vy: 0, vz: 0 }, { k: 'launch', id: J.id, vx: NaN, vy: 1, vz: 1 }, { k: 'launch', id: 777777, vx: 1, vy: 1, vz: 1 }, { k: 'launch', id: J.id, vx: '5', vy: 1, vz: 1 }, { k: 'boom' }, 7, null]) { p().pos.set(J.x, 0, J.z); p().flight = 0; try { g.netMessage({ t: 'xrow', k: 'transit', d: { ev: ev2 } }); } catch (x) { bad.push('a bad event threw ' + x.message); } if (p().flight > 0) bad.push('a bad event threw the player: ' + JSON.stringify(ev2)); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.transit.guest-rides-the-cab-the-host-carries', async () => {
    X.setup(); hostWorld(); const bad = [], Lf = X.lift(I0(), K0(), { home: 12, depth: 10, top: 18 }); X.powerCab(Lf, 2); p().pos.set(Lf.px - 9, 0, Lf.pz - 9); adv(0.7);
    TR.requestFloor(g, Lf, 2); adv(0.9); const hostRow = () => { sent.length = 0; row(); return json(ofType('xrow').filter((m) => m.k === 'transit').pop()); };
    const r1 = hostRow(); const hostY = Lf.cy; done(); role('guest'); cap();
    // the guest's copy of the elevator: same ent, the host's numbers
    const copy = json(Lf); Lf.cy = 7.2; Lf.tg = null; Lf.mv = 0; g.netMessage(json(r1)); if (Math.abs(Lf.cy - hostY) > 0.4 && Math.abs(Lf.cy - hostY) > 0.011) bad.push(`the row did not bring the cab to ${hostY.toFixed(2)}: ${Lf.cy}`); Lf.cy = hostY; Lf.tg = copy.tg; Lf.mv = -1;
    // the guest's player in the cab goes down with it, off the guest's own extrapolation
    p().pos.set(Lf.px, Lf.cy, Lf.pz); p().vel.set(0, 0, 0); p().liftId = 0; X.stepPlayer(0.1); EXT.update(g, 0.01, true); if (p().liftId !== Lf.id) bad.push('the guest is not in the cab: liftId ' + p().liftId);
    const y0 = p().pos.y; for (let q = 0; q < 20; q++) { EXT.update(g, 1 / 60, true); X.stepPlayer(1 / 60); } if (!(p().pos.y < y0 - 0.5) || Math.abs(p().pos.y - Lf.cy) > 0.05) bad.push(`the guest did not ride: y ${p().pos.y.toFixed(2)} cab ${Lf.cy.toFixed(2)} from ${y0.toFixed(2)}`);
    // the call goes through the host: a guest asking for a stop sends a cfg command
    cap(); const r = g.setCfg(Lf, { call: 12 }); if (!r.ok || !sent.some((m) => m.t === 'cmd' && m.c === 'cfg' && m.d.patch.call === 12)) bad.push('the guest call did not become a cfg command: ' + JSON.stringify(r));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.transit.rows-are-silent-when-nothing-is-built-and-bad-rows-are-harmless', async () => {
    X.setup(); hostWorld(); const bad = []; sent.length = 0; row(); if (ofType('xrow').some((m) => m.k === 'transit')) bad.push('a transit row went out with nothing built');
    const o = buildAll(); sent.length = 0; row(); const rr = ofType('xrow').filter((m) => m.k === 'transit'); if (rr.length !== 1) bad.push('rows ' + rr.length); const d = rr[0] && rr[0].d; if (!d || d.dr.length !== 1 || d.lf.length !== 1 || d.jp.length !== 1) bad.push('row content ' + JSON.stringify(d));
    if (JSON.stringify(d).length > 900) bad.push('the row is not small: ' + JSON.stringify(d).length + ' bytes');
    done(); role('guest'); cap();
    for (const junk of [null, 7, 'x', [], { dr: 'a' }, { dr: [[o.door.id]] }, { dr: [[o.door.id, 'x', 'y', 'z', 'w']] }, { dr: [[999999, 1, 1, 1, 1]] }, { lf: [[o.lift.id, NaN, 3, 9, -5, 'q']] }, { lf: [null, 5, 'z'] }, { lf: [[o.lift.id, 5, 3, 0, 100, 0, 0, 0, 'x', -9, 99, 'q', NaN, 'z', 'junk']] }, { lf: [[o.lift.id, 5, 3, 0, 100, 0, 0, 0, 9999, 99999, 77, 1e9, -5, 1e9, [1, 2, 3, 99, 9, 9, NaN, 1, 1, 'a', 2]]] }, { jp: [[o.jump.id, 99, -4, 400, 1, 0]] }, { jp: [[o.jump.id, 'a']] }, { ev: { k: 'launch' } }, { dr: [[o.cush.id, 1, 1, 1, 1]] }]) { try { g.netMessage({ t: 'xrow', k: 'transit', d: junk }); } catch (x) { bad.push('a bad row threw: ' + x.message + ' for ' + JSON.stringify(junk)); } }
    const D = o.door, Lf = o.lift, J = o.jump; if (!(D.p >= 0 && D.p <= 1) || !Number.isFinite(Lf.cy) || !(J.buf >= 0 && J.buf <= 5) || !(J.cool >= 0) || !(J.pw >= 0 && J.pw <= 1) || !(D.pw >= 0 && D.pw <= 1) || !(Lf.mv >= -1 && Lf.mv <= 1) || !(Lf.tr >= 0 && Lf.tr <= 72) || !(Lf.ex >= 0 && Lf.ex <= Lf.tr) || !Array.isArray(Lf.sg) || !Lf.sg.length || Lf.sg.some((q) => !(q[0] >= 0 && q[0] <= 72 && q[1] >= -1 && q[1] <= 3 && q[2] >= 0 && q[2] <= 3))) bad.push('a bad row left out of range values: ' + JSON.stringify({ p: D.p, cy: Lf.cy, buf: J.buf, cool: J.cool, pw: J.pw, mv: Lf.mv }));
    return bad.length === 0 || bad.join(' || ');
  });
}
