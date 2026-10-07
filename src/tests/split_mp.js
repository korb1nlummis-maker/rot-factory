// mp.split.* (wave 2B): mergers and ruled splitters on both screens, with no network (one page plays both roles by switching g.net.role).
// The host simulates, owns every rule and validates every edit; the guest draws what it is told and asks through `cfg` and `place`.
import { makeSplitKit, UP, UPB, RAR } from './split_lib.js';
import { infoFor } from '../info.js';
import * as SR from '../splitrules.js';

export default async function (ctx) {
  const { g, S, L, toI, toK, cellX, cellZ, tiles } = ctx;
  const X = makeSplitKit(ctx), K0 = X.K, json = X.json;
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const T = (name, fn) => X.T(name, async () => { try { return await fn(); } finally { done(); X.cleanup(); } });
  const R = (min, max) => (max === undefined ? { k: 'rarity', v: min } : { k: 'rarity', v: min, w: max });
  const ANY = { k: 'any' }, NONE = { k: 'none' };
  const view = (t) => JSON.stringify([t.i, t.j, t.k, t.dir, t.tier || 0, t.merger, t.smart, t.splitter, t.rules, t.mode, t.prio, t.def, t.lanes]);
  const views = () => { const o = {}; for (const t of tiles()) if (t.type === 'belt' && !t.free) o[t.id] = view(t); return o; };
  const diffViews = (a, b) => { const bad = []; for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[id] !== b[id]) bad.push(`tile ${id}: host ${a[id]} guest ${b[id]}`); return bad; };
  const toGuest = (msgs, up = UPB) => { done(); X.setup(up); role('guest'); cap(); for (const m of msgs) g.netMessage(json(m)); };
  const text = (t) => { const o = infoFor(g, { kind: 'tile', id: t.id }); return o ? o.title + '\n' + o.lines.join('\n') : ''; };

  // a host world with one of each part, rules set, a Mk3 tile among them
  const buildHost = () => {
    const i = X.i0() + 2, k = X.k0() + 6, m = {};
    m.sm = X.part('ssplit', i, k, 0, 2); m.pg = X.part('psplit', i + 3, k, 1, 1); m.pm = X.part('pmerger', i + 6, k, 0); m.mg = X.part('merger', i + 9, k, 3, 4);
    g.setCfg(m.sm, { rules: [[R(3)], [{ k: 'shiny' }], [{ k: 'undef' }]], mode: 'prio', prio: [2, 0, 1] });
    g.setCfg(m.pg, { rules: [[ANY, R(5), { k: 'one' }], [{ k: 'species', v: RAR(2) }], [NONE]], def: 2 });
    g.setCfg(m.pm, { lanes: [2, 0, 1] });
    L().dirty = true; m.i = i; m.k = k; return m;
  };

  await T('mp.split.rules-sync', async () => {
    X.setup(UPB); role('host'); cap(); const m = buildHost(); X.run(0.3, () => {});
    const host = { views: views(), kids: [m.sm, m.pg, m.pm, m.mg].map((t) => L().objs.get(t.id).children.length), text: [m.sm, m.pg, m.pm, m.mg].map(text) };
    const plus = ofType('ent+').filter((e) => [m.sm, m.pg, m.pm, m.mg].some((t) => t.id === e.ent.id)); if (plus.length < 4) return 'host announced only ' + plus.length + ' of the 4 parts';
    // the last ent+ of each piece is its current state (a setting change sends ent- then ent+)
    const last = new Map(); for (const e of plus) last.set(e.ent.id, e); const msgs = [...last.values()];
    for (const e of msgs) if (e.ent.items !== undefined || e.ent.cache !== undefined) return 'transient fields in ent+: ' + Object.keys(e.ent).join();
    toGuest(msgs); X.run(0.1, () => {});
    const bad = diffViews(host.views, views());
    [m.sm, m.pg, m.pm, m.mg].forEach((t, n) => {
      const gt = L().byId.get(t.id); if (!gt) { bad.push('the guest has no ' + t.id); return; }
      if (!gt.view) bad.push('the guest copy is not a view');
      const o = L().objs.get(t.id); if (!o || o.children.length !== host.kids[n]) bad.push(`mesh of ${t.id}: ${o && o.children.length} children, host ${host.kids[n]}`);
      if (!L().parts.has(gt)) bad.push('the guest does not track ' + t.id + ' for its lamp');
    });
    // the readouts read the same on both screens (the guest has no plush on the belts either way)
    [m.sm, m.pg, m.pm, m.mg].forEach((t, n) => { const a = host.text[n].replace(/Carrying \d+ plush/, ''), b = text(t).replace(/Carrying \d+ plush/, ''); if (a !== b) bad.push(`readout ${n}:\n${a}\n---\n${b}`); });
    return bad.length === 0 || bad.join('; ');
  });

  const stripOf = (t, key, val) => { const e = json(t); delete e.items; e[key] = val; e.view = undefined; return e; };
  await T('mp.split.guest-edits-rules-through-the-host', async () => {
    X.setup(UPB); role('host'); cap(); const m = buildHost(); const plus0 = ofType('ent+').filter((e) => [m.sm, m.pg, m.pm].some((t) => t.id === e.ent.id)); const last = new Map(); for (const e of plus0) last.set(e.ent.id, e);
    toGuest([...last.values()]); const bad = [];
    const gsm = () => L().byId.get(m.sm.id);
    const patch = { rules: [[R(1)], [R(2, 3)], [ANY]], mode: 'rr' };
    const r = g.setCfg(m.sm.id, patch); const cmd = sent.find((x) => x.t === 'cmd' && x.c === 'cfg');
    if (!r.ok || !cmd || cmd.d.id !== m.sm.id || JSON.stringify(cmd.d.patch) !== JSON.stringify(patch)) bad.push('the guest did not send the validated patch: ' + JSON.stringify(cmd));
    if (JSON.stringify(gsm().rules) === JSON.stringify(patch.rules)) bad.push('the guest changed its own copy before the host answered');
    // a patch the guest can tell is bad never leaves the machine
    sent.length = 0; const nope = g.setCfg(m.sm.id, { rules: [[ANY, NONE], [], []] }); if (nope.ok && sent.some((x) => x.c === 'cfg')) bad.push('two rules on a smart output were sent: ' + JSON.stringify(nope));
    // the host: run the guest's command; it must answer with ent- then ent+
    const hostCmd = json(cmd); toGuest([], UPB);
    done(); X.setup(UPB); role('host'); cap(); const h2 = buildHost(); sent.length = 0;
    g.netMessage({ t: 'cmd', c: 'cfg', d: { id: h2.sm.id, patch: json(patch) } });
    if (JSON.stringify(h2.sm.rules) !== JSON.stringify(patch.rules) || h2.sm.mode !== 'rr') bad.push('the host did not apply it: ' + JSON.stringify(h2.sm.rules));
    const minus = sent.findIndex((x) => x.t === 'ent-' && x.id === h2.sm.id), plus = sent.findIndex((x) => x.t === 'ent+' && x.ent.id === h2.sm.id);
    if (minus < 0 || plus < minus) bad.push('the host must send ent- then ent+: ' + JSON.stringify(sent.map((x) => x.t)));
    else if (JSON.stringify(sent[plus].ent.rules) !== JSON.stringify(patch.rules)) bad.push('ent+ does not carry the new rules');
    const hostMsgs = json(sent); const snap = JSON.stringify(h2.sm.rules);
    // a guest takes the host's answer
    toGuest([{ t: 'ent+', ent: stripOf(h2.sm, 'rules', [[R(3)], [ANY], [ANY]]) }]);
    for (const x of hostMsgs) if ((x.t === 'ent-' || x.t === 'ent+') && (x.id === h2.sm.id || (x.ent && x.ent.id === h2.sm.id))) g.netMessage(json(x));
    const gv = L().byId.get(h2.sm.id); if (!gv || JSON.stringify(gv.rules) !== snap || !L().objs.get(gv.id)) bad.push('the guest copy was not refreshed: ' + JSON.stringify(gv && gv.rules));
    void hostCmd; return bad.length === 0 || bad.join('; ');
  });

  await T('mp.split.guest-copy-and-paste-goes-through-cfg', async () => {
    X.setup(UPB); role('host'); cap(); const m = buildHost(); const msgs = ofType('ent+').map((e) => e); const last = new Map(); for (const e of msgs) last.set(e.ent.id, e);
    toGuest([...last.values()]); const bad = [];
    const a = L().byId.get(m.sm.id), b = L().byId.get(m.pg.id);
    if (!g.copyCfg(a)) return 'the guest could not copy';
    sent.length = 0; const r = g.pasteCfg(b); const cmd = sent.find((x) => x.t === 'cmd' && x.c === 'cfg');
    if (!r.ok || !cmd || cmd.d.id !== b.id || !cmd.d.patch.rules || cmd.d.patch.lanes !== undefined) bad.push('paste did not send a cfg command: ' + JSON.stringify(cmd));
    if (JSON.stringify(b.rules) !== JSON.stringify(last.get(b.id).ent.rules)) bad.push('the guest changed its own copy');
    const c = L().byId.get(m.pm.id); sent.length = 0; const r2 = g.pasteCfg(c); if (r2.ok && sent.some((x) => x.c === 'cfg' && x.d.id === c.id && x.d.patch.rules)) bad.push('rules were sent for a merger');
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.split.guest-places-and-converts-through-the-host', async () => {
    X.setup(UPB); const bad = [], i = toI(-6.6), k = toK(1.2);
    X.lay(1, 1, i, k, 0); const tile = L().tileAt(i, 0, k); tile.items = [{ sp: RAR(1), vr: 0, t: 0.3 }];
    S().items.ssplit = 2; S().items.merger = 1; g.rebuildTools(); const n0 = S().entities.length;
    role('guest'); cap();
    const r = await K0.put('ssplit', { x: -6.6, z: 1.2, dir: 0 }); const cmd = sent.find((x) => x.t === 'cmd' && x.c === 'place');
    if (!r.ok || !cmd || cmd.d.tool.kind !== 'ssplit' || cmd.d.tool.id !== 'ssplit' || cmd.d.ent.type !== 'convertbelt' || cmd.d.ent.id !== tile.id) return 'the guest plan: ' + JSON.stringify([r.ok, r.why, cmd && cmd.d]);
    if (S().entities.length !== n0 || S().items.ssplit !== 2 || !L().byId.has(tile.id)) bad.push('the guest changed its own world before the host answered');
    // the host runs the command
    done(); role('host'); cap(); g.netMessage(json(cmd));
    const t = L().tileAt(i, 0, k);
    if (!t || !t.smart || t.tier !== 1 || t.items.length !== 1 || L().byId.has(tile.id)) bad.push('the host after the conversion: ' + JSON.stringify(t && { s: t.smart, tier: t.tier, items: t.items.length }));
    if (S().items.ssplit !== 1) bad.push('the host took ' + (2 - S().items.ssplit) + ' items');
    const mi = sent.findIndex((x) => x.t === 'ent-' && x.id === tile.id), pi = sent.findIndex((x) => x.t === 'ent+' && x.ent.smart === 1);
    if (mi < 0 || pi < mi) bad.push('the host must send ent- (the old belt) then ent+ (the new part): ' + JSON.stringify(sent.map((x) => x.t)));
    if (S().entities.length !== n0) bad.push('entity count ' + S().entities.length + ' vs ' + n0);
    // a floor placement of a merger
    done(); role('guest'); cap(); const r2 = await K0.put('merger', { x: -9, z: 3.6, dir: 1 }); const cmd2 = sent.find((x) => x.t === 'cmd' && x.c === 'place');
    done(); role('host'); cap(); if (cmd2) g.netMessage(json(cmd2)); const made = ofType('ent+').map((x) => x.ent).find((x) => x.merger === true);
    if (!r2.ok || !made || made.dir !== 1 || made.tier !== undefined) bad.push('the merger on the floor: ' + JSON.stringify([r2.ok, r2.why, made]));
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.split.a-guest-cannot-forge-parts-or-settings', async () => {
    X.setup(UPB); const bad = [], i = X.i0() + 2, k = X.k0() + 6; role('host'); cap();
    const lift = g.placeEntity('belt', { i, j: 0, k, dir: 0, rise: 0, lift: { h: 3 }, items: [] }, { quiet: true, rebuild: false });
    const hose = X.lay(0, 1, i + 3, k, 0, 0, { hose: true })[0], gate = X.lay(0, 1, i + 5, k, 0, 0, { detector: true })[0], ramp = X.lay(0, 1, i + 7, k, 0, 0, { rise: 1 })[0], plain = X.lay(0, 1, i + 9, k, 0)[0];
    const sm = X.part('ssplit', i, k + 4, 0), mg = X.part('merger', i + 3, k + 4, 0), pm = X.part('pmerger', i + 6, k + 4, 0);
    S().items.ssplit = 5; S().items.psplit = 5; S().items.merger = 5; S().items.pmerger = 5; S().items.splitter = 5; S().items.belt = 5;
    const n0 = S().entities.length, snap = () => JSON.stringify([S().entities.map((e) => [e.id, e.type, e.i, e.k, e.merger, e.smart, e.rules, e.lanes, e.mode, e.prio, e.def, e.tier]), S().items, S().money]), was = snap();
    const place = (tool, ent) => { sent = []; g.netMessage({ t: 'cmd', c: 'place', d: json({ tool, ent }) }); };
    const conv = (id, extra = {}) => ({ type: 'convertbelt', id, i, j: 0, k, dir: 0, rise: 0, ...extra });
    const cases = {
      'convert a lift': [{ id: 'ssplit', kind: 'ssplit' }, conv(lift.id)], 'convert a hose': [{ id: 'ssplit', kind: 'ssplit' }, conv(hose.id)], 'convert a gate': [{ id: 'merger', kind: 'merger' }, conv(gate.id)], 'convert a ramp': [{ id: 'merger', kind: 'merger' }, conv(ramp.id)],
      'convert a smart splitter into a merger': [{ id: 'merger', kind: 'merger' }, conv(sm.id)], 'convert a smart splitter into a smart splitter': [{ id: 'ssplit', kind: 'ssplit' }, conv(sm.id)], 'downgrade a programmable one': [{ id: 'ssplit', kind: 'ssplit' }, conv(sm.id)],
      'convert nothing': [{ id: 'ssplit', kind: 'ssplit' }, conv(987654)], 'a text id': [{ id: 'ssplit', kind: 'ssplit' }, conv('5')], 'a fractional id': [{ id: 'ssplit', kind: 'ssplit' }, conv(plain.id + 0.5)], 'no id': [{ id: 'ssplit', kind: 'ssplit' }, { type: 'convertbelt', i, j: 0, k, dir: 0 }],
      'a tool whose id and kind differ': [{ id: 'psplit', kind: 'ssplit' }, conv(plain.id)], 'a merger item on a belt tool': [{ id: 'merger', kind: 'belt' }, conv(plain.id)], 'a belt item on a part tool': [{ id: 'belt', kind: 'merger' }, conv(plain.id)], 'an unknown part': [{ id: 'xsplit', kind: 'xsplit' }, conv(plain.id)],
      'a bad entity type': [{ id: 'ssplit', kind: 'ssplit' }, { type: 'lift', i, j: 0, k, dir: 0 }], 'no entity': [{ id: 'ssplit', kind: 'ssplit' }, null], 'an entity that is a number': [{ id: 'ssplit', kind: 'ssplit' }, 5], 'a tierbelt for a part': [{ id: 'ssplit', kind: 'ssplit' }, { type: 'tierbelt', id: plain.id, i, j: 0, k, dir: 0, rise: 0, tier: 2 }],
      'a floor cell outside the hall': [{ id: 'merger', kind: 'merger' }, { type: 'belt', i: -4, j: 0, k, dir: 0 }], 'a floor cell with a text coordinate': [{ id: 'merger', kind: 'merger' }, { type: 'belt', i: 'x', j: 0, k, dir: 0 }], 'a bad direction': [{ id: 'merger', kind: 'merger' }, { type: 'belt', i: i + 12, j: 0, k, dir: 9 }],
      'an occupied cell': [{ id: 'merger', kind: 'merger' }, { type: 'belt', i, j: 0, k: k + 4, dir: 0 }],
    };
    for (const [name, [tool, ent]] of Object.entries(cases)) {
      place(tool, ent);
      if (snap() !== was) { bad.push(name + ' changed the world'); X.cleanup(); break; }
    }
    // extra fields on a good floor placement are ignored: the host builds the fields itself
    place({ id: 'merger', kind: 'merger' }, { type: 'belt', i: i + 12, j: 0, k, dir: 0, smart: 2, rules: [[ANY, ANY], [], []], lanes: [0, 0, 0], tier: 5, merger: 'prio', items: [{ sp: 1, vr: 0, t: 0 }] });
    const made = S().entities.find((e) => e.i === i + 12 && e.k === k);
    if (!made || made.merger !== true || made.smart || made.rules || made.lanes || made.tier || (made.items || []).length) bad.push('a forged field survived: ' + JSON.stringify(made));
    // locked parts cannot be placed, even with the item
    S().up.smartSplit = 0; g.T = g.tune(); place({ id: 'ssplit', kind: 'ssplit' }, conv(plain.id)); if (L().byId.get(plain.id).smart) bad.push('a locked Smart Splitter was placed');
    S().up.smartSplit = 1; g.T = g.tune();
    // settings
    const cfgCases = {
      'an unknown key': [sm.id, { evil: 1 }], 'rules on a merger': [pm.id, { rules: [[ANY], [ANY], [ANY]] }], 'lanes on a splitter': [sm.id, { lanes: [0, 1, 2] }], 'settings on a plain merger': [mg.id, { lanes: [0, 1, 2] }], 'settings on a belt': [plain.id, { rules: [[ANY], [ANY], [ANY]] }],
      'two rules on a smart output': [sm.id, { rules: [[ANY, NONE], [], []] }], 'a smart splitter with a default output': [sm.id, { def: 0 }], 'a bad lane list': [pm.id, { lanes: [1, 1, 1] }], 'a bad order list': [sm.id, { prio: [3, 0, 1] }], 'a prototype key': [sm.id, JSON.parse('{"__proto__":{"smart":2}}')],
      'a species the game does not have': [sm.id, { rules: [[{ k: 'species', v: 9999 }], [], []] }], 'a rarity range upside down': [sm.id, { rules: [[{ k: 'rarity', v: 5, w: 1 }], [], []] }], 'promote itself': [sm.id, { smart: 2 }], 'make a belt a merger': [plain.id, { merger: true }],
    };
    const was2 = snap();
    for (const [name, [id, patch]] of Object.entries(cfgCases)) {
      sent = []; g.netMessage({ t: 'cmd', c: 'cfg', d: json({ id, patch }) });
      if (snap() !== was2) { bad.push(name + ' changed the world'); break; }
      if (sent.some((x) => x.t === 'ent+' || x.t === 'ent-')) bad.push(name + ' was announced');
      if (!sent.some((x) => x.t === 'toast')) bad.push(name + ' gave the guest no reason');
    }
    if (({}).smart !== undefined) bad.push('the prototype was polluted');
    void n0; return bad.length === 0 || bad.join('; ');
  });

  await T('mp.split.late-joiner-sees-every-part-and-the-host-wins-races', async () => {
    X.setup(UPB); role('host'); cap(); const m = buildHost(); X.run(0.2, () => {}); sent = [];
    g.sendWorld(); const batches = ofType('ents'); if (!batches.length) return 'the host sent no ents batch';
    const all = batches.flatMap((b) => b.list); const mine = [m.sm, m.pg, m.pm, m.mg].map((t) => all.find((e) => e.id === t.id)); if (mine.some((e) => !e)) return 'a part is missing from the batch';
    const hostViews = views(); const msgs = json(batches);
    toGuest(msgs); X.run(0.1, () => {}); const bad = diffViews(hostViews, views());
    for (const e of mine) if (e.items !== undefined) bad.push('plush travel in the ents batch');
    // the guest never simulates: plush waiting at the end of a lane stay there
    const gm = L().byId.get(m.mg.id); g.remoteEnt({ id: 99001, type: 'belt', i: gm.i - 1, j: 0, k: gm.k, dir: gm.dir, rise: 0 }); const lane = L().byId.get(99001); if (!lane) return 'no view belt'; lane.items = [{ sp: RAR(0), vr: 0, t: 1 }]; L().visualOnly = true;
    X.run(1, () => {}); if (lane.items.length !== 1 || gm.items.length !== 0) bad.push('the guest handed a plush on by itself');
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.split.host-merger-and-splitter-agree-with-what-the-guest-draws', async () => {
    // the plush the guest draws on a merger and a ruled splitter sit where the host says (same cells, same corner arcs)
    X.setup(UPB); role('host'); cap(); const r3 = X.rig3('pmerger', 0, { lanes: [1, 0, 2] }), rs = X.rigS('ssplit'); g.setCfg(rs.s, { rules: [[R(3)], [ANY], [NONE]] });
    X.run(2, () => { r3.lanes.forEach((t, n) => X.feedAll(t, RAR(0, n))); X.feedAll(rs.feed[0], RAR(4, 1)); });
    const itemsAt = () => { const a = []; L().forEachItem((it, x, y, z) => a.push([+x.toFixed(3), +y.toFixed(3), +z.toFixed(3)])); return a.sort((u, v) => u[0] - v[0] || u[1] - v[1] || u[2] - v[2]); };
    L().rebuildBelts(); const hostPos = itemsAt();
    const ents = ofType('ent+'); const last = new Map(); for (const e of ents) last.set(e.ent.id, e);
    sent = []; ctx.p().pos.set(cellX(X.i0()), 0, cellZ(X.k0())); g.remote = { pos: ctx.p().pos.clone() }; g.sendDyn(); g.remote = null; const dyn = json(ofType('dyn')[0]);
    toGuest([...last.values()]); L().update(0.01); g.applyDyn(dyn); L().rebuildBelts();
    const guestPos = itemsAt();
    if (guestPos.length !== hostPos.length) return `guest shows ${guestPos.length} plush, host ${hostPos.length}`;
    for (let n = 0; n < hostPos.length; n++) for (let q = 0; q < 3; q++) if (Math.abs(hostPos[n][q] - guestPos[n][q]) > 0.03) return `plush ${n} differs: host ${hostPos[n]} guest ${guestPos[n]}`;
    return true;
  });
  void UP; void SR;
}
