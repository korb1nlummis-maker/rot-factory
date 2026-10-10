// guide.*: the Field Guide. The chalkboards that stood in the hall are gone; their pages (and the numbers on them, from the game data) live in src/guide.js
// and are shown by the Field Guide menu (F1, the title and pause menu buttons). The old board number tests are ported here, and the menu is driven for real.
import { fanSpacing, STALE_START } from '../dust.js';
import { earthTune, EARTH_KW, STALE_CHOKE } from '../earth.js';
import { CATEGORIES, guidePages, controlPages, pageText } from '../guide.js';
import { CONTROLS } from '../controls.js';
import * as KB from '../keybinds.js';
const OLD_TITLES = ['RULES OF THE SHIFT', 'HOW DEEP CAN IT GO?', 'AIR AT DEPTH', 'HOW FANS WORK', 'SURVIVING THE DEPTH', 'TUNNEL CRAFT', 'POWER NEEDS WIRES', 'EARTH MOVERS', 'TUNNELS AND PORTALS', 'STACKED BUILDING', 'BELTS AND HOSE', 'BOTS AND THE CREW', 'SLIDES AND AVALANCHES', 'CARE AND NIGHT SHIFT'];
export default async function (ctx) {
  const { T, g, FRAME_TYPES, fresh, adv } = ctx;
  const $ = (id) => document.getElementById(id);
  const find = (re) => guidePages().find((x) => re.test(x.title));
  const key = (code, extra = {}, target = window) => { target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...extra })); target.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true })); };
  const bad0 = /[—–]|undefined|NaN/;
  const shut = () => { g.ui.closeModals(); $('guideSearch').value = ''; g.keys = {}; };

  await T('guide.no-chalkboards-in-the-hall-and-the-guide-has-the-same-pages', async () => {
    const boards = []; g.renderer.scene.traverse((o) => { if (o.name === 'chalkboard') boards.push(o); });
    const bad = []; if (boards.length) bad.push(`${boards.length} chalkboards still in the scene`); if (g.hall.boards || g.hall.controlBoards) bad.push('hall still lists boards');
    if (g.hall.colliders.some((c) => c.r === 0.75 && c.h === 2.4)) bad.push('a board collider is left in the hall');
    const have = guidePages().filter((x) => !x.controls).map((x) => x.title); if (have.join('|') !== OLD_TITLES.join('|')) bad.push('pages: ' + have.join(' | '));
    return bad.length === 0 || bad.join('; ');
  });
  await T('guide.categories-and-pages-exist-in-order-and-every-page-has-one', async () => {
    const bad = [], pages = guidePages(); if (CATEGORIES[0] !== 'How to Play') bad.push('How to Play is not first'); for (const w of ['Getting Started', 'Digging and Support', 'Air and Depth', 'Machines and Power', 'Belts and Hoses', 'Crew and Bots', 'Hazards', 'Gear and Upgrades', 'Controls']) if (!CATEGORIES.includes(w)) bad.push('no category ' + w);
    for (const p of pages) if (!CATEGORIES.includes(p.cat)) bad.push(`${p.title} has category ${p.cat}`);
    for (const c of CATEGORIES.slice(1)) if (!pages.some((p) => p.cat === c)) bad.push('empty category ' + c);
    return bad.length === 0 || bad.join('; ');
  });
  await T('guide.every-page-fits-and-has-clean-text', async () => {
    const bad = []; for (const b of guidePages()) { if (b.overflow) bad.push(b.title + ' has a line that is too long'); if (bad0.test(pageText(b))) bad.push(b.title + ' has bad text'); if (!b.rows.length) bad.push(b.title + ' has no rows'); } return bad.length === 0 || bad.join('; ');
  });
  await T('guide.depth-page-lists-every-support-with-its-real-rating', async () => {
    const b = find(/HOW DEEP/); if (!b) return 'no depth page'; const t = pageText(b), bad = [];
    for (const f of Object.values(FRAME_TYPES)) { if (!t.includes(f.name)) bad.push('missing ' + f.name); else if (isFinite(f.maxDepth)) { const shown = f.maxDepth >= 1000 ? (f.maxDepth / 1000).toFixed(f.maxDepth % 1000 ? 1 : 0) + ' km' : f.maxDepth + ' m'; const row = b.rows.find((r) => Array.isArray(r) && r[0] === f.name); if (!row || !row[1].startsWith(shown)) bad.push(f.name + ' shows ' + (row && row[1])); } }
    return bad.length === 0 || bad.join('; ');
  });
  await T('guide.air-page-numbers-are-the-real-fan-spacing', async () => {
    const b = find(/AIR AT DEPTH/); if (!b) return 'no air page'; const bad = [];
    for (const d of [400, 500, 600, 800, 1000, 1500]) { const row = b.rows.find((r) => Array.isArray(r) && r[0] === `at ${d} m deep`); const s = fanSpacing(d); const want = isFinite(s) ? `a fan every ${s.toFixed(s < 10 ? 1 : 0)} m` : 'no fan needed'; if (!row || row[1] !== want) bad.push(`${d} m: page says "${row && row[1]}", rule says "${want}"`); }
    if (!pageText(b).includes(String(STALE_START))) bad.push('start depth missing'); return bad.length === 0 || bad.join('; ');
  });
  await T('guide.fan-page-explains-direction-spacing-and-power', async () => {
    const b = find(/HOW FANS WORK/); if (!b) return 'no fan page'; const txt = JSON.stringify(b.rows) + b.foot, bad = [];
    for (const w of ['face deeper', 'spacing', 'No power', 'Reach 20 m', 'Vent Fan']) if (!txt.includes(w)) bad.push('missing ' + w); return bad.length === 0 || bad.join('; ');
  });
  await T('guide.tunnel-page-numbers-are-the-real-ones', async () => {
    const b = find(/TUNNELS AND PORTALS/); if (!b) return 'no tunnel page'; const t = pageText(b), bad = [];
    const { ARCH_SPANS } = await import('../loadtrace.js'), H = await import('../haul.js'), P = await import('../portal.js');
    for (const want of [`${H.CUBE_CLEAR.w} x ${H.CUBE_CLEAR.h} cells clear`, `${ARCH_SPANS[6].cw} x ${ARCH_SPANS[6].ch} clear, 85% depth`, `${ARCH_SPANS[8].cw} x ${ARCH_SPANS[8].ch} clear, 70% depth`, `${ARCH_SPANS[12].cw} x ${ARCH_SPANS[12].ch} clear, 55% depth`, `${H.VEHICLES.truck.w} x ${H.VEHICLES.truck.h} clear`, `${H.VEHICLES.wheel.w} x ${H.VEHICLES.wheel.h} clear`, `Portal ${P.KW[6]} / ${P.KW[8]} / ${P.KW[12]} kW`, `Roads ${H.ROAD.speed}x`, `Docks ${H.DOCK.charge} kW`]) if (!t.includes(want)) bad.push('missing "' + want + '"');
    return bad.length === 0 || bad.join('; ');
  });
  await T('guide.earth-mover-page-numbers-are-the-real-ones', async () => {
    const b = find(/EARTH MOVERS/); if (!b) return 'no earth mover page'; const t = pageText(b), bad = [];
    const T0 = ctx.computeTuning({}, null), ex = earthTune(T0, 'excavator'), wh = earthTune(T0, 'wheel'), tk = earthTune(T0, 'truck'), dz = earthTune(T0, 'dozer');
    for (const want of [`${2 * ex.latHalf + 1} x ${ex.vert} face, ${ex.hopper} hopper`, `${2 * wh.latHalf + 1} x ${wh.vert} face, ${wh.hopper} hopper`, `${dz.blade} wide blade`, `${tk.bed} plush, ${tk.range} m radio`, `${EARTH_KW.excavator} kW`, `${EARTH_KW.wheel}`]) if (!t.includes(want)) bad.push('missing ' + want);
    const choke = Math.round(STALE_START + STALE_CHOKE * 900); if (!t.includes(`Past ${choke} m`)) bad.push('stale depth ' + choke);
    return bad.length === 0 || bad.join('; ');
  });
  await T('guide.refreshed-pages-name-the-features-with-the-real-numbers', async () => {
    const bad = [], need = (b, name, wants) => { if (!b) { bad.push('no ' + name + ' page'); return; } const t = pageText(b); for (const w of wants) if (!t.includes(w)) bad.push(`${name}: missing "${w}"`); };
    const BI = await import('../beltintake.js'), { WEDGE } = await import('../wedge.js'), CM = await import('../carepackage.js'), { LOW_BATTERY } = await import('../crew.js'), PW = await import('../power.js'), { upgradeById } = await import('../upgrades.js');
    need(find(/BELTS AND HOSE/), 'belts', [`${BI.RATE[0]} plush a second within ${BI.RANGE[0]} m`, `up to ${BI.RATE[7]} a second, ${BI.RANGE[7]} m`, 'loose plush within 3.5 m', 'twice as fast as a belt', 'gold', 'One cable on any tile']);
    need(find(/BOTS AND THE CREW/), 'bots', [`Under ${Math.round(LOW_BATTERY * 100)}%`, `A ${PW.DEMAND.charger} kW machine`, 'needs a cable', 'Fuel duty', 'Keep machines fueled']);
    need(find(/SLIDES AND AVALANCHES/), 'slides', [`Over ${WEDGE.H_HIGH} m, steep`, `${WEDGE.H_MIN} to ${WEDGE.H_HIGH} m up`, 'Rope Anchor', 'Climbing Gear', 'R or right click', 'Space punches up']);
    need(find(/CARE AND NIGHT SHIFT/), 'care', [`every ${CM.CARE.DAYS} game days`, `${upgradeById('nightshift').cost[0] / 1e6}M`, 'red button', 'J, the achievements screen', '19:00']);
    need(find(/POWER NEEDS WIRES/), 'power', ['Charging Station', `Common ${PW.BURN_SECONDS[0] / 60}, Uncommon ${PW.BURN_SECONDS[1] / 60}, Rare ${PW.BURN_SECONDS[2] / 60}, Epic ${PW.BURN_SECONDS[3] / 60} min`]);
    return bad.length === 0 || bad.join('; ');
  });
  await T('guide.controls-pages-are-the-key-table-with-the-current-bindings', async () => {
    const bad = [], was = KB.binds('medkit'); const pages = controlPages();
    const check = () => { for (const gr of CONTROLS) { const p = controlPages().find((x) => x.title === 'CONTROLS: ' + gr.group.toUpperCase()); if (!p) { bad.push('no page for ' + gr.group); continue; } if (p.rows.length !== gr.rows.length) bad.push(`${gr.group}: ${p.rows.length} rows, table has ${gr.rows.length}`); gr.rows.forEach((r, i) => { const row = p.rows[i]; if (!row || row[1] !== r.name) bad.push(`${gr.group} row ${i}: ${row && row[1]} is not ${r.name}`); else if (r.name !== 'Hotbar slots 1 to 9' && row[0] !== r.chips.map((c) => c.label).join(' or ')) bad.push(`${r.name}: shows ${row[0]}`); }); } };
    if (pages.length !== KB.GROUPS.length) bad.push(pages.length + ' pages for ' + KB.GROUPS.length + ' groups'); check();
    try { const r = KB.setBinds('medkit', ['KeyK', 'Digit0']); if (!r.ok) bad.push('could not rebind: ' + r.why); const row = controlPages().flatMap((p) => p.rows).find((x) => x[1] === KB.ACTION_BY_ID.medkit.name); if (!row || row[0] !== 'K or 0') bad.push('a rebound key is not shown: ' + (row && row[0])); } finally { KB.resetBinds('medkit'); void was; }
    check(); const gr = controlPages().flatMap((p) => p.rows).find((x) => x[1] === KB.ACTION_BY_ID.guide.name); if (!gr || gr[0] !== 'F1') bad.push('the Field Guide key is not in the Controls pages');
    return bad.length === 0 || bad.join('; ');
  });
  await T('guide.opens-with-the-key-and-the-buttons-shows-the-first-category', async () => {
    fresh({}); const bad = [];
    try {
      key('F1'); if (g.ui.openModal !== 'guide' || $('guide').classList.contains('hidden')) bad.push('F1 did not open it: ' + g.ui.openModal);
      const on = $('guideCats').querySelector('.on'); if (!on || on.textContent !== 'How to Play') bad.push('first category is ' + (on && on.textContent)); if ($('guidePage').querySelectorAll('h3').length < 5) bad.push('How to Play is not shown');
      if (!/Power travels only through cables/.test($('guidePage').textContent)) bad.push('the How to Play text is missing');
      if ($('guideCats').querySelectorAll('button').length !== CATEGORIES.length) bad.push('category buttons: ' + $('guideCats').querySelectorAll('button').length);
      key('F1'); if (g.ui.openModal) bad.push('F1 again did not close it');
      g.ui.open('pause'); $('btnGuide2').click(); if (g.ui.openModal !== 'guide') bad.push('the pause menu button: ' + g.ui.openModal); shut();
      g.ui.open('howto'); $('btnGuide3').click(); if (g.ui.openModal !== 'guide') bad.push('the How to Play button: ' + g.ui.openModal); shut();
      $('btnGuide').click(); if (g.ui.openModal !== 'guide') bad.push('the title button: ' + g.ui.openModal); shut();
      for (const id of ['btnGuide', 'btnGuide2']) if (!/field guide/i.test($(id).textContent)) bad.push(id + ' says ' + $(id).textContent); if (!/F1/.test($('title').textContent)) bad.push('the title does not name F1');
    } finally { shut(); }
    return bad.length === 0 || bad.join('; ');
  });
  await T('guide.shows-the-selected-category-and-the-keyboard-moves-and-escape-closes', async () => {
    fresh({}); const bad = [], cur = () => { const o = $('guideCats').querySelector('.on'); return o ? o.dataset.gcat : null; };
    try {
      g.ui.open('guide'); [...$('guideCats').querySelectorAll('button')].find((b) => b.dataset.gcat === 'Air and Depth').click();
      const t = $('guidePage').textContent; if (cur() !== 'Air and Depth' || !/AIR AT DEPTH/.test(t) || !/HOW FANS WORK/.test(t) || !/a fan every/.test(t)) bad.push('Air and Depth page: ' + t.slice(0, 80));
      if ($('guidePage').querySelectorAll('.gr').length < 8 || !$('guidePage').querySelector('.gh') || !$('guidePage').querySelector('.gf')) bad.push('two columns, headings or the foot are missing');
      key('ArrowDown'); if (cur() !== 'Machines and Power') bad.push('Down went to ' + cur()); key('ArrowUp'); key('ArrowUp'); if (cur() !== 'Digging and Support') bad.push('Up went to ' + cur());
      g.ui.guideSelect('How to Play'); key('ArrowUp'); if (cur() !== 'Controls') bad.push('Up from the first did not wrap: ' + cur());
      const ctl = $('guidePage').textContent; if (!/CONTROLS: MOVING/.test(ctl) || !/Walk forward/.test(ctl)) bad.push('Controls page is not shown');
      key('Escape'); if (g.ui.openModal) bad.push('Esc did not close it: ' + g.ui.openModal);
      // the search box
      g.ui.open('guide'); $('guideSearch').value = 'vent fan'; $('guideSearch').dispatchEvent(new Event('input')); const names = [...$('guideCats').querySelectorAll('button')].map((b) => b.dataset.gcat); if (!names.includes('Air and Depth') || names.includes('Controls')) bad.push('search shows ' + names.join(','));
      $('guideSearch').value = 'qqzzxx'; $('guideSearch').dispatchEvent(new Event('input')); if (!/Nothing/.test($('guidePage').textContent)) bad.push('no empty message');
      key('Escape', {}, $('guideSearch')); if (g.ui.openModal) bad.push('Esc in the search box did not close it');
    } finally { shut(); }
    return bad.length === 0 || bad.join('; ');
  });
  await T('guide.every-category-renders-clean-text', async () => {
    fresh({}); const bad = []; try { g.ui.open('guide'); for (const c of CATEGORIES) { g.ui.guideSelect(c); const t = $('guidePage').textContent; if (t.length < 100) bad.push(c + ' is nearly empty'); if (bad0.test(t)) bad.push(c + ' has bad text: ' + (t.match(bad0) || [''])[0]); } } finally { shut(); }
    return bad.length === 0 || bad.join('; ');
  });
  await T('guide.opening-it-keeps-play-state-clears-held-keys-and-never-pauses-the-world', async () => {
    fresh({}); const bad = [], mode = g.mode;
    try {
      g.keys = { KeyW: true, ShiftLeft: true }; key('F1'); if (g.mode !== mode) bad.push('mode ' + g.mode); if (g.keys.KeyW || g.keys.ShiftLeft) bad.push('held keys not cleared');
      const t0 = g.S.stats.playSecs; adv(1); if (!(g.S.stats.playSecs > t0)) bad.push('the world stopped while it was open (co-op host would freeze)');
      key('Escape'); if (g.ui.openModal) bad.push('still open'); if (g.mode !== mode) bad.push('mode after close ' + g.mode);
      // on the title screen too
      g.mode = 'title'; key('F1'); if (g.ui.openModal !== 'guide') bad.push('F1 did nothing on the title'); key('ArrowDown'); key('Escape'); if (g.ui.openModal) bad.push('Esc did not close it on the title');
    } finally { g.mode = mode; shut(); }
    return bad.length === 0 || bad.join('; ');
  });
  await T('guide.first-play-hint-names-the-key-once', async () => {
    fresh({}); const was = g.noSave, bad = []; const ls = (() => { try { return localStorage.getItem('rotfactory.guideHint'); } catch (e) { return null; } })();
    try { try { localStorage.removeItem('rotfactory.guideHint'); } catch (e) { /* none */ } g.noSave = false; g.ui._guideHinted = false; const s0 = g.S.stats.playSecs; g.S.stats.playSecs = 6; g.ui.guideHintTick(); const h = $('hint').textContent; if (!/Press F1 for the Field Guide/.test(h)) bad.push('hint says: ' + h);
      g.ui._guideHinted = false; $('hint').textContent = ''; g.ui.guideHintTick(); if ($('hint').textContent) bad.push('the hint came twice'); g.S.stats.playSecs = s0; }
    finally { g.noSave = was; try { if (ls === null) localStorage.removeItem('rotfactory.guideHint'); else localStorage.setItem('rotfactory.guideHint', ls); } catch (e) { /* none */ } }
    return bad.length === 0 || bad.join('; ');
  });
}
