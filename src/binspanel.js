// The bins panel: pick the bin a bot, cart, machine or belt end sells at, see every bin with its distance and what it sold today, and name the Depot Beacons.
//   ;            aim at a machine, a belt end, a bot or your cart (or with a bot selected) and press ; : the panel opens for it. Press ; again in the panel to step to the next bin.
//   Shift+;      copies the bin of what you aim at (or of the selected bot); E on another machine, bot or belt end pastes it (Shift+E copies everything, bin included, for the same kind).
//   nothing aimed: the panel is an overview of every bin, where you can rename the beacons.
// Every change goes through g.setCfg (machines and belt ends) or BINS.assign (bots and carts), so a guest asks the host and the host checks it.
import * as BINS from './bins.js';
import * as EXT from './ext.js';
import { escHtml, fmt } from './util.js';

let el = null, timer = 0, focus = null, editing = 0;   // focus: { k:'bot'|'cart'|'ent', id?, key? } the thing the panel is for, or null for the overview

// a host sees its own change at once; a guest's change comes back from the host a moment later
const later = (g, fn) => { if (g.isGuest && g.isGuest()) setTimeout(fn, 700); else fn(); };

function ensure(g) {
  if (el && document.body.contains(el)) return el;
  el = document.createElement('div'); el.id = 'binpanel'; el.className = 'modal hidden';
  el.innerHTML = '<div class="panel narrow" style="width:min(640px,95vw);max-height:92vh;overflow:auto"><header><h2 id="binTitle">BINS</h2><button class="x" data-binclose>✕</button></header><div class="menu" id="binBody" style="padding:12px 16px 16px"></div></div>';
  document.body.appendChild(el);
  el.querySelector('[data-binclose]').addEventListener('click', () => g.ui.closeModals());
  el.addEventListener('mousedown', (e) => { if (e.target === el) g.ui.closeModals(); });
  el.addEventListener('click', (ev) => onClick(g, ev));
  return el;
}

// ---------------------------------------------------------------------------------------------------------------- what the panel is for
export const subjectFor = (g, ref) => (ref ? BINS.subjectOf(g, ref.k === 'cart' ? { k: 'cart', key: ref.key } : ref) : null);
const refOf = (s) => (s.k === 'bot' ? { k: 'bot', id: s.o.id } : s.k === 'cart' ? { k: 'cart', key: s.key } : { k: 'ent', id: s.o.id });

// the thing the crosshair is on that can be given a bin: a machine or belt end, a bot, your cart; else the selected bot
export function aimSubject(g) {
  const e = EXT.aimedEnt(g);
  if (e && BINS.assignable(e)) return { k: 'ent', o: e };
  const a = g.crewAim ? g.crewAim() : null;
  if (a && a.kind === 'bot') return { k: 'bot', o: a.bot };
  if (a && a.kind === 'cart') { const c = g.myCart && g.myCart(); if (c) return { k: 'cart', o: c, key: g.myCartKey() }; }
  const sel = g.crewSelected && g.crewSelected();
  return sel ? { k: 'bot', o: sel } : null;
}
// a belt that is not the end of a line has nothing to sell: say where to aim
export function subjectWhy(g, s) {
  if (s && s.k === 'ent' && s.o.type === 'belt' && !s.o.splitter && g.logi.nextOf(s.o)) return 'This belt carries on: aim at the last piece of the line, the one that touches a bin.';
  return '';
}

