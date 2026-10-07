import * as PD from '../plushdata.js';
// split.* (wave 2B): mergers and priority mergers (fair turns, ranked lanes, speed by mark) and smart and programmable splitters (rules, overflow,
// order, default), measured on real belts with plush in the open bay. The pure rule functions are in split_rules.js.
import { makeSplitKit, UP, UPB, RAR, NEEDLE } from './split_lib.js';
import { rateOf, tierOf } from '../beltdata.js';
import * as SR from '../splitrules.js';
import { ARROW_Y, ARROW_R } from '../splitmesh.js';

export default async function (ctx) {
  const { g, S, L } = ctx;
  const X = makeSplitKit(ctx), T = X.T;
  const R = (min, max) => (max === undefined ? { k: 'rarity', v: min } : { k: 'rarity', v: min, w: max });
  const ANY = { k: 'any' }, NONE = { k: 'none' };
  const setRules = (t, rules, extra = {}) => { const r = g.setCfg(t, { rules, ...extra }); return r.ok || r.why; };
  // arrival times at a vault: call `watch()` from the hook, read `times` afterwards
  const meter = (vault, filter) => {
    const o = { times: [], seen: 0, byVr: new Map() };
    o.watch = () => { while (o.seen < vault.stored.length) { const s = vault.stored[o.seen++]; if (!filter || filter(s)) { o.times.push(g.time); if (!o.byVr.has(s.vr)) o.byVr.set(s.vr, g.time); } } };
    o.rate = (n = 50) => { const a = o.times.slice(-n); return a.length > 1 && a[a.length - 1] > a[0] ? (a.length - 1) / (a[a.length - 1] - a[0]) * 60 : 0; };
    return o;
  };

  // ======================================================================= merger
  await T('split.merger-fair-three-inputs', async () => {
    X.setup(UPB); const r = X.rig3('merger'), tags = [RAR(0, 0), RAR(0, 1), RAR(0, 2)];
    const hook = () => r.lanes.forEach((t, n) => X.feedAll(t, tags[n]));
    let s = 0; while (X.total(r.vault) < 99 && s < 40) { X.run(0.5, hook); s += 0.5; }
    const c = tags.map((sp) => X.tally(r.vault)[sp] || 0), mean = c.reduce((a, b) => a + b, 0) / 3;
    if (X.total(r.vault) < 99) return `only ${X.total(r.vault)} plush arrived in ${s} s`;
    if (c.some((n) => Math.abs(n - mean) > 3)) return `lanes (back, left, right) delivered ${c.join(', ')}: not fair`;
    return true;
  });

  await T('split.plain-belt-side-merge-is-the-unfair-control', async () => {
    // the same three lines into a plain belt: this is what the merger fixes (one lane takes the most of it), so the fairness test above can fail
    X.setup(UPB); const r = X.rig3('merger'), tags = [RAR(0, 0), RAR(0, 1), RAR(0, 2)];
    r.m.merger = undefined; L().parts.delete(r.m); L().dirty = true;
    const hook = () => r.lanes.forEach((t, n) => X.feedAll(t, tags[n]));
    let s = 0; while (X.total(r.vault) < 99 && s < 40) { X.run(0.5, hook); s += 0.5; }
    const c = tags.map((sp) => X.tally(r.vault)[sp] || 0);
    return Math.max(...c) - Math.min(...c) > 6 || `a plain belt merged fairly by accident: ${c.join(', ')}`;
  });

  await T('split.merger-output-is-exactly-one-belt', async () => {
    X.setup(UPB); const r = X.rig3('merger'), m = meter(r.vault);
    const hook = () => { m.watch(); r.lanes.forEach((t, n) => X.feedAll(t, RAR(0, n))); };
    let s = 0; while (X.total(r.vault) < 100 && s < 40) { X.run(0.5, hook); s += 0.5; }
    const want = rateOf(g.T, 0), got = m.rate(50);
    return (got > want * 0.94 && got < want * 1.04) || `merged output ${got.toFixed(1)} per min, one Mk1 belt moves ${want.toFixed(1)}`;
  });

  await T('split.merger-speed-follows-the-tile-mark', async () => {
    X.setup(UPB); const r = X.rig3('merger', 2), m = meter(r.vault);
    if (tierOf(r.m) !== 2) return 'the merger is not Mk3';
    const hook = () => { m.watch(); r.lanes.forEach((t, n) => X.feedAll(t, RAR(0, n))); };
    let s = 0; while (X.total(r.vault) < 100 && s < 40) { X.run(0.25, hook); s += 0.25; }
    const want = rateOf(g.T, 2), got = m.rate(50), c = [0, 1, 2].map((n) => X.tally(r.vault)[RAR(0, n)] || 0);
    if (!(got > want * 0.92 && got < want * 1.05)) return `Mk3 merged output ${got.toFixed(1)} per min, a Mk3 belt moves ${want.toFixed(1)}`;
    if (Math.max(...c) - Math.min(...c) > 4) return `Mk3 lanes delivered ${c.join(', ')}`;
    return true;
  });

  await T('split.merger-stays-fair-at-the-top-speed', async () => {
    // Mk6 belts with every speed upgrade: a plush crosses several tiles in one frame, the sub steps and the turn order must still hold
    X.setup(UP); const r = X.rig3('merger', 5), tags = [RAR(0, 0), RAR(0, 1), RAR(0, 2)];
    const hook = () => r.lanes.forEach((t, n) => X.feedAll(t, tags[n]));
    let s = 0; while (X.total(r.vault) < 99 && s < 10) { X.run(0.1, hook); s += 0.1; }
    const c = tags.map((sp) => X.tally(r.vault)[sp] || 0), mean = c.reduce((a, b) => a + b, 0) / 3;
    if (X.total(r.vault) < 99) return `only ${X.total(r.vault)} plush arrived`;
    return c.every((n) => Math.abs(n - mean) <= 5) || `at the top speed the lanes delivered ${c.join(', ')}`;
  });

  await T('split.merger-with-one-lane-passes-everything', async () => {
    X.setup(UPB); const r = X.rig3('merger'); let fed = 0;
    X.run(12, () => { fed += X.feedAll(r.left[0], RAR(1, 0)); });
    const got = X.total(r.vault), travel = X.onTiles();
    return (got + travel === fed) || `fed ${fed}, vault ${got}, on belts ${travel}`;
  });

  await T('split.unpowered-acts-plain', async () => {
    const bad = [];
    // a merger with no power lets whoever arrives push in (no turns) and still moves plush at the hand crank
    X.setup(UPB); let r = X.rig3('merger');
    const dead = () => { r.m.pw = 0; };
    X.step(1 / 60, dead);
    for (let n = 0; n < 3; n++) if (L().mergeLane(r.m, [0, 1, 3][n]) !== -1) bad.push('an unpowered merger governs lane ' + n);
    X.run(10, () => { dead(); r.lanes.forEach((t, n) => X.feedAll(t, RAR(0, n))); });
    if (X.total(r.vault) < 3) bad.push('an unpowered merger passed ' + X.total(r.vault) + ' plush in 10 s');
    // a smart splitter with no power deals out round robin and ignores its rules
    X.setup(UPB); const s = X.rigS('ssplit');
    if (setRules(s.s, [[NONE], [NONE], [NONE]]) !== true) bad.push('could not set rules');
    const q = []; for (let n = 0; n < 45; n++) q.push({ sp: RAR(0, n % 4), vr: 0 });
    X.pump(s.feed[0], q, 40, 2);
    const hookDead = () => { s.s.pw = 0; };
    const q2 = []; for (let n = 0; n < 60; n++) q2.push({ sp: RAR(0, n % 4), vr: 0 });
    const left = { v: q2.slice() }; let idle = 0;
    for (let t = 0; t < 60 && idle < 3; t += 1 / 60) { X.step(1 / 60, () => { hookDead(); while (left.v.length && L().accept(s.feed[0], left.v[0], null)) left.v.shift(); }); idle = left.v.length ? 0 : idle + 1 / 60; }
    const c = s.v.map((v) => X.total(v));
    if (c.some((n) => n < 5)) bad.push('an unpowered smart splitter with every rule set to None still deals to all three outputs like a plain one, got ' + c.join(', '));
    // and the moment power is back the rules apply again
    const before = s.v.map((v) => X.total(v));
    X.run(6, () => { X.feedAll(s.feed[0], RAR(2, 0)); });
    const after = s.v.map((v) => X.total(v));
    if (after.some((n, k) => n !== before[k])) bad.push('with every output set to None and power on, plush still went out: ' + before.join() + ' to ' + after.join());
    return bad.length === 0 || bad.join('; ');
  });

  // ======================================================================= priority merger
  await T('split.priority-merger-starves-low-lane-only-when-high-busy', async () => {
    const bad = [];
    // the left lane first, then back, then right
    X.setup(UPB); let r = X.rig3('pmerger', 0, { lanes: [1, 0, 2] }); const tags = [RAR(0, 0), RAR(0, 1), RAR(0, 2)];
    const sat = () => r.lanes.forEach((t, n) => X.feedAll(t, tags[n]));
    let s = 0; while (X.total(r.vault) < 99 && s < 40) { X.run(0.5, sat); s += 0.5; }
    let c = tags.map((sp) => X.tally(r.vault)[sp] || 0);
    if (c[1] < 88 || c[0] + c[2] > 11) bad.push(`all three lanes busy: back ${c[0]}, left ${c[1]}, right ${c[2]} (the left lane should take nearly everything)`);
    // the high lane trickles in (one plush every 0.9 s): the two lower lanes get the gaps, and the high lane loses nothing and waits no longer than alone
    const trial = (lowToo) => {
      X.setup(UPB); r = X.rig3('pmerger', 0, { lanes: [1, 0, 2] });
      const m = meter(r.vault), sent = new Map(); let nextAt = 0, n = 0;
      const hook = () => {
        m.watch();
        if (g.time >= nextAt && n < 14) { n++; const vr = n; if (L().accept(r.left[0], { sp: tags[1], vr }, null)) sent.set(vr, g.time); nextAt = g.time + 0.9; }
        if (lowToo) { X.feedAll(r.back[0], tags[0]); X.feedAll(r.right[0], tags[2]); }
      };
      X.run(18, hook);
      const lat = [...sent].map(([vr, t0]) => (m.byVr.get(vr) ?? Infinity) - t0);
      const stored = X.tally(r.vault);
      return { lat, high: stored[tags[1]] || 0, low: (stored[tags[0]] || 0) + (stored[tags[2]] || 0), n, rate: m.rate(40) };
    };
    const alone = trial(false), busy = trial(true);
    if (busy.high !== busy.n) bad.push(`the high lane delivered ${busy.high} of ${busy.n} plush while the others were busy`);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    if (mean(busy.lat) - mean(alone.lat) > 0.06) bad.push(`the high lane waited ${(mean(busy.lat) - mean(alone.lat)).toFixed(3)} s longer than alone`);
    if (busy.low < 40) bad.push(`the low lanes only got ${busy.low} plush through the gaps of a trickle`);
    const full = rateOf(g.T, 0);
    if (!(busy.rate > full * 0.9)) bad.push(`the gaps were not filled: output ${busy.rate.toFixed(0)} per min of ${full.toFixed(0)}`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.priority-merger-order-can-be-changed-and-follows-lanes', async () => {
    const bad = [], tags = [RAR(0, 0), RAR(0, 1), RAR(0, 2)];
    for (const [lanes, top] of [[[0, 1, 2], 0], [[2, 0, 1], 2], [[1, 2, 0], 1]]) {
      X.setup(UPB); const r = X.rig3('pmerger', 0, { lanes }); if (g.setCfg(r.m, { lanes }).ok !== true) bad.push('could not set ' + lanes);
      X.run(14, () => r.lanes.forEach((t, n) => X.feedAll(t, tags[n])));
      const c = tags.map((sp) => X.tally(r.vault)[sp] || 0), tot = c.reduce((a, b) => a + b, 0);
      if (c[top] < tot * 0.88) bad.push(`lanes ${lanes}: lane ${top} should lead, got ${c.join(', ')}`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  // ======================================================================= smart splitter
  await T('split.default-smart-splitter-deals-like-a-plain-splitter', async () => {
    X.setup(UPB); const r = X.rigS('ssplit'), q = []; for (let n = 0; n < 90; n++) q.push({ sp: RAR(n % 6, n % 3), vr: 0 });
    X.pump(r.feed[0], q, 40); const c = r.v.map((v) => X.total(v));
    if (c.reduce((a, b) => a + b, 0) !== 90) return 'only ' + c.join() + ' arrived';
    return (Math.max(...c) - Math.min(...c) <= 2) || 'a splitter with Any on every output dealt ' + c.join(', ');
  });

  await T('split.smart-splitter-routes-by-rarity-and-undefined', async () => {
    X.setup(UPB); const r = X.rigS('ssplit'), q = [];
    const res = setRules(r.s, [[R(3)], [R(1, 2)], [{ k: 'undef' }]]); if (res !== true) return res;
    for (let n = 0; n < 36; n++) q.push({ sp: RAR(n % 6, n % 4), vr: 0 });
    X.pump(r.feed[0], q, 40);
    const rar = (v) => [...new Set(v.stored.map((s) => ctx.species[s.sp].rarity))].sort().join();
    const out = r.v.map((v) => [X.total(v), rar(v)].join(':')).join(' | ');
    return (out === '18:3,4,5 | 12:1,2 | 6:0') || 'forward, right, left held ' + out;
  });

  await T('split.smart-splitter-species-shiny-and-the-one', async () => {
    const bad = [], A = RAR(2, 5), Bsp = RAR(2, 6);
    // species on the forward output, shiny on the right, anything else left
    X.setup(UPB); let r = X.rigS('ssplit');
    if (setRules(r.s, [[{ k: 'species', v: A }], [{ k: 'shiny' }], [ANY]]) !== true) return 'rules refused';
    X.pump(r.feed[0], [{ sp: A, vr: 5 }, { sp: A, vr: 9 }, { sp: Bsp, vr: 128 | 4 }, { sp: Bsp, vr: 3 }, { sp: RAR(0), vr: 128 }, { sp: RAR(0), vr: 1 }, { sp: A, vr: 11 }, { sp: Bsp, vr: 128 | 8 }], 20);
    const key = (v) => v.stored.map((s) => (s.sp === A ? 'A' : s.sp === Bsp ? 'B' : 'c') + ((s.vr & 128) ? '*' : '')).sort().join('');
    const out = r.v.map(key);
    if (out[0] !== 'AAA') bad.push('forward should hold the three A plush: ' + out[0]);
    if (out[1] !== 'B*B*c*') bad.push('right should hold the three shiny ones that are not A: ' + out[1]);
    if (out[2] !== 'Bc') bad.push('left should hold the two plain ones: ' + out[2]);
    // The One goes where its rule is; a fake does not
    X.setup(UPB); r = X.rigS('ssplit');
    if (setRules(r.s, [[{ k: 'one' }], [NONE], [ANY]]) !== true) return 'rules refused (2)';
    X.pump(r.feed[0], [{ sp: RAR(1), vr: 0 }, { sp: NEEDLE, vr: 0 }, { sp: PD.DECOYS[0], vr: 0 }, { sp: RAR(5), vr: 0 }], 20);
    const ids = (v) => v.stored.map((s) => s.sp).sort((a, b) => a - b).join();
    if (ids(r.v[0]) !== String(NEEDLE)) bad.push('only The One may take the forward output: ' + ids(r.v[0]));
    if (X.total(r.v[1]) !== 0) bad.push('an output set to None took ' + X.total(r.v[1]));
    if (X.total(r.v[2]) !== 3) bad.push('the rest go to Any: ' + X.total(r.v[2]));
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.overflow-only-when-full', async () => {
    const bad = [];
    X.setup(UPB); const r = X.rigS('ssplit');
    if (setRules(r.s, [[ANY], [{ k: 'overflow' }], [NONE]]) !== true) return 'rules refused';
    const q = []; for (let n = 0; n < 135; n++) q.push({ sp: RAR(0, n % 5), vr: 0 });
    // run until the forward vault is nearly full: nothing may have gone right yet
    const rest = q.slice(); let guard = 0;
    while (X.total(r.v[0]) < 110 && guard++ < 4000) X.step(1 / 60, () => { while (rest.length && L().accept(r.feed[0], rest[0], null)) rest.shift(); });
    if (X.total(r.v[1]) !== 0) bad.push('the overflow output took ' + X.total(r.v[1]) + ' plush while the forward vault still had room');
    X.pump(r.feed[0], rest, 40);
    const c = r.v.map((v) => X.total(v));
    if (c[0] !== 120) bad.push('forward holds ' + c[0] + ', its vault takes 120');
    if (c[1] !== 135 - 120 - c[2] || c[1] < 10) bad.push('the overflow output should hold the rest: ' + c.join(', '));
    if (c[2] !== 0) bad.push('the None output took ' + c[2]);
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.a-plush-nothing-takes-waits-and-the-line-backs-up', async () => {
    const bad = [];
    X.setup(UPB); const r = X.rigS('ssplit');
    if (setRules(r.s, [[R(4)], [NONE], [NONE]]) !== true) return 'rules refused';
    const q = [{ sp: RAR(0), vr: 0 }, { sp: RAR(5), vr: 0 }, { sp: RAR(5, 1), vr: 0 }]; for (let n = 0; n < 12; n++) q.push({ sp: RAR(5, 2), vr: 0 });
    X.pump(r.feed[0], q, 8, 99);
    if (r.v.some((v) => X.total(v))) bad.push('something got through: ' + r.v.map((v) => X.total(v)).join());
    if (!(r.s.items.length >= 1 && r.s.items[0].t >= 0.999)) bad.push('the Common should sit at the end of the splitter');
    if (X.feedAll(r.feed[0], RAR(1)) !== 0) bad.push('the line behind it should be full');
    // an Any undefined output releases it at once
    if (setRules(r.s, [[R(4)], [NONE], [{ k: 'undef' }]]) !== true) bad.push('could not add the undefined output');
    X.run(8, () => {});
    if (X.total(r.v[2]) !== 1 || X.total(r.v[0]) < 2) bad.push('after the change: ' + r.v.map((v) => X.total(v)).join());
    // an overflow output releases it too
    X.setup(UPB); const s2 = X.rigS('ssplit');
    if (setRules(s2.s, [[R(4)], [{ k: 'overflow' }], [NONE]]) !== true) return 'rules refused (3)';
    X.pump(s2.feed[0], [{ sp: RAR(0), vr: 0 }, { sp: RAR(5), vr: 0 }], 10);
    if (X.total(s2.v[1]) !== 1 || X.total(s2.v[0]) !== 1) bad.push('with an overflow output: ' + s2.v.map((v) => X.total(v)).join());
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.priority-order-fills-the-best-output-first', async () => {
    const bad = [];
    X.setup(UPB); const r = X.rigS('ssplit');
    if (g.setCfg(r.s, { mode: 'prio', prio: [2, 0, 1] }).ok !== true) return 'could not set the order';
    const q = []; for (let n = 0; n < 60; n++) q.push({ sp: RAR(0, n % 3), vr: 0 });
    X.pump(r.feed[0], q, 30);
    let c = r.v.map((v) => X.total(v)); if (c.join() !== '0,0,60') bad.push('the best output (left) should take all 60: ' + c.join());
    // fill the left vault, the next best (forward) takes over, the right one only when forward is full too
    while (r.v[2].stored.length < 120) r.v[2].stored.push({ sp: RAR(0), vr: 0 });
    const q2 = []; for (let n = 0; n < 40; n++) q2.push({ sp: RAR(1, n % 3), vr: 0 });
    X.pump(r.feed[0], q2, 30);
    c = r.v.map((v) => X.total(v)); if (c[0] !== 40 || c[1] !== 0) bad.push('with the left vault full the forward output goes next: ' + c.join());
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.programmable-eight-rules-and-default-output', async () => {
    const bad = [], A = RAR(1, 7), B2 = RAR(3, 2);
    X.setup(UPB); const r = X.rigS('psplit');
    const res = g.setCfg(r.s, { rules: [[{ k: 'species', v: A }, { k: 'species', v: B2 }, R(5), { k: 'one' }], [{ k: 'shiny' }, R(4, 4)], [NONE]], def: 2 });
    if (!res.ok) return 'rules refused: ' + res.why;
    const items = [{ sp: A, vr: 0 }, { sp: B2, vr: 0 }, { sp: RAR(5, 3), vr: 0 }, { sp: NEEDLE, vr: 0 }, { sp: RAR(0, 3), vr: 128 }, { sp: RAR(4, 2), vr: 0 }, { sp: RAR(0, 4), vr: 0 }, { sp: RAR(2, 2), vr: 0 }, { sp: RAR(5, 3), vr: 0 }];
    X.pump(r.feed[0], items, 30);
    const c = r.v.map((v) => X.total(v));
    if (c.join() !== '5,2,2') bad.push('forward takes the species A, B, Mythic and The One (5), right the shiny and the Legendary (2), the default output the other two (2): got ' + c.join());
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.programmable-keeps-the-rules-of-a-smart-splitter-it-replaces', async () => {
    X.setup(UPB); const r = X.rigS('ssplit'); const bad = [];
    if (setRules(r.s, [[R(3)], [{ k: 'shiny' }], [{ k: 'undef' }]], { mode: 'prio', prio: [1, 2, 0] }) !== true) return 'rules refused';
    const f = (await import('../splitparts.js')).fieldsOf('psplit', r.s, r.s);
    if (JSON.stringify(f.rules) !== JSON.stringify(r.s.rules) || f.mode !== 'prio' || f.prio.join() !== '1,2,0' || f.smart !== 2) bad.push('fields of the upgrade: ' + JSON.stringify(f));
    return bad.length === 0 || bad.join('; ');
  });

  // ======================================================================= geometry
  await T('split.output-slots-and-input-lanes-match-left-and-right', async () => {
    const bad = [];
    for (let d = 0; d < 4; d++) {
      X.setup(UPB); const i = X.i0() + 4, k = X.k0() + 4, DX = X.DX, DZ = X.DZ;
      const s = X.part('ssplit', i, k, d), rt = [(d + 1) & 3, (d + 3) & 3];
      // forward x up = the player's right hand (right = forward cross up = (-fz, fx))
      const right = { x: -DZ[d], z: DX[d] };
      if (DX[rt[0]] !== right.x || DZ[rt[0]] !== right.z) bad.push(`dir ${d}: slot 1 is not the right hand`);
      const vs = [X.vaultAt(i + DX[d], k + DZ[d]), X.vaultAt(i + DX[rt[0]], k + DZ[rt[0]]), X.vaultAt(i + DX[rt[1]], k + DZ[rt[1]])];
      const outs = L().splitOuts(s); if (outs.map((o) => o.slot).join() !== '0,1,2' || outs.some((o, n) => o.tile !== vs[n])) bad.push(`dir ${d}: splitOuts ${outs.map((o) => o.slot)}`);
      // the cones drawn on the mesh sit on the same sides (model -X is the right hand, +X the left)
      const obj = L().objs.get(s.id); obj.updateMatrixWorld(true);
      const cones = obj.children.filter((c) => c.isGroup && c.children[0] && c.children[0].geometry && c.children[0].geometry.type === 'ConeGeometry' && Math.abs(c.position.y - ARROW_Y) < 0.01);
      const world = cones.map((c) => { const p = c.getWorldPosition(new ctx.V3()); return { x: p.x - ctx.cellX(i), z: p.z - ctx.cellZ(k) }; });
      const near = (a, b) => Math.abs(a.x - b.x) < 0.03 && Math.abs(a.z - b.z) < 0.03;
      const R = ARROW_R, want = [{ x: DX[d] * R, z: DZ[d] * R }, { x: right.x * R, z: right.z * R }, { x: -right.x * R, z: -right.z * R }];
      want.forEach((w, n) => { if (!world.some((p) => near(p, w))) bad.push(`dir ${d}: no output cone for slot ${n}`); });
      // a merger: back, left, right lanes
      const m = X.part('merger', i + 6, k, d), mo = L().objs.get(m.id); mo.updateMatrixWorld(true);
      const lanes = [SR.laneOf(d, d), SR.laneOf(d, (d + 1) & 3), SR.laneOf(d, (d + 3) & 3)];
      if (lanes.join() !== '0,1,2') bad.push('lane numbers ' + lanes);
      const ins = mo.children.filter((c) => c.isGroup && c.children[0] && c.children[0].geometry && c.children[0].geometry.type === 'ConeGeometry' && Math.abs(c.position.y - ARROW_Y) < 0.01).map((c) => { const p = c.getWorldPosition(new ctx.V3()); return { x: p.x - ctx.cellX(i + 6), z: p.z - ctx.cellZ(k) }; });
      const wantIn = [{ x: -DX[d] * R, z: -DZ[d] * R }, { x: -right.x * R, z: -right.z * R }, { x: right.x * R, z: right.z * R }];
      wantIn.forEach((w, n) => { if (!ins.some((p) => near(p, w))) bad.push(`dir ${d}: no input cone for lane ${n}`); });
    }
    return bad.length === 0 || bad.join('; ');
  });

  // ======================================================================= mixed lines
  await T('split.items-are-conserved-through-a-merger-and-a-ruled-splitter', async () => {
    X.setup(UPB); const i = X.i0(), k = X.k0(); const bad = [];
    // three lines into a merger, then straight into a smart splitter with three vaults
    const back = X.lay(0, 4, i, k, 0), left = X.lay(0, 3, i + 4, k - 3, 1), right = X.lay(0, 3, i + 4, k + 3, 3);
    X.part('merger', i + 4, k, 0); X.lay(0, 2, i + 5, k, 0); const s = X.part('ssplit', i + 7, k, 0);
    const v = [X.vaultAt(i + 8, k), X.vaultAt(i + 7, k + 1), X.vaultAt(i + 7, k - 1)];
    if (setRules(s, [[R(2)], [{ k: 'shiny' }], [ANY]]) !== true) return 'rules refused';
    let fed = 0; const lanes = [back[0], left[0], right[0]];
    X.run(10, () => { lanes.forEach((t, n) => { fed += X.feedAll(t, RAR(n * 2, n), n === 1 ? 128 : 0); }); });
    X.run(5, () => {});
    const got = v.reduce((a, b) => a + X.total(b), 0), travel = X.onTiles();
    if (got + travel !== fed) bad.push(`fed ${fed}, vaults ${got}, still on belts ${travel}`);
    if (v[0].stored.some((p) => ctx.species[p.sp].rarity < 2)) bad.push('forward holds a plush below Rare');
    return bad.length === 0 || bad.join('; ');
  });

  // ======================================================================= random networks
  await T('split.fuzz-random-networks-conserve-plush-and-spacing', async () => {
    const bad = [], DX = X.DX, DZ = X.DZ;
    let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const pickOf = (a) => a[Math.floor(rnd() * a.length)];
    const speciesPool = [RAR(0, 0), RAR(1, 1), RAR(2, 2), RAR(3, 3), RAR(4, 4), RAR(5, 5), NEEDLE];
    const randRule = () => {
      const k = pickOf(['any', 'none', 'overflow', 'undef', 'rarity', 'species', 'one', 'shiny']);
      if (k === 'rarity') { const lo = Math.floor(rnd() * 6), hi = lo + Math.floor(rnd() * (6 - lo)); return hi === 5 ? { k, v: lo } : { k, v: lo, w: hi }; }
      if (k === 'species') return { k, v: pickOf(speciesPool.slice(0, 6)) };
      return { k };
    };
    for (let round = 0; round < 6; round++) {
      X.setup(UPB); const i = X.i0(), k = X.k0() + 1, vaults = [], parts = [], sources = [];
      const tier = Math.floor(rnd() * 3);
      const trunk = X.lay(tier, 2, i, k, 0); sources.push(trunk[0]);
      // sometimes a merger takes two more lines in front of the tree
      let cx = i + 2, d = 0;
      if (rnd() < 0.6) { const m = X.part(pickOf(['merger', 'pmerger']), cx, k, 0, tier); parts.push(m); sources.push(X.lay(tier, 3, cx, k - 3, 1)[0], X.lay(tier, 3, cx, k + 3, 3)[0]); X.lay(tier, 1, cx + 1, k, 0); cx += 2; }
      const grow = (ci, ck, depth) => {
        const kind = pickOf(['splitter', 'ssplit', 'psplit', 'ssplit', 'psplit']);
        const t = kind === 'splitter' ? g.placeEntity('belt', { i: ci, j: 0, k: ck, dir: d, rise: 0, splitter: true, items: [], ...(tier ? { tier } : {}) }, { quiet: true, rebuild: false }) : X.part(kind, ci, ck, d, tier);
        parts.push(t);
        [d, (d + 1) & 3, (d + 3) & 3].forEach((ds, s) => {
          const ni = ci + DX[ds], nk = ck + DZ[ds];
          if (s === 0 && depth < 2 && rnd() < 0.7) grow(ni, nk, depth + 1); else vaults.push(X.vaultAt(ni, nk));
        });
      };
      grow(cx, k, 0); L().dirty = true;
      for (const t of parts) {
        if (t.smart) {
          const n = t.smart === 2 ? 1 + Math.floor(rnd() * 3) : 1;
          const rules = [0, 1, 2].map(() => Array.from({ length: Math.max(1, Math.floor(rnd() * n) + (t.smart === 2 ? 1 : 0)) }, randRule).slice(0, t.smart === 2 ? 8 : 1));
          const patch = { rules, mode: rnd() < 0.3 ? 'prio' : 'rr', prio: pickOf([[0, 1, 2], [2, 1, 0], [1, 2, 0]]) }; if (t.smart === 2) patch.def = Math.floor(rnd() * 4) - 1;
          const r = g.setCfg(t, patch); if (r.ok !== true) bad.push('round ' + round + ': a random patch was refused: ' + r.why);
        } else if (t.merger === 'prio') g.setCfg(t, { lanes: pickOf([[0, 1, 2], [2, 0, 1], [1, 2, 0]]) });
      }
      let fed = 0;
      try {
        X.run(14, () => {
          for (const src of sources) { if (rnd() < 0.7) { const it = { sp: pickOf(speciesPool), vr: rnd() < 0.2 ? 128 : 0 }; if (L().accept(src, it, null)) fed++; } }
          if (rnd() < 0.05) { const t = pickOf(parts); t.pw = 0; }   // a short brownout now and then: the tile acts plain and must lose nothing
        });
        X.run(2, () => {});
      } catch (e) { bad.push('round ' + round + ' threw: ' + e.message); continue; }
      const got = vaults.reduce((a, v) => a + X.total(v), 0), travel = X.onTiles();
      if (fed < 40 || got < 10) bad.push(`round ${round}: the network barely ran (fed ${fed}, vaults ${got})`);
      if (got + travel !== fed) bad.push(`round ${round}: fed ${fed}, vaults ${got}, on belts ${travel}`);
      for (const t of ctx.tiles()) {
        if (t.type !== 'belt') continue;
        for (let n = 0; n < t.items.length; n++) {
          const it = t.items[n]; if (!Number.isFinite(it.t) || it.t < -1e-6 || it.t > (t.lift ? Math.abs(t.lift.h) + 1 : 1) + 1e-6) bad.push(`round ${round}: a plush at t=${it.t} on tile ${t.id}`);
          if (n > 0 && t.items[n - 1].t - it.t < 0.34 - 1e-4) bad.push(`round ${round}: plush ${n} is ${(t.items[n - 1].t - it.t).toFixed(3)} behind the one ahead on tile ${t.id}`);
        }
        if (t.items.length > 3) bad.push(`round ${round}: ${t.items.length} plush on a tile`);
        if (t.smart && !SR.cleanRules(t.rules, t.smart)) bad.push(`round ${round}: bad rules on ${t.id}`);
        if (!Number.isInteger(t.rr || 0) || (t.mrr !== undefined && !Number.isInteger(t.mrr))) bad.push(`round ${round}: bad pointer on ${t.id}`);
      }
      if (bad.length > 8) break;
    }
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  void S; void NEEDLE;
}
