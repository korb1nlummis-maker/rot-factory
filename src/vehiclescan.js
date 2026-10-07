// Vehicle Scanner: a big arch set a little way into the floor that every Haul Truck load drives through on its way to the bin.
// Heavy equipment must never leave with The One. A truck pauses under the arch while it scans the load: a clean load is waved on with a soft tick,
// a load that holds The One is dumped on the ground at the arch (the whole load, a stream of loose plush), The One is held by the scanner, the alarm sounds
// and every truck routed through it waits until someone takes The One (E). This is the detector gate alarm flow (red lamps, the beeping klaxon, the "!!" compass
// marker, the held item, "the line stops until you take it") for vehicles, and the arch sounds of detector.js (soft tick, da-ding, buzz with a low thunk).
//
// The ent (type 'vscan', in game.machines.items) keeps the same field names as a detector arch so aiming, the hammer and power work unchanged:
//   axis 'x'|'z' (the way vehicles drive), gm / glo / gj (the section in cells), cx cz y0 w h yaw hr, x y z (the power spot), volume, quiet,
//   alarm (bool), held {sp,vr} (The One the scanner pulled out of a load), loads (count of loads scanned). All plain JSON: it saves and travels with ent+.
// earth.js calls pickScanner / routeVia / scanLoad / dumpStep for the truck rules; machines.js, game.js and power.js only forward to this file.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C, cellX, cellZ, idx } from './config.js';
import { NEEDLE } from './plushdata.js';

// ---------------------------------------------------------------- numbers
export const SIZE = { w: 12, h: 10, pylon: 0.9, beam: 1.1, depth: 0.9, kw: 14, hr: 4.6, name: 'Vehicle Scanner', short: 'V. Scanner' };
export const SINK = 0.6;               // the footings sit this deep in the floor (meters)
export const PRICE = 6000000;          // the first scanner at the bench; each one you already run makes the next 35% dearer
export const GROWTH = 1.35;
export const UNLOCK = 12000000;
const K_BENCH = 3;
export const SCAN_TIME = 1.2;          // seconds a truck stands under the arch while its load is scanned
export const DUMP_SECONDS = 4;         // a dumped load takes about this long to pour out
export const SIM_ROOM = 2450;          // never pour past this many loose plush (the physics cap is 2600)
export const REACH = 5;                // meters in front of and behind the plane the route lines up
const isScan = (e) => !!e && e.type === 'vscan';
export const isVScan = isScan;
export const clearOf = () => ({ w: Math.floor((SIZE.w * C - SIZE.pylon * 2) / C + 1e-6), h: Math.floor((SIZE.h * C - SIZE.beam - 0.1) / C + 1e-6) });
export const scanCost = (count) => Math.round(PRICE * Math.pow(GROWTH, count));
export const scanners = (g) => { const out = []; for (const it of g.machines.items.values()) if (isScan(it.ent)) out.push(it.ent); return out; };
export const byId = (g, id) => { const it = g.machines.items.get(id); return it && isScan(it.ent) ? it.ent : null; };

// ---------------------------------------------------------------- per ent runtime state (never saved, never sent)
const STATE = new WeakMap();
function st(e) { let s = STATE.get(e); if (!s) { s = { flash: 0, kind: '', powered: false, last: null, rig: null, beepT: 0, key: '', spin: 0 }; STATE.set(e, s); } return s; }
export const scanState = st;
// host: the power wired by power.js (ent.pw); guest: the flag the host's row set
export const powered = (g, e) => (g && g.isGuest && g.isGuest() ? st(e).powered : (e.pw ?? 0) > 0.05);

// ---------------------------------------------------------------- load helpers (cargo and hoppers are flat [sp, vr, sp, vr ...])
export function hasOne(flat) { if (!flat) return false; for (let q = 0; q < flat.length; q += 2) if (flat[q] === NEEDLE) return true; return false; }
export function takeOne(flat) { for (let q = 0; q < flat.length; q += 2) if (flat[q] === NEEDLE) { const r = flat.splice(q, 2); return { sp: r[0], vr: r[1] }; } return null; }

// tell the host player and, over the network, the guest
export function announce(g, icon, title, text, extra = {}) {
  g.ui.toast({ icon, title, text, ms: 9000, ...extra });
  if (g.net && g.net.open && g.net.role === 'host') g.netSend({ t: 'toast', icon, title, text });
}

// ---------------------------------------------------------------- volume (full inside 12 m, off at 80 m; a big machine carries further than an arch)
export function volumeFor(g, ent) {
  const p = g.player.pos, d = Math.hypot(p.x - ent.cx, p.z - ent.cz), f = d <= 12 ? 1 : d >= 80 ? 0 : (80 - d) / 68;
  return 0.1 * (ent.volume ?? 0.7) * 1.5 * f;
}

