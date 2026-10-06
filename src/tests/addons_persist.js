// Add-on audit, part 4: saving and loading. The real save path (g.save() into localStorage 'rotfactory.save.v1') and the real load path
// (loadSaved() then g.loadWorld(), which is what startPlay(false) runs). Everything placed must come back identical: entity data, settings,
// logistics tile, mesh, support, reserved cell, light, hotbar, pack. Then the hammer must still work on the loaded things.
import { makeKit, ALL_UP, FRAME_KEYS, PLACEABLE } from './addons_lib.js';
import { loadSaved } from '../state.js';
import { SAVE_KEY, idx as cellIdx } from '../config.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, V3, fresh, tiles, adv, species, cellX, cellY, cellZ, toI, toJ, toK, realSleep } = ctx;
  const K = makeKit(ctx);
  const BULK = (await import('../plushdata.js')).BULK;

  // save and reload through the real code path. Returns the saved JSON text size, or throws.
  const saveAndLoad = async () => {
    g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) throw new Error('g.save() failed');
    const raw = localStorage.getItem(SAVE_KEY); if (!raw) throw new Error('nothing under ' + SAVE_KEY);
    const saved = loadSaved(); if (!saved || !saved.S) throw new Error('loadSaved() returned nothing');
    g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play';
    return raw.length;
  };
  // make a placed thing carry non-default settings so a lost field cannot hide
  const mutate = (id, e) => {
    const t = L().byId.get(e.id);
    if (id === 'sorter') { t.mode = 2; t.filter = 2; }
    if (id === 'vault') { t.stored.push({ sp: 5, vr: 3 }, { sp: 9, vr: 0 }, { sp: 12, vr: 129 }); }
    if (id === 'gen') { S().carry = []; for (let q = 0; q < 7; q++) S().carry.push({ sp: 2, vr: 0 }); g.useTile(t); S().carry = []; t.burn = 4.8; }
    if (id === 'belt' || id === 'ramp') { t.items.push({ sp: 4, vr: 0, t: 0.4 }, { sp: 6, vr: 2, t: 0.05 }); }
    if (id === 'mech') { t.off = true; }
  };

  // ---------------------------------------------------------------- every placeable item alone
  const ids = [...PLACEABLE];
  for (const id of ids) for (const variant of (id.startsWith('frame:') ? ['grid', 'free'] : [''])) {
    await T('addons.persist.item.' + id + (variant ? '.' + variant : ''), async () => {
      const env = await K.makeEnv(); const bad = [];
      S().money = 1e13; const r = await K.placeAny(id, env, { free: variant === 'free', yaw: 0.37 }); if (!r.ok) return 'placement failed: ' + r.why;
      if (r.kind !== 'cell') for (const e of r.ents) mutate(id, e);
      let cells = null; if (r.kind === 'cell') cells = r.cell; const carved = (r.r && r.r.pl && r.r.pl.ent && r.r.pl.ent.clear) || [];
      const a = K.snapshot(); const size = await saveAndLoad(); const b = K.snapshot();
      const d = K.diffSnap(a, b); if (d.length) bad.push(...d.slice(0, 4));
      if (r.kind === 'cell') { if (w().get(cells.i, cells.j, cells.k) !== BULK) bad.push('bulkhead cell lost'); }
      for (const [ci, cj, ck] of carved) if (w().get(ci, cj, ck)) { bad.push('carved section came back as plush'); break; }
      if (id === 'beacon') { const e = r.ents[0]; if (!w().reserved.has(cellIdx(e.i, e.j, e.k))) bad.push('beacon cell not reserved after load'); if (!g.beaconList().length) bad.push('beaconList empty after load'); }
      if (id === 'sorter') { const t = L().byId.get(r.ents[0].id); if (!t || t.mode !== 2 || t.filter !== 2 || !Array.isArray(t.q)) bad.push('sorter filter lost'); }
      if (id === 'vault') { const t = L().byId.get(r.ents[0].id); if (!t || t.stored.length !== 3 || t.stored[2].vr !== 129 || t.stored[0].sp !== 5) bad.push('vault contents lost'); }
      if (id === 'gen') { const t = L().byId.get(r.ents[0].id); if (!t || t.q.length !== 7 || Math.abs(t.burn - 4.8) > 0.2) bad.push('generator fuel lost: ' + (t && t.q.length) + '/' + (t && t.burn)); }
      if (id === 'splitter') { const t = L().byId.get(r.ents[0].id); if (!t || !t.splitter || !L().objs.has(t.id)) bad.push('splitter flag or model lost'); }
      if (id === 'gate') { const t = L().byId.get(r.ents[0].id); if (!t || !t.detector || !L().objs.has(t.id)) bad.push('gate flag or model lost'); }
      if (id === 'mfan') { const t = L().byId.get(r.ents[0].id); const f = g.machines.items.get(t && t.frameId); if (!t || !t.mounted || !f) bad.push('mounted fan lost its frame link'); else { const o = L().objs.get(t.id); if (Math.abs(o.position.y - (f.ent.y0 + f.ent.h - 0.3)) > 1e-6) bad.push('mounted fan mesh moved'); } }
      if (id.startsWith('frame:')) { const e = r.ents[0], f = g.machines.items.get(e.id); if (!f || (variant === 'free') !== !!e.turned || (variant === 'free' && Math.abs(f.obj.rotation.y - 0.37) > 1e-9) || !w().supports.some((q) => q.id === e.id && q.kind === e.kind)) bad.push(`frame ${variant}: turned ${e && e.turned} yaw ${f && f.obj.rotation.y}`); }
      if (id === 'belt' || id === 'ramp') { const t = L().byId.get(r.ents[0].id); if (!t || t.dir !== (id === 'belt' ? 1 : 3) || t.items.length !== 2) bad.push('belt direction or load lost: dir ' + (t && t.dir)); L().update(0.01); if (L().bedMesh.count < 1) bad.push('belt not drawn after load'); }
      // the hammer still works on the loaded thing and gives the right item
      if (r.kind !== 'cell') for (const e of r.ents) {
        const item = r.give[e.id], n0 = S().items[item] || 0; K.removeEnt(e, r.kind);
        if ((S().items[item] || 0) !== n0 + 1) bad.push(`hammer after load gave ${(S().items[item] || 0) - n0} ${item}`);
        if (g.machines.items.has(e.id) || L().byId.has(e.id) || S().entities.some((x) => x.id === e.id) || w().supports.some((q) => q.id === e.id || q.id === 'shield' + e.id) || w().reserved.has(cellIdx(e.i ?? -1, e.j ?? -1, e.k ?? -1)) && id !== 'borer') bad.push('traces left after hammering the loaded ' + id);
      } else { const n0 = S().items.bulk || 0; g.collect({ type: 'cell', i: cells.i, j: cells.j, k: cells.k, sp: BULK, vr: 0 }); if ((S().items.bulk || 0) !== n0 + 1 || w().get(cells.i, cells.j, cells.k) === BULK) bad.push('bulkhead hammer after load'); }
      void size; return bad.length ? bad.join('; ') : true;
    });
  }

  // ---------------------------------------------------------------- one big combined base
  await T('addons.persist.combined-base-with-everything-comes-back-identical', async () => {
    const env = await K.makeEnv(); const bad = [], placed = [];
    S().money = 1e13;
    const add = async (id, o = {}) => { const r = await K.placeAny(id, env, o); if (!r.ok) bad.push(`could not place ${id}: ${r.why}`); else placed.push({ id, r }); return r; };
    for (const id of Object.keys((await import('./addons_lib.js')).FLOOR)) await add(id);
    for (const id of Object.keys((await import('./addons_lib.js')).OPEN)) await add(id);
    await add('bulk'); { const r = await K.put('bulk', { x: -4.2, z: -3.6, dir: 0 }); if (!r.ok) bad.push('second bulkhead'); }
    // extra belts in every direction, a converted gate and a converted splitter
    for (const [x, z, d] of [[-1.8, 6, 0], [-1.8, 7.2, 2], [-1.8, 8.4, 3]]) { const r = await K.put('belt', { x, z, dir: d }); if (!r.ok) bad.push('belt dir ' + d + ': ' + r.why); }
    for (const id of FRAME_KEYS.map((k) => 'frame:' + k)) await add(id);
    await add('frame:timber', { free: true, yaw: 0.4 }); await add('frame:steel', { free: true, yaw: 1.1 }); await add('frame:concrete', { free: true, yaw: -0.8 });
    await add('mfan'); await add('claw'); await add('borer');
    if (bad.length) return bad.slice(0, 4).join('; ');
    for (const { id, r } of placed) if (r.kind !== 'cell') for (const e of r.ents) mutate(id, e);
    // a rolled out cart with a load, spare items, a filled hotbar and some building material
    S().money = 1e13; g.craftItem('cart:3', 1); K.equip('cart:3'); g.useTool(g.curTool()); S().cart.load.push({ sp: 3, vr: 0 }, { sp: 8, vr: 1 });
    for (const id of ['strut', 'jack', 'medkit', 'canister', 'lantern']) g.craftItem(id, 3); g.craftItem('mat:steel', 25); g.craftItem('mat:timber', 10);
    S().hotbar = ['hammer', 'strut', 'jack', 'medkit', 'lantern', null, null, null, 'canister']; g.rebuildTools(); S().stats.built = 77; S().gear = { helmet: 1 };
    const a = K.snapshot(); const n = a && Object.keys(a.ents).length; const size = await saveAndLoad(); const b = K.snapshot();
    const d = K.diffSnap(a, b); if (d.length) bad.push(`${d.length} differences: ` + d.slice(0, 5).join(' | '));
    if (Object.keys(b.ents).length !== n) bad.push(`entity count ${n} -> ${Object.keys(b.ents).length}`);
    if (!S().cart || S().cart.tier !== 3 || S().cart.load.length !== 2) bad.push('cart lost'); else if (!g.cart.obj) bad.push('cart mesh not rebuilt');
    if (JSON.stringify(S().hotbar) !== JSON.stringify(['hammer', 'strut', 'jack', 'medkit', 'lantern', null, null, null, 'canister'])) bad.push('hotbar changed: ' + JSON.stringify(S().hotbar));
    if (S().mats.steel !== 25 || S().mats.timber !== 10 || S().items.strut !== 3) bad.push('pack changed ' + JSON.stringify([S().mats, S().items.strut]));
    // the loaded base still runs: the generator powers its pole, the belts draw
    const gen = tiles().find((t) => t.type === 'gen'), pole = tiles().find((t) => t.type === 'pole'); adv(2); if (!(gen.q.length > 0 || gen.burn > 0) || !(pole.pw > 0.3)) bad.push(`loaded grid is dead: fuel ${gen.q.length} burn ${gen.burn} pole ${pole.pw}`);
    L().update(0.01); const nb = tiles().filter((t) => t.type === 'belt').length; if (L().bedMesh.count !== nb) bad.push(`belts drawn ${L().bedMesh.count} of ${nb}`);
    // bulkheads and carved sections are in the saved world diff
    for (const { id, r } of placed) { if (id === 'bulk' && w().get(r.cell.i, r.cell.j, r.cell.k) !== BULK) bad.push('bulkhead cell lost'); const clr = (r.r && r.r.pl && r.r.pl.ent && r.r.pl.ent.clear) || []; for (const [ci, cj, ck] of clr) if (w().get(ci, cj, ck)) { bad.push('carved section of ' + id + ' came back'); break; } }
    // take the whole base down with the hammer: every item comes back, no mesh, tile, support or reserved cell is left
    const baseScene = K.sceneCount(); const want = {}; for (const { id, r } of placed) if (r.kind !== 'cell') for (const e of r.ents) { const item = r.give[e.id]; want[item] = (want[item] || 0) + 1; }
    for (const t of [...tiles()]) if (t.mounted) { const o = want.mfan; void o; }
    const have0 = { ...S().items }; S().carry = [];
    for (const e of [...S().entities]) { if (e.free || e.fixed) continue; g.doDecon({ kind: L().byId.has(e.id) ? 'tile' : 'mach', id: e.id }); }
    const got = {}; for (const [k, v] of Object.entries(S().items)) got[k] = v - (have0[k] || 0);
    for (const [item, n2] of Object.entries(want)) if ((got[item] || 0) < n2) bad.push(`hammer returned ${got[item] || 0} ${item}, expected ${n2}`);
    const left = S().entities.filter((e) => !e.free && !e.fixed); if (left.length) bad.push('entities left after hammering everything: ' + left.map((e) => e.type).join());
    if (w().supports.length) bad.push('supports left: ' + w().supports.length); const keep = new Set(); for (const e of S().entities) keep.add(cellIdx(e.i ?? -1, e.j ?? -1, e.k ?? -1)); for (const key of w().reserved) if (!keep.has(key)) { bad.push('reserved cells left'); break; }
    if (K.sceneCount() >= baseScene) bad.push('scene did not shrink after taking everything down');
    void size; return bad.length ? bad.slice(0, 6).join('; ') : true;
  });

  await T('addons.persist.save-reload-twice-does-not-duplicate-or-lose-anything', async () => {
    const env = await K.makeEnv(); const bad = []; S().money = 1e13;
    for (const id of ['belt', 'gen', 'pole', 'sorter', 'vault', 'strut', 'lantern', 'frame:steel', 'mfan']) { const r = await K.placeAny(id, env); if (!r.ok) return id + ': ' + r.why; if (r.kind !== 'cell') for (const e of r.ents) mutate(id, e); }
    const a = K.snapshot(); await saveAndLoad(); await saveAndLoad(); await saveAndLoad(); const b = K.snapshot(); const d = K.diffSnap(a, b); if (d.length) bad.push(...d.slice(0, 3));
    const ids2 = S().entities.map((e) => e.id); if (new Set(ids2).size !== ids2.length) bad.push('duplicate entity ids');
    // ids keep counting up after load, never colliding
    const nid = g.nextId(); if (ids2.includes(nid)) bad.push('nextId collides with a loaded entity');
    return bad.length ? bad.join('; ') : true;
  });

  await T('addons.persist.old-saves-without-the-new-fields-still-load', async () => {
    const env = await K.makeEnv(); const bad = []; S().money = 1e13; for (const id of ['belt', 'sorter', 'vault', 'frame:timber', 'strut']) { const r = await K.placeAny(id, env); if (!r.ok) return id + ': ' + r.why; }
    g.noSave = false; g.mode = 'play'; g.save(); g.noSave = true; const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    // strip the fields a save from before hotbars, materials and mounted fans would lack
    delete saved.S.hotbar; delete saved.S.mats; delete saved.S.items; for (const e of saved.S.entities) { delete e.yaw; delete e.turned; delete e.filter; delete e.mode; delete e.stored; delete e.items; delete e.q; delete e.kept; }
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); const s2 = loadSaved(); try { g.loadWorld(s2.S, s2); } catch (e) { return 'old save threw: ' + e.message; }
    if (!Array.isArray(S().hotbar) || S().hotbar[0] !== 'hammer') bad.push('hotbar not rebuilt'); if (!S().mats || !S().items) bad.push('mats/items not defaulted');
    const so = tiles().find((t) => t.type === 'sorter'); if (!so || so.filter !== 7 || so.mode !== 0 || !Array.isArray(so.q)) bad.push('sorter defaults'); const va = tiles().find((t) => t.type === 'vault'); if (!va || !Array.isArray(va.stored)) bad.push('vault storage default');
    const fr = S().entities.find((e) => e.type === 'frame'); const it = fr && g.machines.items.get(fr.id); if (!it) bad.push('frame not rebuilt'); adv(0.5);
    return bad.length ? bad.join('; ') : true;
  });
  void species; void cellX; void cellY; void cellZ; void toI; void toJ; void toK; void p; void V3; void fresh;
}
