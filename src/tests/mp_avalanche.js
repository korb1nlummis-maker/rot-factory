// mp.avalanche.*: the host simulates a climbing avalanche, the guest sees, hears and feels the same slide, a guest climbing starts one on the host,
// both players can be swept, and the network stays inside its limits (numbers are logged with the test).
import { kit, AV } from './avalanche_lib.js';

export default async function (ctx) {
  const { T, g, S, p, sim, stepSim, V3 } = ctx;
  const K = kit(ctx), { hi, reset, go, av, plush, tagged } = K;
  const json = (m) => JSON.parse(JSON.stringify(m));
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  let sent = [];
  const fake = (x, y, z) => ({ pos: new V3(x, y, z), vel: new V3(), name: 'Friend', lampOn: true, spheres() { return [0.3, 0.8, 1.3].map((o) => ({ x: this.pos.x, y: this.pos.y + o, z: this.pos.z, r: 0.3, vel: this.vel, remote: true })); }, update() {}, set() {} });
  const done = () => { delete g.netSend; role(null); g.remote = null; g.netOut.length = 0; sent = []; };
  const hostOn = (remote) => { role('host'); sent = []; g.netSend = (m) => { sent.push(json(m)); }; g.netOut.length = 0; if (remote) g.remote = remote; };
  const spy = (obj, name, log) => { const o = obj[name]; obj[name] = function (...a) { log.push([name, ...a]); return o.apply(this, a); }; return () => { obj[name] = o; }; };

  await T('mp.avalanche.host-sends-the-slide-inside-the-rate-and-size-limits', async () => {
    const bad = [];
    try {
      reset({}); const q = hi(30); hostOn(fake(p().pos.x + 6, p().pos.y - 6, p().pos.z + 4));
      const a = go({ warn: 0.3 }); if (!a) return 'no slab';
      const n = a.n, per = [], types = {}; let secs = 0, maxBodies = 0, maxMsg = 0, maxType = '', cellMsgs = 0, removed = 0, maxCells = 0;
      const dt = 1 / 60; let sec0 = 0, bytes0 = 0, worst = 0, total = 0;
      for (let f = 0; f < 60 * 30 && (av().cur || f < 5); f++) {
        g.time += dt; stepSim(dt, dt); g.netUpdate(dt); secs += dt;
        for (const m of sent.splice(0)) {
          const len = JSON.stringify(m).length; total += len; bytes0 += len; types[m.t] = (types[m.t] || 0) + 1;
          if (len > maxMsg) { maxMsg = len; maxType = m.t; }
          if (m.t === 'bodies') maxBodies = Math.max(maxBodies, m.a.length / 11);
          if (m.t === 'cells') { cellMsgs++; maxCells = Math.max(maxCells, m.a.length / 5); for (let c = 0; c < m.a.length; c += 5) if (m.a[c + 3] === 0) removed++; }
        }
        if (secs - sec0 >= 1) { worst = Math.max(worst, bytes0); bytes0 = 0; sec0 = secs; }
      }
      const last = av().last; const kbps = total / secs / 1024;
      const info = { cells: n, secs: +secs.toFixed(1), types, maxBodiesInMsg: maxBodies, biggestMsg: maxMsg + ' chars (' + maxType + ')', worstSecondKB: +(worst / 1024).toFixed(0), avgKBps: +kbps.toFixed(0), cellMsgs, maxCellsInMsg: maxCells, removedCells: removed };
      console.log('mp avalanche network', JSON.stringify(info));
      if (typeof window !== 'undefined') window.__avNet = info;
      if (types.avwarn !== 1) bad.push('avwarn x' + types.avwarn); if (types.avend !== 1) bad.push('avend x' + types.avend);
      if (!(types.avrun >= 2 && types.avrun <= Math.ceil(secs * 2) + 2)) bad.push(`avrun x${types.avrun} in ${secs.toFixed(1)} s (2 a second at most)`);
      if (maxBodies > 300) bad.push('bodies in one message ' + maxBodies); if (maxMsg > 40000) bad.push('a message of ' + maxMsg + ' chars');
      if (worst > 450 * 1024) bad.push('a second of ' + (worst / 1024).toFixed(0) + ' KB');
      if (!last || removed < last.released) bad.push(`cells removed on the wire ${removed} < released ${last && last.released}`);
      if (maxCells > 800) bad.push('cell message of ' + maxCells);
      if (!bad.length) S().stats.__avNet = undefined;
      return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(info);
    } finally { done(); reset({}); }
  });
  await T('mp.avalanche.the-guest-sees-hears-and-feels-the-same-slide', async () => {
    const bad = [];
    try {
      // the host's messages, recorded
      reset({}); hi(30); hostOn(fake(p().pos.x + 6, p().pos.y - 6, p().pos.z + 4));
      const a = go({ warn: 0.3 }); if (!a) return 'no slab';
      const msgs = []; for (let f = 0; f < 60 * 30 && (av().cur || f < 5); f++) { g.time += 1 / 60; stepSim(1 / 60, 1 / 60); g.netUpdate(1 / 60); for (const m of sent.splice(0)) if (/^av/.test(m.t)) msgs.push(m); }
      done(); reset({});
      // the guest hears them
      role('guest'); g.mode = 'play'; const log = [], unspy = [spy(av(), 'sfx', log), spy(g.fx, 'dust', log)];
      p().pos.set(msgs[0].x + 3, msgs[0].y - 8, msgs[0].z); g.shake = 0; const sh0 = g.shake;
      try {
        for (const m of msgs) g.netMessage(json(m));
        const kinds = (k) => log.filter((l) => l[0] === 'sfx' && l[1] === k).length;
        if (kinds('creak') < 1) bad.push('the guest heard no creak'); if (kinds('rumble') < 2) bad.push('the guest heard ' + kinds('rumble') + ' rumbles'); if (kinds('thud') !== 1) bad.push('thuds ' + kinds('thud'));
        if (!log.some((l) => l[0] === 'dust')) bad.push('no dust on the guest side');
        const hint = (document.getElementById('hint') || {}).innerHTML || ''; if (!/cracks/i.test(hint)) bad.push('no warning hint: ' + hint.slice(0, 80));
        // forged messages: nothing, and no throw
        log.length = 0; g.shake = 0;
        for (const m of [{ t: 'avwarn', x: 'a', y: 1, z: 1, dx: 1, dz: 0, w: 5 }, { t: 'avrun', x: NaN, y: 0, z: 0, p: 1, n: 3 }, { t: 'avrun', x: 1, y: 1, z: 1, p: 'x', n: 1 }, { t: 'avend', x: null, z: {} }, { t: 'avride', vx: 'z', vy: 0, vz: 0 }, { t: 'avwarn' }, { t: 'avrun', x: 1e300, y: 0, z: 1e300, p: 1e9, n: 1 }]) { try { g.netMessage(json(m)); } catch (e) { bad.push('threw on ' + JSON.stringify(m)); } }
        if (log.filter((l) => l[0] === 'sfx' && l[1] !== 'rumble' && l[1] !== 'debris').length) bad.push('forged messages made sound: ' + JSON.stringify(log.slice(0, 3)));
        p().vel.set(0, 0, 0); g.netMessage({ t: 'avride', vx: 1e9, vy: -1e9, vz: 1e9, n: 5 });
        if (Math.hypot(p().vel.x, p().vel.z) > AV.VMAX * 2) bad.push('a forged ride speed was taken: ' + Math.hypot(p().vel.x, p().vel.z));
      } finally { for (const u of unspy) u(); }
      return bad.length === 0 || bad.join('; ');
    } finally { done(); reset({}); }
  });
  await T('mp.avalanche.a-guest-climbing-starts-the-slab-on-the-host-and-both-players-are-swept', async () => {
    const bad = [];
    try {
      // the guest climbs high with no gear: it asks the host
      reset({}); const q = hi(30); role('guest'); sent = []; g.netSend = (m) => { sent.push(json(m)); }; g.mode = 'play';
      const o = Math.random; Math.random = () => 0; g._climbT = 5; try { g.climbRisk(0.1); } finally { Math.random = o; }
      const cmd = sent.find((m) => m.t === 'cmd' && m.c === 'avclimb'); if (!cmd) return 'the guest sent no avclimb: ' + JSON.stringify(sent.map((m) => m.t + (m.c || '')));
      if (av().cur) bad.push('the guest ran a slab of its own');
      const pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
      // the host judges it: forged and out of place requests do nothing
      done(); reset({}); hostOn(fake(pos.x, pos.y, pos.z));
      for (const [name, d, setup] of [
        ['far from the guest', { ...cmd.d, x: cmd.d.x + 40 }], ['too low', { ...cmd.d, y: 10 }, () => { g.remote.pos.y = 10; }], ['junk', { x: 'a', y: 2, z: 3 }], ['nothing', null],
        ['with gear', cmd.d, () => { S().up = { climb: 3 }; g.T = g.tune(); }],
      ]) { if (setup) setup(); g.remote = g.remote || fake(pos.x, pos.y, pos.z); try { g.netCmd('avclimb', json(d)); } catch (e) { bad.push(name + ' threw'); } if (av().cur) bad.push('a slab started: ' + name); av().clear(); reset({}); g.remote = fake(pos.x, pos.y, pos.z); }
      const rec = []; g.netCmd('avclimb', json(cmd.d)); if (!av().cur || av().cur.by !== 'guest') return bad.concat('the host did not start the guest\'s slab').join('; ');
      // both swept: the host's player stands in the slab path too; the host tells the guest its flow and the host's own player is carried
      const a = av().cur; hi(30); { const x = pos.x + a.dx * 3, z = pos.z + a.dz * 3, t = ctx.w().topAt(ctx.toI(x), ctx.toK(z)); p().pos.set(x, t * ctx.cfg.C, z); p().footCell = { i: ctx.toI(x), j: t - 1, k: ctx.toK(z) }; p().onGround = true; p().vel.set(0, 0, 0); }
      let rides = 0, sweptHost = 0, secs = 0; const times = [];
      for (let f = 0; f < 60 * 12 && av().cur; f++) {
        g.time += 1 / 60; g.updatePlay(1 / 60); g.netUpdate(1 / 60); secs += 1 / 60;
        if (p().swept > 0) sweptHost++;
        for (const m of sent.splice(0)) if (m.t === 'avride') { rides++; times.push(secs); rec.push(m); }
      }
      if (sweptHost < 10) bad.push('the host player was never carried (' + sweptHost + ' frames)');
      if (rides < 3) bad.push('the guest got ' + rides + ' ride messages');
      const gaps = times.slice(1).map((t, n) => t - times[n]); if (gaps.length && Math.min(...gaps) < 0.09) bad.push('ride messages faster than 10 a second: ' + Math.min(...gaps).toFixed(3));
      // the guest applies one
      done(); reset({}); role('guest'); g.mode = 'play'; p().vel.set(0, 0, 0); p().swept = 0; if (rec[0]) g.netMessage(json(rec[0]));
      if (!(p().swept > 0)) bad.push('the guest is not marked as carried'); if (!(Math.hypot(p().vel.x, p().vel.z) > 1)) bad.push('the guest was not moved by the flow');
      return bad.length === 0 || bad.join('; ');
    } finally { done(); reset({}); }
  });
  await T('mp.avalanche.the-ride-never-kills-the-guest-either', async () => {
    const bad = [];
    try {
      reset({}); role('guest'); g.mode = 'play'; g.hp = 14; p().vel.set(5, 0, 5); g.netMessage({ t: 'avride', vx: 4, vy: 0, vz: 4, n: 8 });
      for (let n = 0; n < 12; n++) g.hurtPlayer(30, 'were crushed under falling plush'); g.hurtPlayer(50, 'fell too far');
      if (g.dead || g.hp < 1) bad.push('the guest died in the flow: hp ' + g.hp);
      if (g.hp > 14) bad.push('hp rose');
      return bad.length === 0 || bad.join('; ');
    } finally { done(); reset({}); g.hp = 100; }
  });
}