// ---------------------------------------------------------------- the reaction every screen shows for one load: kind 'clear' | 'alarm' | 'fail'
export function react(g, ent, kind, info = {}) {
  const s = st(ent), snd = g.sound, vol = volumeFor(g, ent);
  s.flash = kind === 'alarm' ? 2.0 : kind === 'clear' ? 0.9 : 0.5; s.kind = kind;
  s.last = { t: g.time, kind, n: info.n || 0 };
  if (vol > 0.002 && snd) {
    if (kind === 'clear') { if (!ent.quiet && snd.archTick) snd.archTick(vol * 1.6); }
    else if (kind === 'alarm') { if (snd.archFound) snd.archFound(vol); if (snd.archNotFound) snd.archNotFound(vol * 0.8, true); }
    else if (snd.archNotFound && !ent.quiet) snd.archNotFound(vol * 0.6, true);
  }
  if (g.fx && vol > 0.002) {
    const top = ent.y0 + ent.h;
    if (kind === 'alarm') { g.fx.burst(ent.cx, top - 0.3, ent.cz, 46, 1, 0.2, 0.15, 4, 0.08, 1.5); g.fx.sparkle(ent.cx, top - 0.5, ent.cz, 30, 1, 0.85, 0.4); }
    else if (kind === 'clear') g.fx.sparkle(ent.cx, top - 0.6, ent.cz, 10, 0.4, 1, 0.55);
  }
}

// ---------------------------------------------------------------- the alarm (host)
// A truck load held The One: the scanner keeps it, the alarm runs until somebody takes it (E on the scanner)
export function raise(g, ent, one, text) {
  ent.held = { sp: one.sp, vr: one.vr }; ent.alarm = true; st(ent).beepT = 0;
  g.registerDex(NEEDLE); g.alarmGate = ent;
  if (g.sound && g.sound.found) g.sound.found();
  announce(g, '🚨', 'VEHICLE SCANNER ALARM', text || 'A Haul Truck was carrying THE ONE. The scanner pulled it out and the load is on the ground. Go to the arch and press E to take it.', { cls: 'ach', ms: 12000 });
  g.S.stats.vscanAlarms = (g.S.stats.vscanAlarms || 0) + 1;
  if (g.net && g.net.open && g.net.role === 'host') { g.netSend({ t: 'ent-', id: ent.id }); g.netSend({ t: 'ent+', ent: g.stripEnt(ent) }); }
}
export const alarmAt = (g, id) => { const e = id ? byId(g, id) : null; return !!(e && e.alarm); };

// the lane: one truck at a time between the line-up point and the far side of the arch (its route tags scanA .. scanC). The rest wait in line, and so does every truck while an alarm stands.
// A route waypoint is [x, z, tag]; routes saved before the scanner have no tags (waypoint 0 is the digger, 1 the sink, 2 home).
export const tagOf = (e, seg) => { const r = e.route && e.route[seg]; return (r && r[2]) || (seg === 0 ? 'dig' : seg === 1 ? 'sink' : 'home'); };
const inLane = (e) => ['go', 'scan', 'dump', 'refuse'].includes(e.state) && ['scanA', 'scan', 'scanC'].includes(tagOf(e, e.seg));
const bayTaken = (g, sc, selfId) => { const b = STATE.get(sc) && STATE.get(sc).bay; if (!b || b === selfId) return false; const it = g.machines.items.get(b); return !!(it && it.ent.sc === sc.id && inLane(it.ent)); };
// a truck at the line-up point: true when it may drive in (and now holds the lane), false when it must wait
export function enterLane(g, sc, truckId) { if (!sc || sc.alarm || bayTaken(g, sc, truckId)) return false; st(sc).bay = truckId; return true; }
export function leaveLane(sc, truckId) { const s = sc && STATE.get(sc); if (s && s.bay === truckId) s.bay = 0; }

