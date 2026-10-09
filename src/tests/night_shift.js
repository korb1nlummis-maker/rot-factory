import { findInfoRef, infoFor } from '../info.js';
import { upgradeById } from '../upgrades.js';
export default async function (ctx) {
  const { T, g, S, p, fresh, THREE } = ctx;
  await T('hall.night-shift-button-explains-its-price-and-keeps-the-lights-on-after-closing', async () => {
    fresh({}); const bad = []; const hn = g.hall.nightPos; if (!hn) return 'no night shift button in the hall';
    let btn = null; g.renderer.scene.traverse((o) => { if (o.name === 'nightButton') btn = o; }); if (!btn) bad.push('no button model');
    const u = upgradeById('nightshift'); if (!u || u.cost[0] !== 100e6) bad.push('upgrade missing or not 100M');
    // aim at it: the hover readout says 100,000,000
    p().pos.set(hn.x, 0, hn.z + 1.8); g.renderer.camera.position.set(hn.x, 1.6, hn.z + 1.8); p().yaw = Math.PI; p().pitch = -0.2; const ref = findInfoRef(g); if (!ref || ref.kind !== 'night') bad.push('hover does not find the button: ' + JSON.stringify(ref));
    const info = ref && infoFor(g, ref); const txt = info ? info.lines.join(' ') : ''; if (!/100,000,000/.test(txt) || !/lights/i.test(txt)) bad.push('readout: ' + txt);
    // press without the money: nothing happens
    S().money = 5e6; g.pressNightShift(); if (g.nightShiftOn() || S().money !== 5e6) bad.push('bought without the money');
    // press with the money: bought, 100M spent, lights stay on at midnight
    S().money = 150e6; g.pressNightShift(); if (!g.nightShiftOn()) bad.push('not bought'); if (S().money !== 50e6) bad.push('spent ' + (150e6 - S().money));
    S().gameMin = 1440 * 3 + 1380; g.hall.level = 0; g.lightLevel = 0; for (let n = 0; n < 80; n++) g.updateClock(0.1); if (!(g.hall.level > 0.9)) bad.push('lights did not stay on at night: ' + g.hall.level);
    g.syncLights(); if (g.lightLevel !== 1) bad.push('syncLights ignores night shift');
    // already on: says so and charges nothing
    const m1 = S().money; g.pressNightShift(); if (S().money !== m1) bad.push('charged twice');
    // and without it the lights do go out
    S().up.nightshift = 0; g.T = g.tune(); g.hall.level = 1; g.lightLevel = 1; g.closingGrace = 0; for (let n = 0; n < 200; n++) g.updateClock(0.1); if (!(g.hall.level < 0.5)) bad.push('lights stayed on without night shift: ' + g.hall.level);
    return bad.length === 0 || bad.join('; ');
  });
}
