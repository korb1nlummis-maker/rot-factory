// mp.hose.* : a hose on both screens. The host lays and simulates; the guest draws what it is told (the same tubes, bends and the one mouth), asks with `place` and `bplan` commands
// the host re-checks, and cannot lay what the host would refuse (a hose with ramps, a hose of a higher mark, a hose it does not own). No network: one page plays both roles.
import { makeHoseKit, UP_HOSE } from './hose_lib.js';
import * as BP from '../beltplan.js';

export default async function (ctx) {
  const { g, S, L, adv, tiles } = ctx;
  const H = makeHoseKit(ctx), B = H.B, T = B.T, io = H.io, json = B.json;
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); g.bplan = null; B.cleanup(); } });
  const look = () => ({ n: H.hoses().length, dirs: H.dirsOf().slice().sort().join(''), mouths: H.mouths().length, mouthMesh: L().mouthMesh.count, ringMesh: L().ringMesh.count, tubes: L().hoseMesh.count, l: L().bendLMesh.count, r: L().bendRMesh.count });
  const hoseTiles = () => tiles().filter((t) => t.type === 'belt' && t.hose).map((t) => `${t.i},${t.k},${t.dir}`).sort().join(' ');

  await guard('mp.hose.the-guest-draws-the-same-hose-bends-and-one-mouth-as-the-host', async () => {
    H.setup(); role('host'); cap(); const bad = [];
    for (let s = 0; s < 3; s++) await H.put(s, 0, 0); for (let s = 1; s <= 3; s++) await H.put(2, -s, 3); for (let s = 3; s <= 5; s++) await H.put(s, -3, 0);
    L().update(0.05); const host = look(), tilesHost = hoseTiles(); const plus = ofType('ent+'); if (plus.length < 9 || plus.some((m) => m.ent.hose !== true)) return 'the host announced ' + plus.length + ' ents, hose flags ' + plus.map((m) => m.ent.hose).join();
    const all = sent.slice(); done(); B.setup(UP_HOSE); role('guest'); cap(); for (const m of all) g.netMessage(json(m)); L().update(0.05);
    const guest = look(); if (JSON.stringify(host) !== JSON.stringify(guest)) bad.push(`host ${JSON.stringify(host)} guest ${JSON.stringify(guest)}`); if (hoseTiles() !== tilesHost) bad.push('the pieces differ');
    if (guest.mouths !== 1 || guest.mouthMesh !== 1) bad.push('the guest mouth count ' + guest.mouths + '/' + guest.mouthMesh);
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.hose.a-guest-sets-a-hose-down-and-the-host-lays-it-and-the-guest-sees-it', async () => {
    H.setup(10); const bad = [];
    // the guest presses B: it sends the item (with its hose flag) and the planned piece, and lays nothing itself
    role('guest'); cap(); const n0 = S().items.hose; const pl = await H.aim(0, 0, 0); io.tap('KeyB'); adv(0.05);
    const msg = sent.find((m) => m.t === 'cmd' && m.c === 'place'); if (!msg) return 'the guest sent no place command'; if (!msg.d.tool.hose) bad.push('the command does not say hose');
    if (H.hoses().length !== 0 || S().items.hose !== n0) bad.push('the guest laid or spent something itself'); void pl;
    // the host runs it
    done(); role('host'); cap(); g.netCmd('place', json(msg.d)); adv(0.05); const hs = H.hoses(); if (hs.length !== 1 || !hs[0].hose) bad.push('the host did not lay a hose: ' + hs.length);
    if ((S().items.hose || 0) !== n0 - 1) bad.push('the host charged ' + (n0 - (S().items.hose || 0)));
    const ent = ofType('ent+').find((m) => m.ent.type === 'belt'); if (!ent || !ent.ent.hose) bad.push('the guest was not told it is a hose');
    // a guest cannot make a hose out of a belt item: the item must be a hose
    S().items.belt = 3; g.rebuildTools(); const forged = json(msg.d); forged.tool = { id: 'belt', kind: 'belt', hose: true }; forged.ent = { type: 'belt', i: H.o.i + 3, j: 0, k: H.o.k, dir: 0, rise: 0 };
    sent.length = 0; g.netCmd('place', forged); adv(0.05); if (H.hoses().length !== 1) bad.push('a belt item was turned into a hose: ' + H.hoses().length);
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.hose.a-guest-planned-hose-line-is-checked-and-laid-by-the-host', async () => {
    H.setup(30); const bad = [];
    const r = BP.route(g, { i: H.o.i, j: 0, k: H.o.k }, { i: H.o.i + 6, j: 0, k: H.o.k + 3 }, 0, 0, true); if (!r.ok) return r.why;
    const tilesMsg = r.tiles.map((t) => [t.i, t.j, t.k, t.dir, t.rise, t.u]);
    role('host'); cap(); const n0 = S().items.hose;
    g.netCmd('bplan', { tier: 0, tiles: tilesMsg, hose: true }); adv(0.05); if (H.hoses().length !== tilesMsg.length) bad.push('the host laid ' + H.hoses().length + ' of ' + tilesMsg.length); if (n0 - (S().items.hose || 0) !== tilesMsg.length) bad.push('it spent ' + (n0 - (S().items.hose || 0)));
    if (H.mouths().length !== 1) bad.push('mouths ' + H.mouths().length);
    // forged lines: a ramp, an underground end, a higher mark, a line that is not connected, a hose without the item: nothing is laid
    const count = () => tiles().filter((t) => t.type === 'belt' && !t.free).length, c0 = count();
    const t2 = (k) => [[H.o.i, 0, H.o.k + k, 0, 0, 0], [H.o.i + 1, 0, H.o.k + k, 0, 0, 0]];
    for (const [name, d] of [['ramp', { tier: 0, hose: true, tiles: [[H.o.i, 0, H.o.k + 6, 0, 1, 0], [H.o.i + 1, 1, H.o.k + 6, 0, 0, 0]] }], ['underground', { tier: 0, hose: true, tiles: [[H.o.i, 0, H.o.k + 7, 0, 0, 1], [H.o.i + 3, 0, H.o.k + 7, 0, 0, 2]] }], ['mark', { tier: 2, hose: true, tiles: t2(8) }], ['gap', { tier: 0, hose: true, tiles: [[H.o.i, 0, H.o.k + 9, 0, 0, 0], [H.o.i + 4, 0, H.o.k + 9, 0, 0, 0]] }]]) {
      g.netCmd('bplan', json(d)); adv(0.05); if (count() !== c0) bad.push('a forged ' + name + ' line was laid');
    }
    // without the Plush Vacuum no hose is laid, even with the item
    g.S.up.vac = 0; g.refreshTuning(); g.netCmd('bplan', { tier: 0, hose: true, tiles: t2(10) }); adv(0.05); if (count() !== c0) bad.push('a hose line was laid without the unlock'); g.S.up.vac = 1; g.refreshTuning();
    return bad.length === 0 || bad.join('; ');
  });
}
