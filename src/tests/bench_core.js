// bench.* : the Crafting Table browser (src/bench.js). Tabs, counts, search, the locked tab, the audit that every craftable thing has a row and a
// category, text sanity, the remembered tab and the keyboard. Robots are in bench_robots.js, co-op in bench_mp.js.
import * as B from '../bench.js';
import { benchRecipes } from '../crafting.js';
import { TYPES, CONFLICTS } from '../catalog.js';
import { benchKit } from './bench_lib.js';

export default async function (ctx) {
  const { T, g, S, fresh, UPGRADES, FRAME_TYPES } = ctx;
  const K = benchKit(ctx);
  const maxAll = () => Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
  const BAD = /undefined|NaN|\[object|\bnull\b/;
  const ids = (list) => list.map((r) => r.id);
  const gridIds = () => K.cards().map((c) => c.dataset.id);
  const closeAll = () => { g.ui.closeModals(); };
  const guard = (fn) => async () => { try { return await fn(); } finally { closeAll(); K.reset(); } };

  await T('bench.every-row-has-a-known-category-and-an-owner-tab', guard(async () => {
    fresh({}); const bad = [];
    const rows = B.buildRows(g, { fresh: true });
    if (rows.length < 150) bad.push(`only ${rows.length} rows in the whole bench`);
    const cats = new Set(B.CATS.map((c) => c.id));
    for (const r of rows) { if (!B.explicitCategory(r)) bad.push(`${r.id} (kind ${r.kind}) has no category: file it in KIND_CAT of src/bench.js`); else if (!cats.has(r.cat)) bad.push(`${r.id} category ${r.cat}`); }
    const seen = new Set(); for (const r of rows) { if (seen.has(r.id)) bad.push('duplicate row ' + r.id); seen.add(r.id); }
    const names = new Map(); for (const r of rows) { if (names.has(r.name) && names.get(r.name) !== r.cat) bad.push(`name ${r.name} in two categories`); names.set(r.name, r.cat); }
    for (const c of B.CATS) if (!rows.some((r) => r.cat === c.id)) bad.push('empty category ' + c.id);
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  }));

  await T('bench.each-row-is-on-exactly-one-category-tab-and-on-all', guard(async () => {
    fresh(maxAll()); g.crew.sync(); S().money = 1e13; const bad = [];
    K.open(); const all = gridIds(), allSet = new Set(all);
    if (all.length !== allSet.size) bad.push('a row twice on ALL');
    const want = ids(B.buildRows(g)); if (all.length !== want.length || want.some((id) => !allSet.has(id))) bad.push(`ALL shows ${all.length} cards, the bench has ${want.length} rows`);
    const owner = new Map();
    for (const c of B.CATS) {
      K.tab(c.id); const here = gridIds();
      if (new Set(here).size !== here.length) bad.push(`${c.id}: a card twice`);
      for (const id of here) { if (!allSet.has(id)) bad.push(`${id} on ${c.id} but not on ALL`); if (owner.has(id)) bad.push(`${id} on ${owner.get(id)} and on ${c.id}`); owner.set(id, c.id); }
      for (const el of K.cards()) if (el.dataset.cat !== c.id) bad.push(`${el.dataset.id} sits on ${c.id} but says ${el.dataset.cat}`);
    }
    for (const id of all) if (!owner.has(id)) bad.push(`${id} is on ALL but on no category tab`);
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  }));

  await T('bench.audit-every-craftable-kind-has-a-row', guard(async () => {
    fresh({}); const bad = [], rows = B.buildRows(g, { fresh: true }), kinds = new Set(rows.map((r) => r.kind)), have = new Set(rows.map((r) => r.id));
    // the things the request names, by row id or kind
    const MUST = ['frame:timber', 'frame:horizon', 'strut', 'jack', 'cart:1', 'cart:5', 'belt', 'belt:5', 'hose', 'ramp', 'lift', 'lift:5', 'ug', 'ug:5', 'splitter', 'merger', 'pmerger', 'ssplit', 'psplit', 'gate', 'sorter', 'vault',
      'mech', 'borer', 'claw', 'gen', 'gen:portable', 'gen:titan', 'pole', 'switch', 'breaker', 'battery:1', 'cable', 'fan', 'mfan', 'lantern', 'hlamp', 'marker', 'glow', 'flare', 'rope', 'medkit', 'canister', 'dynamite', 'charge', 'bulk',
      'pad:timber', 'stair', 'wramp', 'wall', 'catwalk', 'ladder', 'levelpad', 'door', 'doorkey', 'plift', 'jump', 'cushion', 'rail', 'railstn', 'railcar', 'truck', 'dock', 'road', 'vscan', 'arch', 'archBig', 'garch:6:timber', 'garch:12:horizon',
      'beacon', 'pcrate', 'locker', 'sign', 'dsign', 'psign', 'clamp', 'strip', 'flood', 'wbeacon', 'silo', 'ovault', 'dimdepot', 'excavator', 'dozer', 'wheel', 'liftframe', 'meter', 'pswitch', 'chargepack', 'bot:scrapper', 'charger'];
    for (const id of MUST) if (!have.has(id)) bad.push('no row ' + id);
    // every entity type of the catalog that a tool places must have a row of that kind or id (handler-only groups are not items)
    const NOT_ITEMS = new Set(['splitpart', 'furnish', 'callbtn', 'transit', 'care']);   // ('care': the Courier Drone's crate, a catalog type for its net rows, never crafted or placed)
    for (const t of Object.keys(TYPES)) if (!NOT_ITEMS.has(t) && !kinds.has(t) && !have.has(t)) bad.push('catalog type without a bench row: ' + t);
    if (CONFLICTS.length) bad.push('catalog conflicts: ' + CONFLICTS.slice(0, 3).join(' | '));
    // every kind the core recipe list can make has a category by kind or id
    for (const r of rows) if (!B.explicitCategory(r)) bad.push('no category for ' + r.id);
    // with everything bought the ready rows are exactly what the recipe list makes, plus the robot
    fresh(maxAll()); g.crew.sync(); const ready = B.buildRows(g).filter((r) => !r.locked), want = new Set(ids(benchRecipes(g)));
    for (const r of ready) if (!want.has(r.id) && r.kind !== 'gear') bad.push('ready row not in the recipe list: ' + r.id);
    for (const id of want) if (!ready.some((r) => r.id === id)) bad.push('recipe without a ready row: ' + id);
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  }));

  await T('bench.tab-counts-are-the-rows-and-the-ready-rows-of-each-tab', guard(async () => {
    const bad = [];
    for (const up of [{}, { timber: 1, markers: 1, struts: 1, crew: 1, power: 1, belts: 1 }, maxAll()]) {
      fresh(up); g.crew.sync(); K.open(); const t = K.tabs(), rows = B.buildRows(g);
      const ids9 = ['all', ...B.CATS.map((c) => c.id), 'locked'];
      for (const id of ids9) if (!t[id]) bad.push('no tab ' + id);
      if (t.all.total !== rows.length || t.all.have !== rows.filter((r) => !r.locked).length) bad.push(`ALL says ${t.all.have}/${t.all.total}, rows ${rows.filter((r) => !r.locked).length}/${rows.length}`);
      if (t.locked.total !== rows.filter((r) => r.locked).length) bad.push(`LOCKED says ${t.locked.total}`);
      let sum = 0, sumHave = 0; for (const c of B.CATS) { sum += t[c.id].total; sumHave += t[c.id].have; if (t[c.id].total !== rows.filter((r) => r.cat === c.id).length) bad.push(`${c.id} total ${t[c.id].total}`); }
      if (sum !== t.all.total || sumHave !== t.all.have) bad.push(`categories add up to ${sumHave}/${sum}, ALL ${t.all.have}/${t.all.total}`);
      const labels = [...document.querySelectorAll('#benchTabs [data-tab] .tc')].map((x) => x.textContent); if (labels.some((x) => !/^\d+(\/\d+)?$/.test(x))) bad.push('tab label ' + labels.join());
      for (const id of ['all', 'robots', 'locked']) { K.tab(id); const n = K.cards().length; const want = id === 'locked' ? t.locked.total : t[id].total; if (n !== want) bad.push(`${id}: ${n} cards, tab says ${want}`); }
      if (Object.keys(up).length === UPGRADES.length && t.locked.total > 0) bad.push(`${t.locked.total} rows still locked with every upgrade bought`);
    }
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  }));

  await T('bench.ready-rows-come-before-locked-rows-and-ready-ones-can-be-crafted', guard(async () => {
    fresh({ timber: 1, markers: 1, struts: 1 }); const bad = []; K.open();
    // ALL is grouped by category; inside each block the ready cards come first
    const blocks = new Map(); for (const c of K.cards()) { const l = blocks.get(c.dataset.cat) || []; l.push(!!c.dataset.locked); blocks.set(c.dataset.cat, l); }
    for (const [cat, order] of blocks) { const first = order.indexOf(true); if (first >= 0 && order.slice(first).some((x) => !x)) bad.push(`a ready card after a locked one in ${cat} on ALL`); }
    if (K.cards().map((c) => c.dataset.cat).join() !== K.cards().map((c) => c.dataset.cat).sort((a, b) => B.CATS.findIndex((x) => x.id === a) - B.CATS.findIndex((x) => x.id === b)).join()) bad.push('ALL is not in category order');
    // inside a category the same
    K.tab('supports'); const o2 = K.cards().map((c) => !!c.dataset.locked); const f2 = o2.indexOf(true); if (f2 >= 0 && o2.slice(f2).some((x) => !x)) bad.push('supports tab mixes ready and locked');
    const ready = B.buildRows(g).filter((r) => !r.locked), m0 = S().money;
    for (const r of ready.slice(0, 6)) { const d = K.pick(r.id) || (K.tab('all'), K.pick(r.id)); if (!d) { bad.push('no card for ' + r.id); continue; } const b = d.querySelector('button[data-n]'); if (!b || b.disabled) bad.push('no craft button on ' + r.id); }
    if (S().money !== m0) bad.push('looking at things cost money');
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  }));

  await T('bench.search-filters-by-name-and-by-text-on-every-tab', guard(async () => {
    fresh(maxAll()); g.crew.sync(); S().money = 1e13; const bad = [];
    K.open(); const rows = B.buildRows(g), total = K.cards().length;
    const byText = (q) => rows.filter((r) => B.matches(r, q));
    // a name
    K.search('vacuum hose'); let got = gridIds(); if (!got.includes('hose') || got.some((id) => !/hose|vacuum/i.test(rows.find((r) => r.id === id).name + rows.find((r) => r.id === id).desc + rows.find((r) => r.id === id).use))) bad.push('"vacuum hose" gave ' + got.slice(0, 4));
    // text that is in the description and not in the name
    K.search('dust'); got = gridIds(); const textOnly = got.filter((id) => !/dust/i.test(rows.find((r) => r.id === id).name)); if (!got.includes('fan') || !textOnly.length) bad.push('"dust" should find the Vent Fan by its text: ' + got.slice(0, 6));
    if (got.length !== byText('dust').length) bad.push('search and matches() disagree');
    // every word must match, in any order
    K.search('frame timber'); got = gridIds(); if (!got.includes('frame:timber')) bad.push('"frame timber" missed the Timber Frame');
    K.search('TIMBER   frame'); if (gridIds().join() !== got.join()) bad.push('case or spacing changed the result');
    // nothing
    K.search('zzqqxx'); if (K.cards().length || !document.querySelector('#craftGrid .bench-none')) bad.push('no-match message missing'); if (K.tabs().all.total !== 0) bad.push('ALL count under a query with no match: ' + K.tabs().all.total);
    // the same query on every tab: the tab shows exactly its own matches, the counts say where they are
    K.search('belt');
    const t = K.tabs(); if (t.all.total !== byText('belt').length) bad.push(`ALL count ${t.all.total} vs ${byText('belt').length}`);
    for (const c of [...B.CATS.map((x) => x.id), 'all']) { K.tab(c); const here = gridIds(), want = byText('belt').filter((r) => c === 'all' || r.cat === c).map((r) => r.id); if (here.length !== want.length || want.some((id) => !here.includes(id))) bad.push(`tab ${c}: ${here.length} cards, ${want.length} matches`); if (t[c].total !== want.length) bad.push(`tab ${c} count ${t[c].total}, matches ${want.length}`); }
    // a tab without a match points at the tabs that have one, and the link goes there
    K.search('belt'); const empty = B.CATS.find((c) => K.tabs()[c.id].total === 0); if (!empty) return 'every tab matches "belt": the pointer test needs a tab without a match'; K.tab(empty.id); const hint = document.querySelector('#craftGrid .bench-none'); const link = hint && hint.querySelector('[data-goto]');
    if (!link) bad.push('no pointer to the tabs that match'); else { link.click(); if (g.ui.bench.tab === empty.id || !K.cards().length) bad.push('the pointer did not switch tab'); }
    // clearing the box brings everything back
    K.tab('all'); K.search(''); if (K.cards().length !== total) bad.push(`clearing the search left ${K.cards().length} of ${total}`);
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  }));

  await T('bench.hide-locked-removes-locked-cards-from-all-and-categories-only', guard(async () => {
    fresh({ timber: 1 }); K.open(); const bad = [], n0 = K.cards().length, locked0 = K.tabs().locked.total;
    const box = document.getElementById('benchHide'); box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }));
    if (K.cards().some((c) => c.dataset.locked)) bad.push('a locked card with Hide locked on');
    if (K.cards().length !== K.tabs().all.have) bad.push(`${K.cards().length} cards, ${K.tabs().all.have} ready`);
    K.tab('locked'); if (K.cards().length !== locked0) bad.push('the LOCKED tab lost its cards');
    box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); K.tab('all'); if (K.cards().length !== n0) bad.push('turning it off did not bring them back');
    return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.locked-tab-says-what-unlocks-each-row-and-following-it-unlocks-the-row', guard(async () => {
    const bad = [];
    fresh({}); K.open(); K.tab('locked');
    const cards = K.cards(), rows = g.ui.bench.shown;
    if (!cards.length || cards.length !== rows.length) bad.push(`${cards.length} cards for ${rows.length} locked rows`);
    for (const c of cards) { const t = (c.querySelector('.bc-lock') || {}).textContent || ''; if (!/^🔒 (Needs .+|Unlocked later in the game)$/.test(t.trim())) bad.push(`${c.dataset.id}: lock text "${t}"`); if (c.dataset.cost !== undefined) bad.push(c.dataset.id + ' locked card has a price to pay'); }
    // the cheapest unlock first
    for (let i = 1; i < rows.length; i++) if (rows[i].lock.total < rows[i - 1].lock.total) { bad.push(`locked rows out of order at ${rows[i].id}`); break; }
    // the claim of the card: the named upgrades, in the order given, unlock the row
    let wrong = 0;
    for (const r of rows) {
      if (!r.lock.steps.length) { bad.push(r.id + ' has no steps'); continue; }
      fresh({}); const lv = {}; for (const s of r.lock.steps) lv[s.id] = Math.max(lv[s.id] || 0, s.lvl); S().up = lv; g.T = g.tune();
      if (!benchRecipes(g).some((x) => x.id === r.id)) { if (wrong++ < 5) bad.push(`${r.id}: buying ${r.lock.steps.map((s) => s.name).join(' > ')} did not unlock it`); }
    }
    // a few that are easy to state by hand
    const NEED = { 'frame:timber': 'timber', 'frame:steel': 'steel', strut: 'struts', jack: 'jacks', medkit: 'firstaid', dynamite: 'dynamite', charge: 'charges', lantern: 'lantern', bulk: 'bulkhead', rope: 'rope', 'gen:turbine': 'genTurbine', 'belt:1': 'beltMk2', plift: 'transitLift', ladder: 'stackKit', 'cart:3': 'cart', 'bot:scrapper': 'crew', charger: 'crew', door: 'transitDoor', jump: 'transitJump', rail: 'railShuttle', sign: 'furnSigns' };
    fresh({}); const byId = new Map(B.buildRows(g).map((r) => [r.id, r]));
    for (const [id, up] of Object.entries(NEED)) { const r = byId.get(id), u = UPGRADES.find((x) => x.id === up); if (!r || !r.locked) { bad.push(id + ' not locked'); continue; } if (!r.lock.text.includes(u.name)) bad.push(`${id}: "${r.lock.text}" lacks ${u.name}`); }
    // the detail pane spells it out and the craft buttons are off
    K.open(); K.tab('locked'); const d = K.pick('frame:steel') || K.pick(g.ui.bench.shown[0].id); const txt = K.norm(d.textContent);
    if (!/Locked/.test(txt) || !/Buy it at the terminal/.test(txt) || !/◈/.test(txt)) bad.push('detail pane of a locked row: ' + txt.slice(0, 160));
    for (const b of d.querySelectorAll('button')) if (!b.disabled) bad.push('an enabled button on a locked row');
    const m0 = S().money, id0 = g.ui.bench.sel; K.key('Enter'); if (S().money !== m0 || (S().items[id0] || 0)) bad.push('Enter crafted a locked row');
    if (g.craftItem('frame:steel', 1) || (S().items['frame:steel'] || 0)) bad.push('the game crafted a locked recipe');
    // buying the unlock moves the row out of LOCKED
    S().up = { timber: 1, steel: 1 }; g.T = g.tune(); g.ui.renderCraft(); K.tab('all'); const c = K.cardEl('frame:steel'); if (!c || c.dataset.locked) bad.push('Steel Frame still locked after Steel Frames'); K.tab('locked'); if (K.cardEl('frame:steel')) bad.push('Steel Frame still on LOCKED');
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  }));

  await T('bench.every-card-and-pane-is-free-of-undefined-and-nan', guard(async () => {
    const bad = [];
    for (const up of [{}, { timber: 1, steel: 1, power: 1, belts: 1, crew: 1, crewSlots: 2, cart: 2 }, maxAll()]) {
      fresh(up); g.crew.sync(); S().money = 12345; K.open();
      for (const t of ['all', ...B.CATS.map((c) => c.id), 'locked']) {
        K.tab(t); const txt = document.getElementById('craft').textContent; if (BAD.test(txt)) bad.push(`tab ${t}: ${(BAD.exec(txt) || [''])[0]} in the window text`);
        for (const r of g.ui.bench.shown) { const d = K.pick(r.id); if (!d) { bad.push('no card ' + r.id); continue; } const dt = d.textContent; if (BAD.test(dt) || !r.name || !r.icon) bad.push(`${r.id}: bad text "${(BAD.exec(dt) || [''])[0]}"`); if (!r.locked && !(r.price > 0 && Number.isFinite(r.price))) bad.push(r.id + ' price ' + r.price); if (!r.desc) bad.push(r.id + ' no description'); if (!r.use && r.kind !== 'bot') bad.push(r.id + ' no how-to'); if (bad.length > 8) break; }
      }
      closeAll();
    }
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  }));

  await T('bench.the-last-tab-is-remembered-and-a-broken-store-never-breaks-the-bench', guard(async () => {
    fresh({ timber: 1 }); const bad = []; K.open(); K.tab('power'); if (g.ui.bench.tab !== 'power') bad.push('tab did not switch');
    closeAll(); g.ui.open('craft'); if (g.ui.bench.tab !== 'power' || !document.querySelector('#benchTabs [data-tab="power"].on')) bad.push('reopening lost the tab');
    // a new page: the state object is gone, the choice comes back from storage
    closeAll(); g.ui.bench = null; g.ui.open('craft'); if (g.ui.bench.tab !== 'power') bad.push('a new session forgot the tab (stored: ' + localStorage.getItem('rf.bench') + ')');
    if (K.cards().some((c) => c.dataset.cat !== 'power')) bad.push('the window did not open on the remembered tab');
    // nonsense in the store means ALL
    closeAll(); localStorage.setItem('rf.bench', '{"tab":"nope","hide":"x"}'); g.ui.bench = null; g.ui.open('craft'); if (g.ui.bench.tab !== 'all') bad.push('bad stored tab gave ' + g.ui.bench.tab);
    closeAll(); localStorage.setItem('rf.bench', 'not json'); g.ui.bench = null; g.ui.open('craft'); if (g.ui.bench.tab !== 'all') bad.push('unreadable store gave ' + g.ui.bench.tab);
    // a store that throws (a private window)
    closeAll(); g.ui.bench = null; const gi = Storage.prototype.getItem, si = Storage.prototype.setItem;
    try { Storage.prototype.getItem = () => { throw new Error('blocked'); }; Storage.prototype.setItem = () => { throw new Error('blocked'); }; g.ui.open('craft'); K.tab('tools'); if (g.ui.bench.tab !== 'tools' || !K.cards().length) bad.push('the bench broke with a blocked store'); } catch (e) { bad.push('threw: ' + e.message); } finally { Storage.prototype.getItem = gi; Storage.prototype.setItem = si; }
    closeAll(); K.reset();
    // a search is not remembered, a tab is
    K.open(); K.search('belt'); closeAll(); g.ui.open('craft'); if (document.getElementById('benchSearch').value !== '' || g.ui.bench.q !== '') bad.push('the search text survived a reopen');
    return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.keyboard-arrows-move-enter-crafts-one-shift-enter-a-batch', guard(async () => {
    fresh(maxAll()); g.crew.sync(); S().money = 1e13; S().mats = {}; g.mode = 'play'; K.open(); const bad = [];
    const sel = () => g.ui.bench.sel, shown = () => g.ui.bench.shown.map((r) => r.id);
    if (document.activeElement && !document.activeElement.classList.contains('bcard')) { const el = K.cardEl(sel()); if (el) el.focus(); }
    const i0 = shown().indexOf(sel()); K.key('ArrowRight'); if (shown().indexOf(sel()) !== i0 + 1) bad.push('ArrowRight did not move one card');
    K.key('ArrowLeft'); if (shown().indexOf(sel()) !== i0) bad.push('ArrowLeft did not move back');
    const cols = getComputedStyle(document.getElementById('craftGrid')).gridTemplateColumns.split(' ').length;
    K.key('ArrowDown'); if (shown().indexOf(sel()) !== Math.min(shown().length - 1, i0 + cols)) bad.push(`ArrowDown moved to ${shown().indexOf(sel())}, with ${cols} columns`);
    K.key('ArrowUp'); if (shown().indexOf(sel()) !== i0) bad.push('ArrowUp did not return');
    K.key('End'); if (shown().indexOf(sel()) !== shown().length - 1) bad.push('End'); K.key('Home'); if (shown().indexOf(sel()) !== 0) bad.push('Home'); K.key('ArrowLeft'); if (shown().indexOf(sel()) !== 0) bad.push('ArrowLeft at the start moved');
    if (!document.activeElement.classList.contains('bcard') || document.activeElement.dataset.id !== sel()) bad.push('focus does not follow the selection');
    // Enter crafts 1 of the selected card, at its price
    const r0 = g.ui.bench.shown.find((r) => r.id === sel()); let m0 = S().money, n0 = S().items[r0.id] || 0; const e1 = K.key('Enter');
    if ((S().items[r0.id] || 0) !== n0 + 1 || m0 - S().money !== r0.price * 1 && !r0.mat) bad.push(`Enter on ${r0.id}: ${(S().items[r0.id] || 0) - n0} made, ${m0 - S().money} spent`);
    if (!e1.defaultPrevented) bad.push('Enter was not taken by the bench');
    // Shift+Enter crafts the second batch size
    const want = r0.batch[1] || r0.batch[0]; n0 = S().items[r0.id] || 0; K.key('Enter', { shift: true }); if ((S().items[r0.id] || 0) - n0 !== want) bad.push(`Shift+Enter made ${(S().items[r0.id] || 0) - n0}, expected ${want}`);
    if (!document.activeElement.classList.contains('bcard')) bad.push('focus left the grid after crafting');
    // the arrows are the bench's: the game does not turn them into "next tool"
    const t0 = g.buildIdx; K.key('ArrowRight'); if (g.buildIdx !== t0) bad.push('the arrow reached the hotbar');
    return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.keyboard-tab-does-not-close-the-window-letters-search-and-esc-steps-back', guard(async () => {
    fresh(maxAll()); g.crew.sync(); g.mode = 'play'; K.open(); const bad = [];
    const e = K.key('Tab'); if (g.ui.openModal !== 'craft') bad.push('Tab closed the bench'); if (e.defaultPrevented) bad.push('Tab was blocked: the focus cannot move');
    K.key('KeyV', { key: 'v' }); if (g.ui.openModal !== 'craft') bad.push('V closed the bench instead of searching'); if (document.activeElement.id !== 'benchSearch') bad.push('a letter did not focus the search box');
    const s = document.getElementById('benchSearch'); K.search('lamp'); if (!K.cards().length) bad.push('no lamps');
    // Down or Enter in the box goes to the grid
    K.key('ArrowDown', {}, s); if (!document.activeElement.classList.contains('bcard')) bad.push('ArrowDown in the search did not reach the grid');
    s.focus(); K.key('Escape', {}, s); if (g.ui.openModal !== 'craft' || s.value !== '' || g.ui.bench.q !== '') bad.push('the first Esc should only clear the search'); if (K.cards().length < 20) bad.push('clearing did not bring the list back');
    K.key('Slash', { key: '/' }, document.getElementById('craftGrid')); if (document.activeElement.id !== 'benchSearch') bad.push('/ did not focus the search');
    // [ and ] change the tab, the arrows do when a tab has the focus
    K.cards()[0].focus(); K.key('BracketRight', { key: ']' }); if (g.ui.bench.tab !== 'supports') bad.push('] gave ' + g.ui.bench.tab); K.key('BracketLeft', { key: '[' }); if (g.ui.bench.tab !== 'all') bad.push('[ gave ' + g.ui.bench.tab);
    const tb = document.querySelector('#benchTabs [data-tab="all"]'); tb.focus(); K.key('ArrowRight', {}, tb); if (g.ui.bench.tab !== 'supports' || document.activeElement.dataset.tab !== 'supports') bad.push('ArrowRight on a tab');
    K.key('End', {}, document.activeElement); if (g.ui.bench.tab !== 'locked') bad.push('End on the tab strip'); K.key('Home', {}, document.activeElement); if (g.ui.bench.tab !== 'all') bad.push('Home on the tab strip');
    // Esc closes it for good, from the grid
    K.cards()[0].focus(); K.key('Escape'); if (g.ui.openModal !== null) bad.push('Esc did not close the bench from the grid');
    return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.mouse-click-selects-double-click-crafts-and-the-buttons-charge-what-they-say', guard(async () => {
    fresh(maxAll()); g.crew.sync(); S().money = 1e13; S().mats = {}; K.open(); const bad = [];
    const c = K.cardEl('strut'); c.click(); if (g.ui.bench.sel !== 'strut' || !c.classList.contains('sel')) bad.push('click did not select');
    const d = K.detail(); if (!d.textContent.includes('Strut') || !d.textContent.includes('How to use')) bad.push('detail text of the Strut: ' + K.norm(d.textContent).slice(0, 100));
    const m0 = S().money, n0 = S().items.strut || 0; c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); if ((S().items.strut || 0) !== n0 + 1 || m0 - S().money <= 0) bad.push('double click did not craft one');
    for (const b of K.detail().querySelectorAll('button[data-n]')) { const n = +b.dataset.n, cost = +b.dataset.cost, mm = S().money, k0 = S().items.strut || 0; b.click(); if ((S().items.strut || 0) - k0 !== n || mm - S().money !== cost) bad.push(`x${n}: made ${(S().items.strut || 0) - k0}, charged ${mm - S().money}, button says ${cost}`); }
    // broke: the button and the card dim, and clicking charges nothing
    S().money = 5; g.ui.setMoney(5, true); const price = g.ui.bench.shown.find((r) => r.id === 'strut').price; const card = K.cardEl('strut'); if (!card.classList.contains('broke') && price > 5) bad.push('the card does not show that you cannot pay'); const b1 = K.detail().querySelector('button[data-n="1"]'); if (!b1.disabled) bad.push('buy button enabled without money');
    const k1 = S().items.strut || 0; b1.click(); if ((S().items.strut || 0) !== k1 || S().money !== 5) bad.push('a disabled button charged');
    S().money = 1e13; g.ui.setMoney(1e13, true); if (K.detail().querySelector('button[data-n="1"]').disabled || K.cardEl('strut').classList.contains('broke')) bad.push('money arrived and the bench did not notice');
    return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.layout-fits-the-window-and-the-tab-strip-scrolls-on-a-narrow-screen', guard(async () => {
    fresh(maxAll()); g.crew.sync(); K.open(); const bad = [];
    const panel = document.querySelector('#craft .panel'), strip = document.getElementById('benchTabs'), grid = document.getElementById('craftGrid'), det = document.getElementById('benchDetail');
    if (panel.scrollWidth > panel.clientWidth + 1) bad.push(`the window is wider than itself (${panel.scrollWidth} > ${panel.clientWidth})`);
    if (getComputedStyle(strip).overflowX !== 'auto' && getComputedStyle(strip).overflowX !== 'scroll') bad.push('the tab strip does not scroll sideways');
    if (!['auto', 'scroll'].includes(getComputedStyle(grid).overflowY)) bad.push('the grid does not scroll'); if (!['auto', 'scroll'].includes(getComputedStyle(det).overflowY)) bad.push('the detail pane does not scroll');
    const r = panel.getBoundingClientRect(); if (r.width > innerWidth + 1 || r.height > innerHeight + 1) bad.push(`the window (${r.width}x${r.height}) does not fit the page (${innerWidth}x${innerHeight})`);
    for (const c of K.cards().slice(0, 40)) { if (c.scrollWidth > c.clientWidth + 2) { bad.push('a card overflows: ' + c.dataset.id); break; } }
    for (const b of document.querySelectorAll('#benchTabs button')) if (!b.title || !/\d/.test(b.textContent)) bad.push('tab without a count or title: ' + b.dataset.tab);
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  }));

  // pads exist for every frame material: the catalog fills them from the frames you own, so the locked ones are listed too
  await T('bench.every-frame-material-has-a-frame-row-and-a-pad-row', guard(async () => {
    fresh({}); const rows = new Map(B.buildRows(g, { fresh: true }).map((r) => [r.id, r])), bad = [];
    for (const k of Object.keys(FRAME_TYPES)) { if (!rows.has('frame:' + k)) bad.push('no frame:' + k); if (!rows.has('pad:' + k)) bad.push('no pad:' + k); if (!rows.has('garch:6:' + k)) bad.push('no 6 wide arch of ' + k); }
    return bad.length === 0 || bad.join('; ');
  }));
}
