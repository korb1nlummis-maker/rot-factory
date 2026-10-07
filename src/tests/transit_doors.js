import * as PD from '../plushdata.js';
// transit.*: doors (wave 5, spec 4.6). Doors are bulkhead cells while closed and empty cells while open, so every test checks the world cells, not just the ent.
import { kit, UP } from './transit_lib.js';
import * as TR from '../transit.js';
import * as EXT from '../ext.js';
import { infoFor } from '../info.js';
import { BULK } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, fresh, adv, recipes, UPGRADES, craft, selectTool, plan, toI, toK } = ctx;
  const X = kit(ctx), K = X.K;
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { X.clean(); } });
  const I0 = () => toI(-20), K0 = () => toK(4);
  const text = (r) => [r.name, r.desc, r.use, r.status, r.short].join(' ');
  // a powered door: the door, a pole 2 m from it with two burning generators, and you well out of the sensor's reach
  const powered = (o = {}) => {
    X.setup(); const D = X.door(I0(), K0(), o); const G = X.powerAt(D.px, D.pz - 2.0, 2);
    p().pos.set(D.px, 0, D.pz - 9); p().vel.set(0, 0, 0); g.keys = {}; adv(0.7);
    return { D, G };
  };

  await guard('transit.recipes-unlock-and-prices', async () => {
    const bad = [], mine = (r) => /^(door|doorkey|plift|callbtn|jump|cushion)/.test(r.id), ids = (up) => { fresh(up); g.T = g.tune(); return recipes(g).filter(mine).map((r) => r.id).join(); };
    if (ids({}) !== '') bad.push('transit recipes with no upgrades: ' + ids({}));
    if (ids({ transitDoor: 1 }) !== 'door,doorkey') bad.push('doors unlock: ' + ids({ transitDoor: 1 }));
    if (ids({ transitDoor: 1, transitBlast: 1 }) !== 'door,doorkey,door:blast') bad.push('blast unlock: ' + ids({ transitDoor: 1, transitBlast: 1 }));
    if (ids({ transitLift: 1 }) !== 'plift') bad.push('lift unlock: ' + ids({ transitLift: 1 }));
    if (ids({ transitJump: 1 }) !== 'jump,cushion') bad.push('jump unlock: ' + ids({ transitJump: 1 }));
    fresh({ transitDoor: 1, transitBlast: 1, transitLift: 1, transitJump: 1 }); g.T = g.tune();
    const want = { door: 2400, 'door:blast': 36000, doorkey: 600, plift: 900000, jump: 30000, cushion: 1200 };
    for (const [id, price] of Object.entries(want)) { const r = recipes(g).find((x) => x.id === id); if (!r) { bad.push('no recipe ' + id); continue; } if (r.price !== price) bad.push(`${id} costs ${r.price}, want ${price}`); if (/[—–]|undefined|NaN/.test(text(r))) bad.push(id + ' has bad text'); if (!r.use) bad.push(id + ' has no use text'); }
    const spec = { transitDoor: ['shellPads', 4.5e6], transitBlast: ['transitDoor', 18e6], transitLift: ['shellRamps', 9e6], transitJump: ['springs', 7.5e6] };
    for (const [id, [req, cost]] of Object.entries(spec)) { const u = UPGRADES.find((x) => x.id === id); if (!u) { bad.push('no upgrade ' + id); continue; } if (u.cost[0] < cost) bad.push(`${id} is priced ${u.cost[0]}, want at least ${cost}`); if (!u.req || u.req.id !== req) bad.push(`${id} needs ${u.req && u.req.id}, want ${req}`); if (u.fresh) bad.push(id + ' has a maxed-it flag'); if (/[—–]/.test(u.desc + u.name)) bad.push(id + ' text has a dash'); }
    if (UPGRADES.find((x) => x.id === 'transitJump').req.lvl !== 3) bad.push('the jump pad needs Spring Insoles level 3');
    fresh({ transitDoor: 1 }); g.T = g.tune(); S().money = 1e9; const m0 = S().money; craft('door', 2); if (m0 - S().money !== 4800 || S().items.door !== 2) bad.push('crafting 2 doors charged ' + (m0 - S().money));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.door-sits-in-a-wall-and-the-hammer-returns-both', async () => {
    X.setup(); const bad = [], i = I0(), k = K0();
    const wl = await K.put('wall', i, k, { y: 0.6, back: 3.2 }); if (!wl.ok) return 'wall: ' + wl.why; const W = wl.made[0];
    craft('door', 1); K.equip('door'); K.aim(W.i0, W.k0 + 1, { y: 1.0, back: 3.4 });
    const pl = await plan(); if (!pl.ok) return 'aiming a door at the wall: ' + pl.why;
    if (pl.ent.replaces !== W.id || pl.ent.i0 !== W.i0 || pl.ent.k0 !== W.k0 || pl.ent.ax !== W.ax) bad.push('the plan does not replace the wall section: ' + JSON.stringify(pl.ent));
    g.placeCurrent(g.curTool());
    const D = X.ents('door')[0]; if (!D) return 'no door after placing';
    if (D.i0 !== W.i0 || D.k0 !== W.k0 || D.j !== W.j || D.ax !== W.ax || D.rid !== 'door' || D.blast) bad.push('door ent ' + JSON.stringify(D));
    if (S().entities.some((e) => e.type === 'wall')) bad.push('the wall section is still there'); if (S().items.wall !== 1) bad.push('the wall did not come back to the pack: ' + JSON.stringify(S().items)); if (S().items.door) bad.push('door item not used');
    if (!X.closedCells(D)) bad.push('the door cells are not bulkheads'); if (!TR.allDoorCells(D).every(([a, b, c]) => X.reservedAt(a, b, c))) bad.push('door cells not reserved');
    if (D.lock !== 'none' || D.auto !== true || D.tgt !== 0 || D.p !== 0 || D.st !== 'closed') bad.push('defaults ' + JSON.stringify({ lock: D.lock, auto: D.auto, tgt: D.tgt, p: D.p, st: D.st }));
    // the hammer
    K.aim(D.i0, D.k0 + 1, { y: 1.0, back: 3.4 }); selectTool('hammer'); g.updateBuild(g.curTool(), p().eyePos(new ctx.V3()), p().forward(new ctx.V3()));
    const ref = g.hammerTarget(); if (!ref || ref.id !== D.id) bad.push('the hammer does not aim at the door: ' + JSON.stringify(ref)); else g.hammerHit();
    if (g.machines.items.has(D.id) || S().entities.some((e) => e.id === D.id)) bad.push('door still there after the hammer');
    if (!X.openCells(D)) bad.push('door cells still there after the hammer'); if (TR.allDoorCells(D).some(([a, b, c]) => X.reservedAt(a, b, c))) bad.push('reserved cells left behind');
    if (S().items.door !== 1) bad.push('door not handed back: ' + JSON.stringify(S().items)); if (g.describeRef({ kind: 'mach', id: D.id }) !== null) bad.push('describeRef after removal');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.door-places-free-standing-and-blast-comes-from-its-item', async () => {
    X.setup(); const bad = [], i = I0(), k = K0();
    const r = await K.put('door:blast', i, k, { y: 1.0, back: 3.4 }); if (!r.ok) return 'blast door: ' + r.why; const D = r.made[0];
    if (D.type !== 'door' || !D.blast || D.rid !== 'door:blast' || D.auto !== false) bad.push('blast door ent ' + JSON.stringify(D));
    if (!X.closedCells(D)) bad.push('blast cells'); if (TR.doorSec(D) !== 1.6) bad.push('blast takes ' + TR.doorSec(D));
    // a guest cannot ask for a blast door with a plain door item
    const tool = { id: 'door', kind: 'door' }, j = D.j, e2 = { type: 'door', ax: D.ax, i0: D.i0 + 8, k0: D.k0, j, blast: true };
    if (TR.conflictDoor(g, e2, tool)) bad.push('a clean spot was refused: ' + TR.conflictDoor(g, e2, tool));
    S().items.door = 1; const made = TR.buildDoor(g, tool, e2); if (!made || made.blast) bad.push('the message chose blast: ' + JSON.stringify(made));
    // refusals: bad numbers, bad axis, plush in the way, a wall that is not there, a spot taken
    for (const [name, e] of [['float', { ...e2, i0: 1.5 }], ['string', { ...e2, k0: '3' }], ['axis', { ...e2, ax: 'q' }], ['row', { ...e2, j: -2 }], ['no wall', { ...e2, replaces: 99999 }], ['taken', { ...e2, i0: D.i0, k0: D.k0 }]]) if (!TR.conflictDoor(g, e, tool)) bad.push(name + ' was allowed');
    const px = D.ax === 'z' ? e2.i0 : e2.i0 + 1, pz = D.ax === 'z' ? e2.k0 + 1 : e2.k0;
    for (let q = 0; q < 3; q++) w().setCell(px, 1 + q, pz, 2, 0); if (!/Dig out|solid/.test(TR.conflictDoor(g, e2, tool) || '')) bad.push('plush in the gap was allowed'); for (let q = 0; q < 3; q++) w().setCell(px, 1 + q, pz, 0, 0);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.door-snaps-to-a-pad-edge-like-a-wall', async () => {
    X.setup(); const bad = [], i = I0(), k = K0();
    const pd = await K.put('pad:timber', i, k, { y: 0.6, back: 2.6 }); if (!pd.ok) return 'pad: ' + pd.why; const P0 = pd.made[0];
    const r = await K.put('door', P0.i0 + 1, P0.k0 + 3, { y: 0.6, back: 3.2 }); if (!r.ok) return 'door on the pad: ' + r.why; const D = r.made[0];
    if (D.j !== P0.j + 1 || D.ax !== 'x' || D.i0 !== P0.i0 || D.k0 !== P0.k0 + 3) bad.push('the door is not on the pad edge: ' + JSON.stringify({ j: D.j, ax: D.ax, i0: D.i0, k0: D.k0 }) + ' pad ' + JSON.stringify({ i0: P0.i0, k0: P0.k0, j: P0.j }));
    if (!X.closedCells(D)) bad.push('cells'); if (g.world.get(D.i0, D.j - 1, D.k0) !== PD.PAD) bad.push('the door does not stand on the pad');
    // the pad under it cannot be taken away from under it... but the door can go first, and the pad stays
    X.decon(D); if (!X.openCells(D) || g.world.get(D.i0, D.j - 1, D.k0) !== PD.PAD) bad.push('taking the door down damaged the pad');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.door-opens-and-frees-cells', async () => {
    const { D, G } = powered({ auto: false }); const bad = [];
    if (!X.closedCells(D)) bad.push('not closed to begin with'); if (!((D.pw ?? 0) > 0.99)) bad.push('door pw ' + D.pw);
    const r = g.setCfg(D, { tgt: 1 }); if (!r.ok) return 'refused: ' + r.why;
    adv(0.45);   // about 0.56 of the way: the leaf has passed the middle of rows 0 and 1
    const rows = [0, 1, 2, 3].map((q) => TR.doorCells(D, q).every(([a, b, c]) => w().get(a, b, c) === 0) ? 'o' : TR.doorCells(D, q).every(([a, b, c]) => w().get(a, b, c) === BULK) ? 'b' : '?').join('');
    if (rows !== 'oobb') bad.push(`half way the rows read ${rows} (p ${D.p.toFixed(2)}), want oobb`); if (D.st !== 'opening') bad.push('state ' + D.st);
    if (!(D.draw && TR.kwOf(D) === 0.8)) bad.push('not drawing 0.8 kW while it moves'); const net = X.P.netOf(G.pole); if (!(net && net.demand > 0.79 && net.demand < 0.85)) bad.push('grid demand ' + (net && net.demand));
    adv(0.6); if (!X.openCells(D) || D.p !== 1 || D.st !== 'open') bad.push(`not open: p ${D.p} state ${D.st}`); if (D.draw) bad.push('still drawing after it stopped'); adv(0.2);
    const net2 = X.P.netOf(G.pole); if (net2 && net2.demand > 0.01) bad.push('an idle door draws ' + net2.demand);
    g.setCfg(D, { tgt: 0 }); adv(1.0); if (!X.closedCells(D) || D.p !== 0 || D.st !== 'closed') bad.push(`not closed again: p ${D.p} state ${D.st}`);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.door-blast-door-is-slower-and-draws-more', async () => {
    const { D, G } = powered({ blast: true }); const bad = []; g.setCfg(D, { tgt: 1 }); adv(0.9);
    if (D.p > 0.6 || D.p < 0.45) bad.push('after 0.9 s a blast door is at ' + D.p.toFixed(2) + ' (1.6 s to open)');
    if (TR.kwOf(D) !== 2.4) bad.push('blast draw ' + TR.kwOf(D)); const net = X.P.netOf(G.pole); if (!(net && net.demand > 2.3 && net.demand < 2.5)) bad.push('grid demand ' + (net && net.demand));
    adv(1.0); if (!X.openCells(D)) bad.push('not open after 1.9 s');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.door-unpowered-stays-and-the-hand-crank-works', async () => {
    X.setup(); const D = X.door(I0(), K0(), { auto: false }), bad = []; p().pos.set(D.px, 0, D.pz - 9); adv(0.7);
    if ((D.pw ?? 0) > 0.05) bad.push('powered with no grid'); if (!X.closedCells(D)) bad.push('not closed');
    // nothing moves it by itself
    D.tgt = 1; adv(1.5); if (D.p !== 0 || !X.closedCells(D)) bad.push('an unpowered door moved on its own: p ' + D.p); D.tgt = 0;
    const r = g.setCfg(D, { tgt: 1 }); if (!r.ok) return 'E on an unpowered door was refused: ' + r.why; if (!D.crank) bad.push('no crank flag');
    adv(1.0); if (!(D.p > 0.25 && D.p < 0.37)) bad.push('after 1 s the crank is at ' + D.p.toFixed(2) + ', want about 0.31'); if (D.draw) bad.push('a crank draws power'); if (X.openCells(D)) bad.push('open too soon');
    adv(2.5); if (!X.openCells(D) || D.p !== 1 || D.crank) bad.push(`not open: p ${D.p} crank ${D.crank}`);
    // it stays where it is left, and it can be cranked half way and left there
    adv(2); if (D.p !== 1) bad.push('it moved by itself'); g.setCfg(D, { tgt: 0 }); adv(1.2); const mid = D.p; D.crank = false; adv(2); if (D.p !== mid) bad.push('it moved with no crank and no power'); if (!(mid > 0.4 && mid < 0.95)) bad.push('mid ' + mid);
    // a power lock cannot be cranked: nobody is trapped by a locked door, but it only works with power
    g.setCfg(D, { lock: 'power' }); const r2 = g.setCfg(D, { tgt: 1 }); if (r2.ok || !/power/i.test(r2.why || '')) bad.push('a power lock gave way to the crank: ' + JSON.stringify(r2));
    // power comes back: a half open door goes on at full speed
    const G = X.powerAt(D.px, D.pz - 2.0, 2); g.setCfg(D, { lock: 'none' }); adv(0.7); const r3 = g.setCfg(D, { tgt: 1 }); if (!r3.ok) bad.push('refused with power: ' + r3.why); adv(1.0); if (D.p !== 1) bad.push('with power it is at ' + D.p);
    void G; return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.door-never-closes-on-a-person-a-cart-or-plush', async () => {
    const { D } = powered({ auto: false }); const bad = [];
    // try to close for `sec` seconds, watching the lowest the leaf gets and any cell that appears at (ci, ck) in rows 0..2 (where a 1.7 m person stands; the row over their head may fill)
    const attempt = (sec, ci, ck) => { let min = 1, cell = 0; g.setCfg(D, { tgt: 0 }); for (let q = 0; q < sec / 0.05; q++) { adv(0.05); min = Math.min(min, D.p); for (let j = 0; j < 3; j++) if (w().get(ci, j, ck) === BULK) cell++; } return { min, cell }; };
    g.setCfg(D, { tgt: 1 }); adv(1.2); if (!X.openCells(D)) return 'setup: not open';
    // you in the doorway
    p().pos.set(D.px, 0, D.pz); p().vel.set(0, 0, 0); let r = attempt(2.0, toI(p().pos.x), toK(p().pos.z));
    if (r.min < 0.3) bad.push('the door came down on a person: lowest ' + r.min.toFixed(2)); if (r.cell) bad.push('a bulkhead cell appeared on the person'); if (D.tgt !== 1 || D.p !== 1) bad.push('it did not reverse: tgt ' + D.tgt + ' p ' + D.p); if (D.blk !== 'person') bad.push('blk ' + D.blk);
    if (!/someone in the doorway/.test(infoFor(g, { kind: 'mach', id: D.id }).lines.join(' '))) bad.push('the readout does not say why');
    // step out and it closes
    p().pos.set(D.px, 0, D.pz - 9); adv(0.2); r = attempt(1.2, 0, 0); if (!X.closedCells(D)) bad.push('it would not close with nobody there: p ' + D.p);
    // a cart in the doorway
    g.setCfg(D, { tgt: 1 }); adv(1.2); S().cart = { tier: 1, x: D.px, y: 0, z: D.pz, yaw: 0, mode: 'park', load: [] }; g.cart.sync(); r = attempt(2.0, toI(D.px), toK(D.pz));
    if (r.min < 0.3 || D.p !== 1 || D.blk !== 'cart') bad.push('a cart in the doorway: lowest ' + r.min.toFixed(2) + ' p ' + D.p + ' blk ' + D.blk); S().cart = null; g.cart.sync();
    // plush that slid into the doorway: the sill row cannot fill, so it stops there and goes back up
    g.setCfg(D, { tgt: 1 }); adv(1.2); w().setCell(toI(D.px), 0, toK(D.pz), 2, 0); r = attempt(2.0, 0, 0);
    if (!(r.min > 0.1 && r.min < 0.2) || D.blk !== 'plush' || w().get(toI(D.px), 0, toK(D.pz)) !== 2) bad.push('plush in the doorway: lowest ' + r.min.toFixed(2) + ' blk ' + D.blk);
    w().setCell(toI(D.px), 0, toK(D.pz), 0, 0); g.setCfg(D, { tgt: 0 }); adv(1.4); if (!X.closedCells(D)) bad.push('it would not close once the plush was gone');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.door-locks-key-and-power', async () => {
    const { D } = powered({ auto: false, lock: 'key' }); const bad = [];
    const r = g.setCfg(D, { tgt: 1 }); if (r.ok || !/Door Key/.test(r.why || '')) bad.push('no key: ' + JSON.stringify(r)); if (D.tgt !== 0) bad.push('target changed');
    S().items.doorkey = 1; const r2 = g.setCfg(D, { tgt: 1 }); if (!r2.ok) bad.push('with a key: ' + r2.why); adv(1.2); if (!X.openCells(D)) bad.push('not open with the key');
    // the key is shared like every item and is not used up
    if (S().items.doorkey !== 1) bad.push('the key was used up'); delete S().items.doorkey; const r3 = g.setCfg(D, { tgt: 0 }); if (r3.ok) bad.push('closing a key door without the key worked');
    // a key door with the sensor on opens only for a key holder
    S().items.doorkey = 1; g.setCfg(D, { auto: true, tgt: 0 }); adv(1.2); if (!X.closedCells(D)) return 'setup: not closed';
    delete S().items.doorkey; p().pos.set(D.px, 0, D.pz - 1.5); adv(1.5); if (D.p !== 0) bad.push('the sensor opened a key door for someone with no key');
    S().items.doorkey = 1; adv(1.5); if (D.p !== 1) bad.push('the sensor did not open it for a key holder: p ' + D.p);
    // power lock: only works with power
    g.setCfg(D, { lock: 'power', auto: false }); const r4 = g.setCfg(D, { tgt: 0 }); if (!r4.ok) bad.push('a power lock refused with power: ' + r4.why);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.door-sensor-opens-for-you-and-closes-behind-you', async () => {
    const { D } = powered({ auto: true }); const bad = [];
    adv(0.5); if (D.p !== 0) bad.push('opened with nobody near');
    p().pos.set(D.px, 0, D.pz - 2.2); p().vel.set(0, 0, 0); adv(1.2); if (D.p !== 1 || !X.openCells(D)) bad.push('the sensor did not open it: p ' + D.p);
    p().pos.set(D.px, 0, D.pz - 4.5); adv(1.5); if (D.p !== 1) bad.push('it closed before the 2 s hold');
    adv(2.2); if (D.p !== 0 || !X.closedCells(D)) bad.push('it did not close behind you: p ' + D.p);
    // a door with the sensor off does not react
    g.setCfg(D, { auto: false }); p().pos.set(D.px, 0, D.pz - 1.5); adv(1.5); if (D.p !== 0) bad.push('an Auto off door opened for you');
    // no power: the sensor is dead
    g.setCfg(D, { auto: true }); for (const t of [...L().tiles.values()]) if (t.type === 'gen') t.burn = 0; adv(1.5); p().pos.set(D.px, 0, D.pz - 1.2); adv(1.5); if (D.p !== 0) bad.push('the sensor worked with no power: p ' + D.p);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.blast-door-counts-as-anchor', async () => {
    // a cavity under a roof of plush: a closed door beside it anchors the roof (cavityLen 0), an open door does not
    X.setup(); const bad = [], D = X.door(I0(), K0(), { blast: true, ax: 'x', auto: false }), j = 1;
    const ci = D.i0 + 1, ck = D.k0 - 1;   // the cell just in front of the door, on its -z side
    // a roof of plush at row 6 over a 9 x 9 area so the pile is not open there
    const roof = []; for (let dk = -5; dk <= 4; dk++) for (let di = -4; di <= 5; di++) { const a = ci + di, c = ck + dk; if (!w().get(a, 6, c)) { w().setCell(a, 6, c, 2, 0); roof.push([a, 6, c]); } }
    try {
      const closed = w().cavityLen(ci, j, ck, 12); if (closed !== 0) bad.push('beside a closed blast door the cavity length is ' + closed + ', want 0 (anchored)');
      if (!D.anchors || !D.blast) bad.push('flags anchors ' + D.anchors + ' blast ' + D.blast);
      for (let q = 0; q < 4; q++) for (const [a, b, c] of TR.doorCells(D, q)) w().setCell(a, b, c, 0, 0);
      const open = w().cavityLen(ci, j, ck, 12); if (!(open > 0)) bad.push('beside an open doorway the cavity length is still ' + open);
      TR.setRows(g, D, 0); if (w().cavityLen(ci, j, ck, 12) !== 0) bad.push('closing it again did not anchor the cavity');
      // it holds like a wall: a closed door is bulkhead cells, which never fall and are never roof
      const c0 = TR.doorCells(D, 3)[0]; w().stabQueue.push({ i: c0[0], j: c0[1], k: c0[2] }); adv(0.3); if (w().get(...c0) !== BULK) bad.push('a door cell fell or was removed');
    } finally { for (const [a, b, c] of roof) w().setCell(a, b, c, 0, 0); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.door-readout-and-copy-paste', async () => {
    const { D } = powered({ auto: true }); const bad = [], ref = { kind: 'mach', id: D.id };
    let inf = infoFor(g, ref); if (!inf || !/DOOR/.test(inf.title) || !/CLOSED/.test(inf.title)) bad.push('title ' + (inf && inf.title));
    const all = () => infoFor(g, ref).lines.join(' | '); if (!/Lock: none/.test(all()) || !/Sensor on/.test(all()) || !/Powered 100%/.test(all())) bad.push('lines ' + all());
    g.setCfg(D, { lock: 'key', auto: false }); if (!/Lock: key/.test(all()) || !/Sensor off/.test(all())) bad.push('after settings ' + all());
    g.setCfg(D, { tgt: 1 }); S().items.doorkey = 1; g.setCfg(D, { tgt: 1 }); adv(0.4); if (!/OPENING/.test(infoFor(g, ref).title) || !/Opening \d+%/.test(all())) bad.push('mid move ' + infoFor(g, ref).title + ' ' + all());
    adv(1); if (!/OPEN/.test(infoFor(g, ref).title)) bad.push('open title');
    if (/[—–]|undefined|NaN/.test(all() + infoFor(g, ref).title)) bad.push('bad text');
    // copy and paste: Shift+E copies lock and sensor, E pastes into another door
    const D2 = X.door(I0() + 8, K0(), { auto: true }); const r = EXT.copyCfg(g, D); if (!r || r.group !== 'doorcfg' || Object.keys(r.vals).sort().join() !== 'auto,lock') bad.push('copied ' + JSON.stringify(r));
    const pr = EXT.pasteCfg(g, D2); if (!pr.ok || D2.lock !== 'key' || D2.auto !== false) bad.push('pasted ' + JSON.stringify(pr) + ' ' + D2.lock + D2.auto); g.cfgClip = null;
    // bad settings are refused whole
    const bad1 = g.setCfg(D, { lock: 'laser' }); const bad2 = g.setCfg(D, { tgt: 2 }); const bad3 = g.setCfg(D, { p: 1 }); if (bad1.ok || bad2.ok || bad3.ok) bad.push('a bad setting was accepted');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('transit.door-saves-and-loads-and-an-old-save-is-fine', async () => {
    const { D } = powered({ auto: false }); const bad = [];
    g.setCfg(D, { tgt: 1, lock: 'power' }); adv(1.2); const saved = JSON.parse(JSON.stringify(D));
    // the ent as the save file holds it, taken down and brought back (the cells stay in the saved world)
    const id = D.id; g.machines.disposeObj(g.machines.items.get(id).obj); g.machines.root.remove(g.machines.items.get(id).obj); g.machines.items.delete(id); S().entities = S().entities.filter((e) => e.id !== id);
    for (const [a, b, c] of TR.allDoorCells(saved)) g.world.reserved.delete(X.idx(a, b, c));
    S().entities.push(saved); g.addEntity(saved); const D2 = g.machines.items.get(id).ent;
    if (D2.lock !== 'power' || D2.tgt !== 1 || D2.p !== 1 || D2.st !== 'open') bad.push('loaded ' + JSON.stringify({ lock: D2.lock, tgt: D2.tgt, p: D2.p, st: D2.st })); if (!X.openCells(D2)) bad.push('open door cells');
    // a door left half way settles where it was heading, and its cells follow
    const half = JSON.parse(JSON.stringify(D2)); half.p = 0.4; half.tgt = 0; half.id = g.nextId(); half.i0 += 8; half.f = undefined; half.st = 'closing'; S().entities.push(half); g.addEntity(half); const H = g.machines.items.get(half.id).ent;
    if (H.p !== 0 || !X.closedCells(H)) bad.push('a half open save did not settle closed: p ' + H.p);
    // a save with only the old fields (no lock, no sensor, no state): defaults
    const old = { id: g.nextId(), type: 'door', ax: 'x', i0: I0() + 16, k0: K0(), j: 0 }; S().entities.push(old); g.addEntity(old); const O = g.machines.items.get(old.id).ent;
    if (O.lock !== 'none' || O.auto !== true || O.tgt !== 0 || O.p !== 0 || O.blast !== false || !X.closedCells(O)) bad.push('old save defaults ' + JSON.stringify({ lock: O.lock, auto: O.auto, p: O.p }));
    // text keys of a damaged save
    const junk = { id: g.nextId(), type: 'door', ax: 'q', i0: I0() + 24, k0: K0(), j: 0, lock: 'laser', p: 'x', tgt: 7 }; S().entities.push(junk); g.addEntity(junk); const J = g.machines.items.get(junk.id).ent;
    if (J.ax !== 'x' || J.lock !== 'none' || J.p !== 0 || J.tgt !== 1) bad.push('junk normalized to ' + JSON.stringify({ ax: J.ax, lock: J.lock, p: J.p, tgt: J.tgt }));
    return bad.length === 0 || bad.join(' || ');
  });
}
