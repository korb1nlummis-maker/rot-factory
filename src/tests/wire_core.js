// Wire-only power (cables.js, power.js, gridinfo.js): nodes join a grid only through cables, every machine needs its own cable to a node, a pole is a hub that is dead
// until a cable path joins it to a generator, a cable has a maximum length, upgrades only lengthen it, and the readouts say what is wrong. Prefix `wire.`.
import { makeKit, UP } from './power_lib.js';
import { infoFor } from '../info.js';
import { EARTH } from '../earth.js';
import { beltKw } from '../beltdata.js';

export default async function (ctx) {
  const { T, g, S, L, adv, tune, craft, selectTool, aimPoint, cellX, cellZ, toI, toK } = ctx;
  const K = makeKit(ctx);
  const { reset, tile, gen, pole, fan, mach, part, wire, netOf } = K;
  const info = (e) => infoFor(g, { kind: g.logi.byId.get(e.id) ? 'tile' : 'mach', id: e.id });
  const text = (e) => { const r = info(e); return r ? [r.title, ...r.lines].join(' | ') : ''; };
  const lampColor = (t) => { const o = L().objs.get(t.id), l = o && o.getObjectByName('lamp'); return l ? l.material.color : null; };
  const lampOn = (t) => { const c = lampColor(t); return !!c && Math.max(c.r, c.g, c.b) > 0.5; };
  const out = (t) => { t.burn = 0; t.burnMax = 0; t.q = []; t.lit = false; g.power.markDirty(); };
  const mk = (type, x, z) => {
    if (['fan', 'mech', 'sorter', 'belt', 'charger'].includes(type)) return tile(type, x, z);
    const extra = type === 'borer' ? { dx: 1, dz: 0, w: 2, h: 3 } : type === 'claw' ? { ry: 0 } : type === 'dozer' ? { dx: 1, dz: 0, hy: EARTH.dozer.hy, hr: EARTH.dozer.hr, hop: [], hn: 0, steps: 0, dug: 0, state: 'idle', yaw: 0 } : {};
    return mach(type, x, z, extra);
  };
  const MACHINES = ['belt', 'sorter', 'mech', 'fan', 'claw', 'beacon', 'borer', 'dozer'];

  await T('wire.no-power-without-a-wire-at-any-distance-even-touching-a-pole', async () => {
    reset(UP, false); const bad = [];
    const G = gen(-6, 3), P = pole(-5.4, 3);   // a generator touching a pole: no cable, so two separate grids
    const ms = []; MACHINES.forEach((type, n) => ms.push(mk(type, -4.2 + (n % 4) * 1.2, 3.6 + Math.floor(n / 4) * 1.2)));   // everything within 2 m of the pole, some touching it
    ms.push(mk('fan', -5.4, 3.6), mk('fan', -5.4, 7), mk('fan', 2, 3));                                                      // 0.6 m, 4 m and 7.4 m from the pole
    adv(2);
    for (const m of ms) if ((m.pw || 0) > 0) bad.push(`${m.type} powered with no cable (${m.pw})`);
    if (g.power.nets.some((n) => n.nodes.includes(G) && n.nodes.includes(P))) bad.push('a generator touching a pole joined its grid with no cable');
    if ((P.pw || 0) > 0.05) bad.push('a pole touching a burning generator is live without a cable');
    const gn = netOf(G); if (!gn || gn.demand !== 0) bad.push('an unwired generator carries a load: ' + (gn && gn.demand));
    if (!/Not wired/.test(text(ms[0])) && !/Not wired/.test(text(ms[3]))) bad.push('no "Not wired" line: ' + text(ms[3]));
    return bad.length === 0 || bad.slice(0, 5).join('; ');
  });

  await T('wire.the-old-range-link-is-gone-no-blue-lines-no-reach-numbers', async () => {
    reset(UP, false); gen(-6, 3); pole(-5.4, 3); pole(-4.8, 3); adv(1.5);
    const bad = [];
    if (g.power.line) bad.push('the faint blue link line object still exists');
    let blue = 0; g.renderer.scene.traverse((o) => { if (o.isLineSegments && o.material && o.material.color && o.material.color.getHex() === 0x7ad7ff) blue++; }); if (blue) bad.push(blue + ' blue link line object(s) in the scene');
    const t = tune({ power: 1 }); if (t.poleLink !== undefined || t.poleReach !== undefined) bad.push(`range numbers survive: poleLink ${t.poleLink}, poleReach ${t.poleReach}`);
    if (g.power.nets.length !== 3) bad.push(`three touching nodes with no cable make ${g.power.nets.length} grids, expected 3`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.a-pole-is-dead-until-a-cable-joins-it-to-a-generator-and-its-lamp-follows', async () => {
    reset(UP, false); const bad = [];
    const G = gen(-8, 3), P = pole(-6, 3), P2 = pole(-3, 3), F = fan(-3, 4.2), P3 = pole(5, 3), F3 = fan(5, 4.2);
    wire(P, P2); wire(P2, F); wire(P3, F3); adv(1);
    if (lampOn(P) || lampOn(P2)) bad.push('lamp lit on a pole with no generator');
    if ((P.pw || 0) > 0.05 || (F.pw || 0) > 0.05) bad.push(`dead pole carries power: pole ${P.pw}, fan ${F.pw}`);
    if (!/DEAD/.test(info(P).title) || !/generator/.test(text(P))) bad.push('dead pole readout: ' + text(P));
    if (!/no generator|generator/.test(text(F)) || !/Not powered/.test(text(F))) bad.push('fan on a dead pole does not say why: ' + text(F));
    wire(G, P); adv(1);   // a cable from the generator makes the whole chain live
    if (!(P.pw > 0.9 && P2.pw > 0.9 && F.pw > 0.9)) bad.push(`after wiring the generator: pole ${P.pw}, pole2 ${P2.pw}, fan ${F.pw}`);
    if (!lampOn(P) || !lampOn(P2)) bad.push('lamp dark on a live pole');
    if (!/LIVE/.test(info(P).title)) bad.push('live pole readout: ' + info(P).title);
    if ((P3.pw || 0) > 0.05 || (F3.pw || 0) > 0.05 || lampOn(P3)) bad.push(`the unconnected pole is live: ${P3.pw} fan ${F3.pw}`);
    if (!/no generator/.test(text(F3))) bad.push('fan on the other dead pole: ' + text(F3));
    out(G); adv(1);   // out of fuel: the chain goes dark again, and says it is the fuel
    if ((F.pw || 0) > 0.05 || lampOn(P)) bad.push('pole stays live with an empty generator');
    if (!/out of fuel/.test(text(P)) || !/out of fuel/.test(text(F))) bad.push('no out-of-fuel reason: ' + text(F));
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.a-cable-of-near-maximum-length-works-and-longer-is-refused', async () => {
    reset(UP, false); const bad = []; S().items.cable = 5;
    const max = g.cables.max(); if (max !== 14) return `max ${max}, expected 14`;
    const a = pole(-13, 3), ok = pole(-13 + 13.8, 3), far = pole(-13 + 14.4, 3), meter = pole(-13 + 15, 5);   // 13.8 m, 14.4 m and about 15.6 m away
    const l1 = g.cables.lengthBetween(a, ok), l2 = g.cables.lengthBetween(a, far), l3 = g.cables.lengthBetween(a, meter);
    if (!(l1 <= max && l2 > max && l3 > max + 1)) return `test setup: lengths ${l1.toFixed(2)}, ${l2.toFixed(2)}, ${l3.toFixed(2)}`;
    const r1 = g.cables.connect(a.id, ok.id); if (!r1.ok) bad.push('a ' + l1.toFixed(1) + ' m cable was refused: ' + r1.why);
    const n0 = S().items.cable || 0;
    const r2 = g.cables.connect(a.id, far.id); if (r2.ok || !/Too far/.test(r2.why || '')) bad.push('a ' + l2.toFixed(1) + ' m cable was not refused: ' + JSON.stringify(r2));
    const r3 = g.cables.connect(a.id, meter.id); if (r3.ok) bad.push('a ' + l3.toFixed(1) + ' m cable was not refused');
    if ((S().items.cable || 0) !== n0 || S().cables.length !== 1) bad.push(`a refused cable changed things: items ${S().items.cable}, cables ${S().cables.length}`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.grid-range-and-superconducting-poles-only-lengthen-the-cable', async () => {
    const bad = [], want = (up, len) => { const t = tune({ power: 1, ...up }); if (t.cableLen !== len) bad.push(`${JSON.stringify(up)}: cableLen ${t.cableLen}, expected ${len}`); if (t.poleLink !== undefined || t.poleReach !== undefined) bad.push('range numbers exist'); };
    want({}, 14); want({ gridRange: 1 }, 18); want({ gridRange: 4 }, 30); want({ gridRange: 4, superPoles: 1 }, 38); want({ gridRange: 4, superPoles: 3 }, 54);
    reset({ ...UP, gridRange: 1 }, false); S().items.cable = 3;
    const a = pole(-13, 3), ok = pole(-13 + 17.4, 3), far = pole(-13 + 18.6, 3);
    if (!g.cables.connect(a.id, ok.id).ok) bad.push('17.4 m refused with Grid Range 1'); if (g.cables.connect(a.id, far.id).ok) bad.push('18.6 m accepted with Grid Range 1');
    const u = ctx.UPGRADES.find((x) => x.id === 'gridRange'), s = ctx.UPGRADES.find((x) => x.id === 'superPoles');
    if (/link|reach|pole/i.test(u.desc.replace(/Power Cable/g, '')) && /reach/i.test(u.desc)) bad.push('Grid Range still talks about range power: ' + u.desc);
    if (!/cable/i.test(u.desc) || !/cable/i.test(s.desc)) bad.push('upgrade descriptions do not say they lengthen the cable');
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.every-kind-of-machine-needs-its-own-cable-and-runs-on-it', async () => {
    reset({ ...UP, excavator: 1, dozer: 1, borer: 1, mech: 1, genOutput: 6 }, false); const bad = []; S().items.cable = 30;   // (192 kW per generator: no brownout to confuse the check)
    const G = gen(-9, 3), P = pole(-8.4, 3); wire(G, P);
    const ms = MACHINES.map((type, n) => mk(type, -6 + (n % 4) * 1.2, 4.2 + Math.floor(n / 4) * 1.2));
    adv(1.5); for (const m of ms) if ((m.pw || 0) > 0) bad.push(`${m.type} powered beside a live pole with no cable (${m.pw})`);
    const d0 = netOf(P).demand;
    for (const m of ms) { const r = g.cables.connect(P.id, m.id); if (!r.ok) bad.push(`${m.type}: ${r.why}`); }
    adv(1.5); for (const m of ms) if (!((m.pw || 0) > 0.9)) bad.push(`${m.type} not powered by its cable (${m.pw})`);
    if (!(netOf(P).demand > d0 + 5)) bad.push(`wired machines add no demand: ${d0} -> ${netOf(P).demand}`);
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  });

  await T('wire.a-machine-takes-one-cable-and-never-one-from-another-machine', async () => {
    reset(UP, false); const bad = []; S().items.cable = 10;
    const G = gen(-9, 3), P = pole(-8.4, 3), P2 = pole(-7, 3), F = fan(-6, 4), M = tile('mech', -5, 4); wire(G, P);
    if (!g.cables.connect(P.id, F.id).ok) bad.push('first cable refused');
    const r1 = g.cables.connect(P2.id, F.id); if (r1.ok || !/socket/.test(r1.why)) bad.push('a second cable into one machine was accepted: ' + JSON.stringify(r1));
    const r2 = g.cables.connect(F.id, M.id); if (r2.ok || !/not from another machine|socket/.test(r2.why)) bad.push('machine to machine accepted: ' + JSON.stringify(r2));
    const r3 = g.cables.connect(F.id, F.id); if (r3.ok) bad.push('a cable from a machine to itself');
    adv(1); if (!(F.pw > 0.9) || (M.pw || 0) > 0) bad.push(`powered: fan ${F.pw}, mech ${M.pw}`);
    // sockets: a pole takes ten, a generator four, a Portable two
    reset(UP, false); S().items.cable = 40; const HUB = pole(-5, 3), fans = []; for (let n = 0; n < 11; n++) fans.push(fan(-9 + (n % 6) * 1.2, 5 + Math.floor(n / 6) * 1.2));
    let okN = 0; for (const f of fans) if (g.cables.connect(HUB.id, f.id).ok) okN++;
    if (okN !== 10) bad.push(`a pole took ${okN} cables, expected 10`);
    const G4 = gen(-12, 8), ps = []; for (let n = 0; n < 5; n++) ps.push(pole(-13 + n * 1.2, 9.6)); okN = 0; for (const p of ps) if (g.cables.connect(G4.id, p.id).ok) okN++;
    if (okN !== 4) bad.push(`a generator took ${okN} cables, expected 4`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.a-belt-line-is-one-load-and-one-cable-endpoint', async () => {
    reset(UP, false); const bad = []; S().items.cable = 10;
    const G = gen(-12, 2), P = pole(-11, 3.6); wire(G, P);
    const line = []; for (let n = 0; n < 30; n++) line.push(tile('belt', -12 + n * 0.6, 6));        // 30 belts in a row, each handing over to the next
    const branch = tile('belt', -6, 6.6); branch.dir = 3; const gap = tile('belt', -12, 8.4); const lone = tile('belt', -3, 9);   // a side belt feeding the line, a belt 2.4 m away and one far off
    adv(1); for (const t of [...line, branch, gap, lone]) if ((t.pw || 0) > 0) bad.push('a belt is powered with no cable');
    if (!/Not wired/.test(text(line[5]))) bad.push('unwired belt readout: ' + text(line[5]));
    const mid = line[17], r = g.cables.connect(P.id, mid.id); if (!r.ok) return 'cable to a belt refused: ' + r.why;
    adv(1);
    const unpowered = line.filter((t) => !(t.pw > 0.9)).length; if (unpowered) bad.push(`${unpowered} of 30 line tiles not powered by one cable on tile 17`);
    if (!(branch.pw > 0.9)) bad.push('the side belt that feeds the line is not on it: ' + branch.pw);
    if ((gap.pw || 0) > 0 || (lone.pw || 0) > 0) bad.push(`a belt not connected to the line is powered: ${gap.pw} ${lone.pw}`);
    const net = netOf(P), want = [...line, branch].reduce((a, t) => a + beltKw(t), 0); if (!net || Math.abs(net.demand - want) > 1e-6) bad.push(`the line draws ${net && net.demand} kW, the sum of its 31 tiles is ${want}`);
    if (!/Line of 31 tiles powered through a cable at tile/.test(text(line[2]))) bad.push('line readout on the first tile: ' + text(line[2]));
    if (!/Line of 31 tiles powered through a cable at tile/.test(text(mid))) bad.push('line readout on the wired tile: ' + text(mid));
    const r2 = g.cables.connect(P.id, line[3].id); if (r2.ok || !/line already has a cable/.test(r2.why || '')) bad.push('a second cable on the line was accepted: ' + JSON.stringify(r2));
    // the demand is the sum of the tiles: adding a tile to the line adds its kW once
    const d1 = netOf(P).demand; const extra = tile('belt', -12 + 30 * 0.6, 6); adv(1); const d2 = netOf(P).demand; if (!(d2 > d1 && extra.pw > 0.9)) bad.push(`a tile added to the line: demand ${d1} -> ${d2}, pw ${extra.pw}`);
    // taking the cable away turns the whole line off
    g.cables.remove(S().cables.find((c) => c.a === P.id && c.b === mid.id).id, true); adv(1);
    if ([...line, branch, extra].some((t) => (t.pw || 0) > 0)) bad.push('the line stays powered after its cable was removed');
    // cutting the line in two: only the part with the cable is powered
    g.cables.connect(P.id, line[2].id); adv(1); const cut = line[10]; g.doDecon({ kind: 'tile', id: cut.id }); adv(1);
    const head = line.slice(0, 10).every((t) => t.pw > 0.9), tail = line.slice(11).every((t) => (t.pw || 0) === 0);
    if (!head || !tail) bad.push(`cut the line at tile 10: head powered ${head}, tail dark ${tail}`);
    return bad.length === 0 || bad.slice(0, 5).join('; ');
  });

  await T('wire.removing-a-cable-a-pole-or-a-generator-re-solves-the-grid', async () => {
    reset(UP, false); const bad = []; S().items.cable = 10;
    const G = gen(-10, 3), P1 = pole(-8, 3), P2 = pole(-4, 3), F = fan(-4, 4.2); wire(G, P1); wire(P1, P2); wire(P2, F); adv(1);
    if (!(F.pw > 0.9)) return 'setup: ' + F.pw;
    const cab = S().cables.find((c) => (c.a === P1.id && c.b === P2.id)); g.cables.remove(cab.id, true); adv(0.5);
    if ((F.pw || 0) > 0.05 || (P2.pw || 0) > 0.05) bad.push('removing the middle cable left the far side powered');
    if (g.power.nets.length !== 2) bad.push('grids after cutting the cable: ' + g.power.nets.length);
    wire(P1, P2); adv(0.5); if (!(F.pw > 0.9)) bad.push('re-wiring did not restore power: ' + F.pw);
    g.doDecon({ kind: 'tile', id: P1.id }); adv(0.5); if ((F.pw || 0) > 0.05) bad.push('taking down the middle pole left the fan powered');
    if (S().cables.some((c) => c.a === P1.id || c.b === P1.id)) bad.push('the pole took its cables with it? no: they should be gone');
    wire(G, P2); adv(0.5); if (!(F.pw > 0.9)) bad.push('wiring the generator straight to the second pole: ' + F.pw);
    g.doDecon({ kind: 'tile', id: G.id }); adv(0.5); if ((F.pw || 0) > 0.05) bad.push('taking down the generator left the fan powered');
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.a-generator-does-not-push-power-into-a-grid-it-is-not-wired-to', async () => {
    reset(UP, false); const bad = []; S().items.cable = 10;
    const G1 = gen(-9, 3), G2 = gen(-9, 7), P = pole(-8, 4.2), fans = [0, 1, 2, 3, 4, 5].map((n) => fan(-6 + (n % 3) * 1.2, 4.2 + Math.floor(n / 3) * 1.2));
    wire(G1, P); for (const f of fans) wire(P, f); adv(1);   // 6 fans x 2 kW = 12 kW wanted, one 8 kW generator
    const n1 = netOf(P); if (!n1 || !(n1.sat < 0.7 && n1.sat > 0.6)) bad.push('one generator on 12 kW: sat ' + (n1 && n1.sat));
    if (netOf(G2).supply !== 8 || netOf(G2).demand !== 0) bad.push('the loose generator is not its own grid: ' + JSON.stringify([netOf(G2).supply, netOf(G2).demand]));
    if (!(fans[0].pw < 0.7)) bad.push('a generator that is not wired helped the grid: fan ' + fans[0].pw);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.the-info-panel-says-not-wired-then-powered-and-the-cable-count-shows', async () => {
    reset(UP, false); const bad = []; S().items.cable = 3;
    const G = gen(-9, 3), P = pole(-8, 4.2), F = fan(-6, 4.2); adv(0.5);
    if (!/Not wired: run a cable to it/.test(text(F))) bad.push('fan: ' + text(F));
    if (!/NOT WIRED/.test(text(G))) bad.push('generator: ' + text(G));
    selectTool('cable'); adv(0.2); aimPoint(cellX(F.i), 0.3, cellZ(F.k), 2); adv(0.1);
    if (!/3 cables left/.test(document.getElementById('hint').textContent)) bad.push('the hint does not count the cables: ' + document.getElementById('hint').textContent);
    wire(G, P); wire(P, F); adv(1);
    if (!/Powered 100%/.test(text(F)) || /Not wired/.test(text(F))) bad.push('after wiring: ' + text(F));
    if (!/Power Pole/.test(text(F))) bad.push('the readout does not name the pole it is wired to: ' + text(F));
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.the-first-generator-says-it-needs-a-wire-once', async () => {
    reset(UP, false); delete S().stats.hintGenWire; const bad = []; const hint = () => document.getElementById('hint').textContent;
    const r = await ctx.placeAtFloor('gen', -9, -1.2); if (!r.ok) return 'could not place a generator: ' + r.why;
    if (!/powers nothing until it is wired/.test(hint())) bad.push('first generator hint: ' + hint());
    document.getElementById('hint').textContent = ''; g.ui.hint('', 0);
    const r2 = await ctx.placeAtFloor('gen', -9, 1.2); if (!r2.ok) return 'second generator: ' + r2.why;
    if (/powers nothing until it is wired/.test(hint())) bad.push('the generator hint repeated');
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.cable-ends-show-sockets-and-the-aimed-end-gets-a-halo', async () => {
    reset(UP, false); const bad = []; S().items.cable = 5;
    const G = gen(-8, 3), P = pole(-6, 3), F = fan(-4, 3), far = fan(10, 3); craft('cable', 1); adv(0.5);
    g.cables.redrawSockets(); const n0 = g.cables.sockLamp.count; if (n0 < 2) bad.push('no sockets drawn on a generator and a pole: ' + n0);
    const sk = g.cables.attach(P); if (Math.abs(sk[1] - 1.45) > 0.01) bad.push('pole socket at ' + sk[1]);
    selectTool('cable'); adv(0.2);
    aimPoint(cellX(G.i), 0.3, cellZ(G.k), 2); adv(0.1); if (!g.cables.halo || g.cables.halo.color !== 'gold') bad.push('first end halo: ' + JSON.stringify(g.cables.halo));
    g.cables.click(g.curTool()); if (g.cables.from !== G.id) bad.push('could not start the wire');
    aimPoint(cellX(P.i), 0.3, cellZ(P.k), 2); adv(0.1); if (!g.cables.halo || g.cables.halo.color !== 'green') bad.push('valid second end halo: ' + JSON.stringify(g.cables.halo));
    aimPoint(cellX(far.i), 0.3, cellZ(far.k), 2); adv(0.1); if (!g.cables.halo || g.cables.halo.color !== 'red') bad.push('too far halo: ' + JSON.stringify(g.cables.halo));
    if (!/Too far/.test(document.getElementById('hint').textContent)) bad.push('too far hint: ' + document.getElementById('hint').textContent);
    g.cables.cancel(); g.stowed = true; adv(0.3); if (g.cables.haloMesh.visible) bad.push('the halo stays when the cable is put away');
    void F;
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.unwired-machines-near-you-show-a-gold-socket', async () => {
    reset(UP, false); const bad = []; S().items.cable = 5;
    const G = gen(-9, 3), P = pole(-8, 4.2), F = fan(-6, 4.2), F2 = fan(-5, 4.2); ctx.p().pos.set(-6, 0, 2); wire(G, P); wire(P, F2); g.cables.redrawSockets();
    const c = new ctx.THREE.Color(), cols = []; for (let n = 0; n < g.cables.sockLamp.count; n++) { g.cables.sockLamp.getColorAt(n, c); cols.push([c.r.toFixed(1), c.g.toFixed(1), c.b.toFixed(1)].join(',')); }
    if (!cols.some((x) => /^2\.6,1\.9,0\.3$/.test(x))) bad.push('no gold socket on the unwired fan: ' + cols.join(' '));
    wire(P, F); g.cables.redrawSockets(); const n2 = [...Array(g.cables.sockLamp.count).keys()].filter((n) => { g.cables.sockLamp.getColorAt(n, c); return Math.abs(c.r - 2.6) < 0.01 && Math.abs(c.g - 1.9) < 0.01; }).length;
    if (n2 !== 0) bad.push('a gold socket remains with every machine wired: ' + n2);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.cables-keep-their-grid-after-save-and-load-and-an-old-save-loads-unwired', async () => {
    reset(UP, false); const bad = []; S().items.cable = 10;
    const G = gen(-9, 3), P = pole(-8, 4.2), F = fan(-6, 4.2); wire(G, P); wire(P, F); adv(1); if (!(F.pw > 0.9)) return 'setup ' + F.pw;
    const { SAVE_KEY } = await import('../config.js'), { loadSaved } = await import('../state.js');
    const saveAndLoad = async () => { g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) throw new Error('g.save() failed'); const saved = loadSaved(); g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play'; void SAVE_KEY; };
    const before = JSON.stringify(S().cables); await saveAndLoad(); adv(1.5);
    if (JSON.stringify(S().cables) !== before) bad.push('cables changed in the save: ' + JSON.stringify(S().cables));
    const F2 = L().byId.get(F.id), P2 = L().byId.get(P.id); if (!F2 || !(F2.pw > 0.9) || !(P2.pw > 0.9)) bad.push(`after load: fan ${F2 && F2.pw}, pole ${P2 && P2.pw}`);
    // an old save: the same machines, no cable list (they relied on range). It loads and everything is simply unwired. Junk records are dropped.
    S().cables = [null, 7, 'x', { a: 1 }, { id: 1, a: 99999, b: 99998 }]; await saveAndLoad(); adv(1.5);
    if (S().cables.length !== 0) bad.push('junk cable records survive a load: ' + JSON.stringify(S().cables));
    const F3 = L().byId.get(F.id); if (!F3 || (F3.pw || 0) > 0) bad.push('an unwired fan is powered after loading a save with no cables: ' + (F3 && F3.pw));
    delete S().cables; await saveAndLoad(); adv(1); if (!Array.isArray(S().cables)) bad.push('a save with no cable list did not load');
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.solve-cost-with-500-consumers-60-nodes-and-200-cables', async () => {
    reset({ ...UP, genOutput: 4 }, false); const bad = [];
    const i0 = toI(-13.5), k0 = toK(0.3), at = (c, r) => [cellX(i0 + c), cellZ(k0 + r)];   // a grid of cells, 0.6 m apart: every tile gets its own cell
    const nodes = []; for (let n = 0; n < 50; n++) { const [x, z] = at(n < 40 ? n : 79 - n, n < 40 ? 5 : 6); nodes.push(pole(x, z)); }   // rows 5 and 6, in the middle of the layout (the second row runs back, so the chain stays short)
    const gens = []; for (let n = 0; n < 10; n++) { const [x, z] = at(n * 4, 7); gens.push(gen(x, z)); }                               // row 7
    for (let n = 1; n < nodes.length; n++) wire(nodes[n - 1], nodes[n]);                                                               // 49 cables: a chain
    for (let n = 0; n < gens.length; n++) wire(gens[n], nodes[n * 4]);                                                                 // 10 more
    const near = (e, list) => list.map((p) => [Math.hypot(cellX(p.i) - cellX(e.i), cellZ(p.k) - cellZ(e.k)), p]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const hook = (e) => { for (const p of near(e, nodes)) if (wire(p, e).ok) return true; return false; };
    const lines = []; for (let r = 0; r < 8; r++) { const row = []; for (let c = 0; c < 38; c++) { const [x, z] = at(c, 8 + r); row.push(tile('belt', x, z)); } lines.push(row); }   // 8 belt lines of 38 tiles = 304 consumers on 8 cables
    for (const row of lines) hook(row[19]);
    const single = []; for (let q = 0; q < 196; q++) { const [x, z] = at(q % 40, 16 + Math.floor(q / 40)); single.push(q % 3 ? fan(x, z) : tile('sorter', x, z)); }       // 196 machines, one cable each
    for (const e of single) hook(e);
    const cabs = S().cables.length, consumers = 304 + single.length; adv(0.5);
    const t0 = performance.now(); const N = 20; for (let q = 0; q < N; q++) g.power.recompute(); const ms = (performance.now() - t0) / N;
    const powered = single.filter((e) => (e.pw || 0) > 0).length, litBelts = lines.flat().filter((e) => (e.pw || 0) > 0).length;
    console.log(`wire.solve-cost: ${consumers} consumers, ${nodes.length + gens.length} nodes, ${cabs} cables, ${ms.toFixed(2)} ms per solve, ${powered} machines and ${litBelts} belts powered`);
    window.__extra = { ...(window.__extra || {}), solveCost: { consumers, nodes: nodes.length + gens.length, cables: cabs, msPerSolve: +ms.toFixed(2) } };   // (the harness reads it)
    if (!(ms < 40)) bad.push(`a solve takes ${ms.toFixed(1)} ms`);
    if (cabs < 200) bad.push('test setup: only ' + cabs + ' cables');
    if (litBelts !== 304) bad.push(`${litBelts} of 304 belt tiles powered (one cable each line)`);
    if (powered < 150) bad.push(`only ${powered} of ${single.length} wired machines powered`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.a-weak-cable-throws-sparks-a-live-one-is-green-a-dead-one-red', async () => {
    reset(UP, false); const bad = []; S().items.cable = 20; ctx.p().pos.set(-6, 0, 2);
    const G = gen(-8, 3), P = pole(-6.6, 3), fans = [0, 1, 2, 3, 4, 5].map((n) => fan(-5 + (n % 3) * 1.2, 4.2 + Math.floor(n / 3) * 1.2));
    wire(G, P); wire(P, fans[0]); adv(1); g.cables.redraw(); const col = (n) => { const c = new ctx.THREE.Color(); g.cables.mesh.getColorAt(n, c); return c; };
    const kind = (c) => (c.g >= c.r && c.g >= c.b ? 'green' : c.r > c.g * 3 ? 'red' : 'orange');
    if (kind(col(0)) !== 'green' || g.cables.hot.length) bad.push('a live cable is ' + kind(col(0)) + ', hot ' + g.cables.hot.length);
    for (const f of fans.slice(1)) wire(P, f); adv(1); g.cables.redraw();   // 12 kW on 8 kW: a brownout
    if (kind(col(0)) !== 'orange' || g.cables.hot.length < 1) bad.push('a weak cable is ' + kind(col(0)) + ', hot ' + g.cables.hot.length);
    g.cables.sparkT = 0; g.cables.updateSparks(0.2); if (!(g.cables.sparks.count > 0)) bad.push('a weak cable throws no sparks');
    G.burn = 0; G.q = []; G.lit = false; adv(1); g.cables.redraw(); g.cables.sparkT = 0; g.cables.updateSparks(0.2);
    if (kind(col(0)) !== 'red' || g.cables.hot.length || g.cables.sparks.count) bad.push('a dead cable is ' + kind(col(0)) + ', sparks ' + g.cables.sparks.count);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.the-guide-power-page-and-the-docs-teach-wires-with-the-real-numbers', async () => {
    reset(UP, false); const bad = [], b = (await import('../guide.js')).guidePages().find((x) => /POWER NEEDS WIRES/.test(x.title)); if (!b) return 'no power page in the guide';
    const t = JSON.stringify([b.title, b.rows, b.foot]);
    if (!/cable/i.test(t) || !/pole/i.test(t) || !/generator/i.test(t) || !new RegExp(String(g.T.cableLen) + ' m').test(t)) bad.push('page text: ' + t.slice(0, 200));
    if (!/two generators/i.test(t) || /reach|range link|plug-in/i.test(t)) bad.push('page says something about range or misses the generators adding: ' + t.slice(0, 200));
    g.ui.open('howto'); const how = document.getElementById('howto').textContent; g.ui.closeModals(); if (!/Power travels only through cables/.test(how) || /Out of pole reach/.test(how)) bad.push('how to play');
    const rows = JSON.stringify(ctx.recipes(g).filter((r) => ['pole', 'cable', 'gen'].includes(r.id)).map((r) => r.desc + ' ' + (r.use || '')));
    if (/reach 25|within reach|pole reach|links generators/i.test(rows)) bad.push('a bench description still talks about range power: ' + rows.slice(0, 160));
    return bad.length === 0 || bad.join('; ');
  });

  void part;
}
