// botfuel.rule-*: ONE fuel rule for every machine that eats plush. Each holds 50 plush by default (the generator ladder and Fuel Hoppers raise a generator's hopper as they always did),
// takes Common to Epic and never a 51st, and rarity decides how long a plush runs a generator or how much charge it gives the Charging Station. Hands, throws, belts, bins and bots
// all go through the same two questions (botfuel.js fuelRoom and fuelAccepts). Run: `await __selftest('botfuel.rule-')`
import { kit, UP, sp, mixOf, rar } from './botfuel_lib.js';
import * as FUEL from '../botfuel.js';
import * as PP from '../powerparts.js';
import { LOGI, CHARGE_PER, CHARGER_HOPPER } from '../logistics.js';
import { BURN_SECONDS, burnTime } from '../power.js';
import { NEEDLE, DECOY0 } from '../plushdata.js';

export default async function (ctx) {
  const { g, S, L, sim, cellX, cellZ, toI, toK, species } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const opt = { up: UP };
  const FULL = { ...UP, genOutput: 1, genTurbine: 1, genPlant: 1, genStation: 1, genTitan: 1 };

  await G('botfuel.rule-inventory-only-generators-and-the-charging-station-eat-plush-and-all-say-fifty', async () => {
    const bad = [];
    for (const type of [...LOGI]) {
      const t = type === 'belt' ? K.rawTile('belt', toI(-3.4), toK(3.0), { items: [] }) : K.rawTile(type, toI(-3.4 + 0.6 * [...LOGI].indexOf(type)), toK(3.0));
      const fed = type === 'gen' || type === 'charger';
      if (FUEL.isFueled(t) !== fed) bad.push(`${type} isFueled ${FUEL.isFueled(t)}`);
      if (fed && FUEL.fuelCap(g, t) !== 50) bad.push(`${type} holds ${FUEL.fuelCap(g, t)}`);
      if (!fed && (FUEL.fuelCap(g, t) !== 0 || FUEL.fuelRoom(g, t) !== 0 || FUEL.fuelAccepts(g, t, { sp: sp(0), vr: 0 }))) bad.push(`${type} looks like a fuel machine`);
      if (!fed && (type === 'mech' || type === 'fan' || type === 'pole') && g.logi.accept(t, { sp: sp(0), vr: 0 }, null)) bad.push(`${type} takes plush`);
    }
    if (CHARGER_HOPPER !== 50 || FUEL.FUEL_HOLD !== 50) bad.push('constants');
    for (const k of PP.GEN_KINDS) { const cap = PP.genHopper(g.T, { gk: k.key === 'std' ? undefined : k.key }); if (cap < 50 || cap % 50) bad.push(`${k.key} hopper ${cap}`); }
    return bad.length === 0 || bad.join('; ');
  }, opt);

  await G('botfuel.rule-every-machine-takes-fifty-and-never-a-51st-by-any-road', async () => {
    const bad = [];
    const mk = { std: () => K.gen(-3.4, 3.0), portable: () => K.gen(-3.4, 3.0, { gk: 'portable' }), charger: () => K.charger(-3.4, 3.0) };
    for (const [name, make] of Object.entries(mk)) {
      let t = make(); t.dig = 1e9;   // (a station's hopper would otherwise feed its reserve)
      let n = 0; while (g.logi.accept(t, { sp: sp(n % 4), vr: 0 }, null) && n < 200) n++;
      if (n !== 50 || t.q.length !== 50) bad.push(`${name}: accept took ${n}`);
      if (FUEL.fuelRoom(g, t) !== 0 || FUEL.fuelAccepts(g, t, { sp: sp(0), vr: 0 })) bad.push(`${name}: fuelRoom ${FUEL.fuelRoom(g, t)}`);
      // hands
      S().carry = mixOf(Array(5).fill(0)); g.T.carry = 80; g.useTile(t); if (t.q.length !== 50 || S().carry.length !== 5) bad.push(`${name}: hands put in ${t.q.length}, ${S().carry.length} left (5 wanted)`);
      // throws
      sim().n; const keep = sim().n; ctx.clearBodies(); const gx = cellX(t.i), gz = cellZ(t.k), gy = t.j * 0.6; sim().spawn(sp(0), 0, gx + 0.3, gy + 1.0, gz, 0, 0, 0, 1);
      if (name === 'charger') g.feedChargersFromThrows(); else g.feedGensFromThrows(); if (sim().n !== keep + 1 || t.q.length !== 50) bad.push(`${name}: a throw got in (${t.q.length})`); ctx.clearBodies();
      // a bot standing next to it with a bucket
      const b = K.mkBot(gx - 1.2, gz); b.carry = mixOf([0, 0, 0]); b.state = 'return'; b.path = [[gx - 1.2, gz]]; b.pi = 0; if (FUEL.tryTopUp(g.crew, b)) bad.push(`${name}: a bot set off to fill a full hopper`);
      g.logi.remove(t); S().entities = S().entities.filter((e) => e.id !== t.id);
    }
    // the hopper upgrade and the bigger rungs raise a generator's, not the station's
    g.T.genBuffer = 100; const std = K.gen(-3.4, 3.0), tur = K.gen(-2.2, 3.0, { gk: 'turbine' }), ch = K.charger(-1.0, 3.0); ch.dig = 1e9;
    let a = 0, c = 0, d = 0; for (let n = 0; n < 500; n++) { if (g.logi.accept(std, { sp: sp(0), vr: 0 }, null)) a++; if (g.logi.accept(tur, { sp: sp(0), vr: 0 }, null)) c++; if (g.logi.accept(ch, { sp: sp(0), vr: 0 }, null)) d++; }
    if (a !== 100 || c !== 200 || d !== 50) bad.push(`with Fuel Hoppers 2 the Generator took ${a} (100), the Turbine ${c} (200), the Station ${d} (50)`);
    return bad.length === 0 || bad.join('; ');
  }, opt);

  await G('botfuel.rule-a-belt-line-stops-at-fifty-and-the-rest-waits-on-the-belt', async () => {
    const out = [];
    for (const type of ['gen', 'charger']) {
      for (const t of [...L().tiles.values()]) if (t.type !== 'belt' || !t.free) L().remove(t);
      const belts = [0, 1, 2].map((n) => K.rawTile('belt', toI(-6.0) + n, toK(3.0), { items: [] })); const t = type === 'gen' ? K.gen(-6.0 + 0.6 * 3, 3.0) : K.charger(-6.0 + 0.6 * 3, 3.0); t.dig = 1e9;
      let sent = 0; K.step(60, 0.05, () => { if (sent < 80 && g.logi.accept(belts[0], { sp: sp(0), vr: 0 }, null)) sent++; return false; });
      const onBelt = belts.reduce((a, bt) => a + bt.items.length, 0);
      if (t.q.length !== 50 || onBelt + t.q.length !== sent) out.push(`${type}: hopper ${t.q.length}, on the belts ${onBelt}, fed in ${sent}`);
      for (const bt of belts) L().remove(bt); L().remove(t);
    }
    return out.length === 0 || out.join('; ');
  }, opt);

  await G('botfuel.rule-the-one-specials-legendary-and-nonsense-are-never-taken', async () => {
    const bad = [], gn = K.gen(-3.4, 3.0), ch = K.charger(-1.0, 3.0);
    for (const t of [gn, ch]) for (const s of [sp(4), sp(5), sp(6), NEEDLE, DECOY0, DECOY0 + 3, 60005, 60006, 60007, 60008, 0, -1, 99999, NaN, undefined, '3']) if (g.logi.accept(t, { sp: s, vr: 0 }, null) || FUEL.fuelAccepts(g, t, { sp: s, vr: 0 })) bad.push(`${t.type} took ${s}`);
    if (g.logi.accept(gn, null, null) || g.logi.accept(gn, {}, null)) bad.push('an empty item was taken');
    return bad.length === 0 || bad.join('; ');
  }, opt);

  await G('botfuel.rule-rarity-decides-how-long-a-plush-runs-a-generator-270-720-1800-4500-s-at-8-kw', async () => {
    const bad = [];
    if (BURN_SECONDS.slice(0, 4).join() !== '270,720,1800,4500') bad.push('table ' + BURN_SECONDS);
    for (const [key, kw] of [[undefined, 8], ['portable', 2], ['turbine', 48]]) {
      for (let r = 0; r <= 3; r++) {
        const t = K.gen(-3.4, 3.0, { gk: key, burn: 0, burnMax: 0 }); t.q.push({ sp: sp(r), vr: 0 }); const want = BURN_SECONDS[r] * 8 / kw;
        if (Math.abs(FUEL.runSeconds(g, t, r) - want) > 1e-9 || Math.abs(burnTime(r, PP.genKw(g.T, t)) - want) > 1e-9) bad.push(`${key || 'std'} r${r}: table ${FUEL.runSeconds(g, t, r)} want ${want}`);
        let lit = 0; for (let n = 0; n < Math.ceil(want * 4) + 400 && (n < 4 || t.burn > 0 || t.q.length); n++) { g.time += 0.25; g.power.update(0.25); if (t.burn > 0) lit += 0.25; if (lit > 0 && !(t.burn > 0)) break; }
        if (Math.abs(lit - want) > 0.6) bad.push(`${key || 'std'} r${r}: really ran ${lit.toFixed(1)} s, want ${want}`);
        L().remove(t);
      }
    }
    return bad.length === 0 || bad.join('; ');
  }, opt);

  await G('botfuel.rule-rarity-decides-how-much-charge-a-plush-gives-the-station', async () => {
    const bad = [];
    if (CHARGE_PER.join() !== '0.34,0.7,1.5,4' || !(CHARGE_PER[1] > CHARGE_PER[0] && CHARGE_PER[2] > CHARGE_PER[1] && CHARGE_PER[3] > CHARGE_PER[2])) bad.push('table ' + CHARGE_PER);
    for (let r = 0; r <= 3; r++) { const ch = K.charger(-3.4, 3.0); g.logi.accept(ch, { sp: sp(r), vr: 0 }, null); K.step(1); if (Math.abs(ch.reserve - CHARGE_PER[r]) > 1e-9 || ch.q.length) bad.push(`r${r}: reserve ${ch.reserve}`); L().remove(ch); }
    return bad.length === 0 || bad.join('; ');
  }, opt);

  await G('botfuel.rule-hover-text-names-the-time-per-plush-the-hopper-and-the-full-hopper', async () => {
    const bad = [], gn = K.gen(-3.4, 3.0, { burn: 0 }), ch = K.charger(-1.0, 3.0), gp = K.gen(1.0, 3.0, { gk: 'portable' });
    const t = g.genInfo(gn).lines.join('\n');
    if (!t.includes('Per plush: Common 4 min 30 s, Uncommon 12 min 0 s, Rare 30 min 0 s, Epic 1 h 15 min')) bad.push('per plush: ' + t.split('\n').find((x) => /Per plush/.test(x)));
    if (!t.includes('Holds 50 plush. A full hopper lasts: Common 3 h 45 min, Uncommon 10 h 0 min, Rare 1 d 1 h, Epic 2 d 15 h')) bad.push('full hopper: ' + t.split('\n').find((x) => /Holds/.test(x)));
    if (!/Hopper 0\/50 \(empty\)/.test(t) || !/Your bots call it Generator A/.test(t)) bad.push('hopper or name line: ' + t);
    const p = g.genInfo(gp).lines.join('\n'); if (!/Per plush: Common 18 min 0 s, Uncommon 48 min 0 s, Rare 2 h 0 min, Epic 5 h 0 min/.test(p) || !/Holds 50 plush/.test(p)) bad.push('portable: ' + p.split('\n').filter((x) => /Per plush|Holds/.test(x)).join(' | '));
    const c = g.chargerInfo(ch).lines.join('\n'); if (!/Per plush: Common 34% of a bot battery, Uncommon 70% of a bot battery, Rare 150% of a bot battery, Epic 400% of a bot battery/.test(c) || !/Holds 50 plush/.test(c) || !/Charging Station A/.test(c)) bad.push('charger: ' + c);
    for (let n = 0; n < 12; n++) gn.q.push({ sp: sp(n % 4), vr: 0 }); const t2 = g.genInfo(gn).lines.join('\n'); if (!/Hopper 12\/50: 3 Common, 3 Uncommon, 3 Rare, 3 Epic/.test(t2) || !/runs 6 h 5 min/.test(t2)) bad.push('with plush: ' + t2.split('\n').find((x) => /Hopper/.test(x)));
    return bad.length === 0 || bad.join(' || ');
  }, opt);

  await G('botfuel.rule-names-follow-the-ids-per-kind', async () => {
    const a = K.gen(-3.4, 3.0), b = K.gen(-2.2, 3.0), t = K.gen(-1.0, 3.0, { gk: 'turbine' }), c1 = K.charger(0.2, 3.0), c2 = K.charger(1.4, 3.0);
    const n = [a, b, t, c1, c2].map((x) => FUEL.fuelName(g, x)).join();
    return n === 'Generator A,Generator B,Turbine Generator A,Charging Station A,Charging Station B' || n;
  }, opt);

  await G('botfuel.rule-time-text-reads-in-hours-and-days', async () => {
    const out = [FUEL.longTime(5400), FUEL.longTime(4500), FUEL.longTime(75000), FUEL.longTime(172800), FUEL.longTime(90000), FUEL.longTime(0.5)].join('|');
    return out === '1 h 30 min|1 h 15 min|20 h 50 min|2 d 0 h|1 d 1 h|0.50 s' || out;
  }, opt);
}
