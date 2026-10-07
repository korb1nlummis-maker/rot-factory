// scan.audit.*: the adversarial pass over the Vehicle Scanner wave (src/vehiclescan.js, the truck and digger rules in src/earth.js).
// Edge cases the builder's tests do not hit: a full simulation under a dump, the scanner vanishing while a load is being scanned or dumped, the lane after odd events,
// a random soak with a save and load of every machine in the middle, and The One accounting across every place it can be. Run: `await __selftest('scan.audit.')`
import * as VS from '../vehiclescan.js';
import { EARTH } from '../earth.js';
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
  const clearAt = (x, z, axis = 'x') => { const i0 = toI(x), k0 = toK(z); for (let a = -8; a <= 8; a++) for (let b = -8; b <= 8; b++) for (let j = 0; j < 13; j++) { const i = i0 + (axis === 'z' ? a : b), k = k0 + (axis === 'z' ? b : a); if (w().get(i, j, k)) w().removeCell(i, j, k, false); } };
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
  const site = (o = {}) => {
    const b = bin(), n = o.n ?? 240, tk = mkEarth('truck', toI(b.x + 6), toK(b.z + 8)), dg = mkEarth('excavator', toI(b.x + 45), toK(b.z + 8));
    const hop = []; if (o.one) hop.push(NEEDLE, 0); for (let q = 0; q < n - (o.one ? 1 : 0); q++) hop.push(3, 0); dg.hop = hop; dg.hn = hop.length / 2;
    return { tk, dg, b };
  };
  const toasts = [];
  const watchToasts = () => { const t0 = g.ui.toast.bind(g.ui); g.ui.toast = (o) => { toasts.push(o.title + ' | ' + (o.text || '')); return t0(o); }; return () => { g.ui.toast = t0; }; };
  const guard = (name, fn) => T(name, async () => {
    const fn0 = g.foundNeedle, mode0 = g.mode; toasts.length = 0; off.clear();
    const stop = watchToasts();
    try { g.mode = 'play'; await newWorld(); fresh(UP); S().money = 1e12; clearBodies(); return await fn(); }
    finally { stop(); g.foundNeedle = fn0; g.mode = mode0 === 'ended' ? 'play' : mode0; S().found = false; S().ending = null; S().needleLost = false; g.net.open = false; g.net.role = null; g.guestReady = false; delete g.netSend; g.alarmGate = null; off.clear(); clearBodies(); }
  });
  const wins = () => { const w0 = { n: 0, src: [] }; g.foundNeedle = (src) => { w0.n++; w0.src.push(src); }; return w0; };
  const looseOnes = () => { let n = 0; for (let q = 0; q < sim().n; q++) if (sim().sp[q] === NEEDLE) n++; return n; };
  const fillSim = (to) => { let r = 0; while (sim().n < to && r++ < 4000) { const q = sim().n; if (sim().spawn(3, 0, -30 + (q % 40) * 0.3, 12 + Math.floor(q / 1600) * 0.5, -30 + Math.floor(q / 40 % 40) * 0.3, 0, 0, 0, 0) < 0) break; } };

  // ---------------------------------------------------------------- a full simulation must not freeze the lane
  await guard('scan.audit.a-full-simulation-under-a-dump-does-not-hold-the-lane-forever', async () => {
    const bad = [], { tk } = site({ one: true }), a = scanner(bin().x + 25, bin().z + 8, 'x');
    fillSim(VS.SIM_ROOM); const full = sim().n; if (full < VS.SIM_ROOM - 2) return 'could not fill the simulation: ' + full;
    if (!until(() => a.alarm, 60)) return 'no alarm: ' + tk.state;
    const m0 = S().money; run(25);
    if (tk.state === 'dump') bad.push('the truck is still stuck dumping with no room to pour, the lane is blocked for every truck');
    if (a.alarm && !VS.hasOne(a.held ? [a.held.sp, 0] : [])) bad.push('alarm without the One');
    VS.take(g, a); clearBodies(); S().found = false;
    if (!until(() => tk.state === 'idle' && tk.job === 0, 60)) bad.push('the truck never got home after the alarm: ' + tk.state);
    void m0; return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- the scanner disappears under a truck
  await guard('scan.audit.a-scanner-taken-down-while-the-truck-is-scanning-never-lets-the-one-drive-off', async () => {
    const bad = [], { tk } = site({ one: true }), a = scanner(bin().x + 25, bin().z + 8, 'x');
    if (!until(() => tk.state === 'scan', 80)) return 'never scanning: ' + tk.state;
    g.doDecon({ kind: 'mach', id: a.id });   // the hammer, in the middle of the scan
    run(1.5);
    if (tk.state === 'go' || tk.state === 'unload' || tk.state === 'back') bad.push('the truck drove off with The One aboard: ' + tk.state + ' has ' + VS.hasOne(tk.cargo));
    if (!until(() => tk.state === 'refuse', 30)) bad.push('it did not refuse: ' + tk.state);
    if (!VS.hasOne(tk.cargo)) bad.push('The One left the bed');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('scan.audit.a-scanner-taken-down-mid-dump-does-not-erase-the-rest-of-the-load', async () => {
    const bad = [], { tk } = site({ one: true }), a = scanner(bin().x + 25, bin().z + 8, 'x'), win = wins();
    if (!until(() => tk.state === 'dump', 80)) return 'never dumped: ' + tk.state;
    run(0.3); const left = tk.cargo.length / 2; if (left < 20) return 'dump was too fast to interrupt: ' + left;
    const loose0 = sim().n, sold0 = S().stats.sold || 0, money0 = S().money;
    g.doDecon({ kind: 'mach', id: a.id });
    if (win.n !== 1) bad.push('The One was not handed over by the hammer: ' + win.n);
    run(5);
    const accounted = (sim().n - loose0) + ((S().stats.sold || 0) - sold0);
    if (accounted !== left) bad.push(`${left} plush were still aboard when the scanner went, ${accounted} are on the floor or sold: the rest vanished`);
    if (S().money < money0) bad.push('money went down');
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- conservation of The One and the load through a dump
  await guard('scan.audit.the-dump-pours-exactly-the-load-minus-the-one-and-nothing-is-sold', async () => {
    const bad = [], { tk } = site({ one: true, n: 233 }), a = scanner(bin().x + 25, bin().z + 8, 'x'); const money0 = S().money, n0 = sim().n, ones0 = looseOnes();
    let aboard = 0; if (!until(() => { if (tk.state === 'scan' && !aboard) aboard = tk.cargo.length / 2; return a.alarm && tk.state === 'idle' && tk.job === 0; }, 120)) return 'never finished: ' + tk.state;
    if (!aboard || sim().n - n0 !== aboard - 1) bad.push('poured ' + (sim().n - n0) + ', expected ' + (aboard - 1));
    if (looseOnes() !== ones0) bad.push('The One is on the floor'); if (S().money !== money0) bad.push('money changed ' + (S().money - money0));
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- the lane after the truck that held it is removed
  await guard('scan.audit.a-truck-hammered-in-the-lane-frees-it-for-the-next-one', async () => {
    const bad = [], b = bin(), a = scanner(b.x + 25, b.z + 8, 'x'), { tk, dg } = site();
    if (!until(() => tk.state === 'go' && tk.seg >= 2, 60)) return 'never in the lane: ' + tk.state + ' seg ' + tk.seg;
    g.doDecon({ kind: 'mach', id: tk.id });
    const t2 = mkEarth('truck', toI(b.x + 7), toK(b.z + 11)); S().up.truckCount = 1; g.T = g.tune(); dg.hop = Array(240 * 2).fill(0).map((_, q) => (q % 2 ? 0 : 3)); dg.hn = 240;
    if (!until(() => t2.trips >= 1, 160)) bad.push('the second truck is stuck behind a dead one: ' + t2.state + ' ' + t2.seg);
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- save and load in the middle of a dump
  await guard('scan.audit.a-save-and-load-in-the-middle-of-an-alarm-dump-finishes-the-same-way', async () => {
    const bad = [], { tk } = site({ one: true }), a = scanner(bin().x + 25, bin().z + 8, 'x');
    if (!until(() => tk.state === 'dump', 80)) return 'never dumped: ' + tk.state; run(1);
    const cargoBefore = tk.cargo.length / 2, loose0 = sim().n; if (!cargoBefore) return 'dump already done';
    const snap = JSON.parse(JSON.stringify(S().entities.filter((e) => e.id === tk.id || e.id === a.id)));
    for (const id of [tk.id, a.id]) { const it = g.machines.items.get(id); if (it) { if (it.ent.type === 'vscan') VS.onRemove(g, it.ent); g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(id); } }
    S().entities = S().entities.filter((e) => e.id !== tk.id && e.id !== a.id); g.alarmGate = null;
    for (const e of snap) { S().entities.push(e); g.addEntity(e); }
    const t2 = S().entities.find((e) => e.id === tk.id), a2 = S().entities.find((e) => e.id === a.id);
    if (!a2.alarm || !a2.held || a2.held.sp !== NEEDLE) bad.push('the alarm was lost in the save: ' + JSON.stringify([a2.alarm, a2.held]));
    if (!until(() => t2.state === 'idle' && t2.job === 0, 80)) bad.push('the truck never finished after the load: ' + t2.state + ' ' + t2.seg);
    if (sim().n - loose0 !== cargoBefore) bad.push(`the dump poured ${sim().n - loose0} after the load, expected ${cargoBefore}`);
    VS.take(g, a2); if (a2.alarm) bad.push('could not take it after the load');
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- a clean truck behind an alarm on a second scanner is not held
  await guard('scan.audit.an-alarm-on-one-scanner-does-not-hold-trucks-routed-through-another', async () => {
    const bad = [], b = bin(), a = scanner(b.x + 25, b.z + 8, 'x'), { tk } = site();
    a.alarm = true; a.held = { sp: NEEDLE, vr: 0 }; g.alarmGate = a; off.add(a.id);   // an alarmed scanner with no power is no route
    if (!until(() => tk.trips >= 1, 120)) bad.push('a clean truck did not finish with a dark alarmed scanner: ' + tk.state);
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- the detector alarm and the scanner alarm share g.alarmGate
  await guard('scan.audit.taking-the-one-from-a-scanner-keeps-the-other-alarm-lit', async () => {
    const bad = [], b = bin(), a = scanner(b.x + 25, b.z + 8, 'x'), c = scanner(b.x + 25, b.z + 30, 'x'); wins(); g.alarmGate = null;
    VS.raise(g, a, { sp: NEEDLE, vr: 0 }); VS.raise(g, c, { sp: NEEDLE, vr: 1 });
    VS.take(g, c); if (!g.alarmGate) bad.push('the warning beacon went out while a scanner still holds an alarm');
    VS.take(g, a); if (g.alarmGate) bad.push('the beacon is still on with every alarm taken');
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- edges of the world
  await guard('scan.audit.layout-rejects-the-world-edges-floats-and-huge-numbers', async () => {
    const bad = []; const NX = w().NX ?? 0;
    for (const args of [['x', -1, 0, 0], ['x', 1e9, 0, 0], ['z', 0, -50, 0], ['x', 5, 5, -3], ['x', 5, 5, 1e9], ['x', 5.5, 5, 0], ['x', NaN, 5, 0], ['q', 5, 5, 0], ['x', '5', 5, 0], ['z', 5, 5, 1e300], [null, 1, 1, 1]]) {
      let r; try { r = VS.layout(g, ...args); } catch (e) { bad.push('threw for ' + JSON.stringify(args) + ': ' + e.message); continue; }
      if (r.ok) bad.push('accepted ' + JSON.stringify(args));
    }
    void NX; return bad.length === 0 || bad.join(' || ');
  });

  await guard('scan.audit.vscan-use-and-take-are-safe-on-a-scanner-without-an-alarm-or-a-held-one', async () => {
    const bad = [], a = scanner(bin().x + 25, bin().z + 8, 'x'), win = wins();
    if (VS.take(g, a)) bad.push('take succeeded with no alarm'); a.alarm = true; a.held = null; if (VS.take(g, a)) bad.push('take succeeded with no held One');
    a.alarm = false; a.held = { sp: NEEDLE, vr: 0 }; if (VS.take(g, a)) bad.push('take succeeded with a held One but no alarm');
    if (win.n) bad.push('a win from nothing'); a.held = null; return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- random soak: every place The One can be, saves in the middle
  const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (const seed of [11, 202]) {
    await guard(`scan.audit.random-soak-seed-${seed}-keeps-exactly-one-one-and-never-sells-it`, async () => {
      const R = rng(seed), bad = [], b = bin(), win = wins(); let ones = 0;
      const { tk, dg } = site({ one: true, n: 120 });
      let sc = [scanner(b.x + 25, b.z + 8, 'x')], money = S().money;
      const trucks = [tk]; const t2 = mkEarth('truck', toI(b.x + 7), toK(b.z + 11)); S().up.truckCount = 1; g.T = g.tune(); trucks.push(t2);
      const where = () => {
        let n = looseOnes(); const at = [];
        for (const it of g.machines.items.values()) { const e = it.ent; const cnt = (flat) => { let c = 0; if (flat) for (let q = 0; q < flat.length; q += 2) if (flat[q] === NEEDLE) c++; return c; }; n += cnt(e.hop) + cnt(e.cargo); if (e.type === 'vscan' && e.held && e.held.sp === NEEDLE) n++; }
        for (const c of S().carry) if (c.sp === NEEDLE) n++; return n + win.n + (S().needleLost ? 100 : 0) + at.length;
      };
      for (let step = 0; step < 220 && bad.length < 5; step++) {
        const r = R();
        try {
          if (r < 0.12) { const x = b.x + 18 + R() * 20, z = b.z + 4 + R() * 24, ax = R() < 0.5 ? 'x' : 'z'; try { const s = scanner(x, z, ax); sc.push(s); } catch (e) { /* no room */ } }
          else if (r < 0.2 && sc.length) { const s = sc[Math.floor(R() * sc.length)]; if (g.machines.items.has(s.id)) g.doDecon({ kind: 'mach', id: s.id }); sc = sc.filter((q) => q !== s); }
          else if (r < 0.32) { const s = sc[Math.floor(R() * sc.length)]; if (s) { if (off.has(s.id)) off.delete(s.id); else off.add(s.id); } }
          else if (r < 0.38) { const s = sc.find((q) => q.alarm && g.machines.items.has(q.id)); if (s) VS.use(g, s); }
          else if (r < 0.46) { const t = trucks[Math.floor(R() * 2)]; if (g.machines.items.has(t.id)) { const it = g.machines.items.get(t.id); g.useEarthIt(it); } }
          else if (r < 0.5) { const it = g.machines.items.get(dg.id); if (it) g.useEarthIt(it); }
          else if (r < 0.55) { const t = trucks[Math.floor(R() * 2)]; if (g.machines.items.has(t.id) && t.cargo) { const flat = t.cargo; for (let q = 0; q < 6; q++) flat.push(3, 0); t.cn = flat.length / 2; } }
          else if (r < 0.62) {   // a save and load of a random truck or quiet scanner in the middle of whatever it is doing
            const pool = [...sc.filter((q) => g.machines.items.has(q.id) && !q.alarm), ...trucks.filter((t) => g.machines.items.has(t.id))]; const e = pool[Math.floor(R() * pool.length)];
            if (e) {
              const copy = JSON.parse(JSON.stringify(e)), it = g.machines.items.get(e.id);
              g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); S().entities = S().entities.filter((x) => x.id !== e.id); S().entities.push(copy); g.addEntity(copy);
              if (e.type === 'vscan') sc = sc.map((q) => (q === e ? copy : q)); else trucks[trucks.indexOf(e)] = copy;
            }
          }
          run(0.5 + R() * 4, 0.1);
        } catch (e) { bad.push('threw at step ' + step + ': ' + e.message); break; }
        ones = where(); if (ones !== 1) bad.push(`step ${step}: ${ones} Ones in the world`);
        if (S().needleLost) bad.push('The One was lost at step ' + step);
        for (let q = 0; q < sim().n; q++) if (!Number.isFinite(sim().x[q]) || !Number.isFinite(sim().z[q])) { bad.push('NaN plush at step ' + step); break; }
        for (const t of trucks) if (g.machines.items.has(t.id) && (!Number.isFinite(t.px) || !Number.isFinite(t.pz))) bad.push('NaN truck at step ' + step);
        if (S().money < money - 1e-6) bad.push('money dropped'); money = S().money;
        if (win.n > 1) bad.push('won twice');
      }
      return bad.length === 0 || bad.slice(0, 4).join(' || ');
    });
  }
}
