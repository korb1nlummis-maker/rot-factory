// The Crafting Table browser (E at the bench): tabs for every kind of thing, a search box, a compact grid of cards and a detail pane, in the
// way of Ark's engram list or Minecraft's creative tabs. Everything you can craft or buy as an item has a row here and lives in exactly one
// category tab; the ALL tab lists every row and the LOCKED tab the ones you cannot craft yet, with what unlocks each.
//
// The model (rows, categories, unlock text) is plain data so tests can read it; the DOM part fills #benchTabs, #craftGrid and #benchDetail.
import './bench.css';
import { FRAME_TYPES, UPGRADES, computeTuning, upgradeById } from './upgrades.js';
import { benchRecipes, MATERIALS } from './crafting.js';
import { EXTRA, PARTS } from './catalog.js';
import { escHtml, fmt } from './util.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- categories
export const CATS = [
  { id: 'supports', name: 'Supports and Frames', short: 'Supports', icon: '🧱', blurb: 'Frames, props, bulkheads and arches that hold a tunnel roof up.' },
  { id: 'building', name: 'Building', short: 'Building', icon: '🏗️', blurb: 'Pads, plates, stairs, ramps, walls, catwalks and ladders.' },
  { id: 'logistics', name: 'Belts and Logistics', short: 'Belts', icon: '🛤️', blurb: 'Belts, lifts, splitters, mergers, hose, sorters, vaults, gates and depots.' },
  { id: 'power', name: 'Power', short: 'Power', icon: '⚡', blurb: 'Generators, poles, switches, batteries, cables, fans and lamps.' },
  { id: 'machines', name: 'Machines and Vehicles', short: 'Machines', icon: '🚜', blurb: 'Mechs, borers, claw rigs, earth movers, trucks, rail and scanners.' },
  { id: 'robots', name: 'Robots', short: 'Robots', icon: '🤖', blurb: 'Scrapper Bots and the stations that keep them running.' },
  { id: 'tools', name: 'Tools and Gear', short: 'Tools', icon: '🧰', blurb: 'Markers, lights, ropes, medkits, dynamite and wearable gear.' },
  { id: 'transit', name: 'Carts and Transit', short: 'Transit', icon: '🛒', blurb: 'Carts, doors, elevators, jump pads and cushions.' },
  { id: 'furnish', name: 'Furnish', short: 'Furnish', icon: '🪑', blurb: 'Crates, lockers and signs.' },
];
export const TABS = [{ id: 'all', name: 'All', short: 'All', icon: '📦', blurb: 'Every recipe in the game.' }, ...CATS, { id: 'locked', name: 'Locked', short: 'Locked', icon: '🔒', blurb: 'What you cannot craft yet and what unlocks it, the cheapest first.' }];
const TAB_IDS = new Set(TABS.map((t) => t.id));
const CAT_BY_ID = Object.fromEntries(CATS.map((c) => [c.id, c]));

// bench row kind -> category. A few ids share a kind ('supply'), those go by id below.
const KIND_CAT = {
  frame: 'supports', strut: 'supports', jack: 'supports', bulk: 'supports', liftframe: 'supports', garch: 'supports',
  pad: 'building', wall: 'building', wramp: 'building', stair: 'building', catwalk: 'building', ladder: 'building', levelpad: 'building',
  belt: 'logistics', lift: 'logistics', ug: 'logistics', splitter: 'logistics', merger: 'logistics', pmerger: 'logistics', ssplit: 'logistics', psplit: 'logistics',
  sorter: 'logistics', vault: 'logistics', ovault: 'logistics', silo: 'logistics', dimdepot: 'logistics', beacon: 'logistics', gate: 'logistics',
  gen: 'power', pole: 'power', switch: 'power', breaker: 'power', meter: 'power', battery: 'power', pswitch: 'power', cable: 'power', fan: 'power', mfan: 'power',
  hlamp: 'power', clamp: 'power', strip: 'power', flood: 'power', wbeacon: 'power',
  mech: 'machines', borer: 'machines', claw: 'machines', excavator: 'machines', dozer: 'machines', wheel: 'machines', truck: 'machines', dock: 'machines', road: 'machines',
  rail: 'machines', railstn: 'machines', railcar: 'machines', vscan: 'machines', arch: 'machines', sborer: 'machines',
  bot: 'robots', charger: 'robots',
  marker: 'tools', glow: 'tools', flare: 'tools', lantern: 'tools', rope: 'tools', dynamite: 'tools', charge: 'tools', gear: 'tools',
  cart: 'transit', door: 'transit', plift: 'transit', jump: 'transit', cushion: 'transit',
  sign: 'furnish', dsign: 'furnish', psign: 'furnish', locker: 'furnish', pcrate: 'furnish',
};
const ID_CAT = { medkit: 'tools', canister: 'tools', doorkey: 'transit', chargepack: 'machines' };
// the category a row is filed under, or null when nobody has filed its kind yet (a test insists none is missing)
export const explicitCategory = (r) => ID_CAT[r.id] || KIND_CAT[r.kind] || null;
export const categoryOf = (r) => explicitCategory(r) || 'tools';

