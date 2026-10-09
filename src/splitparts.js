// Belt mergers and ruled splitters (Satisfactory spec 4.2, wave 2B): the four items (Merger, Priority Merger, Smart Splitter, Programmable Splitter),
// how they are set down or converted from a belt, their settings (the `cfg` whitelist), and their readouts. The rules and the picks are in splitrules.js,
// the meshes in splitmesh.js, the simulation in logistics.js (handOff, accept, mergeLane), the panel in splitpanel.js. catalog_belts.js wires this into TYPES.
// Like beltparts.js this imports nothing that imports the catalog (no game.js, upgrades.js, crafting.js, power.js, machines.js, ext.js): `g` carries everything live.
import * as THREE from 'three';
import { C, cellX, cellZ } from './config.js';
import { TIER_NAMES, PART_PRICE, PART_KW, K, tierOf, rateOf, partOf, lenOf } from './beltdata.js';
import { DX, DZ, dirOfYaw } from './beltparts.js';
import * as SR from './splitrules.js';
import { NEEDLE } from './plushdata.js';

const isInt = Number.isInteger;
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export const PARTS = {
  merger: { name: 'Belt Merger', short: 'Merger', icon: '🔗' },
  pmerger: { name: 'Priority Merger', short: 'Priority', icon: '🥇' },
  ssplit: { name: 'Smart Splitter', short: 'Smart', icon: '🧠' },
  psplit: { name: 'Programmable Splitter', short: 'Program', icon: '🎛️' },
};
export const PART_IDS = Object.keys(PARTS);

// which upgrade each part comes with (one each, the bench test model). The upgrades themselves are chained (Priority Mergers need Belt Mergers, Programmable
// Splitters need Smart Splitters and Rarity Optics 3), so a tier cannot be bought out of order.
export function unlocked(T, id) {
  if (id === 'merger') return !!T.mergeOn;
  if (id === 'pmerger') return !!T.pmergeOn;
  if (id === 'ssplit') return !!T.smartOn;
  if (id === 'psplit') return !!T.progOn;
  return false;
}
const lockText = { merger: 'Belt Mergers are not unlocked yet', pmerger: 'Priority Mergers are not unlocked yet', ssplit: 'Smart Splitters are not unlocked yet', psplit: 'Programmable Splitters are not unlocked yet' };

// ---------------------------------------------------------------- what a belt may become
const plainBelt = (t) => t.type === 'belt' && !t.lift && !t.ug && !t.hose && !t.rise && !t.detector && !t.splitter && !t.merger && !t.smart;
// null when the tile t can be turned into part `id`, else why not
export function convertProblem(t, id) {
  if (!t || t.type !== 'belt') return 'That belt is gone';
  if (t.lift || t.ug || t.hose || t.rise || t.detector) return `A ${PARTS[id].short.toLowerCase()} goes on a flat belt tile, not on a lift, ramp, hose, underground end or gate`;
  const have = partOf(t);
  if (id === 'merger') return plainBelt(t) ? null : have === 'merger' ? 'It is already a merger' : 'Take that piece down first: a merger replaces a plain belt';
  if (id === 'pmerger') return plainBelt(t) || have === 'merger' ? null : have === 'pmerger' ? 'It is already a Priority Merger' : 'Take that piece down first';
  if (id === 'ssplit') return plainBelt(t) || have === 'splitter' ? null : have === 'ssplit' ? 'It is already a Smart Splitter' : 'Take that piece down first';
  if (id === 'psplit') return plainBelt(t) || have === 'splitter' || have === 'ssplit' ? null : have === 'psplit' ? 'It is already a Programmable Splitter' : 'Take that piece down first';
  return 'Not a belt part';
}
// the item a conversion hands back (the piece it replaces), or null
const refundOf = (t) => { const p = partOf(t); return p && p !== 'splitter' ? p : p === 'splitter' ? 'splitter' : null; };

