// elev.audit.*: the audit of the hoistway Elevator (DESIGN_SATISFACTORY.md section 10 and 13). Each test was written to fail against the first build and pins one hole.
// This file: the hall edge, the cells a cab may be set into, the cut report, forged cfg keys, the hammer under a rider, an old save. The soak is audit_elevator_soak.js and the
// two roles of a game are audit_elevator_mp.js.
import { kit } from './transit_lib.js';
import * as TR from '../transit.js';
import { infoFor } from '../info.js';
import { NX, NZ, idx } from '../config.js';

export default async function (ctx) {
  const { T, g, S, w, p, adv, craft, toI, toK, stepSim } = ctx;
  const X = kit(ctx), C = 0.6;
  const guard = (name, fn) => T(name, async () => { const h0 = g.ui.hint; try { return await fn(); } finally { g.ui.hint = h0; delete g.netSend; g.net.open = false; g.net.role = null; X.clean(); g.dead = false; g.blacking = false; g.hp = g.hpMax; } });   // (a rider who fell down a shaft must not leave the next test dead)
  const LI = () => toI(-6), LK = () => toK(3);
  const text = (e) => infoFor(g, { kind: 'mach', id: e.id }).lines.join(' | ');
  // a block of plush around a footprint that touches the edge of the hall: only cells that are inside the hall are set
  const edgeBlock = (i0, k0, top) => { for (let k = k0 - 3; k < k0 + 7; k++) for (let i = Math.max(0, i0 - 3); i < Math.min(NX, i0 + 7); i++) for (let j = 0; j < top; j++) if (!w().get(i, j, k)) X.poke(i, j, k, 2, 0); };

  for (const [name, side, i0] of [['west', 2, 0], ['east', 0, NX - 4]]) await guard(`elev.audit.hall-edge-${name}-has-no-phantom-landings`, async () => {
    X.setup(); const bad = [], k0 = LK(), home = 20;
    edgeBlock(i0, k0, 30); X.dig(i0, k0, 8, home + 3);
    const L0 = X.make('plift', { i0, k0, j: home, cy: home * C, tg: null, q: [], dw: 0, dr: 1, tr: 0, ex: 0, rid: 'plift' });
    for (let j0 = 8; j0 + 4 <= home; j0 += 4) X.frame(L0, j0);
    TR.refreshShaft(g, L0); L0.ex = L0.tr; adv(0.7);
    if (L0.tr !== 12) bad.push('setup: tr ' + L0.tr + ' why ' + L0.wy);
    const out = L0.sg.filter((s) => s[1] === side); if (out.length) bad.push(`${out.length} stops open onto the edge of the world: ${out.map((s) => s.join(':')).join(' ')}`);
    for (let r = 8; r <= home; r++) { const ld = TR.landingAt(g, L0, r); if (ld && ld.q === side) { bad.push('a landing at row ' + r + ' beside the edge of the hall'); break; } }
    if (L0.sg.length > 2) bad.push('stops ' + L0.sg.map((s) => s.join(':')).join(' ') + ' (want the home row and the bottom only)');
    if (TR.floorsOf(g, L0).join() !== '8,20') bad.push('floors ' + TR.floorsOf(g, L0));
    if (/call panel/.test(text(L0)) && /[1-9]\d* landings? with call panels/.test(text(L0))) bad.push('the readout counts landings: ' + text(L0).slice(0, 300));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.audit.the-world-ends-at-its-corner-and-nothing-throws', async () => {
    X.setup(); const bad = [], home = 20;
    for (const [i0, k0] of [[0, 0], [NX - 4, NZ - 4]]) {
      try {
        edgeBlock(i0, k0, 30); X.dig(i0, k0, 8, home + 3);
        const L0 = X.make('plift', { i0, k0, j: home, cy: home * C, tg: null, q: [], dw: 0, dr: 1, tr: 0, ex: 0, rid: 'plift' });
        TR.refreshShaft(g, L0); adv(0.7); const sc = TR.scanShaft(g, L0); if (sc.sg.some((s) => s[1] >= 0)) bad.push(`corner ${i0},${k0}: landings ${sc.sg.map((s) => s.join(':'))}`);
        if (TR.conflictLift(g, { i0: -1, k0, j: 0 }) !== 'Out of the hall' || TR.conflictLift(g, { i0: NX - 3, k0, j: 0 }) !== 'Out of the hall') bad.push('a cab over the edge of the hall was not refused');
      } catch (x) { bad.push(`corner ${i0},${k0} threw ${x.message}`); }
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.audit.a-cab-is-never-set-into-cells-something-else-reserved', async () => {
    X.setup(); const bad = [], i0 = LI(), k0 = LK(), key = (i, j, k) => idx(i, j, k);
    if (TR.conflictLift(g, { i0, k0, j: 0 })) return 'setup: ' + TR.conflictLift(g, { i0, k0, j: 0 });
    // a rail piece, a ramp or stair volume, a Leveling Pad or a beacon reserves a cell with nothing in it: the cab may not take that cell over (taking the cab down frees the key)
    for (const [i, j, k, what] of [[i0 + 1, 1, k0 + 2, 'row 1'], [i0 + 3, 3, k0 + 3, 'the top row'], [i0, 0, k0, 'the corner']]) {
      w().reserved.add(key(i, j, k)); const why = TR.conflictLift(g, { i0, k0, j: 0 });
      if (!why) bad.push('a cab was allowed over a reserved cell: ' + what); else if (!/in the way/i.test(why)) bad.push('the refusal for ' + what + ' does not say so: ' + why);
      w().reserved.delete(key(i, j, k));
    }
    // the same cell, taken by another cab's box or its shaft
    const L0 = X.make('plift', { i0, k0, j: 0, cy: 0, tg: null, q: [], dw: 0, dr: 1, tr: 0, ex: 0, rid: 'plift' });
    if (!TR.conflictLift(g, { i0: i0 + 2, k0, j: 0 })) bad.push('a cab half on another cab was allowed'); if (!TR.conflictLift(g, { i0, k0, j: 2 })) bad.push('a cab two rows up on another cab was allowed');
    X.decon(L0); if (TR.conflictLift(g, { i0, k0, j: 0 })) bad.push('the hammer left the spot taken: ' + TR.conflictLift(g, { i0, k0, j: 0 }));
    // taking a cab down must never free a key it did not own
    const mine = key(i0 + 1, 1, k0 + 1); w().reserved.add(mine); const before = w().reserved.size;
    const L1 = X.make('plift', { i0: i0 + 12, k0, j: 0, cy: 0, tg: null, q: [], dw: 0, dr: 1, tr: 0, ex: 0, rid: 'plift' }); X.decon(L1);
    if (!w().reserved.has(mine) || w().reserved.size !== before) bad.push('taking a cab down freed a key that was not its own'); w().reserved.delete(mine);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.audit.a-cab-is-never-set-onto-a-ramp-or-stair-volume', async () => {
    X.setup(); const bad = [], i0 = LI() - 20, k0 = LK();
    const keys = []; for (let r = 0; r < 3; r++) keys.push(idx(i0 + 1, r, k0 + 1));
    for (const k of keys) w().reserved.add(k);
    if (!TR.conflictLift(g, { i0, k0, j: 0 })) bad.push('a ramp or stair volume (three reserved rows) did not stop the cab');
    for (const k of keys) w().reserved.delete(k);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.audit.a-second-cut-at-the-same-row-is-reported-again', async () => {
    X.setup(); const bad = [], L0 = X.lift(LI(), LK(), { home: 30, depth: 24, top: 38 }), hints = [], toasts = [], cell = [L0.i0 + 1, 14, L0.k0 + 2];
    X.powerCab(L0, 2); g.ui.hint = (t) => { hints.push(String(t)); }; g.net.open = true; g.net.role = 'host'; g.netSend = (m) => { if (m.t === 'toast') toasts.push(m.text); }; adv(0.7);
    const said = () => hints.filter((t) => /The shaft is cut at 8\.4 m/.test(t)).length;
    w().setCell(cell[0], cell[1], cell[2], 2, 0); adv(0.7); if (said() !== 1) bad.push('the first cut was reported ' + said() + ' times');
    w().setCell(cell[0], cell[1], cell[2], 0, 0); adv(0.7); if (L0.cut) bad.push('the cut stayed after the dig');
    w().setCell(cell[0], cell[1], cell[2], 2, 0); adv(0.7);
    if (said() !== 2) bad.push('the same row cut a second time was not reported (hints said it ' + said() + ' times)'); if (toasts.filter((t) => /cut at 8\.4 m/.test(t)).length !== 2) bad.push('the friend was not told the second time: ' + toasts.length);
    adv(2.0); if (said() !== 2) bad.push('the second cut was announced again and again: ' + said());
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.audit.forged-cfg-keys-change-nothing-but-a-call-or-a-go', async () => {
    X.setup(); const bad = [], L0 = X.lift(LI(), LK(), { home: 30, depth: 24, top: 38 }); X.tunnel(L0, 18, 0, 6); X.powerCab(L0, 2); TR.refreshShaft(g, L0); L0.ex = L0.tr; adv(0.7);
    const snap = () => JSON.stringify({ cy: L0.cy, tr: L0.tr, ex: L0.ex, cut: L0.cut, tg: L0.tg, q: L0.q, hand: L0.hand, crank: L0.crank, sg: L0.sg, wy: L0.wy, j: L0.j, i0: L0.i0, k0: L0.k0, cm: L0.cm });
    const s0 = snap(); g.net.open = true; g.net.role = 'host'; g.netSend = () => {};
    for (const c of [{ tr: 99 }, { ex: 99 }, { cy: 0 }, { cut: 5 }, { tg: 3 }, { q: [1, 2, 3] }, { hand: 1 }, { crank: 1 }, { sg: [[0, 0, 0]] }, { wy: 'cap' }, { j: 2 }, { i0: 0 }, { cm: 999 }, { pw: 5 }, { call: 'x' }, { call: 1.5 }, { call: -3 }, { call: 5000 }, { go: 2 }, { go: 'up' }, { go: null }, { press: 1 }, { __proto__: { x: 1 }, constructor: 1 }]) {
      let r; try { r = g.setCfg(L0, c); } catch (x) { bad.push('setCfg ' + JSON.stringify(c) + ' threw ' + x.message); continue; }
      if (r && r.ok && !('call' in c || 'go' in c) && !(Object.keys(c).length === 0)) bad.push('cfg ' + JSON.stringify(c) + ' was taken');
    }
    adv(0.1); if (snap() !== s0) bad.push('forged keys changed the elevator:\n  ' + s0 + '\n  ' + snap());
    // a call to a row that is not a stop is refused and queues nothing; a call to a real stop is taken
    let r = g.setCfg(L0, { call: 20 }); if (r.ok) bad.push('a call to a row that is not a stop was taken'); if (L0.q.length) bad.push('the queue got ' + L0.q);
    r = g.setCfg(L0, { call: 18 }); if (!r.ok) bad.push('a call to a landing was refused: ' + r.why); if (L0.q.length > 1) bad.push('queue ' + L0.q);
    // a flood of calls: the queue is capped
    for (let n = 0; n < 40; n++) g.setCfg(L0, { call: n % 2 ? 6 : 30 }); if (L0.q.length > TR.LIFT_QUEUE) bad.push('queue grew to ' + L0.q.length);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.audit.the-hammer-under-a-rider-and-mid-flight-leaves-nothing-behind', async () => {
    X.setup(); const bad = [], L0 = X.lift(LI(), LK(), { home: 30, depth: 24, top: 38 }); X.tunnel(L0, 18, 0, 6); X.powerCab(L0, 2); TR.refreshShaft(g, L0); L0.ex = L0.tr; adv(0.7);
    const base = new Set(w().reserved); p().pos.set(L0.px, 18.0, L0.pz); p().vel.set(0, 0, 0); adv(0.3); if (p().liftId !== L0.id) return 'setup: not aboard';
    TR.requestFloor(g, L0, 18); adv(1.0); if (!(L0.mv < 0)) return 'setup: the cab is not moving ' + L0.cy;
    X.decon(L0); adv(0.3);
    if (g.machines.items.has(L0.id)) bad.push('the elevator stayed'); if (p().liftId) bad.push('the rider is still bound to a cab that is gone: ' + p().liftId);
    const left = [...w().reserved].filter((k) => !base.has(k) && !g.logi.tiles.has(k)); if (left.length) bad.push(left.length + ' reserved cells left in the shaft');
    if (TR.TS.rv.has(L0.id) || TR.TS.scan.has(L0.id)) bad.push('scan state left behind'); if (!Number.isFinite(p().pos.y)) bad.push('the rider has no height');
    if (g.logi.cellTaken(L0.i0 + 1, 22, L0.k0 + 1)) bad.push('the shaft is still held for the build rules');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.audit.an-old-save-with-call-buttons-loads-and-the-buttons-say-so', async () => {
    X.setup(); const bad = [], i0 = LI(), k0 = LK(); X.block(i0, k0, 30); X.dig(i0, k0, 0, 20);
    // the first elevator: base floor 0, car 3 rows, buttons at floors 6 and 12 on a plush ledge, old fields
    const old = { id: g.nextId(), type: 'plift', i0, k0, j: 0, cy: 0, tg: null, q: [], dw: 0, dr: 1, rid: 'plift' }; S().entities.push(old); g.addEntity(old); const E = g.machines.items.get(old.id).ent;
    const btn = { id: g.nextId(), type: 'callbtn', lid: old.id, i: i0 - 1, j: 6, k: k0 + 1 }; X.poke(i0 - 1, 5, k0 + 1, 2, 0); S().entities.push(btn); g.addEntity(btn);
    let r; try { adv(1.0); r = text(E); } catch (x) { return 'the old elevator threw: ' + x.message; }
    const b = g.machines.items.get(btn.id); if (!b) return 'the old button did not load';
    const t = infoFor(g, { kind: 'mach', id: btn.id }).lines.join(' | '); if (/undefined|NaN|[—–]/.test(r + t)) bad.push('bad text: ' + r.slice(0, 200) + ' / ' + t);
    // pressing it must say why there is no ride, never throw and never queue a row the cab does not stop at
    let why; try { why = TR.pressCall(g, btn); } catch (x) { return 'pressCall threw ' + x.message; }
    if (!why || E.q.length) bad.push('a button above the home stop queued a call or said nothing: ' + why + ' q ' + E.q);
    X.decon(E); if (g.machines.items.has(btn.id)) bad.push('the button stayed after its elevator was taken down');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.audit.economy-one-item-one-elevator-and-the-hammer-pays-back-once', async () => {
    X.setup(); const bad = [], i0 = LI(), k0 = LK(); S().items = {};
    const tune = () => { g.T = g.tune(); };
    // without the unlock the bench has no elevator row at all, so nothing is sold
    delete S().up.transitLift; tune(); S().money = 5e6; const before = S().money; craft('plift', 1);
    if (S().items.plift || S().money !== before) bad.push('an elevator was crafted without Elevators: ' + JSON.stringify(S().items) + ' paid ' + (before - S().money));
    S().up.transitLift = 1; tune(); S().money = 1000; craft('plift', 1); if (S().items.plift) bad.push('an elevator was bought with 1,000 in the till');
    S().money = 1e6; craft('plift', 1); if (S().items.plift !== 1 || S().money !== 1e6 - 900000) bad.push('the bench price is not 900,000: ' + (1e6 - S().money) + ' for ' + S().items.plift);
    S().money = 1e12;
    // set it, take it down twice (a double click, a laggy friend) and once more as a guest's command: the pack gets one back, never more
    const E = X.make('plift', { i0, k0, j: 0, cy: 0, tg: null, q: [], dw: 0, dr: 1, rid: 'plift' }); S().items.plift = 0;
    X.decon(E); X.decon(E); g.net.open = true; g.net.role = 'host'; g.netSend = () => {}; try { g.netCmd('decon', { kind: 'mach', id: E.id }); } catch (x) { bad.push('a third decon threw ' + x.message); }
    if (S().items.plift !== 1) bad.push('the pack holds ' + S().items.plift + ' elevators after one was set and taken down three times');
    // an old call button of it goes with it, and is paid back at most once
    const F = X.make('plift', { i0, k0, j: 0, cy: 0, tg: null, q: [], dw: 0, dr: 1, rid: 'plift' }), btn = { id: g.nextId(), type: 'callbtn', lid: F.id, i: i0 - 1, j: 0, k: k0 + 1 }; S().entities.push(btn); g.addEntity(btn);
    X.decon(F); if (g.machines.items.has(btn.id) || S().entities.some((e) => e.id === btn.id)) bad.push('the button stayed'); if ((S().items.callbtn || 0) > 1) bad.push('the old button was paid back ' + S().items.callbtn + ' times');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.audit.a-real-collapse-over-a-landing-tunnel-leaves-the-cab-and-the-stops-honest', async () => {
    X.setup(); const bad = [], L0 = X.lift(LI(), LK(), { home: 30, depth: 24, top: 38 }), hints = [];
    X.tunnel(L0, 18, 0, 8); X.powerCab(L0, 2); TR.refreshShaft(g, L0); L0.ex = L0.tr; adv(0.7); g.ui.hint = (t) => { hints.push(String(t)); };
    if (TR.floorsOf(g, L0).join() !== '6,18,30') return 'setup stops ' + TR.floorsOf(g, L0);
    // the roof of the side tunnel lets go (the real release path: plush becomes loose bodies, falls, settles)
    // the pile around the tunnel as it is now: what settles there during the test is put back, so the next test finds the same ground
    const region = []; for (let k = L0.k0 - 2; k < L0.k0 + 7; k++) for (let i = L0.i0 - 2; i < L0.i0 + 14; i++) for (let j = 4; j < 40; j++) region.push([i, j, k, w().get(i, j, k), w().getVr(i, j, k)]);
    try {
    for (let d = 0; d < 8; d++) for (let u = 0; u < 4; u++) for (let j = 22; j <= 23; j++) { const i = L0.i0 + 4 + d, k = L0.k0 + u; if (w().get(i, j, k)) w().creaking.set((j * NZ + k) * NX + i, { i, j, k, t: 0, force: true }); }
    const forced = []; for (let d = 0; d < 8; d++) for (let u = 0; u < 4; u++) for (let j = 22; j <= 23; j++) forced.push([L0.i0 + 4 + d, j, L0.k0 + u]);
    stepSim(8); adv(1.0);
    const gone = forced.filter(([i, j, k]) => !w().get(i, j, k)).length; if (gone < 16) bad.push('the roof of the tunnel did not let go (' + gone + ' of ' + forced.length + ' cells), so this test proved nothing');
    const rv = TR.TS.rv.get(L0.id); for (let r = rv[0]; r <= rv[1]; r++) { const b = TR.rowBlock(g, L0, r); if (b) bad.push('the cab box holds ' + b + ' at row ' + r); }
    for (const s of L0.sg) if (s[1] >= 0 && !TR.landingAt(g, L0, s[0])) bad.push('a stop at row ' + s[0] + ' has no landing in the world');
    for (let r = 6; r <= 30; r++) { const ld = TR.landingAt(g, L0, r), has = L0.sg.some((q) => q[0] === r && q[1] >= 0); if (!!ld !== has) bad.push('row ' + r + ': the world says landing ' + !!ld + ', the elevator ' + has); }
    if (!Number.isFinite(L0.cy)) bad.push('cy ' + L0.cy);
    for (const t of hints) if (/NaN|undefined/.test(t)) bad.push('hint ' + t);
    return bad.length === 0 || bad.join(' || ');
    } finally { ctx.clearBodies(); for (const [i, j, k, sp, vr] of region) if (w().get(i, j, k) !== sp) { if (sp) w().setCell(i, j, k, sp, vr); else w().removeCell(i, j, k, false); } w().creaking.clear(); w().stabQueue.length = 0; }
  });

  await guard('elev.audit.a-scan-of-a-deep-shaft-with-many-landings-and-frames-is-cheap', async () => {
    X.setup(); const bad = [], L0 = X.lift(LI(), LK(), { home: 50, depth: 46, top: 58 });
    for (let r = 6; r < 50; r += 4) X.tunnel(L0, r, (r >> 2) & 3, 3);
    for (let n = 0; n < 2000; n++) w().supports.push({ x: 4000 + n, y: 5, z: 4000, r: 2, b: 1, id: 90000 + n, kind: 'timber', cap: 100, load: 0 });
    S().up.transitHoist = 1; g.T = g.tune(); TR.refreshShaft(g, L0); L0.ex = L0.tr; adv(0.7);
    const t0 = performance.now(), N = 40; for (let n = 0; n < N; n++) TR.scanShaft(g, L0, Math.floor(L0.cy / C + 1e-6)); const per = (performance.now() - t0) / N;
    w().supports = w().supports.filter((s) => s.id < 90000);
    if (per > 12) bad.push(`one scan of a 46 row shaft takes ${per.toFixed(2)} ms (it runs twice a second for every elevator)`);
    if (L0.sg.length < 8) bad.push('setup: only ' + L0.sg.length + ' stops');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.audit.a-second-elevator-cannot-be-set-in-the-first-ones-shaft-or-box-and-a-spot-below-it-is-fine', async () => {
    X.setup(); const bad = [], L0 = X.lift(LI(), LK(), { home: 30, depth: 24, top: 38 }); X.powerCab(L0, 2); adv(0.7);
    for (const [name, spot] of [['the same footprint in the shaft', { i0: L0.i0, k0: L0.k0, j: 18 }], ['half a footprint over in the shaft', { i0: L0.i0 + 2, k0: L0.k0 + 1, j: 14 }], ['one cell over at the bottom row', { i0: L0.i0 + 3, k0: L0.k0 + 3, j: 6 }], ['over the cab box', { i0: L0.i0 + 2, k0: L0.k0, j: 28 }]]) {
      const why = TR.conflictLift(g, spot); if (!why) bad.push(name + ' was allowed'); else if (/Out of the hall|not the right/.test(why)) bad.push(name + ': ' + why);
    }
    // below the served part is a different matter: the shaft there is not served, so the dig is the player's
    for (let r = 0; r < 6; r++) for (let n = 0; n < 16; n++) { const i = L0.i0 + (n & 3), k = L0.k0 + (n >> 2); if (w().get(i, r, k)) X.poke(i, r, k, 0, 0); }
    return bad.length === 0 || bad.join(' || ');
  });
}
