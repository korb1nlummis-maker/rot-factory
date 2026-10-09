// Belt intake: a plain belt tile close to you pulls plush off your hands, then off your cart, the way a bin does, at a set rate (the Belt Intake upgrade raises it).
//
// The rules (the numbers are below):
//  * Once you own Conveyor Belts the base level is free: 2 plush a second within 2.0 m. The Belt Intake upgrade has 7 more levels (Mk2 to Mk8) that raise both the rate (2, 4, 8 ... 256 a second) and the reach (to 6 m).
//  * The rate is per player in total (a token bucket), never per tile, so standing among many belts gives no more than one belt would. It is the same bucket for your hands and your cart (hands first).
//  * A piece takes plush if it is a plain belt or ramp tile (not a lift, an underground end, a splitter, a merger, a gate or a vacuum hose) within range of you (hands) or of your cart
//    (a parked cart feeds too) and within 1.8 m of its deck up or down. The nearest tile that can still take a plush gets it, so a full belt backs up and the pull stops.
//  * The One and every special id (fakes, caches, remains) are never pulled: they need a hand carry and a gate scan.
//  * A bin that is closer than the belt wins (the existing autoDump); a belt that is closer takes over (the bin waits while the belt can still take plush).
//  * Only bare hands or the hammer pull plush out of your hands (a build item in hand does not drain them); the cart is not in your hands, so it feeds whatever you hold.
//    There is no switch: once you own Conveyor Belts it is always on (an old saved S.beltIntakeOff is ignored and deleted).
//  * Co-op: the host pulls from its own hands and cart and from the guest's cart. The guest's hands are on the guest's screen, so the guest client finds the belt itself and sends the existing
//    `feed` command once per plush (flagged pull:1); the host re-checks the range, the species and the rate (hostFeed) and hands the plush back when it refuses or the belt is full.
//
// This file imports only light modules (config, plushdata, beltdata, bins), so catalog_belts.js can read it for the upgrade and the readout without an import cycle.
import * as THREE from 'three';
import { C, cellX, cellZ, toI, toJ, toK, idx } from './config.js';
import { NEEDLE, SPECIAL_MIN, species } from './plushdata.js';
import { SPACING, capOf } from './beltdata.js';
import * as BINS from './bins.js';
import { actSound } from './worldsound.js';   // the host hears a friend's belt feed from the belt

const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const RATE = [2, 4, 8, 16, 32, 64, 128, 256];          // plush a second, by level (level 0 is the free base)
export const RANGE = [2.0, 2.6, 3.2, 3.8, 4.3, 4.9, 5.5, 6.0];   // metres, by level
export const PRICE = [25e3, 125e3, 625e3, 3.1e6, 15e6, 78e6, 390e6];   // levels 1 to 7 (absolute, like every catalog upgrade): from the mid game to well past Mk6 belts (150M)
export const MANUAL_RATE = 10;      // plush a second a guest may hand drop on a belt (a click every 0.12 s is the fastest a hand can throw: 8.3 a second)
export const SLACK = 1.2;           // metres the host forgives a guest's position (the position it holds is the last one reported)
export const REACH_V = 1.8;         // metres of height between your feet and a belt's deck, up or down
export const HOLD_S = 0.6;          // how long a closer belt keeps the bin waiting after it last could take plush
const GATHER_S = 0.12;              // a gathered list of belts near a source is reused this long
const KEYS = { hands: '_adT', cart: '_adC', gcart: '_adCg' };   // the autoDump timers a belt that wins holds back (see beltHolds)

