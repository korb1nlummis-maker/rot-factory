// Adversarial QA of load tracing (loadtrace.js, game.js queueLoad / updateLoads / failSupport / strainOf, machines autoFrame, borer lining).
export default async function (ctx) {
  const { T, g, S, w, p, fresh, spot, dig, adv, toI, toK, cellX, cellZ, FRAME_TYPES, capacityOf, loadOn, stepSim } = ctx;
  const room = (dist, n = 8, lane = 10, ht = 4) => { const i = toI(dist), k = toK(lane); for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let j = 0; j < ht; j++) w().removeCell(i + a, j, k + b, false); return { i, k, x: cellX(i + n / 2), z: cellZ(k + n / 2) }; };
  const frame = (kind, x, z, extra = {}) => { const e = { id: g.nextId(), type: 'frame', kind, axis: 'x', cx: x, cz: z, y0: 0, w: 2.36, h: 2.38, gm: 1, glo: 1, gj: 0, yaw: Math.PI / 2, ...extra }; S().entities.push(e); g.addEntity(e); return e; };
  const alive = (id) => w().supports.some((s) => s.id === id);
  const pump = (n, d = 0.4) => { for (let q = 0; q < n; q++) { g.time += d; g._loadT = 0; g.updateLoads(d); } };
  const ratioOf = (s) => loadOn(w(), s) / s.cap;
  const probe = (kind, x, z, y = 1.19) => ({ x, y, z, r: FRAME_TYPES[kind].radius, kind, cap: capacityOf(kind), id: 'qa-probe' });
  const clearQ = () => { g.loadQ = new Set(); w().stabQueue.length = 0; };

  await T('qa.load.every-queued-support-is-weighed-none-dropped', async () => {
    fresh({ timber: 1 }); clearQ(); const ids = [];
    for (let n = 0; n < 9; n++) { const r = room(400 + n * 30, 8, 10 + (n % 2) * 0); ids.push(frame('timber', r.x, r.z).id); }
    g.time += 5; clearQ(); for (const e of S().entities) if (e.type === 'frame') g.queueLoad(e.cx, 1, e.cz);
    if (g.loadQ.size !== 9) return 'queue holds ' + g.loadQ.size; pump(8); pump(20);  // the warning runs 3 to 5 s before each one drops
    const left = ids.filter(alive).length; const unweighed = w().supports.filter((s) => s.load === undefined).length;
    return (left === 0 && g.loadQ.size === 0) || `${left} of 9 overloaded frames still stand, ${unweighed} never weighed, queue ${g.loadQ.size}`;
  });

  await T('qa.load.grace-period-then-buckle-no-instant-failure-on-reload', async () => {
    fresh({ timber: 1 }); clearQ(); const r = room(400, 8); const e = frame('timber', r.x, r.z); g.queueLoad(e.cx, 1, e.cz); g._loadT = 0;
    pump(3, 0.4);   // 1.2 s after it was born
    if (!alive(e.id)) return 'buckled inside the 1.5 s grace';
    g.queueLoad(e.cx, 1, e.cz); pump(3, 0.4); if (!alive(e.id)) return 'dropped with no warning'; if (!g.pendFail || !g.pendFail.has(e.id)) return 'no warning countdown started'; pump(20, 0.4); return !alive(e.id) || 'overloaded frame never buckled after the warning';
  });

  await T('qa.load.save-reload-keeps-a-sound-structure-standing', async () => {
    fresh({ steel: 1 }); clearQ(); const r = room(250, 8); const ents = [];
    for (let n = 0; n < 12; n++) { ents.push(frame('steel', r.x - 3 + (n % 6) * 1.2, r.z - 1 + Math.floor(n / 6) * 1.2)); }
    g.time += 5; for (const e of ents) g.queueLoad(e.cx, 1, e.cz); pump(30); const stood = ents.filter((e) => alive(e.id)).length; if (stood < 4) return 'setup too weak, only ' + stood + ' stand';
    // settle until nothing is overloaded, then "save" and "load" the survivors
    for (let n = 0; n < 5; n++) { for (const e of ents) if (alive(e.id)) g.queueLoad(e.cx, 1, e.cz); pump(20); }
    const keep = S().entities.filter((e) => e.type === 'frame').map((e) => JSON.parse(JSON.stringify(e))); const before = keep.length;
    for (const e of [...S().entities]) if (e.type === 'frame') { const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } }
    S().entities = S().entities.filter((e) => e.type !== 'frame'); w().supports = []; clearQ();
    for (const e of keep) { S().entities.push(e); g.addEntity(e); }
    if (g.loadQ.size !== before) return `reload queued ${g.loadQ.size} of ${before} supports`;
    pump(60);   // 24 s of play after loading
    return (S().entities.filter((e) => e.type === 'frame').length === before && w().supports.length === before) || `a sound structure lost ${before - w().supports.length} supports after a reload`;
  });

  await T('qa.load.cascade-terminates-and-stays-finite', async () => {
    fresh({ timber: 1 }); clearQ(); const r = room(700, 14); const ents = [];
    for (let n = 0; n < 24; n++) ents.push(frame('timber', r.x - 5 + (n % 8) * 1.4, r.z - 2 + Math.floor(n / 8) * 2.2));
    for (const e of ents) loadOn(w(), w().supports.find((s) => s.id === e.id));   // warm the world columns so the timing below is the load code, not terrain generation
    g.time += 5; for (const e of ents) g.queueLoad(e.cx, 1, e.cz);
    let worst = 0, ticks = 0; for (; ticks < 800 && (g.loadQ.size || ticks < 10); ticks++) { const t0 = performance.now(); pump(1); worst = Math.max(worst, performance.now() - t0); }
    // re-weigh everything until quiet, because a failure only re-queues the supports near it
    for (let r2 = 0; r2 < 30; r2++) { for (const s of w().supports) g.loadQ.add(s.id); pump(Math.ceil(w().supports.length / 2) + 2); if (!w().supports.some((s) => ratioOf(s) > 1)) break; }
    const bad = w().supports.filter((s) => ratioOf(s) > 1).length; const nan = w().supports.filter((s) => !Number.isFinite(s.load)).length;
    const gone = 24 - w().supports.length;
    return (ticks < 800 && gone >= 6 && bad === 0 && nan === 0 && worst < 12) || `ticks ${ticks} overloaded left ${bad} nonfinite ${nan} worst tick ${worst.toFixed(1)} ms, ${w().supports.length} of 24 survive (a deep wide room should shed several)`;
  });

  await T('qa.load.finite-everywhere-including-hall-edges-and-out-of-hall', async () => {
    fresh({ timber: 1 }); const bad = [];
    for (const [x, z] of [[0, 0], [-5, 0], [-40, 0], [3000, 0], [3100, 0], [-3100, 0], [0, 3100], [0, -3100], [2990, 2990], [-2990, -2990], [1e6, 1e6], [-1e6, 3]]) {
      for (const kind of ['timber', 'concrete']) { let v; try { v = loadOn(w(), probe(kind, x, z)); } catch (e) { bad.push(`${kind}@${x},${z} threw ${e.message}`); continue; } if (!Number.isFinite(v) || v < 0) bad.push(`${kind}@${x},${z} -> ${v}`); }
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('qa.load.rated-depth-is-placeable-and-twice-the-depth-is-not', async () => {
    fresh({}); const out = [];
    const tunnel = (dist) => { const i = toI(dist), k = toK(30); for (let a = 0; a < 14; a++) for (let b = 0; b < 4; b++) for (let j = 0; j < 4; j++) w().removeCell(i + a, j, k + b, false); return { x: cellX(i + 7), z: cellZ(k) + 0.9 }; };
    for (const [kind, f] of Object.entries(FRAME_TYPES)) {
      if (!isFinite(f.maxDepth) || f.maxDepth * 0.95 > 2900) continue;
      const t = tunnel(f.maxDepth * 0.9); const r = ratioOf(probe(kind, t.x, t.z)); if (!(r < 1)) out.push(`${kind} cannot be set at 90% of its rated ${f.maxDepth} m in a standard tunnel (${r.toFixed(2)})`);
    }
    for (const kind of ['steel', 'concrete', 'rebar']) { const f = FRAME_TYPES[kind]; const t = tunnel(f.maxDepth * 1.6); const r = ratioOf(probe(kind, t.x, t.z)); if (!(r > 1)) out.push(`${kind} still holds at 160% of its rating (${r.toFixed(2)}): too lax`); }
    return out.length === 0 || out.join('; ');
  });

  await T('qa.load.a-jack-is-never-weaker-than-a-strut-in-the-same-tunnel', async () => {
    fresh({}); const out = [];
    for (const dist of [20, 60, 110, 200]) for (const wd of [2, 4]) {
      const i = toI(dist), k = toK(40); for (let a = 0; a < 14; a++) for (let b = 0; b < wd; b++) for (let j = 0; j < 3; j++) w().removeCell(i + a, j, k + b, false);
      const x = cellX(i + 7), z = cellZ(k) + (wd - 1) * 0.3; const mk = (kind) => ({ x, y: 0.6, z, r: kind === 'jack' ? 2.7 : 1.9, kind, cap: capacityOf(kind), id: 'p' });
      const rs = ratioOf(mk('strut')), rj = ratioOf(mk('jack')); if (rj > rs * 1.05 + 0.02 && rj > 0.9 * 1 && dist <= 110 && wd === 2) out.push(`${dist} m, ${wd} wide: strut ${rs.toFixed(2)} jack ${rj.toFixed(2)}`);
    }
    return out.length === 0 || 'the stronger prop is the weaker one: ' + out.join('; ');
  });

  await T('qa.load.guest-never-buckles-supports-the-host-decides', async () => {
    fresh({ timber: 1 }); clearQ(); const r = room(400, 8); const e = frame('timber', r.x, r.z); g.time += 5; g.queueLoad(e.cx, 1, e.cz);
    const was = g.isGuest; g.isGuest = () => true; pump(4); g.isGuest = was; if (!alive(e.id)) return 'a guest buckled a support on its own';
    // and the host throws away an overloaded support a guest asks it to set
    const wide = room(420, 8, 40); S().items['frame:timber'] = 2; const n0 = S().entities.length;
    g.netCmd('place', { tool: { id: 'frame:timber', kind: 'frame', fk: 'timber' }, ent: { kind: 'timber', axis: 'x', cx: wide.x, cz: wide.z, y0: 0, w: 2.36, h: 2.38, gm: 1, glo: 1, gj: 0, clear: [] } });
    const placed = S().entities.length - n0; return (placed === 0 && !w().supports.some((s) => Math.hypot(s.x - wide.x, s.z - wide.z) < 0.1 && s.id !== e.id)) || 'the host set an overloaded support for a guest (' + placed + ')';
  });

  await T('qa.load.300-supports-cost-little-per-frame', async () => {
    fresh({}); clearQ(); let sp; for (const lane of [12, 22, 4, -8]) { try { sp = spot(lane); } catch (x) { continue; } if (w().topAt(sp.i + 120, sp.k) >= 40) break; }
    const { i, k } = sp, N = 300; dig(i, k - 2, N + 4, 4, 4, false);
    for (let n = 0; n < N; n++) frame('timber', cellX(i + 2 + n), cellZ(k - 2) + 0.9, { gm: i + 2 + n, glo: k - 2 });
    p().pos.set(cellX(i + 150), 0, cellZ(k)); p().vel.set(0, 0, 0); g.T.survey = true; g.time += 10;
    const q0 = g.loadQ.size; for (const s of w().supports) loadOn(w(), s);   // warm the terrain columns: generation is not what is being timed
    const t0 = performance.now(); let worst = 0; for (let n = 0; n < 400; n++) { const a = performance.now(); pump(1); worst = Math.max(worst, performance.now() - a); } const drain = performance.now() - t0;
    const stood = w().supports.length;
    // a frame while digging: stability regions firing and queueing loads, the survey, and the loads
    for (let n = 0; n < 200; n++) w().stabQueue.push({ i: i + 100 + (n % 40), j: 2 + (n % 3), k: k });
    const hooks = { onCreak: () => {}, release: () => {}, onRegion: (x, y, z) => g.queueLoad(x, y, z) };
    for (let n = 0; n < 5; n++) { w().updateStability(1 / 60, g.T.warn, hooks); }   // warm
    for (let n = 0; n < 200; n++) w().stabQueue.push({ i: i + 100 + (n % 40), j: 2 + (n % 3), k: k });
    const ms = [], mine = []; for (let n = 0; n < 60; n++) { const a = performance.now(); w().updateStability(1 / 60, g.T.warn, hooks); const b = performance.now(); g._svNext = 0; g.updateSurvey(); g._loadT = 0; g.updateLoads(1 / 60); const c = performance.now(); ms.push(c - a); mine.push((c - b) + 0); }
    const avg = ms.reduce((a, b) => a + b, 0) / ms.length, mx = Math.max(...ms), mineMax = Math.max(...mine);
    g.T.survey = false; const nan = w().supports.filter((s) => s.load !== undefined && !Number.isFinite(s.load)).length;
    return (q0 === N && g.loadQ.size === 0 && worst < 8 && mineMax < 8 && avg < 8 && mx < 25 && nan === 0) || `queued ${q0}, drain ${drain.toFixed(0)} ms, worst load tick ${worst.toFixed(1)} ms, survey+loads max ${mineMax.toFixed(1)} ms, whole frame (stability+hooks+survey+loads) avg ${avg.toFixed(2)} max ${mx.toFixed(1)} ms, ${stood}/${N} stood, nan ${nan}`;
  });

  await T('qa.load.autoframe-never-sets-a-frame-that-would-buckle', async () => {
    fresh({ steel: 1, concrete: 1 }); S().money = 1e12; g.T = g.tune(); const out = [];
    for (const dist of [50, 400, 1500]) {
      const i = toI(dist), k = toK(55); for (let a = 0; a < 6; a++) for (let b = 0; b < 4; b++) for (let j = 0; j < 4; j++) w().removeCell(i + a, j, k + b, false);
      const n0 = S().entities.length; const ok = g.machines.autoFrame(i + 3, 0, k + 1, 0);
      for (const e of S().entities.slice(n0)) if (e.type === 'frame') { const s = w().supports.find((q) => q.id === e.id); if (s && ratioOf(s) > 1.0001) out.push(`${dist} m: auto ${e.kind} at ${ratioOf(s).toFixed(2)}`); }
    }
    return out.length === 0 || out.join('; ');
  });

  await T('qa.load.borer-lining-leaves-no-phantom-supports-and-keeps-its-linings', async () => {
    fresh({ power: 1, belts: 1, borer: 1, borerSize: 2, steel: 1, timber: 1, concrete: 1 }); S().money = 1e12; g.T.borerRate = 0.05; clearQ();
    const i = toI(500), k = toK(70); const e = { id: g.nextId(), type: 'borer', i, j: 0, k, dx: 1, dz: 0, w: 4, h: 4, x: cellX(i), y: 0, z: cellZ(k) };
    S().entities.push(e); g.addEntity(e); let n = 0;
    const t0 = performance.now(); for (; n < 160 && !e.done; n++) { for (const x of g.machines.items.values()) x.ent.pw = 1; g.time += 1; g.machines.update(1, g.time); if (n % 20 === 0) { g._loadT = 0; g.updateLoads(0.4); } }
    const ms = performance.now() - t0; const frames = S().entities.filter((q) => q.type === 'frame' && q.auto); const phantom = w().supports.filter((s) => !String(s.id).startsWith('shield') && !S().entities.some((q) => q.id === s.id));
    const stillLoaded = frames.filter((f) => !alive(f.id)).length;
    return (frames.length > 10 && phantom.length === 0 && stillLoaded === 0) || `done ${e.done} after ${n} steps, ${frames.length} linings, phantom supports ${phantom.length}, lost linings ${stillLoaded}, ${ms.toFixed(0)} ms`;
  });
  await T('qa.load.an-overloaded-roof-warns-for-3-to-5-seconds-then-falls-and-a-prop-saves-it', async () => {
    fresh({ timber: 1 }); clearQ(); const r = room(400, 8); const e = frame('timber', r.x, r.z); g.time += 5; g.queueLoad(e.cx, 1, e.cz); g._loadT = 0; pump(2, 0.4);
    const p = g.pendFail && g.pendFail.get(e.id); if (!p) return 'no countdown'; const bad = []; if (!(p.t >= 1.4 && p.t <= 5)) bad.push('countdown ' + p.t);
    const start = g.time; let n = 0; while (alive(e.id) && n++ < 40) { g.time += 0.1; g._loadT = 0; g.updateLoads(0.1); if (alive(e.id)) { g.queueLoad(e.cx, 1, e.cz); } }
    const took = g.time - start + 0.8; if (alive(e.id)) bad.push('never fell'); if (took < 2.5 || took > 5.6) bad.push('fell after ' + took.toFixed(1) + ' s');
    return bad.length === 0 || bad.join('; ');
  });
}
