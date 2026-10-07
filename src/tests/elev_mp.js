// mp.elev.*: the Elevator in a game with a friend, with no network: one page plays both roles by switching g.net.role and capturing g.netSend.
// The host owns everything: it scans the shaft, runs the rails out, moves and carries the cab, answers calls and refusals. A guest sees the ent (ent+), the 0.5 s `transit` row
// (cab height, rails, why the shaft ends where it does, the stops with their landing sides) and asks through the `cfg` command (call, go) and `place`.
import { kit } from './transit_lib.js';
import * as TR from '../transit.js';
import * as EXT from '../ext.js';
import { infoFor } from '../info.js';
import { RemotePlayer } from '../net.js';

export default async function (ctx) {
  const { T, g, S, w, p, adv, craft, V3, toI, toK, plan } = ctx;
  const X = kit(ctx), K = X.K;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); if (g.world) g.world.onSet = null; g.netOut.length = 0; if (g.remote) { g.remote.dispose(g.renderer.scene); g.remote = null; } };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { const h0 = g.ui.hint; try { return await fn(); } finally { g.ui.hint = h0; done(); X.clean(); } });
  const hostWorld = () => { role('host'); cap(); g.world.onSet = (i, j, k, sp, vr) => g.netOut.push(i, j, k, sp, vr); g.netOut.length = 0; };
  const flush = () => { g._nt = 0; g.netUpdate(0.2); };
  const row = () => { g._extRow = 0; EXT.update(g, 0, false); };
  const friend = (x, y, z) => { if (!g.remote) g.remote = new RemotePlayer(g.renderer.scene, 'Friend'); g.remote.pos.set(x, y, z); g.remote.target.set(x, y, z); };
  const I0 = () => toI(-14), K0 = () => toK(3);
  const text = (e) => infoFor(g, { kind: 'mach', id: e.id }).lines.join(' | ');
  // a three stop elevator: home 30 with a south landing, a pad ledge on the west at 18, the bottom at 6; the rails run out and the cab is on its way
  const build = () => {
    const L0 = X.lift(I0(), K0(), { home: 30, depth: 24, top: 38 }); X.tunnel(L0, 30, 1, 6); X.ledge(L0, 18, 2); TR.refreshShaft(g, L0); L0.ex = L0.tr; X.powerCab(L0, 2); p().pos.set(L0.px - 9, 0, L0.pz - 9); g.keys = {}; adv(0.7);
    return L0;
  };
  const wipe = (e) => { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } TR.removeLift(g, e); S().entities = S().entities.filter((x) => x.id !== e.id); };
  const FIELDS = ['type', 'i0', 'k0', 'j', 'rid', 'tr', 'sg', 'wy', 'wr', 'cut'];
  const describe = (e) => { const o = {}; for (const k of FIELDS) if (e[k] !== undefined) o[k] = e[k]; return o; };

  await guard('mp.elev.hoistway-state-reaches-the-guest-and-both-screens-read-the-same', async () => {
    X.setup(); hostWorld(); const bad = [], L0 = build();
    // frozen mid-flight with the rails still running out: the states a guest must show
    L0.cy = 13.2; L0.tg = 18; L0.mv = -1; L0.q = [6]; L0.xt = 1; L0.ex = L0.tr - 0.5; L0.dw = 0; flush(); row();
    const plus = ofType('ent+').filter((m) => m.ent.id === L0.id), rows = ofType('xrow').filter((m) => m.k === 'transit');
    if (plus.length !== 1) bad.push('the elevator was announced ' + plus.length + ' times'); if (!rows.length) return 'no transit row was sent';
    const hostEnt = json(L0), hostRead = text(L0), hostStops = TR.floorsOf(g, L0).join(), rowMsg = json(rows[rows.length - 1]), entMsg = json(plus[0]);
    wipe(L0); done(); role('guest'); cap(); g.netMessage(json(entMsg)); g.netMessage(json(rowMsg)); EXT.update(g, 0, true);
    const G = S().entities.find((x) => x.id === hostEnt.id); if (!G || !G.view || !g.machines.items.get(hostEnt.id)) return 'the elevator is missing on the guest';
    if (JSON.stringify(describe(G)) !== JSON.stringify(describe(hostEnt))) bad.push(`the ent differs: ${JSON.stringify(describe(G))} vs ${JSON.stringify(describe(hostEnt))}`);
    if (!(Math.abs(G.cy - 13.2) < 0.011 && G.tg === 18 && G.mv === -1 && G.q.length === 1 && G.xt === 1 && Math.abs(G.ex - (G.tr - 0.5)) < 0.11)) bad.push(`state on the guest: cy ${G.cy} tg ${G.tg} mv ${G.mv} q ${G.q} xt ${G.xt} ex ${G.ex} tr ${G.tr}`);
    if (TR.floorsOf(g, G).join() !== hostStops) bad.push(`stops on the guest ${TR.floorsOf(g, G)}, host ${hostStops}`); if (hostStops !== '18,30') bad.push('the host stops while the rails run out: ' + hostStops);
    const gr = text(G); if (gr !== hostRead) bad.push(`readout differs:\n  guest ${gr}\n  host  ${hostRead}`);
    // the guest draws it too: three stops, two landings with panels, the rails as long as the extension
    const obj = g.machines.items.get(G.id).obj, panels = obj.getObjectByName('panels'); if (!panels || panels.children.length !== 2) bad.push('call panels on the guest: ' + (panels && panels.children.length));
    const rails = obj.getObjectByName('rails'); const hs = []; rails.traverse((c) => { if (c.name === 'rail') hs.push(c.scale.y); }); if (hs.length !== 4 || Math.abs(hs[0] - ((G.ex + 4) * 0.6)) > 0.02) bad.push('rails on the guest ' + hs.map((h) => h.toFixed(2)));
    // between rows the guest carries the cab and the rails on at the host's pace
    const y0 = G.cy, e0 = G.ex; EXT.update(g, 0.2, true); if (!(G.cy < y0 - 0.4)) bad.push('the guest cab did not carry on between rows: ' + G.cy); if (!(G.ex > e0)) bad.push('the guest rails did not run out between rows: ' + G.ex);
    // a guest never reserves anything for it, never scans, and has no cab box
    if (X.reservedAt(G.i0 + 1, 30, G.k0 + 1)) bad.push('a guest view reserved the cab box'); if (TR.TS.rv.has(G.id)) bad.push('a guest view kept a box');
    wipe(G); return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.elev.late-joiner-sees-the-elevator-with-its-shaft', async () => {
    X.setup(); hostWorld(); const bad = [], L0 = build(); L0.cy = 10.8; L0.tg = null; L0.cut = 0; flush();
    const hostEnt = json(L0), hostRead = text(L0); cap(); g.sendWorld(); const msgs = json(sent.filter((m) => m.t === 'diff' || m.t === 'ents')); if (!msgs.some((m) => m.t === 'ents')) return 'sendWorld sent ' + sent.map((m) => m.t).join();
    row(); const rowMsg = json(sent.filter((m) => m.t === 'xrow' && m.k === 'transit').pop());
    wipe(L0); done(); role('guest'); cap(); for (const m of msgs) g.netMessage(json(m)); g.netMessage(json(rowMsg)); EXT.update(g, 0, true);
    const G = S().entities.find((x) => x.id === hostEnt.id); if (!G || !G.view) return 'a late joiner lacks the elevator';
    if (G.tr !== hostEnt.tr || TR.floorsOf(g, G).join() !== '6,18,30' || Math.abs(G.cy - 10.8) > 0.011) bad.push(`late joiner state: tr ${G.tr} stops ${TR.floorsOf(g, G)} cy ${G.cy}`);
    if (text(G) !== hostRead) bad.push(`readout differs for a late joiner:\n  guest ${text(G)}\n  host  ${hostRead}`);
    wipe(G); return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.elev.guest-asks-and-the-host-decides-with-the-reason', async () => {
    X.setup(); hostWorld(); const bad = [], L0 = build();
    const guestAsks = (patch) => { role('guest'); cap(); const r = g.setCfg(L0, patch); const cmd = json(sent.filter((m) => m.t === 'cmd').pop() || null); done(); hostWorld(); return { r, cmd }; };
    const hostRuns = (cmd) => { sent.length = 0; if (!cmd) return null; g.netMessage(json(cmd)); return { toast: ofType('toast')[0] }; };
    // a call to a landing, a rider key, a call to something that is not a stop
    let a = guestAsks({ call: 18 }); if (!a.r.ok || !a.cmd || a.cmd.c !== 'cfg') bad.push('the guest call did not become a cfg command: ' + JSON.stringify(a)); hostRuns(a.cmd); if (L0.q.join() !== '18' && L0.tg !== 18) bad.push('the guest call did not reach the elevator: q ' + L0.q + ' tg ' + L0.tg); if (L0.call !== undefined) bad.push('the write only key was left on the ent');
    L0.q = []; L0.tg = null; L0.dw = 0; L0.cy = 18 * 0.6; a = guestAsks({ call: 21 }); let h = hostRuns(a.cmd); if (!h.toast || !/does not stop/.test(h.toast.text) || L0.q.length) bad.push('a call to a row that is not a stop was taken: ' + JSON.stringify(h));
    a = guestAsks({ go: 1 }); hostRuns(a.cmd); if (L0.q.join() !== '30' && L0.tg !== 30) bad.push('the rider key up did not reach the elevator: ' + L0.q + ' ' + L0.tg); L0.q = []; L0.tg = null; L0.cy = 6 * 0.6;
    a = guestAsks({ go: -1 }); h = hostRuns(a.cmd); if (!h.toast || !/lowest stop/.test(h.toast.text) || !/dig it deeper|No shaft|ends at/.test(h.toast.text)) bad.push('down at the bottom gave no reason: ' + JSON.stringify(h));
    // an unshored shaft: the guest is told why the cab goes no further
    L0.cy = 18 * 0.6; L0.tg = null; L0.q = []; for (const s of [...w().supports]) { const fe = S().entities.find((e) => e.id === s.id); if (fe) { X.decon(fe); } } w().supports = []; adv(0.7);
    if (L0.wy !== 'unsupported') bad.push('no frames and the shaft is not unsupported: ' + L0.wy);
    a = guestAsks({ go: -1 }); h = hostRuns(a.cmd); if (L0.tg !== null && L0.tg < 18) bad.push('the cab went on into the unshored stretch');
    // bad settings are refused whole
    for (const patch of [{ call: 99 }, { call: -1 }, { go: 2 }, { cy: 5 }, { tg: 3 }, { tr: 99 }, { ex: 99 }, { sg: [[1, 2, 3]] }, { j: 5 }, { cut: 0 }]) { const before = JSON.stringify([L0.cy, L0.tr, L0.ex, L0.sg, L0.j, L0.cut]); hostRuns(json({ t: 'cmd', c: 'cfg', d: { id: L0.id, patch } })); if (JSON.stringify([L0.cy, L0.tr, L0.ex, L0.sg, L0.j, L0.cut]) !== before) bad.push(JSON.stringify(patch) + ' changed the elevator'); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.elev.a-cut-shaft-reaches-the-guest-as-a-toast-and-a-row', async () => {
    X.setup(); hostWorld(); const bad = [], L0 = build(); L0.q = []; sent.length = 0;
    w().setCell(L0.i0 + 1, 14, L0.k0 + 2, 2, 0); adv(0.7); const t = ofType('toast').filter((m) => /cut at 8\.4 m/.test(m.text || '')); if (!t.length) bad.push('the friend was not told where the shaft is cut: ' + JSON.stringify(ofType('toast')));
    row(); const rowMsg = json(ofType('xrow').filter((m) => m.k === 'transit').pop()), a = rowMsg.d.lf.find((q) => q[0] === L0.id); if (!a || a[7] !== 15 || a[8] !== 15) bad.push('the row does not carry the cut and the reach: ' + JSON.stringify(a && a.slice(0, 14)));
    const hostEnt = json(L0), hostRead = text(L0), entMsg = { t: 'ent+', ent: json(L0) }; wipe(L0); done(); role('guest'); cap(); g.netMessage(json(entMsg)); g.netMessage(json(rowMsg)); EXT.update(g, 0, true);
    const G = S().entities.find((x) => x.id === hostEnt.id); if (!G || G.cut !== 15 || G.tr !== 15) bad.push('the guest does not know of the cut: ' + (G && JSON.stringify({ cut: G.cut, tr: G.tr }))); else { if (text(G) !== hostRead) bad.push(`the readout differs:\n  guest ${text(G)}\n  host  ${hostRead}`); if (!/cut at 8\.4 m: plush is in it/.test(text(G))) bad.push('the guest readout does not say where: ' + text(G).slice(0, 300)); wipe(G); }
    w().setCell(L0.i0 + 1, 14, L0.k0 + 2, 0, 0);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.elev.guest-places-and-the-host-checks-it', async () => {
    X.setup(); const bad = [], i = I0(), k = K0(); craft('plift', 2); K.equip('plift');
    role('guest'); cap(); K.aim(i, k, { y: 0, back: 3.4 }); const pl = await plan(); if (!pl.ok) { done(); return 'guest plan: ' + pl.why; }
    const n0 = S().entities.length, items0 = S().items.plift; g.placeCurrent(g.curTool()); const cmds = sent.filter((m) => m.t === 'cmd');
    if (cmds.length !== 1 || cmds[0].c !== 'place' || cmds[0].d.ent.type !== 'plift') bad.push('the elevator was not one place message: ' + JSON.stringify(sent.map((m) => m.t + (m.c ? ':' + m.c : '')))); if (S().entities.length !== n0 || S().items.plift !== items0) bad.push('a guest placed or paid on its own');
    const cmd = json(cmds[0] || {}); done(); X.clean(); X.setup(); hostWorld(); craft('plift', 2); g.netMessage(json(cmd));
    const E = X.ents('plift')[0]; if (!E || E.tr !== 0 || E.cy !== E.j * 0.6 || S().items.plift !== 1) bad.push('the host did not build the guest elevator: ' + JSON.stringify(E)); if (ofType('ent+').filter((m) => m.ent.type === 'plift').length !== 1) bad.push('the elevator was not announced');
    // tampering: plush in the opening, a second cab on the first, an opening in the air, rails and stops the message claims
    const tool = { id: 'plift', kind: 'plift' }, msg = (e) => ({ t: 'cmd', c: 'place', d: { tool, ent: e } });
    for (const [name, e] of [['on the first cab', { type: 'plift', i0: E.i0, k0: E.k0, j: E.j }], ['in the air', { type: 'plift', i0: I0() + 20, k0: K0(), j: 30 }], ['float', { type: 'plift', i0: 1.5, k0: 3, j: 0 }], ['string', { type: 'plift', i0: '4', k0: 3, j: 0 }], ['the hall roof', { type: 'plift', i0: I0() + 20, k0: K0(), j: 70 }]]) {
      sent.length = 0; const n1 = S().entities.length, it1 = JSON.stringify(S().items); try { g.netMessage(json(msg(e))); } catch (x) { bad.push(name + ' threw ' + x.message); } if (S().entities.length !== n1 || JSON.stringify(S().items) !== it1) bad.push(name + ' changed the world or the items'); }
    w().setCell(I0() + 21, 1, K0() + 1, 2, 0); sent.length = 0; const n2 = S().entities.length; g.netMessage(json(msg({ type: 'plift', i0: I0() + 20, k0: K0(), j: 0 }))); if (S().entities.length !== n2 || !ofType('toast').length) bad.push('plush in the opening was not refused with a toast'); w().setCell(I0() + 21, 1, K0() + 1, 0, 0);
    sent.length = 0; g.netMessage(json(msg({ type: 'plift', i0: I0() + 26, k0: K0(), j: 0, tr: 40, ex: 40, cy: 9, sg: [[0, 0, 0]], cut: 3, wy: 'cap', xt: 1 }))); const E2 = X.ents('plift').find((e) => e.i0 === I0() + 26); if (!E2 || E2.tr !== 0 || E2.ex !== 0 || E2.cy !== 0 || E2.cut || E2.xt) bad.push('the elevator took the state the message claimed: ' + JSON.stringify(E2 && { tr: E2.tr, ex: E2.ex, cy: E2.cy, cut: E2.cut, xt: E2.xt }));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.elev.guest-hammer-takes-the-elevator-down-on-the-host', async () => {
    X.setup(); hostWorld(); const bad = [], L0 = build(); S().items = {};
    role('guest'); cap(); g.cmd('decon', { kind: 'mach', id: L0.id }); const cmd = json(sent.filter((m) => m.t === 'cmd').pop()); done(); hostWorld(); sent.length = 0;
    g.netMessage(json(cmd)); if (g.machines.items.has(L0.id) || S().items.plift !== 1 || X.reservedAt(L0.i0 + 1, 30, L0.k0 + 1)) bad.push('the host did not take the elevator down: ' + JSON.stringify(S().items)); if (!ofType('ent-').some((m) => m.id === L0.id)) bad.push('the guest was not told');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.elev.two-riders-the-friend-in-the-cab-never-blocks-it-and-under-it-always-does', async () => {
    X.setup(); hostWorld(); const bad = [], L0 = build();
    p().pos.set(L0.px, 18.0, L0.pz); p().vel.set(0, 0, 0); adv(0.3); if (p().liftId !== L0.id) return 'the host player did not board';
    friend(L0.px + 0.4, 18.0, L0.pz - 0.4); adv(0.2);   // both inside
    TR.requestFloor(g, L0, 18); adv(3.0); if (L0.blk || Math.abs(L0.cy - 10.8) > 1e-6) bad.push(`with both inside the cab was blocked or late: cy ${L0.cy} blk ${L0.blk}`);
    // the friend steps out onto the west pad ledge, the host rides on to the bottom
    friend(L0.px - 1.7, 10.8, L0.pz); adv(1.5); TR.requestFloor(g, L0, 6); adv(3.5); if (Math.abs(L0.cy - 3.6) > 1e-6) bad.push('the cab did not take the host down: ' + L0.cy);
    // the host steps out, the friend stands under the cab at the bottom while it comes down from home
    p().liftId = 0; p().pos.set(L0.px - 6, 0, L0.pz - 6); p().vel.set(0, 0, 0); adv(0.3); TR.requestFloor(g, L0, 30); adv(6.5); if (Math.abs(L0.cy - 18.0) > 1e-6) bad.push('setup: the cab did not go home: ' + L0.cy);
    friend(L0.px, 3.6, L0.pz); TR.requestFloor(g, L0, 6); adv(5.0); if (!L0.blk || !(L0.cy > 3.6 + 1.9 && L0.cy < 3.6 + 2.7)) bad.push(`the cab came down on the friend: cy ${L0.cy.toFixed(2)} blk ${L0.blk}`); if (!/under the cab/.test(text(L0))) bad.push('the readout does not say why it stopped');
    friend(L0.px - 6, 3.6, L0.pz - 6); adv(2.0); if (Math.abs(L0.cy - 3.6) > 1e-6 || L0.blk) bad.push('the cab did not go on once the friend left: ' + L0.cy);
    // the same row tells the guest it is stopped for a person
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.elev.rows-stay-small-and-a-bad-row-is-harmless', async () => {
    X.setup(); hostWorld(); const bad = [], L0 = build(); sent.length = 0; row(); const rr = ofType('xrow').filter((m) => m.k === 'transit'); if (rr.length !== 1) return 'rows ' + rr.length;
    const a = rr[0].d.lf.find((q) => q[0] === L0.id); if (!a || a.length !== 15 || JSON.stringify(a).length > 260) bad.push('the elevator row is not small: ' + JSON.stringify(a).length + ' bytes ' + JSON.stringify(a));
    done(); role('guest'); cap();
    for (const junk of [{ lf: [[L0.id, 5, 3, 9, -5, 'q', 9, 9, 'x', 'y', 77, 'z', NaN, -1, 5]] }, { lf: [[L0.id, NaN, 3, 0, 100, 0, 0, 0, 999, 99999, 7, 1e9, -5, 1e9, [1, 2, 3, 99, 9, 9, NaN, 1, 1, 'a', 2]]] }, { lf: [[L0.id, 100, -1, 0, 100, 0, 0, 0, 5, 50, 1, 5, 0, 24, 'not an array']] }, { lf: [[L0.id]] }]) {
      try { g.netMessage({ t: 'xrow', k: 'transit', d: junk }); } catch (x) { bad.push('a bad row threw: ' + x.message + ' for ' + JSON.stringify(junk)); }
      if (!Number.isFinite(L0.cy) || !(L0.tr >= 0 && L0.tr <= 72) || !(L0.ex >= 0 && L0.ex <= 72) || !Array.isArray(L0.sg) || !L0.sg.length || L0.sg.some((q) => !(q[0] >= 0 && q[0] <= 72 && q[1] >= -1 && q[1] <= 3 && q[2] >= 0 && q[2] <= 3)) || !['bottom', 'home', 'floor', 'blocked', 'unsupported', 'cap'].includes(L0.wy)) { bad.push('a bad row left out of range values: ' + JSON.stringify({ cy: L0.cy, tr: L0.tr, ex: L0.ex, sg: L0.sg, wy: L0.wy })); break; }
    }
    return bad.length === 0 || bad.join(' || ');
  });
}
