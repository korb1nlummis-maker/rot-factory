// intake.* : Belt Intake. A plain belt within reach pulls plush off your hands, then off your cart, at a rate per second (src/beltintake.js).
// These tests drive BI.update by hand (g.time moves, the belts do not) so a tile's contents are exactly what the pull put there, except the end to end test, which also runs the belts.
import { makeBeltKit, UP_BASE } from './belts_lib.js';
import * as BI from '../beltintake.js';
import { RATE, RANGE, PRICE, intakeOf } from '../beltintake.js';
import { NEEDLE, SPECIAL_MIN } from '../plushdata.js';
import { infoFor } from '../info.js';
import { upgradeById, isUnlocked, UPGRADES } from '../upgrades.js';
import { makeIO } from './truth_world_lib.js';

export default async function (ctx) {
  const { T: T0, g, S, p, L, tiles, toI, toK, cellX, cellZ, adv, craft, selectTool } = ctx;
  const B = makeBeltKit(ctx), T = B.T, sp = B.sp; void T0;
  const io = makeIO(ctx);
  const ci = () => toI(-11), ck = () => toK(0.3);
  // a fresh world with belts owned and the intake at this level (0 is the free base)
  const setup = (lv = 0, extra = {}) => { B.setup({ ...UP_BASE, beltIntake: lv, ...extra }); delete S().beltIntakeOff; g._bi = null; g.fliers.length = 0; return g.T; };
  const hands = (n) => { S().carry = Array.from({ length: n }, () => ({ sp, vr: 0 })); };
  const stand = (x, z) => { p().pos.set(x, 0, z); p().vel.set(0, 0, 0); };
  const tick = (secs, dt = 0.05, each) => { for (let n = 0, m = Math.round(secs / dt); n < m; n++) { g.time += dt; BI.update(g, dt); if (each) each(); } };
  const total = (ts) => ts.reduce((a, t) => a + t.items.length, 0);
  const clear = (ts) => () => { for (const t of ts) t.items.length = 0; };
  const one = (i = ci(), k = ck(), extra = {}) => B.lay(0, 1, i, k, 0, 0, extra)[0];
  const block = (n = 9) => { const out = []; for (let r = 0; r < n; r++) out.push(...B.lay(0, n, ci() - (n >> 1), ck() - (n >> 1) + r, 0)); return out; };
  const cart = (n, x, z, mode = 'stay', tier = 2) => { S().cart = { tier, x, y: 0, z, yaw: 0, mode, load: Array.from({ length: n }, () => ({ sp, vr: 0 })) }; g.cart.sync(); return S().cart; };
  const bucket = (tokens, who = 'host') => { BI.state(g).b[who] = { tokens, t: g.time }; };   // set before the first update of a test: the first update of a fresh game starts with a full bucket

  await T('intake.free-base-level-comes-with-belts-and-the-numbers-are-the-spec', async () => {
    const bad = [];
    setup(0); { const o = intakeOf(g.T); if (o.rate !== 2 || o.range !== 2.0 || o.level !== 0 || o.mk !== 1) bad.push('base level ' + JSON.stringify(o)); if (!BI.owns(g.T)) bad.push('belts owned but intake not owned'); }
    B.setup({}); if (BI.owns(g.T)) bad.push('intake owned without belts');
    if (JSON.stringify(RATE) !== '[2,4,8,16,32,64,128,256]') bad.push('rates ' + RATE);
    if (RANGE[0] !== 2.0 || RANGE[7] !== 6.0 || RANGE.some((r, i) => i && r <= RANGE[i - 1])) bad.push('ranges ' + RANGE);
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.upgrade-line-has-eight-marks-prices-for-the-mid-and-late-game-and-needs-belts', async () => {
    const u = upgradeById('beltIntake'), bad = [];
    if (!u) return 'no beltIntake upgrade';
    if (u.max !== 7 || u.cost.length !== 7 || u.names.length !== 8) bad.push(`max ${u.max}, costs ${u.cost.length}, names ${u.names.length}`);
    if (u.cost.some((c, i) => i && c < u.cost[i - 1] * 3)) bad.push('prices do not grow by at least 3x a level: ' + u.cost);
    if (u.cost[0] < 10000 || u.cost[6] < 1e8) bad.push('price range ' + u.cost[0] + ' to ' + u.cost[6]);
    if (!u.req || u.req.id !== 'belts') bad.push('does not require Conveyor Belts');
    if (isUnlocked(u, {}, S())) bad.push('unlocked without belts'); if (!isUnlocked(u, { belts: 1 }, S())) bad.push('locked with belts');
    if (!UPGRADES.includes(u) || UPGRADES.filter((x) => x.id === 'beltIntake').length !== 1) bad.push('not in the upgrade list once');
    for (let l = 1; l <= 7; l++) { setup(l); const o = intakeOf(g.T); if (o.rate !== RATE[l] || o.range !== RANGE[l] || g.T.intakeLevel !== l) bad.push(`level ${l}: ${JSON.stringify(o)}`); }
    if (/[—–]/.test(u.desc + u.names.join())) bad.push('dash in the text');
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.buying-the-upgrade-spends-the-price-and-raises-the-level', async () => {
    setup(0, { beltIntake: 0 }); S().money = 1e9; const m0 = S().money, bad = [];
    for (let l = 1; l <= 3; l++) { const before = S().money; g.buy('beltIntake'); if ((S().up.beltIntake || 0) !== l) bad.push(`level ${l} not bought (${S().up.beltIntake})`); else if (before - S().money !== PRICE[l - 1]) bad.push(`level ${l} cost ${before - S().money}`); if (g.T.intakeLevel !== l) bad.push('tuning not updated'); }
    void m0; return bad.length === 0 || bad.join('; ');
  });

  await T('intake.range-edge-just-inside-pulls-just-outside-does-not', async () => {
    const bad = [];
    for (let l = 0; l < 8; l++) {
      for (const [d, want] of [[RANGE[l] - 0.03, true], [RANGE[l] + 0.03, false]]) {
        setup(l); const t = one(); hands(5); stand(cellX(ci()) - d, cellZ(ck())); tick(0.05);
        const pulled = 5 - S().carry.length;
        if (want && pulled !== 1) bad.push(`level ${l}: ${d.toFixed(2)} m should pull one, pulled ${pulled}`);
        if (!want && pulled !== 0) bad.push(`level ${l}: ${d.toFixed(2)} m should pull nothing, pulled ${pulled}`);
        if (want && t.items.length !== 1) bad.push(`level ${l}: the plush is not on the belt`);
      }
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.height-gate-a-belt-two-floors-up-or-down-is-out-of-reach', async () => {
    setup(7); const bad = [];
    for (const [j, want] of [[0, true], [1, true], [4, false], [8, false]]) {
      setup(7); const t = B.lay(0, 1, ci(), ck(), 0, j)[0]; hands(3); stand(cellX(ci()) - 1, cellZ(ck())); tick(0.05);
      if ((3 - S().carry.length === 1) !== want) bad.push(`belt on level ${j}: ${want ? 'should' : 'should not'} be reached`); void t;
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.rate-per-second-at-each-level', async () => {
    const bad = [];
    for (let l = 0; l < 8; l++) {
      setup(l); const ts = block(9); const start = 1200; hands(start); stand(cellX(ci()), cellZ(ck()));
      bucket(0);   // an empty bucket: two seconds are measured from nothing
      tick(2, 0.05, clear(ts));
      const moved = start - S().carry.length, want = RATE[l] * 2;
      if (moved < want - 1 || moved > want + 1) bad.push(`level ${l}: ${moved} plush in 2 s, wanted ${want}`);
      clear(ts)();
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.a-long-frame-never-pulls-more-than-a-quarter-second-of-rate', async () => {
    const bad = [];
    for (const l of [3, 5, 7]) {
      setup(l); const ts = block(9); hands(500); stand(cellX(ci()), cellZ(ck())); bucket(0);
      g.time += 5; BI.update(g, 5);   // a five second hitch
      const moved = 500 - S().carry.length, cap = Math.max(2, RATE[l] * 0.25);
      if (moved > cap + 1) bad.push(`level ${l}: ${moved} in one frame, cap ${cap}`); clear(ts)();
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.the-rate-is-per-player-never-per-tile', async () => {
    const bad = [], res = [];
    for (const n of [1, 9, 25, 81]) {
      setup(2); const ts = n === 1 ? [one()] : block(Math.round(Math.sqrt(n))); hands(400); stand(cellX(ci()), cellZ(ck())); bucket(0);
      tick(3, 0.05, clear(ts)); res.push(400 - S().carry.length);
    }
    for (const r of res) if (r < 23 || r > 25) bad.push('3 s at 8 a second moved ' + res.join('/'));
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.hands-go-first-then-the-cart', async () => {
    setup(3); const ts = block(7); hands(3); const c = cart(10, cellX(ci()) + 0.6, cellZ(ck())); stand(cellX(ci()), cellZ(ck()));
    bucket(4); g.time += 0.0001; BI.update(g, 0.0001);   // exactly 4 tokens
    const bad = []; if (S().carry.length !== 0) bad.push('hands kept ' + S().carry.length); if (c.load.length !== 9) bad.push('cart has ' + c.load.length + ', wanted 9 (one taken after the hands)');
    if (total(ts) !== 4) bad.push('belts hold ' + total(ts));
    // and with a full set of hands the cart is left alone
    hands(50); bucket(4); g.time += 0.0001; BI.update(g, 0.0001); if (c.load.length !== 9) bad.push('the cart was drawn on while the hands still had plush');
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.a-parked-cart-feeds-and-reach-is-measured-from-the-cart', async () => {
    setup(0); const t = one(); hands(0); const c = cart(8, cellX(ci()) + 1.2, cellZ(ck()), 'stay'); stand(cellX(ci()) + 6, cellZ(ck()) + 5);   // you are far away, the cart is 1.2 m from the belt
    tick(0.1); const bad = []; if (c.load.length !== 7 || t.items.length !== 1) bad.push(`a parked cart 1.2 m away fed ${8 - c.load.length}`);
    c.x = cellX(ci()) + 2.6; c.mode = 'follow'; t.items.length = 0; tick(1.1); if (c.load.length !== 7) bad.push('a cart 2.6 m away still fed');
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.a-full-belt-backs-up-and-the-pull-stops-then-resumes', async () => {
    setup(7); const t = one(); hands(40); stand(cellX(ci()) - 1, cellZ(ck())); const bad = [];
    t.items = [{ sp, vr: 0, t: 0.9 }, { sp, vr: 0, t: 0.55 }, { sp, vr: 0, t: 0.2 }];   // three on a tile is full
    tick(1); if (S().carry.length !== 40 || t.items.length !== 3) bad.push('a full tile took plush: ' + S().carry.length);
    t.items.pop(); t.items[0].t = 0.9; t.items[1].t = 0.5; tick(0.05); if (S().carry.length !== 39) bad.push('a free slot was not used: ' + S().carry.length);
    t.items = [{ sp, vr: 0, t: 0.1 }]; tick(0.05); if (S().carry.length !== 39) bad.push('a plush closer than the spacing was pushed in');
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.the-one-and-the-specials-are-never-pulled', async () => {
    setup(7); const t = block(5); stand(cellX(ci()), cellZ(ck())); const bad = [];
    S().carry = [{ sp: NEEDLE, vr: 0 }]; tick(0.5); if (S().carry.length !== 1 || total(t)) bad.push('The One alone was pulled');
    S().carry = [{ sp, vr: 0 }, { sp: NEEDLE, vr: 0 }, { sp, vr: 0 }]; tick(0.5, 0.05, clear(t)); if (!S().carry.some((x) => x.sp === NEEDLE) || S().carry.length !== 1) bad.push('with The One between plush, hands left: ' + S().carry.map((x) => x.sp));
    S().carry = [{ sp: SPECIAL_MIN + 1, vr: 0 }, { sp: SPECIAL_MIN + 5, vr: 0 }]; tick(0.5); if (S().carry.length !== 2) bad.push('a special id was pulled');
    S().carry = []; const c = cart(0, cellX(ci()) + 0.6, cellZ(ck())); c.load = [{ sp: NEEDLE, vr: 0 }, { sp, vr: 0 }]; tick(1, 0.05, clear(t)); if (!c.load.some((x) => x.sp === NEEDLE) || c.load.length !== 1) bad.push('the cart gave up The One: ' + c.load.map((x) => x.sp));
    for (const x of t) for (const it of x.items) if (it.sp === NEEDLE) bad.push('The One is on a belt');
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.the-nearest-belt-that-can-take-it-wins', async () => {
    setup(7); const a = one(ci() + 1, ck()), b = one(ci() + 2, ck()), c = one(ci() + 3, ck()); hands(10); stand(cellX(ci()), cellZ(ck())); const bad = []; const one1 = () => { bucket(1); tick(0.0001, 0.0001); };
    one1(); if (a.items.length !== 1 || b.items.length || c.items.length) bad.push(`first plush went ${a.items.length}/${b.items.length}/${c.items.length}`);
    a.items = [{ sp, vr: 0, t: 0.9 }, { sp, vr: 0, t: 0.55 }, { sp, vr: 0, t: 0.2 }]; one1(); if (b.items.length !== 1) bad.push('with the nearest full, the second nearest did not take it: ' + b.items.length);
    b.items = [{ sp, vr: 0, t: 0.9 }, { sp, vr: 0, t: 0.55 }, { sp, vr: 0, t: 0.2 }]; one1(); if (c.items.length !== 1) bad.push('third nearest did not take it');
    // a tile behind you at the same distance as one in front: the lower id (laid first) wins, never both
    setup(7); const f = one(ci() + 2, ck()), r = one(ci() - 2, ck()); hands(6); stand(cellX(ci()), cellZ(ck())); bucket(1); tick(0.0001, 0.0001); if (f.items.length + r.items.length !== 1 || f.items.length !== 1) bad.push('a tie must go to the tile laid first and never to two: ' + f.items.length + '/' + r.items.length);
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.only-plain-belts-and-ramps-take-plush', async () => {
    setup(7); const bad = []; const i = ci(), k = ck();
    const lift = g.placeEntity('belt', { i, j: 0, k, dir: 0, rise: 0, lift: { h: 3 }, items: [] }, { quiet: true, rebuild: false });
    const split = g.placeEntity('belt', { i: i + 1, j: 0, k, dir: 0, rise: 0, splitter: true, items: [] }, { quiet: true, rebuild: false });
    const gate = g.placeEntity('belt', { i: i + 2, j: 0, k, dir: 0, rise: 0, detector: true, items: [] }, { quiet: true, rebuild: false });
    const hose = g.placeEntity('belt', { i: i + 3, j: 0, k, dir: 0, rise: 0, hose: true, items: [] }, { quiet: true, rebuild: false });
    const merger = g.placeEntity('belt', { i: i + 4, j: 0, k, dir: 0, rise: 0, merger: true, items: [] }, { quiet: true, rebuild: false });
    const ug = g.placeEntity('belt', { i: i + 5, j: 0, k, dir: 0, rise: 0, ug: { role: 'in', pair: null, span: 0 }, items: [] }, { quiet: true, rebuild: false });
    const vault = B.vaultAt(i + 6, k), sorterOk = BI.eligible(vault);
    hands(8); stand(cellX(i + 2), cellZ(k) + 0.9); tick(1);
    if (S().carry.length !== 8) bad.push('something that is not a plain belt took plush: ' + (8 - S().carry.length)); if (sorterOk) bad.push('a vault is eligible');
    for (const t of [lift, split, gate, hose, merger, ug]) if (BI.eligible(t)) bad.push('eligible: ' + Object.keys(t).filter((x) => ['lift', 'splitter', 'detector', 'hose', 'merger', 'ug'].includes(x))[0]);
    const ramp = g.placeEntity('belt', { i: i + 2, j: 0, k: k + 6, dir: 0, rise: 1, items: [] }, { quiet: true, rebuild: false }); hands(3); stand(cellX(i + 2), cellZ(k + 6) - 1.5); tick(0.1);
    if (!BI.eligible(ramp) || ramp.items.length !== 1) bad.push('a ramp does not take plush (' + ramp.items.length + ')');
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.a-build-item-in-hand-stops-the-hands-but-not-the-cart-and-the-hammer-allows-it', async () => {
    setup(7, { timber: 1 }); const ts = block(5); hands(10); const c = cart(10, cellX(ci()) + 0.6, cellZ(ck())); stand(cellX(ci()), cellZ(ck())); const bad = [];
    craft('belt', 3); selectTool('belt'); if (g.curTool().kind !== 'belt') return 'could not take the belt out';
    tick(0.5, 0.05, clear(ts)); if (S().carry.length !== 10) bad.push('a belt in hand did not stop the pull on the hands'); if (c.load.length === 10) bad.push('the cart stopped too');
    g.stowed = true; g.rebuildTools(); tick(0.5, 0.05, clear(ts)); if (S().carry.length === 10) bad.push('bare hands were not pulled');
    hands(10); selectTool('hammer'); if (g.curTool().kind !== 'hammer') bad.push('the hammer did not come out'); tick(0.5, 0.05, clear(ts)); if (S().carry.length === 10) bad.push('the hammer in hand stopped the pull');
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.the-backtick-key-does-nothing-intake-is-always-on', async () => {
    setup(7); const ts = block(5); hands(30); stand(cellX(ci()), cellZ(ck())); const bad = [];
    io.clearHint(); io.tap('Backquote'); if (S().beltIntakeOff !== undefined) bad.push('the key set a switch: ' + S().beltIntakeOff); if (io.hint()) bad.push('the key showed a hint: ' + io.hint());
    tick(1, 0.05, clear(ts)); if (S().carry.length === 30) bad.push('nothing was pulled after the key');
    const c = cart(10, cellX(ci()) + 0.6, cellZ(ck())); io.tap('Backquote'); tick(1, 0.05, clear(ts)); if (c.load.length === 10) bad.push('the cart was not pulled after the key');
    io.tap('Backquote'); if (S().beltIntakeOff !== undefined) bad.push('a second press set a switch');
    B.setup({}); io.clearHint(); io.tap('Backquote'); if (S().beltIntakeOff !== undefined) bad.push('the key set a switch without belts'); if (io.hint()) bad.push('hint without belts: ' + io.hint());
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.a-bin-that-is-closer-wins-and-a-belt-that-is-closer-takes-over', async () => {
    setup(7); const bp = g.hall.binPos, bad = [];
    // the belt is 1.5 m from you, the bin 0.8 m: the bin wins, autoDump sells
    const t1 = B.lay(0, 1, ctx.toI(bp.x - 2.3), ctx.toK(bp.z), 0)[0]; hands(6); stand(bp.x - 0.8, bp.z); const m0 = S().money;
    for (let n = 0; n < 8; n++) { g.time += 0.05; BI.update(g, 0.05); g.autoDump(0.05); }
    if (t1.items.length) bad.push('the belt took plush with the bin closer'); if (S().money <= m0 || S().carry.length === 6) bad.push('the bin did not sell');
    // the belt is 0.6 m from you, the bin 3.0 m away (inside its suction): the belt takes over and the bin waits
    setup(0); const t2 = B.lay(0, 1, ctx.toI(bp.x - 3.6), ctx.toK(bp.z), 0)[0]; hands(6); g._adT = 0; stand(cellX(ctx.toI(bp.x - 3.6)) + 0.6, bp.z); const m1 = S().money;
    for (let n = 0; n < 6; n++) { g.time += 0.05; BI.update(g, 0.05); g.autoDump(0.05); }
    if (!t2.items.length) bad.push('the closer belt did not pull'); if (S().money !== m1) bad.push('the bin sold with a closer belt taking plush');
    // the belt is full: the bin takes over again once the hold runs out
    t2.items = [{ sp, vr: 0, t: 0.9 }, { sp, vr: 0, t: 0.55 }, { sp, vr: 0, t: 0.2 }]; const left = S().carry.length;
    for (let n = 0; n < 40; n++) { g.time += 0.05; BI.update(g, 0.05); g.autoDump(0.05); t2.items = [{ sp, vr: 0, t: 0.9 }, { sp, vr: 0, t: 0.55 }, { sp, vr: 0, t: 0.2 }]; }
    if (S().money <= m1 || S().carry.length >= left) bad.push('a full belt kept the bin from selling');
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.nothing-is-pulled-in-a-menu-or-after-death-or-without-plush', async () => {
    setup(7); const ts = block(5); hands(10); stand(cellX(ci()), cellZ(ck())); const bad = [];
    g.ui.open('pause'); tick(0.5); if (S().carry.length !== 10) bad.push('pulled in the pause menu'); g.ui.closeModals();
    g.dead = true; tick(0.5); g.dead = false; if (S().carry.length !== 10) bad.push('pulled while dead');
    g.mode = 'title'; tick(0.5); g.mode = 'play'; if (S().carry.length !== 10) bad.push('pulled outside play');
    hands(0); const b0 = g._bi && g._bi.cache && Object.keys(g._bi.cache).length; tick(1); if (total(ts) !== 0) bad.push('plush from nowhere'); void b0;
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.the-plush-fly-from-the-hands-and-sparkle-with-a-soft-sound-that-is-rate-limited', async () => {
    setup(7); const ts = block(5); hands(200); stand(cellX(ci()), cellZ(ck())); g.fliers.length = 0; const bad = [];
    let sparks = 0, sounds = 0; const sp0 = g.fx.sparkle, so0 = g.sound.soft; g.fx.sparkle = (...a) => { sparks++; return sp0.apply(g.fx, a); }; g.sound.soft = (...a) => { sounds++; return so0.apply(g.sound, a); };
    try { tick(1, 0.05, clear(ts)); } finally { g.fx.sparkle = sp0; g.sound.soft = so0; }
    if (!sparks) bad.push('no sparkle at the belt'); if (!sounds) bad.push('no sound'); if (sounds > 6) bad.push('the sound is not rate limited: ' + sounds + ' in a second'); if (sparks > 20) bad.push('sparkles not rate limited: ' + sparks);
    if (g.fliers.length > 80) bad.push('too many fliers ' + g.fliers.length);
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.the-readout-says-how-much-it-pulls-and-from-how-far', async () => {
    const bad = [], line = (t) => (infoFor(g, { kind: 'tile', id: t.id }) || { lines: [] }).lines.join(' | ');
    for (const l of [0, 3, 7]) {
      setup(l); const t = one(), t3 = B.lay(2, 1, ci() + 2, ck(), 0)[0];
      const want = `Pulls up to ${RATE[l]} plush per second from your hands and cart within ${+RANGE[l].toFixed(1)} m`;
      for (const x of [t, t3]) if (!line(x).includes(want)) bad.push(`level ${l}, Mk${(x.tier || 0) + 1}: "${line(x)}"`);
    }
    setup(0); const lift = g.placeEntity('belt', { i: ci(), j: 0, k: ck() + 3, dir: 0, rise: 0, lift: { h: 3 }, items: [] }, { quiet: true, rebuild: false });
    if (/Pulls up to/.test(line(lift))) bad.push('a lift says it pulls');
    S().beltIntakeOff = true; if (/switched off|backtick|off and on/i.test(line(one(ci(), ck() + 6)))) bad.push('the readout still talks about a switch'); delete S().beltIntakeOff;
    B.setup({}); const nb = one(); if (/Pulls up to/.test(line(nb))) bad.push('the readout talks about intake without belts owned');
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.end-to-end-plush-from-your-hands-reach-the-vault-and-none-are-lost', async () => {
    setup(2); const line = B.lay(0, 5, ci(), ck(), 0), vault = B.vaultAt(ci() + 5, ck()); hands(30); stand(cellX(ci()) - 0.3, cellZ(ck()) + 0.5); const bad = [];
    bucket(0);
    for (let n = 0; n < 120; n++) { BI.update(g, 1 / 60); B.step(1 / 60); }   // 2 s of pulling at 8 a second, with the belts running
    for (let n = 0; n < 60 * 8; n++) B.step(1 / 60);                         // and long enough for the line to empty into the vault
    const inHands = S().carry.length, inVault = vault.stored.length, onBelts = total(line);
    if (inHands + inVault + onBelts !== 30) bad.push(`conservation: ${inHands} in hands + ${inVault} vaulted + ${onBelts} on belts`);
    if (inVault < 15 || inVault > 17) bad.push('2 s at 8 a second should vault about 16, vaulted ' + inVault + ' ' + JSON.stringify({ inHands, onBelts, g_time: +g.time.toFixed(2), bucket: BI.state(g).b.host, inf: intakeOf(g.T), tool: g.curTool().kind, modal: g.ui.isModalOpen(), blacking: g.blacking, dead: g.dead, pitch: p().pitch, yaw: p().yaw, pos: [p().pos.x, p().pos.y, p().pos.z], tiles: line.map((t) => [t.i, t.k, t.dir, t.items.length, +(t.pw || 0).toFixed(2)]) }));
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.save-and-load-keep-the-level-and-an-old-switch-is-ignored', async () => {
    setup(4); S().beltIntakeOff = true; g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) return 'save failed';
    const { loadSaved } = await import('../state.js'); const saved = loadSaved(); if (!saved) return 'nothing saved';
    if (saved.S.up.beltIntake !== 4 || saved.S.beltIntakeOff !== true /* (an old save that still carries the dead flag) */) return 'the save does not carry it: ' + saved.S.up.beltIntake + ' ' + saved.S.beltIntakeOff;
    g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play'; const bad = [];
    if (g.T.intakeLevel !== 4 || intakeOf(g.T).rate !== 32) bad.push('level after load ' + g.T.intakeLevel);
    const t = one(); hands(5); stand(cellX(ci()) - 1, cellZ(ck())); g._bi = null; tick(0.1); if (!t.items.length) bad.push('an old switch kept it off after a load'); if (S().beltIntakeOff !== undefined) bad.push('the old switch was not deleted');
    return bad.length === 0 || bad.join('; ');
  });

  await T('intake.no-cost-cliff-with-500-or-2000-belt-tiles', async () => {
    const res = {}, bad = [];
    for (const n of [500, 2000]) {
      setup(7); hands(2000); stand(cellX(ci()), cellZ(ck()));
      const rows = n / 50; for (let r = 0; r < rows; r++) B.lay(0, 50, ci() - 25, ck() - (rows >> 1) + r, 0);
      if (tiles().length < n) return 'only ' + tiles().length + ' tiles';
      // BI.update alone is timed: the tiles are emptied between frames, outside the measure
      const time = (setPos, frames) => { let sum = 0; for (let f = 0; f < frames; f++) { setPos(f); g.time += 1 / 60; const a = performance.now(); BI.update(g, 1 / 60); sum += performance.now() - a; for (const x of tiles()) if (x.items.length) x.items.length = 0; } return sum / frames; };
      hands(100000);
      res['near' + n] = time(() => stand(cellX(ci()) + 0.01, cellZ(ck())), 150);
      res['walk' + n] = time((f) => stand(cellX(ci()) - 22 + (f % 120) * 0.3, cellZ(ck()) - (rows >> 1) * 0.6 + 2), 150);
      res['far' + n] = time(() => stand(cellX(ci()) + 60, cellZ(ck()) + 40), 150);
      hands(0); res['idle' + n] = time(() => stand(cellX(ci()), cellZ(ck())), 150);
    }
    const ms = (v) => v.toFixed(3);
    for (const n of [500, 2000]) { if (res['near' + n] > 2.5) bad.push(`${n} tiles: ${ms(res['near' + n])} ms a frame while pulling`); if (res['far' + n] > 0.25) bad.push(`${n} tiles: ${ms(res['far' + n])} ms a frame far from every belt`); if (res['idle' + n] > 0.05) bad.push(`${n} tiles: ${ms(res['idle' + n])} ms with empty hands`); }
    if (res.far2000 > Math.max(0.05, res.far500 * 3)) bad.push('far cost grew with the number of tiles: ' + ms(res.far500) + ' to ' + ms(res.far2000));
    if (res.walk2000 > Math.max(0.5, res.walk500 * 3)) bad.push('walking cost grew with the number of tiles: ' + ms(res.walk500) + ' to ' + ms(res.walk2000));
    window.__intakeTimings = res; console.log('intake timings (ms per frame): ' + JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, v]) => [k, +ms(v)]))));
    setup(0);   // (fresh: takes the 2,000 tiles down again)
    return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(res);
  });

  void adv;
}
