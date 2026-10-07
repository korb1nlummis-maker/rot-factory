// Catalog part: power. Owned by wave 2 (4.3): Power Switch, Priority Switch, Breaker Box, Power Storage (3 marks), Load Meter.
// Also the generator ladder (Portable 2 kW up to the Titan Plant, numbers in powerparts.js) and the powered Hanging Lantern (hanglamp.js).
// The solver is in power.js, the meshes, numbers and panel in powerparts.js. This file is the wiring into the registry:
// bench rows, two upgrades, kW per type and the entity handlers (tool plan/build, cfg, E, hover text, the 0.5 s row).
// Rules (see catalog.js for the full contract): export exactly these four names, import nothing that imports upgrades.js,
// crafting.js, power.js or game.js at module level (they import catalog.js, so that would be a cycle). The V validators are only
// read inside functions: catalog.js is still evaluating when this file loads.
import { V } from './catalog.js';
import * as PP from './powerparts.js';
import * as HL from './hanglamp.js';
import { cellX, cellZ, toI, toJ, toK } from './config.js';

const { KW, PRICE } = PP;

// ---------- bench rows ----------
const USE = {
  switch: 'Set it down with B, then wire two Power Cables to it (any pole, generator, battery or machine). E toggles it. It starts open.',
  pswitch: 'Set it down with B and wire it like a switch. E opens its panel: group numbers, names, remote toggles. On an overload the highest group drops first.',
  breaker: 'Wire it into a grid with a Power Cable (or set it near a pole). It trips the grid when demand stays over the generators\' rating. E resets it.',
  meter: 'Aim at a wall or the floor and press B. Wire one Power Cable to a grid. It shows supply, demand, storage and a minute of history. M shows the same on your screen.',
  battery: 'Set it down with B and wire it into a grid (or set it near a pole). It charges from surplus power and covers a shortfall.',
  gen: 'Place it, then press E on it with plush in your hands to feed it fuel (or belt plush in, or throw plush at it). Powers machines through poles and Power Cables. Aim at it to see what it burns, how fast and how long the hopper lasts.',
  hlamp: 'Take it out and aim at a frame, then press B: it clips under the top beam on the side you face (four to a frame). Pick the Power Cable: click a generator, then the lantern, then click that lantern and the next, and so on down the line. E switches it off.',
};
const GEN_ICON = { portable: '⛽', turbine: '🌪️', plant: '🏭', grid: '🏢', titan: '☢️' };
export const prioWhy = (g) => ((g.S.stats.pwSwitches || 0) > 0 && (g.S.stats.pwBreakers || 0) > 0 ? null : 'Build a Power Switch and a Breaker Box first (once each): a Priority Switch needs both');
const placed = (g, type) => { let n = 0; for (const it of g.machines.items.values()) if (it.ent.type === type) n++; return n; };

