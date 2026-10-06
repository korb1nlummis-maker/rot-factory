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
    { keys: ['Right click', 'R', 'P'], codes: ['Mouse2', 'KeyR', 'KeyP'], what: 'Punch: knock loose the plush in front of you, or punch yourself out of a hole. (R flips a ramp or a lift up and down, or turns a floor pad, catwalk, wall or stair, instead while you hold one, and picks the route shape while the Line Planner is on.)' },
    { keys: ['E'], codes: ['KeyE'], what: 'Use what you aim at: terminal, crafting bench, generators, power switches and breakers, sorters, vaults, depots. On an earth mover it empties the hopper into your hands, or parks it and sends it back to work. Aim at a bot to select it, then E on a target to command it. Lockers, crates, silos, depots, signs and lamps open their own panel. On a detector arch it opens the target panel.' },
    { keys: ['Shift', 'E'], codes: ['KeyE'], what: 'Copy the settings of the machine you aim at (Sorting Boxes now, more kinds as they arrive). Then E on another of the same kind pastes them. Shift+E at nothing drops the copy.' },
    { keys: ['F'], codes: ['KeyF', 'KeyO'], what: 'Flashlight on or off (O works too).' },
    { keys: ['K'], codes: ['KeyK'], what: 'Use a medkit.' },
    { keys: ['U'], codes: ['KeyU'], what: 'Roll your cart out, or stow it.' },
    { keys: ['H'], codes: ['KeyH'], what: 'Hold for 2.5 seconds: emergency recall to the nearest depot.' },
  ] },
  { group: 'Tools and building', rows: [
    { keys: ['1', '2', '...', '9'], codes: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'], what: 'Take out the tool in that hotbar slot. Press the same number again to put it away. An empty slot is bare hands.' },
    { keys: ['[', ']', 'Wheel'], codes: ['BracketLeft', 'BracketRight', 'Wheel'], what: 'Step through your hotbar tools.' },
    { keys: ['Q'], codes: ['KeyQ'], what: 'Put your tool away / take it out again. With a Power Cable wire in your hand it drops the wire instead.' },
    { keys: ['Left click'], codes: ['Mouse0'], what: 'With a Power Cable out: click a generator, pole or machine to start a wire that follows your crosshair, click a second one to attach it (up to 25 m, more with Grid Range). Click empty air to cancel, click the same pair again to remove the cable.' },
    { keys: ['B'], codes: ['KeyB'], what: 'Set down the building item in your hand. Hold B to lay a line of belts, or set a higher mark belt over an old one to upgrade it. With a floor pad: hold B (or left click), drag along a line and let go to lay up to 10 pads in one go (hold Shift to drag a block up to 5 x 5).' },
    { keys: ['.'], codes: ['Period'], what: 'Belt in hand: Line Planner on or off. B sets the start, aim the end, B again lays the whole line (up to 64 tiles, bought at the bench price if you do not hold enough). Lift in hand: one cell taller.' },
    { keys: [','], codes: ['Comma'], what: 'Line Planner on: next route shape (R and the wheel do it too): horizontal first, vertical first, around and over, under. Lift in hand: one cell shorter.' },
    { keys: ['Left', 'Right'], codes: ['ArrowLeft', 'ArrowRight'], what: 'With a frame in hand: turn it freely so a tunnel can curve (hold Shift for fine turns). With anything else they step through the hotbar.' },
    { keys: ['Down'], codes: ['ArrowDown'], what: 'With a frame in hand: back to the grid, snapping to other frames again.' },
    { keys: ['X'], codes: ['KeyX'], what: 'Knock down what you aim at and get it back (the hammer in slot 1 does the same with a click). Shift+X takes down a whole zoop: every floor pad, catwalk or wall laid in the same go.' },
    { keys: ['-', '='], codes: ['Minus', 'Equal'], what: 'With a floor pad, catwalk or wall in hand: shorten or lengthen the zoop, up to 10 in a line (with Shift on a pad: the width, up to 5 x 5). With a Leveling Pad: its size, 1 to 3 pads on a side.' },
    { keys: ['Shift', 'R'], codes: ['KeyR'], what: 'With a floor pad, catwalk or wall in hand: nudge the spot one cell off the grid (it cycles 0 to 3). Hold Ctrl instead to lock a pad to the world grid.' },
    { keys: ['I'], codes: ['KeyI'], what: 'Inventory. In it: arrows move, 1-9 put the selected item on that hotbar slot, X clears a slot.' },
  ] },
  { group: 'Crew', rows: [
    { keys: ['V'], codes: ['KeyV'], what: 'The crew panel: every bot, its battery and what it is doing.' },
    { keys: ['T'], codes: ['KeyT'], what: 'Send the whole crew digging the way you face.' },
    { keys: ['Y'], codes: ['KeyY'], what: 'Call the whole crew home to unload.' },
    { keys: ['Esc'], codes: ['Escape'], what: 'With a bot selected: let it go (otherwise Esc opens this menu). It also cancels a power cable wire you are pulling.' },
  ] },
  { group: 'Screens', rows: [
    { keys: ['Tab'], codes: ['Tab'], what: 'Upgrade terminal (works anywhere).' },
    { keys: ['N'], codes: ['KeyN'], what: 'Plushdex: every species you have found.' },
    { keys: ['L'], codes: ['KeyL'], what: 'Field journal.' },
    { keys: ['J'], codes: ['KeyJ'], what: 'Achievements.' },
    { keys: ['Esc'], codes: ['Escape'], what: 'Pause menu.' },
    { keys: ['Enter'], codes: ['Enter'], what: 'Chat (only while you are playing together).' },
    { keys: ['F3'], codes: ['F3'], what: 'Show or hide the frame rate.' },
    { keys: ['M'], codes: ['KeyM'], what: 'Load meter: a small readout of supply, demand, storage and the last minute for the power grid you stand nearest to. Aim at a Load Meter, switch, breaker or battery for the same numbers.' },
  ] },
];
export const CONTROL_CODES = new Set(CONTROLS.flatMap((g) => g.rows.flatMap((r) => r.codes)));

// Keys no handler uses yet, held back for the Satisfactory waves so two agents never pick the same one. A wave moves its key into CONTROLS
// (with a row) and out of this table in the same change; a test checks that nothing here is handled by onKey and nothing is claimed twice.
export const RESERVED_KEYS = {
  F4: 'Wave 8: blueprint menu',
};
