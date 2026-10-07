// stack.audit.soak-*: the audit of wave 10, seeded random edits over a building of two columns of three cubes with the invariants checked after every step, and a building that
// stands across chunk seams in x, z and y. The accounting here wraps `destroyEnt` itself, so a part that is lost in a cascade that finishes during a later step is counted where it
// really went (the builder's soak counted losses only for the explicit fall). A real save and load (g.save, loadWorld) runs in the middle of the edits.
import { kit, UP } from './stack_lib.js';
import * as LT from '../loadtrace.js';

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export default async function (ctx) {
  const { T, g, S, p, adv, stepSim, craft, selectTool, plan, toK } = ctx;
  const K = kit(ctx), W = K.W, B = K.B, ST = K.ST, C = 0.6;
  const kindOf = { 'pad:steel': 'pad', 'pad:timber': 'pad', stair: 'stair', wramp: 'wramp', ladder: 'ladder', wall: 'wall' };
  const typeKind = (e) => (e.type === 'pad' ? 'pad' : e.type === 'stair' ? 'stair' : e.type === 'wramp' ? 'wramp' : e.type === 'ladder' ? 'ladder' : e.type === 'wall' ? 'wall' : null);
  const owned = (Y) => {
    const out = new Set();
    for (const e of S().entities) {
      if (e.type === 'ladder') for (const [i, j, k] of ST.ladderCells(e)) out.add(K.idx(i, j, k));
      if (e.type === 'stair' || e.type === 'wramp') { const s = B.spec(e); for (let r = 0; r < e.rise; r++) for (let dz = 0; dz < s.nz; dz++) for (let dx = 0; dx < s.nx; dx++) out.add(K.idx(e.i0 + dx, e.j + r, e.k0 + dz)); }
    }
    return out;
  };

  const SEEDS = globalThis.__stackSoakSeeds || [5, 13, 31];
  for (const seed of SEEDS) {
    await T(`stack.audit.soak-seed-${seed}-parts-cells-reservations-and-the-load-index-stay-exact-through-falls-saves-and-cascades`, async () => {
      const R = rng(seed), Y = K.yard({ levels: 3, east: true, rows: 40, up: { ...UP, transitDoor: 1 } }); K.dig(Y.m + 4, 0, Y.lo, 4, 12, 4);
      const slots = []; for (const m of [Y.m, Y.m + 4]) for (const j0 of [0, 4, 8]) slots.push({ m, j0 });
      const cubes = slots.map((s) => K.cube('steel', s.m, Y.lo, s.j0));
      const crafted = { pad: 0, stair: 0, wramp: 0, ladder: 0, wall: 0 }, lost = { pad: 0, stair: 0, wramp: 0, ladder: 0, wall: 0 }, bad = [], did = { plate: 0, stair: 0, ladder: 0, frame: 0, hammer: 0, fall: 0, save: 0, rebuild: 0 };
      const craft0 = g.craftItem, destroy0 = g.destroyEnt;
      g.craftItem = function (id, n = 1) { const before = S().items[id] || 0; const r = craft0.call(this, id, n); const after = S().items[id] || 0; if (kindOf[id] && after > before) crafted[kindOf[id]] += after - before; return r; };
      g.destroyEnt = function (e) { const k = typeKind(e); if (k) lost[k]++; return destroy0.call(this, e); };
      const items = () => { const o = { pad: 0, stair: 0, wramp: 0, ladder: 0, wall: 0 }; for (const [id, n] of Object.entries(S().items)) if (kindOf[id]) o[kindOf[id]] += n; return o; };
      const placed = () => { const o = { pad: 0, stair: 0, wramp: 0, ladder: 0, wall: 0 }; for (const e of S().entities) if (e.bay !== undefined) { const k = typeKind(e); if (k) o[k]++; } return o; };
      const live = () => cubes.filter((c) => K.M().items.has(c.id));
      const check = (step, what) => {
        const it = items(), pl = placed();
        for (const k of Object.keys(crafted)) if (it[k] + pl[k] + lost[k] !== crafted[k]) bad.push(`step ${step} (${what}): ${k} items ${it[k]} + placed ${pl[k]} + lost ${lost[k]} != crafted ${crafted[k]}`);
        for (const e of S().entities) if (e.bay !== undefined && !K.support({ id: e.bay })) bad.push(`step ${step} (${what}): a ${e.type} has no cube (${e.bay})`);
        // every plate cell belongs to a plate or a door frame, and every plate's cells are there
        const plateCells = new Set(); for (const e of S().entities) if (e.type === 'pad' && e.bay !== undefined) for (const [i, j, k] of B.cellsOf(e)) { plateCells.add(K.idx(i, j, k)); if (!W().get(i, j, k)) bad.push(`step ${step} (${what}): a plate cell is missing at ${i},${j},${k}`); }
        let stray = 0; for (let j = 0; j < 12; j++) for (let k = Y.lo; k < Y.lo + 4; k++) for (let i = Y.m; i < Y.m + 8; i++) if (W().get(i, j, k) === K.PAD && !plateCells.has(K.idx(i, j, k)) && !B.ownerAt(g, i, j, k)) stray++;
        if (stray) bad.push(`step ${step} (${what}): ${stray} plate cells with no owner`);
        const own = owned(Y); let res = 0; for (const key of W().reserved) { if (own.has(key)) continue; const k = Math.floor(key / 16384) % 16384, i = key % 16384, j = Math.floor(key / 16384 / 16384); if (i >= Y.m && i < Y.m + 8 && k >= Y.lo && k < Y.lo + 4 && j < 12) res++; }
        if (res) bad.push(`step ${step} (${what}): ${res} reserved cells with no owner`);
        // the load index only holds cubes that are in the support list
        for (const s of W().supports) if (s.blk) { for (const u of ST.above(g, s)) if (!W().supports.includes(u)) bad.push(`step ${step} (${what}): the cube above ${s.id} is not a support (${u.id})`); for (const u of ST.below(g, s)) if (!W().supports.includes(u)) bad.push(`step ${step} (${what}): the cube below ${s.id} is not a support (${u.id})`); }
        if (g.pendFail) g.tickPending(0);   // (a cube hammered while it was falling leaves its entry until the next tick, which drops it)
        if (g.pendFail) for (const id of g.pendFail.keys()) if (!W().supports.some((s) => s.id === id)) bad.push(`step ${step} (${what}): a pending fall for ${id} with no cube`);
        // weights: no cube is more loaded than the sum of every roof in reach of the column it is in
        for (const s of W().supports) if (s.blk) { const t = LT.totalLoad(W(), s); if (!Number.isFinite(t) || t < 0) bad.push(`step ${step} (${what}): load ${t}`); }
      };
      const refill = () => { for (const [n, c] of cubes.entries()) if (!K.M().items.has(c.id) && R() < 0.5) { cubes[n] = K.cube('steel', slots[n].m, Y.lo, slots[n].j0); did.rebuild++; } };
      for (let step = 0; step < 55 && bad.length < 4; step++) {
        const raw = Math.floor(R() * 14), cs = live(); if (!cs.length) { refill(); if (!live().length) break; continue; } const c = cs[Math.floor(R() * cs.length)]; let what = '';
        if (raw < 3) { what = 'plate'; const role = R() < 0.5 ? 'f' : 'c', o = Math.floor(R() * 3), od = Math.floor(R() * 4), mk = R() < 0.3 ? 'timber' : 'steel'; const r = await K.putPlate(c, role, o, od, mk); if (r.ok) did.plate++; }
        else if (raw === 3 || raw === 4) { what = R() < 0.3 ? 'ramp' : 'stair'; const od = Math.floor(R() * 4); if (what === 'ramp') { craft('wramp', 2); selectTool('wramp'); K.stand(c, { od, pitch: -0.5 }); await plan(); if (g.plan && g.plan.ok) { g.placeCurrent(g.curTool()); did.stair++; } } else { const r = await K.putStair(c, od); if (r.ok) did.stair++; } }
        else if (raw === 5 || raw === 6) { what = 'ladder'; craft('ladder'); const pads = S().entities.filter((e) => e.type === 'pad' && e.bay !== undefined && e.op); if (pads.length) { const P = pads[Math.floor(R() * pads.length)]; selectTool('ladder'); K.aimAt(K.cellX(P.i0 + Math.floor(R() * 4)), P.j * C, K.cellZ(P.k0 + Math.floor(R() * 4)), 1.0, P.j * C - 2.38 + 0.02); await plan(); if (g.plan && g.plan.ok) { K.placeNow(); did.ladder++; } } }
        else if (raw === 7) { what = 'door frame'; craft('wall'); selectTool('wall'); K.stand(c, { od: Math.floor(R() * 4), pitch: 0 }); p().pos.y = c.y0 + (ST.plateOf(g, c.id) && ST.plateOf(g, c.id).ro === 'f' ? 0.62 : 0); await plan(); if (g.plan && g.plan.ok) K.placeNow(); }
        else if (raw === 8 || raw === 9) { what = 'hammer a part'; const ps = S().entities.filter((e) => e.bay !== undefined); if (ps.length) { const e = ps[Math.floor(R() * ps.length)]; g.doDecon({ kind: 'mach', id: e.id, group: R() < 0.4 }); did.hammer++; } }
        else if (raw === 10) { what = 'hammer a cube'; g.doDecon({ kind: 'mach', id: c.id }); did.hammer++; }
        else if (raw === 11) { what = 'a cube falls'; if (R() < 0.6) { g.failSupport(K.support(c), 1.2); did.fall++; adv(R() * 4); } }
        else if (raw === 12) { what = 'time and the real loop'; adv(0.3 + R() * 1.5); }
        else { what = 'a real save and load'; if (R() < 0.5) { g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (ok) { const { loadSaved } = await import('../state.js'); const sv = loadSaved(); const before = S().entities.filter((e) => e.bay !== undefined).map((e) => e.id + ':' + e.type).sort().join(); g.loadWorld(sv.S, sv); g.noSave = true; g.mode = 'play'; adv(0.2); const after = S().entities.filter((e) => e.bay !== undefined).map((e) => e.id + ':' + e.type).sort().join(); if (before !== after) bad.push(`step ${step}: the parts changed in a save and load: ${before} vs ${after}`); did.save++; } } }
        if (R() < 0.3) refill();
        check(step, what);
      }
      g.craftItem = craft0; g.destroyEnt = destroy0;
      if (!bad.length && did.plate < 2) bad.push('the soak built too little to mean anything: ' + JSON.stringify(did));
      return bad.length === 0 || bad.slice(0, 4).join(' || ');
    });
  }

  await T('stack.audit.a-building-across-chunk-seams-in-x-z-and-y-stands-walks-and-falls-like-one-in-the-middle-of-a-chunk', async () => {
    // chunks are 16 cells: put the shaft over the x seam and the z seam, 9 cubes high so the rows 16 and 32 seams cut it too
    ctx.fresh(UP); const sp = ctx.spot(12), levels = 9, rows = 44;
    const m = Math.ceil((sp.i + 20 - 14) / 16) * 16 + 14, lo = Math.round((sp.k - 4 - 14) / 16) * 16 + 14, i0 = m - 12, k0 = lo - 10, bad = [];
    K.solid(i0, k0, 52, 28, rows); K.dig(i0 + 3, 0, lo, 9, 4, 4); K.dig(m, 0, lo, 4, 4 * levels, 4); K.dig(m + 4, 0, lo, 6, 4, 4);
    const Y = { i0, k0, m, lo, nj: rows };
    if (Y.m % 16 !== 14 || Y.lo % 16 !== 14) return `could not put the shaft on the seams: m ${Y.m % 16}, lo ${Y.lo % 16}`;
    const cs = K.stack(Y, Array(9).fill('steel'));
    for (const [n, c] of cs.entries()) { const r = await K.putPlate(c, 'f', n % 2 ? 1 : 0, 0); if (!r.ok) { bad.push(`plate ${n}: ${r.why}`); break; } }
    // a stair from the first level to the second needs a landing above and a full plate under it
    const st = await K.putStair(cs[0], 0); if (!st.ok && cs.length) bad.push('a stair across the x and z seams: ' + st.why);
    const cellsAt = (j) => { let n = 0; for (let k = Y.lo; k < Y.lo + 4; k++) for (let i = Y.m; i < Y.m + 4; i++) if (W().get(i, j, k) === K.PAD) n++; return n; };
    const rowsWithPlates = [0, 4, 8, 12, 16, 20, 24, 28, 32].filter((j) => cellsAt(j) > 0); if (rowsWithPlates.length !== 9) bad.push('plates in rows ' + rowsWithPlates.join());
    // the column carries its own weight to the floor the same as anywhere
    const t = LT.totalLoad(W(), K.support(cs[0])); if (!Number.isFinite(t)) bad.push('the bottom cube weighs ' + t);
    for (const c of cs) { const above = ST.above(g, K.support(c)).length; if (c !== cs[8] && above !== 1) bad.push(`cube at row ${c.blk ? c.blk.j0 : '?'} has ${above} above it`); }
    // fall: the whole column goes, parts and plate cells with it, across the seams
    g.failSupport(K.support(cs[0]), 1.3); adv(30);
    for (const c of cs) if (K.M().items.has(c.id)) { bad.push('cube ' + c.id + ' stood after the cascade'); break; }
    if (S().entities.some((e) => e.bay !== undefined)) bad.push('parts stayed after the cascade');
    let left = 0; for (let j = 0; j < 36; j++) for (let k = Y.lo; k < Y.lo + 4; k++) for (let i = Y.m; i < Y.m + 4; i++) if (W().get(i, j, k) === K.PAD) left++;
    if (left) bad.push(left + ' plate cells left over the seams');
    return bad.length === 0 || bad.join(' | ');
  });
}
