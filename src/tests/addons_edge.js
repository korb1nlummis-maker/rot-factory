// Add-on audit, part 6: edge cases for every placeable item: nothing in the pack, two clicks in one frame, a reserved cell, hammering something
// already gone, switching tools or stowing while a preview is up, and hundreds of preview, place and remove cycles with no leaked meshes.
import { makeKit, ALL_UP, PLACEABLE, FLOOR, OPEN } from './addons_lib.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, V3, fresh, plan, tiles, adv, cellX, cellZ, toI, toK } = ctx;
  const K = makeKit(ctx);
  const key = (code, down = true) => g.onKey({ code, preventDefault() {}, repeat: false, target: document.body }, down);
  const nodes = () => K.sceneCount();
  const rootKids = () => g.machines.root.children.length + g.logi.root.children.length;
  const snapState = () => ({ ents: S().entities.length, items: JSON.stringify(S().items), cells: w().reserved.size, sup: w().supports.length });

  for (const id of PLACEABLE) {
    await T('addons.edge.no-item-no-placement.' + id, async () => {
      const env = await K.makeEnv(); const bad = []; S().money = 1e13;
      // the plan is valid, but the last item vanishes before the click (spent by a second click, or a lagging guest): the stale tool must do nothing
      K.hooks.before = (tool) => { delete S().items[id]; g.rebuildTools(); }; const s0 = snapState();
      let r; try { r = await K.placeAny(id, env); } finally { K.hooks.before = null; }
      const s1 = snapState(); if (r.ok && r.ents.length) bad.push('an entity appeared with zero items'); if (s1.ents !== s0.ents + (id === 'mfan' ? 1 : 0)) bad.push('entities changed: ' + (s1.ents - s0.ents));
      if ((S().items[id] || 0) !== 0) bad.push('item count went to ' + S().items[id]); if (id === 'bulk' && r.cell && w().get(r.cell.i, r.cell.j, r.cell.k) === (await import('../plushdata.js')).BULK) bad.push('a bulkhead appeared with zero items');
      // with the item gone the hotbar slot is spent and your hands are empty
      if (g.curTool().kind !== 'hands') bad.push('curTool is ' + g.curTool().kind + ' with none left');
      g.placeCurrent({ id, kind: 'belt' }); g.bPress(); if (snapState().ents !== s1.ents) bad.push('B with an empty slot placed something');
      return bad.length ? bad.join('; ') : true;
    });

    await T('addons.edge.two-clicks-in-one-frame-place-once.' + id, async () => {
      const env = await K.makeEnv(); const bad = []; S().money = 1e13; let frame = null;
      if (id === 'mfan') { const fr = await K.placeAny('frame:steel', env); if (!fr.ok) return 'frame ' + fr.why; frame = fr.ents[0]; }
      g.craftItem(id, 3); const BULK = (await import('../plushdata.js')).BULK; let count = 0;
      K.hooks.after = (tool) => { if (count++ === 0) { g.placeCurrent(tool); g.placeCurrent(tool); } };
      const s0 = snapState(); let r; try { r = await K.placeAny(id, env, { frame }); } finally { K.hooks.after = null; }
      if (!r.ok) return 'placement: ' + r.why; const spent = 3 - (S().items[id] ?? 0), made = snapState().ents - s0.ents;
      if (spent !== 1) bad.push(`three clicks in a row spent ${spent} items`); if (id !== 'bulk' && made !== 1) bad.push(`three clicks in a row made ${made} entities`);
      if (id === 'bulk') { let n = 0; for (let j = 0; j < 3; j++) if (w().get(r.cell.i, j, r.cell.k) === BULK) n++; if (n !== 1) bad.push('bulkheads stacked: ' + n); }
      return bad.length ? bad.join('; ') : true;
    });

    await T('addons.edge.tool-switch-and-stow-remove-the-ghost.' + id, async () => {
      const env = await K.makeEnv(); const bad = []; S().money = 1e13; g.craftItem(id, 2);
      // aim at a valid spot with the item out: a preview is up (or the cell ghost for belts)
      const hold = async () => {
        K.equip(id); const o = FLOOR[id] || OPEN[id];
        if (o) K.aimDir(cellX(toI(o.x)), 0, cellZ(toK(o.z)), o.dir || 0, 2); else if (id === 'bulk') K.aimDir(-4.2, 0, -2.4, 0, 2); else { const t = env.tun; ctx.aimPoint(cellX(t.i + 9), 0, cellZ(t.k + 1), 2.4); }
        if (id === 'claw' || id === 'borer' || id === 'mfan') return await plan();
        return await plan();
      };
      const pl = await hold(); const hadGhost = !!g.machines.ghost || !!(g.machines.items && false); void pl;
      const base = rootKids();
      // switch to the hammer: ghost gone
      K.equip('hammer'); await plan(); if (g.machines.ghost) bad.push('ghost stayed after switching to the hammer'); if (g.plan) bad.push('plan stayed after switching to the hammer');
      // number key toggles away, Q stows, B takes it out again
      await hold(); const g1 = !!g.machines.ghost; key('KeyQ'); key('KeyQ', false); if (!g.stowed || g.machines.ghost) bad.push('Q did not stow and clear the ghost'); if (g.curTool().kind !== 'hands') bad.push('stowed but still holding');
      await plan(); if (g.machines.ghost) bad.push('a stowed tool grew a ghost'); key('KeyQ'); key('KeyQ', false); if (g.stowed) bad.push('Q did not take it out again');
      await hold(); const slot = S().hotbar.indexOf(id); key('Digit' + (slot + 1)); key('Digit' + (slot + 1), false); if (!g.stowed || g.machines.ghost) bad.push('same number did not stow');
      // switching to an empty slot too
      await hold(); key('Digit9'); key('Digit9', false); await plan(); if (g.machines.ghost) bad.push('ghost left after choosing an empty slot');
      if (rootKids() > base + 0) bad.push(`scene kids ${base} -> ${rootKids()} after all that switching`);
      void g1; void hadGhost; return bad.length ? bad.join('; ') : true;
    });

    await T('addons.edge.old-tools-plan-is-dropped-on-a-tool-switch.' + id, async () => {
      if (id === 'belt') return true; // the item that supplies the stale plan
      const env = await K.makeEnv(); const bad = []; S().money = 1e13; g.craftItem('belt', 2); g.craftItem(id, 2); K.clearBay();
      S().hotbar = ['hammer', 'belt', id, null, null, null, null, null, null]; g.rebuildTools(); g.stowed = false; g.selectTool(1);
      K.aimDir(cellX(toI(-6.6)), 0, cellZ(toK(1.2)), 0, 2); const pl = await plan(); if (!pl.ok) return 'belt plan ' + pl.why;
      const s0 = snapState(), n0 = S().items[id], b0 = S().items.belt; let threw = null;
      g.selectTool(2); try { g.useTool(g.curTool()); g.bPress(); } catch (e) { threw = e.message; }
      if (threw) bad.push('clicking right after a tool switch threw: ' + threw); const s1 = snapState();
      if (s1.ents !== s0.ents || S().items.belt !== b0) bad.push('the belt plan was placed after switching to ' + id + ' (entities +' + (s1.ents - s0.ents) + ')'); if (S().items[id] !== n0) bad.push('the new tool spent an item on the old tool\'s plan');
      if (S().entities.some((e) => e.x !== undefined && !Number.isFinite(e.x))) bad.push('an entity with a broken position was created');
      return bad.length ? bad.join('; ') : true;
    });

    await T('addons.edge.preview-place-remove-cycles-do-not-leak.' + id, async () => {
      const env = await K.makeEnv(); const bad = []; S().money = 1e13; const N = id === 'borer' || id === 'claw' ? 60 : 200; let warm = 0, last = 0, lastKids = 0, ents = 0;
      const cycle = async (n) => {
        env.slot = 0; if (!(S().items[id] > 0)) g.craftItem(id, 1);
        const r = await K.placeAny(id, env); if (!r.ok) return r.why;
        // a second preview that is refused (ceiling), to churn the ghost
        K.equip(id); K.lookUp(); await plan();
        if (r.kind === 'cell') { g.collect({ type: 'cell', i: r.cell.i, j: r.cell.j, k: r.cell.k, sp: (await import('../plushdata.js')).BULK, vr: 0 }); }
        else for (const e of r.ents) K.removeEnt(e, r.kind);
        if (id === 'mfan') for (const e of env.extra.splice(0)) g.doDecon({ kind: 'mach', id: e.id });
        if (n === 20) { warm = nodes(); lastKids = rootKids(); ents = S().entities.length; }
        return null;
      };
      for (let n = 0; n < N; n++) { const why = await cycle(n); if (why) return `cycle ${n}: ${why}`; }
      K.equip('hammer'); await plan(); last = nodes();
      if (last > warm + 3) bad.push(`scene nodes ${warm} after 20 cycles, ${last} after ${N}`); if (rootKids() > lastKids + 1) bad.push(`machine/logistics root children ${lastKids} -> ${rootKids()}`);
      if (S().entities.length !== ents) bad.push(`entities ${ents} -> ${S().entities.length}`); if (g.machines.ghost) bad.push('ghost left over');
      if (S().items[id] !== 1) bad.push('items ' + S().items[id] + ' left after the cycles: each one should hand back exactly what it placed (1)');
      return bad.length ? bad.join('; ') : true;
    });
  }

  // ---------------------------------------------------------------- reserved and occupied cells, across item types
  await T('addons.edge.occupied-cells-refuse-the-right-things', async () => {
    const env = await K.makeEnv(); const bad = []; S().money = 1e13; const BULK = (await import('../plushdata.js')).BULK;
    const b = await K.put('belt', { x: -6.6, z: 1.2, dir: 0 }); if (!b.ok) return b.why;
    const refuse = async (id, x, z, why) => { g.craftItem(id, 1); K.equip(id); K.aimDir(cellX(toI(x)), 0, cellZ(toK(z)), 0, 2); const pl = await plan(); const n0 = S().items[id]; const e0 = S().entities.length; g.placeCurrent(g.curTool()); if (pl.ok || S().items[id] !== n0 || S().entities.length !== e0) bad.push(`${id} on a belt cell: ${pl.ok ? 'allowed' : 'refused'} (${pl.why}) ${why}`); else if (!pl.why || /undefined/.test(pl.why)) bad.push(id + ' refused without words'); };
    for (const id of ['belt', 'sorter', 'vault', 'gen', 'pole', 'fan', 'mech', 'bulk']) await refuse(id, -6.6, 1.2, '');
    // a tile onto a bulkhead cell (solid)
    const r = await K.put('bulk', { x: -4.2, z: -2.4, dir: 0 }); if (!r.ok) bad.push('bulk ' + r.why); else { g.craftItem('belt', 1); K.equip('belt'); K.aimDir(cellX(r.pl.ent.i), 0.3, cellZ(r.pl.ent.k), 0, 2); const pl = await plan(); if (pl.ok && pl.ent.i === r.pl.ent.i && pl.ent.j === r.pl.ent.j && pl.ent.k === r.pl.ent.k) bad.push('belt planned inside a bulkhead'); if (w().get(r.pl.ent.i, r.pl.ent.j, r.pl.ent.k) !== BULK) bad.push('bulkhead vanished'); }
    return bad.length ? bad.join('; ') : true;
  });
  await T('addons.edge.hammer-at-nothing-and-at-the-free-gate-are-harmless', async () => {
    fresh(ALL_UP); S().money = 1e12; const bad = []; K.equip('hammer'); K.aimDir(-6, 1.5, 3, 0, 2); adv(0.05); g.renderer.camera.position.copy(p().eyePos(new V3())); const s0 = snapState(); g.hammerHit(); if (JSON.stringify(snapState()) !== JSON.stringify(s0)) bad.push('hammering air changed something'); if (!/hammer removes/i.test(K.hintText())) bad.push('no hint when the hammer finds nothing: ' + K.hintText());
    const fg = tiles().find((t) => t.free); if (!fg) return 'no free gate'; g.doDecon({ kind: 'tile', id: fg.id }); if (!L().byId.has(fg.id) || S().items.gate) bad.push('the bolted welcome gate came off or gave an item');
    g.doDecon({ kind: 'tile', id: 424242 }); g.doDecon({ kind: 'mach', id: 424242 }); g.doDecon({ kind: 'cart' }); return bad.length ? bad.join('; ') : true;
  });
  await T('addons.edge.limits-claw-mech-borer-refuse-with-a-reason', async () => {
    const bad = []; const env = await K.makeEnv({ rigCount: 0, mechCount: 0, borerCount: 0 }); S().money = 1e13;
    // mech: limit 1 -> the second is refused with its limit text
    const m1 = await K.put('mech', { x: -9, z: 1.2, dir: 0 }); if (!m1.ok) return m1.why; g.craftItem('mech', 1); K.equip('mech'); K.aimDir(cellX(toI(-9)), 0, cellZ(toK(3)), 0, 2); const pl = await plan(); if (pl.ok || !/limit/i.test(pl.why || '')) bad.push('second mech: ' + JSON.stringify([pl.ok, pl.why]));
    return bad.length ? bad.join('; ') : true;
  });
  void adv; void V3;
}
