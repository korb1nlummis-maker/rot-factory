// botnav.audit.walk.*: adversarial checks on ramps and plates. A bot never rests in mid air when its floor goes, never oscillates on a ramp, never walks under a lintel it cannot
// clear or through a wall, and a long search stays inside its cap.
// Run: `await __selftest('botnav.audit.walk')`
import { kit } from './botnav_lib.js';

export default async function (ctx) {
  const { g, S, w, p } = ctx;
  const X = kit(ctx), C = 0.6, NAV = X.NAV;
  const I0 = () => ctx.toI(-9), K0 = () => ctx.toK(2);
  const arena = (P, ramps) => { X.clearAbove(P.i0 - 9, P.k0 - 3, 16, 12, 6); X.fence(P.pad, undefined, ramps); };

  await X.guard('botnav.audit.walk.a-follow-bot-beside-a-player-standing-mid-ramp-comes-to-rest-and-does-not-oscillate', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); g.crew.follow(b);
    const px = X.cellX(P.i0 - 1), pz = X.cellZ(P.k0 + 2), py = 0.3;   // on the ramp, half way up
    const put = () => { p().pos.set(px, py, pz); p().vel.set(0, 0, 0); };
    put(); X.watch(b, 15, null, { each: put });
    // the next 12 s: count the frames in which it moved, and the sign changes of its motion along x
    let moved = 0, flips = 0, lastDir = 0, last = { x: b.x, y: b.y, z: b.z }, ymin = 9, ymax = -9;
    X.watch(b, 12, null, { each: (bb) => { put(); const d = bb.x - last.x; if (Math.hypot(d, bb.z - last.z) > 0.004) moved++; const dir = Math.abs(d) < 0.004 ? 0 : Math.sign(d); if (dir && lastDir && dir !== lastDir) flips++; if (dir) lastDir = dir; last = { x: bb.x, y: bb.y, z: bb.z }; ymin = Math.min(ymin, bb.y); ymax = Math.max(ymax, bb.y); } });
    if (flips > 4) return `${flips} direction flips in 12 s (moved in ${moved} of 240 frames)`;
    if (moved > 60) return `still moving in ${moved} of 240 frames after 15 s`;
    return ymax - ymin < 0.35 || `y wandered ${ymin.toFixed(2)} .. ${ymax.toFixed(2)}`;
  });

  await X.guard('botnav.audit.walk.a-plate-that-vanishes-under-a-walking-bot-drops-it-at-once', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(5); g.crew.goHome(b);
    let gone = false, hover = 0, goneT = 0;
    const rec = X.watch(b, 40, () => gone && goneT > 3, { each: (bb) => {
      if (!gone && bb.y > 0.55 && bb.x > X.cellX(P.i0) - 0.2 && bb.x < X.cellX(P.i0 + 1)) { gone = true; for (let di = 0; di < 4; di++) for (let dk = 0; dk < 4; dk++) w().setCell(P.pad.i0 + di, 0, P.pad.k0 + dk, 0, 0); }
      if (gone) { goneT += 0.05; const gap = bb.y - X.support(bb.x, bb.y, bb.z); if (gap > 0.25 && Math.abs(bb.vy) < 0.01) hover++; }
    } });
    if (!gone) return 'the bot never got on the pad: ' + rec.states.join() + ' ' + b.y.toFixed(2);
    if (hover > 3) return `the bot hung in mid air for ${hover} frames after the plate was gone`;
    return true;
  });

  await X.guard('botnav.audit.walk.a-lintel-at-head-height-is-not-walked-under-and-one-above-it-is', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const from = { x: X.cellX(P.i0 - 6), y: 0, z: X.cellZ(P.k0 + 2) }, to = { x: X.cellX(P.i0 + 2), y: C, z: X.cellZ(P.k0 + 2) };
    if (!NAV.reachable(from, to, { dy: 0.3 })) return 'not reachable to begin with';
    // a lintel across the whole width of the ramp's mouth, at the third clear row over the pad (row 3, pad top is row 1): feet at row 1 means rows 1, 2, 3 must be clear
    const lin = (row) => { const cells = []; for (let k = P.k0 - 1; k <= P.k0 + 4; k++) { cells.push([P.i0 - 1, row, k]); } return cells; };
    for (const [i, j, k] of lin(2)) if (!w().get(i, j, k)) w().setCell(i, j, k, 2, 0);   // over the ramp's own run at the pad's top level: a ceiling of plush two rows over the ramp's foot
    NAV.invalidate('test'); const blocked = !NAV.reachable(from, to, { dy: 0.3 });
    for (const [i, j, k] of lin(2)) w().setCell(i, j, k, 0, 0);
    NAV.invalidate('test');
    for (const [i, j, k] of lin(6)) if (!w().get(i, j, k)) w().setCell(i, j, k, 2, 0);
    NAV.invalidate('test'); const open = NAV.reachable(from, to, { dy: 0.3 });
    for (const [i, j, k] of lin(6)) w().setCell(i, j, k, 0, 0);
    if (!blocked) { const sp = X.B.spec(P.ramp); return `a plush lintel two rows over the ramp did not block the path: ramp i ${P.ramp.i0}..${P.ramp.i0 + sp.nx - 1} k ${P.ramp.k0}..${P.ramp.k0 + sp.nz - 1} rise ${P.ramp.rise} pad i0 ${P.pad.i0} k0 ${P.pad.k0}`; }
    return open || 'a lintel six rows up blocked the path';
  });

  await X.guard('botnav.audit.walk.plush-landing-on-the-route-mid-trip-never-lets-a-bot-walk-into-it-and-never-hangs-it-forever', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(5); g.crew.goHome(b);
    let placed = false, inside = 0, idleHold = 0, firstIn = '';
    const solidAtBot = (bb) => { const i = ctx.toI(bb.x), k = ctx.toK(bb.z), j0 = Math.floor(bb.y / C + 1e-6); for (let h = 0; h < 3; h++) if (w().solid(i, j0 + h, k)) return true; return false; };
    const trail = []; const rec = X.watch(b, 40, null, { dbg: 400, each: (bb) => {
      trail.push([+g.time.toFixed(2), +bb.x.toFixed(2), +bb.y.toFixed(2), bb.state].join(' ')); if (!placed && bb.x > X.cellX(P.i0 - 5)) { placed = true; for (let k = P.k0 - 1; k <= P.k0 + 4; k++) for (let j = 0; j < 4; j++) if (!w().get(P.i0 - 1, j, k)) w().setCell(P.i0 - 1, j, k, 2, 0); }   // a plush wall across the ramp's foot (what an avalanche or a player's cube does)
      if (placed && solidAtBot(bb)) { inside++; if (inside === 1) firstIn = `cells ${[0, 1, 2, 3].map((j) => w().get(ctx.toI(bb.x), j, ctx.toK(bb.z))).join()} at ${bb.x.toFixed(2)},${bb.y.toFixed(2)},${bb.z.toFixed(2)} cell ${ctx.toI(bb.x)} (wall at ${P.i0 - 1}) state ${bb.state} t ${g.time.toFixed(2)} DBG ${JSON.stringify((g._navDbg || []).slice(-30))} TRAIL ${trail.slice(-30).join('|')}`; }
    } });
    if (!placed) return 'the bot never came near the ramp';
    if (inside > 0) return `the bot stood inside plush for ${inside} frames, first ${firstIn}`;
    // and it does not hang for ever: it says so, or it is back home within the stuck timer
    return toasts.some((m) => /No way up|stuck/i.test(m)) || (b.state === 'idle' && Math.hypot(b.x - g.crew.home().x, b.z - g.crew.home().z) < 4) || `after 40 s: ${b.state} at ${b.x.toFixed(1)}, ${b.y.toFixed(2)}, toasts: ${toasts.join(' / ')}`;
  });

  await X.guard('botnav.audit.walk.a-wall-built-across-the-pad-stops-a-bot-and-it-never-walks-through', async (toasts) => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    const t = X.gen(P.i0 + 3, P.k0 + 2, 1);
    for (let k = P.k0; k < P.k0 + 4; k++) for (let j = 1; j < 5; j++) if (!w().get(P.i0 + 1, j, k)) w().setCell(P.i0 + 1, j, k, 2, 0);   // a wall on the pad between the ramp and the generator
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(4);
    b.fuelJob = { id: t.id, n: 4, k: 'give' }; b.path = [[X.cellX(P.i0 + 3) - 0.9, X.cellZ(P.k0 + 2)]]; b.pi = 0; b.state = 'fwalk';
    let maxX = -1e9; X.watch(b, 20, null, { each: (bb) => { if (bb.y > 0.4) maxX = Math.max(maxX, bb.x); } });   // (on the pad: the call routes release a call that has no way and the bot then walks home along the floor)
    if (t.q.length) return 'the generator was fueled through a wall';
    return maxX < X.cellX(P.i0 + 1) + 0.1 || 'the bot got to x ' + maxX.toFixed(2) + ' past the wall at ' + X.cellX(P.i0 + 1).toFixed(2);
  });

  await X.guard('botnav.audit.walk.a-bot-delivers-to-a-vault-on-a-plate-and-comes-home-with-crew-belt-on', async (toasts) => {
    g.T.crewBelt = true;
    try {
      const P = await X.platform(I0(), K0()); arena(P, P.ramp);
      const v = X.tile('vault', P.i0 + 2, P.k0 + 2, 1, { stored: [] });
      const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(4); b.deliver = v.id; const n0 = X.count() + (v.stored ? v.stored.length : 0);
      if (!g.crew.startDeliver(b)) return 'startDeliver refused: ' + b.state;
      let top = 0; const rec = X.watch(b, 80, () => b.carry.length === 0 && b.state === 'idle' && NAV.isGround(b), { each: (bb) => { top = Math.max(top, bb.y); } });
      const got = v.stored ? v.stored.length : -1;
      if (top < 0.5) return `the bot never got up (${rec.states.join()}, ${toasts.join(' / ')})`;
      if (got !== 4) return `the vault holds ${got} of 4 (${rec.states.join()}, carry ${b.carry.length})`;
      return NAV.isGround(b) || 'not back down: ' + b.y.toFixed(2);
    } finally { g.T.crewBelt = false; }
  });

  await X.guard('botnav.audit.walk.a-search-never-opens-more-nodes-than-its-cap-and-the-node-table-stays-bounded', async () => {
    const P = await X.platform(I0(), K0()); arena(P, P.ramp);
    NAV.resetStats();
    const from = { x: X.cellX(P.i0 - 6), y: 0, z: X.cellZ(P.k0 + 2) };
    const far = { x: X.cellX(P.i0 + 2) + 40, y: 9 * C, z: X.cellZ(P.k0 + 2) };   // a goal 40 m beyond in the air: no surface there at all
    const r = NAV.pathTo(from, far, { sync: true, cap: 300 }); const st = NAV.stats();
    if (st.expanded > 300) return 'opened ' + st.expanded + ' nodes with a cap of 300';
    // many different goals over the same version: the node table and the cache stay bounded
    for (let n = 0; n < 700; n++) NAV.pathTo({ x: from.x + (n % 25) * 0.6, y: 0, z: from.z + ((n / 25) | 0) * 0.6 }, { x: X.cellX(P.i0 + 2), y: C, z: X.cellZ(P.k0 + 2) }, { sync: true, cap: 400 });
    const s2 = NAV.stats();
    if (s2.cache > 400) return 'the cache grew to ' + s2.cache;
    return (s2.nodes === undefined || s2.nodes < 60000) || 'the node table holds ' + s2.nodes;
  });
}
