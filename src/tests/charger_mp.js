import { sp, kit } from './charger_lib.js';
// Charging Station in co-op: the host simulates, the guest sees the tile, its charge and its hopper, and feeds it through the host.
export default async function (ctx) {
  const { T, g, S, L, fresh, placeAtFloor, tiles, species } = ctx;
  const { run, json, feed } = kit(ctx);
  const up = { crew: 1 };
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (fn) => async () => { try { return await fn(); } finally { done(); g.crewViews = new Map(); } };
  const mk = async (x = -3.4, z = 3.0) => { fresh(up); const r = await placeAtFloor('charger', x, z, 2.0); if (!r.ok) throw new Error(r.why); return tiles().find((t) => t.type === 'charger'); };

  await T('crew.charger-mp-guest-gets-the-tile-from-the-host-with-a-mesh-and-an-empty-hopper', guard(async () => {
    fresh(up); role('host'); cap(); const r = await placeAtFloor('charger', -3.4, 3.0, 2.0); if (!r.ok) return r.why;
    const plus = ofType('ent+').find((m) => m.ent.type === 'charger'); if (!plus) return 'no ent+ for the charger';
    if (plus.ent.q) return 'the hopper contents travel in the placement message'; const id = plus.ent.id;
    done(); fresh(up); role('guest'); g.netMessage(json(plus)); const t = L().byId.get(id);
    return (t && t.type === 'charger' && t.view && Array.isArray(t.q) && t.reserve === 0 && L().objs.has(id) && L().objs.get(id).getObjectByName('coil')) || 'guest copy incomplete';
  }));
  await T('crew.charger-mp-guest-sees-the-hosts-charge-and-hopper-and-the-same-readout', guard(async () => {
    const t = await mk(); feed(t, [3, 2, 1]); run(0.25); t.q.push({ sp: sp(0), vr: 0 }, { sp: sp(0), vr: 0 }); const hostRes = t.reserve, hostN = t.q.length; const hostInfo = g.chargerInfo(t).lines.join('|');
    role('host'); cap(); g.sendDyn(); const dyn = ofType('dyn')[0]; done(); if (!dyn) return 'no dyn'; const row = dyn.tiles.find((r) => r[0] === t.id);
    if (!row || row[9] !== Math.round(hostRes * 100) || row[7] !== hostN) return 'row ' + JSON.stringify(row) + ` reserve ${hostRes} hopper ${hostN}`;
    t.reserve = 0; t.q.length = 0; role('guest'); g.applyDyn(json(dyn)); done();
    if (Math.abs(t.reserve - hostRes) > 0.006 || t.q.length !== hostN) return `guest reserve ${t.reserve} hopper ${t.q.length}`;
    const guestInfo = g.chargerInfo(t).lines.join('|'); return guestInfo === hostInfo || `readouts differ: ${hostInfo} / ${guestInfo}`;
  }));
  await T('crew.charger-mp-guest-hand-feeding-goes-through-the-host-and-the-surplus-comes-back', guard(async () => {
    const t = await mk(); g.T.carry = 30; role('guest'); cap(); S().carry = [{ sp: sp(0), vr: 0 }, { sp: sp(4), vr: 0 }, { sp: sp(3), vr: 0 }]; g.useTile(t);
    const c = ofType('cmd').find((m) => m.c === 'tile'); if (!c) return 'no tile command';
    if (c.d.items.length !== 2 || S().carry.length !== 1 || species[S().carry[0].sp].rarity !== 4) return `sent ${c.d.items.length}, kept ${S().carry.length} (the legendary stays in the guest's hands)`;
    if (t.q.length) return 'the guest changed the hopper itself'; done();
    role('host'); cap(); for (let n = 0; n < 11; n++) t.q.push({ sp: sp(0), vr: 0 }); g.netCmd('tile', c.d); const back = ofType('give')[0];
    return (t.q.length === 12 && back && back.items.length === 1) || `host hopper ${t.q.length}, returned ${back && back.items.length}`;
  }));
  await T('crew.charger-mp-host-runs-the-hopper-and-the-guest-copy-never-digests', guard(async () => {
    const t = await mk(); feed(t, [2]); role('guest'); g.logi.visualOnly = true; run(2); const gu = t.reserve; g.logi.visualOnly = false; done(); run(1);
    return (gu === 0 && Math.abs(t.reserve - 1.5) < 1e-9) || `guest digested ${gu}, host ${t.reserve}`;
  }));
}
