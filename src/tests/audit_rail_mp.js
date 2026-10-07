import * as PD from '../plushdata.js';
// audit_mp.rail.*: the Mine Rail commands a guest can send, thrown at the host with bad and forged data (src/rail.js runCmd). Same no-network harness as mp_rail.js.
import { makeRail } from './rail_lib.js';

export default async function (ctx) {
  const { T, g, S, adv, V3, NEEDLE } = ctx;
  const X = makeRail(ctx), R = X.R;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); g.remote = null; g.netOut.length = 0; };
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); X.clean(); } });
  const fakeRemote = (pos) => ({ pos, update() {}, lampOn: false, yaw: 0, pitch: 0 });
  const cmdFromGuest = (cmd) => { const keep = g.remote; done(); role('host'); cap(); g.remote = keep || fakeRemote(new V3(0, 0, 0)); g.netMessage(json(cmd)); };
  const hostSetup = () => { X.setup(); role('host'); cap(); g.remote = fakeRemote(new V3(-100, 0, 0)); return X.std(); };

  await guard('audit_mp.rail.forged-plush-in-a-guest-load-never-reaches-the-cart', async () => {
    // a guest can send any numbers: a species that does not exist would throw inside the host's sale loop on every frame the cart sits at the bin
    const s = hostSetup(), car = s.car, bad = []; adv(0.5);
    g.remote = fakeRemote(new V3(car.x - 1, 0, car.z));
    cmdFromGuest({ t: 'cmd', c: 'rail', d: { act: 'load', id: car.id, items: [[999999, 0], [-4, 0], [PD.PAD, 0], [PD.BULK, 0], [3.5, 0], [3, 70000], [3, -1], [3, 1.5], [3, 0]] } });
    if (car.cargo.length !== 1 || car.cargo[0].sp !== 3 || car.cargo[0].vr !== 0) bad.push('cargo ' + JSON.stringify(car.cargo));
    // the cart sells whatever it holds: no throw
    X.until(() => false, 0.1); R.dispatch(g, car, R.keyOf(s.base)); let threw = null;
    try { X.until(() => car.st !== 'run' && car.spd === 0, 25); X.until(() => car.cargo.length === 0, 6); } catch (e) { threw = e; }
    if (threw) bad.push('the host threw: ' + threw.message);
    if (car.cargo.length) bad.push('still carrying ' + car.cargo.length);
    void NEEDLE; void S;
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('audit_mp.rail.a-far-guest-cannot-set-a-derailed-cart-back-on-the-track', async () => {
    const s = hostSetup(), car = s.car, bad = []; adv(0.5);
    car.st = 'derailed'; car.cache.init = true; car.spd = 0;
    g.remote = fakeRemote(new V3(car.x - 80, 0, car.z));
    cmdFromGuest({ t: 'cmd', c: 'rail', d: { act: 'sit', id: car.id } });
    if (car.st === 'idle') bad.push('a guest 80 m away re-railed the cart');
    g.remote = fakeRemote(new V3(car.x - 1.2, 0, car.z));
    cmdFromGuest({ t: 'cmd', c: 'rail', d: { act: 'sit', id: car.id } });
    if (car.st !== 'idle') bad.push('a guest beside the cart could not re-rail it: ' + car.st);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('audit_mp.rail.a-guest-stays-seated-while-a-fast-cart-brakes-for-them', async () => {
    // the guest side used to step off at once and stand on the track at 8 m/s until the next row seated them again
    const s = hostSetup(), car = s.car, bad = []; adv(0.5);
    done(); role('guest'); cap(); car.riders = ['guest']; car.st = 'run'; car.spd = 8; car.cache.leftAt = undefined;
    g.keys.Space = true; adv(0.1); g.keys.Space = false;
    const leave = sent.filter((m) => m.t === 'cmd' && m.c === 'rail' && m.d.act === 'leave');
    if (leave.length !== 1) bad.push('leave commands sent: ' + leave.length);
    if (!R.seatedCar(g, 'guest')) bad.push('the guest stepped off a cart doing 8 m/s');
    car.st = 'idle'; car.spd = 0; adv(0.1); g.keys.Space = true; adv(0.1); g.keys.Space = false;
    if (R.seatedCar(g, 'guest')) bad.push('the guest could not get off a stopped cart');
    return bad.length === 0 || bad.join(' || ');
  });
}
