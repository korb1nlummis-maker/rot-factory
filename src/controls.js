// Every control in the game, drawn from the keybind table (keybinds.js). The pause menu's Controls tab and the How to Play screen both show CONTROLS,
// and tests compare it with the table and with what the keys really do, so the list cannot drift from the handlers.
// A row: group, ids (the action ids it covers, hotbar slots share one row), keys (the key caps), codes (KeyboardEvent codes; 'Mouse0', 'Mouse2',
// 'Wheel' for the mouse), what (the words, with the keys the player has chosen in them), chips ([{ id, combo, label }] one per key, clickable
// in the Controls tab to rebind).
import * as KB from './keybinds.js';

// The long words for each action. {id} is replaced by the current key of that action, so a rebound key is named correctly everywhere.
const HELP = {
  fwd: 'Walk. Click the game once to capture the mouse, then the mouse looks around. On a ladder {fwd} (or {jump}) climbs and {back} goes down; keep pressing {fwd} at the top to step onto the plate.',
  left: 'Walk left (strafe).',
  back: 'Walk back. On a ladder it goes down.',
  right: 'Walk right (strafe).',
  sprint: 'Sprint (hold). Shift is also the modifier of Shift+key actions; a plain key still works while you sprint, and where Shift+key is an action of its own (copy settings, copy bin, nudge) that one is chosen.',
  jump: 'Jump. When you are trapped under plush, hold it to punch upward. On a ladder it climbs.',
  crouch: 'Crouch (hold) to fit low tunnels. Ctrl is not used, because Ctrl+W closes the browser tab.',
  look: 'Mouse movement. Click the game once to capture the mouse, then the mouse looks around.',
  grab: 'Grab the plush you look at. Hold to keep grabbing until your hands or cart are full. Click while holding plush to throw one. With a belt or a Vacuum Hose out, a click is the laying mode instead: the first click anchors a route (at the open end of a line if you aim at one), the preview shows the whole curved route to where you aim with its length and cost and turns gold when its end feeds a bin, and the next click lays all of it and carries on from its end. {punch} or {stow} puts the route down. With the hammer or a building item out, the click uses it.',
  throw: 'Throw one plush from your hands or your cart.',
  punch: 'Punch: knock loose the plush in front of you, or punch yourself out of a hole. ({rotate} flips a ramp or a lift up and down, or turns a floor pad (the opening of a plate in a cube too), catwalk, wall, door or stair, or the heading of a jump pad, instead while you hold one, and picks the route shape while the Line Planner or a route is on. With a belt or hose in hand and no route, {rotate} turns the next piece a quarter turn; the mouse turns it back. Right click puts a route you are aiming down before it punches.)',
  use: 'Use what you aim at: terminal, crafting bench, generators (any size: hand it plush to burn, or press {use} with empty hands to switch AUTO and RESERVE), power switches and breakers, hanging lanterns (on or off), sorters, vaults, depots, Smart and Programmable Splitters (their rules) and Priority Mergers (their lane order). On a Support Borer it loads the supports from your bag (up to 12), or starts and stops it when there is nothing to load; crouch plus {use} empties it into your bag, or when it is empty steps its mode (supports at need, every 2, 3 or 4 cubes, Dig only). On an earth mover it empties the hopper into your hands, or parks it and sends it back to work. Aim at a bot to select it, then {use} on a target to command it. Lockers, crates, silos, depots, signs and lamps open their own panel. On a detector arch it opens the target panel. On a Vehicle Scanner that holds The One it takes it out (the alarm stops, the trucks roll again). On a Portal (a giant arch at the mouth of the pile) it parks or starts the auto-driver; on a Haul Truck that ran out of battery it spends a Charge Pack. A door opens or closes (with no power it turns a slow hand crank), the call panel at a landing calls the elevator, and in its cab it goes where you look: up, down or level for the next stop (with no power it turns by hand, slowly, and it never runs through a cut or unshored shaft). On a placed Jump Pad it makes the angle 5 degrees steeper ({crouch} + {use} turns the heading). On the remains of a worker or a supply cache it opens them and the notes go in your Field Journal ({journal}); bots and machines stop short of them and flag them (only a Bot Scholar carries the note of a worker home; caches always need you). On a care package crate dropped by the courier drone it opens the crate (walking into it does too); the compass marks it CARE, or GOLD for a gold one. On a Rail Cart or its Station the Rail cart keys do the cart part.',
  copycfg: 'Copy the settings of the machine you aim at (Sorting Boxes, Smart and Programmable Splitters and Priority Mergers now, more kinds as they arrive). Then {use} on another of the same kind pastes them. {copycfg} at nothing drops the copy. Doors (lock and sensor) and Jump Pads (angle and heading) copy too.',
  bin: 'Bins: aim at a machine (truck, digger, borer, claw rig, mech, Portal, Rail Station or Cart), the last piece of a belt line, a bot or your cart, or have a bot selected, and press {bin} to pick the bin it sells at: Auto (what it always did), the SORT bin or a Depot Beacon. In the panel {bin} steps to the next bin, Rename names a beacon, and every bin shows its distance and what it sold today. With nothing aimed it lists every bin. A selected bot also takes {use} on a Depot Beacon. The same key sets a building item down: with a belt, hose, pad, frame, machine or the hammer in hand it places (see Set down the building item); with bare hands, a cable, a cart or a supply item in hand it assigns the bin.',
  copybin: 'Copy the bin of what you aim at (or of the selected bot). {use} on another machine, belt end, cart or bot pastes it, whatever kind it is. {copybin} at nothing drops the copy. {copycfg} copies all of a machine\'s settings, its bin included, for the same kind.',
  flash: 'Flashlight on or off.',
  medkit: 'Use a medkit. It heals 50.',
  cart: 'Roll your cart out, park it, or call it back to follow you. ({dismantle} next to it stows it when it is empty.)',
  recall: 'Hold for 2.5 seconds: emergency recall to the nearest depot.',
  give: 'Playing together: hand one of the item in your hand to your friend (Shift+{give} hands ten). They must stand within 3 m; it comes out of your own bag and goes into theirs.',
  hb: 'Take out the tool in that hotbar slot. Press the same number again to put it away. An empty slot is bare hands.',
  hbprev: 'Step back through your hotbar tools. {hbprev} is shared with the vacuum dial: while the Plush Vacuum is owned and your hands are bare it sets the dial instead (see Vacuum pulls gentler); with any tool out it steps the hotbar. The wheel and the number keys always step the hotbar.',
  hbnext: 'Step forward through your hotbar tools. {hbnext} is shared with the vacuum dial: while the Plush Vacuum is owned and your hands are bare it sets the dial instead (see Vacuum pulls harder); with any tool out it steps the hotbar. The wheel and the number keys always step the hotbar.',
  hbwheel: 'Step through your hotbar tools. With a planned line started the wheel picks the route shape.',
  stow: 'Put your tool away / take it out again. With a Power Cable wire in your hand it drops the wire instead, and with a belt or hose route anchored it puts the route down first.',
  cable: 'With a Power Cable out: click a generator, pole or machine to start a wire that follows your crosshair, click a second one to attach it (up to 14 m, more with Grid Range). The end under your crosshair glows gold or green, red when it is too far or full. Click empty air to cancel, click the same pair again to remove the cable. Power travels only through cables: wire a generator to a pole, then every machine to a pole or generator. Hanging lanterns may chain: pole to the first lantern, then that lantern to the next.',
  align: 'While placing floor pads or plates: hold it to align to the world grid instead of snapping to the nearest piece. Do not hold it while pressing W: Ctrl+W closes the browser tab.',
  place: 'Set down the building item in your hand. Hold to lay a line of belts, Vacuum Hose pieces or haul road plates (sweep the mouse and the cells in between are laid too, so a curve stays one connected line; a hose is one hose with a single flared mouth at its open start, and one press up to 3 cells past the last hose piece lays the cells between too, as the aim shows), or set a higher mark belt over an old one to upgrade it. With a floor pad: hold it (or left click), drag along a line and let go to lay up to 10 pads in one go (hold Shift to drag a block up to 5 x 5). Aimed into a frame cube with Stacked Building, a floor pad is a floor or ceiling plate, two stairs (or two ramps) are a switchback stair, a ladder hangs on the rim of an opening and a wall is a door frame (hold {align} for the plain piece instead). The same key assigns a bin when you hold nothing to set down (bare hands, a cable, a cart or a supply item): see Assign a bin.',
  planner: 'Belt or hose in hand: Line Planner on or off. {place} sets the start, aim the end, {place} again lays the whole line (up to 64 tiles, bought at the bench price if you do not hold enough). Lift in hand: one cell taller.',
  shape: 'Line Planner on: next route shape ({rotate} does it too, and the wheel once the start is set): horizontal first, vertical first, around and over, under. Lift in hand: one cell shorter.',
  rotate: 'Flip a ramp or a lift up and down, turn a floor pad (the opening of a plate in a cube too), catwalk, wall, door or stair, or the heading of a jump pad, while you hold one; pick the route shape while the Line Planner or a route is on. With a belt or hose in hand and no route, it turns the next piece a quarter turn; the mouse turns it back. With nothing to turn it punches.',
  nudge: 'With a floor pad, catwalk or wall in hand: nudge the spot one cell off the grid (it cycles 0 to 3). Hold {align} instead to lock a pad to the world grid.',
  frameL: 'With a frame in hand: turn it freely so a tunnel can curve (hold Shift for fine turns).',
  frameR: 'With a frame in hand: turn it freely the other way (hold Shift for fine turns).',
  frameGrid: 'With a frame in hand: back to the grid, snapping to other frames again.',
  dismantle: 'Knock down what you aim at and get it back (the hammer in slot 1 does the same with a click). Shift+{dismantle} takes down a whole zoop: every floor pad, catwalk or wall laid in the same go.',
  scoopLess: 'With Scoop Hands and nothing to build in hand: scoop 3 fewer plush per grab, from 0 (just the one plush you aim at) up to the most your hands allow, starting at 3 (the SCOOP dial shows it and has its own minus and plus buttons you can click or tap, also with a pad in hand; turn it down to dig a tunnel without bringing the roof down). With a floor pad, catwalk or wall in hand: shorten the zoop, up to 10 in a line (with Shift on a pad: the width, up to 5 x 5). With a floor pad aimed into a frame cube (Stacked Building): pick the opening of the plate, full, landing or shaft. With a Leveling Pad: its size, 1 to 3 pads on a side. With a Jump Pad: its launch angle, 0 to 90 degrees in 5 degree steps.',
  scoopMore: 'With Scoop Hands and nothing to build in hand: scoop 3 more plush per grab (see the key that scoops fewer). With a floor pad, catwalk or wall in hand: lengthen the zoop. With a Leveling Pad: a bigger pad. With a Jump Pad: a steeper launch angle.',
  vacLess: 'With the Plush Vacuum and bare hands: pull gentler, 10 percent of its full suction at a time (the VACUUM dial shows plush a second out of the most you own, and has its own minus and plus buttons, also with a pad in hand). It starts at 30 percent, never under 1 plush a second, and a lower setting also narrows the cone and takes only the layer you point at (it goes deeper as you keep pointing), so a tunnel roof is not pulled down. At 0 the vacuum is off and a click is a plain grab. Each player keeps their own setting. Before the vacuum is owned, or with a tool out, this key steps the hotbar back instead.',
  vacMore: 'With the Plush Vacuum and bare hands: pull harder, 10 percent of its full suction at a time (see the key that pulls gentler). Before the vacuum is owned, or with a tool out, this key steps the hotbar forward instead.',
  railHome: 'Mine Rail: in a cart, rush home (or back to the face when you are already at the base). On foot beside a cart, climb in and go; on foot anywhere near the track, call the nearest cart. A cart on a powered line runs 8 m/s, an unpowered one 2 m/s.',
  railUse: 'On a Rail Cart: loads the plush in your hands into it, or sits you in it when your hands are empty. In the cart, it hops you off. On a Rail Station {use} switches it between BASE and FACE.',
  inv: 'Inventory. In it: arrows move, 1-9 put the selected item on that hotbar slot, {dismantle} clears a slot. Playing together, the pack is yours alone: Shift+click an item hands one to your friend.',
  crew: 'The crew panel: every bot, its battery and what it is doing. It also has the Keep machines fueled switch for the whole crew and a Fuel duty switch on each bot: bots top up generators and Charging Stations, and dig fuel for one that runs low.',
  crewDig: 'Send the whole crew digging the way you face.',
  crewHome: 'Call the whole crew home to unload.',
  botRelease: 'With a bot selected: let it go. It also cancels a power cable wire you are pulling. Otherwise Esc opens the pause menu. (Esc is always the browser\'s way out of the mouse capture, so it keeps these jobs.)',
  terminal: 'Upgrade terminal (works anywhere).',
  dex: 'Plushdex: every species you have found.',
  journal: 'Field journal: your finds, and the Notes tab (every note read, with the clues about The One pieced together).',
  ach: 'Achievements.',
  pause: 'Pause menu. It also closes the window you are in.',
  chat: 'Chat (only while you are playing together, and not while you are typing in a box). {chat} opens the box, Enter sends the line, Esc closes it. A {chat} typed inside the box is just the character.',
  fps: 'Show or hide the frame rate.',
  meter: 'Load meter: a small readout of supply, demand, storage and the last minute for the power grid you stand nearest to. Aim at a Load Meter, switch, breaker or battery for the same numbers.',
};

