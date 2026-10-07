// Truth tests for the on-screen sentences that tell you what to press in the hall: the first hints, the buried and trapped boxes, the medkit and
// recall lines, what the death toast says about where you wake, the opening hours the form and the hint quote.
export default async function (ctx) {
  const { T, g, S, fresh, adv, realSleep } = ctx;
  const $ = (id) => document.getElementById(id);
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const key = (code, extra = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...extra }));
  const keyUp = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }));
  const press = (code, extra) => { key(code, extra); keyUp(code); };
  const stand = (pos) => { g.player.pos.set(pos.x, 0, pos.z + 1.2); g.player.vel.set(0, 0, 0); };

  await T('truth.dom.hall-e-at-the-desk-bench-kiosk-and-bin-and-tab-do-what-the-hints-say', async () => {
    fresh({}); g.mode = 'play'; g.ui.closeModals(); const bad = []; const h = g.hall; const here = g.player.pos.clone();
    try {
      for (const [where, pos, modal, what] of [['desk', h.termPos, 'shop', 'upgrades'], ['bench', h.craftPos, 'craft', 'crafting'], ['kiosk', h.kioskPos, 'dossier', 'the dossier']]) { stand(pos); press('KeyE'); if (g.ui.openModal !== modal) bad.push(`E at the ${where} opened "${g.ui.openModal}", not ${what}`); g.ui.closeModals(); }
      g.player.pos.set(30, 0, 30); press('Tab'); if (g.ui.openModal !== 'shop') bad.push('Tab away from the desk did not open the upgrades'); g.ui.closeModals();
      stand(h.binPos); S().carry = [{ sp: 5, vr: 0 }, { sp: 6, vr: 0 }]; const m0 = S().money; press('KeyE'); if (S().carry.length !== 0 || S().money <= m0) bad.push(`E at the bin left ${S().carry.length} plush, money ${S().money - m0}`);
      stand(h.binPos); S().carry = [{ sp: 5, vr: 0 }]; const m1 = S().money; adv(3); if (S().carry.length !== 0 || S().money <= m1) bad.push('walking up to the bin does not suck your plush in (carry ' + S().carry.length + ')');
    } finally { g.player.pos.copy(here); g.ui.closeModals(); S().carry = []; }
    // the words of the first two hints name exactly these things
    const src = await (await fetch('/src/game.js')).text(); const m = /Look at a plush and click to grab it\.([^']*)'/.exec(src); if (!m || !/SORT bin/.test(m[1]) || !/E<\/kbd> at the desk for upgrades, at the bench to craft/.test(m[1])) bad.push('the first hint no longer says what the test checks');
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.hall-opening-hours-are-the-ones-the-form-and-the-hint-quote', async () => {
    fresh({}); const bad = []; const at = (h, m) => { S().gameMin = 1440 * 3 + h * 60 + m - 420; return g.isOpen(); };   // game minute 0 is 07:00
    if (at(6, 59) || !at(7, 0) || !at(18, 59) || at(19, 0)) bad.push('the lights are not on from 07:00 to 19:00 sharp');
    const src = await (await fetch('/src/game.js')).text(); const intro = await (await fetch('/src/intro.js')).text();
    if (!/At 19:00 the warehouse closes, a chime sounds, and the lights go out until 07:00/.test(src)) bad.push('the closing-time hint changed'); if (!/lights are on from 07:00 to 19:00/.test(intro)) bad.push('the form changed its hours');
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.hall-buried-and-trapped-boxes-tell-the-truth-about-r-right-click-and-space', async () => {
    fresh({}); g.mode = 'play'; g.ui.closeModals(); const bad = []; const was = g.punch; const calls = []; g.punch = (...a) => { calls.push(a); };
    try {
      if (!/Left click/.test($('buried').textContent) || !/punch with R/.test($('buried').textContent) || !/R or right click/.test($('trap').textContent) || !/hold Space to punch up/.test($('trap').textContent)) bad.push('the boxes changed their words: ' + norm($('buried').textContent) + ' | ' + norm($('trap').textContent));
      press('KeyR'); if (calls.length !== 1) bad.push('R did not punch'); window.dispatchEvent(new MouseEvent('mousedown', { button: 2 })); window.dispatchEvent(new MouseEvent('mouseup', { button: 2 })); if (calls.length !== 2) bad.push('right click did not punch');
      calls.length = 0; g.player.embedded = true; g.player.buried = 3; g.keys.Space = true; adv(0.1); g.keys.Space = false; if (!calls.some((c) => c[0] === true && c[1] === true)) bad.push('holding Space while trapped did not punch up: ' + JSON.stringify(calls));
      calls.length = 0; g.keys.Space = true; g.player.embedded = false; g.player.buried = 0; adv(0.1); g.keys.Space = false; if (calls.some((c) => c[1] === true)) bad.push('Space punched up while not buried');
    } finally { g.punch = was; g.player.embedded = false; g.player.buried = 0; g.trapOn = false; g.airLeft = undefined; g.ui.setTrap(false); g.keys = {}; }
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.hall-f3-shows-and-hides-the-frame-rate', async () => {
    fresh({}); g.mode = 'play'; g.ui.closeModals(); const bad = []; const fps = $('fps'); const was = g.showFps; g.showFps = false; fps.classList.add('hidden');
    try {
      const ev = new KeyboardEvent('keydown', { code: 'F3', bubbles: true, cancelable: true }); window.dispatchEvent(ev); keyUp('F3'); if (!ev.defaultPrevented) bad.push('F3 would also open the browser find bar');   // a tap shorter than one frame
      if (fps.classList.contains('hidden')) bad.push('F3 did not show the frame rate'); for (let n = 0; n < 40; n++) g.perf(16); if (!/\d+ fps/.test(fps.textContent)) bad.push('the readout has no number: "' + fps.textContent + '"');
      press('F3'); if (!fps.classList.contains('hidden')) bad.push('F3 again did not hide it');
    } finally { g.showFps = was; fps.classList.add('hidden'); g.keys = {}; }
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.hall-k-heals-fifty-as-the-bench-and-the-terminal-say', async () => {
    fresh({ firstaid: 1 }); g.mode = 'play'; g.ui.closeModals(); const bad = []; const r = g.recipeList().find((x) => x.id === 'medkit'); if (!r || !/K to heal 50 health/.test(r.desc) || !/K to heal 50 health/.test(r.use)) bad.push('the bench card does not say K heals 50: ' + (r && r.desc));
    const up = (await import('../upgrades.js')).UPGRADES.find((u) => u.id === 'firstaid'); if (!/K heals 50/.test(up.desc)) bad.push('terminal text: ' + up.desc);
    g.hp = 20; S().items.medkit = 2; press('KeyK'); if (Math.abs(g.hp - 70) > 0.01 || S().items.medkit !== 1) bad.push(`K: hp ${g.hp}, medkits ${S().items.medkit}`); g.hp = 100; press('KeyK'); if (S().items.medkit !== 1) bad.push('K spent a medkit at full health');
    g.hp = 20; S().items = {}; $('hint').textContent = ''; press('KeyK'); const hint = $('hint').textContent; if (!/First Aid/.test(hint) || !/terminal/.test(hint)) bad.push('no-medkit advice: ' + hint);
    if (!(await import('../upgrades.js')).UPGRADES.some((u) => /^First Aid/.test(u.name))) bad.push('the advice names an upgrade that does not exist'); g.hp = 100; return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.hall-death-and-recall-say-where-you-really-wake', async () => {
    fresh({}); g.mode = 'play'; g.ui.closeModals(); const bad = []; const was = g.beaconList; const bayOnly = was.call(g); const far = { name: 'Depot Q', x: 400, y: 0.05, z: 0, id: 9001 };
    g.beaconList = () => [...bayOnly, far]; g.player.pos.set(398, 0, 0);
    try {
      const at = g.recall(); if (!at || at.name !== 'Depot Q' || Math.abs(g.player.pos.x - 400) > 0.5) bad.push('recall from beside a depot went to ' + (at && at.name)); if (!/Recalled to Depot Q/.test($('hint').textContent)) bad.push('recall hint: ' + $('hint').textContent);
      g.player.pos.set(398, 0, 0); $('toasts').innerHTML = ''; g.die('were crushed'); await realSleep(1700); const t = norm($('toasts').textContent); if (!/woke up at Depot Q/.test(t)) bad.push('death toast: ' + t); if (Math.hypot(g.player.pos.x - 400, g.player.pos.z) > 80) bad.push('you did not wake near the depot: ' + g.player.pos.x.toFixed(0));
      await realSleep(900); g.player.pos.set(1, 0, 1); $('toasts').innerHTML = ''; g.beaconList = was; g.die('were crushed'); await realSleep(1700); const t2 = norm($('toasts').textContent); if (!/woke up on the floor of the sorting bay/.test(t2)) bad.push('death toast with no depot: ' + t2); await realSleep(900);
      const how = norm($('howto').textContent); if (!/wake at the nearest depot/.test(how)) bad.push('How to Play does not say where you wake');
    } finally { g.beaconList = was; g.dead = false; g.blacking = false; g.ui.blackout(false); g.hp = g.hpMax; $('toasts').innerHTML = ''; }
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.bench-text-b-sets-it-down-with-an-outline-and-x-gives-the-item-back', async () => {
    const maxAll = Object.fromEntries((await import('../upgrades.js')).UPGRADES.map((u) => [u.id, u.max])); fresh(maxAll); g.mode = 'play'; g.ui.closeModals(); S().money = 1e9; const bad = [];
    const txt = norm($('craft').textContent); if (!/set them down with B\. A green outline shows where\. Taking something down with X gives the item back/.test(txt)) bad.push('the bench text changed: ' + txt.slice(0, 200));
    ctx.craft('pole'); if (S().items.pole !== 1) return 'no pole crafted'; ctx.selectTool('pole'); ctx.aimPoint(-6.6, 0, 3.4, 2.0); const pl = await ctx.plan(); if (!pl || !pl.ok) return 'no placement plan for the pole: ' + (pl && pl.why);
    const n0 = S().entities.length; press('KeyB'); await realSleep(60); if (S().entities.length !== n0 + 1 || (S().items.pole || 0) !== 0) bad.push(`B placed ${S().entities.length - n0} and left ${S().items.pole} in the pack`);
    const ent = S().entities[S().entities.length - 1]; g.stowed = true; g.rebuildTools(); ctx.aimPoint(ent.x !== undefined ? ent.x : -6.6, 0.4, ent.z !== undefined ? ent.z : 3.4, 1.6); g.renderer.camera.position.copy(g.player.eyePos(new ctx.V3())); press('KeyX'); await realSleep(60);
    if ((S().items.pole || 0) !== 1 || S().entities.some((e) => e.id === ent.id)) bad.push(`X gave back ${S().items.pole || 0} poles, entity still there ${S().entities.some((e) => e.id === ent.id)}`);
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.howto-numbers-match-the-constants-they-quote', async () => {
    fresh({}); const bad = []; const how = norm($('howto').textContent); const { SAFE_LEN } = await import('../world.js'); const { C, EXIT_X } = await import('../config.js'); const { LAMP_KW, LAMP_MAX_PER_SOURCE } = await import('../hanglamp.js'); const { FRAME_TYPES } = await import('../upgrades.js');
    const tun = /stands for about (\d+(?:\.\d+)?) m on its own/.exec(how); if (!tun || Math.abs(+tun[1] - SAFE_LEN * C) > 0.5) bad.push(`tunnel: How to Play says ${tun && tun[1]} m, the rule is ${(SAFE_LEN * C).toFixed(1)} m`);
    const cube = /4x4x4 cubes \((\d+(?:\.\d+)?) m\)/.exec(how); if (!cube || Math.abs(+cube[1] - 4 * C) > 0.01) bad.push(`frame cube: says ${cube && cube[1]} m, 4 cells are ${4 * C} m`); void FRAME_TYPES;
    const ex = /exit, (\d+(?:\.\d+)?) km east/.exec(how); if (!ex || Math.abs(+ex[1] - EXIT_X / 1000) > 0.06) bad.push(`exit: says ${ex && ex[1]} km, it is ${(EXIT_X / 1000).toFixed(2)}`);
    const lan = /one (\d+) kW generator runs (\w+)\)/.exec(how); const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }; if (!lan || +lan[1] !== g.T.genOutput || (words[lan[2]] || +lan[2]) !== LAMP_MAX_PER_SOURCE || Math.abs(+lan[1] / LAMP_KW - LAMP_MAX_PER_SOURCE) > 0.01) bad.push(`lanterns: "${lan && lan[0]}" vs ${g.T.genOutput} kW, ${LAMP_KW} kW each, ${LAMP_MAX_PER_SOURCE} per source`);
    const src = await (await fetch('/src/game.js')).text(); const hold = /recallHold > (\d+(?:\.\d+)?)/.exec(src); const ctl = (await import('../controls.js')).CONTROLS.flatMap((x) => x.rows).find((r) => r.keys.includes('H')); const said = /(\d+(?:\.\d+)?) seconds/.exec(ctl.what); if (!hold || !said || hold[1] !== said[1]) bad.push(`recall hold: code ${hold && hold[1]} s, controls say ${said && said[1]} s`);
    return bad.length === 0 || bad.join('; ');
  });
}
