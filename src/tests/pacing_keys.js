import { COST_SCALE, UPGRADES } from '../upgrades.js';
export default async function (ctx) {
  const { T, g, S, p, fresh, adv } = ctx;
  const key = (code, down = true) => g.onKey({ code, preventDefault() {}, repeat: false, target: document.body }, down);
  await T('hands.a-missed-key-release-never-keeps-you-walking', async () => {
    fresh({}); const bad = [];
    // holding W while the terminal opens: the key-up never arrives
    key('KeyW', true); g.ui.open('shop'); if (g.keys.KeyW) bad.push('W still held after a menu opened'); g.ui.closeModals(); if (g.keys.KeyW) bad.push('W came back after the menu closed');
    key('KeyW', true); key('ShiftLeft', true); window.dispatchEvent(new Event('blur')); if (g.keys.KeyW || g.keys.ShiftLeft) bad.push('keys survived losing window focus');
    key('KeyD', true); document.dispatchEvent(new Event('pointerlockchange')); if (g.keys.KeyD) bad.push('D survived the pointer lock changing');
    key('KeyA', true); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; if (g.keys.KeyA) bad.push('A survived the tab being hidden');
    // and a key pressed after all that still works
    key('KeyW', true); const pressed = g.keys.KeyW === true; key('KeyW', false); if (!pressed || g.keys.KeyW) bad.push('a normal press and release no longer works');
    // the player really stops moving: no input while the keys are clear
    fresh({}); key('KeyW', true); g.ui.open('shop'); g.ui.closeModals(); const x0 = p().pos.x, z0 = p().pos.z; adv(1.0); const moved = Math.hypot(p().pos.x - x0, p().pos.z - z0);
    if (moved > 0.3) bad.push(`the player walked ${moved.toFixed(1)} m on its own`);
    return bad.length === 0 || bad.join('; ');
  });
  await T('economy.prices-are-scaled-up-and-the-income-multipliers-are-tamed', async () => {
    fresh({}); const bad = []; if (COST_SCALE !== 12) bad.push('cost scale ' + COST_SCALE);
    const bag = UPGRADES.find((u) => u.id === 'bag'); if (bag.cost[0] !== 14 * COST_SCALE) bad.push('carry capacity costs ' + bag.cost[0]);
    S().up = { dex: 1 }; g.T = g.tune(); S().dex = Object.fromEntries(Array.from({ length: 1628 }, (_, i) => [i + 1, 1])); S().stats.maxDist = 4900; const base = (() => { S().up = {}; g.T = g.tune(); S().dex = {}; S().stats.maxDist = 0; return g.valueOf(1, 0, 0); })();
    S().up = { dex: 1 }; g.T = g.tune(); S().dex = Object.fromEntries(Array.from({ length: 1628 }, (_, i) => [i + 1, 1])); S().stats.maxDist = 4900; const full = g.valueOf(1, 0, 0); const ratio = full / base;
    if (!(ratio > 40 && ratio < 70)) bad.push(`a common plush from 4.9 km with a full dex pays ${ratio.toFixed(1)}x base (want 40 to 70x, it used to be about 600x)`);
    S().stats.maxDist = 0; S().dex = {}; return bad.length === 0 || bad.join('; ');
  });
}
