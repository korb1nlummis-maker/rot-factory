import { escHtml } from './util.js';
import * as KB from './keybinds.js';
import { CONTROLS } from './controls.js';
import { CATS, UPGRADES, GEAR, isUnlocked, needsText } from './upgrades.js';
import { STATUS } from './crew.js';
import { ACHIEVEMENTS } from './achievements.js';
import { RARITY, species, speciesCount, NEEDLE, DECOYS, dexTally } from './plushdata.js';
import { speciesIcon, needleFrames } from './icons.js';
import * as DEXUI from './dexui.js';
import { fmt } from './util.js';
import { describeBoosts } from './remains.js';
import * as BENCH from './bench.js';   // the Crafting Table browser: tabs, search, cards, detail pane
import { Dials, rateText } from './dials.js';
import * as BINS from './bins.js';   // the bin a bot unloads at, shown and picked on each crew row
import * as BINPANEL from './binspanel.js';
import * as CARE from './carepackage.js';   // the Care Package log on the achievements screen, the upgrade discount
import * as PI from './playerinv.js';   // per-player bags: the gift click
import * as NB from './notebook.js';   // the Notes tab of the journal, the crew panel's finds
import { KINDS, clueLine as NOTES_LINE } from './notes.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.game = null;
    this.shopCat = 'hands';
    this.moneyShown = 0;
    this.moneyTarget = 0;
    this.deltaAcc = 0;
    this.deltaTimer = 0;
    this.hintTimer = 0;
    this.openModal = null;
    this.hotbarKey = '';
    this.ringLen = 113;
    this.dials = new Dials($('dialsL'), $('dialsR'), (id, dir) => { if (!this.game) return; if (id === 'scoop') this.game.adjustScoop(dir); else if (id === 'vacuum') this.game.adjustVac(dir); });   // the SCOOP and VACUUM dials' minus and plus buttons
    this.watchBelt();
    for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => this.closeModals());
    for (const b of document.querySelectorAll('[data-ptab]')) b.addEventListener('click', () => this.pauseTab(b.dataset.ptab));
    for (const b of document.querySelectorAll('[data-jtab]')) b.addEventListener('click', () => this.journalTab(b.dataset.jtab));
    this.renderControls();
    for (const m of document.querySelectorAll('.modal')) m.addEventListener('mousedown', (e) => { if (e.target === m) this.closeModals(); });
  }

  bind(game) {
    this.game = game;
    // a click on a dial (the cursor is free, so its tooltip can show) must still take the mouse back for the game
    $('belt').addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.dial') && game.mode === 'play' && !this.isModalOpen() && document.pointerLockElement !== game.canvas) game.requestLock(); });
  }
  // --center-h is how tall the hotbar column is: on wide screens the hint sits right above it, between the two dial groups. --belt-h is the whole belt, so the centre-screen warnings can sit above it
  watchBelt() {
    const belt = $('belt'), mid = $('bottom'); if (!belt || !mid) return;
    const upd = () => { const r = document.documentElement.style; r.setProperty('--center-h', mid.offsetHeight + 'px'); r.setProperty('--belt-h', belt.offsetHeight + 14 + 'px'); };
    this.syncBelt = upd; upd(); if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(upd); ro.observe(mid); ro.observe(belt); }
    window.addEventListener('resize', upd);
  }

  // ---------------- money ----------------
  setMoney(v, instant = false) {
    this.moneyTarget = v;
    if (instant) { this.moneyShown = v; $('moneyVal').textContent = fmt(v); }
    this.syncMoney(v);
  }
  // belts and bots keep selling behind an open terminal, bench or depot list: the balance and every priced button (data-cost) follow the money without rebuilding the window
  syncMoney(v) {
    const m = this.openModal; const box = m === 'shop' ? 'shopMoney' : m === 'craft' ? 'craftMoney' : m === 'travel' ? 'travelMoney' : null; if (!box) return;
    $(box).textContent = fmt(v);
    if (m === 'craft') { BENCH.paintMoney(v); return; }   // the bench also dims the cards you cannot pay yet and leaves a button that is off for another reason off
    for (const b of $(m).querySelectorAll('button[data-cost]')) b.disabled = v < +b.dataset.cost;
  }
  gain(amount) {
    this.deltaAcc += amount;
    this.deltaTimer = 1.4;
    const d = $('moneyDelta');
    d.textContent = (this.deltaAcc >= 0 ? '+' : '') + fmt(this.deltaAcc);
    d.classList.add('show');
  }
  tick(dt) {
    if (this.moneyShown !== this.moneyTarget) {
      const diff = this.moneyTarget - this.moneyShown;
      this.moneyShown += Math.abs(diff) < 1 ? diff : diff * Math.min(1, dt * 9);
      if (Math.abs(this.moneyTarget - this.moneyShown) < 0.5) this.moneyShown = this.moneyTarget;
      $('moneyVal').textContent = fmt(this.moneyShown);
    }
    if (this.deltaTimer > 0) {
      this.deltaTimer -= dt;
      if (this.deltaTimer <= 0) { $('moneyDelta').classList.remove('show'); this.deltaAcc = 0; }
    }
    this._beltT = (this._beltT || 0) - dt; if (this._beltT <= 0) { this._beltT = 1; if (this.syncBelt) this.syncBelt(); }   // a page that is not being drawn gets no resize callbacks
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) $('hint').style.opacity = 0;
    }
  }

  // ---------------- HUD bits ----------------
  show(id) { $(id).classList.remove('hidden'); }
  hide(id) { $(id).classList.add('hidden'); }
  hint(html, secs = 4) { const h = $('hint'); h.innerHTML = KB.fill(html);   // {id} in a hint is the current key of that action
    h.style.opacity = 1; this.hintTimer = secs; }

  toast({ icon, img, title, text, cls = '', ms = 3800 }) {
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.innerHTML = `<div class="ico">${img ? `<img src="${img}">` : icon || '★'}</div><div><b>${title}</b><span>${text || ''}</span></div>`;
    const box = $('toasts');
    box.prepend(el);
    while (box.children.length > 5) box.lastChild.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 600);
  }

  setGrab(p, active) {
    const ring = $('ring');
    ring.classList.toggle('on', active && p > 0.001);
    $('ringFg').style.strokeDashoffset = this.ringLen * (1 - Math.min(1, p));
  }
  setCross(active) { $('cross').classList.toggle('active', !!active); }
  setTarget(info) {
    const t = $('target');
    if (!info) { t.classList.add('hidden'); return; }
    t.classList.remove('hidden');
    t.querySelector('.tn').textContent = info.name;
    const tr = t.querySelector('.tr');
    tr.textContent = info.rarity + (info.shiny ? '  ✦ SHINY' : '') + (info.volatile ? '  ⚠ VOLATILE' : '');
    tr.className = 'tr r' + info.rid;
    t.querySelector('.tv').textContent = info.value;
  }
  // the carry dial: one ring segment per slot (many slots share a segment), coloured by the rarest plush in it; the middle says how many
  setCarry(list, max) {
    const n = Math.min(max, 40), per = max / n, segs = [];
    for (let s = 0; s < n; s++) {
      let best = -1, col = '';
      for (let i = Math.floor(s * per); i < Math.min(list.length, Math.ceil((s + 1) * per)); i++) { const r = species[list[i].sp].rarity; if (r > best) { best = r; col = RARITY[r].color; } }
      segs.push(col);
    }
    const full = list.length >= max;
    this.dials.set('carry', { on: true, frac: list.length / Math.max(1, max), val: list.length, unit: '/ ' + max, segs, state: full ? 'warn' : 'ok', dim: list.length === 0, sub: full ? 'FULL' : '', text: `${list.length} of ${max} plush${full ? ', full' : ''}` });
  }
  setHotbar(items, sel) {
    const key = items.map((i) => (i ? i.id + (i.count ?? '') + (i.have === 0 ? 'x' : '') : '-')).join('|') + '#' + sel;
    if (key === this.hotbarKey) return;
    this.hotbarKey = key;
    const hh = $('hotbarHint'); if (hh) hh.innerHTML = sel < 0 ? '<kbd>Q</kbd> or a number: take a tool out · <kbd>I</kbd> inventory' : '<kbd>Q</kbd> put away · same number again also puts it away · <kbd>I</kbd> inventory';
    // nine slots, always shown: an empty slot is a faint number
    $('hotbar').innerHTML = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
      const it = items[i];
      if (!it) return `<div class="slot empty ${i === sel ? 'sel' : ''}"><span class="k">${i + 1}</span></div>`;
      return `<div class="slot ${i === sel ? 'sel' : ''} ${it.have === 0 ? 'spent' : ''}"><span class="k">${i + 1}</span>${it.icon}<span class="l">${it.label}</span>${it.count != null ? `<span class="c">${it.count}</span>` : ''}</div>`;
    }).join('');
  }

  // ---------------- inventory ----------------
  renderInventory() {
    const g = this.game, S = g.S;
    const list = g.inventoryList();
    if (this.invSel && !list.some((x) => x.id === this.invSel)) this.invSel = null;
    const grid = $('invGrid');
    const COLS = 9, ROWS = Math.max(4, Math.ceil(list.length / COLS));
    grid.innerHTML = '';
    for (let n = 0; n < COLS * ROWS; n++) {
      const it = list[n]; const el = document.createElement('div');
      el.className = 'islot' + (it ? '' : ' empty') + (it && it.id === this.invSel ? ' sel' : '') + (it && it.kind === 'mat' ? ' mat' : '');
      if (it) {
        el.innerHTML = `${it.icon}${it.count != null ? `<span class="c">${typeof it.count === 'number' ? it.count : it.count}</span>` : ''}${it.slot >= 0 ? `<span class="b">${it.slot + 1}</span>` : ''}`;
        el.title = it.name;
        el.onclick = (e) => { if (e && e.shiftKey && it.tool && it.id !== 'hammer' && g.net && g.net.open) { PI.giveKey(g, it.id, 1); this.renderInventory(); return; } this.invSel = it.id; this.renderInventory(); };   // Shift+click hands one to your friend (within 3 m, playerinv.js)
        if (it.tool) { el.draggable = true; el.ondragstart = (e) => { this.invSel = it.id; e.dataTransfer.setData('text/plain', it.id); }; }
      }
      grid.appendChild(el);
    }
    // the hotbar row
    const bar = $('invBar'); bar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const id = S.hotbar[i]; const t = g.tools[i]; const el = document.createElement('div');
      el.className = 'islot bar' + (id ? '' : ' empty') + (id && id === this.invSel ? ' sel' : '');
      el.innerHTML = `<span class="k">${i + 1}</span>${t ? t.icon : ''}${t && t.count != null ? `<span class="c">${t.count}</span>` : ''}`;
      el.title = t ? t.label : 'Empty slot ' + (i + 1);
      el.onclick = () => { if (this.invSel && !(id && id === this.invSel)) g.assignHotbar(this.invSel, i); else if (id) this.invSel = id; this.renderInventory(); };
      el.ondragover = (e) => e.preventDefault();
      el.ondrop = (e) => {
        e.preventDefault(); const dragged = e.dataTransfer.getData('text/plain'), from = e.dataTransfer.getData('application/x-slot');
        if (!dragged) return;
        if (from !== '' && from !== undefined && +from !== i) { const f = +from, other = S.hotbar[i]; g.clearHotbarSlot(f); g.assignHotbar(dragged, i); if (other) g.assignHotbar(other, f); }   // slot to slot swaps
        else if (from === '' || from === undefined) g.assignHotbar(dragged, i);
        this.invSel = dragged; this.renderInventory();
      };
      // taking an item off the belt: drag it out, double click it, right click it, or use the Put back button
      if (id) {
        el.draggable = true; el.ondragstart = (e) => { this.invSel = id; e.dataTransfer.setData('text/plain', id); e.dataTransfer.setData('application/x-slot', String(i)); };
        el.ondblclick = () => { g.clearHotbarSlot(i); this.renderInventory(); };
        el.oncontextmenu = (e) => { e.preventDefault(); g.clearHotbarSlot(i); this.renderInventory(); };
      }
      bar.appendChild(el);
    }
    // dropping a belt item anywhere on the pack puts it back
    grid.ondragover = (e) => e.preventDefault();
    grid.ondrop = (e) => { e.preventDefault(); const from = e.dataTransfer.getData('application/x-slot'); if (from !== '' && from !== undefined) { g.clearHotbarSlot(+from); this.renderInventory(); } };
    // detail
    const it = list.find((x) => x.id === this.invSel);
    $('invInfo').innerHTML = it
      ? `<h3>${it.icon} ${it.name}${it.count != null ? ` <small>×${it.count}</small>` : ''}</h3><p>${it.desc || ''}</p>${it.status ? `<p style="color:var(--accent2);font-size:12px">${it.status}</p>` : ''}${it.use ? `<p style="color:var(--dim);font-size:12px"><b>How to use:</b> ${it.use}</p>` : ''}<p style="font-size:12px;color:var(--ink)">${it.tool ? (it.slot >= 0 ? `On hotbar slot <b>${it.slot + 1}</b>. Press another number to move it, <b>X</b> to take it off the bar.` : 'Press a number <b>1-9</b> (or click a hotbar slot, or drag it there) to put it on your hotbar.') : 'Not a hotbar item.'}</p>`
      : '<p style="color:var(--dim)">Click an item to see what it does. Put tools and building items on the hotbar below, then use the number keys in the world.' + (g.net && g.net.open ? ' This pack is yours alone: Shift+click an item to hand one to your friend (within 3 m).' : '') + '</p>';
    if (it && it.slot >= 0) { const btn = document.createElement('button'); btn.id = 'invPutBack'; btn.className = 'btn'; btn.textContent = 'Put back in pack'; btn.onclick = () => { g.clearHotbarSlot(it.slot); this.renderInventory(); }; $('invInfo').appendChild(btn); }
  }
  invAssign(slot) { const g = this.game; if (slot < 0 || slot > 8) return; const it = g.inventoryList().find((x) => x.id === this.invSel); if (!it || !it.tool) { this.hint('Pick a tool or building item first.', 1.5); return; } g.assignHotbar(it.id, slot); this.renderInventory(); }
  invClear() { const g = this.game; const slot = g.S.hotbar.indexOf(this.invSel); if (slot >= 0) { g.clearHotbarSlot(slot); this.renderInventory(); } }
  invMove(code) {
    const list = this.game.inventoryList(); if (!list.length) return; let i = list.findIndex((x) => x.id === this.invSel); if (i < 0) i = 0;
    const d = code === 'ArrowRight' ? 1 : code === 'ArrowLeft' ? -1 : code === 'ArrowDown' ? 9 : -9;
    i = Math.max(0, Math.min(list.length - 1, i + d)); this.invSel = list[i].id; this.renderInventory();
  }
  setStreak(n, frac) {
    const s = $('streak');
    if (n < 2) { s.classList.add('hidden'); return; }
    s.classList.remove('hidden');
    $('streakVal').textContent = 'x' + n;
    $('streakBar').style.transform = `scaleX(${Math.max(0, frac)})`;
  }
  setWarn(text) {
    const w = $('warn');
    if (!text) { w.classList.add('hidden'); return; }
    w.textContent = text; w.classList.remove('hidden');
  }
  setDanger(v) { $('vig').style.boxShadow = `inset 0 0 220px 40px rgba(255,60,30,${(v * 0.45).toFixed(3)})`; }
  hurt(v) { const h = $('hurt'); h.style.opacity = v; setTimeout(() => (h.style.opacity = 0), 60); }
  // the vein dial: the ring is how rich the plush around you is, the arrow (assay level 2) points at the nearest vein
  setAssay(on, v, ptr) {
    const pct = Math.round(Math.min(1, Math.max(0, v)) * 100);
    this.dials.set('vein', { on, frac: Math.max(0.03, v), rot: ptr ? ptr.rel : null, val: ptr ? ptr.text : pct + '%', state: v > 0.7 ? 'hot' : 'ok', dim: v < 0.05 && !ptr,
      text: ptr ? `vein assay ${pct} percent, nearest vein ${ptr.text}` : `vein assay ${pct} percent` });
  }
  // the grid dial: the ring is demand over supply of the grid you stand nearest to. n = { demand, supply, tripped, sat } when the caller has the numbers
  setPower(on, frac, txt, n) {
    if (!on) { this.dials.set('grid', { on: false }); return; }
    if (n && !(Number.isFinite(n.demand) && Number.isFinite(n.supply))) n = null;   // a row with missing or wrong numbers: read the text, never throw
    const m = /([\d.]+) \/ ([\d.]+) kW/.exec(txt || ''), w = /([\d.]+) kW wanted/.exec(txt || '');
    const demand = n ? n.demand : m ? +m[1] : w ? +w[1] : null, supply = n ? n.supply : m ? +m[2] : null;
    const tripped = n ? !!n.tripped : /TRIPPED/.test(txt || ''), nofuel = /NO FUEL/.test(txt || '') || (!!n && !tripped && n.supply <= 0), brown = n ? n.sat < 0.99 && !tripped && !nofuel : /BROWNOUT/.test(txt || '');
    const state = tripped || nofuel ? 'crit' : brown || frac > 0.9 ? 'warn' : 'ok';
    this.dials.set('grid', { on: true, frac, val: demand === null ? '' : demand.toFixed(demand < 10 ? 1 : 0), unit: 'kW', state,
      sub: tripped ? 'TRIPPED' : nofuel ? 'NO FUEL' : brown ? 'BROWNOUT' : supply !== null ? `of ${supply.toFixed(supply < 10 ? 1 : 0)} kW` : '', text: txt, dim: false });
  }
  // the dust dial (air monitor): outer ring = dust in the air, inner ring = dust in your lungs; the line under says what to do about it
  setAir(on, dust, lung, txt) {
    const state = lung > 0.6 ? 'crit' : dust > 0.3 || lung > 0.3 || /STALE|FAN/.test(txt || '') && dust > 0.15 ? 'warn' : 'ok';
    this.dials.set('dust', { on, frac: Math.min(1, dust), frac2: Math.min(1, lung), val: Math.round(Math.min(1, dust) * 100) + '%', unit: 'dust', sub: txt, state, text: `${txt}: dust in the air ${Math.round(Math.min(1, dust) * 100)} percent, in your lungs ${Math.round(Math.min(1, lung) * 100)} percent` });
  }
  // OXYGEN: how good the air you are breathing is (100% is clean, fan-fed or open air). SUFFOCATION: how far your lungs have gone toward passing out.
  setOxy(q, on, sub) {
    if (!on) { this.dials.set('oxy', { on: false }); return; }
    const c = Math.max(0, Math.min(1, Number.isFinite(q) ? q : 1)), state = c < 0.4 ? 'crit' : c < 0.7 ? 'warn' : 'ok';
    this.dials.set('oxy', { on: true, frac: c, val: Math.round(c * 100) + '%', unit: 'O2', state, sub: sub || '', text: `oxygen ${Math.round(c * 100)} percent${sub ? ', ' + sub : ''}` });
  }
  setSuffocation(lung, on, sub) {
    if (!on) { this.dials.set('suffoc', { on: false }); return; }
    const c = Math.max(0, Math.min(1, Number.isFinite(lung) ? lung : 0)), state = c > 0.6 ? 'crit' : c > 0.3 ? 'warn' : 'ok';
    this.dials.set('suffoc', { on: true, frac: c, val: Math.round(c * 100) + '%', unit: 'lungs', state, sub: sub || '', text: `suffocation ${Math.round(c * 100)} percent${sub ? ', ' + sub : ''}` });
  }
  // the scoop dial: how many plush a grab scoops right now, out of the most Scoop Hands allow. - and = change it, 3 at a time.
  setScoop(n, max) {
    if (!(max > 0)) { this.dials.set('scoop', { on: false }); return; }
    this.dials.set('scoop', { on: true, frac: Math.min(1, n / max), val: String(n), unit: '/ ' + max, sub: '', state: n >= max && max > 12 ? 'warn' : 'ok', dim: n === 0, canDn: n > 0, canUp: n < max, text: `scoop ${n} of ${max} plush per grab; the minus and plus buttons (or the - and = keys) change it by three` });
  }
  // the vacuum dial: the suction in use (plush a second) out of the most the owned vacuum draws, and what share of it that is. [ and ] with bare hands (or the buttons) change it in tens of percent. 0 is off.
  setVacuum(rate, max, pct) {
    if (!(max > 0)) { this.dials.set('vacuum', { on: false }); return; }
    const r = Number.isFinite(rate) ? Math.max(0, Math.min(max, rate)) : 0, pc = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
    this.dials.set('vacuum', { on: true, frac: Math.min(1, r / max), val: rateText(r), unit: '/ ' + rateText(max), sub: '', state: pc >= 100 && max > 18 ? 'warn' : 'ok', dim: pc === 0, canDn: pc > 0, canUp: pc < 100, text: pc === 0 ? `vacuum off, 0 of ${rateText(max)} plush per second; a click grabs like plain hands` : `vacuum ${rateText(r)} of ${rateText(max)} plush per second, ${pc} percent of its suction; the minus and plus buttons (or [ and ] with bare hands) change it by ten percent` });
  }
  blackout(on) { $('blackout').style.opacity = on ? 1 : 0; }
  setCartLine(n, cap, mode) {
    const full = n >= 0 && cap > 0 && n >= cap;
    this.dials.set('cart', { on: n >= 0, frac: cap > 0 ? n / cap : 0, val: n, unit: '/ ' + cap, sub: mode === 'follow' ? 'following' : 'parked', state: full ? 'warn' : 'ok', dim: n === 0, text: `${n} of ${cap} plush in the cart, ${mode === 'follow' ? 'following you' : 'parked'}` });
  }
  // the clock dial: the ring is the 24 hours (midnight at the top, the lit arc is day, 06:00 to 18:00) and the sun or moon rides it
  setClock(min, open, helmet) {
    const t = Number.isFinite(min) ? ((min % 1440) + 1440) % 1440 : 0, h = Math.floor(t / 60), m = Math.floor(t % 60);
    this._clock = { min: t, open: !!open, hhmm: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, helmet: !!helmet };
    this.paintClock();
  }
  // setClock and setDay both land here, so the reading is the same whichever came last (and an unchanged reading writes nothing)
  paintClock() {
    const c = this._clock, day = c.min >= 360 && c.min < 1080;
    this.dials.set('clock', { on: c.helmet, frac: 0.5, val: c.hhmm, sub: c.open ? 'OPEN' : 'CLOSED', state: c.open ? 'ok' : 'closed', mk: c.min / 1440, mkc: day ? '#ffd86a' : '#b9d0ff', label: this._dayLabel || 'DAY', text: `${this._dayLabel || 'day'} ${c.hhmm}, ${c.open ? 'open' : 'closed'}` });
  }
  // the big morning card: DAY n, with a line under it
  dayCard(n, sub) {
    const c = $('dayCard'); $('dcDay').textContent = 'Day ' + n; $('dcSub').textContent = sub || '';
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
  }
  setDay(n) { this._dayLabel = 'DAY ' + n; if (this._clock) this.paintClock(); }
  // the depth and from-bay dials. txt is the whole old readout ("BURIED 12.3 m  ·  1.23 km FROM BAY  ·  EXIT 3.67 km"), n has the numbers: { depth, alt, out, left }
  setDepth(txt, n) {
    this._depthTxt = txt || '';
    if (!n) { this.dials.set('depth', { on: false }); this.dials.set('range', { on: false }); return; }
    const km = (v) => (v >= 1000 ? { val: (v / 1000).toFixed(2), unit: 'km' } : { val: String(Math.round(v)), unit: 'm' });
    const buried = n.depth > 0.3, high = !buried && n.alt > 6;
    this.dials.set('depth', { on: buried || high, label: high ? 'ALTITUDE' : 'BURIED', frac: Math.min(1, (high ? n.alt : n.depth) / 43), val: (high ? n.alt : n.depth).toFixed(buried && n.depth < 10 ? 1 : 0), unit: 'm',
      state: 'ok', sub: n.pile || '', info: { text: txt || '' }, text: `${high ? 'altitude' : 'buried'} ${(high ? n.alt : n.depth).toFixed(1)} metres` });
    const d = km(n.out), x = km(n.left);
    this.dials.set('range', { on: n.out > 30, frac: Math.min(1, n.out / (n.out + n.left)), val: d.val, unit: d.unit, sub: n.out > 300 ? `EXIT ${x.val} ${x.unit}` : '', state: 'ok', info: { text: txt || '' }, text: `${d.val} ${d.unit} from the bay${n.out > 300 ? `, exit ${x.val} ${x.unit}` : ''}` });
  }
  // the tunnel depth dial: how far from the bay you are while under a roof (0 in the open), against the best frame you own (its rating is the full ring)
  setTunnel(d, rating, name) {
    if (!(d > 0)) { this.dials.set('tunnel', { on: false }); return; }
    const km = d >= 1000 ? { val: (d / 1000).toFixed(2), unit: 'km' } : { val: String(Math.round(d)), unit: 'm' };
    const known = rating > 0 && isFinite(rating), frac = known ? Math.min(1, d / rating) : Math.min(1, d / 5000);
    const state = !known ? 'ok' : d > rating ? 'crit' : d > rating * 0.85 ? 'warn' : 'ok';
    this.dials.set('tunnel', { on: true, frac, val: km.val, unit: km.unit, state, sub: known ? `${name} to ${rating} m` : name || 'any depth', info: { text: `Tunnel depth ${Math.round(d)} m` + (known ? ` of the ${rating} m your best frame is rated for` : '') },
      text: `tunnel depth ${Math.round(d)} metres` + (known ? `, best frame rated to ${rating} metres` : '') });
  }
  setTrap(on, secs, frac, pulse, dying) {
    const e = $('trap');
    e.classList.toggle('hidden', !on);
    if (!on) return;
    $('trapNum').textContent = dying ? '!' : Math.ceil(secs);
    $('trapLabel').textContent = dying ? 'SUFFOCATING' : 'AIR';
    e.style.setProperty('--p', pulse.toFixed(2));
    e.style.setProperty('--f', (1 - frac).toFixed(2));
  }
  // health and breath. hpAbs/hpMax and airSecs are optional numbers for the middle of the dials
  setVitals(hp, air, showAir, dying, lung, hpAbs, hpMax, airSecs) {
    void lung;
    const fin = (x, d) => (Number.isFinite(x) ? x : d), h = Math.min(1, Math.max(0, fin(hp, 0))), a = Math.min(1, Math.max(0, fin(air, 1)));
    const cap = Number.isFinite(hpMax) && hpMax > 0 ? Math.round(hpMax) : undefined;   // the number in the middle never passes the maximum or goes below 0
    const hv = Math.min(cap === undefined ? 100 : cap, Math.max(0, Number.isFinite(hpAbs) ? Math.ceil(hpAbs - 1e-6) : Math.round(h * 100)));
    this.dials.set('hp', { on: true, frac: h, val: hv, unit: cap !== undefined ? '/ ' + cap : '%', state: h < 0.35 ? 'crit' : h < 0.6 ? 'warn' : 'ok', dim: h > 0.995,
      text: `${hv} of ${cap !== undefined ? cap : 100} health` });
    const secs = Number.isFinite(airSecs) ? Math.max(0, Math.ceil(airSecs)) : null;
    const low = !!dying || a < 0.25;
    this.dials.set('breath', { on: !!(showAir || a < 0.999), frac: a, val: secs !== null ? secs : Math.round(a * 100) + '%', unit: secs !== null ? 'sec' : '', state: low ? 'crit' : a < 0.5 ? 'warn' : 'ok', sub: dying ? 'SUFFOCATING' : '',
      text: `${Math.round(a * 100)} percent air${secs !== null ? `, ${secs} seconds left` : ''}${dying ? ', suffocating' : ''}` });
  }
  // dust warning: stage 0 none, 1 dusty, 2 wheezing, 3 about to pass out
  setLungWarn(stage, label, eta, vig, red) {
    const w = $('lungWarn'), v = $('lungVig'); w.classList.toggle('hidden', stage === 0); w.classList.remove('s1', 's2', 's3'); if (stage) w.classList.add('s' + stage);
    $('lungStage').textContent = label; $('lungEta').textContent = eta; v.style.opacity = vig.toFixed(3); v.classList.toggle('red', !!red);
  }
  // the structural survey: FRAME (how deep you are against the best frame you own, and the weight above), SUPPORT (load on the nearest support) and STALE AIR (what the depth does to the air)
  setSurvey(on, d) {
    if (!on) { for (const id of ['frame', 'support', 'stale']) this.dials.set(id, { on: false }); return; }
    const n = d.n || {};
    const bf = n.best;
    const flag = bf && bf.flag === 'weak' ? 'TOO WEAK' : bf && bf.flag === 'near' ? 'NEAR LIMIT' : '';
    const frameLine = bf ? `${bf.name} ${isFinite(bf.max) ? bf.max + ' m' : 'any depth'}${flag ? ' ' + flag : ''}` : 'no frames yet';
    this.dials.set('frame', { on: true, frac: bf && isFinite(bf.max) ? Math.min(1, n.depth / bf.max) : 0, val: Math.round(n.depth), unit: 'm deep', state: flag === 'TOO WEAK' ? 'crit' : flag ? 'warn' : 'ok',
      sub: `${frameLine}\n${n.pile || ''}`.trim(), info: { depth: d.depth, best: d.best, press: d.press }, text: `${d.depth}. ${d.best}` });
    const r = n.loadR;
    this.dials.set('support', { on: true, frac: r === null || r === undefined ? 0 : Math.min(1, r), val: r === null || r === undefined ? '--' : Math.round(r * 100) + '%', unit: r === null || r === undefined ? '' : 'load', state: d.cls === 'red' ? 'crit' : d.cls === 'amber' ? 'warn' : 'ok', dim: r === null || r === undefined,
      sub: r === null || r === undefined ? 'none within 8 m' : 'nearest support', info: { load: d.load }, text: d.load });
    const st = n.stale || 0;
    this.dials.set('stale', { on: true, frac: st, val: Math.round(st * 100) + '%', unit: 'stale', state: st > 0.8 ? 'crit' : st > 0.25 ? 'warn' : 'ok', dim: st <= 0.01, sub: n.fan === null || n.fan === undefined ? 'fresh' : `fan every ${n.fan} m`, info: { air: d.air }, text: d.air });
  }
  // a small readout for whatever machine you are aiming at
  setTileInfo(on, title = '', lines = [], good = false) {
    const e = $('tileInfo'); e.classList.toggle('hidden', !on); if (!on) return;
    e.classList.toggle('lit', !!good); $('tiTitle').textContent = title; $('tiLines').innerHTML = lines.map((l) => `<div>${escHtml(l)}</div>`).join('');
  }
  // the panel for the bot you have picked: what it is, what it is doing, and what the next E will do for what you aim at
  setBotInfo(on, d) {
    const e = $('botInfo'); if (!e) return;
    e.classList.toggle('hidden', !on); if (!on) return;
    $('biTitle').textContent = d.title; $('biLines').innerHTML = d.lines.map((l) => `<div>${escHtml(l)}</div>`).join('');
    const a = $('biAct'); a.textContent = d.act; a.classList.toggle('bad', !d.ok);
  }
  // the pause menu has two tabs: the game menu and the full list of controls
  pauseTab(name) {
    for (const b of document.querySelectorAll('[data-ptab]')) b.classList.toggle('on', b.dataset.ptab === name);
    $('pauseGame').classList.toggle('hidden', name !== 'game'); $('pauseControls').classList.toggle('hidden', name !== 'controls');
  }
  renderControls() {
    const html = CONTROLS.map((g) => `<div class="ctlgroup">${escHtml(g.group)}</div>` + g.rows.map((r) => `<div class="ctlrow"><div class="ck">${r.keys.map((k) => (k === '...' ? '<span>to</span>' : `<kbd>${escHtml(k)}</kbd>`)).join(' ')}</div><div class="cw">${escHtml(r.what)}</div></div>`).join('')).join('');
    const a = document.getElementById('ctlBody'), b = document.getElementById('howKeys'); if (a) a.innerHTML = html; if (b) b.innerHTML = html;
  }
  setBuried(on) { $('buried').classList.toggle('hidden', !on); }
  setCompass(on, heading, markers, readout) {
    const c = $('compass');
    c.classList.toggle('hidden', !on);
    if (!on) return;
    const cv = $('compassCv'), g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const span = 150; // degrees visible
    const px = (a) => W / 2 + (((a - heading + 540) % 360) - 180) / span * W;
    g.font = '700 17px ui-monospace, Menlo, monospace'; g.textAlign = 'center';
    for (let a = 0; a < 360; a += 5) {
      const x = px(a);
      if (x < -10 || x > W + 10) continue;
      const big = a % 45 === 0, mid = a % 15 === 0;
      g.strokeStyle = big ? '#f3f6e2' : 'rgba(243,246,226,0.55)'; g.lineWidth = big ? 2.2 : 1.2;
      g.beginPath(); g.moveTo(x, H - 6); g.lineTo(x, H - (big ? 26 : mid ? 18 : 12)); g.stroke();
      if (big) {
        const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
        g.fillStyle = a === 0 ? '#ff7a6a' : '#f3f6e2';
        g.fillText(names[a], x, H - 31);
      } else if (mid) { g.fillStyle = 'rgba(243,246,226,0.5)'; g.font = '600 11px ui-monospace, Menlo, monospace'; g.fillText(String(a), x, H - 22); g.font = '700 17px ui-monospace, Menlo, monospace'; }
    }
    for (const m of markers) {
      let rel = ((m.b - heading + 540) % 360) - 180;
      const clampd = Math.max(-span / 2 + 3, Math.min(span / 2 - 3, rel));
      const x = W / 2 + clampd / span * W;
      g.fillStyle = m.color; g.beginPath(); g.moveTo(x, 4); g.lineTo(x - 7, 15); g.lineTo(x + 7, 15); g.closePath(); g.fill();
      g.font = '800 11px ui-monospace, Menlo, monospace'; g.fillText(m.label, x, 28);
      g.font = '700 17px ui-monospace, Menlo, monospace';
    }
    g.fillStyle = '#d7f26a'; g.beginPath(); g.moveTo(W / 2, H - 2); g.lineTo(W / 2 - 6, H + 6); g.lineTo(W / 2 + 6, H + 6); g.closePath(); g.fill();
    $('compassTxt').textContent = readout;
  }
  // the signal dial: how close The One is, with the arrow (scanner 3 and up) and the distance (4 and up) in the middle
  setSignal(on, level, arrowDeg, distTxt, showArrow) {
    const none = distTxt === 'no signal';
    this.dials.set('signal', { on, frac: level, rot: showArrow ? arrowDeg : null, val: distTxt, state: level > 0.8 ? 'hot' : 'ok', dim: none,
      text: none ? 'no signal' : `signal ${Math.round(level * 100)} percent${distTxt ? ', ' + distTxt : ''}` });
  }

  // ---------------- modals ----------------
  isModalOpen() { return !!this.openModal; }
  justClosed() { return performance.now() - (this._closedAt || -1e9) < 80; }
  closeModals() {
    this._closedAt = performance.now();
    for (const m of document.querySelectorAll('.modal')) m.classList.add('hidden');
    const was = this.openModal;
    this.openModal = null;
    if (was && this.game) this.game.onModalClosed(was);
  }
  open(id) {
    this.closeModalsSilently(); if (this.game && this.game.clearKeys) this.game.clearKeys();
    $(id).classList.remove('hidden');
    this.openModal = id;
    if (id === 'shop') this.renderShop();
    if (id === 'dex') this.renderDex();
    if (id === 'ach') this.renderAch();
    if (id === 'pause') { this.renderStats(); this.pauseTab('game'); }
    if (id === 'dossier') { this.startDossier(); $('clueList').innerHTML = (this.game.S.clues || []).map((c) => `<div>📎 ${c}</div>`).join('') || '<div>No clues yet. Depot Beacons far from the bay turn up old paperwork.</div>'; }
    if (id === 'travel') this.game.renderTravel();
    if (id === 'journal') this.renderJournal();
    if (id === 'craft') { BENCH.installKeys(this); this.renderCraft({ open: true, fresh: true }); }
    if (id === 'inv') { this.invSel = this.invSel || null; this.renderInventory(); }
    if (id === 'crew') { this.renderCrew(); clearInterval(this._crewT); this._crewT = setInterval(() => { if (this.openModal === 'crew') this.renderCrew(); else clearInterval(this._crewT); }, 1000); }
  }
  closeModalsSilently() { for (const m of document.querySelectorAll('.modal')) m.classList.add('hidden'); this.openModal = null; }

  renderShop() {
    const g = this.game;
    $('shopMoney').textContent = fmt(g.S.money);
    const tabs = $('shopTabs');
    tabs.innerHTML = CATS.filter((c) => !c.special || g.T.contractSlots > 0).map((c) => `<button data-cat="${c.id}" class="${c.id === this.shopCat ? 'sel' : ''}">${c.icon} ${c.name}</button>`).join('');
    for (const b of tabs.querySelectorAll('button')) b.onclick = () => { this.shopCat = b.dataset.cat; this.renderShop(); };
    const grid = $('shopGrid');
    if (this.shopCat === 'contracts') { this.renderContracts(grid); return; }
    const list = UPGRADES.filter((u) => u.cat === this.shopCat);
    grid.innerHTML = '';
    for (const u of list) {
      const lvl = g.S.up[u.id] || 0;
      const maxed = lvl >= u.max;
      const unlocked = isUnlocked(u, g.S.up, g.shopStats());
      const nt = needsText(u, g.shopStats());
      const cost = maxed ? 0 : CARE.priceOf(g, u.cost[lvl]);
      const can = unlocked && !maxed && g.S.money >= cost;
      const el = document.createElement('div');
      el.className = 'card' + (maxed ? ' maxed' : '') + (!unlocked ? ' locked' : '');
      let pips = '';
      for (let i = 0; i < u.max; i++) pips += `<i class="${i < lvl ? 'on' : ''}"></i>`;
      let extra = '';
      if (u.names) extra = ` <small>${u.names[lvl]}${!maxed ? ' → ' + u.names[lvl + 1] : ''}</small>`;
      const reqU = u.req ? UPGRADES.find((x) => x.id === u.req.id) : null;
      const gearNote = '';
      el.innerHTML = `<h3><span>${u.name}</span><small>${lvl}/${u.max}</small></h3>${extra ? `<div style="font-size:12px;color:var(--accent2)">${extra}</div>` : ''}<p>${u.desc}</p>${gearNote}<div class="pips">${pips}</div>
        <button ${can ? '' : 'disabled'} ${unlocked && !maxed ? `data-cost="${cost}"` : ''}>${maxed ? 'MAXED' : (reqU && (g.S.up[reqU.id] || 0) < u.req.lvl) ? `Needs ${reqU.name} ${u.req.lvl > 1 ? 'lvl ' + u.req.lvl : ''}` : nt ? nt : !unlocked ? 'Locked' : `Buy  ◈ ${fmt(cost)}`}</button>`;
      el.querySelector('button').onclick = () => { if (g.buy(u.id)) this.renderShop(); };
      grid.appendChild(el);
    }
  }

  renderCraft(opts) { BENCH.render(this, opts); }   // bench.js draws the whole Crafting Table window

  renderContracts(grid) {
    const g = this.game;
    g.contracts.fill();
    grid.innerHTML = '';
    g.S.contracts.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'card';
      const pct = Math.min(100, (c.have / c.need) * 100);
      el.innerHTML = `<h3><span>${c.desc}</span><small>${c.have}/${c.need}</small></h3><div class="bar" style="height:7px"><i style="width:${pct}%;background:linear-gradient(90deg,#7ef0c4,#d7f26a)"></i></div><p>Reward: <b style="color:var(--accent)">◈ ${fmt(c.reward)}</b>${c.boost ? ' + a permanent boost' : ''}</p><button data-cost="${Math.round(c.reward * 0.08)}" ${g.S.money >= Math.round(c.reward * 0.08) ? '' : 'disabled'}>Swap (◈ ${fmt(Math.round(c.reward * 0.08))})</button>`;
      el.querySelector('button').onclick = () => { if (g.contracts.reroll(i)) this.renderShop(); else g.sound.error(); };
      grid.appendChild(el);
    });
  }

  renderDex() { DEXUI.render(this); }   // dexui.js: the virtual grid with search and filters

  renderCrew() {
    const g = this.game, box = $('crewList');
    const bots = g.S.crew || [];
    $('crewCount').textContent = `${bots.length} / ${g.T.crewMax} bots`;
    box.innerHTML = '';
    if (!bots.length) { box.innerHTML = '<div class="jcard">No crew yet. Buy a Scrapper Bot in the Crew tab of the terminal.</div>'; return; }
    const freeBunks = g.T.crewMax - bots.length;
    if (freeBunks > 0) box.insertAdjacentHTML('beforeend', `<div class="jcard" style="margin-bottom:8px"><b>${freeBunks} free bunk${freeBunks === 1 ? '' : 's'}.</b> Craft Scrapper Bots for them at the Crafting Table (Robots tab).</div>`);
    const hasChg = [...g.logi.tiles.values()].some((t) => t.type === 'charger'), hasGen = [...g.logi.tiles.values()].some((t) => t.type === 'gen');
    // the crew-wide switch: bots top up generators and Charging Stations before they unload, and scoop fuel for a machine that runs dry while they have nothing to do
    { const on = g.S.crewFuel !== false;
      box.insertAdjacentHTML('beforeend', `<div class="jcard" data-fuelcfg style="margin-bottom:4px;grid-column:1/-1;align-self:start"><b>Keep machines fueled: ${on ? 'ON' : 'OFF'}</b> Bots with a load top up every generator and Charging Station in reach that has room (Common to Epic, the emptiest first) before they unload, and a bot with nothing to do digs fuel for a generator or station that is under 40% full. Fuel is not sold.<div class="crew-btns" style="margin-top:6px"><button data-fuel="all" title="Switch the whole crew's fueling duty on or off. Each bot also has its own switch on its row.">${on ? 'Turn off for the crew' : 'Turn on for the crew'}</button></div></div>`);
      const fb = box.querySelector('[data-fuel=all]'); if (fb) fb.onclick = () => { g.crewFuelToggle(0, !on); const again = () => { if (this.openModal === 'crew') this.renderCrew(); }; if (g.isGuest()) setTimeout(again, 700); else again(); }; }
    // every bin by name, with the bots that unload at each (the Bin button on a row picks one)
    { const fl = NB.crewFinds(g, g.player.pos); if (fl.length) box.insertAdjacentHTML('beforeend', `<div class="jcard" data-finds style="margin-bottom:4px;grid-column:1/-1;align-self:start"><b>Found by the crew</b>${fl.map((t) => escHtml(t)).join('<br>')}<br>The bots stop short of them and leave them untouched. Open one yourself (E)${g.T.scholar > 0 ? ', or let a bot carry the notes home (Bot Scholar)' : ''}.</div>`); }
    box.insertAdjacentHTML('beforeend', `<div class="jcard" data-bins-strip style="margin-bottom:4px;grid-column:1/-1;align-self:start"><b>Bins:</b> ${BINS.listBins(g).map((bn) => { const n = bots.filter((q) => (q.dest | 0) === bn.id || (!(q.dest | 0) && bn.id === BINS.HALL)).length; return `${escHtml(bn.name)} (${n} bot${n === 1 ? '' : 's'}${BINS.usable(bn) ? '' : ', no power'})`; }).join(', ')}</div>`);
    for (const b of bots) {
      const need = g.crew.xpNeeded(b);
      const el = document.createElement('div');
      el.className = 'crew-row'; el.dataset.bot = b.id;
      el.innerHTML = `<div class="crew-head"><b>${escHtml(b.name)}</b><span>Level ${b.level}</span><em>${escHtml(g.crew.headStatus(b))}</em></div>
        <div class="crew-status" data-live="status"></div>
        <div class="crew-bat" title="Battery. Below 25% the bot looks for a Charging Station that has charge and a cable to a live grid."><span>Battery</span><div class="bar crew-batbar"><i data-live="bat"></i></div><b data-live="batpct"></b></div>
        <div class="bar" style="height:5px" title="Experience to the next level"><i style="width:${Math.min(100, (b.xp / need) * 100)}%;background:linear-gradient(90deg,#7ef0c4,#d7f26a)"></i></div>
        <div class="crew-lbl">Orders</div>
        <div class="crew-btns">
          <button data-a="follow" title="The bot walks with you and drops any dig order.">Follow me</button>
          <button data-a="stay" title="The bot stops what it is doing and waits near the bin.">Stay at the bin</button>
          <button data-a="home" title="The bot walks home along its trail and unloads at the bin. If it had a dig order it then goes back out to dig; use Stay at the bin to keep it home.">Go home and unload</button>
          ${hasChg ? '<button data-a="charge" title="Send the bot to the nearest Charging Station that has charge, then it carries on.">Recharge now</button>' : ''}
          ${hasGen ? '<button data-a="fuel" title="The bot digs at the pile face nearest the generator and feeds it Common to Epic plush.">Keep generator fuelled</button>' : ''}
          <button data-fuel="bot" title="This bot tops up generators and Charging Stations before it unloads, and scoops fuel for them when it has nothing to do. The crew switch above must be on too."></button>
        </div>
        <div class="crew-lbl">Unloads at</div>
        <div class="crew-btns">
          <button data-bin="next" title="Step through the bins: Auto (the SORT bin), the SORT bin, then every Depot Beacon. The bot unloads there from its next trip. The ; key does the same for the bot you have selected."></button>
          <button data-bin="panel" title="Open the bins panel: every bin with its distance, what it sold today and what is assigned to it, and a name for each Depot Beacon.">Bins panel</button>
        </div>
        <div class="crew-lbl">Dig from where you aim (or stand if you aim at nothing)</div>
        <div class="crew-btns">
          <button data-d="3" title="Dig north from the spot you aim at, or from where you stand.">Dig north</button><button data-d="0" title="Dig east from the spot you aim at, or from where you stand.">Dig east</button><button data-d="1" title="Dig south from the spot you aim at, or from where you stand.">Dig south</button><button data-d="2" title="Dig west from the spot you aim at, or from where you stand.">Dig west</button>
        </div>`;
      for (const btn of el.querySelectorAll('button')) btn.onclick = () => { g.crewCommand(b, btn.dataset); this.updateCrewLive(); };
      { const fb = el.querySelector('[data-fuel=bot]'), mine = !b.fuelOff; fb.textContent = `Fuel duty: ${mine ? 'on' : 'off'}`; fb.classList.toggle('on', mine); fb.onclick = () => { g.crewFuelToggle(b.id, !mine); const again = () => { if (this.openModal === 'crew') this.renderCrew(); }; if (g.isGuest()) setTimeout(again, 700); else again(); }; }
      const nb = el.querySelector('[data-bin=next]'), sb = { k: 'bot', o: b };
      nb.textContent = `Bin: ${b.dest ? ((BINS.binById(g, b.dest) || {}).name || 'gone') : 'Auto'} ▸`;
      nb.onclick = () => { const ops = BINPANEL.options(g, sb), at = Math.max(0, ops.findIndex((o) => o.current)); BINPANEL.choose(g, sb, ops[(at + 1) % ops.length].id); const again = () => { if (this.openModal === 'crew') this.renderCrew(); }; if (g.isGuest()) setTimeout(again, 700); else again(); };
      el.querySelector('[data-bin=panel]').onclick = () => { this.closeModalsSilently(); BINPANEL.openFor(g, sb); };
      box.appendChild(el);
    }
    this.updateCrewLive();
  }
  // refresh the status sentence and the battery bar of every row without rebuilding the buttons
  updateCrewLive() {
    const g = this.game;
    for (const el of document.querySelectorAll('#crewList .crew-row')) {
      const b = (g.S.crew || []).find((x) => x.id === +el.dataset.bot); if (!b) continue;
      const pct = Math.round(b.battery * 100), low = b.battery < 0.25;
      el.querySelector('[data-live=status]').textContent = g.crew.statusLine(b);
      const i = el.querySelector('[data-live=bat]'); i.style.width = pct + '%'; i.style.background = low ? '#ff6a4a' : b.battery < 0.5 ? '#ffc247' : '#7ef0c4';
      const t = el.querySelector('[data-live=batpct]'); t.textContent = pct + '%' + (low ? ' LOW' : ''); t.classList.toggle('low', low);
    }
  }

  startDossier() {
    const cv = $('dossierCv'), g = cv.getContext('2d');
    const frames = needleFrames();
    const t0 = performance.now();
    const loop = () => {
      if (this.openModal !== 'dossier') return;
      const t = (performance.now() - t0) / 1000;
      g.clearRect(0, 0, 320, 320);
      const gr = g.createRadialGradient(160, 170, 10, 160, 170, 160);
      gr.addColorStop(0, 'rgba(255,210,90,0.35)'); gr.addColorStop(1, 'rgba(255,210,90,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 320, 320);
      g.drawImage(frames[Math.floor((t * 8) % frames.length)], 0, 0, 320, 320);
      requestAnimationFrame(loop);
    };
    loop();
  }

  showNote(e) {
    const only = !e.worker && e.docs && e.docs.length ? e.docs[0] : null;   // a find that is only paper (a supply cache's manifest, a photograph): the paper is the note
    $('noteTitle').textContent = 'FOUND: ' + String(only ? only.title : e.name).toUpperCase();
    $('noteWho').textContent = `${String(e.role || (only ? e.name : '')).toUpperCase()}${e.role || only ? '  ·  ' : ''}${Math.round(e.dist)} m FROM BAY 07`;
    $('noteBody').textContent = only ? only.text : e.text;
    $('noteBody').classList.toggle('hidden', !(only ? only.text : e.text));
    // what else came with it: a kind of paper, the cipher of a coded one, and the clue it holds
    const extras = (d) => (d.cipher ? `<code class="ncipher">${escHtml(d.cipher)}</code><small>Key on the back: shift ${d.key}. You work it out:</small>` : '') + (d.clue ? `<em class="nclue">Clue: ${escHtml(NOTES_LINE(d.clue))}</em>` : d.kind !== 'worker' ? '<small class="nflav">Flavor only. It tells you nothing about The One.</small>' : '');
    $('noteDocs').innerHTML = only ? extras(only) : (e.docs || []).map((d) => `<div class="ndoc"><b>${KINDS[d.kind].icon} ${escHtml(d.title)}${d.clue ? ' <span class="nbadge">CLUE</span>' : ''}</b>${d.cipher ? `<code class="ncipher">${escHtml(d.cipher)}</code><small>Key on the back: shift ${d.key}. You work it out:</small>` : ''}<p>${escHtml(d.text)}</p>${d.clue ? `<em class="nclue">Clue: ${escHtml(NOTES_LINE(d.clue))}</em>` : '<small class="nflav">Flavor only. It tells you nothing about The One.</small>'}</div>`).join('');
    $('noteReward').textContent = e.reward ? '+ ' + e.reward : '';
    $('noteSum').textContent = e.sum || '';
  }

  // the journal has two tabs: what you found at old workings (and the paperwork), and the Notes tab (every note read, with the pieced-together summary)
  renderJournal() {
    const g = this.game, tab = this.jtab || 'finds';
    for (const b of document.querySelectorAll('[data-jtab]')) b.classList.toggle('on', b.dataset.jtab === tab);
    $('journalList').classList.toggle('hidden', tab !== 'finds'); $('journalNotes').classList.toggle('hidden', tab !== 'notes');
    $('journalBoosts').textContent = describeBoosts(g.S.boosts) || 'No boosts yet';
    if (tab === 'notes') { NB.renderNotes(g, $('journalNotes')); return; }
    const items = [...g.S.notes].reverse().map((n) => `<div class="jcard"><b>${escHtml(n.name)}</b>${escHtml(n.role)} · ${Math.round(n.dist)} m<br>${escHtml(n.text)}<em>+ ${escHtml(n.reward)}</em></div>`);
    const clues = (g.S.clues || []).map((c) => `<div class="jcard"><b>Facility paperwork</b>${escHtml(c)}</div>`);
    $('journalList').innerHTML = [...clues, ...items].join('') || '<div class="jcard">Nothing yet. Old workings are scattered through the pile. A Remains Locator helps.</div>';
  }
  journalTab(name) { this.jtab = name === 'notes' ? 'notes' : 'finds'; this.renderJournal(); }

  renderAch() {
    const g = this.game;
    const grid = $('achGrid');
    const done = Object.keys(g.S.ach).length;
    $('achCount').textContent = done;
    $('achTotal').textContent = ACHIEVEMENTS.length;
    grid.innerHTML = ACHIEVEMENTS.map((a) => {
      const d = !!g.S.ach[a.id];
      return `<div class="ac ${d ? 'done' : ''}"><div class="i">${a.icon}</div><div><b>${a.secret && !d ? '???' : a.name}</b><span>${a.secret && !d ? 'Secret achievement' : a.desc}</span></div></div>`;
    }).join('');
    CARE.renderLog(g, grid);   // the courier drone's deliveries, waiting and upcoming milestones
  }

  statsRows(S) {
    const s = S.stats;
    const hrs = s.playSecs / 3600;
    return [
      ['Time', hrs >= 1 ? hrs.toFixed(1) + ' h' : Math.floor(s.playSecs / 60) + ' min'],
      ['Plush handled', fmt(s.plush)], ['Plush sold', fmt(s.sold)],
      ['Fluff earned', fmt(S.totalEarned)], ['Tunnel dug', (s.cells * 0.1).toFixed(0) + ' m'],
      ['Collapses', s.collapses], ['Times buried', s.buried],
      ['Frames placed', s.props], ['Best streak', 'x' + s.bestStreak],
      ['Species found', dexTally(S.dex, true).n + ' / ' + speciesCount],
      ['Deepest', s.maxDepth.toFixed(1) + ' m'], ['Distance walked', fmt(s.walked) + ' m'],
    ];
  }
  renderStats() {
    $('statsBox').innerHTML = this.statsRows(this.game.S).map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
  }

  showEnding(kind, S) {
    const e = $('ending');
    const win = kind === 'plush';
    $('endEyebrow').textContent = win ? 'YOU WIN. THE SEARCH IS OVER' : 'FRESH AIR';
    $('endTitle').innerHTML = win ? 'IL ROTTO<br><span>SUPREMO</span>' : 'YOU<br><span>ESCAPED</span>';
    $('endText').innerHTML = win
      ? 'Out of millions, you held the one. It squeaks once. The warehouse lights flicker, and every plush in the building seems to exhale.'
      : 'You quit the job. The door grinds open on daylight and the warehouse stays behind you, millions of plush and the one you never found. Staying to tinker is fine, but the One is gone for this shift.';
    $('endStats').innerHTML = this.statsRows(S).map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
    $('btnKeep').textContent = win ? 'Keep Playing' : 'Stay and tinker (the One is gone)';
    e.classList.remove('hidden');
  }
  hideEnding() { $('ending').classList.add('hidden'); }
}