const rangeText = (r) => String(+r.toFixed(1));
export function intakeOf(T) {
  const raw = T && T.intakeLevel, l = Number.isInteger(raw) ? Math.max(0, Math.min(RATE.length - 1, raw)) : 0;
  return { level: l, mk: l + 1, range: RANGE[l], rate: RATE[l] };
}
export const owns = (T) => !!(T && T.machines && T.machines.includes('belt'));   // the free base level comes with Conveyor Belts
// a piece that can be pulled onto: the plain belt and ramp tiles (a hose has its own mouth, the rest have their own ways to take plush)
export const eligible = (t) => !!t && t.type === 'belt' && !t.lift && !t.ug && !t.detector && !t.splitter && !t.merger && !t.smart && !t.hose;
export const pullable = (it) => !!it && it.sp !== NEEDLE && it.sp < SPECIAL_MIN;
const deckY = (t) => t.j * C + 0.1 + (t.rise ? 0.3 * Math.sign(t.rise) : 0);
// could a plush enter this tile now (the same two rules accept() applies to a plain belt)
const room = (t) => t.items.length < capOf(1) && !(t.items.length && t.items[t.items.length - 1].t < SPACING - 1e-6);

export const INTAKE_UPGRADE = {
  id: 'beltIntake', cat: 'machine', name: 'Belt Intake', max: RATE.length - 1, cost: PRICE, req: { id: 'belts', lvl: 1 },
  names: RATE.map((r, l) => `Intake Mk${l + 1}: ${r} a second within ${rangeText(RANGE[l])} m`),
  desc: `Plain belt tiles near you pull plush off your hands, then off your cart, like a bin does (the cart can be parked). Conveyor Belts already give you Intake Mk1: ${RATE[0]} plush a second within ${rangeText(RANGE[0])} m, in total for you (not per belt). `
    + `Each level here raises the rate and the reach: ${RATE.map((r, l) => `Mk${l + 1} ${fmt(r)} a second, ${rangeText(RANGE[l])} m`).join('; ')}. A full belt backs up and the pull stops, so a fast intake wants a fast line (Belt Motors and the Mk marks). The One is never pulled. It is always on: nothing to switch.`,
  effect: (t, l) => { t.intakeLevel = l; },
};

// the readout lines of a belt you aim at (catalog_belts.js infoExtra)
export function intakeLines(g, t) {
  if (!eligible(t) || !owns(g.T)) return [];
  const o = intakeOf(g.T), out = [`Pulls up to ${fmt(o.rate)} plush per second from your hands and cart within ${rangeText(o.range)} m`];
  return out;
}

// ---------------------------------------------------------------- per game state
function st(g) {
  let B = g._bi;
  if (!B) B = g._bi = { b: {}, hold: {}, cache: {}, fx: {}, snd: 0, last: 0, sinkAt: {} };
  if (g.time < B.last) { B.b = {}; B.hold = {}; B.cache = {}; B.fx = {}; B.snd = 0; B.sinkAt = {}; }   // the clock went back (a new game): nothing carries over
  B.last = g.time;
  return B;
}
const capFor = (rate) => Math.max(2, rate * 0.25);
// (the whole plush the bucket holds: a little slack for the float error of (now - then) at a big game clock, where a bucket that is exactly 1 token short by 1e-9 would pull a frame late: after 18 hours of play the pulls drifted a frame at a time)
// a token bucket in game seconds: `rate` plush a second, a burst of a quarter second's worth (at least 2)
function refill(bk, now, rate) {
  const cap = capFor(rate);
  if (bk.t === undefined || now < bk.t) { bk.t = now; bk.tokens = cap; return cap; }
  bk.tokens = Math.min(cap, bk.tokens + (now - bk.t) * rate); bk.t = now;
  return bk.tokens;
}

// the per game state (tests read and set the token buckets through it)
export const state = st;
// does a belt that wins hold back this autoDump timer ('_adT' hands, '_adC' cart, '_adCg' the guest's cart)
export function beltHolds(g, key) {
  const B = g._bi; if (!B) return false;
  const h = (B.hold[key] || 0) - g.time;
  return h > 0 && h <= HOLD_S + 0.05;
}

