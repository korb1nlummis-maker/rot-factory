// The one keybind table. Every key the game answers to is a row here: game.js, ui.js, hall.js, rail.js and the tests ask this table, and
// nothing else decides what a key does. The pause menu's Controls tab and the How to Play screen are drawn from it (controls.js is a view over it),
// and a player's own choices are saved in localStorage ('rotfactory.keys') and merged over the shipped bindings.
//
// A combo is a string: optional 'Ctrl+', 'Alt+', 'Shift+' prefixes (in that order) and then a KeyboardEvent code ('KeyE', 'Digit1', 'Semicolon'),
// or 'Mouse0'..'Mouse4', 'WheelUp', 'WheelDown' ('Wheel' and 'Mouse move' are fixed and cannot be rebound).
//
// MODIFIERS. A combo with Shift, Alt or Ctrl matches only with exactly that modifier state. A bare key does not fire with an extra Alt or Ctrl
// held. Shift is also the sprint key, so a bare key still works while you sprint; but where Shift+key is an action of its own (Shift+E copy,
// Shift+; copy bin, Shift+R nudge) that one wins. Bare mouse buttons ignore modifiers (you click while you sprint).
//
// CONTEXTS decide between actions that share a key. Priority, first active wins (resolve() is the only place that decides):
//   bot     a bot is selected or a power cable wire is being pulled     Esc: let go / cancel the wire, before the pause menu
//   cable   the Power Cable is the tool in hand                          Left click: the cable click, before the grab
//   rail    you aim at a Rail Cart (or its station) or sit in a cart    E and Space: load, sit, hop off, before use and jump
//   build   a building item, a belt, a hose, a pad, a frame or the hammer is in hand     B: set it down (not a bin); R: rotate it before it punches
//   hands   bare hands (or the tool put away)                             [ and ]: the Plush Vacuum dial (when the vacuum is owned), before the hotbar
//   menu, any   always active
// A handler may decline (return false): the next candidate for the same key then gets it (R turns a piece, or punches when there is nothing to turn).
const LS_KEY = 'rotfactory.keys';

