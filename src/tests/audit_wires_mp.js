// audit wires (co-op): what a hostile or confused guest can do to the cables and the grids. One page plays both roles by switching g.net.role and capturing g.netSend
// (the same way mp.wire.* does). Prefix `wires.audit.mp.`.
import * as THREE from 'three';
import { makeKit, UP } from './power_lib.js';

export default async function (ctx) {
  const { T, g, S, L, adv } = ctx;
  const K = makeKit(ctx);
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { if (m.t !== 'pos' && m.t !== 'bodies' && m.t !== 'shared' && m.t !== 'time') sent.push(K.json(m)); }; };
  const done = () => { delete g.netSend; role(null); g.remote = null; };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); } });
  const cmd = (c, d) => { sent = []; g.netMessage({ t: 'cmd', c, d }); };
  const at = (x, y, z) => { g.remote = { pos: new THREE.Vector3(x, y, z) }; };

  await guard('wires.audit.mp.a-guest-cannot-write-cables-or-grid-rows-into-the-host', async () => {
    K.reset(UP, false); role('host'); cap(); S().items.cable = 5; const bad = [];
    const G = K.gen(-10, 3), P = K.pole(-8, 3), F = K.fan(-6, 3); g.cables.connect(G.id, P.id); g.cables.connect(P.id, F.id); adv(1);
    const list0 = JSON.stringify(S().cables), sup0 = g.power.nets.map((n) => n.supply).join();
    // messages only a host may send: a guest's copy of one is forged
    g.netMessage({ t: 'cables', list: [{ id: 1, a: G.id, b: F.id }] });
    g.netMessage({ t: 'chint', text: 'hello', good: true });
    g.netMessage({ t: 'xrow', k: 'switch', d: { n: [[1, 999, 0, 999, 100, 0, 0, 0, 0, [G.id], [], 0, [], 999]], e: [] } });
    g.netMessage({ t: 'dyn', cpw: [S().cables[0].id, 0], tiles: [], belts: [] });
    adv(0.2);
    if (JSON.stringify(S().cables) !== list0) bad.push('a guest rewrote the host cable list');
    if (g.power.nets.map((n) => n.supply).join() !== sup0) bad.push('a guest rewrote the host grid rows: ' + g.power.nets.map((n) => n.supply));
    return bad.length === 0 || bad.join('; ');
  });

  await guard('wires.audit.mp.a-guest-cannot-wire-things-that-take-no-cable', async () => {
    K.reset(UP, false); role('host'); cap(); S().items.cable = 5; const bad = [];
    const P = K.pole(-8, 3), vault = K.tile('vault', -7, 3.8), fr = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'z', cx: -6, cz: 3, y0: 0, w: 2.38, h: 2.38, yaw: 0 };
    S().entities.push(fr); g.addEntity(fr); at(-7, 0, 3);
    for (const id of [vault.id, fr.id]) { cmd('cable', { a: P.id, b: id }); const h = ofType('chint'); if (S().cables.length || S().items.cable !== 5 || !h.length || h[0].good) bad.push(`a cable to a ${id === vault.id ? 'vault' : 'frame'} was accepted: ${JSON.stringify(h)}`); }
    cmd('cable', { a: P.id, b: 1e9 }); if (S().cables.length) bad.push('a cable to a missing object');
    cmd('cable', { a: Number.MAX_SAFE_INTEGER, b: -0 }); if (S().cables.length) bad.push('a cable between nonsense ids');
    return bad.length === 0 || bad.join('; ');
  });

  await guard('wires.audit.mp.a-guest-with-no-cable-stock-wires-nothing-and-a-stranger-cannot-take-a-far-cable-down', async () => {
    K.reset(UP, false); role('host'); cap(); S().items.cable = 1; const bad = [];
    const G = K.gen(-10, 3), P = K.pole(-8, 3), F = K.fan(-6, 3), F2 = K.fan(-6, 4.2);
    at(-8, 0, 3); cmd('cable', { a: P.id, b: F.id }); if (S().cables.length !== 1 || (S().items.cable || 0) !== 0) bad.push(`the last cable was not laid: ${S().cables.length} cables, ${S().items.cable} in stock`);
    cmd('cable', { a: P.id, b: F2.id }); const h = ofType('chint'); if (S().cables.length !== 1 || !h.length || h[0].good || !/no Power Cable left/.test(h[0].text)) bad.push('a cable with an empty stock: ' + JSON.stringify(h));
    // a guest on the far side of the map takes a cable down by its id (the id is public: it is in the list every guest gets)
    const rec = S().cables[0]; at(300, 0, 300); cmd('decon', { kind: 'cable', id: rec.id });
    if (S().cables.length !== 1) bad.push('a guest 400 m away removed a cable');
    at(-7, 0, 3); cmd('decon', { kind: 'cable', id: rec.id });
    if (S().cables.length !== 0 || S().items.cable !== 1) bad.push(`a guest standing next to it could not take it down: ${S().cables.length} cables, ${S().items.cable} in stock`);
    cmd('decon', { kind: 'cable', id: rec.id }); if (S().items.cable !== 1) bad.push('a cable taken down twice was refunded twice: ' + S().items.cable);
    void G; return bad.length === 0 || bad.join('; ');
  });

  await guard('wires.audit.mp.the-host-sends-only-the-cables-whose-power-changed-and-the-whole-list-every-few-seconds', async () => {
    K.reset(UP, false); role('host'); cap(); g.net.open = false; S().items.cable = 100; const bad = [];   // (the connection stays shut so the game loop does not send rows of its own between the ones this test asks for)
    const G = K.gen(-12, 2), P = K.pole(-11, 3); g.cables.connect(G.id, P.id);
    const fans = []; for (let n = 0; n < 8; n++) { const f = K.fan(-14 + n * 0.8, 5); fans.push(f); g.cables.connect(P.id, f.id); }
    adv(1); const first = g.cables.pwRows(); if (first.length !== 18) bad.push('the first rows hold ' + first.length / 2 + ' cables, expected 9');
    const quiet = g.cables.pwRows(); if (quiet.length) bad.push('nothing changed but ' + quiet.length / 2 + ' cables were sent again');
    G.burn = 0; G.burnMax = 0; G.q = []; G.lit = false; g.power.markDirty(); adv(1);   // the generator runs out: every cable goes dark
    const dark = g.cables.pwRows(); if (dark.length !== 18 || dark.some((v, i) => i % 2 === 1 && v !== 0)) bad.push('a blackout sent ' + dark.length / 2 + ' cables: ' + JSON.stringify(dark));
    for (let n = 0; n < 40; n++) g.cables.pwRows(); // (a full list comes round again within 18 calls)
    let sawFull = false; for (let n = 0; n < 18; n++) if (g.cables.pwRows().length === 18) sawFull = true; if (!sawFull) bad.push('the whole list never came round again');
    // a new cable: the very next rows carry the whole list (a guest who just heard of the cable must not draw it red for 3 s)
    const f2 = K.fan(-9, 5); g.cables.connect(P.id, f2.id); const after = g.cables.pwRows(); if (after.length !== 20) bad.push('after laying a cable the rows hold ' + after.length / 2 + ' cables, expected 10');
    // a guest applies a partial list without losing the rest
    const rec = S().cables[1]; g.cables.applyPw([S().cables[0].id, 55]); g.cables.applyPw([]); const r0 = g.cables.rec(S().cables[0].id); if (!r0 || r0.pw !== 0.55) bad.push('applying a partial list lost a state: ' + (r0 && r0.pw)); void rec;
    return bad.length === 0 || bad.join('; ');
  });
}
