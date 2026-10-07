// The round gauges on the belt. Every dial is a ring (SVG, crisp at any size) with a value in the middle, a short label under it and an optional line of detail.
// Dials sit in two groups beside the hotbar: #dialsL (you: health, carry, air, dust, power) and #dialsR (the world: sensors, depth, survey, clock).
// The compass is not a dial: it stays at the top of the screen, with its bearing arrow and the ONE mark.
//
// Each dial has a state that drives its colour: ok, hot (a sensor is on to something), warn, crit (also pulses) and closed (the clock after hours).
// ui.dials.set(id, {...}) only touches the DOM for what changed, so it is cheap to call every frame.
const NS = 'http://www.w3.org/2000/svg';
export const STATES = ['ok', 'hot', 'warn', 'crit', 'closed'];

// side L = left of the hotbar, R = right of it. Order is nearest to the hotbar first.
export const DIAL_DEFS = [
  { id: 'hp', side: 'L', label: 'HEALTH', c: '#6fe39a' },
  { id: 'carry', side: 'L', label: 'CARRY', c: '#d7f26a', segs: true },
  { id: 'cart', side: 'L', label: 'CART', c: '#ffcf8a' },
  { id: 'breath', side: 'L', label: 'AIR', c: '#7fd0ff' },
  { id: 'dust', side: 'L', label: 'DUST', c: '#d8c58a', ring2: true },
  { id: 'grid', side: 'L', label: 'GRID', c: '#7ad7ff' },
  { id: 'signal', side: 'R', label: 'THE ONE', c: '#fff3a0', arrow: true },
  { id: 'vein', side: 'R', label: 'VEIN', c: '#c28bff', arrow: true },
  { id: 'depth', side: 'R', label: 'DEPTH', c: '#d6b896' },
  { id: 'range', side: 'R', label: 'FROM BAY', c: '#7ef0c4' },
  { id: 'frame', side: 'R', label: 'FRAME', c: '#e0c070' },
  { id: 'support', side: 'R', label: 'SUPPORT', c: '#d9c47a' },
  { id: 'stale', side: 'R', label: 'STALE AIR', c: '#b8d27a' },
  { id: 'clock', side: 'R', label: 'CLOCK', c: '#ffd86a', marker: true },
];

const svg = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const R1 = 27, R2 = 19.5;

function build(def) {
  const el = document.createElement('div');
  el.className = 'dial hidden'; el.id = 'dial-' + def.id; el.dataset.dial = def.id; el.dataset.s = 'ok';
  el.style.setProperty('--c0', def.c);
  el.setAttribute('role', 'meter'); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '100'); el.setAttribute('aria-valuenow', '0');
  el.setAttribute('aria-label', def.label);
  const ring = document.createElement('div'); ring.className = 'ring';
  const s = svg('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false' }, ring);
  svg('circle', { class: 'trk', cx: 32, cy: 32, r: R1 }, s);
  if (def.ring2) svg('circle', { class: 'trk trk2', cx: 32, cy: 32, r: R2 }, s);
  if (def.segs) svg('g', { class: 'segs', transform: 'rotate(-90 32 32)' }, s);
  svg('circle', { class: 'arc', cx: 32, cy: 32, r: R1, pathLength: 100, transform: 'rotate(-90 32 32)' }, s);
  if (def.ring2) svg('circle', { class: 'arc arc2', cx: 32, cy: 32, r: R2, pathLength: 100, transform: 'rotate(-90 32 32)' }, s);
  if (def.marker) svg('circle', { class: 'mk', cx: 32, cy: 5, r: 4.6 }, s);
  const mid = document.createElement('div'); mid.className = 'mid';
  if (def.arrow) { const a = svg('svg', { class: 'ar', viewBox: '-10 -10 20 20', 'aria-hidden': 'true' }); svg('path', { d: 'M-7 -6.5 L8.5 0 L-7 6.5 L-3.4 0 Z' }, a); mid.appendChild(a); }
  const v = document.createElement('b'); v.className = 'v'; const u = document.createElement('small'); u.className = 'u';
  mid.append(v, u); ring.appendChild(mid);
  const dl = document.createElement('span'); dl.className = 'dl'; dl.textContent = def.label;
  const dd = document.createElement('em'); dd.className = 'dd';
  el.append(ring, dl, dd);
  return el;
}

