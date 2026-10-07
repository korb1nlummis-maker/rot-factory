// The Portal: a giant arch set at the mouth of the plush pile starts a powered auto-driver (lead notes, section 9).
// It is borer class work (the Tunnel Borer's loop: cut a slab, count the plush, set a lining behind the cutter) at the size of the arch it came from:
//   * it hollows the tunnel one slab (one cell deep, span wide, h high) at a time and every 4 slabs sets the next arch of the same span behind it, spending Fluff
//     (stock first, the bench price for the rest: a machine and a player pay alike). The arch is the cheapest tier you own that is rated for the depth and that the load
//     tracing says holds with the next section cut as well; when none does it halts with "the mountain presses N%" (the earth movers' wording) and goes on by itself
//     once you add supports or a better tier. It never skips a lining: a section waits for its arch before the next slab is cut.
//   * stale air: it chokes where the air at the cutter is more than 80% stale unless a Support Fan blows near it (fans clamp under an arch like a frame).
//   * The One: it never cuts The One's cell without a powered Vehicle Scanner on the line (the road from its mouth to the bin). With one it hands The One to the scanner
//     (the alarm, the pedestal, E takes it: the win); without one it halts and says so.
//   * what it cuts is sold like a borer's (one batch), a powered grid feeds it (kW by span), a guest only draws what the host reports.
// State lives on the arch ent (pd adv lined spent off ps pl) so it saves; the cutter's mesh and the head shield are runtime.
import * as THREE from 'three';
import { C, NX, NZ } from './config.js';
import { NEEDLE, species, isSpecialCell } from './plushdata.js';
import { FRAME_TYPES, supportDepth } from './upgrades.js';
import { ARCH_DEPTH, ARCH_SPANS, archReach, capacityOf, loadOn } from './loadtrace.js';
import { compaction } from './util.js';
import * as A from './arches.js';
import * as VS from './vehiclescan.js';
import { sellBatch, sinkNear, STALE_CHOKE } from './earth.js';
import * as BINS from './bins.js';   // the bin a Portal sells what it cuts at

export const KW = { 6: 150, 8: 260, 12: 480 };     // the cutter and its drive while it works (kW)
export const CELLS_PER_S = 12;                       // cells a Portal cuts a second at the base Cutter Head (a Bucket-Wheel does about 13): a slab takes cells / 12 s
export const LINE_RANGE = 150;                       // a Vehicle Scanner within this many metres of the mouth, and no more than DETOUR off the road to the bin, is "on the line"
export const DETOUR = 120;
export const PSTATES = ['idle', 'off', 'nopower', 'dig', 'line', 'press', 'broke', 'choke', 'stuck', 'one', 'done'];
const TEXT = {
  idle: 'Waiting',
  off: 'Parked: press E to start it',
  nopower: 'No power: link it to a pole or a generator',
  dig: 'Boring the tunnel',
  line: 'Setting the next arch behind the cutter',
  press: 'Halted: the mountain presses too hard for any arch it can set here',
  broke: 'Halted: it cannot pay for the next arch',
  choke: 'Choking on stale air: a Support Fan must blow near the cutter',
  stuck: 'Blocked: something it cannot cut (a wall, a pad, a cache, remains or a machine) stands in the bore',
  one: 'Halted: THE ONE is in the next slab and no powered Vehicle Scanner is on the line',
  done: 'Finished: it reached the edge of the hall',
};
export const isPortal = (e) => !!e && e.type === 'garch' && (e.pd === 1 || e.pd === -1);
export const portals = (g) => A.arches(g).filter(isPortal);
export const kwOf = (e) => (isPortal(e) && !e.off && e.ps !== 'done' ? KW[e.span] || 0 : 0);
export const rateOf = (g, e) => { const s = ARCH_SPANS[e.span]; return (e.span * s.h) / CELLS_PER_S * ((g.T && g.T.borerRate ? g.T.borerRate : 12.2) / 12.2); };
const money = (v) => (v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : String(Math.round(v)));

