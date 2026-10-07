// audit_hud.*: an adversarial pass over the round gauges (src/dials.js, the belt in index.html and style.css).
// It goes after what hud_dials.js leaves out: readings that flip back and forth, numbers that are not numbers, a new shift that keeps the old shift's health,
// the floating readouts from other systems (load meter, rail speed, chat, bot panel, machine readout, lung warning) against the belt, short landscape screens,
// reduced motion and the colours.
import * as PWP from '../powerparts.js';
import { DIAL_DEFS } from '../dials.js';

export default async function (ctx) {
  const { T, g, S, p, fresh, newWorld } = ctx;
  const D = (id) => g.ui.dials.read(id);
  const el = (id) => document.getElementById(id);
  const hud = () => { g.hudT = 0; g._svNext = 0; g.updateHud(0.1); };
  const bay = () => { p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0; };
  const JUNK = /NaN|Infinity|undefined|null/;
  const shown = () => DIAL_DEFS.map((d) => d.id).filter((id) => D(id).on);

  // ------------------------------------------------------------------------------------------------ readings
  await T('audit_hud.the-clock-dial-keeps-open-or-closed-in-its-reading-and-is-quiet-when-nothing-changes', async () => {
    fresh({}); const bad = []; const gear = S().gear; S().gear = { ...(S().gear || {}), helmet: 1 }; g.T = g.tune();
    try {
      // the game calls setClock and setDay one after the other every half second: each must leave the reading the other wrote
      g.ui.setClock(500, true, true); g.ui.setDay(2);
      let d = D('clock'); const aria = () => el('dial-clock').getAttribute('aria-label') || '';
      if (!/open/.test(d.text) || !/open/.test(aria()) || !/open/.test(el('dial-clock').title)) bad.push(`open: text "${d.text}" aria "${aria()}"`);
      if (d.label !== 'DAY 2' || d.sub !== 'OPEN' || d.state !== 'ok') bad.push('open dial ' + JSON.stringify([d.label, d.sub, d.state]));
      g.ui.setClock(1200, false, true); g.ui.setDay(2); d = D('clock');
      if (!/closed/.test(d.text) || !/closed/.test(aria())) bad.push(`closed: text "${d.text}" aria "${aria()}"`); if (d.state !== 'closed' || d.sub !== 'CLOSED') bad.push('closed dial ' + JSON.stringify([d.state, d.sub]));
      // the same call twice in a row must not write to the page, and a day change before the first clock tick must not turn the dial on
      const mo = new MutationObserver(() => {}); mo.observe(el('dial-clock'), { attributes: true, childList: true, subtree: true, characterData: true });
      for (let n = 0; n < 20; n++) { g.ui.setClock(1200, false, true); g.ui.setDay(2); }
      const writes = mo.takeRecords().length; mo.disconnect(); if (writes) bad.push(`${writes} DOM writes for 20 identical clock ticks`);
      g.ui.setClock(500, true, false); g.ui.setDay(3); if (D('clock').on) bad.push('setDay turned the clock on without the helmet');
    } finally { S().gear = gear; g.T = g.tune(); g.ui.setClock(500, true, false); }
    return bad.length === 0 || bad.join('; ');
  });

  await T('audit_hud.no-dial-ever-says-nan-infinity-or-undefined-and-no-ring-leaves-its-track', async () => {
    fresh({}); const bad = []; const scan = (tag) => {
      for (const id of shown()) {
        const r = D(id), e = el('dial-' + id), s = [r.val, r.unit, r.sub, r.text, r.aria, r.title, e.getAttribute('aria-valuetext'), e.getAttribute('aria-valuenow')].join('|');
        if (JUNK.test(s)) bad.push(`${tag} ${id}: ${s.slice(0, 90)}`);
        if (!(r.frac >= 0 && r.frac <= 1) || !(r.frac2 >= 0 && r.frac2 <= 1)) bad.push(`${tag} ${id}: ring ${r.frac}/${r.frac2}`);
      }
    };
    const run = (tag, f) => { try { f(); } catch (e) { bad.push(`${tag} threw ${e.message}`); } scan(tag); };
    const u = g.ui, odd = [NaN, Infinity, -Infinity, -5, 1e9];
    try {
      for (const v of odd) {
        run('vitals ' + v, () => u.setVitals(v, v, true, false, v, v, 100, v)); run('vitals max ' + v, () => u.setVitals(0.5, 0.5, true, false, 0.1, 50, v, 10));
        run('air ' + v, () => u.setAir(true, v, v, 'X')); run('power ' + v, () => u.setPower(true, v, 'x', { demand: v, supply: v, tripped: false, sat: v }));
        run('cart ' + v, () => u.setCartLine(v < 0 ? 0 : v, v, 'follow')); run('assay ' + v, () => u.setAssay(true, v, { rel: v, text: '5 m' })); run('signal ' + v, () => u.setSignal(true, v, v, 'x', true));
        run('depth ' + v, () => u.setDepth('t', { depth: v, alt: v, out: v, left: v })); run('clock ' + v, () => u.setClock(v, true, true)); run('carry ' + v, () => u.setCarry([{ sp: 1, vr: 0 }], v));
        run('survey ' + v, () => u.setSurvey(true, { depth: 'x', best: 'y', press: 'z', air: 'a', load: 'l', cls: '', n: { depth: v, best: { name: 'F', max: v, flag: '' }, pile: 'p', loadR: v, stale: v, fan: v } }));
      }
      // a grid row from a friend that is missing its numbers must not take the whole HUD down
      for (const n of [{}, { demand: undefined, supply: 5 }, { demand: 'x', supply: 'y' }, { demand: null, supply: null, tripped: true }]) run('power row ' + JSON.stringify(n), () => u.setPower(true, 1, 'x', n));
      // more than full: a bag over its limit, health over its maximum, dust over 100 percent, negative seconds of air
      u.setVitals(2.5, 1, true, false, 0, 250, 100, -3); let d = D('hp'); if (d.val !== '100' || d.frac !== 1) bad.push('health over its maximum shows ' + d.val + ' ring ' + d.frac);
      d = D('breath'); if (d.val !== '0') bad.push('negative seconds of air show ' + d.val); u.setVitals(-1, 0, true, true, 0, -20, 100, 0); d = D('hp'); if (d.val !== '0' || d.frac !== 0) bad.push('negative health shows ' + d.val);
      u.setAir(true, 3, 4, 'COUGHING'); d = D('dust'); if (d.val !== '100%' || d.frac !== 1 || d.frac2 !== 1) bad.push('dust over 100 percent: ' + JSON.stringify([d.val, d.frac, d.frac2]));
      u.setCarry(Array.from({ length: 9 }, () => ({ sp: 1, vr: 0 })), 6); d = D('carry'); if (d.frac !== 1 || d.state !== 'warn') bad.push('a bag over its limit: ' + JSON.stringify([d.frac, d.state]));
    } finally { fresh({}); bay(); hud(); }
    return bad.length === 0 || bad.slice(0, 10).join('; ');
  });

  // ------------------------------------------------------------------------------------------------ a new shift
  await T('audit_hud.a-new-shift-starts-with-full-health-fresh-air-and-no-new-listeners', async () => {
    fresh({ airmon: 1, survey: 1, timber: 1, assay: 2, scan: 3, compass: 1 }); const bad = [];
    g.hp = 12; g.hurtT = 0; g.trapOn = true; g.airLeft = 8; g.suffocating = true; g.dust.level = 0.8; g.dust.lung = 0.9; g.ui.setTrap(true, 8, 0.1, 0.5, true); hud();
    const count = () => document.querySelectorAll('.dial').length, before = count(), kids = el('dialsL').children.length + el('dialsR').children.length;
    const seen = []; const orig = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (t, f, o) { if (this === window || this === document || (this.closest && this.closest('#belt'))) seen.push(`${this === window ? 'window' : this.id || this.nodeName}:${t}`); return orig.call(this, t, f, o); };
    try { await newWorld(); } finally { EventTarget.prototype.addEventListener = orig; }
    hud(); hud();
    if (count() !== before || el('dialsL').children.length + el('dialsR').children.length !== kids) bad.push(`dials were rebuilt: ${before} -> ${count()}`);
    const mine = seen.filter((s) => /resize|belt|dial/i.test(s)); if (mine.length) bad.push('a new shift added listeners: ' + mine.join(', '));
    if (!(g.hp >= g.hpMax - 0.01)) bad.push(`the new shift starts at ${Math.round(g.hp)} of ${g.hpMax} health`); const hp = D('hp'); if (hp.state !== 'ok' || hp.val !== String(Math.ceil(g.hpMax))) bad.push('health dial ' + JSON.stringify([hp.state, hp.val]));
    if (D('breath').on) bad.push('the air dial carried over'); if (g.trapOn || g.suffocating || g.airLeft !== undefined) bad.push('the air countdown carried over ' + JSON.stringify([g.trapOn, g.suffocating, g.airLeft]));
    if (!el('trap').classList.contains('hidden')) bad.push('the trapped overlay carried over');
    const left = shown().filter((id) => !['hp', 'carry', 'clock', 'depth', 'range'].includes(id)); if (left.length) bad.push('dials from the last shift: ' + left.join(','));
    return bad.length === 0 || bad.join('; ');
  });

  // ------------------------------------------------------------------------------------------------ layout: a probe that renders the real belt and the real stylesheet at any size
  const cssText = () => { const out = []; for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) out.push(r.cssText); } catch (e) { /* a sheet from another site */ } } return out.join('\n'); };
  const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const LONG = ['Steel Frame 380 m NEAR LIMIT\npile 120 m, x2.4', 'fan every 33 m', 'nearest support', 'EXIT 3.67 km', 'following', 'COUGHING', 'BROWNOUT', 'FULL', 'SUFFOCATING', 'OPEN', 'none within 8 m'];
  const METER = { t: 'GRID 3 kW of 8 kW, 38 percent, battery 40 percent', l: 'Loads: Rail Stations 3 kW, Doors 1.6 kW, Belts 0.9 kW and 2 more kinds' };
  // extra: html put in the HUD beside the belt; body: html put straight in the page (the chat lives there)
  const probe = (W, H, extra = '', body = '') => new Promise((resolve, reject) => {
    const f = document.createElement('iframe'); f.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;border:0;visibility:hidden;pointer-events:none;z-index:-1`;
    const compass = el('topcenter').outerHTML.replace('id="compass" class="hidden"', 'id="compass"'), top = el('topleft').outerHTML;
    f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>${cssText()}</style></head><body><div id="hud">${top}${compass}${el('belt').outerHTML}${extra}</div>${body}</body></html>`;
    f.onload = () => resolve(f); f.onerror = () => reject(new Error('probe failed')); document.body.appendChild(f);
  });
  const fill = (doc) => {
    const q = (s) => doc.querySelector(s), all = (s) => [...doc.querySelectorAll(s)];
    all('.dial').forEach((d, n) => { d.classList.remove('hidden'); const dd = d.querySelector('.dd'); dd.classList.remove('none'); dd.textContent = LONG[n % LONG.length]; d.querySelector('.v').textContent = ['1.50', '07:00', 'no signal', '123 m ▲ 45', '100%', '24'][n % 6]; d.querySelector('.v').dataset.l = ['m', 'm', 'l', 'x', 'm', 's'][n % 6]; });
    q('#hotbar').innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<div class="slot ${i === 1 ? 'sel' : ''}"><span class="k">${i}</span>⛏<span class="l">HAMMER</span><span class="c">99</span></div>`).join('');
    q('#hotbarHint').innerHTML = '<kbd>Q</kbd> put away · same number again also puts it away · <kbd>I</kbd> inventory';
    q('#hint').innerHTML = 'A long hint that runs over three lines when the screen is narrow: press <kbd>B</kbd> to set the part down, <kbd>Q</kbd> to put it away and <kbd>E</kbd> to open the panel on it.'; q('#hint').style.opacity = 1;
    const r = doc.documentElement.style; r.setProperty('--center-h', q('#bottom').offsetHeight + 'px'); r.setProperty('--belt-h', q('#belt').offsetHeight + 14 + 'px');
  };
  const rects = (doc, sel) => [...doc.querySelectorAll(sel)].filter((e) => getComputedStyle(e).display !== 'none' && !e.classList.contains('hidden')).map((e) => ({ id: e.dataset && e.dataset.dial ? e.dataset.dial : e.id, r: e.getBoundingClientRect() }));
  const meterHtml = () => {
    PWP.toggleHud(g, true); g._pwHudT = 0; PWP.hudTick(g, 0.1); const m = el('pwMeterHud'); if (!m) throw new Error('no load meter');
    const c = m.cloneNode(true); c.style.display = 'block'; c.querySelector('.pwh-t').textContent = METER.t; c.querySelector('.pwh-l').textContent = METER.l; return c.outerHTML;
  };

  await T('audit_hud.the-load-meter-never-sits-on-the-dials-hotbar-or-hint', async () => {
    const bad = []; fresh({}); let html;
    try { html = meterHtml(); } finally { PWP.toggleHud(g, false); }
    for (const [W, H] of [[360, 640], [412, 915], [768, 1024], [1024, 768], [1180, 640], [1280, 720], [1366, 768], [1920, 1080], [2560, 1440], [3840, 2160]]) {
      const f = await probe(W, H, html); const doc = f.contentDocument;
      try {
        fill(doc); const m = doc.getElementById('pwMeterHud').getBoundingClientRect(), tag = `${W}x${H}`;
        for (const d of rects(doc, '.dial')) if (hit(m, d.r)) bad.push(`${tag}: the load meter is on the ${d.id} dial`);
        for (const id of ['hotbar', 'hotbarHint', 'hint', 'compass']) { const r = doc.getElementById(id).getBoundingClientRect(); if (hit(m, r)) bad.push(`${tag}: the load meter is on #${id}`); }
        if (m.left < -0.5 || m.right > W + 0.5 || m.top < -0.5 || m.bottom > H + 0.5) bad.push(`${tag}: the load meter leaves the screen ${[m.left, m.top, m.right, m.bottom].map(Math.round)}`);
        const text = doc.querySelector('#pwMeterHud .pwh-l').getBoundingClientRect(); if (text.bottom > m.bottom + 0.5) bad.push(`${tag}: the load meter cuts its own text off`);
      } finally { f.remove(); }
    }
    return bad.length === 0 || bad.slice(0, 10).join('; ');
  });

  await T('audit_hud.short-and-landscape-screens-keep-every-dial-clear-of-the-compass-and-the-hotbar', async () => {
    const bad = [];
    for (const [W, H] of [[812, 375], [667, 375], [568, 320], [740, 360], [360, 480], [1024, 500], [1180, 500], [1366, 600]]) {
      const f = await probe(W, H); const doc = f.contentDocument;
      try {
        fill(doc); const tag = `${W}x${H}`, q = (s) => doc.querySelector(s); const dials = rects(doc, '.dial'), bar = q('#hotbar').getBoundingClientRect(), hh = q('#hotbarHint').getBoundingClientRect(), hint = q('#hint').getBoundingClientRect(), comp = q('#compass').getBoundingClientRect();
        for (const d of dials) {
          if (hit(d.r, comp)) bad.push(`${tag}: ${d.id} is on the compass`); if (hit(d.r, bar) || hit(d.r, hh) || hit(d.r, hint)) bad.push(`${tag}: ${d.id} is on the hotbar or hint`);
          if (d.r.left < -0.5 || d.r.right > W + 0.5 || d.r.top < -0.5 || d.r.bottom > H + 0.5) bad.push(`${tag}: ${d.id} leaves the screen`);
        }
        if (H >= 360 && hit(hint, comp)) bad.push(`${tag}: the hint is on the compass`);   // under 360 px high there is room for the compass and the dials but not for a line of hint as well if (bar.right > W + 0.5 || bar.left < -0.5 || bar.bottom > H + 0.5) bad.push(`${tag}: the hotbar leaves the screen`);
        if (comp.top > 30) bad.push(`${tag}: the compass moved down to ${Math.round(comp.top)}`); if (doc.documentElement.scrollWidth > W) bad.push(`${tag}: the page scrolls sideways`);
        for (let a = 0; a < dials.length; a++) for (let b = a + 1; b < dials.length; b++) if (hit(dials[a].r, dials[b].r)) bad.push(`${tag}: ${dials[a].id} is on ${dials[b].id}`);
        const slot = q('#hotbar .slot').getBoundingClientRect(); if (slot.width < 28) bad.push(`${tag}: slots only ${slot.width.toFixed(0)} px`);
      } finally { f.remove(); }
    }
    return bad.length === 0 || bad.slice(0, 10).join('; ');
  });

  await T('audit_hud.ultrawide-screens-keep-each-dial-group-against-the-hotbar-and-on-screen', async () => {
    const bad = [];
    for (const [W, H] of [[2560, 1080], [3440, 1440], [5120, 1440], [7680, 4320]]) {
      const f = await probe(W, H); const doc = f.contentDocument;
      try {
        fill(doc); const tag = `${W}x${H}`, q = (s) => doc.querySelector(s), bar = q('#hotbar').getBoundingClientRect(), dials = rects(doc, '.dial');
        const slot = bar.width / 9; for (const d of dials) {
          const left = q('#dialsL').contains(doc.getElementById('dial-' + d.id)), gap = left ? bar.left - d.r.right : d.r.left - bar.right;
          if (gap < -0.5) bad.push(`${tag}: ${d.id} is on the hotbar`); if (d.r.left < -0.5 || d.r.right > W + 0.5 || d.r.bottom > H + 0.5 || d.r.top < 0) bad.push(`${tag}: ${d.id} leaves the screen`);
          if (gap > slot * 6 + 200) bad.push(`${tag}: ${d.id} is ${Math.round(gap)} px from the hotbar`);   // the groups hug the hotbar, they do not drift out to the screen edges
        }
        for (let a = 0; a < dials.length; a++) for (let b = a + 1; b < dials.length; b++) if (hit(dials[a].r, dials[b].r)) bad.push(`${tag}: ${dials[a].id} is on ${dials[b].id}`);
        if (Math.abs((bar.left + bar.right) / 2 - W / 2) > 1) bad.push(`${tag}: the hotbar is off centre`); if (q('#hint').getBoundingClientRect().left < 0 || q('#hint').getBoundingClientRect().right > W) bad.push(`${tag}: the hint leaves the screen`);
      } finally { f.remove(); }
    }
    return bad.length === 0 || bad.slice(0, 10).join('; ');
  });

  await T('audit_hud.chat-the-bot-panel-and-the-rail-readout-do-not-sit-on-each-other-or-the-belt', async () => {
    const bad = [];
    const rail = '<div id="railHud" style="position:fixed;left:50%;top:108px;max-width:calc(100vw - 20px);transform:translateX(-50%);padding:8px 16px;font:600 13px/1.4 system-ui,sans-serif;text-align:center;z-index:20"><div style="font-size:15px">MINE RAIL &nbsp; <b>8.0 m/s</b> &nbsp; POWERED, top 12 m/s</div><div>UNDER WAY, 400 m to go &nbsp;|&nbsp; X rush home / return &nbsp; E Space hop off &nbsp; | 4 plush aboard</div></div>';
    const bot = '<div id="botInfo"><b id="biTitle">SCRAPPER BOT 1</b><div id="biLines"><div>Level 3  ·  Battery 40%</div><div>Carrying 3 of 8</div><div>Doing: Digging at the face</div></div><div id="biAct">E: send it to the face</div></div>';
    const chat = '<div id="chat">' + [1, 2, 3, 4, 5, 6].map((n) => `<div>Friend: message number ${n} that is fairly long to wrap maybe</div>`).join('') + '</div>';
    // (a 360 px phone with all fourteen dials up, a rail readout five lines tall, a bot panel and chat has no room for everything: not asked)
    for (const [W, H] of [[412, 915], [768, 1024], [1024, 768], [1280, 720], [1366, 768], [1920, 1080], [2560, 1440]]) {
      const f = await probe(W, H, bot + rail, chat); const doc = f.contentDocument;
      try {
        fill(doc); const tag = `${W}x${H}`, R = (s) => doc.querySelector(s).getBoundingClientRect();
        const c = R('#chat'), b = R('#botInfo'), r = R('#railHud'), tl = R('#topleft'), comp = R('#compass');
        if (hit(c, b)) bad.push(`${tag}: the chat is on the bot panel`); if (hit(c, r)) bad.push(`${tag}: the chat is on the rail readout`); if (hit(c, tl)) bad.push(`${tag}: the chat is on the money`);
        if (hit(r, comp)) bad.push(`${tag}: the rail readout is on the compass`); if (hit(b, comp)) bad.push(`${tag}: the bot panel is on the compass`); if (hit(c, comp)) bad.push(`${tag}: the chat is on the compass`);
        for (const d of rects(doc, '.dial')) { if (hit(c, d.r)) bad.push(`${tag}: the chat is on the ${d.id} dial`); if (hit(b, d.r)) bad.push(`${tag}: the bot panel is on the ${d.id} dial`); if (hit(r, d.r)) bad.push(`${tag}: the rail readout is on the ${d.id} dial`); }
        for (const id of ['hotbar', 'hotbarHint', ...(W >= 1180 ? ['hint'] : [])]) { const x = R('#' + id); if (hit(c, x) || hit(b, x) || hit(r, x)) bad.push(`${tag}: a floating panel is on #${id}`); }   // below 1180 px the hint spans the middle of the screen and a bot panel can touch it
      } finally { f.remove(); }
    }
    return bad.length === 0 || bad.slice(0, 10).join('; ');
  });

  await T('audit_hud.the-machine-readout-and-the-lung-warning-never-share-the-same-lines', async () => {
    const bad = [];
    const tile = '<div id="tileInfo"><b id="tiTitle">GENERATOR</b><div id="tiLines"><div>Generator</div><div>Burning a Rare plush</div><div>Fuel 3 of 50</div><div>Output 8 kW, load 5.2 kW</div><div>Reserve mode: holds fuel until a battery is low</div></div></div>';
    const lung = '<div id="lungWarn" class="s3"><b id="lungStage">WHEEZING: GET TO CLEAN AIR</b><span id="lungEta">passing out in about 8 s</span></div>';
    for (const [W, H] of [[768, 1024], [1024, 768], [1280, 720], [1920, 1080], [2560, 1440]]) {
      const f = await probe(W, H, tile + lung); const doc = f.contentDocument;
      try {
        fill(doc); const tag = `${W}x${H}`, R = (s) => doc.querySelector(s).getBoundingClientRect(), t = R('#tileInfo'), l = R('#lungWarn');
        if (hit(t, l)) bad.push(`${tag}: the machine readout and the lung warning overlap`);
        const cp = R('#compass'); if (hit(t, cp)) bad.push(`${tag}: the machine readout is on the compass`); if (hit(l, cp)) bad.push(`${tag}: the lung warning is on the compass`);
        for (const [name, r] of [['readout', t], ['lung warning', l]]) {
          for (const d of rects(doc, '.dial')) if (hit(r, d.r)) bad.push(`${tag}: the ${name} is on the ${d.id} dial`);
          for (const id of ['hotbar', 'hotbarHint', 'hint']) if (hit(r, R('#' + id))) bad.push(`${tag}: the ${name} is on #${id}`);
          if (r.bottom > H + 0.5 || r.top < 0) bad.push(`${tag}: the ${name} leaves the screen`);
        }
      } finally { f.remove(); }
    }
    return bad.length === 0 || bad.slice(0, 10).join('; ');
  });

  // ------------------------------------------------------------------------------------------------ motion, colour, stacking
  await T('audit_hud.reduced-motion-stops-the-pulse-and-the-ring-sweep-but-a-red-dial-stays-red', async () => {
    const bad = []; const rules = [];
    const walk = (list, inMotion) => { for (const r of list) { if (r.type === CSSRule.MEDIA_RULE) walk(r.cssRules, inMotion || /prefers-reduced-motion:\s*reduce/.test(r.conditionText || r.media.mediaText)); else if (r.style) rules.push({ r, inMotion }); } };
    for (const sh of document.styleSheets) { try { walk(sh.cssRules, false); } catch (e) { /* another site */ } }
    const calm = rules.filter((x) => x.inMotion && /\.dial/.test(x.r.selectorText || ''));
    if (!calm.length) return 'no reduced-motion rule for the dials';
    if (!calm.some((x) => /crit/.test(x.r.selectorText) && x.r.style.getPropertyValue('animation-name') === 'none')) bad.push('the critical pulse is not switched off');
    if (!calm.some((x) => /\.arc/.test(x.r.selectorText) && x.r.style.getPropertyValue('transition-property') === 'none')) bad.push('the ring sweep is not switched off');
    if (!calm.some((x) => /crit/.test(x.r.selectorText) && /var\(--crit\)/.test(x.r.style.getPropertyValue('box-shadow')))) bad.push('a critical dial has no still marker without the pulse');
    // nothing else on the dials moves: every animation or transition on a dial rule outside the reduced-motion block is covered by it
    const moving = rules.filter((x) => !x.inMotion && /\.dial|#dial/.test(x.r.selectorText || '') && (x.r.style.getPropertyValue('animation-name') && x.r.style.getPropertyValue('animation-name') !== 'none' || /[1-9]/.test(x.r.style.getPropertyValue('transition-duration') || '')));
    for (const x of moving) { const sel = x.r.selectorText; const covered = calm.some((c) => c.r.selectorText.split(',').some((part) => sel.split(',').some((m) => part.trim() === m.trim()))); if (!covered) bad.push('moves with reduced motion on: ' + sel); }
    return bad.length === 0 || bad.join('; ');
  });

  await T('audit_hud.dial-colours-read-against-the-ring-and-every-state-has-more-than-a-colour', async () => {
    const bad = []; const lum = (hex) => { const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const ringLight = '#242b1c', ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(), warn = getComputedStyle(document.documentElement).getPropertyValue('--warn').trim(), crit = getComputedStyle(document.documentElement).getPropertyValue('--crit').trim();
    for (const d of DIAL_DEFS) if (ratio(d.c, ringLight) < 4.5) bad.push(`${d.id} colour ${d.c} on the ring is ${ratio(d.c, ringLight).toFixed(1)}:1`);
    if (ratio(ink, ringLight) < 7) bad.push('the value text is only ' + ratio(ink, ringLight).toFixed(1) + ':1'); if (ratio(warn, ringLight) < 4.5) bad.push('amber ' + ratio(warn, ringLight).toFixed(1)); if (ratio(crit, ringLight) < 4.5) bad.push('red ' + ratio(crit, ringLight).toFixed(1));
    // amber and red are told apart from the normal state by more than hue: red also pulses (or outlines) and says a word
    fresh({}); bay(); g.ui.setPower(true, 1, 'NO FUEL', { demand: 2, supply: 0, tripped: false, sat: 0 }); const c = D('grid'); if (c.state !== 'crit' || !c.sub) bad.push('a red dial with no word: ' + JSON.stringify([c.state, c.sub]));
    g.ui.setPower(true, 1, '8 / 8 kW BROWNOUT', { demand: 9, supply: 8, tripped: false, sat: 0.8 }); const a = D('grid'); if (a.state !== 'warn' || !a.sub) bad.push('an amber dial with no word: ' + JSON.stringify([a.state, a.sub]));
    g.ui.setPower(false);
    return bad.length === 0 || bad.join('; ');
  });

  await T('audit_hud.black-and-title-screens-and-the-intro-cover-the-belt', async () => {
    const bad = []; const z = (id) => +getComputedStyle(el(id)).zIndex || 0, hudZ = +getComputedStyle(el('hud')).zIndex || 0;
    // inside the HUD every layer has the same z-index, so the black screen covers the belt by coming after it
    if (!(z('blackout') >= z('belt')) || !(el('belt').compareDocumentPosition(el('blackout')) & Node.DOCUMENT_POSITION_FOLLOWING)) bad.push(`#blackout (${z('blackout')}) is not above the belt (${z('belt')})`);
    const bs = getComputedStyle(el('blackout')); if (bs.position !== 'fixed' || bs.backgroundColor !== 'rgb(0, 0, 0)') bad.push('#blackout does not cover the screen');
    for (const id of ['title', 'ending', 'loading']) if (!(z(id) > hudZ)) bad.push(`#${id} (${z(id)}) is not above the HUD (${hudZ})`);
    const intro = [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules]; } catch (e) { return []; } }).find((r) => r.selectorText === '#intro'); if (!intro || !(+intro.style.zIndex > z('belt') + hudZ)) bad.push('the intro is not above the HUD');
    return bad.length === 0 || bad.join('; ');
  });
}