const q1 = (x) => Math.round(Math.max(0, Math.min(1, x || 0)) * 1000) / 10;   // 0..100 in tenths (NaN and a missing value are 0)
// whatever a caller hands over, the page never shows the word NaN, Infinity, undefined or null: a broken number reads "--"
const JUNK = /-?\b(?:NaN|Infinity|undefined|null)\b/g;
const clean = (s) => (/NaN|Infinity|undefined|null/.test(s) ? s.replace(JUNK, '--') : s);

export class Dials {
  constructor(left, right) {
    this.els = new Map(); this.st = new Map(); this.defs = new Map();
    for (const d of DIAL_DEFS) {
      const el = build(d); (d.side === 'L' ? left : right).appendChild(el);
      this.els.set(d.id, el); this.st.set(d.id, { on: false, label: d.label }); this.defs.set(d.id, d);
      el._q = { arc: el.querySelector('.arc'), arc2: el.querySelector('.arc2'), v: el.querySelector('.v'), u: el.querySelector('.u'), dl: el.querySelector('.dl'), dd: el.querySelector('.dd'), ar: el.querySelector('.ar'), mk: el.querySelector('.mk'), segs: el.querySelector('.segs') };
    }
  }
  el(id) { return this.els.get(id); }
  ids() { return [...this.els.keys()]; }

