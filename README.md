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
- **G** tap to grab what you are looking at, tap with nothing in reach to drop. **F** throw. Walk near the SORT bin and it sucks your plush in.
- **E** use (desk = upgrades, bench = crafting, kiosk = dossier, depots, machines).
- **B** set down the build item you hold (green outline shows where). Hold **B** to lay belts/bulkheads. **1-9**, **[ ]** or the wheel pick an item, **Q** stow, **R** flips ramps, **X** takes something down (you get the item back).
- **Tab** upgrades, **V** crew, **N** plushdex, **L** journal, **J** goals, **T/Y** send crew digging / home, **Esc** pause, **F3** fps, hold **H** to recall.

## Systems
- Lazy chunked 6 km hall (`world.js`), 576 species, old workings with remains and notes (`remains.js`).
- Roof support/collapse rules, slope slides, aftershocks, dust and lungs (`dust.js`).
- Crafting table, belts, sorters, vaults, mechs, generators/poles/fans (`crafting.js`, `logistics.js`, `power.js`), depots with clues.
- Contracts, crew bots that grow (`crew.js`), grid surges, volatile Razzo plush.
- Adaptive resolution keeps the frame rate near 60.
