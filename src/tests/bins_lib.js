// Shared helpers for the bins_* tests (no default export, so the loader skips it as a test module).
// A small world: the bin at (3.2, -4.4), Depot Beacons set in the bay, machines dropped straight in (the way a saved game brings them back), and a stepper that
// powers every machine except the ones a test switches off, so a beacon's power is the test's to give or take.
import * as VS from '../vehiclescan.js';
import { EARTH } from '../earth.js';
import { NEEDLE } from '../plushdata.js';

export const UP = { power: 1, belts: 1, sorter: 1, vault: 1, fans: 1, mfan: 1, mech: 1, claw: 1, borer: 1, borerSize: 2, mechBuf: 3, beltSpeed: 6, steel: 1, timber: 1, concrete: 1, depots: 1, bag: 4, excavator: 1, dozer: 1, wheel: 1, truck: 1, detector: 1, archGate: 1, archGiant: 1, vscan: 1, crew: 1, crewSlots: 3, cart: 1, rail: 1, railShuttle: 1 };

export function kit(ctx) {
  const { g, S, w, L, tiles, fresh, toI, toK, cellX, cellZ, clearBodies, newWorld } = ctx;
  const bin = () => g.hall.binPos;
  const off = new Set();           // ids of machines the stepper leaves without power
  const toasts = [], hints = [];
  const watch = () => {
    const t0 = g.ui.toast.bind(g.ui), h0 = g.ui.hint.bind(g.ui);
    g.ui.toast = (o) => { toasts.push(`${o.title} | ${o.text || ''}`); return t0(o); }; g.ui.hint = (t, s) => { hints.push(String(t)); return h0(t, s); };
    return () => { g.ui.toast = t0; g.ui.hint = h0; };
  };
  const mach = (type, x, z, extra = {}) => { const e = { id: g.nextId(), type, x, y: 0, z, i: toI(x), j: 0, k: toK(z), ...extra }; S().entities.push(e); g.addEntity(e); return g.machines.items.get(e.id).ent; };
  const beacon = (x, z, extra = {}) => mach('beacon', x, z, extra);
  const rawTile = (type, i, k, extra = {}) => { const e = { id: g.nextId(), type, i, j: 0, k, dir: 0, rise: 0, ...(type === 'belt' ? { items: [] } : {}), ...extra }; S().entities.push(e); g.addEntity(e); return L().byId.get(e.id); };
  const mkEarth = (kind, i, k, extra = {}) => {
    const spec = EARTH[kind];
    const ent = { id: g.nextId(), type: kind, i, j: 0, k, dx: 1, dz: 0, x: cellX(i), y: 0, z: cellZ(k), hy: spec.hy, hr: spec.hr, ...(spec.dig ? { hop: [], hn: 0, steps: 0, dug: 0, state: 'idle' } : { px: cellX(i), pz: cellZ(k), cargo: [], cn: 0, route: [], seg: 0, trips: 0, state: 'idle', job: 0, yaw: 0 }), ...extra };
    S().entities.push(ent); g.addEntity(ent); return ent;
  };
  const gone = (e) => { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } S().entities = S().entities.filter((x) => x.id !== e.id); w().supports = w().supports.filter((s) => s.id !== 'shield' + e.id); };
  const clearAt = (x, z, r = 8) => { const i0 = toI(x), k0 = toK(z); for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let j = 0; j < 13; j++) if (w().get(i0 + a, j, k0 + b)) w().removeCell(i0 + a, j, k0 + b, false); };
  // the open bay with nothing in it: a new world's pile can reach into the bay at a different place each time, and a bot stopped by a stray cell is a test of the terrain
  const bay = () => { for (let i = toI(-12); i <= toI(13); i++) for (let k = toK(-9); k <= toK(13); k++) for (let j = 0; j < 13; j++) if (w().get(i, j, k)) w().removeCell(i, j, k, false); };
  // a walkable corridor through the pile from x0 to x1 along z (half a width of `half` cells each side), floor to 7.8 m
  const corridor = (x0, x1, z, half = 8) => { const i0 = toI(Math.min(x0, x1)), i1 = toI(Math.max(x0, x1)), k0 = toK(z); for (let i = i0; i <= i1; i++) for (let k = k0 - half; k <= k0 + half; k++) for (let j = 0; j < 13; j++) if (w().get(i, j, k)) w().removeCell(i, j, k, false); };
  // the world for n seconds: every machine and tile powered (the beacons the test switched off excepted), trucks and diggers, belts and the crew moving
  const run = (secs, dt = 0.1, each = null) => {
    for (let n = 0; n < secs / dt; n++) {
      const power = () => { for (const it of g.machines.items.values()) it.ent.pw = off.has(it.ent.id) ? 0 : 1; for (const t of tiles()) t.pw = 1; };   // (set again before each system: a recompute of the grid in between would zero a depot for a moment)
      power(); g.time += dt; g.machines.update(dt, g.time); power(); L().update(dt); power(); g.crew.update(dt, g.time);
      if (each && each(n) === true) break;
    }
  };
  const until = (cond, secs = 90, dt = 0.1) => { let t = 0; while (t < secs && !cond()) { run(dt, dt); t += dt; } return cond(); };
  const mkBot = (x, z, y = 0.3) => { const b = g.crew.spawn(); b.x = x; b.z = z; b.y = y; b.vy = 0; b.battery = 1; b.state = 'idle'; return b; };
  const mix = (n = 6, sp = 3) => Array.from({ length: n }, () => ({ sp, vr: 0 }));
  const site = (o = {}) => {   // the yard 6 m from the bin, a digger 45 m out holding n plush, and optionally The One at the front
    const b = bin(), n = o.n ?? 240, tk = mkEarth('truck', toI(b.x + 6), toK(b.z + 8)), dg = mkEarth('excavator', toI(b.x + 45), toK(b.z + 8));
    const hop = []; if (o.one) hop.push(NEEDLE, 0); for (let q = 0; q < n - (o.one ? 1 : 0); q++) hop.push(3, 0); dg.hop = hop; dg.hn = hop.length / 2;
    return { tk, dg, b };
  };
  const scanner = (x, z, axis = 'x') => {
    clearAt(x, z); const lat = axis === 'z' ? toI(x) : toK(z), m = axis === 'z' ? toK(z) : toI(x);
    const l = VS.layout(g, axis, m, lat - 5, 0); if (!l.ok) throw new Error('layout: ' + l.why);
    return g.placeEntity('vscan', { ...l.ent });
  };
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  let sent = [];
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(JSON.parse(JSON.stringify(m))); }; };
  const done = () => { delete g.netSend; role(null); };
  const json = (m) => JSON.parse(JSON.stringify(m));
  const money = () => S().money;
  const guard = (name, fn, extra = {}) => ctx.T(name, async () => {
    const mode0 = g.mode, saved = { cfgClip: g.cfgClip }; toasts.length = 0; hints.length = 0; off.clear(); g._binSaid = new Map();
    const stop = watch();
    try { g.mode = 'play'; if (!extra.keepWorld) { await newWorld(); bay(); } fresh(extra.up || UP); S().money = 1e12; S().binStats = {}; S().cart = null; S().gcart = null; clearBodies(); g.cfgClip = null; return await fn(); }
    finally { stop(); g.mode = mode0 === 'ended' ? 'play' : mode0; done(); g.guestReady = false; off.clear(); clearBodies(); g.cfgClip = saved.cfgClip; if (g.ui.openModal) g.ui.closeModals(); S().found = false; S().ending = null; S().needleLost = false; g.crewSel = null; }
  });
  return { bin, off, toasts, hints, watch, bay, mach, beacon, rawTile, mkEarth, gone, clearAt, corridor, run, until, mkBot, mix, site, scanner, role, cap, done, json, money, guard, get sent() { return sent; } };
}
