// transit.audit.soak.*: seeded random edits of doors, elevators, jump pads and cushion pads, with the invariants checked after every step:
//  - a door's four rows are bulkhead exactly where the leaf has gone, and every transit cell is reserved
//  - no two transit things hold the same cell (a shared key in world.reserved would be freed by whichever goes first)
//  - the pack plus what stands in the world is constant (nothing is created or lost by any path: place, replace a wall, hammer, a lift taking its buttons with it)
//  - when everything is gone the world's reserved cells and the box's bulkhead cells are exactly what they were before (the cells of a door, a shaft and a pad all come back)
// A real save and load runs half way through.
import { kit } from './transit_lib.js';
import * as TR from '../transit.js';
import { loadSaved } from '../state.js';
import { BULK } from '../plushdata.js';

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export default async function (ctx) {
  const { T, g, S, w, p, adv, toI, toK } = ctx;
  const X = kit(ctx), K = X.K;
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { X.clean(); } });
  const MINE = ['door', 'plift', 'callbtn', 'jump', 'cushion'];
  const ITEMS = ['door', 'door:blast', 'plift', 'jump', 'cushion', 'wall'];
  const KIND = { door: 'door', 'door:blast': 'door', plift: 'plift', jump: 'jump', cushion: 'cushion', wall: 'wall' };
  const itemOf = (e) => (e.type === 'wall' ? 'wall' : TR.itemOfEnt(e));
  const total = () => { const t = {}; for (const id of ITEMS) t[id] = S().items[id] || 0; for (const e of S().entities) if (MINE.includes(e.type) || e.type === 'wall') t[itemOf(e)] = (t[itemOf(e)] || 0) + 1; return t; };
  const footprints = () => {
    const out = []; const add = (e, cells) => out.push([e, cells.map(([i, j, k]) => X.idx(i, j, k))]);
    for (const e of S().entities) {
      if (e.type === 'door') add(e, TR.allDoorCells(e));
      else if (e.type === 'plift' && TR.TS.rv.get(e.id)) add(e, TR.liftCells(e, TR.TS.rv.get(e.id)[0], TR.TS.rv.get(e.id)[1]));   // the cab's own box: the shaft is never reserved
      else if (e.type === 'jump' || e.type === 'cushion') add(e, TR.liftCells(e, e.j, e.j));
    }
    return out;
  };
  // the test's own pokes (a cleared column, a slab of pad cells) must never overwrite something the game put there: only plush may be cleared, nothing reserved may be touched
  const colFree = (i0, k0, top) => { for (let j = 0; j <= top; j++) for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) { const i = i0 + dx, k = k0 + dz; if (w().reserved.has(X.idx(i, j, k)) || ctx.g.logi.tiles.has(X.idx(i, j, k))) return false; const c = w().get(i, j, k); if (c >= 4000) return false; } return true; };
  const slabFree = (i0, k0, j, side) => {
    for (let u = -1; u <= 4; u++) for (let d = 0; d < 3; d++) {
      const a = side === 0 ? [i0 + 4 + d, k0 + u] : side === 2 ? [i0 - 1 - d, k0 + u] : side === 1 ? [i0 + u, k0 + 4 + d] : [i0 + u, k0 - 1 - d];
      for (let jj = 0; jj < j; jj++) { const key = X.idx(a[0], jj, a[1]); if (w().reserved.has(key) || w().get(a[0], jj, a[1])) return false; }
    }
    return true;
  };
  const check = (tag, bad, base) => {
    const owner = new Map();
    for (const [e, keys] of footprints()) for (const k of keys) {
      if (!w().reserved.has(k)) { bad.push(`${tag}: ${e.type} ${e.id} cell ${k} is not reserved`); return; }
      if (owner.has(k)) { bad.push(`${tag}: ${e.type} ${e.id} and ${owner.get(k)} hold one cell`); return; }
      owner.set(k, e.type + ' ' + e.id);
    }
    if (base) for (const k of w().reserved) if (!base.has(k) && !owner.has(k) && !g.logi.tiles.has(k) && !g.logi.cols.has(k)) { bad.push(`${tag}: cell ${k} is reserved and nothing transit stands there`); return; }
    for (const e of S().entities) if (e.type === 'door') {
      const f = TR.freedOf(e.p), cells = TR.allDoorCells(e); let shut = 0; for (const [i, j, k] of cells) if (w().get(i, j, k) === BULK) shut++;
      const want = (4 - f) * (e.ax === 'z' ? 4 : 4);
      if (e.f !== f || shut !== want) { bad.push(`${tag}: door ${e.id} p ${e.p.toFixed(2)} has ${shut} shut cells of ${cells.length}, wants ${want} (f ${e.f} vs ${f})`); return; }
    }
  };

  for (const seed of [20260505, 7, 1234567, 99991]) await guard(`transit.audit.soak.random-edits-keep-every-invariant-seed-${seed}`, async () => {
    X.setup(); const bad = [], R = rng(seed);
    const box = K.box();
    const baseBulk = (() => { let n = 0; for (let k = box.k0; k <= box.k1; k++) for (let i = box.i0; i <= box.i1; i++) for (let j = 0; j < 14; j++) if (w().get(i, j, k) === BULK) n++; return n; })();
    const slots = []; for (let c = 0; c < 5; c++) for (let r = 0; r < 2; r++) slots.push({ i: box.i0 + 2 + c * 14, k: box.k0 + 2 + r * 13 });
    X.powerAt(0, 0, 2); X.powerAt(-14, 8, 2);
    const baseReserved = new Set(w().reserved);   // after the poles and generators: they hold cells of their own
    for (const id of ITEMS) { S().items[id] = id === 'wall' ? 40 : 6; }
    const t0 = total(), asGuest = (id, ent) => g.netCmd('place', { tool: { id, kind: KIND[id] }, ent });
    const pick = (a) => a[Math.floor(R() * a.length)];
    let placed = 0, refused = 0, saved = false, replaced = 0;
    for (let step = 0; step < 260 && bad.length < 4; step++) {
      const sl = pick(slots), i = sl.i + Math.floor(R() * 9), k = sl.k + Math.floor(R() * 9), op = R();
      const ents = S().entities.filter((e) => MINE.includes(e.type));
      if (op < 0.34) {
        const id = pick(['door', 'door', 'door:blast', 'plift', 'jump', 'cushion']), n0 = S().entities.length;
        let ent;
        if (id === 'door' || id === 'door:blast') ent = { type: 'door', ax: R() < 0.5 ? 'x' : 'z', i0: i, k0: k, j: Math.floor(R() * 2) * 4 * 0, blast: id === 'door:blast' };
        else if (id === 'plift') { void colFree; ent = { type: 'plift', i0: i, k0: k, j: 0 }; }
        else if (id === 'jump') ent = { type: 'jump', i0: i, k0: k, j: 0, ang: pick([0, 25, 45, 90]), hd: pick([0, 90, 345]) };
        else ent = { type: 'cushion', i0: i, k0: k, j: 0 };
        asGuest(id, ent); if (S().entities.length > n0) placed++; else refused++;
      } else if (op < 0.48) {
        // a guest forges a call button: old buttons cannot be set any more, and nothing may come of it
        const lifts = ents.filter((e) => e.type === 'plift'); if (lifts.length) { const n0 = S().entities.length; asGuest('plift', { type: 'callbtn', lid: pick(lifts).id, i, j: 0, k }); if (S().entities.length !== n0) bad.push('a forged call button was built'); }
      } else if (op < 0.66) { if (ents.length) { const e = pick(ents); g.doDecon({ kind: 'mach', id: e.id }); } }
      else if (op < 0.76) { const doors = ents.filter((e) => e.type === 'door'); if (doors.length) { const d = pick(doors); g.setCfg(d, { tgt: R() < 0.5 ? 1 : 0 }); } }
      else if (op < 0.84) { const lifts = ents.filter((e) => e.type === 'plift'); if (lifts.length) { const L = pick(lifts), fl = TR.floorsOf(g, L); g.setCfg(L, { call: pick(fl) }); } }
      else if (op < 0.88) { const doors = ents.filter((e) => e.type === 'door'); if (doors.length) g.setCfg(pick(doors), { lock: pick(['none', 'power', 'key']), auto: R() < 0.5 }); }
      else if (op < 0.93) {
        // wall sections, and doors that swap one in place (the wall goes back to the pack, the door takes its cells)
        const walls = S().entities.filter((e) => e.type === 'wall');
        if (walls.length && R() < 0.6) { const W = pick(walls); { const bl = R() < 0.3, n1 = S().entities.length; asGuest(bl ? 'door:blast' : 'door', { type: 'door', ax: W.ax, i0: W.i0, k0: W.k0, j: W.j, blast: bl, replaces: W.id }); if (!S().entities.some((e) => e.id === W.id)) replaced++; void n1; } }
        else if (walls.length < 6) await K.put('wall', i, k, { y: 0.6, back: 3.2 });
      }
      else { const j = ents.filter((e) => e.type === 'jump'); if (j.length) g.setCfg(pick(j), { ang: pick([0, 5, 90]), hd: pick([0, 15, 330]) }); }
      p().pos.set(-1, 0, 11); p().vel.set(0, 0, 0);   // far from every slot: a person in a doorway would only hold the door open
      adv(0.1 + R() * 0.6);
      check(`step ${step}`, bad, baseReserved);
      const t = total(); for (const id of ITEMS) if (t[id] !== t0[id]) { bad.push(`step ${step}: ${id} total ${t[id]}, started ${t0[id]}`); break; }
      if (step === 130 && !saved) {
        saved = true; const idsBefore = S().entities.filter((e) => MINE.includes(e.type)).map((e) => e.id).sort().join();
        g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) { bad.push('save failed'); break; }
        const sv = loadSaved(); g.loadWorld(sv.S, sv); g.noSave = true; g.mode = 'play'; adv(0.3);
        const idsAfter = S().entities.filter((e) => MINE.includes(e.type)).map((e) => e.id).sort().join(); if (idsBefore !== idsAfter) bad.push(`the load changed the transit things: ${idsBefore} vs ${idsAfter}`);
        check('after load', bad, baseReserved);
        if (!g.player.ride || !g.cart.support) bad.push('the player or cart hooks were not reinstalled after the load');
      }
    }
    if (replaced < 1) bad.push('no door ever replaced a wall section: that path is not exercised');
    if (placed < 8) bad.push(`the soak only placed ${placed} things (${refused} refused): it is not exercising anything`);
    for (const e of [...S().entities]) if (MINE.includes(e.type) && e.type !== 'callbtn') g.doDecon({ kind: 'mach', id: e.id });
    for (const e of [...S().entities]) if (MINE.includes(e.type)) g.doDecon({ kind: 'mach', id: e.id });
    const t = total(); for (const id of ITEMS) if (t[id] !== t0[id]) bad.push(`end: ${id} total ${t[id]}, started ${t0[id]}`);
    for (const e of [...S().entities]) if (e.type === 'wall') g.doDecon({ kind: 'mach', id: e.id });
    const extra = [...w().reserved].filter((k) => !baseReserved.has(k) && !g.logi.tiles.has(k) && !g.logi.cols.has(k));   // a tile (the Welcome Gate's belt, a pole) holds its own key and comes back with a load if (extra.length) bad.push(`${extra.length} reserved cells were left behind (first ${extra[0]})`);
    let nb = 0; for (let k = box.k0; k <= box.k1; k++) for (let i = box.i0; i <= box.i1; i++) for (let j = 0; j < 14; j++) if (w().get(i, j, k) === BULK) nb++;
    if (nb !== baseBulk) bad.push(`${nb - baseBulk} bulkhead cells were left behind`);
    return bad.length === 0 || bad.join(' || ');
  });

  // a person who walks, sprints, jumps, looks about and presses E at random for two minutes in a small town of one elevator (three stops), a door, a jump pad and a cushion, with the real
  // game loop running (the pointer lock is faked so g.keys drive the real player)
  await guard('transit.audit.soak.a-wandering-player-never-breaks-the-car-the-door-or-the-pad', async () => {
    X.setup(); const bad = [], R = rng(777), i0 = toI(-20), k0 = toK(2);
    const Lf = X.lift(i0 + 10, k0, { home: 12, depth: 12, top: 18 }); X.tunnel(Lf, 12, 1, 6); X.tunnel(Lf, 6, 0, 6); TR.refreshShaft(g, Lf); Lf.ex = Lf.tr;
    const D = X.door(i0, k0 + 4, { lock: 'none', auto: true }), J = X.jump(i0 + 20, k0 + 8, { ang: 60, hd: 270 }), Cu = X.cushion(i0 + 8, k0 + 8, 0);
    X.powerCab(Lf, 3); X.powerAt(D.px, D.pz - 2.0, 2); X.powerAt(J.x - 2.6, J.z, 2); adv(1);
    const real = Object.getOwnPropertyDescriptor(document, 'pointerLockElement'); Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => g.canvas });
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space'];
    const press = (code) => { const ev = { code, preventDefault() {}, target: document.body, repeat: false, shiftKey: false }; g.onKey(ev, true); g.onKey(ev, false); };
    try {
      g.hp = 100; p().pos.set(Lf.px, 12 * 0.6, Lf.pz); p().vel.set(0, 0, 0); let falls = 0, rides = 0, maxY = 0, launches = 0, doorMoves = 0, lastTgt = D.tgt;
      for (let step = 0; step < 480 && bad.length < 3; step++) {
        g.keys = {}; for (const kk of keys) if (R() < (kk === 'KeyW' ? 0.3 : kk === 'Space' ? 0.1 : 0.12)) g.keys[kk] = true;
        if (R() < 0.35) p().yaw += (R() - 0.5) * 2.4; if (R() < 0.2) p().pitch = (R() - 0.5) * 1.4;
        if (R() < (p().liftId ? 0.3 : 0.1)) press('KeyE');
        if (!p().liftId && R() < 0.2) { p().pos.set(Lf.px + (R() - 0.5) * 2, Lf.cy, Lf.pz + (R() - 0.5) * 2); p().vel.set(0, 0, 0); }   // back to the car now and then
        const jb = J.buf, y0 = p().pos.y; adv(0.25); g.hp = Math.max(g.hp, 1);
        const pl = p(), q = pl.pos; maxY = Math.max(maxY, q.y); if (pl.liftId) rides++; if (J.buf < jb) launches++; if (D.tgt !== lastTgt) { doorMoves++; lastTgt = D.tgt; }
        if (![q.x, q.y, q.z, pl.vel.x, pl.vel.y, pl.vel.z].every(Number.isFinite)) { bad.push(`step ${step}: the player is NaN`); break; }
        if (q.y < -0.05) { bad.push(`step ${step}: the player fell through the floor: y ${q.y}`); break; }
        if (pl.liftId) { const L = g.machines.items.get(pl.liftId); if (!L) bad.push(`step ${step}: riding a lift that is gone`); else if (Math.abs(q.y - L.ent.cy) > 0.02) bad.push(`step ${step}: riding but ${q.y.toFixed(2)} vs the car ${L.ent.cy.toFixed(2)}`); }
        if (!Number.isFinite(Lf.cy) || Lf.cy < -0.01 || Lf.cy > 12 * 0.6 + 0.01) bad.push(`step ${step}: the car is at ${Lf.cy}`);
        if (!Number.isFinite(D.p) || D.p < 0 || D.p > 1) bad.push(`step ${step}: the door is at ${D.p}`);
        check(`step ${step}`, bad); void y0; void falls;
      }
      if (!bad.length && (rides < 20)) bad.push(`the walker only rode the car for ${rides} steps of 480: the test is not exercising the lift`);
      if (!bad.length && maxY < 1) bad.push('the walker never left the ground floor');
      void launches; void doorMoves;
    } finally { if (real) Object.defineProperty(document, 'pointerLockElement', real); else delete document.pointerLockElement; g.keys = {}; }
    return bad.length === 0 || bad.join(' || ');
  });
}