// the fields a new tile of part `id` gets; `old` is the tile it replaces (its mark, its plush and its rules carry over), or null on bare floor
export function fieldsOf(id, base, old) {
  const f = { type: 'belt', i: base.i, j: base.j, k: base.k, dir: base.dir, rise: 0, items: old && old.items ? old.items : [] };
  if (old && tierOf(old) > 0) f.tier = tierOf(old);
  if (id === 'merger') { f.merger = true; f.mrr = 0; }
  else if (id === 'pmerger') { f.merger = 'prio'; f.mrr = 0; f.lanes = old && SR.isPerm(old.lanes) ? old.lanes.slice() : [0, 1, 2]; }
  else {
    f.splitter = true; f.smart = id === 'psplit' ? 2 : 1; f.rr = old && old.rr ? old.rr : 0;
    const keep = old && old.smart && SR.cleanRules(old.rules, f.smart);
    f.rules = keep ? JSON.parse(JSON.stringify(old.rules)) : SR.defaultRules();
    f.mode = keep && old.mode === 'prio' ? 'prio' : 'rr'; f.prio = keep && SR.isPerm(old.prio) ? old.prio.slice() : [0, 1, 2];
    f.def = id === 'psplit' ? (keep && isInt(old.def) ? old.def : -1) : -1;
  }
  return f;
}

// ---------------------------------------------------------------- aim, preview, set down
const inside = (g, c) => c && isInt(c.i) && isInt(c.j) && isInt(c.k) && isInt(c.dir) && c.dir >= 0 && c.dir <= 3 && g.world.inside(c.i, c.j, c.k);

// the problem with putting part `id` at e (a floor cell or an existing belt), or null. held = how many of it the player has
export function problem(g, id, e) {
  if (!PARTS[id]) return 'Not a belt part';
  if (!unlocked(g.T, id)) return lockText[id];
  if (!e || typeof e !== 'object') return 'Bad placement';
  if (e.type === 'convertbelt') {
    const t = isInt(e.id) ? g.logi.byId.get(e.id) : null;
    return convertProblem(t, id);
  }
  if (e.type !== 'belt' || !inside(g, e)) return 'Aim at the floor or at a belt';
  const why = g.logi.canPlace(e.i, e.j, e.k);
  return why && why !== 'Too close' ? why : null;
}

export function plan(g, tool, eye, dir, yaw) {
  const id = tool.id, spec = PARTS[id], price = PART_PRICE[id] * K;
  if (!spec || tool.kind !== id) return { plan: { ok: false, why: 'Not a belt part' }, cost: 0 };
  const L = g.logi, a = L.aimCell(eye, dir);
  const t = (a && L.tileAt(a.i, a.j, a.k)) || L.pick(eye, dir, 4.5);
  let ent, why = null;
  if (t && t.type === 'belt') { ent = { type: 'convertbelt', id: t.id, i: t.i, j: t.j, k: t.k, dir: t.dir, rise: 0 }; why = convertProblem(t, id); if (!why && !unlocked(g.T, id)) why = lockText[id]; }
  else if (a) { ent = { type: 'belt', i: a.i, j: a.j, k: a.k, dir: dirOfYaw(yaw), rise: 0 }; why = problem(g, id, ent); }
  else return { plan: { ok: false, why: 'Aim at the floor or at a belt' }, cost: price };
  let hintText = null;
  if (!why) {
    const over = ent.type === 'convertbelt' ? L.byId.get(ent.id) : null, mk = over ? TIER_NAMES[tierOf(over)] : 'Mk1';
    const what = id === 'merger' ? 'merges up to three lines, one plush from each waiting lane in turn' : id === 'pmerger' ? 'merges three lines, the best lane first (E sets the order)' : id === 'ssplit' ? 'sends each plush to the output whose rule takes it (E sets the rules)' : 'up to eight rules on each output and a default output (E sets them)';
    hintText = `<kbd>B</kbd> ${over ? 'turn this belt into' : 'set down'} ${spec.name.toLowerCase()}: ${what}. ${mk} speed${over ? ' (the belt keeps its mark)' : ' (set a higher mark belt over it to speed it up)'}, ${PART_KW[id]} kW${refundOf(over || {}) ? `. The ${refundOf(over)} comes back to you` : ''}`;
  }
  return { plan: { ok: !why, why, ent, hintText }, cost: price };
}

