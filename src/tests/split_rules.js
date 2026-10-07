// split.* (wave 2B): the pure part of mergers and ruled splitters, on plain objects (src/splitrules.js). No world, no belts.
import * as SR from '../splitrules.js';
import { pools, NEEDLE, DECOYS, BULK, species } from '../plushdata.js';

export default async function (ctx) {
  const { T } = ctx;
  const sp = (r, n = 0) => pools[r][n];
  const it = (r, vr = 0) => ({ sp: sp(r), vr });
  const rules = (a, b, c) => [a, b, c];
  const R = (min, max) => (max === undefined ? { k: 'rarity', v: min } : { k: 'rarity', v: min, w: max });

  await T('split.rule-any-undef-overflow-order', async () => {
    const bad = [], ord = (t, item, slots = [0, 1, 2]) => SR.route(t, slots, item);
    // explicit first, then Any, then Any undefined
    let t = { rules: rules([R(3)], [{ k: 'any' }], [{ k: 'undef' }]) };
    let r = ord(t, it(4)); if (r.order.join() !== '0') bad.push('an Epic+ item with an explicit output: ' + JSON.stringify(r));
    r = ord(t, it(0)); if (r.order.join() !== '1') bad.push('a Common with Any beside an undef: Any wins (nothing is undefined when Any claims everything): ' + JSON.stringify(r));
    t = { rules: rules([R(3)], [{ k: 'none' }], [{ k: 'undef' }]) };
    r = ord(t, it(0)); if (r.order.join() !== '2' || r.primary !== 1) bad.push('a Common falls to the undefined output: ' + JSON.stringify(r));
    r = ord(t, it(5)); if (r.order.join() !== '0') bad.push('a Mythic still takes its named output: ' + JSON.stringify(r));
    // nothing takes it: it waits (an empty order), until an undef or an overflow exists
    t = { rules: rules([R(3)], [{ k: 'none' }], [{ k: 'none' }]) };
    r = ord(t, it(0)); if (r.order.length !== 0) bad.push('an item no rule takes must wait: ' + JSON.stringify(r));
    t = { rules: rules([R(3)], [{ k: 'overflow' }], [{ k: 'none' }]) };
    r = ord(t, it(0)); if (r.order.join() !== '1' || r.primary !== 0) bad.push('an overflow output catches what nothing takes: ' + JSON.stringify(r));
    // overflow comes after everything that wants the plush
    t = { rules: rules([{ k: 'any' }], [{ k: 'overflow' }], [{ k: 'any' }]) };
    r = ord(t, it(1)); if (r.order.slice(0, 2).sort().join() !== '0,2' || r.order[2] !== 1 || r.primary !== 2) bad.push('overflow last: ' + JSON.stringify(r));
    // an output that is missing is never listed
    r = ord(t, it(1), [0, 1]); if (r.order.join() !== '0,1') bad.push('missing outputs are skipped: ' + JSON.stringify(r));
    // the default output of a Programmable Splitter is an Any undefined
    t = { rules: rules([R(5)], [{ k: 'none' }], [{ k: 'none' }]), def: 2 };
    r = ord(t, it(1)); if (r.order.join() !== '2') bad.push('the default output takes what nothing claims: ' + JSON.stringify(r));
    // a splitter with no rules at all deals like a plain one
    r = ord({}, it(2)); if (r.order.slice().sort().join() !== '0,1,2') bad.push('no rules = every output: ' + JSON.stringify(r));
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.rarity-range-and-species-match', async () => {
    const bad = [], m = (rule, item) => SR.matches(rule, item);
    for (let r = 0; r <= 5; r++) {
      if (m(R(2), it(r)) !== (r >= 2)) bad.push('Rare and better, rarity ' + r);
      if (m(R(1, 3), it(r)) !== (r >= 1 && r <= 3)) bad.push('Uncommon to Epic, rarity ' + r);
      if (m(R(0, 0), it(r)) !== (r === 0)) bad.push('Common only, rarity ' + r);
    }
    if (!m(R(5), { sp: NEEDLE, vr: 0 })) bad.push('Mythic and better holds The One');
    if (m(R(0, 5), { sp: NEEDLE, vr: 0 })) bad.push('a range that ends at Mythic never holds The One');
    if (!m(R(5), { sp: DECOYS[0], vr: 0 })) bad.push('a fake is Mythic');
    if (!m({ k: 'species', v: sp(3, 4) }, { sp: sp(3, 4), vr: 0 }) || m({ k: 'species', v: sp(3, 4) }, { sp: sp(3, 5), vr: 0 })) bad.push('one species only');
    if (!m({ k: 'one' }, { sp: NEEDLE, vr: 0 }) || m({ k: 'one' }, { sp: DECOYS[1], vr: 0 }) || m({ k: 'one' }, it(5))) bad.push('The One rule is The One and nothing else');
    if (!m({ k: 'shiny' }, { sp: sp(0), vr: 128 | 7 }) || m({ k: 'shiny' }, { sp: sp(0), vr: 127 })) bad.push('shiny is bit 128 of the variant');
    for (const k of ['any', 'none', 'overflow', 'undef']) if (m({ k }, it(3))) bad.push(k + ' never claims by name');
    // names and colors exist for every kind, and read as text
    for (const rule of [{ k: 'any' }, { k: 'none' }, { k: 'overflow' }, { k: 'undef' }, R(2), R(0, 1), R(2, 2), R(0), { k: 'species', v: sp(2) }, { k: 'one' }, { k: 'shiny' }]) {
      const n = SR.ruleName(rule); if (!n || n === 'undefined' || /NaN|\[object|[—–]/.test(n)) bad.push('bad name ' + JSON.stringify(rule) + ': ' + n);
      if (!Number.isInteger(SR.ruleColor(rule))) bad.push('no color for ' + rule.k);
    }
    if (SR.ruleName(R(2)) !== 'Rare and better' || SR.ruleName(R(0, 1)) !== 'Uncommon and worse' || SR.ruleName(R(1, 3)) !== 'Uncommon to Epic' || SR.ruleName(R(0)) !== 'Every rarity' || SR.ruleName(R(3, 3)) !== 'Epic only') bad.push('names: ' + [R(2), R(0, 1), R(3, 3), R(1, 3), R(0)].map(SR.ruleName).join(' | '));
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.rules-are-cleaned-and-capped-per-level', async () => {
    const bad = [];
    for (const rule of [{ k: 'rarity', v: 4, w: 2 }, { k: 'rarity', v: -1 }, { k: 'rarity', v: 1.5 }, { k: 'rarity', v: 0, w: 9 }, { k: 'species', v: 0 }, { k: 'species', v: BULK }, { k: 'species', v: NEEDLE }, { k: 'species', v: 99999 }, { k: 'species', v: '5' }, { k: 'bogus' }, null, 5, 'any', []]) {
      if (SR.cleanRule(rule)) bad.push('accepted ' + JSON.stringify(rule));
    }
    if (!SR.cleanRule({ k: 'species', v: DECOYS[2] })) bad.push('a fake can be named');
    const c = SR.cleanRule({ k: 'rarity', v: 2, w: 6, junk: 1 }); if (JSON.stringify(c) !== '{"k":"rarity","v":2}') bad.push('a range with no top is stored without it: ' + JSON.stringify(c));
    const c2 = SR.cleanRule({ k: 'any', v: 4, w: 2 }); if (JSON.stringify(c2) !== '{"k":"any"}') bad.push('a rule keeps only the numbers its kind uses: ' + JSON.stringify(c2));
    const one = [[{ k: 'any' }], [], [R(1)]], many = [[{ k: 'any' }, { k: 'one' }], [], []], eight = [Array(8).fill({ k: 'shiny' }), [], []], nine = [Array(9).fill({ k: 'shiny' }), [], []];
    if (!SR.cleanRules(one, 1)) bad.push('a Smart Splitter takes one rule or none on an output');
    if (SR.cleanRules(many, 1)) bad.push('a Smart Splitter refuses two rules on one output');
    if (!SR.cleanRules(many, 2) || !SR.cleanRules(eight, 2)) bad.push('a Programmable Splitter takes up to eight');
    if (SR.cleanRules(nine, 2)) bad.push('nine rules on one output');
    if (SR.cleanRules([[], []], 2) || SR.cleanRules(null, 2) || SR.cleanRules('x', 2) || SR.cleanRules([[], [], [], []], 2)) bad.push('the rules are three lists');
    const d = SR.defaultRules(); if (d.length !== 3 || d.some((l) => l.length !== 1 || l[0].k !== 'any')) bad.push('the default is Any on every output');
    if (JSON.stringify(SR.cleanRules(JSON.parse(JSON.stringify(d)), 1)) !== JSON.stringify(d)) bad.push('rules survive JSON');
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.round-robin-and-priority-order', async () => {
    const bad = [], all = rules([{ k: 'any' }], [{ k: 'any' }], [{ k: 'any' }]);
    for (let rr = 0; rr < 3; rr++) { const r = SR.route({ rules: all, rr }, [0, 1, 2], it(0)); if (r.order.join() !== [rr, (rr + 1) % 3, (rr + 2) % 3].join()) bad.push(`round robin from ${rr}: ${r.order}`); }
    const p = SR.route({ rules: all, mode: 'prio', prio: [2, 0, 1], rr: 1 }, [0, 1, 2], it(0)); if (p.order.join() !== '2,0,1') bad.push('priority order ignores the pointer: ' + p.order);
    const p2 = SR.route({ rules: all, mode: 'prio', prio: [2, 0, 1] }, [0, 1], it(0)); if (p2.order.join() !== '0,1') bad.push('priority with a missing output: ' + p2.order);
    const bogus = SR.route({ rules: all, mode: 'prio', prio: [0, 0, 1] }, [0, 1, 2], it(0)); if (bogus.order.length !== 3) bad.push('a bad priority list falls back to round robin');
    const o = SR.route({ rules: rules([{ k: 'any' }], [{ k: 'overflow' }], [{ k: 'overflow' }]), orr: 2 }, [0, 1, 2], it(0)); if (o.order.join() !== '0,2,1') bad.push('overflow outputs also take turns: ' + o.order);
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.merge-pick-round-robin-and-priority', async () => {
    const bad = [], F = false, Tr = true;
    // round robin: the next ready lane at or after the pointer
    if (SR.mergePick([Tr, Tr, Tr], [Tr, Tr, Tr], false, 0) !== 0 || SR.mergePick([Tr, Tr, Tr], [Tr, Tr, Tr], false, 1) !== 1 || SR.mergePick([Tr, F, Tr], [Tr, F, Tr], false, 1) !== 2 || SR.mergePick([F, F, F], [F, F, F], false, 0) !== -1) bad.push('round robin');
    if (SR.mergePick([Tr, F, F], [Tr, F, F], false, 2) !== 0) bad.push('round robin wraps');
    // priority: the best lane that claims the gap, ready or not
    const lanes = [1, 0, 2];
    if (SR.mergePick([Tr, Tr, Tr], [Tr, Tr, Tr], true, 0, lanes) !== 1) bad.push('the best lane wins when ready');
    if (SR.mergePick([Tr, F, Tr], [Tr, Tr, Tr], true, 0, lanes) !== -1) bad.push('a lane that claims but is not at the end holds the gap');
    if (SR.mergePick([Tr, F, Tr], [Tr, F, Tr], true, 0, lanes) !== 0) bad.push('the next lane takes the gap when the best has nothing near');
    if (SR.mergePick([F, F, Tr], [F, F, Tr], true, 0, lanes) !== 2) bad.push('the last lane takes what is left');
    if (SR.mergePick([Tr, Tr, Tr], [Tr, Tr, Tr], true, 0, null) !== 0) bad.push('a bad lane list falls back to back, left, right');
    // geometry: which lane a plush travelling in direction `from` arrives on, for a merger facing dir
    const want = { 0: [0, 1, -1, 2], 1: [2, 0, 1, -1], 2: [-1, 2, 0, 1], 3: [1, -1, 2, 0] };
    for (let d = 0; d < 4; d++) for (let f = 0; f < 4; f++) if (SR.laneOf(d, f) !== want[d][f]) bad.push(`laneOf(${d},${f}) = ${SR.laneOf(d, f)}`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('split.text-has-no-dashes-or-filler', async () => {
    const all = [...Object.values(SR.KIND_NAMES), ...Object.values(SR.KIND_HELP), ...SR.SLOT_NAMES, ...SR.LANE_NAMES].join('\n');
    return !/[—–]|NaN|honestly|load-bearing/i.test(all) || 'bad text in the rule names';
  });
  void species;
}