// ---------------------------------------------------------------- finding the belts near a source
// the eligible tiles within reach + 0.6 m, found by reading the cells around the source (or walking all the tiles when there are few), reused for GATHER_S
function gather(g, key, x, y, z, reach) {
  const B = st(g), L = g.logi, now = g.time, c = B.cache[key];
  if (c && c.n === L.tiles.size && c.ord === L.beltOrder && !L.dirty && now >= c.at && now - c.at < GATHER_S && Math.hypot(c.x - x, c.z - z) < 0.5 && Math.abs(c.y - y) < 0.7 && c.reach >= reach) return c.list;
  const list = [], r = reach + 0.6, ci = toI(x), ck = toK(z), cj = toJ(y), nn = Math.ceil(r / C) + 1;
  if (L.tiles.size <= 360) {
    for (const t of L.tiles.values()) if (eligible(t) && Math.abs(cellX(t.i) - x) <= r && Math.abs(cellZ(t.k) - z) <= r) list.push(t);
  } else {
    for (let j = cj - 4; j <= cj + 4; j++) for (let k = ck - nn; k <= ck + nn; k++) for (let i = ci - nn; i <= ci + nn; i++) { const t = L.tiles.get(idx(i, j, k)); if (t && eligible(t)) list.push(t); }
  }
  B.cache[key] = { at: now, n: L.tiles.size, ord: L.beltOrder, x, y, z, reach, list };   // (a line taken down and another laid in the same place with as many tiles, inside the 0.12 s, is a new list: the belt order is rebuilt whenever the tiles change)
  return list;
}
// the tiles of the gathered list that are within range now, nearest first: [{ t, d }]
function near(g, key, x, y, z, range) {
  const L = g.logi, out = [];
  for (const t of gather(g, key, x, y, z, range)) {
    if (L.tiles.get(idx(t.i, t.j, t.k)) !== t) continue;   // taken down or replaced since the list was made
    const dy = y - deckY(t); if (dy < -REACH_V || dy > REACH_V) continue;
    const d = Math.hypot(cellX(t.i) - x, cellZ(t.k) - z); if (d > range) continue;
    out.push({ t, d });
  }
  if (out.length > 1) out.sort((a, b) => a.d - b.d || a.t.id - b.t.id);
  return out;
}
// how far the nearest place that sucks plush in (the bin, a depot, a sorting box) is, or Infinity when none is in the autoDump reach (read only)
function sinkDist(g, x, y, z, range) {
  const s = g.nearestSink(x, y, z, range); if (!s) return Infinity;
  return s.kind === 'sorter' ? Math.hypot(x - s.x, z - s.z, (y - (s.y - 0.6)) * 0.5) : Math.hypot(x - s.x, z - s.z);
}
function cartSinkDist(g, c, range) {
  const r = BINS.resolve(g, c.dest);
  if (r.bin) { const d = Math.hypot(c.x - r.bin.x, c.z - r.bin.z); return d < range ? d : Infinity; }
  return sinkDist(g, c.x, c.y + 0.5, c.z, range);
}
const lastPullable = (arr) => { for (let q = arr.length - 1; q >= 0; q--) if (pullable(arr[q])) return q; return -1; };

