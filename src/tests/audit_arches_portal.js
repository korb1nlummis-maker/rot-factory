// audit_arches.portal.*: the audit of wave 6 (the Portal). Each test was written to fail first against the code as built; the cause is in the test name.
// Run: `await __selftest('audit_arches.portal.')`
import { makeKit, UP, ARCH, PORTAL } from './portal_lib.js';
import { BULK, PAD, REMAINS, CACHE } from '../plushdata.js';

const SPECIALS = [['a wall', BULK], ['a floor pad', PAD], ['remains', REMAINS], ['a supply cache', CACHE]];

export default async function (ctx) {
  const { T, g, S, w, fresh, newWorld, toI, toK } = ctx;
  const K = makeKit(ctx);
  const world = async (up = UP) => { await newWorld(); fresh(up); S().money = 1e12; g.surgeT = 1e9; K.fast(); };

  // The cutter skips what removeCell will not take (a wall, a pad, a cache, remains), so a slab with one of them in it used to count as bored, and the lining that followed found a
  // "solid" cell in its section, cut nothing and returned silently every frame: the readout said "Boring the tunnel" for ever.
  await T('audit_arches.portal.a-wall-pad-cache-or-remains-in-the-open-section-halts-with-a-reason-and-goes-on-once-it-is-gone', async () => {
    const out = [];
    for (const [name, sp] of SPECIALS) {
      await world(); const st = K.site({ span: 6 }), e = K.mouth(st, 'steel');
      if (!K.until(() => e.adv >= 4, 60)) { out.push(`${name}: adv ${e.adv} ${e.ps}`); continue; }
      const sec = ARCH.sectionCells(ARCH.derive('x', PORTAL.moduleM(e, 1), e.glo, 0, 6, 'steel')), [i, j, k] = sec[10];
      w().setCell(i, j, k, sp, 0); K.run(30);
      if (e.ps !== 'stuck') out.push(`${name}: it sits in state "${e.ps}" for 30 s with the section blocked`);
      if (e.lined !== 0) out.push(`${name}: it lined a section with something in it`);
      const text = PORTAL.lines(g, e).join(' '); if (!/cannot cut|stands in|Blocked/i.test(text) || /Boring the tunnel/.test(text)) out.push(`${name}: the readout says "${PORTAL.lines(g, e)[0]}"`);
      if (w().get(i, j, k) !== sp) out.push(`${name}: it cut the special cell`);
      w().setCell(i, j, k, 0, 0);
      if (!K.until(() => e.lined >= 1, 60)) out.push(`${name}: after clearing it, lined ${e.lined}, ${e.ps}`);
    }
    return out.length === 0 || out.join('; ');
  });

  await T('audit_arches.portal.a-supply-cache-or-remains-in-the-next-slab-halts-before-the-cutter-passes-it', async () => {
    const out = [];
    for (const [name, sp] of SPECIALS.slice(2)) {
      await world(); const st = K.site({ span: 6 }), e = K.mouth(st, 'steel'); const [i, j, k] = PORTAL.slabCells(e, PORTAL.slabA(e, 2))[3];
      w().setCell(i, j, k, sp, 0);
      if (!K.until(() => e.ps === 'stuck', 60)) { out.push(`${name}: no halt, ${e.ps} adv ${e.adv}`); continue; }
      if (e.adv !== 2) out.push(`${name}: it bored ${e.adv} slabs, the cell is in the third`); if (w().get(i, j, k) !== sp) out.push(`${name}: the cell is gone`);
      if (!/cache|remains|cannot cut/i.test(PORTAL.lines(g, e).join(' '))) out.push(`${name}: the readout does not name it`);
      w().setCell(i, j, k, 0, 0); if (!K.until(() => e.adv >= 5 && e.lined >= 1, 90)) out.push(`${name}: after clearing it adv ${e.adv} lined ${e.lined} ${e.ps}`);
    }
    return out.length === 0 || out.join('; ');
  });

  // regression: the four ways a tunnel can run (the tests of the wave bore east only)
  await T('audit_arches.portal.a-portal-bores-and-lines-in-line-whichever-way-it-faces', async () => {
    const out = [], solid = (i0, k0, nx, nz, nj) => { for (let i = i0; i < i0 + nx; i++) for (let k = k0; k < k0 + nz; k++) for (let j = 0; j < nj; j++) w().setCell(i, j, k, 2, 0); };
    for (const [axis, dir] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
      await world(); for (let i = toI(-52); i <= toI(8); i++) for (let k = toK(-26); k <= toK(18); k++) for (let j = 0, top = w().topAt(i, k); j < top; j++) if (w().get(i, j, k)) w().removeCell(i, j, k, false);
      const span = 6, i0 = toI(-40), k0 = toK(-14), lo = (axis === 'x' ? k0 : i0) + 6, m = axis === 'x' ? (dir > 0 ? i0 + 8 : i0 + 40) : (dir > 0 ? k0 + 8 : k0 + 40), L = 30;
      if (axis === 'x') solid(dir > 0 ? m + 4 : m - L, lo - 4, L, span + 8, 24); else solid(lo - 4, dir > 0 ? m + 4 : m - L, span + 8, L, 24);
      const l0 = ARCH.layout(g, axis, m, lo, 0, span, 'steel', { free: true }); if (!l0.ok) { out.push(`${axis}${dir}: ${l0.why}`); continue; }
      const pd = ARCH.portalDir(g, l0.ent); if (pd !== dir) { out.push(`${axis}${dir}: portalDir ${pd}`); continue; }
      const e = g.placeEntity('garch', { axis, gm: m, glo: lo, gj: 0, span, mat: 'steel', pd, adv: 0, lined: 0, spent: 0, off: false }, { quiet: true });
      if (!K.until(() => e.lined >= 2, 300)) { out.push(`${axis}${dir}: lined ${e.lined} ${e.ps}`); continue; }
      const gms = K.archs().filter((a) => a.id !== e.id).map((a) => a.gm).sort((a, b) => a - b), want = dir > 0 ? [m + 4, m + 8] : [m - 8, m - 4];
      if (gms.join() !== want.join()) out.push(`${axis}${dir}: arches at ${gms}, wanted ${want}`);
      let bad = 0; for (let n = 0; n < e.adv; n++) for (const [i, j, k] of PORTAL.slabCells(e, PORTAL.slabA(e, n))) if (w().solid(i, j, k)) bad++; if (bad) out.push(`${axis}${dir}: ${bad} plush left in the bore`);
    }
    return out.length === 0 || out.join('; ');
  });
}
