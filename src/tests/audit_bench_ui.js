// bench.audit.* (window): adversarial checks of the Crafting Table browser's DOM, keys and cost. Search with hostile text, a held Enter key, money
// arriving while buttons are off, the window keeping its nodes between redraws (a guest redraws it every 0.6 s), arrow keys on a grid with
// category blocks, rapid clicks and tab switches, a blocked store, the 400 px phone layout, the cost of one redraw and of the unlock table.
import * as B from '../bench.js';
import { benchRecipes, botPrice } from '../crafting.js';
import { EXTRA } from '../catalog.js';
import { benchKit } from './bench_lib.js';

export default async function (ctx) {
  const { T, g, S, fresh, UPGRADES } = ctx;
  const K = benchKit(ctx);
  const $ = (id) => document.getElementById(id);
  const maxAll = () => Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
  const guard = (fn) => async () => { try { return await fn(); } finally { g.ui.closeModals(); K.reset(); document.querySelectorAll('iframe.bench-audit').forEach((f) => f.remove()); } };
  // a key event with the options the helper in bench_lib.js lacks (auto repeat)
  const kd = (code, opts = {}, target = document.activeElement || document.body) => { const ev = new KeyboardEvent('keydown', { code, key: opts.key || code, bubbles: true, cancelable: true, shiftKey: !!opts.shift, repeat: !!opts.repeat }); target.dispatchEvent(ev); return ev; };
  const items = (id) => S().items[id] || 0;

  // ---------------------------------------------------------------- search
  await T('bench.audit.search-takes-symbols-html-regex-and-a-huge-text-without-breaking-the-window', guard(async () => {
    fresh(maxAll()); g.crew.sync(); K.open(); const bad = [], rows = g.ui.bench.rows, grid = $('craftGrid'), panel = document.querySelector('#craft .panel');
    const lit = (r) => `${r.name} ${r.desc} ${r.use || ''}`.toLowerCase();
    for (const q of ['.*', '(', '[a-', '\\', '?', '+', '^', '$', '|', '{2}', '%', '<b>', '&amp;', '"', "'", '`', '\u0000', '🙂', 'İ', 'ß']) {
      try { K.search(q); } catch (e) { bad.push(`"${q}" threw ${e.message}`); continue; }
      const shown = new Set(K.cards().map((c) => c.dataset.id));
      for (const r of rows) if (lit(r).includes(q.toLowerCase()) && !shown.has(r.id)) bad.push(`"${q}": ${r.id} contains it and is not shown`);
      for (const id of shown) if (!B.matches(rows.find((r) => r.id === id), q)) bad.push(`"${q}": ${id} shown without matching`);
      if (grid.querySelector('img, script, b, i, iframe')) bad.push(`"${q}": markup got into the grid`);
    }
    // markup in the query is text, in the empty message and everywhere else
    K.search('<img src=x onerror=window.__benchXss=1>'); if (window.__benchXss) bad.push('a script ran'); if (document.querySelector('#craft img')) bad.push('an img element was made from the query');
    if (!/<img src=x/.test(grid.textContent)) bad.push('the empty message does not show the typed text: ' + grid.textContent.slice(0, 80));
    // whitespace only is no query at all
    const all = rows.length; K.search('   \t '); if (K.cards().length !== all) bad.push(`blank search shows ${K.cards().length} of ${all}`);
    // a huge word must not stretch the grid sideways or fill the screen with its own echo
    K.search('x'.repeat(5000)); const none = grid.querySelector('.bench-none');
    if (!none) bad.push('no empty message for a 5000 letter word'); else if (none.textContent.length > 400) bad.push(`the empty message is ${none.textContent.length} characters long`);
    if (grid.scrollWidth > grid.clientWidth + 1) bad.push(`a 5000 letter word makes the grid ${grid.scrollWidth - grid.clientWidth}px too wide`);
    if (panel.scrollWidth > panel.clientWidth + 1) bad.push('the window grew sideways');
    // many words: fast and right
    const t0 = performance.now(); K.search('belt '.repeat(300)); const dt = performance.now() - t0; if (dt > 400) bad.push(`300 words took ${Math.round(dt)} ms`); if (K.cards().length !== rows.filter((r) => B.matches(r, 'belt')).length) bad.push('repeating a word changed the result');
    K.search(''); if (K.cards().length !== all) bad.push('clearing did not restore the list');
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  }));

  // ---------------------------------------------------------------- keys
  await T('bench.audit.holding-enter-crafts-once-and-key-repeat-never-clicks-a-button', guard(async () => {
    fresh(maxAll()); g.crew.sync(); S().money = 1e13; g.mode = 'play'; K.open(); const bad = [];
    K.pick('strut'); const c = K.cardEl('strut'); c.focus(); const n0 = items('strut'), m0 = S().money;
    kd('Enter'); if (items('strut') !== n0 + 1) bad.push('the first Enter did not craft one');
    document.activeElement.classList && K.cardEl('strut').focus();
    for (let n = 0; n < 8; n++) kd('Enter', { repeat: true });
    if (items('strut') !== n0 + 1) bad.push(`holding Enter crafted ${items('strut') - n0} struts`);
    const m1 = S().money; for (let n = 0; n < 4; n++) kd('Enter', { repeat: true, shift: true }); if (S().money !== m1) bad.push('holding Shift+Enter spent money');
    // on a focused craft button the browser clicks on every repeat unless the keydown is cancelled
    const b = K.detail().querySelector('button[data-n="1"]'); b.focus(); const ev = kd('Enter', { repeat: true }, b); if (!ev.defaultPrevented) bad.push('a repeating Enter on a craft button is not cancelled: the browser would click it again and again');
    const ev2 = kd('Enter', {}, document.activeElement); if (ev2.defaultPrevented && !/BUTTON/.test(document.activeElement.tagName)) bad.push('the first Enter on a button was cancelled');
    if (m0 - S().money <= 0) bad.push('nothing was charged');
    return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.audit.every-escape-leaves-and-every-letter-searches-from-each-place-the-focus-can-be', guard(async () => {
    fresh(maxAll()); g.crew.sync(); g.mode = 'play'; const bad = [];
    const places = { grid: () => K.cards()[0], tab: () => document.querySelector('#benchTabs .bt'), detail: () => K.detail().querySelector('button'), hide: () => $('benchHide'), close: () => document.querySelector('#craft .x'), count: () => $('craftGrid') };
    for (const [name, el] of Object.entries(places)) {
      K.open(); const t = el(); if (!t) { bad.push('no ' + name); continue; } t.focus();
      const tab = kd('Tab', {}, t); if (g.ui.openModal !== 'craft') bad.push(`Tab closed the bench from ${name}`); if (tab.defaultPrevented) bad.push(`Tab was cancelled on ${name}`);
      kd('Escape', {}, t); if (g.ui.openModal === 'craft') bad.push(`Escape did not close the bench from ${name}`);
    }
    // a letter from anywhere but the box goes to the box and the game never sees it; digits too
    for (const k of ['v', 'e', 'i', '1', 'k']) { K.open(); K.cards()[0].focus(); kd('Key' + k.toUpperCase(), { key: k }, document.activeElement); if (document.activeElement.id !== 'benchSearch') bad.push(`"${k}" did not move to the search box`); if (g.ui.openModal !== 'craft') bad.push(`"${k}" closed the bench`); g.ui.closeModals(); }
    // in the box: letters stay in the box, the first Escape only clears, the second leaves
    K.open(); const s = $('benchSearch'); s.focus(); K.search('lamp'); const ev = kd('KeyV', { key: 'v' }, s); if (g.ui.openModal !== 'craft') bad.push('a letter typed in the box reached the game'); kd('Escape', {}, s); if (g.ui.openModal !== 'craft' || s.value !== '') bad.push('first Escape in the box'); kd('Escape', {}, s); if (g.ui.openModal === 'craft') bad.push('second Escape did not leave');
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  }));

  await T('bench.audit.arrow-down-and-up-land-on-the-card-in-the-next-row-on-every-tab', guard(async () => {
    fresh(maxAll()); g.crew.sync(); S().money = 1e13; g.mode = 'play'; K.open(); const bad = [];
    const rect = (el) => el.getBoundingClientRect();
    for (const tab of ['all', 'supports', 'power', 'tools']) {
      K.tab(tab); let wrong = 0, tested = 0;
      for (const id of K.cards().map((c) => c.dataset.id)) {
        for (const dir of [1, -1]) {
          B.select(g.ui, id, true); const r0 = rect(K.cardEl(id)), cx = r0.left + r0.width / 2;   // measured after the scroll that the selection causes
          const there = K.cards().filter((c) => (dir > 0 ? rect(c).top > r0.top + 4 : rect(c).top < r0.top - 4));
          const edge0 = there.length ? (dir > 0 ? Math.min(...there.map((c) => rect(c).top)) : Math.max(...there.map((c) => rect(c).top))) : 0;
          const row = there.filter((c) => Math.abs(rect(c).top - edge0) < 4), dist = (c) => Math.abs(rect(c).left + rect(c).width / 2 - cx), best = row.length ? Math.min(...row.map(dist)) : 0, want = row.length ? row.find((c) => dist(c) === best).dataset.id : null, okIds = new Set(row.filter((c) => dist(c) <= best + 2).map((c) => c.dataset.id));
          kd(dir > 0 ? 'ArrowDown' : 'ArrowUp'); const got = g.ui.bench.sel;
          if (!there.length) { if (got !== id) { wrong++; if (bad.length < 4) bad.push(`${tab}: ${id} has no row ${dir > 0 ? 'below' : 'above'} and moved to ${got}`); } continue; }
          tested++;
          if (!okIds.has(got)) { wrong++; if (bad.length < 4) bad.push(`${tab}: ${id} ${dir > 0 ? 'down' : 'up'} went to ${got}, the card ${dir > 0 ? 'below' : 'above'} is ${want}`); }
        }
      }
      if (wrong) bad.push(`${tab}: ${wrong} of ${tested} arrow moves went to the wrong card`);
    }
    return bad.length === 0 || bad.slice(0, 5).join('; ');
  }));

  // ---------------------------------------------------------------- money and redraws
  await T('bench.audit.money-arriving-never-turns-on-a-button-that-is-off-for-another-reason', guard(async () => {
    const bad = [];
    // an owned cart, a full crew and a locked row each show a dead button whatever the balance
    fresh({ cart: 3, crew: 1, crewSlots: 0 }); g.crew.sync(); S().money = 1e12; g.craftItem('cart:2', 1); K.open();
    const dead = [];
    K.tab('transit'); for (const id of ['cart:2', 'cart:1']) { const d = K.pick(id); if (d) dead.push([id, d.querySelector('button')]); }
    K.tab('robots'); { const d = K.pick('bot:scrapper'); if (d) dead.push(['bot:scrapper', d.querySelector('button')]); }
    K.tab('locked'); { const d = K.pick(g.ui.bench.shown[0].id); if (d) dead.push(['locked', d.querySelector('button')]); }
    for (const [id, b] of dead) if (!b.disabled) bad.push(`${id}: the button was not disabled to begin with (${b.textContent})`);
    for (const [id] of dead) {
      const tabOf = id === 'locked' ? 'locked' : id === 'bot:scrapper' ? 'robots' : 'transit'; K.tab(tabOf); const d = id === 'locked' ? K.pick(g.ui.bench.shown[0].id) : K.pick(id);
      g.ui.setMoney(0, true); g.ui.setMoney(1e12, true);
      const b = d.querySelector('button'); if (!b.disabled) bad.push(`${id}: money arrived and the dead button "${b.textContent}" came alive`);
      const before = S().money, crew = S().crew.length; b.click(); if (S().money !== before || S().crew.length !== crew) bad.push(`${id}: the dead button charged`);
    }
    return bad.length === 0 || bad.slice(0, 5).join('; ');
  }));

  await T('bench.audit.a-redraw-with-the-same-rows-keeps-the-nodes-so-a-click-is-never-lost-under-it', guard(async () => {
    fresh(maxAll()); g.crew.sync(); S().money = 1e12; K.open(); K.tab('power'); const bad = [];
    const card = K.cardEl('gen'); K.pick('gen'); const tabBtn = document.querySelector('#benchTabs [data-tab="power"]'), btn = K.detail().querySelector('button[data-n]'), strip = $('benchTabs');
    g.ui.renderCraft(); g.ui.renderCraft();
    if (!card.isConnected) bad.push('a card was replaced by a redraw that changed nothing'); if (!tabBtn.isConnected) bad.push('a tab was replaced by a redraw that changed nothing'); if (!btn.isConnected) bad.push('a craft button was replaced by a redraw that changed nothing');
    // the balance moving (belts sell all the time) must not replace them either, it only restyles
    S().money -= 1000; g.ui.setMoney(S().money); g.ui.renderCraft(); if (!card.isConnected || !btn.isConnected || !tabBtn.isConnected) bad.push('the balance changed and the nodes were replaced');
    const n0 = items('gen');
    // what did change is drawn: craft one and the count shows on the same card id
    btn.click(); if (items('gen') !== n0 + 1) bad.push('craft did not happen'); if (!/1/.test(((K.cardEl('gen') || {}).querySelector('.bc-own') || {}).textContent || '')) bad.push('the card does not show what you hold');
    // scroll and selection survive
    K.tab('all'); const grid = $('craftGrid'); grid.scrollTop = 600; const top = grid.scrollTop; g.ui.renderCraft(); if (Math.abs(grid.scrollTop - top) > 2) bad.push(`the scroll position jumped from ${top} to ${grid.scrollTop}`);
    void strip; return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.audit.the-detail-pane-and-cards-follow-an-unlock-while-the-window-is-open', guard(async () => {
    fresh({}); const bad = []; K.open(); K.tab('supports'); K.pick('frame:timber');
    const before = K.norm(K.detail().textContent); if (!/Locked/.test(before) || !K.cardEl('frame:timber').dataset.locked) bad.push('frame:timber should start locked');
    const have0 = K.tabs().supports.have, locked0 = K.tabs().locked.total;
    S().up = { timber: 1 }; g.T = g.tune(); g.ui.renderCraft();   // the same thing a shared message does on a guest
    const after = K.norm(K.detail().textContent), card = K.cardEl('frame:timber');
    if (card.dataset.locked) bad.push('the card is still locked'); if (/Locked/.test(after) || /Buy it at the terminal/.test(after)) bad.push('the pane still says locked: ' + after.slice(0, 120));
    const b = K.detail().querySelector('button[data-n="1"]'); if (!b || b.disabled) bad.push('no live craft button after the unlock'); if (g.ui.bench.sel !== 'frame:timber') bad.push('the selection moved to ' + g.ui.bench.sel);
    if (K.tabs().supports.have <= have0) bad.push('the tab count did not grow'); if (K.tabs().locked.total >= locked0) bad.push('the Locked count did not shrink');
    K.tab('locked'); if (K.cardEl('frame:timber')) bad.push('still on the Locked tab'); if (!K.cards().length) bad.push('the Locked tab is empty after one unlock');
    // the first Enter after the unlock crafts it
    K.tab('supports'); K.pick('frame:timber'); const n0 = items('frame:timber'); S().money = 1e9; K.cardEl('frame:timber').focus(); kd('Enter'); if (items('frame:timber') !== n0 + 1) bad.push('Enter did not craft the unlocked row');
    return bad.length === 0 || bad.join('; ');
  }));

  // ---------------------------------------------------------------- rapid use
  await T('bench.audit.rapid-clicks-and-keys-never-spend-more-than-there-is-or-twice-for-one-craft', guard(async () => {
    fresh(maxAll()); g.crew.sync(); g.mode = 'play'; const bad = [];
    K.open(); K.tab('all'); K.pick('strut'); const price = g.ui.bench.rows.find((r) => r.id === 'strut').price; S().mats = {};
    // money for exactly two: five double clicks make two
    S().money = price * 2; g.ui.setMoney(S().money, true); const n0 = items('strut');
    for (let n = 0; n < 5; n++) { const c = K.cardEl('strut'); c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); }
    if (items('strut') - n0 !== 2) bad.push(`five double clicks with money for two made ${items('strut') - n0}`); if (S().money < 0 || S().money !== 0) bad.push('money ended at ' + S().money);
    // money for one batch of 5: two quick clicks on the x5 button make one batch
    S().mats = {}; S().money = price * 5; g.ui.setMoney(S().money, true); K.pick('strut'); const m5 = items('strut');
    for (let n = 0; n < 3; n++) { const b = K.detail().querySelector('button[data-n="5"]'); if (b) b.click(); }
    if (items('strut') - m5 !== 5) bad.push(`three clicks on x5 with money for one made ${items('strut') - m5}`); if (S().money < 0) bad.push('money below zero: ' + S().money);
    // ten distinct Enter presses with money for three
    S().mats = {}; S().money = price * 3 + 1; g.ui.setMoney(S().money, true); K.cardEl('strut').focus(); const k0 = items('strut'); for (let n = 0; n < 10; n++) kd('Enter', {}, K.cardEl('strut') || document.activeElement);
    if (items('strut') - k0 !== 3) bad.push(`ten Enter presses with money for three made ${items('strut') - k0}`); if (S().money !== 1) bad.push('money ended at ' + S().money);
    // refused crafts say so and keep the window usable
    S().money = 0; g.ui.setMoney(0, true); K.cardEl('strut').focus(); kd('Enter'); if (g.ui.openModal !== 'craft') bad.push('a refused craft closed the window');
    return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.audit.rapid-tab-switching-leaves-one-tab-on-and-the-right-cards', guard(async () => {
    fresh({ timber: 1, struts: 1, markers: 1, power: 1, belts: 1 }); g.crew.sync(); K.open(); const bad = [], ids = ['all', ...B.CATS.map((c) => c.id), 'locked'];
    let last = 'all'; for (let round = 0; round < 6; round++) for (const id of [...ids].sort(() => Math.random() - 0.5)) { K.tab(id); last = id; if (round % 2) kd('BracketRight'), last = ids[(ids.indexOf(last) + 1) % ids.length]; }
    const on = [...document.querySelectorAll('#benchTabs .bt.on')]; if (on.length !== 1 || on[0].dataset.tab !== last || g.ui.bench.tab !== last) bad.push(`after the storm: ${on.map((b) => b.dataset.tab)} on, state ${g.ui.bench.tab}, expected ${last}`);
    const t = K.tabs()[last]; if (K.cards().length !== t.total) bad.push(`${last} shows ${K.cards().length} cards, its tab says ${t.total}`);
    const seen = K.cards().map((c) => c.dataset.id); if (new Set(seen).size !== seen.length) bad.push('a card twice');
    if (document.querySelectorAll('#benchTabs .bt[tabindex="0"]').length !== 1) bad.push('the tab strip has ' + document.querySelectorAll('#benchTabs .bt[tabindex="0"]').length + ' tab stops');
    if (K.cards().length && document.querySelectorAll('#craftGrid .bcard[tabindex="0"]').length !== 1) bad.push('the grid has ' + document.querySelectorAll('#craftGrid .bcard[tabindex="0"]').length + ' tab stops');
    if (K.cards().length && K.detail().dataset.id !== g.ui.bench.sel) bad.push('the pane shows ' + K.detail().dataset.id + ', the selection is ' + g.ui.bench.sel);
    try { if (JSON.parse(localStorage.getItem('rf.bench')).tab !== last) bad.push('the remembered tab is not the last one'); } catch (e) { bad.push('nothing remembered'); }
    // a keyboard user on a tab keeps the focus on it after the redraw
    const b = document.querySelector('#benchTabs [data-tab="power"]'); b.focus(); b.click(); if (!document.activeElement || document.activeElement.dataset.tab !== 'power') bad.push('the focus left the tab strip when a tab was chosen');
    return bad.length === 0 || bad.slice(0, 5).join('; ');
  }));

  await T('bench.audit.robots-keyboard-and-mouse-spam-stops-at-the-bunks-and-each-bot-costs-more', guard(async () => {
    fresh({ crew: 1, crewSlots: 2 }); g.crew.sync(); S().money = 1e12; g.mode = 'play'; const bad = [];   // 3 bunks, 1 bot
    K.open(); K.tab('robots'); K.pick('bot:scrapper'); const paid = [];
    for (let n = 0; n < 6; n++) { const m = S().money, c = S().crew.length; kd('Enter', {}, K.cardEl('bot:scrapper') || document.activeElement); if (S().crew.length > c) paid.push(m - S().money); }
    if (S().crew.length !== 3) bad.push(`six Enter presses made ${S().crew.length - 1} bots into two free bunks`);
    if (paid.join() !== [botPrice(1), botPrice(2)].join()) bad.push(`charged ${paid}, the price list says ${botPrice(1)},${botPrice(2)}`); if (!(paid[1] > paid[0])) bad.push('the second bot was not dearer');
    const m = S().money; for (let n = 0; n < 4; n++) K.cardEl('bot:scrapper').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); if (S().money !== m || S().crew.length !== 3) bad.push('double clicks crafted into a full crew');
    for (const b of K.detail().querySelectorAll('button[data-n]')) if (!b.disabled) bad.push('a live button with no bunk: ' + b.textContent);
    if (!/No free bunk/.test(K.norm(K.detail().textContent))) bad.push('the pane does not say why');
    return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.audit.every-batch-button-of-a-row-from-each-tab-charges-what-it-says-and-makes-that-many', guard(async () => {
    fresh(maxAll()); g.crew.sync(); g.mode = 'play'; const bad = [];
    for (const stock of [0, 3]) {
      K.open(); const picks = [];
      for (const c of B.CATS) { K.tab(c.id); const r = g.ui.bench.shown.find((x) => !x.locked && x.kind !== 'cart' && x.kind !== 'bot'); if (r) picks.push(r.id); }
      for (const id of [...picks, 'frame:timber', 'strut', 'jack', 'bulk']) {
        K.tab('all'); const d = K.pick(id); if (!d) { bad.push('no card ' + id); continue; }
        const labels = [...d.querySelectorAll('button[data-n]')].map((b) => b.dataset.n);
        for (const n of labels) {
          S().money = 1e13; S().mats = stock ? { timber: stock, steel: stock } : {}; g.ui.setMoney(1e13, true); K.pick(id);
          const b = K.detail().querySelector(`button[data-n="${n}"]`), cost = +b.dataset.cost, m0 = S().money, k0 = items(id), mats0 = JSON.stringify(S().mats);
          if (!b.textContent.includes(`x${n}`)) bad.push(`${id}: label "${b.textContent}" lacks x${n}`);
          b.click();
          if (items(id) - k0 !== +n) bad.push(`${id} x${n}: made ${items(id) - k0}`); if (m0 - S().money !== cost) bad.push(`${id} x${n}: charged ${m0 - S().money}, the button says ${cost} (mats ${mats0})`);
        }
      }
      g.ui.closeModals();
    }
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  }));

  // ---------------------------------------------------------------- cost
  await T('bench.audit.a-redraw-of-the-whole-bench-is-under-15-ms-and-so-is-opening-it-again', guard(async () => {
    fresh(maxAll()); g.crew.sync(); K.open(); const bad = [], rows = g.ui.bench.rows.length;
    if (rows < 150) return `only ${rows} rows: the 160 recipe case is not being measured`;
    const med = (f, n = 15) => { const l = []; for (let i = 0; i < n; i++) { const t = performance.now(); f(); l.push(performance.now() - t); } l.sort((a, b) => a - b); return l[n >> 1]; };
    for (const tab of ['all', 'logistics', 'locked']) { K.tab(tab); const ms = med(() => g.ui.renderCraft()); if (ms > 15) bad.push(`${tab}: a redraw takes ${ms.toFixed(1)} ms`); }
    K.tab('all'); K.search('a'); { const ms = med(() => g.ui.renderCraft()); if (ms > 15) bad.push(`a search: a redraw takes ${ms.toFixed(1)} ms`); } K.search('');
    fresh({}); K.open(); { const ms = med(() => g.ui.renderCraft()); if (ms > 15) bad.push(`new game, ALL: a redraw takes ${ms.toFixed(1)} ms`); }
    // typing: each key redraws; ten keys stay snappy
    const t0 = performance.now(); for (const q of ['b', 'be', 'bel', 'belt', 'belt ', 'belt f', 'belt fa', 'belt fas', 'belt fast', 'belt faste']) K.search(q); const per = (performance.now() - t0) / 10; if (per > 15) bad.push(`typing: ${per.toFixed(1)} ms a key`); K.search('');
    // the unlock table is built once and kept: opening again 40 s later must not rebuild it (the catalog parts are only asked for the live rows)
    let asked = 0; EXTRA.__benchSpy = { RECIPES: () => { asked++; return []; } };
    try {
      B.buildRows(g, { fresh: true }); const first = asked; asked = 0;
      const now = Date.now; Date.now = () => now() + 40000; try { B.buildRows(g, { fresh: true }); } finally { Date.now = now; }
      if (first < 2) bad.push('the spy part was never asked while building the table'); if (asked > 1) bad.push(`opening again asked the catalog parts ${asked} times: the unlock table was rebuilt (${first} the first time)`);
    } finally { delete EXTRA.__benchSpy; }
    return bad.length === 0 || bad.slice(0, 5).join('; ');
  }));

  // ---------------------------------------------------------------- storage
  await T('bench.audit.a-store-that-throws-on-every-touch-never-breaks-the-bench', guard(async () => {
    fresh({ timber: 1, power: 1 }); g.crew.sync(); const bad = [];
    const desc = Object.getOwnPropertyDescriptor(window, 'localStorage');
    try {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('denied', 'SecurityError'); } });
      g.ui.closeModals(); g.ui.bench = null;
      try { g.ui.open('craft'); K.tab('power'); K.search('lamp'); K.search(''); const h = $('benchHide'); h.checked = true; h.dispatchEvent(new Event('change', { bubbles: true })); K.tab('locked'); K.tab('all'); } catch (e) { bad.push('threw: ' + e.message); }
      if (g.ui.bench.tab !== 'all') bad.push('state ' + g.ui.bench.tab); if (!K.cards().length) bad.push('no cards'); const n0 = items('strut'); K.pick('frame:timber'); S().money = 1e9; K.key('Enter'); if (items('frame:timber') < 1) bad.push('could not craft');
      g.ui.closeModals(); g.ui.bench = null; try { g.ui.open('craft'); } catch (e) { bad.push('reopen threw: ' + e.message); } void n0;
    } finally { if (desc) Object.defineProperty(window, 'localStorage', desc); else delete window.localStorage; }
    try { localStorage.setItem('rf.bench', '{"tab":"all","hide":false}'); } catch (e) { bad.push('the real store did not come back: ' + e.message); }
    return bad.length === 0 || bad.join('; ');
  }));

  // ---------------------------------------------------------------- phone
  await T('bench.audit.the-window-fits-a-400-px-phone-with-big-enough-controls-and-the-buy-buttons-on-top', guard(async () => {
    const bad = [];
    for (const [label, up, tab, pickId] of [['new game locked', {}, 'locked', null], ['everything', maxAll(), 'all', 'frame:horizon'], ['robots', { crew: 1, crewSlots: 3 }, 'robots', 'bot:scrapper']]) {
      fresh(up); g.crew.sync(); S().money = 123456789; K.open(); K.tab(tab); if (pickId) K.pick(pickId); else K.pick(g.ui.bench.shown[g.ui.bench.shown.length - 1].id);
      const fr = document.createElement('iframe'); fr.className = 'bench-audit'; fr.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:760px;border:0;z-index:99999'; document.body.appendChild(fr);
      const doc = fr.contentDocument; doc.open(); doc.write('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>'); doc.close();
      for (const s of document.querySelectorAll('style, link[rel=stylesheet]')) doc.head.appendChild(s.cloneNode(true));
      const clone = $('craft').cloneNode(true); clone.classList.remove('hidden'); doc.body.appendChild(clone);
      await new Promise((r) => setTimeout(r, 400));
      const w = fr.contentWindow, q = (s) => doc.querySelector(s), box = (s) => { const e = q(s); return e ? e.getBoundingClientRect() : null; };
      if (w.innerWidth !== 400) { bad.push('the test frame is ' + w.innerWidth + ' wide'); fr.remove(); continue; }
      const panel = q('#craft .panel'), grid = q('#craftGrid'), det = q('#benchDetail'), strip = q('#benchTabs');
      if (doc.documentElement.scrollWidth > 401) bad.push(`${label}: the page is ${doc.documentElement.scrollWidth}px wide`);
      const pb = panel.getBoundingClientRect(); if (pb.width > 401 || pb.right > 401 || pb.left < -1) bad.push(`${label}: the window is ${Math.round(pb.left)}..${Math.round(pb.right)}`);
      for (const [n, el] of [['panel', panel], ['grid', grid], ['detail', det]]) if (el.scrollWidth > el.clientWidth + 1) bad.push(`${label}: the ${n} scrolls sideways (${el.scrollWidth} > ${el.clientWidth})`);
      if (!(strip.scrollWidth > strip.clientWidth)) bad.push(`${label}: the 11 tabs fit without scrolling, so they are too small to read`);
      const cols = w.getComputedStyle(grid).gridTemplateColumns.split(' ').length; if (cols < 3) bad.push(`${label}: ${cols} card columns`);
      const sb = box('#benchSearch'); if (!sb || sb.width < 150 || sb.height < 36) bad.push(`${label}: the search box is ${sb && Math.round(sb.width)}x${sb && Math.round(sb.height)}`);
      const xb = box('#craft .x'); if (!xb || xb.right > 400 || xb.left < 0 || xb.width < 30 || xb.height < 30) bad.push(`${label}: the close button is off screen or tiny`);
      const dr = det.getBoundingClientRect(); if (dr.height < 150) bad.push(`${label}: the pane is ${Math.round(dr.height)}px tall`);
      for (const b of det.querySelectorAll('.bd-btn')) { const r = b.getBoundingClientRect(); if (r.height < 38) bad.push(`${label}: a buy button is ${Math.round(r.height)}px tall`); if (r.right > dr.right + 1 || r.left < dr.left - 1) bad.push(`${label}: a buy button sticks out of the pane`); }
      const lockBox = det.querySelector('.bd-lock'); if (lockBox) { const r = lockBox.getBoundingClientRect(); if (r.top < dr.top - 1 || r.top > dr.bottom - 20) bad.push(`${label}: the lock text starts outside the visible part of the pane`); }
      const first = det.querySelector('.bd-btn:not(:disabled)'); if (first) { const r = first.getBoundingClientRect(); if (r.bottom > dr.bottom + 1 || r.top < dr.top - 1) bad.push(`${label}: the buy button is below the visible part of the pane (${Math.round(r.top)}..${Math.round(r.bottom)} in ${Math.round(dr.top)}..${Math.round(dr.bottom)})`); }
      for (const b of strip.querySelectorAll('.bt')) { const r = b.getBoundingClientRect(); if (r.height < 32 || r.width < 40) bad.push(`${label}: tab ${b.dataset.tab} is ${Math.round(r.width)}x${Math.round(r.height)}`); }
      for (const el of [q('.bench-intro'), q('.bench-foot')]) if (el && w.getComputedStyle(el).display !== 'none') bad.push(`${label}: keyboard help is shown on a phone`);
      const ch = [...grid.querySelectorAll('.bcard')].slice(0, 30); for (const c of ch) if (c.scrollWidth > c.clientWidth + 2) { bad.push(`${label}: card ${c.dataset.id} overflows`); break; }
      fr.remove();
    }
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  }));

  // ---------------------------------------------------------------- the controls
  await T('bench.audit.every-control-has-a-name-a-role-and-exactly-one-tab-stop', guard(async () => {
    fresh(maxAll()); g.crew.sync(); const bad = []; K.open();
    for (const tab of ['all', 'locked', 'robots', 'power']) {
      K.tab(tab); const w = $('craft');
      for (const b of w.querySelectorAll('button')) { const name = (b.getAttribute('aria-label') || b.textContent || '').trim(); if (!name) bad.push(`${tab}: a nameless button ${b.className}`); if (/undefined|NaN|\[object/.test(name + (b.title || ''))) bad.push(`${tab}: bad button text "${name}"`); }
      for (const c of w.querySelectorAll('.bcard')) { if (!c.getAttribute('aria-label') || c.getAttribute('role') !== 'option') bad.push(`${tab}: card ${c.dataset.id} has no name or role`); if (c.getAttribute('aria-selected') !== String(c.classList.contains('sel'))) bad.push(`${tab}: ${c.dataset.id} aria-selected disagrees with its look`); }
      if (w.querySelectorAll('.bcard.sel').length > 1) bad.push(tab + ': two selected cards');
      const ids = [...w.querySelectorAll('[id]')].map((e) => e.id); if (new Set(ids).size !== ids.length) bad.push(tab + ': duplicate ids');
      const tabs = [...w.querySelectorAll('#benchTabs [role=tab]')]; if (tabs.length !== 11 || tabs.filter((t) => t.getAttribute('aria-selected') === 'true').length !== 1) bad.push(tab + ': tab roles');
    }
    for (const id of ['benchSearch', 'benchHide']) { const e = $(id); if (!e || !(e.getAttribute('aria-label') || (e.closest('label') && e.closest('label').textContent.trim()))) bad.push(id + ' has no label'); }
    if (!document.querySelector('#craft [data-close]') || !document.querySelector('#craft [data-close]').getAttribute('aria-label')) bad.push('the close button has no label');
    // the close button and Escape both leave
    for (const how of ['x', 'esc']) { K.open(); if (how === 'x') document.querySelector('#craft [data-close]').click(); else kd('Escape', {}, document.body); if (g.ui.openModal === 'craft') bad.push(how + ' did not close the bench'); }
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  }));
}