// ---------------------------------------------------------------- the pull
// a thin ring that closes in on the tile being fed: one per source (hands, cart, the guest's cart), reused, faded out in 0.3 s
let ringGeo = null;
function ring(g, B, key, tile) {
  const r = B.rings || (B.rings = {});
  let m = r[key];
  if (!m) {
    if (!ringGeo) { ringGeo = new THREE.RingGeometry(0.2, 0.27, 28); ringGeo.rotateX(-Math.PI / 2); }
    m = r[key] = { mesh: new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.0, 3.0), transparent: true, opacity: 0, depthWrite: false, toneMapped: false })), life: 0 };
    m.mesh.visible = false; m.mesh.renderOrder = 9; g.logi.root.add(m.mesh);
  }
  if (m.mesh.parent !== g.logi.root) g.logi.root.add(m.mesh);   // (a new world builds a new belt group)
  m.mesh.position.set(cellX(tile.i), tile.j * C + 0.14 + (tile.rise ? 0.3 * Math.sign(tile.rise) : 0), cellZ(tile.k)); m.mesh.rotation.y = 0; m.life = 0.32; m.mesh.visible = true;
}
function rings(B, dt) {
  if (!B.rings) return;
  for (const k in B.rings) {
    const m = B.rings[k]; if (m.life <= 0) continue;
    m.life -= dt; const f = Math.max(0, m.life / 0.32);
    m.mesh.scale.setScalar(0.6 + 1.1 * f); m.mesh.material.opacity = 0.85 * f;
    if (m.life <= 0) m.mesh.visible = false;
  }
}
function effects(g, B, key, src, tile, n) {
  const now = g.time, V = THREE.Vector3;
  if (n === 0) ring(g, B, key, tile);
  if (!g.S.beltIntakeTold) { g.S.beltIntakeTold = true; const o = intakeOf(g.T); g.ui.hint(`A belt close to you pulls plush off your hands and cart (up to ${fmt(o.rate)} a second within ${rangeText(o.range)} m).`, 4); }
  const tx = cellX(tile.i), ty = tile.j * C + 0.2, tz = cellZ(tile.k);
  if (g.fliers && g.fliers.length < 80 && n < 4) g.fliers.push({ sp: src.sp, vr: src.vr, from: new V(src.fx, src.fy, src.fz), to: new V(tx, ty, tz), t: -n * 0.02, dur: 0.28, arc: 0.45 });
  if (!(B.fx[key] > now)) { B.fx[key] = now + 0.25; g.fx.sparkle(tx, ty + 0.15, tz, 2, 0.4, 0.8, 0.9); }
  if (!(B.snd > now)) { B.snd = now + 0.22; actSound(g, { x: tx, y: ty, z: tz }, 'soft').soft(0.05); }
}

// move up to `budget` plush from src.arr onto the nearest tiles that take them. src: { key, arr, x, y, z, sinkD (the nearest bin, or Infinity), fx/fy/fz (where fliers start) }
// Returns { moved, winner } where winner says a belt that is closer than the bin has room, so the bin waits.
function pullSource(g, B, src, budget, cands) {
  if (!cands.length) return { moved: 0, winner: false };
  if (src.sinkD !== undefined ? src.sinkD <= cands[0].d : false) return { moved: 0, winner: false };   // the bin is as close or closer: it wins and autoDump does its work
  let winner = false, moved = 0, p = 0;
  for (const c of cands) if (room(c.t)) { winner = true; break; }   // (a tile that cannot take a plush now, full or jammed with plush too close together, does not hold the bin back)
  const L = g.logi;
  while (moved < budget && p < cands.length) {
    const qi = lastPullable(src.arr); if (qi < 0) break;
    const tile = cands[p].t, it = src.arr[qi];
    if (L.accept(tile, it, null)) {
      src.arr.splice(qi, 1); moved++;
      if (src.dex && g.S.dex[it.sp] === undefined) g.registerDex(it.sp, true);   // only a species you have never seen: every pickup counted it already, and a second count would make a new species look old to a Fresh gate
      effects(g, B, src.key, { sp: it.sp, vr: it.vr, fx: src.fx, fy: src.fy, fz: src.fz }, tile, moved - 1);
    } else p++;
  }
  return { moved, winner };
}

// a cart that was sent to a particular bin (and that bin works) keeps its load for that bin: a belt next to it would take plush away from where you told it to go
const sentToBin = (g, c) => !!c.dest && !!BINS.resolve(g, c.dest).bin;
const handsOk = (g) => { const k = g.curTool().kind; return k === 'hands' || k === 'hammer'; };

