import { CONTROLS, CONTROL_CODES } from '../controls.js';
export default async function (ctx) {
  const { T, g, S, fresh } = ctx;
  const click = (id) => { const b = document.getElementById(id); if (!b) throw new Error('no button #' + id); b.click(); };
  const open = () => g.ui.openModal;
  await T('ui.pause-menu-has-a-game-tab-and-a-controls-tab', async () => {
    fresh({}); g.ui.open('pause'); const game = !document.getElementById('pauseGame').classList.contains('hidden') && document.getElementById('pauseControls').classList.contains('hidden');
    document.querySelector('[data-ptab="controls"]').click(); const ctl = document.getElementById('pauseGame').classList.contains('hidden') && !document.getElementById('pauseControls').classList.contains('hidden');
    const rows = document.querySelectorAll('#ctlBody .ctlrow').length; const total = CONTROLS.reduce((n, gr) => n + gr.rows.length, 0); const on = document.querySelector('[data-ptab="controls"]').classList.contains('on');
    document.querySelector('[data-ptab="game"]').click(); const back = !document.getElementById('pauseGame').classList.contains('hidden'); g.ui.closeModals(); g.ui.open('pause'); const resets = !document.getElementById('pauseGame').classList.contains('hidden');
    g.ui.closeModals(); return (game && ctl && on && rows === total && back && resets) || `game tab first ${game}, controls tab ${ctl}, rows ${rows}/${total}, back ${back}, reopens on the game tab ${resets}`;
  });
  await T('ui.the-controls-list-matches-the-keys-the-game-really-handles', async () => {
    const src = await (await fetch('/src/game.js')).text(); const a = src.indexOf('  onKey(e, down) {'), b = src.indexOf('  onMouse(e, down) {'); const body = src.slice(a, b);
    const handled = new Set([...body.matchAll(/e\.code === '([A-Za-z0-9]+)'/g)].map((m) => m[1])); for (const m of body.matchAll(/startsWith\('Digit'\)/g)) for (let d = 1; d <= 9; d++) handled.add('Digit' + d);
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space', 'KeyC', 'ControlLeft', 'KeyH', 'F3', 'Mouse0', 'Mouse2', 'Wheel']) handled.add(c);
    for (const c of ['ArrowUp']) handled.delete(c); handled.delete('KeyG'); handled.delete('Enter'); handled.add('Enter');
    const missing = [...handled].filter((c) => !CONTROL_CODES.has(c)), stale = [...CONTROL_CODES].filter((c) => !handled.has(c));
    return (missing.length === 0 && stale.length === 0) || `handled but not listed: ${missing.join(' ')}; listed but not handled: ${stale.join(' ')}`;
  });
  await T('ui.controls-text-has-no-leftovers-and-matches-this-version', async () => {
    const all = CONTROLS.flatMap((gr) => gr.rows.map((r) => r.keys.join(' ') + ' ' + r.what)).join('\n'); const bad = [];
    if (/[—–]|undefined|NaN/.test(all)) bad.push('bad characters'); if (CONTROLS.some((gr) => gr.rows.some((r) => (r.keys.includes('F') || r.keys.includes('G')) && /grab/i.test(r.what)))) bad.push('old grab key'); if (!/F.*Flashlight/i.test(CONTROLS.find((gr) => gr.group === 'Hands').rows.map((r) => r.keys.join('') + r.what).join(' '))) bad.push('flashlight');
    const html = document.getElementById('pause').innerHTML; if (/Controls<\/summary>/.test(html)) bad.push('the old collapsible list is still there'); return bad.length === 0 || bad.join('; ');
  });
  await T('ui.how-to-play-shows-the-same-controls', async () => { return document.querySelectorAll('#howKeys .ctlrow').length === CONTROLS.reduce((n, gr) => n + gr.rows.length, 0) || 'how to play list differs'; });
  await T('ui.every-button-says-what-it-does', async () => {
    fresh({}); const bad = []; const wasConfirm = window.confirm, wasStart = g.startPlay, wasSave = g.save; let saved = 0; g.save = () => { saved++; return true; };
    try {
      g.ui.open('pause'); click('btnResume'); if (open()) bad.push('Resume did not close the pause menu');
      g.ui.open('pause'); click('btnSave'); if (!saved) bad.push('Save did not save'); g.ui.closeModals();
      for (const [id, modal] of [['btnShop', 'shop'], ['btnDex', 'dex'], ['btnAch', 'ach'], ['btnMulti2', 'multi'], ['btnHow2', 'howto']]) { g.ui.open('pause'); click(id); if (open() !== modal) bad.push(`#${id} "${document.getElementById(id).textContent}" opened "${open()}", not ${modal}`); g.ui.closeModals(); }
      let started = 0; g.startPlay = () => { started++; }; window.confirm = () => false; g.ui.open('pause'); click('btnReset'); if (started) bad.push('Abandon shift started a new game after pressing Cancel'); g.ui.closeModals();
    } finally { window.confirm = wasConfirm; g.startPlay = wasStart; g.save = wasSave; g.ui.closeModals(); }
    // every X closes its own window
    for (const m of document.querySelectorAll('.modal')) { const x = m.querySelector('[data-close]'); if (!x) continue; if (['travel', 'note'].includes(m.id)) continue; try { g.ui.open(m.id); } catch (e) { continue; } x.click(); if (!m.classList.contains('hidden')) bad.push(`the X on #${m.id} did not close it`); }
    // buttons that exist must have words and something to do
    for (const b of document.querySelectorAll('button')) { const label = (b.textContent || '').trim() || b.getAttribute('aria-label') || b.title; if (!label) bad.push('a button with no label: ' + (b.id || b.className)); }
    for (const id of ['btnContinue', 'btnNew', 'btnMulti', 'btnHow', 'btnResume', 'btnSave', 'btnShop', 'btnDex', 'btnAch', 'btnMulti2', 'btnHow2', 'btnReset', 'btnKeep', 'btnNew2', 'mpHost', 'mpJoin', 'mpHostManual', 'mpJoinManual', 'mpGo', 'crewAllHome', 'crewAllFollow']) { const b = document.getElementById(id); if (!b) { bad.push('missing #' + id); continue; } if (typeof b.onclick !== 'function') bad.push(`#${id} "${b.textContent.trim()}" does nothing`); }
    return bad.length === 0 || bad.slice(0, 6).join(' || ');
  });
  await T('ui.button-words-match-the-actions-they-run', async () => {
    const want = { btnResume: /resume/i, btnSave: /save/i, btnShop: /terminal/i, btnDex: /plushdex/i, btnAch: /achievement/i, btnMulti2: /play together/i, btnHow2: /how to play/i, btnReset: /abandon|new warehouse/i, btnNew: /new shift/i, btnContinue: /continue/i, btnMulti: /play together/i, btnHow: /how to play/i, crewAllHome: /home/i, crewAllFollow: /follow/i, btnKeep: /keep playing/i, btnNew2: /new warehouse/i };
    const bad = []; for (const [id, re] of Object.entries(want)) { const b = document.getElementById(id); if (!b || !re.test(b.textContent)) bad.push(`#${id} says "${b && b.textContent.trim()}"`); }
    // the crew buttons also name their key, and the key does what the label says
    if (!/\(Y\)/.test(document.getElementById('crewAllHome').textContent)) bad.push('Call all home does not name its key Y');
    return bad.length === 0 || bad.join('; ');
  });
}
