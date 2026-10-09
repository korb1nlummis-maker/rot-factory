// gaps.ach.*: achievements for the Satisfactory waves (rail, power parts, belt marks and lifts, the build shell, furnish, transit, arches, the vehicle scanner, cables).
// Every counter is fed by the real action (the placement tool path, a ride, a trip of a breaker, a crossing of an arch) and every new row unlocks exactly at its number
// through the game's own unlock path (g.checkAchievements).
import { makeRail } from './rail_lib.js';
import { makeKit } from './power_lib.js';
import { makeKit as makeAddons } from './addons_lib.js';
import { makeShell } from './build_lib.js';
import { makeFurnKit } from './furnish_lib.js';
import { ACHIEVEMENTS, ACH_TABLE } from '../achievements.js';
import { TYPES } from '../catalog.js';
import * as EXT from '../ext.js';
import * as D from '../detector.js';
import * as B from '../build.js';

const WAVE_KEYS = ['railLaid', 'railRides', 'railHomes', 'railMeters', 'railHauled', 'pwSwitches', 'pwBreakers', 'pwTrips', 'pwBatteries', 'beltLifts', 'beltUgs', 'shellPieces', 'levelPads',
  'furnPieces', 'furnLights', 'doorsBuilt', 'platformLifts', 'jumpPads', 'archBuilt', 'archHits', 'vscans', 'vscanAlarms', 'cables'];

