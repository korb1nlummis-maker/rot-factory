// hud.*: the round gauges on the belt (src/dials.js), two groups either side of the hotbar. The compass is not a dial: it stays at the top.
// mp.hud.*: a guest sees its own health, air, carry and cart, and the host's grid from the dyn row, on the same dials.
import { makeKit } from './power_lib.js';
import { DIAL_DEFS } from '../dials.js';
import { EXIT_X } from '../config.js';

export default async function (ctx) {
  const { T, g, S, p, w, fresh, adv, near, V3, species, toI, toK, cellX, cellZ } = ctx;
  const D = (id) => g.ui.dials.read(id);
  const hud = () => { g.hudT = 0; g._svNext = 0; g.updateHud(0.1); };
  const bay = () => { p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0; };
  const R_SCAN = [0, 7, 16, 40, 120, 350, 900, 2800, 6800];
  const json = (m) => JSON.parse(JSON.stringify(m));
  const el = (id) => document.getElementById(id);

  // ------------------------------------------------------------------------------------------------ structure
  await T('hud.every-dial-sits-in-the-left-or-right-group-and-the-old-boxes-are-gone', async () => {
    const bad = [];
    const L = ['hp', 'breath', 'dust', 'grid', 'carry', 'cart'], R = ['signal', 'vein', 'depth', 'range', 'frame', 'support', 'stale', 'clock'];
    for (const d of DIAL_DEFS) {
      const e = el('dial-' + d.id); if (!e) { bad.push('no element for ' + d.id); continue; }
      const want = L.includes(d.id) ? 'dialsL' : R.includes(d.id) ? 'dialsR' : null;
      if (want !== (d.side === 'L' ? 'dialsL' : 'dialsR')) bad.push(`${d.id} is on side ${d.side}`);
      if (e.parentElement.id !== (d.side === 'L' ? 'dialsL' : 'dialsR')) bad.push(`${d.id} sits in #${e.parentElement.id}`);
      if (!e.querySelector('svg circle.arc')) bad.push(d.id + ' has no ring');
    }
    for (const id of [...L, ...R]) if (!DIAL_DEFS.some((d) => d.id === id)) bad.push('missing dial ' + id);
    for (const id of ['vitals', 'hpBar', 'airBar', 'power', 'air', 'signal', 'assay', 'assayPtr', 'survey', 'depth', 'clock', 'carry', 'carryChips', 'cartLine', 'lungBar', 'sigFill']) if (el(id)) bad.push('the old #' + id + ' is still in the page');
    const belt = el('belt'); if (!belt || !belt.contains(el('hotbar')) || !belt.contains(el('dialsL')) || !belt.contains(el('dialsR'))) bad.push('the belt must hold both groups and the hotbar');
    // left of the hotbar, then the hotbar, then right of it, in the page order
    const kids = [...belt.children].map((c) => c.id); if (kids.indexOf('dialsL') > kids.indexOf('bottom') && !getComputedStyle(belt).display.includes('grid')) bad.push('group order ' + kids);
    return bad.length === 0 || bad.join('; ');
  });

  await T('hud.the-compass-stays-at-the-top-with-its-bearing-and-the-one-mark', async () => {
    fresh({ compass: 1, plan: 1, scan: 3 }); bay(); const bad = [];
    const rec = { c: null }; const o = g.ui.setCompass; g.ui.setCompass = function (...a) { rec.c = a; return o.apply(this, a); };
    try {
      const np = g.needlePos; g.needlePos = () => ({ x: p().pos.x + 10, y: p().pos.y + 1, z: p().pos.z });
      try { hud(); } finally { g.needlePos = np; }
    } finally { g.ui.setCompass = o; }
    const c = el('compass'); if (c.classList.contains('hidden')) bad.push('compass hidden with the upgrade');
    if (el('belt').contains(c)) bad.push('the compass moved into the belt'); if (!el('topcenter').contains(c)) bad.push('the compass left #topcenter');
    if (DIAL_DEFS.some((d) => /compass|bearing/i.test(d.id))) bad.push('the compass became a dial');
    const r = c.getBoundingClientRect(); if (!(r.top < innerHeight * 0.2 && r.top >= 0)) bad.push('compass top ' + r.top);
    if (!rec.c || !rec.c[2].some((m) => m.label === 'ONE')) bad.push('no ONE mark on the compass'); if (!/HDG \d+°/.test(el('compassTxt').textContent)) bad.push('no bearing text: ' + el('compassTxt').textContent);
    if (!/EXIT \d+ m/.test(el('compassTxt').textContent)) bad.push('no exit distance on the compass: ' + el('compassTxt').textContent);
    return bad.length === 0 || bad.join('; ');
  });

  await T('hud.every-dial-has-a-role-a-spoken-label-and-a-tooltip', async () => {
    fresh({ airmon: 1, survey: 1, timber: 1, steel: 1, assay: 3, scan: 5, compass: 1, cart: 1, power: 1 }); const bad = [];
    S().gear = { ...(S().gear || {}), helmet: 1 }; g.T = g.tune();
    try {
      p().pos.set(600, 0, 20); g.dust.level = 0.5; g.dust.lung = 0.4; g.hp = 70; g.trapOn = true; g.airLeft = 30; S().carry = [{ sp: 5, vr: 0 }, { sp: 900, vr: 0 }]; g.ui.setCarry(S().carry, 6);
      g.ui.setCartLine(3, 10, 'follow'); g.ui.setPower(true, 0.5, '4.0 / 8.0 kW', { demand: 4, supply: 8, tripped: false, sat: 1 }); hud(); g.ui.setPower(true, 0.5, '4.0 / 8.0 kW', { demand: 4, supply: 8, tripped: false, sat: 1 }); g.ui.setCartLine(3, 10, 'follow');
      g.updateClock(0.6); g.ui.setClock(g.dayMinute(), true, true);
      let shown = 0;
      for (const d of DIAL_DEFS) {
        const e = el('dial-' + d.id), r = D(d.id); if (!r.on) continue; shown++;
        if (e.getAttribute('role') !== 'meter') bad.push(d.id + ' role ' + e.getAttribute('role'));
        const a = e.getAttribute('aria-label') || ''; if (!a.startsWith(r.label + ':') || a.length < r.label.length + 4) bad.push(`${d.id} aria-label "${a}"`);
        if (!/\d/.test(a) && !/no signal|clear|fresh|none/i.test(a)) bad.push(`${d.id} aria-label has no reading: "${a}"`);
        if (e.getAttribute('aria-valuenow') === null || e.getAttribute('aria-valuetext') === null) bad.push(d.id + ' has no aria value');
        if (!e.title || !e.title.startsWith(r.label)) bad.push(`${d.id} tooltip "${e.title}"`);
        if (e.querySelector('svg').getAttribute('aria-hidden') !== 'true') bad.push(d.id + ' ring is not hidden from readers');
      }
      if (shown < 11) bad.push('only ' + shown + ' dials showed with everything owned');
      if (el('dialsL').getAttribute('role') !== 'group' || !el('dialsL').getAttribute('aria-label') || el('dialsR').getAttribute('role') !== 'group') bad.push('the groups are not labelled');
    } finally { S().gear = { ...(S().gear || {}), helmet: 0 }; g.trapOn = false; g.airLeft = undefined; g.dust.level = 0; g.dust.lung = 0; }
    return bad.length === 0 || bad.join('; ');
  });

  // ------------------------------------------------------------------------------------------------ the left group
  await T('hud.health-dial-follows-hp-and-warns-then-pulses', async () => {
    fresh({}); bay(); const bad = [];
    for (const [hp, st, dim] of [[100, 'ok', true], [80, 'ok', false], [55, 'warn', false], [34, 'crit', false], [5, 'crit', false]]) {
      g.hp = hp; g.hurtT = 0; hud(); const d = D('hp');
      if (!d.on) { bad.push('hidden at ' + hp); continue; }
      if (d.state !== st) bad.push(`${hp} hp: state ${d.state}, want ${st}`); if (d.dim !== dim) bad.push(`${hp} hp: dim ${d.dim}`);
      if (d.val !== String(Math.ceil(g.hp))) bad.push(`${hp} hp: shows ${d.val} for ${g.hp}`); if (!near(d.frac, g.hp / 100, 0.002)) bad.push(`${hp} hp: ring ${d.frac}`);
      if (d.unit !== '/ 100') bad.push('unit ' + d.unit); if (!el('dial-hp').getAttribute('aria-label').includes(`${Math.ceil(g.hp)} of 100 health`)) bad.push('aria ' + el('dial-hp').getAttribute('aria-label'));
    }
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      g.hp = 20; g.hurtT = 0; hud(); const an = getComputedStyle(el('dial-hp').querySelector('.ring')).animationName; if (!/dialPulse/.test(an)) bad.push('a critical dial does not pulse: ' + an);
      g.hp = 90; hud(); const an2 = getComputedStyle(el('dial-hp').querySelector('.ring')).animationName; if (an2 !== 'none') bad.push('a healthy dial pulses: ' + an2);
    }
    g.hp = 100; return bad.length === 0 || bad.join('; ');
  });

  await T('hud.hp-dial-uses-a-bigger-max-health', async () => {
    fresh({}); bay(); g.T.hpBonus = 50; g.hpMax = 150; g.hp = 105; g.hurtT = 0; hud(); const d = D('hp'); const ok = d.val === '105' && d.unit === '/ 150' && near(d.frac, 0.7, 0.002) && d.state === 'ok';
    g.T.hpBonus = 0; g.hpMax = 100; g.hp = 100; hud(); return ok || JSON.stringify(d);
  });

  await T('hud.air-dial-shows-only-when-the-air-is-short-and-turns-red', async () => {
    fresh({}); bay(); const bad = []; g.trapOn = false; g.airLeft = undefined; g.suffocating = false; hud();
    if (D('breath').on) bad.push('air dial shown with full air');
    const max = 60 + 30 * (g.T.airTank || 0);
    try {
      p().embedded = true;   // buried: the game itself starts the countdown and the suffocation
      hud(); if (!D('breath').on) bad.push('air dial hidden while buried');
      for (const [left, st] of [[max * 0.8, 'ok'], [max * 0.4, 'warn'], [max * 0.15, 'crit']]) {
        g.airLeft = left; hud(); const d = D('breath'); if (!d.on) { bad.push('hidden at ' + left); continue; }
        if (d.state !== st) bad.push(`${left.toFixed(0)} s: ${d.state}, want ${st}`); if (d.val !== String(Math.ceil(g.airLeft)) || d.unit !== 'sec') bad.push(`${left.toFixed(0)} s: shows ${d.val} ${d.unit}`);
        if (!near(d.frac, g.airLeft / max, 0.01)) bad.push('ring ' + d.frac);
      }
      g.airLeft = 0; hud(); if (D('breath').state !== 'crit' || D('breath').sub !== 'SUFFOCATING') bad.push('suffocating: ' + JSON.stringify(D('breath')));
    } finally { p().embedded = false; g.hp = 100; }
    for (let n = 0; n < 20; n++) hud();
    if (D('breath').on) bad.push('air dial stays after getting out'); g.suffocating = false; g.trapOn = false; g.airLeft = undefined; g.trapFree = 0;
    return bad.length === 0 || bad.join('; ');
  });

  await T('hud.dust-dial-needs-the-air-monitor-and-reads-dust-and-lungs', async () => {
    fresh({}); bay(); const bad = [];
    const set = (lvl, lung) => { g.dust.t = 99; g.dust.hostLevel = lvl; g.dust.level = lvl; g.dust.lung = lung; hud(); };
    try {
      set(0.6, 0.5); if (D('dust').on) bad.push('shown without the Air Monitor');
      fresh({ airmon: 1 }); bay();
      set(0, 0); if (D('dust').on) bad.push('shown in clean air');
      set(0.12, 0.05); { const d = D('dust'); if (!d.on || d.state !== 'ok' || d.sub !== 'CLEAR') bad.push('light dust: ' + JSON.stringify([d.on, d.state, d.sub])); }
      set(0.5, 0.4); { const d = D('dust'); if (d.state !== 'warn' || d.sub !== 'DUSTY') bad.push('dusty: ' + JSON.stringify([d.state, d.sub])); if (!near(d.frac, 0.5, 0.002) || !near(d.frac2, 0.4, 0.002)) bad.push(`rings ${d.frac}/${d.frac2}`); if (d.val !== '50%') bad.push('value ' + d.val); }
      set(0.9, 0.9); { const d = D('dust'); if (d.state !== 'crit' || d.sub !== 'COUGHING') bad.push('coughing: ' + JSON.stringify([d.state, d.sub])); if (!/lungs 90 percent/.test(el('dial-dust').getAttribute('aria-label'))) bad.push('aria ' + el('dial-dust').getAttribute('aria-label')); }
      // the lung warning and vignette in the middle of the screen are separate from the dial and still there
      if (!el('lungWarn') || !el('lungVig')) bad.push('the lung warning overlay is gone');
    } finally { g.dust.t = 0; g.dust.hostLevel = 0; g.dust.level = 0; g.dust.lung = 0; }
    return bad.length === 0 || bad.join('; ');
  });

  await T('hud.grid-dial-reads-the-grid-you-stand-by-with-its-thresholds', async () => {
    const K = makeKit(ctx); const bad = [];
    K.reset(); bay(); hud(); if (D('grid').on) bad.push('grid dial with no generator');
    const G = K.grid(2, 3, { gens: 1, fans: 3 }); adv(1.5); p().pos.set(2, 0, 2.4); hud();
    const net = g.power.nearest(2, 1, 2.4); if (!net) return 'no grid found at the pole';
    let d = D('grid'); if (!d.on) return 'grid dial hidden beside a grid';
    if (d.val !== net.demand.toFixed(1) || d.unit !== 'kW') bad.push(`shows ${d.val} ${d.unit}, grid demand ${net.demand.toFixed(2)}`);
    if (!near(d.frac, Math.min(1, net.demand / net.supply), 0.002)) bad.push(`ring ${d.frac} vs ${net.demand}/${net.supply}`); if (d.sub !== `of ${net.supply.toFixed(1)} kW`) bad.push('sub ' + d.sub);
    if (d.state !== 'ok') bad.push('a light load is ' + d.state);
    // more load than the generator makes: 4 fans is 100%, 6 is a brownout
    G.addFans(1); adv(1); hud(); d = D('grid'); if (d.state !== 'warn') bad.push('a full grid is ' + d.state);
    G.addFans(2); adv(1.2); hud(); d = D('grid'); if (d.state !== 'warn' || !/BROWNOUT/.test(d.sub)) bad.push(`overload ${d.state} "${d.sub}" sat ${net.sat}`);
    // a tripped grid and an empty generator, as the HUD is told them
    const real = g.power.nearest;
    try {
      g.power.nearest = () => ({ demand: 9.5, supply: 8, sat: 0.4, tripped: true }); hud(); d = D('grid'); if (d.state !== 'crit' || d.sub !== 'TRIPPED' || !/TRIPPED/.test(d.text)) bad.push('tripped: ' + JSON.stringify([d.state, d.sub, d.text]));
      g.power.nearest = () => ({ demand: 2, supply: 0, sat: 0, tripped: false }); hud(); d = D('grid'); if (d.state !== 'crit' || d.sub !== 'NO FUEL') bad.push('no fuel: ' + JSON.stringify([d.state, d.sub]));
      g.power.nearest = () => ({ demand: 3, supply: 8, sat: 1, tripped: false }); hud(); d = D('grid'); if (d.state !== 'ok') bad.push('ok again: ' + d.state);
    } finally { g.power.nearest = real; }
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { g.ui.setPower(true, 1, 'NO FUEL', { demand: 2, supply: 0, tripped: false, sat: 0 }); if (!/dialPulse/.test(getComputedStyle(el('dial-grid').querySelector('.ring')).animationName)) bad.push('a tripped grid does not pulse'); }
    K.reset(); return bad.length === 0 || bad.join('; ');
  });

  await T('hud.carry-dial-colours-each-slot-by-rarity-and-warns-when-full', async () => {
    fresh({}); const bad = [];
    const rare = (r) => { for (let id = 1; id < species.length; id++) if (species[id] && species[id].rarity === r) return id; return 1; };
    S().carry = [{ sp: rare(0), vr: 0 }, { sp: rare(3), vr: 0 }]; g.T.carry = 4; g.ui.setCarry(S().carry, 4);
    let d = D('carry'), segs = [...el('dial-carry').querySelectorAll('.sg')];
    if (!d.on) bad.push('hidden'); if (d.val !== '2' || d.unit !== '/ 4') bad.push(`shows ${d.val} ${d.unit}`); if (segs.length !== 4) bad.push(segs.length + ' segments for 4 slots'); if (!near(d.frac, 0.5, 0.002)) bad.push('ring ' + d.frac);
    if (segs.length === 4) { const col = segs.map((s) => s.style.stroke); if (col[0] === col[1] || !col[0] || !col[1]) bad.push('slots 1 and 2 share a colour ' + col); if (segs[2].classList.contains('sg') && !segs[2].classList.contains('e') || !segs[3].classList.contains('e')) bad.push('empty slots are not drawn empty'); }
    if (d.state !== 'ok') bad.push('not full but ' + d.state);
    S().carry.push({ sp: 3, vr: 0 }, { sp: 3, vr: 0 }); g.ui.setCarry(S().carry, 4); d = D('carry'); if (d.state !== 'warn' || d.sub !== 'FULL') bad.push('full: ' + JSON.stringify([d.state, d.sub]));
    // more slots than segments: they share
    S().carry = []; g.ui.setCarry([], 100); if (el('dial-carry').querySelectorAll('.sg').length !== 40) bad.push('100 slots should draw 40 segments');
    S().carry = []; g.T.carry = g.tune().carry; g.ui.setCarry(S().carry, g.T.carry); if (D('carry').state !== 'ok' || !D('carry').dim) bad.push('an empty bag should be calm and dim');
    return bad.length === 0 || bad.join('; ');
  });

  await T('hud.cart-dial-appears-with-a-cart-and-shows-load-and-mode', async () => {
    fresh({ cart: 1 }); bay(); const bad = []; S().cart = null; hud(); if (D('cart').on) bad.push('cart dial without a cart');
    g.ui.setCartLine(3, 10, 'follow'); let d = D('cart'); if (!d.on || d.val !== '3' || d.unit !== '/ 10' || d.sub !== 'following' || !near(d.frac, 0.3, 0.002) || d.state !== 'ok') bad.push('following ' + JSON.stringify(d));
    g.ui.setCartLine(10, 10, 'park'); d = D('cart'); if (d.sub !== 'parked' || d.state !== 'warn') bad.push('full and parked ' + JSON.stringify([d.sub, d.state]));
    g.ui.setCartLine(-1, 0, ''); if (D('cart').on) bad.push('the dial stays after the cart is gone');
    return bad.length === 0 || bad.join('; ');
  });

  // ------------------------------------------------------------------------------------------------ the right group
  await T('hud.signal-dial-needs-the-squeak-ear-and-each-tier-adds-one-thing', async () => {
    fresh({ compass: 1 }); const real = g.needlePos; let np = null; const bad = [];
    g.needlePos = () => np;
    try {
      for (let l = 0; l <= 4; l++) {
        S().up.scan = l; g.T = g.tune(); bay(); adv(0.1); const cam = g.renderer.camera.position; const at = (d) => { np = { x: cam.x + d, y: cam.y, z: cam.z }; };
        at(R_SCAN[l] * 1.1 + 1); hud(); let d = D('signal');
        if (l < 2) { if (d.on) bad.push(`tier ${l}: dial shown`); continue; }
        if (!d.on || d.val !== 'no signal' || !d.dim || d.rot !== null) bad.push(`tier ${l} out of range: ` + JSON.stringify([d.on, d.val, d.dim, d.rot]));
        at(R_SCAN[l] * 0.9); hud(); d = D('signal'); if (!d.on || d.dim) bad.push(`tier ${l} in range: ` + JSON.stringify([d.on, d.dim]));
        if ((l >= 3) !== (d.rot !== null)) bad.push(`tier ${l}: arrow ${d.rot}`); if ((l >= 4) !== /^\d+ m/.test(d.val)) bad.push(`tier ${l}: text "${d.val}"`); if (d.state !== 'ok') bad.push(`tier ${l}: far signal is ${d.state}`);
        at(R_SCAN[l] * 0.1); hud(); d = D('signal'); if (d.state !== 'hot') bad.push(`tier ${l}: close signal is ${d.state}`); if (d.frac < 0.8) bad.push(`tier ${l}: ring ${d.frac} up close`);
        if (l >= 3) { // the arrow points at it: the needle is straight ahead along +x, we face +x
          p().yaw = Math.PI / 2; at(R_SCAN[l] * 0.5); hud(); const a = D('signal').rot; const want = (p().yaw - Math.atan2(np.x - p().pos.x, np.z - p().pos.z)) * 180 / Math.PI - 90; if (Math.abs(((a - want + 540) % 360) - 180) > 1) bad.push(`tier ${l}: arrow ${a} want ${want.toFixed(0)}`);
        }
      }
    } finally { g.needlePos = real; }
    return bad.length === 0 || bad.join('; ');
  });

  await T('hud.vein-dial-needs-the-assay-and-points-from-level-2', async () => {
    fresh({}); bay(); const bad = []; let vv = 0.2; const real = w().veinAt; w().veinAt = () => vv;
    try {
      vv = 0.95; hud(); if (D('vein').on) bad.push('shown without the upgrade');
      for (const lvl of [1, 2, 3]) {
        S().up.assay = lvl; g.T = g.tune(); bay(); g._veinNext = 0; vv = 0.2; hud(); let d = D('vein'); if (!d.on) { bad.push('level ' + lvl + ' hidden'); continue; }
        if ((lvl >= 2) !== (d.rot !== null)) bad.push(`level ${lvl}: pointer ${d.rot}`); if (d.state !== 'ok') bad.push(`level ${lvl}: poor ground is ${d.state}`);
        const lo = d.frac; vv = 0.98; hud(); d = D('vein'); if (!(d.frac > lo + 0.3)) bad.push(`level ${lvl}: ring ${lo} -> ${d.frac}`); if (d.state !== 'hot') bad.push(`level ${lvl}: rich ground is ${d.state}`); if (lvl === 1 && !/%$/.test(d.val)) bad.push('level 1 shows ' + d.val);
        if (lvl >= 2 && !/ m|no vein/.test(d.val)) bad.push(`level ${lvl}: pointer text "${d.val}"`);
      }
    } finally { w().veinAt = real; delete w().veinAt; }
    return bad.length === 0 || bad.join('; ');
  });

  await T('hud.depth-and-from-bay-dials-say-how-deep-and-how-far', async () => {
    fresh({}); const bad = []; const real = g.trackDepth;
    try {
      p().pos.set(0, 0, -1.4); g.trackDepth = () => 0; hud(); if (D('depth').on || D('range').on) bad.push('depth or range shown on the bay floor');
      p().pos.set(1500, 0, 0); g.trackDepth = () => 12.3; hud(); let d = D('depth'), r = D('range');
      if (!d.on || d.val !== '12' || d.unit !== 'm' || d.label !== 'BURIED') bad.push('depth ' + JSON.stringify([d.on, d.val, d.unit, d.label])); if (!near(d.frac, 12.3 / 43, 0.01)) bad.push('depth ring ' + d.frac);
      if (!r.on || r.val !== '1.50' || r.unit !== 'km' || !/^EXIT 3\.\d\d km$/.test(r.sub)) bad.push('range ' + JSON.stringify([r.on, r.val, r.unit, r.sub])); if (!near(r.frac, 1500 / EXIT_X, 0.01)) bad.push(`range ring ${r.frac} want ${1500 / EXIT_X}`);
      p().pos.set(200, 0, 0); g.trackDepth = () => 0; hud(); r = D('range'); if (!r.on || r.val !== '200' || r.unit !== 'm' || r.sub !== '') bad.push('200 m: ' + JSON.stringify([r.val, r.unit, r.sub]));
      p().pos.set(100, 30, 0); hud(); d = D('depth'); if (!d.on || d.label !== 'ALTITUDE' || d.val !== '30') bad.push('altitude ' + JSON.stringify([d.on, d.label, d.val]));
      // everything the old line said is still readable
      p().pos.set(1500, 0, 0); g.trackDepth = () => 12.3; hud(); const t = g.ui._depthTxt; if (!/BURIED 12\.3 m/.test(t) || !/1\.50 km FROM BAY/.test(t) || !/EXIT 3\.\d\d km/.test(t)) bad.push('text ' + t); if (!/1\.50 km from the bay, exit/.test(el('dial-range').getAttribute('aria-label'))) bad.push('aria ' + el('dial-range').getAttribute('aria-label'));
    } finally { g.trackDepth = real; delete g.trackDepth; }
    return bad.length === 0 || bad.join('; ');
  });

  await T('hud.survey-dials-need-the-survey-and-turn-amber-then-red', async () => {
    fresh({ timber: 1, steel: 1 }); const bad = []; p().pos.set(200, 0, 30); p().vel.set(0, 0, 0); hud();
    if (['frame', 'support', 'stale'].some((id) => D(id).on)) bad.push('survey dials without the upgrade');
    S().up.survey = 1; g.T = g.tune(); hud();
    let f = D('frame'); const depth = Math.round(Math.hypot(200, 30));
    if (!f.on || f.val !== String(depth) || f.unit !== 'm deep' || f.state !== 'ok') bad.push('frame ' + JSON.stringify([f.on, f.val, f.unit, f.state])); if (!/Steel Frame 380 m/.test(f.sub) || !/pile \d+ m, x\d\.\d/.test(f.sub)) bad.push('frame line ' + f.sub);
    if (!near(f.frac, depth / 380, 0.005)) bad.push('frame ring ' + f.frac); if (f.info.depth !== `${depth} m DEEP` || !/Steel Frame \(rated 380 m\)/.test(f.info.best) || !/m of pile above/.test(f.info.press)) bad.push('full text ' + JSON.stringify(f.info));
    p().pos.set(350, 0, 0); hud(); f = D('frame'); if (f.state !== 'warn' || !/NEAR LIMIT/.test(f.sub)) bad.push('near the limit: ' + JSON.stringify([f.state, f.sub]));
    p().pos.set(500, 0, 0); hud(); f = D('frame'); if (f.state !== 'crit' || !/TOO WEAK/.test(f.sub) || f.frac !== 1) bad.push('past the limit: ' + JSON.stringify([f.state, f.sub, f.frac]));
    // stale air: nothing at the surface, a fan every so many metres deep down
    p().pos.set(100, 0, 0); hud(); let s = D('stale'); if (!s.on || s.state !== 'ok' || s.sub !== 'fresh') bad.push('fresh air ' + JSON.stringify([s.on, s.state, s.sub]));
    p().pos.set(500, 0, 0); hud(); s = D('stale'); if (s.state !== 'warn' || !/^fan every \d+ m$/.test(s.sub) || !near(s.frac, 350 / 900, 0.005)) bad.push('stale at 500 m ' + JSON.stringify([s.state, s.sub, s.frac]));
    p().pos.set(980, 0, 0); hud(); s = D('stale'); if (s.state !== 'crit') bad.push('stale at 980 m ' + s.state);
    // support load, as the survey reports it (the numbers come from the load trace: qa.assay tests that side)
    const set = (r, cls) => g.ui.setSurvey(true, { depth: '1 m DEEP', best: 'x', press: 'y', air: 'z', load: r === null ? 'no support within 8 m' : `nearest support: ${Math.round(r * 100)}% load`, cls, n: { depth: 1, best: null, pile: 'pile 0 m, x1.0', loadR: r, stale: 0, fan: null } });
    set(null, ''); let u = D('support'); if (!u.on || u.val !== '--' || !u.dim || u.sub !== 'none within 8 m') bad.push('no support ' + JSON.stringify([u.val, u.dim, u.sub]));
    set(0.5, ''); u = D('support'); if (u.val !== '50%' || u.state !== 'ok' || u.dim || !near(u.frac, 0.5, 0.002)) bad.push('50% ' + JSON.stringify([u.val, u.state, u.frac]));
    set(0.9, 'amber'); if (D('support').state !== 'warn') bad.push('90% ' + D('support').state); set(0.99, 'red'); if (D('support').state !== 'crit') bad.push('99% ' + D('support').state);
    set(1.7, 'red'); u = D('support'); if (u.frac !== 1 || u.val !== '170%') bad.push('overload ' + JSON.stringify([u.frac, u.val]));
    S().up.survey = 0; g.T = g.tune(); hud(); if (['frame', 'support', 'stale'].some((id) => D(id).on)) bad.push('survey dials stay after the upgrade is gone');
    return bad.length === 0 || bad.join('; ');
  });

  await T('hud.clock-dial-needs-the-helmet-and-shows-time-day-and-open-or-closed', async () => {
    fresh({}); const bad = []; S().gear = { ...(S().gear || {}), helmet: 0 };
    try {
      S().gameMin = 3180; g._clkT = 0;   // day 3, 12:00 (the day starts at 07:00) g.updateClock(0.1); if (D('clock').on) bad.push('clock without the helmet'); if (D('clock').label !== 'DAY 3') bad.push('day label ' + D('clock').label);
      S().gear.helmet = 1; g._clkT = 0; g.updateClock(0.1); let d = D('clock'); if (!d.on) return 'clock hidden with the helmet';
      if (d.val !== '12:00' || d.label !== 'DAY 3') bad.push('noon ' + JSON.stringify([d.val, d.label]));
      const mk = el('dial-clock').querySelector('.mk'); const cy = +mk.getAttribute('cy'); if (!(cy > 55)) bad.push('the sun should be at the bottom of the ring at 12:00, cy ' + cy);
      g.ui.setClock(0, false, true); d = D('clock'); const cy0 = +mk.getAttribute('cy'); if (!(cy0 < 10)) bad.push('midnight marker cy ' + cy0); if (d.state !== 'closed') bad.push('closed state ' + d.state);
      g.ui.setClock(6 * 60 + 30, true, true); if (D('clock').state !== 'ok' || D('clock').sub !== 'OPEN' || D('clock').val !== '06:30') bad.push('open ' + JSON.stringify(D('clock')));
      if (!/DAY 3 06:30, open/.test(el('dial-clock').getAttribute('aria-label')) && !/DAY 3: DAY 3 06:30, open/.test(el('dial-clock').getAttribute('aria-label'))) bad.push('aria ' + el('dial-clock').getAttribute('aria-label'));
    } finally { S().gear.helmet = 0; S().gameMin = 10; }
    return bad.length === 0 || bad.join('; ');
  });

  // ------------------------------------------------------------------------------------------------ layout
  const cssText = () => { const out = []; for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) out.push(r.cssText); } catch (e) { /* a sheet from another site */ } } return out.join('\n'); };
  const probe = (W, H) => new Promise((resolve, reject) => {
    const f = document.createElement('iframe'); f.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;border:0;visibility:hidden;pointer-events:none;z-index:-1`;
    const compass = el('topcenter').outerHTML.replace('id="compass" class="hidden"', 'id="compass"');
    f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>${cssText()}</style></head><body><div id="hud">${compass}${el('belt').outerHTML}${el('lungWarn').outerHTML.replace(/class="[^"]*"/, 'class="s3"')}${el('tileInfo').outerHTML.replace(/class="[^"]*"/, 'class=""')}</div></body></html>`;
    f.onload = () => resolve(f); f.onerror = () => reject(new Error('probe failed')); document.body.appendChild(f);
  });
  const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const SIZES = [[360, 640], [412, 915], [768, 1024], [1024, 768], [1280, 720], [1920, 1080], [3840, 2160]];
  await T('hud.dials-never-overlap-the-hotbar-hint-compass-or-each-other-from-phone-to-4k', async () => {
    const bad = [];
    for (const [W, H] of SIZES) {
      const f = await probe(W, H); const doc = f.contentDocument, win = f.contentWindow;
      try {
        const q = (s) => doc.querySelector(s), all = (s) => [...doc.querySelectorAll(s)];
        // every dial on, with the longest lines they can show
        const long = ['Steel Frame 380 m NEAR LIMIT\npile 120 m, x2.4', 'fan every 33 m', 'nearest support', 'EXIT 3.67 km', 'following', 'COUGHING', 'BROWNOUT', 'FULL', 'SUFFOCATING', 'OPEN', 'none within 8 m'];
        all('.dial').forEach((d, n) => { d.classList.remove('hidden'); const dd = d.querySelector('.dd'); dd.classList.remove('none'); dd.textContent = long[n % long.length]; d.querySelector('.v').textContent = ['1.50', '07:00', 'no signal', '123 m ▲ 45', '100%', '24'][n % 6]; d.querySelector('.v').dataset.l = ['m', 'm', 'l', 'x', 'm', 's'][n % 6]; });
        q('#hotbar').innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<div class="slot ${i === 1 ? 'sel' : ''}"><span class="k">${i}</span>⛏<span class="l">HAMMER</span><span class="c">99</span></div>`).join('');
        q('#hotbarHint').innerHTML = '<kbd>Q</kbd> put away · same number again also puts it away · <kbd>I</kbd> inventory';
        q('#hint').innerHTML = 'A long hint that runs over three lines when the screen is narrow: press <kbd>B</kbd> to set the part down, <kbd>Q</kbd> to put it away and <kbd>E</kbd> to open the panel on it.'; q('#hint').style.opacity = 1;
        doc.documentElement.style.setProperty('--center-h', q('#bottom').offsetHeight + 'px'); doc.documentElement.style.setProperty('--belt-h', q('#belt').offsetHeight + 14 + 'px');
        q('#lungStage').textContent = 'WHEEZING: GET TO CLEAN AIR'; q('#lungEta').textContent = 'passing out in about 8 s'; q('#tiTitle').textContent = 'GENERATOR'; q('#tiLines').innerHTML = '<div>Generator</div><div>Burning a Rare plush</div><div>Fuel 3 of 50</div>';
        const tag = `${W}x${H}`; if (win.innerWidth !== W) bad.push(`${tag}: the probe is ${win.innerWidth} wide`);
        const dials = all('.dial').map((d) => ({ id: d.dataset.dial, r: d.getBoundingClientRect(), ring: d.querySelector('.ring').getBoundingClientRect() }));
        const bar = q('#hotbar').getBoundingClientRect(), hh = q('#hotbarHint').getBoundingClientRect(), hint = q('#hint').getBoundingClientRect(), comp = q('#compass').getBoundingClientRect();
        for (const id of ['lungWarn', 'tileInfo']) { const r = q('#' + id).getBoundingClientRect(); if (r.height < 5) { bad.push(`${W}x${H}: ${id} did not show`); continue; } for (const d of dials) if (hit(d.r, r)) bad.push(`${W}x${H}: ${id} overlaps the ${d.id} dial`); if (hit(r, hint)) bad.push(`${W}x${H}: ${id} overlaps the hint`); if (hit(r, bar)) bad.push(`${W}x${H}: ${id} overlaps the hotbar`); }
        for (const d of dials) {
          if (d.r.width < 10 || d.r.height < 10) { bad.push(`${tag}: ${d.id} has no size`); continue; }
          if (hit(d.r, bar)) bad.push(`${tag}: ${d.id} overlaps the hotbar`); if (hit(d.r, hh)) bad.push(`${tag}: ${d.id} overlaps the hotbar hint`); if (hit(d.r, hint)) bad.push(`${tag}: ${d.id} overlaps the hint`); if (hit(d.r, comp)) bad.push(`${tag}: ${d.id} overlaps the compass`);
          if (d.r.left < -0.5 || d.r.right > W + 0.5 || d.r.top < 0 || d.r.bottom > H + 0.5) bad.push(`${tag}: ${d.id} leaves the screen ${[d.r.left, d.r.top, d.r.right, d.r.bottom].map(Math.round)}`);
          if (W >= 1180) { const left = q('#dialsL').contains(doc.getElementById('dial-' + d.id)); if (left ? d.r.right > bar.left + 0.5 : d.r.left < bar.right - 0.5) bad.push(`${tag}: ${d.id} is not beside the hotbar`); } else if (d.r.bottom > bar.top + 0.5 && d.r.bottom > hh.top) bad.push(`${tag}: ${d.id} is not above the hotbar`);
        }
        for (let a = 0; a < dials.length; a++) for (let b = a + 1; b < dials.length; b++) if (hit(dials[a].r, dials[b].r)) bad.push(`${tag}: ${dials[a].id} overlaps ${dials[b].id}`);
        if (hit(hint, bar) || hit(hint, hh)) bad.push(`${tag}: the hint overlaps the hotbar`);
        if (bar.left < -0.5 || bar.right > W + 0.5 || bar.bottom > H + 0.5) bad.push(`${tag}: the hotbar leaves the screen ${[bar.left, bar.right].map(Math.round)}`);
        if (hint.left < -0.5 || hint.right > W + 0.5) bad.push(`${tag}: the hint leaves the screen`);
        if (doc.documentElement.scrollWidth > W) bad.push(`${tag}: page scrolls sideways (${doc.documentElement.scrollWidth})`);
        const slot = q('#hotbar .slot').getBoundingClientRect(); if (slot.width < 28) bad.push(`${tag}: slots only ${slot.width.toFixed(0)} px`);
        const topmost = Math.min(...dials.map((d) => d.r.top), hint.top); if (topmost < comp.bottom - 0.5 && W < 1180 && H < 700) bad.push(`${tag}: the dials climb into the compass band (${topmost.toFixed(0)} < ${comp.bottom.toFixed(0)})`);
        const ring = dials[0].ring; if (W >= 3000 ? ring.width < 80 : W < 700 ? ring.width < 40 : ring.width < 54) bad.push(`${tag}: dials are ${ring.width.toFixed(0)} px`);
      } finally { f.remove(); }
    }
    return bad.length === 0 || bad.slice(0, 12).join('; ');
  });

  await T('hud.the-real-belt-fits-this-window-and-keeps-the-hint-clear', async () => {
    fresh({ airmon: 1, survey: 1, timber: 1, steel: 1, assay: 3, scan: 5, compass: 1, cart: 1, power: 1 }); const bad = []; S().gear = { ...(S().gear || {}), helmet: 1 }; g.T = g.tune();
    try {
      p().pos.set(900, 0, 6); g.hp = 20; g.hurtT = 0; g.dust.level = 0.6; g.dust.lung = 0.7; g.ui.setCartLine(2, 10, 'park'); g.ui.hint('Test hint: <kbd>B</kbd> sets it down.', 30); hud(); g.ui.hint('Test hint: <kbd>B</kbd> sets it down.', 30);
      g.ui.setClock(g.dayMinute(), true, true);
      const bar = el('hotbar').getBoundingClientRect(), hint = el('hint').getBoundingClientRect(), hh = el('hotbarHint').getBoundingClientRect(); let n = 0;
      const dials = [...document.querySelectorAll('#belt .dial:not(.hidden)')].map((d) => ({ id: d.dataset.dial, r: d.getBoundingClientRect() }));
      for (const d of dials) { n++; if (hit(d.r, bar) || hit(d.r, hh) || hit(d.r, hint)) bad.push(d.id + ' overlaps'); if (d.r.left < 0 || d.r.right > innerWidth || d.r.top < 0 || d.r.bottom > innerHeight) bad.push(d.id + ' off screen'); }
      for (let a = 0; a < dials.length; a++) for (let b = a + 1; b < dials.length; b++) if (hit(dials[a].r, dials[b].r)) bad.push(dials[a].id + ' on ' + dials[b].id);
      if (hit(hint, bar) || hit(hint, hh)) bad.push('the hint is on the hotbar'); if (n < 8) bad.push('only ' + n + ' dials were showing');
      window.dispatchEvent(new Event('resize')); const ch = getComputedStyle(document.documentElement).getPropertyValue('--center-h'); if (Math.abs(parseFloat(ch) - el('bottom').offsetHeight) > 1) bad.push(`--center-h ${ch} vs ${el('bottom').offsetHeight}`);
      // floating readouts from other systems stay off the belt too
      for (const id of ['pwMeterHud', 'railHud']) { const e = el(id); if (e && e.style.display !== 'none') { const r = e.getBoundingClientRect(); for (const d of dials) if (hit(d.r, r)) bad.push(`${id} overlaps ${d.id}`); } }
    } finally { S().gear = { ...(S().gear || {}), helmet: 0 }; g.hp = 100; g.dust.level = 0; g.dust.lung = 0; g.ui.hint('', 0); }
    return bad.length === 0 || bad.join('; ');
  });

  await T('hud.the-belt-hides-behind-the-pause-menu-and-any-other-modal', async () => {
    fresh({}); const bad = []; const belt = el('belt'); const vis = () => getComputedStyle(belt).visibility;
    if (vis() !== 'visible') bad.push('belt not visible in play: ' + vis());
    g.ui.open('pause'); if (vis() !== 'hidden') bad.push('belt shows through the pause menu'); g.ui.closeModalsSilently(); if (vis() !== 'visible') bad.push('belt stays hidden after the menu');
    for (const id of ['shop', 'inv', 'dex']) { g.ui.open(id); if (vis() !== 'hidden') bad.push('belt shows through ' + id); g.ui.closeModalsSilently(); }
    const m = document.createElement('div'); m.className = 'modal'; document.body.appendChild(m); if (vis() !== 'hidden') bad.push('belt shows through a modal that the UI does not know about'); m.remove(); if (vis() !== 'visible') bad.push('belt hidden without a modal');
    return bad.length === 0 || bad.join('; ');
  });

  await T('hud.updating-a-dial-with-the-same-value-does-not-touch-the-page', async () => {
    fresh({}); bay(); hud(); const hp = el('dial-hp'); let changes = 0; const mo = new MutationObserver((l) => { changes += l.length; }); mo.observe(hp, { attributes: true, childList: true, subtree: true, characterData: true });
    for (let n = 0; n < 20; n++) { g.hp = 100; hud(); }
    await Promise.resolve(); const left = mo.takeRecords().length; mo.disconnect(); return (changes + left === 0) || `${changes + left} DOM changes for 20 identical updates`;
  });

  // ------------------------------------------------------------------------------------------------ multiplayer
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const fakeRemote = (pos) => ({ pos, update() {}, lampOn: false, yaw: 0, pitch: 0 });
  await T('mp.hud.a-guest-sees-the-hosts-grid-on-the-dial-and-its-own-gauges', async () => {
    const K = makeKit(ctx); const bad = []; let sent = []; const savedNets = [g.power.nets, g.power.netById];
    K.reset(); bay(); K.grid(2, 3, { gens: 1, fans: 3 }); adv(1.5); p().pos.set(2, 0, 2.4);
    try {
      // the host: its own grid, and the dyn row it sends the friend
      role('host'); g.netSend = (m) => { sent.push(json(m)); }; g.remote = fakeRemote(new V3(2, 0, 3.4)); hud(); g.sendDyn(); const dyn = sent.find((m) => m.t === 'dyn'); if (!dyn || !dyn.grid) return 'no grid in the dyn row';
      const host = D('grid'); if (!host.on) return 'the host dial is hidden beside its grid';
      delete g.netSend; role(null); g.remote = null; g.netOut.length = 0;
      // the guest: no grid of its own, the one in the row; its own hp, air, bag and cart
      g.power.nets = []; g.power.netById = new Map(); role('guest'); g.netMessage(json(dyn)); S().carry = [{ sp: 5, vr: 0 }]; g.T.carry = 5; g.ui.setCarry(S().carry, 5); g.hp = 20; g.hurtT = 0; g.trapOn = true; g.trapFree = 0; g.airLeft = 12;
      S().cart = { id: 'gc', tier: 0, mode: 'follow', load: [{ sp: 3, vr: 0 }], x: 0, z: 0 }; hud();
      const gd = D('grid'); if (!gd.on) bad.push('the guest has no grid dial although the row carries one');
      for (const k of ['val', 'unit', 'sub', 'state', 'text']) if (gd[k] !== host[k]) bad.push(`grid ${k}: guest "${gd[k]}" host "${host[k]}"`); if (!near(gd.frac, host.frac, 0.002)) bad.push(`grid ring ${gd.frac} vs ${host.frac}`);
      if (D('hp').val !== '20' || D('hp').state !== 'crit') bad.push('the guest health dial ' + JSON.stringify(D('hp'))); if (!D('breath').on || D('breath').state !== 'crit') bad.push('the guest air dial ' + JSON.stringify(D('breath')));
      if (D('carry').val !== '1' || D('carry').unit !== '/ 5') bad.push('the guest bag ' + D('carry').val + D('carry').unit);
      if (!D('cart').on || D('cart').val !== '1') bad.push('the guest cart dial ' + JSON.stringify(D('cart')));
      // a tripped row shows as a red dial on the guest
      const row = json(dyn); row.grid.tripped = true; g.netMessage(row); hud(); if (D('grid').state !== 'crit' || D('grid').sub !== 'TRIPPED') bad.push('a tripped row: ' + JSON.stringify([D('grid').state, D('grid').sub]));
      // no row, no dial
      const none = json(dyn); none.grid = null; g.netMessage(none); hud(); if (D('grid').on) bad.push('the dial stays without a grid in the row');
    } finally {
      delete g.netSend; role(null); g.remote = null; g.netOut.length = 0; [g.power.nets, g.power.netById] = savedNets; g.guestGrid = null; g.hp = 100; g.trapOn = false; g.airLeft = undefined; g.trapFree = 0; S().cart = null; S().carry = []; K.reset();
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.hud.the-guests-survey-and-sensor-dials-follow-the-shared-upgrades', async () => {
    fresh({ timber: 1, steel: 1, survey: 1, airmon: 1, assay: 2, scan: 4, compass: 1, cart: 1 }); const bad = []; bay();
    try {
      role('guest'); p().pos.set(350, 0, 0); g.dust.hostLevel = 0.5; g.dust.level = 0.5; g.dust.lung = 0.4; hud();
      if (!D('frame').on || D('frame').state !== 'warn') bad.push('guest frame ' + JSON.stringify([D('frame').on, D('frame').state])); if (!D('stale').on) bad.push('guest stale-air dial');
      if (!D('dust').on || D('dust').state !== 'warn') bad.push('guest dust ' + JSON.stringify([D('dust').on, D('dust').state])); if (!D('vein').on || D('vein').rot === null) bad.push('guest vein dial');
      if (!/^FROM BAY$/.test(D('range').label) || !D('range').on) bad.push('guest range dial');
    } finally { role(null); g.dust.hostLevel = 0; g.dust.level = 0; g.dust.lung = 0; }
    return bad.length === 0 || bad.join('; ');
  });
  void toI; void toK; void cellX; void cellZ;
}
