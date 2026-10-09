// audit_avalanche_guest.js: adversarial checks of the climbing avalanche for the guest side and for forged requests (src/avalanche.js).
// A guest that climbs asks the host (avclimb); the host judges it again from its own view of the guest. A guest's own odds must behave like the host's (stress fades,
// a slab on cooldown is not asked for) and a request that does not match where the guest really is does nothing.
import { kit, AV } from './avalanche_lib.js';

export default async function (ctx) {
  const { T, g, S, p, V3 } = ctx;
  const K = kit(ctx), { hi, reset, av } = K;
  const json = (m) => JSON.parse(JSON.stringify(m));
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  let sent = [];
  const fake = (x, y, z) => ({ pos: new V3(x, y, z), vel: new V3(), name: 'Friend', lampOn: true, spheres() { return [0.3, 0.8, 1.3].map((o) => ({ x: this.pos.x, y: this.pos.y + o, z: this.pos.z, r: 0.3, vel: this.vel, remote: true })); }, update() {}, set() {} });
  const done = () => { delete g.netSend; role(null); g.remote = null; g.netOut.length = 0; sent = []; };
  const asGuest = () => { role('guest'); sent = []; g.netSend = (m) => { sent.push(json(m)); }; g.mode = 'play'; };
  const roll = (v, fn) => { const o = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = o; } };
  const carry = (n) => { S().carry = []; for (let q = 0; q < n; q++) S().carry.push({ sp: 2, vr: 0 }); };
  const warnMsg = () => ({ t: 'avwarn', x: p().pos.x + 8, y: p().pos.y, z: p().pos.z, dx: 1, dz: 0, w: 10, l: 12, s: 0.4 });

  await T('avalanche.audit.a-guests-stress-fades-the-way-the-hosts-does', async () => {
    try {
      reset({}); hi(26); asGuest();
      for (let n = 0; n < 8; n++) roll(0.999, () => av().onClimbHit(p().pos, p().footCell, 0));   // every roll holds: the stress builds up
      const top = av().stress; if (top < 5) return 'the stress did not build on the guest: ' + top;
      for (let n = 0; n < 600; n++) { g.time += 0.1; av().guestUpdate(0.1); }   // a minute of walking about
      return av().stress < top - 1.5 || `the guest's stress is still ${av().stress.toFixed(2)} after a minute (the host's fades 0.04 a second)`;
    } finally { done(); reset({}); }
  });

  await T('avalanche.audit.a-guest-does-not-ask-while-the-slope-is-on-cooldown-and-keeps-its-plush', async () => {
    const bad = [];
    try {
      reset({}); hi(27); asGuest(); carry(10);
      g.netMessage(json(warnMsg())); g.netMessage({ t: 'avend', x: 0, z: 0 });   // a slab just ran (the host's 30 s cooldown has begun)
      sent = [];
      const r = roll(0, () => av().onClimbHit(p().pos, p().footCell, 10));
      if (sent.some((m) => m.t === 'cmd' && m.c === 'avclimb')) bad.push('the guest asked the host for a slab on cooldown');
      if (S().carry.length !== 10) bad.push('the guest dropped plush for a slab that cannot come: ' + S().carry.length + ' left of 10');
      if (r) bad.push('the guest was told it was a slab (the small patch slide is skipped) with no slab coming');
      return bad.length === 0 || bad.join('; ');
    } finally { done(); reset({}); }
  });

  await T('avalanche.audit.a-guest-drops-its-plush-when-the-warning-comes-not-when-it-asks', async () => {
    const bad = [];
    try {
      reset({}); hi(27); asGuest(); carry(10);
      roll(0, () => av().onClimbHit(p().pos, p().footCell, 10));
      if (!sent.some((m) => m.t === 'cmd' && m.c === 'avclimb')) return 'the guest did not ask';
      if (S().carry.length !== 10) bad.push('the plush went before the host answered: ' + S().carry.length);
      for (let n = 0; n < 200; n++) { g.time += 0.1; av().guestUpdate(0.1); }   // 20 s and the host never answered (it refused): nothing was lost
      g.netMessage(json(warnMsg())); if (S().carry.length !== 10) bad.push('a warning nobody asked for took plush: ' + S().carry.length);
      reset({}); hi(27); asGuest(); carry(10);
      roll(0, () => av().onClimbHit(p().pos, p().footCell, 10)); g.netMessage(json(warnMsg()));
      if (S().carry.length !== 5) bad.push('the answer did not take half of 10: ' + S().carry.length);
      return bad.length === 0 || bad.join('; ');
    } finally { done(); reset({}); }
  });

  await T('avalanche.audit.the-host-places-a-guests-slab-where-the-guest-really-is', async () => {
    const bad = [];
    try {
      reset({}); const q = hi(30); const pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
      role('host'); g.netSend = () => {}; g.remote = fake(pos.x, pos.y, pos.z);
      // a request 5 m off to the side (inside the old 8 m allowance): the slab is still centred on the guest
      g.netCmd('avclimb', { x: pos.x + 5, y: pos.y, z: pos.z + 1, n: 3, sp: 1 });
      if (!av().cur) bad.push('no slab for a request near the guest'); else if (Math.hypot(av().cur.x - pos.x, av().cur.z - pos.z) > 0.5) bad.push(`the slab is ${Math.hypot(av().cur.x - pos.x, av().cur.z - pos.z).toFixed(1)} m from the guest`);
      return bad.length === 0 || bad.join('; ');
    } finally { done(); reset({}); }
  });

  await T('avalanche.audit.a-forged-height-does-not-start-a-slab-for-a-guest-that-is-low', async () => {
    const bad = [];
    try {
      reset({}); hi(30); const pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
      role('host'); g.netSend = () => {};
      // the guest is really at 12 m (a slope the slab never breaks on) and claims 19.5 m
      g.remote = fake(pos.x, 12, pos.z);
      g.netCmd('avclimb', { x: pos.x, y: 19.5, z: pos.z, n: 0, sp: 0 }); if (av().cur) bad.push('a slab started for a guest at 12 m that claimed 19.5 m');
      av().clear(); reset({});
      // and a guest standing on the floor claiming the top of the pile
      g.remote = fake(pos.x, 0, pos.z); g.netCmd('avclimb', { x: pos.x, y: 30, z: pos.z }); if (av().cur) bad.push('a slab for a guest on the floor');
      av().clear(); reset({});
      // the guest really is up there
      g.remote = fake(pos.x, pos.y, pos.z); g.netCmd('avclimb', { x: pos.x, y: pos.y, z: pos.z, n: 0, sp: 0 }); if (!av().cur) bad.push('no slab for a guest really at 30 m');
      return bad.length === 0 || bad.join('; ');
    } finally { done(); reset({}); }
  });

  await T('avalanche.audit.forged-requests-are-cheap-and-never-stack', async () => {
    const bad = [];
    try {
      reset({}); hi(30); const pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
      role('host'); g.netSend = () => {}; g.remote = fake(pos.x, pos.y, pos.z);
      g.netCmd('avclimb', { x: pos.x, y: pos.y, z: pos.z }); const first = av().cur; if (!first) return 'no slab to flood';
      const t0 = performance.now(); for (let n = 0; n < 500; n++) g.netCmd('avclimb', { x: pos.x, y: pos.y, z: pos.z, n: 1e9, sp: 1e9 });
      const ms = performance.now() - t0;
      if (av().cur !== first) bad.push('a flood replaced the slab in progress'); if (ms > 150) bad.push('500 forged requests cost ' + ms.toFixed(0) + ' ms');
      for (const d of [{ x: Infinity, y: 30, z: 0 }, { x: 1, y: NaN, z: 0 }, { x: '1e999', y: 30, z: 0 }, [], 'x', 5, true]) { av().clear(); try { g.netCmd('avclimb', d); } catch (e) { bad.push('threw on ' + JSON.stringify(d)); } if (av().cur) bad.push('started on junk ' + JSON.stringify(d)); }
      return bad.length === 0 || bad.join('; ');
    } finally { done(); reset({}); }
  });
}
