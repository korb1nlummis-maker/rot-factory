// lights.core.*: the numbers behind the light audit. The headlamp on the plush is eased off close up and rolled off under a ceiling (shaders.js lampAtten / lampRoll), and the plush as a
// whole is rolled off under the bloom threshold (rollOff), so a light plush (snow, cream, custard, blush, sky) keeps its colour and its shading up close, with every Headlamp upgrade
// and in a lit hall; the beam is not touched far away; and no light adds a real light to the scene while the game runs (the pool design: a changing count recompiles every material).
import * as THREE from 'three';
import { U, plushFrag, lampAtten, lampRoll, lampWhenLit, LAMP_AMB_CUT, LAMP_AMB_FULL, rollOff, LAMP_KNEE, LAMP_TOP, LAMP_NEAR_MIN, LAMP_NEAR_D0, LAMP_NEAR_D1, HL_KNEE, HL_TOP, pointAtten, pointLight } from '../shaders.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const oldAtt = (d, range) => 1 / (1 + d * d * 0.16) * sstep(range, range * 0.35, d);   // the beam as it was before the near field was eased
const BLOOM_AT = 0.92;                                                                 // render.js: the bloom pass starts here

export default async function (ctx) {
  const { T, g, fresh, adv } = ctx;
  // the Headlamp upgrades: lamp 0..5 (range 9 or 10 + 3 l, power 1 + 0.28 l), then the Searchlight (+4 m, +0.3 each) and Beam Focus (+6 m): the strongest lamp there is
  const LAMPS = [[9, 1], [13, 1.28], [16, 1.56], [19, 1.84], [22, 2.12], [25, 2.4], [41, 3.6], [59, 3.6]];

  await T('lights.core.the-beam-is-eased-off-up-close-and-the-same-far-away', async () => {
    const bad = [];
    for (const [R] of LAMPS) {
      if (!(lampAtten(0.1, R) < oldAtt(0.1, R) * (LAMP_NEAR_MIN + 0.05))) bad.push(`range ${R}: at 10 cm ${lampAtten(0.1, R).toFixed(3)} vs ${oldAtt(0.1, R).toFixed(3)} before`);
      let prev = 0;
      for (const d of [0.1, 0.25, 0.5, 1, 1.5, 2, 2.6]) { const a = lampAtten(d, R) / oldAtt(d, R); if (!(a >= prev - 1e-9)) bad.push(`range ${R}: the share of the beam falls at ${d} m`); prev = a; }
      for (const d of [LAMP_NEAR_D1, 3, 6, 10, 15, 20, 30]) if (d < R * 0.98 && Math.abs(lampAtten(d, R) - oldAtt(d, R)) > 1e-9) bad.push(`range ${R}: the far beam changed at ${d} m`);
      if (lampAtten(R, R) !== 0 || lampAtten(R + 5, R) !== 0) bad.push(`range ${R}: the beam does not end at its range`);
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await T('lights.core.what-the-beam-gives-a-surface-never-passes-its-ceiling-with-any-upgrade', async () => {
    const bad = [];
    for (const [R, P] of LAMPS) {
      let peak = 0;
      for (let d = 0.02; d < R; d += 0.05) peak = Math.max(peak, lampRoll(2.6 * P * lampAtten(d, R)));
      if (!(peak <= LAMP_TOP + 1e-9)) bad.push(`range ${R} power ${P}: ${peak.toFixed(3)} is over the ${LAMP_TOP} ceiling`);
      // a white plush (albedo 0.95) in the beam alone, and in the beam in full daylight, stays under the bloom threshold: it never glows
      const white = rollOff(0.95 * peak + 0.0), day = rollOff(0.95 * (peak + 1.6));
      if (!(white < BLOOM_AT && day < BLOOM_AT && day <= HL_TOP + 1e-9)) bad.push(`range ${R} power ${P}: a white plush reaches ${white.toFixed(3)} / ${day.toFixed(3)} (bloom at ${BLOOM_AT})`);
    }
    if (!(HL_TOP < BLOOM_AT && LAMP_TOP < BLOOM_AT && HL_KNEE < HL_TOP && LAMP_KNEE < LAMP_TOP)) bad.push('the ceilings are not under the bloom threshold');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('lights.core.the-beam-adds-less-where-the-surface-is-already-lit', async () => {
    const bad = [];
    if (lampWhenLit(0) !== 1 || lampWhenLit(0.02) < 0.99) bad.push('the beam is cut in the dark: ' + lampWhenLit(0.02));
    let prev = 2; for (let a = 0; a <= 2; a += 0.05) { const f = lampWhenLit(a); if (!(f <= prev + 1e-12)) bad.push('not falling at ' + a.toFixed(2)); prev = f; }
    if (!(Math.abs(lampWhenLit(LAMP_AMB_FULL) - (1 - LAMP_AMB_CUT)) < 1e-9) || !(lampWhenLit(5) > 0.3)) bad.push('the cut at full light is ' + lampWhenLit(LAMP_AMB_FULL) + ' / ' + lampWhenLit(5));
    // a lit hall (a surface that already has 0.5 to 1.0 from the day) gets at most 6/10 of the beam; deep in the pile (under 0.05) at least 95%
    if (!(lampWhenLit(0.5) < 0.7 && lampWhenLit(1.0) < 0.4 && lampWhenLit(0.04) > 0.93)) bad.push(`lit ${lampWhenLit(0.5).toFixed(2)} ${lampWhenLit(1.0).toFixed(2)} dark ${lampWhenLit(0.04).toFixed(2)}`);
    // so with the strongest lamp (3.6x) in full day a white plush stays under the bloom threshold with room to spare
    for (const [R, P] of LAMPS) { let peak = 0; for (let d = 0.05; d < R; d += 0.1) peak = Math.max(peak, lampRoll(2.6 * P * lampAtten(d, R)) * lampWhenLit(0.6)); if (!(rollOff(0.95 * (0.6 + peak)) < BLOOM_AT)) bad.push(`range ${R}: ${rollOff(0.95 * (0.6 + peak)).toFixed(3)} in daylight`); }
    return bad.length === 0 || bad.join(' || ');
  });

  await T('lights.core.the-roll-off-keeps-the-order-so-the-shading-survives', async () => {
    const bad = [];
    let prevA = -1, prevB = -1;
    for (let m = 0; m <= 8; m += 0.05) {
      const a = rollOff(m), b = lampRoll(m);
      if (!(a > prevA - 1e-12) || !(b > prevB - 1e-12)) bad.push('not rising at ' + m.toFixed(2));
      if (m <= HL_KNEE && Math.abs(a - m) > 1e-12) bad.push('rollOff moved a value under its knee: ' + m);
      if (m <= LAMP_KNEE && Math.abs(b - m) > 1e-12) bad.push('lampRoll moved a value under its knee: ' + m);
      prevA = a; prevB = b;
    }
    // two plush that differ by 25% in the light still differ after it (not squashed flat) in the range where a lit plush lives: the brighter one stays at least 4% above the other
    for (const m of [0.3, 0.5, 0.65, 0.8]) { const r = rollOff(m * 1.25) / rollOff(m); if (!(r > 1.04)) bad.push(`at ${m} two plush 25% apart are ${r.toFixed(3)} apart after the roll-off`); }
    if (!(rollOff(1.5) - rollOff(1.0) > 0.01)) bad.push('the roll-off is flat above 1');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('lights.core.the-shader-text-and-the-twins-agree', async () => {
    const bad = [];
    const need = [`smoothstep(${LAMP_NEAR_D0.toFixed(2)}, ${LAMP_NEAR_D1.toFixed(2)}, ld)`, `lxm > ${LAMP_KNEE.toFixed(2)}`, `mx > ${HL_KNEE.toFixed(2)}`, `smoothstep(0.0, ${LAMP_AMB_FULL.toFixed(2)}, amb)`];
    for (const s of need) if (!plushFrag.includes(s)) bad.push('the plush shader lost ' + s);
    if (/uLampColor \* cone \* att \* ndl \* ndl/.test(plushFrag)) bad.push('the headlamp is added to the plush without the roll-off again');
    // no specular on the plush: no pow() of a half vector, no reflect()
    if (/reflect\(|normalize\(ldir \+ V\)|normalize\(L \+ V\)/.test(plushFrag)) bad.push('the plush shader has a specular highlight');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('lights.core.the-scene-has-the-same-lights-whatever-is-lit-and-the-shader-arrays-keep-their-size', async () => {
    fresh({}); const bad = [];
    const count = () => { const c = { point: 0, spot: 0, dir: 0, hemi: 0, other: 0 }; g.renderer.scene.traverse((o) => { if (o.isPointLight) c.point++; else if (o.isSpotLight) c.spot++; else if (o.isDirectionalLight) c.dir++; else if (o.isHemisphereLight) c.hemi++; else if (o.isLight) c.other++; }); return JSON.stringify(c); };
    const c0 = count(), u0 = [U.uPt.value.length, U.uPtCol.value.length];
    for (let n = 0; n < 12; n++) { const e = { id: g.nextId(), type: n % 3 === 0 ? 'flare' : 'lantern', x: -10 + n * 1.5, y: 0, z: 9, born: ctx.S().stats.playSecs, ...(n % 3 === 0 ? { glow: n % 2 === 0 } : {}) }; ctx.S().entities.push(e); g.addEntity(e); }
    ctx.p().pos.set(-6, 0, 6); adv(2.5);
    if (count() !== c0) bad.push(`the number of lights changed with 12 lamps placed: ${c0} then ${count()}`);
    if (U.uPt.value.length !== 10 || U.uPtCol.value.length !== 10 || u0[0] !== 10) bad.push('the plush shader light array changed size');
    ctx.p().pos.set(-6, 0, -1.4); adv(2.5); if (count() !== c0) bad.push('the number of lights changed after walking: ' + count());
    const c = JSON.parse(c0); if (!(c.spot === 1 && c.point <= 20 && c.point >= 4)) bad.push('unexpected light budget ' + c0);
    return bad.length === 0 || bad.join(' || ') + ' :: ' + c0;
  });

  await T('lights.core.the-lamp-near-ease-is-reached-and-never-takes-the-beam-below-a-third', async () => {
    fresh({}); const bad = []; ctx.p().pos.set(0, 0, -1.4); ctx.p().yaw = 0; ctx.p().pitch = 0; adv(0.6);
    const open = g._lampNear; if (!(open > 0.99)) bad.push('in the open the beam is eased: ' + open);
    // a plush wall straight ahead at 0.6 m (the closest the player can stand is about 0.34 m): the ease is down to a third or a half, not out
    const { toI, toK } = ctx; const wl = ctx.w(); const cells = [];
    const k0 = toK(-0.5); /* the wall's face is at z -0.8, 0.6 m in front of the eye at -1.4 */ for (let di = -2; di <= 2; di++) for (let j = 0; j < 5; j++) { const i = toI(0) + di; wl.setCell(i, j, k0, 3, 0); cells.push([i, j, k0]); }
    adv(1.0); const near = g._lampNear;
    for (const c of cells) wl.setCell(c[0], c[1], c[2], 0, 0);
    if (!(near >= 0.3 - 1e-6 && near < 0.75)) bad.push('with a wall in front the beam is at ' + near);
    adv(1.2); if (!(g._lampNear > 0.99)) bad.push('the beam did not come back: ' + g._lampNear);
    return bad.length === 0 || bad.join(' || ');
  });
}
