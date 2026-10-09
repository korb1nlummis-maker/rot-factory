// power.*: the grid solver with the new parts (Wave 2): Power Switch, Breaker Box, Priority Switch, Power Storage and the Load Meter.
// Every test builds real ents (tiles and machines) and advances the real game loop; nothing is stubbed except a sound counter.
import { makeKit } from './power_lib.js';
import * as PP from '../powerparts.js';
import { DEMAND } from '../power.js';

export default async function (ctx) {
  const { T, g, S, adv } = ctx;
  const K = makeKit(ctx);
  const { reset, grid, part, wire, netOf, allPowered, nonePowered, mach, decon } = K;
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const kinds = (arr) => arr.map((x) => (x.shed ? 'shed' : x.on ? 'on' : 'off')).join();

  // ------------------------------------------------------------------ switch
  await T('power.switch-open-isolates-two-grids', async () => {
    reset(); const A = grid(-10, 3, { gens: 1, fans: 1 }), B = grid(8, 3, { fans: 2 }); const sw = part('switch', -1, 3);
    for (const r of [wire(sw, A.pole), wire(sw, B.pole)]) if (!r.ok) return 'wire: ' + r.why;
    adv(1.2); const bad = [];
    if (sw.on) bad.push('a new switch must start open');
    if (g.power.nets.length !== 2) bad.push('open switch: ' + g.power.nets.length + ' grids, want 2');
    if (!allPowered(A)) bad.push('grid A lost power');
    if (!nonePowered(B)) bad.push('grid B is powered through an open switch: ' + K.nearFans(B));
    if (PP.lampOf(g, sw) !== 'yellow') bad.push('open lamp ' + PP.lampOf(g, sw));
    const r = g.setCfg(sw, { on: true }); if (!r.ok) return 'toggle: ' + r.why; adv(0.3);
    if (g.power.nets.length !== 1) bad.push('closed switch: ' + g.power.nets.length + ' grids, want 1');
    if (!allPowered(B)) bad.push('grid B is dark through a closed switch: ' + K.nearFans(B));
    if (PP.lampOf(g, sw) !== 'green') bad.push('closed lamp ' + PP.lampOf(g, sw));
    g.setCfg(sw, { on: false }); adv(0.3);
    if (!nonePowered(B) || g.power.nets.length !== 2) bad.push('opening it again did not split the grids');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.switch-does-not-isolate-if-pole-path-exists', async () => {
    reset(); const A = grid(-10, 3, { gens: 1, fans: 1 }), B = grid(7.5, 3, { fans: 2 });
    { let prev = A.pole; for (const x of [-6.5, -3, 0.5, 4]) { const q = K.pole(x, 3); wire(prev, q); prev = q; } wire(prev, B.pole); }   // a chain of poles 3.5 m apart, each wired to the next, joins A and B
    const sw = part('switch', -1, 6); wire(sw, A.pole); wire(sw, B.pole); adv(1);
    const bad = [];
    if (g.power.nets.length !== 1) bad.push('the pole chain should join the grids: ' + g.power.nets.length);
    if (!allPowered(B)) bad.push('B dark although a pole path joins it: ' + K.nearFans(B));
    if (sw.on) bad.push('switch is not open');
    // and a second cable path: two grids joined by a cable, with an open switch on another pair of cables, stay joined
    reset(); const C = grid(-10, 3, { gens: 1, fans: 1 }), D = grid(3, 3, { fans: 2 }); const s2 = part('switch', -1, 6); wire(s2, C.pole); wire(s2, D.pole); wire(C.pole, D.pole); adv(1);
    if (g.power.nets.length !== 1 || !allPowered(D)) bad.push('a cable between the poles was cut by an open switch: ' + g.power.nets.length);
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.switch-needs-two-cables-lamp-and-one-sided-is-harmless', async () => {
    reset(); const A = grid(-10, 3, { gens: 1, fans: 1 }), sw = part('switch', -2, 3); wire(sw, A.pole); adv(0.5);
    const bad = []; if (PP.lampOf(g, sw) !== 'red') bad.push('one cable: lamp ' + PP.lampOf(g, sw));
    g.setCfg(sw, { on: true }); adv(0.5); if (!allPowered(A)) bad.push('a one-sided closed switch cut its own grid');
    if (g.power.nets.length !== 1) bad.push('nets ' + g.power.nets.length);
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.switch-feeds-a-machine-only-while-closed', async () => {
    reset(); const A = grid(-10, 3, { gens: 1, fans: 0 }), sw = part('switch', -4, 6), load = mach('claw', 4, 6); wire(sw, A.pole); wire(sw, load); adv(1);
    const bad = []; if ((load.pw || 0) !== 0) bad.push('machine powered through an open switch');
    g.setCfg(sw, { on: true }); adv(0.5); if (!((load.pw || 0) > 0.99)) bad.push('machine not powered through the closed switch: ' + load.pw);
    const net = netOf(A.pole); if (!(near(net.demand, 2.5 + 0.05, 0.01))) bad.push('demand ' + net.demand + ' (claw 2.5 + switch 0.05)');
    g.setCfg(sw, { on: false }); adv(0.5); if ((load.pw || 0) !== 0) bad.push('machine kept power after the switch opened');
    return bad.length === 0 || bad.join(' | ');
  });

  // ------------------------------------------------------------------ breaker
  const overloaded = () => { const G = grid(-8, 3, { gens: 1, fans: 6 }); const br = part('breaker', -8, 5.4); return { G, br }; };

  await T('power.breaker-trips-over-cap-after-delay', async () => {
    reset(); const { G, br } = overloaded(); const bad = []; const calls = []; const orig = g.sound.thump; g.sound.thump = (...a) => { calls.push(a); };
    try {
      adv(2); if (br.tripped) bad.push('tripped after 2 s (delay is 3 s)');
      if (!(near(netOf(G.pole).sat, 8 / 12.1, 0.02))) bad.push('sat before the trip ' + netOf(G.pole).sat);
      adv(1.4); if (!br.tripped) bad.push('not tripped after 3.4 s over the rating');
      if (!calls.length) bad.push('no contactor clack');
      if (!/GRID TRIPPED/.test(K.hintText())) bad.push('no hint: ' + K.hintText());
      const net = netOf(G.pole); if (!net || net.sat !== 0 || !net.tripped) bad.push('tripped grid should supply nothing: ' + JSON.stringify(net && { sat: net.sat, tripped: net.tripped }));
      if (!nonePowered(G)) bad.push('machines still run on a tripped grid: ' + K.nearFans(G));
      if (PP.lampOf(g, br) !== 'red') bad.push('lamp ' + PP.lampOf(g, br));
      // E (a cfg reset) while the load is still too big: it trips again after the 1 s grace
      const r = g.setCfg(br, { tripped: false }); if (!r.ok) bad.push('reset refused: ' + r.why);
      adv(0.4); if (br.tripped) bad.push('re-tripped before the grace second');
      adv(1.4); if (!br.tripped) bad.push('did not re-trip with the load still over the rating');
      // take the load down, reset, it stays closed
      for (const f of G.fans.slice(0, 4)) decon(f);
      g.setCfg(br, { tripped: false }); adv(6); if (br.tripped) bad.push('tripped with the load under the rating');
      const n2 = netOf(G.pole); if (!(n2.sat >= 0.99) || !G.fans.slice(4).every((f) => (f.pw || 0) > 0.99)) bad.push('grid did not come back: sat ' + n2.sat);
    } finally { g.sound.thump = orig; }
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.no-breaker-keeps-brownout', async () => {
    reset(); const G = grid(-8, 3, { gens: 1, fans: 6 }); adv(10);
    const net = netOf(G.pole), bad = [];
    if (!near(net.sat, 8 / 12, 0.01)) bad.push('sat ' + net.sat + ' want 0.667');
    if (net.tripped) bad.push('tripped with no breaker');
    if (!G.fans.every((f) => near(f.pw || 0, 8 / 12, 0.01))) bad.push('fans ' + K.nearFans(G));
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.breaker-keeps-a-healthy-grid-closed-and-honors-delay-and-at', async () => {
    reset(); const G = grid(-8, 3, { gens: 1, fans: 3 }), br = part('breaker', -8, 5.4); adv(20);
    const bad = []; if (br.tripped) bad.push('a healthy grid tripped (6.1 kW of 8)');
    g.setCfg(br, { trip: { at: 0.5 } }); if (br.trip.at !== 0.5 || br.trip.delay !== 3) bad.push('partial trip patch should keep the other field: ' + JSON.stringify(br.trip));
    adv(2.2); if (br.tripped) bad.push('tripped before the 3 s delay at a lower threshold');
    adv(1.2); if (!br.tripped) bad.push('0.5 x rated = 4 kW against 6.1 kW did not trip');
    g.setCfg(br, { armed: false }); adv(0.1); if (br.tripped) bad.push('disarming should close it');
    adv(8); if (br.tripped) bad.push('a disarmed breaker tripped');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.breaker-needs-generator-rating-not-fuel', async () => {
    // out of fuel is a dead grid, not an overload: demand over a zero rating with no storage never trips
    reset(); const G = grid(-8, 3, { gens: 0, fans: 2 }), br = part('breaker', -8, 5.4); adv(8);
    const bad = []; if (br.tripped) bad.push('a grid with no generator tripped'); if (!nonePowered(G)) bad.push('powered with no generator');
    reset(); const H = grid(-8, 3, { gens: 1, fans: 2 }), b2 = part('breaker', -8, 5.4); H.gens[0].burn = 0; H.gens[0].lit = false; H.gens[0].q = []; adv(8);
    if (b2.tripped) bad.push('a generator that is out of fuel (rating 8 kW, demand 4.1) tripped');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.remote-reset-closes-a-breaker-after-20-s-under-the-rating', async () => {
    reset({ power: 1, belts: 1, fans: 1, autoReset: 1 }); const { G, br } = overloaded(); adv(4); const bad = [];
    if (!br.tripped) return 'setup: did not trip';
    for (const f of G.fans.slice(0, 4)) decon(f); adv(15); if (!br.tripped) bad.push('reset before 20 s');
    adv(7); if (br.tripped) bad.push('Remote Reset did not close it');
    reset({ power: 1, belts: 1, fans: 1 }); const o = overloaded(); adv(4);
    for (const f of o.G.fans.slice(0, 4)) decon(f); adv(40); if (!o.br.tripped) bad.push('without the upgrade a breaker reset itself');
    return bad.length === 0 || bad.join(' | ');
  });

  // ------------------------------------------------------------------ priority switches
  // main grid M (8 kW, one fan) with branch grids reached through Priority Switches
  const branches = (loads, prios, upgrades, pre) => {
    reset(upgrades); const M = grid(-12, 3, { gens: 1, fans: 1 }); const out = { M, B: [], S: [] }; if (pre) out.pre = pre(M);
    loads.forEach((n, i) => {
      const B = grid(-5 + i * 6.5, 3, { fans: n }); out.B.push(B);
      const sw = part('switch', -8.5 + i * 3.5, 7.4, { prio: prios[i], on: true }); out.S.push(sw);
      const r1 = wire(sw, M.pole), r2 = wire(sw, B.pole); if (!r1.ok || !r2.ok) throw new Error('wire ' + (r1.why || r2.why));
    });
    return out;
  };

  await T('power.priority-sheds-highest-group-first', async () => {
    const R = branches([1, 1, 2], [1, 2, 3]); adv(1); const bad = [];   // 2 + 2 + 2 + 4 = 10 kW against 8
    if (kinds(R.S) !== 'on,on,shed') bad.push('one overload, one shed (the group 3 switch): ' + kinds(R.S));
    if (!R.B[2].fans.every((f) => (f.pw || 0) === 0)) bad.push('the shed branch is still powered');
    if (!R.B[0].fans.concat(R.B[1].fans, R.M.fans).every((f) => (f.pw || 0) > 0.99)) bad.push('the kept loads are not at full power');
    if (PP.lampOf(g, R.S[2]) !== 'orange') bad.push('shed lamp ' + PP.lampOf(g, R.S[2]));
    // a bigger overload drops the next group too, in order
    const Q = branches([2, 2, 2], [1, 2, 3]); adv(1);
    if (kinds(Q.S) !== 'on,shed,shed') bad.push('two sheds expected, highest groups first: ' + kinds(Q.S));
    if (!Q.M.fans.concat(Q.B[0].fans).every((f) => (f.pw || 0) > 0.99)) bad.push('group 1 and the main grid should be whole: ' + K.nearFans(Q.B[0]));
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.priority-undefined-group-goes-first', async () => {
    const R = branches([2, 1, 1], [0, 8, 5]); adv(1); const bad = [];
    if (kinds(R.S) !== 'shed,on,on') bad.push('group 0 (undefined) must drop before group 8: ' + kinds(R.S));
    const Q = branches([2, 2, 2], [0, 8, 5]); adv(1);   // 2 + 12 = 14: group 0 first, then 8
    if (kinds(Q.S) !== 'shed,shed,on') bad.push('order 0, 8, 5: ' + kinds(Q.S));
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.plain-switch-never-sheds-and-an-open-priority-switch-is-left-alone', async () => {
    const R = branches([3, 3, 3], [undefined, 4, 5]); adv(1); const bad = [];
    if (R.S[0].shed) bad.push('a plain switch was shed');
    if (kinds(R.S) !== 'on,shed,shed') bad.push('the priority switches should shed, the plain one stay: ' + kinds(R.S));
    const Q = branches([3, 3, 3], [1, 2, 3]); g.setCfg(Q.S[2], { on: false }); adv(1);
    if (Q.S[2].shed) bad.push('an open switch was marked shed');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.shed-switch-stays-open-until-reset-and-reset-needs-surplus', async () => {
    const R = branches([1, 1, 2], [1, 2, 3]); adv(1); const bad = [], s3 = R.S[2];
    if (!s3.shed) return 'setup: nothing shed';
    adv(30); if (!s3.shed) bad.push('shed switch closed by itself without Remote Reset');
    const r = g.setCfg(s3, { shed: false }); if (r.ok) bad.push('reset accepted while the grid is still overloaded');
    if (g.setCfg(s3, { shed: true }).ok) bad.push('a player may not shed a switch');
    // a second generator: supply covers the whole load, E resets it and it stays closed
    const g2 = K.gen(-13.2, 4.2); wire(g2, R.M.pole); adv(0.5);
    const r2 = g.setCfg(s3, { shed: false }); if (!r2.ok) bad.push('reset refused with surplus: ' + r2.why); adv(2);
    if (s3.shed || !s3.on) bad.push('it did not stay closed: ' + kinds([s3]));
    if (!R.B[2].fans.every((f) => (f.pw || 0) > 0.99)) bad.push('branch not fed again');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.remote-reset-closes-a-shed-switch-after-10-s-of-surplus', async () => {
    const R = branches([1, 1, 2], [1, 2, 3], { power: 1, belts: 1, fans: 1, autoReset: 1 }); adv(1); const bad = [], s3 = R.S[2];
    if (!s3.shed) return 'setup: nothing shed';
    wire(K.gen(-13.2, 4.2), R.M.pole); adv(7); if (!s3.shed) bad.push('closed before 10 s of surplus');
    adv(5); if (s3.shed) bad.push('did not close after surplus: ' + kinds(R.S));
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.grid-surge-outage-does-not-shed-or-trip', async () => {
    const R = branches([1, 1, 1], [1, 2, 3]); const br = part('breaker', -12, 5.4); for (const s of R.S) s.shed = false; g.power.outage = true; g.power.markDirty();
    try { adv(8); } finally { g.power.outage = false; g.power.markDirty(); }
    const bad = []; if (R.S.some((s) => s.shed) || br.tripped) bad.push('an outage shed or tripped something: ' + kinds(R.S) + ' ' + br.tripped);
    return bad.length === 0 || bad.join(' | ');
  });

  // ------------------------------------------------------------------ storage
  await T('power.battery-charges-on-surplus-discharges-on-deficit', async () => {
    reset(); const G = grid(-8, 3, { gens: 1, fans: 1 }), bat = part('battery', -8, 5.4, { mark: 1 }); adv(10); const bad = [];
    // surplus 8 - 2 - 0.1 = 5.9 kW, under the 20 kW limit of a Mk1
    if (!(bat.charge > 50 && bat.charge < 62)) bad.push('charge after 10 s ' + bat.charge.toFixed(1) + ' kJ (want about 59)');
    if (PP.lampOf(g, bat) !== 'blue') bad.push('charging lamp ' + PP.lampOf(g, bat));
    if (!(bat.cache.flow > 5 && bat.cache.flow < 6.2)) bad.push('flow ' + bat.cache.flow);
    // a deficit of 2.1 kW: the battery covers it, the grid stays whole
    G.addFans(4); adv(0.5); bat.charge = 100; const c0 = bat.charge; adv(5);
    const used = c0 - bat.charge; if (!(used > 8 && used < 13)) bad.push('discharged ' + used.toFixed(1) + ' kJ in 5 s (want about 10.5)');
    if (!(netOf(G.pole).sat >= 0.999) || !allPowered(G, 0.999)) bad.push('the battery did not hold the grid at full power: ' + netOf(G.pole).sat);
    if (PP.lampOf(g, bat) !== 'orange') bad.push('discharging lamp ' + PP.lampOf(g, bat));
    // flat: back to a brownout
    bat.charge = 1; adv(2.5); if (bat.charge !== 0) bad.push('not flat: ' + bat.charge);
    adv(1); const sat = netOf(G.pole).sat; if (!near(sat, 8 / 10.1, 0.02)) bad.push('brownout after it ran flat: sat ' + sat);
    if (PP.lampOf(g, bat) !== 'grey') bad.push('idle lamp ' + PP.lampOf(g, bat));
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.battery-marks-and-the-charge-rate-limit', async () => {
    reset(); const bad = [];
    if (PP.BATT_CAP.join() !== '0,36000,360000,3600000') bad.push('capacities ' + PP.BATT_CAP);
    const G = grid(-8, 3, { gens: 3, fans: 0 }); const b1 = part('battery', -8, 5.4, { mark: 1 }); adv(5);   // 24 kW of surplus, a Mk1 takes at most 20
    if (!near(b1.cache.flow, 20, 0.05)) bad.push('Mk1 rate ' + b1.cache.flow + ' (want 20)');
    if (!near(b1.charge, 100, 8)) bad.push('Mk1 charge ' + b1.charge);
    const b3 = part('battery', -7, 5.4, { mark: 3 }); adv(3);   // a Mk3 takes cap/1800 = 2,000 kW: it soaks the rest, shared by capacity
    if (!(b3.cache.flow > b1.cache.flow)) bad.push('Mk3 should charge faster than Mk1: ' + b3.cache.flow + ' vs ' + b1.cache.flow);
    const share = (b1.cache.flow + b3.cache.flow); if (!near(share, 24 - netOf(G.pole).demand, 0.3)) bad.push('the surplus should be shared out: ' + share);
    // full stops charging
    b1.charge = 36000 - 5; b3.charge = 3600000; adv(2); if (b1.charge !== 36000) bad.push('Mk1 did not fill to its cap: ' + b1.charge); if (b1.cache.flow !== 0) bad.push('full battery flow ' + b1.cache.flow);
    // a brand new battery clamps a bad charge
    const e = { type: 'battery', mark: 2, charge: 9e9 }; PP.normalize(e); if (e.charge !== 360000) bad.push('normalize clamp ' + e.charge);
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.battery-empty-trips', async () => {
    reset(); const G = grid(-8, 3, { gens: 1, fans: 6 }), br = part('breaker', -8, 5.4), bat = part('battery', -7.4, 5.4, { mark: 1, charge: 20 }); const bad = [];
    adv(2); if (br.tripped) bad.push('tripped while a charged battery covered the load'); if (!(netOf(G.pole).sat >= 0.999)) bad.push('sat ' + netOf(G.pole).sat + ' while the battery covers');
    adv(5); if (!(bat.charge < 1)) bad.push('battery not flat yet: ' + bat.charge);
    adv(3.5); if (!br.tripped) bad.push('empty battery, grid still over its rating: no trip');
    if (netOf(G.pole).sat !== 0) bad.push('a tripped grid supplies nothing');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.battery-covers-priority-shedding-until-it-is-flat', async () => {
    const R = branches([1, 1, 2], [1, 2, 3], undefined, () => part('battery', -12, 5.4, { mark: 1, charge: 40 })); const bat = R.pre; adv(1.5); const bad = [];
    if (R.S.some((s) => s.shed)) bad.push('shed while the battery was covering: ' + kinds(R.S));
    adv(25); if (!R.S[2].shed) bad.push('the group 3 switch did not shed once the battery was flat: ' + kinds(R.S) + ' charge ' + bat.charge);
    return bad.length === 0 || bad.join(' | ');
  });

  // ------------------------------------------------------------------ meter
  await T('power.meter-history-ring', async () => {
    reset(); const G = grid(-8, 3, { gens: 1, fans: 2 }), m = part('meter', -4, 6); wire(m, G.pole); adv(1); const bad = [];
    const net = netOf(G.pole), ring = net.hist; if (!ring) return 'the grid has no history ring';
    adv(70); if (ring.len !== 120) bad.push('ring holds ' + ring.len + ' samples after 70 s (want 120 = 60 s at 0.5 s)');
    const s = ring.series('s'), d = ring.series('d'); if (s.length !== 120 || d.length !== 120) bad.push('series length');
    if (!(s.every((v) => near(v, 8, 0.01)))) bad.push('supply history ' + s.slice(0, 3));
    if (!(d.every((v) => near(v, 4.02, 0.01)))) bad.push('demand history ' + d.slice(0, 3) + ' (2 fans + meter)');
    // the ring survives a recompute and follows the grid when the load changes
    g.power.markDirty(); adv(0.1); if (netOf(G.pole).hist !== ring) bad.push('a recompute replaced the ring');
    G.addFans(1); adv(5); const d2 = ring.series('d'); if (!near(d2[d2.length - 1], 6.02, 0.01)) bad.push('new demand not in the ring: ' + d2[d2.length - 1]);
    if (!near(d2[0], 4.02, 0.01)) bad.push('old samples lost');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.meter-draws-its-face-and-needs-a-grid', async () => {
    reset(); const G = grid(-8, 3, { gens: 1, fans: 1, hub: false }), m = part('meter', -4, 6), bad = [];
    const it = g.machines.items.get(m.id), cv = it.obj.userData.cv; if (!cv) return 'no canvas on the meter mesh';
    ctx.p().pos.set(-6, 0, 6); adv(1.2); if (!(it.obj.userData.tex)) bad.push('no texture');
    if ((m.pw || 0) !== 0) bad.push('an unwired meter far from a pole should be dark: ' + m.pw);
    if (PP.lampOf(g, m) !== 'red') bad.push('unpowered lamp ' + PP.lampOf(g, m));
    wire(m, G.pole); adv(1.2); if (!(m.pw > 0.99) || PP.lampOf(g, m) !== 'green') bad.push('wired meter not live: ' + m.pw);
    // the face is real pixels, not blank
    const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i] > 120 || px[i + 1] > 120) lit++;
    if (lit < 80) bad.push('the meter face is blank (' + lit + ' lit pixels)');
    return bad.length === 0 || bad.join(' | ');
  });

  // ------------------------------------------------------------------ demand and nodes
  await T('power.part-demand-kw-and-batteries-and-breakers-join-by-cable', async () => {
    reset(); const bad = [];
    for (const [k, v] of Object.entries({ switch: 0.05, breaker: 0.1, battery: 0.1, meter: 0.02, pswitch: 0.08 })) if (PP.KW[k] !== v || DEMAND[k] !== v) bad.push(`kW ${k}: parts ${PP.KW[k]}, power.js ${DEMAND[k]}`);
    const G = grid(-8, 3, { gens: 1, fans: 0 }), br = part('breaker', -8, 5.4), bat = part('battery', -7, 5.4), mt = part('meter', -9.4, 5.4); adv(1);
    const net = netOf(G.pole); if (!near(net.demand, 0.1 + 0.1 + 0.02, 1e-6)) bad.push('demand ' + net.demand + ' want 0.22');
    if (!net.nodes.includes(br) || !net.nodes.includes(bat)) bad.push('breaker and battery should be nodes of the grid they are wired to');
    if (net.nodes.includes(mt) || !((mt.pw || 0) > 0.99)) bad.push('the meter is a machine fed by its cable: pw ' + mt.pw);
    const sw = part('switch', -3, 8); const ps = part('switch', -2, 8, { prio: 2 }); wire(sw, G.pole); wire(ps, G.pole); adv(0.5);
    if (!near(netOf(G.pole).demand, 0.22 + 0.05 + 0.08, 1e-6)) bad.push('switch demand: ' + netOf(G.pole).demand);
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.nothing-changes-without-the-new-parts', async () => {
    reset({ power: 1, belts: 1, fans: 1 }, false); const G = grid(-8, 3, { gens: 1, fans: 6 }); adv(3);
    const net = netOf(G.pole), bad = [];
    if (!near(net.sat, 8 / 12, 0.01) || net.tripped || net.batts.length || net.breakers.length) bad.push('plain grid changed: ' + JSON.stringify({ sat: net.sat, t: net.tripped }));
    if (net.supply !== 8 || net.demand !== 12 || net.cap !== 8) bad.push(`supply ${net.supply} demand ${net.demand} cap ${net.cap}`);
    { const row = g.power.packRow(); if (!row || row.e.length !== 0) bad.push('a row with part entries is sent with no power parts: ' + JSON.stringify(row && row.e)); }   // (the grids themselves are sent: a guest reads them)
    reset({ power: 1 }, false); if (g.power.packRow() !== null) bad.push('a row is sent with no grids at all');
    return bad.length === 0 || bad.join(' | ');
  });
}