// ---------------------------------------------------------------- what unlocks what
// Every upgrade level is tried on its own (and on top of each frame, which the tier-made rows need as well). A row that shows up lists the
// upgrade levels that made it show up: that is its unlock. Pure data, so it is computed once and kept.
let probeCache = null;
function tuneProxy(g, T) { const px = Object.create(g); Object.defineProperty(px, 'T', { value: T, configurable: true }); return px; }
const sigOf = (T) => JSON.stringify(Object.entries(T).filter(([, v]) => typeof v === 'boolean' || Array.isArray(v) || Number.isInteger(v)));
const PROBE_TTL = 600000;   // the table only depends on the upgrade list and the catalog parts (the key); building it takes about 140 ms, so it is not redone at every opening
function probe(g, fresh) {
  const key = Object.keys(EXTRA).join(',') + '|' + UPGRADES.length;
  if (probeCache && probeCache.key === key && !(fresh && Date.now() - probeCache.at > PROBE_TTL)) return probeCache.map;
  const map = new Map();
  const bases = [[]].concat(Object.keys(FRAME_TYPES).map((k) => [[k, 1]]));
  for (const base of bases) {
    const lv0 = Object.fromEntries(base);
    const sig0 = sigOf(computeTuning(lv0));
    for (const u of UPGRADES) {
      if (lv0[u.id]) continue;
      let prev = sig0;
      for (let l = 1; l <= u.max; l++) {
        const T = computeTuning({ ...lv0, [u.id]: l });
        const s = sigOf(T);
        if (s === prev) continue;
        prev = s;
        let rows; try { rows = benchRecipes(tuneProxy(g, T)); } catch (e) { continue; }
        for (const r of rows) if (!map.has(r.id)) map.set(r.id, { row: r, needs: [...base, [u.id, l]] });
      }
    }
  }
  // rows that need three purchases or more (the Cathedral Arch wants its upgrade, the Haul Truck and a frame): add upgrades cheapest first until
  // every one of them shows up, then keep the upgrades whose removal makes a row vanish again (only the catalog part that makes the rows is asked)
  try {
    const top = Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
    const lostRows = benchRecipes(tuneProxy(g, computeTuning(top))).filter((r) => !map.has(r.id));
    if (lostRows.length) {
      const lost = new Set(lostRows.map((r) => r.id)), acc = {};
      let prev = sigOf(computeTuning({})), seen = 0;
      for (const u of [...UPGRADES].sort((a, b) => a.cost[0] - b.cost[0])) {
        acc[u.id] = 1;
        const s = sigOf(computeTuning(acc));
        if (s === prev) continue;
        prev = s;
        seen = benchRecipes(tuneProxy(g, computeTuning(acc))).filter((r) => lost.has(r.id)).length;
        if (seen === lost.size) break;
      }
      const T1 = computeTuning(acc), src = [];
      for (const part of Object.values({ ...PARTS, ...EXTRA })) { try { if (part.RECIPES && part.RECIPES(tuneProxy(g, T1)).some((r) => lost.has(r.id))) src.push(part); } catch (e) { /* skip */ } }
      const idsOf = (T) => { const px = tuneProxy(g, T), ids = new Set(); if (src.length) { for (const part of src) for (const r of part.RECIPES(px)) ids.add(r.id); } else for (const r of benchRecipes(px)) ids.add(r.id); return ids; };
      const needs = new Map(lostRows.map((r) => [r.id, []])), s1 = sigOf(T1);
      for (const id of Object.keys(acc)) {
        const { [id]: _drop, ...rest } = acc;
        const Tr = computeTuning(rest);
        if (sigOf(Tr) === s1) continue;
        const present = idsOf(Tr);
        for (const r of lostRows) if (!present.has(r.id)) needs.get(r.id).push([id, 1]);
      }
      for (const r of lostRows) map.set(r.id, { row: r, needs: needs.get(r.id) });
    }
  } catch (e) { console.warn('bench: unlock search for the multi-step rows failed', e); }   // those rows then say "later in the game"
  probeCache = { key, map, at: Date.now() };
  return map;
}

