import { pickSpecies, volatilePool, species } from '../plushdata.js';
export default async function (ctx) {
  const { T, g, S, w, p, sim, fresh, stepSim, adv, spot, dig, toI, toK, cellX, cellZ, newWorld } = ctx;
  await T('razzo.very-rare-and-not-in-the-normal-pools', async () => {
    if (volatilePool.length < 10) return 'no razzo species: ' + volatilePool.length;
    let h = 0x9e3779b9, hits = 0; const N = 2000000;
    for (let n = 0; n < N; n++) { h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; const h2 = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; const sp = pickSpecies(h, h2 ^ (n * 2654435761), false); if (species[sp].volatile) hits++; }
    const per = N / Math.max(1, hits); return (hits > 0 && per > 30000 && per < 120000) || `one razzo per ${per.toFixed(0)} plush (want 30,000 to 120,000)`;
  });
  await T('razzo.pickup-lights-a-3-second-fuse', async () => {
    fresh({}); S().carry = []; g.fuses = []; const sp = volatilePool[0]; g.pickedUp({ sp, vr: 0 }, p().pos.clone()); const f = g.fuses[0];
    return (g.fuses.length === 1 && f.t > 3 && S().carry.length === 1) || 'fuse ' + JSON.stringify(f && f.t);
  });
  await T('razzo.blast-removes-a-big-hole-releases-the-roof-and-breaks-supports', async () => {
    await newWorld(); fresh({ timber: 1 }); let sp0 = spot(); for (const lane of [20, 28, 6, -6]) { if (w().topAt(sp0.i + 14, sp0.k) >= 10) break; try { sp0 = spot(lane); } catch (e) { /* none */ } } const { i, k } = sp0;
    dig(i, k - 1, 40, 4, 4, false); const fe = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'x', cx: cellX(i + 22), cz: cellZ(k + 1) + 0.3, y0: 0, w: 2.36, h: 2.38, gm: i + 22, glo: k - 1, gj: 0 }; S().entities.push(fe); g.addEntity(fe);
    p().pos.set(cellX(i - 20), 0, cellZ(k)); g.hp = 100; const co0 = S().stats.collapses || 0; const roof = () => { let c = 0; for (let x = i + 5; x < i + 40; x++) for (let z = k - 1; z < k + 3; z++) if (w().get(x, 4, z)) c++; return c; }; const roof0 = roof(); const cells0 = S().stats.cells || 0;
    g.razzoBlast(cellX(i + 22), 1.2, cellZ(k + 1)); if (w().supports.some((s) => s.id === fe.id)) return 'the frame next to the blast survived';
    if ((S().stats.cells || 0) - cells0 < 100) return 'blast removed only ' + ((S().stats.cells || 0) - cells0) + ' cells';
    stepSim(25); const lost = roof0 - roof(); return (lost > 15 || (S().stats.collapses || 0) > co0) || `roof barely moved: ${lost} cells of ${roof0}`;
  });
  await T('razzo.thrown-fuse-keeps-burning-and-goes-off-where-it-lands', async () => {
    await newWorld(); fresh({}); S().carry = []; g.fuses = []; clearAll(); const sp = volatilePool[3]; g.pickedUp({ sp, vr: 0 }, p().pos.clone());
    // throw it 12 m away: out of the hands, into the world as a loose body
    const it = S().carry.pop(); const x = p().pos.x + 12, z = p().pos.z; const bi = sim().spawn(it.sp, it.vr, x, 0.5, z, 0, 0, 0, 1); g.ui.setCarry(S().carry, g.T.carry);
    const b0 = S().stats.blasts || 0, cells0 = S().stats.cells || 0; let calls = []; const orig = g.razzoBlast.bind(g); g.razzoBlast = (bx, by, bz) => { calls.push([bx, bz]); };
    for (let n = 0; n < 200 && !calls.length; n++) { g.time += 0.05; g.updateFuses(0.05); sim().x[sim().indexOfId(sim().bid[bi] ?? -1)] ; }
    g.razzoBlast = orig; void b0; void cells0;
    return (calls.length === 1 && Math.abs(calls[0][0] - x) < 3 && Math.hypot(calls[0][0] - p().pos.x, calls[0][1] - p().pos.z) > 8) || 'blast at ' + JSON.stringify(calls) + ' expected near ' + x.toFixed(1);
  });
  function clearAll() { while (sim().n > 0) sim().remove(sim().n - 1); }
}
