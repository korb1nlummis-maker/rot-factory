// Shared helpers for the src/tests/addons_*.js audit. This file has no default export, so the self test loader skips it.
// makeKit(ctx) builds the item table and the helpers (equip, put, aim, snapshot) on top of the self test context.
import { fmt } from '../util.js';

export const FRAME_KEYS = ['timber', 'steel', 'concrete', 'rebar', 'titan', 'carbon', 'plasma', 'voidl', 'neutron', 'horizon'];

// every upgrade that unlocks something craftable
export const ALL_UP = {
  timber: 1, steel: 1, concrete: 1, rebar: 1, titan: 1, carbon: 1, plasma: 1, voidl: 1, neutron: 1, horizon: 1,
  power: 1, belts: 1, splitter: 1, detector: 1, sorter: 1, vault: 1, mech: 1, claw: 1, borer: 1, fans: 1, mfan: 1, depots: 1,
  bulkhead: 1, markers: 1, struts: 1, jacks: 1, dynamite: 1, charges: 3, lantern: 1, firstaid: 1, cart: 5, bag: 3, mechCount: 3, rigCount: 2, borerCount: 2,
};

// how each recipe is unlocked. `gate` upgrade ids: remove any one and the recipe must vanish (the value is the level to drop to).
export const GATE = {
  'marker': { markers: 0 }, 'glow': { markers: 0 }, 'flare': { markers: 0 }, 'jack': { jacks: 0 }, 'strut': { struts: 0 }, 'medkit': { firstaid: 0 }, 'canister': { firstaid: 0 },
  'dynamite': { dynamite: 0 }, 'charge': { charges: 0 }, 'lantern': { lantern: 0 }, 'bulk': { bulkhead: 0 }, 'belt': { belts: 0 }, 'ramp': { belts: 0 }, 'splitter': { splitter: 0 }, 'gate': { detector: 0 },
  'gen': { power: 0 }, 'pole': { power: 0 }, 'fan': { fans: 0 }, 'mfan': { mfan: 0 }, 'sorter': { sorter: 0 }, 'vault': { vault: 0 }, 'mech': { mech: 0 }, 'beacon': { depots: 0 }, 'claw': { claw: 0 }, 'borer': { borer: 0 },
  'cart:1': { cart: 0 }, 'cart:2': { cart: 1 }, 'cart:3': { cart: 2 }, 'cart:4': { cart: 3 }, 'cart:5': { cart: 4 },
};
for (const k of FRAME_KEYS) { GATE['frame:' + k] = { [k]: 0 }; GATE['mat:' + k] = { [k]: 0 }; }

// where each kind of thing is set down in the open bay (metres), and what the hammer must hand back
export const FLOOR = {
  belt: { x: -6.6, z: 1.2, dir: 1, give: 'belt' }, ramp: { x: -6.6, z: 2.4, dir: 3, give: 'ramp', ramp: 0 }, splitter: { x: -6.6, z: 3.6, dir: 0, give: 'splitter' },
  gate: { x: -8.4, z: 7.2, dir: 2, give: 'gate' }, gen: { x: -9, z: -1.2, dir: 0, give: 'gen' }, pole: { x: -9, z: -2.4, dir: 0, give: 'pole' }, fan: { x: -9, z: -3.6, dir: 2, give: 'fan' },
  sorter: { x: -8, z: -6, dir: 0, give: 'sorter' }, vault: { x: -9, z: 0, dir: 0, give: 'vault' }, mech: { x: -9, z: 1.2, dir: 0, give: 'mech' },
};
export const OPEN = {
  lantern: { x: -6.6, z: -1.2, give: 'lantern' }, marker: { x: -6.6, z: -2.4, give: 'marker' }, flare: { x: -6.6, z: -3.6, give: 'flare' }, glow: { x: -6.6, z: -4.8, give: 'glow' },
  strut: { x: -4.2, z: 1.2, give: 'strut' }, jack: { x: -4.2, z: 2.4, give: 'jack' }, beacon: { x: -2.4, z: 9, give: 'beacon' },
  dynamite: { x: -4.2, z: 5, give: 'dynamite' }, charge: { x: -3, z: 5, give: 'charge' },
};
// every recipe that is set down in the world (not carried or used)
export const PLACEABLE = [...Object.keys(FLOOR), ...Object.keys(OPEN), 'bulk', ...FRAME_KEYS.map((k) => 'frame:' + k), 'mfan', 'claw', 'borer'];

