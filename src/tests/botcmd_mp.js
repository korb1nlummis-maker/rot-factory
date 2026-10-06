import { sp, kit } from './charger_lib.js';
// Click-a-bot in co-op: the guest's E becomes a crew command the host runs through the same function, and the guest's ring and panel come from synced crew state.
export default async function (ctx) {
  const { T, g, S, fresh, placeAtFloor, tiles, cellX, cellZ, toI, toK } = ctx;
  const { look, rawTile, run, json } = kit(ctx);
  const up = { crew: 1, crewSlots: 3, power: 1, vault: 1 };
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (fn) => async () => { try { return await fn(); } finally { done(); g.crewViews = new Map(); g.crewSel = null; } };
  const bot = (x = -6.5, z = 6.5) => { const b = g.crew.spawn(); b.x = x; b.z = z; b.y = 0; b.vy = 0; b.state = 'idle'; return b; };
  const hud = () => { g.updateBotHud(); return document.getElementById('biAct').textContent; };

  await T('crew.botcmd-mp-guest-e-sends-the-order-and-the-host-runs-the-same-function', guard(async () => {
    fresh(up); const b = bot(); const r = await placeAtFloor('gen', -3.4, 3.0, 2.0); if (!r.ok) return r.why; const gen = tiles().find((t) => t.type === 'gen');
    const nf = g.crew.nearestFace(cellX(gen.i), 0, cellZ(gen.k)); if (!nf) return true;
    role('guest'); cap(); g.crewSel = b.id; look(cellX(gen.i), gen.j * 0.6 + 0.3, cellZ(gen.k), 2.5); const guestText = hud(); g.useKey();
    const c = ofType('cmd').find((m) => m.c === 'crew' && m.d.act === 'ctx'); if (!c || c.d.id !== b.id || c.d.tgt.k !== 'tile' || c.d.tgt.id !== gen.id) return 'command ' + JSON.stringify(c);
    if (b.state !== 'idle' || b.deliver) return 'the guest ran the order itself';
    done(); role('host'); cap(); g.netCmd('crew', c.d); const toast = ofType('toast').find((m) => m.title === b.name);
    if (b.deliver !== gen.id || b.state !== 'goto' || b.dir !== nf.dir) return `host: deliver ${b.deliver} state ${b.state} dir ${b.dir}`;
    return (toast && 'E: ' + g.crew.intent(b, c.d.tgt).text === guestText && toast.text === g.crew.intent(b, c.d.tgt).toast) || `toast ${JSON.stringify(toast)} guest panel "${guestText}"`;
  }));
  await T('crew.botcmd-mp-guest-floor-dig-and-bin-and-charger-orders-reach-the-host', guard(async () => {
    fresh(up); const b = bot(); const ch = rawTile('charger', toI(-3.4), 0, toK(3.0)); ch.reserve = 2; const msgs = []; let lane = null; const { spot } = ctx;
    for (const l of [12, 8, 16, 20, 4]) { try { lane = spot(l); break; } catch (e) { /* next */ } }
    role('guest'); cap(); g.crewSel = b.id;
    look(cellX(ch.i), 0.3, cellZ(ch.k), 2.5); g.useKey(); if (lane) { look(cellX(lane.i - 2), 0, cellZ(lane.k), 3.0); g.useKey(); } const bp = g.hall.binPos; look(bp.x, 1.0, bp.z, 3.0); g.useKey();
    for (const m of ofType('cmd')) if (m.c === 'crew') msgs.push(m.d); done(); role('host'); cap();
    const kinds = msgs.map((d) => d.tgt.k + (d.tgt.dir !== undefined ? d.tgt.dir : '')); if (kinds[0] !== 'tile' || (lane && kinds[1] !== 'spot0') || kinds[kinds.length - 1] !== 'bin') return 'sent ' + kinds;
    g.netCmd('crew', msgs[0]); if (b.state !== 'chgwalk') return 'charger order: ' + b.state; if (lane) { g.netCmd('crew', msgs[1]); if (b.state !== 'goto' || b.dir !== 0) return 'dig order: ' + b.state; }
    g.netCmd('crew', msgs[msgs.length - 1]); return b.state === 'return' || 'bin order: ' + b.state;
  }));
  await T('crew.botcmd-mp-a-refused-order-comes-back-as-the-reason-and-changes-nothing-on-the-host', guard(async () => {
    fresh(up); const b = bot(); const ch = rawTile('charger', toI(-3.4), 0, toK(3.0)); ch.reserve = 0; role('host'); cap(); g.netCmd('crew', { act: 'ctx', id: b.id, tgt: { k: 'tile', id: ch.id } }); const t = ofType('toast')[0];
    return (t && t.text === 'This Charging Station is empty' && b.state === 'idle') || `toast ${JSON.stringify(t)} state ${b.state}`;
  }));
  await T('crew.botcmd-mp-guest-ring-and-panel-follow-the-synced-bot', guard(async () => {
    fresh(up); const b = bot(-2, 3); const gen = rawTile('gen', toI(-3.4), 0, toK(4.2)); b.battery = 0.5; b.deliver = gen.id; b.state = 'dwalk'; b.carry = [{ sp: sp(1), vr: 0 }, { sp: sp(2), vr: 0 }];
    role('host'); cap(); g.sendDyn(); const dyn = ofType('dyn')[0]; done(); const row = dyn.crew.find((r) => r[0] === b.id); if (!row || row[16] !== gen.id) return 'crew row ' + JSON.stringify(row && row.slice(0, 8)) + ' deliver ' + (row && row[16]);
    b.battery = 0.9; b.deliver = null; role('guest'); g.applyDyn(json(dyn)); const v = g.S.crew.find((x) => x.id === b.id); if (!v || v === b) return 'guest did not get its own view of the bot';
    if (v.deliver !== gen.id) return 'deliver not synced'; look(v.x, v.y + 0.25, v.z, 4.0); g.useKey(); if (g.crewSel !== b.id) return 'guest could not pick the synced bot';
    g.crew.updateMarker(g.time); const m = g.crew.marker; if (!m.visible || Math.hypot(m.position.x - v.x, m.position.z - v.z) > 0.01) return 'ring not on the view';
    const t = (g.updateBotHud(), document.getElementById('botInfo').textContent); const bad = ['Battery 50%', 'Carrying 2 of', 'Doing: Carrying plush to a drop-off', 'drop-off: Generator'].filter((x) => !t.includes(x));
    v.state = 'lowbat'; g.ui.renderCrew(); const status = document.querySelector('#crewList .crew-row [data-live=status]').textContent;
    if (!/^Build a Charging Station: .* is out of power.*battery 50%/.test(status) && !/^Waiting for a Charging Station/.test(status)) bad.push('status ' + status);
    return bad.length === 0 || `panel lacks ${bad}: ${t}`;
  }));
  await T('crew.botcmd-mp-no-bot-no-selection-on-a-guest-whose-bot-vanished', guard(async () => {
    fresh(up); const b = bot(); g.crewSel = b.id; S().crew = []; return (g.crewSelected() === null && g.crewSel === null) || 'selection kept a dead bot';
  }));
  await T('crew.botcmd-deliver-target-survives-save-and-reload-and-keeps-working', async () => {
    fresh(up); const b = bot(); const v = rawTile('vault', toI(-3.4), 0, toK(3.0)); b.deliver = v.id; g.noSave = false; g.save(); g.noSave = true;
    const saved = JSON.parse(localStorage.getItem('rotfactory.save.v1')).S; const sb = saved.crew.find((x) => x.id === b.id); if (!sb || sb.deliver !== v.id) return 'saved deliver ' + (sb && sb.deliver);
    const ent = saved.entities.find((e) => e.id === v.id); if (!ent) return 'vault not saved';
    S().crew = json(saved.crew); g.crew.sync(); const b2 = S().crew.find((x) => x.id === b.id); if (!b2 || b2.deliver !== v.id || !g.crew.objs.has(b2.id)) return 'not restored';
    b2.x = cellX(v.i) - 0.9; b2.z = cellZ(v.k); b2.y = 0; b2.origin = [b2.x, b2.z]; b2.trail = []; b2.dir = 0; b2.faceCell = { i: v.i - 1, j: 0, k: v.k }; b2.state = 'farm'; b2.timer = 5; b2.carry = [0, 1, 2, 3, 0, 1].map((r) => ({ sp: sp(r), vr: 0 }));
    run(30); return (v.stored.length === 6 && b2.carry.length === 0) || `vault ${v.stored.length}, carry ${b2.carry.length}`;
  });
}