// along-index of slab n (0 is the first one past the mouth arch) and the cells of it
export const slabA = (e, n) => (e.pd > 0 ? e.gm + ARCH_DEPTH + n : e.gm - 1 - n);
export function slabCells(e, a) { const s = ARCH_SPANS[e.span], out = []; for (let l = 0; l < e.span; l++) for (let b = 0; b < s.h; b++) out.push(A.cellOf(e, a - e.gm, l, b)); return out; }
// the along-index of the first cell of the module that lines section k (1 is the first section past the mouth)
export const moduleM = (e, k) => (e.pd > 0 ? e.gm + ARCH_DEPTH * k : e.gm - ARCH_DEPTH * k);
// where the face is (world x, z) after n slabs, on the axis
export function facePos(e, n) {
  const ax = e.axis === 'x' ? 1 : 0, az = e.axis === 'x' ? 0 : 1, along = e.pd * (ARCH_DEPTH * C / 2 + n * C);
  return { x: e.cx + ax * along, z: e.cz + az * along };
}

// the bin a Portal's cuttings are credited to: its own when that one works, else the nearest
function portalBin(g, e) { const r = BINS.pick(g, e.dest, e.cx, e.cz); if (r.why) BINS.fallback(g, { k: 'ent', o: e }, r.why, r.named ? r.named.name : ''); return r.bin.id; }

// ---------------------------------------------------------------- the scanner on the line
export function lineScanner(g, e) {
  const rb = BINS.resolve(g, e.dest).bin, sink = rb ? { x: rb.x, z: rb.z } : sinkNear(g, e.cx, e.cz), sc = VS.pickScanner(g, e.cx, e.cz, sink.x, sink.z, LINE_RANGE);
  if (!sc) return null;
  const d0 = Math.hypot(sink.x - e.cx, sink.z - e.cz), detour = Math.hypot(sc.cx - e.cx, sc.cz - e.cz) + Math.hypot(sink.x - sc.cx, sink.z - sc.cz) - d0;
  return detour <= DETOUR ? sc : null;
}

// ---------------------------------------------------------------- stats of what it cuts (the same counters a digger feeds)
function count(g, taken) {
  const S = g.S, sp = taken.sp; S.stats.plush++; S.stats.rar[species[sp].rarity]++; S.stats.cells++; S.stats.portalDug = (S.stats.portalDug || 0) + 1;
  if (taken.vr & 128) S.stats.shiny++;
  g.registerDex(sp, true);
}
const say = (g, e, title, text) => { if (e.warned === e.ps) return; e.warned = e.ps; VS.announce(g, '🚇', title, text, { ms: 9000 }); };
const stat = (g, e, ps, why) => { if (e.ps !== ps) { e.ps = ps; e.pwhy = why || ''; g.S.stats.portalHalts = (g.S.stats.portalHalts || 0) + (['press', 'broke', 'choke', 'stuck', 'one'].includes(ps) ? 1 : 0); } else e.pwhy = why || e.pwhy; };