export const RECIPE_IDS = [...Object.keys(GATE)];
// what the hammer must give back for a placed thing (recipe id -> item id), identical for all but a few
export const GIVE_BACK = (id) => id;

export function makeKit(ctx) {
  const { g, S, w, p, L, V3, THREE, fresh, craft, selectTool, plan, tiles, cellX, cellZ, toI, toK, spot, dig, adv, realSleep, newWorld } = ctx;
  const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];

  const hooks = { before: null, after: null };
  const doPlace = () => { const tool = g.curTool(); if (hooks.before) hooks.before(tool); g.placeCurrent(tool); if (hooks.after) hooks.after(tool); };
  const equip = (id) => { S().hotbar = ['hammer', null, null, null, null, null, null, null, null]; g.rebuildTools(); selectTool(id); };
  const stow = () => { g.stowed = true; g.rebuildTools(); };
  const items = () => S().entities.map((e) => e.id);
  const sceneCount = () => { let n = 0; g.renderer.scene.traverse(() => { n++; }); return n; };
  const aimDir = (x, y, z, dir = 0, back = 2.0) => {
    p().pos.set(x - DX[dir] * back, 0, z - DZ[dir] * back); p().vel.set(0, 0, 0);
    const e = p().eyePos(new V3()); const dx = x - e.x, dy = y - e.y, dz = z - e.z;
    p().yaw = Math.atan2(dx, dz); p().pitch = Math.atan2(dy, Math.hypot(dx, dz));
  };
  const lookUp = () => { p().pos.set(-6, 0, 3); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 1.4; };
  const hintText = () => document.getElementById('hint').textContent;

  // some seeds heap plush against the west wall of the bay: clear the part of the bay the tests build in, once per world
  const clearBay = () => {
    const world = w(); if (world.__bayClear) return; world.__bayClear = true;
    for (let i = toI(-13.5); i <= toI(1.5); i++) for (let k = toK(-10); k <= toK(11); k++) for (let j = 0; j < 9; j++) if (world.get(i, j, k)) world.removeCell(i, j, k, false);
  };
  // craft (if needed), take out, aim at a floor spot of the open bay, plan, place. Returns what happened.
  const put = async (id, o = {}) => {
    clearBay(); const { dir = 0, y = 0, back = 2.0, ramp = 0 } = o;
    const x = cellX(toI(o.x)), z = cellZ(toK(o.z)); // the cell centre: an edge coordinate could land in either neighbour
    if (!(S().items[id] > 0)) { S().money = Math.max(S().money, 1e12); g.craftItem(id, 1); }
    equip(id); if (ramp !== undefined) g.rampMode = ramp;
    let pl; for (let attempt = 0; attempt < 3; attempt++) { aimDir(x, y, z, dir, back); pl = await plan(); if (pl && (pl.ok || !/^Too close$/.test(pl.why || ''))) break; } // a refused 'Too close' with the player two metres away is a stale eye height, not a real refusal
    const hint = hintText();
    if (!pl || !pl.ok) return { ok: false, why: (pl && pl.why) + ` [wanted ${id} at cell ${toI(x)},${toK(z)}; plan cell ${pl && pl.ent && pl.ent.i},${pl && pl.ent && pl.ent.k}; player ${p().pos.x.toFixed(2)},${p().pos.y.toFixed(2)},${p().pos.z.toFixed(2)}]`, pl, hint };
    const before = new Set(items()), n0 = S().items[id] || 0;
    doPlace();
    const ent = S().entities.find((e) => !before.has(e.id));
    return { ok: true, pl, ent, consumed: n0 - (S().items[id] || 0), hint };
  };
  const tileOf = (ent) => (ent ? L().byId.get(ent.id) : null);
  const itemOf = (ent) => (ent ? g.machines.items.get(ent.id) : null);

  // power rig in the open bay: a fed generator and a pole next to it
  const feedGen = (gen, n = 12) => { S().carry = []; for (let q = 0; q < n; q++) S().carry.push({ sp: 2, vr: 0 }); g.useTile(gen); S().carry = []; };
  const powerAll = () => { for (const t of tiles()) if (['belt', 'sorter', 'vault', 'mech', 'fan', 'pole', 'gen'].includes(t.type)) t.pw = 1; for (const it of g.machines.items.values()) it.ent.pw = 1; };
  const runLogi = (n, dt = 0.05) => { for (let q = 0; q < n; q++) { powerAll(); g.time += dt; L().update(dt); g.machines.update(dt, g.time); } };

  // a stable description of one placed thing, to compare before a save and after a load
  const meshOf = (e) => {
    const t = L().byId.get(e.id); const obj = (t && L().objs.get(e.id)) || (g.machines.items.get(e.id) && g.machines.items.get(e.id).obj) || null;
    if (!obj) return t && t.type === 'belt' && !t.detector && !t.splitter ? 'instanced' : null;
    const q = (v) => Math.round(v * 1000) / 1000;
    return [q(obj.position.x), q(obj.position.y), q(obj.position.z), q(obj.rotation.y), obj.children.length];
  };
  const FIELDS = ['type', 'i', 'j', 'k', 'dir', 'rise', 'detector', 'splitter', 'free', 'fixed', 'mode', 'filter', 'kind', 'axis', 'cx', 'cz', 'y0', 'w', 'h', 'yaw', 'turned', 'jack', 'glow', 'dyn', 'mounted', 'frameId', 'px', 'py', 'pz', 'fx', 'fz', 'fyaw', 'x', 'y', 'z', 'tier', 'dx', 'dz', 'ry', 'gm', 'glo', 'gj', 'off'];
  const describe = (e) => {
    const d = {}; for (const f of FIELDS) if (e[f] !== undefined) d[f] = typeof e[f] === 'number' ? Math.round(e[f] * 1e4) / 1e4 : e[f];
    if (e.type === 'vault') d.stored = (e.stored || []).map((s) => s.sp + ':' + s.vr).join();
    if (e.type === 'gen') d.fuel = (e.q || []).map((s) => s.sp).join() + '/' + Math.round(e.burn || 0);
    if (e.type === 'belt') d.items = (e.items || []).map((s) => s.sp).join();
    d.mesh = meshOf(e); return d;
  };
  const snapshot = () => {
    const ents = {}; for (const e of S().entities) ents[e.id] = describe(e);
    const sup = w().supports.filter((s) => !String(s.id).startsWith('shield')).map((s) => [s.id, Math.round(s.x * 100) / 100, Math.round(s.y * 100) / 100, Math.round(s.z * 100) / 100, s.r, s.kind].join('|')).sort();
    const shields = w().supports.filter((s) => String(s.id).startsWith('shield')).length;
    const reserved = [...w().reserved].sort((a, b) => a - b).join(',');
    const lights = g.machines.lights(new V3(0, 1, 0), 99).map((e) => e.type + (e.glow ? 'g' : '') + e.x.toFixed(2) + e.z.toFixed(2)).sort();
    return { ents, sup, shields, reserved, lights, hotbar: JSON.stringify(S().hotbar), items: JSON.stringify(S().items), mats: JSON.stringify(S().mats), money: S().money };
  };
  const diffSnap = (a, b) => {
    const bad = [];
    for (const id of new Set([...Object.keys(a.ents), ...Object.keys(b.ents)])) { const x = JSON.stringify(a.ents[id]), y = JSON.stringify(b.ents[id]); if (x !== y) bad.push(`entity ${id}: ${x} -> ${y}`); }
    if (JSON.stringify(a.sup) !== JSON.stringify(b.sup)) bad.push(`supports ${a.sup.length} -> ${b.sup.length}`);
    if (a.shields !== b.shields) bad.push(`borer shields ${a.shields} -> ${b.shields}`);
    if (a.reserved !== b.reserved) bad.push('reserved cells differ');
    if (JSON.stringify(a.lights) !== JSON.stringify(b.lights)) bad.push('lights differ');
    for (const k of ['hotbar', 'items', 'mats']) if (a[k] !== b[k]) bad.push(`${k} ${a[k]} -> ${b[k]}`);
    if (a.money !== b.money) bad.push(`money ${a.money} -> ${b.money}`);
    return bad;
  };

  // find a lane of the pile with a long dug tunnel (frames, struts, fans) and try the next lanes when the terrain is too low
  const lane = (long = 40, wide = 8, high = 4) => {
    for (const ln of [12, 20, 28, 6, -6, 34, -14]) {
      let sp; try { sp = spot(ln); } catch (e) { continue; }
      if (w().topAt(sp.i + 14, sp.k) < 5) continue;
      dig(sp.i, sp.k - 2, long, wide, high, false);
      return sp;
    }
    return null;
  };
  const supportOf = (id) => w().supports.find((s) => s.id === id);

  // ---- an environment with a dug tunnel (frames, fans) and a separate slope face (claw, borer), in a fresh world
  const makeEnv = async (up = {}) => {
    const equip2 = (id) => { S().items[id] = (S().items[id] || 0) + 1; equip(id); };
    // a slope face that really takes both a claw rig and a borer (not every slope has one): check with throw-away plans before settling on it
    const clawAim = async (sp, tx) => {
      equip2('claw'); let so = tx - 1; while (so > sp.i - 8 && w().topAt(so, sp.k) > 0) so--;
      p().pos.set(cellX(so), 0, cellZ(sp.k)); p().vel.set(0, 0, 0); { const e = p().eyePos(new V3()); p().yaw = Math.atan2(cellX(tx) - e.x, 0); p().pitch = Math.atan2(1.2 - e.y, cellX(tx) - e.x); }
      const pl = await plan(); return !!(pl && pl.ok);
    };
    const borerAim = async (sp) => {
      equip2('borer');
      for (const di of [1, 0, 2, 3, 4]) for (const back of [1.5, 2.0, 2.5]) for (const pitch of [0, -0.1, -0.2]) { ctx.lookEast(cellX(sp.i + di) - back, cellZ(sp.k), pitch); const pl = await plan(); if (pl && pl.ok) return { di, back, pitch }; }
      return null;
    };
    for (let attempt = 0; attempt < 6; attempt++) {
      await newWorld(); fresh({ ...ALL_UP, ...up }); S().money = 1e13;
      const tun = lane(80, 8, 4); if (!tun) continue;
      let face = null;
      for (const ln of [12, 20, 28, 6, -6, 34, -14, 40]) {
        let sp; try { sp = spot(ln); } catch (e) { continue; } if (Math.abs(sp.k - tun.k) < 12) continue;
        let tx = 0; for (let d = 1; d < 60; d++) if (w().topAt(sp.i + d, sp.k) >= 6) { tx = sp.i + d; break; } if (!tx) continue;
        const okClaw = await clawAim(sp, tx); const aim = await borerAim(sp); delete S().items.claw; delete S().items.borer; S().hotbar = ['hammer', null, null, null, null, null, null, null, null]; g.rebuildTools();
        if (okClaw && aim) { face = { sp, tx, aim }; break; }
      }
      if (face) return { tun, face, slot: 0, extra: [] };
    }
    throw new Error('no world with both a tunnel lane and a slope face in six tries');
  };
  // place any placeable recipe through the real aim, plan and place path. Returns { ok, why, ents, give } (give: entity id -> item the hammer must return)
  const placeAny = async (id, env, o = {}) => {
    const bad = (why) => ({ ok: false, why: String(why) });
    const asGuest = () => g.isGuest();
    if (FLOOR[id]) { const sp = FLOOR[id]; const r = await put(id, { x: sp.x, z: sp.z, dir: sp.dir, ramp: sp.ramp || 0, ...o }); if (r.ok && !r.ent) return asGuest() ? { ok: true, ents: [], pending: true, kind: 'tile', r } : bad('nothing was created'); return r.ok ? { ok: true, ents: [r.ent], give: { [r.ent.id]: sp.give }, kind: 'tile', r } : bad(r.why); }
    if (OPEN[id]) { const sp = OPEN[id]; if (id === 'charge' || id === 'dynamite') { S().money = Math.max(S().money, 1e12); } const r = await put(id, { x: sp.x, z: sp.z, dir: 0, ...o }); if (r.ok && !r.ent) return asGuest() ? { ok: true, ents: [], pending: true, kind: 'mach', r } : bad('nothing was created'); return r.ok ? { ok: true, ents: [r.ent], give: { [r.ent.id]: sp.give }, kind: 'mach', r } : bad(r.why); }
    if (id === 'bulk') { const r = await put('bulk', { x: -4.2, z: -2.4, dir: 0, ...o }); return r.ok ? { ok: true, ents: [], cell: r.pl.ent, kind: 'cell', r } : bad(r.why); }
    const { i, k } = env.tun; const slotX = () => cellX(i + 8 + 5 * env.slot++);
    if (id.startsWith('frame:')) {
      if (!(S().items[id] > 0)) g.craftItem(id, 1); equip(id); g.frameYaw = o.free ? (o.yaw ?? 0.6) : null; ctx.aimPoint(slotX(), 0, cellZ(k + 1), 2.4); const pl = await plan(); if (!pl.ok) { g.frameYaw = null; return bad(pl.why); }
      const before = new Set(items()); doPlace(); g.frameYaw = null; const ent = S().entities.find((e) => !before.has(e.id)); if (!ent && asGuest()) return { ok: true, ents: [], pending: true, kind: 'mach', r: { pl } }; return ent ? { ok: true, ents: [ent], give: { [ent.id]: id }, kind: 'mach', r: { pl } } : bad('frame not placed');
    }
    if (id === 'mfan') {
      let f = o.frame; if (!f) { const fr = await placeAny('frame:steel', env, o); if (!fr.ok) return fr; f = fr.ents[0]; env.extra.push(f); }
      if (!(S().items.mfan > 0)) g.craftItem('mfan', 1); equip('mfan'); p().pos.set(f.cx - 4 * Math.cos(f.yaw ?? 0) - 0, 0, f.cz); p().pos.set(f.cx - 4, 0, f.cz); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; const e0 = p().eyePos(new V3()); p().pitch = Math.atan2(f.y0 + f.h - 0.3 - e0.y, f.cx - e0.x);
      const pl = await plan(); if (!pl.ok) return bad(pl.why); const before = new Set(items()); doPlace(); const ent = S().entities.find((e) => !before.has(e.id)); if (!ent && asGuest()) return { ok: true, ents: [], pending: true, kind: 'tile', frame: f, r: { pl } }; return ent ? { ok: true, ents: [ent], give: { [ent.id]: 'mfan' }, kind: 'tile', frame: f, r: { pl } } : bad('fan not placed');
    }
    if (id === 'claw') {
      const { sp, tx } = env.face; if (!(S().items.claw > 0)) g.craftItem('claw', 1); equip('claw'); let so = tx - 1; while (so > sp.i - 8 && w().topAt(so, sp.k) > 0) so--;
      p().pos.set(cellX(so), 0, cellZ(sp.k)); p().vel.set(0, 0, 0); { const e = p().eyePos(new V3()); p().yaw = Math.atan2(cellX(tx) - e.x, 0); p().pitch = Math.atan2(1.2 - e.y, cellX(tx) - e.x); }
      const pl = await plan(); if (!pl.ok) return bad(pl.why); const before = new Set(items()); doPlace(); const ent = S().entities.find((e) => !before.has(e.id)); if (!ent && asGuest()) return { ok: true, ents: [], pending: true, kind: 'mach', r: { pl } }; return ent ? { ok: true, ents: [ent], give: { [ent.id]: 'claw' }, kind: 'mach', r: { pl } } : bad('claw not placed');
    }
    if (id === 'borer') {
      const { sp } = env.face; if (!(S().items.borer > 0)) g.craftItem('borer', 1); equip('borer');
      { const { di, back, pitch } = env.face.aim; ctx.lookEast(cellX(sp.i + di) - back, cellZ(sp.k), pitch); const pl = await plan(); if (pl && pl.ok) { const before = new Set(items()); doPlace(); const ent = S().entities.find((e) => !before.has(e.id)); if (!ent && asGuest()) return { ok: true, ents: [], pending: true, kind: 'mach', r: { pl } }; return ent ? { ok: true, ents: [ent], give: { [ent.id]: 'borer' }, kind: 'mach', r: { pl } } : bad('borer not placed'); } }
      return bad('no spot for the borer');
    }
    return bad('unknown placeable ' + id);
  };
  // remove one placed thing the way the hammer does
  const removeEnt = (e, kind) => { if (kind === 'cell') return; g.doDecon({ kind: L().byId.has(e.id) ? 'tile' : 'mach', id: e.id }); };

  return { clearBay, hooks, doPlace, makeEnv, placeAny, removeEnt, DX, DZ, equip, stow, items, sceneCount, aimDir, lookUp, hintText, put, tileOf, itemOf, feedGen, powerAll, runLogi, describe, snapshot, diffSnap, lane, supportOf, fmt };
}
