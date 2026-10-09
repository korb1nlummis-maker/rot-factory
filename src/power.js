import { C, cellX, cellZ } from './config.js';
import { species } from './plushdata.js';
import { isEarth, EARTH, EARTH_KW, earthDemand } from './earth.js';
import { beltRev, beltLine } from './cables.js';
import { mergeDemand, drawsPower, catalogType } from './catalog.js';
import { beltKw } from './beltdata.js';
import { isPart, collectParts, partDemand, attachY, genKw, genHopper, genKindOf, battCap, battRate, cacheOf, Ring, tripAlert, PRIO_MAX, HIST_DT, TRIP_GRACE_S, AUTO_RESET_BREAKER_S, AUTO_RESET_SHED_S } from './powerparts.js';

// ---------------------------------------------------------------------------------------------------
// Power. Generators burn plush for energy. WIRES are the only way it travels (cables.js): a node (generator, pole, battery, breaker) joins a grid
// only through cables, and a machine is powered only by a cable to a node of a grid that has supply. There is no range link and no plug-in reach:
// a machine standing against a pole or a generator gets nothing. A Power Pole has no power of its own, it is a hub that is dead until a cable
// path links it to a generator (or a charged battery). Two generators wired together (directly or through a pole) are one grid whose supply is
// the sum of both. The one exception: a belt line (belt tiles that hand plush to one another) is ONE load and ONE cable endpoint.
// A grid that cannot meet demand browns out: everything on it slows. Burn rule (unchanged): a generator burns its own fuel at full output whenever
// it has fuel (mode auto) or is needed (mode reserve), whatever the grid wants; the grid sums what the burning ones put out.
// ---------------------------------------------------------------------------------------------------
const NET = Symbol('net');
export const DEMAND = { belt: 0.03, sorter: 1.2, mech: 3.5, borer: 12, claw: 2.5, fan: 2, beacon: 0.6, charger: 1, ...EARTH_KW };   // the earth movers draw tens of kW (a parked one draws nothing, Efficient Drives trims the rest)
mergeDemand(DEMAND);   // catalog_*.js kW per type (new keys only)
// Every catalog machine that declares a demand (a catalog_*.js DEMAND row or a TYPES `kw` handler) is a consumer here: the rail station, the Leveling Pad, doors, lifts,
// jump pads, lights, signs, the arches. The ones counted by name further down (power parts, earth movers, claw, borer, beacon, lantern, scanner) are left out.
const OWN_CONSUMERS = new Set(['claw', 'borer', 'beacon', 'meter', 'hlamp', 'vscan', 'switch', 'pswitch', 'breaker', 'battery']);
export const isCatalogConsumer = (type) => !OWN_CONSUMERS.has(type) && !isPart(type) && !isEarth(type) && drawsPower(type);
// what a catalog machine draws now: its `kw` handler, else its DEMAND row
// what a load is called in the grid readout (the Load Meter): core machines by a plural name, earth movers by their own, catalog machines by their cable name
const CORE_LOAD = { belt: 'Belts', sorter: 'Sorting Boxes', mech: 'Mech Scoopers', fan: 'Fans', claw: 'Claw Rigs', borer: 'Tunnel Borers', beacon: 'Depot Beacons', charger: 'Charging Stations', hlamp: 'Hanging Lanterns', vscan: 'Vehicle Scanners', meter: 'Load Meters' };
export function loadLabel(e) {
  if (CORE_LOAD[e.type]) return CORE_LOAD[e.type];
  if (isEarth(e.type)) return EARTH[e.type].name;
  const h = catalogType(e.type); if (h && typeof h.wireName === 'function') { const n = h.wireName(e); if (n) return n; }
  return e.type;
}
export function catalogKw(game, e) {
  const h = catalogType(e.type);
  if (h && typeof h.kw === 'function') { const v = h.kw(e, game); if (Number.isFinite(v)) return Math.max(0, v); }
  return DEMAND[e.type] ?? 0;
}
// How long one plush burns at the base output of 8 kW. Turbine upgrades raise the output and burn each plush faster (energy / output).
export const GEN_BASE_KW = 8;
export const BURN_SECONDS = [270, 720, 1800, 4500, 0, 0, 0];      // Common 4.5 min, Uncommon 12, Rare 30, Epic 75 (three times the first tuning: a plush has to last). Legendary and Mythic are too valuable to burn.
export const ENERGY_KJ = BURN_SECONDS.map((sec) => sec * GEN_BASE_KW); // kJ per plush by rarity
export const FUEL_MAX_RARITY = 3;                                // generators take Common to Epic
export const burnTime = (rarity, outputKw) => (ENERGY_KJ[rarity] || 0) / outputKw;

