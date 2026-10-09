// belts.* (wave 1A): save and load. Marks, lifts, underground pairs and Lift Frames come back exactly, old saves without the new fields load as Mk1 belts,
// and everything still works (and can be hammered) after the load.
import { makeBeltKit, UP_ALL, UP_BASE } from './belts_lib.js';
import { loadSaved } from '../state.js';
import { SAVE_KEY, idx as cellIdx } from '../config.js';
import { tierOf, rateOf } from '../beltdata.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T: T0, g, S, w, p, L, tiles, toI, toK, cellX, cellZ } = ctx;
  const B = makeBeltKit(ctx);
  const T = B.T; void T0;
  const saveAndLoad = async () => {
    g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) throw new Error('g.save() failed');
    const raw = localStorage.getItem(SAVE_KEY); if (!raw) throw new Error('nothing under ' + SAVE_KEY);
    const saved = loadSaved(); if (!saved || !saved.S) throw new Error('loadSaved() returned nothing');
    g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play';
    return raw;
  };
  const view = (t) => JSON.stringify({ i: t.i, j: t.j, k: t.k, dir: t.dir, rise: t.rise || 0, tier: t.tier || 0, lift: t.lift || null, ug: t.ug || null, items: (t.items || []).map((x) => [x.sp, x.vr, +x.t.toFixed(3)]) });
  const views = () => { const o = {}; for (const t of tiles()) if (t.type === 'belt' && !t.free) o[t.id] = view(t); return o; };
  const frames = () => [...g.machines.items.values()].filter((it) => it.ent.type === 'liftframe').map((it) => it.ent.id + ':' + it.ent.x.toFixed(2) + ',' + it.ent.z.toFixed(2)).sort().join();

  await T('belts.marks-lifts-and-undergrounds-survive-a-save-and-load', async () => {
    B.setup(UP_ALL); const bad = []; const i0 = toI(-11), k0 = toK(0.3);
    const line = B.lay(3, 4, i0, k0, 0), turn = B.lay(3, 3, i0 + 4, k0, 1);
    B.floorAt(i0 + 3, 9, k0 + 6);
    const lift = g.placeEntity('belt', { i: i0 + 2, j: 0, k: k0 + 6, dir: 0, rise: 0, lift: { h: 10 }, tier: 2, items: [] }, { quiet: true, rebuild: false });
    const frame = B.frameAt(i0 + 2, k0 + 7), top = B.lay(2, 1, i0 + 3, k0 + 6, 0, 10)[0];
    const entry = g.placeEntity('belt', { i: i0, j: 0, k: k0 - 4, dir: 0, rise: 0, tier: 1, items: [], ug: { role: 'in', pair: null, span: 0 } }, { quiet: true, rebuild: false });
    const exit = g.placeEntity('belt', { i: i0 + 5, j: 0, k: k0 - 4, dir: 0, rise: 0, tier: 1, items: [], ug: { role: 'out', pair: entry.id, span: 5 } }, { quiet: true, rebuild: false });
    const v = B.vaultAt(i0 + 4, k0 + 6, 10); void v;
    line[1].items = [{ sp: 4, vr: 0, t: 0.4 }]; lift.items = [{ sp: 6, vr: 2, t: 7.25 }, { sp: 5, vr: 0, t: 3.1 }]; entry.items = [{ sp: 3, vr: 0, t: 2.2 }]; L().rebuildBelts();
    const a = views(), fr = frames(), cols = [...L().cols.keys()].sort((x, y) => x - y).join(), beds = L().bedMesh.count, rails = L().railMesh.count, corners = L().cornerN;
    const raw = await saveAndLoad();
    if (!/"lift":\{"h":10\}/.test(raw) || !/"ug":\{"role":"in"/.test(raw) || !/"tier":3/.test(raw)) bad.push('the save text does not carry the new fields');
    L().rebuildBelts();
    const b = views(); for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[id] !== b[id]) bad.push(`tile ${id}: ${a[id]} -> ${b[id]}`);
    if (frames() !== fr) bad.push('lift frames: ' + fr + ' -> ' + frames());
    if ([...L().cols.keys()].sort((x, y) => x - y).join() !== cols) bad.push('the lift shaft cells changed');
    for (const c of L().cols.keys()) if (!w().reserved.has(c)) bad.push('a shaft cell is not reserved after the load');
    { const nb = tiles().filter((t) => t.type === 'belt' && !t.lift && !t.ug).length; if (L().cornerN !== corners || L().bedMesh.count !== nb - corners || L().railMesh.count !== 2 * (nb - corners) || L().bendBedR.count + L().bendBedL.count !== corners || L().bendRailR.count + L().bendRailL.count !== corners) bad.push(`meshes after the load: beds ${L().bedMesh.count}, rails ${L().railMesh.count}, corners ${L().cornerN}/${corners} for ${nb} drawn belts (before: ${beds} beds, ${rails} rails)`); }
    const lift2 = L().byId.get(lift.id), en2 = L().byId.get(entry.id), ex2 = L().byId.get(exit.id);
    if (!lift2 || !L().objs.has(lift2.id) || !L().liftSupport(lift2).ok) bad.push('the lift or its frame did not come back'); if (!en2 || !ex2 || en2.ug.pair !== ex2.id || ex2.ug.pair !== en2.id) bad.push('the pair did not come back');
    const info = infoFor(g, { kind: 'tile', id: lift2.id }); if (!info || !/BELT LIFT MK3/.test(info.title) || !info.lines.join(' ').includes(Math.round(rateOf(g.T, 2)).toLocaleString('en-US') + ' plush per min')) bad.push('lift readout after the load: ' + (info && info.title));
    // it still works: the plush on the lift ride up into the vault, and the hammer takes everything down and gives it back
    const stored0 = L().tiles.size; void stored0; const vault = tiles().find((t) => t.type === 'vault' && t.j === 10);
    for (const t of tiles()) if (t.type === 'belt') t.pw = 1; let s = 0; while (s < 30 && vault.stored.length < 2) { B.step(0.05); s += 0.05; }
    if (vault.stored.length < 2) bad.push('plush on the loaded lift never arrived: ' + vault.stored.length);
    S().items = {}; g.doDecon({ kind: 'tile', id: lift2.id }); if (S().items['lift:2'] !== 10) bad.push('the hammer gave back ' + JSON.stringify(S().items));
    g.doDecon({ kind: 'tile', id: ex2.id }); if (en2.ug.pair != null || S().items['ug:1'] !== 1) bad.push('hammering the loaded exit: ' + JSON.stringify([en2.ug, S().items]));
    void line; void turn; void top; void frame; void cellIdx; void tierOf;
    B.cleanup();
    return bad.length === 0 || bad.join('; ');
  });

  await T('belts.an-old-save-without-marks-loads-as-mk1-and-runs-as-before', async () => {
    B.setup(UP_BASE); const bad = []; const i0 = toI(-11), k0 = toK(0.3);
    const line = B.lay(0, 12, i0, k0, 0); for (const t of line) { delete t.tier; delete t.lift; delete t.ug; }
    const v = B.vaultAt(i0 + 12, k0); void v;
    const a = Object.keys(views()).length; await saveAndLoad(); L().rebuildBelts();
    const belts = tiles().filter((t) => t.type === 'belt' && !t.free); if (belts.length !== a || belts.length !== 12) bad.push('belts after the load: ' + belts.length);
    if (belts.some((t) => tierOf(t) !== 0 || t.lift || t.ug)) bad.push('a plain belt gained a mark, lift or underground field');
    const arr = L().railMesh.instanceColor.array; if (!(arr[0] > arr[2] && arr[1] > arr[2])) bad.push('Mk1 rails are not yellow: ' + [...arr.slice(0, 3)].map((x) => x.toFixed(2)));
    const vault = tiles().find((t) => t.type === 'vault'); const lineNow = belts.sort((x, y) => x.i - y.i); const m = B.measure(lineNow, vault); const want = 1.6 / 0.34 * 60;
    if (m.count < m.total || Math.abs(m.rate - want) / want > 0.05) bad.push(`old belts moved ${m.rate.toFixed(0)} per min, they always did ${want.toFixed(0)}`);
    return bad.length === 0 || bad.join('; ');
  });
}
