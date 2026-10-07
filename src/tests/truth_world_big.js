// In-world keys, part 8: E on the big machines (Vehicle Scanner, Detector Arch, Portal, Haul Truck) as the controls table words it. Real key presses.
import { makeKit } from './addons_lib.js';
import { makeKit as makePortalKit, UP as PORTAL_UP } from './portal_lib.js';
import * as VS from '../vehiclescan.js';
import { NEEDLE } from '../plushdata.js';
import { EARTH } from '../earth.js';
import { makeIO, clearBay } from './truth_world_lib.js';
export default async function (ctx) {
  const { T, g, S, p, fresh, adv, toI, toK, cellX, cellZ, aimPoint, V3 } = ctx;
  const K = makeKit(ctx);
  const io = makeIO(ctx);
  const guard = (name, fn) => T(name, async () => { const f0 = g.foundNeedle, m0 = g.mode; try { g.mode = 'play'; return await fn(); } finally { g.foundNeedle = f0; g.mode = m0 === 'ended' ? 'play' : m0; S().found = false; S().ending = null; S().needleLost = false; g.keys = {}; g.stowed = true; g.ui.closeModals(); g.alarmGate = null; } });
  const look = (x, y, z, back = 2.4) => { aimPoint(x, y, z, back); adv(0.06); };

  await guard('truth.world.keys-e-on-a-vehicle-scanner-that-holds-the-one-takes-it-out-and-the-alarm-stops', async () => {
    fresh({ detector: 1, archGate: 1, archGiant: 1, vscan: 1, power: 1, belts: 1 }); clearBay(ctx); const bad = [];
    const w = g.world, x = -8, z = 4, i0 = toI(x), k0 = toK(z); for (let a = -8; a <= 8; a++) for (let b = -8; b <= 8; b++) for (let j = 0; j < 13; j++) { const i = i0 + b, k = k0 + a; if (w.get(i, j, k)) w.removeCell(i, j, k, false); }
    const l = VS.layout(g, 'z', k0, i0 - 5, 0); if (!l.ok) return 'layout ' + l.why; const e = g.placeEntity('vscan', { ...l.ent }); adv(0.1); e.pw = 1;
    let won = 0; g.foundNeedle = () => { won++; }; e.alarm = true; e.held = { sp: NEEDLE, vr: 0 }; adv(0.2);
    const sx = e.cx ?? x, sz = e.cz ?? z; look(sx, 1.0, sz, 3.0); io.tap('KeyE'); adv(0.1);
    if (!won) bad.push('E at the scanner did not take The One: ' + io.hint()); if (e.alarm || e.held) bad.push('the alarm did not stop');
    g.doDecon({ kind: 'mach', id: e.id });
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-e-on-a-haul-truck-that-ran-out-of-battery-spends-a-charge-pack-and-on-a-working-one-parks-it', async () => {
    fresh({ power: 1, belts: 1, truck: 1, excavator: 1, haulRoad: 1, truckDock: 1, steel: 1 }); clearBay(ctx); const bad = [];
    const spec = EARTH.truck, i = toI(-8), k = toK(2); const e = { id: g.nextId(), type: 'truck', i, j: 0, k, dx: 1, dz: 0, x: cellX(i), y: 0, z: cellZ(k), hy: spec.hy, hr: spec.hr, px: cellX(i), pz: cellZ(k), cargo: [], cn: 0, route: [], seg: 0, trips: 0, state: 'dead', job: 0, yaw: 0, batt: 0 }; S().entities.push(e); g.addEntity(e);
    S().items.chargepack = 2; look(e.px, spec.hy || 1, e.pz, 3.0); io.tap('KeyE'); if (e.state === 'dead' || S().items.chargepack !== 1) bad.push(`E on a dead truck with a Charge Pack: state ${e.state}, packs ${S().items.chargepack}`);
    e.state = 'idle'; e.batt = 1e6; io.clearHint(); io.tap('KeyE'); if (!e.off) bad.push('E on a working truck did not park it: ' + io.hint()); io.tap('KeyE'); if (e.off) bad.push('E again did not send it back to work');
    g.doDecon({ kind: 'mach', id: e.id });
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-e-on-a-detector-arch-opens-its-target-panel-and-esc-closes-it', async () => {
    fresh({ detector: 1, archGate: 1, power: 1, belts: 1 }); clearBay(ctx); const bad = [];
    const r = await K.put('arch', { x: -8, z: 3, dir: 0 }); if (!r.ok) return 'arch: ' + r.why; const e = r.ent; const it = g.machines.items.get(e.id);
    look(it.obj.position.x, 1.0, it.obj.position.z, 3.0); io.tap('KeyE'); if (g.ui.openModal !== 'archPanel') bad.push('E on the arch opened "' + g.ui.openModal + '"');
    io.tap('Escape'); if (g.ui.openModal === 'archPanel') bad.push('Esc did not close the panel');
    g.doDecon({ kind: 'mach', id: e.id });
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-e-on-a-portal-parks-it-and-starts-it-again', async () => {
    const X = makePortalKit(ctx); await ctx.newWorld(); fresh({ ...PORTAL_UP }); g.T = g.tune(); const bad = [];
    const st = X.site({ span: 6, len: 40 }); const e = X.mouth(st, 'steel'); if (!e.pd) return 'no portal direction at the mouth';
    X.run(0.5); const it = g.machines.items.get(e.id); const px = (e.cx ?? it.obj.position.x), pz = (e.cz ?? it.obj.position.z);
    look(px, 1.0, pz, 3.0); const was = !!e.off; io.tap('KeyE'); if (!!e.off === was) bad.push('E on the portal did not switch it (' + io.hint() + ')'); io.tap('KeyE'); if (!!e.off !== was) bad.push('E again did not switch it back');
    X.gone(e);
    return bad.length === 0 || bad.join('; ');
  });
}
