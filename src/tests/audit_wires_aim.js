// audit wires (aim): every machine takes its own cable, so the cable tool has to be able to aim at every machine that draws power, wherever it is wide (a door leaf, a jump pad,
// a truck dock, a giant arch pillar). The hammer finds those by their shape; the cable tool must find at least what the hammer finds. Prefix `wires.audit.aim.`.
import { kit, UP } from './transit_lib.js';
import * as ARCH from '../arches.js';

export default async function (ctx) {
  const { T, g, S, adv, aimPoint, toI, toK, cellX, cellZ, V3, p, fresh } = ctx;
  const X = kit(ctx);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { X.clean(); } });
  const eyeDir = () => [p().eyePos(new V3()), p().forward(new V3())];
  // aim at a point of the machine from `back` metres west of it; the hammer is the oracle for "this point is on the machine"
  const aim = (x, y, z, back = 2.6) => { aimPoint(x, y, z, back); adv(0.05); const [eye, dir] = eyeDir(); return { hammer: g.findDeconRef(), cable: g.cables.findTarget(eye, dir, 8) }; };
  const check = (label, e, points, bad) => {
    for (const [x, y, z, back] of points) {
      const r = aim(x, y, z, back);
      if (!r.hammer || r.hammer.id !== e.id) { bad.push(`${label}: setup, the hammer does not find it at ${[x, y, z].map((v) => v.toFixed(2))}`); continue; }
      if (!r.cable || r.cable.id !== e.id) bad.push(`${label}: the cable tool cannot aim at it at ${[x, y, z].map((v) => v.toFixed(2))} (finds ${r.cable ? r.cable.type : 'nothing'}) though the hammer can`);
    }
  };

  await guard('wires.audit.aim.a-door-a-jump-pad-and-a-dock-take-a-cable-aimed-at-their-edge', async () => {
    X.setup({ ...UP, trucks: 1, truckDock: 1 }); const bad = [];
    const D = X.door(toI(-20), toK(4), { ax: 'z' });
    check('door', D, [[D.px, 0.7, D.pz + 1.05, 2.8], [D.px, 1.9, D.pz - 1.05, 2.8]], bad);
    const J = X.jump(toI(-12), toK(4));
    const jx = cellX(J.i0) + 0.3, jz = cellZ(J.k0) + 0.3;
    check('jump pad', J, [[jx + 0.6, 0.05, jz + 0.6, 2.4], [jx + 1.5, 0.05, jz + 1.5, 3]], bad);
    const DK = g.placeEntity('dock', { ax: 'x', i0: toI(-6), k0: toK(2), j: 0 }, { quiet: true });
    if (DK) { const y = DK.j * 0.6 + 0.05; check('dock', DK, [[cellX(DK.i0) + 0.1, y, cellZ(DK.k0) + 0.1, 3], [cellX(DK.i0 + 5) - 0.1, y, cellZ(DK.k0 + 3) - 0.1, 3]], bad); } else bad.push('no dock was placed');
    return bad.length === 0 || bad.join('; ');
  });

  await guard('wires.audit.aim.a-giant-arch-takes-a-cable-aimed-at-its-pillar', async () => {
    X.setup({ ...UP, frames: 1 }); const bad = [];
    const ent = { id: g.nextId(), type: 'garch', axis: 'x', gm: toI(-6), glo: toK(3), gj: 0, span: 6, mat: 'timber' }; S().entities.push(ent); g.addEntity(ent);
    const E = g.machines.items.get(ent.id).ent; void ARCH;
    check('arch', E, [[E.cx - E.d / 2 - 0.02, 1.4, E.cz + E.w / 2 - 0.2, 3], [E.cx - E.d / 2 - 0.02, 1.4, E.cz - E.w / 2 + 0.2, 3]], bad);
    void fresh; void S;
    return bad.length === 0 || bad.join('; ');
  });
}
