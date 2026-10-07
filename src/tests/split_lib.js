// Shared helpers for the split_*.js audit (wave 2B: mergers, priority mergers, smart and programmable splitters). No default export: the loader skips it.
// makeSplitKit(ctx) builds on the belt kit: a merger rig (three lines into one), a splitter rig (one line into three vaults), a metered run, and cleanup.
import { makeBeltKit, UP_ALL, UP_BASE } from './belts_lib.js';
import { pools, NEEDLE } from '../plushdata.js';
import * as SP from '../splitparts.js';

export const UP_NEW = { beltMerge: 1, prioMerge: 1, smartSplit: 1, progSplit: 1, optics: 3 };
export const UP = { ...UP_ALL, ...UP_NEW };
export const UPB = { ...UP_BASE, ...UP_NEW };   // belts at exactly 1.6 tiles per second times their mark
export const RAR = (r, n = 0) => pools[r][n];   // a species of rarity r
export { NEEDLE };

export function makeSplitKit(ctx) {
  const B = makeBeltKit(ctx);
  const { g, S, L, toI, toK } = ctx;
  const { lay, DX, DZ, vaultAt } = B;
  const setup = (up = UP) => { B.setup(up); g.cfgClip = null; };

  // a part at a cell, made the way the bench item makes it (fields from splitparts.js), optionally with a belt mark and extra fields
  const part = (id, i, k, dir = 0, tier = 0, j = 0, over = {}) => {
    const f = SP.fieldsOf(id, { i, j, k, dir }, null); if (tier) f.tier = tier; Object.assign(f, over);
    const t = g.placeEntity('belt', f, { quiet: true, rebuild: false }); L().dirty = true; return t;
  };

  // one step of the world: every belt powered (a test may overwrite `pw` in `hook`), then the hook, then the logistics update
  const step = (dt, hook) => { B.power(); if (hook) hook(); g.time += dt; L().update(dt); };
  const run = (secs, hook, dt = 1 / 60) => { const n = Math.round(secs / dt); for (let q = 0; q < n; q++) step(dt, hook); };
  // push plush into the first tile of a line for as long as it takes them (the densest feed a line can take)
  const feedAll = (tile, sp, vr = 0) => { let n = 0; while (L().accept(tile, { sp, vr }, null)) n++; return n; };

  // three lines into a merger facing east at (i0 + 4, k0): back, left (they travel +z) and right (they travel -z); a belt out and a vault at the end
  const rig3 = (id = 'merger', tier = 0, over = {}) => {
    const i = B.i0(), k = B.k0(), r = {};
    r.back = lay(tier, 4, i, k, 0); r.left = lay(tier, 3, i + 4, k - 3, 1); r.right = lay(tier, 3, i + 4, k + 3, 3);
    r.m = part(id, i + 4, k, 0, tier, 0, over);
    r.out = lay(tier, 4, i + 5, k, 0); r.vault = vaultAt(i + 9, k); r.lanes = [r.back[0], r.left[0], r.right[0]];
    L().dirty = true; return r;
  };
  // one line into a splitter facing east at (i0 + 3, k0) with a vault at each output: forward, right (+z) and left (-z)
  const rigS = (id = 'ssplit', tier = 0, over = {}) => {
    const i = B.i0(), k = B.k0(), r = {};
    r.feed = lay(tier, 3, i, k, 0); r.s = part(id, i + 3, k, 0, tier, 0, over);
    r.v = [vaultAt(i + 4, k), vaultAt(i + 3, k + 1), vaultAt(i + 3, k - 1)];
    L().dirty = true; return r;
  };
  // the plush a vault holds, as a count per species
  const tally = (v) => { const o = {}; for (const s of v.stored) o[s.sp] = (o[s.sp] || 0) + 1; return o; };
  const total = (v) => v.stored.length;
  // feed a queue of { sp, vr } into a tile, one as soon as it takes it, and run until the queue is empty and the plush have settled
  const pump = (tile, queue, secs = 30, settle = 3) => {
    const q = queue.slice(); let idle = 0, t = 0;
    while (t < secs && idle < settle) { step(1 / 60, () => { while (q.length && L().accept(tile, q[0], null)) q.shift(); }); t += 1 / 60; idle = q.length ? 0 : idle + 1 / 60; }
    return { left: q.length };
  };
  // everything on the tiles of a rig (plush riding belts and parts)
  const onTiles = () => ctx.tiles().filter((t) => t.type === 'belt').reduce((n, t) => n + t.items.length, 0);

  const cleanup = () => { B.cleanup(); g.cfgClip = null; };
  const T = (name, fn) => B.T(name, async () => { try { return await fn(); } finally { cleanup(); } });
  return { ...B, T, setup, part, step, run, feedAll, rig3, rigS, tally, total, pump, onTiles, S, DX, DZ, toI, toK };
}
