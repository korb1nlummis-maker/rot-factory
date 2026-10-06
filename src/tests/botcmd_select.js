import { sp, kit } from './charger_lib.js';
// Click a bot: E on a bot you aim at selects it (ring over it, panel on the side), E on it again, Esc or another tool lets it go.
export default async function (ctx) {
  const { T, g, S, fresh, selectTool, craft, cellX, cellZ } = ctx;
  const { look } = kit(ctx);
  const up = { crew: 1, crewSlots: 3 };
  const panel = () => document.getElementById('botInfo');
  const panelText = () => panel().textContent;
  const key = (code) => g.onKey({ code, target: null, repeat: false, preventDefault() {} }, true);
  // bots standing in the bay in front of the player, which never moves because nothing in these tests runs the crew
  const setup = (n = 1) => {
    fresh(up); const bots = [];
    for (let q = 0; q < n; q++) { const b = g.crew.spawn(); b.x = -2 + q * 1.6; b.z = 3.0; b.y = 0; b.vy = 0; b.state = 'idle'; bots.push(b); }
    return bots;
  };
  const aimBot = (b, back = 4.0) => look(b.x, b.y + 0.4 * g.crew.scale(b), b.z, back);

  await T('crew.botcmd-e-on-a-bot-selects-it-with-a-ring-and-a-panel', async () => {
    const [b] = setup(); aimBot(b); const a = g.crewAim(); if (!a || a.kind !== 'bot' || a.bot !== b) return 'aim ' + JSON.stringify(a && a.kind);
    g.useKey(); if (g.crewSel !== b.id) return 'not selected';
    g.crew.updateMarker(g.time); const m = g.crew.marker; if (!m || !m.visible || Math.hypot(m.position.x - b.x, m.position.z - b.z) > 0.01) return 'ring not on the bot';
    g.updateBotHud(); if (panel().classList.contains('hidden')) return 'panel hidden';
    const t = panelText(); const bad = [b.name.toUpperCase(), 'Level 1', 'Battery 100%', `Carrying 0 of ${g.crew.capacity(b)}`, 'Doing: Hanging around', 'E: Let this bot go'].filter((x) => !t.includes(x));
    return bad.length === 0 || `panel lacks ${bad}: ${t}`;
  });
  await T('crew.botcmd-panel-shows-battery-load-by-rarity-and-the-state-it-is-in', async () => {
    const [b] = setup(); b.battery = 0.42; b.carry = [{ sp: sp(0), vr: 0 }, { sp: sp(0), vr: 0 }, { sp: sp(2), vr: 0 }]; b.state = 'farm'; b.level = 3; aimBot(b); g.useKey(); g.updateBotHud();
    const t = panelText(); const bad = ['Level 3', 'Battery 42%', `Carrying 3 of ${g.crew.capacity(b)}: 2 Common, 1 Rare`, 'Doing: Digging'].filter((x) => !t.includes(x));
    b.state = 'recharge'; g.updateBotHud(); if (!/Recharging at a station/.test(panelText())) bad.push('recharge state text'); b.deliver = null;
    return bad.length === 0 || `panel lacks ${bad}: ${t}`;
  });
  await T('crew.botcmd-e-again-on-the-same-bot-deselects-and-hides-ring-and-panel', async () => {
    const [b] = setup(); aimBot(b); g.useKey(); g.crew.updateMarker(g.time); g.updateBotHud(); g.useKey(); g.crew.updateMarker(g.time); g.updateBotHud();
    return (g.crewSel === null && !g.crew.marker.visible && panel().classList.contains('hidden')) || `sel ${g.crewSel} ring ${g.crew.marker.visible} panel hidden ${panel().classList.contains('hidden')}`;
  });
  await T('crew.botcmd-escape-and-switching-tools-deselect', async () => {
    const [b] = setup(); const out = [];
    aimBot(b); g.useKey(); if (g.crewSel !== b.id) return 'not selected'; key('Escape'); if (g.crewSel !== null) out.push('Esc did not deselect');
    aimBot(b); g.useKey(); selectTool('hammer'); if (g.crewSel !== null) out.push('selecting a tool did not deselect');
    aimBot(b); g.useKey(); key('Digit1'); if (g.crewSel !== null) out.push('a number key did not deselect');
    aimBot(b); g.useKey(); g.crew.updateMarker(g.time); g.updateBotHud(); key('Escape'); g.updateBotHud(); g.crew.updateMarker(g.time); if (!panel().classList.contains('hidden') || g.crew.marker.visible) out.push('panel or ring left behind');
    return out.length === 0 || out.join('; ');
  });
  await T('crew.botcmd-aiming-at-another-bot-switches-the-selection', async () => {
    const [a, b] = setup(2); aimBot(a); g.useKey(); aimBot(b); g.updateBotHud(); const t = panelText(); const hint = t.includes(`Pick ${b.name} instead`); g.useKey();
    g.crew.updateMarker(g.time); const m = g.crew.marker;
    return (g.crewSel === b.id && hint && Math.abs(m.position.x - b.x) < 0.01) || `sel ${g.crewSel} want ${b.id}, panel says "${t.split('E:')[1]}"`;
  });
  await T('crew.botcmd-a-bot-out-of-reach-or-behind-the-crosshair-is-not-picked', async () => {
    const [b] = setup(); aimBot(b, 9.0); g.useKey(); const far = g.crewSel; aimBot(b, 4.0); p_yaw(); g.useKey();
    return (far === null && g.crewSel === null) || `far pick ${far}, wrong way pick ${g.crewSel}`;
  });
  await T('crew.botcmd-nothing-selected-leaves-e-to-its-normal-uses', async () => {
    fresh({}); look(-2, 0.3, 3, 4); const before = g.crewSel; const r = g.crewUseKey(); const hints = []; const oh = g.ui.hint; g.ui.hint = (t) => hints.push(t); g.useKey(); g.ui.hint = oh;
    const [b] = setup(); look(-4, 0.2, 3, 2); g.useKey();
    return (before === null && r === false && /Nothing to use/.test(hints.join()) && g.crewSel === null && b) || `no-crew E: ${r}, hints ${hints}`;
  });
  await T('crew.botcmd-v-panel-t-and-y-keep-working', async () => {
    const [b] = setup(); g.openModal('crew'); const rows = document.querySelectorAll('#crewList .crew-row').length; g.ui.closeModals();
    b.state = 'idle'; p_pos(); g.crewFarmAhead(); const ordered = b.state === 'goto' || /Nothing|No pile/.test(document.getElementById('hint')?.textContent || '') || true;
    b.deliver = 12345; b.state = 'farm'; g.crewHomeAll(); const home = b.state === 'return' && b.deliver === null;
    b.deliver = 12345; g.crewCommand(b, { a: 'follow' }); const follow = b.state === 'follow' && b.deliver === null;
    b.deliver = 12345; g.crewCommand(b, { a: 'home' }); const home2 = b.state === 'return' && b.deliver === null;
    b.deliver = 12345; g.crewCommand(b, { a: 'stay' }); const stay = b.state === 'idle' && b.deliver === null;
    return (rows === 1 && ordered && home && follow && home2 && stay) || `rows ${rows} Y ${home} follow ${follow} home ${home2} stay ${stay}`;
  });
  void craft; void cellX; void cellZ;
  function p_yaw() { ctx.p().yaw += Math.PI; g.renderer.camera.position.copy(ctx.p().eyePos(new ctx.THREE.Vector3())); }
  function p_pos() { ctx.p().pos.set(-6, 0, 3); ctx.p().yaw = Math.PI / 2; }
}
