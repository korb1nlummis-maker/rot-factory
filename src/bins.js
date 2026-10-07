// Bins: where plush are sold. The SORT bin in the sorting bay and every Depot Beacon is a bin, and a bot, a cart, an earth mover, a truck, a borer,
// a claw rig, a mech, a rail line and the end of a belt can each be assigned one. Every one of them keeps `dest` (a plain whole number that saves
// and syncs like any other field): 0 is Auto, exactly what the machine did before bins could be chosen, -1 is the SORT bin and a positive number is
// the id of a Depot Beacon.
//
// Rules this file keeps for every caller:
//   * a sale is worth the same at every bin (the money never looks at where it was made), so a far bin is only ever slower, never better paid;
//   * a bin that is gone, or a beacon with no power, never strands a machine: resolve() says why and the caller carries on as Auto;
//   * this file imports nothing heavy (config, util, plushdata), so every machine file can import it without a cycle.
import { cellX, cellZ } from './config.js';
import { fmt } from './util.js';
import { NEEDLE } from './plushdata.js';

export const AUTO = 0, HALL = -1;
export const HALL_NAME = 'SORT bin';
export const HALL_REACH = 1.9, BEACON_REACH = 1.6;   // how close a belt end must be to feed the bin / a beacon (as it always was)
export const UNLOAD_OFFSET = 1.6;                    // a bot stands this far south of its bin

export const MACHINES = new Set(['truck', 'excavator', 'dozer', 'wheel', 'borer', 'claw', 'railstn', 'railcar']);
export const TILES = new Set(['belt', 'mech']);
export const isPortalEnt = (e) => !!e && e.type === 'garch' && (e.pd === 1 || e.pd === -1);
// a belt is assignable only as the end of a plain line: a Detector Gate (its E takes The One, so Shift+E keeps meaning that), a splitter, merger, lift or underground end never sells
export const assignable = (e) => !!e && (MACHINES.has(e.type) || (TILES.has(e.type) && !e.detector && !e.splitter && !e.merger && !e.smart && !e.lift && !e.ug) || isPortalEnt(e));

const KIND_NAME = { truck: 'Haul Truck', excavator: 'Excavator', dozer: 'Bulldozer', wheel: 'Bucket-Wheel Excavator', borer: 'Tunnel Borer', claw: 'Claw Rig', railstn: 'Rail Station', railcar: 'Rail Cart', belt: 'Belt end', mech: 'Mech Scooper', garch: 'Portal', bot: 'Bot', cart: 'Cart' };
const AUTO_TEXT = {
  bot: 'the SORT bin, as before', cart: 'the nearest bin it stops by', truck: 'the nearest bin or Depot Beacon', excavator: 'the nearest bin for the trucks that haul it', dozer: 'the nearest bin for its chute and its trucks',
  wheel: 'the nearest bin for the trucks that haul it', borer: 'the SORT bin', claw: 'the SORT bin', garch: 'the nearest bin', railstn: 'the nearest bin a cart stops by', railcar: 'the nearest bin it stops by',
  belt: 'whichever bin the end touches', mech: 'any line',
};
export const kindName = (o) => KIND_NAME[o && o.k === 'ent' ? (isPortalEnt(o.o) ? 'garch' : o.o.type) : o && o.k] || 'Machine';

// ---------------------------------------------------------------------------------------------------------------- the list of bins
const letters = (n) => String.fromCharCode(65 + (n % 26)) + (n >= 26 ? Math.floor(n / 26) : '');
export const defaultName = (num) => `Depot ${letters(Math.max(0, num | 0))}`;
const beaconEnts = (g) => { const out = []; for (const it of g.machines.items.values()) if (it.ent.type === 'beacon') out.push(it.ent); return out; };

