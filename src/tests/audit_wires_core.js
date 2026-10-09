// audit wires (core): an adversarial pass over the wire-only power model. Cable loops, forged cable records, removal order, cables drawn at scale, the cost of aiming a wire
// at a big belt line, and lanterns hung off a switch. Prefix `wires.audit.`.
import { makeKit, UP } from './power_lib.js';
import * as HL from '../hanglamp.js';
import { beltKw } from '../beltdata.js';

export default async function (ctx) {
  const { T, g, S, L, adv, toI, toK } = ctx;
  const K = makeKit(ctx);
  const { reset, tile, gen, pole, fan, part, wire, netOf } = K;
  const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

  await T('wires.audit.a-cable-loop-a-forged-self-cable-and-duplicate-records-never-double-count-supply', async () => {
    reset(UP, false); const bad = []; S().items.cable = 40;
    const G = gen(-10, 3), A = pole(-8, 3), B = pole(-6, 3), C = pole(-7, 5), F = fan(-5, 5), F2 = fan(-5, 6.2);
    wire(G, A); wire(A, B); wire(B, C); wire(C, A);   // a triangle of poles: a loop of cables
    wire(C, F); wire(B, F2); adv(1);
    const n = netOf(A);
    if (!n || n.nodes.length !== 4 || n.gens.length !== 1 || !near(n.supply, 8)) bad.push(`loop: ${n && n.nodes.length} nodes, ${n && n.gens.length} gens, supply ${n && n.supply}`);
    if (!(F.pw > 0.99 && F2.pw > 0.99)) bad.push(`loop: fans ${F.pw} ${F2.pw}`);
    // records that no hand can lay: a cable to itself, the same pair twice, a machine to a machine. They load from a save.
    const n0 = S().cables.length;
    S().cables.push({ id: g.nextId(), a: G.id, b: G.id }, { id: g.nextId(), a: G.id, b: A.id }, { id: g.nextId(), a: A.id, b: G.id }, { id: g.nextId(), a: F.id, b: F2.id }, { id: g.nextId(), a: F.id, b: F.id });
    g.power.markDirty(); adv(1);
    const m = netOf(A);
    if (!m || m.gens.length !== 1 || !near(m.supply, 8) || !near(m.demand, 4)) bad.push(`forged records: gens ${m && m.gens.length}, supply ${m && m.supply}, demand ${m && m.demand}`);
    if (!(F.pw > 0.99)) bad.push('forged records unpowered a fan: ' + F.pw);
    g.cables.update(0.5); for (const r of S().cables.slice(n0)) { try { g.cables.describe(r); g.cables.length(r); } catch (e) { bad.push('describing a forged record threw ' + e.message); } }
    S().cables.length = n0; g.power.markDirty(); adv(0.5);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wires.audit.taking-things-down-in-any-order-refunds-each-cable-once-and-never-leaves-power-behind', async () => {
    reset(UP, false); const bad = []; S().items.cable = 10;
    const G = gen(-10, 3), P = pole(-8, 3), F1 = fan(-6, 3), F2 = fan(-6, 4.2), F3 = fan(-6, 5.4);
    wire(G, P); wire(P, F1); wire(P, F2); wire(P, F3); adv(1);
    const have = S().items.cable; if (S().cables.length !== 4) return 'setup: cables ' + S().cables.length;
    // the middle of the chain goes first: three cables come back, the fans go dark, the generator stays up
    K.decon(P); adv(1);
    if (S().items.cable !== have + 4) bad.push('taking down a pole with four cables returned ' + (S().items.cable - have) + ' cables, expected 4 (stock ' + S().items.cable + ')');
    if (S().cables.length) bad.push(S().cables.length + ' cable records outlive their pole');
    if ([F1, F2, F3].some((f) => (f.pw || 0) > 0)) bad.push('a fan keeps power after its pole was taken down');
    // a cable taken down by hand then its end: no second refund
    reset(UP, false); S().items.cable = 3; const P2 = pole(-8, 3), F = fan(-6, 3); wire(P2, F); const c = S().cables[0];
    if (!g.cables.remove(c.id, true)) bad.push('remove failed'); if (g.cables.remove(c.id, true)) bad.push('a cable id removed twice');
    const stock = S().items.cable; K.decon(F); if (S().items.cable !== stock) bad.push(`taking the fan down after its cable was already removed changed the cable stock ${stock} -> ${S().items.cable}`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wires.audit.a-big-factory-draws-every-cable-not-just-the-first-five-hundred', async () => {
    reset(UP, false); const bad = []; S().items.cable = 2000;
    const P = pole(-12, 3); const w = ctx.w(); void w;
    const poles = []; for (let n = 0; n < 90; n++) poles.push(tile('pole', -14 + (n % 30) * 0.9, 1 + Math.floor(n / 30) * 3));
    let made = 0; const recs = S().cables;
    for (let n = 0; n < 1400; n++) { const a = poles[n % poles.length], b = poles[(n * 7 + 3) % poles.length]; if (a === b) continue; recs.push({ id: g.nextId(), a: a.id, b: b.id }); made++; }
    g.cables.changed(); g.cables.update(0.5); void P;
    const segs = g.cables.segCount, per = 12;
    // the average wire here is short (a few metres), the count of drawn segments has to cover every record
    let want = 0; for (const { A, B } of g.cables.live()) want += Math.max(1, Math.min(per, Math.ceil(g.cables.lengthBetween(A, B) / 1.2)));
    if (g.cables.live().length < 1000) bad.push('setup: ' + g.cables.live().length + ' live cables');
    { const t0 = performance.now(); for (let q = 0; q < 5; q++) g.cables.redraw(); const ms = (performance.now() - t0) / 5; console.log(`wires.audit.redraw: ${g.cables.live().length} cables, ${segs} segments, ${ms.toFixed(2)} ms per redraw`); window.__extra = { ...(window.__extra || {}), auditRedraw: { cables: g.cables.live().length, segments: segs, msPerRedraw: +ms.toFixed(2) } }; if (ms > 10) bad.push(`redrawing ${g.cables.live().length} cables costs ${ms.toFixed(1)} ms and runs every 0.4 s`); }
    if (segs < want) bad.push(`only ${segs} wire segments drawn for ${g.cables.live().length} cables (about ${want} are needed): wires past the cap are invisible`);
    recs.length = 0; g.cables.changed(); g.cables.update(0.5);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wires.audit.aiming-a-wire-at-a-belt-in-a-big-factory-stays-cheap', async () => {
    reset(UP, false); const bad = []; S().items.cable = 5;
    const P = pole(-13, 1); const belts = [];
    for (let row = 0; row < 8; row++) for (let n = 0; n < 40; n++) belts.push(tile('belt', -14 + n * 0.6, 3 + row * 0.6));   // 320 belts: 8 lines of 40
    adv(0.3);
    const { V3, p, aimPoint } = ctx; const nx = g.logi.nextOf.bind(g.logi); let calls = 0; g.logi.nextOf = (t) => { calls++; return nx(t); };
    let ms = 0, frames = 0;
    try {
      for (const b of [belts[3], belts[85]]) { aimPoint(ctx.cellX(b.i), 0.3, ctx.cellZ(b.k), 1.6); adv(0.02); }   // (a frame or two first: whatever the aim builds once is built)
      g.cables.from = P.id;   // a wire in hand (a frame with another tool out would drop it), aimed at one belt tile after another
      calls = 0; const t0 = performance.now();
      for (const b of [belts[3], belts[85], belts[170], belts[250], belts[319]]) { aimPoint(ctx.cellX(b.i), 0.3, ctx.cellZ(b.k), 1.6); const eye = p().eyePos(new V3()), dir = p().forward(new V3()); for (let n = 0; n < 12; n++) { g.cables.aimUpdate({ kind: 'cable' }, eye, dir); frames++; } }
      ms = (performance.now() - t0) / frames;
    } finally { g.logi.nextOf = nx; g.cables.cancel(); }
    window.__extra = { ...(window.__extra || {}), auditAimBelt: { belts: belts.length, frames, msPerAim: +ms.toFixed(3), nextOfCalls: calls } };
    if (calls > frames * 100) bad.push(`aiming a wire at belts walked the belt graph ${calls} times in ${frames} frames with ${belts.length} belts (the aim runs every frame: it must reuse the adjacency, not rebuild it)`);
    if (ms > 4) bad.push(`aiming a wire at a belt tile costs ${ms.toFixed(2)} ms per frame with ${belts.length} belts`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wires.audit.hanging-lanterns-strung-off-a-closed-switch-are-lit-and-off-when-it-opens', async () => {
    reset({ ...UP, power: 1 }, false); const bad = []; S().items.cable = 20;
    const G = gen(-10, 3), P = pole(-8.4, 3); wire(G, P);
    const sw = part('switch', -7, 3); if (!sw) return 'no switch placed';
    const frame = (x) => { const e = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'z', cx: x, cz: 3, y0: 0, w: 2.38, h: 2.38, yaw: 0 }; S().entities.push(e); g.addEntity(e); return e; };
    const l1 = g.placeEntity('hlamp', HL.lampFields(frame(-5), 0), { quiet: true }), l2 = g.placeEntity('hlamp', HL.lampFields(frame(-2.4), 0), { quiet: true });
    if (!l1 || !l2) return 'no lanterns placed';
    wire(P, sw); wire(sw, l1); wire(l1, l2); sw.on = true; adv(1.5);
    if (!(l1.pw > 0.9)) bad.push('the lantern on the closed switch is dark: ' + l1.pw);
    if (!(l2.pw > 0.9)) bad.push('the second lantern of the string is dark: ' + l2.pw);
    sw.on = false; g.power.markDirty(); adv(1.5);
    if ((l1.pw || 0) > 0 || (l2.pw || 0) > 0) bad.push(`an open switch still feeds the string: ${l1.pw} ${l2.pw}`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wires.audit.hover-and-hammer-picking-stays-cheap-with-a-thousand-cables', async () => {
    reset(UP, false); const bad = []; S().items.cable = 2000;
    const poles = []; for (let n = 0; n < 90; n++) poles.push(tile('pole', -14 + (n % 30) * 0.9, 1 + Math.floor(n / 30) * 3));
    for (let n = 0; n < 1000; n++) { const a = poles[n % poles.length], b = poles[(n * 7 + 3) % poles.length]; if (a !== b) S().cables.push({ id: g.nextId(), a: a.id, b: b.id }); }
    const eye = { x: -20, y: 1.6, z: 2 }, dir = { x: 1, y: 0, z: 0.05 };
    const t0 = performance.now(); const N = 30; for (let n = 0; n < N; n++) g.cables.hit(eye, dir, 5);
    const ms = (performance.now() - t0) / N;
    if (ms > 2.5) bad.push(`one cable pick costs ${ms.toFixed(2)} ms with ${S().cables.length} cables (it runs every frame the hammer or the hover is out)`);
    S().cables.length = 0; g.cables.changed();
    return bad.length === 0 || bad.join('; ');
  });

  await T('wires.audit.a-collapse-that-takes-three-hundred-machines-prunes-in-one-solve', async () => {
    reset(UP, false); const bad = []; S().items.cable = 600;
    const G = gen(-12, 2), P = pole(-11, 3); wire(G, P);
    const fans = []; for (let n = 0; n < 300; n++) fans.push(fan(-14 + (n % 40) * 0.6, 4.2 + Math.floor(n / 40) * 0.6));
    for (const f of fans) S().cables.push({ id: g.nextId(), a: P.id, b: f.id });
    g.cables.changed(); adv(0.5);
    // the fans vanish without a hammer (a collapse): their cables are dropped by the next prune
    let solves = 0; const re = g.power.recompute.bind(g.power); g.power.recompute = () => { solves++; re(); };
    for (const f of fans) { g.logi.remove(f); S().entities = S().entities.filter((x) => x.id !== f.id); }
    const t0 = performance.now(); g.cables.prune(); const ms = performance.now() - t0; g.power.recompute = re;
    if (solves > 3) bad.push(`pruning 300 dead cables re-solved the grid ${solves} times (${ms.toFixed(0)} ms)`);
    if (S().cables.length !== 1) bad.push('cables left after the prune: ' + S().cables.length);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wires.audit.a-big-grid-solves-in-a-frame-budget', async () => {
    reset({ ...UP, genOutput: 4 }, false); const bad = []; S().items.cable = 5000;
    const i0 = toI(-13.5), k0 = toK(0.3), at = (c, r) => [ctx.cellX(i0 + c), ctx.cellZ(k0 + r)];
    const hub = []; for (let n = 0; n < 120; n++) { const [x, z] = at(n % 40, 1 + Math.floor(n / 40)); hub.push(pole(x, z)); }
    for (let n = 1; n < hub.length; n++) S().cables.push({ id: g.nextId(), a: hub[n - 1].id, b: hub[n].id });
    for (let n = 0; n < 12; n++) { const [x, z] = at(n * 3, 5); const G = gen(x, z); S().cables.push({ id: g.nextId(), a: G.id, b: hub[n * 3].id }); }
    let belts = 0; for (let r = 0; r < 12; r++) { for (let c = 0; c < 40; c++) { const [x, z] = at(c, 7 + r); tile('belt', x, z); belts++; } }
    const bl = [...L().tiles.values()].filter((t) => t.type === 'belt'); for (let r = 0; r < 12; r++) S().cables.push({ id: g.nextId(), a: hub[r * 9].id, b: bl[r * 40 + 7].id });
    for (let n = 0; n < 400; n++) { const [x, z] = at(n % 40, 20 + Math.floor(n / 40)); const f = fan(x, z); S().cables.push({ id: g.nextId(), a: hub[n % hub.length].id, b: f.id }); }
    g.cables.changed(); adv(0.5);
    const t0 = performance.now(); const N = 10; for (let q = 0; q < N; q++) g.power.recompute(); const ms = (performance.now() - t0) / N;
    const lit = bl.filter((t) => (t.pw || 0) > 0.5).length;
    console.log(`wires.audit.big-grid: ${S().cables.length} cables, ${belts} belts, 400 fans, ${ms.toFixed(2)} ms per solve, ${lit} belts lit`);
    window.__extra = { ...(window.__extra || {}), auditBigGrid: { cables: S().cables.length, belts, fans: 400, msPerSolve: +ms.toFixed(2), lit } };
    if (!(ms < 12)) bad.push(`a solve of ${S().cables.length} cables, ${belts} belts and 400 fans takes ${ms.toFixed(1)} ms`);
    if (lit < 12 * 40 - 20) bad.push('belts lit ' + lit + ' of ' + belts);
    S().cables.length = 0; g.cables.changed();
    return bad.length === 0 || bad.join('; ');
  });

  await T('wires.audit.a-cable-to-something-with-a-broken-position-is-refused-not-read-as-zero-length', async () => {
    reset(UP, false); const bad = []; S().items.cable = 5;
    const P = pole(-8, 3), F = fan(-6, 3), F2 = fan(-5, 3); F2.i = NaN;   // a position that is not a number
    const r = g.cables.connect(P.id, F2.id); if (r.ok) bad.push('a cable to a machine at NaN was laid: ' + JSON.stringify(r.len));
    const far = fan(-4, 3); far.i = 1e9;
    const r2 = g.cables.connect(P.id, far.id); if (r2.ok) bad.push('a cable to a machine a million cells away was laid');
    if (S().items.cable !== 5 || S().cables.length) bad.push(`refused cables changed things: items ${S().items.cable}, cables ${S().cables.length}`);
    void F; return bad.length === 0 || bad.join('; ');
  });

  // every player facing text that says how power travels: none of it may still teach a range link
  const RAW = import.meta.glob(['../*.js', '../../index.html', '../../README.md'], { query: '?raw', import: 'default' });
  await T('wires.audit.no-text-teaches-range-power-any-more', async () => {
    const bad = [];
    const BANNED = [
      [/\b(pole|generator)s?( or (a |the )?(pole|generator))? (in|within) (reach|range)/i, 'a pole or generator in reach'],
      [/(within|in) (reach|range) of (a|the) (live |powered )?(pole|generator)/i, 'in reach of a pole'],
      [/(place|set|put) (it )?(down )?(near|next to|beside|close to) (a |the )?(pole|generator)/i, 'put it near a pole'],
      [/\b(pole|poles) (near|beside|next to) (a|the) generator/i, 'a pole near a generator'],
      [/link(s|ed)? (the |a |your )?grid/i, 'links the grid'],
      [/(draw|take|get|run|feed)s? (power|current)? ?(through|via|from) (the )?poles\b/i, 'power through poles'],
      [/(through|via) poles\b/i, 'through poles'],
      [/nearest (pole|generator)/i, 'nearest pole'],
      [/auto-?link|links? (to|with) (nearby|other) (poles|generators)/i, 'auto link'],
      [/plug(s|ged)?[ -]?in (range|reach)|plug-in reach/i, 'plug in reach'],
      [/blue (link )?lines?/i, 'blue lines'],
      [/reaches? a pole/i, 'reaches a pole'],
    ];
    const ALLOW = /\bno (range|plug|pole reach|faint)|not enough|there is no|gone\b|used to\b|any more|no longer|superseded|old range|standing (next|near)|nothing without|nothing until|links nothing|the only way/i;
    for (const [file, load] of Object.entries(RAW)) {
      if (/\/(tests|selftest)/.test(file) || /selftest\.js$/.test(file)) continue;
      const text = await load();
      let n = 0; for (const line of text.split('\n')) { n++; for (const sent of line.split(/(?<=[.!?;])\s+/)) for (const [re, label] of BANNED) { const m = re.exec(sent); if (m && !ALLOW.test(sent)) bad.push(`${file.replace('../', '')}:${n} says "${label}": ${sent.trim().slice(Math.max(0, m.index - 40), m.index + 90)}`); } }
    }
    return bad.length === 0 || bad.slice(0, 10).join('\n');
  });

  await T('wires.audit.aiming-a-wire-in-a-mine-full-of-frames-stays-cheap', async () => {
    reset(UP, false); const bad = []; S().items.cable = 5;
    const P = pole(-13, 1);
    for (let n = 0; n < 1200; n++) { const e = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'z', cx: -12 + (n % 40) * 0.9, cz: 4 + Math.floor(n / 40) * 0.9, y0: 0, w: 0.8, h: 0.8, yaw: 0 }; S().entities.push(e); g.addEntity(e); }
    const eye = { x: -14, y: 1.6, z: 1 }, dir = { x: 1, y: 0, z: 0.1 };
    const t0 = performance.now(); const N = 40; for (let n = 0; n < N; n++) g.cables.findTarget(eye, dir, 8);
    const ms = (performance.now() - t0) / N;
    window.__extra = { ...(window.__extra || {}), auditFindTarget: { frames: 1200, msPerCall: +ms.toFixed(3) } };
    if (ms > 1.5) bad.push(`findTarget costs ${ms.toFixed(2)} ms with 1,200 frames in the world (it runs every frame a wire is aimed)`);
    void P; return bad.length === 0 || bad.join('; ');
  });

  await T('wires.audit.a-richer-grid-comes-back-from-a-save-with-the-same-supply-belts-lanterns-and-a-switch', async () => {
    reset({ ...UP, power: 1 }, false); const bad = []; S().items.cable = 40;
    const G1 = gen(-12, 3), G2 = gen(-12, 5.4), P = pole(-9, 4), B = tile('belt', -6, 6), B2 = tile('belt', -5.4, 6), B3 = tile('belt', -4.8, 6), F = fan(-6, 3.6);
    const sw = part('switch', -8, 6.6); const frame = (x) => { const e = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'z', cx: x, cz: 8.4, y0: 0, w: 2.38, h: 2.38, yaw: 0 }; S().entities.push(e); g.addEntity(e); return e; };
    const l1 = g.placeEntity('hlamp', HL.lampFields(frame(-9.6), 0), { quiet: true }), l2 = g.placeEntity('hlamp', HL.lampFields(frame(-7), 0), { quiet: true });
    wire(G1, G2); wire(G1, P); wire(P, B2); wire(P, F); wire(P, sw); wire(sw, l1); wire(l1, l2); sw.on = true; adv(1.5);
    const snap = () => ({ sup: g.power.nets.map((n) => +n.supply.toFixed(3)).sort().join(), dem: g.power.nets.map((n) => +n.demand.toFixed(3)).sort().join(), pw: [B, B2, B3, F, l1, l2].map((e) => { const x = L().byId.get(e.id) || (g.machines.items.get(e.id) || {}).ent; return x ? +(x.pw || 0).toFixed(3) : -1; }).join() });
    const a = snap(); if (a.pw.split(',').some((v) => !(+v > 0.99))) return 'setup: everything should be powered ' + JSON.stringify(a);
    const { loadSaved } = await import('../state.js');
    g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) return 'g.save() failed';
    const saved = loadSaved(); g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play'; adv(2);
    const b = snap();
    if (b.sup !== a.sup || b.dem !== a.dem || b.pw !== a.pw) bad.push(`after a save and load: ${JSON.stringify(a)} became ${JSON.stringify(b)}`);
    // forged records in a save: a cable to itself, to a frame, between two machines, a duplicate of a real one: the grid is the same
    const rec = S().cables.find((c) => c.a === G1.id && c.b === P.id), fr = [...g.machines.items.values()].find((m) => m.ent.type === 'frame');
    S().cables.push({ id: g.nextId(), a: G1.id, b: G1.id }, { id: g.nextId(), a: rec.a, b: rec.b }, { id: g.nextId(), a: F.id, b: B.id }, { id: g.nextId(), a: P.id, b: fr.ent.id });
    g.noSave = false; g.mode = 'play'; g.save(); g.noSave = true; const s2 = loadSaved(); g.loadWorld(s2.S, s2); g.noSave = true; g.mode = 'play'; adv(2);
    const c = snap(); if (c.sup !== a.sup || c.dem !== a.dem || c.pw !== a.pw) bad.push(`forged records changed the grid: ${JSON.stringify(a)} became ${JSON.stringify(c)}`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('wires.audit.taking-a-frame-down-gives-back-the-cable-of-the-fan-hung-on-it-and-a-collapse-does-not', async () => {
    reset(UP, false); const bad = []; S().items.cable = 10;
    const G = gen(-12, 3), P = pole(-11, 4);
    const mkFan = (f) => { const e = { id: g.nextId(), type: 'fan', mounted: true, frameId: f.id, px: f.cx, py: 2.0, pz: f.cz, fx: 1, fz: 0, fyaw: Math.PI / 2, dir: 0, i: toI(f.cx), j: 3, k: toK(f.cz) }; S().entities.push(e); g.addEntity(e); return L().byId.get(e.id); };
    const frame = (x) => { const e = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'z', cx: x, cz: 7, y0: 0, w: 2.38, h: 2.38, yaw: 0 }; S().entities.push(e); g.addEntity(e); return e; };
    const f1 = frame(-6), f2 = frame(-3), fan1 = mkFan(f1), fan2 = mkFan(f2);
    wire(G, P); wire(P, fan1); wire(P, fan2); adv(1);
    const stock = S().items.cable, mf = S().items.mfan || 0;
    g.doDecon({ kind: 'mach', id: f1.id });   // you take the frame down: the fan and its cable come back
    if ((S().items.mfan || 0) !== mf + 1) bad.push('the fan did not come back: ' + S().items.mfan);
    if (S().items.cable !== stock + 1) bad.push(`the fan's cable was lost: stock ${stock} -> ${S().items.cable}`);
    if (S().cables.some((c) => c.a === fan1.id || c.b === fan1.id)) bad.push('a cable record outlives the fan');
    // a collapse takes the frame and the fan with it: nothing comes back
    const stock2 = S().items.cable; g.dropMountedFans(f2.id, false); adv(0.6);
    if (S().items.cable !== stock2) bad.push(`a collapse refunded a cable: ${stock2} -> ${S().items.cable}`);
    if (S().cables.some((c) => c.a === fan2.id || c.b === fan2.id)) bad.push('a cable record outlives the fan that fell');
    return bad.length === 0 || bad.join('; ');
  });

  await T('wires.audit.two-belt-lines-joined-after-wiring-run-on-the-live-grid-whichever-cable-came-first', async () => {
    const bad = [];
    for (const deadFirst of [true, false]) {
      reset(UP, false); S().items.cable = 20;
      const G = gen(-12, 2), live = pole(-11, 3), dead = pole(-11, 8); wire(G, live);   // `dead` has no generator
      const a = [0, 1, 2].map((n) => tile('belt', -6 + n * 0.6, 4)), b = [0, 1, 2].map((n) => tile('belt', -3.6 + n * 0.6, 4));   // two lines with a one cell gap between them
      wire(deadFirst ? dead : live, a[0]); wire(deadFirst ? live : dead, b[2]);                                                      // one cable each, to different grids
      adv(1); const bridge = tile('belt', -4.2, 4); adv(1.5);                                                                          // a tile joins them into one line with two cables
      const all = [...a, bridge, ...b], dark = all.filter((t) => !(t.pw > 0.99)).length;
      if (dark) bad.push(`${deadFirst ? 'dead' : 'live'} cable first: ${dark} of ${all.length} tiles of the joined line are dark though one cable runs to a live pole`);
      const want = all.reduce((x, t) => x + beltKw(t), 0), net = netOf(live); if (!net || Math.abs(net.demand - want) > 1e-6) bad.push(`the joined line draws ${net && net.demand} kW from the live grid, expected ${want}`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('wires.audit.a-lantern-with-a-cord-to-a-dead-grid-and-one-to-a-live-grid-is-lit-in-either-order', async () => {
    const bad = [];
    for (const deadFirst of [true, false]) {
      reset(UP, false); S().items.cable = 20;
      const G = gen(-12, 2), live = pole(-11, 3), dead = pole(-11, 8); wire(G, live);
      const fr = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'z', cx: -6, cz: 5.5, y0: 0, w: 2.38, h: 2.38, yaw: 0 }; S().entities.push(fr); g.addEntity(fr);
      const l = g.placeEntity('hlamp', HL.lampFields(fr, 0), { quiet: true });
      wire(deadFirst ? dead : live, l); wire(deadFirst ? live : dead, l); adv(1.5);
      if (!(l.pw > 0.99)) bad.push(`${deadFirst ? 'dead' : 'live'} cord first: the lantern is at ${l.pw} though a cord runs to a live pole`);
    }
    return bad.length === 0 || bad.join('; ');
  });
}