// the upgrade purchases (in order, prerequisites first) that would give `needs`, given what you own
function stepsFor(needs, have) {
  const cur = { ...have }, out = [];
  const want = (id, lvl) => {
    const u = upgradeById(id); if (!u) return;
    if (u.req) want(u.req.id, u.req.lvl);
    for (let l = (cur[id] || 0) + 1; l <= lvl; l++) { cur[id] = l; out.push({ id, lvl: l, name: u.max > 1 ? `${u.name} ${l}` : u.name, cost: u.cost[l - 1] || 0, plush: u.needs || 0 }); }
  };
  for (const [id, lvl] of needs) want(id, lvl);
  return out;
}
const upName = (id, lvl) => { const u = upgradeById(id); return u ? (u.max > 1 ? `${u.name} ${lvl}` : u.name) : id; };

function lockInfo(g, entry) {
  if (!entry) return { text: 'Unlocked later in the game', steps: [], total: Infinity, direct: [] };
  const have = g.S.up || {};
  const direct = entry.needs.filter(([id, l]) => (have[id] || 0) < l);
  const steps = stepsFor(entry.needs, have);
  const total = steps.reduce((a, s) => a + s.cost, 0);
  const names = direct.map(([id, l]) => upName(id, l));
  const stats = g.shopStats ? g.shopStats() : g.S;
  const plush = steps.reduce((a, s) => Math.max(a, s.plush), 0);
  const plushNote = plush && stats && stats.stats && stats.stats.plush < plush ? `Needs ${plush.toLocaleString('en-US')} plush handled` : '';
  return { text: names.length ? `Needs ${names.join(' and ')}` : 'Needs a terminal upgrade', steps, total, direct: names, plushNote };
}

// ---------------------------------------------------------------- the rows
function ownedOf(g, r) {
  if (r.kind === 'bot') return (g.S.crew || []).length;
  if (r.kind === 'cart') return /already have|In use|in your pack/.test(r.status || '') ? 1 : 0;
  return (g.S.items && g.S.items[r.id]) || 0;
}
// what crafting `n` of a row costs right now (the same sums craft() does)
export function quoteOf(g, r, n) {
  if (r.kind === 'bot') return r.quote(n);
  if (r.kind === 'cart' || r.kind === 'gear') return r.price;
  if (r.mat) { const stock = (g.S.mats || {})[r.mat] || 0; return Math.round(Math.max(0, r.matN * n - stock) * (r.price / r.matN)); }
  return r.price * n;
}
// the buttons a row offers: [{ n, cost, label, off }]
export function offersOf(g, r) {
  if (r.locked) return [];
  if (r.kind === 'cart') { const own = /already have|In use|in your pack/.test(r.status || ''); return [{ n: 1, cost: r.price, label: own ? 'Owned' : /Upgrade/.test(r.status || '') ? 'Upgrade' : 'Craft', off: own }]; }
  if (r.kind === 'gear') return [{ n: 1, cost: r.price, label: 'Craft', off: false }];
  if (r.kind === 'bot') {
    const ns = [...new Set((r.batch || [1]).filter((n) => n === 1 || n <= r.free))];
    return ns.map((n) => ({ n, cost: quoteOf(g, r, n), label: `x${n}`, off: r.free < n }));
  }
  return [...new Set(r.batch || [1])].map((n) => ({ n, cost: quoteOf(g, r, n), label: `x${n}`, off: false }));
}

// every row of the bench: what you can craft now, then what you cannot yet (with its unlock). Each carries its category.
export function buildRows(g, opts = {}) {
  const live = benchRecipes(g);
  const rows = live.map((r) => ({ ...r, cat: categoryOf(r), locked: false, owned: ownedOf(g, r) }));
  for (const gr of g.gearList ? g.gearList() : []) rows.push({ id: 'gear:' + gr.id, gid: gr.id, kind: 'gear', icon: '🧰', name: gr.name, short: gr.name, desc: `${gr.line}: ${gr.desc}`, use: 'Craft it and it is equipped: it works at once.', price: gr.price, batch: [1], status: `Unlocked tier ${gr.bought}. Crafted tier ${gr.have}.`, cat: 'tools', locked: false, owned: 0 });
  const have = new Set(rows.map((r) => r.id));
  const map = probe(g, opts.fresh);
  for (const [id, entry] of map) {
    if (have.has(id)) continue;
    const r = entry.row;
    rows.push({ ...r, cat: categoryOf(r), locked: true, owned: 0, status: '', lock: lockInfo(g, entry) });
  }
  // ready rows keep the recipe order; locked rows go cheapest unlock first
  const ready = rows.filter((r) => !r.locked), locked = rows.filter((r) => r.locked).sort((a, b) => (a.lock.total - b.lock.total) || a.name.localeCompare(b.name));
  return [...ready, ...locked];
}

