import * as PD from '../plushdata.js';
// split.* (wave 2B): the four items at the bench and in the hand (unlocks, prices, placing, converting a belt, the hammer), their settings (cfg, copy and paste),
// readouts, power, saves and the look. The behavior on belts is in split_belts.js.
import { makeSplitKit, UP, UPB, RAR, NEEDLE } from './split_lib.js';
import { recipes } from '../crafting.js';
import { UPGRADES, isUnlocked, computeTuning, effLevels } from '../upgrades.js';
import { infoFor } from '../info.js';
import { CONTROLS } from '../controls.js';
import { PART_PRICE, PART_KW, K, beltKw, partOf, TIER_KW } from '../beltdata.js';
import * as SP from '../splitparts.js';
import * as SR from '../splitrules.js';
import * as EXT from '../ext.js';
import { idx } from '../config.js';

export default async function (ctx) {
  const { g, S, L, toI, toK, cellX, cellZ, fresh } = ctx;
  const X = makeSplitKit(ctx), T = X.T, K0 = X.K;
  const R = (min, max) => (max === undefined ? { k: 'rarity', v: min } : { k: 'rarity', v: min, w: max });
  const ANY = { k: 'any' }, NONE = { k: 'none' };
  const json = (v) => JSON.parse(JSON.stringify(v));
  const up = (id) => UPGRADES.find((u) => u.id === id);
  const row = (id) => recipes(g).find((r) => r.id === id);
  const tierOf0 = (t) => (t && t.tier) || 0;
  const kids = (t) => (L().objs.get(t.id) ? L().objs.get(t.id).children.length : -1);

  // ======================================================================= unlocks and the bench
  await T('split.upgrades-gate-the-four-items-and-cost-what-the-design-says', async () => {
    const bad = [], want = { beltMerge: 450e3, prioMerge: 2.5e6, smartSplit: 2e6, progSplit: 40e6 };
    for (const [id, c] of Object.entries(want)) { const u = up(id); if (!u) bad.push('no upgrade ' + id); else if (u.cost.length !== 1 || u.cost[0] !== c) bad.push(`${id} costs ${u.cost} (absolute ${c} wanted, no COST_SCALE)`); }
    const S0 = { stats: { plush: 1e12 } }, lv = (o) => ({ ...o });
    if (isUnlocked(up('beltMerge'), lv({}), S0) || !isUnlocked(up('beltMerge'), lv({ splitter: 1 }), S0)) bad.push('Belt Mergers follow Belt Splitters');
    if (isUnlocked(up('prioMerge'), lv({ splitter: 1 }), S0) || !isUnlocked(up('prioMerge'), lv({ beltMerge: 1 }), S0)) bad.push('Priority Mergers follow Belt Mergers');
    if (isUnlocked(up('smartSplit'), lv({ beltSpeed: 3 }), S0) || !isUnlocked(up('smartSplit'), lv({ beltSpeed: 4 }), S0)) bad.push('Smart Splitters need Belt Motors 4');
    if (isUnlocked(up('progSplit'), lv({ optics: 3 }), S0)) bad.push('Programmable Splitters need Smart Splitters');
    if (!isUnlocked(up('progSplit'), lv({ smartSplit: 1 }), S0)) bad.push('Programmable Splitters open after Smart Splitters');
    for (const id of Object.keys(want)) if (up(id).max !== 1 || !/[a-z]/i.test(up(id).desc) || /[—–]/.test(up(id).desc + up(id).name)) bad.push('text of ' + id);
    // the bench: nothing without the upgrade, and the Programmable one needs the Smart one as well
    fresh({ ...UP, beltMerge: 0, prioMerge: 0, smartSplit: 0, progSplit: 0 }); g.rebuildTools();
    for (const id of SP.PART_IDS) if (row(id)) bad.push(id + ' on the bench before its upgrade');
    fresh({ ...UP, prioMerge: 0, smartSplit: 0, progSplit: 0 }); if (!row('merger') || row('pmerger')) bad.push('Belt Mergers alone');
    fresh({ ...UP, smartSplit: 1, progSplit: 0 }); if (!row('ssplit') || row('psplit')) bad.push('Smart Splitters alone');
    fresh({ ...UP }); for (const id of SP.PART_IDS) if (!row(id)) bad.push(id + ' missing with every upgrade');
    // the tuning flags come from the upgrades
    const t = computeTuning(effLevels({ up: { beltMerge: 1, prioMerge: 1, smartSplit: 1, progSplit: 1 }, gear: {} }), S().boosts);
    if (!t.mergeOn || !t.pmergeOn || !t.smartOn || !t.progOn) bad.push('flags: ' + [t.mergeOn, t.pmergeOn, t.smartOn, t.progOn]);
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.bench-prices-follow-the-design-times-three', async () => {
    fresh({ ...UP }); g.rebuildTools(); const bad = [];
    for (const [id, p] of Object.entries(PART_PRICE)) { const r = row(id); if (!r) { bad.push('no row ' + id); continue; } if (r.price !== Math.round(p * K)) bad.push(`${id}: ${r.price}, wanted ${p} x 3`); if (!r.desc || !r.use || !r.status || /[—–]|undefined|NaN/.test((r.desc + r.use + r.status).replace(/Any undefined/g, ''))) bad.push(id + ' text'); if (r.kind !== id) bad.push(id + ' kind ' + r.kind); }
    if (PART_PRICE.merger !== 60 || PART_PRICE.pmerger !== 400 || PART_PRICE.ssplit !== 4000 || PART_PRICE.psplit !== 60000) bad.push('the design prices changed');
    // buying through the bench takes the money
    S().money = 1e9; const m0 = S().money; g.craftItem('ssplit', 2); if (S().items.ssplit !== 2 || m0 - S().money !== 24000) bad.push('crafting 2 Smart Splitters spent ' + (m0 - S().money));
    // a 10 million wallet buys a Programmable Splitter many times over, and the whole chain of upgrades stays within 10M+ runs
    const chain = ['beltMerge', 'prioMerge', 'smartSplit', 'progSplit'].reduce((a, id) => a + up(id).cost[0], 0);
    if (chain > 60e6) bad.push('the upgrades cost ' + chain);
    return bad.length === 0 || bad.join('; ');
  });

  // ======================================================================= placing and converting
  await T('split.place-convert-refund-and-hammer', async () => {
    const bad = [], i = toI(-6.6), k = toK(1.2);
    X.setup(UPB);
    // on bare floor
    let r = await K0.put('merger', { x: -6.6, z: 1.2, dir: 0 }); if (!r.ok) return 'merger on the floor: ' + r.why;
    let t = L().byId.get(r.ent.id);
    if (!t || t.type !== 'belt' || t.merger !== true || t.smart || t.splitter || tierOf0(t) !== 0 || t.i !== i || t.k !== k || r.consumed !== 1) bad.push('merger on the floor: ' + JSON.stringify(t && { m: t.merger, tier: t.tier, i: t.i, k: t.k, c: r.consumed }));
    if (!L().objs.get(t.id) || !L().parts.has(t)) bad.push('the merger has no mesh or is not tracked');
    g.doDecon({ kind: 'tile', id: t.id }); if (S().items.merger !== 1 || L().tileAt(i, 0, k)) bad.push('the hammer gave back ' + JSON.stringify(S().items));
    // over a Mk2 belt with plush on it: the mark and the plush stay
    X.lay(1, 1, i, k, 0); const belt = L().tileAt(i, 0, k); belt.items = [{ sp: RAR(1), vr: 0, t: 0.2 }, { sp: RAR(2), vr: 0, t: 0.6 }];
    const n0 = S().entities.length, id0 = belt.id;
    r = await K0.put('ssplit', { x: -6.6, z: 1.2, dir: 0 }); if (!r.ok) return 'ssplit over a belt: ' + r.why + ' ' + r.hint;
    t = L().tileAt(i, 0, k);
    if (!t || t.id === id0 || L().byId.has(id0) || !t.smart || t.smart !== 1 || !t.splitter || t.tier !== 1 || t.items.length !== 2 || S().entities.length !== n0) bad.push('conversion: ' + JSON.stringify(t && { id: t.id, smart: t.smart, tier: t.tier, items: t.items.length, ents: S().entities.length - n0 }));
    if (S().items.ssplit !== undefined || S().items.belt) bad.push('items after converting: ' + JSON.stringify(S().items));
    if (JSON.stringify(t.rules) !== JSON.stringify(SR.defaultRules())) bad.push('a new Smart Splitter starts with Any on every output');
    // over a plain splitter: the splitter comes back
    g.doDecon({ kind: 'tile', id: t.id }); S().items = {}; g.rebuildTools();
    const plainSp = g.placeEntity('belt', { i, j: 0, k, dir: 0, rise: 0, splitter: true, items: [] }, { quiet: true, rebuild: false }); L().dirty = true;
    r = await K0.put('ssplit', { x: -6.6, z: 1.2, dir: 0 }); if (!r.ok) return 'ssplit over a splitter: ' + r.why;
    if (S().items.splitter !== 1) bad.push('the plain splitter did not come back: ' + JSON.stringify(S().items));
    t = L().tileAt(i, 0, k); if (!t.smart || L().byId.has(plainSp.id)) bad.push('not converted');
    // a Programmable Splitter over it keeps the rules and hands the Smart one back
    if (g.setCfg(t, { rules: [[R(3)], [{ k: 'shiny' }], [{ k: 'undef' }]] }).ok !== true) bad.push('rules refused');
    S().items = {}; r = await K0.put('psplit', { x: -6.6, z: 1.2, dir: 0 }); if (!r.ok) return 'psplit over a smart: ' + r.why;
    t = L().tileAt(i, 0, k);
    if (t.smart !== 2 || JSON.stringify(t.rules) !== JSON.stringify([[R(3)], [{ k: 'shiny' }], [{ k: 'undef' }]]) || S().items.ssplit !== 1) bad.push('programmable: ' + JSON.stringify({ s: t.smart, r: t.rules, items: S().items }));
    // the hammer hands the part back, and the plush go into your hands
    t.items = [{ sp: RAR(0), vr: 0, t: 0.5 }]; S().items = {}; g.doDecon({ kind: 'tile', id: t.id });
    if (S().items.psplit !== 1 || S().items.ssplit || S().items.splitter || S().carry.length !== 1) bad.push('hammer on a Programmable Splitter: ' + JSON.stringify(S().items) + ' carry ' + S().carry.length);
    // a merger turns into a Priority Merger
    X.lay(0, 1, i, k, 0); S().items = {}; await K0.put('merger', { x: -6.6, z: 1.2, dir: 0 }); S().items = {};
    r = await K0.put('pmerger', { x: -6.6, z: 1.2, dir: 0 }); if (!r.ok) return 'pmerger over a merger: ' + r.why;
    t = L().tileAt(i, 0, k); if (t.merger !== 'prio' || JSON.stringify(t.lanes) !== '[0,1,2]' || S().items.merger !== 1) bad.push('priority merger: ' + JSON.stringify({ m: t.merger, l: t.lanes, items: S().items }));
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.what-a-belt-may-become', async () => {
    const bad = [], belt = { type: 'belt' };
    const ok = (t, id) => SP.convertProblem(t, id) === null;
    for (const id of SP.PART_IDS) if (!ok(belt, id)) bad.push('a plain belt cannot become ' + id);
    for (const [name, t] of [['lift', { type: 'belt', lift: { h: 3 } }], ['underground end', { type: 'belt', ug: { role: 'in' } }], ['hose', { type: 'belt', hose: true }], ['ramp', { type: 'belt', rise: 1 }], ['gate', { type: 'belt', detector: true }], ['sorter', { type: 'sorter' }], ['nothing', null]]) {
      for (const id of SP.PART_IDS) if (ok(t, id)) bad.push(`a ${name} became ${id}`);
    }
    const merger = { type: 'belt', merger: true }, pm = { type: 'belt', merger: 'prio' }, sp = { type: 'belt', splitter: true }, sm = { type: 'belt', splitter: true, smart: 1 }, pg = { type: 'belt', splitter: true, smart: 2 };
    const table = { merger: [[merger, false], [pm, false], [sp, false], [sm, false]], pmerger: [[merger, true], [pm, false], [sp, false], [sm, false]], ssplit: [[sp, true], [sm, false], [pg, false], [merger, false]], psplit: [[sp, true], [sm, true], [pg, false], [merger, false], [pm, false]] };
    for (const [id, cases] of Object.entries(table)) cases.forEach(([t, want], n) => { if (ok(t, id) !== want) bad.push(`${id} over case ${n}: ${SP.convertProblem(t, id)}`); });
    for (const [id, t] of [['merger', merger], ['pmerger', pm], ['ssplit', sm], ['psplit', pg]]) { const why = SP.convertProblem(t, id); if (!why || /[—–]/.test(why)) bad.push('the refusal for ' + id + ': ' + why); }
    if (partOf(merger) !== 'merger' || partOf(pm) !== 'pmerger' || partOf(sm) !== 'ssplit' || partOf(pg) !== 'psplit' || partOf(sp) !== 'splitter' || partOf(belt) !== null) bad.push('partOf');
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.locked-parts-cannot-be-placed-even-with-the-item', async () => {
    X.setup({ ...UPB, smartSplit: 0, progSplit: 0, prioMerge: 0 }); const bad = [], i = toI(-6.6), k = toK(1.2);
    for (const id of ['pmerger', 'ssplit', 'psplit']) {
      const why = SP.problem(g, id, { type: 'belt', i, j: 0, k, dir: 0 }); if (!why || !/not unlocked/.test(why)) bad.push(id + ' placeable while locked: ' + why);
      const c = SP.conflict(g, { type: 'belt', i, j: 0, k, dir: 0 }, { id, kind: id }); if (!c) bad.push(id + ' conflict passes while locked');
    }
    if (SP.problem(g, 'merger', { type: 'belt', i, j: 0, k, dir: 0 }) !== null) bad.push('the merger is unlocked and should place');
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.higher-mark-belt-over-a-part-keeps-the-part', async () => {
    X.setup(UPB); const bad = [], i = toI(-6.6), k = toK(1.2);
    const s = X.part('ssplit', i, k, 0, 0, 0); g.setCfg(s, { rules: [[R(2)], [NONE], [ANY]] });
    const r = await K0.put('belt:2', { x: -6.6, z: 1.2, dir: 0 }); if (!r.ok) return 'upgrade plan: ' + r.why;
    const t = L().tileAt(i, 0, k);
    if (!t || t.tier !== 2 || !t.smart || JSON.stringify(t.rules) !== JSON.stringify([[R(2)], [NONE], [ANY]])) bad.push('after the upgrade: ' + JSON.stringify(t && { tier: t.tier, smart: t.smart, rules: t.rules }));
    if (S().items.belt !== 1) bad.push('the old belt did not come back: ' + JSON.stringify(S().items));
    return bad.length === 0 || bad.join('; ');
  });

  // ======================================================================= settings
  await T('split.cfg-whitelist-checks-and-refusals', async () => {
    X.setup(UPB); const bad = [], i = X.i0() + 2, k = X.k0() + 6;
    const sm = X.part('ssplit', i, k, 0), pg = X.part('psplit', i + 3, k, 0), pm = X.part('pmerger', i + 6, k, 0), mg = X.part('merger', i + 9, k, 0);
    const plain = g.placeEntity('belt', { i: i + 3, j: 0, k: k + 4, dir: 0, rise: 0, splitter: true, items: [] }, { quiet: true, rebuild: false }); const belt = X.lay(0, 1, i + 6, k + 4, 0)[0];
    const no = (t, patch, re, what) => { const before = JSON.stringify(t); const r = g.setCfg(t, patch); if (r.ok) bad.push(`${what}: accepted`); else if (re && !re.test(r.why)) bad.push(`${what}: reason "${r.why}"`); if (JSON.stringify(t) !== before) bad.push(`${what}: changed the piece`); };
    const yes = (t, patch, what) => { const r = g.setCfg(t, patch); if (!r.ok) bad.push(`${what}: refused "${r.why}"`); };
    yes(sm, { rules: [[R(3)], [{ k: 'species', v: RAR(2) }], [{ k: 'overflow' }]] }, 'smart rules'); yes(sm, { mode: 'prio', prio: [1, 2, 0] }, 'smart order'); yes(sm, { mode: 'rr' }, 'smart back to round robin');
    no(sm, { rules: [[ANY, NONE], [], []] }, /exactly one rule|Bad value/, 'two rules on a smart output');
    no(sm, { rules: [[R(4, 2)], [], []] }, /exactly one rule|Bad value/, 'a rarity range upside down');
    no(sm, { rules: [[{ k: 'species', v: 0 }], [], []] }, /exactly one rule|Bad value/, 'species 0');
    no(sm, { rules: [[{ k: 'species', v: PD.BULK }], [], []] }, /exactly one rule|Bad value/, 'a bulkhead species');
    no(sm, { rules: [[{ k: 'bogus' }], [], []] }, /Bad value/, 'an unknown rule kind');
    no(sm, { rules: [[ANY], [ANY]] }, /exactly one rule|Bad/, 'two outputs');
    no(sm, { rules: 'any' }, /Bad value/, 'rules as text');
    no(sm, { prio: [0, 0, 1] }, /once each/, 'a bad priority list');
    no(sm, { mode: 'fast' }, /Bad value/, 'a bad mode');
    no(sm, { def: 1 }, /default output/, 'a default output on a smart one');
    no(sm, { lanes: [0, 1, 2] }, /Unknown setting/, 'lanes on a splitter');
    no(sm, { evil: 1 }, /Unknown setting/, 'an unknown key');
    no(sm, { rules: [[ANY], [ANY], [ANY]], evil: 1 }, /Unknown setting/, 'a good key with a bad one (the whole patch is refused)');
    no(sm, { smart: 2 }, /Unknown setting/, 'a Smart Splitter promoting itself');
    // programmable
    yes(pg, { rules: [[ANY, R(4), { k: 'one' }, { k: 'shiny' }, { k: 'species', v: RAR(1) }, NONE, { k: 'undef' }, { k: 'overflow' }], [], [ANY]], def: 2 }, 'eight rules and a default');
    no(pg, { rules: [[ANY, ANY, ANY, ANY, ANY, ANY, ANY, ANY, ANY], [], []] }, /up to eight|Bad value/, 'nine rules');
    no(pg, { def: 3 }, /Bad value/, 'a default that is not an output'); yes(pg, { def: -1 }, 'no default');
    // priority merger
    yes(pm, { lanes: [2, 1, 0] }, 'lane order'); no(pm, { lanes: [2, 2, 0] }, /once each/, 'a bad lane list'); no(pm, { rules: [[ANY], [ANY], [ANY]] }, /Unknown setting/, 'rules on a merger'); no(pm, { mode: 'prio' }, /Unknown setting/, 'an order on a merger');
    no(mg, { lanes: [0, 1, 2] }, /no settings/, 'lanes on a plain merger'); no(plain, { rules: [[ANY], [ANY], [ANY]] }, /no settings/, 'rules on a plain splitter'); no(belt, { lanes: [0, 1, 2] }, /no settings/, 'settings on a belt');
    // the mesh is rebuilt after a patch (one more pip for each extra rule)
    const before = kids(pg); yes(pg, { rules: [[ANY, R(4), NONE], [], [ANY]] }, 'rules (3)'); if (kids(pg) === before) bad.push('the mesh did not change with the rules');
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.copy-and-paste-settings', async () => {
    X.setup(UPB); const bad = [], i = X.i0() + 2, k = X.k0() + 6;
    const sm = X.part('ssplit', i, k, 0), sm2 = X.part('ssplit', i + 3, k, 0), pg = X.part('psplit', i + 6, k, 0), pm = X.part('pmerger', i, k + 4, 0), pm2 = X.part('pmerger', i + 3, k + 4, 0), mg = X.part('merger', i + 6, k + 4, 0);
    const rules = [[R(3)], [{ k: 'shiny' }], [{ k: 'undef' }]];
    g.setCfg(sm, { rules, mode: 'prio', prio: [2, 1, 0] });
    if (!g.copyCfg(sm) || !g.cfgClip) return 'nothing copied from a Smart Splitter';
    let r = g.pasteCfg(sm2); if (!r.ok || JSON.stringify(sm2.rules) !== JSON.stringify(rules) || sm2.mode !== 'prio' || sm2.prio.join() !== '2,1,0') bad.push('smart to smart: ' + JSON.stringify(r) + JSON.stringify(sm2.rules));
    r = g.pasteCfg(pg); if (!r.ok || JSON.stringify(pg.rules) !== JSON.stringify(rules)) bad.push('smart to programmable: ' + JSON.stringify(r));
    r = g.pasteCfg(mg); if (r.ok) bad.push('settings of a splitter pasted into a merger'); else if (r.why === undefined) bad.push('no reason');
    // the other way: a programmable splitter with several rules cannot go onto a smart one, and nothing changes there
    g.setCfg(pg, { rules: [[ANY, R(4)], [], [NONE]], def: 1 }); g.copyCfg(pg);
    const before = JSON.stringify(sm2.rules); r = g.pasteCfg(sm2);
    if (r.ok || !/exactly one rule|default output|Bad value/.test(r.why) || JSON.stringify(sm2.rules) !== before) bad.push('programmable onto smart: ' + JSON.stringify(r));
    // a priority merger's lane order
    g.setCfg(pm, { lanes: [1, 2, 0] }); g.copyCfg(pm); r = g.pasteCfg(pm2); if (!r.ok || pm2.lanes.join() !== '1,2,0') bad.push('lane order paste: ' + JSON.stringify(r));
    r = g.pasteCfg(sm); if (r.ok) bad.push('lane order pasted into a splitter');
    // a plain merger has nothing to copy, and a plain belt neither
    g.cfgClip = null; if (g.copyCfg(mg) || g.cfgClip) bad.push('a plain merger copied something');
    const belt = X.lay(0, 1, i + 9, k, 0)[0]; if (g.copyCfg(belt) || g.cfgClip) bad.push('a plain belt copied something');
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.shift-e-and-e-copy-paste-by-aim', async () => {
    X.setup(UPB); const bad = [], i = toI(-6.6), k = toK(1.2), k2 = k + 3;
    const a = X.part('ssplit', i, k, 0), b = X.part('ssplit', i, k2, 0); g.setCfg(a, { rules: [[R(5)], [ANY], [NONE]] });
    K0.aimDir(cellX(i), 0.2, cellZ(k), 0, 2.0); ctx.adv(0.05); if (EXT.aimedEnt(g) !== a) return 'not aiming at the first splitter';
    if (!EXT.copyKey(g) || !g.cfgClip || g.cfgClip.type !== 'belt') bad.push('Shift+E did not copy');
    K0.aimDir(cellX(i), 0.2, cellZ(k2), 0, 2.0); ctx.adv(0.05); if (EXT.aimedEnt(g) !== b) return 'not aiming at the second splitter';
    g.useKey(); if (JSON.stringify(b.rules) !== JSON.stringify(a.rules)) bad.push('E did not paste: ' + JSON.stringify(b.rules));
    if (g.ui.openModal === 'splitpanel') bad.push('E opened the panel instead of pasting');
    g.cfgClip = null; g.useKey(); if (g.ui.openModal !== 'splitpanel') bad.push('plain E on a Smart Splitter opens its rules panel'); g.ui.closeModals();
    // plain E on a plain belt is still the old E (nothing opens)
    const belt = X.lay(0, 1, i, k + 6, 0)[0]; K0.aimDir(cellX(i), 0.2, cellZ(k + 6), 0, 2.0); ctx.adv(0.05); g.useKey(); if (g.ui.openModal === 'splitpanel') bad.push('E on a belt opened the panel');
    void belt; return bad.length === 0 || bad.join('; ');
  });

  await T('split.panel-edits-go-through-cfg', async () => {
    const nap = (ms = 70) => new Promise((r) => setTimeout(r, ms));
    X.setup(UPB); const bad = [], i = X.i0() + 2, k = X.k0() + 6, SPN = await import('../splitpanel.js');
    const s = X.part('psplit', i, k, 0), m = X.part('pmerger', i + 4, k, 0);
    SPN.openPanel(g, s.id); const el = document.getElementById('splitpanel');
    if (!el || el.classList.contains('hidden') || g.ui.openModal !== 'splitpanel') return 'the panel did not open';
    const body = () => el.querySelector('#spBody'), title = () => el.querySelector('#spTitle').textContent;
    if (title() !== 'PROGRAMMABLE SPLITTER' || body().querySelectorAll('[data-slot]').length !== 3) bad.push('layout: ' + title());
    const click = (sel) => { const b = body().querySelector(sel); if (!b) { bad.push('no button ' + sel); return; } b.click(); };
    const change = (sel, v) => { const x = body().querySelector(sel); if (!x) { bad.push('no control ' + sel); return; } x.value = v; x.dispatchEvent(new Event('change', { bubbles: true })); };
    // set the forward output to "Rare and better" plus one more rule
    change('[data-a="kind"][data-s="0"]', 'rarity'); change('[data-a="rmin"][data-s="0"]', '2'); click('[data-a="set"][data-s="0"]');
    if (JSON.stringify(s.rules[0]) !== JSON.stringify([ANY, R(2)])) bad.push('rule added by the panel: ' + JSON.stringify(s.rules[0]));
    click('[data-a="rm"][data-s="0"][data-q="0"]'); if (JSON.stringify(s.rules[0]) !== JSON.stringify([R(2)])) bad.push('rule removed: ' + JSON.stringify(s.rules[0]));
    // a species by name: the dex must know it
    const sp = RAR(3, 3); S().dex[sp] = 1; const nm = ctx.species[sp].name;
    change('[data-a="kind"][data-s="1"]', 'species'); const q = body().querySelector('[data-a="q"][data-s="1"]'); q.value = nm; q.dispatchEvent(new Event('input', { bubbles: true }));
    const pick = body().querySelector('#spRes1 [data-a="pick"]'); if (!pick) bad.push('the search found nothing for ' + nm); else { pick.click(); click('[data-a="set"][data-s="1"]'); if (!s.rules[1].some((r) => r.k === 'species' && r.v === sp)) bad.push('species rule not set: ' + JSON.stringify(s.rules[1])); }
    // order and default
    const prio = body().querySelector('[data-a="mode"][value="prio"]'); prio.checked = true; prio.dispatchEvent(new Event('change', { bubbles: true }));
    if (s.mode !== 'prio') bad.push('mode not set');
    await nap();
    click('[data-a="down"][data-q="0"]'); if (s.prio.join() !== '1,0,2') bad.push('priority order: ' + s.prio);
    const def = body().querySelector('[data-a="def"][value="2"]'); def.checked = true; def.dispatchEvent(new Event('change', { bubbles: true })); if (s.def !== 2) bad.push('default: ' + s.def);
    click('[data-a="reset"]'); if (JSON.stringify(s.rules) !== JSON.stringify(SR.defaultRules()) || s.mode !== 'rr' || s.def !== -1) bad.push('reset: ' + JSON.stringify([s.rules, s.mode, s.def]));
    // a refused edit says why and changes nothing
    await nap(); S().carry = []; change('[data-a="kind"][data-s="2"]', 'species'); click('[data-a="hand"][data-s="2"]'); click('[data-a="set"][data-s="2"]'); if (JSON.stringify(s.rules) !== JSON.stringify(SR.defaultRules())) bad.push('a species rule with no species was set');
    // the priority merger panel
    await nap(); SPN.openPanel(g, m.id); if (title() !== 'PRIORITY MERGER') bad.push('merger title ' + title());
    click('[data-a="ldown"][data-q="0"]'); if (m.lanes.join() !== '1,0,2') bad.push('lane order: ' + m.lanes);
    // taking the piece down closes the panel on the next refresh
    g.doDecon({ kind: 'tile', id: m.id }); SPN.openPanel(g, m.id); if (g.ui.openModal === 'splitpanel') bad.push('a panel for a missing piece stays open'); g.ui.closeModals();
    if (/[—–]/.test(el.textContent)) bad.push('a dash in the panel text');
    return bad.length === 0 || bad.join('; ');
  });

  // ======================================================================= power
  await T('split.power-draw-and-hand-crank', async () => {
    X.setup(UPB); const bad = [], i = X.i0(), k = X.k0();
    g.placeEntity('pole', { i: i + 1, j: 0, k: k - 4, dir: 0 }, { quiet: true, rebuild: false });
    const ids = ['merger', 'pmerger', 'ssplit', 'psplit']; const parts = ids.map((id, n) => X.part(id, i, k - 8 + n * 2, 0)); const plain = X.lay(0, 1, i, k - 10, 0)[0];
    g.power.recompute(); const net = g.power.nets.find((n) => n.nodes.some((x) => x.type === 'pole')); if (!net) return 'no grid';
    const want = ids.reduce((a, id) => a + PART_KW[id], 0) + TIER_KW[0];
    if (Math.abs(net.demand - want) > 1e-6) bad.push(`grid demand ${net.demand}, wanted ${want}`);
    if (PART_KW.merger !== 0.2 || PART_KW.pmerger !== 0.3 || PART_KW.ssplit !== 1.5 || PART_KW.psplit !== 3.0) bad.push('kW changed');
    parts.forEach((t, n) => { if (beltKw(t) !== PART_KW[ids[n]]) bad.push(ids[n] + ' beltKw ' + beltKw(t)); });
    // a Mk6 tile never draws less than its belt
    const t6 = X.part('merger', i + 4, k, 0, 5); if (beltKw(t6) !== TIER_KW[5] && beltKw(t6) !== Math.max(TIER_KW[5], PART_KW.merger)) bad.push('Mk6 merger ' + beltKw(t6));
    void plain; return bad.length === 0 || bad.join('; ');
  });

  // ======================================================================= readouts
  await T('split.hover-readouts-name-the-rules-lanes-and-rate', async () => {
    X.setup(UPB); const bad = [], r = X.rigS('ssplit', 2), r3 = X.rig3('pmerger', 1, { lanes: [2, 0, 1] });
    g.setCfg(r.s, { rules: [[R(2)], [{ k: 'species', v: RAR(2) }], [{ k: 'overflow' }]] }); X.run(0.3, () => {});
    const text = (t) => { const o = infoFor(g, { kind: 'tile', id: t.id }); return o ? o.title + '\n' + o.lines.join('\n') : ''; };
    let s = text(r.s);
    if (!/SMART SPLITTER MK3/.test(s) || !/Forward: Rare and better/.test(s) || !/Right: /.test(s) || !/Left: Overflow/.test(s) || !/635 plush per min/.test(s) || !/round robin/i.test(s)) bad.push('smart readout: ' + s);
    if (!new RegExp(ctx.species[RAR(2)].name).test(s)) bad.push('the species rule is not named');
    s = text(r3.m); if (!/PRIORITY MERGER MK2/.test(s) || !/Priority: 1 Right, 2 Back, 3 Left/.test(s) || !/Back: 1 line/.test(s) || !/424 plush per min/.test(s)) bad.push('priority merger readout: ' + s);
    const m = X.part('merger', X.i0() + 2, X.k0() + 9, 0); X.run(0.1, () => {}); s = text(m); if (!/BELT MERGER/.test(s) || !/nothing feeds it/.test(s) || !/no lane starves/.test(s)) bad.push('merger readout: ' + s);
    const pg = X.part('psplit', X.i0() + 2, X.k0() + 12, 0); s = text(pg); if (!/PROGRAMMABLE SPLITTER/.test(s)) bad.push('programmable title');
    for (const t of [r.s, r3.m, m, pg]) { const x = text(t); if (/undefined|NaN|\[object|[—–]/.test(x.replace(/Any undefined/g, ''))) bad.push('bad text: ' + x); }
    // unpowered says so
    r.s.pw = 0; const dead = infoFor(g, { kind: 'tile', id: r.s.id }); if (!/Unpowered/.test(dead.lines.join())) bad.push('no unpowered line');
    return bad.length === 0 || bad.join('; ');
  });

  // ======================================================================= saves
  await T('split.survives-save-and-reload-and-old-saves-load', async () => {
    X.setup(UPB); const bad = [], i = X.i0() + 2, k = X.k0() + 6;
    const sm = X.part('ssplit', i, k, 0, 1), pg = X.part('psplit', i + 3, k, 0, 2), pm = X.part('pmerger', i + 6, k, 0, 3), mg = X.part('merger', i + 9, k, 0);
    g.setCfg(sm, { rules: [[R(3)], [{ k: 'shiny' }], [{ k: 'undef' }]], mode: 'prio', prio: [1, 0, 2] }); g.setCfg(pg, { rules: [[ANY, R(5)], [{ k: 'one' }], [NONE]], def: 2 }); g.setCfg(pm, { lanes: [2, 0, 1] });
    sm.rr = 2; mg.mrr = 1;
    const view = (t) => JSON.stringify([t.i, t.j, t.k, t.dir, t.tier || 0, t.merger, t.smart, t.splitter, t.rules, t.mode, t.prio, t.def, t.lanes]);
    const was = [sm, pg, pm, mg].map(view), ids = [sm, pg, pm, mg].map((t) => t.id);
    const raw = JSON.parse(JSON.stringify(S().entities.filter((e) => ids.includes(e.id))));
    for (const t of [sm, pg, pm, mg]) { L().remove(t); S().entities = S().entities.filter((e) => e.id !== t.id); }
    for (const e of raw) { S().entities.push(e); g.addEntity(e); }
    L().update(0.05);
    const now = ids.map((id) => L().byId.get(id)); now.forEach((t, n) => { if (!t) bad.push('lost ' + ids[n]); else { if (view(t) !== was[n]) bad.push(`piece ${n}: ${view(t)} vs ${was[n]}`); if (!L().objs.get(t.id) || !L().parts.has(t)) bad.push('piece ' + n + ' has no mesh'); } });
    // an old save: a tile with the flag but no rules, or bad rules, still deals; a smart tile can never hold rules it may not
    for (const [name, patch] of [['no rules', { rules: undefined }], ['bad rules', { rules: 'x' }], ['two rules on a smart one', { rules: [[ANY, NONE], [ANY], [ANY]] }], ['no lanes', { lanes: undefined }]]) {
      const e = { id: 9000 + bad.length, type: 'belt', i: i, j: 0, k: k + 6, dir: 0, rise: 0, splitter: true, smart: 1, rules: SR.defaultRules(), ...patch }; S().entities.push(e); g.addEntity(e);
      const t = L().byId.get(e.id); if (!SR.cleanRules(t.rules, 1)) bad.push(name + ': rules ' + JSON.stringify(t.rules)); L().remove(t); S().entities = S().entities.filter((x) => x.id !== e.id);
    }
    const old = { id: 9100, type: 'belt', i, j: 0, k: k + 6, dir: 0, rise: 0, merger: 'prio' }; S().entities.push(old); g.addEntity(old); L().update(0.05);
    const pt = L().byId.get(9100); if (!pt || !L().objs.get(9100) || typeof L().mergeLane(pt, 0) !== 'number') bad.push('a Priority Merger saved without lanes does not load'); void pt;
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.old-world-with-plain-splitters-is-untouched', async () => {
    X.setup(UPB); const bad = [], i = X.i0() + 2, k = X.k0() + 6;
    const e = g.placeEntity('belt', { i, j: 0, k, dir: 0, rise: 0, splitter: true, items: [] }, { quiet: true, rebuild: false }); L().dirty = true;
    X.run(0.2, () => {});
    if (e.smart || e.rules || e.merger || e.mrr !== undefined) bad.push('a plain splitter gained fields: ' + Object.keys(e).join());
    if (beltKw(e) !== TIER_KW[0]) bad.push('plain splitter power ' + beltKw(e));
    if (EXT.cfgSpec(e) !== null) bad.push('a plain splitter has settings');
    const info = infoFor(g, { kind: 'tile', id: e.id }); if (!/BELT SPLITTER/.test(info.title)) bad.push('title ' + info.title);
    return bad.length === 0 || bad.join('; ');
  });

  // ======================================================================= look and text
  await T('split.mesh-shows-each-rule-and-each-lane', async () => {
    X.setup(UPB); const bad = [], i = X.i0() + 2, k = X.k0() + 6;
    const s = X.part('psplit', i, k, 0), a = kids(s);
    g.setCfg(s, { rules: [[ANY, R(2), { k: 'one' }, { k: 'shiny' }], [R(1)], [NONE]] }); const b = kids(s);
    if (b !== a + 3) bad.push(`pips: ${a} to ${b} children (three more rules on the forward output)`);
    g.setCfg(s, { mode: 'prio' }); if (kids(s) !== b + 1) bad.push('the priority bar is missing');
    const m = X.part('pmerger', i + 4, k, 0); const c1 = kids(m); g.setCfg(m, { lanes: [1, 0, 2] }); if (kids(m) !== c1) bad.push('a merger redraws with the same number of parts');
    // plate colors tell the four parts apart
    const colors = SP.PART_IDS.map((id, n) => { const t = X.part(id, i + n * 2, k + 4, 0); const o = L().objs.get(t.id); return o.children[0].material.color.getHex(); });
    if (new Set(colors).size !== 4) bad.push('the four plates share colors: ' + colors.map((c) => c.toString(16)));
    // the lamp follows power
    X.run(0.6, () => {}); const lamp = (t) => L().objs.get(t.id).getObjectByName('lamp').material.color.g; const on = lamp(s); s.pw = 0; g.time += 1; L().partLooks(); const off = lamp(s); if (!(on > off)) bad.push(`lamp: on ${on}, off ${off}`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.random-actions-keep-the-world-consistent', async () => {
    X.setup(UPB); const bad = [], i0 = X.i0(), k0 = X.k0() - 6;
    let seed = 4242; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    for (let r = 0; r < 6; r++) X.lay(r % 3, 8, i0, k0 + r * 2, r % 4 === 3 ? 2 : 0);   // a field of belts of three marks for the parts to convert
    const garbage = [{ evil: 1 }, { rules: 5 }, { rules: [[ANY, ANY], [ANY], [ANY]] }, { mode: 'x' }, { lanes: [0, 0, 0] }, { prio: [2, 1] }, { def: 9 }, {}, { rules: [[{ k: 'species', v: -3 }], [ANY], [ANY]] }];
    const randomPatch = (t) => {
      if (t.merger === 'prio') return { lanes: pick([[0, 1, 2], [1, 0, 2], [2, 1, 0], [0, 2, 1]]) };
      const n = t.smart === 2 ? 1 + Math.floor(rnd() * 3) : 1, rule = () => pick([ANY, NONE, { k: 'overflow' }, { k: 'undef' }, R(1), R(2, 4), { k: 'one' }, { k: 'shiny' }, { k: 'species', v: RAR(2, 3) }]);
      return { rules: [0, 1, 2].map(() => Array.from({ length: n }, rule)), mode: pick(['rr', 'prio']), prio: pick([[0, 1, 2], [2, 0, 1]]) };
    };
    let placed = 0, converted = 0, hammered = 0, cfgs = 0, errors = 0;
    for (let step = 0; step < 150; step++) {
      try {
        const a = rnd();
        if (a < 0.4) {
          const dx = Math.floor(rnd() * 8), dz = Math.floor(rnd() * 11), x = cellX(i0 + dx), z = cellZ(k0 + dz), had = L().tileAt(i0 + dx, 0, k0 + dz);
          const r = await K0.put(pick(SP.PART_IDS), { x, z, dir: Math.floor(rnd() * 4) });
          if (r.ok) { placed++; if (had) converted++; }
        } else if (a < 0.55) {
          const t = pick(ctx.tiles().filter((q) => !q.free)); if (t) { g.doDecon({ kind: 'tile', id: t.id }); hammered++; }
        } else if (a < 0.85) {
          const t = pick([...L().parts]); if (t) { const patch = rnd() < 0.7 ? randomPatch(t) : pick(garbage); const before = JSON.stringify(t); const r = g.setCfg(t, patch); cfgs++; if (!r.ok && JSON.stringify(t) !== before) bad.push('step ' + step + ': a refused patch changed the piece'); }
        } else X.run(0.4, () => {});
      } catch (e) { errors++; bad.push('step ' + step + ' threw: ' + e.message); break; }
    }
    X.run(2, () => {});
    // the world agrees with itself
    const tilesNow = ctx.tiles().filter((t) => t.type === 'belt'), ents = new Set(S().entities.map((e) => e.id));
    for (const t of tilesNow) {
      if (!ents.has(t.id)) bad.push('tile ' + t.id + ' is not an entity'); if (L().byId.get(t.id) !== t) bad.push('byId lost ' + t.id);
      if (!g.world.reserved.has(idx(t.i, t.j, t.k))) bad.push('the cell of ' + t.id + ' is not reserved');
      const isPart = !!(t.merger || t.smart); if (isPart !== L().parts.has(t)) bad.push('parts set wrong for ' + t.id);
      if (isPart && !L().objs.get(t.id)) bad.push('no mesh for ' + t.id);
      if (t.smart && !SR.cleanRules(t.rules, t.smart)) bad.push('bad rules on ' + t.id);
      if (t.merger === 'prio' && !SR.isPerm(t.lanes)) bad.push('bad lanes on ' + t.id);
      if (t.smart && t.merger) bad.push('a tile is both ' + t.id);
    }
    for (const t of L().parts) if (!L().byId.has(t.id)) bad.push('a removed part is still tracked ' + t.id);
    if (placed < 15 || cfgs < 15) bad.push(`the run did too little: ${placed} placed (${converted} conversions), ${cfgs} settings, ${hammered} hammered`);
    // and it all survives a save: every part comes back the same
    const view = (t) => JSON.stringify([t.i, t.j, t.k, t.dir, t.tier || 0, t.merger, t.smart, t.splitter, t.rules, t.mode, t.prio, t.def, t.lanes]);
    const was = new Map(tilesNow.map((t) => [t.id, view(t)])), raw = JSON.parse(JSON.stringify(S().entities.filter((e) => was.has(e.id))));
    for (const t of tilesNow) { L().remove(t); S().entities = S().entities.filter((e) => e.id !== t.id); }
    for (const e of raw) { S().entities.push(e); g.addEntity(e); }
    X.run(0.5, () => {});
    for (const [id, v] of was) { const t = L().byId.get(id); if (!t || view(t) !== v) bad.push('after the reload ' + id + ' differs'); }
    void errors; return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  await T('split.controls-and-readme-text-mention-the-parts', async () => {
    const e = CONTROLS.flatMap((x) => x.rows).filter((r) => r.codes.includes('KeyE')).map((r) => r.what).join(' ');
    const bad = [];
    if (!/splitter/i.test(e) || !/merger/i.test(e)) bad.push('the E rows do not mention splitters and mergers');
    if (/[—–]/.test(e)) bad.push('a dash in the E rows');
    return bad.length === 0 || bad.join('; ');
  });
  void NEEDLE;
}
