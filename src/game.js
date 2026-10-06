import * as THREE from 'three';
import { C, NX, NY, NZ, RC, HALL_HX, HALL_HZ, HALL_H, EXIT_X, cellX, cellY, cellZ, toI, toJ, toK, idx } from './config.js';
import { mulberry32, h32 } from './util.js';
import { World } from './world.js';
import { Sim } from './sim.js';
import { Player } from './player.js';
import { Renderer, cellPose } from './render.js';
import { buildHall } from './hall.js';
import { FX } from './fx.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { Machines } from './machines.js';
import { Logistics, LOGI } from './logistics.js';
import { Power } from './power.js';
import { Contracts } from './contracts.js';
import { Crew } from './crew.js';
import { Radio } from './radio.js';
import { recipes, craft, craftGear, gearRecipes } from './crafting.js';
import { ghostify } from './machines.js';
import { Dust } from './dust.js';
import { U } from './shaders.js';
import { newState, saveGame, loadSaved, applyDiff, clearSave } from './state.js';
import { UPGRADES, FRAME_TYPES, GEAR, computeTuning, effLevels, upgradeById, isUnlocked } from './upgrades.js';
import { Cart, CART_CAP } from './cart.js';
import { ACHIEVEMENTS } from './achievements.js';
import { RARITY, species, pools, NEEDLE, BULK, REMAINS, CACHE, isSpecialCell, PALETTES, sellValue } from './plushdata.js';
import { makeWorker, noteFor, rewardFor, applyBoost, describeBoosts } from './remains.js';
import { speciesIcon, needleFrames } from './icons.js';
import { clamp, lerp, fmt, compaction } from './util.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const ARCH_PITCH = { 18: 0.55, 16: 0.65, 15: 0.8, 17: 0.85, 2: 0.8, 3: 0.75, 8: 0.7, 12: 1.15, 13: 1.3, 11: 1.35, 20: 1.2, 35: 1.4, 14: 1.1, 32: 1.25, 33: 1.3, 30: 1.5, 9: 0.9, 22: 0.85, 24: 1.2 };
const START_POS = [0.0, 0.0, -1.4];

export class Game {
  constructor() {
    this.canvas = $('game');
    this.ui = new UI();
    this.ui.bind(this);
    this.sound = new Sound();
    this.keys = {};
    this.mouse = { l: false, r: false };
    this.mode = 'loading'; // loading | title | play | ended
    this.time = 0;
    this.tool = 0;
    this.tools = [];
    this.fliers = [];
    this.grab = { key: '', p: 0, latch: false };
    this.shake = 0;
    this.streak = { n: 0, t: 0 };
    this.heldPop = 0;
    this.camSky = 1;
    this.hudT = 0;
    this.saveT = 0;
    this.achT = 0;
    this.termT = 0;
    this.stressT = 0;
    this.throwCd = 0;
    this.coinCd = 0;
    this.collapseT = 99;
    this.recallHold = 0;
    this.lastBuried = false;
    this.dustCd = 0;
    this.impactCd = 0;
    this.unstuckHint = false;
    this.endTimer = 0;
    this.freeLook = { yaw: 0, pitch: 0 };
    this.titleT = 0;
  }

