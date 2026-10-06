# Rot Factory

A needle-in-a-haystack game in a liminal warehouse packed with millions of brainrot plush.
Find Il Rotto Supremo (576 species and four convincing fakes stand in the way) or dig your way to the EXIT, 3 km east.

```bash
npm install
npm run dev      # http://localhost:5273
npm run build
node tools/pace-sim.mjs   # rough pacing model (exit ~250 h, the plush ~500 h for a greedy player)
```

## Keys (laptop friendly, the mouse only looks)
- **G** tap to grab what you are looking at, tap with nothing in reach to drop. **F** flashlight, **Z** throw, **P** punch the plush in front of you to dig out of a hole (or hold **Space** when trapped). Walk near the SORT bin and it sucks your plush in.
- **E** use (desk = upgrades, bench = crafting, kiosk = dossier, depots, machines).
- **B** set down the build item you hold (green outline shows where). Hold **B** to lay belts/bulkheads. **1-9**, **[ ]** or the wheel pick an item, **Q** stow, **R** flips ramps, **X** takes something down (you get the item back).
- **Tab** upgrades, **V** crew, **N** plushdex, **L** journal, **J** goals, **T/Y** send crew digging / home, **Esc** pause, **F3** fps, hold **H** to recall.

## Play with a friend
Open **Play Together** (title screen or pause menu). One of you hosts and sends a code, the other pastes it and sends a reply code back. No server. The host's game runs everything; the guest sees and controls the same warehouse. Shared: the world, collapses and falling plush, money, upgrades, gear, crafted items, belts, sorters, mechs, generators, crew bots, the cart, contracts, time of day. Personal: your hands, stats and achievements. A guest does not overwrite their own save. Press **Enter** to chat. Works best in Chrome, and both of you need the same version of the file.

To send the game itself: `npm run build` makes `dist/index.html`, a single file that opens by double-click.

## Systems
- Lazy chunked 6 km hall (`world.js`), 576 species, old workings with remains and notes (`remains.js`).
- Roof support/collapse rules, slope slides, aftershocks, dust and lungs (`dust.js`).
- Crafting table, belts, sorters, vaults, mechs, generators/poles/fans (`crafting.js`, `logistics.js`, `power.js`), depots with clues.
- Contracts, crew bots that grow (`crew.js`), grid surges, volatile Razzo plush.
- Adaptive resolution keeps the frame rate near 60.

## Notes
- **Detector gates**: build one early and attach it to a belt. Everything passing through is scanned: green beep normally, red alarm and a held item when the rare plush is on board. Crew bots check in at the nearest gate before unloading.
- **Physics**: loose plush use fixed-step contact physics with friction, spin and air drag, so piles hold shallow slopes and slide on steep ones.
- **F** toggles your helmet flashlight.
- **Trapped?** A pulsing 60 second air countdown starts. **P** punches ahead, hold **Space** to punch straight up. Run out and you pass out at a depot. The Emergency Air Tank upgrade adds 30 s per level.
- Creaking roofs now shed plush, and cave-ins bring down the pile above.
- **Dynamite**: cheap early upgrade. Craft at the bench, aim and press B. 4 second fuse, small blast (bigger than nothing, smaller than a Charge).
- **Joining**: host gets a 4 digit code, the friend types it under Join a friend (uses the free PeerJS broker to meet, then a direct connection). Long copy/paste codes remain under the details drop-down as a fallback. If the two builds differ, both players get a warning to hard refresh (Ctrl/Cmd+Shift+R).
