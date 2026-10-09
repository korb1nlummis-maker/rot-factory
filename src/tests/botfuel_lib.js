// Shared helpers for the botfuel_* tests (no default export, so the loader skips it as a test module).
// A fresh world with the open bay cleared (bins_lib's guard), generators and Charging Stations dropped straight in, a pole and fans for a grid that is in use,
// and a stepper that runs the crew, the tiles and the power for n seconds.
import { kit as binKit, UP as BUP } from './bins_lib.js';
import * as FUEL from '../botfuel.js';
import { pools, species } from '../plushdata.js';
import { liveGrid } from './charger_lib.js';

export const UP = { ...BUP, crew: 1, crewSlots: 3, power: 1, cart: 1 };
export const sp = (r) => pools[r][0];
export const mixOf = (rs) => rs.map((r) => ({ sp: sp(r), vr: 0 }));
export const rar = (it) => species[it.sp].rarity;

export function kit(ctx) {
  const { g, S, L, toI, toK, cellX, cellZ } = ctx;
  const B = binKit(ctx);
  const tileAt = (type, x, z, extra = {}) => B.rawTile(type, toI(x), toK(z), extra);
  // a generator with an empty hopper that is "burning" on a long-lasting plush, so the hopper only changes when somebody fills it
  const gen = (x, z, extra = {}) => tileAt('gen', x, z, { q: [], burn: 1e5, burnMax: 1e5, ...extra });
  // a Charging Station is a normal machine: it works only with a cable from a live grid, so each one gets its own (a full burning generator eight cells up, one cable). `unwired: true` leaves it dead
  // (the stepper skips it too), and `K.unwired` holds the ids of dead ones.
  const unwired = new Set();
  const charger = (x, z, extra = {}) => { const { unwired: dead, ...rest } = extra; const t = tileAt('charger', x, z, { q: [], reserve: 0, ...rest }); if (dead) unwired.add(t.id); else liveGrid(ctx, t, { air: true }); return t; };
  // a pole and some fans around a generator: a grid that is in use (the generators near it are the ones a scooping bot answers to)
  const grid = (x, z, fans = 2) => {
    const pole = tileAt('pole', x + 0.6, z - 1.2); const fs = [];
    for (let n = 0; n < fans; n++) fs.push(tileAt('fan', x + 1.2 + n * 0.6, z + 0.6));
    // power is wired: the generator at (x, z) to the pole, the pole to every fan (a cable each)
    const gen = [...L().tiles.values()].find((t) => t.type === 'gen' && t.i === toI(x) && t.k === toK(z));
    const wire = (a, b) => { S().items.cable = (S().items.cable || 0) + 1; const r = g.cables.connect(a.id, b.id); if (!r.ok) throw new Error('wire: ' + r.why); };
    if (gen) wire(gen, pole); for (const f of fs) wire(pole, f);
    g.power.markDirty(); g.power.recompute();
    return { pole, fans: fs };
  };
  const hopper = (t) => t.q.length;
  const step = (sec, dt = 0.05, each = null) => {
    for (let n = 0; n < sec / dt; n++) {
      for (const t of L().tiles.values()) t.pw = unwired.has(t.id) ? 0 : Math.max(t.pw || 0, 1);
      for (const it of g.machines.items.values()) it.ent.pw = B.off.has(it.ent.id) ? 0 : 1;   // (a Depot Beacon works)
      g.time += dt; g.crew.update(dt, g.time); L().update(dt); g.power.update(dt);
      for (const t of L().tiles.values()) if (t.type === 'charger') t.pw = unwired.has(t.id) ? 0 : Math.max(t.pw || 0, 1);   // (the solver ran: a charger the test did not leave dead keeps its power for the next look)
      if (each && each(n) === true) break;
    }
  };
  const states = (b, sec, stop) => { const seen = []; step(sec, 0.05, () => { if (seen[seen.length - 1] !== b.state) seen.push(b.state); return stop ? stop() : false; }); return seen; };
  const mkBot = (x, z) => { const b = B.mkBot(x, z); b.state = 'idle'; return b; };
  // plush in the world, hoppers, hands, buckets and the stats counter: what a conservation test adds up
  const count = () => {
    let n = 0;
    for (const t of L().tiles.values()) { if (t.q && !t.rig && (t.type === 'gen' || t.type === 'charger')) n += t.q.length; if (t.type === 'belt') n += t.items.length; if (t.type === 'vault') n += t.stored.length; }
    for (const b of S().crew) n += b.carry.length;
    return n;
  };
  // what the burning generators and the charger's reserve already used up (a test that lets them run counts their plush as spent)
  const sold = (r) => B.money() - (r || 0);
  return { ...B, tileAt, gen, charger, unwired, grid, hopper, step, states, mkBot, count, sold, FUEL, cellX, cellZ, S, g, L };
}