  // ======================= boot =======================
  async boot() {
    const saved = loadSaved();
    this.saved = saved;
    const quality = saved?.S?.settings?.quality || 'high';
    await this.setLoading('Stacking plush…');
    this.S = saved ? saved.S : newState((Math.random() * 4294967296) >>> 0);
    this.initCore(quality);
    await this.setLoading('Placing a few million plush…');
    this.loadWorld(this.S, saved);
    $('loading').classList.add('hidden');
    this.mode = 'title';
    if (saved) $('btnContinue').classList.remove('hidden');
    this.wireUI();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  setLoading(txt) {
    $('loadTxt').textContent = txt;
    return new Promise((r) => setTimeout(r, 30));
  }

  initCore(quality) {
    // Renderer needs a world for chunk scans; create a placeholder world lazily in loadWorld.
    this.world = new World(this.S.seed);
    this.renderer = new Renderer(this.canvas, this.world, quality);
    window.__renderer = this.renderer.renderer;
    if (!this.saved) {
      // first run: integrated graphics start on Medium (the frame-rate governor still adapts)
      try {
        const gl = this.renderer.renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
        if (/Intel|Mali|Adreno|llvmpipe|SwiftShader|Microsoft Basic/i.test(name)) { this.renderer.setQuality('medium'); this.S.settings.quality = 'medium'; }
        this.gpuName = name;
      } catch (e) { /* ignore */ }
    }
    this.hall = buildHall(this.renderer.scene);
    this.fx = new FX(this.renderer.scene);
    this.renderer.scene.add(this.camLamp = new THREE.SpotLight(0xfff0d0, 30, 16, 0.55, 0.8, 1.4));
    this.renderer.camera.add(this.camLamp);
    this.camLamp.position.set(0.25, -0.2, 0);
    this.camLamp.target.position.set(0, 0, -5);
    {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 10, 28, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.03, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      cone.geometry.translate(0, -5, 0); cone.geometry.rotateX(Math.PI / 2); cone.position.set(0.25, -0.2, 0);
      cone.frustumCulled = false; cone.renderOrder = 5;
      this.lampCone = cone; this.renderer.camera.add(cone);
    }
    this.renderer.camera.add(this.camLamp.target);
    this.machines = new Machines(this);
    this.logi = new Logistics(this);
    this.power = new Power(this);
    this.dust = new Dust(this);
    this.contracts = new Contracts(this);
    this.crew = new Crew(this);
    this.cart = new Cart(this);
    this.radio = new Radio(this);
    this.rampMode = 0;
    this.T = this.tune();
    this.fx.setScale(window.innerHeight);
    window.addEventListener('resize', () => this.fx.setScale(window.innerHeight));
  }

  loadWorld(S, saved) {
    this.S = S;
    this.world = new World(S.seed);
    if (saved && saved.diff) {
      applyDiff(this.world, saved.diff);
      if (saved.needle) this.world.needle = saved.needle;
    }
    this.renderer.setWorld(this.world);
    this.sim = new Sim(this.world);
    this.sim.colliders = this.hall.colliders.filter((c) => c.r < 1.07 || c.r > 1.09);
    this.sim.bin = { x: this.hall.binPos.x, z: this.hall.binPos.z };
    this.player = new Player(this.world);
    if (saved && saved.loose) for (const b of saved.loose) this.sim.spawn(b[0], b[1], b[2], b[3], b[4], 0, 0, 0, 2);
    this.sim.binCatch = 0;
    this.sim.player = { spheres: () => this.player.spheres(), vel: this.player.vel };
    this.sim.hooks = {
      onBin: (i, x, y, z) => this.onBin(i),
      onImpact: (x, y, z, v) => this.onImpact(x, y, z, v),
      onKick: (i, j, k, vx, vy, vz, sp) => this.onKick(i, j, k, vx, vy, vz, sp),
      onPlayerHit: (v) => this.onPlayerHit(v),
    };
    this.player.events.land = (v) => { this.landDip = Math.min(0.28, v * 0.025); this.treadOn(3.2, true); this.sound.thump(Math.min(0.35, v * 0.04), 110); this.fx.dust(this.player.pos.x, this.player.pos.y + 0.1, this.player.pos.z, 6, 0.8, 1); this.shake = Math.max(this.shake, Math.min(0.5, v * 0.03)); };
    this.player.events.step = (sp) => {
      this.treadOn(1.0 + (sp > 5 ? 0.5 : 0), false);
      if (this.player.pos.y > 0.45) { this.sound.step(0.06 + Math.min(0.06, sp * 0.01)); if (Math.random() < 0.35) this.sound.squeak(0.7 + Math.random() * 0.5, 0.05); }
      else this.sound.stepConcrete(0.05 + Math.min(0.05, sp * 0.01));
    };
    this.machines.clear();
    this.logi.clear();
    this.power.clear();
    this.dust.clear();
    this.crew.clear();
    this.world.onRemove = (i, j, k) => this.dust.add(cellX(i), cellY(j), cellZ(k), 0.006);
    for (const e of S.entities) this.addEntity(e);
    S.boosts = { sell: 0, dig: 0, digMul: 1, carry: 0, stab: 0, scan: 0, ...(S.boosts || {}) };
    S.stats = { ...newState(0).stats, ...(S.stats || {}) };
    if (!Array.isArray(S.stats.rar) || S.stats.rar.length < 7) S.stats.rar = [0, 0, 0, 0, 0, 0, 0];
    if (!S.gear) { S.gear = {}; for (const id of GEAR) S.gear[id] = S.up[id] || 0; }
    if (S.gear.helmet === undefined) S.gear.helmet = 1; // every worker starts with a hard hat, a lamp and a clock
    if (S.gameMin === undefined) S.gameMin = 0;
    S.notes = S.notes || []; S.clues = S.clues || []; S.items = S.items || {}; S.crew = S.crew || []; S.contracts = S.contracts || []; S.entities = S.entities || []; S.carry = S.carry || [];
    this.T = this.tune();
    this.world.stabBonus = this.T.stabBonus;
    this.sim.binCatch = this.T.binCatch;
    this.fliers = [];
    this.grab = { key: '', p: 0, latch: false };
    this.streak = { n: 0, t: 0 };
    const p = S.player;
    if (p) { this.player.pos.set(p.x, p.y, p.z); this.player.yaw = p.yaw; this.player.pitch = p.pitch; } else {
      this.player.pos.set(START_POS[0], 0.0, START_POS[2]); this.player.yaw = Math.PI / 2; this.player.pitch = -0.05;
    }
    this.ui.setMoney(S.money, true);
    this.rebuildTools();
    this.tool = 0;
    this.crew.sync();
    this.cart.sync();
    if (this.T.contractSlots) this.contracts.fill();
    this.ui.setCarry(S.carry, this.T.carry);
    this.sens = S.settings.sens || 1;
    this.sound.setVolume(S.settings.vol ?? 0.7);
    $('selQuality').value = S.settings.quality || 'high';
    $('rngVol').value = S.settings.vol ?? 0.7;
    $('rngSens').value = this.sens;
    this.hall.drawTerminal(S.money);
  }

  // ======================= UI wiring =======================
  wireUI() {
    const start = (isNew) => this.startPlay(isNew);
    $('btnNew').onclick = () => { this.sound.init(); this.sound.resume(); start(true); };
    $('btnContinue').onclick = () => { this.sound.init(); this.sound.resume(); start(false); };
    $('btnResume').onclick = () => this.ui.closeModals();
    $('btnSave').onclick = () => { const ok = this.save(); this.ui.toast(ok ? { icon: '💾', title: 'Saved', text: 'Your shift is safe.' } : { icon: '⚠️', title: 'Save failed', text: 'Browser storage is full.' }); };
    $('btnShop').onclick = () => this.ui.open('shop');
    $('btnDex').onclick = () => this.ui.open('dex');
    $('btnAch').onclick = () => this.ui.open('ach');
    $('btnReset').onclick = () => { if (confirm('Abandon this shift and start a new warehouse? Your progress will be lost.')) { this.ui.closeModalsSilently(); start(true); } };
    $('selQuality').onchange = (e) => { this.S.settings.quality = e.target.value; this.renderer.setQuality(e.target.value); this.fx.setScale(window.innerHeight); };
    $('rngVol').oninput = (e) => { this.S.settings.vol = +e.target.value; this.sound.setVolume(+e.target.value); };
    $('rngSens').oninput = (e) => { this.sens = +e.target.value; this.S.settings.sens = this.sens; };
    $('crewAllHome').onclick = () => { this.crewHomeAll(); this.ui.renderCrew(); };
    $('crewAllFollow').onclick = () => { for (const b of this.S.crew || []) this.crew.follow(b); this.ui.renderCrew(); };
    $('btnKeep').onclick = () => { this.ui.hideEnding(); this.mode = 'play'; this.requestLock(); };
    $('btnNew2').onclick = () => { this.ui.hideEnding(); start(true); };

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('mousedown', (e) => this.onMouse(e, true));
    window.addEventListener('mouseup', (e) => this.onMouse(e, false));
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { if (this.mode === 'play' && !this.ui.isModalOpen() && this.tools.length > 1) { this.selectTool(this.buildIdx + (e.deltaY > 0 ? 1 : -1)); } }, { passive: true });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas && this.mode === 'play') {
        const s = 0.0022 * this.sens;
        this.player.yaw -= e.movementX * s;
        this.player.pitch = clamp(this.player.pitch - e.movementY * s, -1.5, 1.5);
      }
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (!locked && this.mode === 'play' && !this.ui.isModalOpen() && !this.suppressPause) this.ui.open('pause');
    });
    this.canvas.addEventListener('click', () => { if (this.mode === 'play' && !this.ui.isModalOpen() && document.pointerLockElement !== this.canvas) this.requestLock(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    window.addEventListener('beforeunload', () => this.save());
  }

  requestLock() {
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  }

  onModalClosed() {
    if (this.mode === 'play') {
      this.suppressPause = false;
      this.requestLock();
    }
  }

  openModal(id) {
    this.suppressPause = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.open(id);
    setTimeout(() => (this.suppressPause = false), 200);
  }

  startPlay(isNew) {
    $('title').classList.add('hidden');
    this.setLoading(isNew ? 'Stacking a fresh warehouse…' : 'Resuming your shift…');
    $('loading').classList.remove('hidden');
    setTimeout(() => {
      if (isNew) {
        clearSave();
        const S = newState((Math.random() * 4294967296) >>> 0);
        S.settings = { ...this.S.settings };
        this.loadWorld(S, null);
      } else if (this.mode === 'title' && !this.S) {
        this.loadWorld(this.saved.S, this.saved);
      }
      {
        const ep = this.player.eyePos(new THREE.Vector3());
        this.renderer.camera.position.copy(ep);
        for (let n = 0; n < 12; n++) this.renderer.updateChunks(ep, 400);
        this.renderer.rebuildInstances(ep, true);
      }
      $('loading').classList.add('hidden');
      $('hud').classList.remove('hidden');
      this.mode = 'play';
      this.S.stats.noPropDeep = this.S.stats.noPropDeep || false;
      this.requestLock();
      this.sound.resume();
      if (isNew) setTimeout(() => this.ui.hint('Look at a plush and tap <kbd>G</kbd> to grab it. Walk near the SORT bin and it sucks your plush in. <kbd>E</kbd> at the desk for upgrades, at the bench to craft.', 12), 800);
      else this.ui.hint('Welcome back to Warehouse 07.', 4);
      if (isNew) setTimeout(() => this.ui.hint('You wear a hard hat with a lamp and a clock. At 19:00 the warehouse closes, a chime sounds, and the lights go out until 07:00.', 11), 14000);
    }, 60);
  }

  save() {
    if (this.mode !== 'play' && this.mode !== 'ended') return;
    const p = this.player;
    this.S.player = { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch };
    const ok = saveGame(this.S, this.world, this.sim);
    if (!ok && !this._saveWarned) { this._saveWarned = true; this.ui.toast({ icon: '⚠️', title: 'Could not save', text: 'Browser storage is full. Your shift will not persist until you free space.', ms: 8000 }); }
    return ok;
  }

  nextId() { return this.S.nextId++; }
  addEntity(ent) { if (LOGI.has(ent.type)) this.logi.add(ent); else this.machines.add(ent); }

  // ======================= input =======================
  onKey(e, down) {
    if (e.repeat && down) { if (e.code === 'Tab') e.preventDefault(); return; }
    if (e.code === 'Tab') e.preventDefault();
    this.keys[e.code] = down;
    if (!down) return;
    if (this.mode !== 'play') return;
    if (this.ui.isModalOpen()) {
      if (e.code === 'Tab' || e.code === 'KeyN' || e.code === 'KeyJ' || e.code === 'KeyL' || e.code === 'KeyV') { if (this.ui.openModal !== 'pause') this.ui.closeModals(); }
      return;
    }
    if (e.code === 'Tab') this.openModal('shop');
    else if (e.code === 'KeyN') this.openModal('dex');
    else if (e.code === 'KeyL') this.openModal('journal');
    else if (e.code === 'KeyV') this.openModal('crew');
    else if (e.code === 'KeyT') this.crewFarmAhead();
    else if (e.code === 'KeyY') this.crewHomeAll();
    else if (e.code === 'KeyG') this.gPress();
    else if (e.code === 'KeyJ') this.openModal('ach');
    else if (e.code.startsWith('Digit')) { const n = +e.code.slice(5) - 1; if (n >= 0 && n < this.tools.length) this.selectTool(n); }
    else if (e.code === 'KeyB') this.bPress();
    else if (e.code === 'BracketRight' || e.code === 'ArrowRight') this.selectTool(this.buildIdx + 1);
    else if (e.code === 'BracketLeft' || e.code === 'ArrowLeft') this.selectTool(this.buildIdx - 1);
    else if (e.code === 'KeyE') this.useKey();
    else if (e.code === 'KeyF') this.toggleLamp();
    else if (e.code === 'KeyZ') this.throwOne();
    else if (e.code === 'KeyQ') { this.stowed = !this.stowed; this.machines.setGhost(null); this.rebuildTools(); this.ui.hint(this.stowed ? 'Build item stowed. <kbd>Q</kbd> brings it back.' : 'Build item ready. <kbd>B</kbd> places it.', 2); }
    else if (e.code === 'KeyX') this.deconstruct();
    else if (e.code === 'KeyU') this.useCart();
    else if (e.code === 'KeyR') {
      this.rampMode = (this.rampMode + 1) % 2;
      this.machines.setGhost(null);
    }
  }

  onMouse() { /* the mouse only looks around; everything is on the keyboard */ }

  // ======================= tools =======================
  // inventory of crafted build items. With an item in hand a green outline shows where it will go; B sets it down.
  rebuildTools() {
    const S = this.S;
    S.items = S.items || {};
    const list = recipes(this).filter((r) => r.kind !== 'cart' && (S.items[r.id] || 0) > 0).map((r) => ({ id: r.id, kind: r.kind, fk: r.fk, ramp: r.ramp, icon: r.icon, label: r.short, count: '×' + S.items[r.id] }));
    // items whose recipe is no longer listed (should not happen) still count
    this.tools = list;
    if (this.buildIdx == null || this.buildIdx >= list.length) this.buildIdx = 0;
    this.ui.setHotbar(list, this.stowed ? -1 : this.buildIdx);
    if (!list.length) this.machines.setGhost(null);
  }
  beaconCost() { return Math.round(4000 * Math.pow(2.6, this.beaconList().length - 1)); }
  genCost() { return Math.round(350 * Math.pow(1.35, this.logi ? this.logi.count('gen') : 0)); }
  sorterCost() { return Math.round(90 * Math.pow(1.18, this.logi ? this.logi.count('sorter') : 0)); }
  mechCost() { return Math.round(2500 * Math.pow(1.55, this.logi ? this.logi.count('mech') : 0)); }
  rigCost() { return Math.round(150 * Math.pow(1.4, this.machines ? this.machines.count('claw') : 0)); }
  borerCost() { return Math.round(3200 * Math.pow(1.7, this.machines ? this.machines.count('borer') : 0)); }
  curTool() { return !this.stowed && this.tools[this.buildIdx] ? this.tools[this.buildIdx] : { kind: 'hands' }; }
  selectTool(n) {
    if (!this.tools.length) return;
    this.buildIdx = (n + this.tools.length) % this.tools.length;
    this.stowed = false;
    this.ui.setHotbar(this.tools, this.buildIdx);
    this.machines.setGhost(null);
    this.sound.tone('sine', 700, 900, 0.05, 0.05);
  }
  giveItem(id, n = 1) { this.S.items[id] = (this.S.items[id] || 0) + n; this.rebuildTools(); }

  tune() { const T = computeTuning(effLevels(this.S), this.S.boosts); if (this.world) this.world.slipMul = 1 - 0.25 * T.climb; return T; }
  recipeList() { return recipes(this); }
  gearList() { return gearRecipes(this); }
  craftGearItem(id) { return craftGear(this, id); }
  craftItem(id, n) { return craft(this, id, n); }

  // ======================= buying =======================
  buy(id) {
    const u = upgradeById(id);
    const lvl = this.S.up[id] || 0;
    if (!u || lvl >= u.max || !isUnlocked(u, this.S.up, this.S)) return false;
    const cost = u.cost[lvl];
    if (this.S.money < cost) { this.sound.error(); return false; }
    this.S.money -= cost;
    this.S.up[id] = lvl + 1;
    this.S.stats.upgrades++;
    this.T = this.tune();
    if (GEAR.includes(id)) this.ui.toast({ icon: '🧰', title: 'Craft it to use it', text: 'This is wearable gear. Take it to the Crafting Table (E) and craft it, then it works.', ms: 7000 });
    if (['timber', 'steel', 'concrete', 'rebar', 'titan', 'carbon', 'plasma', 'voidl', 'neutron', 'horizon'].includes(id)) this.frameIdx = this.T.frames.length - 1;
    this.world.stabBonus = this.T.stabBonus;
    this.sim.binCatch = this.T.binCatch;
    this.crew.sync();
    if (this.T.contractSlots) this.contracts.fill();
    this.ui.setMoney(this.S.money);
    this.ui.toast({ icon: '🛒', title: u.name + (u.max > 1 ? ' ' + (lvl + 1) : ''), text: u.names ? u.names[lvl + 1] : 'Upgrade purchased' });
    this.sound.buy();
    this.rebuildTools();
    this.ui.setCarry(this.S.carry, this.T.carry);
    this.save();
    return true;
  }

  // ======================= core loop =======================
  frame(now) {
    const raw = now - this.last;
    const dt = Math.min(0.05, raw / 1000);
    this.last = now;
    this.perf(raw);
    this.time += dt;
    try {
      if (this.mode === 'title') this.updateTitle(dt);
      else if (this.mode === 'play' || this.mode === 'ended') this.updatePlay(dt);
    } catch (err) { console.error(err); this.errCount = (this.errCount || 0) + 1; this.lastErr = String(err && err.stack || err).slice(0, 600); }
    this.renderer.render(dt, this.time);
    requestAnimationFrame((t) => this.frame(t));
  }

  // frame-time governor: keep the game near 60 fps by trading resolution, and an F3 readout
  perf(raw) {
    if (raw > 250) return; // tab was hidden
    this.msAvg = this.msAvg ? this.msAvg * 0.94 + raw * 0.06 : raw;
    this.perfT = (this.perfT || 0) + raw;
    if (this.keys.F3 && !this._f3) { this._f3 = true; this.showFps = !this.showFps; document.getElementById('fps').classList.toggle('hidden', !this.showFps); }
    if (!this.keys.F3) this._f3 = false;
    if (this.showFps && this.perfT > 400) {
      const r = this.renderer.renderer.info.render;
      document.getElementById('fps').textContent = `${(1000 / this.msAvg).toFixed(0)} fps · ${this.msAvg.toFixed(1)} ms · res ${(this.renderer.dynScale * 100).toFixed(0)}% · ${r.calls} calls · ${(r.triangles / 1e6).toFixed(1)}M tris`;
    }
    if (this.perfT < 1500) return;
    this.perfT = 0;
    if (this.S && this.S.settings && this.S.settings.adaptive === false) return;
    const s = this.renderer.dynScale;
    if (this.msAvg > 19.5 && s > 0.5) this.renderer.setDynScale(s - 0.1);
    else if (this.msAvg < 12.2 && s < 1) this.renderer.setDynScale(s + 0.05);
  }

  updateTitle(dt) {
    this.titleT += dt;
    const cam = this.renderer.camera;
    const a = this.titleT * 0.05;
    cam.position.set(Math.sin(a) * 0.6, 2.4, -2.4);
    _e.set(-0.1, Math.PI / 2 - 0.4 + Math.sin(a * 1.7) * 0.5 + Math.PI, 0);
    // face +x area
    cam.rotation.set(0.12, -Math.PI / 2 + Math.sin(a * 1.3) * 0.55, 0, 'YXZ');
    this.world.stabQueue.length = 0;
    this.renderEnv(dt, cam.position);
    this.renderer.updateChunks(cam.position, 14);
    this.renderer.rebuildInstances(cam.position);
    this.renderer.beginDynamic(); this.renderer.endDynamic();
    this.fx.update(dt);
    this.hall.update(this.time, cam.position);
  }

  renderEnv(dt, camPos) {
    const lo = 0.04 + 0.96 * this.hall.level;
    // sky factor at the camera
    const w = this.world;
    const i = clamp(toI(camPos.x), 0, NX - 1), j = toJ(camPos.y), k = clamp(toK(camPos.z), 0, NZ - 1);
    const top = w.topAt(i, k);
    const sky = j >= top ? 1 : Math.exp(-(top - j - 1) * 0.3);
    this.camSky += (sky - this.camSky) * Math.min(1, dt * 4);
    U.uCamSky.value = this.camSky * lo;
    const cs = 0.12 + 0.88 * this.camSky;
    this.hall.hemi.intensity = 0.55 * cs * lo;
    this.hall.sun.intensity = 1.2 * cs * lo;
    U.uSunColor.value.setRGB(1.05 * lo, 1.1 * lo, 0.95 * lo);
    U.uHemiSky.value.setRGB(0.36 * (0.1 + 0.9 * lo), 0.4 * (0.1 + 0.9 * lo), 0.3 * (0.1 + 0.9 * lo));
    this.renderer.scene.environmentIntensity = 0.28 * cs;
    this.sound.setAmbientMuffle(1 - this.camSky);
    // fog tint dims in tunnels
    const f = this.renderer.scene.fog;
    f.color.copy(U.uFogColor.value).multiplyScalar((0.06 + 0.94 * this.camSky) * lo);
    this.renderer.scene.background.copy(f.color);
  }

  updatePlay(dt) {
    const S = this.S, T = this.T, p = this.player, world = this.world, cam = this.renderer.camera;
    const locked = document.pointerLockElement === this.canvas;
    const modal = this.ui.isModalOpen();
    S.stats.playSecs += dt;
    this.ui.tick(dt);

    // --- input -> player
    const k = this.keys;
    const input = {
      fwd: locked && !modal && k.KeyW ? 1 : 0, back: locked && !modal && k.KeyS ? 1 : 0, left: locked && !modal && k.KeyA ? 1 : 0, right: locked && !modal && k.KeyD ? 1 : 0,
      sprint: !!k.ShiftLeft, jump: !!k.Space && locked && !modal, crouch: !!(k.KeyC || k.ControlLeft) && locked,
    };
    const stats = { walk: T.walk * (this.lungSlow ?? 1), crouchMul: T.crouchMul, jump: T.jump };
    const pb = p.pos.clone();
    if (this.mode === 'play') p.update(dt, input, stats, this.sim);
    S.stats.walked += Math.hypot(p.pos.x - pb.x, p.pos.z - pb.z);

    // --- camera
    const eye = p.eyePos(_v);
    this.landDip = (this.landDip || 0) * Math.exp(-9 * dt);
    eye.y -= this.landDip;
    const wantFov = 74 + (input.sprint && p.speedNow > 3 ? 6 : 0) + Math.min(4, p.speedNow * 0.35);
    if (Math.abs(cam.fov - wantFov) > 0.05) { cam.fov += (wantFov - cam.fov) * Math.min(1, dt * 5); cam.updateProjectionMatrix(); }
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const sh = this.shake * T.shakeMul;
    cam.position.set(eye.x + (Math.random() - 0.5) * sh * 0.12, eye.y + (Math.random() - 0.5) * sh * 0.12, eye.z + (Math.random() - 0.5) * sh * 0.12);
    cam.rotation.set(p.pitch + (Math.random() - 0.5) * sh * 0.02, p.yaw + Math.PI, 0, 'YXZ');
    cam.updateMatrixWorld(true);
    p.forward(_fwd);
    _right.set(-Math.cos(p.yaw) * -1, 0, 0).set(-Math.cos(p.yaw), 0, Math.sin(p.yaw)).multiplyScalar(-1);
    _right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)).multiplyScalar(-1);
    this.renderEnv(dt, cam.position);

    // lamp
    const on = this.lampOn === false ? 0 : 1;
    U.uLampPos.value.copy(cam.position).addScaledVector(_right, -0.0).y -= 0.15;
    U.uLampDir.value.copy(_fwd);
    U.uLampRange.value = T.lampRange;
    U.uLampColor.value.setRGB(2.6, 2.35, 1.9).multiplyScalar(T.lampPower * on);
    this.camLamp.intensity = 22 * T.lampPower * on;
    if (this.lampCone) { this.lampCone.visible = on > 0; this.lampCone.material.opacity = (0.012 + Math.min(1, this.dust.level) * 0.1) * (1.1 - this.camSky * 0.8) * T.lampPower; this.lampCone.scale.set(T.lampRange / 12, T.lampRange / 12, T.lampRange / 12); }
    this.camLamp.distance = T.lampRange + 4;
    // placed lights
    const ls = this.machines.lights(cam.position, 5);
    U.uPtN.value = 1 + ls.length;
    for (let i = 0; i < 6; i++) {
      const L = U.uPt.value[i], Lc = U.uPtCol.value[i];
      if (i === 0) { L.set(this.hall.binPos.x, 1.1, this.hall.binPos.z, 7); Lc.setRGB(1.3, 0.55, 0.15); continue; }
      const e = ls[i - 1];
      if (e) { L.set(e.x, e.y, e.z, 9); Lc.setRGB(2.2, 1.7, 0.9); } else { L.set(0, -999, 0, 1); Lc.setRGB(0, 0, 0); }
    }

    // --- interaction
    if (this.mode === 'play' && locked && !modal) this.interact(dt, cam.position, _fwd);
    else { this.curTargetRef = null; this.ui.setGrab(0, false); this.ui.setTarget(null); this.renderer.setGhost(0); }

    // --- sim
    this.kickBudget = 6;
    this.sim.step(dt);
    world.updateStability(dt, T.warn, {
      onCreak: (x, y, z, n) => this.onCreak(x, y, z, n),
      release: (i, j, k2) => this.releaseCell(i, j, k2),
    });
    this.updateAfters(dt);
    this.settleT = (this.settleT ?? 10) - dt;
    if (this.settleT <= 0) {
      this.settleT = 9 + Math.random() * 20;
      if (this.camSky < 0.25) { this.sound.creak(0.05 + Math.random() * 0.05); if (Math.random() < 0.5) this.fx.dust(cam.position.x + (Math.random() - 0.5) * 2, cam.position.y + 1.2, cam.position.z + (Math.random() - 0.5) * 2, 3, 0.3, 0.3); }
    }
    this.machines.update(dt, this.time);
    this.updateFuses(dt);
    this.updateSurge(dt);
    this.power.update(dt);
    this.logi.update(dt);
    this.crew.update(dt, this.time);
    this.cart.update(dt);
    this.radio.update(dt);
    this.updateClock(dt);
    this.updateGolden(dt);
    this.updateScavenge(dt);
    this.dust.update(dt);
    this.updateAir(dt, cam.position);
    this.sound.setMachines(Math.min(1, this.logi.hum / 12) * (this.camSky * 0.4 + 0.6));
    this.updateFliers(dt);

    // --- timers / HUD
    this.collapseT += dt;
    this.throwCd -= dt; this.coinCd -= dt; this.dustCd -= dt; this.impactCd -= dt;
    this.streak.t -= dt;
    if (this.streak.t <= 0 && this.streak.n) this.streak.n = 0;
    this.ui.setStreak(this.streak.n, this.streak.t / 4.5);
    this.autoDump(dt);
    this.updateHud(dt);

    // --- exit door
    if (this.mode === 'play' && p.pos.x > EXIT_X - 2.0 && Math.abs(p.pos.z) < 2.4 && !S.ending) this.finish('exit');

    // --- world render feed
    this.renderer.updateChunks(cam.position, 5);
    this.renderer.rebuildInstances(cam.position);
    this.feedDynamic(dt, cam.position);
    this.fx.update(dt);
    this.hall.update(this.time, cam.position);

    // --- housekeeping
    this.achT -= dt;
    if (this.achT <= 0) { this.achT = 0.5; this.checkAchievements(); }
    this.termT -= dt;
    if (this.termT <= 0) { this.termT = 1; this.hall.drawTerminal(S.money); }
    this.evictT = (this.evictT || 0) + dt;
    if (this.evictT > 6) {
      this.evictT = 0;
      world.pins = new Set();
      const pin = (x, z) => { world.pins.add(((toK(z) >> 4) * 640) + (toI(x) >> 4)); };
      for (const b of this.S.crew || []) pin(b.x, b.z);
      for (const t of this.logi.tiles.values()) if (t.type === 'mech') pin(cellX(t.i), cellZ(t.k));
      for (const it of this.machines.items.values()) if (it.ent.type === 'borer') pin(it.ent.x, it.ent.z);
      world.evict(toI(p.pos.x), toK(p.pos.z), 130);
    }
    this.kioskT = (this.kioskT || 0) - dt;
    if (this.kioskT <= 0 && Math.hypot(p.pos.x - this.hall.kioskPos.x, p.pos.z - this.hall.kioskPos.z) < 24) {
      this.kioskT = 0.09;
      const fr = needleFrames();
      this.hall.drawKiosk(fr[Math.floor(this.time * 8) % fr.length], this.time);
    }
    this.saveT += dt;
    if (this.saveT > 25) { this.saveT = 0; this.save(); }
    if (this.endTimer > 0) { this.endTimer -= dt; if (this.endTimer <= 0) { this.openEnding(); } }
  }

  // ======================= interaction =======================
  pickCell(o, d, maxD) {
    const w = this.world;
    const R2 = (RC + 0.02) * (RC + 0.02);
    for (let t = 0.12; t <= maxD; t += 0.1) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const ci = toI(x), cj = toJ(y), ck = toK(z);
      let best = null, bd = 1e9;
      for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj, k = ck + dk;
        if (w.get(i, j, k) === 0) continue;
        const d2 = (x - cellX(i)) ** 2 + (y - cellY(j)) ** 2 + (z - cellZ(k)) ** 2;
        if (d2 < R2 && d2 < bd) { bd = d2; best = { i, j, k, t }; }
      }
      if (best) return best;
    }
    return null;
  }

  findTarget(o, d) {
    const T = this.T;
    const cell = this.pickCell(o, d, T.reach);
    const body = this.sim.raycast(o.x, o.y, o.z, d.x, d.y, d.z, cell ? cell.t : T.reach);
    if (body) return { type: 'body', idx: body.i, t: body.t, sp: this.sim.sp[body.i], vr: this.sim.vr[body.i] };
    if (cell) {
      return { type: 'cell', i: cell.i, j: cell.j, k: cell.k, t: cell.t, sp: this.world.get(cell.i, cell.j, cell.k), vr: this.world.getVr(cell.i, cell.j, cell.k) };
    }
    return null;
  }

  targetInfo(tg) {
    const s = species[tg.sp];
    const r = RARITY[s.rarity];
    const shiny = !!(tg.vr & 128);
    let val = tg.sp === CACHE ? 'open it' : tg.sp === REMAINS ? 'search it' : tg.sp === BULK ? 'hold G to take down' : tg.sp === NEEDLE ? 'priceless' : '◈ ' + fmt(this.valueOf(tg.sp, tg.vr, 0));
    return { name: s.name, rarity: r.name, rid: s.rarity, shiny, value: val, volatile: !!s.volatile };
  }

  valueOf(sp, vr, streakN) {
    const T = this.T;
    let v = RARITY[species[sp].rarity].value;
    if (vr & 128) v *= T.shinyMult;
    v *= T.sellMult;
    v *= 1 + (this.S.stats.maxDist || 0) / 200;
    v *= 1 + T.dexBonus * Object.keys(this.S.dex).length;
    if (streakN > 1) v *= 1 + 0.06 * (Math.min(streakN, T.streakCap) - 1);
    return Math.max(1, Math.round(v));
  }

  interact(dt, eye, dir) {
    const T = this.T, S = this.S, tool = this.curTool();
    const G = this.grab;
    const tg = this.findTarget(eye, dir);
    const building = tool.kind !== 'hands';

    this.curTargetRef = tg;
    // outline of the plush you are looking at
    if (tg) {
      this.ui.setTarget(this.targetInfo(tg));
      const sp = species[tg.sp];
      if (tg.type === 'cell') {
        const pose = this._pose || (this._pose = new Float32Array(9));
        cellPose(tg.i, tg.j, tg.k, tg.vr, pose);
        this.renderer.setGhost(tg.sp, pose[0], pose[1], pose[2], pose[3], pose[4], pose[5], pose[6], pose[7], RARITY[sp.rarity].color);
      } else {
        const s = this.sim;
        this.renderer.setGhost(tg.sp, s.x[tg.idx], s.y[tg.idx], s.z[tg.idx], s.q[tg.idx * 4], s.q[tg.idx * 4 + 1], s.q[tg.idx * 4 + 2], s.q[tg.idx * 4 + 3], 1, RARITY[sp.rarity].color);
      }
      this.ui.setCross(true);
    } else { this.ui.setTarget(null); this.renderer.setGhost(0); this.ui.setCross(false); }

    // vacuum burst (tap G once the Plush Vacuum is owned); special targets always use the single grab
    const special = tg && (tg.type === 'body' || tg.sp === BULK || tg.sp === REMAINS || tg.sp === CACHE);
    if (T.vac > 0 && !special) {
      if (this.keys.KeyG && !special) this.vacT = Math.max(this.vacT || 0, 0.3);
      if ((this.vacT || 0) > 0) { this.vacT -= dt; this.runVacuum(dt, eye, dir); } else this.vacAcc = 0;
      this.ui.setGrab(0, false);
    } else {
      // single-plush grab
      const full = !this.storeRoom();
      const key = tg ? (tg.type === 'cell' ? `c${tg.i},${tg.j},${tg.k}` : `b${tg.idx}`) : '';
      if (this.grabWant && !tg) { this.grabWantT += dt; if (this.grabWantT > 0.5) { this.grabWant = false; } }
      else this.grabWantT = 0;
      if (this.holdGrab() && tg && !G.latch) {
        if (full) { this.ui.hint('Hands full. Walk to the SORT bin, or <kbd>Z</kbd> to throw.', 2.5); G.p = 0; this.grabWant = false; }
        else {
          if (key !== G.key) { G.key = key; G.p = Math.min(G.p, 0.15) * 0.5; }
          const rare = 1 + Math.max(0, species[tg.sp].rarity - 1) * 0.12;
          G.p += dt / (T.grabTime * rare * compaction(this.player.pos.x, this.player.pos.z));
          if (this.dustCd <= 0 && Math.random() < 0.3) { this.dustCd = 0.12; this.sound.soft(0.04); }
          if (G.p >= 1) {
            this.collect(tg);
            G.p = 0;
            if (!(T.autoRepeat && this.keys.KeyG)) { this.grabWant = false; if (this.keys.KeyG) G.latch = true; }
          }
        }
        this.ui.setGrab(G.p, true);
      } else {
        G.p = Math.max(0, G.p - dt * 3);
        if (!this.keys.KeyG) G.latch = false;
        this.ui.setGrab(G.p, G.p > 0);
        if (!tg) G.key = '';
      }
    }
    if (building) this.updateBuild(tool, eye, dir);
    else this.machines.showPreview(null, null);

    // proximity hints
    const tp = this.hall.termPos, bp = this.hall.binPos, pp = this.player.pos;
    const dTerm = Math.hypot(pp.x - tp.x, pp.z - tp.z), dBin = Math.hypot(pp.x - bp.x, pp.z - bp.z);
    if (!tg && !building) {
      if (dTerm < 3.2 && !this._termHint) { this._termHint = true; this.ui.hint('<kbd>E</kbd> opens the upgrade terminal. <kbd>Tab</kbd> works anywhere.', 5); }
      if (dBin < 3.2 && S.carry.length && !this._binHint) { this._binHint = true; this.ui.hint('Plush you carry get sucked into the bin when you stand close. <kbd>Z</kbd> throws one in for a streak bonus.', 5); }
    }
  }

  collect(tg, fromVac = false) {
    const S = this.S, T = this.T, w = this.world;
    let item = null, pos;
    if (tg.type === 'cell' && tg.sp === REMAINS) return this.openRemains(tg.i, tg.j, tg.k);
    if (tg.type === 'cell' && tg.sp === CACHE) return this.openCache(tg.i, tg.j, tg.k);
    if (tg.type === 'cell' && tg.sp === BULK) {
      w.setCell(tg.i, tg.j, tg.k, 0, 0);
      w.stabQueue.push({ i: tg.i, j: tg.j, k: tg.k });
      this.giveItem('bulk');
      this.sound.thump(0.15, 150);
      this.fx.dust(cellX(tg.i), cellY(tg.j), cellZ(tg.k), 6, 0.6, 0.6);
      return true;
    }
    if (tg.type === 'cell') {
      const rm = w.removeCell(tg.i, tg.j, tg.k);
      if (!rm) return false;
      item = rm;
      pos = _v2.set(cellX(tg.i), cellY(tg.j), cellZ(tg.k)).clone();
      S.stats.cells++;
      this.loosen(tg.i, tg.j, tg.k, 0.8);
      this.trackDepth();
    } else {
      const s = this.sim;
      item = { sp: s.sp[tg.idx], vr: s.vr[tg.idx] };
      pos = new THREE.Vector3(s.x[tg.idx], s.y[tg.idx], s.z[tg.idx]);
      s.remove(tg.idx);
    }
    this.pickedUp(item, pos);
    if (item.sp === NEEDLE) return true;
    // scoop neighbors
    if (tg.type === 'cell' && T.scoop > 0) {
      let left = T.scoop;
      const near = [];
      for (let dk = -2; dk <= 2; dk++) for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        if (!di && !dj && !dk) continue;
        const i = tg.i + di, j = tg.j + dj, k = tg.k + dk;
        if (!w.get(i, j, k)) continue;
        if (w.solid(i + 1, j, k) && w.solid(i - 1, j, k) && w.solid(i, j + 1, k) && w.solid(i, j - 1, k) && w.solid(i, j, k + 1) && w.solid(i, j, k - 1)) continue;
        near.push([di * di + dj * dj + dk * dk, i, j, k]);
      }
      near.sort((a, b) => a[0] - b[0]);
      for (const [, i, j, k] of near) {
        if (left <= 0 || !this.storeRoom()) break;
        const rm = w.removeCell(i, j, k);
        if (!rm) continue;
        S.stats.cells++;
        this.pickedUp(rm, new THREE.Vector3(cellX(i), cellY(j), cellZ(k)), true);
        left--;
        if (rm.sp === NEEDLE) break;
      }
    }
    return true;
  }

  pickedUp(item, pos, quiet = false) {
    const S = this.S;
    const sp = species[item.sp];
    S.stats.plush++;
    S.stats.rar[sp.rarity]++;
    if (item.vr & 128) S.stats.shiny++;
    this.registerDex(item.sp);
    if (item.sp === NEEDLE) { this.foundNeedle('your hands'); return; }
    const carried = { sp: item.sp, vr: item.vr };
    if (!(!sp.volatile && this.routeToCart(carried, pos))) {
      S.carry.push(carried);
      if (sp.volatile && !quiet) this.lightFuse(carried);
    }
    this.ui.setCarry(S.carry, this.T.carry);
    this.heldPop = 1;
    // flier to the hand
    this.fliers.push({ sp: item.sp, vr: item.vr, from: pos.clone(), t: 0, dur: 0.22, hand: true });
    const pal = PALETTES[sp.pal] ? new THREE.Color(PALETTES[sp.pal][1]) : new THREE.Color(1, 0.9, 0.5);
    this.fx.fluff(pos.x, pos.y, pos.z, pal.r, pal.g, pal.b, quiet ? 3 : 8);
    if (!quiet) { this.sound.pop(0.16); this.sound.squeak((0.8 + sp.rarity * 0.18) * (ARCH_PITCH[sp.arch] || 1), 0.1 + sp.rarity * 0.02); }
    if (sp.rarity >= 2 || (item.vr & 128)) {
      this.sound.tone('sine', 600 + sp.rarity * 120, 900 + sp.rarity * 200, 0.4, 0.08 + sp.rarity * 0.01, 0.05);
      this.fx.sparkle(pos.x, pos.y, pos.z, 10 + sp.rarity * 6, 1, 0.85, 0.4);
      if (sp.rarity >= 3) this.ui.toast({ img: speciesIcon(item.sp), title: `${RARITY[sp.rarity].name}: ${sp.name}`, text: (item.vr & 128) ? 'Shiny variant!' : `Worth ◈ ${fmt(this.valueOf(item.sp, item.vr, 0))}`, cls: 'r' + sp.rarity });
    }
  }

  registerDex(spId) {
    const S = this.S;
    if (!S.dex[spId]) {
      S.dex[spId] = 0;
      if (spId !== NEEDLE) {
        const s = species[spId];
        this.ui.toast({ img: speciesIcon(spId), title: 'New species', text: `${s.name} · ${RARITY[s.rarity].name}`, ms: 3000 });
        this.sound.tone('triangle', 800, 1200, 0.15, 0.06, 0.1);
      }
    }
    S.dex[spId]++;
  }

  runVacuum(dt, eye, dir) {
    const T = this.T, S = this.S, w = this.world;
    this.vacAcc = (this.vacAcc || 0) + dt * T.vacRate;
    if (this.dustCd <= 0) { this.dustCd = 0.08; this.sound.whoosh(0.03); }
    while (this.vacAcc >= 1) {
      this.vacAcc -= 1;
      if (!this.storeRoom()) { this.ui.hint('Full. Walk to the SORT bin, or roll out a cart (<kbd>U</kbd>).', 2); this.vacAcc = 0; return; }
      // find nearest exposed cell in cone
      const reach = T.reach + 1.2;
      const rc = Math.ceil(reach / C);
      const ci = toI(eye.x), cj = toJ(eye.y), ck = toK(eye.z);
      let best = null, bs = 1e9;
      for (let dk = -rc; dk <= rc; dk++) for (let dj = -rc; dj <= rc; dj++) for (let di = -rc; di <= rc; di++) {
        const i = ci + di, j = cj + dj, k = ck + dk;
        const vs = w.get(i, j, k);
        if (!vs || isSpecialCell(vs)) continue;
        const x = cellX(i) - eye.x, y = cellY(j) - eye.y, z = cellZ(k) - eye.z;
        const d = Math.hypot(x, y, z);
        if (d > reach || d < 0.3) continue;
        const cosA = (x * dir.x + y * dir.y + z * dir.z) / d;
        if (cosA < 0.9) continue;
        if (w.solid(i + 1, j, k) && w.solid(i - 1, j, k) && w.solid(i, j + 1, k) && w.solid(i, j - 1, k) && w.solid(i, j, k + 1) && w.solid(i, j, k - 1)) continue;
        const sc = d * (2 - cosA);
        if (sc < bs) { bs = sc; best = { type: 'cell', i, j, k }; }
      }
      if (!best) { this.vacAcc = 0; break; }
      this.collect(best, true);
    }
  }

  throwOne() {
    const S = this.S, T = this.T;
    if (this.throwCd > 0 || !S.carry.length || this.mode !== 'play') return;
    const it = S.carry[S.carry.length - 1];
    this.throwCd = 0.16;
    const p = this.player, cam = this.renderer.camera;
    p.forward(_fwd);
    const o = cam.position;
    const pw = T.throwPower;
    const made = this.sim.spawn(it.sp, it.vr, o.x + _fwd.x * 0.6, o.y + _fwd.y * 0.6 - 0.1, o.z + _fwd.z * 0.6, _fwd.x * pw + p.vel.x * 0.7, _fwd.y * pw + p.vel.y * 0.3 + 1.6, _fwd.z * pw + p.vel.z * 0.7, 1);
    if (made < 0) { this.ui.hint('Too much plush on the floor to throw more.', 2); return; }
    S.carry.pop();
    S.stats.thrown++;
    this.ui.setCarry(S.carry, T.carry);
    this.sound.whoosh(0.12);
    this.heldPop = -0.6;
  }

  toggleLamp() {
    this.lampOn = this.lampOn === false;
    this.sound.tone('square', this.lampOn ? 1500 : 900, this.lampOn ? 1900 : 600, 0.04, 0.07);
    this.ui.hint(this.lampOn ? 'Flashlight on.' : 'Flashlight off.', 1.2);
  }

  holdGrab() { return this.grabWant || !!this.keys.KeyG; }

  // G: tap once to grab what you are looking at (it finishes by itself). With nothing in reach it drops what you carry.
  gPress() {
    const t0 = this.curTargetRef;
    const special = t0 && (t0.type === 'body' || t0.sp === BULK || t0.sp === REMAINS || t0.sp === CACHE);
    if (this.T.vac > 0 && !special) { this.vacT = 1.8; return; }
    if (this.curTargetRef) { this.grabWant = true; this.grabWantT = 0; this.grab.latch = false; return; }
    if (this.S.carry.length) this.dropOne();
  }

  bPress() {
    if (!this.tools.length) { this.ui.hint('Nothing to build with. Craft items at the <b>Crafting Table</b> (<kbd>E</kbd> next to it).', 4); return; }
    if (this.stowed) { this.stowed = false; this.rebuildTools(); return; }
    this.placeCurrent(this.curTool());
  }

  refreshTuning() {
    this.T = this.tune();
    this.world.stabBonus = this.T.stabBonus;
    this.rebuildTools();
    this.ui.setCarry(this.S.carry, this.T.carry);
    this.sim.binCatch = this.T.binCatch;
    this.crew.sync();
    if (this.T.contractSlots) this.contracts.fill();
  }

  layBelt(i, j, k, dir) {
    if (this.logi.tileAt(i, j, k)) return false;
    const b = { id: this.nextId(), type: 'belt', i, j, k, dir, rise: 0, items: [] };
    this.S.entities.push(b);
    this.addEntity(b);
    return true;
  }

  // ---------------- crew commands ----------------
  crewFarmAhead() {
    if (!this.S.crew || !this.S.crew.length) { this.ui.hint('No crew yet. Buy a Scrapper Bot in the terminal.', 3); return; }
    const p = this.player, f = p.forward(_fwd);
    const dir = Math.abs(f.x) > Math.abs(f.z) ? (f.x > 0 ? 0 : 2) : (f.z > 0 ? 1 : 3);
    const n = this.crew.orderAll(dir, p.pos.x, p.pos.y, p.pos.z);
    this.ui.hint(n ? `Crew: ${n} bot${n > 1 ? 's' : ''} sent digging ${['east', 'south', 'west', 'north'][dir]}.` : 'No pile that way within 120 m.', 3);
  }

  crewHomeAll() {
    if (!this.S.crew || !this.S.crew.length) return;
    for (const b of this.S.crew) this.crew.goHome(b);
    this.ui.hint('Crew: heading home.', 2);
  }

  crewCommand(b, d) {
    if (d.d !== undefined) this.crew.order(b, +d.d, b.x, b.y, b.z);
    else if (d.a === 'follow') this.crew.follow(b);
    else if (d.a === 'home') this.crew.goHome(b);
    else if (d.a === 'stay') this.crew.stand(b);
  }

  // does a belt end close enough to the bin or a depot to feed it?
  sinkNear(x, z) {
    const bp = this.hall.binPos;
    if (Math.hypot(x - bp.x, z - bp.z) < 1.9) return true;
    for (const it of this.machines.items.values()) if (it.ent.type === 'beacon' && Math.hypot(x - it.ent.x, z - it.ent.z) < 1.6) return true;
    return false;
  }

  hasGen() { for (const t of this.logi.tiles.values()) if (t.type === 'gen') return true; return false; }

  useTile(t) {
    const T = this.T, S = this.S;
    if (t.type === 'gen') {
      let n = 0;
      for (let q = S.carry.length - 1; q >= 0; q--) {
        const it = S.carry[q];
        if (species[it.sp].rarity <= 2 && t.q.length < T.genBuffer) { t.q.push(S.carry.splice(q, 1)[0]); n++; }
      }
      this.ui.setCarry(S.carry, T.carry); this.power.markDirty();
      this.ui.hint(n ? `Fed ${n} plush to the generator (${t.q.length}/${T.genBuffer}).` : `Generator fuel ${t.q.length}/${T.genBuffer}. It burns Common to Rare plush.`, 3);
      return true;
    }
    if (t.type === 'pole' || t.type === 'fan') { this.ui.hint(`${t.type === 'pole' ? 'Pole' : 'Fan'}: ${(t.pw ?? 0) > 0.05 ? 'powered' : 'no power'} (${Math.round((t.pw ?? 0) * 100)}%)`, 2.5); return true; }
    if (t.type === 'sorter') {
      const modes = 1 + T.sorterTiers + 1;
      t.mode = (t.mode + 1) % modes;
      const last = t.mode === modes - 1;
      t.filter = last ? 0 : t.mode === 0 ? 7 : t.mode;
      const names = ['Sell everything', 'Keep Uncommon+', 'Keep Rare+', 'Keep Epic+', 'Keep Legendary+', 'Keep Mythic+'];
      const label = last ? 'Pass everything (no selling)' : names[t.mode];
      this.ui.hint(`Sorting Box: <b>${label}</b>`, 2.5);
      this.sound.tone('triangle', 600, 900, 0.1, 0.07);
      const o = this.logi.objs.get(t.id), top = o && o.getObjectByName('top');
      if (top) top.material = new THREE.MeshBasicMaterial({ color: last ? new THREE.Color(1.5, 1.5, 1.5) : t.mode === 0 ? new THREE.Color(0.4, 3, 1) : new THREE.Color(RARITY[t.mode].color).multiplyScalar(3) });
      return true;
    }
    if (t.type === 'vault') {
      let n = 0;
      while (t.stored.length && S.carry.length < T.carry) { S.carry.push(t.stored.shift()); n++; }
      this.ui.setCarry(S.carry, T.carry);
      this.ui.hint(n ? `Took ${n} plush from the vault. ${t.stored.length} left.` : t.stored.length ? 'Your hands are full.' : 'The vault is empty.', 2.5);
      return true;
    }
    if (t.type === 'mech') {
      t.off = !t.off;
      this.ui.hint(t.off ? 'Mech parked.' : 'Mech running.', 2);
      return true;
    }
    return false;
  }

  mechDug(it, x, y, z) {
    const S = this.S;
    S.stats.plush++; S.stats.rar[species[it.sp].rarity]++; S.stats.cells++;
    if (it.vr & 128) S.stats.shiny++;
    this.registerDex(it.sp);
    if (it.sp === NEEDLE) this.foundNeedle('a Mech Scooper');
    if (Math.random() < 0.5) this.fx.dust(x, y, z, 2, 0.5, 0.5);
  }

  // ---------------- carts and storage ----------------
  cartDist() { const c = this.S.cart; return c ? Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z) : 1e9; }
  storeRoom() { return this.S.carry.length < this.T.carry || (this.S.cart && this.cartDist() < 9 && this.S.cart.load.length < CART_CAP[this.S.cart.tier]); }

  // plush you grab ride on your cart when it is close, until it is full
  routeToCart(item, pos) {
    const c = this.S.cart;
    if (!c || this.cartDist() > 9 || c.load.length >= CART_CAP[c.tier]) return false;
    c.load.push(item);
    this.fliers.push({ sp: item.sp, vr: item.vr, from: pos.clone(), to: new THREE.Vector3(c.x, c.y + 0.7, c.z), t: 0, dur: 0.3, arc: 0.7 });
    return true;
  }

  useCart() {
    const S = this.S, c = S.cart;
    if (c) {
      const d = this.cartDist();
      if (d > 5) { c.mode = 'follow'; this.ui.hint('Your cart is on its way.', 2); return; }
      c.mode = c.mode === 'follow' ? 'stay' : 'follow';
      this.ui.hint(c.mode === 'follow' ? 'Cart follows you. <kbd>U</kbd> parks it, <kbd>X</kbd> stows it when empty.' : 'Cart parked. <kbd>U</kbd> makes it follow again.', 3);
      this.sound.tone('triangle', 500, 700, 0.08, 0.06);
      return;
    }
    let tier = 0;
    for (let t = 5; t >= 1; t--) if ((S.items['cart:' + t] || 0) > 0) { tier = t; break; }
    if (!tier) { this.ui.hint('No cart. Unlock Carts in the terminal, then craft one at the bench (<kbd>E</kbd>).', 4); return; }
    S.items['cart:' + tier]--;
    if (S.items['cart:' + tier] <= 0) delete S.items['cart:' + tier];
    this.cart.deploy(tier);
    this.sound.place();
    this.ui.hint('Cart out. It follows you and grabbed plush ride on it. Park it near the bin to unload.', 5);
    this.rebuildTools();
  }

  stowCart() {
    const c = this.S.cart;
    if (!c) return false;
    if (c.load.length) { this.ui.hint('Empty the cart first (park it near the bin).', 3); return true; }
    this.giveItem('cart:' + c.tier);
    this.cart.stow();
    this.sound.thump(0.12, 140);
    return true;
  }

  // ======================= the working day =======================
  // 1 game minute = 2 real seconds. The hall is lit from 07:00 to 19:00. At closing there is a chime and then it is dark.
  dayMinute() { return ((7 * 60 + (this.S.gameMin || 0)) % 1440 + 1440) % 1440; }
  isOpen() { const m = this.dayMinute(); return m >= 420 && m < 1140; }

  updateClock(dt) {
    const S = this.S;
    S.gameMin = (S.gameMin || 0) + dt / 2;
    const open = this.isOpen();
    if (this.wasOpen === undefined) this.wasOpen = open;
    if (open !== this.wasOpen) {
      this.wasOpen = open;
      if (open) {
        this.sound.dingDong(true);
        this.ui.toast({ icon: '🌅', title: 'Warehouse open', text: 'Morning shift. The lights come back on.', ms: 6000 });
      } else {
        this.sound.dingDong(false);
        this.ui.toast({ icon: '🌙', title: 'Warehouse closed', text: 'Ding dong. The facility is now closed. The lights go out in a moment. Your helmet lamp is all you have.', ms: 9000 });
        this.closingGrace = 6;
      }
    }
    if (this.closingGrace > 0) this.closingGrace -= dt;
    const lit = (open || this.closingGrace > 0) && !(this.outage > 0);
    const target = lit ? 1 : 0;
    this.lightLevel = this.lightLevel ?? 1;
    const k = Math.min(1, dt * (lit ? 2.5 : 0.9));
    this.lightLevel += (target - this.lightLevel) * k;
    if (Math.abs(this.hall.level - this.lightLevel) > 0.004) this.hall.setLevel(this.lightLevel);
    this._clkT = (this._clkT || 0) - dt;
    if (this._clkT <= 0) { this._clkT = 0.5; this.ui.setClock(this.dayMinute(), open, this.S.gear && this.S.gear.helmet > 0); }
  }

  // ======================= golden hour =======================
  updateGolden(dt) {
    if (this.goldT === undefined) this.goldT = 900 + Math.random() * 900;
    if (this.golden > 0) {
      this.golden -= dt;
      if (this.golden <= 0) { this.golden = 0; this.ui.toast({ icon: '🌟', title: 'Golden Hour is over', text: 'Prices are back to normal.', ms: 3000 }); }
      return;
    }
    this.goldT -= dt;
    if (this.goldT <= 0) {
      this.goldT = 1500 + Math.random() * 1800;
      this.golden = 75;
      this.sound.ach();
      this.ui.toast({ icon: '🌟', title: 'Golden Hour', text: 'Buyers are in a good mood. Everything sells for double for 75 seconds.', ms: 7000 });
    }
  }

  // ======================= scavenger magnet =======================
  updateScavenge(dt) {
    const T = this.T;
    if (!T.scavRange || this.mode !== 'play') return;
    this._scT = (this._scT || 0) - dt;
    if (this._scT > 0) return;
    this._scT = 0.18;
    if (!this.storeRoom()) return;
    const s = this.sim, p = this.player.pos, r2 = T.scavRange * T.scavRange;
    let best = -1, bd = r2;
    for (let i = 0; i < s.n; i++) {
      if (s.sp[i] === NEEDLE && false) continue;
      const d = (s.x[i] - p.x) ** 2 + (s.y[i] - p.y - 0.8) ** 2 + (s.z[i] - p.z) ** 2;
      if (d < bd && s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i] + s.vz[i] * s.vz[i] < 9) { bd = d; best = i; }
    }
    if (best >= 0) this.collect({ type: 'body', idx: best, sp: s.sp[best], vr: s.vr[best] });
  }

  // ======================= supply caches =======================
  openCache(i, j, k) {
    const w = this.world, S = this.S;
    w.setCell(i, j, k, 0, 0);
    w.stabQueue.push({ i, j, k });
    const dist = Math.hypot(cellX(i), cellZ(k));
    const tier = Math.max(0, Math.min(9, Math.floor(Math.log2(1 + dist / 60))));
    const rng = Math.random;
    const roll = rng();
    let text;
    const list = recipes(this).filter((r) => r.kind !== 'cart');
    if (roll < 0.5 && list.length) {
      const r = list[(rng() * list.length) | 0];
      const n = Math.max(1, Math.min(12, Math.round((3 + tier) * (r.price < 50 ? 2 : r.price < 500 ? 1 : 0.4) * (0.6 + rng() * 0.8))));
      S.items[r.id] = (S.items[r.id] || 0) + n;
      this.rebuildTools();
      text = `${n} x ${r.name}`;
    } else if (roll < 0.82) {
      const cash = Math.round(120 * Math.pow(2.5, tier) * (0.6 + rng() * 0.9));
      S.money += cash; S.totalEarned += cash; this.ui.setMoney(S.money); this.ui.gain(cash);
      text = `A coffee can of tokens: ◈ ${fmt(cash)}`;
    } else if (roll < 0.94) {
      const b = S.boosts; const kind = ['sell', 'dig', 'carry'][(rng() * 3) | 0];
      if (kind === 'sell') { b.sell += 0.01; text = 'Neat ledgers: +1% sale price'; }
      else if (kind === 'dig') { b.dig += 0.01; b.digMul *= 0.99; text = 'A worn-out shovel that still works: -1% dig time'; }
      else { b.carry += 1; text = 'A spare strap: +1 carry'; }
      this.refreshTuning();
    } else {
      const n = 6 + tier * 3;
      for (let q = 0; q < n; q++) {
        const rr = Math.min(5, 2 + ((rng() * (1 + tier / 3)) | 0));
        const pool = pools[rr];
        const sp = pool[(rng() * pool.length) | 0];
        this.sim.spawn(sp, (rng() * 127) | 0, cellX(i) + (rng() - 0.5) * 0.4, cellY(j) + 0.4 + q * 0.1, cellZ(k) + (rng() - 0.5) * 0.4, (rng() - 0.5) * 2, 3, (rng() - 0.5) * 2, 0);
      }
      text = `A stash of ${n} good plush spills out`;
    }
    S.stats.caches = (S.stats.caches || 0) + 1;
    this.fx.sparkle(cellX(i), cellY(j), cellZ(k), 18, 1, 0.9, 0.5);
    this.sound.ach();
    this.ui.toast({ icon: '📦', title: 'Supply cache', text, ms: 5000 });
    return true;
  }

  dropOne() {
    const S = this.S, it = S.carry[S.carry.length - 1];
    if (!it) return;
    const cam = this.renderer.camera, p = this.player;
    p.forward(_fwd);
    const belt = this.logi.pick(cam.position, _fwd, 2.8);
    if (belt && (belt.type === 'belt' || belt.type === 'sorter') && this.logi.accept(belt, it, null)) {
      S.carry.pop(); this.ui.setCarry(S.carry, this.T.carry); this.sound.soft(0.08); this.registerDex(it.sp); return;
    }
    const made = this.sim.spawn(it.sp, it.vr, cam.position.x + _fwd.x * 0.7, cam.position.y - 0.45, cam.position.z + _fwd.z * 0.7, _fwd.x * 1.4 + p.vel.x * 0.5, -0.5, _fwd.z * 1.4 + p.vel.z * 0.5, 0);
    if (made < 0) return;
    S.carry.pop();
    this.ui.setCarry(S.carry, this.T.carry);
    this.sound.soft(0.08);
  }

  useKey() {
    {
      const tile = this.logi.pick(this.renderer.camera.position, this.player.forward(_fwd), 3.4);
      if (tile && this.useTile(tile)) return;
    }
    for (const it of this.machines.items.values()) {
      if (it.ent.type === 'beacon' && Math.hypot(it.ent.x - this.player.pos.x, it.ent.z - this.player.pos.z) < 3.2) { this.openModal('travel'); return; }
    }
    { const cp = this.hall.craftPos, pp2 = this.player.pos; if (Math.hypot(pp2.x - cp.x, pp2.z - cp.z) < 3.6) { this.openModal('craft'); return; } }
    {
      const pp = this.player.pos, kp = this.hall.kioskPos;
      if (Math.hypot(pp.x - kp.x, pp.z - kp.z) < 3.0) { this.openModal('dossier'); return; }
    }
    const S = this.S;
    const pp = this.player.pos, tp = this.hall.termPos, bp = this.hall.binPos;
    if (Math.hypot(pp.x - tp.x, pp.z - tp.z) < 3.4) { this.openModal('shop'); return; }
    if (Math.hypot(pp.x - bp.x, pp.z - bp.z) < 3.6) {
      if (S.carry.length) this.sellAll();
      else this.ui.hint('Nothing to sell. Grab some plush first.', 2);
      return;
    }
    this.ui.hint('Nothing to use here.', 1.5);
  }

  sellAll() {
    const S = this.S;
    const items = S.carry.splice(0, S.carry.length);
    this.ui.setCarry(S.carry, this.T.carry);
    const bp = this.hall.binPos;
    items.forEach((it, n) => {
      this.sell(it.sp, it.vr, { dist: 0, streak: true });
      this.fliers.push({ sp: it.sp, vr: it.vr, from: this.renderer.camera.position.clone().add(new THREE.Vector3(0, -0.4, 0)), to: new THREE.Vector3(bp.x, 1.0, bp.z), t: -n * Math.min(0.09, 1.2 / items.length), dur: 0.5, arc: 1.2 });
    });
  }

  // find the nearest place that sucks plush in (bin, depot or an open Sorting Box) within range of a position
  nearestSink(x, y, z, range) {
    const bp = this.hall.binPos;
    let best = null, bd = range;
    const d0 = Math.hypot(x - bp.x, z - bp.z);
    if (d0 < bd) { bd = d0; best = { kind: 'sell', x: bp.x, y: 1.0, z: bp.z }; }
    for (const it of this.machines.items.values()) {
      if (it.ent.type !== 'beacon') continue;
      const d = Math.hypot(x - it.ent.x, z - it.ent.z);
      if (d < bd) { bd = d; best = { kind: 'sell', x: it.ent.x, y: 1.0, z: it.ent.z }; }
    }
    for (const t of this.logi.tiles.values()) {
      if (t.type !== 'sorter' || t.q.length >= 3) continue;
      const d = Math.hypot(x - cellX(t.i), z - cellZ(t.k), (y - t.j * C) * 0.5);
      if (d < bd) { bd = d; best = { kind: 'sorter', ent: t, x: cellX(t.i), y: t.j * C + 0.6, z: cellZ(t.k) }; }
    }
    return best;
  }

  // plush you carry, and plush on your cart, get sucked into whatever is close enough
  autoDump(dt) {
    const T = this.T, S = this.S, pp = this.player.pos;
    this._adT = (this._adT || 0) - dt;
    this._adC = (this._adC || 0) - dt;
    if (S.carry.length && this._adT <= 0) {
      const sink = this.nearestSink(pp.x, pp.y + 1, pp.z, T.autoDump);
      if (sink) {
        const it = S.carry[S.carry.length - 1];
        if (sink.kind === 'sell' || this.logi.accept(sink.ent, it, null)) {
          S.carry.pop(); this.ui.setCarry(S.carry, T.carry);
          if (sink.kind === 'sell') this.sell(it.sp, it.vr, { dist: 0, streak: true });
          const cam = this.renderer.camera.position;
          this.fliers.push({ sp: it.sp, vr: it.vr, from: new THREE.Vector3(cam.x, cam.y - 0.5, cam.z), to: new THREE.Vector3(sink.x, sink.y, sink.z), t: 0, dur: 0.36, arc: 0.7 });
          this.heldPop = -0.5;
          this._adT = Math.max(0.05, 0.14 - S.carry.length * 0.004);
        } else this._adT = 0.2;
      }
    }
    const c = S.cart;
    if (c && c.load.length && this._adC <= 0) {
      const sink = this.nearestSink(c.x, c.y + 0.5, c.z, Math.max(3.2, T.autoDump * 0.8));
      if (sink) {
        const it = c.load[c.load.length - 1];
        if (sink.kind === 'sell' || this.logi.accept(sink.ent, it, null)) {
          c.load.pop();
          if (sink.kind === 'sell') this.sell(it.sp, it.vr, { dist: 0, streak: true });
          this.fliers.push({ sp: it.sp, vr: it.vr, from: new THREE.Vector3(c.x, c.y + 0.7, c.z), to: new THREE.Vector3(sink.x, sink.y, sink.z), t: 0, dur: 0.4, arc: 0.9 });
          this._adC = Math.max(0.04, 0.1 - c.load.length * 0.0004);
        } else this._adC = 0.25;
      }
    }
  }

  // ======================= selling =======================
  onBin(i) {
    const s = this.sim;
    const sp = s.sp[i], vr = s.vr[i];
    if (sp === NEEDLE) { this.registerDex(sp); this.foundNeedle('the SORT bin'); return; }
    const dist = s.flag[i] === 1 ? Math.hypot(s.ox[i] - this.hall.binPos.x, s.oz[i] - this.hall.binPos.z) : 0;
    this.sell(sp, vr, { dist, streak: true, bonus: s.flag[i] === 1 });
  }

  sell(sp, vr, opt = {}) {
    const S = this.S;
    if (opt.streak) {
      if (this.streak.t > 0) this.streak.n++; else this.streak.n = 1;
      this.streak.t = 4.5;
      S.stats.bestStreak = Math.max(S.stats.bestStreak, this.streak.n);
    }
    let v = this.valueOf(sp, vr, opt.streak ? this.streak.n : 0);
    if (this.golden > 0) { v *= 2; S.stats.goldenSales = (S.stats.goldenSales || 0) + 1; }
    let swish = false;
    if (opt.dist >= 8) { v = Math.round(v * (1 + Math.min(0.6, opt.dist / 40))); swish = true; S.stats.bestSwish = Math.max(S.stats.bestSwish, opt.dist); }
    S.money += v;
    S.totalEarned += v;
    S.stats.sold++;
    this.contracts.onSale(sp, vr);
    this.ui.setMoney(S.money);
    this.ui.gain(v);
    const bp = this.hall.binPos;
    if (this.coinCd <= 0) { this.coinCd = 0.04; this.sound.coin(this.streak.n); }
    if (swish) this.sound.swish();
    this.fx.coin(bp.x, 1.2, bp.z, Math.min(6, 1 + Math.floor(Math.log10(v + 1) * 2)));
    this.fx.burst(bp.x, 1.1, bp.z, 4, 1, 0.55, 0.15, 2.5, 0.07, 0.6);
    if (swish && opt.dist >= 12) this.ui.hint(`Swish! ${opt.dist.toFixed(0)} m shot.`, 2);
  }

  sellAuto(sp, vr, mult = 1) {
    const S = this.S;
    const v = Math.max(1, Math.round(this.valueOf(sp, vr, 0) * mult * (this.golden > 0 ? 2 : 1)));
    S.money += v; S.totalEarned += v; S.stats.sold++;
    this.contracts.onSale(sp, vr);
    this.ui.setMoney(S.money); this.ui.gain(v);
    if (this.coinCd <= 0) { this.coinCd = 0.12; this.sound.coin(0); }
  }

  // ======================= fliers =======================
  updateFliers(dt) {
    const bp = this.hall.binPos;
    for (let i = this.fliers.length - 1; i >= 0; i--) {
      const f = this.fliers[i];
      f.t += dt;
      if (f.t >= f.dur) {
        this.fliers.splice(i, 1);
      }
    }
    void bp;
  }

  rigPluck(taken, x, y, z, ent) {
    const S = this.S;
    S.stats.plush++; S.stats.rar[species[taken.sp].rarity]++; S.stats.cells++;
    if (taken.vr & 128) S.stats.shiny++;
    this.registerDex(taken.sp);
    if (taken.sp === NEEDLE) { this.foundNeedle('a Claw Rig'); return; }
    const bp = this.hall.binPos;
    this.sellAuto(taken.sp, taken.vr, 1);
    this.fliers.push({ sp: taken.sp, vr: taken.vr, from: new THREE.Vector3(x, y, z), to: new THREE.Vector3(bp.x, 1.0, bp.z), t: 0, dur: 0.9 + Math.hypot(x - bp.x, z - bp.z) * 0.03, arc: 3 + Math.hypot(x - bp.x, z - bp.z) * 0.12 });
    this.fx.dust(x, y, z, 3, 0.6, 0.8);
    void ent;
  }

  borerEat(taken, x, y, z) {
    const S = this.S;
    S.stats.plush++; S.stats.rar[species[taken.sp].rarity]++; S.stats.cells++;
    if (taken.vr & 128) S.stats.shiny++;
    this.registerDex(taken.sp);
    if (taken.sp === NEEDLE) { this.foundNeedle('a Tunnel Borer'); return; }
    this.sellAuto(taken.sp, taken.vr, 1);
  }

  // ======================= building =======================
  updateBuild(tool, eye, dir) {
    const T = this.T, S = this.S;
    let plan = null, cost = 0;
    const yaw = this.player.yaw;
    if (tool.kind === 'frame') { plan = this.machines.planFrame(eye, dir, yaw, tool.fk); cost = FRAME_TYPES[tool.fk].cost; }
    else if (tool.kind === 'lantern') { plan = this.machines.planLantern(eye, dir); cost = 6; }
    else if (['marker', 'flare', 'charge', 'strut'].includes(tool.kind)) { plan = this.machines.planSimple(tool.kind, eye, dir); }
    else if (tool.kind === 'beacon') { plan = this.machines.planBeacon(eye, dir); cost = this.beaconCost(); }
    else if (tool.kind === 'claw') {
      plan = this.machines.planRig(eye, dir); cost = this.rigCost();
      if (plan.ok && this.machines.count('claw') >= T.rigMax) plan = { ok: false, why: `Rig limit reached (${T.rigMax})`, ent: plan.ent };
    } else if (tool.kind === 'borer') {
      plan = this.machines.planBorer(eye, dir, yaw); cost = this.borerCost();
      if (plan.ok && this.machines.count('borer') >= T.borerMax) plan = { ok: false, why: `Borer limit reached (${T.borerMax})`, ent: plan.ent };
    }
    if (['belt', 'sorter', 'vault', 'mech', 'bulk', 'gen', 'pole', 'fan'].includes(tool.kind)) { ({ plan, cost } = this.planLogi(tool, eye, dir, yaw)); }
    this.plan = plan; this.planCost = cost;
    if (['belt', 'sorter', 'vault', 'mech', 'bulk', 'gen', 'pole', 'fan'].includes(tool.kind)) this.showCellGhost(tool, plan);
    else if (plan && plan.ent) this.machines.showPreview(tool, plan); else this.machines.showPreview(null, null);
    if (plan && plan.ok && this.keys.KeyB && (tool.kind === 'belt' || tool.kind === 'bulk')) {
      const key = `${plan.ent.i},${plan.ent.j},${plan.ent.k}`;
      if (key !== this.lastPaint) { this.lastPaint = key; this.placeCurrent(tool); }
    }
    if (!this.keys.KeyB) this.lastPaint = '';
    if (plan) {
      if (!plan.ok) this.ui.hint(plan.why || '', 0.4);
      else this.ui.hint(`<kbd>B</kbd> set down${tool.kind === 'belt' ? ' (hold B to lay a line)' : ''}${tool.ramp ? ' · <kbd>R</kbd> flips up/down' : ''}${tool.kind === 'borer' ? ' · digs the way you face' : ''} · <kbd>Q</kbd> stow`, 0.4);
    }
    this.ui.setCross(plan && plan.ok);
  }

  planLogi(tool, eye, dir, yaw) {
    const T = this.T;
    const rise = tool.ramp ? (this.rampMode % 2 === 1 ? -1 : 1) : 0;
    const kind = tool.kind;
    if (kind === 'bulk') {
      const a = this.logi.aimCell(eye, dir);
      // bulkheads can float: use the exact empty cell in front of the crosshair
      const w = this.world;
      let last = null;
      for (let t = 0.3; t < 5; t += 0.1) {
        const i = toI(eye.x + dir.x * t), j = toJ(eye.y + dir.y * t), k = toK(eye.z + dir.z * t);
        if (eye.y + dir.y * t < 0 || w.solid(i, j, k)) break;
        last = { i, j, k };
      }
      void a;
      if (!last) return { plan: { ok: false, why: 'Aim at an empty cell' }, cost: 10 };
      const p = this.player.pos;
      const near = Math.abs(cellX(last.i) - p.x) < 0.65 && Math.abs(cellZ(last.k) - p.z) < 0.65 && p.y < cellY(last.j) + 0.45 && p.y + 1.75 > cellY(last.j) - 0.3;
      const bad = this.logi.tiles.has(idx(last.i, last.j, last.k)) || near;
      return { plan: { ok: !bad, why: bad ? 'Too close' : null, ent: { type: 'bulk', ...last, dir: 0 } }, cost: 10 };
    }
    const plan = this.logi.plan(kind, eye, dir, yaw, rise);
    let cost = 0; const _unused = kind === 'belt' ? (rise ? 5 : 3) : kind === 'sorter' ? this.sorterCost() : kind === 'vault' ? 140 : kind === 'gen' ? this.genCost() : kind === 'pole' ? 20 : kind === 'fan' ? 240 : this.mechCost();
    if (plan.ok && kind === 'mech' && this.logi.count('mech') >= T.mechMax) { plan.ok = false; plan.why = `Mech limit reached (${T.mechMax})`; }
    return { plan, cost };
  }

  showCellGhost(tool, plan) {
    if (!plan || !plan.ent) { this.machines.setGhost(null); return; }
    const e = plan.ent;
    const key = `${tool.kind}${plan.ok}${e.dir}${e.rise || 0}`;
    if (this.machines.ghostKey !== key) {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: plan.ok ? 0x5dffa0 : 0xff5a4a, transparent: true, opacity: 0.4, depthWrite: false });
      const flat = tool.kind === 'belt';
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.56, flat ? 0.08 : 0.55, 0.56), mat);
      box.position.y = flat ? 0.05 : 0.28;
      if (e.rise) { box.rotation.x = -e.rise * Math.PI / 4; box.position.y += 0.3; box.scale.z = 1.4; }
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 4), mat);
      arrow.rotation.x = Math.PI / 2; arrow.position.set(0, flat ? 0.12 : 0.6, 0.18);
      if (tool.kind !== 'bulk' && tool.kind !== 'vault') g.add(arrow);
      g.add(box);
      g.rotation.y = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][e.dir || 0];
      ghostify(g, plan.ok);
      this.machines.setGhost(g, key);
    }
    const gp = this.machines.ghost;
    if (gp) gp.position.set(cellX(e.i), tool.kind === 'bulk' ? cellY(e.j) - 0.3 : e.j * C, cellZ(e.k));
  }

  placeCurrent(tool) {
    const S = this.S, plan = this.plan;
    const cost = 0;
    if (!plan || !plan.ok) { this.sound.error(); if (plan && plan.why) this.ui.hint(plan.why, 2); return; }
    if (!(S.items[tool.id] > 0)) { this.sound.error(); return; }
    S.items[tool.id]--;
    if (S.items[tool.id] <= 0) delete S.items[tool.id];
    const left = S.items[tool.id] || 0;
    const id = this.nextId();
    let ent;
    const e = plan.ent;
    if (tool.kind === 'bulk') {
      this.world.setCell(e.i, e.j, e.k, BULK, (Math.random() * 127) | 0);
      this.world.stabQueue.push({ i: e.i, j: e.j, k: e.k });
      this.sound.place(); this.S.stats.bulk = (this.S.stats.bulk || 0) + 1;
      this.rebuildTools();
      return;
    }
    if (['belt', 'sorter', 'vault', 'mech', 'gen', 'pole', 'fan'].includes(tool.kind)) {
      ent = { id, type: tool.kind, i: e.i, j: e.j, k: e.k, dir: e.dir, rise: e.rise || 0 };
      S.entities.push(ent);
      this.addEntity(ent);
      this.sound.place();
      if (['sorter', 'mech', 'gen', 'fan'].includes(tool.kind)) this.rebuildTools();
      this.power.markDirty();
      if (!this.hasGen() && ['belt', 'sorter', 'mech'].includes(tool.kind) && !this._pwHint) { this._pwHint = true; this.ui.hint('Machines need power. Build a <b>Generator</b>, feed it commons, and link it with <b>Poles</b>.', 8); }
      S.stats.built = (S.stats.built || 0) + 1;
      this.rebuildTools();
      return;
    }
    if (tool.kind === 'frame') { ent = { id, type: 'frame', kind: e.kind, axis: e.axis, cx: e.cx, cz: e.cz, y0: e.y0, w: e.w, h: e.h }; S.stats.props++; }
    else if (tool.kind === 'lantern') { ent = { id, type: 'lantern', x: e.x, y: e.y, z: e.z }; S.stats.lanterns++; }
    else if (tool.kind === 'marker') { ent = { id, type: 'marker', x: e.x, y: e.y, z: e.z }; }
    else if (tool.kind === 'flare') { ent = { id, type: 'flare', x: e.x, y: e.y, z: e.z, born: S.stats.playSecs }; }
    else if (tool.kind === 'strut') { ent = { id, type: 'strut', x: e.x, y: e.y, z: e.z }; S.stats.props++; }
    else if (tool.kind === 'charge') { ent = { id, type: 'charge', x: e.x, y: e.y, z: e.z, fuse: 6, tier: this.T.charges }; this.ui.hint('Fuse lit. <b>Run.</b>', 3); this.sound.tone('square', 900, 900, 0.05, 0.08); }
    else if (tool.kind === 'beacon') { ent = { id, type: 'beacon', x: e.x, y: e.y, z: e.z, i: e.i, j: e.j, k: e.k }; this.onBeaconPlaced(ent); }
    else if (tool.kind === 'claw') { ent = { id, type: 'claw', x: e.x, y: e.y, z: e.z, ry: Math.random() * 6.28 }; S.stats.rigs++; this.rebuildTools(); }
    else if (tool.kind === 'borer') { ent = { id, type: 'borer', i: e.i, j: e.j, k: e.k, dx: e.dx, dz: e.dz, w: e.w, h: e.h, x: e.x, y: e.y, z: e.z }; S.stats.borers++; this.rebuildTools(); }
    S.entities.push(ent);
    this.machines.setGhost(null);
    this.rebuildTools();
    void left;
    this.machines.add(ent);
    this.sound.place();
    this.shake = Math.max(this.shake, 0.15);
    this.fx.dust(e.cx ?? e.x, (e.y0 ?? e.y) + 0.3, e.cz ?? e.z, 8, 0.7, 0.8);
    if (tool.kind === 'frame') {
      // re-evaluate nearby roof: creaking cells may now be safe
      this.ui.hint('Frame placed. Roofs within reach are stronger now.', 2);
    }
    this.trackDepth();
  }

  deconstruct() {
    // remove the nearest frame/lantern/rig the player is looking toward (refund half)
    const eye = this.renderer.camera.position, dir = this.player.forward(_fwd);
    if (this.S.cart && this.cartDist() < 3.2) { _v2.set(this.S.cart.x - eye.x, this.S.cart.y + 0.5 - eye.y, this.S.cart.z - eye.z); if (_v2.length() < 3.2 && _v2.normalize().dot(dir) > 0.7) { this.stowCart(); return; } }
    const tile = this.logi.pick(eye, dir, 3.6);
    if (tile) {
      this.logi.remove(tile);
      this.S.entities = this.S.entities.filter((x) => x.id !== tile.id);
      const give = [...(tile.items || []), ...(tile.q || []), ...(tile.kept || []), ...(tile.stored || []), ...(tile.buf || [])];
      for (const it of give) if (this.S.carry.length < this.T.carry) this.S.carry.push({ sp: it.sp, vr: it.vr }); else this.sim.spawn(it.sp, it.vr, cellX(tile.i), tile.j * C + 0.5, cellZ(tile.k), 0, 1, 0, 0);
      this.giveItem(tile.type === 'belt' ? (tile.rise ? 'ramp' : 'belt') : tile.type);
      this.ui.setCarry(this.S.carry, this.T.carry);
      this.sound.thump(0.15, 140);
      if (['sorter', 'mech', 'gen', 'fan'].includes(tile.type)) this.rebuildTools();
      this.power.markDirty();
      return;
    }
    let best = null, bd = 3.2;
    for (const it of this.machines.items.values()) {
      const e = it.ent;
      if ((e.type === 'borer' && !e.done) || (e.type === 'frame' && e.auto)) continue;
      const x = e.cx ?? e.x, y = (e.y0 ?? e.y) + (e.h ? e.h / 2 : 0.5), z = e.cz ?? e.z;
      const v = _v2.set(x - eye.x, y - eye.y, z - eye.z);
      const d = v.length();
      if (d > bd) continue;
      if (v.normalize().dot(dir) < 0.9) continue;
      bd = d; best = it;
    }
    if (!best) return;
    const e = best.ent;
    this.giveItem(e.type === 'frame' ? 'frame:' + e.kind : e.type === 'lantern' ? 'lantern' : e.type);
    if (e.type === 'beacon') this.world.reserved.delete((e.j * NZ + e.k) * NX + e.i);
    this.machines.disposeObj(best.obj);
    this.machines.items.delete(e.id);
    this.S.entities = this.S.entities.filter((x) => x.id !== e.id);
    this.world.supports = this.world.supports.filter((s) => s.id !== e.id && s.id !== 'shield' + e.id);
    this.sound.thump(0.15, 120);
    if (e.type === 'claw' || e.type === 'borer') this.rebuildTools();
  }

  // ======================= abandoned gear =======================
  openRemains(i, j, k) {
    const w = this.world, S = this.S;
    w.setCell(i, j, k, 0, 0);
    w.stabQueue.push({ i, j, k });
    const dist = Math.hypot(cellX(i), cellZ(k));
    const worker = makeWorker(h32(i, j, k, S.seed), dist);
    const text = noteFor(worker);
    const rw = rewardFor(worker);
    let rewardText = rw.text;
    if (rw.kind === 'cash') { S.money += rw.amount; S.totalEarned += rw.amount; this.ui.setMoney(S.money); this.ui.gain(rw.amount); rewardText += ` (◈ ${fmt(rw.amount)})`; }
    else if (rw.kind === 'clue') {
      const lvl = Math.max(1, Math.min(4, Math.ceil(worker.tier / 2)));
      const c = this.makeClue(lvl);
      S.clues.push(c);
      rewardText += ' ' + c;
    } else if (rw.kind === 'blueprint') {
      const pool = UPGRADES.filter((u) => ['mine', 'machine', 'hands', 'sort'].includes(u.cat) && (S.up[u.id] || 0) > 0 && (S.up[u.id] || 0) < u.max);
      if (pool.length) { const u = pool[(worker.rng() * pool.length) | 0]; S.up[u.id]++; rewardText += ` (${u.name} +1)`; }
      else { const cash = Math.round(2000 * Math.pow(2.6, worker.tier)); S.money += cash; this.ui.setMoney(S.money); rewardText = `The blueprint is for things you already own. The crew's savings: ◈ ${fmt(cash)}.`; }
    } else applyBoost(S.boosts, rw);
    this.refreshTuning();
    const entry = { name: worker.name, role: worker.role.name, dist, text, reward: rewardText };
    S.notes.push(entry);
    S.stats.remains = (S.stats.remains || 0) + 1;
    this.sound.ach();
    this.fx.sparkle(cellX(i), cellY(j), cellZ(k), 16, 0.7, 0.8, 1);
    this.ui.showNote(entry);
    this.openModal('note');
    return true;
  }

  // ======================= depots, clues =======================
  beaconList() {
    const list = [{ name: 'Sorting Bay 07', x: START_POS[0], y: 0.05, z: START_POS[2] + 0.2, bay: true }];
    const bs = this.S.entities.filter((e) => e.type === 'beacon');
    bs.forEach((e, n) => list.push({ name: `Depot ${String.fromCharCode(65 + (n % 26))}${n >= 26 ? Math.floor(n / 26) : ''}`, x: e.x, y: e.y + 0.05, z: e.z, id: e.id }));
    return list;
  }

  onBeaconPlaced(ent) {
    const d = Math.hypot(ent.x, ent.z);
    const S = this.S;
    S.clueLevel = S.clueLevel || 0;
    S.clues = S.clues || [];
    const thresholds = [250, 900, 1900, 3200];
    while (S.clueLevel < 4 && d >= thresholds[S.clueLevel]) {
      S.clueLevel++;
      const txt = this.makeClue(S.clueLevel);
      S.clues.push(txt);
      this.ui.toast({ icon: '📎', title: 'Old paperwork found', text: txt, ms: 9000 });
    }
    this.ui.hint('Depot online. Press <kbd>E</kbd> on it for fast travel and the terminal. It also sets your recall point.', 6);
  }

  makeClue(level) {
    const n = this.world.needle;
    const x = cellX(n.i), z = cellZ(n.k);
    const bearing = ((Math.atan2(x, -z) * 180 / Math.PI) % 360 + 360) % 360;
    const dist = Math.hypot(x, z);
    const rnd = mulberry32(this.S.seed ^ (level * 7919));
    const half = [70, 35, 15, 6][level - 1];
    const off = (rnd() - 0.5) * half * 0.8;
    const wrap = (a) => String(Math.round(((a % 360) + 360) % 360)).padStart(3, '0');
    const lo = wrap(bearing + off - half), hi = wrap(bearing + off + half);
    const band = [0, 500, 200, 70][level - 1];
    const dm = Math.round((dist + (rnd() - 0.5) * band * 0.6) / 10) * 10;
    if (level === 1) return `Row ledger: the prize lot was shelved between bearing ${lo}° and ${hi}° from Bay 07.`;
    if (level === 2) return `Forklift log: a gold crate went out along bearing ${lo}° to ${hi}°, roughly ${(dm - band / 2).toFixed(0)} to ${(dm + band / 2).toFixed(0)} m.`;
    if (level === 3) return `Shift memo: aisle sweep found the gold crate wedged ${(dm - band / 2).toFixed(0)}-${(dm + band / 2).toFixed(0)} m out, bearing ${lo}° to ${hi}°.`;
    return `Last manifest: the One sits near E ${(x).toFixed(0)}, S ${(z).toFixed(0)} (give or take ${band} m).`;
  }

  renderTravel() {
    const box = document.getElementById('travelList');
    document.getElementById('travelMoney').textContent = fmt(this.S.money);
    const p = this.player.pos;
    box.innerHTML = '';
    const mk = (title, sub, label, fn, dis) => {
      const row = document.createElement('div'); row.className = 'trow';
      row.innerHTML = `<b>${title}</b><span>${sub}</span><button ${dis ? 'disabled' : ''}>${label}</button>`;
      row.querySelector('button').onclick = fn;
      box.appendChild(row);
    };
    mk('Upgrade terminal', 'Shop from here', 'Open', () => { this.ui.closeModalsSilently(); this.openModal('shop'); }, false);
    for (const b of this.beaconList()) {
      const dist = Math.hypot(b.x - p.x, b.z - p.z);
      const cost = Math.round(dist * 1.2);
      mk(b.name, `${dist.toFixed(0)} m away`, dist < 6 ? 'Here' : `Travel ◈${fmt(cost)}`, () => {
        if (this.S.money < cost) { this.sound.error(); return; }
        this.S.money -= cost; this.ui.setMoney(this.S.money);
        this.teleport(b);
        this.ui.closeModals();
      }, dist < 6 || this.S.money < cost);
    }
  }

  teleport(b) {
    const p = this.player;
    p.pos.set(b.x, b.y + 0.05, b.z + 1.6);
    p.vel.set(0, 0, 0);
    this.sound.whoosh(0.2);
    this.fx.sparkle(b.x, b.y + 1, b.z, 30, 0.5, 1, 0.8);
    this.shake = 0.2;
  }

  // ======================= blasting =======================
  detonate(ent) {
    const w = this.world, S = this.S;
    const tier = ent.tier || 1;
    const R = [0, 3, 4, 5][tier];
    const ci = toI(ent.x), cj = toJ(ent.y + 0.3), ck = toK(ent.z);
    let n = 0;
    for (let dk = -R; dk <= R; dk++) for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const dd = di * di + dj * dj + dk * dk;
      if (dd > R * R) continue;
      const i = ci + di, j = cj + dj, k = ck + dk;
      if (j < 0) continue;
      const it = w.removeCell(i, j, k, true);
      if (!it) continue;
      S.stats.cells++;
      if (n < 140 && this.sim.n < 2200) {
        const l = Math.sqrt(dd) || 1;
        this.sim.spawn(it.sp, it.vr, cellX(i), cellY(j), cellZ(k), di / l * 6, dj / l * 5 + 2, dk / l * 6, 2);
        n++;
      } else {
        this.registerDex(it.sp); this.sellAuto(it.sp, it.vr, 0.5);
      }
    }
    this.fx.burst(ent.x, ent.y + 0.6, ent.z, 70, 1, 0.6, 0.2, 6, 0.14, 1.4);
    this.fx.dust(ent.x, ent.y + 0.6, ent.z, 40, 2.2, 3);
    this.dust.add(ent.x, ent.y + 0.8, ent.z, 1.2);
    const pd = Math.hypot(ent.x - this.player.pos.x, ent.y - this.player.pos.y, ent.z - this.player.pos.z);
    this.sound.rumble(1.6);
    if (pd < 40) this.shake = Math.max(this.shake, Math.min(1.6, 24 / (pd + 4)) * this.T.shakeMul);
    if (pd < R * 0.6 + 2.2) {
      const dx = this.player.pos.x - ent.x, dz = this.player.pos.z - ent.z, l = Math.hypot(dx, dz) || 1;
      this.player.vel.x += dx / l * 7; this.player.vel.z += dz / l * 7; this.player.vel.y += 4;
      this.ui.hurt(0.55); this.dust.lung = Math.min(1.05, this.dust.lung + 0.25);
      this.ui.hint('That was too close.', 3);
    }
    S.stats.blasts = (S.stats.blasts || 0) + 1;
    // loosen everything around the hole
    for (let q = 0; q < 12; q++) w.stabQueue.push({ i: ci + ((Math.random() * 2 - 1) * (R + 2)) | 0, j: cj + ((Math.random() * 2 - 1) * (R + 1)) | 0, k: ck + ((Math.random() * 2 - 1) * (R + 2)) | 0 });
  }

  // ======================= volatile plush =======================
  lightFuse(item) {
    this.fuses = this.fuses || [];
    this.fuses.push({ item, t: 2.4 });
    this.ui.toast({ icon: '🧨', title: 'Fuse lit!', text: 'A Razzo plush is ticking. Throw it (F) or drop it (G) now.', ms: 2600 });
    this.sound.tone('square', 900, 900, 0.05, 0.08);
  }

  updateFuses(dt) {
    if (!this.fuses || !this.fuses.length) return;
    const S = this.S;
    for (let n = this.fuses.length - 1; n >= 0; n--) {
      const f = this.fuses[n];
      const idx2 = S.carry.indexOf(f.item);
      if (idx2 < 0) { this.fuses.splice(n, 1); continue; }
      f.t -= dt;
      f.tick = (f.tick || 0) - dt;
      if (f.tick <= 0) { f.tick = Math.max(0.08, f.t * 0.18); this.sound.tone('square', 1100, 1100, 0.025, 0.06); this.heldPop = 0.4; }
      this.ui.setWarn(`FUSE ${Math.max(0, f.t).toFixed(1)}`);
      if (f.t <= 0) {
        S.carry.splice(idx2, 1); this.fuses.splice(n, 1);
        this.ui.setCarry(S.carry, this.T.carry);
        this.explode(this.player.pos.x, this.player.pos.y + 1, this.player.pos.z);
      }
    }
  }

  explode(x, y, z) {
    const w = this.world;
    this.fx.burst(x, y, z, 50, 1, 0.6, 0.2, 5, 0.12, 1.2);
    this.fx.dust(x, y, z, 24, 1.6, 2.5);
    this.dust.add(x, y, z, 0.5);
    this.sound.rumble(1.2); this.shake = Math.max(this.shake, 1.0 * this.T.shakeMul);
    this.ui.hurt(0.5);
    const ci = toI(x), cj = toJ(y), ck = toK(z);
    for (let dk = -5; dk <= 5; dk++) for (let dj = -4; dj <= 4; dj++) for (let di = -5; di <= 5; di++) {
      if (di * di + dj * dj + dk * dk > 28) continue;
      const i = ci + di, j = cj + dj, k = ck + dk;
      if (!w.get(i, j, k)) continue;
      const s = w.slipChance(i, j, k, 4.5);
      if (s && Math.random() < s.p) { const l = Math.hypot(di, dj, dk) || 1; this.slipCell(i, j, k, di / l * 4, dj / l * 3 + 1, dk / l * 4); }
    }
    this.player.vel.y += 3;
    this.S.stats.boom = (this.S.stats.boom || 0) + 1;
  }

  // ======================= grid surges =======================
  updateSurge(dt) {
    const S = this.S;
    if (this.surgeT === undefined) this.surgeT = 1500 + Math.random() * 1200;
    if (this.outage > 0) {
      this.outage -= dt;
      if (this.outage <= 0) { this.power.outage = false; this.power.markDirty(); this.ui.toast({ icon: '💡', title: 'Power restored', text: 'The grid came back.', ms: 3000 }); }
      return;
    }
    if (!this.hasGen()) return;
    this.surgeT -= dt;
    if (this.surgeT <= 0) {
      this.surgeT = 1800 + Math.random() * 2400;
      this.outage = 40;
      this.power.outage = true; this.power.markDirty();
      this.sound.rumble(0.5);
      this.sound.rumble(0.6);
      this.ui.toast({ icon: '⚡', title: 'Grid surge', text: 'Everything is down for about 40 seconds. The hall lights died too.', ms: 6000 });
      S.stats.surges = (S.stats.surges || 0) + 1;
    }
  }

  // ======================= dust and lungs =======================
  updateAir(dt, head) {
    const T = this.T, d = this.dust, p = this.player;
    const lung = d.breathe(dt, head, T);
    const fogD = 0.024 * (1 + 2.6 * Math.min(1, d.level));
    U.uFogDensity.value = fogD;
    if (this.renderer.scene.fog) this.renderer.scene.fog.density = fogD;
    // drifting haze in the lamp beam
    if (d.level > 0.12 && Math.random() < d.level * dt * 25) {
      p.forward(_fwd);
      const r = 1.5 + Math.random() * 5;
      this.fx.haze(head.x + _fwd.x * r + (Math.random() - 0.5) * 2, head.y + _fwd.y * r + (Math.random() - 0.5), head.z + _fwd.z * r + (Math.random() - 0.5) * 2, Math.min(0.35, d.level * 0.5));
    }
    this.lungSlow = lung > 0.6 ? 1 - 0.45 * Math.min(1, (lung - 0.6) / 0.4) : 1;
    if (lung > 0.32) {
      d.coughT -= dt;
      if (d.coughT <= 0) {
        d.coughT = 2.5 + Math.random() * 4 * (1.3 - lung);
        this.sound.cough();
        this.shake = Math.max(this.shake, 0.22 * T.shakeMul);
        p.vel.x *= 0.3; p.vel.z *= 0.3;
        this.ui.hurt(0.12);
        if (!this._coughHint) { this._coughHint = true; this.ui.hint('Dust is getting in your lungs. Get to clean air, run a <b>Vent Fan</b>, or buy a <b>Respirator</b>.', 8); }
      }
    }
    if (lung >= 1 && this.mode === 'play' && !this.blacking) this.blackout();
  }

  blackout() {
    this.blacking = true;
    this.ui.blackout(true);
    this.sound.thump(0.3, 70);
    setTimeout(() => {
      const S = this.S;
      for (const it of S.carry.splice(0, S.carry.length)) this.sim.spawn(it.sp, it.vr, this.player.pos.x + (Math.random() - 0.5), this.player.pos.y + 1, this.player.pos.z + (Math.random() - 0.5), 0, 2, 0, 0);
      this.ui.setCarry(S.carry, this.T.carry);
      this.dust.lung = 0.35;
      this.recall();
      this.ui.toast({ icon: '😵', title: 'You passed out', text: 'Dust. You woke up at the nearest depot. Whatever you carried spilled in the tunnel.', ms: 7000 });
      this.S.stats.passedOut = (this.S.stats.passedOut || 0) + 1;
      setTimeout(() => { this.ui.blackout(false); this.blacking = false; }, 700);
    }, 1100);
  }

  // ======================= slope physics =======================
  slipCell(i, j, k, vx = 0, vy = 0, vz = 0) {
    if (this.sim.n > 2200) return false;
    const it = this.world.removeCell(i, j, k, true);
    if (!it) return false;
    this.sim.spawn(it.sp, it.vr, cellX(i), cellY(j), cellZ(k), vx, vy, vz, 2);
    if (Math.random() < 0.4) this.fx.dust(cellX(i), cellY(j), cellZ(k), 2, 0.5, 0.6);
    return true;
  }

  // pulling plush out or standing on a slope loosens its neighbors, which then slide
  loosen(i, j, k, strength) {
    const w = this.world;
    for (let n = 0; n < 5; n++) {
      const a = n === 0 ? 1 : n === 1 ? -1 : 0, b = n === 2 ? 1 : n === 3 ? -1 : 0, c = n === 4 ? 1 : 0;
      const ni = i + a, nj = j + c, nk = k + b;
      const s = w.slipChance(ni, nj, nk, strength);
      if (s && Math.random() < s.p) this.slipCell(ni, nj, nk, s.dx * 1.6, 0.5, s.dz * 1.6);
    }
  }

  treadOn(strength, stomp) {
    const fc = this.player.footCell, p = this.player;
    if (!fc || p.pos.y < 0.4) return;
    const w = this.world;
    const cells = stomp ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]];
    let slid = 0;
    for (const [a, b] of cells) {
      const i = fc.i + a, k = fc.k + b;
      let j = fc.j;
      if (!w.get(i, j, k)) continue;
      const s = w.slipChance(i, j, k, strength * (a || b ? 0.6 : 1));
      if (s && Math.random() < s.p) {
        if (this.slipCell(i, j, k, s.dx * 1.8 + p.vel.x * 0.2, 0.4, s.dz * 1.8 + p.vel.z * 0.2)) { slid++; this.S.stats.slides = (this.S.stats.slides || 0) + 1; }
      }
    }
    if (slid) {
      this.sound.soft(0.12); this.shake = Math.max(this.shake, 0.12);
      if (!this._slideHint) { this._slideHint = true; this.ui.hint('The pile shifts under your feet. Steep slopes slide when you climb them.', 5); }
    }
  }

  onKick(i, j, k, vx, vy, vz, speed) {
    this.kickBudget = this.kickBudget ?? 6;
    if (this.kickBudget <= 0 || speed < 3.2) return;
    if (Math.random() > 0.08 * (speed - 2.8)) return;
    const s = this.world.slipChance(i, j, k, 1.8);
    if (s && Math.random() < s.p) { this.kickBudget--; this.slipCell(i, j, k, vx * 0.25 + s.dx, 0.3, vz * 0.25 + s.dz); }
  }

  // ======================= stability + collapse =======================
  onCreak(x, y, z, n) {
    const d = Math.hypot(x - this.player.pos.x, y - this.player.pos.y, z - this.player.pos.z);
    if (d < 40) this.sound.creak(Math.max(0.05, 0.28 - d * 0.006));
    this.S.stats.creaks++;
    if (d < 10 && !this._creakHint) { this._creakHint = true; this.ui.hint('The roof is creaking! Back away, or place a <kbd>Frame</kbd> to hold it.', 5); }
  }

  releaseCell(i, j, k) {
    if (this.sim.n > 2300) return false;
    const it = this.world.removeCell(i, j, k, false);
    if (!it) return true;
    const x = cellX(i), y = cellY(j), z = cellZ(k);
    this.sim.spawn(it.sp, it.vr, x, y, z, (Math.random() - 0.5) * 0.8, -0.8, (Math.random() - 0.5) * 0.8, 2);
    const d = Math.hypot(x - this.player.pos.x, y - this.player.pos.y, z - this.player.pos.z);
    if (this.collapseT > 2.5) {
      this.S.stats.collapses++;
      this.afters = this.afters || [];
      this.afters.push({ i, j, k, t: 3 + Math.random() * 5, n: 3 + ((Math.random() * 4) | 0) });
      this.collapseT = 0;
      this.sound.rumble(d < 12 ? 1.2 : d < 30 ? 0.6 : 0.25);
      if (d < 18) this.shake = Math.max(this.shake, Math.min(1.2, 14 / (d + 6)));
    }
    this.collapseT = Math.min(this.collapseT, 1.2);
    if (Math.random() < 0.25) this.fx.dust(x, y, z, 4, 0.9, 0.9);
    // a real cave-in: the plush piled above a failing roof comes down with it
    if (!this._inCascade) {
      this._inCascade = true;
      const w = this.world;
      const over = Math.max(0, w.topAt(i, k) - j - 1);
      if (over > 3 && Math.random() < 0.7) {
        const H = Math.min(10, 2 + Math.floor(over / 4));
        let n = 0;
        for (let h = 1; h <= H; h++) {
          for (const [a, b] of (h <= 3 ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]])) {
            if (n >= 45 || this.sim.n > 2200) break;
            const it2 = w.removeCell(i + a, j + h, k + b, true);
            if (!it2) continue;
            this.sim.spawn(it2.sp, it2.vr, cellX(i + a), cellY(j + h), cellZ(k + b), (Math.random() - 0.5) * 1.5, -1 - Math.random(), (Math.random() - 0.5) * 1.5, 2);
            n++;
          }
        }
        if (n > 4) {
          this.fx.dust(x, y + 0.5, z, 14, 1.4, 1.6);
          if (d < 25) { this.shake = Math.max(this.shake, Math.min(1.4, 18 / (d + 5))); this.sound.rumble(d < 14 ? 1.5 : 0.8); }
          if (d < 14 && !this._caveHint) { this._caveHint = true; this.ui.hint('Cave-in! Dig your way through the rubble, or wall it off with Bulkheads and go around.', 6); }
        }
      }
      this._inCascade = false;
    }
    return true;
  }

  onImpact(x, y, z, v) {
    if (this.impactCd > 0) return;
    this.impactCd = 0.05;
    const d = Math.hypot(x - this.player.pos.x, y - this.player.pos.y, z - this.player.pos.z);
    if (d < 25) { this.sound.debris(Math.min(0.25, v * 0.02) * (1 - d / 28)); if (Math.random() < 0.5) this.fx.dust(x, y, z, 3, 0.7, 0.7); }
  }
  onPlayerHit(v) {
    if (v > 5) { this.shake = Math.max(this.shake, 0.35 * this.T.shakeMul); this.sound.thump(0.2, 130); if (this.T.shakeMul === 1) this.ui.hurt(0.25); }
  }

  updateAfters(dt) {
    if (!this.afters || !this.afters.length) return;
    const w = this.world;
    for (let a = this.afters.length - 1; a >= 0; a--) {
      const f = this.afters[a];
      f.t -= dt;
      if (f.t > 0) continue;
      f.n--; f.t = 2 + Math.random() * 6;
      const i = f.i + ((Math.random() * 7) | 0) - 3, k = f.k + ((Math.random() * 7) | 0) - 3, j = f.j + ((Math.random() * 5) | 0) - 1;
      const sl = w.slipChance(i, j, k, 1.4);
      if (sl && Math.random() < sl.p + 0.15) this.slipCell(i, j, k, sl.dx, 0.3, sl.dz);
      this.onCreak(cellX(i), cellY(j), cellZ(k), 1);
      if (f.n <= 0) this.afters.splice(a, 1);
    }
  }

  // ======================= HUD =======================
  noteDist(x, z) { const d = Math.hypot(x, z); if (d > (this.S.stats.maxDist || 0)) this.S.stats.maxDist = d; }

  trackDepth() {
    const S = this.S, p = this.player.pos, w = this.world;
    const i = clamp(toI(p.x), 0, NX - 1), k = clamp(toK(p.z), 0, NZ - 1);
    const surf = w.topAt(i, k) * C;
    const depth = Math.max(0, surf - p.y - 1.0);
    S.stats.maxDepth = Math.max(S.stats.maxDepth, depth);
    S.stats.maxHeight = Math.max(S.stats.maxHeight, p.y);
    this.noteDist(p.x, p.z);
    if (depth >= 5 && S.stats.props === 0) S.stats.noPropDeep = true;
    return depth;
  }

  needlePos() {
    if (this.S.ending === 'exit') return null;
    const w = this.world, n = w.needle;
    if (w.get(n.i, n.j, n.k) === NEEDLE) return _v2.set(cellX(n.i), cellY(n.j), cellZ(n.k));
    const s = this.sim;
    for (let i = 0; i < s.n; i++) if (s.sp[i] === NEEDLE) return _v2.set(s.x[i], s.y[i], s.z[i]);
    return null;
  }

  updateHud(dt) {
    const S = this.S, T = this.T, p = this.player, w = this.world, cam = this.renderer.camera;
    this.hudT -= dt;
    // creak proximity feeds every frame
    let near = 1e9;
    for (const c of w.creaking.values()) {
      const d = Math.hypot(cellX(c.i) - p.pos.x, cellY(c.j) - p.pos.y, cellZ(c.k) - p.pos.z);
      if (d < near) near = d;
    }
    if (near < 14 && Math.random() < dt * 14) { for (const c of w.creaking.values()) { if (Math.random() < 0.08) { this.fx.dust(cellX(c.i), cellY(c.j) - 0.2, cellZ(c.k), 1, 0.2, 0.2); break; } } }
    if (near < 30) {
      this.ui.setWarn(near < 16 ? 'ROOF CREAKING' : '');
      this.ui.setDanger(Math.max(0, 1 - near / 18));
      if (near < 14) this.shake = Math.max(this.shake, 0.08 * (1 - near / 14));
    } else { this.ui.setWarn(''); this.ui.setDanger(0); }
    // buried
    const buried = p.buried > 0.8;
    this.ui.setBuried(buried);
    if (buried && !this.lastBuried) S.stats.buried++;
    this.lastBuried = buried;
    // emergency recall: hold U
    if (this.keys.KeyH) {
      this.recallHold += dt;
      if (this.recallHold > 2.5) { this.recallHold = 0; this.recall(); }
      else this.ui.hint(`Recalling… hold <kbd>H</kbd> (${(2.5 - this.recallHold).toFixed(1)}s)`, 0.3);
    } else this.recallHold = 0;
    if (p.buried > 6 && !this.unstuckHint) { this.unstuckHint = true; this.ui.hint('Stuck? Hold <kbd>H</kbd> for an emergency recall to the sorting bay.', 8); }

    if (this.S.stats && this.T.scan > 0) this.sound.geiger(dt, this.sigLevel > 0 ? Math.pow(this.sigLevel, 0.7) : 0);
    // carried held plush bob
    this.heldPop += (0 - this.heldPop) * Math.min(1, dt * 9);

    if (this.hudT > 0) return;
    this.hudT = 0.1;
    this.ui.setCartLine(this.S.cart ? this.S.cart.load.length : -1, this.S.cart ? CART_CAP[this.S.cart.tier] : 0, this.S.cart ? this.S.cart.mode : '');
    const depth = this.trackDepth();
    this.ui.setDepth(depth > 0.3 ? `DEPTH ${depth.toFixed(1)} m` : p.pos.y > 6 ? `ALTITUDE ${p.pos.y.toFixed(0)} m` : '');
    {
      const net = this.hasGen() ? this.power.nearest(p.pos.x, p.pos.y + 1, p.pos.z) : null;
      if (net) { const used = Math.min(net.demand, net.supply); this.ui.setPower(true, net.supply > 0 ? Math.min(1, net.demand / Math.max(0.01, net.supply)) : 1, net.supply <= 0 ? 'NO FUEL' : `${net.demand.toFixed(1)} / ${net.supply.toFixed(1)} kW${net.sat < 0.99 ? ' BROWNOUT' : ''}`); void used; }
      else this.ui.setPower(false);
      const dd = this.dust;
      this.ui.setAir(T.airmon && (dd.level > 0.03 || dd.lung > 0.03), dd.level, dd.lung, dd.lung > 0.6 ? 'COUGHING' : dd.level > 0.3 ? 'DUSTY' : 'CLEAR');
    }
    // compass to exit
    if (T.compass) {
      const deg = (a) => ((a * 180 / Math.PI) % 360 + 360) % 360;
      const fw = this.player.forward(_fwd);
      const heading = deg(Math.atan2(fw.x, -fw.z));
      const markers = [];
      const ex = EXIT_X - p.pos.x, ez = 0 - p.pos.z;
      { const ms = []; for (const it of this.machines.items.values()) if (it.ent.type === 'marker') { const d = Math.hypot(it.ent.x - p.pos.x, it.ent.z - p.pos.z); if (d < 700) ms.push([d, it.ent]); } ms.sort((a, b) => a[0] - b[0]); for (const [, e2] of ms.slice(0, 8)) markers.push({ b: deg(Math.atan2(e2.x - p.pos.x, -(e2.z - p.pos.z))), label: 'M', color: '#ff9bd0' }); }
      if (T.exitMarker) markers.push({ b: deg(Math.atan2(ex, -ez)), label: 'EXIT', color: '#7ef0c4' });
      const np2 = this.needlePos();
      if (T.scan >= 3 && np2 && Math.hypot(np2.x - p.pos.x, np2.z - p.pos.z) <= T.scanRange) markers.push({ b: deg(Math.atan2(np2.x - p.pos.x, -(np2.z - p.pos.z))), label: 'ONE', color: '#fff3a0' });
      if (T.locator) {
        this.locT = (this.locT || 0) - 0.1;
        if (this.locT <= 0) { this.locT = 1.0; this.locCache = w.remainsNear(p.pos.x, p.pos.z, T.locatorRange); }
        const lc = this.locCache;
        if (lc) {
          markers.push({ b: deg(Math.atan2(lc.x - p.pos.x, -(lc.z - p.pos.z))), label: 'GEAR', color: '#c79bff' });
          if (lc.d < 14 && Math.random() < 0.18) this.sound.tone('sine', 880, 880, 0.15, 0.06);
        }
      }
      const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const readout = `HDG ${String(Math.round(heading)).padStart(3, '0')}° ${names[Math.round(heading / 45) % 8]}   E ${p.pos.x.toFixed(0)}  S ${p.pos.z.toFixed(0)}${T.exitMarker ? `   EXIT ${Math.hypot(ex, ez).toFixed(0)} m` : ''}`;
      this.ui.setCompass(true, heading, markers, readout);
    } else this.ui.setCompass(false);
    // stress lens
    this.stressT -= 0.1;
    if (T.stressLens && this.stressT <= 0) {
      this.stressT = 0.35;
      const list = [];
      const ci = toI(p.pos.x), cj = toJ(p.pos.y + 1), ck = toK(p.pos.z);
      for (let dj = -4; dj <= 5; dj++) for (let dk = -8; dk <= 8; dk++) for (let di = -8; di <= 8; di++) {
        const i = ci + di, j = cj + dj, k = ck + dk;
        if (!w.inside(i, j, k)) continue;
        const s = w.stress(i, j, k);
        if (s && s.margin <= 0) list.push({ x: cellX(i), y: cellY(j), z: cellZ(k), sev: s.margin < 0 ? 2 : 1 });
      }
      this.renderer.setStress(list);
    } else if (!T.stressLens) this.renderer.setStress([]);
    if (T.assay) {
      let v = 0;
      const ci = toI(p.pos.x), cj = toJ(p.pos.y + 1), ck = toK(p.pos.z);
      for (const [a, b, c] of [[0, 0, 0], [4, 0, 0], [-4, 0, 0], [0, 0, 4], [0, 0, -4], [0, 3, 0]]) v = Math.max(v, w.veinAt(ci + a, cj + b, ck + c));
      this.ui.setAssay(true, Math.min(1, Math.max(0, (v - 0.55) / 0.4)));
    } else this.ui.setAssay(false, 0);
    // needle scanner
    const np = this.needlePos();
    if (T.scan > 0 && np) {
      const d = Math.hypot(np.x - cam.position.x, np.y - cam.position.y, np.z - cam.position.z);
      const range = T.scanRange;
      if (d <= range) {
        const level = clamp(1 - d / range, 0, 1);
        this.sigLevel = clamp(1 - d / Math.min(range, 60), 0, 1);
        const showMeter = T.scan >= 1;
        const aAng = Math.atan2(np.x - p.pos.x, np.z - p.pos.z);
        const rel = (p.yaw - aAng) * 180 / Math.PI - 90;
        let dtxt = '';
        if (T.scan >= 4) dtxt = d.toFixed(0) + ' m';
        if (T.scan >= 5) { const dy = np.y - cam.position.y; dtxt += dy > 0.5 ? `  ▲ ${dy.toFixed(0)}` : dy < -0.5 ? `  ▼ ${(-dy).toFixed(0)}` : ''; }
        this.ui.setSignal(showMeter, Math.pow(level, 0.6), rel, dtxt || (d < 8 ? 'very close' : ''), T.scan >= 3);
      } else { this.sigLevel = 0; this.ui.setSignal(T.scan >= 1, 0, 0, 'no signal', false); }
    } else { this.sigLevel = 0; this.ui.setSignal(false); }
  }

  recall() {
    const p = this.player;
    const list = this.beaconList();
    let best = list[0], bd = 1e12;
    for (const b of list) { const d = Math.hypot(b.x - p.pos.x, b.z - p.pos.z); if (d < bd) { bd = d; best = b; } }
    p.pos.set(best.x, best.y, best.z + (best.bay ? 0 : 1.6));
    p.vel.set(0, 0, 0);
    if (best.bay) p.yaw = Math.PI / 2;
    const w = this.world, s = this.sim;
    for (let i = s.n - 1; i >= 0; i--) if (Math.hypot(s.x[i] - START_POS[0], s.z[i] - START_POS[2]) < 1.6 && s.y[i] < 3) s.remove(i);
    const ci = toI(START_POS[0]), ck = toK(START_POS[2]);
    for (let di = -3; di <= 3; di++) for (let dk = -3; dk <= 3; dk++) for (let j = 0; j < 4; j++) {
      if (Math.hypot(di, dk) > 2.8) continue;
      const it = w.removeCell(ci + di, j, ck + dk, false);
      if (it && it.sp === NEEDLE) { this.sim.spawn(it.sp, it.vr, cellX(ci + di), cellY(j) + 0.2, cellZ(ck + dk), 0, 2, 0, 2); }
    }
    this.sound.whoosh(0.2);
    this.ui.hint('Recalled to the sorting bay.', 2);
  }

  // ======================= dynamic render feed =======================
  feedDynamic(dt, camPos) {
    const r = this.renderer, s = this.sim, w = this.world, S = this.S;
    r.beginDynamic();
    const skyAt = (x, y, z) => {
      const i = clamp(toI(x), 0, NX - 1), k = clamp(toK(z), 0, NZ - 1);
      const t = w.topAt(i, k), j = toJ(y);
      return j >= t ? 1 : Math.max(0.15, Math.exp(-(t - j - 1) * 0.3));
    };
    for (let i = 0; i < s.n; i++) {
      r.addDynamic(s.sp[i], s.vr[i], s.x[i], s.y[i], s.z[i], s.q[i * 4], s.q[i * 4 + 1], s.q[i * 4 + 2], s.q[i * 4 + 3], 1, 0.95, skyAt(s.x[i], s.y[i], s.z[i]), s.sq[i]);
    }
    // fliers
    const bp = this.hall.binPos;
    const hp = this.heldPos(_v2);
    const qi = _q.set(0, 0, 0, 1);
    for (const f of this.fliers) {
      if (f.t < 0) continue;
      const u = clamp(f.t / f.dur, 0, 1);
      let x, y, z;
      if (f.hand) {
        x = lerp(f.from.x, hp.x, u * u); y = lerp(f.from.y, hp.y, u * u); z = lerp(f.from.z, hp.z, u * u);
      } else {
        const to = f.to;
        x = lerp(f.from.x, to.x, u); z = lerp(f.from.z, to.z, u);
        y = lerp(f.from.y, to.y, u) + Math.sin(u * Math.PI) * (f.arc || 1);
      }
      const sc = f.hand ? lerp(1, 0.55, u) : 1;
      r.addDynamic(f.sp, f.vr, x, y, z, qi.x, qi.y, qi.z, qi.w, sc, 0.95, 1);
    }
    this.logi.forEachItem((it, x, y, z, sc) => r.addDynamic(it.sp, it.vr, x, y, z, 0, 0, 0, 1, sc, 0.95, Math.max(0.5, this.camSky)));
    this.crew.forEachItem((it, x, y, z, sc) => r.addDynamic(it.sp, it.vr, x, y, z, 0, 0, 0, 1, sc, 0.95, Math.max(0.5, this.camSky)));
    this.cart.forEachItem((it, x, y, z, sc) => r.addDynamic(it.sp, it.vr, x, y, z, 0, 0, 0, 1, sc, 0.95, Math.max(0.5, this.camSky)));
    // held plush in view
    if (this.mode === 'play' && S.carry.length) {
      const it = S.carry[S.carry.length - 1];
      const hq = this.renderer.camera.quaternion;
      const spin = _q.setFromAxisAngle(_v.set(0, 1, 0), 0.5 + Math.sin(this.time * 0.8) * 0.15);
      const q2 = hq.clone().multiply(spin);
      const pop = 0.36 * (1 + 0.5 * Math.max(0, this.heldPop) + 0.1 * Math.min(0, this.heldPop));
      r.addDynamic(it.sp, it.vr, hp.x, hp.y, hp.z, q2.x, q2.y, q2.z, q2.w, pop, 1, Math.max(0.6, this.camSky));
    }
    r.endDynamic();
    void dt; void camPos; void bp;
  }

  heldPos(out) {
    const cam = this.renderer.camera;
    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = _v.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const bob = Math.sin(this.player.bob * 2) * 0.012;
    return out.copy(cam.position).addScaledVector(_fwd, 0.7).addScaledVector(_right, 0.34).addScaledVector(up, -0.3 + bob - Math.max(0, -this.heldPop) * 0.1);
  }

  // ======================= achievements / endings =======================
  checkAchievements() {
    const S = this.S;
    for (const a of ACHIEVEMENTS) {
      if (S.ach[a.id]) continue;
      let ok = false;
      try { ok = a.check(S); } catch (e) { ok = false; }
      if (ok) {
        S.ach[a.id] = Date.now();
        this.ui.toast({ icon: a.icon, title: a.name, text: a.desc, cls: 'ach', ms: 5200 });
        this.sound.ach();
      }
    }
  }

  foundNeedle(src) {
    const S = this.S;
    if (S.ending) return; // once you take the exit, the One is gone for good: quit the job or win the long way
    S.found = true;
    S.ending = 'plush';
    this.mode = 'ended';
    this.sound.found();
    const cam = this.renderer.camera.position;
    this.fx.sparkle(cam.x, cam.y - 0.2, cam.z, 80, 1, 0.9, 0.4);
    this.fx.burst(cam.x, cam.y, cam.z, 60, 1, 0.8, 0.3, 4, 0.1, 2);
    this.shake = 0.6;
    this.ui.hint(`<b>THE ONE</b> — found with ${src}.`, 6);
    this.endTimer = 2.8;
    this.checkAchievements();
  }

  finish(kind) {
    const S = this.S;
    if (S.ending) return;
    S.ending = kind;
    this.mode = 'ended';
    this.sound.exitSfx();
    this.endTimer = 1.5;
    this.checkAchievements();
  }

  openEnding() {
    this.save();
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.showEnding(this.S.ending, this.S);
  }
}