// ---------------------------------------------------------------- weigh a lining with the next section cut as well (the Tunnel Borer's test)
// Returns the worst ratio among the new arch and the supports it stands beside.
export function weigh(g, ent, aheadA) {
  const w = g.world, ft = FRAME_TYPES[ent.mat], cap = capacityOf(ent.kind), r = archReach(ent.span, ent.mat);
  if (!isFinite(cap)) return 0;
  const hyp = { x: ent.cx, y: ent.y0 + ent.h / 2, z: ent.cz, r, kind: ent.kind, cap, id: 'hyp-portal', b: ft.bonus };
  const cut = [], onRm = w.onRemove, onSet = w.onSet; w.onRemove = null; w.onSet = null;   // a trial cut: no dust, and nothing for a guest to hear (the cells are put back before anyone looks; a halted Portal tried every 2 s and sent thousands of cells a time)
  try {
    for (const a of aheadA) for (const [i, j, k] of slabCells(ent._head, a)) { const it = w.removeCell(i, j, k, false); if (it) cut.push([i, j, k, it.sp, it.vr]); }
    w.supports.push(hyp);
    let worst = loadOn(w, hyp) / cap;
    for (const q of w.supports) if (q !== hyp && q.cap !== undefined && isFinite(q.cap) && Math.hypot(q.x - hyp.x, q.z - hyp.z) < (q.r + r) && !(typeof q.id === 'string' && q.id.startsWith('shield'))) worst = Math.max(worst, loadOn(w, q) / q.cap);
    return worst;
  } finally {
    const i = w.supports.indexOf(hyp); if (i >= 0) w.supports.splice(i, 1);
    for (const [ci, cj, ck, sp, vr] of cut) w.setCell(ci, cj, ck, sp, vr);
    w.onRemove = onRm; w.onSet = onSet;
  }
}

// ---------------------------------------------------------------- the arch behind the cutter
function lineSection(g, it) {
  const e = it.ent, w = g.world, T = g.T, k = e.lined + 1, mm = moduleM(e, k), span = e.span;
  // whatever fell into the section while it stood open is cut out first (sold like the rest)
  const probe = A.derive(e.axis, mm, e.glo, e.gj, span, e.mat);
  const inSec = A.sectionCells(probe).filter(([i, j, k2]) => w.solid(i, j, k2));
  if (inSec.length) {
    for (const [i, j, k2] of inSec) { const sp = w.get(i, j, k2); if (sp === NEEDLE) { stat(g, e, 'one', 'The One fell into the section'); return; } }
    // a wall, a pad, a supply cache or remains in an open section cannot be cut (the cutter skips them): halt and say so, never sit silent
    for (const [i, j, k2] of inSec) if (isSpecialCell(w.get(i, j, k2))) { const why = 'A wall, a pad, a cache or remains stands in the open section behind the cutter. Take it down or open it (E) and the Portal goes on.'; stat(g, e, 'stuck', why); say(g, e, 'Portal blocked', why); it.timer = 2; return; }
    const flat = []; for (const [i, j, k2] of inSec) { const t = w.removeCell(i, j, k2); if (t) { flat.push(t.sp, t.vr); count(g, t); } }
    if (flat.length) sellBatch(g, flat, 1, portalBin(g, e));
    return;
  }
  // an arch the player set by hand in this very module counts as the lining
  for (const o of A.arches(g)) if (o.axis === e.axis && o.gm === mm && o.glo === e.glo && o.gj === e.gj && o.span === span) { e.lined = k; stat(g, e, 'line', ''); return; }
  // the cheapest tier you own that is rated for the depth, affordable and holds with the next section cut
  const order = Object.keys(FRAME_TYPES).filter((m) => (T.frames || []).includes(m));
  const aheadA = []; for (let q = 0; q < ARCH_DEPTH; q++) aheadA.push(slabA(e, e.adv + q));
  const d = supportDepth(probe.cx, probe.cz); let bestRatio = Infinity, poor = null, chosen = null, bad = '';
  for (const mat of order) {
    const L = A.layout(g, e.axis, mm, e.glo, e.gj, span, mat, { free: true });
    if (!L.ok) { if (/overlap|already here|frame|belt|machine/i.test(L.why)) { stat(g, e, 'stuck', L.why); say(g, e, 'Portal blocked', L.why); it.timer = 2; return; } bad = L.why; continue; }
    L.ent._head = e;
    const ratio = weigh(g, L.ent, aheadA);
    bestRatio = Math.min(bestRatio, ratio);
    if (ratio > 1) continue;
    const pay = A.charge(g, span, mat, true);
    if (!pay.ok) { poor = poor || { mat, cost: pay.cost }; continue; }
    chosen = { mat, ent: L.ent, ratio, pay }; break;
  }
  if (!chosen) {
    if (!poor && !isFinite(bestRatio) && bad) { stat(g, e, 'stuck', bad); say(g, e, 'Portal blocked', bad); it.timer = 2; return; }   // no tier could even be weighed: the section itself is wrong (no floor under it, something built in it)
    if (poor) { stat(g, e, 'broke', `The next arch (${A.nameOf(span, poor.mat)}) costs ${money(poor.cost)} Fluff`); say(g, e, 'Portal stopped', `It cannot pay for the next arch: ${A.nameOf(span, poor.mat)} costs ${money(poor.cost)} Fluff.`); }
    else { e.pl = isFinite(bestRatio) ? bestRatio : 1; stat(g, e, 'press', `The mountain presses ${Math.round(e.pl * 100)}% of what the best arch you own can bear here (${Math.round(d)} m deep)${bad ? '. ' + bad : ''}`); say(g, e, 'Portal halted', `The mountain presses ${Math.round(e.pl * 100)}% of what the best arch you own can bear here. A stronger tier or more supports, and it goes on by itself.`); }
    it.timer = 2; return;
  }
  const pay = A.charge(g, span, chosen.mat);
  const made = g.placeEntity('garch', { axis: e.axis, gm: mm, glo: e.glo, gj: e.gj, span, mat: chosen.mat, auto: true, by: e.id }, { quiet: true, rebuild: false });
  if (!made) { it.timer = 1; return; }
  e.lined = k; e.spent = (e.spent || 0) + pay.cost; e.pl = chosen.ratio; g.S.stats.portalArches = (g.S.stats.portalArches || 0) + 1;
  g.fx.dust(made.cx, made.y0 + 1, made.cz, 10, 1.2, 1.0);
  stat(g, e, 'line', ''); e.warned = '';
}

