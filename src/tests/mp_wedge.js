// mp.wedge.*: the host simulates the slide (src/wedge.js), the guest sees, hears and feels the same wedge (parameters and a seed travel, never cells) and reads its own
// burial from the same cells, a guest whose footing gives way asks with `sslide` and the host judges it again, forged messages change nothing and never reach g.shake.
import { wk, WEDGE, BU } from './wedge_lib.js';

export default async function (ctx) {
  const { g, S, p, w, sim, stepSim, V3 } = ctx;
  const K = wk(ctx), { wd, bu, seeded, play, slide, stand, reset, plush, tagged, heart, hi, toI, toJ, toK, cellX, cellZ, C } = K;
  const T = async (name, fn) => ctx.T(name, async () => { try { return await fn(); } finally { delete g.climbRisk; delete g.netSend; role(null); g.remote = null; g.netOut.length = 0; sent = []; g.keys = {}; reset({}); } });
  const json = (m) => JSON.parse(JSON.stringify(m));
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  let sent = [];
  const fake = (x, y, z) => ({ pos: new V3(x, y, z), vel: new V3(), name: 'Friend', lampOn: true, spheres() { return [0.3, 0.8, 1.3].map((o) => ({ x: this.pos.x, y: this.pos.y + o, z: this.pos.z, r: 0.3, vel: this.vel, remote: true })); }, update() {}, set() {} });
  const hostOn = (remote) => { role('host'); sent = []; g.netSend = (m) => { sent.push(json(m)); }; g.netOut.length = 0; if (remote) g.remote = remote; };
  const done = () => { delete g.netSend; role(null); g.remote = null; g.netOut.length = 0; sent = []; };
  const spy = (obj, name, log) => { const o = obj[name]; obj[name] = function (...a) { log.push([name, ...a]); return o.apply(this, a); }; return () => { obj[name] = o; }; };
  const carry = (n) => { S().carry = []; for (let q = 0; q < n; q++) S().carry.push({ sp: 2, vr: 0 }); };
  const asGuest = () => { role('guest'); g.mode = 'play'; sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const warnMsg = (o = {}) => ({ t: 'avwarn', x: p().pos.x, y: p().pos.y, z: p().pos.z, dx: 1, dz: 0, a: 27, l: 12, n: 300, sd: 12345, s: 0.5, ...o });

  await T('mp.wedge.host-sends-the-wedge-inside-the-rate-and-size-limits-with-parameters-and-a-seed-not-cells', async () => {
    const bad = [];
    stand(24); hostOn(fake(p().pos.x + 6, p().pos.y - 6, p().pos.z + 4));
    const a = seeded(61, () => slide(0.5)); if (!a) return 'no slide';
    const types = {}; let secs = 0, maxBodies = 0, maxMsg = 0, removed = 0, bytes0 = 0, sec0 = 0, worst = 0; const msgs = [];
    seeded(161, () => {
      for (let f = 0; f < 60 * 25 && (wd().cur || f < 5); f++) {
        g.time += 1 / 60; stepSim(1 / 60, 1 / 60); g.netUpdate(1 / 60); secs += 1 / 60;
        for (const m of sent.splice(0)) {
          const len = JSON.stringify(m).length; bytes0 += len; types[m.t] = (types[m.t] || 0) + 1; maxMsg = Math.max(maxMsg, len);
          if (m.t === 'bodies') maxBodies = Math.max(maxBodies, m.a.length / 11);
          if (m.t === 'cells') for (let c = 0; c < m.a.length; c += 5) if (m.a[c + 3] === 0) removed++;
          if (/^av/.test(m.t)) msgs.push(m);
        }
        if (secs - sec0 >= 1) { worst = Math.max(worst, bytes0); bytes0 = 0; sec0 = secs; }
      }
    });
    const last = wd().last, warn = msgs.find((m) => m.t === 'avwarn'), end = msgs.find((m) => m.t === 'avend');
    if (types.avwarn !== 1 || types.avend !== 1) bad.push(`avwarn x${types.avwarn} avend x${types.avend}`);
    if (!warn || !['x', 'y', 'z', 'dx', 'dz', 'a', 'l', 'n', 'sd', 's'].every((k) => Number.isFinite(warn[k]))) bad.push('avwarn does not carry the wedge: ' + JSON.stringify(warn));
    else { if (Math.abs(warn.x - a.x) > 0.06 || Math.abs(warn.z - a.z) > 0.06) bad.push('the apex in avwarn is not the player\'s spot'); if (warn.sd !== a.seed) bad.push('the seed is not sent'); if (!(warn.a >= 20 && warn.a <= 35)) bad.push('spread ' + warn.a); if (JSON.stringify(warn).length > 220) bad.push('avwarn is ' + JSON.stringify(warn).length + ' bytes'); }
    if (!end || !Number.isFinite(end.c)) bad.push('avend has no cooldown: ' + JSON.stringify(end));
    if (msgs.some((m) => 'k' in m)) bad.push('a message still names a soft kind');
    if (!(types.avrun >= 1 && types.avrun <= Math.ceil(secs * 2) + 2)) bad.push(`avrun x${types.avrun} in ${secs.toFixed(1)} s`);
    if (maxBodies > 300) bad.push('bodies in one message ' + maxBodies); if (maxMsg > 40000) bad.push('a message of ' + maxMsg); if (worst > 450 * 1024) bad.push('a second of ' + (worst / 1024).toFixed(0) + ' KB');
    if (!last || removed < last.released) bad.push(`cells removed on the wire ${removed} < released ${last && last.released}`);
    window.__wedgeNet = { secs: +secs.toFixed(1), types, maxMsg, worstKBs: +(worst / 1024).toFixed(0), released: last && last.released };
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.wedge.the-guest-sees-the-same-wedge-hears-it-and-ends-with-the-same-cells', async () => {
    const bad = [];
    stand(28);
    hostOn(fake(p().pos.x + 6, p().pos.y - 6, p().pos.z + 4));
    const a = seeded(63, () => slide(0.5)); if (!a) return 'no slide';
    const msgs = [], cellsMsgs = [];
    seeded(163, () => { for (let f = 0; f < 60 * 25 && (wd().cur || f < 5); f++) { g.time += 1 / 60; stepSim(1 / 60, 1 / 60); g.netUpdate(1 / 60); for (const m of sent.splice(0)) { if (/^av/.test(m.t)) msgs.push(m); if (m.t === 'cells') cellsMsgs.push(m); } } });
    play(1);
    for (let n = 0; n < 5; n++) { g.time += 0.1; g.netUpdate(0.1); for (const m of sent.splice(0)) if (m.t === 'cells') cellsMsgs.push(m); }
    const host = { x: a.x, z: a.z, dx: a.dx, dz: a.dz, th: a.theta, l: a.Lm, sd: a.seed };
    done(); wd().clear(); bu().clear();
    // the guest hears and sees the wedge from the parameters
    role('guest'); g.mode = 'play'; const log = [], un = [spy(wd(), 'sfx', log), spy(g.fx, 'dust', log)];
    try {
      p().pos.set(msgs[0].x + 3, msgs[0].y - 8, msgs[0].z); g.shake = 0; wd().cool = 0; bu().armT = 0;
      for (const m of msgs) g.netMessage(json(m));
      const kinds = (k) => log.filter((l) => l[0] === 'sfx' && l[1] === k).length, gw = wd().gw;
      if (!gw || Math.abs(gw.x - host.x) > 0.06 || Math.abs(gw.dx - host.dx) > 0.002 || Math.abs(gw.a - host.th) > 0.06 || Math.abs(gw.l - host.l) > 0.06 || gw.sd !== host.sd) bad.push('the guest has another wedge: ' + JSON.stringify(gw) + ' vs ' + JSON.stringify(host));
      if (kinds('creak') < 1) bad.push('no creak on the guest'); if (kinds('rumble') < 1) bad.push('no rumble on the guest'); if (kinds('thud') !== 1) bad.push('thuds ' + kinds('thud'));
      if (!log.some((l) => l[0] === 'dust')) bad.push('no dust on the guest');
      if (!(wd().cool > 0 && wd().cool <= WEDGE.COOL[1] + 2)) bad.push('guest cooldown ' + wd().cool); if (!(bu().armT > 0)) bad.push('the guest does not watch its own burial after the end');
      if (!Number.isFinite(g.shake)) bad.push('g.shake is ' + g.shake);
      const hint = (document.getElementById('hint') || {}).innerHTML || ''; if (!/footing gives way/i.test(hint)) bad.push('no hint on the guest: ' + hint.slice(0, 80));
      // the same wedge twice from the same parameters: the outline dust of the warning is the same on both sides
      const outline = []; const o1 = g.fx.dust; g.fx.dust = (x, y, z) => outline.push([+x.toFixed(2), +z.toFixed(2)]);
      try { wd().edgeFx(host.x, host.z, host.dx, host.dz, host.th, host.l, host.sd, (x, y, z) => outline.push([+x.toFixed(2), +z.toFixed(2)])); const first = JSON.stringify(outline); outline.length = 0; wd().edgeFx(host.x, host.z, host.dx, host.dz, host.th, host.l, host.sd, (x, y, z) => outline.push([+x.toFixed(2), +z.toFixed(2)])); if (JSON.stringify(outline) !== first) bad.push('the same seed drew two outlines'); } finally { g.fx.dust = o1; }
    } finally { for (const u of un) u(); }
    // the cells: the host sends a removal for every plush the slide freed (the guest applies the usual cell diffs, so its world follows the host's)
    let removedWire = 0; for (const m of cellsMsgs) for (let c = 0; c < m.a.length; c += 5) if (m.a[c + 3] === 0) removedWire++;
    if (removedWire < a.released * 0.9) bad.push(`the host sent ${removedWire} cell removals for ${a.released} plush`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.wedge.replaying-the-hosts-cell-messages-on-the-guest-gives-the-same-world-after-the-slide', async () => {
    const bad = [];
    stand(28); hostOn(fake(p().pos.x + 40, 0, p().pos.z + 40));
    const ws = w(), osc = ws.setCell, first = new Map(), last = new Map(), msgs = [];
    ws.setCell = function (i, j, k, sp, vr) { const key = (j * ctx.cfg.NZ + k) * ctx.cfg.NX + i; if (!first.has(key)) first.set(key, [this.get(i, j, k), this.getVr(i, j, k)]); last.set(key, [sp, vr]); return osc.call(this, i, j, k, sp, vr); };
    let a;
    try {
      a = seeded(65, () => slide(0.6)); if (!a) return 'no slide';
      seeded(165, () => { for (let f = 0; f < 60 * 30 && (wd().cur || bu().pend || f < 5); f++) { g.time += 1 / 60; g.updatePlay(1 / 60); g.netUpdate(1 / 60); for (const m of sent.splice(0)) if (m.t === 'cells') msgs.push(m); } });
      for (let n = 0; n < 20; n++) { g.time += 0.1; g.updatePlay(0.1); g.netUpdate(0.1); for (const m of sent.splice(0)) if (m.t === 'cells') msgs.push(m); }
    } finally { delete ws.setCell; }
    if (last.size < 100) return 'the host changed only ' + last.size + ' cells';
    // the guest starts from the ground as it was and gets only the messages
    ws._remoteApply = true; for (const [key, [sp, vr]] of first) { const NX = ctx.cfg.NX, NZ = ctx.cfg.NZ, i = key % NX, k = ((key / NX) | 0) % NZ, j = (key / (NX * NZ)) | 0; osc.call(ws, i, j, k, sp, vr); } ws._remoteApply = false;
    done(); role('guest'); g.mode = 'play';
    for (const m of msgs) g.netMessage(json(m));
    let wrong = 0; for (const [key, [sp]] of last) { const NX = ctx.cfg.NX, NZ = ctx.cfg.NZ, i = key % NX, k = ((key / NX) | 0) % NZ, j = (key / (NX * NZ)) | 0; if (ws.get(i, j, k) !== sp) wrong++; }
    if (wrong) bad.push(`${wrong} of ${last.size} cells differ on the guest after the host's messages`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.wedge.forged-messages-are-refused-and-never-reach-the-camera-shake', async () => {
    const bad = [];
    stand(26); role('guest'); g.mode = 'play'; const log = [], un = [spy(wd(), 'sfx', log), spy(g.fx, 'dust', log)];
    try {
      g.shake = 0; wd().gw = null;
      const forged = [
        { t: 'avwarn', x: 'a', y: 1, z: 1, dx: 1, dz: 0, a: 20, l: 5, n: 5, sd: 1 }, { t: 'avwarn' }, { t: 'avwarn', x: 1, y: 1, z: 1, dx: 'up', dz: 0, a: 20, l: 5, n: 5, sd: 1 }, { t: 'avwarn', x: 1, y: 1, z: 1, dx: 1, dz: 0, a: {}, l: 5, n: 5, sd: 1 },
        { t: 'avwarn', x: 1, y: 1, z: 1, dx: 1, dz: 0, a: 20, l: NaN, n: 5, sd: 1 }, { t: 'avwarn', x: Infinity, y: 1, z: 1, dx: 1, dz: 0, a: 20, l: 5, n: 5, sd: 1 }, { t: 'avwarn', x: 1, y: 1, z: 1, dx: 1, dz: 0, a: 20, l: 5, n: 5, sd: null },
        { t: 'avend', x: null, z: {} }, { t: 'avrun', x: NaN, y: 0, z: 0, p: 1, n: 3 }, { t: 'avrun', x: 1, y: 1, z: 1, p: 'x', n: 1 }, { t: 'avride', vx: 'z', vy: 0, vz: 0 }, { t: 'avrun', x: 1e300, y: 0, z: 1e300, p: 1e9, n: 1 },
      ];
      for (const m of forged) { try { g.netMessage(json(m)); } catch (e) { bad.push('threw on ' + JSON.stringify(m).slice(0, 70)); } if (!Number.isFinite(g.shake)) { bad.push('g.shake is ' + g.shake + ' after ' + JSON.stringify(m).slice(0, 70)); g.shake = 0; } }
      if (log.filter((l) => l[0] === 'sfx' && l[1] !== 'rumble' && l[1] !== 'debris').length) bad.push('forged messages made sound: ' + JSON.stringify(log.slice(0, 3)));
      wd().cool = 0; g.netMessage({ t: 'avend', x: 1, z: 1, c: 1e9 }); if (!(wd().cool <= WEDGE.COOL[1] + 2)) bad.push('a forged cooldown of ' + wd().cool + ' s was taken'); g.netMessage({ t: 'avend', x: 1, z: 1, c: 'x' }); if (!Number.isFinite(wd().cool)) bad.push('the cooldown is ' + wd().cool); wd().cool = 0;
      if (wd().gw) bad.push('a forged avwarn set a wedge: ' + JSON.stringify(wd().gw)); if (wd().guestOn > 0) bad.push('a forged avwarn made the guest believe a slide runs');
      p().vel.set(0, 0, 0); g.netMessage({ t: 'avride', vx: 1e9, vy: -1e9, vz: 1e9, n: 5 });
      if (Math.hypot(p().vel.x, p().vel.z) > WEDGE.VMAX[1] * 2) bad.push('a forged ride speed was taken: ' + Math.hypot(p().vel.x, p().vel.z));
      // out of range but finite numbers are clamped, not trusted
      g.netMessage(json(warnMsg({ a: 1e9, l: 1e9, n: 1e12 }))); const gw = wd().gw; if (!gw || gw.a > 45 || gw.l > 80 || gw.n > 3000) bad.push('a huge wedge was taken as it came: ' + JSON.stringify(gw));
    } finally { for (const u of un) u(); }
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.wedge.a-guest-asks-with-sslide-and-the-host-judges-it-again', async () => {
    const bad = [];
    stand(24); asGuest(); S().carry.push({ sp: 2, vr: 0 }, { sp: 2, vr: 0 });
    delete g.climbRisk; const o = Math.random; Math.random = () => 0; g._climbT = 5; try { g.climbRisk(0.1); } finally { Math.random = o; }
    const cmd = sent.find((m) => m.t === 'cmd' && m.c === 'sslide'); if (!cmd) return 'the guest sent no sslide: ' + JSON.stringify(sent.map((m) => m.t + (m.c || '')));
    if (sent.some((m) => m.t === 'cmd' && (m.c === 'avclimb' || m.c === 'patch'))) bad.push('it also sent a slab or patch request');
    if (wd().cur) bad.push('the guest ran a slide of its own');
    sent.length = 0; Math.random = () => 0; g._climbT = 5; try { g.climbRisk(0.1); } finally { Math.random = o; } if (sent.some((m) => m.c === 'sslide')) bad.push('asked twice');
    const pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
    done(); wd().clear(); bu().clear(); hostOn(fake(pos.x, pos.y, pos.z)); g.climbRisk = () => {};
    const cases = [
      ['far from the guest', { ...cmd.d, x: cmd.d.x + 40 }], ['too low', { ...cmd.d, y: 3 }, () => { g.remote.pos.y = 3; }], ['junk', { x: 'a', y: 2, z: 3 }], ['nothing', null], ['strings', { x: '1e999', y: '1', z: 'q' }],
      ['roped in', cmd.d, () => { g.ropedIn = () => true; }],
    ];
    for (const [name, d, setup] of cases) {
      g.remote = fake(pos.x, pos.y, pos.z); wd().guestCd = 0; delete g.ropedIn; if (setup) setup();
      try { g.netCmd('sslide', json(d)); } catch (e) { bad.push(name + ' threw'); } if (wd().cur) bad.push('a slide started: ' + name); wd().clear(); delete g.ropedIn;
    }
    g.remote = fake(pos.x, pos.y, pos.z); wd().guestCd = 0; g.netCmd('sslide', json(cmd.d));
    const a = wd().cur; if (!a || a.by !== 'guest') return bad.concat('the host did not run the guest\'s slide').join('; ');
    if (Math.hypot(a.x - pos.x, a.z - pos.z) > 0.01) bad.push('the apex is not where the host sees the guest');
    wd().clear(); g.netCmd('sslide', json(cmd.d)); if (wd().cur) bad.push('a second request within the gap started another slide');
    let started = 0; for (let n = 0; n < 50; n++) { wd().clear(); g.time += 0.1; g.netCmd('sslide', json(cmd.d)); if (wd().cur) started++; } if (started > 1) bad.push('a flood started ' + started + ' slides');
    // a bad number in a request is not trusted for the size either (clamped), and the apex is the host's own view of the guest
    wd().clear(); g.time += 10; g.netCmd('sslide', json({ ...cmd.d, n: 1e9, sp: 1e9 })); if (wd().cur && wd().cur.cls === 'small' && false) bad.push('x');
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.wedge.a-guest-does-not-ask-on-cooldown-and-drops-plush-when-the-warning-comes-not-when-it-asks', async () => {
    const bad = [];
    stand(27); asGuest(); carry(10);
    g.netMessage(json(warnMsg())); g.netMessage({ t: 'avend', x: 0, z: 0, c: 8 });   // a slide just ran (the host's cooldown has begun)
    sent = []; delete g.climbRisk; { const o = Math.random; Math.random = () => 0; g._climbT = 5; try { g.climbRisk(0.1); } finally { Math.random = o; } }
    if (sent.some((m) => m.t === 'cmd' && m.c === 'sslide')) bad.push('the guest asked the host for a slide on cooldown'); if (S().carry.length !== 10) bad.push('the guest dropped plush for a slide that cannot come: ' + S().carry.length);
    reset({}); stand(27); asGuest(); carry(10); delete g.climbRisk;
    { const o = Math.random; Math.random = () => 0; g._climbT = 5; try { g.climbRisk(0.1); } finally { Math.random = o; } }
    if (!sent.some((m) => m.t === 'cmd' && m.c === 'sslide')) return bad.concat('the guest did not ask').join('; ');
    if (S().carry.length !== 10) bad.push('the plush went before the host answered: ' + S().carry.length);
    for (let n = 0; n < 200; n++) { g.time += 0.1; wd().guestUpdate(0.1); }   // 20 s and the host never answered (it refused): nothing was lost
    g.netMessage(json(warnMsg())); if (S().carry.length !== 10) bad.push('a warning nobody asked for took plush: ' + S().carry.length);
    reset({}); stand(27); asGuest(); carry(10); delete g.climbRisk;
    { const o = Math.random; Math.random = () => 0; g._climbT = 5; try { g.climbRisk(0.1); } finally { Math.random = o; } } g.netMessage(json(warnMsg()));
    if (!(S().carry.length >= 6 && S().carry.length <= 8)) bad.push('the answer did not take a part of 10: ' + S().carry.length);
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.wedge.the-host-places-a-guests-wedge-where-the-guest-really-is', async () => {
    const bad = [];
    const q = stand(26), pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z }; p().pos.set(pos.x + 40, 0, pos.z + 40);
    hostOn(fake(pos.x + 2.5, pos.y, pos.z)); g.climbRisk = () => {};
    const o = Math.random; Math.random = () => 0.5; try { g.netCmd('sslide', json({ x: pos.x, y: pos.y, z: pos.z, n: 0, sp: 0 })); } finally { Math.random = o; }
    const a = wd().cur; if (!a) return 'no slide for a guest at 26 m';
    if (Math.hypot(a.x - (pos.x + 2.5), a.z - pos.z) > 0.01) bad.push('the wedge starts at the claimed spot, not at the guest the host sees');
    wd().clear(); bu().clear(); hostOn(fake(pos.x, 3, pos.z)); g.time += 10; g.netCmd('sslide', json({ x: pos.x, y: 30, z: pos.z, n: 0, sp: 0 })); if (wd().cur) bad.push('a forged height started a slide for a guest that is low');
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.wedge.a-friend-standing-in-the-runout-is-buried-by-the-same-pile-and-reads-its-depth-from-the-cells', async () => {
    const bad = [];
    const q = stand(26), P = { x: p().pos.x, y: p().pos.y, z: p().pos.z }; p().pos.set(P.x + 40, 0, P.z + 40);   // (the host's player is somewhere else)
    hostOn(fake(P.x + 40, 0, P.z + 40));
    const a = seeded(62, () => wd().start(P, { e: 0.6, warn: 0.2, by: 'test' })); if (!a) return 'no slide';
    seeded(162, () => { let t = 0; while (wd().cur && t < 25) { g.time += 1 / 60; g.updatePlay(1 / 60); t += 1 / 60; } });
    if (!bu().pend) return 'the landing is not waiting for anyone';
    const hd = heart(a); if (!hd || hd.sum < 12) return 'no pile landed ' + JSON.stringify(hd);
    g.remote.pos.set(cellX(hd.i), w().topAt(hd.i, hd.k) * C, cellZ(hd.k)); g.remote.vel.set(0, 0, 0);
    seeded(163, () => play(4));
    const l = bu().last && bu().last.landings.find((x) => x.who === 'guest'); if (!l) return 'the friend was not part of the landing ' + JSON.stringify(bu().last);
    const here = bu().cover(g.remote.pos);
    if (l.pool < BU.POOL_MIN) bad.push('nothing landed on the friend ' + JSON.stringify(l)); else if (l.lvl < 1) bad.push('landed pile ' + l.pool + ' but not buried: ' + JSON.stringify(l));
    if (here.lvl !== l.lvl) bad.push(`the cells say ${here.lvl}, the landing says ${l.lvl}`);
    const at = { x: g.remote.pos.x, y: g.remote.pos.y, z: g.remote.pos.z };
    done(); role('guest'); g.mode = 'play'; p().pos.set(at.x, at.y, at.z); p().vel.set(0, 0, 0); bu().armT = 0; bu().on = false; bu().arm();
    play(1.5); if (l.lvl >= 1 && !(bu().on && bu().lvl === l.lvl)) bad.push(`the guest's own manager: on ${bu().on} lvl ${bu().lvl}, landing ${l.lvl}`);
    if (l.lvl >= 3 && !g.trapOn) bad.push('the guest is not trapped at depth ' + l.lvl);
    return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(l);
  });

  await T('mp.wedge.both-players-are-carried-and-the-ride-never-kills-the-guest', async () => {
    const bad = [];
    const q = stand(28), pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z }; hostOn(fake(pos.x + 6, pos.y - 6, pos.z + 4));
    const a = seeded(64, () => slide(0.6)); if (!a) return 'no slide';
    const rec = []; let rides = 0, sweptHost = 0, secs = 0; const times = [];
    seeded(164, () => { for (let f = 0; f < 60 * 25 && wd().cur; f++) { g.time += 1 / 60; g.updatePlay(1 / 60); g.netUpdate(1 / 60); secs += 1 / 60; if (p().swept > 0) sweptHost++; for (const m of sent.splice(0)) if (m.t === 'avride') { rides++; times.push(secs); rec.push(m); } } });
    if (sweptHost < 10) bad.push('the host player was never carried (' + sweptHost + ' frames)');
    const gaps = times.slice(1).map((t, n) => t - times[n]); if (gaps.length && Math.min(...gaps) < 0.09) bad.push('ride messages faster than 10 a second: ' + Math.min(...gaps).toFixed(3));
    done(); reset({}); role('guest'); g.mode = 'play'; p().vel.set(0, 0, 0); p().swept = 0; if (rec[0]) { g.netMessage(json(rec[0])); if (!(p().swept > 0)) bad.push('the guest is not marked as carried'); if (!(Math.hypot(p().vel.x, p().vel.z) > 0.5)) bad.push('the guest was not moved by the flow'); }
    // the ride never kills the guest either
    reset({}); role('guest'); g.mode = 'play'; g.hp = 14; wd().rideT = 0.5;
    for (let n = 0; n < 15; n++) g.hurtPlayer(40, 'were crushed under falling plush'); g.hurtPlayer(30, 'the pile gave way'); g.hurtPlayer(30, WEDGE.WHY);
    if (g.hp !== 14) bad.push('the slide hurt the guest: ' + g.hp);
    g.hurtPlayer(80, 'fell too far'); if (g.hp < 11 || g.hp > 14 || g.dead) bad.push('a fall while carried cost ' + (14 - g.hp));
    g.hp = 100; wd().rideT = 0; g.hurtPlayer(30, 'were crushed under falling plush'); if (g.hp !== 70) bad.push('hurt outside a slide was changed: ' + g.hp);
    return bad.length === 0 || bad.join('; ');
  });
}
