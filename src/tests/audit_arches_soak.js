// audit_arches.soak.*: seeded random edits around giant arches, frames, Portals, walls, pads, collapses, the hammer, E (park or start) and a real save and load,
// with the invariants checked after every step (sixteen seeds were swept clean). `globalThis.__archSeeds = [..]` runs other seeds.
// Run: `await __selftest('audit_arches.soak.')`
import { makeKit, UP, ARCH, PORTAL } from './portal_lib.js';
import { BULK, PAD } from '../plushdata.js';

const rng0 = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const HEIGHT = { 6: 5, 8: 6, 12: 8 };

export default async function (ctx) {
  const { T, g, S, w, fresh, newWorld, adv, stepSim } = ctx;
  const K = makeKit(ctx);
  const world = async () => { await newWorld(); fresh(UP); S().money = 1e12; g.surgeT = 1e9; K.fast(); };
  const overlap = (A, B) => A.i0 <= B.i1 && B.i0 <= A.i1 && A.k0 <= B.k1 && B.k0 <= A.k1 && A.j0 <= B.j1 && B.j0 <= A.j1;

  const soak = async (seed, steps) => {
    await world(); const rnd = rng0(seed), pick = (a) => a[Math.floor(rnd() * a.length)], bad = [];
    const st = K.site({ span: 6, rows: 24, len: 70 }), bound = { i0: st.i0 - 4, k0: st.k0 };
    const viol = (msg) => { if (bad.length < 12) bad.push(`seed ${seed}: ${msg}`); };
    const carve = (b) => { for (let i = b.i0; i <= b.i1; i++) for (let k = b.k0; k <= b.k1; k++) for (let j = b.j0; j <= b.j1; j++) if (w().get(i, j, k)) w().removeCell(i, j, k, false); };
    const check = (tag) => {
      const ents = S().entities.filter((e) => e.type === 'garch'), ids = new Set();
      for (const e of S().entities) { if (ids.has(e.id)) viol(tag + ' duplicate id ' + e.id); ids.add(e.id); }
      for (const e of ents) {
        if (!g.machines.items.has(e.id)) viol(tag + ' no mesh item for ' + e.id);
        const sp = w().supports.filter((s) => s.id === e.id); if (sp.length !== 1) viol(tag + ` ${sp.length} supports for arch ${e.id}`); else if (sp[0].kind !== e.kind) viol(tag + ` support kind ${sp[0].kind}, ent kind ${e.kind}`);
        for (const k of ['cx', 'cz', 'adv', 'lined', 'spent']) if (!Number.isFinite(e[k])) viol(tag + ` ${k} is ${e[k]}`);
        if (e.pd && e.lined > (e.adv >> 2)) viol(tag + ` lined ${e.lined} of ${e.adv >> 2} possible sections`);
        if (e.pd && !w().supports.some((s) => s.id === 'shield' + e.id)) viol(tag + ' a Portal without its shield');
      }
      const seen = new Set();
      for (const s of w().supports) {
        const key = String(s.id); if (seen.has(key)) viol(tag + ' two supports with id ' + key); seen.add(key);
        if (typeof s.id === 'string' && s.id.startsWith('shield')) { const id = +s.id.slice(6); if (!ents.some((e) => e.id === id && e.pd)) viol(tag + ' orphan shield ' + s.id); }
        else if (typeof s.kind === 'string' && s.kind.startsWith('arch') && !ents.some((e) => e.id === s.id)) viol(tag + ' orphan arch support ' + s.id);
      }
      for (let a = 0; a < ents.length; a++) for (let b = a + 1; b < ents.length; b++) if (overlap(ARCH.boxOf(ents[a]), ARCH.boxOf(ents[b]))) viol(tag + ` arches ${ents[a].id} and ${ents[b].id} overlap`);
      for (const f of S().entities.filter((e) => e.type === 'frame' && !e.turned)) { const fb = g.machines.blockBox(g.machines.frameBlock(f)); for (const a of ents) if (overlap(ARCH.boxOf(a), fb)) viol(tag + ` arch ${a.id} and frame ${f.id} overlap`); }
    };
    const ops = ['arch', 'arch', 'frame', 'hammer', 'portal', 'collapse', 'save', 'wall', 'run', 'run', 'cfg', 'dig'];
    for (let step = 0; step < steps && bad.length < 6; step++) {
      const op = pick(ops); let note = '';
      try {
        if (op === 'arch') {
          const span = pick([6, 8, 12]), mat = pick(['timber', 'steel', 'concrete']), axis = pick(['x', 'z']), m = bound.i0 + Math.floor(rnd() * 60), lo = bound.k0 + Math.floor(rnd() * 16);
          const gm = axis === 'x' ? m : lo, glo = axis === 'x' ? lo : m; if (rnd() < 0.8) carve(ARCH.boxOf(ARCH.derive(axis, gm, glo, 0, span, mat)));
          const L = ARCH.layout(g, axis, gm, glo, 0, span, mat, { free: rnd() < 0.5 }); if (L.ok) { const e = g.placeEntity('garch', { axis, gm, glo, gj: 0, span, mat }, { quiet: true }); note = 'placed ' + e.id; }
        } else if (op === 'frame') {
          const axis = pick(['x', 'z']), m = bound.i0 + Math.floor(rnd() * 60), lo = bound.k0 + Math.floor(rnd() * 20), kind = pick(['timber', 'steel']), fe = g.machines.frameEnt(axis, kind, m, lo, 0);
          if (rnd() < 0.8) for (const [i, j, k] of fe.clear) w().removeCell(i, j, k, false);
          const f2 = g.machines.frameEnt(axis, kind, m, lo, 0);
          if (!f2.clear.length && !g.machines.blockTaken(axis, m, lo, 0)) { const ent = { id: g.nextId(), type: 'frame', kind, ...f2 }; delete ent.clear; S().entities.push(ent); g.addEntity(ent); note = 'frame'; }
        } else if (op === 'hammer') {
          const list = S().entities.filter((e) => e.type === 'garch' || e.type === 'frame');
          if (list.length) { const e = pick(list), id = e.type === 'garch' ? `garch:${e.span}:${e.mat}` : 'frame:' + e.kind, n0 = S().items[id] || 0; g.doDecon({ kind: 'mach', id: e.id }); if ((S().items[id] || 0) !== n0 + 1) viol(`the hammer gave back ${(S().items[id] || 0) - n0} of ${id}`); if (S().entities.some((q) => q.id === e.id)) viol('the hammer left the ent'); }
        } else if (op === 'portal') {
          const span = pick([6, 8]), lo = st.lo + (rnd() < 0.5 ? 0 : 1), gm = st.i0 - 12 + Math.floor(rnd() * 4) * 4; K.clearBox(gm, lo, 4, span, HEIGHT[span]);
          const L = ARCH.layout(g, 'x', gm, lo, 0, span, 'steel', { free: true });
          if (L.ok) { const pd = ARCH.portalDir(g, L.ent), f = { axis: 'x', gm, glo: lo, gj: 0, span, mat: 'steel' }; if (pd) Object.assign(f, { pd, adv: 0, lined: 0, spent: 0, off: false }); g.placeEntity('garch', f, { quiet: true }); note = 'portal ' + pd; }
        } else if (op === 'collapse') {
          const n = 30 + Math.floor(rnd() * 80); for (let q = 0; q < n; q++) { const i = bound.i0 + Math.floor(rnd() * 70), k = bound.k0 + Math.floor(rnd() * 24), j = 1 + Math.floor(rnd() * 8); if (w().get(i, j, k)) w().removeCell(i, j, k, true); }
          stepSim(2);
        } else if (op === 'save') {
          const raw = JSON.parse(JSON.stringify(S().entities));
          for (const e of [...S().entities]) { if (e.free) continue; const t = g.logi.byId.get(e.id); if (t) { g.logi.remove(t); continue; } const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } }
          w().supports = []; S().entities = S().entities.filter((e) => e.free); for (const e of raw) if (!e.free) { S().entities.push(e); g.addEntity(e); } note = 'reload ' + raw.length;
        } else if (op === 'wall') {
          const i = bound.i0 + Math.floor(rnd() * 70), k = bound.k0 + Math.floor(rnd() * 24), j = Math.floor(rnd() * 5); if (!w().solid(i, j, k) && !g.logi.cellTaken(i, j, k)) w().setCell(i, j, k, pick([BULK, PAD]), 0);
        } else if (op === 'run') adv(0.5 + rnd() * 2, 0.1);
        else if (op === 'cfg') { const p = S().entities.filter((e) => e.type === 'garch' && e.pd); if (p.length) g.setCfg(pick(p), { off: rnd() < 0.5 }); }
        else if (op === 'dig') { const i = bound.i0 + Math.floor(rnd() * 70), k = bound.k0 + Math.floor(rnd() * 24); for (let j = 0; j < 4; j++) if (w().get(i, j, k)) w().removeCell(i, j, k, true); }
      } catch (e) { viol(`step ${step} ${op} threw ${e.message} ${(e.stack || '').split('\n')[1] || ''}`); }
      check(`step ${step} ${op} ${note}:`);
    }
    return bad;
  };

  await T('audit_arches.soak.random-edits-keep-every-arch-support-and-portal-consistent', async () => {
    const seeds = globalThis.__archSeeds || [11, 23, 37, 41], bad = [];
    for (const s of seeds) bad.push(...await soak(s, 50));
    return bad.length === 0 || bad.slice(0, 8).join(' | ');
  });

  // a Portal that has a wall, a pad or a cache dropped in its path at random places must always end up either working or saying why: never silent
  await T('audit_arches.soak.a-portal-with-random-things-in-its-path-is-never-silent', async () => {
    const bad = [];
    for (const seed of globalThis.__archSeeds || [5, 9, 14]) {
      await world(); const rnd = rng0(seed), st = K.site({ span: 6 }), e = K.mouth(st, 'steel'); const specs = [BULK, PAD, 4097, 4096];
      for (let q = 0; q < 6; q++) { const slab = Math.floor(rnd() * 14), cells = PORTAL.slabCells(e, PORTAL.slabA(e, slab)), [i, j, k] = cells[Math.floor(rnd() * cells.length)]; if (w().solid(i, j, k)) w().setCell(i, j, k, specs[q % 4], 0); }
      let lastAdv = -1, lastL = -1, still = 0;
      for (let t = 0; t < 400; t++) { K.run(0.5); if (e.adv === lastAdv && e.lined === lastL) still++; else still = 0; lastAdv = e.adv; lastL = e.lined; if (still > 60 && e.ps !== 'stuck' && e.ps !== 'done') { bad.push(`seed ${seed}: silent for 30 s in state "${e.ps}" at adv ${e.adv}`); break; } if (e.ps === 'stuck') break; }
    }
    return bad.length === 0 || bad.join('; ');
  });
}
