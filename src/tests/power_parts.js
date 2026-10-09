// power.*: the power parts as things the player owns: bench rows and prices, placing with the real tool pipeline, taking them down,
// cable ports, settings (cfg, copy and paste, the Priority panel), E, hover readouts, saves, controls and docs.
import { makeKit, UP } from './power_lib.js';
import * as PP from '../powerparts.js';
import { SAVE_KEY } from '../config.js';
import { loadSaved } from '../state.js';
import { infoFor } from '../info.js';
import { CONTROLS, RESERVED_KEYS } from '../controls.js';
import { PARTS } from '../catalog.js';

export default async function (ctx) {
  const { T, g, S, adv, recipes, UPGRADES, craft, selectTool, aimPoint, plan, placeNow, fresh, p } = ctx;
  const K = makeKit(ctx);
  const { reset, grid, part, wire, netOf, mach, look } = K;
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const ALLP = { ...UP, prioPower: 1 };
  const IDS = ['switch', 'breaker', 'meter', 'battery:1', 'battery:2', 'battery:3'];
  const info = (e) => infoFor(g, { kind: 'mach', id: e.id });
  const clean = (s) => !/[\u2014\u2013]/.test(s) && !/undefined|NaN|\[object/.test(s);

  // ------------------------------------------------------------------ bench rows, prices, upgrades
  await T('power.recipes-gated-and-priced-for-big-wallets', async () => {
    const bad = []; fresh({}); g.T = g.tune();
    for (const id of [...IDS, 'pswitch']) if (recipes(g).some((r) => r.id === id)) bad.push(id + ' listed with no upgrades');
    fresh({ power: 1 }); g.T = g.tune(); const ids = recipes(g).map((r) => r.id);
    for (const id of IDS) if (!ids.includes(id)) bad.push(id + ' missing with Power Grid');
    if (ids.includes('pswitch')) bad.push('Priority Switch listed without Priority Power');
    fresh({ prioPower: 1 }); g.T = g.tune(); const only = recipes(g).map((r) => r.id);
    if (only.join() !== 'pswitch') bad.push('Priority Power alone should list exactly the Priority Switch: ' + only);
    fresh(ALLP); g.T = g.tune();
    const want = { switch: 6000, pswitch: 90000, breaker: 25000, meter: 1500, 'battery:1': 40000, 'battery:2': 400000, 'battery:3': 4000000 };
    for (const [id, base] of Object.entries(want)) {
      const r = recipes(g).find((x) => x.id === id); if (!r) { bad.push('no recipe ' + id); continue; }
      if (r.price !== base * 3) bad.push(`${id} price ${r.price} want ${base * 3} (spec ${base} x the K=3 bench multiplier)`);
      if (!r.use || !r.desc || !r.statusFn && r.status === undefined) bad.push(id + ' has no text');
      if (!clean(r.desc + r.use + r.name + r.status)) bad.push(id + ' text has a banned character: ' + r.desc);
    }
    const tiers = PARTS.power.RECIPES(g).filter((r) => r.kind === 'battery'); if (tiers.length !== 3 || tiers.some((r, i) => !r.p || r.p.mark !== i + 1)) bad.push('battery rows must carry p.mark');
    const up = (id) => UPGRADES.find((u) => u.id === id);
    if (!up('autoReset') || up('autoReset').cost[0] !== 900000 || up('autoReset').req.id !== 'power') bad.push('Remote Reset 900k');
    if (!up('prioPower') || up('prioPower').cost[0] !== 4000000 || up('prioPower').req.id !== 'power') bad.push('Priority Power 4M');
    // bought through the shop with the real purchase path
    fresh({ power: 1 }); S().money = 1e9; if (!g.buy('prioPower') || !g.T.prioPower) bad.push('buy prioPower'); const m0 = S().money; if (m0 !== 1e9 - 4000000) bad.push('prioPower charged ' + (1e9 - m0));
    if (!g.buy('autoReset') || !g.T.autoReset) bad.push('buy autoReset');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.bench-charges-the-card-price-and-refuses-without-money', async () => {
    fresh(ALLP); g.T = g.tune(); const bad = []; S().money = 1e9;
    for (const id of [...IDS, 'pswitch']) {
      const r = recipes(g).find((x) => x.id === id), m0 = S().money; g.craftItem(id, 2);
      if (m0 - S().money !== r.price * 2 || S().items[id] !== 2) bad.push(`${id}: paid ${m0 - S().money} for 2, have ${S().items[id]}`);
      const t = g.tools.find((x) => x && x.id === id); if (!t || !t.icon) bad.push(id + ' not on the hotbar');
    }
    fresh(ALLP); g.T = g.tune(); S().money = 100000 * 3 - 1; g.craftItem('battery:2', 1); if (S().items['battery:2']) bad.push('crafted a 400k battery with too little money');
    return bad.length === 0 || bad.join(' | ');
  });

  // ------------------------------------------------------------------ the real tool pipeline
  await T('power.tools-place-every-part-and-the-hammer-hands-it-back', async () => {
    reset(ALLP, false); const bad = []; S().stats.pwSwitches = 1; S().stats.pwBreakers = 1;
    const ids = [...IDS, 'pswitch'], type = { switch: 'switch', pswitch: 'switch', breaker: 'breaker', meter: 'meter', 'battery:1': 'battery', 'battery:2': 'battery', 'battery:3': 'battery' };
    for (const [n, id] of ids.entries()) {
      craft(id, 2); selectTool(id); const x = -11 + n * 1.2; aimPoint(x, 0, 4, 2); const pl = await plan();
      if (!pl || !pl.ok) { bad.push(id + ' plan: ' + (pl && pl.why)); continue; }
      if (!g.machines.ghost) bad.push(id + ' no ghost');
      const before = S().stats.built | 0; const k = placeNow(); const e = S().entities.find((q) => q.type === type[id] && Math.abs(q.x - pl.ent.x) < 0.01 && Math.abs(q.z - pl.ent.z) < 0.01);
      if (k !== 1 || !e) { bad.push(id + ' not placed'); continue; }
      if ((S().stats.built | 0) !== before + 1) bad.push(id + ' not counted as built');
      if (S().items[id] !== 1) bad.push(`${id} item count ${S().items[id]}`);
      if (!g.machines.items.has(e.id)) bad.push(id + ' has no mesh in machines.items');
      if (id.startsWith('battery') && (e.mark !== +id.split(':')[1] || e.charge !== 0)) bad.push(id + ' fields ' + JSON.stringify(e));
      if (id === 'pswitch' && e.prio !== 0) bad.push('a new Priority Switch is group 0 (undefined)'); if (id === 'switch' && (e.prio !== undefined || e.on !== false)) bad.push('a new plain switch starts open with no group: ' + JSON.stringify(e));
      if (id === 'breaker' && (!e.armed || e.tripped || e.trip.at !== 1 || e.trip.delay !== 3)) bad.push('breaker defaults ' + JSON.stringify(e));
      // aim at it and take it down: the same item comes back
      ctx.selectTool('hammer'); look(e.x, 0.5, e.z, 2); g.hammerHit(); adv(0.1);
      if (g.machines.items.has(e.id)) bad.push(id + ' still standing after the hammer');
      if (S().items[id] !== 2) bad.push(`${id} hammer gave back ${S().items[id] - 1} (have ${S().items[id]})`);
    }
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.priority-switch-needs-a-switch-and-a-breaker-built-once', async () => {
    reset(ALLP, false); const bad = []; craft('pswitch'); selectTool('pswitch'); aimPoint(-8, 0, 4, 2); let pl = await plan();
    if (pl.ok || !/Power Switch and a Breaker Box/.test(pl.why)) bad.push('allowed with nothing built: ' + JSON.stringify([pl.ok, pl.why]));
    const r = recipes(g).find((x) => x.id === 'pswitch'); if (!/first/.test(r.status)) bad.push('bench status should say what is missing: ' + r.status);
    part('switch', -2, 8); S().stats.pwSwitches = 1; pl = await plan(); if (pl.ok) bad.push('allowed with only a switch');
    S().stats.pwBreakers = 1; aimPoint(-8, 0, 4, 2); pl = await plan(); if (!pl.ok) bad.push('refused with both built: ' + pl.why);
    // building them for real counts
    reset(ALLP, false); craft('switch'); craft('breaker'); for (const [n, id] of ['switch', 'breaker'].entries()) { selectTool(id); aimPoint(-10 + n * 2, 0, 4, 2); await plan(); placeNow(); }
    if (!(S().stats.pwSwitches > 0 && S().stats.pwBreakers > 0)) bad.push('building them did not count: ' + JSON.stringify(S().stats));
    craft('pswitch'); selectTool('pswitch'); aimPoint(-4, 0, 4, 2); pl = await plan(); if (!pl.ok) bad.push('refused after building both: ' + pl.why);
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.two-parts-cannot-share-a-spot-and-a-wall-meter-mounts-on-the-wall', async () => {
    reset(ALLP, false); const bad = []; craft('battery:1', 2); selectTool('battery:1'); aimPoint(-8, 0, 4, 2); await plan(); placeNow(); aimPoint(-8, 0, 4, 2); const pl = await plan();
    if (pl.ok || !/already/.test(pl.why)) bad.push('second battery on the same spot: ' + JSON.stringify([pl.ok, pl.why]));
    const c = g.placeConflict(g.curTool(), { x: -8, y: 0, z: 4, ry: 0 }); if (!c) bad.push('the host would accept a duplicate from a guest');
    reset(ALLP, false); ctx.plushWall(12); craft('meter'); selectTool('meter'); ctx.standBeforeWall(); const pw = await plan();
    if (!pw || !pw.ok || pw.ent.mount !== 'wall') bad.push('aimed at a wall: ' + JSON.stringify(pw && pw.ent));
    else {
      placeNow(); const m = S().entities.find((e) => e.type === 'meter'); if (!m || m.mount !== 'wall') bad.push('placed meter mount ' + (m && m.mount));
      else { if (!(m.z > 0.9 && m.z < 1.3)) bad.push('wall meter z ' + m.z + ' (the wall face is at 1.2)'); if (Math.abs(Math.cos(m.ry) + 1) > 0.01) bad.push('it should face the player: ry ' + m.ry); }
    }
    reset(ALLP, false); craft('meter'); selectTool('meter'); aimPoint(-8, 0, 4, 2); const pf = await plan(); if (!pf.ok || pf.ent.mount !== 'floor') bad.push('floor meter: ' + JSON.stringify(pf && pf.ent));
    return bad.length === 0 || bad.join(' | ');
  });

  // ------------------------------------------------------------------ cable ports and what a cable may join
  await T('power.cable-ports-per-object', async () => {
    reset({ ...UP }); const bad = [], G = K.gen(-3, 8), P = K.pole(-3, 5);
    const belts = Array.from({ length: 20 }, (_, n) => K.tile('belt', -9 + (n % 13) * 1.2, 1 + Math.floor(n / 13) * 1.2));   // every belt is a line of its own (1.2 m apart)
    const tryW = (a, b) => wire(a, b);
    for (let n = 0; n < 4; n++) if (!tryW(G, belts[n]).ok) bad.push(`generator cable ${n + 1} refused`);
    const r5 = tryW(G, belts[4]); if (r5.ok || !/no free cable socket/.test(r5.why)) bad.push('fifth cable on a generator: ' + JSON.stringify(r5.ok || r5.why));
    // a machine takes one
    const r4 = tryW(P, belts[0]); if (r4.ok) bad.push('a belt that already has a cable took a second one');
    for (let n = 0; n < 10; n++) { const r = tryW(P, belts[4 + n]); if (!r.ok) bad.push(`pole cable ${n + 1}: ${r.why}`); }
    const r11 = tryW(P, belts[14]); if (r11.ok || !/no free cable socket \(it takes 10\)/.test(r11.why)) bad.push('an eleventh cable on a pole (10 sockets): ' + JSON.stringify(r11.ok || r11.why));
    // removing a cable at the limit works, and frees the socket
    const rm = g.cables.connect(G.id, belts[0].id); if (!rm.ok || !rm.removed) bad.push('removing a cable at the limit: ' + JSON.stringify(rm)); if (!tryW(G, belts[15]).ok) bad.push('the freed socket was not free');
    // Grid Range no longer adds sockets: it only lengthens a cable
    reset({ ...UP, gridRange: 3 }); const P2 = K.pole(-3, 5), t2 = Array.from({ length: 13 }, (_, n) => K.tile('belt', -9 + n * 1.2, 1));
    let ok = 0; for (const b of t2) if (wire(P2, b).ok) ok++; if (ok !== 10) bad.push('a pole takes 10 cables whatever Grid Range says, took ' + ok);
    // the rungs: Portable 2, ordinary 4, Turbine 4, Plant 5, Station 6, Titan 8
    const want = { portable: 2, std: 4, turbine: 4, plant: 5, grid: 6, titan: 8 }; for (const [k, n] of Object.entries(want)) if (PP.GEN_BY_KEY[k].ports !== n) bad.push(`${k} takes ${PP.GEN_BY_KEY[k].ports} cables, expected ${n}`);
    if (PP.maxPorts({ type: 'switch' }) !== 2 || PP.maxPorts({ type: 'battery' }) !== 4 || PP.maxPorts({ type: 'breaker' }) !== 6 || PP.maxPorts({ type: 'charger' }) !== 1 || PP.maxPorts({ type: 'belt' }) !== 1 || PP.maxPorts({ type: 'meter' }) !== 1 || PP.maxPorts({ type: 'pole' }) !== 10 || PP.maxPorts({ type: 'hlamp' }) !== 2) bad.push('maxPorts table');
    // the power parts
    reset(UP); const sw = part('switch', -1, 6), bt = part('battery', 0.6, 6), br = part('breaker', 2.4, 6), a = K.pole(-9, 2), q = [0, 1, 2, 3, 4, 5, 6].map((n) => K.pole(-6 + n * 2, 2));
    const cnt = (e, list) => list.filter((o) => wire(e, o).ok).length;
    if (cnt(sw, q) !== 2) bad.push('switch ports'); if (cnt(bt, q.slice(2)) !== 4) bad.push('battery ports'); if (cnt(br, [a, ...q]) !== 6) bad.push('breaker ports');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.cable-tool-warns-before-the-click-when-a-port-is-taken', async () => {
    reset(); const bad = [], G = K.gen(-10, 3), b1 = K.tile('belt', -2, 3), b2 = K.tile('belt', -2, 4.2), b3 = K.tile('belt', 2, 3), b4 = K.tile('belt', -2, 5.4), b5 = K.tile('belt', -2, 6.6); wire(G, b1); wire(G, b2); wire(G, b4); wire(G, b5); craft('cable', 1); selectTool('cable');
    look(2, 0.3, 3, 2); g.cables.click(g.curTool()); if (g.cables.from !== b3.id) bad.push('could not start at the free belt: ' + K.hintText());
    look(-10, 0.5, 3, 2); if (!g.cables.preview || g.cables.preview.state !== 'red' || !/no free cable socket \(it takes 4\)/.test(K.hintText())) bad.push('no warning at a full generator: ' + JSON.stringify(g.cables.preview) + ' ' + K.hintText());
    g.cables.cancel(); g.stowed = true; return bad.length === 0 || bad.join(' | ');
  });

  await T('power.a-switch-cannot-be-wired-to-another-switch-and-new-parts-are-wireable', async () => {
    reset(); const a = part('switch', -8, 6), b = part('switch', -2, 6), bad = [];
    const r = wire(a, b); if (r.ok || !/not to another switch/.test(r.why)) bad.push('switch to switch: ' + JSON.stringify(r));
    for (const t of ['switch', 'battery', 'breaker', 'meter']) { const e = part(t, -10 + bad.length, 8); const gp = K.pole(-4, 3); const rr = wire(e, gp); if (!rr.ok) bad.push(t + ' not wireable: ' + rr.why); }
    // the wire tool aims at them and names them
    reset(); const bt = part('battery', -8, 6), pl = K.pole(-4, 3); craft('cable', 1); selectTool('cable'); look(-8, 0.5, 6, 2); g.cables.click(g.curTool()); if (g.cables.from !== bt.id) bad.push('could not start a wire at a battery: ' + K.hintText());
    look(-4, 1, 3, 2); g.cables.click(g.curTool()); if (S().cables.length !== 1) bad.push('could not finish the wire: ' + K.hintText()); else if (!/Power Storage Mk1/.test(K.hintText())) bad.push('the wire message should name the part: ' + K.hintText());
    g.cables.cancel(); g.stowed = true;
    return bad.length === 0 || bad.join(' | ');
  });

  // ------------------------------------------------------------------ settings
  await T('power.cfg-whitelist-and-guest-safety', async () => {
    reset(); const sw = part('switch', -8, 6), ps = part('switch', -6, 6, { prio: 3 }), br = part('breaker', -4, 6), bt = part('battery', -2, 6), bad = [];
    const refuse = (e, patch, why) => { const r = g.setCfg(e, patch); if (r.ok) bad.push(why + ': accepted ' + JSON.stringify(patch)); };
    refuse(sw, { prio: 2 }, 'a plain switch has no group'); refuse(sw, { shed: true }, 'plain switch shed'); refuse(sw, { on: 1 }, 'on needs a boolean'); refuse(sw, { evil: 1 }, 'unknown key');
    refuse(ps, { prio: 9 }, 'group above 8'); refuse(ps, { prio: -1 }, 'negative group'); refuse(ps, { prio: 1.5 }, 'fractional group'); refuse(ps, { shed: true }, 'forced shed');
    refuse(br, { tripped: true }, 'forced trip'); refuse(br, { trip: { delay: 0.1 } }, 'delay under 0.5'); refuse(br, { trip: { at: 3 } }, 'at over 2'); refuse(br, { trip: { x: 1 } }, 'unknown trip key'); refuse(br, { mark: 3 }, 'breaker has no mark');
    refuse(bt, { charge: 1e9 }, 'a guest may not set the charge'); refuse(bt, { mark: 3 }, 'mark is fixed by the item'); refuse(bt, { name: 5 }, 'name needs text');
    if (ps.prio !== 3 || br.tripped || bt.charge !== 0) bad.push('a refused patch changed something');
    if (!g.setCfg(ps, { prio: 8, name: 'Mess <b>hall</b>' }).ok || ps.prio !== 8 || /[<>]/.test(ps.name)) bad.push('group and name: ' + JSON.stringify([ps.prio, ps.name]));
    if (!g.setCfg(br, { trip: { delay: 10 }, name: 'North' }).ok || br.trip.delay !== 10 || br.trip.at !== 1) bad.push('trip merge: ' + JSON.stringify(br.trip));
    if (!g.setCfg(sw, { name: 'x'.repeat(60) }).ok || sw.name.length !== 24) bad.push('name length ' + (sw.name || '').length);
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.copy-paste-priority-group-and-breaker-settings', async () => {
    reset(); const a = part('switch', -8, 6, { prio: 6 }), b = part('switch', -6, 6, { prio: 1 }), c = part('breaker', -4, 6), d = part('breaker', -2, 6), bad = [];
    g.setCfg(c, { trip: { at: 1.5, delay: 7 }, armed: false });
    look(-8, 0.5, 6, 2); if (!(g.copyCfg(a) && g.cfgClip.vals.prio === 6)) bad.push('copy of a priority group: ' + JSON.stringify(g.cfgClip));
    look(-6, 0.5, 6, 2); g.useKey(); if (b.prio !== 6) bad.push('E on the aimed switch did not paste the group: ' + b.prio);
    g.cfgClip = null; g.copyCfg(c); const r = g.pasteCfg(d); if (!r.ok || d.trip.at !== 1.5 || d.trip.delay !== 7 || d.armed !== false) bad.push('breaker paste: ' + JSON.stringify([r, d.trip, d.armed]));
    const wrong = g.pasteCfg(a); if (wrong.ok) bad.push('a breaker setting pasted into a switch');
    g.cfgClip = null; return bad.length === 0 || bad.join(' | ');
  });

  // ------------------------------------------------------------------ E
  await T('power.E-toggles-a-switch-resets-a-breaker-and-opens-the-priority-panel', async () => {
    reset(); const bad = [], A = grid(-10, 3, { gens: 1, fans: 1 }), B = grid(8, 3, { fans: 1 }), sw = part('switch', -1, 3); wire(sw, A.pole); wire(sw, B.pole);
    look(-1, 0.5, 3, 2); g.useKey(); adv(0.3); if (!sw.on || !K.allPowered(B)) bad.push('E on a plain switch did not close it');
    g.useKey(); adv(0.3); if (sw.on) bad.push('a second E did not open it');
    // priority switch: E opens the panel listing every priority switch; E on a shed one resets it
    const ps = part('switch', -1, 6, { prio: 2, on: true }), ps2 = part('switch', 3, 6, { prio: 5 }); look(-1, 0.5, 6, 2); g.useKey();
    if (g.ui.openModal !== 'pwpanel') bad.push('E on a priority switch did not open the panel: ' + g.ui.openModal);
    else { const rows = document.querySelectorAll('#pwpList .jcard'); if (rows.length !== 2) bad.push('panel rows ' + rows.length); g.ui.closeModals(); }
    // breaker
    const G = grid(-6, 8, { gens: 1, fans: 6 }); const br = part('breaker', -6, 5.6); wire(br, G.pole); adv(4); if (!br.tripped) return 'setup: no trip';
    look(-6, 0.5, 5.6, 2); g.useKey(); if (br.tripped) bad.push('E on a tripped breaker did not reset it'); void G;
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.priority-panel-rename-regroup-toggle-and-reset', async () => {
    reset(); const bad = [], R = [part('switch', -8, 6, { prio: 2, on: true }), part('switch', -5, 6, { prio: 4 }), part('switch', -2, 6, { prio: 0 })];
    PP.openPanel(g, R[0].id); if (g.ui.openModal !== 'pwpanel') return 'panel did not open'; const rows = () => [...document.querySelectorAll('#pwpList .jcard')];
    if (rows().length !== 3) bad.push('rows ' + rows().length);
    rows()[0].querySelector('[data-a=up]').click(); if (R[0].prio !== 3) bad.push('+ did not raise the group: ' + R[0].prio);
    rows()[0].querySelector('[data-a=down]').click(); rows()[0].querySelector('[data-a=down]').click(); if (R[0].prio !== 1) bad.push('- did not lower it: ' + R[0].prio);
    rows()[2].querySelector('[data-a=down]').click(); if (R[2].prio !== 0) bad.push('group floors at 0: ' + R[2].prio);
    const inp = rows()[1].querySelector('input'); inp.value = 'Workshop'; inp.dispatchEvent(new Event('change')); if (R[1].name !== 'Workshop') bad.push('rename ' + R[1].name);
    rows()[1].querySelector('[data-a=toggle]').click(); if (!R[1].on) bad.push('toggle did not close it');
    R[0].shed = true; PP.renderPanel(g); if (!rows()[0].querySelector('[data-a=reset]')) bad.push('a shed switch shows a Reset button'); if (!/SHED/.test(rows()[0].textContent)) bad.push('shed state not shown');
    g.ui.closeModals(); return bad.length === 0 || bad.join(' | ');
  });

  // ------------------------------------------------------------------ hover readouts
  await T('power.hover-readouts-say-what-each-part-is-doing', async () => {
    reset(); const bad = [], G = grid(-8, 3, { gens: 1, fans: 1 }), sw = part('switch', -2, 6), ps = part('switch', 0, 6, { prio: 4, name: 'Mess' }), br = part('breaker', -8, 5.4), bt = part('battery', -7, 5.4, { mark: 2, charge: 90000 }), mt = part('meter', -9.4, 5.4);
    wire(sw, G.pole); wire(ps, G.pole); adv(6);
    const a = info(sw), b = info(ps), c = info(br), d = info(bt), m = info(mt);
    const has = (r, what, re) => { if (!r || !re.test(r.title + ' ' + r.lines.join(' '))) bad.push(what + ': ' + JSON.stringify(r)); };
    has(a, 'switch open', /POWER SWITCH · OPEN/); has(a, 'switch lamp', /Lamp red: only 1 of 2 cables/); has(a, 'switch hint', /E switches it/);
    has(b, 'priority', /PRIORITY SWITCH · OPEN/); has(b, 'group', /Priority group 4/); has(b, 'name', /"Mess"/); has(b, 'panel', /panel/);
    has(c, 'breaker', /BREAKER BOX · ARMED/); has(c, 'rating', /wants .* kW of 8\.0 kW rated/); has(c, 'trip rule', /Trips the grid when demand stays over 8\.0 kW \(1 x rated\) for 3 s/);
    has(d, 'battery', /POWER STORAGE MK2 · CHARGING/); has(d, 'charge', /Charge 9\d,\d{3} of 360,000 kJ \(25%\)/); has(d, 'rate', /up to 200 kW/); has(d, 'summary', /Grid 8\.0 kW supplied/);
    has(m, 'meter', /LOAD METER · OK/); has(m, 'meter numbers', /Supply 8\.0 kW · demand 2\.\d+ kW · rated 8\.0 kW/); has(m, 'meter storage', /Storage 25% \(charging\)/); has(m, 'meter graph', /Supply  [▁-█]+/);
    // closing, tripping, shedding change the words
    g.setCfg(sw, { on: true }); wire(sw, K.pole(4, 6)); adv(0.2); has(info(sw), 'closed', /POWER SWITCH · CLOSED/);
    G.addFans(5); bt.charge = 0; br.trip.delay = 0.5; adv(2); has(info(br), 'tripped', /BREAKER BOX · TRIPPED/); has(info(br), 'tripped text', /GRID TRIPPED/); has(info(mt), 'tripped meter', /LOAD METER · TRIPPED/);
    // the pole and the generator carry a one-line summary when the grid has storage or a breaker
    has(infoFor(g, { kind: 'tile', id: G.pole.id }), 'pole summary', /Grid .* kW supplied, .* kW wanted, .* kW rated · storage/);
    has(infoFor(g, { kind: 'tile', id: G.gens[0].id }), 'generator summary', /rated/);
    for (const r of [a, b, c, d, m]) if (r && !clean(r.title + r.lines.join(' '))) bad.push('banned text in ' + r.title);
    // a lone grid with nothing of ours keeps its old readout
    reset(); const H = grid(-8, 3, { gens: 1, fans: 1 }); adv(1); const pr = infoFor(g, { kind: 'tile', id: H.pole.id }); if (!pr || pr.lines.some((l) => /rated/.test(l))) bad.push('plain pole readout changed: ' + JSON.stringify(pr));
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.shed-and-battery-readouts', async () => {
    reset(); const bad = [], M = grid(-12, 3, { gens: 1, fans: 4 }), B = grid(-2, 3, { fans: 3 }), ps = part('switch', -7, 7.4, { prio: 1, on: true }); wire(ps, M.pole); wire(ps, B.pole); adv(1);
    const r = info(ps); if (!/SHED/.test(r.title) || !/stays open until it is reset/.test(r.lines.join(' ')) || !/E resets/.test(r.lines.join(' '))) bad.push('shed readout ' + JSON.stringify(r));
    const bt = part('battery', -12, 5.4, { mark: 1, charge: 36000 }); bt.charge = 36000; ps.shed = false; adv(0.2); const d = info(bt);
    if (!/IDLE|DISCHARGING/.test(d.title)) bad.push('battery title ' + d.title);
    return bad.length === 0 || bad.join(' | ');
  });

  // ------------------------------------------------------------------ saves
  await T('power.tripped-saves-and-loads', async () => {
    reset(); const bad = [], G = grid(-8, 3, { gens: 1, fans: 6 }), br = part('breaker', -8, 5.4, { name: 'Main' }), bt = part('battery', -6.8, 5.4, { mark: 3, charge: 0, name: 'Bank' }), sw = part('switch', -2, 6, { prio: 5, on: true, name: 'Annex' }), mt = part('meter', -9.4, 5.4, { mount: 'floor' });
    wire(sw, G.pole); wire(sw, K.pole(4, 6)); br.trip.delay = 0.5; adv(2); if (!br.tripped) return 'setup: no trip'; adv(0.3); bt.charge = 123456;   // a tripped grid neither charges nor discharges its storage
    const ids = { br: br.id, bt: bt.id, sw: sw.id, mt: mt.id }, charge = bt.charge, nCables = S().cables.length, shedBefore = sw.shed;   // the overloaded grid shed the priority switch before the trip
    g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok || !localStorage.getItem(SAVE_KEY)) throw new Error('save failed');
    const saved = loadSaved(); g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play'; K.small();
    const it = (id) => (g.machines.items.get(id) || {}).ent;
    const b2 = it(ids.br), t2 = it(ids.bt), s2 = it(ids.sw), m2 = it(ids.mt);
    if (!b2 || !t2 || !s2 || !m2) return 'parts missing after loading: ' + JSON.stringify([!!b2, !!t2, !!s2, !!m2]);
    if (!b2.tripped || b2.trip.delay !== 0.5 || b2.name !== 'Main' || b2.armed !== true) bad.push('breaker fields ' + JSON.stringify(b2));
    if (t2.mark !== 3 || !near(t2.charge, charge, 5) || t2.name !== 'Bank') bad.push('battery fields ' + JSON.stringify(t2));
    if (!shedBefore) bad.push('setup: the priority switch should have been shed'); if (s2.prio !== 5 || s2.on !== true || s2.name !== 'Annex' || s2.shed !== shedBefore) bad.push('switch fields ' + JSON.stringify(s2));
    if (S().cables.length !== nCables) bad.push('cables ' + S().cables.length);
    adv(1.5); const net = g.power.netOfEnt(b2); if (!net || !net.tripped || net.sat !== 0) bad.push('the grid is not tripped after the reload: ' + JSON.stringify(net && { s: net.sat, t: net.tripped }));
    if (!(PP.lampOf(g, b2) === 'red')) bad.push('lamp ' + PP.lampOf(g, b2));
    // the mesh is back and the ents are the same objects the saved entity list holds
    if (!g.machines.items.get(ids.mt).obj.userData.cv) bad.push('meter mesh missing');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.old-saves-without-the-new-fields-get-defaults', async () => {
    reset(); const bad = [];
    const mk = (type, extra) => { const e = { id: g.nextId(), type, x: -8 + g.nextId() % 5 * 0.7, y: 0, z: 6, ...extra }; S().entities.push(e); g.addEntity(e); return g.machines.items.get(e.id).ent; };
    const sw = mk('switch'), br = mk('breaker'), bt = mk('battery'), mt = mk('meter'), ps = mk('switch', { prio: 99 }), bt2 = mk('battery', { mark: 7, charge: -5 });
    if (sw.on !== false || sw.prio !== undefined || sw.shed !== false) bad.push('switch ' + JSON.stringify(sw));
    if (br.armed !== true || br.tripped !== false || br.trip.at !== 1 || br.trip.delay !== 3) bad.push('breaker ' + JSON.stringify(br));
    if (bt.mark !== 1 || bt.charge !== 0 || bt2.mark !== 3 || bt2.charge !== 0) bad.push('battery ' + JSON.stringify([bt, bt2]));
    if (mt.mount !== 'floor' || ps.prio !== 8) bad.push('meter/prio ' + JSON.stringify([mt, ps]));
    adv(2); if ((g.errCount || 0) !== (ctx.g.errCount || 0)) bad.push('frame errors');
    return bad.length === 0 || bad.join(' | ');
  });

  // ------------------------------------------------------------------ the M key, controls, docs
  await T('power.M-key-shows-the-load-meter-for-the-nearest-grid', async () => {
    reset(); const bad = [], G = grid(-8, 3, { gens: 1, fans: 2 }); void G;
    const row = CONTROLS.flatMap((gr) => gr.rows).find((r) => r.codes.includes('KeyM')); if (!row || !/Load meter/.test(row.what) || !clean(row.what)) bad.push('controls row: ' + JSON.stringify(row));
    if ('KeyM' in RESERVED_KEYS) bad.push('KeyM is still reserved');
    p().pos.set(-6, 0, 5); const press = () => g.onKey({ code: 'KeyM', target: null, repeat: false, preventDefault() {} }, true);
    press(); adv(0.6); const el = document.getElementById('pwMeterHud'); if (!g._pwHud || !el || el.style.display === 'none') bad.push('M did not show the readout');
    else if (!/Grid 8\.0 kW supplied, 4\.0 kW wanted, 8\.0 kW rated/.test(el.textContent)) bad.push('readout text: ' + el.textContent);
    press(); adv(0.6); if (g._pwHud || (el && el.style.display !== 'none')) bad.push('M again did not hide it');
    reset(); press(); adv(0.6); if (!/No grid within reach/.test(el.textContent)) bad.push('with no grid at all: ' + el.textContent); press(); adv(0.3);
    return bad.length === 0 || bad.join(' | ');
  });

  await T('power.docs-mention-the-parts', async () => {
    const src = await (await fetch('/README.md')).text().catch(() => ''); const bad = [];
    if (src) {
      if (!/Power Switch/.test(src) || !/Breaker Box/.test(src) || !/Priority Switch/.test(src) || !/Power Storage/.test(src) || !/Load Meter/.test(src)) bad.push('README is missing a power part');
      if (/[\u2014\u2013]/.test(src.split('\n').filter((l) => /Power parts/.test(l)).join(''))) bad.push('the README line has an em dash');
    }
    return bad.length === 0 || bad.join(' | ');
  });
  void mach; void netOf; void wire;
}
