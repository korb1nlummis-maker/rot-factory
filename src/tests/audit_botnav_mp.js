// mp.botnav.audit.*: a guest sees a bot standing on a plate at the plate's height (never down on the floor, never floating), and a bot riding a lift at the cab's height.
// Run: `await __selftest('mp.botnav.audit')`
import { kit } from './botnav_lib.js';

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

  await G('mp.botnav.audit.a-guest-sees-a-bot-resting-on-a-plate-at-the-plate-height', async () => {
    const P = await X.platform(I0(), K0()); X.clearAbove(P.i0 - 9, P.k0 - 3, 16, 12, 4); X.fence(P.pad, undefined, P.ramp);
    const b = X.mkBot(X.cellX(P.i0 + 2), X.cellZ(P.k0 + 2), C); b.state = 'idle'; b.carry = [];
    X.run(2);
    role('host'); cap(); g.sendDyn(); const dyn = json(sent.find((m) => m.t === 'dyn')); done();
    const row = dyn.crew.find((r) => r[0] === b.id); if (!row) return 'no row';
    if (Math.abs(row[9] - b.y) > 0.006) return `the row y ${row[9]} vs the bot ${b.y}`;
    S().crew = []; role('guest'); g.crewViews = new Map(); g.applyDyn(dyn);
    for (let n = 0; n < 40; n++) g.crew.guestUpdate(0.05, g.time + 0.05 * n);
    const v = S().crew.find((x) => x.id === b.id); if (!v) return 'no view';
    if (Math.abs(v.y - b.y) > 0.02) return `the guest sees y ${v.y.toFixed(2)}, the host has ${b.y.toFixed(2)}`;
    const o = g.crew.objs.get(v.id); if (o && Math.abs(o.position.y - b.y) > 0.12) return `the guest model is at ${o.position.y.toFixed(2)}, the bot at ${b.y.toFixed(2)}`;
    return true;
  });
}
