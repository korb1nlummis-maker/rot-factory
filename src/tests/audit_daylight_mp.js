// mp.holelight.audit.*: daylight through holes in multiplayer, the auditor's part (no network: one page plays both roles, as in holelight_mp.js).
// The light is a pure function of the cells, so what must hold is that the SCREEN of each role draws it: the chunks a late joiner or a guest actually shows (renderer.chunks),
// not only a fresh scan of its world, and that nothing a guest can send makes the host's light differ from the host's cells.
import { World } from '../world.js';
import { PAD } from '../plushdata.js';
import * as HL from '../holelight.js';
import { kit as hlKit } from './holelight_lib.js';

export default async function (ctx) {
  const { T, g, newWorld, fresh, cellX, cellY, cellZ } = ctx;
  const K = hlKit(ctx), W = K.W;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); if (g.world) g.world.onSet = null; g.netOut.length = 0; };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { await newWorld(); fresh({}); g.hall.level = 1; const w0 = g.world; try { return await fn(); } finally { done(); if (g.renderer.world !== w0 && g.world === w0) g.renderer.setWorld(w0); } });
  const hostWorld = () => { role('host'); cap(); g.world.onSet = (i, j, k, sp, vr) => g.netOut.push(i, j, k, sp, vr); g.netOut.length = 0; };
  const flush = () => { for (let n = 0; n < 200 && g.netOut.length; n++) { g._nt = 0; g.netUpdate(0.2); } };
  const asGuest = (msgs) => {
    const host = g.world, gw = new World(g.S.seed); g.world = gw; role('guest');
    try { for (const m of msgs) g.netMessage(json(m)); } finally { g.world = host; role('host'); }
    return gw;
  };
  const pump = (cam, n = 80) => { const r = g.renderer; for (let q = 0; q < n; q++) { r.updateChunks(cam, 500); if (!r.pending.length && !(r.spill && r.spill.length) && !r.world.dirtyChunks.size) break; } };
  // the light drawn for the plush at a cell by the chunks on screen
  const shown = (i, j, k) => { for (const ch of g.renderer.chunks.values()) if (ch.cx === (i >> 4) && ch.cy === (j >> 4) && ch.cz === (k >> 4)) { const m = new Map(); K.readChunk({ n: ch.n, data: ch.data }, m); const e = m.get(i + ',' + j + ',' + k); return e ? e.hole : null; } return null; };
  const spots = (r) => [[r.iS, 1, r.k0 - 1], [r.iS + 1, 1, r.k0 - 1], [r.iS + 2, 1, r.k0 - 1], [r.iS + 1, 4, r.kS], [r.iS - 1, 2, r.kS], [r.iS + 3, 2, r.k0 + r.wide]];

  await guard('mp.holelight.audit.a-late-joiner-draws-a-deep-shaft-lit-in-the-chunks-it-shows-and-follows-the-host-edits', async () => {
    // a 41 cell shaft: its foot is two chunk levels under its mouth, so the late joiner's first remesh is the only chance for the foot to be lit
    const r = K.rig({ depth: 40, left: 3, right: 10, wide: 4 }), bad = [], cam = g.renderer.camera.position; cam.set(cellX(r.iS + 3), 1.5, cellZ(r.kS));
    pump(cam); const host = spots(r).map(([i, j, k]) => shown(i, j, k));
    if (!(host[1] > 0.05)) return 'the host does not show the shaft lit: ' + host.join();
    hostWorld(); g.sendWorld(); const diffs = json(ofType('diff')); if (!diffs.length) return 'sendWorld sent no diff';
    const hostW = g.world, gw = asGuest(diffs);
    g.renderer.setWorld(gw); pump(cam);
    const guest = spots(r).map(([i, j, k]) => shown(i, j, k));
    guest.forEach((v, n) => { if (Math.abs((v ?? 0) - (host[n] ?? 0)) > 1e-6) bad.push(`spot ${n}: the late joiner shows ${v}, the host ${host[n]}`); });
    // the host caps the mouth of the shaft, the guest hears it as cells and its screen goes dark; the host digs it again
    const cells = (a) => g.netMessage.call(g, { t: 'cells', a });
    g.world = gw; role('guest'); cells([r.iS, r.T0 - 1, r.kS, PAD, 17]); pump(cam); const capped = shown(r.iS + 1, 1, r.k0 - 1);
    cells([r.iS, r.T0 - 1, r.kS, 0, 0]); pump(cam); const back = shown(r.iS + 1, 1, r.k0 - 1);
    g.world = hostW; role('host');
    if (capped !== null && capped > 0) bad.push('the guest still shows ' + capped + ' at the foot with the mouth capped');
    if (!(Math.abs((back ?? 0) - host[1]) < 1e-6)) bad.push(`the guest shows ${back} at the foot after the host dug it again, the host ${host[1]}`);
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.holelight.audit.a-guest-forging-cells-and-bulk-commands-cannot-make-the-host-light-differ-from-its-cells', async () => {
    // whatever a guest sends, the host's light is a function of the host's cells: after a storm of garbage and real cell messages the baked light still equals the single cell
    // evaluator everywhere (the camera) and the host's displayed chunks equal a fresh scan
    const r = K.rig({ depth: 14, left: 3, right: 12, wide: 4 }), bad = [], cam = g.renderer.camera.position; cam.set(cellX(r.iS + 3), 1.5, cellZ(r.kS));
    hostWorld(); pump(cam);
    const junk = [
      { t: 'cmd', c: 'bulk', d: { i: r.iS, j: 1, k: r.kS } }, { t: 'cmd', c: 'bulk', d: { i: -5, j: 1e9, k: NaN } }, { t: 'cmd', c: 'bulk', d: {} }, { t: 'cmd', c: 'bulk' },
      { t: 'cmd', c: 'nonsense', d: { i: r.iS, j: 1, k: r.kS } }, { t: 'cmd', c: 'place', d: { tool: { id: 'wall', kind: 'wall', p: {} }, ent: { type: 'wall', ax: 'q', i0: r.iS, k0: r.k0, j: 0 } } },
    ];
    for (const m of junk) { try { g.netMessage(json(m)); } catch (e) { /* the net layer (net.js dc.onmessage) catches a bad message and goes on: so does this test */ } }
    if (W()._remoteApply) bad.push('a bad message left the world in remote apply mode: the host would stop announcing its own edits');
    // real cell messages as a guest's digging sends them: cap the shaft, take the cap away, put plush in the tunnel
    g.netMessage({ t: 'cells', a: [r.iS, r.rows + 3, r.kS, PAD, 17] }); pump(cam);
    g.netMessage({ t: 'cells', a: [r.iS, r.rows + 3, r.kS, 0, 0, r.iS + 3, 1, r.k0, 5, 0, r.iS + 3, 2, r.k0 + 1, 5, 0] }); pump(cam);
    const S = HL.makeScratch();
    for (const [cx, cy, cz] of K.chunksOf(r, 7)) { const F = HL.windowFor(W(), cx * 16, cy * 16, cz * 16, S); if (!F.hf) continue; for (let jj = 0; jj < 18; jj++) for (let z = HL.HOLE_R + 2; z < HL.HOLE_R + 19; z++) for (let x = HL.HOLE_R + 2; x < HL.HOLE_R + 19; x++) { const j = F.jb + jj; if (j < 0) continue; if (Math.abs(F.hf[(jj * F.Wd + z) * F.Wd + x] - HL.holeAt(W(), F.ib + x, j, F.kb + z)) > 1e-6 && W().get(F.ib + x, j, F.kb + z) === 0) { bad.push('the baked light and the camera light differ at ' + (F.ib + x) + ',' + j + ',' + (F.kb + z)); break; } } }
    for (const ch of g.renderer.chunks.values()) { if (!ch.data || ch.cold) continue; const res = g.renderer.scanChunk(ch.cx, ch.cy, ch.cz, ch.deep); if (res.n !== ch.n) { bad.push(`chunk ${ch.cx},${ch.cy},${ch.cz} shows ${ch.n} plush, ${res.n} now`); continue; } for (let q = 0; q < res.n * 16; q++) if (res.data[q] !== ch.data[q] && !(q % 16 === 9 && Math.abs(res.data[q] - ch.data[q]) < 0.01)) { bad.push(`chunk ${ch.cx},${ch.cy},${ch.cz} is stale at float ${q % 16}`); break; } }
    if (!(HL.holeAt(W(), r.iS, 1, r.kS) > 0.5 * r.str(1))) bad.push('the shaft that was capped and opened again does not light the foot');
    // and the host still announces its own digging after all of that, so a guest's screen follows it
    g.netOut.length = 0; W().setCell(r.iS, r.rows + 3, r.kS, PAD, 17); if (!g.netOut.length) bad.push('the host no longer announces its own edits');
    return bad.length === 0 || bad.join('; ');
  });
}