// ---------------------------------------------------------------- one tick of one portal (host)
function step(g, it, dt) {
  const e = it.ent, w = g.world;
  if (e.ps === 'done') return;
  if (e.off) { e.ps = 'off'; return; }
  const pw = e.pw ?? 0;
  if (pw < 0.05) { e.ps = 'nopower'; return; }
  it.timer = (it.timer ?? 0) - dt * pw; if (it.timer > 0) return;
  const pending = (e.adv >> 2) > e.lined;
  if (pending) { lineSection(g, it); if (e.ps === 'line') it.timer = Math.max(it.timer, 0.5); return; }
  const a = slabA(e, e.adv), cells = slabCells(e, a);
  const fp = facePos(e, e.adv + 1);
  if (cells.some(([i, j, k]) => !w.inside(i, j, k)) || (e.pd > 0 ? a > (e.axis === 'x' ? NX : NZ) - 5 : a < 4)) { stat(g, e, 'done', ''); g.ui.toast({ icon: '🚇', title: 'Portal finished', text: 'It hit the edge of the hall.' }); return; }
  // air at the cutter
  const air = g.dust.stale({ x: fp.x, y: e.y0 + 1.6, z: fp.z });
  if (air > STALE_CHOKE) { e.air = air; stat(g, e, 'choke', `${Math.round(air * 100)}% stale at the cutter`); it.timer = 1.5; return; }
  // what stands in the slab
  let needle = null, block = null;
  for (const [i, j, k] of cells) {
    const sp = w.get(i, j, k);
    if (sp === NEEDLE) needle = [i, j, k];
    else if (isSpecialCell(sp) || g.logi.cellTaken(i, j, k)) block = [i, j, k];   // a wall, a pad, a supply cache or remains: removeCell never takes them
  }
  if (block) { stat(g, e, 'stuck', 'A wall, pad, cache, remains or machine stands in the next slab'); say(g, e, 'Portal blocked', 'Something it cannot cut (a wall, a pad, a supply cache, remains or a machine) stands in the next slab. Take it down or open it (E) and the Portal goes on.'); it.timer = 2; return; }
  let sc = null;
  if (needle) {
    sc = lineScanner(g, e);
    if (!sc) { stat(g, e, 'one', 'The One is in the next slab'); say(g, e, 'Portal halted: THE ONE ahead', 'The next slab holds THE ONE. A Portal never cuts it without a powered Vehicle Scanner on the line to the bin. Build and power one, and it goes on.'); it.timer = 2; return; }
  }
  // cut it
  const flat = [];
  for (const [i, j, k] of cells) {
    const sp = w.get(i, j, k); if (!sp) continue;
    const taken = w.removeCell(i, j, k); if (!taken) continue;
    if (taken.sp === NEEDLE) { g.registerDex(NEEDLE); VS.raise(g, sc, { sp: taken.sp, vr: taken.vr }, 'A Portal cut THE ONE out of the pile and handed it to the scanner on its road. Go to the arch and press E to take it.'); continue; }
    count(g, taken); flat.push(taken.sp, taken.vr);
  }
  if (flat.length) sellBatch(g, flat, 1, portalBin(g, e));
  e.adv++; e.ps = 'dig'; e.warned = '';
  g.S.stats.portalSlabs = (g.S.stats.portalSlabs || 0) + 1;
  g.noteDist(fp.x, fp.z);
  g.fx.dust(fp.x, e.y0 + 0.9, fp.z, 6, 0.9, 1);
  it.timer = rateOf(g, e) * compaction(fp.x, fp.z);
}

