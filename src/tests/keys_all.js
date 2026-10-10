// keys.*: every action of the keybind table is pressed the way a player presses it (a real KeyboardEvent / MouseEvent / WheelEvent on window) with the configured
// combo, in the context it applies in, and the effect it promises is looked at. For the four changed actions (Assign a bin is B, Chat is the backtick, Vacuum pulls
// gentler is [ and Vacuum pulls harder is ]) the old combos (; Enter Alt+- Alt+=) must do nothing, and a bare key must not fire with Alt or Ctrl held.
// The page list the player edited is embedded (PAGE) so the shipped table can be compared with it: the four edits and nothing else.
// Run: `await __selftest('keys.')`. What cannot be driven here is listed in the report that goes with this file (look: the mouse position is not a key; every other
// action is driven).
import { makeIO, WORLD_UP } from './truth_world_lib.js';
import { makeShell } from './build_lib.js';
import { makeBeltKit, UP_ALL } from './belts_lib.js';
import { kit as binsKit } from './bins_lib.js';
import { makeRail } from './rail_lib.js';
import * as KB from '../keybinds.js';
import * as BINS from '../bins.js';
import { CONTROLS } from '../controls.js';

// [id, default combos, context, flag] straight from the page list (the A array of controls.html), before the player's edits
const PAGE = [
  ['fwd', ['KeyW'], 'any', ''], ['left', ['KeyA'], 'any', ''], ['back', ['KeyS'], 'any', ''], ['right', ['KeyD'], 'any', ''], ['sprint', ['ShiftLeft'], 'any', 'hold'],
  ['jump', ['Space'], 'any', ''], ['crouch', ['KeyC'], 'any', 'hold'], ['look', ['Mouse move'], 'any', 'locked'],
  ['grab', ['Mouse0', 'KeyG'], 'hands', 'hold'], ['throw', ['KeyZ'], 'any', ''], ['punch', ['Mouse2', 'KeyR', 'KeyP'], 'hands', ''], ['use', ['KeyE'], 'any', ''],
  ['copycfg', ['Shift+KeyE'], 'any', ''], ['bin', ['Semicolon'], 'any', ''], ['copybin', ['Shift+Semicolon'], 'any', ''], ['flash', ['KeyF', 'KeyO'], 'any', ''],
  ['medkit', ['KeyK'], 'any', ''], ['cart', ['KeyU'], 'any', ''], ['recall', ['KeyH'], 'any', 'hold'], ['give', ['Slash'], 'any', ''],
  ['hb1', ['Digit1'], 'any', ''], ['hb2', ['Digit2'], 'any', ''], ['hb3', ['Digit3'], 'any', ''], ['hb4', ['Digit4'], 'any', ''], ['hb5', ['Digit5'], 'any', ''],
  ['hb6', ['Digit6'], 'any', ''], ['hb7', ['Digit7'], 'any', ''], ['hb8', ['Digit8'], 'any', ''], ['hb9', ['Digit9'], 'any', ''],
  ['hbprev', ['BracketLeft'], 'any', ''], ['hbnext', ['BracketRight'], 'any', ''], ['hbwheel', ['Wheel'], 'any', 'locked'], ['stow', ['KeyQ'], 'any', ''],
  ['place', ['KeyB'], 'build', 'hold'], ['cable', ['Mouse0'], 'cable', ''], ['align', ['ControlLeft'], 'build', 'hold'], ['planner', ['Period'], 'build', ''],
  ['shape', ['Comma'], 'build', ''], ['rotate', ['KeyR'], 'build', ''], ['nudge', ['Shift+KeyR'], 'build', ''], ['frameL', ['ArrowLeft'], 'build', ''],
  ['frameR', ['ArrowRight'], 'build', ''], ['frameGrid', ['ArrowDown'], 'build', ''], ['dismantle', ['KeyX'], 'any', ''], ['scoopLess', ['Minus'], 'hands', ''],
  ['scoopMore', ['Equal'], 'hands', ''], ['vacLess', ['Alt+Minus'], 'hands', ''], ['vacMore', ['Alt+Equal'], 'hands', ''], ['railHome', ['Backspace'], 'rail', ''],
  ['railUse', ['KeyE', 'Space'], 'rail', ''], ['inv', ['KeyI'], 'any', ''], ['crew', ['KeyV'], 'any', ''], ['crewDig', ['KeyT'], 'any', ''], ['crewHome', ['KeyY'], 'any', ''],
  ['botRelease', ['Escape'], 'bot', ''], ['terminal', ['Tab'], 'any', ''], ['dex', ['KeyN'], 'any', ''], ['journal', ['KeyL'], 'any', ''], ['ach', ['KeyJ'], 'any', ''],
  ['pause', ['Escape'], 'menu', ''], ['chat', ['Enter'], 'any', ''], ['fps', ['F3'], 'any', ''], ['meter', ['KeyM'], 'any', ''],
  ['guide', ['F1'], 'any', ''],   // not on the page: added later for the Field Guide
];
// the four changes the player made on that page
const EDITS = { bin: ['KeyB'], chat: ['Backquote'], vacLess: ['BracketLeft'], vacMore: ['BracketRight'] };

