// The panel for a Smart or Programmable Splitter (rules on each output, order, default output) and a Priority Merger (lane order). E on the piece opens it.
// Every edit goes through g.setCfg, so a guest asks the host and the host validates (splitparts.js check). The panel reads the piece by id on every
// render: on a guest the piece is replaced (ent- then ent+) after each change, so no reference is ever kept.
import { RARITY, species } from './plushdata.js';
import * as SR from './splitrules.js';

let el = null, timer = 0, focus = null;
const draft = [null, null, null];   // per output: the rule being built { k, v, w, q }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const css = {
  chip: 'display:inline-flex;gap:6px;align-items:center;border:1px solid;border-radius:999px;padding:2px 4px 2px 10px;margin:2px 4px 2px 0;background:rgba(255,255,255,.06)',
  sel: 'background:rgba(255,255,255,.08);color:inherit;border:1px solid var(--line);border-radius:8px;padding:5px 7px;font:inherit',
  row: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px',
};
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const rarityOpts = (sel, max) => RARITY.map((r, n) => (max && n === 6 ? '' : `<option value="${n}"${n === sel ? ' selected' : ''}>${esc(r.name)}</option>`)).join('');

function ensure(g) {
  if (el) return el;
  el = document.createElement('div'); el.id = 'splitpanel'; el.className = 'modal hidden';
  el.innerHTML = '<div class="panel narrow" style="width:min(640px,95vw);max-height:92vh;overflow:auto"><header><h2 id="spTitle">SPLITTER</h2><button class="x" data-spclose>✕</button></header><div class="menu" id="spBody"></div></div>';
  document.body.appendChild(el);
  el.querySelector('[data-spclose]').addEventListener('click', () => g.ui.closeModals());
  el.addEventListener('mousedown', (e) => { if (e.target === el) g.ui.closeModals(); });
  el.addEventListener('click', (ev) => onClick(g, ev));
  el.addEventListener('change', (ev) => onChange(g, ev));
  el.addEventListener('input', (ev) => onInput(g, ev));
  return el;
}