// ---------------------------------------------------------------- the mesh of the cutter, the shield that holds the roof around it, the beacon
export function add(machines, ent) {
  const r = A.add(machines, ent);
  if (!isPortal(ent) || !r.garch) return r;
  const g = machines.game, s = ARCH_SPANS[ent.span];
  const drv = machines.makeBorer({ w: s.cw, h: s.ch });
  drv.group.rotation.y = ent.pd > 0 ? 0 : Math.PI;
  r.obj.add(drv.group);
  const bm = new THREE.MeshBasicMaterial({ color: 0x222222 }), beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), bm);
  beacon.position.set(0, ent.h + 0.35, 0); r.obj.add(beacon);
  r.drv = drv; r.beacon = beacon; r.bmat = bm; r.dz = ent.pd * ent.adv * C;
  drv.group.position.z = r.dz;
  const fp = facePos(ent, ent.adv);
  g.world.supports = g.world.supports.filter((q) => q.id !== 'shield' + ent.id);
  r.shield = { x: fp.x, y: ent.y0 + 0.9, z: fp.z, r: archReach(ent.span, ent.mat) + 0.4, b: 7, id: 'shield' + ent.id };
  g.world.supports.push(r.shield);
  return r;
}

const COLOR = { dig: 0x45ff7a, line: 0x45ff7a, off: 0x555555, nopower: 0x222222, idle: 0x2e8c4a, press: 0xffb02a, broke: 0xffb02a, choke: 0xffb02a, stuck: 0xff8a2a, one: 0xff3a2a, done: 0x3a8cff };
function visuals(g, dt) {
  for (const it of g.machines.items.values()) {
    const e = it.ent; if (!isPortal(e) || !it.drv) continue;
    const k = Math.min(1, dt * 5), tz = e.pd * e.adv * C;
    it.dz += (tz - it.dz) * k; it.drv.group.position.z = it.dz;
    const working = e.ps === 'dig' || e.ps === 'line';
    if (it.drv.teeth) it.drv.teeth.rotation.z += dt * (working ? 7 : 0.3);
    if (it.shield) { const fp = facePos(e, e.adv); it.shield.x = fp.x; it.shield.z = fp.z; it.shield.y = e.y0 + 0.9; }
    if (it.bmat) it.bmat.color.setHex(COLOR[e.ps || (e.off ? 'off' : 'idle')] ?? 0x2e8c4a);
    if (it.drv.ring) it.drv.ring.visible = working;
  }
}
export function tick(g, dt) {
  if (g.isGuest && g.isGuest()) return;   // a guest only draws what the host reports
  for (const it of g.machines.items.values()) { const e = it.ent; if (isPortal(e)) { if (e.ps === undefined) e.ps = 'idle'; step(g, it, dt); } }
  visuals(g, dt);
}
export function guestTick(g, dt) { visuals(g, dt); }

