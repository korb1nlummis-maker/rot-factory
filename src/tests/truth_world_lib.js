// Shared helpers for the truth_world_*.js files (no default export, so the test loader skips it).
// Every claim a hint, tooltip or table row makes about a key is proved by pressing that key the way the browser does: a real KeyboardEvent
// on window (game.wireUI listens there) or a real mousedown/mouseup, and then looking at what the game did.
export function makeIO(ctx) {
  const { g } = ctx;
  const fire = (type, code, o = {}) => window.dispatchEvent(new KeyboardEvent(type, { code, key: o.key || code, bubbles: true, cancelable: true, ...o }));
  const io = {
    down: (code, o) => fire('keydown', code, o),
    up: (code, o) => fire('keyup', code, o),
    tap: (code, o) => { fire('keydown', code, o); fire('keyup', code, o); },
    // Shift+key as a keyboard sends it: Shift goes down first, the key carries shiftKey, then both come up
    shiftTap: (code) => { fire('keydown', 'ShiftLeft', { shiftKey: true }); fire('keydown', code, { shiftKey: true }); fire('keyup', code, { shiftKey: true }); fire('keyup', 'ShiftLeft'); },
    mouseDown: (button = 0) => window.dispatchEvent(new MouseEvent('mousedown', { button, bubbles: true, cancelable: true })),
    mouseUp: (button = 0) => window.dispatchEvent(new MouseEvent('mouseup', { button, bubbles: true, cancelable: true })),
    click: (button = 0) => { io.mouseDown(button); io.mouseUp(button); },
    wheel: (dy) => window.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, bubbles: true })),
    hint: () => (document.getElementById('hint').textContent || '').replace(/\s+/g, ' ').trim(),
    hintHtml: () => document.getElementById('hint').innerHTML,
    clearHint: () => { const h = document.getElementById('hint'); h.innerHTML = ''; },
    modal: () => g.ui.openModal,
    toastText: () => [...document.querySelectorAll('#toasts .toast, .toast')].map((t) => t.textContent).join(' | '),
  };
  return io;
}

// every upgrade that unlocks something you can craft or place, so a test can craft what a claim talks about
export const WORLD_UP = (extra = {}) => ({ timber: 1, steel: 1, concrete: 1, rebar: 1, titan: 1, carbon: 1, plasma: 1, voidl: 1, neutron: 1, horizon: 1, markers: 1, struts: 1, jacks: 1, lantern: 1, bulkhead: 1, dynamite: 1, charges: 3, cart: 5, firstaid: 1, power: 1, belts: 1, sorter: 1, vault: 1, fans: 1, detector: 1, mech: 1, claw: 1, borer: 1, depots: 1, crew: 1, ...extra });

// the open bay with nothing in it (plush from earlier tests would otherwise make a floor or a wall where a test wants none). Always clears: no once-per-world flag.
export function clearBay(ctx, x0 = -14, x1 = 11, z0 = -10, z1 = 11, rows = 13) {
  const w = ctx.w(), { toI, toK } = ctx;
  for (let i = toI(x0); i <= toI(x1); i++) for (let k = toK(z0); k <= toK(z1); k++) for (let j = 0; j < rows; j++) if (w.get(i, j, k)) w.removeCell(i, j, k, false);
}