// [group, id, name, desc, default combos, context, flag]. The page the player edited was the source of this list (flag: hold, locked).
const ROWS = [
  ['Moving', 'fwd', 'Walk forward', 'Also climbs a ladder. Keep pressing it at the top to step onto the plate.', ['KeyW'], 'any'],
  ['Moving', 'left', 'Walk left', 'Strafe left.', ['KeyA'], 'any'],
  ['Moving', 'back', 'Walk back', 'Goes down a ladder.', ['KeyS'], 'any'],
  ['Moving', 'right', 'Walk right', 'Strafe right.', ['KeyD'], 'any'],
  ['Moving', 'sprint', 'Sprint', 'Hold.', ['ShiftLeft'], 'any', 'hold'],
  ['Moving', 'jump', 'Jump', 'Also climbs a ladder. When buried under plush, hold it to punch upward.', ['Space'], 'any'],
  ['Moving', 'crouch', 'Crouch', 'Hold to fit low tunnels.', ['KeyC'], 'any', 'hold'],
  ['Moving', 'look', 'Look around', 'Mouse movement. Click the game once to capture the mouse.', ['Mouse move'], 'any', 'locked'],
  ['Hands', 'grab', 'Grab plush', 'Hold to keep grabbing until your hands or cart are full. Click while holding plush to throw one.', ['Mouse0', 'KeyG'], 'hands', 'hold'],
  ['Hands', 'throw', 'Throw one plush', 'From your hands or your cart.', ['KeyZ'], 'any'],
  ['Hands', 'punch', 'Punch', 'Knocks loose the plush in front of you, or punches you out of a hole.', ['Mouse2', 'KeyR', 'KeyP'], 'hands'],
  ['Hands', 'use', 'Use what you aim at', 'Terminal, crafting bench, generators, doors, bots, crates, scanners, lifts, lanterns, switches.', ['KeyE'], 'any'],
  ['Hands', 'copycfg', 'Copy machine settings', 'Then use the Use key on another machine to paste.', ['Shift+KeyE'], 'any'],
  ['Hands', 'bin', 'Assign a bin', 'Aim at a machine, truck, digger, rig, mech, Portal, Rail Station or cart. With a building item in hand this key sets it down instead; with a cart in hand it rolls the cart out or parks it.', ['KeyB'], 'any'],
  ['Hands', 'copybin', 'Copy the bin of what you aim at', 'Or of the selected bot.', ['Shift+Semicolon'], 'any'],
  ['Hands', 'flash', 'Flashlight', 'On or off.', ['KeyF', 'KeyO'], 'any'],
  ['Hands', 'medkit', 'Use a medkit', 'Heals 50.', ['KeyK'], 'any'],
  ['Hands', 'cart', 'Cart: roll out, park, call back', 'Rolls your cart out, parks it, or calls it back to follow you.', ['KeyU'], 'any'],
  ['Hands', 'recall', 'Emergency recall to the nearest depot', 'Hold for 2.5 seconds.', ['KeyH'], 'any', 'hold'],
  ['Hands', 'give', 'Give one item to your friend', 'Co-op, within 3 m. Hold Shift for ten.', ['Slash'], 'any'],
  ['Tools and building', 'hb1', 'Hotbar slot 1', 'Press the same number again to put the tool away.', ['Digit1'], 'any'],
  ['Tools and building', 'hb2', 'Hotbar slot 2', 'Take out the tool in slot 2.', ['Digit2'], 'any'],
  ['Tools and building', 'hb3', 'Hotbar slot 3', 'Take out the tool in slot 3.', ['Digit3'], 'any'],
  ['Tools and building', 'hb4', 'Hotbar slot 4', 'Take out the tool in slot 4.', ['Digit4'], 'any'],
  ['Tools and building', 'hb5', 'Hotbar slot 5', 'Take out the tool in slot 5.', ['Digit5'], 'any'],
  ['Tools and building', 'hb6', 'Hotbar slot 6', 'Take out the tool in slot 6.', ['Digit6'], 'any'],
  ['Tools and building', 'hb7', 'Hotbar slot 7', 'Take out the tool in slot 7.', ['Digit7'], 'any'],
  ['Tools and building', 'hb8', 'Hotbar slot 8', 'Take out the tool in slot 8.', ['Digit8'], 'any'],
  ['Tools and building', 'hb9', 'Hotbar slot 9', 'Take out the tool in slot 9.', ['Digit9'], 'any'],
  ['Tools and building', 'hbprev', 'Previous hotbar tool', 'Steps back through your hotbar tools.', ['BracketLeft'], 'any'],
  ['Tools and building', 'hbnext', 'Next hotbar tool', 'Steps forward through your hotbar tools.', ['BracketRight'], 'any'],
  ['Tools and building', 'hbwheel', 'Step the hotbar with the mouse wheel', 'Scrolling either way.', ['Wheel'], 'any', 'locked'],
  ['Tools and building', 'stow', 'Stow or take out your tool', 'With a wire in your hand it drops the wire; with a route anchored it puts the route down first.', ['KeyQ'], 'any'],
  ['Tools and building', 'place', 'Set down the building item', 'Hold to lay a line of belts, hose or road plates, or drag pads. A drag lays as many as you hold.', ['KeyB'], 'build', 'hold'],
  ['Tools and building', 'cable', 'Power cable: start and attach a wire', 'Click a generator, pole or machine, then a second one. Click empty air to cancel.', ['Mouse0'], 'cable'],
  ['Tools and building', 'align', 'Align pads to the world grid', 'Hold while placing floor pads or plates.', ['ControlLeft'], 'build', 'hold'],
  ['Tools and building', 'planner', 'Line Planner on or off', 'Belt or hose in hand. Lift in hand: one cell taller.', ['Period'], 'build'],
  ['Tools and building', 'shape', 'Next route shape', 'Line Planner on. Lift in hand: one cell shorter.', ['Comma'], 'build'],
  ['Tools and building', 'rotate', 'Rotate the piece in hand', 'Flips a ramp or lift, turns a pad, catwalk, wall, door or stair, or a jump pad heading.', ['KeyR'], 'build'],
  ['Tools and building', 'nudge', 'Nudge the spot one cell off the grid', 'Floor pad, catwalk or wall in hand.', ['Shift+KeyR'], 'build'],
  ['Tools and building', 'frameL', 'Turn a frame left', 'Frame in hand. Hold Shift for fine turns.', ['ArrowLeft'], 'build'],
  ['Tools and building', 'frameR', 'Turn a frame right', 'Frame in hand. Hold Shift for fine turns.', ['ArrowRight'], 'build'],
  ['Tools and building', 'frameGrid', 'Frame back to the grid', 'Snaps to other frames again.', ['ArrowDown'], 'build'],
  ['Tools and building', 'dismantle', 'Knock down what you aim at', 'You get it back. The hammer in slot 1 does the same with a click.', ['KeyX'], 'any'],
  ['Tools and building', 'scoopLess', 'Scoop 3 fewer per grab', 'Scoop Hands, nothing to build in hand. With a pad it shortens the line.', ['Minus'], 'hands'],
  ['Tools and building', 'scoopMore', 'Scoop 3 more per grab', 'Scoop Hands, nothing to build in hand. With a pad it lengthens the line.', ['Equal'], 'hands'],
  ['Tools and building', 'vacLess', 'Vacuum pulls gentler', 'Plush Vacuum, 10 percent at a time.', ['BracketLeft'], 'hands'],
  ['Tools and building', 'vacMore', 'Vacuum pulls harder', 'Plush Vacuum, 10 percent at a time.', ['BracketRight'], 'hands'],
  ['Tools and building', 'railHome', 'Rail cart: rush home', 'Or back to the face when you are already at the base.', ['Backspace'], 'rail'],
  ['Tools and building', 'railUse', 'Rail cart: load or sit, and hop off', 'Loads the plush in your hands, or sits you in it with empty hands. Hops off when seated.', ['KeyE', 'Space'], 'rail'],
  ['Tools and building', 'inv', 'Inventory', 'Arrows move, a number puts the item on that hotbar slot, X clears a slot.', ['KeyI'], 'any'],
  ['Crew', 'crew', 'Crew panel', 'Every bot, its battery and what it is doing.', ['KeyV'], 'any'],
  ['Crew', 'crewDig', 'Send the crew digging', 'The way you face.', ['KeyT'], 'any'],
  ['Crew', 'crewHome', 'Call the crew home to unload', 'Every bot goes home.', ['KeyY'], 'any'],
  ['Crew', 'botRelease', 'Let go of the selected bot', 'Also cancels a power cable wire you are pulling.', ['Escape'], 'bot'],
  ['Screens', 'terminal', 'Upgrade terminal', 'Works anywhere.', ['Tab'], 'any'],
  ['Screens', 'dex', 'Plushdex', 'Every species you have found.', ['KeyN'], 'any'],
  ['Screens', 'journal', 'Field journal', 'Finds and notes.', ['KeyL'], 'any'],
  ['Screens', 'ach', 'Achievements and care package log', 'Achievements.', ['KeyJ'], 'any'],
  ['Screens', 'pause', 'Pause menu', 'Also closes the window you are in.', ['Escape'], 'menu'],
  ['Screens', 'chat', 'Chat', 'Co-op only.', ['Backquote'], 'any'],
  ['Screens', 'fps', 'Show or hide the frame rate', 'Frame rate readout.', ['F3'], 'any'],
  ['Screens', 'meter', 'Load meter', 'Supply, demand and storage of the grid you stand in.', ['KeyM'], 'any'],
  ['Screens', 'guide', 'Field Guide', 'How to play, and a page for every part of the game. Works on the title screen too.', ['F1'], 'any'],
];