// ---------------------------------------------------------------- guests: a 0.5 s row of what the host's portals are doing
const ROW = { last: '', t: 0 };
export function row(g) {
  const out = {}; let any = false;
  for (const e of portals(g)) { out[e.id] = [e.adv, Math.max(0, PSTATES.indexOf(e.ps || 'idle')), Math.round((e.pw ?? 0) * 100), Math.round((e.pl || 0) * 100), e.lined, e.off ? 1 : 0, Math.round(e.spent || 0), Math.round((e.air || 0) * 100)]; any = true; }
  if (!any) { ROW.last = ''; return null; }
  const s = JSON.stringify(out); if (s === ROW.last && g.time - ROW.t < 5) return null;
  ROW.last = s; ROW.t = g.time; return out;
}
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export function guestRow(g, d) {
  if (!d || typeof d !== 'object' || (g.net && g.net.open && g.net.role === 'host')) return;
  for (const e of portals(g)) {
    if (!has(d, e.id)) continue; const a = d[e.id]; if (!Array.isArray(a) || a.length < 6 || !a.every((v) => Number.isFinite(v))) continue;
    e.adv = Math.max(0, Math.min(5000, a[0] | 0)); e.ps = PSTATES[a[1]] || 'idle'; e.pw = a[2] / 100; e.pl = a[3] / 100; e.lined = Math.max(0, a[4] | 0); e.off = a[5] === 1; if (a.length > 6) e.spent = a[6]; if (a.length > 7) e.air = Math.max(0, Math.min(1, a[7] / 100));
  }
}

// ---------------------------------------------------------------- readout lines (arches.info puts them first) and E
export function lines(g, e) {
  if (!isPortal(e)) return [];
  const s = ARCH_SPANS[e.span], out = [], st = e.ps || 'idle';
  let head = TEXT[st] || st;
  if (st === 'press') head = `Halted: the mountain presses ${Math.round((e.pl || 0) * 100)}% of what the best arch you own can bear here`;
  if (st === 'choke') head = `Choking on stale air (${Math.round((e.air || 0) * 100)}%): a Support Fan must blow near the cutter`;
  if (st === 'broke' && e.pwhy) head = `Halted: ${e.pwhy}`;
  if (st === 'stuck' && e.pwhy) head = `Blocked: ${e.pwhy}`;
  out.push(`PORTAL: ${head}`);
  out.push(`${(e.adv * C).toFixed(1)} m bored (${e.adv} slabs), ${e.lined} arches set behind the cutter, ${money(e.spent || 0)} Fluff spent on them.`);
  out.push(`Cuts ${e.span} x ${s.h} cells a slab, about ${rateOf(g, e).toFixed(1)} s each at this depth ${(rateOf(g, e) * compaction(e.cx, e.cz)).toFixed(1)} s, and sets an arch of the cheapest tier that holds every 4 slabs. Draws ${KW[e.span]} kW while it runs. E parks or starts it.`);
  out.push('It halts when the load tracing says no arch would hold, chokes on stale air without a Support Fan, and never cuts The One unless a powered Vehicle Scanner stands on the line to the bin.');
  return out;
}
export function use(g, ent) {
  if (!isPortal(ent)) { g.ui.hint('Giant arch: a normal support. Set one at the mouth of the pile (open on one side, the pile wall on the other) and it becomes a Portal.', 3); return true; }
  const want = !ent.off, r = g.setCfg(ent, { off: want });
  g.ui.hint(r.ok ? (want ? 'Portal parked.' : 'Portal started.') : (r.why || 'Could not change that'), 2.5);
  return true;
}