const tile = (g) => (focus != null ? g.logi.byId.get(focus) : null);
const wait = (g) => (g.isGuest && g.isGuest() ? 700 : 30);
function send(g, patch) {
  const r = g.setCfg(focus, patch);
  if (r && !r.ok) { g.sound.error(); g.ui.hint(r.why || 'Refused', 3.5); } else g.sound.tone('triangle', 600, 800, 0.05, 0.05);
  setTimeout(() => render(g), wait(g));
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const dr = (s) => draft[s] || (draft[s] = { k: 'rarity', v: 2, w: 6, sp: 0, q: '' });

// the species a player may pick: those in the dex that a rule accepts
function known(g, q) {
  const out = [], needle = String(q || '').trim().toLowerCase();
  if (!needle) return out;
  for (const k of Object.keys(g.S.dex || {})) { const id = +k, s = species[id]; if (s && SR.cleanRule({ k: 'species', v: id }) && s.name.toLowerCase().includes(needle)) { out.push(id); if (out.length >= 8) break; } }
  return out;
}

function ruleFromDraft(d) {
  if (d.k === 'rarity') return { k: 'rarity', v: d.v, ...(d.w < 6 ? { w: d.w } : {}) };
  if (d.k === 'species') return { k: 'species', v: d.sp };
  return { k: d.k };
}

function render(g) {
  const t = tile(g), body = el && el.querySelector('#spBody');
  if (!body) return;
  if (!t || !(t.smart || t.merger === 'prio')) { if (g.ui.openModal === 'splitpanel') g.ui.closeModals(); return; }
  el.querySelector('#spTitle').textContent = t.merger ? 'PRIORITY MERGER' : t.smart === 2 ? 'PROGRAMMABLE SPLITTER' : 'SMART SPLITTER';
  body.innerHTML = t.merger ? mergerHtml(g, t) : splitterHtml(g, t);
}

function mergerHtml(g, t) {
  const lanes = SR.isPerm(t.lanes) ? t.lanes : [0, 1, 2], feeds = g.logi.feedMap.get(t.id) || [];
  let h = '<div class="jcard"><p style="margin:0 0 6px">The best lane goes first. A lane below it only gets the gaps the better lanes leave, so a rare lane keeps flowing ahead of bulk.</p>';
  lanes.forEach((s, q) => {
    const n = feeds.filter((f) => SR.laneOf(t.dir, f.dir) === s).length;
    h += `<div style="${css.row}"><b style="min-width:24px;color:${['#66ff99', '#ffd24a', '#ff5a4a'][q]}">${q + 1}</b><span style="min-width:90px"><b>${SR.LANE_NAMES[s]}</b> input</span><span style="opacity:.75;min-width:120px">${n ? `${n} line${n > 1 ? 's' : ''} feed it` : 'nothing feeds it'}</span>
      <button data-a="lup" data-q="${q}" ${q === 0 ? 'disabled' : ''}>Up</button><button data-a="ldown" data-q="${q}" ${q === 2 ? 'disabled' : ''}>Down</button></div>`;
  });
  return h + '<p style="opacity:.7;margin:10px 0 0">Shift+E on it copies this order, E on another Priority Merger pastes it.</p></div>';
}

function chips(t, s) {
  const list = (t.rules && t.rules[s]) || [];
  if (!list.length) return '<span style="opacity:.7">No rule: this output is off.</span>';
  return list.map((r, q) => `<span style="${css.chip};border-color:${hex(SR.ruleColor(r))}" title="${esc(SR.KIND_HELP[r.k] || '')}">${esc(SR.ruleName(r))}<button data-a="rm" data-s="${s}" data-q="${q}" title="Remove this rule">✕</button></span>`).join('');
}

function builder(g, t, s) {
  const d = dr(s), prog = t.smart === 2, list = (t.rules && t.rules[s]) || [], full = prog && list.length >= SR.MAX_RULES[2];
  let h = `<div style="${css.row}"><select data-a="kind" data-s="${s}" style="${css.sel}">${SR.KINDS.map((k) => `<option value="${k}"${k === d.k ? ' selected' : ''}>${SR.KIND_NAMES[k]}</option>`).join('')}</select>`;
  if (d.k === 'rarity') h += `<span>from</span><select data-a="rmin" data-s="${s}" style="${css.sel}">${rarityOpts(d.v, false)}</select><span>to</span><select data-a="rmax" data-s="${s}" style="${css.sel}"><option value="6"${d.w >= 6 ? ' selected' : ''}>no limit</option>${rarityOpts(d.w, true)}</select>`;
  if (d.k === 'species') h += `<input data-a="q" data-s="${s}" value="${esc(d.q)}" maxlength="30" placeholder="search the plushdex" style="${css.sel};flex:1 1 140px;min-width:120px"><button data-a="hand" data-s="${s}" title="Use the plush in your hands">Use my plush</button>`;
  h += `<button data-a="set" data-s="${s}" ${full ? 'disabled' : ''}>${prog ? 'Add rule' : 'Set rule'}</button></div>`;
  h += `<div style="font-size:12px;opacity:.7;margin-top:2px">${esc(SR.KIND_HELP[d.k])}</div>`;
  if (d.k === 'species') {
    const res = known(g, d.q);
    h += `<div id="spRes${s}" style="${css.row}">${resHtml(s, d, res)}</div>`;
  }
  return h;
}
function resHtml(s, d, res) {
  const cur = d.sp && species[d.sp] ? `<span style="opacity:.85">Chosen: <b>${esc(species[d.sp].name)}</b></span>` : '<span style="opacity:.6">Search by name, or hold a plush and press Use my plush.</span>';
  return cur + res.map((id) => `<button data-a="pick" data-s="${s}" data-v="${id}">${esc(species[id].name)}</button>`).join('');
}

function splitterHtml(g, t) {
  const outs = g.logi.splitOuts(t), prog = t.smart === 2, prio = SR.isPerm(t.prio) ? t.prio : [0, 1, 2];
  let h = `<div class="jcard"><p style="margin:0">${prog ? 'Each output takes up to eight rules and there is a default output.' : 'Each output takes one rule.'} A plush goes to an output that names it. If none does, to an Any output, then to the Anything else output. An Overflow output only gets what the others refuse because they are full. A plush nothing takes waits, and the line behind it backs up.</p></div>`;
  for (let s = 0; s < 3; s++) {
    const o = outs.find((x) => x.slot === s);
    h += `<div class="jcard" data-slot="${s}"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${SR.SLOT_NAMES[s]}</b><span style="opacity:.7">${o ? 'feeds ' + esc(o.tile.type === 'belt' ? (o.tile.merger ? 'a merger' : o.tile.smart ? 'a ruled splitter' : o.tile.splitter ? 'a splitter' : 'a belt') : o.tile.type) : 'nothing built there'}</span></div><div style="margin-top:6px">${chips(t, s)}</div>${builder(g, t, s)}</div>`;
  }
  h += `<div class="jcard"><b>Order</b><div style="${css.row}"><label><input type="radio" name="spmode" data-a="mode" value="rr" ${t.mode !== 'prio' ? 'checked' : ''}> Round robin between the outputs that take a plush</label>
    <label><input type="radio" name="spmode" data-a="mode" value="prio" ${t.mode === 'prio' ? 'checked' : ''}> Best output first, the next only when it is full</label></div>`;
  if (t.mode === 'prio') h += prio.map((s, q) => `<div style="${css.row}"><b style="min-width:24px">${q + 1}</b><span style="min-width:90px">${SR.SLOT_NAMES[s]}</span><button data-a="up" data-q="${q}" ${q === 0 ? 'disabled' : ''}>Up</button><button data-a="down" data-q="${q}" ${q === 2 ? 'disabled' : ''}>Down</button></div>`).join('');
  h += '</div>';
  if (prog) h += `<div class="jcard"><b>Default output</b> <span style="opacity:.7">takes the plush no rule claims</span><div style="${css.row}">${[-1, 0, 1, 2].map((s) => `<label><input type="radio" name="spdef" data-a="def" value="${s}" ${t.def === s || (s === -1 && !(t.def >= 0)) ? 'checked' : ''}> ${s < 0 ? 'None' : SR.SLOT_NAMES[s]}</label>`).join('')}</div></div>`;
  h += `<div style="${css.row}"><button data-a="reset">Reset: every output takes anything</button><span style="opacity:.7">Shift+E on it copies these rules, E on another splitter pastes them.</span></div>`;
  return h;
}

function onClick(g, ev) {
  const b = ev.target && ev.target.closest ? ev.target.closest('button') : null; if (!b || !b.dataset.a || b.disabled) return;
  const t = tile(g); if (!t) return;
  const a = b.dataset.a, s = +b.dataset.s, q = +b.dataset.q;
  if (a === 'lup' || a === 'ldown') { const lanes = (SR.isPerm(t.lanes) ? t.lanes : [0, 1, 2]).slice(), n = a === 'lup' ? q - 1 : q + 1; [lanes[q], lanes[n]] = [lanes[n], lanes[q]]; send(g, { lanes }); return; }
  if (a === 'up' || a === 'down') { const prio = (SR.isPerm(t.prio) ? t.prio : [0, 1, 2]).slice(), n = a === 'up' ? q - 1 : q + 1; [prio[q], prio[n]] = [prio[n], prio[q]]; send(g, { prio }); return; }
  if (a === 'reset') { send(g, { rules: SR.defaultRules(), mode: 'rr', prio: [0, 1, 2], ...(t.smart === 2 ? { def: -1 } : {}) }); return; }
  const rules = clone(t.rules || SR.defaultRules());
  if (a === 'rm') { rules[s].splice(q, 1); send(g, { rules }); return; }
  if (a === 'hand') { const c = g.S.carry && g.S.carry[g.S.carry.length - 1]; if (!c) { g.ui.hint('Your hands are empty. Pick up a plush first.', 2.5); return; } const d = dr(s); d.k = 'species'; d.sp = c.sp; d.q = species[c.sp] ? species[c.sp].name : ''; if (!SR.cleanRule({ k: 'species', v: c.sp })) { g.ui.hint('That one cannot be a species rule.', 2.5); return; } render(g); return; }
  if (a === 'pick') { const d = dr(s); d.sp = +b.dataset.v; d.q = species[d.sp] ? species[d.sp].name : ''; render(g); return; }
  if (a === 'set') {
    const d = dr(s), r = ruleFromDraft(d);
    if (d.k === 'species' && !SR.cleanRule(r)) { g.sound.error(); g.ui.hint('Choose a species first: search the plushdex, or hold one and press Use my plush.', 3); return; }
    if (t.smart === 2) rules[s].push(r); else rules[s] = [r];
    send(g, { rules });
  }
}
function onChange(g, ev) {
  const x = ev.target; if (!x || !x.dataset || !x.dataset.a) return;
  const t = tile(g); if (!t) return;
  const a = x.dataset.a, s = +x.dataset.s;
  if (a === 'kind') { dr(s).k = x.value; render(g); return; }
  if (a === 'rmin') { const d = dr(s); d.v = +x.value; if (d.w < d.v) d.w = 6; render(g); return; }
  if (a === 'rmax') { const d = dr(s); d.w = +x.value; if (d.w < d.v) d.v = d.w; render(g); return; }
  if (a === 'mode') { send(g, { mode: x.value }); return; }
  if (a === 'def') { send(g, { def: +x.value }); }
}
function onInput(g, ev) {
  const x = ev.target; if (!x || !x.dataset || x.dataset.a !== 'q') return;
  const s = +x.dataset.s, d = dr(s); d.q = x.value; d.sp = 0;
  const box = el.querySelector('#spRes' + s); if (box) box.innerHTML = resHtml(s, d, known(g, d.q));
}

export function openPanel(g, id) {
  focus = id; draft[0] = draft[1] = draft[2] = null;
  if (!tile(g) || !(tile(g).smart || tile(g).merger === 'prio')) { if (g.ui.openModal === 'splitpanel') g.ui.closeModals(); return; }   // nothing to edit (taken down since)
  ensure(g); render(g);
  g.openModal('splitpanel');
  clearInterval(timer);
  timer = setInterval(() => { if (g.ui.openModal === 'splitpanel') { if (!el.contains(document.activeElement) || !/INPUT|SELECT/.test(document.activeElement.tagName)) render(g); } else clearInterval(timer); }, 1000);
}
