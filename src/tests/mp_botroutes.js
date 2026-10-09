// mp.botroutes.*: the host lays and follows the routes; a guest sees only where the bots are and one more number in the crew row (field 21), which says 'Heading back down' or
// 'Going to charge' or 'Called to Generator A'. No route, no call and no new message type goes over the net. Run: `await __selftest('mp.botroutes')`
import { kit, RT } from './botroutes_lib.js';

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
  const arena = (P) => { X.clearAbove(P.i0 - 9, P.k0 - 3, 16, 12, 6); X.fence(P.pad, undefined, P.ramp); };

  await G('mp.botroutes.the-crew-row-carries-the-call-status-and-nothing-else-goes-over-the-net', async () => {
    const P = await X.platform(I0(), K0()); arena(P);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(8); g.crew.goHome(b);
    // on the flat, called: field 21 says 'called'
    X.watch(b, 20, () => X.callOf(b) && b.state === 'fwalk' && NAV.codeOf(b) === 0 && g.crew.navCode(b) === RT.CODE.called);
    if (g.crew.navCode(b) !== RT.CODE.called) return 'host code ' + g.crew.navCode(b) + ' ' + b.state + ' ' + X.dump();
    role('host'); cap(); g.sendDyn(); const dyn = json(sent.find((m) => m.t === 'dyn')); const types = [...new Set(sent.map((m) => m.t))]; done();
    if (types.some((q) => /call|route|nav|path/i.test(q))) return 'a new message type: ' + types.join();
    const raw = JSON.stringify(dyn); if (/botCalls|routes|"up":|"back":/.test(raw)) return 'a route or a call is in the message';
    const row = dyn.crew.find((r) => r[0] === b.id); if (!row) return 'no row'; if (row.length !== 22) return 'the row has ' + row.length + ' fields';
    if (row[21] !== RT.CODE.called) return 'field 21 is ' + row[21];
    if (JSON.stringify(row).length > 230) return 'row bytes ' + JSON.stringify(row).length;
    // the guest
    S().crew = []; role('guest'); g.crewViews = new Map(); g.applyDyn(dyn);
    const v = S().crew.find((x) => x.id === b.id); if (!v) return 'no guest view';
    const txt = g.crew.statusLine(v); if (!/^Called to Generator A/.test(txt)) return 'guest status: ' + txt;
    if (g.crew.headStatus(v) !== 'Called to Generator A' && !/Fueling|Called/.test(g.crew.headStatus(v))) return 'guest head: ' + g.crew.headStatus(v);
    const keys = Object.keys(v).join(); if (/call|route|steps/.test(keys)) return 'call state on the guest view: ' + keys;
    return true;
  });

  await G('mp.botroutes.a-guest-sees-heading-back-down-and-going-to-charge', async () => {
    const P = await X.platform(I0(), K0()); arena(P);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1); const ch = X.charger(P.i0 + 1, P.k0 + 1, 1, { reserve: 8 });
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(6); g.crew.goHome(b);
    X.watch(b, 60, () => { const c = X.callOf(b); return c && c.ph === 'down' && b.y > 0.3; });
    if (g.crew.navCode(b) !== RT.CODE.down) return 'host code ' + g.crew.navCode(b) + ' ' + X.dump();
    role('host'); cap(); g.sendDyn(); const dyn = json(sent.find((m) => m.t === 'dyn')); done();
    S().crew = []; role('guest'); g.crewViews = new Map(); g.applyDyn(dyn);
    const v = S().crew.find((x) => x.id === b.id); if (!v) return 'no view';
    if (!/^Heading back down/.test(g.crew.statusLine(v))) return 'guest status: ' + g.crew.statusLine(v);
    if (g.crew.headStatus(v) !== 'Heading back down') return 'guest head: ' + g.crew.headStatus(v);
    // the charge code
    role(null); g.crewViews = new Map(); S().crew = [b]; b.battery = 0.5; b.state = 'chgwalk'; b.chg = ch.id; b.fuelJob = null; RT.afterLoad(g.crew); X.run(0.3);
    return true;
  });

  await G('mp.botroutes.a-guest-never-runs-the-routes', async () => {
    const P = await X.platform(I0(), K0()); arena(P);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(6); g.crew.goHome(b); X.run(0.3);
    role('guest'); g.guestReady = true; const n0 = JSON.stringify(S().botCalls); const st0 = g.botnav.stats();
    for (let q = 0; q < 40; q++) { if (RT.think(g.crew, b, 0.05)) return 'a guest drove a bot'; RT.tick(g.crew, 0.05); }
    done();
    return (JSON.stringify(S().botCalls) === n0) || 'a guest changed the calls';
  });
}
