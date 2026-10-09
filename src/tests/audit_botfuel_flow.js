// audit botfuel: hunting for plush made or lost, bots that never finish, two bots on one hopper, and bots that hold plush hostage. Seeded random orders (stay, follow, go home, dig,
// the switches, a stuck beam, a low battery, a save and a load, a machine taken away) are thrown at a crew with machines about, and the plush are counted at every check.
// Run: `await __selftest('botfuel.audit-flow')`
import { kit, UP, sp, mixOf } from './botfuel_lib.js';
import * as FUEL from '../botfuel.js';

export default async function (ctx) {
  const { g, S, w, toI, toK } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const opt = { up: UP };
  const home = () => g.crew.home();
  const hasFace = () => { const h = home(); return !!g.crew.nearestFace(h.x, 0.3, h.z + 1); };
  // a small seeded random generator: a failure can be replayed
  const rng = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const tot = () => { let hop = 0, bucket = 0; for (const t of g.logi.tiles.values()) if (t.q && (t.type === 'gen' || t.type === 'charger')) hop += t.q.length; for (const b of S().crew) bucket += b.carry.length; return { hop, bucket }; };

  for (const [seed, nBots, secs] of [[11, 8, 240], [29, 8, 240], [47, 8, 240], [71, 30, 600], [88, 30, 600]]) {
    await G(`botfuel.audit-flow-random-orders-make-and-lose-no-plush-seed-${seed}-${nBots}-bots`, async () => {
      const r = rng(seed);
      const gens = [K.gen(-3.4, 3.0), K.gen(-3.4, 6.0), K.gen(0.4, 6.0)]; for (const t of gens) K.grid(ctx.cellX(t.i), ctx.cellZ(t.k), 2);
      const chg = K.charger(4.0, 6.0); chg.dig = 1e9;
      for (const t of [...gens, chg]) for (let n = 0; n < Math.floor(r() * 30); n++) t.q.push({ sp: sp(Math.floor(r() * 4)), vr: 0 });
      const h = home(); const bots = []; for (let q = 0; q < nBots; q++) { const b = K.mkBot(h.x + (q % 10) * 0.5 - 2, h.z + 1 + Math.floor(q / 10) * 0.5); b.level = 1 + Math.floor(r() * 5); b.carry = mixOf(Array.from({ length: Math.floor(r() * 9) }, () => Math.floor(r() * 6))); bots.push(b); }
      const dug0 = S().stats.plush, sold0 = S().stats.sold; const start = tot(); let removed = 0;
      const check = (when) => {
        const t = tot(), sold = S().stats.sold - sold0, dug = S().stats.plush - dug0;
        if (start.hop + start.bucket + dug !== t.hop + t.bucket + sold + removed) return `${when}: started with ${start.hop + start.bucket}, dug ${dug}; now ${t.hop} in hoppers, ${t.bucket} in buckets, ${sold} sold, ${removed} removed with a machine`;
        for (const m of [...gens, chg]) if (g.logi.byId.get(m.id) === m && m.q.length > FUEL.fuelCap(g, m)) return `${when}: hopper ${m.id} holds ${m.q.length} of ${FUEL.fuelCap(g, m)}`;
        for (const m of [...gens, chg]) { if (g.logi.byId.get(m.id) !== m) continue; const res = FUEL.reserved(g, m); if (res > FUEL.fuelRoom(g, m)) return `${when}: ${res} slots promised on ${m.id} that has room for ${FUEL.fuelRoom(g, m)}`; }
        return null;
      };
      let bad = null, t = 0, empty = 0, why = '';
      while (t < secs && !bad) {
        K.step(1.0, 0.05, () => {   // (a trip to hand plush over that hands nothing over is a bot sent for nothing: counted, unless an order of ours cut it)
          for (const q of bots) {
            if (q.state === 'fgive' && !q._in) { const m0 = q.fuelJob ? g.logi.byId.get(q.fuelJob.id) : null; q._in = { carry: q.carry.length, touched: false, job: JSON.stringify(q.fuelJob), room: m0 ? FUEL.fuelRoom(g, m0) : -1, rar: q.carry.map((x) => x.sp).join('/'), at: Math.round(g.time) }; }
            else if (q.state !== 'fgive' && q._in) { if (!q._in.touched && q._in.room >= 0 && q.carry.length >= q._in.carry && !q.fuelOff && S().crewFuel !== false) { empty++; if (!why) why = JSON.stringify({ ...q._in, now: Math.round(g.time), left: q.carry.length, machine: q._in.job && g.logi.byId.get(JSON.parse(q._in.job).id) ? 'there' : 'gone' }); } q._in = null; }
          }
          return false;
        }); t += 1;
        const o = r(), b = bots[Math.floor(r() * bots.length)]; for (const q of bots) if (q._in) q._in.touched = true;   // (any order this second may have cut a trip)
        if (o < 0.08) g.crew.sendHome(b);
        else if (o < 0.14) g.crew.stand(b);
        else if (o < 0.2) g.crew.follow(b);
        else if (o < 0.27 && hasFace()) g.crew.order(b, Math.floor(r() * 4), b.x, b.y, b.z);
        else if (o < 0.33) g.crewFuelToggle(b.id, r() < 0.5);
        else if (o < 0.36) g.crewFuelToggle(0, r() < 0.5);
        else if (o < 0.40) g.crew.beam(b);
        else if (o < 0.46) b.battery = 0.2 + r() * 0.1;
        else if (o < 0.50) { const raw = JSON.parse(JSON.stringify(S().crew)); S().crew = raw; g.crew.sync(); bots.splice(0, bots.length, ...S().crew); }   // a save and a load
        else if (o < 0.52 && gens.length > 1) { const m = gens.pop(); removed += m.q.length; g.logi.remove(m); S().entities = S().entities.filter((e) => e.id !== m.id); }
        else if (o < 0.58) { b.carry.push(...mixOf([Math.floor(r() * 6)])); start.bucket++; }   // the player hands it one
        bad = check(`at ${t} s (seed ${seed})`);
      }
      if (bad) return bad;
      // the end of it: everyone is told to go home and the crew settles (no bot may circle between a machine and the bin forever)
      for (const m of [...gens, chg]) if (g.logi.byId.get(m.id) === m) while (FUEL.fuelRoom(g, m) > 0) { m.q.push({ sp: sp(0), vr: 0 }); start.bucket++; }   // (machines full: no bot has a reason to go scooping)
      S().crewFuel = undefined; for (const b of bots) { b.fuelOff = undefined; g.crew.sendHome(b); b.origin = null; b.trail = []; if (b.battery < 0.5) b.battery = 0.6; }   // (the way home is already laid: a bot with no dig order goes idle at the bin)
      const seen = new Map(); K.step(900, 0.1, () => { for (const b of bots) { seen.set(b.id, (seen.get(b.id) || 0) + (b.state === 'fwalk' ? 0 : 0)); } return bots.every((b) => (b.state === 'idle' || b.state === 'lowbat') && !b.carry.length); });
      const stuck = bots.filter((b) => b.carry.length || !['idle', 'lowbat'].includes(b.state)); if (stuck.length) return `after 900 s of going home: ${stuck.map((b) => `${b.name} ${b.state} carrying ${b.carry.length} job ${JSON.stringify(b.fuelJob)} at ${b.x.toFixed(1)},${b.z.toFixed(1)} home ${home().x.toFixed(1)},${home().z.toFixed(1)} path ${b.path && b.path.length} pi ${b.pi} bat ${b.battery.toFixed(2)} stuckT ${(b.stuckT || 0).toFixed(1)} fuelDone ${b.fuelDone} chg ${b.chg} dest ${b.dest} deliver ${b.deliver}`).join('; ')}`;
      if (empty > 0) return `${empty} trip(s) to a machine handed over nothing (seed ${seed}); first: ${why}`;
      if (!(S().stats.botFuel > 5)) return `the run never fueled anything (${S().stats.botFuel}): the count above proves nothing`;
      return check('at the end') || true;
    }, opt);
  }
  // a scooping bot makes its own dig order (the face it was sent to). Every way the errand can be cut short must take that order away again: a bot the player sent home, called to
  // a new bin or that ran low must not go back to the pile and dig on its own, without the fuel rule, as if the player had ordered it.
  for (const [name, cut] of [
    ['go-home', (b) => g.crewCommand(b, { a: 'home' })],
    ['a-drop-off-order', (b) => { const v = K.rawTile('vault', ctx.toI(-9), ctx.toK(8), { stored: [] }); g.crew.command(b, { k: 'tile', id: v.id }, true); }],
    ['a-charge-order', (b) => { K.charger(0.4, 9.0, { reserve: 6 }); g.crewCommand(b, { a: 'charge' }); }],
    ['low-battery-with-a-station', (b) => { K.charger(0.4, 9.0, { reserve: 6 }); b.battery = 0.2; }],
    ['low-battery-and-no-station', (b) => { b.battery = 0.2; }],
  ]) {
    await G(`botfuel.audit-flow-a-scooping-bot-cut-short-by-${name}-does-not-go-back-to-dig-on-its-own`, async () => {
      if (!hasFace()) return true;
      const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const h = home(); const b = K.mkBot(h.x, h.z + 1);
      let n = 0; K.step(60, 0.05, () => { n++; return b.state === 'farm' && b.fuelJob && b.fuelJob.k === 'scoop' && b.carry.length > 0; });
      if (!(b.state === 'farm' && b.fuelJob)) return 'the bot never started to scoop: ' + b.state;
      S().crewFuel = false;   // (so that a new errand cannot start: what is left is what the cut left behind)
      cut(b);
      const dug0 = S().stats.plush, seen = K.states(b, 400, () => b.state === 'idle' && !b.carry.length);
      if (S().stats.plush - dug0 > 0) return `after the cut it dug ${S().stats.plush - dug0} more plush on its own: ${seen.join(' ')}`;
      const digging = ['goto', 'farm', 'advance', 'blocked'].includes(b.state) && !b.fuelJob;
      if (digging || b.state !== 'idle') return `after the cut the bot ends as ${b.state} (origin ${JSON.stringify(b.origin)}): ${seen.join(' ')}`;
      if (b.origin) return 'the bot is idle but still holds a dig order ' + JSON.stringify(b.origin);
      void gen; return true;
    }, opt);
  }
  // the crew-wide switch is as good as each bot's own: a bot already on its way (to hand plush over or digging for a machine) comes back when it goes off
  for (const mode of ['carrying-a-load-to-a-machine', 'digging-fuel-for-a-machine']) {
    await G(`botfuel.audit-flow-the-crew-switch-turned-off-calls-back-a-bot-${mode}`, async () => {
      if (!hasFace()) return true;
      const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const h = home(); const b = K.mkBot(h.x, h.z + 1);
      if (mode.startsWith('carrying')) { b.carry = mixOf([0, 0, 1, 1, 2, 2]); g.crew.goHome(b); if (b.state !== 'fwalk') return 'it did not set off: ' + b.state; }
      else { K.step(60, 0.05, () => b.state === 'farm' && b.fuelJob && b.carry.length > 0); if (!(b.state === 'farm' && b.fuelJob)) return 'never scooping: ' + b.state; }
      const had = b.carry.length, hop0 = gen.q.length, sold0 = S().stats.sold; g.crewFuelToggle(0, false);
      K.states(b, 300, () => b.state === 'idle' && !b.carry.length);
      if (gen.q.length !== hop0) return `the generator took ${gen.q.length - hop0} plush after the crew switch went off`;
      if (b.state !== 'idle' || b.carry.length) return `the bot ends as ${b.state} carrying ${b.carry.length}`;
      if (S().stats.sold - sold0 < had) return `it carried ${had} and only ${S().stats.sold - sold0} reached the bin`;
      return true;
    }, opt);
  }
  // times in a save are the clock of the session that wrote it (g.time starts again at 0 in a new one): a machine a bot set aside ten hours into a long session must not stay set aside
  // for ten hours of the next one
  await G('botfuel.audit-flow-a-machine-set-aside-before-saving-is-not-set-aside-for-hours-after-loading', async () => {
    const gen = K.gen(-3.4, 3.0); const b = K.mkBot(-6, 5); b.carry = mixOf([0, 0, 1]);
    b.fuelBad = { [gen.id]: g.time + 36000 + 90 }; b._fuelSnd = g.time + 36000;
    const raw = JSON.parse(JSON.stringify(S().crew)); S().crew = raw; g.crew.sync(); const a = S().crew.find((x) => x.id === b.id);   // (the load: the clock of a long session is not this one's)
    g.crew.goHome(a); if (a.state !== 'fwalk') return `a bot with a load did not set off for the machine after loading: ${a.state} (fuelBad ${JSON.stringify(a.fuelBad)})`;
    return true;
  }, opt);
  // a bot digging fuel is on an errand of its own, not on a dig order: the Belt Layer upgrade lays a belt behind a bot that digs for the player and takes 3 coins a cell. A scooping bot
  // does not use that belt (it keeps what it digs for one machine), so it must not spend the player's coins on one.
  await G('botfuel.audit-flow-a-scooping-bot-lays-no-belt-and-spends-no-coins', async () => {
    if (!hasFace()) return true;
    g.T.crewBelt = 1; const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const h = home(); const b = K.mkBot(h.x, h.z + 1); b.level = 8;
    const belts0 = [...g.logi.tiles.values()].filter((t) => t.type === 'belt').length, m0 = S().money; let adv = 0, last = '';
    K.step(600, 0.05, () => { if (b.state === 'advance' && last !== 'advance') adv++; last = b.state; return gen.q.length >= 20 && b.state === 'idle'; });
    const belts = [...g.logi.tiles.values()].filter((t) => t.type === 'belt').length;
    if (!adv) return 'the bot never advanced into the pile: the test proves nothing';
    return (belts === belts0 && S().money === m0) || `a scooping bot laid ${belts - belts0} belts and spent ${m0 - S().money} coins over ${adv} steps`;
  }, opt);
  // an order of the player's chirps; a bot that decides to dig fuel by itself, perhaps a hundred metres from the player, does not (the chirp is not placed in the world)
  await G('botfuel.audit-flow-a-bot-that-sets-off-to-dig-fuel-on-its-own-makes-no-chirp', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const h = home(); const b = K.mkBot(h.x, h.z + 1);
    let n = 0; const c0 = g.sound.chirp.bind(g.sound); g.sound.chirp = (...a) => { n++; return c0(...a); };
    try {
      K.step(3, 0.05, () => !!b.fuelJob); if (!b.fuelJob) return 'the bot never set off';
      const own = n; g.crew.order(b, 0, b.x, b.y, b.z);
      return (own === 0 && n === 1) || `chirps: ${own} when the bot set off by itself, ${n - own} for the player's order (0 and 1 wanted)`;
    } finally { g.sound.chirp = c0; void gen; }
  }, opt);
}
