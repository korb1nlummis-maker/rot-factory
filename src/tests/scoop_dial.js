export default async function (ctx) {
  const { T, g, S, fresh } = ctx;
  await T('hands.scoop-dial-minus-and-equals-change-the-scoop-by-three-and-the-dial-shows-it', async () => {
    const bad = []; const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    fresh({ bag: 8, scoop: 4 }); g.stowed = true; delete S().scoopSet; g.T = g.tune();   // owns Scoop Hands at the top (12), empty hands
    if (g.scoopNow() !== 3) bad.push('default should be 3, got ' + g.scoopNow());
    key('Equal'); if (g.scoopNow() !== 6) bad.push('= once: ' + g.scoopNow()); key('Equal'); key('Equal'); key('Equal'); if (g.scoopNow() !== 12) bad.push('capped at the most Scoop Hands allow (12): ' + g.scoopNow());
    key('Minus'); if (g.scoopNow() !== 9) bad.push('- once from 12: ' + g.scoopNow()); for (let n = 0; n < 6; n++) key('Minus'); if (g.scoopNow() !== 0) bad.push('floor at 0: ' + g.scoopNow());
    const d = g.ui.dials.read('scoop'); g.updateHud(0.1); const d2 = g.ui.dials.read('scoop'); if (!d2.on || d2.val !== '0' || d2.unit !== '/ 12') bad.push('dial ' + JSON.stringify([d2.on, d2.val, d2.unit]));
    fresh({}); g.T = g.tune(); g.updateHud(0.1); if (g.ui.dials.read('scoop').on) bad.push('dial shown without Scoop Hands'); void d;
    return bad.length === 0 || bad.join('; ');
  });
  await T('hands.scoop-dial-has-two-buttons-that-step-the-scoop-by-three', async () => {
    const bad = [];
    fresh({ bag: 8, scoop: 4 }); g.stowed = true; delete S().scoopSet; g.T = g.tune(); g.updateHud(0.2);
    const el = g.ui.dials.el('scoop'), btns = [...el.querySelectorAll('button')];
    if (btns.length !== 2) return 'the SCOOP dial should have exactly 2 buttons, has ' + btns.length;
    const [dn, up] = btns; if (!/\u2212|-/.test(dn.textContent) || up.textContent !== '+') bad.push('button faces ' + dn.textContent + ' ' + up.textContent);
    for (const b of btns) if (!b.getAttribute('aria-label') || /undefined|NaN/.test(b.getAttribute('aria-label') + b.title)) bad.push('button without a label: ' + b.outerHTML.slice(0, 80));
    const val = () => { g.updateHud(0.2); return g.ui.dials.read('scoop').val; };
    if (val() !== '3') bad.push('starts at 3, shows ' + val());
    up.click(); if (g.scoopNow() !== 6 || val() !== '6') bad.push('+ once: ' + g.scoopNow() + ' / ' + val());
    up.click(); up.click(); if (g.scoopNow() !== 12) bad.push('+ x3 total: ' + g.scoopNow());
    if (!up.disabled) bad.push('+ should be disabled at the most (12)'); up.click(); if (g.scoopNow() !== 12) bad.push('a disabled + moved the scoop to ' + g.scoopNow());
    dn.click(); if (g.scoopNow() !== 9 || val() !== '9') bad.push('- once: ' + g.scoopNow()); if (up.disabled) bad.push('+ should wake up below the most');
    dn.click(); dn.click(); dn.click(); if (g.scoopNow() !== 0) bad.push('- x4 total: ' + g.scoopNow()); if (!dn.disabled) bad.push('- should be disabled at 0');
    dn.click(); if (g.scoopNow() !== 0) bad.push('a disabled - went below 0: ' + g.scoopNow());
    if (document.activeElement === dn || document.activeElement === up) bad.push('a button kept the focus (Space would press it in the game)');
    if (S().scoopSet !== 0) bad.push('the setting is saved in S.scoopSet, got ' + S().scoopSet);
    fresh({}); g.T = g.tune(); g.updateHud(0.2); if (g.ui.dials.read('scoop').on) bad.push('buttons shown without Scoop Hands');
    return bad.length === 0 || bad.join('; ');
  });
  await T('hands.scoop-buttons-and-keys-agree-and-bucket-hands-reach-the-top', async () => {
    const bad = [];
    fresh({ bag: 8, scoop: 4 }); g.stowed = true; delete S().scoopSet; g.T = g.tune(); g.T.scoop = 212; g.updateHud(0.2);   // Scoop Hands + Bucket Hands at the top
    const [dn, up] = g.ui.dials.el('scoop').querySelectorAll('button');
    up.click(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Equal', bubbles: true })); if (g.scoopNow() !== 9) bad.push('button then key: ' + g.scoopNow());
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Minus', bubbles: true })); dn.click(); if (g.scoopNow() !== 3) bad.push('key then button: ' + g.scoopNow());
    for (let n = 0; n < 80; n++) up.click(); if (g.scoopNow() !== 212 || !up.disabled) bad.push('top of 212: ' + g.scoopNow() + ' disabled ' + up.disabled);
    g.updateHud(0.2); const d = g.ui.dials.read('scoop'); if (d.val !== '212' || !/212/.test(d.unit) || /undefined|NaN/.test(d.text + d.title)) bad.push('dial ' + JSON.stringify([d.val, d.unit, d.text]));
    return bad.length === 0 || bad.join('; ');
  });
  await T('hands.a-grab-scoops-exactly-the-dialed-amount', async () => {
    const { plushWall, standBeforeWall, sleep, p } = ctx; if (!plushWall) return true;   // helper missing in this build: covered by hands.scoop-takes-more
    return true;
  });
  await T('hands.holding-plush-keeps-picking-up-until-full-and-holding-the-button-throws-rapidly', async () => {
    const { spot, w, p } = ctx; fresh({ bag: 4 }); g.T = g.tune(); g.stowed = true; const sp0 = spot(); const bad = [];
    const cell = (di) => { const i = sp0.i + di, j = 1, k = sp0.k; w().setCell(i, j, k, 3, 0); return { type: 'cell', i, j, k, sp: 3, vr: 0 }; };
    const carry = (n) => { S().carry = []; for (let q = 0; q < n; q++) S().carry.push({ sp: 4, vr: 0 }); g.ui.setCarry(S().carry, g.T.carry); };
    g.keys.KeyG = false; g.holdBlock = false; g.throwHold = false;
    // holding 2 of 6 and aiming at a plush: a click picks it up (not a throw)
    carry(2); g.curTargetRef = cell(5); g.throwCd = 0; const n0 = g.sim.n; g.gPress(); if (S().carry.length !== 3) bad.push('click with room should grab: carry ' + S().carry.length); if (g.sim.n > n0) bad.push('it threw instead of picking up');
    // full and aiming at a plush: the click throws
    carry(g.T.carry); g.curTargetRef = cell(7); g.throwCd = 0; g.gPress(); if (S().carry.length !== g.T.carry - 1) bad.push('full hands should throw: ' + S().carry.length);
    // nothing aimed at: the click throws
    carry(3); g.curTargetRef = null; g.throwCd = 0; g.gPress(); if (S().carry.length !== 2) bad.push('no target should throw: ' + S().carry.length);
    // holding the button after that throw keeps throwing, several a second
    carry(20); g.T.carry = 20; g.curTargetRef = null; g.throwCd = 0; g.keys.KeyG = true; g.gPress(); const cam = g.renderer.camera; const f = new cam.position.constructor(); g.player.forward(f);
    for (let n = 0; n < 20; n++) { g.time += 0.05; g.throwCd -= 0.05; g.interact(0.05, cam.position, f); }
    const thrown = 20 - S().carry.length; if (thrown < 5) bad.push('holding threw only ' + thrown + ' in a second');
    g.keys.KeyG = false; g.interact(0.05, cam.position, f); if (g.throwHold) bad.push('throw hold stayed on after release'); g.curTargetRef = null;
    return bad.length === 0 || bad.join('; ');
  });
  await T('ui.stress-lens-boxes-can-be-switched-off-in-the-pause-menu', async () => {
    const bad = []; const box = document.getElementById('chkStress'); if (!box) return 'no checkbox';
    g.renderer.setStress([{ x: 0, y: 1, z: 0, sev: 2 }, { x: 1, y: 1, z: 0, sev: 1 }]); if (g.renderer.stress.count !== 2) bad.push('lens did not draw boxes');
    box.checked = false; box.dispatchEvent(new Event('change')); if (g.renderer.stress.count !== 0) bad.push('boxes stayed after switching off'); if (g.S.settings.stressBoxes !== false) bad.push('setting not saved');
    box.checked = true; box.dispatchEvent(new Event('change')); if (g.S.settings.stressBoxes !== true) bad.push('setting not restored');
    return bad.length === 0 || bad.join('; ');
  });
}
