// mp.hlamp.*: hanging lanterns in multiplayer, no network: one page plays both roles by switching g.net.role and capturing g.netSend.
// The host simulates the grid and owns every lantern (a guest only says which frame and which side); the guest draws the host's ents,
// reads the 0.5 s `xrow` of type hlamp (lit level and grid numbers), and sees the same hover text and the same light.
import { makeKit, UP } from './power_lib.js';
import * as HL from '../hanglamp.js';
import * as EXT from '../ext.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, adv } = ctx;
  const K = makeKit(ctx);
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const NOISE = new Set(['pos', 'bodies', 'shared', 'time']);
  const cap = () => { sent = []; g.netSend = (m) => { if (!NOISE.has(m.t)) sent.push(K.json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); } });
  const frame = (x, z = 3) => { const e = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'z', cx: x, cz: z, y0: 0, w: 2.38, h: 2.38, yaw: 0 }; S().entities.push(e); g.addEntity(e); return e; };
  const hang = (f, slot = 0) => g.placeEntity('hlamp', HL.lampFields(f, slot), { quiet: true });
  const line = (n) => {
    const G = K.tile('gen', -13.5, 8.5); G.burn = 1e5; G.burnMax = 1e5; G.lit = true; const fr = [], ls = []; let prev = G;
    for (let q = 0; q < n; q++) { const f = frame(-12 + q * 2.6); fr.push(f); const l = hang(f); ls.push(l); const r = K.wire(prev, l); if (!r.ok) throw new Error(r.why); prev = l; }
    return { G, fr, ls };
  };
  const entOf = (id) => (g.machines.items.get(id) || {}).ent;
  const info = (id) => infoFor(g, { kind: 'mach', id });
  const rowMsg = () => { g._extRow = 0; sent = []; EXT.update(g, 0.1, false); return ofType('xrow').find((m) => m.k === 'hlamp'); };
  const hostWorld = () => ({ ents: S().entities.filter((e) => !e.free).map((e) => K.json(g.stripEnt(e))), cables: K.json(S().cables.map((c) => ({ id: c.id, a: c.a, b: c.b }))) });
  const toGuest = (hw) => { done(); K.reset(UP, false); role('guest'); cap(); g.netMessage({ t: 'ents', list: hw.ents }); g.netMessage({ t: 'cables', list: hw.cables }); g.cables.update(0.5); };

  await guard('mp.hlamp.guest-asks-for-a-lantern-and-the-host-builds-it', async () => {
    K.reset(UP, false); role('host'); cap(); const bad = [], f = frame(-8);
    S().items.hlamp = 4; g.rebuildTools();
    const place = (tool, ent) => { sent = []; g.netMessage({ t: 'cmd', c: 'place', d: { tool, ent } }); return ofType('toast')[0]; };
    // the guest claims silly coordinates: the host takes frame and side only and works the spot out itself
    let t = place({ id: 'hlamp', kind: 'hlamp' }, { frameId: f.id, slot: 1, x: 999, y: 999, z: 999 }); const l = HL.lampsOf(g)[0];
    if (t || !l || l.slot !== 1 || Math.abs(l.x - f.cx) > 1e-9 || Math.abs(l.z - (f.cz + 0.5)) > 1e-9 || Math.abs(l.y - (f.y0 + f.h - HL.LAMP_HANG)) > 1e-9 || S().items.hlamp !== 3) bad.push('place: ' + JSON.stringify([t, l, S().items.hlamp]));
    if (!ofType('ent+').some((m) => m.ent.type === 'hlamp' && m.ent.slot === 1)) bad.push('the guest was not told about the new lantern');
    t = place({ id: 'hlamp', kind: 'hlamp' }, { frameId: f.id, slot: 1 }); if (!t || !/already hangs/.test(t.text) || S().items.hlamp !== 3) bad.push('stacked on a side: ' + JSON.stringify(t));
    t = place({ id: 'hlamp', kind: 'hlamp' }, { frameId: 123456, slot: 0 }); if (!t || !/frame is gone/.test(t.text)) bad.push('a missing frame: ' + JSON.stringify(t));
    for (const slot of [7, -1, 1.5, '0', null]) { t = place({ id: 'hlamp', kind: 'hlamp' }, { frameId: f.id, slot }); if (!t) bad.push('slot ' + JSON.stringify(slot) + ' was accepted'); }
    t = place({ id: 'switch', kind: 'hlamp' }, { frameId: f.id, slot: 0 }); if (!t || HL.lampsOf(g).length !== 1) bad.push('another item built a lantern');
    t = place({ id: 'hlamp', kind: 'hlamp' }, null); if (!t) bad.push('a null placement was accepted');
    S().items = {}; t = place({ id: 'hlamp', kind: 'hlamp' }, { frameId: f.id, slot: 0 }); if (HL.lampsOf(g).length !== 1) bad.push('placed with no item left');
    // taking it down as a guest
    sent = []; g.netMessage({ t: 'cmd', c: 'decon', d: { kind: 'mach', id: l.id } }); if (S().items.hlamp !== 1 || HL.lampsOf(g).length || !ofType('ent-').some((m) => m.id === l.id)) bad.push('guest decon: ' + JSON.stringify([S().items.hlamp, HL.lampsOf(g).length]));
    return bad.length === 0 || bad.join(' | ');
  });

  await guard('mp.hlamp.guest-switches-a-lantern-through-cfg-and-the-host-decides', async () => {
    K.reset(UP, false); role('host'); cap(); const bad = [], { ls } = line(6); adv(2);
    const cmd = (id, patch) => { sent = []; g.netMessage({ t: 'cmd', c: 'cfg', d: { id, patch } }); return { ann: ofType('ent+').length + ofType('ent-').length, toast: ofType('toast')[0] }; };
    let r = cmd(ls[0].id, { on: false }); if (!r.ann || ls[0].on !== false) bad.push('a legal switch was refused: ' + JSON.stringify(r));
    adv(2); if (!ls.slice(1).every((l) => l.pw >= 0.999)) bad.push('the line did not brighten after one went off: ' + ls.map((l) => l.pw));
    for (const patch of [{ x: 5 }, { pw: 1 }, { on: 1 }, { frameId: 3 }, { slot: 2 }, { y: -4 }, { on: false, hr: 9 }]) { r = cmd(ls[1].id, patch); if (r.ann || !r.toast) bad.push('a bad patch went through: ' + JSON.stringify(patch)); }
    return bad.length === 0 || bad.join(' | ');
  });

  await guard('mp.hlamp.guest-draws-the-same-light-and-the-same-readout-in-a-brownout', async () => {
    K.reset(UP, false); K.small(); role('host'); cap(); const bad = [], W = line(6); adv(3);
    const ids = W.ls.map((l) => l.id), hostInfo = ids.map((id) => info(id)), hostLvl = W.ls.map((l) => HL.lampLevel(l));
    const camP = { x: W.ls[2].x, y: 1.6, z: W.ls[2].z + 1.5 }; const hostGlow = g.glowSources(camP, 8).filter((s) => s.r === HL.LAMP_RANGE).map((s) => [s.x, s.y, s.z, +s.cr.toFixed(3)]);
    sent = []; g.sendWorld(); const hw0 = sent.filter((m) => m.t === 'ents').flatMap((m) => m.list), wc = sent.find((m) => m.t === 'cables'); const hw = { ents: hw0, cables: wc.list }; const row = rowMsg(); if (!row) return 'no xrow for the lanterns';
    if (row.d.l.length !== 6 || row.d.l.some((a) => a.length !== 6)) bad.push('row shape ' + JSON.stringify(row.d.l[0]));
    // the batch a late joiner gets already carries how lit each one is (pw is a plain field), before the first row arrives
    const lamps0 = hw0.filter((e) => e.type === 'hlamp'); if (lamps0.length !== 6 || lamps0.some((e) => !(e.pw > 0.8 && e.pw < 0.84)) || lamps0.some((e) => 'cache' in e)) bad.push('ents batch lanterns: ' + JSON.stringify(lamps0[0]));
    toGuest(hw);
    for (const id of ids) { const e = entOf(id); if (!e || !e.view) bad.push('lantern ' + id + ' missing or not a view ent on the guest'); }
    if (entOf(ids[0]) && g.machines.items.get(ids[0]).obj && !g.machines.items.get(ids[0]).obj.getObjectByName('glass')) bad.push('no model on the guest');
    for (let n = 0; n < 3; n++) g.netMessage(K.json(row));
    ids.forEach((id, n) => { const e = entOf(id); if (Math.abs(HL.lampLevel(e) - hostLvl[n]) > 0.011) bad.push(`level ${n}: host ${hostLvl[n]} guest ${HL.lampLevel(e)}`); });
    ids.forEach((id, n) => { const gi = info(id), hi = hostInfo[n]; if (gi.title !== hi.title || gi.lit !== hi.lit) bad.push(`title ${n}: "${hi.title}" vs "${gi.title}"`); if (JSON.stringify(gi.lines.slice(-5)) !== JSON.stringify(hi.lines.slice(-5)) && n === 2) bad.push(`readout ${n} differs:\n host  ${JSON.stringify(hi.lines)}\n guest ${JSON.stringify(gi.lines)}`); });
    const gg = g.glowSources(camP, 8).filter((s) => s.r === HL.LAMP_RANGE).map((s) => [s.x, s.y, s.z, +s.cr.toFixed(2)]);
    if (JSON.stringify(gg) !== JSON.stringify(hostGlow.map((q) => [q[0], q[1], q[2], +q[3].toFixed(2)]))) bad.push('light differs: ' + JSON.stringify([hostGlow, gg]));
    // the glass dims on the guest too
    adv(0.3); const gl = g.machines.items.get(ids[0]).obj.getObjectByName('glass').material.emissiveIntensity; if (!(gl > 0.5 && gl < 2.4)) bad.push('the guest glass is at ' + gl);
    return bad.length === 0 || bad.join('\n');
  });

  await guard('mp.hlamp.rows-stay-quiet-without-lanterns-say-goodbye-once-and-ignore-junk', async () => {
    K.reset(UP, false); role('host'); cap(); const bad = []; g._hlHad = false;
    g._extRow = 0; sent = []; EXT.update(g, 0.1, false); if (ofType('xrow').some((m) => m.k === 'hlamp')) bad.push('a row with no lanterns in the world');
    const { ls } = line(2); adv(1); const r1 = rowMsg(); if (!r1 || r1.d.l.length !== 2) bad.push('no row for two lanterns');
    for (const l of ls) g.doDecon({ kind: 'mach', id: l.id }); const r2 = rowMsg(); if (!r2 || r2.d.l.length !== 0) bad.push('no closing row: ' + JSON.stringify(r2)); const r3 = rowMsg(); if (r3) bad.push('the closing row repeats');
    toGuest({ ents: [], cables: [] }); const f = frame(-8); const e = { id: 99991, type: 'hlamp', ...HL.lampFields(f, 0) }; g.netMessage({ t: 'ent+', ent: e });
    for (const d of [null, 5, 'x', {}, { l: 5 }, { l: [null, 3, [], [1], [99991], ['a', 'b', 'c', 'd', 'e', 'f'], [123456, 100, 1, 1, 1, 0], [99991, 'x', NaN, null, undefined, 0]] }]) { try { g.netMessage({ t: 'xrow', k: 'hlamp', d }); } catch (er) { bad.push('junk row threw ' + er.message); } }
    const le = entOf(99991); if (!le || !Number.isFinite(le.pw ?? 0)) bad.push('junk row left a bad level: ' + (le && le.pw));
    return bad.length === 0 || bad.join(' | ');
  });

  await guard('mp.hlamp.the-frame-going-away-takes-the-lantern-down-on-both-screens', async () => {
    K.reset(UP, false); role('host'); cap(); const bad = [], { ls, fr } = line(2); adv(1);
    sent = []; g.doDecon({ kind: 'mach', id: fr[0].id }); adv(2.5);
    if (!ofType('ent-').some((m) => m.id === ls[0].id)) bad.push('the guest was never told the lantern is gone'); if (HL.lampsOf(g).some((e) => e.id === ls[0].id)) bad.push('the lantern is still on the host');
    const cabs = ofType('cables'); if (!cabs.length || cabs[cabs.length - 1].list.some((c) => c.a === ls[0].id || c.b === ls[0].id)) bad.push('the cords to it were not dropped for the guest');
    return bad.length === 0 || bad.join(' | ');
  });

  await guard('mp.hlamp.a-guest-never-simulates-or-removes-lanterns-on-its-own', async () => {
    K.reset(UP, false); role('host'); cap(); const { ls, fr } = line(2); adv(1); const hw = hostWorld(); toGuest(hw); const bad = [];
    // the guest has the lantern but ALSO has the frame: drop the frame ent from the guest only (the ent- is still in flight): the guest keeps drawing, it never decons by itself
    g.netMessage({ t: 'ent-', id: fr[0].id }); adv(2.5);
    if (!entOf(ls[0].id)) bad.push('a guest dropped a lantern by itself'); if (ofType('cmd').some((m) => m.c === 'decon')) bad.push('a guest sent a decon on its own');
    return bad.length === 0 || bad.join(' | ');
  });
}
