// The Plushdex screen. 6,700+ species do not fit in a page of cards, so the grid is virtual: #dexGrid is the scrolling CSS grid, only the cards in view (and a few rows
// either side) exist as children, and the padding above and below stands in for the rows that are not drawn. Search, rarity, region, pattern and found/missing filters
// run over plain arrays of ids (about a millisecond for the whole table); the icons are drawn a few per frame and kept in a small cache (icons.js).
import { RARITY, species, speciesCount, NEEDLE, DECOYS, REGIONS, regionTotals, regionRange, PATTERN_LABELS, dexTally } from './plushdata.js';
import { speciesIcon, silhouetteIcon } from './icons.js';
import { fmt } from './util.js';

const $ = (id) => document.getElementById(id);
export const CARD_H = 160, GAP = 10, ROW_H = CARD_H + GAP, MIN_W = 104, PAD_X = 20, PAD_Y = 18;
const BUFFER_ROWS = 2;

// The two orders of the whole table, made once: the ones you have found read rarest first, the missing ones by home region (nearest first), then rarest first.
let ORDER_FOUND = null, ORDER_MISSING = null;
function orders() {
  if (ORDER_FOUND) return;
  const ids = [];
  for (let s = 1; s <= speciesCount; s++) ids.push(s);
  for (const d of DECOYS) ids.push(d);
  ORDER_FOUND = ids.slice().sort((a, b) => species[b].rarity - species[a].rarity || a - b);
  ORDER_MISSING = ids.slice().sort((a, b) => species[a].lo - species[b].lo || species[b].rarity - species[a].rarity || a - b);
}

export const dexState = { q: '', rarity: -1, region: -1, pat: -1, show: 'all', list: [], cols: 1, first: -1, last: -1, raf: 0, bound: false, work: 0 };

function ensureBar() {
  if ($('dexBar')) return;
  const bar = document.createElement('div');
  bar.id = 'dexBar';
  bar.innerHTML = `<div class="dexRow">
      <input id="dexSearch" type="search" placeholder="Search the species you have found" autocomplete="off" spellcheck="false">
      <select id="dexRarity"><option value="-1">Every rarity</option>${RARITY.slice(0, 6).map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}</select>
      <select id="dexPat"><option value="-1">Every pattern</option>${PATTERN_LABELS.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select>
      <span class="seg" id="dexShow"><button data-show="all" class="on">All</button><button data-show="found">Found</button><button data-show="missing">Missing</button></span>
    </div>
    <div class="dexRow" id="dexRegions"></div>
    <div class="dexRow"><span id="dexShown"></span></div>`;
  const grid = $('dexGrid');
  grid.parentNode.insertBefore(bar, grid);
}

function wire() {
  const st = dexState;
  if (st.bound) return;
  st.bound = true;
  let t = 0;
  $('dexSearch').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.q = $('dexSearch').value.trim().toLowerCase(); refilter(true); }, 120); });
  $('dexRarity').addEventListener('change', () => { st.rarity = +$('dexRarity').value; refilter(true); });
  $('dexPat').addEventListener('change', () => { st.pat = +$('dexPat').value; refilter(true); });
  $('dexShow').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.show = b.dataset.show; refilter(true); });
  $('dexRegions').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.region = +b.dataset.r; refilter(true); });
  $('dexGrid').addEventListener('scroll', () => { if (!st.raf) st.raf = requestAnimationFrame(() => { st.raf = 0; draw(); }); }, { passive: true });
  window.addEventListener('resize', () => { if (ui && ui.openModal === 'dex') refilter(false); });
}

let ui = null;
const dexOf = () => ui.game.S.dex || {};

// the ids that pass the filters, in the order they are shown
export function filterList(dex, f) {
  orders();
  const src = f.show === 'missing' ? ORDER_MISSING : ORDER_FOUND;
  const out = [];
  const words = f.q ? f.q.split(/\s+/).filter(Boolean) : null;
  const one = dex[NEEDLE] ? [NEEDLE] : [];
  const seen = (id) => dex[id] !== undefined;
  const pass = (id) => {
    const s = species[id];
    if (f.rarity >= 0 && s.rarity !== f.rarity) return false;
    if (f.region >= 0 && s.lo !== f.region) return false;
    if (f.pat >= 0 && (s.pat || 0) !== f.pat) return false;
    return true;
  };
  const lowName = (s) => s.lname || (s.lname = s.name.toLowerCase());
  const nameOk = (s) => { if (!words) return true; const n = lowName(s); for (const w of words) if (n.indexOf(w) < 0) return false; return true; };
  if (f.show === 'all') {
    // found first (rarest first), then the missing ones by region; a search can only match what you have found
    for (const id of one) if (nameOk(species[id]) && f.rarity < 0 && f.region < 0 && f.pat < 0) out.push(id);
    for (const id of ORDER_FOUND) if (seen(id) && pass(id) && nameOk(species[id])) out.push(id);
    if (!words) for (const id of ORDER_MISSING) if (!seen(id) && pass(id)) out.push(id);
  } else if (f.show === 'found') {
    for (const id of one) if (nameOk(species[id]) && f.rarity < 0 && f.region < 0 && f.pat < 0) out.push(id);
    for (const id of src) if (seen(id) && pass(id) && nameOk(species[id])) out.push(id);
  } else if (!words) {
    for (const id of src) if (!seen(id) && pass(id)) out.push(id);
  }
  return out;
}