export const RECIPES = (g) => {
  const T = g.T, out = [];
  if (!T) return out;
  if ((T.machines || []).includes('pole')) {
    out.push({ id: 'switch', kind: 'switch', icon: '🎚️', name: 'Power Switch', short: 'Switch', desc: 'Joins two grids when it is on, and splits them when it is off. It starts open. It never cuts a grid that a pole or another cable also joins. Lamp: green on, yellow off, red with fewer than two cables. Draws 0.05 kW.', price: PRICE.switch, batch: [1, 2, 5], use: USE.switch, statusFn: (gg) => `${placed(gg, 'switch')} switches placed` });
    out.push({ id: 'breaker', kind: 'breaker', icon: '🧯', name: 'Breaker Box', short: 'Breaker', desc: 'A grid with a breaker trips (supplies nothing) when demand stays above the rated output of its generators for 3 seconds. Fix the load, then press E on it. Draws 0.1 kW. Remote Reset closes it for you.', price: PRICE.breaker, batch: [1, 2, 5], use: USE.breaker, statusFn: (gg) => `${placed(gg, 'breaker')} breakers placed` });
    out.push({ id: 'meter', kind: 'meter', icon: '📟', name: 'Load Meter', short: 'Meter', desc: 'A panel for a wall or the floor. Shows supply, demand, rated output, storage and a minute of history for the grid it is wired to. Draws 0.02 kW.', price: PRICE.meter, batch: [1, 2, 5], use: USE.meter, statusFn: (gg) => `${placed(gg, 'meter')} meters placed` });
    for (let m = 1; m <= 3; m++) {
      out.push({ id: 'battery:' + m, kind: 'battery', p: { mark: m }, icon: '🔋', name: PP.BATT_NAME[m], short: 'Storage ' + m, desc: `Stores ${PP.BATT_CAP[m].toLocaleString('en-US')} kJ (${Math.round(PP.BATT_CAP[m] / 720).toLocaleString('en-US')} Commons, or ${Math.round(PP.BATT_CAP[m] / 12000).toLocaleString('en-US')} Epics, burned). Charges from surplus power at up to ${(PP.BATT_CAP[m] / PP.BATT_FILL_S).toLocaleString('en-US', { maximumFractionDigits: 0 })} kW and covers any shortfall until it is flat. Draws 0.1 kW.`, price: PRICE.battery[m], batch: [1, 2, 5], use: USE.battery, statusFn: (gg) => `${[...gg.machines.items.values()].filter((it) => it.ent.type === 'battery' && it.ent.mark === m).length} placed` });
    }
  }
  // the generator ladder: the 2 kW Portable comes with the Power Grid, the bigger rungs each have an upgrade (the ordinary 8 kW Generator is in crafting.js)
  {
    for (const k of PP.GEN_KINDS) {   // (the Portable comes with Power Grid; each bigger rung has its own upgrade, which already stands on the one below)
      if (k.key === 'std' || (k.key === 'portable' ? !(T.machines || []).includes('gen') : !PP.genUnlocked(T, k))) continue;
      const kw = PP.genKw(T, { gk: k.key }), hop = PP.genHopper(T, { gk: k.key }), sec = (r) => PP.secText(PP.BURN_S_AT_8KW[r] * 8 / kw);
      const mult = k.mul < 1 ? 'a quarter of the' : `${k.mul} times the`;
      out.push({
        id: k.id, kind: 'gen', icon: GEN_ICON[k.key], name: k.name, short: k.short, price: PP.genPrice(k, PP.genOwned(g, k)), batch: [1, 2, 5],
        desc: `${k.name}: ${mult} output of a Generator, ${PP.kwText(kw)} with your turbine upgrades, and a fuel hopper of ${hop} plush. Same plush rules as every generator (energy per plush over output): a Common lasts ${sec(0)}, an Uncommon ${sec(1)}, a Rare ${sec(2)} and an Epic ${sec(3)}. Takes ${k.ports} Power Cables.`,
        use: USE.gen,
        statusFn: (gg) => `${PP.genOwned(gg, k)} placed · ${PP.kwText(PP.genKw(gg.T, { gk: k.key }))} each, hopper ${PP.genHopper(gg.T, { gk: k.key })} plush`,
      });
    }
  }
  if ((T.machines || []).includes('pole')) {
    out.push({ id: 'hlamp', kind: 'hlamp', icon: '🏮', name: 'Hanging Lantern', short: 'Hang Lamp', price: HL.LAMP_PRICE, batch: [1, 5, 10], desc: `Clips under the top beam of a support frame and lights the plush around it for ${HL.LAMP_KW} kW. One 8 kW Generator runs ${HL.LAMP_MAX_PER_SOURCE} of them. Chain them with Power Cables: generator to the first, the first to the second and so on. A brownout dims the whole line.`, use: USE.hlamp, statusFn: (gg) => `${HL.lampsOf(gg).length} hung` });
  }
  if (T.prioPower) out.push({ id: 'pswitch', kind: 'pswitch', icon: '🔀', name: 'Priority Switch', short: 'Priority', desc: 'A switch with a group number from 1 to 8. When a grid is overloaded the closed Priority Switch with the highest group opens first (group 0, the default, goes before 8). E opens a panel to rename, regroup and toggle every one of them. Draws 0.08 kW.', price: PRICE.pswitch, batch: [1, 2, 5], use: USE.pswitch, statusFn: (gg) => prioWhy(gg) || `${[...gg.machines.items.values()].filter((it) => PP.isPrio(it.ent)).length} priority switches placed` });
  return out;
};

