// Add-on audit, part 5: multiplayer without a network. One page plays both roles by switching g.net.role and capturing g.netSend:
// the guest plans and sends cmd 'place' {tool, ent}; the host handler (netMessage -> netCmd) places it and broadcasts ent+; the guest
// view builds a copy from ent+ and drops it on ent-. Every placeable item goes through the same loop.
import { makeKit, ALL_UP, PLACEABLE, RECIPE_IDS } from './addons_lib.js';
import { idx as cellIdx } from '../config.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, fresh, tiles, adv, cellX, cellZ } = ctx;
  const K = makeKit(ctx);
  const BULK = (await import('../plushdata.js')).BULK;
  const RUNTIME = ['items', 'q', 'kept', 'stored', 'buf', 'path', 'trail', 'carry'];
  const json = (m) => JSON.parse(JSON.stringify(m));
  const net = { sent: [] };
  const open = (role) => { g.net.open = true; g.net.role = role; g.guestReady = role === 'guest'; };
  const close = () => { delete g.netSend; g.net.open = false; g.net.role = null; g.guestReady = false; if (g.world) g.world.onSet = null; };
  const capture = () => { net.sent = []; g.netSend = (m) => { net.sent.push(json(m)); }; };
  const traces = (id, e) => !!(S().entities.some((x) => x.id === id) || L().byId.has(id) || L().objs.has(id) || g.machines.items.has(id) || w().supports.some((s) => s.id === id || s.id === 'shield' + id) || (e && e.i !== undefined && w().reserved.has(cellIdx(e.i, e.j, e.k))));
  const guestSend = async (id, env, o = {}) => {
    open('guest'); capture(); const n0 = S().entities.length, c0 = S().items[id]; const r = await K.placeAny(id, env, o); const cmds = net.sent.filter((m) => m.t === 'cmd'); close(); return { r, cmds, n0, c0 };
  };

  for (const id of PLACEABLE) {
    await T('addons.net.place-cmd.' + id, async () => {
      const env = await K.makeEnv(); const bad = []; S().money = 1e13; let frame = null;
      if (id === 'mfan') { const fr = await K.placeAny('frame:steel', env); if (!fr.ok) return 'frame: ' + fr.why; frame = fr.ents[0]; }
      g.craftItem(id, 2); const before = S().items[id];
      // ---- the guest: plans against its own copy of the world and only sends the command
      const { r, cmds, n0 } = await guestSend(id, env, { frame });
      if (!r.ok) return 'guest could not plan: ' + r.why;
      if (cmds.length !== 1 || cmds[0].c !== 'place') return 'guest sent ' + JSON.stringify(cmds.map((m) => m.c)) + ' instead of one place command';
      const msg = cmds[0]; if (!msg.d || !msg.d.tool || msg.d.tool.id !== id || !msg.d.ent) return 'command lacks tool or ent: ' + JSON.stringify(Object.keys(msg.d || {}));
      if (S().entities.length !== n0 || S().items[id] !== before) bad.push('guest changed host state locally (entities ' + (S().entities.length - n0) + ', items ' + (S().items[id] - before) + ')');
      if (g.plan) bad.push('guest plan not cleared after sending');
      // ---- the host handler
      open('host'); capture(); g.netOut.length = 0; g.world.onSet = (i, j, k, sp, vr) => { g.netOut.push(i, j, k, sp, vr); };
      const ids0 = new Set(S().entities.map((e) => e.id)); g.netMessage(json(msg)); const out = net.sent.slice(); close();
      if (S().items[id] !== before - 1) bad.push('host did not consume exactly one: ' + (before - S().items[id]));
      const ent = S().entities.find((e) => !ids0.has(e.id));
      if (id === 'bulk') {
        const c = msg.d.ent; if (w().get(c.i, c.j, c.k) !== BULK) bad.push('host did not build the bulkhead'); if (!g.netOut.length || g.netOut[3] !== BULK) bad.push('host did not announce the bulkhead cell: ' + g.netOut.slice(0, 5));
        if (!out.some((m) => m.t === 'shared' && m.items.bulk === S().items.bulk)) bad.push('no shared update'); return bad.length ? bad.join('; ') : true;
      }
      if (!ent) return 'host created no entity from the command: ' + bad.join(';');
      const plus = out.find((m) => m.t === 'ent+' && m.ent.id === ent.id);
      if (!plus) bad.push('host did not broadcast ent+'); else for (const f of RUNTIME) if (plus.ent[f] !== undefined) bad.push('ent+ carries runtime field ' + f);
      const sh = out.find((m) => m.t === 'shared'); if (!sh || (sh.items[id] || 0) !== (S().items[id] || 0)) bad.push('shared update missing or stale');
      // ---- the guest view builds a copy and drops it
      const D0 = JSON.stringify(K.describe(ent)); g.removeViewEnt(ent.id); if (traces(ent.id, ent)) bad.push('could not clear the host copy for the view test: ' + ent.id);
      open('guest'); capture(); if (plus) g.netMessage(json(plus));
      const view = S().entities.find((e) => e.id === ent.id); if (!view) bad.push('guest view did not appear'); else {
        if (!view.view) bad.push('view flag missing'); const D1 = JSON.stringify(K.describe(view)); if (D0 !== D1) bad.push(`view differs: ${D0} -> ${D1}`);
        if (['frame', 'strut'].includes(ent.type) && !w().supports.some((s) => s.id === ent.id)) bad.push('view has no support entry'); if (ent.type === 'borer' && !w().supports.some((s) => s.id === 'shield' + ent.id)) bad.push('borer shield missing in view');
        if (net.sent.some((m) => m.t === 'ent+')) bad.push('guest re-broadcast a view entity');
        if (id === 'mfan' && !(L().byId.get(ent.id) || {}).mounted) bad.push('view fan lost its mounting');
        g.netMessage({ t: 'ent-', id: ent.id }); if (traces(ent.id, ent)) bad.push('ent- left traces on the guest');
        g.netMessage(json(plus)); g.netMessage(json(plus)); if (S().entities.filter((e) => e.id === ent.id).length !== 1) bad.push('a repeated ent+ duplicated the view');
      }
      close(); return bad.length ? bad.join('; ') : true;
    });

    await T('addons.net.decon-cmd.' + id, async () => {
      const env = await K.makeEnv(); const bad = []; S().money = 1e13; if (id === 'bulk') return true; // bulkheads are taken down by the 'bulk' command, tested below
      const r = await K.placeAny(id, env); if (!r.ok) return 'host place: ' + r.why; const e = r.ents[0], item = r.give[e.id], had = S().items[item] || 0;
      open('host'); capture(); const kind = L().byId.has(e.id) ? 'tile' : 'mach'; g.netMessage(json({ t: 'cmd', c: 'decon', d: { kind, id: e.id } })); const out = net.sent.slice(); close();
      if ((S().items[item] || 0) !== had + 1) bad.push(`host returned ${(S().items[item] || 0) - had} ${item}`); if (traces(e.id, e)) bad.push('host kept traces');
      if (!out.some((m) => m.t === 'ent-' && m.id === e.id)) bad.push('host did not broadcast ent-');
      if (!out.some((m) => m.t === 'shared' && (m.items[item] || 0) === (S().items[item] || 0))) bad.push('shared update missing');
      // the same command again, and one for an id that never existed: harmless
      open('host'); capture(); g.netMessage(json({ t: 'cmd', c: 'decon', d: { kind, id: e.id } })); g.netMessage(json({ t: 'cmd', c: 'decon', d: { kind: 'mach', id: 999999 } })); close(); if ((S().items[item] || 0) !== had + 1) bad.push('a repeated decon gave another item');
      return bad.length ? bad.join('; ') : true;
    });
  }

  const NEEDLE_SP = () => ctx.species.findIndex((s) => s && s.rarity >= 4);

  // ---------------------------------------------------------------- a repeated or stale command (two clicks before ent+ arrives) must not place twice
  const DUP_SKIP = new Set(['lantern', 'marker', 'flare', 'glow', 'strut', 'jack', 'dynamite', 'charge', 'borer']); // props may legitimately stand side by side; borers refuse by their own limit
  for (const id of PLACEABLE) {
    if (DUP_SKIP.has(id)) continue;
    await T('addons.net.repeated-place-cmd-places-once.' + id, async () => {
      const env = await K.makeEnv(); const bad = []; S().money = 1e13; let frame = null;
      if (id === 'mfan') { const fr = await K.placeAny('frame:steel', env); if (!fr.ok) return 'frame: ' + fr.why; frame = fr.ents[0]; }
      g.craftItem(id, 3); const before = S().items[id]; const { r, cmds } = await guestSend(id, env, { frame }); if (!r.ok || cmds.length !== 1) return 'guest: ' + r.why;
      open('host'); capture(); const e0 = S().entities.length; g.netMessage(json(cmds[0])); const e1 = S().entities.length, i1 = S().items[id]; g.netMessage(json(cmds[0])); g.netMessage(json(cmds[0])); const out = net.sent.slice(); close();
      if (i1 !== before - 1) bad.push('first command consumed ' + (before - i1)); if (S().items[id] !== i1) bad.push(`the repeats consumed ${i1 - S().items[id]} more of the item`);
      if (id !== 'bulk' && S().entities.length !== e1) bad.push(`the repeats made ${S().entities.length - e1} more entities`);
      const ids2 = S().entities.map((e) => e.id); if (new Set(ids2).size !== ids2.length) bad.push('duplicate ids');
      if (id !== 'bulk' && e1 !== e0 + 1) bad.push('first command made ' + (e1 - e0) + ' entities'); void out;
      return bad.length ? bad.join('; ') : true;
    });
  }

  // ---------------------------------------------------------------- the conversions: guest points a splitter or gate at a belt
  for (const [id, flag, plan] of [['splitter', 'splitter', 'splitbelt'], ['gate', 'detector', 'gatebelt']]) {
    await T('addons.net.convert-belt-' + id, async () => {
      const env = await K.makeEnv(); const bad = []; S().money = 1e13; const b = await K.put('belt', { x: -6.6, z: 5, dir: 0 }); if (!b.ok) return b.why; g.craftItem(id, 2);
      open('guest'); capture(); K.equip(id); K.aimDir(cellX(b.ent.i), 0.1, cellZ(b.ent.k), 1, 1.6); const pl = await ctx.plan(); if (!pl.ok || pl.ent.type !== plan) { close(); return 'guest plan ' + JSON.stringify([pl.ok, pl.why]); }
      g.placeCurrent(g.curTool()); const cmd = net.sent.find((m) => m.c === 'place'); close(); if (!cmd) return 'no command sent'; const n0 = S().items[id];
      open('host'); capture(); g.netMessage(json(cmd)); const out = net.sent.slice(); close();
      open('host'); capture(); const n1 = S().items[id]; g.netMessage(json(cmd)); close(); if (S().items[id] !== n1) bad.push('a repeated conversion command ate another item');
      const t = L().byId.get(b.ent.id); if (!t || !t[flag]) bad.push('host did not convert'); if (S().items[id] !== n0 - 1) bad.push('item not consumed once'); if (!out.some((m) => m.t === 'ent-' && m.id === b.ent.id) || !out.some((m) => m.t === 'ent+' && m.ent.id === b.ent.id && m.ent[flag])) bad.push('conversion not broadcast');
      // the guest view applies ent- then ent+: it ends with the converted piece, once
      const plus = out.find((m) => m.t === 'ent+' && m.ent.id === b.ent.id); g.removeViewEnt(b.ent.id); open('guest'); g.netMessage({ t: 'ent-', id: b.ent.id }); g.netMessage(json(plus)); const v = S().entities.filter((e) => e.id === b.ent.id); if (v.length !== 1 || !v[0][flag] || !L().objs.has(b.ent.id)) bad.push('view did not end with the converted piece'); close();
      return bad.length ? bad.join('; ') : true;
    });
  }

  // ---------------------------------------------------------------- the other things a guest can ask the host
  await T('addons.net.craft-cmd-for-every-recipe', async () => {
    const bad = [];
    for (const id of RECIPE_IDS) {
      fresh(ALL_UP); S().money = 1e12; const r = ctx.recipes(g).find((x) => x.id === id); open('guest'); capture(); const ok = g.craftItem(id, id.startsWith('mat:') ? 10 : 1); const cmd = net.sent.find((m) => m.c === 'craft'); close();
      if (!ok || !cmd || cmd.d.id !== id) { bad.push(id + ' no craft command'); continue; } if (S().items[id] || (S().mats && Object.keys(S().mats).length)) { bad.push(id + ' guest crafted locally'); continue; }
      const m0 = S().money; open('host'); capture(); g.netMessage(json(cmd)); const out = net.sent.slice(); close(); const sh = out.find((m) => m.t === 'shared');
      if (!sh) { bad.push(id + ' no shared update'); continue; } if (m0 - S().money !== r.price * (id.startsWith('mat:') ? 10 : 1) && !id.startsWith('cart:')) bad.push(`${id} host charged ${m0 - S().money}`);
      const got = id.startsWith('mat:') ? sh.mats[id.slice(4)] : sh.items[id]; if (got !== (id.startsWith('mat:') ? 10 : 1)) bad.push(`${id} shared shows ${got}`);
    }
    return bad.length ? bad.slice(0, 6).join('; ') : true;
  });
  await T('addons.net.guest-cannot-place-without-the-item-or-with-a-refused-plan', async () => {
    const env = await K.makeEnv(); const bad = []; S().money = 1e13; open('guest'); capture(); K.equip('hammer');
    g.plan = { ok: true, ent: { type: 'belt', i: 5100, j: 0, k: 5100, dir: 0 } }; g.placeCurrent({ id: 'belt', kind: 'belt' }); if (net.sent.length) bad.push('guest sent a place command with zero items');
    g.craftItem('belt', 0); g.S.items.belt = 1; g.plan = { ok: false, why: 'Nope' }; g.placeCurrent({ id: 'belt', kind: 'belt' }); if (net.sent.some((m) => m.c === 'place')) bad.push('guest sent a refused plan'); close(); void env;
    return bad.length ? bad.join('; ') : true;
  });
  await T('addons.net.guest-tile-commands-drive-vault-and-generator-on-the-host', async () => {
    const env = await K.makeEnv(); const bad = []; S().money = 1e13; const v = await K.placeAny('vault', env), ge = await K.placeAny('gen', env); if (!v.ok || !ge.ok) return 'placement';
    const vault = L().byId.get(v.ents[0].id), gen = L().byId.get(ge.ents[0].id); for (let q = 0; q < 4; q++) vault.stored.push({ sp: 3 + q, vr: 0 });
    open('host'); capture(); g.netMessage(json({ t: 'cmd', c: 'tile', d: { id: vault.id, room: 3 } })); const give = net.sent.find((m) => m.t === 'give'); if (!give || give.items.length !== 3 || vault.stored.length !== 1) bad.push('vault give ' + (give && give.items.length) + ' left ' + vault.stored.length);
    net.sent.length = 0; g.netMessage(json({ t: 'cmd', c: 'tile', d: { id: gen.id, items: [{ sp: 2, vr: 0 }, { sp: 2, vr: 0 }] } })); if (gen.q.length !== 2) bad.push('generator fuel from the guest: ' + gen.q.length);
    net.sent.length = 0; g.netMessage(json({ t: 'cmd', c: 'tile', d: { id: gen.id, items: [{ sp: NEEDLE_SP(), vr: 0 }] } })); const back = net.sent.find((m) => m.t === 'give'); if (gen.q.length !== 2 && !back) bad.push('rejected fuel was not returned');
    close(); return bad.length ? bad.join('; ') : true;
  });
  await T('addons.net.guest-bulkhead-takedown-and-spend-commands', async () => {
    const env = await K.makeEnv(); const bad = []; S().money = 1e13; const r = await K.put('bulk', { x: -4.2, z: -2.4, dir: 0 }); if (!r.ok) return r.why; const c = r.pl.ent; const n0 = S().items.bulk || 0;
    open('host'); capture(); g.netMessage(json({ t: 'cmd', c: 'bulk', d: { i: c.i, j: c.j, k: c.k } })); close(); if (w().get(c.i, c.j, c.k) === BULK || (S().items.bulk || 0) !== n0 + 1) bad.push('guest takedown of a bulkhead');
    g.craftItem('medkit', 1); open('host'); capture(); g.netMessage(json({ t: 'cmd', c: 'spend', d: { id: 'medkit' } })); close(); if (S().items.medkit) bad.push('spend did not consume the medkit');
    return bad.length ? bad.join('; ') : true;
  });
  void p; void tiles; void adv; void K;
}
