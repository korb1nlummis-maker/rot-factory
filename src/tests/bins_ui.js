// bins.ui.*: the key (;), the bins panel, the crew panel's bin button, E on a Depot Beacon with a bot selected, copy and paste, the readouts and the texts. Everything here is pressed
// the way a player presses it (real key events, real clicks on the panel's buttons). Run: `await __selftest('bins.ui.')`
import { kit } from './bins_lib.js';
import { makeIO } from './truth_world_lib.js';
import * as BINS from '../bins.js';
import * as BP from '../binspanel.js';
import * as XT from '../ext.js';
import { infoFor, findInfoRef } from '../info.js';

export default async function (ctx) {
  const { g, S, p, toI, toK, cellX, cellZ, THREE, aimPoint, craft } = ctx;
  const K = kit(ctx);
  const io = makeIO(ctx);
  const G = K.guard;
  const look = (x, y, z, back = 2.5) => { aimPoint(x, y, z, back); g.renderer.camera.position.copy(p().eyePos(new THREE.Vector3())); };
  // stand at (px, pz) and face the point (x, y, z): from the side of a belt line, so the first tile the ray meets is the one aimed at
  const lookFrom = (px, pz, x, y, z) => { p().pos.set(px, 0, pz); p().vel.set(0, 0, 0); const e = p().eyePos(new THREE.Vector3()); p().yaw = Math.atan2(x - e.x, z - e.z); p().pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z)); g.renderer.camera.position.copy(p().eyePos(new THREE.Vector3())); };
  const panel = () => document.getElementById('binpanel');
  const rows = () => [...document.querySelectorAll('#binBody .trow[data-bin]')];
  const btn = (txt) => [...document.querySelectorAll('#binpanel button')].find((b) => b.textContent === txt);
  const title = () => document.getElementById('binTitle').textContent;
  const act = () => { g.updateBotHud(); return document.getElementById('biAct').textContent; };
  const botText = () => { g.updateBotHud(); return document.getElementById('botInfo').textContent; };

  await G('bins.ui.b-on-an-aimed-machine-opens-its-panel-and-a-click-picks-the-bin', async () => {
    const bad = [], d = K.beacon(8, 10); K.run(0.2); const e = K.beacon(-4, 8, { name: 'Deep Dig' }); K.run(0.2); const tk = K.mkEarth('truck', toI(-2), toK(2)); BINS.note(g, d.id, 40, 1234);
    p().pos.set(0, 0, 2); look(tk.px, 0.5, tk.pz, 2.5); io.tap('KeyB');
    if (g.ui.openModal !== 'binpanel') return 'the panel did not open: ' + g.ui.openModal;
    if (!/BINS: HAUL TRUCK/.test(title())) bad.push('title ' + title());
    const txt = panel().textContent;
    for (const w of ['Auto', 'SORT bin', 'Depot A', 'Deep Dig', 'm away', 'sold today 40 plush for ◈1,234', '0 bots, 0 machines assigned']) if (!txt.includes(w)) bad.push('missing "' + w + '"');
    if (/—/.test(txt)) bad.push('em dash in the panel');
    if (rows().length !== 3) bad.push('rows ' + rows().length);
    if (!btn('In use') || btn('Use Auto')) bad.push('Auto should be the one in use');
    btn('Use Deep Dig').click();
    if (tk.dest !== e.id) bad.push('Use Deep Dig set ' + tk.dest);
    if (!/Sells at: Deep Dig/.test(panel().textContent)) bad.push('the panel does not show the new bin');
    // ; in the panel steps to the next bin: after the last one, back to Auto
    io.tap('KeyB'); if (tk.dest !== 0) bad.push('B after the last bin should wrap to Auto, dest ' + tk.dest);
    io.tap('KeyB'); if (tk.dest !== BINS.HALL) bad.push('B then the SORT bin, dest ' + tk.dest);
    io.tap('KeyB'); if (tk.dest !== d.id) bad.push('B then Depot A, dest ' + tk.dest);
    g.ui.closeModals(); if (panel() && !panel().classList.contains('hidden')) bad.push('the panel stayed open');
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.ui.a-belt-end-takes-a-bin-a-belt-in-the-middle-says-where-to-aim', async () => {
    const bad = [], d = K.beacon(8, 10); K.run(0.2); const a = K.rawTile('belt', toI(-4), toK(0), { dir: 0 }), b2 = K.rawTile('belt', toI(-4) + 1, toK(0), { dir: 0 }); K.run(0.2);
    lookFrom(cellX(a.i), cellZ(a.k) - 2.2, cellX(a.i), 0.3, cellZ(a.k)); io.tap('KeyB');
    if (g.ui.openModal !== 'binpanel') bad.push('no panel for a belt'); else {
      if (!/last piece of the line/.test(panel().textContent)) bad.push('a belt with a belt after it should say where to aim: ' + panel().textContent.slice(0, 160));
      if (btn('Use Depot A')) bad.push('a Use button on a belt that is not the end');
      if (btn('Rename') === undefined) bad.push('rename must stay');
    }
    g.ui.closeModals(); lookFrom(cellX(b2.i), cellZ(b2.k) - 2.2, cellX(b2.i), 0.3, cellZ(b2.k)); io.tap('KeyB');
    if (!btn('Use Depot A')) bad.push('the end of the line has no Use button'); else { btn('Use Depot A').click(); if (b2.dest !== d.id) bad.push('belt end dest ' + b2.dest); }
    g.ui.closeModals();
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.ui.nothing-aimed-is-an-overview-and-rename-renames-for-good', async () => {
    const bad = [], d = K.beacon(8, 10); K.run(0.2); p().pos.set(0, 0, 4); look(0, 0.5, 20, 2); io.tap('KeyB');
    if (g.ui.openModal !== 'binpanel' || title() !== 'BINS') return 'overview did not open: ' + g.ui.openModal + ' ' + title();
    if (/Use /.test(panel().textContent.replace(/Use the|Used/g, ''))) bad.push('the overview should have no Use buttons');
    btn('Rename').click(); const inp = document.querySelector('#binBody [data-nameinput]'); if (!inp) return 'no name box'; inp.value = 'North Face <i>'; btn('Save name').click();
    if (d.name !== 'North Face i') bad.push('name ' + JSON.stringify(d.name));
    if (!rows().some((r) => r.textContent.includes('North Face i'))) bad.push('the panel does not show the new name');
    const b = g.beaconList().find((x) => x.id === d.id); if (!b || b.name !== 'North Face i') bad.push('travel menu name ' + (b && b.name));
    btn('Rename').click(); document.querySelector('#binBody [data-clearname]').click(); if (d.name !== '' || BINS.nameOf(g, d) !== 'Depot A') bad.push('reset: ' + d.name);
    g.ui.closeModals();
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.ui.a-bot-takes-its-bin-from-e-on-a-depot-and-from-e-on-the-sort-bin', async () => {
    const bad = [], d = K.beacon(8, 10); K.run(0.2); const b = K.mkBot(2, 5); g.crewSel = b.id;
    // the sort bin on Auto is what it always was
    const bp = K.bin(); p().pos.set(bp.x - 3, 0, bp.z + 3); look(bp.x, 1.0, bp.z, 2.5); let t = act(); if (t !== 'E: Go home and unload') bad.push('E on the bin: "' + t + '"');
    // a depot
    p().pos.set(5, 0, 8); look(d.x, 0.9, d.z, 2.5); t = act(); if (t !== 'E: Unload at Depot A from now on') bad.push('E on a depot: "' + t + '"');
    if (!/Unloads at: Auto: the SORT bin, as before/.test(botText())) bad.push('the panel should say where it unloads now: ' + botText());
    io.tap('KeyE'); if (b.dest !== d.id) bad.push('E on the depot set ' + b.dest);
    if (!/Unloads at: Depot A \(\d+ m\)/.test(botText())) bad.push('panel after: ' + botText());
    if (g.crewSel !== b.id) bad.push('the selection was lost');
    // a bot that already has this depot: go and unload there
    look(d.x, 0.9, d.z, 2.5); t = act(); if (t !== 'E: Go and unload at Depot A') bad.push('second E text: ' + t);
    // the SORT bin with a depot assigned: back to the SORT bin from now on
    p().pos.set(bp.x - 3, 0, bp.z + 3); look(bp.x, 1.0, bp.z, 2.5); t = act(); if (t !== 'E: Unload at SORT bin from now on') bad.push('E on the bin with a depot assigned: "' + t + '"');
    io.tap('KeyE'); if (b.dest !== BINS.HALL) bad.push('E on the bin set ' + b.dest);
    // a dark depot is allowed, and the text says what happens
    K.off.add(d.id); K.run(0.2); p().pos.set(5, 0, 8); look(d.x, 0.9, d.z, 2.5); t = act(); if (!/Unload at Depot A from now on \(no power there yet: Auto until it has\)/.test(t)) bad.push('dark depot text: ' + t);
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.ui.the-crew-panel-has-a-bin-button-that-steps-through-the-bins-and-a-bins-panel-button', async () => {
    const bad = [], d = K.beacon(8, 10, { name: 'Deep Dig' }); K.run(0.2); const b = K.mkBot(2, 5); g.ui.open('crew');
    const strip = () => (document.querySelector('#crewList [data-bins-strip]') || {}).textContent;
    if (strip() !== 'Bins: SORT bin (1 bot), Deep Dig (0 bots)') return 'bins strip: ' + strip();
    const bb = () => [...document.querySelectorAll('#crewList [data-bin=next]')][0];
    if (!bb() || bb().textContent !== 'Bin: Auto ▸') return 'first label ' + (bb() && bb().textContent);
    if (bb().title.length < 12 || /—/.test(bb().title)) bad.push('tooltip');
    const seen = []; for (let n = 0; n < 4; n++) { bb().click(); seen.push(bb().textContent); }
    if (seen.join() !== 'Bin: SORT bin ▸,Bin: Deep Dig ▸,Bin: Auto ▸,Bin: SORT bin ▸') bad.push('steps: ' + seen);
    if (b.dest !== BINS.HALL) bad.push('dest ' + b.dest);
    if (!/unloads at SORT bin/.test(document.querySelector('#crewList [data-live=status]').textContent) && !/unloads at SORT bin/.test(g.crew.statusLine(b))) bad.push('status line: ' + g.crew.statusLine(b));
    b.dest = d.id; if (!/unloads at Deep Dig \(\d+ m\)/.test(g.crew.statusLine(b))) bad.push('status line with a depot: ' + g.crew.statusLine(b));
    g.ui.renderCrew(); if (strip() !== 'Bins: SORT bin (0 bots), Deep Dig (1 bot)') bad.push('bins strip after: ' + strip());
    K.off.add(d.id); K.run(0.2); g.ui.renderCrew(); if (!/Deep Dig \(1 bot, no power\)/.test(strip())) bad.push('a dark depot should say so in the strip: ' + strip());
    const pb = [...document.querySelectorAll('#crewList button')].find((x) => x.textContent === 'Bins panel'); if (!pb) bad.push('no Bins panel button'); else { pb.click(); if (g.ui.openModal !== 'binpanel' || !/BINS: /.test(title())) bad.push('Bins panel opened ' + g.ui.openModal + ' ' + title()); }
    g.ui.closeModals();
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.ui.shift-semicolon-copies-the-bin-and-e-pastes-it-on-machines-belt-ends-carts-and-bots', async () => {
    const bad = [], d = K.beacon(8, 10); K.run(0.2); const tk = K.mkEarth('truck', toI(-2), toK(2)), bo = K.mach('borer', -6, 3, { dx: 1, dz: 0, w: 2, h: 3 }); g.setCfg(tk, { dest: d.id });
    p().pos.set(0, 0, 2); look(tk.px, 0.5, tk.pz, 2.5); io.shiftTap('Semicolon');
    if (!g.cfgClip || g.cfgClip.group !== 'bindest' || g.cfgClip.vals.dest !== d.id) return 'copy: ' + JSON.stringify(g.cfgClip);
    if (!/Bin copied from/.test(io.hint())) bad.push('hint: ' + io.hint());
    look(bo.x, 0.5, bo.z, 2.5); io.tap('KeyE'); if (bo.dest !== d.id) bad.push('E on a borer pasted ' + bo.dest);
    // a bot you aim at gets it (E does not select it while a bin is held)
    const b = K.mkBot(-2, 6); look(b.x, 0.3, b.z, 2.0); io.tap('KeyE'); if (b.dest !== d.id) bad.push('E on a bot pasted ' + b.dest); if (g.crewSel === b.id) bad.push('the bot was selected instead');
    // Shift+; at nothing drops it, and E on a bot selects it again
    look(0, 0.5, 30, 2); io.shiftTap('Semicolon'); if (g.cfgClip) bad.push('not dropped'); look(b.x, 0.3, b.z, 2.0); io.tap('KeyE'); if (g.crewSel !== b.id) bad.push('E on a bot should select it again');
    // a bot's own bin copies too
    g.crewDeselect(); b.dest = BINS.HALL; look(b.x, 0.3, b.z, 2.0); io.shiftTap('Semicolon'); if (!g.cfgClip || g.cfgClip.vals.dest !== BINS.HALL) bad.push('copy from a bot: ' + JSON.stringify(g.cfgClip));
    look(tk.px, 0.5, tk.pz, 2.5); io.tap('KeyE'); if (tk.dest !== BINS.HALL) bad.push('a bot\'s bin did not paste on a truck: ' + tk.dest);
    g.cfgClip = null;
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.ui.shift-e-copies-a-trucks-settings-bin-included-and-e-pastes-on-another-but-a-detector-gate-keeps-its-e', async () => {
    const bad = [], d = K.beacon(8, 10); K.run(0.2); const t1 = K.mkEarth('truck', toI(-2), toK(2)), t2 = K.mkEarth('truck', toI(-6), toK(2)); g.setCfg(t1, { dest: d.id });
    p().pos.set(0, 0, 2); look(t1.px, 0.5, t1.pz, 2.5); io.shiftTap('KeyE');
    if (!g.cfgClip || g.cfgClip.vals.dest !== d.id) bad.push('Shift+E on a truck: ' + JSON.stringify(g.cfgClip));
    look(t2.px, 0.5, t2.pz, 2.5); io.tap('KeyE'); if (t2.dest !== d.id) bad.push('E on the other truck pasted ' + t2.dest); if (t2.off) bad.push('E parked the truck instead of pasting');
    g.cfgClip = null;
    // a Detector Gate is a belt piece but sells nothing: Shift+E on it is still E (it takes The One), and it takes no bin
    const gate = K.rawTile('belt', toI(-4), toK(0), { dir: 0, detector: true }); K.run(0.2);
    if (BINS.assignable(gate)) bad.push('a gate is assignable'); lookFrom(cellX(gate.i), cellZ(gate.k) - 2.2, cellX(gate.i), 0.3, cellZ(gate.k));
    if (XT.copyKey(g)) bad.push('Shift+E on a gate was taken as a copy: ' + JSON.stringify(g.cfgClip));
    for (const o of [{ splitter: true }, { merger: true }, { smart: 1 }, { lift: { h: 3 } }, { ug: { role: 'in' } }]) if (BINS.assignable({ type: 'belt', ...o })) bad.push('assignable: ' + Object.keys(o));
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.ui.your-cart-takes-a-bin-and-its-readout-says-so', async () => {
    const bad = [], d = K.beacon(8, 10); K.run(0.2); craft('cart:1'); g.useCart(); const c = S().cart; c.mode = 'stay'; c.x = -3; c.z = 3; c.y = 0; p().pos.set(0, 0, 3);
    look(c.x, 0.5, c.z, 2.0); const a = g.crewAim(); if (!a || a.kind !== 'cart') return 'aim: ' + (a && a.kind);
    io.tap('KeyB'); if (g.ui.openModal !== 'binpanel' || !/BINS: YOUR CART/.test(title())) return 'panel ' + g.ui.openModal + ' ' + title();
    btn('Use Depot A').click(); if (c.dest !== d.id) bad.push('cart dest ' + c.dest); g.ui.closeModals();
    const info = infoFor(g, findInfoRef(g)); if (!info || !/Bin: Depot A \(\d+ m\)/.test(info.lines.join(' '))) bad.push('cart readout: ' + (info && info.lines.join(' | ')));
    return bad.length === 0 || bad.join(' || ');
  });

  await G('bins.ui.the-bot-hud-the-intro-and-the-controls-all-say-it', async () => {
    const bad = [], b = K.mkBot(2, 5); g.crewSel = b.id; look(0, 0.5, 20, 2);
    if (!/Unloads at: Auto: the SORT bin, as before/.test(botText())) bad.push('hud line missing: ' + botText());
    g.ui.open('crew'); const intro = document.getElementById('crewIntro').textContent; g.ui.closeModals();
    if (!/Bins\. A bot unloads at the SORT bin unless you pick a Depot Beacon/.test(intro)) bad.push('intro');
    if (/—/.test(intro)) bad.push('em dash in the intro');
    // every key the panel names exists: B opens it, Shift+; copies
    if (!/B picks its bin, Shift\+; copies it/.test(infoFor(g, { kind: 'mach', id: K.mkEarth('truck', toI(-6), toK(9)).id }).lines.join(' '))) bad.push('truck readout does not name the key');
    void BP;
    return bad.length === 0 || bad.join(' || ');
  });
}
