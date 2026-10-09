// audit_lag_bodies.js: the host's plush stream when there are more loose bodies than one message may carry (an avalanche, a cave-in): every body must reach the guest
// within a bounded time, not only the nearest ones, and what the guest draws must match what the host has (cells plus bodies are the plush of the world).
import * as NG from '../netgame.js';

export default async function (ctx) {
  const { T, g, fresh, sim, p, clearBodies, V3 } = ctx;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); g.remote = null; g.netOut.length = 0; g.net.pipe.level = 0; g.net.pipe.reset(); g.net.inbox.reset(); g.netBodies.clear(); g.netPending.length = 0; g._nbSent = undefined; clearBodies(); };
  const G = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); } });
  const pile = (n, x0, z0) => { const ids = []; for (let q = 0; q < n; q++) ids.push(sim().bid[sim().spawn(3 + (q % 5), q % 3, x0 + (q % 30) * 0.5, 2 + ((q / 150) | 0) * 0.7, z0 + (((q / 30) | 0) % 5) * 0.5, 0, 0, 0, 1)]); return ids; };

  for (const [name, level, q, maxMsgs] of [['at-full-quality', 0, 1, 10], ['on-a-slow-link', 2, 0.25, 40]]) {
    await G(`lag.audit.every-body-reaches-the-guest-in-a-bounded-time-${name}`, async () => {
      fresh({}); clearBodies(); role('host'); cap(); p().pos.set(0, 0, 3); g.remote = { pos: new V3(0, 0, 3), update() {} };
      const ids = pile(700, -6, 0);   // 700 loose plush within 15 m: more than three messages of 220, a dozen of 55
      g.net.pipe.level = level;
      for (let n = 0; n < maxMsgs; n++) { NG.sendBodies(g, q); sent.length; }
      const msgs = sent.filter((m) => m.t === 'bodies');
      role('guest'); g.netBodies.clear(); for (const m of msgs) g.netMessage(m);
      const missing = ids.filter((id) => !g.netBodies.has(id)).length;
      return missing === 0 || `${missing} of ${ids.length} bodies never reached the guest in ${maxMsgs} messages (${msgs.length} sent, ${(msgs[0].a.length / 11) | 0} each): the guest sees only the nearest ones`;
    });
  }

  await G('lag.audit.a-moving-body-far-from-the-cap-edge-is-not-frozen-on-the-guest', async () => {
    fresh({}); clearBodies(); role('host'); cap(); p().pos.set(0, 0, 3); g.remote = { pos: new V3(0, 0, 3), update() {} };
    const ids = pile(600, -6, 0); const far = ids[ids.length - 1], i = () => sim().indexOfId(far);
    // the farthest body of the pile keeps moving (it rolls on): after 12 messages the guest copy follows it within 2 m
    for (let n = 0; n < 12; n++) { sim().x[i()] += 0.3; NG.sendBodies(g, 1); }
    const msgs = sent.filter((m) => m.t === 'bodies'); role('guest'); g.netBodies.clear(); for (const m of msgs) g.netMessage(m);
    const b = g.netBodies.get(far); if (!b) return 'the moving body is not on the guest at all';
    return Math.abs(b.tx - sim().x[i()]) < 2.0 || `the guest copy is ${Math.abs(b.tx - sim().x[i()]).toFixed(1)} m behind the host body after 12 messages`;
  });
  // the guest's picture of a body is a fraction of a second old (a bad link: seconds). A plush it takes that the host no longer has (it settled into a cell, was sold, or the host took it) must not appear in its hand:
  // cells plus bodies plus hands would be more plush than the host has.
  await G('lag.audit.a-plush-taken-from-a-body-the-host-no-longer-has-goes-back', async () => {
    const { S } = ctx;
    fresh({}); clearBodies(); role('host'); cap(); p().pos.set(0, 0, 3);
    const a = sim().spawn(4, 1, 0, 2, 3, 0, 0, 0, 1), idA = sim().bid[a], b = sim().spawn(4, 1, 1, 2, 3, 0, 0, 0, 1), idB = sim().bid[b];
    g.netMessage({ t: 'take', id: idA, sp: 4, vr: 1 });
    if (sim().indexOfId(idA) >= 0) return 'a real take did not remove the body'; if (sent.some((m) => m.t === 'nope')) return 'a real take was refused';
    sim().remove(sim().indexOfId(idB));   // the body settled (or was sold) before the friend's take arrived
    g.netMessage({ t: 'take', id: idB, sp: 4, vr: 1 });
    const nope = sent.find((m) => m.t === 'nope'); if (!nope || nope.sp !== 4 || nope.vr !== 1) return 'no refusal for a body that is gone: ' + JSON.stringify(sent.map((m) => m.t));
    role('guest'); S().carry.length = 0; S().carry.push({ sp: 9, vr: 0 }, { sp: 4, vr: 1 });
    g.netMessage(nope); const left = S().carry.map((x) => x.sp + ':' + x.vr).join();
    g.netMessage(nope); if (S().carry.length !== 1) return 'a second refusal took another plush: ' + S().carry.length;
    role('host'); g.netMessage({ t: 'nope', sp: 9, vr: 0 }); if (S().carry.length !== 1) return 'the host obeyed a refusal';
    return left === '9:0' || 'the guest hand after the refusal: ' + left;
  });
}
