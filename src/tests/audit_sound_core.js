// audit_sound.*: an adversarial pass over the positional sound work (src/spatial.js, src/worldsound.js and every place that plays a world sound).
// It goes after what sound_core.js leaves out: a far sale that is silent but still takes the coin slot of one next to you (on the host and on the guest), the nodes of a voice that are never let go,
// a friend's work heard at full volume on the host because it went through a side door (a catalog tool, a belt line, a belt intake), a machine high in the pile humming in the bay,
// and the limits that must hold: nothing is silent that should be heard, a 50 rig flood builds no more than the voice cap.
import * as SP from '../spatial.js';
import * as WS from '../worldsound.js';
import * as BP from '../beltplan.js';
import { makeKit, UP } from './power_lib.js';

export default async function (ctx) {
  const { T, g, S, p, fresh, adv, toI, toK } = ctx;
  const { CLASSES, TOTAL_CAP } = SP;
  const K = makeKit(ctx);
  const trace = () => { g.sound.tracing = true; g.sound.trace = []; g.sound.stats = null; g.sound._win = null; g.sound._occ = null; };
  const untrace = () => { g.sound.tracing = false; g.sound.trace = []; delete g.sound._now; g.sound._win = null; };
  const listenAt = (x, z) => { p().pos.set(x, 0, z); p().vel.set(0, 0, 0); };
  const last = () => g.sound.trace[g.sound.trace.length - 1];
  const asHost = async (f) => {   // run f with the page pretending to host a game, and every message recorded
    const o = { send: g.netSend, open: g.net.open, role: g.net.role }, sent = [];
    g.netSend = (m) => { sent.push(m); }; g.net.open = true; g.net.role = 'host';
    try { return await f(sent); } finally { g.netSend = o.send; g.net.open = o.open; g.net.role = o.role; }
  };

  await T('audit_sound.a-silent-sale-far-away-does-not-take-the-coin-slot-of-a-sale-next-to-you', async () => {
    fresh({}); const bad = []; trace(); listenAt(0, 0); g.coinCd = 0; g.sound._now = () => 500;
    // a depot deep in a tunnel sells first, then the SORT bin next to you, in the same instant
    const farRang = WS.saleCoin(g, { x: 70, y: 1.2, z: 0 }), nearRang = WS.saleCoin(g, { x: 2, y: 1.2, z: 0 });
    const far = g.sound.trace.find((t) => t.x === 70), near = g.sound.trace.find((t) => t.x === 2);
    if (!far || far.played || farRang) bad.push('the far sale rang: ' + JSON.stringify(far));
    if (!near || !near.played || !nearRang) bad.push('the sale next to you was swallowed by the silent one before it: ' + JSON.stringify(near));
    if (g.coinCd > 0 && !(near && near.played)) bad.push('a silent coin set the coin cooldown (' + g.coinCd + ')');
    // fifty rigs selling at a far depot every 10 ms must not keep the bin next to you silent
    g.coinCd = 0; g.sound._win = null; let heard = 0;
    for (let q = 0; q < 50; q++) {   // 10 ms steps: a far depot sells every step, the bin next to you every tenth
      g.sound._now = () => 501 + q * 0.01; g.coinCd = Math.max(0, g.coinCd - 0.01);
      WS.saleCoin(g, { x: 70 + (q % 5), y: 1.2, z: q % 7 });
      if (q % 10 === 9) { g.sound._win = null; if (WS.saleCoin(g, { x: 2, y: 1.2, z: 0 })) heard++; }
    }
    if (heard < 2) bad.push('only ' + heard + ' of 5 sales next to you rang during a far flood (the cooldown was kept alive by coins nobody hears)');
    untrace();
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_sound.the-guest-hears-a-sale-next-to-it-after-a-silent-far-one', async () => {
    fresh({}); const bad = []; trace(); listenAt(0, 0); g.coinCd = 0; g.sound._now = () => 600;
    const a = WS.saleHear(g, { fb: 1, x: 70, y: 1.2, z: 0 }), b = WS.saleHear(g, { fb: 1, x: 2, y: 1.2, z: 0 });
    if (a) bad.push('a far sale rang for the guest');
    if (!b) bad.push('the near sale was swallowed by the far one');
    g.coinCd = 0; g.sound._win = null; trace();
    // a message with no place in it rings from the SORT bin, a forged one from the sky is dropped
    listenAt(g.hall.binPos.x + 1, g.hall.binPos.z); if (!WS.saleHear(g, { fb: 1 })) bad.push('a host message without a position was not heard at the bin');
    g.coinCd = 0; if (WS.saleHear(g, { fb: 1, x: 1e9, y: 0, z: 0 })) bad.push('a forged position rang');
    if (WS.saleHear(g, null) !== false && g.coinCd === 0) { /* null is a message without a position: the bin rings it (checked above), but it must not throw */ }
    untrace();
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_sound.the-sale-message-to-the-guest-is-still-one-per-0.12-s-whoever-hears-it', async () => {
    fresh({}); const bad = [];
    await asHost(async (sent) => {
      listenAt(0, 0); g.coinCd = 0; g.time = 4000;
      for (let q = 0; q < 30; q++) WS.saleCoin(g, { x: 70 + q, y: 1.2, z: 0 });   // 30 far sales in one frame
      const n = sent.filter((m) => m.t === 'sale').length; if (n !== 1) bad.push(n + ' sale messages for 30 sales in one frame');
      g.time += 0.05; for (let q = 0; q < 10; q++) WS.saleCoin(g, { x: 2, y: 1.2, z: 0 });
      if (sent.filter((m) => m.t === 'sale').length !== 1) bad.push('a second message inside 0.12 s');
      g.time += 0.2; g.coinCd = 0; WS.saleCoin(g, { x: 2, y: 1.2, z: 0 });
      const all = sent.filter((m) => m.t === 'sale'); if (all.length !== 2) bad.push(all.length + ' messages after 0.25 s, want 2');
      if (all[1] && !(Math.abs(all[1].x - 2) < 0.1 && all[1].fb === 1)) bad.push('the message does not carry the bin position: ' + JSON.stringify(all[1]));
    });
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_sound.every-voice-lets-go-of-its-nodes-when-it-is-over', async () => {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return true;
    const s = new g.sound.constructor(); s.bindWorld(g); s.init(); if (!s.ctx) return true;
    const bad = [], c = s.ctx, made = [];
    try {
      for (const name of ['createGain', 'createStereoPanner', 'createBiquadFilter']) {
        const orig = c[name].bind(c);
        c[name] = (...a) => { const n = orig(...a); const rec = { name, n, off: 0 }; const od = n.disconnect.bind(n); n.disconnect = (...x) => { rec.off++; return od(...x); }; made.push(rec); return n; };
      }
      s.voiceTtl = 60;
      const L = { x: 0, y: 30, z: 0, yaw: 0 };
      const v = s.at(9, 30, 4, 'work', L), w = s.at(-14, 30, -6, 'door', L), own = made.slice();   // the nodes the two voices made themselves, before any sound adds its own
      v.thump(0.2, 90); w.thump(0.2, 90); w.creak(0.1);
      const panners = own.filter((r) => r.name === 'createStereoPanner').length, filters = own.filter((r) => r.name === 'createBiquadFilter').length, gains = own.filter((r) => r.name === 'createGain').length;
      if (gains !== 2 || !panners || !filters) bad.push('the test measures nothing: ' + gains + ' gains, ' + panners + ' panners, ' + filters + ' filters');
      await ctx.realSleep(400);
      const open = own.filter((r) => r.off === 0); if (open.length) bad.push(open.length + ' of the ' + own.length + ' nodes of two voices were never disconnected (' + open.map((r) => r.name.slice(6)).join(', ') + ')');
      if (!(SP.VOICE_TTL >= 5000 && SP.VOICE_TTL <= 20000)) bad.push('the release time ' + SP.VOICE_TTL + ' ms would cut the longest sound (a 2 s rumble runs 4 s) or hold nodes too long');
    } finally { try { s.ctx.close(); } catch (e) { /* closed already */ } }
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_sound.a-50-rig-flood-builds-no-more-voices-than-the-cap-and-no-node-for-a-silent-one', async () => {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return true;
    const s = new g.sound.constructor(); s.bindWorld(g); s.init(); if (!s.ctx) return true;
    const bad = [], c = s.ctx; let gains = 0;
    try {
      const orig = c.createGain.bind(c); c.createGain = (...a) => { gains++; return orig(...a); };
      s.voiceTtl = 10;
      const L = { x: 0, y: 30, z: 0, yaw: 0 }; let t = 50; s._now = () => t;
      for (let q = 0; q < 50; q++) { const v = s.at(-9 + (q % 10) * 2, 30, -9 + Math.floor(q / 10) * 4, 'coin', L); v.coin(0); }
      const voices = gains / 3; // a coin is one gain of the voice plus two of its tones
      if (!(gains <= 3 * (CLASSES.coin.cap + 0) + 1)) bad.push('50 coins built ' + gains + ' gains (' + voices.toFixed(1) + ' voices), the cap is ' + CLASSES.coin.cap);
      gains = 0; t += 1;
      for (let q = 0; q < 50; q++) s.at(300 + q, 30, 0, 'coin', L).coin(0);
      if (gains !== 0) bad.push('far coins built ' + gains + ' gains');
      gains = 0; t += 1;
      for (const k of Object.keys(CLASSES)) for (let q = 0; q < 6; q++) s.at(q * 9 - 20, 30, (q % 3) * 9, k, L);
      if (!(gains <= TOTAL_CAP)) bad.push('every class at once built ' + gains + ' voice gains, the total cap is ' + TOTAL_CAP);
      // a flood of 1000 sources around the hall costs a bounded time and never makes the world build a chunk
      const cols0 = g.world.cols.size; t += 1; gains = 0; const t0 = performance.now();
      for (let q = 0; q < 1000; q++) { const a = q * 0.37; s.at(Math.cos(a) * (20 + (q % 50)), 3 + (q % 7), Math.sin(a) * (20 + (q % 50)), q % 3 ? 'coin' : 'collapse', L); if (q % 20 === 0) t += 0.3; }
      const ms = performance.now() - t0; if (!(ms < 400)) bad.push('1000 positional sounds took ' + ms.toFixed(0) + ' ms');
      if (g.world.cols.size !== cols0) bad.push('the sounds made the world build ' + (g.world.cols.size - cols0) + ' columns');
    } finally { try { s.ctx.close(); } catch (e) { /* closed already */ } }
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_sound.what-a-friend-builds-is-heard-on-the-host-from-where-it-stands-and-your-own-at-full-volume', async () => {
    fresh({}); const bad = [], root = g.sound;
    const seen = [], wrap = (n) => { const o = root[n]; root[n] = function (...a) { seen.push([n, this === root]); return o.apply(this, a); }; return () => { root[n] = o; }; };
    const undo = ['tone', 'thump', 'noise'].map(wrap);
    try {
      trace(); listenAt(-50, -8);
      // a catalog tool placed by the guest 60 m away: host side `placeEntity` runs while the host executes the guest's command
      g._actor = 'g'; g._forGuest = true; seen.length = 0;
      try { g.placeEntity('lantern', { x: 10, y: 0, z: -8 }, { rebuild: false }); } finally { g._actor = null; g._forGuest = false; }
      const mine = seen.filter((q) => q[1]); if (mine.length) bad.push('a friend\'s placement 60 m away played ' + mine.length + ' sounds at full volume on the host');
      if (!g.sound.trace.some((t) => t.x === 10 && t.cls === 'work')) bad.push('the friend\'s placement was not routed through sound.at: ' + JSON.stringify(g.sound.trace.map((t) => [t.cls, t.x])));
      // your own placement stays full volume
      seen.length = 0; g.placeEntity('lantern', { x: 11, y: 0, z: -8 }, { rebuild: false });
      if (!seen.length || !seen.every((q) => q[1])) bad.push('your own placement is not at full volume: ' + JSON.stringify(seen));
      // the belt line the guest planned: the host lays it and must not hear it at full volume from across the base
      listenAt(-50, -8); seen.length = 0; g.sound.trace = []; S().money = 1e9; S().items.belt = 5;
      let i0 = 0, k0 = 0; for (let z = -12; z <= 12 && !i0; z += 2) for (let x = 6; x <= 20 && !i0; x += 2) { const a = toI(x), b = toK(z); if (![0, 1, 2].some((d) => { const r = g.logi.canPlace(a + d, 0, b); return r && r !== 'Too close'; })) { i0 = a; k0 = b; } }
      g._actor = 'g'; let lay = null;
      try { lay = BP.lay(g, 0, [[i0, 0, k0, 0, 0, 0], [i0 + 1, 0, k0, 0, 0, 0], [i0 + 2, 0, k0, 0, 0, 0]], false); } finally { g._actor = null; }
      if (!lay || !lay.ok) bad.push('the test belt line was refused, it measures nothing: ' + JSON.stringify(lay && lay.why));
      const mine2 = seen.filter((q) => q[1]); if (mine2.length) bad.push('a belt line the guest laid 60 m away rang at full volume on the host (' + mine2.length + ')');
      if (lay && lay.ok && !g.sound.trace.some((t) => t.cls === 'work')) bad.push('the belt line was not routed through sound.at: ' + JSON.stringify(g.sound.trace.map((t) => [t.cls, t.x])));
    } finally { undo.forEach((f) => f()); untrace(); }
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_sound.a-machine-high-in-the-pile-does-not-hum-in-the-bay', async () => {
    const bad = [], hum = (j) => { K.reset(UP); listenAt(0, 0); const G = K.tile('gen', 4, 4, j ? { j } : {}); G.burn = 1e5; G.burnMax = 1e5; G.lit = true; adv(0.4); return g.logi.hum; };
    const low = hum(0); if (!(low > 0.5)) bad.push('a burning generator 5 m away does not hum: ' + low);
    const high = hum(70);   // 42 m up, directly over the bay
    if (!(high < 0.05)) bad.push('a generator 42 m above you hums at ' + high + ' (it was ' + low + ' on the floor)');
    const mid = hum(12); if (!(mid > 0 && mid < low)) bad.push('7 m up it should hum a little less: ' + mid + ' against ' + low);
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_sound.a-source-with-no-place-is-not-heard-and-a-garbled-host-message-never-throws', async () => {
    fresh({}); const bad = []; trace(); listenAt(0, 0);
    for (const [x, y, z] of [[NaN, 0, 0], [undefined, 0, 0], [0, 'up', 0], [Infinity, 0, 0], [0, 0, null === 1 ? 0 : undefined]]) {
      const v = g.sound.voice(x, y, z, 'boom'); if (v.gain !== 0) bad.push('a source at ' + [x, y, z] + ' is heard at ' + v.gain);
      const a = g.sound.at(x, y, z, 'boom'); if (a.audible) bad.push('at(' + [x, y, z] + ') is audible');
    }
    const keep = { open: g.net.open, role: g.net.role, ready: g.guestReady }, e0 = g.errCount || 0;
    g.net.open = true; g.net.role = 'guest'; g.guestReady = true;
    try {
      for (const m of [{ t: 'sale', fb: 1 }, { t: 'sale', fb: 1, x: 'a', y: {}, z: [] }, { t: 'sale', fb: 1, x: 1e12, y: 0, z: 0 }, { t: 'sstrain', x: NaN, y: 0, z: 0, note: 'n' }, { t: 'sstrain', note: 'n' }, { t: 'boom', x: 1, y: 1 }, { t: 'slide', x: 'q', z: 1, r: 3 }, { t: 'creak', a: [] }]) {
        try { g.netMessage(m); } catch (x) { bad.push('a ' + m.t + ' message with ' + JSON.stringify(m) + ' threw ' + x.message); }
      }
    } finally { g.net.open = keep.open; g.net.role = keep.role; g.guestReady = keep.ready; }
    untrace();
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_sound.a-late-joiner-does-not-hear-the-coins-of-the-seconds-before-it-arrived', async () => {
    fresh({}); const bad = [];
    const keep = { open: g.net.open, role: g.net.role, ready: g.guestReady, pend: g.netPending };
    g.net.open = true; g.net.role = 'guest'; g.guestReady = false; g.netPending = [];
    try {
      for (let q = 0; q < 300; q++) g.netMessage({ t: 'sale', fb: 1, x: 3, y: 1, z: -4 });
      if (g.netPending.length) bad.push(g.netPending.length + ' sale sounds held for the guest, to be replayed all at once');
      g.netMessage({ t: 'toast', icon: 'x', title: 'a', text: 'b' }); if (g.netPending.length !== 1) bad.push('a message that is not only a sound must still be held');
    } finally { g.net.open = keep.open; g.net.role = keep.role; g.guestReady = keep.ready; g.netPending = keep.pend; }
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_sound.your-own-building-and-hammering-stay-at-full-volume-and-never-go-through-the-voice-limiter', async () => {
    fresh({ power: 1 }); const bad = [], root = g.sound, seen = [];
    const wrap = (n) => { const o = root[n]; root[n] = function (...a) { seen.push([n, this === root]); return o.apply(this, a); }; return () => { root[n] = o; }; };
    const undo = ['tone', 'thump', 'noise'].map(wrap);
    try {
      trace(); listenAt(0, 0);
      const r = await ctx.placeAtFloor('gen', -3.4, 3.0, 2.0); if (!r.ok) return 'gen: ' + r.why;
      const gen = ctx.tiles().find((t) => t.type === 'gen');
      if (!seen.length || !seen.every((q) => q[1])) bad.push('your own placing was not at full volume: ' + JSON.stringify(seen));
      if (g.sound.trace.length) bad.push('your own placing went through sound.at: ' + JSON.stringify(g.sound.trace.map((t) => t.cls)));
      seen.length = 0; g.doDecon({ kind: 'tile', id: gen.id });
      if (!seen.length || !seen.every((q) => q[1])) bad.push('your own hammering was not at full volume: ' + JSON.stringify(seen));
      // sixty of your own placements in a row all ring: none is capped by the limiter
      seen.length = 0; for (let q = 0; q < 60; q++) g.sound.place();
      if (seen.filter((x) => x[0] === 'thump').length !== 60) bad.push('your own sounds were thinned: ' + seen.filter((x) => x[0] === 'thump').length + ' of 60');
    } finally { undo.forEach((f) => f()); untrace(); }
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_sound.nothing-that-should-be-heard-is-silent-a-sale-at-the-bin-a-collapse-at-20-m-an-alarm', async () => {
    fresh({}); const bad = [], L = { x: 0, y: 30, z: 0, yaw: 0 }, keep = g.sound.game;
    const at = (d, cls) => { g.sound.game = { world: null }; try { return g.sound.voice(d, 30, 0, cls, L).gain; } finally { g.sound.game = keep; } };
    const want = [['coin', 4, 1], ['coin', 8, 0.4], ['coin', 12, 0.1], ['collapse', 20, 0.5], ['boom', 20, 0.5], ['rumble', 40, 0.15], ['alarm', 20, 0.4], ['alarm', 45, 0.03], ['door', 10, 0.4], ['lift', 10, 0.4], ['pad', 10, 0.4],
      ['work', 15, 0.25], ['arch', 25, 0.15], ['scan', 12, 0.3], ['creak', 30, 0.15], ['slide', 40, 0.1], ['support', 40, 0.1], ['fall', 20, 0.3], ['bot', 12, 0.3], ['step', 8, 0.25], ['throw', 10, 0.3]];
    for (const [cls, d, min] of want) { const v = at(d, cls); if (!(v >= min)) bad.push(`${cls} at ${d} m is ${v.toFixed(3)}, want at least ${min}`); }
    // behind 3 m of plush a blast and a collapse are still heard (the ground carries them), an alarm a little less, a coin much less
    g.sound.game = keep; const w = g.world, cells = [], ls = { x: 0, y: 1.2, z: -1.4, yaw: 0 }, sx = 11, sy = 1.2, sz = -1.4;
    g.sound._occ = null; const open = {}; for (const k of ['collapse', 'alarm', 'coin']) open[k] = g.sound.voice(sx, sy, sz, k, ls).gain;
    for (let i = ctx.toI(4); i <= ctx.toI(8); i++) for (let k = ctx.toK(-5); k <= ctx.toK(2); k++) for (let j = 0; j < 8; j++) { if (!w.get(i, j, k)) { w.setCell(i, j, k, 2, 0); cells.push([i, j, k]); } }
    g.sound._occ = null;
    try {
      const keepRatio = (k) => g.sound.voice(sx, sy, sz, k, ls).gain / open[k];
      const c = keepRatio('collapse'), a = keepRatio('alarm'), n = keepRatio('coin');
      if (!(c > 0.85)) bad.push('a collapse behind 3 m of plush keeps only ' + c.toFixed(2) + ' of its volume');
      if (!(a > 0.55 && a < c)) bad.push('an alarm behind 3 m of plush keeps ' + a.toFixed(2) + ' (a collapse ' + c.toFixed(2) + ')');
      if (!(n < 0.5 && n < a)) bad.push('a coin behind 3 m of plush keeps ' + n.toFixed(2));
    } finally { for (const [i, j, k] of cells) w.removeCell(i, j, k, true); g.sound._occ = null; }
    return bad.length === 0 || bad.join(' || ');
  });
}
