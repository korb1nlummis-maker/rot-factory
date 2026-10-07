import * as PD from '../plushdata.js';
// mp.stack.audit.*: the audit of wave 10 in multiplayer (no network: one page plays both roles, as in mp_stack.js). A guest only ever asks; the host rebuilds, checks and announces.
// These tests throw garbage and mismatched tool ids at every new placement path, ask for a cube a guest could not afford, and tell a guest about a cascade it was not there for.
import { kit, UP } from './stack_lib.js';
import * as ST from '../stack.js';

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export default async function (ctx) {
  const { T, g, S, w, p, craft, selectTool, plan, newWorld, adv } = ctx;
  const K = kit(ctx), W = K.W;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); if (g.world) g.world.onSet = null; g.netOut.length = 0; };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { await newWorld(); try { return await fn(); } finally { done(); g.keys = {}; g._lad = null; } });
  const hostWorld = () => { role('host'); cap(); g.world.onSet = (i, j, k, sp, vr) => g.netOut.push(i, j, k, sp, vr); g.netOut.length = 0; };
  const snap = (Y) => JSON.stringify([S().entities.length, S().items, K.count(Y.m - 2, 0, Y.lo - 2, 14, 12, 8), [...W().reserved].length, g.world.supports.length]);
  const msg = (t, e) => ({ t: 'cmd', c: 'place', d: { tool: t, ent: e } });

  await guard('mp.stack.audit.mismatched-tool-ids-and-kinds-never-build-or-spend-anything', async () => {
    const Y = K.yard({ levels: 2, east: true, up: { ...UP, transitDoor: 1 } }); const [A] = K.stack(Y, ['steel', 'steel']);
    hostWorld(); craft('pad:steel', 4); craft('pad:timber', 2); craft('stair', 4); craft('wramp', 4); craft('ladder', 2); craft('wall', 2); sent.length = 0;
    const bad = [];
    const shapes = {
      pad: { type: 'pad', i0: Y.m, k0: Y.lo, j: 0, bay: A.id, ro: 'f', op: 1, od: 0, zoop: [[Y.m, Y.lo]] },
      stair: { type: 'stair', mod: 'u', bay: A.id, i0: Y.m, k0: Y.lo, j: 0, od: 0, zoop: [[Y.m, Y.lo], [Y.m + 2, Y.lo]] },
      wramp: { type: 'wramp', mod: 'u', bay: A.id, i0: Y.m, k0: Y.lo, j: 0, od: 0, zoop: [[Y.m, Y.lo], [Y.m + 2, Y.lo]] },
      wall: { type: 'wall', ax: 'z', i0: Y.m, k0: Y.lo, j: 0, bay: A.id, zoop: [[Y.m, Y.lo]] },
      ladder: { type: 'ladder', i: Y.m + 2, k: Y.lo + 2, j: 1, dir: 0, bay: A.id },
    };
    // every shape under every tool id and kind: whatever the host builds must be what the tool paid for, in the number it paid for, and nothing else may be spent
    const ids = ['pad:steel', 'pad:timber', 'stair', 'wramp', 'wramp:haul', 'ladder', 'wall', 'door', 'belt', 'frame:steel'], kinds = ['pad', 'stair', 'wramp', 'wall', 'ladder', 'frame', 'belt', 'levelpad', 'catwalk'];
    const itemOf = { pad: (id) => (id.startsWith('pad:') ? id : null), stair: () => 'stair', wramp: () => 'wramp', wall: () => 'wall', ladder: () => 'ladder' };
    let tried = 0, built = 0;
    for (const [sk, shape] of Object.entries(shapes)) for (const id of ids) for (const kind of kinds) {
      const ents0 = new Set(S().entities.map((e) => e.id)), items0 = json(S().items), cells0 = K.count(Y.m - 2, 0, Y.lo - 2, 14, 12, 8); tried++;
      try { g.netMessage(json(msg({ id, kind, p: {} }, shape))); } catch (e) { bad.push(`${sk} as ${id}/${kind} threw ${e.message}`); continue; }
      const added = S().entities.filter((e) => !ents0.has(e.id)), spent = {}; for (const k of new Set([...Object.keys(items0), ...Object.keys(S().items)])) { const d = (S().items[k] || 0) - (items0[k] || 0); if (d) spent[k] = -d; }
      if (!added.length) { if (Object.keys(spent).length || K.count(Y.m - 2, 0, Y.lo - 2, 14, 12, 8) !== cells0) bad.push(`${sk} under ${id}/${kind} spent ${JSON.stringify(spent)} and built nothing`); continue; }
      built++;
      const want = itemOf[kind] ? itemOf[kind](id) : null;
      if (!want || want !== id) { bad.push(`${sk} under ${id}/${kind} built ${added.map((e) => e.type)} that the tool does not make`); continue; }
      const types = [...new Set(added.map((e) => e.type))]; const ok = types.length === 1 && ((kind === 'pad' && types[0] === 'pad') || types[0] === kind);
      if (!ok) bad.push(`${sk} under ${id}/${kind} built ${added.map((e) => e.type)}`);
      if (JSON.stringify(spent) !== JSON.stringify({ [id]: added.length })) bad.push(`${sk} under ${id}/${kind} built ${added.length} and spent ${JSON.stringify(spent)}`);
      for (const e of added) g.doDecon({ kind: 'mach', id: e.id });   // take it down again: the next combination starts from the same box
      if (bad.length > 6) break;
    }
    if (built < 4) bad.push('only ' + built + ' of the combinations built anything: the honest ones should');
    return bad.length === 0 || (tried + ' combos, ' + bad.slice(0, 6).join(' || '));
  });

  await guard('mp.stack.audit.garbage-in-every-field-of-the-new-placements-is-refused-without-a-throw', async () => {
    const Y = K.yard({ levels: 2, east: true, up: { ...UP, transitDoor: 1 } }); const [A] = K.stack(Y, ['steel', 'steel']);
    hostWorld(); craft('pad:steel', 4); craft('stair', 4); craft('ladder', 2); craft('wall', 2); sent.length = 0;
    const R = rng(7), bad = [];
    const junk = [null, undefined, NaN, Infinity, -Infinity, -1, 0, 1, 2.5, 1e12, '1', '', 'x', true, false, [], {}, [1, 2], { a: 1 }, 0.5, Y.m, Y.lo, A.id, '__proto__'];
    const pick = () => junk[Math.floor(R() * junk.length)];
    const bases = [
      ['pad:steel', 'pad', { type: 'pad', i0: Y.m, k0: Y.lo, j: 0, bay: A.id, ro: 'f', op: 1, od: 0, zoop: [[Y.m, Y.lo]] }],
      ['stair', 'stair', { type: 'stair', mod: 'u', bay: A.id, i0: Y.m, k0: Y.lo, j: 1, od: 0, zoop: [[Y.m, Y.lo]] }],
      ['wall', 'wall', { type: 'wall', ax: 'z', i0: Y.m, k0: Y.lo, j: 0, bay: A.id, zoop: [[Y.m, Y.lo]] }],
      ['ladder', 'ladder', { type: 'ladder', i: Y.m + 2, k: Y.lo + 2, j: 1, dir: 0, bay: A.id }],
    ];
    let thrown = 0;
    for (let n = 0; n < 600; n++) {
      const [id, kind, base] = bases[n % bases.length], e = json(base), keys = Object.keys(e), k = keys[Math.floor(R() * keys.length)];
      e[k] = pick(); if (R() < 0.3) e[keys[Math.floor(R() * keys.length)]] = pick();
      if (R() < 0.15) e.zoop = pick(); if (R() < 0.1) delete e[k];
      const raw = { t: 'cmd', c: 'place', d: { tool: R() < 0.1 ? pick() : { id, kind, p: {} }, ent: R() < 0.05 ? pick() : e } };
      const before = snap(Y);
      try { g.netMessage(raw); } catch (x) { thrown++; if (bad.length < 4) bad.push(`threw on ${JSON.stringify(raw).slice(0, 200)}: ${x.message}`); continue; }
      // a message that happens to be a legal placement may build: only a change that no honest plate, stair, ladder or frame explains is a failure
      const ents = S().entities.filter((q) => q.bay !== undefined); for (const q of ents) {
        if (q.type === 'pad' && !(q.ro === 'f' || q.ro === 'c')) bad.push('a plate with ro ' + q.ro);
        if (q.type === 'pad' && ((q.op | 0) < 0 || (q.op | 0) > 2 || !Number.isInteger(q.op ?? 0) || !Number.isInteger(q.od ?? 0))) bad.push('a plate with a bad opening ' + q.op + '/' + q.od);
        if (!K.support({ id: q.bay })) bad.push('a part of a cube that is not there');
      }
      void before;
      if (bad.length > 5) break;
    }
    // whatever was built is a clean, whole thing: every cell of every plate is a plate cell and the pack has no negative counts
    for (const q of S().entities) if (q.type === 'pad' && q.bay !== undefined) for (const [i, j, k] of K.B.cellsOf(q)) if (W().get(i, j, k) !== K.PAD && W().get(i, j, k) !== PD.BULK) bad.push(`a plate cell missing at ${i},${j},${k}`);
    for (const [id, n] of Object.entries(S().items)) if (!(n >= 0) || !Number.isFinite(n)) bad.push(`item ${id} is ${n}`);
    return bad.length === 0 || bad.slice(0, 5).join(' || ');
  });

  await guard('mp.stack.audit.a-guest-cannot-use-a-place-message-to-get-a-second-level-for-the-price-of-one-plate', async () => {
    // the plate is one pad; a guest asks for a plate in the next cube up and one in this cube: one cube, one plate (a level is one plate row and three clear rows)
    const Y = K.yard({ levels: 2, east: true }); const [A, B2] = K.stack(Y, ['steel', 'steel']);
    hostWorld(); craft('pad:steel', 4); sent.length = 0; const bad = [];
    const f = { type: 'pad', i0: Y.m, k0: Y.lo, j: 0, bay: A.id, ro: 'f', op: 0, od: 0, zoop: [[Y.m, Y.lo]] }, c = { ...f, j: 3, ro: 'c' };
    g.netMessage(json(msg({ id: 'pad:steel', kind: 'pad', p: {} }, f))); g.netMessage(json(msg({ id: 'pad:steel', kind: 'pad', p: {} }, c)));
    const mine = S().entities.filter((e) => e.bay === A.id && e.type === 'pad'); if (mine.length !== 1) bad.push(`${mine.length} plates in one cube`);
    if ((S().items['pad:steel'] || 0) !== 3) bad.push('pads left ' + S().items['pad:steel']);
    // a pad claiming to be in B but standing in A's rows
    const sneak = { ...f, bay: B2.id, j: 0, ro: 'f' }; const n0 = S().entities.length; g.netMessage(json(msg({ id: 'pad:steel', kind: 'pad', p: {} }, sneak))); if (S().entities.length !== n0) bad.push('a plate was filed under another cube');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.stack.audit.the-host-refuses-a-guest-cube-that-would-overload-the-column-and-a-cascade-reaches-a-late-joiner-as-ordinary-messages', async () => {
    const Y = K.yard({ levels: 2, rows: 68, east: true }); const [A] = K.stack(Y, ['timber']); K.dig(Y.m - 3, 8, Y.lo - 3, 14, 1, 14);
    hostWorld(); craft('frame:steel'); sent.length = 0; const bad = [];
    const e = g.machines.frameEnt('x', 'steel', Y.m, Y.lo, 4); delete e.clear;
    g.netMessage(json(msg({ id: 'frame:steel', kind: 'frame', fk: 'steel', p: {} }, { ...e, type: 'frame', kind: 'steel' })));
    if (K.M().items.size && S().entities.filter((q) => q.type === 'frame').length !== 1) bad.push('the host accepted a cube that would overload the timber cube under it: ' + S().entities.filter((q) => q.type === 'frame').length + ' cubes');
    // a late joiner after a fallen stack: it is sent the world as it is, with no pending fall to replay
    g.failSupport(K.support(A), 1.3); adv(1); cap(); g.sendWorld(); const ents = sent.filter((m) => m.t === 'ents'); if (!ents.length) bad.push('no ents message for a late joiner');
    for (const m of ents) for (const q of (m.list || m.ents || [])) if (q.type === 'frame' && q.id === A.id) bad.push('the late joiner is told about the fallen cube');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.stack.audit.a-guest-hammer-on-anything-it-invented-or-on-a-part-of-a-fallen-cube-is-harmless', async () => {
    const Y = K.yard({ levels: 2, east: true }); const [A] = K.stack(Y, ['steel', 'steel']); hostWorld(); const r = await K.putPlate(A, 'f', 0, 0); if (!r.ok) return r.why;
    const bad = [], before = snap(Y);
    for (const id of [99999, -1, null, undefined, '3', NaN, {}, [], 'x']) { try { g.netMessage({ t: 'cmd', c: 'decon', d: { kind: 'mach', id } }); } catch (x) { bad.push('decon ' + JSON.stringify(id) + ' threw ' + x.message); } }
    if (snap(Y) !== before) bad.push('a forged decon changed the world');
    g.failSupport(K.support(A), 1.3); const after = snap(Y);
    try { g.netMessage({ t: 'cmd', c: 'decon', d: { kind: 'mach', id: r.e.id } }); } catch (x) { bad.push('decon of a fallen part threw ' + x.message); }
    if (snap(Y) !== after) bad.push('a decon of a part that fell with its cube changed the world');
    return bad.length === 0 || bad.join(' || ');
  });
}
