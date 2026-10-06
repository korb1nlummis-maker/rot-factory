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
Open **Play Together** (title screen or pause menu). The host gets a 4 digit code, the friend types it in. No account needed. The host's game runs everything; the guest sees and controls the same warehouse. Shared: the world, collapses and falling plush, money, upgrades, gear, crafted items, belts, sorters, mechs, generators, crew bots, the cart, contracts, time of day. Personal: your hands, stats and achievements. A guest does not overwrite their own save. Press **Enter** to chat. Works best in Chrome, and both of you need the same version of the file.

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
- **Health and death**: a health bar (bottom left) and an air bar that appears when you are buried. Falling plush, long falls and close blasts hurt. Run out of air and you suffocate. Dying is not the end: you wake up on the sorting bay floor and what you carried spills where it happened.
- **Avalanches are real**: cave-in debris can land on you and bury you. Punch out (R, right click, P, or hold Space).
- **Controls**: F, G or left click grab. R or right click punch. O flashlight. Throwing Arm now has six levels.
- **Building materials**: frames are made from Lumber, then Steel, Concrete, Rebar and so on. Buy stock at the bench (cheaper in bulk), or find it in caches and old workings. Short on stock, the shortfall is bought at full price.
- **Survival gear**: Reinforced Hard Hat (+25 max health per level), Impact Padding (-10% damage per level), First Aid Station (Medkits on K, Air Canisters that save you when trapped), plus seven new achievements and more notes in the old workings.
- **Slides**: the pile has an angle of repose. Digging, kicks, landing plush and climbing all trigger slides that feed themselves down a steep face. Climbing is a gamble: the higher you are and the more you carry, the harder you load the slope under you.
- **Detector gates** are now 2.3 m tall and 1.9 m wide so any robot fits. Crew bots always route through a gate on the way home. A bot carrying the rare plush is pulled into a side bay and held, and the whole belt line the gate sits on stops until you take the item.
- **Upgrades** (including the wearable ones like Carry Capacity) now work the moment you buy them.
- **Carts**: throw plush toward your cart and they stay in the tray until the cart is near the bin. A full cart is hauled to the bin by a free crew bot, through a detector gate, and it keeps hauling until the cart is empty.
- **Slides now settle**: each slide carries energy that fades as it spreads, so a slide spreads and then stops on its own.
- **Winner screen**: taking the One shows "YOU WIN. THE SEARCH IS OVER" a few seconds later.
- **Slides stop for good**: a topple can no longer re-seed itself, and a plush that cannot find a place to rest is nudged twice, then set into the nearest supported gap (or sold if it has been loose for 45 s). A 500-cell collapse test ran for 20 s of play, then everything was still.
- **Hold F or left click** to keep grabbing until your hands or cart are full.
- **New**: Bin Magnet (pull range), Slope Probe (UNSTABLE SLOPE warning), six achievements, eight radio lines.
- **Tunnels are calm until they are not**: digging a supported tunnel no longer causes slides or screen shake. Plush with a roof over them (tunnel walls and floors) are held by the pile and only the open surface slides, and tunnel roofs are governed by the stability system alone. In tests a 40-cell tunnel stayed still at 6 and 14 cells of overburden, collapsed at 30 with no support, and held at 30 with support.
- **Hydraulic Jacks**: a stronger prop than a strut (+2 roof strength, 2.7 m reach), made from Steel Beams.
- **Grab/throw**: with empty hands a tap of F or left click grabs, hold to keep grabbing until you are full. With plush in your hands a single tap throws one.
- **Bots and gates, tightened**: a bot never sells anything before it has been scanned at a gate in the bay area. This also covers a stuck bot that phases home, which used to skip the gate and sell the rare plush. Bots now stand in the gate for about a second while it scans, a flagged bot is held in the side bay, and when you take the item the bot finishes unloading. Gates count scans (achievements for plush and robots scanned).
- **Automation check**: generator, pole, belts, gate and vault were run end to end. 8 plush made it to the vault, then the One tripped the alarm, the whole line halted, and nothing was lost.
- **Free Welcome Gate**: every game starts with a free detector gate on the bay floor, about 14 m from the bin (outside its pull). Walk through it with your bag and cart and it scans them. It is bolted down, so it stays. Any gate you build also scans you when you walk through, and gates now refuse to be placed within a bin's pull (and sorters refuse to be placed near gates), so nothing gets sucked in before it is scanned. Deconstructing a gate now gives the gate back, not a belt.
- **Hold F or left click** to fill your hands to capacity (3, 10, whatever your bag allows), then the cart. It takes the plush nearest your aim when the crosshair drifts, and faster gloves speed it up.
- **New**: Glow Sticks (10 minute green light), and a shift report when the warehouse closes.
- **Test pass**: every system added recently was exercised (survival, grab/throw/cart, dynamite and charges, materials, slides, gates, bots, upgrades, save/load, multiplayer messages) plus a 60 second random-action soak with no errors. Bugs found and fixed: dynamite removed no cells, the hotbar ran off the screen with many items, the health bar overlapped it, and the Auto-Grip and Bulkhead texts still mentioned G.
- **Thrown plush get sucked into the bin**: a plush thrown toward the bin is pulled over the rim and in. In a clean world, throws aimed dead-on or lobbed went in 100% of the time, 2 m off about 97%, and 5 m off about 60%.
- **Upgrade audit**: every upgrade was checked against what it actually does. Fixed two duplicated upgrades (a second Hard Hat and a second Bin Magnet), and Auto-Grip now grabs two plush at a time.
- **Slide rules** (slide.js has them at the top): only the open surface slides; calm digging, grabbing and walking low need a cliff of 4+ cells (2.4 m) before anything moves, so you can dig a hole without it slumping and mini piles by machines just sit there; piles under 3 m never slide; props, frames, struts and jacks hold the plush near them; hard kicks, climbing high with a heavy load, blasts and cave-ins carry more energy and make slides that spread, then fade and stop. In tests, dug holes up to 8 cells deep and a 25 s mini-pile throw produced no slides; a blast or dynamite near the face made 6 to 21 topples that settled in about 5 s; climbing at 3 m and 8 m was safe, at 15 m and 25 m it started slides.
- **Straight grabbing**: holding the grab button takes plush from a thin tube around your aim line, nearest along it first, and Scoop Hands only takes plush further along the aim line (never from the sides or underneath). In a test every plush taken was within 5 cm of the aim line and eight grabs in a row on a steep face started no slides.
- **The tunnel rule** (top of world.js): a tunnel or room stands as long as no stretch runs further than a **safe length** from an anchor. Anchors are the open mouth of the cavity and any frame, prop, strut, jack or bulkhead (frames reach further the better they are). Safe length is 7.2 m near the surface, minus 0.6 m for every 14 cells of plush above the roof, minus more far from the bay, plus 1.2 m per level of Pile Tamping (never under 1.8 m). Past it the roof creaks, then comes down. Digging a hole or short tunnel from the open never starts a slide: digging, grabbing and walking low can no longer trigger surface slides at all (only blasts, cave-ins, hard kicks and climbing above 8 m do). In a test, a tunnel dug 2 wide and 3 high from the open floor into the slope stood for 17 cells, then collapsed; the same tunnel with a prop every 6 or 10 cells went 40 cells with no creaks.
- **Carts and craft context**: you run one cart. Crafting a better tier upgrades it (in place, keeping its load) and a worse one is refused with a message. The bench card says what you have ("In use", "Upgrade from your Wheelbarrow: +36 capacity"), and every craft card now has a "How to use" line (key, aim, what it does) plus a status line (rigs/mechs/borers placed, frame reach and best use). You get the same instructions as a hint right after crafting. The cart rides beside you, a little ahead, so you can throw plush into it, and tucks in behind only in tight tunnels.
- **Borer placement** is more forgiving (it looks a few cells along the wall instead of one exact cell).
- **Checked end to end**: frames, struts, jacks, lanterns, markers, flares, glow sticks, bulkheads, dynamite, charges, gens, poles, fans (dust), belts, gates, sorters with every filter, vaults, mechs (with belt layer and roof bolter), claw rigs, borers, depots (selling and fast travel list), contracts, crew upgrades and the sensors.
- **Inventory and hotbar (like Minecraft)**: press **I** to open your inventory: every tool, building item and supply you hold, plus your materials. The bar at the bottom of the screen has nine slots. Click an item and press 1-9 (or click a slot, or drag it) to put it on the hotbar, **X** takes it off. Crafting something puts it in the first free slot. In the world, **1-9** takes out the tool in that slot (the same number again, or **Q**, puts it away), the wheel and **[ ]** cycle slots. Hands are the default, so no ghost outline or build hints show until you take something out. Medkits and the cart can sit on the hotbar too (**B** uses them).
- **Hammer**: slot 1 from the start. Take it out, aim at a frame, prop, belt, machine, bulkhead or your cart and click (F) or press **B**: one piece per hit. You get the item back. Empty hotbar slots are your bare hands (F or click grabs); with a tool out, F or click uses the tool.
- **4x4 frames**: every frame is a 4x4 cell square (2.4 m) one cell deep. Placing one carves out its square (salvaging the plush) and anchors the roof. Aim next to a frame and the new one snaps on any side: in line, beside, above or below, so you can build tunnels, junctions and chambers.
- **Collapses are bounded**: a failing roof lets go at a limited rate and can only climb 2.4 m before the pile above arches, and rubble is only ever set down on something solid. A 36-cell unsupported tunnel peaked around 500 loose plush (it used to be 2,200) and was fully settled after about a minute.
- **Gaps fixed**: the renderer drew a two-cell shell but only re-scanned the next chunk when an edit touched the exact border cell, so edits near chunk borders could leave plush undrawn. Edits now re-scan neighbours across a two-cell border (a test that makes 500 random edits per run and compares every chunk to a fresh scan caught the old bug and passes now).
- **Signs and the chalkboard**: real-looking green EXIT signs with the running man and an arrow (hung on chains), DANGER / DO NOT CLIMB signs on posts around the bay, and a chalkboard easel by the start with the rules of the shift.
- **No more random noises**: the ambient creaks that played every 10 to 30 s inside the pile are gone (a creak now only means a roof is really failing), the plush squeak and bot chirps are rarer and only near you, and debris sounds need a real impact.
- **Self test**: on the dev server run `await __selftest()` (or `await __selftest('tools.')`) in the browser console. It builds what it needs and checks real behavior: survival, movement, hands, sorting, mining, 4x4 frame snapping, tunnels, slides, stress runs (a 150-section frame structure, a 200-cell lined tunnel, repeated collapses), render holes, machines and power, crew and gates, upgrades, crafting, saves, multiplayer messages, achievements and the UI.
- **Tools work like Minecraft**: an empty hotbar slot is your bare hands (F or click grabs and throws). With a tool out, F or click uses it (the hammer knocks down one piece per click, building items are set down); B does the same. There is no hold-to-repeat for the hammer or frames any more. Belts and bulkheads still lay a line while B is held.
- **The goal**: dig by hand first, then hire Scrapper Bots, run Mechs and Borers on belts through detector gates, and spend your own time building tunnels, frames and conveyors.
- **960 plush species** (was 576): 12 new shapes (Zucca, Castello, Moka, Nido, Sardina, Aragosta, Pappagallo, Cavallo, Mongolfiera, Gondola, Tostapane, Pomodoro) and 4 new colors with names (Carbonara, Gorgonzolo, Panettone, Amaretto), so you will meet things like "Gorgonzolo Aragosta" and "Amaretto Tostapane". The original 576 keep their ids, looks and rarities, so saves and dex progress are untouched. New dex achievements: 700, 850 and all 960.
