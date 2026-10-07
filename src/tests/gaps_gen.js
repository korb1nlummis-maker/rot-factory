// gaps.gen.*: the generator RESERVE mode (spec 4.3 f): a reserve generator keeps its fuel in the hopper until a battery of its grid is under 30% charge or the grid is overloaded,
// an AUTO generator burns whenever it has fuel (as always). E with empty hands switches the mode; the mode saves, copies, reaches the guest and shows in the hover text.
import { makeKit } from './power_lib.js';
import * as PP from '../powerparts.js';
import { pools } from '../plushdata.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, adv, p, V3 } = ctx;
  const K = makeKit(ctx);
  const { reset, grid, part, tile, netOf } = K;
  const COMMON = pools[0][0];
  const fuel = (n = 6) => Array.from({ length: n }, () => ({ sp: COMMON, vr: 0 }));
  const reserveGen = (x, z, mode = 'reserve', n = 6) => tile('gen', x, z, { q: fuel(n), mode });
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { g.keys = {}; g.stowed = true; S().carry = []; } });
  const burning = (t) => (t.burn || 0) > 0;

  await guard('gaps.gen.a-reserve-generator-holds-its-fuel-while-a-charged-battery-covers-the-grid', async () => {
    reset(); const bad = [], G = grid(-8, 3, { fans: 2 }), rg = reserveGen(-9.2, 3), batt = part('battery', -6.4, 3, { mark: 1, charge: 0 });
    batt.charge = 0.8 * PP.battCap(batt); g.power.markDirty(); adv(2);
    if (burning(rg) || rg.q.length !== 6) bad.push(`it burned with a charged battery: burn ${rg.burn}, hopper ${rg.q.length}`);
    if (!K.allPowered(G, 0.95)) bad.push('the battery should carry the fans: ' + K.nearFans(G));
    batt.charge = 0.1 * PP.battCap(batt); g.power.markDirty(); adv(1.5);
    if (!burning(rg)) bad.push('it did not start when the battery fell under 30%');
    if (rg.q.length !== 5) bad.push('it should have taken one plush: ' + rg.q.length);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.gen.a-reserve-generator-burns-when-the-grid-is-overloaded-and-not-when-another-covers-it', async () => {
    reset(); const bad = [];
    const A = grid(-8, 3, { fans: 3 }), rg = reserveGen(-9.2, 3);   // 6 kW wanted, nothing else supplies it
    g.power.markDirty(); adv(1.5); if (!burning(rg)) bad.push('an overloaded grid did not wake the reserve generator');
    if (!K.allPowered(A, 0.95)) bad.push('the fans stayed dark: ' + K.nearFans(A));
    reset(); const B = grid(-8, 3, { fans: 2 }), main = K.gen(-9.2, 3), spare = reserveGen(-10.1, 3); void main;   // 4 kW wanted, a full generator burns (8 kW)
    g.power.markDirty(); adv(2); if (burning(spare) || spare.q.length !== 6) bad.push('the reserve generator burned although the other one covers the grid: ' + spare.burn);
    if (!K.allPowered(B, 0.95)) bad.push('grid B lost power');
    // a grid with no demand at all: nothing to hold for, it keeps its fuel
    reset(); grid(-8, 3, { fans: 0 }); const idle = reserveGen(-9.2, 3); g.power.markDirty(); adv(1.5); if (burning(idle)) bad.push('a reserve generator burned for no load');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.gen.an-auto-generator-burns-as-it-always-did', async () => {
    reset(); const bad = []; grid(-8, 3, { fans: 1 }); const ag = reserveGen(-9.2, 3, 'auto'), plain = tile('gen', -10.1, 3, { q: fuel(4) });
    g.power.markDirty(); adv(1.5); if (!burning(ag)) bad.push('an auto generator held its fuel'); if (!burning(plain)) bad.push('a generator without a mode held its fuel');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.gen.e-with-empty-hands-switches-the-mode-and-e-with-plush-still-feeds', async () => {
    reset(); const bad = [], t = tile('gen', -9.2, 3, { q: [] }); S().carry = [];
    g.useTile(t); if (t.mode !== 'reserve') bad.push('empty hands E: mode ' + t.mode);
    g.useTile(t); if (t.mode !== 'auto') bad.push('second E: mode ' + t.mode);
    g.useTile(t); S().carry = [{ sp: COMMON, vr: 0 }, { sp: COMMON, vr: 0 }]; g.useTile(t);
    if (t.q.length !== 2 || t.mode !== 'reserve') bad.push(`feeding: hopper ${t.q.length}, mode ${t.mode}`);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('gaps.gen.the-hover-text-names-the-mode-and-the-mode-copies-and-saves', async () => {
    reset(); const bad = [], t = tile('gen', -9.2, 3, { q: fuel(3), mode: 'reserve' }), u = tile('gen', -10.4, 3, { q: [] });
    g.power.markDirty(); adv(0.3);
    const info = infoFor(g, { kind: 'tile', id: t.id }), txt = info.lines.join(' | '); if (!/RESERVE/.test(txt) || !/holding its fuel|burning now/.test(txt)) bad.push('reserve hover: ' + txt);
    const a = infoFor(g, { kind: 'tile', id: u.id }).lines.join(' | '); if (!/AUTO/.test(a)) bad.push('auto hover: ' + a);
    // copy and paste between generators
    const c = g.copyCfg(t); if (!c) bad.push('nothing was copied'); const pr = g.pasteCfg(u); if (!pr.ok || u.mode !== 'reserve') bad.push('paste: ' + (pr.why || u.mode));
    // a bad value is refused
    const r = g.setCfg(u, { mode: 'turbo' }); if (r.ok) bad.push('an unknown mode was accepted');
    // saves with the entity
    const ent = S().entities.find((e) => e.id === t.id); if (!ent || ent.mode !== 'reserve') bad.push('the saved entity lost the mode: ' + (ent && ent.mode));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.gaps.the-generator-mode-reaches-the-guest-in-the-dyn-row-and-the-hover-matches', async () => {
    reset(); const bad = [], t = tile('gen', -9.2, 3, { q: fuel(3), mode: 'reserve' });
    const sent = []; g.netSend = (m) => { sent.push(JSON.parse(JSON.stringify(m))); }; g.net.open = true; g.net.role = 'host'; g.remote = { pos: new V3(-100, 0, 0), update() {} };
    try {
      g.sendDyn(); const dyn = sent.find((m) => m.t === 'dyn'); const row = dyn && dyn.tiles.find((a) => a[0] === t.id); if (!row || row[3] !== 'reserve') bad.push('the row carries ' + (row && row[3]));
      const hostInfo = JSON.stringify(infoFor(g, { kind: 'tile', id: t.id }));
      delete g.netSend; g.net.role = 'guest'; g.guestReady = true; t.mode = undefined; g.netMessage(JSON.parse(JSON.stringify(dyn)));
      if (t.mode !== 'reserve') bad.push('the guest mode ' + t.mode);
      const guestInfo = JSON.stringify(infoFor(g, { kind: 'tile', id: t.id })); const strip = (s2) => s2.replace(/Hopper[^"]*"/, '"');
      if (!/RESERVE/.test(guestInfo)) bad.push('the guest hover does not name the mode: ' + guestInfo);
      void hostInfo; void strip;
    } finally { delete g.netSend; g.net.open = false; g.net.role = null; g.guestReady = false; g.remote = null; g.netOut.length = 0; }
    return bad.length === 0 || bad.join(' || ');
  });
}