// E on the scanner (host), or the guest's `vscan` command reaching the host: The One goes to the player, which is the win like any gate
// another alarm that is still up (a scanner or a detector gate), so taking one The One does not put out the warning beacon of the other
export function otherAlarm(g, skip) {
  for (const e of scanners(g)) if (e !== skip && e.alarm) return e;
  if (g.logi && g.logi.tiles) for (const t of g.logi.tiles.values()) if (t !== skip && t.type === 'gate' && t.alarm) return t;
  return null;
}
function clearAlarm(g, ent) { const one = ent.held; ent.held = null; ent.alarm = false; if (g.alarmGate === ent) g.alarmGate = otherAlarm(g, ent); return one; }
export function take(g, ent) {
  if (!ent.alarm || !ent.held) return false;
  const one = clearAlarm(g, ent);
  if (g.net && g.net.open && g.net.role === 'host') { g.netSend({ t: 'ent-', id: ent.id }); g.netSend({ t: 'ent+', ent: g.stripEnt(ent) }); }
  g.pickedUp(one, new THREE.Vector3(ent.cx, ent.y0 + 0.8, ent.cz));
  return true;
}
// the host side of a guest's E: the friend must really be there; The One is handed over as a `give`, the guest's own win flow does the rest
// a guest's E on a digger or a truck that holds The One: the friend must stand near the machine (the hopper and bed are not reachable from across the hall)
export function guestReach(g, ent, flat) {
  if (!hasOne(flat)) return true;
  const rp = g.remote && g.remote.pos, px = ent.px ?? ent.x, pz = ent.pz ?? ent.z; if (!rp) return false;
  return Math.hypot(rp.x - px, rp.z - pz) <= (ent.hr || 3) + 8 && Math.abs(rp.y - (ent.y || 0)) < 12;
}
export function guestTake(g, d) {
  if (!d || typeof d !== 'object' || g.isGuest()) return;
  const e = byId(g, d.id); if (!e || !e.alarm || !e.held) return;
  const rp = g.remote && g.remote.pos; if (!rp || Math.hypot(rp.x - e.cx, rp.z - e.cz) > SIZE.hr + 10 || rp.y < e.y0 - 4 || rp.y > e.y0 + e.h + 3) return;
  const one = clearAlarm(g, e);
  g.netSend({ t: 'give', items: [one] });
  g.netSend({ t: 'ent-', id: e.id }); g.netSend({ t: 'ent+', ent: g.stripEnt(e) });
}

// ---------------------------------------------------------------- truck rules (earth.js calls these on the host)
// the powered scanner that costs a truck the least detour between a digger and its sink, or null
export function pickScanner(g, fx, fz, tx, tz, range = 1e9) {
  let best = null, bs = Infinity;
  for (const e of scanners(g)) {
    if (!powered(g, e)) continue;
    const d1 = Math.hypot(e.cx - fx, e.cz - fz); if (d1 > range) continue;
    const detour = d1 + Math.hypot(tx - e.cx, tz - e.cz) - Math.hypot(tx - fx, tz - fz);
    if (detour < bs) { bs = detour; best = e; }
  }
  return best;
}
// the three waypoints through the arch for a truck coming from (fx, fz): line up in front, stop at the plane, leave on the far side
export function routeVia(e, fx, fz) {
  const ax = e.axis === 'x' ? 1 : 0, az = e.axis === 'x' ? 0 : 1;
  const side = ((fx - e.cx) * ax + (fz - e.cz) * az) >= 0 ? 1 : -1;
  return [[e.cx + ax * side * REACH, e.cz + az * side * REACH, 'scanA'], [e.cx, e.cz, 'scan'], [e.cx - ax * side * REACH, e.cz - az * side * REACH, 'scanC']];
}
// scan a truck's load: a load that holds The One raises the alarm (the One leaves the cargo, the rest is dumped by dumpStep); returns 'alarm' or 'clear'
export function scanLoad(g, truck, ent) {
  const n = (truck.cargo || []).length / 2;
  ent.loads = (ent.loads || 0) + 1; g.S.stats.vscans = (g.S.stats.vscans || 0) + 1;
  const one = takeOne(truck.cargo || []);
  if (one) { truck.cn = (truck.cargo.length) / 2; truck.dumpN = Math.max(1, truck.cn); raise(g, ent, one); }
  const kind = one ? 'alarm' : 'clear';
  react(g, ent, kind, { n });
  if (g.net && g.net.open && g.net.role === 'host') g.netSend({ t: 'xrow', k: 'vscan', d: { ev: 'scan', id: ent.id, k: kind, n: Math.min(5000, n), by: 'h', ld: ent.loads } });
  return kind;
}
// pour the load onto the ground at the arch: a stream of loose plush over about DUMP_SECONDS. Returns true when the bed is empty, 'full' when the floor has no room left.
export function dumpStep(g, truck, ent, dt, groundY) {
  const flat = truck.cargo || [], left = flat.length / 2; if (!left) { truck.cn = 0; return true; }
  const per = Math.max(60, (truck.dumpN || left) / DUMP_SECONDS);
  let n = Math.min(left, Math.max(4, Math.ceil(per * dt)));
  n = Math.min(n, Math.max(0, SIM_ROOM - g.sim.count));
  if (n <= 0) { truck.dumpWait = (truck.dumpWait || 0) + dt; return truck.dumpWait > 3 ? 'full' : false; }   // no room on the floor: after a few seconds earth.js sells the rest, so a full world never holds the lane
  truck.dumpWait = 0;
  const ax = ent.axis === 'x' ? 1 : 0, az = ent.axis === 'x' ? 0 : 1, y = groundY + 1.7;
  let made = 0;
  for (let q = 0; q < n; q++) {
    const lat = (Math.random() - 0.5) * 2.6, al = (Math.random() - 0.35) * 2.4;
    const x = truck.px + (-az) * lat + ax * al, z = truck.pz + ax * lat + az * al;
    const r = g.sim.spawn(flat[2 * q], flat[2 * q + 1], x, y + Math.random() * 0.6, z, (Math.random() - 0.5) * 3, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 3, 0);
    if (r < 0) break; made++;
  }
  if (made) { flat.splice(0, made * 2); truck.cn = flat.length / 2; g.S.stats.vscanDumped = (g.S.stats.vscanDumped || 0) + made; }
  return flat.length === 0;
}

