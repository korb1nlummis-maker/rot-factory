// elev.*: riding the elevator. The cab carries you, your cart and loose plush between the home stop, the landings and the bottom; a call panel at a landing brings it; without power
// it is turned by hand; a shaft that gets cut (plush, a belt) stops it at the last clear landing and says where; a frame that is overloaded holds nothing; saves load back whole.
import { kit } from './transit_lib.js';
import * as TR from '../transit.js';
import { infoFor } from '../info.js';
import { loadSaved } from '../state.js';

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export default async function (ctx) {
  const { T, g, S, w, p, adv, craft, toI, toK, V3, loadOn } = ctx;
  const X = kit(ctx), C = 0.6;
  const guard = (name, fn) => T(name, async () => { const h0 = g.ui.hint; try { return await fn(); } finally { g.ui.hint = h0; delete g.netSend; g.net.open = false; g.net.role = null; X.clean(); } });
  const LI = () => toI(-6), LK = () => toK(3);
  const text = (e) => infoFor(g, { kind: 'mach', id: e.id }).lines.join(' | ');
  // a 6 landing elevator: home 30 (7.2 m up the pile is 18.0 m), a tunnel south at the home row, a tunnel east at row 18, shaft rows 6 .. 29, frames the whole way
  const rig = (o = {}) => {
    X.setup(); const L0 = X.lift(LI(), LK(), { home: 30, depth: 24, top: 38, ...o });
    X.tunnel(L0, 30, 1, 6); X.tunnel(L0, 18, 0, 8); TR.refreshShaft(g, L0); L0.ex = L0.tr;
    const G = o.power === false ? null : X.powerCab(L0, o.gens ?? 2);
    p().pos.set(L0.px - 9, 0, L0.pz - 9); p().vel.set(0, 0, 0); g.keys = {}; adv(0.7);
    return { L0, G };
  };
  const board = (L0, row = L0.j) => { p().pos.set(L0.px, row * C, L0.pz); p().vel.set(0, 0, 0); adv(0.2); };

  await guard('elev.rides-between-landings-carrying-you-your-cart-and-loose-plush', async () => {
    const { L0, G } = rig(), bad = [];
    if (TR.floorsOf(g, L0).join() !== '6,18,30') return 'stops ' + TR.floorsOf(g, L0);
    board(L0); S().cart = { tier: 1, x: L0.px + 0.5, y: 18.0, z: L0.pz + 0.4, yaw: 0, mode: 'park', load: [] }; g.cart.sync();
    const sp = g.sim.spawn(2, 0, L0.px - 0.6, 18.6, L0.pz - 0.6, 0, 0, 0, 0); adv(0.3);
    if (p().liftId !== L0.id) bad.push('you are not in the cab: liftId ' + p().liftId); if (g.cart.liftId !== L0.id) bad.push('the cart is not in the cab');
    if (TR.requestFloor(g, L0, 18) !== 'ok') bad.push('request refused'); adv(0.3);
    if (!(L0.mv < 0)) bad.push('the cab is not going down'); const net = X.P.netOf(G.pole); if (!(net && net.demand > 5.9 && net.demand < 6.2)) bad.push('grid demand while moving ' + (net && net.demand));
    adv(0.5); const y1 = L0.cy; if (!(y1 < 17.0 && y1 > 15.5)) bad.push('cab height after 1.1 s ' + y1.toFixed(2)); if (Math.abs(p().pos.y - y1) > 0.01) bad.push(`you are at ${p().pos.y.toFixed(2)}, the cab at ${y1.toFixed(2)}`);
    if (Math.abs(g.S.cart.y - y1) > 0.2) bad.push(`the cart is at ${g.S.cart.y.toFixed(2)}, the cab at ${y1.toFixed(2)}`); if (Math.abs(g.sim.y[sp] - (y1 + 0.3)) > 0.12) bad.push(`the plush is at ${g.sim.y[sp].toFixed(2)}, the cab floor at ${y1.toFixed(2)}`);
    adv(3.0); if (Math.abs(L0.cy - 10.8) > 1e-6 || L0.tg !== null || L0.mv !== 0) bad.push(`the cab did not stop at 10.8 m: ${L0.cy} tg ${L0.tg} mv ${L0.mv}`);
    if (Math.abs(p().pos.y - 10.8) > 0.02 || Math.abs(g.S.cart.y - 10.8) > 0.06 || Math.abs(g.sim.y[sp] - 11.1) > 0.12) bad.push(`passengers at ${p().pos.y.toFixed(2)}, ${g.S.cart.y.toFixed(2)}, ${g.sim.y[sp].toFixed(2)}`);
    adv(0.3); const net2 = X.P.netOf(G.pole); if (net2 && net2.demand > 0.01) bad.push('an idle elevator draws ' + net2.demand);
    // step off onto the tunnel floor at the east landing: it is level with the cab
    p().pos.set(L0.px + 1.7, 10.8, L0.pz); p().vel.set(0, 0, 0); X.stepPlayer(0.6); const px = p().pos; if (Math.abs(px.y - 10.8) > 0.2 || p().liftId) bad.push(`stepping onto the landing: y ${px.y.toFixed(2)} liftId ${p().liftId}`);
    // and down to the bottom, then back up to the top
    board(L0, 18); if (TR.requestFloor(g, L0, 6) !== 'ok') bad.push('bottom refused'); adv(4.5); if (Math.abs(L0.cy - 3.6) > 1e-6 || Math.abs(p().pos.y - 3.6) > 0.05) bad.push(`at the bottom: cab ${L0.cy} you ${p().pos.y.toFixed(2)}`);
    TR.requestFloor(g, L0, 30); adv(10.0); if (Math.abs(L0.cy - 18.0) > 1e-6 || Math.abs(p().pos.y - 18.0) > 0.05) bad.push(`back at the top: cab ${L0.cy} you ${p().pos.y.toFixed(2)}`);
    // a jump leaves the cab (at the bottom, so nobody falls down the shaft)
    p().liftId = L0.id; p().pos.set(L0.px, L0.cy, L0.pz); p().vel.set(0, 6, 0); adv(0.15); if (p().liftId) bad.push('a jump did not leave the cab'); adv(1.0); g.hp = 100; g.dead = false;
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.the-following-cart-rides-with-you', async () => {
    const { L0 } = rig(), bad = [];
    board(L0); S().cart = { tier: 2, x: L0.px, y: 18.0, z: L0.pz + 3.2, yaw: 0, mode: 'follow', load: [] }; g.cart.sync(); adv(2.5);   // on the floor of the south tunnel, the home landing
    const inCab = () => Math.abs(S().cart.x - L0.px) < 1.3 && Math.abs(S().cart.z - L0.pz) < 1.3;
    if (!inCab() || g.cart.liftId !== L0.id) bad.push(`the cart did not come aboard: ${S().cart.x - L0.px}, ${S().cart.z - L0.pz} liftId ${g.cart.liftId}`);
    TR.requestFloor(g, L0, 18); adv(4.5); if (Math.abs(L0.cy - 10.8) > 1e-6) bad.push('cab at ' + L0.cy);
    if (!inCab() || Math.abs(S().cart.y - 10.8) > 0.1 || Math.abs(p().pos.y - 10.8) > 0.05) bad.push(`down at 10.8 m: cart ${S().cart.y.toFixed(2)} in the cab ${inCab()}, you ${p().pos.y.toFixed(2)}`);
    // you step off at the landing and park the cart where it is: it stays in the cab and rides on alone when someone calls the cab away
    S().cart.mode = 'park'; p().pos.set(L0.px + 1.7, 10.8, L0.pz); p().vel.set(0, 0, 0); adv(0.5); if (g.cart.liftId !== L0.id) bad.push('a parked cart came off the cab by itself');
    TR.requestFloor(g, L0, 6); adv(4.0); if (Math.abs(L0.cy - 3.6) > 1e-6 || Math.abs(S().cart.y - 3.6) > 0.1 || g.cart.liftId !== L0.id) bad.push(`the parked cart did not ride the empty cab down: cab ${L0.cy} cart ${S().cart.y.toFixed(2)} liftId ${g.cart.liftId}`);
    const car = TR.carUnder(g, { x: L0.px, y: L0.cy, z: L0.pz }); if (!car || car.id !== L0.id) bad.push('carUnder missed the cab'); if (TR.carUnder(g, { x: L0.px, y: L0.cy + 2, z: L0.pz })) bad.push('carUnder found a cab 2 m over it'); if (TR.carUnder(g, { x: L0.px + 3, y: L0.cy, z: L0.pz })) bad.push('carUnder found a cab 3 m off');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.call-panels-queue-and-the-rider-keys', async () => {
    const { L0 } = rig(), bad = [];
    // a call from the east landing panel: aim at it and press E (the real key path)
    const pp = TR.panelPos(L0, 0, 1), eye = new V3(pp.x + 1.2, 18 * C + 1.35, pp.z), look = (x, y, z) => { p().pos.set(eye.x, 18 * C, eye.z); p().vel.set(0, 0, 0); const e = p().eyePos(new V3()); p().yaw = Math.atan2(x - e.x, z - e.z); p().pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z)); g.renderer.camera.position.copy(e); };
    look(pp.x, 18 * C + 0.9, pp.z); const pk = TR.pick(g, g.renderer.camera.position, p().forward(new V3()), 3.4); if (!pk || pk.row !== 18) return 'the test does not aim at the panel: ' + JSON.stringify(pk && { row: pk.row });
    if (!TR.useKey(g)) bad.push('E at a panel did nothing'); adv(0.2); if (L0.tg !== 18 && L0.q.join() !== '18') bad.push(`the panel did not call the cab: tg ${L0.tg} q ${L0.q}`);
    adv(5.0); if (Math.abs(L0.cy - 10.8) > 1e-6) bad.push('the cab did not come to the east landing: ' + L0.cy);
    // queue: two calls go in order; a second call to the same stop is queued once; the cab waits at each stop
    adv(1.2); if (TR.requestFloor(g, L0, 6) !== 'ok' || TR.requestFloor(g, L0, 30) !== 'ok' || TR.requestFloor(g, L0, 30) !== 'queued') bad.push('queueing');
    adv(0.2); if (L0.tg !== 6 || L0.q.join() !== '30') bad.push(`target ${L0.tg} queue ${L0.q.join()}`); adv(2.7); if (Math.abs(L0.cy - 3.6) > 1e-6) bad.push('did not reach the bottom: ' + L0.cy);
    adv(0.2); if (L0.tg !== null) bad.push('it left before the dwell was over'); adv(1.0); if (L0.tg !== 30) bad.push('it did not go on to the next call: ' + L0.tg); adv(10.0); if (Math.abs(L0.cy - 18.0) > 1e-6) bad.push('did not reach the top: ' + L0.cy);
    if (TR.requestFloor(g, L0, 30) !== 'here') bad.push('the cab is at this stop'); if (!/does not stop/.test(TR.requestFloor(g, L0, 24))) bad.push('a row that is not a stop');
    // the queue is capped
    L0.q = []; L0.tg = null; L0.dw = 0; const res = []; for (const r of [6, 18, 6, 18, 6, 18, 6, 18]) res.push(TR.requestFloor(g, L0, r)); if (L0.q.length > TR.LIFT_QUEUE) bad.push('queue ' + L0.q.length);
    // rider keys: up, down, level (the next stop in the direction it last went, bouncing at the ends)
    L0.q = []; L0.tg = null; L0.dw = 0; L0.cy = 3.6; L0.dr = 1; if (/lowest/.test(TR.rideGo(g, L0, -1) || '') !== true) bad.push('down at the bottom: ' + TR.rideGo(g, L0, -1)); if (TR.rideGo(g, L0, 1) !== null) bad.push('up from the bottom'); adv(3.0); if (Math.abs(L0.cy - 10.8) > 1e-6) bad.push('up went to ' + L0.cy);
    adv(1.2); if (TR.rideGo(g, L0, 0) !== null) bad.push('level'); adv(3.0); if (Math.abs(L0.cy - 18.0) > 1e-6) bad.push('level went to ' + L0.cy);
    adv(1.2); if (TR.rideGo(g, L0, 1) !== 'The cab is at the top stop') bad.push('up at the top: ' + TR.rideGo(g, L0, 1)); if (TR.rideGo(g, L0, 0) !== null) bad.push('bounce at the top'); adv(3.0); if (Math.abs(L0.cy - 10.8) > 1e-6) bad.push('the bounce went to ' + L0.cy);
    // E in the cab: look up to go up, look down to go down (the real key path)
    adv(1.2); board(L0, 18); L0.cy = 10.8; adv(0.3); p().pos.set(L0.px, 10.8, L0.pz); adv(0.3); if (p().liftId !== L0.id) return 'setup: not in the cab';
    g.renderer.camera.position.copy(p().eyePos(new V3())); p().pitch = 0.7; if (!TR.useKey(g)) bad.push('E in the cab did nothing'); adv(0.3); if (L0.tg !== 30) bad.push('looking up with E: target ' + L0.tg);
    for (let n = 0; n < 400 && (L0.mv || L0.tg !== null || L0.dw > 0 || Math.abs(L0.cy - 18.0) > 1e-6); n++) adv(0.05); adv(0.2); p().pitch = -0.7;   // (wait for the cab to be home and idle: a loaded machine or a brownout makes the trip longer than a fixed wait) g.renderer.camera.position.copy(p().eyePos(new V3())); TR.useKey(g); adv(0.3); if (L0.tg !== 18) bad.push('looking down with E: target ' + L0.tg); p().pitch = 0;
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.without-power-it-turns-by-hand-and-the-rails-run-out-slowly', async () => {
    X.setup(); const bad = [], L0 = X.lift(LI(), LK(), { home: 24, depth: 0, top: 36, frames: false, run: false }); X.dig(L0.i0, L0.k0, 18, 23); p().pos.set(L0.px - 9, 0, L0.pz - 9); adv(0.7);
    if ((L0.pw ?? 0) > 0.05) return 'the rig has power'; if (L0.tr !== 6) return 'tr ' + L0.tr;
    // no power: the rails still run out, at a quarter of the pace, drawing nothing
    if (!L0.xc || L0.xt || TR.kwOf(L0) !== 0) bad.push(`unpowered extension: xc ${L0.xc} xt ${L0.xt} kw ${TR.kwOf(L0)}`);
    const e0 = L0.ex; adv(1.0); const v = L0.ex - e0; if (Math.abs(v - 5 * 0.25) > 0.15) bad.push(`the rails run out at ${v.toFixed(2)} rows/s without power, want 1.25`);
    adv(5.0); if (L0.ex !== 6 || L0.xc) bad.push(`the rails did not finish: ex ${L0.ex} xc ${L0.xc}`); if (TR.floorsOf(g, L0).join() !== '18,24') bad.push('stops ' + TR.floorsOf(g, L0));
    // a call (a panel or a remote request) does nothing without power: nobody is turning the crank
    TR.requestFloor(g, L0, 18); adv(1.0); if (Math.abs(L0.cy - 14.4) > 1e-6 || L0.tg !== 18) bad.push('an unpowered elevator moved on a call: ' + L0.cy); L0.q = []; L0.tg = null;
    // E in the cab, level: the next stop, by hand at a quarter speed, drawing nothing
    p().pos.set(L0.px, 14.4, L0.pz); p().vel.set(0, 0, 0); adv(0.3); if (p().liftId !== L0.id) return 'the player did not board'; p().pitch = 0; g.renderer.camera.position.copy(p().eyePos(new V3())); g.useKey(); adv(0.5);
    if (!L0.mv || !L0.crank) bad.push(`E in the cab with no power did not start the crank: mv ${L0.mv} crank ${L0.crank} q ${L0.q} tg ${L0.tg}`); if (TR.kwOf(L0) !== 0) bad.push('a hand cranked cab draws ' + TR.kwOf(L0) + ' kW');
    const y0 = L0.cy; adv(2.0); const sp = (y0 - L0.cy) / 2.0; if (Math.abs(sp - 3 * 0.25) > 0.08) bad.push(`the crank moves the cab at ${sp.toFixed(2)} m/s, want 0.75`); if (Math.abs(p().pos.y - L0.cy) > 0.02) bad.push('the rider is not on the cab');
    if (!/hand crank/.test(text(L0))) bad.push('the readout does not mention the crank'); adv(4.0); if (Math.abs(L0.cy - 10.8) > 1e-6 || L0.mv || L0.crank || L0.hand) bad.push(`the cab did not arrive and stop: cy ${L0.cy} mv ${L0.mv} crank ${L0.crank} hand ${L0.hand}`);
    // with power the same key is fast, and the crank flag is gone
    X.powerCab(L0, 3); adv(0.7); if (TR.rideGo(g, L0, 1) !== null) bad.push('up from the landing was refused'); adv(0.5); if (L0.crank || !L0.mv) bad.push('with power the cab still cranks: ' + L0.crank); const y1 = L0.cy; adv(1.0); if (Math.abs(L0.cy - y1) < 1.5) bad.push('with power the cab moved only ' + Math.abs(L0.cy - y1).toFixed(2) + ' m in a second');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.the-cab-stops-above-a-person-under-it', async () => {
    const { L0 } = rig({ power: true }), bad = [];
    board(L0); TR.requestFloor(g, L0, 6); adv(5.0); if (Math.abs(L0.cy - 3.6) > 1e-6) return 'setup: ' + L0.cy;
    TR.requestFloor(g, L0, 30); adv(11.0); if (Math.abs(L0.cy - 18.0) > 1e-6) return 'setup 2: ' + L0.cy;
    p().liftId = 0; p().pos.set(L0.px, 3.6, L0.pz); p().vel.set(0, 0, 0); adv(0.2); p().liftId = 0; TR.requestFloor(g, L0, 6); adv(0.3); adv(4.0);
    if (!L0.blk || !(L0.cy > 3.6 + 1.9 && L0.cy < 3.6 + 2.7) || L0.tg !== 6) bad.push(`the cab came down on a person: cy ${L0.cy.toFixed(2)} blk ${L0.blk}`);
    if (!/under the cab/.test(text(L0))) bad.push('the readout does not say why it stopped');
    p().pos.set(L0.px - 3.0, 3.6, L0.pz - 4); adv(2.0); if (Math.abs(L0.cy - 3.6) > 1e-6 || L0.blk) bad.push('it did not go on once they stepped out: ' + L0.cy);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.a-shaft-cut-by-a-collapse-stops-the-cab-at-the-last-clear-landing-and-says-where', async () => {
    const { L0 } = rig(), bad = [], hints = [], toasts = [], cell = [L0.i0 + 1, 14, L0.k0 + 2];
    g.ui.hint = (t) => { hints.push(String(t)); }; g.net.open = true; g.net.role = 'host'; g.netSend = (m) => { if (m.t === 'toast') toasts.push(m.text); };
    // 1. it is cut before anyone asks: the scan finds it, says where once, and a call below it is refused with the place
    w().setCell(cell[0], cell[1], cell[2], 2, 0); adv(0.7);
    if (L0.tr !== 15 || !L0.cut || L0.cut !== 15) bad.push(`after the cut: tr ${L0.tr} cut ${L0.cut} (want 15 and 15)`);
    if (TR.floorsOf(g, L0).join() !== '15,18,30') bad.push('stops after the cut ' + TR.floorsOf(g, L0)); if (!hints.some((t) => /cut at 8\.4 m: plush is in it/.test(t)) || !toasts.some((t) => /cut at 8\.4 m/.test(t))) bad.push('the cut was not reported: ' + JSON.stringify([hints, toasts]));
    let r = TR.requestFloor(g, L0, 6); if (!/cut at 8\.4 m: plush/.test(r)) bad.push('a call below the cut was not refused with where: ' + r); const n = hints.length; adv(1.5); if (hints.length !== n) bad.push('the same cut was announced again');
    if (!/Stopped: The shaft is cut at 8\.4 m: plush is in it\. Dig it out/.test(text(L0))) bad.push('the readout does not say where it is cut: ' + text(L0).slice(0, 300));
    r = TR.requestFloor(g, L0, 18); if (r !== 'ok') bad.push('the clear landing above the cut was refused: ' + r); board(L0); adv(0.1);
    // 2. it is dug out: the rails run out again and the bottom is served
    w().setCell(cell[0], cell[1], cell[2], 0, 0); adv(0.7); if (L0.cut || L0.tr !== 24) bad.push(`after digging it out: cut ${L0.cut} tr ${L0.tr}`); adv(3.0); if (L0.ex !== 24) bad.push('the rails did not run out again: ' + L0.ex);
    // 3. cut while the cab is on its way down: it stops above the plush, goes back to the last clear landing and says where
    L0.q = []; L0.tg = null; L0.dw = 0; adv(6.0); L0.cy = 18.0; L0.tg = null; L0.q = []; adv(0.2); hints.length = 0; toasts.length = 0;
    r = TR.requestFloor(g, L0, 6); if (r !== 'ok') return 'setup: ' + r; adv(1.0); if (!(L0.cy < 16 && L0.mv < 0)) bad.push('the cab did not start down: ' + L0.cy);
    w().setCell(cell[0], cell[1], cell[2], 2, 0); let low = 99; for (let q = 0; q < 80; q++) { adv(0.05); low = Math.min(low, L0.cy); } adv(4.0);
    if (low < 9.0 - 1e-6) bad.push(`the cab rode into the plush: its floor went to ${low.toFixed(2)} m, the plush tops out at 9.0 m`);
    if (L0.mv || L0.tg !== null || L0.q.length) bad.push(`the cab did not settle: cy ${L0.cy.toFixed(2)} mv ${L0.mv} tg ${L0.tg} q ${L0.q}`);
    if (!TR.floorsOf(g, L0).some((rr) => Math.abs(rr * C - L0.cy) < 0.02)) bad.push('the cab settled between stops: ' + L0.cy);
    if (L0.cut !== 15) bad.push('the cut row was not kept: ' + L0.cut); if (!hints.some((t) => /cut at 8\.4 m: plush is in it/.test(t)) || !toasts.some((t) => /cut at 8\.4 m/.test(t))) bad.push('the cut under way was not reported: ' + JSON.stringify([hints, toasts]));
    w().setCell(cell[0], cell[1], cell[2], 0, 0); adv(3.0); if (L0.cut) bad.push('the cut stayed after the dig'); r = TR.requestFloor(g, L0, 6); if (r !== 'ok' && r !== 'here') bad.push('after the dig the bottom was refused: ' + r);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.cut-above-the-cab-leaves-it-where-it-is-and-nothing-is-run-through', async () => {
    const { L0 } = rig(), bad = [], hints = [], cell = [L0.i0 + 2, 25, L0.k0 + 1];
    g.ui.hint = (t) => { hints.push(String(t)); }; g.net.open = true; g.net.role = 'host'; g.netSend = () => {};
    board(L0); TR.requestFloor(g, L0, 6); adv(5.0); if (Math.abs(L0.cy - 3.6) > 1e-6) return 'setup: ' + L0.cy;
    // plush falls into the shaft above the cab: it is cut at 15 m; the cab below cannot reach any stop that is left and stays put
    w().setCell(cell[0], cell[1], cell[2], 2, 0); adv(1.5);
    if (L0.cut !== 26 || L0.tr !== 4) bad.push(`cut ${L0.cut} tr ${L0.tr} (want 26 and 4: the home stop is 30 and the plush is in row 25)`);
    if (!hints.some((t) => /cut at 15\.0 m/.test(t))) bad.push('not reported: ' + JSON.stringify(hints));
    if (Math.abs(L0.cy - 3.6) > 1e-6 || L0.mv) bad.push('the cab moved into a cut shaft: ' + L0.cy);
    const r = TR.requestFloor(g, L0, 30); if (!/cut at 15\.0 m/.test(r)) bad.push('a call through the cut was not refused with where: ' + r);
    if (!/cut at 15\.0 m/.test(text(L0))) bad.push('the readout does not say where it is cut');
    // dug out: it runs again
    w().setCell(cell[0], cell[1], cell[2], 0, 0); adv(0.7); if (L0.cut || L0.tr !== 24) bad.push(`dug out: cut ${L0.cut} tr ${L0.tr}`); const r2 = TR.requestFloor(g, L0, 30); if (r2 !== 'ok') bad.push('after the dig the home stop was refused: ' + r2);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.load-tracing-an-overloaded-frame-holds-nothing-and-the-shoring-is-shown', async () => {
    X.setup(); const bad = [], L0 = X.lift(LI(), LK(), { home: 24, depth: 14, top: 40, frames: false }); X.powerCab(L0, 2); adv(0.7);
    if (L0.tr !== 11) return 'setup: tr ' + L0.tr;
    // a frame in the opening itself carries the roof of the 4 x 4 x 4 hole: the mountain presses on it for real (the load code, not a number the test made up)
    const fr = X.frame(L0, 24); const s = w().supports.find((q) => q.id === fr.id); if (!s) return 'the frame is not a support';
    const L1 = loadOn(w(), s); if (!(L1 > 0)) bad.push('a frame under the roof of the opening carries nothing: ' + L1);
    g.updateLoads(1.0); if (Math.abs(s.load - L1 / s.cap) > 1e-9) bad.push(`updateLoads gave ${s.load}, loadOn / cap is ${L1 / s.cap}`);
    adv(0.7); const t1 = L0.tr; X.frame(L0, 12); adv(0.7); if (L0.tr !== 14 || !(t1 < 14)) bad.push(`a second frame in the shaft did not shore it: tr ${t1} then ${L0.tr}`);
    const s2 = w().supports.find((q) => q.kind === 'timber' && Math.abs(q.y - (12 * C + 1.2)) < 0.3); s2.load = 0.9; adv(0.7); if (L0.sl < 90 || !/carries 9\d%/.test(text(L0))) bad.push('the readout does not show the shoring load: ' + L0.sl);
    // the mountain overloads it (its capacity is gone): it holds nothing, and the shaft below it is not shored
    s2.load = 1.2; adv(0.7); if (L0.tr !== t1) bad.push(`an overloaded frame still shored the shaft: tr ${L0.tr}, want ${t1} (the frame in the opening alone)`);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.readouts-hammer-and-the-old-call-button', async () => {
    const { L0 } = rig(), bad = [];
    const t = text(L0), inf = infoFor(g, { kind: 'mach', id: L0.id });
    if (inf.title !== 'ELEVATOR') bad.push('title ' + inf.title);
    for (const re of [/Cab at 18\.0 m, waiting/, /Reach: 14\.4 m below the home stop at 18\.0 m \(the shaft allows 14\.4 m, this tier 24 m\)/, /Stops: 3\.6 m \(bottom\), 10\.8 m, 18\.0 m \(home\) \(2 landings with call panels\)/, /Air at this distance is still fresh/, /Powered 100%/, /E in the cab: look up to go up/]) if (!re.test(t)) bad.push('readout lacks ' + re + ': ' + t.slice(0, 700));
    if (/[—–]|undefined|NaN/.test(t)) bad.push('bad text');
    // an old call button from an earlier save still calls the cab to its own row and goes with the elevator
    const B = X.make('callbtn', { lid: L0.id, i: L0.i0 + 5, j: 18, k: L0.k0 + 1, rid: 'callbtn' }); adv(0.3);
    const bi = infoFor(g, { kind: 'mach', id: B.id }); if (!bi || bi.title !== 'LIFT CALL BUTTON' || !/Calls the cab to 10\.8 m/.test(bi.lines.join(' '))) bad.push('old button readout ' + JSON.stringify(bi));
    if (TR.pressCall(g, B) !== null || (L0.tg !== 18 && L0.q.join() !== '18')) bad.push('the old button did not call the cab: tg ' + L0.tg + ' q ' + L0.q);
    L0.q = []; L0.tg = null;
    // the hammer: the item comes back, the cab's reserved box goes, the frames and the shaft stay, and so does the old button's pack item
    S().items = {}; X.decon(L0); if (S().items.plift !== 1 || S().items.callbtn !== 1) bad.push('hammer items ' + JSON.stringify(S().items)); if (X.ents('callbtn').length || X.ents('plift').length) bad.push('the button stayed after the elevator');
    for (const j of [30, 33]) if (X.reservedAt(L0.i0 + 1, j, L0.k0 + 1)) bad.push('the cab box stayed reserved at row ' + j); if (TR.TS.rv.has(L0.id)) bad.push('the cab box memory stayed');
    if (!w().supports.length) bad.push('the hammer took the frames of the shaft too');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.saves-and-loads-whole', async () => {
    const { L0 } = rig(), bad = [];
    X.tunnel(L0, 24, 2, 6); adv(0.7); const stops = TR.floorsOf(g, L0).join(); if (stops !== '6,18,24,30') return 'setup stops ' + stops;
    L0.cy = 10.8; const saved = JSON.parse(JSON.stringify(L0)); X.decon(L0); if (X.reservedAt(L0.i0, 18, L0.k0)) bad.push('reserved cells left behind'); S().items = {};
    S().entities.push(saved); g.addEntity(saved); adv(0.2);
    const L1 = g.machines.items.get(saved.id).ent;
    if (L1.cy !== 10.8 || L1.tr !== 24 || L1.ex !== 24 || TR.floorsOf(g, L1).join() !== stops) bad.push('loaded ' + JSON.stringify({ cy: L1.cy, tr: L1.tr, ex: L1.ex, floors: TR.floorsOf(g, L1).join() }));
    if (!X.reservedAt(L1.i0 + 1, 18, L1.k0 + 1) || !X.reservedAt(L1.i0 + 1, 21, L1.k0 + 1) || X.reservedAt(L1.i0 + 1, 22, L1.k0 + 1)) bad.push('the cab box of the loaded elevator is not reserved right (rows 18 to 21)');
    adv(0.7); if (L1.tr !== 24 || L1.cut) bad.push('the first scan after a load changed the reach: tr ' + L1.tr + ' cut ' + L1.cut);
    // an old save with only the base fields
    const old = { id: g.nextId(), type: 'plift', i0: L1.i0 + 20, k0: L1.k0, j: 0 }; S().entities.push(old); g.addEntity(old); const O = g.machines.items.get(old.id).ent;
    if (O.cy !== 0 || O.tg !== null || !Array.isArray(O.q) || O.tr !== 0 || O.ex !== 0 || TR.floorsOf(g, O).join() !== '0' || !/No shaft yet/.test(text(O))) bad.push('old save defaults ' + JSON.stringify({ cy: O.cy, tg: O.tg, q: O.q, tr: O.tr, ex: O.ex }));
    // garbage in a save is cleaned: a reach longer than the hall, a rail ahead of the shaft, stops that are not arrays
    const junk = { id: g.nextId(), type: 'plift', i0: L1.i0 + 30, k0: L1.k0, j: 5, cy: 99, tr: 999, ex: -4, sg: 'x', cut: -3, wy: 7, sl: 'a' }; S().entities.push(junk); g.addEntity(junk); const J = g.machines.items.get(junk.id).ent;
    if (!(J.cy <= 3) || J.tr !== 0 || J.ex !== 0 || !Array.isArray(J.sg) || J.cut !== 0 || J.wy !== 'bottom' || J.sl !== 0) bad.push('junk save ' + JSON.stringify({ cy: J.cy, tr: J.tr, ex: J.ex, sg: J.sg, cut: J.cut, wy: J.wy, sl: J.sl }));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('elev.a-real-save-and-load-brings-the-elevator-back-with-its-shaft', async () => {
    const { L0 } = rig(), bad = []; adv(0.7); const id = L0.id, stops = TR.floorsOf(g, L0).join();
    g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) return 'save failed';
    const sv = loadSaved(); g.loadWorld(sv.S, sv); g.noSave = true; g.mode = 'play'; adv(0.9);
    const it = g.machines.items.get(id); if (!it) return 'the elevator did not come back from the save';
    const L1 = it.ent; if (L1.tr !== 24 || L1.ex !== 24 || TR.floorsOf(g, L1).join() !== stops || L1.cy !== 18) bad.push('after a real load ' + JSON.stringify({ tr: L1.tr, ex: L1.ex, floors: TR.floorsOf(g, L1).join(), cy: L1.cy }));
    if (!X.reservedAt(L1.i0 + 1, 30, L1.k0 + 1)) bad.push('the cab box is not reserved after the load'); if (X.reservedAt(L1.i0 + 1, 20, L1.k0 + 1)) bad.push('the shaft is reserved after the load');
    if (!g.player.ride || !g.cart.support) bad.push('the player or cart hooks were not reinstalled after the load');
    X.powerCab(L1, 2); adv(0.7); board(L1); TR.requestFloor(g, L1, 18); adv(4.5); if (Math.abs(L1.cy - 10.8) > 1e-6 || Math.abs(p().pos.y - 10.8) > 0.05) bad.push('the loaded elevator does not run: ' + L1.cy);
    return bad.length === 0 || bad.join(' || ');
  });

  for (const seed of [20260506, 11, 424242]) await guard(`elev.soak.random-digging-collapse-and-calls-keep-every-invariant-seed-${seed}`, async () => {
    const { L0 } = rig({ depth: 24 }), bad = [], R = rng(seed); g.net.open = true; g.net.role = 'host'; g.netSend = () => {}; const h0 = g.ui.hint; g.ui.hint = () => {};
    const base = new Set(w().reserved), cells = [];   // the plush the test puts into the shaft and takes out again
    for (let r = 6; r < 30; r++) for (let n = 0; n < 4; n++) cells.push([L0.i0 + (n % 4), r, L0.k0 + ((n * 3 + r) % 4)]);
    p().pos.set(L0.px - 9, 0, L0.pz - 9);
    const box = () => { const r = TR.TS.rv.get(L0.id); return r; };
    let calls = 0, cuts = 0, maxDy = 0, last = L0.cy;
    for (let step = 0; step < 220 && bad.length < 4; step++) {
      const op = R();
      if (op < 0.25) {   // plush falls into the shaft, never into the box the cab is in right now
        const [i, r, k] = cells[Math.floor(R() * cells.length)], rv = box(); if (rv && r >= rv[0] - 1 && r <= rv[1] + 1) { adv(0.1); continue; } if (!w().get(i, r, k)) { w().setCell(i, r, k, 2, 0); cuts++; }
      } else if (op < 0.45) { const [i, r, k] = cells[Math.floor(R() * cells.length)]; if (w().get(i, r, k)) w().setCell(i, r, k, 0, 0); }
      else if (op < 0.85) { const fl = TR.floorsOf(g, L0); const row = fl[Math.floor(R() * fl.length)]; TR.requestFloor(g, L0, row); calls++; }
      else if (op < 0.92) { for (const [i, r, k] of cells) if (w().get(i, r, k) && R() < 0.5) w().setCell(i, r, k, 0, 0); }
      else { L0.hand = 1; }
      adv(0.1 + R() * 0.7);
      // the invariants
      const rv = box(), lo = Math.floor(L0.cy / C + 1e-6), hi = Math.ceil(L0.cy / C - 1e-6) + 3;
      if (!rv || rv[0] !== lo || rv[1] !== hi) { bad.push(`step ${step}: the reserved box ${JSON.stringify(rv)} does not match the cab rows ${lo}..${hi}`); break; }
      for (let r = lo; r <= hi; r++) if (TR.rowBlock(g, L0, r)) { bad.push(`step ${step}: the cab is inside ${TR.rowBlock(g, L0, r)} at row ${r} (cab at ${L0.cy.toFixed(2)})`); break; }
      if (!(L0.ex >= 0 && L0.ex <= Math.max(L0.tr, L0.j - lo) + 1e-9 && L0.tr >= 0 && L0.tr <= 24)) bad.push(`step ${step}: ex ${L0.ex} tr ${L0.tr} (the cab is at row ${lo})`);
      if (!(L0.cy <= 18 + 1e-9 && L0.cy >= 3.6 - 1e-9)) bad.push(`step ${step}: the cab left the shaft: ${L0.cy}`);
      const sc = TR.scanShaft(g, L0); if (sc.tr !== L0.tr && Math.abs(L0.scanAge ?? 0) < 1) { /* scans run twice a second: the ent may be a tick behind */ }
      for (const s of L0.sg) { if (!(s[0] >= 0 && s[0] <= L0.j)) bad.push(`step ${step}: the stop ${s} is outside the shaft`); if (s[1] >= 0 && !TR.landingAt(g, L0, s[0]) && step % 7 === 0) { /* a landing the world no longer shows: the next scan drops it */ } }
      maxDy = Math.max(maxDy, Math.abs(L0.cy - last)); last = L0.cy;
    }
    for (const [i, r, k] of cells) if (w().get(i, r, k)) w().setCell(i, r, k, 0, 0); adv(0.8);
    if (L0.tr !== 24 || L0.cut) bad.push(`after everything is dug out: tr ${L0.tr} cut ${L0.cut}`);
    X.decon(L0); const extra = [...w().reserved].filter((k) => !base.has(k) && !g.logi.tiles.has(k)); if (extra.length) bad.push(`${extra.length} reserved cells were left behind`);
    if (calls < 8 || cuts < 6) bad.push(`the soak only made ${calls} calls and ${cuts} cuts: it is not exercising anything`);
    g.ui.hint = h0; return bad.length === 0 || bad.join(' || ');
  });
}
