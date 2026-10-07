// mp.audit_hud.*: what a guest's gauges do with what the host sends them.
import { makeKit } from './power_lib.js';

export default async function (ctx) {
  const { T, g, S, p, fresh, adv, V3 } = ctx;
  const D = (id) => g.ui.dials.read(id);
  const hud = () => { g.hudT = 0; g._svNext = 0; g.updateHud(0.1); };
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };

  await T('mp.audit_hud.a-guest-ignores-a-grid-row-with-missing-or-wrong-numbers', async () => {
    fresh({}); const bad = []; p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0);
    try {
      role('guest');
      const rows = [{ supply: 'x', demand: null }, { demand: 5 }, { supply: 8 }, {}, [], 'grid', 7, { supply: NaN, demand: 2 }, { supply: Infinity, demand: 2 }];
      for (const row of rows) {
        g.guestGrid = row;
        try { hud(); } catch (e) { bad.push(`${JSON.stringify(row)} threw ${e.message}`); continue; }
        if (D('grid').on) bad.push(`${JSON.stringify(row)} still shows a grid dial: ${JSON.stringify([D('grid').val, D('grid').sub])}`);
      }
      // a good row works straight after the bad ones, and its odd flags are read as flags
      g.guestGrid = { supply: 8, demand: 3, sat: 'x', tripped: 0, loads: 'no' }; try { hud(); } catch (e) { bad.push('good row with odd flags threw ' + e.message); }
      let d = D('grid'); if (!d.on || d.val !== '3.0' || d.sub !== 'of 8.0 kW' || d.state !== 'ok') bad.push('good row ' + JSON.stringify([d.on, d.val, d.sub, d.state]));
      g.guestGrid = { supply: 8, demand: 3, sat: 0.5, tripped: false }; hud(); d = D('grid'); if (d.state !== 'warn' || d.sub !== 'BROWNOUT') bad.push('brownout row ' + JSON.stringify([d.state, d.sub]));
      g.guestGrid = null; hud(); if (D('grid').on) bad.push('the dial stays without a row');
    } finally { role(null); g.guestGrid = null; hud(); }
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  await T('mp.audit_hud.the-host-and-a-guest-agree-on-every-gauge-they-share', async () => {
    const K = makeKit(ctx); const bad = []; let sent = []; const savedNets = [g.power.nets, g.power.netById];
    K.reset(); p().pos.set(0, 0, -1.4); K.grid(2, 3, { gens: 1, fans: 5 }); adv(1.5); p().pos.set(2, 0, 2.4);
    try {
      role('host'); g.netSend = (m) => { sent.push(JSON.parse(JSON.stringify(m))); }; g.remote = { pos: new V3(2, 0, 3.4), update() {}, lampOn: false, yaw: 0, pitch: 0 };
      hud(); g.sendDyn(); const dyn = sent.find((m) => m.t === 'dyn'); if (!dyn || !dyn.grid) return 'no grid in the dyn row';
      const host = D('grid'); delete g.netSend; role(null); g.remote = null; g.netOut.length = 0;
      // the guest reads the same numbers wherever it stands: far from the grid, and underground
      g.power.nets = []; g.power.netById = new Map(); role('guest'); g.netMessage(JSON.parse(JSON.stringify(dyn)));
      for (const pos of [[0, 0, -1.4], [900, 0, 5], [3000, 0, -40]]) {
        p().pos.set(...pos); hud(); const gd = D('grid');
        for (const k of ['val', 'unit', 'sub', 'state', 'text']) if (gd[k] !== host[k]) bad.push(`at ${pos[0]} m the guest grid ${k} is "${gd[k]}", the host's is "${host[k]}"`);
      }
    } finally { delete g.netSend; role(null); g.remote = null; g.netOut.length = 0; [g.power.nets, g.power.netById] = savedNets; g.guestGrid = null; K.reset(); p().pos.set(0, 0, -1.4); }
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });
  void S;
}
