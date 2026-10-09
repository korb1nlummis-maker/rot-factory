// Helpers for the Wave 6 tests (arches, the Portal, tunnels, haul). No default export.
// `makeKit(ctx)` clears a block of the open bay (or a block deep in the pile), builds a solid pile face next to it, and makes arches and portals straight in the world.
import * as ARCH from '../arches.js';
import * as PORTAL from '../portal.js';
import { ARCH_SPANS } from '../loadtrace.js';

export const UP = { power: 1, belts: 1, fans: 1, mfan: 1, sorter: 1, vault: 1, timber: 1, steel: 1, concrete: 1, rebar: 1, titan: 1, carbon: 1, plasma: 1, voidl: 1, neutron: 1, archWide: 1, archHall: 1, portal: 1, truck: 1, excavator: 1, dozer: 1, wheel: 1, haulRoad: 1, truckDock: 1, borer: 1, railShuttle: 1, bag: 4, detector: 1, archGate: 1, archGiant: 1, vscan: 1, beltLift: 1 };

export function makeKit(ctx) {
  const { g, S, w, p, fresh, newWorld, toI, toK, cellX, cellZ } = ctx;
  const C = 0.6;
  const solidBox = (i0, k0, nx, nz, nj, sp = 2) => { for (let i = i0; i < i0 + nx; i++) for (let k = k0; k < k0 + nz; k++) for (let j = 0; j < nj; j++) w().setCell(i, j, k, sp, 0); };
  const clearBox = (i0, k0, nx, nz, nj) => { for (let i = i0; i < i0 + nx; i++) for (let k = k0; k < k0 + nz; k++) for (let j = 0; j < nj; j++) if (w().get(i, j, k)) w().removeCell(i, j, k, false); };
  const gone = (e) => { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } S().entities = S().entities.filter((x) => x.id !== e.id); w().supports = w().supports.filter((s) => s.id !== e.id && s.id !== 'shield' + e.id); };
  const archs = () => S().entities.filter((e) => e.type === 'garch');
  // a pile face: the mouth of the tunnel is the west end of `len` cells of solid plush `rows` high, `span + 8` wide. Near the bay: depth 5 m from the start.
  // `dist` 0 builds it in the open bay (a lane near the start); a distance in metres builds it deep in the pile by carving the open room behind the mouth instead.
  const site = (o = {}) => {
    const span = o.span ?? 6, rows = o.rows ?? 24, len = o.len ?? 60, h = ARCH_SPANS[span].h;
    let i0, k0;
    // (the world is random: the Welcome Gate and its belt stand at the same place in every world and the slope mouth does not, so a site can land on a free tile that no clearing removes: that lane is skipped)
    const tileIn = (a, b, c, d) => { for (const t of g.logi.tiles.values()) if (t.i >= a && t.i < a + c && t.k >= b && t.k < b + d) return true; return false; };
    if (!o.dist) { let sp = null; for (const lane of [o.lane ?? 12, 12, 20, 6, 28, -6, -14, 36, -22, 44, 52, -30, 60]) { try { const q = ctx.spot(lane); if (tileIn(q.i + 6 - 30, q.k - 14, len + 40, span + 12)) continue; sp = q; break; } catch (e) { /* a lane without a slope mouth */ } } if (!sp) throw new Error('no lane with a slope mouth and no tile in the way'); i0 = sp.i + 6; k0 = sp.k - 14; clearBox(i0 - 8, k0, len + 12, span + 10, 14); }
    else { i0 = toI(o.dist); k0 = toK(o.z ?? 60); clearBox(i0 - 6, k0 + 5, 6, span, h); }   // a tunnel-sized room behind the mouth (a bigger hollow would put its roof in the weight of the first arches)
    // solid face: the pile from i0 + 4 on, as wide as the tunnel plus 5 cells each side (deep in the pile it is just the natural pile: only the room behind the mouth is carved)
    if (!o.dist) { clearBox(i0 - 8, k0, len + 12, span + 10, rows + 2); solidBox(i0 + 4, k0, len, span + 10, rows); }
    return { i0, k0, span, h, lo: k0 + 5, rows, len };
  };
  // the mouth arch at the site: a portal (pd found by the real rule) unless `portal` is false
  const mouth = (st, mat = 'steel', o = {}) => {
    // the section of the mouth arch must be empty: i0 .. i0 + 3
    clearBox(st.i0, st.lo, 4, st.span, st.h);
    const l = ARCH.layout(g, 'x', st.i0, st.lo, 0, st.span, mat, { free: true }); if (!l.ok) throw new Error('mouth layout: ' + l.why);
    const f = { axis: 'x', gm: st.i0, glo: st.lo, gj: 0, span: st.span, mat };
    const pd = ARCH.portalDir(g, l.ent);
    if (pd && o.portal !== false) Object.assign(f, { pd, adv: 0, lined: 0, spent: 0, off: false });
    const e = g.placeEntity('garch', f, { quiet: true }); return e;
  };
  const run = (secs, dt = 0.1, each = null) => {
    for (let n = 0; n < secs / dt; n++) {
      for (const it of g.machines.items.values()) it.ent.pw = it.ent.off && it.ent.type !== 'garch' ? 0 : 1;
      for (const t of g.logi.tiles.values()) t.pw = 1;
      g.time += dt; PORTAL.tick(g, dt); if (each) each(n);
    }
  };
  const until = (cond, secs = 120, dt = 0.1) => { let t = 0; while (t < secs && !cond()) { run(dt, dt); t += dt; } return cond(); };
  // the cutter's rate scales with depth (compaction): a test at 800 m would wait an hour of game time, so it cuts a hundred times faster
  const fast = () => { g.T.borerRate = 0.1; };
  const emptySlab = (e, n) => PORTAL.slabCells(e, PORTAL.slabA(e, n)).every(([i, j, k]) => !w().solid(i, j, k));
  return { solidBox, clearBox, gone, archs, site, mouth, run, until, emptySlab, fast };
}
export { ARCH, PORTAL };