// What the player changed in the editable page, applied over the page's own defaults. These are the shipped bindings.
export const USER_EDITS = {
  bin: ['KeyB'],            // was Semicolon (the key B now sets a building item down when one is in hand, see the contexts above)
  chat: ['Backquote'],      // was Enter
  vacLess: ['BracketLeft'], // was Alt+Minus
  vacMore: ['BracketRight'],// was Alt+Equal
};

export const ACTIONS = ROWS.map(([group, id, name, desc, def, ctx, flag]) => Object.freeze({ id, group, name, desc, ctx, flag: flag || '', def: Object.freeze(def.slice()) }));
export const ACTION_BY_ID = Object.freeze(Object.fromEntries(ACTIONS.map((a) => [a.id, a])));
export const GROUPS = [...new Set(ACTIONS.map((a) => a.group))];
// the page's own defaults, then the shipped bindings with the player's edits on top (what Reset goes back to)
export const PAGE_DEFAULTS = Object.freeze(Object.fromEntries(ACTIONS.map((a) => [a.id, a.def])));
export const DEFAULTS = Object.freeze(Object.fromEntries(ACTIONS.map((a) => [a.id, Object.freeze((USER_EDITS[a.id] || a.def).slice())])));
// Escape is the browser's own way out of the mouse capture, so these two always keep it (more keys can be added)
const PINNED = { pause: ['Escape'], botRelease: ['Escape'] };
export const CTX_LABEL = { hands: 'bare hands or scoop', build: 'building item in hand', rail: 'on a rail cart', cable: 'power cable out', bot: 'bot selected', menu: 'menus' };
export const CTX_PRIORITY = ['bot', 'cable', 'rail', 'build', 'hands', 'menu', 'any'];
const ALWAYS = new Set(['any', 'menu']);
export const MAX_COMBOS = 4;