// ---------- upgrades (absolute costs) ----------
// the generator ladder unlocks (the Portable comes with the Power Grid). Priced for 10M+ wallets at the top: each rung also asks the one below.
const genUp = (id, name, cost, req, bit, blurb) => ({ id, cat: 'machine', name, desc: blurb, max: 1, cost: [cost], req, effect: (t) => { t.genKinds = ((t.genKinds | 0) | bit); } });
export const UPGRADES = [
  genUp('genTurbine', 'Turbine Generators', 1800000, { id: 'genOutput', lvl: 3 }, 1, 'Unlocks the Turbine Generator: 6 times the output of a Generator and a hopper twice as big, takes 3 cables. Plush burn by the same rules, 6 times faster.'),
  genUp('genPlant', 'Power Plants', 14000000, { id: 'genTurbine', lvl: 1 }, 2, 'Unlocks the Power Plant: 30 times the output of a Generator, a hopper 4 times as big, takes 4 cables. It eats a belt of plush, so feed it from a line.'),
  genUp('genStation', 'Grid Power Stations', 95000000, { id: 'genPlant', lvl: 1 }, 4, 'Unlocks the Grid Power Station: 150 times the output of a Generator, a hopper 8 times as big, takes 6 cables.'),
  genUp('genTitan', 'Titan Plants', 650000000, { id: 'genStation', lvl: 1 }, 8, 'Unlocks the Titan Plant: 800 times the output of a Generator, a hopper 16 times as big, takes 8 cables. Needs several belts of fuel.'),
  { id: 'autoReset', cat: 'machine', name: 'Remote Reset', desc: 'Breaker Boxes close themselves 20 seconds after demand is back under the rating. Shed Priority Switches close again after 10 seconds of surplus.', max: 1, cost: [900000], req: { id: 'power', lvl: 1 }, effect: (t) => { t.autoReset = true; } },
  { id: 'prioPower', cat: 'machine', name: 'Priority Power', desc: 'Unlocks the Priority Switch: a switch with a group number that drops the highest group first when a grid is overloaded. You need to have built a Power Switch and a Breaker Box once before one can be set down.', max: 1, cost: [4000000], req: { id: 'power', lvl: 1 }, effect: (t) => { t.prioPower = true; } },
];

// ---------- kW per type ----------
export const DEMAND = { switch: KW.switch, pswitch: KW.pswitch, breaker: KW.breaker, battery: KW.battery, meter: KW.meter, hlamp: HL.LAMP_KW };

