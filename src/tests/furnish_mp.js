// mp.furnish.*: furnish in co-op, no network. One page plays both roles by switching g.net.role and capturing g.netSend (see mp_core.js).
// The host simulates and owns every ent; a guest sees ent+ copies, the 0.5 s `furnish` row, and edits through the `cfg` command.
import { makeFurnKit } from './furnish_lib.js';
import * as F from '../furnish.js';
import * as EXT from '../ext.js';
import { infoFor } from '../info.js';
import { NEEDLE } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, L, V3, p, fresh, toI, toK, selectTool, aimPoint, plan, craft } = ctx;
  const X = makeFurnKit(ctx);
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => {
    try { g.mode = 'play'; return await fn(); } finally { done(); X.clearCells(); g.stowed = true; g.rebuildTools(); F.resetFurnish(g); g.remote = null; g.cfgClip = null; if (g.ui.openModal) g.ui.closeModals(); }
  });
  // forget the furnish ents of this world and show them again the way a guest does: from the host's messages
  const toGuest = (msgs) => {
    done(); for (const it of [...g.machines.items.values()]) if (F.KINDS.includes(it.ent.type)) g.removeViewEnt(it.ent.id);
    for (const t of [...L().tiles.values()]) if (t.intakeFor) L().remove(t);
    role('guest'); cap(); for (const m of msgs) g.netMessage(json(m));
  };
  const lightsNow = (cam) => g.machines.lights(cam, 99).map((l) => ({ type: l.type, x: l.x, y: l.y, z: l.z, lr: l.lr, lc: [...l.lc] }));
  const same = (a, b) => a.length === b.length && a.every((l, n) => l.type === b[n].type && Math.abs(l.x - b[n].x) < 1e-6 && Math.abs(l.y - b[n].y) < 1e-6 && Math.abs(l.z - b[n].z) < 1e-6 && l.lr === b[n].lr && l.lc.every((v, q) => Math.abs(v - b[n].lc[q]) < 1e-6));
  const ent = (id) => S().entities.find((x) => x.id === id);
  // the host's furnish row right now (the game loop has been sending them all along, so force one by forgetting the last)
  const hostRow = () => { F.FS.lastRow = ''; sent.length = 0; g._extRow = 0; EXT.update(g, 0.6, false); return ofType('xrow').find((m) => m.k === 'furnish'); };

  await guard('mp.furnish.sign-edit-by-guest', async () => {
    X.reset(); const bad = []; role('host'); cap();
    const r = await X.onFloor('sign', -9, 4); if (!r.ok) return r.why; const e = r.ent, id = e.id;
    g.setCfg(e, { text: 'HOST' }); const plus = ofType('ent+').filter((m) => m.ent.id === id).pop(); if (!plus || plus.ent.text !== 'HOST') return 'the host did not announce the sign with its text';
    toGuest([plus]); const v = ent(id); if (!v || !v.view || v.text !== 'HOST' || !g.machines.items.get(id)) return 'the guest has no copy of the sign';
    // the guest asks: the clean patch (markup stripped) is what travels, and its own copy waits for the host
    const r1 = g.setCfg(id, { text: '<b>Hello</b>\u0001', size: 2, lit: true }), cmd = sent.find((m) => m.t === 'cmd' && m.c === 'cfg');
    if (!r1.ok || !cmd || cmd.d.id !== id || cmd.d.patch.text !== 'bHello/b' || cmd.d.patch.size !== 2 || cmd.d.patch.lit !== true) bad.push('the guest did not send the clean patch: ' + JSON.stringify(cmd));
    if (v.text !== 'HOST' || v.size !== 1) bad.push('the guest changed its own copy before the host answered');
    sent.length = 0; for (const patch of [{ evil: 1 }, { text: 5 }, { size: 9 }, { cargo: {} }, { act: { k: 'put', id: 'x', n: 1 } }, { mode: 'on' }]) if (g.setCfg(id, patch).ok) bad.push('the guest accepted ' + JSON.stringify(patch));
    if (sent.some((m) => m.c === 'cfg')) bad.push('a bad patch left the machine');
    // the host: drop the guest copy, bring the real ent back, run the command
    g.removeViewEnt(id); done(); S().entities.push(e); g.addEntity(e); role('host'); cap(); g.netMessage(json(cmd));
    if (e.text !== 'bHello/b' || e.size !== 2 || e.lit !== true) bad.push('the host did not apply it: ' + JSON.stringify([e.text, e.size, e.lit]));
    const minus = sent.findIndex((m) => m.t === 'ent-' && m.id === id), plus2 = sent.findIndex((m) => m.t === 'ent+' && m.ent.id === id);
    if (minus < 0 || plus2 < minus) bad.push('the host must send ent- then ent+: ' + JSON.stringify(sent.map((m) => m.t)));
    const it = g.machines.items.get(id); if (!it.obj.userData.tex || it.obj.userData.tex.image.width !== Math.round(F.SIGN_DIM[2][0] * 256)) bad.push('the host sign was not redrawn at size 2');
    // a second guest sees the new text, size and a panel of the new width
    const msgs = json(sent.filter((m) => m.t === 'ent-' || m.t === 'ent+')); toGuest(msgs);
    const gv = ent(id), gi = g.machines.items.get(id); if (!gv || gv.text !== 'bHello/b' || gv.size !== 2 || gv.lit !== true || !gi || gi.obj.userData.tex.image.width !== Math.round(F.SIGN_DIM[2][0] * 256)) bad.push('the other screen shows ' + JSON.stringify(gv && [gv.text, gv.size]));
    if (infoFor(g, { kind: 'mach', id }).lines[0] !== '"bHello/b"') bad.push('guest readout ' + infoFor(g, { kind: 'mach', id }).lines[0]);
    // forged commands change nothing and tell the sender why
    g.removeViewEnt(id); done(); S().entities.push(e); g.addEntity(e); role('host'); cap(); const snap = JSON.stringify(e);
    for (const d of [{ id, patch: { text: 'x', cargo: { a: 1 } } }, { id, patch: { text: 5 } }, { id, patch: { size: 4 } }, { id, patch: JSON.parse('{"__proto__":{"lit":true}}') }, { id, patch: { act: { k: 'dep', items: [] } } }]) {
      sent.length = 0; g.netMessage({ t: 'cmd', c: 'cfg', d: json(d) });
      if (sent.some((m) => m.t === 'ent+' || m.t === 'ent-')) bad.push('a forged patch was announced: ' + JSON.stringify(d));
      if (!sent.some((m) => m.t === 'toast')) bad.push('no toast for ' + JSON.stringify(d));
    }
    if (JSON.stringify(e) !== snap || ({}).lit !== undefined) bad.push('a forged patch changed the sign');
    sent.length = 0; g.netMessage({ t: 'cmd', c: 'cfg', d: { id, patch: { text: 'y'.repeat(100) } } }); if (e.text.length !== 32) bad.push('a long text from a guest was not cut: ' + e.text.length);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.furnish.late-joiner-sees-every-ent-with-the-same-readout-contents-and-lights', async () => {
    X.reset(); const bad = []; role('host'); cap();
    await X.grid(-4, 8, 60, 2); const p2 = await X.K.put('pole', { x: -3, z: 2.4, dir: 0 }); if (!p2.ok) return 'second pole: ' + p2.why; const all = await X.furnishAll(); const E = (k) => all[k];
    E('silo').cargo = { '10:0': 600, '11:128': 400 }; E('dimdepot').cargo = { '5:0': 100, '6:128': 9 }; E('locker').cargo = { dynamite: 3, medkit: 2 }; E('pcrate').cargo = { timber: 500 };
    const i0 = toI(E('dimdepot').x), k0 = toK(E('dimdepot').z); X.mkVault(i0 + 8, k0 + 6, X.plushes(7, 12)); X.mkVault(i0 + 12, k0 + 6, X.plushes(2, 13));
    g.setCfg(E('sign'), { text: 'Hello', lit: true, tone: 'red', icon: 'star' }); g.setCfg(E('flood'), { deg: 200, tilt: 20 }); g.setCfg(E('wbeacon'), { mode: 'off' }); g.setCfg(E('clamp'), { mode: 'on' });
    X.run(2.5); F.scanNow(g);
    const cam = new V3(-9, 1.2, 8), hostLights = lightsNow(cam); if (hostLights.length < 3) return 'the host has only ' + hostLights.length + ' lights lit: ' + JSON.stringify(Object.values(all).map((e) => [e.type, e.pw])) + ' nets ' + JSON.stringify(g.power.nets.map((n) => [n.nodes.map((q) => q.type + '@' + q.i + ',' + q.k), n.supply, n.demand])) + ' clamp ' + JSON.stringify([all.clamp.x, all.clamp.y, all.clamp.z, all.clamp.i, all.clamp.j, all.clamp.k, all.clamp.mount, all.clamp.mode]);
    const hostInfo = {}; for (const [k, e] of Object.entries(all)) hostInfo[k] = JSON.stringify(infoFor(g, { kind: 'mach', id: e.id }));
    const row = hostRow(); if (!row) return 'no furnish row from the host';
    sent.length = 0; g.sendWorld(); const lists = ofType('ents'), flat = lists.flatMap((m) => m.list);
    for (const [k, e] of Object.entries(all)) { const l = flat.find((x) => x.id === e.id); if (!l) { bad.push(k + ' missing from the late joiner list'); continue; } for (const f of ['cargo', 'act', 'stored', 'items']) if (f in l) bad.push(`${k}: ${f} was sent`); if (l.type !== k) bad.push(k + ' type ' + l.type); }
    if (flat.some((x) => x.id < 0)) bad.push('the hidden intake crate of a silo was sent to the joiner');
    toGuest([...json(lists), json(row)]); F.scanNow(g); FSreset();
    EXT.update(g, 0.1, true); EXT.update(g, 0.1, true);
    for (const [k, e] of Object.entries(all)) {
      const v = ent(e.id), it = g.machines.items.get(e.id); if (!v || !v.view || !it || !it.obj.children.length) { bad.push(k + ': no guest copy'); continue; }
      if (v.cargo !== undefined) bad.push(k + ': the guest has the host contents');
      const gi = JSON.stringify(infoFor(g, { kind: 'mach', id: e.id })); if (gi !== hostInfo[k]) bad.push(`${k} readout differs:\n  guest ${gi}\n  host  ${hostInfo[k]}`);
    }
    if (L().byId.has(-E('silo').id) || L().byId.has(-E('dimdepot').id)) bad.push('the guest built an intake crate');
    const gl = lightsNow(cam); if (!same(gl, hostLights)) bad.push(`the guest lights differ: ${JSON.stringify(gl.map((l) => [l.type, +l.x.toFixed(2)]))} vs host ${JSON.stringify(hostLights.map((l) => [l.type, +l.x.toFixed(2)]))}`);
    // the silo gauge on the guest follows the row
    const gauge = g.machines.items.get(E('silo').id).obj.getObjectByName('fill'); if (!gauge || Math.abs(gauge.scale.y - 0.5) > 0.03) bad.push('silo gauge ' + (gauge && gauge.scale.y) + ', the silo is half full');
    return bad.length === 0 || bad.join(' || ');
    function FSreset() { F.FS.covT = 0; }
  });

  await guard('mp.furnish.storage-from-a-guest-moves-items-and-plush-and-refuses-forgeries', async () => {
    X.reset(); const bad = []; role('host'); cap(); const all = await X.furnishAll(); const { locker, pcrate, silo, dimdepot } = all;
    S().items = { dynamite: 10, medkit: 4 }; S().mats = { timber: 50 }; S().carry = [{ sp: 99, vr: 0 }]; g.T.carry = 50;
    const i0 = toI(dimdepot.x), k0 = toK(dimdepot.z); const vt = X.mkVault(i0 + 8, k0 - 6, X.plushes(6, 12)); F.scanNow(g);
    role('guest'); cap();
    const ask = (e, act) => { sent.length = 0; const r = g.setCfg(e, { act }); const cmd = sent.find((m) => m.t === 'cmd' && m.c === 'cfg'); return { r, cmd: cmd && json(cmd) }; };
    const host = (cmd) => { role('host'); cap(); g.netMessage(cmd); const out = sent.slice(); role('guest'); cap(); return out; };
    const state = () => JSON.stringify([S().items, S().mats, S().carry, locker.cargo, pcrate.cargo, silo.cargo, dimdepot.cargo, vt.stored.length]);
    // a locker and a crate: the guest asks, the host moves the shared items and answers with a toast and a fresh ent
    let a = ask(locker, { k: 'put', id: 'dynamite', n: 4 }); if (!a.r.ok || !a.cmd) return 'the guest could not ask: ' + JSON.stringify(a.r);
    if (S().items.dynamite !== 10) bad.push('the guest moved items by itself');
    let out = host(a.cmd); if (S().items.dynamite !== 6 || locker.cargo.dynamite !== 4) bad.push('locker put: ' + JSON.stringify([S().items.dynamite, locker.cargo]));
    if (!out.some((m) => m.t === 'toast' && /Stored 4/.test(m.text))) bad.push('no toast: ' + JSON.stringify(out.map((m) => m.t + ':' + (m.text || ''))));
    const plus = out.find((m) => m.t === 'ent+' && m.ent.id === locker.id); if (!plus || 'cargo' in plus.ent || 'act' in plus.ent) bad.push('ent+ carries the contents or the act key: ' + JSON.stringify(plus && Object.keys(plus.ent)));
    if ('act' in locker) bad.push('the act key stayed on the host ent');
    a = ask(locker, { k: 'take', id: 'dynamite', n: 3 }); out = host(a.cmd); if (S().items.dynamite !== 9 || locker.cargo.dynamite !== 1) bad.push('locker take: ' + JSON.stringify([S().items.dynamite, locker.cargo]));
    a = ask(pcrate, { k: 'put', id: 'timber', n: 30 }); host(a.cmd); if (S().mats.timber !== 20 || pcrate.cargo.timber !== 30) bad.push('crate put: ' + JSON.stringify([S().mats, pcrate.cargo]));
    // plush deposit: the guest sends its own plush, the host's hands are never touched; what does not fit comes back
    silo.cargo = { '9:0': 1998 }; const hostHands = JSON.stringify(S().carry);
    a = ask(silo, { k: 'dep', items: [1, 2, 3, 4, 5].map((sp) => ({ sp, vr: 0 })) }); out = host(a.cmd);
    if (Object.values(silo.cargo).reduce((x, y) => x + y, 0) !== 2000 || JSON.stringify(S().carry) !== hostHands) bad.push('silo after a deposit of 5 into 2 free places: ' + JSON.stringify(silo.cargo) + ' hands ' + JSON.stringify(S().carry));
    const back = out.find((m) => m.t === 'give'); if (!back || back.items.length !== 3 || back.items[0].sp !== 3) bad.push('the 3 that did not fit were not handed back: ' + JSON.stringify(back));
    silo.cargo = { '9:0': 5, '10:128': 4 };
    a = ask(silo, { k: 'get', sp: -1, n: 6 }); out = host(a.cmd); const give = out.find((m) => m.t === 'give');
    if (!give || give.items.length !== 6 || give.items.filter((q) => q.sp === 9).length !== 5 || JSON.stringify(S().carry) !== hostHands) bad.push('get from the silo: ' + JSON.stringify(give) + ' hands ' + JSON.stringify(S().carry));
    // the depot hands out from its pool (here a vault in range)
    a = ask(dimdepot, { k: 'get', sp: 12, n: 4 }); out = host(a.cmd); const g2 = out.find((m) => m.t === 'give'); if (!g2 || g2.items.length !== 4 || vt.stored.length !== 2) bad.push('depot pool get: ' + JSON.stringify(g2) + ' vault left ' + vt.stored.length);
    // too far away: refused, and nothing moves
    g.remote = { pos: { x: locker.x + 30, z: locker.z } }; const s0 = state(); a = ask(locker, { k: 'put', id: 'medkit', n: 1 }); out = host(a.cmd); g.remote = null;
    if (state() !== s0 || !out.some((m) => m.t === 'toast' && /far/i.test(m.text))) bad.push('a guest 30 m away moved something: ' + JSON.stringify(out.map((m) => m.text || m.t)));
    // forged commands
    const s1 = state(); const forged = [
      [silo, { k: 'dep', items: [{ sp: NEEDLE, vr: 0 }] }], [silo, { k: 'dep' }], [silo, { k: 'put', id: 'dynamite', n: 1 }], [locker, { k: 'dep', items: [{ sp: 3, vr: 0 }] }], [locker, { k: 'get', sp: 3, n: 1 }],
      [locker, { k: 'put', id: 'dynamite', n: -5 }], [locker, { k: 'put', id: 'dynamite', n: 1e9 }], [silo, { k: 'get', sp: -1, n: 1e9 }], [silo, { k: 'get', sp: 99999, n: 1 }], [locker, { k: 'put', n: 1 }], [locker, { k: 'smash', id: 'x', n: 1 }],
      [silo, { k: 'dep', items: Array.from({ length: 65 }, () => ({ sp: 3, vr: 0 })) }], [silo, { k: 'dep', items: [{ sp: 3, vr: 300 }] }], [silo, { k: 'dep', items: [{ sp: 3, vr: 0, evil: 1 }] }],
    ];
    for (const [e, act] of forged) { sent.length = 0; role('host'); cap(); g.netMessage({ t: 'cmd', c: 'cfg', d: { id: e.id, patch: { act: json(act) } } }); if (state() !== s1) bad.push('a forged act changed something: ' + JSON.stringify(act).slice(0, 80)); if (!sent.some((m) => m.t === 'toast')) bad.push('no toast for ' + JSON.stringify(act).slice(0, 60)); }
    // an id that is not an item is harmless, and never touches a prototype
    role('host'); cap(); for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) g.netMessage({ t: 'cmd', c: 'cfg', d: { id: locker.id, patch: { act: { k: 'take', id, n: 1 } } } }); if (state() !== s1 || ({}).dynamite !== undefined) bad.push('a prototype key did something');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.furnish.panel-buttons-work-for-a-guest', async () => {
    X.reset(); const bad = []; role('host'); cap(); const r = await X.onFloor('silo', -9, 4); if (!r.ok) return r.why; const e = r.ent;
    S().carry = X.plushes(5, 8); g.T.carry = 20; role('guest'); cap();
    F.openPanel(g, e); const body = document.getElementById('furnB'); const dep = body.querySelector('[data-a="dep"]'); if (!dep) return 'no store button in the guest panel';
    dep.click(); const cmd = sent.find((m) => m.t === 'cmd' && m.c === 'cfg'); if (!cmd || cmd.d.patch.act.k !== 'dep' || cmd.d.patch.act.items.length !== 5) bad.push('the button did not send the deposit: ' + JSON.stringify(cmd));
    if (S().carry.length !== 0) bad.push('the guest still holds the plush it sent');
    role('host'); cap(); g.netMessage(json(cmd)); if (X.count(e) !== 5) bad.push('host store ' + X.count(e));
    role('guest'); cap(); g.ui.closeModals();
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.furnish.row-is-silent-with-nothing-furnished-and-sends-only-changes', async () => {
    X.reset(); const bad = []; role('host'); cap();
    const rows = () => ofType('xrow').filter((m) => m.k === 'furnish'); const tickRow = () => { sent.length = 0; g._extRow = 0; EXT.update(g, 0.6, false); return rows(); };
    if (tickRow().length) bad.push('a row with nothing furnished');
    const w = X.wall(-2, 2); const lk = await X.putAt('locker', w.x, 0.9, w.z, 2); const sg = await X.onFloor('sign', -9, 4); if (!lk.ok || !sg.ok) return 'placing failed';
    const first = tickRow(); if (first.length !== 1) return 'no first row: ' + first.length; if (JSON.stringify(first[0]).length > 1500) bad.push('the row is not compact: ' + JSON.stringify(first[0]).length);
    for (let n = 0; n < 3; n++) if (tickRow().length) bad.push('an unchanged row was sent again');
    g.time += 6; if (tickRow().length !== 1) bad.push('no keepalive row after 5 s');
    lk.ent.cargo = { dynamite: 2 }; const r2 = tickRow(); if (r2.length !== 1 || r2[0].d.st[lk.ent.id].t !== 2) bad.push('the changed contents were not sent: ' + JSON.stringify(r2[0] && r2[0].d.st));
    // a guest never sends one and ignores junk
    role('guest'); cap(); g._extRow = 0; EXT.update(g, 1, true); if (rows().length) bad.push('a guest sent a row');
    for (const junk of [null, 5, 'x', [], { pw: 'no', st: 5 }, { pw: [1, NaN, 'a', 2], st: { 3: 7, 4: null } }, { pw: new Array(9999).fill(1) }]) { try { g.netMessage({ t: 'xrow', k: 'furnish', d: json(junk) }); } catch (err) { bad.push('junk row threw ' + err); } }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.furnish.lights-and-power-follow-the-host-after-every-change', async () => {
    X.reset(); const bad = []; role('host'); cap(); await X.grid(-4, 8, 60, 2);
    const fl = await X.onFloor('flood', -9, 8.6), st = await X.onFloor('strip', -7, 9), cl = await X.onFloor('clamp', -10, 10), bc = await X.onFloor('wbeacon', -9, 10.6); for (const r of [fl, st, cl, bc]) if (!r.ok) return r.why;
    g.setCfg(cl.ent, { mode: 'on' }); X.run(2.5); const cam = new V3(-9, 1.2, 9);
    const world = () => { sent.length = 0; g.sendWorld(); const l = json(ofType('ents')); return [...l, json(hostRow())]; };
    const msgs = world(), hostL = lightsNow(cam); if (hostL.length < 3) return 'the host has ' + hostL.length + ' lights';
    toGuest(msgs); F.FS.covT = 0; EXT.update(g, 0.1, true); let gl = lightsNow(cam); if (!same(gl, hostL)) bad.push('first look differs: ' + gl.length + ' vs ' + hostL.length);
    for (const e of [fl.ent, st.ent, cl.ent]) if (Math.abs((ent(e.id).pw ?? -1) - 1) > 0.005) bad.push(e.type + ' pw on the guest ' + ent(e.id).pw);
    // the host switches the floodlight off: ent- / ent+ and a row reach the guest
    done(); for (const it of [...g.machines.items.values()]) if (F.KINDS.includes(it.ent.type)) g.removeViewEnt(it.ent.id);
    S().entities.push(fl.ent, st.ent, cl.ent, bc.ent); for (const e of [fl.ent, st.ent, cl.ent, bc.ent]) g.addEntity(e); role('host'); cap(); g.setCfg(fl.ent, { mode: 'off' }); X.run(2.5);
    const upd = sent.filter((m) => m.t === 'ent-' || m.t === 'ent+'); const row = hostRow(); const hostL2 = lightsNow(cam);
    if (hostL2.length !== hostL.length - 1) bad.push('the host did not lose one light: ' + hostL2.length + ' of ' + hostL.length);
    toGuest([...json(msgs.filter((m) => m.t === 'ents')), ...json(upd), json(row)]); F.FS.covT = 0; EXT.update(g, 0.1, true); gl = lightsNow(cam); if (!same(gl, hostL2)) bad.push('after the change the guest shows ' + gl.length + ' lights, the host ' + hostL2.length);
    // a brownout (the grid loses its generators): the host row says 0 and the guest lights go out
    done(); for (const it of [...g.machines.items.values()]) if (F.KINDS.includes(it.ent.type)) g.removeViewEnt(it.ent.id);
    S().entities.push(...[fl.ent, st.ent, cl.ent, bc.ent].filter((e) => !ent(e.id))); for (const e of [fl.ent, st.ent, cl.ent, bc.ent]) if (!g.machines.items.has(e.id)) g.addEntity(e); role('host'); cap();
    for (const t of L().tiles.values()) if (t.type === 'gen') { t.burn = 0; t.q.length = 0; } X.run(3);
    const dark = hostRow(); if (lightsNow(cam).length) bad.push('the host still has lights with no power');
    toGuest([...json(msgs.filter((m) => m.t === 'ents')), json(dark)]); F.FS.covT = 0; EXT.update(g, 0.1, true); if (lightsNow(cam).length) bad.push('the guest still lights with no power');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.furnish.beacon-flashes-on-the-guest-screen-from-the-hosts-alarm', async () => {
    X.reset(); const bad = []; role('host'); cap(); await X.grid(-4, 8, 60, 1); const r = await X.onFloor('wbeacon', -8, 10); if (!r.ok) return r.why; X.run(1.6);
    g.alarmGate = { alarm: true }; X.run(1);
    sent.length = 0; g.sendWorld(); const ents = json(ofType('ents')); const row = json(hostRow()); if (row.d.al !== 1) bad.push('the row lacks the alarm: ' + JSON.stringify(row.d));
    g.alarmGate = null; toGuest([...ents, row]); const cam = new V3(-8, 1.2, 8), seen = new Set();
    for (let q = 0; q < 60; q++) { g.time += 0.025; EXT.update(g, 0.025, true); seen.add(lightsNow(cam).some((l) => l.type === 'wbeacon')); }
    if (!(seen.has(true) && seen.has(false))) bad.push('the guest beacon did not flash on and off: ' + [...seen]);
    g.netMessage({ t: 'xrow', k: 'furnish', d: { pw: row.d.pw, st: row.d.st, al: 0, tr: [] } }); seen.clear(); for (let q = 0; q < 60; q++) { g.time += 0.025; EXT.update(g, 0.025, true); seen.add(lightsNow(cam).some((l) => l.type === 'wbeacon')); }
    if (seen.has(true)) bad.push('the guest beacon kept flashing after the alarm ended');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.furnish.silo-and-output-vault-sync-and-the-intake-crate-stays-on-the-host', async () => {
    X.reset(); const bad = []; role('host'); cap();
    const s = await X.onFloor('silo', -9, 4); craft('ovault'); selectTool('ovault'); aimPoint(-9, 0, 2, 2); const pl = await plan(); if (!s.ok || !pl.ok) return 'placing failed ' + (s.why || pl.why);
    const before = X.ids(); g.placeCurrent(g.curTool()); const ov = S().entities.find((x) => !before.has(x.id)); if (!ov) return 'no output vault';
    const plus = ofType('ent+'); if (plus.some((m) => m.ent.id < 0)) bad.push('the hidden intake crate was announced');
    const pv = plus.find((m) => m.ent.id === ov.id); if (!pv || pv.ent.out !== true || pv.ent.type !== 'vault') bad.push('ent+ for the output vault: ' + JSON.stringify(pv && pv.ent));
    const ps = plus.find((m) => m.ent.id === s.ent.id); if (!ps || 'cargo' in ps.ent || ps.ent.filter !== -1) bad.push('ent+ for the silo: ' + JSON.stringify(ps && ps.ent));
    if (S().entities.some((x) => x.id < 0)) bad.push('the intake crate is in the save');
    const msgs = json(plus); const ovId = ov.id, siloId = s.ent.id;
    // the guest: drop both, replay
    done(); L().remove(L().byId.get(ovId)); S().entities = S().entities.filter((x) => x.id !== ovId); g.removeViewEnt(siloId); for (const t of [...L().tiles.values()]) if (t.intakeFor) L().remove(t);
    role('guest'); cap(); for (const m of msgs) g.netMessage(m); EXT.update(g, 0.1, true);
    const gt = L().byId.get(ovId); if (!gt || gt.out !== true || !L().objs.get(ovId).userData.outMark) bad.push('the guest vault is not an output vault with a chute');
    if (!g.machines.items.has(siloId) || L().byId.has(-siloId)) bad.push('guest silo or an intake crate on the guest');
    const info = infoFor(g, { kind: 'tile', id: ovId }); if (!/OUTPUT/.test(info.lines.join(' '))) bad.push('guest readout ' + info.lines.join(' | '));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.furnish.guest-placements-are-rebuilt-and-rechecked-by-the-host', async () => {
    X.reset(); const bad = []; const w = X.wall(-2, 2);
    S().money = 1e12; craft('locker', 3); craft('pcrate', 2); S().hotbar = ['hammer', 'locker', 'pcrate', null, null, null, null, null, null]; g.rebuildTools();
    selectTool('locker'); aimPoint(w.x, 0.9, w.z, 2); const pl = await plan(); if (!pl.ok) return pl.why; const good = json(g.plan.ent);
    role('host'); cap();
    const send = (kind, e) => { sent.length = 0; const n0 = S().entities.length, c0 = S().items[kind] || 0; g.netMessage({ t: 'cmd', c: 'place', d: { tool: { id: kind, kind }, ent: e === undefined ? undefined : json(e) } }); return { added: S().entities.length - n0, used: c0 - (S().items[kind] || 0), toast: sent.find((m) => m.t === 'toast') }; };
    const refuse = (name, kind, e) => { const r = send(kind, e); if (r.added || r.used || !r.toast) bad.push(`${name}: ${JSON.stringify(r)}`); };
    refuse('a locker on the floor', 'locker', { ...good, mount: 'floor' });
    refuse('an unknown mount', 'locker', { ...good, mount: 'sky' });
    refuse('a far cell', 'locker', { ...good, i: 1e9 }); refuse('a fractional cell', 'locker', { ...good, i: good.i + 0.5 }); refuse('a bad facing', 'locker', { ...good, dir: 9 }); refuse('a missing facing', 'locker', { ...good, dir: undefined });
    refuse('no ent', 'locker', undefined); refuse('a string for an ent', 'locker', 'locker');
    refuse('no wall behind it', 'locker', { ...good, i: good.i - 4 });
    refuse('inside the pile', 'locker', { ...good, i: good.i + 1 });
    refuse('a crate on a wall', 'pcrate', { ...good });
    const ok = send('locker', { ...good, x: 99999, y: -5, z: 99999, h: 1e9, cargo: { dynamite: 99 }, id: 5, type: 'sign', filter: 3 });
    if (ok.added !== 1 || ok.used !== 1) bad.push('a clean placement was refused: ' + JSON.stringify(ok));
    const built = S().entities[S().entities.length - 1]; if (!built || built.type !== 'locker' || Math.abs(built.x - good.x) > 1e-9 || Math.abs(built.y - good.y) > 1e-9 || Math.abs(built.h - 1.2) > 1e-9 || built.cargo === undefined || Object.keys(built.cargo).length || built.id === 5 || 'filter' in built) bad.push('the host used forged fields: ' + JSON.stringify(built));
    refuse('the same wall spot twice', 'locker', { ...good });
    // a forged tool that names a kind the guest does not own
    S().items.silo = 0; const r = send('silo', { mount: 'floor', i: toI(-9), j: 0, k: toK(4), dir: 0 }); if (r.added) bad.push('a silo came from nothing: ' + JSON.stringify(r));
    return bad.length === 0 || bad.join(' || ');
  });
}
