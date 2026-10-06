// furnish.*: the furnish wave (spec 4.5): storage (locker, parts crate, silo, depot, output vault), signs and lights. Host side behavior,
// persistence, the bench and the hover readouts. The multiplayer side is in furnish_mp.js (mp.furnish.*).
import { makeKit } from './addons_lib.js';
import * as F from '../furnish.js';
import { TYPES, catalogType } from '../catalog.js';
import { DEMAND } from '../power.js';
import { UPGRADES } from '../upgrades.js';
import { infoFor } from '../info.js';
import { CONTROLS } from '../controls.js';

export const UP = { vault: 1, sorter: 1, belts: 1, power: 1, lantern: 1, furnSigns: 1, furnStore: 1, furnLamps: 1, furnFlood: 1, furnSilo: 1, furnDepot: 1 };

export default async function (ctx) {
  const { T, g, S, w, p, L, fresh, adv, craft, selectTool, plan, aimPoint, recipes, cellX, cellZ, toI, toK, NEEDLE } = ctx;
  const K = makeKit(ctx);
  const cells = [];   // solid cells a test added (walls, roofs): removed again in the finally of each test
  const solid = (i, j, k) => { w().setCell(i, j, k, 2, 0); cells.push([i, j, k]); };
  const clearCells = () => { for (const c of cells.splice(0)) w().setCell(c[0], c[1], c[2], 0, 0); };
  const reset = () => { clearCells(); fresh(UP); F.resetFurnish(g); S().money = 1e12; K.clearBay(); g.alarmGate = null; };
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { clearCells(); g.stowed = true; g.rebuildTools(); F.resetFurnish(g); } });
  const ids = () => new Set(S().entities.map((e) => e.id));
  // craft, take out, aim at a point of the open bay, plan, place. Returns { ok, why, ent }
  const putAt = async (id, x, y, z, back = 2.0, o = {}) => {
    S().hotbar = ['hammer', null, null, null, null, null, null, null, null]; g.rebuildTools();   // nine slots only: every placed kind would otherwise keep its slot
    if (!(S().items[id] > 0)) craft(id);
    selectTool(id); aimPoint(x, y, z, back); if (o.yaw !== undefined) p().yaw = o.yaw;
    const pl = await plan(); if (!pl || !pl.ok) return { ok: false, why: pl && pl.why, pl };
    const before = ids(); g.placeCurrent(g.curTool());
    const ent = S().entities.find((e) => !before.has(e.id)); return { ok: !!ent, ent, pl, why: ent ? null : 'nothing was created' };
  };
  const onFloor = (id, x, z, back = 2.0, o = {}) => putAt(id, x, 0, z, back, o);
  // a solid wall west of x (face at the west side of cell I), 6 cells high, 7 wide
  const wall = (x, z) => { const I = toI(x), Kc = toK(z); for (let dk = -3; dk <= 3; dk++) for (let j = 0; j < 6; j++) solid(I, j, Kc + dk); return { x: cellX(I) - 0.3, z: cellZ(Kc) }; };
  const roof = (x, z, j = 6) => { const I = toI(x), Kc = toK(z); for (let di = -3; di <= 3; di++) for (let dk = -3; dk <= 3; dk++) solid(I + di, j, Kc + dk); return { x: cellX(I), z: cellZ(Kc), y: j * 0.6 }; };
  const spot = (n = 0) => ({ x: -9 + n * 1.5, z: 4 });
  const plushes = (n, sp = 3, vr = 0) => Array.from({ length: n }, () => ({ sp, vr }));
  const act = (e, a) => g.setCfg(e, { act: a });
  const mach = (e) => g.machines.items.get(e.id);
  const count = (e) => Object.values(e.cargo || {}).reduce((a, b) => a + b, 0);
  const run = (sec, dt = 0.05) => adv(sec, dt);
  // a powered grid in the bay: a fed generator and a pole next to the spot, returns when the grid is up
  const grid = async (x = -7, z = 8, fuel = 40, gens = 1) => {
    let first = null, pole = null;
    for (let n = 0; n < gens; n++) { const gn = await K.put('gen', { x: x - n * 1.2, z, dir: 0 }); if (!gn.ok) throw new Error('gen: ' + gn.why); K.feedGen(K.tileOf(gn.ent), fuel); first = first || gn.ent; }
    const pl = await K.put('pole', { x: x + 1.2, z, dir: 0 }); if (!pl.ok) throw new Error('pole: ' + pl.why); pole = pl.ent;
    run(1.5); return { gen: first, pole };
  };
  const BAD = /undefined|NaN|\[object|null|[\u2013\u2014]/;

  // ---------------------------------------------------------------- the bench and the unlocks
  await guard('furnish.registry-exports-and-catalog-has-no-conflicts', async () => {
    const part = await import('../catalog_furnish.js'); const bad = [];
    if (!Array.isArray(part.UPGRADES) || typeof part.RECIPES !== 'function' || typeof part.DEMAND !== 'object' || typeof part.TYPES !== 'object') bad.push('the four exports');
    for (const k of F.KINDS) { if (!catalogType(k)) bad.push('no handlers for ' + k); if (DEMAND[k] !== F.KW[k]) bad.push('demand ' + k + ' not merged into power.js'); }
    for (const u of part.UPGRADES) { const m = UPGRADES.find((x) => x.id === u.id); if (!m) bad.push('upgrade ' + u.id + ' not merged'); else if (m.cost.length !== m.max) bad.push(u.id + ' cost list length'); if (u.req && !UPGRADES.some((x) => x.id === u.req.id)) bad.push(u.id + ' needs a missing upgrade ' + u.req.id); }
    const { CONFLICTS } = await import('../catalog.js'); const mine = CONFLICTS.filter((c) => /furn|locker|pcrate|silo|dimdepot|sign|clamp|flood|strip|wbeacon|ovault/i.test(c)); if (mine.length) bad.push('conflicts: ' + mine.join('; '));
    for (const k of ['locker', 'pcrate', 'silo', 'dimdepot', 'sign', 'dsign', 'psign', 'clamp', 'flood', 'strip', 'wbeacon']) { const h = TYPES[k]; for (const f of ['cfg', 'info', 'use', 'add', 'plan', 'build', 'conflict', 'onRemove']) if (typeof h[f] !== 'function') bad.push(k + '.' + f); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.recipes-need-their-unlock-and-the-bench-price-matches-the-spec', async () => {
    reset(); fresh({}); const bad = [], rid = () => new Set(recipes(g).map((r) => r.id));
    const all = ['sign', 'dsign', 'psign', 'locker', 'pcrate', 'clamp', 'strip', 'wbeacon', 'flood', 'silo', 'ovault', 'dimdepot'];
    for (const id of all) if (rid().has(id)) bad.push(id + ' is on the bench without its unlock');
    const need = { furnSigns: ['sign', 'dsign', 'psign'], furnStore: ['locker', 'pcrate'], furnLamps: ['clamp', 'strip', 'wbeacon'], furnFlood: ['flood'], furnSilo: ['silo', 'ovault'], furnDepot: ['dimdepot'] };
    for (const [up, list] of Object.entries(need)) { fresh({ [up]: 1 }); for (const id of all) { const has = rid().has(id), want = list.includes(id); if (has !== want) bad.push(`${up}: ${id} ${has ? 'present' : 'missing'}`); } }
    reset(); const price = (id) => recipes(g).find((r) => r.id === id).price, near = (a, b) => Math.abs(a - b) <= 3;
    const spec = { locker: 600, pcrate: 4000, silo: 150000, flood: 4500 };
    for (const [id, v] of Object.entries(spec)) if (!near(price(id), v)) bad.push(`${id} costs ${price(id)}, spec ${v}`);
    if (!(Math.abs(price('dimdepot') - 8e7) <= 8e5)) bad.push('depot ' + price('dimdepot') + ' is not about 80M');
    for (const id of ['sign', 'dsign', 'psign']) if (!(price(id) >= 40 && price(id) <= 3 * 300)) bad.push(id + ' price ' + price(id));
    const u = (id) => UPGRADES.find((x) => x.id === id);
    if (!(u('furnDepot').cost[0] >= 1e7 && u('furnSilo').cost[0] >= 1e6 && u('furnFlood').cost[0] >= 1e6)) bad.push('late unlocks are not priced for a 10M wallet');
    // crafting charges the shown price and the item lands in the pack
    for (const id of all) { S().money = 1e12; const m0 = S().money, shown = price(id); craft(id); if (Math.round(m0 - S().money) !== shown || S().items[id] !== 1) bad.push(`${id}: charged ${m0 - S().money}, shown ${shown}, have ${S().items[id]}`); delete S().items[id]; }
    // the depot gets dearer with every one you own
    craft('dimdepot'); const p2 = price('dimdepot'); delete S().items.dimdepot; const p1 = price('dimdepot'); if (!(p2 / p1 > 1.5 && p2 / p1 < 1.6)) bad.push('depot growth ' + p2 / p1);
    for (const r of recipes(g)) if (all.includes(r.id) && (!r.use || !r.desc || BAD.test(`${r.name}|${r.desc}|${r.use}|${r.status}`))) bad.push('bad text on ' + r.id + ': ' + r.use);
    for (const up of F.FURN_UPGRADES) if (BAD.test(up.name + up.desc)) bad.push('bad text on upgrade ' + up.id);
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- placing and the hammer, every kind
  await guard('furnish.every-kind-places-on-its-surface-and-the-hammer-hands-it-back', async () => {
    reset(); const bad = [], wl = wall(-2, 2), rf = roof(-5, 0);
    const items0 = { ...S().items };
    const cases = [
      ['pcrate', () => onFloor('pcrate', -9, 4)], ['silo', () => onFloor('silo', -8, 6)], ['dimdepot', () => onFloor('dimdepot', -10, 6)],
      ['sign', () => onFloor('sign', -9, 2)], ['dsign', () => putAt('dsign', wl.x, 0.9, wl.z + 1.2, 2)], ['psign', () => putAt('psign', rf.x, 3.5, rf.z, 2)],
      ['clamp', () => putAt('clamp', rf.x, rf.y - 0.01, rf.z - 0.6, 2.4)], ['flood', () => onFloor('flood', -9, 8)], ['strip', () => onFloor('strip', -7, 9)], ['wbeacon', () => onFloor('wbeacon', -9, 10)],
      ['locker', () => putAt('locker', wl.x, 0.9, wl.z, 2)],
    ];
    for (const [id, f] of cases) {
      const r = await f(); if (!r.ok) { bad.push(`${id}: ${r.why}`); continue; }
      const e = r.ent, it = mach(e);
      if (e.type !== id || !it || !it.obj || !Number.isFinite(e.x + e.y + e.z + e.h)) { bad.push(`${id}: ent ${JSON.stringify(e)}`); continue; }
      if (JSON.parse(JSON.stringify(e)).type !== id) bad.push(id + ' does not round trip');
      if (!['floor', 'wall', 'ceiling'].includes(e.mount)) bad.push(id + ' mount ' + e.mount);
      if (id === 'silo' || id === 'dimdepot') { if (!L().byId.get(-e.id)) bad.push(id + ' has no intake crate'); if (S().entities.some((x) => x.id < 0)) bad.push('the intake crate was saved'); }
      if (S().items[id] !== undefined) bad.push(`${id}: item not consumed (${S().items[id]})`);
      g.doDecon({ kind: 'mach', id: e.id });
      if (g.machines.items.has(e.id) || S().entities.some((x) => x.id === e.id)) bad.push(`${id}: hammer left it`);
      if (S().items[id] !== 1) bad.push(`${id}: hammer gave ${S().items[id]}`);
      if ((id === 'silo' || id === 'dimdepot') && L().byId.has(-e.id)) bad.push(id + ' left the intake crate behind');
      delete S().items[id];
    }
    if (JSON.stringify(S().items) !== JSON.stringify(items0)) bad.push('items differ at the end: ' + JSON.stringify(S().items));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.each-kind-refuses-the-wrong-surface-and-a-taken-spot', async () => {
    reset(); const bad = [];
    craft('locker'); selectTool('locker'); aimPoint(-9, 0, 4, 2); let pl = await plan(); if (pl.ok || !/wall/i.test(pl.why || '')) bad.push('a locker went on the floor: ' + JSON.stringify([pl.ok, pl.why]));
    craft('silo'); selectTool('silo'); const rf = roof(-5, 0); aimPoint(rf.x, rf.y - 0.01, rf.z - 0.6, 2.4); pl = await plan(); if (pl.ok) bad.push('a silo hung from the roof');
    const a = await onFloor('pcrate', -9, 4); if (!a.ok) return 'first crate: ' + a.why;
    craft('pcrate'); selectTool('pcrate'); aimPoint(-9, 0, 4, 2); pl = await plan(); if (pl.ok || !/there|Occupied|taken/i.test(pl.why || '')) bad.push('a second crate went on the same spot: ' + JSON.stringify([pl.ok, pl.why]));
    // a silo needs 2.4 m of room above it
    clearCells(); solid(toI(-5), 3, toK(5)); craft('silo'); selectTool('silo'); aimPoint(-5, 0, 5, 2); pl = await plan(); if (pl.ok) bad.push('a silo went under a low roof (' + pl.why + ')');
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- signs
  await guard('furnish.sign-text-sanitized', async () => {
    reset(); const bad = [], r = await onFloor('sign', -9, 4); if (!r.ok) return r.why; const e = r.ent;
    let c = g.setCfg(e, { text: '<b>EXIT</b>\u0001\u0007 ahead' }); if (!c.ok || e.text !== 'bEXIT/b ahead') bad.push('markup or control characters survived: ' + JSON.stringify(e.text));
    c = g.setCfg(e, { text: 'x'.repeat(80) }); if (!c.ok || e.text.length !== 32) bad.push('not cut to 32: ' + e.text.length);
    c = g.setCfg(e, { text: '   padded   ' }); if (e.text !== 'padded') bad.push('not trimmed: ' + JSON.stringify(e.text));
    const before = JSON.stringify(e);
    for (const patch of [{ text: 5 }, { size: 4 }, { size: 0 }, { size: 1.5 }, { tone: 'pink' }, { icon: 'skull' }, { lit: 'yes' }, { text: 'ok', evil: 1 }, { sp: -3 }, { sp: 99999 }, { arrow: 2 }, { mode: 'on' }, { cargo: {} }, { x: 5 }, JSON.parse('{"__proto__":{"lit":true}}')]) {
      const rr = g.setCfg(e, patch); if (rr.ok) bad.push('accepted ' + JSON.stringify(patch));
    }
    if (JSON.stringify(e) !== before) bad.push('a refused patch changed the sign');
    if (({}).lit !== undefined) bad.push('prototype polluted');
    c = g.setCfg(e, { text: 'Belt line 3', size: 3, tone: 'red', icon: 'warn', lit: true }); if (!c.ok || e.size !== 3 || e.tone !== 'red' || e.icon !== 'warn' || e.lit !== true) bad.push('a clean patch was refused: ' + c.why);
    // the model follows the settings: a bigger panel, taller on a post
    const it = mach(e), face = it.obj.getObjectByName('face'); if (!face || Math.abs(face.geometry.parameters.width - (F.SIGN_DIM[3][0] - 0.04)) > 1e-6) bad.push('the panel did not grow to size 3');
    if (!(e.h > 0.9 + F.SIGN_DIM[3][1] - 1e-6)) bad.push('the sign height was not recomputed: ' + e.h);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.sign-saves-and-loads-with-its-settings-and-a-fresh-texture', async () => {
    reset(); const bad = [], r = await onFloor('sign', -9, 4); if (!r.ok) return r.why; const e = r.ent;
    g.setCfg(e, { text: 'Sorting bay', size: 2, tone: 'blue', icon: 'box', lit: true });
    const raw = JSON.parse(JSON.stringify(S().entities)); K.hooks.before = null;
    // the save path: the entity list is plain JSON. Drop everything and add it back the way loading does.
    for (const x of [...S().entities]) if (!x.free) { const it = mach(x); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(x.id); } }
    S().entities = S().entities.filter((x) => x.free); for (const x of raw) if (!x.free) { S().entities.push(x); g.addEntity(x); }
    const back = S().entities.find((x) => x.type === 'sign'), it = back && mach(back);
    if (!back || back.text !== 'Sorting bay' || back.size !== 2 || back.tone !== 'blue' || back.icon !== 'box' || back.lit !== true) bad.push('settings lost: ' + JSON.stringify(back));
    if (!it || !it.obj.userData.tex) bad.push('no texture after loading'); else { const c = it.obj.userData.tex.image; if (c.width !== Math.round(F.SIGN_DIM[2][0] * 256) || c.height !== Math.round(F.SIGN_DIM[2][1] * 256)) bad.push('texture size ' + c.width + 'x' + c.height); const px = c.getContext('2d').getImageData(c.width >> 1, 3, 1, 1).data; if (px[3] === 0) bad.push('the sign was not drawn'); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.depth-sign-prints-the-depth-and-the-cheapest-frame-rated-for-it', async () => {
    reset(); const bad = [], r = await onFloor('psign', -9, 4); if (!r.ok) return r.why; const e = r.ent;
    const at = (x, z) => { e.x = x; e.z = z; return F.signLines(e); };
    let l = at(300, 0); if (l.text !== 'DEPTH 300 m' || !/Steel Frame/.test(l.sub)) bad.push('300 m: ' + JSON.stringify(l));
    l = at(0, -500); if (l.text !== 'DEPTH 500 m' || !/Concrete Lining/.test(l.sub)) bad.push('500 m: ' + JSON.stringify(l));
    l = at(60, 80); if (l.text !== 'DEPTH 100 m' || !/Timber Frame/.test(l.sub)) bad.push('100 m: ' + JSON.stringify(l));
    l = at(4800, 0); if (!/Event Horizon/.test(l.sub)) bad.push('4.8 km: ' + JSON.stringify(l));
    e.x = r.ent.x; e.z = r.ent.z; const info = infoFor(g, { kind: 'mach', id: e.id }); if (!info || !/Depth here/.test(info.lines.join(' ')) || BAD.test(info.lines.join(' '))) bad.push('readout: ' + JSON.stringify(info));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.direction-sign-turns-its-arrow-and-keeps-a_short_label', async () => {
    reset(); const bad = [], r = await onFloor('dsign', -9, 4); if (!r.ok) return r.why; const e = r.ent;
    if (!g.setCfg(e, { arrow: 5, text: 'EXIT 4.9 km east and then some' }).ok || e.arrow !== 5 || e.text.length !== 16) bad.push('arrow or label: ' + JSON.stringify([e.arrow, e.text]));
    for (const patch of [{ arrow: 8 }, { arrow: -1 }, { arrow: 1.2 }, { icon: 'warn' }]) if (g.setCfg(e, patch).ok) bad.push('accepted ' + JSON.stringify(patch));
    const l = F.signLines(e); if (l.arrow !== 5) bad.push('lines ' + JSON.stringify(l));
    const info = infoFor(g, { kind: 'mach', id: e.id }); if (!/Arrow/.test(info.lines[0])) bad.push('readout ' + info.lines[0]);
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- locker and parts crate
  await guard('furnish.locker-transfers-items', async () => {
    reset(); const bad = [], wl = wall(-2, 2), r = await putAt('locker', wl.x, 0.9, wl.z, 2); if (!r.ok) return r.why; const e = r.ent;
    if (e.mount !== 'wall' || e.dir !== 2) bad.push('mount ' + e.mount + ' dir ' + e.dir);
    Object.assign(S().items, { dynamite: 10, medkit: 5, flare: 20, 'cart:2': 1, 'frame:steel': 3 });
    const put = (id, n) => act(e, { k: 'put', id, n }), take = (id, n) => act(e, { k: 'take', id, n });
    put('dynamite', 10); if (S().items.dynamite !== undefined || e.cargo.dynamite !== 10) bad.push('put 10 dynamite: ' + JSON.stringify([S().items.dynamite, e.cargo]));
    put('medkit', 99); if (S().items.medkit !== undefined || e.cargo.medkit !== 5) bad.push('put the 5 medkits: ' + JSON.stringify(e.cargo));
    put('flare', 99); if (count(e) !== 24 || e.cargo.flare !== 9 || S().items.flare !== 11) bad.push('the locker takes 24 in all: ' + JSON.stringify([e.cargo, S().items.flare]));
    put('frame:steel', 1); if (e.cargo['frame:steel']) bad.push('a full locker took one more');
    put('cart:2', 1); if (e.cargo['cart:2']) bad.push('a cart went into a locker');
    put('nothing-here', 1); put('constructor', 1); put('__proto__', 1); if (Object.keys(e.cargo).length !== 3) bad.push('junk keys: ' + Object.keys(e.cargo));
    take('dynamite', 4); if (S().items.dynamite !== 4 || e.cargo.dynamite !== 6) bad.push('take 4: ' + JSON.stringify([S().items.dynamite, e.cargo.dynamite]));
    take('dynamite', 99); if (S().items.dynamite !== 10 || 'dynamite' in e.cargo) bad.push('take the rest: ' + JSON.stringify([S().items.dynamite, e.cargo]));
    take('ghost', 1); if (S().items.ghost !== undefined) bad.push('took something that is not there');
    // the totals never change: items in the pack plus items in the locker
    const tot = (id) => (S().items[id] || 0) + (e.cargo[id] || 0); if (tot('flare') !== 20 || tot('medkit') !== 5 || tot('dynamite') !== 10) bad.push('items were made or lost');
    // the act key never stays on the ent and the toast says what happened
    if ('act' in e) bad.push('the write only act key stayed on the ent');
    // the hammer gives the locker back with its contents
    g.doDecon({ kind: 'mach', id: e.id }); if (S().items.locker !== 1 || S().items.medkit !== 5 || S().items.flare !== 20) bad.push('hammer did not return the contents: ' + JSON.stringify(S().items));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.parts-crate-moves-building-material-and-holds-100-stacks', async () => {
    reset(); const bad = [], r = await onFloor('pcrate', -9, 4); if (!r.ok) return r.why; const e = r.ent;
    S().mats = { timber: 6000, steel: 7000, concrete: 50 };
    act(e, { k: 'put', id: 'timber', n: 100000 }); act(e, { k: 'put', id: 'steel', n: 100000 });
    if (e.cargo.timber !== 6000 || e.cargo.steel !== 4000 || S().mats.steel !== 3000 || 'timber' in S().mats) bad.push('10,000 units (100 stacks): ' + JSON.stringify([e.cargo, S().mats]));
    act(e, { k: 'put', id: 'concrete', n: 5 }); if (e.cargo.concrete) bad.push('a full crate took more');
    act(e, { k: 'take', id: 'timber', n: 100 }); if (S().mats.timber !== 100 || e.cargo.timber !== 5900) bad.push('take 100: ' + JSON.stringify([S().mats.timber, e.cargo.timber]));
    act(e, { k: 'put', id: 'concrete', n: 5 }); if (e.cargo.concrete !== 5) bad.push('room after a take: ' + JSON.stringify(e.cargo));
    act(e, { k: 'put', id: 'dynamite', n: 1 }); S().items.dynamite = 2; act(e, { k: 'put', id: 'dynamite', n: 1 }); if (e.cargo.dynamite) bad.push('an item went into a parts crate');
    const info = infoFor(g, { kind: 'mach', id: e.id }); if (!/9,\d{3} of 10,000/.test(info.lines[0]) && !/10,000/.test(info.lines[0])) bad.push('readout: ' + info.lines[0]);
    g.doDecon({ kind: 'mach', id: e.id }); if (S().mats.timber !== 6000 || S().mats.steel !== 7000 || S().mats.concrete !== 50) bad.push('materials after the hammer: ' + JSON.stringify(S().mats));
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- the silo and belts
  // a belt line east of a silo: silo -> belts -> vault. Returns the pieces.
  const lineFrom = async (siloX, siloZ, nBelts = 3) => {
    const s = await onFloor('silo', siloX, siloZ, 2, { yaw: Math.PI / 2 }); if (!s.ok) throw new Error('silo: ' + s.why);
    const e = s.ent; const belts = [];
    for (let q = 1; q <= nBelts; q++) { const t = { id: g.nextId(), type: 'belt', i: e.i + q, j: e.j, k: e.k, dir: 0, rise: 0, items: [] }; S().entities.push(t); g.addEntity(t); belts.push(L().byId.get(t.id)); }
    const v = { id: g.nextId(), type: 'vault', i: e.i + nBelts + 1, j: e.j, k: e.k, dir: 0, rise: 0 }; S().entities.push(v); g.addEntity(v);
    return { e, belts, vault: L().byId.get(v.id) };
  };
  await guard('furnish.silo-filter-and-output', async () => {
    reset(); const bad = []; await grid(-6, 8, 60); const { e, belts, vault } = await lineFrom(-9, 4);
    if (e.dir !== 0) bad.push('the silo faces ' + e.dir + ', not east');
    e.cargo = { '10:0': 6, '20:0': 6, '20:128': 2, '30:0': 4 };
    if (g.setCfg(e, { filter: 20 }).ok === false || e.filter !== 20) bad.push('could not set the filter');
    run(7); const sp20 = vault.stored.filter((x) => x.sp === 20).length;
    if (vault.stored.some((x) => x.sp !== 20) || sp20 !== 8) bad.push(`the filter let through ${vault.stored.length} plush, ${sp20} of them species 20 (want 8): ` + JSON.stringify(vault.stored.slice(0, 5)));
    if (!vault.stored.some((x) => x.vr === 128)) bad.push('the shiny variant was lost');
    if (count(e) !== 10 || e.cargo['20:0'] || e.cargo['20:128']) bad.push('what is left: ' + JSON.stringify(e.cargo));
    g.setCfg(e, { filter: -1 }); run(8); if (count(e) !== 0 || vault.stored.length !== 18) bad.push(`any: ${vault.stored.length} in the vault, ${count(e)} left, belts ${belts.map((b) => b.items.length)}`);
    // oldest first: the 10s were stored before the 30s
    const firsts = vault.stored.slice(8, 14).map((x) => x.sp); if (firsts.join() !== '10,10,10,10,10,10') bad.push('not oldest first: ' + firsts.join());
    if (g.setCfg(e, { filter: 99999 }).ok || g.setCfg(e, { filter: -2 }).ok || g.setCfg(e, { filter: 2.5 }).ok) bad.push('a bad filter was accepted');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.silo-output-runs-at-belt-rate-and-waits-for-a-belt', async () => {
    reset(); const bad = []; await grid(-6, 8, 60); const s = await onFloor('silo', -9, 4); if (!s.ok) return s.why; const e = s.ent;
    e.cargo = { '10:0': 400 };
    run(3); if (count(e) !== 400) bad.push('plush left a silo with no belt on its face: ' + count(e));
    const t = { id: g.nextId(), type: 'belt', i: e.i + 1, j: e.j, k: e.k, dir: 0, rise: 0, items: [] }; S().entities.push(t); g.addEntity(t);
    const v = { id: g.nextId(), type: 'vault', i: e.i + 2, j: e.j, k: e.k, dir: 0, rise: 0 }; S().entities.push(v); g.addEntity(v); const vt = L().byId.get(v.id);
    run(10); const out = vt.stored.length, rate = g.T.beltSpeed / 0.34;
    if (out < 30 || out > rate * 10 + 6) bad.push(`${out} plush in 10 s, belt rate is ${rate.toFixed(1)} per s`);
    if (out + count(e) + L().byId.get(t.id).items.length !== 400) bad.push('plush were made or lost: ' + (out + count(e)));
    // a belt that faces back at the silo is head on: nothing goes onto it
    const t2 = L().byId.get(t.id); t2.dir = 2; t2.items.length = 0; const before = count(e); run(1); if (count(e) !== before) bad.push('plush went onto a belt that faces the silo');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.silo-fills-from-a-belt-and-never-spills-when-full', async () => {
    reset(); const bad = [], s = await onFloor('silo', -9, 4, 2, { yaw: Math.PI / 2 }); if (!s.ok) return s.why; const e = s.ent;
    const feed = { id: g.nextId(), type: 'belt', i: e.i - 1, j: e.j, k: e.k, dir: 0, rise: 0, items: [] }; S().entities.push(feed); g.addEntity(feed); const bt = L().byId.get(feed.id);
    for (let n = 0; n < 3; n++) bt.items.push({ sp: 5 + n, vr: n === 2 ? 128 : 0, t: 0.1 + n * 0.34 });
    const bodies = g.sim.n; run(4);
    if (count(e) !== 3 || bt.items.length) bad.push(`3 plush should be in the silo: ${count(e)} (belt holds ${bt.items.length})`);
    if (g.sim.n !== bodies) bad.push('a plush spilled onto the floor');
    if (!e.cargo['7:128'] || !e.cargo['5:0']) bad.push('contents ' + JSON.stringify(e.cargo));
    // full: the belt backs up instead of spilling, and nothing is lost
    e.cargo = { '9:0': F.CAP.silo }; for (let n = 0; n < 3; n++) bt.items.push({ sp: 11, vr: 0, t: 0.1 + n * 0.34 });
    run(15); const tile = L().byId.get(-e.id);
    if (g.sim.n !== bodies) bad.push('a full silo spilled plush onto the floor');
    if (count(e) !== F.CAP.silo) bad.push('a full silo took more: ' + count(e));
    if (bt.items.length + tile.stored.length !== 3) bad.push(`3 plush are unaccounted for: belt ${bt.items.length}, intake ${tile.stored.length}`);
    // make room: the backed up plush flow in
    e.cargo = { '9:0': 10 }; run(3); if (count(e) !== 13 || bt.items.length) bad.push('the backed up plush did not flow in: ' + count(e));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.silo-deposits-what-you-carry-takes-plush-out-and-never-takes-the-one', async () => {
    reset(); const bad = [], s = await onFloor('silo', -9, 4); if (!s.ok) return s.why; const e = s.ent;
    S().carry = [...plushes(5, 8), { sp: NEEDLE, vr: 0 }, ...plushes(2, 9, 128)]; g.ui.setCarry(S().carry, g.T.carry);
    act(e, { k: 'dep' }); if (count(e) !== 7 || S().carry.length !== 1 || S().carry[0].sp !== NEEDLE) bad.push('deposit: ' + JSON.stringify([e.cargo, S().carry.map((q) => q.sp)]));
    S().carry = []; g.T.carry = 4;
    act(e, { k: 'get', sp: 9, n: 10 }); if (S().carry.length !== 2 || S().carry.some((q) => q.sp !== 9 || q.vr !== 128) || e.cargo['9:128']) bad.push('take species 9: ' + JSON.stringify(S().carry));
    act(e, { k: 'get', sp: -1, n: 10 }); if (S().carry.length !== 4) bad.push('hands full at 4: ' + S().carry.length);
    act(e, { k: 'get', sp: -1, n: 10 }); if (S().carry.length !== 4 || count(e) !== 3) bad.push('took more than the hands hold');
    act(e, { k: 'get', sp: 77, n: 1 }); if (S().carry.length !== 4) bad.push('took a species that is not there');
    if (g.setCfg(e, { act: { k: 'dep', items: [{ sp: NEEDLE, vr: 0 }] } }).ok) bad.push('The One was accepted in a deposit list');
    if (g.setCfg(e, { act: { k: 'put', id: 'dynamite', n: 1 } }).ok) bad.push('a silo accepted an item transfer');
    // the One that arrives on a belt comes back as the win, never as money
    let found = 0; const keep = g.foundNeedle; g.foundNeedle = () => { found++; }; e.cargo = { [NEEDLE + ':0']: 1 }; S().carry = []; g.T.carry = 6;
    try { act(e, { k: 'get', sp: -1, n: 5 }); } finally { g.foundNeedle = keep; }
    if (found !== 1 || count(e) !== 0 || S().carry.length) bad.push('The One: found ' + found + ', in hands ' + S().carry.length);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.hammer-on-a-full-silo-fills-your-hands-sells-the-rest-and-keeps-the-one', async () => {
    reset(); const bad = [], s = await onFloor('silo', -9, 4); if (!s.ok) return s.why; const e = s.ent;
    e.cargo = { '10:0': 30, '12:128': 5, [NEEDLE + ':0']: 1 }; S().carry = []; g.T.carry = 10; const m0 = S().money, sp0 = S().stats.sold || 0; let found = 0; const keep = g.foundNeedle; g.foundNeedle = () => { found++; };
    try { g.doDecon({ kind: 'mach', id: e.id }); } finally { g.foundNeedle = keep; }
    if (S().carry.length !== 10) bad.push('hands ' + S().carry.length);
    if (found !== 1) bad.push('The One was sold or lost (found ' + found + ')');
    if (!(S().money > m0) || (S().stats.sold || 0) <= sp0) bad.push('the overflow was not sold');
    if (S().items.silo !== 1 || g.machines.items.has(e.id) || L().byId.has(-e.id)) bad.push('silo or intake still there');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.output-vault-feeds-the-oldest-plush-onto-the-belt-it-faces', async () => {
    reset(); const bad = []; await grid(-6, 8, 60);
    craft('ovault'); selectTool('ovault'); aimPoint(-9, 0, 4, 2); const pl = await plan(); if (!pl.ok) return pl.why;
    const before = ids(); g.placeCurrent(g.curTool()); const e = S().entities.find((x) => !before.has(x.id)); if (!e) return 'not placed';
    if (e.type !== 'vault' || e.out !== true || e.dir !== 0 || !L().byId.get(e.id)) bad.push('not an output vault tile: ' + JSON.stringify(e));
    const t = L().byId.get(e.id); t.stored.push(...[1, 2, 3, 4, 5, 6].map((sp) => ({ sp, vr: 0 })));
    run(2); if (t.stored.length !== 6) bad.push('it fed a belt that is not there');
    const b = { id: g.nextId(), type: 'belt', i: e.i + 1, j: e.j, k: e.k, dir: 0, rise: 0, items: [] }; S().entities.push(b); g.addEntity(b);
    const v = { id: g.nextId(), type: 'vault', i: e.i + 2, j: e.j, k: e.k, dir: 0, rise: 0 }; S().entities.push(v); g.addEntity(v); const vt = L().byId.get(v.id);
    run(5); if (vt.stored.map((x) => x.sp).join() !== '1,2,3,4,5,6' || t.stored.length) bad.push('order or count: ' + vt.stored.map((x) => x.sp).join() + ' left ' + t.stored.length);
    const o = L().objs.get(e.id); if (!o || !o.userData.outMark) bad.push('no output chute on the model');
    const info = infoFor(g, { kind: 'tile', id: e.id }); if (!/OUTPUT/.test(info.lines.join(' '))) bad.push('readout ' + JSON.stringify(info.lines));
    g.doDecon({ kind: 'tile', id: e.id }); if (S().items.ovault !== 1) bad.push('the hammer gave back ' + JSON.stringify(S().items));
    // a plain vault still comes back as a plain vault
    const pv = { id: g.nextId(), type: 'vault', i: e.i, j: e.j, k: e.k + 3, dir: 0, rise: 0 }; S().entities.push(pv); g.addEntity(pv); g.doDecon({ kind: 'tile', id: pv.id }); if (S().items.vault !== 1) bad.push('a plain vault came back as ' + JSON.stringify(S().items));
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- the dimensional depot
  const mkVault = (i, k, stored) => { const v = { id: g.nextId(), type: 'vault', i, j: 0, k, dir: 0, rise: 0 }; S().entities.push(v); g.addEntity(v); const t = L().byId.get(v.id); t.stored.push(...stored); return t; };
  await guard('furnish.depot-pool-shares-count', async () => {
    reset(); const bad = [], d = await onFloor('dimdepot', -9, 4); if (!d.ok) return d.why; const e = d.ent;
    const si = await onFloor('silo', -9, 6); if (!si.ok) return si.why; si.ent.cargo = { '10:0': 30, '11:0': 2 };
    const i0 = toI(e.x), k0 = toK(e.z);
    const v1 = mkVault(i0 + 12, k0 - 6, [...plushes(5, 10), ...plushes(3, 12)]), v2 = mkVault(i0 - 14, k0 - 3, plushes(7, 12));
    const near = mkVault(i0 + 58, k0, plushes(9, 10));            // 34.8 m: inside
    const far = mkVault(i0 + 61, k0, plushes(100, 10));           // 36.6 m: outside
    e.cargo = { '10:0': 4, '13:128': 2 }; F.scanNow(g);
    const pool = F.poolOf(g, e);
    const want = { 10: 5 + 4 + 30 + 9, 11: 2, 12: 3 + 7, 13: 2 };
    for (const [sp, n] of Object.entries(want)) if (pool.by[sp] !== n) bad.push(`species ${sp}: pool ${pool.by[sp]}, want ${n}`);
    if (pool.total !== 48 + 2 + 10 + 2 || pool.nVault !== 3 || pool.nSilo !== 1) bad.push('totals ' + JSON.stringify([pool.total, pool.nVault, pool.nSilo]));
    // taking drains the sources in order (the depot's own store, silos, then vaults) and the pool follows
    S().carry = []; g.T.carry = 200; act(e, { k: 'get', sp: 10, n: 45 });
    if (S().carry.length !== 45 || S().carry.some((q) => q.sp !== 10)) bad.push('took ' + S().carry.length);
    if (e.cargo['10:0'] || si.ent.cargo['10:0']) bad.push('own store and silo are drained first: ' + JSON.stringify([e.cargo, si.ent.cargo]));
    F.scanNow(g); const after = F.poolOf(g, e); if (after.by[10] !== 3) bad.push('pool after taking 45 of 48: ' + after.by[10]);
    if (after.total !== pool.total - 45) bad.push('total after: ' + after.total + ' (was ' + pool.total + ')');
    if (far.stored.length !== 100) bad.push('took from a vault out of range');
    if (v1.stored.filter((x) => x.sp === 10).length !== 0 || near.stored.filter((x) => x.sp === 10).length !== 3) bad.push('vault order: ' + v1.stored.length + ' / ' + near.stored.length);
    // the readout and the summary agree with the pool
    const s = F.summaryOf(g, e); if (s.p !== after.total || s.v !== 3 || s.o !== 1 || s.n !== count(e)) bad.push('summary ' + JSON.stringify(s));
    const info = infoFor(g, { kind: 'mach', id: e.id }); if (!info.lines.join(' ').includes(String(after.total))) bad.push('readout does not show the pool: ' + info.lines.join(' | '));
    void v2;
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.depot-range-edge-and-a-removed-vault-leaves-the-pool', async () => {
    reset(); const bad = [], d = await onFloor('dimdepot', -9, 4); if (!d.ok) return d.why; const e = d.ent; const i0 = toI(e.x), k0 = toK(e.z);
    const mk = (di) => mkVault(i0 + di, k0, plushes(3, 5)); const a = mk(59), b = mk(61); F.scanNow(g);
    let pool = F.poolOf(g, e); if (pool.nVault !== 1 || pool.total !== 3) bad.push('59 cells (35.4 m) in, 61 (36.6 m) out: ' + JSON.stringify([pool.nVault, pool.total]));
    g.doDecon({ kind: 'tile', id: a.id }); F.scanNow(g); pool = F.poolOf(g, e); if (pool.total !== 0) bad.push('a removed vault is still pooled: ' + pool.total);
    void b; return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.depot-pull-port-takes-a-chosen-species-from-the-pool-onto-a-belt', async () => {
    reset(); const bad = []; await grid(-6, 8, 60); const s = await onFloor('dimdepot', -9, 4); if (!s.ok) return s.why; const e = s.ent;
    // the belt ends in the open (a vault here would be part of the pool again): count what reaches its end
    const b = { id: g.nextId(), type: 'belt', i: e.i + 1, j: e.j, k: e.k, dir: 0, rise: 0, items: [] }; S().entities.push(b); g.addEntity(b);
    mkVault(e.i + 10, e.k + 4, [...plushes(6, 21), ...plushes(6, 22)]); mkVault(e.i - 10, e.k + 2, plushes(4, 22)); e.cargo = { '23:0': 3 }; F.scanNow(g);
    const seen = []; L().dropEnd = (tile, it) => { seen.push(it.sp); return true; };
    try { g.setCfg(e, { filter: 22 }); run(7); } finally { delete L().dropEnd; }
    if (seen.length !== 10 || seen.some((x) => x !== 22)) bad.push(`the belt end saw ${seen.length}: ${[...new Set(seen)]} (want ten of species 22)`);
    if (F.poolOf(g, e).by[22] !== undefined) bad.push('the pool still lists species 22');
    if (F.poolOf(g, e).by[21] !== 6 || F.poolOf(g, e).by[23] !== 3) bad.push('other species were touched');
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- lights and power
  const lamps = () => g.machines.lights(new ctx.V3(-9, 1.2, 8), 99);
  await guard('furnish.ceiling-lamp-needs-power-and-a-roof-in-auto-and-obeys-its-mode', async () => {
    reset(); const bad = [], rf = roof(-5, 0);
    const r = await putAt('clamp', rf.x, rf.y - 0.01, rf.z - 0.6, 2.4); if (!r.ok) return r.why; const e = r.ent;
    if (e.mount !== 'ceiling' || e.mode !== 'auto') bad.push('mount/mode ' + e.mount + '/' + e.mode);
    run(2); if (lamps().some((l) => l.type === 'clamp')) bad.push('lit with no power');
    await grid(-7, 3); run(2);
    if (!((e.pw ?? 0) > 0.9)) bad.push('pw ' + e.pw);
    if (!lamps().some((l) => l.type === 'clamp' && Math.abs(l.lr - 12) < 1e-6)) bad.push('not in the lights list with a 12 m radius under a roof');
    clearCells(); run(1.2); if (lamps().some((l) => l.type === 'clamp')) bad.push('still lit in the open after the roof went');
    g.setCfg(e, { mode: 'on' }); run(0.3); if (!lamps().some((l) => l.type === 'clamp')) bad.push('mode on did not light it in the open');
    g.setCfg(e, { mode: 'off' }); run(0.3); if (lamps().some((l) => l.type === 'clamp')) bad.push('mode off left it lit');
    if (g.setCfg(e, { mode: 'blink' }).ok || g.setCfg(e, { mode: 'auto', deg: 3 }).ok) bad.push('a bad mode patch was accepted');
    const lens = mach(e).obj.getObjectByName('lens'); g.setCfg(e, { mode: 'on' }); run(0.3); if (!lens || lens.material === undefined) bad.push('no lens'); else if (lens.material.color.r < 1.5) bad.push('the lens is not glowing when lit');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.a-frame-overhead-counts-as-a-roof-for-auto-lamps', async () => {
    reset(); const bad = []; await grid(-7, 8);
    const r = await onFloor('clamp', -6, 9.7); if (!r.ok) return r.why; const e = r.ent; run(1.4);
    if (lamps().some((l) => l.type === 'clamp')) bad.push('a floor lamp in the open was lit in auto');
    const f = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'x', cx: e.x, cz: e.z, y0: 0, w: 2.36, h: 2.38, gm: 0, glo: 0, gj: 0, yaw: Math.PI / 2 }; S().entities.push(f); g.addEntity(f);
    run(1.4); if (!lamps().some((l) => l.type === 'clamp')) bad.push('a lamp under a frame did not come on in auto');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.lights-draw-power-from-the-grid-and-dim-in-a-brownout', async () => {
    reset(); const bad = []; const { gen, pole } = await grid(-7, 8);
    const fl = []; for (let n = 0; n < 4; n++) { const r = await onFloor('flood', -9 + n * 1.2, 9.7, 2); if (!r.ok) return 'flood ' + n + ': ' + r.why; fl.push(r.ent); }
    run(2); const net = g.power.nets.find((n) => n.nodes.some((q) => q.id === gen.id)); if (!net) return 'no grid';
    if (Math.abs(net.furn - 24) > 1e-6) bad.push('the grid was not told about the 24 kW of floodlights: furn ' + net.furn);
    if (!(net.demand >= 24)) bad.push('demand ' + net.demand);
    const sat = net.supply / net.demand; if (!(sat < 0.4) || Math.abs(net.sat - sat) > 1e-6) bad.push(`sat ${net.sat} supply ${net.supply} demand ${net.demand}`);
    for (const e of fl) if (Math.abs(e.pw - net.sat) > 0.01) bad.push('a floodlight pw ' + e.pw + ' vs grid ' + net.sat);
    const l = lamps().filter((x) => x.type === 'flood'); if (l.length !== 4) bad.push(l.length + ' floodlights lit');
    else { const k = Math.max(...l[0].lc); if (!(k < 0.4 * 2.8 + 0.05)) bad.push('not dimmed in the brownout: ' + k); }
    // switching three off brings the light back up
    for (const e of fl.slice(0, 3)) g.setCfg(e, { mode: 'off' }); run(2.5);
    const net2 = g.power.nets.find((n) => n.nodes.some((q) => q.id === gen.id)); if (!(net2.sat > 0.99)) bad.push('sat after switching off: ' + net2.sat);
    const l2 = lamps().filter((x) => x.type === 'flood'); if (l2.length !== 1 || Math.max(...l2[0].lc) < 2.7) bad.push('the remaining floodlight is not at full light: ' + JSON.stringify(l2.map((x) => x.lc)));
    // a pole out of reach: not powered
    const far = await onFloor('flood', -9, 25); if (far.ok) { run(1.5); if (far.ent.pw > 0.01) bad.push('a floodlight 17 m from the nearest pole is powered: ' + far.ent.pw); }
    void pole; return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.floodlight-respects-light-budget', async () => {
    reset(); const bad = []; await grid(-7, 8, 60, 4);
    const placed = [], why = []; for (let n = 0; n < 40; n++) { const x = -12 + (n % 10) * 0.9, z = 3.5 + Math.floor(n / 10) * 0.9; const r = await onFloor(n < 4 ? 'flood' : 'strip', x, z, 2); if (r.ok) placed.push(r.ent); else why.push(n + ': ' + r.why); }
    if (placed.length < 36) return 'only placed ' + placed.length + ' (' + why.join('; ') + ')';
    S().money = 1e12; run(2.5);
    const cam = new ctx.V3(-9, 1.2, 5), all = g.machines.lights(cam, 99), four = g.machines.lights(cam, 4);
    if (all.length !== F.LIGHT_CAP) bad.push(`${all.length} real lights, the cap is ${F.LIGHT_CAP}`);
    if (four.length !== 4) bad.push('asked for 4, got ' + four.length);
    // the ones kept are the closest by weighted distance (a floodlight reaches further than a strip)
    const score = (l) => ((l.x - cam.x) ** 2 + (l.y - cam.y) ** 2 + (l.z - cam.z) ** 2) * (9 / l.lr) ** 2;
    for (let q = 1; q < all.length; q++) if (score(all[q]) < score(all[q - 1]) - 1e-9) bad.push('not sorted at ' + q);
    for (const l of all) if (!l.lc || l.lc.some((v) => !Number.isFinite(v)) || !(l.lr > 0)) bad.push('bad light ' + JSON.stringify(l));
    // the rest still glow (fake emissive): every lit one has a lit lens or bar
    let lit = 0; for (const e of placed) { const it = mach(e), n = it.obj.getObjectByName(e.type === 'strip' ? 'bar' : 'lens'); if (it.lvl > 0.02 && n && n.material.color.r > 1.5) lit++; } if (lit !== placed.length) bad.push(`${lit} of ${placed.length} glow`);
    // the game gives the shader the nearest few: the list is what it asks for
    const gl = g.glowSources(cam, 8); if (gl.length !== 8 || gl.some((x) => !(x.r > 0))) bad.push('glowSources ' + gl.length);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.floodlight-aims-with-turn-and-tilt-and-the-cone-follows', async () => {
    reset(); const bad = []; await grid(-7, 8); const r = await onFloor('flood', -9, 9.5); if (!r.ok) return r.why; const e = r.ent; run(1.5);
    if (e.tilt !== -15 || e.mode !== 'on') bad.push('defaults ' + e.tilt + ' ' + e.mode);
    for (const patch of [{ deg: 360 }, { deg: -1 }, { tilt: 90 }, { tilt: -86 }, { deg: 1.5 }, { mode: 'auto' }]) if (g.setCfg(e, patch).ok) bad.push('accepted ' + JSON.stringify(patch));
    const spot = () => { const l = lamps().find((q) => q.type === 'flood'); return l && { x: l.x, y: l.y, z: l.z }; };   // the light objects are reused, so copy the numbers
    g.setCfg(e, { deg: 90, tilt: 0 }); run(0.3); const a = spot(); if (!a || !(a.x > e.x + 7.5) || Math.abs(a.z - e.z) > 0.2) bad.push('90 degrees should light east: ' + JSON.stringify([a && a.x - e.x, a && a.z - e.z]));
    g.setCfg(e, { deg: 0, tilt: -45 }); run(0.3); const b = spot(); if (!b || !(b.z > e.z + 0.5) || !(b.z < e.z + 2) || !(a && b.y < a.y - 0.5)) bad.push('tilting down should bring the light to the floor ahead: ' + JSON.stringify([b && b.z - e.z, b && b.y, a && a.y]));
    const head = mach(e).obj.getObjectByName('head'); if (!head || Math.abs(head.rotation.x - Math.PI / 4) > 1e-6) bad.push('the head did not tilt ' + (head && head.rotation.x));
    const beam = mach(e).obj.getObjectByName('beam'); if (!beam || !beam.visible) bad.push('no visible cone when lit');
    g.setCfg(e, { deg: 270, tilt: 30 }); run(0.3); const c = spot(); if (!c || !(c.x < e.x - 6) || !(c.y > a.y + 3)) bad.push('west and up: ' + JSON.stringify([c && c.x - e.x, c && c.y]));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.strip-light-draws-0.15-kw-and-lights-a-lane', async () => {
    reset(); const bad = []; const { gen } = await grid(-7, 8);
    const r = await onFloor('strip', -8, 10); if (!r.ok) return r.why; run(1.6);
    const net = g.power.nets.find((n) => n.nodes.some((q) => q.id === gen.id)); if (Math.abs(net.furn - 0.15) > 1e-6) bad.push('furn ' + net.furn);
    const l = lamps().find((q) => q.type === 'strip'); if (!l || l.lr !== 6) bad.push('strip light ' + JSON.stringify(l));
    const info = infoFor(g, { kind: 'mach', id: r.ent.id }); if (!/0\.15 kW/.test(info.lines.join(' '))) bad.push('readout ' + info.lines.join(' | '));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.lit-signs-draw-0.1-kw-and-glow-and-unlit-ones-draw-nothing', async () => {
    reset(); const bad = []; const { gen } = await grid(-7, 8); const r = await onFloor('sign', -8, 10); if (!r.ok) return r.why; const e = r.ent; run(1.6);
    const net = () => g.power.nets.find((n) => n.nodes.some((q) => q.id === gen.id)); if (net().furn) bad.push('an unlit sign drew ' + net().furn);
    const face = () => mach(e).obj.userData.face.material; if (face().type !== 'MeshStandardMaterial') bad.push('unlit sign is emissive');
    g.setCfg(e, { lit: true }); run(1.6); if (Math.abs(net().furn - 0.1) > 1e-6) bad.push('lit sign draws ' + net().furn);
    if (face().type !== 'MeshBasicMaterial') bad.push('lit sign does not glow');
    g.setCfg(e, { lit: false }); run(1.6); if (face().type !== 'MeshStandardMaterial') bad.push('sign still glowing after unlit');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.warning-beacon-flashes-on-a-gate-alarm-or-a-tripped-grid', async () => {
    reset(); const bad = []; await grid(-7, 8); const r = await onFloor('wbeacon', -8, 10), fl = await onFloor('flood', -10, 10); if (!r.ok || !fl.ok) return r.why || fl.why; const e = r.ent; run(1.6);
    const sample = (sec) => { const seen = new Set(); for (let t = 0; t < sec / 0.025; t++) { g.time += 0.025; g.updatePlay(0.025); seen.add(lamps().some((l) => l.type === 'wbeacon')); } return seen; };
    let s = sample(1); if (s.has(true)) bad.push('flashing with no alarm');
    g.alarmGate = { alarm: true }; run(0.6); s = sample(1); if (!(s.has(true) && s.has(false))) bad.push('a gate alarm did not make it flash on and off: ' + [...s]);
    g.alarmGate = null; run(0.6); s = sample(0.6); if (s.has(true)) bad.push('kept flashing after the alarm ended');
    // a breaker that tripped on its grid (power.js will mark the net or one of its nodes with tripped)
    const rc = g.power.recompute; g.power.recompute = function () { rc.call(this); for (const n of this.nets) n.tripped = true; };
    try { g.power.markDirty(); run(1); s = sample(1); if (!(s.has(true) && s.has(false))) bad.push('a tripped grid did not make it flash: ' + [...s]); if (lamps().some((l) => l.type === 'flood')) bad.push('a floodlight stayed lit on a tripped grid'); } finally { delete g.power.recompute; g.power.markDirty(); }
    run(1); s = sample(0.6); if (s.has(true)) bad.push('kept flashing after the grid was reset');
    g.setCfg(e, { mode: 'off' }); g.alarmGate = { alarm: true }; run(0.6); s = sample(0.6); if (s.has(true)) bad.push('mode off still flashed'); g.alarmGate = null;
    g.setCfg(e, { mode: 'on' }); run(0.6); s = sample(0.6); if (!(s.has(true) && s.has(false))) bad.push('mode on did not flash');
    const dome = mach(e).obj.getObjectByName('dome'); if (!dome) bad.push('no dome');
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- save, load, readouts, copy and paste
  await guard('furnish.save-and-load-keep-every-kind-and-its-contents', async () => {
    reset(); const bad = [], wl = wall(-2, 2), rf = roof(-5, 0);
    const mk = [['pcrate', () => onFloor('pcrate', -9, 4)], ['silo', () => onFloor('silo', -8, 6)], ['dimdepot', () => onFloor('dimdepot', -10, 6)], ['sign', () => onFloor('sign', -9, 2)], ['dsign', () => putAt('dsign', wl.x, 0.9, wl.z + 1.2, 2)], ['psign', () => onFloor('psign', -11, 2)], ['clamp', () => putAt('clamp', rf.x, rf.y - 0.01, rf.z - 0.6, 2.4)], ['flood', () => onFloor('flood', -9, 8)], ['strip', () => onFloor('strip', -7, 9)], ['wbeacon', () => onFloor('wbeacon', -9, 10)], ['locker', () => putAt('locker', wl.x, 0.9, wl.z, 2)]];
    const ents = {}; for (const [id, f] of mk) { const r = await f(); if (!r.ok) return `${id}: ${r.why}`; ents[id] = r.ent; }
    ents.silo.cargo = { '10:0': 12, '11:128': 3 }; ents.dimdepot.cargo = { '5:0': 100, '6:128': 9 }; ents.locker.cargo = { dynamite: 3, medkit: 2 }; ents.pcrate.cargo = { timber: 500 };
    g.setCfg(ents.sign, { text: 'Hello', icon: 'star', tone: 'red' }); g.setCfg(ents.flood, { deg: 200, tilt: 20 }); g.setCfg(ents.clamp, { mode: 'on' });
    const raw = JSON.parse(JSON.stringify(S().entities)), snap = JSON.stringify(raw.filter((x) => !x.free).map((x) => { const { pw, ...q } = x; return q; }));
    for (const x of [...S().entities]) if (!x.free) { const it = mach(x); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(x.id); } }
    for (const t of [...L().tiles.values()]) if (t.intakeFor) L().remove(t);
    S().entities = S().entities.filter((x) => x.free); for (const x of raw) if (!x.free) { S().entities.push(x); g.addEntity(x); }
    const after = JSON.stringify(S().entities.filter((x) => !x.free).map((x) => { const { pw, ...q } = x; return q; })); if (after !== snap) bad.push('entities changed through a save and load');
    for (const [id, e] of Object.entries(ents)) { const it = S().entities.find((x) => x.id === e.id); if (!it || !g.machines.items.has(e.id) || !g.machines.items.get(e.id).obj.children.length) bad.push(id + ' lost'); }
    if (!L().byId.get(-ents.silo.id) || !L().byId.get(-ents.dimdepot.id)) bad.push('the intake crates were not rebuilt');
    const si = S().entities.find((x) => x.type === 'silo'); if (count(si) !== 15) bad.push('silo contents ' + count(si));
    // an old save: nothing furnished, or an ent that predates a field, loads without a throw
    const old = { id: g.nextId(), type: 'sign', mount: 'wall', i: toI(-3), j: 1, k: toK(14), dir: 2, x: -3, y: 0.6, z: 8.4, h: 0.3 }; S().entities.push(old); let threw = null; try { g.addEntity(old); } catch (err) { threw = err; } if (threw) bad.push('an old sign threw: ' + threw);
    const olds = { id: g.nextId(), type: 'silo', i: toI(-5), j: 0, k: toK(3), dir: 1, x: -5, y: 0, z: 3, h: 2.4 }; S().entities.push(olds); try { g.addEntity(olds); run(0.3); } catch (err) { bad.push('a silo with no cargo or filter threw: ' + err); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.hover-readouts-name-the-facts-for-every-kind', async () => {
    reset(); const bad = [], wl = wall(-2, 2), rf = roof(-5, 0);
    const mk = [['pcrate', () => onFloor('pcrate', -9, 4)], ['silo', () => onFloor('silo', -8, 6)], ['dimdepot', () => onFloor('dimdepot', -10, 6)], ['sign', () => onFloor('sign', -9, 2)], ['dsign', () => putAt('dsign', wl.x, 0.9, wl.z + 1.2, 2)], ['psign', () => onFloor('psign', -11, 2)], ['clamp', () => putAt('clamp', rf.x, rf.y - 0.01, rf.z - 0.6, 2.4)], ['flood', () => onFloor('flood', -9, 8)], ['strip', () => onFloor('strip', -7, 9)], ['wbeacon', () => onFloor('wbeacon', -9, 10)], ['locker', () => putAt('locker', wl.x, 0.9, wl.z, 2)]];
    const want = { pcrate: /0 of 10,000/, silo: /0 of 2,000 plush/, dimdepot: /0 of 100,000 plush/, sign: /SIGN/, dsign: /Arrow/, psign: /Depth here/, clamp: /0\.5 kW/, flood: /6 kW/, strip: /0\.15 kW/, wbeacon: /0\.3 kW/, locker: /0 of 24 items/ };
    for (const [id, f] of mk) {
      const r = await f(); if (!r.ok) { bad.push(`${id}: ${r.why}`); continue; }
      const info = infoFor(g, { kind: 'mach', id: r.ent.id }); const t = info ? info.title + ' | ' + info.lines.join(' | ') : '';
      if (!info || !info.title || !info.lines.length || BAD.test(t)) bad.push(`${id}: ${t}`); else if (!want[id].test(t)) bad.push(`${id}: readout lacks ${want[id]}: ${t}`);
      if (!/E /.test(t) && !/Unlit|Powered|No power/.test(t)) bad.push(id + ' says nothing about use or power');
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.e-opens-a-panel-for-every-kind-and-it-closes-cleanly', async () => {
    reset(); const bad = [], wl = wall(-2, 2);
    const mk = [['pcrate', () => onFloor('pcrate', -9, 4)], ['silo', () => onFloor('silo', -8, 6)], ['dimdepot', () => onFloor('dimdepot', -10, 6)], ['sign', () => onFloor('sign', -9, 2)], ['dsign', () => putAt('dsign', wl.x, 0.9, wl.z + 1.2, 2)], ['psign', () => onFloor('psign', -11, 2)], ['flood', () => onFloor('flood', -9, 8)], ['wbeacon', () => onFloor('wbeacon', -9, 10)], ['locker', () => putAt('locker', wl.x, 0.9, wl.z, 2)]];
    S().items.dynamite = 3; S().mats = { timber: 40 };
    for (const [id, f] of mk) {
      const r = await f(); if (!r.ok) { bad.push(`${id}: ${r.why}`); continue; }
      const used = TYPES[id].use(g, r.ent); const m = document.getElementById('furn'), body = m && m.querySelector('#furnB');
      if (used !== true || !m || m.classList.contains('hidden') || g.ui.openModal !== 'furn') { bad.push(id + ': the panel did not open'); g.ui.closeModals(); continue; }
      const t = m.textContent; if (BAD.test(t.replace(/null/g, ''))) bad.push(`${id}: panel text ${t.slice(0, 120)}`);
      if (!/\S/.test(body.textContent)) bad.push(id + ': empty panel');
      if (id === 'locker' && !/Dynamite/i.test(t)) bad.push('the locker panel does not list your dynamite: ' + t.slice(0, 160));
      if (id === 'pcrate' && !/Lumber/.test(t)) bad.push('the crate panel does not list your lumber: ' + t.slice(0, 160));
      // a button does its job: the first Put button moves something
      if (id === 'locker') { const b = body.querySelector('[data-a="put"]'); b.click(); if (!count(r.ent)) bad.push('the Put button moved nothing'); }
      if (id === 'sign') { document.getElementById('fText').value = 'From the panel'; body.querySelector('[data-a="save"]').click(); if (r.ent.text !== 'From the panel') bad.push('the Save button did not change the text: ' + r.ent.text); }
      g.ui.closeModals(); if (!document.getElementById('furn').classList.contains('hidden')) bad.push(id + ': did not close');
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.copy-paste-carries-sign-style-and-light-mode-but-not-text', async () => {
    reset(); const bad = [], a = await onFloor('sign', -9, 4), b = await onFloor('sign', -7, 4), c = await onFloor('psign', -5, 4), d = await onFloor('clamp', -11, 4);
    for (const r of [a, b, c, d]) if (!r.ok) return r.why;
    g.setCfg(a.ent, { text: 'KEEP', size: 3, tone: 'yellow', icon: 'fire', lit: true }); g.setCfg(b.ent, { text: 'MINE' });
    if (!g.copyCfg(a.ent)) return 'copy failed'; let r = g.pasteCfg(b.ent); if (!r.ok || b.ent.size !== 3 || b.ent.tone !== 'yellow' || b.ent.icon !== 'fire' || b.ent.lit !== true || b.ent.text !== 'MINE') bad.push('sign to sign: ' + JSON.stringify([r, b.ent.size, b.ent.tone, b.ent.text]));
    r = g.pasteCfg(c.ent); if (!r.ok || c.ent.size !== 3 || c.ent.tone !== 'yellow' || c.ent.icon !== undefined) bad.push('sign to depth sign: ' + JSON.stringify([r, c.ent.size, c.ent.tone, c.ent.icon]));
    r = g.pasteCfg(d.ent); if (r.ok) bad.push('a sign style was pasted into a lamp');
    g.copyCfg(d.ent); g.setCfg(d.ent, { mode: 'off' }); g.cfgClip.vals.mode = 'on'; const e2 = await onFloor('clamp', -3, 4); if (e2.ok) { r = g.pasteCfg(e2.ent); if (!r.ok || e2.ent.mode !== 'on') bad.push('lamp mode paste: ' + JSON.stringify(r)); }
    g.cfgClip = null; return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.silo-filter-copies-between-silos-and-depots', async () => {
    reset(); const bad = [], a = await onFloor('silo', -9, 4), b = await onFloor('dimdepot', -7, 4), c = await onFloor('silo', -5, 4); for (const r of [a, b, c]) if (!r.ok) return r.why;
    g.setCfg(a.ent, { filter: 42 }); g.copyCfg(a.ent); if (!g.pasteCfg(b.ent).ok || b.ent.filter !== 42 || !g.pasteCfg(c.ent).ok || c.ent.filter !== 42) bad.push('filter not pasted');
    g.cfgClip = null; return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.the-hidden-intake-crate-is-never-a-separate-thing-to-the-player', async () => {
    reset(); const bad = [], s = await onFloor('silo', -9, 4); if (!s.ok) return s.why; const e = s.ent, tile = L().byId.get(-e.id);
    if (!tile || !tile.intakeFor || tile.view !== true) return 'no intake crate';
    if (L().objs.get(tile.id).visible) bad.push('the intake crate is drawn');
    if (S().entities.some((x) => x.id === tile.id)) bad.push('the intake crate is saved');
    const info = infoFor(g, { kind: 'tile', id: tile.id }); if (!info || !/PLUSH SILO/.test(info.title)) bad.push('its readout is not the silo: ' + (info && info.title));
    // E on it opens the silo panel; the hammer on it takes the silo down and gives a silo, not a vault
    if (TYPES.vault.use(g, tile) !== true || g.ui.openModal !== 'furn') bad.push('E on the intake did not open the silo panel'); g.ui.closeModals();
    g.doDecon({ kind: 'tile', id: tile.id }); if (S().items.silo !== 1 || S().items.vault) bad.push('hammering the intake gave ' + JSON.stringify(S().items)); if (g.machines.items.has(e.id) || L().byId.has(tile.id)) bad.push('the silo or its intake survived');
    // stray intake crates (the silo went some other way) are cleaned up
    const t2 = { id: -9999, type: 'vault', i: toI(-3), j: 0, k: toK(5), dir: 0, rise: 0, stored: [], view: true, fixed: true, intakeFor: 424242 }; L().add(t2); F.scanNow(g); if (L().byId.has(-9999)) bad.push('a stray intake crate was kept');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.aiming-at-each-kind-finds-it-for-the-readout-and-for-e', async () => {
    reset(); const bad = [], wl = wall(-2, 2), rf = roof(-5, 0);
    const mk = [['pcrate', () => onFloor('pcrate', -9, 4)], ['silo', () => onFloor('silo', -8, 6)], ['dimdepot', () => onFloor('dimdepot', -10, 6)], ['sign', () => onFloor('sign', -9, 2)], ['dsign', () => putAt('dsign', wl.x, 0.9, wl.z + 1.2, 2)], ['psign', () => putAt('psign', wl.x, 1.9, wl.z - 1.2, 2)], ['clamp', () => putAt('clamp', rf.x, rf.y - 0.01, rf.z - 0.6, 2.4)], ['flood', () => onFloor('flood', -9, 8)], ['strip', () => onFloor('strip', -7, 9)], ['wbeacon', () => onFloor('wbeacon', -9, 10)], ['locker', () => putAt('locker', wl.x, 0.9, wl.z, 2)]];
    const { findInfoRef } = await import('../info.js'), EXT = await import('../ext.js'); const ents = [];
    const NAMES = { pcrate: 'partscrate', silo: 'plushsilo', dimdepot: 'dimensionaldepot', sign: 'signboard', dsign: 'directionsign', psign: 'depthsign', clamp: 'ceilinglamp', flood: 'floodlight', strip: 'striplight', wbeacon: 'warningbeacon', locker: 'locker' };
    for (const [id, f] of mk) { const r = await f(); if (!r.ok) return `${id}: ${r.why}`; ents.push(r.ent); }
    for (const e of ents) {
      const back = e.type === 'clamp' || e.type === 'psign' ? 2.6 : 2.2; aimPoint(e.x, e.y + (e.type === 'sign' ? 0.9 + 0.15 : e.h / 2), e.z, back); adv(0.1);
      const ref = findInfoRef(g), hit = EXT.aimedEnt(g), tileOf = (id) => (id < 0 ? -id : id);   // the foot of a silo or depot is its hidden intake crate, which answers for it
      if (!ref || tileOf(ref.id) !== e.id) bad.push(`${e.type}: the readout aims at ${JSON.stringify(ref)}`);
      if (!hit || (hit.intakeFor ?? hit.id) !== e.id) bad.push(`${e.type}: E would reach ${hit && hit.type}`);
      const info = infoFor(g, ref); if (!info || info.title.toLowerCase().replace(/[^a-z]/g, '') !== NAMES[e.type]) bad.push(`${e.type}: the readout says ${info && info.title}`);
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.the-ghost-shows-the-real-model-in-green-or-red', async () => {
    reset(); const bad = [], wl = wall(-2, 2);
    for (const [id, x, y, z, wantOk] of [['pcrate', -9, 0, 4, true], ['silo', -9, 0, 4, true], ['sign', -9, 0, 4, true], ['locker', -9, 0, 4, false], ['locker', wl.x, 0.9, wl.z, true]]) {
      S().hotbar = ['hammer', null, null, null, null, null, null, null, null]; g.rebuildTools(); craft(id); selectTool(id); aimPoint(x, y, z, 2); const pl = await plan();
      const gh = g.machines.ghost; if (!gh) { bad.push(`${id}: no ghost`); continue; }
      if (pl.ok !== wantOk) bad.push(`${id}: plan ok ${pl.ok} (${pl.why})`);
      let col = null, meshes = 0; gh.traverse((c) => { if (c.isMesh) { meshes++; col = c.material.color.getHex(); } });
      if (meshes < 3) bad.push(`${id}: the ghost has ${meshes} parts`); if (col !== (wantOk ? 0x5dffa0 : 0xff5a4a)) bad.push(`${id}: ghost colour ${col && col.toString(16)}`);
      if (Math.abs(gh.position.x - pl.ent.x) > 1e-6 || Math.abs(gh.position.y - pl.ent.y) > 1e-6) bad.push(`${id}: the ghost is not where it would go`);
    }
    g.stowed = true; g.rebuildTools(); if (g.machines.ghost) bad.push('the ghost stayed after putting the tool away'); return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.soak-random-actions-conserve-items-materials-and-plush-and-throw-nothing', async () => {
    reset(); const bad = []; await grid(-6, 8, 80, 2); const wl = wall(-2, 2);
    const lk = await putAt('locker', wl.x, 0.9, wl.z, 2), pc = await onFloor('pcrate', -9, 2), sl = await onFloor('silo', -9, 4), dp = await onFloor('dimdepot', -9, 6), sg = await onFloor('sign', -11, 3), cl = await onFloor('clamp', -11, 5), fl = await onFloor('flood', -11, 7);
    for (const r of [lk, pc, sl, dp, sg, cl, fl]) if (!r.ok) return r.why;
    const e = (r) => r.ent;
    // silo -> belt -> belt -> vault, so plush in transit are counted too
    const b1 = { id: g.nextId(), type: 'belt', i: e(sl).i + 1, j: 0, k: e(sl).k, dir: 0, rise: 0, items: [] }, b2 = { id: g.nextId(), type: 'belt', i: e(sl).i + 2, j: 0, k: e(sl).k, dir: 0, rise: 0, items: [] }, vv = { id: g.nextId(), type: 'vault', i: e(sl).i + 3, j: 0, k: e(sl).k, dir: 0, rise: 0 };
    for (const x of [b1, b2, vv]) { S().entities.push(x); g.addEntity(x); } const vt = L().byId.get(vv.id), belts = [L().byId.get(b1.id), L().byId.get(b2.id)];
    const mkv = X_mk(e(dp)); function X_mk(d) { const v = { id: g.nextId(), type: 'vault', i: d.i + 6, j: 0, k: d.k + 5, dir: 0, rise: 0 }; S().entities.push(v); g.addEntity(v); return L().byId.get(v.id); }
    g.T.carry = 60; S().carry = Array.from({ length: 40 }, (_, q) => ({ sp: 5 + (q % 4), vr: q % 7 === 0 ? 128 : 0 })); mkv.stored.push(...plushes(30, 9));
    S().items = { dynamite: 30, medkit: 20, flare: 40 }; S().mats = { timber: 5000, steel: 3000 };
    F.scanNow(g);
    let seed = 12345; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const itemsTotal = () => ['dynamite', 'medkit', 'flare'].map((k) => (S().items[k] || 0) + (e(lk).cargo[k] || 0));
    const matsTotal = () => ['timber', 'steel'].map((k) => (S().mats[k] || 0) + (e(pc).cargo[k] || 0));
    const plushTotal = () => S().carry.length + count(e(sl)) + count(e(dp)) + vt.stored.length + mkv.stored.length + belts.reduce((n, b) => n + b.items.length, 0) + (L().byId.get(-e(sl).id) ? L().byId.get(-e(sl).id).stored.length : 0) + (L().byId.get(-e(dp).id) ? L().byId.get(-e(dp).id).stored.length : 0);
    const items0 = JSON.stringify(itemsTotal()), mats0 = JSON.stringify(matsTotal()), plush0 = plushTotal();
    const KN = ['dynamite', 'medkit', 'flare', 'timber', 'ghost']; const SPS = [5, 6, 7, 8, 9, -1];
    const forged = [{ evil: 1 }, { act: { k: 'smash' } }, { text: 7 }, { filter: 1e9 }, { mode: 'blink' }, { act: { k: 'put', id: 'dynamite', n: -3 } }, { act: { k: 'get', n: 1e12 } }, { act: { k: 'dep', items: [{ sp: NEEDLE, vr: 0 }] } }, null, [], 'x'];
    const errs0 = g.errCount || 0; let refused = 0, did = 0;
    for (let n = 0; n < 420; n++) {
      const op = rnd(13), id = KN[rnd(5)], amt = 1 + rnd(12);
      if (op === 0) act(e(lk), { k: 'put', id, n: amt }); else if (op === 1) act(e(lk), { k: 'take', id, n: amt });
      else if (op === 2) act(e(pc), { k: 'put', id, n: amt * 200 }); else if (op === 3) act(e(pc), { k: 'take', id, n: amt * 150 });
      else if (op === 4) act(e(sl), { k: 'dep' }); else if (op === 5) act(e(sl), { k: 'get', sp: SPS[rnd(6)], n: amt });
      else if (op === 6) act(e(dp), rnd(2) ? { k: 'dep' } : { k: 'get', sp: SPS[rnd(6)], n: amt });
      else if (op === 7) { g.setCfg(e(rnd(2) ? sl : dp), { filter: SPS[rnd(6)] }); }
      else if (op === 8) { g.setCfg(e(sg), { text: 'T' + rnd(1000), size: 1 + rnd(3), tone: ['green', 'red', 'blue'][rnd(3)], icon: ['none', 'warn', 'box'][rnd(3)], lit: !!rnd(2) }); }
      else if (op === 9) { g.setCfg(e(cl), { mode: ['auto', 'on', 'off'][rnd(3)] }); g.setCfg(e(fl), { mode: rnd(2) ? 'on' : 'off', deg: rnd(360), tilt: rnd(171) - 85 }); }
      else if (op === 10) { const f = forged[rnd(forged.length)], tgt = [lk, pc, sl, dp, sg][rnd(5)]; const r = g.setCfg(e(tgt), f); if (!r.ok) refused++; }
      else if (op === 11) { run(0.25); }
      else if (op === 12 && rnd(6) === 0) { const q = S().carry.length; if (q < 50) S().carry.push({ sp: 5 + rnd(4), vr: 0 }); S().carry.pop(); }
      did++;
      if (n % 30 === 29) {
        if (JSON.stringify(itemsTotal()) !== items0) bad.push(`items changed at ${n}: ${JSON.stringify(itemsTotal())} vs ${items0}`);
        if (JSON.stringify(matsTotal()) !== mats0) bad.push(`materials changed at ${n}: ${JSON.stringify(matsTotal())} vs ${mats0}`);
        if (plushTotal() !== plush0) bad.push(`plush changed at ${n}: ${plushTotal()} vs ${plush0}`);
        if (bad.length) break;
      }
    }
    run(5);
    if (!bad.length) { if (JSON.stringify(itemsTotal()) !== items0) bad.push('items at the end'); if (JSON.stringify(matsTotal()) !== mats0) bad.push('materials at the end'); if (plushTotal() !== plush0) bad.push(`plush at the end ${plushTotal()} vs ${plush0}`); }
    if ((g.errCount || 0) !== errs0) bad.push('errors while soaking: ' + (g.errLog || []).slice(-1)[0]);
    if (count(e(lk)) > 24 || count(e(pc)) > F.CAP.pcrate) bad.push('a store went over its capacity');
    if (!refused) bad.push('no forged patch was ever refused'); void did;
    for (const x of S().entities) if ('act' in x) bad.push('an act key stayed on ' + x.type);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('furnish.docs-and-controls-mention-the-new-things-without-dashes', async () => {
    const bad = [], keys = CONTROLS.flatMap((gr) => gr.rows).find((r) => r.keys.join('+') === 'E');
    if (!keys || !/locker|silo|crate|sign/i.test(keys.what)) bad.push('the E row does not mention the furniture: ' + (keys && keys.what));
    for (const gr of CONTROLS) for (const r of gr.rows) if (/[\u2013\u2014]/.test(r.what)) bad.push('dash in a controls row: ' + r.what.slice(0, 50));
    const readme = await (await fetch('/README.md')).text().catch(() => '');
    if (readme && !/Furnish|Locker/.test(readme)) bad.push('README has no furnish line');
    for (const u of F.FURN_UPGRADES) if (/[\u2013\u2014]/.test(u.desc)) bad.push('dash in ' + u.id);
    return bad.length === 0 || bad.join(' || ');
  });
}