// ---------- placing ----------
const KIND_TYPE = { switch: 'switch', pswitch: 'switch', breaker: 'breaker', battery: 'battery', meter: 'meter' };
const ID_KIND = (id) => (id === 'switch' || id === 'pswitch' || id === 'breaker' || id === 'meter' ? id : /^battery:[123]$/.test(String(id)) ? 'battery' : null);
const markOf = (id) => { const m = /^battery:([123])$/.exec(String(id)); return m ? +m[1] : 1; };
const snapYaw = (yaw) => Math.round((Number.isFinite(yaw) ? yaw : 0) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI;   // faces you
const fin = (...v) => v.every((x) => Number.isFinite(x));

function spotWhy(g, e) {
  if (!fin(e.x, e.y, e.z)) return 'Aim at a spot';
  for (const it of g.machines.items.values()) {
    const o = it.ent; if (!PP.isPart(o.type)) continue;
    if (Math.hypot(o.x - e.x, o.z - e.z) < 0.55 && Math.abs(o.y - e.y) < 1.0) return 'Something is already set here';
  }
  if (e.mount !== 'wall' && g.logi) { const why = g.logi.cellTaken(toI(e.x), toJ(e.y + 0.05), toK(e.z)); if (why) return 'Something is in the way (a belt, a rail piece or a shaft)'; }   // a floor part never stands in a cell something else holds
  return null;
}

function plan(g, tool, eye, dir, yaw) {
  const kind = tool.kind;
  if (kind === 'pswitch') { const w = prioWhy(g); if (w) return { plan: { ok: false, why: w }, cost: 0 }; }
  let ent = null;
  if (kind === 'meter') {
    const r = g.machines.rayEmpty(eye, dir, 5);
    if (r && r.hitSolid) {
      const { last: a, hitSolid: h } = r, di = h.i - a.i, dk = h.k - a.k;
      if (h.j === a.j && Math.abs(di) + Math.abs(dk) === 1) {
        const C = 0.6;   // the cell size
        ent = { x: cellX(a.i) + di * (C / 2 - 0.03), y: (a.j + 0.5) * C - 0.23, z: cellZ(a.k) + dk * (C / 2 - 0.03), ry: Math.atan2(-di, -dk), mount: 'wall' };
      }
    }
  }
  if (!ent) {
    const r = g.machines.planSimple(kind, eye, dir);
    if (!r.ok) return { plan: { ok: false, why: r.why }, cost: 0 };
    ent = { x: r.ent.x, y: r.ent.y, z: r.ent.z, ry: snapYaw(yaw) };
    if (kind === 'meter') ent.mount = 'floor';
  }
  const why = spotWhy(g, ent);
  return { plan: { ok: !why, why, ent }, cost: 0 };
}

function preview(g, tool, pl) {
  const m = g.machines, e = pl && pl.ent;
  if (!e || !fin(e.x, e.y, e.z)) { m.showPreview(null, null); return; }
  const type = KIND_TYPE[tool.kind], key = `pw${tool.id}${pl.ok}${e.mount || ''}`;
  if (m.ghostKey !== key || !m.ghost) m.setGhost(PP.ghostPart({ type, x: e.x, y: e.y, z: e.z, ry: e.ry, mark: markOf(tool.id), mount: e.mount, prio: tool.kind === 'pswitch' ? 0 : undefined }, pl.ok), key);
  m.ghost.position.set(e.x, e.y, e.z); m.ghost.rotation.y = e.ry || 0;
}

function conflict(g, e, tool) {
  if (!tool || !e || typeof e !== 'object') return 'Nothing to place';
  if (ID_KIND(tool.id) !== tool.kind) return 'That is not the item you hold';
  if (!fin(e.x, e.y, e.z) || Math.abs(e.x) > 6000 || Math.abs(e.z) > 6000 || e.y < -1 || e.y > 45) return 'Aim at a spot';
  if (tool.kind === 'pswitch') { const w = prioWhy(g); if (w) return w; }
  return spotWhy(g, e);
}

function build(g, tool, e) {
  const base = { x: e.x, y: e.y, z: e.z, ry: Number.isFinite(e.ry) ? e.ry : 0 }, S = g.S;
  switch (tool.kind) {
    case 'switch': S.stats.pwSwitches = (S.stats.pwSwitches || 0) + 1; return { type: 'switch', ...base, on: false, shed: false };
    case 'pswitch': return { type: 'switch', ...base, on: false, shed: false, prio: 0 };
    case 'breaker': S.stats.pwBreakers = (S.stats.pwBreakers || 0) + 1; return { type: 'breaker', ...base, armed: true, tripped: false, trip: { ...PP.TRIP_DEFAULT } };
    case 'battery': S.stats.pwBatteries = (S.stats.pwBatteries || 0) + 1; return { type: 'battery', ...base, mark: markOf(tool.id), charge: 0 };
    case 'meter': return { type: 'meter', ...base, mount: e.mount === 'wall' ? 'wall' : 'floor' };
    default: return null;
  }
}

// ---------- hover text ----------
const f1 = (v) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : (+v).toFixed(1));
const lampLine = (color, text) => `Lamp ${color}: ${text}`;
function netFor(g, e) { return PP.netOfEnt(g, e); }


