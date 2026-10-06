import { kit } from './charger_lib.js';
// The V crew modal: a plain-language intro, a legend, labelled controls with tooltips, one status sentence per bot, a battery bar.
export default async function (ctx) {
  const { T, g, S, fresh, tiles, placeAtFloor } = ctx;
  const { rawTile, json } = kit(ctx);
  const up = { crew: 1, crewSlots: 3, power: 1 };
  const open = () => { g.ui.renderCrew(); return document.getElementById('crewList'); };
  const rows = () => [...document.querySelectorAll('#crewList .crew-row')];
  const statusOf = (row) => row.querySelector('[data-live=status]').textContent;

  await T('crew.botcmd-modal-intro-explains-crew-battery-station-and-click-control', async () => {
    fresh(up); g.crew.spawn(); open(); const t = document.getElementById('crewIntro').textContent;
    const bad = [/dig tunnels/, /haul plush/, /battery/i, /Charging Station/, /aim at a bot and press E/i, /T send the whole crew digging/, /Y call the whole crew home/, /What the status words mean/, /Waiting for a Charging Station/, /Digging/, /Recharging/].filter((r) => !r.test(t));
    return (bad.length === 0 && !/—/.test(t)) || `intro lacks ${bad}`;
  });
  await T('crew.botcmd-modal-every-control-has-a-real-word-label-and-a-tooltip', async () => {
    fresh(up); g.crew.spawn(); g.crew.spawn(); await placeAtFloor('gen', -3.4, 3.0, 2.0); rawTile('charger', ctx.toI(-3.4), 0, ctx.toK(5)); g.refreshTuning(); open();
    const bad = []; const btns = [...document.querySelectorAll('#crewList button')];
    for (const want of ['Follow me', 'Stay at the bin', 'Go home and unload', 'Recharge now', 'Keep generator fuelled', 'Dig north', 'Dig east', 'Dig south', 'Dig west']) if (!btns.some((b) => b.textContent === want)) bad.push('missing ' + want);
    for (const b of [...btns, ...document.querySelectorAll('#crewAllHome, #crewAllFollow')]) { if (b.textContent.trim().length < 6) bad.push('bare label "' + b.textContent + '"'); if (!b.title || b.title.length < 12) bad.push('no tooltip on ' + b.textContent); }
    const all = document.getElementById('crew').textContent + btns.map((b) => b.title).join(''); if (/—/.test(all)) bad.push('em dash in the modal');
    if (!/Y\)/.test(document.getElementById('crewAllHome').textContent)) bad.push('Y key not shown');
    return bad.length === 0 || bad.join('; ');
  });
  await T('crew.botcmd-modal-recharge-and-generator-controls-only-when-they-can-work', async () => {
    fresh(up); g.crew.spawn(); open(); const has = (w) => [...document.querySelectorAll('#crewList button')].some((b) => b.textContent === w);
    const none = !has('Recharge now') && !has('Keep generator fuelled'); await placeAtFloor('gen', -3.4, 3.0, 2.0); rawTile('charger', ctx.toI(-3.4), 0, ctx.toK(5)); open();
    return (none && has('Recharge now') && has('Keep generator fuelled')) || `without: ${none}, with: ${has('Recharge now')}/${has('Keep generator fuelled')}`;
  });
  await T('crew.botcmd-modal-status-sentence-matches-the-real-state', async () => {
    fresh(up); const b = g.crew.spawn(); b.state = 'farm'; b.dir = 0; b.adv = 3; b.battery = 0.72; b.carry = [{ sp: 1, vr: 0 }, { sp: 1, vr: 0 }, { sp: 1, vr: 0 }, { sp: 1, vr: 0 }]; open(); const r = rows()[0]; const bad = [];
    if (statusOf(r) !== 'Digging east, 3 cells in, battery 72%, carrying 4 plush') bad.push(statusOf(r));
    const cases = [['goto', /^Heading out to dig east/], ['return', /^Hauling plush back to the bin/], ['unload', /^Unloading at the bin/], ['follow', /^Following you/], ['idle', /^Waiting at the bin/], ['chgwalk', /^Walking to a Charging Station/], ['recharge', /^Recharging at a Charging Station/], ['haulgo', /^Fetching your cart load/], ['blocked', /^Blocked/]];
    for (const [st, re] of cases) { b.state = st; g.ui.updateCrewLive(); if (!re.test(statusOf(r))) bad.push(st + ': ' + statusOf(r)); if (!r.querySelector('.crew-head em').textContent) bad.push('no head state'); }
    b.state = 'lowbat'; g.ui.updateCrewLive(); if (!statusOf(r).startsWith(`Build a Charging Station: ${b.name} is out of power`)) bad.push('lowbat without a station: ' + statusOf(r));
    const ch = rawTile('charger', ctx.toI(-3.4), 0, ctx.toK(5)); ch.reserve = 3; g.ui.updateCrewLive(); if (!statusOf(r).startsWith('Waiting for a Charging Station')) bad.push('lowbat with a station: ' + statusOf(r));
    return bad.length === 0 || bad.join(' | ');
  });
  await T('crew.botcmd-modal-battery-bar-shows-percent-and-turns-warning-colour-when-low', async () => {
    fresh(up); const b = g.crew.spawn(); b.battery = 0.8; open(); const r = rows()[0]; const bar = r.querySelector('[data-live=bat]'), pct = r.querySelector('[data-live=batpct]'); const bad = [];
    if (bar.style.width !== '80%' || pct.textContent !== '80%') bad.push(`full: ${bar.style.width} ${pct.textContent}`); const good = bar.style.background;
    b.battery = 0.2; g.ui.updateCrewLive(); if (bar.style.width !== '20%' || !/LOW/.test(pct.textContent) || bar.style.background === good) bad.push(`low: ${bar.style.width} "${pct.textContent}" colour ${bar.style.background}`);
    return bad.length === 0 || bad.join('; ');
  });
  await T('crew.botcmd-modal-buttons-give-the-real-orders', async () => {
    fresh(up); const b = g.crew.spawn(); b.deliver = 1234; b.state = 'farm'; open(); const click = (w) => [...document.querySelectorAll('#crewList button')].find((x) => x.textContent === w).click(); const bad = [];
    click('Go home and unload'); if (b.state !== 'return' || b.deliver !== null) bad.push('home ' + b.state);
    click('Follow me'); if (b.state !== 'follow') bad.push('follow ' + b.state); click('Stay at the bin'); if (b.state !== 'idle') bad.push('stay ' + b.state);
    ctx.p().pos.set(-6, 0, 3); ctx.p().yaw = Math.PI / 2; ctx.p().pitch = 0; g.renderer.camera.position.copy(ctx.p().eyePos(new ctx.THREE.Vector3())); click('Dig east'); if (b.state !== 'goto' && b.state !== 'idle') bad.push('dig ' + b.state);
    const gen = await placeAtFloor('gen', -3.4, 3.0, 2.0); void gen; open(); const nearestFace = g.crew.nearestFace(-3.4, 0, 3.0); click('Keep generator fuelled'); const gt = tiles().find((t) => t.type === 'gen');
    if (nearestFace && b.deliver !== gt.id) bad.push('fuel ' + b.deliver);
    return bad.length === 0 || bad.join('; ');
  });
  await T('crew.botcmd-modal-works-for-a-guest-and-sends-the-same-orders', async () => {
    fresh(up); const b = g.crew.spawn(); rawTile('charger', ctx.toI(-3.4), 0, ctx.toK(5)).reserve = 3; const sent = []; g.netSend = (m) => sent.push(json(m)); g.net.open = true; g.net.role = 'guest'; g.guestReady = true;
    try {
      open(); if (rows().length !== 1) return 'rows ' + rows().length; const click = (w) => [...document.querySelectorAll('#crewList button')].find((x) => x.textContent === w).click();
      click('Follow me'); click('Recharge now'); click('Dig east'); const cmds = sent.filter((m) => m.t === 'cmd' && m.c === 'crew');
      const one = cmds.find((m) => m.d.act === 'one' && m.d.d.a === 'follow'), ctxs = cmds.filter((m) => m.d.act === 'ctx');
      return (one && ctxs.some((m) => m.d.tgt.k === 'tile') && b.state === 'idle') || `cmds ${JSON.stringify(cmds.map((m) => [m.d.act, m.d.tgt && m.d.tgt.k]))}`;
    } finally { delete g.netSend; g.net.open = false; g.net.role = null; g.guestReady = false; }
  });
}
