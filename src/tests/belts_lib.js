// Shared helpers for the belts_*.js audit (wave 1A: tiers, lifts, underground pairs, planner). No default export on purpose: the loader skips it.
import { makeKit } from './addons_lib.js';
import { pools, BULK } from '../plushdata.js';
import { DX, DZ } from '../beltparts.js';
import { lenOf } from '../beltdata.js';

// every upgrade the belt waves need (set directly, so the requirement chain is not walked)
export const UP_ALL = { timber: 1, belts: 1, power: 1, vault: 1, sorter: 1, mech: 1, splitter: 1, beltSpeed: 6, overdrive: 3, beltLift: 1, beltUg: 1, beltMk2: 1, beltMk3: 1, beltMk4: 1, beltMk5: 1, beltMk6: 1, jacks: 1, struts: 1 };
// the same without the speed upgrades, so a tile moves at exactly beltSpeed 1.6 x its mark
export const UP_BASE = { ...UP_ALL, beltSpeed: 0, overdrive: 0 };

export function makeBeltKit(ctx) {
  const { g, S, w, L, fresh, toI, toK, cellX, cellZ, tiles } = ctx;
  const K = makeKit(ctx);
  const sp = pools[0][0];
  // a fresh world state with the bay cleared and no planner or lift setting left over from another test
  const setup = (up = UP_ALL) => { fresh(up); K.clearBay(); g.liftH = undefined; g.bplan = null; g.cfgClip = null; g.machines.setGhost(null); g.plan = null; };
  const i0 = () => toI(-11), k0 = () => toK(0.3);
  // n belts of a mark from cell (i, k) facing d, straight (no checks: the tests build what they want)
  const lay = (tier, n, i, k, d = 0, j = 0, extra = {}) => {
    const out = [];
    for (let q = 0; q < n; q++) {
      const f = { i: i + DX[d] * q, j, k: k + DZ[d] * q, dir: d, rise: 0, items: [], ...extra };
      if (tier) f.tier = tier;
      out.push(g.placeEntity('belt', f, { quiet: true, rebuild: false }));
    }
    L().dirty = true;
    return out;
  };
  const vaultAt = (i, k, j = 0) => g.placeEntity('vault', { i, j, k, dir: 0 }, { quiet: true, rebuild: false });
  // plush packed along a straight line of tiles at exactly the 0.34 spacing (tile 0 first): the densest a line can be
  const dense = (line) => {
    // tile lengths are 1 for a belt and more for a lift or an underground entry: the plush sit 0.34 apart along the whole run
    const lens = line.map((t) => lenOf(t)), tot = lens.reduce((a, b) => a + b, 0), per = line.map(() => []);
    for (let m = 0; 0.34 * m + 0.01 < tot; m++) {
      let x = 0.34 * m + 0.01, q = 0; while (q < line.length - 1 && x >= lens[q]) { x -= lens[q]; q++; }
      per[q].push({ sp, vr: 0, t: x });
    }
    for (let q = 0; q < line.length; q++) line[q].items = per[q].sort((a, b) => b.t - a.t);
    return per.reduce((a, b) => a + b.length, 0);
  };
  const power = () => { for (const t of tiles()) if (t.type === 'belt' || t.type === 'sorter' || t.type === 'vault') t.pw = 1; };
  const step = (dt = 1 / 60, n = 1) => { for (let q = 0; q < n; q++) { power(); g.time += dt; L().update(dt); } };
  const seconds = (s, dt = 1 / 60) => step(dt, Math.round(s / dt));
  // time from the first to the last plush of a dense line reaching the vault, as items per minute
  const measure = (line, vault, dt = 1 / 60, cap = 60) => {
    const total = dense(line); let first = null, last = 0, count = 0, steps = 0; const times = [];
    while (steps++ < cap / dt && count < total) { step(dt); const c = vault.stored.length; if (c > count) { if (first === null) first = g.time; last = g.time; for (let q = count; q < c; q++) times.push(g.time); count = c; } }
    // rate over the last `tail` plush (the part of the stream that has settled into the slowest tile's pace)
    const tailRate = (n) => { const a = times.slice(-n); return a.length > 1 && a[a.length - 1] > a[0] ? (a.length - 1) / (a[a.length - 1] - a[0]) * 60 : 0; };
    return { count, total, rate: count > 1 && last > first ? (count - 1) / (last - first) * 60 : 0, done: last, times, tailRate };
  };
  // a floor cell for a lift's top (the next belt up there needs something to stand on)
  const floorAt = (i, j, k) => { w().setCell(i, j, k, BULK, 0); floors.push([i, j, k]); };
  const floors = [];
  const cleanup = () => { for (const [i, j, k] of floors.splice(0)) w().setCell(i, j, k, 0, 0); };
  const frameAt = (i, k) => g.placeEntity('liftframe', { i, j: 0, k, x: cellX(i), y: 0, z: cellZ(k), h: 1.8 }, { quiet: true, rebuild: false });
  // JSON round trip, the way a message or a save copies an ent
  const json = (m) => JSON.parse(JSON.stringify(m));
  // every test runs inside this: whatever a test leaves behind (planner, lift settings, a held key, a fake network role, floors it built) is put back
  const T = (name, fn) => ctx.T(name, async () => {
    try { return await fn(); } finally {
      g.bplan = null; g.liftH = undefined; g.liftDown = false; g.keys.KeyB = false; g.lastPaint = ''; g.plan = null; g.machines.setGhost(null);
      L().visualOnly = false; delete g.netSend; g.net.open = false; g.net.role = null; g.guestReady = false; g.remote = null; cleanup();
    }
  });
  return { T, K, sp, setup, i0, k0, lay, vaultAt, dense, power, step, seconds, measure, floorAt, cleanup, frameAt, json, DX, DZ };
}
