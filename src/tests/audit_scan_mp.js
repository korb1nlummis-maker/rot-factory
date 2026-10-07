// mp.scan.audit.*: guest and host divergence for the Vehicle Scanner wave, no network (one page plays both roles, see vscan_mp.js).
// A friend's E on a digger or a truck that holds The One goes through the host's `earth` command: the friend has to stand there. Run: `await __selftest('mp.scan.audit.')`
import { makeKit } from './addons_lib.js';
import * as VS from '../vehiclescan.js';
import { EARTH } from '../earth.js';
import { NEEDLE } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, V3, fresh, toI, toK, cellX, cellZ } = ctx;
  const K = makeKit(ctx);
  const UP = { detector: 1, archGate: 1, archGiant: 1, vscan: 1, power: 1, belts: 1, truck: 1, excavator: 1 };
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => {
    const fn0 = g.foundNeedle, mode0 = g.mode, remote0 = g.remote;
    try { g.mode = 'play'; return await fn(); } finally { done(); g.foundNeedle = fn0; g.remote = remote0; g.mode = mode0 === 'ended' ? 'play' : mode0; S().found = false; S().ending = null; S().needleLost = false; g.alarmGate = null; }
  });
  const mkEarth = (kind, i, k, extra = {}) => {
    const spec = EARTH[kind];
    const ent = { id: g.nextId(), type: kind, i, j: 0, k, dx: 1, dz: 0, x: cellX(i), y: 0, z: cellZ(k), hy: spec.hy, hr: spec.hr, ...(spec.dig ? { hop: [], hn: 0, steps: 0, dug: 0, state: 'idle' } : { px: cellX(i), pz: cellZ(k), cargo: [], cn: 0, route: [], seg: 0, trips: 0, state: 'idle', job: 0, yaw: 0 }), ...extra };
    S().entities.push(ent); g.addEntity(ent); return ent;
  };
  const gone = (e) => { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } S().entities = S().entities.filter((x) => x.id !== e.id); };

  for (const kind of ['truck', 'excavator']) {
    await guard(`mp.scan.audit.a-friend-far-from-a-${kind}-cannot-take-the-one-from-it-with-an-earth-command`, async () => {
      fresh(UP); const bad = [], b = g.hall.binPos; K.clearBay(); role('host'); cap();
      const e = mkEarth(kind, toI(b.x + 6), toK(b.z + 8)); const flat = [3, 0, NEEDLE, 0, 3, 0]; if (kind === 'truck') { e.cargo = flat; e.cn = 3; } else { e.hop = flat; e.hn = 3; }
      const cmd = { t: 'cmd', c: 'earth', d: { id: e.id, room: 5 } }, has = () => VS.hasOne(kind === 'truck' ? e.cargo : e.hop), px = e.px ?? e.x, pz = e.pz ?? e.z;
      g.remote = null; g.netMessage(json(cmd)); if (!has() || ofType('give').length) bad.push('taken with no friend present');
      g.remote = { pos: new V3(px + 90, 0, pz) }; g.netMessage(json(cmd)); if (!has() || ofType('give').length) bad.push('taken by a friend 90 m away');
      g.remote = { pos: new V3(px, 40, pz) }; g.netMessage(json(cmd)); if (!has() || ofType('give').length) bad.push('taken by a friend 40 m above');
      g.remote = { pos: new V3(px - 3, 0, pz) }; sent.length = 0; g.netMessage(json(cmd));
      const give = ofType('give')[0]; if (!give || !give.items.some((x) => x.sp === NEEDLE)) bad.push('a friend standing next to it did not get The One: ' + JSON.stringify(give));
      if (has()) bad.push('The One is still aboard after the friend took it');
      gone(e); return bad.length === 0 || bad.join(' || ');
    });
  }

  await guard('mp.scan.audit.a-guest-cannot-clear-the-host-alarm-with-a-forged-xrow-message', async () => {
    fresh(UP); const bad = []; K.clearBay(); role('host'); cap();
    const clearAt = (x, z) => { const w = g.world, i0 = toI(x), k0 = toK(z); for (let a = -8; a <= 8; a++) for (let c = -8; c <= 8; c++) for (let j = 0; j < 13; j++) if (w.get(i0 + a, j, k0 + c)) w.removeCell(i0 + a, j, k0 + c, false); };
    clearAt(-8, 3); const l = VS.layout(g, 'z', toK(3), toI(-8) - 5, 0); if (!l.ok) return 'layout ' + l.why; const e = g.placeEntity('vscan', l.ent); VS.raise(g, e, { sp: NEEDLE, vr: 0 });
    for (const m of [{ t: 'xrow', k: 'vscan', d: { al: { [e.id]: 0 } } }, { t: 'xrow', k: 'vscan', d: { ld: { [e.id]: 99 }, k: 'clear', by: 'h', id: e.id } }]) { try { g.netMessage(json(m)); } catch (x) { bad.push('threw: ' + x.message); } }
    const still = [...g.machines.items.values()].map((i) => i.ent).find((x) => x.id === e.id);
    if (!still || !still.alarm || !still.held) bad.push('a guest message cleared the host alarm');
    return bad.length === 0 || bad.join(' || ');
  });
}
