// In-world keys, part 6: E ("Use what you aim at") on the things the controls table and the readouts say it works on. Every press is a real KeyboardEvent.
import { makeKit, ALL_UP } from './addons_lib.js';
import { makeFurnKit } from './furnish_lib.js';
import { makeIO, clearBay } from './truth_world_lib.js';
import { GEN_KINDS } from '../powerparts.js';
import { recipes } from '../crafting.js';
import { CHARGER_CAP } from '../logistics.js';
import { infoFor, findInfoRef } from '../info.js';
import { makeSplitKit, UP as SPLIT_UP } from './split_lib.js';
import * as HL from '../hanglamp.js';
export default async function (ctx) {
  const { T, g, S, p, L, fresh, adv, craft, selectTool, cellX, cellZ, aimPoint, toI, toK, V3, tiles } = ctx;
  const K = makeKit(ctx);
  const io = makeIO(ctx);
  const common = (n) => Array.from({ length: n }, () => ({ sp: 2, vr: 0 }));
  const lookAt = (x, y, z, back = 2.0) => { aimPoint(x, y, z, back); adv(0.06); };
  const tileAt = (e) => L().byId.get(e.id);
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { g.keys = {}; g.stowed = true; g.crewSel = null; g.ui.closeModals(); } });

  await guard('truth.world.keys-e-at-the-desk-the-bench-the-kiosk-a-depot-and-the-bin-does-what-the-readme-says', async () => {
    fresh(ALL_UP); const bad = []; const h = g.hall;
    const near = (pos, d) => { p().pos.set(pos.x - d, 0, pos.z); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0; g.ui.closeModals(); adv(0.06); };
    near(h.termPos, 2.0); io.tap('KeyE'); if (io.modal() !== 'shop') bad.push('E at the desk opened ' + io.modal()); g.ui.closeModals();
    near(h.craftPos, 2.0); io.tap('KeyE'); if (io.modal() !== 'craft') bad.push('E at the bench opened ' + io.modal()); g.ui.closeModals();
    near(h.kioskPos, 2.0); io.tap('KeyE'); if (io.modal() !== 'dossier') bad.push('E at the kiosk opened ' + io.modal()); g.ui.closeModals();
    near(h.binPos, 2.5); S().carry = common(3); const m0 = S().money; io.tap('KeyE'); if (S().carry.length !== 0 || S().money <= m0) bad.push('E at the bin did not sell what you carry'); io.clearHint(); io.tap('KeyE'); if (!/Nothing to sell/.test(io.hint())) bad.push('empty-handed E at the bin: ' + io.hint());
    p().pos.set(-20, 0, 8); adv(0.06); io.clearHint(); io.tap('KeyE'); if (!/Nothing to use here/.test(io.hint())) bad.push('E at nothing: ' + io.hint());
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-e-feeds-a-generator-of-any-size-and-with-empty-hands-switches-auto-and-reserve', async () => {
    fresh(Object.fromEntries(ctx.UPGRADES.map((u) => [u.id, u.max]))); clearBay(ctx); const bad = [];
    for (const [n, kind] of GEN_KINDS.entries()) {
      const x = -9, z = 2;
      const e = { id: g.nextId(), type: 'gen', i: toI(x), j: 0, k: toK(z), dir: 0, rise: 0, ...(kind.key === 'std' ? {} : { gk: kind.key }) }; S().entities.push(e); g.addEntity(e); const t = L().byId.get(e.id);
      S().carry = []; lookAt(cellX(t.i), 0.4, cellZ(t.k), 1.8); S().carry = common(2); io.clearHint(); io.tap('KeyE'); if (t.q.length < 1 || S().carry.length !== 2 - t.q.length || !/Fed /.test(io.hint())) bad.push(`${kind.key}: E with plush did not feed it (${t.q.length} in the hopper, ${S().carry.length} left) ${io.hint()}`);
      S().carry = []; const m0 = t.mode === 'reserve' ? 'reserve' : 'auto'; io.clearHint(); io.tap('KeyE'); if (t.mode === m0 || !/RESERVE|AUTO/.test(io.hint())) bad.push(`${kind.key}: empty-handed E did not switch AUTO and RESERVE (${m0} -> ${t.mode}) ${io.hint()}`);
      io.tap('KeyE'); if ((t.mode === 'reserve' ? 'reserve' : 'auto') !== m0) bad.push(`${kind.key}: a second E did not switch back`);
      g.doDecon({ kind: 'tile', id: e.id });
    }
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-e-feeds-a-charging-station-opens-a-sorter-cycle-empties-a-vault-and-parks-a-mech', async () => {
    fresh(ALL_UP); clearBay(ctx); const bad = [];
    const mk = (type, x, z, extra = {}) => { const e = { id: g.nextId(), type, i: toI(x), j: 0, k: toK(z), dir: 0, rise: 0, ...extra }; S().entities.push(e); g.addEntity(e); return L().byId.get(e.id); };
    const ch = mk('charger', -10, -4); S().carry = common(3); lookAt(cellX(ch.i), 0.4, cellZ(ch.k), 1.8); io.tap('KeyE'); if (!(ch.q.length >= 1) || S().carry.length === 3) bad.push('E did not feed the Charging Station: ' + io.hint());
    if (CHARGER_CAP !== 8) bad.push('charger capacity changed');
    const so = mk('sorter', -10, -1); lookAt(cellX(so.i), 0.4, cellZ(so.k), 1.8); const m0 = so.mode; io.clearHint(); io.tap('KeyE'); if (so.mode === m0 || !/Sorting Box/.test(io.hint())) bad.push('E on a sorter did not cycle it: ' + io.hint());
    const va = mk('vault', -10, 2); va.stored.push(...common(5)); S().carry = []; lookAt(cellX(va.i), 0.4, cellZ(va.k), 1.8); io.tap('KeyE'); if (S().carry.length !== Math.min(5, g.T.carry) || va.stored.length !== 5 - S().carry.length) bad.push(`E on a vault: hands ${S().carry.length}, left ${va.stored.length}`);
    const me = mk('mech', -10, 5); lookAt(cellX(me.i), 0.4, cellZ(me.k), 1.8); io.clearHint(); io.tap('KeyE'); if (!me.off || !/parked/i.test(io.hint())) bad.push('E on a mech did not park it: ' + io.hint()); io.tap('KeyE'); if (me.off) bad.push('E again did not run it');
    const po = mk('pole', -6, 5); lookAt(cellX(po.i), 0.8, cellZ(po.k), 1.8); io.clearHint(); io.tap('KeyE'); if (!/Pole: /.test(io.hint())) bad.push('E on a pole: ' + io.hint());
    for (const t of [ch, so, va, me, po]) g.doDecon({ kind: 'tile', id: t.id });
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-e-with-a-bot-aimed-selects-it-then-e-on-a-generator-orders-it-and-esc-lets-go', async () => {
    fresh(ALL_UP); clearBay(ctx); const bad = []; const b = g.crew.spawn(); b.x = -8; b.z = 4; b.y = 0; b.state = 'idle';
    const e = { id: g.nextId(), type: 'gen', i: toI(-8), j: 0, k: toK(8), dir: 0, rise: 0 }; S().entities.push(e); g.addEntity(e); const gen = L().byId.get(e.id);
    lookAt(b.x, 0.5, b.z, 2.5); io.tap('KeyE'); if (g.crewSel !== b.id) bad.push('E at a bot did not select it'); else { if (!/selected/.test(io.hint())) bad.push('select hint: ' + io.hint()); lookAt(cellX(gen.i), 0.4, cellZ(gen.k), 2.5); io.tap('KeyE'); if (b.deliver !== gen.id) bad.push('E on a generator did not give the order (' + b.state + ', deliver ' + b.deliver + ')'); io.tap('Escape'); if (g.crewSel) bad.push('Esc did not let the bot go'); }
    g.doDecon({ kind: 'tile', id: e.id });
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-e-on-an-earth-mover-empties-the-hopper-into-your-hands-or-parks-it', async () => {
    fresh({ ...ALL_UP, excavator: 1, dozer: 1, wheel: 1, truck: 1, bag: 4 }); clearBay(ctx); const bad = []; S().carry = [];
    const mk = (kind, x, z, extra = {}) => { const i = toI(x), k = toK(z); const spec = ctx.cfg && null; void spec; return { i, k, extra }; }; void mk;
    const { EARTH } = await import('../earth.js');
    const make = (kind, x, z, extra = {}) => { const spec = EARTH[kind], i = toI(x), k = toK(z); const ent = { id: g.nextId(), type: kind, i, j: 0, k, dx: 1, dz: 0, x: cellX(i), y: 0, z: cellZ(k), hy: spec.hy, hr: spec.hr, ...(spec.dig ? { hop: [], hn: 0, steps: 0, dug: 0, state: 'idle' } : { px: cellX(i), pz: cellZ(k), cargo: [], cn: 0, route: [], seg: 0, trips: 0, state: 'idle', job: 0, yaw: 0 }), ...extra }; S().entities.push(ent); g.addEntity(ent); return ent; };
    const ex = make('excavator', -8, 2); for (let q = 0; q < 6; q++) ex.hop.push(2, 0); ex.hn = 6;
    lookAt(ex.x, ex.hy || 1, ex.z, 3.0); io.tap('KeyE'); if (S().carry.length !== 6 || ex.hop.length !== 0) bad.push(`E on a full excavator: hands ${S().carry.length}, hopper ${ex.hop.length / 2}`);
    io.clearHint(); io.tap('KeyE'); if (!ex.off || !/parked/i.test(io.hint())) bad.push('E on an empty excavator did not park it: ' + io.hint()); io.tap('KeyE'); if (ex.off) bad.push('E again did not send it back to work');
    g.doDecon({ kind: 'mach', id: ex.id });
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-e-on-a-depot-a-smart-or-programmable-splitter-and-a-priority-merger-opens-what-the-table-says', async () => {
    const bad = []; const X = makeSplitKit(ctx); X.setup(SPLIT_UP); S().money = 1e12; const i = X.i0(), k = X.k0();
    const at = (t) => lookAt(cellX(t.i), 0.4, cellZ(t.k), 1.8);
    for (const [id, dir] of [['ssplit', 0], ['psplit', 0], ['pmerger', 0]]) {
      g.ui.closeModals(); const t = X.part(id, i + 3, k + (id === 'psplit' ? 6 : id === 'pmerger' ? 12 : 0), dir); at(t); io.tap('KeyE'); if (io.modal() !== 'splitpanel') bad.push(`E on a ${id} opened "${io.modal()}"`); g.ui.closeModals();
    }
    g.ui.closeModals(); fresh({ ...ALL_UP, depots: 1 }); clearBay(ctx); const r = await K.put('beacon', { x: -6, z: 8, dir: 0 }); if (!r.ok) bad.push('depot: ' + r.why); else { p().pos.set(r.ent.x + 1.2, 0, r.ent.z); adv(0.1); lookAt(r.ent.x, 0.6, r.ent.z, 1.2); io.tap('KeyE'); if (io.modal() !== 'travel') bad.push('E at a depot opened "' + io.modal() + '"'); g.ui.closeModals(); g.doDecon({ kind: 'mach', id: r.ent.id }); }
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-e-switches-a-hanging-lantern-off-and-on', async () => {
    const bad = []; fresh({ ...ALL_UP, power: 1 }); clearBay(ctx);
    const f = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'z', cx: -8, cz: 3, y0: 0, w: 2.38, h: 2.38, yaw: 0 }; S().entities.push(f); g.addEntity(f); const l = g.placeEntity('hlamp', HL.lampFields(f, 0), { quiet: true });
    lookAt(l.x, l.y + 0.2, l.z, 1.6); const on0 = l.on !== false; io.clearHint(); io.tap('KeyE'); adv(0.1); if ((l.on !== false) === on0) bad.push('E did not switch the lantern'); if (!new RegExp('Hanging Lantern ' + (l.on === false ? 'off' : 'on') + '\\.').test(io.hint())) bad.push('the hint after E says "' + io.hint() + '" but the lantern is ' + (l.on === false ? 'off' : 'on')); io.clearHint(); io.tap('KeyE'); adv(0.1); if ((l.on !== false) !== on0) bad.push('a second E did not switch it back'); if (!new RegExp('Hanging Lantern ' + (l.on === false ? 'off' : 'on') + '\\.').test(io.hint())) bad.push('the second hint says "' + io.hint() + '"');
    g.doDecon({ kind: 'mach', id: l.id }); g.doDecon({ kind: 'mach', id: f.id });
    return bad.length === 0 || bad.join('; ');
  });

  // every building item whose hint says "<kbd>B</kbd> ..." must really be set down by B, and its "<kbd>Q</kbd> stow" must really put it away (items needing a wall, a frame or the pile are listed as skipped, not guessed)
  await guard('truth.world.keys-b-sets-down-and-q-stows-every-building-item-whose-hint-says-so', async () => {
    const all = Object.fromEntries(ctx.UPGRADES.map((u) => [u.id, u.max])); fresh(all); clearBay(ctx); const bad = [], skipped = [], done = [];
    const ids = recipes(g).filter((r) => !['mat', 'cart', 'supply', 'frame', 'mfan', 'claw', 'borer', 'hlamp', 'locker', 'clamp', 'sign', 'dsign', 'psign', 'door', 'jump', 'cushion', 'wramp', 'stair'].includes(r.kind) && !/^(frame|mat|cart):/.test(r.id)).map((r) => r.id);
    let n = 0;
    for (const id of ids) {
      fresh(all); S().money = 1e13; clearBay(ctx); craft(id, 1); if (!(S().items[id] > 0)) { skipped.push(id + ' (cannot craft)'); continue; }
      const x = -9, z = 3; n++;
      S().hotbar = ['hammer', null, null, null, null, null, null, null, null]; g.rebuildTools(); selectTool(id); let pl = null;
      for (let attempt = 0; attempt < 3 && !(pl && pl.ok); attempt++) { aimPoint(cellX(toI(x)), 0, cellZ(toK(z)), 2.0 + attempt * 0.4); adv(0.1); pl = await ctx.plan(); }
      if (!pl || !pl.ok) { skipped.push(`${id} (${pl && pl.why})`); continue; }
      const hint = io.hint(); const e0 = S().entities.length, c0 = S().items[id] || 0; io.tap('KeyB'); adv(0.15);
      if (/B set down|B lay|B sets|B set the|B places/.test(hint) || /kbd|B/.test(hint)) { if (S().entities.length === e0 && (S().items[id] || 0) === c0) bad.push(`${id}: the hint says "${hint.slice(0, 60)}" but B placed nothing`); else done.push(id); }
      io.tap('KeyQ'); if (!g.stowed) bad.push(id + ': Q did not put it away');
      for (const en of [...S().entities].slice(e0)) { try { g.doDecon({ kind: g.logi.byId.get(en.id) ? 'tile' : 'mach', id: en.id }); } catch (x) { /* half-built */ } }
      { const c = ctx.w(), ci = toI(x), ck = toK(z); for (let di = -10; di <= 10; di++) for (let dk = -10; dk <= 10; dk++) for (let j = 0; j < 9; j++) if (c.get(ci + di, j, ck + dk)) c.removeCell(ci + di, j, ck + dk, false); }   // a bulkhead is a world cell, not an entity
    }
    g._truthSkipped = skipped; g._truthDone = done;
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-shift-e-copies-a-sorting-box-or-splitter-or-merger-and-e-on-another-pastes-it', async () => {
    const bad = []; const X = makeSplitKit(ctx); X.setup({ ...SPLIT_UP, optics: 3 }); S().money = 1e12; const i = X.i0(), k = X.k0(); const at = (t) => lookAt(cellX(t.i), 0.4, cellZ(t.k), 1.8);
    const so1 = L().byId.get(g.placeEntity('sorter', { i: i, j: 0, k: k - 8, dir: 0 }, { quiet: true, rebuild: false }).id), so2 = L().byId.get(g.placeEntity('sorter', { i: i + 4, j: 0, k: k - 8, dir: 0 }, { quiet: true, rebuild: false }).id);
    g.cfgClip = null; so1.mode = 0; at(so1); io.tap('KeyE'); io.tap('KeyE'); const m1 = so1.mode; if (m1 === 0) bad.push('could not set the first sorter'); so2.mode = 0; so2.filter = 7; at(so1); io.shiftTap('KeyE'); if (!g.cfgClip) bad.push('Shift+E on a sorter copied nothing: ' + io.hint()); at(so2); io.tap('KeyE'); if (so2.mode !== m1) bad.push(`E on the second sorter pasted mode ${so2.mode}, not ${m1}`);
    for (const id of ['ssplit', 'pmerger']) { const a = X.part(id, i + 10, k + (id === 'ssplit' ? 0 : 6), 0), b = X.part(id, i + 14, k + (id === 'ssplit' ? 0 : 6), 0); g.cfgClip = null; at(a); io.shiftTap('KeyE'); if (!g.cfgClip) bad.push(`Shift+E on a ${id} copied nothing`); else { at(b); io.tap('KeyE'); if (io.modal() === 'splitpanel') bad.push(`E on a second ${id} opened the panel instead of pasting`); else if (!/Settings pasted/.test(io.hint())) bad.push(`${id}: ${io.hint()}`); } g.ui.closeModals(); }
    g.cfgClip = null;
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.keys-e-on-a-placed-locker-crate-silo-depot-sign-or-lamp-opens-its-own-panel', async () => {
    const X = makeFurnKit(ctx); X.reset(); const bad = [];
    const all = await X.furnishAll();
    for (const [id, ent] of Object.entries(all)) {
      g.ui.closeModals(); const x = ent.x ?? cellX(ent.i), y = (ent.y ?? 0) + 0.5, z = ent.z ?? cellZ(ent.k);
      lookAt(x, y, z, 2.2); io.tap('KeyE'); if (io.modal() !== 'furn') bad.push(`${id}: E opened "${io.modal()}", not its panel`);
    }
    return bad.length === 0 || bad.join('; ');
  });
}
