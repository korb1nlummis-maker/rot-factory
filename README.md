# Rot Factory

A needle-in-a-haystack game set in a liminal warehouse packed with millions of brainrot squishies.
Find the one rare plush (Il Rotto Supremo) or dig your way out the EXIT door in the east wall.

```bash
npm install
npm run dev      # http://localhost:5273
npm run build
```

## Controls
WASD move, Shift sprint, Space jump, C crouch, hold LMB grab, RMB / F throw, E use (terminal, bin sell),
Tab upgrade terminal, G plushdex, J achievements, 1-9 or wheel tools, X deconstruct, hold U emergency recall.

## How it works
- The hall is a 240x240x72 lattice (0.6 m cells), about 2.5M plush, generated from a seed. Only changes are saved.
- Digging removes lattice cells. `World.stress` decides which roof cells lack support:
  a cell over a void is stable if a supported cell is within `B` cells laterally, where
  `B = 1 + upgrades + nearby frames - overburden/24`. Unstable cells creak, then drop as loose bodies (`sim.js`)
  and re-freeze into the lattice when they settle.
- Rendering draws a two-cell shell around open air, instanced per plush archetype, with a custom fabric shader.
- Upgrades (`upgrades.js`), achievements (`achievements.js`), Claw Rigs and Tunnel Borers (`machines.js`).
