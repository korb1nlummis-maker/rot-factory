import { sp, kit } from './charger_lib.js';
// Bots and the Charging Station: low battery sends a bot to the nearest charger that still has charge (closer than the bin, within 400 m),
// it tops up at 0.5 battery per second out of the station's reserve, then walks back to its dig. A dry station means the old way: home.
export default async function (ctx) {
  const { T, g, S, fresh, tiles, cellX, cellZ, toI, toK } = ctx;
  const { rawTile, run, tunnel, mkBot, digging } = kit(ctx);
  const up = { crew: 1 };
  // the states a bot passes through, collapsed (stop: a state name that ends the run once it is reached after `after`)
  const states = (b, sec, extra, stop) => { const seen = []; let over = false; run(sec, 0.05, (n) => { if (seen[seen.length - 1] !== b.state) seen.push(b.state); if (extra) extra(n); if (stop && (stop === 'lowbat' || seen.includes('recharge')) && b.state === stop) over = true; return over; }); return seen; };

  await T('crew.charger-low-battery-bot-walks-to-a-charger-recharges-and-resumes-its-dig', async () => {
    fresh(up); const tun = tunnel(40); const ch = rawTile('charger', tun.i + 26, 0, tun.k); ch.reserve = 5;
    const b = digging(tun, 30, 0.1); b.carry = [{ sp: sp(0), vr: 0 }, { sp: sp(2), vr: 0 }, { sp: sp(1), vr: 0 }]; const money = S().money;
    const t0 = g.time; const seen = states(b, 40, null, 'farm');
    const want = ['chgwalk', 'recharge', 'goto']; let at = -1; for (const w of want) { at = seen.indexOf(w, at + 1); if (at < 0) return `states ${seen}`; }
    if (seen.includes('return') || seen.includes('unload')) return 'went home instead: ' + seen;
    if (seen[seen.length - 1] !== 'farm') return 'did not resume digging: ' + seen;
    if (b.battery < 0.9) return `battery ${b.battery} states ${seen} t ${g.time - t0}`; if (!(ch.reserve < 5 - 0.7 && ch.reserve > 5 - 1.0)) return 'reserve used ' + (5 - ch.reserve);
    return (b.carry.length === 3 && S().money === money) || `cargo ${b.carry.length}, money ${S().money - money}`;
  });
  await T('crew.charger-takes-reserve-at-half-a-battery-per-second', async () => {
    fresh(up); const tun = tunnel(40); const ch = rawTile('charger', tun.i + 10, 0, tun.k); ch.reserve = 8;
    const b = mkBot(cellX(tun.i + 10) - 0.8, cellZ(tun.k)); b.state = 'recharge'; b.chg = ch.id; b.battery = 0.2; b.chgNext = 'idle';
    run(1.0); const gain = b.battery - 0.2, spent = 8 - ch.reserve; b.state = 'idle'; b.x = cellX(tun.i + 30);
    if (Math.abs(gain - 0.5) > 0.03) return 'battery gain per second ' + gain; if (Math.abs(gain - spent) > 1e-9) return `battery ${gain} but reserve ${spent}`;
    const b2 = mkBot(cellX(tun.i + 10) - 0.8, cellZ(tun.k)); b2.state = 'recharge'; b2.chg = ch.id; b2.battery = 0.2; ch.reserve = 0.1; run(3, 0.05, () => ch.reserve < 1e-6);
    return (Math.abs(ch.reserve) < 1e-6 && Math.abs(b2.battery - 0.3) < 0.02) || `with 0.1 left: battery ${b2.battery} reserve ${ch.reserve}`;
  });
  await T('crew.charger-empty-station-sends-the-bot-home-to-wait-at-the-bin', async () => {
    fresh(up); const tun = tunnel(40); const ch = rawTile('charger', tun.i + 26, 0, tun.k); ch.reserve = 0.04; // below the 0.05 that counts as having charge
    const b = digging(tun, 30, 0.1); const seen = states(b, 140, null, 'lowbat'); const h = g.crew.home();
    if (seen.includes('chgwalk') || seen.includes('recharge')) return 'used an empty charger: ' + seen;
    if (seen[1] !== 'return' && seen[0] !== 'return') return 'did not head home: ' + seen; if (!seen.includes('unload') || seen[seen.length - 1] !== 'lowbat') return 'did not unload and wait: ' + seen;
    return Math.hypot(b.x - h.x, b.z - h.z) < 6 || 'waiting far from the bin';
  });
  await T('crew.charger-running-dry-mid-charge-waits-at-the-empty-station-then-goes-on-when-fed', async () => {
    fresh(up); const tun = tunnel(40); const ch = rawTile('charger', tun.i + 26, 0, tun.k); ch.reserve = 0.1;
    const b = digging(tun, 30, 0.1); const seen = states(b, 40, null, 'lowbat'); if (seen.join() !== 'farm,advance,chgwalk,recharge,lowbat' && !/chgwalk,recharge,lowbat$/.test(seen.join())) return 'states ' + seen;
    if (ch.reserve > 0.001) return 'reserve ' + ch.reserve; if (seen.includes('return')) return 'went home: ' + seen;
    const at = b.battery; run(5); const near = Math.hypot(b.x - cellX(ch.i), b.z - cellZ(ch.k)) < 3; if (!near || Math.abs(b.battery - at - 0.1) > 0.02) return `waiting: near ${near}, trickle ${b.battery - at} in 5 s`;
    if (!/^Waiting for a Charging Station/.test(g.crew.statusLine(b))) return g.crew.statusLine(b);
    ch.reserve = 5; const s2 = states(b, 30, null, 'farm'); return (s2.includes('chgwalk') && s2.includes('recharge') && b.battery > 0.9) || `after feeding: ${s2} battery ${b.battery}`;
  });
  await T('crew.charger-dry-station-hands-over-to-another-station-with-charge', async () => {
    fresh(up); const tun = tunnel(40); const a = rawTile('charger', tun.i + 26, 0, tun.k); a.reserve = 0.2; const c = rawTile('charger', tun.i + 20, 0, tun.k); c.reserve = 5;
    const b = digging(tun, 30, 0.1); const seen = states(b, 40, null, 'farm'); const first = seen.filter((s) => s === 'chgwalk').length;
    return (first >= 2 && c.reserve < 4.5 && b.battery > 0.9 && !seen.includes('return') && !seen.includes('unload')) || `states ${seen} second reserve ${c.reserve} battery ${b.battery}`;
  });
  await T('crew.charger-a-charger-farther-than-the-bin-is-ignored-and-so-is-one-past-400-m', async () => {
    fresh(up); const b = mkBot(0, 40); b.y = 0; const h = g.crew.home(); const dh = Math.hypot(b.x - h.x, b.z - h.z);
    const far = rawTile('charger', toI(b.x + dh + 6), 0, toK(b.z)); far.reserve = 8; if (g.crew.chargerFor(b) !== far) return 'the bin no longer charges, so a station farther than it still counts';
    far.reserve = 8; const near = rawTile('charger', toI(b.x + dh - 8), 0, toK(b.z)); near.reserve = 8; if (g.crew.chargerFor(b) !== near) return 'did not choose the closer charger';
    near.reserve = 0.03; if (g.crew.chargerFor(b) !== far) return 'chose a nearly empty one'; near.reserve = 8;
    const e = rawTile('charger', toI(b.x + dh - 12), 0, toK(b.z)); e.reserve = 0; const pick = g.crew.chargerFor(b); if (pick !== near) return 'an empty charger beat a stocked one';
    // range: a bot 2 km out. 350 m away counts, 450 m does not (the bin is 2 km away, so only the range cap stops it)
    for (const t of [far, near, e]) { g.logi.remove(t); S().entities = S().entities.filter((x) => x.id !== t.id); }
    b.x = 2000; b.z = 0; const t350 = rawTile('charger', toI(2350), 0, toK(0)); t350.reserve = 3; const t450 = rawTile('charger', toI(2450), 0, toK(0)); t450.reserve = 3;
    if (g.crew.chargerFor(b) !== t350) return 'a charger 350 m away was not used'; g.logi.remove(t350); S().entities = S().entities.filter((x) => x.id !== t350.id);
    return !g.crew.chargerFor(b) || 'used a charger 450 m away';
  });
  await T('crew.charger-the-bin-only-trickles-0-02-a-second-no-fast-free-recharge', async () => {
    fresh(up); const h = g.crew.home(); const b = mkBot(h.x + 1, h.z, 0.1); b.battery = 0.3; b.state = 'idle'; run(10); const gain = b.battery - 0.3;
    return (Math.abs(gain - 0.2) < 0.02) || 'gain in 10 s at the bin ' + gain;
  });
  await T('crew.charger-below-a-quarter-needs-power-above-it-keeps-working', async () => {
    fresh(up); const tun = tunnel(40); const ch = rawTile('charger', tun.i + 26, 0, tun.k); ch.reserve = 5;
    const ok = digging(tun, 30, 0.3); run(0.3); const kept = ok.state !== 'chgwalk'; g.logi.remove(ch); S().entities = S().entities.filter((x) => x.id !== ch.id);
    const ch2 = rawTile('charger', tun.i + 26, 0, tun.k); ch2.reserve = 5; for (const x of [...S().crew]) if (x !== ok) S().crew.splice(S().crew.indexOf(x), 1); ok.battery = 0.24; run(0.2);
    return (kept && ok.state === 'chgwalk') || `0.3 -> ${kept ? 'kept working' : 'went charging'}, 0.24 -> ${ok.state}`;
  });
  await T('crew.charger-no-station-waits-at-the-bin-trickles-and-toasts-once', async () => {
    fresh(up); const tun = tunnel(40); const b = digging(tun, 30, 0.2); const toasts = []; const ot = g.ui.toast; g.ui.toast = (t) => { toasts.push(t); };
    let seen; try { seen = states(b, 140, null, 'lowbat'); } finally { /* restore below */ }
    const h = g.crew.home(); const at = b.battery; const t0 = g.time; run(5); const gain = b.battery - at; const line = g.crew.statusLine(b); const still = Math.hypot(b.x - h.x, b.z - h.z) < 6; run(40); g.ui.toast = ot;
    const n = toasts.filter((t) => t.title === 'Build a Charging Station' && t.text.includes(b.name)).length;
    if (seen[seen.length - 1] !== 'lowbat') return 'states ' + seen; if (Math.abs(gain - 0.1) > 0.02) return `trickle ${gain} in 5 s`;
    if (n !== 1) return 'toast count ' + n; if (!line.includes(`Build a Charging Station: ${b.name} is out of power`)) return 'status ' + line;
    return (still && t0 > 0) || 'not waiting at the bin';
  });
  await T('crew.charger-a-station-built-later-pulls-the-waiting-bot-to-it', async () => {
    fresh(up); const tun = tunnel(40); const b = digging(tun, 30, 0.2); states(b, 140, null, 'lowbat'); if (b.state !== 'lowbat') return 'not waiting: ' + b.state;
    const ch = rawTile('charger', tun.i + 26, 0, tun.k); ch.reserve = 0.01; run(3); if (b.state !== 'lowbat') return 'went to an empty station: ' + b.state; if (!/^Waiting for a Charging Station/.test(g.crew.statusLine(b))) return 'status with an empty station: ' + g.crew.statusLine(b);
    ch.reserve = 5; const seen = states(b, 120, null, 'farm');
    return (seen.includes('chgwalk') && seen.includes('recharge') && b.battery > 0.8 && ch.reserve < 5) || `states ${seen} battery ${b.battery}`;
  });
  await T('crew.charger-with-no-cable-does-not-charge-bots-and-is-not-a-station-they-choose', async () => {
    fresh(up); const tun = tunnel(40); const ch = rawTile('charger', tun.i + 26, 0, tun.k, { unwired: true }); ch.reserve = 5; g.power.markDirty(); g.power.recompute();
    const b = digging(tun, 30, 0.1); if (g.crew.chargerFor(b)) return 'chose a station with no cable'; const seen = states(b, 12);
    if (seen.includes('chgwalk') || seen.includes('recharge')) return 'went to charge at an unwired station: ' + seen; if (ch.reserve !== 5) return 'drew charge with no cable: ' + ch.reserve;
    const { live } = kit(ctx); live(ch); if (g.crew.chargerFor(b) !== ch) return 'a cable and a live grid did not open it';
    const b2 = digging(tun, 30, 0.1); run(15); return (b2.battery > 0.8 && ch.reserve < 4.4) || `after wiring: battery ${b2.battery} reserve ${ch.reserve}`;
  });
  await T('crew.charger-whose-cable-is-cut-mid-charge-lets-the-bot-go', async () => {
    fresh(up); const tun = tunnel(40); const ch = rawTile('charger', tun.i + 10, 0, tun.k); ch.reserve = 8; const gen = [...ctx.L().tiles.values()].find((t) => t.type === 'gen');
    const b = mkBot(cellX(tun.i + 10) - 0.8, cellZ(tun.k)); b.state = 'recharge'; b.chg = ch.id; b.battery = 0.5; b.chgNext = 'idle'; run(0.4); const mid = b.battery; if (!(mid > 0.6)) return 'did not charge while powered: ' + mid;
    g.cables.connect(gen.id, ch.id); g.power.markDirty(); g.power.recompute(); run(0.5); if (b.battery > mid + 0.03) return `kept charging with the cable cut: ${mid} -> ${b.battery}`;
    return b.state !== 'recharge' || `still recharging (state ${b.state})`;
  });
  await T('crew.charger-bot-fed-station-roundtrip-plush-in-then-bot-out', async () => {
    fresh(up); const tun = tunnel(40); const ch = rawTile('charger', tun.i + 26, 0, tun.k);
    g.logi.accept(ch, { sp: sp(3), vr: 0 }, null); g.logi.accept(ch, { sp: sp(0), vr: 0 }, null); run(1.5); const b = digging(tun, 30, 0.1); states(b, 25, null, 'farm');
    return (b.battery > 0.9 && Math.abs(ch.reserve - (4.34 - 0.85)) < 0.15) || `battery ${b.battery} reserve ${ch.reserve}`;
  });
  void tiles;
}
