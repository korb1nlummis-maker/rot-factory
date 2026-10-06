import { CATS, UPGRADES, GEAR, isUnlocked, needsText } from './upgrades.js';
import { STATUS } from './crew.js';
import { ACHIEVEMENTS } from './achievements.js';
import { RARITY, species, speciesCount, NEEDLE, DECOYS } from './plushdata.js';
import { speciesIcon, needleFrames } from './icons.js';
import { fmt } from './util.js';
import { describeBoosts } from './remains.js';
import { MATERIALS } from './crafting.js';

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
    for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => this.closeModals());
    for (const m of document.querySelectorAll('.modal')) m.addEventListener('mousedown', (e) => { if (e.target === m) this.closeModals(); });
  }

  bind(game) { this.game = game; }

  // ---------------- money ----------------
  setMoney(v, instant = false) {
    this.moneyTarget = v;
    if (instant) { this.moneyShown = v; $('moneyVal').textContent = fmt(v); }
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
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) $('hint').style.opacity = 0;
    }
  }

  // ---------------- HUD bits ----------------
  show(id) { $(id).classList.remove('hidden'); }
  hide(id) { $(id).classList.add('hidden'); }
  hint(html, secs = 4) { const h = $('hint'); h.innerHTML = html; h.style.opacity = 1; this.hintTimer = secs; }

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
  setCarry(list, max) {
    $('carryN').textContent = list.length;
    $('carryMax').textContent = max;
    const box = $('carryChips');
    const show = Math.min(max, 40);
    let html = '';
    for (let i = 0; i < show; i++) {
      const it = list[i];
      if (it) html += `<i class="chip" style="background:${RARITY[species[it.sp].rarity].color}"></i>`;
      else html += '<i class="chip empty"></i>';
    }
    if (max > 40) html += `<small style="color:#aaa;margin-left:4px">+${max - 40}</small>`;
    box.innerHTML = html;
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
        el.onclick = () => { this.invSel = it.id; this.renderInventory(); };
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
      el.ondrop = (e) => { e.preventDefault(); const dragged = e.dataTransfer.getData('text/plain'); if (dragged) { g.assignHotbar(dragged, i); this.invSel = dragged; this.renderInventory(); } };
      bar.appendChild(el);
    }
    // detail
    const it = list.find((x) => x.id === this.invSel);
    $('invInfo').innerHTML = it
      ? `<h3>${it.icon} ${it.name}${it.count != null ? ` <small>×${it.count}</small>` : ''}</h3><p>${it.desc || ''}</p>${it.status ? `<p style="color:var(--accent2);font-size:12px">${it.status}</p>` : ''}${it.use ? `<p style="color:var(--dim);font-size:12px"><b>How to use:</b> ${it.use}</p>` : ''}<p style="font-size:12px;color:var(--ink)">${it.tool ? (it.slot >= 0 ? `On hotbar slot <b>${it.slot + 1}</b>. Press another number to move it, <b>X</b> to take it off the bar.` : 'Press a number <b>1-9</b> (or click a hotbar slot, or drag it there) to put it on your hotbar.') : 'Not a hotbar item.'}</p>`
      : '<p style="color:var(--dim)">Click an item to see what it does. Put tools and building items on the hotbar below, then use the number keys in the world.</p>';
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
  setAssay(on, v) { $('assay').classList.toggle('hidden', !on); if (on) $('assayBar').style.transform = `scaleX(${Math.max(0.03, v).toFixed(3)})`; }
  setPower(on, frac, txt) { const e = $('power'); e.classList.toggle('hidden', !on); if (on) { $('pwFill').style.width = (frac * 100).toFixed(0) + '%'; $('pwTxt').textContent = txt; } }
  setAir(on, dust, lung, txt) { const e = $('air'); e.classList.toggle('hidden', !on); if (on) { $('airFill').style.width = Math.min(100, dust * 100).toFixed(0) + '%'; $('lungFill').style.width = Math.min(100, lung * 100).toFixed(0) + '%'; $('airTxt').textContent = txt; } }
  blackout(on) { $('blackout').style.opacity = on ? 1 : 0; }
  setCartLine(n, cap, mode) { const e = $('cartLine'); e.classList.toggle('hidden', n < 0); if (n >= 0) { $('cartN').textContent = n; $('cartMax').textContent = cap; $('cartMode').textContent = mode === 'follow' ? 'following' : 'parked'; } }
  setClock(min, open, helmet) {
    const e = $('clock');
    e.classList.toggle('hidden', !helmet);
    if (!helmet) return;
    const cv = $('clockCv'), g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H - 18, R = W / 2 - 14;
    // dial: horizon + arc, sun by day, moon by night
    g.lineWidth = 3; g.strokeStyle = 'rgba(243,246,226,0.35)';
    g.beginPath(); g.arc(cx, cy, R, Math.PI, 0); g.stroke();
    g.beginPath(); g.moveTo(cx - R - 6, cy); g.lineTo(cx + R + 6, cy); g.stroke();
    g.fillStyle = 'rgba(243,246,226,0.4)';
    for (let i = 0; i <= 12; i++) { const a = Math.PI + (i / 12) * Math.PI; g.beginPath(); g.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, i % 3 === 0 ? 2.6 : 1.4, 0, 7); g.fill(); }
    // sun travels 06:00 -> 18:00, moon 18:00 -> 06:00
    const day = min >= 360 && min < 1080;
    const t = day ? (min - 360) / 720 : ((min - 1080 + 1440) % 1440) / 720;
    const a = Math.PI + t * Math.PI;
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    if (day) {
      g.fillStyle = '#ffd86a'; g.shadowColor = '#ffb030'; g.shadowBlur = 12;
      g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); g.shadowBlur = 0;
      g.strokeStyle = '#ffd86a'; g.lineWidth = 2;
      for (let i = 0; i < 8; i++) { const r = (i / 8) * Math.PI * 2; g.beginPath(); g.moveTo(x + Math.cos(r) * 11, y + Math.sin(r) * 11); g.lineTo(x + Math.cos(r) * 15, y + Math.sin(r) * 15); g.stroke(); }
    } else {
      g.fillStyle = '#dfe8ff'; g.shadowColor = '#8fb4ff'; g.shadowBlur = 10;
      g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); g.shadowBlur = 0;
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(x + 4, y - 2, 7, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
    }
    const h = Math.floor(min / 60), m = Math.floor(min % 60);
    $('clockTxt').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const st = $('clockState'); st.textContent = open ? 'OPEN' : 'CLOSED'; st.style.color = open ? '#7ef0c4' : '#ff8a7a';
  }
  setDepth(txt) { $('depth').textContent = txt; }
  setTrap(on, secs, frac, pulse, dying) {
    const e = $('trap');
    e.classList.toggle('hidden', !on);
    if (!on) return;
    $('trapNum').textContent = dying ? '!' : Math.ceil(secs);
    $('trapLabel').textContent = dying ? 'SUFFOCATING' : 'AIR';
    e.style.setProperty('--p', pulse.toFixed(2));
    e.style.setProperty('--f', (1 - frac).toFixed(2));
  }
  setVitals(hp, air, showAir, dying, lung) {
    $('hpFill').style.width = (hp * 100).toFixed(0) + '%';
    $('hpBar').classList.toggle('low', hp < 0.35);
    $('hpBar').classList.toggle('full', hp > 0.995);
    const a = $('airBar');
    a.classList.toggle('hidden', !(showAir || air < 0.999));
    $('airFill2').style.width = (air * 100).toFixed(0) + '%';
    a.classList.toggle('dying', !!dying || air < 0.25);
    $('lungBar').style.width = Math.min(100, lung * 100).toFixed(0) + '%';
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
  setSignal(on, level, arrowDeg, distTxt, showArrow) {
    const s = $('signal');
    s.classList.toggle('hidden', !on);
    if (!on) return;
    $('sigFill').style.width = (level * 100).toFixed(0) + '%';
    $('sigArrow').style.visibility = showArrow ? 'visible' : 'hidden';
    $('sigArrow').style.transform = `rotate(${arrowDeg}deg)`;
    $('sigDist').textContent = distTxt;
  }

  // ---------------- modals ----------------
  isModalOpen() { return !!this.openModal; }
  closeModals() {
    for (const m of document.querySelectorAll('.modal')) m.classList.add('hidden');
    const was = this.openModal;
    this.openModal = null;
    if (was && this.game) this.game.onModalClosed(was);
  }
  open(id) {
    this.closeModalsSilently();
    $(id).classList.remove('hidden');
    this.openModal = id;
    if (id === 'shop') this.renderShop();
    if (id === 'dex') this.renderDex();
    if (id === 'ach') this.renderAch();
    if (id === 'pause') this.renderStats();
    if (id === 'dossier') { this.startDossier(); $('clueList').innerHTML = (this.game.S.clues || []).map((c) => `<div>📎 ${c}</div>`).join('') || '<div>No clues yet. Depot Beacons far from the bay turn up old paperwork.</div>'; }
    if (id === 'travel') this.game.renderTravel();
    if (id === 'journal') this.renderJournal();
    if (id === 'craft') this.renderCraft();
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
      const unlocked = isUnlocked(u, g.S.up, g.S);
      const nt = needsText(u, g.S);
      const cost = maxed ? 0 : u.cost[lvl];
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
        <button ${can ? '' : 'disabled'}>${maxed ? 'MAXED' : nt ? nt : !unlocked ? `Needs ${reqU.name} ${u.req.lvl > 1 ? 'lvl ' + u.req.lvl : ''}` : `Buy  ◈ ${fmt(cost)}`}</button>`;
      el.querySelector('button').onclick = () => { if (g.buy(u.id)) this.renderShop(); };
      grid.appendChild(el);
    }
  }

  renderCraft() {
    const g = this.game;
    $('craftMoney').textContent = fmt(g.S.money);
    const grid = $('craftGrid');
    grid.innerHTML = '';
    for (const r of g.gearList()) {
      const el = document.createElement('div');
      el.className = 'card';
      el.style.borderColor = 'rgba(215,242,106,0.45)';
      el.innerHTML = `<h3><span>🧰 ${r.name}</span><small>GEAR</small></h3><p>${r.line}: ${r.desc}</p><p style="color:var(--accent2)">Unlocked tier ${r.bought}. Crafted tier ${r.have}. Craft it and it is equipped.</p><button ${g.S.money >= r.price ? '' : 'disabled'}>Craft · ◈${fmt(r.price)}</button>`;
      el.querySelector('button').onclick = () => { if (g.craftGearItem(r.id)) this.renderCraft(); };
      grid.appendChild(el);
    }
    const list = g.recipeList();
    if (!list.length && !grid.children.length) { grid.innerHTML = '<div class="jcard">Nothing to craft yet. Unlock Timber Frames, Work Lanterns, belts and more in the terminal.</div>'; return; }
    for (const r of list) {
      const isMat = r.kind === 'mat';
      const have = isMat ? ((g.S.mats || {})[r.mk] || 0) : (g.S.items[r.id] || 0);
      const stock = r.mat ? (g.S.mats || {})[r.mat] || 0 : 0;
      const price = (n) => (r.mat ? Math.round(Math.max(0, r.matN * n - stock) * (r.price / r.matN)) : r.price * n);
      const matLine = r.mat ? `<p style="color:var(--accent2);font-size:11.5px">Uses ${r.matN} ${MATERIALS[r.mat].name} each (you have ${stock}). Shortfall is bought at the full price.</p>` : '';
      const el = document.createElement('div');
      el.className = 'card';
      if (isMat) el.style.borderColor = 'rgba(154,107,58,0.6)';
      const isCart = r.kind === 'cart';
      const owned = isCart && /already have|In use|in your pack/.test(r.status);
      const btns = isCart
        ? `<button data-n="1" ${owned || g.S.money < r.price ? 'disabled' : ''} style="flex:1">${owned ? 'Owned' : /Upgrade/.test(r.status) ? 'Upgrade' : 'Craft'} · ◈${fmt(r.price)}</button>`
        : r.batch.map((n) => `<button data-n="${n}" ${g.S.money >= price(n) ? '' : 'disabled'} style="flex:1">x${n} · ◈${fmt(price(n))}</button>`).join('');
      const statusLine = r.status ? `<p style="color:var(--accent2);font-size:11.5px">${r.status}</p>` : '';
      const useLine = r.use ? `<p style="color:var(--dim);font-size:11.5px"><b>How to use:</b> ${r.use}</p>` : '';
      el.innerHTML = `<h3><span>${r.icon} ${r.name}</span><small>${have ? (isCart ? '' : 'have ' + have) : ''}</small></h3><p>${r.desc}</p>${matLine}${statusLine}${useLine}<div style="display:flex;gap:6px">${btns}</div>`;
      for (const b of el.querySelectorAll('button')) b.onclick = () => { if (g.craftItem(r.id, +b.dataset.n)) this.renderCraft(); };
      grid.appendChild(el);
    }
  }

  renderContracts(grid) {
    const g = this.game;
    g.contracts.fill();
    grid.innerHTML = '';
    g.S.contracts.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'card';
      const pct = Math.min(100, (c.have / c.need) * 100);
      el.innerHTML = `<h3><span>${c.desc}</span><small>${c.have}/${c.need}</small></h3><div class="bar" style="height:7px"><i style="width:${pct}%;background:linear-gradient(90deg,#7ef0c4,#d7f26a)"></i></div><p>Reward: <b style="color:var(--accent)">◈ ${fmt(c.reward)}</b>${c.boost ? ' + a permanent boost' : ''}</p><button>Swap (◈ ${fmt(Math.round(c.reward * 0.08))})</button>`;
      el.querySelector('button').onclick = () => { if (g.contracts.reroll(i)) this.renderShop(); else g.sound.error(); };
      grid.appendChild(el);
    });
  }

  renderDex() {
    const g = this.game;
    const grid = $('dexGrid');
    $('dexCount').textContent = Object.keys(g.S.dex).filter((k) => +k < 900).length;
    $('dexTotal').textContent = speciesCount;
    grid.innerHTML = '';
    const frag = document.createDocumentFragment();
    const ids = [];
    for (let s = 1; s <= speciesCount; s++) ids.push(s);
    for (const d of DECOYS) ids.push(d);
    if (g.S.dex[NEEDLE]) ids.unshift(NEEDLE);
    // sort by rarity then id
    ids.sort((a, b) => species[b].rarity - species[a].rarity || a - b);
    for (const id of ids) {
      const sp = species[id];
      const n = g.S.dex[id] || 0;
      const el = document.createElement('div');
      el.className = 'dx' + (n ? '' : ' unk');
      el.innerHTML = `<img ${n ? '' : 'loading="lazy"'} data-id="${id}" alt=""><div class="n r${sp.rarity}">${n ? sp.name : '???'}</div><div class="c">${n ? '×' + fmt(n) : RARITY[sp.rarity].name}</div>`;
      frag.appendChild(el);
    }
    grid.appendChild(frag);
    // render icons progressively to keep the UI responsive
    const imgs = [...grid.querySelectorAll('img')];
    let i = 0;
    const work = () => {
      const t0 = performance.now();
      while (i < imgs.length && performance.now() - t0 < 10) { imgs[i].src = speciesIcon(+imgs[i].dataset.id); i++; }
      if (i < imgs.length && this.openModal === 'dex') requestAnimationFrame(work);
    };
    work();
  }

  renderCrew() {
    const g = this.game, box = $('crewList');
    const bots = g.S.crew || [];
    $('crewCount').textContent = `${bots.length} / ${g.T.crewMax}`;
    box.innerHTML = '';
    if (!bots.length) { box.innerHTML = '<div class="jcard">No crew yet. Buy a Scrapper Bot in the Crew tab of the terminal.</div>'; return; }
    for (const b of bots) {
      const need = g.crew.xpNeeded(b);
      const el = document.createElement('div');
      el.className = 'crew-row';
      el.innerHTML = `<div class="crew-head"><b>${b.name}</b><span>Lv ${b.level}</span><em>${STATUS[b.state] || b.state}</em></div>
        <div class="bar" style="height:5px"><i style="width:${Math.min(100, (b.xp / need) * 100)}%;background:linear-gradient(90deg,#7ef0c4,#d7f26a)"></i></div>
        <div class="crew-stats">Load ${b.carry.length}/${g.crew.capacity(b)} · Battery ${Math.round(b.battery * 100)}% · ${Math.round(Math.hypot(b.x, b.z))} m out</div>
        <div class="crew-btns">
          <button data-d="3">▲ N</button><button data-d="0">▶ E</button><button data-d="1">▼ S</button><button data-d="2">◀ W</button>
          <button data-a="follow">Follow me</button><button data-a="home">Home</button><button data-a="stay">Stay</button></div>`;
      for (const btn of el.querySelectorAll('button')) btn.onclick = () => { g.crewCommand(b, btn.dataset); this.renderCrew(); };
      box.appendChild(el);
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
    $('noteTitle').textContent = 'FOUND: ' + e.name.toUpperCase();
    $('noteWho').textContent = `${e.role.toUpperCase()}  ·  ${Math.round(e.dist)} m FROM BAY 07`;
    $('noteBody').textContent = e.text;
    $('noteReward').textContent = '+ ' + e.reward;
  }

  renderJournal() {
    const g = this.game;
    $('journalBoosts').textContent = describeBoosts(g.S.boosts) || 'No boosts yet';
    const items = [...g.S.notes].reverse().map((n) => `<div class="jcard"><b>${n.name}</b>${n.role} · ${Math.round(n.dist)} m<br>${n.text}<em>+ ${n.reward}</em></div>`);
    const clues = (g.S.clues || []).map((c) => `<div class="jcard"><b>Facility paperwork</b>${c}</div>`);
    $('journalList').innerHTML = [...clues, ...items].join('') || '<div class="jcard">Nothing yet. Old workings are scattered through the pile. A Remains Locator helps.</div>';
  }

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
      ['Species found', Object.keys(S.dex).filter((k) => +k < 900).length + ' / ' + speciesCount],
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