export function preview(g, tool, p) {
  const e = p && p.ent; if (!e) { g.machines.setGhost(null); return; }
  const id = tool.id, key = `part${id}${p.ok}${e.dir}`;
  if (g.machines.ghostKey !== key) {
    const grp = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: p.ok ? 0x5dffa0 : 0xff5a4a, transparent: true, opacity: 0.4, depthWrite: false });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.58), mat); box.position.y = 0.08; grp.add(box);
    // arrows: a merger shows its three ways in and one way out, a splitter one way in and three ways out
    const cone = (x, z, yaw) => { const piv = new THREE.Group(); piv.position.set(x, 0.2, z); piv.rotation.y = yaw; const c = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.17, 4), mat); c.rotation.x = Math.PI / 2; piv.add(c); grp.add(piv); };
    if (id === 'merger' || id === 'pmerger') { cone(0, -0.2, 0); cone(0.2, 0, -Math.PI / 2); cone(-0.2, 0, Math.PI / 2); cone(0, 0.2, 0); }
    else { cone(0, -0.2, 0); cone(0, 0.2, 0); cone(-0.2, 0, -Math.PI / 2); cone(0.2, 0, Math.PI / 2); }
    grp.rotation.y = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][e.dir || 0];
    g.machines.setGhost(grp, key);
  }
  if (g.machines.ghost) g.machines.ghost.position.set(cellX(e.i), e.j * C, cellZ(e.k));
}

// host: the new tile's fields. A belt it converts is taken down here (its plush ride on, what it replaces comes back). null = refuse, the item goes back.
export function build(g, tool, e) {
  const id = tool && tool.id; if (!tool || tool.kind !== id || problem(g, id, e)) return null;
  if (e.type === 'convertbelt') {
    const old = g.logi.byId.get(e.id);
    const f = fieldsOf(id, old, old), back = refundOf(old);
    g.logi.remove(old);
    g.S.entities = g.S.entities.filter((x) => x.id !== old.id);
    g.netSend({ t: 'ent-', id: old.id });
    f.rewire = old.id;   // its power cables move to the new tile (ext.js buildTool calls cables.rewire after the tile exists)
    if (back && back !== id) g.giveItem(back);
    return f;
  }
  return fieldsOf(id, e, null);
}

// host re-check of a guest's `place`
export function conflict(g, e, tool) {
  if (!tool || !PARTS[tool.id] || tool.kind !== tool.id) return 'That is not a belt part';
  if (!e || typeof e !== 'object' || (e.type !== 'convertbelt' && e.type !== 'belt')) return 'Bad placement';
  if (e.type === 'convertbelt' && !isInt(e.id)) return 'Bad placement';
  if (e.type === 'belt' && !(isInt(e.i) && isInt(e.j) && isInt(e.k) && isInt(e.dir) && e.dir >= 0 && e.dir <= 3)) return 'Bad placement';
  return problem(g, tool.id, e);
}

// ---------------------------------------------------------------- settings: the cfg whitelist and its check
// a splitter's rules, order and default; a Priority Merger's lane order. A plain merger and a plain splitter have none (cfg returns null: nothing to copy).
// Each kind lists only its own keys, so a paste from another kind finds nothing to take ("Nothing to paste") and never reaches the host.
export function cfgOf(t, V) {
  if (t.smart) {
    const rule = V.obj({ k: V.enum(SR.KINDS), v: V.int(0, NEEDLE), w: V.int(0, 6) });
    return { rules: V.arr(3, V.arr(t.smart === 2 ? 8 : 1, rule)), mode: V.enum(['rr', 'prio']), prio: V.arr(3, V.int(0, 2)), def: V.int(-1, 2) };
  }
  if (t.merger === 'prio') return { lanes: V.arr(3, V.int(0, 2)) };
  return null;
}

// check(g, t, clean): refuses what does not fit this kind of piece, and replaces the rules with their clean form
export function check(g, t, c) {
  const rulesKeys = ['rules', 'mode', 'prio', 'def'];
  if (t.merger) {
    if (rulesKeys.some((k) => c[k] !== undefined)) return 'A merger has no output rules: those settings belong to a splitter';
    if (c.lanes !== undefined && !SR.isPerm(c.lanes)) return 'The lane order must list Back, Left and Right once each';
    return null;
  }
  if (!t.smart) return 'This has no settings';
  if (c.lanes !== undefined) return 'A splitter has no input lanes: those settings belong to a Priority Merger';
  if (c.rules !== undefined) {
    const r = SR.cleanRules(c.rules, t.smart);
    if (!r) return t.smart === 1 ? 'A Smart Splitter takes exactly one rule on each output (a Programmable Splitter takes up to eight)' : 'Each output takes up to eight valid rules';
    c.rules = r;
  }
  if (c.prio !== undefined && !SR.isPerm(c.prio)) return 'The output order must list Forward, Right and Left once each';
  if (c.def !== undefined && c.def !== -1 && t.smart !== 2) return 'Only a Programmable Splitter has a default output (a Smart Splitter uses the Anything else rule)';
  return null;
}

