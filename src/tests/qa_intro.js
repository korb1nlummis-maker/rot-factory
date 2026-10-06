// Adversarial QA of the intro, the day counter and the day card. These run the real intro overlay, so they take a few real seconds each.
export default async function (ctx) {
  const { T, g, S, w, p, fresh, adv, newWorld, realSleep } = ctx;
  const $ = (id) => document.getElementById(id);
  const kd = (code, target = document.body, extra = {}) => { const e = new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true, ...extra }); target.dispatchEvent(e); return e; };
  const clearIntro = () => { for (const e of document.querySelectorAll('#intro')) e.remove(); g._starting = false; };
  // click New Shift, read through the two lines, sign `name`, return when the overlay has been handed over
  const runIntro = async (name, clicks = 1) => {
    clearIntro(); for (let n = 0; n < clicks; n++) $('btnNew').onclick();
    await realSleep(500); kd('Enter'); await realSleep(500); kd('Enter'); await realSleep(900);
    const input = document.querySelector('#intro #introName'); if (!input) return { err: 'no form' };
    input.value = name; kd('Enter', input);
  };
  const withLoadCount = (fn) => { const orig = g.loadWorld; let n = 0; g.loadWorld = function (...a) { n++; return orig.apply(this, a); }; return { n: () => n, done: () => { g.loadWorld = orig; } }; };

  await T('qa.intro.a-double-click-on-new-shift-starts-one-intro-and-one-game', async () => {
    fresh({}); clearIntro(); const lw = withLoadCount(); try {
      await runIntro('Ada', 3); const overlays = document.querySelectorAll('#intro').length; await realSleep(5200);
      if (overlays !== 1) return overlays + ' intro overlays after 3 clicks'; if (lw.n() !== 1) return lw.n() + ' games started';
      await realSleep(1500); return (S().name === 'Ada' && document.querySelectorAll('#intro').length === 0 && !g._starting) || `name "${S().name}" overlays ${document.querySelectorAll('#intro').length} starting ${g._starting}`;
    } finally { lw.done(); clearIntro(); g.mode = 'play'; g.noSave = true; }
  });

  await T('qa.intro.keys-pressed-during-the-intro-never-reach-the-game', async () => {
    fresh({}); clearIntro(); g.keys = {}; g.ui.closeModals(); $('btnNew').onclick(); await realSleep(450);
    const e1 = kd('Tab'), e2 = kd('KeyW'), e3 = kd('KeyB'), e4 = kd('KeyI'), e5 = kd('Escape'); await realSleep(100);
    const leaked = Object.keys(g.keys).filter((k) => g.keys[k]); const modal = g.ui.isModalOpen();
    kd('Enter'); await realSleep(450); kd('Enter'); await realSleep(900); const input = document.querySelector('#intro #introName'); input.focus(); kd('KeyQ', input); kd('Escape', input); kd('Tab', input);
    const modal2 = g.ui.isModalOpen(); const leaked2 = Object.keys(g.keys).filter((k) => g.keys[k]);
    input.value = 'Cy'; kd('Enter', input); await realSleep(5600); clearIntro(); g.ui.closeModals(); g.mode = 'play'; g.noSave = true;   // let it finish: an abandoned intro would keep its key listener
    return (leaked.length === 0 && !modal && !modal2 && leaked2.length === 0) || `keys leaked ${leaked.concat(leaked2).join()} modal ${modal}/${modal2}`;
  });

  await T('qa.intro.a-failed-start-gives-the-title-back-and-removes-the-overlay', async () => {
    fresh({}); clearIntro(); const orig = g.loadWorld, err0 = g.errCount || 0, log0 = (g.errLog || []).length; let thrown = 0; g.loadWorld = function (...a) { thrown++; g.loadWorld = orig; throw new Error('qa: world failed to build'); };
    const oerr = console.error; console.error = () => {};
    try {
      await runIntro('Bea'); await realSleep(5600);
      const over = document.querySelectorAll('#intro').length, title = !$('title').classList.contains('hidden'), loading = !$('loading').classList.contains('hidden');
      const ok = thrown === 1 && over === 0 && title && !loading && !g._starting && g.mode === 'title';
      return ok || `thrown ${thrown} overlays ${over} title ${title} loading ${loading} starting ${g._starting} mode ${g.mode}`;
    } finally { console.error = oerr; g.loadWorld = orig; g.errCount = err0; if (g.errLog) g.errLog.length = log0; clearIntro(); await newWorld(); }
  });

  await T('qa.intro.odd-names-are-text-never-markup-anywhere', async () => {
    fresh({}); clearIntro(); const lw = withLoadCount(); window.__pwn = 0; const evil = '<b>x</b><img src=x onerror="window.__pwn=1">' + 'W'.repeat(40);
    try { await runIntro(evil); await realSleep(5200);
      const sub = $('dcSub'), welcome = document.querySelector('#intro #introWelcome');
      const markup = sub.querySelector('*') || (welcome && welcome.querySelector('*')) || document.querySelector('#dayCard img, #toasts img[src="x"]');
      await realSleep(300);
      const ok = !markup && window.__pwn === 0 && S().name.length <= 24 && S().name === S().name.trim();
      return ok || `markup ${!!markup} pwn ${window.__pwn} name length ${S().name.length}`;
    } finally { lw.done(); clearIntro(); g.mode = 'play'; g.noSave = true; }
  });

  await T('qa.intro.a-name-from-another-player-cannot-inject-markup', async () => {
    fresh({}); window.__pwn = 0; const saved = [S().ending, g.mode, g.endTimer]; g.netMessage({ t: 'win', ending: 'plush', by: '<img src=x onerror="window.__pwn=1">' }); await realSleep(200);
    const img = document.querySelector('#toasts img[src="x"]'); S().ending = saved[0]; g.mode = saved[1]; g.endTimer = 0; try { g.ui.hideEnding(); } catch (e) { /* none up */ }
    for (const t of document.querySelectorAll('#toasts .toast')) t.remove(); return (!img && window.__pwn === 0) || 'markup from a remote name became live';
  });

  await T('qa.intro.day-number-is-right-at-every-edge', async () => {
    fresh({}); const cases = [[0, 1], [1439.9, 1], [1440, 2], [2879, 2], [2880, 3], [14400, 11], [-5, 1], [NaN, 1], [undefined, 1]];
    const bad = []; for (const [m, d] of cases) { S().gameMin = m; const n = g.dayNumber(); if (n !== d) bad.push(`${m} -> ${n} (want ${d})`); } S().gameMin = 0; return bad.length === 0 || bad.join('; ');
  });

  await T('qa.intro.the-morning-card-shows-once-per-day-with-the-right-number', async () => {
    fresh({}); const shown = []; const orig = g.ui.dayCard; g.ui.dayCard = (n, sub) => { shown.push(n); return orig.call(g.ui, n, sub); };
    try {
      // night of day 1, 06:58 (gameMin 1438): two game minutes later it is 07:00 on day 2
      S().gameMin = 1438; g.wasOpen = false; g._dayShown = 1; g.lightLevel = 0; for (let n = 0; n < 6; n++) g.updateClock(1);
      if (shown.join() !== '2') return 'cards shown over the day 2 sunrise: ' + shown.join(); if (document.getElementById('dcDay').textContent !== 'Day 2') return 'card text ' + $('dcDay').textContent;
      // the whole day passes, then the next dawn
      for (let n = 0; n < 200; n++) g.updateClock(14.4); if (shown.join() !== '2,3') return 'cards after a full day: ' + shown.join();
      // a game loaded in the middle of the night shows no card on load, then exactly the next day on the next dawn
      shown.length = 0; S().gameMin = 1440 * 4 + 800; g.loadWorld(S(), null); if (g._dayShown !== 5) return '_dayShown after loading mid-night day 5 is ' + g._dayShown; g.updateClock(0.5); if (shown.length) return 'a card on load: ' + shown.join();
      for (let n = 0; n < 400 && shown.length === 0; n++) g.updateClock(5); return shown.join() === '6' || 'next dawn showed ' + shown.join();
    } finally { g.ui.dayCard = orig; }
  });

  await T('qa.intro.a-guest-follows-the-host-clock-and-day', async () => {
    fresh({}); S().gameMin = 10; g.wasOpen = true; g._dayShown = 1; g.netMessage({ t: 'time', gameMin: 1440 * 6 + 20 }); const d = g.dayNumber(); g.updateClock(0.1); g.ui.setDay(g.dayNumber()); const txt = ($('clockDay') || {}).textContent;
    g.netMessage({ t: 'time', gameMin: 5 }); const back = g.dayNumber(); g.updateClock(0.1);   // the host went back (a fresh game): must not throw or show nonsense
    S().gameMin = 0; return (d === 7 && /DAY 7/.test(txt || 'DAY 7') && back === 1) || `day ${d} clock "${txt}" after a reset ${back}`;
  });

  await T('qa.intro.a-skipped-stretch-of-time-still-shows-the-right-day-at-the-next-dawn', async () => {
    fresh({}); const shown = []; const orig = g.ui.dayCard; g.ui.dayCard = (n, sub) => { shown.push(n); return orig.call(g.ui, n, sub); };
    try { S().gameMin = 200; g.wasOpen = true; g._dayShown = 1; g.updateClock(0.1); S().gameMin = 1440 * 3 + 1000; g.updateClock(0.1); shown.length = 0; for (let n = 0; n < 400 && !shown.length; n++) g.updateClock(5);
      return (shown.length === 1 && shown[0] === g.dayNumber() && shown[0] === 5) || `cards ${shown.join()} day ${g.dayNumber()}`; } finally { g.ui.dayCard = orig; S().gameMin = 0; }
  });
}
