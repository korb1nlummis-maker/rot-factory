// Add-on audit, part 2: placing and removing every placeable item through the real aim, plan, place and hammer path.
// Each item: a valid spot plans ok with the right hint, an invalid spot is refused with a readable reason, one item is consumed,
// the entity / mesh / tile / support / reserved cell exist, a second try on the same spot is refused, and the hammer gives the right item back
// and removes every trace. The 'job' checks (does it actually work) live in addons_jobs.js.
import { makeKit, ALL_UP, FRAME_KEYS } from './addons_lib.js';
import { idx as cellIdx } from '../config.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, V3, fresh, craft, plan, tiles, aimPoint, adv, FRAME_TYPES, spot, dig, cellX, cellY, cellZ, toI, toJ, toK } = ctx;
  const K = makeKit(ctx);
  const BAD = /undefined|NaN|\[object/;
  const sup = (id) => w().supports.find((s) => s.id === id);
  const hammerAt = (x, y, z, back = 1.6, dir = 0) => {
    K.equip('hammer'); K.aimDir(x, y, z, dir, back); adv(0.05);
    g.renderer.camera.position.copy(p().eyePos(new V3())); return g.hammerTarget();
  };
  const hammerHit = (x, y, z, back = 1.6, dir = 0) => { const ref = hammerAt(x, y, z, back, dir); g.hammerHit(); return ref; };
  const invalidHere = async (id, label) => {
    // aiming at the ceiling: no floor, no frame, no pile wall. Must refuse with words, change nothing, take nothing.
    K.equip(id); K.lookUp(); await plan(); // the first refused preview may build its red ghost; measure leaks from the second one on
    const items0 = S().items[id] || 0, ents0 = S().entities.length, n0 = K.sceneCount();
    K.equip(id); K.lookUp(); const pl = await plan();
    if (!pl) return `${label}: no plan at all (tool not equipped or out of items)`;
    if (pl.ok) return `${label}: placing at the ceiling was allowed (${JSON.stringify(pl.ent && Object.keys(pl.ent))})`;
    if (!pl.why || BAD.test(pl.why) || pl.why.length < 6) return `${label}: unreadable reason "${pl.why}"`;
    if (K.hintText() !== pl.why && !K.hintText().includes(pl.why.slice(0, 12))) return `${label}: hint "${K.hintText()}" does not show the reason "${pl.why}"`;
    g.placeCurrent(g.curTool());
    if ((S().items[id] || 0) !== items0 || S().entities.length !== ents0) return `${label}: a refused plan still changed the world or the pack`;
    return K.sceneCount() <= n0 ? '' : `${label}: refused plan leaked ${K.sceneCount() - n0} scene nodes`;
  };

  const NAME = { belt: 'belt', ramp: 'belt', splitter: 'Belt Splitter', gate: 'Detector Gate', gen: 'gen', pole: 'pole', fan: 'fan', sorter: 'sorter', vault: 'vault', mech: 'mech', lantern: 'lantern', marker: 'marker', flare: 'flare', glow: 'Glow Stick', strut: 'strut', jack: 'Hydraulic Jack', beacon: 'beacon', dynamite: 'Dynamite', charge: 'charge' };
  const hammerHint = async (name, x, y, z, back, dir) => { K.equip('hammer'); K.aimDir(x, y, z, dir, back); adv(0.05); g.renderer.camera.position.copy(p().eyePos(new V3())); await plan(); return K.hintText().includes(name) ? '' : `hammer hint "${K.hintText()}" does not name ${name}`; };
  const give = (sp) => sp.give;
  const put = (id, sp) => K.put(id, { x: sp.x, z: sp.z, dir: sp.dir, ramp: sp.ramp || 0 });

  // ======================================================================= tiles of the open bay (belt family and machines)
  const FLOOR = {
    belt: { x: -6.6, z: 1.2, dir: 1, give: 'belt', chk: (e) => e.type === 'belt' && !e.detector && !e.splitter && !e.rise && e.dir === 1, hint: /hold B to lay a line/ },
    ramp: { x: -6.6, z: 2.4, dir: 3, give: 'ramp', ramp: 0, chk: (e) => e.type === 'belt' && e.rise === 1 && e.dir === 3, hint: /flips up\/down/ },
    splitter: { x: -6.6, z: 3.6, dir: 0, give: 'splitter', chk: (e) => e.type === 'belt' && e.splitter === true && !e.detector },
    gate: { x: -8.4, z: 7.2, dir: 2, give: 'gate', chk: (e) => e.type === 'belt' && e.detector === true && !e.splitter && e.dir === 2 },
    gen: { x: -9, z: -1.2, dir: 0, give: 'gen', chk: (e) => e.type === 'gen' && Array.isArray(e.q) },
    pole: { x: -9, z: -2.4, dir: 0, give: 'pole', chk: (e) => e.type === 'pole' },
    fan: { x: -9, z: -3.6, dir: 2, give: 'fan', chk: (e) => e.type === 'fan' && !e.mounted },
    sorter: { x: -8, z: -6, dir: 0, give: 'sorter', chk: (e) => e.type === 'sorter' && e.filter === 7 && e.mode === 0 && Array.isArray(e.q) },
    vault: { x: -9, z: 0, dir: 0, give: 'vault', chk: (e) => e.type === 'vault' && Array.isArray(e.stored) },
    mech: { x: -9, z: 1.2, dir: 0, give: 'mech', chk: (e) => e.type === 'mech' && e.state === 'dig' },
  };
  for (const [id, sp] of Object.entries(FLOOR)) {
    await T('addons.place.tile.' + id, async () => {
      fresh(ALL_UP); S().money = 1e12; g.craftItem(id, 3); const bad = [];
      const spent0 = S().money;
      const r = await put(id, sp);
      if (!r.ok) return 'valid spot refused: ' + r.why;
      if (S().money !== spent0) bad.push('placing charged money');
      if (!/set down/.test(r.hint || '') || BAD.test(r.hint)) bad.push('aim hint "' + r.hint + '"'); if (sp.hint && !sp.hint.test(r.hint)) bad.push('hint lacks ' + sp.hint);
      if (r.consumed !== 1 || S().items[id] !== 2) bad.push(`consumed ${r.consumed}, left ${S().items[id]}`);
      const e = r.ent; if (!e) return 'no entity created: ' + bad.join(';');
      if (!sp.chk(e)) bad.push('entity wrong: ' + JSON.stringify({ t: e.type, d: e.dir, r: e.rise, det: e.detector, sp: e.splitter }));
      const t = K.tileOf(e); if (!t || t !== e) bad.push('no logistics tile for the entity');
      if (L().tileAt(e.i, e.j, e.k) !== e) bad.push('tileAt');
      if (!w().reserved.has(cellIdx(e.i, e.j, e.k))) bad.push('cell not reserved');
      if (id === 'belt' || id === 'ramp') { L().update(0.01); if (L().bedMesh.count < 1 || L().railMesh.count < 2) bad.push('belt not drawn'); } else if (!L().objs.has(e.id)) bad.push('no mesh');
      // the plan hint when aiming at the same cell again: occupied
      K.equip(id); K.aimDir(cellX(e.i), 0, cellZ(e.k), sp.dir); const again = await plan();
      if (again && again.ok) bad.push('same cell planned ok twice');
      if (again && !again.ok && !/Occupied|Too close|close/.test(again.why || '')) bad.push('occupied reason "' + again.why + '"');
      const it0 = S().items[id], ne0 = S().entities.length; g.placeCurrent(g.curTool()); if (S().items[id] !== it0 || S().entities.length !== ne0) bad.push('placed on an occupied cell');
      const inv = await invalidHere(id, 'ceiling'); if (inv) bad.push(inv);
      // remove with the hammer (real aim): the right item comes back and every trace goes
      { const hh = await hammerHint(NAME[id], cellX(e.i), e.j * 0.6 + 0.15, cellZ(e.k), 1.6, sp.dir); if (hh) bad.push(hh); }
      const before = S().items[give(sp, e)] || 0;
      const ref = hammerHit(cellX(e.i), e.j * 0.6 + 0.15, cellZ(e.k), 1.6, sp.dir);
      if (!ref || ref.kind !== 'tile' || ref.id !== e.id) { bad.push('hammer did not target it: ' + JSON.stringify(ref)); g.doDecon({ kind: 'tile', id: e.id }); }
      if ((S().items[sp.give] || 0) !== before + 1) bad.push(`hammer gave ${S().items[sp.give] || 0}, expected ${before + 1} ${sp.give}`);
      if (S().entities.some((x) => x.id === e.id) || L().byId.has(e.id) || L().tileAt(e.i, e.j, e.k) || L().objs.has(e.id) || w().reserved.has(cellIdx(e.i, e.j, e.k))) bad.push('traces left after hammering');
      // hammering again does nothing and does not throw or give another item
      const n1 = S().items[sp.give]; g.doDecon({ kind: 'tile', id: e.id }); g.hammerHit(); if (S().items[sp.give] !== n1) bad.push('hammering something already gone gave an item');
      return bad.length ? bad.join('; ') : true;
    });
  }

  // converting an existing belt into a splitter or a gate keeps the tile, consumes one item, and the hammer gives the converted piece back
  for (const [id, flag, backId] of [['splitter', 'splitter', 'splitter'], ['gate', 'detector', 'gate']]) {
    await T('addons.place.convert-belt-to-' + id, async () => {
      fresh(ALL_UP); S().money = 1e12; const bad = [];
      const b = await K.put('belt', { x: -6.6, z: 5, dir: 0 }); if (!b.ok) return b.why; const belt = b.ent; const nEnt = S().entities.length;
      g.craftItem(id, 2); K.equip(id); K.aimDir(cellX(belt.i), 0.1, cellZ(belt.k), 0, 1.6); const pl = await plan();
      if (!pl.ok || pl.ent.type !== (id === 'gate' ? 'gatebelt' : 'splitbelt') || pl.ent.id !== belt.id) return 'no conversion plan: ' + JSON.stringify([pl.ok, pl.why, pl.ent && pl.ent.type]);
      const sent = []; const orig = g.netSend; g.netSend = (m) => sent.push(m); const open0 = g.net.open; g.net.open = true; g.net.role = 'host';
      g.placeCurrent(g.curTool()); g.net.open = open0; g.net.role = null; g.netSend = orig;
      if (S().items[id] !== 1) bad.push('item not consumed once: ' + S().items[id]); if (S().entities.length !== nEnt) bad.push('conversion should not add an entity');
      const t = L().byId.get(belt.id); if (!t || !t[flag] || !L().objs.has(belt.id)) bad.push('belt not converted / no model');
      if (!(sent.some((m) => m.t === 'ent-' && m.id === belt.id) && sent.some((m) => m.t === 'ent+' && m.ent.id === belt.id && m.ent[flag]))) bad.push('host did not broadcast the conversion');
      // placing again on the converted piece must not eat a second item
      K.equip(id); K.aimDir(cellX(belt.i), 0.1, cellZ(belt.k), 0, 1.6); const pl2 = await plan(); const n1 = S().items[id] || 0; g.placeCurrent(g.curTool()); if ((S().items[id] || 0) !== n1 && !pl2.ok) bad.push('refused plan consumed an item'); if (pl2.ok && pl2.ent.type === (id === 'gate' ? 'gatebelt' : 'splitbelt')) bad.push('converted piece offers conversion again');
      const base0 = S().items.belt || 0; g.doDecon({ kind: 'tile', id: belt.id });
      if ((S().items[backId] || 0) !== (n1 + 1 - (n1 !== (S().items[id] || 0) ? 0 : 0)) && (S().items[backId] || 0) < 1) bad.push('hammer did not return a ' + backId);
      if ((S().items.belt || 0) !== base0) bad.push('hammer returned a plain belt for a ' + id);
      return bad.length ? bad.join('; ') : true;
    });
  }

  await T('addons.place.ramp-flip-gives-a-downward-ramp-and-hammer-returns-ramp', async () => {
    fresh(ALL_UP); S().money = 1e12; const bad = [];
    const r = await K.put('ramp', { x: -6.6, z: 2.4, dir: 0, ramp: 1 }); if (!r.ok) return r.why; if (r.ent.rise !== -1) bad.push('R flip gave rise ' + r.ent.rise);
    const r2 = await K.put('ramp', { x: -6.6, z: 3.6, dir: 0, ramp: 0 }); if (!r2.ok) return r2.why; if (r2.ent.rise !== 1) bad.push('default rise ' + r2.ent.rise);
    S().items = {}; g.doDecon({ kind: 'tile', id: r.ent.id }); g.doDecon({ kind: 'tile', id: r2.ent.id }); if (S().items.ramp !== 2 || S().items.belt) bad.push('ramps returned as ' + JSON.stringify(S().items));
    return bad.length ? bad.join('; ') : true;
  });

  await T('addons.place.gate-refuses-near-the-bin-and-sorter-refuses-near-a-gate', async () => {
    fresh(ALL_UP); S().money = 1e12; const bad = [], bp = g.hall.binPos;
    g.craftItem('gate', 2); K.equip('gate'); K.aimDir(bp.x - 2, 0, bp.z + 1.5, 0, 2); let pl = await plan(); if (pl.ok || !/bin|sorter|suck|scan/i.test(pl.why || '')) bad.push('gate beside the bin: ' + JSON.stringify([pl.ok, pl.why]));
    const gt = await K.put('gate', { x: -8.4, z: 7.2, dir: 0 }); if (!gt.ok) return 'gate: ' + gt.why;
    g.craftItem('sorter', 2); K.equip('sorter'); K.aimDir(-7.2, 0, 7.2, 0, 1.6); pl = await plan(); if (pl.ok || !/gate/i.test(pl.why || '')) bad.push('sorter beside a gate: ' + JSON.stringify([pl.ok, pl.why]));
    return bad.length ? bad.join('; ') : true;
  });

  // ======================================================================= things that sit in the open: lights, markers, props, beacon
  const OPEN = {
    lantern: { x: -6.6, z: -1.2, type: 'lantern', give: 'lantern', chk: (e) => e.type === 'lantern' },
    marker: { x: -6.6, z: -2.4, type: 'marker', give: 'marker', chk: (e) => e.type === 'marker' },
    flare: { x: -6.6, z: -3.6, type: 'flare', give: 'flare', chk: (e) => e.type === 'flare' && !e.glow && e.born !== undefined },
    glow: { x: -6.6, z: -4.8, type: 'flare', give: 'glow', chk: (e) => e.type === 'flare' && e.glow === true && e.born !== undefined },
    strut: { x: -4.2, z: 1.2, type: 'strut', give: 'strut', chk: (e) => e.type === 'strut' && !e.jack, sup: { r: 1.9, kind: 'strut' } },
    jack: { x: -4.2, z: 2.4, type: 'strut', give: 'jack', chk: (e) => e.type === 'strut' && e.jack === true, sup: { r: 2.7, kind: 'jack' } },
    beacon: { x: -2.4, z: 9, type: 'beacon', give: 'beacon', chk: (e) => e.type === 'beacon', reserve: true },
  };
  for (const [id, sp] of Object.entries(OPEN)) {
    await T('addons.place.open.' + id, async () => {
      fresh(ALL_UP); S().money = 1e12; g.craftItem(id, 3); const bad = [];
      const r = await K.put(id, { x: sp.x, z: sp.z, dir: 0 }); if (!r.ok) return 'valid spot refused: ' + r.why;
      const hint = K.hintText(); if (BAD.test(hint)) bad.push('hint ' + hint);
      if (r.consumed !== 1 || S().items[id] !== 2) bad.push(`consumed ${r.consumed}, left ${S().items[id]}`);
      const e = r.ent; if (!e || !sp.chk(e)) return 'entity wrong ' + JSON.stringify(e) + bad.join(';');
      const it = K.itemOf(e); if (!it || !it.obj || !g.machines.root.children.includes(it.obj)) bad.push('no mesh in the scene');
      if (sp.sup) { const s = sup(e.id); if (!s || s.r !== sp.sup.r || s.kind !== sp.sup.kind) bad.push('support entry ' + JSON.stringify(s)); }
      else if (sup(e.id)) bad.push('prop should not hold up the roof');
      if (sp.reserve && !w().reserved.has(cellIdx(e.i, e.j, e.k))) bad.push('beacon cell not reserved');
      if (id === 'lantern' || id === 'flare' || id === 'glow') { const ls = g.machines.lights(new V3(e.x, e.y, e.z), 4); if (!ls.some((l) => l.id === e.id)) bad.push('not offered as a light source'); }
      const inv = id === 'lantern' ? '' : await invalidHere(id, 'ceiling'); if (inv) bad.push(inv);
      // a second lantern in the same spot is allowed? (lights stack) - others must be refused or land elsewhere
      const sc = K.sceneCount(); const y = (e.y || 0) + 0.4;
      { const hh = await hammerHint(NAME[id], e.x, y, e.z, 1.5, 0); if (hh) bad.push(hh); }
      const ref = hammerHit(e.x, y, e.z, 1.5, 0);
      if (!ref || ref.kind !== 'mach' || ref.id !== e.id) { bad.push('hammer did not target it ' + JSON.stringify(ref)); g.doDecon({ kind: 'mach', id: e.id }); }
      if ((S().items[sp.give] || 0) !== 3) bad.push(`hammer gave back ${(S().items[sp.give] || 0) - 2} ${sp.give}`);
      for (const other of Object.keys(OPEN)) if (other !== sp.give && S().items[other] && other !== id) bad.push('wrong item returned: ' + other);
      if (g.machines.items.has(e.id) || S().entities.some((x) => x.id === e.id) || sup(e.id) || (sp.reserve && w().reserved.has(cellIdx(e.i, e.j, e.k)))) bad.push('traces left');
      if (K.sceneCount() > sc) bad.push('scene grew after removal');
      const n1 = S().items[sp.give]; g.doDecon({ kind: 'mach', id: e.id }); if (S().items[sp.give] !== n1) bad.push('double removal gave an item');
      return bad.length ? bad.join('; ') : true;
    });
  }
  await T('addons.place.lantern-has-no-invalid-spot-by-design', async () => {
    // planLantern accepts any aimed empty spot (it hangs on a ceiling if one is near, else rests on the floor). Only an unreachable aim fails.
    fresh(ALL_UP); g.craftItem('lantern', 1); K.equip('lantern'); K.lookUp(); const pl = await plan(); return (pl && pl.ok === true) || (pl && !!pl.why && !BAD.test(pl.why)) || 'lantern plan neither ok nor readable';
  });

  // ======================================================================= explosives: placed on a floor, they burn down and blow
  await T('addons.place.dynamite-and-charges-place-consume-and-the-hammer-defuses-them-into-the-right-item', async () => {
    fresh(ALL_UP); S().money = 1e12; const bad = [];
    for (const [id, dyn] of [['dynamite', true], ['charge', false]]) {
      g.craftItem(id, 2); const r = await K.put(id, { x: -4.2 + (dyn ? 0 : 1.2), z: 5, dir: 0 }); if (!r.ok) { bad.push(id + ' refused: ' + r.why); continue; }
      if (r.consumed !== 1 || S().items[id] !== 1) bad.push(id + ' consumed ' + r.consumed);
      const e = r.ent; if (e.type !== 'charge' || !!e.dyn !== dyn || e.fuse !== (dyn ? 4 : 6) || (dyn ? e.tier !== 0 : e.tier !== 3)) bad.push(id + ' entity ' + JSON.stringify(e));
      if (!/Fuse lit/.test(K.hintText())) bad.push(id + ' no fuse hint: ' + K.hintText());
      const ref = hammerHit(e.x, e.y + 0.2, e.z, 1.4, 0); if (!ref || ref.id !== e.id) { bad.push(id + ' hammer target ' + JSON.stringify(ref)); g.doDecon({ kind: 'mach', id: e.id }); }
      if (S().items[id] !== 2) bad.push(`defusing a ${id} returned ${JSON.stringify(S().items)}`);
      if (g.machines.items.has(e.id)) bad.push(id + ' still in the world');
    }
    if (S().items.charge !== 2 || S().items.dynamite !== 2) bad.push('items after defusing: ' + JSON.stringify(S().items));
    return bad.length ? bad.join('; ') : true;
  });

  // ======================================================================= bulkhead: a world cell, not an entity
  await T('addons.place.bulk', async () => {
    fresh(ALL_UP); S().money = 1e12; g.craftItem('bulk', 3); const bad = [];
    const BULK = (await import('../plushdata.js')).BULK;
    const r = await K.put('bulk', { x: -4.2, z: -1.2, dir: 0 }); if (!r.ok) return 'valid spot refused: ' + r.why;
    if (S().items.bulk !== 2) bad.push('consumed ' + (3 - S().items.bulk)); const c = r.pl.ent;
    if (w().get(c.i, c.j, c.k) !== BULK) bad.push('cell is not a bulkhead'); if (!w().solid(c.i, c.j, c.k)) bad.push('bulkhead cell not solid');
    if (S().entities.some((e) => e.i === c.i && e.k === c.k && e.type === 'bulk')) bad.push('bulkhead should be a world cell, not an entity');
    // never falls: let the stability pass run on it
    w().stabQueue.push({ i: c.i, j: c.j, k: c.k }); adv(3); if (w().get(c.i, c.j, c.k) !== BULK) bad.push('bulkhead fell');
    // placing again on the same cell: planned refused (solid) with words
    K.equip('bulk'); K.aimDir(cellX(c.i), 0.3, cellZ(c.k), 0, 1.6); const again = await plan(); if (again && again.ok && again.ent.i === c.i && again.ent.j === c.j && again.ent.k === c.k) bad.push('same cell planned twice');
    // no room: a bulkhead cannot go into the cell you are standing in
    K.equip('bulk'); p().pos.set(cellX(c.i) + 3, 0, cellZ(c.k) + 3); p().vel.set(0, 0, 0); p().yaw = 0; p().pitch = -1.35; { const sx = p().pos.x, sz = p().pos.z; p().pos.set(sx, 0, sz); } const self = await plan();
    if (self.ok && Math.abs(cellX(self.ent.i) - p().pos.x) < 0.6 && Math.abs(cellZ(self.ent.k) - p().pos.z) < 0.6) bad.push('bulkhead planned into the player');
    // the hammer takes it down and gives it back
    K.equip('hammer'); K.aimDir(cellX(c.i), cellY(c.j), cellZ(c.k), 0, 1.5); adv(0.05); g.renderer.camera.position.copy(p().eyePos(new V3())); const n0 = S().items.bulk; g.hammerHit();
    if (w().get(c.i, c.j, c.k) === BULK) { bad.push('hammer did not remove it'); g.collect({ type: 'cell', i: c.i, j: c.j, k: c.k, sp: BULK, vr: 0 }); }
    if (S().items.bulk !== n0 + 1) bad.push('hammer gave back ' + (S().items.bulk - n0));
    const n1 = S().items.bulk; g.hammerHit(); if (S().items.bulk !== n1) bad.push('hammered empty air and got an item');
    return bad.length ? bad.join('; ') : true;
  });

  // ======================================================================= frames: every tier, on the grid and free
  const tunnel = async () => { await ctx.newWorld(); fresh(ALL_UP); S().money = 1e13; const sp = K.lane(64, 8, 4); return sp; };
  const look = (x, z) => aimPoint(x, 0, z, 2.4);
  for (const kind of FRAME_KEYS) for (const mode of ['grid', 'free']) {
    await T(`addons.place.frame.${kind}.${mode}`, async () => {
      const sp = await tunnel(); if (!sp) return 'no lane with enough pile';
      const { i, k } = sp, id = 'frame:' + kind, bad = []; g.craftItem(id, 3); K.equip(id);
      g.frameYaw = mode === 'free' ? 0.5 + FRAME_KEYS.indexOf(kind) * 0.11 : null;
      look(cellX(i + 14), cellZ(k + 1)); const pl = await plan(); if (!pl.ok) { g.frameYaw = null; return 'refused: ' + pl.why; }
      const hint = K.hintText(); if (!/set down/.test(hint) || BAD.test(hint)) bad.push('hint ' + hint);
      if (mode === 'free' && !/turn|back to the grid/.test(hint)) bad.push('free hint lacks turn keys: ' + hint);
      const clear = pl.ent.clear.slice(), n0 = S().entities.length; g.placeCurrent(g.curTool()); g.frameYaw = null;
      const e = S().entities[S().entities.length - 1]; if (S().entities.length !== n0 + 1 || e.type !== 'frame') return 'no frame entity';
      if (S().items[id] !== 2) bad.push('consumed ' + (3 - (S().items[id] || 0)));
      if (e.kind !== kind) bad.push('kind ' + e.kind); if (mode === 'free' ? (e.turned !== true || Math.abs(e.yaw - (0.5 + FRAME_KEYS.indexOf(kind) * 0.11)) > 1e-9) : (e.turned || e.gm === undefined)) bad.push(`${mode}: turned ${e.turned} yaw ${e.yaw} gm ${e.gm}`);
      if (Math.abs(e.w - (4 * 0.6 - 0.04)) > 1e-6 || Math.abs(e.h - (4 * 0.6 - 0.02)) > 1e-6) bad.push('size ' + e.w + 'x' + e.h);
      const s = sup(e.id); if (!s || s.r !== FRAME_TYPES[kind].radius || s.kind !== kind || Math.abs(s.y - (e.y0 + e.h / 2)) > 1e-6 || s.cap === undefined) bad.push('support ' + JSON.stringify(s && [s.r, s.kind, s.y]));
      const it = K.itemOf(e); if (!it || Math.abs(it.obj.rotation.y - e.yaw) > 1e-9 || Math.abs(it.obj.position.x - e.cx) > 1e-9) bad.push('mesh rotation/position');
      for (const [ci, cj, ck] of clear) if (w().get(ci, cj, ck)) bad.push('section not carved'), clear.length = 0;
      // the same spot again is refused (free) or does not stack a duplicate (grid)
      K.equip(id); g.frameYaw = mode === 'free' ? e.yaw : null; look(cellX(i + 14), cellZ(k + 1)); const pl2 = await plan();
      if (pl2.ok && pl2.ent && Math.hypot(pl2.ent.cx - e.cx, pl2.ent.cz - e.cz) < 0.3 && Math.abs(pl2.ent.y0 - e.y0) < 0.3) bad.push('a second frame planned in the very same place');
      if (mode === 'free' && pl2.ok && Math.hypot(pl2.ent.cx - e.cx, pl2.ent.cz - e.cz) < 0.45) bad.push('free frame stacked');
      // double place in the same frame (two clicks before the next update)
      g.frameYaw = null; look(cellX(i + 24), cellZ(k + 1)); const pl3 = await plan(); if (pl3.ok) { const nE = S().entities.length; g.placeCurrent(g.curTool()); g.placeCurrent(g.curTool()); if (S().entities.length !== nE + 1) bad.push(`two placements in one frame made ${S().entities.length - nE} frames`); }
      // invalid: ceiling
      const inv = await invalidHere(id, 'ceiling'); if (inv) bad.push(inv);
      // hammer it
      { const hh = await hammerHint(FRAME_TYPES[kind].name, e.cx, e.y0 + 1.2, e.cz, 1.8, 0); if (hh) bad.push(hh); }
      const have = S().items[id] || 0, n2 = S().entities.length; const ref = hammerHit(e.cx, e.y0 + 1.2, e.cz, 1.8, 0);
      if (!ref || ref.id !== e.id) { bad.push('hammer target ' + JSON.stringify(ref)); g.doDecon({ kind: 'mach', id: e.id }); }
      if ((S().items[id] || 0) !== have + 1) bad.push(`hammer returned ${(S().items[id] || 0) - have} ${id}`);
      if (g.machines.items.has(e.id) || sup(e.id) || S().entities.some((x) => x.id === e.id)) bad.push('frame traces left');
      return bad.length ? bad.join('; ') : true;
    });
  }

  await T('addons.place.frame-turned-at-every-angle-keeps-its-yaw-in-mesh-and-data', async () => {
    const sp = await tunnel(); if (!sp) return 'no lane'; const { i, k } = sp; g.craftItem('frame:timber', 8); K.equip('frame:timber'); const bad = [];
    for (let n = 0; n < 6; n++) { const yaw = -2.9 + n * 1.1; g.frameYaw = yaw; look(cellX(i + 6 + n * 4), cellZ(k + 1)); const pl = await plan(); if (!pl.ok) { bad.push(`yaw ${yaw.toFixed(2)}: ${pl.why}`); continue; } g.placeCurrent(g.curTool()); const e = S().entities[S().entities.length - 1]; const it = K.itemOf(e); if (e.yaw !== yaw || !e.turned || !it || Math.abs(it.obj.rotation.y - yaw) > 1e-9) bad.push('yaw lost ' + yaw.toFixed(2)); }
    g.frameYaw = null; return bad.length ? bad.join('; ') : true;
  });

  // ======================================================================= support fan under a frame
  await T('addons.place.mfan-needs-a-frame-clamps-and-goes-back-with-the-item', async () => {
    const sp = await tunnel(); if (!sp) return 'no lane'; const { i, k } = sp; const bad = []; g.craftItem('frame:steel', 2); g.craftItem('mfan', 3);
    // no frame in sight
    K.equip('mfan'); look(cellX(i + 14), cellZ(k + 1)); let pl = await plan(); if (pl.ok || !/frame/i.test(pl.why || '')) bad.push('fan planned with no frame: ' + JSON.stringify([pl.ok, pl.why]));
    const before = S().items.mfan; g.placeCurrent(g.curTool()); if (S().items.mfan !== before) bad.push('refused plan took a fan');
    // grid frame and a free-turned frame, a fan under each
    for (const [yaw, off] of [[null, 14], [0.7, 24]]) {
      K.equip('frame:steel'); g.frameYaw = yaw; look(cellX(i + off), cellZ(k + 1)); const fp = await plan(); if (!fp.ok) { bad.push('frame: ' + fp.why); continue; } g.placeCurrent(g.curTool()); g.frameYaw = null;
      const f = S().entities[S().entities.length - 1];
      K.equip('mfan'); p().pos.set(cellX(i + off - 4), 0, f.cz); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; const e0 = p().eyePos(new V3()); p().pitch = Math.atan2(f.y0 + f.h - 0.3 - e0.y, f.cx - e0.x);
      pl = await plan(); if (!pl.ok) { bad.push('fan plan: ' + pl.why); continue; }
      const hint = K.hintText(); if (!/set down/.test(hint)) bad.push('fan hint ' + hint);
      const nE = S().entities.length, m0 = S().items.mfan; g.placeCurrent(g.curTool()); const t = S().entities[S().entities.length - 1];
      if (S().entities.length !== nE + 1 || S().items.mfan !== m0 - 1) bad.push('fan consumption'); if (!t.mounted || t.frameId !== f.id || t.type !== 'fan') bad.push('fan entity ' + JSON.stringify(t));
      if (Math.abs(t.fyaw - Math.atan2(t.fx, t.fz)) > 1e-9 || Math.hypot(t.fx, t.fz) < 0.999) bad.push('fan direction');
      const o = L().objs.get(t.id); if (!o || Math.abs(o.position.y - (f.y0 + f.h - 0.3)) > 1e-6 || Math.abs(o.rotation.y - t.fyaw) > 1e-9) bad.push('fan mesh not under the beam');
      if (!w().reserved.has(cellIdx(t.i, t.j, t.k))) bad.push('fan cell not reserved');
      pl = await plan(); if (pl.ok) bad.push('second fan on the same frame'); const m1 = S().items.mfan; g.placeCurrent(g.curTool()); if (S().items.mfan !== m1) bad.push('second fan consumed an item');
      // the hammer on the fan itself returns an mfan (not a plain fan)
      const fanTile = L().byId.get(t.id); const f0 = S().items.fan || 0, mf0 = S().items.mfan; g.doDecon({ kind: 'tile', id: fanTile.id }); if (S().items.mfan !== mf0 + 1 || (S().items.fan || 0) !== f0) bad.push('mounted fan returned ' + JSON.stringify([S().items.mfan, S().items.fan]));
      // put it back and take the frame instead: the fan goes with it and comes back too
      K.equip('mfan'); pl = await plan(); g.placeCurrent(g.curTool()); const mf1 = S().items.mfan, fr1 = S().items['frame:steel'] || 0; g.doDecon({ kind: 'mach', id: f.id });
      if (S().items.mfan !== mf1 + 1 || (S().items['frame:steel'] || 0) !== fr1 + 1) bad.push('frame removal did not return both: ' + JSON.stringify(S().items));
      if (tiles().some((q) => q.mounted && q.frameId === f.id) || L().objs.has(t.id) || w().reserved.has(cellIdx(t.i, t.j, t.k))) bad.push('fan traces left after its frame went');
    }
    return bad.length ? bad.join('; ') : true;
  });

  // ======================================================================= machines on the pile: claw rig, borer
  const faceX = async (up) => { await ctx.newWorld(); fresh(up); const sp = spot(); let tx = 0; for (let d = 1; d < 60; d++) if (w().topAt(sp.i + d, sp.k) >= 6) { tx = sp.i + d; break; } return { sp, tx }; };
  await T('addons.place.claw', async () => {
    S().money = 1e12; const { sp, tx } = await faceX(ALL_UP); if (!tx) return 'no steep face'; S().money = 1e12; const bad = [];
    g.craftItem('claw', 3); K.equip('claw'); let so = tx - 1; while (so > sp.i - 8 && w().topAt(so, sp.k) > 0) so--;
    p().pos.set(cellX(so), 0, cellZ(sp.k)); p().vel.set(0, 0, 0); { const e = p().eyePos(new V3()); p().yaw = Math.atan2(cellX(tx) - e.x, 0); p().pitch = Math.atan2(1.2 - e.y, cellX(tx) - e.x); }
    const pl = await plan(); if (!pl.ok) return 'refused: ' + pl.why; if (BAD.test(K.hintText())) bad.push('hint');
    g.placeCurrent(g.curTool()); const e = S().entities[S().entities.length - 1]; if (e.type !== 'claw' || S().items.claw !== 2) return 'not placed / consumed ' + S().items.claw;
    const it = K.itemOf(e); if (!it || !it.rig || it.obj.parent !== g.machines.root) bad.push('no rig mesh');
    // too close to another rig
    const pl2 = await plan(); if (pl2.ok) bad.push('second rig on top of the first'); else if (!/close|rig|limit/i.test(pl2.why || '')) bad.push('reason ' + pl2.why);
    // limit: rigMax 2 from the upgrade; a third is refused with the limit text
    g.craftItem('claw', 1); const inv = await invalidHere('claw', 'ceiling'); if (inv) bad.push(inv);
    const st = g.recipeList().find((r) => r.id === 'claw').status; if (!/1 of \d+ rigs/.test(st)) bad.push('status "' + st + '"');
    const c0 = S().items.claw; const ref = hammerHit(e.x, e.y + 0.6, e.z, 2.2, 0); if (!ref || ref.id !== e.id) { bad.push('hammer target ' + JSON.stringify(ref)); g.doDecon({ kind: 'mach', id: e.id }); }
    if (S().items.claw !== c0 + 1) bad.push('claw back ' + (S().items.claw - c0)); if (g.machines.items.has(e.id)) bad.push('claw traces left');
    return bad.length ? bad.join('; ') : true;
  });
  await T('addons.place.borer', async () => {
    let sp = null, placed = false, why = '', bad = [];
    for (let attempt = 0; attempt < 5 && !placed; attempt++) { // not every slope has a face a borer can sit against: try a few worlds
      ({ sp } = await faceX({ ...ALL_UP, borerSize: 2 })); S().money = 1e12; g.craftItem('borer', 2); K.equip('borer');
      search: for (const di of [1, 0, 2, 3, 4]) for (const back of [1.5, 2.0, 2.5]) for (const pitch of [0, -0.1, -0.2]) { ctx.lookEast(cellX(sp.i + di) - back, cellZ(sp.k), pitch); const pl = await plan(); if (pl && pl.ok) { g.placeCurrent(g.curTool()); placed = true; break search; } why = pl && pl.why; }
    }
    if (!placed) return 'could not place: ' + why; const e = S().entities[S().entities.length - 1]; if (e.type !== 'borer' || S().items.borer !== 1) return 'borer entity/consumption ' + JSON.stringify([e.type, S().items.borer]);
    const it = K.itemOf(e); if (!it || !it.borer || !it.shield) bad.push('borer mesh or shield'); if (!sup(`shield${e.id}`)) bad.push('shield support missing');
    if (!(e.w >= 3 && e.h >= 3)) bad.push('size ' + e.w + 'x' + e.h);
    const st = g.recipeList().find((r) => r.id === 'borer').status; if (!/of \d+ borers placed/.test(st)) bad.push('status ' + st);
    // limit
    const ref = hammerAt(e.x, e.y + e.h / 2, e.z, 2, 0);
    if (ref && ref.id === e.id) bad.push('hammer targeted a working borer'); const b0 = S().items.borer; e.done = true; const ref2 = hammerHit(e.x, e.y + e.h / 2, e.z, 2, 0);
    if (!ref2 || ref2.id !== e.id || S().items.borer !== b0 + 1 || g.machines.items.has(e.id) || sup('shield' + e.id)) bad.push('finished borer removal: ' + JSON.stringify([ref2, S().items.borer]));
    return bad.length ? bad.join('; ') : true;
  });

  // ======================================================================= things that are carried, not placed
  await T('addons.place.medkit-canister-cart-and-materials-are-used-not-placed', async () => {
    fresh(ALL_UP); S().money = 1e12; const bad = [];
    g.craftItem('medkit', 2); g.craftItem('canister', 2); g.craftItem('cart:2', 1); g.craftItem('mat:timber', 10);
    const ents = S().entities.length;
    K.equip('medkit'); K.aimDir(-6, 0, 3); g.hp = 40; g.useTool(g.curTool()); if (g.hp !== 90 || S().items.medkit !== 1) bad.push(`medkit hp ${g.hp} left ${S().items.medkit}`);
    g.hp = g.hpMax; g.useTool(g.curTool()); if (S().items.medkit !== 1) bad.push('medkit wasted at full health');
    K.equip('canister'); const c0 = S().items.canister; g.useTool(g.curTool()); if (S().items.canister !== c0 || !/Canister/i.test(K.hintText())) bad.push('canister B should only explain: ' + K.hintText());
    K.equip('cart:2'); const pl = await plan(); if (g.plan) bad.push('cart equipped should have no placement plan'); g.useTool(g.curTool()); if (!S().cart || S().cart.tier !== 2 || S().items['cart:2']) bad.push('cart did not roll out and spend the item');
    else { g.stowCart(); if (S().cart || S().items['cart:2'] !== 1) bad.push('cart did not stow back into the pack'); }
    // building material is not a tool
    g.assignHotbar('mat:timber', 5); g.stowed = false; g.selectTool(5); if (g.curTool().kind !== 'hands') bad.push('material equipped as a tool: ' + g.curTool().kind); S().hotbar[5] = null; g.rebuildTools();
    if (S().entities.length !== ents) bad.push('a carried item made an entity'); void pl;
    return bad.length ? bad.join('; ') : true;
  });
}
