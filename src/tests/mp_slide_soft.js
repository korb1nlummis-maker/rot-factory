// mp.slide.soft-*: the host simulates a soft slide (softslide.js), the guest sees, hears and feels the same flow and reads its own burial from the same cells,
// a guest that climbs asks with `sslide` and the host judges it again, forged messages change nothing.
import { sk, AV, SS } from './slide_soft_lib.js';

export default async function (ctx) {
  const { g, S, p, w, sim, stepSim, V3 } = ctx;
  const K = sk(ctx), { ss, seeded, play, slide, stand, key, reset, av, plush, tagged, toI, toJ, toK, cellX, cellZ, C, heart } = K;
  const T = async (name, fn) => ctx.T(name, async () => { try { return await fn(); } finally { delete g.climbRisk; delete g.netSend; role(null); g.remote = null; g.netOut.length = 0; sent = []; g.keys = {}; reset({}); ss().clear(); } });
  const json = (m) => JSON.parse(JSON.stringify(m));
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  let sent = [];
  const fake = (x, y, z) => ({ pos: new V3(x, y, z), vel: new V3(), name: 'Friend', lampOn: true, spheres() { return [0.3, 0.8, 1.3].map((o) => ({ x: this.pos.x, y: this.pos.y + o, z: this.pos.z, r: 0.3, vel: this.vel, remote: true })); }, update() {}, set() {} });
  const hostOn = (remote) => { role('host'); sent = []; g.netSend = (m) => { sent.push(json(m)); }; g.netOut.length = 0; if (remote) g.remote = remote; };
  const done = () => { delete g.netSend; role(null); g.remote = null; g.netOut.length = 0; sent = []; };
  const spy = (obj, name, log) => { const o = obj[name]; obj[name] = function (...a) { log.push([name, ...a]); return o.apply(this, a); }; return () => { obj[name] = o; }; };

  await T('mp.slide.soft-host-sends-the-slide-inside-the-rate-and-size-limits-and-the-guest-sees-it', async () => {
    const bad = [];
    stand(24); hostOn(fake(p().pos.x + 6, p().pos.y - 6, p().pos.z + 4));
    const a = seeded(61, () => slide(0.5)); if (!a) return 'no slide';
    const types = {}; let secs = 0, maxBodies = 0, maxMsg = 0, removed = 0, total = 0, bytes0 = 0, sec0 = 0, worst = 0; const msgs = [];
    seeded(161, () => {
      for (let f = 0; f < 60 * 25 && (av().cur || f < 5); f++) {
        g.time += 1 / 60; stepSim(1 / 60, 1 / 60); g.netUpdate(1 / 60); secs += 1 / 60;
        for (const m of sent.splice(0)) {
          const len = JSON.stringify(m).length; total += len; bytes0 += len; types[m.t] = (types[m.t] || 0) + 1; maxMsg = Math.max(maxMsg, len);
          if (m.t === 'bodies') maxBodies = Math.max(maxBodies, m.a.length / 11);
          if (m.t === 'cells') for (let c = 0; c < m.a.length; c += 5) if (m.a[c + 3] === 0) removed++;
          if (/^av/.test(m.t)) msgs.push(m);
        }
        if (secs - sec0 >= 1) { worst = Math.max(worst, bytes0); bytes0 = 0; sec0 = secs; }
      }
    });
    const last = av().last;
    if (types.avwarn !== 1 || types.avend !== 1) bad.push(`avwarn x${types.avwarn} avend x${types.avend}`);
    if (!msgs.find((m) => m.t === 'avwarn' && m.k === 's') || !msgs.find((m) => m.t === 'avend' && m.k === 's')) bad.push('the messages do not say it is a soft slide');
    if (!(types.avrun >= 1 && types.avrun <= Math.ceil(secs * 2) + 2)) bad.push(`avrun x${types.avrun} in ${secs.toFixed(1)} s`);
    if (maxBodies > 300) bad.push('bodies in one message ' + maxBodies); if (maxMsg > 40000) bad.push('a message of ' + maxMsg); if (worst > 450 * 1024) bad.push('a second of ' + (worst / 1024).toFixed(0) + ' KB');
    if (!last || removed < last.released) bad.push(`cells removed on the wire ${removed} < released ${last && last.released}`);
    // the guest hears them
    role(null); g.netOut.length = 0; g.remote = null; reset({}); ss().clear();
    role('guest'); g.mode = 'play'; const log = [], un = [spy(av(), 'sfx', log), spy(g.fx, 'dust', log)];
    try {
      p().pos.set(msgs[0].x + 3, msgs[0].y - 8, msgs[0].z); g.shake = 0; av().cool = 0; ss().armT = 0;
      for (const m of msgs) g.netMessage(json(m));
      const kinds = (k) => log.filter((l) => l[0] === 'sfx' && l[1] === k).length;
      if (kinds('creak') < 1) bad.push('no creak on the guest'); if (kinds('rumble') < 1) bad.push('no rumble on the guest'); if (kinds('thud') !== 1) bad.push('thuds ' + kinds('thud'));
      if (!log.some((l) => l[0] === 'dust')) bad.push('no dust on the guest');
      if (av().cool !== AV.COOL_SOFT) bad.push('guest cooldown ' + av().cool); if (!(ss().armT > 0)) bad.push('the guest does not watch its own burial after the end');
      // forged messages: nothing, and no throw
      log.length = 0;
      for (const m of [{ t: 'avwarn', k: 's', x: 'a', y: 1, z: 1, dx: 1, dz: 0, w: 5 }, { t: 'avwarn', k: 's' }, { t: 'avend', k: 's', x: null, z: {} }, { t: 'avrun', k: 's', x: NaN, y: 0, z: 0, p: 1, n: 3 }, { t: 'avwarn', k: 's', x: 1, y: 1, z: 1, dx: 'up', dz: 0, w: 5 }, { t: 'avwarn', k: 's', x: 1, y: 1, z: 1, dx: 1, dz: 0, w: {} }]) { try { g.netMessage(json(m)); } catch (e) { bad.push('threw on ' + JSON.stringify(m).slice(0, 60)); } }
      if (log.filter((l) => l[0] === 'sfx' && l[1] !== 'rumble' && l[1] !== 'debris').length) bad.push('forged messages made sound');
    } finally { for (const u of un) u(); }
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.slide.soft-a-guest-asks-with-sslide-and-the-host-judges-it-again', async () => {
    const bad = [];
    // the guest's footing gives way: it asks, it does not run a slide of its own
    const q = stand(14); role('guest'); sent = []; g.netSend = (m) => { sent.push(json(m)); }; g.mode = 'play'; S().carry.push({ sp: 2, vr: 0 }, { sp: 2, vr: 0 });
    delete g.climbRisk; const o = Math.random; Math.random = () => 0; g._climbT = 5; try { g.climbRisk(0.1); } finally { Math.random = o; }
    const cmd = sent.find((m) => m.t === 'cmd' && m.c === 'sslide'); if (!cmd) return 'the guest sent no sslide: ' + JSON.stringify(sent.map((m) => m.t + (m.c || '')));
    if (sent.some((m) => m.t === 'cmd' && (m.c === 'avclimb' || m.c === 'patch'))) bad.push('it also sent a slab or patch request');
    if (av().cur) bad.push('the guest ran a slide of its own');
    // a second roll while the first is pending sends nothing
    sent.length = 0; Math.random = () => 0; g._climbT = 5; try { g.climbRisk(0.1); } finally { Math.random = o; } if (sent.some((m) => m.c === 'sslide')) bad.push('asked twice');
    const pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
    // the host judges: forged and out of place requests do nothing
    role(null); g.netOut.length = 0; av().clear(); ss().clear(); hostOn(fake(pos.x, pos.y, pos.z)); g.climbRisk = () => {};
    const cases = [
      ['far from the guest', { ...cmd.d, x: cmd.d.x + 40 }], ['too low', { ...cmd.d, y: 3 }, () => { g.remote.pos.y = 3; }], ['junk', { x: 'a', y: 2, z: 3 }], ['nothing', null], ['strings', { x: '1e999', y: '1', z: 'q' }],
      ['roped in', cmd.d, () => { g.ropedIn = () => true; }],
    ];
    for (const [name, d, setup] of cases) {
      g.remote = fake(pos.x, pos.y, pos.z); ss().guestCd = 0; delete g.ropedIn; if (setup) setup();
      try { g.netCmd('sslide', json(d)); } catch (e) { bad.push(name + ' threw'); } if (av().cur) bad.push('a slide started: ' + name); av().clear(); delete g.ropedIn;
    }
    g.remote = fake(pos.x, pos.y, pos.z); ss().guestCd = 0; g.netCmd('sslide', json(cmd.d));
    const a = av().cur; if (!a || !a.soft || a.by !== 'guest') return bad.concat('the host did not run the guest\'s soft slide').join('; ');
    // and not again at once
    av().clear(); g.netCmd('sslide', json(cmd.d)); if (av().cur) bad.push('a second request within the gap started another slide');
    // a flood of requests starts at most one slide per gap
    let started = 0; for (let n = 0; n < 50; n++) { av().clear(); g.time += 0.1; g.netCmd('sslide', json(cmd.d)); if (av().cur) started++; } if (started > 1) bad.push('a flood started ' + started + ' slides');
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.slide.soft-a-friend-standing-in-the-runout-is-buried-by-the-same-pile-and-reads-its-depth-from-the-cells', async () => {
    const bad = [];
    const q = stand(26), P = { x: p().pos.x, y: p().pos.y, z: p().pos.z }; p().pos.set(P.x + 40, 0, P.z + 40);   // (the host's player is somewhere else)
    hostOn(fake(P.x + 40, 0, P.z + 40));
    const a = seeded(62, () => ss().start(P, { e: 0.6, warn: 0.2, by: 'test' })); if (!a) return 'no slide';
    seeded(162, () => { let t = 0; while (av().cur && t < 25) { g.time += 1 / 60; g.updatePlay(1 / 60); t += 1 / 60; } });
    if (!ss().pend) return 'the landing is not waiting for anyone';
    // a friend stands in the heart of the landed pile, still
    const hd = heart(a); if (!hd || hd.sum < 30) return 'no pile landed ' + JSON.stringify(hd);
    g.remote.pos.set(cellX(hd.i), w().topAt(hd.i, hd.k) * C, cellZ(hd.k)); g.remote.vel.set(0, 0, 0);
    seeded(163, () => play(4));
    const l = ss().last && ss().last.landings.find((x) => x.who === 'guest'); if (!l) return 'the friend was not part of the landing ' + JSON.stringify(ss().last);
    // the guest reads its depth from the same cells
    const here = ss().cover(g.remote.pos);
    if (l.pool < SS.POOL_MIN) bad.push('nothing landed on the friend ' + JSON.stringify(l)); else if (l.lvl < 1) bad.push('landed pile ' + l.pool + ' but not buried: ' + JSON.stringify(l));
    if (here.lvl !== l.lvl) bad.push(`the cells say ${here.lvl}, the landing says ${l.lvl}`);
    const at = { x: g.remote.pos.x, y: g.remote.pos.y, z: g.remote.pos.z };
    done(); role('guest'); g.mode = 'play'; p().pos.set(at.x, at.y, at.z); p().vel.set(0, 0, 0); ss().armT = 0; ss().on = false; ss().arm();
    play(1.5); if (l.lvl >= 1 && !(ss().on && ss().lvl === l.lvl)) bad.push(`the guest's own manager: on ${ss().on} lvl ${ss().lvl}, landing ${l.lvl}`);
    if (l.lvl >= 3 && !g.trapOn) bad.push('the guest is not trapped at depth ' + l.lvl);
    return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(l);
  });

  await T('mp.slide.soft-the-ride-never-kills-the-guest-and-a-soft-slide-hurts-nobody', async () => {
    const bad = [];
    role('guest'); g.mode = 'play'; g.hp = 14; av().rideSoft = true; av().rideT = 0.5;
    for (let n = 0; n < 15; n++) g.hurtPlayer(40, 'were crushed under falling plush'); g.hurtPlayer(30, 'the pile gave way'); g.hurtPlayer(30, AV.WHY);
    if (g.hp !== 14) bad.push('a soft slide hurt the guest: ' + g.hp);
    g.hurtPlayer(80, 'fell too far'); if (g.hp < 11 || g.hp > 14 || g.dead) bad.push('a fall while carried cost ' + (14 - g.hp));
    g.hp = 100; av().rideSoft = false; av().rideT = 0; g.hurtPlayer(30, 'were crushed under falling plush'); if (g.hp !== 70) bad.push('hurt outside a slide was changed: ' + g.hp);
    return bad.length === 0 || bad.join('; ');
  });
}
