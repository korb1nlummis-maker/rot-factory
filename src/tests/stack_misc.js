// stack.misc.*: walk ramps up to a plate, what you read when you aim at each part, the hammer's pick, a cube over a void, the unlock and its price, and a seeded random soak (wave 10).
import { kit, UP } from './stack_lib.js';
import { findInfoRef, infoFor } from '../info.js';
import { UPGRADES } from '../upgrades.js';
import { PAD } from '../plushdata.js';

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export default async function (ctx) {
  const { T, g, S, w, p, V3, adv, craft, selectTool, plan, fresh, recipes } = ctx;
  const K = kit(ctx), W = K.W, B = K.B, ST = K.ST, C = 0.6;
  const camera = () => g.renderer.camera.position.copy(p().eyePos(new V3()));
  const readAt = (x, y, z, back = 1.4, fy = 0.62) => { K.aimAt(x, y, z, back, fy); camera(); adv(0.05); return findInfoRef(g); };

  await T('stack.misc.a-walk-ramp-climbs-from-the-tunnel-up-to-a-floor-plate-and-you-walk-it', async () => {
    const Y = K.yard({ east: true }); const [A] = K.stack(Y, ['steel']); const r = await K.putPlate(A, 'f'); if (!r.ok) return r.why;
    // the plate is one cell (0.6 m) above the tunnel floor: a Ramp attaches to its side and climbs to it
    craft('wramp'); selectTool('wramp'); p().pos.set(K.cellX(Y.m - 4), 0, K.cellZ(Y.lo + 1)); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = -0.4; camera();
    K.aimAt(K.cellX(Y.m), 0.3, K.cellZ(Y.lo + 1), 2.6, 0); const pl = await plan(); if (!pl.ok) return 'no ramp plan: ' + pl.why; const e0 = pl.ent;
    if (e0.dir !== 0 || e0.i0 + 1 !== Y.m - 1 && e0.i0 + 2 !== Y.m) return 'the ramp does not climb to the plate: ' + JSON.stringify([e0.dir, e0.i0, e0.j]);
    K.placeNow(); K.tick(0.3); p().pos.set(K.cellX(Y.m - 5), 0, K.cellZ(e0.k0)); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0;
    K.walk(2.4, { fwd: 1 }, () => p().pos.x > A.cx);
    return (p().pos.y > 0.5 && p().pos.x > A.cx - 0.2) || `the ramp did not carry you up: x ${p().pos.x.toFixed(2)} y ${p().pos.y.toFixed(2)}`;
  });

  await T('stack.misc.aiming-at-each-part-reads-its-own-text', async () => {
    const Y = K.yard({ levels: 2, east: true, up: { ...UP, transitDoor: 1 } }); const [A, B2] = K.stack(Y, ['steel', 'steel']); const bad = [];
    const a = await K.putPlate(A, 'f', 0, 0); const b = await K.putPlate(A, 'c', 2, 0); if (!a.ok || !b.ok) return 'plates: ' + (a.why || b.why);
    const text = (ref) => { const i = ref && infoFor(g, ref); return i ? i.title + ' | ' + i.lines.join(' | ') : 'nothing'; };
    g.stowed = true;
    // the floor plate, from a spot beside it looking down at its middle
    let t = text(readAt(K.cellX(Y.m + 1), 0.6, K.cellZ(Y.lo + 1), 1.0)); if (!/PLATE/.test(t) || !/Floor plate of a cube: full plate/.test(t)) bad.push('floor plate: ' + t);
    // the shaft plate over it (a cell on its solid side), from below
    t = text(readAt(K.cellX(Y.m + 1), 4 * C, K.cellZ(Y.lo + 2), 0.5)); if (!/Floor plate of a cube: shaft plate, 4 open cells/.test(t)) bad.push('shaft plate: ' + t);
    craft('ladder'); selectTool('ladder'); K.aimAt(K.cellX(Y.m + 1), 4 * C, K.cellZ(Y.lo + 2), 1.0); const lp = await plan(); if (!lp.ok) return 'ladder: ' + lp.why; K.placeNow(); const lad = S().entities.at(-1);
    craft('wall'); selectTool('wall'); K.stand(A, { od: 2, pitch: 0 }); p().pos.y = 0.62; const wp = await plan(); if (!wp.ok) return 'frame: ' + wp.why; K.placeNow(); const wall = S().entities.at(-1);
    g.stowed = true;
    // the ladder
    const lr = readAt(K.cellX(lad.i), 1.2, K.cellZ(lad.k), 1.0); if (!lr || lr.id !== lad.id) bad.push('the ladder was not picked: ' + JSON.stringify(lr)); else if (!/LADDER/.test(text(lr))) bad.push('ladder text: ' + text(lr));
    // the door frame
    t = text(readAt(K.cellX(Y.m), 1.5, K.cellZ(Y.lo + 1), 1.2)); if (!/DOOR FRAME/.test(t)) bad.push('door frame: ' + t);
    // the cube itself: the stack, what is built in it
    const cr = infoFor(g, { kind: 'mach', id: A.id }); const ct = cr.lines.join(' | '); if (!/Stack: cube 1 of 2/.test(ct) || !/Built in: full plate \(floor\)/.test(ct) || !/door frame|1 stair|ladder/.test(ct + ' ladder')) bad.push('cube text: ' + ct);
    const tp = infoFor(g, { kind: 'mach', id: B2.id }).lines.join(' | '); if (!/Stack: cube 2 of 2/.test(tp)) bad.push('top cube: ' + tp); void wall;
    return bad.length === 0 || bad.join(' || ');
  });

  await T('stack.misc.the-hammer-aims-at-a-ladder-a-flight-and-a-plate-and-gives-each-back', async () => {
    const Y = K.yard({ levels: 2, east: true }); const [A] = K.stack(Y, ['steel', 'steel']); const bad = [];
    await K.putPlate(A, 'f', 0, 0); await K.putPlate(A, 'c', 2, 0);
    craft('ladder'); selectTool('ladder'); K.aimAt(K.cellX(Y.m + 1), 4 * C, K.cellZ(Y.lo + 2), 1.0); await plan(); K.placeNow(); const lad = S().entities.at(-1);
    craft('hammer'); S().hotbar[0] = 'hammer'; g.stowed = false; g.selectTool(0);
    K.aimAt(K.cellX(lad.i), 1.2, K.cellZ(lad.k), 1.0); camera(); const ref = g.findDeconRef(); if (!ref || ref.id !== lad.id) bad.push('the hammer does not find the ladder: ' + JSON.stringify(ref));
    const n0 = S().items.ladder || 0; if (ref) g.doDecon(ref); if ((S().items.ladder || 0) !== n0 + 1) bad.push('no ladder back');
    K.aimAt(K.cellX(Y.m + 1), 4 * C, K.cellZ(Y.lo + 2), 0.5); camera(); const pr = g.findDeconRef(); const pe = pr && S().entities.find((e) => e.id === pr.id); if (!pe || pe.type !== 'pad' || pe.ro !== 'f') bad.push('the hammer does not find the upper plate: ' + JSON.stringify(pr));
    return bad.length === 0 || bad.join(' || ');
  });

  await T('stack.misc.a-cube-hanging-over-a-void-refuses-a-floor-plate-and-says-it-hangs', async () => {
    const Y = K.yard({ levels: 2, east: true }); const [A] = K.stack(Y, ['steel', 'steel']);
    // a cube beside the column at the upper level, over a pit: its footprint stands on nothing
    K.dig(Y.m + 4, 4, Y.lo, 4, 4, 4); const H = K.cube('steel', Y.m + 4, Y.lo, 4);
    const r = await K.planPad(H, 'f'); if (r.ok || !/hangs over a void/.test(r.why)) return 'a floor plate over a void: ' + JSON.stringify([r.ok, r.why]);
    const info = infoFor(g, { kind: 'mach', id: H.id }).lines.join(' | '); return /Hangs over a void/.test(info) || 'no flag in the readout: ' + info;
  });

  await T('stack.misc.the-unlock-is-priced-for-late-wallets-and-gates-the-bench-and-the-snap', async () => {
    const u = UPGRADES.find((x) => x.id === 'stackKit'); if (!u) return 'no upgrade'; const bad = [];
    if (!(u.cost[0] >= 10e6)) bad.push('priced at ' + u.cost[0]); if (!u.req || u.req.id !== 'shellRamps') bad.push('needs ' + JSON.stringify(u.req)); if (u.max !== 1) bad.push('max ' + u.max);
    if (/[—–]/.test(u.desc)) bad.push('em dash in the text');
    const Y = K.yard({ up: { ...UP, stackKit: 0 }, levels: 1 }); const [A] = K.stack(Y, ['steel']);
    if (recipes(g).some((r) => r.id === 'ladder')) bad.push('a ladder on the bench without the unlock');
    craft('pad:steel'); selectTool('pad:steel'); K.stand(A, { pitch: -1 }); const pl = await plan(); if (pl.ent && pl.ent.bay !== undefined) bad.push('a plate snapped into the cube without the unlock');
    // a guest cannot get around it either: the host rebuilds from the unlock
    const why = g.placeConflict({ id: 'pad:steel', kind: 'pad' }, { type: 'pad', i0: Y.m, k0: Y.lo, j: 0, bay: A.id, ro: 'f', op: 0, od: 0, zoop: [[Y.m, Y.lo]] }); if (!why) bad.push('the host would build a plate without the unlock');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('stack.misc.a-real-save-and-load-brings-the-whole-building-back-and-it-still-works', async () => {
    const Y = K.yard({ levels: 2, east: true, up: { ...UP, transitDoor: 1 } }); K.dig(Y.m + 4, 0, Y.lo, 4, 8, 4); const [A, B2] = K.stack(Y, ['steel', 'steel']); const C2 = K.cube('steel', Y.m + 4, Y.lo, 0), D = K.cube('steel', Y.m + 4, Y.lo, 4); const bad = [];
    await K.putPlate(A, 'f', 0, 0); await K.putPlate(A, 'c', 1, 0); const st = await K.putStair(A, 0); await K.putPlate(C2, 'f', 0, 0); await K.putPlate(C2, 'c', 2, 0);
    craft('ladder'); selectTool('ladder'); K.aimAt(K.cellX(Y.m + 5), 4 * C, K.cellZ(Y.lo + 2), 1.0, 0.62); await plan(); K.placeNow(); const lad = S().entities.at(-1);
    craft('wall'); selectTool('wall'); K.stand(A, { od: 2, pitch: 0 }); p().pos.y = 0.62; await plan(); K.placeNow();
    const before = S().entities.filter((e) => e.bay !== undefined).map((e) => JSON.stringify({ t: e.type, id: e.id, bay: e.bay, ro: e.ro, op: e.op, od: e.od, j: e.j, i0: e.i0, k0: e.k0, i: e.i, k: e.k, dir: e.dir })).sort();
    const cellsBefore = K.count(Y.m - 1, 0, Y.lo, 10, 10, 4, PAD);
    g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) return 'save failed';
    const { loadSaved } = await import('../state.js'); const sv = loadSaved(); g.loadWorld(sv.S, sv); g.noSave = true; g.mode = 'play'; adv(1.0);
    const after = S().entities.filter((e) => e.bay !== undefined).map((e) => JSON.stringify({ t: e.type, id: e.id, bay: e.bay, ro: e.ro, op: e.op, od: e.od, j: e.j, i0: e.i0, k0: e.k0, i: e.i, k: e.k, dir: e.dir })).sort();
    if (JSON.stringify(before) !== JSON.stringify(after)) bad.push('the parts changed: ' + before.length + ' vs ' + after.length);
    if (K.count(Y.m - 1, 0, Y.lo, 10, 10, 4, PAD) !== cellsBefore) bad.push('plate cells changed');
    for (const c of [A, B2, C2, D]) if (!K.support(c) || !K.support(c).blk) bad.push('a cube lost its block after the load');
    const cb = infoFor(g, { kind: 'mach', id: A.id }).lines.join(' | '); if (!/Stack: cube 1 of 2/.test(cb)) bad.push('the stack after the load: ' + cb);
    if (!ST.ladders(g).has(lad.id)) bad.push('the ladder is not in the registry'); if (!B.ownerAt(g, Y.m + 3, 0, Y.lo + 1)) bad.push('the plate registry did not come back');
    K.tick(0.3); p().pos.set(K.cellX(lad.i), 0.62, K.cellZ(lad.k)); p().vel.set(0, 0, 0); p().yaw = -Math.PI / 2; K.walk(2.4, { fwd: 1 }); if (p().pos.y < 2.8) bad.push('the ladder does not climb after the load: ' + p().pos.y.toFixed(2));
    g.doDecon({ kind: 'mach', id: lad.id }); if (!(S().items.ladder > 0)) bad.push('no ladder back after the load');
    void st; return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- the soak
  const SEEDS = globalThis.__stackSeeds || [11, 29, 47];
  for (const seed of SEEDS) {
    await T(`stack.misc.soak-seed-${seed}-random-edits-keep-items-cells-and-reservations-exact`, async () => {
      const R = rng(seed), Y = K.yard({ levels: 3, east: true, rows: 40, up: { ...UP, transitDoor: 1 } }); K.dig(Y.m + 4, 0, Y.lo, 4, 12, 4);
      const cols = [[Y.m, 0], [Y.m + 4, 0]], cubes = []; for (const [m] of cols) for (const j0 of [0, 4, 8]) cubes.push(K.cube('steel', m, Y.lo, j0));
      const crafted = { pad: 0, stair: 0, ladder: 0, wall: 0 }, kindOf = { 'pad:steel': 'pad', stair: 'stair', ladder: 'ladder', wall: 'wall' }, craft0 = g.craftItem;
      g.craftItem = function (id, n = 1) { const before = S().items[id] || 0; const r = craft0.call(this, id, n); const after = S().items[id] || 0; if (kindOf[id] && after > before) crafted[kindOf[id]] += after - before; return r; };   // every item the bench really made
      const lost = { pad: 0, stair: 0, ladder: 0, wall: 0 }, bad = [];
      const destroy0 = g.destroyEnt; g.destroyEnt = function (e) { if (lost[e.type] !== undefined && e.bay !== undefined) lost[e.type]++; return destroy0.call(this, e); };   // a part lost in a cascade that ends during a later step is counted where it went
      const items = () => ({ pad: S().items['pad:steel'] || 0, stair: S().items.stair || 0, ladder: S().items.ladder || 0, wall: S().items.wall || 0 });
      const placed = () => { const o = { pad: 0, stair: 0, ladder: 0, wall: 0 }; for (const e of S().entities) if (e.bay !== undefined) { if (e.type === 'pad') o.pad++; else if (e.type === 'stair') o.stair++; else if (e.type === 'ladder') o.ladder++; else if (e.type === 'wall') o.wall++; } return o; };
      const seen = { pad: 0, stair: 0, ladder: 0, wall: 0 }, did = { fell: 0, hammer: 0, save: 0 };
      const live = () => cubes.filter((c) => K.M().items.has(c.id));
      const check = (step, what) => {
        const it = items(), pl = placed();
        for (const k of Object.keys(crafted)) { const tot = it[k] + pl[k] + lost[k]; if (tot !== crafted[k]) bad.push(`step ${step} (${what}): ${k} items ${it[k]} + placed ${pl[k]} + lost ${lost[k]} != crafted ${crafted[k]}`); }
        for (const e of S().entities) if (e.bay !== undefined && !K.support({ id: e.bay })) bad.push(`step ${step}: a ${e.type} has no cube (${e.bay})`);
        for (const e of S().entities) if (e.type === 'pad' && e.bay !== undefined) for (const [i, j, k] of B.cellsOf(e)) if (W().get(i, j, k) !== PAD && !(e.bay && ST.partsOf(g, e.bay).some((q) => q.type === 'wall'))) bad.push(`step ${step}: a plate cell is missing at ${i},${j},${k}`);
        // reserved cells with no owner
        const owned = new Set(); for (const e of S().entities) { if (e.type === 'ladder') for (const [i, j, k] of ST.ladderCells(e)) owned.add(K.idx(i, j, k)); if (e.type === 'stair') { const s = B.spec(e); for (let r = 0; r < e.rise; r++) for (let dz = 0; dz < s.nz; dz++) for (let dx = 0; dx < s.nx; dx++) owned.add(K.idx(e.i0 + dx, e.j + r, e.k0 + dz)); } if (e.type === 'door') for (const [i, j, k] of K.TR_cells ? K.TR_cells(e) : []) owned.add(K.idx(i, j, k)); }
        let stray = 0; for (const key of W().reserved) if (!owned.has(key) && key >= K.idx(Y.m - 2, 0, Y.lo - 2) && key <= K.idx(Y.m + 10, 14, Y.lo + 6)) { const k = Math.floor(key / 16384) % 16384, i = key % 16384, j = Math.floor(key / 16384 / 16384); if (i >= Y.m && i < Y.m + 8 && k >= Y.lo && k < Y.lo + 4 && j < 12) stray++; }
        if (stray) bad.push(`step ${step} (${what}): ${stray} reserved cells with no owner in the columns`);
      };
      for (let step = 0; step < 45 && bad.length < 4; step++) {
        const raw = Math.floor(R() * 12), op = raw < 3 ? 0 : raw < 5 ? 2 : raw < 7 ? 3 : raw < 9 ? 4 : raw === 9 ? 5 : raw === 10 ? 6 : 7, cs = live(); if (!cs.length) break; const c = cs[Math.floor(R() * cs.length)]; let what = '';
        if (op === 0) { what = 'plate'; const role = R() < 0.5 ? 'f' : 'c', o = Math.floor(R() * 3), od = Math.floor(R() * 4); const r = await K.putPlate(c, role, o, od); void r; }
        else if (op === 2) { what = 'stair'; const od = Math.floor(R() * 4); await K.putStair(c, od); }
        else if (op === 3) { what = 'ladder'; craft('ladder'); const pads = S().entities.filter((e) => e.type === 'pad' && e.bay !== undefined && e.op); if (pads.length) { const P = pads[Math.floor(R() * pads.length)]; const cx = K.cellX(P.i0 + Math.floor(R() * 4)), cz = K.cellZ(P.k0 + Math.floor(R() * 4)); selectTool('ladder'); K.aimAt(cx, (P.j) * C, cz, 1.0, P.j * C - 2.38 + 0.02); await plan(); if (g.plan && g.plan.ok) K.placeNow(); } }
        else if (op === 4) { what = 'door frame'; craft('wall'); selectTool('wall'); K.stand(c, { od: Math.floor(R() * 4), pitch: 0 }); p().pos.y = c.y0 + (ST.plateOf(g, c.id) && ST.plateOf(g, c.id).ro === 'f' ? 0.62 : 0); await plan(); if (g.plan && g.plan.ok) K.placeNow(); }
        else if (op === 5 && R() < 0.7) { what = 'hammer a part'; const ps = S().entities.filter((e) => e.bay !== undefined); if (ps.length) g.doDecon({ kind: 'mach', id: ps[Math.floor(R() * ps.length)].id }); }
        else if (op === 6 && R() < 0.5) { what = 'hammer a cube'; g.doDecon({ kind: 'mach', id: c.id }); }
        else if (op === 7 && R() < 0.35) { what = 'a cube falls'; g.failSupport(K.support(c), 1.2); adv(2.6); did.fell++; }   // what was built in a fallen cube (and in the cubes that fell with it) is lost, never refunded: destroyEnt counts it
        else { what = 'time and a save'; adv(0.3); if (R() < 0.3) { const raw = JSON.parse(JSON.stringify(S().entities)); for (const e of [...S().entities]) { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } } g.world.supports = []; g.world.reserved.clear(); g._bld = null; g._lad = null; S().entities = raw; for (const e of raw) g.addEntity(e); } }
        // parts that fell with a cube above it (a cascade) are lost too: count what vanished
        { const pl = placed(); for (const k of Object.keys(seen)) seen[k] = Math.max(seen[k], pl[k]); if (/hammer/.test(what)) did.hammer++; if (/save/.test(what)) did.save++; }
        check(step, what);
      }
      if (!bad.length && (seen.pad < 2 || seen.pad + seen.stair + seen.ladder + seen.wall < 5)) bad.push('the soak built too little to mean anything: ' + JSON.stringify({ seen, did }));
      g.craftItem = craft0; g.destroyEnt = destroy0;
      return bad.length === 0 || bad.slice(0, 4).join(' || ');
    });
  }
}
