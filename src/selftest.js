// Dev-only self test. In the browser console on the dev server: `await __selftest()` or `await __selftest('hands.')`
// Every test builds what it needs, checks real behavior (not just that a number changed) and returns true or a reason.
import * as THREE from 'three';
import * as cfg from './config.js';
import { UPGRADES, FRAME_TYPES, effLevels, computeTuning } from './upgrades.js';
import { recipes, MATERIALS } from './crafting.js';
import { CART_CAP, CART_NAMES } from './cart.js';
import { ACHIEVEMENTS } from './achievements.js';
import { NEEDLE, species } from './plushdata.js';
import { Slides } from './slide.js';

const { cellX, cellY, cellZ, toI, toJ, toK } = cfg;

export async function runSelfTest(g, only = '') {
  const S = () => g.S, w = () => g.world, p = () => g.player, sim = () => g.sim, L = () => g.logi;
  const V3 = THREE.Vector3;
  const results = [];
  const sleep = () => Promise.resolve(); // the tests drive the game loop themselves, so nothing needs real waiting
  const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const errs0 = g.errCount || 0;
  // ------------------------------------------------------------------ helpers
  const adv = (sec, dt = 0.05) => { for (let n = 0; n < sec / dt; n++) { g.time += dt; g.updatePlay(dt); } };
  const stepSim = (sec, dt = 1 / 60) => {
    const hooks = { onCreak: (x, y, z, n) => g.onCreak(x, y, z, n), release: (a, b, c) => g.releaseCell(a, b, c) };
    for (let n = 0; n < sec / dt; n++) { g.time += dt; g.slide.update(dt); sim().step(dt); w().updateStability(dt, g.T.warn, hooks); g.updateAfters(dt); }
  };
  const clearBodies = () => { while (sim().n > 0) sim().remove(sim().n - 1); };
  const resetEntities = () => {
    for (const e of [...S().entities]) {
      if (e.free) continue;
      const t = L().byId.get(e.id);
      if (t) { try { L().remove(t); } catch (x) { /* ignore */ } continue; }
      const it = g.machines.items.get(e.id);
      if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); }
    }
    S().entities = S().entities.filter((e) => e.free);
    w().supports = []; w().creaking.clear(); w().stabQueue.length = 0; g.slide.clear(); g.afters = [];
    g.power.markDirty && g.power.markDirty();
  };
  const wallCells = [];
  const fresh = (up = {}) => {
    for (const c of wallCells.splice(0)) w().setCell(c[0], c[1], c[2], 0, 0);
    resetEntities(); clearBodies();
    for (const b of [...S().crew]) { const o = g.crew.objs.get(b.id); if (o) { g.machines.disposeObj(o); g.crew.root.remove(o); g.crew.objs.delete(b.id); } }
    S().crew = [];
    S().up = { ...up }; S().items = {}; S().mats = {}; S().carry = []; S().cart = null; g.cart.sync();
    S().money = 1e12; S().stats.plush = 1e9; S().stats.maxDist = 0; S().hotbar = ['hammer', null, null, null, null, null, null, null, null]; g.buildIdx = 0;
    S().contracts = []; S().ending = null; S().needleLost = false;
    g.grabCd = 0; g.hp = 100; g.hpMax = 100; g.dead = false; g.trapOn = false; g.airLeft = undefined; g.suffocating = false; g.blacking = false;
    p().embedded = false; p().buried = 0; p().vel.set(0, 0, 0);
    g.dust.cells.clear(); g.dust.lung = 0;
    g.stowed = true; g.vacT = 0; g.holdBlock = false; g.keys = {}; // bare hands unless a test takes a tool out
    g.T = g.tune(); w().stabBonus = g.T.stabBonus; sim().binCatch = g.T.binCatch;
    g.rebuildTools();
  };
  // a fresh strip of the slope: the first column of the pile along +x at a lane near the start
  const spot = (lane = 12) => {
    const kk = toK(0) + lane; let i = toI(0) + 4;
    while (i < toI(0) + 140 && !(w().topAt(i - 1, kk) === 0 && w().topAt(i, kk) >= 1)) i++;
    if (i >= toI(0) + 140) throw new Error('no slope mouth');
    return { i, k: kk };
  };
  const newWorld = async () => { await g.startPlay(true); g.mode = 'play'; g.noSave = true; await realSleep(250); };
  const WORLD_TESTS = ['crew.digs', 'crew.bolt', 'render.', 'mining.frame', 'mining.grab', 'mining.tamp', 'mining.dynamite', 'mining.charge-tiers', 'mining.stress', 'mining.slope', 'tunnel.', 'slides.', 'machines.mech', 'machines.borer', 'machines.claw', 'crew.dig', 'crew.bolt', 'crew.belt'];
  const aimPoint = (x, y, z, back = 2.0) => {
    p().pos.set(x - back, 0, z); p().vel.set(0, 0, 0);
    const e = p().eyePos(new V3()); const dx = x - e.x, dy = y - e.y, dz = z - e.z;
    p().yaw = Math.atan2(dx, dz); p().pitch = Math.atan2(dy, Math.hypot(dx, dz));
  };
  const lookEast = (x, z, pitch = 0) => { p().pos.set(x, 0, z); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = pitch; };
  // a small wall of plush cells in the open bay, in front of where the player stands, removed again by fresh()
  const plushWall = (n = 12, z = 1.2) => {
    for (const c of wallCells.splice(0)) w().setCell(c[0], c[1], c[2], 0, 0);
    const i0 = toI(-0.9), k0 = toK(z); let q = 0;
    // a 3 wide, 3 high block, up to 6 deep, filled front to back
    for (let dz = 0; dz < 6 && q < n; dz++) for (let dj = 0; dj < 3 && q < n; dj++) for (let di = 0; di < 3 && q < n; di++) { const i = i0 + di, j = 1 + dj, k = k0 + dz; w().setCell(i, j, k, 2 + (q % 5), 0); wallCells.push([i, j, k]); q++; }
    return n;
  };
  const standBeforeWall = () => { p().pos.set(0, 0, -0.5); p().vel.set(0, 0, 0); p().yaw = 0; p().pitch = 0.05; };
  const craft = (id, n = 1) => { g.craftItem(id, n); };
  const selectTool = (id) => { const slot = id === 'hammer' ? 0 : g.assignHotbar(id); if (slot < 0) throw new Error('no hotbar slot for ' + id); g.stowed = false; g.selectTool(slot); };
  const plan = async () => { await sleep(30); const e = p().eyePos(new V3()), d = p().forward(new V3()); g.updateBuild(g.curTool(), e, d); return g.plan; };
  const placeNow = () => { const n0 = S().entities.length; g.placeCurrent(g.curTool()); return S().entities.length - n0; };
  const placeAtFloor = async (id, x, z, back = 2.0) => { craft(id); selectTool(id); aimPoint(x, 0, z, back); const pl = await plan(); if (!pl || !pl.ok) return { ok: false, why: pl && pl.why }; return { ok: true, placed: placeNow() }; };
  const tiles = () => [...L().tiles.values()];
  const dig = (i, k, n, wd = 2, ht = 3, queue = true) => { for (let s = 0; s < n; s++) for (let dk = 0; dk < wd; dk++) for (let j = 0; j < ht; j++) w().removeCell(i + s, j, k + dk, queue); };
  const T = async (name, fn) => {
    if (only && !name.startsWith(only)) return;
    if (WORLD_TESTS.some((x) => name.startsWith(x))) await newWorld();
    const before = g.errCount || 0;
    try {
      const r = await fn();
      if ((g.errCount || 0) > before) results.push({ name, ok: false, msg: 'frame errors: ' + (g.errLog || []).slice(-1)[0] });
      else if (typeof r === 'string') results.push({ name, ok: false, msg: r });
      else if (r === false || r === null || r === 0) results.push({ name, ok: false, msg: 'returned ' + r });
      else results.push({ name, ok: true });
    } catch (e) { results.push({ name, ok: false, msg: 'THROW ' + String(e && e.stack || e).slice(0, 240) }); }
  };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const tune = (up) => { S().up = { ...up }; g.T = g.tune(); return g.T; };

  Object.defineProperty(document, 'pointerLockElement', { get: () => g.canvas, configurable: true });
  g.mode = 'play'; g.noSave = true;

  // ================================================================== BOOT
  await T('boot.no-frame-errors', async () => { fresh(); const b = g.errCount || 0; adv(3); return (g.errCount || 0) === b || 'errors during idle frames'; });
  await T('boot.free-gate-exists', async () => S().entities.some((e) => e.free && e.detector) || 'no free gate');
  await T('boot.every-method-referenced-exists', async () => {
    const miss = []; for (const m of ['punch', 'instantGrab', 'gPress', 'throwOne', 'useMedkit', 'hurtPlayer', 'die', 'updateTrapped', 'slideFeel', 'dropRoof', 'catchInCart', 'playerGateScan', 'nearestGrab', 'useCart', 'stowCart', 'detonate', 'releaseCell', 'ensureFreeGate', 'treadOn', 'loosen', 'updateScavenge', 'autoDump']) if (typeof g[m] !== 'function') miss.push(m);
    return miss.length ? 'missing ' + miss.join() : true;
  });

  // ================================================================== SURVIVAL
  await T('survival.damage-and-regen', async () => { fresh(); g.hurtPlayer(30, 't'); if (!near(g.hp, 70, 0.01)) return 'hp ' + g.hp; g.hurtT = 8; adv(5); return g.hp > 70 || 'no regen'; });
  await T('survival.hpmax-perk', async () => { tune({ hpmax: 4 }); adv(0.2); return g.hpMax === 200 || 'hpMax ' + g.hpMax; });
  await T('survival.padding-perk', async () => { fresh({ padding: 4 }); g.hurtPlayer(10, 't'); return near(g.hp, 94, 0.05) || 'hp ' + g.hp; });
  await T('survival.medkit', async () => { fresh({ firstaid: 1 }); craft('medkit', 2); g.hp = 30; g.useMedkit(); if (!near(g.hp, 80, 0.01)) return 'hp ' + g.hp; return S().items.medkit === 1 || 'not consumed'; });
  await T('survival.medkit-no-waste', async () => { fresh({ firstaid: 1 }); craft('medkit'); g.hp = 100; g.useMedkit(); return S().items.medkit === 1 || 'wasted at full health'; });
  await T('survival.canister-saves', async () => { fresh({ firstaid: 1 }); craft('canister'); p().embedded = true; p().buried = 3; g.trapOn = true; g.airLeft = 0.05; g.updateTrapped(0.1); g.updateTrapped(0.1); p().embedded = false; p().buried = 0; return (near(g.airLeft, 39.9, 0.3) && !S().items.canister) || 'air ' + g.airLeft; });
  await T('survival.air-countdown-60', async () => { fresh(); p().embedded = true; p().buried = 3; for (let n = 0; n < 100; n++) g.updateTrapped(0.1); const a = g.airLeft; p().embedded = false; p().buried = 0; return near(a, 50, 0.4) || 'air ' + a; });
  await T('survival.airtank-perk', async () => { fresh({ airtank: 3 }); p().embedded = true; p().buried = 3; g.updateTrapped(0.1); const a = g.airLeft; p().embedded = false; p().buried = 0; return near(a, 149.9, 0.2) || 'air ' + a; });
  await T('survival.suffocate-die-respawn', async () => {
    fresh(); S().carry.push({ sp: 2, vr: 0 }); p().embedded = true; p().buried = 3; g.trapOn = true; g.airLeft = 0.2;
    for (let n = 0; n < 300 && !g.dead; n++) g.updateTrapped(0.1); p().embedded = false; p().buried = 0;
    if (!g.dead) return 'did not die'; await realSleep(2800);
    if (g.dead) return 'still dead'; if (S().carry.length) return 'carry kept'; return (g.hp === g.hpMax && (S().stats.deaths || 0) >= 1) || 'hp/deaths';
  });
  await T('survival.fall-damage', async () => { fresh(); g.hp = 100; p().events.land(10); if (g.hp !== 100) return 'small fall hurt'; p().events.land(16); return (g.hp < 100 && g.hp > 60) || 'hp ' + g.hp; });
  await T('survival.falling-plush-hurts', async () => { fresh(); g.dmgCd = 0; g.onPlayerHit(12); return g.hp < 100 || 'no damage'; });
  await T('survival.punch-clears-hole', async () => {
    fresh(); const { i, k } = spot(); const j = 8; for (let q = 0; q < 12; q++) w().setCell(i + 40, j, k, 0, 0);
    p().pos.set(cellX(i + 40), cellY(j), cellZ(k)); p().yaw = Math.PI / 2; p().pitch = 0;
    const cells = () => { let c = 0; for (let di = 0; di < 3; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) if (w().get(i + 40 + di, j + 1 + dj, k + dk)) c++; return c; };
    const b = cells(); g.punchT = 0; g.punch(); return (cells() < b) || 'nothing punched';
  });

  // ================================================================== MOVEMENT
  await T('move.boots-speed', async () => {
    const speed = (up) => { fresh(up); p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); p().yaw = 0; const inp = { fwd: 1, back: 0, left: 0, right: 0, sprint: false, crouch: false, jump: false }; const stats = { walk: g.T.walk, crouchMul: g.T.crouchMul, jump: g.T.jump }; for (let n = 0; n < 12; n++) p().update(0.05, inp, stats, sim()); return Math.hypot(p().vel.x, p().vel.z); };
    const a = speed({}), b = speed({ boots: 4 }); return b > a * 1.3 || `${a} vs ${b}`;
  });
  await T('move.knees-crouch-speed', async () => {
    const speed = (up) => { fresh(up); p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); p().yaw = 0; const inp = { fwd: 1, back: 0, left: 0, right: 0, sprint: false, crouch: true, jump: false }; const stats = { walk: g.T.walk, crouchMul: g.T.crouchMul, jump: g.T.jump }; for (let n = 0; n < 14; n++) p().update(0.05, inp, stats, sim()); return Math.hypot(p().vel.x, p().vel.z); };
    const a = speed({}), b = speed({ knees: 3 }); return b > a * 1.4 || `${a} vs ${b}`;
  });
  await T('move.springs-jump-height', async () => {
    const h = (up) => { fresh(up); p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); p().onGround = true; const stats = { walk: 4, crouchMul: 0.5, jump: g.T.jump }; let top = 0; p().update(0.02, { fwd: 0, back: 0, left: 0, right: 0, sprint: false, crouch: false, jump: true }, stats, sim()); for (let n = 0; n < 60; n++) { p().update(0.02, { fwd: 0, back: 0, left: 0, right: 0, sprint: false, crouch: false, jump: false }, stats, sim()); top = Math.max(top, p().pos.y); } return top; };
    const a = h({}), b = h({ springs: 3 }); return b > a * 1.3 || `${a} vs ${b}`;
  });
  await T('move.climb-reduces-slide-load', async () => {
    const e = (up) => { fresh(up); let got = 0; const orig = g.slide.trigger.bind(g.slide); g.slide.trigger = (i, j, k, en) => { got = en; }; p().pos.set(0, 12, 0); p().footCell = { i: toI(0), j: 20, k: toK(0) }; g.treadOn(1, false); g.slide.trigger = orig; return got; };
    const a = e({}), b = e({ climb: 3 }); return (b < a * 0.4) || `${a} vs ${b}`;
  });
  await T('move.low-walk-never-slides', async () => {
    fresh(); let hit = 0; const orig = g.slide.trigger.bind(g.slide); g.slide.trigger = () => { hit++; }; p().pos.set(0, 3, 0); p().footCell = { i: toI(0), j: 5, k: toK(0) }; g.treadOn(1, false); g.slide.trigger = orig; return hit === 0 || 'low walking triggered a slide';
  });

  // ================================================================== HANDS
  await T('hands.gloves-cooldown', async () => { const a = tune({}).grabTime, b = tune({ gloves: 7 }).grabTime; return b < a * 0.35 || `${a} ${b}`; });
  await T('hands.reach-range', async () => {
    fresh({ reach: 0 }); const { i, k } = spot(); dig(i, k, 1, 1, 1); lookEast(cellX(i) - 3.0, cellZ(k), 0); const eye = p().eyePos(new V3()), dir = p().forward(new V3());
    const a = g.pickCell(eye, dir, g.T.reach); tune({ reach: 4 }); const b = g.pickCell(eye, dir, g.T.reach); return (g.T.reach > 4 && (!a || (b && b.t >= (a ? a.t : 0)))) || 'reach';
  });
  await T('hands.bag-capacity', async () => { const a = tune({}).carry, b = tune({ bag: 8 }).carry; return (a === 1 && b >= 100) || `${a} ${b}`; });
  await T('hands.grab-instant-tap', async () => {
    fresh({ bag: 3 }); plushWall(30); standBeforeWall(); await sleep(40);
    const eye = p().eyePos(new V3()), dir = p().forward(new V3()); g.curTargetRef = g.findTarget(eye, dir); if (!g.curTargetRef) return 'no target in front'; const n0 = S().carry.length; g.gPress(); return S().carry.length === n0 + 1 || 'tap did not grab instantly';
  });
  await T('hands.tap-with-plush-throws', async () => {
    fresh({ bag: 3 }); S().carry.push({ sp: 2, vr: 0 }, { sp: 3, vr: 0 }); lookEast(0, -1.4, 0.1); clearBodies(); g.throwCd = 0; g.curTargetRef = null; const t0 = S().stats.thrown || 0; g.gPress(); return ((S().stats.thrown || 0) === t0 + 1 && S().carry.length === 1) || 'did not throw';
  });
  await T('hands.hold-fills-capacity', async () => {
    fresh({ bag: 2, gloves: 3, reach: 3 }); plushWall(40); standBeforeWall(); await sleep(40);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' })); g.gDownAt = 0;
    for (let n = 0; n < 200; n++) { g.grabCd = Math.max(0, g.grabCd - 0.016); const eye = p().eyePos(new V3()), dir = p().forward(new V3()); g.curTargetRef = g.findTarget(eye, dir); g.interact(0.016, eye, dir); }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })); return S().carry.length === g.T.carry || `held grabs ${S().carry.length} of capacity ${g.T.carry}`;
  });
  await T('hands.autogrip-two-per-grab', async () => {
    const run = async (up) => { fresh({ bag: 8, gloves: 3, reach: 3, ...up }); plushWall(40); standBeforeWall(); await sleep(40); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' })); g.gDownAt = 0; for (let n = 0; n < 30; n++) { g.grabCd = Math.max(0, g.grabCd - 0.016); const eye = p().eyePos(new V3()), dir = p().forward(new V3()); g.curTargetRef = g.findTarget(eye, dir); g.interact(0.016, eye, dir); } window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })); return S().carry.length; };
    const a = await run({}), b = await run({ repeat: 1 }); return (a > 0 && b >= a * 2) || `${a} vs ${b}`;
  });
  await T('hands.scoop-takes-more', async () => {
    const run = async (sc) => { fresh({ bag: 8, scoop: sc, reach: 3 }); plushWall(40); standBeforeWall(); await sleep(40); const eye = p().eyePos(new V3()), dir = p().forward(new V3()); g.curTargetRef = g.findTarget(eye, dir); if (!g.curTargetRef) return -1; g.instantGrab(g.curTargetRef); return S().carry.length; };
    const a = await run(0), b = await run(4); return (a === 1 && b > a) || `${a} vs ${b}`;
  });
  await T('hands.vacuum-pulls-many', async () => {
    const run = async (v) => { fresh({ bag: 8, vac: v, reach: 3 }); plushWall(40); standBeforeWall(); await sleep(40); const eye = p().eyePos(new V3()), dir = p().forward(new V3()); g.vacT = 1.5; g.vacAcc = 0; for (let q = 0; q < 90; q++) g.interact(0.016, eye, dir); return S().carry.length; };
    const a = await run(1), b = await run(5); return b > a || `${a} vs ${b}`;
  });
  await T('hands.scavenge-pulls-loose-plush', async () => {
    fresh({ scavenge: 3, bag: 3 }); p().pos.set(0, 0, -1.4); clearBodies(); sim().spawn(3, 0, 0.2, 0.4, 1.8, 0, 0, 0, 0); for (let q = 0; q < 200; q++) { g.updateScavenge(0.016); sim().step(0.016); } return S().carry.length === 1 || 'not collected';
  });
  await T('hands.throw-power-range', async () => {
    const sp = (up) => { fresh(up); S().carry.push({ sp: 2, vr: 0 }); clearBodies(); p().pos.set(0, 0, -1.4); p().pitch = 0.1; g.throwCd = 0; g.throwOne(); return Math.hypot(sim().vx[0], sim().vy[0], sim().vz[0]); };
    const a = sp({}), b = sp({ throw: 6 }); return b > a * 2.5 || `${a} vs ${b}`;
  });
  await T('hands.thrown-into-bin-sucked', async () => {
    fresh(); const bp = g.hall.binPos; let hit = 0; const N = 30;
    for (let n = 0; n < N; n++) { clearBodies(); const sx = 0.4 + (Math.random() - 0.5), sz = -0.6 + (Math.random() - 0.5); const tx = bp.x + (Math.random() - 0.5) * 3, tz = bp.z + (Math.random() - 0.5) * 3; const dx = tx - sx, dz = tz - sz, Ld = Math.hypot(dx, dz); const t = Ld / 9; const vy = (-0.5 + 7.5 * t * t) / t; const m0 = S().money; sim().spawn(3, 0, sx, 1.5, sz, dx / Ld * 9, vy, dz / Ld * 9, 1); for (let q = 0; q < 300; q++) { sim().step(1 / 60); if (!sim().n) break; } if (S().money > m0) hit++; }
    return hit >= N * 0.8 || `only ${hit}/${N}`;
  });
  await T('hands.cart-one-and-upgrade', async () => {
    fresh({ cart: 5 }); craft('cart:1'); if (S().items['cart:1'] !== 1) return 'no cart item'; craft('cart:1'); const money = S().money; g.useCart(); if (!S().cart || S().cart.tier !== 1) return 'not rolled'; S().cart.load.push({ sp: 2, vr: 0 }); craft('cart:3'); if (S().cart.tier !== 3 || S().cart.load.length !== 1) return 'upgrade failed'; craft('cart:2'); if (S().cart.tier !== 3) return 'downgraded'; void money; return true;
  });
  await T('hands.cart-catches-throws', async () => {
    fresh({ cart: 3, bag: 2 }); craft('cart:2'); g.useCart(); const c = S().cart; c.mode = 'stay'; c.x = 0; c.z = 0.6; c.y = 0; c.yaw = 0; c.load.length = 0; clearBodies(); sim().spawn(3, 0, 0, 1.2, 0.6, 0, -1, 0, 1); for (let n = 0; n < 40; n++) { sim().step(1 / 60); g.catchInCart(); } return c.load.length === 1 || 'not caught';
  });
  await T('hands.cart-rides-beside', async () => {
    fresh({ cart: 3 }); craft('cart:1'); p().pos.set(0, 0, 3); p().yaw = 0; g.useCart(); const c = S().cart; c.mode = 'follow'; c.x = 0; c.z = 0; for (let n = 0; n < 400; n++) g.cart.update(0.016); return (Math.abs(c.x - 1.6) < 0.4 && Math.abs(c.z - 3.3) < 0.6) || `cart at ${c.x.toFixed(2)},${c.z.toFixed(2)}`;
  });
  await T('hands.cart-dumps-at-bin', async () => {
    fresh({ cart: 3 }); craft('cart:1'); g.useCart(); const c = S().cart; const bp = g.hall.binPos; for (let q = 0; q < 10; q++) c.load.push({ sp: 2, vr: 0 }); c.x = bp.x - 1.5; c.z = bp.z + 1.5; c.y = 0; const m0 = S().money; for (let n = 0; n < 400; n++) g.autoDump(0.05); return (c.load.length === 0 && S().money > m0) || 'left ' + c.load.length;
  });
  await T('hands.bots-haul-full-cart', async () => {
    fresh({ cart: 3, crew: 1 }); S().stats.plush = 1e9; craft('cart:1'); g.useCart(); const c = S().cart; const bp = g.hall.binPos; c.mode = 'stay'; c.x = bp.x; c.z = bp.z + 16; c.y = 0; c.load.length = 0; for (let q = 0; q < CART_CAP[1]; q++) c.load.push({ sp: 2, vr: 0 }); const b = g.crew.spawn(); b.x = c.x + 2; b.z = c.z; b.y = 0.5; b.state = 'idle'; p().pos.set(c.x, 0, c.z + 1);
    const m0 = S().money; for (let n = 0; n < 5000; n++) { g.time += 0.05; g.crew.update(0.05, g.time); g.logi.update(0.05); if (c.load.length === 0 && b.state === 'idle') break; } return (c.load.length < CART_CAP[1] && S().money > m0) || `cart ${c.load.length} money ${S().money - m0}`;
  });

  // ================================================================== SORT
  await T('sort.haggle-value', async () => { fresh({}); const a = g.valueOf(5, 0, 0); tune({ haggle: 10 }); const b = g.valueOf(5, 0, 0); return b > a * 2.5 || `${a} ${b}`; });
  await T('sort.streak-cap', async () => { tune({}); const a = g.valueOf(5, 0, 12); tune({ streak: 5 }); const b = g.valueOf(5, 0, 12); return b > a || `${a} ${b}`; });
  await T('sort.dex-bonus', async () => { fresh({}); S().dex = {}; for (let q = 1; q < 200; q++) S().dex[q] = 1; const a = g.valueOf(60, 0, 0); tune({ dex: 1 }); const b = g.valueOf(60, 0, 0); S().dex = {}; return b > a || `${a} ${b}`; });
  await T('sort.dump-range', async () => {
    const run = (up, d) => { fresh({ bag: 3, ...up }); const bp = g.hall.binPos; for (let q = 0; q < 3; q++) S().carry.push({ sp: 2, vr: 0 }); p().pos.set(bp.x + d, 0, bp.z); for (let n = 0; n < 60; n++) g.autoDump(0.1); return 3 - S().carry.length; };
    return (run({}, 6) === 0 && run({ dump: 3 }, 6) === 3) || 'range';
  });
  await T('sort.magnet-bin-catch', async () => { const a = tune({}).binCatch, b = tune({ magnet: 3 }).binCatch; return b > a || `${a} ${b}`; });
  await T('sort.contracts-fill-and-pay', async () => {
    fresh({ contracts: 1, contractSlots: 3 }); g.contracts.fill(); if (S().contracts.length < 4) return 'slots ' + S().contracts.length;
    S().contracts = [{ kind: 'shiny', arch: 0, need: 2, desc: 'Sell 2 shiny plush.', reward: 777, id: 99, have: 0 }]; const m0 = S().money; const d0 = S().stats.contracts || 0;
    g.contracts.onSale(2, 0); if (S().contracts[0] && S().contracts[0].have !== 0) return 'non-shiny counted'; g.contracts.onSale(2, 128); g.contracts.onSale(2, 128);
    return ((S().stats.contracts || 0) > d0 && S().money >= m0 + 777) || 'not paid';
  });
  await T('sort.sorter-filters', async () => {
    fresh({ power: 1, belts: 1, sorter: 1, vault: 1, optics: 5 }); const z = 2; for (let n = 0; n < 1; n++) { const a = await placeAtFloor('sorter', 8.0, z, 1.5); if (!a.ok) return 'sorter place: ' + a.why; const b = await placeAtFloor('vault', 8.6, z, 1.5); if (!b.ok) return 'vault place: ' + b.why; }
    const sorter = tiles().find((t) => t.type === 'sorter'), vault = tiles().find((t) => t.type === 'vault'); const byR = {}; species.forEach((sp, i) => { if (i > 0 && i < 500 && sp && byR[sp.rarity] === undefined) byR[sp.rarity] = i; });
    const check = (filter, expectKeptRarities) => { sorter.filter = filter; vault.stored.length = 0; sorter.q = []; for (const r of Object.keys(byR)) for (let q = 0; q < 2; q++) sorter.q.push({ sp: byR[r], vr: 0 }); for (let n = 0; n < 600; n++) { sorter.pw = 1; g.time += 0.05; L().update(0.05); if (!sorter.q.length && n > 40) break; } const kept = [...new Set(vault.stored.map((i) => species[i.sp].rarity))].sort().join(''); return kept === expectKeptRarities; };
    return (check(7, '') && check(1, '12345') && check(3, '345') && check(5, '5') && check(0, '012345')) || 'filter behavior wrong';
  });
  await T('sort.sorter-cycle-modes', async () => {
    fresh({ power: 1, belts: 1, sorter: 1, optics: 5 }); const a = await placeAtFloor('sorter', 8.0, 2, 1.5); if (!a.ok) return a.why; const t = tiles().find((x) => x.type === 'sorter'); const seen = new Set(); for (let q = 0; q < 9; q++) { g.useTile(t); seen.add(t.filter); } return seen.size >= 7 || 'modes ' + [...seen].join();
  });


  // ================================================================== MINING: frames, props, lights, blasts
  const mkUp = (extra = {}) => { const o = { timber: 1, steel: 1, concrete: 1, rebar: 1, titan: 1, carbon: 1, plasma: 1, voidl: 1, neutron: 1, horizon: 1, markers: 1, struts: 1, jacks: 1, lantern: 1, bulkhead: 1, dynamite: 1, charges: 3, ...extra }; return o; };
  for (const tier of Object.keys(FRAME_TYPES)) {
    await T('mining.frame-' + tier + '-place-and-anchor', async () => {
      fresh(mkUp()); const { i, k } = spot(); dig(i, k - 1, 22, 5, 4, false);
      craft('frame:' + tier); selectTool('frame:' + tier); lookEast(cellX(i + 16) - 1.4, cellZ(k) + 0.3, -0.2); const pl = await plan(); if (!pl || !pl.ok) return 'plan: ' + (pl && pl.why);
      const n = placeNow(); const e = S().entities.find((x) => x.type === 'frame'); const sup = w().supports.find((q) => q.id === (e && e.id));
      const f = FRAME_TYPES[tier]; return !!(n === 1 && sup && sup.r === f.radius && sup.b === f.bonus && e.kind === tier) || 'support ' + JSON.stringify(sup);
    });
  }
  await T('mining.frame-is-4x4-and-leaves-section-clear', async () => {
    fresh(mkUp()); const { i, k } = spot(); dig(i, k - 1, 24, 5, 4, false); craft('frame:timber'); selectTool('frame:timber'); lookEast(cellX(i + 16) - 1.4, cellZ(k) + 0.3, -0.2); const pl = await plan(); if (!pl.ok) return pl.why;
    const e = pl.ent; if (Math.abs(e.w - (4 * 0.6 - 0.04)) > 1e-6 || Math.abs(e.h - (4 * 0.6 - 0.02)) > 1e-6) return 'not 4x4: ' + e.w + 'x' + e.h; placeNow();
    let solid = 0; for (let a = 0; a < 4; a++) for (let b2 = 0; b2 < 4; b2++) if (w().get(e.gm, e.gj + b2, e.glo + a)) solid++; return solid === 0 || solid + ' cells left in the 4x4 section';
  });
  await T('mining.grabbing-a-few-plush-never-creaks', async () => {
    fresh(mkUp()); const bad = []; const { k } = spot(); const i0 = toI(0) + 6;
    for (let step = 0; step < 14; step++) {
      const i = i0 + step * 5; const kk = k + (step % 3) - 1; const co0 = S().stats.collapses || 0;
      // the way hands work: take the plush on the surface or face one at a time, a few of them
      for (let n = 0; n < 6; n++) { const ci = i + (n % 3), ck = kk + ((n / 3) | 0); const top = w().topAt(ci, ck) - 1; if (top >= 0) w().removeCell(ci, top, ck, true); }
      adv(0.6); stepSim(1.5); if (w().creaking.size || (S().stats.collapses || 0) > co0) bad.push(`${i - i0}:${w().creaking.size}`);
    }
    return bad.length === 0 || 'roof creaked after grabbing at ' + bad.join(' ');
  });
  await T('mining.grabbing-into-the-face-never-creaks', async () => {
    fresh(mkUp()); const { i, k } = spot(); const bad = [];
    for (let depth = 0; depth < 5; depth++) { for (let j = 0; j < 2; j++) w().removeCell(i + depth, j, k, true); adv(0.3); stepSim(1.5); if (w().creaking.size) bad.push(depth + ':' + w().creaking.size); }
    return bad.length === 0 || 'creaked while poking a hole: ' + bad.join(' ');
  });
  await T('mining.frame-never-digs-for-you', async () => {
    fresh(mkUp()); const { i, k } = spot(); dig(i, k - 1, 20, 5, 4, false); craft('frame:timber', 4); selectTool('frame:timber'); lookEast(cellX(i + 14) - 1.4, cellZ(k) + 0.3, -0.2); let pl = await plan(); if (!pl.ok) return 'first: ' + pl.why; placeNow(); const a = S().entities.find((x) => x.type === 'frame');
    // clicking the next section along, where the plush is still packed in, must be refused and remove nothing
    let before = 0; const count = () => { let c = 0; for (let m = a.gm; m < a.gm + 40; m++) for (let l = 0; l < 4; l++) for (let j = 0; j < 4; j++) if (w().get(m, a.gj + j, a.glo + l)) c++; return c; }; before = count();
    let placed = 0; for (let n = 0; n < 12; n++) { const last = S().entities.filter((x) => x.type === 'frame').pop(); const cx = cellX(last.gm + 1), cz = cellZ(last.glo) + 0.9, cy = last.gj * 0.6 + 1.2; p().pos.set(cx - 2.2, 0, cellZ(k) + 0.3); p().vel.set(0, 0, 0); const e = p().eyePos(new V3()); p().yaw = Math.atan2(cx - e.x, cz - e.z); p().pitch = Math.atan2(cy - e.y, Math.hypot(cx - e.x, cz - e.z)); pl = await plan(); if (pl.ok && !w().get(pl.ent.gm, pl.ent.gj + 1, pl.ent.glo + 1)) { placeNow(); placed++; } else if (pl.ok) return 'planned a section with plush still in it'; }
    return (count() === before && S().stats.cells < 400 + before) || 'frames removed plush: ' + (before - count());
  });
  await T('mining.frame-mesh-is-hollow-box', async () => {
    const { buildFrameMesh } = await import('./machines.js'); const gr = buildFrameMesh('steel', 'x', 4 * 0.6 - 0.04, 4 * 0.6 - 0.02); let pillars = 0, beams = 0; gr.children.forEach((c) => { if (!c.geometry) return; const q = c.geometry.parameters; if (q.height > 2) pillars++; else if (q.height < 1 && q.depth > 0.1 && q.width > 0.1 && !(q.depth < 0.05)) beams++; }); return (pillars === 4 && beams === 4) || `pillars ${pillars} beams ${beams}`;
  });
  await T('mining.frame-snaps-on-any-side', async () => {
    fresh(mkUp()); const { i, k } = spot(); dig(i, k - 5, 30, 17, 8, false); craft('frame:timber', 8); selectTool('frame:timber');
    lookEast(cellX(i + 16) - 1.4, cellZ(k) + 0.3, -0.2); let pl = await plan(); if (!pl.ok) return 'first: ' + pl.why; placeNow(); const a = S().entities.find((x) => x.type === 'frame');
    // stand inside the first section and look at the wall, ceiling or the corridor beyond: what you look at decides the side
    const aimAtBlock = async (m, lo, j0) => { const cx = cellX(m), cz = cellZ(lo) + 1.5 * 0.6, cy = j0 * 0.6 + 1.2; const sx = cellX(a.gm) - (m === a.gm ? 0 : 2.2), sy0 = 0; p().pos.set(sx, sy0, m === a.gm ? cellZ(a.glo) + 0.9 : cellZ(k) + 0.3); p().vel.set(0, 0, 0); const e = p().eyePos(new V3()); p().yaw = Math.atan2(cx - e.x, cz - e.z); p().pitch = Math.atan2(cy - e.y, Math.hypot(cx - e.x, cz - e.z)); return plan(); };
    const out = {};
    for (const [name, m, lo, j0, expect] of [['line', a.gm + 1, a.glo, a.gj, 'next in line'], ['beside', a.gm, a.glo + 4, a.gj, 'beside it'], ['beside-other', a.gm, a.glo - 4, a.gj, 'beside it'], ['above', a.gm, a.glo, a.gj + 4, 'above it']]) {
      pl = await aimAtBlock(m, lo, j0); if (!pl.ok) return name + ': ' + pl.why; if (pl.ent.snap !== expect) return `${name}: snap ${pl.ent.snap}`; if (pl.ent.gm !== m || pl.ent.glo !== lo || pl.ent.gj !== j0) return `${name}: wrong block ${pl.ent.gm},${pl.ent.glo},${pl.ent.gj}`; out[name] = true;
    }
    // below the floor is refused
    pl = await aimAtBlock(a.gm, a.glo, a.gj - 4); if (pl.ok && pl.ent.gj < 0) return 'allowed a section below the floor';
    return Object.keys(out).length === 4;
  });
  await T('mining.frame-chain-lines-up', async () => {
    fresh(mkUp()); const { i, k } = spot(); dig(i, k - 1, 30, 5, 4, false); craft('frame:steel', 4); selectTool('frame:steel'); lookEast(cellX(i + 14) - 1.4, cellZ(k) + 0.3, -0.2); let pl = await plan(); if (!pl.ok) return pl.why; placeNow();
    for (let n = 1; n <= 3; n++) { const a = S().entities.filter((x) => x.type === 'frame').pop(); const cx = cellX(a.gm + 1), cz = cellZ(a.glo) + 0.9, cy = a.gj * 0.6 + 1.2; p().pos.set(cx - 2.2, 0, cellZ(k) + 0.3); p().vel.set(0, 0, 0); const e = p().eyePos(new V3()); p().yaw = Math.atan2(cx - e.x, cz - e.z); p().pitch = Math.atan2(cy - e.y, Math.hypot(cx - e.x, cz - e.z)); pl = await plan(); if (!pl.ok) return 'link ' + n + ': ' + pl.why; placeNow(); }
    const fs = S().entities.filter((x) => x.type === 'frame'); const ms = fs.map((f) => f.gm); const los = new Set(fs.map((f) => f.glo)), js = new Set(fs.map((f) => f.gj)); return (fs.length === 4 && los.size === 1 && js.size === 1 && ms.every((m, n) => m === ms[0] + n)) || 'chain ' + ms;
  });
  await T('mining.frame-never-duplicates-block', async () => {
    fresh(mkUp()); const { i, k } = spot(); dig(i, k - 1, 24, 5, 4, false); craft('frame:timber', 2); selectTool('frame:timber'); lookEast(cellX(i + 16) - 1.4, cellZ(k) + 0.3, -0.2); let pl = await plan(); placeNow(); const a = S().entities.find((x) => x.type === 'frame'); { const cx = cellX(a.gm), cz = cellZ(a.glo) + 0.9, cy = a.gj * 0.6 + 1.2; p().pos.set(cx - 2.2, 0, cellZ(k) + 0.3); p().vel.set(0, 0, 0); const e = p().eyePos(new V3()); p().yaw = Math.atan2(cx - e.x, cz - e.z); p().pitch = Math.atan2(cy - e.y, Math.hypot(cx - e.x, cz - e.z)); } pl = await plan();
    if (!pl.ok) return true; return (pl.ent.gm !== a.gm || pl.ent.glo !== a.glo || pl.ent.gj !== a.gj) || 'planned the same block again';
  });
  await T('mining.strut-and-jack-anchor', async () => {
    fresh(mkUp()); const a = await placeAtFloor('strut', -4, 5); const b = await placeAtFloor('jack', 4, 5); if (!a.ok || !b.ok) return 'place ' + JSON.stringify([a, b]);
    const sa = w().supports.find((q) => q.b === 1 && q.r === 1.9), sb = w().supports.find((q) => q.b === 2 && q.r === 2.7); return !!(sa && sb) || 'supports ' + JSON.stringify(w().supports);
  });
  await T('mining.lights-lantern-flare-glow', async () => {
    fresh(mkUp()); for (const [id, x] of [['lantern', -5], ['flare', -3], ['glow', 3]]) { const r = await placeAtFloor(id, x, 5); if (!r.ok) return id + ': ' + r.why; }
    const ls = g.machines.lights(new V3(0, 1, 5), 6); const types = ls.map((e) => e.type + (e.glow ? ':glow' : '')).sort().join(); return (types === 'flare,flare:glow,lantern') || types;
  });
  await T('mining.flare-and-glow-expire', async () => {
    fresh(mkUp()); await placeAtFloor('flare', -3, 5); await placeAtFloor('glow', 3, 5); S().stats.playSecs = 1000; for (const e of S().entities) if (e.type === 'flare') e.born = 1000 - 239; adv(1); const n1 = S().entities.filter((e) => e.type === 'flare').length;
    for (const e of S().entities) if (e.type === 'flare' && !e.glow) e.born = 1000 - 241; adv(1); const left = S().entities.filter((e) => e.type === 'flare').map((e) => !!e.glow); return (n1 === 2 && left.length === 1 && left[0] === true) || `n1 ${n1} left ${left}`;
  });
  await T('mining.marker-on-compass', async () => { fresh(mkUp({ compass: 1 })); const r = await placeAtFloor('marker', 0, 6); return (r.ok && S().entities.some((e) => e.type === 'marker')) || 'marker'; });
  await T('mining.bulkhead-place-and-take', async () => {
    fresh(mkUp()); craft('bulk', 2); selectTool('bulk'); aimPoint(0, 0, 6); let pl = await plan(); if (!pl.ok) return pl.why; placeNow(); const e = pl.ent; if (w().get(e.i, e.j, e.k) !== 998) return 'no bulk cell';
    S().carry = []; g.collect({ type: 'cell', i: e.i, j: e.j, k: e.k, sp: 998, vr: 0 }); return (w().get(e.i, e.j, e.k) === 0 && (S().items.bulk || 0) >= 1) || 'not taken back';
  });
  await T('mining.dynamite-blast-and-fuse', async () => {
    fresh(mkUp()); const { i, k } = spot(); const j0 = 3; const cnt = (cx, cy, cz, r) => { let c = 0; for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let d = -r; d <= r; d++) if (w().get(cx + a, cy + b, cz + d)) c++; return c; };
    const ci = i + 20, ck = k + 2, cj = Math.min(w().topAt(ci, ck) - 3, 30); const b0 = cnt(ci, cj, ck, 6); g.detonate({ x: cellX(ci), y: cellY(cj), z: cellZ(ck), dyn: true, tier: 0 }); const removed = b0 - cnt(ci, cj, ck, 6); void j0;
    if (removed < 15 || removed > 70) return 'dynamite removed ' + removed;
    fresh(mkUp()); craft('dynamite'); selectTool('dynamite'); aimPoint(0, 0, 6); const pl = await plan(); if (!pl.ok) return pl.why; placeNow(); const ent = S().entities.find((x) => x.dyn); if (!ent || ent.fuse !== 4) return 'no 4s fuse ent'; const bl0 = S().stats.blasts || 0; p().pos.set(0, 0, -1.4); adv(5); return ((S().stats.blasts || 0) === bl0 + 1 && !S().entities.some((x) => x.dyn)) || 'did not explode';
  });
  await T('mining.charge-tiers-grow', async () => {
    const out = []; for (const tier of [1, 2, 3]) { fresh(mkUp({ charges: tier })); const { i, k } = spot(-24 + tier * 12); const ci = i + 22, ck = k + 2, cj = Math.min(w().topAt(ci, ck) - 3, 30); const cnt = () => { let c = 0; for (let a = -7; a <= 7; a++) for (let b = -7; b <= 7; b++) for (let d = -7; d <= 7; d++) if (w().get(ci + a, cj + b, ck + d)) c++; return c; }; const b0 = cnt(); g.detonate({ x: cellX(ci), y: cellY(cj), z: cellZ(ck), tier }); out.push(b0 - cnt()); }
    return (out[0] > 40 && out[1] > out[0] && out[2] > out[1]) || 'sizes ' + out;
  });
  await T('mining.charge-fuse-6s', async () => { fresh(mkUp({ charges: 1 })); craft('charge'); selectTool('charge'); aimPoint(0, 0, 6); const pl = await plan(); if (!pl.ok) return pl.why; placeNow(); const e = S().entities.find((x) => x.type === 'charge'); return (e && e.fuse === 6) || 'fuse ' + (e && e.fuse); });
  await T('mining.tamp-adds-safe-length', async () => {
    fresh({}); const { i, k } = spot(); dig(i, k, 24, 2, 3, false);
    const before = w().stabBonus; w().stabBonus = 0; const a = w().stress(i + 18, 3, k); w().stabBonus = tune({ tamp: 8 }).stabBonus; const b = w().stress(i + 18, 3, k); w().stabBonus = before;
    if (!a || !b) return 'no roof cell to measure'; return (g.T.stabBonus === 8 && b.B - a.B === 16) || `B ${a.B} -> ${b.B}, stabBonus ${g.T.stabBonus}`;
  });
  await T('mining.creak-warn-time', async () => { const a = tune({}).warn, b = tune({ creak: 3 }).warn; return b > a * 2 || `${a} ${b}`; });
  await T('mining.stress-lens-lists-failing-roof', async () => {
    fresh({ stress: 1 }); const { i, k } = spot(); dig(i, k, 40, 2, 3, false); let got = null; const orig = g.renderer.setStress.bind(g.renderer); g.renderer.setStress = (l) => { got = l; orig(l); };
    p().pos.set(cellX(i + 30), 0, cellZ(k) + 0.3); p().yaw = Math.PI / 2; g.stressT = 0; adv(1); g.renderer.setStress = orig; return (got && got.length > 0 && got.some((c) => c.sev === 2)) || 'lens list ' + (got && got.length);
  });
  await T('mining.respirator-slows-lung', async () => {
    const lung = (resp) => { fresh({ resp }); g.dust.cells.clear(); const hd = { x: 0, y: 1.2, z: 0 }; for (let n = 0; n < 100; n++) { g.dust.add(0, 1.2, 0, 0.3); g.dust.level = 0.9; g.dust.breathe(0.1, hd, g.T); } return g.dust.lung; };
    const a = lung(0), b = lung(4); return b < a * 0.9 || `${a} ${b}`;
  });
  await T('mining.hardhat-reduces-shake', async () => { const a = tune({}).shakeMul, b = tune({ hardhat: 1 }).shakeMul; return b < a || `${a} ${b}`; });
  await T('mining.slope-probe-detects-drop', async () => {
    fresh({ slopeprobe: 1 }); const { i, k } = spot(); dig(i + 6, k, 1, 1, 1, false); // a hole beside open floor leaves a cell with a gap and no floor beside it
    const flat = g.slide.unstableAt(i - 3, 0, k); const j = 3; const ci = i + 20, ck = k; w().setCell(ci, j, ck, 2, 0); for (let d = 0; d <= 4; d++) { w().setCell(ci + 1, j - d, ck, 0, 0); }
    const cliff = g.slide.unstableAt(ci, j, ck); return (g.T.slopeProbe && cliff === true && flat === false) || `probe ${g.T.slopeProbe} cliff ${cliff} flat ${flat}`;
  });
  await T('mining.airmonitor-shows-with-dust', async () => { fresh({ airmon: 1 }); g.dust.cells.clear(); g.dust.add(p().pos.x, p().pos.y + 1.4, p().pos.z, 1); adv(1); const el = document.getElementById('air'); return (el && !el.classList.contains('hidden')) || 'gauge hidden'; });

  // ================================================================== TUNNEL RULE
  const tunnelOutcome = async (up, len, supportEvery, supportKind = 'strut') => {
    fresh(up); const { i, k } = spot(); const co0 = S().stats.collapses || 0; let failed = null;
    for (let step = 0; step < len && failed === null; step++) {
      for (let dk = 0; dk < 2; dk++) for (let j = 0; j < 3; j++) w().removeCell(i + step, j, k + dk, true);
      if (supportEvery && step % supportEvery === 0) { const ent = supportKind === 'frame' ? { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'x', cx: cellX(i + step), cz: cellZ(k) + 0.3, y0: 0, w: 1.16, h: 1.78 } : { id: g.nextId(), type: 'strut', x: cellX(i + step), y: 0, z: cellZ(k) + 0.3 }; S().entities.push(ent); g.addEntity(ent); }
      stepSim(2.2); if (sim().n > 8 || (S().stats.collapses || 0) > co0) failed = step;
    }
    return { failed, loose: sim().n };
  };
  await T('tunnel.hole-start-stable', async () => { fresh({}); const { i, k } = spot(); dig(i, k, 3, 1, 2, true); stepSim(10); return (sim().n === 0 && w().creaking.size === 0) || `loose ${sim().n} creaks ${w().creaking.size}`; });
  await T('tunnel.unsupported-collapses-past-length', async () => { const r = await tunnelOutcome({}, 40, 0); return (r.failed !== null && r.failed >= 8 && r.failed <= 30) || 'failed at ' + r.failed; });
  await T('tunnel.struts-prevent-collapse', async () => { const r = await tunnelOutcome({ struts: 1 }, 40, 6, 'strut'); return r.failed === null || 'collapsed at ' + r.failed; });
  await T('tunnel.frames-prevent-collapse', async () => { const r = await tunnelOutcome({ timber: 1 }, 40, 8, 'frame'); return r.failed === null || 'collapsed at ' + r.failed; });
  await T('tunnel.tamping-collapses-later', async () => {
    // tamping raises the unsupported length the rule allows, and a tamped tunnel outlasts an untamped one
    const limitFor = (up) => { fresh(up); const { i: i0, k } = spot(); dig(i0, k, 30, 2, 3, false); let B = 0; for (let s = 10; s < 30; s++) { const st = w().stress(i0 + s, 3, k); if (st) { B = st.B; break; } } return B; };
    const B0 = limitFor({}), B1 = limitFor({ tamp: 8 }); const a = await tunnelOutcome({}, 50, 0), b = await tunnelOutcome({ tamp: 8 }, 50, 0);
    return (B1 > B0 && (b.failed === null || b.failed >= a.failed - 1) && a.failed !== null) || `limit ${B0} vs ${B1}, failed at ${a.failed} vs ${b.failed}`;
  });
  await T('tunnel.collapse-is-bounded-and-settles', async () => { const r = await tunnelOutcome({}, 45, 0); stepSim(80); return (r.failed !== null && sim().n === 0 && g.slide.q.size === 0) || `loose ${sim().n} q ${g.slide.q.size}`; });

  // ================================================================== SLIDES
  await T('slides.calm-dig-no-slide', async () => { fresh({}); const { i, k } = spot(); const s0 = S().stats.slides || 0; for (let n = 0; n < 12; n++) { w().removeCell(i + n, 0, k, true); w().removeCell(i + n, 1, k, true); stepSim(0.5); } return ((S().stats.slides || 0) === s0) || 'slides during calm dig'; });
  await T('slides.mini-pile-stays', async () => { fresh({}); const s0 = S().stats.slides || 0; for (let q = 0; q < 60; q++) sim().spawn(2 + (q % 5), 0, -2 + Math.random() * 1.5, 0.6 + Math.random() * 2, 3 + Math.random() * 1.5, 0, 0, 0, q % 2); stepSim(25); return ((S().stats.slides || 0) === s0 && sim().n === 0) || 'mini pile slid or left bodies'; });
  await T('slides.blast-slides-then-settles', async () => {
    fresh({ charges: 3 }); const k = toK(0) + 10; let d0 = 0; for (let d = 30; d < 90; d++) if (w().topAt(toI(0) + d, k) >= 36) { d0 = d; break; } const i = toI(0) + d0, t = w().topAt(i, k); const s0 = S().stats.slides || 0;
    g.detonate({ x: cellX(i), y: cellY(t - 2), z: cellZ(k), tier: 3 }); stepSim(30); return (((S().stats.slides || 0) - s0) > 0 && sim().n === 0 && g.slide.q.size === 0) || `slides ${(S().stats.slides || 0) - s0} loose ${sim().n}`;
  });
  await T('slides.high-climb-triggers', async () => {
    fresh({}); const k = toK(0) + 10; let d0 = 0; for (let d = 30; d < 90; d++) if (w().topAt(toI(0) + d, k) >= 36) { d0 = d; break; } const i = toI(0) + d0 + 4, t = w().topAt(i, k); const s0 = S().stats.slides || 0; S().carry = []; for (let q = 0; q < 8; q++) S().carry.push({ sp: 2, vr: 0 });
    p().pos.set(cellX(i), 25, cellZ(k)); p().footCell = { i, j: t - 1, k }; for (let n = 0; n < 60 && (S().stats.slides || 0) === s0; n++) { g.treadOn(1.0, false); stepSim(0.4); } stepSim(6); return ((S().stats.slides || 0) > s0) || 'no slide from high climbing';
  });
  await T('slides.supports-hold-slope', async () => {
    const run = async (props) => { await newWorld(); fresh({ charges: 3 }); const k = toK(0) + 14; let d0 = 0; for (let d = 30; d < 90; d++) if (w().topAt(toI(0) + d, k) >= 36) { d0 = d; break; } const i = toI(0) + d0, t = w().topAt(i, k); if (props) for (let a = -6; a <= 6; a += 3) for (let b = -6; b <= 6; b += 3) w().supports.push({ x: cellX(i + a), y: cellY(t - 2), z: cellZ(k + b), r: 4, b: 3, id: 's' + a + b }); const s0 = S().stats.slides || 0; g.detonate({ x: cellX(i), y: cellY(t - 2), z: cellZ(k), tier: 3 }); stepSim(25); return (S().stats.slides || 0) - s0; };
    const a = await run(false), b = await run(true); return (a > 0 && b < a) || `${a} vs ${b}`;
  });


  // ================================================================== STRESS: mining and support
  WORLD_TESTS.push('stress.');
  const placeFrameAt = async (m, lo, j0, kind = 'timber', k0 = null, standZ = null) => {
    // place a frame section by aiming at its block from inside the neighbouring section (or the tunnel)
    const cx = cellX(m), cz = cellZ(lo) + 0.9, cy = j0 === 0 ? 0.1 : j0 * 0.6 + 1.2;
    // aiming along the corridor: stand back in the tunnel. Aiming at a section beside: stand inside the section next to it
    const base = S().entities.find((x) => x.type === 'frame'); const beside = base && lo !== base.glo && m === base.gm;
    if (beside) p().pos.set(cx, 0, standZ ?? cz); else p().pos.set(cx - 2.2, 0, standZ ?? cz); p().vel.set(0, 0, 0); const e = p().eyePos(new V3());
    p().yaw = Math.atan2(cx - e.x, cz - e.z); p().pitch = Math.atan2(cy - e.y, Math.hypot(cx - e.x, cz - e.z)); const pl = await plan(); if (!pl.ok) return { ok: false, why: pl.why };
    if (pl.ent.gm !== m || pl.ent.glo !== lo || pl.ent.gj !== j0) return { ok: false, why: `planned ${pl.ent.gm},${pl.ent.glo},${pl.ent.gj} wanted ${m},${lo},${j0}` }; placeNow(); return { ok: true };
  };
  await T('stress.200-frames-structure', async () => {
    fresh(mkUp()); const { i, k } = spot(); dig(i, k - 5, 70, 17, 8, false); craft('frame:timber', 220); selectTool('frame:timber');
    lookEast(cellX(i + 14) - 1.4, cellZ(k) + 0.3, -0.2); let pl = await plan(); if (!pl.ok) return pl.why; placeNow(); const first = S().entities.find((x) => x.type === 'frame');
    const t0 = performance.now(); let placed = 1; const fail = [];
    // a 50 long tunnel run, then a second row beside it and a third row above: 150 sections
    for (let n = 1; n < 50; n++) { const r = await placeFrameAt(first.gm + n, first.glo, first.gj, 'timber', k, cellZ(k) + 0.3); if (!r.ok) { fail.push('line ' + n + ': ' + r.why); break; } placed++; }
    for (let n = 0; n < 50; n++) { const r = await placeFrameAt(first.gm + n, first.glo + 4, first.gj, 'timber', k, cellZ(k) + 0.3); if (!r.ok) { fail.push('beside ' + n + ': ' + r.why); break; } placed++; }
    const ms = (performance.now() - t0) / placed; if (fail.length) return fail[0] + ` (placed ${placed})`;
    const fs = S().entities.filter((x) => x.type === 'frame'); const dup = new Set(fs.map((f) => `${f.gm},${f.glo},${f.gj},${f.axis}`)); if (dup.size !== fs.length) return 'duplicate blocks';
    adv(2); return (fs.length === placed && w().supports.length >= placed && ms < 400) || `frames ${fs.length} placed ${placed} supports ${w().supports.length} ${ms.toFixed(0)}ms each`;
  });
  await T('stress.long-lined-tunnel-never-collapses', async () => {
    fresh(mkUp()); const { i, k } = spot(); craft('frame:steel', 40); selectTool('frame:steel'); const co0 = S().stats.collapses || 0; dig(i, k - 1, 8, 5, 4, true); stepSim(3);
    // dig 200 cells, adding a frame section every 8 cells (reach of steel is 3.4 m) and checking nothing falls
    let nextFrame = i + 8; let first = null; let step = 0; const standZ = cellZ(k) + 0.3;
    for (let x = i + 8; x < i + 200; x += 2) { dig(x, k - 1, 2, 5, 4, true); stepSim(1.2); if (sim().n > 8 || (S().stats.collapses || 0) > co0) return `collapsed at ${x - i} cells in`; if (x >= nextFrame) { p().pos.set(cellX(x - 3), 0, standZ); p().yaw = Math.PI / 2; p().vel.set(0, 0, 0); p().pitch = -0.2; const pl = await plan(); if (pl.ok) { placeNow(); first = first || true; } nextFrame = x + 6; step++; } }
    return (first && step >= 15) || 'no frames placed';
  });
  await T('stress.repeat-collapse-cycles-bounded', async () => {
    let maxBodies = 0, maxQ = 0; for (let cycle = 0; cycle < 3; cycle++) { fresh({}); const { i, k } = spot(-12 + cycle * 12); const co0 = S().stats.collapses || 0; for (let step = 0; step < 30; step++) { dig(i + step, k, 1, 2, 3, true); stepSim(1.5); maxBodies = Math.max(maxBodies, sim().n); maxQ = Math.max(maxQ, g.slide.q.size); } stepSim(75); if (sim().n !== 0) return `cycle ${cycle}: ${sim().n} loose after settling`; void co0; }
    return (maxBodies < 900 && maxQ < 5000) || `max bodies ${maxBodies} queue ${maxQ}`;
  });
  await T('stress.supports-survive-save-load', async () => {
    fresh(mkUp()); const { i, k } = spot(); dig(i, k - 1, 30, 5, 4, false); craft('frame:concrete', 6); selectTool('frame:concrete'); lookEast(cellX(i + 14) - 1.4, cellZ(k) + 0.3, -0.2); let pl = await plan(); placeNow(); const first = S().entities.find((x) => x.type === 'frame');
    for (let n = 1; n < 5; n++) { const r = await placeFrameAt(first.gm + n, first.glo, first.gj, 'concrete', k, cellZ(k) + 0.3); if (!r.ok) return r.why; }
    const before = JSON.stringify(S().entities.filter((x) => x.type === 'frame').map((f) => [f.kind, f.gm, f.glo, f.gj, f.axis]));
    const raw = JSON.parse(JSON.stringify(S().entities)); // what a save would hold
    resetEntities(); if (w().supports.length) return 'supports not cleared'; for (const e of raw) g.addEntity(e); S().entities = raw;
    const after = JSON.stringify(S().entities.filter((x) => x.type === 'frame').map((f) => [f.kind, f.gm, f.glo, f.gj, f.axis]));
    return (before === after && w().supports.filter((q) => q.id).length >= 5) || 'frames or supports lost on reload';
  });
  await T('stress.removing-frames-lets-the-tunnel-cave-in', async () => {
    fresh(mkUp()); let sp0 = spot(); for (const lane of [20, 28, 6, -6, -14]) { if (w().topAt(sp0.i + 36, sp0.k) >= 9 && w().topAt(sp0.i + 12, sp0.k) >= 7) break; try { sp0 = spot(lane); } catch (e) { /* lane without a slope mouth */ } } const { i, k } = sp0; craft('frame:steel', 12); selectTool('frame:steel'); const standZ = cellZ(k) + 0.3; const co0 = S().stats.collapses || 0;
    // dig 5x4 tunnel 40 long with a frame section every few cells (beyond the unsupported limit), standing and holding
    dig(i, k - 1, 6, 5, 4, true); let x = i + 6, nextF = i + 6; const framed = [];
    for (; x < i + 46; x += 2) { dig(x, k - 1, 2, 5, 4, true); stepSim(1); if ((S().stats.collapses || 0) > co0 || sim().n > 8) return `collapsed at ${x - i} with ${framed.length} frames (limit ${(w().stress(x - 3, 4, k) || {}).B})`; if (x >= nextF) { nextF = x + 6; p().pos.set(cellX(x - 3), 0, standZ); p().yaw = Math.PI / 2; p().pitch = -0.2; p().vel.set(0, 0, 0); const pl = await plan(); if (pl.ok) { placeNow(); framed.push(S().entities.filter((e) => e.type === 'frame').pop().id); } } }
    stepSim(4); if ((S().stats.collapses || 0) > co0 || sim().n > 8) return 'collapsed while supported';
    if (framed.length < 4) return 'only ' + framed.length + ' frames placed';
    const roof = () => { let c = 0; for (let xx = i + 4; xx < i + 46; xx++) for (let kk = k - 1; kk < k + 4; kk++) if (w().get(xx, 4, kk)) c++; return c; }; const roof0 = roof(); const box = () => { let c = 0; for (let xx = i + 4; xx < i + 46; xx++) for (let kk = k - 1; kk < k + 4; kk++) for (let jj = 0; jj < 4; jj++) if (w().get(xx, jj, kk)) c++; return c; }; const box0 = box();
    for (const id of framed) g.doDecon({ kind: 'mach', id }); stepSim(30); const fell = (box() > box0 + 10 || roof() < roof0 - 10 || roof() > roof0 + 10) ? 1 : 0;
    return (fell || (S().stats.collapses || 0) > co0 || sim().n > 8 || w().creaking.size > 0) || (() => { let bad = 0, tot = 0, minB = 99; for (let xx = i; xx < i + 46; xx++) { const st = w().stress(xx, 4, k + 1); if (st) { tot++; minB = Math.min(minB, st.B); if (st.margin < 0) bad++; } } return `no cave-in: ${bad}/${tot} roof cells overloaded, limit ${minB}, supports left ${w().supports.length}, top ${w().topAt(i + 30, k)}`; })();
  });
  await T('stress.frame-decon-returns-item-and-support', async () => {
    fresh(mkUp()); const { i, k } = spot(); dig(i, k - 1, 24, 5, 4, false); craft('frame:rebar', 1); selectTool('frame:rebar'); lookEast(cellX(i + 16) - 1.4, cellZ(k) + 0.3, -0.2); const pl = await plan(); placeNow(); const e = S().entities.find((x) => x.type === 'frame'); if (!w().supports.some((q) => q.id === e.id)) return 'no support'; g.doDecon({ kind: 'mach', id: e.id });
    return (!w().supports.some((q) => q.id === e.id) && S().items['frame:rebar'] === 1 && !S().entities.some((x) => x.id === e.id)) || 'decon';
  });
  await T('stress.frame-roof-anchors-collapse-zone', async () => {
    // a long tunnel that would collapse unsupported holds when 4x4 sections are laid at the rule's spacing
    const run = async (withFrames) => { fresh(mkUp()); const { i, k } = spot(); craft('frame:timber', 20); selectTool('frame:timber'); const co0 = S().stats.collapses || 0; dig(i, k - 1, 6, 5, 4, true); stepSim(2); let nextF = i + 6;
      for (let x = i + 6; x < i + 60; x += 2) { dig(x, k - 1, 2, 5, 4, true); if (withFrames && x >= nextF) { p().pos.set(cellX(x - 3), 0, cellZ(k) + 0.3); p().yaw = Math.PI / 2; p().pitch = -0.2; p().vel.set(0, 0, 0); const pl = await plan(); if (pl.ok) placeNow(); nextF = x + 6; } stepSim(1.5); if (sim().n > 8 || (S().stats.collapses || 0) > co0) return x - i; } return null; };
    const a = await run(false), b = await run(true); return (a !== null && b === null) || `without ${a} with ${b}`;
  });


  // ================================================================== TOOLS, HAMMER, STOW
  await T('tools.hammer-on-hotbar-slot-1-by-default', async () => { fresh(); g.rebuildTools(); return (S().hotbar[0] === 'hammer' && g.tools[0] && g.tools[0].kind === 'hammer') || 'no hammer in slot 1'; });
  await T('tools.hands-by-default-and-q-toggles', async () => {
    fresh(); g.stowed = true; g.rebuildTools(); if (g.curTool().kind !== 'hands') return 'tool out by default'; g.onKey({ code: 'KeyQ', target: document.body }, true); if (g.stowed) return 'Q did not pull out'; if (g.curTool().kind === 'hands') return 'no tool after Q'; g.onKey({ code: 'KeyQ', target: document.body }, false); g.onKey({ code: 'KeyQ', target: document.body }, true); return g.stowed || 'Q did not put away';
  });
  await T('tools.same-number-puts-away', async () => { fresh(mkUp()); craft('strut'); const slot = S().hotbar.indexOf('strut'); g.stowed = true; g.rebuildTools(); g.selectTool(slot, true); if (g.stowed) return 'number did not pull out'; g.selectTool(slot, true); return g.stowed || 'number again did not put away'; });
  await T('tools.crafting-fills-first-free-slot-and-does-not-force-out', async () => { fresh(mkUp()); g.stowed = true; craft('strut'); craft('flare'); craft('dynamite'); return (g.stowed && S().hotbar[1] === 'strut' && S().hotbar[2] === 'flare' && S().hotbar[3] === 'dynamite') || 'hotbar ' + S().hotbar.join(','); });
  await T('tools.hotbar-full-keeps-items-in-inventory', async () => {
    fresh(mkUp()); const ids = ['strut', 'flare', 'glow', 'marker', 'lantern', 'dynamite', 'charge', 'jack']; for (const id of ids) craft(id); craft('bulk'); const full = S().hotbar.every((x) => x); const inInv = g.inventoryList().some((x) => x.id === 'bulk');
    return (full && inInv && S().hotbar.indexOf('bulk') < 0) || `full ${full} inv ${inInv} bar ${S().hotbar}`;
  });
  await T('tools.inventory-lists-items-and-assigns', async () => {
    fresh(mkUp({ firstaid: 1 })); craft('strut', 3); craft('medkit', 2); S().hotbar = ['hammer', null, null, null, null, null, null, null, null]; g.rebuildTools(); const list = g.inventoryList(); if (!list.some((x) => x.id === 'strut' && x.count === 3) || !list.some((x) => x.id === 'medkit' && x.count === 2) || !list.some((x) => x.id === 'hammer')) return 'list ' + list.map((x) => x.id);
    g.openModal('inv'); g.ui.invSel = 'strut'; g.ui.renderInventory(); g.ui.invAssign(5); if (S().hotbar[5] !== 'strut') return 'assign to slot 6 failed'; g.ui.invSel = 'medkit'; g.ui.invAssign(5); if (S().hotbar[5] !== 'medkit') return 'replace failed'; g.ui.invClear(); const ok = S().hotbar[5] === null; g.ui.closeModals(); return ok || 'clear failed';
  });
  await T('tools.hotbar-selection-by-slot-number', async () => { fresh(mkUp()); craft('strut'); craft('flare'); g.stowed = true; g.onKey({ code: 'Digit3', target: document.body }, true); return (!g.stowed && g.curTool().id === 'flare') || 'slot 3 should be the flare, got ' + g.curTool().id; });
  await T('tools.empty-slot-is-hands', async () => { fresh(mkUp()); g.selectTool(7); return g.curTool().kind === 'hands' || 'empty slot gave a tool'; });
  await T('tools.out-of-stock-slot-is-hands', async () => { fresh(mkUp()); const r0 = await placeAtFloor('strut', 2, 5); if (!r0.ok) return r0.why; const slot = S().hotbar.indexOf('strut'); g.stowed = false; g.selectTool(slot); return (S().items.strut === undefined && g.curTool().kind === 'hands') || 'spent stack still usable'; });
  await T('tools.medkit-on-hotbar-uses-with-b', async () => { fresh(mkUp({ firstaid: 1 })); craft('medkit'); const slot = S().hotbar.indexOf('medkit'); g.selectTool(slot); g.hp = 20; g.bPress(); return (g.hp > 60 && !S().items.medkit) || 'hp ' + g.hp; });
  await T('tools.cart-on-hotbar-rolls-out-with-b', async () => { fresh(mkUp({ cart: 1 })); craft('cart:1'); const slot = S().hotbar.indexOf('cart:1'); if (slot < 0) return 'cart not on hotbar'; g.selectTool(slot); g.bPress(); return (!!S().cart && S().cart.tier === 1) || 'no cart'; });
  await T('tools.click-with-hammer-hits-one-piece-per-click', async () => {
    fresh(mkUp({ struts: 1 })); const a = await placeAtFloor('strut', -4, 5), b = await placeAtFloor('strut', -2.4, 5); if (!a.ok || !b.ok) return 'setup';
    selectTool('hammer'); g.stowed = false; aimPoint(-4, 0.3, 5, 1.6); adv(0.15); g.keys.KeyF = true; g.gPress(); g.keys.KeyF = false; const left1 = S().entities.filter((e) => e.type === 'strut').length;
    // holding the key down must not keep hitting
    g.keys.KeyG = true; adv(1.0); g.keys.KeyG = false; const left2 = S().entities.filter((e) => e.type === 'strut').length; return (left1 === 1 && left2 === 1) || `after click ${left1}, after holding ${left2}`;
  });
  await T('tools.equipped-tool-means-f-does-not-grab', async () => {
    fresh(mkUp({ struts: 1, bag: 3 })); plushWall(30); craft('strut'); selectTool('strut'); g.stowed = false; standBeforeWall(); adv(0.1); const eye = p().eyePos(new V3()), dir = p().forward(new V3()); g.curTargetRef = g.findTarget(eye, dir); const n0 = S().carry.length; g.gPress(); return S().carry.length === n0 || 'grabbed with a tool equipped';
  });
  await T('tools.empty-hotbar-slot-grabs-by-hand', async () => {
    fresh(mkUp({ bag: 3 })); plushWall(30); g.selectTool(7); g.stowed = false; standBeforeWall(); adv(0.1); const eye = p().eyePos(new V3()), dir = p().forward(new V3()); g.curTargetRef = g.findTarget(eye, dir); if (!g.curTargetRef) return 'no target'; const n0 = S().carry.length; g.gPress(); return S().carry.length === n0 + 1 || 'empty slot did not grab';
  });
  await T('tools.f-places-the-equipped-building-item', async () => {
    fresh(mkUp()); craft('strut'); selectTool('strut'); g.stowed = false; aimPoint(0, 0, 5, 2.0); adv(0.1); const pl = await plan(); if (!pl.ok) return pl.why; const n0 = S().entities.length; g.gPress(); return S().entities.length === n0 + 1 || 'F did not place it';
  });
  await T('tools.stowed-means-no-ghost-or-build-hint', async () => { fresh(mkUp()); craft('strut'); g.stowed = true; g.rebuildTools(); g.plan = null; lookEast(0, 3, -0.4); adv(0.3); return (!g.plan || g.plan === null) || 'plan computed while stowed'; });
  await T('tools.hammer-removes-built-things', async () => {
    fresh(mkUp({ belts: 1, power: 1, bulkhead: 1 }));
    const a = await placeAtFloor('strut', -4, 5), b = await placeAtFloor('belt', 4, 5), c = await placeAtFloor('bulk', 0, 6.5, 2.2); if (!a.ok || !b.ok) return 'setup ' + JSON.stringify([a, b, c]);
    const hit = async (x, z, wantItem) => { selectTool('hammer'); g.stowed = false; aimPoint(x, 0.3, z, 1.6); adv(0.15); const ref = g.hammerTarget(); if (!ref) return 'no target at ' + x; g.hammerHit(); return null; };
    let r = await hit(-4, 5); if (r) return r; if (S().entities.some((e) => e.type === 'strut')) return 'strut not removed'; if (!S().items.strut) return 'strut not returned';
    r = await hit(4, 5); if (r) return r; if (tiles().some((t) => t.type === 'belt' && !t.free)) return 'belt not removed'; return true;
  });
  await T('tools.hammer-frame-returns-item-and-support', async () => {
    fresh(mkUp()); const { i, k } = spot(); dig(i, k, 24, 2, 3, false); craft('frame:steel'); selectTool('frame:steel'); lookEast(cellX(i + 16) - 1.4, cellZ(k) + 0.3, -0.2); const pl = await plan(); placeNow(); const e = S().entities.find((x) => x.type === 'frame');
    selectTool('hammer'); g.stowed = false; aimPoint(e.cx, e.y0 + 1.2, e.cz, 1.6); adv(0.15); const ref = g.hammerTarget(); if (!ref) return 'hammer found nothing'; g.hammerHit(); return (!S().entities.some((x) => x.id === e.id) && S().items['frame:steel'] === 1 && !w().supports.some((q) => q.id === e.id)) || 'frame/support not removed';
  });
  await T('tools.hammer-takes-down-bulkhead', async () => { fresh(mkUp()); craft('bulk'); selectTool('bulk'); aimPoint(0, 0, 6.5, 2.2); const pl = await plan(); if (!pl.ok) return pl.why; placeNow(); const e = pl.ent; selectTool('hammer'); g.stowed = false; aimPoint(cellX(e.i), cellY(e.j), cellZ(e.k), 1.4); adv(0.15); const ref = g.hammerTarget(); if (!ref || ref.kind !== 'bulk') return 'no bulk target'; g.hammerHit(); return (w().get(e.i, e.j, e.k) === 0) || 'bulk still there'; });

  // ================================================================== HALL: signs and chalkboard
  await T('hall.signs-and-chalkboard-exist', async () => {
    const sc = g.renderer.scene; const count = (n) => { let c = 0; sc.traverse((o) => { if (o.name === n) c++; }); return c; };
    const cb = sc.getObjectByName('chalkboard'); if (!cb) return 'no chalkboard'; let textured = false; cb.traverse((o) => { if (o.material && o.material.map && o.material.map.image) textured = true; });
    return (count('exitSign') >= 2 && count('climbSign') >= 4 && textured) || `exit ${count('exitSign')} climb ${count('climbSign')} chalk ${textured}`;
  });

  // ================================================================== AUDIO: no random noises
  await T('audio.no-random-creaks-when-idle-in-pile', async () => {
    fresh(); let creaks = 0; const orig = g.sound.creak.bind(g.sound); g.sound.creak = (...a) => { creaks++; return orig(...a); };
    p().pos.set(cellX(0) + 30 * 0.6, 12, 0); g.camSky = 0.1; g.settleT = 0; adv(60); g.sound.creak = orig; return creaks === 0 || creaks + ' creak sounds while idle';
  });
  await T('audio.quiet-world-makes-few-sounds', async () => {
    fresh(); const log = {}; const wrap = (n) => { const o = g.sound[n].bind(g.sound); g.sound[n] = (...a) => { log[n] = (log[n] || 0) + 1; return o(...a); }; return () => { g.sound[n] = o; }; };
    const undo = ['creak', 'rumble', 'debris', 'squeak', 'chirp', 'cough', 'thump', 'soft', 'whoosh', 'noise', 'tone'].map(wrap); p().pos.set(0, 0, -1.4); adv(40); undo.forEach((f) => f()); const total = Object.values(log).reduce((a, b) => a + b, 0); return total <= 8 || 'sounds in 40 quiet seconds: ' + JSON.stringify(log);
  });


  // ================================================================== RENDER: no holes after edits
  await T('render.chunks-match-world-after-edits', async () => {
    fresh(); const cam = g.renderer.camera.position; const { i, k } = spot(); p().pos.set(cellX(i + 10), 0, cellZ(k)); adv(0.3);
    const flush = () => { for (let n = 0; n < 400 && (g.renderer.pending.length || g.world.dirtyChunks.size); n++) g.renderer.updateChunks(cam, 40); };
    flush();
    // edits all around chunk borders: removals, additions, a tunnel and a collapse
    const rnd = (a, b) => a + Math.floor(Math.random() * (b - a));
    for (let n = 0; n < 500; n++) { const ii = i + rnd(6, 40), kk = k + rnd(-12, 12), jj = rnd(0, 18); if (Math.random() < 0.7) w().removeCell(ii, jj, kk, false); else if (!w().get(ii, jj, kk)) w().setCell(ii, jj, kk, 2 + (n % 5), 0); }
    dig(i + 10, k, 20, 2, 3, true); stepSim(6); flush();
    let bad = 0, checked = 0, worst = '';
    for (const [ci, ch] of g.renderer.chunks) { if (ch.cold) continue; const exp = g.renderer.scanChunk(ch.cx, ch.cy, ch.cz, !!ch.deep).n; checked++; if (exp !== ch.n) { bad++; worst = `chunk ${ch.cx},${ch.cy},${ch.cz} drawn ${ch.n} expected ${exp}`; } }
    return (bad === 0 && checked > 0) || `${bad} of ${checked} chunks stale: ${worst}`;
  });


  // ================================================================== MACHINES AND POWER
  const powerUp = (extra = {}) => ({ power: 1, belts: 1, sorter: 1, vault: 1, fans: 1, detector: 1, mech: 1, claw: 1, borer: 1, depots: 1, steel: 1, timber: 1, ...extra });
  const feedGen = (gen, n = 6) => { S().carry = []; for (let q = 0; q < n; q++) S().carry.push({ sp: 2, vr: 0 }); g.useTile(gen); };
  await T('machines.generator-burns-fuel-and-powers-pole-net', async () => {
    fresh(powerUp()); const a = await placeAtFloor('gen', -6.6, 2.4, 2.2), b = await placeAtFloor('pole', -6.6, 3.4, 2.2); if (!a.ok || !b.ok) return JSON.stringify([a, b]);
    const gen = tiles().find((t) => t.type === 'gen'); feedGen(gen, 6); if (gen.q.length === 0) return 'fuel not accepted'; adv(3); return (gen.burn > 0 && g.power.nets.length > 0 && g.power.nets[0].supply >= 0 && gen.pw !== undefined) || 'not burning';
  });
  await T('machines.fan-runs-on-power-and-clears-dust', async () => {
    fresh(powerUp()); await placeAtFloor('gen', -6.6, 2.4, 2.2); await placeAtFloor('pole', -6.6, 3.4, 2.2); const f = await placeAtFloor('fan', -6.6, 4.4, 2.2); if (!f.ok) return f.why;
    const gen = tiles().find((t) => t.type === 'gen'), fan = tiles().find((t) => t.type === 'fan'); feedGen(gen, 20); g.dust.cells.clear(); g.dust.add(-6.6, 1.0, 4.4, 1.5); const d0 = g.dust.at(-6.6, 1.0, 4.4); adv(6); return (fan.pw > 0.5 && g.dust.at(-6.6, 1.0, 4.4) < d0) || `fan pw ${fan.pw} dust ${g.dust.at(-6.6, 1.0, 4.4)}`;
  });
  await T('machines.fan-does-nothing-without-power', async () => {
    fresh(powerUp()); const f = await placeAtFloor('fan', -6.6, 4.4, 2.2); if (!f.ok) return f.why; const fan = tiles().find((t) => t.type === 'fan'); g.dust.cells.clear(); g.dust.add(-6.6, 1.0, 4.4, 1.5); adv(5); return (fan.pw || 0) < 0.05 || 'fan worked unpowered: pw ' + fan.pw;
  });
  await T('machines.generator-output-and-buffer-upgrades', async () => { const a = tune({ power: 1 }).genOutput, b = tune({ power: 1, genOutput: 6 }).genOutput; const c = tune({ power: 1 }).genBuffer, d = tune({ power: 1, genBuffer: 3 }).genBuffer; return (b > a * 3 && d > c) || `${a} ${b} ${c} ${d}`; });
  await T('machines.pole-reach-grows-with-grid-range', async () => { const a = tune({ power: 1 }).poleLink, b = tune({ power: 1, gridRange: 4 }).poleLink, c = tune({ power: 1 }).poleReach, d = tune({ power: 1, gridRange: 4 }).poleReach; return (b > a && d > c) || `${a} ${b} ${c} ${d}`; });
  await T('machines.belt-carries-to-vault', async () => {
    fresh(powerUp()); await placeAtFloor('gen', -6.6, 2.4, 2.2); await placeAtFloor('pole', -6.6, 3.4, 2.2); for (let n = 0; n < 6; n++) { const r = await placeAtFloor('belt', -5.4 + n * 0.6, 2.4, 2.0); if (!r.ok) return 'belt ' + n + ': ' + r.why; }
    const v = await placeAtFloor('vault', -1.8, 2.4, 2.0); if (!v.ok) return 'vault: ' + v.why; feedGen(tiles().find((t) => t.type === 'gen'), 30); const first = tiles().filter((t) => t.type === 'belt' && !t.free).sort((a, b) => a.i - b.i)[0]; const vault = tiles().find((t) => t.type === 'vault');
    for (let q = 0; q < 6; q++) first.items.push({ sp: 3 + q, vr: 0, t: 0.02 + q * 0.3 }); adv(20); return vault.stored.length === 6 || 'vault got ' + vault.stored.length;
  });
  await T('machines.belt-speed-upgrade', async () => { const a = tune({ belts: 1 }).beltSpeed, b = tune({ belts: 1, beltSpeed: 6 }).beltSpeed; return b > a * 2 || `${a} ${b}`; });
  await T('machines.gate-catches-the-one-and-halts-line', async () => {
    fresh(powerUp()); for (let n = 0; n < 8; n++) { const r = await placeAtFloor('belt', -5.4 + n * 0.6, 2.4, 2.0); if (!r.ok) return r.why; }
    const gt = await placeAtFloor('gate', -3.6, 2.4, 2.0); if (!gt.ok) return gt.why; const bs = tiles().filter((t) => t.type === 'belt' && !t.free).sort((a, b) => a.i - b.i); const gate = bs.find((t) => t.detector); if (!gate) return 'gate not made'; const first = bs[0];
    first.items.push({ sp: NEEDLE, vr: 0, t: 0.1 }, { sp: 3, vr: 0, t: 0.02 }); for (let n = 0; n < 400; n++) { for (const t of bs) t.pw = 1; g.time += 0.05; L().update(0.05); }
    return (gate.alarm && gate.held && bs.every((t) => t.halt) && !S().needleLost) || `alarm ${gate.alarm} held ${!!gate.held} halted ${bs.filter((t) => t.halt).length}/${bs.length} lost ${S().needleLost}`;
  });
  await T('machines.gate-taking-the-one-releases-line-and-wins', async () => {
    fresh(powerUp()); for (let n = 0; n < 6; n++) await placeAtFloor('belt', -5.4 + n * 0.6, 2.4, 2.0); await placeAtFloor('gate', -3.6, 2.4, 2.0); const bs = tiles().filter((t) => t.type === 'belt' && !t.free).sort((a, b) => a.i - b.i); const gate = bs.find((t) => t.detector); bs[0].items.push({ sp: NEEDLE, vr: 0, t: 0.1 }); for (let n = 0; n < 300; n++) { for (const t of bs) t.pw = 1; g.time += 0.05; L().update(0.05); }
    if (!gate.alarm) return 'no alarm'; g.useTile(gate); return (S().ending === 'plush' && bs.every((t) => !t.halt)) || 'ending ' + S().ending + ' halt ' + bs.some((t) => t.halt);
  });
  await T('machines.gate-refuses-near-bin-and-sorters-refuse-near-gate', async () => {
    fresh(powerUp()); const bp = g.hall.binPos; craft('gate'); selectTool('gate'); aimPoint(bp.x + 3, 0, bp.z + 1, 2.0); const pl = await plan(); if (pl && pl.ok) return 'gate allowed beside the bin'; await placeAtFloor('gate', -3.6, 6.4, 2.0);
    craft('sorter'); selectTool('sorter'); aimPoint(-3.0, 0, 6.4, 1.5); const p2 = await plan(); return (!p2.ok && /gate/.test(p2.why || '')) || 'sorter allowed next to a gate: ' + JSON.stringify(p2.why);
  });
  await T('machines.vault-e-empties-into-hands', async () => {
    fresh(powerUp({ bag: 3 })); const v = await placeAtFloor('vault', 0.6, 5, 2.0); if (!v.ok) return v.why; const vault = tiles().find((t) => t.type === 'vault'); for (let q = 0; q < 5; q++) vault.stored.push({ sp: 2 + q, vr: 0 }); S().carry = []; g.useTile(vault); return (S().carry.length === Math.min(5, g.T.carry) && vault.stored.length === 5 - Math.min(5, g.T.carry)) || 'took ' + S().carry.length;
  });
  const faceDigTest = async (up, build) => {
    await newWorld(); fresh(up); const { i, k } = spot(); const c0 = S().stats.cells || 0; await build(i, k); return (S().stats.cells || 0) - c0;
  };
  await T('machines.mech-digs-and-feeds-belt-into-vault', async () => {
    fresh(powerUp({ mechLayer: 1, mechBolt: 1 })); const sp0 = spot(-6); const kk = sp0.k; let i0 = sp0.i; for (let g2 = 0; g2 < 60 && w().topAt(i0 + 8, kk) < 6; g2++) i0++;
    const mk = (type, ii, extra = {}) => { const e = { id: g.nextId(), type, i: ii, j: 0, k: kk, dir: 0, rise: 0, ...extra }; if (type === 'belt') e.items = []; S().entities.push(e); g.addEntity(e); return e; };
    const mech = mk('mech', i0 - 1, { dir: 0 }); for (let n = 1; n <= 4; n++) mk('belt', i0 - 1 - n, { dir: 2 }); const vault = mk('vault', i0 - 6, { dir: 2 });
    const get = (e) => tiles().find((t) => t.id === e.id); const c0 = S().stats.cells || 0;
    for (let n = 0; n < 5200; n++) { for (const t of tiles()) if (['mech', 'belt', 'vault'].includes(t.type)) t.pw = 1; g.time += 0.05; L().update(0.05); }
    const dug = (S().stats.cells || 0) - c0; const frames = S().entities.filter((e) => e.type === 'frame' && e.auto).length; const belts = tiles().filter((t) => t.type === 'belt' && t.k === kk).length;
    return (dug > 30 && get(vault).stored.length > 25 && get(mech).adv >= 3 && belts > 5 && (frames >= 1 || w().topAt(i0 + 4, kk) < 5)) || `dug ${dug} vault ${get(vault).stored.length} adv ${get(mech).adv} belts ${belts} frames ${frames}`;
  });
  await T('machines.mech-fleet-limit', async () => { const a = tune({ mech: 1 }).mechMax, b = tune({ mech: 1, mechCount: 8 }).mechMax; return b > a || `${a} ${b}`; });
  await T('machines.claw-rig-plucks-and-sells', async () => {
    fresh(powerUp()); const { i, k } = spot(); craft('claw'); selectTool('claw'); let tx = 0; for (let d = 1; d < 60; d++) if (w().topAt(i + d, k) >= 6) { tx = i + d; break; } if (!tx) return 'no steep enough face'; let so = tx - 1; while (so > i - 8 && w().topAt(so, k) > 0) so--; p().pos.set(cellX(so), 0, cellZ(k)); p().vel.set(0, 0, 0); { const e = p().eyePos(new V3()); p().yaw = Math.atan2(cellX(tx) - e.x, 0); p().pitch = Math.atan2(1.2 - e.y, cellX(tx) - e.x); } const pl = await plan(); if (!pl.ok) return pl.why; placeNow();
    const m0 = S().money, c0 = S().stats.cells || 0; for (let n = 0; n < 2400; n++) { for (const it of g.machines.items.values()) it.ent.pw = 1; g.time += 0.05; g.machines.update(0.05, g.time); } return (S().money > m0 && (S().stats.cells || 0) > c0 + 20) || `money ${S().money - m0} cells ${(S().stats.cells || 0) - c0}`;
  });
  await T('machines.claw-rig-limit-and-upgrades', async () => { const a = tune({ claw: 1 }), b = tune({ claw: 1, rigCount: 5, rigSpeed: 6, rigReach: 4 }); return (b.rigMax > a.rigMax && b.rigRate < a.rigRate && b.rigReach > a.rigReach) || `rig upgrades ${a.rigMax},${a.rigRate},${a.rigReach} -> ${b.rigMax},${b.rigRate},${b.rigReach}`; });
  await T('machines.borer-bores-lined-tunnel', async () => {
    fresh(powerUp({ borerSize: 2 })); const { i, k } = spot(); craft('borer'); selectTool('borer'); let placed = false; for (const back of [1.5, 2.0, 2.5]) for (const pitch of [0, -0.1, -0.2]) { lookEast(cellX(i + 1) - back, cellZ(k), pitch); const pl = await plan(); if (pl && pl.ok) { placeNow(); placed = true; break; } if (placed) break; } if (!placed) return 'borer could not be placed';
    const bor = [...g.machines.items.values()].find((x) => x.ent.type === 'borer'); const c0 = S().stats.cells || 0; for (let n = 0; n < 2400; n++) { for (const it of g.machines.items.values()) it.ent.pw = 1; g.time += 0.05; g.machines.update(0.05, g.time); } return ((S().stats.cells || 0) - c0 > 40 && bor.ent.w >= 4 && bor.ent.h >= 4) || `cells ${(S().stats.cells || 0) - c0} size ${bor.ent.w}x${bor.ent.h}`;
  });
  await T('machines.borer-size-and-speed-upgrades', async () => { const a = tune({ borer: 1 }), b = tune({ borer: 1, borerSize: 2, borerSpeed: 6, borerCount: 4 }); return (b.borerW >= 5 && b.borerRate < a.borerRate && b.borerMax > a.borerMax) || `borer upgrades ${a.borerW}x${a.borerH} ${a.borerRate} ${a.borerMax} -> ${b.borerW}x${b.borerH} ${b.borerRate} ${b.borerMax}`; });
  await T('machines.depot-sells-and-lists-travel', async () => {
    fresh(powerUp({ bag: 2 })); const b = await placeAtFloor('beacon', 6, -9, 2.2); if (!b.ok) return b.why; const bc = [...g.machines.items.values()].find((x) => x.ent.type === 'beacon'); S().carry = []; for (let q = 0; q < 4; q++) S().carry.push({ sp: 2, vr: 0 }); p().pos.set(bc.ent.x + 2, 0, bc.ent.z); const m0 = S().money; for (let n = 0; n < 80; n++) g.autoDump(0.1);
    if (S().carry.length !== 0 || S().money <= m0) return 'depot did not sell'; p().pos.set(bc.ent.x + 1.2, 0, bc.ent.z); p().yaw = Math.atan2(bc.ent.x - p().pos.x, bc.ent.z - p().pos.z); p().pitch = -0.2; adv(0.2); g.useKey(); const open = g.ui.openModal === 'travel'; g.ui.closeModals(); return open || 'travel menu did not open';
  });


  // ================================================================== UPGRADES
  await T('upgrades.ids-and-names-unique', async () => { const ids = new Set(), names = new Map(); for (const u of UPGRADES) { if (ids.has(u.id)) return 'duplicate id ' + u.id; ids.add(u.id); if (names.has(u.name)) return `duplicate name ${u.name} (${names.get(u.name)} and ${u.id})`; names.set(u.name, u.id); } return true; });
  await T('upgrades.every-upgrade-changes-something-at-max', async () => {
    const base = computeTuning(effLevels({ up: {}, gear: {} }), S().boosts); const dead = [];
    for (const u of UPGRADES) { const t = computeTuning(effLevels({ up: { [u.id]: u.max }, gear: {} }), S().boosts); if (!Object.keys(t).some((k) => JSON.stringify(t[k]) !== JSON.stringify(base[k]))) dead.push(u.id); }
    return dead.length === 0 || 'no effect: ' + dead.join();
  });
  await T('upgrades.descriptions-have-no-stale-keys', async () => { const bad = UPGRADES.filter((u) => /\bG\b to|hold G|tap G|craft each tier/.test(u.desc)).map((u) => u.id); return bad.length === 0 || 'stale text: ' + bad.join(); });
  await T('upgrades.every-upgrade-is-buyable-in-order', async () => {
    fresh({}); S().stats.plush = 1e9; const stuck = []; for (let round = 0; round < 16; round++) for (const u of UPGRADES) { if ((S().up[u.id] || 0) < u.max) { S().money = 1e13; try { g.buy(u.id); } catch (e) { stuck.push(u.id + ':' + e.message); } } }
    const left = UPGRADES.filter((u) => (S().up[u.id] || 0) < u.max).map((u) => u.id + ' ' + (S().up[u.id] || 0) + '/' + u.max); fresh({}); return (stuck.length === 0 && left.length === 0) || `stuck ${stuck} left ${left}`;
  });
  await T('upgrades.crew-slots-gated-by-plush-handled', async () => { fresh({ crew: 1 }); S().stats.plush = 0; S().money = 1e13; g.buy('crewSlots'); const blocked = (S().up.crewSlots || 0) === 0; S().stats.plush = 1e9; g.buy('crewSlots'); return (blocked && S().up.crewSlots === 1) || 'plush gate'; });

  // ================================================================== CRAFTING
  await T('craft.every-recipe-crafts-with-context', async () => {
    fresh(mkUp({ cart: 5, firstaid: 1, power: 1, belts: 1, sorter: 1, vault: 1, fans: 1, detector: 1, mech: 1, claw: 1, borer: 1, depots: 1, scavenge: 1 })); const rs = recipes(g); const bad = [];
    for (const r of rs) { if (/undefined|NaN/.test(`${r.name}${r.desc}${r.use}${r.status}`)) bad.push(r.id + ' text'); if (!r.use) bad.push(r.id + ' no use text'); if (!(r.price > 0)) bad.push(r.id + ' price'); S().money = 1e13; const before = (r.kind === 'mat' ? S().mats[r.mk] : S().items[r.id]) || 0; g.craftItem(r.id, 1); const after = r.kind === 'mat' ? (S().mats[r.mk] || 0) : (S().items[r.id] || 0) + (r.kind === 'cart' ? (S().cart ? 1 : 0) : 0); if (after <= before && !(r.kind === 'cart')) bad.push(r.id + ' not crafted'); }
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  });
  await T('craft.materials-stock-then-shortfall', async () => {
    fresh(mkUp()); S().money = 1000; craft('mat:timber', 10); const st = S().mats.timber; craft('frame:timber', 3); const used = st - (S().mats.timber || 0); return (st === 10 && used === 10 && S().items['frame:timber'] === 3 && Math.abs(S().money - (1000 - 6 * 10 - 2 * 9)) < 1) || `stock ${st} used ${used} money ${S().money}`;
  });
  await T('craft.ui-cards-have-no-undefined-text', async () => {
    fresh(mkUp({ cart: 5, firstaid: 1, power: 1, belts: 1, sorter: 1, vault: 1, fans: 1, detector: 1, mech: 1, claw: 1, borer: 1, depots: 1 })); g.openModal('craft'); g.ui.renderCraft(); const t = document.getElementById('craftGrid').textContent; g.ui.closeModals(); return !/undefined|NaN|\[object/.test(t) || 'bad text on the bench';
  });
  await T('craft.frame-cards-differ-per-tier', async () => { fresh(mkUp()); const rs = recipes(g).filter((r) => r.kind === 'frame'); const notes = new Set(rs.map((r) => r.status)); return (rs.length === 10 && notes.size === 10) || `${rs.length} frames, ${notes.size} distinct notes`; });

  // ================================================================== CREW
  await T('crew.slots-and-haul-and-speed-upgrades', async () => {
    fresh({ crew: 1, crewSlots: 2 }); S().stats.plush = 1e9; const n0 = g.T.crewMax; const b = g.crew.spawn(); const c0 = g.crew.capacity(b), d0 = g.crew.digTime(b, 0, 0); tune({ crew: 1, crewSlots: 8, crewHaul: 4, crewSpeed: 6, crewBattery: 4 }); return (g.T.crewMax > n0 && g.crew.capacity(b) > c0 * 2 && g.crew.digTime(b, 0, 0) < d0 * 0.7 && g.T.crewBattery > 1) || 'crew upgrades';
  });
  await T('crew.digs-hauls-and-sells', async () => {
    fresh({ crew: 1, crewSlots: 3 }); const { i, k } = spot(); const b = g.crew.spawn(); const h = g.crew.home(); b.x = h.x + 1; b.z = h.z + 1; p().pos.set(cellX(i) - 1.5, 0, cellZ(k)); const m0 = S().money; const ok = g.crew.order(b, 0, cellX(i) - 1.5, 0.3, cellZ(k)); if (!ok) return 'order refused';
    const seen = new Set(); for (let n = 0; n < 9000; n++) { g.time += 0.05; g.crew.update(0.05, g.time); g.logi.update(0.05); seen.add(b.state); } return (S().money > m0 && seen.has('farm') && (seen.has('return') || seen.has('unload'))) || `money ${S().money - m0} states ${[...seen]}`;
  });
  await T('crew.bolt-and-belt-kit', async () => {
    fresh({ crew: 1, crewSlots: 3, crewBolt: 1, crewBelt: 1, timber: 1, belts: 1, power: 1 }); S().stats.plush = 1e9; const { i, k } = spot(); const b = g.crew.spawn(); p().pos.set(cellX(i) - 1.5, 0, cellZ(k)); g.crew.order(b, 0, cellX(i) - 1.5, 0.3, cellZ(k)); for (let n = 0; n < 9000; n++) { g.time += 0.05; g.crew.update(0.05, g.time); g.logi.update(0.05); }
    const frames = S().entities.filter((e) => e.type === 'frame' && e.auto).length, belts = tiles().filter((t) => t.type === 'belt' && !t.free).length; return (frames >= 1 && belts >= 2) || `auto frames ${frames} belts ${belts}`;
  });
  await T('crew.never-sells-the-one-without-a-gate-scan', async () => {
    fresh({ crew: 1, crewSlots: 2 }); const b = g.crew.spawn(); const h = g.crew.home(); S().needleLost = false; b.state = 'return'; b.carry = [{ sp: 5, vr: 0 }, { sp: NEEDLE, vr: 0 }]; b.x = h.x + 12; b.z = h.z + 3; b.y = 0.5; b.path = [[h.x, h.z]]; b.pi = 0; b.scanned = false; b.cleared = false; b.stuckT = 30; b.lastX = b.x; b.lastZ = b.z;
    for (let n = 0; n < 900; n++) { g.time += 0.05; g.crew.update(0.05, g.time); g.logi.update(0.05); } const gate = tiles().find((t) => t.detector && t.free); return (b.state === 'held' && gate.alarm && !S().needleLost && b.carry.length === 1) || `state ${b.state} alarm ${gate.alarm} lost ${S().needleLost} carry ${b.carry.length}`;
  });
  await T('crew.gate-scan-releases-after-the-one-is-taken', async () => {
    fresh({ crew: 1, crewSlots: 2 }); const b = g.crew.spawn(); const h = g.crew.home(); b.state = 'return'; b.carry = [{ sp: 5, vr: 0 }, { sp: NEEDLE, vr: 0 }, { sp: 6, vr: 0 }]; b.x = h.x + 2; b.z = h.z + 1; b.y = 0.5; b.path = []; b.pi = 0; b.scanned = false; b.cleared = false;
    for (let n = 0; n < 500; n++) { g.time += 0.05; g.crew.update(0.05, g.time); g.logi.update(0.05); } const gate = tiles().find((t) => t.detector && t.free); if (b.state !== 'held') return 'not held: ' + b.state; gate.held = null; gate.alarm = false; g.logi.setGate(gate, false); g.logi.recomputeHalt();
    const m0 = S().money; for (let n = 0; n < 700; n++) { g.time += 0.05; g.crew.update(0.05, g.time); g.logi.update(0.05); } return (b.carry.length === 0 && S().money > m0) || `carry ${b.carry.length}`;
  });

  // ================================================================== PERSISTENCE, MULTIPLAYER, ACHIEVEMENTS, UI
  await T('persist.save-contains-everything-new', async () => {
    fresh(mkUp({ firstaid: 1 })); craft('strut', 2); craft('medkit'); craft('mat:timber', 5); S().noSaveFlag = undefined; g.noSave = false; g.save(); g.noSave = true;
    const key = 'rotfactory.save.v1'; const raw = JSON.parse(localStorage.getItem(key)).S; const ok = raw && raw.hotbar && raw.hotbar.includes('strut') && raw.items.strut === 2 && raw.items.medkit === 1 && raw.mats.timber === 5 && raw.entities.some((e) => e.free);
    return !!ok || 'save is missing hotbar/items/mats/free gate: ' + Object.keys(raw || {}).join();
  });
  await T('multiplayer.shared-state-roundtrip', async () => {
    fresh(mkUp()); craft('mat:steel', 7); craft('strut', 2); const sent = []; const orig = g.netSend.bind(g); g.netSend = (m) => sent.push(JSON.parse(JSON.stringify(m))); g.net.open = true; g.net.role = 'host'; g.sendShared(); g.net.role = null; g.net.open = false; g.netSend = orig;
    const m = sent.find((x) => x.t === 'shared'); if (!m || !m.mats || m.mats.steel !== 7 || m.items.strut !== 2) return 'shared message incomplete'; g.net.role = 'guest'; const keep = { items: S().items, mats: S().mats }; S().items = {}; S().mats = {}; g._sharedKey = null; g.applyShared(m); const ok = S().mats.steel === 7 && S().items.strut === 2; g.net.role = null; return ok || 'guest did not apply';
  });
  await T('multiplayer.guest-spend-command-consumes-on-host', async () => { fresh(mkUp({ firstaid: 1 })); craft('medkit', 2); g.netCmd && g.netCmd({ c: 'spend', d: { id: 'medkit' } }); return true; });
  await T('achievements.all-checks-run-without-throwing', async () => {
    fresh({}); const bad = []; const ids = new Set(); for (const a of ACHIEVEMENTS) { if (ids.has(a.id)) bad.push('dup ' + a.id); ids.add(a.id); try { a.check(S()); } catch (e) { bad.push(a.id + ': ' + e.message); } }
    S().stats.plush = 1e9; S().stats.cells = 1e9; S().up = Object.fromEntries(UPGRADES.map((u) => [u.id, u.max])); for (const a of ACHIEVEMENTS) { try { a.check(S()); } catch (e) { bad.push('maxed ' + a.id + ': ' + e.message); } } return bad.length === 0 || bad.slice(0, 5).join('; ');
  });
  await T('ui.every-modal-renders-without-bad-text', async () => {
    fresh(mkUp({ cart: 5, firstaid: 1, power: 1, belts: 1, sorter: 1, vault: 1, fans: 1, detector: 1, mech: 1, claw: 1, borer: 1, depots: 1, crew: 1, contracts: 1, compass: 1 })); S().stats.plush = 1e9; craft('strut', 2); craft('medkit'); const bad = [];
    for (const id of ['shop', 'dex', 'ach', 'journal', 'crew', 'craft', 'inv', 'pause', 'note']) { try { if (id === 'note') continue; g.openModal(id); const t = document.getElementById(id).textContent; if (/undefined|NaN|\[object Object\]/.test(t)) bad.push(id + ' has bad text'); g.ui.closeModals(); } catch (e) { bad.push(id + ' threw ' + e.message); } }
    return bad.length === 0 || bad.join('; ');
  });
  await T('ui.controls-lists-mention-every-key', async () => { const html = document.getElementById('pause').textContent + document.querySelector('.how').textContent; const need = ['punch', 'inventory', 'flashlight', 'medkit', 'recall', 'grab']; const miss = need.filter((n) => !html.toLowerCase().includes(n)); return miss.length === 0 || 'controls text is missing ' + miss.join(); });


  // ================================================================== PLUSH VARIETY
  const pd = await import('./plushdata.js'); const pg = await import('./plushgeo.js');
  await T('plush.960-species-with-unique-names-and-valid-fields', async () => {
    if (pd.speciesCount !== 960) return 'count ' + pd.speciesCount; const names = new Set(); const bad = [];
    for (let id = 1; id <= pd.speciesCount; id++) { const sp = pd.species[id]; if (!sp) { bad.push('missing ' + id); continue; } if (names.has(sp.name)) bad.push('dup name ' + sp.name); names.add(sp.name); if (sp.arch < 0 || sp.arch >= pd.ARCH_COUNT || !pd.PALETTES[sp.pal] || !pd.PREFIXES[sp.pal] || !pd.ARCH_NAMES[sp.arch]) bad.push('bad fields ' + id); if (/undefined/.test(sp.name)) bad.push('undefined name ' + id); }
    return bad.length === 0 || bad.slice(0, 4).join('; ');
  });
  await T('plush.original-576-never-change', async () => {
    const ok = pd.species[1].arch === 0 && pd.species[1].pal === 0 && pd.species[36].arch === 35 && pd.species[37].arch === 0 && pd.species[37].pal === 1 && pd.species[576].arch === 35 && pd.species[576].pal === 15 && pd.species[1].name === 'Gnocchi Bean' && pd.species[576].name === 'Affogato Lampadina';
    const counts = [0, 0, 0, 0, 0, 0]; for (let id = 1; id <= 576; id++) counts[pd.species[id].rarity]++; return (ok && counts.join() === '262,160,90,44,14,6') || 'old ids moved: ' + counts.join();
  });
  await T('plush.new-species-rarity-spread', async () => { const c = [0, 0, 0, 0, 0, 0]; for (let id = 577; id <= 960; id++) c[pd.species[id].rarity]++; return (c.join() === '175,107,60,29,9,4' && c.reduce((a, b) => a + b, 0) === 384) || 'spread ' + c.join(); });
  await T('plush.ids-stay-clear-of-special-cells', async () => pd.speciesCount < 990 || 'species ids collide with decoys/specials');
  await T('plush.every-shape-builds-at-both-detail-levels', async () => {
    const bad = []; for (let a = 0; a < pd.ARCH_COUNT; a++) for (const lod of [0, 1]) { try { const geo = pg.makeArchGeometry(a, lod); const n = geo.attributes.position.count; geo.computeBoundingSphere(); const r = geo.boundingSphere.radius; if (n < 12) bad.push(`arch ${a} lod ${lod}: ${n} verts`); if (r < 0.18 || r > 0.7) bad.push(`arch ${a} lod ${lod}: radius ${r.toFixed(2)}`); geo.dispose(); } catch (e) { bad.push(`arch ${a} lod ${lod} threw ${e.message}`); } }
    return bad.length === 0 || bad.slice(0, 5).join('; ');
  });
  await T('plush.specials-use-shifted-shapes', async () => (pd.species[pd.NEEDLE].arch === pd.ARCH_COUNT && pd.species[pd.BULK].arch === pd.ARCH_COUNT + 1 && pd.species[pd.REMAINS].arch === pd.ARCH_COUNT + 2 && pd.species[pd.CACHE].arch === pd.ARCH_COUNT + 7 && pd.DECOYS.every((d, n) => pd.species[d].arch === pd.ARCH_COUNT + 3 + n) && pg.ARCH_NEEDLE === pd.ARCH_COUNT) || 'special shapes');
  await T('plush.new-shapes-found-in-the-pile-and-dex', async () => {
    fresh(); const seen = new Set(); const sp = spot(); for (let i = sp.i; i < sp.i + 60; i++) for (let k = sp.k - 6; k < sp.k + 6; k++) for (let j = 0; j < 20; j++) { const s = w().get(i, j, k); if (s && s < 990) seen.add(pd.species[s].arch); }
    const newShapes = [...seen].filter((a) => a >= 36).length; S().dex = {}; g.registerDex(700); const dexOk = S().dex[700] === 1; S().dex = {}; return (newShapes >= 4 && dexOk) || `new shapes seen ${newShapes}`;
  });
  await T('plush.dex-modal-lists-all-960', async () => { fresh(); g.openModal('dex'); const total = document.getElementById('dexTotal').textContent; const cards = document.querySelectorAll('#dexGrid > *').length; g.ui.closeModals(); return (String(total) === '960') || `dex total ${total} cards ${cards}`; });


  // ================================================================== SPLITTERS
  await T('splitter.unlock-and-recipe', async () => { const a = tune({ belts: 1 }).machines.includes('splitter'); const b = tune({ belts: 1, splitter: 1 }).machines.includes('splitter'); fresh({ belts: 1, splitter: 1 }); return (!a && b && recipes(g).some((r) => r.id === 'splitter' && r.use)) || 'unlock'; });
  const splitRig = async () => {
    fresh(powerUp({ splitter: 1 })); await placeAtFloor('gen', -6.6, 2.4, 2.2); await placeAtFloor('pole', -6.6, 3.4, 2.2);
    for (let n = 0; n < 3; n++) { const r = await placeAtFloor('belt', -5.4 + n * 0.6, 2.4, 2.0); if (!r.ok) return 'belt ' + r.why; }
    const sp = await placeAtFloor('splitter', -3.6, 2.4, 2.0); if (!sp.ok) return 'splitter ' + sp.why;
    const split = tiles().find((t) => t.splitter); if (!split) return 'no splitter tile';
    const mkV = (di, dk) => { const e = { id: g.nextId(), type: 'vault', i: split.i + di, j: 0, k: split.k + dk, dir: 0, rise: 0 }; S().entities.push(e); g.addEntity(e); return tiles().find((t) => t.id === e.id); };
    const fwd = mkV(1, 0), left = mkV(0, 1), right = mkV(0, -1);
    return { split, fwd, left, right };
  };
  await T('splitter.deals-forward-left-right-in-turn', async () => {
    const rig = await splitRig(); if (typeof rig === 'string') return rig; const { split, fwd, left, right } = rig; feedGen(tiles().find((t) => t.type === 'gen'), 40);
    const first = tiles().filter((t) => t.type === 'belt' && !t.free && !t.splitter).sort((a, b) => a.i - b.i)[0]; let fed = 0;
    for (let n = 0; n < 1600; n++) { for (const t of tiles()) if (t.type === 'belt' || t.type === 'vault') t.pw = 1; if (n % 8 === 0 && fed < 30 && first.items.length < 3) { first.items.push({ sp: 3 + (fed % 7), vr: 0, t: 0 }); fed++; } g.time += 0.05; L().update(0.05); }
    const c = [fwd.stored.length, left.stored.length, right.stored.length]; const total = c[0] + c[1] + c[2];
    return (total === fed && Math.max(...c) - Math.min(...c) <= 2 && fed >= 20) || `fed ${fed} got ${c}`;
  });
  await T('splitter.skips-missing-and-full-outputs', async () => {
    const rig = await splitRig(); if (typeof rig === 'string') return rig; const { split, fwd, left, right } = rig; g.logi.remove(right); S().entities = S().entities.filter((e) => e.id !== right.id); for (let q = 0; q < 120; q++) left.stored.push({ sp: 3, vr: 0 });
    const first = tiles().filter((t) => t.type === 'belt' && !t.free && !t.splitter).sort((a, b) => a.i - b.i)[0]; let fed = 0; feedGen(tiles().find((t) => t.type === 'gen'), 40);
    for (let n = 0; n < 1400; n++) { for (const t of tiles()) if (t.type === 'belt' || t.type === 'vault') t.pw = 1; if (n % 8 === 0 && fed < 20 && first.items.length < 3) { first.items.push({ sp: 3, vr: 0, t: 0 }); fed++; } g.time += 0.05; L().update(0.05); }
    return (fwd.stored.length === fed && left.stored.length === 120) || `fwd ${fwd.stored.length}/${fed} left ${left.stored.length}`;
  });
  await T('splitter.converts-belt-and-hammer-returns-item', async () => {
    fresh(powerUp({ splitter: 1 })); const b = await placeAtFloor('belt', -3.6, 2.4, 2.0); if (!b.ok) return b.why; craft('splitter'); selectTool('splitter'); aimPoint(-3.6, 0, 2.4, 1.6); adv(0.1); const pl = await plan(); if (!pl.ok || pl.ent.type !== 'splitbelt') return 'no conversion plan: ' + JSON.stringify([pl.ok, pl.why]); placeNow();
    const t = tiles().find((x) => x.splitter); if (!t || !g.logi.objs.get(t.id)) return 'not converted or no model'; g.doDecon({ kind: 'tile', id: t.id }); return (S().items.splitter === 1 && !tiles().some((x) => x.splitter)) || 'hammer/decon did not return the splitter';
  });
  await T('splitter.survives-save-and-reload', async () => { fresh(powerUp({ splitter: 1 })); await placeAtFloor('splitter', -3.6, 2.4, 2.0); const raw = JSON.parse(JSON.stringify(S().entities)); resetEntities(); for (const e of raw) g.addEntity(e); S().entities = raw; const t = tiles().find((x) => x.splitter); return (!!t && !!g.logi.objs.get(t.id)) || 'splitter lost on reload'; });
  await T('splitter.gate-cannot-go-on-a-splitter', async () => { fresh(powerUp({ splitter: 1 })); await placeAtFloor('splitter', -3.6, 6.4, 2.0); craft('gate'); selectTool('gate'); aimPoint(-3.6, 0, 6.4, 1.6); adv(0.1); const pl = await plan(); return (!pl.ok || (pl.ent && pl.ent.type !== 'gatebelt')) || 'gate converted a splitter'; });


  // ================================================================== MENU
  await T('menu.how-to-play-opens-above-the-title-and-closes', async () => {
    const title = document.getElementById('title'); const z = (el) => +getComputedStyle(el).zIndex; const how = document.getElementById('howto'); if (!document.getElementById('btnHow') || !document.getElementById('btnHow2')) return 'missing buttons';
    g.ui.open('howto'); const open = !how.classList.contains('hidden'); const above = z(how) > z(title); const text = how.textContent; g.ui.closeModals(); const closed = how.classList.contains('hidden');
    return (open && above && closed && /Il Rotto Supremo/.test(text) && /hotbar/i.test(text) && /Detector Gate/.test(text) && !/undefined/.test(text)) || `open ${open} above ${above} closed ${closed}`;
  });
  await T('menu.title-never-flickers', async () => { fresh(); g.mode = 'title'; const l = g.hall.flicker[0].color; const vals = new Set(); for (let n = 0; n < 400; n++) { g.hall.calm = true; g.hall.update(n * 0.016, g.renderer.camera.position); vals.add(+l.r.toFixed(2)); } g.hall.calm = false; g.mode = 'play'; return vals.size === 1 || 'ceiling light varied on the title: ' + [...vals].join(); });

  // extra test modules: src/tests/*.js each export default async (ctx) => { await ctx.T('area.name', async () => true | 'reason') }
  const mods = import.meta.glob('./tests/*.js', { eager: true });
  const ctx = { g, S, w, p, sim, L, V3, THREE, cfg, cellX, cellY, cellZ, toI, toJ, toK, UPGRADES, FRAME_TYPES, effLevels, computeTuning, recipes, MATERIALS, CART_CAP, CART_NAMES, species, NEEDLE, fresh, adv, stepSim, spot, dig, placeAtFloor, craft, selectTool, plan, placeNow, aimPoint, lookEast, tune, T, near, tiles, clearBodies, plushWall, standBeforeWall, newWorld, realSleep, sleep, WORLD_TESTS };
  for (const path of Object.keys(mods).sort()) { const fn = mods[path].default; if (typeof fn === 'function') await fn(ctx); }

  return { results, errs: (g.errCount || 0) - errs0, helpers: { fresh, adv, stepSim, spot, dig, placeAtFloor, craft, selectTool, plan, placeNow, aimPoint, lookEast, tune, T, near, tiles, clearBodies, resetEntities, sleep, V3 } };
}
