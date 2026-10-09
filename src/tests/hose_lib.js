// Shared helpers for the hose_*.js tests (no default export, so the loader skips it). Everything a player does goes through the real placement path: the hose is crafted
// at the bench, taken out, the player stands and looks at a floor cell (aimDir), the game plans it (updateBuild) and B is pressed with a real KeyboardEvent. A test that
// only wants a finished line lays it that way too, so the mouth, the bends and the readouts are what a player sees.
import { makeBeltKit, UP_ALL } from './belts_lib.js';
import { makeIO, clearBay } from './truth_world_lib.js';
import { DX, DZ } from '../beltparts.js';

export const UP_HOSE = { ...UP_ALL, vac: 1 };

export function makeHoseKit(ctx) {
  const { g, S, p, adv, craft, cellX, cellZ, plan, tiles, L, toI, toK, V3 } = ctx;
  const B = makeBeltKit(ctx), K = B.K, io = makeIO(ctx);
  const o = { i: 0, k: 0 };
  // a fresh bay, a pocket of money, `n` hoses crafted at the bench and taken out; the origin cell is (i, k) in cells
  const setup = (n = 80, up = UP_HOSE) => { B.setup(up); clearBay(ctx, -30, 14, -10, 11); S().money = 1e12; delete S().items.hose; if (n) craft('hose', n); K.equip('hose'); g.beltRot = null; g._lastLaid = null; o.i = toI(-20); o.k = toK(6); };
  const at = (di, dk) => ({ i: o.i + di, k: o.k + dk });
  // aim at the floor cell (di, dk) from the origin, standing 2 m back along `d` (0 east, 1 +z, 2 west, 3 -z), and plan. Returns the plan.
  const aim = async (di, dk, d = 0, back = 2.0) => { K.aimDir(cellX(o.i + di), 0, cellZ(o.k + dk), d, back); return plan(); };
  // press B on that cell
  const put = async (di, dk, d = 0, back = 2.0) => { const pl = await aim(di, dk, d, back); io.tap('KeyB'); adv(0.05); return pl; };
  // hold B and sweep the aim over a list of [di, dk] cells, always facing d
  const hold = async (cells, d = 0, back = 2.0, ms = 0.05) => {
    await aim(cells[0][0], cells[0][1], d, back); io.down('KeyB');
    for (const [di, dk, dd] of cells) { K.aimDir(cellX(o.i + di), 0, cellZ(o.k + dk), dd ?? d, back); adv(ms); }   // (a cell may carry its own facing: [di, dk, d])
    io.up('KeyB'); adv(0.05); g.lastPaint = '';
  };
  // the same by absolute cell (for aiming near the bin)
  const putAt = async (i, k, d = 0, back = 2.0) => { K.aimDir(cellX(i), 0, cellZ(k), d, back); const pl = await plan(); io.tap('KeyB'); adv(0.05); return pl; };
  const aimAt = async (i, k, d = 0, back = 2.0) => { K.aimDir(cellX(i), 0, cellZ(k), d, back); return plan(); };
  const tileAt = (di, dk) => L().tileAt(o.i + di, 0, o.k + dk);
  const rebuild = () => { L().rebuildBelts(); };
  const hoses = () => { rebuild(); return tiles().filter((t) => t.type === 'belt' && t.hose); };
  const mouths = () => hoses().filter((t) => !t.fed);
  // every hose tile reachable from `from` by following where each one hands over to: the length of the line
  const follow = (from) => { let n = 0, t = from; const seen = new Set(); while (t && t.type === 'belt' && !seen.has(t.id)) { seen.add(t.id); n++; t = L().nextOf(t); } return n; };
  const dirsOf = () => hoses().map((t) => t.dir);
  // plush lying on the floor at a world point (flag 0, like an avalanche)
  const spill = (x, z, sp) => { const sim = g.sim; const i = sim.spawn(sp, 0, x, 0.35, z, 0, 0, 0, 0); return i; };
  const bin = () => g.hall.binPos;
  return { B, K, io, o, setup, at, aim, put, putAt, aimAt, hold, tileAt, hoses, mouths, follow, dirsOf, spill, bin, rebuild, DX, DZ, V3, p };
}
