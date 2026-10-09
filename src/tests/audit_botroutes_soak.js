// botroutes.audit.soak.*: more seeds and more kinds of event than botroutes.soak: bots that vanish and arrive, batteries that die, chargers taken down and put back, the player's own charge
// order, saves that load mid-trip. Plush is conserved, no slot is over-taken (two bots a station), no hopper is over-promised, no bot is under the floor or floats, no call outlives 150 s,
// and when the events stop every bot is on the ground with no call left. Run: `await __selftest('botroutes.audit.soak')`
import { kit, RT } from './botroutes_lib.js';

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export default async function (ctx) {
  const { g, S, L } = ctx;
  const X = kit(ctx), C = 0.6, NAV = X.NAV;
  const I0 = () => ctx.toI(-9), K0 = () => ctx.toK(2);
  const arena = (P, ramps) => { X.clearAbove(P.i0 - 9, P.k0 - 3, 16, 12, 6); X.fence(P.pad, undefined, ramps); };

  for (const seed of [5, 29, 101]) await X.guard(`botroutes.audit.soak.seed-${seed}-keeps-every-invariant-and-ends-on-the-ground`, async (toasts) => {
    const R = rng(seed);
    const P = await X.platform2(I0(), K0()); arena(P, [P.ramp, P.ramp2]);
    const ramps = { a: P.ramp, b: P.ramp2 };
    const gens = [X.gen(P.i0 + 1, P.k0 + 1, 1), X.gen(P.i0 + 2, P.k0 + 2, 1)], floor = X.gen(P.i0 - 8, P.k0 + 8, 0);
    let chs = [X.charger(P.i0 + 2, P.k0 + 1, 1, { reserve: 6 }), X.charger(P.i0 - 6, P.k0 + 6, 0, { reserve: 5 })];
    const bots = []; for (let n = 0; n < 8; n++) { const b = X.mkBot(X.cellX(P.i0 - 7 - (n % 3) * 0.5), X.cellZ(P.k0 + 1 + (n >> 1)), 0.02); b.carry = X.mix(4); bots.push(b); }
    let sold = 0; const sa = g.sellAuto.bind(g); g.sellAuto = (spv, vr, n, id) => { sold += n || 1; return sa(spv, vr, n, id); };
    let spent = 0; const acc0 = g.logi.accept.bind(g.logi); g.logi.accept = (t, it, x) => { const r = acc0(t, it, x); if (r && t.type === 'charger') spent++; return r; };
    const cnt = () => { let n = 0; for (const t of L().tiles.values()) if (t.type === 'gen' && t.q && !t.rig) n += t.q.length; for (const q of S().crew) n += q.carry.length; return n; };
    let total = cnt(); const bad = []; let lastEv = '';
    const callAge = new Map();
    const check = (tag) => {
      if (cnt() + sold + spent !== total && !dev) bad.push(`${tag} (${lastEv}): plush ${cnt()} + sold ${sold} + charger ${spent} != ${total}`);
      const seen = new Set();
      for (const c of S().botCalls) { if (seen.has(c.b)) bad.push(`${tag}: two calls for bot ${c.b}`); seen.add(c.b); if (!S().crew.some((q) => q.id === c.b)) bad.push(`${tag}: call of a bot that is gone ${c.b}`); }
      for (const t of L().tiles.values()) {
        if (t.type === 'charger') {
          if (t.reserve < -1e-6 || t.reserve > 8 + 1e-6 || !Number.isFinite(t.reserve)) bad.push(`${tag}: reserve ${t.reserve}`);
          const on = S().crew.filter((q) => q.chg === t.id && (q.state === 'chgwalk' || q.state === 'recharge')).length; if (on > 2) bad.push(`${tag} (${lastEv}): ${on} bots on charger ${t.id}`);
        }
        if (t.type === 'gen' && t.q.length > 50) bad.push(`${tag}: hopper ${t.q.length}`);
      }
      for (const b of S().crew) {
        if (!(b.battery >= -0.01 && b.battery <= 1.0001)) bad.push(`${tag}: battery ${b.battery}`);
        if (!Number.isFinite(b.x + b.y + b.z) || b.y < -0.5) bad.push(`${tag}: bot at ${b.x},${b.y},${b.z}`);
        const gap = b.y - X.support(b.x, b.y, b.z); if (gap > 0.9 && NAV.elevated(g.crew, b) && !NAV.codeOf(b)) bad.push(`${tag}: bot ${gap.toFixed(2)} m over its floor`);
      }
      for (const c of S().botCalls) { const k = c.b + ':' + c.id; if (!callAge.has(k)) callAge.set(k, g.time); else if (g.time - callAge.get(k) > 150 && !dev) bad.push(`${tag}: call ${k} (${c.k} ${c.ph}) is ${(g.time - callAge.get(k)).toFixed(0)} s old`); }
      for (const k of [...callAge.keys()]) if (!S().botCalls.some((c) => c.b + ':' + c.id === k)) callAge.delete(k);
    };
    const ev = async (n) => {
      const b = bots[(R() * bots.length) | 0], r = R(); lastEv = r.toFixed(2) + ' bot ' + b.id + ' ' + b.state;
      if (r < 0.10) { const k = R() < 0.5 ? 'a' : 'b'; const e = ramps[k]; if (e && S().entities.some((q) => q.id === e.id)) { g.doDecon({ kind: 'mach', id: e.id }); ramps[k] = null; } }
      else if (r < 0.20) { if (!ramps.a) { const q = await X.K.put('wramp', P.pad.i0 - 2, P.pad.k0 + 1, { dir: 0, back: 2.6 }); if (q.ok) ramps.a = q.made[0]; } else if (!ramps.b) { const q = await X.K.put('wramp', P.pad.i0 + 1, P.pad.k0 + 5, { dir: 3, back: 2.6 }); if (q.ok) ramps.b = q.made[0]; } }
      else if (r < 0.30) { const t = gens[(R() * gens.length) | 0]; if (t.q.length > 5) { const k = t.q.length - 5; total -= k; t.q.length = 5; } else { const k = 40 - t.q.length; for (let q = 0; q < k; q++) t.q.push({ sp: X.sp(0), vr: 0 }); total += k; } }
      else if (r < 0.40) { b.battery = R() < 0.3 ? 0 : 0.1 + R() * 0.12; }
      else if (r < 0.47) { const o = R(); if (o < 0.34) g.crew.follow(b); else if (o < 0.67) g.crew.stand(b); else g.crew.sendHome(b); }
      else if (r < 0.52) { const c = chs[(R() * chs.length) | 0]; if (L().byId.get(c.id)) { const it = g.crew.intent(b, { k: 'tile', id: c.id }); if (it.ok) g.crew.command(b, { k: 'tile', id: c.id }, true); } }
      else if (r < 0.62) { if (b.carry.length < 6 && b.state === 'idle') { const k = 3 + ((R() * 4) | 0); b.carry.push(...X.mix(k)); total += k; g.crew.goHome(b); } }
      else if (r < 0.67) { b.state = 'idle'; }
      else if (r < 0.75) {   // a save that loads
        const j = JSON.parse(JSON.stringify({ crew: S().crew, calls: S().botCalls })); S().crew.length = 0; for (const q of j.crew) S().crew.push(q); S().botCalls = j.calls;
        for (const q of S().crew) NAV.resetBot(q); g.crew.sync(); NAV.invalidate('load'); bots.splice(0, bots.length, ...S().crew);
      }
      else if (r < 0.80) {   // a bot is lost, and a new one comes (its plush goes with the old one)
        if (bots.length > 4) { total -= b.carry.length; S().crew.splice(S().crew.indexOf(b), 1); bots.splice(bots.indexOf(b), 1); }
        else { const nb = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2), 0.02); nb.carry = X.mix(3); total += 3; bots.push(nb); }
      }
      else if (r < 0.86) { const t = gens[(R() * gens.length) | 0]; if (L().byId.get(t.id)) { total -= t.q.length; const i = t.i, k = t.k; L().remove(t); S().entities = S().entities.filter((e) => e.id !== t.id); g._fuelMach = null; gens[gens.indexOf(t)] = X.gen(i, k, 1); } }
      else if (r < 0.92) { const c = chs[(R() * chs.length) | 0]; const n0 = chs.indexOf(c); if (L().byId.get(c.id)) { const i = c.i, k = c.k, j = c.j; L().remove(c);   // (what a station holds was counted as spent when it was handed over)
           S().entities = S().entities.filter((e) => e.id !== c.id); g._fuelMach = null; chs[n0] = X.charger(i, k, j, { reserve: 2 + R() * 6 }); } }
      else { for (const q of bots) if (q.state === 'idle' && q.battery < 0.3) q.battery = 0.5; }
    };
    let snap = null, dev = null;
    const last = new Map();
    const descr = () => S().crew.map((q) => `${q.id}:${q.state}/${q.carry.length}/${q.y.toFixed(1)}${q.fuelJob ? 'j' + q.fuelJob.id + 'n' + q.fuelJob.n : ''}`).join(' ') + ' | ' + [...L().tiles.values()].filter((t) => t.type === 'gen' || t.type === 'charger').map((t) => `${t.type[0]}${t.id}:${t.q.length}`).join(' ') + ' sold ' + sold + ' spent ' + spent;
    const frame = () => { if (dev) return; for (const q of S().crew) { const n0 = last.get(q.id); if (n0 !== undefined && q.carry.length > n0) total += q.carry.length - n0; last.set(q.id, q.carry.length); } const now = cnt() + sold + spent; if (now !== total && snap) dev = `frame deviation ${now} vs ${total} at t=${g.time.toFixed(2)} (${lastEv}); before: ${snap}; after: ` + descr(); snap = descr(); };
    for (let n = 0; n < 90; n++) { await ev(n); for (const q of S().crew) last.set(q.id, q.carry.length); for (let q = 0; q < 3; q++) { X.run(1.0, frame); check(`event ${n}`); } if (bad.length > 4 || dev) break; }
    if (dev) bad.unshift(dev);
    if (!ramps.a) { const q = await X.K.put('wramp', P.pad.i0 - 2, P.pad.k0 + 1, { dir: 0, back: 2.6 }); if (q.ok) ramps.a = q.made[0]; }
    for (const q of S().crew) { if (q.battery < 0.3) q.battery = 0.5; }
    X.run(240, () => { frame(); return S().crew.every((q) => NAV.isGround(q) && !RT.callOf(g, q) && (q.state === 'idle' || q.state === 'lowbat')); });
    check('end');
    delete g.sellAuto; delete g.logi.accept;
    if (bad.length) return bad.slice(0, 5).join(' | ');
    const up = S().crew.filter((q) => !NAV.isGround(q)); if (up.length) return `${up.length} bots still up: ` + up.map((q) => `${q.state}@${q.y.toFixed(1)}`).join() + ' ' + X.dump() + ' ' + toasts.slice(-3).join(' / ');
    if (S().botCalls.length) return 'calls left ' + X.dump();
    return g.botnav.stats().said <= S().crew.length * 2 || 'said ' + g.botnav.stats().said;
  });
}
