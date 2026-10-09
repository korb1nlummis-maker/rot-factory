// Shared helpers for the power wave tests (power_*.js). No default export, so the loader skips it as a test module.
// Power travels only through Power Cables (cables.js): nodes join a grid by cable, and every machine needs a cable to a node. These helpers therefore WIRE what they build:
// grid() lays a pole, burning generators and 2 kW fans and runs a cable from each generator and each fan to the pole, so a grid built here is one live grid, and
// grids that stand 6 m apart stay separate until a test wires them together (or through a switch).
import { makeWiring } from './wire_lib.js';

export const UP = { power: 1, belts: 1, fans: 1, sorter: 1, depots: 1, claw: 1 };

export function makeKit(ctx) {
  const { g, S, L, fresh, adv, craft, toI, toK, cellX, cellZ, aimPoint, selectTool } = ctx;
  let cleared = false;
  const clearBay = () => { if (cleared) return; cleared = true; const w = ctx.w(); for (let i = toI(-14); i <= toI(11); i++) for (let k = toK(-1); k <= toK(10); k++) for (let j = 0; j < 12; j++) if (w.get(i, j, k)) w.removeCell(i, j, k, false); };
  const small = () => { g.power.markDirty(); };   // (kept for old callers: there is no range to shrink any more)
  const reset = (up = UP, shrink = true) => {
    hubs.length = 0; clearBay(); fresh(up); S().cables = []; g.cables.reset(); g.power.clear(); g.cfgClip = null;
    for (const k of Object.keys(S().stats)) if (/^pw[A-Z]/.test(k)) delete S().stats[k];
    if (shrink) small(); g.power.markDirty();
  };
  // Legacy placement rule for the old tests: after grid() has built a pole, every generator, battery, breaker or machine the kit places next is wired to the NEAREST pole that grid()
  // built, when one stands within 6 m (what the old range link did: it put everything standing near a pole on that pole's grid). Poles and switches are never wired this way (a switch is
  // wired by hand, two poles stand apart until a test joins them). reset() clears the list. A test that wants no auto wiring never calls grid() (the wire.* tests build by hand).
  const hubs = [];
  const HUBBED = (type) => type !== 'pole' && type !== 'switch' && type !== 'pswitch';
  const hubWire = (e) => {
    if (!hubs.length || !e || !HUBBED(e.type)) return e;
    const [ex, , ez] = g.cables.attach(e); let best = null, bd = 6;
    for (const h of hubs) { if (g.logi.byId.get(h.id) !== h || h === e) continue; const [hx, , hz] = g.cables.attach(h), d = Math.hypot(hx - ex, hz - ez); if (d < bd) { bd = d; best = h; } }
    if (best) wire(e, best);
    return e;
  };
  const tile = (type, x, z, extra = {}) => { const e = { id: g.nextId(), type, i: toI(x), j: 0, k: toK(z), dir: 0, rise: 0, ...extra }; if (type === 'belt') e.items = []; S().entities.push(e); g.addEntity(e); return hubWire(L().byId.get(e.id)); };
  const gen = (x, z) => { const t = tile('gen', x, z); t.burn = 1e5; t.burnMax = 1e5; t.lit = true; return t; };
  const pole = (x, z) => tile('pole', x, z);
  const fan = (x, z) => tile('fan', x, z);   // a 2 kW load
  const part = (type, x, z, extra = {}) => hubWire(g.placeEntity(type, { x, y: 0, z, ry: 0, ...extra }, { quiet: true }));
  const mach = (type, x, z, extra = {}) => { const e = { id: g.nextId(), type, x, y: 0, z, i: toI(x), j: 0, k: toK(z), ...extra }; S().entities.push(e); g.addEntity(e); return hubWire(g.machines.items.get(e.id).ent); };
  // a pole at (x, z), `gens` burning generators beside it and `fans` 2 kW fans in rows around it
  const grid = (x, z, o = {}) => {
    const out = { x, z, pole: pole(x, z), gens: [], fans: [] };
    const place = (make) => { const keep = hubs.splice(0); try { return make(); } finally { hubs.push(...keep); } };   // (the gens and fans of this grid are wired below, never by the nearest-pole rule)
    for (let n = 0; n < (o.gens || 0); n++) { const gg = place(() => gen(x - 1.2 - n * 0.9, z)); out.gens.push(gg); if (o.wire !== false) wire(gg, out.pole); }
    out.addFans = (n) => { for (let q = 0; q < n; q++) { const c = out.fans.length; const ff = place(() => fan(x + (c % 3) * 0.6 - 0.6, z + 0.6 * (1 + Math.floor(c / 3)) + 0.6)); out.fans.push(ff); if (o.wire !== false) wire(ff, out.pole); } };
    out.addFans(o.fans || 0);
    if (o.hub !== false) hubs.push(out.pole);
    return out;
  };
  const { wire, wireNear } = makeWiring(ctx);
  const netOf = (e) => g.power.netOfEnt(e);
  const nearFans = (G) => G.fans.map((f) => f.pw || 0);
  const allPowered = (G, min = 0.99) => G.fans.every((f) => (f.pw || 0) >= min);
  const nonePowered = (G) => G.fans.every((f) => (f.pw || 0) === 0);
  const look = (x, y, z, back = 2.0) => { aimPoint(x, y, z, back); adv(0.06); };
  const hintText = () => (document.getElementById('hint') ? document.getElementById('hint').textContent : '');
  const json = (m) => JSON.parse(JSON.stringify(m));
  const decon = (e) => g.doDecon({ kind: g.logi.byId.get(e.id) ? 'tile' : 'mach', id: e.id });
  return { clearBay, small, reset, tile, gen, pole, fan, part, mach, grid, wire, wireNear, netOf, nearFans, allPowered, nonePowered, look, hintText, json, decon, cellX, cellZ, selectTool, craft };
}
