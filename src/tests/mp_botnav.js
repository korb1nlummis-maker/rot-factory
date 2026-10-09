// mp.botnav.*: bots are simulated by the host; a guest sees where they are (the same dyn rows as before: one more small number in a row says 'Taking the ramp' or 'Waiting for the lift')
// and no new message type exists. Run: `await __selftest('mp.botnav')`
import { kit } from './botnav_lib.js';
import * as TR from '../transit.js';

export default async function (ctx) {
  const { g, S } = ctx;
  const X = kit(ctx), C = 0.6, NAV = X.NAV;
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(JSON.parse(JSON.stringify(m))); }; };
  const done = () => { delete g.netSend; role(null); };
  const json = (m) => JSON.parse(JSON.stringify(m));
  const G = (name, fn) => X.guard(name, async (t) => { try { return await fn(t); } finally { done(); g.crewViews = new Map(); } });
  const I0 = () => ctx.toI(-9), K0 = () => ctx.toK(2);

  await G('mp.botnav.a-guest-sees-the-same-heights-and-the-ramp-status-with-no-new-message', async () => {
    const P = await X.platform(I0(), K0()); X.clearAbove(P.i0 - 9, P.k0 - 3, 16, 12, 4); X.fence(P.pad, undefined, P.ramp);
    X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(4); g.crew.goHome(b);
    X.watch(b, 30, () => NAV.codeOf(b) === NAV.CODE.ramp && b.y > 0.3);
    if (NAV.codeOf(b) !== NAV.CODE.ramp) return 'the bot never took the ramp: ' + b.state + ' ' + b.y.toFixed(2);
    role('host'); cap(); g.sendDyn(); const types = [...new Set(sent.map((m) => m.t))]; const dyn = json(sent.find((m) => m.t === 'dyn')); done();
    if (!dyn) return 'no dyn';
    if (types.some((t) => /nav|path|bot/i.test(t))) return 'a new message type: ' + types.join();   // (the host's tick sends the dyn row and what it always sent: nothing for navigation)
    const row = dyn.crew.find((r) => r[0] === b.id); if (!row) return 'no row for the bot';
    if (row.length !== 22) return 'the row has ' + row.length + ' fields';
    if (row[21] !== NAV.CODE.ramp) return 'the nav code in the row is ' + row[21];
    if (Math.abs(row[9] - b.y) > 0.006 || Math.abs(row[8] - b.x) > 0.006 || Math.abs(row[10] - b.z) > 0.006) return `the row is off the bot: ${row.slice(8, 11)} vs ${b.x}, ${b.y}, ${b.z}`;
    const rowBytes = JSON.stringify(row).length; if (rowBytes > 230) return 'a bot row is ' + rowBytes + ' bytes';
    // the guest
    const y = b.y; S().crew = []; role('guest'); g.crewViews = new Map(); g.applyDyn(dyn);
    const v = S().crew.find((x) => x.id === b.id); if (!v) return 'no guest view';
    if (Math.abs(v.gy - y) > 0.006) return `the guest y ${v.gy} vs ${y}`;
    if (g.crew.statusLine(v).indexOf('Taking the ramp') !== 0) return 'the guest status: ' + g.crew.statusLine(v);
    if (g.crew.headStatus(v) !== 'Taking the ramp') return 'the guest head status: ' + g.crew.headStatus(v);
    return true;
  });

  await G('mp.botnav.a-guest-bot-glides-up-the-ramp-with-its-own-heights-and-no-path-state', async () => {
    const P = await X.platform(I0(), K0()); X.clearAbove(P.i0 - 9, P.k0 - 3, 16, 12, 4); X.fence(P.pad, undefined, P.ramp);
    X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(4); g.crew.goHome(b);
    const rows = []; X.watch(b, 40, () => b.y > 0.55 && rows.length > 6, { each: () => { role('host'); cap(); g.sendDyn(); const d = sent.find((m) => m.t === 'dyn'); done(); if (d) rows.push(json(d)); } });
    if (rows.length < 5) return 'rows ' + rows.length;
    // replay on a guest: the view's heights follow the host's, and nothing in the view holds a path
    S().crew = []; role('guest'); g.crewViews = new Map(); let worst = 0;
    for (const d of rows) { g.applyDyn(d); const v = S().crew[0]; const r = d.crew[0]; if (v) { for (let n = 0; n < 4; n++) g.crew.guestUpdate(0.05, g.time + 0.05 * n); worst = Math.max(worst, Math.abs(v.y - r[9])); } }
    const v = S().crew[0]; if (!v) return 'no view'; const keys = Object.keys(v).join();
    if (/steps|nav|rec/.test(keys.replace(/nvc/, ''))) return 'path state on the guest view: ' + keys;
    return worst < 0.9 || 'the glide lagged by ' + worst.toFixed(2);
  });
}
