// audit gens: the burn of the generator ladder must conserve energy at every frame rate. A plush that burns for 0.11 s (a Titan Plant on a
// Common) cannot be rounded up to whole frames: the time a plant stays lit must equal the sum of what its plush are worth, give or take a frame.
import { makeKit, UP } from './power_lib.js';
import * as PP from '../powerparts.js';
import { pools } from '../plushdata.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, adv } = ctx;
  const K = makeKit(ctx);
  const sp = (r) => pools[r][0];
  const FULL = { ...UP, genOutput: 3, genTurbine: 1, genPlant: 1, genStation: 1, genTitan: 1 };

  // the lit time of a generator that burns `n` plush of one rarity, stepped at dt (a lag spike every so often when `spiky`)
  const litTime = (key, rarity, n, dt, spiky) => {
    K.reset(FULL); g.T.genOutput = 8; g.T.genBuffer = 2000;
    const t = K.tile('gen', -12, 3, key === 'std' ? {} : { gk: key });
    for (let q = 0; q < n; q++) t.q.push({ sp: sp(rarity), vr: 0 });
    let lit = 0, steps = 0;
    while ((t.q.length || t.burn > 0) && steps++ < 400000) { const d = spiky && steps % 17 === 0 ? dt * 9 : dt; g.time += d; g.power.update(d); if (t.burn > 0) lit += d; }
    return lit;
  };
  const want = (key, rarity, n) => n * PP.BURN_S_AT_8KW[rarity] * 8 / (8 * PP.GEN_BY_KEY[key].mul);

  await T('gens.audit.lit-time-equals-the-fuels-worth-at-60-and-30-fps', async () => {
    const bad = [];
    for (const [key, r, n] of [['titan', 0, 400], ['titan', 1, 200], ['grid', 0, 200], ['plant', 0, 100], ['turbine', 0, 40], ['portable', 0, 3]]) {
      for (const dt of [1 / 60, 1 / 30]) {
        const w = want(key, r, n), got = litTime(key, r, n, dt, false), tol = Math.max(3 * dt, w * 0.004);
        if (Math.abs(got - w) > tol) bad.push(`${key} r${r} x${n} @${Math.round(1 / dt)}fps: lit ${got.toFixed(3)} s for ${w.toFixed(3)} s of fuel (${((got / w - 1) * 100).toFixed(1)}%)`);
      }
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('gens.audit.lag-spikes-do-not-make-or-lose-power', async () => {
    const bad = [];
    for (const [key, r, n] of [['titan', 0, 300], ['grid', 1, 80], ['std', 0, 1]]) {
      const w = want(key, r, n), got = litTime(key, r, n, 1 / 60, true), tol = Math.max(0.2, w * 0.004);
      if (Math.abs(got - w) > tol) bad.push(`${key}: lit ${got.toFixed(3)} for ${w.toFixed(3)}`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('gens.audit.an-idle-generator-fed-later-gets-the-whole-plush', async () => {
    K.reset(FULL); g.T.genOutput = 8;
    const t = K.tile('gen', -12, 3); t.q.push({ sp: sp(0), vr: 0 }); let s = 0;
    for (let n = 0; n < 4000; n++) { g.time += 0.016; g.power.update(0.016); s++; }   // burns out
    const idle = t.burn; t.q.push({ sp: sp(0), vr: 0 }); g.time += 0.016; g.power.update(0.016);
    return Math.abs(t.burnMax - 90) < 1e-9 || `an idle generator carried a deficit (${idle}): the next Common is worth ${t.burnMax} s, not 90`;
  });

  await T('gens.audit.readouts-never-say-0.00-s-for-a-very-fast-plant', async () => {
    K.reset({ ...FULL, genOutput: 6, fusion: 1 });
    const t = K.tile('gen', -12, 3, { gk: 'titan' }); t.q.push({ sp: sp(0), vr: 0 }); adv(0.2);
    const kw = PP.genKw(g.T, t), info = infoFor(g, { kind: 'tile', id: t.id }), text = info ? info.lines.join('\n') : '';
    const r = ctx.recipes(g).find((q) => q.id === 'gen:titan');
    const bad = [];
    if (!/ms\b/.test(text) || /\b0\.00 s/.test(text)) bad.push(`the hover readout at ${Math.round(kw)} kW: ${text.split('\n')[2]}`);
    if (r && /\b0\.00 s/.test(r.desc)) bad.push('the bench row says 0.00 s: ' + r.desc.slice(0, 160));
    return bad.length === 0 || bad.join('; ');
  });

  await T('gens.audit.an-odd-gk-counts-as-an-ordinary-generator-for-the-ordinary-price', async () => {
    K.reset(FULL); const a = g.genCost(); K.tile('gen', -12, 3, { gk: 'bogus' }); const b = g.genCost(); K.tile('gen', -10, 3, { gk: 'portable' }); const c = g.genCost();
    return (b === Math.round(a * 1.35) && c === b) || `the ordinary price went ${a}, ${b}, ${c}`;
  });
}
