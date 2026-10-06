// Shared helpers for the power wave tests (power_*.js). No default export, so the loader skips it as a test module.
// The bay is only 25 m wide, so the grids here use a short pole link and reach (g.T.poleLink 4 m, poleReach 3 m): a pole, its generator and the
// fans around it form one small grid and grids 6 m apart stay separate until a cable or a switch joins them.
export const UP = { power: 1, belts: 1, fans: 1, sorter: 1, depots: 1, claw: 1 };

export function makeKit(ctx) {
  const { g, S, L, fresh, adv, craft, toI, toK, cellX, cellZ, aimPoint, selectTool } = ctx;
  let cleared = false;
  const clearBay = () => { if (cleared) return; cleared = true; const w = ctx.w(); for (let i = toI(-14); i <= toI(11); i++) for (let k = toK(-1); k <= toK(10); k++) for (let j = 0; j < 12; j++) if (w.get(i, j, k)) w.removeCell(i, j, k, false); };
  const small = () => { g.T.poleLink = 4; g.T.poleReach = 3; g.power.markDirty(); };
  const reset = (up = UP, shrink = true) => {
    clearBay(); fresh(up); S().cables = []; g.cables.reset(); g.power.clear(); g.cfgClip = null;
    for (const k of Object.keys(S().stats)) if (/^pw[A-Z]/.test(k)) delete S().stats[k];
    if (shrink) small(); g.power.markDirty();
  };
  const tile = (type, x, z, extra = {}) => { const e = { id: g.nextId(), type, i: toI(x), j: 0, k: toK(z), dir: 0, rise: 0, ...extra }; if (type === 'belt') e.items = []; S().entities.push(e); g.addEntity(e); return L().byId.get(e.id); };
  const gen = (x, z) => { const t = tile('gen', x, z); t.burn = 1e5; t.burnMax = 1e5; t.lit = true; return t; };
  const pole = (x, z) => tile('pole', x, z);
  const fan = (x, z) => tile('fan', x, z);   // a 2 kW load
  const part = (type, x, z, extra = {}) => g.placeEntity(type, { x, y: 0, z, ry: 0, ...extra }, { quiet: true });
  const mach = (type, x, z, extra = {}) => { const e = { id: g.nextId(), type, x, y: 0, z, i: toI(x), j: 0, k: toK(z), ...extra }; S().entities.push(e); g.addEntity(e); return g.machines.items.get(e.id).ent; };
  // a pole at (x, z), `gens` burning generators beside it and `fans` 2 kW fans in rows around it
  const grid = (x, z, o = {}) => {
    const out = { x, z, pole: pole(x, z), gens: [], fans: [] };
    for (let n = 0; n < (o.gens || 0); n++) out.gens.push(gen(x - 1.2 - n * 0.9, z));
    out.addFans = (n) => { for (let q = 0; q < n; q++) { const c = out.fans.length; out.fans.push(fan(x + (c % 3) * 0.6 - 0.6, z + 0.6 * (1 + Math.floor(c / 3)) + 0.6)); } };
    out.addFans(o.fans || 0);
    return out;
  };
  const wire = (a, b) => { S().items.cable = (S().items.cable || 0) + 1; return g.cables.connect(a.id, b.id); };
  const netOf = (e) => g.power.netOfEnt(e);
  const nearFans = (G) => G.fans.map((f) => f.pw || 0);
  const allPowered = (G, min = 0.99) => G.fans.every((f) => (f.pw || 0) >= min);
  const nonePowered = (G) => G.fans.every((f) => (f.pw || 0) === 0);
  const look = (x, y, z, back = 2.0) => { aimPoint(x, y, z, back); adv(0.06); };
  const hintText = () => (document.getElementById('hint') ? document.getElementById('hint').textContent : '');
  const json = (m) => JSON.parse(JSON.stringify(m));
  const decon = (e) => g.doDecon({ kind: g.logi.byId.get(e.id) ? 'tile' : 'mach', id: e.id });
  return { clearBay, small, reset, tile, gen, pole, fan, part, mach, grid, wire, netOf, nearFans, allPowered, nonePowered, look, hintText, json, decon, cellX, cellZ, selectTool, craft };
}