const HB = ['hb1', 'hb2', 'hb3', 'hb4', 'hb5', 'hb6', 'hb7', 'hb8', 'hb9'];
export const helpOf = (id) => KB.fill(HELP[id] || KB.ACTION_BY_ID[id].desc);

function rowFor(ids) {
  const first = KB.ACTION_BY_ID[ids[0]], chips = [], caps = [], codes = [];
  for (const id of ids) {
    const list = KB.binds(id);
    if (first.flag === 'locked') { const c = first.def[0]; chips.push({ id, combo: c, label: KB.label(c), locked: true }); caps.push(...KB.caps(c)); codes.push(KB.baseCode(c)); continue; }
    for (const c of list) { chips.push({ id, combo: c, label: KB.label(c) }); caps.push(...KB.caps(c)); codes.push(KB.baseCode(c)); }
    if (!list.length) chips.push({ id, combo: '', label: 'unbound', none: true });
  }
  let keys = caps;
  if (ids === HB) keys = ['1', '2', '...', '9'].filter(() => true);
  const what = ids === HB ? KB.fill(HELP.hb) : helpOf(ids[0]);
  return { group: first.group, ids: ids.slice(), keys, codes: [...new Set(codes)], what, chips, ctx: first.ctx, name: ids === HB ? 'Hotbar slots 1 to 9' : first.name, flag: first.flag };
}
export function buildControls() {
  const out = [];
  for (const g of KB.GROUPS) {
    const rows = []; let hbDone = false;
    for (const a of KB.ACTIONS) {
      if (a.group !== g) continue;
      if (HB.includes(a.id)) { if (!hbDone) { hbDone = true; rows.push(rowFor(HB)); } continue; }
      rows.push(rowFor([a.id]));
    }
    out.push({ group: g, rows });
  }
  return out;
}
export const CONTROLS = buildControls();
export const CONTROL_CODES = new Set();
const refresh = () => {
  const fresh = buildControls(); CONTROLS.length = 0; CONTROLS.push(...fresh);
  CONTROL_CODES.clear(); for (const gr of CONTROLS) for (const r of gr.rows) for (const c of r.codes) CONTROL_CODES.add(c);
};
refresh();
KB.onChange(refresh);

// Keys no handler uses yet, held back for the Satisfactory waves so two agents never pick the same one. A wave moves its key into the keybind table
// (with a row) and out of this table in the same change; a test checks that nothing here is handled by onKey and nothing is claimed twice.
export const RESERVED_KEYS = {
  F4: 'Wave 8: blueprint menu',
};
