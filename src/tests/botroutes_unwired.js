// botroutes.unwired.*: a Charging Station with no cable from a live grid is not open: a bot maps no route to it and does not set off, the wired station farther away wins, and a cut cable closes it.
// (Its own file so it runs after the other botroutes tests.) Run: `await __selftest('botroutes.unwired')`
import { kit, RT } from './botroutes_lib.js';

export default async function (ctx) {
  const { g, L } = ctx;
  const X = kit(ctx), NAV = X.NAV;
  const I0 = () => ctx.toI(-9), K0 = () => ctx.toK(2);
  const callOf = X.callOf;
  const arena = (P, ramps) => { X.clearAbove(P.i0 - 9, P.k0 - 3, 16, 12, 6); X.fence(P.pad, undefined, ramps); };

  await X.guard('botroutes.unwired.a-station-with-no-cable-is-not-open-the-wired-one-farther-away-wins-and-a-cut-cable-closes-it', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const near = X.charger(P.i0 + 2, P.k0 + 2, 1, { reserve: 8, unwired: true });
    const far = X.charger(P.i0 - 6, P.k0 + 6, 0, { reserve: 8 });
    const b = X.mkBot(X.cellX(P.i0 - 5), X.cellZ(P.k0 + 4)); b.battery = 0.2; NAV.invalidate('x'); g.power.markDirty(); g.power.recompute();
    if (near.pw > 0) return 'the unwired station has power ' + near.pw;
    const pick = RT.chargerFor(g.crew, b, 400); if (pick !== far) return `chose ${pick && pick.id}: the unwired station ${near.id} is not open, the wired ${far.id} is`;
    const gen = [...L().tiles.values()].find((t) => t.rig && g.cables.find(t.id, far.id)); if (!gen) return 'no cable to the far station';
    g.cables.connect(gen.id, far.id); g.power.markDirty(); g.power.recompute();   // (the same pair again takes the cable down)
    if (RT.chargerFor(g.crew, b, 400)) return 'a station whose cable was cut is still open';
    X.force.on = false;   // (the grid decides what has power: the stepper's hand-given power would light the cut station again)
    try { const rec = X.watch(b, 8); if (rec.states.includes('chgwalk') || callOf(b)) return 'it set off for a station with no power: ' + rec.states.join() + ' ' + X.dump(); } finally { X.force.on = true; }
    return near.reserve > 7.99 && far.reserve > 7.99 || `charge was drawn: ${near.reserve} ${far.reserve}`;
  });

}
