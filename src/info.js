// The context readout: what the thing you are aiming at is, what it is doing and how to use it. One place so every item has one.
import { FRAME_TYPES, STRUT_DEPTH, supportDepth } from './upgrades.js';
import { RARITY, species } from './plushdata.js';
import { capacityOf } from './loadtrace.js';
import { FAN_R, VENT_R } from './dust.js';
import { CART_NAMES, CART_CAP } from './cart.js';
import { isEarth, earthInfo } from './earth.js';
import { wireable } from './cables.js';
import { infoReplace, infoExtra } from './ext.js';
import { pickBuilt } from './build.js';
import { C, cellX, cellZ } from './config.js';

const pct = (v) => `${Math.round((v ?? 0) * 100)}%`;
const SORT_NAMES = ['Sells everything', 'Keeps Uncommon and better', 'Keeps Rare and better', 'Keeps Epic and better', 'Keeps Legendary and better', 'Keeps Mythic'];
const fmtT = (s) => (s >= 90 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`);
const powerLine = (t) => ((t.pw ?? 0) > 0.05 ? `Powered ${pct(t.pw)}` : 'No power: link it to a pole or a generator');

export function findInfoRef(g) {
  const eye = g.renderer.camera.position, dir = g.player.forward(g._infoDir || (g._infoDir = eye.clone()));
  { const ch = g.cables.hit(eye, dir, 4.5); if (ch) { const tl = g.logi.pick(eye, dir, 3.6); if (!tl || ch.t < Math.hypot(cellX(tl.i) - eye.x, tl.j * C + 1 - eye.y, cellZ(tl.k) - eye.z) + 0.3) return { kind: 'cable', id: ch.id }; } }
  if (g.S.cart && g.cartDist() < 3.2) { const v = eye.clone().set(g.S.cart.x - eye.x, g.S.cart.y + 0.5 - eye.y, g.S.cart.z - eye.z); if (v.length() < 3.2 && v.normalize().dot(dir) > 0.7) return { kind: 'cart' }; }
  const tile = g.logi.pick(eye, dir, 3.6); if (tile) return { kind: 'tile', id: tile.id };
  let best = null, bd = 3.4;
  for (const it of g.machines.items.values()) {
    const e = it.ent; const em = isEarth(e.type); const x = em ? it.obj.position.x : (e.cx ?? e.px ?? e.x), y = em ? it.obj.position.y + e.hy : (e.y0 ?? e.y) + (e.h ? e.h / 2 : 0.5), z = em ? it.obj.position.z : (e.cz ?? e.pz ?? e.z); if (x === undefined) continue;
    const v = eye.clone().set(x - eye.x, y - eye.y, z - eye.z), d = v.length(); if (d > bd + (e.hr || 0) || v.normalize().dot(dir) < (e.hr ? 0.8 : 0.9)) continue; bd = d; best = it;
  }
  { const pb = pickBuilt(g, eye, dir, 3.6); if (pb && (!best || pb.t < bd)) return { kind: 'mach', id: pb.ent.id }; }   // build shell: the pad, catwalk, wall, ramp or stair under the crosshair
  return best ? { kind: 'mach', id: best.ent.id } : null;
}

// every readout also says what a hand-wired power cable does for the thing it touches (the source of its power), the same on both screens
export function infoFor(g, ref) {
  if (!ref) return null;
  if (ref.kind === 'cable') { const c = g.cables.rec(ref.id); return c ? g.cables.describe(c) : null; }
  const id = ref.id, e = ref.kind === 'tile' ? g.logi.byId.get(id) : ref.kind === 'mach' ? (g.machines.items.get(id) || {}).ent : null;
  // catalog hook (catalog_*.js TYPES[type].info replaces the readout, .infoExtra adds lines in front); both screens read the same ent
  let r = e ? infoReplace(g, e, ref) : null;
  if (!r) r = infoBase(g, ref); if (!r) return r;
  if (e) { const more = infoExtra(g, e); if (more.length) r = { ...r, lines: [...more, ...r.lines] }; }
  if (e && wireable(e)) { const extra = g.cables.infoLines(e); if (extra.length) return { ...r, lines: [...extra, ...r.lines] }; }
  return r;
}

function infoBase(g, ref) {
  if (!ref) return null;
  const T = g.T;
  if (ref.kind === 'cart') { const c = g.S.cart; if (!c) return null; return { title: CART_NAMES[c.tier].toUpperCase(), lit: true, lines: [`Carrying ${c.load.length} of ${CART_CAP[c.tier]} plush`, `Mode: ${c.mode}`, 'Plush you grab ride on it when your hands are full. Throw plush at it, or hammer it to stow.'] }; }
  if (ref.kind === 'tile') {
    const t = g.logi.byId.get(ref.id); if (!t) return null;
    if (t.type === 'gen') { const gi = g.genInfo(t); return { title: gi.title + (gi.lit ? ' · BURNING' : ' · OUT OF FUEL'), lit: gi.lit, lines: gi.lines }; }
    if (t.type === 'belt') {
      if (t.detector) return { title: 'DETECTOR GATE', lit: !t.alarm, lines: [t.alarm ? 'ALARM: The One is held here. The belt behind it is stopped. Press E to take it.' : 'All clear so far.', `${g.S.stats.scans || 0} plush scanned in total`, 'Everything on its belt, every robot and you pass through it. If The One comes by it is pulled aside and the belt stops.'] };
      if (t.splitter) return { title: 'BELT SPLITTER', lit: true, lines: [`Carrying ${t.items.length} plush`, 'Deals plush forward, left and right in turn to whatever is built there.'] };
      return { title: t.hose ? (!t.fed ? 'VACUUM HOSE (MOUTH)' : 'VACUUM HOSE') : t.rise ? 'RAMP BELT' : 'BELT', lit: (t.pw ?? 0) > 0.05, lines: [`Carrying ${t.items.length} plush`, `Speed ${(T.beltSpeed || 1).toFixed(1)} tiles per second`, (t.pw ?? 0) > 0.05 ? powerLine(t) : 'Unpowered: hand-cranked at a crawl. A pole near a generator makes it full speed.', t.cd != null ? 'Bends here: it takes plush from the side.' : 'Place the next belt facing a new way to bend the line.', 'Ends in a sorter, vault, generator, charging station or the SORT bin and feeds it.'] };
    }
    if (t.type === 'sorter') { const label = t.filter === 0 ? 'Passes everything (no selling)' : SORT_NAMES[Math.min(5, t.mode)] || 'Sells'; return { title: 'SORTING BOX', lit: (t.pw ?? 0) > 0.05, lines: [label, `${(t.q || []).length} plush waiting`, powerLine(t), 'E cycles what it keeps. It also pulls in what you carry.'] }; }
    if (t.type === 'vault') return { title: 'VAULT CRATE', lit: true, lines: [`${(t.stored || []).length} of ${g.logi.vaultCap()} plush stored`, 'Fills from a belt. E empties it into your hands.'] };
    if (t.type === 'mech') return { title: 'MECH SCOOPER', lit: (t.pw ?? 0) > 0.05 && !t.off, lines: [t.off ? 'Parked (E to run)' : `Working: ${t.state || 'dig'}`, `${t.adv || 0} cells dug ahead, hopper ${(t.buf || []).length}`, powerLine(t), 'Digs the face ahead and loads the belt behind it.'] };
    if (t.type === 'pole') { const net = g.power.nets.find((n) => n.nodes.includes(t)); return { title: 'POWER POLE', lit: (t.pw ?? 0) > 0.05, lines: [net ? `Grid: ${net.supply.toFixed(1)} kW supplied, ${net.demand.toFixed(1)} kW wanted` : 'Not linked to a generator', `Links to poles and generators within ${T.poleLink} m, feeds machines within ${T.poleReach} m`] }; }
    if (t.type === 'fan' && t.mounted) { const f = g.machines.items.get(t.frameId); return { title: 'SUPPORT FAN', lit: (t.pw ?? 0) > 0.15, lines: [powerLine(t), `Blows ${FAN_R} m down the tunnel the way it faces and a little behind it`, 'Deep tunnels go stale: it keeps the air breathable only if the next fan is close enough (see the AIR AT DEPTH board).', f ? 'Hangs under its frame; it comes down with it.' : ''] }; }
    if (t.type === 'fan') return { title: 'VENT FAN', lit: (t.pw ?? 0) > 0.15, lines: [powerLine(t), `Clears dust and thins stale air within ${VENT_R} m all around`] };
    if (t.type === 'charger') { const ci = g.chargerInfo(t); return { title: ci.title, lit: ci.live, lines: ci.lines }; }
    return { title: String(t.type).toUpperCase(), lit: true, lines: [] };
  }
  if (ref.kind === 'mach') {
    const it = g.machines.items.get(ref.id); if (!it) return null; const e = it.ent;
    if (e.type === 'frame') {
      const f = FRAME_TYPES[e.kind], s = g.world.supports.find((q) => q.id === e.id), d = supportDepth(e.cx, e.cz); const load = s && s.load !== undefined ? s.load : null;
      const mount = [...g.logi.tiles.values()].some((q) => q.mounted && q.frameId === e.id);
      return { title: f.name.toUpperCase() + (e.auto ? ' (crew)' : ''), lit: load === null || load < 0.85, lines: [`${isFinite(f.maxDepth) ? 'Rated to ' + f.maxDepth + ' m deep' : 'Rated for any depth'}; this one stands at ${Math.round(d)} m`, load !== null ? `Load ${pct(load)} (creaks at 85%, breaks at 100%)` : 'Load not measured yet', `Holds the roof within ${f.radius} m${e.turned ? `; turned ${Math.round(((e.yaw % 6.2832) + 6.2832) % 6.2832 * 180 / Math.PI)} degrees` : ''}`, mount ? 'Has a Support Fan clamped under it' : 'A Support Fan can clamp under its top beam'] };
    }
    if (e.type === 'strut') { const s = g.world.supports.find((q) => q.id === e.id), r = e.jack ? 2.7 : 1.9; const d = supportDepth(e.x, e.z); return { title: e.jack ? 'HYDRAULIC JACK' : 'STRUT', lit: !s || (s.load ?? 0) < 0.85, lines: [`Rated to ${e.jack ? STRUT_DEPTH.jack : STRUT_DEPTH.strut} m deep; this one stands at ${Math.round(d)} m`, s && s.load !== undefined ? `Load ${pct(s.load)}` : 'Load not measured yet', `Holds the roof within ${r} m`] }; }
    if (e.type === 'lantern') return { title: 'LANTERN', lit: true, lines: ['A steady light. No power needed.'] };
    if (e.type === 'flare') { const left = Math.max(0, (e.glow ? 600 : 240) - (g.S.stats.playSecs - (e.born || 0))); return { title: e.glow ? 'GLOW STICK' : 'ROAD FLARE', lit: left > 0, lines: [`Burns for ${fmtT(left)} more`] }; }
    if (e.type === 'marker') return { title: 'SURVEY MARKER', lit: true, lines: ['Shows on your compass so you can find your way back.'] };
    if (e.type === 'rope') return { title: 'ROPE ANCHOR', lit: true, lines: ['Everything within 6 m is roped in: the slope will not give way under you.'] };
    if (e.type === 'charge') return { title: e.dyn ? 'DYNAMITE' : 'BLASTING CHARGE', lit: false, lines: [`Fuse: ${Math.max(0, e.fuse || 0).toFixed(1)} s`, 'RUN.'] };
    if (e.type === 'claw') return { title: 'CLAW RIG', lit: (e.pw ?? 0) > 0.05, lines: [powerLine(e), `${g.machines.count('claw')} of ${T.rigMax} rigs placed`, 'Plucks the highest plush in reach and sells it.'] };
    if (e.type === 'borer') return { title: 'TUNNEL BORER', lit: (e.pw ?? 0) > 0.05 && !e.done, lines: [e.done ? 'Finished or halted' : powerLine(e), `${e.steps || 0} steps bored, ${e.w}x${e.h} wide`, 'Lines the tunnel behind it with the strongest frame that holds at that depth.'] };
    if (isEarth(e.type)) return earthInfo(g, e);
    if (e.type === 'beacon') return { title: 'DEPOT BEACON', lit: (e.pw ?? 0) > 0.05, lines: ['Sorts and sells what you carry, fast travel and recall point.', 'E opens the travel menu.'] };
    return { title: String(e.type).toUpperCase(), lit: true, lines: [] };
  }
  return null;
}
