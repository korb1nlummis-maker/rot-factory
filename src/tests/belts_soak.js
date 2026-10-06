// belts.* (wave 1A): a seeded soak. Hundreds of random edits (marks, lifts, underground ends, planned lines, upgrades, hammer hits, plush fed in) with the
// belts running between them, then the books are checked: shaft cells, reserved cells, underground pairs, plush spacing and the 3 per tile rule.
import { makeBeltKit, UP_ALL } from './belts_lib.js';
import * as BP from '../beltplan.js';
import { liftProblem, ugPartner, ugProblem } from '../beltparts.js';
import { tierOf, lenOf, capOf, SPACING, TIER_NAMES } from '../beltdata.js';
import { mulberry32 } from '../util.js';
import { idx } from '../config.js';

export default async function (ctx) {
  const { T: T0, g, S, w, L, tiles, toI, toK, cellX, cellZ } = ctx;
  const B = makeBeltKit(ctx); const T = B.T; void T0;

  // returns a list of broken rules (empty = fine)
  const audit = () => {
    const bad = [], list = tiles().filter((t) => t.type === 'belt');
    if (L().byId.size !== L().tiles.size) bad.push(`byId ${L().byId.size} vs tiles ${L().tiles.size}`);
    for (const t of list) {
      if (!w().reserved.has(idx(t.i, t.j, t.k))) bad.push(`tile ${t.id} is not reserved`);
      if (L().tiles.get(idx(t.i, t.j, t.k)) !== t) bad.push(`tile ${t.id} is not at its own cell`);
      const len = lenOf(t), cap = capOf(len);
      if (t.items.length > cap) bad.push(`tile ${t.id} holds ${t.items.length} of ${cap}`);
      for (let n = 0; n < t.items.length; n++) {
        const it = t.items[n];
        if (!(it.t >= -1e-9 && it.t <= len + 1e-6)) bad.push(`tile ${t.id} item at ${it.t} of ${len}`);
        if (n && !(t.items[n - 1].t - it.t >= SPACING - 1e-4)) bad.push(`tile ${t.id} plush ${n - 1}/${n} are ${(t.items[n - 1].t - it.t).toFixed(3)} apart`);
      }
      if (t.lift) {
        const up = Math.sign(t.lift.h);
        for (let q = 1; q <= Math.abs(t.lift.h); q++) { const c = idx(t.i, t.j + up * q, t.k); if (L().cols.get(c) !== t || !w().reserved.has(c)) bad.push(`lift ${t.id} shaft cell ${q} is not its own`); }
      }
      if (t.ug && t.ug.pair != null) {
        const o = L().byId.get(t.ug.pair);
        if (!o || !o.ug || o.ug.pair !== t.id || o.ug.role === t.ug.role || o.dir !== t.dir || o.j !== t.j || tierOf(o) !== tierOf(t)) bad.push(`ug ${t.id} and ${t.ug.pair} are not a pair`);
      }
    }
    for (const [c, t] of L().cols) if (L().tiles.get(idx(t.i, t.j, t.k)) !== t || !t.lift) bad.push(`shaft cell ${c} belongs to a tile that is gone`);
    let nan = 0; L().forEachItem((it, x, y, z) => { if (!Number.isFinite(x + y + z)) nan++; }); if (nan) bad.push(nan + ' plush have no position');
    return bad;
  };

  await T('belts.soak-random-edits-keep-the-books-straight', async () => {
    B.setup(UP_ALL); const rnd = mulberry32(20261006), pick = (n) => Math.floor(rnd() * n), bad = [];
    const base = new Set(w().reserved), W = 22, i0 = toI(-12), k0 = toK(-8);
    S().money = 1e12; S().items = {};
    const cell = () => ({ i: i0 + pick(W), k: k0 + pick(W) });
    const randTile = () => { const l = tiles().filter((t) => t.type === 'belt' && !t.free); return l.length ? l[pick(l.length)] : null; };
    const counts = { belt: 0, lift: 0, ug: 0, line: 0, hammer: 0, upgrade: 0, feed: 0, fail: 0 };
    for (let n = 0; n < 700 && bad.length === 0; n++) {
      const a = pick(100), c = cell(), tier = pick(6), dir = pick(4);
      if (a < 30) { if (!L().canPlace(c.i, 0, c.k)) { const f = { i: c.i, j: 0, k: c.k, dir, rise: 0, items: [] }; if (tier) f.tier = tier; g.placeEntity('belt', f, { quiet: true, rebuild: false }); counts.belt++; } }
      else if (a < 40) { const h = (pick(2) ? 1 : -1) * (2 + pick(9)); const j = h < 0 ? -h : 0; if (!liftProblem(g, tier, { i: c.i, j, k: c.k, dir, h }, 99)) { const f = { i: c.i, j, k: c.k, dir, rise: 0, items: [], lift: { h } }; if (tier) f.tier = tier; g.placeEntity('belt', f, { quiet: true, rebuild: false }); counts.lift++; } else counts.fail++; }
      else if (a < 52) { const p = ugPartner(g, tier, { i: c.i, j: 0, k: c.k, dir }), spec = { i: c.i, j: 0, k: c.k, dir, role: p ? 'out' : 'in', pair: p ? p.tile.id : null }; if (!ugProblem(g, tier, spec)) { const f = { i: c.i, j: 0, k: c.k, dir, rise: 0, items: [], ug: { role: spec.role, pair: spec.pair, span: p ? p.span : 0 } }; if (tier) f.tier = tier; g.placeEntity('belt', f, { quiet: true, rebuild: false }); counts.ug++; } else counts.fail++; }
      else if (a < 62) { const e = cell(), r = BP.route(g, { i: c.i, j: 0, k: c.k }, { i: e.i, j: 0, k: e.k }, pick(4), tier); if (r.ok) { const res = BP.lay(g, tier, r.tiles.map((t) => [t.i, t.j, t.k, t.dir, t.rise, t.u])); if (res.ok) counts.line++; else bad.push('a planned line the planner liked was refused: ' + res.why); } else counts.fail++; }
      else if (a < 72) { const t = randTile(); if (t) { g.doDecon({ kind: 'tile', id: t.id }); counts.hammer++; } }
      else if (a < 78) { const t = randTile(); if (t && !t.lift && !t.ug && !t.rise && tier > tierOf(t)) { t.tier = tier; L().dirty = true; counts.upgrade++; } }
      else if (a < 90) { const t = randTile(); if (t) { L().accept(t, { sp: B.sp + pick(5), vr: 0 }, null); counts.feed++; } }
      else { B.step(0.05, 1 + pick(8)); }
      if (n % 25 === 0) { B.step(0.05, 6); const r = audit(); if (r.length) bad.push(`after ${n} edits: ` + r.slice(0, 4).join('; ')); }
    }
    B.step(0.05, 200); const end = audit(); if (end.length) bad.push('at the end: ' + end.slice(0, 4).join('; '));
    if (counts.belt < 20 || counts.hammer < 5 || (counts.lift + counts.ug + counts.line) < 5) bad.push('the soak barely did anything: ' + JSON.stringify(counts));
    // tear it all down: nothing may be left reserved, no shaft cell, no pair
    for (const t of tiles().filter((x) => x.type === 'belt' && !x.free)) g.doDecon({ kind: 'tile', id: t.id });
    if (L().cols.size !== 0) bad.push(L().cols.size + ' shaft cells left after taking everything down');
    const left = [...w().reserved].filter((c) => !base.has(c)); if (left.length) bad.push(left.length + ' reserved cells left after taking everything down');
    void TIER_NAMES; void cellX; void cellZ;
    return bad.length === 0 || bad.join(' | ');
  });
}
