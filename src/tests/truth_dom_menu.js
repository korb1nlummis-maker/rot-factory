// Truth tests for the title screen, the pause menu, the windows (Esc, X, backdrop), the Play Together window and the chat box: each button is
// really clicked and the effect its words promise is checked (not just that its words match an id).
export default async function (ctx) {
  const { T, g, S, fresh, realSleep } = ctx;
  const $ = (id) => document.getElementById(id);
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const key = (code, target = window, extra = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...extra }));
  const keyUp = (code, target = window) => target.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }));
  const lockOff = () => Object.defineProperty(document, 'pointerLockElement', { get: () => null, configurable: true });   // the self test pins the mouse as captured; real Esc-with-a-free-mouse needs it released
  const lockOn = () => Object.defineProperty(document, 'pointerLockElement', { get: () => g.canvas, configurable: true });
  const toasts = () => [...document.querySelectorAll('#toasts .toast')].map((t) => norm(t.textContent));
  const MODALS = ['shop', 'dex', 'crew', 'howto', 'inv', 'craft', 'journal', 'multi', 'travel', 'dossier', 'ach', 'pause', 'note'];

  // ---------------------------------------------------------------- pause menu
  await T('truth.dom.menu-resume-closes-the-menu-and-takes-the-mouse-back', async () => {
    fresh({}); const was = g.requestLock; let locks = 0; g.requestLock = () => { locks++; };
    try { g.ui.open('pause'); $('btnResume').click(); } finally { g.requestLock = was; }
    return (g.ui.openModal === null && $('pause').classList.contains('hidden') && locks === 1) || `open ${g.ui.openModal}, mouse re-captured ${locks}x`;
  });
  await T('truth.dom.menu-save-saves-and-says-so-and-says-the-truth-when-it-cannot', async () => {
    fresh({}); const wasSave = g.save, wasNo = g.noSave; const bad = [];
    try {
      let n = 0; g.noSave = false; g.save = () => { n++; return true; }; g.ui.open('pause'); $('btnSave').click(); if (n !== 1) bad.push(`Save pressed, save() ran ${n}x`); if (!toasts().some((t) => /Saved/.test(t) && !/Save failed/.test(t))) bad.push('no "Saved" toast: ' + toasts().slice(0, 2).join('/'));
      $('toasts').innerHTML = ''; g.save = () => false; $('btnSave').click(); if (!toasts().some((t) => /Save failed/.test(t))) bad.push('a failed save did not say so');
      // a guest never writes a save, so the button must not claim the shift is safe
      $('toasts').innerHTML = ''; g.save = wasSave; g.noSave = true; $('btnSave').click(); const t = toasts().join(' ');
      if (/Saved|safe/i.test(t) && !/not|guest|host/i.test(t)) bad.push('with saving off the button still says: ' + t);
    } finally { g.save = wasSave; g.noSave = wasNo; $('toasts').innerHTML = ''; g.ui.closeModals(); }
    return bad.length === 0 || bad.join(' || ');
  });
  await T('truth.dom.menu-graphics-menu-applies-the-quality-it-names', async () => {
    fresh({}); const sel = $('selQuality'), before = g.renderer.qName, bad = [];
    try { for (const q of [...sel.options].map((o) => o.value)) { sel.value = q; sel.dispatchEvent(new Event('change')); if (g.renderer.qName !== q || S().settings.quality !== q) bad.push(`"${q}" gave ${g.renderer.qName} / saved ${S().settings.quality}`); } } finally { sel.value = before; sel.dispatchEvent(new Event('change')); }
    const names = [...sel.options].map((o) => o.textContent.toLowerCase()).join(); if (names !== [...sel.options].map((o) => o.value).join()) bad.push('option words differ from their values: ' + names);
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.menu-volume-slider-sets-the-volume-it-shows', async () => {
    fresh({}); const r = $('rngVol'), was = g.sound.vol, bad = [];
    try { for (const v of [0, 0.35, 1]) { r.value = String(v); r.dispatchEvent(new Event('input')); if (g.sound.vol !== v || S().settings.vol !== v) bad.push(`slider ${v}: sound ${g.sound.vol}, saved ${S().settings.vol}`); if (g.sound.master && Math.abs(g.sound.master.gain.value - v) > 1e-6) bad.push(`slider ${v}: master gain ${g.sound.master.gain.value}`); } } finally { r.value = String(was); r.dispatchEvent(new Event('input')); }
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.menu-mouse-sensitivity-slider-scales-how-far-the-view-turns', async () => {
    fresh({}); const r = $('rngSens'), was = g.sens, mode = g.mode, bad = []; g.mode = 'play'; g.ui.closeModals(); const turn = (v) => { r.value = String(v); r.dispatchEvent(new Event('input')); const y0 = g.player.yaw; window.dispatchEvent(new MouseEvent('mousemove', { movementX: 100, movementY: 0 })); return y0 - g.player.yaw; };
    try { const a = turn(0.5), b = turn(1), c = turn(2); if (!(a > 0 && Math.abs(b / a - 2) < 0.01 && Math.abs(c / b - 2) < 0.01)) bad.push(`turn for sens 0.5/1/2 was ${a.toFixed(4)}/${b.toFixed(4)}/${c.toFixed(4)}`); if (S().settings.sens !== 2) bad.push('the slider is not saved'); } finally { r.value = String(was); r.dispatchEvent(new Event('input')); g.mode = mode; }
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.menu-game-and-controls-tabs-show-what-they-name-and-controls-matches-how-to-play', async () => {
    fresh({}); g.ui.open('pause'); const bad = []; document.querySelector('[data-ptab="controls"]').click();
    if ($('pauseGame').offsetParent !== null || $('pauseControls').offsetParent === null) bad.push('Controls tab does not show the list');
    const a = $('ctlBody').innerHTML, b = $('howKeys').innerHTML; if (a !== b) bad.push('the pause list and the How to Play list differ, although the pause text says they are the same');
    if (!/same list is in How to Play/.test($('pauseControls').textContent)) bad.push('the Controls tab no longer says where else the list is');
    document.querySelector('[data-ptab="game"]').click(); if ($('pauseGame').offsetParent === null) bad.push('Game tab does not show the menu'); g.ui.closeModals(); return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- windows: X, backdrop, Esc
  await T('truth.dom.windows-every-x-and-backdrop-click-closes-its-window', async () => {
    fresh({}); const bad = [];
    for (const id of MODALS) {
      g.ui.open(id); const x = $(id).querySelector('[data-close]'); if (!x) { bad.push(`#${id} has no X`); continue; } x.click(); if (g.ui.openModal !== null || !$(id).classList.contains('hidden')) bad.push(`the X on #${id} did not close it`);
      g.ui.open(id); $(id).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); if (g.ui.openModal !== null || !$(id).classList.contains('hidden')) bad.push(`a click outside #${id} did not close it`);
      g.ui.open(id); const inner = $(id).querySelector('.panel'); inner.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); if (g.ui.openModal !== id) bad.push(`a click inside #${id} closed it`); g.ui.closeModals();
    }
    return bad.length === 0 || bad.slice(0, 5).join(' || ');
  });
  await T('truth.dom.windows-esc-closes-the-open-window-as-the-inventory-says', async () => {
    fresh({}); const bad = []; g.mode = 'play'; const was = g.requestLock; g.requestLock = () => {};
    try {
      for (const id of MODALS) { g.ui.open(id); key('Escape'); keyUp('Escape'); if (g.ui.openModal !== null || !$(id).classList.contains('hidden')) bad.push(`Esc left #${id} open`); }
      g.ui.open('inv'); if (!/Esc<\/kbd> closes/.test($('inv').innerHTML)) bad.push('the inventory no longer says Esc closes');
    } finally { g.requestLock = was; g.ui.closeModals(); }
    return bad.length === 0 || bad.slice(0, 5).join(' || ');
  });
  await T('truth.dom.windows-after-esc-the-click-the-game-line-is-true', async () => {
    fresh({}); g.mode = 'play'; g.ui.closeModals(); const bad = []; const was = g.canvas.requestPointerLock; let locks = 0;
    try {
      lockOff(); g.canvas.requestPointerLock = () => { locks++; return Promise.reject(new Error('needs a click')); }; $('hint').textContent = ''; g.ui.open('pause'); await realSleep(100); key('Escape'); keyUp('Escape'); await realSleep(50);
      if (locks !== 1) bad.push('closing with Esc did not try to take the mouse back'); if (!/Click the game/.test($('hint').textContent)) bad.push('no "click the game" line after the browser refused: ' + $('hint').textContent);
      g.canvas.requestPointerLock = () => { locks++; return Promise.resolve(); }; $('hint').textContent = ''; g.canvas.dispatchEvent(new MouseEvent('click', { bubbles: true })); await realSleep(30); if (locks !== 2) bad.push('clicking the game did not take the mouse'); if (/Click the game/.test($('hint').textContent)) bad.push('the line showed although the click worked');
    } finally { g.canvas.requestPointerLock = was; lockOn(); g.ui.closeModals(); $('hint').textContent = ''; }
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.windows-esc-also-closes-a-window-while-you-are-typing-in-it', async () => {
    fresh({}); g.mode = 'play'; const bad = []; const was = g.requestLock; g.requestLock = () => {};
    try {
      g.ui.open('multi'); $('mpName').focus(); $('mpName').dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true })); if (g.ui.openModal !== null) bad.push('Esc in the name box left the window open'); await realSleep(100);
      g.ui.open('multi'); $('mpJoin').click(); $('mpCodeIn').focus(); $('mpCodeIn').dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true })); if (g.ui.openModal !== null) bad.push('Esc in the code box left the window open'); await realSleep(100);
      g.ui.open('multi'); $('mpName').dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true })); if (g.ui.openModal !== 'multi' || g.keys.KeyW) bad.push('typing a letter in the box reached the game');
    } finally { g.requestLock = was; g.ui.closeModals(); g.keys = {}; }
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.windows-esc-closes-how-to-play-and-play-together-on-the-title-screen-too', async () => {
    fresh({}); const bad = []; const mode = g.mode; g.mode = 'title';
    try { for (const id of ['howto', 'multi']) { g.ui.open(id); key('Escape'); keyUp('Escape'); if (g.ui.openModal !== null) bad.push(`Esc left #${id} open on the title`); } key('Escape'); keyUp('Escape'); if (g.ui.openModal !== null) bad.push('Esc on a bare title opened a window'); } finally { g.mode = mode; g.ui.closeModals(); }
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.windows-esc-in-the-world-opens-the-pause-menu-the-title-promises', async () => {
    fresh({}); g.mode = 'play'; g.ui.closeModals(); const bad = []; await realSleep(100);
    try {
      lockOff(); key('Escape'); keyUp('Escape'); if (g.ui.openModal !== 'pause') bad.push(`Esc with the mouse free opened "${g.ui.openModal}"`);
      key('Escape'); keyUp('Escape'); if (g.ui.openModal !== null) bad.push('a second Esc did not close the pause menu'); await realSleep(100);
      // a panel that closes itself on Esc (furnish, detector) must not be followed by the pause menu on the same key press
      const closer = (e) => { if (e.code === 'Escape' && g.ui.openModal === 'shop') g.ui.closeModals(); }; document.addEventListener('keydown', closer);
      try { g.ui.open('shop'); key('Escape', document.body); keyUp('Escape'); if (g.ui.openModal !== null) bad.push(`panel Esc then pause: "${g.ui.openModal}" is open`); } finally { document.removeEventListener('keydown', closer); }
      g.ui.closeModals(); await realSleep(100); lockOn(); key('Escape'); if (g.ui.openModal !== null) bad.push('Esc with the mouse captured opened a window by itself (the browser unlock does that)');
    } finally { lockOn(); g.ui.closeModals(); }
    const how = document.querySelector('#title .how').textContent; if (!/Esc\s+pause/.test(how)) bad.push('the title no longer says Esc pauses');
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.windows-esc-lets-go-of-the-bot-and-the-wire-and-opens-the-menu', async () => {
    fresh({ crew: 1, crewSlots: 2 }); g.mode = 'play'; g.ui.closeModals(); await realSleep(100); const b = g.crew.spawn(); g.crewSel = b.id; const bad = [];
    try { lockOff(); key('Escape'); keyUp('Escape'); if (g.crewSel) bad.push('the selected bot was not let go'); if (g.ui.openModal !== 'pause') bad.push('menu did not open'); } finally { lockOn(); g.ui.closeModals(); }
    // the browser's own unlock (Esc while the mouse is captured) must do the same: let go of the wire as well
    g.cables.from = 12345;   // a wire started from some machine and still in your hand
    try { await realSleep(100); lockOff(); document.dispatchEvent(new Event('pointerlockchange')); if (g.cables.wiring) bad.push('the unlock that opens the menu left the wire in your hand'); if (g.ui.openModal !== 'pause') bad.push('the unlock did not open the menu'); } finally { g.cables.cancel(); lockOn(); g.ui.closeModals(); }
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.windows-clicking-a-dial-gives-the-mouse-back-to-the-game', async () => {
    fresh({}); g.mode = 'play'; g.ui.closeModals(); const was = g.requestLock; let locks = 0; g.requestLock = () => { locks++; }; const dial = document.querySelector('#belt .dial');
    try { if (!dial) return 'no dial on the belt'; lockOff(); dial.dispatchEvent(new MouseEvent('click', { bubbles: true })); } finally { g.requestLock = was; lockOn(); }
    return locks === 1 || `mouse re-captured ${locks}x after a dial click`;
  });

  // a button that something else sits on top of looks fine and does nothing when a real mouse presses it
  await T('truth.dom.windows-every-visible-button-can-really-be-hit-by-the-mouse', async () => {
    const { UPGRADES } = await import('../upgrades.js'); fresh(Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]))); g.mode = 'play'; S().money = 1e9; const bad = []; g.endTimer = 0; g.ui.hideEnding(); $('title').classList.add('hidden');   // earlier suites (a friend's win) can leave the ending screen waiting
    for (let i = 0; i < 2; i++) g.crew.spawn();
    const hit = (label, root) => {
      for (const b of root.querySelectorAll('button, select, input[type=range], input[type=text], textarea')) {
        if (b.offsetParent === null || b.disabled) continue; const dt = b.closest('details'); if (dt && !dt.open) continue; b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) { bad.push(`${label}: "${norm(b.textContent || b.id)}" is off the screen at ${Math.round(cx)},${Math.round(cy)}`); continue; }
        const top = document.elementFromPoint(cx, cy); if (!top || !(top === b || b.contains(top) || top.contains(b) && top.tagName === 'LABEL')) bad.push(`${label}: "${norm(b.textContent || b.id)}" is covered by ${top && (top.id || top.className || top.tagName)}`);
      }
    };
    for (const id of ['pause', 'shop', 'craft', 'crew', 'inv', 'multi', 'howto', 'dossier', 'ach', 'dex', 'journal']) { g.ui.open(id); if (id === 'shop') { g.ui.shopCat = 'hands'; g.ui.renderShop(); } hit('#' + id, $(id)); if (id === 'pause') { document.querySelector('[data-ptab="controls"]').click(); hit('#pause controls', $('pause')); } if (id === 'multi') { $('mpJoin').click(); const det = $(id).querySelector('details'); det.open = true; $('mpHostBox').classList.remove('hidden'); hit('#multi both boxes', $(id)); $('mpHostBox').classList.add('hidden'); det.open = false; } g.ui.closeModals(); }
    // the title screen, shown for a moment
    const title = $('title'), wasHidden = title.classList.contains('hidden'); title.classList.remove('hidden'); try { $('btnContinue').classList.remove('hidden'); hit('title', title); } finally { if (wasHidden) title.classList.add('hidden'); if (!g.saved) $('btnContinue').classList.add('hidden'); }
    const end = $('ending'); end.classList.remove('hidden'); try { hit('ending', end); } finally { end.classList.add('hidden'); }
    return bad.length === 0 || bad.slice(0, 6).join(' || ');
  });

  // ---------------------------------------------------------------- what the title screen says
  await T('truth.dom.title-the-six-keys-it-lists-do-what-it-says', async () => {
    fresh({}); g.mode = 'play'; g.ui.closeModals(); const bad = []; const w = { toggleLamp: g.toggleLamp, punch: g.punch, gPress: g.gPress }; const hit = { lamp: 0, punch: 0, grab: 0 };
    g.toggleLamp = () => { hit.lamp++; }; g.punch = () => { hit.punch++; }; g.gPress = () => { hit.grab++; };
    try {
      key('KeyF'); keyUp('KeyF'); if (hit.lamp !== 1) bad.push('F did not switch the flashlight'); key('KeyR'); keyUp('KeyR'); if (hit.punch !== 1) bad.push('R did not punch');
      window.dispatchEvent(new MouseEvent('mousedown', { button: 2 })); window.dispatchEvent(new MouseEvent('mouseup', { button: 2 })); if (hit.punch !== 2) bad.push('right click did not punch');
      window.dispatchEvent(new MouseEvent('mousedown', { button: 0 })); window.dispatchEvent(new MouseEvent('mouseup', { button: 0 })); if (hit.grab !== 1) bad.push('click did not grab');
      for (const [k, d] of [['KeyW', 'forward'], ['KeyA', 'left'], ['KeyS', 'back'], ['KeyD', 'right']]) { key(k); if (!g.keys[k]) bad.push(`${k} (${d}) did not register`); keyUp(k); if (g.keys[k]) bad.push(`${k} stayed down`); }
      key('KeyI'); if (g.ui.openModal !== 'inv') bad.push('I did not open the inventory'); key('KeyI'); if (g.ui.openModal !== null) bad.push('I again did not close it');
    } finally { Object.assign(g, w); g.ui.closeModals(); g.keys = {}; }
    const how = document.querySelector('#title .how').textContent; for (const w2 of ['WASD', 'flashlight', 'punch', 'inventory', 'pause']) if (!how.includes(w2)) bad.push('title line lost "' + w2 + '"');
    return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- the buttons that start a game (through the hiring form)
  const signIntro = async (name) => {   // drive the real intro: two clicks/Enters for the welcome, the name, Enter, wait for the form to finish
    const root = $('intro'); if (!root) throw new Error('no intro overlay'); key('Enter'); key('Enter'); await realSleep(700);
    const input = root.querySelector('#introName'); input.value = name; input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true })); await realSleep(3700);
  };
  const withStartPlay = async (fn) => {
    const was = g.startPlay, wasConfirm = window.confirm, calls = []; g.startPlay = (isNew, seed, after, fail) => { calls.push({ isNew, seed }); if (after) after(); };
    try { await fn(calls); } finally { g.startPlay = was; window.confirm = wasConfirm; g._starting = false; const i = $('intro'); if (i) i.remove(); }
    return calls;
  };
  await T('truth.dom.title-new-shift-runs-the-form-and-starts-a-new-game-once-even-when-double-clicked', async () => {
    fresh({}); const bad = []; const oldName = S().name; const calls = await withStartPlay(async (calls) => {
      $('btnNew').click(); $('btnNew').click(); await realSleep(60); if (document.querySelectorAll('#intro').length !== 1) bad.push(`${document.querySelectorAll('#intro').length} intros after a double click`);
      if (calls.length) bad.push('the game started before the form was signed'); await signIntro('Test Sorter'); if (S().name !== 'Test Sorter') bad.push('the signed name is not on the books: ' + S().name);
      if ($('dcDay').textContent !== 'Day 1' || !/Employee: Test Sorter/.test($('dcSub').textContent)) bad.push(`morning card says "${$('dcDay').textContent}" / "${$('dcSub').textContent}"`);
    });
    S().name = oldName; if (calls.length !== 1 || calls[0].isNew !== true) bad.push('startPlay calls: ' + JSON.stringify(calls)); return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.title-continue-resumes-the-saved-shift-without-the-form', async () => {
    fresh({}); const bad = []; const calls = await withStartPlay(async () => { $('btnContinue').click(); await realSleep(60); if ($('intro')) bad.push('Continue showed the hiring form'); });
    if (calls.length !== 1 || calls[0].isNew !== false) bad.push('startPlay calls: ' + JSON.stringify(calls)); return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.pause-abandon-shift-asks-first-then-starts-a-new-warehouse', async () => {
    fresh({}); const bad = []; const oldName = S().name; const calls = await withStartPlay(async (calls) => {
      let asked = ''; window.confirm = (m) => { asked = m; return false; }; g.ui.open('pause'); $('btnReset').click(); await realSleep(60); if ($('intro') || calls.length) bad.push('Cancel still started a new game'); if (!/abandon/i.test(asked) || !/lost/i.test(asked)) bad.push('the question does not warn that progress is lost: ' + asked); if (g.ui.openModal !== 'pause') bad.push('Cancel closed the menu');
      window.confirm = () => true; $('btnReset').click(); await realSleep(60); if (!$('intro')) bad.push('OK did not start the new-warehouse form'); if (g.ui.openModal) bad.push('the pause menu stayed over the form'); await signIntro('Second Sorter');
    });
    S().name = oldName; if (calls.length !== 1 || calls[0].isNew !== true) bad.push('startPlay calls: ' + JSON.stringify(calls)); return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.ending-keep-playing-and-new-warehouse-do-what-they-say', async () => {
    fresh({}); const bad = []; const was = g.requestLock; let locks = 0; g.requestLock = () => { locks++; };
    try {
      S().ending = 'plush'; g.mode = 'ended'; g.ui.showEnding('plush', S()); if ($('ending').classList.contains('hidden')) bad.push('the win screen did not show'); if (!/Keep Playing/.test($('btnKeep').textContent)) bad.push('win button words: ' + $('btnKeep').textContent);
      $('btnKeep').click(); if (!$('ending').classList.contains('hidden') || g.mode !== 'play' || locks !== 1) bad.push(`Keep Playing: hidden ${$('ending').classList.contains('hidden')}, mode ${g.mode}, mouse ${locks}`);
      S().ending = 'exit'; g.mode = 'ended'; g.ui.showEnding('exit', S()); if (!/the One is gone/.test($('btnKeep').textContent)) bad.push('exit screen does not warn the One is gone: ' + $('btnKeep').textContent);
      // and it is true: after the exit nothing can win the game any more
      let won = 0; const wasSend = g.netSend; g.netSend = () => { won++; }; g.mode = 'play'; g.foundNeedle('test'); g.netSend = wasSend; if (won || g.mode !== 'play') bad.push('after Stay and tinker the One could still be found');
    } finally { g.requestLock = was; g.ui.hideEnding(); S().ending = null; g.mode = 'play'; }
    const calls = await withStartPlay(async () => { g.ui.showEnding('plush', S()); $('btnNew2').click(); await realSleep(60); if (!$('ending').classList.contains('hidden')) bad.push('New Warehouse left the ending up'); if (!$('intro')) bad.push('New Warehouse did not open the form'); await signIntro('Third Sorter'); });
    if (calls.length !== 1 || calls[0].isNew !== true) bad.push('startPlay calls: ' + JSON.stringify(calls)); return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.intro-click-advances-the-welcome-as-its-hint-says', async () => {
    const was = $('intro'); if (was) was.remove(); const { playIntro } = await import('../intro.js'); const pr = playIntro(); const root = $('intro'); await realSleep(450);
    const hint = root.querySelector('#introHint').textContent; const line = () => root.querySelector('#introLine').textContent; const first = line();
    root.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await realSleep(450); const second = line(); root.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await realSleep(700);
    const paper = root.querySelector('.paper').classList.contains('on'); const input = root.querySelector('#introName'); const ph = input.placeholder;
    input.value = 'Click Test'; input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true })); const r = await pr; r.close(); await realSleep(1300); const gone = !$('intro');
    return (/click or press Enter/.test(hint) && first && second && first !== second && paper && /press Enter/.test(ph) && r.name === 'Click Test' && gone) || `hint "${hint}", lines "${first}" > "${second}", form ${paper}, placeholder "${ph}", name ${r.name}, removed ${gone}`;
  });

  // ---------------------------------------------------------------- Play Together
  await T('truth.dom.multi-buttons-run-what-they-name-and-say-the-truth-about-the-result', async () => {
    fresh({}); const bad = []; g.mode = 'play'; const net = g.net, was = { hostShort: net.hostShort, joinShort: net.joinShort, host: net.host, join: net.join, finishHost: net.finishHost }; const st = () => norm($('mpStatus').textContent); const vis = (id) => !$(id).classList.contains('hidden');
    try {
      g.ui.open('multi'); let hosts = 0; net.hostShort = async () => { hosts++; return '4821'; };
      $('mpHost').click(); await realSleep(20); if (!vis('mpHostShort') || $('mpCode').textContent !== '4821' || hosts !== 1) bad.push(`Host: box ${vis('mpHostShort')}, code "${$('mpCode').textContent}", ${hosts} calls`); if (!/friend/i.test(st())) bad.push('Host status: ' + st());
      net.hostShort = async () => { throw new Error('no network'); }; $('mpHost').click(); await realSleep(20); if (!/no network|long codes/.test(st())) bad.push('a failed Host does not say why: ' + st());
      $('mpJoin').click(); if (!vis('mpJoinShort') || vis('mpHostShort')) bad.push('Join a friend did not swap the boxes'); let joined = null; net.joinShort = async (c) => { joined = c; }; $('mpCodeIn').value = '4821'; $('mpGo').click(); await realSleep(20); if (joined !== '4821') bad.push(`Join sent "${joined}"`); if (!/Connected/.test(st())) bad.push('Join status: ' + st());
      joined = null; $('mpCodeIn').value = '9999'; $('mpCodeIn').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })); await realSleep(20); if (joined !== '9999') bad.push('Enter in the code box does not join'); if (g.ui.openModal !== 'multi') bad.push('typing a code closed the window');
      net.joinShort = async () => { throw new Error('No game with that code'); }; $('mpGo').click(); await realSleep(20); if (!/Could not join.*No game/.test(st())) bad.push('a failed Join does not say so: ' + st());
      net.host = async () => 'LONGOFFER'; $('mpHostManual').click(); await realSleep(20); if (!vis('mpHostBox') || $('mpOffer').value !== 'LONGOFFER') bad.push('Host (long codes) shows "' + $('mpOffer').value + '"');
      let fin = null; net.finishHost = async (c) => { fin = c; }; $('mpAnswerIn').value = 'REPLY'; $('mpConnect').click(); await realSleep(20); if (fin !== 'REPLY') bad.push('Connect passed "' + fin + '"'); if (!/Connecting/.test(st())) bad.push('Connect status: ' + st());
      net.finishHost = async () => { throw new Error('x'); }; $('mpConnect').click(); await realSleep(20); if (!/did not work/.test(st())) bad.push('a bad reply code does not say so: ' + st());
      $('mpJoinManual').click(); if (!vis('mpJoinBox') || vis('mpHostBox')) bad.push('Join (long codes) did not swap the boxes'); net.join = async (o) => 'REPLYFOR' + o; $('mpOfferIn').value = 'OFFER'; $('mpMakeReply').click(); await realSleep(20); if ($('mpReply').value !== 'REPLYFOROFFER') bad.push('Make reply code gave "' + $('mpReply').value + '"');
      // Copy buttons: "Copied." only when there was something to copy
      $('mpOffer').value = ''; $('mpCopyOffer').click(); if (/Copied/.test(st())) bad.push('Copy code says Copied with nothing in the box'); $('mpReply').value = ''; $('mpCopyReply').click(); if (/Copied/.test(st())) bad.push('Copy reply says Copied with nothing in the box');
    } finally { Object.assign(net, was); g.ui.closeModals(); }
    // hosting needs a running game: from the title the button explains instead of pretending
    const m = g.mode; g.mode = 'title'; try { g.ui.open('multi'); $('mpHost').click(); await realSleep(10); if (!/Start or continue your game first/.test(st())) bad.push('Host from the title says: ' + st()); } finally { g.mode = m; g.ui.closeModals(); }
    return bad.length === 0 || bad.slice(0, 6).join(' || ');
  });
  await T('truth.dom.multi-a-double-click-on-host-does-not-open-two-hosts', async () => {
    fresh({}); g.mode = 'play'; const net = g.net, was = net.hostShort; let calls = 0; net.hostShort = () => { calls++; return new Promise((r) => setTimeout(() => r('1234'), 60)); };
    try { g.ui.open('multi'); $('mpHost').click(); $('mpHost').click(); await realSleep(120); } finally { net.hostShort = was; g.ui.closeModals(); }
    return calls === 1 || `${calls} hosts were started by one double click`;
  });

  // ---------------------------------------------------------------- chat
  await T('truth.dom.chat-box-sends-on-enter-and-esc-cancels-as-its-placeholder-says', async () => {
    fresh({}); g.mode = 'play'; g.ui.closeModals(); const bad = []; const chat = $('chatIn'), net = g.net; const wasOpen = net.open, wasSend = net.send; const sent = []; net.open = true; net.send = (m) => { sent.push(m); };
    try {
      if (!/press Enter/.test(chat.placeholder)) bad.push('placeholder: ' + chat.placeholder);
      key('Enter'); if (chat.classList.contains('hidden')) bad.push('Enter did not open the chat box'); chat.value = 'hello there'; chat.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
      if (sent.length !== 1 || sent[0].t !== 'say' || sent[0].text !== 'hello there') bad.push('sent ' + JSON.stringify(sent)); if (!chat.classList.contains('hidden')) bad.push('the box stayed open after Enter'); const box = $('chat'); if (!box || !/You: hello there/.test(box.textContent)) bad.push('your own line is not shown');
      key('Enter'); chat.value = 'never sent'; chat.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })); if (sent.length !== 1 || !chat.classList.contains('hidden')) bad.push('Esc did not cancel the message');
      net.open = false; chat.classList.add('hidden'); key('Enter'); if (!chat.classList.contains('hidden')) bad.push('Enter opened chat although nobody is connected (README: chat is for playing together)');
    } finally { net.open = wasOpen; net.send = wasSend; chat.classList.add('hidden'); chat.value = ''; const c = $('chat'); if (c) c.innerHTML = ''; }
    return bad.length === 0 || bad.join('; ');
  });
}
