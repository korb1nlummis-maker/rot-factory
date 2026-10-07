// audit gens (multiplayer and economy): what a hostile or confused guest can do with the generator ladder and the hanging lanterns.
// One page plays both roles by switching g.net.role and capturing g.netSend, like mp.gen.* does.
import { makeKit } from './power_lib.js';
import * as PP from '../powerparts.js';
import * as HL from '../hanglamp.js';
import { pools } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, L, adv, toI, toK, cellX } = ctx;
  const K = makeKit(ctx);
  const FULL = { power: 1, belts: 1, fans: 1, genOutput: 3, genTurbine: 1, genPlant: 1, genStation: 1, genTitan: 1 };
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const NOISE = new Set(['pos', 'bodies', 'shared', 'time']);
  const cap = () => { sent = []; g.netSend = (m) => { if (!NOISE.has(m.t)) sent.push(K.json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); } });
  const cmd = (c, d) => { sent = []; g.netMessage({ t: 'cmd', c, d }); };
  const gens = () => [...L().tiles.values()].filter((t) => t.type === 'gen');
  const at = (x, z) => ({ i: toI(x), j: 0, k: toK(z), dir: 0, rise: 0 });
  const frame = (x, z = 3) => { const e = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'z', cx: x, cz: z, y0: 0, w: 2.38, h: 2.38, yaw: 0 }; S().entities.push(e); g.addEntity(e); return e; };

  await guard('gens.audit.mp.a-cheap-item-never-turns-into-a-generator', async () => {
    K.reset(FULL, false); role('host'); cap(); const bad = [];
    S().items.belt = 5; S().items.sorter = 2; S().items['gen:titan'] = 0; g.rebuildTools();
    for (const id of ['belt', 'sorter', 'gen:nope', 'pole', 'hlamp']) { cmd('place', { tool: { id, kind: 'gen' }, ent: at(-12 + gens().length * 2, 3) }); }
    if (gens().length) bad.push(`${gens().length} generators came out of cheap items`);
    if (S().items.belt !== 5 || S().items.sorter !== 2) bad.push('items were spent: ' + JSON.stringify([S().items.belt, S().items.sorter]));
    return bad.length === 0 || bad.join('; ');
  });

  await guard('gens.audit.mp.a-titan-item-cannot-place-a-different-kind-of-machine', async () => {
    K.reset(FULL, false); role('host'); cap(); const bad = [];
    S().items['gen:titan'] = 1; g.rebuildTools();
    cmd('place', { tool: { id: 'gen:titan', kind: 'sorter' }, ent: at(-12, 3) });
    if (L().tiles.size && [...L().tiles.values()].some((t) => t.type === 'sorter')) bad.push('a titan item became a sorter');
    if (S().items['gen:titan'] !== 1) bad.push('the titan item was spent: ' + S().items['gen:titan']);
    return bad.length === 0 || bad.join('; ');
  });

  await guard('gens.audit.mp.forged-lantern-cfg-and-places-are-refused-without-side-effects', async () => {
    K.reset(FULL, false); role('host'); cap(); const bad = [];
    const f = frame(-12); S().items.hlamp = 3; g.rebuildTools();
    for (const ent of [{ frameId: f.id, slot: 1.5 }, { frameId: f.id, slot: -1 }, { frameId: f.id, slot: '0' }, { frameId: 'x', slot: 0 }, { frameId: f.id }, null, 5]) { cmd('place', { tool: { id: 'hlamp', kind: 'hlamp' }, ent }); }
    if (HL.lampsOf(g).length) bad.push('forged place built ' + HL.lampsOf(g).length + ' lanterns');
    if (S().items.hlamp !== 3) bad.push('lantern items spent on refused places: ' + S().items.hlamp);
    cmd('place', { tool: { id: 'hlamp', kind: 'hlamp' }, ent: { frameId: f.id, slot: 2, x: 999, y: -50, z: 1e9, on: false } });
    const l = HL.lampsOf(g)[0];
    if (!l || l.x !== f.cx - HL.LAMP_SIDE || l.z !== f.cz || l.y !== f.y0 + f.h - HL.LAMP_HANG || l.on !== true) bad.push('the host believed the guest position: ' + JSON.stringify(l && [l.x, l.y, l.z, l.on]));
    if (l) {
      for (const patch of [{ on: 'yes' }, { on: 1 }, { on: null }, { x: 5 }, { frameId: 0 }, {}, null]) { cmd('cfg', { id: l.id, patch }); if (l.on !== true || l.x !== f.cx - HL.LAMP_SIDE || l.frameId !== f.id) bad.push('cfg changed it: ' + JSON.stringify(patch)); }
      cmd('cfg', { id: l.id, patch: { on: false } }); if (l.on !== false) bad.push('a legal switch off was refused');
    }
    // a double place for the same side in one tick
    cmd('place', { tool: { id: 'hlamp', kind: 'hlamp' }, ent: { frameId: f.id, slot: 2 } }); if (HL.lampsOf(g).length !== 1) bad.push('two lanterns on one side: ' + HL.lampsOf(g).length);
    return bad.length === 0 || bad.join('; ');
  });

  await guard('gens.audit.mp.lantern-round-trip-spends-and-returns-exactly-one-item-and-its-cords', async () => {
    K.reset(FULL, false); role(null); const bad = [];
    const f = frame(-12), G = K.tile('gen', -13.5, 8.5); S().items.hlamp = 2; S().items.cable = 0;
    const a = g.placeEntity('hlamp', HL.lampFields(f, 0), { quiet: true }), b = g.placeEntity('hlamp', HL.lampFields(f, 1), { quiet: true });
    const r1 = K.wire(G, a), r2 = K.wire(a, b); if (!r1.ok || !r2.ok) return 'wire ' + JSON.stringify([r1, r2]);
    const items0 = S().items.hlamp | 0, cab0 = S().items.cable | 0;
    g.doDecon({ kind: 'mach', id: a.id }); g.doDecon({ kind: 'mach', id: b.id });
    if ((S().items.hlamp | 0) !== items0 + 2) bad.push('items back: ' + (S().items.hlamp | 0) + ' from ' + items0);
    if ((S().items.cable | 0) !== cab0 + 2) bad.push('cords back: ' + ((S().items.cable | 0) - cab0));
    if (g.cables.list().length) bad.push('cables left behind');
    g.doDecon({ kind: 'mach', id: a.id }); if ((S().items.hlamp | 0) !== items0 + 2) bad.push('a second hammer on a gone lantern paid out again');
    return bad.length === 0 || bad.join('; ');
  });
}
