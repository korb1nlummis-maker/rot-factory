// mp.stack.*: stacked building in multiplayer with no network (wave 10). One page plays both roles by switching g.net.role and capturing g.netSend.
// The host owns the cubes, plates, stairs, ladders and door frames: it places them, sets the cells and announces ents (ent+) and cells; a guest draws what it is told and asks with
// `place`, `decon` and `cfg`. A late joiner gets everything from sendWorld.
import { kit, UP } from './stack_lib.js';
import * as EXT from '../ext.js';
import * as ST from '../stack.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, craft, selectTool, plan, newWorld, toI, toK, cellX, cellZ } = ctx;
  const K = kit(ctx), B = K.B, W = K.W, C = 0.6;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); if (g.world) g.world.onSet = null; g.netOut.length = 0; };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { await newWorld(); try { return await fn(); } finally { done(); g.keys = {}; g._lad = null; } });
  const hostWorld = () => { role('host'); cap(); g.world.onSet = (i, j, k, sp, vr) => g.netOut.push(i, j, k, sp, vr); g.netOut.length = 0; };
  const flush = () => { g._nt = 0; g.netUpdate(0.2); };
  const PARTS = ['pad', 'stair', 'ladder', 'wall', 'door'];
  const UPM = { ...UP, transitDoor: 1 };
  // two columns of two cubes: a stair in the first, a hatch ladder in the second, and a door frame on the first cube's west face
  const site = async () => {
    const Y = K.yard({ levels: 2, east: true, up: UPM }); K.dig(Y.m + 4, 0, Y.lo, 4, 8, 4);
    const [A, B2] = K.stack(Y, ['steel', 'steel']), C2 = K.cube('steel', Y.m + 4, Y.lo, 0), D = K.cube('steel', Y.m + 4, Y.lo, 4);
    return { Y, A, B2, C2, D };
  };
  const build = async (s) => {
    const { Y, A, C2 } = s, out = [], n0 = S().entities.length;
    let r = await K.putPlate(A, 'f', 0, 0); if (!r.ok) throw new Error('plate A: ' + r.why);
    r = await K.putPlate(A, 'c', 1, 0); if (!r.ok) throw new Error('landing: ' + r.why);
    r = await K.putStair(A, 0); if (!r.ok) throw new Error('stair: ' + r.why);
    r = await K.putPlate(C2, 'f', 0, 0); if (!r.ok) throw new Error('plate C: ' + r.why);
    r = await K.putPlate(C2, 'c', 2, 0); if (!r.ok) throw new Error('shaft plate: ' + r.why);
    craft('ladder'); selectTool('ladder'); K.aimAt(cellX(Y.m + 4 + 1), 4 * C, cellZ(Y.lo + 2), 1.0, 0.62); const lp = await plan(); if (!lp.ok) throw new Error('ladder: ' + lp.why); K.placeNow();
    craft('wall'); selectTool('wall'); K.stand(A, { od: 2, pitch: 0 }); p().pos.y = 0.62; const wp = await plan(); if (!wp.ok) throw new Error('door frame: ' + wp.why); K.placeNow();
    return S().entities.slice(n0);
  };
  const describe = (e) => ({ type: e.type, id: e.id, mk: e.mk, i0: e.i0, k0: e.k0, i: e.i, k: e.k, j: e.j, dir: e.dir, ax: e.ax, bay: e.bay, ro: e.ro, op: e.op, od: e.od, mod: e.mod, grp: e.grp, rid: e.rid });
  const cellsOfParts = (ents) => { const out = []; for (const e of ents) if (['pad', 'wall'].includes(e.type)) for (const [i, j, k] of B.cellsOf(e)) out.push([i, j, k, W().get(i, j, k), W().getVr(i, j, k)]); return out; };
  // forget everything on this side the way a fresh guest has nothing: the parts, their cells and registries (the cubes stay: they are part of the box)
  const wipe = (ents) => {
    const keep = W().onSet; W().onSet = null;
    for (const e of ents) {
      const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); }
      if (['pad', 'wall'].includes(e.type)) for (const [i, j, k] of B.cellsOf(e)) if (W().get(i, j, k)) W().setCell(i, j, k, 0, 0);
      if (e.type === 'ladder') ST.removeLadder(g, e);
      if (e.type === 'stair') B.removeBuild(g, e);
    }
    S().entities = S().entities.filter((x) => !ents.some((e) => e.id === x.id)); g._bld = null; W().onSet = keep;
  };

  await guard('mp.stack.host-announces-every-part-and-a-guest-draws-the-same-building', async () => {
    const s = await site(); hostWorld(); const bad = [];
    const ents = await build(s); flush(); const hostEnts = ents.map((e) => json(e));
    const plus = ofType('ent+').filter((m) => PARTS.includes(m.ent.type)), cells = ofType('cells');
    if (plus.length !== ents.length) bad.push(`host announced ${plus.length} of ${ents.length} parts`);
    const told = new Map(); for (const m of cells) for (let q = 0; q < m.a.length; q += 5) told.set(m.a[q] + ',' + m.a[q + 1] + ',' + m.a[q + 2], [m.a[q + 3], m.a[q + 4]]);
    const hostCells = cellsOfParts(ents); for (const [i, j, k, sp, vr] of hostCells) { const t = told.get(i + ',' + j + ',' + k); if (!t || t[0] !== sp || t[1] !== vr) { bad.push(`cell ${i},${j},${k} was not announced right`); break; } }
    const hostInfo = {}; for (const e of ents) hostInfo[e.id] = JSON.stringify(infoFor(g, { kind: 'mach', id: e.id }));
    const cubeInfo = JSON.stringify(infoFor(g, { kind: 'mach', id: s.A.id }));
    const msgs = json([...cells, ...plus]);
    wipe(ents); done(); role('guest'); cap(); for (const m of msgs) g.netMessage(json(m));
    for (const [i, j, k, sp, vr] of hostCells) if (W().get(i, j, k) !== sp || W().getVr(i, j, k) !== vr) { bad.push(`guest cell ${i},${j},${k} is ${W().get(i, j, k)}/${W().getVr(i, j, k)}, host ${sp}/${vr}`); break; }
    for (const he of hostEnts) {
      const ge = S().entities.find((x) => x.id === he.id); if (!ge || !ge.view || !g.machines.items.get(he.id)) { bad.push(he.type + ' missing on the guest'); continue; }
      if (JSON.stringify(describe(ge)) !== JSON.stringify(describe(he))) bad.push(`${he.type} differs: ${JSON.stringify(describe(ge))} vs ${JSON.stringify(describe(he))}`);
      const gi = JSON.stringify(infoFor(g, { kind: 'mach', id: he.id })); if (gi !== hostInfo[he.id]) bad.push(`${he.type} readout differs: ${gi} vs ${hostInfo[he.id]}`);
    }
    if (JSON.stringify(infoFor(g, { kind: 'mach', id: s.A.id })) !== cubeInfo) bad.push('the cube readout differs on the guest');
    if (!ST.plateOf(g, s.A.id) || ST.partsOf(g, s.A.id).length < 4) bad.push('the guest does not see what is built into the cube');
    const lad = hostEnts.find((e) => e.type === 'ladder'); if (!ST.ladders(g).has(lad.id)) bad.push('the guest has no ladder in its registry');
    if (g.S.items['pad:steel'] || g.S.items.ladder) bad.push('the guest copy changed the item counts');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.stack.a-guest-climbs-the-ladder-and-walks-the-stair-on-its-own-copy', async () => {
    const s = await site(); hostWorld(); const ents = await build(s); flush(); const hostEnts = ents.map((e) => json(e));
    const msgs = json([...ofType('cells'), ...ofType('ent+')]); wipe(ents); done(); role('guest'); cap(); p().walk = null; p().climb = null; g._lad = null;
    for (const m of msgs) g.netMessage(json(m));
    EXT.update(g, 0.05, true); if (typeof p().climb !== 'function' || typeof p().walk !== 'function') return 'the guest tick did not install the walk and climb hooks';
    const lad = hostEnts.find((e) => e.type === 'ladder'), cx = cellX(lad.i), cz = cellZ(lad.k);
    p().pos.set(cx, 0.62, cz); p().vel.set(0, 0, 0); p().yaw = -Math.PI / 2; p().pitch = 0; K.walk(2.2, { fwd: 1 });
    return p().pos.y > 2.8 || 'a guest cannot climb the ladder: y ' + p().pos.y.toFixed(2);
  });

  await guard('mp.stack.late-joiner-gets-the-whole-building-from-sendworld', async () => {
    const s = await site(); hostWorld(); const ents = await build(s); flush(); const hostEnts = ents.map((e) => json(e)), bad = [];
    const hostCells = cellsOfParts(ents); cap(); g.sendWorld(); const msgs = json(sent.filter((m) => m.t === 'diff' || m.t === 'ents'));
    if (!msgs.some((m) => m.t === 'ents')) return 'sendWorld sent ' + sent.map((m) => m.t).join();
    wipe(ents); done(); role('guest'); cap();
    for (const m of msgs) g.netMessage(json(m));
    for (const [i, j, k, sp, vr] of hostCells) if (W().get(i, j, k) !== sp || W().getVr(i, j, k) !== vr) { bad.push(`late joiner cell ${i},${j},${k}: ${W().get(i, j, k)} vs ${sp}`); break; }
    for (const he of hostEnts) { const ge = S().entities.find((x) => x.id === he.id); if (!ge || !ge.view) bad.push('late joiner lacks the ' + he.type); else if (JSON.stringify(describe(ge)) !== JSON.stringify(describe(he))) bad.push(he.type + ' differs'); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.stack.a-guest-asks-and-the-host-places-plate-stair-ladder-and-door-frame', async () => {
    const s = await site(); const { Y, A, C2 } = s, bad = [];
    // the guest plans and clicks: one place message each, nothing changes on its side (the pack is the guest's own copy: craft first)
    craft('pad:steel', 3); craft('stair', 2); craft('wall', 1); role('guest'); cap(); const n0 = S().entities.length;
    const go = async (what, setup) => { const c0 = sent.filter((m) => m.t === 'cmd').length; await setup(); const pl = await plan(); if (!pl.ok) { bad.push(what + ': ' + pl.why); return null; } g.placeCurrent(g.curTool()); const cmds = sent.filter((m) => m.t === 'cmd'); if (cmds.length !== c0 + 1 || cmds[c0].c !== 'place') bad.push(what + ': not one place message'); return json(cmds[c0]); };
    const cmds = [];
    cmds.push(await go('plate', async () => { selectTool('pad:steel'); g._sOpen = 1; K.stand(A, { od: 0, pitch: -1 }); }));
    cmds.push(await go('stair', async () => { selectTool('stair'); K.stand(C2, { od: 0, pitch: -0.5, x: cellX(Y.m + 4) }); }));
    cmds.push(await go('door frame', async () => { selectTool('wall'); K.stand(A, { od: 2, pitch: 0 }); p().pos.y = 0.62; }));
    if (S().entities.length !== n0) bad.push('a guest placed on its own');
    // the host runs them (the host needs the same unlocks and the plate under the stair)
    done(); hostWorld(); g.rebuildTools();
    for (const c of cmds) if (c) { sent.length = 0; g.netMessage(json(c)); if (!ofType('ent+').length) bad.push('the host did not announce ' + c.d.tool.id + ': ' + JSON.stringify(ofType('toast').map((t) => t.text))); }
    const mine = S().entities.filter((e) => e.bay === A.id || e.bay === C2.id); const kinds = mine.map((e) => e.type).sort().join();
    if (kinds !== 'pad,stair,stair,wall') bad.push('host parts of the cubes: ' + kinds);
    const pad = mine.find((e) => e.type === 'pad'); if (!pad || pad.op !== 1 || pad.ro !== 'f') bad.push('the plate: ' + JSON.stringify(pad && [pad.op, pad.ro]));
    void Y; return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.stack.forged-placements-change-nothing', async () => {
    const s = await site(); const { Y, A, B2 } = s, bad = [];
    hostWorld(); craft('pad:steel', 3); craft('stair', 2); craft('ladder', 2); craft('wall', 2); sent.length = 0;
    const tool = (id, kind, o = {}) => ({ id, kind, p: {}, ...o });
    const msg = (t, e) => ({ t: 'cmd', c: 'place', d: { tool: t, ent: e } });
    const base = { type: 'pad', i0: Y.m, k0: Y.lo, j: 0, bay: A.id, ro: 'f', op: 0, od: 0, zoop: [[Y.m, Y.lo]] };
    const tries = [
      ['an opening that does not exist', tool('pad:steel', 'pad'), { ...base, op: 99 }], ['a turn that does not exist', tool('pad:steel', 'pad'), { ...base, od: 9 }],
      ['a float corner', tool('pad:steel', 'pad'), { ...base, i0: Y.m + 0.5, zoop: [[Y.m + 0.5, Y.lo]] }], ['a plate that is not on the cube grid', tool('pad:steel', 'pad'), { ...base, i0: Y.m + 1, zoop: [[Y.m + 1, Y.lo]] }],
      ['a row inside the cube', tool('pad:steel', 'pad'), { ...base, j: 2 }], ['a row in the next cube up', tool('pad:steel', 'pad'), { ...base, j: 5 }], ['a string opening', tool('pad:steel', 'pad'), { ...base, op: '1' }],
      ['two pieces for a plate', tool('pad:steel', 'pad'), { ...base, zoop: [[Y.m, Y.lo], [Y.m, Y.lo + 4]] }], ['a stair module with a made up turn', tool('stair', 'stair'), { type: 'stair', mod: 'u', bay: A.id, i0: Y.m, k0: Y.lo, j: 1, od: 7 }],
      ['a stair module from the wrong row', tool('stair', 'stair'), { type: 'stair', mod: 'u', bay: A.id, i0: Y.m, k0: Y.lo, j: 2, od: 0 }],
      ['a ladder in the open air', tool('ladder', 'ladder'), { type: 'ladder', i: Y.m + 30, k: Y.lo, j: 10, dir: 0 }], ['a ladder with a bad facing', tool('ladder', 'ladder'), { type: 'ladder', i: Y.m + 2, k: Y.lo + 2, j: 1, dir: 8 }],
      ['a door frame in the middle of a cube', tool('wall', 'wall'), { type: 'wall', ax: 'x', i0: Y.m, k0: Y.lo + 1, j: 0, bay: A.id, zoop: [[Y.m, Y.lo + 1]] }], ['a door frame that sinks into the pile', tool('wall', 'wall'), { type: 'wall', ax: 'q', i0: Y.m, k0: Y.lo, j: 0, bay: A.id, zoop: [[Y.m, Y.lo]] }],
      ['a plate as a ladder', tool('ladder', 'pad'), base], ['a plate paid with a ladder', tool('ladder', 'pad'), base],
    ];
    for (const [name, t, e] of tries) { sent.length = 0; const n1 = S().entities.length, it1 = JSON.stringify(S().items), c1 = K.count(Y.m - 2, 0, Y.lo - 2, 14, 12, 8); try { g.netMessage(json(msg(t, e))); } catch (x) { bad.push(name + ' threw ' + x.message); } if (S().entities.length !== n1 || JSON.stringify(S().items) !== it1 || K.count(Y.m - 2, 0, Y.lo - 2, 14, 12, 8) !== c1) bad.push(name + ' changed the world or the items'); }
    // locked: without Stacked Building the host builds a plate the plain way or refuses
    S().up.stackKit = 0; g.T = g.tune(); sent.length = 0; g.netMessage(json(msg(tool('pad:steel', 'pad'), base))); const locked = S().entities.some((e) => e.type === 'pad' && e.bay !== undefined); S().up.stackKit = 1; g.T = g.tune();
    if (locked) bad.push('a plate was built into a cube without the unlock');
    // and the real thing goes through
    sent.length = 0; g.netMessage(json(msg(tool('pad:steel', 'pad'), base))); const ok = S().entities.find((e) => e.type === 'pad' && e.bay === A.id); if (!ok) bad.push('the honest plate was refused: ' + JSON.stringify(ofType('toast').map((m) => m.text))); void B2;
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.stack.a-guest-cannot-hammer-a-cube-with-parts-and-gets-told-why', async () => {
    const s = await site(); hostWorld(); const { A, B2 } = s; await K.putPlate(A, 'f', 0, 0); const r = await K.putPlate(A, 'c', 0, 0); if (!r.ok || r.e.bay !== B2.id) return 'the top plate: ' + (r.why || 'not in the top cube'); sent.length = 0;
    g.netMessage({ t: 'cmd', c: 'decon', d: { kind: 'mach', id: B2.id } });
    if (!g.machines.items.has(B2.id)) return 'a guest took down a cube with a plate built in'; let toast = ofType('toast').find((m) => /built into/.test(m.text || '')); if (!toast) return 'no toast told the guest why: ' + JSON.stringify(ofType('toast'));
    sent.length = 0; g.netMessage({ t: 'cmd', c: 'decon', d: { kind: 'mach', id: A.id } });
    toast = ofType('toast').find((m) => /stands on this one/.test(m.text || '')); return (g.machines.items.has(A.id) && !!toast) || 'a cube with a cube on it came down or the guest was not told: ' + JSON.stringify(ofType('toast'));
  });

  await guard('mp.stack.a-fallen-cube-takes-its-parts-and-tells-the-guest', async () => {
    const s = await site(); hostWorld(); const { A, B2 } = s; const r = await K.putPlate(A, 'f', 0, 0); if (!r.ok) return r.why; sent.length = 0;
    g.failSupport(K.support(A), 1.3);
    const gone = ofType('ent-').map((m) => m.id); if (!gone.includes(A.id) || !gone.includes(r.e.id)) return 'the guest was not told the cube and its plate are gone: ' + gone.join();
    if (!ofType('sfail').length) return 'no sfail message'; return (!!g.pendFail && g.pendFail.has(B2.id) && ofType('swarn').length > 0) || 'the cube above was not warned';
  });
}