function chips(dex) {
  const t = dexTally(dex);
  const el = $('dexRegions');
  const all = `<button data-r="-1" class="${dexState.region < 0 ? 'on' : ''}" title="Every region">All <b>${fmt(t.n)}</b>/${fmt(speciesCount)}</button>`;
  el.innerHTML = all + REGIONS.map((r) => `<button data-r="${r.id}" class="${dexState.region === r.id ? 'on' : ''}" title="${r.name}: ${regionRange(r)} from the bay. Species whose home is here (a few also turn up one region further out).">${r.name} <b>${fmt(t.byRegion[r.id])}</b>/${fmt(regionTotals[r.id])}</button>`).join('');
}

function cardHtml(id, dex) {
  const sp = species[id];
  const n = dex[id] || 0;
  const rg = REGIONS[sp.lo];
  return `<div class="dx${n ? '' : ' unk'}" title="${n ? sp.name : RARITY[sp.rarity].name + ' from ' + rg.name + ' (' + regionRange(rg) + ' from the bay)'}"><img data-id="${id}" data-a="${sp.arch}" data-f="${n ? 1 : 0}" alt=""><div class="n r${sp.rarity}">${n ? sp.name : '???'}</div><div class="c">${n ? '×' + fmt(n) : RARITY[sp.rarity].name}</div><div class="g">${n ? RARITY[sp.rarity].name : rg.name}</div></div>`;
}

// draw the cards that are in view
function draw(force = false) {
  const st = dexState, grid = $('dexGrid');
  if (!grid || !ui || ui.openModal !== 'dex') return;
  const rows = Math.ceil(st.list.length / st.cols);
  const top = Math.max(0, grid.scrollTop - PAD_Y);
  const r0 = Math.max(0, Math.floor(top / ROW_H) - BUFFER_ROWS);
  const r1 = Math.min(rows, Math.ceil((top + grid.clientHeight) / ROW_H) + BUFFER_ROWS);
  const first = r0 * st.cols, last = Math.min(st.list.length, r1 * st.cols);
  if (!force && first === st.first && last === st.last) return;
  st.first = first; st.last = last;
  const dex = dexOf();
  // two spacer rows stand in for the rows that are not drawn (the grid's own padding cannot: a padding is a floor under the height of a flex item)
  const sp = (h) => `<div class="dxsp" style="grid-column:1/-1;height:${h}px"></div>`;
  let html = r0 > 0 ? sp(r0 * ROW_H - GAP) : '';
  for (let q = first; q < last; q++) html += cardHtml(st.list[q], dex);
  if (rows > r1) html += sp((rows - r1) * ROW_H - GAP);
  grid.style.gridTemplateColumns = `repeat(${st.cols}, minmax(0, 1fr))`;
  grid.innerHTML = html;
  paintIcons(grid);
}

// the pictures, a few milliseconds per frame (a found species is drawn by the second WebGL context, a missing one is the plain shape of its kind)
function paintIcons(grid) {
  const imgs = [...grid.querySelectorAll('img')];
  const gen = ++dexState.work;
  let i = 0;
  const work = () => {
    if (gen !== dexState.work) return;
    const t0 = performance.now();
    while (i < imgs.length && performance.now() - t0 < 8) { const im = imgs[i++]; im.src = im.dataset.f === '1' ? speciesIcon(+im.dataset.id) : silhouetteIcon(+im.dataset.a); }
    if (i < imgs.length && ui && ui.openModal === 'dex') requestAnimationFrame(work);
  };
  work();
}

function refilter(toTop) {
  const st = dexState, grid = $('dexGrid');
  const dex = dexOf();
  const w = Math.max(MIN_W, grid.clientWidth - PAD_X * 2);
  st.cols = Math.max(1, Math.floor((w + GAP) / (MIN_W + GAP)));
  st.list = filterList(dex, st);
  if (toTop) grid.scrollTop = 0;
  chips(dex);
  for (const b of $('dexShow').children) b.classList.toggle('on', b.dataset.show === st.show);
  $('dexShown').textContent = st.q && st.show !== 'found' ? `${fmt(st.list.length)} found species match (a search only finds what you have discovered)` : `${fmt(st.list.length)} shown`;
  draw(true);
}

export function render(theUi) {
  ui = theUi;
  const g = ui.game;
  ensureBar();
  wire();
  const dex = g.S.dex || {};
  $('dexCount').textContent = dexTally(dex, true).n;
  $('dexTotal').textContent = speciesCount;
  refilter(true);
}
