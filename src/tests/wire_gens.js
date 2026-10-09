// Two generators add together: a cable between two generators (or both into one pole) merges them into one grid whose supply is the sum, for every rung, with
// batteries and breakers, and each generator still burns its own fuel at its own output. Prefix `wire.`.
import { makeKit, UP } from './power_lib.js';
import { infoFor } from '../info.js';
import { GEN_KINDS, genKw } from '../powerparts.js';

export default async function (ctx) {
  const { T, g, S, L, adv } = ctx;
  const K = makeKit(ctx);
  const { reset, tile, gen, pole, fan, part, wire, netOf } = K;
  const info = (e) => infoFor(g, { kind: g.logi.byId.get(e.id) ? 'tile' : 'mach', id: e.id });
  const text = (e) => { const r = info(e); return r ? [r.title, ...r.lines].join(' | ') : ''; };
  const rung = (key, x, z) => { const t = tile('gen', x, z, key === 'std' ? {} : { gk: key }); t.burn = 1e5; t.burnMax = 1e5; t.lit = true; return t; };
  const fans = (n, x0, z0) => Array.from({ length: n }, (_, q) => fan(x0 + (q % 4) * 1.2, z0 + Math.floor(q / 4) * 1.2));
  const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

  await T('wire.two-generators-wired-together-add-their-power-and-unplugging-drops-back', async () => {
    reset(UP, false); const bad = []; S().items.cable = 30;
    const G1 = gen(-10, 3), G2 = gen(-10, 6), P = pole(-8, 4.2), F = fans(6, -6, 4.2);   // 6 fans = 12 kW wanted; one generator gives 8 kW, two give 16
    wire(G1, P); for (const f of F) wire(P, f); adv(1);
    const n1 = netOf(P); if (!n1 || !near(n1.supply, 8) || !(n1.sat < 0.7 && n1.sat > 0.6)) bad.push('one generator on 12 kW: supply ' + (n1 && n1.supply) + ' sat ' + (n1 && n1.sat));
    const low = F[0].pw;
    if (!near(netOf(G2).supply, 8) || netOf(G2) === n1) bad.push('the unwired second generator is part of the grid');
    if (!(F[0].pw < 0.7)) bad.push('an unwired generator raised the grid');
    // generator to generator
    const r = g.cables.connect(G1.id, G2.id); if (!r.ok) return 'generator to generator refused: ' + r.why; adv(1);
    const n2 = netOf(P); if (!n2 || n2 !== netOf(G2) || !near(n2.supply, 16) || !near(n2.sat, 1) || n2.gens.length !== 2) bad.push(`two generators wired: supply ${n2 && n2.supply}, sat ${n2 && n2.sat}, gens ${n2 && n2.gens.length}`);
    if (!F.every((f) => f.pw > 0.99)) bad.push('the fans are not at full power with 16 kW for 12 kW: ' + F.map((f) => f.pw.toFixed(2)).join(' '));
    // demand above one generator but below two: powers the machines only when wired
    const t = text(G1), tp = text(P);
    if (!/2 generators wired together/.test(t) || !/16\.0 kW supplied/.test(t) || !/12\.0 kW wanted/.test(t)) bad.push('generator readout: ' + t);
    if (!/puts out 8\.0 kW of the grid's 16\.0 kW \(50%\)/.test(t) || !/carries 6\.0 kW of the load/.test(t)) bad.push('per generator share: ' + t);
    if (!/2 generators wired together/.test(tp) || !/16\.0 kW supplied/.test(tp) || !/LIVE/.test(tp)) bad.push('pole readout: ' + tp);
    // unplug: back to one generator and a brownout
    g.cables.remove(S().cables.find((c) => (c.a === G1.id && c.b === G2.id)).id, true); adv(1);
    const n3 = netOf(P); if (!n3 || !near(n3.supply, 8) || !(F[0].pw < 0.7) || !near(F[0].pw, low, 0.01)) bad.push(`after unplugging: supply ${n3 && n3.supply}, fan ${F[0].pw} (was ${low})`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.two-generators-into-one-pole-add-and-a-third-adds-again', async () => {
    reset(UP, false); const bad = []; S().items.cable = 30;
    const P = pole(-8, 4.2), Gs = [gen(-11, 2), gen(-11, 4.2), gen(-11, 6.4)], F = fans(7, -6, 4.2);   // 7 fans = 14 kW (the pole has 10 sockets: seven fans and three generators)
    for (const f of F) wire(P, f); wire(Gs[0], P); adv(1);
    if (!near(netOf(P).supply, 8) || !(F[0].pw < 0.6)) bad.push('one generator on 14 kW: ' + netOf(P).supply + ' sat ' + netOf(P).sat);
    wire(Gs[1], P); adv(1); if (!near(netOf(P).supply, 16) || !(F[0].pw > 0.99)) bad.push('two generators into one pole: supply ' + netOf(P).supply + ' fan ' + F[0].pw);
    wire(Gs[2], P); adv(1); if (!near(netOf(P).supply, 24) || netOf(P).gens.length !== 3 || !(F[0].pw > 0.99)) bad.push('three generators: supply ' + netOf(P).supply);
    g.doDecon({ kind: 'tile', id: Gs[1].id }); adv(1); if (!near(netOf(P).supply, 16)) bad.push('taking one generator down: supply ' + netOf(P).supply);
    g.doDecon({ kind: 'tile', id: Gs[0].id }); g.doDecon({ kind: 'tile', id: Gs[2].id }); adv(1); if ((F[0].pw || 0) > 0.05 || netOf(P).supply !== 0) bad.push('no generators left: fan ' + F[0].pw + ' supply ' + netOf(P).supply);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.every-rung-of-the-generator-ladder-adds-to-the-grid-with-batteries-and-breakers', async () => {
    reset({ ...UP, genOutput: 0 }, false); const bad = []; S().items.cable = 60;
    const P = pole(-8, 3), Gs = GEN_KINDS.map((k, n) => rung(k.key, -13 + (n % 3) * 2.4, 6 + Math.floor(n / 3) * 2.4));
    const batt = part('battery', -6, 3, { mark: 1 }), br = part('breaker', -6, 5);
    for (const gg of Gs) if (!wire(gg, P).ok) bad.push('could not wire a ' + gg.gk);
    wire(batt, P); wire(br, P); adv(1.5);
    const want = Gs.reduce((a, t) => a + genKw(g.T, t), 0), net = netOf(P);
    if (!net || !near(net.gen, want, 1e-6) || net.gens.length !== 6 || !near(net.supply, want, 1e-6)) bad.push(`six rungs wired into one pole: gen ${net && net.gen}, wanted ${want}, count ${net && net.gens.length}`);
    if (!(net.batts.length === 1 && net.breakers.length === 1)) bad.push('battery and breaker are not on the grid');
    if (!(net.flow > 0) || !(batt.charge > 0)) bad.push(`the battery does not charge from the surplus: flow ${net.flow}, charge ${batt.charge}`);
    if (!near(net.cap, want, 1e-6)) bad.push('rated output is not the sum: ' + net.cap);
    // each rung's share of the output is its own
    for (const q of net.gens) if (!near(q.out, genKw(g.T, q.e), 1e-6)) bad.push('a rung puts out the wrong kW: ' + q.out);
    return bad.length === 0 || bad.slice(0, 4).join('; ');
  });

  await T('wire.a-breaker-trips-an-overloaded-grid-and-a-second-generator-wired-in-relieves-it', async () => {
    reset(UP, false); const bad = []; S().items.cable = 30;
    const G1 = gen(-11, 2), G2 = gen(-11, 5), P = pole(-8, 3.6), br = part('breaker', -6, 6), F = fans(6, -6, 1.2); wire(G1, P); wire(br, P); for (const f of F) wire(P, f); adv(5);
    if (!netOf(P).tripped || !br.tripped) bad.push('12 kW on one 8 kW generator did not trip the breaker in 5 s');
    if (F.some((f) => (f.pw || 0) > 0)) bad.push('a tripped grid still powers fans');
    wire(G2, P); br.tripped = false; g.power.markDirty(); adv(6);
    if (netOf(P).tripped || br.tripped) bad.push('the breaker tripped again with two generators for 12 kW');
    if (!F.every((f) => f.pw > 0.99)) bad.push('fans not at full power after the second generator: ' + F[0].pw);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.each-generator-burns-its-own-fuel-at-its-own-output-whatever-the-grid-wants', async () => {
    reset(UP, false); const bad = []; S().items.cable = 30;
    const G1 = gen(-11, 2), G2 = rung('turbine', -11, 5), P = pole(-8, 3.6), F = fans(2, -6, 1.2);   // 4 kW wanted on 8 + 48 kW
    wire(G1, P); wire(G2, P); for (const f of F) wire(P, f); adv(1);
    const b1 = G1.burn, b2 = G2.burn; adv(10);
    // both burn their fuel in game time regardless of the load: one second of burn per second
    if (!near(b1 - G1.burn, 10, 0.2) || !near(b2 - G2.burn, 10, 0.2)) bad.push(`burn used ${(b1 - G1.burn).toFixed(2)} and ${(b2 - G2.burn).toFixed(2)} s in 10 s`);
    const net = netOf(P); const carry1 = G1.cache.carry, carry2 = G2.cache.carry;
    if (!near(carry1 + carry2, net.demand, 1e-6) || !(near(carry1 / carry2, 8 / 48, 1e-6))) bad.push(`the load is shared by output: ${carry1} and ${carry2} for ${net.demand} kW`);
    if (!/carries/.test(text(G2))) bad.push('turbine readout: ' + text(G2));
    return bad.length === 0 || bad.join('; ');
  });

  await T('wire.a-reserve-generator-in-a-wired-grid-holds-its-fuel-until-the-grid-needs-it', async () => {
    reset(UP, false); const bad = []; S().items.cable = 30;
    const G1 = gen(-11, 2), G2 = tile('gen', -11, 5, { mode: 'reserve' }), P = pole(-8, 3.6); G2.q = [{ sp: 2, vr: 0 }, { sp: 2, vr: 0 }]; G2.burn = 0;
    const F = fans(2, -6, 1.2); wire(G1, P); wire(G2, P); for (const f of F) wire(P, f); adv(2);
    if (G2.burn > 0 || G2.q.length !== 2) bad.push(`the reserve generator burned with 4 kW wanted of 8: burn ${G2.burn}, hopper ${G2.q.length}`);
    const more = fans(4, -6, 4.8); for (const f of more) wire(P, f); adv(2);   // now 12 kW wanted, 8 burning
    if (!(G2.burn > 0)) bad.push('the reserve generator did not start when the wired grid needed it');
    if (!near(netOf(P).supply, 16)) bad.push('supply after the reserve started: ' + netOf(P).supply);
    return bad.length === 0 || bad.join('; ');
  });
}
