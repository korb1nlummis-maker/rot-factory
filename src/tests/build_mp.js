import * as PD from '../plushdata.js';
// mp.build.*: the build shell in multiplayer with no network. One page plays both roles by switching g.net.role and capturing g.netSend.
// The host owns every piece: it places them, sets the world cells and announces ents (ent+) and cells; a guest only draws what it is told and asks with `place`, `decon` and `cfg`.
import { makeShell } from './build_lib.js';
import * as EXT from '../ext.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, adv, V3, cellX, cellZ, toI, toK, craft, selectTool, plan, fresh } = ctx;
  const K = makeShell(ctx), B = K.B;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); if (g.world) g.world.onSet = null; g.netOut.length = 0; };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); K.clean(); for (const t of [...L().tiles.values()]) if (!t.free && t.type === 'gen') { L().remove(t); S().entities = S().entities.filter((x) => x.id !== t.id); } } });
  const I0 = () => toI(-14), K0 = () => toK(2);
  const hostWorld = () => { role('host'); cap(); g.world.onSet = (i, j, k, sp, vr) => g.netOut.push(i, j, k, sp, vr); g.netOut.length = 0; };
  const flush = () => { g._nt = 0; g.netUpdate(0.2); };
  // build one of everything on the host: a pad zoop of 2, a catwalk off the first pad, a wall on the second, a ramp up to the first and a stair
  const buildAll = async () => {
    const out = []; const base = I0(), kz = K0();
    g._bz = { n: 2, w: 1 }; const a = await K.put('pad:steel', base, kz, { n: 2, back: 1.8 }); if (!a.ok) throw new Error('pads: ' + a.why); out.push(...a.made); g._bz = { n: 1, w: 1 };
    const P0 = a.made[0], P1 = a.made[1] || a.made[0];
    const c = await K.put('catwalk', P0.i0 + 3, P0.k0 + 1, { y: 0.6, back: 3.2, dir: 0 }); if (!c.ok) throw new Error('catwalk: ' + c.why); out.push(...c.made);
    const wl = await K.put('wall', P1.i0 + 1, P1.k0 + 3, { y: 0.6, back: 3.2 }); if (!wl.ok) throw new Error('wall: ' + wl.why); out.push(...wl.made);
    const r = await K.put('wramp', base, kz + 8, { dir: 0 }); if (!r.ok) throw new Error('ramp: ' + r.why); out.push(...r.made);
    const s = await K.put('stair', base, kz + 12, { dir: 0 }); if (!s.ok) throw new Error('stair: ' + s.why); out.push(...s.made);
    return out;
  };
  // forget everything on this side the way a fresh guest has nothing: pieces, cells, registry
  const wipe = (ents) => {
    const keep = g.world.onSet; g.world.onSet = null;
    for (const e of ents) { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } if (['pad', 'catwalk', 'wall'].includes(e.type)) for (const [i, j, k] of B.cellsOf(e)) g.world.setCell(i, j, k, 0, 0); if (e.type === 'wramp' || e.type === 'stair') { const s = B.spec(e); for (let r = 0; r < e.rise; r++) for (let dz = 0; dz < s.nz; dz++) for (let dx = 0; dx < s.nx; dx++) g.world.reserved.delete(((e.j + r) * ctx.cfg.NZ + e.k0 + dz) * ctx.cfg.NX + e.i0 + dx); }
    }
    S().entities = S().entities.filter((x) => !ents.some((e) => e.id === x.id)); g._bld = null; g.world.onSet = keep;
  };
  const describe = (e) => ({ type: e.type, mk: e.mk, i0: e.i0, k0: e.k0, j: e.j, dir: e.dir, ax: e.ax, rail: e.rail | 0, grp: e.grp, rid: e.rid });

  await guard('mp.build.pad-ramp-sync', async () => {
    K.setup(); hostWorld(); const bad = [];
    const ents = await buildAll(); flush();
    const plus = ofType('ent+').filter((m) => B.isBuildType(m.ent.type)); const cells = ofType('cells');
    if (plus.length !== ents.length) bad.push(`host announced ${plus.length} of ${ents.length} pieces`);
    const hostEnts = ents.map((e) => json(e)), hostInfo = {}, hostCells = [];
    for (const e of ents) { hostInfo[e.id] = JSON.stringify(infoFor(g, { kind: 'mach', id: e.id })); if (['pad', 'catwalk', 'wall'].includes(e.type)) for (const [i, j, k] of B.cellsOf(e)) hostCells.push([i, j, k, w().get(i, j, k), w().getVr(i, j, k)]); }
    const told = new Map(); for (const m of cells) for (let q = 0; q < m.a.length; q += 5) told.set(m.a[q] + ',' + m.a[q + 1] + ',' + m.a[q + 2], [m.a[q + 3], m.a[q + 4]]);
    for (const [i, j, k, sp, vr] of hostCells) { const t = told.get(i + ',' + j + ',' + k); if (!t || t[0] !== sp || t[1] !== vr) { bad.push(`cell ${i},${j},${k} was not announced right: ${JSON.stringify(t)} vs ${sp}/${vr}`); break; } }
    const msgs = json([...cells, ...plus]);
    // the guest: nothing yet, then the host's messages
    wipe(ents); done(); role('guest'); cap(); for (const m of msgs) g.netMessage(json(m));
    for (const [i, j, k, sp, vr] of hostCells) if (w().get(i, j, k) !== sp || w().getVr(i, j, k) !== vr) { bad.push(`guest cell ${i},${j},${k} is ${w().get(i, j, k)}/${w().getVr(i, j, k)}, host ${sp}/${vr}`); break; }
    for (const he of hostEnts) {
      const ge = S().entities.find((x) => x.id === he.id); if (!ge || !ge.view || !g.machines.items.get(he.id)) { bad.push(he.type + ' missing on the guest'); continue; }
      if (JSON.stringify(describe(ge)) !== JSON.stringify(describe(he))) bad.push(`${he.type} differs: ${JSON.stringify(describe(ge))} vs ${JSON.stringify(describe(he))}`);
      const gi = JSON.stringify(infoFor(g, { kind: 'mach', id: he.id })); if (gi !== hostInfo[he.id]) bad.push(`${he.type} readout differs: ${gi} vs ${hostInfo[he.id]}`);
      if (['pad', 'catwalk'].includes(he.type) && !!g.machines.items.get(he.id).obj.getObjectByName('rails') !== (((he.rail | 0) & 15) !== 0)) bad.push(he.type + ' rails differ');
    }
    const ramp = hostEnts.find((e) => e.type === 'wramp'); const sy = B.surfaceAt(g, cellX(ramp.i0) - 0.3 + 0.9, cellZ(ramp.k0) - 0.3 + 0.6); if (sy === null || Math.abs(sy - 0.45) > 0.02) bad.push('the guest ramp surface is ' + sy);
    if (B.ownerAt(g, ...B.cellsOf(hostEnts[0])[0]) === null) bad.push('the guest has no owner for a pad cell');
    if (S().items['pad:steel'] || S().items.wall) bad.push('the guest copy changed the item counts');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.build.late-joiner-sees-every-piece-and-walks-the-ramp', async () => {
    K.setup(); hostWorld(); const bad = [];
    const ents = await buildAll(); flush(); const hostEnts = ents.map((e) => json(e));
    cap(); g.sendWorld(); const msgs = json(sent.filter((m) => m.t === 'diff' || m.t === 'ents'));
    if (!msgs.some((m) => m.t === 'diff') || !msgs.some((m) => m.t === 'ents')) return 'sendWorld sent ' + sent.map((m) => m.t).join();
    const cellsBefore = []; for (const e of ents) if (['pad', 'catwalk', 'wall'].includes(e.type)) for (const [i, j, k] of B.cellsOf(e)) cellsBefore.push([i, j, k, w().get(i, j, k), w().getVr(i, j, k)]);
    wipe(ents); done(); role('guest'); cap(); p().walk = null;
    for (const m of msgs) g.netMessage(json(m));
    for (const [i, j, k, sp, vr] of cellsBefore) if (w().get(i, j, k) !== sp || w().getVr(i, j, k) !== vr) { bad.push(`late joiner cell ${i},${j},${k}: ${w().get(i, j, k)} vs ${sp}`); break; }
    for (const he of hostEnts) { const ge = S().entities.find((x) => x.id === he.id); if (!ge || !ge.view) bad.push('late joiner lacks the ' + he.type); }
    // the guest's own walking: its hook installs from the guest tick and the ramp carries it up
    EXT.update(g, 0.05, true); if (typeof p().walk !== 'function') bad.push('the guest tick did not install the walk hook');
    const R = hostEnts.find((e) => e.type === 'wramp'), x0 = cellX(R.i0) - 0.3, zc = cellZ(R.k0);
    p().pos.set(x0 - 1.2, 0, zc); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0; let top = 0;
    for (let n = 0; n < 150; n++) { p().update(1 / 60, { fwd: 1, back: 0, left: 0, right: 0, sprint: false, crouch: false, jump: false }, { walk: g.T.walk, crouchMul: g.T.crouchMul, jump: g.T.jump }, g.sim); top = Math.max(top, p().pos.y); }
    if (top < 0.5) bad.push('a guest cannot climb the ramp: top ' + top.toFixed(2));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.build.guest-zoop-is-one-message-and-the-host-decides', async () => {
    K.setup(); const bad = [], i = I0() - 2, k = K0();
    craft('pad:steel', 8); K.equip('pad:steel'); g._bz = { n: 6, w: 1 };
    role('guest'); cap(); K.aim(i, k, { back: 2.6 }); const pl = await plan(); if (!pl.ok) return pl.why;
    const n0 = S().entities.length, items0 = S().items['pad:steel']; g.placeCurrent(g.curTool());
    const cmds = sent.filter((m) => m.t === 'cmd'); if (cmds.length !== 1 || cmds[0].c !== 'place') bad.push('the zoop was not one place message: ' + JSON.stringify(sent.map((m) => m.t + (m.c ? ':' + m.c : ''))));
    if (S().entities.length !== n0 || S().items['pad:steel'] !== items0) bad.push('a guest placed or paid on its own');
    const cmd = json(cmds[0] || {}); if (!cmd.d || !cmd.d.ent || cmd.d.ent.zoop.length !== 6) bad.push('the message does not carry the 6 pieces');
    // host: runs the guest command
    done(); K.clean(); hostWorld(); S().items['pad:steel'] = 8; g.rebuildTools(); const h0 = S().entities.length;
    g.netMessage(json(cmd)); const pads = S().entities.filter((e) => e.type === 'pad');
    if (pads.length !== 6) bad.push('the host placed ' + pads.length); if (S().items['pad:steel'] !== 2) bad.push('host items ' + S().items['pad:steel']);
    if (new Set(pads.map((e) => e.grp)).size !== 1) bad.push('the pieces are not one group'); if (ofType('ent+').length !== 6) bad.push('the host announced ' + ofType('ent+').length);
    if (!pads.every((e) => K.solidCells(e))) bad.push('host cells missing'); void h0;
    K.clean(); S().items['pad:steel'] = 8; g.rebuildTools();
    // tampering: the host builds from its own rules, never from the message
    const tool = (o = {}) => ({ id: 'pad:steel', kind: 'pad', p: { mk: 'steel' }, ...o });
    const msg = (t, e) => ({ t: 'cmd', c: 'place', d: { tool: t, ent: e } });
    const base = { type: 'pad', mk: 'steel', i0: i, k0: k, j: 0, zoop: [[i, k]] };
    const tries = [
      ['float coordinates', tool(), { ...base, i0: 5.5, zoop: [[5.5, k]] }], ['string coordinates', tool(), { ...base, zoop: [['1', '2']] }], ['30 pieces', tool(), { ...base, zoop: Array.from({ length: 30 }, (_, q) => [i + 4 * q, k]) }],
      ['negative row', tool(), { ...base, j: -3 }], ['no zoop list and no corner', tool(), { type: 'pad', j: 0 }], ['a stair id for a pad tool', tool({ id: 'stair' }), base], ['a wall with a bad axis', tool({ id: 'wall', kind: 'wall' }), { type: 'wall', ax: 'q', i0: i, k0: k, j: 0, zoop: [[i, k]] }],
      ['a pad in the air', tool(), { ...base, j: 7 }], ['an item you do not have', tool({ id: 'pad:horizon' }), base], ['more pieces than items', tool(), { ...base, zoop: Array.from({ length: 9 }, (_, q) => [i + 4 * q, k]) }],
    ];
    for (const [name, t, e] of tries) { sent.length = 0; const n1 = S().entities.length, it1 = JSON.stringify(S().items); try { g.netMessage(json(msg(t, e))); } catch (x) { bad.push(name + ' threw ' + x.message); } if (S().entities.length !== n1 || JSON.stringify(S().items) !== it1) bad.push(name + ' changed the world or the items'); }
    // a message that claims another material is built as the item says
    sent.length = 0; g.netMessage(json(msg(tool({ p: { mk: 'horizon' } }), base))); const one = S().entities.find((e) => e.type === 'pad'); if (!one || one.mk !== 'steel') bad.push('the message chose the material: ' + (one && one.mk));
    // a pad over plush is refused with a toast
    K.clean(); K.plushAt(i, 2, k); sent.length = 0; g.netMessage(json(msg(tool(), base))); if (S().entities.some((e) => e.type === 'pad') || !sent.some((m) => m.t === 'toast')) bad.push('plush in the way was not refused with a toast');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.build.guest-decon-group-wall-cells-and-rails', async () => {
    K.setup(); hostWorld(); const bad = [], i = I0() - 2, k = K0();
    g._bz = { n: 4, w: 1 }; const a = await K.put('pad:timber', i, k, { n: 4, back: 2.6 }); if (!a.ok) return a.why; const pads = a.made; g._bz = { n: 1, w: 1 };
    craft('wall', 1); K.equip('wall'); K.aim(pads[0].i0 + 1, pads[0].k0, { y: 0.6, back: 3.2 }); const wp = await plan(); if (!wp.ok) return 'wall: ' + wp.why; g.placeCurrent(g.curTool()); const W = S().entities.find((e) => e.type === 'wall');
    const [wi, wj, wk] = B.cellsOf(W)[5];
    // a guest asking for the hand take (the `bulk` command) of a wall panel gets nothing
    sent.length = 0; g.netMessage({ t: 'cmd', c: 'bulk', d: { i: wi, j: wj, k: wk } }); if (w().get(wi, wj, wk) !== PD.BULK || S().items.bulk) bad.push('a guest took a wall panel by hand');
    // rails by cfg
    sent.length = 0; g.netMessage({ t: 'cmd', c: 'cfg', d: { id: pads[1].id, patch: { rail: 9 } } }); if (pads[1].rail !== 9 || !ofType('ent-').length || !ofType('ent+').length) bad.push('cfg rail: ' + pads[1].rail);
    sent.length = 0; g.netMessage({ t: 'cmd', c: 'cfg', d: { id: pads[1].id, patch: { rail: 99 } } }); if (pads[1].rail !== 9 || !ofType('toast').length) bad.push('a bad rail patch changed the pad or did not toast');
    // a guest hammers one piece, then the group
    sent.length = 0; g.netMessage({ t: 'cmd', c: 'decon', d: { kind: 'mach', id: pads[2].id } }); if (S().entities.filter((e) => e.type === 'pad').length !== 3 || !ofType('ent-').some((m) => m.id === pads[2].id)) bad.push('single decon');
    sent.length = 0; g.netMessage({ t: 'cmd', c: 'decon', d: { kind: 'mach', id: pads[0].id, group: true } });
    const left = S().entities.filter((e) => e.type === 'pad').length; if (left !== 0) bad.push('group decon left ' + left); if (ofType('ent-').length !== 3) bad.push('the host announced ' + ofType('ent-').length + ' removals');
    if (S().items['pad:timber'] !== 4) bad.push('items back ' + S().items['pad:timber']);
    // the wall stands on nothing now but keeps its own cells; hammering it by id returns one wall
    g.netMessage({ t: 'cmd', c: 'decon', d: { kind: 'mach', id: W.id } }); if (S().items.wall !== 1 || w().get(wi, wj, wk) !== 0) bad.push('wall decon');
    // a group flag on something that is not a shell piece falls back to a normal single take down
    const f = await K.put('frame:timber', i + 8, k, { back: 2.6 }); if (f.ok) { g.netMessage({ t: 'cmd', c: 'decon', d: { kind: 'mach', id: f.made[0].id, group: true } }); if (S().entities.some((e) => e.id === f.made[0].id)) bad.push('frame not taken down'); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.build.levelpad-row-and-guest-toggle', async () => {
    K.setup(); hostWorld(); const bad = [], i = I0(), k = K0();
    g._bz = { n: 2, w: 1 }; const r = await K.put('levelpad', i, k, { back: 2.2 }); if (!r.ok) return r.why; const E = r.made[0]; g._bz = { n: 1, w: 1 };
    E.on = false; E.st = 'done'; E.slot = 2; E.dug = 77; E.laid = 1; E.skip = 1; E.pwv = 1;   // a stopped machine keeps its numbers (a running one would be re-judged by this frame's tick)
    sent.length = 0; g._extRow = 0; EXT.update(g, 0.1, false);
    const row = sent.find((m) => m.t === 'xrow' && m.k === 'levelpad'); if (!row) return 'the host sent no xrow for the machine: ' + sent.map((m) => m.t).join();
    const hostInfo = JSON.stringify(infoFor(g, { kind: 'mach', id: E.id })), plus = json({ t: 'ent+', ent: g.stripEnt(E) }), rowMsg = json(row);
    wipe([E]); done(); role('guest'); cap(); g.netMessage(plus); const GE = S().entities.find((x) => x.id === E.id); if (!GE || !GE.view) return 'no guest copy';
    g.netMessage(rowMsg); if (GE.st !== 'done' || GE.slot !== 2 || GE.dug !== 77 || GE.laid !== 1) bad.push('guest row not applied: ' + JSON.stringify([GE.st, GE.slot, GE.dug, GE.laid]));
    if (JSON.stringify(infoFor(g, { kind: 'mach', id: E.id })) !== hostInfo) bad.push('the readout differs between host and guest');
    // the guest stops it: one cfg command, the host re-validates and announces
    sent.length = 0; GE.on = true; const q = g.setCfg(GE, { on: false }); if (!q.ok || !sent.some((m) => m.t === 'cmd' && m.c === 'cfg' && m.d.patch.on === false) || GE.on === false) bad.push('guest cfg: ' + JSON.stringify(q));
    const cmd = json(sent.find((m) => m.t === 'cmd')); wipe([GE]); done(); role('host'); cap(); const HE = { ...json(g.stripEnt(E)), id: E.id, on: true }; S().entities.push(HE); g.addEntity(HE); g.netMessage(cmd);
    const he = S().entities.find((x) => x.id === E.id); if (!he || he.on !== false || !ofType('ent+').length) bad.push('host did not apply the toggle');
    return bad.length === 0 || bad.join(' || ');
  });
}
