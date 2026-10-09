// bench.audit.* (items): the Crafting Table browser must reach every item the game can put in a pack. Cross-checks the recipe list, the catalog
// registries, the hammer's refunds, the cache loot list, the hotbar and the inventory against the bench rows, then the tab counts under queries and
// the Locked tab's claim against real purchases.
import * as B from '../bench.js';
import { benchRecipes, recipes } from '../crafting.js';
import { TYPES, PARTS } from '../catalog.js';
import { loadSaved } from '../state.js';
import { benchKit } from './bench_lib.js';

export default async function (ctx) {
  const { T, g, S, fresh, UPGRADES } = ctx;
  const K = benchKit(ctx);
  const maxAll = () => Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
  const MID = { timber: 1, steel: 1, markers: 1, struts: 1, crew: 1, power: 1, belts: 1, firstaid: 1, cart: 3 };
  const items = (id) => S().items[id] || 0;
  const guard = (fn) => async () => { try { return await fn(); } finally { g.ui.closeModals(); K.reset(); } };
  // items an old save can still hand back that no recipe makes any more (the lift's old call button): the hammer gives them, nothing places them
  const LEGACY = new Set(['callbtn']);

  await T('bench.audit.every-recipe-the-game-can-make-has-a-bench-row-at-every-stage', guard(async () => {
    const bad = [];
    for (const [name, up] of [['fresh', {}], ['mid', MID], ['max', maxAll()]]) {
      fresh(up); g.crew.sync(); const rows = new Map(B.buildRows(g, { fresh: true }).map((r) => [r.id, r]));
      for (const r of recipes(g)) {
        if (r.kind === 'mat') continue;   // raw material is not an item in the pack
        const row = rows.get(r.id); if (!row) { bad.push(`${name}: ${r.id} has no row`); continue; }
        if (row.locked) bad.push(`${name}: ${r.id} is a live recipe but its row says locked`);
      }
      // the cache loot list (crafting.js recipes minus carts, material and supply) is a subset of the same rows
      for (const r of recipes(g).filter((x) => x.kind !== 'cart' && x.kind !== 'mat' && x.kind !== 'supply')) if (!rows.has(r.id)) bad.push(`${name}: cache loot ${r.id} has no row`);
    }
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  }));

  await T('bench.audit.every-part-of-the-catalog-registries-puts-its-recipes-on-the-bench', guard(async () => {
    fresh(maxAll()); g.crew.sync(); const ids = new Set(B.buildRows(g).map((r) => r.id)), bad = [];
    for (const [name, part] of Object.entries(PARTS)) for (const r of (part.RECIPES ? part.RECIPES(g) : [])) if (!ids.has(r.id)) bad.push(`${name}: ${r.id}`);
    return bad.length === 0 || 'catalog recipes missing from the bench: ' + bad.slice(0, 8).join(', ');
  }));

  await T('bench.audit.every-id-the-hammer-hands-back-is-craftable', guard(async () => {
    fresh(maxAll()); g.crew.sync(); const ids = new Set(B.buildRows(g).map((r) => r.id)), bad = [], legacy = [];
    const samples = (type) => [{ type }, { type, kind: 'timber', mat: 'timber', tier: 1, span: 6 }, { type, kind: 'timber', tier: 2 }, { type, lift: { h: 2 }, tier: 2 }, { type, ug: true, tier: 3 }];
    for (const [type, h] of Object.entries(TYPES)) {
      if (!h || typeof h.item !== 'function') continue;
      for (const e of samples(type)) {
        let id; try { id = h.item(e); } catch (err) { continue; }   // a sample missing a field the handler reads
        if (typeof id !== 'string' || /undefined|NaN/.test(id)) continue;
        if (!ids.has(id)) (LEGACY.has(id) ? legacy : bad).push(`${type} gives ${id}`);
      }
    }
    for (const id of LEGACY) if (ids.has(id)) bad.push(`${id} is listed as legacy but now has a bench row: take it off the list in this test`);
    // the hammer's fallback is the type itself: every placeable type with no item handler must be a row of that id
    const NOT_ITEMS = new Set(['splitpart', 'furnish', 'callbtn', 'transit', 'lift', 'ug', 'care']);   // ('care': the Courier Drone's crate is dropped by the game, never crafted or placed)
    for (const type of Object.keys(TYPES)) if (!TYPES[type].item && !NOT_ITEMS.has(type) && !ids.has(type)) bad.push(`the hammer gives back "${type}" and no row has that id`);
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  }));

  await T('bench.audit.crafting-every-ready-row-fills-the-inventory-and-the-hotbar', guard(async () => {
    fresh(maxAll()); g.crew.sync(); S().money = 1e15; g.mode = 'play'; const bad = [];
    const rows = B.buildRows(g, { fresh: true }).filter((r) => !r.locked && r.kind !== 'bot');
    for (const r of rows) {
      const n0 = S().items[r.id] || 0, m0 = S().money, ok = g.craftItem(r.id, 1);
      if (!ok) { bad.push(`${r.id}: refused`); continue; }
      if (r.kind !== 'cart' && (S().items[r.id] || 0) !== n0 + 1) bad.push(`${r.id}: made ${(S().items[r.id] || 0) - n0}`);
      if (!(S().money < m0)) bad.push(`${r.id}: cost nothing`);
    }
    const inv = new Set(g.inventoryList().map((x) => x.id));
    for (const r of rows) if (r.kind !== 'cart' && !inv.has(r.id)) bad.push(`${r.id}: crafted but not in the inventory`);
    if (![1, 2, 3, 4, 5].some((t) => inv.has('cart:' + t))) bad.push('no cart in the inventory');
    // every item can be put on a hotbar slot and comes out as a tool with its count
    for (const r of rows.filter((x) => x.kind !== 'cart').slice(0, 60)) { const slot = g.assignHotbar(r.id, 1), t = g.tools[slot]; if (!t || t.id !== r.id || !(t.have >= 1)) bad.push(`${r.id}: hotbar slot gives ${t && t.id}`); }
    for (const k of Object.keys(S().items)) if (!inv.has(k)) bad.push(`item ${k} is held but not listed`);
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  }));

  await T('bench.audit.tab-counts-follow-every-query-and-the-cards-match-them', guard(async () => {
    const bad = [];
    for (const up of [{}, MID, maxAll()]) {
      fresh(up); g.crew.sync(); K.open(); const rows = g.ui.bench.rows.slice();
      for (const q of ['', 'belt', 'a', 'frame timber', 'zzqqxx', '.*', '(', '<b>', '  ', 'power  cable']) {
        K.search(q); const t = K.tabs();
        const want = (pred) => rows.filter((r) => pred(r) && B.matches(r, q));
        if (t.all.total !== want(() => true).length) bad.push(`"${q}": ALL says ${t.all.total}, ${want(() => true).length} match`);
        if (t.all.have !== want((r) => !r.locked).length) bad.push(`"${q}": ALL ready ${t.all.have}`);
        if (t.locked.total !== want((r) => r.locked).length) bad.push(`"${q}": LOCKED says ${t.locked.total}`);
        let sum = 0; for (const c of B.CATS) { sum += t[c.id].total; if (t[c.id].total !== want((r) => r.cat === c.id).length) bad.push(`"${q}": ${c.id} says ${t[c.id].total}`); }
        if (sum !== t.all.total) bad.push(`"${q}": categories add up to ${sum}, ALL ${t.all.total}`);
        for (const id of ['all', 'locked', 'power']) { K.tab(id); const n = K.cards().length; if (n !== t[id].total) bad.push(`"${q}" on ${id}: ${n} cards, the tab says ${t[id].total}`); const label = document.querySelector(`#benchTabs [data-tab="${id}"] .tc`).textContent; if (label !== (id === 'locked' ? `${t[id].total}` : `${t[id].have}/${t[id].total}`)) bad.push(`"${q}" ${id} label ${label}`); }
        K.tab('all');
      }
      closeAllAndReset();
    }
    function closeAllAndReset() { g.ui.closeModals(); K.reset(); }
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  }));

  await T('bench.audit.the-locked-tab-unlocks-each-row-when-its-steps-are-bought-through-the-terminal', guard(async () => {
    const bad = []; fresh({}); S().stats.plush = 0; g.mode = 'play';
    const locked = B.buildRows(g, { fresh: true }).filter((r) => r.locked);
    if (locked.length < 100) bad.push(`only ${locked.length} locked rows on a new game`);
    for (const r of locked) {
      fresh({}); S().stats.plush = 1e12; S().money = 1e15; let stuck = false;
      for (const s of r.lock.steps) { const lv = S().up[s.id] || 0, m = S().money; if (!g.buy(s.id) || (S().up[s.id] || 0) !== lv + 1) { bad.push(`${r.id}: the terminal would not sell ${s.name}`); stuck = true; break; } if (m - S().money !== s.cost) bad.push(`${r.id}: ${s.name} costs ${m - S().money}, the bench says ${s.cost}`); }
      if (stuck) continue;
      if (!benchRecipes(g).some((x) => x.id === r.id)) bad.push(`${r.id}: ${r.lock.steps.map((s) => s.name).join(' > ')} bought and the row is still locked`);
      if (r.lock.steps.length && !r.lock.text.startsWith('Needs')) bad.push(`${r.id}: lock text "${r.lock.text}"`);
    }
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  }));

  await T('bench.audit.the-locked-card-and-pane-agree-and-the-plush-requirement-is-told', guard(async () => {
    const bad = []; fresh({}); S().stats.plush = 0; S().money = 1e12; K.open(); K.tab('locked');
    const rows = g.ui.bench.shown, plushRows = rows.filter((r) => r.lock.plushNote);
    if (!plushRows.length) bad.push('no locked row mentions a plush requirement on a new game');
    for (const r of rows.slice(0, 25)) {
      const d = K.pick(r.id); if (!d) { bad.push('no card ' + r.id); continue; }
      const txt = K.norm(d.textContent), card = K.norm(K.cardEl(r.id).textContent);
      if (!card.includes(r.lock.text)) bad.push(`${r.id}: the card does not say "${r.lock.text}"`);
      if (!txt.includes(r.lock.text)) bad.push(`${r.id}: the pane does not say "${r.lock.text}"`);
      for (const s of r.lock.steps.slice(0, 6)) if (!txt.includes(s.name)) bad.push(`${r.id}: the pane lacks step ${s.name}`);
      if (r.lock.plushNote && !txt.includes(r.lock.plushNote)) bad.push(`${r.id}: the pane lacks "${r.lock.plushNote}"`);
      if (d.querySelector('button:not(:disabled)')) bad.push(`${r.id}: a live button on a locked row`);
    }
    S().stats.plush = 1e12; g.ui.renderCraft(); for (const r of g.ui.bench.rows) if (r.locked && r.lock.plushNote) { bad.push(`${r.id}: still wants plush after 1e12 handled`); break; }
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  }));
  await T('bench.audit.what-the-bench-crafted-survives-a-save-and-the-bench-shows-it-after-the-load', guard(async () => {
    fresh({ timber: 1, struts: 1, power: 1, belts: 1 }); g.crew.sync(); S().money = 1e9; g.mode = 'play'; const bad = [];
    K.open(); K.tab('supports'); K.pick('strut'); K.detail().querySelector('button[data-n="5"]').click(); K.pick('frame:timber'); K.detail().querySelector('button[data-n="1"]').click(); K.tab('power'); K.pick('pole'); K.detail().querySelector('button[data-n="1"]').click();
    const want = { strut: items('strut'), 'frame:timber': items('frame:timber'), pole: items('pole') }, slots = S().hotbar.slice(); if (want.strut !== 5 || want['frame:timber'] !== 1 || want.pole !== 1) return 'the clicks made ' + JSON.stringify(want);
    g.ui.closeModals(); g.noSave = false; const ok = g.save(); g.noSave = true; if (!ok) return 'save failed';
    const saved = loadSaved(); if (!saved || !saved.S) return 'nothing saved'; g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play';
    for (const [id, n] of Object.entries(want)) if (items(id) !== n) bad.push(`${id}: ${items(id)} after the load, ${n} before`);
    if (S().hotbar.join() !== slots.join()) bad.push('the hotbar changed: ' + S().hotbar.join() + ' vs ' + slots.join());
    K.open(); K.tab('supports'); const own = (id) => (K.cardEl(id) && K.cardEl(id).querySelector('.bc-own') || {}).textContent;
    if (own('strut') !== '\u00d75') bad.push('the Strut card shows ' + own('strut')); if (own('frame:timber') !== '\u00d71') bad.push('the Timber Frame card shows ' + own('frame:timber'));
    const inv = new Set(g.inventoryList().map((x) => x.id)); for (const id of Object.keys(want)) if (!inv.has(id)) bad.push(id + ' is not in the inventory after the load');
    K.pick('strut'); const m0 = S().money; K.detail().querySelector('button[data-n="1"]').click(); if (items('strut') !== 6 || !(S().money < m0)) bad.push('crafting after a load: ' + items('strut'));
    return bad.length === 0 || bad.join('; ');
  }));
}
