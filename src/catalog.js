// The catalog registry (Satisfactory spec, Wave 0). One place where every new area (belts, power, build shell, furnish, transit,
// haul and arches, detector) plugs into upgrades, crafting, power demand and the entity types, so no two waves edit the same shared file.
//
// Each catalog_<area>.js exports { UPGRADES, RECIPES, DEMAND, TYPES }:
//   UPGRADES  array of upgrade entries, merged once at the end of upgrades.js. Costs are ABSOLUTE (the COST_SCALE multiplier is not applied).
//   RECIPES   (g) => bench rows { id, kind, icon, name, short, desc, price, batch, p?, use?, statusFn? }, merged into crafting recipes(g).
//             price is multiplied by K=3 like every non frame item. `p` is a free parameter bag handed to the tool (tool.p). statusFn(g, r) => string.
//   DEMAND    { entType: kW }, merged into power.js DEMAND (a key that already exists there is never overridden).
//   TYPES     { key: handlers }, see below. The key is the entity type; a handler set may also list extra tool kinds in `kinds`.
//
// Handlers (all optional). g is the game. Keys under "tool" run for the recipe kind (tool.kind), the rest for ent.type.
//   cfg        { key: validator } or (ent) => { key: validator }. The whitelist for the `cfg` command and copy/paste. Build validators with V.
//   copy       keys that copy/paste carries (default: every cfg key). group: string, types with the same group paste into each other.
//   check(g, ent, clean, actor) => reason | null      refuse a validated patch (unlocked tier, port limit ...). actor is 'host' or 'guest'.
//   onCfg(g, ent, clean, old)                        after the patch was applied on the host (rebuild a mesh, markDirty ...).
//   item(ent) => item id handed back by the hammer (default: ent.type).   onRemove(g, ent) after the hammer took it down (host).
//   info(g, ent, ref) => { title, lit, lines } | null   replaces the aim readout (null falls back to the built in one).
//   infoExtra(g, ent) => [lines]                     extra lines put in front of the built in readout.
//   use(g, ent) => true                              E on it (host or guest; a guest must send a `cfg` or its own cmd).
//   add(machines, ent) => { obj, ... }               machines.js hook for types that live in game.machines.items (not belt like tiles).
//   tool: plan(g, tool, eye, dir, yaw) => { plan: { ok, why, ent }, cost }   aim step while the tool is in hand.
//   tool: preview(g, tool, plan)                     draw the ghost (default: the generic cell ghost when plan.ent has i, j, k).
//   tool: build(g, tool, planEnt) => fields          the fields of the new ent (must contain `type`); the id is added by placeEntity.
//   tool: conflict(g, planEnt, tool) => reason | null  host re-check of a guest's placement.
//   tick(g, dt)                                      host, once per frame per type (not per ent). guestTick(g, dt) on a guest.
//   row(g) => payload | null                         host, every 0.5 s while a guest is connected, sent as { t:'xrow', k:type, d:payload }.
//   guestRow(g, d)                                   the guest applies it.
//
// Cycle rule: upgrades.js, crafting.js and power.js import this file, so catalog_*.js must not import them (or game.js) at module level.

import * as belts from './catalog_belts.js';
import * as power from './catalog_power.js';
import * as build from './catalog_build.js';
import * as furnish from './catalog_furnish.js';
import * as transit from './catalog_transit.js';
import * as haul from './catalog_haul.js';
import * as detector from './catalog_detector.js';

export const PARTS = { belts, power, build, furnish, transit, haul, detector };
// test and dev only: extra part-like objects { UPGRADES, RECIPES, DEMAND, TYPES } read by catalogRecipes (the static merges above run once at load)
export const EXTRA = {};

// ---------- validators for the cfg whitelist: each returns the clean value, or REJECT ----------
export const REJECT = Symbol('reject');
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const V = {
  bool: (v) => (typeof v === 'boolean' ? v : REJECT),
  int: (lo, hi) => (v) => (Number.isInteger(v) && v >= lo && v <= hi ? v : REJECT),
  num: (lo, hi) => (v) => (isNum(v) && v >= lo && v <= hi ? v : REJECT),
  // text only: control characters and angle brackets are dropped, so a name can never carry markup
  str: (max) => (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max) : REJECT),
  enum: (list) => (v) => (list.includes(v) ? v : REJECT),
  arr: (max, item) => (v) => { if (!Array.isArray(v) || v.length > max) return REJECT; const o = []; for (const x of v) { const c = item(x); if (c === REJECT) return REJECT; o.push(c); } return o; },
  obj: (shape) => (v) => { if (!v || typeof v !== 'object' || Array.isArray(v)) return REJECT; const o = {}; for (const k of Object.keys(v)) { if (!Object.prototype.hasOwnProperty.call(shape, k)) return REJECT; const c = shape[k](v[k]); if (c === REJECT) return REJECT; o[k] = c; } return o; },
};