// ---------------------------------------------------------------- placement (the host re-derives everything from a few integers; a guest's numbers are never trusted)
const boxOf = (a) => { const hw = a.w / 2, hd = SIZE.depth / 2; return a.axis === 'x' ? [a.cx - hd, a.cx + hd, a.cz - hw, a.cz + hw] : [a.cx - hw, a.cx + hw, a.cz - hd, a.cz + hd]; };
const overlaps = (g, e) => {
  const A = boxOf(e);
  for (const o of scanners(g)) { if (o === e || o.id === e.id) continue; const B = boxOf(o); if (A[0] < B[1] - 0.05 && A[1] > B[0] + 0.05 && A[2] < B[3] - 0.05 && A[3] > B[2] + 0.05 && e.y0 < o.y0 + o.h - 0.05 && e.y0 + e.h > o.y0 + 0.05) return true; }
  return false;
};

export function layout(g, axis, m, lo, j0) {
  if (axis !== 'x' && axis !== 'z') return { ok: false, why: 'Bad scanner' };
  for (const v of [m, lo, j0]) if (!Number.isInteger(v)) return { ok: false, why: 'Bad scanner' };
  const w = g.world; let n = 0, blocked = 0;
  const cell = (a, b) => (axis === 'x' ? [m, j0 + b, lo + a] : [lo + a, j0 + b, m]);
  for (let a = 0; a < SIZE.w; a++) for (let b = 0; b < SIZE.h; b++) {
    const [i, j, k] = cell(a, b); if (!w.inside(i, j, k)) return { ok: false, why: 'Outside the hall' };
    if (w.solid(i, j, k)) n++; else if (g.logi.tiles.has(idx(i, j, k)) || w.reserved.has(idx(i, j, k))) blocked++;
  }
  const cx = axis === 'x' ? cellX(m) : cellX(lo) + ((SIZE.w - 1) / 2) * C, cz = axis === 'x' ? cellZ(lo) + ((SIZE.w - 1) / 2) * C : cellZ(m), y0 = j0 * C;
  const ent = {
    axis, gm: m, glo: lo, gj: j0, cx, cz, y0, x: cx, y: y0, z: cz, w: SIZE.w * C - 0.04, h: SIZE.h * C - 0.02, yaw: axis === 'x' ? Math.PI / 2 : 0, hr: SIZE.hr,
    volume: 0.7, quiet: false, alarm: false, held: null, loads: 0, clear: clearOf(),
  };
  if (n) return { ok: false, why: `Dig this section out first: ${n} plush in the way (it needs ${SIZE.w} wide and ${SIZE.h} high)`, ent };
  if (blocked) return { ok: false, why: 'Something is in the way: a belt or a machine stands in the section', ent };
  for (const a of [0, SIZE.w - 1]) { const [i, j, k] = cell(a, 0); if (j0 > 0 && !w.solid(i, j0 - 1, k)) return { ok: false, why: 'Both legs need solid floor under them', ent }; }
  if (overlaps(g, ent)) return { ok: false, why: 'Another scanner is already here', ent };
  return { ok: true, ent };
}

