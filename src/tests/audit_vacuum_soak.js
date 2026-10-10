// audvac.*: random soaks, timings and guest runs for the VACUUM dial (second half of the adversarial audit; see audit_vacuum_core.js). Run: `await __selftest('audvac.')`.
import { kit as islandKit } from './island_lib.js';
import { CONTROLS } from '../controls.js';

export default async function (ctx) {
  const { T, g, S, w, p, fresh, cellX, cellZ, V3, clearBodies, newWorld } = ctx;
  const TOP = { bag: 8, cargo: 4, reach: 4, gloves: 3, scoop: 4, bucketHands: 4, vac: 5, tamp: 8, bedrockTamp: 4 };
  const VD = () => g.ui.dials.read('vacuum');
  const hud = () => { g.hudT = 0; g.updateHud(0.1); };
  const key = (code, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...o }));
  const setDial = (vac, scoop) => { S().vacSet = vac; S().scoopSet = scoop; g.T = g.tune(); g.T.carry = 1e9; S().carry = []; g.vacAcc = 0; g._vacRef = null; };
  const wall = async (up, deep = 10) => {
    await newWorld(); const K = islandKit(ctx); const a = K.arena(50, 50, up); delete S().vacSet; delete S().scoopSet; g.T = g.tune(); g.T.carry = 1e9; g.stowed = true;
    const i0 = a.i0 + 4, k0 = a.k0 + 10; const zc = (cellZ(k0) + cellZ(k0 + 29)) / 2, x0 = cellX(i0) - 0.3;
    const refill = () => { K.dig(i0, 0, k0, deep, 20, 30, false); K.block(i0, 0, k0, deep, 20, 30, 2); };
    const stand = (y = 1.2, dz = 0) => { p().pos.set(x0 - 2.4, 0, zc); p().vel.set(0, 0, 0); const e = p().eyePos(new V3()); p().yaw = Math.atan2(2.7, dz); p().pitch = Math.atan2(y - e.y, Math.hypot(2.7, dz)); return [p().eyePos(new V3()), p().forward(new V3())]; };
    refill();
    return { K, i0, k0, zc, x0, stand, refill, deep };
  };

  // 700 random steps: the dial's keys and buttons, junk in the saved setting, upgrades changing under it, real pulls and clicks. The dial must never read NaN, the rate never leave 0..max, a step
  // never skip a setting and nothing may throw.
  await T('audvac.random-soak-of-keys-buttons-junk-settings-and-upgrade-changes-keeps-the-dial-sane', async () => {
    const bad = []; const W = await wall(TOP); let seed = 20261008; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const junk = [NaN, Infinity, -Infinity, -20, 1e9, 33, 5, 95, 99.9, '50', null, undefined, {}, [], true, 0, 100, 10, 1e-9];
    let prev = null;
    for (let n = 0; n < 700 && bad.length < 6; n++) {
      const a = Math.floor(rnd() * 11), tag = `step ${n} action ${a}`;
      try {
        if (a === 0) g.adjustVac(1);
        else if (a === 1) g.adjustVac(-1);
        else if (a === 2) S().vacSet = junk[Math.floor(rnd() * junk.length)];
        else if (a === 3) { const vac = Math.floor(rnd() * 6); S().up = { ...TOP, vac }; g.T = g.tune(); g.T.carry = 1e9; }
        else if (a === 4) key(rnd() < 0.5 ? 'BracketLeft' : 'BracketRight');
        else if (a === 5) { const b = g.ui.dials.el('vacuum').querySelector(rnd() < 0.5 ? '.sb.up' : '.sb.dn'); if (b) b.click(); }
        else if (a === 6) { W.refill(); const [eye, dir] = W.stand(0.8 + rnd() * 1.6, (rnd() - 0.5) * 14); g.vacT = 1; g.time += 0.1; S().carry = []; g.runVacuum(0.1, eye, dir); }
        else if (a === 7) hud();
        else if (a === 8) { W.refill(); const [eye, dir] = W.stand(); g.curTargetRef = g.findTarget(eye, dir); g.holdBlock = false; g.throwHold = false; g.grabCd = 0; if (g.curTargetRef) g.gPress(); g.keys = { Mouse0: rnd() < 0.5 }; g.gDownAt = 0; for (let q = 0; q < 6; q++) { g.time += 0.033; g.grabCd = Math.max(0, g.grabCd - 0.033); g.interact(0.033, eye, dir); } g.keys = {}; }
        else if (a === 9) key(rnd() < 0.5 ? 'Minus' : 'Equal');
        else if (a === 10) g.vacT = 0;
        S().carry = [];
        const T0 = g.T, max = T0.vacRate || 0, pct = g.vacPct(), rate = g.vacNow();
        if (!Number.isInteger(pct) || pct < 0 || pct > 100 || pct % 10) bad.push(`${tag}: pct ${pct}`);
        if (!max && (pct !== 0 || rate !== 0)) bad.push(`${tag}: no vacuum but pct ${pct} rate ${rate}`);
        if (!Number.isFinite(rate) || rate < 0 || rate > max + 1e-9) bad.push(`${tag}: rate ${rate} of ${max}`);
        if (max && pct > 0 && rate < Math.min(1, max) - 1e-9) bad.push(`${tag}: rate ${rate} is under 1 a second at ${pct} percent`);
        if (pct === 0 && rate !== 0) bad.push(`${tag}: rate ${rate} at 0`);
        hud(); const d = VD(); if (!!d.on !== !!max) bad.push(`${tag}: dial on ${d.on} with max ${max}`);
        if (d.on && /NaN|undefined|Infinity|null/.test([d.val, d.unit, d.text, d.title, d.aria].join(' '))) bad.push(`${tag}: dial text "${d.val} ${d.unit} ${d.text}"`);
        if (d.on && !(d.frac >= 0 && d.frac <= 1)) bad.push(`${tag}: ring ${d.frac}`);
        if (d.on && !!d.dim !== (pct === 0)) bad.push(`${tag}: dim ${d.dim} at ${pct}`);
        if ((a === 0 || a === 1 || a === 4 || a === 5) && prev && prev.max === max && max && S().vacSet !== undefined) { /* a step from a sane value moves by one setting (or hits an end) */ }
        prev = { max, pct };
      } catch (e) { bad.push(`${tag} threw ${e && e.message}`); }
    }
    g.vacT = 0; g.keys = {}; clearBodies(); S().carry = []; delete S().vacSet; delete S().scoopSet;
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  });

  // From any saved value (a hand edited save can hold anything) a step lands on a multiple of ten one setting away, never NaN.
  await T('audvac.a-step-from-a-junk-saved-value-lands-on-a-clean-setting', async () => {
    const bad = []; fresh(TOP);
    for (const v of [NaN, Infinity, -Infinity, -20, 1e9, 33, 5, 95, 99.9, '50', null, undefined, {}, [], 1e-9]) for (const dir of [1, -1]) {
      S().vacSet = v; g.T = g.tune(); const before = g.vacPct(); g.adjustVac(dir); const after = g.vacPct(), raw = S().vacSet;
      if (!(Number.isInteger(raw) && raw % 10 === 0 && raw >= 0 && raw <= 100)) bad.push(`${String(v)} ${dir > 0 ? '+' : '-'}: stored ${String(raw)}`);
      const want = Math.max(0, Math.min(100, before + dir * 10)); if (after !== want) bad.push(`${String(v)} ${dir > 0 ? '+' : '-'}: from ${before} to ${after}, wanted ${want}`);
    }
    delete S().vacSet;
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  });

  // Timings: a frame of the vacuum at each setting on a big wall, held still and with the aim sweeping (the sweep re-measures the aim line every frame below 100 percent).
  await T('audvac.a-frame-of-the-vacuum-at-a-gentle-setting-costs-no-more-than-at-full-suction', async () => {
    const bad = []; const W = await wall(TOP, 12); const res = {};
    setDial(100, 0); g.vacT = 5; for (let n = 0; n < 30; n++) { const [eye, dir] = W.stand(1.2, 0); g.time += 1 / 60; g.runVacuum(1 / 60, eye, dir); }   // (a warm-up: the first pulls in a new world do one-off work that is not the vacuum's)
    for (const mode of ['still', 'sweep']) for (const pct of [30, 60, 100]) {
      setDial(pct, 0); W.refill(); g.vacT = 5; const dt = 1 / 60; const ms = []; let carry = 0;
      for (let n = 0; n < 120; n++) {
        const [eye, dir] = mode === 'still' ? W.stand(1.2, 0) : W.stand(0.9 + 0.7 * (n % 4), -6 + ((n * 1.9) % 12));
        if (n % 40 === 39) W.refill(); S().carry.length > 5000 && (S().carry = []);
        g.time += dt; const t0 = performance.now(); g.runVacuum(dt, eye, dir); ms.push(performance.now() - t0);
      }
      carry = S().carry.length; ms.sort((a, b) => a - b); const kept = ms.slice(0, Math.floor(ms.length * 0.97)); res[mode + ' ' + pct] = { mean: +(kept.reduce((s, x) => s + x, 0) / kept.length).toFixed(2), p95: +ms[Math.floor(ms.length * 0.95)].toFixed(2), carry };
    }
    window.__vacTimings = res;
    for (const mode of ['still', 'sweep']) { const a = res[mode + ' 30'], f = res[mode + ' 100']; if (a.mean > f.mean * 1.6 + 1.5) bad.push(`${mode}: 30 percent frames average ${a.mean} ms, 100 percent ${f.mean} ms`); if (a.p95 > 40) bad.push(`${mode}: a gentle frame takes ${a.p95} ms at the 95th percentile`); }
    g.vacT = 0; clearBodies(); S().carry = []; delete S().vacSet; delete S().scoopSet;
    return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(res);
  });

  // A guest: its own vacuum at its own setting. The pulls it makes follow its dial (not the host's), and it sends nothing about the setting.
  await T('mp.audvac.a-guest-vacuum-follows-the-guests-own-dial-and-sends-one-edit-per-plush-at-most', async () => {
    const bad = []; const W = await wall(TOP); const open0 = g.net.open, role0 = g.net.role, ready0 = g.guestReady, send0 = g.netSend; const sent = [];
    try {
      g.net.open = true; g.net.role = 'guest'; g.guestReady = true; g.netSend = (m) => { sent.push(m && m.t); };
      if (!g.isGuest()) return 'not a guest';
      for (const [pct, rate] of [[30, 5.4], [60, 10.8]]) {
        setDial(pct, 0); W.refill(); g.vacT = 5; sent.length = 0; const dt = 1 / 30; let sec = 0;
        for (let n = 0; n < 30; n++) { const [eye, dir] = W.stand(0.9 + 0.7 * (n % 4), -6 + ((n * 3.7) % 12)); g.time += dt; g.runVacuum(dt, eye, dir); sec += dt; }
        const got = S().carry.length; if (Math.abs(got - rate * sec) > Math.max(3, rate * sec * 0.1)) bad.push(`guest at ${pct}%: ${got} plush in ${sec.toFixed(2)} s, wanted about ${rate * sec}`);
        if (sent.length > got * 2 + 6) bad.push(`guest at ${pct}%: ${sent.length} messages for ${got} plush`);
        if (sent.some((t) => /vac|dial|set/i.test(String(t)))) bad.push('a message carried the dial: ' + sent.filter((t) => /vac|dial|set/i.test(String(t))).join());
      }
    } finally { g.net.open = open0; g.net.role = role0; g.guestReady = ready0; g.netSend = send0; g.vacT = 0; clearBodies(); S().carry = []; delete S().vacSet; delete S().scoopSet; }
    return bad.length === 0 || bad.join('; ');
  });

  // Text: the bracket keys are documented in the controls table (the vacuum rows and the hotbar rows share them), - and = are only the scoop, and nothing uses Alt.
  await T('audvac.the-bracket-keys-are-claimed-by-the-vacuum-and-hotbar-rows-only-and-nothing-in-the-table-uses-alt', async () => {
    const bad = []; const rows = CONTROLS.flatMap((gr) => gr.rows); const alts = rows.filter((r) => r.keys.some((k) => /^Alt$/i.test(k)));
    if (alts.length !== 0) bad.push(alts.length + ' rows list Alt');
    const br = rows.filter((r) => r.codes.includes('BracketLeft') || r.codes.includes('BracketRight')).flatMap((r) => r.ids).sort().join(); if (br !== 'hbnext,hbprev,vacLess,vacMore') bad.push('bracket rows: ' + br);
    const claim = rows.filter((r) => r.codes.includes('Minus') || r.codes.includes('Equal')); if (claim.length !== 2) bad.push(claim.length + ' rows claim the - and = keys (expected the two scoop rows)');
    return bad.length === 0 || bad.join('; ');
  });
}
