// Upgrade audit: Light (Headlamp, Work Lanterns).
import { purchaseTests } from './upg_common.js';
import { U } from '../shaders.js';

export default async function (ctx) {
  const { g, S, p, T, fresh, adv, near, V3, craft, placeAtFloor, recipes, cellX, cellZ } = ctx;
  for (const id of ['lamp', 'lantern']) await purchaseTests(ctx, id, 'light');

  await T('upg.light.lamp.effect', async () => {
    fresh({}); g.lampOn = undefined; let prevR = 0, prevP = 0, prevI = 0;
    for (let l = 0; l <= 5; l++) {
      if (l) { S().money = 1e12; if (!g.buy('lamp')) return 'could not buy ' + l; }
      const R = l ? 10 + 3 * l : 9, P = l ? 1 + 0.28 * l : 1;
      if (!near(g.T.lampRange, R, 1e-9) || !near(g.T.lampPower, P, 1e-9)) return `tuning ${g.T.lampRange} / ${g.T.lampPower} at level ${l}`;
      if (!(g.T.lampRange > prevR) || !(g.T.lampPower > prevP)) return 'not brighter or longer than the level before';
      p().pos.set(0, 0, -1.4); adv(0.15); // one frame later the renderer must be using it
      if (!near(U.uLampRange.value, R, 1e-6)) return `shader range ${U.uLampRange.value} at level ${l}`;
      if (!near(U.uLampColor.value.r, 2.6 * P, 1e-4)) return `shader brightness ${U.uLampColor.value.r} at level ${l}`;
      if (!near(g.camLamp.intensity, 22 * P, 1e-4) || !near(g.camLamp.distance, R + 4, 1e-6)) return 'spot light not updated';
      if (!(g.camLamp.intensity > prevI)) return 'spot light not brighter'; prevI = g.camLamp.intensity;
      prevR = g.T.lampRange; prevP = g.T.lampPower;
    }
    // the headlamp switch still turns it off
    g.lampOn = false; adv(0.15); const off = U.uLampColor.value.r; g.lampOn = undefined; adv(0.15);
    return (off === 0 && U.uLampColor.value.r > 0) || 'lamp switch';
  });

  await T('upg.light.lantern.effect', async () => {
    fresh({}); craft('lantern'); if (S().items.lantern) return 'could craft a lantern without the upgrade';
    if (recipes(g).some((r) => r.kind === 'lantern')) return 'recipe listed without the upgrade';
    S().money = 1e12; if (!g.buy('lantern')) return 'could not buy';
    if (!recipes(g).some((r) => r.kind === 'lantern')) return 'no lantern recipe after purchase';
    const r = await placeAtFloor('lantern', 4, -2); if (!r.ok || r.placed !== 1) return 'could not hang a lantern: ' + JSON.stringify(r);
    const ent = S().entities.find((e) => e.type === 'lantern'); if (!ent) return 'no lantern entity';
    // the renderer feeds it to the shader as a light once you are near
    p().pos.set(ent.x - 2, 0, ent.z); adv(0.15);
    const lit = g.machines.lights(g.renderer.camera.position, 4); if (!lit.includes(ent)) return 'lantern not among the lights';
    let found = false; for (let i = 1; i < 5; i++) { const v = U.uPt.value[i]; if (Math.abs(v.x - ent.x) < 1e-3 && Math.abs(v.z - ent.z) < 1e-3 && U.uPtCol.value[i].r > 0.5) found = true; }
    if (!found) return 'lantern missing from the shader light list';
    // far away it is not used
    p().pos.set(ent.x - 60, 0, ent.z); adv(0.15);
    if (g.machines.lights(g.renderer.camera.position, 4).includes(ent)) return 'lantern still lighting from 60 m';
    return true;
  });
}
