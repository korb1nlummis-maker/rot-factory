// Wire-only power in co-op (no network: one page plays both roles by switching g.net.role and capturing g.netSend). The host alone solves the grids; a guest draws the
// host's cables, sees the same grids and readouts, and its cable commands are validated on the host. Prefix `mp.wire.`.
import * as THREE from 'three';
import { infoFor } from '../info.js';
import { poleInfo } from '../gridinfo.js';

export default async function (ctx) {
  const { T, g, S, L, fresh, adv, craft, selectTool, aimPoint, cellX, cellZ, toI, toK } = ctx;
  const up = { power: 1, belts: 1, fans: 1, sorter: 1 };
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); g.remote = null; };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const bare = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); } });
  const mk = (type, x, z, extra = {}) => { const e = { id: g.nextId(), type, i: toI(x), j: 0, k: toK(z), dir: 0, rise: 0, ...extra }; if (type === 'belt') e.items = []; S().entities.push(e); g.addEntity(e); return L().byId.get(e.id); };
  const mkGen = (x, z) => { const t = mk('gen', x, z); t.burn = 1e5; t.burnMax = 1e5; t.lit = true; return t; };
  const look = (x, y, z, back = 2.0) => { aimPoint(x, y, z, back); adv(0.06); };
  const lookAt = (t) => look(cellX(t.i), 0.3, cellZ(t.k));
  let bayCleared = false;
  const clearBay = () => { if (bayCleared) return; bayCleared = true; const w = ctx.w(); for (let i = toI(-14); i <= toI(11); i++) for (let k = toK(-1); k <= toK(10); k++) for (let j = 0; j < 12; j++) if (w.get(i, j, k)) w.removeCell(i, j, k, false); };
  const clean = () => { clearBay(); fresh(up); S().cables = []; g.cables.reset(); g.power.clear(); };
  const hostWorld = () => ({ ents: S().entities.filter((e) => !e.free).map((e) => json(g.stripEnt(e))), cables: json(S().cables.map((c) => ({ id: c.id, a: c.a, b: c.b }))) });
  const toGuest = (hw) => { done(); clean(); role('guest'); cap(); g.netMessage({ t: 'ents', list: hw.ents }); g.netMessage({ t: 'cables', list: hw.cables }); g.cables.update(0.5); };
  const ref = (e) => ({ kind: 'tile', id: e.id });
  const texts = (e) => { const r = infoFor(g, ref(e)); return r ? [r.title, ...r.lines].join(' | ') : ''; };
  // what the host sends a guest: the 0.17 s dyn and the 0.5 s grid row
  const wireRows = () => { sent = []; g.sendDyn(); const dyn = ofType('dyn')[0]; const row = g.power.packRow(); return { dyn: json(dyn), row: json(row) }; };
  const feed = (rows) => { g.netMessage({ t: 'xrow', k: 'switch', d: rows.row }); g.netMessage(rows.dyn); g.cables.update(0.5); };

  await bare('mp.wire.a-guest-sees-the-same-wires-grids-and-readouts-as-the-host', async () => {
    clean(); role('host'); cap(); S().items.cable = 20;
    const G1 = mkGen(-10, 2), G2 = mkGen(-10, 5), P = mk('pole', -8, 3.6), F = mk('fan', -6, 3.6), F2 = mk('fan', -6, 4.8), Pd = mk('pole', 4, 3.6), Fd = mk('fan', 4, 4.8);
    for (const [a, b] of [[G1, P], [G2, P], [P, F], [P, F2], [Pd, Fd]]) if (!g.cables.connect(a.id, b.id).ok) return 'host could not wire';
    adv(1.5);
    const host = { G: texts(G1), P: texts(P), F: texts(F), Pd: texts(Pd), Fd: texts(Fd) }, hostNets = g.power.nets.length, hostSupply = g.power.nets.map((n) => n.supply).sort();
    const rows = wireRows(), hw = hostWorld(); toGuest(hw); feed(rows);
    const G1g = L().byId.get(G1.id), Pg = L().byId.get(P.id), Fg = L().byId.get(F.id), Pdg = L().byId.get(Pd.id), Fdg = L().byId.get(Fd.id);
    if (!G1g || !Pg || !Fg) return 'guest has no copies of the machines';
    if (S().cables.length !== 5) return 'guest cables ' + S().cables.length;
    const bad = [];
    if (g.power.nets.length !== hostNets || JSON.stringify(g.power.nets.map((n) => n.supply).sort()) !== JSON.stringify(hostSupply)) bad.push(`guest grids ${g.power.nets.length} ${g.power.nets.map((n) => n.supply)} vs host ${hostNets} ${hostSupply}`);
    if (!(Fg.pw > 0.99) || (Fdg.pw || 0) > 0.05) bad.push(`guest fan pw ${Fg.pw}, dead-pole fan ${Fdg.pw}`);
    const guest = { G: texts(G1g), P: texts(Pg), F: texts(Fg), Pd: texts(Pdg), Fd: texts(Fdg) };
    for (const k of Object.keys(host)) { const strip = (s) => s.replace(/Hopper[^|]*\|?/g, '').replace(/Burning[^|]*\|?/g, ''); if (strip(host[k]) !== strip(guest[k])) bad.push(`readout of ${k} differs:\n host "${host[k]}"\n guest "${guest[k]}"`); }
    if (!/2 generators wired together/.test(guest.P) || !/LIVE/.test(guest.P) || !/DEAD/.test(guest.Pd) || !/no generator/.test(guest.Fd)) bad.push('guest readouts: ' + guest.P + ' / ' + guest.Fd);
    void poleInfo;
    return bad.length === 0 || bad.join('\n').slice(0, 900);
  });

  await bare('mp.wire.the-guest-never-solves-grids-and-draws-no-range-links', async () => {
    clean(); role('host'); cap(); S().items.cable = 20;
    const G = mkGen(-10, 2), P = mk('pole', -8, 3.6), F = mk('fan', -6, 3.6); g.cables.connect(G.id, P.id); g.cables.connect(P.id, F.id); adv(1);
    const hw = hostWorld(); toGuest(hw); const Fg = L().byId.get(F.id), Pg = L().byId.get(P.id); Fg.pw = 0; Pg.pw = 0; adv(2);   // (the entities arrive with the host's pw: clear it, a guest must not recompute it)
    const bad = [];
    if ((Fg.pw || 0) > 0 || (Pg.pw || 0) > 0) bad.push(`the guest solved a grid on its own: fan ${Fg.pw}, pole ${Pg.pw}`);
    if (g.power.line) bad.push('a link line object exists on the guest');
    return bad.length === 0 || bad.join('; ');
  });

  await bare('mp.wire.a-guest-wires-two-generators-together-through-the-host-and-the-grid-adds', async () => {
    clean(); role('host'); cap(); S().items.cable = 20;
    const G1 = mkGen(-10, 2), G2 = mkGen(-10, 5), P = mk('pole', -8, 3.6), fans = [0, 1, 2, 3, 4, 5].map((n) => mk('fan', -6 + (n % 3) * 1.2, 3.6 + Math.floor(n / 3) * 1.2));
    g.cables.connect(G1.id, P.id); for (const f of fans) g.cables.connect(P.id, f.id); adv(1);
    const sat0 = g.power.netOfEnt(P).sat; if (!(sat0 < 0.7)) return 'setup: one generator on 12 kW, sat ' + sat0;
    const hw = hostWorld(); toGuest(hw); const g1 = L().byId.get(G1.id), g2 = L().byId.get(G2.id); S().items.cable = 3; g.rebuildTools(); selectTool('cable'); adv(0.2); sent = [];
    lookAt(g1); g.cables.click(g.curTool()); lookAt(g2); adv(0.06); g.cables.click(g.curTool());
    const c = sent.filter((m) => m.t === 'cmd' && m.c === 'cable'); if (c.length !== 1 || c[0].d.a !== G1.id || c[0].d.b !== G2.id) return 'guest sent ' + JSON.stringify(sent);
    if (S().cables.length !== 7) return 'guest wired it by itself: ' + S().cables.length;
    // back on the host: the same world, the command arrives
    done(); clean(); role('host'); cap(); S().items.cable = 3;
    for (const e of hw.ents) { const t = { ...e }; if (t.type === 'belt') t.items = []; S().entities.push(t); g.addEntity(t); }
    for (const t of L().tiles.values()) if (t.type === 'gen') { t.burn = 1e5; t.burnMax = 1e5; t.lit = true; }
    S().cables = hw.cables.map((x) => ({ ...x })); g.cables.changed(); adv(0.5);
    g.netMessage(json(c[0])); adv(1);
    const Pn = L().byId.get(P.id), net = g.power.netOfEnt(Pn), hint = ofType('chint');   // (the host world was rebuilt: read the new tile, not the old object)
    const bad = [];
    if (S().cables.length !== 8 || !net || net.gens.length !== 2 || Math.abs(net.supply - 16) > 1e-6 || !(net.sat > 0.99)) bad.push(`host after the command: cables ${S().cables.length}, gens ${net && net.gens.length}, supply ${net && net.supply}, sat ${net && net.sat}; G1 ${G1.id} G2 ${G2.id} new cable ${JSON.stringify(S().cables[S().cables.length - 1])} nodes ${net && net.nodes.map((n) => n.type + n.id)} hostG ${[...L().tiles.values()].filter((t) => t.type === 'gen').map((t) => t.id + ':' + t.burn)}`);
    if (!hint.length || !hint[0].good || !/Wired/.test(hint[0].text)) bad.push('the guest was not told: ' + JSON.stringify(hint));
    if (S().items.cable !== 2) bad.push('cable stock ' + S().items.cable);
    if (!ofType('cables').length) bad.push('the new cable list was not announced');
    return bad.length === 0 || bad.join('; ');
  });

  await bare('mp.wire.forged-guest-cable-commands-are-refused', async () => {
    clean(); role('host'); cap(); S().items.cable = 3;
    const G = mkGen(-10, 2), P = mk('pole', -8, 3.6), F = mk('fan', -6, 3.6), F2 = mk('fan', -6, 4.8), M = mk('mech', -5, 3.6), farP = mk('pole', 11, 8), farF = mk('fan', 10, 3);
    const B1 = mk('belt', -2, 6), B2 = mk('belt', -1.4, 6), B3 = mk('belt', -0.8, 6);
    const room = [G, P, F, F2, M, farP, farF, B1, B2, B3]; void room;
    g.cables.connect(P.id, F.id); g.cables.connect(P.id, B2.id); const n0 = S().cables.length, items0 = S().items.cable;
    const bad = [], cmd = (d, label, want) => { sent = []; g.netMessage({ t: 'cmd', c: 'cable', d }); const h = ofType('chint'); if (S().cables.length !== n0 || S().items.cable !== items0) bad.push(`${label}: changed things (${S().cables.length} cables, ${S().items.cable} items)`); if (want && (!h.length || h[0].good || !want.test(h[0].text))) bad.push(`${label}: reply ${JSON.stringify(h)}`); };
    cmd({ a: 'x', b: P.id }, 'string id', /not a cable/); cmd({ a: P.id }, 'missing id', /not a cable/); cmd({ a: P, b: G }, 'objects for ids', /not a cable/); cmd({ a: 1.5, b: 2 }, 'fractional ids', /not a cable/); cmd(null, 'no payload', /not a cable/); cmd({ a: -1, b: 99999999 }, 'unknown ids', /gone/);
    cmd({ a: P.id, b: P.id }, 'a cable to itself', /second object/);
    cmd({ a: G.id, b: farF.id }, 'too long', /Too far/);
    cmd({ a: F.id, b: M.id }, 'machine to machine', /not from another machine/);
    return bad.length === 0 || bad.join('; ');
  });

  await bare('mp.wire.a-guest-too-far-away-cannot-wire-and-a-second-cable-on-a-belt-line-or-a-full-socket-is-refused', async () => {
    clean(); role('host'); cap(); S().items.cable = 30;
    const P = mk('pole', -8, 3.6), F = mk('fan', -6, 3.6), F2 = mk('fan', -5, 3.6), B1 = mk('belt', 0, 6), B2 = mk('belt', 0.6, 6);
    const bad = [];
    g.remote = { pos: new THREE.Vector3(200, 0, 200) };   // the guest stands far from everything
    sent = []; g.netMessage({ t: 'cmd', c: 'cable', d: { a: P.id, b: F.id } }); let h = ofType('chint'); if (S().cables.length || !h.length || h[0].good || !/too far away/.test(h[0].text)) bad.push('a guest 280 m away wired a machine: ' + JSON.stringify(h));
    g.remote = { pos: new THREE.Vector3(-7, 0, 4) };
    sent = []; g.netMessage({ t: 'cmd', c: 'cable', d: { a: P.id, b: F.id } }); h = ofType('chint'); if (S().cables.length !== 1 || !h.length || !h[0].good) bad.push('a guest next to it could not wire: ' + JSON.stringify(h));
    sent = []; g.netMessage({ t: 'cmd', c: 'cable', d: { a: P.id, b: B1.id } }); g.netMessage({ t: 'cmd', c: 'cable', d: { a: P.id, b: B2.id } }); h = ofType('chint');
    if (S().cables.length !== 2 || h.length !== 2 || h[1].good || !/line already has a cable/.test(h[1].text)) bad.push('a second cable on one belt line: ' + JSON.stringify(h));
    const stock = S().items.cable; sent = []; g.netMessage({ t: 'cmd', c: 'cable', d: { a: P.id, b: F.id } });   // the same pair again takes the cable down and gives it back
    if (S().cables.length !== 1 || S().items.cable !== stock + 1) bad.push(`unwiring through the host: cables ${S().cables.length}, stock ${stock} -> ${S().items.cable}`);
    void F2;
    return bad.length === 0 || bad.join('; ');
  });

  await bare('mp.wire.the-guest-draws-a-socket-and-halo-state-of-its-own-and-puts-nothing-in-the-world-by-itself', async () => {
    clean(); role('host'); cap(); S().items.cable = 5;
    const G = mkGen(-10, 2), P = mk('pole', -8, 3.6), F = mk('fan', -6, 3.6); g.cables.connect(G.id, P.id); adv(1);
    const hw = hostWorld(); toGuest(hw); feed(wireRows());   // (wireRows ran on the guest page: harmless, it only checks that nothing throws)
    const Gg = L().byId.get(G.id), Pg = L().byId.get(P.id); S().items.cable = 2; g.rebuildTools(); selectTool('cable'); adv(0.2);
    const Fg = L().byId.get(F.id); lookAt(Gg); g.cables.click(g.curTool()); lookAt(Fg); const halo = g.cables.halo; g.cables.cancel();
    return (halo && halo.color === 'green' && S().cables.length === 1 && !sent.some((m) => m.t === 'cmd' && m.c === 'cable')) || `halo ${JSON.stringify(halo)}, cables ${S().cables.length}, sent ${JSON.stringify(sent.map((m) => m.t))}`;
  });
}