function infoSwitch(g, e) {
  const prio = PP.isPrio(e), net = netFor(g, e), lamp = PP.lampOf(g, e), wires = g.cables ? g.cables.of(e.id).length : 0;
  const state = e.shed ? 'SHED' : e.on ? 'CLOSED' : 'OPEN';
  const lines = [];
  if (e.name) lines.push(`"${e.name}"`);
  if (prio) lines.push(`Priority group ${e.prio === 0 ? '0 (not set: it drops first)' : e.prio}. On an overload the highest group drops first.`);
  lines.push(e.shed ? 'It shed this load because its grid was overloaded. It stays open until it is reset.' : e.on ? 'On: the two grids it joins run as one.' : 'Off: the two grids it joins stay apart (unless a pole or another cable also joins them).');
  lines.push(lampLine(lamp, wires < 2 ? `only ${wires} of 2 cables wired` : e.shed ? 'shed by an overload' : e.on ? 'closed' : 'open'));
  if (net) lines.push(PP.summaryLine(net));
  lines.push(prio ? (e.shed ? 'E resets it once supply covers demand. ' : 'E opens the panel with every Priority Switch.') : 'E switches it on or off.');
  return { title: `${prio ? 'PRIORITY SWITCH' : 'POWER SWITCH'} · ${state}`, lit: e.on && !e.shed, lines };
}

function infoBreaker(g, e) {
  const net = netFor(g, e), c = e.cache || {}, tr = e.trip || PP.TRIP_DEFAULT;
  const lines = [];
  if (e.name) lines.push(`"${e.name}"`);
  if (net) lines.push(`Grid wants ${f1(net.demand)} kW of ${f1(net.cap)} kW rated${net.batMax > 0 ? `, storage ${Math.round(net.bat / net.batMax * 100)}%` : ''}`);
  lines.push(e.armed === false ? 'Disarmed: it never trips.' : `Trips the grid when demand stays over ${f1(tr.at * (net ? net.cap : 0))} kW (${tr.at} x rated) for ${tr.delay} s.`);
  if (e.tripped) lines.push('GRID TRIPPED: the whole grid is dead. Fix the demand, then press E on a breaker.');
  else if (c.over > 0) lines.push('Over the rating: counting down to a trip.');
  lines.push(lampLine(PP.lampOf(g, e), e.tripped ? 'tripped' : e.armed === false ? 'disarmed' : c.over > 0 ? 'overloaded' : 'armed'));
  return { title: `BREAKER BOX · ${e.tripped ? 'TRIPPED' : e.armed === false ? 'DISARMED' : 'ARMED'}`, lit: !e.tripped, lines };
}

function infoBattery(g, e) {
  const cap = PP.battCap(e), ch = e.charge || 0, flow = (e.cache && e.cache.flow) || 0, net = netFor(g, e);
  const mode = flow > 0.001 ? `CHARGING ${f1(flow)} kW` : flow < -0.001 ? `DISCHARGING ${f1(-flow)} kW` : 'IDLE';
  const lines = [];
  if (e.name) lines.push(`"${e.name}"`);
  lines.push(`Charge ${Math.round(ch).toLocaleString('en-US')} of ${cap.toLocaleString('en-US')} kJ (${Math.round(ch / cap * 100)}%)`);
  if (flow < -0.001) lines.push(`About ${PP.kJtext(ch)} left: ${Math.round(ch / -flow)} s at this load`);
  else if (flow > 0.001) lines.push(`Full in about ${Math.round((cap - ch) / flow)} s at this rate`);
  lines.push(`Charges at up to ${f1(PP.battRate(e))} kW from surplus power, discharges as much as the grid is short`);
  if (net) lines.push(PP.summaryLine(net));
  return { title: `${PP.partName(e).toUpperCase()} · ${mode}`, lit: ch > 0, lines };
}

