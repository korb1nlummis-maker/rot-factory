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
import { Net, RemotePlayer } from './net.js';
import { Slides } from './slide.js';
import { recipes, craft, craftGear, gearRecipes, MATERIALS } from './crafting.js';
import { ghostify } from './machines.js';
import { Dust } from './dust.js';
import { U } from './shaders.js';
import { newState, saveGame, loadSaved, applyDiff, clearSave } from './state.js';
import { UPGRADES, FRAME_TYPES, GEAR, computeTuning, effLevels, upgradeById, isUnlocked } from './upgrades.js';
import { Cart, CART_CAP, CART_NAMES, dims as cartDims } from './cart.js';
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
    this.hp = 100; this.hpMax = 100; this.hurtT = 0; this.dmgCd = 0; this.suffocating = false;
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
    this.net = new Net();
    this.net.onOpen = () => this.netOpened();
    this.net.onClose = () => this.netClosed();
    this.net.onMessage = (m) => this.netMessage(m);
    this.netOut = [];
    this.remote = null;
    this.netPending = [];
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
    this.sim.player = { spheres: () => { const a = this.player.spheres(); if (this.remote && this.net.open) a.push(...this.remote.spheres()); return a; }, vel: this.player.vel };
    this.sim.spawnHook = (sp, vr, x, y, z, vx, vy, vz, flag) => this.spawnHook(sp, vr, x, y, z, vx, vy, vz, flag);
    this.netBodies = new Map();
    this.slide = new Slides(this);
    this.sim.hooks = {
      onStale: (sp, vr) => { this.sellAuto(sp, vr, 0.5); },
      onFreeze: (i, j, k, flag, en) => { if (!this.isGuest()) { if (en > 0.3) this.slide.trigger(i, j, k, en * 0.72); } },
      onBin: (i, x, y, z) => this.onBin(i),
      onImpact: (x, y, z, v) => this.onImpact(x, y, z, v),
      onKick: (i, j, k, vx, vy, vz, sp, en) => this.onKick(i, j, k, vx, vy, vz, sp, en),
      onPlayerHit: (v) => this.onPlayerHit(v),
    };
    this.player.events.land = (v) => { if (v > 12) this.hurtPlayer((v - 12) * 5, 'fell too far'); this.landDip = Math.min(0.28, v * 0.025); this.treadOn(3.2, true); this.sound.thump(Math.min(0.35, v * 0.04), 110); this.fx.dust(this.player.pos.x, this.player.pos.y + 0.1, this.player.pos.z, 6, 0.8, 1); this.shake = Math.max(this.shake, Math.min(0.5, v * 0.03)); };
    this.player.events.step = (sp) => {
      this.treadOn(1.0 + (sp > 5 ? 0.5 : 0), false);
      if (this.player.pos.y > 0.45) { this.sound.step(0.06 + Math.min(0.06, sp * 0.01)); if (Math.random() < 0.12) this.sound.squeak(0.7 + Math.random() * 0.5, 0.04); }
      else this.sound.stepConcrete(0.05 + Math.min(0.05, sp * 0.01));
    };
    this.machines.clear();
    this.logi.clear();
    this.power.clear();
    this.dust.clear();
    this.crew.clear();
    this.world.onRemove = (i, j, k) => { this.dust.add(cellX(i), cellY(j), cellZ(k), 0.006); };
    for (const e of S.entities) this.addEntity(e);
    this.ensureFreeGate();
    S.boosts = { sell: 0, dig: 0, digMul: 1, carry: 0, stab: 0, scan: 0, ...(S.boosts || {}) };
    S.stats = { ...newState(0).stats, ...(S.stats || {}) };
    if (!Array.isArray(S.stats.rar) || S.stats.rar.length < 7) S.stats.rar = [0, 0, 0, 0, 0, 0, 0];
    if (!S.gear) { S.gear = {}; for (const id of GEAR) S.gear[id] = S.up[id] || 0; }
    if (S.gear.helmet === undefined) S.gear.helmet = 1; // every worker starts with a hard hat, a lamp and a clock
    if (S.gameMin === undefined) S.gameMin = 0;
    S.notes = S.notes || []; S.clues = S.clues || []; S.items = S.items || {}; S.mats = S.mats || {}; if ((S.up.hardhat || 0) > 1) { S.up.hpmax = Math.max(S.up.hpmax || 0, S.up.hardhat); S.up.hardhat = 1; } if (S.up.binmag) { S.up.dump = Math.max(S.up.dump || 0, S.up.binmag); delete S.up.binmag; } S.crew = S.crew || []; S.contracts = S.contracts || []; S.entities = S.entities || []; S.carry = S.carry || [];
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
    this.wireMulti();
    { const c = document.getElementById('chatIn'); c.addEventListener('keydown', (e) => { if (e.code === 'Enter') { const t = c.value.trim(); if (t) { this.netSend({ t: 'say', text: t }); this.chatLine('You: ' + t); } c.classList.add('hidden'); c.blur(); } else if (e.code === 'Escape') { c.classList.add('hidden'); c.blur(); } e.stopPropagation(); }); }
    $('btnKeep').onclick = () => { this.ui.hideEnding(); this.mode = 'play'; this.requestLock(); };
    $('btnNew2').onclick = () => { this.ui.hideEnding(); start(true); };

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('mousedown', (e) => this.onMouse(e, true));
    window.addEventListener('mouseup', (e) => this.onMouse(e, false));
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { if (this.mode === 'play' && !this.ui.isModalOpen() && this.tools.some((t) => t)) { this.cycleTool(e.deltaY > 0 ? 1 : -1); } }, { passive: true });
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

  startPlay(isNew, seedOverride, after) {
    $('title').classList.add('hidden');
    this.setLoading(isNew ? 'Stacking a fresh warehouse…' : 'Resuming your shift…');
    $('loading').classList.remove('hidden');
    setTimeout(() => {
      if (isNew) {
        if (seedOverride === undefined) clearSave();
        const S = newState(seedOverride ?? ((Math.random() * 4294967296) >>> 0));
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
      if (after) after();
      if (isNew && seedOverride === undefined) setTimeout(() => this.ui.hint('Look at a plush and tap <kbd>F</kbd> to grab it. Walk near the SORT bin and it sucks your plush in. <kbd>E</kbd> at the desk for upgrades, at the bench to craft.', 12), 800);
      else this.ui.hint('Welcome back to Warehouse 07.', 4);
      if (isNew && seedOverride === undefined) setTimeout(() => this.ui.hint('You wear a hard hat with a lamp and a clock. At 19:00 the warehouse closes, a chime sounds, and the lights go out until 07:00.', 11), 14000);
    }, 60);
  }

  save() {
    if (this.noSave) return true;
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
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; // typing in a box
    if (down && e.code === 'Enter' && this.mode === 'play' && this.net.open && !this.ui.isModalOpen()) { const c = document.getElementById('chatIn'); c.classList.remove('hidden'); c.value = ''; c.focus(); e.preventDefault(); return; }
    if (e.code === 'KeyG') return; // G is retired: F or left click grab, and grab again to throw
    if (e.repeat && down) { if (e.code === 'Tab') e.preventDefault(); return; }
    if (e.code === 'Tab') e.preventDefault();
    this.keys[e.code] = down;
    if (e.code === 'KeyF') this.keys.KeyG = down; // F (and left click) hold the grab flag
    if (!down) return;
    if (this.mode !== 'play') return;
    if (this.ui.isModalOpen()) {
      if (this.ui.openModal === 'inv') {
        // inventory: a number puts the selected item into that hotbar slot, X clears it from the bar, I or Esc closes
        if (e.code.startsWith('Digit')) { this.ui.invAssign(+e.code.slice(5) - 1); return; }
        if (e.code === 'KeyX') { this.ui.invClear(); return; }
        if (e.code === 'ArrowRight' || e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'ArrowDown') { this.ui.invMove(e.code); e.preventDefault(); return; }
        if (e.code === 'KeyI') { this.ui.closeModals(); return; }
      }
      if (e.code === 'Tab' || e.code === 'KeyN' || e.code === 'KeyJ' || e.code === 'KeyL' || e.code === 'KeyV') { if (this.ui.openModal !== 'pause') this.ui.closeModals(); }
      return;
    }
    if (e.code === 'Tab') this.openModal('shop');
    else if (e.code === 'KeyN') this.openModal('dex');
    else if (e.code === 'KeyL') this.openModal('journal');
    else if (e.code === 'KeyV') this.openModal('crew');
    else if (e.code === 'KeyT') this.crewFarmAhead();
    else if (e.code === 'KeyY') this.crewHomeAll();
    else if (e.code === 'KeyF') this.gPress();
    else if (e.code === 'KeyJ') this.openModal('ach');
    else if (e.code.startsWith('Digit')) { const n = +e.code.slice(5) - 1; if (n >= 0 && n < 9) this.selectTool(n, true); }
    else if (e.code === 'KeyB') this.bPress();
    else if (e.code === 'BracketRight' || e.code === 'ArrowRight') this.cycleTool(1);
    else if (e.code === 'BracketLeft' || e.code === 'ArrowLeft') this.cycleTool(-1);
    else if (e.code === 'KeyI') this.openModal('inv');
    else if (e.code === 'KeyE') this.useKey();
    else if (e.code === 'KeyO') this.toggleLamp();
    else if (e.code === 'KeyZ') this.throwOne();
    else if (e.code === 'KeyK') this.useMedkit();
    else if (e.code === 'KeyP') this.punch();
    else if (e.code === 'KeyQ') { this.stowed = !this.stowed; this.machines.setGhost(null); this.rebuildTools(); const t = this.curTool(); this.ui.hint(this.stowed ? 'Put away. Hands free. <kbd>Q</kbd> takes it out again.' : (t.kind === 'hammer' ? 'Hammer out. <kbd>B</kbd> removes what you aim at. <kbd>Q</kbd> puts it away.' : 'Tool out. <kbd>B</kbd> places it. <kbd>Q</kbd> puts it away.'), 2.5); }
    else if (e.code === 'KeyX') this.deconstruct();
    else if (e.code === 'KeyU') this.useCart();
    else if (e.code === 'KeyR') {
      // R punches (laptop friendly); with a ramp in hand it flips the ramp instead
      const t = this.curTool();
      if (t.kind === 'belt' && t.ramp) { this.rampMode = (this.rampMode + 1) % 2; this.machines.setGhost(null); }
      else this.punch();
    }
  }

  onMouse(e, down) {
    // the mouse looks around; left click grabs, right click punches
    if (!e || this.mode !== 'play' || this.ui.isModalOpen() || !document.pointerLockElement) { if (!down && e && e.button === 0) this.keys.KeyG = false; return; }
    if (down && e.button === 2) this.punch();
    else if (e.button === 0) { this.keys.KeyG = down; if (down) this.gPress(); }
  }

  // ======================= tools =======================
  // inventory of crafted build items. With an item in hand a green outline shows where it will go; B sets it down.
  rebuildTools() {
    const S = this.S;
    S.items = S.items || {};
    if (!Array.isArray(S.hotbar) || S.hotbar.length !== 9) {
      // an older save (or a new game): hammer first, then whatever you already carry
      S.hotbar = ['hammer', null, null, null, null, null, null, null, null];
      for (const r of recipes(this)) { if (r.kind === 'mat' || r.kind === 'cart') continue; if ((S.items[r.id] || 0) > 0) { const f = S.hotbar.indexOf(null); if (f >= 0) S.hotbar[f] = r.id; } }
    }
    // The hotbar is nine slots you fill from the inventory (I), like Minecraft. this.tools[slot] is the tool in that slot or null.
    const byId = new Map(recipes(this).map((r) => [r.id, r]));
    this.tools = S.hotbar.map((id, slot) => {
      if (!id) return null;
      if (id === 'hammer') return { id, kind: 'hammer', icon: '🔨', label: 'Hammer', count: null, slot, have: 1 };
      const r = byId.get(id), n = S.items[id] || 0;
      if (!r) return null;
      return { id, kind: r.kind, fk: r.fk, ramp: r.ramp, icon: r.icon, label: r.short, count: '×' + n, have: n, slot };
    });
    if (this.stowed === undefined) this.stowed = true; // hands by default; Q or a number key takes a tool out
    if (this.buildIdx == null || this.buildIdx < 0 || this.buildIdx > 8) this.buildIdx = 0;
    this.ui.setHotbar(this.tools, this.stowed ? -1 : this.buildIdx);
    this.machines.setGhost(null);
  }

  // ---- inventory: everything you hold that can be used, and the hotbar slots you put it in
  inventoryList() {
    const S = this.S, out = [];
    out.push({ id: 'hammer', kind: 'hammer', icon: '🔨', name: 'Hammer', count: null, desc: 'Removes what you built and gives it back.', use: 'Take it out, aim at a frame, prop, belt, machine or bulkhead and press B (hold B to keep going).', tool: true });
    for (const r of recipes(this)) {
      if (r.kind === 'mat') { const n = (S.mats || {})[r.mk] || 0; if (n > 0) out.push({ id: r.id, kind: 'mat', icon: r.icon, name: r.name, count: n, desc: r.desc, use: r.use, tool: false }); continue; }
      const n = S.items[r.id] || 0;
      if (n > 0) out.push({ id: r.id, kind: r.kind, icon: r.icon, name: r.name, count: n, desc: r.desc, use: r.use, status: r.status, tool: true });
    }
    if (S.cart) out.push({ id: 'cart-out', kind: 'cart-out', icon: '🛒', name: CART_NAMES[S.cart.tier] + ' (rolled out)', count: null, desc: `Carries ${CART_CAP[S.cart.tier]} plush. ${S.cart.load.length} aboard.`, use: 'U parks it or calls it back. X (or the hammer) stows it when it is empty.', tool: false });
    for (const it of out) it.slot = it.tool ? S.hotbar.indexOf(it.id) : -1;
    return out;
  }
  // put an item into a hotbar slot (a specific one, or the first free one). Returns the slot or -1.
  assignHotbar(id, slot = null) {
    const S = this.S;
    if (!Array.isArray(S.hotbar) || S.hotbar.length !== 9) S.hotbar = ['hammer', null, null, null, null, null, null, null, null];
    const old = S.hotbar.indexOf(id);
    if (slot === null) { if (old >= 0) return old; slot = S.hotbar.indexOf(null); if (slot < 0) return -1; }
    if (old >= 0 && old !== slot) S.hotbar[old] = S.hotbar[slot]; // swap places
    else if (old === slot) return slot;
    S.hotbar[slot] = id;
    this.rebuildTools();
    return slot;
  }
  clearHotbarSlot(slot) { if (slot >= 0 && slot < 9 && this.S.hotbar[slot]) { this.S.hotbar[slot] = null; this.rebuildTools(); } }
  cycleTool(dir) {
    for (let n = 1; n <= 9; n++) { const s = (this.buildIdx + dir * n + 90) % 9; if (this.tools[s]) { this.selectTool(s); return; } }
  }
  beaconCost() { return Math.round(4000 * Math.pow(2.6, this.beaconList().length - 1)); }
  genCost() { return Math.round(350 * Math.pow(1.35, this.logi ? this.logi.count('gen') : 0)); }
  sorterCost() { return Math.round(90 * Math.pow(1.18, this.logi ? this.logi.count('sorter') : 0)); }
  mechCost() { return Math.round(2500 * Math.pow(1.55, this.logi ? this.logi.count('mech') : 0)); }
  rigCost() { return Math.round(150 * Math.pow(1.4, this.machines ? this.machines.count('claw') : 0)); }
  borerCost() { return Math.round(3200 * Math.pow(1.7, this.machines ? this.machines.count('borer') : 0)); }
  curTool() { const t = this.tools[this.buildIdx]; return !this.stowed && t && (t.have === undefined || t.have > 0) ? t : { kind: 'hands' }; }
  selectTool(n, toggle = false) {
    const slot = ((n % 9) + 9) % 9;
    const same = this.buildIdx === slot;
    this.buildIdx = slot;
    this.stowed = toggle && same && !this.stowed; // pressing the number of the tool you already hold puts it away
    this.ui.setHotbar(this.tools, this.stowed ? -1 : this.buildIdx);
    this.machines.setGhost(null);
    this.sound.tone('sine', 700, 900, 0.05, 0.05);
  }
  giveItem(id, n = 1) { this.S.items[id] = (this.S.items[id] || 0) + n; this.rebuildTools(); }

  tune() { const T = computeTuning(effLevels(this.S), this.S.boosts); if (this.world) this.world.slipMul = 1 - 0.25 * T.climb; return T; }
  recipeList() { return recipes(this); }
  gearList() { return gearRecipes(this); }
  craftGearItem(id) { if (this.isGuest()) { this.cmd('craftGear', { id }); return true; } return craftGear(this, id); }
  craftItem(id, n) { if (this.isGuest()) { this.cmd('craft', { id, n }); return true; } return craft(this, id, n); }

  // ======================= buying =======================
  buy(id) {
    if (this.isGuest()) { this.cmd('buy', { id }); return true; }
    const u = upgradeById(id);
    const lvl = this.S.up[id] || 0;
    if (!u || lvl >= u.max || !isUnlocked(u, this.S.up, this.S)) return false;
    const cost = u.cost[lvl];
    if (this.S.money < cost) { this.sound.error(); return false; }
    this.S.money -= cost;
    this.S.up[id] = lvl + 1;
    this.S.stats.upgrades++;
    this.T = this.tune();

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
    } catch (err) { console.error(err); this.errCount = (this.errCount || 0) + 1; this.lastErr = String(err && err.stack || err).slice(0, 600); (this.errLog = this.errLog || []).push(this.lastErr.split('\n').slice(0, 3).join(' | ')); if (this.errLog.length > 30) this.errLog.shift(); }
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
    const ls = this.machines.lights(cam.position, 4);
    const rp = this.remote && this.remote.lampOn && this.net.open ? this.remote : null;
    U.uPtN.value = rp ? 6 : 1 + ls.length;
    for (let i = 0; i < 6; i++) {
      const L = U.uPt.value[i], Lc = U.uPtCol.value[i];
      if (i === 0) { L.set(this.hall.binPos.x, 1.1, this.hall.binPos.z, 7); Lc.setRGB(1.3, 0.55, 0.15); continue; }
      if (i === 5) { if (rp) { L.set(rp.pos.x, rp.pos.y + 1.55, rp.pos.z, 11); Lc.setRGB(2.4, 2.2, 1.8); } else { L.set(0, -999, 0, 1); Lc.setRGB(0, 0, 0); } continue; }
      const e = ls[i - 1];
      if (e) { L.set(e.x, e.y, e.z, e.glow ? 6 : 9); if (e.glow) Lc.setRGB(0.5, 1.9, 0.9); else Lc.setRGB(2.2, 1.7, 0.9); } else { L.set(0, -999, 0, 1); Lc.setRGB(0, 0, 0); }
    }

    // --- interaction
    if (this.mode === 'play' && locked && !modal) this.interact(dt, cam.position, _fwd);
    else { this.curTargetRef = null; this.ui.setGrab(0, false); this.ui.setTarget(null); this.renderer.setGhost(0); }

    // --- sim
    this.kickBudget = 6;
    if (!this.isGuest()) {
      this.sim.step(dt);
      world.updateStability(dt, T.warn, {
        onCreak: (x, y, z, n) => this.onCreak(x, y, z, n),
        release: (i, j, k2) => this.releaseCell(i, j, k2),
      });
      this.updateAfters(dt);
      this.slide.update(dt);
      this.catchInCart();
    } else {
      for (const [id, c] of world.creaking) { c.t -= dt; if (c.t <= 0) world.creaking.delete(id); }
    }
    this.playerGateScan(dt);
    this.settleT = (this.settleT ?? 10) - dt;
    if (this.settleT <= 0) {
      this.settleT = 9 + Math.random() * 20;
      // (no random ambient creaks any more: a creak now only ever means a roof really is about to fail)
    }
    const guest = this.isGuest();
    this.logi.visualOnly = guest;
    if (guest) {
      this.machines.guestUpdate(dt, this.time);
      this.logi.update(dt);
      this.crew.guestUpdate(dt, this.time);
      this.cart.guestUpdate(dt);
      if (this.golden > 0) this.golden = Math.max(0, this.golden - dt);
      if (this.outage > 0) this.outage = Math.max(0, this.outage - dt);
    } else {
      this.machines.update(dt, this.time);
      this.updateFuses(dt);
      this.updateSurge(dt);
      this.power.update(dt);
      this.logi.update(dt);
      this.crew.update(dt, this.time);
      this.cart.update(dt);
    }
    this.radio.update(dt);
    this.netUpdate(dt);
    this.updateClock(dt);
    if (!guest) { this.updateGolden(dt); this.updateScavenge(dt); this.dust.update(dt); }
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
    if (this.isGuest()) {
      const nb = this.netRaycast(o, d, cell ? cell.t : T.reach);
      if (nb) { const b = this.netBodies.get(nb.id); return { type: 'nbody', id: nb.id, t: nb.t, sp: b.sp, vr: b.vr }; }
    }
    const body = this.sim.raycast(o.x, o.y, o.z, d.x, d.y, d.z, cell ? cell.t : T.reach);
    if (body) return { type: 'body', idx: body.i, t: body.t, sp: this.sim.sp[body.i], vr: this.sim.vr[body.i] };
    if (cell) {
      return { type: 'cell', i: cell.i, j: cell.j, k: cell.k, t: cell.t, sp: this.world.get(cell.i, cell.j, cell.k), vr: this.world.getVr(cell.i, cell.j, cell.k) };
    }
    return null;
  }

  // while you hold the grab button and the crosshair has nothing exact on it, take the plush nearest the AIM LINE:
  // within a thin tube around the ray, closest along it first. Nothing off to the sides, so grabbing digs straight in.
  nearestGrab(eye, dir) {
    const T = this.T, w = this.world, sim = this.sim;
    const reach = T.reach, TUBE = 0.9;
    let best = null, bs = 1e9;
    const consider = (dx, dy, dz, make) => {
      const t = dx * dir.x + dy * dir.y + dz * dir.z;
      if (t < 0.15 || t > reach) return;
      const px = dx - dir.x * t, py = dy - dir.y * t, pz = dz - dir.z * t;
      const perp = Math.hypot(px, py, pz);
      if (perp > TUBE) return;
      const sc = perp * 3 + t * 0.6;
      if (sc < bs) { bs = sc; best = make(t); }
    };
    for (let i = 0; i < sim.n; i++) consider(sim.x[i] - eye.x, sim.y[i] - eye.y, sim.z[i] - eye.z, (t) => ({ type: 'body', idx: i, t, sp: sim.sp[i], vr: sim.vr[i] }));
    if (best) return best;
    const rc = Math.ceil(reach / C) + 1;
    const ci = toI(eye.x), cj = toJ(eye.y), ck = toK(eye.z);
    for (let dk = -rc; dk <= rc; dk++) for (let dj = -rc; dj <= rc; dj++) for (let di = -rc; di <= rc; di++) {
      const i = ci + di, j = cj + dj, k = ck + dk;
      const sp = w.get(i, j, k);
      if (!sp || sp === BULK || sp === REMAINS || sp === CACHE) continue;
      if (w.solid(i + 1, j, k) && w.solid(i - 1, j, k) && w.solid(i, j + 1, k) && w.solid(i, j - 1, k) && w.solid(i, j, k + 1) && w.solid(i, j, k - 1)) continue;
      consider(cellX(i) - eye.x, cellY(j) - eye.y, cellZ(k) - eye.z, (t) => ({ type: 'cell', i, j, k, t, sp, vr: w.getVr(i, j, k) }));
    }
    return best;
  }

  targetInfo(tg) {
    const s = species[tg.sp];
    const r = RARITY[s.rarity];
    const shiny = !!(tg.vr & 128);
    let val = tg.sp === CACHE ? 'open it' : tg.sp === REMAINS ? 'search it' : tg.sp === BULK ? 'F to take down' : tg.sp === NEEDLE ? 'priceless' : '◈ ' + fmt(this.valueOf(tg.sp, tg.vr, 0));
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
      } else if (tg.type === 'nbody') {
        const b = this.netBodies.get(tg.id);
        if (b) this.renderer.setGhost(tg.sp, b.x, b.y, b.z, b.q[0], b.q[1], b.q[2], b.q[3], 1, RARITY[sp.rarity].color);
      } else {
        const s = this.sim;
        this.renderer.setGhost(tg.sp, s.x[tg.idx], s.y[tg.idx], s.z[tg.idx], s.q[tg.idx * 4], s.q[tg.idx * 4 + 1], s.q[tg.idx * 4 + 2], s.q[tg.idx * 4 + 3], 1, RARITY[sp.rarity].color);
      }
      this.ui.setCross(true);
    } else { this.ui.setTarget(null); this.renderer.setGhost(0); this.ui.setCross(false); }

    // vacuum burst (tap F once the Plush Vacuum is owned); special targets always use the single grab
    const special = tg && (tg.type === 'body' || tg.type === 'nbody' || tg.sp === BULK || tg.sp === REMAINS || tg.sp === CACHE);
    if (T.vac > 0 && !special) {
      if (this.keys.KeyG && !special) this.vacT = Math.max(this.vacT || 0, 0.3);
      if ((this.vacT || 0) > 0) { this.vacT -= dt; this.runVacuum(dt, eye, dir); } else this.vacAcc = 0;
      this.ui.setGrab(0, false);
    } else {
      // grabbing is instant (see gPress); hold the key to keep grabbing until your hands (or cart) are full
      this.grabCd = Math.max(0, (this.grabCd || 0) - dt);
      if (this.keys.KeyG && !this.holdBlock && performance.now() - (this.gDownAt || 0) > 160 && this.storeRoom() && this.grabCd <= 0 && !this.vacT) {
        // holding: fill your hands (and then the cart) as fast as the gloves allow, even when the crosshair drifts off the plush
        const t2 = tg || this.nearestGrab(eye, dir);
        if (t2) {
          this.instantGrab(t2, true);
          // Auto-Grip takes a second plush in the same motion
          if (T.autoRepeat && this.storeRoom()) { const t3 = this.nearestGrab(eye, dir); if (t3 && !(t3.type === t2.type && t3.i === t2.i && t3.j === t2.j && t3.k === t2.k && t3.idx === t2.idx)) this.collect(t3); }
        }
      }
      G.p = 0; this.ui.setGrab(0, false);
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
      if (this.isGuest()) { this.cmd('bulk', { i: tg.i, j: tg.j, k: tg.k }); this.sound.thump(0.15, 150); return true; }
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
    } else if (tg.type === 'nbody') {
      const b = this.netBodies.get(tg.id);
      if (!b) return false;
      item = { sp: b.sp, vr: b.vr };
      pos = new THREE.Vector3(b.x, b.y, b.z);
      this.netBodies.delete(tg.id);
      this.netSend({ t: 'take', id: tg.id });
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
      const dv = this.player.forward(new THREE.Vector3());
      for (let dk = -3; dk <= 3; dk++) for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
        if (!di && !dj && !dk) continue;
        const i = tg.i + di, j = tg.j + dj, k = tg.k + dk;
        if (!w.get(i, j, k)) continue;
        if (w.solid(i + 1, j, k) && w.solid(i - 1, j, k) && w.solid(i, j + 1, k) && w.solid(i, j - 1, k) && w.solid(i, j, k + 1) && w.solid(i, j, k - 1)) continue;
        // only plush further along the aim line, in a thin tube: straight in, never from the sides or underneath
        const vx = di * C, vy = dj * C, vz = dk * C;
        const along = vx * dv.x + vy * dv.y + vz * dv.z;
        if (along < 0.2) continue;
        const perp = Math.hypot(vx - dv.x * along, vy - dv.y * along, vz - dv.z * along);
        if (perp > 0.95) continue;
        near.push([perp * 3 + along, i, j, k]);
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
    // hands first (so you can throw them at the cart); once your hands are full the rest ride on the cart
    if (sp.volatile || S.carry.length < this.T.carry || !this.routeToCart(carried, pos)) {
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
        if (cosA < 0.95) continue;
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

  // P: punch your way out. Smashes the plush right in front of you (or above you when looking up) and knocks them loose.
  punch(auto, up) {
    const p = this.player, w = this.world, t = performance.now();
    if (this.punchT && t - this.punchT < 320) return;
    this.punchT = t;
    const dir = up ? new THREE.Vector3(0, 1, 0) : p.forward(new THREE.Vector3());
    const eye = p.eyePos(new THREE.Vector3());
    if (up) eye.y = p.pos.y + 0.9;
    let n = 0;
    const seen = new Set();
    for (const d of [0.4, 0.65, 0.9, 1.15, 1.4]) {
      const x = eye.x + dir.x * d, y = eye.y + dir.y * d, z = eye.z + dir.z * d;
      const ci = toI(x), cj = toJ(y), ck = toK(z);
      for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj, k = ck + dk;
        const key = i + ',' + j + ',' + k;
        if (seen.has(key)) continue;
        const cx = cellX(i), cy = cellY(j), cz = cellZ(k);
        if (Math.hypot(cx - x, cy - y, cz - z) > 0.75) continue;
        if (Math.hypot(cx - eye.x, cy - eye.y, cz - eye.z) > 2.0) continue;
        seen.add(key);
        const sp = w.get(i, j, k);
        if (!sp || sp === REMAINS || sp === CACHE || sp === BULK) continue;
        if (n >= 14 || this.sim.n > 2300) continue;
        const it = w.removeCell(i, j, k, false);
        if (!it) continue;
        this.sim.spawn(it.sp, it.vr, cx, cy, cz, dir.x * 3.2 + (Math.random() - 0.5) * 1.2, dir.y * 3.2 + 0.8, dir.z * 3.2 + (Math.random() - 0.5) * 1.2, 0);
        this.loosen(i, j, k, 0.8);
        n++;
      }
    }
    this.sound.thump(0.35, 110);
    this.shake = Math.max(this.shake, 0.12);
    if (n) { this.fx.dust(eye.x + dir.x, eye.y + dir.y, eye.z + dir.z, 6, 0.6, 0.6); this.dust && this.dust.add(eye.x + dir.x, eye.y + dir.y, eye.z + dir.z, 0.04 * n); }
    else if (!auto) this.ui.hint('Nothing in reach to punch. Face the plush wall (or look up) and tap <kbd>R</kbd> or right click.', 2);
  }

  holdGrab() { return this.grabWant || !!this.keys.KeyG; }

  // G: tap once to grab what you are looking at (it finishes by itself). With nothing in reach it drops what you carry.
  // F / left click. Empty hands: a tap grabs what you look at. Holding something: a single tap throws it.
  // Hold the button to keep grabbing until you are full (see interact).
  gPress() {
    const tg = this.curTargetRef;
    const special = tg && (tg.type === 'body' || tg.type === 'nbody' || tg.sp === BULK || tg.sp === REMAINS || tg.sp === CACHE);
    this.gDownAt = performance.now();
    if (this.S.carry.length) { this.holdBlock = true; this.throwOne(); return; }
    this.holdBlock = false;
    if (!tg) return;
    if (!this.storeRoom()) { this.ui.hint('Hands full. Walk to the SORT bin.', 2); return; }
    if (this.T.vac > 0 && !special) { this.vacT = 1.8; return; }
    this.instantGrab(tg);
  }

  instantGrab(tg, fast) {
    // the small timer left is a short cooldown between grabs; gloves shorten it
    this.grabCd = fast ? (0.05 + 0.1 * (this.T.grabTime / 1.5)) * (this.T.autoRepeat ? 0.5 : 1) : 0.12 + 0.28 * (this.T.grabTime / 1.5);
    this._lastGrabAt = performance.now();
    this.collect(tg);
    this.sound.soft(0.05);
    this.grab.p = 0;
  }

  bPress() {
    if (this.stowed) { this.stowed = false; this.rebuildTools(); this.ui.hint('Tool out. <kbd>B</kbd> uses it, <kbd>Q</kbd> puts it away.', 2); return; }
    const t = this.curTool();
    if (t.kind === 'hammer') { this.hammerHit(); return; }
    if (t.kind === 'cart') { this.useCart(); return; }
    if (t.kind === 'supply') { if (t.id === 'medkit') this.useMedkit(); else this.ui.hint('Air Canisters work by themselves: one kicks in when you run out of air while trapped.', 3); return; }
    this.placeCurrent(t);
  }

  // Hammer: removes the built thing you are aiming at (frames, props, belts, machines, bulkheads, the cart) and gives it back
  describeRef(ref) {
    if (!ref) return null;
    if (ref.kind === 'cart') return 'your cart';
    if (ref.kind === 'tile') { const t = this.logi.byId.get(ref.id); return t ? (t.detector ? 'Detector Gate' : t.type) : null; }
    if (ref.kind === 'mach') { const it = this.machines.items.get(ref.id); if (!it) return null; const e = it.ent; return e.type === 'frame' ? `${FRAME_TYPES[e.kind].name} (4x4)` : e.jack ? 'Hydraulic Jack' : e.glow ? 'Glow Stick' : e.type; }
    if (ref.kind === 'bulk') return 'Bulkhead Panel';
    return null;
  }
  hammerTarget() {
    const ref = this.findDeconRef();
    if (ref) return ref;
    const eye = this.renderer.camera.position, dir = this.player.forward(_fwd);
    const tg = this.findTarget(eye, dir);
    if (tg && tg.type === 'cell' && tg.sp === BULK) return { kind: 'bulk', i: tg.i, j: tg.j, k: tg.k };
    return null;
  }
  hammerHit() {
    this._hamLast = performance.now();
    const ref = this.hammerTarget();
    if (!ref) { this.sound.error(); this.ui.hint('The hammer removes what you built. Aim at a frame, prop, belt, machine or bulkhead.', 2.5); return; }
    if (ref.kind === 'bulk') { this.collect({ type: 'cell', i: ref.i, j: ref.j, k: ref.k, sp: BULK, vr: 0 }); this.sound.thump(0.25, 120); return; }
    this.deconstruct();
    this.sound.thump(0.3, 100); this.shake = Math.max(this.shake, 0.05);
  }

  refreshTuning() {
    this.T = this.tune();
    this.world.stabBonus = this.T.stabBonus;
    this.rebuildTools();
    this.ui.setCarry(this.S.carry, this.T.carry);
    this.sim.binCatch = this.T.binCatch;
    this.crew.sync();
    if (this.T.contractSlots && !this.isGuest()) this.contracts.fill();
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
    if (this.isGuest()) { const p = this.player, f = p.forward(_fwd); const dir = Math.abs(f.x) > Math.abs(f.z) ? (f.x > 0 ? 0 : 2) : (f.z > 0 ? 1 : 3); this.cmd('crew', { act: 'farmAhead', dir, x: p.pos.x, y: p.pos.y, z: p.pos.z }); return; }
    if (!this.S.crew || !this.S.crew.length) { this.ui.hint('No crew yet. Buy a Scrapper Bot in the terminal.', 3); return; }
    const p = this.player, f = p.forward(_fwd);
    const dir = Math.abs(f.x) > Math.abs(f.z) ? (f.x > 0 ? 0 : 2) : (f.z > 0 ? 1 : 3);
    const n = this.crew.orderAll(dir, p.pos.x, p.pos.y, p.pos.z);
    this.ui.hint(n ? `Crew: ${n} bot${n > 1 ? 's' : ''} sent digging ${['east', 'south', 'west', 'north'][dir]}.` : 'No pile that way within 120 m.', 3);
  }

  crewHomeAll() {
    if (this.isGuest()) { this.cmd('crew', { act: 'homeAll' }); return; }
    if (!this.S.crew || !this.S.crew.length) return;
    for (const b of this.S.crew) this.crew.goHome(b);
    this.ui.hint('Crew: heading home.', 2);
  }

  crewCommand(b, d) {
    if (this.isGuest()) { this.cmd('crew', { act: 'one', id: b.id, d: { d: d.d, a: d.a } }); return; }
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

  useTile(t, guestData) {
    const T = this.T, S = this.S;
    if (t.type === 'belt' && t.detector && !this.isGuest()) {
      if (t.alarm && t.held) { const it = t.held; t.held = null; t.alarm = false; this.logi.setGate(t, false); this.logi.recomputeHalt(); this.alarmGate = null; this.pickedUp(it, new THREE.Vector3(cellX(t.i), t.j * C + 0.8, cellZ(t.k))); return true; }
      this.ui.hint('Detector gate: all clear so far.', 2); return true;
    }
    if (this.isGuest()) {
      if (t.type === 'pole' || t.type === 'fan') { this.ui.hint(`${t.type === 'pole' ? 'Pole' : 'Fan'}: ${(t.pw ?? 0) > 0.05 ? 'powered' : 'no power'} (${Math.round((t.pw ?? 0) * 100)}%)`, 2.5); return true; }
      if (t.type === 'belt' && !t.detector) return false;
      const d = { id: t.id, room: T.carry - S.carry.length };
      if (t.type === 'gen') { d.items = []; for (let q = S.carry.length - 1; q >= 0; q--) if (species[S.carry[q].sp].rarity <= 2) d.items.push(S.carry.splice(q, 1)[0]); this.ui.setCarry(S.carry, T.carry); }
      this.cmd('tile', d);
      return true;
    }
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
      while (t.stored.length && S.carry.length < T.carry) { const it = t.stored.shift(); if (it.sp === NEEDLE) { this.foundNeedle('the vault'); return true; } S.carry.push(it); n++; }
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
    if (Math.random() < 0.5) this.fx.dust(x, y, z, 2, 0.5, 0.5);
  }

  // ---------------- carts and storage ----------------
  cartDist() { const c = this.S.cart; return c ? Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z) : 1e9; }
  storeRoom() { return this.S.carry.length < this.T.carry || (this.S.cart && this.cartDist() < 9 && this.S.cart.load.length < CART_CAP[this.S.cart.tier]); }

  // throw plush toward the cart: what lands in the tray stays there until the cart is near the bin
  catchInCart() {
    const c = this.S.cart, s = this.sim;
    if (!c || c.load.length >= CART_CAP[c.tier]) return;
    const d = cartDims(c.tier), cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
    const hx = d.w / 2 + 0.3, hz = d.l / 2 + 0.3;
    for (let i = s.n - 1; i >= 0; i--) {
      if (s.flag[i] !== 1) continue;
      const dy = s.y[i] - c.y;
      if (dy < 0.25 || dy > 0.3 + d.h + 1.0) continue;
      const dx = s.x[i] - c.x, dz = s.z[i] - c.z;
      if (Math.abs(dx) > 2 || Math.abs(dz) > 2) continue;
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      if (Math.abs(lx) > hx || Math.abs(lz) > hz) continue;
      if (s.vy[i] > 2) continue;
      const item = { sp: s.sp[i], vr: s.vr[i] };
      s.remove(i);
      c.load.push(item);
      this.fx.sparkle(c.x, c.y + 0.7, c.z, 4, 0.9, 0.9, 1);
      this.sound.soft(0.08);
      this.S.stats.cartCatch = (this.S.stats.cartCatch || 0) + 1;
      if (this.S.stats.cartCatch === 1) this.ui.hint('Nice shot! Plush that land in the cart stay there until the cart is near the SORT bin.', 5);
      if (c.load.length >= CART_CAP[c.tier]) break;
    }
  }

  // plush you grab ride on your cart when it is close, until it is full
  routeToCart(item, pos) {
    const c = this.S.cart;
    if (!c || this.cartDist() > 9 || c.load.length >= CART_CAP[c.tier]) return false;
    c.load.push(item);
    if (this.isGuest()) this.cmd('cartload', { sp: item.sp, vr: item.vr });
    this.fliers.push({ sp: item.sp, vr: item.vr, from: pos.clone(), to: new THREE.Vector3(c.x, c.y + 0.7, c.z), t: 0, dur: 0.3, arc: 0.7 });
    return true;
  }

  useCart(from) {
    if (this.isGuest()) { const p = this.player; this.cmd('cart', { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw }); return; }
    const S = this.S, c = S.cart;
    const fp = from || { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z, yaw: this.player.yaw };
    if (c) {
      const d = Math.hypot(c.x - fp.x, c.z - fp.z);
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
    this.cart.deploy(tier, { pos: fp, yaw: fp.yaw });
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

  // ======================= multiplayer =======================
  myName() { return (document.getElementById('mpName').value || this.S.settings.name || 'Player').slice(0, 14); }
  netSend(m) { if (this.net.open) this.net.send(m); }
  isGuest() { return this.net.open && this.net.role === 'guest' && this.guestReady; }

  // a guest cannot run the physics: it asks the host to spawn the plush and sees the result in the body stream
  spawnHook(sp, vr, x, y, z, vx, vy, vz, flag) {
    if (!this.isGuest()) return undefined;
    this.netSend({ t: 'spawn', a: [sp, vr, +x.toFixed(2), +y.toFixed(2), +z.toFixed(2), +vx.toFixed(2), +vy.toFixed(2), +vz.toFixed(2), flag] });
    return 0;
  }

  netRaycast(o, d, maxT) {
    let best = null, bt = maxT;
    for (const [id, b] of this.netBodies) {
      const cx = b.x - o.x, cy = b.y - o.y, cz = b.z - o.z;
      const t = cx * d.x + cy * d.y + cz * d.z;
      if (t < 0 || t > bt) continue;
      const px = cx - d.x * t, py = cy - d.y * t, pz = cz - d.z * t;
      if (px * px + py * py + pz * pz < 0.1) { bt = t; best = id; }
    }
    return best === null ? null : { id: best, t: bt };
  }

  wireMulti() {
    const $$ = (id) => document.getElementById(id);
    const status = (t) => { $$('mpStatus').textContent = t; };
    $$('mpName').value = this.S.settings.name || '';
    $$('btnMulti').onclick = () => { this.sound.init(); this.ui.open('multi'); };
    $$('btnMulti2').onclick = () => this.ui.open('multi');
    const hideAll = () => { for (const id of ['mpHostBox', 'mpJoinBox', 'mpHostShort', 'mpJoinShort']) $$(id).classList.add('hidden'); };
    $$('mpHost').onclick = async () => {
      if (this.mode !== 'play') { status('Start or continue your game first, then open Play Together from the pause menu.'); return; }
      this.S.settings.name = this.myName();
      hideAll(); $$('mpHostShort').classList.remove('hidden'); $$('mpCode').textContent = '····';
      status('Getting a code…');
      try { $$('mpCode').textContent = await this.net.hostShort(); status('Waiting for your friend…'); } catch (e) { status('Could not make a short code (' + e.message + '). Try the long codes below.'); }
    };
    $$('mpHostManual').onclick = async () => {
      if (this.mode !== 'play') { status('Start or continue your game first, then open Play Together from the pause menu.'); return; }
      this.S.settings.name = this.myName();
      hideAll(); $$('mpHostBox').classList.remove('hidden');
      status('Making a code…');
      try { $$('mpOffer').value = await this.net.host(); status('Send the code to your friend, then paste their reply below.'); } catch (e) { status('Could not make a code: ' + e.message); }
    };
    $$('mpCopyOffer').onclick = () => { $$('mpOffer').select(); document.execCommand('copy'); status('Copied.'); };
    $$('mpConnect').onclick = async () => { try { await this.net.finishHost($$('mpAnswerIn').value); status('Connecting…'); } catch (e) { status('That reply code did not work.'); } };
    $$('mpJoin').onclick = () => { hideAll(); $$('mpJoinShort').classList.remove('hidden'); status(''); $$('mpCodeIn').focus(); };
    $$('mpGo').onclick = async () => {
      status('Connecting…');
      try { await this.net.joinShort($$('mpCodeIn').value); status('Connected. Loading your friend\'s world…'); } catch (e) { status('Could not join: ' + e.message); }
    };
    $$('mpCodeIn').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $$('mpGo').click(); });
    $$('mpJoinManual').onclick = () => { hideAll(); $$('mpJoinBox').classList.remove('hidden'); status(''); };
    $$('mpMakeReply').onclick = async () => {
      status('Making a reply…');
      try { $$('mpReply').value = await this.net.join($$('mpOfferIn').value); status('Send the reply back. When your friend connects you will drop into their world.'); } catch (e) { status('That code did not work.'); }
    };
    $$('mpCopyReply').onclick = () => { $$('mpReply').select(); document.execCommand('copy'); status('Copied.'); };
  }

  netOpened() {
    this.ui.closeModalsSilently();
    this.netSend({ t: 'hi', name: this.myName(), v: typeof __BUILD__ === 'undefined' ? 'dev' : __BUILD__ });
    if (this.net.role === 'host') this.ui.toast({ icon: '🤝', title: 'Friend connected', text: 'They are joining your warehouse.', ms: 4000 });
    this.world.onSet = (i, j, k, sp, vr) => { this.netOut.push(i, j, k, sp, vr); };
    this.creakOut = [];
    if (this.net.role === 'host') this.world.onCreakCell = (i, j, k) => { if (this.creakOut.length < 200) this.creakOut.push(i, j, k); };
  }

  netClosed() {
    if (this.netBodies) this.netBodies.clear();
    if (this.net.role === 'guest') { this.S.crew = []; this.crew.clear(); this.crewViews = new Map(); this.S.cart = null; this.cart.clear(); }
    this.guestReady = false;
    if (this.remote) { this.remote.dispose(this.renderer.scene); this.remote = null; }
    if (this.world) { this.world.onSet = null; this.world.onCreakCell = null; }
    this.ui.toast({ icon: '👋', title: 'Friend left', text: 'The connection closed.', ms: 4000 });
  }

  netMessage(m) {
    if (this.net.role === 'guest' && !this.guestReady && m.t !== 'hi' && m.t !== 'world') { this.netPending.push(m); return; }
    switch (m.t) {
      case 'hi':
        if (m.v && typeof __BUILD__ !== 'undefined' && m.v !== __BUILD__) this.ui.toast({ icon: '⚠️', title: 'Different versions', text: `You are on ${__BUILD__}, your friend is on ${m.v}. Both press Ctrl/Cmd+Shift+R to load the latest, or things will not match.`, ms: 9000 });
        this.remote = this.remote || new RemotePlayer(this.renderer.scene, m.name);
        if (this.net.role === 'host') this.sendWorld();
        break;
      case 'world': {
        // guest: fall into the host's warehouse with a fresh character
        this.noSave = true;
        this.guestReady = false;
        this.ui.closeModalsSilently();
        this.startPlay(true, m.seed, () => {
          this.S.gameMin = m.gameMin || 0;
          this.world.onSet = (i, j, k, sp, vr) => { this.netOut.push(i, j, k, sp, vr); };
          this.guestReady = true;
          const q = this.netPending.splice(0);
          for (const x of q) this.netMessage(x);
        });
        break;
      }
      case 'diff': for (let n = 0; n < m.a.length; n += 3) { const id = m.a[n]; const i = id % NX, k = Math.floor(id / NX) % NZ, j = Math.floor(id / (NX * NZ)); this.world.restoreDiff(i, j, k, m.a[n + 1], m.a[n + 2]); } break;
      case 'ents': for (const e of m.list) this.remoteEnt(e); break;
      case 'ready': this.renderer.setWorld(this.world); break;
      case 'cells': {
        const w = this.world;
        w._remoteApply = true;
        for (let n = 0; n < m.a.length; n += 5) {
          const i = m.a[n], j = m.a[n + 1], k = m.a[n + 2], sp = m.a[n + 3], vr = m.a[n + 4];
          w.setCell(i, j, k, sp, vr);
          w.stabQueue.push({ i, j, k });
          if (sp === 0 && Math.random() < 0.3) this.fx.dust(cellX(i), cellY(j), cellZ(k), 2, 0.4, 0.5);
        }
        w._remoteApply = false;
        break;
      }
      case 'pos': if (this.remote) this.remote.set(m); break;
      case 'cmd': this.netCmd(m.c, m.d); break;
      case 'shared': this.applyShared(m); break;
      case 'dyn': this.applyDyn(m); break;
      case 'give': for (const it of m.items) { if (it.sp === NEEDLE) { this.foundNeedle('the vault'); continue; } if (this.S.carry.length < this.T.carry) this.S.carry.push(it); else this.sim.spawn(it.sp, it.vr, this.player.pos.x, this.player.pos.y + 1.2, this.player.pos.z, 0, 1, 0, 0); } this.ui.setCarry(this.S.carry, this.T.carry); break;
      case 'toast': this.ui.toast({ icon: m.icon, title: m.title, text: m.text, ms: 5000 }); break;
      case 'note': this.ui.showNote(m.entry); this.openModal('note'); break;
      case 'spawn': { const a = m.a; this.sim.spawn(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], 1); break; }
      case 'take': { const i = this.sim.indexOfId(m.id); if (i >= 0) this.sim.remove(i); break; }
      case 'lost': this.S.needleLost = true; this.ui.toast({ icon: '🔥', title: 'THE ONE is gone', text: 'It was thrown away without passing a gate.', cls: 'ach', ms: 12000 }); break;
      case 'sale': if (m.sp === NEEDLE) { this.needleLost('the SORT bin'); } else this.sell(m.sp, m.vr, { dist: m.dist, streak: true }); break;
      case 'bodies': {
        const seen = new Set();
        const a = m.a;
        for (let n = 0; n < a.length; n += 11) {
          const id = a[n]; seen.add(id);
          let b = this.netBodies.get(id);
          if (!b) { b = { id, x: a[n + 3], y: a[n + 4], z: a[n + 5], q: [a[n + 6], a[n + 7], a[n + 8], a[n + 9]] }; this.netBodies.set(id, b); }
          b.sp = a[n + 1]; b.vr = a[n + 2]; b.tx = a[n + 3]; b.ty = a[n + 4]; b.tz = a[n + 5]; b.tq = [a[n + 6], a[n + 7], a[n + 8], a[n + 9]]; b.sq = a[n + 10];
        }
        for (const id of [...this.netBodies.keys()]) if (!seen.has(id)) this.netBodies.delete(id);
        break;
      }
      case 'creak': {
        for (let n = 0; n < m.a.length; n += 3) { const i = m.a[n], j = m.a[n + 1], k = m.a[n + 2]; this.world.creaking.set((j * NZ + k) * NX + i, { i, j, k, t: 2.5 }); }
        if (m.a.length) this.onCreak(cellX(m.a[0]), cellY(m.a[1]), cellZ(m.a[2]), m.a.length / 3);
        break;
      }
      case 'boom': {
        const d = Math.hypot(m.x - this.player.pos.x, m.y - this.player.pos.y, m.z - this.player.pos.z);
        this.sound.rumble(d < 12 ? 1.2 : d < 30 ? 0.6 : 0.25);
        if (d < 18) this.shake = Math.max(this.shake, Math.min(1.2, 14 / (d + 6)));
        this.fx.dust(m.x, m.y, m.z, 16, 1.4, 1.6);
        break;
      }
      case 'ent+': this.remoteEnt(m.ent); break;
      case 'ent-': this.removeViewEnt(m.id); break;
      case 'say': this.chatLine(`${(this.remote && this.remote.name) || 'Friend'}: ${m.text}`); break;
      case 'time': this.S.gameMin = m.gameMin; break;
      case 'win': if (!this.S.ending) { this.S.ending = m.ending; this.mode = 'ended'; this.sound.found(); this.ui.toast({ icon: '🏆', title: `${m.by || 'Your friend'} found the One!`, text: 'You did it together.', ms: 8000 }); this.endTimer = 2.5; } break;
    }
  }

  // the host owns every structure; the guest keeps drawn copies that the host updates
  remoteEnt(e) {
    if (this.machines.items.has(e.id) || this.logi.byId.has(e.id)) return;
    const ent = { ...e, view: true };
    this.S.entities.push(ent);
    this.addEntity(ent);
  }

  removeViewEnt(id) {
    const tile = this.logi.byId.get(id);
    if (tile) { this.logi.remove(tile); }
    const it = this.machines.items.get(id);
    if (it) {
      if (it.ent.type === 'beacon') this.world.reserved.delete((it.ent.j * NZ + it.ent.k) * NX + it.ent.i);
      this.machines.disposeObj(it.obj); this.machines.root.remove(it.obj); this.machines.items.delete(id);
    }
    this.world.supports = this.world.supports.filter((s2) => s2.id !== id && s2.id !== 'shield' + id);
    this.S.entities = this.S.entities.filter((x) => x.id !== id);
  }

  stripEnt(e) { return JSON.parse(JSON.stringify(e, (k, v) => (['items', 'q', 'kept', 'stored', 'buf', 'path', 'trail', 'carry'].includes(k) ? undefined : v))); }

  sendWorld() {
    const w = this.world;
    this.netSend({ t: 'world', seed: this.S.seed, gameMin: this.S.gameMin });
    let buf = [];
    w.forEachDiff((id, sp, vr) => { buf.push(id, sp, vr); if (buf.length >= 9000) { this.netSend({ t: 'diff', a: buf }); buf = []; } });
    if (buf.length) this.netSend({ t: 'diff', a: buf });
    const list = this.S.entities.map((e) => this.stripEnt(e));
    for (let n = 0; n < list.length; n += 400) this.netSend({ t: 'ents', list: list.slice(n, n + 400) });
    this.sendShared();
    this.netSend({ t: 'ready' });
  }

  // a locally built structure the friend should see too
  netEnt(ent) { if (this.net.open && this.net.role === 'host') this.netSend({ t: 'ent+', ent: this.stripEnt(ent) }); }
  netEntRemove(ent) { this.netSend({ t: 'ent-', id: ent.id }); }

  // ---------- commands from the guest, run by the host ----------
  cmd(c, d) { this.netSend({ t: 'cmd', c, d }); }

  netCmd(c, d) {
    const S = this.S;
    switch (c) {
      case 'buy': this.buy(d.id); break;
      case 'craft': craft(this, d.id, d.n); break;
      case 'craftGear': craftGear(this, d.id); break;
      case 'place': { const tool = d.tool; this.plan = { ok: true, ent: d.ent }; this.placeCurrent(tool); this.plan = null; break; }
      case 'decon': this.doDecon(d); break;
      case 'tile': {
        const t = this.logi.byId.get(d.id);
        if (!t) break;
        if (t.type === 'vault') {
          const take = t.stored.splice(0, Math.max(0, d.room || 0));
          if (take.length) this.netSend({ t: 'give', items: take });
        } else if (t.type === 'gen') {
          const back = [];
          for (const it of d.items || []) if (!this.logi.accept(t, it, null)) back.push(it);
          if (back.length) this.netSend({ t: 'give', items: back });
          this.power.markDirty();
        } else this.useTile(t);
        break;
      }
      case 'feed': { const t = this.logi.byId.get(d.id); if (t) this.logi.accept(t, { sp: d.sp, vr: d.vr }, null); break; }
      case 'sell': this.sell(d.sp, d.vr, { dist: d.dist, streak: d.streak }); break;
      case 'reroll': this.contracts.reroll(d.i); break;
      case 'cart': this.useCart(d); break;
      case 'spend': if ((S.items[d.id] || 0) > 0) { S.items[d.id]--; if (S.items[d.id] <= 0) delete S.items[d.id]; } break;
      case 'cartload': if (S.cart && S.cart.load.length < CART_CAP[S.cart.tier]) S.cart.load.push({ sp: d.sp, vr: d.vr }); break;
      case 'bulk': { const w = this.world; if (w.get(d.i, d.j, d.k) === BULK) { w.setCell(d.i, d.j, d.k, 0, 0); w.stabQueue.push({ i: d.i, j: d.j, k: d.k }); this.giveItem('bulk'); } break; }
      case 'open': {
        const r = d.k === 'remains' ? this.openRemains(d.i, d.j, d.kk, true) : this.openCache(d.i, d.j, d.kk, true);
        if (r && r.text !== undefined) this.netSend({ t: 'toast', icon: '📦', title: 'Supply cache', text: r.text });
        else if (r && r.name) this.netSend({ t: 'note', entry: r });
        break;
      }
      case 'crew': {
        if (d.act === 'farmAhead') this.crew.orderAll(d.dir, d.x, d.y, d.z);
        else if (d.act === 'homeAll') this.crewHomeAll();
        else if (d.act === 'one') { const b = this.S.crew.find((x) => x.id === d.id); if (b) this.crewCommand(b, d.d); }
        break;
      }
    }
    this.sendShared();
  }

  sendShared() {
    const S = this.S;
    this.netSend({
      t: 'shared', money: S.money, te: S.totalEarned, up: S.up, gear: S.gear, items: S.items, mats: S.mats, boosts: S.boosts, contracts: S.contracts,
      gameMin: S.gameMin, golden: this.golden || 0, outage: this.outage || 0, ending: S.ending || null,
    });
  }

  applyShared(m) {
    const S = this.S;
    const key = JSON.stringify([m.up, m.gear, m.items, m.boosts, m.mats]);
    if (m.money > S.money + 0.5 && S.money > 0) this.ui.gain(m.money - S.money);
    S.money = m.money; S.totalEarned = m.te; S.contracts = m.contracts || [];
    this.golden = m.golden; this.outage = m.outage;
    this.power.outage = m.outage > 0;
    if (Math.abs((S.gameMin || 0) - m.gameMin) > 3) S.gameMin = m.gameMin;
    if (key !== this._sharedKey) {
      this._sharedKey = key;
      S.up = m.up; S.gear = m.gear; S.items = m.items; S.boosts = m.boosts; S.mats = m.mats || {};
      this.T = this.tune();
      this.world.stabBonus = this.T.stabBonus;
      this.rebuildTools();
      this.ui.setCarry(S.carry, this.T.carry);
    }
    this.ui.setMoney(S.money);
    if (this.ui.openModal === 'shop') this.ui.renderShop();
    if (this.ui.openModal === 'craft') this.ui.renderCraft();
    if (this.ui.openModal === 'crew') this.ui.renderCrew();
  }

  sendDyn() {
    const L = this.logi, p = this.player.pos, rp = this.remote ? this.remote.pos : null;
    const near = (x, z) => ((x - p.x) ** 2 + (z - p.z) ** 2 < 5600) || (rp && (x - rp.x) ** 2 + (z - rp.z) ** 2 < 5600);
    const belts = [], tiles = [];
    for (const t of L.tiles.values()) {
      if (t.type === 'belt') {
        if (t.items.length && near(cellX(t.i), cellZ(t.k))) { const a = [t.id]; for (const it of t.items) a.push(it.sp, it.vr, Math.round(it.t * 100)); belts.push(a); }
      } else tiles.push([t.id, Math.round((t.pw ?? 0) * 100), Math.round(t.burn || 0), t.mode || 0, t.off ? 1 : 0, t.i, t.k, t.q ? t.q.length : 0, t.filter ?? 7]);
    }
    const movers = [];
    for (const it of this.machines.items.values()) if (it.ent.type === 'borer') movers.push([it.ent.id, it.ent.i, it.ent.k, Math.round((it.ent.pw ?? 0) * 100)]); else if (it.ent.type === 'claw') movers.push([it.ent.id, 0, 0, Math.round((it.ent.pw ?? 0) * 100)]);
    const crew = this.S.crew.map((b) => {
      const sample = b.carry.slice(-4).flatMap((x) => [x.sp, x.vr]);
      return [b.id, b.name, b.color, b.level, Math.round(b.xp), b.state, b.carry.length, +b.battery.toFixed(2), +b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2), +(b.yaw % 6.2832).toFixed(2), sample, b.arm ? 1 : 0, b.aim || null, b.dir || 0];
    });
    const c = this.S.cart;
    const cart = c ? { tier: c.tier, mode: c.mode, x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), yaw: +c.yaw.toFixed(2), n: c.load.length, load: c.load.slice(-60).flatMap((x) => [x.sp, x.vr]) } : null;
    let grid = null;
    if (rp) { const net = this.power.nearest(rp.x, rp.y + 1, rp.z); if (net) grid = { supply: net.supply, demand: net.demand, sat: net.sat }; }
    const dust = rp ? this.dust.at(rp.x, rp.y + 1.2, rp.z) : 0;
    const alarms = []; for (const t of L.tiles.values()) if (t.type === 'belt' && t.detector && t.alarm) alarms.push(t.id);
    this.netSend({ t: 'dyn', belts, tiles, movers, crew, cart, grid, dust, alarms });
  }

  applyDyn(m) {
    const L = this.logi;
    for (const a of m.belts) {
      const t = L.byId.get(a[0]); if (!t) continue;
      const its = [];
      for (let n = 1; n < a.length; n += 3) its.push({ sp: a[n], vr: a[n + 1], t: a[n + 2] / 100 });
      t.items = its;
    }
    for (const a of m.tiles) {
      const t = L.byId.get(a[0]); if (!t) continue;
      t.pw = a[1] / 100; t.burn = a[2];
      if (t.type === 'sorter' && (t.mode !== a[3] || t.filter !== a[8])) { t.mode = a[3]; t.filter = a[8]; L.setSorterLook(t); }
      t.off = !!a[4];
      if (t.type === 'sorter' && t.q) { while (t.q.length < a[7]) t.q.push({ sp: 1, vr: 0, t: 0.5 }); t.q.length = a[7]; }
    }
    for (const a of m.movers) { const it = this.machines.items.get(a[0]); if (!it) continue; if (a[1]) { it.ent.i = a[1]; it.ent.k = a[2]; } it.ent.pw = a[3] / 100; }
    // crew
    const S = this.S;
    this.crewViews = this.crewViews || new Map();
    const list = [];
    for (const a of m.crew) {
      let b = this.crewViews.get(a[0]);
      if (!b) { b = { id: a[0], x: a[8], y: a[9], z: a[10], yaw: a[11], carry: [], trail: [], path: [] }; this.crewViews.set(a[0], b); }
      b.name = a[1]; b.color = a[2]; b.level = a[3]; b.xp = a[4]; b.state = a[5]; b.battery = a[7];
      b.gx = a[8]; b.gy = a[9]; b.gz = a[10]; b.gyaw = a[11]; b.dir = a[15];
      const sample = a[12], n = a[6];
      b.carry = new Array(n);
      for (let q = 0; q < n; q++) { const s2 = (q >= n - sample.length / 2) ? (q - (n - sample.length / 2)) * 2 : -1; b.carry[q] = s2 >= 0 ? { sp: sample[s2], vr: sample[s2 + 1] } : { sp: 1, vr: 0 }; }
      if (a[13]) { b.arm = performance.now() / 1000; b.aim = a[14]; }
      list.push(b);
    }
    for (const id of [...this.crewViews.keys()]) if (!list.some((b) => b.id === id)) this.crewViews.delete(id);
    S.crew = list;
    this.crew.sync();
    // cart
    const c = m.cart;
    if (!c) S.cart = null;
    else {
      if (!S.cart) S.cart = { tier: c.tier, x: c.x, y: c.y, z: c.z, yaw: c.yaw, mode: c.mode, load: [] };
      const sc = S.cart;
      sc.tier = c.tier; sc.mode = c.mode; sc.gx = c.x; sc.gy = c.y; sc.gz = c.z; sc.gyaw = c.yaw;
      const sample = c.load, n = c.n;
      sc.load = new Array(n);
      for (let q = 0; q < n; q++) { const s2 = (q >= n - sample.length / 2) ? (q - (n - sample.length / 2)) * 2 : -1; sc.load[q] = s2 >= 0 ? { sp: sample[s2], vr: sample[s2 + 1] } : { sp: 1, vr: 0 }; }
    }
    for (const t of L.tiles.values()) if (t.type === 'belt' && t.detector) { const on = m.alarms.includes(t.id); if (on !== !!t.alarm) { t.alarm = on; L.setGate(t, on); } }
    this.guestGrid = m.grid;
    this.dust.hostLevel = m.dust;
  }

  chatLine(text) {
    let box = document.getElementById('chat');
    if (!box) { box = document.createElement('div'); box.id = 'chat'; document.body.appendChild(box); }
    const d = document.createElement('div'); d.textContent = text; box.appendChild(d);
    while (box.children.length > 6) box.firstChild.remove();
    setTimeout(() => d.remove(), 9000);
  }

  netUpdate(dt) {
    if (!this.net.open) return;
    this._nt = (this._nt || 0) - dt;
    if (this.netOut.length && this._nt <= 0.0) {
      this.netSend({ t: 'cells', a: this.netOut.splice(0, 4000) });
    }
    this._np = (this._np || 0) - dt;
    if (this._np <= 0) {
      this._np = 0.1;
      const p = this.player;
      this.netSend({ t: 'pos', x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), lamp: this.lampOn !== false });
    }
    if (this.net.role === 'host') {
      this._nb = (this._nb || 0) - dt;
      if (this._nb <= 0) {
        this._nb = 0.12;
        const s = this.sim, p = this.player.pos, rp = this.remote ? this.remote.pos : null, a = [];
        for (let i = 0; i < s.n && a.length < 3300; i++) {
          const nearMe = (s.x[i] - p.x) ** 2 + (s.z[i] - p.z) ** 2 < 6400;
          const nearHim = rp && (s.x[i] - rp.x) ** 2 + (s.z[i] - rp.z) ** 2 < 6400;
          if (!nearMe && !nearHim) continue;
          a.push(s.bid[i], s.sp[i], s.vr[i], +s.x[i].toFixed(2), +s.y[i].toFixed(2), +s.z[i].toFixed(2), +s.q[i * 4].toFixed(3), +s.q[i * 4 + 1].toFixed(3), +s.q[i * 4 + 2].toFixed(3), +s.q[i * 4 + 3].toFixed(3), +s.sq[i].toFixed(2));
        }
        this.netSend({ t: 'bodies', a });
      }
      if (this.creakOut && this.creakOut.length) this.netSend({ t: 'creak', a: this.creakOut.splice(0, 90) });
      this._nd = (this._nd || 0) - dt;
      if (this._nd <= 0 && this.remote) { this._nd = 0.17; this.sendDyn(); }
      this._ns = (this._ns || 0) - dt;
      if (this._ns <= 0) { this._ns = 0.6; this.sendShared(); }
    }
    if (this.net.role === 'host') { this._ntm = (this._ntm || 0) - dt; if (this._ntm <= 0) { this._ntm = 6; this.netSend({ t: 'time', gameMin: this.S.gameMin }); } }
    if (this.remote) this.remote.update(dt);
    if (!this._nflush) this._nflush = 0;
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
        this._shift = { earn: this.S.totalEarned || 0, plush: this.S.stats.plush || 0, dug: this.S.stats.cells || 0, deaths: this.S.stats.deaths || 0 };
      } else {
        this.sound.dingDong(false);
        if (this._shift) {
          const sh = this._shift, S2 = this.S;
          const earn = Math.round((S2.totalEarned || 0) - sh.earn), plush = (S2.stats.plush || 0) - sh.plush, dug = (S2.stats.cells || 0) - sh.dug, died = (S2.stats.deaths || 0) - sh.deaths;
          this.ui.toast({ icon: '📋', title: 'Shift report', text: `Earned ◈ ${fmt(earn)}. ${plush} plush handled, ${dug} cells dug${died ? `, ${died} death${died > 1 ? 's' : ''}` : ''}. ${earn <= 0 ? 'Management is not pleased.' : earn > 50000 ? 'Management is suspicious.' : 'Management nods.'}`, ms: 10000 });
          this._shift = null;
        }
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
  openCache(i, j, k, forGuest) {
    if (this.isGuest()) { this.cmd('open', { k: 'cache', i, j, kk: k }); return true; }
    const w = this.world, S = this.S;
    w.setCell(i, j, k, 0, 0);
    w.stabQueue.push({ i, j, k });
    const dist = Math.hypot(cellX(i), cellZ(k));
    const tier = Math.max(0, Math.min(9, Math.floor(Math.log2(1 + dist / 60))));
    const rng = Math.random;
    const roll = rng();
    let text;
    const list = recipes(this).filter((r) => r.kind !== 'cart' && r.kind !== 'mat' && r.kind !== 'supply');
    if (roll < 0.22) {
      const ks = this.T.frames.slice(-3), mk = ks[(rng() * ks.length) | 0] || 'timber';
      const n = Math.max(8, Math.round((20 + tier * 14) * (0.6 + rng() * 0.8)));
      S.mats[mk] = (S.mats[mk] || 0) + n;
      text = `${n} x ${MATERIALS[mk].name} of building material`;
    } else if (roll < 0.5 && list.length) {
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
    if (forGuest) return { text };
    this.ui.toast({ icon: '📦', title: 'Supply cache', text, ms: 5000 });
    return true;
  }

  dropOne() {
    const S = this.S, it = S.carry[S.carry.length - 1];
    if (!it) return;
    const cam = this.renderer.camera, p = this.player;
    p.forward(_fwd);
    const belt = this.logi.pick(cam.position, _fwd, 2.8);
    if (belt && (belt.type === 'belt' || belt.type === 'sorter') && (this.isGuest() || this.logi.accept(belt, it, null))) {
      S.carry.pop(); this.ui.setCarry(S.carry, this.T.carry); this.sound.soft(0.08); this.registerDex(it.sp);
      if (this.isGuest()) this.cmd('feed', { id: belt.id, sp: it.sp, vr: it.vr });
      return;
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
        if (sink.kind === 'sell' || this.isGuest() || this.logi.accept(sink.ent, it, null)) {
          S.carry.pop(); this.ui.setCarry(S.carry, T.carry);
          if (sink.kind === 'sell') this.sell(it.sp, it.vr, { dist: 0, streak: true });
          else if (this.isGuest()) this.cmd('feed', { id: sink.ent.id, sp: it.sp, vr: it.vr });
          const cam = this.renderer.camera.position;
          this.fliers.push({ sp: it.sp, vr: it.vr, from: new THREE.Vector3(cam.x, cam.y - 0.5, cam.z), to: new THREE.Vector3(sink.x, sink.y, sink.z), t: 0, dur: 0.36, arc: 0.7 });
          this.heldPop = -0.5;
          this._adT = Math.max(0.05, 0.14 - S.carry.length * 0.004);
        } else this._adT = 0.2;
      }
    }
    const c = S.cart;
    if (c && c.load.length && this._adC <= 0 && !this.isGuest()) {
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
    if (sp === NEEDLE && s.own[i] !== 1) { this.needleLost('the SORT bin'); return; }
    const dist = s.flag[i] === 1 ? Math.hypot(s.ox[i] - this.hall.binPos.x, s.oz[i] - this.hall.binPos.z) : 0;
    if (s.own[i] === 1 && this.net.open) { this.netSend({ t: 'sale', sp, vr, dist }); return; }
    this.sell(sp, vr, { dist, streak: true, bonus: s.flag[i] === 1 });
  }

  sell(sp, vr, opt = {}) {
    const S = this.S;
    if (this.isGuest()) {
      // the host keeps the shared wallet; we only play the feedback
      if (opt.streak) { if (this.streak.t > 0) this.streak.n++; else this.streak.n = 1; this.streak.t = 4.5; }
      if (this.coinCd <= 0) { this.coinCd = 0.04; this.sound.coin(this.streak.n); }
      this.cmd('sell', { sp, vr, dist: opt.dist || 0, streak: !!opt.streak });
      return;
    }
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
    if (sp === NEEDLE) { this.needleLost('a machine'); return; }
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
    this.sellAuto(taken.sp, taken.vr, 1);
  }

  // ======================= building =======================
  updateBuild(tool, eye, dir) {
    const T = this.T, S = this.S;
    let plan = null, cost = 0;
    const yaw = this.player.yaw;
    if (tool.kind === 'cart' || tool.kind === 'supply') {
      this.plan = null; this.machines.setGhost(null); this.machines.showPreview(null, null); this.ui.setCross(false);
      this.ui.hint(tool.kind === 'cart' ? '<kbd>B</kbd> roll the cart out / park it · <kbd>Q</kbd> put away' : (tool.id === 'medkit' ? '<kbd>B</kbd> use a medkit · <kbd>Q</kbd> put away' : 'Air canister: automatic · <kbd>Q</kbd> put away'), 0.4);
      return;
    }
    if (tool.kind === 'hammer') {
      // hammer: show what B would remove, hold B to keep knocking things down
      this.plan = null; this.machines.setGhost(null); this.machines.showPreview(null, null); this.renderer.setGhost(0);
      const ref = this.hammerTarget(); const name = this.describeRef(ref);
      this.ui.setCross(!!ref);
      this.ui.hint(name ? `<kbd>B</kbd> hammer: remove <b>${name}</b> (you get it back) · hold <kbd>B</kbd> to keep going · <kbd>Q</kbd> put away` : 'Hammer: aim at something you built · <kbd>Q</kbd> put away', 0.4);
      if (name && this.keys.KeyB) { this._hamT = (this._hamT || 0) + 0.016; if (performance.now() - (this._hamLast || 0) > 220) { this._hamLast = performance.now(); this.hammerHit(); } }
      return;
    }
    if (tool.kind === 'frame') { plan = this.machines.planFrame(eye, dir, yaw, tool.fk); cost = FRAME_TYPES[tool.fk].cost; }
    else if (tool.kind === 'lantern') { plan = this.machines.planLantern(eye, dir); cost = 6; }
    else if (['marker', 'flare', 'glow', 'charge', 'dynamite', 'strut', 'jack'].includes(tool.kind)) { plan = this.machines.planSimple(tool.kind, eye, dir); }
    else if (tool.kind === 'beacon') { plan = this.machines.planBeacon(eye, dir); cost = this.beaconCost(); }
    else if (tool.kind === 'claw') {
      plan = this.machines.planRig(eye, dir); cost = this.rigCost();
      if (plan.ok && this.machines.count('claw') >= T.rigMax) plan = { ok: false, why: `Rig limit reached (${T.rigMax})`, ent: plan.ent };
    } else if (tool.kind === 'borer') {
      plan = this.machines.planBorer(eye, dir, yaw); cost = this.borerCost();
      if (plan.ok && this.machines.count('borer') >= T.borerMax) plan = { ok: false, why: `Borer limit reached (${T.borerMax})`, ent: plan.ent };
    }
    if (['belt', 'sorter', 'vault', 'mech', 'bulk', 'gen', 'pole', 'fan', 'gate'].includes(tool.kind)) { ({ plan, cost } = this.planLogi(tool, eye, dir, yaw)); }
    this.plan = plan; this.planCost = cost;
    if (['belt', 'sorter', 'vault', 'mech', 'bulk', 'gen', 'pole', 'fan', 'gate'].includes(tool.kind)) this.showCellGhost(tool, plan);
    else if (plan && plan.ent) this.machines.showPreview(tool, plan); else this.machines.showPreview(null, null);
    if (plan && plan.ok && this.keys.KeyB && (tool.kind === 'belt' || tool.kind === 'bulk' || (tool.kind === 'frame' && plan.ent.snap))) {
      const key = tool.kind === 'frame' ? `${plan.ent.cx.toFixed(1)},${plan.ent.cz.toFixed(1)},${plan.ent.y0.toFixed(1)}` : `${plan.ent.i},${plan.ent.j},${plan.ent.k}`;
      if (key !== this.lastPaint) { this.lastPaint = key; this.placeCurrent(tool); }
    }
    if (!this.keys.KeyB) this.lastPaint = '';
    if (plan) {
      if (!plan.ok) this.ui.hint(plan.why || '', 0.4);
      else this.ui.hint(`<kbd>B</kbd> set down${tool.kind === 'belt' ? ' (hold B to lay a line)' : ''}${tool.kind === 'frame' ? (plan.ent.snap ? ` · snaps ${plan.ent.snap} · hold B to lay a lining` : ` · 4x4 square: carves ${(plan.ent.clear || []).length} plush · place the next one on any side to snap`) : ''}${tool.ramp ? ' · <kbd>R</kbd> flips up/down' : ''}${tool.kind === 'borer' ? ' · digs the way you face' : ''} · <kbd>Q</kbd> stow`, 0.4);
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
    if (kind === 'gate') {
      const bt = this.logi.pick(eye, dir, 4.5);
      let pl;
      if (bt && bt.type === 'belt' && !bt.detector) pl = { ok: true, ent: { type: 'gatebelt', id: bt.id, i: bt.i, j: bt.j, k: bt.k, dir: bt.dir, rise: bt.rise || 0 } };
      else pl = this.logi.plan('belt', eye, dir, yaw, 0);
      // a gate has to scan before anything reaches a bin: keep it out of every bin's pull
      if (pl && pl.ok && pl.ent) {
        const r = this.gateClearance();
        if (this.sinkInRange(cellX(pl.ent.i), cellZ(pl.ent.k), r)) { pl.ok = false; pl.why = `Too close to a bin or sorter: it would suck plush in before the scan. Keep gates ${Math.ceil(r)} m away.`; }
      }
      return { plan: pl, cost: 0 };
    }
    const plan = this.logi.plan(kind, eye, dir, yaw, rise);
    if (plan.ok && plan.ent && kind === 'sorter' && this.gateInRange(cellX(plan.ent.i), cellZ(plan.ent.k), this.gateClearance())) { plan.ok = false; plan.why = `Too close to a detector gate: it would suck plush in before they are scanned. Keep sorters ${Math.ceil(this.gateClearance())} m from gates.`; }
    let cost = 0; const _unused = kind === 'belt' ? (rise ? 5 : 3) : kind === 'sorter' ? this.sorterCost() : kind === 'vault' ? 140 : kind === 'gen' ? this.genCost() : kind === 'pole' ? 20 : kind === 'fan' ? 240 : this.mechCost();
    if (plan.ok && kind === 'mech' && this.logi.count('mech') >= T.mechMax) { plan.ok = false; plan.why = `Mech limit reached (${T.mechMax})`; }
    return { plan, cost };
  }

  gateClearance() { return this.T.autoDump + 1.5; }

  // any place plush get pulled in: the bin, depots, sorting boxes
  sinkInRange(x, z, r) {
    const bp = this.hall.binPos;
    if (Math.hypot(x - bp.x, z - bp.z) < r) return true;
    for (const it of this.machines.items.values()) if (it.ent.type === 'beacon' && Math.hypot(x - it.ent.x, z - it.ent.z) < r) return true;
    for (const t of this.logi.tiles.values()) if (t.type === 'sorter' && Math.hypot(x - cellX(t.i), z - cellZ(t.k)) < r) return true;
    return false;
  }

  gateInRange(x, z, r) {
    for (const t of this.logi.tiles.values()) if (t.type === 'belt' && t.detector && Math.hypot(x - cellX(t.i), z - cellZ(t.k)) < r) return true;
    return false;
  }

  // the free Welcome Gate: set on the floor of the bay, well outside the bin's pull, so you can walk through it with a full bag
  ensureFreeGate() {
    const S = this.S, w = this.world;
    if (this.isGuest()) return;
    if (S.entities.some((e) => e.free)) return;
    if (S.freeGate === 'gone') return;
    const r = this.gateClearance() + 3;
    const bp = this.hall.binPos;
    let spot = null;
    for (const [x, z] of [[0, 10], [0, 11], [-3, 10], [3, 10], [-5, 8], [5, 8], [0, 9], [-7, 6]]) {
      const i = toI(x), k = toK(z);
      if (w.solid(i, 0, k) || w.solid(i, 1, k) || w.solid(i, 2, k) || w.solid(i + 1, 0, k) || w.solid(i - 1, 0, k)) continue;
      if (Math.hypot(x - bp.x, z - bp.z) < r) continue;
      spot = [i, k]; break;
    }
    if (!spot) return;
    const e = { id: this.nextId(), type: 'belt', i: spot[0], j: 0, k: spot[1], dir: 1, rise: 0, items: [], detector: true, free: true, fixed: true };
    S.entities.push(e); this.addEntity(e);
    S.freeGate = 'placed';
  }

  // walking through any gate scans your bag (and cart)
  playerGateScan(dt) {
    const p = this.player.pos, S = this.S;
    this._gateCd = (this._gateCd || 0) - dt;
    for (const t of this.logi.tiles.values()) {
      if (t.type !== 'belt' || !t.detector) continue;
      const dx = p.x - cellX(t.i), dz = p.z - cellZ(t.k);
      if (Math.abs(dx) > 3 || Math.abs(dz) > 3) { if (t._pIn) t._pIn = false; continue; }
      const d = t.dir || 0;
      const ax = [1, 0, -1, 0][d], az = [0, 1, 0, -1][d];
      const along = dx * ax + dz * az, lat = dx * -az + dz * ax;
      const inside = Math.abs(along) < 0.45 && Math.abs(lat) < 0.95 && p.y < t.j * C + 2.2;
      if (inside && !t._pIn && this._gateCd <= 0) {
        this._gateCd = 0.6;
        const cartN = S.cart && Math.hypot(S.cart.x - cellX(t.i), S.cart.z - cellZ(t.k)) < 4 ? S.cart.load.length : 0;
        const all = [...S.carry, ...(cartN ? S.cart.load : [])];
        if (all.some((x) => x.sp === NEEDLE)) { this.logi.setGate(t, true); this.foundNeedle('the gate'); }
        else {
          this.logi.setGate(t, false); t.flash = 0.35;
          this.sound.tone('sine', 1250, 1250, 0.07, 0.05);
          S.stats.scans = (S.stats.scans || 0) + all.length;
          this.ui.hint(`<b>SCAN CLEAR</b> ${all.length} plush${cartN ? ' (with cart)' : ''}. The One is not in your bag.`, 2.5);
        }
      }
      t._pIn = inside;
    }
  }

  showCellGhost(tool, plan) {
    if (!plan || !plan.ent) { this.machines.setGhost(null); return; }
    const e = plan.ent;
    const key = `${tool.kind}${plan.ok}${e.dir}${e.rise || 0}`;
    if (this.machines.ghostKey !== key) {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: plan.ok ? 0x5dffa0 : 0xff5a4a, transparent: true, opacity: 0.4, depthWrite: false });
      const flat = tool.kind === 'belt' || tool.kind === 'gate';
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
    if (this.isGuest()) { this.cmd('place', { tool: { id: tool.id, kind: tool.kind, fk: tool.fk, ramp: tool.ramp }, ent: plan.ent }); this.sound.place(); return; }
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
    if (tool.kind === 'gate' && e.type === 'gatebelt') {
      const tile = this.logi.byId.get(e.id);
      if (tile && !tile.detector) {
        tile.detector = true; this.logi.buildGate(tile);
        this.netSend({ t: 'ent-', id: tile.id }); this.netSend({ t: 'ent+', ent: this.stripEnt(tile) });
        this.sound.place(); this.S.stats.gates = (this.S.stats.gates || 0) + 1; this.rebuildTools();
      }
      return;
    }
    if (['belt', 'sorter', 'vault', 'mech', 'gen', 'pole', 'fan', 'gate'].includes(tool.kind)) {
      ent = { id, type: tool.kind === 'gate' ? 'belt' : tool.kind, i: e.i, j: e.j, k: e.k, dir: e.dir, rise: e.rise || 0 };
      if (tool.kind === 'gate') { ent.detector = true; S.stats.gates = (S.stats.gates || 0) + 1; }
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
    if (tool.kind === 'frame') {
      ent = { id, type: 'frame', kind: e.kind, axis: e.axis, cx: e.cx, cz: e.cz, y0: e.y0, w: e.w, h: e.h, gm: e.gm, glo: e.glo, gj: e.gj }; S.stats.props++;
      // building a frame carves out its 4x4 section; the crew salvages the plush
      let carved = 0;
      for (const [ci, cj, ck] of e.clear || []) { const rm = this.world.removeCell(ci, cj, ck, true); if (rm) { carved++; S.stats.cells++; this.sellAuto(rm.sp, rm.vr, 0.6); } }
      if (carved) { this.fx.dust(e.cx, e.y0 + 1.2, e.cz, 8, 1, 1); this.ui.hint(`Frame built: carved a 4x4 section, salvaged ${carved} plush.`, 3); }
    }
    else if (tool.kind === 'lantern') { ent = { id, type: 'lantern', x: e.x, y: e.y, z: e.z }; S.stats.lanterns++; }
    else if (tool.kind === 'marker') { ent = { id, type: 'marker', x: e.x, y: e.y, z: e.z }; }
    else if (tool.kind === 'glow') { ent = { id, type: 'flare', glow: true, x: e.x, y: e.y, z: e.z, born: S.stats.playSecs }; }
    else if (tool.kind === 'flare') { ent = { id, type: 'flare', x: e.x, y: e.y, z: e.z, born: S.stats.playSecs }; }
    else if (tool.kind === 'strut') { ent = { id, type: 'strut', x: e.x, y: e.y, z: e.z }; S.stats.props++; }
    else if (tool.kind === 'jack') { ent = { id, type: 'strut', jack: true, x: e.x, y: e.y, z: e.z }; S.stats.props++; }
    else if (tool.kind === 'charge') { ent = { id, type: 'charge', x: e.x, y: e.y, z: e.z, fuse: 6, tier: this.T.charges }; this.ui.hint('Fuse lit. <b>Run.</b>', 3); this.sound.tone('square', 900, 900, 0.05, 0.08); }
    else if (tool.kind === 'dynamite') { ent = { id, type: 'charge', dyn: true, x: e.x, y: e.y, z: e.z, fuse: 4, tier: 0 }; this.ui.hint('Fuse lit. <b>Run.</b>', 3); this.sound.tone('square', 1100, 1100, 0.05, 0.08); }
    else if (tool.kind === 'beacon') { ent = { id, type: 'beacon', x: e.x, y: e.y, z: e.z, i: e.i, j: e.j, k: e.k }; this.onBeaconPlaced(ent); }
    else if (tool.kind === 'claw') { ent = { id, type: 'claw', x: e.x, y: e.y, z: e.z, ry: Math.random() * 6.28 }; S.stats.rigs++; this.rebuildTools(); }
    else if (tool.kind === 'borer') { ent = { id, type: 'borer', i: e.i, j: e.j, k: e.k, dx: e.dx, dz: e.dz, w: e.w, h: e.h, x: e.x, y: e.y, z: e.z }; S.stats.borers++; this.rebuildTools(); }
    S.entities.push(ent);
    this.machines.setGhost(null);
    this.rebuildTools();
    void left;
    this.machines.add(ent);
    this.sound.place();
    this.shake = Math.max(this.shake, 0.05);
    this.fx.dust(e.cx ?? e.x, (e.y0 ?? e.y) + 0.3, e.cz ?? e.z, 8, 0.7, 0.8);
    if (tool.kind === 'frame') {
      // re-evaluate nearby roof: creaking cells may now be safe
      this.ui.hint('Frame set. It anchors the roof around it: the unsupported tunnel length starts again from here. Place the next one on any side to extend.', 3);
    }
    this.trackDepth();
  }

  // what are we looking at that can be taken down?
  findDeconRef() {
    const eye = this.renderer.camera.position, dir = this.player.forward(_fwd);
    if (this.S.cart && this.cartDist() < 3.2) { _v2.set(this.S.cart.x - eye.x, this.S.cart.y + 0.5 - eye.y, this.S.cart.z - eye.z); if (_v2.length() < 3.2 && _v2.normalize().dot(dir) > 0.7) return { kind: 'cart' }; }
    const tile = this.logi.pick(eye, dir, 3.6);
    if (tile) return { kind: 'tile', id: tile.id };
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
    return best ? { kind: 'mach', id: best.ent.id } : null;
  }

  deconstruct() {
    const ref = this.findDeconRef();
    if (!ref) return;
    if (this.isGuest()) { this.cmd('decon', ref); this.sound.thump(0.12, 140); return; }
    this.doDecon(ref);
  }

  doDecon(ref) {
    if (ref.kind === 'cart') { this.stowCart(); return; }
    if (ref.kind === 'tile') {
      const tile = this.logi.byId.get(ref.id);
      if (!tile) return;
      if (tile.fixed) { this.ui.hint('The Welcome Gate is bolted to the floor. It is yours for free, and it stays.', 3); return; }
      this.logi.remove(tile);
      this.S.entities = this.S.entities.filter((x) => x.id !== tile.id);
      this.netSend({ t: 'ent-', id: tile.id });
      const give = [...(tile.items || []), ...(tile.q || []), ...(tile.kept || []), ...(tile.stored || []), ...(tile.buf || [])];
      for (const it of give) if (this.S.carry.length < this.T.carry) this.S.carry.push({ sp: it.sp, vr: it.vr }); else this.sim.spawn(it.sp, it.vr, cellX(tile.i), tile.j * C + 0.5, cellZ(tile.k), 0, 1, 0, 0);
      this.giveItem(tile.type === 'belt' ? (tile.detector ? 'gate' : tile.rise ? 'ramp' : 'belt') : tile.type);
      this.ui.setCarry(this.S.carry, this.T.carry);
      this.sound.thump(0.15, 140);
      if (['sorter', 'mech', 'gen', 'fan'].includes(tile.type)) this.rebuildTools();
      this.power.markDirty();
      return;
    }
    const best = this.machines.items.get(ref.id);
    if (!best) return;
    const e = best.ent;
    this.giveItem(e.type === 'frame' ? 'frame:' + e.kind : e.type === 'lantern' ? 'lantern' : e.jack ? 'jack' : e.glow ? 'glow' : e.type);
    if (e.type === 'beacon') this.world.reserved.delete((e.j * NZ + e.k) * NX + e.i);
    this.machines.disposeObj(best.obj);
    this.machines.root.remove(best.obj);
    this.machines.items.delete(e.id);
    this.netSend({ t: 'ent-', id: e.id });
    this.S.entities = this.S.entities.filter((x) => x.id !== e.id);
    this.world.supports = this.world.supports.filter((s) => s.id !== e.id && s.id !== 'shield' + e.id);
    this.sound.thump(0.15, 120);
    if (e.type === 'claw' || e.type === 'borer') this.rebuildTools();
  }

  // ======================= abandoned gear =======================
  openRemains(i, j, k, forGuest) {
    if (this.isGuest()) { this.cmd('open', { k: 'remains', i, j, kk: k }); return true; }
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
    if (forGuest) return entry;
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
    this.netSend({ t: 'boom', x: ent.x, y: ent.y, z: ent.z });
    if (this.isGuest()) { this.fx.burst(ent.x, ent.y + 0.6, ent.z, 50, 1, 0.6, 0.2, 6, 0.14, 1.2); this.fx.dust(ent.x, ent.y + 0.6, ent.z, 24, 2.0, 2.5); this.sound.rumble(1.2); const pd = Math.hypot(ent.x - this.player.pos.x, ent.z - this.player.pos.z); if (pd < 40) this.shake = Math.max(this.shake, Math.min(1.4, 22 / (pd + 4)) * this.T.shakeMul); return; }
    const w = this.world, S = this.S;
    const tier = ent.tier || 1;
    const R = ent.dyn ? 2.2 : [0, 3, 4, 5][tier];
    const ci = toI(ent.x), cj = toJ(ent.y + 0.3), ck = toK(ent.z);
    let n = 0;
    const RI = Math.ceil(R);
    for (let dk = -RI; dk <= RI; dk++) for (let dj = -RI; dj <= RI; dj++) for (let di = -RI; di <= RI; di++) {
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
      this.hurtPlayer(Math.max(15, 55 - pd * 12), 'got too close to the blast');
      this.ui.hint('That was too close.', 3);
    }
    S.stats.blasts = (S.stats.blasts || 0) + 1;
    // a blast shakes the whole slope around the hole
    for (let q = 0; q < 30; q++) this.slide.trigger(ci + ((Math.random() * 2 - 1) * (RI + 3)) | 0, cj + ((Math.random() * 2 - 1) * (RI + 2)) | 0, ck + ((Math.random() * 2 - 1) * (RI + 3)) | 0, 2.2);
    // loosen everything around the hole
    for (let q = 0; q < 12; q++) w.stabQueue.push({ i: ci + ((Math.random() * 2 - 1) * (R + 2)) | 0, j: cj + ((Math.random() * 2 - 1) * (R + 1)) | 0, k: ck + ((Math.random() * 2 - 1) * (R + 2)) | 0 });
  }

  // ======================= volatile plush =======================
  lightFuse(item) {
    this.fuses = this.fuses || [];
    this.fuses.push({ item, t: 2.4 });
    this.ui.toast({ icon: '🧨', title: 'Fuse lit!', text: 'A Razzo plush is ticking. Throw it (Z) or drop it (F) now.', ms: 2600 });
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

  updateTrapped(dt) {
    const p = this.player, T = this.T;
    const trapped = this.mode === 'play' && !this.blacking && (p.embedded || p.buried > 1.2);
    const max = 60 + 30 * (T.airTank || 0);
    if (trapped) {
      if (!this.trapOn) { this.trapOn = true; if (this.airLeft === undefined || this.airLeft > max) this.airLeft = max; this.ui.hint('Trapped! <kbd>R</kbd> or right click punches what is in front of you, hold <kbd>Space</kbd> to punch up. Get out before the air runs out.', 6); }
      this.trapFree = 0;
      this.airLeft = Math.max(0, (this.airLeft ?? max) - dt);
      this.trapPulse = (this.trapPulse || 0) + dt * (2 + (1 - this.airLeft / max) * 5);
      const pulse = 0.5 + 0.5 * Math.sin(this.trapPulse * Math.PI);
      this.ui.setTrap(true, this.airLeft, this.airLeft / max, pulse, this.suffocating);
      if (Math.floor(this.trapPulse) !== this._lastBeat) { this._lastBeat = Math.floor(this.trapPulse); this.sound.thump(0.1 + 0.12 * (1 - this.airLeft / max), 70); }
      if (this.airLeft <= 0 && (this.S.items.canister || 0) > 0) {
        if (this.isGuest()) this.cmd('spend', { id: 'canister' });
        this.S.items.canister--; if (this.S.items.canister <= 0) delete this.S.items.canister;
        this.airLeft = 40;
        this.ui.toast({ icon: '🫧', title: 'Air canister', text: '40 more seconds. Dig!', ms: 3500 }); this.sound.ach();
      }
      this.suffocating = this.airLeft <= 0;
      if (this.suffocating) this.hurtPlayer(14 * dt, 'suffocated under the pile');
    } else if (this.trapOn) {
      this.suffocating = false;
      this.trapFree = (this.trapFree || 0) + dt;
      if (this.trapFree > 1.5) { this.trapOn = false; this.airLeft = undefined; this.ui.setTrap(false); }
    }
  }

  blackout(why) {
    this.blacking = true;
    this.ui.blackout(true);
    this.sound.thump(0.3, 70);
    setTimeout(() => {
      const S = this.S;
      for (const it of S.carry.splice(0, S.carry.length)) this.sim.spawn(it.sp, it.vr, this.player.pos.x + (Math.random() - 0.5), this.player.pos.y + 1, this.player.pos.z + (Math.random() - 0.5), 0, 2, 0, 0);
      this.ui.setCarry(S.carry, this.T.carry);
      this.dust.lung = 0.35;
      this.recall();
      this.ui.toast({ icon: '😵', title: 'You passed out', text: why === 'air' ? 'You ran out of air. You woke up at the nearest depot. Whatever you carried spilled in the tunnel.' : 'Dust. You woke up at the nearest depot. Whatever you carried spilled in the tunnel.', ms: 7000 });
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
  loosen(i, j, k) {
    // taking plush out of the pile nudges its neighbours a very little (the slide rules decide if anything moves)
    // grabbing never starts a slide: tunnels are judged by the tunnel rule in world.js
  }

  // feel a slide nearby: rumble, shake, dust. The first one teaches you why not to climb.
  slideFeel(pd) {
    const near = 1 - pd / 22;
    // only a real slide (several topples at once) shakes the screen; a stray plush rolling does not
    if (this.slide.recent < 3) return;
    this.shake = Math.max(this.shake, Math.min(0.8, 0.05 * this.slide.recent * near) * this.T.shakeMul);
    if (this.slideSnd === undefined || performance.now() - this.slideSnd > 450) { this.slideSnd = performance.now(); this.sound.rumble(0.25 + 0.5 * near); this.sound.soft(0.1); }
    if (pd < 12 && !this._slideHint) { this._slideHint = true; this.ui.hint('A slide! The pile is not stable under you or on a steep face. Stay low, brace with frames, or stay off it.', 6); }
  }

  treadOn(strength, stomp) {
    const fc = this.player.footCell, p = this.player;
    if (!fc || p.pos.y < 0.4) return;
    // climbing is a gamble: the higher you are and the more you carry, the harder you load the face under you.
    // Near the floor this stays far below what the slide rules need, so walking on a low pile is safe.
    // Climbing Gear (pitons, rope, grippy soles) takes 25% off the load per tier
    if (!this.isGuest() && p.pos.y > 8) this.slide.trigger(fc.i, fc.j, fc.k, (0.1 + p.pos.y * 0.1 + this.S.carry.length * 0.02 + strength * 0.12 + (stomp ? 0.3 : 0)) * (1 - 0.25 * this.T.climb));
  }

  onKick(i, j, k, vx, vy, vz, speed, en) {
    this.kickBudget = this.kickBudget ?? 6;
    if (this.kickBudget <= 0 || speed < 3.2) return;
    if (Math.random() > 0.08 * (speed - 2.8)) return;
    { const e = en > 0 ? en * 0.5 : (speed > 6 ? Math.min(1.2, 0.05 + speed * 0.04) : 0); if (e > 0.3 && !this.isGuest()) this.slide.trigger(i, j, k, e); }
    this.kickBudget--;
  }

  // ======================= stability + collapse =======================
  onCreak(x, y, z, n) {
    const d = Math.hypot(x - this.player.pos.x, y - this.player.pos.y, z - this.player.pos.z);
    if (d < 40) this.sound.creak(Math.max(0.05, 0.28 - d * 0.006));
    this.S.stats.creaks++;
    if (d < 10 && !this._creakHint) { this._creakHint = true; this.ui.hint('The roof is creaking! Back away, or place a <kbd>Frame</kbd> to hold it.', 5); }
  }

  releaseCell(i, j, k) {
    if (this.sim.n > 1300) return false;
    const it = this.world.removeCell(i, j, k, false);
    if (!it) return true;
    const x = cellX(i), y = cellY(j), z = cellZ(k);
    this.sim.spawn(it.sp, it.vr, x, y, z, (Math.random() - 0.5) * 0.8, -0.8, (Math.random() - 0.5) * 0.8, 2);
    const d = Math.hypot(x - this.player.pos.x, y - this.player.pos.y, z - this.player.pos.z);
    if (this.collapseT > 2.5) {
      this.S.stats.collapses++;
      this.afters = this.afters || [];
      this.afters.push({ i, j, k, t: 3 + Math.random() * 5, n: 1 + ((Math.random() * 2) | 0) });
      this.collapseT = 0;
      this.sound.rumble(d < 12 ? 1.2 : d < 30 ? 0.6 : 0.25);
      this.netSend({ t: 'boom', x: +x.toFixed(1), y: +y.toFixed(1), z: +z.toFixed(1) });
      if (d < 18) this.shake = Math.max(this.shake, Math.min(1.2, 14 / (d + 6)));
    }
    this.collapseT = Math.min(this.collapseT, 1.2);
    if (Math.random() < 0.25) this.fx.dust(x, y, z, 4, 0.9, 0.9);
    // a real cave-in: the plush piled above a failing roof comes down with it
    if (!this._inCascade) {
      this._inCascade = true;
      const w = this.world;
      const over = Math.max(0, w.topAt(i, k) - j - 1);
      if (!this.isGuest()) this.slide.trigger(i, j + 1, k, 1.6);
      if (over > 4 && Math.random() < 0.55) {
        const H = Math.min(4, 1 + Math.floor(over / 10));
        let n = 0;
        for (let h = 1; h <= H; h++) {
          for (const [a, b] of (h <= 2 ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]])) {
            if (n >= 10 || this.sim.n > 1200) break;
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
    if (d < 18 && v > 5) { this.sound.debris(Math.min(0.2, v * 0.015) * (1 - d / 22)); if (Math.random() < 0.5) this.fx.dust(x, y, z, 3, 0.7, 0.7); }
  }
  onPlayerHit(v) {
    if (v > 5) { this.shake = Math.max(this.shake, 0.35 * this.T.shakeMul); this.sound.thump(0.2, 130); if (this.T.shakeMul === 1) this.ui.hurt(0.25); }
    // falling plush hurt: a trickle is harmless, an avalanche is not
    if (v > 4.5 && this.dmgCd <= 0) { this.dmgCd = 0.22; this.hurtPlayer((v - 4) * 4.5, 'were crushed under falling plush'); }
  }

  // ---- health. Death is not the end: you wake up on the floor of the sorting bay, the plush you carried spilled.
  useMedkit() {
    const S = this.S;
    if (!(S.items.medkit > 0)) { this.ui.hint('No medkits. Unlock First Aid in the terminal and craft some.', 2.5); return; }
    if (this.hp >= this.hpMax - 1) { this.ui.hint('You are fine.', 1.5); return; }
    if (this.isGuest()) this.cmd('spend', { id: 'medkit' });
    S.items.medkit--; if (S.items.medkit <= 0) delete S.items.medkit;
    this.hp = Math.min(this.hpMax, this.hp + 50);
    S.stats.medkits = (S.stats.medkits || 0) + 1;
    this.sound.ach(); this.ui.hint(`Patched up. ${S.items.medkit || 0} medkit${(S.items.medkit || 0) === 1 ? '' : 's'} left.`, 2);
  }

  hurtPlayer(n, why) {
    if (this.mode !== 'play' || this.dead) return;
    n *= 1 - Math.min(0.6, this.T.dmgCut || 0);
    this.hp = Math.max(0, this.hp - n);
    this.hurtT = 0;
    this.ui.hurt(Math.min(0.6, 0.2 + n * 0.02));
    if (this.hp <= 0) this.die(why);
  }

  die(why) {
    if (this.dead) return;
    this.dead = true; this.blacking = true;
    this.ui.blackout(true);
    this.ui.setTrap(false);
    this.sound.thump(0.4, 60);
    setTimeout(() => {
      const S = this.S;
      for (const it of S.carry.splice(0, S.carry.length)) this.sim.spawn(it.sp, it.vr, this.player.pos.x + (Math.random() - 0.5), this.player.pos.y + 1, this.player.pos.z + (Math.random() - 0.5), 0, 2, 0, 0);
      this.ui.setCarry(S.carry, this.T.carry);
      this.hp = this.hpMax; this.airLeft = undefined; this.trapOn = false; this.suffocating = false; this.dust.lung = 0.2;
      this.player.buried = 0;
      this.recall();
      S.stats.deaths = (S.stats.deaths || 0) + 1;
      this.ui.toast({ icon: '💀', title: 'You died', text: `You ${why}. You woke up on the floor of the sorting bay. Whatever you carried spilled where it happened.`, ms: 8000 });
      setTimeout(() => { this.ui.blackout(false); this.blacking = false; this.dead = false; }, 800);
    }, 1400);
  }

  updateVitals(dt) {
    const p = this.player;
    this.dmgCd -= dt; this.hurtT += dt;
    const hm = 100 + (this.T.hpBonus || 0);
    if (hm !== this.hpMax) { this.hp += hm - this.hpMax; this.hpMax = hm; }
    if (this.mode === 'play' && !this.dead && this.hp < this.hpMax && this.hurtT > 7 && !this.suffocating) this.hp = Math.min(this.hpMax, this.hp + 2.2 * dt);
    const max = 60 + 30 * (this.T.airTank || 0);
    const air = this.airLeft === undefined ? 1 : Math.max(0, this.airLeft / max);
    this.ui.setVitals(this.hp / this.hpMax, air, this.trapOn, this.suffocating, this.dust.lung);
    void p;
  }

  // a creaking roof sheds plush: the first exposed ceiling cell above this spot lets go
  dropRoof(i, j, k) {
    const w = this.world;
    for (let dj = -1; dj <= 5; dj++) {
      const jj = j + dj;
      if (w.get(i, jj, k) && !w.solid(i, jj - 1, k)) { this.releaseCell(i, jj, k); return true; }
    }
    return false;
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
      if (!this.isGuest()) this.slide.trigger(i, j, k, 1.0);
      this.onCreak(cellX(i), cellY(j), cellZ(k), 1);
      this.dropRoof(i, j, k);
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
    if (this.S.ending === 'exit' || this.S.needleLost) return null;
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
    } else if (this.T.slopeProbe && p.footCell && p.onGround && p.pos.y > 0.6 && this.slide.unstableAt(p.footCell.i, p.footCell.j + 1, p.footCell.k)) {
      this.ui.setWarn('UNSTABLE SLOPE'); this.ui.setDanger(0);
    } else { this.ui.setWarn(''); this.ui.setDanger(0); }
    // buried
    const buried = p.buried > 0.8;
    this.ui.setBuried(buried);
    if (buried && !this.lastBuried) S.stats.buried++;
    this.lastBuried = buried;
    // trapped: a pulsing countdown to dig out before the air runs out
    this.updateTrapped(dt);
    this.updateVitals(dt);
    // emergency recall: hold U
    if (this.keys.KeyH) {
      this.recallHold += dt;
      if (this.recallHold > 2.5) { this.recallHold = 0; this.recall(); }
      else this.ui.hint(`Recalling… hold <kbd>H</kbd> (${(2.5 - this.recallHold).toFixed(1)}s)`, 0.3);
    } else this.recallHold = 0;
    if (this.keys.Space && (p.embedded || p.buried > 0.3)) this.punch(true, true);
    if (p.buried > 1.5 && !this.unstuckHint2) { this.unstuckHint2 = true; this.ui.hint('Stuck in a hole? Tap <kbd>R</kbd> (or hold <kbd>Space</kbd>) to punch your way out.', 8); }
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
      const net = this.isGuest() ? this.guestGrid : (this.hasGen() ? this.power.nearest(p.pos.x, p.pos.y + 1, p.pos.z) : null);
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
      for (const t2 of this.logi.tiles.values()) if (t2.type === 'belt' && t2.detector && t2.alarm) markers.push({ b: deg(Math.atan2(cellX(t2.i) - p.pos.x, -(cellZ(t2.k) - p.pos.z))), label: '!!', color: '#ff4d4d' });
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
    if (this.netBodies && this.netBodies.size) {
      const k = Math.min(1, dt * 14);
      for (const b of this.netBodies.values()) {
        b.x += (b.tx - b.x) * k; b.y += (b.ty - b.y) * k; b.z += (b.tz - b.z) * k;
        let l = 0;
        for (let t = 0; t < 4; t++) { b.q[t] += (b.tq[t] - b.q[t]) * k; l += b.q[t] * b.q[t]; }
        l = Math.sqrt(l) || 1;
        r.addDynamic(b.sp, b.vr, b.x, b.y, b.z, b.q[0] / l, b.q[1] / l, b.q[2] / l, b.q[3] / l, 1, 0.95, skyAt(b.x, b.y, b.z), b.sq || 0);
      }
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

  // The One reached a sink without passing a detector gate. It cannot be sold back.
  needleLost(src) {
    const S = this.S;
    if (S.ending || S.needleLost) return;
    S.needleLost = true;
    this.registerDex(NEEDLE);
    this.sound.rumble(1.2);
    this.ui.toast({ icon: '🔥', title: 'You threw away THE ONE', text: `It went through ${src} and into the incinerator. Il Rotto Supremo is gone. The exit is still out there.`, cls: 'ach', ms: 14000 });
    this.netSend({ t: 'lost', src });
  }

  needleAlarm(gate) {
    this.registerDex(NEEDLE);
    this.sound.found();
    this.ui.toast({ icon: '🚨', title: 'DETECTOR ALARM', text: 'THE ONE is in the gate. Go to it and press E to take it.', cls: 'ach', ms: 12000 });
    this.alarmGate = gate;
  }

  foundNeedle(src) {
    const S = this.S;
    if (S.ending || S.needleLost) return; // once you take the exit, the One is gone for good: quit the job or win the long way
    S.found = true;
    S.ending = 'plush';
    this.netSend({ t: 'win', ending: 'plush', by: this.myName() });
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
