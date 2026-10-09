// mp.botfuel.*: bots that keep machines fueled, in co-op. The host simulates the bots and the hoppers; a guest sees the bots, what they are doing and the hoppers fill
// (dyn rows), asks the host to flip the switches, and nothing a guest sends can fill a machine beyond its hopper or turn the switches into anything else.
// Run: `await __selftest('mp.botfuel.')`
import { kit, UP, sp, mixOf, rar } from './botfuel_lib.js';

export default async function (ctx) {
  const { g, S, L } = ctx;
  const K = kit(ctx);
  const opt = { up: UP };
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(JSON.parse(JSON.stringify(m))); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const json = (m) => JSON.parse(JSON.stringify(m));
  const G = (name, fn) => K.guard(name, async () => { try { return await fn(); } finally { done(); g.crewViews = new Map(); } }, opt);

  await G('mp.botfuel.the-hosts-bot-rows-carry-the-errand-and-the-switches', async () => {
    const gen = K.gen(-3.4, 3.0); const a = K.mkBot(-6, 5), b = K.mkBot(-6.5, 5.5); a.carry = mixOf([0, 0, 0]); g.crew.goHome(a); b.fuelOff = true;
    role('host'); cap(); g.sendDyn(); const dyn = ofType('dyn')[0]; done(); if (!dyn) return 'no dyn';
    const ra = dyn.crew.find((r) => r[0] === a.id), rb = dyn.crew.find((r) => r[0] === b.id);
    if (!ra || ra[18] !== gen.id || ra[19] !== 1 || ra[20] !== 0 || ra[5] !== 'fwalk') return 'row a ' + JSON.stringify(ra && [ra[5], ra[18], ra[19], ra[20]]);
    if (!rb || rb[18] !== 0 || rb[20] !== 1) return 'row b ' + JSON.stringify(rb && [rb[18], rb[19], rb[20]]);
    if (dyn.cf !== 1) return 'cf ' + dyn.cf; S().crewFuel = false; role('host'); cap(); g.sendDyn(); const d2 = ofType('dyn')[0]; done(); return d2.cf === 0 || 'cf with the switch off ' + d2.cf;
  });

  await G('mp.botfuel.a-guest-sees-fueling-in-the-status-the-hopper-filling-and-the-panel-switches', async () => {
    const gen = K.gen(-3.4, 3.0); const a = K.mkBot(-6, 5); a.carry = mixOf([0, 0, 0, 0, 0]); g.crew.goHome(a); K.step(0.2);
    role('host'); cap(); K.states(a, 60, () => a.state === 'fgive' && gen.q.length >= 2); g.sendDyn(); const dyn = json(ofType('dyn')[0]); done();
    const hostQ = gen.q.length, jobId = a.fuelJob && a.fuelJob.id; if (!jobId || a.state !== 'fgive') return `host bot ${a.state} ${JSON.stringify(a.fuelJob)}`;
    gen.q.length = 0; S().crew = []; S().crewFuel = undefined; role('guest'); g.crewViews = new Map(); g.applyDyn(dyn);
    const v = S().crew.find((x) => x.id === a.id); if (!v || v.state !== 'fgive' || !v.fuelJob || v.fuelJob.id !== gen.id) return 'guest bot ' + JSON.stringify(v && [v.state, v.fuelJob]);
    if (gen.q.length !== hostQ) return `guest hopper ${gen.q.length}, host ${hostQ}`;
    const txt = g.crew.statusLine(v); if (!/^Fueling Generator A/.test(txt)) return txt;
    // the crew panel on the guest: the bot's switch and the crew switch as the host reports them
    const row = json(dyn); row.crew[0][20] = 1; row.cf = 0; g.applyDyn(row); g.openModal('crew');
    const card = document.querySelector('#crewList [data-fuelcfg]'), bb = document.querySelector('#crewList [data-fuel=bot]');
    g.ui.closeModals && g.ui.closeModals();
    return (card && /OFF/.test(card.textContent) && bb && /Fuel duty: off/.test(bb.textContent)) || `panel ${card && card.textContent.slice(0, 40)} / ${bb && bb.textContent}`;
  });

  await G('mp.botfuel.a-guest-asks-the-host-to-flip-the-switches-and-forged-asks-change-nothing', async () => {
    const a = K.mkBot(-6, 5); role('guest'); cap(); g.crewFuelToggle(0, false); g.crewFuelToggle(a.id, false); const cmds = ofType('cmd').filter((m) => m.c === 'crew' && m.d.act === 'fuelcfg'); done();
    if (cmds.length !== 2 || cmds[0].d.id !== 0 || cmds[0].d.on !== false || cmds[1].d.id !== a.id) return 'sent ' + JSON.stringify(cmds);
    if (S().crewFuel === false || a.fuelOff) return 'the guest changed things itself';
    role('host'); for (const m of cmds) g.netCmd(m.c, m.d); if (S().crewFuel !== false || a.fuelOff !== true) return `host after the asks: crew ${S().crewFuel} bot ${a.fuelOff}`;
    role('host'); g.netCmd('crew', { act: 'fuelcfg', id: 0, on: true }); g.netCmd('crew', { act: 'fuelcfg', id: a.id, on: true }); if (S().crewFuel === false || a.fuelOff) return 'turning them on again failed';
    const before = JSON.stringify([S().crewFuel, S().crew.map((b) => b.fuelOff)]);
    for (const d of [{ id: 'x', on: false }, { id: -4, on: false }, { id: 0, on: 'yes' }, { id: 0, on: 1 }, { id: 0 }, { id: a.id, on: null }, { id: 1e12, on: false }, { id: 0.5, on: false }, { id: [0], on: false }, { id: NaN, on: false }, { on: false }, null, 7]) { try { g.netCmd('crew', { act: 'fuelcfg', ...(d && typeof d === 'object' ? d : {}) }); } catch (e) { return 'a forged ask threw ' + e.message; } }
    try { g.netCmd('crew', { act: 'fuelcfg' }); g.netCmd('crew', null); } catch (e) { /* a null body is the old code's business */ }
    return JSON.stringify([S().crewFuel, S().crew.map((b) => b.fuelOff)]) === before || 'a forged ask changed the switches: ' + JSON.stringify([S().crewFuel, S().crew.map((b) => b.fuelOff)]);
  });

  await G('mp.botfuel.a-forged-hand-over-cannot-fill-a-machine-past-its-hopper-or-with-plush-it-refuses', async () => {
    const gen = K.gen(-3.4, 3.0), ch = K.charger(-1.0, 3.0); ch.dig = 1e9; const items = (n, r) => Array.from({ length: n }, () => ({ sp: sp(r), vr: 0 }));
    role('host'); cap();
    g.netCmd('tile', { id: gen.id, items: items(5000, 0) }); if (gen.q.length !== 50) return `a list of 5000 left the generator with ${gen.q.length} (50 wanted: the hopper is full and no more)`;
    if (ofType('give').flatMap((m) => m.items).length > 256) return 'the host handed back more than the 256 it looked at';
    gen.q.length = 0; ch.q.length = 0;
    g.netCmd('tile', { id: gen.id, items: [...items(3, 4), ...items(2, 5), { sp: 'x', vr: 0 }, { sp: 60009, vr: 0 }, { sp: -1, vr: 0 }, { sp: 2.5, vr: 0 }, null, 3, ...items(2, 1)] });
    if (gen.q.length !== 2 || gen.q.some((it) => rar(it) !== 1)) return 'forged rows got in: ' + JSON.stringify(gen.q.map(rar));
    g.netCmd('tile', { id: ch.id, items: items(500, 3) }); if (ch.q.length !== 50) return 'station ' + ch.q.length;
    const back = ofType('give').flatMap((m) => m.items); if (back.some((it) => !Number.isInteger(it.sp) || !Number.isInteger(it.vr))) return 'a made-up row was handed back: ' + JSON.stringify(back.filter((it) => !Number.isInteger(it.sp)));
    g.netCmd('tile', { id: gen.id, items: 'plush' }); g.netCmd('tile', { id: gen.id }); g.netCmd('tile', { id: 987654, items: items(3, 0) });
    return true;
  });

  await G('mp.botfuel.the-guests-copy-of-a-bot-never-moves-plush-into-a-hopper', async () => {
    const gen = K.gen(-3.4, 3.0); const a = K.mkBot(-3.4 - 1, 3.0); a.carry = mixOf([0, 0, 0, 0]); a.state = 'fgive'; a.fuelJob = { id: gen.id, n: 4, k: 'give' }; a.timer = 0;
    role('guest'); g.logi.visualOnly = true; let puffs = 0; const f0 = g.fx.fluff; g.fx.fluff = (...x) => { puffs++; return f0 && f0.apply(g.fx, x); };
    try { for (let n = 0; n < 60; n++) { g.time += 0.1; g.crew.guestUpdate(0.1, g.time); g.logi.update(0.1); } } finally { g.fx.fluff = f0; g.logi.visualOnly = false; }
    return (gen.q.length === 0 && a.carry.length === 4 && puffs > 0) || `hopper ${gen.q.length}, bucket ${a.carry.length}, puffs ${puffs} (the guest shows a puff and moves nothing)`;
  });

  await G('mp.botfuel.the-first-fueling-tells-the-guest-too', async () => {
    const gen = K.gen(-3.4, 3.0); const a = K.mkBot(-6, 5); a.carry = mixOf([0, 0]); role('host'); cap(); g.crew.goHome(a); K.states(a, 60, () => a.state === 'idle' && !a.carry.length);
    const t = ofType('toast').filter((m) => /Bots fuel your machines/.test(m.title)); done(); return (t.length === 1 && gen.q.length === 2) || `${t.length} toasts to the guest, hopper ${gen.q.length}`;
  });

  await G('mp.botfuel.a-late-joiner-gets-the-hopper-and-the-bots-from-the-next-row', async () => {
    const gen = K.gen(-3.4, 3.0); for (let n = 0; n < 12; n++) gen.q.push({ sp: sp(n % 4), vr: 0 }); const a = K.mkBot(-6, 5); a.fuelOff = true;
    role('host'); cap(); g.sendDyn(); const dyn = json(ofType('dyn')[0]); done(); gen.q.length = 0; S().crew = []; role('guest'); g.crewViews = new Map(); g.applyDyn(dyn);
    const v = S().crew.find((x) => x.id === a.id); return (gen.q.length === 12 && v && v.fuelOff === true) || `hopper ${gen.q.length} bot ${JSON.stringify(v && v.fuelOff)}`;
  });
}