// ---------- types that already exist and want copy/paste or cfg ----------
const CORE_TYPES = {
  // Sorting Box: the mode is what E cycles; the filter follows it exactly as useTile derives it.
  sorter: {
    cfg: { mode: V.int(0, 5) },
    check: (g, t, c) => (c.mode !== undefined && c.mode >= 1 + g.T.sorterTiers + 1 ? 'That sorter setting is not unlocked yet' : null),
    onCfg: (g, t) => { const modes = 1 + g.T.sorterTiers + 1, last = t.mode === modes - 1; t.filter = last ? 0 : t.mode === 0 ? 7 : t.mode; if (g.logi.setSorterLook) g.logi.setSorterLook(t); },
  },
};

// ---------- merge ----------
export const CONFLICTS = [];   // human readable, empty when the parts are clean (a test reads it)
export const UPGRADES = [];
export const DEMAND = {};
export const TYPES = Object.create(null);   // no prototype: a type named __proto__ or constructor can never resolve to a built in
export const KIND_MAP = Object.create(null);    // tool kind -> TYPES key, for handlers that list extra `kinds`
const seen = { up: new Map(), dm: new Map(), ty: new Map() };
for (const [k, h] of Object.entries(CORE_TYPES)) { TYPES[k] = h; seen.ty.set(k, 'core'); }
for (const [name, part] of Object.entries(PARTS)) {
  for (const u of part.UPGRADES || []) { if (seen.up.has(u.id)) CONFLICTS.push(`upgrade ${u.id}: ${seen.up.get(u.id)} and ${name}`); else { seen.up.set(u.id, name); UPGRADES.push(u); } }
  for (const [k, v] of Object.entries(part.DEMAND || {})) { if (seen.dm.has(k)) CONFLICTS.push(`demand ${k}: ${seen.dm.get(k)} and ${name}`); else { seen.dm.set(k, name); DEMAND[k] = v; } }
  for (const [k, h] of Object.entries(part.TYPES || {})) {
    if (seen.ty.has(k)) { CONFLICTS.push(`type ${k}: ${seen.ty.get(k)} and ${name}`); continue; }
    seen.ty.set(k, name); TYPES[k] = h;
    for (const kind of h.kinds || []) { if (KIND_MAP[kind] || TYPES[kind]) CONFLICTS.push(`tool kind ${kind}: ${name}`); else KIND_MAP[kind] = k; }
  }
}

// the entity type or tool kind -> its handlers (or undefined)
export const catalogType = (typeOrKind) => (typeOrKind ? TYPES[typeOrKind] || TYPES[KIND_MAP[typeOrKind]] : undefined);

// bench rows of every part; duplicates (by id) are reported and dropped
export function catalogRecipes(g) {
  const out = [], ids = new Set();
  for (const [name, part] of Object.entries({ ...PARTS, ...EXTRA })) {
    for (const r of (part.RECIPES ? part.RECIPES(g) : [])) { if (ids.has(r.id)) { CONFLICTS.push(`recipe ${r.id}: duplicate in ${name}`); continue; } ids.add(r.id); out.push(r); }
  }
  return out;
}

// merge helper for upgrades.js: appends the catalog upgrades that do not clash with an id already in the tree
export function mergeUpgrades(list) {
  const ids = new Set(list.map((u) => u.id));
  for (const u of UPGRADES) { if (ids.has(u.id)) { CONFLICTS.push(`upgrade ${u.id}: already in the core tree`); continue; } ids.add(u.id); list.push(u); }
  return list;
}
// merge helper for power.js: new keys only
export function mergeDemand(map) {
  for (const [k, v] of Object.entries(DEMAND)) { if (k in map) CONFLICTS.push(`demand ${k}: already in power.js`); else map[k] = v; }
  return map;
}

// ent fields that never travel to a guest (or into a saved copy of the net message): live state the host recomputes
export const TRANSIENT = ['items', 'q', 'kept', 'stored', 'buf', 'path', 'trail', 'carry', 'hop', 'cargo', 'lane', 'wait', 'cache', 'hist'];
