// Adversarial QA of the Razzo plush: fuses, warnings, several at once, blasts at the edges, forced creaks.
export default async function (ctx) {
  const { T, g, S, w, p, sim, fresh, spot, dig, adv, stepSim, cellX, cellZ, toI, toK, toJ, newWorld, species, THREE } = ctx;
  let RZ = 0; for (let s = 1; s < 4000 && !RZ; s++) if (species[s] && species[s].volatile) RZ = s;
  const warnEl = () => document.getElementById('warn'); const warnText = () => (warnEl().classList.contains('hidden') ? '' : warnEl().textContent);
  const settle = () => { g.fuses = []; g._fuseTxt = ''; g.ui.setWarn(''); sim().n = 0; S().carry = []; };
  const hold = () => { const it = { sp: RZ, vr: 5 }; S().carry.push(it); g.lightFuse(it); return it; };
  const throwBody = (x, y, z) => { const i = sim().spawn(RZ, 5, x, y, z, 0, 0, 0, 0); return i; };

  await T('qa.razzo.there-is-a-razzo-species', async () => RZ > 0 || 'no volatile species');

  await T('qa.razzo.the-fuse-warning-is-visible-while-it-burns-and-gone-after', async () => {
    fresh({}); settle(); hold(); adv(0.3); const t1 = warnText(); if (!/^FUSE \d/.test(t1)) return 'no FUSE text on screen while the fuse burns (HUD cleared it): "' + t1 + '"';
    S().carry = []; adv(1.0); const t2 = warnText(); return (g.fuses.length === 0 && t2 === '') || `fuse still tracked ${g.fuses.length} or warning stuck "${t2}"`;
  });

  await T('qa.razzo.a-fuse-on-plush-that-is-sold-or-carted-goes-out-and-clears-the-warning', async () => {
    fresh({}); settle(); const it = hold(); adv(0.2); if (!g.fuses.length) return 'no fuse'; S().carry = []; S().cart = null;   // sold into the bin or put in a cart: no body, nothing in hands
    adv(1.2); return (g.fuses.length === 0 && warnText() === '' && (S().stats.razzos || 0) === (S().stats.razzos || 0)) || 'fuse leaked: ' + g.fuses.length + ' warn "' + warnText() + '"';
  });

  await T('qa.razzo.two-razzos-in-the-air-both-go-off', async () => {
    fresh({}); settle(); S().stats.razzos = 0; const a = hold(), b = hold(); S().carry = []; p().pos.set(-14, 0, 0); p().vel.set(0, 0, 0);   // both thrown, you are 20 m from both in the open bay
    throwBody(-6, 3, 10); throwBody(-6, 3, -12);   // well away from the bin, which would pull them in and sell them
    const boomed = [];
    const orig = g.razzoBlast; g.razzoBlast = function (...q) { boomed.push(q.slice(0, 3)); return orig.apply(this, q); };
    try { adv(5, 0.05); } finally { g.razzoBlast = orig; }
    return (boomed.length === 2 && g.fuses.length === 0 && S().stats.razzos === 2) || `blasts ${boomed.length}, fuses left ${g.fuses.length}, stat ${S().stats.razzos} (a Razzo that comes to rest on the pile turns into a cell: its fuse must keep burning)`;
  });

  await T('qa.razzo.fuses-do-not-leak-into-a-new-game', async () => {
    fresh({}); settle(); hold(); adv(0.1); g.ui.setWarn('FUSE 2.0'); await newWorld(); adv(0.3);
    return (g.fuses.length === 0 && warnText() === '') || `new game has ${g.fuses.length} fuses, warning "${warnText()}"`;
  });

  await T('qa.razzo.blasts-at-the-edges-below-the-floor-and-far-outside-never-throw-or-hang', async () => {
    fresh({}); settle(); const bad = [];
    const pts = [[cellX(2), 1.2, cellZ(2)], [cellX(ctx.cfg.NX - 3), 1.2, cellZ(ctx.cfg.NZ - 3)], [cellX(2), 1.2, cellZ(ctx.cfg.NZ - 3)], [0, -8, 0], [0, 400, 0], [-5000, 1, 5000], [cellX(toI(0) + 40), 30, cellZ(toK(0) + 20)]];
    for (const [x, y, z] of pts) { try { g.razzoBlast(x, y, z); } catch (e) { bad.push(`${x | 0},${y | 0},${z | 0} threw ${e.message}`); continue; } w().creaking.clear(); w().stabQueue.length = 0; const t0 = performance.now(); g.razzoBlast(x, y, z); const ms = performance.now() - t0;   // the first blast pays for generating the far terrain; time the second
      if (ms > 250) bad.push(`${x | 0},${y | 0},${z | 0} took ${ms.toFixed(0)} ms`);
      for (const c of w().creaking.values()) if (!w().inside(c.i, c.j, c.k)) { bad.push(`${x | 0},${y | 0},${z | 0} marked a cell outside the world ${c.i},${c.j},${c.k}`); break; } w().creaking.clear(); w().stabQueue.length = 0; }
    return bad.length === 0 || bad.join('; ');
  });

  await T('qa.razzo.a-deep-blast-is-cheap-and-every-forced-creak-clears', async () => {
    fresh({ timber: 1 }); settle(); let sp; for (const lane of [12, 22, 4, -8]) { try { sp = spot(lane); } catch (e) { continue; } if (w().topAt(sp.i + 40, sp.k) >= 30) break; }
    const { i, k } = sp; dig(i, k - 2, 40, 4, 4, false); const x = cellX(i + 20), z = cellZ(k); p().pos.set(cellX(i + 2), 0, z); g.razzoBlast(x, 1.2, z); w().creaking.clear(); w().stabQueue.length = 0; const t0 = performance.now(); g.razzoBlast(x, 1.2, z); const ms = performance.now() - t0;   // warm run: the first one pays for generating the terrain around
    const marked = w().creaking.size; let n = 0; const T0 = performance.now();
    for (; n < 160 && (w().creaking.size || w().stabQueue.length); n++) { stepSim(0.5, 1 / 30); if (n % 10 === 9) for (let q = 0; q < sim().n; q++) if (sim().age[q] > 3) { sim().remove(q); q--; } }
    return (ms < 150 && marked > 0 && w().creaking.size === 0 && n < 160) || `blast ${ms.toFixed(0)} ms, ${marked} cells marked, ${w().creaking.size} still creaking after ${n * 0.5} s of play (${(performance.now() - T0).toFixed(0)} ms), bodies ${sim().n}`;
  });

  await T('qa.razzo.a-razzo-dug-out-quietly-still-lights-its-fuse', async () => {
    fresh({}); settle(); g.pickedUp({ sp: RZ, vr: 3 }, new THREE.Vector3(0, 1, 0), true); const lit = g.fuses.length; settle(); return lit === 1 || 'a Razzo picked up quietly (Scoop Hands) came with no fuse';
  });
}
