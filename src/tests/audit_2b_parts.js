// audit_2b_* (wave 2B audit): the older belt tools (plain Belt Splitter, Detector Gate) aimed at the new parts, and the economy of converting.
import { makeSplitKit, UPB } from './split_lib.js';
import { craft } from '../crafting.js';
import { PART_PRICE, K } from '../beltdata.js';
import { wireName } from '../cables.js';
import * as SP from '../splitparts.js';
import * as EXT from '../ext.js';

export default async function (ctx) {
  const { g, S, L, toI, toK } = ctx;
  const X = makeSplitKit(ctx), T = X.T, K0 = X.K;
  const flags = (t) => ({ merger: t.merger, splitter: t.splitter, detector: t.detector, smart: t.smart });

  for (const id of ['merger', 'pmerger']) {
    await T(`audit.2b.plain-splitter-tool-refuses-a-${id}`, async () => {
      X.setup({ ...UPB, prioMerge: 1 }); const i = toI(-6.6), k = toK(1.2);
      const m = X.part(id, i, k, 0);
      const r = await K0.put('splitter', { x: -6.6, z: 1.2, dir: 0 });
      const t = L().tileAt(i, 0, k);
      if (!t || t.id !== m.id) return 'the part was replaced: ' + JSON.stringify(t && flags(t));
      if (t.splitter || t.detector) return `the ${id} also became: ` + JSON.stringify(flags(t)) + ' (put ' + r.ok + ')';
      return true;
    });
  }

  await T('audit.2b.guest-forged-splitter-or-gate-over-a-merger-is-refused-by-the-host', async () => {
    X.setup({ ...UPB, prioMerge: 1 }); const i = toI(-6.6), k = toK(1.2), bad = [];
    const m = X.part('merger', i, k, 0);
    for (const [kind, type] of [['splitter', 'splitbelt'], ['gate', 'gatebelt']]) {
      const why = g.placeConflict({ id: kind, kind }, { type, id: m.id, i, j: 0, k, dir: 0, rise: 0 });
      if (!why) bad.push(kind + ' over a merger passes the host check');
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('audit.2b.converting-never-makes-money-or-items', async () => {
    // convert a plain splitter into a Smart one, then hammer: the bench items in hand go splitter +1, ssplit +1 total, never more than were spent
    X.setup(UPB); const bad = [], i = toI(-6.6), k = toK(1.2);
    S().money = 1e9;
    const sp = g.placeEntity('belt', { i, j: 0, k, dir: 0, rise: 0, splitter: true, items: [] }, { quiet: true, rebuild: false }); L().dirty = true;
    S().items = {}; g.rebuildTools();
    const m0 = S().money; g.craftItem('ssplit', 1); const spent = m0 - S().money;
    if (spent !== PART_PRICE.ssplit * K) bad.push('spent ' + spent);
    const r = await K0.put('ssplit', { x: -6.6, z: 1.2, dir: 0 }); if (!r.ok) return 'convert: ' + r.why;
    if (S().items.splitter !== 1 || S().items.ssplit) bad.push('after converting: ' + JSON.stringify(S().items));
    const t = L().tileAt(i, 0, k); g.doDecon({ kind: 'tile', id: t.id });
    if (S().items.ssplit !== 1 || S().items.splitter !== 1) bad.push('after the hammer: ' + JSON.stringify(S().items));
    if (S().money !== m0 - spent) bad.push('money moved: ' + (S().money - (m0 - spent)));
    void sp; return bad.length === 0 || bad.join('; ');
  });

  await T('audit.2b.the-hammer-and-the-cable-name-the-part-not-a-plain-belt', async () => {
    X.setup({ ...UPB, prioMerge: 1 }); const i = toI(-6.6), k = toK(1.2), bad = [];
    for (const id of SP.PART_IDS) {
      const t = X.part(id, i, k, 0);
      const a = g.describeRef({ kind: 'tile', id: t.id }), b = wireName(t), want = SP.PARTS[id].name;
      if (a !== want) bad.push(`hammer says "${a}" for ${id}`);
      if (b !== want) bad.push(`cable says "${b}" for ${id}`);
      g.doDecon({ kind: 'tile', id: t.id });
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('audit.2b.nothing-is-crafted-while-locked-or-with-a-bad-count', async () => {
    const { fresh } = ctx, bad = [];
    fresh({ ...UPB, beltMerge: 0, prioMerge: 0, smartSplit: 0, progSplit: 0 }); S().money = 1e12; S().items = {};
    for (const id of SP.PART_IDS) for (const n of [1, 3]) if (craft(g, id, n)) bad.push(`${id} x${n} crafted while locked`);
    if (S().money !== 1e12 || Object.keys(S().items).length) bad.push('locked crafting changed the wallet or the items: ' + S().money + ' ' + JSON.stringify(S().items));
    fresh({ ...UPB }); S().money = 1e9; S().items = {};
    for (const n of [0, -3, NaN, 0.4, 'x', undefined]) if (craft(g, 'psplit', n)) bad.push('psplit crafted for count ' + n);
    if (S().money !== 1e9 || S().items.psplit) bad.push('a bad count changed the wallet or the items');
    if (!craft(g, 'psplit', 2.9) || S().items.psplit !== 2 || 1e9 - S().money !== 2 * PART_PRICE.psplit * K) bad.push('2.9 should buy 2: ' + S().items.psplit + ' ' + (1e9 - S().money));
    return bad.length === 0 || bad.join('; ');
  });

  await T('audit.2b.converting-a-wired-belt-keeps-its-power-cable', async () => {
    X.setup(UPB); const bad = [];
    const gen = g.placeEntity('gen', { i: toI(-9), j: 0, k: toK(3), dir: 0, rise: 0 }, { quiet: true, rebuild: false });
    const gt = L().byId.get(gen.id); gt.burn = 1e5; gt.burnMax = 1e5; gt.lit = true;
    const belt = g.placeEntity('belt', { i: toI(3), j: 0, k: toK(3), dir: 0, rise: 0, items: [] }, { quiet: true, rebuild: false }); L().dirty = true;
    S().items.cable = 3; const c = g.cables.connect(gen.id, belt.id); if (!c.ok) return 'could not wire: ' + c.why;
    g.power.markDirty(); g.power.recompute();
    for (const id of ['merger', 'pmerger']) {
      const cur = ctx.tiles().find((t) => t.type === 'belt' && t.i === toI(3) && t.k === toK(3));
      S().items[id] = 1;
      const r = EXT.buildTool(g, { id, kind: id }, { type: 'convertbelt', id: cur.id, i: cur.i, j: 0, k: cur.k, dir: 0, rise: 0 });
      if (!r) { bad.push('refused ' + id); continue; }
      const cables = g.cables.of(r.id);
      if (cables.length !== 1 || g.cables.other(cables[0], r.id) !== gen.id) bad.push(`${id}: cable ends ${JSON.stringify(g.cables.list())}`);
      g.power.markDirty(); g.power.recompute();
      const t = L().byId.get(r.id);
      if (!(t.pw > 0.05)) bad.push(`${id}: the converted piece has no power (${t.pw})`);
      if ((S().items.cable | 0) !== 2) bad.push(`${id}: cables in hand ${S().items.cable}`);
    }
    return bad.length === 0 || bad.join('; ');
  });
}