export function plan(g, tool, eye, dir, yaw) {
  const w = g.world, M = g.machines, no = (why, ent) => ({ plan: { ok: false, why, ent }, cost: 0 });
  const r = M.rayEmpty(eye, dir, 7);
  if (!r) return no('Aim at the floor where the scanner should stand');
  let { i, j, k } = r.last, guard = 0;
  while (j > 0 && !w.solid(i, j - 1, k) && guard++ < 8) j--;
  if (j > 0 && !w.solid(i, j - 1, k)) return no('No floor here');
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const axis = Math.abs(fx) > Math.abs(fz) ? 'x' : 'z', m = axis === 'x' ? i : k, lo = (axis === 'x' ? k : i) - (SIZE.w / 2 - 1);
  const L = layout(g, axis, m, lo, j);
  return { plan: L.ok ? { ok: true, ent: L.ent } : { ok: false, why: L.why, ent: L.ent }, cost: 0 };
}
export function conflict(g, e, tool) {
  if (!tool || tool.id !== 'vscan') return 'That is not a Vehicle Scanner';
  if (!e || typeof e !== 'object') return 'Nothing to place';
  const L = layout(g, e.axis, e.gm, e.glo, e.gj);
  return L.ok ? null : L.why;
}
export function build(g, tool, e) {
  const L = layout(g, e && e.axis, e && e.gm, e && e.glo, e && e.gj);
  if (!L.ok) return null;
  return { type: 'vscan', ...L.ent };
}
export function preview(g, tool, pl) {
  const M = g.machines, e = pl && pl.ent;
  if (!e || !Number.isFinite(e.cx)) { M.showPreview(null, null); return; }
  const key = `vscan${e.axis}${pl.ok}`;
  if (!M.ghost || M.ghostKey !== key) M.setGhost(buildMesh({ ghost: pl.ok ? 0x9dffc4 : 0xff8a7a }).group, key);
  M.ghost.position.set(e.cx, e.y0, e.cz); M.ghost.rotation.y = e.yaw || 0;
}
export const itemOf = () => 'vscan';
export function onRemove(g, ent) {
  const s = STATE.get(ent); if (s && s.rig && s.rig.tex) s.rig.tex.dispose(); STATE.delete(ent);
  // taking the scanner down while it holds The One hands it over like taking it with E
  if (ent.alarm && ent.held && !g.isGuest()) { const one = clearAlarm(g, ent); g.pickedUp(one, new THREE.Vector3(ent.cx, ent.y0 + 0.8, ent.cz)); }
  else if (g.alarmGate === ent) g.alarmGate = otherAlarm(g, ent);
}

// ---------------------------------------------------------------- cfg
export function check() { return null; }

// ---------------------------------------------------------------- bench row
export function recipes(g) {
  const T = g.T || {}, m = T.machines || [], out = [];
  if (!m.includes('vscan')) return out;
  const count = scanners(g).length;
  out.push({
    id: 'vscan', kind: 'vscan', icon: '🛃', name: SIZE.name, short: SIZE.short, price: Math.round(scanCost(count) / K_BENCH), batch: [1],
    desc: 'A big steel arch set into the floor, 7.2 m wide and 6 m tall: every Haul Truck load drives through it on the way to the bin. A load that holds The One is dumped on the ground at the arch and the alarm sounds. Without one on its route a truck refuses to leave with The One aboard.',
    use: 'Set it across the truck road with B (it faces the way you look, trucks drive through it), near a pole or generator: it draws 14 kW. Trucks route through the nearest powered scanner by themselves. E on it takes The One out when it holds one.',
    statusFn: () => `${count} placed. 14 kW. Each one you run makes the next 35% dearer.`,
  });
  return out;
}

// ---------------------------------------------------------------- readout (hover); host and guest read the same ent fields
export function info(g, ent) {
  const s = st(ent), on = powered(g, ent), lines = [];
  if (ent.alarm) lines.push('ALARM: The One was pulled out of a truck load here. The load is on the ground and every truck routed through is held. Press E to take it.');
  else lines.push(on ? 'All clear. Every Haul Truck load drives through it on the way to the bin.' : 'No power: link it to a pole or a generator. Trucks skip it, and a truck with The One aboard will not leave.');
  lines.push(on ? `Powered (${SIZE.kw} kW).` : `Needs ${SIZE.kw} kW from a pole or a generator.`);
  lines.push(`${ent.loads || 0} loads scanned in total.`);
  if (s.last) { const ago = Math.max(0, Math.round(g.time - s.last.t)); lines.push(s.last.kind === 'alarm' ? `Last load ${ago} s ago: THE ONE found, load dumped (${s.last.n} plush)` : `Last load ${ago} s ago: clear (${s.last.n} plush)`); }
  else lines.push('No load scanned yet.');
  const c = ent.clear || clearOf();
  lines.push(`Opening ${(SIZE.w * C).toFixed(1)} m wide, ${(SIZE.h * C).toFixed(1)} m high (clear ${c.w} x ${c.h} cells): every truck and digger fits. Footings sunk ${SINK} m into the floor.`);
  lines.push('A truck holding The One with no powered scanner on its road waits and says so. Shift+E copies the settings.');
  return { title: SIZE.name.toUpperCase(), lit: on && !ent.alarm, lines };
}
// hover line for the truck readout
export function routeNote(g, e) { const sc = e.sc ? byId(g, e.sc) : null; return sc ? `Routed through a Vehicle Scanner (${Math.round(Math.hypot(sc.cx - e.px, sc.cz - e.pz))} m away)` : ''; }