function infoMeter(g, e) {
  const net = netFor(g, e), lines = [];
  if (e.name) lines.push(`"${e.name}"`);
  if (!net) { lines.push('Not wired to a grid yet: run a Power Cable from a pole, generator or battery.'); return { title: 'LOAD METER · NO GRID', lit: false, lines }; }
  lines.push(`Supply ${f1(net.supply)} kW · demand ${f1(net.demand)} kW · rated ${f1(net.cap)} kW`);
  { const ll = PP.loadsLine(net); if (ll) lines.push(ll); }   // doors, lifts, pads, stations, lights ... listed by kind
  lines.push(net.batMax > 0 ? `Storage ${Math.round(net.bat / net.batMax * 100)}% (${net.flow > 0.001 ? 'charging' : net.flow < -0.001 ? 'discharging' : 'idle'})` : 'No storage on this grid');
  if (net.tripped) lines.push('GRID TRIPPED');
  const h = net.hist;
  if (h && h.len > 2) {
    const pick = (a) => { const out = []; for (let i = 0; i < a.length; i += 4) out.push(a[i]); return out.slice(-30); };
    const hi = Math.max(net.cap, ...h.series('s'), ...h.series('d'), 1e-9);
    lines.push(`Supply  ${PP.sparkline(pick(h.series('s')), hi)}`);
    lines.push(`Demand ${PP.sparkline(pick(h.series('d')), hi)}`);
  }
  return { title: `LOAD METER · ${net.tripped ? 'TRIPPED' : net.sat < 0.99 ? 'BROWNOUT' : 'OK'}`, lit: !net.tripped, lines };
}

// the same one-line grid summary on poles and generators that sit in a grid with storage or a breaker
function nodeSummary(g, e) {
  const net = g.power.nets.find((n) => n.nodes.includes(e));
  return net && (net.batts.length || net.breakers.length) ? [PP.summaryLine(net)] : [];
}

// ---------- the entity handlers ----------
const common = () => ({
  add: (m, ent) => { PP.normalize(ent); return { obj: PP.buildPart(ent) }; },
  item: (e) => PP.itemOfPart(e),
});