export class Power {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.catalogConsumers = true;   // furnish.js and transit.js read this: the solver counts their loads, they no longer add kW to a grid themselves
    this.nets = [];          // { id, nodes:[ent], supply, demand, sat, cap, capEff, batts, breakers, tripped, bat, batMax, flow, hist } (power switches merge grids, breakers trip them, batteries cover deficits)
    this.rings = new Map(); this.netById = new Map(); this.parts = null; this.swRecs = [];
    this.dirty = true;
  }

  clear() { this.nets = []; this.rings = new Map(); this.netById = new Map(); this.parts = null; this.swRecs = []; this._rowHad = false; this.dirty = true; }
  markDirty() { this.dirty = true; }

  pos(e) {
    { const h = catalogType(e.type); if (h && typeof h.pos === 'function') { const p = h.pos(this.game, e); if (p) return p; } }
    if (isPart(e.type)) return [e.x, (e.y ?? 0) + attachY(e), e.z];
    if (e.type === 'hlamp') return [e.x, e.y + (e.h || 0.4) / 2, e.z];   // a hanging lantern: the wire clips to its middle
    if (e.i !== undefined && e.type !== 'claw' && e.type !== 'borer' && e.type !== 'beacon') return [cellX(e.i), e.j * C + 1.0, cellZ(e.k)];
    return [e.x ?? cellX(e.i), (e.y ?? e.j * C) + 1.0, e.z ?? cellZ(e.k)];
  }

  // supply of one generator right now (kW)
  // (the generator ladder: genKw scales T.genOutput by the rung of that generator, see powerparts.js)
  genOutput(g) { return g.burn > 0 ? genKw(this.game.T, g) : 0; }

  // The history ring of one grid, kept across recomputes (a grid is the same grid while its lowest node id is the same).
  ringFor(id) { if (!this.rings) this.rings = new Map(); let r = this.rings.get(id); if (!r) this.rings.set(id, r = new Ring()); return r; }

  recompute() {
    const game = this.game, T = game.T;
    const tiles = [...game.logi.tiles.values()];
    const P = collectParts(game);
    this.parts = P;
    const nodes = tiles.filter((t) => t.type === 'gen' || t.type === 'pole');
    for (const b of P.batteries) nodes.push(b);   // storage and breakers are nodes like a pole: they take cables
    for (const b of P.breakers) nodes.push(b);
    const cabs = game.cables ? game.cables.live() : [];   // the hand-wired cables, the only links there are: [{ rec, A, B }]
    const cabled = new Set(); for (const c of cabs) { cabled.add(c.A.id); cabled.add(c.B.id); }
    const consumers = [];
    // belts: only a line a cable ends on is a consumer (one load, one endpoint: every tile of the line takes the line's net). Every other belt tile is off.
    const lines = [];   // [tiles] of each wired belt line
    for (const t of tiles) if (t.type === 'belt') { t[NET] = null; t.pw = 0; }
    {
      let rev = null; const seenLine = new Set();
      for (const t of tiles) {
        if (t.type !== 'belt' || !cabled.has(t.id) || seenLine.has(t.id)) continue;
        rev = rev || beltRev(game);
        const line = beltLine(game, t, rev); for (const x of line) seenLine.add(x.id);
        lines.push(line); for (const x of line) consumers.push(x);
      }
    }
    for (const t of tiles) if (t.type === 'sorter' || t.type === 'mech' || t.type === 'fan' || t.type === 'charger') consumers.push(t);   // a Charging Station is a normal consumer (1 kW): it works only with a cable from a live grid
    for (const it of game.machines.items.values()) {
      const e = it.ent;
      if (e.type === 'claw' || e.type === 'borer' || e.type === 'beacon' || e.type === 'meter' || e.type === 'hlamp' || e.type === 'vscan' || isEarth(e.type) || isCatalogConsumer(e.type)) consumers.push(e);
    }
    // union-find over nodes: a cable between two nodes joins their grids (and nothing else does)
    const parent = nodes.map((_, i) => i);
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const nodeAt = new Map(); nodes.forEach((n, i) => nodeAt.set(n.id, i));
    for (const c of cabs) { const a = nodeAt.get(c.A.id), b = nodeAt.get(c.B.id); if (a !== undefined && b !== undefined) parent[find(a)] = find(b); }
    const nets = new Map();
    nodes.forEach((n, i) => {
      const r = find(i);
      if (!nets.has(r)) nets.set(r, { nodes: [], gens: [], supply: 0, demand: 0, sat: 1, cap: 0, batts: [], breakers: [], id: n.id });
      const net = nets.get(r); net.nodes.push(n); if (n.id < net.id) net.id = n.id;
      if (n.type === 'gen') { const out = this.outage ? 0 : this.genOutput(n); net.cap += genKw(T, n); net.supply += out; net.gens.push({ e: n, out, carry: 0 }); }
      else if (n.type === 'battery') net.batts.push(n);
      else if (n.type === 'breaker') net.breakers.push(n);
      n[NET] = net;
    });
    // a machine takes the grid of the node its cable ends on (a pole is only a hub: its grid is whatever generators its cables reach)
    const consSet = new Set(consumers);
    for (const c of consumers) { c[NET] = null; c.pw = 0; }
    // (a thing with cables to two grids, a lantern with a cord at each end, runs on the better supplied one: see netRank)
    const netRank = (n) => (n.supply > 0 ? 2 : n.batts.some((b) => (b.charge || 0) > 0.01) ? 1 : 0);
    const adopt = (e, net) => { if (!e[NET] || netRank(net) > netRank(e[NET])) e[NET] = net; };
    for (const c of cabs) {
      const nA = nodeAt.get(c.A.id), nB = nodeAt.get(c.B.id);
      if (nA !== undefined && nB === undefined && consSet.has(c.B)) adopt(c.B, nodes[nA][NET]);
      else if (nB !== undefined && nA === undefined && consSet.has(c.A)) adopt(c.A, nodes[nB][NET]);
    }
    // a string of hanging lanterns: a lantern wired to a lantern that has a grid shares it (the string ends on a node)
    if (cabs.length) for (let pass = 0; pass <= cabs.length; pass++) {
      let moved = false;
      for (const c of cabs) {
        if (c.A.type !== 'hlamp' || c.B.type !== 'hlamp') continue;
        if (c.A[NET] && !c.B[NET]) { c.B[NET] = c.A[NET]; moved = true; } else if (c.B[NET] && !c.A[NET]) { c.A[NET] = c.B[NET]; moved = true; }
      }
      if (!moved) break;
    }
    // a belt line takes the grid of whichever of its tiles has a cable to a node. Two lines joined after they were wired carry two cables: the line runs on the better supplied
    // grid (one with a generator burning, then one with a charged battery), the first cable wins a tie, and the line's demand is counted once, on that grid.
    for (const line of lines) { let net = null; for (const x of line) { const n = x[NET]; if (n && (!net || netRank(n) > netRank(net))) net = n; } if (net) for (const x of line) x[NET] = net; }
    const demandOf = (c) => (c.type === 'hlamp' ? (c.on === false ? 0 : DEMAND.hlamp ?? 1.6) : isEarth(c.type) ? earthDemand(T, c, DEMAND[c.type]) : c.type === 'belt' ? beltKw(c) : isCatalogConsumer(c.type) ? catalogKw(game, c) : (DEMAND[c.type] ?? 1));   // a belt draws its mark's kW (lifts: per cell of height), see beltdata.js
    for (const c of consumers) if (c[NET]) c[NET].demand += demandOf(c);
    for (const n of nodes) if (n.type === 'battery' || n.type === 'breaker') n[NET].demand += partDemand(n);

    // ---- switches: two cable ends each. Not a node. Closed (on and not shed), it joins the two grids its ends sit in.
    const swRecs = [];
    for (const sw of P.switches) {
      const ends = []; for (const c of cabs) { if (c.A === sw) ends.push(c.B); else if (c.B === sw) ends.push(c.A); }
      const ee = ends.filter((o) => o.type !== 'switch').slice(0, 2);
      let home = null;   // it draws its 0.05 kW from the grid of its first cable end that has one
      for (const o of ee) if (o[NET]) { home = o[NET]; break; }
      if (home) home.demand += partDemand(sw);
      sw[NET] = home;
      swRecs.push({ sw, a: ee[0] || null, b: ee[1] || null });
    }
    const baseNets = [...nets.values()];
    // a string of hanging lanterns hung off a switch: the lanterns cabled to a lantern the switch feeds take the same grid (a lantern cabled to a node keeps its own)
    const lampNbr = new Map();
    for (const c of cabs) if (c.A.type === 'hlamp' && c.B.type === 'hlamp') { (lampNbr.get(c.A.id) || lampNbr.set(c.A.id, []).get(c.A.id)).push(c.B); (lampNbr.get(c.B.id) || lampNbr.set(c.B.id, []).get(c.B.id)).push(c.A); }
    const closed = (r) => r.sw.on === true && !r.sw.shed;
    const endNet = (o) => (o && o[NET]) || null;
    const solve = () => {
      const par = new Map(baseNets.map((n) => [n, n]));
      const fnd = (n) => { while (par.get(n) !== n) { par.set(n, par.get(par.get(n))); n = par.get(n); } return n; };
      const att = [];   // [consumer, base net]: a machine with no grid of its own, fed through a closed switch
      for (const r of swRecs) {
        if (!closed(r)) continue;
        const na = endNet(r.a), nb = endNet(r.b);
        if (na && nb) par.set(fnd(na), fnd(nb));
        else if (na && r.b && consSet.has(r.b)) att.push([r.b, na]);
        else if (nb && r.a && consSet.has(r.a)) att.push([r.a, nb]);
      }
      if (lampNbr.size) { const seen = new Set(att.map((q) => q[0].id)); for (let q = 0; q < att.length; q++) { const [c, na] = att[q]; if (c.type !== 'hlamp') continue; for (const nb of lampNbr.get(c.id) || []) if (!nb[NET] && !seen.has(nb.id)) { seen.add(nb.id); att.push([nb, na]); } } }
      const groups = new Map();
      for (const n of baseNets) {
        const rt = fnd(n); let G = groups.get(rt);
        if (!G) groups.set(rt, G = { bases: [], supply: 0, demand: 0, cap: 0, batts: [], breakers: [], fed: [], gens: [] });
        G.bases.push(n); G.supply += n.supply; G.demand += n.demand; G.cap += n.cap; for (const b of n.batts) G.batts.push(b); for (const b of n.breakers) G.breakers.push(b); for (const q of n.gens) G.gens.push(q);
      }
      for (const [c, n] of att) { const G = groups.get(fnd(n)); G.fed.push(c); G.demand += demandOf(c); }
      for (const G of groups.values()) {
        G.charged = G.batts.some((b) => b.charge > 0.01);
        G.trip = G.breakers.some((b) => b.tripped);
        G.supplyEff = G.trip ? 0 : (G.charged && G.demand > G.supply ? G.demand : G.supply);   // a charged battery covers the missing kW; a tripped grid supplies nothing
      }
      return { groups, of: (n) => groups.get(fnd(n)) };
    };
    let res = solve();
    // ---- priority shedding: an overloaded grid opens its closed priority switch with the highest group number (group 0, undefined, goes first)
    if (!this.outage && swRecs.some((r) => r.sw.prio !== undefined)) {
      for (let pass = 0; pass <= PRIO_MAX; pass++) {
        let dropped = false;
        for (const G of res.groups.values()) {
          if (G.trip || G.demand <= G.supplyEff + 1e-9) continue;
          let pick = null, rank = -1;
          for (const r of swRecs) {
            if (r.sw.prio === undefined || !closed(r)) continue;
            const n = endNet(r.a) || endNet(r.b); if (!n || res.of(n) !== G) continue;
            const rk = r.sw.prio === 0 ? PRIO_MAX + 1 : r.sw.prio;
            if (rk > rank || (rk === rank && pick && r.sw.id < pick.sw.id)) { rank = rk; pick = r; }
          }
          if (pick) { pick.sw.shed = true; dropped = true; }
        }
        if (!dropped) break;
        res = solve();
      }
    }
    // ---- the final grids
    const finalOf = new Map(), finals = [];
    for (const G of res.groups.values()) {
      const all = []; let id = Infinity; for (const b of G.bases) { for (const n of b.nodes) all.push(n); if (b.id < id) id = b.id; }
      const sat = G.demand <= 1e-6 ? (G.supplyEff > 0 ? 1 : 0) : Math.min(1, G.supplyEff / G.demand);
      let bat = 0, batMax = 0, flow = 0; for (const b of G.batts) { bat += b.charge || 0; batMax += battCap(b); flow += (b.cache && b.cache.flow) || 0; }
      // supply is what the grid delivers (generators plus a charged battery covering the gap, nothing at all while a breaker has tripped), gen is the generators' output alone
      // each generator burns its own fuel and puts out its own kW; the grid sums them. `carry` is the part of that output the grid's demand takes (in proportion to output)
      const share = G.trip || G.supply <= 1e-9 ? 0 : Math.min(1, G.demand / G.supply);
      for (const q of G.gens) { q.carry = q.out * share; const k = cacheOf(q.e); k.out = q.out; k.carry = q.carry; k.gens = G.gens.length; }
      const net = { gens: G.gens, nodes: all, supply: G.supplyEff, gen: G.supply, demand: G.demand, sat, cap: G.cap, capEff: G.charged ? Infinity : G.cap, batts: G.batts, breakers: G.breakers, tripped: G.trip, charged: G.charged, bat, batMax, flow, id, hist: this.ringFor(id) };
      finals.push(net);
      for (const b of G.bases) finalOf.set(b, net);
      for (const n of all) { n[NET] = net; n.pw = sat; }
      for (const c of G.fed) c[NET] = net;
    }
    for (const c of consumers) { const b = c[NET]; if (b && finalOf.has(b)) c[NET] = finalOf.get(b); }
    for (const net of finals) net.loads = {};
    for (const c of consumers) { const n = c[NET]; if (!n || !n.loads) continue; const kw = demandOf(c); if (kw > 1e-9) { const lb = loadLabel(c); n.loads[lb] = (n.loads[lb] || 0) + kw; } }   // the grid readout lists the loads by kind
    for (const c of consumers) c.pw = c[NET] ? c[NET].sat : 0;
    for (const r of swRecs) { const h = r.sw[NET] ? finalOf.get(r.sw[NET]) : null; r.sw[NET] = h || null; r.sw.pw = h ? h.sat : 0; r.na = r.a ? r.a[NET] || null : null; r.nb = r.b ? r.b[NET] || null : null; }
    this.swRecs = swRecs;
    for (const c of consumers) if (c.type === 'hlamp') { const n = c[NET], k = cacheOf(c); if (n) { k.sup = n.supply; k.dem = n.demand; k.cap = n.cap; k.tr = n.tripped ? 1 : 0; } else { k.sup = 0; k.dem = 0; k.cap = 0; k.tr = 0; } }   // what the lantern readout says about its grid
    for (const [id] of [...this.rings]) if (!finals.some((n) => n.id === id)) this.rings.delete(id);
    this.nets = finals;
    this.netById = new Map(finals.map((n) => [n.id, n]));
    for (const e of [...P.switches, ...P.batteries, ...P.breakers, ...P.meters]) {
      const n = e[NET] || null, c = cacheOf(e);
      if (n) c.net = n.id; else delete c.net;
      if (e.type === 'meter') e.pw = n ? n.sat : 0;
    }
    this.dirty = false;
  }

  update(dt) {
    this.t -= dt;
    if (this.dirty || this.t <= 0) { this.t = 0.8; this.recompute(); }
    // generators burn fuel
    const T = this.game.T;
    for (const g of this.game.logi.tiles.values()) {
      if (g.type !== 'gen') continue;
      g.fuelCap = genHopper(T, g);
      if (g.burn > 0) g.burn -= dt;
      if (g.burn <= 0 && g.q.length && !this.holdsFuel(g)) {
        // the next plush goes in. A plush that outlasts a frame is the normal case. A big plant can burn one in less than a frame, so it takes
        // as many as it needs to cover this frame and carries the overshoot (g.burn is at most 0 here) into the next one.
        const out = genKw(T, g), lead = g.lit ? Math.min(0, g.burn) : 0;   // the part of the last plush that ran past this frame is not given away twice (a Titan Common lasts 0.11 s: rounding every plush up to whole frames made 4 to 18% free power)
        let tot = 0;
        for (let guard = 0; g.q.length && guard < 256; guard++) {
          const it = g.q.shift();
          const r = species[it.sp] ? species[it.sp].rarity : 0;
          const bt = burnTime(Math.min(3, r), out) || ENERGY_KJ[0] / out;
          if (guard === 0) tot = lead;
          tot += bt;
          g.cur = { sp: it.sp, vr: it.vr };
          if (tot >= dt) break;
        }
        g.burn = tot; g.burnMax = g.burn;
        if (tot >= 1 || !g.lit) this.dirty = true;   // (a plant that burns many plush a second would otherwise re-solve the grid every frame)
      }
      if (g.burn <= 0 && g.lit) { g.lit = false; g.cur = null; this.dirty = true; }
      if (g.burn > 0 && !g.lit) { g.lit = true; this.dirty = true; }
    }
    this.tickParts(dt);
  }

  // A reserve generator (mode 'reserve') keeps its fuel in the hopper until it is needed: a battery of its grid is under 30% charge, or the grid wants more than the generators
  // that burn give and no charged battery covers the gap. An ordinary generator (mode 'auto') burns whenever it has fuel. The plush it already burns is always finished.
  holdsFuel(g) {
    if (g.mode !== 'reserve') return false;
    const net = g[NET]; if (!net) return false;
    if ((net.batts || []).some((b) => battCap(b) > 0 && (b.charge || 0) < 0.3 * battCap(b))) return false;
    return !(!net.charged && net.demand > net.gen + 1e-6);
  }

  // ---------------------------------------------------------------- storage, breakers, history, shed resets (host, every frame)
  tickParts(dt) {
    this._hs = (this._hs || 0) - dt;
    const sample = this._hs <= 0; if (sample) this._hs = HIST_DT;
    for (const net of this.nets) {
      if (sample && net.hist) net.hist.push(net.supply, net.demand);
      if (net.batts.length) this.tickBatteries(net, dt);
      if (net.breakers.length) this.tickBreakers(net, dt);
    }
    if (this.parts && this.parts.switches.length) this.tickShed(dt);
  }

  tickBatteries(net, dt) {
    const bs = net.batts;
    for (const b of bs) cacheOf(b).flow = 0;
    if (net.tripped) return;
    const surplus = net.gen - net.demand;
    if (surplus > 1e-6) {
      const open = bs.filter((b) => b.charge < battCap(b) - 1e-6);
      if (!open.length) return;
      const capSum = open.reduce((a, b) => a + battCap(b), 0);
      for (const b of open) {
        const share = surplus * battCap(b) / capSum, rate = Math.min(share, battRate(b), (battCap(b) - b.charge) / dt);
        if (b.charge <= 0.01 && rate > 0) this.dirty = true;   // it holds charge again: the grid can lean on it
        b.charge = Math.min(battCap(b), b.charge + rate * dt); cacheOf(b).flow = rate;
      }
    } else if (surplus < -1e-6) {
      const have = bs.reduce((a, b) => a + b.charge, 0);
      if (have <= 0.01) return;
      const take = -surplus * dt;
      if (!net.charged) this.dirty = true;
      if (take >= have) { for (const b of bs) { cacheOf(b).flow = -b.charge / dt; b.charge = 0; } this.dirty = true; }   // flat: the grid browns out, trips or sheds
      else { for (const b of bs) { const part = take * b.charge / have; cacheOf(b).flow = -part / dt; b.charge -= part; } if (have - take <= 0.01) this.dirty = true; }
    }
    let bat = 0, flow = 0; for (const b of bs) { bat += b.charge; flow += cacheOf(b).flow; } net.bat = bat; net.flow = flow;
  }

  // over its rating: demand beyond rated generator output x at (a charged battery covers any load, so it never counts as over)
  isOver(net, at) { return (net.cap > 0 || net.batts.length > 0) && net.demand > (net.charged ? Infinity : net.cap) * at + 1e-9; }

  tickBreakers(net, dt) {
    const T = this.game.T;
    if (this.outage) return;
    const tripped = net.breakers.find((b) => b.tripped);
    if (tripped) {
      const c = cacheOf(tripped), at = tripped.trip ? tripped.trip.at : 1;
      if (T.autoReset && !this.isOver(net, at)) { c.cool = (c.cool || 0) + dt; if (c.cool >= AUTO_RESET_BREAKER_S) this.resetBreakers(net); } else c.cool = 0;
      return;
    }
    const armed = net.breakers.filter((b) => b.armed !== false).sort((a, b) => a.id - b.id);
    for (const b of net.breakers) if (b.armed === false) { const c = cacheOf(b); c.over = 0; }
    if (!armed.length) return;
    const pb = armed[0], c = cacheOf(pb), tr = pb.trip || { at: 1, delay: 3 };
    if (this.isOver(net, tr.at)) {
      c.over = (c.over || 0) + dt;
      const need = c.rearm > 0 ? Math.min(tr.delay, TRIP_GRACE_S) : tr.delay;
      if (c.over >= need) { pb.tripped = true; c.over = 0; c.cool = 0; c.rearm = 0; this.dirty = true; this.game.S.stats.pwTrips = (this.game.S.stats.pwTrips || 0) + 1; tripAlert(this.game, pb); }
    } else { c.over = 0; if (c.rearm > 0) c.rearm = Math.max(0, c.rearm - dt); }
  }

  // close every breaker of this grid again (a trip is a grid event, one reset clears the whole grid). Over the rating it trips again after a 1 s grace.
  resetBreakers(net) {
    for (const b of net.breakers) { b.tripped = false; const c = cacheOf(b); c.over = 0; c.cool = 0; c.rearm = TRIP_GRACE_S; }
    this.dirty = true;
  }
  netOfEnt(e) { return (e && e[NET]) || null; }

  // would closing this shed switch again keep both of its grids fed? (their supply covers their demand together)
  canClose(sw) {
    const r = (this.swRecs || []).find((x) => x.sw === sw); if (!r) return false;
    const T = this.game.T, na = r.na, nb = r.nb;
    const nets = new Set([na, nb].filter(Boolean)); if (!nets.size) return false;
    let sup = 0, dem = 0; for (const n of nets) { sup += n.gen; dem += n.demand; }
    for (const o of [r.a, r.b]) if (o && !o[NET] && o.type !== 'switch') { dem += isEarth(o.type) ? earthDemand(T, o, DEMAND[o.type]) : isCatalogConsumer(o.type) ? catalogKw(this.game, o) : (DEMAND[o.type] ?? 1); }
    const charged = [...nets].some((n) => n.charged);
    return sup + 1e-9 >= dem || charged;
  }

  tickShed(dt) {
    const T = this.game.T;
    for (const sw of this.parts.switches) {
      const c = cacheOf(sw);
      if (!sw.shed || !T.autoReset) { c.cool = 0; continue; }
      if (this.canClose(sw)) { c.cool = (c.cool || 0) + dt; if (c.cool >= AUTO_RESET_SHED_S) { sw.shed = false; c.cool = 0; this.dirty = true; } } else c.cool = 0;
    }
  }

  // ---------------------------------------------------------------- the 0.5 s row a guest receives (host) and applies (guest)
  packRow() {
    const P = this.parts, n = P ? P.switches.length + P.batteries.length + P.breakers.length + P.meters.length : 0;
    if (!n) {
      if (this.dirty) return null;   // a solve is pending: say nothing now, the grids go out with the next row
      if (!this.nets.length) { if (!this._rowHad) return null; this._rowHad = false; return { n: [], e: [] }; }   // (a world of generators, poles and cables sends its grids too: a guest reads them)
    }
    this._rowHad = true;
    const r2 = (v) => Math.round(v * 100) / 100;
    const nets = this.nets.slice(0, 200).map((t) => [t.id, r2(t.supply), r2(t.demand), r2(t.cap), Math.round(t.sat * 100), t.tripped ? 1 : 0, Math.round(t.bat || 0), Math.round(t.batMax || 0), r2(t.flow || 0), t.nodes.slice(0, 80).map((x) => x.id), Object.entries(t.loads || {}).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, r2(v)]), Object.keys(t.loads || {}).length, (t.gens || []).slice(0, 40).map((q) => [q.e.id, r2(q.out), r2(q.carry)]), r2(t.gen)]);   // [12] the generators: id, output, the part of it the grid takes. [13] their summed output   // [10] the biggest eight loads, [11] how many kinds there are in all (the readout says "and N more kinds")
    const ents = [];
    for (const e of [...P.switches, ...P.batteries, ...P.breakers, ...P.meters]) {
      const c = e.cache || {};
      ents.push([e.id, Math.round((e.pw || 0) * 100), (e.on ? 1 : 0) | (e.shed ? 2 : 0) | (e.tripped ? 4 : 0), Math.round(e.charge || 0), r2(c.flow || 0), c.net === undefined ? -1 : c.net, c.over > 0 ? 1 : 0]);
    }
    return { n: nets, e: ents };
  }

  applyRow(d) {
    if (!d || !Array.isArray(d.n) || !Array.isArray(d.e)) return;
    const g = this.game, nets = [];
    const entOf = (id) => g.logi.byId.get(id) || (g.machines.items.get(id) || {}).ent || null;
    for (const a of d.n) {
      if (!Array.isArray(a) || a.length < 10) continue;
      const nodes = (Array.isArray(a[9]) ? a[9] : []).map(entOf).filter(Boolean);
      const net = { id: a[0], supply: a[1], demand: a[2], cap: a[3], sat: a[4] / 100, tripped: !!a[5], bat: a[6], batMax: a[7], flow: a[8], nodes, batts: nodes.filter((n) => n.type === 'battery'), breakers: nodes.filter((n) => n.type === 'breaker'), charged: a[6] > 0.01 };
      net.capEff = net.charged ? Infinity : net.cap; net.gen = Number.isFinite(a[13]) ? a[13] : net.supply;
      net.gens = []; if (Array.isArray(a[12])) for (const q of a[12]) { if (!Array.isArray(q) || !Number.isFinite(q[1]) || !Number.isFinite(q[2])) continue; const ge = entOf(q[0]); if (ge) net.gens.push({ e: ge, out: q[1], carry: q[2] }); } net.loads = Object.create(null); if (Array.isArray(a[10])) for (const q of a[10]) if (Array.isArray(q) && typeof q[0] === 'string' && Number.isFinite(q[1])) net.loads[q[0]] = q[1]; net.loadKinds = Number.isInteger(a[11]) && a[11] >= 0 && a[11] < 1000 ? a[11] : Object.keys(net.loads).length;
      net.hist = this.ringFor(net.id); net.hist.push(net.supply, net.demand);
      nets.push(net);
    }
    this.nets = nets; this.netById = new Map(nets.map((n) => [n.id, n]));
    for (const id of [...this.rings.keys()]) if (!this.netById.has(id)) this.rings.delete(id);
    for (const a of d.e) {
      if (!Array.isArray(a) || a.length < 7) continue;
      const it = g.machines.items.get(a[0]); if (!it) continue;
      const e = it.ent, was = e.tripped === true;
      e.pw = a[1] / 100; e.on = (a[2] & 1) === 1; e.shed = (a[2] & 2) === 2; e.tripped = (a[2] & 4) === 4;
      if (e.type === 'battery') e.charge = a[3];
      const c = cacheOf(e); c.flow = a[4]; if (a[5] >= 0) c.net = a[5]; else delete c.net; c.over = a[6];
      if (e.tripped && !was) tripAlert(g, e);
    }
  }

  // status for the HUD: the grid the player stands nearest to
  nearest(px, py, pz) {
    let best = null, bd = 40 * 40;
    for (const net of this.nets) for (const n of net.nodes) {
      const [x, y, z] = this.pos(n);
      const d = (x - px) ** 2 + (z - pz) ** 2 + (y - py) ** 2;
      if (d < bd) { bd = d; best = net; }
    }
    return best;
  }
}