// ---------------------------------------------------------------- search and tab lists
const textOf = (r) => `${r.name} ${r.short || ''} ${r.desc || ''} ${r.use || ''} ${r.status || ''} ${CAT_BY_ID[r.cat].name} ${r.locked ? r.lock.text : ''}`.toLowerCase();
export function matches(r, query) {
  const q = (query || '').toLowerCase().trim(); if (!q) return true;
  const hay = textOf(r);
  return q.split(/\s+/).every((w) => hay.includes(w));
}
// the rows a tab shows for a query: the ALL tab and the categories list what you can craft first, then what is locked (unless hidden)
export function tabRows(rows, tab, query, hideLocked) {
  const inTab = (r) => (tab === 'all' ? true : tab === 'locked' ? r.locked : r.cat === tab);
  let out = rows.filter((r) => inTab(r) && matches(r, query));
  if (hideLocked && tab !== 'locked') out = out.filter((r) => !r.locked);
  if (tab === 'all') { const order = new Map(CATS.map((c, i) => [c.id, i])); out = out.map((r, i) => [r, i]).sort((a, b) => (order.get(a[0].cat) - order.get(b[0].cat)) || (a[0].locked - b[0].locked) || (a[1] - b[1])).map((x) => x[0]); }
  else if (tab !== 'locked') out = [...out.filter((r) => !r.locked), ...out.filter((r) => r.locked)];
  return out;
}
// { tabId: { total, ready } } for a query (the numbers on the tabs)
export function tabCounts(rows, query) {
  const out = {};
  for (const t of TABS) { const l = rows.filter((r) => (t.id === 'all' ? true : t.id === 'locked' ? r.locked : r.cat === t.id) && matches(r, query)); out[t.id] = { total: l.length, ready: l.filter((r) => !r.locked).length }; }
  return out;
}

// ---------------------------------------------------------------- remembered state
const LS_KEY = 'rf.bench';
function loadPrefs() { try { const o = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); return { tab: TAB_IDS.has(o.tab) ? o.tab : 'all', hide: !!o.hide }; } catch (e) { return { tab: 'all', hide: false }; } }
function savePrefs(st) { try { localStorage.setItem(LS_KEY, JSON.stringify({ tab: st.tab, hide: st.hide })); } catch (e) { /* private window: the tab is just not remembered */ } }
export function state(ui) {
  if (!ui.bench) ui.bench = { ...loadPrefs(), q: '', sel: null, rows: [], shown: [] };
  return ui.bench;
}

// ---------------------------------------------------------------- drawing
const cssId = (id) => (window.CSS && CSS.escape ? CSS.escape(id) : id.replace(/[^\w-]/g, '\\$&'));
const priceTag = (r) => `◈ ${fmt(r.price)}`;
const catName = (r) => CAT_BY_ID[r.cat].name;

function cardHtml(g, r) {
  const first = r.locked ? 0 : (offersOf(g, r)[0] || { cost: r.price }).cost;
  const own = r.owned > 0 ? `<span class="bc-own" title="You have ${r.owned}">${r.kind === 'bot' ? '' : '×'}${r.owned}</span>` : '';
  const foot = r.locked ? `<span class="bc-lock">🔒 ${escHtml(r.lock.text)}</span>` : `<span class="bc-price">${priceTag(r)}</span>`;
  const label = `${r.name}, ${r.locked ? 'locked. ' + r.lock.text : 'price ' + fmt(r.price) + (r.owned ? ', you have ' + r.owned : '')}`;
  const tip = r.locked ? `${r.name}: ${r.lock.text}` : `${r.name}: ◈ ${fmt(r.price)}${r.status ? '. ' + r.status : ''}`;
  return `<div class="bcard${r.locked ? ' locked' : ''}" role="option" aria-selected="false" aria-label="${escHtml(label)}" title="${escHtml(tip)}" tabindex="-1" data-id="${escHtml(r.id)}" data-cat="${r.cat}"${r.locked ? ' data-locked="1"' : ` data-cost="${first}"`}>`
    + `<span class="bc-ico">${r.icon}</span>${own}<span class="bc-name">${escHtml(r.name)}</span>${foot}</div>`;
}