export function update(g, dt) {
  if (g.mode !== 'play' || g.dead) return;
  const T = g.T; if (!owns(T)) return;
  const B = st(g), S = g.S, now = g.time, guest = g.isGuest(), inf = intakeOf(T);
  rings(B, dt);
  if (!guest && g.net && g.net.open && g.net.role === 'guest') return;   // a guest that has not finished joining has no world of its own yet
  if (S.beltIntakeOff !== undefined) delete S.beltIntakeOff;   // the old on/off switch is gone: a save that carries it is cleaned and ignored
  const wantHands = S.carry.length > 0 && !g.blacking && handsOk(g) && !g.ui.isModalOpen() && lastPullable(S.carry) >= 0;   // (out cold from dust or air: whatever you carry spills in the tunnel, nothing leaves your hands first)
  const hostCart = !guest && S.cart && S.cart.load.length > 0 && !sentToBin(g, S.cart) && lastPullable(S.cart.load) >= 0;
  const guestCart = !guest && S.gcart && S.gcart.load.length > 0 && !sentToBin(g, S.gcart) && g.net && g.net.open && lastPullable(S.gcart.load) >= 0;
  if (!wantHands && !hostCart && !guestCart) return;
  if (!g.logi.tiles.size) return;
  const cam = g.renderer.camera.position, p = g.player.pos;
  const fw = g.player.forward(B.fw || (B.fw = new THREE.Vector3())), hx = cam.x + fw.x * 0.5, hy = cam.y - 0.6, hz = cam.z + fw.z * 0.5;   // where a plush leaves your hands: just ahead of you, not inside the camera
  // hands
  if (wantHands) {
    const bk = guest ? (B.b.gl || (B.b.gl = {})) : (B.b.host || (B.b.host = {}));
    refill(bk, now, inf.rate);
    const near0 = near(g, 'h', p.x, p.y, p.z, inf.range);
    if (near0.length) {
      const sd = B.sinkAt.h && B.sinkAt.h.at > now - 0.15 ? B.sinkAt.h.d : (B.sinkAt.h = { at: now, d: sinkDist(g, p.x, p.y + 1, p.z, T.autoDump) }).d;
      if (sd > near0[0].d) {
        if (guest) guestHands(g, B, bk, near0, hx, hy, hz);
        else {
          const src = { key: 'h', arr: S.carry, x: p.x, y: p.y, z: p.z, range: inf.range, sinkD: sd, fx: hx, fy: hy, fz: hz, dex: true };
          const r = pullSource(g, B, src, Math.floor(bk.tokens + 1e-6), near0);
          if (r.moved) { bk.tokens -= r.moved; g.ui.setCarry(S.carry, T.carry); g.heldPop = -0.5; }
          if (r.winner || r.moved) B.hold[KEYS.hands] = now + HOLD_S;
        }
      }
    }
  }
  // carts (the host runs both: its own and the guest's)
  if (hostCart) cartPull(g, B, S.cart, 'host', 'c', KEYS.cart, inf, T, now);
  if (guestCart) cartPull(g, B, S.gcart, 'guest', 'cg', KEYS.gcart, inf, T, now);
}

function cartPull(g, B, c, who, key, holdKey, inf, T, now) {
  const bk = B.b[who] || (B.b[who] = {});
  refill(bk, now, inf.rate);
  const near0 = near(g, key, c.x, c.y, c.z, inf.range); if (!near0.length) return;
  const sd = B.sinkAt[key] && B.sinkAt[key].at > now - 0.15 ? B.sinkAt[key].d : (B.sinkAt[key] = { at: now, d: cartSinkDist(g, c, Math.max(3.2, T.autoDump * 0.8)) }).d;
  if (sd <= near0[0].d) return;
  const src = { key, arr: c.load, x: c.x, y: c.y, z: c.z, range: inf.range, sinkD: sd, fx: c.x, fy: c.y + 0.7, fz: c.z, dex: true };
  const r = pullSource(g, B, src, Math.floor(bk.tokens + 1e-6), near0);
  if (r.moved) bk.tokens -= r.moved;
  if (r.winner || r.moved) B.hold[holdKey] = now + HOLD_S;
}

