// Multiplayer parity for hand-wired power cables, no network: one page plays both roles by switching g.net.role and capturing g.netSend.
// The host owns and simulates the cables; the guest sends a command to wire or unwire and draws the host's list. A wire in hand is local.
import * as THREE from 'three';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, L, fresh, adv, tiles, craft, selectTool, aimPoint, cellX, cellZ, toI, toK } = ctx;
  const up = { power: 1, belts: 1 };
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; delete g.cables.max; role(null); };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = async (fn) => { try { return await fn(); } finally { done(); } };
  const bareTest = (name, fn) => T(name, () => guard(fn));
  const mk = (type, x, z) => { const e = { id: g.nextId(), type, i: toI(x), j: 0, k: toK(z), dir: 0, rise: 0 }; if (type === 'belt') e.items = []; S().entities.push(e); g.addEntity(e); return L().byId.get(e.id); };
  const mkGen = (x, z) => { const t = mk('gen', x, z); t.burn = 1e5; t.burnMax = 1e5; t.lit = true; return t; };
  const look = (x, y, z, back = 2.0) => { aimPoint(x, y, z, back); adv(0.06); };
  const lookAt = (t) => look(cellX(t.i), 0.3, cellZ(t.k));
  const colorOf = (n = 0) => { const c = new THREE.Color(); g.cables.mesh.getColorAt(n, c); return c; };
  const kind = (c) => (c.g >= c.r && c.g >= c.b ? 'green' : c.r > c.g * 3 ? 'red' : 'orange');
  let bayCleared = false;
  const clearBay = () => { if (bayCleared) return; bayCleared = true; const w = ctx.w(); for (let i = toI(-14); i <= toI(11); i++) for (let k = toK(-1); k <= toK(10); k++) for (let j = 0; j < 12; j++) if (w.get(i, j, k)) w.removeCell(i, j, k, false); };
  const clean = () => { clearBay(); fresh(up); S().cables = []; g.cables.reset(); };
  // the host world as the guest receives it, then a guest page with nothing in it
  const hostWorld = () => ({ ents: S().entities.filter((e) => !e.free).map((e) => json(g.stripEnt(e))), cables: json(S().cables.map((c) => ({ id: c.id, a: c.a, b: c.b }))) });
  const toGuest = (hw) => { done(); clean(); role('guest'); cap(); g.netMessage({ t: 'ents', list: hw.ents }); g.netMessage({ t: 'cables', list: hw.cables }); g.cables.update(0.5); };
  // put the host's two objects back after the page played the guest (same ids), as the real host still has them
  const clean2 = (G, B) => { clean(); for (const t of [G, B]) { const e = { ...t }; if (t.type === 'belt') e.items = []; S().entities.push(e); g.addEntity(e); } S().items.cable = 3; };

  const hostSetup = () => { clean(); role('host'); cap(); const G = mkGen(-9, 3), B = mk('belt', 3, 3); S().items.cable = 3; return { G, B }; };

  await bareTest('mp.cables.guest-click-sends-one-command-the-wire-in-hand-stays-local', async () => {
    const { G, B } = hostSetup(); const hw = hostWorld(); toGuest(hw); const GG = L().byId.get(G.id), BB = L().byId.get(B.id); if (!GG || !BB) return 'guest has no copies';
    S().items.cable = 3; g.rebuildTools(); selectTool('cable'); adv(0.2); sent = [];
    lookAt(GG); g.cables.click(g.curTool()); lookAt(BB); adv(0.06); if (g.cables.from !== GG.id) return 'guest wire not in hand'; if (!g.cables.preview) return 'guest sees no wire following the crosshair';
    if (sent.some((m) => m.t === 'cmd')) return 'the wire in progress was sent to the host: ' + JSON.stringify(sent);
    g.cables.click(g.curTool()); const c = sent.filter((m) => m.t === 'cmd' && m.c === 'cable'); if (c.length !== 1 || c[0].d.a !== G.id || c[0].d.b !== B.id) return 'wrong command: ' + JSON.stringify(sent);
    if (S().cables.length) return 'guest wired it itself'; if (g.cables.from != null) return 'wire still in hand after the click';
    done(); role('host'); cap(); clean2(G, B); g.netMessage(json(c[0])); g.cables.update(0.05);
    const list = ofType('cables'); const hint = ofType('chint');
    if (S().cables.length !== 1 || list.length !== 1 || list[0].list.length !== 1) return `host did not wire and announce: cables ${S().cables.length}, announced ${JSON.stringify(list)}`;
    if (!hint.length || !hint[0].good || !/Wired/.test(hint[0].text)) return 'guest was not told: ' + JSON.stringify(hint);
    return (S().items.cable === 2) || 'cable item count ' + S().items.cable;
  });
  await bareTest('mp.cables.guest-draws-the-hosts-cables-the-same-shape-and-the-same-color', async () => {
    const { G, B } = hostSetup(); craft('cable'); g.cables.connect(G.id, B.id); adv(1); g.cables.update(0.5); const segs = g.cables.segCount, hostKind = kind(colorOf(0)), hostCol = colorOf(0).toArray().map((v) => +v.toFixed(2));
    sent = []; g.sendDyn(); const dyn = ofType('dyn')[0]; if (!dyn || !Array.isArray(dyn.cpw) || dyn.cpw.length !== 2) return 'dyn message has no cable power: ' + JSON.stringify(dyn && dyn.cpw);
    const hw = hostWorld(); toGuest(hw);
    if (S().cables.length !== 1 || g.cables.segCount !== segs || segs < 10) return `guest cables ${S().cables.length}, segments ${g.cables.segCount} vs host ${segs}`;
    const before = kind(colorOf(0)); g.netMessage(json(dyn)); g.cables.update(0.5); const after = kind(colorOf(0)), col = colorOf(0).toArray().map((v) => +v.toFixed(2));
    return (hostKind === 'green' && before === 'red' && after === 'green' && JSON.stringify(col) === JSON.stringify(hostCol)) || `host ${hostKind} ${hostCol}, guest before power ${before}, after ${after} ${col}`;
  });

  await bareTest('mp.cables.hover-readout-is-the-same-on-both-screens', async () => {
    const { G, B } = hostSetup(); craft('cable'); g.cables.connect(G.id, B.id); adv(1); const ref = (id) => ({ kind: 'tile', id });
    const h = infoFor(g, ref(B.id)).lines.join('|'); sent = []; g.sendDyn(); const dyn = ofType('dyn')[0]; const hw = hostWorld(); toGuest(hw); g.netMessage(json(dyn)); g.cables.update(0.5);
    const gl = infoFor(g, ref(B.id)).lines.join('|'), gg = infoFor(g, ref(G.id)).lines.join('|'), gc = infoFor(g, { kind: 'cable', id: S().cables[0].id });
    return (/Line of 1 tile powered through a cable at tile .*from Generator/.test(h) && /Line of 1 tile powered through a cable at tile .*from Generator/.test(gl) && /Cables 1 of 4: Belt/.test(gg) && gc && /POWER CABLE/.test(gc.title) && gc.lit) || `host "${h}" guest "${gl}" / "${gg}" ${JSON.stringify(gc)}`;
  });

  await bareTest('mp.cables.late-joiner-gets-every-cable-with-the-world', async () => {
    const { G, B } = hostSetup(); const B2 = mk('belt', 3, 4.2), P = mk('pole', -8, 3.6), P2 = mk('pole', 4, 3.6); craft('cable', 3); g.cables.connect(G.id, B.id); g.cables.connect(G.id, B2.id); g.cables.connect(P.id, P2.id); sent = [];
    g.sendWorld(); const kinds = sent.map((m) => m.t); const ci = kinds.indexOf('cables'), ei = kinds.lastIndexOf('ents'), ri = kinds.indexOf('ready');
    if (ci < 0) return 'sendWorld did not send the cables: ' + kinds.join(); if (!(ei < ci && ci < ri)) return 'cables must come after the entities and before ready: ' + kinds.join();
    return (sent[ci].list.length === 3) || 'sent ' + sent[ci].list.length + ' cables';
  });

  await bareTest('mp.cables.guest-hammer-on-the-wire-asks-the-host-to-remove-it', async () => {
    const { G, B } = hostSetup(); craft('cable'); g.cables.connect(G.id, B.id); adv(1); const hw = hostWorld(); const rec = S().cables[0]; toGuest(hw);
    const pts = g.cables.curve(g.cables.attach(L().byId.get(G.id)), g.cables.attach(L().byId.get(B.id))), mid = pts[6]; selectTool('hammer'); look(mid[0], mid[1], mid[2], 2); sent = [];
    g.deconstruct(); const c = sent.find((m) => m.t === 'cmd' && m.c === 'decon'); if (!c || c.d.kind !== 'cable' || c.d.id !== rec.id) return 'guest hammer sent ' + JSON.stringify(sent);
    if (S().cables.length !== 1) return 'guest removed it by itself';
    done(); clean2(G, B); S().cables = [{ id: rec.id, a: G.id, b: B.id }]; S().items.cable = 0; role('host'); cap(); g.netMessage(json(c)); g.cables.update(0.05);
    const list = ofType('cables'); return (S().cables.length === 0 && S().items.cable === 1 && list.length === 1 && list[0].list.length === 0) || `host cables ${S().cables.length}, item ${S().items.cable}, announced ${JSON.stringify(list)}`;
  });

  await bareTest('mp.cables.host-refuses-a-wire-that-is-too-far-or-has-no-cable-and-says-why', async () => {
    const { G, B } = hostSetup(); g.cables.max = () => 8; sent = [];
    g.netMessage({ t: 'cmd', c: 'cable', d: { a: G.id, b: B.id } }); const h = ofType('chint'); if (S().cables.length || !h.length || h[0].good || !/Too far/.test(h[0].text)) return 'too far: ' + JSON.stringify([S().cables.length, h]);
    delete g.cables.max; S().items.cable = 0; sent = []; g.netMessage({ t: 'cmd', c: 'cable', d: { a: G.id, b: B.id } }); const h2 = ofType('chint'); if (S().cables.length || !h2.length || h2[0].good || !/no Power Cable/.test(h2[0].text)) return 'no cable: ' + JSON.stringify([S().cables.length, h2]);
    sent = []; S().items.cable = 1; g.netMessage({ t: 'cmd', c: 'cable', d: { a: 999999, b: B.id } }); const h3 = ofType('chint'); return (S().cables.length === 0 && h3.length === 1 && !h3[0].good) || 'unknown object: ' + JSON.stringify(h3);
  });

  await bareTest('mp.cables.removing-a-machine-on-the-host-clears-the-cable-on-the-guest', async () => {
    const { G, B } = hostSetup(); craft('cable'); g.cables.connect(G.id, B.id); adv(1); g.doDecon({ kind: 'tile', id: B.id }); g.cables.update(0.05);
    const list = ofType('cables'); const last = list[list.length - 1]; if (!last || last.list.length !== 0) return 'host did not announce the empty list: ' + JSON.stringify(list);
    const hw = { ents: [json(g.stripEnt(G))], cables: [{ id: 1234, a: G.id, b: B.id }] }; toGuest(hw); if (g.cables.mesh.count !== 0) return 'guest drew a wire with a missing end: ' + g.cables.mesh.count;
    g.netMessage({ t: 'cables', list: last.list }); g.cables.update(0.5); return (S().cables.length === 0 && g.cables.mesh.count === 0) || 'guest still has ' + S().cables.length;
  });
}