function detailHtml(g, r, st) {
  if (!r) return '<div class="bd-empty">Nothing here. Try another tab, or clear the search box.</div>';
  const mats = r.mat ? `<div class="bd-row"><b>Uses</b> <span>${r.matN} ${escHtml(MATERIALS[r.mat].name)} each (you have ${(g.S.mats || {})[r.mat] || 0}). A shortfall is bought at the full price.</span></div>` : '';
  const lock = r.locked
    ? `<div class="bd-lock"><b>🔒 ${escHtml(r.lock.text)}</b>${r.lock.steps.length ? `<span>${r.lock.steps.slice(0, 6).map((s) => `${escHtml(s.name)} (◈ ${fmt(s.cost)})`).join(' then ')}${r.lock.steps.length > 6 ? ` and ${r.lock.steps.length - 6} more` : ''}${r.lock.steps.length > 1 ? `. Total ◈ ${fmt(r.lock.total)}` : ''}. Buy it at the terminal (E at the desk, or Tab).</span>` : '<span>It is not in the terminal yet.</span>'}${r.lock.plushNote ? `<span>${escHtml(r.lock.plushNote)}.</span>` : r.lock.steps.length && g.S.money >= r.lock.steps[0].cost ? '<span>You can afford the first step now.</span>' : ''}</div>`
    : '';
  const offers = offersOf(g, r);
  const btns = r.locked ? '<button class="bd-btn" disabled>Locked</button>'
    : offers.map((o) => `<button class="bd-btn" data-n="${o.n}" data-cost="${o.cost}"${o.off ? ' data-off="1" disabled' : ''}>${o.label} · ◈${fmt(o.cost)}</button>`).join('');
  const hint = r.locked ? '' : `<div class="bd-key"><kbd>Enter</kbd> crafts 1${offers.length > 1 ? `, <kbd>Shift</kbd>+<kbd>Enter</kbd> crafts ${(offers[1] || offers[0]).n}` : ''}</div>`;
  const status = r.status ? `<div class="bd-row"><b>Status</b> <span>${escHtml(r.status)}</span></div>` : '';
  const have = r.owned > 0 ? `<div class="bd-row"><b>${r.kind === 'bot' ? 'Crew' : 'You have'}</b> <span>${r.owned}${r.kind === 'bot' ? ` bot${r.owned === 1 ? '' : 's'}` : ''}</span></div>` : '';
  const price = r.locked ? '' : `<div class="bd-row"><b>Price</b> <span>◈ ${fmt(r.price)}${r.kind === 'bot' ? ' for the next one, dearer for each you own' : r.kind === 'frame' || r.mat ? ' each' : ''}</span></div>`;
  return `<div class="bd-head"><span class="bd-ico">${r.icon}</span><div><h3>${escHtml(r.name)}</h3><div class="bd-sub">${CAT_BY_ID[r.cat].icon} ${escHtml(catName(r))}</div></div></div>`
    + lock + `<p class="bd-desc">${escHtml(r.desc || '')}</p>` + price + have + mats + status
    + (r.use ? `<div class="bd-use"><b>How to use</b> <span>${escHtml(r.use)}</span></div>` : '')
    + `<div class="bd-buy">${btns}</div>${hint}`;
}

// write markup into a node only when it differs from what the node was last given. A redraw that changes nothing (a guest gets one every 0.6 s,
// belts move the balance all the time) then keeps every node: a click that began before it still lands, the hover stays and nothing flickers.
function put(el, html) {
  if (el._benchHtml === html && el._benchFirst === el.firstChild) return false;
  el.innerHTML = html; el._benchHtml = html; el._benchFirst = el.firstChild;
  return true;
}
// what the balance decides, painted on top of the markup so the markup does not depend on it: a card you cannot pay yet is dimmed, a craft button
// you cannot pay is off. A button that is off for another reason (data-off: an owned cart, a full crew) stays off whatever the balance.
export function paintMoney(money) {
  const win = $('craft'); if (!win) return;
  for (const c of win.querySelectorAll('.bcard[data-cost]')) c.classList.toggle('broke', money < +c.dataset.cost);
  for (const b of win.querySelectorAll('#benchDetail button[data-cost]')) b.disabled = b.hasAttribute('data-off') || money < +b.dataset.cost;
}
function markSel(grid, id) {
  for (const c of grid.querySelectorAll('.bcard')) { const on = c.dataset.id === id; c.classList.toggle('sel', on); c.setAttribute('aria-selected', on); c.tabIndex = on ? 0 : -1; }
}

