import * as THREE from 'three';
import { C, cellX, cellZ } from './config.js';
import { species } from './plushdata.js';

// ---------------------------------------------------------------------------------------------------
// Power. Generators burn plush for energy, Power Poles carry it, machines must stand near a pole or
// generator that is linked into a grid. A grid that cannot meet demand browns out: everything on it slows.
// ---------------------------------------------------------------------------------------------------
const NET = Symbol('net');
export const DEMAND = { belt: 0.03, sorter: 1.2, mech: 3.5, borer: 12, claw: 2.5, fan: 2, beacon: 0.6 };
export const ENERGY_KJ = [100, 220, 500, 1200, 3000, 8000, 0]; // per plush by rarity
export const FUEL_MAX_RARITY = 2;                                // generators only take Common..Rare

export class Power {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.nets = [];          // { nodes:[ent], supply, demand, sat }
    this.line = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7ad7ff, transparent: true, opacity: 0.55 }));
    this.line.frustumCulled = false;
    game.renderer.scene.add(this.line);
    this.dirty = true;
  }

  clear() { this.nets = []; this.dirty = true; }
  markDirty() { this.dirty = true; }

  pos(e) {
    if (e.i !== undefined && e.type !== 'claw' && e.type !== 'borer' && e.type !== 'beacon') return [cellX(e.i), e.j * C + 1.0, cellZ(e.k)];
    return [e.x ?? cellX(e.i), (e.y ?? e.j * C) + 1.0, e.z ?? cellZ(e.k)];
  }

  // supply of one generator right now (kW)
  genOutput(g) { return g.burn > 0 ? this.game.T.genOutput : 0; }

  recompute() {
    const game = this.game, T = game.T;
    const tiles = [...game.logi.tiles.values()];
    const nodes = tiles.filter((t) => t.type === 'gen' || t.type === 'pole');
    const consumers = [];
    for (const t of tiles) if (t.type === 'belt' || t.type === 'sorter' || t.type === 'mech' || t.type === 'fan') consumers.push(t);
    for (const it of game.machines.items.values()) {
      const e = it.ent;
      if (e.type === 'claw' || e.type === 'borer' || e.type === 'beacon') consumers.push(e);
    }
    // union-find over nodes linked within pole range
    const parent = nodes.map((_, i) => i);
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const link2 = T.poleLink * T.poleLink;
    const np = nodes.map((n) => this.pos(n));
    const segs = [];
    for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
      const dx = np[a][0] - np[b][0], dz = np[a][2] - np[b][2], dy = np[a][1] - np[b][1];
      if (dx * dx + dz * dz + dy * dy <= link2) { parent[find(a)] = find(b); segs.push(a, b); }
    }
    const nets = new Map();
    nodes.forEach((n, i) => {
      const r = find(i);
      if (!nets.has(r)) nets.set(r, { nodes: [], supply: 0, demand: 0, sat: 1, cap: 0 });
      const net = nets.get(r); net.nodes.push(n);
      if (n.type === 'gen') { net.cap += T.genOutput; net.supply += this.outage ? 0 : this.genOutput(n); }
      n[NET] = net;
    });
    const reach2 = T.poleReach * T.poleReach;
    for (const c of consumers) {
      c[NET] = null; c.pw = 0;
      const [x, y, z] = this.pos(c);
      let best = 1e12;
      for (let i = 0; i < nodes.length; i++) {
        const dx = x - np[i][0], dz = z - np[i][2], dy = y - np[i][1];
        const d = dx * dx + dz * dz + dy * dy * 0.5;
        if (d <= reach2 && d < best) { best = d; c[NET] = nodes[i][NET]; }
      }
      if (c[NET]) c[NET].demand += DEMAND[c.type] ?? 1;
    }
    for (const net of nets.values()) net.sat = net.demand <= 1e-6 ? (net.supply > 0 ? 1 : 0) : Math.min(1, net.supply / net.demand);
    for (const c of consumers) c.pw = c[NET] ? c[NET].sat : 0;
    for (const n of nodes) n.pw = n[NET] ? n[NET].sat : 0;
    this.nets = [...nets.values()];
    // cables
    const arr = new Float32Array(segs.length * 3);
    for (let s = 0; s < segs.length; s++) { const p = np[segs[s]]; arr[s * 3] = p[0]; arr[s * 3 + 1] = p[1] + 1.1; arr[s * 3 + 2] = p[2]; }
    this.line.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.line.geometry.computeBoundingSphere();
    this.dirty = false;
  }

  update(dt) {
    this.t -= dt;
    if (this.dirty || this.t <= 0) { this.t = 0.8; this.recompute(); }
    // generators burn fuel
    const T = this.game.T;
    for (const g of this.game.logi.tiles.values()) {
      if (g.type !== 'gen') continue;
      g.fuelCap = T.genBuffer;
      if (g.burn > 0) g.burn -= dt;
      if (g.burn <= 0 && g.q.length) {
        const it = g.q.shift();
        const r = species[it.sp] ? species[it.sp].rarity : 0;
        g.burn = ENERGY_KJ[Math.min(5, r)] / T.genOutput;
        g.burnMax = g.burn;
        this.dirty = true;
      }
      if (g.burn <= 0 && g.lit) { g.lit = false; this.dirty = true; }
      if (g.burn > 0 && !g.lit) { g.lit = true; this.dirty = true; }
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
