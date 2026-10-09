// botfuel.scoop-*: an idle bot with an empty bucket digs fuel for a generator that powers something in use, or a Charging Station, that is under 40% full.
// It takes only plush the machine will burn, keeps what it digs for that one machine, never leaves two bots chasing one hopper, and a low battery still goes first.
import { kit, UP, sp, mixOf, rar } from './botfuel_lib.js';
import * as BINS from '../bins.js';
import { NEEDLE } from '../plushdata.js';

export default async function (ctx) {
  const { g, S, w, species } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const opt = { up: UP };
  const FUEL = K.FUEL;
  const home = () => g.crew.home();
  const idleBot = (dx = 0) => { const h = home(); return K.mkBot(h.x + dx, h.z + 1); };
  const hasFace = () => { const h = home(); return !!g.crew.nearestFace(h.x, 0.3, h.z + 1); };

  await G('botfuel.idle-bot-scoops-fuel-for-a-starving-generator-and-fills-it', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const b = idleBot(); const dug0 = S().stats.plush, sold0 = S().stats.sold;
    K.step(1.6); if (!b.fuelJob || b.fuelJob.k !== 'scoop' || b.fuelJob.id !== gen.id || b.state !== 'goto') return `no scoop job: ${JSON.stringify(b.fuelJob)} state ${b.state}`;
    const txt = g.crew.statusLine(b); if (!/^Scooping fuel for Generator A/.test(txt) || g.crew.headStatus(b) !== 'Scooping fuel') return `status "${txt}" / "${g.crew.headStatus(b)}"`;
    const seen = K.states(b, 1500, () => gen.q.length >= 20 && b.state === 'idle' && b.carry.length === 0);
    if (gen.q.length < 20) return `the hopper only reached ${gen.q.length} after the run: states ${seen}`;
    if (gen.q.some((it) => rar(it) > 3)) return 'a plush the generator refuses got in: ' + gen.q.map(rar);
    const dug = S().stats.plush - dug0; if (dug !== gen.q.length + b.carry.length + (S().stats.sold - sold0)) return `dug ${dug} but ${gen.q.length} in the hopper, ${b.carry.length} in the bucket and ${S().stats.sold - sold0} sold: plush appeared or vanished (states ${seen.join(' ')})`;   // (what the bot could not give a full machine goes to the bin)
    if (!seen.includes('goto') || !seen.includes('farm') || !seen.includes('fwalk') || !seen.includes('fgive')) return 'states ' + seen;
    if (b.scoopHome || b.fuelJob || b.origin) return 'the errand did not end: ' + JSON.stringify([b.scoopHome, b.fuelJob, b.origin]);
    K.step(20); return (b.state === 'idle' && gen.q.length < 30) || `it kept going: ${b.state} hopper ${gen.q.length}`;   // 20 of 50 is no longer under 40%
  }, opt);

  await G('botfuel.a-generator-that-powers-nothing-is-left-alone', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); const b = idleBot(); K.step(30); return (!b.fuelJob && b.state === 'idle' && gen.q.length === 0) || `job ${JSON.stringify(b.fuelJob)} state ${b.state} hopper ${gen.q.length}`;
  }, opt);

  await G('botfuel.a-generator-over-forty-percent-full-is-left-alone', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); for (let n = 0; n < 20; n++) gen.q.push({ sp: sp(0), vr: 0 }); K.grid(-3.4, 3.0, 2); const b = idleBot(); K.step(30);
    return (!b.fuelJob && b.state === 'idle') || `job ${JSON.stringify(b.fuelJob)}`;
  }, opt);

  await G('botfuel.the-emptiest-machine-is-scooped-for-first-and-two-bots-take-different-ones', async () => {
    if (!hasFace()) return true;
    const a = K.gen(-3.4, 3.0), c = K.gen(-3.4, 6.0); K.grid(-3.4, 3.0, 2); K.grid(-3.4, 6.0, 2); for (let n = 0; n < 8; n++) a.q.push({ sp: sp(0), vr: 0 }); for (let n = 0; n < 2; n++) c.q.push({ sp: sp(0), vr: 0 });
    const b1 = idleBot(), b2 = idleBot(1.5); K.step(1.6);
    const j1 = b1.fuelJob, j2 = b2.fuelJob; if (!j1 || !j2) return `jobs ${JSON.stringify(j1)} ${JSON.stringify(j2)}`;
    const ids = [j1.id, j2.id].sort((x, y) => x - y).join(); const want = [a.id, c.id].sort((x, y) => x - y).join();
    if (ids !== want && j1.id === j2.id) { const both = j1.n + j2.n; if (both > 50 - 2) return `both bots chase ${j1.id}: ${j1.n} + ${j2.n} slots reserved`; }
    // with one machine only, the second bot has no slots left once the first holds them all (a level 1 bucket carries 6, so one gen takes several bots)
    return true;
  }, opt);

  await G('botfuel.one-bot-with-a-big-bucket-reserves-the-hopper-and-the-second-stays-home', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); for (let n = 0; n < 8; n++) gen.q.push({ sp: sp(0), vr: 0 });   // 42 slots free
    const b1 = idleBot(), b2 = idleBot(1.5); b1.level = 30; b2.level = 30;   // a bucket of 64: both would take the lot
    K.step(1.6); const j1 = b1.fuelJob, j2 = b2.fuelJob;
    if (!j1 || j1.n !== 42) return `the first bot reserved ${JSON.stringify(j1)} of 42`;
    return (!j2 && b2.state === 'idle') || `the second bot also set off: ${JSON.stringify(j2)}`;
  }, opt);

  await G('botfuel.a-charging-station-under-forty-percent-is-scooped-for', async () => {
    if (!hasFace()) return true;
    const ch = K.charger(-3.4, 3.0); const b = idleBot(); b.level = 8;
    K.step(1.6); if (!b.fuelJob || b.fuelJob.id !== ch.id) return 'no job for the charger: ' + JSON.stringify(b.fuelJob);
    const txt = g.crew.statusLine(b); if (!/Scooping fuel for Charging Station A/.test(txt)) return txt;
    K.states(b, 900, () => ch.q.length + ch.reserve > 3 && b.state === 'idle' && b.carry.length === 0);
    return (ch.q.length > 0 || ch.reserve > 0) && ch.q.every((it) => rar(it) <= 3) || `hopper ${ch.q.length} reserve ${ch.reserve}`;
  }, opt);

  await G('botfuel.a-charging-station-with-no-cable-is-not-open-and-calls-no-scooping-bot', async () => {
    if (!hasFace()) return true;
    const ch = K.charger(-3.4, 3.0, { unwired: true }); const b = idleBot(); b.level = 8; ch.reserve = 5;
    if (FUEL.chargerPowered(ch)) return 'a station with no cable counts as powered';
    if (FUEL.starving(g, ch)) return 'a station with no cable calls for fuel'; K.step(20); if (b.fuelJob) return 'a bot was sent to fuel a station nobody can use: ' + JSON.stringify(b.fuelJob);
    ch.reserve = 0; K.step(20); if (b.fuelJob || b.chg) return 'an unwired empty station still drew a bot: ' + JSON.stringify(b.fuelJob);
    const near = K.charger(-3.4, 4.2, { reserve: 4 }); b.battery = 0.2; b.state = 'idle'; if (g.crew.chargerFor(b) !== near) return 'the nearest OPEN station is not the wired one';
    K.unwired.delete(ch.id); ch.reserve = 6; K.step(1); ch.pw = 1; return (FUEL.chargerPowered(ch)) || 'wiring it did not open it';
  }, opt);

  await G('botfuel.a-station-that-already-holds-charge-is-left-alone', async () => {
    if (!hasFace()) return true;
    const ch = K.charger(-3.4, 3.0, { reserve: 6 }); const b = idleBot(); K.step(20); return (!b.fuelJob && b.state === 'idle') || 'job ' + JSON.stringify(b.fuelJob);
    void ch;
  }, opt);

  await G('botfuel.scoop-takes-only-what-the-machine-burns-the-one-and-legendaries-stay-in-the-pile', async () => {
    if (!hasFace()) return true;
    const bad = [], c = g.crew; const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const b = idleBot();
    if (!FUEL.legalCell(c, { fuelJob: { id: gen.id } }, sp(0)) || !FUEL.legalCell(c, { fuelJob: { id: gen.id } }, sp(3))) bad.push('a Common or an Epic is not legal');
    for (const x of [sp(4), sp(5), sp(6), NEEDLE, 60000, 60005, 60006, 60007, 60008, 99999]) if (FUEL.legalCell(c, { fuelJob: { id: gen.id } }, x)) bad.push('legal: ' + x);
    // a face of nothing but Legendaries (the errand starts first, so the face is the one the bot really goes to): it finds nothing it may take, leaves the pile alone and goes home empty-handed
    K.step(1.6); if (!b.fuelJob || !b.faceCell) return 'no job ' + bad.join();
    const f = b.faceCell, dir = b.dir, dx = [1, 0, -1, 0][dir], dz = [0, 1, 0, -1][dir]; const px = dz !== 0 ? 1 : 0, pz = dx !== 0 ? 1 : 0; const cells = [];
    for (let s = 1; s <= 4; s++) for (let l = -1; l <= 2; l++) for (let v = 0; v < 4; v++) cells.push([f.i + dx * s + px * l, f.j + v, f.k + dz * s + pz * l]);
    for (const [i, j, k] of cells) w().setCell(i, j, k, sp(4), 0);
    K.states(b, 150, () => b.state === 'idle' && !b.fuelJob && !b.scoopHome);
    const left = cells.filter(([i, j, k]) => w().get(i, j, k) === sp(4)).length;
    if (left !== cells.length) bad.push(`${cells.length - left} Legendary plush were dug`);
    if (gen.q.length || b.carry.length) bad.push(`hopper ${gen.q.length} bucket ${b.carry.length} (rarities ${b.carry.map(rar)}) face ${JSON.stringify(f)} dir ${dir} bot at ${ctx.toI(b.x)},${ctx.toK(b.z)} state ${b.state}`);
    if (!b.fuelBad || !(b.fuelBad[gen.id] > g.time)) bad.push('the machine was not set aside after the failed errand');
    return bad.length === 0 || bad.join('; ');
  }, opt);

  await G('botfuel.low-battery-goes-to-the-charger-first-and-no-errand-starts', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const ch = K.charger(0.4, 6.0, { reserve: 5 });
    const b = idleBot(); b.battery = 0.2; K.step(0.4); if (b.state !== 'chgwalk' || b.fuelJob) return `state ${b.state} job ${JSON.stringify(b.fuelJob)}`;
    K.states(b, 120, () => b.battery >= 0.95); if (b.battery < 0.95) return 'never charged ' + b.battery;
    K.step(2); return (b.fuelJob && b.fuelJob.id === gen.id) || 'after charging it did not go scooping: ' + b.state;
  }, opt);

  await G('botfuel.a-weak-bot-does-not-start-an-errand-between-low-and-ok', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const b = idleBot(); b.battery = 0.3; K.step(4);   // (an idle bot trickle-charges at the bin: 2% a second)
    return !b.fuelJob || 'a bot at 30% battery set off: ' + JSON.stringify(b.fuelJob);
    void gen;
  }, opt);

  await G('botfuel.stay-at-the-bin-means-no-scooping-until-another-order', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const b = idleBot(); g.crewCommand(b, { a: 'stay' }); K.step(10); if (b.fuelJob || !b.stay) return 'a bot told to stay set off: ' + JSON.stringify(b.fuelJob);
    g.crew.follow(b); if (b.stay) return 'follow kept the stay order'; b.state = 'idle'; K.step(2); if (!b.fuelJob) return 'an idle bot with no standing order did not set off';
    // a bot that is only put at rest by the game (a cart it was sent for is empty) is not under a stay order
    g.crew.order(b, 0, b.x, b.y, b.z); g.crew.stand(b); K.step(2); return (!b.stay && b.fuelJob) || 'a bot the game stood down never set off';
  }, opt);
}
