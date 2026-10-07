// mp.holelight.*: daylight through holes in multiplayer, with no network (one page plays both roles by switching g.net.role and capturing g.netSend, like mp_stack.js).
// Nothing about the light is ever sent: it is a pure function of the cells (holelight.js), so a guest, a late joiner and a loaded save draw the same light as the host as long as
// they hold the same cells. These tests prove that for the real cell sync, the real late joiner list and the host's real simulation, and that a guest cannot open the light
// by taking something it may not take.
import { World } from '../world.js';
import { BULK } from '../plushdata.js';
import * as HL from '../holelight.js';
import * as TR from '../transit.js';
import { kit as hlKit } from './holelight_lib.js';

export default async function (ctx) {
  const { T, g, newWorld, fresh, stepSim, clearBodies, cellX, cellY, cellZ } = ctx;
  const K = hlKit(ctx), W = K.W;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); if (g.world) g.world.onSet = null; g.netOut.length = 0; };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { await newWorld(); fresh({}); g.hall.level = 1; try { return await fn(); } finally { done(); clearBodies(); } });
  const hostWorld = () => { role('host'); cap(); g.world.onSet = (i, j, k, sp, vr) => g.netOut.push(i, j, k, sp, vr); g.netOut.length = 0; };
  const flush = () => { for (let n = 0; n < 200 && g.netOut.length; n++) { g._nt = 0; g.netUpdate(0.2); } };   // (one update sends 800 cells at most)
  const Scan = g.renderer.constructor.prototype.scanChunk;
  const scanOn = (world) => { const fake = { world }; return (cx, cy, cz) => Scan.call(fake, cx, cy, cz, false); };
  // the other screen: a pristine world of the same seed, fed through the game's own message handler as a guest
  const asGuest = (msgs) => {
    const host = g.world, gw = new World(g.S.seed); g.world = gw; role('guest');
    try { for (const m of msgs) g.netMessage(json(m)); } finally { g.world = host; role('host'); }
    return gw;
  };
  const cellsMsgs = () => json(ofType('cells'));
  const lit = (m) => { let n = 0; for (const e of m.values()) if (e.hole > 0) n++; return n; };

  await guard('mp.holelight.the-guest-draws-the-same-light-as-the-host-for-a-dig-a-block-and-a-re-dig', async () => {
    hostWorld(); const r = K.rig(), bad = [];
    const check = (label) => {
      flush(); const gw = asGuest(cellsMsgs());   // everything the host announced since the start of the test
      const a = K.scanAll(r), b = K.scanAll(r, scanOn(gw)); const d = K.same(a, b);
      if (d) bad.push(`${label}: guest light ${d}`);
      for (const [di, j, dk] of [[0, 1, 0], [2, 1, 0], [0, 2, 2], [5, 1, 1]]) if (Math.abs(HL.holeAt(W(), r.iS + di, j, r.kS + dk) - HL.holeAt(gw, r.iS + di, j, r.kS + dk)) > 1e-9) bad.push(`${label}: the camera light differs at +${di},${j},${dk}`);
      return a;
    };
    const open = check('dug');
    if (!(lit(open) > 40)) return 'the dug shaft lights only ' + lit(open) + ' plush';
    const jb = K.block(r, 'plate'); const shut = check('blocked'); if (lit(shut) >= lit(open)) bad.push('blocking did not remove light on the host');
    K.unblock(r, jb); const back = check('re-dug'); const d = K.same(open, back); if (d) bad.push('re-dug is not the first light: ' + d);
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.holelight.a-late-joiner-gets-the-same-light-from-the-world-list', async () => {
    const r = K.rig(), bad = [];
    const jb = K.block(r, 'wall'); K.unblock(r, jb); K.plug(r, 4);   // some history: a wall put in the shaft and taken out, plush slid into the tunnel
    hostWorld(); g.sendWorld(); const diffs = json(ofType('diff')); if (!diffs.length) return 'sendWorld sent no diff';
    const gw = asGuest(diffs); const a = K.scanAll(r), b = K.scanAll(r, scanOn(gw)); const d = K.same(a, b);
    if (d) bad.push('late joiner light ' + d); if (!(lit(a) > 40)) bad.push('the world lights only ' + lit(a) + ' plush');
    for (const [di, j, dk] of [[0, 1, 0], [2, 1, 0], [6, 1, 0]]) if (Math.abs(HL.holeAt(W(), r.iS + di, j, r.kS + dk) - HL.holeAt(gw, r.iS + di, j, r.kS + dk)) > 1e-9) bad.push('camera light differs at +' + di);
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.holelight.a-guest-digging-the-shaft-reaches-the-host-and-lights-its-screen', async () => {
    const r = K.rig({ shaft: false }), bad = [], cam = g.renderer.camera.position; role('host'); cap();
    const before = K.scanAll(r); if (lit(before) !== 0) return 'the tunnel without a shaft is lit already';
    // the cells a guest's digging sends: the column over the tunnel's second lane, from the ceiling to the open air
    const a = []; for (let j = r.rows; j <= r.T0; j++) a.push(r.iS, j, r.kS, 0, 0);
    g.netMessage({ t: 'cells', a });
    if (W().topAt(r.iS, r.kS) !== 0) return 'the host did not dig the shaft';
    if (!W().dirtyChunks.size) bad.push('the host world was not marked for a remesh');
    const after = K.scanAll(r); if (!(lit(after) > 40)) bad.push('the host plush are not lit by the guest dug shaft: ' + lit(after));
    cam.set(cellX(r.iS), cellY(2), cellZ(r.kS)); g.camSky = 0; g._entr = { x: -60, z: 0 }; for (let q = 0; q < 60; q++) g.renderEnv(0.1, cam);
    if (!(g.camSky > 0.8 * r.str(2))) bad.push('the host player is not lit in the shaft: ' + g.camSky.toFixed(2));
    for (let q = 0; q < 3; q++) { g.renderer.updateChunks(cam, 200); g.renderEnv(0.1, cam); } if (g.shafts.beams.length !== 1) bad.push('the host shows ' + g.shafts.beams.length + ' beams');
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.holelight.a-guest-cannot-take-the-door-that-shuts-the-light-out-but-can-take-a-plain-wall', async () => {
    const r = K.rig(), bad = [], side = (m, d) => K.hole(m, r.iS + d, 1, r.k0 - 1);
    hostWorld();
    const e = g.placeEntity('door', { ax: 'z', i0: r.iS + 3, k0: r.k0, j: 0, blast: false, lock: 'none', auto: false, tgt: 0, p: 0, st: 'closed', rid: 'door' }, { quiet: true });
    try {
      TR.setRows(g, e, 0); const shut = K.scanAll(r); if (side(shut, 5) !== 0 && side(shut, 5) !== null) return 'the closed door does not stop the light';
      // a guest's forged `bulk` command on every panel of the door: refused, the door and the dark behind it stay
      for (const [i, j, k] of TR.allDoorCells(e)) g.netCmd('bulk', { i, j, k });
      if (!TR.allDoorCells(e).every(([i, j, k]) => W().get(i, j, k) === BULK)) bad.push('a guest took a door panel');
      const still = K.scanAll(r); if (K.same(shut, still)) bad.push('the guest command changed the light'); else if (side(still, 5) !== 0 && side(still, 5) !== null) bad.push('light got past the door');
      TR.setRows(g, e, 4); g.doDecon({ kind: 'mach', id: e.id });
      // a plain wall section across the tunnel (no owner): the guest takes one cell of it, and the light finds the gap
      const wall = []; for (let k = r.k0; k < r.k0 + r.wide; k++) for (let j = 0; j < r.rows; j++) { W().setCell(r.iS + 3, j, k, BULK, 240); wall.push([r.iS + 3, j, k]); }
      const walled = K.scanAll(r); if (side(walled, 5) !== 0 && side(walled, 5) !== null) bad.push('the wall does not stop the light');
      g.netCmd('bulk', { i: r.iS + 3, j: 1, k: r.kS }); if (W().get(r.iS + 3, 1, r.kS) !== 0) bad.push('the guest could not take a plain wall cell');
      const gap = K.scanAll(r); if (!(side(gap, 5) > 0)) bad.push('no light through the gap the guest opened');
      // a `bulk` command for a cell that is not a wall at all does nothing
      const n0 = K.scanAll(r); g.netCmd('bulk', { i: r.iS + 2, j: 1, k: r.kS }); if (K.same(n0, K.scanAll(r))) bad.push('a bulk command on an empty cell changed the light');
      for (const [i, j, k] of wall) if (W().get(i, j, k) === BULK) W().setCell(i, j, k, 0, 0);
    } finally { if (g.machines.items.get(e.id)) g.doDecon({ kind: 'mach', id: e.id }); }
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.holelight.the-hosts-own-cave-in-and-the-guest-light-agree', async () => {
    // the host simulates: the unsupported roof round the shaft is queued for the real stability loop and whatever falls (or does not) is announced as cells.
    hostWorld(); const r = K.rig({ depth: 14, right: 20 }), bad = [];
    for (let i = r.i0 - 1; i <= r.i1 + 1; i++) for (let k = r.k0 - 1; k <= r.k0 + r.wide; k++) for (let j = 0; j <= 8; j++) if (W().get(i, j, k)) W().stabQueue.push({ i, j, k });
    const h0 = K.scanAll(r); const before = lit(h0);
    stepSim(30); clearBodies(); flush();
    const hostAfter = K.scanAll(r), gw = asGuest(cellsMsgs());
    const d = K.same(hostAfter, K.scanAll(r, scanOn(gw))); if (d) bad.push('guest light after the host collapse: ' + d);
    if (!(before > 40)) bad.push('the shaft lit only ' + before);
    // and whatever the roof did, the single cell light agrees with the baked light on the host
    const S2 = HL.makeScratch();
    for (const [cx, cy, cz] of K.chunksOf(r, 7)) { const F = HL.windowFor(W(), cx * 16, cy * 16, cz * 16, S2); if (!F.hf) continue; for (let jj = 0; jj < 18; jj++) for (let z = HL.HOLE_R + 2; z < HL.HOLE_R + 19; z++) for (let x = HL.HOLE_R + 2; x < HL.HOLE_R + 19; x++) { const j = F.jb + jj; if (j < 0) continue; if (Math.abs(F.hf[(jj * F.Wd + z) * F.Wd + x] - HL.holeAt(W(), F.ib + x, j, F.kb + z)) > 1e-6) { bad.push('field and cell light differ after the collapse'); jj = 99; z = 999; break; } } }
    return bad.length === 0 || bad.join('; ');
  });
}
