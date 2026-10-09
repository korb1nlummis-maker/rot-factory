// Shared wiring helpers for tests (no default export, so the self test loader skips this file). Power travels only through Power Cables (cables.js), so a test that
// builds a grid lays the cables itself. wire(a, b) lays one cable (a cable item is added first, the result of the connect is returned), wireTo(hub, ...list) lays a
// cable from a hub to each, and wireNear(hub, radius) is the legacy shortcut for a test that places a pole beside machines it expects the pole to feed: one cable from the
// hub to every machine within `radius` metres that has none yet (a belt line gets one in all).
import { wireable, isNodeType } from '../cables.js';
import { maxPorts } from '../powerparts.js';

export function makeWiring(ctx) {
  const { g, S, L } = ctx;
  const idOf = (e) => (e && typeof e === 'object' ? e.id : e);
  const wire = (a, b) => { if (g.cables.find(idOf(a), idOf(b))) return { ok: true, existed: true };   // (an existing cable is kept: g.cables.connect would take it down)
    S().items.cable = (S().items.cable || 0) + 1; const r = g.cables.connect(idOf(a), idOf(b)); if (!r.ok) S().items.cable--; g.power.markDirty(); return r; };
  const wireTo = (hub, ...list) => { for (const e of list) { const r = wire(hub, e); if (!r.ok) throw new Error('wire: ' + r.why); } };
  const wireNear = (hubOrList, radius = 8) => {   // a pole, or a list of poles: the first one in range that still has a free socket
    const hubs = Array.isArray(hubOrList) ? hubOrList : [hubOrList], out = [];
    for (const e of [...L().tiles.values(), ...[...g.machines.items.values()].map((it) => it.ent)]) {
      if (!wireable(e) || isNodeType(e.type) || e.type === 'charger' || g.cables.of(e.id).length) continue;
      const [x, y, z] = g.cables.attach(e);
      for (const hub of hubs) {
        if (e === hub || g.cables.of(hub.id).length >= maxPorts(hub, g)) continue;
        const [hx, hy, hz] = g.cables.attach(hub); if (Math.hypot(x - hx, z - hz) > radius || Math.abs(y - hy) > 6) continue;
        if (wire(hub, e).ok) { out.push(e); break; }
      }
    }
    g.power.markDirty(); return out;
  };
  return { wire, wireTo, wireNear };
}
