// mp.extend.* : extending a hose from its mouth on both screens. The guest sends the stretch with the start it joins (`bplan` with `ext`), the host re-checks all of it (the piece
// exists, is a loose start of the same kind and mark, the stretch ends beside it and faces it, price, items, cells) and lays it; the guest is told only about the new pieces (the
// old mouth is not announced again: a fed piece is a joint on every screen). No network: one page plays both roles.
import { makeHoseKit, UP_HOSE } from './hose_lib.js';

export default async function (ctx) {
  const { g, S, L, adv, tiles } = ctx;
  const H = makeHoseKit(ctx), B = H.B, T = B.T, io = H.io, json = B.json;
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); g.bplan = null; g.plan = null; B.cleanup(); } });
  const look = () => ({ n: H.hoses().length, mouths: H.mouths().length, mouthMesh: L().mouthMesh.count, tubes: L().hoseMesh.count, tiles: H.hoses().map((t) => `${t.i},${t.k},${t.dir}`).sort(), mouth: H.mouths().map((t) => `${t.i},${t.k}`) });

  await guard('mp.extend.a-guest-extends-a-hose-the-host-lays-it-and-the-guest-sees-one-new-mouth', async () => {
    H.setup(60); const bad = []; role('host'); cap(); for (let s = 0; s < 6; s++) await H.put(s, 0, 0); B.vaultAt(H.o.i + 6, H.o.k); H.rebuild(); const base = sent.slice();
    // the guest sees the old line, aims at its mouth and extends it: it sends one command and lays nothing itself
    role('guest'); cap(); const n0 = S().items.hose, c0 = H.hoses().length;
    let pl = await H.aim(0, 0, 0); if (!pl || !pl.extAim) return 'the guest has no outline on the mouth: ' + JSON.stringify(pl && [pl.ok, pl.why]);
    io.click(0); pl = await H.aim(-6, 0, 0); if (!pl || !pl.ok) return 'guest route ' + JSON.stringify(pl && [pl.ok, pl.why]); io.click(0); adv(0.05);
    const msg = sent.find((m) => m.t === 'cmd' && m.c === 'bplan'); if (!msg) return 'the guest sent no bplan command'; if (!msg.d.ext || msg.d.ext.i !== H.o.i || msg.d.tiles.length !== 6 || !msg.d.hose) bad.push('the command: ' + JSON.stringify(msg.d).slice(0, 160));
    if (H.hoses().length !== c0 || S().items.hose !== n0) bad.push('the guest laid or spent something itself');
    // the host runs it
    done(); role('host'); cap(); g.netCmd('bplan', json(msg.d)); adv(0.05); H.rebuild();
    if (H.hoses().length !== c0 + 6 || H.mouths().length !== 1 || H.mouths()[0].i !== H.o.i - 6) bad.push('the host did not extend: ' + H.hoses().length + ' pieces, mouths ' + H.mouths().map((m) => m.i - H.o.i));
    const plus = ofType('ent+'), minus = ofType('ent-'); if (plus.length !== 6 || plus.some((m) => m.ent.hose !== true) || minus.length) bad.push(`the host announced ${plus.length} new pieces and ${minus.length} removals (wanted 6 and 0)`);
    if (sent.length > 14) bad.push('the host sent ' + sent.length + ' messages for one extension');
    const after = sent.slice(), hostLook = look();
    // the guest screen: the old line, then what the host announced
    done(); B.setup(UP_HOSE); role('guest'); cap(); for (const m of base) g.netMessage(json(m)); for (const m of after) g.netMessage(json(m)); L().update(0.05); H.rebuild();
    if (JSON.stringify(look()) !== JSON.stringify(hostLook)) bad.push('the screens differ: host ' + JSON.stringify(hostLook) + ' guest ' + JSON.stringify(look()));
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.extend.the-host-refuses-a-forged-extension-from-a-guest', async () => {
    H.setup(60); const bad = []; for (let s = 0; s < 6; s++) await H.put(s, 0, 0); B.vaultAt(H.o.i + 6, H.o.k); H.rebuild(); role('host'); cap();
    const t = (d) => [H.o.i + d, 0, H.o.k, 0, 0, 0], tl = [t(-3), t(-2), t(-1)], count = () => tiles().filter((x) => x.type === 'belt' && !x.free).length, c0 = count(), n0 = S().items.hose;
    const forged = [
      ['an ext that names nothing', { tier: 0, hose: true, tiles: tl, ext: { i: H.o.i - 20, j: 0, k: H.o.k } }], ['an ext on a fed piece', { tier: 0, hose: true, tiles: tl, ext: { i: H.o.i + 3, j: 0, k: H.o.k } }],
      ['an ext with no numbers', { tier: 0, hose: true, tiles: tl, ext: {} }], ['an ext of NaN', { tier: 0, hose: true, tiles: tl, ext: { i: NaN, j: 0, k: Infinity } }], ['an ext that is an array', { tier: 0, hose: true, tiles: tl, ext: [H.o.i, 0, H.o.k] }],
      ['an ext that is a string', { tier: 0, hose: true, tiles: tl, ext: 'mouth' }], ['a belt line on a hose mouth', { tier: 0, hose: false, tiles: tl, ext: { i: H.o.i, j: 0, k: H.o.k } }],
      ['a mark on a hose', { tier: 3, hose: true, tiles: tl, ext: { i: H.o.i, j: 0, k: H.o.k } }], ['a stretch not beside the start', { tier: 0, hose: true, tiles: [t(-5), t(-4)], ext: { i: H.o.i, j: 0, k: H.o.k } }],
      ['a stretch with a ramp', { tier: 0, hose: true, tiles: [[H.o.i - 2, 0, H.o.k, 0, 1, 0], [H.o.i - 1, 1, H.o.k, 0, 0, 0]], ext: { i: H.o.i, j: 0, k: H.o.k } }], ['no tiles', { tier: 0, hose: true, tiles: [], ext: { i: H.o.i, j: 0, k: H.o.k } }],
    ];
    for (const [name, d] of forged) { sent.length = 0; g.netCmd('bplan', json(d)); adv(0.05); if (count() !== c0) bad.push(name + ' was laid'); if (S().items.hose !== n0) bad.push(name + ' spent hoses'); }
    // nothing to pay with: the host refuses and tells the guest
    S().money = 0; delete S().items.hose; g.rebuildTools(); sent.length = 0; g.netCmd('bplan', json({ tier: 0, hose: true, tiles: tl, ext: { i: H.o.i, j: 0, k: H.o.k } })); adv(0.05); if (count() !== c0) bad.push('an extension with no money and no hoses was laid'); if (!ofType('toast').length) bad.push('the guest was not told why');
    // without the Plush Vacuum no hose is extended, even with money
    S().money = 1e12; g.S.up.vac = 0; g.refreshTuning(); g.netCmd('bplan', json({ tier: 0, hose: true, tiles: tl, ext: { i: H.o.i, j: 0, k: H.o.k } })); adv(0.05); if (count() !== c0) bad.push('extended without the unlock'); g.S.up.vac = 1; g.refreshTuning();
    return bad.length === 0 || bad.join('; ');
  });
}
