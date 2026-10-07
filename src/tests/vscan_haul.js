// vscan.*: what the Vehicle Scanner does to vehicles (src/vehiclescan.js with the truck and digger rules in src/earth.js).
// Haul Trucks route through the nearest powered scanner, stop under it, and a load that holds The One is dumped at the arch with the alarm; the diggers
// scoop The One but keep it aboard; a truck with The One and no scanner refuses to leave. Run: `await __selftest('vscan.')`
import * as VS from '../vehiclescan.js';
import { EARTH, STATES, earthRow, applyEarthRow, sellBatch, spillEarth, useEarth, earthTune } from '../earth.js';
import { infoFor } from '../info.js';
import { NEEDLE } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, fresh, tiles, toI, toK, cellX, cellZ, newWorld, clearBodies, sim } = ctx;
  const UP = { power: 1, belts: 1, sorter: 1, vault: 1, fans: 1, mfan: 1, mech: 1, claw: 1, borer: 1, borerSize: 2, mechBuf: 3, beltSpeed: 6, steel: 1, timber: 1, concrete: 1, depots: 1, bag: 4, excavator: 1, dozer: 1, wheel: 1, truck: 1, detector: 1, archGate: 1, archGiant: 1, vscan: 1 };
  const bin = () => g.hall.binPos;
  const mkEarth = (kind, i, k, extra = {}) => {
    const spec = EARTH[kind];
    const ent = { id: g.nextId(), type: kind, i, j: 0, k, dx: 1, dz: 0, x: cellX(i), y: 0, z: cellZ(k), hy: spec.hy, hr: spec.hr, ...(spec.dig ? { hop: [], hn: 0, steps: 0, dug: 0, state: 'idle' } : { px: cellX(i), pz: cellZ(k), cargo: [], cn: 0, route: [], seg: 0, trips: 0, state: 'idle', job: 0, yaw: 0 }), ...extra };
    S().entities.push(ent); g.addEntity(ent); return ent;
  };
  const gone = (e) => { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } S().entities = S().entities.filter((x) => x.id !== e.id); w().supports = w().supports.filter((s) => s.id !== 'shield' + e.id); };
  const clearAt = (x, z, axis = 'x') => { const i0 = toI(x), k0 = toK(z); for (let a = -8; a <= 8; a++) for (let b = -8; b <= 8; b++) for (let j = 0; j < 13; j++) { const i = i0 + (axis === 'z' ? a : b), k = k0 + (axis === 'z' ? b : a); if (w().get(i, j, k)) w().removeCell(i, j, k, false); } };
  // a scanner on the truck road: vehicles drive along `axis`
  const scanner = (x, z, axis = 'x', extra = {}) => {
    clearAt(x, z, axis); const lat = axis === 'z' ? toI(x) : toK(z), m = axis === 'z' ? toK(z) : toI(x);
    const l = VS.layout(g, axis, m, lat - 5, 0); if (!l.ok) throw new Error('layout: ' + l.why);
    return g.placeEntity('vscan', { ...l.ent, ...extra });
  };
  const off = new Set();
  const run = (secs, dt = 0.1, each = null) => {
    for (let n = 0; n < secs / dt; n++) {
      for (const it of g.machines.items.values()) it.ent.pw = off.has(it.ent.id) ? 0 : 1;
      for (const t of tiles()) t.pw = 1;
      g.time += dt; g.machines.update(dt, g.time); L().update(dt); if (each) each(n);
    }
  };
  const until = (cond, secs = 90, dt = 0.1) => { let t = 0; while (t < secs && !cond()) { run(dt, dt); t += dt; } return cond(); };
  // the yard 6 m from the bin, a digger 45 m out with a full-ish hopper (plush of species 3), and optionally The One at the front of it
  const site = (o = {}) => {
    const b = bin(), n = o.n ?? 240, tk = mkEarth('truck', toI(b.x + 6), toK(b.z + 8)), dg = mkEarth('excavator', toI(b.x + 45), toK(b.z + 8));
    const hop = []; if (o.one) hop.push(NEEDLE, 0); for (let q = 0; q < n - (o.one ? 1 : 0); q++) hop.push(3, 0); dg.hop = hop; dg.hn = hop.length / 2;
    return { tk, dg, b };
  };
  const scans2 = () => [...g.machines.items.values()].map((i) => i.ent).filter((e) => e.type === 'vscan');
  const tags = (e) => (e.route || []).map((r) => r[2] || '-').join(',');
  const toasts = [];
  const watchToasts = () => { const t0 = g.ui.toast.bind(g.ui); g.ui.toast = (o) => { toasts.push(o.title + ' | ' + (o.text || '')); return t0(o); }; return () => { g.ui.toast = t0; }; };
  const rec = () => { const calls = [], keep = {}; for (const k of ['tone', 'noise', 'thump', 'found']) keep[k] = g.sound[k]; g.sound.tone = (...a) => calls.push(['tone', ...a]); g.sound.noise = (...a) => calls.push(['noise', ...a]); g.sound.thump = (...a) => calls.push(['thump', ...a]); g.sound.found = (...a) => calls.push(['found', ...a]); return { calls, off: () => { for (const k of Object.keys(keep)) g.sound[k] = keep[k]; } }; };
  const guard = (name, fn) => T(name, async () => {
    const fn0 = g.foundNeedle, mode0 = g.mode, tt = toasts.length; toasts.length = 0; off.clear();
    const stop = watchToasts();
    try { g.mode = 'play'; await newWorld(); fresh(UP); S().money = 1e12; clearBodies(); return await fn(); }
    finally { stop(); g.foundNeedle = fn0; g.mode = mode0 === 'ended' ? 'play' : mode0; S().found = false; S().ending = null; S().needleLost = false; g.net.open = false; g.net.role = null; g.guestReady = false; delete g.netSend; g.alarmGate = null; off.clear(); clearBodies(); void tt; }
  });
  const wins = () => { const w0 = { n: 0, src: [] }; g.foundNeedle = (src) => { w0.n++; w0.src.push(src); }; return w0; };

  // ---------------------------------------------------------------- routing
  await guard('vscan.a-truck-routes-through-the-nearest-powered-scanner-on-its-way-to-the-bin', async () => {
    const bad = [], { tk, dg } = site();
    const a = scanner(cellX(toI(bin().x + 25)), cellZ(toK(bin().z + 8)), 'x'), far = scanner(bin().x + 25, bin().z + 48, 'x');
    if (!until(() => tk.job, 20)) return 'the truck never took the job';
    if (tags(tk) !== 'dig,scanA,scan,scanC,sink,home') bad.push('route tags ' + tags(tk));
    if (tk.sc !== a.id) bad.push(`routed through ${tk.sc}, the near scanner is ${a.id} (far one ${far.id})`);
    const r = tk.route; const side = (r[0][0] - a.cx) > 0 ? 1 : -1;
    if (Math.abs(r[1][0] - (a.cx + side * VS.REACH)) > 1e-6 || Math.abs(r[2][0] - a.cx) > 1e-6 || Math.abs(r[3][0] - (a.cx - side * VS.REACH)) > 1e-6 || Math.abs(r[2][1] - a.cz) > 1e-6) bad.push('waypoints do not line up through the plane: ' + JSON.stringify(r.slice(1, 4)));
    if (r[1][2] !== 'scanA' || Math.sign(r[1][0] - a.cx) !== Math.sign(r[0][0] - a.cx)) bad.push('the truck would reverse through the arch');
    // the near one without power: the far one is the only powered scanner, the truck takes it
    off.add(a.id); tk.state = 'idle'; tk.route = []; tk.seg = 0; tk.job = 0; tk.px = tk.x; tk.pz = tk.z; run(0.2); if (!until(() => tk.job, 20)) bad.push('no second job'); else if (tk.sc !== far.id) bad.push('with the near one dark the truck picked ' + tk.sc);
    // nothing powered: the old straight route with no scanner at all
    off.add(far.id); tk.state = 'idle'; tk.route = []; tk.seg = 0; tk.job = 0; tk.px = tk.x; tk.pz = tk.z; run(0.2); if (!until(() => tk.job, 20)) bad.push('no third job'); else if (tags(tk) !== 'dig,sink,home' || tk.sc) bad.push('no scanner but ' + tags(tk));
    void dg; return bad.length === 0 || bad.join(' || ');
  });

  await guard('vscan.a-scanner-too-far-from-the-digger-for-the-radio-is-not-used', async () => {
    const bad = [], { tk } = site(); scanner(bin().x + 25, bin().z + 3000 % 1, 'x'); const far = scanner(bin().x + 25, bin().z + 600, 'x');
    for (const e of [far]) off.add(e.id);
    until(() => tk.job, 20); if (/scan/.test(tags(tk)) && tk.sc === far.id) bad.push('used a scanner 600 m off the road');
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- a clean load
  await guard('vscan.a-clean-load-stops-under-the-arch-is-scanned-with-a-soft-tick-and-is-sold', async () => {
    const bad = [], { tk } = site(), a = scanner(bin().x + 25, bin().z + 8, 'x'); const money0 = S().money, r = rec(); const seen = new Set(); let held = 0, at = null;
    try {
      until(() => { seen.add(tk.state); if (tk.state === 'scan') { held++; at = [tk.px, tk.pz]; } return tk.trips >= 1 && tk.state === 'idle'; }, 120);
    } finally { r.off(); }
    if (!seen.has('scan')) bad.push('never stopped to scan: ' + [...seen]);
    if (held < 10 || held > 14) bad.push(`stood under the arch for ${held / 10} s`);
    if (!at || Math.abs(at[0] - a.cx) > 1e-6 || Math.abs(at[1] - a.cz) > 1e-6) bad.push('scanned away from the plane: ' + JSON.stringify(at));
    if (a.loads !== 1 || S().stats.vscans !== 1) bad.push(`loads ${a.loads}, stat ${S().stats.vscans}`);
    if (S().money <= money0 || S().stats.hauled !== 240 || tk.trips !== 1) bad.push(`not sold: money ${S().money - money0}, hauled ${S().stats.hauled}, trips ${tk.trips}`);
    if (a.alarm || a.held || g.alarmGate) bad.push('an alarm for a clean load');
    const ticks = r.calls.filter((c) => c[0] === 'tone' && c[1] === 'sine' && c[2] === 700); if (!ticks.length) bad.push('no soft tick: ' + JSON.stringify(r.calls.slice(0, 4)));
    if (r.calls.some((c) => c[0] === 'tone' && (c[1] === 'square' || c[1] === 'sawtooth')) || r.calls.some((c) => c[0] === 'found')) bad.push('a clean load sounded like an alarm');
    if (S().stats.vscanDumped) bad.push('dumped a clean load');
    if (VS.scanState(a).last.kind !== 'clear' || VS.scanState(a).last.n !== 240) bad.push('last scan ' + JSON.stringify(VS.scanState(a).last));
    if (tk.px !== tk.x || tk.pz !== tk.z) bad.push('the truck did not get home');
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- The One in a load
  await guard('vscan.the-one-aboard-dumps-the-whole-load-at-the-arch-and-the-scanner-holds-it-with-the-alarm', async () => {
    const bad = [], { tk } = site({ one: true }), a = scanner(bin().x + 25, bin().z + 8, 'x'), win = wins(); const money0 = S().money, hauled0 = S().stats.hauled || 0, r = rec(); const seen = new Set(); let dumpAt = null, alarmAtDump = null;
    try {
      until(() => { seen.add(tk.state); if (tk.state === 'dump' && !dumpAt) { dumpAt = [tk.px, tk.pz]; alarmAtDump = a.alarm; } return tk.state === 'idle' && tk.job === 0 && seen.has('dump'); }, 120);
    } finally { r.off(); }
    if (!seen.has('scan') || !seen.has('dump')) bad.push('states ' + [...seen]);
    if (!dumpAt || Math.abs(dumpAt[0] - a.cx) > 1e-6 || Math.abs(dumpAt[1] - a.cz) > 1e-6) bad.push('dumped away from the arch: ' + JSON.stringify(dumpAt));
    if (!a.alarm || !a.held || a.held.sp !== NEEDLE || !alarmAtDump) bad.push('alarm ' + JSON.stringify([a.alarm, a.held, alarmAtDump]));
    if (g.alarmGate !== a) bad.push('the alarm is not registered for the warning beacon and the markers');
    if (tk.cargo.length || tk.cn) bad.push('the bed is not empty: ' + tk.cn);
    if (sim().count !== 239) bad.push(`${sim().count} loose plush on the ground, expected the whole load of 239 (The One is held, not dumped)`);
    if (S().stats.vscanDumped !== 239) bad.push('dump stat ' + S().stats.vscanDumped);
    for (let q = 0; q < sim().n; q++) if (sim().sp[q] === NEEDLE) bad.push('The One is among the loose plush');
    for (let q = 0; q < sim().n; q++) { const dx = sim().x[q] - a.cx, dz = sim().z[q] - a.cz; if (Math.hypot(dx, dz) > 6) { bad.push('plush landed ' + Math.hypot(dx, dz).toFixed(1) + ' m from the arch'); break; } }
    if (S().money !== money0 || (S().stats.hauled || 0) !== hauled0) bad.push('the dumped load was sold');
    if (S().needleLost || S().found || win.n) bad.push('The One was lost or won early: ' + JSON.stringify([S().needleLost, S().found, win.n]));
    if (!r.calls.some((c) => c[0] === 'found')) bad.push('no found fanfare for the alarm');
    const tn = r.calls.filter((c) => c[0] === 'tone'); if (!tn.some((c) => c[1] === 'triangle' && c[2] === 988)) bad.push('no da-ding');
    if (!toasts.some((t) => /VEHICLE SCANNER ALARM/.test(t) && /Go to the arch and press E/.test(t))) bad.push('no alarm toast: ' + toasts.join(' / '));
    if (S().dex[NEEDLE] === undefined) bad.push('The One not registered');
    if (tk.state !== 'idle' || tk.px !== tk.x) bad.push('the empty truck did not drive home: ' + tk.state);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('vscan.the-alarm-lights-the-compass-and-the-warning-beacon-and-taking-it-with-e-wins-and-clears-it', async () => {
    const bad = [], a = scanner(bin().x + 25, bin().z + 8, 'x'), win = wins();
    VS.raise(g, a, { sp: NEEDLE, vr: 0 }); if (!a.alarm || !a.held) return 'no alarm';
    // the compass shows a !! marker for it
    const sc0 = g.ui.setCompass.bind(g.ui), seen = []; g.ui.setCompass = (on, h, m, r) => { seen.push(m || []); return sc0(on, h, m, r); };
    try { g.T.compass = true; p().pos.set(a.cx - 10, 0, a.cz); for (let n = 0; n < 6; n++) { g.time += 0.05; g.updatePlay(0.05); } } finally { g.ui.setCompass = sc0; }
    if (!seen.some((m) => m.some((x) => x.label === '!!' && x.color === '#ff4d4d'))) bad.push('no !! marker on the compass: ' + JSON.stringify(seen.slice(-1)));
    const info = infoFor(g, { kind: 'mach', id: a.id }); if (info.lit || !/^ALARM/.test(info.lines[0])) bad.push('readout: ' + info.lines[0]);
    // E with The One held: the pick up (the win, like a gate)
    p().pos.set(a.cx - 3, 0, a.cz); const used = VS.use(g, a); if (used !== true) bad.push('use did not run');
    if (a.alarm || a.held || g.alarmGate) bad.push('the alarm did not clear: ' + JSON.stringify([a.alarm, a.held, !!g.alarmGate]));
    if (!S().found && win.n !== 1 && S().ending !== 'plush') bad.push('taking The One was not the win: ' + JSON.stringify([S().found, win.n, S().ending]));
    // E with no alarm only tells the state
    const a2 = scanner(bin().x + 25, bin().z + 20, 'x'); a2.pw = 1; g.ui.hint('', 0); VS.use(g, a2); if (!/all clear|no power/i.test(document.getElementById('hint').textContent)) bad.push('quiet E said: ' + document.getElementById('hint').textContent);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('vscan.taking-the-scanner-down-while-it-holds-the-one-hands-it-over-and-ends-the-alarm', async () => {
    const bad = [], a = scanner(bin().x + 25, bin().z + 8, 'x'), win = wins(); VS.raise(g, a, { sp: NEEDLE, vr: 0 });
    g.doDecon({ kind: 'mach', id: a.id });
    if (win.n !== 1 || !/your hands/.test(win.src[0])) bad.push('the hammer did not hand over The One: ' + JSON.stringify(win));
    if (g.alarmGate || g.machines.items.has(a.id) || S().items.vscan !== 1) bad.push('alarm or item after the hammer: ' + JSON.stringify([!!g.alarmGate, g.machines.items.has(a.id), S().items.vscan]));
    // without an alarm the hammer just takes it down
    const b = scanner(bin().x + 25, bin().z + 20, 'x'); win.n = 0; g.alarmGate = null; g.doDecon({ kind: 'mach', id: b.id }); if (win.n) bad.push('the hammer won on a quiet scanner');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('vscan.an-alarm-holds-the-next-truck-in-line-until-the-one-is-taken', async () => {
    const bad = [], { tk } = site(), a = scanner(bin().x + 25, bin().z + 8, 'x'), win = wins();
    a.alarm = true; a.held = { sp: NEEDLE, vr: 0 }; g.alarmGate = a;
    if (!until(() => tk.state === 'hold', 60)) return 'the truck never held: ' + tk.state + ' ' + tags(tk) + ' seg ' + tk.seg;
    const at = [tk.px, tk.pz]; const cargo = tk.cn; run(8);
    if (tk.state !== 'hold' || Math.hypot(tk.px - at[0], tk.pz - at[1]) > 1e-9) bad.push('it did not stay in line: ' + tk.state);
    if (Math.abs(at[0] - (a.cx + (tk.route[1][0] > a.cx ? 1 : -1) * VS.REACH)) > 1e-6) bad.push('held somewhere other than in front of the arch');
    if (a.loads) bad.push('a truck was scanned under an alarm');
    if (!/Held in line/.test(infoFor(g, { kind: 'mach', id: tk.id }).lines[0])) bad.push('readout: ' + infoFor(g, { kind: 'mach', id: tk.id }).lines[0]);
    VS.take(g, a);   // the player takes The One
    if (!until(() => tk.state === 'scan', 15)) bad.push('the truck did not move on after the alarm cleared: ' + tk.state);
    if (!until(() => tk.trips >= 1, 90)) bad.push('the truck never finished its trip'); if (a.loads !== 1 || tk.cn !== 0) bad.push('after the alarm: loads ' + a.loads);
    void cargo; void win; return bad.length === 0 || bad.join(' || ');
  });

  await guard('vscan.two-trucks-share-one-scanner-and-the-second-waits-for-the-alarm-of-the-first', async () => {
    const bad = [], b = bin(), a = scanner(b.x + 25, b.z + 8, 'x'), win = wins();
    const t1 = mkEarth('truck', toI(b.x + 6), toK(b.z + 8)), t2 = mkEarth('truck', toI(b.x + 9), toK(b.z + 11)); S().up.truckCount = 1; g.T = g.tune();
    const d1 = mkEarth('excavator', toI(b.x + 45), toK(b.z + 8)), d2 = mkEarth('excavator', toI(b.x + 45), toK(b.z + 20));
    d1.hop = [NEEDLE, 0, ...Array(239 * 2).fill(0).map((_, q) => (q % 2 ? 0 : 3))]; d1.hn = d1.hop.length / 2; d2.hop = Array(240 * 2).fill(0).map((_, q) => (q % 2 ? 0 : 4)); d2.hn = 240;
    const states = []; until(() => { states.push(t1.state + '/' + t2.state); return a.loads >= 2 && t1.job === 0 && t2.job === 0; }, 200);
    if (g.T.truckMax < 2) bad.push('tuning allows ' + g.T.truckMax + ' trucks');
    if (!a.alarm || !a.held) bad.push('the One was not caught');
    const dumped = S().stats.vscanDumped || 0; if (dumped !== 239) bad.push('dumped ' + dumped);
    // whichever truck reached the arch second was held while the alarm stood, then rolled once it was taken
    const wasHeld = states.some((s) => /hold/.test(s)); if (!wasHeld && a.loads >= 2 && a.alarm) bad.push('the second truck drove through under an alarm: ' + states.filter((s, q) => q % 50 === 0).join(' '));
    VS.take(g, a); until(() => t1.job === 0 && t2.job === 0 && t1.state === 'idle' && t2.state === 'idle', 200);
    if (t1.state !== 'idle' || t2.state !== 'idle') bad.push('trucks stuck after the alarm cleared: ' + t1.state + ' ' + t2.state);
    void win; return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- no scanner on the road
  await guard('vscan.a-truck-with-the-one-aboard-and-no-scanner-refuses-to-leave-and-says-so', async () => {
    const bad = [], { tk, dg } = site({ one: true }), win = wins(), money0 = S().money;
    if (!until(() => tk.state === 'refuse', 60)) return 'it never refused: ' + tk.state + ' ' + tags(tk);
    const at = [tk.px, tk.pz], n0 = tk.cargo.length / 2; run(15);
    if (tk.state !== 'refuse' || Math.hypot(tk.px - at[0], tk.pz - at[1]) > 1e-9) bad.push('it left anyway: ' + tk.state);
    if (tk.cargo.length / 2 !== n0 || !VS.hasOne(tk.cargo)) bad.push('the load changed while it refused');
    const said = toasts.filter((t) => /Haul Truck will not leave/.test(t)); if (said.length !== 1 || !/no powered Vehicle Scanner/.test(said[0]) || !/THE ONE/.test(said[0])) bad.push('toast: ' + JSON.stringify(said));
    if (S().stats.truckRefusals !== 1) bad.push('refusals counted ' + S().stats.truckRefusals);
    const info = infoFor(g, { kind: 'mach', id: tk.id }); if (info.lit || !/Will not leave/.test(info.lines[0]) || !info.lines.some((l) => /THE ONE is aboard/.test(l))) bad.push('readout: ' + JSON.stringify(info));
    if (S().money !== money0 || S().needleLost || win.n) bad.push('it sold or lost The One');
    // E on the truck takes The One out first (the win), and the rest of the load rolls on
    const it = g.machines.items.get(tk.id); g.useEarthIt(it);
    if (win.n !== 1 || !/haul truck/.test(win.src[0])) bad.push('E did not take The One: ' + JSON.stringify(win));
    if (VS.hasOne(tk.cargo) || tk.cargo.length / 2 !== n0 - 1) bad.push('The One is still aboard or too much left: ' + tk.cargo.length / 2);
    if (!until(() => tk.state === 'go', 10)) bad.push('the truck did not go on after The One came out: ' + tk.state);
    if (!until(() => tk.trips >= 1, 90) || (S().stats.hauled || 0) !== n0 - 1) bad.push('the rest was not sold: hauled ' + S().stats.hauled);
    void dg; return bad.length === 0 || bad.join(' || ');
  });

  await guard('vscan.a-scanner-built-later-releases-a-refusing-truck-and-it-dumps-the-load', async () => {
    const bad = [], { tk } = site({ one: true });
    if (!until(() => tk.state === 'refuse', 60)) return 'it never refused: ' + tk.state;
    const a = scanner(bin().x + 25, bin().z + 8, 'x');
    if (!until(() => tk.state === 'go', 8)) bad.push('the truck did not move off after a scanner stood up: ' + tk.state);
    if (tags(tk) !== 'dig,scanA,scan,scanC,sink,home' || tk.sc !== a.id) bad.push('route ' + tags(tk));
    if (!until(() => tk.state === 'dump', 60)) bad.push('never dumped: ' + tk.state);
    if (!until(() => tk.state === 'idle', 60) || !a.alarm) bad.push('after the dump: ' + tk.state + ' alarm ' + a.alarm);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('vscan.an-unpowered-scanner-is-skipped-by-a-clean-load-and-does-not-clear-the-one', async () => {
    const bad = [], { tk } = site(), a = scanner(bin().x + 25, bin().z + 8, 'x'); off.add(a.id);
    if (!until(() => tk.job, 20)) return 'no job'; if (tags(tk) !== 'dig,sink,home') bad.push('a dark scanner is on the route: ' + tags(tk));
    if (!until(() => tk.trips >= 1 && tk.state === 'idle', 120) || a.loads) bad.push('clean load: trips ' + tk.trips + ' loads ' + a.loads);
    // with The One aboard it still refuses: a dark scanner is no scanner
    const s2 = site({ one: true }); void s2; off.add(a.id); const tk2 = [...g.machines.items.values()].map((i) => i.ent).filter((e) => e.type === 'truck' && e !== tk)[0];
    if (!until(() => tk2.state === 'refuse' || tk2.state === 'scan', 80) || tk2.state !== 'refuse') bad.push('truck with The One and a dark scanner: ' + tk2.state);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('vscan.a-scanner-taken-down-or-darkened-under-a-truck-with-the-one-aboard-makes-it-stop-there', async () => {
    const bad = [], { tk } = site({ one: true }), a = scanner(bin().x + 25, bin().z + 8, 'x');
    if (!until(() => tk.state === 'go' && tk.seg === 1, 80)) return 'never headed for the arch: ' + tk.state + ' seg ' + tk.seg;
    g.doDecon({ kind: 'mach', id: a.id });   // the hammer, while the truck is on its way
    if (!until(() => tk.state === 'refuse', 40)) bad.push('it did not stop: ' + tk.state);
    if (!VS.hasOne(tk.cargo) || tk.cargo.length / 2 !== 240) bad.push('the load changed');
    // a clean load whose scanner disappeared just drives on
    const s2 = site(); const tk2 = [...g.machines.items.values()].map((i) => i.ent).filter((e) => e.type === 'truck' && e !== tk)[0], b = scanner(bin().x + 26, bin().z + 20, 'x'); void s2;
    if (!until(() => tk2.state === 'go' && tk2.seg >= 1 && tk2.sc, 60)) bad.push('second truck: ' + tk2.state);
    g.doDecon({ kind: 'mach', id: b.id }); if (!until(() => tk2.trips >= 1, 120)) bad.push('a clean load did not carry on past a missing scanner: ' + tk2.state);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('vscan.a-route-saved-before-the-scanner-existed-still-drives-and-sells', async () => {
    const bad = [], b = bin(), tk = mkEarth('truck', toI(b.x + 6), toK(b.z + 8));
    const sx = b.x + 3.5, sz = b.z + 3; tk.px = b.x + 20; tk.pz = sz; tk.route = [[b.x + 20, sz], [sx, sz], [tk.x, tk.z]]; tk.seg = 1; tk.state = 'go'; tk.job = 0; tk.cargo = Array(60 * 2).fill(0).map((_, q) => (q % 2 ? 0 : 3)); tk.cn = 60;
    if (!until(() => tk.state === 'unload', 30)) bad.push('never reached the sink: ' + tk.state); if (!until(() => tk.state === 'idle', 30)) bad.push('never got home: ' + tk.state);
    if (S().stats.hauled !== 60 || tk.trips !== 1) bad.push('legacy trip: hauled ' + S().stats.hauled);
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- the diggers
  const arena = (x, z, deep = 6) => {
    const i0 = toI(x), k0 = toK(z), cells = [];
    for (let a = -10; a <= 20; a++) for (let c = -14; c <= 14; c++) for (let j = 0; j < 14; j++) w().removeCell(i0 + a, j, k0 + c, false);
    for (let a = 3; a < 3 + deep; a++) for (let c = -6; c <= 6; c++) for (let j = 0; j < 8; j++) { w().setCell(i0 + a, j, k0 + c, 2 + ((a + c + j) & 3), 0); cells.push([i0 + a, j, k0 + c]); }
    return { i0, k0, cells, clear: () => { for (const [i, j, k] of cells) w().setCell(i, j, k, 0, 0); } };
  };
  for (const kind of ['excavator', 'dozer', 'wheel']) {
    await guard(`vscan.the-${kind}-scoops-the-one-and-keeps-it-aboard-off-the-belt-the-chute-and-the-sale`, async () => {
      const bad = [], win = wins(), a = arena(-10, 14, 6), ni = a.i0 + (kind === 'wheel' ? 6 : 4), nk = a.k0, nj = 1; w().setCell(ni, nj, nk, NEEDLE, 0);
      const e = mkEarth(kind, a.i0, a.k0); const mkT = (type, i, extra = {}) => { const t = { id: g.nextId(), type, i, j: 0, k: a.k0, dir: 2, rise: 0, ...extra }; if (type === 'belt') t.items = []; S().entities.push(t); g.addEntity(t); return t; };
      const withBelt = kind !== 'dozer', money0 = S().money;
      if (withBelt) { for (let n = 0; n < 3; n++) mkT('belt', e.i - 2 - n - EARTH[kind].half + 1); mkT('vault', e.i - 5 - EARTH[kind].half + 1); }
      run(150, 0.1); const vault = tiles().find((t) => t.type === 'vault');
      if (w().get(ni, nj, nk) === NEEDLE) bad.push('The One is still in the pile: the machine never scooped it (dug ' + e.dug + ')');
      if (!VS.hasOne(e.hop)) bad.push('The One is not in the hopper (' + e.hop.length / 2 + ' held, dug ' + e.dug + ')');
      if (vault && vault.stored.some((x) => x.sp === NEEDLE)) bad.push('The One went onto the belt');
      for (const t of tiles()) if (t.type === 'belt' && (t.items || []).some((x) => x.sp === NEEDLE)) bad.push('The One is on a belt tile');
      if (S().needleLost || win.n) bad.push('The One was lost or won: ' + S().needleLost);
      if (S().dex[NEEDLE] === undefined) bad.push('the dex does not know The One'); if (!toasts.some((t) => /THE ONE IS ABOARD/.test(t) && new RegExp(EARTH[kind].name).test(t))) bad.push('no aboard toast: ' + toasts.slice(0, 3).join(' / '));
      if (kind === 'dozer' && S().money <= money0) bad.push('the chute sold nothing else either');
      if (withBelt && vault && vault.stored.length < 5) bad.push('the rest of the pile did not go onto the belt: ' + vault.stored.length);
      const info = infoFor(g, { kind: 'mach', id: e.id }); if (!info.lines.some((l) => /THE ONE is in the hopper/.test(l))) bad.push('readout: ' + info.lines.join('|'));
      const rowE = earthRow(g.machines.items.get(e.id)); if (rowE.length < 14 || rowE[13] !== 1) bad.push('the row does not say The One is aboard: ' + JSON.stringify(rowE));
      // E takes it out first (the win), whatever the room in your hands
      S().carry = Array(g.T.carry).fill(0).map(() => ({ sp: 3, vr: 0 })); g.useEarthIt(g.machines.items.get(e.id));
      if (win.n !== 1 || !new RegExp(kind === 'wheel' ? 'bucket-wheel' : kind).test(win.src[0])) bad.push('E did not take The One: ' + JSON.stringify(win));
      if (VS.hasOne(e.hop)) bad.push('still in the hopper after E'); S().carry = []; a.clear(); return bad.length === 0 || bad.join(' || ');
    });
  }

  await guard('vscan.a-truck-loads-the-one-from-a-digger-hopper-and-the-whole-chain-ends-at-the-scanner', async () => {
    const bad = [], win = wins(), a = arena(-10, 14, 6), ni = a.i0 + 4; w().setCell(ni, 1, a.k0, NEEDLE, 0);
    const b = bin(), e = mkEarth('excavator', a.i0, a.k0), tk = mkEarth('truck', toI(b.x + 6), toK(b.z + 8)), sc = scanner(a.i0 > 0 ? cellX(a.i0) - 6 : cellX(a.i0) + 6, cellZ(a.k0) - 14, 'x'); void sc; g.T.excavRate = 0.05;
    until(() => VS.hasOne(e.hop) || VS.hasOne(tk.cargo), 150); if (!VS.hasOne(e.hop) && !VS.hasOne(tk.cargo)) bad.push('the digger never scooped it');
    const scanner2 = scans2(); until(() => scanner2.some((q) => q.alarm), 400); if (!scanner2.some((q) => q.alarm)) bad.push('the scanner never caught it: truck ' + tk.state + ' ' + tags(tk) + ', hopper has it ' + VS.hasOne(e.hop));
    if (S().needleLost || win.n) bad.push('lost or won on the way'); a.clear(); return bad.length === 0 || bad.join(' || ');
  });

  await guard('vscan.the-borer-never-eats-the-one', async () => {
    const bad = [], a = arena(-10, 14, 8); const ni = a.i0 + 6, nk = a.k0; w().setCell(ni, 1, nk, NEEDLE, 0);
    const ent = { id: g.nextId(), type: 'borer', i: a.i0 + 2, j: 0, k: a.k0, dx: 1, dz: 0, w: 3, h: 3, x: cellX(a.i0 + 2), y: 0, z: cellZ(a.k0) }; S().entities.push(ent); g.addEntity(ent);
    const e0 = S().stats.plush; run(80, 0.1); const bored = ent.steps || 0;
    if (w().get(ni, 1, nk) !== NEEDLE) bad.push('The One was eaten or moved (borer steps ' + bored + ')');
    if (S().needleLost) bad.push('The One was lost to the borer'); if (bored < 4 && !ent.done) bad.push('the borer did not even move: ' + bored);
    void e0; w().setCell(ni, 1, nk, 0, 0); a.clear(); gone(ent); return bad.length === 0 || bad.join(' || ');
  });

  await guard('vscan.no-machine-ever-sells-or-loses-the-one-by-accident', async () => {
    const bad = [], b = bin();
    // the last line of defence in the batch sale: The One is set down loose at the bin and the rest is sold
    const n0 = sim().count, m0 = S().money; const total = sellBatch(g, [3, 0, NEEDLE, 0, 3, 0], 1);
    if (total <= 0 || S().money <= m0) bad.push('the plush around The One was not sold'); if (S().needleLost) bad.push('The One was lost in a batch sale');
    let loose = 0; for (let q = 0; q < sim().n; q++) if (sim().sp[q] === NEEDLE) { loose++; if (Math.hypot(sim().x[q] - b.x, sim().z[q] - b.z) > 4) bad.push('The One was set down far from the bin'); }
    if (loose !== 1 || sim().count !== n0 + 1) bad.push('loose The One: ' + loose + ', bodies +' + (sim().count - n0));
    // taking a truck or a digger down: The One goes into your hands, or on the floor when they are full, never into the sale
    clearBodies(); const tk = mkEarth('truck', toI(b.x + 6), toK(b.z + 8)); tk.cargo = [NEEDLE, 0, 3, 0]; tk.cn = 2; S().carry = []; const m1 = S().money; spillEarth(g, tk, tk.px, 0, tk.pz);
    if (!S().carry.some((x) => x.sp === NEEDLE) || S().needleLost) bad.push('spill lost The One'); S().carry = Array(g.T.carry).fill(0).map(() => ({ sp: 3, vr: 0 })); tk.cargo = [NEEDLE, 0]; spillEarth(g, tk, tk.px, 0, tk.pz);
    let on = 0; for (let q = 0; q < sim().n; q++) if (sim().sp[q] === NEEDLE) on++; if (on !== 1) bad.push('with full hands The One should be on the floor: ' + on); if (S().money !== m1) bad.push('the spill sold something');
    S().carry = []; clearBodies(); return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- rows and old rows
  await guard('vscan.the-earth-row-carries-the-new-states-and-the-one-flag-and-an-old-row-still-applies', async () => {
    const bad = [], b = bin(), tk = mkEarth('truck', toI(b.x + 6), toK(b.z + 8)), it = g.machines.items.get(tk.id);
    for (const s of ['scan', 'dump', 'hold', 'refuse']) { if (STATES.indexOf(s) < 14) bad.push('state ' + s + ' is not at the end of STATES'); tk.state = s; const row = earthRow(it); if (STATES[row[4]] !== s) bad.push('state ' + s + ' does not round trip'); }
    tk.state = 'refuse'; tk.cargo = [NEEDLE, 0, 3, 0]; tk.cn = 2; const row = earthRow(it); if (row.length < 14 || row[13] !== 1) bad.push('row ' + JSON.stringify(row));
    const copy = { ent: { type: 'truck', id: 1 } }; applyEarthRow(copy, JSON.parse(JSON.stringify(row))); if (copy.ent.state !== 'refuse' || copy.ent.one !== true || copy.ent.cn !== 2) bad.push('applied ' + JSON.stringify(copy.ent));
    const old = row.slice(0, 13); const c2 = { ent: { type: 'truck', id: 1 } }; applyEarthRow(c2, old); if (c2.ent.one !== false || c2.ent.state !== 'refuse') bad.push('an old 13 field row broke: ' + JSON.stringify(c2.ent));
    const tuT = earthTune(g.T, 'truck'); void tuT; return bad.length === 0 || bad.join(' || ');
  });
}