// the guest's own hands: the belt is found on the guest's screen and each plush is sent as a `feed` (the host re-checks it and hands it back when it refuses)
function guestHands(g, B, bk, cands, hx, hy, hz) {
  const S = g.S, now = g.time; let n = Math.floor(bk.tokens + 1e-6), moved = 0, ptr = 0;
  const pend = new Set();
  let winner = false; for (const c of cands) if (room(c.t)) { winner = true; break; }   // (a tile that cannot take a plush now, full or jammed with plush too close together, does not hold the bin back)
  while (moved < n && ptr < cands.length) {
    const qi = lastPullable(S.carry); if (qi < 0) break;
    const tile = cands[ptr].t;
    if (!pend.has(tile.id) && room(tile)) {
      const it = S.carry.splice(qi, 1)[0]; pend.add(tile.id); moved++;
      g.cmd('feed', { id: tile.id, sp: it.sp, vr: it.vr, pull: 1 });
      effects(g, B, 'h', { sp: it.sp, vr: it.vr, fx: hx, fy: hy, fz: hz }, tile, moved - 1);
    } else ptr++;
  }
  if (moved) { bk.tokens -= moved; g.ui.setCarry(S.carry, g.T.carry); g.heldPop = -0.5; }
  if (winner || moved) B.hold[KEYS.hands] = now + HOLD_S;
}

// ---------------------------------------------------------------- the host side of a guest's `feed`
// A plush the guest sends onto a belt: it must come from a guest who is near the belt, within the rate the guest may feed, and be a real species. What the host refuses goes back to the guest's hands.
// Anything that is not a belt keeps the old rule (a sorting box takes what it is sent).
export function hostFeed(g, d) {
  const L = g.logi, t = d && L.byId.get(d.id); if (!t) return false;
  const sp = d.sp, vr = d.vr;
  if (!Number.isInteger(sp) || !Number.isInteger(vr) || !species[sp]) return false;    // junk: dropped, nothing comes back
  if (sp === NEEDLE) return false;                                                      // The One is never in a guest's hands (finding it ends the hunt on the spot), so a feed that names it is forged
  const item = { sp, vr };
  const special = sp >= SPECIAL_MIN;
  if (t.type === 'sorter') return sorterFeed(g, t, item, special);                       // autoDump and a hand drop: what a sorting box takes from a guest standing near it
  if (t.type !== 'belt') return false;                                                  // a vault, a generator or a charger takes plush by hand over (`hand`), never by feed
  if (special && d.pull) return false;                                                  // a pull never carries a special id
  const back = () => { if (!special) g.netSend({ t: 'give', items: [{ sp, vr }] }); return false; };
  const B = st(g), rp = g.remote && g.remote.pos, now = g.time;
  if (!(g.net && g.net.open) || !rp) return back();
  const o = intakeOf(g.T), reach = d.pull ? o.range : 3.0;
  if (d.pull && !owns(g.T)) return back();
  if (!(Math.hypot(rp.x - cellX(t.i), rp.z - cellZ(t.k)) <= reach + SLACK)) return back();   // (written so that a position that is not a number never passes)
  const dy = rp.y - deckY(t); if (!(dy >= -REACH_V - SLACK && dy <= REACH_V + SLACK)) return back();
  if (d.pull && !eligible(t)) return back();
  const bk = d.pull ? (B.b.guest || (B.b.guest = {})) : (B.b.gman || (B.b.gman = {}));
  const rate = d.pull ? o.rate : MANUAL_RATE;
  refill(bk, now, rate);
  if (bk.tokens < 1) return back();
  if (!L.accept(t, { sp, vr }, null)) return back();
  bk.tokens -= 1;
  return true;
}
// a guest's plush into a sorting box: from a guest that is near it (the autoDump reach, or a hand drop), and what the box refuses goes back to the guest
function sorterFeed(g, t, item, special) {
  const rp = g.remote && g.remote.pos, back = () => { if (!special) g.netSend({ t: 'give', items: [{ sp: item.sp, vr: item.vr }] }); return false; };
  if (!(g.net && g.net.open) || !rp) return back();
  const reach = Math.max(g.T.autoDump || 0, 3.0) + SLACK;
  if (!(Math.hypot(rp.x - cellX(t.i), rp.z - cellZ(t.k), (rp.y + 1 - t.j * C) * 0.5) <= reach)) return back();
  if (!g.logi.accept(t, item, null)) return back();
  return true;
}
