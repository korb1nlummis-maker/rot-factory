// Bots refuel a generator by what its grid does, which comes from the cables the player laid, never from how close a pole stands (src/botfuel.js `starving`). Prefix `wire.`.
import { kit, UP, sp } from './botfuel_lib.js';

export default async function (ctx) {
  const { g, S, L } = ctx;
  const K = kit(ctx), FUEL = K.FUEL;
  const wire = (a, b) => { S().items.cable = (S().items.cable || 0) + 1; const r = g.cables.connect(a.id, b.id); if (!r.ok) throw new Error('wire: ' + r.why); };

  await K.guard('wire.bots-answer-a-generator-on-a-wired-grid-in-use-and-ignore-one-that-powers-nothing', async () => {
    const bad = [];
    const a = K.gen(-3.4, 3.0), idle = K.gen(-3.4, 6.6), pole = K.tileAt('pole', -3.4 + 0.6, 6.6 - 1.2);   // idle: a generator standing against a pole, no cable
    const fans = [0, 1].map((n) => K.tileAt('fan', -3.4 + 1.2 + n * 0.6, 7.2)); void a;
    g.power.markDirty(); g.power.recompute();
    if (FUEL.starving(g, idle)) bad.push('a generator that is wired to nothing counts as in use');
    for (const f of fans) wire(pole, f); g.power.markDirty(); g.power.recompute();
    if (FUEL.starving(g, idle)) bad.push('a generator touching a pole that carries a load counts as in use without a cable');
    wire(idle, pole); g.power.markDirty(); g.power.recompute();
    if (!FUEL.starving(g, idle)) bad.push('a generator wired into a grid that draws power does not call for fuel');
    // far from the pole, wired by a long cable: the same (no range comes into it)
    const far = K.gen(4.0, 3.0), p2 = K.tileAt('pole', 4.6, 9.0); const f2 = K.tileAt('fan', 5.2, 9.0); wire(p2, f2); wire(far, p2); g.power.markDirty(); g.power.recompute();
    if (!FUEL.starving(g, far)) bad.push('a generator wired to a loaded pole 6 m away does not call for fuel');
    // a full hopper never calls, however it is wired
    for (let n = 0; n < 50; n++) far.q.push({ sp: sp(0), vr: 0 }); if (FUEL.starving(g, far)) bad.push('a full hopper calls for fuel');
    // the cable going away ends the call
    g.cables.remove(S().cables.find((c) => (c.a === idle.id && c.b === pole.id)).id, true); g.power.recompute();
    if (FUEL.starving(g, idle)) bad.push('the call for fuel stayed after the cable was taken down');
    void L;
    return bad.length === 0 || bad.join('; ');
  }, { up: UP });
}
