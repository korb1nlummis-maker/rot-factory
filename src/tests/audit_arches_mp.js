// mp.audit_arches.*: the audit of wave 6 for a host and a guest, no network (one page plays both roles by switching g.net.role and capturing g.netSend, like mp.arch.*).
// Run: `await __selftest('mp.audit_arches.')`
import { makeKit, UP, ARCH, PORTAL } from './portal_lib.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, w, fresh, newWorld, toI, toK, clearBodies } = ctx;
  const K = makeKit(ctx);
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const guard = (name, fn, up = UP) => T(name, async () => {
    const mode0 = g.mode, remote0 = g.remote;
    try { g.mode = 'play'; await newWorld(); fresh(up); S().money = 1e13; g.surgeT = 1e9; clearBodies(); K.fast(); return await fn(); } finally { done(); g.remote = remote0; g.mode = mode0 === 'ended' ? 'play' : mode0; g.stowed = true; g.rebuildTools(); g.cfgClip = null; }
  });
  const clearYard = () => { for (let i = toI(-52); i <= toI(8); i++) for (let k = toK(-26); k <= toK(18); k++) for (let j = 0, top = w().topAt(i, k); j < top; j++) if (w().get(i, j, k)) w().removeCell(i, j, k, false); };
  const ents = (type) => [...g.machines.items.values()].map((it) => it.ent).filter((e) => e.type === type);
  const toGuest = (msgs, type) => { done(); for (const e of ents(type)) g.removeViewEnt(e.id); role('guest'); cap(); for (const m of msgs) g.netMessage(json(m)); };

  // The host re-checked where a plate or a dock goes, but not what the guest paid with or whether the upgrade was owned: a belt in the host's pack bought a Truck Dock (220,000 at the
  // bench) and a road plate before either was unlocked.
  await guard('mp.audit_arches.a-forged-place-cannot-spend-another-item-as-a-dock-or-a-road-or-skip-the-unlock', async () => {
    const bad = []; clearYard(); role('host'); cap(); S().items.belt = 5; S().items.road = 2; S().items.dock = 1;
    const place = (tool, ent) => g.netMessage({ t: 'cmd', c: 'place', d: { tool, ent } }), n = (t) => S().entities.filter((e) => e.type === t).length;
    const d0 = { ax: 'x', i0: toI(-20), k0: toK(-8), j: 0 }, r0 = { i0: toI(-30), k0: toK(0), j: 0 };
    place({ id: 'belt', kind: 'dock' }, d0); place({ id: 'belt', kind: 'road' }, r0); place({ id: 'road', kind: 'dock' }, d0); place({ id: 'dock', kind: 'road' }, r0);
    if (n('dock') || n('road')) bad.push(`a belt, a road or a dock item built ${n('dock')} docks and ${n('road')} plates in the wrong shape`); if (S().items.belt !== 5) bad.push('a belt was spent');
    if (!sent.some((m) => m.t === 'toast')) bad.push('the guest was not told');
    // the right item with the right unlock works
    place({ id: 'road', kind: 'road' }, r0); place({ id: 'dock', kind: 'dock' }, d0); if (n('road') !== 1 || n('dock') !== 1) bad.push(`a proper place built ${n('road')} plates and ${n('dock')} docks`);
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.audit_arches.a-forged-place-cannot-set-a-dock-or-a-road-before-its-upgrade', async () => {
    const bad = []; clearYard(); role('host'); cap(); S().items.road = 2; S().items.dock = 1;
    const place = (tool, ent) => g.netMessage({ t: 'cmd', c: 'place', d: { tool, ent } }), n = (t) => S().entities.filter((e) => e.type === t).length;
    place({ id: 'road', kind: 'road' }, { i0: toI(-30), k0: toK(0), j: 0 }); place({ id: 'dock', kind: 'dock' }, { ax: 'x', i0: toI(-20), k0: toK(-8), j: 0 });
    if (n('road') || n('dock')) bad.push(`built ${n('road')} plates and ${n('dock')} docks with the upgrades locked`); if (S().items.road !== 2 || S().items.dock !== 1) bad.push('items were spent');
    return bad.length === 0 || bad.join('; ');
  }, { ...UP, haulRoad: 0, truckDock: 0 });

  // weigh() cuts the next four slabs and puts them back to see what the mountain would press, and every cell it touched went to the guest's cell feed: a halted Portal tries every 2 s,
  // so a guest got thousands of cell updates (and a re-mesh of the same tunnel) every two seconds for as long as it stayed halted.
  await guard('mp.audit_arches.a-halted-portal-sends-nothing-to-the-guest-and-the-world-is-as-it-was-after-each-try', async () => {
    g.T.frames = ['timber']; const st = K.site({ span: 12, dist: 340, rows: 40 }), e = K.mouth(st, 'timber'), bad = []; g.T.frames = ['timber']; K.fast(); role('host'); cap();
    if (!K.until(() => e.ps === 'press', 120)) return `no halt: ${e.ps} adv ${e.adv}`;
    w().onSet = (i, j, k, sp, vr) => { g.netOut.push(i, j, k, sp, vr); }; g.netOut.length = 0;
    const snap = () => { let n = 0, h = 0; for (let a = 0; a < 8; a++) for (const [i, j, k] of PORTAL.slabCells(e, PORTAL.slabA(e, e.adv + a))) { const sp = w().get(i, j, k); if (sp) { n++; h = (h * 31 + sp * 7 + w().getVr(i, j, k)) | 0; } } return [n, h]; };
    const before = snap(); K.run(10); const after = snap();
    if (e.ps !== 'press') bad.push('it left the halt: ' + e.ps); if (before.join() !== after.join()) bad.push(`the cells ahead changed: ${before} then ${after}`);
    if (g.netOut.length) bad.push(`${g.netOut.length / 5} cell updates went to the guest while it stood halted`);
    w().onSet = null; return bad.length === 0 || bad.join('; ');
  });

  // The halted Portal's readout said "Choking on stale air (0%)" on the guest: the row carried no air figure.
  await guard('mp.audit_arches.the-choke-readout-is-the-same-on-the-guest-and-the-row-ignores-garbage', async () => {
    const st = K.site({ span: 6, dist: 1150 }), e = K.mouth(st, 'neutron'), bad = []; role('host'); cap();
    if (!K.until(() => e.ps === 'choke', 10)) return `no choke: ${e.ps}`;
    g.time += 6; const hostLine = PORTAL.lines(g, e)[0], row = PORTAL.row(g);   // (a row that did not change for 5 s is sent again: a late joiner)
     if (!row || row[e.id].length < 8) return 'row ' + JSON.stringify(row);
    const plus = { t: 'ent+', ent: g.stripEnt(e) }; delete plus.ent.air; toGuest([plus], 'garch'); g.netMessage({ t: 'xrow', k: 'garch', d: json(row) });
    const v = ents('garch').find((x) => x.id === e.id); if (!v) return 'no guest copy'; const guestLine = PORTAL.lines(g, v)[0];
    if (guestLine !== hostLine) bad.push(`host "${hostLine}" guest "${guestLine}"`);
    const air0 = v.air; g.netMessage({ t: 'xrow', k: 'garch', d: { [e.id]: [3, 7, 100, 0, 0, 0, 0, 'x'] } }); g.netMessage({ t: 'xrow', k: 'garch', d: { [e.id]: [3, 7, 100, 0, 0, 0, 0, NaN] } }); g.netMessage({ t: 'xrow', k: 'garch', d: { [e.id]: [3, 7, 100, 0, 0, 0, 0, 1e9] } });
    if (!(v.air >= 0 && v.air <= 1) || (v.air !== air0 && v.air !== 1)) bad.push('a forged air figure got in: ' + v.air);
    void infoFor; void ARCH; void w; void S;
    return bad.length === 0 || bad.join('; ');
  });
}