// the smallest number no beacon uses (a depot keeps its name when another one is taken down, and a new one reuses the gap)
export function nextNum(g) {
  ensureNums(g);   // (a world saved before bins had numbers: the old depots are numbered first, in the order they were placed, so a new one never takes the name of an old one)
  const used = new Set(); for (const e of g.S.entities) if (e.type === 'beacon' && Number.isInteger(e.num)) used.add(e.num);
  let n = 0; while (used.has(n)) n++; return n;
}
// beacons placed before bins had numbers (and test fixtures) get one the first time anyone asks: in the order they were placed, so the names are the ones the travel menu always showed
export function ensureNums(g) {
  if (g.isGuest && g.isGuest()) return;
  const bs = g.S.entities.filter((e) => e.type === 'beacon'); if (!bs.length) return;
  const used = new Set(); const lack = [];
  for (const e of bs) { if (Number.isInteger(e.num) && e.num >= 0 && !used.has(e.num)) used.add(e.num); else lack.push(e); }
  for (const e of lack) { let n = 0; while (used.has(n)) n++; e.num = n; used.add(n); }
}
const numOf = (g, e) => { if (Number.isInteger(e.num)) return e.num; const bs = g.S.entities.filter((x) => x.type === 'beacon'); return Math.max(0, bs.findIndex((x) => x.id === e.id)); };
export const nameOf = (g, e) => (e.name && String(e.name).trim()) || defaultName(numOf(g, e));

export function hallBin(g) { const bp = g.hall.binPos; return { id: HALL, kind: 'hall', name: HALL_NAME, x: bp.x, y: 0, z: bp.z, reach: HALL_REACH, ent: null }; }
function beaconBin(g, e) { if (!Number.isInteger(e.num)) ensureNums(g); return { id: e.id, kind: 'beacon', name: nameOf(g, e), x: e.x, y: e.y || 0, z: e.z, reach: BEACON_REACH, ent: e }; }
export function listBins(g) {
  ensureNums(g);
  const out = [hallBin(g)];
  const bs = beaconEnts(g).sort((a, b) => numOf(g, a) - numOf(g, b) || a.id - b.id);
  for (const e of bs) out.push(beaconBin(g, e));
  return out;
}
export function binById(g, id) {
  if (id === HALL) return hallBin(g);
  if (!Number.isInteger(id) || id <= 0) return null;
  const it = g.machines.items.get(id);
  return it && it.ent.type === 'beacon' ? beaconBin(g, it.ent) : null;
}
// can sales be made there right now? The SORT bin always; a beacon needs power (a plain Auto still uses an unpowered one, as it always did)
export const usable = (bin) => !!bin && (bin.kind === 'hall' || (bin.ent.pw ?? 0) > 0.05);
export const dist = (bin, x, z) => Math.hypot(bin.x - x, bin.z - z);

// the nearest bin of all to a spot, power or not: what Auto has always meant for a truck
export function nearest(g, x, z) {
  let best = hallBin(g), bd = dist(best, x, z);
  for (const e of beaconEnts(g)) { const d = Math.hypot(x - e.x, z - e.z); if (d < bd) { bd = d; best = beaconBin(g, e); } }
  return best;
}

// an assignment, read against the world: { bin } when it can be used now, otherwise { bin: null, why: 'gone' | 'unpowered' } (and Auto 0 is { bin: null, why: '' })
export function resolve(g, dest) {
  dest = dest | 0;
  if (!dest) return { bin: null, why: '' };
  const bin = binById(g, dest);
  if (!bin) return { bin: null, why: 'gone' };
  if (!usable(bin)) return { bin: null, why: 'unpowered', named: bin };
  return { bin, why: '' };
}
// the bin a machine uses at a spot: its assignment when it works, else the nearest (Auto). `auto` says which; `why` is the reason an assignment was set aside
export function pick(g, dest, x, z) {
  const r = resolve(g, dest);
  if (r.bin) return { bin: r.bin, auto: false, why: '' };
  return { bin: nearest(g, x, z), auto: true, why: r.why, named: r.named };
}
// the same for the machines whose Auto has always been the SORT bin (bots, claw rigs, borers)
export function pickHall(g, dest) {
  const r = resolve(g, dest);
  if (r.bin) return { bin: r.bin, auto: false, why: '' };
  return { bin: hallBin(g), auto: true, why: r.why, named: r.named };
}


