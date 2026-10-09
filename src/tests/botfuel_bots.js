// botfuel.*: the little robots keep plush-fed machines fueled. A bot that is about to unload tops up the generators and Charging Stations in reach first (cheapest plush
// first, never what a machine refuses), an idle bot with an empty bucket scoops fuel for a machine that runs dry, slots are reserved so two bots never chase one hopper,
// the switch turns it all off, a low battery still goes first and an assigned bin still gets the rest. Run: `await __selftest('botfuel.')`
import { kit, UP, sp, mixOf, rar } from './botfuel_lib.js';
import * as BINS from '../bins.js';

export default async function (ctx) {
  const { g, S, species } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const val = (s) => g.valueOf(s, 0, 0);
  const gv = (rs) => rs.reduce((a, r) => a + val(sp(r)), 0);   // what these rarities pay at the bin
  const opt = { up: UP };

  await G('botfuel.bot-fills-a-generator-before-the-bin-and-the-valuable-ones-go-to-the-bin', async () => {
    const gen = K.gen(-3.4, 3.0); const b = K.mkBot(-6, 5); b.carry = mixOf([0, 1, 2, 3, 4, 5, 0, 0]); const m0 = K.money();
    g.crew.goHome(b); const seen = K.states(b, 90, () => b.state === 'idle' && b.carry.length === 0);
    const i = (s) => seen.indexOf(s);
    if (!(i('fwalk') >= 0 && i('fgive') > i('fwalk') && i('return') > i('fgive') && i('unload') > i('return'))) return 'states ' + seen;
    if (gen.q.length !== 6 || gen.q.some((it) => rar(it) > 3)) return `hopper holds ${gen.q.map(rar)}`;
    const paid = K.money() - m0; if (paid !== gv([4, 5])) return `paid ${paid}, the Legendary and the Mythic are worth ${gv([4, 5])}`;
    return b.carry.length === 0 || 'still carrying';
  }, opt);

  await G('botfuel.arrival-at-the-bin-tops-up-too-and-fills-only-what-fits', async () => {
    const gen = K.gen(-3.4, 3.0); for (let n = 0; n < 47; n++) gen.q.push({ sp: sp(0), vr: 0 });
    const h = g.crew.home(), b = K.mkBot(h.x - 5, h.z); b.state = 'return'; b.path = [[h.x, h.z]]; b.pi = 0; b.carry = mixOf([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]); const m0 = K.money();
    const seen = K.states(b, 90, () => b.state === 'idle' && b.carry.length === 0);
    if (!seen.includes('fgive')) return 'states ' + seen;
    if (gen.q.length !== 50) return `hopper ${gen.q.length}`;
    return K.money() - m0 === gv([1, 1, 1, 1, 1, 1, 1]) || `paid ${K.money() - m0}, the 7 that did not fit are worth ${gv([1, 1, 1, 1, 1, 1, 1])}`;
  }, opt);

  await G('botfuel.cheapest-plush-go-in-first-the-valuable-ones-stay-for-the-bin', async () => {
    const gen = K.gen(-3.4, 3.0); for (let n = 0; n < 47; n++) gen.q.push({ sp: sp(0), vr: 0 });
    const b = K.mkBot(-6, 5); b.carry = mixOf([3, 2, 1]); g.crew.goHome(b); K.states(b, 90, () => b.state === 'idle' && b.carry.length === 0);
    const got = gen.q.slice(47).map(rar).join(); return got === '1,2,3' || 'the hopper took rarities ' + got;
  }, opt);

  await G('botfuel.emptiest-machine-first-and-the-rest-in-turn', async () => {
    const a = K.gen(-3.4, 3.0), c = K.gen(-3.4, 6.0), d = K.gen(0.4, 6.0);
    for (let n = 0; n < 30; n++) a.q.push({ sp: sp(0), vr: 0 }); for (let n = 0; n < 10; n++) c.q.push({ sp: sp(0), vr: 0 });
    for (let n = 0; n < 45; n++) d.q.push({ sp: sp(0), vr: 0 });
    const b = K.mkBot(-6, 5); b.carry = mixOf(Array(30).fill(0)); g.crew.goHome(b); const first = b.fuelJob && b.fuelJob.id;
    K.states(b, 120, () => b.state === 'idle' && b.carry.length === 0);
    if (first !== c.id) return `it went to ${first} first, the emptiest hopper is ${c.id} (a ${a.id}, c ${c.id}, d ${d.id})`;
    return (c.q.length === 40 && a.q.length === 30 && d.q.length === 45 && b.carry.length === 0) || `hoppers a ${a.q.length} (30) c ${c.q.length} (40) d ${d.q.length} (45), carrying ${b.carry.length}`;   // all 30 went to the emptiest one
  }, opt);

  await G('botfuel.two-bots-never-chase-one-hopper-a-slot-is-reserved', async () => {
    const gen = K.gen(-3.4, 3.0); for (let n = 0; n < 20; n++) gen.q.push({ sp: sp(0), vr: 0 });   // 30 slots free
    const b1 = K.mkBot(-6, 5), b2 = K.mkBot(-6.4, 5.4); b1.carry = mixOf(Array(25).fill(0)); b2.carry = mixOf(Array(25).fill(0));
    g.crew.goHome(b1); g.crew.goHome(b2);
    if (!b1.fuelJob || b1.fuelJob.n !== 25) return 'the first bot has no job: ' + JSON.stringify(b1.fuelJob);
    if (!b2.fuelJob || b2.fuelJob.n !== 5) return 'the second bot reserved ' + JSON.stringify(b2.fuelJob) + ' of the 5 slots that are left';
    let over = 0; K.step(60, 0.05, () => { const res = S().crew.reduce((a, q) => a + (q.fuelJob && q.fuelJob.id === gen.id ? q.fuelJob.n : 0), 0); if (gen.q.length + res > 50) over++; return false; });
    return (gen.q.length === 50 && over === 0) || `hopper ${gen.q.length}, over-promised ${over} frames`;
  }, opt);

  await G('botfuel.a-third-bot-finds-nothing-to-fill-and-goes-straight-to-the-bin', async () => {
    const gen = K.gen(-3.4, 3.0); for (let n = 0; n < 40; n++) gen.q.push({ sp: sp(0), vr: 0 });
    const b1 = K.mkBot(-6, 5), b2 = K.mkBot(-6.4, 5.4); b1.carry = mixOf(Array(10).fill(0)); b2.carry = mixOf(Array(10).fill(0));
    g.crew.goHome(b1); g.crew.goHome(b2); return (b1.state === 'fwalk' && b2.state === 'return') || `states ${b1.state} ${b2.state}`;
  }, opt);

  await G('botfuel.an-idle-bot-with-a-load-fuels-first-then-takes-the-rest-to-the-bin', async () => {
    const gen = K.gen(-3.4, 3.0); const h = g.crew.home(), b = K.mkBot(h.x, h.z + 1); b.carry = mixOf([0, 0, 4]); const m0 = K.money();
    const seen = K.states(b, 60, () => b.state === 'idle' && b.carry.length === 0 && seen_has());
    function seen_has() { return K.money() > m0; }
    if (gen.q.length !== 2) return `hopper ${gen.q.length}, states ${seen}`;
    return K.money() - m0 === gv([4]) || `paid ${K.money() - m0}`;
  }, opt);

  await G('botfuel.a-bot-with-a-drop-off-keeps-its-drop-off-and-is-not-sent-fueling', async () => {
    const gen = K.gen(-3.4, 3.0); const vault = K.rawTile('vault', ctx.toI(-3.4), ctx.toK(6.0)); const b = K.mkBot(-6, 5); b.carry = mixOf([0, 0, 0]); b.deliver = vault.id; b.state = 'idle';
    K.step(8); return (gen.q.length === 0 && b.fuelJob == null && b.state === 'idle') || `hopper ${gen.q.length} state ${b.state}`;
  }, opt);

  await G('botfuel.legendary-only-bot-leaves-the-hopper-alone', async () => {
    const gen = K.gen(-3.4, 3.0); const b = K.mkBot(-6, 5); b.carry = mixOf([4, 5, 4]); g.crew.goHome(b); if (b.state !== 'return') return 'state ' + b.state;
    K.states(b, 60, () => b.state === 'idle' && b.carry.length === 0); return gen.q.length === 0 || 'burnt ' + gen.q.length;
  }, opt);

  await G('botfuel.status-line-says-fueling-the-named-machine', async () => {
    const a = K.gen(-3.4, 3.0), c = K.gen(-3.4, 6.0); const ch = K.charger(0.4, 6.0);
    const [first, second] = [a, c].sort((x, y) => x.id - y.id);
    const b = K.mkBot(-6, 5); b.carry = mixOf([0, 0, 0]); first.q.push({ sp: sp(0), vr: 0 }); g.crew.goHome(b);
    const txt = g.crew.statusLine(b); const want = first.id === (b.fuelJob && b.fuelJob.id) ? 'Fueling Generator A' : 'Fueling Generator B';
    if (!txt.startsWith(want)) return `"${txt}" wanted "${want}"`;
    const head = g.crew.headStatus(b); if (head !== 'Fueling a machine') return head;
    const names = [FUEL_name(a), FUEL_name(c), FUEL_name(ch)].join(); return names === [first === a ? 'Generator A' : 'Generator B', first === c ? 'Generator A' : 'Generator B', 'Charging Station A'].join() || names;
    function FUEL_name(t) { return K.FUEL.fuelName(g, t); }
  }, opt);

  await G('botfuel.first-fueling-toasts-once-and-fuel-is-counted-not-sold', async () => {
    const gen = K.gen(-3.4, 3.0); const b = K.mkBot(-6, 5); b.carry = mixOf([0, 0, 0, 0]); const n0 = K.toasts.length; const p0 = S().stats.sold;
    g.crew.goHome(b); K.states(b, 60, () => b.state === 'idle' && b.carry.length === 0 && gen.q.length === 4);
    const t1 = K.toasts.filter((t) => /Bots fuel your machines/.test(t)).length;
    b.carry = mixOf([0]); g.crew.goHome(b); K.states(b, 60, () => b.carry.length === 0);
    const t2 = K.toasts.filter((t) => /Bots fuel your machines/.test(t)).length;
    if (t1 !== 1 || t2 !== 1) return `toasts ${t1} then ${t2}`;
    if (S().stats.botFuel !== 5) return 'counted ' + S().stats.botFuel;
    return S().stats.sold === p0 || 'fuel was counted as sold plush';
    void n0;
  }, opt);
  await G('botfuel.each-plush-leaps-from-the-bucket-into-the-machine-and-a-puff-shows', async () => {
    const gen = K.gen(-3.4, 3.0); const b = K.mkBot(-6, 5); b.carry = mixOf([0, 1, 2]); g.fliers = []; let puffs = 0; const f0 = g.fx.fluff; g.fx.fluff = (...x) => { puffs++; return f0 && f0.apply(g.fx, x); };
    try { g.crew.goHome(b); K.states(b, 60, () => b.state === 'idle' && !b.carry.length); } finally { g.fx.fluff = f0; }
    const fl = g.fliers.filter((f) => f.to && Math.hypot(f.to.x - ctx.cellX(gen.i), f.to.z - ctx.cellZ(gen.k)) < 0.01);
    return (fl.length === 3 && puffs >= 3 && fl.every((f) => f.dur > 0 && f.from && Math.hypot(f.from.x - ctx.cellX(gen.i), f.from.z - ctx.cellZ(gen.k)) < 3.5)) || `${fl.length} fliers to the generator, ${puffs} puffs`;
  }, opt);
}
