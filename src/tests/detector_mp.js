// mp.detector.*: the detector arch for a host and a guest, no network: one page plays both roles by switching g.net.role and capturing g.netSend.
// The host owns the ent and answers every command; each player detects their own crossing on their own machine, and the other screen mirrors it.
import { makeKit } from './addons_lib.js';
import * as D from '../detector.js';
import * as EXT from '../ext.js';
import { infoFor } from '../info.js';
import { species, NEEDLE, pools } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, p, V3, fresh, adv, toI, toK } = ctx;
  const K = makeKit(ctx);
  const UP = { detector: 1, archGate: 1, archGiant: 1, power: 1, belts: 1 };
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => {
    const fn0 = g.foundNeedle, mode0 = g.mode, remote0 = g.remote;
    try { g.mode = 'play'; return await fn(); } finally { done(); g.foundNeedle = fn0; g.remote = remote0; g.mode = mode0 === 'ended' ? 'play' : mode0; S().found = false; S().ending = null; g.stowed = true; g.rebuildTools(); g.cfgClip = null; if (g.ui.openModal) g.ui.closeModals(); }
  });
  const rec = () => {
    const calls = [], keep = {}; for (const k of ['tone', 'noise', 'thump']) keep[k] = g.sound[k];
    g.sound.tone = (...a) => calls.push(['tone', ...a]); g.sound.noise = (...a) => calls.push(['noise', ...a]); g.sound.thump = (...a) => calls.push(['thump', ...a]);
    return { calls, off: () => { for (const k of Object.keys(keep)) g.sound[k] = keep[k]; } };
  };
  const toneN = (r) => r.calls.filter((c) => c[0] === 'tone');
  const mk = (size, x, z, axis = 'z') => {
    K.clearBay(); const S_ = D.SIZES[size], lat = axis === 'z' ? toI(x) : toK(z), m = axis === 'z' ? toK(z) : toI(x);
    const l = D.layout(g, size, axis, m, lat - (S_.w / 2 - 1), 0); if (!l.ok) throw new Error('layout: ' + l.why); return g.placeEntity('arch', l.ent);
  };
  const walk = (e) => {
    const s = D.archState(e); s.in = false; s.along = null; s.cd = 0; p().vel.set(0, 0, 0);
    p().pos.set(e.cx, 0, e.cz - 1.5); g.playerGateScan(0.05); p().pos.set(e.cx, 0, e.cz); g.playerGateScan(0.05);
  };
  const carry = (...items) => { S().carry = items.map((it) => (typeof it === 'number' ? { sp: it, vr: 0 } : it)); };
  const common = pools[0][0], rare = pools[2][0];
  const arches = () => [...g.machines.items.values()].map((it) => it.ent).filter((e) => e.type === 'arch');
  // drop the arch from this world and show it again the way a guest does: from the host's messages
  const toGuest = (msgs) => { done(); for (const e of arches()) g.removeViewEnt(e.id); role('guest'); cap(); for (const m of msgs) g.netMessage(json(m)); };

  await guard('mp.detector.ent-plus-and-the-late-joiner-list-show-the-same-arch-with-the-same-readout', async () => {
    fresh(UP); const bad = []; role('host'); cap(); const e = mk(2, -7.2, 8.0);
    g.setCfg(e, { mode: 'rarity', rarity: 3, exact: true, volume: 0.4 }); const hostInfo = JSON.stringify(infoFor(g, { kind: 'mach', id: e.id }));
    const plus = ofType('ent+').filter((m) => m.ent.id === e.id).pop(); if (!plus) return 'host did not announce the arch';
    for (const k of ['items', 'q', 'cache', 'hist']) if (k in plus.ent) bad.push('transient field sent: ' + k);
    if (plus.ent.mode !== 'rarity' || plus.ent.rarity !== 3 || plus.ent.exact !== true || plus.ent.volume !== 0.4 || plus.ent.size !== 2) bad.push('ent+ lacks the settings: ' + JSON.stringify(plus.ent));
    const id = e.id; sent.length = 0; g.sendWorld(); const lists = ofType('ents'); const late = lists.flatMap((m) => m.list).find((x) => x.id === id); if (!late || late.mode !== 'rarity' || late.size !== 2) bad.push('the late joiner list lacks the arch: ' + JSON.stringify(late));
    toGuest([plus]); const v = S().entities.find((x) => x.id === id); if (!v || !v.view || v.mode !== 'rarity') return 'guest has no copy ' + bad.join('; ');
    const it = g.machines.items.get(id); if (!it || !it.obj || !it.arch || it.obj.children.length < 3) bad.push('guest drew no mesh');
    if (Math.abs(it.obj.position.x - e.cx) > 1e-6 || Math.abs(it.obj.position.z - e.cz) > 1e-6 || Math.abs(it.obj.rotation.y - e.yaw) > 1e-6) bad.push('guest mesh is somewhere else');
    D.archState(v).powered = false; const gi = infoFor(g, { kind: 'mach', id }); if (JSON.stringify(gi) !== hostInfo) bad.push('readouts differ: ' + JSON.stringify(gi) + ' vs ' + hostInfo);
    // the late joiner path builds the same thing
    for (const x of arches()) g.removeViewEnt(x.id); for (const m of lists) g.netMessage(json(m)); const lv = arches().find((x) => x.id === id); if (!lv || lv.mode !== 'rarity' || !g.machines.items.get(id).arch) bad.push('late joiner copy missing');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.detector.guest-place-command-is-rebuilt-by-the-host-and-forgeries-change-nothing', async () => {
    fresh(UP); const bad = []; K.clearBay(); S().money = 1e12;
    role('guest'); cap(); S().items.arch = 3; K.equip('arch'); K.aimDir(-7.2, 0, 3.0, 1, 2.2); await ctx.plan(); if (!g.plan || !g.plan.ok) return 'guest plan: ' + (g.plan && g.plan.why);
    const n0 = S().entities.length; g.placeCurrent(g.curTool()); const c = sent.find((m) => m.t === 'cmd' && m.c === 'place');
    if (!c || S().entities.length !== n0 || c.d.tool.id !== 'arch' || c.d.tool.kind !== 'arch') return 'guest did not only send the command: ' + JSON.stringify(c);
    done(); role('host'); cap(); const have = S().items.arch; g.netMessage(json(c)); const made = arches(); if (made.length !== 1 || made[0].size !== 1) bad.push('host built ' + made.length);
    if (!ofType('ent+').some((m) => m.ent.type === 'arch')) bad.push('host did not announce the arch');
    // forgeries: a giant claimed with a small arch item, a belt used as an arch, a moved center, a stack on the first one
    S().items.arch = have; const good = json(c); sent.length = 0;
    const forged = [
      { ...good, d: { tool: { ...good.d.tool, p: { size: 2 } }, ent: { ...good.d.ent, gm: good.d.ent.gm + 6, size: 2, cx: 999, w: 99, h: 99 } } },
      { ...good, d: { tool: { id: 'belt', kind: 'arch', p: { size: 2 } }, ent: { ...good.d.ent, gm: good.d.ent.gm + 8 } } },
      { ...good, d: { tool: good.d.tool, ent: { ...good.d.ent } } },
    ];
    S().items.belt = 5;
    for (const f of forged) g.netMessage(json(f));
    const after = arches(); const odd = after.filter((a) => a.cx > 100 || a.size === 2 || a.w > 5); if (odd.length) bad.push('a forged field survived: ' + JSON.stringify(odd.map((a) => [a.cx, a.size, a.w])));
    if (after.length !== 2) bad.push('arches after forgeries: ' + after.length + ' (one clean extra expected, the belt and the overlap refused)');
    if (S().items.belt !== 5) bad.push('a belt was used up as an arch');
    if (!sent.some((m) => m.t === 'toast')) bad.push('the guest was not told about a refusal');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.detector.guest-cfg-picks-the-target-and-both-screens-agree-afterwards', async () => {
    fresh(UP); const bad = []; role('host'); cap(); const e = mk(1, -7.2, 3.0); const id = e.id; const plus = ofType('ent+').pop();
    toGuest([plus]); const patch = { mode: 'species', target: rare, quiet: true }; const r = g.setCfg(id, patch); const cmd = sent.find((m) => m.t === 'cmd' && m.c === 'cfg');
    if (!r.ok || !cmd || JSON.stringify(cmd.d.patch) !== JSON.stringify(patch)) bad.push('no cfg command: ' + JSON.stringify(cmd));
    if (arches()[0].mode !== 'one') bad.push('the guest changed its own copy first');
    // a species the game does not have never leaves the guest and a bad one is refused by the host
    sent.length = 0; if (g.setCfg(id, { mode: 'species', target: 777777 }).ok) bad.push('guest sent a target out of range');
    done(); for (const x of arches()) g.removeViewEnt(x.id); S().entities.push({ ...json(plus.ent), view: false }); g.addEntity(S().entities[S().entities.length - 1]); role('host'); cap();
    g.netMessage(json({ t: 'cmd', c: 'cfg', d: { id, patch: { mode: 'species', target: 4090000 } } })); if (arches()[0].mode !== 'one') bad.push('host took a bad target');
    g.netMessage(json({ t: 'cmd', c: 'cfg', d: { id, patch: { mode: 'species' } } })); if (arches()[0].mode !== 'one') bad.push('host took species with no target');
    g.netMessage(json(cmd)); const he = arches()[0]; if (he.mode !== 'species' || he.target !== rare || !he.quiet) bad.push('host did not apply: ' + JSON.stringify([he.mode, he.target, he.quiet]));
    const minus = sent.findIndex((m) => m.t === 'ent-'), plus2 = sent.findIndex((m) => m.t === 'ent+'); if (minus < 0 || plus2 < minus) bad.push('ent- then ent+ expected');
    const msgs = json(sent.filter((m) => m.t === 'ent-' || m.t === 'ent+')), hostInfo = JSON.stringify(infoFor(g, { kind: 'mach', id }));
    toGuest(msgs); const gv = arches()[0]; if (!gv || gv.mode !== 'species' || gv.target !== rare || !gv.quiet) bad.push('guest copy not refreshed'); D.archState(gv).powered = D.archState(he).powered;
    if (JSON.stringify(infoFor(g, { kind: 'mach', id })) !== hostInfo) bad.push('readouts differ after the change');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.detector.guest-crossing-hears-and-host-wins', async () => {
    fresh(UP); const bad = []; role('host'); cap(); const e = mk(1, -7.2, 3.0), id = e.id, plus = ofType('ent+').pop();
    toGuest([plus]); const ge = arches()[0]; carry(common, NEEDLE); let r = rec();
    try { walk(ge); } finally { r.off(); }
    if (!toneN(r).some((c) => c[2] === 659) || !toneN(r).some((c) => c[2] === 988)) bad.push('the guest did not hear the da-ding at once: ' + JSON.stringify(toneN(r).map((c) => c.slice(1, 4))));
    const cmd = sent.find((m) => m.t === 'cmd' && m.c === 'arch'); if (!cmd || cmd.d.id !== id || cmd.d.k !== 'ok' || cmd.d.n !== 2 || cmd.d.sp !== NEEDLE) bad.push('no arch command: ' + JSON.stringify(cmd));
    const win = sent.find((m) => m.t === 'win'); if (!win || win.ending !== 'plush') bad.push('guest did not send the win: ' + JSON.stringify(win));
    if (g.mode !== 'ended') bad.push('the guest screen did not end');
    // host side: the friend stands at the arch, the host hears it, the lamps flash, and the win message ends the host game
    g.mode = 'play'; S().found = false; S().ending = null; done(); for (const x of arches()) g.removeViewEnt(x.id); S().entities.push(e); g.addEntity(e); role('host'); cap(); g.remote = { pos: new V3(e.cx, 0, e.cz) }; p().pos.set(e.cx, 0, e.cz - 4); r = rec();
    try { g.netMessage(json(cmd)); } finally { r.off(); }
    const hs = D.archState(e); if (hs.kind !== 'ok' || !(hs.flash > 1)) bad.push('host lamps did not flash green: ' + JSON.stringify([hs.kind, hs.flash])); if (!toneN(r).some((c) => c[2] === 988)) bad.push('the host did not hear the guest\'s da-ding');
    if (ofType('xrow').length) bad.push('the host echoed the guest crossing back to the guest');
    g.netMessage(json(win)); if (S().ending !== 'plush' || g.mode !== 'ended') bad.push('the host did not end on the guest win: ' + S().ending);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.detector.host-crossing-is-announced-and-the-guest-flashes-and-hears-it', async () => {
    fresh(UP); const bad = []; role('host'); cap(); const e = mk(1, -7.2, 3.0), id = e.id, plus = ofType('ent+').pop(); g.setCfg(e, { mode: 'species', target: rare }); const plus2 = ofType('ent+').pop();
    carry(common); sent.length = 0; let r = rec(); try { walk(e); } finally { r.off(); }
    const row = ofType('xrow').find((m) => m.k === 'arch'); if (!row || row.d.id !== id || row.d.k !== 'bad' || row.d.n !== 1 || row.d.by !== 'h') bad.push('host did not announce: ' + JSON.stringify(row));
    if (!toneN(r).some((c) => c[1] === 'square')) bad.push('host did not hear its own buzz');
    carry(rare); sent.length = 0; walk(e); const ok = ofType('xrow').find((m) => m.k === 'arch' && m.d.k === 'ok'); if (!ok || ok.d.sp !== rare) bad.push('a match was not announced with its species: ' + JSON.stringify(ok));
    carry(); sent.length = 0; walk(e); const tick = ofType('xrow').find((m) => m.k === 'arch'); if (!tick || tick.d.k !== 'tick' || tick.d.n !== 0) bad.push('empty bag: ' + JSON.stringify(tick));
    // the guest shows the same crossing, and its distance decides how loud it is
    toGuest([plus2]); void plus; const ge = arches()[0]; D.archState(ge).powered = true; p().pos.set(ge.cx, 0, ge.cz - 3);
    r = rec(); try { g.netMessage(json({ t: 'xrow', k: 'arch', d: row.d })); } finally { r.off(); }
    if (D.archState(ge).kind !== 'bad' || !toneN(r).some((c) => c[1] === 'square')) bad.push('guest did not react to the bad crossing');
    r = rec(); try { g.netMessage(json({ t: 'xrow', k: 'arch', d: ok.d })); } finally { r.off(); }
    if (!toneN(r).some((c) => c[2] === 988) || D.archState(ge).kind !== 'ok') bad.push('guest did not react to the match'); EXT.update(g, 0.05, true);
    const lamps = g.machines.items.get(id).arch.lamps.map((m) => m.color.getHex()); if (!lamps.some((c) => c === 0x45ff7a || c === 0xffd24a)) bad.push('guest lamps did not flash green and gold: ' + lamps);
    p().pos.set(ge.cx + 70, 0, ge.cz); r = rec(); try { g.netMessage(json({ t: 'xrow', k: 'arch', d: row.d })); } finally { r.off(); } if (r.calls.length) bad.push('a far guest still heard it');
    // the guest never relays a host event, and its own events carry no by:h
    sent.length = 0; g.netMessage(json({ t: 'xrow', k: 'arch', d: { ...row.d, by: 'g' } })); if (sent.length) bad.push('guest sent something on an event');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.detector.a-guest-report-from-nowhere-or-with-junk-is-ignored', async () => {
    fresh(UP); const bad = []; role('host'); cap(); const e = mk(1, -7.2, 3.0), id = e.id; const r = rec(); g.remote = { pos: new V3(e.cx + 40, 0, e.cz) };
    try {
      for (const d of [{ id, k: 'ok', n: 1, sp: rare }, null, 5, 'x', { id: 'nope', k: 'ok' }, { id, k: 'evil' }, { id: {}, k: 'bad' }]) g.netMessage({ t: 'cmd', c: 'arch', d: json(d) });
      if (D.archState(e).last || r.calls.length) bad.push('a friend 40 m away still flashed and sounded the arch');
      g.remote = null; g.netMessage({ t: 'cmd', c: 'arch', d: { id, k: 'bad', n: 1, sp: 0 } }); if (D.archState(e).last) bad.push('a report with no friend present was shown');
      g.remote = { pos: new V3(e.cx, 0, e.cz) };
      g.netMessage({ t: 'cmd', c: 'arch', d: { id, k: 'ok', n: 9e9, sp: 99999 } }); if (D.archState(e).kind !== 'bad') bad.push('a match with an impossible species was not downgraded: ' + D.archState(e).kind);
      if (D.archState(e).last.n !== 0) bad.push('an absurd count was taken: ' + D.archState(e).last.n);
      g.netMessage({ t: 'cmd', c: 'arch', d: { id, k: 'ok', n: 3, sp: rare } }); if (D.archState(e).kind !== 'ok' || D.archState(e).last.name !== species[rare].name) bad.push('a sane report was not shown');
      // a guest running guestCross itself (a message loop) does nothing
      done(); role('guest'); D.archState(e).last = null; D.guestCross(g, { id, k: 'ok', n: 1, sp: rare }); if (D.archState(e).last) bad.push('guestCross ran on a guest');
    } finally { r.off(); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.detector.power-state-reaches-the-guest-in-the-half-second-row', async () => {
    fresh(UP); const bad = []; K.clearBay(); role('host'); cap();
    const gen = await K.put('gen', { x: -9, z: -1.2, dir: 0 }), pole = await K.put('pole', { x: -9, z: 1.2, dir: 0 }); if (!gen.ok || !pole.ok) return 'rig';
    K.feedGen(K.tileOf(gen.ent), 12); const lit = mk(1, -9, 3.6), dark = mk(1, -5.4, 9.6); S().items.cable = 4; g.cables.connect(gen.ent.id, pole.ent.id); g.cables.connect(pole.ent.id, lit.id); g.power.markDirty(); g.power.update(0.1); adv(1.0, 0.05);   // the lit arch has its cable, the dark one none
    if (!D.archState(lit).powered || D.archState(dark).powered) return `host power: lit ${D.archState(lit).powered}, far ${D.archState(dark).powered}`;
    g.time += 6; g._extRow = 0; sent.length = 0; EXT.update(g, 0.1, false); const row = ofType('xrow').find((m) => m.k === 'arch'); if (!row || row.d.pw[lit.id] !== 1 || row.d.pw[dark.id] !== 0) return 'row: ' + JSON.stringify(row);
    sent.length = 0; g._extRow = 0; EXT.update(g, 0.1, false); if (ofType('xrow').some((m) => m.k === 'arch')) bad.push('an unchanged row was sent again at once');
    const plus = json(S().entities.filter((x) => x.type === 'arch').map((x) => ({ t: 'ent+', ent: g.stripEnt(x) })));
    toGuest(plus); for (const x of arches()) if (D.archState(x).powered) bad.push('a fresh guest copy starts powered'); g.netMessage(json({ t: 'xrow', k: 'arch', d: row.d }));
    EXT.update(g, 0.05, true); const gl = arches().find((x) => x.id === lit.id), gd = arches().find((x) => x.id === dark.id);
    if (!D.archState(gl).powered || D.archState(gd).powered) bad.push('guest power flags are wrong');
    const idle = (e) => g.machines.items.get(e.id).arch.lamps.map((m) => m.color.getHex()); if (idle(gl).some((c) => c !== 0x2e8c4a)) bad.push('guest lit lamps ' + idle(gl)); if (idle(gd).some((c) => c !== 0x222222)) bad.push('guest dark lamps ' + idle(gd));
    // junk rows change nothing and throw nothing
    for (const d of [null, 5, 'x', { pw: 5 }, { pw: { 99999: 1 } }, { k: 'ok', id: 'x', by: 'h' }, { k: 'ok', id: gl.id, by: 'g' }]) g.netMessage(json({ t: 'xrow', k: 'arch', d }));
    if (!D.archState(gl).powered) bad.push('a junk row changed the power flag');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.detector.guest-hammer-asks-the-host-and-the-arch-leaves-both-screens', async () => {
    fresh(UP); const bad = []; role('host'); cap(); const e = mk(2, -7.2, 8.0), id = e.id, plus = ofType('ent+').pop(); toGuest([plus]);
    K.equip('hammer'); K.aimDir(e.cx, e.y0 + e.h / 2, e.cz, 1, 2.0); adv(0.05); g.renderer.camera.position.copy(p().eyePos(new V3())); sent.length = 0; g.deconstruct();
    const c = sent.find((m) => m.t === 'cmd' && m.c === 'decon'); if (!c || c.d.id !== id) return 'guest hammer did not ask the host: ' + JSON.stringify(sent.map((m) => m.t + (m.c || '')));
    if (!arches().length) bad.push('the guest removed it on its own');
    done(); for (const x of arches()) g.removeViewEnt(x.id); const raw = { ...json(plus.ent), view: false }; S().entities.push(raw); g.addEntity(raw); role('host'); cap(); g.netMessage(json(c));
    if (arches().length || !ofType('ent-').some((m) => m.id === id)) bad.push('the host did not remove and announce it'); if (S().items.archBig !== 1) bad.push('the item did not come back: ' + JSON.stringify(S().items));
    toGuest(json(sent.filter((m) => m.t === 'ent-')).length ? [plus, ...sent.filter((m) => m.t === 'ent-')] : [plus]); if (arches().length) bad.push('the guest still shows it after ent-');
    return bad.length === 0 || bad.join(' || ');
  });
}