// ---------------------------------------------------------------- E
export function use(g, ent) {
  if (ent.alarm && ent.held) {
    if (g.isGuest()) { g.cmd('vscan', { id: ent.id }); g.sound.place(); return true; }
    take(g, ent); return true;
  }
  g.ui.hint(powered(g, ent) ? `Vehicle Scanner: all clear. ${ent.loads || 0} loads scanned so far.` : 'Vehicle Scanner: no power. A pole or a generator in reach turns it on.', 2.5);
  return true;
}

// ---------------------------------------------------------------- the machine mesh
const MAT = {
  steel: new THREE.MeshStandardMaterial({ color: 0x77879a, roughness: 0.35, metalness: 0.9 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.6, metalness: 0.4 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xe8b82a, roughness: 0.55, metalness: 0.2 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x8c9096, roughness: 0.95, metalness: 0.05 }),
};
const _m4 = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function addBox(list, sx, sy, sz, x, y, z, rz = 0) { const gm = new THREE.BoxGeometry(sx, sy, sz); _e.set(0, 0, rz); _q.setFromEuler(_e); _p.set(x, y, z); _m4.compose(_p, _q, _s); gm.applyMatrix4(_m4); list.push(gm); }
const LAMP_N = 5;

// local frame: the opening is across x, vehicles drive along z, y is up; the group origin is the bottom centre of the opening AT FLOOR LEVEL (the footings reach SINK below it)
export function buildMesh(opts = {}) {
  const W = SIZE.w * C - 0.04, H = SIZE.h * C - 0.02, pw = SIZE.pylon, bh = SIZE.beam, D = SIZE.depth, t = 0.09;
  const group = new THREE.Group(), steel = [], dark = [], yellow = [], conc = [];
  for (const sx of [-1, 1]) {
    const px = sx * (W / 2 - pw / 2), y0 = -SINK, len = H - bh - y0;
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) addBox(steel, t, H - y0, t, px + cx * (pw / 2 - t / 2), (H + y0) / 2, cz * (D / 2 - t / 2));
    const n = Math.max(3, Math.round(len / 0.75)), seg = len / n;
    for (let q = 0; q <= n; q++) for (const cz of [-1, 1]) addBox(steel, pw, t * 0.8, t * 0.8, px, y0 + q * seg, cz * (D / 2 - t / 2));
    for (let q = 0; q < n; q++) for (const cz of [-1, 1]) { const L = Math.hypot(pw, seg), a = Math.atan2(seg, pw) * (q % 2 ? -1 : 1); addBox(steel, L, t * 0.7, t * 0.7, px, y0 + q * seg + seg / 2, cz * (D / 2 - t / 2), a); }
    // the footing: a concrete block that stands 0.2 m proud of the floor and reaches SINK into it, with a yellow kerb strip
    addBox(conc, pw + 0.5, SINK + 0.2, D + 0.5, px, (0.2 - SINK) / 2, 0);
    addBox(yellow, pw + 0.52, 0.05, D + 0.52, px, 0.2, 0);
  }
  addBox(steel, W, bh, D, 0, H - bh / 2, 0);
  const sn = Math.floor(W / 0.5);
  for (let q = 0; q < sn; q++) { const x = (q - (sn - 1) / 2) * 0.5; if (Math.abs(x) > W / 2 - pw - 0.2) continue; for (const cz of [-1, 1]) addBox(yellow, 0.2, bh * 0.6, 0.02, x, H - bh * 0.5, cz * (D / 2 + 0.011), 0.6); }
  // the sign carrier on top of the beam, and the beacon base
  const pwid = W * 0.6, ph = 1.3, py = H + 0.12 + ph / 2;
  addBox(dark, pwid + 0.14, ph + 0.12, 0.12, 0, py, 0);
  for (const sx of [-1, 1]) addBox(dark, 0.1, 0.16, 0.1, sx * pwid * 0.42, H + 0.06, 0);
  addBox(dark, 0.5, 0.2, 0.5, 0, H + ph + 0.3, 0);
  // the scan plate: a dark strip down the lane with yellow edge lines, flush with the floor
  addBox(dark, W - 2 * pw - 0.2, 0.03, 8, 0, 0.02, 0);
  for (const sx of [-1, 1]) addBox(yellow, 0.1, 0.035, 8, sx * (W / 2 - pw - 0.2), 0.025, 0);
  const lamps = [], ghost = opts.ghost !== undefined;
  if (ghost) {
    const gm = mergeGeometries([...steel, ...dark, ...yellow, ...conc]), mat = new THREE.MeshBasicMaterial({ color: opts.ghost, transparent: true, opacity: 0.42, depthWrite: false });
    group.add(new THREE.Mesh(gm, mat)); return { group, lamps };
  }
  for (const [list, mat] of [[steel, MAT.steel], [dark, MAT.dark], [yellow, MAT.yellow], [conc, MAT.concrete]]) if (list.length) group.add(new THREE.Mesh(mergeGeometries(list), mat));
  const lampMats = []; for (let q = 0; q < LAMP_N; q++) lampMats.push(new THREE.MeshBasicMaterial({ color: 0x222222 }));
  const lg = new THREE.SphereGeometry(0.15, 10, 8);
  for (let q = 0; q < LAMP_N; q++) for (const cz of [-1, 1]) { const l = new THREE.Mesh(lg, lampMats[q]); l.position.set((q - (LAMP_N - 1) / 2) * W * 0.17, H - bh * 0.5, cz * (D / 2 + 0.07)); group.add(l); }
  // the sign: a canvas texture on both faces
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = Math.round(512 * (ph / pwid));
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  for (const cz of [1, -1]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(pwid, ph), pm); pl.position.set(0, py, cz * 0.066); if (cz < 0) pl.rotation.y = Math.PI; group.add(pl); }
  // the beacon on top: a lamp that spins red under alarm, and a tall translucent column so the arch can be found from across the hall
  const bmat = new THREE.MeshBasicMaterial({ color: 0x1c3a28 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), bmat); beacon.position.set(0, H + ph + 0.62, 0); group.add(beacon);
  const colMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false });
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 16, 14, 1, true), colMat); column.position.set(0, H + ph + 8.6, 0); column.visible = false; group.add(column);
  // The One, held by the scanner: a gold plush shape that bobs on a pedestal beside the lane
  const held = new THREE.Group(); held.visible = false; held.position.set(W / 2 - pw - 0.9, 0, 1.2);
  held.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.5, 12), MAT.dark));
  const gold = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.4, 0.5), toneMapped: false })); gold.position.y = 0.95; held.add(gold);
  group.add(held);
  return { group, lamps: lampMats, canvas, tex, panelMat: pm, beaconMat: bmat, column, colMat, beacon, held, gold, key: '' };
}

