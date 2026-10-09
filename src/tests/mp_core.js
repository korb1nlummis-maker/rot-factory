// Multiplayer parity, no network: one page plays both roles by switching g.net.role and capturing g.netSend.
// Each test drives the host side, takes the captured messages and feeds them to the guest side (or the other way round).
export default async function (ctx) {
  const { T, g, S, w, p, sim, L, fresh, adv, spot, dig, cellX, cellY, cellZ, toI, toK, FRAME_TYPES, THREE } = ctx;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const frameAt = (i, k, kind = 'timber', yaw = 0, turned = false, y0 = 0) => { const e = { id: g.nextId(), type: 'frame', kind, axis: 'z', cx: cellX(i), cz: cellZ(k), y0, w: 2.36, h: 2.38, yaw }; if (turned) e.turned = true; S().entities.push(e); g.addEntity(e); return e; };
  const guard = async (fn) => { try { return await fn(); } finally { done(); g.fuses = []; g.dead = false; g.blacking = false; } };
  const bareTest = (name, fn) => T(name, () => guard(fn));

  await bareTest('mp.blast.boom-message-shoves-and-hurts-the-guest-like-the-host', async () => {
    fresh({}); p().pos.set(0, 0, 3); p().vel.set(0, 0, 0); g.hp = 100; role('guest'); cap();
    g.netMessage({ t: 'boom', x: 0.5, y: 0.6, z: 3, R: 3 }); const hurt = g.hp < 100, shoved = Math.hypot(p().vel.x, p().vel.z) > 3;
    fresh({}); p().pos.set(0, 0, 60); p().vel.set(0, 0, 0); g.hp = 100; g.netMessage({ t: 'boom', x: 0.5, y: 0.6, z: 3, R: 3 });
    return (hurt && shoved && g.hp === 100) || `near hurt ${hurt} shoved ${shoved}, far hp ${g.hp}`;
  });
  await bareTest('mp.blast.host-detonate-announces-radius', async () => {
    fresh({}); role('host'); cap(); g.detonate({ x: 20, y: 5, z: 20, tier: 2 }); const b = ofType('boom')[0]; return (b && b.R === 4) || 'boom ' + JSON.stringify(b);
  });
  await bareTest('mp.razzo.guest-held-razzo-ticks-on-the-guest-and-asks-the-host-to-blast', async () => {
    fresh({}); role('guest'); cap(); p().pos.set(5, 0, 5); const it = { sp: 3, vr: 0 }; S().carry.push(it); g.lightFuse(it);
    for (let n = 0; n < 40; n++) { g.time += 0.1; g.updateFuses(0.1); }
    const c = sent.filter((m) => m.t === 'cmd' && m.c === 'razzo')[0];
    return (c && Math.abs(c.d.x - 5) < 0.1 && S().carry.length === 0 && g.fuses.length === 0) || 'cmd ' + JSON.stringify(c) + ' carry ' + S().carry.length;
  });
  await bareTest('mp.razzo.host-blast-for-guest-fails-supports-hurts-both-and-tells-the-guest', async () => {
    fresh({ timber: 1 }); const { i, k } = spot(); dig(i, k - 1, 12, 5, 4, false); const f = frameAt(i + 6, k + 1);
    role('host'); cap(); p().pos.set(f.cx, 0, f.cz + 40); g.hp = 100;
    g.netCmd('razzo', { x: f.cx, y: 1.5, z: f.cz });
    const ent = sent.filter((m) => m.t === 'ent-' && m.id === f.id).length, sf = ofType('sfail').length, bm = ofType('boom').find((m) => m.R === 7), rz = ofType('razzo')[0];
    if (!(ent && sf && bm && rz)) return `ent- ${ent} sfail ${sf} boom ${!!bm} razzo ${!!rz}`;
    // the guest, standing 3 m away, gets the same damage
    const msgs = json(sent); done(); fresh({ timber: 1 }); frameAt(i + 6, k + 1); p().pos.set(f.cx + 3, 0, f.cz); g.hp = 100; role('guest'); cap(); const id0 = S().entities.find((e) => e.type === 'frame').id;
    for (const m of msgs) if (m.t === 'boom' || m.t === 'razzo' || m.t === 'sfail') g.netMessage(m);
    g.netMessage({ t: 'ent-', id: id0 }); // ids differ between the two fresh worlds, so mirror the removal by hand
    return (g.hp < 60 && !S().entities.some((e) => e.type === 'frame')) || `guest hp ${g.hp}`;
  });
  await bareTest('mp.razzo.thrown-by-guest-burns-on-the-host-and-blasts-there', async () => {
    fresh({}); role('guest'); cap(); p().pos.set(0, 0, 3); const it = { sp: 3, vr: 0 }; S().carry.push(it); g.lightFuse(it); g.time += 0.1; g.updateFuses(0.1);
    S().carry.length = 0; g.time += 0.1; g.updateFuses(0.1);
    const c = sent.find((m) => m.t === 'cmd' && m.c === 'fuse'); if (!c || g.fuses.length) return 'guest did not hand the fuse over: ' + JSON.stringify(c);
    role('host'); cap(); fresh({}); const calls = []; const orig = g.razzoBlast; g.razzoBlast = (x, y, z) => { calls.push([x, y, z]); };
    g.remote = { pos: new THREE.Vector3(30, 0, 30) }; const b = sim().spawn(3, 0, 31, 1, 30, 0, 0, 0, 1, 1); g.netCmd(c.c, c.d);
    for (let n = 0; n < 40; n++) { g.time += 0.1; g.updateFuses(0.1); } g.razzoBlast = orig; g.remote = null;
    return (calls.length === 1 && Math.abs(calls[0][0] - 31) < 3) || 'blasts ' + JSON.stringify(calls) + ' b ' + b;
  });
  await bareTest('mp.climb.guest-footing-loads-the-face-on-the-host', async () => {
    fresh({}); const { i, k } = spot(); p().pos.set(cellX(i), 9.5, cellZ(k)); p().footCell = { i, j: 20, k }; g.dust.cells.clear(); role('guest'); cap(); g.S.carry = [];
    g.treadOn(3.2, true); const c = sent.find((m) => m.t === 'cmd' && m.c === 'tread'); if (!c) return 'no tread command';
    role('host'); cap(); const calls = []; const o = g.slide.trigger.bind(g.slide); g.slide.trigger = (a, b, cc, e) => { calls.push([a, b, cc, e]); }; w().setCell(c.d.i, c.d.j, c.d.k, 4, 0); g.netCmd(c.c, c.d); g.slide.trigger = o; w().setCell(c.d.i, c.d.j, c.d.k, 0, 0);
    return (calls.length === 1 && calls[0][3] > 0.3) || 'host slide calls ' + JSON.stringify(calls);
  });
  await bareTest('mp.climb.guest-asks-the-host-for-a-soft-slide-nothing-hits-it', async () => {
    fresh({}); const { i, k } = spot(); p().pos.set(cellX(i), 14, cellZ(k)); p().onGround = true; p().footCell = { i, j: 50, k }; g.hp = 100; role('guest'); cap();
    const r0 = Math.random; Math.random = () => 0; g._climbT = 5; g.climbRisk(0.1); Math.random = r0;
    const c = sent.find((m) => m.t === 'cmd' && (m.c === 'sslide' || m.c === 'patch'));   // (a slope the sheet can flow on asks for a soft slide; a flat bench only shifts)
    return (c && g.hp === 100 && !g.wedge.cur) || `cmd ${c && c.c} hp ${g.hp}`;
  });
  await bareTest('mp.hit.plush-hitting-the-guest-hurts-the-guest-not-the-host', async () => {
    fresh({}); g.hp = 100; g.dmgCd = 0; role('host'); cap(); g.onPlayerHit(9, true); const h = ofType('hit')[0]; if (!h || g.hp !== 100) return `hit ${JSON.stringify(h)} host hp ${g.hp}`;
    done(); role('guest'); g.dmgCd = 0; g.netMessage(h); return g.hp < 100 || 'guest not hurt';
  });
  await bareTest('mp.dust.guest-keeps-no-private-field-and-feeds-the-host-from-its-digging', async () => {
    fresh({}); role('guest'); g.dust.cells.clear(); g.dust.add(0, 1, 0, 1); const gn = g.dust.cells.size; done();
    role('host'); g.dust.cells.clear(); const i = toI(40), k = toK(40); w().setCell(i, 3, k, 4, 0); g.netMessage({ t: 'cells', a: [i, 3, k, 0, 0] }); const hn = g.dust.at(cellX(i), cellY(3), cellZ(k));
    return (gn === 0 && hn > 0) || `guest cells ${gn} host dust ${hn}`;
  });
  await bareTest('mp.dust.guest-breathes-what-the-host-measured-and-blackout-clears-it-there', async () => {
    fresh({}); role('guest'); cap(); g.applyDyn({ belts: [], tiles: [], movers: [], crew: [], cart: null, grid: null, dust: 1.2, alarms: [] });
    for (let n = 0; n < 200; n++) g.dust.breathe(0.1, { x: 0, y: 1.5, z: 0 }, g.T);
    if (g.dust.lung < 1) return 'lung ' + g.dust.lung; g.blackout(); await ctx.realSleep(1300);
    const c = sent.find((m) => m.t === 'cmd' && m.c === 'clearDust'); g.dust.hostLevel = 0; await ctx.realSleep(900);
    return (!!c && !g.blacking && g.dust.lung < 0.2) || `clear cmd ${!!c} blacking ${g.blacking}`;
  });
  await bareTest('mp.time.joiner-gets-name-clock-lights-and-golden-or-surge-toasts', async () => {
    fresh({}); role('guest'); cap(); S().gameMin = 12 * 60 * 24 + 800; const dn = g.dayNumber(); g.syncLights(); const dark = g.lightLevel === 0 && !g.isOpen();
    const toasts = []; const ot = g.ui.toast; g.ui.toast = (t) => { toasts.push(t.title); };
    g.golden = 0; g.outage = 0; const base = { money: 5, te: 5, up: S().up, gear: S().gear, items: {}, mats: {}, boosts: S().boosts, contracts: [], gameMin: S().gameMin, ending: null };
    g.applyShared({ ...base, golden: 70, outage: 0 }); g.applyShared({ ...base, golden: 0, outage: 30 }); g.applyShared({ ...base, golden: 0, outage: 0 }); g.ui.toast = ot;
    return (dn === 13 && dark && toasts.includes('Golden Hour') && toasts.includes('Golden Hour is over') && toasts.includes('Grid surge') && toasts.includes('Power restored')) || `day ${dn} dark ${dark} ${toasts}`;
  });
  await bareTest('mp.time.shared-clues-and-needle-position-reach-the-guest', async () => {
    fresh({}); role('host'); cap(); S().clues = ['a clue']; S().clueLevel = 1; g.sendShared(); const m = ofType('shared')[0]; done();
    role('guest'); S().clues = []; S().clueLevel = 0; const n0 = { ...w().needle }; g.applyShared({ ...m, nd: [5, 6, 7] }); const ok = S().clues.length === 1 && w().needle.i === 5; w().needle = n0; return ok || 'clues ' + S().clues.length;
  });
  await bareTest('mp.support.failure-reaches-the-guest-with-sound-and-removes-the-same-frame', async () => {
    fresh({ timber: 1 }); const { i, k } = spot(); dig(i, k - 1, 12, 5, 4, false); const f = frameAt(i + 6, k + 1, 'timber', 0.7, true);
    role('host'); cap(); const s = w().supports.find((q) => q.id === f.id); g.failSupport(s, 1.4);
    const ep = ofType('ent-').some((m) => m.id === f.id), sf = ofType('sfail')[0]; if (!ep || !sf) return `ent- ${ep} sfail ${!!sf}`;
    const msgs = json(sent); done(); role('guest'); cap();
    // the guest world has the frame as a view copy
    g.remoteEnt({ ...json(f), view: true }); if (!w().supports.some((q) => q.id === f.id)) return 'view frame built no support'; p().pos.set(f.cx + 5, 0, f.cz); const sh0 = g.shake; const hints = []; const oh = g.ui.hint; g.ui.hint = (t) => hints.push(t);
    for (const m of msgs) g.netMessage(m); g.ui.hint = oh;
    return (!w().supports.some((q) => q.id === f.id) && !g.machines.items.has(f.id) && hints.length > 0 && g.shake >= sh0) || `supports ${w().supports.length} hints ${hints.length}`;
  });
  await bareTest('mp.support.free-turned-frame-and-mesh-match-after-the-round-trip', async () => {
    fresh({ timber: 1 }); const { i, k } = spot(); dig(i, k - 1, 12, 5, 4, false); role('host'); cap(); const f = frameAt(i + 6, k + 1, 'steel', 0.9, true, 0.3);
    // frameAt bypasses machines.add's netEnt on purpose? no: add() announces it, so ent+ must be in the capture
    const plus = ofType('ent+').find((m) => m.ent.id === f.id); if (!plus) return 'no ent+';
    const hostSup = json(w().supports.find((q) => q.id === f.id)); done(); fresh({ timber: 1 }); role('guest'); g.netMessage(json(plus));
    const gs = w().supports.find((q) => q.id === f.id), v = S().entities.find((e) => e.id === f.id), it = g.machines.items.get(f.id);
    if (!gs || !v || !it) return 'guest copy incomplete'; if (v.yaw !== 0.9 || !v.turned) return 'yaw/turned lost';
    for (const key of ['x', 'y', 'z', 'r', 'b', 'kind']) if (Math.abs((gs[key] ?? 0) - (hostSup[key] ?? 0)) > 1e-9 && gs[key] !== hostSup[key]) return 'support field differs: ' + key;
    return (Math.abs(it.obj.position.x - f.cx) < 1e-6 && !!gs.cap === !!hostSup.cap) || 'mesh position or capacity differs';
  });
  await bareTest('mp.support.guest-placing-a-frame-that-would-break-sees-it-break', async () => {
    fresh({ timber: 1 }); const { i, k } = spot(); dig(i, k - 1, 12, 5, 4, false); S().money = 1e12; g.craftItem('frame:timber', 1);
    const e = g.machines.frameEnt('x', 'timber', i + 4, k - 1, 0); e.clear = [];   // a real 4x4x4 cube in the dug run
    role('host'); cap(); g.strainOf = () => ({ state: 'break', name: 'Timber Frame', pct: 150, d: 400, next: 'steel', kind: 'timber' });
    g.netCmd('place', { tool: { id: 'frame:timber', kind: 'frame', fk: 'timber' }, ent: e }); delete g.strainOf;
    const b = ofType('sbreak')[0]; if (!b) return 'no sbreak message: ' + JSON.stringify(sent.map((m) => m.t)); done(); role('guest'); const hints = []; const oh = g.ui.hint; g.ui.hint = (t) => hints.push(t); g.netMessage(b); g.ui.hint = oh;
    return hints.some((h) => /cracks and gives way/.test(h) && /150%/.test(h)) || 'guest hint ' + hints;
  });
  await bareTest('mp.machines.rig-claw-pose-reaches-the-guest', async () => {
    fresh({ rig: 1 }); const e = { id: g.nextId(), type: 'claw', x: cellX(toI(-5)), y: 0, z: cellZ(toK(8)), ry: 0 }; S().entities.push(e); g.addEntity(e); const it = g.machines.items.get(e.id); it.phase = 0.3; it.target = { i: toI(-5) + 2, j: 2, k: toK(8) }; it.idle = 0; e.pw = 1;
    role('host'); cap(); g.sendDyn(); const d = ofType('dyn')[0]; done(); if (!d) return 'no dyn';
    it.phase = 0; it.target = null; role('guest'); g.applyDyn(json(d)); if (!it.target || Math.abs(it.phase - 0.3) > 0.01) return 'target/phase not applied';
    const y0 = it.rig.claw.position.y; g.machines.guestUpdate(0.2, 1); return Math.abs(it.rig.claw.position.y - y0) > 1e-4 || 'claw did not move on the guest';
  });
  await bareTest('mp.economy.guest-travel-fare-comes-out-of-the-host-wallet', async () => {
    fresh({}); role('guest'); cap(); const m0 = S().money; const b = { x: 50, y: 0, z: 0 }; const pos = p().pos;
    g.renderTravel(); // builds rows; trigger a pay by calling the same code path through the command
    role('host'); S().money = 1000; g.netCmd('pay', { n: 300 }); const a = S().money; g.netCmd('pay', { n: 5000 }); return (a === 700 && S().money === 700) || `money ${a} ${S().money}`; void m0; void b; void pos;
  });
  await bareTest('mp.slide.guest-near-a-slide-is-told-and-feels-it', async () => {
    fresh({}); role('host'); cap(); g.slide.recent = 6; g.time += 1; g.slideEvent(100, 100, 90); const s = ofType('slide')[0]; if (!s) return 'no slide message';
    done(); role('guest'); p().pos.set(105, 0, 100); g.shake = 0; g.netMessage(s); return g.shake > 0 || 'no shake on guest';
  });
}
