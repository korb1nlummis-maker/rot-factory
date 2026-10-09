// mp.netperf.*: the host's stream and the guest that receives it, one page playing both roles (see netperf_lib.js and mp_core.js).
// Numbers go to window.__netperf. Run: `await __selftest('mp.netperf.')`
import * as NG from '../netgame.js';
import { Net } from '../net.js';
import { Inbox } from '../netperf.js';
import { makeRig, DT } from './netperf_lib.js';
import { makeBeltKit, UP_ALL } from './belts_lib.js';

export default async function (ctx) {
  const { T, g, S, w, p, sim, L, fresh, clearBodies, V3, tiles } = ctx;
  const R = makeRig(ctx);
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); g.remote = null; g.netOut.length = 0; g.net.pipe.level = 0; g.net.pipe.reset(); g.net.stats.rtt = 0; g.net.inbox.reset(); g.netBodies.clear(); g.netPending.length = 0; g._worldGen = null; clearBodies(); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const G = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); } });
  const around = (n, x0, z0, spread = 10) => { for (let q = 0; q < n; q++) sim().spawn(3 + (q % 5), q % 3, x0 + (q * 0.37) % spread, 2 + (q % 7) * 0.4, z0 + (q * 0.71) % spread, 0.2, -0.1, 0.1, 1); };

  await G('mp.netperf.bodies-are-packed-and-the-guest-sees-the-same-plush-where-the-host-has-them', async () => {
    fresh({}); clearBodies(); role('host'); cap(); p().pos.set(0, 0, 3); g.remote = { pos: new V3(0, 0, 8), update() {} };
    around(30, -2, 2, 6);                        // near both players
    for (let q = 0; q < 10; q++) sim().spawn(2, 0, 60 + q * 0.5, 2, 3, 0, 0, 0, 1);   // 60 m away: in range, small on the screen
    for (let q = 0; q < 5; q++) sim().spawn(2, 0, 200 + q, 2, 3, 0, 0, 0, 1);          // 200 m away: out of range
    for (let n = 0; n < 6; n++) NG.sendBodies(g, 1);
    const msgs = ofType('bodies'); if (msgs.length !== 6) return 'sent ' + msgs.length;
    const ids = new Set(); for (const m of msgs) { if (m.p !== 1 || m.a.length % 11) return 'not packed: ' + JSON.stringify(m).slice(0, 80); for (let n = 0; n < m.a.length; n += 11) ids.add(m.a[n]); }
    if (ids.size !== 40) return `${ids.size} different bodies were sent in 6 messages, 40 are in range`;
    if (!msgs.some((m) => Array.isArray(m.k) && m.k.length === 40)) return 'no keyframe with the ids in range';
    const first = msgs[0]; if (first.a.length / 11 < 30) return 'near bodies are not sent every time: ' + first.a.length / 11;
    role('guest'); g.netBodies.clear(); for (const m of msgs) g.netMessage(m);
    if (g.netBodies.size !== 40) return 'the guest has ' + g.netBodies.size + ' bodies';
    let worst = 0; for (let i = 0; i < sim().n; i++) { const b = g.netBodies.get(sim().bid[i]); if (!b) continue; worst = Math.max(worst, Math.hypot(b.tx - sim().x[i], b.ty - sim().y[i], b.tz - sim().z[i]), ...[0, 1, 2, 3].map((c) => Math.abs(b.tq[c] - sim().q[i * 4 + c]))); if (b.sp !== sim().sp[i] || b.vr !== sim().vr[i]) return 'species differ'; }
    return worst < 0.011 || 'the guest copy is off by ' + worst;
  });

  await G('mp.netperf.a-body-that-is-gone-leaves-the-guest-at-the-next-keyframe', async () => {
    fresh({}); clearBodies(); role('host'); cap(); p().pos.set(0, 0, 3); g.remote = { pos: new V3(0, 0, 8), update() {} }; around(20, -2, 2, 6);
    for (let n = 0; n < 4; n++) NG.sendBodies(g, 1); const gone = sim().bid[3]; sim().remove(3);
    for (let n = 0; n < 8; n++) NG.sendBodies(g, 1);
    role('guest'); g.netBodies.clear(); for (const m of sent) if (m.t === 'bodies') g.netMessage(m);
    if (g.netBodies.has(gone)) return 'a removed body is still on the guest'; if (g.netBodies.size !== 19) return 'guest has ' + g.netBodies.size + ' of 19';
    role('host'); cap(); clearBodies(); for (let n = 0; n < 8; n++) NG.sendBodies(g, 1); const last = ofType('bodies').pop();
    role('guest'); g.netMessage(last); const empty = g.netBodies.size === 0; role('host'); cap(); NG.sendBodies(g, 1); const more = ofType('bodies').length;
    return (empty && more === 0) || `guest ${g.netBodies.size} after the last body left; the host keeps sending ${more} empty messages`;
  });

  await G('mp.netperf.the-old-float-rows-still-work-and-forged-rows-are-ignored', async () => {
    fresh({}); role('guest'); g.netBodies.clear();
    g.netMessage({ t: 'bodies', a: [7, 3, 0, 1.5, 2, 3, 0, 0, 0, 1, 0, 8, 3, 0, 4.5, 2, 3, 0, 0, 0, 1, 0.1] });
    const b = g.netBodies.get(7); if (!b || b.tx !== 1.5 || b.sq !== 0 || g.netBodies.size !== 2) return 'old rows: ' + JSON.stringify([...g.netBodies.keys()]);
    g.netMessage({ t: 'bodies', a: [8, 3, 0, 4.5, 2, 3, 0, 0, 0, 1, 0] }); if (g.netBodies.size !== 1) return 'an old message without a keyframe must prune what it did not list';
    g.netMessage({ t: 'bodies', p: 1, a: [9, 1, 0, 'x', 1, 1, 0, 0, 0, 250, 0, 10, 1, 0, 100, 100, 100, 0, 0, 0, 250, 0, 5, 5], k: [9, 10] });
    return (g.netBodies.has(10) && !g.netBodies.has(9)) || 'forged rows: ' + [...g.netBodies.keys()];
  });

  await G('mp.netperf.bodies-per-message-shrink-while-the-link-is-slow-and-never-pass-the-cap', async () => {
    fresh({}); clearBodies(); role('host'); cap(); p().pos.set(0, 0, 3); g.remote = { pos: new V3(0, 0, 8), update() {} }; around(600, -2, 0, 14);
    NG.sendBodies(g, 1); const n0 = ofType('bodies')[0].a.length / 11; sent = [];
    g.net.pipe.level = 1; NG.sendBodies(g, g.net.pipe.quality()); const n1 = ofType('bodies')[0].a.length / 11; sent = [];
    g.net.pipe.level = 2; NG.sendBodies(g, g.net.pipe.quality()); const n2 = ofType('bodies')[0].a.length / 11;
    return (n0 === NG.BODY_CAP && n1 < n0 && n1 >= 100 && n2 < n1 && n2 >= 24 && n2 <= 70) || `cap ${NG.BODY_CAP}: fine ${n0}, slow ${n1}, bad ${n2}`;
  });

  await G('mp.netperf.the-nearest-bodies-win-when-there-are-more-than-the-cap', async () => {
    fresh({}); clearBodies(); role('host'); cap(); p().pos.set(0, 0, 3); g.remote = { pos: new V3(0, 0, 3), update() {} };
    for (let q = 0; q < 300; q++) sim().spawn(2, 0, 2 + (q % 20) * 0.1, 2, 3 + (q / 20 | 0) * 0.1, 0, 0, 0, 1);    // 300 around 2 m
    const far = []; for (let q = 0; q < 50; q++) far.push(sim().bid[sim().spawn(2, 0, 15 + q * 0.2, 2, 3, 0, 0, 0, 1)]);   // 50 around 15 m
    NG.sendBodies(g, 1); const m = ofType('bodies')[0]; const ids = new Set(); for (let n = 0; n < m.a.length; n += 11) ids.add(m.a[n]);
    return (m.a.length / 11 === NG.BODY_CAP && far.every((id) => !ids.has(id))) || 'the 50 far ones were sent before near ones: ' + far.filter((id) => ids.has(id)).length;
  });

  await G('mp.netperf.a-big-factory-sends-its-belts-in-several-messages-all-under-64-KB-and-the-guest-gets-them-all', async () => {
    fresh(UP_ALL); const K = makeBeltKit(ctx); K.cleanup && K.cleanup(); const sp = ctx.species && 0; void sp;
    const i0 = ctx.toI(-14), k0 = ctx.toK(-8), lines = [];
    for (let ln = 0; ln < 20; ln++) lines.push(K.lay(0, 100, i0, k0 + ln, 0));
    for (const line of lines) K.dense(line);
    for (const t of tiles()) t.pw = 1;
    p().pos.set(ctx.cellX(i0 + 50), 0, ctx.cellZ(k0 + 10)); role('host'); cap(); g.remote = { pos: new V3(ctx.cellX(i0 + 50), 0, ctx.cellZ(k0 + 10)), update() {} };
    g.sendDyn(); const dyn = ofType('dyn'), more = ofType('dynb');
    const sizes = sent.map((m) => JSON.stringify(m).length); if (Math.max(...sizes) > 64 * 1024) return 'a message of ' + (Math.max(...sizes) / 1024).toFixed(0) + ' KB';
    if (dyn.length !== 1 || more.length < 1) return `${dyn.length} dyn and ${more.length} dynb: a 2000 belt factory should need more than one message`;
    const withItems = tiles().filter((t) => t.type === 'belt' && t.items.length).length, rows = dyn[0].belts.length + more.reduce((a, m) => a + m.belts.length, 0);
    if (rows !== withItems) return `${rows} belt rows for ${withItems} belts with plush`;
    if (!dyn[0].bpw || dyn[0].bpw.length < 3000) return 'the first dyn has no belt power rows';
    // the second dyn in a row carries no belt power rows (nothing changed), the guest keeps what it had
    sent.length = 0; g.sendDyn(); const d2 = ofType('dyn')[0]; if (d2.bpw !== undefined) return 'an unchanged belt power list was sent again';
    const msgs = json(sent.length ? sent : [d2]);
    const t0 = tiles().find((t) => t.type === 'belt' && t.items.length); const want = t0.items.length; t0.items = []; t0.pw = 0.7; const id0 = t0.id;
    role('guest'); for (const m of json([...dyn, ...more])) g.netMessage(m); const back = L().byId.get(id0);
    if (back.items.length !== want) return `guest belt has ${back.items.length} plush, host ${want}`;
    back.pw = 0.7; for (const m of msgs) g.netMessage(m); return back.pw === 0.7 || 'the guest lost the belt power when a dyn left it out';
  });

  await G('mp.netperf.shared-sends-upgrades-only-when-they-change-and-the-guest-keeps-what-a-light-one-does-not-say', async () => {
    fresh({ belts: 1 }); role('host'); cap(); S().contracts = [{ id: 1, name: 'c' }]; S().money = 1000;
    NG.periodicShared(g); NG.periodicShared(g); NG.periodicShared(g);
    const sh = ofType('shared'); if (sh.length !== 3 || !sh[0].up || sh[1].up !== undefined || sh[2].up !== undefined) return 'full/light/light expected, got ' + sh.map((m) => (m.up ? 'full' : 'light')).join();
    if (JSON.stringify(sh[1]).length > 400) return 'a light shared is ' + JSON.stringify(sh[1]).length + ' bytes';
    S().up = { ...S().up, extra: 1 }; NG.periodicShared(g); if (!ofType('shared')[3].up) return 'a changed upgrade was not sent';
    for (let n = 0; n < 6; n++) NG.periodicShared(g); if (!ofType('shared').slice(4).some((m) => m.up)) return 'the full one is not repeated every few seconds';
    const msgs = json(ofType('shared')); done(); fresh({}); S().contracts = []; role('guest');
    g.netMessage(msgs[0]); const up = JSON.stringify(S().up), ct = JSON.stringify(S().contracts); S().money = 5; g.netMessage({ ...msgs[1], money: 777, up: undefined });
    return (S().money === 777 && JSON.stringify(S().up) === up && JSON.stringify(S().contracts) === ct && S().contracts.length === 1) || `after a light one: money ${S().money} up ${JSON.stringify(S().up)} contracts ${JSON.stringify(S().contracts)}`;
  });

  await G('mp.netperf.a-guest-that-is-still-loading-keeps-the-newest-visuals-and-every-reliable-message-in-order', async () => {
    fresh({}); role('guest'); g.guestReady = false; g.netPending.length = 0; g.netPending._last = undefined;
    for (let n = 0; n < 300; n++) { g.netMessage({ t: 'dyn', n }); g.netMessage({ t: 'pos', x: n, y: 0, z: 0 }); g.netMessage({ t: 'bodies', a: [] }); g.netMessage({ t: 'fl', a: [[n]] }); if (n % 50 === 0) g.netMessage({ t: 'cells', a: [n, 1, 1, 0, 0] }); if (n % 100 === 0) g.netMessage({ t: 'ent+', ent: { id: n } }); g.netMessage({ t: 'shared', money: n }); }
    const P = g.netPending, by = (t) => P.filter((m) => m.t === t);
    if (by('dyn').length !== 1 || by('dyn')[0].n !== 299 || by('pos').length !== 1 || by('bodies').length !== 1) return `dyn ${by('dyn').length} pos ${by('pos').length} bodies ${by('bodies').length}`;
    if (by('shared').length !== 1 || by('shared')[0].money !== 299) return 'shared ' + JSON.stringify(by('shared'));
    if (by('fl').length > 64) return 'flights held ' + by('fl').length;
    const rel = P.filter((m) => m.t === 'cells' || m.t === 'ent+').map((m) => m.t + (m.a ? m.a[0] : m.ent.id)).join();
    return rel === 'cells0,ent+0,cells50,cells100,ent+100,cells150,cells200,ent+200,cells250' || 'reliable order: ' + rel;
  });

  await G('mp.netperf.ping-and-pong-measure-the-round-trip-and-work-before-the-world-has-loaded', async () => {
    fresh({}); role('host'); cap(); g._npg = 0; g.net.open = true; g.netUpdate(0.016); const png = ofType('png')[0]; if (!png) return 'no ping sent';
    role('guest'); g.guestReady = false; cap(); g.netMessage(json(png)); const pog = ofType('pog')[0]; if (!pog) return 'a guest that is still loading did not answer the ping (it must: the host measures the link with it)';
    role('host'); g.net.stats.rtt = 0; const lvl = g.net.pipe.level; g.netMessage({ t: 'pog', ts: performance.now() - 2000 });
    const r = g.net.stats.rtt; if (!(r > 1900 && r < 2600)) return 'rtt ' + r; g.net.pipe.pump(0.1); if (g.net.pipe.level < 1) return 'a 2 s round trip did not slow the pipe: level ' + g.net.pipe.level + ' (was ' + lvl + ')';
    g.netMessage({ t: 'pog', ts: performance.now() - 20 }); for (let n = 0; n < 400; n++) g.net.pipe.pump(0.05); return g.net.pipe.level === 0 || 'the level did not come back: ' + g.net.pipe.level;
  });

  await G('mp.netperf.the-slow-badge-shows-while-the-link-is-behind-and-goes-away-when-it-is-healthy', async () => {
    fresh({}); role('host'); cap(); g.net.pipe.level = 1;
    for (let n = 0; n < 20; n++) NG.slowBadge(g, 0.1); const el = document.getElementById('netSlow'); if (!el || el.style.display !== 'block') return 'no badge while slow';
    if (!/slow/i.test(el.textContent)) return 'badge text ' + el.textContent;
    g.net.pipe.level = 0; for (let n = 0; n < 60; n++) NG.slowBadge(g, 0.1);
    const gone = el.style.display === 'none'; NG.hideOverlay(g); return gone || 'the badge stayed after the link recovered';
  });

  await G('mp.netperf.f3-shows-bytes-and-messages-per-type-and-costs-next-to-nothing', async () => {
    fresh({}); role('host'); cap(); g.showFps = true; const st = g.net.stats;
    st.tx('bodies', 12000); st.tx('cells', 9000); st.rx('pos', 90); st.time('tick', 0.4); st.roll(true);
    g._ovT = 0; NG.overlay(g, 1); const el = document.getElementById('netStat'); if (!el || el.style.display !== 'block') return 'no overlay';
    const txt = el.textContent; if (!/net out/.test(txt) || !/bodies/.test(txt) || !/net in/.test(txt) || !/tick ms/.test(txt) || !/buffered/.test(txt)) return 'overlay text: ' + txt;
    const t0 = performance.now(); for (let n = 0; n < 200; n++) { g._ovT = 0; NG.overlay(g, 1); } const per = (performance.now() - t0) / 200;
    const frame = (() => { g._ovT = 5; const a = performance.now(); for (let n = 0; n < 2000; n++) NG.overlay(g, 0.016); return (performance.now() - a) / 2000; })();
    g.showFps = false; g._ovT = 0; NG.overlay(g, 1); const hidden = el.style.display === 'none'; NG.hideOverlay(g);
    if (!hidden) return 'overlay stays after F3 is switched off';
    if (frame > 0.01) return `${frame.toFixed(4)} ms a frame when it is not due`; return per < 1.5 || `${per.toFixed(2)} ms per refresh`;
  });

  await G('mp.netperf.the-net-object-counts-and-routes-through-the-pipe-and-the-inbox', async () => {
    const net = new Net(); const out = []; const got = []; net.onMessage = (m) => got.push(m);
    const dc = { readyState: 'open', bufferedAmount: 0, binaryType: '', send: (s) => { out.push(s); dc.bufferedAmount += s.length; }, close() {} };
    net.bind(dc); dc.onopen(); try {
      if (!net.send({ t: 'pos', x: 1 }) || out.length !== 1 || JSON.parse(out[0]).x !== 1) return 'send did not reach the channel';
      dc.onmessage({ data: '{"t":"hi","name":"x"}' }); if (got.length !== 1 || got[0].name !== 'x') return 'receive did not reach onMessage';
      dc.onmessage({ data: new TextEncoder().encode('{"t":"ent+","ent":{"id":5}}').buffer }); if (got.length !== 2 || got[1].ent.id !== 5) return 'binary payloads are not decoded';
      dc.onmessage({ data: 'not json' }); dc.onmessage({ data: '{"t":"x"' }); if (got.length !== 2) return 'bad payloads must be ignored';
      dc.bufferedAmount = 500 * 1024; net.send({ t: 'cells', a: [1] }); net.send({ t: 'pos', x: 2 }); net.send({ t: 'fl', a: [] });
      if (out.length !== 1) return 'sent into a full buffer: ' + out.length;
      dc.bufferedAmount = 0; net.pipe.pump(0.1); const types = out.map((s) => JSON.parse(s).t);
      if (types.join() !== 'pos,cells,pos') return 'after the buffer drained: ' + types.join();
      net.stats.roll(true); const r = net.stats.report({}); if (!/net out/.test(r[0])) return 'report ' + r[0];
      return net.stats.dropped.fl === 1 || 'the dropped flight was not counted: ' + JSON.stringify(net.stats.dropped);
    } finally { net.close(); }
  });

  // ---------------------------------------------------------------- the guest under the whole stress
  const stressEach = (n) => { R.power(); if (n % 60 === 0) R.refill(); R.digStep(n); R.throwStep(n); R.rigsStep(n, 50); R.avalanche(n); R.portalStep(n, 3); R.moveGuest(n); if (n === 150) { const s = R.sp0; R.fill(s.i + 4, 1, s.k - 20, 30, 25, 30); } if (n === 210) { const s = R.sp0; R.caveIn(s.i + 4, 1, s.k - 20, 30, 25, 30); } };
  const region = () => { const s = R.sp0, cells = []; for (let i = s.i + 4; i < s.i + 34; i += 2) for (let k = s.k - 20; k < s.k + 10; k += 2) for (let j = 1; j < 26; j += 2) cells.push([i, j, k, w().get(i, j, k)]); return cells; };
  const diff = (cells) => cells.filter(([i, j, k, v]) => w().get(i, j, k) !== v).length;

  await T('mp.netperf.guest-handles-the-stress-stream-with-a-small-tick-and-ends-with-the-hosts-cells', async () => {
    const rec = R.scenario('mp-stress-src', { setup: (R) => { R.slope(); R.machines(60); R.bots(20); }, each: stressEach, warm: 0.5, secs: 10, keepRaw: true });
    const want = region(); const out = R.replay(rec.recs, { before: R.undoCells });
    // the guest's inbox may still hold the end of the stream
    for (let n = 0; n < 200 && g.net.inbox.size(); n++) { g.net.inbox.frame(); g.net.inbox.drain(3); }
    const t = R.tick(out.tick), unsent = rec.queues.netOut / 5, wrong = Math.max(0, diff(want) - unsent);   // (edits the host had not sent yet when the recording ended cannot be on the guest)
    (window.__netperf = window.__netperf || {})['mp-guest-stress'] = { line: `guest tick (receive + net update) avg ${t.avg.toFixed(2)} ms p95 ${t.p95.toFixed(2)} ms max ${t.max.toFixed(2)} ms over ${out.tick.length} frames, ${wrong} of ${want.length} sampled cells differ at the end`, tick: t, frame: R.tick(out.frame), sim: 0, queues: {} };
    if (wrong) return `${wrong} of ${want.length} sampled cave-in cells differ on the guest`;
    if (t.p95 > 6) return `guest tick p95 ${t.p95.toFixed(1)} ms`;
    return t.avg < 2 || `guest tick avg ${t.avg.toFixed(2)} ms`;
  });

  await T('mp.netperf.guest-back-from-a-pause-spreads-eight-seconds-of-stream-over-frames-and-loses-nothing-reliable', async () => {
    const rec = R.scenario('mp-burst-src', { setup: (R) => { R.slope(); R.machines(60); R.bots(20); }, each: stressEach, warm: 0.5, secs: 9, keepRaw: true });
    const want = region(); const sentBy = {}; let cellsSent = 0;
    for (const m of rec.recs) { sentBy[m.type] = (sentBy[m.type] || 0) + 1; if (m.type === 'cells') cellsSent += JSON.parse(m.raw).a.length / 5; }
    const handled = {}; let cellsGot = 0; const orig = g.netMessage;
    g.netMessage = function (m) { handled[m.t] = (handled[m.t] || 0) + 1; if (m.t === 'cells') cellsGot += m.a.length / 5; return orig.call(this, m); };
    let out; try { out = R.burst(rec.recs, { before: R.undoCells, max: 600 }); } finally { delete g.netMessage; }
    const net = R.tick(out.netMs), worst = Math.max(0, ...out.frames), bad = [];
    if (out.pending) bad.push('the inbox still holds ' + out.pending);
    if (out.deliverMs > 40) bad.push(`handing over ${rec.recs.length} messages took ${out.deliverMs.toFixed(0)} ms`);
    if (net.max > 12) bad.push(`a frame spent ${net.max.toFixed(1)} ms in the net tick`);
    if (cellsGot !== cellsSent) bad.push(`cells: ${cellsGot} applied of ${cellsSent} sent (the guest applies them in slices: every cell must still arrive)`);
    for (const t of ['sale', 'ent+', 'toast', 'give']) if ((handled[t] || 0) !== (sentBy[t] || 0)) bad.push(`${t}: ${handled[t] || 0} handled of ${sentBy[t] || 0} sent`);
    for (const t of ['pos', 'bodies', 'dyn']) if ((handled[t] || 0) > (sentBy[t] || 0) * 0.7) bad.push(`${handled[t]} stale ${t} messages were played back (sent ${sentBy[t]}): only those inside the 3 ms of the moment may be`);
    const wrong = diff(want), unsent = rec.queues.netOut / 5; if (wrong > unsent) bad.push(wrong + ' cells differ at the end (the host still held ' + unsent + ' unsent edits)');
    (window.__netperf = window.__netperf || {})['mp-guest-burst'] = { line: `9 s of stream (${rec.recs.length} msgs, ${(rec.sum.total / 1024).toFixed(0)} KB) delivered at once: hand-over ${out.deliverMs.toFixed(1)} ms, net tick max ${net.max.toFixed(1)} ms over ${out.netMs.length} frames, slowest frame ${worst.toFixed(1)} ms; handled pos ${handled.pos || 0}/${sentBy.pos}, bodies ${handled.bodies || 0}/${sentBy.bodies}, dyn ${handled.dyn || 0}/${sentBy.dyn}, cells ${cellsGot}/${cellsSent}`, tick: net, frame: R.tick(out.frames), sim: 0, queues: {} };
    return bad.length === 0 || bad.join('; ');
  });
}
