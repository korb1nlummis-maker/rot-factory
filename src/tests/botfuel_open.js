// botfuel.open-*: the three items the bot refuel audit left open.
//   1. A machine on another level (more than 2.2 m above or below the bot: a catwalk, a stacked plate, the floor above) is fueled: the bot walks toward it and, when it cannot climb, phases
//      up beside it (like a stuck bot phases home, with a toast), hands the plush over and phases back to its bin. Conservation and the reservation rules are the ones of any machine.
//   2. When a generator that powers something, or a Charging Station, is under 15% full and no bot is idle, the digging bot nearest to it finishes the cell it is on, digs fuel from its face,
//      hands it over and goes back to its dig: one bot per machine, a quarter of the crew at most, never a bot that was told to stay, has a switch off, a weak battery or a full bucket.
//   3. The V key line of the controls table and the How to Play text name the crew switch ('Keep machines fueled') and the bot's 'Fuel duty'.
// Run: `await __selftest('botfuel.open')`
import { kit, UP, sp, mixOf, rar } from './botfuel_lib.js';
import { CONTROLS } from '../controls.js';

export default async function (ctx) {
  const { g, S, w, L, toI, toK } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const opt = { up: UP };
  const FUEL = K.FUEL;
  const home = () => g.crew.home();
  const hasFace = () => { const h = home(); return !!g.crew.nearestFace(h.x, 0.3, h.z + 1); };
  const idleBot = (dx = 0) => { const h = home(); return K.mkBot(h.x + dx, h.z + 1); };
  // a tower of plush cells (3 x 3, from the floor to just under j) for a machine on a catwalk to stand on
  const tower = (t) => { for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (let j = 0; j < t.j; j++) w().setCell(t.i + a, j, t.k + c, sp(0), 0); };
  const fill = (t, n) => { for (let q = 0; q < n; q++) t.q.push({ sp: sp(0), vr: 0 }); };
  // a digging bot: the order the player gives (T), the bot walking to its face and digging
  const digger = (dx, dz = 1) => { const h = home(); const b = K.mkBot(h.x + dx, h.z + dz); const f = g.crew.nearestFace(b.x, 0.3, b.z); g.crew.order(b, f.dir, b.x, b.y, b.z); b.state = 'farm'; b.timer = 0.5; return b; };
  const call = () => { g.time += 1; FUEL.divertThink(g.crew, 5); };   // (the list of fuel machines is cached for half a second: a test that builds the world and asks at once moves the clock on first)
  const phaseToasts = () => K.toasts.filter((t) => /phased up/.test(t));

  // ------------------------------------------------------------------------------------------------------------------ 1. machines on another level
  await G('botfuel.open-a-bot-with-a-load-fuels-a-generator-on-a-catwalk-and-comes-back-down', async () => {
    const gen = K.gen(-3.4, 3.0, { j: 10 }); tower(gen); K.grid(-3.4, 3.0, 2);   // 6 m up
    const b = K.mkBot(-6, 5); b.carry = mixOf([0, 1, 2, 3, 4, 0, 0, 0]); const sold0 = S().stats.sold;
    g.crew.goHome(b); if (!b.fuelJob || b.fuelJob.id !== gen.id || b.fuelJob.n !== 7 || !b.fuelJob.far) return 'no job for the machine up on the catwalk: ' + JSON.stringify(b.fuelJob);
    const seen = K.states(b, 120, () => b.state === 'idle' && b.carry.length === 0);
    const bad = [];
    if (!seen.includes('fwalk') || !seen.includes('fgive') || !seen.includes('unload')) bad.push('states ' + seen);
    if (gen.q.length !== 7 || gen.q.some((it) => rar(it) > 3)) bad.push(`hopper holds ${gen.q.map(rar)}`);
    if (S().stats.sold - sold0 !== 1) bad.push(`sold ${S().stats.sold - sold0} (the Legendary only)`);
    if (b.carry.length || b.fuelJob || b.fuelUp || b.state !== 'idle') bad.push(`not settled: ${b.state} ${JSON.stringify(b.fuelJob)} up ${b.fuelUp}`);
    if (b.y > 1.5) bad.push('the bot is still up at ' + b.y.toFixed(1));
    if (phaseToasts().length !== 1) bad.push('toasts ' + JSON.stringify(K.toasts));
    return bad.length === 0 || bad.join('; ');
  }, opt);

  await G('botfuel.open-an-idle-bot-scoops-fuel-for-a-starving-generator-on-the-floor-above', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0, { j: 16 }); tower(gen); K.grid(-3.4, 3.0, 2);   // 9.6 m up
    const b = idleBot(); const dug0 = S().stats.plush, sold0 = S().stats.sold;
    K.step(1.6); if (!b.fuelJob || b.fuelJob.k !== 'scoop' || b.fuelJob.id !== gen.id) return 'no scoop job for the machine up there: ' + JSON.stringify(b.fuelJob);
    const seen = K.states(b, 1500, () => gen.q.length >= 20 && b.state === 'idle' && b.carry.length === 0);
    if (gen.q.length < 20) return `the hopper only reached ${gen.q.length}: states ${seen}`;
    const dug = S().stats.plush - dug0; if (dug !== gen.q.length + b.carry.length + (S().stats.sold - sold0)) return `dug ${dug}: ${gen.q.length} in the hopper, ${b.carry.length} in the bucket, ${S().stats.sold - sold0} sold`;
    if (b.fuelJob || b.fuelUp || b.scoopHome || b.y > 1.5) return `the errand did not end: ${JSON.stringify([b.fuelJob, b.fuelUp, b.scoopHome, b.y])}`;
    return phaseToasts().length >= 1 || 'no phase toast: ' + JSON.stringify(K.toasts);
  }, opt);

  await G('botfuel.open-a-charging-station-on-another-level-is-fueled-too', async () => {
    const ch = K.charger(-3.4, 3.0, { j: 14 }); ch.dig = 1e9; tower(ch);
    const b = K.mkBot(-6, 5); b.carry = mixOf([0, 0, 0, 0]); g.crew.goHome(b);
    if (!b.fuelJob || b.fuelJob.id !== ch.id || !b.fuelJob.far) return 'no job for the station: ' + JSON.stringify(b.fuelJob);
    K.states(b, 120, () => b.state === 'idle' && b.carry.length === 0);
    return (ch.q.length === 4 && b.carry.length === 0 && !b.fuelUp) || `hopper ${ch.q.length} (4), carrying ${b.carry.length}, up ${b.fuelUp}`;
  }, opt);

  await G('botfuel.open-a-bot-up-on-a-catwalk-fuels-a-machine-on-the-floor-and-the-count-stays-exact', async () => {
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); tower({ i: toI(-9), k: toK(6.0), j: 12 });   // a post 7 m up for it to stand on
    const b = K.mkBot(-9, 6.0); b.y = 7.3; b.carry = mixOf([0, 0, 0, 0, 0]); const before = K.count();
    g.crew.goHome(b); if (!b.fuelJob || b.fuelJob.id !== gen.id || !b.fuelJob.far) return 'no job from up there: ' + JSON.stringify(b.fuelJob);
    K.states(b, 120, () => b.state === 'idle' && b.carry.length === 0);
    return (gen.q.length === 5 && K.count() === before && b.carry.length === 0 && b.y < 1.5) || `hopper ${gen.q.length}, count ${K.count()} was ${before}, y ${b.y.toFixed(1)}`;
  }, opt);

  await G('botfuel.open-slots-are-reserved-for-a-machine-on-another-level-too', async () => {
    const gen = K.gen(-3.4, 3.0, { j: 10 }); tower(gen); fill(gen, 40);   // 10 slots free
    const b1 = K.mkBot(-6, 5), b2 = K.mkBot(-6.4, 5.4); b1.carry = mixOf(Array(8).fill(0)); b2.carry = mixOf(Array(8).fill(0));
    g.crew.goHome(b1); g.crew.goHome(b2);
    if (!b1.fuelJob || b1.fuelJob.n !== 8) return 'the first bot: ' + JSON.stringify(b1.fuelJob);
    if (!b2.fuelJob || b2.fuelJob.n !== 2) return 'the second bot reserved ' + JSON.stringify(b2.fuelJob) + ' of the 2 slots that are left';
    let over = 0; K.step(120, 0.05, () => { const res = S().crew.reduce((a, q) => a + (q.fuelJob && q.fuelJob.id === gen.id ? q.fuelJob.n : 0), 0); if (gen.q.length + res > 50) over++; return false; });
    return (gen.q.length === 50 && over === 0) || `hopper ${gen.q.length}, over-promised ${over} frames`;
  }, opt);

  await G('botfuel.open-a-bot-too-weak-for-the-walk-skips-a-machine-on-another-level', async () => {
    const gen = K.gen(-3.4, 3.0, { j: 10 }); tower(gen); const b = K.mkBot(-6, 5); b.carry = mixOf([0, 0, 0]); b.battery = 0.3;
    return !FUEL.tryTopUp(g.crew, b) && !b.fuelJob || 'a bot under 35% set off: ' + JSON.stringify(b.fuelJob);
  }, opt);

  await G('botfuel.open-switches-off-call-a-bot-back-down-from-the-catwalk', async () => {
    const gen = K.gen(-3.4, 3.0, { j: 10 }); tower(gen); const b = K.mkBot(-6, 5); b.carry = mixOf(Array(30).fill(0)); g.crew.goHome(b);
    K.states(b, 60, () => b.state === 'fgive' && b.fuelUp); if (!b.fuelUp || b.y < 5) return `never phased up: ${b.state} ${b.y.toFixed(1)}`;
    g.crewFuelToggle(b.id, false); if (b.fuelJob || b.fuelUp || b.y > 1.5) return `switched off but the bot is ${b.y.toFixed(1)} m up with job ${JSON.stringify(b.fuelJob)}`;
    return true;
  }, opt);

  // ------------------------------------------------------------------------------------------------------------------ 2. priority: a starving machine, a crew that is all digging
  await G('botfuel.open-the-nearest-digging-bot-is-pulled-off-for-a-starving-generator-and-returns-to-its-dig', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const bots = [digger(-2), digger(0), digger(2), digger(4)];
    for (const b of bots) b.timer = 5;   // (mid-dig: nobody is idle)
    call(); const taken = bots.filter((b) => b.divert === gen.id);
    if (taken.length !== 1) return `${taken.length} bots diverted, one wanted`;
    const near = bots.slice().sort((a, c) => Math.hypot(a.x + 3.4, a.z - 3.0) - Math.hypot(c.x + 3.4, c.z - 3.0))[0]; if (taken[0] !== near) return 'it was not the nearest bot';
    const t = taken[0], origin = t.origin; t.timer = 0.2;
    const seen = []; K.step(1500, 0.05, () => { if (seen[seen.length - 1] !== t.state) seen.push(t.state); return gen.q.length >= 4 && !t.fuelJob && ['goto', 'farm', 'advance'].includes(t.state) && S().stats.botFuel >= 4; });
    const bad = [];
    if (!seen.includes('fwalk') || !seen.includes('fgive')) bad.push('states ' + seen);
    if (gen.q.length < 4 || gen.q.some((it) => rar(it) > 3)) bad.push(`hopper ${gen.q.map(rar)}`);
    if (S().stats.botFuel !== gen.q.length) bad.push(`botFuel ${S().stats.botFuel} vs hopper ${gen.q.length}`);
    if (t.origin !== origin || t.divert || t.fuelJob || t.scoopHome) bad.push(`not back on its own dig: ${t.state} ${JSON.stringify([t.divert, t.fuelJob, t.scoopHome])}`);
    if (bots.some((b) => b !== t && b.fuelJob && b.fuelJob.dv)) bad.push('a second bot was diverted');
    return bad.length === 0 || bad.join('; ');
  }, opt);

  await G('botfuel.open-a-crew-that-is-all-digging-refills-a-starving-generator-by-itself', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const h = home(), bots = [];
    for (let n = 0; n < 4; n++) { const b = K.mkBot(h.x - 2 + n * 2, h.z + 1); const f = g.crew.nearestFace(b.x, 0.3, b.z); g.crew.order(b, f.dir, b.x, b.y, b.z); bots.push(b); }   // the T key: the whole crew digs
    let most = 0, ever = new Set(); K.step(1500, 0.05, () => { const n = bots.filter((b) => b.divert || (b.fuelJob && b.fuelJob.dv)).length; most = Math.max(most, n); for (const b of bots) if (b.fuelJob && b.fuelJob.dv) ever.add(b.id); return S().stats.botFuel >= 4; });
    if (S().stats.botFuel < 4) return `the generator got ${gen.q.length} plush from bots (${S().stats.botFuel}), diverted ${ever.size}`;
    return (most === 1 && gen.q.every((it) => rar(it) <= 3)) || `at most ${most} bots at once (one wanted)`;
  }, opt);

  await G('botfuel.open-the-bot-finishes-its-current-dig-before-it-turns-and-an-order-cancels-it', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const crew4 = [digger(0), digger(2), digger(4), digger(6)], [b, c] = crew4; for (const x of crew4) x.timer = 3;
    call(); const who = crew4.find((x) => x.divert === gen.id); if (!who) return 'nobody was diverted';
    K.step(1.5); if (!who.divert || who.fuelJob) return `it turned early: ${JSON.stringify([who.divert, who.fuelJob])}`;
    K.step(2.0); if (!who.fuelJob || who.fuelJob.k !== 'scoop' || !who.fuelJob.dv || who.divert) return `it never turned: ${JSON.stringify([who.divert, who.fuelJob, who.state])}`;
    if (!/^Scooping fuel for Generator A/.test(g.crew.statusLine(who))) return 'status: ' + g.crew.statusLine(who);
    // a new order of the player's ends a pending diversion
    const other = who === b ? c : b; for (const x of crew4) { x.fuelJob = null; x.divert = null; }
    other.divert = gen.id; g.crew.sendHome(other); return !other.divert || 'goHome kept the pending diversion';
  }, opt);

  await G('botfuel.open-an-idle-bot-answers-first-so-nobody-is-pulled-off-a-dig', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const bots = [digger(-2), digger(0), digger(2)], idle = idleBot(4); for (const b of bots) b.timer = 5;
    call(); if (bots.some((b) => b.divert)) return 'a digger was pulled off although a bot is idle';
    // an idle bot told to stay (or with its switch off, or too weak, or far from its bin) cannot answer: the call goes to a digger
    idle.stay = true; call(); if (!bots.some((b) => b.divert === gen.id)) return 'a bot told to stay counted as idle: ' + JSON.stringify(S().crew.map((x) => [x.id, x.state, x.stay, x.battery, !!x.origin, x.divert, x.carry.length]));
    for (const b of bots) b.divert = null; idle.stay = false; idle.fuelOff = true; call(); if (!bots.some((b) => b.divert === gen.id)) return 'a bot with its fuel duty off counted as idle';
    for (const b of bots) b.divert = null; idle.fuelOff = undefined; idle.battery = 0.3; call(); return bots.some((b) => b.divert === gen.id) || 'a weak bot counted as idle';
  }, opt);

  await G('botfuel.open-only-a-machine-under-fifteen-percent-that-powers-something-calls', async () => {
    if (!hasFace()) return true;
    const a = K.gen(-3.4, 3.0), idle = K.gen(-3.4, 6.0), bots = [digger(0), digger(2), digger(4), digger(-2)]; for (const b of bots) b.timer = 5;
    K.grid(-3.4, 3.0, 2); fill(a, 8);   // 16%: not under 15
    call(); if (bots.some((b) => b.divert)) return 'a machine at 16% called a digger';
    a.q.length = 7; call(); if (!bots.some((b) => b.divert === a.id)) return 'a machine at 14% did not call';
    for (const b of bots) b.divert = null; // a generator that powers nothing is left alone (the other one has no pole or fans)
    for (const b of bots) b.divert = null; a.q.length = 0; L().remove(a); call(); void idle; if (bots.some((b) => b.divert)) return 'a generator that powers nothing called a digger';
    return true;
  }, opt);

  await G('botfuel.open-a-starving-charging-station-calls-a-digger-too', async () => {
    if (!hasFace()) return true;
    const ch = K.charger(-3.4, 3.0), bots = [digger(0), digger(2), digger(4), digger(-2)]; for (const b of bots) b.timer = 5;
    call(); if (!bots.some((b) => b.divert === ch.id)) return 'the empty station did not call'; for (const b of bots) b.divert = null;
    ch.reserve = 6; call(); if (bots.some((b) => b.divert)) return 'a station that holds charge called a digger'; ch.reserve = 0; fill(ch, 8);
    call(); return !bots.some((b) => b.divert) || 'a station at 16% called a digger';
  }, opt);

  await G('botfuel.open-battery-load-stay-and-both-switches-are-respected', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const bots = [digger(0), digger(2), digger(4), digger(6)]; for (const b of bots) b.timer = 5;
    const pick = () => { for (const b of bots) b.divert = null; call(); return bots.find((b) => b.divert === gen.id); };
    const nearest = () => bots.slice().sort((a, c) => Math.hypot(a.x + 3.4, a.z - 3.0) - Math.hypot(c.x + 3.4, c.z - 3.0));
    const [n1, n2] = nearest(); const bad = [];
    if (pick() !== n1) bad.push('the nearest bot was not taken');
    n1.battery = 0.5; if (pick() !== n2) bad.push('a bot at exactly 50% battery was taken');
    n1.battery = 0.51; if (pick() !== n1) bad.push('a bot at 51% was not taken'); n1.battery = 1;
    n1.carry = mixOf(Array(g.crew.capacity(n1)).fill(0)); if (pick() !== n2) bad.push('a bot with a full bucket was taken'); n1.carry = [];
    n1.stay = true; if (pick() !== n2) bad.push('a bot told to stay was taken'); n1.stay = false;
    n1.fuelOff = true; if (pick() !== n2) bad.push('a bot with its fuel duty off was taken'); n1.fuelOff = undefined;
    S().crewFuel = false; if (pick()) bad.push('the crew switch is off but a bot was diverted'); S().crewFuel = undefined;
    n1.state = 'follow'; if (pick() === n1) bad.push('a bot that is not digging was taken'); n1.state = 'farm';
    g.crewFuelToggle(0, false); if (bots.some((b) => b.divert || b.fuelJob)) bad.push('the crew switch left a diversion standing'); g.crewFuelToggle(0, true);
    n2.divert = gen.id; g.crewFuelToggle(n2.id, false); if (n2.divert) bad.push("a bot's own switch left its diversion standing"); g.crewFuelToggle(n2.id, true);
    return bad.length === 0 || bad.join('; ');
  }, opt);

  await G('botfuel.open-one-bot-per-machine-and-never-more-than-a-quarter-of-the-crew', async () => {
    if (!hasFace()) return true;
    for (const [x, z] of [[-3.4, 3.0], [-3.4, 6.0], [0.4, 6.0]]) { K.gen(x, z); K.grid(x, z, 2); }
    const bots = []; for (let n = 0; n < 8; n++) bots.push(digger(-4 + n * 1.2)); for (const b of bots) b.timer = 5;
    const taken = () => bots.filter((b) => b.divert);
    call(); call(); call();
    if (taken().length !== 2) return `${taken().length} of 8 diverted (two is a quarter)`;
    const ids = taken().map((b) => b.divert); if (new Set(ids).size !== 2) return 'two bots for one machine: ' + ids;
    // a crew of four: one; of three: none (a quarter of three is less than one bot)
    for (const b of bots) b.divert = null; const four = bots.slice(0, 4); for (const b of bots.slice(4)) { L(); S().crew.splice(S().crew.indexOf(b), 1); }
    call(); if (four.filter((b) => b.divert).length !== 1) return `a crew of four diverted ${four.filter((b) => b.divert).length}`;
    for (const b of four) b.divert = null; S().crew.splice(S().crew.indexOf(four[3]), 1); call();
    return !four.some((b) => b.divert) || 'a crew of three diverted a bot';
  }, opt);

  await G('botfuel.open-the-diversion-is-not-taken-when-the-room-is-already-promised', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); fill(gen, 2); const bots = [digger(0), digger(2), digger(4), digger(6)]; for (const b of bots) b.timer = 5;
    const h = home(), s = K.mkBot(h.x, h.z + 2); s.state = 'goto'; s.fuelJob = { id: gen.id, n: 48, k: 'scoop' };   // a bot already promised every free slot
    call(); return !bots.some((b) => b.divert) || 'a bot was sent although every free slot is promised';
  }, opt);

  await G('botfuel.open-a-diverted-bot-in-the-host-rows-shows-the-scoop-errand', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const bots = [digger(0), digger(2), digger(4), digger(6)]; for (const b of bots) b.timer = 5;
    call(); const t = bots.find((b) => b.divert); if (!t) return 'nobody diverted'; t.timer = 0.1; K.step(0.5);
    if (!t.fuelJob) return 'the errand did not start: ' + t.state;
    const sent = []; g.netSend = (m) => { sent.push(JSON.parse(JSON.stringify(m))); }; K.role('host'); g.sendDyn(); K.done(); const dyn = sent.find((m) => m.t === 'dyn'); if (!dyn) return 'no dyn';
    const row = dyn.crew.find((r) => r[0] === t.id); return (row && row[18] === gen.id && row[19] === 2) || 'row ' + JSON.stringify(row && [row[5], row[18], row[19]]);
  }, opt);

  // ------------------------------------------------------------------------------------------------------------------ 3. the words
  await G('botfuel.open-the-v-key-line-and-how-to-play-name-the-fuel-switches', async () => {
    const row = CONTROLS.flatMap((x) => x.rows).find((r) => r.keys.includes('V')); const bad = [];
    if (!row || !/Keep machines fueled/.test(row.what) || !/Fuel duty/.test(row.what)) bad.push('the V line: ' + (row && row.what));
    const body = document.getElementById('howBody'), keys = document.getElementById('howKeys');
    if (!body || !keys) return 'no How to Play in the page';
    const prose = body.cloneNode(true); prose.querySelector('#howKeys').remove();
    const n = (prose.textContent.match(/Keep machines fueled/g) || []).length; if (n !== 1) bad.push(`How to Play text names the switch ${n} times (once wanted)`);
    if (!/Keep machines fueled/.test(keys.textContent) || !/Fuel duty/.test(keys.textContent)) bad.push('the key list in How to Play does not carry the V line');
    return bad.length === 0 || bad.join('; ');
  }, opt);
}
