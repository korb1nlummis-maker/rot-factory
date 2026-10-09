// mp.intake.* : Belt Intake with a friend (no network: one page plays both roles by switching g.net.role).
// The host pulls from its own hands and cart and from the guest's cart. The guest's hands are on the guest's screen, so the guest finds the belt and sends the existing `feed` command
// per plush (flagged pull:1); the host re-checks the range, the species and the rate, and hands back what it refuses.
import { makeBeltKit, UP_BASE } from './belts_lib.js';
import * as BI from '../beltintake.js';
import { RATE, RANGE, SLACK } from '../beltintake.js';
import { NEEDLE } from '../plushdata.js';
import { makeIO } from './truth_world_lib.js';

export default async function (ctx) {
  const { T: T0, g, S, p, L, tiles, toI, toK, cellX, cellZ, V3 } = ctx;
  const B = makeBeltKit(ctx), sp = B.sp, json = B.json; void T0;
  const io = makeIO(ctx);
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; L().visualOnly = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const cmds = (c) => sent.filter((m) => m.t === 'cmd' && m.c === c);
  const T = (name, fn) => B.T(name, async () => { try { return await fn(); } finally { role(null); delete g._bi; delete g.netSend; ctx.fresh({}); } });
  const ci = () => toI(-11), ck = () => toK(0.3);
  const setup = (lv = 0, extra = {}) => { B.setup({ ...UP_BASE, beltIntake: lv, ...extra }); delete S().beltIntakeOff; g._bi = null; g.fliers.length = 0; cap(); };
  const hands = (n) => { S().carry = Array.from({ length: n }, () => ({ sp, vr: 0 })); };
  const stand = (x, z) => { p().pos.set(x, 0, z); p().vel.set(0, 0, 0); };
  const tick = (secs, dt = 0.05, each) => { for (let n = 0, m = Math.round(secs / dt); n < m; n++) { g.time += dt; BI.update(g, dt); if (each) each(); } };
  const total = (ts) => ts.reduce((a, t) => a + t.items.length, 0);
  const clear = (ts) => () => { for (const t of ts) t.items.length = 0; };
  const block = (n = 5) => { const out = []; for (let r = 0; r < n; r++) out.push(...B.lay(0, n, ci() - (n >> 1), ck() - (n >> 1) + r, 0)); return out; };
  const gcart = (n, x, z) => { S().gcart = { tier: 2, x, y: 0, z, yaw: 0, mode: 'follow', load: Array.from({ length: n }, () => ({ sp, vr: 0 })) }; return S().gcart; };
  const friend = (x, z, y = 0) => { g.remote = { pos: new V3(x, y, z), yaw: 0 }; };
  const feedMsg = (t, extra = {}) => ({ id: t.id, sp, vr: 0, pull: 1, ...extra });
  const emptyBucket = (who) => { BI.state(g).b[who] = { tokens: 0, t: g.time }; };

  await T('mp.intake.the-guest-sends-one-flagged-feed-per-plush-at-its-rate-and-keeps-the-rest', async () => {
    setup(2); const ts = block(5); role('guest'); hands(60); p().pos.set(cellX(ci()), 0, cellZ(ck())); const bad = [];
    emptyBucket('gl'); sent = [];
    tick(2, 0.05, clear(ts));
    const feeds = cmds('feed'), n = feeds.length;
    if (n < RATE[2] * 2 - 1 || n > RATE[2] * 2 + 1) bad.push(`${n} feeds in 2 s at ${RATE[2]} a second`);
    if (60 - S().carry.length !== n) bad.push('the guest\'s hands lost ' + (60 - S().carry.length) + ' but sent ' + n);
    if (feeds.some((m) => m.d.pull !== 1 || !Number.isInteger(m.d.id) || !L().byId.get(m.d.id) || m.d.sp !== sp)) bad.push('a feed is not a flagged pull of a known tile: ' + JSON.stringify(feeds[0]));
    if (total(ts)) bad.push('the guest put plush on its own copy of the belt');
    if (g.fliers.length === 0 && n) bad.push('no flier on the guest screen');
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.intake.the-guest-leaves-a-full-belt-alone-and-never-sends-the-one', async () => {
    setup(7); const t = B.lay(0, 1, ci(), ck(), 0)[0]; role('guest'); hands(10); p().pos.set(cellX(ci()) - 1, 0, cellZ(ck())); const bad = [];
    t.items = [{ sp, vr: 0, t: 0.9 }, { sp, vr: 0, t: 0.55 }, { sp, vr: 0, t: 0.2 }]; tick(1); if (cmds('feed').length) bad.push('fed a belt the guest sees full');
    t.items = []; S().carry = [{ sp: NEEDLE, vr: 0 }]; tick(1); if (cmds('feed').length || S().carry.length !== 1) bad.push('The One was sent');
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.intake.there-is-no-switch-the-key-and-the-old-intake-command-change-nothing', async () => {
    setup(7); const ts = block(3); role('guest'); hands(20); p().pos.set(cellX(ci()), 0, cellZ(ck())); const bad = [];
    tick(0.1); if (cmds('intake').length) bad.push('the guest still sends an intake command: ' + JSON.stringify(cmds('intake')));
    sent = []; io.tap('Backquote'); { const ch = document.getElementById('chatIn'); ch.classList.add('hidden'); ch.blur(); }   /* (the backtick is the chat key now: in co-op it opens the box, which it never did before; it still sets no intake switch) */ if (S().beltIntakeOff !== undefined) bad.push('the key set a switch'); tick(0.2, 0.05, clear(ts)); if (cmds('intake').length) bad.push('the key made the guest send an intake command');
    sent = []; hands(20); tick(0.5, 0.05, clear(ts)); if (!cmds('feed').length) bad.push('no feeds from the guest after the key');
    // the host side: an old intake command does nothing, and a guest cart keeps feeding
    role('host'); cap(); friend(cellX(ci()), cellZ(ck())); const c = gcart(10, cellX(ci()) + 0.6, cellZ(ck())); S().carry = [];
    g.netCmd('intake', { off: 1 }); tick(1, 0.05, clear(ts)); if (c.load.length === 10) bad.push('an old intake off command stopped the guest\'s cart feeding');
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.intake.the-host-takes-a-real-feed-and-refuses-a-flood-over-the-rate-and-hands-it-back', async () => {
    setup(2); role('host'); const ts = block(7); friend(cellX(ci()), cellZ(ck())); const bad = [];
    BI.state(g); sent = [];
    g.time += 0.001; let ok = 0; for (let n = 0; n < 100; n++) g.netCmd('feed', feedMsg(ts[n % ts.length]));
    ok = total(ts); const back = ofType('give').reduce((a, m) => a + m.items.length, 0);
    if (ok > 2 || ok < 1) bad.push('a flood of 100 in one instant put ' + ok + ' on the belts (the burst is 2 at this level)'); if (back !== 100 - ok) bad.push(`handed back ${back}, refused ${100 - ok}`);
    // a steady forged stream at 100 a second for 3 s: at most 8 a second plus the burst
    clear(ts)(); sent = []; let acc = 0; for (let n = 0; n < 300; n++) { g.time += 0.01; g.netCmd('feed', feedMsg(ts[n % ts.length])); acc += total(ts); clear(ts)(); }
    if (acc > RATE[2] * 3 + 3 || acc < RATE[2] * 3 - 3) bad.push(`a forged 100 a second stream got ${acc} in 3 s, the rate allows ${RATE[2] * 3}`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.intake.the-host-checks-where-the-guest-stands', async () => {
    setup(0); role('host'); const t = B.lay(0, 1, ci(), ck(), 0)[0]; const bad = [];
    const tryAt = (d, y = 0) => { g._bi = null; t.items = []; sent = []; friend(cellX(ci()) - d, cellZ(ck()), y); g.time += 5; g.netCmd('feed', feedMsg(t)); return t.items.length === 1; };
    if (!tryAt(RANGE[0] + SLACK - 0.1)) bad.push('refused a guest inside the range plus the slack');
    if (tryAt(RANGE[0] + SLACK + 0.3)) bad.push('took a feed from a guest outside the range'); if (ofType('give').length !== 1) bad.push('no hand back for an out of range feed');
    if (tryAt(30)) bad.push('took a feed from a guest 30 m away');
    if (tryAt(1, 6)) bad.push('took a feed from a guest 6 m above the belt'); if (!tryAt(1, 0.5)) bad.push('refused a guest standing a little above the belt');
    role('host'); g.remote = null; g._bi = null; t.items = []; sent = []; g.netCmd('feed', feedMsg(t)); if (t.items.length) bad.push('took a feed with no guest position known');
    role(null); g.remote = null; t.items = []; g.netCmd('feed', feedMsg(t)); if (t.items.length) bad.push('took a feed with no friend connected');
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.intake.forged-feeds-the-one-junk-species-and-pieces-that-take-no-intake-are-refused', async () => {
    setup(7); role('host'); const t = B.lay(0, 1, ci(), ck(), 0)[0], lift = g.placeEntity('belt', { i: ci(), j: 0, k: ck() + 4, dir: 0, rise: 0, lift: { h: 3 }, items: [] }, { quiet: true, rebuild: false });
    const split = g.placeEntity('belt', { i: ci() + 3, j: 0, k: ck(), dir: 0, rise: 0, splitter: true, items: [] }, { quiet: true, rebuild: false }); const bad = [];
    friend(cellX(ci()), cellZ(ck())); const go = (d) => { g._bi = null; g.time += 5; sent = []; g.netCmd('feed', d); };
    go(feedMsg(t, { sp: NEEDLE })); if (t.items.length || ofType('give').length) bad.push('a pull of The One was taken or handed back');
    go(feedMsg(t, { sp: 60005 })); if (t.items.length) bad.push('a special id was taken');
    go(feedMsg(t, { sp: 3.5 })); go(feedMsg(t, { sp: -4 })); go(feedMsg(t, { sp: 59999 })); go(feedMsg(t, { vr: 'x' })); go(feedMsg(t, { id: 'nope' })); go(feedMsg(t, { id: 987654321 })); go({}); go(null);
    if (t.items.length) bad.push('junk species were taken');
    go(feedMsg(lift)); if (lift.items.length) bad.push('a pull onto a lift was taken'); go(feedMsg(split)); if (split.items.length) bad.push('a pull onto a splitter was taken');
    go(feedMsg(t)); if (t.items.length !== 1) bad.push('the good feed after all that was refused');
    // a plain (unflagged) drop by hand is still taken by a lift or a splitter, as before, within the manual reach
    lift.items = []; go({ id: lift.id, sp, vr: 0 }); if (lift.items.length !== 1) bad.push('the old hand drop onto a lift stopped working');
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.intake.a-hand-drop-is-limited-to-what-a-hand-can-do', async () => {
    setup(0); role('host'); const t = B.lay(0, 1, ci(), ck(), 0)[0]; friend(cellX(ci()) - 2, cellZ(ck())); g._bi = null; g.time += 3; let got = 0; const bad = [];
    for (let n = 0; n < 200; n++) { t.items = []; g.netCmd('feed', { id: t.id, sp, vr: 0 }); got += t.items.length; }
    if (got > 3) bad.push('200 hand drops in one instant: ' + got + ' taken (the burst is 2)');
    got = 0; for (let n = 0; n < 200; n++) { g.time += 0.12; t.items = []; g.netCmd('feed', { id: t.id, sp, vr: 0 }); got += t.items.length; }
    if (got < 190) bad.push('a click every 0.12 s (the throw delay) got ' + got + ' of 200');
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.intake.the-hosts-and-the-guests-limits-are-separate-and-the-guest-cart-shares-the-guests', async () => {
    setup(2); role('host'); const ts = block(7); friend(cellX(ci()), cellZ(ck())); const bad = [];
    hands(100); const c = gcart(100, cellX(ci()) + 0.6, cellZ(ck())); stand(cellX(ci()), cellZ(ck()));
    emptyBucket('host'); emptyBucket('guest'); tick(2, 0.05, clear(ts));
    const host = 100 - S().carry.length, guest = 100 - c.load.length;
    if (host < 15 || host > 17) bad.push('the host pulled ' + host + ' in 2 s'); if (guest < 15 || guest > 17) bad.push('the guest cart pulled ' + guest + ' in 2 s');
    // the guest's tokens are shared by its cart and its hand feeds
    BI.state(g).b.guest = { tokens: 2, t: g.time }; g.time += 0.0001; S().carry = []; const t0 = ts[0], c0 = c.load.length; BI.update(g, 0.0001); const afterCart = c.load.length; clear(ts)(); sent = [];
    g.netCmd('feed', feedMsg(t0)); g.netCmd('feed', feedMsg(t0)); g.netCmd('feed', feedMsg(t0));
    const took = total(ts); if (c0 - afterCart !== 2 || took !== 0) bad.push('the guest\'s cart and hand feeds together passed their rate: cart ' + (c0 - afterCart) + ', feeds ' + took);
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.intake.the-guests-cart-is-measured-from-the-cart-and-obeys-the-same-rules', async () => {
    setup(0); role('host'); const t = B.lay(0, 1, ci(), ck(), 0)[0]; friend(cellX(ci()) + 20, cellZ(ck())); S().carry = []; const bad = [];
    const c = gcart(5, cellX(ci()) + 1.5, cellZ(ck())); tick(0.1); if (c.load.length !== 4 || t.items.length !== 1) bad.push('a guest cart 1.5 m from a belt did not feed');
    c.x = cellX(ci()) + 2.5; t.items = []; g._bi = null; tick(0.5); if (c.load.length !== 4) bad.push('a guest cart 2.5 m away fed');
    c.x = cellX(ci()) + 1; c.load = [{ sp: NEEDLE, vr: 0 }]; tick(0.5); if (c.load.length !== 1 || t.items.length) bad.push('the guest cart gave up The One');
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.intake.the-guest-gets-back-what-the-host-refused-and-the-one-never-comes-back', async () => {
    setup(0, { bag: 3 }); role('guest'); S().carry = []; const bad = [];
    g.netMessage({ t: 'give', items: [{ sp, vr: 0 }, { sp, vr: 3 }] }); if (S().carry.length !== 2) bad.push('the plush the host handed back did not land in the guest\'s hands: ' + S().carry.length);
    return bad.length === 0 || bad.join('; ');
  });

  void tiles;
}