// ------------------------------------------------------------------------------------------------------------------ combos
const CODE_OK = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2])|Arrow(Up|Down|Left|Right)|Numpad[A-Za-z0-9]+|Space|Tab|Enter|Backspace|Escape|Backquote|Minus|Equal|Bracket(Left|Right)|Semicolon|Quote|Comma|Period|Slash|Backslash|IntlBackslash|Home|End|PageUp|PageDown|Insert|Delete|CapsLock|(Shift|Control|Alt)(Left|Right)|Mouse[0-4]|Wheel(Up|Down))$/;
const MODKEY = { ShiftLeft: 's', ShiftRight: 's', ControlLeft: 'c', ControlRight: 'c', AltLeft: 'a', AltRight: 'a' };
const isMouse = (code) => /^(Mouse[0-4]|Wheel|WheelUp|WheelDown)$/.test(code);
const NAMES = { Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Alt', AltRight: 'Right Alt', Mouse0: 'Left click', Mouse1: 'Middle click', Mouse2: 'Right click', Mouse3: 'Mouse back', Mouse4: 'Mouse forward', Wheel: 'Wheel', WheelUp: 'Wheel up', WheelDown: 'Wheel down', 'Mouse move': 'Mouse', PageUp: 'Page up', PageDown: 'Page down', CapsLock: 'Caps lock', IntlBackslash: '\\' };
const partName = (p) => NAMES[p] || (p.startsWith('Key') ? p.slice(3) : p.startsWith('Digit') ? p.slice(5) : p.startsWith('Numpad') ? 'Num ' + p.slice(6) : p);
// 'Shift+KeyE' -> { s: true, a: false, c: false, code: 'KeyE' }; null for a malformed combo
export function parse(combo) {
  if (typeof combo !== 'string' || !combo) return null;
  const parts = combo.split('+'); let code = parts.pop(); if (code === '' && parts.length && combo.endsWith('++')) return null;
  const m = { s: false, a: false, c: false, code };
  for (const p of parts) { if (p === 'Shift') m.s = true; else if (p === 'Alt') m.a = true; else if (p === 'Ctrl') m.c = true; else return null; }
  if (code === 'Mouse move' || code === 'Wheel') return parts.length ? null : m;
  return CODE_OK.test(code) ? m : null;
}
export const fmt = (m) => [m.c ? 'Ctrl' : '', m.a ? 'Alt' : '', m.s ? 'Shift' : '', m.code].filter(Boolean).join('+');
export const label = (combo) => String(combo).split('+').map(partName).join(' + ');
// the parts of a combo as separate key caps: 'Shift+KeyE' -> ['Shift', 'E']
export const caps = (combo) => String(combo).split('+').map(partName);
export const baseCode = (combo) => { const m = parse(combo); return m ? m.code : String(combo).split('+').pop(); };
// a KeyboardEvent (or MouseEvent / WheelEvent), or a code string with an optional modifier object, as { s, a, c, code }
export function evCombo(ev, mods) {
  const code = typeof ev === 'string' ? ev : ev.code; const src = typeof ev === 'string' ? (mods || {}) : ev;
  const self = MODKEY[code];
  return { s: self === 's' ? false : !!src.shiftKey, a: self === 'a' ? false : !!src.altKey, c: self === 'c' ? false : !!src.ctrlKey, code };
}
export const comboOfEvent = (ev, mods) => fmt(evCombo(ev, mods));

// ------------------------------------------------------------------------------------------------------------------ bindings
let USER = {};              // the player's saved choices: id -> combos (only ones that differ from the shipped bindings)
let CUR = {};               // the effective bindings: id -> combos
let INDEX = new Map();      // code -> [{ id, s, a, c, ctx }]
let VERSION = 0;
const listeners = new Set();
export const version = () => VERSION;
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const sameList = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
const withPinned = (id, list) => { const pin = PINNED[id]; return pin ? [...pin, ...list.filter((c) => !pin.includes(c))] : list; };
// Hard clashes in a candidate binding map: two non-locked actions in the SAME context on one combo. Returns [[idA, idB, combo], ...]
export function clashes(map) {
  const seen = new Map(), out = [];
  for (const a of ACTIONS) {
    if (a.flag === 'locked') continue;
    for (const c of map[a.id] || []) { const key = a.ctx + '|' + c; if (seen.has(key)) out.push([seen.get(key), a.id, c]); else seen.set(key, a.id); }
  }
  return out;
}
// what a saved value is allowed to be: known, rebindable, at most MAX_COMBOS well formed combos, no browser-owned key
function cleanCombos(id, v) {
  const a = ACTION_BY_ID[id]; if (!a || a.flag === 'locked' || !Array.isArray(v)) return null;
  const out = [];
  for (const c of v) {
    const m = parse(c); if (!m || fmt(m) !== c) return null;
    if (m.code === 'Escape' && !PINNED[id]) return null;                  // Esc is the browser's: only the pause menu and bot release have it
    if (/^F(5|11|12)$/.test(m.code)) return null;                          // reload, full screen, dev tools
    if (m.c && /^(Key|Digit|Tab|F)/.test(m.code)) return null;             // Ctrl+W closes the tab, Ctrl+T opens one, and so on
    if (MODKEY[m.code] && (m.s || m.a || m.c)) return null;                // a modifier key alone is the combo
    if (out.includes(c)) return null;
    out.push(c);
  }
  if (out.length > MAX_COMBOS) return null;
  return out;
}
function rebuild() {
  CUR = {};
  for (const a of ACTIONS) CUR[a.id] = withPinned(a.id, (USER[a.id] || DEFAULTS[a.id]).slice());
  INDEX = new Map();
  for (const a of ACTIONS) {
    if (a.flag === 'locked') continue;
    for (const c of CUR[a.id]) { const m = parse(c); if (!m) continue; if (!INDEX.has(m.code)) INDEX.set(m.code, []); INDEX.get(m.code).push({ id: a.id, s: m.s, a: m.a, c: m.c, ctx: a.ctx }); }
  }
  VERSION++;
  for (const fn of listeners) { try { fn(); } catch (e) { /* a listener must not break the table */ } }
}
// validate a whole saved object: syntax first, then drop the entries that clash with another action in the same context until none do
export function sanitize(obj) {
  const kept = {}, dropped = [];
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const id of Object.keys(obj)) {
      const c = cleanCombos(id, obj[id]);
      if (!c) { dropped.push(id); continue; }
      const eff = withPinned(id, c); if (sameList(eff, withPinned(id, DEFAULTS[id].slice()))) continue;   // same as shipped: nothing to keep
      kept[id] = c;
    }
  } else if (obj !== undefined && obj !== null) dropped.push('*');
  for (let guard = 0; guard < 200; guard++) {
    const map = {}; for (const a of ACTIONS) map[a.id] = withPinned(a.id, (kept[a.id] || DEFAULTS[a.id]).slice());
    const bad = clashes(map); if (!bad.length) break;
    let removed = false;
    for (const [x, y] of bad) { const victim = kept[y] ? y : kept[x] ? x : null; if (victim) { delete kept[victim]; dropped.push(victim); removed = true; break; } }
    if (!removed) break;   // the shipped table itself clashes (a test catches that), nothing more to drop
  }
  return { kept, dropped };
}
const store = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
function persist() {
  const s = store(); if (!s) return;
  try { if (Object.keys(USER).length) s.setItem(LS_KEY, JSON.stringify(USER)); else s.removeItem(LS_KEY); } catch (e) { /* storage full or blocked: the choices last for this session */ }
}
// read the saved choices again (the game does this once at load; a test calls it after writing localStorage)
export function reload() {
  let raw = null; const s = store();
  try { raw = s ? s.getItem(LS_KEY) : null; } catch (e) { raw = null; }
  let obj; try { obj = raw ? JSON.parse(raw) : undefined; } catch (e) { obj = null; }
  USER = sanitize(obj).kept; rebuild(); return USER;
}
export const userOverrides = () => JSON.parse(JSON.stringify(USER));

