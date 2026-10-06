// mp.power.*: the power parts in multiplayer, no network: one page plays both roles by switching g.net.role and capturing g.netSend.
// The host solves the grids and owns every setting; a guest asks through `cfg`, `place` and `decon`, draws the host's ents and reads the 0.5 s `xrow` of the
// power parts (grids, charge, lamps, trips). Screens must agree: same lamps, same hover text, same grid numbers.
import { makeKit, UP } from './power_lib.js';
import * as PP from '../powerparts.js';
import * as EXT from '../ext.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, L, adv, fresh } = ctx;
  const K = makeKit(ctx);
  const { reset, grid, part, wire, json } = K;
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const NOISE = new Set(['pos', 'bodies', 'shared', 'time']);
  const cap = () => { sent = []; g.netSend = (m) => { if (!NOISE.has(m.t)) sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); } });
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const hostWorld = () => ({ ents: S().entities.filter((e) => !e.free).map((e) => json(g.stripEnt(e))), cables: json(S().cables.map((c) => ({ id: c.id, a: c.a, b: c.b }))) });
  const toGuest = (hw) => { done(); reset(UP, false); role('guest'); cap(); g.netMessage({ t: 'ents', list: hw.ents }); g.netMessage({ t: 'cables', list: hw.cables }); g.cables.update(0.5); };
  const rowMsg = () => { g._extRow = 0; sent = []; EXT.update(g, 0.1, false); return ofType('xrow').find((m) => m.k === 'switch'); };
  const entOf = (id) => (g.machines.items.get(id) || {}).ent;
  const info = (id) => infoFor(g, { kind: 'mach', id });
  const noGraph = (r) => (r ? { title: r.title, lit: r.lit, lines: r.lines.filter((l) => !/^(Supply|Demand) {1,2}[▁-█]/.test(l)) } : r);

  // a host world with every part in a state worth comparing: a grid with a gen, fans, a switch to a branch, a breaker, a battery and a meter
  const build = () => {
    reset(UP, false); K.small(); role('host'); cap();
    const A = grid(-12, 3, { gens: 1, fans: 2 }), B = grid(2, 3, { fans: 1 });
    const sw = part('switch', -5, 7, { prio: 3, on: true, name: 'Annex' }), br = part('breaker', -12, 5.4, { name: 'Main' }), bt = part('battery', -11, 5.4, { mark: 2, charge: 360000 }), mt = part('meter', -13.4, 5.4);
    wire(sw, A.pole); wire(sw, B.pole); wire(mt, A.pole);
    adv(3);
    return { A, B, sw, br, bt, mt };
  };

  await guard('mp.power.switch-breaker-battery-sync', async () => {
    const W = build(), bad = [];
    const hostInfo = {}; for (const k of ['sw', 'br', 'bt', 'mt']) hostInfo[k] = noGraph(info(W[k].id));
    const hostPole = infoFor(g, { kind: 'tile', id: W.A.pole.id });
    const hostLamp = {}; for (const k of ['sw', 'br', 'bt', 'mt']) hostLamp[k] = PP.lampOf(g, W[k]);
    const hostNet = g.power.netOfEnt(W.A.pole), hostHud = g.power.nearest(-12, 1, 3);
    sent = []; g.sendDyn(); const dyn = ofType('dyn')[0]; const hw = hostWorld(), row = rowMsg(); if (!row) return 'the host sent no xrow for the power parts';
    const ids = { sw: W.sw.id, br: W.br.id, bt: W.bt.id, mt: W.mt.id }, poleId = W.A.pole.id;
    toGuest(hw);
    for (const k of Object.keys(ids)) if (!entOf(ids[k])) return `the guest has no ${k}`;
    for (let n = 0; n < 4; n++) g.netMessage(json(row));
    if (dyn) { g.netMessage(json(dyn)); g.cables.update(0.5); }   // the cable power the guest also gets every frame
    for (const k of Object.keys(ids)) { const e = entOf(ids[k]); if (!e.view) bad.push(k + ' is not a view ent'); }
    const s = entOf(ids.sw), b = entOf(ids.br), t = entOf(ids.bt), m = entOf(ids.mt);
    if (s.on !== true || s.prio !== 3 || s.name !== 'Annex' || s.shed !== W.sw.shed) bad.push('switch fields on the guest: ' + JSON.stringify([s.on, s.prio, s.name, s.shed]));
    if (b.tripped !== false || b.trip.delay !== 3 || b.name !== 'Main') bad.push('breaker fields ' + JSON.stringify(b));
    if (t.mark !== 2 || t.charge !== 360000) bad.push('battery fields ' + JSON.stringify([t.mark, t.charge]));
    for (const k of ['sw', 'br', 'bt', 'mt']) {
      const lamp = PP.lampOf(g, entOf(ids[k])); if (lamp !== hostLamp[k]) bad.push(`${k} lamp: host ${hostLamp[k]}, guest ${lamp}`);
      const gi = noGraph(info(ids[k])); if (JSON.stringify(gi) !== JSON.stringify(hostInfo[k])) bad.push(`${k} readout differs:\n host  ${JSON.stringify(hostInfo[k])}\n guest ${JSON.stringify(gi)}`);
    }
    const gp = infoFor(g, { kind: 'tile', id: poleId }); if (JSON.stringify(gp.lines.filter((l) => /rated/.test(l))) !== JSON.stringify(hostPole.lines.filter((l) => /rated/.test(l)))) bad.push('pole summary differs: ' + JSON.stringify([hostPole.lines, gp.lines]));
    const gn = g.power.nearest(-12, 1, 3); if (!gn || !near(gn.supply, hostNet.supply, 0.01) || !near(gn.demand, hostNet.demand, 0.01) || !near(gn.cap, hostNet.cap, 0.01) || gn.id !== hostNet.id) bad.push('the guest grid differs: ' + JSON.stringify(gn && { s: gn.supply, d: gn.demand, c: gn.cap }) + ' vs ' + JSON.stringify({ s: hostNet.supply, d: hostNet.demand, c: hostNet.cap }));
    if (hostHud && gn && gn.nodes.length !== hostHud.nodes.length) bad.push('node lists differ');
    // the guest builds its own minute of history from the rows
    if (!gn.hist || gn.hist.len < 4) bad.push('no history on the guest: ' + (gn.hist && gn.hist.len));
    return bad.length === 0 || bad.join(' | ');
  });

  await guard('mp.power.row-is-compact-sent-twice-a-second-and-ends-cleanly', async () => {
    const W = build(), bad = []; void W;
    const row = rowMsg(); if (!row) return 'no row'; const size = JSON.stringify(row).length; if (size > 1600) bad.push('row is ' + size + ' bytes for 2 grids and 4 parts');
    if (!Array.isArray(row.d.n) || !Array.isArray(row.d.e) || row.d.e.length !== 4) bad.push('row shape ' + JSON.stringify(row.d).slice(0, 120));
    sent = []; EXT.update(g, 0.2, false); EXT.update(g, 0.2, false); if (ofType('xrow').length) bad.push('rows faster than every 0.5 s');
    EXT.update(g, 0.2, false); if (ofType('xrow').filter((m) => m.k === 'switch').length !== 1) bad.push('exactly one row per 0.5 s expected');
    // no ent+/ent- churn from the charge changing every tick
    sent = []; adv(2); if (ofType('ent+').length || ofType('ent-').length) bad.push('a battery or breaker tick announced ents');
    // all parts gone: one empty row, then nothing
    for (const e of [...S().entities]) if (PP.isPart(e.type)) g.doDecon({ kind: 'mach', id: e.id });
    g.power.recompute(); g._extRow = 0; sent = []; EXT.update(g, 0.1, false); const r1 = ofType('xrow').filter((m) => m.k === 'switch'); if (r1.length !== 1 || r1[0].d.n.length !== 0 || r1[0].d.e.length !== 0) bad.push('first row after the last part is gone should be empty: ' + JSON.stringify(r1));
    g._extRow = 0; sent = []; EXT.update(g, 0.1, false); if (ofType('xrow').some((m) => m.k === 'switch')) bad.push('rows keep coming with no parts');
    return bad.length === 0 || bad.join(' | ');
  });

  await guard('mp.power.guest-toggles-a-switch-through-cfg-and-the-host-joins-the-grids', async () => {
    reset(UP, false); K.small(); role('host'); cap(); const bad = [];
    const A = grid(-10, 3, { gens: 1, fans: 1 }), B = grid(8, 3, { fans: 2 }), sw = part('switch', -1, 3); wire(sw, A.pole); wire(sw, B.pole); adv(1);
    if (!K.nonePowered(B)) return 'setup: B should be dark';
    const hw = hostWorld(), id = sw.id; toGuest(hw);
    const r = g.setCfg(id, { on: true }); const cmd = sent.find((m) => m.t === 'cmd' && m.c === 'cfg'); if (!r.ok || !cmd || cmd.d.id !== id || JSON.stringify(cmd.d.patch) !== '{"on":true}') bad.push('the guest did not send the patch: ' + JSON.stringify(cmd));
    if (entOf(id).on) bad.push('the guest closed it on its own screen first');
    // E on the guest does the same through use()
    // the host runs it as the guest
    done(); reset(UP, false); K.small(); role('host'); cap();
    const A2 = grid(-10, 3, { gens: 1, fans: 1 }), B2 = grid(8, 3, { fans: 2 }), sw2 = part('switch', -1, 3); wire(sw2, A2.pole); wire(sw2, B2.pole); adv(1);
    sent = []; g.netMessage({ t: 'cmd', c: 'cfg', d: { id: sw2.id, patch: { on: true } } }); adv(0.5);
    if (!sw2.on || !K.allPowered(B2)) bad.push('the host did not close the switch for the guest: ' + sw2.on + ' ' + K.nearFans(B2));
    const minus = sent.findIndex((m) => m.t === 'ent-' && m.id === sw2.id), plus = sent.findIndex((m) => m.t === 'ent+' && m.ent.id === sw2.id); if (minus < 0 || plus < minus || sent[plus].ent.on !== true) bad.push('host must announce ent- then ent+ with on: ' + JSON.stringify(sent.map((m) => m.t)));
    // the other screen: the switch comes back closed with its lamp green, and the row says the branch is powered
    const hw2 = hostWorld(), msgs = sent.filter((m) => m.t === 'ent+' && m.ent.id === sw2.id).map(json), row = rowMsg(); toGuest(hw2);
    for (const m of msgs) { g.netMessage({ t: 'ent-', id: sw2.id }); g.netMessage(m); }
    g.netMessage(json(row)); const gs = entOf(sw2.id); if (!gs || !gs.on || PP.lampOf(g, gs) !== 'green') bad.push('guest switch ' + JSON.stringify(gs && { on: gs.on, lamp: PP.lampOf(g, gs) }));
    return bad.length === 0 || bad.join(' | ');
  });

  await guard('mp.power.guest-cannot-force-a-shed-or-a-trip-and-the-host-checks-every-reset', async () => {
    reset(UP, false); K.small(); role('host'); cap(); const bad = [];
    const M = grid(-12, 3, { gens: 1, fans: 1 }), B = grid(-4, 3, { fans: 3 }); const ps = part('switch', -8, 7.4, { prio: 1, on: true }); wire(ps, M.pole); wire(ps, B.pole);
    const br = part('breaker', -12, 5.4); const bt = part('battery', 9, 8, { mark: 1 }); adv(1.5);   // the battery stands alone: it never charges, so any charge would be the guest's
    if (!ps.shed) return 'setup: no shed';
    const cmd = (id, patch) => { sent = []; g.netMessage({ t: 'cmd', c: 'cfg', d: { id, patch } }); return { announced: ofType('ent+').length + ofType('ent-').length, toast: ofType('toast')[0] }; };
    let r = cmd(ps.id, { shed: true }); if (r.announced || !r.toast) bad.push('guest forced a shed: ' + JSON.stringify(r));
    r = cmd(ps.id, { shed: false }); if (r.announced || !r.toast || !/overloaded/.test(r.toast.text) || !ps.shed) bad.push('reset allowed while overloaded: ' + JSON.stringify(r));
    r = cmd(br.id, { tripped: true }); if (r.announced || br.tripped) bad.push('guest forced a trip');
    r = cmd(bt.id, { charge: 36000 }); if (r.announced || bt.charge !== 0) bad.push('guest set a battery charge');
    r = cmd(bt.id, { mark: 3 }); if (r.announced || bt.mark !== 1) bad.push('guest changed a battery mark');
    r = cmd(ps.id, { prio: 99 }); if (r.announced || ps.prio !== 1) bad.push('guest set group 99');
    r = cmd(ps.id, { prio: 5, name: 'Guest wing' }); if (!r.announced || ps.prio !== 5 || ps.name !== 'Guest wing') bad.push('a legal change was refused: ' + JSON.stringify(r));
    // a legal reset once there is surplus
    K.gen(-13.2, 4.2); adv(0.6); r = cmd(ps.id, { shed: false }); if (!r.announced || ps.shed) bad.push('the guest could not reset after surplus came back: ' + JSON.stringify(r));
    // and a trip reset
    const bk = part('breaker', -11, 5.0); bk.tripped = true; g.power.markDirty(); adv(0.2); r = cmd(bk.id, { tripped: false }); if (!r.announced || bk.tripped) bad.push('breaker reset by a guest: ' + JSON.stringify(r));
    return bad.length === 0 || bad.join(' | ');
  });

  await guard('mp.power.guest-places-and-takes-down-parts-through-place-and-decon', async () => {
    reset(ALL(), false); role('host'); cap(); const bad = [];
    const place = (tool, ent) => { sent = []; g.netMessage({ t: 'cmd', c: 'place', d: { tool, ent } }); return ofType('toast')[0]; };
    S().items['battery:2'] = 1; S().items.switch = 2; S().items.pswitch = 1; g.rebuildTools();
    // a battery: the mark comes from the item, not from what the guest claims
    let t = place({ id: 'battery:2', kind: 'battery', p: { mark: 3 } }, { x: -8, y: 0, z: 4, ry: 0 }); const bt = S().entities.find((e) => e.type === 'battery');
    if (t || !bt || bt.mark !== 2 || bt.charge !== 0 || S().items['battery:2']) bad.push('battery place: ' + JSON.stringify([t, bt, S().items['battery:2']]));
    if (!ofType('ent+').some((m) => m.ent.type === 'battery' && m.ent.mark === 2)) bad.push('the guest was not told about the new battery');
    // the item must match the kind (a cheap switch cannot become a 4M battery)
    t = place({ id: 'switch', kind: 'battery', p: { mark: 3 } }, { x: -6, y: 0, z: 4, ry: 0 }); if (!t || S().entities.filter((e) => e.type === 'battery').length !== 1 || S().items.switch !== 2) bad.push('a switch item built a battery: ' + JSON.stringify(t));
    // one spot, one part; absurd coordinates; a missing priority unlock
    t = place({ id: 'switch', kind: 'switch' }, { x: -8, y: 0, z: 4, ry: 0 }); if (!t || !/already/.test(t.text)) bad.push('stacked on a part: ' + JSON.stringify(t));
    t = place({ id: 'switch', kind: 'switch' }, { x: 1e9, y: 0, z: 4, ry: 0 }); if (!t) bad.push('a spot a billion metres away was accepted');
    t = place({ id: 'switch', kind: 'switch' }, { x: NaN, y: 0, z: 4, ry: 0 }); if (!t) bad.push('NaN accepted');
    t = place({ id: 'pswitch', kind: 'pswitch' }, { x: -3, y: 0, z: 4, ry: 0 }); if (!t || !/Breaker Box/.test(t.text) || S().items.pswitch !== 1) bad.push('a priority switch without both built: ' + JSON.stringify(t));
    t = place({ id: 'switch', kind: 'switch' }, { x: -3, y: 0, z: 4, ry: 0 }); const sw = S().entities.find((e) => e.type === 'switch'); if (t || !sw || sw.on !== false || sw.prio !== undefined || S().items.switch !== 1) bad.push('legal switch place: ' + JSON.stringify([t, sw]));
    // taking it down as a guest: the host removes it, hands the item back and tells the other screen
    sent = []; g.netMessage({ t: 'cmd', c: 'decon', d: { kind: 'mach', id: bt.id } }); if (S().items['battery:2'] !== 1 || g.machines.items.has(bt.id) || !ofType('ent-').some((m) => m.id === bt.id)) bad.push('guest decon of the battery: ' + JSON.stringify([S().items['battery:2'], ofType('ent-')]));
    return bad.length === 0 || bad.join(' | ');
  });

  await guard('mp.power.late-joiner-sees-tripped-charged-and-shed-parts-with-the-right-lamps', async () => {
    reset(UP, false); K.small(); role('host'); cap(); const bad = [];
    const M = grid(-12, 3, { gens: 1, fans: 5 }), B = grid(-4, 3, { fans: 3 }); const ps = part('switch', -8, 7.4, { prio: 2, on: true, name: 'Annex' }); wire(ps, M.pole); wire(ps, B.pole);
    const br = part('breaker', -12, 5.4, { name: 'Main' }), bt = part('battery', -11, 5.4, { mark: 1 }); br.trip.delay = 0.5; adv(3); bt.charge = 777;
    if (!ps.shed || !br.tripped) return `setup: shed ${ps.shed} tripped ${br.tripped}`;
    sent = []; g.sendWorld(); const list = sent.filter((m) => m.t === 'ents').flatMap((m) => m.list), id = { ps: ps.id, br: br.id, bt: bt.id }; const wc = sent.find((m) => m.t === 'cables'); const row = rowMsg();
    const mine = list.filter((e) => PP.isPart(e.type)); if (mine.length !== 3) bad.push('sendWorld carried ' + mine.length + ' parts');
    const jb = mine.find((e) => e.id === id.br); if (!jb || jb.tripped !== true || jb.name !== 'Main' || jb.trip.delay !== 0.5) bad.push('breaker in the ents batch: ' + JSON.stringify(jb));
    const js = mine.find((e) => e.id === id.ps); if (!js || js.shed !== true || js.prio !== 2) bad.push('switch in the ents batch: ' + JSON.stringify(js));
    const jt = mine.find((e) => e.id === id.bt); if (!jt || jt.charge !== 777) bad.push('battery in the ents batch: ' + JSON.stringify(jt));
    if (mine.some((e) => 'cache' in e)) bad.push('runtime cache leaked into the ents batch');
    const hw = { ents: list, cables: wc.list }; toGuest(hw); g.netMessage(json(row));
    const gb = entOf(id.br), gs = entOf(id.ps), gt = entOf(id.bt);
    if (PP.lampOf(g, gb) !== 'red' || PP.lampOf(g, gs) !== 'orange') bad.push(`lamps: breaker ${PP.lampOf(g, gb)}, switch ${PP.lampOf(g, gs)}`);
    if (!/TRIPPED/.test(info(id.br).title) || !/SHED/.test(info(id.ps).title) || !/Charge 777 of 36,000 kJ/.test(info(id.bt).lines.join(' '))) bad.push('guest readouts: ' + [info(id.br).title, info(id.ps).title, info(id.bt).lines[0]]);
    void gt; return bad.length === 0 || bad.join(' | ');
  });

  await guard('mp.power.a-trip-reaches-the-guest-once-with-sound-and-text', async () => {
    reset(UP, false); K.small(); role('host'); cap(); const bad = [];
    const M = grid(-12, 3, { gens: 1, fans: 2 }), br = part('breaker', -12, 5.4); adv(1); void M;
    const hw = hostWorld(), id = br.id; toGuest(hw);
    let thumps = 0; const orig = g.sound.thump; g.sound.thump = () => { thumps++; };
    try {
      const calm = { n: [], e: [[id, 100, 0, 0, 0, -1, 0]] }, tripped = { n: [], e: [[id, 0, 4, 0, 0, -1, 0]] };
      g.netMessage({ t: 'xrow', k: 'switch', d: calm }); if (thumps) bad.push('a calm row clacked');
      g.netMessage({ t: 'xrow', k: 'switch', d: tripped }); if (thumps !== 1 || !entOf(id).tripped || !/GRID TRIPPED/.test(K.hintText())) bad.push('the guest was not alerted: thumps ' + thumps + ' ' + K.hintText());
      g.netMessage({ t: 'xrow', k: 'switch', d: tripped }); if (thumps !== 1) bad.push('the alert repeats every row');
      g.netMessage({ t: 'xrow', k: 'switch', d: calm }); if (entOf(id).tripped) bad.push('the guest still shows tripped after the reset row');
      // junk rows change nothing and throw nothing
      for (const d of [null, 5, 'x', {}, { n: 1, e: [] }, { n: [], e: [[999999, 1, 1, 1, 1, 1, 1]] }, { n: [[1]], e: [[id]] }]) g.netMessage({ t: 'xrow', k: 'switch', d });
    } finally { g.sound.thump = orig; }
    return bad.length === 0 || bad.join(' | ');
  });

  function ALL() { return { ...UP, prioPower: 1 }; }
  void fresh; void L;
}
