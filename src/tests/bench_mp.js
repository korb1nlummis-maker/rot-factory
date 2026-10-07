// mp.bench.* : the Crafting Table in co-op. One page plays both roles by switching g.net.role and capturing g.netSend (the way addons_net.js does):
// a guest's craft is only a command, the host runs the same craft() and hatches the bot, and the guest's bench follows what the host sends.
import * as B from '../bench.js';
import { BOT_ID, botPrice } from '../crafting.js';
import { benchKit } from './bench_lib.js';

export default async function (ctx) {
  const { T, g, S, fresh } = ctx;
  const K = benchKit(ctx);
  const UP = { crew: 1, crewSlots: 3 };
  let sent = [];
  const json = (m) => JSON.parse(JSON.stringify(m));
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const guard = (fn) => async () => { try { return await fn(); } finally { done(); g.ui.closeModals(); K.reset(); g.crewViews = new Map(); } };
  const crewRows = (list) => list.map((b) => [b.id, b.name, b.color, b.level, Math.round(b.xp), b.state, b.carry.length, +b.battery.toFixed(2), +b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2), 0, [], 0, null, b.dir || 0, 0, 0]);
  const dyn = (rows) => ({ t: 'dyn', belts: [], bpw: [], tiles: [], movers: [], crew: rows, cart: null, gcart: null, grid: null, dust: 0, alarms: [], cpw: null });

  await T('mp.bench.guest-craft-is-a-command-and-the-host-hatches-the-bot', guard(async () => {
    fresh(UP); g.crew.sync(); S().money = 1e9; const bad = [], n0 = S().crew.length, m0 = S().money;
    role('guest'); cap(); const r = g.craftItem(BOT_ID, 1); const cmds = sent.filter((m) => m.t === 'cmd'); done();
    if (!r) bad.push('the guest call returned false'); if (cmds.length !== 1 || cmds[0].c !== 'craft' || cmds[0].d.id !== BOT_ID || cmds[0].d.n !== 1) return 'the guest sent ' + JSON.stringify(cmds);
    if (S().crew.length !== n0 || S().money !== m0) bad.push('the guest changed the world itself');
    role('host'); cap(); g.netMessage(json(cmds[0])); done();
    if (S().crew.length !== n0 + 1) bad.push('the host did not hatch: ' + S().crew.length); if (m0 - S().money !== botPrice(n0)) bad.push(`charged ${m0 - S().money}, price ${botPrice(n0)}`);
    return bad.length === 0 || bad.join('; ');
  }));

  await T('mp.bench.host-refuses-a-guest-that-asks-for-too-many-or-has-no-bunk-or-no-money', guard(async () => {
    fresh(UP); g.crew.sync(); const bad = []; role('host'); cap();
    S().money = 1e9; const m0 = S().money, n0 = S().crew.length;
    for (const n of [4, 99, 1e9, Infinity, -2, 0, NaN, null, 'a', {}, []]) { g.netMessage(json({ t: 'cmd', c: 'craft', d: { id: BOT_ID, n } })); if (S().crew.length !== n0 || S().money !== m0) bad.push(`n=${JSON.stringify(n)} changed things (${S().crew.length - n0} bots, ${m0 - S().money} spent)`); }
    g.netMessage(json({ t: 'cmd', c: 'craft', d: { id: BOT_ID } })); if (S().crew.length !== n0) bad.push('no n crafted');
    g.netMessage(json({ t: 'cmd', c: 'craft', d: { id: 'bot:other', n: 1 } })); g.netMessage(json({ t: 'cmd', c: 'craft', d: { id: ['bot:scrapper'], n: 1 } })); if (S().crew.length !== n0) bad.push('a made-up id crafted a bot');
    S().money = 1; g.netMessage(json({ t: 'cmd', c: 'craft', d: { id: BOT_ID, n: 1 } })); if (S().crew.length !== n0 || S().money !== 1) bad.push('crafted without money');
    S().money = 1e9; g.netMessage(json({ t: 'cmd', c: 'craft', d: { id: BOT_ID, n: 3 } })); if (S().crew.length !== 4) bad.push('three into three free bunks: ' + S().crew.length);
    g.netMessage(json({ t: 'cmd', c: 'craft', d: { id: BOT_ID, n: 1 } })); if (S().crew.length !== 4) bad.push('a fifth bot into four bunks');
    done(); return bad.length === 0 || bad.join('; ');
  }));

  await T('mp.bench.guest-bench-counts-the-bots-the-host-sends-and-asks-for-a-free-bunk', guard(async () => {
    fresh(UP); g.crew.sync(); S().money = 1e9; const bad = [];
    role('host'); cap(); g.netMessage(json({ t: 'cmd', c: 'craft', d: { id: BOT_ID, n: 2 } })); done();
    const hostRows = crewRows(S().crew); if (hostRows.length !== 3) return 'host has ' + hostRows.length;
    // the guest page: its crew is only what the host's rows say, and its bench re-draws when the count changes
    role('guest'); cap(); S().crew = S().crew.slice(0, 1); g.crewViews = new Map(); g.crewViews.set(S().crew[0].id, S().crew[0]);
    K.open(); K.tab('robots'); K.pick(BOT_ID); const before = K.norm(K.detail().textContent);
    if (!/1 of 4 bunks used, 3 free/.test(before)) bad.push('guest start: ' + before.slice(0, 200));
    g.applyDyn(dyn(hostRows));
    const after = K.norm(K.detail().textContent); if (S().crew.length !== 3) bad.push('the guest has ' + S().crew.length + ' bots'); if (!/3 of 4 bunks used, 1 free/.test(after)) bad.push('the guest bench did not follow the host: ' + after.slice(0, 200));
    if (K.cardEl(BOT_ID).querySelector('.bc-own').textContent !== '3') bad.push('card count ' + K.cardEl(BOT_ID).querySelector('.bc-own').textContent);
    // the guest's Enter sends a craft command and changes nothing locally
    const m0 = S().money; sent.length = 0; K.key('Enter'); const cmds = sent.filter((m) => m.t === 'cmd'); if (cmds.length !== 1 || cmds[0].d.id !== BOT_ID || cmds[0].d.n !== 1) bad.push('guest Enter sent ' + JSON.stringify(cmds)); if (S().crew.length !== 3 || S().money !== m0) bad.push('the guest crafted locally');
    done(); S().crew = []; g.crew.clear(); g.crewViews = new Map();
    return bad.length === 0 || bad.join('; ');
  }));

  await T('mp.bench.guest-sees-the-same-rows-tabs-and-locks-from-the-hosts-upgrades', guard(async () => {
    fresh({ timber: 1, markers: 1, crew: 1 }); g.crew.sync(); const bad = [];
    K.open(); const host = JSON.stringify(B.buildRows(g).map((r) => [r.id, r.locked, r.cat, r.locked ? r.lock.text : r.price])); closeGuest();
    // a guest receives the host's upgrades and items through 'shared' and tunes itself from them: same rows
    role('guest'); cap(); const up = JSON.parse(JSON.stringify(S().up)); S().up = {}; g.T = g.tune(); g.applyShared({ t: 'shared', money: S().money, te: 0, up, gear: S().gear || {}, items: {}, mats: {}, boosts: S().boosts, contracts: [], gameMin: S().gameMin, golden: 0, outage: 0, clues: [], clueLevel: 0, eco: { md: 0, dx: 0, pl: 1e9 } });
    const guest = JSON.stringify(B.buildRows(g).map((r) => [r.id, r.locked, r.cat, r.locked ? r.lock.text : r.price])); done();
    if (host !== guest) bad.push('the guest bench differs from the host bench');
    return bad.length === 0 || bad.join('; ');
    function closeGuest() { g.ui.closeModals(); }
  }));
}
