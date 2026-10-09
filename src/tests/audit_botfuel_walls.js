// audit botfuel: an errand the bot starts on its own must be one it can walk. A wall of the player's between the bin and the pile (bulkhead panels, pads, a cache) is solid to a bot's feet
// but the pile scan looks through it, so the errand has to be refused (or ended) instead of sending the bot into the wall every two minutes. Run: `await __selftest('botfuel.audit-walls')`
import { kit, UP } from './botfuel_lib.js';
import { BULK, PAD, CACHE, REMAINS } from '../plushdata.js';

export default async function (ctx) {
  const { g, S, w, toI, toK } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const opt = { up: UP };
  const home = () => g.crew.home();

  for (const [name, cellv] of [['bulkhead-wall', BULK], ['pad-wall', PAD], ['cache-wall', CACHE], ['remains-wall', REMAINS]]) {
    await G(`botfuel.audit-walls-no-scoop-errand-into-a-${name}`, async () => {
      const h = home(); const nf = g.crew.nearestFace(h.x, 0.3, h.z + 1); if (!nf) return true;
      const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const b = K.mkBot(h.x, h.z + 1);
      // a wall across the whole way to that face, a cell thick, floor to 4 cells up, wide enough that nothing walks round it
      const dx = [1, 0, -1, 0][nf.dir], dz = [0, 1, 0, -1][nf.dir], wi = nf.face.i - dx * 2, wk = nf.face.k - dz * 2;
      let n = 0; for (let l = -30; l <= 30; l++) for (let j = 0; j < 5; j++) { const i = wi + (dz !== 0 ? l : 0), k = wk + (dx !== 0 ? l : 0); if (!w().get(i, j, k)) { w().setCell(i, j, k, cellv, 0); n++; } }
      const before = []; for (let l = -30; l <= 30; l++) for (let j = 0; j < 5; j++) before.push(w().get(wi + (dz !== 0 ? l : 0), j, wk + (dx !== 0 ? l : 0)));
      K.toasts.length = 0; const seen = K.states(b, 400, () => false);
      const stuck = K.toasts.filter((t) => /stuck/.test(t)).length;
      const after = []; for (let l = -30; l <= 30; l++) for (let j = 0; j < 5; j++) after.push(w().get(wi + (dz !== 0 ? l : 0), j, wk + (dx !== 0 ? l : 0)));
      if (before.some((v, q) => v === cellv && after[q] !== cellv)) {   // (the pile's own plush that happen to lie in the line may be dug: the wall may not)
 const d = []; before.forEach((v, q) => { if (v === cellv && v !== after[q] && d.length < 6) d.push(`${q}:${v}->${after[q]}`); }); return 'the wall was changed: ' + d.join(' ') + ` of ${before.length}, bot ${b.state}`; }
      if (stuck) return `the bot walked into the wall and had to be phased home ${stuck} times in 400 s (${n} wall cells, face ${JSON.stringify(nf.face)} dir ${nf.dir}): ${seen.slice(0, 30).join(' ')}`;
      void gen; return true;
    }, opt);
  }
  // a machine inside a room of the player's (walled in on every side): a bot with a load must not walk at it, stand against the wall for 25 s and be phased home, again and again
  await G('botfuel.audit-walls-a-machine-walled-in-is-not-walked-at', async () => {
    const gen = K.gen(-3.4, 3.0); const gi = gen.i, gk = gen.k;
    for (let a = -3; a <= 3; a++) for (let c = -3; c <= 3; c++) if (Math.max(Math.abs(a), Math.abs(c)) === 3) for (let j = 0; j < 5; j++) if (!w().get(gi + a, j, gk + c)) w().setCell(gi + a, j, gk + c, BULK, 0);
    const b = K.mkBot(-9, 3.0); b.carry = [{ sp: 1, vr: 0 }, { sp: 1, vr: 0 }, { sp: 1, vr: 0 }, { sp: 1, vr: 0 }]; const sold0 = S().stats.sold; g.crew.goHome(b);
    K.toasts.length = 0; const seen = K.states(b, 200, () => b.state === 'idle' && !b.carry.length);
    const stuck = K.toasts.filter((t) => /stuck/.test(t)).length;
    if (stuck) return `the bot walked at the walled-in generator and was phased home ${stuck} time(s): ${seen.join(' ')}`;
    if (gen.q.length) return 'something got into a walled-in generator';
    return (S().stats.sold - sold0 === 4) || `sold ${S().stats.sold - sold0} of the 4 it carried`;
  }, opt);
  // a bot that is idle far from its bin (it finished charging at a station deep in the mine, a cart was emptied) loiters back toward the bin. It must not start digging fuel where it
  // stands: the nearest face out there is the wall of somebody's tunnel. It sets off when it is home.
  await G('botfuel.audit-walls-an-idle-bot-far-from-the-bin-does-not-start-digging-where-it-stands', async () => {
    const h = home(); if (!g.crew.nearestFace(h.x, 0.3, h.z + 1)) return true;
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const far = { x: -11, z: 12 }; const b = K.mkBot(far.x, far.z);
    if (Math.hypot(b.x - h.x, b.z - h.z) < 16) return 'the test spot is too near the bin';
    let at = null; K.step(120, 0.05, () => { if (b.fuelJob && !at) { at = Math.hypot(b.x - h.x, b.z - h.z); return true; } return false; });
    if (at === null) return 'it never set off at all, not even once it was home';
    void gen; return at <= 14 || `a bot ${at.toFixed(1)} m from the bin started digging fuel where it stood`;
  }, opt);
}
