// Upgrade audit: Mobility (boots, knees, springs, climb). Bought through g.buy, measured in the running player physics.
import { purchaseTests } from './upg_common.js';

export default async function (ctx) {
  const { g, S, p, T, fresh, adv, near, V3 } = ctx;
  for (const id of ['boots', 'knees', 'springs', 'climb']) await purchaseTests(ctx, id, 'move');
  const settle = () => { g.keys = {}; p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); p().yaw = 0; p().pitch = 0; p().crouch = false; adv(0.5); };

  await T('upg.move.boots.effect', async () => {
    fresh({}); const sp = [];
    for (let l = 0; l <= 4; l++) {
      if (l) { S().money = 1e12; if (!g.buy('boots')) return 'could not buy ' + l; }
      settle(); g.keys.KeyW = true; adv(0.7, 0.02); const v = Math.hypot(p().vel.x, p().vel.z); g.keys = {};
      const want = 4.0 * (1 + 0.12 * l); sp.push(+v.toFixed(2));
      if (!near(v, want, want * 0.03)) return `walking speed ${v.toFixed(2)} at level ${l}, the text promises ${want.toFixed(2)} (+12% per level): ${sp}`;
    }
    return true;
  });

  await T('upg.move.knees.effect', async () => {
    fresh({}); let prev = 0;
    for (let l = 0; l <= 3; l++) {
      if (l) { S().money = 1e12; if (!g.buy('knees')) return 'could not buy ' + l; }
      settle(); g.keys.KeyC = true; g.keys.KeyW = true; adv(0.9, 0.02); const v = Math.hypot(p().vel.x, p().vel.z); const crouched = p().crouch; g.keys = {};
      if (!crouched) return 'player did not crouch';
      const want = 4.0 * (0.5 + 0.15 * l);
      if (!near(v, want, want * 0.04)) return `crawl speed ${v.toFixed(2)} at level ${l}, expected ${want.toFixed(2)}`;
      if (!(v > prev)) return 'crawl not faster than the level before'; prev = v;
    }
    // standing speed is untouched by knee pads
    settle(); g.keys.KeyW = true; adv(0.7, 0.02); const w0 = Math.hypot(p().vel.x, p().vel.z); g.keys = {};
    return near(w0, 4.0, 0.15) || 'knee pads changed walking speed: ' + w0;
  });

  await T('upg.move.springs.effect', async () => {
    fresh({}); let prev = 0; const hs = [];
    for (let l = 0; l <= 3; l++) {
      if (l) { S().money = 1e12; if (!g.buy('springs')) return 'could not buy ' + l; }
      settle(); const y0 = p().pos.y; g.keys.Space = true; let top = y0;
      for (let n = 0; n < 150; n++) { adv(0.01, 0.01); g.keys.Space = false; top = Math.max(top, p().pos.y); }
      const h = top - y0; hs.push(+h.toFixed(2));
      const v = 6 + 0.9 * l, want = v * v / (2 * 21);
      if (!near(h, want, want * 0.08)) return `jump height ${h.toFixed(2)} at level ${l}, physics says ${want.toFixed(2)}: ${hs}`;
      if (!(h > prev)) return 'not higher than the level before: ' + hs; prev = h;
    }
    return true;
  });

  await T('upg.move.climb.effect', async () => {
    fresh({}); let e0 = 0; const orig = g.slide.trigger.bind(g.slide); let e = null; g.slide.trigger = (i, j, k, en) => { e = en; };
    try {
      for (let l = 0; l <= 3; l++) {
        if (l) { S().money = 1e12; if (!g.buy('climb')) return 'could not buy ' + l; }
        p().pos.set(0, 10, 0); p().footCell = { i: 5000, j: 20, k: 5000 }; e = null; g.treadOn(1, false);
        if (e === null) return 'no slide load at height';
        if (l === 0) e0 = e;
        if (!near(e, e0 * (1 - 0.25 * l), 1e-9)) return `slide load ${e.toFixed(3)} at level ${l}, expected ${(e0 * (1 - 0.25 * l)).toFixed(3)} (25% less per tier)`;
      }
    } finally { g.slide.trigger = orig; }
    return true;
  });
}
