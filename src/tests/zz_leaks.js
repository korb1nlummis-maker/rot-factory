// zz_leaks.*: the last test of a full run. A test that swaps a game function or flips a global and does not put it back makes the tests after it fail only in a full run
// (they pass alone), so this looks at what a clean page has and a finished run must still have: a toast and a hint that show, no friend and no net stub, a courier that sleeps,
// a real audio context, and a clock that only went forward (src/selftest.js checks that one after every test and names the test that set it back).
// Run it on its own and it passes trivially; run it after the rest (`await __selftest('')`) and it names whatever was left behind.
export default async function (ctx) {
  const { T, g, fresh } = ctx;
  await T('zz.leaks.nothing-a-test-swapped-or-flipped-is-still-swapped-or-flipped-at-the-end-of-the-run', async () => {
    const bad = []; if (g.logi.visualOnly && !g.isGuest()) bad.push('g.logi.visualOnly is still true (the last frames ran as a guest: belts, hoses and sorters stand still for every later test; fresh() now resets it)'); g.logi.visualOnly = false;
    if (g._deathTimers && g._deathTimers.size) bad.push(g._deathTimers.size + ' wake-up timer(s) of a death or a pass-out still wait (a test killed the player and did not let it finish: it moves the player in whatever test runs 1.4 s later; fresh() now cancels them)'); g.cancelDeaths();
    { const b = g.S.boosts; if (b && (b.sell || b.dig || b.carry || b.stab || b.scan || (b.digMul ?? 1) !== 1)) bad.push('S().boosts is still ' + JSON.stringify(b) + ' (a test earned a permanent boost and did not put it back; fresh() now resets it)'); }
    fresh({});
    const box = document.getElementById('toasts'), hint = document.getElementById('hint');
    if (!box) bad.push('no #toasts box');
    else { box.innerHTML = ''; const n0 = box.children.length; g.ui.toast({ icon: '?', title: 'leakprobe', text: 'x', ms: 50 }); const el = box.firstElementChild; if (box.children.length !== n0 + 1 || !el || !/leakprobe/.test(el.textContent)) bad.push('g.ui.toast does not put a toast on screen (a test left it swapped for a stub)'); if (el && /leakprobe/.test(el.textContent)) el.remove(); }
    if (!hint) bad.push('no #hint'); else { const h0 = hint.innerHTML; g.ui.hint('leakprobe', 0.01); if (!/leakprobe/.test(hint.innerHTML)) bad.push('g.ui.hint does not show its text (a test left it swapped for a stub)'); hint.innerHTML = h0; g.ui.hintTimer = 0; }
    if (g.net.open) bad.push('g.net.open is still true');
    if (g.net.role) bad.push('g.net.role is still ' + g.net.role);
    if (g.guestReady) bad.push('g.guestReady is still true');
    if (g.remote) bad.push('g.remote is still set (a friend left standing)');
    if (Object.prototype.hasOwnProperty.call(g, 'netSend') && g.netSend !== Object.getPrototypeOf(g).netSend) bad.push('g.netSend is still a stub of a test (delete it)');
    if (!g.careOff) bad.push('g.careOff is false: the courier drone is awake');
    if (g.mode !== 'play') bad.push('g.mode is ' + g.mode);
    if (g.isGuest()) bad.push('the page still thinks it is a guest');
    if (!Number.isFinite(g.shake)) bad.push('g.shake is ' + g.shake);
    if (!Number.isFinite(g.time)) bad.push('g.time is ' + g.time);
    const s = g.sound, c = s && s.ctx;
    if (c) { try { const o = c.createOscillator(); if (typeof o.frequency.setValueAtTime !== 'function') bad.push('g.sound.ctx is a fake audio context (its oscillators have no setValueAtTime): Sound.tone throws in every later frame that plays a note'); else o.disconnect(); } catch (e) { bad.push('g.sound.ctx cannot make an oscillator: ' + e.message); } }
    const proto = s ? Object.getPrototypeOf(s) : null, swapped = [];
    if (proto) for (const k of Object.keys(s)) if (typeof s[k] === 'function' && typeof proto[k] === 'function' && s[k] !== proto[k]) swapped.push(k);   // (a double put back as the very function it replaced is fine; a wrapper, a stub or a .bind() copy is not: a bound method pins `this` to the root and every later sound.at() plays at full volume)
    if (swapped.length) bad.push('g.sound methods still swapped for a test double: ' + swapped.join(', '));
    return bad.length === 0 || bad.join('; ');
  });
}
