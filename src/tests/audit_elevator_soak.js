// elev.audit.soak.*: seeded random use of two elevators in one pile. Plush falls into and is dug out of the shafts, frames are stacked and hammered, tunnels (landings) are dug and filled,
// belts are laid in the shaft, power flickers, the cab is called, ridden by the real player with a cart and plush, hammered and set again, and the world is really saved and loaded in the
// middle of it. After every step: the cabs never stand in anything, the reserved cells are exactly the cab boxes, the stops are real and sorted, a rider is on the floor of the cab,
// the pack never gains or loses an elevator, and no text says NaN. When it is all dug out and the cabs are taken down nothing is left reserved.
import { kit } from './transit_lib.js';
import * as TR from '../transit.js';
import { infoFor } from '../info.js';
import { loadSaved } from '../state.js';
import { idx } from '../config.js';

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export default async function (ctx) {
  const { T, g, S, w, p, adv, craft, toI, toK, clearBodies } = ctx;
  const X = kit(ctx), C = 0.6;
  const guard = (name, fn) => T(name, async () => { const h0 = g.ui.hint; try { return await fn(); } finally { g.ui.hint = h0; delete g.netSend; g.net.open = false; g.net.role = null; X.clean(); g.dead = false; g.blacking = false; g.hp = g.hpMax; } });   // (a rider who fell down a shaft must not leave the next test dead)
  const LI = () => toI(-6), LK = () => toK(3);
  const text = (e) => infoFor(g, { kind: 'mach', id: e.id }).lines.join(' | ');

  for (const seed of globalThis.__soakSeeds || [7, 20261007, 99]) await guard(`elev.audit.soak.two-elevators-random-use-seed-${seed}`, async () => {
    X.setup(); const R = rng(seed), bad = [], h0 = g.ui.hint; g.ui.hint = () => {}; g.net.open = true; g.net.role = 'host'; g.netSend = () => {};
    const A = X.lift(LI(), LK(), { home: 30, depth: 24, top: 38 }), B = X.lift(LI() + 14, LK(), { home: 24, depth: 20, top: 34 });
    X.tunnel(A, 30, 1, 5); X.tunnel(A, 18, 0, 4); X.tunnel(B, 12, 2, 4); for (const L of [A, B]) { TR.refreshShaft(g, L); L.ex = L.tr; }
    const grids = [X.powerCab(A, 2), X.powerCab(B, 2)]; adv(0.7);
    const ids = [A.id, B.id], homeOf = { [A.id]: 30, [B.id]: 24 }, depthOf = { [A.id]: 24, [B.id]: 20 };
    const lifts = () => ids.map((id) => { const it = g.machines.items.get(id); return it ? it.ent : null; }).filter(Boolean);
    const base = new Set(w().reserved), put = (i, j, k) => { if (!w().get(i, j, k)) { X.poke(i, j, k, 2, 0); return true; } return false; };
    const pack0 = (S().items.plift || 0) + lifts().length;
    const frameSlots = new Map();   // `${id}:${row}` -> frame ent id
    for (const e of S().entities) if (e.type === 'frame') { for (const L of lifts()) if (Math.abs(e.cx - L.px) < 0.1 && Math.abs(e.cz - L.pz) < 0.1) frameSlots.set(L.id + ':' + Math.round(e.y0 / C), e.id); }
    const belts = [], hits = { ambush: 0, fill: 0, dig: 0, frame: 0, tunnel: 0, belt: 0, power: 0, call: 0, ride: 0, hammer: 0, save: 0, cart: 0, sim: 0, rideGo: 0, blocked: 0 };
    const cellsOf = (L) => { const out = []; for (let r = L.j - depthOf[L.id]; r < L.j + 3; r++) for (let n = 0; n < 4; n++) out.push([L.i0 + n, r, L.k0 + ((n * 3 + r) & 3)]); return out; };
    const boxOf = (L) => TR.TS.rv.get(L.id);
    const pick = (a) => a[Math.floor(R() * a.length)], live = (t) => g.logi.byId.get(t.id) || t;
    let board = 0; void board;
    const AMBUSH = (L) => { const fl = TR.floorsOf(g, L), far = Math.abs(fl[0] * C - L.cy) > Math.abs(fl[fl.length - 1] * C - L.cy) ? fl[0] : fl[fl.length - 1]; TR.requestFloor(g, L, far); adv(0.1 + R() * 0.5);
      if (L.mv) { const rv = boxOf(L), ahead = L.mv < 0 ? rv[0] - 1 - Math.floor(R() * 5) : rv[1] + 1 + Math.floor(R() * 3); const i = L.i0 + Math.floor(R() * 4), k = L.k0 + Math.floor(R() * 4); if (ahead >= 0 && ahead < L.j + 4 && !w().get(i, ahead, k) && !(g.logi.tiles.has(idx(i, ahead, k)))) { X.poke(i, ahead, k, 2, 0); hits.ambush++; } } };
    const check = (step, what) => {
      const Ls = lifts(), want = new Set();
      for (const L of Ls) {
        const tag = `step ${step} (${what}) lift ${L.id === ids[0] ? 'A' : 'B'}`;
        if (!Number.isFinite(L.cy) || L.cy < -1e-9 || L.cy > homeOf[L.id] * C + 1e-9) { bad.push(`${tag}: cy ${L.cy}`); continue; }
        if (!(L.ex >= 0 && L.ex <= 72 && L.tr >= 0 && L.tr <= 72)) bad.push(`${tag}: ex ${L.ex} tr ${L.tr}`);
        const rv = boxOf(L), lo = Math.floor(L.cy / C + 1e-6), hi = Math.ceil(L.cy / C - 1e-6) + 3;
        if (!rv || rv[0] !== lo || rv[1] !== hi) { bad.push(`${tag}: reserved box ${JSON.stringify(rv)} vs rows ${lo}..${hi}`); continue; }
        for (const [i, j, k] of TR.liftCells(L, lo, hi)) { want.add(idx(i, j, k)); if (!w().reserved.has(idx(i, j, k))) { bad.push(`${tag}: cell ${i},${j},${k} of the cab is not reserved`); break; } }
        for (let r = lo; r <= hi; r++) { const b = TR.rowBlock(g, L, r); if (b) { bad.push(`${tag}: the cab is inside ${b} at row ${r} (cab ${L.cy.toFixed(2)})`); break; } }
        const fl = TR.floorsOf(g, L); for (let q = 0; q < fl.length; q++) { if (!Number.isInteger(fl[q]) || fl[q] < 0 || fl[q] > L.j || (q && fl[q] <= fl[q - 1])) { bad.push(`${tag}: stops ${fl}`); break; } }
        if (!fl.includes(L.j)) bad.push(`${tag}: the home stop is missing from ${fl}`);
        if (p().liftId === L.id && Math.abs(p().pos.y - L.cy) > 0.03) bad.push(`${tag}: the rider is at ${p().pos.y.toFixed(2)} on a cab at ${L.cy.toFixed(2)}`);
        let t; try { t = text(L); } catch (x) { bad.push(`${tag}: the readout threw ${x.message}`); continue; } if (/NaN|undefined|Infinity|[—–]/.test(t)) bad.push(`${tag}: bad readout ${t.slice(0, 160)}`);
        if (L.q.length > TR.LIFT_QUEUE) bad.push(`${tag}: queue ${L.q.length}`); if (L.tg !== null && !Number.isInteger(L.tg)) bad.push(`${tag}: tg ${L.tg}`);
        if (TR.kwOf(L) !== 0 && TR.kwOf(L) !== 6) bad.push(`${tag}: draws ${TR.kwOf(L)} kW`);
      }
      // the reserved cells that are not the world's own or a belt's are exactly the cab boxes
      const extra = [...w().reserved].filter((k) => !base.has(k) && !g.logi.tiles.has(k)), missing = [...want].filter((k) => !w().reserved.has(k)), strays = extra.filter((k) => !want.has(k));
      if (strays.length) bad.push(`step ${step} (${what}): ${strays.length} reserved cells that belong to no cab`); if (missing.length) bad.push(`step ${step} (${what}): ${missing.length} cab cells are not reserved`);
      if ((S().items.plift || 0) + Ls.length !== pack0) bad.push(`step ${step} (${what}): the elevators in the pack and the world are ${(S().items.plift || 0) + Ls.length}, were ${pack0}`);
    };
    let step = 0;
    const N = 150;
    for (; step < N && bad.length < 5; step++) {
      const Ls = lifts(); if (!Ls.length) break;   // (both were taken down and the spots were no longer free)
      const L = pick(Ls), op = R(); let what;
      if (R() < 0.1) { what = 'ambush'; AMBUSH(L); }
      else if (op < 0.2) { what = 'fill'; const [i, r, k] = pick(cellsOf(L)), rv = boxOf(L); if (!(rv && r >= rv[0] && r <= rv[1] && !w().get(i, r, k))) { if (put(i, r, k)) hits.fill++; } else hits.blocked++; }
      else if (op < 0.32) { what = 'dig'; const cs = cellsOf(L).filter(([i, r, k]) => w().get(i, r, k)); if (cs.length) { const [i, r, k] = pick(cs); X.poke(i, r, k, 0, 0); hits.dig++; } if (R() < 0.3) for (const [i, r, k] of cellsOf(L)) if (w().get(i, r, k) && R() < 0.6 && (r < L.j)) X.poke(i, r, k, 0, 0); }
      else if (op < 0.4) { what = 'frame'; const d0 = depthOf[L.id], slot = L.j - d0 + 4 * Math.floor(R() * (d0 / 4)), key = L.id + ':' + slot, fid = frameSlots.get(key);
        if (fid && R() < 0.7) { const fe = S().entities.find((e) => e.id === fid); if (fe) { X.decon(fe); w().supports = w().supports.filter((s) => s.id !== fid); } frameSlots.delete(key); hits.frame++; }
        else if (!fid) { try { const ent = X.frame(L, slot); frameSlots.set(key, ent.id); hits.frame++; } catch (x) { bad.push('a frame could not be set: ' + x.message); } } }
      else if (op < 0.47) { what = 'tunnel'; const row = pick([30, 24, 18, 12, 9]), r2 = Math.min(row, L.j), side = Math.floor(R() * 4); if (R() < 0.6) X.tunnel(L, r2, side, 3 + Math.floor(R() * 3)); else for (let d = 0; d < 3; d++) for (let u = 0; u < 4; u++) for (let rr = r2; rr < r2 + 4; rr++) { const [i, k] = side === 0 ? [L.i0 + 4 + d, L.k0 + u] : side === 2 ? [L.i0 - 1 - d, L.k0 + u] : side === 1 ? [L.i0 + u, L.k0 + 4 + d] : [L.i0 + u, L.k0 - 1 - d]; if (!w().get(i, rr, k) && !g.logi.tiles.has(idx(i, rr, k))) X.poke(i, rr, k, 2, 0); } hits.tunnel++; }
      else if (op < 0.52) { what = 'belt'; const cs = cellsOf(L); const [i, r, k] = pick(cs); const why = g.logi.canPlace(i, r, k), rv = boxOf(L);
        const served = r >= L.j - (L.tr || 0) && r <= L.j + 3, inBox = rv && r >= rv[0] && r <= rv[1];
        if ((served || inBox) && !w().get(i, r, k) && !why) bad.push(`step ${step}: a belt may be set at ${i},${r},${k} inside the served shaft or the cab (reach ${L.tr}, cab rows ${rv})`);
        if (!w().get(i, r, k) && !g.logi.cellTaken(i, r, k) && !served && belts.length < 6) { const t = { id: g.nextId(), type: 'belt', i, j: r, k, dir: 0, rise: 0, items: [] }; g.logi.add(t); belts.push(t); hits.belt++; }
        else if (belts.length && R() < 0.5) { const t = belts.pop(); g.logi.remove(t); } }
      else if (op < 0.58) { what = 'power'; const G = grids[ids.indexOf(L.id)]; const on = live(G.gens[0]).burn > 0; for (const t0 of G.gens) { const t = live(t0); t.burn = on ? 0 : 1e5; t.lit = !on; } g.power.markDirty(); hits.power++; }
      else if (op < 0.72) { what = 'call'; const fl = TR.floorsOf(g, L); const row = R() < 0.85 ? pick(fl) : Math.floor(R() * 40); TR.requestFloor(g, L, row); hits.call++; }
      else if (op < 0.78) { what = 'go'; if (p().liftId === L.id) { const why = TR.rideGo(g, L, pick([-1, 0, 1])); void why; hits.rideGo++; } else { TR.rideGo(g, L, pick([-1, 0, 1])); hits.rideGo++; } }
      else if (op < 0.86) { what = 'ride'; if (p().liftId) { p().pos.set(L.px + 8, L.cy, L.pz + 8); p().vel.set(0, 0, 0); } else { p().pos.set(L.px + (R() - 0.5), L.cy, L.pz + (R() - 0.5)); p().vel.set(0, 0, 0); board++; } hits.ride++; }
      else if (op < 0.9) { what = 'cart'; S().cart = { tier: 1, x: L.px + 0.5, y: L.cy, z: L.pz + 0.4, yaw: 0, mode: 'park', load: [] }; g.cart.sync(); hits.cart++; }
      else if (op < 0.93) { what = 'sim'; g.sim.spawn(2, 0, L.px + (R() - 0.5) * 2, L.cy < L.j * C - 4 ? L.cy + 3 + R() : L.cy + 1.0, L.pz + (R() - 0.5) * 2, 0, 0, 0, 0); hits.sim++; }
      else if (op < 0.96) { what = 'hammer'; X.decon(L);
        if (!g.machines.items.has(L.id)) { const home = homeOf[L.id]; const spot = { i0: L.i0, k0: L.k0 }; if (TR.conflictLift(g, { i0: L.i0, k0: L.k0, j: home })) { ids[ids.indexOf(L.id)] = -1; hits.hammer++; if (p().liftId === L.id) p().liftId = 0; adv(0.2); check(step, 'hammer, not set again'); continue; } const fresh = X.make('plift', { i0: spot.i0, k0: spot.k0, j: home, cy: home * C, tg: null, q: [], dw: 0, dr: 1, tr: 0, ex: 0, rid: 'plift' }); S().items.plift = (S().items.plift || 0) - 1; { const GG = grids[ids.indexOf(L.id)]; if (GG) { S().items.cable = (S().items.cable || 0) + 1; g.cables.connect(GG.pole.id, fresh.id); } }   /* a lift set again runs on a new cable to the same pole */ ids[ids.indexOf(L.id)] = fresh.id; homeOf[fresh.id] = home; depthOf[fresh.id] = depthOf[L.id]; for (const [key, v] of [...frameSlots]) if (key.startsWith(L.id + ':')) { frameSlots.delete(key); frameSlots.set(fresh.id + ':' + key.split(':')[1], v); } }
        if (p().liftId === L.id) p().liftId = 0; hits.hammer++; }
      else { what = 'save'; if (hits.save < 2 && step > 20) {
          g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) { bad.push('save failed'); break; }
          const before = lifts().map((e) => JSON.stringify({ id: e.id, cy: e.cy, tr: e.tr, ex: e.ex, cut: e.cut, sg: e.sg, q: e.q }));
          const sv = loadSaved(); g.loadWorld(sv.S, sv); g.noSave = true; g.mode = 'play'; g.net.open = true; g.net.role = 'host'; g.netSend = () => {}; g.ui.hint = () => {};
          const after = lifts().map((e) => JSON.stringify({ id: e.id, cy: e.cy, tr: e.tr, ex: e.ex, cut: e.cut, sg: e.sg, q: e.q })); hits.save++;
          if (after.length !== before.length) bad.push(`step ${step}: ${before.length} elevators before the load and ${after.length} after`);
          else for (let q = 0; q < before.length; q++) { const a = JSON.parse(before[q]), b = JSON.parse(after[q]); if (a.id !== b.id || Math.abs(a.cy - b.cy) > 1e-9 || a.tr !== b.tr || a.cut !== b.cut) bad.push(`step ${step}: a load changed an elevator: ${before[q]} -> ${after[q]}`); }
        } }
      adv(0.05 + R() * (op < 0.72 ? 0.9 : 0.4)); g.hp = g.hpMax; g.dead = false;
      if (R() < 0.35) { adv(0.55); g.hp = g.hpMax; g.dead = false; }
      check(step, what);
    }
    clearBodies();   // the loose plush the soak spawned would settle into the shaft the moment it was dug out
    // everything dug out and settled: every shaft is served to the bottom of what the frames shore, nothing is cut, and nothing is queued for ever
    for (const b of belts) g.logi.remove(b);
    for (const G of grids) for (const t0 of G.gens) { const t = live(t0); t.burn = 1e5; t.lit = true; } g.power.markDirty(); p().liftId = 0; if (lifts()[0]) p().pos.set(lifts()[0].px + 9, 0, lifts()[0].pz + 9); S().cart = null; g.cart.sync();
    // digging the shaft clean wakes the real stability code, which may let a roof beside it go and drop plush into the shaft again: dig again until it holds (at most four rounds)
    for (let round = 0; round < 4; round++) {
      clearBodies(); for (const L of lifts()) for (let r = L.j - depthOf[L.id]; r < L.j + 4; r++) for (let n = 0; n < 16; n++) { const i = L.i0 + (n & 3), k = L.k0 + (n >> 2); if (w().get(i, r, k)) w().setCell(i, r, k, 0, 0); }
      adv(12); if (lifts().every((L) => !L.cut && !TR.rowBlock(g, L, L.j - 1))) break;
    }
    for (const L of lifts()) { if (L.cut || L.mv || L.tg !== null || L.q.length) bad.push(`after the soak: lift ${L.id} cut ${L.cut} mv ${L.mv} tg ${L.tg} q ${L.q} tr ${L.tr} why ${L.wy} at row ${L.wr}: ${TR.rowBlock(g, L, L.wr) || TR.rowBlock(g, L, L.cut - 1)} cy ${L.cy}`); const sc = TR.scanShaft(g, L, Math.floor(L.cy / C + 1e-6)); if (sc.tr !== L.tr) bad.push(`after the soak: the scan says ${sc.tr} rows and the elevator ${L.tr}`); if (!TR.floorsOf(g, L).some((r) => Math.abs(r * C - L.cy) < 0.02)) bad.push('after the soak: the cab is between stops ' + L.cy); }
    for (const L of lifts()) X.decon(L); const left = [...w().reserved].filter((k) => !base.has(k) && !g.logi.tiles.has(k)); if (left.length) bad.push(`${left.length} reserved cells were left behind`);
    const total = Object.values(hits).reduce((a, b) => a + b, 0); if (step >= N && (total < 40 || hits.call < 6 || hits.fill < 3)) bad.push('the soak did too little: ' + JSON.stringify(hits));
    g.ui.hint = h0; return bad.length === 0 || bad.slice(0, 6).join(' || ');
  });
}
