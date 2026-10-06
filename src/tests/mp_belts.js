// Multiplayer parity for belts, no network: one page plays both roles by switching g.net.role and capturing g.netSend.
// The host builds and simulates, the guest only draws what it is told. Everything the host shows must reach the guest.
import { pools } from '../plushdata.js';
import { infoFor } from '../info.js';
import { HAND_CRANK } from '../logistics.js';

export default async function (ctx) {
  const { T, g, S, p, L, fresh, tiles, toI, toK, cellX, cellZ } = ctx;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = async (fn) => { try { return await fn(); } finally { done(); } };
  const bareTest = (name, fn) => T(name, () => guard(fn));
  const clear = () => { for (const t of tiles()) { L().remove(t); } S().entities = S().entities.filter((e) => !(e.type === 'belt')); L().rebuildBelts(); };
  const bp = () => g.hall.binPos;
  // an L shaped line a few metres from the bin: three east, then it turns and runs south
  const path = () => { const b = bp(); const x0 = b.x - 3.0, z0 = b.z + 3.0; return [[x0, z0, 0], [x0 + 0.6, z0, 0], [x0 + 1.2, z0, 0], [x0 + 1.8, z0, 3], [x0 + 1.8, z0 - 0.6, 3], [x0 + 1.8, z0 - 1.2, 3]]; };
  const lay = (cells) => { clear(); for (const [x, z, d] of cells) g.layBelt(toI(x), 0, toK(z), d); L().rebuildBelts(); };
  const at = (x, z) => tiles().find((t) => t.i === toI(x) && t.k === toK(z));
  const run = (secs) => { L().visualOnly = g.isGuest(); for (let n = 0; n < secs * 10; n++) { g.time += 0.1; L().update(0.1); } L().visualOnly = false; };
  // move the host world onto the guest: drop every belt, replay what the host announced
  const toGuest = (msgs) => { done(); clear(); role('guest'); cap(); for (const m of msgs) g.netMessage(json(m)); };
  const items = () => { const a = []; L().forEachItem((it, x, y, z) => a.push([+x.toFixed(3), +y.toFixed(3), +z.toFixed(3)])); return a; };

  await bareTest('mp.belts.guest-aimed-belt-near-the-bin-is-built-by-the-host-facing-the-bin', async () => {
    fresh({ belts: 1 }); clear(); g.craftItem('belt', 3); const b = bp(); const a = { x: b.x - 2.4, z: b.z };
    role('guest'); cap(); p().yaw = Math.PI; // the guest looks the wrong way on purpose; the bin aim must still win
    g.plan = L().plan('belt', { x: a.x, y: 1.6, z: a.z - 1.5 }, { x: 0, y: -0.7, z: 0.7 }, Math.PI, 0); if (!g.plan.ok) return 'guest plan failed: ' + g.plan.why;
    const n0 = S().entities.length; g.placeCurrent({ id: 'belt', kind: 'belt' }); const c = sent.find((m) => m.t === 'cmd' && m.c === 'place');
    if (!c || S().entities.length !== n0) return 'guest did not only send a command: ' + JSON.stringify(c);
    if (c.d.ent.dir !== 0) return 'guest sent dir ' + c.d.ent.dir + ' instead of the bin direction 0';
    done(); role('host'); cap(); g.netMessage(json(c)); const plus = ofType('ent+').find((m) => m.ent.type === 'belt');
    if (!plus || plus.ent.dir !== 0) return 'host did not announce the belt: ' + JSON.stringify(sent.map((m) => m.t));
    toGuest([plus]); const t = L().byId.get(plus.ent.id); return (t && t.view && t.dir === 0) || 'guest copy missing or wrong dir';
  });

  await bareTest('mp.belts.corner-pieces-form-on-the-guest-the-same-as-on-the-host', async () => {
    fresh({ belts: 1 }); role('host'); cap(); lay(path());
    const hostCorner = tiles().find((t) => t.type === 'belt' && t.cd != null); if (!hostCorner) return 'host built no corner';
    const hv = { id: hostCorner.id, dir: hostCorner.dir, cd: hostCorner.cd, n: L().cornerN, count: L().bedMesh.count };
    const plus = ofType('ent+'); if (plus.length !== 6) return 'host announced ' + plus.length + ' belts instead of 6';
    // replay in reverse order: a corner must not depend on which piece arrives first, and the guest rebuilds on its own
    toGuest(plus.slice().reverse()); L().update(0.05);
    const gc = L().byId.get(hv.id); if (!gc) return 'guest has no corner tile';
    return (gc.cd === hv.cd && gc.dir === hv.dir && L().cornerN === hv.n && L().bedMesh.count === hv.count) || `guest cd ${gc.cd} corners ${L().cornerN} beds ${L().bedMesh.count}, host ${JSON.stringify(hv)}`;
  });

  await bareTest('mp.belts.removing-a-piece-on-the-host-removes-the-corner-on-the-guest', async () => {
    fresh({ belts: 1 }); role('host'); cap(); lay(path()); const plus = ofType('ent+').map(json); const corner = tiles().find((t) => t.cd != null);
    toGuest(plus); L().update(0.05); if (L().cornerN !== 1) return 'guest corners ' + L().cornerN;
    const feeder = tiles().find((t) => t.i === corner.i - 1 && t.k === corner.k); g.netMessage({ t: 'ent-', id: feeder.id }); L().update(0.05);
    return (L().cornerN === 0 && L().byId.get(corner.id).cd == null) || 'corner stayed after its feeder was removed: ' + L().cornerN;
  });

  await bareTest('mp.belts.items-sit-at-the-same-spot-on-both-screens-around-the-bend', async () => {
    fresh({ belts: 1 }); role('host'); cap(); lay(path()); const corner = tiles().find((t) => t.cd != null);
    const pre = at(bp().x - 3 + 1.2, bp().z + 3); pre.items.push({ sp: pools[0][0], vr: 0, t: 0.8 }); corner.items.push({ sp: pools[0][1], vr: 0, t: 0.2 }); corner.items.push({ sp: pools[0][2], vr: 0, t: 0.45 });
    p().pos.set(bp().x - 2, 0, bp().z + 3); const plus = ofType('ent+').map(json); sent = []; g.remote = { pos: p().pos.clone() }; g.sendDyn(); g.remote = null; const dyn = json(ofType('dyn')[0]); const hostPos = items();
    if (hostPos.length !== 3) return 'host has ' + hostPos.length + ' items';
    toGuest(plus); L().update(0.05); g.applyDyn(dyn); const guestPos = items(); if (guestPos.length !== 3) return 'guest sees ' + guestPos.length + ' items';
    for (let n = 0; n < 3; n++) for (let q = 0; q < 3; q += 2) if (Math.abs(hostPos[n][q] - guestPos[n][q]) > 0.02) return `item ${n} differs: host ${hostPos[n]} guest ${guestPos[n]}`;
    return true;
  });

  await bareTest('mp.belts.guest-moves-items-at-the-hosts-speed-whether-powered-or-hand-cranked', async () => {
    fresh({ belts: 1 }); lay([[bp().x - 3, bp().z + 3, 0], [bp().x - 2.4, bp().z + 3, 0]]); const h = at(bp().x - 3, bp().z + 3); p().pos.set(cellX(h.i), 0, cellZ(h.k));
    const probe = (pw) => {
      done(); role('host'); cap(); h.halt = false; h.pw = pw; h.items = [{ sp: pools[0][0], vr: 0, t: 0 }]; g.remote = { pos: p().pos.clone() }; g.sendDyn(); g.remote = null; const dyn = json(ofType('dyn')[0]);
      const hostItem = h.items[0]; run(0.4); const hostT = hostItem.t;
      done(); role('guest'); h.pw = undefined; h.halt = false; h.items = []; g.applyDyn(dyn); const gi = h.items[0]; if (!gi) return { hostT, guestT: -1 }; run(0.4); return { hostT, guestT: gi.t };
    };
    const bad = []; const full = probe(1); if (Math.abs(full.hostT - full.guestT) > 0.08) bad.push(`powered: host ${full.hostT.toFixed(2)} guest ${full.guestT.toFixed(2)}`);
    const crank = probe(0); if (Math.abs(crank.hostT - crank.guestT) > 0.08) bad.push(`unpowered: host ${crank.hostT.toFixed(2)} guest ${crank.guestT.toFixed(2)}`);
    if (!(crank.hostT > 0.15 && crank.hostT < full.hostT * HAND_CRANK + 0.05)) bad.push('hand crank speed off: ' + crank.hostT);
    return bad.length === 0 || bad.join('; ');
  });

  await bareTest('mp.belts.guest-hover-text-matches-the-host-for-power-and-bends', async () => {
    fresh({ belts: 1 }); role('host'); cap(); lay(path()); const corner = tiles().find((t) => t.cd != null); const empty = at(bp().x - 3, bp().z + 3); const plus = ofType('ent+').map(json);
    corner.pw = 1; empty.pw = 1; // powered by a pole, and empty so only the power sync can tell the guest
    p().pos.set(bp().x - 2, 0, bp().z + 3); sent = []; g.remote = { pos: p().pos.clone() }; g.sendDyn(); g.remote = null; const dyn = json(ofType('dyn')[0]);
    const hostC = infoFor(g, { kind: 'tile', id: corner.id }).lines.join('|'), hostE = infoFor(g, { kind: 'tile', id: empty.id }).lines.join('|');
    toGuest(plus); L().update(0.05); g.applyDyn(dyn);
    const gc = infoFor(g, { kind: 'tile', id: corner.id }).lines.join('|'), ge = infoFor(g, { kind: 'tile', id: empty.id }).lines.join('|');
    return (gc === hostC && ge === hostE && /Powered/.test(ge) && /Bends here/.test(gc)) || `corner "${gc}" vs "${hostC}"; empty "${ge}" vs "${hostE}"`;
  });

  await bareTest('mp.belts.a-halted-line-stops-on-the-guest-too', async () => {
    fresh({ belts: 1 }); role('host'); cap(); lay(path()); const first = at(bp().x - 3, bp().z + 3); const plus = ofType('ent+').map(json); first.items.push({ sp: pools[0][0], vr: 0, t: 0.1 }); first.halt = true; first.pw = 1;
    p().pos.set(bp().x - 2, 0, bp().z + 3); sent = []; g.remote = { pos: p().pos.clone() }; g.sendDyn(); g.remote = null; const dyn = json(ofType('dyn')[0]);
    toGuest(plus); L().update(0.05); g.applyDyn(dyn); const t = L().byId.get(first.id); const t0 = t.items[0].t; run(1); return (Math.abs(t.items[0].t - t0) < 0.01) || `item crept from ${t0} to ${t.items[0].t} on the guest`;
  });

  await bareTest('mp.belts.sale-at-the-bin-pays-the-host-and-the-guest-wallet-and-popup-follow', async () => {
    fresh({ belts: 1 }); role('host'); cap(); lay(path()); S().money = 100; const start = at(bp().x - 3, bp().z + 3); start.items.push({ sp: pools[1][0], vr: 0, t: 0 }); run(40);
    const left = tiles().reduce((a, t) => a + t.items.length, 0); if (left || S().money <= 100) return `plush left ${left}, host money ${S().money}`;
    const earned = S().money - 100; sent = []; g.sendShared(); const sh = json(ofType('shared')[0]); done(); role('guest'); S().money = 100; const gains = []; const og = g.ui.gain; g.ui.gain = (v) => gains.push(v);
    g.applyShared(sh); g.ui.gain = og; return (S().money === sh.money && gains.length === 1 && gains[0] === earned) || `guest money ${S().money} vs ${sh.money}, popups ${gains} (earned ${earned})`;
  });

  await bareTest('mp.belts.guest-never-sells-or-moves-items-off-the-end-by-itself', async () => {
    fresh({ belts: 1 }); role('host'); cap(); lay(path()); const plus = ofType('ent+').map(json); toGuest(plus); const last = tiles().find((t) => t.i === toI(bp().x - 3 + 1.8) && t.k === toK(bp().z + 3 - 1.2));
    last.items.push({ sp: pools[1][0], vr: 0, t: 0.99 }); last.pw = 1; S().money = 100; run(3);
    return (S().money === 100 && last.items.length === 1) || `guest sold: money ${S().money}, items ${last.items.length}`;
  });
}