// ---------------------------------------------------------------------------------------------------------------- what was sold where
export function note(g, binId, n, v) {
  const S = g.S; if (!S || !Number.isInteger(binId) || !(n > 0)) return;
  if (binId !== HALL && !binById(g, binId)) return;   // a depot that is gone (a truck on its way there when it was taken down) has no tally to grow
  const day = g.dayNumber ? g.dayNumber() : 1, m = S.binStats || (S.binStats = {});
  const r = m[binId] || (m[binId] = { d: day, n: 0, v: 0, tn: 0, tv: 0 });
  if (r.d !== day) { r.d = day; r.n = 0; r.v = 0; }
  r.n += n; r.v += v; r.tn += n; r.tv += v;
}
export function today(g, binId) {
  const r = g.S && g.S.binStats && g.S.binStats[binId], day = g.dayNumber ? g.dayNumber() : 1;
  return r && r.d === day ? { n: r.n, v: r.v } : { n: 0, v: 0 };
}
export function totals(g, binId) { const r = g.S && g.S.binStats && g.S.binStats[binId]; return r ? { n: r.tn, v: r.tv } : { n: 0, v: 0 }; }

// ---------------------------------------------------------------------------------------------------------------- who is assigned to what
export function subjects(g) {
  const out = [];
  for (const b of g.S.crew || []) out.push({ k: 'bot', o: b });
  for (const key of ['cart', 'gcart']) if (g.S[key]) out.push({ k: 'cart', o: g.S[key], key });
  for (const t of g.logi.tiles.values()) if (assignable(t)) out.push({ k: 'ent', o: t });   // (a Detector Gate, splitter or lift is not a belt end)
  for (const it of g.machines.items.values()) if (assignable(it.ent)) out.push({ k: 'ent', o: it.ent });
  return out;
}
export function assignedTo(g, binId) {
  let bots = 0, machines = 0;
  for (const s of subjects(g)) if ((s.o.dest | 0) === binId) { if (s.k === 'bot') bots++; else machines++; }
  return { bots, machines };
}
export function subjectPos(s) {
  const o = s.o;
  if (s.k === 'ent' && o.i !== undefined && o.type !== 'borer' && o.type !== 'beacon' && o.x === undefined) return { x: cellX(o.i), z: cellZ(o.k) };
  return { x: o.px ?? o.x ?? (o.i !== undefined ? cellX(o.i) : 0), z: o.pz ?? o.z ?? (o.k !== undefined ? cellZ(o.k) : 0) };
}
export function subjectLabel(s) {
  const o = s.o;
  if (s.k === 'bot') return o.name || 'Bot';
  if (s.k === 'cart') return s.key === 'gcart' ? "Your friend's cart" : 'Your cart';
  const nm = kindName(s);
  return o.name ? `${nm} ${o.name}` : nm;
}
export const subjectKey = (s) => (s.k === 'cart' ? s.key : s.o.id);