// draw everything. opts: { open } (the window just opened), { fresh } (look the unlock table up again)
export function render(ui, opts = {}) {
  const g = ui.game, st = state(ui);
  const grid = $('craftGrid'), tabsEl = $('benchTabs'), detail = $('benchDetail'), search = $('benchSearch'), hideEl = $('benchHide');
  if (!grid || !tabsEl || !detail) return;
  $('craftMoney').textContent = fmt(g.S.money);
  if (opts.open) { st.q = ''; if (search) search.value = ''; }
  if (search && search.value !== st.q) search.value = st.q;
  if (hideEl) hideEl.checked = st.hide;
  const rows = buildRows(g, opts);
  st.rows = rows;
  const counts = tabCounts(rows, st.q);
  if (!TAB_IDS.has(st.tab)) st.tab = 'all';
  const focusedTab = document.activeElement && tabsEl.contains(document.activeElement) ? document.activeElement.dataset.tab : null;
  const tabsNew = put(tabsEl, TABS.map((t) => {
    const c = counts[t.id], on = t.id === st.tab;
    const num = t.id === 'locked' ? `${c.total}` : `${c.ready}/${c.total}`;
    return `<button role="tab" class="bt${on ? ' on' : ''}${c.total === 0 ? ' none' : ''}" data-tab="${t.id}" data-total="${c.total}" data-have="${c.ready}" aria-selected="${on}" tabindex="${on ? 0 : -1}" title="${escHtml(t.name)}: ${c.ready} ready, ${c.total - c.ready} locked. ${escHtml(t.blurb)}"><span class="ti">${t.icon}</span><span class="tn">${escHtml(t.name)}</span><span class="ts">${escHtml(t.short)}</span><span class="tc">${num}</span></button>`;
  }).join(''));
  if (tabsNew && focusedTab) { const b = tabsEl.querySelector(`[data-tab="${focusedTab}"]`); if (b) b.focus({ preventScroll: true }); }

  const shown = tabRows(rows, st.tab, st.q, st.hide);
  st.shown = shown;
  if (!shown.some((r) => r.id === st.sel)) st.sel = shown.length ? shown[0].id : null;
  const hadFocus = grid.contains(document.activeElement);
  const detailFocus = detail.contains(document.activeElement) && document.activeElement.dataset ? document.activeElement.dataset.n : null;
  const keepScroll = grid.scrollTop;
  let gridNew;
  if (!shown.length) {
    const elsewhere = TABS.filter((t) => t.id !== st.tab && t.id !== 'all' && counts[t.id].total > 0);
    const echo = st.q.length > 40 ? st.q.slice(0, 40) + '...' : st.q;
    gridNew = put(grid, `<div class="bench-none">${st.q ? `Nothing in ${escHtml(TABS.find((t) => t.id === st.tab).name)} matches "${escHtml(echo)}".` : 'Nothing in this tab yet.'}${st.q && elsewhere.length ? ` Matches in: ${elsewhere.map((t) => `<a href="#" data-goto="${t.id}">${escHtml(t.short)} (${counts[t.id].total})</a>`).join(', ')}.` : ''}</div>`);
    if (gridNew) for (const a of grid.querySelectorAll('[data-goto]')) a.onclick = (e) => { e.preventDefault(); setTab(ui, a.dataset.goto); };
  } else {
    let html = '', lastCat = null;
    for (const r of shown) {
      if (st.tab === 'all' && r.cat !== lastCat) { html += `<div class="bench-cat" role="presentation"><span>${CAT_BY_ID[r.cat].icon} ${escHtml(CAT_BY_ID[r.cat].name)}</span></div>`; lastCat = r.cat; }
      html += cardHtml(g, r);
    }
    gridNew = put(grid, html);
    if (gridNew) {
      grid.scrollTop = keepScroll;
      for (const c of grid.querySelectorAll('.bcard')) {
        c.onclick = () => { select(ui, c.dataset.id, false); };
        c.ondblclick = () => { const r = st.rows.find((x) => x.id === c.dataset.id); if (r && !r.locked) craftRow(ui, r, 1); };
      }
    }
  }
  markSel(grid, shown.length ? st.sel : null);
  const sel = shown.find((r) => r.id === st.sel) || null;
  detail.dataset.id = sel ? sel.id : '';
  const detailNew = put(detail, detailHtml(g, sel, st));
  if (detailNew) for (const b of detail.querySelectorAll('button[data-n]')) b.onclick = () => { if (sel) craftRow(ui, sel, +b.dataset.n); };
  paintMoney(g.S.money);
  if (detailNew && detailFocus) { const b = detail.querySelector(`button[data-n="${detailFocus}"]:not(:disabled)`); if (b) b.focus({ preventScroll: true }); else { const el = grid.querySelector('.bcard.sel'); if (el) el.focus({ preventScroll: true }); } }
  else if (((hadFocus && gridNew) || opts.open) && !detailFocus && sel && !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) { const el = grid.querySelector(`.bcard[data-id="${cssId(sel.id)}"]`); if (el) el.focus({ preventScroll: true }); if (opts.open) keepSelVisible(grid); }
  const ct = $('benchCount'); if (ct) ct.textContent = `${shown.length} shown`;
}

