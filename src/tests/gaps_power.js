// gaps.power.*: the grid solver (power.js) counts EVERY catalog machine that declares a demand (a catalog_*.js DEMAND row or a TYPES `kw` handler), and the cable tool wires them.
// Rail stations, the Leveling Pad, the arches, doors, lifts, jump pads, lights and signs were all declared in a DEMAND row without the solver ever counting them.
import { makeRail } from './rail_lib.js';
import { makeKit } from './power_lib.js';
import { makeShell } from './build_lib.js';
import * as D from '../detector.js';
import { PARTS, TYPES, EXTRA } from '../catalog.js';
import { isCatalogConsumer, catalogKw } from '../power.js';
import { wireable } from '../cables.js';
import { infoFor } from '../info.js';
import * as PP from '../powerparts.js';

// the types power.js counts by name (earth movers, claw, borer, beacon, lantern, scanner, the power parts): not the catalog consumer path
const BY_NAME = ['claw', 'borer', 'beacon', 'meter', 'hlamp', 'vscan', 'switch', 'pswitch', 'breaker', 'battery'];

export default async function (ctx) {
  const { T, g, S, w, p, L, adv, V3, fresh, toI, toK, cellX, cellZ } = ctx;
  const X = makeRail(ctx), R = X.R, K = makeKit(ctx);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { X.clean(); for (const t of [...L().tiles.values()]) if (!t.free && (t.type === 'gen' || t.type === 'pole' || t.type === 'fan')) { L().remove(t); S().entities = S().entities.filter((x) => x.id !== t.id); } delete TYPES.gapfake; delete EXTRA.gapfake; g.power.markDirty(); } });
  const netOf = (e) => g.power.netOfEnt(e);

  await guard('gaps.power.every-declared-catalog-demand-is-a-solver-consumer-and-wireable', async () => {
    const bad = [];
    for (const [name, part] of Object.entries(PARTS)) for (const type of Object.keys(part.DEMAND || {})) {
      if (!isCatalogConsumer(type) && !BY_NAME.includes(type)) bad.push(`${name}.${type} is declared but not counted`);
      if (!wireable({ type })) bad.push(`${name}.${type} cannot take a cable`);
    }
    for (const type of ['railstn', 'levelpad', 'arch', 'door', 'plift', 'jump', 'clamp', 'flood', 'strip', 'wbeacon', 'sign', 'dsign', 'psign']) {
      const h = TYPES[type]; if (!h || typeof h.kw !== 'function') bad.push(type + ' has no kw handler'); else if (!Number.isFinite(h.kw({ type, on: true, size: 1, st: 'idle', draw: 1, mv: 1, lit: true, mode: 'on' }, g))) bad.push(type + ' kw is not a number');
      if (!wireable({ type })) bad.push(type + ' is not wireable');
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.power.rail-station-draws-3-kw-from-its-grid', async () => {
    X.setup(); const bad = [];
    const k = X.ck(-2.2), iBase = X.ci(1.0); X.line(iBase - 6, iBase, 0, k);
    X.power(cellX(iBase), cellZ(k) + 1.0); adv(0.3);
    const gen = [...L().tiles.values()].find((t) => t.type === 'gen'), n0 = netOf(gen); if (!n0) return 'no grid'; const d0 = n0.demand;
    const stn = X.station(iBase, 0, k, 'base'); adv(1);
    const n1 = netOf(gen); if (Math.abs(n1.demand - d0 - 3) > 1e-6) bad.push(`station added ${(n1.demand - d0).toFixed(3)} kW instead of 3`);
    if (netOf(stn) !== n1) bad.push('the station is not on the generator grid');
    if (Math.abs((stn.pw || 0) - n1.sat) > 1e-6) bad.push(`station pw ${stn.pw} vs grid sat ${n1.sat}`);
    g.doDecon({ kind: 'mach', id: stn.id }); adv(1); if (Math.abs(netOf(gen).demand - d0) > 1e-6) bad.push('the demand stayed after the station was taken down');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.power.rail-line-slows-in-a-brownout-and-the-cart-follows', async () => {
    const s = (X.setup(), X.std()), bad = []; adv(1);
    const comp = () => R.sync(g).comps[0];
    if (Math.abs(comp().speed - 8) > 0.01) bad.push('full power line speed ' + comp().speed);
    // 8 kW of generator, 6 kW of stations: add 5 fans (10 kW) -> 16 kW of demand, satisfaction 0.5
    const fans = []; for (let n = 0; n < 5; n++) fans.push(K.fan(cellX(s.iBase) + 0.6 * n - 1, cellZ(s.k) + 1.8)); g.power.markDirty(); adv(1);
    const net = netOf(s.base), sat = net.sat; if (!(sat > 0.2 && sat < 0.95)) return 'the test grid is not browned out: sat ' + sat + ' demand ' + net.demand;
    if (Math.abs((s.base.pw || 0) - sat) > 0.01) bad.push(`station pw ${s.base.pw} vs sat ${sat}`);
    const want = Math.max(R.HAND_SPEED, 8 * sat); if (Math.abs(comp().speed - want) > 0.05) bad.push(`brownout line speed ${comp().speed} expected ${want}`);
    // a real cart never goes faster than the browned out line speed
    const car = s.car; R.goHome(g, car, 'host'); let top = 0; X.until(() => { top = Math.max(top, car.spd); return car.st !== 'run'; }, 60);
    if (top > want + 0.35) bad.push(`cart reached ${top.toFixed(2)} m/s on a line worth ${want.toFixed(2)}`); if (top < 2) bad.push('cart barely moved ' + top);
    for (const f of fans) { L().remove(f); S().entities = S().entities.filter((x) => x.id !== f.id); } g.power.markDirty(); adv(1);
    if (Math.abs(comp().speed - 8) > 0.01) bad.push('the line did not recover: ' + comp().speed);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.power.a-cable-wires-a-rail-station-far-from-any-pole', async () => {
    X.setup(); const bad = [];
    const k = X.ck(-2.2), iA = X.ci(-26), iB = X.ci(-12); X.line(iA, iB, 0, k);
    K.small(); const gen = K.gen(-6, cellZ(k) + 3.6), pole = K.pole(-5, cellZ(k) + 3.6); g.power.markDirty(); adv(0.5);
    const stn = X.station(iB, 0, k, 'face'); adv(1);
    if ((stn.pw || 0) > 0.05) return 'test setup: the station is already powered without a cable';
    if (Math.abs(R.sync(g).comps[0].speed - R.HAND_SPEED) > 1e-6) bad.push('line should crank by hand: ' + R.sync(g).comps[0].speed);
    S().items.cable = 3; const r = g.cables.connect(pole.id, stn.id); if (!r.ok) return 'the cable tool refused a station: ' + r.why; adv(1);
    if (!((stn.pw || 0) > 0.95)) bad.push('station pw after the cable ' + stn.pw);
    if (netOf(stn) !== netOf(gen)) bad.push('the station is not on the generator grid');
    if (Math.abs(R.sync(g).comps[0].speed - 8) > 0.01) bad.push('line speed after the cable ' + R.sync(g).comps[0].speed);
    const info = infoFor(g, { kind: 'mach', id: stn.id }); if (!info.lines.some((l) => /Powered by cable from Power Pole/.test(l))) bad.push('hover readout: ' + info.lines.join(' | '));
    const r2 = g.cables.connect(gen.id, stn.id); if (r2.ok || !/no free cable port/.test(r2.why || '')) bad.push('a second cable on a station port: ' + JSON.stringify(r2.ok ? 'ok' : r2.why));
    // cut the cable: the line cranks again
    g.cables.remove(g.cables.list()[0].id, true); adv(1); if ((stn.pw || 0) > 0.05) bad.push('still powered after the cable was removed');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.power.cable-tool-aims-at-a-rail-station-and-a-leveling-pad', async () => {
    X.setup(); const bad = [];
    const k = X.ck(-2.2), i = X.ci(-12); X.line(i - 3, i + 3, 0, k); const stn = X.station(i, 0, k, 'face'); adv(0.2);
    const e = stn; const eye = new V3(e.x - 1.6, 1.0, e.z), dir = new V3(1, 0, 0).normalize(); dir.y = (e.y + 0.65 - eye.y) / Math.hypot(1.6, e.y + 0.65 - eye.y); dir.normalize();
    const tg = g.cables.findTarget(eye, dir, 8); if (!tg || tg.id !== stn.id) bad.push('the crosshair did not find the station: ' + (tg && tg.type));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.power.leveling-pad-is-a-15-kw-consumer-wired-by-cable', async () => {
    const SH = makeShell(ctx), B = SH.B; SH.setup(); const bad = [];
    try {
      const i = toI(-14), k = toK(2); g._bz = { n: 1, w: 1 };
      K.small();
      const r = await SH.put('levelpad', i, k, { back: 2.2 }); if (!r.ok) return r.why; const E = r.made[0];
      E.on = false; adv(0.2);
      // a grid far from the pad: only a cable reaches it
      const gen = K.gen(cellX(i) + 9, cellZ(k) + 6), pole = K.pole(cellX(i) + 10, cellZ(k) + 6); g.power.markDirty(); adv(0.5);
      if (netOf(E)) bad.push('the pad is on a grid it has no link to');
      S().items.cable = 2; const c = g.cables.connect(pole.id, E.id); if (!c.ok) return 'the cable tool refused the Leveling Pad: ' + c.why;
      adv(0.5); const n = netOf(gen); if (netOf(E) !== n) return 'a cable did not join the pad to the grid';
      const idle = n.demand; E.on = true; g.power.markDirty(); g.power.recompute(); const run = netOf(gen).demand; if (Math.abs(run - idle - B.LEVEL_KW) > 1e-6) bad.push(`running pad adds ${(run - idle).toFixed(2)} kW instead of ${B.LEVEL_KW}`);
      if (B.levelPower(g, E) !== E.pw) bad.push('levelPower does not read the solver');
      // 8 kW of generator against 15 kW: a brownout, the pad's pw is the grid's satisfaction
      if (!(E.pw > 0.3 && E.pw < 0.9)) bad.push('pad pw in a brownout ' + E.pw);
      const info = infoFor(g, { kind: 'mach', id: E.id }); if (!info.lines.some((l) => /Powered by cable from Power Pole/.test(l))) bad.push('hover: ' + info.lines.join(' | '));
    } finally { for (const t of [...L().tiles.values()]) if (!t.free && (t.type === 'gen' || t.type === 'pole')) { L().remove(t); S().entities = S().entities.filter((x) => x.id !== t.id); } SH.clean(); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.power.an-arch-counts-its-size-and-its-power-comes-from-the-solver', async () => {
    K.reset(); const bad = [];
    const mk = (size, x, z) => { K.clearBay(); const m = toK(z), lat = toI(x), S_ = D.SIZES[size]; const l = D.layout(g, size, 'z', m, lat - (S_.w / 2 - 1), 0); if (!l.ok) throw new Error('layout: ' + l.why); return g.placeEntity('arch', { ...l.ent }); };
    const gen = K.gen(-9, 2), pole = K.pole(-8, 2); g.power.markDirty(); adv(0.5);
    const net = netOf(gen), d0 = net.demand;
    const a1 = mk(1, -7, 2); adv(1); const n1 = netOf(gen); if (netOf(a1) !== n1) bad.push('the arch is not on the grid'); if (Math.abs(n1.demand - d0 - D.SIZES[1].kw) > 1e-6) bad.push('arch demand ' + (n1.demand - d0));
    if (!(a1.pw > 0.95) || !D.powerOf(g, a1)) bad.push('arch pw ' + a1.pw);
    g.doDecon({ kind: 'mach', id: a1.id }); adv(0.5);
    const a2 = mk(2, -4, 2); adv(1); const n2 = netOf(gen); if (Math.abs((n2.demand) - d0 - D.SIZES[2].kw) > 1e-6 && netOf(a2) === n2) bad.push('giant arch demand ' + (n2.demand - d0));
    // a cable carries power to an arch that stands out of reach
    g.doDecon({ kind: 'mach', id: a2.id }); adv(0.3); K.small();
    const far = mk(1, 4, 8); adv(0.8); if (D.powerOf(g, far)) bad.push('a far arch is powered without a cable');
    S().items.cable = 2; const c = g.cables.connect(pole.id, far.id); if (!c.ok) return 'the cable tool refused an arch: ' + c.why; adv(1);
    if (!D.powerOf(g, far)) bad.push('the cable did not power the arch');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.power.a-new-catalog-type-with-a-kw-handler-is-counted-without-editing-power-js', async () => {
    K.reset(); const bad = [];
    let kw = 5; TYPES.gapfake = { add: () => ({}), kw: () => kw };
    const gen = K.gen(-9, 2), pole = K.pole(-8, 2); g.power.markDirty(); adv(0.5); const d0 = netOf(gen).demand;
    const e = K.mach('gapfake', -7.4, 2); adv(1); if (Math.abs(netOf(gen).demand - d0 - 5) > 1e-6) bad.push('fake demand ' + (netOf(gen).demand - d0));
    kw = 1.5; g.power.markDirty(); adv(0.2); if (Math.abs(netOf(gen).demand - d0 - 1.5) > 1e-6) bad.push('a changed draw was not picked up ' + (netOf(gen).demand - d0));
    if (!isCatalogConsumer('gapfake') || catalogKw(g, e) !== 1.5) bad.push('helpers');
    if (!wireable(e)) bad.push('the fake type cannot take a cable');
    if (!((e.pw || 0) > 0.95)) bad.push('pw ' + e.pw);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.power.furnish-and-transit-loads-are-counted-once', async () => {
    K.reset(); const bad = [];
    const gen = K.gen(-9, 2), pole = K.pole(-8, 2); g.power.markDirty(); adv(0.5); const d0 = netOf(gen).demand;
    const strip = K.mach('strip', -7.4, 2, { y: 1.0, h: 0.1, mount: 'ceiling', dir: 0, mode: 'on' });
    adv(1.6); const d1 = netOf(gen).demand; if (Math.abs(d1 - d0 - 0.15) > 1e-6) bad.push('strip light counted ' + (d1 - d0) + ' kW (once is 0.15)');
    if (!((strip.pw || 0) > 0.95)) bad.push('strip pw ' + strip.pw);
    adv(2); if (Math.abs(netOf(gen).demand - d1) > 1e-6) bad.push('the load grew over time: ' + (netOf(gen).demand - d1));
    S().items.cable = 2; K.small(); const far = K.mach('strip', 6, 8, { y: 1.0, h: 0.1, mount: 'ceiling', dir: 0, mode: 'on' }); adv(1);
    if ((far.pw || 0) > 0.05) bad.push('a far strip light is powered without a cable'); const c = g.cables.connect(pole.id, far.id); if (!c.ok) return 'the cable tool refused a strip light: ' + c.why; adv(1.6);
    if (!((far.pw || 0) > 0.95)) bad.push('the cable did not light the far strip: ' + far.pw);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.power.the-load-meter-lists-the-loads-by-kind-on-both-screens', async () => {
    X.setup(); const bad = [];
    const k = X.ck(-2.2), iBase = X.ci(1.0); X.line(iBase - 6, iBase, 0, k);
    X.power(cellX(iBase), cellZ(k) + 1.0); const stn = X.station(iBase, 0, k, 'base'); void stn;
    const fan = K.fan(cellX(iBase) - 1.2, cellZ(k) + 1.8); void fan;
    g.power.markDirty(); adv(1.2);
    const gen = [...L().tiles.values()].find((t) => t.type === 'gen'), net = netOf(gen);
    if (!net.loads || Math.abs((net.loads['Rail Station'] || 0) - 3) > 1e-6) bad.push('loads ' + JSON.stringify(net.loads));
    if (Math.abs((net.loads.Fans || 0) - 2) > 1e-6) bad.push('fans ' + (net.loads && net.loads.Fans));
    const line = PP.loadsLine(net); if (!/^Loads: Rail Station 3\.0 kW, Fans 2\.0 kW/.test(line)) bad.push('line: ' + line);
    // the Load Meter machine and the guest
    const meter = K.part('meter', cellX(iBase) - 2.4, cellZ(k) + 1.8); g.power.markDirty(); adv(0.6);
    const hostInfo = infoFor(g, { kind: 'mach', id: meter.id }).lines.join(' | '); if (!/Loads: Rail Station 3\.0 kW/.test(hostInfo)) bad.push('meter readout: ' + hostInfo);
    const row = JSON.parse(JSON.stringify(g.power.packRow())); const mine = row.n.find((a) => a[9].includes(gen.id)); if (!mine || !Array.isArray(mine[10]) || !mine[10].some((q) => q[0] === 'Rail Station')) bad.push('the row does not carry the loads: ' + JSON.stringify(mine && mine[10]));
    const saved = g.power.nets; g.power.applyRow(row); const gnet = g.power.nets.find((n) => n.nodes.some((q) => q.id === gen.id));
    if (!gnet || Math.abs((gnet.loads['Rail Station'] || 0) - 3) > 0.01) bad.push('guest loads ' + (gnet && JSON.stringify(gnet.loads))); g.power.nets = saved; g.power.netById = new Map(saved.map((n) => [n.id, n])); g.power.markDirty(); adv(0.2);
    return bad.length === 0 || bad.join(' || ');
  });
}