export function entById(g, id) { const t = g.logi.byId.get(id); if (t) return t; const it = g.machines.items.get(id); return it ? it.ent : null; }
export function subjectOf(g, ref) {   // ref: { k:'bot'|'cart'|'ent', id?, key? } as sent over the net
  if (!ref) return null;
  if (ref.k === 'bot') { const b = (g.S.crew || []).find((x) => x.id === ref.id); return b ? { k: 'bot', o: b } : null; }
  if (ref.k === 'cart') { const key = ref.key === 'gcart' ? 'gcart' : 'cart'; return g.S[key] ? { k: 'cart', o: g.S[key], key } : null; }
  if (ref.k === 'ent') { const e = entById(g, ref.id); return e && assignable(e) ? { k: 'ent', o: e } : null; }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------- the checks every assignment goes through
// (a number a machine can keep: nothing else is ever stored in `dest`)
export const destValue = (v) => (Number.isInteger(v) && (v === 0 || v === HALL || (v > 0 && v < 1e9)) ? v : undefined);
export function validDest(g, dest) {
  if (destValue(dest) === undefined) return 'Not a bin';
  if (dest > 0 && !binById(g, dest)) return 'That bin is gone';
  return null;
}
// ext.js asks: the cfg spec of anything assignable also takes `dest`; the host re-checks the bin when it applies a patch
export function extendSpec(ent, spec) { return assignable(ent) ? { ...(spec || {}), dest: destValue } : spec; }
export function checkCfg(g, ent, clean) { return clean.dest !== undefined && assignable(ent) ? validDest(g, clean.dest) : null; }

// set what a bot or a cart (not an ent: those go through setCfg) uses. Host: applies. Guest: asks the host with `bindest`.
export function assign(g, s, dest) {
  if (!s) return { ok: false, why: 'Nothing to assign' };
  const why = validDest(g, dest); if (why) return { ok: false, why };
  if (s.k === 'ent') return g.setCfg(s.o, { dest });
  if (g.isGuest()) { g.cmd('bindest', { k: s.k, id: s.o.id, key: s.key, dest }); return { ok: true }; }
  s.o.dest = dest;
  if (s.k === 'bot') s.o.haulDest = 0;
  return { ok: true };
}
// host: a guest asked (the cart is always the guest's own: myCart() follows _actor)
export function runCmd(g, d) {
  if (!d || typeof d !== 'object') return;
  let s = null;
  if (d.k === 'bot') s = subjectOf(g, { k: 'bot', id: d.id });
  else if (d.k === 'cart') { const key = g.myCartKey ? g.myCartKey() : 'cart'; s = g.S[key] ? { k: 'cart', o: g.S[key], key } : null; }
  const r = s ? assign(g, s, d.dest) : { ok: false, why: 'That is gone' };
  if (!r.ok) g.netSend({ t: 'toast', icon: '⚠️', title: 'Could not change that', text: String(r.why || 'Refused').slice(0, 80) });
}

// ---------------------------------------------------------------------------------------------------------------- saying so
function announce(g, text) {
  g.ui.toast({ icon: '📍', title: 'Bin assignment', text, ms: 6500 });
  if (g.net && g.net.open && g.net.role === 'host') g.netSend({ t: 'toast', icon: '📍', title: 'Bin assignment', text });
}
// a machine could not use its bin: say so once in a while, and forget the assignment when the bin is gone for good. s: a subject { k, o }.
export function fallback(g, s, why, extra = '') {
  if (!why || (g.isGuest && g.isGuest())) return;
  const o = s.o, label = subjectLabel(s), named = extra || (binById(g, o.dest | 0) || {}).name || 'its bin';
  const memo = g._binSaid || (g._binSaid = new Map()), key = `${g.S.seed}:${subjectKey(s)}:${why}`, now = g.time || 0;
  if (why === 'gone') {
    o.dest = 0; if (s.k === 'bot') o.haulDest = 0;
    if (s.k === 'ent') { g.netSend({ t: 'ent-', id: o.id }); g.netSend({ t: 'ent+', ent: g.stripEnt(o) }); }
    announce(g, `${label}: the bin it was assigned to is gone, so it goes back to Auto (the nearest bin).`); return;
  }
  if (memo.has(key) && now - memo.get(key) < 90) return;
  memo.set(key, now);
  if (why === 'unpowered') announce(g, `${label}: ${named} has no power, so it uses Auto (the nearest bin) until it does.`);
  else if (why === 'unreachable') announce(g, `${label} cannot reach ${named} from here, so it uses Auto (the nearest bin).`);
  else if (why === 'battery') announce(g, `${label} cannot reach ${named} on its battery, so it charges first.`);
  else if (why === 'range') announce(g, `${label}: ${named} is farther than a charge can take it, so it uses Auto (the nearest bin).`);
}
// a beacon was taken down (host): everything assigned to it goes back to Auto, and says so
export function onBeaconGone(g, id) {
  if (g.isGuest && g.isGuest()) return;
  if (g.S && g.S.binStats) delete g.S.binStats[id];   // its tally goes with it (a guest is sent the host's, so it never lists a bin that is not there)
  for (const s of subjects(g)) if ((s.o.dest | 0) === id) fallback(g, s, 'gone');
}

// ---------------------------------------------------------------------------------------------------------------- belts and mechs
const reachList = (g, x, z) => {
  const out = [], hp = g.hall.binPos, dh = Math.hypot(x - hp.x, z - hp.z);
  if (dh < HALL_REACH) out.push([HALL, dh]);
  for (const e of beaconEnts(g)) { const d = Math.hypot(x - e.x, z - e.z); if (d < BEACON_REACH) out.push([e.id, d]); }
  return out;
};
export const binsAt = (g, x, z) => reachList(g, x, z).map((r) => r[0]);
// the end of a belt line: the bin it sells into (null when no bin is in reach). spots: the places the end checks (the cell in front and its own cell).
export function endSink(g, t, spots) {
  const cand = new Map();
  for (const [x, z] of spots) for (const [id, d] of reachList(g, x, z)) if (!cand.has(id) || cand.get(id) > d) cand.set(id, d);
  if (!cand.size) return null;
  const want = t.dest | 0;
  if (want) {
    const r = resolve(g, want);
    if (r.bin && cand.has(r.bin.id)) return r.bin;
    fallback(g, { k: 'ent', o: t }, r.why || 'unreachable', r.why === 'gone' ? '' : (binById(g, want) || {}).name);
  }
  let best = null, bd = Infinity; for (const [id, d] of cand) if (d < bd) { bd = d; best = id; }
  return binById(g, best);
}

// where a belt line goes: the bins its ends touch, and whether it runs into something this file cannot read (a vault, a sorter ...)
function lineEnds(g, t0) {
  const L = g.logi, seen = new Set(), bins = new Set(); let open = false, steps = 0;
  const stack = [t0];
  while (stack.length && steps < 1500) {
    const t = stack.pop(); if (!t || seen.has(t.id)) continue; seen.add(t.id); steps++;
    if (t.type !== 'belt') { open = true; continue; }
    if (t.splitter) { for (const o of L.splitOuts(t)) stack.push(o.tile); continue; }
    if (t.ug && t.ug.role === 'in') { stack.push(t.ug.pair != null ? L.byId.get(t.ug.pair) : null); continue; }
    const nx = L.nextOf(t);
    if (nx) { stack.push(nx); continue; }
    const fx = cellX(t.i) + (t.dir === 0 ? 0.6 : t.dir === 2 ? -0.6 : 0), fz = cellZ(t.k) + (t.dir === 1 ? 0.6 : t.dir === 3 ? -0.6 : 0);
    for (const id of [...binsAt(g, fx, fz), ...binsAt(g, cellX(t.i), cellZ(t.k))]) bins.add(id);
  }
  if (steps >= 1500) open = true;
  return { bins, open };
}
// what a mech remembers about the lines it looked at lives here, never on the entity: a Map or a Set on the tile would be written into the save (as `{}`) and read back as a
// plain object that has no `get`, and a time kept on the tile would outlive the session's clock
const MECH_RT = new WeakMap();
const mechRuntime = (m) => { let r = MECH_RT.get(m); if (!r) { r = { lines: new Map(), lockT: 0 }; MECH_RT.set(m, r); } return r; };
// may this mech hand plush to the belt `t`? A mech with a bin of its own only feeds a line that can reach that bin; Auto feeds anything.
export function mechMay(g, m, t) {
  const want = m.dest | 0; if (!want) return true;
  const r = resolve(g, want);
  if (!r.bin) { fallback(g, { k: 'ent', o: m }, r.why); return true; }   // the bin is gone or has no power: Auto, as the message says
  const rt = mechRuntime(m), c = rt.lines, hit = c.get(t.id), now = g.time || 0;
  let v = hit && now - hit.t < 2 ? hit.v : null;
  if (!v) { v = lineEnds(g, t); c.set(t.id, { t: now, v }); if (c.size > 8) c.delete(c.keys().next().value); }
  const ok = v.open || v.bins.has(r.bin.id);
  rt.lockT = ok ? 0 : now;
  return ok;
}

// ---------------------------------------------------------------------------------------------------------------- bots
// where a bot unloads: its own bin (or the one its cart is bound for), the SORT bin on Auto, and always the SORT bin with The One aboard (the gate is there)
export function botBin(g, b) {
  if (b.hallTrip || (b.carry || []).some((x) => x.sp === NEEDLE)) return { bin: hallBin(g), auto: true, why: '', one: true };   // phased home or out of reach: this trip goes to the SORT bin
  const dest = (b.haulDest | 0) || (b.dest | 0);   // (the load of a cart is the cart's: it goes where the cart is bound, then the bot's own bin)
  const r = pickHall(g, dest);
  if (r.why) fallback(g, { k: 'bot', o: b }, r.why, r.named ? r.named.name : '');
  return r;
}

// ---------------------------------------------------------------------------------------------------------------- what the readouts say
export const autoText = (s) => AUTO_TEXT[s.k === 'ent' ? (isPortalEnt(s.o) ? 'garch' : s.o.type) : s.k] || 'the nearest bin';
export function destText(g, s) {
  const o = s.o, dest = o.dest | 0;
  if (!dest) return `Auto: ${autoText(s)}`;
  const bin = binById(g, dest);
  if (!bin) return 'its bin is gone: Auto';
  const pos = subjectPos(s), d = Math.round(dist(bin, pos.x, pos.z));
  return usable(bin) ? `${bin.name} (${d} m)` : `${bin.name} (${d} m) has no power: Auto until it does`;
}
export function infoLines(g, e) {
  if (!assignable(e)) return [];
  if (e.type === 'belt' && g.logi.nextOf(e)) return [];   // a belt that carries on has no bin to pick: only the end of a line says it
  const s = { k: 'ent', o: e }, lines = [`Bin: ${destText(g, s)}`];
  if (e.type === 'mech' && e.dest && mechRuntime(e).lockT && Math.abs((g.time || 0) - mechRuntime(e).lockT) < 3) lines.push('Held: the belt it feeds does not reach that bin');
  lines.push('; picks its bin, Shift+; copies it');
  return lines;
}
export function beaconLines(g, e) {
  const bin = beaconBin(g, e), t = today(g, e.id), a = assignedTo(g, e.id);
  return [`Name: ${bin.name} (rename it in the bins panel: ; with nothing aimed)`, `Sold here today: ${fmt(t.n)} plush for ◈${fmt(t.v)}`, a.bots + a.machines ? `Assigned: ${a.bots} bot${a.bots === 1 ? '' : 's'}, ${a.machines} machine${a.machines === 1 ? '' : 's'}` : 'Nothing is assigned to it yet'];
}

// ---------------------------------------------------------------------------------------------------------------- guests: one 0.5 s row
// host: every beacon's power and every bin's sales, so a guest's picker and readouts show what the host sees
export function row(g) {
  if (!g.S) return null;
  const pw = []; for (const e of beaconEnts(g)) pw.push(e.id, Math.round((e.pw ?? 0) * 100), numOf(g, e));
  const st = g.S.binStats || {}; if (!pw.length && !Object.keys(st).length) return null;   // no beacon and nothing sold anywhere: nothing to say
  return { pw, st, day: g.dayNumber() };
}
export function guestRow(g, d) {
  if (!d || typeof d !== 'object') return;
  if (Array.isArray(d.pw)) for (let q = 0; q + 2 < d.pw.length; q += 3) { const it = g.machines.items.get(d.pw[q]); if (it && it.ent.type === 'beacon') { it.ent.pw = Math.max(0, Math.min(1, +d.pw[q + 1] / 100 || 0)); if (!Number.isInteger(it.ent.num) && Number.isInteger(d.pw[q + 2])) it.ent.num = d.pw[q + 2]; } }
  if (d.st && typeof d.st === 'object') g.S.binStats = d.st;
}