export default async function (ctx) {
  const { T, g, S, p, adv, fresh, craft, selectTool, plushWall, standBeforeWall, clearBodies, sim, realSleep, V3, aimPoint, placeAtFloor, toI, toK, cellX, cellZ, THREE } = ctx;
  const io = makeIO(ctx);
  const LS = 'rotfactory.keys';

  // ------------------------------------------------------------------------------------------------------------------------------ helpers
  const MODS = { s: ['ShiftLeft', 'shiftKey'], a: ['AltLeft', 'altKey'], c: ['ControlLeft', 'ctrlKey'] };
  const fire = (type, code, o = {}) => window.dispatchEvent(new KeyboardEvent(type, { code, key: o.key || code, bubbles: true, cancelable: true, ...o }));
  // press a combo like a keyboard does: the modifier keys go down first (each carrying the flags of the modifiers already down), then the key, then everything comes up
  // in reverse. A mouse combo clicks the button with the flags. hold=true leaves everything down and returns the function that lets go.
  const chord = (combo, hold = false) => {
    const m = KB.parse(combo), flags = {}, order = ['s', 'a', 'c'].filter((k) => m[k]), ups = [];
    for (const k of order) { flags[MODS[k][1]] = true; fire('keydown', MODS[k][0], { ...flags }); ups.unshift(() => { delete flags[MODS[k][1]]; fire('keyup', MODS[k][0], { ...flags }); }); }
    const mouse = /^Mouse[0-4]$/.test(m.code), btn = mouse ? +m.code.slice(5) : 0, F = { ...flags }, SELF = { ShiftLeft: 'shiftKey', ShiftRight: 'shiftKey', AltLeft: 'altKey', AltRight: 'altKey', ControlLeft: 'ctrlKey', ControlRight: 'ctrlKey' }[m.code];
    if (SELF) F[SELF] = true;   // a modifier key's own keydown carries its flag, its keyup does not
    if (mouse) window.dispatchEvent(new MouseEvent('mousedown', { button: btn, bubbles: true, cancelable: true, ...F })); else fire('keydown', m.code, F);
    const release = () => { const U = { ...F }; if (SELF) delete U[SELF]; if (mouse) window.dispatchEvent(new MouseEvent('mouseup', { button: btn, bubbles: true, cancelable: true, ...U })); else fire('keyup', m.code, U); for (const u of ups) u(); };
    if (!hold) release();
    return release;
  };
  const hint = () => io.hint();
  const shut = (m) => { g.ui.closeModals(); const c = document.getElementById('chatIn'); c.classList.add('hidden'); c.blur(); void m; };
  const look = (x, y, z, back = 2.5) => { aimPoint(x, y, z, back); g.renderer.camera.position.copy(p().eyePos(new THREE.Vector3())); };
  const lookFrom = (px, pz, x, y, z) => { p().pos.set(px, 0, pz); p().vel.set(0, 0, 0); const e = p().eyePos(new THREE.Vector3()); p().yaw = Math.atan2(x - e.x, z - e.z); p().pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z)); g.renderer.camera.position.copy(e); };
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  // run fn with the player's own saved key choices set aside (a test must see the shipped keys, and must not wipe what is in the browser it runs in)
  const shipped = (fn) => async () => {
    let saved = null; try { saved = localStorage.getItem(LS); localStorage.removeItem(LS); } catch (e) { saved = null; }
    KB.reload();
    try { return await fn(); } finally { try { if (saved !== null) localStorage.setItem(LS, saved); } catch (e) { /* storage blocked */ } KB.reload(); g.keys = {}; g.stowed = true; shut(); role(null); }
  };
  const TT = (name, fn) => T(name, shipped(fn));
  const ids = () => KB.ACTIONS.map((a) => a.id);
  const own = (up = {}) => { fresh({ bag: 8, reach: 4, ...up }); delete S().vacSet; delete S().scoopSet; g.stowed = true; g.T = g.tune(); g.T.carry = 1e9; };
  const inPlay = () => { g.mode = 'play'; shut(); };

  // ------------------------------------------------------------------------------------------------------------------------------ 1. the table
  await TT('keys.the-shipped-table-is-the-page-list-with-the-four-edits-and-nothing-else', async () => {
    const bad = [];
    const want = PAGE.map((r) => r[0]), have = ids();
    if (want.join() !== have.join()) bad.push('action list differs: ' + want.filter((x) => !have.includes(x)).concat(have.filter((x) => !want.includes(x))).join(' '));
    for (const [id, def, ctxName, flag] of PAGE) {
      const a = KB.ACTION_BY_ID[id]; if (!a) continue;
      const shippedCombos = EDITS[id] || def; if (a.def.join() !== shippedCombos.join()) bad.push(`${id}: the table's default is ${a.def}, the page (with the edits) says ${shippedCombos}`);
      if (a.ctx !== ctxName) bad.push(`${id}: context ${a.ctx}, the page says ${ctxName}`);
      if ((a.flag || '') !== flag) bad.push(`${id}: flag ${a.flag}, the page says ${flag}`);
      const now = KB.binds(id);
      if (a.flag !== 'locked' && now.join() !== shippedCombos.join()) bad.push(`${id} is bound to ${now}, wanted ${shippedCombos}`);
    }
    for (const id of Object.keys(EDITS)) { const orig = PAGE.find((r) => r[0] === id)[1]; if (orig.join() === EDITS[id].join() || KB.binds(id).join() === orig.join()) bad.push(id + ' was not changed from ' + orig); }
    // the old keys are gone from the table: nothing is bound to ; (bare), Enter, Alt+Minus or Alt+Equal
    const all = KB.ACTIONS.flatMap((a) => (a.flag === 'locked' ? [] : KB.binds(a.id).map((c) => [a.id, c])));
    for (const old of ['Semicolon', 'Enter', 'Alt+Minus', 'Alt+Equal']) { const u = all.filter(([, c]) => c === old); if (u.length) bad.push(`${old} is still bound to ${u.map((x) => x[0])}`); }
    // the only owners of B, [, ] and the backtick
    const ownersOf = (code) => all.filter(([, c]) => KB.baseCode(c) === code && !/\+/.test(c)).map((x) => x[0]).sort().join();
    if (ownersOf('KeyB') !== 'bin,place') bad.push('B belongs to ' + ownersOf('KeyB')); if (ownersOf('BracketLeft') !== 'hbprev,vacLess') bad.push('[ belongs to ' + ownersOf('BracketLeft'));
    if (ownersOf('BracketRight') !== 'hbnext,vacMore') bad.push('] belongs to ' + ownersOf('BracketRight')); if (ownersOf('Backquote') !== 'chat') bad.push('the backtick belongs to ' + ownersOf('Backquote'));
    if (ownersOf('Semicolon') !== '') bad.push('a bare ; belongs to ' + ownersOf('Semicolon')); if (ownersOf('Enter') !== '') bad.push('Enter belongs to ' + ownersOf('Enter'));
    // no two actions of the same context share a combo, and the table's own check agrees
    const seen = new Map(); for (const a of KB.ACTIONS) { if (a.flag === 'locked') continue; for (const c of KB.binds(a.id)) { const k = a.ctx + '|' + c; if (seen.has(k)) bad.push(`${seen.get(k)} and ${a.id} share ${c} in the ${a.ctx} context`); else seen.set(k, a.id); } }
    const map = {}; for (const a of KB.ACTIONS) map[a.id] = KB.binds(a.id); if (KB.clashes(map).length) bad.push('KB.clashes: ' + JSON.stringify(KB.clashes(map)));
    // a shared key is shared on purpose: B and [ ] each have exactly the two owners in different contexts
    for (const [a, b] of [['bin', 'place'], ['hbprev', 'vacLess'], ['hbnext', 'vacMore']]) if (KB.ACTION_BY_ID[a].ctx === KB.ACTION_BY_ID[b].ctx) bad.push(`${a} and ${b} share a key and a context`);
    // the Controls rows are drawn from it
    const rows = CONTROLS.flatMap((x) => x.rows); const row = (id) => rows.find((r) => r.ids.includes(id));
    for (const [id, keys] of [['bin', 'B'], ['chat', '`'], ['vacLess', '['], ['vacMore', ']'], ['copybin', 'Shift+;'], ['scoopLess', '-'], ['scoopMore', '=']]) { const r = row(id); if (!r || r.keys.join('+') !== keys) bad.push(`the Controls row of ${id} shows ${r && r.keys.join('+')}, wanted ${keys}`); }
    return bad.length === 0 || bad.join('; ');
  });

  // ------------------------------------------------------------------------------------------------------------------------------ 2. moving
  await TT('keys.moving-w-a-s-d-shift-space-c-do-their-job-and-do-not-with-alt-or-ctrl-held', async () => {
    fresh({}); inPlay(); const bad = [];
    const run = (combos, pre = '') => { p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); p().yaw = 0; p().pitch = 0; adv(0.4); const s = p().pos.clone(); const ups = combos.map((c, n) => chord((n === 0 ? pre : '') + c, true)); adv(1); ups.reverse().forEach((u) => u()); return p().pos.clone().sub(s); };
    p().yaw = 0; p().pitch = 0; const fwd = p().forward(new V3());
    const w = run(['KeyW']), s = run(['KeyS']), a = run(['KeyA']), d = run(['KeyD']);
    if (w.dot(fwd) < 2) bad.push('W did not walk forward'); if (s.dot(fwd) > -1) bad.push('S did not walk back'); if (Math.abs(a.x) + Math.abs(a.z) < 2 || a.dot(d) > 0) bad.push('A and D do not strafe opposite ways');
    const walk = w.length(), sprint = run(['KeyW'], 'Shift+').length(); if (sprint < walk * 1.3) bad.push('Shift did not sprint');
    for (const [code, name] of [['KeyW', 'W'], ['KeyS', 'S'], ['KeyA', 'A'], ['KeyD', 'D']]) {
      const alt = run([code], 'Alt+').length(), ctrl = run([code], 'Ctrl+').length(); if (alt > 0.8) bad.push(`Alt+${name} still walks (${alt.toFixed(2)} m)`); if (ctrl > 0.8) bad.push(`Ctrl+${name} still walks (${ctrl.toFixed(2)} m)`);
    }
    p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); adv(0.5); let top = 0; io.down('Space'); for (let n = 0; n < 12; n++) { adv(0.05); top = Math.max(top, p().pos.y); } io.up('Space'); if (top < 0.3) bad.push('Space did not jump ' + top.toFixed(2));
    p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); adv(0.5); top = 0; { const u = chord('Alt+Space', true); for (let n = 0; n < 12; n++) { adv(0.05); top = Math.max(top, p().pos.y); } u(); } if (top > 0.05) bad.push('Alt+Space jumps');
    p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); adv(0.3); io.down('KeyC'); adv(0.3); const on = p().crouch; io.up('KeyC'); adv(0.5); if (!on) bad.push('C did not crouch'); if (p().crouch) bad.push('did not stand up after C');
    p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); adv(0.3); { const u = chord('Alt+KeyC', true); adv(0.3); var onAlt = p().crouch; u(); } adv(0.4); if (onAlt) bad.push('Alt+C crouches');
    g.keys = {}; return bad.length === 0 || bad.join('; ');
  });

  // ------------------------------------------------------------------------------------------------------------------------------ 3. hands: grab, throw, punch, use, flashlight, medkit, cart, recall
  await TT('keys.hands-click-grabs-z-throws-three-keys-punch-f-and-o-light-k-heals', async () => {
    fresh({ bag: 3, gloves: 3, reach: 3 }); inPlay(); g.holdBlock = false; g.grabCd = 0; g.throwCd = 0; plushWall(40); standBeforeWall(); adv(0.2); const bad = [];
    const n0 = S().carry.length; chord('Mouse0'); adv(0.05); if (S().carry.length !== n0 + 1) bad.push('left click did not grab');
    S().carry.length = 0; g.grabCd = 0; chord('KeyG'); adv(0.05); if (S().carry.length < 1) bad.push('G did not grab (it grabs like the left button)');
    // hold the grab button: keeps grabbing
    S().carry.length = 0; g.grabCd = 0; const up = chord('Mouse0', true); g.gDownAt = 0; for (let n = 0; n < 160; n++) { g.grabCd = Math.max(0, g.grabCd - 0.02); adv(0.02); } up(); if (S().carry.length < 5) bad.push('holding left click did not keep grabbing: ' + S().carry.length);
    // throw: Z, and a left click while holding plush; Alt+Z and Ctrl+Z do not
    clearBodies(); S().carry.length = 0; S().carry.push({ sp: 2, vr: 0 }, { sp: 2, vr: 0 }, { sp: 2, vr: 0 }); g.throwCd = 0; adv(0.2);
    chord('Alt+KeyZ'); chord('Ctrl+KeyZ'); if (S().carry.length !== 3) bad.push('Alt+Z or Ctrl+Z threw');
    chord('KeyZ'); if (S().carry.length !== 2) bad.push('Z did not throw one plush');
    g.throwCd = 0; g.curTargetRef = null; p().pitch = 0.1; chord('Mouse0'); if (S().carry.length !== 1) bad.push('a click holding plush did not throw one');
    // punch: right click, R and P each knock plush loose; Alt+P does not
    for (const [name, combo, expect] of [['right click', 'Mouse2', true], ['R', 'KeyR', true], ['P', 'KeyP', true], ['Alt+P', 'Alt+KeyP', false], ['Ctrl+P', 'Ctrl+KeyP', false]]) {
      S().carry.length = 0; plushWall(40); standBeforeWall(); p().pos.set(0, 0, 0.5); adv(0.1); clearBodies(); await realSleep(340); g.punchT = 0; chord(combo);
      const did = sim().n >= 1; if (did !== expect) bad.push(`${name} ${expect ? 'punched nothing loose' : 'punched'}`);
    }
    // flashlight F and O
    g.lampOn = true; for (const c of ['KeyF', 'KeyO']) { chord(c); const off = g.lampOn === false; chord(c); if (!off || g.lampOn === false) bad.push(c + ' did not switch the flashlight off and on'); chord('Alt+' + c); chord('Ctrl+' + c); if (g.lampOn === false) bad.push('Alt or Ctrl with ' + c + ' switched the flashlight'); }
    // medkit K heals 50
    fresh(WORLD_UP()); inPlay(); craft('medkit', 3); g.hp = 20; chord('KeyK'); if (Math.abs(g.hp - 70) > 0.01) bad.push('K did not heal 50: ' + g.hp); g.hp = 20; chord('Alt+KeyK'); chord('Ctrl+KeyK'); if (g.hp !== 20) bad.push('Alt or Ctrl with K healed');
    g.keys = {}; return bad.length === 0 || bad.join('; ');
  });

  await TT('keys.b-with-the-cart-in-hand-rolls-it-out', async () => {
    fresh(WORLD_UP()); inPlay(); craft('cart:1'); selectTool('cart:1'); p().pos.set(0, 0, 2); p().yaw = 0; g.holdBlock = false; const bad = [];
    chord('KeyB'); const c = S().cart; if (!c) return 'B with the cart in hand did not roll it out';
    chord('KeyU'); if (c.mode !== 'stay') bad.push('U did not park the cart B rolled out');   // (the cart item is used up when it rolls out: U parks it and calls it back)
    return bad.length === 0 || bad.join('; ');
  });

  await TT('keys.u-rolls-the-cart-out-and-parks-it-and-hold-h-recalls', async () => {
    fresh(WORLD_UP()); inPlay(); craft('cart:1'); p().pos.set(0, 0, 2); p().yaw = 0; const bad = [];
    chord('Alt+KeyU'); chord('Ctrl+KeyU'); if (S().cart) bad.push('Alt or Ctrl with U rolled the cart out');
    chord('KeyU'); const c = S().cart; if (!c) return 'U did not roll the cart out'; chord('KeyU'); if (c.mode !== 'stay') bad.push('U did not park it'); chord('KeyU'); if (c.mode !== 'follow') bad.push('U did not call it back'); c.mode = 'stay'; chord('Alt+KeyU'); if (c.mode !== 'stay') bad.push('Alt+U changed the cart');
    // hold H: the recall countdown runs (and does not with Alt or Ctrl held)
    g.keys = {}; g.recallHold = 0; let up = chord('KeyH', true); adv(0.5); const run1 = g.recallHold; up(); adv(0.1); if (!(run1 > 0.3)) bad.push('holding H did not start the recall: ' + run1); if (g.recallHold !== 0) bad.push('letting go of H did not stop it');
    up = chord('Alt+KeyH', true); adv(0.5); const run2 = g.recallHold; up(); adv(0.1); if (run2 > 0) bad.push('holding Alt+H recalls: ' + run2);
    up = chord('Ctrl+KeyH', true); adv(0.5); const run3 = g.recallHold; up(); adv(0.1); if (run3 > 0) bad.push('holding Ctrl+H recalls: ' + run3);
    g.keys = {}; return bad.length === 0 || bad.join('; ');
  });

  await TT('keys.slash-gives-one-item-to-a-friend-and-shift-slash-ten', async () => {
    fresh({ ...WORLD_UP(), markers: 1 }); inPlay(); const bad = [];
    // a friend 1.5 m away (the same stand-in the give key's own test uses)
    role('host'); g.netSend = () => {}; g.remote = { pos: new V3(1.5, 0, 0), vel: new V3(), update() {}, dispose() {}, set() {}, setHeld() {}, spheres() { return []; } }; p().pos.set(0, 0, 0);
    try {
      craft('marker', 12); g.stowed = false; selectTool('marker'); const PIN = await import('../playerinv.js'); const theirs = () => PIN.invFor(g, 'g').marker | 0;
      chord('Alt+Slash'); chord('Ctrl+Slash'); if (S().items.marker !== 12) bad.push('Alt or Ctrl with / gave something');
      chord('Slash'); if (S().items.marker !== 11 || theirs() !== 1) bad.push('/ did not hand over one: ' + S().items.marker + ' ' + theirs());
      chord('Shift+Slash'); if (S().items.marker !== 1 || theirs() !== 11) bad.push('Shift+/ did not hand over ten: ' + S().items.marker + ' ' + theirs());
    } finally { delete g.netSend; g.remote = null; role(null); g._actor = null; }
    return bad.length === 0 || bad.join('; ');
  });

  // ------------------------------------------------------------------------------------------------------------------------------ 4. use, copy settings, bins
  const K = binsKit(ctx);
  await K.guard('keys.e-uses-shift-e-copies-settings-b-assigns-a-bin-shift-semicolon-copies-it-and-the-old-semicolon-does-nothing', shipped(async () => {
    const bad = [], d = K.beacon(8, 10); K.run(0.2); const tk = K.mkEarth('truck', toI(-2), toK(2)), t2 = K.mkEarth('truck', toI(-6), toK(2)); BINS.note(g, d.id, 40, 1234); inPlay(); g.stowed = true; g.cfgClip = null;
    const panel = () => g.ui.openModal === 'binpanel';
    // B with bare hands, aimed at a truck: the bins panel for it
    p().pos.set(0, 0, 2); look(tk.px, 0.5, tk.pz, 2.5);
    chord('Semicolon'); if (panel()) bad.push('a bare ; still opens the bins panel'); shut();
    chord('Alt+KeyB'); chord('Ctrl+KeyB'); if (panel()) bad.push('Alt+B or Ctrl+B opens the bins panel'); shut();
    chord('Enter'); if (panel()) bad.push('Enter opened the panel'); shut();
    chord('KeyB'); if (!panel() || !/BINS: HAUL TRUCK/.test(document.getElementById('binTitle').textContent)) bad.push('B did not open the bins panel for the truck: ' + g.ui.openModal);
    chord('KeyB'); if (!panel()) bad.push('the panel closed on B'); // B in the panel steps to the next bin
    if (tk.dest === 0) bad.push('B in the open panel did not step to the next bin (dest ' + tk.dest + ')'); shut(); g.setCfg(tk, { dest: d.id });
    // B with a cable in hand (not a building item) assigns a bin as well; with a building item in hand it sets the item down and never opens the panel
    look(tk.px, 0.5, tk.pz, 2.5); craft('cable'); selectTool('cable'); chord('KeyB'); if (!panel()) bad.push('B with a cable in hand did not open the bins panel'); shut();
    craft('belt', 3); selectTool('belt'); if (g.curTool().kind !== 'belt') bad.push('no belt in hand: ' + g.curTool().kind); look(tk.px, 0.5, tk.pz, 2.5); chord('KeyB'); if (panel()) bad.push('B with a building item in hand opened the bins panel'); shut(); g.stowed = true;
    // Shift+; copies the bin (a bare ; and Alt+; do not)
    look(tk.px, 0.5, tk.pz, 2.5); g.cfgClip = null; chord('Semicolon'); chord('Alt+Semicolon'); chord('Ctrl+Semicolon'); if (g.cfgClip) bad.push('; or Alt+; or Ctrl+; copied a bin');
    chord('Shift+Semicolon'); if (!g.cfgClip || g.cfgClip.group !== 'bindest' || g.cfgClip.vals.dest !== d.id) bad.push('Shift+; did not copy the bin: ' + JSON.stringify(g.cfgClip));
    // E on another truck pastes the copied bin; Alt+E does not
    look(t2.px, 0.5, t2.pz, 2.5); chord('Alt+KeyE'); chord('Ctrl+KeyE'); if (t2.dest === d.id) bad.push('Alt+E or Ctrl+E pasted'); chord('KeyE'); if (t2.dest !== d.id) bad.push('E on the other truck did not paste the bin: ' + t2.dest); g.cfgClip = null;
    // Shift+E copies the settings (bin included) and E pastes them
    look(tk.px, 0.5, tk.pz, 2.5); chord('Alt+Shift+KeyE'); if (g.cfgClip) bad.push('Alt+Shift+E copied'); chord('Shift+KeyE'); if (!g.cfgClip || g.cfgClip.vals.dest !== d.id) bad.push('Shift+E did not copy the truck: ' + JSON.stringify(g.cfgClip));
    g.cfgClip = null;
    // E uses what you aim at: it selects a bot
    const b = K.mkBot(-2, 6); look(b.x, 0.3, b.z, 2.0); chord('Alt+KeyE'); if (g.crewSel === b.id) bad.push('Alt+E used the bot'); chord('KeyE'); if (g.crewSel !== b.id) bad.push('E did not select the bot you aim at');
    // Esc lets a selected bot go (botRelease)
    chord('Escape'); if (g.crewSel) bad.push('Esc did not let the bot go');
    g.keys = {}; return bad.length === 0 || bad.join(' || ');
  }));

  // ------------------------------------------------------------------------------------------------------------------------------ 5. hotbar: numbers, [ ], wheel, stow, and the dials
  await TT('keys.digits-take-tools-out-brackets-and-the-wheel-step-the-hotbar-and-q-stows', async () => {
    fresh(WORLD_UP()); inPlay(); craft('strut', 2); craft('flare', 2); craft('marker', 2); const bad = []; g.stowed = false; g.selectTool(0);
    const tool = () => g.curTool().kind + (g.curTool().id ? ':' + g.curTool().id : '');
    for (let d = 1; d <= 9; d++) { g.stowed = true; chord('Digit' + d); const slot = g.buildIdx; if (slot !== d - 1) bad.push(`${d} selected slot ${slot + 1}`); }
    g.stowed = true; g.rebuildTools(); chord('Digit2'); if (g.curTool().id !== 'strut') bad.push('2 did not take the strut out: ' + tool()); chord('Digit2'); if (g.curTool().kind !== 'hands') bad.push('2 again did not put it away'); chord('Alt+Digit2'); chord('Ctrl+Digit2'); if (g.curTool().kind !== 'hands') bad.push('Alt or Ctrl with 2 took the strut out');
    g.stowed = false; g.selectTool(0); const order = []; for (let n = 0; n < 4; n++) { chord('BracketRight'); order.push(g.buildIdx); } if (order.join() !== '1,2,3,0') bad.push('] did not step 2,3,4 then wrap to 1: ' + order);
    chord('BracketLeft'); if (g.buildIdx !== 3) bad.push('[ did not step back to slot 4: ' + g.buildIdx);
    chord('Alt+BracketRight'); chord('Ctrl+BracketRight'); chord('Alt+BracketLeft'); if (g.buildIdx !== 3) bad.push('Alt or Ctrl with [ ] stepped the hotbar: ' + g.buildIdx);
    io.wheel(100); if (g.buildIdx !== 0) bad.push('wheel down did not step on: ' + g.buildIdx); io.wheel(-100); if (g.buildIdx !== 3) bad.push('wheel up did not step back: ' + g.buildIdx);
    // Q stows and takes the tool out again
    g.stowed = false; g.selectTool(1); chord('Alt+KeyQ'); if (g.stowed) bad.push('Alt+Q stowed'); chord('KeyQ'); if (!g.stowed) bad.push('Q did not put the tool away'); chord('KeyQ'); if (g.stowed || g.buildIdx !== 1) bad.push('Q did not take it out again');
    g.keys = {}; return bad.length === 0 || bad.join('; ');
  });

  await TT('keys.minus-equal-turn-the-scoop-and-brackets-the-vacuum-and-the-old-alt-keys-do-nothing', async () => {
    own({ scoop: 4, vac: 5 }); inPlay(); const bad = []; const st = []; const cyc = g.cycleTool; g.cycleTool = (d) => { st.push(d); };
    try {
      const state = () => `${g.scoopNow()}/${g.vacPct()}`;
      let s0 = state(); chord('Equal'); if (g.scoopNow() !== 6 || g.vacPct() !== 30) bad.push('= should scoop 3 more: ' + state());
      chord('Minus'); if (g.scoopNow() !== 3 || g.vacPct() !== 30) bad.push('- should scoop 3 fewer: ' + state());
      chord('BracketRight'); if (g.vacPct() !== 40 || g.scoopNow() !== 3) bad.push('] should pull harder: ' + state()); chord('BracketLeft'); chord('BracketLeft'); if (g.vacPct() !== 20 || g.scoopNow() !== 3) bad.push('[ twice should pull gentler: ' + state());
      if (st.length) bad.push('[ ] stepped the hotbar while the vacuum dial applies: ' + st);
      s0 = state(); for (const c of ['Alt+Minus', 'Alt+Equal', 'Ctrl+Minus', 'Ctrl+Equal', 'Alt+BracketLeft', 'Alt+BracketRight', 'Ctrl+BracketLeft', 'Ctrl+BracketRight']) chord(c);
      if (state() !== s0) bad.push('Alt or Ctrl variants changed a dial: ' + s0 + ' -> ' + state()); if (st.length) bad.push('Alt or Ctrl with [ ] stepped the hotbar');
      // a tool in hand: [ ] step the hotbar and leave the dial; - and = leave the vacuum (they are the scoop or the tool's own)
      const ct = g.curTool; g.curTool = () => ({ kind: 'belt', id: 'belt' });
      try { chord('BracketRight'); chord('BracketLeft'); if (g.vacPct() !== 20) bad.push('[ ] with a belt in hand turned the vacuum'); if (st.join() !== '1,-1') bad.push('[ ] with a belt in hand did not step the hotbar: ' + st); } finally { g.curTool = ct; }
      // the number keys and the wheel still step the hotbar while the vacuum dial applies, and leave the dial alone
      chord('Digit3'); if (g.buildIdx !== 2) bad.push('3 did not select slot 3 with the vacuum owned'); io.wheel(100); if (g.vacPct() !== 20) bad.push('the wheel turned the vacuum');
    } finally { g.cycleTool = cyc; }
    // before the vacuum is owned [ and ] step the hotbar
    own({ scoop: 4 }); inPlay(); const st2 = []; g.cycleTool = (d) => { st2.push(d); }; try { chord('BracketRight'); chord('BracketLeft'); } finally { g.cycleTool = cyc; } if (st2.join() !== '1,-1') bad.push('without the vacuum [ ] should step the hotbar: ' + st2);
    g.keys = {}; return bad.length === 0 || bad.join('; ');
  });

  // ------------------------------------------------------------------------------------------------------------------------------ 6. building: B, planner, shape, rotate, nudge, align, scoop keys on a pad, frames, hammer
  const SH = makeShell(ctx);
  await T('keys.build-b-r-shift-r-ctrl-minus-equal-and-arrows-act-on-the-piece-in-hand', shipped(async () => {
    try {
      SH.setup(); inPlay(); const bad = [], i = toI(-11), k = toK(2);
      const key = (combo) => { chord(combo); if (g.ui.isModalOpen()) g.ui.closeModals(); };
      const plan = async () => ctx.plan();
      S().items['pad:timber'] = 20; SH.equip('pad:timber'); S().items['pad:timber'] = 20; g.rebuildTools(); g._bz = { n: 3, w: 1 };
      SH.aim(i, k); let pl = await plan(); if (!pl.ok) return pl.why; const dir0 = pl.ent.zd;
      // R turns the pad a quarter; Alt+R and Ctrl+R do not
      key('Alt+KeyR'); key('Ctrl+KeyR'); SH.aim(i, k); pl = await plan(); if (pl.ent.zd !== dir0) bad.push('Alt+R or Ctrl+R turned the pad');
      key('KeyR'); SH.aim(i, k); pl = await plan(); if (pl.ent.zd !== ((dir0 + 1) & 3)) bad.push(`R did not turn the pad: ${dir0} -> ${pl.ent.zd}`);
      // Shift+R nudges, bare R does not
      g._bz = { n: 1, w: 1 }; SH.aim(i, k); const base = (await plan()).ent; key('Shift+KeyR'); SH.aim(i, k); pl = await plan(); if (!pl.ok || pl.ent.i0 === base.i0 && pl.ent.k0 === base.k0) bad.push('Shift+R did not nudge the pad'); g._bn = 0;
      // = and - lengthen and shorten the zoop with a pad in hand
      g._bz = { n: 1, w: 1 }; key('Equal'); key('Equal'); if (g._bz.n !== 3) bad.push('= did not lengthen the zoop: ' + g._bz.n); key('Minus'); if (g._bz.n !== 2) bad.push('- did not shorten the zoop: ' + g._bz.n);
      key('Alt+Equal'); key('Ctrl+Equal'); if (g._bz.n !== 2) bad.push('Alt+= or Ctrl+= changed the zoop: ' + g._bz.n);
      // [ ] with a pad in hand step the hotbar (nothing to do with the vacuum)
      const idx = g.buildIdx; key('BracketRight'); if (g.buildIdx === idx) bad.push('] with a pad in hand did not step the hotbar');
      // Ctrl (align) held: the pad snaps to the world grid; the key is the table's, a held key
      SH.equip('pad:timber'); SH.aim(i + 3, k, { back: 3 }); const up = chord('ControlLeft', true); const aligned = KB.down(g.keys, 'align'); up(); if (!aligned) bad.push('holding Ctrl is not the align key'); if (KB.down(g.keys, 'align')) bad.push('letting go of Ctrl left align on');
      // B sets the pad down; Alt+B and a bin-style Semicolon do not
      SH.equip('pad:timber'); SH.aim(i, k); const n0 = S().entities.filter((e) => e.type === 'pad').length; key('Semicolon'); key('Alt+KeyB'); key('Ctrl+KeyB'); if (S().entities.filter((e) => e.type === 'pad').length !== n0) bad.push(';, Alt+B or Ctrl+B put a pad down'); if (g.ui.openModal) bad.push('a panel opened: ' + g.ui.openModal);
      await ctx.plan(); key('KeyB'); await realSleep(20); adv(0.1); const n1 = S().entities.filter((e) => e.type === 'pad').length; if (n1 <= n0) bad.push('B did not set the pad down'); if (g.ui.openModal) bad.push('B with a pad in hand opened ' + g.ui.openModal);
      // X takes down what you aim at (the pad just laid); Alt+X does not
      const laid = S().entities.filter((e) => e.type === 'pad').pop(); if (laid) { SH.aim(laid.i0 ?? i, laid.k0 ?? k); g.stowed = true; g.rebuildTools(); const nn = S().entities.filter((e) => e.type === 'pad').length; look(cellX(laid.i0 ?? i), 0.05, cellZ(laid.k0 ?? k), 2.0); chord('Alt+KeyX'); chord('Ctrl+KeyX'); if (S().entities.filter((e) => e.type === 'pad').length !== nn) bad.push('Alt+X or Ctrl+X took a pad down'); chord('KeyX'); if (S().entities.filter((e) => e.type === 'pad').length >= nn) bad.push('X did not take the pad down'); }
      return bad.length === 0 || bad.join('; ');
    } finally { SH.clean(); }
  }));

  await T('keys.build-arrows-turn-a-frame-and-period-comma-drive-the-line-planner', shipped(async () => {
    const bad = [];
    try {
      SH.setup(); inPlay(); const i = toI(-11), k = toK(2); craft('frame:timber'); selectTool('frame:timber'); const stand = () => { p().pos.set(0, 0, -1.4); p().yaw = 0; p().pitch = 0.1; p().vel.set(0, 0, 0); };
      stand(); adv(0.2); g.frameYaw = null; const slot = g.buildIdx;
      const turn = async (combo) => { const up = chord(combo, true); for (let n = 0; n < 6; n++) { await realSleep(60); adv(0.02); } up(); };
      await turn('ArrowRight'); const y1 = g.frameYaw; if (y1 == null) bad.push('holding Right did not turn the frame'); if (g.buildIdx !== slot) bad.push('Right stepped the hotbar with a frame in hand');
      await turn('ArrowLeft'); if (g.frameYaw == null || !(g.frameYaw < y1)) bad.push('holding Left did not turn it back');
      g.frameYaw = 0.5; chord('ArrowDown'); if (g.frameYaw != null) bad.push('Down did not send the frame back to the grid');
      g.frameYaw = 0; await turn('Alt+ArrowRight'); if (g.frameYaw !== 0) bad.push('Alt+Right turned the frame: ' + g.frameYaw);
    } finally { SH.clean(); }
    // the line planner: belt in hand, Period on or off, Comma next shape, B sets the start, R also shapes
    const B = makeBeltKit(ctx), KK = B.K; B.setup(UP_ALL); inPlay(); S().money = 1e12; g.craftItem('belt', 12); KK.equip('belt'); const plannerOn = () => !!(g.bplan && g.bplan.on);
    try {
      chord('Alt+Period'); chord('Ctrl+Period'); if (plannerOn()) bad.push('Alt+. or Ctrl+. switched the planner on'); chord('Period'); if (!plannerOn()) bad.push('. did not switch the line planner on');
      KK.aimDir(cellX(toI(-11)), 0, cellZ(toK(0.3)), 0, 2.0); await ctx.plan(); chord('KeyB'); await realSleep(20); if (!g.bplan.start) bad.push('B did not set the planner start');
      const v0 = g.bplan.variant | 0; chord('Alt+Comma'); chord('Ctrl+Comma'); if ((g.bplan.variant | 0) !== v0) bad.push('Alt+, or Ctrl+, changed the shape'); chord('Comma'); if ((g.bplan.variant | 0) === v0) bad.push(', did not pick the next route shape');
      chord('KeyQ'); chord('Period'); if (plannerOn()) bad.push('. did not switch the planner off');
      // B with a belt in hand and no planner lays a piece; the key held keeps laying (the hold flag)
      KK.aimDir(cellX(toI(-11)), 0, cellZ(toK(0.3)), 0, 2.0); await ctx.plan(); const nb = () => ctx.tiles().filter((t) => t.type === 'belt').length, b0 = nb(); chord('KeyB'); await realSleep(20); adv(0.1); if (nb() <= b0) bad.push('B did not lay a belt piece'); const up = chord('KeyB', true); const held = KB.down(g.keys, 'place'); up(); if (!held) bad.push('holding B is not the place key'); if (KB.down(g.keys, 'place')) bad.push('place stayed down after letting go of B');
      const up2 = chord('Alt+KeyB', true); const heldAlt = KB.down(g.keys, 'place'); up2(); if (heldAlt) bad.push('Alt+B counts as the held place key');
    } finally { B.cleanup && B.cleanup(); g.bplan = null; g.stowed = true; g.keys = {}; }
    return bad.length === 0 || bad.join('; ');
  }));

  await TT('keys.the-cable-click-starts-a-wire-and-x-takes-a-machine-down', async () => {
    fresh(WORLD_UP()); inPlay(); const bad = []; const pole = await placeAtFloor('pole', -3.6, 6.4, 2.0); if (!pole.ok) return 'pole: ' + pole.why;
    craft('cable'); selectTool('cable'); g.holdBlock = false; g.grabCd = 0; g.throwHold = false; aimPoint(-3.6, 1.0, 6.4, 1.8); adv(0.2); chord('Mouse0'); if (!g.cables.wiring) bad.push('a click on the pole did not start a wire (' + hint() + ')');
    chord('Escape'); if (g.cables.wiring) bad.push('Esc did not cancel the wire'); g.stowed = true; g.rebuildTools();
    // X on the pole takes it down
    aimPoint(-3.6, 1.0, 6.4, 1.8); adv(0.2); const n0 = S().entities.filter((e) => e.type === 'pole').length; chord('Alt+KeyX'); if (S().entities.filter((e) => e.type === 'pole').length !== n0) bad.push('Alt+X took the pole down'); chord('KeyX'); adv(0.1); if (S().entities.filter((e) => e.type === 'pole').length >= n0) bad.push('X did not take the pole down');
    return bad.length === 0 || bad.join('; ');
  });

  // ------------------------------------------------------------------------------------------------------------------------------ 7. rail
  await T('keys.rail-backspace-rushes-home-e-and-space-sit-and-hop-off', shipped(async () => {
    const X = makeRail(ctx), R = await import('../rail.js'); const bad = [];
    try {
      X.setup(); inPlay(); const s = X.std(), car = s.car; g.stowed = true;
      // E on the cart you aim at sits you in it; Alt+E does not
      p().pos.set(car.x - 1.0, car.y, car.z); look(car.x, car.y + 0.3, car.z, 1.0); adv(0.1);
      chord('Alt+KeyE'); adv(0.1); if (car.riders.includes('host')) bad.push('Alt+E sat you in the cart');
      chord('KeyE'); adv(0.1); if (!car.riders.includes('host')) bad.push('E aimed at a cart did not sit you in it: ' + JSON.stringify(car.riders));
      // seated: Backspace rushes home (Alt+Backspace does not), E or Space hop off
      chord('Alt+Backspace'); if (car.st === 'run') bad.push('Alt+Backspace sent the cart');
      chord('Backspace'); if (car.st !== 'run') bad.push('Backspace did not rush the cart home: ' + car.st + ' ' + car.why);
      X.until(() => car.st !== 'run' && (car.spd || 0) === 0, 30);
      let up = chord('Space', true); adv(0.1); up(); adv(0.1); if (car.riders.length) bad.push('Space did not hop off');
      R.useCar(g, car, 'host'); up = chord('Alt+Space', true); adv(0.1); up(); adv(0.1); if (!car.riders.includes('host')) bad.push('Alt+Space hopped off'); g.keys = {};
      up = chord('KeyE', true); adv(0.1); up(); adv(0.1); if (car.riders.length) bad.push('E did not hop off');
    } finally { X.clean(); }
    return bad.length === 0 || bad.join('; ');
  }));

  // ------------------------------------------------------------------------------------------------------------------------------ 8. crew, screens, chat, F3, M, Esc
  await TT('keys.crew-and-screen-keys-open-their-windows-and-do-not-with-alt-or-ctrl', async () => {
    fresh(WORLD_UP()); inPlay(); const bad = [];
    for (const [id, modal] of [['terminal', 'shop'], ['dex', 'dex'], ['journal', 'journal'], ['ach', 'ach'], ['crew', 'crew'], ['inv', 'inv']]) {
      const combo = KB.binds(id)[0]; shut(); chord('Alt+' + combo); chord('Ctrl+' + combo); if (g.ui.openModal) bad.push(`Alt or Ctrl with ${combo} opened ${g.ui.openModal}`); shut();
      chord(combo); if (g.ui.openModal !== modal) { bad.push(`${combo} opened "${g.ui.openModal}", not "${modal}"`); continue; } chord(combo); if (g.ui.openModal === modal) bad.push(`${combo} did not close ${modal} again`);
    }
    // Esc opens the pause menu (the browser owns Esc while the mouse is captured, so the game sees it only after the pointer lock is gone) and closes it again
    // (the game loop itself opens the pause menu when the pointer lock is gone, so the lock is taken away and the key pressed in the same tick)
    const d = Object.getOwnPropertyDescriptor(document, 'pointerLockElement'); shut(); await realSleep(120);
    Object.defineProperty(document, 'pointerLockElement', { get: () => null, configurable: true });
    try {
      chord('Alt+Escape'); if (g.ui.openModal) bad.push('Alt+Esc opened ' + g.ui.openModal); chord('Escape'); if (g.ui.openModal !== 'pause') bad.push('Esc did not open the pause menu: ' + g.ui.openModal);
      chord('Alt+Escape'); if (g.ui.openModal !== 'pause') bad.push('Alt+Esc closed the pause menu (or something else changed it): ' + g.ui.openModal); chord('Escape'); if (g.ui.openModal) bad.push('Esc did not close the pause menu: ' + g.ui.openModal);
    } finally { if (d) Object.defineProperty(document, 'pointerLockElement', d); }
    shut();
    // T sends the crew digging, Y calls them home
    io.clearHint(); chord('KeyT'); if (!/No crew yet/.test(hint())) bad.push('T with no crew: ' + hint());
    const b = g.crew.spawn(); p().pos.set(0, 0, -1.4); p().yaw = Math.PI / 2; p().pitch = 0; b.state = 'idle'; adv(0.1); io.clearHint(); chord('Alt+KeyT'); if (hint()) bad.push('Alt+T did something: ' + hint()); chord('KeyT'); if (!/sent digging|No pile that way/.test(hint())) bad.push('T gave no crew message: ' + hint());
    io.clearHint(); b.state = 'dig'; chord('Alt+KeyY'); if (b.state !== 'dig') bad.push('Alt+Y called the crew'); chord('KeyY'); if (!/heading home/.test(hint()) || b.state === 'dig') bad.push('Y did not call the crew home: ' + hint() + ' ' + b.state);
    // F3 frame rate, M load meter
    const fps = document.getElementById('fps'); g.showFps = false; fps.classList.add('hidden'); chord('Alt+F3'); g.perf(16); if (!fps.classList.contains('hidden')) bad.push('Alt+F3 showed the frame rate'); chord('F3'); g.perf(16); if (fps.classList.contains('hidden')) bad.push('F3 did not show the frame rate'); chord('F3'); g.perf(16); if (!fps.classList.contains('hidden')) bad.push('F3 did not hide it again');
    g._pwHud = false; chord('Alt+KeyM'); chord('Ctrl+KeyM'); if (g._pwHud) bad.push('Alt or Ctrl with M turned the meter on'); chord('KeyM'); if (!g._pwHud) bad.push('M did not turn the load meter on'); chord('KeyM'); if (g._pwHud) bad.push('M again did not turn it off');
    // F1 the Field Guide: opens on the title screen and in play, again closes it, Alt+F1 does nothing, and it leaves the mode, the pointer and the held keys alone
    shut(); g.keys = { KeyW: true }; chord('Alt+F1'); if (g.ui.openModal) bad.push('Alt+F1 opened a window: ' + g.ui.openModal); chord('F1'); if (g.ui.openModal !== 'guide') bad.push('F1 did not open the Field Guide: ' + g.ui.openModal); if (g.keys.KeyW) bad.push('F1 left a held key on'); if (g.mode !== 'play') bad.push('F1 changed the mode: ' + g.mode);
    chord('F1'); if (g.ui.openModal) bad.push('F1 again did not close the Field Guide: ' + g.ui.openModal);
    g.keys = {}; return bad.length === 0 || bad.join('; ');
  });

  await TT('keys.chat-opens-on-the-backtick-in-co-op-only-never-while-typing-or-in-a-window-and-the-old-enter-and-variants-do-nothing', async () => {
    fresh(WORLD_UP()); inPlay(); const bad = []; const c = document.getElementById('chatIn'); const open0 = g.net.open; const closed = () => c.classList.contains('hidden');
    try {
      // single player: the backtick is nothing
      g.net.open = false; shut(); chord('Backquote'); if (!closed()) bad.push('the backtick opened chat in a single player game');
      // playing together
      g.net.open = true; chord('Enter'); if (!closed()) bad.push('Enter still opens chat'); chord('Semicolon'); if (!closed()) bad.push('; opens chat');
      chord('Alt+Backquote'); chord('Ctrl+Backquote'); if (!closed()) bad.push('Alt or Ctrl with the backtick opened chat'); shut();
      chord('Backquote'); if (closed()) bad.push('the backtick did not open chat while playing together'); if (document.activeElement !== c) bad.push('the chat box did not take the keyboard'); if (c.value !== '') bad.push('the backtick that opened chat was typed into it: "' + c.value + '"');
      // typed inside the open box: a character, not a toggle
      const typed = new KeyboardEvent('keydown', { code: 'Backquote', key: '`', bubbles: true, cancelable: true }); c.dispatchEvent(typed); if (closed()) bad.push('a backtick typed in the chat box closed it'); if (typed.defaultPrevented) bad.push('a backtick typed in the chat box was prevented');
      // Enter sends the line and closes the box, Esc cancels it
      const sent = []; const send0 = g.netSend; g.netSend = (m) => { sent.push(m); }; c.value = 'hi `there'; c.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true, cancelable: true })); g.netSend = send0;
      if (sent.length !== 1 || sent[0].text !== 'hi `there') bad.push('Enter in the box did not send the line: ' + JSON.stringify(sent)); if (!closed()) bad.push('the box stayed open after Enter');
      chord('Backquote'); c.value = 'x'; c.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true })); if (!closed()) bad.push('Esc did not cancel the chat box'); shut();
      // not while typing in another box
      const inp = document.getElementById('mpCodeIn'); inp.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`', bubbles: true, cancelable: true })); if (!closed()) bad.push('the backtick opened chat while typing in another box');
      // not in a window or a menu
      for (const m of ['inv', 'pause', 'shop', 'journal', 'dex', 'ach', 'crew']) { g.ui.open(m); chord('Backquote'); if (!closed()) bad.push('the backtick opened chat over the ' + m + ' window'); shut(); }
    } finally { g.net.open = open0; shut(); g.keys = {}; }
    return bad.length === 0 || bad.join('; ');
  });

  // ------------------------------------------------------------------------------------------------------------------------------ 9. every action has been driven
  await TT('keys.every-action-of-the-table-is-covered-by-a-test-in-this-file', async () => {
    // the ids pressed above, by their test: a new action added to the table without a test here fails this
    const covered = new Set(['fwd', 'left', 'back', 'right', 'sprint', 'jump', 'crouch', 'grab', 'throw', 'punch', 'use', 'copycfg', 'bin', 'copybin', 'flash', 'medkit', 'cart', 'recall', 'give',
      'hb1', 'hb2', 'hb3', 'hb4', 'hb5', 'hb6', 'hb7', 'hb8', 'hb9', 'hbprev', 'hbnext', 'stow', 'place', 'cable', 'align', 'planner', 'shape', 'rotate', 'nudge', 'frameL', 'frameR', 'frameGrid', 'dismantle',
      'scoopLess', 'scoopMore', 'vacLess', 'vacMore', 'railHome', 'railUse', 'inv', 'crew', 'crewDig', 'crewHome', 'botRelease', 'terminal', 'dex', 'journal', 'ach', 'pause', 'chat', 'fps', 'meter', 'guide']);
    const driven = new Set(['look', 'hbwheel']);   // look is the mouse position (not a key press), the wheel is driven in the hotbar test through the real wheel event
    const missing = KB.ACTIONS.filter((a) => !covered.has(a.id) && !driven.has(a.id)).map((a) => a.id);
    return missing.length === 0 || 'actions with no test in keys_all.js: ' + missing.join(' ');
  });
}
