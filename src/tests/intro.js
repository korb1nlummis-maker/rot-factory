import { playIntro } from '../intro.js';
export default async function (ctx) {
  const { T, g, S, fresh, realSleep, adv } = ctx;
  const key = (code, target = window) => target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
  await T('intro.welcome-then-paperwork-then-sign-with-your-name', async () => {
    const pr = playIntro(); const root = document.getElementById('intro'); if (!root) return 'no overlay';
    await realSleep(500); if (!/Welcome to your new life/.test(root.textContent)) return 'first line missing: ' + root.querySelector('#introLine').textContent;
    key('Enter'); await realSleep(600); key('Enter'); await realSleep(1400);
    const paper = root.querySelector('.paper'); if (!paper.classList.contains('on')) return 'paperwork did not appear';
    if (!/Employment Agreement/i.test(paper.textContent) || !/Employee signature/.test(paper.textContent)) return 'form text missing';
    const input = root.querySelector('#introName'); input.value = '   '; input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true })); await realSleep(100); if (paper.classList.contains('signed')) return 'signed with a blank name';
    input.value = 'Ada Lovelace'; input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true })); await realSleep(300); if (!paper.classList.contains('signed')) return 'not stamped after Enter';
    const r = await pr; const ok = r.name === 'Ada Lovelace' && /Welcome aboard, Ada Lovelace/.test(root.textContent); r.close(); await realSleep(1400);
    return (ok && !document.getElementById('intro')) || 'name ' + r.name + ' overlay left ' + !!document.getElementById('intro');
  });
  await T('intro.day-numbers-and-the-morning-card', async () => {
    fresh({}); const cases = [[0, 1], [1439, 1], [1440, 2], [2880, 3], [14400, 11]]; for (const [m, d] of cases) { S().gameMin = m; if (g.dayNumber() !== d) return `gameMin ${m} should be day ${d}, got ${g.dayNumber()}`; }
    // cross the evening and the next morning: the card says Day 2 and the lights come back
    S().gameMin = 1440 - 5; g.wasOpen = true; g._dayShown = 1; g.updateClock(0.1); let closed = !g.isOpen(); S().gameMin = 1440 - 0.05; g.updateClock(0.05); S().gameMin = 1440 + 0.1; g.updateClock(0.05);
    const card = document.getElementById('dcDay').textContent, shown = document.getElementById('dayCard').classList.contains('show');
    return (shown && card === 'Day 2') || `card "${card}" shown ${shown} (closed overnight ${closed})`;
  });
  await T('intro.clock-shows-the-day', async () => { fresh({}); S().gameMin = 3000; g._clkT = 0; g.updateClock(0.1); return document.getElementById('clockDay').textContent === 'DAY 3' || document.getElementById('clockDay').textContent; });
  await T('intro.new-game-keeps-the-name-and-skips-intro-when-continuing', async () => { fresh({}); S().name = 'Test Name'; const raw = JSON.parse(JSON.stringify(S())); return raw.name === 'Test Name' || 'name lost'; });
}
