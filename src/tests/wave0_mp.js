// mp.catalog.*: the `cfg` command round trip and the 0.5 s `xrow` rows, with no network (one page plays both roles by switching g.net.role).
import { makeKit, ALL_UP } from './addons_lib.js';
import { TYPES, V } from '../catalog.js';
import * as EXT from '../ext.js';

export default async function (ctx) {
  const { T, g, S, fresh } = ctx;
  const K = makeKit(ctx);
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); delete TYPES.wtest; } });
  const CFG = { on: V.bool, n: V.int(0, 5), name: V.str(8), rules: V.arr(3, V.obj({ k: V.enum(['any', 'rarity']), v: V.int(0, 6) })) };
  // drop one ent from the world and show it again the way a guest does: from the host's ent+ message
  const dropEnt = (id) => g.removeViewEnt(id);
  const showAsGuest = (plus) => { done(); role('guest'); cap(); g.netMessage(json(plus)); };

  await guard('mp.catalog.cfg-roundtrip', async () => {
    fresh({}); TYPES.wtest = { cfg: CFG, onCfg: (gg, e) => { gg._cfgSeen = (gg._cfgSeen || 0) + 1; } }; const bad = []; g._cfgSeen = 0;
    role('host'); cap(); const e = g.placeEntity('wtest', { x: -3.6, y: 0.3, z: 6.0, n: 1 }); const plus = ofType('ent+').find((m) => m.ent.id === e.id); if (!plus) return 'host did not announce the new ent';
    const id = e.id; dropEnt(id);
    // guest: sees the ent, asks for a change, applies nothing itself
    showAsGuest(plus); const view = () => S().entities.find((x) => x.id === id); if (!view() || !view().view) return 'guest has no copy';
    const patch = { on: true, n: 4, name: 'North', rules: [{ k: 'rarity', v: 3 }] };
    const r = g.setCfg(id, patch); const cmd = sent.find((m) => m.t === 'cmd' && m.c === 'cfg');
    if (!r.ok || !cmd || cmd.d.id !== id || JSON.stringify(cmd.d.patch) !== JSON.stringify(patch)) bad.push('guest did not send the validated patch: ' + JSON.stringify(cmd));
    if (view().on !== undefined || view().n !== 1) bad.push('the guest changed its own copy before the host answered');
    // a patch the guest knows is bad never leaves the machine
    sent.length = 0; const nope = g.setCfg(id, { on: 'yes' }); if (nope.ok || sent.some((m) => m.c === 'cfg')) bad.push('a bad patch was sent');
    // host: runs the guest command as the guest
    dropEnt(id); done(); const hostEnt = { id, type: 'wtest', x: -3.6, y: 0.3, z: 6.0, n: 1 }; S().entities.push(hostEnt); g.addEntity(hostEnt); role('host'); cap();
    g.netMessage(json(cmd));
    const he = S().entities.find((x) => x.id === id); if (!he || he.on !== true || he.n !== 4 || he.name !== 'North' || he.rules[0].v !== 3) bad.push('host did not apply: ' + JSON.stringify(he));
    if (g._cfgSeen !== 1) bad.push('onCfg ran ' + g._cfgSeen + ' times');
    const minus = sent.findIndex((m) => m.t === 'ent-' && m.id === id), plus2 = sent.findIndex((m) => m.t === 'ent+' && m.ent.id === id);
    if (minus < 0 || plus2 < minus) bad.push('host must send ent- then ent+: ' + JSON.stringify(sent.map((m) => m.t)));
    const announced = sent[plus2] && sent[plus2].ent; if (!announced || announced.n !== 4 || announced.on !== true) bad.push('ent+ does not carry the new settings');
    // a second guest sees the settings after the ent- / ent+ pair
    const msgs = json(sent); dropEnt(id); done(); role('guest'); cap(); const ent0 = { id, type: 'wtest', x: -3.6, y: 0.3, z: 6.0, n: 1, view: true }; S().entities.push(ent0); g.addEntity(ent0);
    for (const m of msgs) if (m.t === 'ent-' || m.t === 'ent+') g.netMessage(m);
    const gv = S().entities.find((x) => x.id === id); if (!gv || gv.n !== 4 || !gv.view || !g.machines.items.has(id)) bad.push('guest copy not refreshed: ' + JSON.stringify(gv));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.catalog.cfg-from-a-malicious-guest-changes-nothing-and-tells-them', async () => {
    fresh({}); TYPES.wtest = { cfg: CFG, check: (gg, e, c, actor) => (c.n === 5 && actor === 'guest' ? 'host only value' : null) }; const bad = [];
    role('host'); cap(); const e = g.placeEntity('wtest', { x: -3.6, y: 0.3, z: 6.0, n: 1 });
    for (const d of [{ id: e.id, patch: { evil: 1 } }, { id: e.id, patch: { on: true, evil: 1 } }, { id: e.id, patch: { n: 99 } }, { id: e.id, patch: { n: 5 } }, { id: e.id, patch: JSON.parse('{"__proto__":{"on":1}}') }, { id: 'x', patch: { on: true } }, { id: e.id }, { patch: {} }, null, 5, 'on']) {
      sent.length = 0; g.netMessage({ t: 'cmd', c: 'cfg', d: json(d) });
      if (sent.some((m) => m.t === 'ent+' || m.t === 'ent-')) bad.push('refused patch was announced: ' + JSON.stringify(d));
      if (d && d.id === e.id && d.patch && !sent.some((m) => m.t === 'toast')) bad.push('no toast for ' + JSON.stringify(d));
    }
    if (e.on !== undefined || e.n !== 1 || ({}).on !== undefined) bad.push('ent changed: ' + JSON.stringify(e));
    // the host itself may set n 5 (the check only refuses a guest)
    sent.length = 0; if (!g.setCfg(e, { n: 5 }).ok || e.n !== 5) bad.push('host could not set what only a guest is refused');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.catalog.cfg-on-a-sorting-box-reaches-the-guest-and-copy-paste-works-for-a-guest', async () => {
    fresh({ ...ALL_UP, optics: 3 }); const bad = [];
    const a = await K.put('sorter', { x: -8, z: -6, dir: 0 }), b = await K.put('sorter', { x: -8, z: -3, dir: 0 }); if (!a.ok || !b.ok) return 'could not place two sorters';
    const ta = K.tileOf(a.ent), tb = K.tileOf(b.ent), ida = ta.id, idb = tb.id;
    role('guest'); cap(); g.copyCfg(ta); ta.mode = 0; g.cfgClip.vals.mode = 3; const r = g.pasteCfg(tb); const cmd = sent.find((m) => m.c === 'cfg');
    if (!r.ok || !cmd || cmd.d.id !== idb || cmd.d.patch.mode !== 3) bad.push('guest paste did not become a cfg command: ' + JSON.stringify([r, cmd]));
    done(); role('host'); cap(); g.netMessage(json(cmd));
    if (tb.mode !== 3 || tb.filter !== 3) bad.push('host sorter ' + tb.mode + '/' + tb.filter);
    const plus = ofType('ent+').find((m) => m.ent.id === idb); if (!plus || plus.ent.mode !== 3 || plus.ent.filter !== 3 || plus.ent.q !== undefined) bad.push('ent+ for the sorter: ' + JSON.stringify(plus));
    g.cfgClip = null; void ida;
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('mp.catalog.xrow-host-sends-a-compact-row-every-half-second-and-the-guest-applies-it', async () => {
    fresh({}); const bad = []; let applied = null, n = 0;
    TYPES.wtest = { row: () => { n++; return [1, 2, 3]; }, guestRow: (gg, d) => { applied = d; } };
    g._extRow = 0; role('host'); cap(); EXT.update(g, 0.1, false); if (ofType('xrow').length !== 1) bad.push('first row missing: ' + ofType('xrow').length);
    sent.length = 0; EXT.update(g, 0.2, false); EXT.update(g, 0.2, false); if (sent.length) bad.push('row sent too early (' + sent.length + ')');
    EXT.update(g, 0.2, false); const rows = ofType('xrow'); if (rows.length !== 1 || rows[0].k !== 'wtest' || JSON.stringify(rows[0].d) !== '[1,2,3]') bad.push('row after 0.5 s: ' + JSON.stringify(rows));
    // a handler that returns null sends nothing; a guest never sends rows
    TYPES.wtest.row = () => null; sent.length = 0; EXT.update(g, 0.6, false); if (sent.length) bad.push('a null row was sent');
    TYPES.wtest.row = () => { n++; return [9]; }; role('guest'); cap(); const n0 = n; EXT.update(g, 1, true); if (n !== n0 || sent.length) bad.push('a guest produced a row');
    g.netMessage({ t: 'xrow', k: 'wtest', d: [4, 5] }); if (JSON.stringify(applied) !== '[4,5]') bad.push('guestRow did not get the payload: ' + JSON.stringify(applied));
    g.netMessage({ t: 'xrow', k: 'nothing', d: 1 }); g.netMessage({ t: 'xrow', k: '__proto__', d: 1 });
    return bad.length === 0 || bad.join(' || ');
  });
}
