// Truth tests for the upgrade terminal, the contracts tab and the crafting bench: every button is clicked for real and what its label claims
// (the price, the level, "Needs ...", "MAXED", "Swap", "x5 · price") is checked against what the click did to money, levels and items.
import { UPGRADES, CATS, isUnlocked } from '../upgrades.js';
import { fmt } from '../util.js';
export default async function (ctx) {
  const { T, g, S, fresh, tune } = ctx;
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const $ = (id) => document.getElementById(id);
  const maxAll = () => Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
  const shopCards = (cat) => { g.ui.shopCat = cat; g.ui.renderShop(); return [...document.querySelectorAll('#shopGrid .card')]; };
  const closeAll = () => { g.ui.closeModals(); };

  await T('truth.dom.shop-tabs-show-the-upgrades-of-their-own-line', async () => {
    fresh({}); g.ui.open('shop'); const bad = [];
    for (const btn of [...document.querySelectorAll('#shopTabs button')]) {
      btn.click(); const cat = btn.dataset.cat; const sel = document.querySelector('#shopTabs button.sel');
      if (!sel || sel.dataset.cat !== cat) { bad.push(`tab ${cat} not marked selected`); continue; }
      if (cat === 'contracts') continue;
      const want = UPGRADES.filter((u) => u.cat === cat).map((u) => u.name), got = [...document.querySelectorAll('#shopGrid .card h3 span')].map((s) => s.textContent);
      if (want.join('|') !== got.join('|')) bad.push(`tab "${btn.textContent.trim()}" shows ${got.length} rows, expected ${want.length}`);
    }
    closeAll(); return bad.length === 0 || bad.slice(0, 4).join(' || ');
  });

  await T('truth.dom.shop-buy-button-price-level-and-money-match-the-click', async () => {
    const bad = [];
    for (const u of UPGRADES) {
      if (!CATS.some((c) => c.id === u.cat)) { bad.push(`${u.id} is in no tab (${u.cat})`); continue; }
      for (const lvl of new Set([0, Math.floor(u.max / 2), u.max - 1])) {
        const up = {}; if (u.req) up[u.req.id] = u.req.lvl; up[u.id] = lvl; fresh(up); S().stats.plush = 1e13;
        const list = UPGRADES.filter((x) => x.cat === u.cat), idx = list.indexOf(u), cost = u.cost[lvl];
        S().money = cost; g.ui.open('shop'); let card = shopCards(u.cat)[idx];
        if (!card) { bad.push(`${u.id}: no card`); continue; }
        let b = card.querySelector('button'); const label = norm(b.textContent), small = norm(card.querySelector('h3 small').textContent), pips = card.querySelectorAll('.pips i.on').length;
        if (small !== `${lvl}/${u.max}`) bad.push(`${u.id}: level text "${small}" at level ${lvl}/${u.max}`);
        if (pips !== lvl) bad.push(`${u.id}: ${pips} pips lit at level ${lvl}`); if (card.querySelectorAll('.pips i').length !== u.max) bad.push(`${u.id}: ${card.querySelectorAll('.pips i').length} pips for ${u.max} levels`);
        if (/undefined|NaN|\[object|null/.test(card.textContent)) bad.push(`${u.id}: card text has a leftover: ${norm(card.textContent).slice(0, 120)}`);
        if (b.disabled || label !== `Buy ◈ ${fmt(cost)}`) { bad.push(`${u.id}: affordable at ${cost} but button is "${label}" disabled=${b.disabled}`); continue; }
        b.click();
        if ((S().up[u.id] || 0) !== lvl + 1) bad.push(`${u.id}: Buy ◈ ${fmt(cost)} left level ${S().up[u.id] || 0} (wanted ${lvl + 1})`);
        if (S().money !== 0) bad.push(`${u.id}: label said ${cost}, money left ${S().money}`);
        if (norm(document.getElementById('shopMoney').textContent) !== '0') bad.push(`${u.id}: balance on screen still ${document.getElementById('shopMoney').textContent}`);
        card = [...document.querySelectorAll('#shopGrid .card')][idx]; const after = norm(card.querySelector('h3 small').textContent);
        if (after !== `${lvl + 1}/${u.max}`) bad.push(`${u.id}: card says "${after}" after buying`);
        const b2 = card.querySelector('button'); if (lvl + 1 >= u.max && (!/MAXED/.test(b2.textContent) || !b2.disabled)) bad.push(`${u.id}: at max the button says "${norm(b2.textContent)}" disabled=${b2.disabled}`);
        closeAll(); if (bad.length > 8) break;
      }
      if (bad.length > 8) break;
    }
    return bad.length === 0 || bad.slice(0, 6).join(' || ');
  });

  await T('truth.dom.shop-unaffordable-and-locked-buttons-are-disabled-and-do-nothing', async () => {
    const bad = [];
    for (const u of UPGRADES) {
      const list = UPGRADES.filter((x) => x.cat === u.cat), idx = list.indexOf(u);
      // one coin short
      { const up = {}; if (u.req) up[u.req.id] = u.req.lvl; fresh(up); S().stats.plush = 1e13; S().money = u.cost[0] - 1; g.ui.open('shop'); const b = shopCards(u.cat)[idx].querySelector('button');
        if (!b.disabled) bad.push(`${u.id}: one coin short but the button is enabled`); b.click(); if ((S().up[u.id] || 0) !== 0 || S().money !== u.cost[0] - 1) bad.push(`${u.id}: a disabled button still charged`); closeAll(); }
      // requirement missing
      if (u.req) { fresh({}); S().stats.plush = 1e13; S().money = 1e12; g.ui.open('shop'); const b = shopCards(u.cat)[idx].querySelector('button'); const txt = norm(b.textContent);
        if (!b.disabled || !/^Needs /.test(txt)) bad.push(`${u.id}: requirement missing but button says "${txt}" disabled=${b.disabled}`); b.click(); if (S().up[u.id]) bad.push(`${u.id}: bought without its requirement`);
        const need = UPGRADES.find((x) => x.id === u.req.id); if (need && !txt.includes(need.name)) bad.push(`${u.id}: "${txt}" does not name ${need.name}`); if (u.req.lvl > 1 && !txt.includes('lvl ' + u.req.lvl)) bad.push(`${u.id}: "${txt}" does not say lvl ${u.req.lvl}`); closeAll(); }
      // plush needed
      if (u.needs) { const up = {}; if (u.req) up[u.req.id] = u.req.lvl; fresh(up); S().stats.plush = u.needs - 1; S().money = 1e12; g.ui.open('shop'); const b = shopCards(u.cat)[idx].querySelector('button'); const txt = norm(b.textContent);
        if (!b.disabled || !txt.includes(u.needs.toLocaleString('en-US'))) bad.push(`${u.id}: needs ${u.needs} plush but button says "${txt}" disabled=${b.disabled}`); b.click(); if (S().up[u.id]) bad.push(`${u.id}: bought with too few plush handled`);
        S().stats.plush = u.needs; const b2 = shopCards(u.cat)[idx].querySelector('button'); if (b2.disabled) bad.push(`${u.id}: ${u.needs} plush handled should unlock it`); closeAll(); }
      if (bad.length > 8) break;
    }
    return bad.length === 0 || bad.slice(0, 6).join(' || ');
  });

  await T('truth.dom.shop-every-requirement-names-a-real-upgrade-and-unlock-matches-the-button', async () => {
    const bad = []; fresh({}); S().stats.plush = 1e13;
    for (const u of UPGRADES) { if (u.req && !UPGRADES.some((x) => x.id === u.req.id && x.max >= u.req.lvl)) bad.push(`${u.id} needs ${u.req.id} lvl ${u.req.lvl}, which does not exist`); }
    for (const u of UPGRADES) { const open = isUnlocked(u, {}, S()); const list = UPGRADES.filter((x) => x.cat === u.cat); S().money = 1e12; g.ui.open('shop'); const b = shopCards(u.cat)[list.indexOf(u)].querySelector('button'); if (open === b.disabled) bad.push(`${u.id}: isUnlocked ${open} but button disabled=${b.disabled}`); closeAll(); if (bad.length > 6) break; }
    return bad.length === 0 || bad.slice(0, 6).join(' || ');
  });

  await T('truth.dom.shop-terminal-and-pause-and-key-all-open-the-same-terminal', async () => {
    fresh({}); const bad = [];
    g.ui.open('pause'); document.getElementById('btnShop').click(); if (g.ui.openModal !== 'shop') bad.push('pause Terminal did not open the shop'); closeAll();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true, cancelable: true })); const viaTab = g.ui.openModal; window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Tab', bubbles: true })); closeAll();
    if (viaTab !== 'shop') bad.push(`Tab opened "${viaTab}"`);
    return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- contracts
  await T('truth.dom.contracts-tab-rows-and-swap-price', async () => {
    fresh({ contracts: 1 }); S().money = 1e9; const bad = [];
    g.ui.open('shop'); if (![...document.querySelectorAll('#shopTabs button')].some((b) => b.dataset.cat === 'contracts')) { closeAll(); return 'no Contracts tab with the Contract Board'; }
    document.querySelector('#shopTabs button[data-cat="contracts"]').click(); let cards = [...document.querySelectorAll('#shopGrid .card')];
    if (cards.length !== g.T.contractSlots || cards.length !== S().contracts.length) bad.push(`${cards.length} cards for ${g.T.contractSlots} slots / ${S().contracts.length} contracts`);
    for (let i = 0; i < cards.length; i++) {
      const c = S().contracts[i]; const card = cards[i]; const txt = norm(card.textContent); if (!txt.includes(c.desc)) bad.push(`card ${i} does not show "${c.desc}"`); if (!txt.includes(`${c.have}/${c.need}`)) bad.push(`card ${i} does not show ${c.have}/${c.need}`);
      const cost = Math.round(c.reward * 0.08), b = card.querySelector('button'); if (norm(b.textContent) !== `Swap (◈ ${fmt(cost)})`) bad.push(`card ${i}: label "${norm(b.textContent)}" for a swap price of ${cost}`);
      const money0 = S().money, id0 = c.id; if (b.disabled) { bad.push(`card ${i}: affordable swap is disabled`); continue; }
      b.click(); if (S().money !== money0 - cost) bad.push(`card ${i}: swap label said ${cost}, took ${money0 - S().money}`); if (S().contracts[i].id === id0) bad.push(`card ${i}: Swap kept the same contract`);
      cards = [...document.querySelectorAll('#shopGrid .card')];
    }
    closeAll(); return bad.length === 0 || bad.slice(0, 5).join(' || ');
  });
  await T('truth.dom.contracts-swap-is-disabled-when-you-cannot-pay-and-takes-nothing', async () => {
    fresh({ contracts: 1 }); S().money = 1e9; g.ui.open('shop'); document.querySelector('#shopTabs button[data-cat="contracts"]').click();
    const c0 = S().contracts[0], cost = Math.round(c0.reward * 0.08); S().money = cost - 1; g.ui.renderShop(); const b = document.querySelector('#shopGrid .card button');
    const was = S().contracts[0].id; b.click(); const ok = b.disabled && S().money === cost - 1 && S().contracts[0].id === was; closeAll();
    return ok || `disabled ${b.disabled}, money ${S().money}, swapped ${S().contracts[0].id !== was}`;
  });

  await T('truth.dom.contracts-card-words-match-what-counts-and-what-is-paid', async () => {
    fresh({ contracts: 1 }); const bad = []; const { species, RARITY, ARCH_NAMES } = await import('../plushdata.js'); const pick = (f) => { for (let id = 1; id < species.length; id++) if (species[id] && f(species[id], id)) return id; return 0; };
    const epic = pick((s) => s.rarity === 3), common = pick((s) => s.rarity === 0), spA = pick((s) => s.rarity === 1); const arch = species[spA].arch, otherArch = pick((s) => s.arch !== arch && s.rarity === 1);
    const mkC = (c) => ({ id: S().nextId++, have: 0, ...c }); const show = () => { g.ui.open('shop'); document.querySelector('#shopTabs button[data-cat="contracts"]').click(); return [...document.querySelectorAll('#shopGrid .card')].map((k) => norm(k.textContent)); };
    const boosts0 = S().boosts; S().money = 0; S().boosts = { sell: 0, dig: 0, digMul: 1, carry: 0 };
    S().contracts = [mkC({ kind: 'rarity', r: 3, need: 2, desc: `Sell 2 plush of ${RARITY[3].name} rarity or better.`, reward: 500 }), mkC({ kind: 'species', sp: spA, need: 2, desc: `Sell 2 x ${species[spA].name}.`, reward: 300, boost: 'carry' }), mkC({ kind: 'shape', arch, need: 2, desc: `Sell 2 ${ARCH_NAMES[arch]} plush of any color.`, reward: 200, boost: 'sell' })];
    const cards = show(); if (!/permanent boost/.test(cards[1]) || !/permanent boost/.test(cards[2]) || /permanent boost/.test(cards[0])) bad.push('"a permanent boost" shown on the wrong cards: ' + cards.map((c) => /permanent boost/.test(c)).join());
    g.ui.closeModals(); const m0 = S().money;
    g.contracts.onSale(common, 0); g.contracts.onSale(epic, 0); if (S().contracts[0].have !== 1) bad.push('a Common counted towards "Epic or better", or the Epic did not: ' + S().contracts[0].have); g.contracts.onSale(epic, 0);
    if (S().money - m0 !== 500) bad.push('the Epic contract paid ' + (S().money - m0) + ', card said 500');
    g.contracts.onSale(otherArch, 0); if (S().contracts[2].have !== 0) bad.push('a plush of another shape counted for "Sell 2 ' + ARCH_NAMES[arch] + '"'); g.contracts.onSale(spA, 0); g.contracts.onSale(spA, 0);
    if (S().money - m0 !== 1000) bad.push('the three contracts paid ' + (S().money - m0) + ', the cards said 500 + 300 + 200');
    if (S().boosts.carry !== 1 || Math.abs(S().boosts.sell - 0.01) > 1e-9) bad.push(`the cards promised +1 carry and +1% sale price, gave carry ${S().boosts.carry}, sell ${S().boosts.sell}`); if (g.T.carry !== g.tune().carry) bad.push('the boost is not in your stats');
    if (!/Contract complete/.test(norm($('toasts').textContent))) bad.push('no completion toast'); $('toasts').innerHTML = ''; S().boosts = boosts0; g.refreshTuning(); closeAll(); return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- crafting bench
  // the bench is a grid of cards (#craftGrid .bcard) and a detail pane (#benchDetail) holding the text and the craft buttons of the selected card: pickRow(id) selects a row and returns that pane
  const benchOpen = () => { try { localStorage.removeItem('rf.bench'); } catch (e) { /* no storage */ } g.ui.bench = null; g.ui.open('craft'); };
  const pickRow = (id) => { const c = [...document.querySelectorAll('#craftGrid .bcard')].find((x) => x.dataset.id === id); if (!c) return null; c.click(); return document.getElementById('benchDetail'); };
  await T('truth.dom.bench-every-batch-button-charges-its-label-and-gives-that-many', async () => {
    fresh(maxAll()); const bad = []; const recs = g.recipeList().filter((r) => r.kind !== 'cart');
    if (recs.length < 20) return `only ${recs.length} recipes with every upgrade bought`;
    for (const r of recs) {
      for (const n of new Set(r.batch)) {
        fresh(maxAll()); S().money = 1e13; S().mats = {}; benchOpen(); let card = pickRow(r.id); if (!card) { bad.push(`${r.id}: no card`); closeAll(); continue; }
        const btn = [...card.querySelectorAll('button')].find((b) => +b.dataset.n === n); const m = /^x(\d+) · ◈([\d,.]+\S*)$/.exec(norm(btn.textContent)); if (!m || +m[1] !== n) { bad.push(`${r.id}: batch button says "${norm(btn.textContent)}" for x${n}`); closeAll(); continue; }
        const stock = r.mat ? 0 : 0; void stock; const priceText = m[2]; const have0 = r.kind === 'mat' ? (S().mats[r.mk] || 0) : (S().items[r.id] || 0), money0 = S().money;
        btn.click(); const spent = money0 - S().money; const have1 = r.kind === 'mat' ? (S().mats[r.mk] || 0) : (S().items[r.id] || 0);
        if (have1 - have0 !== n) bad.push(`${r.id}: x${n} gave ${have1 - have0}`); if (fmt(spent) !== priceText) bad.push(`${r.id}: x${n} label ◈${priceText}, charged ${fmt(spent)}`);
        closeAll(); if (bad.length > 8) break;
      }
      if (bad.length > 8) break;
    }
    return bad.length === 0 || bad.slice(0, 6).join(' || ');
  });
  await T('truth.dom.bench-unaffordable-batches-are-disabled-and-charge-nothing', async () => {
    fresh(maxAll()); const bad = [];
    for (const r of g.recipeList().filter((x) => x.kind !== 'cart').slice(0, 40)) {
      fresh(maxAll()); S().money = 0; S().mats = {}; benchOpen(); const card = pickRow(r.id); if (!card) continue;
      for (const b of card.querySelectorAll('button')) { if (!b.disabled && !/x\d+ · ◈0$/.test(norm(b.textContent))) bad.push(`${r.id}: "${norm(b.textContent)}" enabled with no money`); b.click(); }
      if (S().money !== 0 || (S().items[r.id] || 0) !== 0) bad.push(`${r.id}: crafted with no money`); closeAll();
    }
    return bad.length === 0 || bad.slice(0, 5).join(' || ');
  });
  await T('truth.dom.bench-uses-your-stock-first-and-the-card-says-so', async () => {
    fresh(maxAll()); const r = g.recipeList().find((x) => x.id === 'strut'); if (!r) return 'no strut recipe'; S().money = 1e9; S().mats = { timber: 10 }; benchOpen(); const card = pickRow(r.id);
    if (!/Uses 1 Lumber each \(you have 10\)/.test(norm(card.textContent))) { closeAll(); return 'card does not state the stock: ' + norm(card.textContent).slice(0, 160); }
    const b = [...card.querySelectorAll('button')].find((x) => +x.dataset.n === 5); const label = norm(b.textContent); const m0 = S().money; b.click();
    const ok = label === 'x5 · ◈0' && S().money === m0 && S().mats.timber === 5 && S().items.strut === 5; closeAll(); return ok || `label ${label}, money change ${m0 - S().money}, timber ${S().mats.timber}, struts ${S().items.strut}`;
  });
  await T('truth.dom.bench-partial-stock-is-used-and-only-the-shortfall-is-charged-as-the-label-says', async () => {
    fresh(maxAll()); const r = g.recipeList().find((x) => x.id === 'strut'); S().money = 1e9; S().mats = { timber: 2 }; benchOpen(); const card = pickRow(r.id); const b = [...card.querySelectorAll('button')].find((x) => +x.dataset.n === 5);
    const m = /◈([\d,.]+\S*)$/.exec(norm(b.textContent)); const m0 = S().money; b.click(); const spent = m0 - S().money; closeAll(); const expect = Math.round(3 * (r.price / r.matN));
    return (spent === expect && m && m[1] === fmt(spent) && S().items.strut === 5 && !S().mats.timber) || `label ${m && m[1]}, charged ${spent}, expected ${expect}, struts ${S().items.strut}, timber left ${S().mats.timber}`;
  });
  await T('truth.dom.bench-cart-button-says-craft-upgrade-or-owned-and-does-that', async () => {
    fresh(maxAll()); const bad = []; S().money = 1e12; benchOpen(); const names = g.recipeList().filter((r) => r.kind === 'cart');
    if (names.length < 2) { closeAll(); return 'fewer than two carts at max levels'; }
    const lo = names[0], hi = names[1]; let card = pickRow(lo.id); let b = card.querySelector('button'); if (!/^Craft · ◈/.test(norm(b.textContent)) || b.disabled) bad.push(`first cart says "${norm(b.textContent)}" disabled=${b.disabled}`);
    const price = lo.price; const m0 = S().money; b.click(); if (m0 - S().money !== price) bad.push(`cart charged ${m0 - S().money}, label ${price}`); if (!(S().items[lo.id] > 0)) bad.push('cart not in the pack');
    card = pickRow(lo.id); b = card.querySelector('button'); if (!/Owned/.test(b.textContent) || !b.disabled) bad.push(`owned cart says "${norm(b.textContent)}" disabled=${b.disabled}`);
    card = pickRow(hi.id); b = card.querySelector('button'); if (!/^Upgrade · ◈/.test(norm(b.textContent)) || b.disabled) bad.push(`better cart says "${norm(b.textContent)}" disabled=${b.disabled}`);
    const m1 = S().money; b.click(); if (m1 - S().money !== hi.price) bad.push(`upgrade charged ${m1 - S().money}, label ${hi.price}`); if (!(S().items[hi.id] > 0) || S().items[lo.id]) bad.push('upgrade did not swap the carts');
    closeAll(); return bad.length === 0 || bad.join(' || ');
  });
  await T('truth.dom.bench-close-button-and-key-close-it', async () => {
    fresh({}); g.ui.open('craft'); document.querySelector('#craft [data-close]').click(); return g.ui.openModal === null && document.getElementById('craft').classList.contains('hidden') || 'the X did not close the bench';
  });
}