export const binds = (id) => (CUR[id] || []).slice();
export const isDefault = (id) => !USER[id];
export const bindsFor = binds;
// the combo clash a proposal would make: the actions in the same context that already own the combo (excluding the action itself)
export function conflictsFor(id, combo) {
  const a = ACTION_BY_ID[id]; if (!a) return [];
  return ACTIONS.filter((b) => b.id !== id && b.flag !== 'locked' && b.ctx === a.ctx && (CUR[b.id] || []).includes(combo));
}
// the actions that share a combo with this one in another context (allowed, decided by the context priority)
export function sharedWith(id, combo) {
  const a = ACTION_BY_ID[id]; if (!a) return [];
  return ACTIONS.filter((b) => b.id !== id && b.flag !== 'locked' && b.ctx !== a.ctx && (CUR[b.id] || []).includes(combo));
}
// set an action's combos (a player's choice): validated, saved. Returns { ok, why }.
export function setBinds(id, combos) {
  const a = ACTION_BY_ID[id]; if (!a) return { ok: false, why: 'No such action.' };
  if (a.flag === 'locked') return { ok: false, why: `${a.name} is fixed.` };
  const c = cleanCombos(id, combos); if (!c) return { ok: false, why: 'That key cannot be used here.' };
  const map = {}; for (const b of ACTIONS) map[b.id] = b.id === id ? withPinned(id, c) : CUR[b.id];
  const bad = clashes(map).find(([x, y]) => x === id || y === id);
  if (bad) { const other = ACTION_BY_ID[bad[0] === id ? bad[1] : bad[0]]; return { ok: false, why: `${label(bad[2])} is already ${other.name}.`, other: other.id, combo: bad[2] }; }
  if (sameList(withPinned(id, c), withPinned(id, DEFAULTS[id].slice()))) delete USER[id]; else USER[id] = c;
  persist(); rebuild(); return { ok: true };
}
export function resetBinds(id) { if (id === undefined) USER = {}; else delete USER[id]; persist(); rebuild(); }

