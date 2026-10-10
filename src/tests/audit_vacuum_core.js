// audvac.*: the adversarial audit of the VACUUM dial (src/dials.js, game.vacPct / vacNow / adjustVac / runVacuum / interact). Run: `await __selftest('audvac.')`.
import { kit as islandKit } from './island_lib.js';
import { SAVE_KEY } from '../config.js';
import { loadSaved } from '../state.js';

export default async function (ctx) {
  const { T, g, S, w, p, sim, fresh, cellX, cellY, cellZ, toI, toJ, toK, V3, clearBodies, newWorld } = ctx;
  const TOP = { bag: 8, cargo: 4, reach: 4, gloves: 3, scoop: 4, bucketHands: 4, vac: 5, tamp: 8, bedrockTamp: 4 };
  const setDial = (vac, scoop) => { S().vacSet = vac; S().scoopSet = scoop; g.T = g.tune(); g.T.carry = 1e9; S().carry = []; g.vacAcc = 0; g._vacRef = null; };
  // a wall of plush `deep` cells thick, 20 high and 30 wide in a cleared bay, the player 2.4 m from its west face
  const wall = async (up, deep = 10) => {
    await newWorld(); const K = islandKit(ctx); const a = K.arena(50, 50, up); delete S().vacSet; delete S().scoopSet; g.T = g.tune(); g.T.carry = 1e9; g.stowed = true;
    const i0 = a.i0 + 4, k0 = a.k0 + 10; const zc = (cellZ(k0) + cellZ(k0 + 29)) / 2, x0 = cellX(i0) - 0.3;
    const refill = () => { K.dig(i0, 0, k0, deep, 20, 30, false); K.block(i0, 0, k0, deep, 20, 30, 2); };
    const stand = (y = 1.2, dz = 0) => { p().pos.set(x0 - 2.4, 0, zc); p().vel.set(0, 0, 0); const e = p().eyePos(new V3()); p().yaw = Math.atan2(2.7, dz); p().pitch = Math.atan2(y - e.y, Math.hypot(2.7, dz)); return [p().eyePos(new V3()), p().forward(new V3())]; };
    refill();
    return { K, i0, k0, zc, x0, stand, refill, deep };
  };

  // the burst a click starts runs on a timer that only the vacuum's own branch of interact() counts down. Turning the dial to 0 in the middle of a burst left that timer frozen above zero,
  // and the hold-to-grab branch refuses to run while it is above zero, so holding the grab at 0 took nothing (and the stale burst woke up the moment the dial went back up).
  await T('audvac.turning-the-dial-to-zero-in-a-burst-frees-the-hands-to-hold-grab', async () => {
    const bad = []; const W = await wall(TOP);
    setDial(50, 0); W.refill(); g.vacT = 0; g.grabCd = 0; g.holdBlock = false; g.throwHold = false;
    let [eye, dir] = W.stand(); g.curTargetRef = g.findTarget(eye, dir); if (!g.curTargetRef) return 'no target at the wall';
    g.gPress(); if (!(g.vacT > 0)) return 'the click did not start a burst';
    for (let n = 0; n < 3; n++) { g.time += 0.033; g.interact(0.033, eye, dir); }
    for (let n = 0; n < 6; n++) g.adjustVac(-1); if (g.vacPct() !== 0) return 'dial did not reach 0: ' + g.vacPct();
    S().carry = []; g.keys = { Mouse0: true }; g.gDownAt = 0; g.holdBlock = false; g.throwHold = false;
    for (let n = 0; n < 40; n++) { g.grabCd = Math.max(0, g.grabCd - 0.033); g.time += 0.033; g.interact(0.033, eye, dir); }
    g.keys = {}; const held = S().carry.length;
    if (held < 3) bad.push(`holding the grab at 0 percent took ${held} plush in 1.3 s (vacT ${g.vacT})`);
    if (g.vacT > 0) bad.push('the burst timer is still ' + g.vacT + ' with the vacuum off');
    // and raising the dial again must not wake a burst nobody asked for
    S().carry = []; g.adjustVac(1); for (let n = 0; n < 30; n++) { g.time += 0.033; g.interact(0.033, eye, dir); } if (S().carry.length) bad.push('a stale burst pulled ' + S().carry.length + ' plush after the dial went up');
    g.vacT = 0; clearBodies(); S().carry = [];
    return bad.length === 0 || bad.join('; ');
  });

  // The depth rule measures from the first plush ON the aim line. With nothing within 0.45 m of the line (the line runs beside a pile, down the bore of a tunnel, past the edge of a wall) there is no
  // first plush, and the whole cone dug without any depth limit, as at 100 percent: holding the grab a hand's width off a pile took all of it.
  await T('audvac.aiming-beside-a-pile-is-depth-limited-like-aiming-at-it', async () => {
    const bad = []; const W = await wall(TOP, 12); const res = {};
    for (const [pct, hold] of [[30, 1.0], [60, 1.0]]) for (const side of ['at', 'beside']) {
      setDial(pct, 0); W.K.dig(W.i0, 0, W.k0, 12, 20, 30, false);
      p().pos.set(W.x0 - 2.4, 0, W.zc); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0; let eye = p().eyePos(new V3()); const jE = toJ(eye.y), kC = toK(W.zc);
      const kb = side === 'at' ? kC : kC + 2; for (let x = 0; x < 12; x++) { w().setCell(W.i0 + x, jE, kb, 2, 0); }   // a bar one cell wide and 12 deep at eye height
      if (side === 'beside') p().pos.set(W.x0 - 2.4, 0, cellZ(kb) - 0.55);   // the aim line runs 0.55 m beside the bar (it needs to be 0.45 m or more to miss it)
      eye = p().eyePos(new V3()); const dir = p().forward(new V3()), dt = 1 / 30; g.vacT = 5;
      for (let n = 0; n < hold / dt; n++) { g.time += dt; g.runVacuum(dt, eye, dir); }
      let took = 0; for (let x = 0; x < 12; x++) if (!w().get(W.i0 + x, jE, kb)) took++; res[pct + side] = took;
    }
    if (res['30at'] > 6) bad.push(`aimed at the bar at 30%: ${res['30at']} of 12 in a second`);
    if (res['30beside'] > res['30at'] + 3) bad.push(`aimed beside the bar at 30%: ${res['30beside']} of 12 in a second, aimed at it ${res['30at']}`);
    if (res['60beside'] > res['60at'] + 4) bad.push(`aimed beside the bar at 60%: ${res['60beside']} of 12 in a second, aimed at it ${res['60at']}`);
    g.vacT = 0; clearBodies(); S().carry = [];
    return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(res);
  });

  // A burst the click starts (and the aim line it measured) belong to the game it was started in: loading a save, or starting a new shift, must not let the old burst pull plush in the new one.
  await T('audvac.loading-a-save-ends-a-burst-and-forgets-its-aim-line', async () => {
    const bad = []; await wall(TOP); S().vacSet = 60; g.T = g.tune(); g.T.carry = 1e9;
    const kept = localStorage.getItem(SAVE_KEY), noSave0 = g.noSave;
    try {
      g.noSave = false; g.mode = 'play'; if (!g.save()) return 'save failed';
      g.vacT = 1.5; g.vacAcc = 0.7; g._vacRef = { dx: 1, dy: 0, dz: 0, ex: 0, ey: 0, ez: 0, age: 0, dist: 1 };
      const sv = loadSaved(); g.loadWorld(sv.S, sv); g.T = g.tune();
      if (g.vacT) bad.push('the burst timer survived the load: ' + g.vacT); if (g.vacAcc) bad.push('the pull accumulator survived: ' + g.vacAcc); if (g._vacRef) bad.push('the old aim line survived the load');
      if (g.vacPct() !== 60) bad.push('the setting did not load: ' + g.vacPct());
    } finally { g.noSave = noSave0; if (kept === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, kept); g.mode = 'play'; g.vacT = 0; g.vacAcc = 0; g._vacRef = null; delete S().vacSet; }
    return bad.length === 0 || bad.join('; ');
  });
}