function drawLabel(rig, ent, on) {
  const cv = rig.canvas, c = cv.getContext('2d'), W = cv.width, H = cv.height, alarm = !!ent.alarm;
  const col = alarm ? '#ff4d4d' : on ? '#7ef0c4' : '#7b8590';
  c.fillStyle = '#0d1114'; c.fillRect(0, 0, W, H); c.strokeStyle = col; c.lineWidth = 8; c.strokeRect(5, 5, W - 10, H - 10);
  c.fillStyle = col; c.textBaseline = 'middle'; c.textAlign = 'center';
  c.font = `800 ${Math.round(H * 0.3)}px Helvetica, Arial, sans-serif`; c.fillText('VEHICLE SCANNER', W / 2, H * 0.33);
  c.fillStyle = alarm ? '#ffd24a' : '#9fb0a0'; c.font = `700 ${Math.round(H * 0.22)}px Helvetica, Arial, sans-serif`;
  c.fillText(alarm ? 'ALARM: THE ONE FOUND' : on ? `CLEAR   ${ent.loads || 0} LOADS` : 'NO POWER', W / 2, H * 0.7);
  rig.tex.needsUpdate = true;
}

// machines.js add() hook: the mesh of a scanner (also what a guest, a loaded save and a late joiner build)
export function add(machines, ent) {
  ent.axis = ent.axis === 'x' ? 'x' : 'z';
  if (!Number.isFinite(ent.volume)) ent.volume = 0.7; ent.quiet = !!ent.quiet; ent.alarm = !!ent.alarm; if (!Number.isFinite(ent.loads)) ent.loads = 0;
  if (ent.alarm && !(ent.held && ent.held.sp)) ent.held = { sp: NEEDLE, vr: 0 }; if (!ent.alarm) ent.held = null;
  if (!Number.isFinite(ent.cx) || !Number.isFinite(ent.cz) || !Number.isFinite(ent.y0)) return { obj: new THREE.Group() };
  if (!Number.isFinite(ent.w)) ent.w = SIZE.w * C - 0.04; if (!Number.isFinite(ent.h)) ent.h = SIZE.h * C - 0.02; if (!Number.isFinite(ent.yaw)) ent.yaw = ent.axis === 'x' ? Math.PI / 2 : 0;
  ent.hr = SIZE.hr; ent.clear = clearOf(); ent.x = ent.cx; ent.y = ent.y0; ent.z = ent.cz;
  const rig = buildMesh();
  rig.group.position.set(ent.cx, ent.y0, ent.cz); rig.group.rotation.y = ent.yaw;
  st(ent).rig = rig; drawLabel(rig, ent, false);
  return { obj: rig.group, vscan: rig };
}

