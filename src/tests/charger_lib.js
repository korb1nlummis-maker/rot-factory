// Shared helpers for the charger_* and botcmd_* tests (no default export, so the loader skips it).
import { pools } from '../plushdata.js';

export const sp = (r) => pools[r][0];

export function kit(ctx) {
  const { g, S, p, L, THREE, aimPoint, spot, dig, cellX, cellZ } = ctx;
  const look = (x, y, z, back = 2.0) => { aimPoint(x, y, z, back); g.renderer.camera.position.copy(p().eyePos(new THREE.Vector3())); };
  // a tile dropped straight into the world (no floor or aim rules), the way a saved game would bring it back
  const rawTile = (type, i, j, k, extra = {}) => { const e = { id: g.nextId(), type, i, j, k, dir: 0, rise: 0, items: [], ...extra }; S().entities.push(e); g.addEntity(e); return L().byId.get(e.id); };
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
  return { look, rawTile, run, feed, tunnel, mkBot, digging, json };
}