// after a patch landed on the host: redraw the cones
export function onCfg(g, t) { if (t.smart) g.logi.buildSplitter(t); else if (t.merger) g.logi.buildMerger(t); }

// ---------------------------------------------------------------- readouts
const NB = { belt: 'a belt', sorter: 'a sorting box', vault: 'a vault', gen: 'a generator', charger: 'a charging station', mech: 'a mech', pole: 'a pole', fan: 'a fan' };
const nbName = (n) => { if (!n) return 'nothing built there'; if (n.type !== 'belt') return NB[n.type] || n.type; return n.merger ? 'a merger' : n.smart ? 'a ruled splitter' : n.splitter ? 'a splitter' : n.lift ? 'a lift' : n.ug ? 'an underground end' : 'a belt'; };

// one line per output of a splitter: the rules and what stands there
export function outputLines(g, t) {
  const outs = g.logi.splitOuts(t), rules = Array.isArray(t.rules) ? t.rules : SR.defaultRules(), lines = [];
  for (let s = 0; s < 3; s++) {
    const o = outs.find((x) => x.slot === s), list = rules[s] || [];
    const txt = list.length ? list.map(SR.ruleName).join(' + ') : 'nothing (off)';
    lines.push(`${SR.SLOT_NAMES[s]}: ${txt}${t.def === s ? ' + default' : ''} → ${nbName(o && o.tile)}`);
  }
  return lines;
}

export function laneLines(g, t) {
  const feeds = g.logi.feedMap.get(t.id) || [], n = [0, 0, 0], waiting = [0, 0, 0];
  for (const f of feeds) { const s = SR.laneOf(t.dir, f.dir); if (s < 0) continue; n[s]++; if (f.items[0] && f.items[0].t >= lenOf(f) - 1e-3) waiting[s]++; }
  return SR.LANE_NAMES.map((nm, s) => `${nm}: ${n[s] ? `${n[s]} line${n[s] > 1 ? 's' : ''}${waiting[s] ? ', plush waiting' : ''}` : 'nothing feeds it'}`);
}

export function info(g, t) {
  const part = partOf(t), spec = PARTS[part]; if (!spec) return null;
  const tier = tierOf(t), on = (t.pw ?? 0) > 0.05, rate = rateOf(g.T, tier);
  const lines = [`Carrying ${t.items.length} plush`, `${TIER_NAMES[tier]} tile: up to ${fmt(rate)} plush per min through it`];
  if (t.merger) {
    lines.push(...laneLines(g, t));
    if (!on) lines.push('Unpowered: the lanes push in as they arrive and the busiest wins. Power gives it its turns.');
    else if (t.merger === 'prio') { const order = (SR.isPerm(t.lanes) ? t.lanes : [0, 1, 2]).map((s, q) => `${q + 1} ${SR.LANE_NAMES[s]}`).join(', '); lines.push(`Priority: ${order}. A lane only gets the gaps the better ones leave.`); }
    else lines.push(`Takes one plush from each waiting lane in turn (next: ${SR.LANE_NAMES[t.mrr | 0]}), so no lane starves.`);
    lines.push(`Draws ${PART_KW[part]} kW. ${t.merger === 'prio' ? 'E sets the order. Shift+E copies it.' : 'It has nothing to set: build the lines into its back and its sides.'}`);
  } else {
    lines.push(...outputLines(g, t));
    lines.push(t.mode === 'prio' ? `Order: ${(SR.isPerm(t.prio) ? t.prio : [0, 1, 2]).map((s, q) => `${q + 1} ${SR.SLOT_NAMES[s]}`).join(', ')}, the next only when the better ones are full` : 'Order: round robin between the outputs that take a plush');
    lines.push(on ? `Draws ${PART_KW[part]} kW. E opens the rules, Shift+E copies them.` : 'Unpowered: it deals out forward, right and left in turn and ignores its rules until a Power Cable from a live pole or generator reaches it.');
  }
  return { title: `${spec.name.toUpperCase()}${tier ? ' ' + TIER_NAMES[tier].toUpperCase() : ''}`, lit: on, lines };
}

void DX; void DZ;
