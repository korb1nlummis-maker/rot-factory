// mp.audit_hose.* : what a guest can and cannot make the host do with a hose or a belt. Forged place commands (a turn of somebody else's belt, a hose that climbs, a
// facing that is not a way, a hose item that makes a different machine), forged planned lines, and a guest that sweeps the mouse while the host lags.
import { makeHoseKit, UP_HOSE } from './hose_lib.js';

export default async function (ctx) {
  const { g, S, L, adv, tiles } = ctx;
  const H = makeHoseKit(ctx), B = H.B, T = B.T, io = H.io, json = B.json;
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); g.bplan = null; B.cleanup(); L().standIns.clear(); } });
  const bad = (a) => a.length === 0 || a.join('; ');
  const place = (tool, ent) => { g.netCmd('place', json({ tool, ent })); adv(0.05); };
  const HOSE = { id: 'hose', kind: 'belt', hose: true };

  await guard('mp.audit_hose.a-forged-turn-never-spins-a-belt-the-guest-is-not-building', async () => {
    H.setup(20); role('host'); cap(); const b = [];
    // a far, unrelated line of belts that ends in the open, and a hose piece the guest sets down in another corner
    const far = B.lay(0, 4, H.o.i, H.o.k + 6, 0); H.rebuild(); const end = far[far.length - 1], was = end.dir;
    for (const forged of [{ id: end.id, dir: 1 }, { id: end.id, dir: 7 }, { id: end.id, dir: 1.5 }, { id: end.id, dir: 'x' }, { id: end.id, dir: -1 }, { id: end.id, dir: null }]) {
      place(HOSE, { type: 'belt', i: H.o.i + 10, j: 0, k: H.o.k, dir: 0, rise: 0, turnPrev: forged }); H.rebuild();
      const t = L().byId.get(end.id); if (!t || t.dir !== was) b.push(`a forged turn ${JSON.stringify(forged.dir)} set a far belt to dir ${t && t.dir} (was ${was})`);
      if (t) t.dir = was;
      for (const x of tiles()) if (x.type === 'belt' && x.hose) L().remove(x); S().entities = S().entities.filter((e) => !(e.type === 'belt' && e.hose));
    }
    return bad(b);
  });

  await guard('mp.audit_hose.a-real-turn-of-the-last-piece-still-works-for-a-guest', async () => {
    H.setup(20); role('host'); cap(); const b = [];
    place(HOSE, { type: 'belt', i: H.o.i, j: 0, k: H.o.k, dir: 0, rise: 0 });
    const first = H.tileAt(0, 0); if (!first) return 'no first piece';
    place(HOSE, { type: 'belt', i: H.o.i, j: 0, k: H.o.k - 1, dir: 3, rise: 0, turnPrev: { id: first.id, dir: 3 } }); H.rebuild();
    const t = H.tileAt(0, 0); if (!t || t.dir !== 3) b.push(`the guest's turn was not applied: dir ${t && t.dir}`);
    // a guest that has not heard the id of the piece it laid a moment ago names it by place
    place(HOSE, { type: 'belt', i: H.o.i + 3, j: 0, k: H.o.k, dir: 0, rise: 0 }); place(HOSE, { type: 'belt', i: H.o.i + 3, j: 0, k: H.o.k + 1, dir: 1, rise: 0, turnPrev: { dir: 1, i: H.o.i + 3, j: 0, k: H.o.k } }); H.rebuild();
    const u = H.tileAt(3, 0); if (!u || u.dir !== 1) b.push(`a turn named by place was not applied: dir ${u && u.dir}`);
    // a turn toward some other cell than the new piece, a straight on one and a turn back are refused
    place(HOSE, { type: 'belt', i: H.o.i + 6, j: 0, k: H.o.k, dir: 0, rise: 0 });
    for (const [name, tp, at] of [['away from the new piece', { dir: 1, i: H.o.i + 6, j: 0, k: H.o.k }, { i: H.o.i + 6, k: H.o.k - 1 }], ['straight on', { dir: 0, i: H.o.i + 6, j: 0, k: H.o.k }, { i: H.o.i + 7, k: H.o.k }], ['back', { dir: 2, i: H.o.i + 6, j: 0, k: H.o.k }, { i: H.o.i + 5, k: H.o.k }]]) {
      place(HOSE, { type: 'belt', i: at.i, j: 0, k: at.k, dir: 1, rise: 0, turnPrev: tp }); H.rebuild(); const v = H.tileAt(6, 0); if (!v || v.dir !== 0) b.push(`a turn ${name} was applied: dir ${v && v.dir}`);
    }
    return bad(b);
  });

  await guard('mp.audit_hose.a-hose-piece-from-a-guest-cannot-climb-or-face-a-non-way', async () => {
    H.setup(20); role('host'); cap(); const b = [];
    const n0 = S().items.hose;
    for (const [name, ent] of [['rise 1', { type: 'belt', i: H.o.i, j: 0, k: H.o.k, dir: 0, rise: 1 }], ['rise -1', { type: 'belt', i: H.o.i + 2, j: 0, k: H.o.k, dir: 0, rise: -1 }], ['dir 9', { type: 'belt', i: H.o.i + 4, j: 0, k: H.o.k, dir: 9, rise: 0 }], ['dir 1.5', { type: 'belt', i: H.o.i + 6, j: 0, k: H.o.k, dir: 1.5, rise: 0 }], ['dir NaN', { type: 'belt', i: H.o.i + 8, j: 0, k: H.o.k, dir: NaN, rise: 0 }], ['dir string', { type: 'belt', i: H.o.i + 10, j: 0, k: H.o.k, dir: '1', rise: 0 }]]) {
      place(HOSE, ent); H.rebuild();
      const t = L().tileAt(ent.i, 0, ent.k) || L().tileAt(ent.i, 1, ent.k);
      if (t && ((t.rise || 0) !== 0 || ![0, 1, 2, 3].includes(t.dir))) b.push(`${name}: the host laid a hose piece with rise ${t.rise} dir ${t.dir}`);
      if (t && !Number.isInteger(t.dir)) b.push(`${name}: dir ${t.dir}`);
    }
    for (const t of tiles()) if (t.type === 'belt' && Number.isNaN(+t.dir)) b.push('a tile with a NaN facing exists');
    void n0; return bad(b);
  });

  await guard('mp.audit_hose.a-hose-item-cannot-be-spent-as-another-machine', async () => {
    H.setup(20); role('host'); cap(); const b = [];
    S().items.sorter = 0; delete S().items.sorter; delete S().items.belt;
    const n0 = S().items.hose; let c0 = tiles().length;
    place({ id: 'hose', kind: 'sorter', hose: true }, { type: 'sorter', i: H.o.i, j: 0, k: H.o.k, dir: 0, rise: 0 });
    if (tiles().length !== c0 || S().items.hose !== n0) b.push('a hose item made a sorter');
    place({ id: 'hose', kind: 'mech' }, { type: 'mech', i: H.o.i + 2, j: 0, k: H.o.k, dir: 0, rise: 0 });
    if (tiles().length !== c0 || S().items.hose !== n0) b.push('a hose item made a mech');
    S().items.belt = 5; g.rebuildTools(); c0 = tiles().length;
    place({ id: 'belt', kind: 'vault' }, { type: 'vault', i: H.o.i + 4, j: 0, k: H.o.k, dir: 0, rise: 0 });
    if (tiles().length !== c0 || S().items.belt !== 5) b.push('a belt item made a vault');
    return bad(b);
  });

  await guard('mp.audit_hose.a-forged-hose-line-cannot-end-facing-back-into-itself', async () => {
    H.setup(30); role('host'); cap(); const b = [];
    const t = (n, d) => [H.o.i + n, 0, H.o.k, d, 0, 0];
    g.netCmd('bplan', { tier: 0, hose: true, tiles: [t(0, 0), t(1, 0), t(2, 2)] }); adv(0.05);
    const hs = H.hoses(); const last = hs.find((x) => x.i === H.o.i + 2);
    if (last && last.dir === 2) b.push('the host laid a last piece that faces back into the line (a head on pair)');
    return bad(b);
  });

  await guard('mp.audit_hose.a-guest-holding-b-over-a-slow-link-still-lays-one-connected-hose', async () => {
    // the guest's pieces reach the host a moment late: its world has not seen the last piece yet when it aims at the next one. The host must still end up with one hose.
    H.setup(60); const b = [];
    role('guest'); cap();
    await H.hold([[0, 0], [1, 0], [2, 0], [4, 1], [5, 1], [7, 3]], 0);
    const cmds = sent.filter((m) => m.t === 'cmd' && m.c === 'place').map((m) => m.d);
    if (cmds.length < 4) return 'the guest sent only ' + cmds.length + ' place commands';
    done(); B.setup(UP_HOSE); H.setup(60); role('host'); cap();
    for (const d of cmds) { g.netCmd('place', json(d)); adv(0.05); }
    H.rebuild(); const hs = H.hoses(), m = H.mouths();
    if (m.length !== 1) b.push(`mouths ${m.length} of ${hs.length} pieces: the guest's sweep left gaps`); else if (H.follow(m[0]) !== hs.length) b.push('not one line: ' + H.follow(m[0]) + ' of ' + hs.length);
    return bad(b);
  });

  await guard('mp.audit_hose.a-guest-tapping-b-twice-on-one-cell-asks-the-host-once', async () => {
    H.setup(20); const b = []; role('guest'); cap();
    await H.put(0, 0, 0); await H.put(0, 0, 0); const cmds = sent.filter((m) => m.t === 'cmd' && m.c === 'place');
    if (cmds.length !== 1) b.push(`the guest sent ${cmds.length} place commands for one cell`);
    // the host never announces it (it said no): the stand-in is forgotten after a few seconds and the cell can be asked for again
    g.time += 4; adv(0.05); const pl = await H.aim(0, 0, 0); if (!pl || !pl.ok) b.push('the cell stays held after the host never answered: ' + (pl && pl.why));
    return bad(b);
  });

  await guard('mp.audit_hose.a-forged-request-cannot-turn-a-hose-piece-into-a-splitter-gate-or-part', async () => {
    H.setup(20); role('host'); cap(); const b = [];
    for (let s = 0; s < 3; s++) place(HOSE, { type: 'belt', i: H.o.i + s, j: 0, k: H.o.k, dir: 0, rise: 0 });
    H.rebuild(); const mid = H.tileAt(1, 0); if (!mid) return 'no hose';
    S().up.detector = 1; g.refreshTuning(); S().items.splitter = 2; S().items.gate = 2; g.rebuildTools();
    place({ id: 'splitter', kind: 'splitter' }, { type: 'splitbelt', id: mid.id, i: mid.i, j: mid.j, k: mid.k, dir: mid.dir, rise: 0 });
    place({ id: 'gate', kind: 'gate' }, { type: 'gatebelt', id: mid.id, i: mid.i, j: mid.j, k: mid.k, dir: mid.dir, rise: 0 });
    const t = H.tileAt(1, 0); if (t.splitter) b.push('a hose piece was made a splitter'); if (t.detector) b.push('a hose piece was made a gate'); if (S().items.splitter !== 2 || S().items.gate !== 2) b.push('the items were spent anyway');
    for (const id of ['merger', 'pmerger', 'ssplit', 'psplit']) { S().items[id] = 1; g.rebuildTools(); place({ id, kind: id }, { type: 'convertbelt', id: mid.id }); if (H.tileAt(1, 0).merger || H.tileAt(1, 0).smart || H.tileAt(1, 0).splitter) b.push('a hose piece was made a ' + id); }
    return bad(b);
  });
}
