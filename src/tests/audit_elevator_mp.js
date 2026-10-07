// mp.elev.audit.*: the elevator in a game with a friend, attacked. One page plays both roles by switching g.net.role and capturing g.netSend (see elev_mp.js).
// Rows (`xrow`) travel from the host to the guest only: a host must never act on one that a guest sends, or the guest could set the host's cab, doors and pads.
import { kit } from './transit_lib.js';
import * as TR from '../transit.js';
import * as EXT from '../ext.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, w, p, adv, craft, toI, toK } = ctx;
  const X = kit(ctx);
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); if (g.world) g.world.onSet = null; g.netOut.length = 0; if (g.remote) { g.remote.dispose(g.renderer.scene); g.remote = null; } };
  const guard = (name, fn) => T(name, async () => { const h0 = g.ui.hint; try { return await fn(); } finally { g.ui.hint = h0; done(); X.clean(); g.dead = false; g.blacking = false; g.hp = g.hpMax; } });
  const text = (e) => infoFor(g, { kind: 'mach', id: e.id }).lines.join(' | ');
  const I0 = () => toI(-20), K0 = () => toK(4);

  await guard('mp.elev.audit.a-host-ignores-rows-a-guest-sends', async () => {
    X.setup(); role('host'); cap(); const bad = [], i = I0(), k = K0();
    const D = X.door(i, k, { lock: 'key', auto: false }), L0 = X.lift(i + 12, k, { home: 24, depth: 16, top: 30 }), J = X.jump(i + 24, k, { ang: 55, hd: 120 }); X.powerCab(L0, 2); adv(0.7);
    J.buf = 0; J.cool = 9; J.pw = 1;
    const snap = () => JSON.stringify({ D: [D.p, D.tgt, D.st, D.lock], L: [L0.cy, L0.tg, L0.mv, L0.tr, L0.ex, L0.cut, L0.wy, L0.wr, L0.sg, L0.cm, L0.q.length, L0.blk, L0.crank], J: [J.buf, J.cool, J.act, J.on] });
    const s0 = snap();
    const rows = [
      { dr: [[D.id, 1000, 1, 0, 100]] },
      { lf: [[L0.id, 600, -1, 0, 100, 0, 0, 0, 16, 160, 0, 0, 0, 64, [24, -1, 0]]] },
      { lf: [[L0.id, 1440, 6, -1, 100, 3, 3, 5, 72, 720, 1, 5, 99, 64, [0, 0, 0, 24, 1, 1]]] },
      { jp: [[J.id, 5, 0, 100, 1, 0]] },
      { ev: { k: 'launch', id: J.id, vx: 5, vy: 8, vz: 0 } },
    ];
    p().pos.set(J.x, J.y + 0.05, J.z); p().vel.set(0, 0, 0);
    for (const d of rows) { try { g.netMessage(json({ t: 'xrow', k: 'transit', d })); } catch (x) { bad.push('a forged row threw ' + x.message); } }
    if (snap() !== s0) bad.push('the host took a guest row:\n  ' + s0 + '\n  ' + snap());
    if (p().flight || p().launched) bad.push('the host player was launched by a row from a guest');
    // the real direction still works: as a guest, the same rows are applied
    done(); role('guest'); cap(); g.netMessage(json({ t: 'xrow', k: 'transit', d: { jp: [[J.id, 3, 0, 100, 0, 1]] } })); if (J.buf !== 3) bad.push('a guest no longer takes the host row: buf ' + J.buf);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.elev.audit.a-late-joiner-sees-a-cut-shaft-and-a-stranded-cab-the-same-way', async () => {
    X.setup(); role('host'); cap(); const bad = [], i = I0(), k = K0();
    const L0 = X.lift(i, k, { home: 30, depth: 24, top: 38 }); X.tunnel(L0, 18, 0, 6); X.powerCab(L0, 2); TR.refreshShaft(g, L0); L0.ex = L0.tr; adv(0.7);
    L0.cy = 10.8; L0.tg = null; L0.q = []; adv(0.3); w().setCell(L0.i0 + 1, 14, L0.k0 + 2, 2, 0); adv(1.2);
    if (!L0.cut) return 'setup: no cut ' + L0.cut;
    const hostRead = text(L0), hostStops = TR.floorsOf(g, L0).join(), hostEnt = json(L0);
    g._nt = 0; g.netUpdate(0.2); g._extRow = 0; EXT.update(g, 0, false); sent.length = 0; g.sendWorld(); g._extRow = 0; EXT.update(g, 0, false);
    const ents = json(sent.filter((m) => m.t === 'ents')), rows = json(sent.filter((m) => m.t === 'xrow' && m.k === 'transit'));
    if (!ents.length) return 'sendWorld sent ' + sent.map((m) => m.t).join(); if (!rows.length) return 'no transit row after sendWorld';
    const wipe = (e) => { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } TR.removeLift(g, e); S().entities = S().entities.filter((x) => x.id !== e.id); };
    wipe(L0); done(); role('guest'); cap(); for (const m of ents) g.netMessage(json(m)); for (const m of rows) g.netMessage(json(m));
    const G = S().entities.find((x) => x.id === hostEnt.id); if (!G) return 'the late joiner did not get the elevator';
    if (G.cut !== hostEnt.cut || TR.floorsOf(g, G).join() !== hostStops) bad.push(`cut ${G.cut} vs ${hostEnt.cut}, stops ${TR.floorsOf(g, G)} vs ${hostStops}`);
    if (text(G) !== hostRead) bad.push(`readout differs:\n  guest ${text(G)}\n  host  ${hostRead}`);
    if (!/cut at 8\.4 m/.test(text(G))) bad.push('the late joiner is not told where the shaft is cut');
    wipe(G); return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.elev.audit.a-guest-call-is-answered-once-and-a-flood-never-grows-the-queue', async () => {
    X.setup(); role('host'); cap(); const bad = [], i = I0(), k = K0();
    const L0 = X.lift(i, k, { home: 30, depth: 24, top: 38 }); X.tunnel(L0, 18, 0, 6); X.powerCab(L0, 2); TR.refreshShaft(g, L0); L0.ex = L0.tr; adv(0.7);
    for (let n = 0; n < 60; n++) g.netCmd('cfg', { id: L0.id, patch: { call: [6, 18, 30, 12, 19][n % 5] } });
    if (L0.q.length > TR.LIFT_QUEUE) bad.push('the queue grew to ' + L0.q.length); if (new Set(L0.q).size !== L0.q.length) bad.push('the queue has duplicates ' + L0.q);
    for (const r of L0.q) if (!TR.floorsOf(g, L0).includes(r)) bad.push('a queued row is not a stop: ' + r);
    adv(12); if (L0.mv || L0.tg !== null || L0.q.length) bad.push(`it did not settle: mv ${L0.mv} tg ${L0.tg} q ${L0.q}`);
    return bad.length === 0 || bad.join(' || ');
  });

  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  await guard('mp.elev.audit.the-guest-copy-reads-the-same-as-the-host-in-random-states', async () => {
    const bad = [];
    for (let n = 0; n < 10 && bad.length < 3; n++) {
      const R = rng(1000 + n); X.clean(); X.setup(); role('host'); cap(); g.world.onSet = (i, j, k, sp, vr) => g.netOut.push(i, j, k, sp, vr);
      const i = I0(), k = K0(), L0 = X.lift(i, k, { home: 30, depth: 24, top: 38 }); X.tunnel(L0, 30, 1, 6); X.ledge(L0, 18, 2); TR.refreshShaft(g, L0); L0.ex = L0.tr; X.powerCab(L0, 2); p().pos.set(L0.px - 9, 0, L0.pz - 9); g.keys = {}; adv(0.7);
      for (let s = 0, m = 3 + Math.floor(R() * 6); s < m; s++) {
        const op = R(), r = 6 + Math.floor(R() * 24), c = [L0.i0 + Math.floor(R() * 4), r, L0.k0 + Math.floor(R() * 4)];
        if (op < 0.3) { if (!w().get(...c)) X.poke(c[0], c[1], c[2], 2, 0); } else if (op < 0.45) { if (w().get(...c)) X.poke(c[0], c[1], c[2], 0, 0); }
        else if (op < 0.6) { const fe = S().entities.find((e) => e.type === 'frame'); if (fe) { X.decon(fe); w().supports = w().supports.filter((q) => q.id !== fe.id); } }
        else { const fl = TR.floorsOf(g, L0); TR.requestFloor(g, L0, fl[Math.floor(R() * fl.length)]); }
        adv(0.1 + R() * 2.4);
      }
      const hostEnt = json(L0), hostRead = text(L0), hostStops = TR.floorsOf(g, L0).join();
      g._nt = 0; g.netUpdate(0.2); sent.length = 0; g.sendWorld(); g._extRow = 0; EXT.update(g, 0, false);
      const ents = json(sent.filter((m) => m.t === 'ents')), rows = json(sent.filter((m) => m.t === 'xrow' && m.k === 'transit'));
      if (!ents.length || !rows.length) { bad.push(`state ${n}: sendWorld sent ${sent.map((m) => m.t).join()}`); continue; }
      const it = g.machines.items.get(L0.id); g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(L0.id); TR.removeLift(g, L0); S().entities = S().entities.filter((x) => x.id !== L0.id);
      done(); role('guest'); cap(); for (const mm of ents) g.netMessage(json(mm)); for (const mm of rows) g.netMessage(json(mm));
      const G = S().entities.find((x) => x.id === hostEnt.id); if (!G) { bad.push(`state ${n}: no elevator on the guest`); continue; }
      const tag = `state ${n} (cut ${hostEnt.cut}, tr ${hostEnt.tr}, why ${hostEnt.wy}, cab ${hostEnt.cy.toFixed(1)})`;
      if (Math.abs(G.cy - hostEnt.cy) > 0.011 || G.tr !== hostEnt.tr || G.cut !== hostEnt.cut || G.wy !== hostEnt.wy) bad.push(`${tag}: cy ${G.cy} tr ${G.tr} cut ${G.cut} why ${G.wy}`);
      if (TR.floorsOf(g, G).join() !== hostStops) bad.push(`${tag}: stops ${TR.floorsOf(g, G)} vs host ${hostStops}`);
      if (text(G) !== hostRead) bad.push(`${tag}: readout differs:\n  guest ${text(G)}\n  host  ${hostRead}`);
    }
    return bad.length === 0 || bad.slice(0, 3).join(' || ');
  });
}
