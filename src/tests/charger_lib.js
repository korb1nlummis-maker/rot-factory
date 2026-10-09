// Shared helpers for the charger_* and botcmd_* tests (no default export, so the loader skips it).
import { pools } from '../plushdata.js';

export const sp = (r) => pools[r][0];

// A live grid for one Charging Station: a full, burning generator three cells off with one Power Cable to the station (the generator is full so no bot is sent to fuel it), the grid solved.
// `rig: true` marks the generator as test scaffolding (the plush counters skip it). Returns the generator. Taking the cable down (`g.cables.connect` on the same pair, or the hammer) makes the station dead again.
export function liveGrid(ctx, t, o = {}) {
  const { g, S, L } = ctx;
  for (const [di, dk] of [[0, 3], [0, -3], [3, 0], [-3, 0], [0, 4], [4, 0]]) {
    const i = t.i + di, k = t.k + dk, j = t.j + (o.air ? 8 : 0); if (L().tileAt(i, j, k)) continue;   // (`air`: eight cells up, where nothing walks, for the tests that watch bots)
    const e = { id: g.nextId(), type: 'gen', rig: true, i, j, k, dir: 0, rise: 0, q: Array.from({ length: 50 }, () => ({ sp: sp(0), vr: 0 })), burn: 1e6, burnMax: 1e6, lit: true };
    S().entities.push(e); g.addEntity(e); const gen = L().byId.get(e.id);
    const pws = o.solve === false ? [...L().tiles.values(), ...[...g.machines.items.values()].map((it) => it.ent)].map((x) => [x, x.pw]) : null;
    S().items.cable = (S().items.cable || 0) + 1; const r = g.cables.connect(gen.id, t.id); if (pws) for (const [x, pw] of pws) x.pw = pw; if (!r.ok) { S().items.cable--; throw new Error('liveGrid: ' + r.why); }
    g.power.markDirty(); if (o.solve === false) t.pw = 1; else g.power.recompute(); return gen;   // (`solve: false` leaves the other machines' power alone: a test that sets power by hand)
  }
  throw new Error('liveGrid: no free cell beside the station');
}

export function kit(ctx) {
  const { g, S, p, L, THREE, aimPoint, spot, dig, cellX, cellZ } = ctx;
  const look = (x, y, z, back = 2.0) => { aimPoint(x, y, z, back); g.renderer.camera.position.copy(p().eyePos(new THREE.Vector3())); };
  // a tile dropped straight into the world (no floor or aim rules), the way a saved game would bring it back. A Charging Station is a normal machine now (it works only with a cable
  // from a live grid), so rawTile gives every charger its own live grid (`live`) unless the test passes `unwired: true`.
  const rawTile0 = (type, i, j, k, extra = {}) => { const e = { id: g.nextId(), type, i, j, k, dir: 0, rise: 0, items: [], ...extra }; S().entities.push(e); g.addEntity(e); return L().byId.get(e.id); };
  const live = (t) => liveGrid(ctx, t);
  const rawTile = (type, i, j, k, extra = {}) => { const { unwired, ...rest } = extra; const t = rawTile0(type, i, j, k, rest); if (type === 'charger' && !unwired) live(t); return t; };
  // the crew and the belts run, nothing else (no collapses, no player)
  const run = (sec, dt = 0.05, each) => { for (let n = 0; n < sec / dt; n++) { g.time += dt; g.crew.update(dt, g.time); g.logi.update(dt); if (each && each(n) === true) break; } };
  const feed = (t, rs) => { for (const r of rs) if (!g.logi.accept(t, { sp: sp(r), vr: 0 }, null)) return false; return true; };
  // a straight tunnel into the slope on a lane that has one; other lanes are tried when the terrain is not suitable
  const tunnel = (len = 40, lanes = [12, 8, 16, 20, 4, 24, 28, 32]) => {
    for (const lane of lanes) {
      try { const { i, k } = spot(lane); dig(i, k - 1, len, 5, 4, false); return { i, k: k + 1 }; } catch (e) { /* try the next lane */ }
    }
    throw new Error('no lane with a slope mouth');
  };
  const mkBot = (x, z, y = 0.3) => { const b = g.crew.spawn(); b.x = x; b.z = z; b.y = y; b.vy = 0; b.battery = 1; return b; };
  // a bot in the middle of a dig order in the tunnel: origin at the mouth, trail every cell out to the face
  const digging = (tun, cells, battery) => {
    const b = mkBot(cellX(tun.i + cells), cellZ(tun.k));
    b.state = 'farm'; b.dir = 0; b.origin = [cellX(tun.i), cellZ(tun.k)]; b.trail = []; for (let n = 1; n <= cells; n++) b.trail.push([cellX(tun.i + n), cellZ(tun.k)]);
    b.faceCell = { i: tun.i + cells + 1, j: 0, k: tun.k }; b.timer = 0.5; b.battery = battery;
    return b;
  };
  const json = (m) => JSON.parse(JSON.stringify(m));
  return { look, rawTile, rawTile0, live, run, feed, tunnel, mkBot, digging, json };
}
