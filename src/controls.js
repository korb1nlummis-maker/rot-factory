// Every control in the game, in one place. The pause menu's Controls tab and the How to Play screen are both drawn from this table,
// and a test checks it against the real key handlers, so the list cannot drift from what the keys actually do.
// keys: what is drawn on the key caps. codes: the KeyboardEvent codes the game handles for it ('Mouse0', 'Mouse2', 'Wheel' for the mouse).
export const CONTROLS = [
  { group: 'Moving', rows: [
    { keys: ['W', 'A', 'S', 'D'], codes: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], what: 'Walk. Click the game once to capture the mouse, then the mouse looks around.' },
    { keys: ['Shift'], codes: ['ShiftLeft'], what: 'Sprint (hold).' },
    { keys: ['Space'], codes: ['Space'], what: 'Jump. When you are trapped under plush, hold it to punch upward.' },
    { keys: ['C'], codes: ['KeyC', 'ControlLeft'], what: 'Crouch (Ctrl works too) to fit low tunnels.' },
  ] },
  { group: 'Hands', rows: [
    { keys: ['Left click'], codes: ['Mouse0'], what: 'Grab the plush you look at. Hold to keep grabbing until your hands or cart are full. Click while holding plush to throw one.' },
    { keys: ['Z'], codes: ['KeyZ'], what: 'Throw one plush from your hands.' },
    { keys: ['Right click', 'R', 'P'], codes: ['Mouse2', 'KeyR', 'KeyP'], what: 'Punch: knock loose the plush in front of you, or punch yourself out of a hole. (R flips a ramp instead while you hold one.)' },
    { keys: ['E'], codes: ['KeyE'], what: 'Use what you aim at: terminal, crafting bench, generators, sorters, vaults, depots. Aim at a bot to select it, then E on a target to command it.' },
    { keys: ['F'], codes: ['KeyF', 'KeyO'], what: 'Flashlight on or off (O works too).' },
    { keys: ['K'], codes: ['KeyK'], what: 'Use a medkit.' },
    { keys: ['U'], codes: ['KeyU'], what: 'Roll your cart out, or stow it.' },
    { keys: ['H'], codes: ['KeyH'], what: 'Hold for 2.5 seconds: emergency recall to the nearest depot.' },
  ] },
  { group: 'Tools and building', rows: [
    { keys: ['1', '2', '...', '9'], codes: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'], what: 'Take out the tool in that hotbar slot. Press the same number again to put it away. An empty slot is bare hands.' },
    { keys: ['[', ']', 'Wheel'], codes: ['BracketLeft', 'BracketRight', 'Wheel'], what: 'Step through your hotbar tools.' },
    { keys: ['Q'], codes: ['KeyQ'], what: 'Put your tool away / take it out again.' },
    { keys: ['B'], codes: ['KeyB'], what: 'Set down the building item in your hand. Hold B to lay a line of belts.' },
    { keys: ['Left', 'Right'], codes: ['ArrowLeft', 'ArrowRight'], what: 'With a frame in hand: turn it freely so a tunnel can curve (hold Shift for fine turns). With anything else they step through the hotbar.' },
    { keys: ['Down'], codes: ['ArrowDown'], what: 'With a frame in hand: back to the grid, snapping to other frames again.' },
    { keys: ['X'], codes: ['KeyX'], what: 'Knock down what you aim at and get it back (the hammer in slot 1 does the same with a click).' },
    { keys: ['I'], codes: ['KeyI'], what: 'Inventory. In it: arrows move, 1-9 put the selected item on that hotbar slot, X clears a slot.' },
  ] },
  { group: 'Crew', rows: [
    { keys: ['V'], codes: ['KeyV'], what: 'The crew panel: every bot, its battery and what it is doing.' },
    { keys: ['T'], codes: ['KeyT'], what: 'Send the whole crew digging the way you face.' },
    { keys: ['Y'], codes: ['KeyY'], what: 'Call the whole crew home to unload.' },
    { keys: ['Esc'], codes: ['Escape'], what: 'With a bot selected: let it go (otherwise Esc opens this menu).' },
  ] },
  { group: 'Screens', rows: [
    { keys: ['Tab'], codes: ['Tab'], what: 'Upgrade terminal (works anywhere).' },
    { keys: ['N'], codes: ['KeyN'], what: 'Plushdex: every species you have found.' },
    { keys: ['L'], codes: ['KeyL'], what: 'Field journal.' },
    { keys: ['J'], codes: ['KeyJ'], what: 'Achievements.' },
    { keys: ['Esc'], codes: ['Escape'], what: 'Pause menu.' },
    { keys: ['Enter'], codes: ['Enter'], what: 'Chat (only while you are playing together).' },
    { keys: ['F3'], codes: ['F3'], what: 'Show or hide the frame rate.' },
  ] },
];
export const CONTROL_CODES = new Set(CONTROLS.flatMap((g) => g.rows.flatMap((r) => r.codes)));
