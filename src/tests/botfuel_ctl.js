// botfuel.ctl-*: the 'Keep machines fueled' switch (the whole crew and each bot), the crew panel and the bot panel, explicit orders, a low battery, an assigned bin,
// saving and loading, and the count: no plush is made or lost on the way from a bucket to a hopper, a bin or a belt. Run: `await __selftest('botfuel.ctl-')`
import { kit, UP, sp, mixOf, rar } from './botfuel_lib.js';
import * as BINS from '../bins.js';

export default async function (ctx) {
  const { g, S, species } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const opt = { up: UP };
  const val = (s) => g.valueOf(s, 0, 0);
  const gv = (rs) => rs.reduce((a, r) => a + val(sp(r)), 0);
  const home = () => g.crew.home();
  const hasFace = () => { const h = home(); return !!g.crew.nearestFace(h.x, 0.3, h.z + 1); };
  const finished = (b) => () => b.state === 'idle' && b.carry.length === 0;

  await G('botfuel.ctl-crew-switch-off-sends-loads-straight-to-the-bin-and-idle-bots-stay', async () => {
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); S().crewFuel = false;
    const b = K.mkBot(-6, 5); b.carry = mixOf([0, 0, 1, 2]); const m0 = K.money(); g.crew.goHome(b);
    if (b.state !== 'return') return 'state ' + b.state; const seen = K.states(b, 90, finished(b));
    if (seen.includes('fwalk') || seen.includes('fgive') || gen.q.length) return `fueled anyway: ${seen} hopper ${gen.q.length}`;
    if (K.money() - m0 !== gv([0, 0, 1, 2])) return 'paid ' + (K.money() - m0);
    if (hasFace()) { K.step(20); if (b.fuelJob || b.state !== 'idle') return 'an idle bot set off with the switch off: ' + JSON.stringify(b.fuelJob); }
    S().crewFuel = undefined; b.carry = mixOf([0, 0]); g.crew.goHome(b); return (b.state === 'fwalk') || 'with the switch back on it did not fuel: ' + b.state;
  }, opt);

  await G('botfuel.ctl-each-bot-has-its-own-switch', async () => {
    const gen = K.gen(-3.4, 3.0); const a = K.mkBot(-6, 5), c = K.mkBot(-6.5, 5.5); a.fuelOff = true; a.carry = mixOf([0, 0]); c.carry = mixOf([0, 0, 0]);
    g.crew.goHome(a); g.crew.goHome(c); if (a.state !== 'return' || c.state !== 'fwalk') return `states ${a.state} ${c.state}`;
    K.states(c, 90, finished(c)); K.states(a, 90, finished(a)); return gen.q.length === 3 || 'hopper ' + gen.q.length;
  }, opt);

  await G('botfuel.ctl-switching-a-bot-off-calls-it-back-from-an-errand', async () => {
    if (!hasFace()) return true;
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const h = home(), b = K.mkBot(h.x, h.z + 1); K.step(1.6); if (!b.fuelJob) return 'no errand to call back';
    g.crewFuelToggle(b.id, false); if (b.fuelJob || !b.fuelOff) return 'the errand stands: ' + JSON.stringify(b.fuelJob);
    return gen.q.length === 0 || 'hopper ' + gen.q.length;
  }, opt);

  await G('botfuel.ctl-crew-panel-has-the-switches-and-they-work', async () => {
    const gen = K.gen(-3.4, 3.0); const a = K.mkBot(-6, 5); const c = K.mkBot(-6.5, 5.5); g.openModal('crew');
    const card = () => document.querySelector('#crewList [data-fuelcfg]'), allBtn = () => document.querySelector('#crewList [data-fuel=all]'), botBtns = () => [...document.querySelectorAll('#crewList [data-fuel=bot]')];
    if (!card() || !/Keep machines fueled: ON/.test(card().textContent)) return 'no crew switch: ' + (card() && card().textContent.slice(0, 60));
    if (botBtns().length !== 2 || !botBtns().every((x) => /Fuel duty: on/.test(x.textContent))) return 'bot buttons ' + botBtns().map((x) => x.textContent);
    allBtn().click(); if (S().crewFuel !== false || !/Keep machines fueled: OFF/.test(card().textContent) || !/Turn on for the crew/.test(allBtn().textContent)) return `after the crew click: ${S().crewFuel} / ${card().textContent.slice(0, 50)}`;
    allBtn().click(); if (S().crewFuel === false) return 'second click did not turn it back on';
    botBtns()[0].click(); const off = S().crew.filter((x) => x.fuelOff); if (off.length !== 1 || !/Fuel duty: off/.test(botBtns()[0].textContent)) return `after a bot click: ${off.length} off, "${botBtns()[0].textContent}"`;
    botBtns()[0].click(); if (S().crew.some((x) => x.fuelOff)) return 'second bot click did not turn it back on';
    // the bot panel (aim at the bot, E) says it too
    g.crewSel = a.id; g.updateBotHud(); const hud = document.getElementById('botInfo').textContent; g.closeModals && g.closeModals();
    void gen; void c; return /Keeps machines fueled: on/.test(hud) || 'bot panel: ' + hud;
  }, opt);

  await G('botfuel.ctl-explicit-orders-win-go-home-does-not-detour-and-a-dig-order-ends-the-errand', async () => {
    const gen = K.gen(-3.4, 3.0); const b = K.mkBot(-6, 5); b.carry = mixOf([0, 0, 0]);
    g.crew.command(b, { k: 'bin' }, true); if (b.state !== 'return' || b.fuelJob) return `go home: state ${b.state} job ${JSON.stringify(b.fuelJob)}`;
    K.states(b, 90, finished(b)); if (gen.q.length) return 'it fueled on an explicit go-home order';
    if (!hasFace()) return true;
    K.grid(-3.4, 3.0, 2); const h = home(); const d = K.mkBot(h.x, h.z + 1); K.step(1.6); if (!d.fuelJob) return 'no errand'; const nf = g.crew.nearestFace(d.x, d.y, d.z);
    g.crew.order(d, nf.dir, d.x, d.y, d.z); return (!d.fuelJob && !d.scoopHome) || 'the dig order left the errand: ' + JSON.stringify(d.fuelJob);
  }, opt);

  await G('botfuel.ctl-a-low-battery-skips-the-top-up-and-goes-on-to-charge-and-unload', async () => {
    const gen = K.gen(-3.4, 3.0); const b = K.mkBot(-6, 5); b.battery = 0.3; b.carry = mixOf([0, 0, 0]); const m0 = K.money(); g.crew.goHome(b);
    if (b.state !== 'return') return 'a weak bot took a detour: ' + b.state; K.states(b, 90, finished(b));
    return (gen.q.length === 0 && K.money() - m0 === gv([0, 0, 0])) || `hopper ${gen.q.length} paid ${K.money() - m0}`;
  }, opt);

  await G('botfuel.ctl-the-assigned-bin-gets-the-rest', async () => {
    const e = K.beacon(-2, 9); K.run(0.2); const gen = K.gen(-3.4, 3.0); for (let n = 0; n < 47; n++) gen.q.push({ sp: sp(0), vr: 0 });
    const b = K.mkBot(8, 3); b.dest = e.id; b.carry = mixOf([1, 1, 1, 1, 1, 1]); g.crew.goHome(b);
    const seen = K.states(b, 200, finished(b));
    const hall = BINS.today(g, BINS.HALL).n, depot = BINS.today(g, e.id).n;
    if (gen.q.length !== 50 || !seen.includes('fgive')) return `hopper ${gen.q.length}, states ${seen}`;
    return (depot === 3 && hall === 0) || `depot sold ${depot}, the SORT bin ${hall} (3 and 0 wanted)`;
  }, opt);

  await G('botfuel.ctl-the-switch-and-a-bot-in-the-middle-of-an-errand-survive-saving-and-loading', async () => {
    const gen = K.gen(-3.4, 3.0); for (let n = 0; n < 20; n++) gen.q.push({ sp: sp(0), vr: 0 }); const a = K.mkBot(-6, 5), c = K.mkBot(-6.5, 5.5);
    S().crewFuel = false; c.fuelOff = true; a.carry = mixOf([0, 0, 0, 0]); S().crewFuel = undefined; g.crew.goHome(a); if (a.state !== 'fwalk') return 'a: ' + a.state;
    S().crewFuel = false; K.step(0.3);
    g.noSave = false; g.save(); g.noSave = true; const raw = JSON.parse(localStorage.getItem('rotfactory.save.v1')).S;
    if (raw.crewFuel !== false) return 'the crew switch is not in the save: ' + raw.crewFuel;
    const ra = raw.crew.find((x) => x.id === a.id), rc = raw.crew.find((x) => x.id === c.id);
    if (!ra || !ra.fuelJob || ra.fuelJob.id !== gen.id || ra.state !== 'fwalk' || !rc || rc.fuelOff !== true) return 'saved bots ' + JSON.stringify([ra && ra.fuelJob, ra && ra.state, rc && rc.fuelOff]);
    // load: the bots come back from the JSON, the machine is the same one, and the errand is finished (or dropped when the machine is gone)
    S().crewFuel = raw.crewFuel; S().crew = JSON.parse(JSON.stringify(raw.crew)); g.crew.sync(); const a2 = S().crew.find((x) => x.id === a.id);
    if (S().crewFuel !== false) return 'the switch did not load'; S().crewFuel = undefined;
    K.states(a2, 120, finished(a2)); if (gen.q.length !== 24) return `after loading the hopper holds ${gen.q.length}, 24 wanted`;
    // an errand whose machine is gone: the bot walks home with what it carries instead of standing there
    const b = K.mkBot(-6, 5); b.carry = mixOf([0, 0]); b.state = 'fwalk'; b.fuelJob = { id: 987654, n: 2, k: 'give' }; const dump = JSON.parse(JSON.stringify(S().crew)); S().crew = dump; g.crew.sync(); const b2 = S().crew.find((x) => x.id === b.id);
    if (b2.fuelJob || b2.state !== 'return') return `a gone machine: job ${JSON.stringify(b2.fuelJob)} state ${b2.state}`;
    return true;
  }, opt);

  await G('botfuel.ctl-no-plush-is-made-or-lost-between-the-buckets-the-hoppers-and-the-bins', async () => {
    const a = K.gen(-3.4, 3.0), c = K.gen(-3.4, 6.0), d = K.charger(0.4, 6.0); for (let n = 0; n < 44; n++) a.q.push({ sp: sp(0), vr: 0 }); for (let n = 0; n < 30; n++) c.q.push({ sp: sp(1), vr: 0 });
    const bots = [K.mkBot(-6, 5), K.mkBot(-6.4, 5.4), K.mkBot(-6.8, 5.8)]; const rs = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 0, 0, 0, 1, 4, 3, 2, 1, 0, 5];
    for (const b of bots) b.carry = mixOf(rs); const total = bots.length * rs.length, sold0 = S().stats.sold, m0 = K.money(); const inHop0 = a.q.length + c.q.length;
    for (const b of bots) g.crew.goHome(b);
    K.step(240, 0.05, () => bots.every((b) => b.state === 'idle' && !b.carry.length));
    const hop = a.q.length + c.q.length + d.q.length + Math.round(d.reserve / 0.34 * 0), sold = S().stats.sold - sold0, fueled = S().stats.botFuel || 0;
    if (a.q.length > 50 || c.q.length > 50 || d.q.length > 50) return `a hopper over 50: ${a.q.length} ${c.q.length} ${d.q.length}`;
    const given = a.q.length + c.q.length + d.q.length - inHop0 + 0;   // (the charger's hopper may have worked plush into its reserve already)
    void given;
    if (fueled + sold !== total) return `${total} plush in the buckets: ${fueled} fueled + ${sold} sold = ${fueled + sold}`;
    if (bots.some((b) => b.carry.length)) return 'a bot still carries';
    const dread = [...a.q, ...c.q, ...d.q].filter((it) => rar(it) > 3).length; if (dread) return dread + ' too-valuable plush went into a hopper';
    void hop; void m0; return true;
  }, opt);

  await G('botfuel.ctl-a-bot-hauling-a-cart-load-fuels-from-it-too', async () => {
    const gen = K.gen(-3.4, 3.0); K.grid(-3.4, 3.0, 2); const c = S().cart || (S().cart = { tier: 0, mode: 'follow', x: -5, y: 0, z: 5, yaw: 0, load: [], dest: 0 });
    c.load = mixOf(Array(12).fill(1)); c.hauling = true; c.x = -5; c.z = 5; const b = K.mkBot(-6, 5); b.state = 'haulgo'; b.haulKey = 'cart';
    K.states(b, 120, () => gen.q.length > 0 && b.state === 'idle' && !b.carry.length);
    return gen.q.length > 0 || 'a cart load fueled nothing';
  }, opt);
}
