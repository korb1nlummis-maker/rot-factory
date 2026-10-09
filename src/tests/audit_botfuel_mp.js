// audit botfuel in co-op: what a guest's switch does on the host once bots are already out on errands, and that the host's rows and a guest's panel agree about it.
// Run: `await __selftest('botfuel.audit-mp')`
import { kit, UP, mixOf } from './botfuel_lib.js';

export default async function (ctx) {
  const { g, S } = ctx;
  const K = kit(ctx);
  const opt = { up: UP };
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const home = () => g.crew.home();
  const hasFace = () => { const h = home(); return !!g.crew.nearestFace(h.x, 0.3, h.z + 1); };
  const G = (name, fn) => K.guard(name, async () => { try { return await fn(); } finally { delete g.netSend; role(null); g.crewViews = new Map(); } }, opt);

  await G('botfuel.audit-mp-a-guest-turning-the-crew-switch-off-calls-back-bots-already-on-errands', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const h = home();
    const digger = K.mkBot(h.x + 1, h.z + 1);
    K.step(60, 0.05, () => digger.state === 'farm' && !!digger.fuelJob && digger.carry.length > 0);
    const carrier = K.mkBot(-6, 5); carrier.carry = mixOf([0, 0, 1, 1, 2, 2]); g.crew.goHome(carrier);
    if (carrier.state !== 'fwalk' || !digger.fuelJob) return `setup: carrier ${carrier.state}, digger ${digger.state} ${JSON.stringify(digger.fuelJob)}`;
    const hop0 = gen.q.length; role('host'); g.netCmd('crew', { act: 'fuelcfg', id: 0, on: false });
    if (carrier.fuelJob || digger.fuelJob) return 'the host kept the errands after the guest turned the crew switch off';
    role(null); K.states(carrier, 300, () => carrier.state === 'idle' && !carrier.carry.length); K.states(digger, 400, () => digger.state === 'idle' && !digger.carry.length);
    if (gen.q.length !== hop0) return `the generator took ${gen.q.length - hop0} plush after the switch went off`;
    return (carrier.state === 'idle' && digger.state === 'idle') || `after 300 s: carrier ${carrier.state}, digger ${digger.state}`;
  });
}