// ------------------------------------------------------------------------------------------------------------------ resolving
const ctxHas = (ctx, name) => (ALWAYS.has(name) ? true : !ctx ? false : ctx instanceof Set ? ctx.has(name) : Array.isArray(ctx) ? ctx.includes(name) : ctx === name);
const prio = (c) => CTX_PRIORITY.indexOf(c);
// every action this key press could be, best first. Exact modifier matches come first; then, while Shift is the only extra modifier (you are
// sprinting), the bare combos; a bare mouse button matches whatever modifiers are down.
export function candidates(ev, ctx, mods) {
  if (ev && typeof ev === 'object' && ev.metaKey) return [];   // Cmd is the browser's (Cmd+[ is Back, Cmd+W closes the tab): no game action takes it
  const m = evCombo(ev, mods), list = INDEX.get(m.code); if (!list) return [];
  const exact = list.filter((e) => e.s === m.s && e.a === m.a && e.c === m.c);
  const loose = list.filter((e) => !exact.includes(e) && !e.s && !e.a && !e.c && (isMouse(m.code) || (m.s && !m.a && !m.c)));
  const order = (arr) => {
    if (arr.length <= 1) return arr;
    const act = arr.filter((e) => ctxHas(ctx, e.ctx)); const pick = act.length ? act : arr;
    return pick.slice().sort((x, y) => prio(x.ctx) - prio(y.ctx));
  };
  const all = exact.length + loose.length;
  if (all === 0) return [];
  if (all === 1) return [(exact[0] || loose[0]).id];
  // exact matches that no context activates still beat a looser match
  const e2 = order(exact), l2 = order(loose);
  return [...e2, ...l2].map((e) => e.id).filter((id, i, arr) => arr.indexOf(id) === i);
}
export const resolve = (ev, ctx, mods) => candidates(ev, ctx, mods)[0] || null;