export default async function (ctx) {
  const { T, g, S, w, p, L, adv, V3, craft, plan, fresh, toI, toK, cellX, cellZ } = ctx;
  const X = makeRail(ctx), R = X.R, P = makeKit(ctx);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { X.clean(); g.keys = {}; g.stowed = true; } });
  const stat = (k) => S().stats[k] || 0;
  const reset = () => { for (const k of WAVE_KEYS) delete S().stats[k]; };
  const idle = (car) => car.st !== 'run' && (car.spd || 0) === 0;
  const sit = (car) => { p().pos.set(car.x - 1.0, car.y, car.z); p().vel.set(0, 0, 0); return R.useCar(g, car, 'host'); };
  const key = (code) => ({ code, preventDefault() {}, target: document.body, repeat: false, shiftKey: false });
  const press = (code) => { g.onKey(key(code), true); g.onKey(key(code), false); };

  await guard('gaps.ach.every-new-counter-has-a-row-and-a-producer', async () => {
    const bad = [];
    for (const k of WAVE_KEYS) if (!ACH_TABLE.some((r) => r.key === k)) bad.push(`no achievement reads ${k}`);
    // the tool kinds whose placement adds to a counter (ext.buildTool): the wave's catalog handlers say which
    const want = { rail: 'railLaid', railstn: 'railStns', railcar: 'railCarts', levelpad: 'levelPads', lift: 'beltLifts', ug: 'beltUgs', arch: 'archBuilt', door: 'doorsBuilt', plift: 'platformLifts', jump: 'jumpPads', clamp: 'furnLights', sign: 'furnPieces', silo: 'furnPieces' };
    for (const [kind, k] of Object.entries(want)) { const h = TYPES[kind]; if (!h || ![].concat(h.stat || []).includes(k)) bad.push(`${kind} does not count ${k}`); }
    const NEW_IDS = ['rail1', 'ride1', 'rushhome1', 'railm1k', 'railhaul100', 'pwsw1', 'pwbrk1', 'pwtrip1', 'pwbat1', 'lift1', 'ug1', 'beltmk1', 'genrung1', 'lines1', 'shell1', 'lvlpad1', 'furn1', 'furnlit1', 'door1', 'plift1', 'jump1', 'arch1', 'archhit1', 'vscan1', 'vsalarm1', 'cable1'];
    for (const id of NEW_IDS) if (!ACHIEVEMENTS.some((a) => a.id === id)) bad.push('missing achievement ' + id);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.ach.a-tool-placement-adds-to-the-handlers-counters-and-a-quiet-test-placement-does-not', async () => {
    fresh({}); reset(); const bad = [];
    TYPES.gapstat = { add: () => ({}), stat: ['gapA', 'gapB'], build: (gg, tool, e) => ({ type: 'gapstat', x: e.x, y: 0, z: e.z }), plan: () => null };
    try {
      const e = EXT.buildTool(g, { kind: 'gapstat', id: 'gapstat' }, { x: -4, z: 1 });
      if (!e || stat('gapA') !== 1 || stat('gapB') !== 1) bad.push('counters after one placement: ' + stat('gapA') + ' ' + stat('gapB'));
      g.placeEntity('gapstat', { x: -3, y: 0, z: 1 }, { quiet: true }); if (stat('gapA') !== 1) bad.push('a quiet placement counted');
    } finally { for (const e of S().entities.filter((x) => x.type === 'gapstat')) { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } } S().entities = S().entities.filter((x) => x.type !== 'gapstat'); delete TYPES.gapstat; delete S().stats.gapA; delete S().stats.gapB; }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.ach.rail-pieces-stations-and-carts-count-when-set-down-with-the-tool', async () => {
    X.setup(); reset(); const bad = [], k = X.ck(-2.2), i0 = X.ci(-12);
    craft('rail', 12); X.equip('rail'); X.aimAtCell(i0, k); let pl = await plan(); if (!pl || !pl.ok) return 'no plan ' + (pl && pl.why); g.placeCurrent(g.curTool());
    g.keys.KeyB = true; g.lastPaint = ''; for (let n = 1; n <= 5; n++) { X.aimAtCell(i0 + n, k); g.updateBuild(g.curTool(), p().eyePos(new V3()), p().forward(new V3())); } g.keys.KeyB = false;
    const laid = X.ents('rail').length; if (laid < 6 || stat('railLaid') !== laid) bad.push(`laid ${laid}, counted ${stat('railLaid')}`);
    craft('railstn', 1); X.equip('railstn'); X.aimAtCell(i0 + 2, k); pl = await plan(); if (!pl.ok) return 'station plan ' + pl.why; g.placeCurrent(g.curTool());
    craft('railcar', 1); X.equip('railcar'); X.aimAtCell(i0 + 4, k); pl = await plan(); if (!pl.ok) return 'cart plan ' + pl.why; g.placeCurrent(g.curTool());
    if (stat('railStns') !== 1 || stat('railCarts') !== 1) bad.push(`stations ${stat('railStns')} carts ${stat('railCarts')}`);
    // the achievement at its number, through the real unlock path
    S().ach = {}; S().stats.railLaid = 0; g.checkAchievements(); if (S().ach.rail1) bad.push('rail1 from nothing'); S().stats.railLaid = 1; g.checkAchievements(); if (!S().ach.rail1) bad.push('rail1 not unlocked at 1');
    S().stats.railLaid = 99; g.checkAchievements(); if (S().ach.rail100) bad.push('rail100 at 99'); S().stats.railLaid = 100; g.checkAchievements(); if (!S().ach.rail100) bad.push('rail100 not unlocked at 100');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.ach.a-ride-counts-meters-rides-and-the-rush-home', async () => {
    X.setup(); reset(); const bad = [], s = X.std(), car = s.car; adv(0.6);
    sit(car); const m0 = stat('railMeters'); const x0 = car.x;
    press('Backspace'); if (car.st !== 'run') return 'the cart did not start: ' + car.st;
    X.until(() => idle(car), 25); const len = Math.abs(car.x - x0);
    const meters = stat('railMeters') - m0; if (Math.abs(meters - len) > len * 0.12 + 0.5) bad.push(`meters ${meters.toFixed(1)} for a ${len.toFixed(1)} m ride`);
    if (stat('railRides') !== 1) bad.push('rides after the first trip: ' + stat('railRides'));
    if (stat('railHomes') !== 1) bad.push('rush homes after riding to the base: ' + stat('railHomes'));
    // and back out to the face: a ride, not a rush home
    press('Backspace'); X.until(() => idle(car), 25);
    if (stat('railRides') !== 2) bad.push('rides after the second trip: ' + stat('railRides')); if (stat('railHomes') !== 1) bad.push('a trip to the face counted as a rush home: ' + stat('railHomes'));
    // a short shuffle (under 3 m) is not a ride
    R.unseat(g, car, 'host'); const before = stat('railRides'); sit(car); R.dispatch(g, car, car.a === R.keyOf(s.face) ? R.keyOf(s.face) + 1 : car.a); adv(0.3); X.until(() => idle(car), 5);
    if (stat('railRides') !== before) bad.push('a 0 m shuffle counted as a ride');
    // the achievements at their numbers
    for (const [id, k, n] of [['ride1', 'railRides', 1], ['ride25', 'railRides', 25], ['rushhome1', 'railHomes', 1], ['railm1k', 'railMeters', 1000]]) {
      S().ach = {}; S().stats[k] = n - 1; g.checkAchievements(); if (S().ach[id]) bad.push(`${id} at ${n - 1}`); S().stats[k] = n; g.checkAchievements(); if (!S().ach[id]) bad.push(`${id} not unlocked at ${n}`);
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.ach.plush-sold-from-a-cart-count-as-hauled', async () => {
    X.setup(); reset(); const bad = [], s = X.std(), car = s.car; adv(0.6);
    for (let n = 0; n < 9; n++) car.cargo.push({ sp: 3, vr: 0 }); car.n = 9;
    R.dispatch(g, car, R.keyOf(s.base)); X.until(() => idle(car) && car.cargo.length === 0, 40);
    if (car.cargo.length) bad.push('the cart did not sell its load: ' + car.cargo.length + ' left'); if (stat('railHauled') !== 9) bad.push('hauled ' + stat('railHauled'));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.ach.switch-breaker-battery-and-a-trip-count', async () => {
    P.reset(); reset(); const bad = [], K = makeAddons(ctx);
    for (const [id, k] of [['switch', 'pwSwitches'], ['breaker', 'pwBreakers'], ['battery:1', 'pwBatteries']]) {
      const r = await K.put(id, { x: -6 + (id === 'breaker' ? 2 : id === 'battery:1' ? 4 : 0), z: 3 }); if (!r.ok) { bad.push(id + ' not placed: ' + r.why); continue; }
      if (stat(k) !== 1) bad.push(`${id}: ${k} is ${stat(k)}`);
    }
    // a breaker that trips counts once per trip
    P.reset(); const G = P.grid(-8, 3, { gens: 1, fans: 6 }), br = P.part('breaker', -8, 5.4); const t0 = stat('pwTrips'); adv(4); if (!br.tripped) bad.push('the breaker did not trip'); else if (stat('pwTrips') !== t0 + 1) bad.push('trips counted ' + (stat('pwTrips') - t0));
    void G;
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.ach.pads-and-the-leveling-pad-count-per-piece', async () => {
    const SH = makeShell(ctx); SH.setup(); reset(); const bad = [];
    try {
      const i = toI(-14), k = toK(2); g._bz = { n: 3, w: 1 };
      const r = await SH.put('pad:timber', i, k, { back: 2.2 }); if (!r.ok) return 'pad: ' + r.why;
      const pieces = S().entities.filter((e) => e.type === 'pad').length; if (!(pieces >= 1) || stat('shellPieces') !== pieces) bad.push(`pieces ${pieces}, counted ${stat('shellPieces')}`);
      g._bz = { n: 1, w: 1 }; const lv = await SH.put('levelpad', toI(-14), toK(8), { back: 2.2 }); if (!lv.ok) bad.push('levelpad: ' + lv.why); else if (stat('levelPads') !== 1) bad.push('levelPads ' + stat('levelPads'));
    } finally { SH.clean(); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.ach.furnish-pieces-and-lights-count', async () => {
    const F = makeFurnKit(ctx); F.reset(); reset(); const bad = [];
    const a = await F.onFloor('sign', -9, 2); if (!a.ok) return 'sign: ' + a.why;
    if (stat('furnPieces') !== 1 || stat('furnLights')) bad.push(`a sign: pieces ${stat('furnPieces')} lights ${stat('furnLights')}`);
    const b = await F.onFloor('clamp', -11, 2); if (!b.ok) return 'lamp: ' + b.why;
    if (stat('furnPieces') !== 2 || stat('furnLights') !== 1) bad.push(`a lamp: pieces ${stat('furnPieces')} lights ${stat('furnLights')}`);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.ach.an-arch-match-counts-a-hit-and-a-miss-does-not', async () => {
    const K = makeAddons(ctx); K.clearBay(); fresh({ detector: 1, archGate: 1, power: 1, belts: 1 }); reset(); const bad = [];
    const lat = toI(-9), m = toK(2), S_ = D.SIZES[1]; const l = D.layout(g, 1, 'z', m, lat - (S_.w / 2 - 1), 0); if (!l.ok) return 'layout ' + l.why;
    const arch = g.placeEntity('arch', { ...l.ent, mode: 'species', target: 7 }, { quiet: true });
    const walk = (carry) => { const s = D.archState(arch); s.in = false; s.along = null; s.cd = 0; S().carry = carry; p().vel.set(0, 0, 0); p().pos.set(arch.cx, 0, arch.cz - 1.5); g.playerGateScan(0.05); p().pos.set(arch.cx, 0, arch.cz); g.playerGateScan(0.05); p().pos.set(arch.cx, 0, arch.cz + 1.5); g.playerGateScan(0.05); };
    walk([{ sp: 9, vr: 0 }]); if (stat('archHits')) bad.push('a miss counted as a hit');
    walk([{ sp: 7, vr: 0 }]); if (stat('archHits') !== 1) bad.push('a match counted ' + stat('archHits'));
    walk([]); if (stat('archHits') !== 1) bad.push('an empty bag counted');
    S().carry = []; g.doDecon({ kind: 'mach', id: arch.id });
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.ach.a-cable-counts', async () => {
    P.reset(); reset(); const bad = [], G = P.grid(-8, 3, { gens: 1, fans: 1, hub: false }), far = P.mach('strip', -4, 3, { y: 1, h: 0.1, mount: 'ceiling', dir: 0, mode: 'on' });
    const c0 = stat('cables'); S().items.cable = 1; const r = g.cables.connect(G.pole.id, far.id); if (!r.ok) return r.why; if (stat('cables') !== c0 + 1) bad.push('cables ' + stat('cables') + ' after one more than ' + c0);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.ach.every-new-row-unlocks-exactly-at-its-number-through-the-real-unlock-path', async () => {
    fresh({}); const bad = [];
    const NEWKEYS = new Set(WAVE_KEYS);
    for (const row of ACH_TABLE) {
      if (row.kind === 'stat' && !NEWKEYS.has(row.key)) continue;
      if (row.kind !== 'stat' && !['beltmk1', 'beltmk3', 'beltmk5', 'genrung1', 'genrung2', 'genrung4', 'lines1', 'lines8', 'lines16', 'lines25'].includes(row.id)) continue;
      const set = (v) => { if (row.kind === 'stat') S().stats[row.key] = v; else row.set(S(), v); };
      S().ach = {}; S().stats = { ...S().stats }; set(row.n - 1); g.checkAchievements(); if (S().ach[row.id]) bad.push(`${row.id} unlocked at ${row.n - 1}`);
      set(row.n); g.checkAchievements(); if (!S().ach[row.id]) bad.push(`${row.id} not unlocked at ${row.n}`);
      set(0);
    }
    S().up = {}; S().ach = {};
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  });
}