// every choice for a subject (Auto first), each with what the panel shows
export function options(g, s) {
  const pos = s ? BINS.subjectPos(s) : { x: g.player.pos.x, z: g.player.pos.z }, cur = s ? s.o.dest | 0 : null;
  const out = [{ id: BINS.AUTO, name: 'Auto', kind: 'auto', note: s ? BINS.autoText(s) : '', current: cur === 0 }];
  for (const b of BINS.listBins(g)) {
    const t = BINS.today(g, b.id), a = BINS.assignedTo(g, b.id);
    out.push({ id: b.id, name: b.name, kind: b.kind, dist: BINS.dist(b, pos.x, pos.z), powered: BINS.usable(b), today: t, total: BINS.totals(g, b.id), assigned: a, current: cur === b.id, ent: b.ent });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- choosing
export function choose(g, s, dest) {
  const r = BINS.assign(g, s, dest);
  if (!r.ok) { g.sound.error(); g.ui.hint(r.why || 'Could not change that', 3); return r; }
  g.sound.place();
  if (!g.isGuest()) g.ui.hint(`${BINS.subjectLabel(s)}: ${dest ? BINS.destText(g, s) : 'Auto'}.`, 3);
  return r;
}
// ; in the panel: the next bin in the list (Auto, SORT bin, Depot A ...)
export function cycle(g) {
  const s = focus ? subjectFor(g, focus) : null;
  if (!s || subjectWhy(g, s)) { g.sound.error(); return false; }
  const ops = options(g, s), at = Math.max(0, ops.findIndex((o) => o.current)), next = ops[(at + 1) % ops.length];
  choose(g, s, next.id); later(g, () => render(g)); return true;
}

// ---------------------------------------------------------------------------------------------------------------- the keys
export function destKey(g, shift) {
  const s = aimSubject(g);
  if (shift) return copyDest(g, s);
  openFor(g, s); return true;
}
export function copyDest(g, s) {
  if (!s) { if (g.cfgClip && g.cfgClip.group === 'bindest') { g.cfgClip = null; g.ui.hint('Copied bin dropped.', 2); return true; } g.ui.hint('Aim at a machine, a belt end, a bot or your cart and press Shift+; to copy its bin.', 3); return false; }
  g.cfgClip = { type: s.k === 'ent' ? s.o.type : s.k, group: 'bindest', vals: { dest: s.o.dest | 0 } };
  g.sound.tone('triangle', 700, 900, 0.08, 0.06);
  g.ui.hint(`Bin copied from <b>${escHtml(BINS.subjectLabel(s))}</b>: ${escHtml(BINS.destText(g, s))}. Aim at another machine, belt end or bot and press <kbd>E</kbd> to paste it, <kbd>Shift</kbd>+<kbd>;</kbd> at nothing drops it.`, 5);
  return true;
}
// E on a bot while a copied bin is held: it gets that bin (the machines take theirs through ext.useKey)
export function pasteToBot(g, bot) {
  const c = g.cfgClip; if (!c || c.group !== 'bindest') return false;
  const r = BINS.assign(g, { k: 'bot', o: bot }, c.vals.dest | 0);
  if (r.ok) { g.sound.place(); g.ui.hint(`${bot.name}: ${(c.vals.dest | 0) ? 'bin pasted' : 'back to Auto'}.`, 2.5); } else { g.sound.error(); g.ui.hint(r.why || 'Could not paste', 2.5); }
  return true;
}

// E on your own cart while a copied bin is held: it gets that bin (a cart is no machine: ext.useKey never sees it)
export function pasteToCart(g) {
  const c = g.cfgClip; if (!c || c.group !== 'bindest') return false;
  const a = g.crewAim ? g.crewAim() : null; if (!a || a.kind !== 'cart') return false;
  const cart = g.myCart && g.myCart(); if (!cart) return false;
  const r = BINS.assign(g, { k: 'cart', o: cart, key: g.myCartKey() }, c.vals.dest | 0);
  if (r.ok) { g.sound.place(); g.ui.hint(`Your cart: ${(c.vals.dest | 0) ? 'bin pasted' : 'back to Auto'}.`, 2.5); } else { g.sound.error(); g.ui.hint(r.why || 'Could not paste', 2.5); }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------- the panel
export function openFor(g, s) {
  focus = s ? refOf(s) : null; editing = 0;
  ensure(g); render(g);
  g.openModal('binpanel');
  clearInterval(timer);
  timer = setInterval(() => { if (g.ui.openModal === 'binpanel') { if (!el.contains(document.activeElement) || !/INPUT|SELECT/.test(document.activeElement.tagName)) render(g); } else clearInterval(timer); }, 1000);
}
export function openOverview(g, rename = 0) { openFor(g, null); editing = rename | 0; render(g); }

function render(g) {
  const body = el && el.querySelector('#binBody'); if (!body) return;
  const s = focus ? subjectFor(g, focus) : null;
  if (focus && !s) { focus = null; }
  const why = s ? subjectWhy(g, s) : '';
  el.querySelector('#binTitle').textContent = s ? `BINS: ${BINS.subjectLabel(s).toUpperCase()}` : 'BINS';
  const ops = options(g, s);
  let h = '';
  if (s) {
    h += `<div class="jcard" style="margin-bottom:8px"><p style="margin:0 0 4px">Sells at: <b>${escHtml(BINS.destText(g, s))}</b></p><p style="margin:0;opacity:.75;font-size:12px">${why ? escHtml(why) : 'Pick where it sells. Every bin pays the same: a far one is only slower. A bin that is gone or has no power sends it back to Auto, and it says so. <kbd>;</kbd> steps to the next bin, <kbd>Shift</kbd>+<kbd>;</kbd> outside copies this choice.'}</p></div>`;
  } else {
    h += '<div class="jcard" style="margin-bottom:8px"><p style="margin:0 0 4px"><b>Every bin</b>, with what it sold today.</p><p style="margin:0;opacity:.75;font-size:12px">Aim at a machine, a belt end, a bot or your cart and press <kbd>;</kbd> to give it a bin. Rename a Depot Beacon here: its name shows when you aim at it, in the travel menu and in the crew panel.</p></div>';
  }
  for (const o of ops) {
    if (o.kind === 'auto') {
      if (!s) continue;
      h += `<div class="trow" style="margin-bottom:6px"><div style="flex:1"><b style="display:block">Auto</b><span>${escHtml(o.note)}</span></div>${why ? '' : `<button data-use="0" ${o.current ? 'disabled' : ''}>${o.current ? 'In use' : 'Use Auto'}</button>`}</div>`;
      continue;
    }
    const sold = `sold today ${fmt(o.today.n)} plush for ◈${fmt(o.today.v)}`, asg = `${o.assigned.bots} bot${o.assigned.bots === 1 ? '' : 's'}, ${o.assigned.machines} machine${o.assigned.machines === 1 ? '' : 's'} assigned`;
    h += `<div class="trow" style="margin-bottom:6px;flex-wrap:wrap" data-bin="${o.id}"><div style="flex:1;min-width:180px"><b style="display:block">${escHtml(o.name)}${o.current ? ' <small style="color:var(--accent2)">(selected)</small>' : ''}</b><span>${Math.round(o.dist)} m away · ${o.powered ? (o.kind === 'hall' ? 'always open' : 'powered') : 'NO POWER (Auto until it has)'} · ${sold} · ${asg}</span></div>`;
    if (s && !why) h += `<button data-use="${o.id}" ${o.current ? 'disabled' : ''}>${o.current ? 'In use' : `Use ${escHtml(o.name)}`}</button>`;
    if (o.kind === 'beacon') h += `<button data-rename="${o.id}" title="Give this Depot Beacon a name">Rename</button>`;
    h += '</div>';
    if (o.kind === 'beacon' && editing === o.id) h += `<div class="trow" style="margin:-2px 0 8px 12px"><input data-nameinput="${o.id}" maxlength="20" value="${escHtml(o.ent.name || '')}" placeholder="${escHtml(BINS.defaultName(Number.isInteger(o.ent.num) ? o.ent.num : 0))}" style="flex:1;background:rgba(255,255,255,.08);color:inherit;border:1px solid var(--line);border-radius:8px;padding:6px 8px;font:inherit"><button data-savename="${o.id}">Save name</button><button data-clearname="${o.id}" title="Back to the number name">Reset</button></div>`;
  }
  body.innerHTML = h;
  const inp = body.querySelector('[data-nameinput]'); if (inp && !body.contains(document.activeElement)) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
}

function onClick(g, ev) {
  const t = ev.target.closest && ev.target.closest('button'); if (!t) return;
  const s = focus ? subjectFor(g, focus) : null;
  if (t.dataset.use !== undefined) { if (s) { choose(g, s, +t.dataset.use); later(g, () => render(g)); } return; }
  if (t.dataset.rename !== undefined) { editing = +t.dataset.rename; render(g); return; }
  const rename = (id, name) => {
    const it = g.machines.items.get(id); if (!it) return;
    const r = g.setCfg(it.ent, { name });
    if (r && !r.ok) { g.sound.error(); g.ui.hint(r.why || 'Refused', 3); } else { g.sound.place(); g.ui.hint(name ? `Renamed to ${escHtml(name)}.` : 'Back to its number name.', 2.5); }
    editing = 0; later(g, () => render(g));
  };
  if (t.dataset.savename !== undefined) { const id = +t.dataset.savename, inp = el.querySelector(`[data-nameinput="${id}"]`); rename(id, inp ? inp.value : ''); return; }
  if (t.dataset.clearname !== undefined) rename(+t.dataset.clearname, '');
}
export const state = () => ({ focus, editing });
