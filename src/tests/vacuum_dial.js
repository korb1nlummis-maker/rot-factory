// vacdial.*: the VACUUM dial beside the SCOOP dial (src/dials.js, ui.setVacuum, game.vacPct / vacNow / adjustVac / runVacuum) and the SCOOP dial it sits beside.
// Run: `await __selftest('vacdial.')` (and `__selftest('mp.vacdial.')`).
import { kit as islandKit } from './island_lib.js';
import { vacDepth, VAC_DEFAULT_PCT, DIAL_DEFS } from '../dials.js';
import { CONTROLS } from '../controls.js';
import { SAVE_KEY } from '../config.js';
import { loadSaved } from '../state.js';

export default async function (ctx) {
  const { T, g, S, w, p, sim, fresh, stepSim, cellX, cellY, cellZ, toI, toJ, toK, V3, clearBodies, newWorld } = ctx;
  const VD = () => g.ui.dials.read('vacuum'), SD = () => g.ui.dials.read('scoop');
  const hud = () => { g.hudT = 0; g.updateHud(0.1); };
  const key = (code, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...o }));
  const alt = (code) => key(code, { altKey: true });
  // a player with the gear in `up` and both dials at their defaults (fresh() sets the vacuum dial to 100 for the older tests that measure all of the suction)
  const own = (up) => { fresh({ bag: 8, reach: 4, ...up }); delete S().vacSet; delete S().scoopSet; g.stowed = true; g.T = g.tune(); g.T.carry = 1e9; };
  const TOP = { bag: 8, cargo: 4, reach: 4, gloves: 3, scoop: 4, bucketHands: 4, vac: 5, tamp: 8, bedrockTamp: 4 };
  const VMAX = [0, 3, 5, 8, 12, 18];
  const num = (s) => parseFloat(s);

  // ------------------------------------------------------------------------------------------------------------------------ the dial
  await T('vacdial.dial-shows-only-with-the-vacuum-and-reads-the-suction-over-the-most-starting-at-30-percent', async () => {
    const bad = []; own({}); hud(); if (VD().on) bad.push('shown without the Plush Vacuum');
    if (g.vacNow() !== 0 || g.vacPct() !== 0) bad.push('no vacuum should mean no suction: ' + g.vacNow());
    for (let l = 1; l <= 5; l++) {
      own({ vac: l }); hud(); const d = VD(), max = VMAX[l], want = Math.max(1, 0.3 * max);
      if (!d.on) { bad.push(`level ${l}: not shown`); continue; }
      if (g.vacPct() !== VAC_DEFAULT_PCT || VAC_DEFAULT_PCT !== 30) bad.push(`level ${l}: default is ${g.vacPct()} percent`);
      if (Math.abs(g.vacNow() - want) > 1e-9) bad.push(`level ${l}: ${g.vacNow()} a second, wanted ${want} (30% of ${max}, never under 1)`);
      if (d.unit !== '/ ' + max) bad.push(`level ${l}: unit "${d.unit}" should be "/ ${max}"`);
      if (Math.abs(num(d.val) - want) > 0.06) bad.push(`level ${l}: reads ${d.val}, wanted about ${want}`);
      if (Math.abs(d.frac - want / max) > 0.002) bad.push(`level ${l}: ring ${d.frac}`);
      if (!/30 percent/.test(d.text) || /NaN|undefined|Infinity/.test(d.text + d.aria + d.title)) bad.push(`level ${l}: text "${d.text}"`);
      if (d.dim) bad.push(`level ${l}: dim at 30`);
    }
    own({ vac: 5 }); hud(); const t = VD(); if (t.unit !== '/ 18' || t.val !== '5.4') bad.push(`top: ${t.val} ${t.unit}, wanted 5.4 / 18`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('vacdial.dial-sits-in-the-left-group-next-to-scoop-and-each-needs-its-own-upgrade', async () => {
    const bad = []; own({ scoop: 4 }); hud(); if (!SD().on || VD().on) bad.push(`scoop only: scoop ${SD().on}, vacuum ${VD().on}`);
    own({ vac: 2 }); hud(); if (SD().on || !VD().on) bad.push(`vacuum only: scoop ${SD().on}, vacuum ${VD().on}`);
    own({ scoop: 2, vac: 2 }); hud(); if (!SD().on || !VD().on) bad.push('both owned: both dials show');
    const def = DIAL_DEFS.find((d) => d.id === 'vacuum'); if (!def || def.side !== 'L' || !def.steps) bad.push('the vacuum dial is a left group dial with step buttons');
    const el = g.ui.dials.el('vacuum'), sc = g.ui.dials.el('scoop');
    if (!el || el.parentElement.id !== 'dialsL') bad.push('not in #dialsL'); if (sc && el && sc.nextElementSibling !== el) bad.push('the VACUUM dial is not right beside the SCOOP dial');
    if (el.querySelectorAll('button').length !== 2) bad.push('two buttons');
    return bad.length === 0 || bad.join('; ');
  });

  await T('vacdial.minus-and-plus-buttons-step-ten-percent-and-grey-out-at-the-ends', async () => {
    const bad = []; own({ vac: 5 }); hud();
    const [dn, up] = g.ui.dials.el('vacuum').querySelectorAll('button');
    if (!dn || !up || !/−|-/.test(dn.textContent) || up.textContent !== '+') return 'button faces ' + (dn && dn.textContent) + (up && up.textContent);
    for (const b of [dn, up]) if (!b.getAttribute('aria-label') || !/10%/.test(b.title) || /undefined|NaN/.test(b.getAttribute('aria-label') + b.title)) bad.push('button label/title: ' + b.outerHTML.slice(0, 120));
    const val = () => { hud(); return VD(); };
    up.click(); if (g.vacPct() !== 40 || Math.abs(g.vacNow() - 7.2) > 1e-9) bad.push('+ once: ' + g.vacPct() + ' / ' + g.vacNow());
    if (Math.abs(num(val().val) - 7.2) > 0.05) bad.push('dial after +: ' + VD().val);
    for (let n = 0; n < 6; n++) up.click(); if (g.vacPct() !== 100 || g.vacNow() !== 18) bad.push('top: ' + g.vacPct() + ' / ' + g.vacNow());
    val(); if (!up.disabled || dn.disabled) bad.push('+ should be off at 100 and - on'); up.click(); if (g.vacPct() !== 100) bad.push('a disabled + moved it to ' + g.vacPct());
    if (VD().state !== 'ok') bad.push('state at 100%: ' + VD().state);
    for (let n = 0; n < 10; n++) dn.click(); if (g.vacPct() !== 0 || g.vacNow() !== 0) bad.push('bottom: ' + g.vacPct());
    val(); const z = VD(); if (!dn.disabled || up.disabled) bad.push('- should be off at 0 and + on'); if (!z.dim || z.val !== '0') bad.push(`dim at 0: dim ${z.dim} val ${z.val}`); if (!/off/.test(z.text)) bad.push('text at 0: ' + z.text);
    dn.click(); if (g.vacPct() !== 0) bad.push('a disabled - went under 0'); if (S().vacSet !== 0) bad.push('saved as S.vacSet: ' + S().vacSet);
    if (document.activeElement === dn || document.activeElement === up) bad.push('a button kept the focus (Space would press it in the game)');
    return bad.length === 0 || bad.join('; ');
  });

  await T('vacdial.every-press-changes-the-suction-even-for-a-small-vacuum', async () => {
    const bad = [];
    for (let l = 1; l <= 5; l++) {
      own({ vac: l }); const seen = [g.vacNow()]; let guard = 0;
      while (g.vacPct() < 100 && guard++ < 12) { const before = g.vacNow(); g.adjustVac(1); if (!(g.vacNow() > before)) bad.push(`level ${l}: + at ${g.vacPct()} did not raise the suction`); seen.push(g.vacNow()); }
      if (g.vacNow() !== VMAX[l]) bad.push(`level ${l}: top is ${g.vacNow()}, not ${VMAX[l]}`);
      guard = 0; while (g.vacPct() > 0 && guard++ < 12) { const before = g.vacNow(); g.adjustVac(-1); if (!(g.vacNow() < before)) bad.push(`level ${l}: - at ${g.vacPct()} did not lower the suction`); }
      if (g.vacNow() !== 0) bad.push(`level ${l}: bottom is ${g.vacNow()}`);
      for (const r of seen) if (r !== 0 && r < 1) bad.push(`level ${l}: ${r} a second is under 1`);
    }
    own({}); if (g.adjustVac(1) !== false) bad.push('adjusting without the vacuum should say no'); if (S().vacSet !== undefined) bad.push('setting saved without the vacuum');
    return bad.length === 0 || bad.join('; ');
  });

  await T('vacdial.bracket-keys-turn-the-vacuum-the-plain-keys-still-turn-the-scoop-and-the-old-alt-keys-do-nothing', async () => {
    const bad = []; own({ scoop: 4, vac: 5 });
    const steps = []; const cyc = g.cycleTool; g.cycleTool = (d) => { steps.push(d); };
    try {
      key('Equal'); if (g.scoopNow() !== 6 || g.vacPct() !== 30) bad.push(`= : scoop ${g.scoopNow()} vacuum ${g.vacPct()}`);
      key('BracketRight'); if (g.scoopNow() !== 6 || g.vacPct() !== 40) bad.push(`] : scoop ${g.scoopNow()} vacuum ${g.vacPct()}`);
      key('BracketLeft'); key('BracketLeft'); if (g.scoopNow() !== 6 || g.vacPct() !== 20) bad.push(`[ twice: scoop ${g.scoopNow()} vacuum ${g.vacPct()}`);
      if (steps.length) bad.push('[ and ] with bare hands and the vacuum owned stepped the hotbar: ' + steps);
      key('Minus'); if (g.scoopNow() !== 3 || g.vacPct() !== 20) bad.push(`- : scoop ${g.scoopNow()} vacuum ${g.vacPct()}`);
      key('Equal', { shiftKey: true }); if (g.scoopNow() !== 6 || g.vacPct() !== 20) bad.push(`Shift+= is still the scoop: scoop ${g.scoopNow()} vacuum ${g.vacPct()}`);
      // the old Alt keys no longer touch the vacuum (and are not the scoop either: a bare key does not fire with Alt held)
      const sc = g.scoopNow(); alt('Equal'); alt('Minus'); alt('Minus'); if (g.vacPct() !== 20 || g.scoopNow() !== sc) bad.push(`Alt+= and Alt+- must do nothing now: scoop ${g.scoopNow()} (was ${sc}) vacuum ${g.vacPct()}`);
      key('BracketRight', { altKey: true }); key('BracketRight', { ctrlKey: true }); key('BracketRight', { metaKey: true }); if (g.vacPct() !== 20) bad.push('Alt, Ctrl or Cmd with ] must not count: ' + g.vacPct());
      // with a belt in hand (a tool): [ and ] step the hotbar instead and leave the dial alone; the dial buttons still turn the vacuum
      const ct = g.curTool; g.curTool = () => ({ kind: 'belt', id: 'belt' });
      try {
        key('BracketRight'); key('BracketLeft'); if (g.vacPct() !== 20) bad.push('[ ] with a belt in hand turned the vacuum: ' + g.vacPct());
        if (steps.join() !== '1,-1') bad.push('[ ] with a belt in hand should step the hotbar +1 then -1, got ' + steps.join());
        g.ui.dials.el('vacuum').querySelector('.sb.up').click(); if (g.vacPct() !== 30) bad.push('the + button with a belt in hand: ' + g.vacPct());
      } finally { g.curTool = ct; }
    } finally { g.cycleTool = cyc; }
    // before the vacuum is owned [ and ] step the hotbar
    own({ scoop: 4 }); const st2 = []; g.cycleTool = (d) => { st2.push(d); }; try { key('BracketRight'); key('BracketLeft'); } finally { g.cycleTool = cyc; } if (st2.join() !== '1,-1') bad.push('without the vacuum [ ] should step the hotbar, got ' + st2.join());
    return bad.length === 0 || bad.join('; ');
  });

  await T('vacdial.the-controls-table-lists-the-bracket-keys-and-says-what-they-do', async () => {
    const bad = []; const rows = CONTROLS.flatMap((gr) => gr.rows);
    const r = rows.find((x) => x.ids.includes('vacLess')), r2 = rows.find((x) => x.ids.includes('vacMore'));
    if (!r || !r2) return 'no vacuum rows in CONTROLS';
    if (r.keys.join('') !== '[' || r2.keys.join('') !== ']') bad.push('keys ' + r.keys.join('') + ' ' + r2.keys.join(''));
    if (rows.some((x) => x.keys.includes('Alt'))) bad.push('a row still lists Alt');
    for (const word of ['VACUUM', '10 percent', '30 percent', '1 plush a second', 'narrows the cone', 'plain grab', 'own setting']) if (!r.what.includes(word)) bad.push('row lacks "' + word + '"');
    const s = rows.find((x) => x.ids.includes('scoopLess')); if (!s || s.keys.join('') !== '-' || !/from 0/.test(s.what) || !/starting at 3/.test(s.what)) bad.push('the scoop row: ' + (s && s.what.slice(0, 160)));
    const hb = rows.find((x) => x.ids.includes('hbprev')); if (!hb || hb.keys.join('') !== '[' || !/vacuum/i.test(hb.what)) bad.push('the hotbar row does not say it shares [ with the vacuum dial');
    return bad.length === 0 || bad.join('; ');
  });

  // ------------------------------------------------------------------------------------------------------------------------ what the suction does
  // a wall of plush `deep` cells thick, 20 high and 30 wide, in a cleared bay, with the player 2.4 m from its west face
  const wall = async (up, deep = 10) => {
    await newWorld(); const K = islandKit(ctx); const a = K.arena(50, 50, up); delete S().vacSet; delete S().scoopSet; g.T = g.tune(); g.T.carry = 1e9; g.stowed = true;
    const i0 = a.i0 + 4, k0 = a.k0 + 10; const zc = (cellZ(k0) + cellZ(k0 + 29)) / 2, x0 = cellX(i0) - 0.3;
    const refill = () => { K.dig(i0, 0, k0, deep, 20, 30, false); K.block(i0, 0, k0, deep, 20, 30, 2); };
    const stand = (y = 1.2, dz = 0) => { p().pos.set(x0 - 2.4, 0, zc); p().vel.set(0, 0, 0); const e = p().eyePos(new V3()); p().yaw = Math.atan2(2.7, dz); p().pitch = Math.atan2(y - e.y, Math.hypot(2.7, dz)); return [p().eyePos(new V3()), p().forward(new V3())]; };
    refill();
    return { K, i0, k0, zc, x0, stand, refill, deep };
  };
  const setDial = (vac, scoop) => { S().vacSet = vac; S().scoopSet = scoop; g.T = g.tune(); g.T.carry = 1e9; S().carry = []; g.vacAcc = 0; g._vacRef = null; };

  await T('vacdial.the-vacuum-pulls-the-dials-rate-and-at-zero-a-click-is-a-plain-grab-of-one-plush', async () => {
    const bad = []; const W = await wall(TOP);
    for (const [pct, wantRate] of [[30, 5.4], [60, 10.8], [100, 18]]) {
      setDial(pct, 0); W.refill(); const dt = 1 / 30; let sec = 0;
      for (let n = 0; n < 30; n++) { const [eye, dir] = W.stand(0.9 + 0.7 * (n % 4), -6 + ((n * 3.7) % 12)); g.time += dt; g.runVacuum(dt, eye, dir); sec += dt; }
      const got = S().carry.length; if (Math.abs(got - wantRate * sec) > Math.max(2, wantRate * sec * 0.06)) bad.push(`${pct}%: ${got} plush in ${sec.toFixed(2)} s, the dial says ${wantRate} a second`);
    }
    // 0: a click grabs exactly one plush (the scoop at 0 too) and starts no vacuum
    setDial(0, 0); W.refill(); g.vacT = 0; g.grabCd = 0; let [eye, dir] = W.stand(); g.curTargetRef = g.findTarget(eye, dir); if (!g.curTargetRef) return 'no target at the wall';
    g.holdBlock = false; g.throwHold = false; g.gPress(); if (S().carry.length !== 1 || g.vacT > 0) bad.push(`0%: click took ${S().carry.length}, vacT ${g.vacT}`);
    // 0: holding the grab takes plush by hand, and never the burst
    S().carry = []; g.keys = { Mouse0: true }; g.gDownAt = 0; for (let n = 0; n < 30; n++) { g.grabCd = Math.max(0, g.grabCd - 0.033); g.interact(0.033, eye, dir); }
    g.keys = {}; const held = S().carry.length; if (held < 3 || held > 40 || g.vacT > 0) bad.push(`0%: holding took ${held} (vacT ${g.vacT})`);
    setDial(50, 0); W.refill(); g.vacT = 0; g.grabCd = 0; [eye, dir] = W.stand(); g.curTargetRef = g.findTarget(eye, dir); g.gPress(); if (!(g.vacT > 0) || S().carry.length !== 0) bad.push(`50%: a click should start the burst (vacT ${g.vacT}, carry ${S().carry.length})`);
    g.vacT = 0; clearBodies(); S().carry = [];
    return bad.length === 0 || bad.join('; ');
  });

  await T('vacdial.the-cone-narrows-with-the-setting', async () => {
    // single plush in empty air at every cell of a grid in front of the eye, one pull at a time: it is pulled exactly when its direction is inside the cone of the setting
    const bad = []; await newWorld(); const K = islandKit(ctx); K.arena(40, 40, TOP); delete S().vacSet; delete S().scoopSet; g.T = g.tune(); g.T.carry = 1e9; g.stowed = true;
    const sp = ctx.spot(12); p().pos.set(cellX(sp.i + 12), 0, cellZ(sp.k) - 14); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0;
    const eye = p().eyePos(new V3()), dir = p().forward(new V3()), ci = toI(eye.x), cj = toJ(eye.y), ck = toK(eye.z);
    const maxDeg = {}; const full = Math.acos(0.95) * 180 / Math.PI;
    for (const [pct, half] of [[10, 12], [30, 12], [60, Math.max(12, full * 0.6)], [100, full]]) {
      setDial(pct, 0); let inside = 0, pulled = 0, wrong = 0, mx = 0;
      for (let dj = -2; dj <= 5; dj++) for (let dk = -6; dk <= 6; dk++) for (const ahead of [4, 8]) {
        const i = ci + ahead, j = cj + dj, k = ck + dk; if (w().get(i, j, k)) continue;
        w().setCell(i, j, k, 3, 0); S().carry = []; g.vacAcc = 1; g._vacRef = null; g.runVacuum(0.0001, eye, dir);
        const x = cellX(i) - eye.x, y = cellY(j) - eye.y, z = cellZ(k) - eye.z, deg = Math.acos((x * dir.x + y * dir.y + z * dir.z) / Math.hypot(x, y, z)) * 180 / Math.PI, got = S().carry.length === 1;
        if (got) { pulled++; mx = Math.max(mx, deg); if (deg > half + 0.01) wrong++; }
        if (deg < half - 0.3 && Math.hypot(x, y, z) <= g.T.reach + 1.2 - 0.01) { inside++; if (!got) wrong++; }
        w().setCell(i, j, k, 0, 0);
      }
      maxDeg[pct] = +mx.toFixed(1); if (wrong) bad.push(`${pct}%: ${wrong} cells on the wrong side of the ${half.toFixed(1)} degree cone`); if (!pulled || !inside) bad.push(`${pct}%: nothing was pulled (${pulled}/${inside})`);
    }
    if (!(maxDeg[10] < maxDeg[100] && maxDeg[30] < maxDeg[100] && maxDeg[60] < maxDeg[100]))   // (the cone at the top is about 18 degrees and never narrower than 12: the low settings share the minimum)
      bad.push('the cone must widen with the setting: ' + JSON.stringify(maxDeg));
    return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(maxDeg);
  });

  await T('vacdial.a-gentle-setting-takes-the-face-layer-and-goes-deeper-only-as-you-keep-pointing', async () => {
    // a single column of plush 12 deep along the aim line: how far down it a held vacuum gets
    const bad = []; const W = await wall(TOP, 12); const [eye, dir] = W.stand(1.6, 0); const ci = toI(eye.x), cj = toJ(eye.y), ck = toK(eye.z);
    const column = () => { W.K.dig(W.i0, 0, W.k0, 12, 20, 30, false); for (let a = 3; a < 15; a++) w().setCell(ci + a, cj, ck, 3, 0); };
    const hold = (pct, sec) => { setDial(pct, 0); column(); const dt = 1 / 30; for (let n = 0; n < sec / dt; n++) { g.time += dt; g.runVacuum(dt, eye, dir); } let took = 0; for (let a = 3; a < 15; a++) if (!w().get(ci + a, cj, ck)) took++; return took; };
    if (Math.abs(vacDepth(0.3) - (0.3 + 6 * 0.027)) > 1e-9 || !(vacDepth(0.1) < 0.35) || vacDepth(1) < 6) bad.push('vacDepth numbers ' + [vacDepth(0.1), vacDepth(0.3), vacDepth(1)].join(' '));
    const a30 = hold(30, 0.25), b30 = hold(30, 1.25), a100 = hold(100, 1.5);   // (18 a second: 1.5 s is 27 plush)
    if (a30 !== 1) bad.push(`30% for a quarter second took ${a30} plush of the column: the face layer only (1)`);
    if (!(b30 >= 3 && b30 <= 6)) bad.push(`30% for 1.25 s took ${b30} plush of the column: one more layer each time the aim line is measured again (every 0.3 s), never the whole column`);
    let inReach = 0; for (let a = 3; a < 15; a++) if (Math.hypot(cellX(ci + a) - eye.x, cellY(cj) - eye.y, cellZ(ck) - eye.z) <= g.T.reach + 1.2) inReach++;   // (the column is 12 deep, the vacuum reaches only so far along it)
    if (!(a100 >= Math.min(8, inReach - 1) && a100 > b30)) bad.push(`100% for 1.5 s took ${a100} of 12 (${inReach} within reach, 30% for 1.25 s took ${b30}): it should have no depth limit`);
    return bad.length === 0 || bad.join('; ');
  });

  // ------------------------------------------------------------------------------------------------------------------------ the scoop dial beside it
  await T('vacdial.scoop-dial-starts-at-3-bottoms-at-0-and-at-0-a-grab-is-exactly-one-plush', async () => {
    const bad = []; await newWorld(); const K = islandKit(ctx);
    const grab = (dial, up, deep = 12) => {
      const a = K.arena(40, 40, up); delete S().vacSet; delete S().scoopSet; g.T = g.tune(); g.T.carry = 1e9; g.stowed = true; if (dial !== undefined) S().scoopSet = dial;
      const i0 = a.i0 + 4, k0 = a.k0 + 8; for (let x = 0; x < deep; x++) for (let j = 0; j < 20; j++) for (let k = k0; k < k0 + 24; k++) if ((x + j + k) % 3 !== 0) w().setCell(i0 + x, j, k, 2 + ((x + j + k) % 5), 0);   // two cells in three: every plush has an open side, so every neighbour can be scooped
      let kt = k0 + 12; while ((0 + 10 + kt) % 3 === 0) kt++;   // aim at a plush that exists, from level with it
      p().pos.set(cellX(i0) - 3, 0, cellZ(kt)); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0; const e0 = p().eyePos(new V3()); p().pos.y = cellY(10) - e0.y; S().carry = [];
      const eye = p().eyePos(new V3()), dir = p().forward(new V3()); const tg = g.findTarget(eye, dir); if (!tg) return -1; g.instantGrab(tg); return S().carry.length;
    };
    own({ scoop: 4, bag: 8, cargo: 4 }); if (g.scoopNow() !== 3) bad.push('default scoop is ' + g.scoopNow());
    const base = { scoop: 4, bag: 8, cargo: 4, reach: 4 };
    let got = grab(undefined, base); if (got !== 4) bad.push('default dial (3): a grab took ' + got + ', wanted 1 + 3');
    got = grab(0, base); if (got !== 1) bad.push('dial at 0: a grab took ' + got + ', wanted exactly 1');
    own({ scoop: 4 }); for (let n = 0; n < 12; n++) key('Minus'); hud(); if (g.scoopNow() !== 0 || !SD().dim) bad.push('the - key should bottom out at 0 and dim the dial: ' + g.scoopNow() + ' dim ' + SD().dim);
    for (const [lvl, top] of [[1, 28], [2, 52], [3, 102], [4, 212]]) {
      const up = { ...base, bucketHands: lvl }; own(up); if (g.T.scoop !== top) { bad.push(`Bucket Hands ${lvl}: T.scoop ${g.T.scoop}, wanted ${top}`); continue; }
      hud(); const d = SD(); if (d.unit !== '/ ' + top || d.val !== '3') bad.push(`Bucket Hands ${lvl}: dial ${d.val} ${d.unit}`);
      const g0 = grab(top, up); if (g0 !== 1 + top) bad.push(`Bucket Hands ${lvl}: dial at the most (${top}) took ${g0}, wanted ${1 + top}`);
      const g1 = grab(3, up); if (g1 !== 4) bad.push(`Bucket Hands ${lvl}: dial at 3 took ${g1}`);
      const g2 = grab(0, up); if (g2 !== 1) bad.push(`Bucket Hands ${lvl}: dial at 0 took ${g2}`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  // ------------------------------------------------------------------------------------------------------------------------ saves and guests
  await T('vacdial.both-settings-are-saved-with-the-shift-and-an-old-save-opens-at-the-defaults', async () => {
    const bad = []; own({ scoop: 4, vac: 5 }); S().vacSet = 70; S().scoopSet = 9;
    const kept = localStorage.getItem(SAVE_KEY), noSave0 = g.noSave; let first, second;
    try {
      g.noSave = false; g.mode = 'play'; if (!g.save()) return 'save failed'; const raw = JSON.parse(localStorage.getItem(SAVE_KEY)); if (raw.S.vacSet !== 70 || raw.S.scoopSet !== 9) bad.push('the save lacks the settings: ' + raw.S.vacSet + ' ' + raw.S.scoopSet);
      S().vacSet = 0; S().scoopSet = 0; let sv = loadSaved(); g.loadWorld(sv.S, sv); g.T = g.tune(); first = [g.vacPct(), g.scoopNow()];
      delete raw.S.vacSet; delete raw.S.scoopSet; localStorage.setItem(SAVE_KEY, JSON.stringify(raw)); sv = loadSaved(); g.loadWorld(sv.S, sv); g.T = g.tune(); second = [g.vacPct(), g.scoopNow()];
    } finally { g.noSave = noSave0; if (kept === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, kept); g.mode = 'play'; }
    if (first[0] !== 70 || first[1] !== 9) bad.push(`after load: vacuum ${first[0]}, scoop ${first[1]}, wanted 70 and 9`);
    if (second[0] !== 30 || second[1] !== 3) bad.push(`an old save opens at vacuum ${second[0]}, scoop ${second[1]}, wanted 30 and 3`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.vacdial.a-guest-turns-only-its-own-dials-and-nothing-goes-over-the-wire', async () => {
    const bad = []; own({ scoop: 4, vac: 5 }); const open0 = g.net.open, role0 = g.net.role, ready0 = g.guestReady, send0 = g.netSend; let sent = 0;
    g.net.open = true; g.net.role = 'guest'; g.guestReady = true; g.netSend = (...a) => { sent++; void a; };
    try {
      if (!g.isGuest()) return 'not a guest'; if (g.vacPct() !== 30 || g.scoopNow() !== 3) bad.push('a guest starts at the defaults: ' + g.vacPct() + ' ' + g.scoopNow());
      key('BracketRight'); key('BracketRight'); key('Equal'); hud(); if (g.vacPct() !== 50 || g.scoopNow() !== 6) bad.push('guest keys: ' + g.vacPct() + ' ' + g.scoopNow()); if (VD().val !== '9' || VD().unit !== '/ 18') bad.push('guest dial ' + VD().val + VD().unit);
      g.ui.dials.el('vacuum').querySelector('.sb.dn').click(); g.ui.dials.el('scoop').querySelector('.sb.dn').click(); if (g.vacPct() !== 40 || g.scoopNow() !== 3) bad.push('guest buttons: ' + g.vacPct() + ' ' + g.scoopNow());
      if (sent) bad.push(sent + ' network messages for a dial change: the setting is the guest\'s own');
      if (S().vacSet !== 40) bad.push('stored in the guest\'s own state: ' + S().vacSet);
    } finally { g.net.open = open0; g.net.role = role0; g.guestReady = ready0; g.netSend = send0; }
    return bad.length === 0 || bad.join('; ');
  });

  // ------------------------------------------------------------------------------------------------------------------------ is mining bearable? a 20 m tunnel by hand and by vacuum
  // A straight tunnel 4 wide and 4 high, dug 34 cells (20.4 m) forward from the open bay into a block of plush with 6 cells of cover, by holding the grab. The aim clears each slice of the face
  // (bottom row first, left and right) before the player steps forward. The real grab or the real vacuum runs (g.interact), and the real stability and island loops judge the roof (they run
  // with the game's own hooks); a timber frame cube stands half way so the safe length of the tunnel rule is not what decides, only what the digging does to the roof. Top upgrades: Scoop Hands
  // and Bucket Hands, the Plush Vacuum Pile Tamping and Bedrock Tamping. Returns what came down and how much of the roof is gone (fallen or dug).
  const dig = async ({ vac, scoop, cover = 6, len = 34 }) => {
    await newWorld(); const K = islandKit(ctx), wd = 4, ht = 4, dt = 1 / 30;
    const a = K.arena(len + 24, 30, TOP); const { i0, k0 } = a; g.T = g.tune(); g.T.carry = 1e9; w().stabBonus = g.T.stabBonus; S().scoopSet = scoop; S().vacSet = vac;
    const kc = k0 + 12, lo = kc - (wd >> 1); K.block(i0, 0, k0, len + 8, ht + cover, 24, 2);
    const prof = (s) => { const out = []; for (let j = 0; j < ht; j++) for (let k = lo; k < lo + wd; k++) out.push([i0 + s, j, k]); return out; };
    const mid = i0 + (len >> 1) - 2; for (let x = 0; x < 4; x++) for (let j = 0; j < 4; j++) for (let k = lo; k < lo + 4; k++) w().removeCell(mid + x, j, k, false);
    K.cube('timber', mid, lo, 0); w().stabQueue.length = 0;
    for (const c of prof(0).concat(prof(1))) w().removeCell(c[0], c[1], c[2], true);   // a pocket to stand in
    const hooks = g.stabHooks(), rel = hooks.release, relI = hooks.releaseIsland; let roof = 0, isl = 0;
    hooks.release = (i, j, k) => { const r = rel(i, j, k); if (r) roof++; return r; };
    hooks.releaseIsland = (cs, from, n, is) => { isl += Math.max(0, n - from); return relI(cs, from, n, is); };
    const zc = (cellZ(lo) + cellZ(lo + wd - 1)) / 2; let s = 2, ticks = 0;
    g.keys = { Mouse0: true }; g.stowed = true; g.holdBlock = false; g.gDownAt = 0; g.vacT = 0; g.throwHold = false;
    try {
      while (s < len && ticks < 30 * 240) {
        while (s < len && !prof(s).some((c) => w().get(c[0], c[1], c[2]))) s++;
        if (s >= len) break;
        const left = prof(s).filter((c) => w().get(c[0], c[1], c[2])); left.sort((x, y) => x[1] - y[1] || (x[1] % 2 ? y[2] - x[2] : x[2] - y[2])); const tg = left[0];
        p().pos.set(cellX(i0 + s) - 1.5, 0, zc); p().vel.set(0, 0, 0);
        const e = p().eyePos(new V3()), dx = cellX(tg[0]) - e.x, dy = cellY(tg[1]) - e.y, dz = cellZ(tg[2]) - e.z; p().yaw = Math.atan2(dx, dz); p().pitch = Math.atan2(dy, Math.hypot(dx, dz));
        S().carry = []; g.grabCd = Math.max(0, g.grabCd - dt); g.time += dt; g.interact(dt, p().eyePos(new V3()), p().forward(new V3()));
        g.slide.update(dt); sim().step(dt); w().updateStability(dt, g.T.warn, hooks); g.updateAfters(dt); ticks++;
      }
      g.keys = {}; for (let n = 0; n < 300; n++) stepSim(0.1, dt);   // what the roof does once the dig is over
      let roofNow = 0; for (let x = 0; x < len; x++) for (let j = ht; j < ht + cover; j++) for (let k = lo; k < lo + wd; k++) if (w().get(i0 + x, j, k)) roofNow++;
      return { roof, isl, falls: roof + isl, lost: len * wd * cover - roofNow, secs: ticks * dt, reached: s };
    } finally { hooks.release = rel; hooks.releaseIsland = relI; g.keys = {}; clearBodies(); S().carry = []; delete S().vacSet; delete S().scoopSet; }
  };

  await T('vacdial.mining-a-20-m-tunnel-at-the-default-dials-brings-the-roof-down-no-more-than-by-hand-and-at-full-suction-it-can', async () => {
    const hand = await dig({ vac: 0, scoop: 3 }), def = await dig({ vac: VAC_DEFAULT_PCT, scoop: 3 });
    const fulls = [await dig({ vac: 100, scoop: 3 })]; const full2 = await dig({ vac: 100, scoop: 212 });
    const sum = (k) => fulls.reduce((t, r) => t + r[k], 0);
    const row = (n, r) => `${n}: roof ${r.roof}, slab ${r.isl}, roof lost ${r.lost}, ${r.secs.toFixed(0)} s, ${r.reached}/34 slices`;
    const info = [row('by hand', hand), row('default 30% + scoop 3', def), ...fulls.map((r) => row('100% + scoop 3', r)), row('100% + scoop 212', full2)].join(' | ');
    const bad = [];
    for (const [n, r] of [['by hand', hand], ['default', def], ['100%', fulls[0]], ['100% + scoop 212', full2]]) if (r.reached < 34) bad.push(`${n} did not finish the 20 m (${r.reached} slices)`);
    if (def.falls > hand.falls + 3) bad.push(`the default dials brought down ${def.falls} roof cells, by hand ${hand.falls}`);
    if (def.lost > hand.lost + 6) bad.push(`the default dials took ${def.lost} cells of roof, by hand ${hand.lost}`);
    // (the vacuum tops out at 18 a second now: at 100% with plain scoop 3 it digs about as gently as the hand, and only the Bucket Hands scoop at full suction brings the roof down)
    if (!(sum('falls') + full2.falls >= 4 * hand.falls + 10)) bad.push(`at 100% the roof came down ${sum('falls')} cells in one dig (${full2.falls} with the scoop at 212), by hand ${hand.falls}`);
    if (!(full2.lost >= hand.lost + 300)) bad.push(`at 100% with the scoop at 212 ${full2.lost} cells of roof were lost, by hand ${hand.lost}`);
    return bad.length === 0 || bad.join('; ') + ' || ' + info;
  });
}
