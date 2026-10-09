// mp.gen.*: the generator ladder in multiplayer, no network: one page plays both roles by switching g.net.role and capturing g.netSend.
// The host simulates the burn and owns the rung (read from the item, never from what a guest claims); a guest feeds through the `tile` command,
// places through `place`, wires through `cable`, and sees the same readout from the host's ents and the 0.5 s `dyn` rows.
import { makeKit } from './power_lib.js';
import * as PP from '../powerparts.js';
import { pools } from '../plushdata.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, L, adv, toI, toK, cellX, cellZ } = ctx;
  const K = makeKit(ctx);
  const FULL = { power: 1, belts: 1, fans: 1, genOutput: 3, genTurbine: 1, genPlant: 1, genStation: 1, genTitan: 1 };
  const sp = (r) => pools[r][0];
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const NOISE = new Set(['pos', 'bodies', 'shared', 'time']);
  const cap = () => { sent = []; g.netSend = (m) => { if (!NOISE.has(m.t)) sent.push(K.json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); } });
  const place = (tool, ent) => { sent = []; g.netMessage({ t: 'cmd', c: 'place', d: { tool, ent } }); return ofType('toast')[0]; };
  const gens = () => [...L().tiles.values()].filter((t) => t.type === 'gen');
  const at = (x, z) => ({ i: toI(x), j: 0, k: toK(z), dir: 0, rise: 0 });

  await guard('mp.gen.guest-places-every-rung-and-the-host-reads-the-rung-from-the-item', async () => {
    K.reset(FULL, false); role('host'); cap(); const bad = [];
    for (const k of PP.GEN_KINDS) S().items[k.id] = 1; g.rebuildTools();
    let x = -12;
    for (const k of PP.GEN_KINDS) {
      // the guest claims a Titan in `p`: the item id decides
      const t = place({ id: k.id, kind: 'gen', p: { gk: 'titan' } }, at(x, 3)); x += 1.8;
      const e = gens().find((q) => Math.abs(cellX(q.i) - (x - 1.8)) < 0.4); const want = k.key === 'std' ? undefined : k.key;
      if (t || !e || e.gk !== want || S().items[k.id]) bad.push(`${k.id}: toast ${JSON.stringify(t)} gk ${e && e.gk} item left ${S().items[k.id]}`);
      const plus = ofType('ent+').find((m) => m.ent.type === 'gen' && m.ent.id === (e && e.id)); if (!plus || plus.ent.gk !== want) bad.push(`${k.id}: the guest was not told the rung: ${plus && plus.ent.gk}`);
    }
    // an item you do not have, an id that is not a rung, a stacked spot
    const t1 = place({ id: 'gen:plant', kind: 'gen' }, at(0, 6)); if (!t1 && gens().length !== 6) bad.push('placed without the item');
    S().items['gen:__proto__'] = 1; S().items.constructor = 1;
    place({ id: '__proto__', kind: 'gen' }, at(2, 6)); place({ id: 'constructor', kind: 'gen' }, at(4, 6));
    for (const q of gens()) if (q.gk !== undefined && !PP.GEN_BY_KEY[q.gk]) bad.push('a made up rung was stored: ' + q.gk);
    S().items['gen:plant'] = 1; const t2 = place({ id: 'gen:plant', kind: 'gen' }, at(-12, 3)); if (!t2 || !/occupied|already|Too|spot|cell/i.test(t2.text || '')) bad.push('stacked on a rung: ' + JSON.stringify(t2));
    return bad.length === 0 || bad.join(' | ');
  });

  await guard('mp.gen.late-joiner-and-the-guest-screen-see-every-rung-with-the-same-readout', async () => {
    K.reset(FULL, false); g.T.genOutput = 8; role('host'); cap(); const bad = [];
    const mk = {}; let x = -12;
    for (const k of PP.GEN_KINDS) { const t = K.tile('gen', x, 3, k.key === 'std' ? {} : { gk: k.key }); x += 2.2; mk[k.key] = t; t.q.push({ sp: sp(2), vr: 0 }, { sp: sp(0), vr: 0 }, { sp: sp(3), vr: 0 }); }
    K.pole(-1, 5); adv(1.5);
    const hostInfo = {}; for (const k of PP.GEN_KINDS) hostInfo[k.key] = infoFor(g, { kind: 'tile', id: mk[k.key].id });
    sent = []; g.sendWorld(); const list = sent.filter((m) => m.t === 'ents').flatMap((m) => m.list); const ge = list.filter((e) => e.type === 'gen');
    if (ge.length !== 6) bad.push('sendWorld carried ' + ge.length + ' generators');
    for (const e of ge) { if ('q' in e || 'cache' in e) bad.push('fuel queue leaked into the ents batch'); const want = mk[PP.GEN_KINDS.find((k) => mk[k.key].id === e.id).key].gk; if (e.gk !== want) bad.push(`gk in the batch: ${e.gk} want ${want}`); }
    sent = []; g.sendDyn(); const dyn = ofType('dyn')[0]; if (!dyn) return 'no dyn row';
    const ids = Object.fromEntries(PP.GEN_KINDS.map((k) => [k.key, mk[k.key].id]));
    done(); K.reset(FULL, false); g.T.genOutput = 8; role('guest'); cap(); g.netMessage({ t: 'ents', list }); g.netMessage(K.json(dyn));
    for (const k of PP.GEN_KINDS) {
      const t = L().byId.get(ids[k.key]); if (!t) { bad.push(k.key + ' missing on the guest'); continue; }
      if (PP.genKindOf(t).key !== k.key) bad.push(`${k.key}: guest rung ${PP.genKindOf(t).key}`);
      const o = g.logi.objs.get(t.id); if (!o || Math.abs(o.scale.x - k.scale) > 1e-6) bad.push(`${k.key}: model scale ${o && o.scale.x}`);
      const gi = infoFor(g, { kind: 'tile', id: t.id }), hi = hostInfo[k.key];
      if (gi.title !== hi.title) bad.push(`${k.key} title: host "${hi.title}" guest "${gi.title}"`);
      const norm = (l) => l.map((s) => s.replace(/  ·  grid .*/, '').replace(/\), [^(]*? left of/, ') left of'));   // the time left is rounded to the hundredth in the row, so a .55 can read either way
      if (JSON.stringify(norm(gi.lines)) !== JSON.stringify(norm(hi.lines))) bad.push(`${k.key} readout differs:\n host  ${JSON.stringify(norm(hi.lines))}\n guest ${JSON.stringify(norm(gi.lines))}`);
    }
    return bad.length === 0 || bad.join('\n');
  });

  await guard('mp.gen.guest-hand-feeding-fills-the-rungs-bigger-hopper-and-gets-the-rest-back', async () => {
    K.reset(FULL, false); role('host'); cap(); const bad = [];
    const t = K.tile('gen', -6, 3, { gk: 'plant' }), cap0 = PP.genHopper(g.T, t); t.q.length = 0;
    const items = []; for (let n = 0; n < cap0 + 25; n++) items.push({ sp: sp(n % 3), vr: 0 });
    sent = []; g.netMessage({ t: 'cmd', c: 'tile', d: { id: t.id, items, room: 0 } });
    const give = ofType('give')[0];
    if (t.q.length !== cap0) bad.push(`hopper ${t.q.length} of ${cap0}`); if (!give || give.items.length !== 25) bad.push('did not hand back the 25 that did not fit: ' + JSON.stringify(give && give.items.length));
    sent = []; g.netMessage({ t: 'cmd', c: 'tile', d: { id: t.id, items: [{ sp: sp(4), vr: 0 }], room: 0 } }); if (t.q.length !== cap0) bad.push('a Legendary went into the plant');
    return bad.length === 0 || bad.join(' | ');
  });

  await guard('mp.gen.guest-cable-ports-follow-the-host-rule-for-each-rung', async () => {
    K.reset(FULL, false); role('host'); cap(); const bad = [];
    for (const key of ['portable', 'plant']) {
      const t = K.tile('gen', key === 'portable' ? -12 : -8, 3, { gk: key }), lim = PP.GEN_BY_KEY[key].ports; let refused = '';
      const fans = []; for (let n = 0; n < lim + 1; n++) fans.push(K.fan(t.i * 0 + cellX(t.i) + n * 0.7 - 1, 6.5));
      for (const f of fans) { S().items.cable = (S().items.cable || 0) + 1; sent = []; g.netMessage({ t: 'cmd', c: 'cable', d: { a: t.id, b: f.id } }); const h = ofType('chint')[0]; if (h && !h.good) refused = h.text; }
      const n = g.cables.of(t.id).length; if (n !== lim || !new RegExp(`takes ${lim}`).test(refused)) bad.push(`${key}: ${n} cords of ${lim}, refusal "${refused}"`);
    }
    return bad.length === 0 || bad.join(' | ');
  });

  await guard('mp.gen.guest-hammer-returns-the-right-item-and-the-ordinary-price-ignores-the-ladder', async () => {
    K.reset(FULL, false); role('host'); cap(); const bad = [];
    const a = K.tile('gen', -12, 3, { gk: 'turbine' }), b = K.tile('gen', -10, 3, { gk: 'titan' }), c = K.tile('gen', -8, 3);
    S().items = {};
    for (const t of [a, b, c]) { sent = []; g.netMessage({ t: 'cmd', c: 'decon', d: { kind: 'tile', id: t.id } }); if (!ofType('ent-').some((m) => m.id === t.id)) bad.push('no ent- for ' + t.id); }
    if (S().items['gen:turbine'] !== 1 || S().items['gen:titan'] !== 1 || S().items.gen !== 1) bad.push('items ' + JSON.stringify(S().items));
    return bad.length === 0 || bad.join(' | ');
  });

  await guard('mp.gen.every-rung-fuels-and-burns-on-the-host-and-the-guest-row-says-how-long', async () => {
    K.reset(FULL, false); g.T.genOutput = 8; role('host'); cap(); const bad = [];
    const t = K.tile('gen', -6, 3, { gk: 'turbine' }); t.q.push({ sp: sp(3), vr: 0 }, { sp: sp(0), vr: 0 }); adv(2);
    sent = []; g.sendDyn(); const dyn = ofType('dyn')[0], row = dyn && dyn.tiles.find((r) => r[0] === t.id);
    if (!row || row.length < 12) return 'short row ' + JSON.stringify(row);
    if (!(row[2] > 0) || row[7] !== 1 || row[9] === 0 || !(row[10] > 0) || row[11][0] !== 1) bad.push('row ' + JSON.stringify(row));
    return bad.length === 0 || bad.join(' | ');
  });
}
