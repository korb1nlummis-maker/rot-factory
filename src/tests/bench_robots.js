// bench.robots.* : Scrapper Bots are crafted at the bench. The Scrapper Bot upgrade hatches the first one and unlocks the recipe, More Scrappers and the
// Bot Foundry add bunks, each bot costs more than the last, a bot only ever hatches into a free bunk, and nothing hands out a bot for free.
import * as B from '../bench.js';
import { benchRecipes, recipes, botPrice, botHireCost, botQuote, BOT_ID } from '../crafting.js';
import { loadSaved } from '../state.js';
import { SAVE_KEY } from '../config.js';
import { benchKit } from './bench_lib.js';

export default async function (ctx) {
  const { T, g, S, fresh, UPGRADES } = ctx;
  const K = benchKit(ctx);
  const UP = { crew: 1, crewSlots: 3 };   // four bunks, one bot
  const botRow = () => benchRecipes(g).find((r) => r.id === BOT_ID);
  const guard = (fn) => async () => { try { return await fn(); } finally { g.ui.closeModals(); K.reset(); } };
  const cost = (id) => UPGRADES.find((u) => u.id === id).cost;

  await T('bench.robots.price-follows-what-hiring-cost-and-rises-with-every-bot', guard(async () => {
    const bad = [], crew = cost('crew'), slots = cost('crewSlots'), foundry = cost('foundry');
    for (let n = 0; n < 15; n++) {
      const hire = botHireCost(n), want = n === 0 ? crew[0] : n <= 8 ? slots[n - 1] : foundry[n - 9];
      if (hire !== want) bad.push(`bot ${n}: hire cost ${hire}, the upgrade tree charged ${want}`);
      if (!(botPrice(n) > 0) || !Number.isFinite(botPrice(n))) bad.push(`bot ${n}: price ${botPrice(n)}`);
      if (n > 0 && !(botPrice(n) > botPrice(n - 1))) bad.push(`bot ${n}: ${botPrice(n)} not above ${botPrice(n - 1)}`);
      if (!(botPrice(n) + hire > hire)) bad.push(`bot ${n}: a bot got cheaper`);
      if (botPrice(n) < hire * 0.4) bad.push(`bot ${n}: ${botPrice(n)} is far below what hiring cost (${hire})`);
    }
    if (botQuote(2, 3) !== botPrice(2) + botPrice(3) + botPrice(4)) bad.push('batch quote is not the sum of the next prices');
    if (botPrice(40) <= botPrice(14)) bad.push('past the Foundry the price stopped rising');
    return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.robots.row-is-locked-until-the-scrapper-bot-upgrade-and-says-so', guard(async () => {
    fresh({}); const bad = []; K.open();
    if (botRow()) bad.push('the bot row exists before the upgrade'); const row = B.buildRows(g).find((r) => r.id === BOT_ID);
    if (!row || !row.locked || !/Scrapper Bot/.test(row.lock.text)) bad.push('locked row: ' + JSON.stringify(row && row.lock && row.lock.text));
    K.tab('robots'); const c = K.cardEl(BOT_ID); if (!c || !c.dataset.locked || !/Scrapper Bot/.test(c.textContent)) bad.push('card: ' + (c && c.textContent));
    S().money = 1e13; if (g.craftItem(BOT_ID, 1) || S().crew.length) bad.push('a bot was crafted before the upgrade');
    const m = S().money; K.pick(BOT_ID); K.key('Enter'); if (S().money !== m || S().crew.length) bad.push('Enter crafted a locked bot');
    S().up = { bag: 3 }; S().stats.plush = 1e9; g.T = g.tune(); S().money = 1e13; if (!g.buy('crew')) bad.push('could not buy the upgrade'); if (S().crew.length !== 1 || !botRow()) bad.push('the upgrade did not hatch the first bot and unlock the row');
    return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.robots.tab-lists-the-bot-and-the-charging-station-and-the-card-reads-out-the-bunks', guard(async () => {
    fresh(UP); g.crew.sync(); const bad = []; K.open(); K.tab('robots');
    const ids = K.cards().map((c) => c.dataset.id); if (ids.join() !== 'charger,' + BOT_ID) bad.push('Robots tab: ' + ids);
    const c = K.cardEl(BOT_ID), d = K.pick(BOT_ID), txt = K.norm(d.textContent);
    if (!/Scrapper Bot/.test(c.textContent) || !c.textContent.includes('◈') || !/1/.test(c.querySelector('.bc-own').textContent)) bad.push('card: ' + K.norm(c.textContent));
    if (!/1 of 4 bunks used, 3 free/.test(txt)) bad.push('readout lacks the bunks: ' + txt.slice(0, 260)); if (!txt.includes('for the next one')) bad.push('no price line');
    if (!/How to use/.test(txt)) bad.push('no how to use');
    const offers = [...d.querySelectorAll('button[data-n]')].map((b) => +b.dataset.n); if (offers.join() !== '1,2,3') bad.push('batch buttons ' + offers);
    for (const b of d.querySelectorAll('button[data-n]')) if (+b.dataset.cost !== botQuote(1, +b.dataset.n)) bad.push(`x${b.dataset.n} costs ${b.dataset.cost}, quote ${botQuote(1, +b.dataset.n)}`);
    // the crew panel talks about the free bunks
    S().crew.length && g.ui.renderCrew(); if (!/free bunk/.test(document.getElementById('crewList').textContent)) bad.push('the crew panel does not mention the free bunks');
    return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.robots.craft-end-to-end-the-crew-grows-money-is-spent-and-a-bot-stands-at-the-bin', guard(async () => {
    fresh(UP); g.crew.sync(); const bad = []; if (S().crew.length !== 1) return 'the Scrapper Bot upgrade should hatch one bot, got ' + S().crew.length;
    S().money = 1e9; const ids0 = new Set(S().crew.map((b) => b.id)), m0 = S().money, p1 = botPrice(1);
    if (!g.craftItem(BOT_ID, 1)) return 'craft refused with money and a free bunk';
    if (S().crew.length !== 2) bad.push('crew ' + S().crew.length); if (m0 - S().money !== p1) bad.push(`charged ${m0 - S().money}, price ${p1}`);
    const nb = S().crew.find((b) => !ids0.has(b.id)); if (!nb) return 'no new bot'; if (!g.crew.objs.has(nb.id)) bad.push('the new bot has no body in the world');
    const h = g.crew.home(); if (Math.hypot(nb.x - h.x, nb.z - h.z) > 3) bad.push('the bot did not hatch at the bin'); if (nb.state !== 'idle' || nb.level !== 1 || !(nb.battery > 0.99)) bad.push(`new bot state ${nb.state} level ${nb.level} battery ${nb.battery}`);
    if (S().items[BOT_ID] || S().items['bot:scrapper']) bad.push('the bot became an item'); if (g.inventoryList().some((x) => x.id === BOT_ID)) bad.push('the bot is in the inventory'); if (recipes(g).some((r) => r.id === BOT_ID)) bad.push('the bot is a pack item recipe');
    // a batch: three more would be one too many (4 bunks, 2 used)
    const m1 = S().money, n1 = S().crew.length; if (g.craftItem(BOT_ID, 3) || S().money !== m1 || S().crew.length !== n1) bad.push('x3 into two free bunks was allowed or charged');
    if (!g.craftItem(BOT_ID, 2) || S().crew.length !== 4) bad.push('x2 into two free bunks failed: ' + S().crew.length); if (m1 - S().money !== botQuote(2, 2)) bad.push(`x2 charged ${m1 - S().money}, quote ${botQuote(2, 2)}`);
    // full: refused, nothing charged, and the card says why
    const m2 = S().money; if (g.craftItem(BOT_ID, 1) || S().money !== m2 || S().crew.length !== 4) bad.push('crafted into a full crew');
    K.open(); K.tab('robots'); const d = K.pick(BOT_ID), txt = K.norm(d.textContent); if (!/4 of 4 bunks used\. No free bunk: buy More Scrappers/.test(txt)) bad.push('full readout: ' + txt.slice(0, 220)); for (const b of d.querySelectorAll('button[data-n]')) if (!b.disabled) bad.push('an enabled button with no free bunk');
    K.key('Enter'); if (S().crew.length !== 4 || S().money !== m2) bad.push('Enter crafted into a full crew');
    // another bunk: the bench takes one more, the price follows the crew size
    S().up.crewSlots = 4; g.T = g.tune(); g.ui.renderCraft(); const want = botPrice(4); const row = g.ui.bench.rows.find((r) => r.id === BOT_ID); if (row.price !== want) bad.push(`price with 4 bots is ${row.price}, expected ${want}`);
    const m3 = S().money; K.key('Enter'); if (S().crew.length !== 5 || m3 - S().money !== want) bad.push(`Enter in the Robots tab: ${S().crew.length} bots, charged ${m3 - S().money}`);
    return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.robots.refusals-charge-nothing-and-never-spawn', guard(async () => {
    fresh(UP); g.crew.sync(); const bad = [];
    S().money = botPrice(1) - 1; const n0 = S().crew.length; if (g.craftItem(BOT_ID, 1) || S().crew.length !== n0 || S().money !== botPrice(1) - 1) bad.push('crafted without the money');
    S().money = 1e12; for (const n of [0, -1, NaN, undefined, null, 'x', Infinity, 1e9]) { const m = S().money, r = g.craftItem(BOT_ID, n); if (r || S().money !== m || S().crew.length !== n0) bad.push(`n=${n}: returned ${r}, money ${m - S().money}, bots ${S().crew.length - n0}`); }
    const k0 = S().crew.length; g.craftItem(BOT_ID, 1.9); if (S().crew.length !== k0 + 1) bad.push('1.9 should craft one, crafted ' + (S().crew.length - k0));
    if (S().crew.length > g.T.crewMax) bad.push('the crew outgrew its bunks: ' + S().crew.length + ' of ' + g.T.crewMax);
    return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.robots.slots-only-come-from-the-upgrades-and-a-new-bunk-does-not-hatch-a-bot', guard(async () => {
    fresh({ bag: 3 }); S().stats.plush = 1e9; S().money = 1e13; const bad = [];
    g.buy('crew'); const afterCrew = S().crew.length; g.buy('crewSlots'); g.buy('crewSlots'); if (S().crew.length !== afterCrew || g.T.crewMax !== 3) bad.push(`bunks ${g.T.crewMax}, bots ${S().crew.length} after two More Scrappers`);
    // Foundry needs all nine
    fresh({ crew: 1, crewSlots: 8, foundry: 2 }); g.crew.sync(); if (g.T.crewMax !== 11 || S().crew.length !== 1) bad.push(`foundry: ${g.T.crewMax} bunks, ${S().crew.length} bots`);
    S().money = 1e15; g.craftItem(BOT_ID, 10); if (S().crew.length !== 11) bad.push('ten crafted: ' + S().crew.length); g.craftItem(BOT_ID, 1); if (S().crew.length !== 11) bad.push('a twelfth bot');
    // sync never tops the crew up beyond the first bot
    S().crew.length = 0; for (const b of [...g.crew.objs.keys()]) { g.machines.disposeObj(g.crew.objs.get(b)); g.crew.root.remove(g.crew.objs.get(b)); g.crew.objs.delete(b); } g.crew.sync(); if (S().crew.length !== 1) bad.push('sync with an empty crew made ' + S().crew.length);
    return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.robots.no-cache-or-loot-roll-hands-out-a-free-bot', guard(async () => {
    fresh({ ...UP, timber: 1, struts: 1, markers: 1, power: 1, belts: 1, firstaid: 1 }); g.crew.sync(); const bad = [], n0 = S().crew.length;
    for (const r of recipes(g)) if (r.kind === 'bot') bad.push('a bot in the pack recipe list');
    const ids = new Set(recipes(g).filter((r) => r.kind !== 'cart' && r.kind !== 'mat' && r.kind !== 'supply').map((r) => r.id)); if (ids.has(BOT_ID)) bad.push('the cache loot list holds the bot');
    for (const k of Object.keys(S().items)) if (/bot/i.test(k)) bad.push('item ' + k);
    if (S().crew.length !== n0) bad.push('crew changed');
    return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.robots.crafted-bots-survive-a-save-and-load-and-the-bunk-limit-holds', guard(async () => {
    fresh(UP); g.crew.sync(); S().money = 1e9; g.craftItem(BOT_ID, 2); const bad = [], names = S().crew.map((b) => b.name).join(), ids = S().crew.map((b) => b.id).join();
    g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) return 'save failed';
    const saved = loadSaved(); if (!saved || !saved.S) return 'nothing saved'; if (!localStorage.getItem(SAVE_KEY)) return 'no save key';
    g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play';
    if (S().crew.map((b) => b.name).join() !== names || S().crew.map((b) => b.id).join() !== ids) bad.push(`after load: ${S().crew.map((b) => b.name)} not ${names}`);
    if (S().crew.length !== 3 || g.T.crewMax !== 4) bad.push(`after load: ${S().crew.length} bots, ${g.T.crewMax} bunks (a load must not hatch the empty bunk)`);
    S().money = 1e9; if (!g.craftItem(BOT_ID, 1) || S().crew.length !== 4) bad.push('could not fill the last bunk after a load'); if (g.craftItem(BOT_ID, 1) || S().crew.length !== 4) bad.push('crafted into a full crew after a load');
    return bad.length === 0 || bad.join('; ');
  }));

  await T('bench.robots.the-bench-window-crafts-a-bot-with-the-mouse-and-the-count-updates', guard(async () => {
    fresh(UP); g.crew.sync(); S().money = 1e9; K.open(); K.tab('robots'); const bad = [];
    K.cardEl(BOT_ID).click(); const b = K.detail().querySelector('button[data-n="2"]'); const m0 = S().money; b.click();
    if (S().crew.length !== 3 || m0 - S().money !== botQuote(1, 2)) bad.push(`x2 button: ${S().crew.length} bots, charged ${m0 - S().money}`);
    if (!/3 of 4 bunks used, 1 free/.test(K.norm(K.detail().textContent))) bad.push('the pane did not update: ' + K.norm(K.detail().textContent).slice(0, 200));
    if (K.cardEl(BOT_ID).querySelector('.bc-own').textContent !== '3') bad.push('the card count is ' + K.cardEl(BOT_ID).querySelector('.bc-own').textContent);
    const offers = [...K.detail().querySelectorAll('button[data-n]')].map((x) => x.dataset.n); if (offers.join() !== '1') bad.push('buttons with one bunk left: ' + offers);
    return bad.length === 0 || bad.join('; ');
  }));
}