// The physical key map the game keeps (g.keys: code -> true while down, 'Mouse0'.. for buttons). A hold action is on while any of its combos is.
// Modifiers in the combo must be down; extra modifiers do not matter (you walk while you sprint).
const modDown = (keys, which) => which === 's' ? !!(keys.ShiftLeft || keys.ShiftRight) : which === 'c' ? !!(keys.ControlLeft || keys.ControlRight) : !!(keys.AltLeft || keys.AltRight);
export function down(keys, id) {
  if (!keys) return false;
  for (const c of CUR[id] || []) {
    const m = parse(c); if (!m || !keys[m.code]) continue; if (m.s && !modDown(keys, 's')) continue; if (m.a && !modDown(keys, 'a')) continue; if (m.c && !modDown(keys, 'c')) continue;
    // a bare key action is not the Alt or Ctrl variant of it (Alt+W does not walk, Alt+H does not recall): only Shift may ride along (you sprint). Mouse buttons and the modifier keys themselves ignore this.
    if (!isMouse(m.code) && !MODKEY[m.code] && ((!m.a && modDown(keys, 'a')) || (!m.c && modDown(keys, 'c')))) continue;
    return true;
  }
  return false;
}
// the base codes of an action (for code that wants to ask 'is this action's key this code')
export const codesOf = (id) => [...new Set((CUR[id] || []).map(baseCode))];
export const hasCode = (id, code) => codesOf(id).includes(code);

// ------------------------------------------------------------------------------------------------------------------ fixed navigation keys
// Arrow keys inside the inventory window and the Bench are menu navigation, not game actions: they are not rebindable.
export const NAV = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
export const navOf = (code) => NAV[code] || null;

// ------------------------------------------------------------------------------------------------------------------ text
export const keyText = (id) => { const l = (CUR[id] || [])[0]; return l ? label(l) : 'unbound'; };
export const keyTextAll = (id) => { const l = CUR[id] || []; return l.length ? l.map(label).join(' or ') : 'unbound'; };
const kbdOf = (combo) => caps(combo).map((p) => `<kbd>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</kbd>`).join('+');
export const kbd = (id) => { const l = (CUR[id] || [])[0]; return l ? kbdOf(l) : '<kbd>unbound</kbd>'; };
export const kbdAll = (id) => { const l = CUR[id] || []; return l.length ? l.map(kbdOf).join(' or ') : '<kbd>unbound</kbd>'; };
// '{bin}' in a text becomes the current key of that action ('B'); fillHtml makes it a <kbd> cap
export const fill = (s) => String(s).replace(/\{([A-Za-z0-9]+)\}/g, (m, id) => (ACTION_BY_ID[id] ? keyText(id) : m));
export const fillHtml = (s) => String(s).replace(/\{([A-Za-z0-9]+)\}/g, (m, id) => (ACTION_BY_ID[id] ? kbd(id) : m));

reload();