function keepSelVisible(grid) { const el = grid.querySelector('.bcard.sel'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }

export function setTab(ui, id) {
  const st = state(ui); if (!TAB_IDS.has(id)) return;
  st.tab = id; savePrefs(st);
  render(ui);
}
export function select(ui, id, focus = true) {
  const st = state(ui); st.sel = id;
  const grid = $('craftGrid');
  markSel(grid, id);
  if (focus) { const c = grid.querySelector(`.bcard[data-id="${cssId(id)}"]`); if (c) { c.focus({ preventScroll: true }); c.scrollIntoView({ block: 'nearest' }); } }
  const r = st.shown.find((x) => x.id === id) || null;
  const detail = $('benchDetail'); detail.dataset.id = r ? r.id : '';
  if (put(detail, detailHtml(ui.game, r, st))) for (const b of detail.querySelectorAll('button[data-n]')) b.onclick = () => { if (r) craftRow(ui, r, +b.dataset.n); };
  paintMoney(ui.game.S.money);
}
export function setQuery(ui, q) {
  const st = state(ui); st.q = q; render(ui);
}
export function setHide(ui, on) { const st = state(ui); st.hide = !!on; savePrefs(st); render(ui); }

// craft n of a row through the game (a guest sends the command, the host does it)
export function craftRow(ui, r, n) {
  const g = ui.game;
  if (r.locked) { g.sound.error(); return false; }
  if (g.isGuest && g.isGuest()) {
    const o = offersOf(g, r).find((x) => x.n === n);
    if ((o && o.off) || g.S.money < quoteOf(g, r, n)) { g.sound.error(); return false; }
  }
  const ok = r.kind === 'gear' ? g.craftGearItem(r.gid) : g.craftItem(r.id, n);
  render(ui);
  return ok;
}

// ---------------------------------------------------------------- keyboard
function colsOf(grid) { const n = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length; return Math.max(1, n); }
// up and down by what is on screen: the card in the next row whose centre is nearest to this one's. The ALL tab has category blocks whose last row is
// short, so "one row down" is not "the index plus the column count". With no row that way the selection stays.
function rowStep(grid, list, from, dir, rows) {
  const els = [...grid.querySelectorAll('.bcard')];
  if (els.length !== list.length) return from + dir * colsOf(grid) * rows;
  const rects = els.map((e) => e.getBoundingClientRect());
  let at = from;
  for (let s = 0; s < rows; s++) {
    const r0 = rects[at], cx = r0.left + r0.width / 2;
    let best = -1, bestAway = Infinity, bestDx = Infinity;
    for (let k = 0; k < rects.length; k++) {
      const away = (rects[k].top - r0.top) * dir; if (away <= 4) continue;
      const dx = Math.abs(rects[k].left + rects[k].width / 2 - cx);
      if (away < bestAway - 4 || (away <= bestAway + 4 && dx < bestDx)) { if (away < bestAway - 4) bestAway = away; best = k; bestDx = dx; }
    }
    if (best < 0) break;
    at = best;
  }
  return at;
}
function moveSel(ui, key) {
  const st = state(ui), list = st.shown; if (!list.length) return;
  const grid = $('craftGrid');
  let i = Math.max(0, list.findIndex((r) => r.id === st.sel));
  if (key === 'ArrowLeft') i -= 1; else if (key === 'ArrowRight') i += 1;
  else if (key === 'ArrowUp') i = rowStep(grid, list, i, -1, 1); else if (key === 'ArrowDown') i = rowStep(grid, list, i, 1, 1);
  else if (key === 'Home') i = 0; else if (key === 'End') i = list.length - 1;
  else if (key === 'PageUp') i = rowStep(grid, list, i, -1, 3); else if (key === 'PageDown') i = rowStep(grid, list, i, 1, 3);
  i = Math.max(0, Math.min(list.length - 1, i));
  select(ui, list[i].id, true);
}
export function craftSelected(ui, big) {
  const g = ui.game, st = state(ui);
  const r = st.shown.find((x) => x.id === st.sel); if (!r) return false;
  if (r.locked) { g.sound.error(); return false; }
  const offers = offersOf(g, r).filter((o) => !o.off);
  const o = big ? (offers[1] || offers[offers.length - 1]) : offers[0];
  if (!o) { g.sound.error(); return false; }
  return craftRow(ui, r, o.n);
}
function stepTab(ui, dir, abs) {
  const st = state(ui); let i = TABS.findIndex((t) => t.id === st.tab);
  i = abs === 'start' ? 0 : abs === 'end' ? TABS.length - 1 : (i + dir + TABS.length) % TABS.length;
  setTab(ui, TABS[i].id);
  const b = $('benchTabs').querySelector(`[data-tab="${TABS[i].id}"]`); if (b) { b.focus({ preventScroll: true }); b.scrollIntoView({ inline: 'nearest', block: 'nearest' }); }
}

let installed = false;
// one capture listener for the page: while the bench is open it owns the keys it uses, so the game never sees them (Tab would close the window)
export function installKeys(ui) {
  if (installed) return; installed = true;
  window.addEventListener('keydown', (e) => {
    if (ui.openModal !== 'craft') return;
    const t = e.target, tag = t && t.tagName, inInput = tag === 'INPUT' || tag === 'TEXTAREA';
    const inTabs = t && t.closest && t.closest('#benchTabs');
    const own = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (inInput && t.id === 'benchSearch') {
      if (e.code === 'Escape') { if (t.value) { own(); t.value = ''; setQuery(ui, ''); } return; }   // the first Esc clears the search, the next one closes (the game's own input rule)
      if (e.code === 'ArrowDown' || e.code === 'Enter') { own(); const st = state(ui); if (st.sel) select(ui, st.sel, true); return; }
      e.stopPropagation(); return;
    }
    if (inInput) return;
    if (e.repeat && (e.code === 'Enter' || e.code === 'NumpadEnter')) { own(); return; }   // a held Enter crafts once, and never clicks a focused button over and over
    if (e.code === 'Tab') { e.stopPropagation(); return; }   // normal focus order; the game's Tab would close the bench
    if (inTabs && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Home' || e.code === 'End')) { own(); stepTab(ui, e.code === 'ArrowLeft' ? -1 : 1, e.code === 'Home' ? 'start' : e.code === 'End' ? 'end' : null); return; }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'Home' || e.code === 'End' || e.code === 'PageUp' || e.code === 'PageDown') { if (tag === 'BUTTON' && !inTabs && (e.code === 'ArrowLeft' || e.code === 'ArrowRight') && t.closest('#benchDetail')) return; own(); moveSel(ui, e.code); return; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { if (tag === 'BUTTON' || (t && t.closest && t.closest('a'))) { e.stopPropagation(); return; } own(); craftSelected(ui, e.shiftKey); return; }
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') { own(); stepTab(ui, e.code === 'BracketLeft' ? -1 : 1); return; }
    if (e.key === '/' || (e.key && e.key.length === 1 && /\S/.test(e.key) && !e.repeat && e.key !== ' ')) {   // start typing: the search box takes the letter
      const s = $('benchSearch'); if (s) { s.focus(); if (e.key === '/') e.preventDefault(); e.stopPropagation(); }
      return;
    }
  }, true);
  const search = $('benchSearch'), hide = $('benchHide');
  if (search) search.addEventListener('input', () => setQuery(ui, search.value));
  if (hide) hide.addEventListener('change', () => setHide(ui, hide.checked));
  $('benchTabs').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) setTab(ui, b.dataset.tab); });
}
