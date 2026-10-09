// Shared helpers for the botnav_* tests (no default export, so the loader skips it as a test module).
// A cleared test box (the build shell kit), pieces put down through the same planner the player uses (build_lib.js makeShell.put), a few structures built from them, bots, a stepper
// that runs the real frame (g.updatePlay, so the crew, the lifts, the doors and the power all move) and a recorder that watches a bot every frame: how far it moved, how high it
// stood over what it stood on, and whether it ever stood on nothing.
import { makeShell, UP as SHELL_UP } from './build_lib.js';
import * as B from '../build.js';
import * as NAV from '../botnav.js';
import { liveGrid } from './charger_lib.js';
import { PAD, BULK } from '../plushdata.js';
import { pools, species } from '../plushdata.js';

export const UP = { ...SHELL_UP, crew: 1, crewSlots: 40, cart: 1, stackKit: 1, transitDoor: 1, transitBlast: 1, transitLift: 1, transitJump: 1, power: 1, belts: 1, springs: 3, depots: 1, crewBelt: 0 };
export const sp = (r) => pools[r][0];
export const rar = (it) => species[it.sp].rarity;
export const C = 0.6;

export function kit(ctx, o0 = {}) {
  const { g, S, w, p, L, adv, fresh, toI, toK, cellX, cellZ } = ctx;
  const K = o0.shell === false ? { setup() {}, clean() {}, put: null } : makeShell(ctx);
  const guard = (name, fn, extra = {}) => ctx.T(name, async () => {
    const toasts = [], t0 = g.ui.toast.bind(g.ui);
    g.ui.toast = (o) => { toasts.push(`${o.title} | ${o.text || ''}`); return t0(o); };
    try { if (extra.setup !== false) K.setup({ ...UP, ...(extra.up || {}) }); S().money = 1e13; NAV.install(g); NAV.invalidate('test'); NAV.resetStats(); g._botPeople = []; g._toasts = toasts; return await fn(toasts); }
    finally { g.ui.toast = t0; for (const b of [...S().crew]) { NAV.resetBot(b); } S().crew.length = 0; g.crew.clear(); cleanAll(); if (extra.setup !== false) K.clean(); NAV.invalidate('test'); delete g.netSend; g.net.open = false; g.net.role = null; g.guestReady = false; }
  });
  const cleanAll = () => {
    for (const e of [...S().entities]) if (['plift', 'door', 'callbtn', 'ladder'].includes(e.type)) { try { g.doDecon({ kind: 'mach', id: e.id }); } catch (x) { /* half built */ } }
    for (const t of [...L().tiles.values()]) if (!t.free && (t.type === 'gen' || t.type === 'charger' || t.type === 'pole' || t.type === 'fan')) { L().remove(t); S().entities = S().entities.filter((x) => x.id !== t.id); }
    g.cables.prune(); dead.clear();
    S().cart = null; S().gcart = null; g._fuelMach = null;   // (botfuel.js keeps its machine list half a second: the next test must not be handed this one's machines)
  };
  // a machine tile standing on the floor cell (i, k) at row j (the top of whatever is under it: j = 1 on a pad that sits on the floor)
  const tile = (type, i, k, j, extra = {}) => { const e = { id: g.nextId(), type, i, j, k, dir: 0, rise: 0, ...extra }; S().entities.push(e); g.addEntity(e); g._fuelMach = null; return L().byId.get(e.id); };   // (botfuel.js keeps its machine list for half a second: a test that builds a machine right after another test's must not see the old list)
  const gen = (i, k, j = 0, extra = {}) => tile('gen', i, k, j, { q: [], burn: 1e5, burnMax: 1e5, ...extra });
  // a Charging Station works only with a cable from a live grid: each one gets its own (a full burning generator eight cells up, one cable); `unwired: true` leaves it dead
  const charger = (i, k, j = 0, extra = {}) => { const { unwired, ...rest } = extra; const t = tile('charger', i, k, j, { q: [], reserve: 0, ...rest }); if (unwired) dead.add(t.id); else liveGrid(ctx, t, { air: true }); return t; };
  const mkBot = (x, z, y = 0.02) => { const b = g.crew.spawn(); b.x = x; b.z = z; b.y = y; b.vy = 0; b.battery = 1; b.state = 'idle'; b.carry = []; return b; };
  const mix = (n, r = 0) => Array.from({ length: n }, () => ({ sp: sp(r), vr: 0 }));
  // everything that has power gets it (a lift and a door run on a grid in the game; a test that is not about the grid gives it by hand)
  const powered = new Set(), dead = new Set();
  const power = () => { if (!force.on) return; for (const t of L().tiles.values()) t.pw = t.type === 'charger' && dead.has(t.id) ? 0 : Math.max(t.pw || 0, 1); for (const it of g.machines.items.values()) if (it.ent.type === 'beacon') it.ent.pw = 1; };
  const force = { on: true };   // a test of a lift or a door turns this off: the grid decides what has power there
  // the world for `sec` seconds, one real frame at a time; `each(n)` returning true stops it
  const run = (sec, each = null, dt = 0.05) => {
    const n = Math.round(sec / dt);
    for (let q = 0; q < n; q++) { power(); g.time += dt; g.updatePlay(dt); power(); if (each && each(q) === true) return q * dt; }
    return sec;
  };
  // the highest solid thing under (x, y, z) that a bot could stand on: a ramp or stair surface, else the top of the topmost cell at or under y + 0.5
  const support = (x, y, z) => {
    let best = null;
    const s = B.surfaceAt(g, x, z, y + 0.1); if (s !== null) best = s;
    const i = toI(x), k = toK(z);
    for (let j = Math.floor((y + 0.5) / C); j >= 0; j--) { if (w().solid(i, j, k)) { const top = (j + 1) * C; if (best === null || top > best) best = top; break; } }
    if (best === null) best = 0;
    return best;
  };
  // record a bot every frame while `fn` runs the world: the worst gap between its feet and what it stands on, the biggest jump between frames and where it was
  const watch = (b, secs, until = null, o = {}) => {
    if (o.dbg) g._navDbg = [];
    const rec = { frames: 0, maxGap: 0, minGap: 1e9, maxJump: 0, maxY: -1e9, minY: 1e9, trail: [], codes: new Set(), states: [], hang: 0, falls: 0 };
    let last = { x: b.x, y: b.y, z: b.z };
    const t = run(secs, () => {
      rec.frames++;
      const sup = support(b.x, b.y, b.z), gap = b.y - sup; if (rec.frames > 3) { if (gap > rec.maxGap) { rec.maxGap = gap; rec.atMax = [b.x, b.y, b.z, sup, b.state, NAV.codeOf(b)].map((v) => (typeof v === 'number' ? +v.toFixed(2) : v)); } if (gap < rec.minGap) { rec.minGap = gap; rec.atMin = [b.x, b.y, b.z, sup, b.state, NAV.codeOf(b)].map((v) => (typeof v === 'number' ? +v.toFixed(2) : v)); } }
      const j = Math.hypot(b.x - last.x, b.y - last.y, b.z - last.z); if (j > rec.maxJump) { rec.maxJump = j; rec.atJump = [last.x, last.y, last.z, b.x, b.y, b.z, b.state, NAV.codeOf(b)].map((v) => (typeof v === 'number' ? +v.toFixed(2) : v)); }
      if (b.y < last.y - 0.7) rec.falls++;
      rec.maxY = Math.max(rec.maxY, b.y); rec.minY = Math.min(rec.minY, b.y);
      last = { x: b.x, y: b.y, z: b.z };
      const c = NAV.codeOf(b); if (c) rec.codes.add(c);
      if (rec.states[rec.states.length - 1] !== b.state) rec.states.push(b.state);
      if (o.each) o.each(b, rec);
      return until ? until() : false;
    });
    rec.t = t; if (o.dbg) { rec.dbg = g._navDbg.slice(-o.dbg); g._navDbg = null; } return rec;
  };
  const count = () => {
    let n = 0;
    for (const t of L().tiles.values()) { if (t.q && !t.rig && (t.type === 'gen' || t.type === 'charger')) n += t.q.length; }
    for (const b of S().crew) n += b.carry.length;
    return n;
  };
  // the bin (where a bot unloads and where it idles) at (x, z) for a test whose base is a sealed yard in the pile: a patched Crew.home, undone by the returned function
  const homeAt = (x, z, y = 0) => { const h0 = Object.getPrototypeOf(g.crew).home; g.crew.home = function (b) { return { ...h0.call(this, b), x, z, y }; }; return () => { delete g.crew.home; }; };
  // every other generator and charger full (a power rig is made of generators, and a bot fuels the nearest machine that has room)
  const fillOthers = (keep) => { for (const t of L().tiles.values()) if ((t.type === 'gen' || t.type === 'charger') && t !== keep && Array.isArray(t.q)) while (t.q.length < 50) t.q.push({ sp: sp(0), vr: 0 }); };
  // ---- structures ----
  // a platform: one pad on the floor with a ramp up to it from the west (rises toward +x, ends at the pad's west edge). Returns { pad, ramp, i0, k0, top }
  const platform = async (i, k, o = {}) => {
    const r = await K.put(o.pad || 'pad:timber', i, k, { back: 1.8 }); if (!r.ok) throw new Error('pad: ' + r.why);
    const pad = r.made[0];
    const rr = await K.put('wramp', pad.i0 - 2, pad.k0 + 1, { dir: 0, back: 2.6 }); if (!rr.ok) throw new Error('ramp: ' + rr.why);
    return { pad, ramp: rr.made[0], i0: pad.i0, k0: pad.k0, top: C };
  };
  // plush walls (3 rows) one cell out from the sides of a pad, so the only way on or off it is the ramp (the edge of a one pad platform is a curb a bot may step down)
  const fence = (pad, sides = ['n', 's', 'e', 'w'], ramps = []) => {
    const cells = [], inRamp = (i, k) => (Array.isArray(ramps) ? ramps : [ramps]).filter(Boolean).some((r) => { const sp = B.spec(r); return i >= r.i0 && i < r.i0 + sp.nx && k >= r.k0 && k < r.k0 + sp.nz; });
    for (let a = -1; a <= 4; a++) {
      if (sides.includes('e')) cells.push([pad.i0 + 4, pad.k0 + a]);
      if (sides.includes('w')) cells.push([pad.i0 - 1, pad.k0 + a]);
      if (sides.includes('n')) cells.push([pad.i0 + a, pad.k0 - 1]);
      if (sides.includes('s')) cells.push([pad.i0 + a, pad.k0 + 4]);
    }
    for (const [i, k] of cells) { if (inRamp(i, k)) continue; for (let j = 0; j < 4; j++) if (!w().get(i, j, k)) w().setCell(i, j, k, 2, 0); }
    return cells;
  };
  // the same platform with a second ramp on its south side (rises toward -z, ends at the pad's south edge)
  const platform2 = async (i, k, o = {}) => {
    const P = await platform(i, k, o);
    const r2 = await K.put('wramp', P.pad.i0 + 1, P.pad.k0 + 5, { dir: 3, back: 2.6 });   // (aimed one cell out: the planner snaps it against the pad's south edge) if (!r2.ok) throw new Error('ramp 2: ' + r2.why);
    return { ...P, ramp2: r2.made[0] };
  };
  const clearAbove = (i0, k0, ni, nk, rows) => { for (let a = 0; a < ni; a++) for (let b = 0; b < nk; b++) for (let j = 0; j < rows; j++) if (w().get(i0 + a, j, k0 + b) && w().get(i0 + a, j, k0 + b) !== PAD && w().get(i0 + a, j, k0 + b) !== BULK) w().removeCell(i0 + a, j, k0 + b, false); };
  return { ...K, K, force, guard, homeAt, fillOthers, tile, gen, charger, mkBot, mix, run, watch, support, count, platform, platform2, fence, clearAbove, power, powered, dead, cleanAll, g, S, w, p, L, adv, cellX, cellZ, toI, toK, B, NAV, PAD, BULK, sp, rar, C };
}