export const TYPES = {
  switch: {
    ...common(),
    kinds: ['pswitch'],
    group: 'switch',
    copy: ['prio'],
    cfg: (e) => (e.prio !== undefined ? { on: V.bool, shed: V.bool, prio: V.int(0, PP.PRIO_MAX), name: V.str(24) } : { on: V.bool, name: V.str(24) }),
    check: (g, e, c) => {
      if (c.shed === true) return 'Only an overloaded grid sheds a switch';
      if (c.shed === false && e.shed && !g.power.canClose(e)) return 'The grid is still overloaded: supply must cover demand before this closes again';
      return null;
    },
    onCfg: (g, e, c) => { if (c.on !== undefined && c.shed === undefined && e.shed) e.shed = false; },   // touching the switch by hand takes it back from the overload logic
    plan, preview, build, conflict,
    use: (g, e) => {
      if (PP.isPrio(e)) {
        if (e.shed) { const r = g.setCfg(e, { shed: false }); if (r.ok) { g.sound.place(); g.ui.hint('Reset requested.', 2); } else { g.sound.error(); g.ui.hint(r.why || 'Could not reset', 3); } return true; }
        PP.openPanel(g, e.id); return true;
      }
      const r = g.setCfg(e, { on: !e.on });
      if (r.ok) { g.sound.tone('square', e.on ? 300 : 520, e.on ? 520 : 300, 0.06, 0.07); g.ui.hint(`Power Switch ${e.on ? 'closed' : 'open'}.`, 1.5); } else g.ui.hint(r.why || 'Could not toggle', 2.5);
      return true;
    },
    info: (g, e) => infoSwitch(g, e),
    // the one handler that carries the grid row and the per frame look of every power part
    tick: (g, dt) => { PP.updateLooks(g, dt); PP.hudTick(g, dt); },
    guestTick: (g, dt) => { PP.updateLooks(g, dt); PP.hudTick(g, dt); },
    row: (g) => g.power.packRow(),
    guestRow: (g, d) => g.power.applyRow(d),
  },
  breaker: {
    ...common(),
    group: 'breaker',
    copy: ['trip', 'armed'],
    cfg: () => ({ armed: V.bool, tripped: V.bool, trip: V.obj({ at: V.num(0.5, 2), delay: V.num(0.5, 30) }), name: V.str(24) }),
    check: (g, e, c) => {
      if (c.tripped === true) return 'Only an overload trips a breaker';
      if (c.trip) { c.trip = { at: c.trip.at ?? e.trip.at, delay: c.trip.delay ?? e.trip.delay }; }
      return null;
    },
    onCfg: (g, e, c, old) => {
      if (c.armed === false) { e.tripped = false; }
      if (c.tripped === false || (c.armed === false && old.tripped)) { const n = g.power.netOfEnt(e); if (n) g.power.resetBreakers(n); else { e.tripped = false; } }
      if (c.trip) { const k = PP.cacheOf(e); k.over = 0; }
    },
    plan, preview, build, conflict,
    use: (g, e) => {
      if (e.tripped) { const r = g.setCfg(e, { tripped: false }); if (r.ok) { g.sound.tone('square', 160, 400, 0.12, 0.12); g.ui.hint('Breaker reset. It trips again after one second if the grid is still over its rating.', 3.5); } else g.ui.hint(r.why || 'Could not reset', 3); return true; }
      g.ui.hint(e.armed === false ? 'This breaker is disarmed.' : 'The breaker is closed. It trips this grid if demand stays over the rating.', 2.5);
      return true;
    },
    info: (g, e) => infoBreaker(g, e),
  },
  battery: {
    ...common(),
    group: 'battery',
    copy: [],
    cfg: () => ({ name: V.str(24) }),
    plan, preview, build, conflict,
    info: (g, e) => infoBattery(g, e),
  },
  meter: {
    ...common(),
    group: 'meter',
    copy: [],
    cfg: () => ({ name: V.str(24) }),
    plan, preview, build, conflict,
    info: (g, e) => infoMeter(g, e),
  },
  pole: { infoExtra: (g, e) => nodeSummary(g, e) },
  gen: {
    infoExtra: (g, e) => nodeSummary(g, e), item: (e) => PP.genItemOf(e),   // (the mode line is part of genInfo in game.js, after the burn lines)
    // 'auto' burns whenever it has fuel, 'reserve' keeps the fuel until a battery of its grid is under 30% or the grid is overloaded (power.js holdsFuel). Empty hands + E switches it.
    cfg: () => ({ mode: V.enum(['auto', 'reserve']) }), copy: ['mode'], group: 'gen',
  },
  // the powered Hanging Lantern: a machine that hangs under a frame's top beam (hanglamp.js)
  hlamp: {
    add: (m, ent) => ({ obj: HL.buildLamp(ent) }),
    item: () => 'hlamp',
    group: 'hlamp',
    cfg: () => ({ on: V.bool }),
    copy: ['on'],
    plan: (g, tool, eye, dir, yaw) => HL.plan(g, eye, dir, yaw),
    preview: (g, tool, pl) => {
      const m = g.machines, e = pl && pl.ent;
      if (!e || !fin(e.x, e.y, e.z)) { m.showPreview(null, null); return; }
      const key = `hl${pl.ok}`;
      if (m.ghostKey !== key || !m.ghost) m.setGhost(HL.ghostLamp(e, pl.ok), key);
      m.ghost.position.set(e.x, HL.lampCenterY(e), e.z);
    },
    conflict: (g, e, tool) => (tool && tool.id !== 'hlamp' ? 'That is not the item you hold' : HL.conflict(g, e)),
    build: (g, tool, e) => HL.build(g, e),
    use: (g, e) => {
      const r = g.setCfg(e, { on: e.on === false });
      if (r.ok) { g.sound.tone('square', e.on === false ? 520 : 300, e.on === false ? 300 : 520, 0.06, 0.07); g.ui.hint(`Hanging Lantern ${e.on === false ? 'off' : 'on'}.`, 1.5); } else g.ui.hint(r.why || 'Could not switch it', 2.5);
      return true;
    },
    info: (g, e) => HL.info(g, e),
    tick: (g, dt) => HL.tick(g, dt, false),
    guestTick: (g, dt) => HL.tick(g, dt, true),
    row: (g) => HL.packRow(g),
    guestRow: (g, d) => HL.applyRow(g, d),
  },
};