// ---------------------------------------------------------------- per frame (host and guest)
const LAMP_OFF = 0x222222, LAMP_IDLE = 0x2e8c4a;
function visuals(g, dt, host) {
  for (const it of g.machines.items.values()) {
    const e = it.ent; if (!isScan(e)) continue;
    const s = st(e), rig = s.rig; if (!rig || !rig.lamps.length) continue;
    if (host) s.powered = (e.pw ?? 0) > 0.05;
    if (s.flash > 0) s.flash -= dt;
    const key = `${e.alarm}|${s.powered}|${e.loads || 0}`; if (key !== s.key) { s.key = key; drawLabel(rig, e, s.powered); }
    if (e.alarm && !g.alarmGate) g.alarmGate = e;
    rig.held.visible = !!e.alarm; rig.column.visible = !!e.alarm;
    if (e.alarm) { s.spin += dt; rig.gold.position.y = 0.95 + Math.sin(s.spin * 3) * 0.12; rig.gold.rotation.y += dt * 2; rig.colMat.opacity = 0.16 + 0.1 * Math.sin(s.spin * 6); }
    const L = rig.lamps;
    if (!s.powered) { for (const l of L) l.color.setHex(LAMP_OFF); rig.panelMat.color.setHex(0x555555); rig.beaconMat.color.setHex(0x222222); }
    else {
      rig.panelMat.color.setHex(0xffffff);
      if (e.alarm) {
        const ph = Math.floor(g.time * 3); const on = ph % 2 === 0;
        L.forEach((l, q) => l.color.setHex((on ? q % 2 === 0 : q % 2 === 1) ? 0xff3322 : 0x3a0f0c)); rig.beaconMat.color.setHex(on ? 0xff3a2a : 0x4a1210);
      } else if (s.flash > 0) {
        const el = 0.9 - s.flash; const ph = Math.floor(el * 8);
        L.forEach((l, q) => l.color.setHex((ph + q) % 2 ? 0x45ff7a : 0xffd24a)); rig.beaconMat.color.setHex(0x45ff7a);
      } else { for (const l of L) l.color.setHex(LAMP_IDLE); rig.beaconMat.color.setHex(0x2e8c4a); }
    }
    // the klaxon: the detector gate's two square tones every 0.55 s, scaled by distance
    if (e.alarm && s.powered !== undefined) {
      s.beepT -= dt;
      if (s.beepT <= 0) {
        s.beepT = 0.55; const p = g.player.pos, d = Math.hypot(e.cx - p.x, e.cz - p.z);
        if (d < 80 && g.sound && g.mode === 'play') { const v = 0.1 * (e.volume ?? 0.7) * (1 - d / 80); g.sound.tone('square', 880, 880, 0.18, v); g.sound.tone('square', 660, 660, 0.18, v, 0.2); }
      }
    }
  }
}
export function tick(g, dt) { visuals(g, dt, true); }
export function guestTick(g, dt) { visuals(g, dt, false); }

// ---------------------------------------------------------------- host rows and guest events (xrow k:'vscan')
const ROW = { last: '', t: 0 };
export function row(g) {
  const pw = {}, al = {}, ld = {}; let any = false;
  for (const e of scanners(g)) { pw[e.id] = st(e).powered ? 1 : 0; al[e.id] = e.alarm ? 1 : 0; ld[e.id] = e.loads || 0; any = true; }
  if (!any) { ROW.last = ''; return null; }
  const s = JSON.stringify([pw, al, ld]); if (s === ROW.last && g.time - ROW.t < 5) return null;
  ROW.last = s; ROW.t = g.time; return { pw, al, ld };
}
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export function guestRow(g, d) {
  if (!d || typeof d !== 'object' || (g.net && g.net.open && g.net.role === 'host')) return;   // rows describe the host's world to a guest: a host never takes one
  for (const e of scanners(g)) {
    if (d.pw && typeof d.pw === 'object' && has(d.pw, e.id)) st(e).powered = d.pw[e.id] === 1;
    if (d.al && typeof d.al === 'object' && has(d.al, e.id)) { const on = d.al[e.id] === 1; if (on !== !!e.alarm) { e.alarm = on; e.held = on ? { sp: NEEDLE, vr: 0 } : null; if (!on && g.alarmGate === e) g.alarmGate = null; } }
    if (d.ld && typeof d.ld === 'object' && has(d.ld, e.id) && Number.isFinite(d.ld[e.id])) e.loads = d.ld[e.id];
  }
  if (typeof d.k === 'string' && ['clear', 'alarm', 'fail'].includes(d.k) && d.by === 'h') {
    const e = byId(g, d.id); if (!e) return;
    if (Number.isFinite(d.ld)) e.loads = d.ld;
    react(g, e, d.k, { n: Number.isInteger(d.n) && d.n >= 0 && d.n <= 5000 ? d.n : 0 });
  }
}
