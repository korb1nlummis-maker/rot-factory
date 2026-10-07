// In-world keys, part 2: the hotbar and tool keys (1-9, [ ], wheel, arrows, Q), the inventory keys, the screen keys, the crew keys, M and F3.
import { makeIO, WORLD_UP } from './truth_world_lib.js';
export default async function (ctx) {
  const { T, g, S, p, adv, fresh, craft, selectTool, realSleep, V3, aimPoint, placeAtFloor } = ctx;
  const io = makeIO(ctx);
  const tool = () => g.curTool().kind + (g.curTool().id ? ':' + g.curTool().id : '');

  await T('truth.world.keys-number-takes-a-tool-out-same-number-puts-it-away-empty-slot-is-bare-hands', async () => {
    fresh(WORLD_UP()); craft('strut', 2); craft('flare', 2); craft('marker', 2); const bad = [];   // hotbar: 1 hammer, 2 strut, 3 flare, 4 marker
    if (g.curTool().kind !== 'hands') bad.push('not bare hands at the start');
    io.tap('Digit2'); if (g.curTool().id !== 'strut') bad.push('2 did not take out the strut: ' + tool());
    io.tap('Digit2'); if (g.curTool().kind !== 'hands') bad.push('the same number again did not put it away: ' + tool());
    io.tap('Digit3'); if (g.curTool().id !== 'flare') bad.push('3 did not take out the flare'); io.tap('Digit1'); if (g.curTool().kind !== 'hammer') bad.push('1 is not the hammer');
    io.tap('Digit9'); if (g.curTool().kind !== 'hands') bad.push('an empty slot (9) is not bare hands: ' + tool());
    io.tap('Digit4'); io.tap('KeyQ'); if (!g.stowed || g.curTool().kind !== 'hands') bad.push('Q did not put the tool away'); io.tap('KeyQ'); if (g.stowed || g.curTool().id !== 'marker') bad.push('Q did not take it out again: ' + tool());
    if (!/Q<\/kbd> put away · same number again also puts it away/.test(document.getElementById('hotbarHint').innerHTML.replace(/<\/?kbd>/g, '</kbd>').replace(/<kbd>/g, '')) && !/Q put away · same number again also puts it away/.test(document.getElementById('hotbarHint').textContent)) bad.push('hotbar hint: ' + document.getElementById('hotbarHint').textContent);
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-brackets-wheel-and-left-right-arrows-step-through-the-hotbar-tools', async () => {
    fresh(WORLD_UP()); craft('strut', 2); craft('flare', 2); craft('marker', 2); const bad = []; g.stowed = false; g.selectTool(0);
    const order = []; for (const code of ['BracketRight', 'BracketRight', 'BracketRight', 'BracketRight']) { io.tap(code); order.push(g.buildIdx); }
    if (order.join() !== '1,2,3,0') bad.push('] did not step 2,3,4 then wrap to 1 (got ' + order.join() + ')');
    io.tap('BracketLeft'); if (g.buildIdx !== 3) bad.push('[ did not step back to slot 4 (' + g.buildIdx + ')');
    io.tap('ArrowRight'); if (g.buildIdx !== 0) bad.push('Right arrow did not step the hotbar (' + g.buildIdx + ')'); io.tap('ArrowLeft'); if (g.buildIdx !== 3) bad.push('Left arrow did not step back (' + g.buildIdx + ')');
    io.wheel(100); if (g.buildIdx !== 0) bad.push('wheel down did not step on (' + g.buildIdx + ')'); io.wheel(-100); if (g.buildIdx !== 3) bad.push('wheel up did not step back (' + g.buildIdx + ')');
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-left-right-turn-a-frame-and-down-snaps-it-back-to-the-grid', async () => {
    fresh(WORLD_UP()); craft('frame:timber'); selectTool('frame:timber'); const bad = []; const stand = () => { p().pos.set(0, 0, -1.4); p().yaw = 0; p().pitch = 0.1; p().vel.set(0, 0, 0); };
    stand(); adv(0.2); const slot = g.buildIdx; g.frameYaw = null;
    io.down('ArrowRight'); for (let n = 0; n < 6; n++) { await realSleep(60); adv(0.02); } io.up('ArrowRight'); const y1 = g.frameYaw; if (y1 == null) bad.push('holding Right did not turn the frame');
    if (g.buildIdx !== slot) bad.push('Right stepped the hotbar even though a frame is in hand');
    io.down('ArrowLeft'); for (let n = 0; n < 6; n++) { await realSleep(60); adv(0.02); } io.up('ArrowLeft'); if (g.frameYaw == null || !(g.frameYaw < y1)) bad.push('holding Left did not turn it back');
    const fine = (() => { const a = g.frameYaw; return a; })(); g.frameYaw = 0; io.down('ShiftLeft', { shiftKey: true }); io.down('ArrowRight'); for (let n = 0; n < 6; n++) { await realSleep(60); adv(0.02); } io.up('ArrowRight'); io.up('ShiftLeft'); const fineTurn = g.frameYaw;
    g.frameYaw = 0; io.down('ArrowRight'); for (let n = 0; n < 6; n++) { await realSleep(60); adv(0.02); } io.up('ArrowRight'); const fullTurn = g.frameYaw; if (!(fineTurn > 0 && fineTurn < fullTurn * 0.6)) bad.push(`Shift did not make the turn finer (${fineTurn} vs ${fullTurn})`); void fine;
    io.tap('ArrowDown'); if (g.frameYaw != null) bad.push('Down did not send the frame back to the grid'); if (!/snap to the grid/.test(io.hint())) bad.push('Down hint: ' + io.hint());
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-q-with-a-cable-wire-in-hand-drops-the-wire-and-q-again-puts-the-cable-away', async () => {
    fresh(WORLD_UP()); const bad = []; const pole = await placeAtFloor('pole', -3.6, 6.4, 2.0); if (!pole.ok) return 'pole: ' + pole.why;
    craft('cable'); selectTool('cable'); aimPoint(-3.6, 1.0, 6.4, 1.8); adv(0.2); io.click(0); if (!g.cables.wiring) return 'a click on the pole did not start a wire (' + io.hint() + ')';
    io.tap('KeyQ'); if (g.cables.wiring) bad.push('Q did not drop the wire'); if (g.stowed) bad.push('Q put the cable away while a wire was in hand (it should only drop the wire)');
    io.tap('KeyQ'); if (!g.stowed) bad.push('Q again did not put the cable away');
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-tab-n-l-j-v-i-open-their-screens-and-close-them-again', async () => {
    fresh(WORLD_UP()); const bad = []; const rows = [['Tab', 'shop'], ['KeyN', 'dex'], ['KeyL', 'journal'], ['KeyJ', 'ach'], ['KeyV', 'crew'], ['KeyI', 'inv']];
    for (const [code, id] of rows) { g.ui.closeModals(); io.tap(code); if (io.modal() !== id) { bad.push(`${code} opened "${io.modal()}", not "${id}"`); continue; } if (document.getElementById(id).classList.contains('hidden')) bad.push(id + ' is open but hidden'); io.tap(code); if (io.modal() === id) bad.push(`${code} did not close ${id} again`); }
    g.ui.closeModals(); io.tap('Tab'); if (io.modal() !== 'shop') bad.push('Tab does not work from anywhere'); io.tap('Escape'); if (io.modal()) bad.push('Esc did not close the terminal'); g.ui.closeModals();
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-inventory-arrows-move-1-9-assign-x-clears-i-and-esc-close', async () => {
    fresh(WORLD_UP()); craft('strut', 2); craft('flare', 2); const bad = []; g.ui.closeModals(); io.tap('KeyI'); if (io.modal() !== 'inv') return 'I did not open the inventory';
    const list = g.inventoryList(); const first = g.ui.invSel; io.tap('ArrowRight'); const second = g.ui.invSel; if (second === first || !second) bad.push('arrow right did not move the selection'); io.tap('ArrowLeft'); if (g.ui.invSel !== first && first) bad.push('arrow left did not move back');
    const flare = list.find((x) => x.id === 'flare'); g.ui.invSel = flare.id; io.tap('Digit7'); if (S().hotbar[6] !== 'flare') bad.push('7 did not put the selected item on slot 7: ' + S().hotbar.join());
    io.tap('KeyX'); if (S().hotbar.includes('flare')) bad.push('X did not remove the item from the hotbar');
    io.tap('KeyI'); if (io.modal()) bad.push('I did not close the inventory'); io.tap('KeyI'); io.tap('Escape'); if (io.modal()) bad.push('Esc did not close the inventory');
    const txt = document.querySelector('#inv').textContent; if (!/I or Esc closes/.test(txt) || !/1-9 assigns the selected item/.test(txt) || !/X removes it from the bar/.test(txt)) bad.push('inventory footer text changed: ' + txt.slice(-160));
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-t-sends-the-crew-digging-the-way-you-face-and-y-calls-them-home', async () => {
    fresh(WORLD_UP()); const bad = []; io.clearHint(); io.tap('KeyT'); if (!/No crew yet/.test(io.hint())) bad.push('T with no crew: ' + io.hint());
    const b = g.crew.spawn(); p().pos.set(0, 0, -1.4); p().yaw = Math.PI / 2; p().pitch = 0; b.state = 'idle'; adv(0.1); io.clearHint(); io.tap('KeyT');
    if (!/sent digging|No pile that way/.test(io.hint())) bad.push('T gave no crew message: ' + io.hint()); else if (/sent digging/.test(io.hint()) && b.state === 'idle') bad.push('T said it sent the crew but the bot is still idle');
    io.clearHint(); b.state = 'dig'; io.tap('KeyY'); if (!/heading home/.test(io.hint())) bad.push('Y gave no message: ' + io.hint()); if (b.state === 'dig') bad.push('Y did not change what the bot is doing (' + b.state + ')');
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-f3-shows-the-frame-rate-and-m-the-load-meter', async () => {
    fresh(WORLD_UP()); const bad = []; const fps = document.getElementById('fps'); g.showFps = false; fps.classList.add('hidden');
    io.down('F3'); g.perf(16); io.up('F3'); g.perf(16); if (fps.classList.contains('hidden')) bad.push('F3 did not show the frame rate'); io.down('F3'); g.perf(16); io.up('F3'); g.perf(16); if (!fps.classList.contains('hidden')) bad.push('F3 again did not hide it');
    g._pwHud = false; io.clearHint(); io.tap('KeyM'); if (!g._pwHud || !/Load meter on/.test(io.hint())) bad.push('M did not turn the load meter on: ' + io.hint()); io.tap('KeyM'); if (g._pwHud) bad.push('M again did not turn it off');
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-esc-lets-go-of-a-selected-bot', async () => {
    fresh(WORLD_UP()); const b = g.crew.spawn(); g.crewSelect(b); if (!g.crewSel) return 'could not select'; io.tap('Escape'); return !g.crewSel || 'Esc did not let the bot go';
  });

  await T('truth.world.keys-crafting-says-which-slot-and-which-key-takes-the-new-tool-out', async () => {
    fresh(WORLD_UP()); const bad = [];
    // hands free: "Press N to take it out" is true
    craft('strut'); let h = io.hint(); let m = /slot (\d)\. Press (\d) to take it out, Q to put it away/.exec(h); if (!m || m[1] !== m[2]) bad.push('hands free hint: ' + h); else { io.tap('Digit' + m[2]); if (g.curTool().id !== 'strut') bad.push('that number did not take the strut out: ' + tool()); io.tap('KeyQ'); if (!g.stowed) bad.push('Q did not put it away'); }
    // a tool already out: the new item is in the hand at once, and the hint must not tell you to press its number (that would put it away)
    g.stowed = false; g.selectTool(0); craft('flare'); h = io.hint(); if (g.curTool().id !== 'flare') bad.push('crafting with a tool out did not leave the new item in hand: ' + tool());
    if (/to take it out/.test(h)) bad.push('the hint says "to take it out" although the item is already in your hand: ' + h);
    // a full hotbar: the hint says to open the inventory, and it does
    fresh(WORLD_UP()); for (const id of ['strut', 'flare', 'marker', 'glow', 'jack', 'dynamite', 'charge', 'lantern']) craft(id); craft('bulk'); h = io.hint(); if (!/hotbar is full: open the inventory \(I\)/.test(h)) bad.push('full hotbar hint: ' + h);
    g.ui.closeModals(); io.tap('KeyI'); if (io.modal() !== 'inv' || !g.inventoryList().some((x) => x.id === 'bulk')) bad.push('I did not show the item that has no slot');
    g.ui.closeModals();
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-q-and-b-hints-only-say-tool-out-when-a-tool-really-came-out', async () => {
    fresh(WORLD_UP()); craft('strut'); const bad = []; g.stowed = true; g.rebuildTools();
    io.tap('Digit9'); io.clearHint(); io.tap('KeyQ'); io.tap('KeyQ'); if (g.curTool().kind !== 'hands') bad.push('slot 9 is not empty'); if (/Tool out/.test(io.hint())) bad.push('Q on an empty slot said "' + io.hint() + '"');
    g.stowed = true; g.rebuildTools(); io.clearHint(); io.tap('KeyB'); if (/Tool out/.test(io.hint()) && g.curTool().kind === 'hands') bad.push('B on an empty slot said "' + io.hint() + '"');
    g.stowed = true; g.rebuildTools(); io.tap('Digit2'); io.tap('KeyQ'); io.clearHint(); io.tap('KeyQ'); if (g.curTool().id !== 'strut' || !/Tool out/.test(io.hint())) bad.push('Q with the strut selected: ' + io.hint());
    return bad.length === 0 || bad.join('; ');
  });

  await T('truth.world.keys-enter-opens-chat-only-while-playing-together', async () => {
    fresh(WORLD_UP()); const bad = []; const c = document.getElementById('chatIn'); const open0 = g.net.open; try {
      g.net.open = false; c.classList.add('hidden'); io.tap('Enter'); if (!c.classList.contains('hidden')) bad.push('Enter opened the chat box in a single player game');
      g.net.open = true; io.tap('Enter'); if (c.classList.contains('hidden')) bad.push('Enter did not open the chat box while playing together'); c.classList.add('hidden'); c.blur();
    } finally { g.net.open = open0; c.classList.add('hidden'); }
    return bad.length === 0 || bad.join('; ');
  });
}