  // o: on, frac (0..1 ring), frac2 (inner ring), val (centre text), unit (small text under it), sub (detail line under the label), label (replaces the default label),
  //    state, rot (arrow degrees, null hides the arrow), text (what a reader says for the value), info ({name: full text} kept for the tooltip), dim, segs (colour per ring segment), mk (marker 0..1 round the ring), mkc
  set(id, o = {}) {
    const el = this.els.get(id); if (!el) return;
    const st = this.st.get(id), q = el._q, def = this.defs.get(id);
    const on = !!o.on;
    if (o.label !== undefined && o.label !== st.label) { st.label = o.label; q.dl.textContent = o.label; st.dirty = true; }
    if (st.on !== on) { st.on = on; el.classList.toggle('hidden', !on); st.dirty = true; }
    if (!on) return;
    const f = q1(o.frac); if (st.f !== f) { st.f = f; q.arc.style.strokeDasharray = `${f} 100`; q.arc.style.opacity = f < 0.4 ? 0 : 1; }
    if (q.arc2) { const f2 = q1(o.frac2); if (st.f2 !== f2) { st.f2 = f2; q.arc2.style.strokeDasharray = `${f2} 100`; q.arc2.style.opacity = f2 < 0.4 ? 0 : 1; } }
    const val = o.val === undefined || o.val === null ? '' : clean(String(o.val));
    if (st.val !== val) { st.val = val; q.v.textContent = val; q.v.dataset.l = val.length <= 3 ? 's' : val.length <= 5 ? 'm' : val.length <= 8 ? 'l' : 'x'; st.dirty = true; }
    const unit = o.unit ? clean(String(o.unit)) : '';
    if (st.unit !== unit) { st.unit = unit; q.u.textContent = unit; st.dirty = true; }
    const sub = o.sub ? clean(String(o.sub)) : '';
    if (st.sub !== sub) { st.sub = sub; q.dd.textContent = sub; q.dd.classList.toggle('none', !sub); st.dirty = true; }
    const state = STATES.includes(o.state) ? o.state : 'ok';
    if (st.state !== state) { st.state = state; el.dataset.s = state; }
    const dim = !!o.dim; if (st.dim !== dim) { st.dim = dim; el.classList.toggle('dim', dim); }
    if (q.ar) {
      const rot = o.rot === null || o.rot === undefined || !isFinite(o.rot) ? null : o.rot;
      const key = rot === null ? 'off' : rot.toFixed(0);
      if (st.rot !== key) { st.rot = key; q.ar.style.transform = rot === null ? '' : `rotate(${key}deg)`; q.ar.classList.toggle('off', rot === null); el.classList.toggle('has-ar', rot !== null); }
    }
    if (q.mk && o.mk !== undefined) {
      const m = Math.round(o.mk * 1000) / 1000, key = m + '|' + (o.mkc || '');
      if (st.mk !== key) { st.mk = key; const a = m * Math.PI * 2; q.mk.setAttribute('cx', (32 + Math.sin(a) * R1).toFixed(2)); q.mk.setAttribute('cy', (32 - Math.cos(a) * R1).toFixed(2)); if (o.mkc) q.mk.style.fill = o.mkc; }
    }
    if (q.segs && o.segs) {
      const key = o.segs.join('|');
      if (st.segs !== key) {
        st.segs = key; const n = o.segs.length, seg = 100 / n, gap = n > 1 ? Math.min(1.4, seg * 0.3) : 0; q.segs.textContent = '';
        for (let i = 0; i < n; i++) {
          const c = svg('circle', { cx: 32, cy: 32, r: R1, pathLength: 100, class: o.segs[i] ? 'sg' : 'sg e' }, q.segs);
          c.style.strokeDasharray = `${(seg - gap).toFixed(3)} 100`; c.style.strokeDashoffset = (-i * seg - gap / 2).toFixed(3);
          if (o.segs[i]) c.style.stroke = o.segs[i];
        }
      }
    }
    const text = o.text !== undefined ? clean(String(o.text)) : (val + (unit ? ' ' + unit : '')).trim();
    const info = o.info ? Object.fromEntries(Object.entries(o.info).map(([k, v]) => [k, clean(String(v))])) : null; const ik = info ? JSON.stringify(info) : '';
    if (st.dirty || st.text !== text || st.ik !== ik || st.f !== st.fa) {
      st.text = text; st.ik = ik; st.dirty = false; st.fa = st.f;
      for (const k of Object.keys(el.dataset)) if (k.startsWith('i') && k.length > 1 && k[1] === k[1].toUpperCase()) delete el.dataset[k];
      const lines = []; if (info) for (const k of Object.keys(info)) { el.dataset['i' + k[0].toUpperCase() + k.slice(1)] = info[k]; lines.push(info[k]); }
      const full = [text, ...lines.filter((x) => x && x !== text)].filter(Boolean).join('. ');
      const lab = `${st.label}: ${full || 'no reading'}`;
      el.setAttribute('aria-label', lab); el.setAttribute('aria-valuenow', String(Math.round(st.f))); el.setAttribute('aria-valuetext', full || 'no reading');
      el.title = `${st.label}\n${[text, ...lines.filter((x) => x && x !== text)].filter(Boolean).join('\n')}`;
    }
    void def;
  }
  hide(id) { this.set(id, { on: false }); }

  // what a test or a reader can see: { on, state, frac, val, unit, sub, label, text, aria, title, info }
  read(id) {
    const el = this.els.get(id); if (!el) return null; const st = this.st.get(id), info = {};
    for (const k of Object.keys(el.dataset)) if (k.length > 1 && k[0] === 'i' && k[1] === k[1].toUpperCase()) info[k[1].toLowerCase() + k.slice(2)] = el.dataset[k];
    return { on: !el.classList.contains('hidden'), state: el.dataset.s, frac: (st.f || 0) / 100, frac2: (st.f2 || 0) / 100, val: st.val || '', unit: st.unit || '', sub: st.sub || '', label: st.label, text: st.text || '', aria: el.getAttribute('aria-label'), title: el.title, info, dim: !!st.dim, rot: st.rot === undefined || st.rot === 'off' ? null : +st.rot };
  }
}
