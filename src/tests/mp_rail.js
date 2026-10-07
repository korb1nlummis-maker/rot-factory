// mp.rail.*: the Mine Rail in multiplayer with no network (one page plays both roles by switching g.net.role and capturing g.netSend).
// The host owns the track, the stations and every cart, simulates them and announces them (ent+, and xrow rows for the moving carts). A guest only draws what it is told,
// rides with the position the rows give it, and asks with the `rail` command (rush, sit, leave, load), `place`, `decon` and `cfg`.
import { makeRail } from './rail_lib.js';
import { infoFor } from '../info.js';
import { TYPES } from '../catalog.js';

export default async function (ctx) {
  const { T, g, S, p, adv, V3, NEEDLE, cellX, cellZ } = ctx;
  const X = makeRail(ctx), R = X.R;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); g.remote = null; g.netOut.length = 0; };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); X.clean(); } });
  const fakeRemote = (pos) => ({ pos, update() {}, lampOn: false, yaw: 0, pitch: 0 });
  const idle = (car) => car.st !== 'run' && (car.spd || 0) === 0;
  const railEnts = () => S().entities.filter((e) => R.isRailType(e.type));
  // forget every rail thing on this side, the way a fresh guest has nothing
  const wipe = () => { for (const e of railEnts()) { if (e.type === 'rail') g.world.reserved.delete(R.keyOf(e)); g.removeViewEnt(e.id); } R.invalidate(g); R.reset(g); };
  const asGuest = (plus) => { wipe(); done(); role('guest'); cap(); for (const m of plus) g.netMessage(json(m)); R.invalidate(g); R.sync(g, true); };
  const cmdFromGuest = (cmd) => { const keep = g.remote; done(); role('host'); cap(); g.remote = keep || fakeRemote(new V3(0, 0, 0)); g.netMessage(json(cmd)); };
  const hostSetup = () => { X.setup(); role('host'); cap(); g.remote = fakeRemote(new V3(-100, 0, 0)); return X.std(); };

  await guard('mp.rail.guest-sees-track-stations-and-carts-like-the-host', async () => {
    const s = hostSetup(), bad = [];
    const announced = ofType('ent+').filter((m) => R.isRailType(m.ent.type)); if (announced.length !== railEnts().length) bad.push(`host announced ${announced.length} of ${railEnts().length}`);
    g.setCfg(s.car, { name: 'Betsy' }); if (!ofType('ent-').some((m) => m.id === s.car.id)) bad.push('a rename did not re-announce the cart');
    const plus = railEnts().map((e) => ({ t: 'ent+', ent: g.stripEnt(e) }));
    for (const m of plus) { if ('path' in m.ent || 'cache' in m.ent || (m.ent.type === 'railcar' && 'cargo' in m.ent)) bad.push(m.ent.type + ' carries transient fields: ' + Object.keys(m.ent).join()); }
    const hostRow = { t: 'xrow', k: 'railcar', d: R.row(g) }, hostInfo = {}, hostComps = R.sync(g).comps.map((c) => c.n).join();
    for (const e of railEnts()) hostInfo[e.id] = JSON.stringify(infoFor(g, { kind: 'mach', id: e.id }));
    asGuest(plus.map((m) => ({ ...m, ent: { ...m.ent } }))); g.netMessage(json(hostRow));   // power and speed ride the 0.5 s row, not the placement message
    const ents = railEnts(); if (ents.length !== plus.length || ents.some((e) => !e.view)) bad.push('guest ents ' + ents.length);
    const rs = R.sync(g); if (rs.comps.map((c) => c.n).join() !== hostComps || rs.stns.length !== 2 || rs.cars.length !== 1) bad.push('guest graph ' + rs.comps.map((c) => c.n));
    for (const e of ents) { if (!g.machines.items.get(e.id)) bad.push(e.type + ' has no object'); const gi = JSON.stringify(infoFor(g, { kind: 'mach', id: e.id })); if (gi !== hostInfo[e.id]) bad.push(`${e.type} readout differs: ${gi} vs ${hostInfo[e.id]}`); }
    const car = ents.find((e) => e.type === 'railcar'); if (car.name !== 'Betsy' || Math.abs(car.x - s.car.x) > 1e-6) bad.push('cart fields ' + car.name + ' ' + car.x);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.rail.rows-carry-power-and-line-speed-to-the-guest', async () => {
    const s = hostSetup(), bad = []; adv(0.8);
    sent.length = 0; g._extRow = 0; adv(0.6);
    const rows = ofType('xrow').filter((m) => m.k === 'railcar'); if (!rows.length) return 'the host sent no rail row';
    const full = rows.find((m) => m.d.stns && m.d.stns.length === 2); if (!full) return 'no row with the stations: ' + JSON.stringify(rows[0]).slice(0, 120);
    if (!full.d.stns.some((a) => a[1] > 0.9)) bad.push('station power missing from the row ' + JSON.stringify(full.d.stns));
    const plus = railEnts().map((e) => ({ t: 'ent+', ent: { ...g.stripEnt(e), ...(e.type === 'railstn' ? { pw: 0 } : {}) } })); asGuest(plus);
    if (R.lineSpeed(g, R.keyOf(s.base)) !== R.HAND_SPEED) bad.push('before the row the guest line is not cranked: ' + R.lineSpeed(g, R.keyOf(s.base)));
    g.netMessage(json(full)); const sp = R.lineSpeed(g, R.keyOf(S().entities.find((e) => e.type === 'railstn'))); if (Math.abs(sp - 8) > 0.01) bad.push('guest line speed after the row ' + sp);
    const stn = S().entities.find((e) => e.type === 'railstn'); const i = infoFor(g, { kind: 'mach', id: stn.id }); if (!i.lines.some((l) => /Powered/.test(l))) bad.push('guest station readout ' + i.lines.join('|'));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.rail.guest-rides-with-a-synced-position-and-gets-off', async () => {
    const s = hostSetup(), car = s.car, bad = []; adv(0.8);
    const plus = railEnts().map((e) => ({ t: 'ent+', ent: g.stripEnt(e) }));
    // the guest stands by the cart and asks to sit, then asks to rush home
    g.remote = fakeRemote(new V3(car.x - 1.2, 0, car.z));
    cmdFromGuest({ t: 'cmd', c: 'rail', d: { act: 'sit', id: car.id } }); if (!car.riders.includes('guest')) return 'the host did not seat the guest: ' + JSON.stringify(car.riders);
    cmdFromGuest({ t: 'cmd', c: 'rail', d: { act: 'rush' } }); if (car.st !== 'run') return 'the guest rush did not start the cart: ' + car.st;
    // run the host and record the rows with the cart's true position at that time
    sent.length = 0; const rec = [];
    for (let n = 0; n < 200 && !(idle(car) && n > 6); n++) { adv(0.05, 0.05); g.remote.pos.set(car.x, car.y, car.z); rec.push({ time: g.time, car: { x: car.x, y: car.y, z: car.z, spd: car.spd }, n: sent.length }); }
    const log = sent.slice(), rowIdx = []; log.forEach((m, n) => { if (m.t === 'xrow' && m.k === 'railcar' && m.d.cars && m.d.cars.length) rowIdx.push(n); }); if (rowIdx.length < 10) bad.push('only ' + rowIdx.length + ' rows for the ride');
    const hostEnd = { x: car.x, y: car.y, z: car.z, a: car.a };
    // the guest side: ents, then the rows in order, one per 0.05 s frame of the recorded ride
    asGuest(plus); const gcar = railEnts().find((e) => e.type === 'railcar'); const pos0 = { x: gcar.x, z: gcar.z };
    let worst = 0, worstP = 0, seated = 0, moved = 0; let ri = 0;
    for (const r of rec) {
      g.time = r.time; while (ri < rowIdx.length && rowIdx[ri] < r.n) { g.netMessage(json(log[rowIdx[ri]])); ri++; }
      adv(0.05, 0.05); g.time = r.time;
      const gc = railEnts().find((e) => e.type === 'railcar'); worst = Math.max(worst, Math.hypot(gc.x - r.car.x, gc.z - r.car.z));
      if (R.seatedCar(g, 'guest')) { seated++; worstP = Math.max(worstP, Math.hypot(p().pos.x - gc.x, p().pos.z - gc.z)); }
      if (Math.hypot(gc.x - pos0.x, gc.z - pos0.z) > 2) moved++;
    }
    if (seated < rec.length * 0.9) bad.push('the guest was seated for ' + seated + ' of ' + rec.length + ' frames');
    if (worstP > 0.3) bad.push('the guest rider strayed ' + worstP.toFixed(2) + ' m from its cart');
    if (worst > 2.0) bad.push('the guest cart view was ' + worst.toFixed(2) + ' m from the host cart');
    if (!moved) bad.push('the guest cart never moved');
    const gc = railEnts().find((e) => e.type === 'railcar'); if (Math.hypot(gc.x - hostEnd.x, gc.z - hostEnd.z) > 0.6) bad.push('the guest cart ended ' + Math.hypot(gc.x - hostEnd.x, gc.z - hostEnd.z).toFixed(2) + ' m from the host');
    // getting off: Space on the guest sends `leave`
    sent.length = 0; g.keys.Space = true; adv(0.1); g.keys.Space = false; const leave = sent.find((m) => m.t === 'cmd' && m.c === 'rail' && m.d.act === 'leave'); if (!leave) bad.push('no leave command: ' + JSON.stringify(sent.map((m) => m.c || m.t)));
    if (R.seatedCar(g, 'guest')) bad.push('the guest still believes it is seated');
    cmdFromGuest(leave || { t: 'cmd', c: 'rail', d: { act: 'leave' } }); if (car.riders.includes('guest')) bad.push('the host kept the guest seated');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.rail.two-players-share-a-cart-and-a-third-is-refused', async () => {
    const s = hostSetup(), car = s.car, bad = []; adv(0.5);
    p().pos.set(car.x - 1, 0, car.z); R.useCar(g, car, 'host');
    g.remote = fakeRemote(new V3(car.x + 1, 0, car.z)); cmdFromGuest({ t: 'cmd', c: 'rail', d: { act: 'sit', id: car.id } });
    if (car.riders.join() !== 'host,guest') bad.push('seats ' + car.riders.join());
    const mask = R.row(g).cars[0][9]; if (mask !== 3) bad.push('row mask ' + mask);
    // the host presses rush: both ride home together, and both stay at the cart
    R.rush(g, 'host'); let sep = 0, fr = 0; X.until(() => { g.remote.pos.set(car.x, car.y, car.z); if (++fr > 2) sep = Math.max(sep, Math.hypot(p().pos.x - car.x, p().pos.z - car.z)); return idle(car); }, 20);
    if (car.a !== R.keyOf(s.base)) bad.push('did not get home'); if (sep > 0.4) bad.push('host rider strayed ' + sep.toFixed(2));
    // a third rider has no seat
    const sl = X.sayLog(); try { const full = R.seat(g, car, 'third'); if (full) bad.push('a third person got a seat'); } finally { sl.restore(); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.rail.each-player-rides-their-own-cart-on-the-same-track', async () => {
    const s = hostSetup(), a = s.car, b = X.cart(s.iFace + 4, 0, s.k), bad = []; adv(0.5);
    p().pos.set(a.x - 1, 0, a.z); R.useCar(g, a, 'host'); g.remote = fakeRemote(new V3(b.x - 1, 0, b.z)); cmdFromGuest({ t: 'cmd', c: 'rail', d: { act: 'sit', id: b.id } });
    if (!a.riders.includes('host') || !b.riders.includes('guest')) return 'seating ' + a.riders + ' | ' + b.riders;
    R.rush(g, 'host'); cmdFromGuest({ t: 'cmd', c: 'rail', d: { act: 'rush' } }); if (a.st !== 'run' || b.st !== 'run') bad.push('both should be running: ' + a.st + ' ' + b.st);
    X.until(() => { g.remote.pos.set(b.x, b.y, b.z); return idle(a) && idle(b); }, 25);
    // carts never overlap: one stands on the base station, the other queues behind it within two pieces
    { const near = (c) => Math.hypot(c.x - cellX(s.iBase), c.z - cellZ(s.k)) < 1.9; if (!(a.a === R.keyOf(s.base) || b.a === R.keyOf(s.base)) || !near(a) || !near(b) || Math.hypot(a.x - b.x, a.z - b.z) < R.HEADWAY - 0.03) bad.push('not both home and queued'); }
    // a person is only ever in one cart: sitting in the other one moves them
    R.useCar(g, b, 'host'); if (a.riders.includes('host') || !b.riders.includes('host')) bad.push('host in two carts: ' + a.riders + ' | ' + b.riders);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.rail.a-late-joiner-gets-the-running-cart-its-riders-and-the-track', async () => {
    const s = hostSetup(), car = s.car, bad = []; adv(0.5); p().pos.set(car.x - 1, 0, car.z); R.useCar(g, car, 'host'); R.rush(g, 'host'); adv(1.2);
    for (let n = 0; n < 5; n++) car.cargo.push({ sp: 3, vr: 0 }); car.n = 5;
    const list = S().entities.map((e) => g.stripEnt(e)).filter((e) => R.isRailType(e.type)), hostCar = { x: car.x, z: car.z, st: car.st };
    const wire = json(list);
    for (const e of wire) if (e.type === 'railcar' && ('cargo' in e || 'path' in e)) bad.push('the world list carries transient cart fields');
    wipe(); done(); role('guest'); cap(); g.netMessage({ t: 'ents', list: wire }); R.invalidate(g);
    const gc = railEnts().find((e) => e.type === 'railcar'); if (!gc) return 'no cart for the late joiner';
    if (Math.hypot(gc.x - hostCar.x, gc.z - hostCar.z) > 0.01 || gc.st !== 'run' || !gc.riders.includes('host') || gc.n !== 5) bad.push('cart state ' + JSON.stringify({ x: gc.x, st: gc.st, riders: gc.riders, n: gc.n }));
    const rs = R.sync(g); if (rs.nodes.size !== s.track.length || rs.stns.length !== 2) bad.push('track ' + rs.nodes.size);
    // the first row after joining keeps it moving
    g.netMessage({ t: 'xrow', k: 'railcar', d: { cars: [[gc.id, gc.x + 1, gc.y, gc.z, gc.yaw, 0, 8, 'run', 5, 1, 12, '']] } }); adv(0.1); if (!(gc.gx > hostCar.x)) bad.push('the row did not apply');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.rail.guest-commands-are-checked-by-the-host', async () => {
    const s = hostSetup(), car = s.car, bad = []; adv(0.5);
    g.remote = fakeRemote(new V3(car.x - 60, 0, car.z));
    cmdFromGuest({ t: 'cmd', c: 'rail', d: { act: 'sit', id: car.id } }); if (car.riders.length) bad.push('a far guest was seated');
    sent.length = 0; cmdFromGuest({ t: 'cmd', c: 'rail', d: { act: 'load', id: car.id, items: [[3, 0], [4, 0]] } }); const give = ofType('give')[0]; if (car.cargo.length || !give || give.items.length !== 2) bad.push('a far guest loaded: ' + car.cargo.length);
    g.remote = fakeRemote(new V3(car.x - 1, 0, car.z)); sent.length = 0;
    cmdFromGuest({ t: 'cmd', c: 'rail', d: { act: 'load', id: car.id, items: [[3, 0], [NEEDLE, 0], [5, 1]] } }); const back = ofType('give')[0];
    if (car.cargo.length !== 2 || !back || back.items.length !== 1 || back.items[0].sp !== NEEDLE) bad.push('load: ' + car.cargo.length + ' ' + JSON.stringify(back));
    sent.length = 0; const many = []; for (let n = 0; n < 200; n++) many.push([3, 0]); cmdFromGuest({ t: 'cmd', c: 'rail', d: { act: 'load', id: car.id, items: many } }); if (car.cargo.length !== R.CAR_CAP) bad.push('cap ' + car.cargo.length);
    for (const d of [null, 5, 'x', { act: 'nope' }, { act: 'sit', id: 999999 }, { act: 'load', id: car.id, items: 'x' }, { act: 'load', id: car.id, items: [[NaN, 1], ['a']] }, { act: 'rush', extra: { a: 1 } }]) { try { cmdFromGuest({ t: 'cmd', c: 'rail', d }); } catch (e) { bad.push('threw on ' + JSON.stringify(d)); } }
    if (car.cargo.length > R.CAR_CAP) bad.push('over capacity');
    // placement: the host re-checks the item and the cell
    done(); role('host'); cap(); const tools = [{ id: 'frame:timber', kind: 'rail' }, { id: 'rail', kind: 'rail' }];
    const k = X.ck(0.5), i = X.ci(-6);
    if (!g.placeConflict(tools[0], { type: 'rail', i, j: 0, k })) bad.push('a wrong item placed track'); if (g.placeConflict(tools[1], { type: 'rail', i, j: 0, k })) bad.push('a good placement was refused: ' + g.placeConflict(tools[1], { type: 'rail', i, j: 0, k }));
    if (!g.placeConflict(tools[1], { type: 'rail', i: 1.5, j: 0, k })) bad.push('fractional cell accepted'); if (!g.placeConflict(tools[1], { type: 'rail', i, j: 3, k })) bad.push('a floating cell accepted');
    if (!g.placeConflict({ id: 'railcar', kind: 'railcar' }, { type: 'railcar', i, j: 0, k })) bad.push('a cart placed where there is no track');
    S().items.rail = 3; sent.length = 0; g.netMessage(json({ t: 'cmd', c: 'place', d: { tool: tools[1], ent: { type: 'rail', i, j: 0, k } } }));
    if (!X.ents('rail').some((e) => e.i === i && e.k === k) || S().items.rail !== 2 || !ofType('ent+').some((m) => m.ent.type === 'rail')) bad.push('guest placement did not land: ' + S().items.rail);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.rail.guest-hammer-and-station-role-go-through-the-host', async () => {
    const s = hostSetup(), bad = []; adv(0.4);
    const stn = s.face; const plus = railEnts().map((e) => ({ t: 'ent+', ent: g.stripEnt(e) })); asGuest(plus);
    const gs = railEnts().find((e) => e.id === stn.id); const r = g.setCfg(gs, { role: 'base' }); const cmd = sent.find((m) => m.t === 'cmd' && m.c === 'cfg');
    if (!r.ok || !cmd || cmd.d.patch.role !== 'base') bad.push('cfg command ' + JSON.stringify(cmd)); if (gs.role !== 'face') bad.push('the guest changed its own copy');
    sent.length = 0; g.cmd('decon', { kind: 'mach', id: s.track[3].id }); const dec = sent.find((m) => m.t === 'cmd' && m.c === 'decon'); if (!dec) bad.push('no decon command');
    // the host applies both
    wipe(); done(); role('host'); cap(); X.setup(); const s2 = X.std(); const stn2 = s2.face; g.netMessage(json({ t: 'cmd', c: 'cfg', d: { id: stn2.id, patch: { role: 'base' } } })); if (stn2.role !== 'base') bad.push('host did not apply the role');
    const ph = s2.track[3]; g.netMessage(json({ t: 'cmd', c: 'decon', d: { kind: 'mach', id: ph.id } })); R.invalidate(g); if (R.sync(g).nodes.has(R.keyOf(ph))) bad.push('host did not remove the piece');
    if (!ofType('ent-').some((m) => m.id === ph.id)) bad.push('no ent- for the removed piece');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.rail.guest-e-on-a-cart-loads-the-bag-then-sits-through-the-host', async () => {
    const s = hostSetup(), car = s.car, bad = []; adv(0.5);
    const hostEnts = railEnts(), plus = hostEnts.map((e) => ({ t: 'ent+', ent: g.stripEnt(e) })); asGuest(plus); const gc = railEnts().find((e) => e.type === 'railcar');
    S().carry = [{ sp: 3, vr: 0 }, { sp: NEEDLE, vr: 0 }, { sp: 4, vr: 1 }]; sent.length = 0; TYPES.railcar.use(g, gc);
    const load = sent.find((m) => m.t === 'cmd' && m.c === 'rail' && m.d.act === 'load'); if (!load || load.d.items.length !== 2 || load.d.id !== car.id) bad.push('load command ' + JSON.stringify(load));
    if (S().carry.length !== 1 || S().carry[0].sp !== NEEDLE) bad.push('the guest bag after loading: ' + JSON.stringify(S().carry));
    sent.length = 0; TYPES.railcar.use(g, gc); const sit = sent.find((m) => m.t === 'cmd' && m.c === 'rail' && m.d.act === 'sit'); if (!sit) bad.push('with a bag holding only The One, E should sit: ' + JSON.stringify(sent.map((m) => m.c || m.t)));
    wipe(); done(); role('host'); cap(); for (const e of hostEnts) { S().entities.push(e); g.addEntity(e); } R.invalidate(g); g.remote = fakeRemote(new V3(car.x - 1, 0, car.z));
    if (load) cmdFromGuest(load); if (sit) cmdFromGuest(sit);
    if (car.cargo.length !== 2 || !car.riders.includes('guest')) bad.push('host state: cargo ' + car.cargo.length + ' riders ' + car.riders);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.rail.a-friend-who-leaves-gives-up-the-seat-and-a-pending-call', async () => {
    const s = hostSetup(), car = s.car, bad = []; adv(0.5);
    g.remote = fakeRemote(new V3(car.x - 1, 0, car.z)); cmdFromGuest({ t: 'cmd', c: 'rail', d: { act: 'sit', id: car.id } }); if (!car.riders.includes('guest')) return 'not seated';
    car.call = 'guest'; g.remote = null; adv(0.2);
    if (car.riders.length || car.call) bad.push('the seat or the call stayed after the friend left: ' + JSON.stringify([car.riders, car.call]));
    return bad.length === 0 || bad.join(' || ');
  });

  void cellX; void cellZ;
}
