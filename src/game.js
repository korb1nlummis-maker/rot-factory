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
import { Logistics, LOGI, CHARGE_PER, CHARGER_CAP, CHARGER_HOPPER, CHARGER_MAX_RARITY } from './logistics.js';
import { Power } from './power.js';
import { Cables } from './cables.js';
import { Contracts } from './contracts.js';
import { Crew, STATUS as BOT_STATUS } from './crew.js';
import { Radio } from './radio.js';
import { Net, RemotePlayer } from './net.js';
import { Slides } from './slide.js';
import { recipes, craft, craftGear, gearRecipes, MATERIALS } from './crafting.js';
import { ghostify, frameRay } from './machines.js';
import { Dust } from './dust.js';
import { U } from './shaders.js';
import * as HOLE from './holelight.js';
import { LightShafts } from './lightshaft.js';
import { newState, saveGame, loadSaved, applyDiff, clearSave } from './state.js';
import { playIntro } from './intro.js';
import { fanSpacing, staleAt } from './dust.js';
import { FUEL_MAX_RARITY, BURN_SECONDS, ENERGY_KJ, burnTime } from './power.js';
import { findInfoRef, infoFor } from './info.js';
import * as EXT from './ext.js';
import * as BINS from './bins.js';   // bins: the SORT bin and every Depot Beacon, and what is assigned to sell at which
import * as BINPANEL from './binspanel.js';   // the bins panel (; key), the picker and the beacon names
import * as BUILD from './build.js';   // wave 3: floor pads, catwalks, walls, ramps, stairs
import * as STACK from './stack.js';   // wave 10: stacked building inside the cubes (plates, switchback stairs, ladders, door frames, the load column)
import * as TRANSIT from './transit.js';   // wave 5: doors, platform lifts, jump pads
import * as PWP from './powerparts.js';
import * as HL from './hanglamp.js';   // powered hanging lanterns (lights them into glowSources)
import * as DETECTOR from './detector.js';
import * as VSCAN from './vehiclescan.js';
import * as ARCH from './arches.js';
import * as HAUL from './haul.js';   // wave 6: giant arches and the Portal (supports for trucks, the hammer's pick)
import { parseArch } from './loadtrace.js';
import { partOf as beltPartOf } from './beltdata.js';
import { PARTS as BELT_PARTS } from './splitparts.js';   // names of the mergers and ruled splitters (wave 2B)
import * as BP from './beltplan.js';   // belt tiers, lifts, underground pairs and the line planner (wave 1A)
import * as RAIL from './rail.js';   // Mine Rail shuttle: track, stations, carts (the rush key, the hammer and readout pick)
import { capacityOf, loadOn, totalLoad, WARN_AT } from './loadtrace.js';
import { UPGRADES, FRAME_TYPES, STRUT_DEPTH, supportDepth, betterThan, GEAR, computeTuning, effLevels, upgradeById, isUnlocked } from './upgrades.js';
import { Cart, CART_CAP, CART_NAMES, dims as cartDims } from './cart.js';
import { ACHIEVEMENTS } from './achievements.js';
import { EARTH, isEarth, earthCost, earthTune, newEarthEnt, earthConflict, earthRow, applyEarthRow, useEarth, spillEarth } from './earth.js';
import { RARITY, species, pickByRarity, bandOfDist, touchDex, NEEDLE, BULK, REMAINS, CACHE, PAD, isSpecialCell, PALETTES, sellValue } from './plushdata.js';
import { makeWorker, noteFor, rewardFor, applyBoost, describeBoosts } from './remains.js';
import { speciesIcon, needleFrames } from './icons.js';
import { clamp, lerp, fmt, compaction, escHtml } from './util.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const ARCH_PITCH = { 18: 0.55, 16: 0.65, 15: 0.8, 17: 0.85, 2: 0.8, 3: 0.75, 8: 0.7, 12: 1.15, 13: 1.3, 11: 1.35, 20: 1.2, 35: 1.4, 14: 1.1, 32: 1.25, 33: 1.3, 30: 1.5, 9: 0.9, 22: 0.85, 24: 1.2, 56: 0.6, 67: 0.75, 63: 0.7, 53: 0.9, 55: 1.4, 57: 1.35, 64: 1.3, 49: 1.1, 48: 1.1, 58: 1.2 };
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
    this.shafts = new LightShafts(this.renderer.scene);   // the beam of daylight in a shaft dug out of the pile (lightshaft.js)
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
    this.cables = new Cables(this);
    this.dust = new Dust(this);
    this.contracts = new Contracts(this);
    this.crew = new Crew(this);
    this.cart = new Cart(this);
    this.cart2 = new Cart(this, 'other');   // the friend's cart: S.gcart on the host (simulated), S.hcart on a guest (view only)
    this._actor = null;                      // 'g' while the host runs a command that came from the guest
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
    S.hcart = null;   // only ever a live view of the host's cart on a guest, never saved state
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
      onPlayerHit: (v, remote) => this.onPlayerHit(v, remote),
    };
    this.player.events.land = (v, safe) => { if (v > 12 && !safe) this.hurtPlayer((v - 12) * 5, 'fell too far'); this.landDip = Math.min(0.28, v * 0.025); this.treadOn(3.2, true); this.sound.thump(Math.min(0.35, v * 0.04), 110); this.fx.dust(this.player.pos.x, this.player.pos.y + 0.1, this.player.pos.z, 6, 0.8, 1); this.shake = Math.max(this.shake, Math.min(0.5, v * 0.03)); };
    this.player.events.step = (sp) => {
      this.treadOn(1.0 + (sp > 5 ? 0.5 : 0), false);
      if (this.player.pos.y > 0.45) { this.sound.step(0.06 + Math.min(0.06, sp * 0.01)); if (Math.random() < 0.12) this.sound.squeak(0.7 + Math.random() * 0.5, 0.04); }
      else this.sound.stepConcrete(0.05 + Math.min(0.05, sp * 0.01));
    };
    this.machines.clear();
    this.logi.clear();
    this.power.clear();
    this.cables.reset();
    this.dust.clear();
    this.crew.clear();
    this.world.onRemove = (i, j, k) => { this.dust.add(cellX(i), cellY(j), cellZ(k), 0.006 * (1 + Math.hypot(cellX(i), cellZ(k)) / 300)); }; // the deeper the pile, the dustier it is to cut
    { const up = this.machines.upgradeOldFrames(S); if (up.converted || up.absorbed) this._frameUpgrade = up; }   // frames saved one cell deep become 4x4x4 cubes
    for (const e of S.entities) this.addEntity(e);
    { const ids = new Set(S.entities.map((e) => e.id)); for (const e of [...S.entities]) if (e.type === 'fan' && e.mounted && !ids.has(e.frameId)) { const t = this.logi.byId.get(e.id); if (t) this.logi.remove(t); S.entities = S.entities.filter((x) => x.id !== e.id); } }   // a Support Fan whose frame is gone cannot hang in the air
    this.ensureFreeGate();
    S.cables = (Array.isArray(S.cables) ? S.cables : []).filter((c) => this.cables.ent(c.a) && this.cables.ent(c.b));   // hand-wired power cables whose ends still stand
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
    // nothing from the last game may leak into this one: lit Razzo fuses, queued loads, a turned frame in hand, warnings on screen
    this.fuses = []; this.guestFuses = []; this._fuseTxt = ''; this.ui.setWarn(''); this.loadQ = new Set(); this.frameYaw = null; this._lastFrameYaw = undefined; this._binSaid = new Map();   // (what a bin said last game, and when by the old clock, must not hush this game)
    this.pendFail = new Map(); STACK.resumeFalls(this);   // a warning of the last game must not fall on a support of this one (ids start again), and a cube that was falling when it was saved still falls (stack.js)
    this._lungPrev = undefined; this._lungRate = 0; this._lungWarned = false; this.ui.setLungWarn(0, '', '', 0, false);
    this.hpMax = 100 + (this.T.hpBonus || 0); this.hp = this.hpMax; this.hurtT = 0; this.dmgCd = 0; this.suffocating = false; this.trapOn = false; this.airLeft = undefined; this.trapFree = 0; this.ui.setTrap(false);   // the new shift's health and air gauges start full too
    this.wasOpen = undefined; this._dayShown = this.dayNumber(); this._shift = null;
    this.golden = 0; this.outage = 0; this.closingGrace = 0; this.syncLights();
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
    this.cart.sync(); this.cart2.sync();
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
    // a new local game starts with the welcome and the hiring form; continuing, joining and hosting skip it
    const startNew = async () => {
      if (this._starting) return;   // a double click must not start two intros or two games
      this._starting = true;
      try {
        this.sound.init(); this.sound.resume();
        const intro = await playIntro();
        this.startPlay(true, undefined, () => { this.S.name = intro.name; intro.close(); this.ui.dayCard(1, `Employee: ${intro.name}`); this._dayShown = 1; this._starting = false; }, () => { intro.close(); this._starting = false; });
      } catch (err) { this._starting = false; throw err; }
    };
    const start = (isNew) => (isNew ? startNew() : this.startPlay(isNew));
    $('btnNew').onclick = () => { start(true); };
    $('btnContinue').onclick = () => { this.sound.init(); this.sound.resume(); start(false); };
    $('btnResume').onclick = () => this.ui.closeModals();
    $('btnSave').onclick = () => { const ok = this.save(); this.ui.toast(this.noSave ? { icon: '💾', title: 'Not saved', text: 'You are in a friend\'s warehouse. Only the host keeps the save.' } : ok ? { icon: '💾', title: 'Saved', text: 'Your shift is safe.' } : { icon: '⚠️', title: 'Save failed', text: 'Browser storage is full.' }); };
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
    window.addEventListener('wheel', (e) => { if (this.mode === 'play' && !this.ui.isModalOpen() && this.tools.some((t) => t)) { if (BP.plannerOn(this, this.curTool()) && this.bplan.start) BP.cycle(this, e.deltaY > 0 ? 1 : -1); else this.cycleTool(e.deltaY > 0 ? 1 : -1); } }, { passive: true });   // with a planned line started the wheel picks the route shape
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas && this.mode === 'play') {
        const s = 0.0022 * this.sens;
        this.player.yaw -= e.movementX * s;
        this.player.pitch = clamp(this.player.pitch - e.movementY * s, -1.5, 1.5);
      }
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      this.clearKeys();
      if (!locked && this.mode === 'play' && !this.ui.isModalOpen() && !this.suppressPause) { this.crewDeselect(); if (this.cables.wiring) this.cables.cancel('Wire cancelled.'); this.ui.open('pause'); }   // Esc while the mouse is captured only reaches the page as this unlock: it lets go of the bot and the wire too
    });
    this.canvas.addEventListener('click', () => { if (this.mode === 'play' && !this.ui.isModalOpen() && document.pointerLockElement !== this.canvas) this.requestLock(); });
    document.addEventListener('visibilitychange', () => { this.clearKeys(); if (document.hidden) this.save(); });
    window.addEventListener('blur', () => this.clearKeys());
    window.addEventListener('beforeunload', () => this.save());
  }

  requestLock() {
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { if (this.mode === 'play' && !this.ui.isModalOpen() && document.pointerLockElement !== this.canvas) this.ui.hint('Click the game to take the mouse back.', 3); }); } catch (e) { /* ignore */ }   // after Esc the browser wants a click before it hands the mouse over again
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

  startPlay(isNew, seedOverride, after, fail) {
    $('title').classList.add('hidden');
    this.setLoading(isNew ? 'Stacking a fresh warehouse…' : 'Resuming your shift…');
    $('loading').classList.remove('hidden');
    setTimeout(() => { try {
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
      if (isNew && seedOverride === undefined) setTimeout(() => this.ui.hint('Look at a plush and click to grab it. Walk near the SORT bin and it sucks your plush in. <kbd>E</kbd> at the desk for upgrades, at the bench to craft.', 12), 800);
      else this.ui.hint('Welcome back to Warehouse 07.', 4);
      if (isNew && seedOverride === undefined) setTimeout(() => this.ui.hint('You wear a hard hat with a lamp and a clock. At 19:00 the warehouse closes, a chime sounds, and the lights go out until 07:00.', 11), 14000);
    } catch (err) {
      // a failed start must not leave a black intro or the loading screen over everything: say so and go back to the title
      console.error(err); this.errCount = (this.errCount || 0) + 1; (this.errLog = this.errLog || []).push(String(err && err.stack || err).split('\n').slice(0, 3).join(' | '));
      $('loading').classList.add('hidden'); $('title').classList.remove('hidden'); this.mode = 'title';
      if (fail) { try { fail(); } catch (e2) { /* ignore */ } }
      this.ui.toast({ icon: '⚠️', title: 'Could not start', text: 'The warehouse failed to open. Try again.', ms: 6000 });
    } }, 60);
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
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) { if (down && e.code === 'Escape' && this.mode === 'play' && this.ui.isModalOpen()) { e.target.blur(); this.ui.closeModals(); } return; } // typing in a box (Esc still closes the window it is in)
    if (down && e.code === 'Enter' && this.mode === 'play' && this.net.open && !this.ui.isModalOpen()) { const c = document.getElementById('chatIn'); c.classList.remove('hidden'); c.value = ''; c.focus(); e.preventDefault(); return; }
    if (e.code === 'KeyG') return; // G is retired: left click grabs, and clicking again throws. F is the flashlight.
    if (e.repeat && down) { if (e.code === 'Tab') e.preventDefault(); return; }
    if (e.code === 'Tab') e.preventDefault();
    this.keys[e.code] = down;
    if (!down) return;
    if (e.code === 'F3') { e.preventDefault(); this.toggleFps(); return; }   // not the browser's find bar
    if (e.code === 'Escape' && this.mode === 'title' && this.ui.isModalOpen()) { this.ui.closeModals(); return; }   // How to Play and Play Together, opened from the title
    if (this.mode !== 'play') return;
    if (e.code === 'Escape' && this.crewSel) this.crewDeselect();
    if (e.code === 'Escape' && this.cables.wiring) this.cables.cancel('Wire cancelled.');
    if (e.code === 'Escape') {   // the window says "Esc closes" and the title says "Esc pause": with the mouse free (no capture to give up) Esc has to do both itself
      if (this.ui.isModalOpen()) { this.ui.closeModals(); return; }
      if (document.pointerLockElement !== this.canvas && !this.ui.justClosed()) { this.openModal('pause'); return; }   // not when a panel's own Esc handler closed it on this same key press
    }
    if (this.ui.isModalOpen()) {
      if (this.ui.openModal === 'inv') {
        // inventory: a number puts the selected item into that hotbar slot, X clears it from the bar, I or Esc closes
        if (e.code.startsWith('Digit')) { this.ui.invAssign(+e.code.slice(5) - 1); return; }
        if (e.code === 'KeyX') { this.ui.invClear(); return; }
        if (e.code === 'ArrowRight' || e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'ArrowDown') { this.ui.invMove(e.code); e.preventDefault(); return; }
        if (e.code === 'KeyI') { this.ui.closeModals(); return; }
      }
      if (e.code === 'Semicolon' && this.ui.openModal === 'binpanel') { BINPANEL.cycle(this); return; }   // ; in the bins panel: the next bin
      if (e.code === 'Tab' || e.code === 'KeyN' || e.code === 'KeyJ' || e.code === 'KeyL' || e.code === 'KeyV') { if (this.ui.openModal !== 'pause') this.ui.closeModals(); }
      return;
    }
    if (e.code === 'Tab') this.openModal('shop');
    else if (e.code === 'KeyN') this.openModal('dex');
    else if (e.code === 'KeyL') this.openModal('journal');
    else if (e.code === 'KeyV') this.openModal('crew');
    else if (e.code === 'KeyT') this.crewFarmAhead();
    else if (e.code === 'KeyY') this.crewHomeAll();
    else if (e.code === 'KeyF') this.toggleLamp();
    else if (e.code === 'KeyJ') this.openModal('ach');
    else if (e.code === 'KeyM') PWP.toggleHud(this);   // the load meter readout of the grid you stand nearest to (powerparts.js)
    else if (e.code.startsWith('Digit')) { const n = +e.code.slice(5) - 1; if (n >= 0 && n < 9) this.selectTool(n, true); }
    else if (e.code === 'KeyB') this.bPress();
    else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowDown') && this.frameEquipped()) { e.preventDefault(); if (e.code === 'ArrowDown') { this.frameYaw = null; this.ui.hint('Frames snap to the grid and to each other again.', 2); } }
    else if (e.code === 'BracketRight' || e.code === 'ArrowRight') this.cycleTool(1);
    else if (e.code === 'BracketLeft' || e.code === 'ArrowLeft') this.cycleTool(-1);
    else if (e.code === 'KeyI') this.openModal('inv');
    else if (e.code === 'KeyE') { if (!(e.shiftKey && EXT.copyKey(this))) this.useKey(); }   // Shift+E copies a machine's settings (catalog), E pastes them
    else if (e.code === 'Semicolon') BINPANEL.destKey(this, e.shiftKey);   // the bins panel for what you aim at (Shift: copy its bin), see binspanel.js
    else if (e.code === 'KeyO') this.toggleLamp();
    else if (e.code === 'KeyZ') this.throwOne();
    else if (e.code === 'KeyK') this.useMedkit();
    else if (e.code === 'KeyP') this.punch();
    else if (e.code === 'KeyQ' && this.cables.wiring) this.cables.cancel('Wire cancelled. <kbd>Q</kbd> again puts the cable away.');
    else if (e.code === 'KeyQ') { this.stowed = !this.stowed; this.machines.setGhost(null); this.plan = null; this.rebuildTools(); const t = this.curTool(); this.ui.hint(this.stowed ? 'Put away. Hands free. <kbd>Q</kbd> takes it out again.' : (t.kind === 'hammer' ? 'Hammer out. <kbd>B</kbd> removes what you aim at. <kbd>Q</kbd> puts it away.' : t.kind === 'hands' ? 'Nothing in that slot: your hands are free. Pick a tool with <kbd>1-9</kbd>.' : 'Tool out. <kbd>B</kbd> or click uses it. <kbd>Q</kbd> puts it away.'), 2.5); }
    else if (e.code === 'KeyX') this.deconstruct(e.shiftKey);   // Shift+X takes down a whole zoop group
    else if (e.code === 'KeyU') this.useCart();
    else if (e.code === 'Minus' || e.code === 'Equal') { const dir = e.code === 'Equal' ? 1 : -1; if (!BUILD.zoopKey(this, this.curTool(), dir, e.shiftKey) && !TRANSIT.zoopKey(this, this.curTool(), dir)) this.adjustScoop(dir); }   // a pad's zoop length; a jump pad's angle (transit.js)   // zoop length (width with Shift) of the pad in hand
    else if (e.code === 'KeyR') {
      // R punches (laptop friendly); with a ramp in hand it flips the ramp instead
      const t = this.curTool();
      if (BUILD.rotateKey(this, t, e.shiftKey)) { /* a build shell piece turned (R) or nudged (Shift+R) */ }
      else if (TRANSIT.rotateKey(this, t, e.shiftKey)) { /* a door turned, or a jump pad's heading (transit.js) */ }
      else if (t.kind === 'belt' && t.ramp) { this.rampMode = (this.rampMode + 1) % 2; this.machines.setGhost(null); }
      else if (BP.rKey(this, t)) { /* a lift flips up/down, the line planner picks the next route shape (beltplan.js) */ }
      else this.punch();
    }
    else if (e.code === 'Period' || e.code === 'Comma') BP.key(this, e.code);   // lift height down/up, line planner on/off and route shape (beltplan.js)
    else if (e.code === 'Backspace') { e.preventDefault(); RAIL.rushKey(this); }   // Mine Rail: sit in the nearest cart and rush home, or call one (rail.js)
  }

  // A key whose release was missed (alt-tab, a menu that took focus, the pointer lock dropping) would keep walking you forever. Every way the
  // keyboard can lose track of itself clears all keys, so you always have to press a key to move.
  clearKeys() { for (const k of Object.keys(this.keys)) this.keys[k] = false; this.grabWant = false; }

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
      return { id, kind: r.kind, fk: r.fk, ramp: r.ramp, hose: r.hose, p: r.p, icon: r.icon, label: r.short, count: '×' + n, have: n, slot };
    });
    if (this.stowed === undefined) this.stowed = true; // hands by default; Q or a number key takes a tool out
    if (this.buildIdx == null || this.buildIdx < 0 || this.buildIdx > 8) this.buildIdx = 0;
    this.ui.setHotbar(this.tools, this.stowed ? -1 : this.buildIdx);
    this.machines.setGhost(null);
  }

  // ---- inventory: everything you hold that can be used, and the hotbar slots you put it in
  inventoryList() {
    const S = this.S, out = [];
    out.push({ id: 'hammer', kind: 'hammer', icon: '🔨', name: 'Hammer', count: null, desc: 'Removes what you built and gives it back.', use: 'Take it out (its number, or Q), aim at a frame, prop, belt, machine or bulkhead and click or press B. One piece per hit.', tool: true });
    for (const r of recipes(this)) {
      if (r.kind === 'mat') continue;   // no raw building material in the pack; }
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
  chargerCost() { return Math.round(260 * Math.pow(1.3, this.logi ? this.logi.count('charger') : 0)); }
  genCost() { let n = 0; if (this.logi) for (const t of this.logi.tiles.values()) if (t.type === 'gen' && PWP.genKindOf(t) === PWP.GEN_STD) n++; return Math.round(350 * Math.pow(1.35, n)); }   // only the ordinary Generator counts: each rung of the ladder (powerparts.js) prices itself
  sorterCost() { return Math.round(90 * Math.pow(1.18, this.logi ? this.logi.count('sorter') : 0)); }
  mechCost() { return Math.round(2500 * Math.pow(1.55, this.logi ? this.logi.count('mech') : 0)); }
  rigCost() { return Math.round(150 * Math.pow(1.4, this.machines ? this.machines.count('claw') : 0)); }
  borerCost() { return Math.round(3200 * Math.pow(1.7, this.machines ? this.machines.count('borer') : 0)); }
  earthCost(kind) { return earthCost(kind, this.machines ? this.machines.count(kind) : 0); }
  curTool() { const t = this.tools[this.buildIdx]; return !this.stowed && t && (t.have === undefined || t.have > 0 || t.kind === 'cable' || BP.plannerOn(this, t)) ? t : { kind: 'hands' }; }   // the cable tool stays in hand at 0 so a wired pair can still be clicked off; so does a belt with the line planner on (it buys what you do not hold)
  selectTool(n, toggle = false) {
    const slot = ((n % 9) + 9) % 9;
    const same = this.buildIdx === slot;
    this.buildIdx = slot;
    if (this.crewSel) this.crewDeselect();
    this.stowed = toggle && same && !this.stowed; // pressing the number of the tool you already hold puts it away
    this.ui.setHotbar(this.tools, this.stowed ? -1 : this.buildIdx);
    this.machines.setGhost(null);
    this.plan = null; // the old tool's plan must not be placed by the new tool before the next aim update
    this.sound.tone('sine', 700, 900, 0.05, 0.05);
  }
  giveItem(id, n = 1) { this.S.items[id] = (this.S.items[id] || 0) + n; this.rebuildTools(); }

  tune() { const T = computeTuning(effLevels(this.S), this.S.boosts); if (this.world) this.world.slipMul = 1 - 0.25 * T.climb; return T; }
  // the stats that unlock shop rows: a guest's list follows the host, who is the one that checks the purchase
  shopStats() { return this.isGuest() && this.hostEco ? { stats: { plush: this.hostEco.pl } } : this.S; }
  recipeList() { return recipes(this).filter((r) => r.kind !== 'mat'); }   // building material is no longer a thing you shop for: frames are just bought
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
    if (id === 'airtank' && this.trapOn && this.airLeft !== undefined) this.airLeft += 30; // the bigger tank helps the burial you are in right now
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

  // F3 flips on the key press itself: a tap shorter than one frame (the slow frames F3 exists to show) used to be missed
  toggleFps() { this.showFps = !this.showFps; document.getElementById('fps').classList.toggle('hidden', !this.showFps); }
  // frame-time governor: keep the game near 60 fps by trading resolution, and an F3 readout
  perf(raw) {
    if (raw > 250) return; // tab was hidden
    this.msAvg = this.msAvg ? this.msAvg * 0.94 + raw * 0.06 : raw;
    this.perfT = (this.perfT || 0) + raw;
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
    this.hall.calm = true;
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
    // sky factor at the camera
    const w = this.world;
    const i = clamp(toI(camPos.x), 0, NX - 1), j = toJ(camPos.y), k = clamp(toK(camPos.z), 0, NZ - 1);
    const top = w.topAt(i, k);
    let sky = j >= top ? 1 : Math.exp(-(top - j - 1) * 0.3);
    const plain = sky, hv = HOLE.holeAt(w, i, j, k);
    if (hv > 0) sky = j >= top ? hv : Math.max(sky, hv);   // standing in a hole you are lit as deep as it lets the day down (1 in its first 7 m), and near its foot by what spills along the tunnel
    this.camSky += (sky - this.camSky) * Math.min(1, dt * 4);
    // the hall's lights set the day. A tunnel keeps its light for the first 7 m in from the entrance (open ground), fades by about 17 m, and from
    // there only your lamp, lanterns and glowing machines show anything (at night nothing but those does anywhere)
    if (this._entr && this._entr.hole && HOLE.holeAt(w, this._entr.hole.i, this._entr.hole.j, this._entr.hole.k) <= 0) this._entr = { x: 1e5, z: 1e5 };   // an entrance that was a hole is no entrance once the hole is shut (a plate, plush or a door across it), so the glow of the tunnel goes with the light
    if (sky > 0.6 || !this._entr) { this._entr = this._entr || { x: camPos.x, z: camPos.z }; if (sky > 0.6) { this._entr.x = camPos.x; this._entr.z = camPos.z; this._entr.hole = hv > 0.6 && (j >= top || plain <= 0.6) ? { i, j, k } : null; } }   // the raw sky value, not the smoothed one: a teleport must not move the entrance onto you
    const deep = Math.hypot(camPos.x - this._entr.x, camPos.z - this._entr.z), dk = Math.min(1, Math.max(0, (deep - 7) / 10)), buried = 1 - this.camSky;
    const lit = 1 - dk * dk * (3 - 2 * dk);
    const amb = this.hall.level * (1 - 0.97 * buried * (1 - lit));
    const lo = amb;
    const skyEff = Math.max(this.camSky, lit * buried * 0.85);
    U.uGlow.value = lit * buried * 0.5 * lo;
    U.uCamSky.value = skyEff * lo;
    const cs = 0.12 + 0.88 * skyEff;
    this.hall.hemi.intensity = 0.55 * cs * lo;
    this.hall.sun.intensity = 1.2 * cs * lo;
    U.uSunColor.value.setRGB(1.05 * lo, 1.1 * lo, 0.95 * lo);
    U.uHemiSky.value.setRGB(0.36 * lo, 0.4 * lo, 0.3 * lo); U.uFloor.value = lo;
    { const lv = this.hall.level; U.uHoleSun.value.setRGB(1.05 * lv, 1.1 * lv, 0.95 * lv); U.uHoleHemi.value.setRGB(0.36 * lv, 0.4 * lv, 0.3 * lv); U.uHoleLv.value = lv;   // light that came down a hole is the hall's own, whatever the depth you stand at
      this.shafts.update(w, this.renderer.editRev | 0, camPos, dt, lv * (1 - 0.92 * Math.min(1, this.camSky)), lv); }
    this.renderer.scene.environmentIntensity = 0.28 * cs * lo;
    this.sound.setAmbientMuffle(1 - this.camSky);
    // fog tint dims in tunnels
    const f = this.renderer.scene.fog;
    f.color.copy(U.uFogColor.value).multiplyScalar((0.06 + 0.94 * skyEff) * lo);
    this.renderer.scene.background.copy(f.color);
  }

  // everything that glows enough to light plush: lanterns and flares first, then lit generators, powered poles and live chargers
  glowSources(camPos, n) {
    const out = [];
    for (const e of this.machines.lights(camPos, n)) out.push(e.lc ? { x: e.x, y: e.y, z: e.z, r: e.lr, cr: e.lc[0], cg: e.lc[1], cb: e.lc[2], d: -1 } : { x: e.x, y: e.y, z: e.z, r: e.glow ? 6 : 9, cr: e.glow ? 0.5 : 2.2, cg: e.glow ? 1.9 : 1.7, cb: e.glow ? 0.9 : 0.9, d: -1 });   // furnish.js lights carry their own radius (lr) and colour (lc)
    HL.lampSources(this, camPos, Math.min(4, n - out.length), out);   // powered hanging lanterns: they dim with their grid
    if (out.length < n) {
      const cand = [];
      for (const t of this.logi.tiles.values()) {
        let c = null;
        if (t.type === 'gen' && t.burn > 0) { const gk = PWP.genKindOf(t); c = { y: t.j * C + 0.5 + 0.6 * gk.scale, r: gk.glow, cr: 1.7, cg: 0.8, cb: 0.25 }; }
        else if (t.type === 'pole' && (t.pw ?? 0) > 0.05) c = { y: t.j * C + 1.6, r: 4.5, cr: 0.25, cg: 0.8, cb: 0.4 };
        else if (t.type === 'charger' && (t.reserve || 0) > 0.02) c = { y: t.j * C + 0.7, r: 5, cr: 0.3, cg: 0.7, cb: 1.6 };
        if (!c) continue;
        const x = cellX(t.i), z = cellZ(t.k), d = (x - camPos.x) ** 2 + (c.y - camPos.y) ** 2 + (z - camPos.z) ** 2;
        if (d < 40 * 40) cand.push({ x, z, d, ...c });
      }
      cand.sort((a, b) => a.d - b.d);
      for (const c of cand) { if (out.length >= n) break; out.push(c); }
    }
    return out;
  }

  updatePlay(dt) {
    if (this.hall && this.hall.calm) this.hall.calm = false;
    const S = this.S, T = this.T, p = this.player, world = this.world, cam = this.renderer.camera;
    const locked = document.pointerLockElement === this.canvas;
    const modal = this.ui.isModalOpen();
    S.stats.playSecs += dt;
    this.ui.tick(dt);

    // --- input -> player
    const k = this.keys;
    const input = {
      fwd: locked && !modal && k.KeyW ? 1 : 0, back: locked && !modal && k.KeyS ? 1 : 0, left: locked && !modal && k.KeyA ? 1 : 0, right: locked && !modal && k.KeyD ? 1 : 0,
      sprint: !!(k.ShiftLeft || k.ShiftRight), jump: !!k.Space && locked && !modal, crouch: !!k.KeyC && locked,   // C only: Ctrl+W closes the browser tab, so Ctrl is not a crouch key
        // either Shift sprints; crouch is C only (Ctrl+W would close the browser tab)
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
    const gl = this.glowSources(cam.position, 8);
    const rp = this.remote && this.remote.lampOn && this.net.open ? this.remote : null;
    U.uPtN.value = rp ? 10 : 1 + gl.length;
    for (let i = 0; i < 10; i++) {
      const L = U.uPt.value[i], Lc = U.uPtCol.value[i];
      if (i === 0) { L.set(this.hall.binPos.x, 1.1, this.hall.binPos.z, 7); Lc.setRGB(1.3, 0.55, 0.15); continue; }
      if (i === 9) { if (rp) { L.set(rp.pos.x, rp.pos.y + 1.55, rp.pos.z, 11); Lc.setRGB(2.4, 2.2, 1.8); } else { L.set(0, -999, 0, 1); Lc.setRGB(0, 0, 0); } continue; }
      const e = gl[i - 1];
      if (e) { L.set(e.x, e.y, e.z, e.r); Lc.setRGB(e.cr, e.cg, e.cb); } else { L.set(0, -999, 0, 1); Lc.setRGB(0, 0, 0); }
    }

    // --- interaction
    if (this.mode === 'play' && locked && !modal) this.interact(dt, cam.position, _fwd);
    else { this.curTargetRef = null; this.ui.setGrab(0, false); this.ui.setTarget(null); this.renderer.setGhost(0); this.machines.showPreview(null, null); }

    // --- sim
    this.kickBudget = 6;
    if (!this.isGuest()) {
      this.sim.step(dt);
      world.updateStability(dt, T.warn, {
        onCreak: (x, y, z, n) => this.onCreak(x, y, z, n),
        release: (i, j, k2) => this.releaseCell(i, j, k2),
        onRegion: (x, y, z) => this.queueLoad(x, y, z),
      });
      this.updateAfters(dt);
      this.slide.update(dt);
      this.catchInCart();
    } else {
      for (const [id, c] of world.creaking) { c.t -= dt; if (c.t <= 0) world.creaking.delete(id); }
    }
    this.playerGateScan(dt); if (!this.isGuest()) { this.feedGensFromThrows(); this.feedChargersFromThrows(); }
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
      EXT.update(this, dt, true);
      this.crew.guestUpdate(dt, this.time);
      this.cart.guestUpdate(dt); this.cart2.guestUpdate(dt);
      this.updateFuses(dt);
      world.stabQueue.length = 0;   // the host judges the roof; a guest never drains this queue, so it must not grow
      if (this.golden > 0) { this.golden -= dt; if (this.golden <= 0) { this.golden = 0; this.ui.toast({ icon: '🌟', title: 'Golden Hour is over', text: 'Prices are back to normal.', ms: 3000 }); } }
      if (this.outage > 0) { this.outage -= dt; if (this.outage <= 0) { this.outage = 0; this.power.outage = false; this.ui.toast({ icon: '💡', title: 'Power restored', text: 'The grid came back.', ms: 3000 }); } }
    } else {
      this.machines.update(dt, this.time);
      this.updateFuses(dt);
      this.updateSurge(dt);
      this.power.update(dt);
      this.logi.update(dt);
      EXT.update(this, dt, false);
      this.crew.update(dt, this.time);
      this.cart.update(dt); this.cart2.update(dt);
    }
    this.cables.update(dt);
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
      for (const it of this.machines.items.values()) if (it.ent.type === 'borer' || (isEarth(it.ent.type) && EARTH[it.ent.type].dig)) pin(it.ent.x, it.ent.z);
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
      if (!sp || isSpecialCell(sp)) continue;
      if (w.solid(i + 1, j, k) && w.solid(i - 1, j, k) && w.solid(i, j + 1, k) && w.solid(i, j - 1, k) && w.solid(i, j, k + 1) && w.solid(i, j, k - 1)) continue;
      consider(cellX(i) - eye.x, cellY(j) - eye.y, cellZ(k) - eye.z, (t) => ({ type: 'cell', i, j, k, t, sp, vr: w.getVr(i, j, k) }));
    }
    return best;
  }

  targetInfo(tg) {
    const s = species[tg.sp];
    const r = RARITY[s.rarity];
    const shiny = !!(tg.vr & 128);
    let val = tg.sp === CACHE ? 'open it' : tg.sp === REMAINS ? 'search it' : tg.sp === BULK ? (BUILD.ownerAt(this, tg.i, tg.j, tg.k) ? 'hammer takes the wall down' : TRANSIT.doorAt(this, tg.i, tg.j, tg.k) ? 'hammer takes the door down' : 'hammer or X takes it down') : tg.sp === PAD ? 'hammer or X takes it down' : tg.sp === NEEDLE ? 'priceless' : '◈ ' + fmt(this.valueOf(tg.sp, tg.vr, 0));
    return { name: s.name, rarity: tg.sp === PAD ? 'Built' : r.name, rid: s.rarity, shiny, value: val, volatile: !!s.volatile };   // a floor pad is not a plush: it is not graded
  }

  valueOf(sp, vr, streakN) {
    const T = this.T;
    let v = RARITY[species[sp].rarity].value;
    if (vr & 128) v *= T.shinyMult;
    v *= T.sellMult;
    const eco = this.isGuest() && this.hostEco;   // a guest's own stats and plushdex are personal: the sale is paid from the host's
    v *= 1 + ((eco ? eco.md : this.S.stats.maxDist) || 0) / 700;    // the premium for plush from far out: 5 km out pays about 8x
    v *= 1 + T.dexBonus * (eco ? eco.dx : this.dexN());
    if (streakN > 1) v *= 1 + 0.045 * (Math.min(streakN, T.streakCap) - 1);
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

    // vacuum burst (tap left click once the Plush Vacuum is owned); special targets always use the single grab
    const special = tg && (tg.type === 'body' || tg.type === 'nbody' || tg.sp === BULK || tg.sp === REMAINS || tg.sp === CACHE || tg.sp === PAD);
    if (T.vac > 0 && !special) {
      if (this.keys.KeyG && !special) this.vacT = Math.max(this.vacT || 0, 0.3);
      if ((this.vacT || 0) > 0) { this.vacT -= dt; this.runVacuum(dt, eye, dir); } else this.vacAcc = 0;
      this.ui.setGrab(0, false);
    } else {
      // grabbing is instant (see gPress); hold the key to keep grabbing until your hands (or cart) are full
      this.grabCd = Math.max(0, (this.grabCd || 0) - dt);
      if (this.keys.KeyG && this.curTool().kind === 'hands' && !this.holdBlock && performance.now() - (this.gDownAt || 0) > 160 && this.storeRoom() && this.grabCd <= 0 && !this.vacT) {
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
      if (dTerm < 3.2 && dTerm <= Math.hypot(pp.x - this.hall.craftPos.x, pp.z - this.hall.craftPos.z) && !this._termHint) {   // (E answers at the station you stand nearest to, so only say it where it is true)
        this._termHint = true; this.ui.hint('<kbd>E</kbd> opens the upgrade terminal. <kbd>Tab</kbd> works anywhere.', 5); }
      if (dBin < 3.2 && S.carry.length && !this._binHint) { this._binHint = true; this.ui.hint('Plush you carry get sucked into the bin when you stand close. <kbd>Z</kbd> throws one in for a streak bonus.', 5); }
    }
  }

  collect(tg, quiet = false) {
    const S = this.S, T = this.T, w = this.world;
    let item = null, pos;
    if (tg.type === 'cell' && tg.sp === REMAINS) return this.openRemains(tg.i, tg.j, tg.k);
    if (tg.type === 'cell' && tg.sp === CACHE) return this.openCache(tg.i, tg.j, tg.k);
    if (tg.type === 'cell' && tg.sp === BULK && TRANSIT.doorAt(this, tg.i, tg.j, tg.k)) { this.ui.hint('That panel belongs to a door. Use the hammer (or X) to take the whole door down.', 2.5); return false; }   // the leaf of a door is not loose bulkhead (audit, wave 5)
    if (tg.type === 'cell' && tg.sp === BULK && BUILD.ownerAt(this, tg.i, tg.j, tg.k)) { this.ui.hint('That panel belongs to a wall section. Use the hammer (or X) to take the whole section down.', 2.5); return false; }
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
    // scoop neighbors: as many as you have turned the scoop up to (- and =, 3 at a time)
    const scoopN = this.scoopNow();
    if (tg.type === 'cell' && scoopN > 0) {
      let left = scoopN;
      const near = [];
      const dv = this.player.forward(new THREE.Vector3());
      // Scoop Hands reach a 7 cell neighbourhood; Bucket Hands (more than 12 per grab) open the tube and the neighbourhood up as the scoop grows
      const rr = scoopN <= 12 ? 3 : Math.min(9, 3 + Math.ceil((scoopN - 12) / 20)), tube = 0.95 + 0.25 * (rr - 3);
      for (let dk = -rr; dk <= rr; dk++) for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
        if (!di && !dj && !dk) continue;
        const i = tg.i + di, j = tg.j + dj, k = tg.k + dk;
        if (!w.get(i, j, k)) continue;
        if (w.solid(i + 1, j, k) && w.solid(i - 1, j, k) && w.solid(i, j + 1, k) && w.solid(i, j - 1, k) && w.solid(i, j, k + 1) && w.solid(i, j, k - 1)) continue;
        // only plush further along the aim line, in a thin tube: straight in, never from the sides or underneath
        const vx = di * C, vy = dj * C, vz = dk * C;
        const along = vx * dv.x + vy * dv.y + vz * dv.z;
        if (along < 0.2) continue;
        const perp = Math.hypot(vx - dv.x * along, vy - dv.y * along, vz - dv.z * along);
        if (perp > tube) continue;
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
    let toHand = true;
    // standing in the pull of a bin or depot: what you grab goes straight in, so grabbing as fast as the vacuum and scoop allow never waits on the bin to unload your hands
    const pp0 = this.player.pos, sink0 = !sp.volatile && !quiet && this.mode === 'play' ? this.nearestSink(pp0.x, pp0.y + 1, pp0.z, this.T.autoDump) : null;
    if (sink0 && sink0.kind === 'sell') {
      this.sell(item.sp, item.vr, { dist: 0, streak: true, bin: sink0.bin });
      this.fliers.push({ sp: item.sp, vr: item.vr, from: pos.clone(), to: new THREE.Vector3(sink0.x, sink0.y, sink0.z), t: 0, dur: 0.3, arc: 0.6 });
      toHand = false;
    } else
    if (sp.volatile || S.carry.length < this.T.carry || !this.routeToCart(carried, pos)) {
      S.carry.push(carried);
      if (sp.volatile) this.lightFuse(carried);   // dug out with Scoop Hands counts too
    } else toHand = false;   // it went to the cart: the cart's own flier shows that, nothing flies to the hand
    this.ui.setCarry(S.carry, this.T.carry);
    if (toHand) {
      this.heldPop = 1;
      // flier to the hand
      this.fliers.push({ sp: item.sp, vr: item.vr, from: pos.clone(), t: 0, dur: 0.22, hand: true });
    }
    const pal = PALETTES[sp.pal] ? new THREE.Color(PALETTES[sp.pal][1]) : new THREE.Color(1, 0.9, 0.5);
    this.fx.fluff(pos.x, pos.y, pos.z, pal.r, pal.g, pal.b, quiet ? 3 : 8);
    if (!quiet) { this.sound.pop(0.16); this.sound.squeak((0.8 + sp.rarity * 0.18) * (ARCH_PITCH[sp.arch] || 1), 0.1 + sp.rarity * 0.02); }
    if (sp.rarity >= 2 || (item.vr & 128)) {
      this.sound.tone('sine', 600 + sp.rarity * 120, 900 + sp.rarity * 200, 0.4, 0.08 + sp.rarity * 0.01, 0.05);
      this.fx.sparkle(pos.x, pos.y, pos.z, 10 + sp.rarity * 6, 1, 0.85, 0.4);
      if (sp.rarity >= 3) this.ui.toast({ img: speciesIcon(item.sp), title: `${RARITY[sp.rarity].name}: ${sp.name}`, text: (item.vr & 128) ? 'Shiny variant!' : `Worth ◈ ${fmt(this.valueOf(item.sp, item.vr, 0))}`, cls: 'r' + sp.rarity });
    }
  }

  // The first time any plush of a species shows up it goes in the Plushdex. What you handle yourself gets the chime and the toast (only while you are
  // actually playing, never while a menu is open and never more than one chime every half second). What machines and bots dig up counts silently
  // and is reported in one batch, because with 1,600+ species a busy mine would otherwise chime all day, even from the pause menu.
  // how many entries the Plushdex holds (the decoys and The One count too): kept as a running number because every sale asks for it and there can be 6,000+ entries
  dexN() {
    const d = this.S.dex, c = this._dexC;
    if (c && c.d === d) return c.n;
    let n = 0; for (const k in d) n++;
    this._dexC = { d, n };
    return n;
  }

  registerDex(spId, auto = false) {
    const S = this.S;
    if (!S.dex[spId]) {
      if (S.dex[spId] === undefined && this._dexC && this._dexC.d === S.dex) this._dexC.n++;
      touchDex();
      S.dex[spId] = 0;
      if (spId !== NEEDLE) {
        if (auto) this._autoNewDex = (this._autoNewDex || 0) + 1;
        else if (this.mode === 'play' && !this.ui.isModalOpen() && !(this._dexSndT > this.time)) {
          const s = species[spId];
          this._dexSndT = this.time + 0.5;
          this.ui.toast({ img: speciesIcon(spId), title: 'New species', text: `${s.name} · ${RARITY[s.rarity].name}`, ms: 3000 });
          this.sound.tone('triangle', 800, 1200, 0.15, 0.06, 0.1);
        } else this._autoNewDex = (this._autoNewDex || 0) + 1;
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
      // find nearest exposed cell in cone. The Cyclone Vacuum (more than 18 a second) opens the cone and lengthens it so the faster suction has plush to draw on
      const wide = Math.max(0, T.vacRate - 18), cosMin = wide ? Math.max(0.7, 0.95 - 0.0025 * wide) : 0.95;
      const reach = T.reach + 1.2 + Math.min(2.5, wide / 40);
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
        if (cosA < cosMin) continue;
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
        if (!sp || isSpecialCell(sp)) continue;
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
  // Left click. Empty hands: a tap grabs what you look at. Holding something: a single tap throws it.
  // Hold the button to keep grabbing until you are full (see interact).
  gPress() {
    // a tool in your hand: click uses it (hammer hits, building items are set down). Empty slot = bare hands: grab and throw.
    const held = this.curTool();
    if (held.kind !== 'hands') { this.useTool(held); return; }
    const tg = this.curTargetRef;
    const special = tg && (tg.type === 'body' || tg.type === 'nbody' || tg.sp === BULK || tg.sp === REMAINS || tg.sp === CACHE || tg.sp === PAD);
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
    if (this.stowed) { this.stowed = false; this.rebuildTools(); this.ui.hint(this.curTool().kind === 'hands' ? 'Nothing in that slot: your hands are free. Pick a tool with <kbd>1-9</kbd>.' : 'Tool out. <kbd>B</kbd> or click uses it, <kbd>Q</kbd> puts it away.', 2); return; }
    this.useTool(this.curTool());
  }

  useTool(t) {
    if (BUILD.holdStart(this, t)) return;   // a floor pad: the press anchors a hold-and-drag zoop, the release places it (build.js)
    if (t.kind === 'hands') { this.ui.hint('Empty hands: click grabs, <kbd>F</kbd> is the flashlight. Pick a tool with <kbd>1-9</kbd> (open the inventory with <kbd>I</kbd>).', 2.5); return; }
    if (t.kind === 'hammer') { this.hammerHit(); return; }
    if (t.kind === 'cable') { this.cables.click(t); return; }
    if (t.kind === 'cart') { this.useCart(); return; }
    if (t.kind === 'supply') { if (t.id === 'medkit') this.useMedkit(); else if (t.id === 'doorkey') this.ui.hint('The Door Key works by itself: doors set to key lock open for you while it is in your pack.', 3); else this.ui.hint('Air Canisters work by themselves: one kicks in when you run out of air while trapped.', 3); return; }
    this.placeCurrent(t);
  }

  // Hammer: removes the built thing you are aiming at (frames, props, belts, machines, bulkheads, the cart) and gives it back
  describeRef(ref) {
    if (!ref) return null;
    if (ref.kind === 'cart') return 'your cart';
    if (ref.kind === 'tile') { const t = this.logi.byId.get(ref.id); return t ? (t.detector ? 'Detector Gate' : BELT_PARTS[beltPartOf(t)] ? BELT_PARTS[beltPartOf(t)].name : t.splitter ? 'Belt Splitter' : t.mounted ? 'Support Fan' : t.type === 'charger' ? 'Charging Station' : t.type) : null; }
    if (ref.kind === 'mach') { const it = this.machines.items.get(ref.id); if (!it) return null; const e = it.ent; if (BUILD.isBuildType(e.type)) return BUILD.nameOf(e); if (TRANSIT.isTransit(e.type)) return TRANSIT.nameOf(e); if (e.type === 'garch') return ARCH.nameOf(e.span, e.mat) + (() => { const sp = this.world.supports.find((q) => q.id === e.id); return sp && sp.load !== undefined ? ', load ' + Math.round(sp.load * 100) + '%' : ''; })(); return e.type === 'frame' ? `${FRAME_TYPES[e.kind].name} (4x4x4)${(() => { const sp = this.world.supports.find((q) => q.id === e.id); return sp && sp.load !== undefined ? ', load ' + Math.round(sp.load * 100) + '%' : ''; })()}` : e.jack ? 'Hydraulic Jack' : e.glow ? 'Glow Stick' : e.dyn ? 'Dynamite' : e.type === 'road' ? 'Haul Road Plate' : e.type === 'dock' ? 'Truck Dock' : (RAIL.nameOf(e) || e.type); }
    if (ref.kind === 'cable') { const c = this.cables.rec(ref.id); return c ? `Power Cable, ${this.cables.length(c).toFixed(1)} m` : null; }
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
    if (this.logi.tileAt(i, j, k) || this.logi.cellTaken(i, j, k)) return false;   // a belt, a rail piece, a shaft or a door already holds the cell
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
    for (const b of this.S.crew) this.crew.sendHome(b);
    this.ui.hint('Crew: heading home.', 2);
  }


  // ---------------- click a bot, then click a target ----------------
  crewSelected() {
    if (!this.crewSel) return null;
    const b = (this.S.crew || []).find((x) => x.id === this.crewSel);
    if (!b) this.crewSel = null;
    return b || null;
  }
  crewSelect(b) { this.crewSel = b.id; this.sound.chirp(1.6); this.ui.hint(`<b>${b.name}</b> selected. Aim at something and press <kbd>E</kbd> to give an order. <kbd>Esc</kbd> lets go.`, 3); }
  crewDeselect() { if (!this.crewSel) return; this.crewSel = null; this.ui.setBotInfo(false); if (this.crew.marker) this.crew.marker.visible = false; }

  // what the crosshair is on, out to maxD: a bot, a machine tile, the cart, the bin, your own feet, or a spot on the floor or pile
  crewAim(maxD = 14) {
    const eye = this.renderer.camera.position, d = this.player.forward(_fwd), w = this.world, L = this.logi, S = this.S;
    let tw = maxD, solid = false, tileHit = null;
    for (let t = 0.3; t < maxD; t += 0.1) {
      const x = eye.x + d.x * t, y = eye.y + d.y * t, z = eye.z + d.z * t;
      const i = toI(x), j = toJ(y), k = toK(z);
      if (y < 0 || w.solid(i, j, k)) { tw = t; solid = true; break; }
      if (!tileHit) { const tile = L.tiles.get(idx(i, j, k)) || L.tiles.get(idx(i, j - 1, k)); if (tile) tileHit = { t, kind: 'tile', tile }; }
    }
    const rs = (cx, cy, cz, r) => { const ox = cx - eye.x, oy = cy - eye.y, oz = cz - eye.z; const tc = ox * d.x + oy * d.y + oz * d.z; if (tc < 0) return -1; const d2 = ox * ox + oy * oy + oz * oz - tc * tc; if (d2 > r * r) return -1; return Math.max(0.1, tc - Math.sqrt(r * r - d2)); };
    let best = tileHit && tileHit.t < tw ? tileHit : null;
    const take = (t, o) => { if (t >= 0 && t < tw && (!best || t < best.t)) best = { t, ...o }; };
    for (const b of S.crew || []) { const sc = this.crew.scale(b); const t = rs(b.x, b.y + 0.4 * sc, b.z, 0.5 * sc + 0.2); if (t <= 7) take(t, { kind: 'bot', bot: b }); }
    if (S.cart) take(rs(S.cart.x, S.cart.y + 0.5, S.cart.z, 1.1), { kind: 'cart' });
    const bp = this.hall.binPos; take(rs(bp.x, 1.0, bp.z, 1.8), { kind: 'bin' });
    for (const it of this.machines.items.values()) if (it.ent.type === 'beacon') take(rs(it.ent.x, 0.9, it.ent.z, 1.1), { kind: 'beacon', ent: it.ent });   // a Depot Beacon is a bin too: a selected bot unloads there from now on
    if (best) return best;
    if (!solid) return null;
    const tt = Math.max(0.3, tw - 0.12), x = eye.x + d.x * tt, y = Math.max(0, eye.y + d.y * tt), z = eye.z + d.z * tt;
    if (Math.hypot(x - this.player.pos.x, z - this.player.pos.z) < 1.2 && y < 0.8) return { t: tt, kind: 'feet' };
    const dir = Math.abs(d.x) > Math.abs(d.z) ? (d.x > 0 ? 0 : 2) : (d.z > 0 ? 1 : 3);
    return { t: tt, kind: 'spot', x, y, z, dir };
  }
  // the aim as the small message the host understands (a bot is a selection, not a target)
  crewTgt(a) {
    if (!a) return null;
    if (a.kind === 'tile') return { k: 'tile', id: a.tile.id };
    if (a.kind === 'spot') return { k: 'spot', x: +a.x.toFixed(2), y: +a.y.toFixed(2), z: +a.z.toFixed(2), dir: a.dir };
    if (a.kind === 'beacon') return { k: 'bin', id: a.ent.id };
    if (a.kind === 'bin' || a.kind === 'cart' || a.kind === 'feet') return { k: a.kind };
    return null;
  }
  crewIssue(b, tgt) {
    if (this.isGuest()) {
      const it = this.crew.intent(b, tgt);
      if (!it.ok) { this.sound.error(); this.ui.hint(it.text, 2.5); return { ok: false, msg: it.text }; }
      this.cmd('crew', { act: 'ctx', id: b.id, tgt }); this.sound.chirp(1.2);
      return { ok: true, act: it.act, msg: it.toast };
    }
    return this.crew.command(b, tgt);
  }
  // E: select the bot you aim at (or let it go again); with a bot selected, E on a target gives the order the panel names
  crewUseKey() {
    if (this.mode !== 'play' || !(this.S.crew || []).length) return false;
    const sel = this.crewSelected(), a = this.crewAim();
    if (a && a.kind === 'bot') {
      if (this.cfgClip && this.cfgClip.group === 'bindest') { BINPANEL.pasteToBot(this, a.bot); return true; }   // a copied bin (Shift+;) pastes onto the bot you aim at
      if (sel && sel.id === a.bot.id) { this.crewDeselect(); this.sound.chirp(0.9); this.ui.hint('Deselected.', 1.5); }
      else this.crewSelect(a.bot);
      return true;
    }
    if (!sel || !a) return false;
    this.crewIssue(sel, this.crewTgt(a));
    return true;
  }
  updateBotHud() {
    const b = this.crewSelected();
    if (!b) { this.ui.setBotInfo(false); return; }
    const a = this.crewAim();
    const act = a && a.kind === 'bot' ? { ok: true, text: a.bot.id === b.id ? 'Let this bot go (deselect)' : `Pick ${a.bot.name} instead` } : this.crew.intent(b, this.crewTgt(a));
    const cap = this.crew.capacity(b);
    let carry = `Carrying ${b.carry.length} of ${cap}`;
    if (!this.isGuest() && b.carry.length) { const n = [0, 0, 0, 0, 0, 0]; for (const it of b.carry) n[Math.min(5, species[it.sp] ? species[it.sp].rarity : 0)]++; carry += ': ' + n.map((c, r) => (c ? `${c} ${RARITY[r].name}` : '')).filter(Boolean).join(', '); }
    const dt = b.deliver ? this.logi.byId.get(b.deliver) : null;
    const dn = dt ? { gen: 'Generator', sorter: 'Sorting Box', vault: 'Vault Crate', belt: 'belt', charger: 'Charging Station' }[dt.type] || dt.type : '';
    this.ui.setBotInfo(true, { title: b.name.toUpperCase(), lines: [`Level ${b.level}  ·  Battery ${Math.round(b.battery * 100)}%`, carry, `Doing: ${BOT_STATUS[b.state] || b.state}${dn ? `  ·  drop-off: ${dn}` : ''}`, `Unloads at: ${BINS.destText(this, { k: 'bot', o: b })}`], act: 'E: ' + act.text, ok: act.ok });
  }

  crewCommand(b, d) {
    // dig orders start from the spot you aim at (or where you stand), recharge and fuel go to the nearest station or generator: all through the one intent function
    if (d.d !== undefined || d.a === 'charge' || d.a === 'fuel') {
      let tgt = null;
      if (d.d !== undefined) { const a = this.crewAim(), p = this.player.pos; tgt = a && a.kind === 'spot' ? { k: 'spot', x: +a.x.toFixed(2), y: +a.y.toFixed(2), z: +a.z.toFixed(2), dir: +d.d } : { k: 'spot', x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), dir: +d.d }; }
      else {
        let best = null, bd = 1e9;
        for (const t of this.logi.tiles.values()) { if (t.type !== (d.a === 'charge' ? 'charger' : 'gen') || (d.a === 'charge' && !((t.reserve || 0) > 0.02))) continue; const q = Math.hypot(cellX(t.i) - b.x, cellZ(t.k) - b.z); if (q < bd) { bd = q; best = t; } }
        if (!best) { this.ui.hint(d.a === 'charge' ? 'No Charging Station with charge. Feed one Common to Epic plush.' : 'No generator to keep fuelled.', 3); return; }
        tgt = { k: 'tile', id: best.id };
      }
      this.crewIssue(b, tgt); return;
    }
    if (this.isGuest()) { this.cmd('crew', { act: 'one', id: b.id, d: { d: d.d, a: d.a } }); return; }
    if (d.d !== undefined) this.crew.order(b, +d.d, b.x, b.y, b.z);
    else if (d.a === 'follow') this.crew.follow(b);
    else if (d.a === 'home') this.crew.sendHome(b);
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
      if (t.alarm && t.held) { const it = t.held; t.held = null; t.alarm = false; this.logi.setGate(t, false); this.logi.recomputeHalt(); this.alarmGate = VSCAN.otherAlarm(this, t); this.pickedUp(it, new THREE.Vector3(cellX(t.i), t.j * C + 0.8, cellZ(t.k))); return true; }
      this.ui.hint('Detector gate: all clear so far.', 2); return true;
    }
    if (t.type === 'gen' && !guestData && !S.carry.length) {   // empty hands: switch between AUTO (burn all the time) and RESERVE (burn only when a battery is low or the grid is overloaded)
      const next = t.mode === 'reserve' ? 'auto' : 'reserve', r = this.setCfg(t, { mode: next });
      if (r.ok) { this.sound.place(); this.ui.hint(next === 'reserve' ? 'RESERVE: this generator holds its fuel until a battery on its grid is under 30% or the grid is overloaded.' : 'AUTO: this generator burns whenever it has fuel.', 3.5); } else { this.sound.error(); this.ui.hint(r.why || 'Could not change that', 2.5); }
      return true;
    }
    if (this.isGuest()) {
      if (t.type === 'pole' || t.type === 'fan') { this.ui.hint(`${t.type === 'pole' ? 'Pole' : 'Fan'}: ${(t.pw ?? 0) > 0.05 ? 'powered' : 'no power'} (${Math.round((t.pw ?? 0) * 100)}%)`, 2.5); return true; }
      if (t.type === 'belt' && !t.detector) return false;
      const d = { id: t.id, room: T.carry - S.carry.length };
      if (t.type === 'gen' || t.type === 'charger') { d.items = []; for (let q = S.carry.length - 1; q >= 0; q--) if (species[S.carry[q].sp].rarity <= (t.type === 'gen' ? FUEL_MAX_RARITY : CHARGER_MAX_RARITY)) d.items.push(S.carry.splice(q, 1)[0]); this.ui.setCarry(S.carry, T.carry); }
      this.cmd('tile', d);
      return true;
    }
    if (t.type === 'gen') {
      let n = 0; const hop = PWP.genHopper(T, t);
      for (let q = S.carry.length - 1; q >= 0; q--) {
        const it = S.carry[q];
        if (species[it.sp].rarity <= FUEL_MAX_RARITY && t.q.length < hop) { t.q.push(S.carry.splice(q, 1)[0]); n++; }
      }
      this.ui.setCarry(S.carry, T.carry); this.power.markDirty();
      const tooGood = S.carry.some((c) => species[c.sp].rarity > FUEL_MAX_RARITY);
      this.ui.hint(n ? `Fed ${n} plush to the ${PWP.genKindOf(t).key === 'std' ? 'generator' : PWP.genKindOf(t).name.toLowerCase()} (${t.q.length}/${hop}).` : t.q.length >= hop ? `The fuel hopper is full (${t.q.length}/${hop}).` : `Nothing to burn. It takes Common to Epic plush${tooGood ? ' (Legendary and Mythic are too valuable to burn)' : ''}.`, 3);
      return true;
    }
    if (t.type === 'charger') {
      let n = 0;
      for (let q = S.carry.length - 1; q >= 0; q--) {
        const it = S.carry[q];
        if (species[it.sp].rarity <= CHARGER_MAX_RARITY && t.q.length < CHARGER_HOPPER) { t.q.push(S.carry.splice(q, 1)[0]); n++; }
      }
      this.ui.setCarry(S.carry, T.carry);
      const tooGood = S.carry.some((c) => species[c.sp].rarity > CHARGER_MAX_RARITY);
      this.ui.hint(n ? `Fed ${n} plush to the Charging Station (hopper ${t.q.length}/${CHARGER_HOPPER}, charge ${(t.reserve || 0).toFixed(1)}/${CHARGER_CAP}).` : t.q.length >= CHARGER_HOPPER ? `The hopper is full (${t.q.length}/${CHARGER_HOPPER}).` : `Nothing to charge with. It takes Common to Epic plush${tooGood ? ' (Legendary and Mythic are too valuable)' : ''}.`, 3);
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
    this.registerDex(it.sp, true);
    if (Math.random() < 0.5) this.fx.dust(x, y, z, 2, 0.5, 0.5);
  }

  // ---------------- carts and storage ----------------
  // Every player has their own cart. On the host: S.cart is the host's, S.gcart the guest's. On a guest: S.cart is the guest's own
  // (so everything that reads S.cart there keeps working) and S.hcart is the host's, kept as a render-only view.
  otherCartKey() { return this.net.role === 'guest' ? 'hcart' : 'gcart'; }
  // the slot of whoever is acting: the guest while the host runs one of the guest's commands, otherwise the local player
  myCartKey() { return this._actor === 'g' && this.net.role !== 'guest' ? 'gcart' : 'cart'; }
  myCart() { return this.S[this.myCartKey()]; }
  cartInst(key) { return key === 'cart' ? this.cart : this.cart2; }
  // feedback for an action on a cart: a hint on this screen, or a toast to the friend when the host is acting for them
  cartSay(text, secs = 3) { if (this._actor === 'g' && this.net.role !== 'guest') this.netSend({ t: 'toast', icon: '🛒', title: 'Cart', text: text.replace(/<[^>]*>/g, '') }); else this.ui.hint(text, secs); }
  cartDist() { const c = this.S.cart; return c ? Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z) : 1e9; }
  storeRoom() { return this.S.carry.length < this.T.carry || (this.S.cart && this.cartDist() < 9 && this.S.cart.load.length < CART_CAP[this.S.cart.tier]); }

  // throw plush toward the cart: what lands in the tray stays there until the cart is near the bin
  catchInCart() { this.catchInOne(this.S.cart); if (this.S.gcart) this.catchInOne(this.S.gcart); }
  catchInOne(c) {
    const s = this.sim;
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
    const S = this.S, key = this.myCartKey(), c = S[key];
    const fp = from || { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z, yaw: this.player.yaw };
    if (c) {
      const d = Math.hypot(c.x - fp.x, c.z - fp.z);
      if (d > 5) { c.mode = 'follow'; this.cartSay('Your cart is on its way.', 2); return; }
      c.mode = c.mode === 'follow' ? 'stay' : 'follow';
      this.cartSay(c.mode === 'follow' ? 'Cart follows you. <kbd>U</kbd> parks it, <kbd>X</kbd> next to it stows it when empty.' : 'Cart parked. <kbd>U</kbd> makes it follow again.', 3);
      if (this._actor !== 'g') this.sound.tone('triangle', 500, 700, 0.08, 0.06);
      return;
    }
    let tier = 0;
    for (let t = 5; t >= 1; t--) if ((S.items['cart:' + t] || 0) > 0) { tier = t; break; }
    if (!tier) { this.cartSay('No cart. Unlock Carts in the terminal, then craft one at the bench (<kbd>E</kbd>).', 4); return; }
    S.items['cart:' + tier]--;
    if (S.items['cart:' + tier] <= 0) delete S.items['cart:' + tier];
    this.cartInst(key).deploy(tier, { pos: fp, yaw: fp.yaw });
    if (this._actor !== 'g') this.sound.place();
    this.cartSay('Cart out. It follows you and grabbed plush ride on it. Park it near the bin to unload.', 5);
    this.rebuildTools();
  }

  stowCart() {
    const key = this.myCartKey(), c = this.S[key];
    if (!c) return false;
    if (c.load.length) { this.cartSay('Empty the cart first (park it near the bin).', 3); return true; }
    this.giveItem('cart:' + c.tier);
    this.cartInst(key).stow();
    if (this._actor !== 'g') this.sound.thump(0.12, 140);
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
    if ($$('btnHow')) $$('btnHow').onclick = () => { this.sound.init(); this.ui.open('howto'); };
    if ($$('btnHow2')) $$('btnHow2').onclick = () => this.ui.open('howto');
    const hideAll = () => { for (const id of ['mpHostBox', 'mpJoinBox', 'mpHostShort', 'mpJoinShort']) $$(id).classList.add('hidden'); };
    let busyUntil = 0;   // a double click must not open two connections (the second would replace the first one's code); a hung request frees the buttons after 8 s
    const begin = () => { if (Date.now() < busyUntil) return false; busyUntil = Date.now() + 8000; return true; }, end = () => { busyUntil = 0; };
    $$('mpHost').onclick = async () => {
      if (this.mode !== 'play') { status('Start or continue your game first, then open Play Together from the pause menu.'); return; }
      if (!begin()) return;
      this.S.settings.name = this.myName();
      hideAll(); $$('mpHostShort').classList.remove('hidden'); $$('mpCode').textContent = '····';
      status('Getting a code…');
      try { $$('mpCode').textContent = await this.net.hostShort(); status('Waiting for your friend…'); } catch (e) { status('Could not make a short code (' + e.message + '). Try the long codes below.'); } finally { end(); }
    };
    $$('mpHostManual').onclick = async () => {
      if (this.mode !== 'play') { status('Start or continue your game first, then open Play Together from the pause menu.'); return; }
      if (!begin()) return;
      this.S.settings.name = this.myName();
      hideAll(); $$('mpHostBox').classList.remove('hidden');
      status('Making a code…');
      try { $$('mpOffer').value = await this.net.host(); status('Send the code to your friend, then paste their reply below.'); } catch (e) { status('Could not make a code: ' + e.message); } finally { end(); }
    };
    const copyBox = (id, none) => { const t = $$(id); if (!t.value) { status(none); return; } t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ } status(ok ? 'Copied.' : 'Could not copy by itself. The code is selected: press Ctrl+C (Cmd+C).'); };
    $$('mpCopyOffer').onclick = () => copyBox('mpOffer', 'No code yet: press Host (long codes) first.');
    $$('mpConnect').onclick = async () => { try { await this.net.finishHost($$('mpAnswerIn').value); status('Connecting…'); } catch (e) { status('That reply code did not work.'); } };
    $$('mpJoin').onclick = () => { hideAll(); $$('mpJoinShort').classList.remove('hidden'); status(''); $$('mpCodeIn').focus(); };
    $$('mpGo').onclick = async () => {
      if (!begin()) return;
      status('Connecting…');
      try { await this.net.joinShort($$('mpCodeIn').value); status('Connected. Loading your friend\'s world…'); } catch (e) { status('Could not join: ' + e.message); } finally { end(); }
    };
    $$('mpCodeIn').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $$('mpGo').click(); else if (e.key === 'Escape' && this.mode === 'play') { e.target.blur(); this.ui.closeModals(); } });
    $$('mpJoinManual').onclick = () => { hideAll(); $$('mpJoinBox').classList.remove('hidden'); status(''); };
    $$('mpMakeReply').onclick = async () => {
      status('Making a reply…');
      try { $$('mpReply').value = await this.net.join($$('mpOfferIn').value); status('Send the reply back. When your friend connects you will drop into their world.'); } catch (e) { status('That code did not work.'); }
    };
    $$('mpCopyReply').onclick = () => copyBox('mpReply', 'No reply code yet: paste your friend\'s code and press Make reply code first.');
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
    if (this.net.role === 'guest') { this.S.crew = []; this.crew.clear(); this.crewViews = new Map(); this.S.cart = null; this.cart.clear(); this.S.hcart = null; this.cart2.clear(); }
    this.guestReady = false; this.hostEco = null;
    if (this.dust) this.dust.hostLevel = 0;
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
          this.S.name = this.myName();   // the joiner skips the hiring form but is still on the books
          this._dayShown = this.dayNumber(); this.syncLights();
          if (this.isOpen()) this._shift = { earn: this.S.totalEarned || 0, plush: this.S.stats.plush || 0, dug: this.S.stats.cells || 0, deaths: this.S.stats.deaths || 0 };
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
          if (sp === 0) { if (!this.isGuest()) this.dust.add(cellX(i), cellY(j), cellZ(k), 0.006); if (Math.random() < 0.3) this.fx.dust(cellX(i), cellY(j), cellZ(k), 2, 0.4, 0.5); }   // the dust field lives on the host: a guest's digging has to feed it there
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
      case 'sale': if (m.fb) { if (this.isGuest() && this.coinCd <= 0) { this.coinCd = 0.12; this.sound.coin(0); } break; }   // host to guest: only the sound of an automatic sale (the host sold it, the money is shared)
        if (m.sp === NEEDLE) { this.needleLost('the SORT bin'); } else this.sell(m.sp, m.vr, { dist: m.dist, streak: true }); break;
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
        if (m.R !== undefined) { this.fx.burst(m.x, m.y + 0.6, m.z, 70, 1, 0.6, 0.2, 6, 0.14, 1.4); this.blastOnPlayer(m.x, m.y, m.z, m.R, true); }   // a real blast: the guest gets shoved and hurt like the host would be
        break;
      }
      case 'razzo': this.razzoOnPlayer(m.x, m.y, m.z, m.mk); break;
      case 'hit': this.onPlayerHit(m.v); break;
      case 'slide': if (this.guestReady) this.slideFeel(Math.hypot(m.x - this.player.pos.x, m.z - this.player.pos.z), m.r); break;
      case 'sfail': this.supportFailFx(m.x, m.y, m.z, m.name, m.ratio); break;
      case 'swarn': this.supportWarnFx(m.x, m.z, m.name, m.ratio, m.sec, m.y); break;
      case 'sbreak': this.breakSupport(m.st, m.e); break;
      case 'sstrain': this.sound.creak(0.25); this.ui.hint(m.note, 5); break;
      case 'ent+': this.remoteEnt(m.ent); break;
      case 'ent-': this.removeViewEnt(m.id); break;
      case 'xrow': EXT.guestRow(this, m.k, m.d); break;
      case 'cables': this.cables.applyList(m.list); break;
      case 'chint': this.ui.hint(String(m.text || ''), 4); this.cables.hold = 3; if (m.good) this.sound.place(); else this.sound.error(); break;
      case 'say': this.chatLine(`${(this.remote && this.remote.name) || 'Friend'}: ${m.text}`); break;
      case 'time': this.S.gameMin = m.gameMin; break;
      case 'win': if (!this.S.ending) { this.S.ending = m.ending; this.mode = 'ended'; this.sound.found(); this.ui.toast({ icon: '🏆', title: `${escHtml(String(m.by || 'Your friend').slice(0, 24))} found the One!`, text: 'You did it together.', ms: 8000 }); this.endTimer = 2.5; } break;
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
      if (it.ent.type === 'ladder') STACK.removeLadder(this, it.ent);   // the cells a ladder reserved and its place in the guest's registry
      if (it.ent.type === 'stair' || it.ent.type === 'wramp') BUILD.removeBuild(this, it.ent);   // a slope's reserved cells (its cells come with the cell sync)
      this.machines.disposeObj(it.obj); this.machines.root.remove(it.obj); this.machines.items.delete(id);
    }
    this.world.supports = this.world.supports.filter((s2) => s2.id !== id && s2.id !== 'shield' + id);
    this.S.entities = this.S.entities.filter((x) => x.id !== id);
  }

  // The host believes a guest about WHAT to build, but not that the spot is still free: a second click before ent+ arrives
  // (or two friends aiming at one cell) would otherwise stack a duplicate and eat a second item. Returns a reason, or null.
  placeConflict(tool, e) {
    if (!tool || !e) return 'Nothing to place';
    const k = tool.kind, T = this.T;
    if ((k === 'gen') !== (tool.id === 'gen' || !!PWP.GEN_BY_ITEM[tool.id])) return 'That item does not make that machine';   // the generator ladder: a generator comes only from a generator item, and a generator item makes nothing else
    if (EXT.isCatalogTool(k)) return EXT.conflictTool(this, tool, e);   // catalog tools: TYPES[kind].conflict
    if (k === 'belt') { const why = BP.conflict(this, tool, e); if (why) return why; if (e.type === 'tierbelt') return null; }   // belt marks (beltplan.js)
    if ((k === 'splitter' && e.type === 'splitbelt') || (k === 'gate' && e.type === 'gatebelt')) { const t = this.logi.byId.get(e.id); return !t ? 'That belt is gone' : (t.splitter || t.detector || t.merger) ? 'That piece is already converted' : null; }
    if (['belt', 'sorter', 'vault', 'mech', 'gen', 'charger', 'pole', 'fan', 'gate', 'splitter'].includes(k)) {
      const why = this.logi.canPlace(e.i, e.j, e.k); if (why && why !== 'Too close') return why;
      if (k === 'mech' && this.logi.count('mech') >= T.mechMax) return `Mech limit reached (${T.mechMax})`;
      return null;
    }
    if (k === 'bulk') return this.world.solid(e.i, e.j, e.k) ? 'Occupied' : this.logi.cellTaken(e.i, e.j, e.k);
    if (k === 'frame') { const why = this.machines.frameConflict(tool.fk, e); return why || (e.turned ? null : STACK.cubeWhy(this, e, tool.fk)); }   // the host recomputes the 4x4x4 section itself: a guest's list of cells to clear is never believed
    if (k === 'mfan') { if (!this.machines.items.has(e.frameId)) return 'That frame is gone'; for (const t of this.logi.tiles.values()) if (t.type === 'fan' && t.mounted && t.frameId === e.frameId) return 'This frame already has a fan'; return null; }
    if (k === 'beacon') { { const why = Number.isInteger(e.i) ? this.logi.cellTaken(e.i, e.j, e.k) : null; if (why) return why; } for (const it of this.machines.items.values()) if (it.ent.type === 'beacon' && Math.hypot(it.ent.x - e.x, it.ent.z - e.z) < 1.0) return 'A depot beacon is already here'; return null; }
    if (k === 'claw') { for (const it of this.machines.items.values()) if (it.ent.type === 'claw' && Math.hypot(it.ent.x - e.x, it.ent.z - e.z) < 2.2) return 'Too close to another rig'; return this.machines.count('claw') >= T.rigMax ? `Rig limit reached (${T.rigMax})` : null; }
    if (k === 'borer') return this.machines.count('borer') >= T.borerMax ? `Borer limit reached (${T.borerMax})` : null;
    if (isEarth(k)) return earthConflict(this, k, e);
    return null;
  }

  stripEnt(e) { return JSON.parse(JSON.stringify(e, (k, v) => (EXT.TRANSIENT.includes(k) ? undefined : v))); }   // transient names live in catalog.js TRANSIENT

  // ---- catalog plumbing (src/ext.js): configs, copy/paste, generic placement. A guest only ever asks; the host validates and applies.
  setCfg(ent, patch) { return EXT.setCfg(this, ent, patch); }            // { ok, why }: guest sends cmd 'cfg' {id, patch}, host validates against TYPES[type].cfg and applies
  copyCfg(ent) { return EXT.copyCfg(this, ent); }                       // stores this.cfgClip = { type, group, vals }
  pasteCfg(ent) { return EXT.pasteCfg(this, ent); }                     // { ok, why }
  placeEntity(type, fields, opts) { return EXT.placeEntity(this, type, fields, opts); }   // host only: new id, S.entities, addEntity, ent+ to a guest

  sendWorld() {
    const w = this.world;
    this.netSend({ t: 'world', seed: this.S.seed, gameMin: this.S.gameMin });
    let buf = [];
    w.forEachDiff((id, sp, vr) => { buf.push(id, sp, vr); if (buf.length >= 9000) { this.netSend({ t: 'diff', a: buf }); buf = []; } });
    if (buf.length) this.netSend({ t: 'diff', a: buf });
    const list = this.S.entities.map((e) => this.stripEnt(e));
    for (let n = 0; n < list.length; n += 400) this.netSend({ t: 'ents', list: list.slice(n, n + 400) });
    this.netSend({ t: 'cables', list: this.cables.list().map((c) => ({ id: c.id, a: c.a, b: c.b })) });
    this.sendShared();
    this.netSend({ t: 'ready' });
  }

  // a locally built structure the friend should see too
  netEnt(ent) { if (this.net.open && this.net.role === 'host') this.netSend({ t: 'ent+', ent: this.stripEnt(ent) }); }
  netEntRemove(ent) { this.netSend({ t: 'ent-', id: ent.id }); }

  // ---------- commands from the guest, run by the host ----------
  cmd(c, d) { this.netSend({ t: 'cmd', c, d }); }

  // the host runs every guest command as the guest: this._actor says whose cart a cart command means
  netCmd(c, d) { const prev = this._actor; this._actor = 'g'; try { this.runNetCmd(c, d); } finally { this._actor = prev; } }

  runNetCmd(c, d) {
    const S = this.S;
    switch (c) {
      case 'buy': { const lv = S.up[d.id] || 0; if (this.buy(d.id) && (S.up[d.id] || 0) > lv) { const u = upgradeById(d.id); if (u) this.netSend({ t: 'toast', icon: '🛒', title: u.name + (u.max > 1 ? ' ' + (lv + 1) : ''), text: u.names ? u.names[lv + 1] : 'Upgrade purchased' }); } break; }
      case 'craft': craft(this, d.id, d.n); break;
      case 'craftGear': craftGear(this, d.id); break;
      case 'place': { const tool = d.tool; const why = this.placeConflict(tool, d.ent); if (why) { this.netSend({ t: 'toast', icon: '⚠️', title: 'Could not place', text: why }); break; } this.plan = { ok: true, ent: d.ent }; this._forGuest = true; try { this.placeCurrent(tool); } finally { this._forGuest = false; } this.plan = null; break; }
      case 'decon': this.doDecon(d); break;
      case 'cfg': EXT.runCfgCmd(this, d); break;
      case 'bplan': BP.runCmd(this, d); break;   // a guest's planned belt line: the host validates every tile and lays it
      case 'rail': RAIL.runCmd(this, d); break;   // a guest's Mine Rail command: rush, sit, leave, load (rail.js re-checks everything)
      case 'vscan': VSCAN.guestTake(this, d); break;   // a friend pressed E on a Vehicle Scanner that holds The One (vehiclescan.js re-checks they stand there)
      case 'arch': DETECTOR.guestCross(this, d); break;   // a friend walked through a detector arch (detector.js re-checks they stand there)
      case 'cable': this.cables.report(this.cables.connect(d.a, d.b), false); break;
      case 'earth': { const eit = this.machines.items.get(d.id); if (eit && isEarth(eit.ent.type) && VSCAN.guestReach(this, eit.ent, eit.ent.hop || eit.ent.cargo)) { const r = useEarth(this, eit, Math.max(0, Math.min(5000, +d.room || 0))); if (r.took) { const items = []; for (let q = 0; q < r.took.length; q += 2) items.push({ sp: r.took[q], vr: r.took[q + 1] }); this.netSend({ t: 'give', items }); } else this.power.markDirty(); } break; }
      case 'tile': {
        const t = this.logi.byId.get(d.id);
        if (!t) break;
        if (t.type === 'vault') {
          const take = t.stored.splice(0, Math.max(0, d.room || 0));
          if (take.length) this.netSend({ t: 'give', items: take });
        } else if (t.type === 'gen' || t.type === 'charger') {
          const back = [];
          for (const it of d.items || []) if (!this.logi.accept(t, it, null)) back.push(it);
          if (back.length) this.netSend({ t: 'give', items: back });
          this.power.markDirty();
        } else this.useTile(t);
        break;
      }
      case 'feed': { const t = this.logi.byId.get(d.id); if (t) this.logi.accept(t, { sp: d.sp, vr: d.vr }, null); break; }
      case 'sell': this.sell(d.sp, d.vr, { dist: d.dist, streak: d.streak, bin: BINS.binById(this, d.bin) ? d.bin : undefined }); break;
      case 'bindest': BINS.runCmd(this, d); break;   // a friend picked the bin of a bot or their own cart (machines and belt ends go through `cfg`)
      case 'reroll': this.contracts.reroll(d.i); break;
      case 'cart': this.useCart(d); break;
      case 'spend': if ((S.items[d.id] || 0) > 0) { S.items[d.id]--; if (S.items[d.id] <= 0) delete S.items[d.id]; } break;
      case 'cartload': { const gc = this.myCart(); if (gc && gc.load.length < CART_CAP[gc.tier]) gc.load.push({ sp: d.sp, vr: d.vr }); break; }
      case 'bulk': { const w = this.world; if (w.get(d.i, d.j, d.k) === BULK && !BUILD.ownerAt(this, d.i, d.j, d.k) && !TRANSIT.doorAt(this, d.i, d.j, d.k)) { w.setCell(d.i, d.j, d.k, 0, 0); w.stabQueue.push({ i: d.i, j: d.j, k: d.k }); this.giveItem('bulk'); } break; }
      case 'open': {
        const r = d.k === 'remains' ? this.openRemains(d.i, d.j, d.kk, true) : this.openCache(d.i, d.j, d.kk, true);
        if (r && r.text !== undefined) this.netSend({ t: 'toast', icon: '📦', title: 'Supply cache', text: r.text });
        else if (r && r.name) this.netSend({ t: 'note', entry: r });
        break;
      }
      case 'pay': { const n = Math.max(0, Math.min(1e9, Math.round(+d.n || 0))); if (S.money >= n) S.money -= n; break; }
      case 'tread': if (this.world.get(d.i, d.j, d.k) !== 0) this.slide.trigger(d.i, d.j, d.k, Math.min(3, +d.e || 0)); break;   // the guest's footing loads the face under it exactly as the host's would
      case 'patch': this.slide.triggerPatch(d.i, d.k, Math.min(6, +d.e || 0), 3); break;
      case 'fuse': {
        // a Razzo the guest let go of keeps burning here, where the bodies live: the host tracks it from the guest's hands
        this.fuses = this.fuses || [];
        if (this.fuses.length < 12) this.fuses.push({ item: { sp: d.sp, vr: d.vr }, t: Math.max(0.1, Math.min(3.2, +d.t || 3.2)), bid: undefined, lost: 0, remote: true });
        break;
      }
      case 'razzo': { const x = +d.x, y = +d.y, z = +d.z; if (Number.isFinite(x + y + z)) this.razzoBlast(x, y, z); break; }
      case 'clearDust': { const p0 = d; for (const k of [...this.dust.cells.keys()]) { const [ix, , iz] = this.dust.decode(k); if (Math.hypot((ix + 0.5) * 3 - p0.x, (iz + 0.5) * 3 - p0.z) < 16) this.dust.cells.delete(k); } break; }
      case 'crew': {
        if (d.act === 'farmAhead') this.crew.orderAll(d.dir, d.x, d.y, d.z);
        else if (d.act === 'homeAll') this.crewHomeAll();
        else if (d.act === 'one') { const b = this.S.crew.find((x) => x.id === d.id); if (b) this.crewCommand(b, d.d); }
        else if (d.act === 'ctx') { const b = this.S.crew.find((x) => x.id === d.id); if (b) { const r = this.crew.command(b, d.tgt, true); this.netSend({ t: 'toast', icon: '🤖', title: b.name, text: r.msg }); } }
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
      clues: S.clues || [], clueLevel: S.clueLevel || 0, nd: [this.world.needle.i, this.world.needle.j, this.world.needle.k],
      eco: { md: S.stats.maxDist || 0, dx: this.dexN(), pl: S.stats.plush || 0 },   // what prices and shop locks are computed from: the host's, so both screens show what the host pays
    });
  }

  applyShared(m) {
    const S = this.S;
    const key = JSON.stringify([m.up, m.gear, m.items, m.boosts, m.mats]);
    if (m.money > S.money + 0.5 && S.money > 0) this.ui.gain(m.money - S.money);
    S.money = m.money; S.totalEarned = m.te; S.contracts = m.contracts || [];
    // Golden Hour and grid surges start on the host: the guest gets the same toast and sound when the shared timers flip
    if (m.golden > 0 && !(this.golden > 0)) { this.sound.ach(); this.ui.toast({ icon: '🌟', title: 'Golden Hour', text: 'Buyers are in a good mood. Everything sells for double for 75 seconds.', ms: 7000 }); }
    else if (!(m.golden > 0) && this.golden > 0) this.ui.toast({ icon: '🌟', title: 'Golden Hour is over', text: 'Prices are back to normal.', ms: 3000 });
    if (!(m.outage > 0) && this.outage > 0) this.ui.toast({ icon: '💡', title: 'Power restored', text: 'The grid came back.', ms: 3000 });
    if (m.outage > 0 && !(this.outage > 0)) this.ui.toast({ icon: '⚡', title: 'Grid surge', text: 'Everything is down for about 40 seconds. The hall lights died too.', ms: 6000 });
    this.golden = m.golden; this.outage = m.outage;
    this.power.outage = m.outage > 0;
    if (m.clues && m.clues.length > (S.clues || []).length) { for (const c of m.clues.slice((S.clues || []).length)) this.ui.toast({ icon: '📎', title: 'Old paperwork found', text: c, ms: 9000 }); }
    if (m.clues) { S.clues = m.clues; S.clueLevel = m.clueLevel; }
    if (m.eco) this.hostEco = m.eco;
    if (m.nd && this.world) this.world.needle = { i: m.nd[0], j: m.nd[1], k: m.nd[2] };
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
    const belts = [], tiles = [], bpw = [];
    for (const t of L.tiles.values()) {
      if (t.type === 'belt') {
        if ((t.halt || (t.pw ?? 0) > 0.005) && near(cellX(t.i), cellZ(t.k))) bpw.push(t.id, Math.round((t.pw ?? 0) * 100), t.halt ? 1 : 0);   // belt power and line halts: the guest's items must crawl or run at the host's speed, and its hover text must be right
        if (t.items.length && near(cellX(t.i), cellZ(t.k))) { const a = [t.id]; for (const it of t.items) a.push(it.sp, it.vr, Math.round(it.t * 100)); belts.push(a); }
      } else { const row = [t.id, Math.round((t.pw ?? 0) * 100), t.type === 'gen' ? Math.round((t.burn || 0) * 100) / 100 : Math.round(t.burn || 0), t.mode || 0, t.off ? 1 : 0, t.i, t.k, t.q ? t.q.length : t.type === 'vault' ? t.stored.length : 0, t.filter ?? 7]; if (t.type === 'gen') { const rc = [0, 0, 0, 0]; for (const it of t.q) rc[Math.min(3, species[it.sp] ? species[it.sp].rarity : 0)]++; row.push(t.cur ? t.cur.sp : 0, Math.round((t.burnMax || 0) * 100) / 100, rc); } else if (t.type === 'charger') row.push(Math.round((t.reserve || 0) * 100)); tiles.push(row); }
    }
    const movers = [];
    for (const it of this.machines.items.values()) if (it.ent.type === 'borer') movers.push([it.ent.id, it.ent.i, it.ent.k, Math.round((it.ent.pw ?? 0) * 100)]); else if (isEarth(it.ent.type)) movers.push(earthRow(it)); else if (it.ent.type === 'claw') movers.push([it.ent.id, 0, 0, Math.round((it.ent.pw ?? 0) * 100), +(it.phase || 0).toFixed(2), it.target ? it.target.i : -1, it.target ? it.target.j : 0, it.target ? it.target.k : 0, +(it.idle || 0).toFixed(1)]);
    const crew = this.S.crew.map((b) => {
      const sample = b.carry.slice(-4).flatMap((x) => [x.sp, x.vr]);
      return [b.id, b.name, b.color, b.level, Math.round(b.xp), b.state, b.carry.length, +b.battery.toFixed(2), +b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2), +(b.yaw % 6.2832).toFixed(2), sample, b.arm ? 1 : 0, b.aim || null, b.dir || 0, b.deliver || 0, b.dest || 0];
    });
    const packCart = (c) => (c ? { tier: c.tier, mode: c.mode, x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), yaw: +c.yaw.toFixed(2), n: c.load.length, dest: c.dest | 0, load: c.load.slice(-60).flatMap((x) => [x.sp, x.vr]) } : null);
    const cart = packCart(this.S.cart), gcart = packCart(this.S.gcart);   // cart: the host's own, gcart: the guest's own
    let grid = null;
    if (rp) { const net = this.power.nearest(rp.x, rp.y + 1, rp.z); if (net) grid = { supply: net.supply, demand: net.demand, sat: net.sat, tripped: net.tripped ? 1 : 0, cap: net.cap, loads: PWP.packLoads(net), kinds: PWP.countLoads(net) }; }   // (the guest's M readout falls back on this when the world has no power part to send a grid row)
    const dust = rp ? this.dust.at(rp.x, rp.y + 1.2, rp.z) : 0;
    const alarms = []; for (const t of L.tiles.values()) if (t.type === 'belt' && t.detector && t.alarm) alarms.push(t.id);
    this.netSend({ t: 'dyn', belts, bpw, tiles, movers, crew, cart, gcart, grid, dust, alarms, cpw: this.cables.pwRows() });
  }

  applyDyn(m) {
    const L = this.logi;
    const bw = new Map(); const bl = m.bpw || [];
    for (let n = 0; n < bl.length; n += 3) bw.set(bl[n], n);
    for (const t of L.tiles.values()) if (t.type === 'belt') { const n = bw.get(t.id); t.pw = n === undefined ? 0 : bl[n + 1] / 100; t.halt = n !== undefined && bl[n + 2] === 1; }
    for (const a of m.belts) {
      const t = L.byId.get(a[0]); if (!t) continue;
      const its = [];
      for (let n = 1; n < a.length; n += 3) its.push({ sp: a[n], vr: a[n + 1], t: a[n + 2] / 100 });
      t.items = its;
    }
    for (const a of m.tiles) {
      const t = L.byId.get(a[0]); if (!t) continue;
      t.pw = a[1] / 100; t.burn = a[2];
      if (t.type === 'charger') { if (a.length > 9) t.reserve = a[9] / 100; while (t.q.length < a[7]) t.q.push({ sp: 1, vr: 0 }); t.q.length = a[7]; }
      if (t.type === 'gen') { while (t.q.length < a[7]) t.q.push({ sp: 1, vr: 0 }); t.q.length = a[7]; t.mode = a[3] === 'reserve' ? 'reserve' : 'auto'; }   // only the hopper's size is known here (the mix is in rc); the mode rides the row
      if (t.type === 'vault') { t.stored = t.stored || []; if (t.stored.length > a[7]) t.stored.length = a[7]; else if (t.stored.length < a[7]) { const ph = { sp: 1, vr: 0 }; while (t.stored.length < a[7]) t.stored.push(ph); } }   // only how many are stored is known here (the hover readout reads the count)
      if (t.type === 'gen' && a.length > 9) { t.cur = a[9] ? { sp: a[9], vr: 0 } : null; t.burnMax = a[10]; t.rc = a[11]; }
      if (t.type === 'sorter' && (t.mode !== a[3] || t.filter !== a[8])) { t.mode = a[3]; t.filter = a[8]; L.setSorterLook(t); }
      t.off = !!a[4];
      if (t.type === 'sorter' && t.q) { while (t.q.length < a[7]) t.q.push({ sp: 1, vr: 0, t: 0.5 }); t.q.length = a[7]; }
    }
    for (const a of m.movers) {
      const it = this.machines.items.get(a[0]); if (!it) continue; if (a[1]) { it.ent.i = a[1]; it.ent.k = a[2]; } it.ent.pw = a[3] / 100;
      if (isEarth(it.ent.type)) applyEarthRow(it, a);
      else if (it.ent.type === 'claw' && a.length > 4) { it.phase = a[4]; it.target = a[5] >= 0 ? { i: a[5], j: a[6], k: a[7] } : null; it.idle = a[8]; }
    }
    // crew
    const S = this.S;
    this.crewViews = this.crewViews || new Map();
    const list = [];
    for (const a of m.crew) {
      let b = this.crewViews.get(a[0]);
      if (!b) { b = { id: a[0], x: a[8], y: a[9], z: a[10], yaw: a[11], carry: [], trail: [], path: [] }; this.crewViews.set(a[0], b); }
      b.name = a[1]; b.color = a[2]; b.level = a[3]; b.xp = a[4]; b.state = a[5]; b.battery = a[7];
      b.gx = a[8]; b.gy = a[9]; b.gz = a[10]; b.gyaw = a[11]; b.dir = a[15]; b.deliver = a[16] || null; b.dest = a[17] | 0;
      const sample = a[12], n = a[6];
      b.carry = new Array(n);
      for (let q = 0; q < n; q++) { const s2 = (q >= n - sample.length / 2) ? (q - (n - sample.length / 2)) * 2 : -1; b.carry[q] = s2 >= 0 ? { sp: sample[s2], vr: sample[s2 + 1] } : { sp: 1, vr: 0 }; }
      if (a[13]) { b.arm = performance.now() / 1000; b.aim = a[14]; }
      list.push(b);
    }
    for (const id of [...this.crewViews.keys()]) if (!list.some((b) => b.id === id)) this.crewViews.delete(id);
    const crewChanged = (S.crew || []).length !== list.length;
    S.crew = list;
    this.crew.sync();
    if (crewChanged && this.ui.openModal === 'craft') this.ui.renderCraft();   // the host crafted a bot: the Robots card counts it
    // cart
    // my own cart is the host's gcart (it lands in S.cart, which all the local cart code reads), the host's is a view only (S.hcart)
    this.applyCartView('cart', m.gcart);
    this.applyCartView('hcart', m.cart);
    for (const t of L.tiles.values()) if (t.type === 'belt' && t.detector) { const on = m.alarms.includes(t.id); if (on !== !!t.alarm) { t.alarm = on; L.setGate(t, on); } }
    this.guestGrid = m.grid;
    if (m.cpw) this.cables.applyPw(m.cpw);
    this.dust.hostLevel = m.dust;
  }

  applyCartView(key, c) {
    const S = this.S;
    if (!c) S[key] = null;
    else {
      if (!S[key]) S[key] = { tier: c.tier, x: c.x, y: c.y, z: c.z, yaw: c.yaw, mode: c.mode, load: [] };
      const sc = S[key];
      sc.tier = c.tier; sc.mode = c.mode; sc.gx = c.x; sc.gy = c.y; sc.gz = c.z; sc.gyaw = c.yaw; sc.dest = c.dest | 0;
      const sample = c.load, n = c.n;
      sc.load = new Array(n);
      for (let q = 0; q < n; q++) { const s2 = (q >= n - sample.length / 2) ? (q - (n - sample.length / 2)) * 2 : -1; sc.load[q] = s2 >= 0 ? { sp: sample[s2], vr: sample[s2 + 1] } : { sp: 1, vr: 0 }; }
    }
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
  // a short note from management on the early mornings, each one a real tip about something you have probably not tried yet
  dayTip(n) {
    return ({
      2: 'Memo, Day 2: a frame is a hollow cube, 4 cells (2.4 m) each way. Dig the section out first, then set it. It never digs for you.',
      3: 'Memo, Day 3: dust builds up in a long tunnel. A cough means leave. A Vent Fan or a Support Fan under a frame moves it.',
      4: 'Memo, Day 4: left and right arrows turn a frame you are holding. Turn each one a little and the tunnel bends.',
      5: 'Memo, Day 5: every support has a depth rating. Wood stops being enough a long way before the east wall.',
      6: 'Memo, Day 6: veins of rare plush drift through the pile. A Vein Assay will point you at them.',
      7: 'Memo, Day 7: one in sixty thousand plush is a Razzo. If one starts ticking, throw it away from your tunnel.',
    })[n] || '';
  }
  dayNumber() { return Math.max(1, Math.floor((this.S.gameMin || 0) / 1440) + 1); }
  dayLine(n) {
    const special = { 2: 'Still here.', 3: 'You are getting the hang of it.', 5: 'A full work week, nearly.', 7: 'One week on the job.', 10: 'Ten days. The pile has not noticed.', 14: 'Two weeks. Management has forgotten your name.', 30: 'A month in the warehouse.', 50: 'Fifty days. You know the sounds now.', 100: 'One hundred days. Nobody remembers who hired you.' };
    if (special[n]) return special[n];
    const pool = ['The lights are back on.', 'Another shift.', 'The bin is hungry.', 'Mind the pile.', 'Good morning, Warehouse 07.', 'Same mountain, new day.', 'Your lamp can rest.'];
    return pool[n % pool.length];
  }
  dayMinute() { return ((7 * 60 + (this.S.gameMin || 0)) % 1440 + 1440) % 1440; }
  isOpen() { const m = this.dayMinute(); return m >= 420 && m < 1140; }

  // the hall lights match the clock the moment a world loads (a save at night, or a friend joining after closing), not after a slow fade
  syncLights() {
    this.lightLevel = (this.isOpen() && !(this.outage > 0)) ? 1 : 0;
    if (this.hall && this.hall.setLevel) this.hall.setLevel(this.lightLevel);
  }

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
        { const dn = this.dayNumber(); if (dn !== this._dayShown) { this._dayShown = dn; this.ui.dayCard(dn, this.dayLine(dn)); const tip = this.dayTip(dn); if (tip) setTimeout(() => this.ui.toast({ icon: '📋', title: 'Memo from management', text: tip.replace(/^Memo, Day \d+: /, ''), ms: 9000 }), 4500); } }
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
    if (this._clkT <= 0) { this._clkT = 0.5; this.ui.setClock(this.dayMinute(), open, this.S.gear && this.S.gear.helmet > 0); this.ui.setDay(this.dayNumber()); }
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
      const fluff = Math.max(10, Math.round(n * MATERIALS[mk].unit * 0.7));   // old caches held lumber and beams: now they hold the Fluff it was worth
      S.money += fluff; this.ui.setMoney(S.money);
      text = `◈ ${fluff} of building funds`;
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
        const sp = pickByRarity(rr, bandOfDist(dist), rng(), rng());   // the same regional rule as the pile: a far cache holds the species of that distance
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
    if (BINPANEL.pasteToCart(this)) return;   // a copied bin (Shift+;) pastes onto your own cart: it is no machine, so the catalog paste never sees it
    if (this.crewUseKey()) return;
    if (EXT.useKey(this)) return;   // catalog types: paste a copied config, or the type's own use()
    if (TRANSIT.useKey(this)) return;   // doors, the lift car and its call buttons, jump pads (transit.js)
    {
      const tile = this.logi.pick(this.renderer.camera.position, this.player.forward(_fwd), 3.4);
      if (tile && this.useTile(tile)) return;
    }
    { const eit = this.pickEarth(); if (eit) { this.useEarthIt(eit); return; } }
    for (const it of this.machines.items.values()) {
      if (it.ent.type === 'beacon' && Math.hypot(it.ent.x - this.player.pos.x, it.ent.z - this.player.pos.z) < 3.2) { this.openModal('travel'); return; }
    }
    {   // the desk, the bench, the kiosk and the bin: the one you stand nearest to answers (the desk and the bench are only 4 m apart, so a fixed order made E at the desk open the bench)
      const S = this.S, pp = this.player.pos, h = this.hall, dist = (q) => Math.hypot(pp.x - q.x, pp.z - q.z);
      const at = [[dist(h.craftPos), 3.6, () => this.openModal('craft')], [dist(h.kioskPos), 3.0, () => this.openModal('dossier')], [dist(h.termPos), 3.4, () => this.openModal('shop')],
        [dist(h.binPos), 3.6, () => { if (S.carry.length) this.sellAll(); else this.ui.hint('Nothing to sell. Grab some plush first.', 2); }]].filter((c) => c[0] < c[1]).sort((x, y) => x[0] - y[0]);
      if (at.length) { at[0][2](); return; }
    }
    this.ui.hint('Nothing to use here.', 1.5);
  }

  // the earth mover you are aiming at (they are big, so a few metres of reach count from the nearest part of them)
  pickEarth() {
    const eye = this.renderer.camera.position, dir = this.player.forward(_fwd); let best = null, bd = 1e9;
    for (const it of this.machines.items.values()) {
      const e = it.ent; if (!isEarth(e.type)) continue;
      const v = _v2.set(it.obj.position.x - eye.x, it.obj.position.y + (e.hy ?? 0.8) - eye.y, it.obj.position.z - eye.z), d = v.length();
      if (d > 3.6 + (e.hr || 0)) continue;
      if (d > 0.1 && v.normalize().dot(dir) < 0.8) continue;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  // E on an earth mover: a digger hands you what is in its hopper, otherwise it parks or goes back to work
  useEarthIt(it) {
    const room = Math.max(0, this.T.carry - this.S.carry.length);
    if (this.isGuest()) { this.cmd('earth', { id: it.ent.id, room }); this.sound.place(); return; }
    const r = useEarth(this, it, room), name = EARTH[it.ent.type].name;
    if (r.took && r.took[0] === NEEDLE) { this.foundNeedle(`the ${name.toLowerCase()}`); return; }   // The One comes out of a hopper or a truck bed first: taking it is the win, like a gate
    if (r.took) { for (let q = 0; q < r.took.length; q += 2) this.S.carry.push({ sp: r.took[q], vr: r.took[q + 1] }); this.ui.setCarry(this.S.carry, this.T.carry); this.sound.coin(0); this.ui.hint(`Took ${r.took.length / 2} plush out of the ${name}'s hopper.`, 2.5); }
    else { this.sound.place(); this.ui.hint(r.msg || (r.off ? `${name} parked. E runs it again.` : `${name} back to work.`), 2.5); this.power.markDirty(); }
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
    if (d0 < bd) { bd = d0; best = { kind: 'sell', x: bp.x, y: 1.0, z: bp.z, bin: BINS.HALL }; }
    for (const it of this.machines.items.values()) {
      if (it.ent.type !== 'beacon') continue;
      const d = Math.hypot(x - it.ent.x, z - it.ent.z);
      if (d < bd) { bd = d; best = { kind: 'sell', x: it.ent.x, y: 1.0, z: it.ent.z, bin: it.ent.id }; }
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
    this._adC = (this._adC || 0) - dt; this._adCg = (this._adCg || 0) - dt;
    if (S.carry.length && this._adT <= 0) {
      const sink = this.nearestSink(pp.x, pp.y + 1, pp.z, T.autoDump);
      if (sink) {
        const batch = this.binBatch(S.carry.length); let took = 0;
        for (let n = 0; n < batch && S.carry.length; n++) {
          const it = S.carry[S.carry.length - 1];
          if (!(sink.kind === 'sell' || this.isGuest() || this.logi.accept(sink.ent, it, null))) break;
          S.carry.pop(); took++;
          if (sink.kind === 'sell') this.sell(it.sp, it.vr, { dist: 0, streak: true, bin: sink.bin });
          else if (this.isGuest()) this.cmd('feed', { id: sink.ent.id, sp: it.sp, vr: it.vr });
          if (n < 10) { const cam = this.renderer.camera.position; this.fliers.push({ sp: it.sp, vr: it.vr, from: new THREE.Vector3(cam.x, cam.y - 0.5, cam.z), to: new THREE.Vector3(sink.x, sink.y, sink.z), t: -n * 0.015, dur: 0.36, arc: 0.7 }); }
        }
        if (took) { this.ui.setCarry(S.carry, T.carry); this.heldPop = -0.5; this._adT = Math.max(0.05, 0.14 - S.carry.length * 0.004); } else this._adT = 0.2;
      }
    }
    if (!this.isGuest()) {
      this.autoDumpCart(S.cart, '_adC', T);
      if (S.gcart) this.autoDumpCart(S.gcart, '_adCg', T);
    }
  }

  // how many plush one pull of a bin takes: the Bin Throughput batch, and never fewer than about 4 plus a tenth of what you hold, so a full cart empties in a second or two instead of a minute of one at a time
  binBatch(load) { return Math.max(this.T.binBatch || 1, Math.ceil(4 + (load || 0) / 10)); }

  // where a cart dumps itself: the bin it is assigned when that one works, else the nearest sink (the bin, a depot or a Sorting Box) as always
  cartSink(c, range) {
    const r = BINS.resolve(this, c.dest);
    if (c.dest && !r.bin) BINS.fallback(this, { k: 'cart', o: c, key: c === this.S.gcart ? 'gcart' : 'cart' }, r.why, r.named ? r.named.name : '');
    if (r.bin) return Math.hypot(c.x - r.bin.x, c.z - r.bin.z) < range ? { kind: 'sell', x: r.bin.x, y: 1.0, z: r.bin.z, bin: r.bin.id } : null;
    return this.nearestSink(c.x, c.y + 0.5, c.z, range);
  }

  // a cart near a sink (the bin, a sorter) unloads itself; the host runs this for its own cart and for the friend's
  autoDumpCart(c, tk, T) {
    if (c && c.load.length && (this[tk] || 0) <= 0) {
      const sink = this.cartSink(c, Math.max(3.2, T.autoDump * 0.8));
      if (sink) {
        const batch = this.binBatch(c.load.length); let took = 0;
        for (let n = 0; n < batch && c.load.length; n++) {
          const it = c.load[c.load.length - 1];
          if (!(sink.kind === 'sell' || this.logi.accept(sink.ent, it, null))) break;
          c.load.pop(); took++;
          if (sink.kind === 'sell') this.sell(it.sp, it.vr, { dist: 0, streak: true, bin: sink.bin });
          if (n < 10) this.fliers.push({ sp: it.sp, vr: it.vr, from: new THREE.Vector3(c.x, c.y + 0.7, c.z), to: new THREE.Vector3(sink.x, sink.y, sink.z), t: -n * 0.015, dur: 0.4, arc: 0.9 });
        }
        this[tk] = took ? Math.max(0.04, 0.1 - c.load.length * 0.0004) : 0.25;
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
      this.cmd('sell', { sp, vr, dist: opt.dist || 0, streak: !!opt.streak, bin: opt.bin });
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
    BINS.note(this, Number.isInteger(opt.bin) ? opt.bin : BINS.HALL, 1, v);
    this.contracts.onSale(sp, vr);
    this.ui.setMoney(S.money);
    this.ui.gain(v);
    const bp = (opt.bin > 0 && BINS.binById(this, opt.bin)) || this.hall.binPos;   // the coins fly where it was sold: the depot, or the SORT bin
    if (this.coinCd <= 0) { this.coinCd = 0.04; this.sound.coin(this.streak.n); }
    if (swish) this.sound.swish();
    this.fx.coin(bp.x, 1.2, bp.z, Math.min(6, 1 + Math.floor(Math.log10(v + 1) * 2)));
    this.fx.burst(bp.x, 1.1, bp.z, 4, 1, 0.55, 0.15, 2.5, 0.07, 0.6);
    if (swish && opt.dist >= 12) this.ui.hint(`Swish! ${opt.dist.toFixed(0)} m shot.`, 2);
  }

  sellAuto(sp, vr, mult = 1, bin) {
    const S = this.S;
    if (sp === NEEDLE) { this.needleLost('a machine'); return; }
    const v = Math.max(1, Math.round(this.valueOf(sp, vr, 0) * mult * (this.golden > 0 ? 2 : 1)));
    S.money += v; S.totalEarned += v; S.stats.sold++;
    if (bin !== undefined) BINS.note(this, bin, 1, v);   // which bin it was sold at (the same money at every bin)
    this.contracts.onSale(sp, vr);
    this.ui.setMoney(S.money); this.ui.gain(v);
    if (this.coinCd <= 0) {
      this.coinCd = 0.12; this.sound.coin(0);
      if (this.net.open && this.net.role === 'host') this.netSend({ t: 'sale', fb: 1 });   // the friend hears the coin too (belts, carts, bots and salvage sell on the host): one message per 0.12 s, like the host's own sound
    }
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
    this.registerDex(taken.sp, true);
    const pk = BINS.pickHall(this, ent && ent.dest), bp = pk.bin;   // a rig sells at the SORT bin unless it has a bin of its own that works
    if (pk.why && ent) BINS.fallback(this, { k: 'ent', o: ent }, pk.why, pk.named ? pk.named.name : '');
    this.sellAuto(taken.sp, taken.vr, 1, bp.id);
    this.fliers.push({ sp: taken.sp, vr: taken.vr, from: new THREE.Vector3(x, y, z), to: new THREE.Vector3(bp.x, 1.0, bp.z), t: 0, dur: 0.9 + Math.hypot(x - bp.x, z - bp.z) * 0.03, arc: 3 + Math.hypot(x - bp.x, z - bp.z) * 0.12 });
    this.fx.dust(x, y, z, 3, 0.6, 0.8);
    void ent;
  }

  borerEat(taken, x, y, z, ent) {
    const S = this.S;
    S.stats.plush++; S.stats.rar[species[taken.sp].rarity]++; S.stats.cells++;
    if (taken.vr & 128) S.stats.shiny++;
    this.registerDex(taken.sp, true);
    const pk = BINS.pickHall(this, ent && ent.dest);   // the SORT bin unless the borer has a bin of its own that works
    if (pk.why && ent) BINS.fallback(this, { k: 'ent', o: ent }, pk.why, pk.named ? pk.named.name : '');
    this.sellAuto(taken.sp, taken.vr, 1, pk.bin.id);
  }

  // ======================= building =======================
  frameEquipped() { const t = this.curTool && this.curTool(); return !!(t && t.kind === 'frame' && !this.stowed); }

  updateBuild(tool, eye, dir) {
    const T = this.T, S = this.S;
    let plan = null, cost = 0;
    const yaw = this.player.yaw;
    if (tool.kind === 'cart' || tool.kind === 'supply') {
      this.plan = null; this.machines.setGhost(null); this.machines.showPreview(null, null); this.ui.setCross(false);
      this.ui.hint(tool.kind === 'cart' ? '<kbd>B</kbd> roll the cart out / park it · <kbd>Q</kbd> put away' : (tool.id === 'medkit' ? '<kbd>B</kbd> use a medkit · <kbd>Q</kbd> put away' : tool.id === 'doorkey' ? 'Door Key: automatic, keep it in your pack · <kbd>Q</kbd> put away' : tool.id === 'chargepack' ? 'Charge Pack: press <kbd>E</kbd> on a Haul Truck that ran out of battery · <kbd>Q</kbd> put away' : 'Air canister: automatic · <kbd>Q</kbd> put away'), 0.4);
      return;
    }
    if (tool.kind === 'hammer') {
      // hammer: show what a click would knock down
      this.plan = null; this.machines.setGhost(null); this.machines.showPreview(null, null); this.renderer.setGhost(0);
      const ref = this.hammerTarget(); const name = this.describeRef(ref);
      this.ui.setCross(!!ref);
      this.ui.hint(name ? `Click: knock down <b>${name}</b> (you get it back) · <kbd>Q</kbd> put away` : 'Hammer: aim at something you built · <kbd>Q</kbd> put away', 0.4);
      return;
    }
    if (tool.kind === 'cable') { this.cables.aimUpdate(tool, eye, dir); return; }
    if (tool.kind === 'frame') {
      // Left / Right turn the frame smoothly and free it from the grid: it stands where you aim, at any angle, so tunnels can curve
      const now = performance.now(), fdt = Math.min(0.1, (now - (this._fyT || now)) / 1000); this._fyT = now;
      const turn = (this.keys.ArrowRight ? 1 : 0) - (this.keys.ArrowLeft ? 1 : 0);
      if (turn) {
        if (this.frameYaw == null) this.frameYaw = this._lastFrameYaw ?? (Math.abs(Math.sin(yaw)) > 0.7071 ? Math.PI / 2 : 0);
        this.frameYaw += turn * (this.keys.ShiftLeft || this.keys.ShiftRight ? 0.5 : 1.4) * fdt;
      }
      plan = this.machines.planFrame(eye, dir, yaw, tool.fk, this.frameYaw ?? null); cost = FRAME_TYPES[tool.fk].cost;
      if (plan.ok && !plan.ent.turned) { const why = STACK.cubeWhy(this, plan.ent, tool.fk); if (why) plan = { ok: false, why, ent: plan.ent }; }   // a cube set on a stack must not overload the cubes under it
      if (plan.ent && plan.ent.yaw !== undefined) this._lastFrameYaw = plan.ent.yaw;
    }
    else if (tool.kind === 'mfan') { plan = this.machines.planMountFan(eye, dir, yaw); cost = 0; }
    else if (tool.kind === 'lantern') { plan = this.machines.planLantern(eye, dir); cost = 6; }
    else if (['marker', 'flare', 'glow', 'charge', 'dynamite', 'strut', 'jack', 'rope'].includes(tool.kind)) { plan = this.machines.planSimple(tool.kind, eye, dir); }
    else if (tool.kind === 'beacon') { plan = this.machines.planBeacon(eye, dir); cost = this.beaconCost(); }
    else if (tool.kind === 'claw') {
      plan = this.machines.planRig(eye, dir); cost = this.rigCost();
      if (plan.ok && this.machines.count('claw') >= T.rigMax) plan = { ok: false, why: `Rig limit reached (${T.rigMax})`, ent: plan.ent };
    } else if (tool.kind === 'borer') {
      plan = this.machines.planBorer(eye, dir, yaw); cost = this.borerCost();
      if (plan.ok && this.machines.count('borer') >= T.borerMax) plan = { ok: false, why: `Borer limit reached (${T.borerMax})`, ent: plan.ent };
    } else if (isEarth(tool.kind)) {
      plan = this.machines.planEarth(tool.kind, eye, dir, yaw); cost = this.earthCost(tool.kind);
      if (plan.ok) { const why = earthConflict(this, tool.kind, plan.ent); if (why) plan = { ok: false, why, ent: plan.ent }; }
    }
    if (['belt', 'sorter', 'vault', 'mech', 'bulk', 'gen', 'charger', 'pole', 'fan', 'gate', 'splitter'].includes(tool.kind)) { ({ plan, cost } = this.planLogi(tool, eye, dir, yaw)); }
    const catPlan = EXT.isCatalogTool(tool.kind) ? EXT.planTool(this, tool, eye, dir, yaw) : null;   // catalog tools (catalog_*.js TYPES[kind].plan)
    if (catPlan) { plan = catPlan.plan; cost = catPlan.cost || 0; }
    this.plan = plan; this.planCost = cost;
    if (catPlan) EXT.previewTool(this, tool, plan);
    else if (['belt', 'sorter', 'vault', 'mech', 'bulk', 'gen', 'charger', 'pole', 'fan', 'gate', 'splitter'].includes(tool.kind)) this.showCellGhost(tool, plan);
    else if (plan && plan.ent) this.machines.showPreview(tool, plan); else this.machines.showPreview(null, null);
    if (plan && plan.ok && this.keys.KeyB && (tool.kind === 'belt' || tool.kind === 'bulk' || tool.kind === 'rail' || tool.kind === 'road') && !BP.plannerOn(this, tool)) {
      const key = tool.kind === 'road' ? `${plan.ent.i0},${plan.ent.j},${plan.ent.k0}` : `${plan.ent.i},${plan.ent.j},${plan.ent.k}`;
      if (key !== this.lastPaint) { this.lastPaint = key; this.placeCurrent(tool); }
    }
    if (!this.keys.KeyB) this.lastPaint = '';
    if (plan) {
      if (!plan.ok) this.ui.hint(plan.why || '', 0.4);
      else if (plan.hintText) this.ui.hint(plan.hintText, 0.4);   // a tool that explains itself (planner, lift, underground, upgrade in place)
      else if (this.strainOf(tool, plan).state === 'break') { const st = this.strainOf(tool, plan); this.ui.hint(`<b>Too much weight for ${st.name}: ${st.pct}% load.</b> It will break the moment you set it (${Math.round(st.d)} m deep, rated ${isFinite(st.max) ? st.max + ' m' : 'any depth'}). ${st.next && FRAME_TYPES[st.next] ? 'Use ' + FRAME_TYPES[st.next].name + ' or better, or hold the roof up with more supports.' : 'Add more supports to share the load.'}`, 0.4); }
      else if (this.strainOf(tool, plan).state === 'creak') { const st = this.strainOf(tool, plan); this.ui.hint(`<b>${st.name} would carry ${st.pct}% load.</b> It holds, but it is creaking under the mountain. More supports nearby share the weight. <kbd>B</kbd> set down`, 0.4); }
      else this.ui.hint(`<kbd>B</kbd> set down${tool.kind === 'belt' ? ' (hold B to lay a line)' : ''}${tool.kind === 'frame' ? (plan.ent.turned ? ` · ${plan.ent.snap} · <kbd>◄</kbd> <kbd>►</kbd> turn (hold Shift for fine) · <kbd>▼</kbd> back to the grid` : plan.ent.snap ? ` · snaps ${plan.ent.snap}` : ` · 4x4x4 cube (2.4 m), dig the section out first · place the next one on any side to snap · <kbd>◄</kbd> <kbd>►</kbd> turn it free of the grid (curves)`) : ''}${tool.ramp ? ' · <kbd>R</kbd> flips up/down' : ''}${tool.kind === 'borer' || (isEarth(tool.kind) && EARTH[tool.kind].dig) ? ' · digs the way you face' : ''} · <kbd>Q</kbd> stow`, 0.4);
    }
    this.ui.setCross(plan && plan.ok);
  }

  planLogi(tool, eye, dir, yaw) {
    const T = this.T;
    const rise = tool.ramp ? (this.rampMode % 2 === 1 ? -1 : 1) : 0;
    const kind = tool.kind;
    if (kind === 'belt') { const bp = BP.plan(this, tool, eye, dir, yaw); if (bp) return bp; }   // line planner, or a higher mark set over a belt (beltplan.js)
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
      const taken = this.logi.cellTaken(last.i, last.j, last.k);   // a belt, a rail piece, a shaft or a machine already stands in that cell
      const bad = !!taken || near;
      return { plan: { ok: !bad, why: bad ? (taken || 'Too close') : null, ent: { type: 'bulk', ...last, dir: 0 } }, cost: 10 };
    }
    if (kind === 'splitter') {
      const bt = this.logi.pick(eye, dir, 4.5);
      if (bt && bt.type === 'belt' && !bt.splitter && !bt.detector && !bt.merger) return { plan: { ok: true, ent: { type: 'splitbelt', id: bt.id, i: bt.i, j: bt.j, k: bt.k, dir: bt.dir, rise: 0 } }, cost: 0 };
      return { plan: this.logi.plan('belt', eye, dir, yaw, 0), cost: 0 };
    }
    if (kind === 'gate') {
      const bt = this.logi.pick(eye, dir, 4.5);
      let pl;
      if (bt && bt.type === 'belt' && !bt.detector && !bt.splitter && !bt.merger) pl = { ok: true, ent: { type: 'gatebelt', id: bt.id, i: bt.i, j: bt.j, k: bt.k, dir: bt.dir, rise: bt.rise || 0 } };
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
    let cost = 0; const _unused = kind === 'belt' ? (rise ? 5 : 3) : kind === 'sorter' ? this.sorterCost() : kind === 'vault' ? 140 : kind === 'gen' ? this.genCost() : kind === 'charger' ? this.chargerCost() : kind === 'pole' ? 20 : kind === 'fan' ? 240 : this.mechCost();
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
    const r = this.gateClearance() + 0.8; // just outside the bin's pull, so it sits as close to the start as it can
    const bp = this.hall.binPos;
    let spot = null;
    for (const [x, z] of [[0, 3.6], [-2.4, 3.2], [2.4, 3.6], [-4, 1.2], [0, 5], [-4.2, -1.2], [-3, 5], [3, 5.5], [0, 7], [0, 10]]) {
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
  // new species found by machines, bots and while you were in a menu: one quiet note every so often
  flushAutoDex(dt) {
    this._autoDexT = (this._autoDexT || 0) + dt; if (this._autoDexT < 30 || !this._autoNewDex || this.ui.isModalOpen()) return;
    this._autoDexT = 0; const n = this._autoNewDex; this._autoNewDex = 0;
    this.ui.toast({ icon: '📖', title: n === 1 ? '1 new species logged' : `${n} new species logged`, text: 'Your machines and crew found them. See the Plushdex (N).', ms: 4000 });
  }

  // plush thrown at a generator drop into its hopper
  feedGensFromThrows() {
    const sim = this.sim; if (!sim || !sim.n) return;
    for (const t of this.logi.tiles.values()) {
      if (t.type !== 'gen' || t.q.length >= PWP.genHopper(this.T, t)) continue;
      const gx = cellX(t.i), gz = cellZ(t.k), gy = t.j * C;
      for (let i = sim.n - 1; i >= 0; i--) {
        if (sim.flag[i] !== 1) continue; const dx = sim.x[i] - gx, dz = sim.z[i] - gz; if (dx * dx + dz * dz > 1.3) continue; if (sim.y[i] > gy + 2.2) continue;
        const sp = sim.sp[i], r = species[sp] ? species[sp].rarity : 9; if (r > FUEL_MAX_RARITY) continue;
        if (this.logi.accept(t, { sp, vr: sim.vr[i] }, null)) { sim.remove(i); this.power.markDirty(); this.fx.fluff(gx, gy + 1.0, gz, 1, 0.6, 0.2, 5); this.sound.tone('triangle', 500, 700, 0.08, 0.06); if (t.q.length >= PWP.genHopper(this.T, t)) break; }
      }
    }
  }

  // plush thrown at a Charging Station drop into its hopper
  feedChargersFromThrows() {
    const sim = this.sim; if (!sim || !sim.n) return;
    for (const t of this.logi.tiles.values()) {
      if (t.type !== 'charger' || t.q.length >= CHARGER_HOPPER) continue;
      const gx = cellX(t.i), gz = cellZ(t.k), gy = t.j * C;
      for (let i = sim.n - 1; i >= 0; i--) {
        if (sim.flag[i] !== 1) continue; const dx = sim.x[i] - gx, dz = sim.z[i] - gz; if (dx * dx + dz * dz > 1.3) continue; if (sim.y[i] > gy + 2.2) continue;
        const sp = sim.sp[i], r = species[sp] ? species[sp].rarity : 9; if (r > CHARGER_MAX_RARITY) continue;
        if (this.logi.accept(t, { sp, vr: sim.vr[i] }, null)) { sim.remove(i); this.fx.sparkle(gx, gy + 0.9, gz, 4, 0.3, 0.9, 1); this.sound.tone('triangle', 600, 900, 0.08, 0.06); if (t.q.length >= CHARGER_HOPPER) break; }
      }
    }
  }

  // the hover readout of a Charging Station
  chargerInfo(t) {
    const q = t.q || [], res = t.reserve || 0;
    const names = ['Common', 'Uncommon', 'Rare', 'Epic'];
    const lines = [`Charge ${res.toFixed(2)} of ${CHARGER_CAP} (one full bot battery is 1.0)  ·  hopper ${q.length}/${CHARGER_HOPPER}`];
    lines.push(`Each plush adds: ${names.map((n, r) => `${CHARGE_PER[r]} (${n})`).join(', ')}`);
    lines.push('Bots recharge here at 0.5 battery per second. It needs no power.');
    lines.push('Throw or hand it Common to Epic plush. Legendary and Mythic are too valuable.');
    return { title: 'CHARGING STATION' + (res > 0.02 ? ' · READY' : ' · EMPTY'), lines, live: res > 0.02 };
  }

  // what a generator is doing, for the hover readout
  genInfo(t) {
    const T = this.T, lit = t.burn > 0, kind = PWP.genKindOf(t), out = PWP.genKw(T, t), hop = PWP.genHopper(T, t); const q = t.q || [];
    const cur = t.cur ? species[t.cur.sp] : null;
    const names = ['Common', 'Uncommon', 'Rare', 'Epic'];
    const counts = [0, 0, 0, 0]; let queued = 0;
    for (const it of q) { const r = Math.min(3, species[it.sp] ? species[it.sp].rarity : 0); counts[r]++; queued += burnTime(r, out); }
    if (t.rc) for (let r = 0; r < 4; r++) { counts[r] = t.rc[r] || 0; }
    if (t.rc) { queued = 0; for (let r = 0; r < 4; r++) queued += counts[r] * burnTime(r, out); }
    const left = Math.max(0, t.burn || 0), total = left + queued;
    const fmt = (sec) => (sec >= 90 ? `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s` : sec >= 10 ? `${Math.round(sec)} s` : sec >= 1 ? `${sec.toFixed(1)} s` : sec >= 0.01 ? `${sec.toFixed(2)} s` : `${(sec * 1000).toFixed(1)} ms`);   // (a Titan on a Common with every upgrade burns one in about 2 ms: never "0.00 s")
    const net = this.power.nets.find((n) => n.nodes.includes(t)) || null;
    const lines = [];
    lines.push(lit && cur ? `Burning: ${cur.name} (${RARITY[cur.rarity].name}), ${fmt(left)} left of ${fmt(t.burnMax || left)}` : 'Not burning: out of fuel');
    lines.push(`Output ${out < 1000 ? out.toFixed(1) + ' kW' : PWP.kwText(out)}${net ? `  ·  grid ${net.supply.toFixed(1)} of ${net.demand.toFixed(1)} kW wanted` : ''}`);
    lines.push(`Burn rate: 1 plush per ${fmt(burnTime(0, out))} (Common), ${fmt(burnTime(1, out))} (Uncommon), ${fmt(burnTime(2, out))} (Rare), ${fmt(burnTime(3, out))} (Epic)`);
    const mix = counts.map((c, r) => (c ? `${c} ${names[r]}` : '')).filter(Boolean).join(', ');
    lines.push(`Hopper ${q.length}/${hop}${mix ? ': ' + mix : ' (empty)'}${total > 0 ? `  ·  runs ${fmt(total)}` : ''}`);
    if (kind.key !== 'std') lines.push(`${kind.name}: ${kind.mul < 1 ? 'a quarter of' : kind.mul + ' times'} the base ${(T.genOutput).toFixed(1)} kW, takes ${kind.ports} cables`);
    lines.push(t.mode === 'reserve'
      ? `RESERVE: ${lit ? 'burning now because it is needed' : q.length ? 'holding its fuel' : 'no fuel'}. It burns only when a battery on its grid is under 30% or the grid is overloaded. E with empty hands switches it to AUTO.`
      : 'AUTO: it burns whenever it has fuel. E with empty hands switches it to RESERVE (it saves plush while the batteries are full).');
    lines.push('Throw or hand it Common to Epic plush. Legendary and Mythic are too valuable to burn.');
    return { title: kind.key === 'std' ? 'GENERATOR' : kind.name.toUpperCase(), lit, lines };
  }

  // gate scan beeps share one limiter so a busy belt or a crowd of bots never turns into a machine-gun of dings
  gateDing(dur = 0.05, vol = 0.035) { if (this._dingNext > this.time) return; this._dingNext = this.time + 0.3; this.sound.tone('sine', 1250, 1250, dur, vol); }

  // the walk-through scan lives in detector.js so the detector arch wave never edits this file
  playerGateScan(dt) { DETECTOR.playerScan(this, dt); }

  showCellGhost(tool, plan) {
    if (BP.ghost(this, tool, plan)) return;   // a planned line draws all its tiles
    if (!plan || !plan.ent) { this.machines.setGhost(null); return; }
    const e = plan.ent;
    const gsc = tool.kind === 'gen' && PWP.GEN_BY_ITEM[tool.id] ? PWP.GEN_BY_ITEM[tool.id].scale : 1;   // the generator ladder: a bigger rung shows a bigger ghost
    const gold = !!(plan.ok && e.type === 'belt' && this.logi.wouldSink(e));   // the last piece of a line within suck range of a bin shows gold
    const key = `${tool.kind}${plan.ok}${e.dir}${e.rise || 0}${gsc}${gold ? 'g' : ''}`;
    if (this.machines.ghostKey !== key) {
      const g = new THREE.Group(); g.scale.setScalar(gsc);
      const mat = new THREE.MeshBasicMaterial({ color: gold ? 0xffc928 : plan.ok ? 0x5dffa0 : 0xff5a4a, transparent: true, opacity: gold ? 0.6 : 0.4, depthWrite: false });
      const flat = tool.kind === 'belt' || tool.kind === 'gate' || tool.kind === 'splitter';
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
    if (BP.handle(this, tool)) return;   // line planner on: this click sets the start or lays the line (beltplan.js)
    if (!plan || !plan.ok) { this.sound.error(); if (plan && plan.why) this.ui.hint(plan.why, 2); return; }
    if (!(S.items[tool.id] > 0)) { this.sound.error(); return; }
    this.plan = null; // one plan places once: a second click in the same frame must wait for the next aim update, or it would stack a duplicate
    if (this.isGuest()) { this.cmd('place', { tool: { id: tool.id, kind: tool.kind, fk: tool.fk, ramp: tool.ramp, hose: tool.hose, p: tool.p }, ent: plan.ent }); this.sound.place(); return; }
    S.items[tool.id]--;
    if (S.items[tool.id] <= 0) delete S.items[tool.id];
    const left = S.items[tool.id] || 0;
    const id = this.nextId();
    let ent;
    const e = plan.ent;
    if (tool.kind === 'belt' && e.type === 'tierbelt') { BP.applyTier(this, tool, e); return; }   // a higher mark set over a belt: upgrade it in place, the old one comes back
    if (EXT.isCatalogTool(tool.kind)) { const made = EXT.buildTool(this, tool, e); if (!made) this.giveItem(tool.id); return; }   // catalog tools: TYPES[kind].build then placeEntity
    if (tool.kind === 'frame' || tool.kind === 'strut' || tool.kind === 'jack') {
      const st = this.strainOf(tool, plan);
      if (st.state === 'break') { this.breakSupport(st, e); this.rebuildTools(); return; }
      if (st.state === 'creak') { this._strainNote = `${st.name} set. It is creaking under the pressure of the mountain: ${st.pct}% load. It holds, but the next one nearby should share it.`; this.sound.creak(0.25); if (this._forGuest) this.netSend({ t: 'sstrain', note: this._strainNote }); }
    }
    if (tool.kind === 'bulk') {
      this.world.setCell(e.i, e.j, e.k, BULK, (Math.random() * 127) | 0);
      this.world.stabQueue.push({ i: e.i, j: e.j, k: e.k });
      this.sound.place(); this.S.stats.bulk = (this.S.stats.bulk || 0) + 1;
      this.rebuildTools();
      return;
    }
    if (tool.kind === 'splitter' && e.type === 'splitbelt') {
      const tile = this.logi.byId.get(e.id);
      if (tile && !tile.splitter && !tile.detector && !tile.merger) {
        tile.splitter = true; this.logi.buildSplitter(tile);
        this.netSend({ t: 'ent-', id: tile.id }); this.netSend({ t: 'ent+', ent: this.stripEnt(tile) });
        this.sound.place(); this.S.stats.splitters = (this.S.stats.splitters || 0) + 1; this.rebuildTools();
      }
      return;
    }
    if (tool.kind === 'gate' && e.type === 'gatebelt') {
      const tile = this.logi.byId.get(e.id);
      if (tile && !tile.detector && !tile.merger && !tile.splitter) {
        tile.detector = true; this.logi.buildGate(tile);
        this.netSend({ t: 'ent-', id: tile.id }); this.netSend({ t: 'ent+', ent: this.stripEnt(tile) });
        this.sound.place(); this.S.stats.gates = (this.S.stats.gates || 0) + 1; this.rebuildTools();
      }
      return;
    }
    if (['belt', 'sorter', 'vault', 'mech', 'gen', 'charger', 'pole', 'fan', 'gate', 'splitter'].includes(tool.kind)) {
      ent = { id, type: tool.kind === 'gate' || tool.kind === 'splitter' ? 'belt' : tool.kind, i: e.i, j: e.j, k: e.k, dir: e.dir, rise: e.rise || 0 };
      if (tool.hose) ent.hose = true;
      if (tool.kind === 'gen') { const gk = PWP.GEN_BY_ITEM[tool.id]; if (gk && gk.key !== 'std') ent.gk = gk.key; }   // the generator ladder: the host reads the rung from the item id, never from what a guest sent
      BP.stamp(this, tool, ent);   // a Mk2 to Mk6 belt item makes a belt of that mark
      if (e.turnPrev && tool.kind === 'belt') { const pt = this.logi.byId.get(e.turnPrev.id); if (pt && pt.type === 'belt' && !this.logi.nextOf(pt)) { pt.dir = e.turnPrev.dir; this.logi.dirty = true; } }
      if (tool.kind === 'splitter') { ent.splitter = true; S.stats.splitters = (S.stats.splitters || 0) + 1; }
      if (tool.kind === 'gate') { ent.detector = true; S.stats.gates = (S.stats.gates || 0) + 1; }
      S.entities.push(ent);
      this.addEntity(ent);
      this.sound.place();
      if (['sorter', 'mech', 'gen', 'charger', 'fan'].includes(tool.kind)) this.rebuildTools();
      this.power.markDirty();
      if (!this.hasGen() && ['belt', 'sorter', 'mech'].includes(tool.kind) && !this._pwHint) { this._pwHint = true; this.ui.hint('Machines need power. Build a <b>Generator</b>, feed it commons, and link it with <b>Poles</b>.', 8); }
      S.stats.built = (S.stats.built || 0) + 1;
      this.rebuildTools();
      return;
    }
    if (tool.kind === 'frame') {
      ent = { id, type: 'frame', kind: e.kind, axis: e.axis, cx: e.cx, cz: e.cz, y0: e.y0, w: e.w, h: e.h, d: e.d, gm: e.gm, glo: e.glo, gj: e.gj, yaw: e.yaw }; if (e.turned) { ent.turned = true; S.stats.turnedFrames = (S.stats.turnedFrames || 0) + 1; } S.stats.props++;
      // a frame never digs: the 4x4x4 section was already dug out when the plan said ok
    }
    else if (tool.kind === 'mfan') {
      ent = { id, type: 'fan', mounted: true, frameId: e.frameId, px: e.px, py: e.py, pz: e.pz, fx: e.fx, fz: e.fz, fyaw: e.fyaw, dir: 0, i: e.i, j: e.j, k: e.k };
      S.entities.push(ent); this.addEntity(ent); this.power.markDirty(); this.sound.place(); this.rebuildTools(); S.stats.built = (S.stats.built || 0) + 1; S.stats.mfans = (S.stats.mfans || 0) + 1;
      this.ui.hint('Support fan hung. It blows the way you were facing and needs power: link it with a pole or generator.', 5);
      return;
    }
    else if (tool.kind === 'lantern') { ent = { id, type: 'lantern', x: e.x, y: e.y, z: e.z }; S.stats.lanterns++; }
    else if (tool.kind === 'marker') { ent = { id, type: 'marker', x: e.x, y: e.y, z: e.z }; }
    else if (tool.kind === 'rope') { ent = { id, type: 'rope', x: e.x, y: e.y, z: e.z }; S.stats.ropes = (S.stats.ropes || 0) + 1; }
    else if (tool.kind === 'glow') { ent = { id, type: 'flare', glow: true, x: e.x, y: e.y, z: e.z, born: S.stats.playSecs }; }
    else if (tool.kind === 'flare') { ent = { id, type: 'flare', x: e.x, y: e.y, z: e.z, born: S.stats.playSecs }; }
    else if (tool.kind === 'strut') { ent = { id, type: 'strut', x: e.x, y: e.y, z: e.z }; S.stats.props++; }
    else if (tool.kind === 'jack') { ent = { id, type: 'strut', jack: true, x: e.x, y: e.y, z: e.z }; S.stats.props++; }
    else if (tool.kind === 'charge') { ent = { id, type: 'charge', x: e.x, y: e.y, z: e.z, fuse: 6, tier: this.T.charges }; this.ui.hint('Fuse lit. <b>Run.</b>', 3); this.sound.tone('square', 900, 900, 0.05, 0.08); }
    else if (tool.kind === 'dynamite') { ent = { id, type: 'charge', dyn: true, x: e.x, y: e.y, z: e.z, fuse: 4, tier: 0 }; this.ui.hint('Fuse lit. <b>Run.</b>', 3); this.sound.tone('square', 1100, 1100, 0.05, 0.08); }
    else if (tool.kind === 'beacon') { ent = { id, type: 'beacon', x: e.x, y: e.y, z: e.z, i: e.i, j: e.j, k: e.k, num: BINS.nextNum(this) }; this.onBeaconPlaced(ent); }
    else if (tool.kind === 'claw') { ent = { id, type: 'claw', x: e.x, y: e.y, z: e.z, ry: Math.random() * 6.28 }; S.stats.rigs++; this.rebuildTools(); }
    else if (tool.kind === 'borer') { ent = { id, type: 'borer', i: e.i, j: e.j, k: e.k, dx: e.dx, dz: e.dz, w: e.w, h: e.h, x: e.x, y: e.y, z: e.z }; S.stats.borers++; this.rebuildTools(); }
    else if (isEarth(tool.kind)) { ent = newEarthEnt(tool.kind, e, id); S.stats.earthBuilt = (S.stats.earthBuilt || 0) + 1; const sk = { excavator: 'excavators', dozer: 'dozers', wheel: 'wheels', truck: 'trucks' }[tool.kind]; S.stats[sk] = (S.stats[sk] || 0) + 1; this.power.markDirty(); this.rebuildTools(); }
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
      if (this._strainNote) { this.ui.hint(this._strainNote, 5); this._strainNote = null; } else this.ui.hint(`${FRAME_TYPES[e.kind].name} set. It holds the roof within ${FRAME_TYPES[e.kind].radius} m of it, and the unsafe stretch starts again at the edge of that reach. Place the next one on any side, a whole cube further, to extend.`, 4);
    }
    this.trackDepth();
  }

  // what are we looking at that can be taken down?
  findDeconRef() {
    const eye = this.renderer.camera.position, dir = this.player.forward(_fwd);
    if (this.S.cart && this.cartDist() < 3.2) { _v2.set(this.S.cart.x - eye.x, this.S.cart.y + 0.5 - eye.y, this.S.cart.z - eye.z); if (_v2.length() < 3.2 && _v2.normalize().dot(dir) > 0.7) return { kind: 'cart' }; }
    const tile = this.logi.pick(eye, dir, 3.6);
    { const ch = this.cables.hit(eye, dir, 4.5, tile ? Math.hypot(cellX(tile.i) - eye.x, tile.j * C + 1 - eye.y, cellZ(tile.k) - eye.z) + 0.3 : Infinity); if (ch) return { kind: 'cable', id: ch.id }; }   // the wire of a power cable, not its ends
    if (tile) return { kind: 'tile', id: tile.id };
    let best = null, bd = 3.2;
    for (const it of this.machines.items.values()) {
      const e = it.ent;
      if ((e.type === 'borer' && !e.done) || (e.type === 'frame' && e.auto) || e.type === 'garch') continue;   // a giant arch is picked by its ribs below
      if (e.type === 'frame') { const fr = frameRay(e, eye, dir, 3.6); if (!fr) continue; const fd = fr.through ? fr.t + 2.5 : fr.t; if (fd < bd) { bd = fd; best = it; } continue; }   // a pillar or beam, or the hollow inside it
      const em = isEarth(e.type);
      const x = em ? it.obj.position.x : (e.cx ?? e.x), y = em ? it.obj.position.y + e.hy : (e.y0 ?? e.y) + (e.h ? e.h / 2 : 0.5), z = em ? it.obj.position.z : (e.cz ?? e.z);
      if (x === undefined || z === undefined) continue;   // floor pads, catwalks, walls, ramps and stairs have no centre point: BUILD.pickBuilt finds them by the cells and slopes under the crosshair
      const v = _v2.set(x - eye.x, y - eye.y, z - eye.z);
      const d = v.length();
      if (d > bd + (e.hr || 0)) continue;
      if (v.normalize().dot(dir) < 0.9) continue;
      bd = d; best = it;
    }
    { let pb = BUILD.pickBuilt(this, eye, dir, 3.6), pt = TRANSIT.pick(this, eye, dir, 3.6);   // pt: a door, the lift car, a call button, a jump pad or a cushion pad (transit.js)
      if (pb && pt) { if (pb.t <= pt.t) pt = null; else pb = null; }
      if (pb && (!best || pb.t < bd)) return { kind: 'mach', id: pb.ent.id };
      if (pt && (!best || pt.t < bd)) return { kind: 'mach', id: pt.ent.id }; }
    { const rp = RAIL.pickRail(this, eye, dir, 3.6); if (rp && (!best || rp.t < bd)) return { kind: 'mach', id: rp.ent.id }; }   // a piece of Mine Rail (no centre point, found by the cell under the crosshair)
    { const fp = HAUL.pickFlat(this, eye, dir, 3.6); if (fp && (!best || fp.t < bd)) return { kind: 'mach', id: fp.ent.id }; }   // a road plate or a dock: found by the ray reaching its slab
    { const ap = ARCH.pick(this, eye, dir, 3.6); if (ap && (!best || (ap.t < bd && !ARCH.holds(ap.ent, best)))) return { kind: 'mach', id: ap.ent.id }; }   // a giant arch: a rib, a pillar or the hollow inside it
    return best ? { kind: 'mach', id: best.ent.id } : null;
  }

  deconstruct(group) {
    const ref = this.findDeconRef();
    if (!ref) {
      { const bk = this.hammerTarget(); if (bk && bk.kind === 'bulk') { this.collect({ type: 'cell', i: bk.i, j: bk.j, k: bk.k, sp: BULK, vr: 0 }); this.sound.thump(0.25, 120); return; } }   // X takes a bulkhead down like the hammer does
      // X next to your cart stows it even when you are not looking right at it (the hint says so)
      if (this.S.cart && this.cartDist() < 4.5) { if (this.isGuest()) { this.cmd('decon', { kind: 'cart' }); return; } this.stowCart(); }
      return;
    }
    if (group && ref.kind === 'mach') ref.group = true;   // Shift+X: the whole zoop group of the piece you aim at
    if (this.isGuest()) { this.cmd('decon', ref); this.sound.thump(0.12, 140); return; }
    this.doDecon(ref);
  }

  doDecon(ref) {
    if (ref.group && ref.kind === 'mach' && BUILD.removeGroup(this, ref)) return;   // the build shell's zoop undo: every piece with the same group id
    if (ref.kind === 'cart') { this.stowCart(); return; }
    if (ref.kind === 'cable') { if (this.cables.remove(ref.id, true)) this.sound.thump(0.12, 160); return; }
    if (ref.kind === 'tile') {
      const tile = this.logi.byId.get(ref.id);
      if (!tile) return;
      if (tile.intakeFor) { this.doDecon({ kind: 'mach', id: tile.intakeFor }); return; }   // a silo's hidden intake crate: the hammer takes the silo down
      if (tile.fixed) { this.ui.hint('The Welcome Gate is bolted to the floor. It is yours for free, and it stays.', 3); return; }
      this.logi.remove(tile);
      this.S.entities = this.S.entities.filter((x) => x.id !== tile.id);
      this.netSend({ t: 'ent-', id: tile.id });
      this.cables.detach(tile.id, true);
      const give = [...(tile.items || []), ...(tile.q || []), ...(tile.kept || []), ...(tile.stored || []), ...(tile.buf || [])];
      for (const it of give) if (this.S.carry.length < this.T.carry) this.S.carry.push({ sp: it.sp, vr: it.vr }); else this.sim.spawn(it.sp, it.vr, cellX(tile.i), tile.j * C + 0.5, cellZ(tile.k), 0, 1, 0, 0);
      EXT.removed(this, tile);
      this.giveItem(EXT.itemOf(tile) || (tile.type === 'belt' ? (tile.detector ? 'gate' : tile.splitter ? 'splitter' : tile.rise ? 'ramp' : tile.hose ? 'hose' : 'belt') : tile.mounted ? 'mfan' : tile.type));
      this.ui.setCarry(this.S.carry, this.T.carry);
      this.sound.thump(0.15, 140);
      if (['sorter', 'mech', 'gen', 'charger', 'fan'].includes(tile.type)) this.rebuildTools();
      this.power.markDirty();
      return;
    }
    const best = this.machines.items.get(ref.id);
    if (!best) return;
    const e = best.ent;
    { const why = STACK.deconBlock(this, e); if (why) { if (this._actor === 'g') this.netSend({ t: 'toast', icon: '⚠️', title: 'Cannot take it down', text: why }); else { this.ui.hint(why, 3.5); this.sound.error(); } return; } }   // a cube with a cube on it, or with plates, stairs or ladders built into it, stays up (stack.js)
    this.giveItem(EXT.itemOf(e) || (e.type === 'frame' ? 'frame:' + e.kind : e.type === 'lantern' ? 'lantern' : e.jack ? 'jack' : e.glow ? 'glow' : e.dyn ? 'dynamite' : e.type));
    if (e.type === 'beacon') this.world.reserved.delete((e.j * NZ + e.k) * NX + e.i);
    this.machines.disposeObj(best.obj);
    this.machines.root.remove(best.obj);
    this.machines.items.delete(e.id);
    this.netSend({ t: 'ent-', id: e.id });
    this.cables.detach(e.id, true);
    EXT.removed(this, e);
    this.S.entities = this.S.entities.filter((x) => x.id !== e.id);
    if (e.type === 'beacon') BINS.onBeaconGone(this, e.id);   // everything assigned to it goes back to Auto, and says so
    this.world.supports = this.world.supports.filter((s) => s.id !== e.id && s.id !== 'shield' + e.id);
    if (e.type === 'frame') this.dropMountedFans(e.id, true);
    this.sound.thump(0.15, 120);
    if (e.type === 'claw' || e.type === 'borer' || isEarth(e.type)) this.rebuildTools();
    if (isEarth(e.type)) { spillEarth(this, e, e.px ?? e.x, e.y ?? 0, e.pz ?? e.z); this.ui.setCarry(this.S.carry, this.T.carry); this.power.markDirty(); }
    // taking a support away puts the roof it was holding back under the tunnel rule
    if (e.type === 'frame' || e.type === 'strut' || e.jack) {
      const w = this.world, ci = toI(e.cx ?? e.x), ck = toK(e.cz ?? e.z), cj = toJ(e.y0 ?? e.y ?? 0), R = e.type === 'frame' ? 8 : 4;
      for (let a = -R; a <= R; a += 4) for (let b = -R; b <= R; b += 4) for (const dj of [2, 5, 8]) w.stabQueue.push({ i: ci + a, j: cj + dj, k: ck + b });
      this.queueLoad(e.cx ?? e.x, (e.y0 ?? e.y ?? 0) + 1, e.cz ?? e.z);
    }
  }

  // ======================= depth ratings =======================
  // The mountain presses harder the deeper you dig. Every support has a depth it can stand at; near it the support creaks,
  // past it the support breaks when you set it.
  strainOf(tool, plan) {
    if (tool.kind !== 'frame' && tool.kind !== 'strut' && tool.kind !== 'jack') return { state: 'ok' };
    const e = plan.ent, kind = tool.kind === 'frame' ? tool.fk : tool.kind;
    const x = e.cx ?? e.x, z = e.cz ?? e.z, d = supportDepth(x, z);
    const max = tool.kind === 'frame' ? FRAME_TYPES[kind].maxDepth : STRUT_DEPTH[kind];
    const name = tool.kind === 'frame' ? FRAME_TYPES[kind].name : kind === 'jack' ? 'Hydraulic Jack' : 'Strut';
    const key = `${kind}|${x.toFixed(2)}|${z.toFixed(2)}|${(e.y0 ?? e.y ?? 0).toFixed(2)}|${this.world.diffCount}|${this.world.supports.length}`;
    if (!this._strainC || this._strainC.key !== key) {
      const sup = tool.kind === 'frame' ? { x, y: e.y0 + e.h / 2, z, r: FRAME_TYPES[kind].radius, kind, blk: this.machines.cubeBlk(e) } : { x, y: e.y + 0.6, z, r: kind === 'jack' ? 2.7 : 1.9, kind };
      sup.cap = capacityOf(kind);
      this._strainC = { key, ratio: isFinite(sup.cap) ? totalLoad(this.world, sup) / sup.cap : 0, hyp: sup };   // a cube set on a stack carries what stands on it (loadtrace.js totalLoad)
    }
    const ratio = this._strainC.ratio;
    return { d, max, name, kind, ratio, pct: Math.round(ratio * 100), next: tool.kind === 'frame' ? betterThan(kind) : (kind === 'strut' ? 'steel' : 'concrete'), state: ratio > 1 ? 'break' : ratio > WARN_AT ? 'creak' : 'ok' };
  }

  breakSupport(st, e) {
    const x = e.cx ?? e.x, z = e.cz ?? e.z, y = (e.y0 ?? e.y ?? 0) + 1.0;
    this.fx.dust(x, y, z, 26, 1.6, 1.6); this.sound.thump(0.4, 90); this.sound.creak(0.35); this.shake = Math.max(this.shake, 0.3);
    this.S.stats.brokenSupports = (this.S.stats.brokenSupports || 0) + 1;
    this.ui.hint(`<b>The ${st.name} cracks and gives way.</b> It would have carried ${st.pct}% of what it can bear, at ${Math.round(st.d)} m deep. It is gone. ${st.next ? 'You need ' + (FRAME_TYPES[st.next] ? FRAME_TYPES[st.next].name : st.next) + ' or better down here, or more supports to share the weight.' : ''}`, 6);
    // a support the guest tried to set breaks on the guest's screen too, with the same numbers
    if (this._forGuest) this.netSend({ t: 'sbreak', st: { name: st.name, pct: st.pct, d: st.d, next: st.next }, e: { cx: e.cx, cz: e.cz, x: e.x, z: e.z, y0: e.y0, y: e.y } });
  }

  // a fan hangs from its frame: when the frame goes, the fan goes with it (you get it back when you took the frame down yourself)
  dropMountedFans(frameId, give) {
    for (const t of [...this.logi.tiles.values()]) if (t.type === 'fan' && t.mounted && t.frameId === frameId) {
      this.logi.remove(t); this.S.entities = this.S.entities.filter((x) => x.id !== t.id); this.netSend({ t: 'ent-', id: t.id }); if (give) this.giveItem('mfan'); this.power.markDirty();
    }
  }

  // ---- live load tracing: every support keeps track of what the roof under its reach weighs and buckles when it is too much ----
  queueLoad(x, y, z) {
    const q = this.loadQ || (this.loadQ = new Set());
    for (const s of this.world.supports) if (s.cap !== undefined && Math.hypot(s.x - x, s.z - z) < 12) q.add(s.id);
  }

  // an overloaded support does not drop at once: it creaks, sheds dust and groans for 3 to 5 seconds so there is time to run or prop it up
  supName(s) { const a = parseArch(s.kind); if (a) return ARCH.nameOf(a.span, a.mat).toLowerCase(); return s.kind === 'jack' ? 'jack' : s.kind === 'strut' ? 'strut' : (FRAME_TYPES[s.kind] || { name: 'frame' }).name.toLowerCase(); }

  tickPending(dt) {
    const w = this.world;
    for (const [id, p] of [...this.pendFail]) {
      const s = w.supports.find((q) => q.id === id);
      if (!s) { this.pendFail.delete(id); continue; }
      p.t -= dt; p.tick -= dt;
      if (p.tick <= 0 && !p.force) {   // p.force: a cube that lost what it stood on falls whatever its load is (stack.js)
        p.tick = 0.7; const ratio = isFinite(s.cap) ? totalLoad(w, s) / s.cap : 0; s.load = ratio;
        if (ratio <= 1) { this.pendFail.delete(id); s.warned = true; continue; }
        p.ratio = ratio;
        if (p.t > 0) { this.supportWarnFx(s.x, s.z, this.supName(s), ratio, p.t, s.y); this.netSend({ t: 'swarn', x: s.x, y: s.y, z: s.z, name: this.supName(s), ratio, sec: p.t }); if (p.t < 2) this.shedOffSlope(s.x, s.z, 2); }
      }
      if (p.t <= 0) { this.pendFail.delete(id); this.failSupport(s, p.ratio || 1.01); }
    }
  }

  updateLoads(dt) {
    if (this.pendFail && this.pendFail.size && !this.isGuest()) this.tickPending(dt);
    this._loadT = (this._loadT || 0) - dt; if (this._loadT > 0 || !this.loadQ || !this.loadQ.size || this.isGuest()) return; this._loadT = 0.35;
    const w = this.world; let n = 0;
    for (const id of [...this.loadQ]) {
      if (++n > 2) break;   // two per tick; the rest stay queued (they used to be dropped, so some supports were never weighed)
      this.loadQ.delete(id);
      const s = w.supports.find((q) => q.id === id); if (!s || s.cap === undefined) continue;
      const parts = {}; const ratio = isFinite(s.cap) ? totalLoad(w, s, [], parts) / s.cap : 0; s.load = ratio; s.loadAbove = isFinite(s.cap) ? parts.above / s.cap : 0;   // a cube in a stack carries what stands on it (loadtrace.js totalLoad)
      if (ratio > 1 && this.time - (s.born || 0) > 1.5) {
        if (!this.pendFail) this.pendFail = new Map();
        if (!this.pendFail.has(id)) { const p = { t: 3 + Math.random() * 2, tick: 0.7, ratio }; this.pendFail.set(id, p); this.supportWarnFx(s.x, s.z, this.supName(s), ratio, p.t, s.y); this.netSend({ t: 'swarn', x: s.x, y: s.y, z: s.z, name: this.supName(s), ratio, sec: p.t }); this.shedOffSlope(s.x, s.z, 2); }
        else this.pendFail.get(id).ratio = ratio;
        continue;
      }
      if (this.pendFail && this.pendFail.has(id) && ratio <= 1 && !this.pendFail.get(id).force) this.pendFail.delete(id);
      if (ratio > WARN_AT) { if (!s.warned) { s.warned = true; const nm = this.supName(s); this.supportWarnFx(s.x, s.z, nm, ratio); this.netSend({ t: 'swarn', x: s.x, z: s.z, name: nm, ratio }); } }
      else if (ratio < 0.7) s.warned = false;
    }
  }

  supportWarnFx(x, z, name, ratio, sec, y) {
    const pd = Math.hypot(x - this.player.pos.x, z - this.player.pos.z);
    if (sec !== undefined) {
      if (pd < 40) {
        this.sound.creak(Math.min(0.5, 0.25 + (5 - sec) * 0.05)); this.fx.dust(x, y ?? this.player.pos.y + 2, z, 5, 0.7, 0.7); this.dust.add(x, y ?? this.player.pos.y + 1.5, z, 0.09); this.shake = Math.max(this.shake, 0.03);
        if (pd < 30) this.ui.hint(`<b>ROOF FAILING: the ${name} is at ${Math.round(ratio * 100)}% and about to give way (${Math.max(1, Math.ceil(sec))} s).</b> Get clear, or prop it up with another support now.`, 1.2);
      }
      return;
    }
    if (pd < 30) { this.sound.creak(0.3); this.ui.hint(`<b>A ${name} is carrying ${Math.round(ratio * 100)}% of its limit and creaking.</b> Put another support next to it to share the weight.`, 6); }
  }

  // what the buckling of a support looks and sounds like, for whoever is near it (the host runs it and tells the guest)
  supportFailFx(x, y, z, name, ratio) {
    const pd = Math.hypot(x - this.player.pos.x, z - this.player.pos.z);
    this.fx.dust(x, y, z, 22, 1.4, 1.4); this.dust.add(x, y + 0.6, z, 0.9);   // a buckling support throws a cloud: it hangs in the tunnel and goes into your lungs unless a fan clears it
    if (pd < 40) { this.sound.thump(0.35, 85); this.sound.creak(0.35); this.shake = Math.max(this.shake, Math.max(0.05, 0.4 - pd * 0.01)); }
    if (pd < 25) this.ui.hint(`<b>${name} buckles under the weight of the mountain!</b> (${Math.round(ratio * 100)}% load). Its share lands on the supports around it.`, 6);
  }

  failSupport(s, ratio) {
    const w = this.world, S = this.S;
    const uppers = STACK.beforeGone(this, s);   // the cubes that stand on it (stack.js)
    const ent = S.entities.find((e) => e.id === s.id); const it = this.machines.items.get(s.id);
    w.supports = w.supports.filter((q) => q.id !== s.id && q.id !== 'shield' + s.id);   // (a Portal's arch takes the shield that follows its cutter with it)
    this.dropMountedFans(s.id, false);
    if (it) { this.machines.disposeObj(it.obj); this.machines.root.remove(it.obj); this.machines.items.delete(s.id); }
    S.entities = S.entities.filter((e) => e.id !== s.id); this.netSend({ t: 'ent-', id: s.id });
    S.stats.brokenSupports = (S.stats.brokenSupports || 0) + 1;
    const fname = ent && ent.type === 'garch' ? ARCH.nameOf(ent.span, ent.mat) : ent && ent.type === 'frame' ? (FRAME_TYPES[ent.kind] || { name: 'A frame' }).name : s.kind === 'jack' ? 'A jack' : 'A strut';
    this.supportFailFx(s.x, s.y, s.z, fname, ratio);
    this.netSend({ t: 'sfail', x: s.x, y: s.y, z: s.z, name: fname, ratio });
    // the roof it was holding comes back under the tunnel rule, and the supports that shared its load are re-weighed
    for (let a = -6; a <= 6; a += 4) for (let b = -6; b <= 6; b += 4) for (const dj of [2, 5]) w.stabQueue.push({ i: toI(s.x) + a, j: toJ(s.y) + dj - 2, k: toK(s.z) + b });
    this.queueLoad(s.x, s.y, s.z);
    this.stackFell(s, uppers);
  }

  // wave 10: is this cell inside a frame cube? A belt tile there needs no floor under it: it hangs from the cube (belt ramps climb a level through the opening of a landing)
  stackHolds(i, j, k) { return !!STACK.cubeAt(this, i, j, k); }

  // wave 10: what was built into a cube that fell goes with it (lost, like the frame), and a cube that stood on it falls too when it no longer holds half its footprint
  stackFell(s, uppers) {
    for (const e of STACK.partsOf(this, s.id)) this.destroyEnt(e);
    for (const u of STACK.afterGone(this, uppers)) this.forceFall(u);
  }
  // a cube that lost what it stood on falls after a warning whatever its load is. The entity is marked (`fell`), so a save and a load in the middle of the warning bring the fall back (stack.js resumeFalls)
  forceFall(u, resumed = false) {
    if (!this.pendFail) this.pendFail = new Map();
    if (this.pendFail.has(u.id)) return false;
    const p = { t: 1.3 + Math.random() * 0.8, tick: 1e9, ratio: 1.5, force: true }; this.pendFail.set(u.id, p);
    const ent = STACK.cubeEnt(this, u); if (ent) ent.fell = 1;
    this.supportWarnFx(u.x, u.z, this.supName(u), 1.5, p.t, u.y); this.netSend({ t: 'swarn', x: u.x, y: u.y, z: u.z, name: this.supName(u), ratio: 1.5, sec: p.t });
    this.ui.hint('<b>The cube above has lost what it stood on.</b> Get clear.', 3);
    if (!resumed) this.S.stats.stackCascades = (this.S.stats.stackCascades || 0) + 1;
    return true;
  }
  // an entity that is lost (no refund): the plates, stairs and ladders of a cube that fell
  destroyEnt(e) {
    const it = this.machines.items.get(e.id);
    if (it) { this.machines.disposeObj(it.obj); this.machines.root.remove(it.obj); this.machines.items.delete(e.id); }
    this.netSend({ t: 'ent-', id: e.id });
    this.cables.detach(e.id, true);
    EXT.removed(this, e);
    this.S.entities = this.S.entities.filter((x) => x.id !== e.id);
  }

  // "depth" only exists inside a tunnel: out in the open (a cleared pit, a slope, the bay) nothing is pressing on you, so there is no depth, no rating
  // warning and no stale air, however far from the bay you are. Under a roof it is the distance from the bay, as the load rules measure it.
  coverDepth(pos) {
    const w = this.world, p = pos || this.player.pos; if (!w) return 0;
    const j = toJ(p.y + 1.6), top = w.topAt(clamp(toI(p.x), 0, NX - 1), clamp(toK(p.z), 0, NZ - 1));
    return j >= top ? 0 : supportDepth(p.x, p.z);
  }

  // how many neighbours each grab scoops: the most Scoop Hands allow, turned down (or up) in steps of 3 with - and = so a tunnel does not come down on you
  scoopNow() {
    const max = (this.T && this.T.scoop) || 0; if (!max) return 0;
    const s = this.S.scoopSet; return s === undefined ? Math.min(max, 3) : Math.max(0, Math.min(max, s));
  }
  adjustScoop(dir) {
    const max = (this.T && this.T.scoop) || 0;
    if (!max) { this.ui.hint('Scoop Hands are not unlocked yet. - and = set how many plush a grab scoops, 3 at a time.', 2.5); return false; }
    const cur = this.scoopNow(), next = Math.max(0, Math.min(max, dir > 0 ? cur + 3 : cur - 3 < 0 ? 0 : cur - 3));
    this.S.scoopSet = next; this.ui.setScoop(next, max); this.sound.tone('triangle', 500 + next * 4, 520 + next * 4, 0.05, 0.05);
    this.ui.hint(`Scoop ${next} of ${max}. <kbd>=</kbd> scoops 3 more, <kbd>-</kbd> 3 fewer (fewer when you dig a tunnel).`, 2.2);
    return true;
  }

  // warns as you go deeper than a support you own can take: once when it starts to creak, once when it can no longer hold
  depthCheck(dt) {
    this._depthT = (this._depthT || 0) - dt; if (this._depthT > 0) return; this._depthT = 1;
    const S = this.S, T = this.T; const d = this.coverDepth();
    const fl = S.depthWarn || (S.depthWarn = {});
    const noun = { timber: 'wood', steel: 'steel', concrete: 'concrete', rebar: 'rebar', titan: 'titanium', carbon: 'carbon weave', plasma: 'plasma', voidl: 'void lattice', neutron: 'neutron shell', horizon: 'horizon' };
    for (const k of T.frames) {
      const max = FRAME_TYPES[k].maxDepth; if (!isFinite(max)) continue;
      const nx = betterThan(k), nn = nx ? FRAME_TYPES[nx].name : null;
      if (d > max && !fl[k + 'b']) { fl[k + 'b'] = 1; fl[k + 'c'] = 1; this.sound.creak(0.3); this.ui.hint(`<b>The ${noun[k]} can't take it down here.</b> ${FRAME_TYPES[k].name}s are rated to ${max} m and break the moment you set them. ${nn ? 'You need ' + nn + 's (rated to ' + (isFinite(FRAME_TYPES[nx].maxDepth) ? FRAME_TYPES[nx].maxDepth + ' m' : 'any depth') + ') or better.' : ''}`, 8); break; }
      if (d > max * 0.85 && !fl[k + 'c']) { fl[k + 'c'] = 1; this.sound.creak(0.3); this.ui.hint(`<b>The ${noun[k]} is starting to creak under the pressure of the mountain.</b> ${FRAME_TYPES[k].name}s are rated to ${max} m and you are ${Math.round(d)} m in. ${nn ? 'Get ' + nn + 's ready.' : ''}`, 8); break; }
    }
  }

  // the Structural Survey readout: depth, best frame and its rating, the weight above you, and the load on the support next to you
  updateSurvey() {
    const T = this.T; if (!T.survey) { this.ui.setSurvey(false); return; }
    if (this._svNext > this.time) return; this._svNext = this.time + 0.5;
    const p = this.player, w = this.world, d = this.coverDepth();
    if (d <= 0) { this.ui.setSurvey(false); return; }   // open ground has no depth
    let best = null; for (const k of T.frames) if (!best || FRAME_TYPES[k].maxDepth > FRAME_TYPES[best].maxDepth) best = k;
    let bestTxt = 'no frames yet: buy Timber Frames';
    if (best) { const f = FRAME_TYPES[best]; bestTxt = `${f.name} (${isFinite(f.maxDepth) ? 'rated ' + f.maxDepth + ' m' : 'any depth'})` + (d > f.maxDepth ? ': too weak here' : d > f.maxDepth * 0.85 ? ': near its limit' : ''); }
    const i = toI(p.pos.x), k = toK(p.pos.z), j = toJ(p.pos.y + 1), over = Math.max(0, w.topAt(i, k) - j - 1);
    let near = null, nd = 8; for (const s of w.supports) if (s.cap !== undefined) { const dd = Math.hypot(s.x - p.pos.x, s.y - (p.pos.y + 1), s.z - p.pos.z); if (dd < nd) { nd = dd; near = s; } }
    let load = 'no support within 8 m', cls = '';
    if (near) { const r = isFinite(near.cap) ? totalLoad(w, near) / near.cap : 0; near.load = r; load = `nearest support: ${Math.round(r * 100)}% load`; cls = r > 0.97 ? 'red' : r > WARN_AT ? 'amber' : ''; }
    const fs = fanSpacing(d); this.ui.setSurvey(true, { depth: `${Math.round(d)} m DEEP`, best: bestTxt, press: `${(over * 0.6).toFixed(0)} m of pile above · weight x${(1 + d / 150).toFixed(1)}`, air: isFinite(fs) ? `stale air ${Math.round(staleAt(d) * 100)}%: a Support Fan every ${Math.floor(fs)} m` : 'air still fresh at this depth', load, cls, n: { depth: d, best: best ? { name: FRAME_TYPES[best].name, max: FRAME_TYPES[best].maxDepth, flag: d > FRAME_TYPES[best].maxDepth ? 'weak' : d > FRAME_TYPES[best].maxDepth * 0.85 ? 'near' : '' } : null, pile: `pile ${(over * 0.6).toFixed(0)} m, x${(1 + d / 150).toFixed(1)}`, loadR: near ? (isFinite(near.cap) ? near.load : 0) : null, stale: staleAt(d), fan: isFinite(fs) ? Math.floor(fs) : null } });
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
    BINS.ensureNums(this);
    const bs = this.S.entities.filter((e) => e.type === 'beacon');
    bs.forEach((e) => list.push({ name: BINS.nameOf(this, e), x: e.x, y: e.y + 0.05, z: e.z, id: e.id }));   // (its number, or the name you gave it in the bins panel)
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
    const mk = (title, sub, label, fn, dis, cost) => {
      const row = document.createElement('div'); row.className = 'trow';
      row.innerHTML = `<b>${escHtml(title)}</b><span>${sub}</span><button ${cost === undefined ? '' : `data-cost="${cost}"`} ${dis ? 'disabled' : ''}>${label}</button>`;
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
        if (this.isGuest()) this.cmd('pay', { n: cost });   // the wallet is the host's: a guest's fare comes out of it too
        this.teleport(b);
        this.ui.closeModals();
      }, dist < 6 || this.S.money < cost, dist < 6 ? undefined : cost);
      if (b.id && this.machines.items.get(b.id)) { const rb = document.createElement('button'); rb.textContent = 'Name'; rb.title = 'Rename this depot, or see what is assigned to it (the bins panel)'; rb.onclick = () => { this.ui.closeModalsSilently(); BINPANEL.openOverview(this, b.id); }; box.lastChild.appendChild(rb); }
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
    { const R0 = ent.R ?? (ent.dyn ? 2.2 : [0, 3, 4, 5][ent.tier || 1]); this.netSend({ t: 'boom', x: ent.x, y: ent.y, z: ent.z, R: R0 }); }
    if (this.isGuest()) { this.fx.burst(ent.x, ent.y + 0.6, ent.z, 50, 1, 0.6, 0.2, 6, 0.14, 1.2); this.fx.dust(ent.x, ent.y + 0.6, ent.z, 24, 2.0, 2.5); this.sound.rumble(1.2); const pd = Math.hypot(ent.x - this.player.pos.x, ent.z - this.player.pos.z); if (pd < 40) this.shake = Math.max(this.shake, Math.min(1.4, 22 / (pd + 4)) * this.T.shakeMul); return; }
    const w = this.world, S = this.S;
    const tier = ent.tier || 1;
    const R = ent.R ?? (ent.dyn ? 2.2 : [0, 3, 4, 5][tier]);
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
        this.registerDex(it.sp, true); this.sellAuto(it.sp, it.vr, 0.5);
      }
    }
    this.fx.burst(ent.x, ent.y + 0.6, ent.z, 70, 1, 0.6, 0.2, 6, 0.14, 1.4);
    this.fx.dust(ent.x, ent.y + 0.6, ent.z, 40, 2.2, 3);
    this.dust.add(ent.x, ent.y + 0.8, ent.z, 1.2);
    this.blastOnPlayer(ent.x, ent.y, ent.z, R, false);
    S.stats.blasts = (S.stats.blasts || 0) + 1;
    // a blast shakes the whole slope around the hole
    for (let q = 0; q < 30; q++) this.slide.trigger(ci + ((Math.random() * 2 - 1) * (RI + 3)) | 0, cj + ((Math.random() * 2 - 1) * (RI + 2)) | 0, ck + ((Math.random() * 2 - 1) * (RI + 3)) | 0, 2.2);
    // loosen everything around the hole
    for (let q = 0; q < 12; q++) w.stabQueue.push({ i: ci + ((Math.random() * 2 - 1) * (R + 2)) | 0, j: cj + ((Math.random() * 2 - 1) * (R + 1)) | 0, k: ck + ((Math.random() * 2 - 1) * (R + 2)) | 0 });
  }

  // what a blast does to the person standing near it: sound, shake, and if they are too close a shove, damage and a lungful of dust.
  // The host runs it for itself; a guest runs it from the 'boom' message, so both players suffer the same blast.
  blastOnPlayer(x, y, z, R, fromNet) {
    const pd = Math.hypot(x - this.player.pos.x, y - this.player.pos.y, z - this.player.pos.z);
    if (!fromNet) this.sound.rumble(1.6);
    if (pd < 40) this.shake = Math.max(this.shake, Math.min(1.6, 24 / (pd + 4)) * this.T.shakeMul);
    if (pd < R * 0.6 + 2.2) {
      const dx = this.player.pos.x - x, dz = this.player.pos.z - z, l = Math.hypot(dx, dz) || 1;
      this.player.vel.x += dx / l * 7; this.player.vel.z += dz / l * 7; this.player.vel.y += 4;
      this.ui.hurt(0.55); this.dust.lung = Math.min(1.05, this.dust.lung + 0.25);
      this.hurtPlayer(Math.max(15, 55 - pd * 12), 'got too close to the blast');
      this.ui.hint('That was too close.', 3);
    }
    return pd;
  }

  // the Razzo's extra: a hurt scaled by how close you are, a lungful of dust, and a warning about the roof
  razzoOnPlayer(x, y, z, marked) {
    const pd = Math.hypot(x - this.player.pos.x, y - this.player.pos.y, z - this.player.pos.z);
    if (pd < 14) { this.hurtPlayer(70 * (1 - pd / 14), 'a Razzo went off'); this.dust.lung = Math.min(1.1, this.dust.lung + 0.5); }
    this.shake = Math.max(this.shake, 1.4);
    if (pd < 60) this.ui.hint(marked > 20 ? '<b>The roof is coming down!</b> Get clear.' : '<b>BOOM.</b>', 4);
    this.sound.rumble(2.2);
  }

  // ======================= volatile plush =======================
  // A Razzo is rare, and when its fuse runs out it brings the place down: a big blast, the roof around it released, supports in reach destroyed.
  // The fuse keeps burning after you throw or drop it, and it goes off wherever it ended up.
  lightFuse(item) {
    this.fuses = this.fuses || [];
    this.fuses.push({ item, t: 3.2, bid: undefined, lost: 0 });
    this.ui.toast({ icon: '🧨', title: 'RAZZO! Fuse lit', text: 'It will bring the roof down. Throw it as far away as you can (click), and run from your tunnel.', ms: 4200 });
    this.sound.tone('square', 900, 900, 0.05, 0.08); this.shake = Math.max(this.shake, 0.25);
  }

  updateFuses(dt) {
    this._fuseTxt = '';
    // a guest's thrown Razzo burns on the host, but the guest still sees the countdown
    if (this.guestFuses && this.guestFuses.length) { this.guestFuses = this.guestFuses.filter((u) => u > this.time); if (this.guestFuses.length) this._fuseTxt = `FUSE ${Math.max(0, Math.min(...this.guestFuses) - this.time).toFixed(1)}`; }
    if (!this.fuses || !this.fuses.length) return;
    const S = this.S, sim = this.sim; let minT = 1e9;
    for (let n = this.fuses.length - 1; n >= 0; n--) {
      const f = this.fuses[n];
      let pos = null;
      if (f.bid === undefined) {
        if (S.carry.indexOf(f.item) >= 0) pos = this.player.pos;
        else if (this.isGuest()) { this.cmd('fuse', { sp: f.item.sp, vr: f.item.vr, t: f.t }); (this.guestFuses = this.guestFuses || []).push(this.time + f.t); this.fuses.splice(n, 1); continue; }   // thrown: the bodies live on the host, which keeps the fuse from here
        else {
          // it left your hands: find the body it became (a guest's Razzo is looked for around the guest)
          const ref = f.remote && this.remote ? this.remote.pos : this.player.pos;
          let best = -1, bd = 1e9; for (let q = 0; q < sim.n; q++) { if (sim.sp[q] !== f.item.sp || sim.age[q] > 1.5 || this.fuses.some((o) => o !== f && o.bid === sim.bid[q])) continue; const d = Math.hypot(sim.x[q] - ref.x, sim.z[q] - ref.z); if (d < bd) { bd = d; best = q; } }
          if (best >= 0) f.bid = sim.bid[best]; else if ((f.lost += dt) > 0.5) { this.fuses.splice(n, 1); continue; } // sold into the bin or put away: the fuse goes out
        }
      }
      let idx = -1, px = 0, py = 0, pz = 0;
      if (!f.rest && f.bid !== undefined) {
        idx = sim.indexOfId(f.bid);
        if (idx < 0) {
          // the body is gone: sold into the bin (the fuse goes out), or it stopped on the pile and became a cell (the fuse keeps burning there)
          const b = this.hall.binPos;
          if (f.lx !== undefined && Math.hypot(f.lx - b.x, f.lz - b.z) > 4) f.rest = { i: toI(f.lx), j: toJ(f.ly), k: toK(f.lz) };
          else { this.fuses.splice(n, 1); continue; }
        }
      }
      if (f.rest) {
        // settled into the pile: still ticking. If the cell is not there any more it was dug out and picked up (that one has its own fuse now)
        const c = f.rest, w = this.world; let hit = null;
        for (let dj = -1; dj <= 1 && !hit; dj++) for (let dk = -1; dk <= 1 && !hit; dk++) for (let di = -1; di <= 1; di++) if (w.get(c.i + di, c.j + dj, c.k + dk) === f.item.sp) { hit = { i: c.i + di, j: c.j + dj, k: c.k + dk }; break; }
        if (!hit) { this.fuses.splice(n, 1); continue; }
        f.rest = hit; px = cellX(hit.i); py = cellY(hit.j); pz = cellZ(hit.k);
      } else if (idx >= 0) { px = sim.x[idx]; py = sim.y[idx]; pz = sim.z[idx]; f.lx = px; f.ly = py; f.lz = pz; }
      f.t -= dt; f.tick = (f.tick || 0) - dt;
      const held = f.bid === undefined && !f.rest;
      if (f.tick <= 0) { f.tick = Math.max(0.08, f.t * 0.18); this.sound.tone('square', 1100, 1100, 0.025, 0.06); if (held) this.heldPop = 0.4; }
      if (!held && Math.random() < dt * 14) this.fx.dust(px, py + 0.2, pz, 1, 0.15, 0.2);
      if (held || Math.hypot(px - this.player.pos.x, pz - this.player.pos.z) < 40) { if (f.t < minT) { minT = f.t; this._fuseTxt = `FUSE ${Math.max(0, f.t).toFixed(1)}`; } }   // updateHud shows it (it used to be cleared again every frame)
      if (f.t <= 0) {
        this.fuses.splice(n, 1);
        let x, y, z;
        if (held) { const i2 = S.carry.indexOf(f.item); if (i2 >= 0) S.carry.splice(i2, 1); this.ui.setCarry(S.carry, this.T.carry); x = this.player.pos.x; y = this.player.pos.y + 1; z = this.player.pos.z; }
        else { x = px; y = py; z = pz; if (idx >= 0) sim.remove(idx); }
        if (this.isGuest()) this.cmd('razzo', { x, y, z }); else this.razzoBlast(x, y, z);
      }
    }
  }

  razzoBlast(x, y, z) {
    const w = this.world, S = this.S, R = 7;
    this.detonate({ x, y, z, tier: 3, R });
    S.stats.razzos = (S.stats.razzos || 0) + 1;
    // everything that was holding the roof up nearby is gone
    for (const s of [...w.supports]) if (s.cap !== undefined && Math.hypot(s.x - x, s.y - y, s.z - z) < R * 0.6 + 4) this.failSupport(s, 9);
    // and the roof around the blast is released, regardless of the tunnel rule: a tunnel or two comes down
    const ci = toI(x), cj = toJ(y), ck = toK(z), RC = 22; let marked = 0;
    for (let dk = -RC; dk <= RC; dk++) for (let di = -RC; di <= RC; di++) {
      if (di * di + dk * dk > RC * RC) continue;
      const i = ci + di, k = ck + dk, top = w.topAt(i, k);
      for (let j = Math.max(1, cj - 3); j <= Math.min(top - 1, cj + 9); j++) {
        if (!w.solid(i, j, k) || w.solid(i, j - 1, k)) continue;
        const id = (j * NZ + k) * NX + i; if (w.creaking.has(id)) continue;
        const d = Math.hypot(di, dk); w.creaking.set(id, { i, j, k, t: 0.4 + d * 0.09 + Math.random() * 0.8, force: true }); marked++; if (w.onCreakCell && marked <= 160) w.onCreakCell(i, j, k); /* the guest sees the roof groan too */ if (this.net.open && this.creakOut && this.creakOut.length < 180 && marked % 6 === 0) this.creakOut.push(i, j, k);
      }
    }
    this.razzoOnPlayer(x, y, z, marked);
    this.netSend({ t: 'razzo', x, y, z, mk: marked });
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
    if (lung > 0.32 && !this.dead && !this.blacking) {
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
    this.lungWarning(dt, lung);
    if (lung >= 1 && this.mode === 'play' && !this.blacking) this.blackout();
  }

  // you always get told before you pass out: a dusty edge to the screen, the cough, a wheeze and a countdown
  lungWarning(dt, lung) {
    const d = this.dust; const prev = this._lungPrev ?? lung; this._lungPrev = lung;
    // nothing to warn about when you are out cold, dead, on the title or looking at a menu: no dusty edge, no wheeze, no hint
    if (this.dead || this.blacking || this.mode !== 'play' || this.ui.isModalOpen()) { this.ui.setLungWarn(0, '', '', 0, false); this._lungRate = 0; return; }
    this._lungRate = (this._lungRate || 0) * 0.92 + ((lung - prev) / Math.max(dt, 1e-3)) * 0.08;
    const stage = lung > 0.82 ? 3 : lung > 0.55 ? 2 : lung > 0.15 ? 1 : 0;
    const eta = this._lungRate > 0.004 ? Math.max(1, Math.round((1 - lung) / this._lungRate)) : 0;
    const label = ['', 'Dust in the air: cough', 'Wheezing: get to clean air', 'You are about to pass out'][stage];
    const pulse = lung > 0.6 ? 0.5 + 0.5 * Math.sin((this._lungT = (this._lungT || 0) + dt * (3 + lung * 5))) : 0;
    const vig = Math.min(0.97, Math.pow(Math.max(0, (lung - 0.12) / 0.88), 1.2) * 0.95 + pulse * 0.12 * Math.min(1, (lung - 0.6) / 0.4));
    this.ui.setLungWarn(stage, label, stage >= 2 && eta ? `passing out in about ${eta} s` : stage >= 2 ? 'move away from the dust' : '', vig, lung > 0.82);
    if (lung > 0.55) {
      this._wheezeT = (this._wheezeT || 0) - dt;
      if (this._wheezeT <= 0) { this._wheezeT = 2.4 - 1.4 * Math.min(1, (lung - 0.55) / 0.45); this.sound.wheeze(Math.min(1, lung)); if (lung > 0.82) this.sound.thump(0.2, 60); }
    }
    if (stage === 0 && this._lungWarned) this._lungWarned = false;
    if (stage >= 2 && !this._lungWarned) { this._lungWarned = true; this.ui.hint('<b>Your lungs are full of dust.</b> Walk out of the dust, hang a <kbd>Support Fan</kbd> on a frame, run a Vent Fan, or buy a Respirator.', 7); }
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
      this.dust.lung = 0.06; this.dust.recover = 75;
      this.recall();
      if (this.isGuest()) this.cmd('clearDust', { x: this.player.pos.x, z: this.player.pos.z });   // the dust field lives on the host
      { const p0 = this.player.pos; for (const k of [...this.dust.cells.keys()]) { const [ix, iy, iz] = this.dust.decode(k); if (Math.hypot((ix + 0.5) * 3 - p0.x, (iz + 0.5) * 3 - p0.z) < 16) this.dust.cells.delete(k); } }
      this._poCount = (this._poCount || 0) + 1; if (this.time - (this._poLast ?? -1e9) < 240) this.ui.hint('<b>You keep passing out in the same place.</b> Ventilate it: Support Fans on your frames, a Vent Fan, or a Respirator. Or tunnel somewhere else.', 9); this._poLast = this.time;
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
  // every topple calls this: the host feels it if close, and a guest standing near the slide is told so it can feel it too
  slideEvent(x, z, pd) {
    if (pd < 22) this.slideFeel(pd);
    if (this.net.open && this.net.role === 'host' && this.slide.recent >= 3 && !(this._slideNet > this.time)) { this._slideNet = this.time + 0.45; this.netSend({ t: 'slide', x: +x.toFixed(1), z: +z.toFixed(1), r: this.slide.recent }); }
  }

  slideFeel(pd, recent = this.slide.recent) {
    const near = 1 - pd / 22;
    if (pd >= 22) return;
    // only a real slide (several topples at once) shakes the screen; a stray plush rolling does not
    if (recent < 3) return;
    this.shake = Math.max(this.shake, Math.min(0.8, 0.05 * recent * near) * this.T.shakeMul);
    if (this.slideSnd === undefined || performance.now() - this.slideSnd > 450) { this.slideSnd = performance.now(); this.sound.rumble(0.25 + 0.5 * near); this.sound.soft(0.1); }
    if (pd < 12 && !this._slideHint) { this._slideHint = true; this.ui.hint('A slide! The pile is not stable under you or on a steep face. Stay low, brace with frames, or stay off it.', 6); }
  }

  treadOn(strength, stomp) {
    const fc = this.player.footCell, p = this.player;
    if (!fc || p.pos.y < 0.4) return;
    // climbing is a gamble: the higher you are and the more you carry, the harder you load the face under you.
    // Near the floor this stays far below what the slide rules need, so walking on a low pile is safe.
    // Climbing Gear (pitons, rope, grippy soles) takes 25% off the load per tier
    if (p.pos.y > 8) {
      const e = (0.1 + p.pos.y * 0.1 + this.S.carry.length * 0.02 + strength * 0.12 + (stomp ? 0.3 : 0)) * (1 - 0.25 * this.T.climb) * (this.ropedIn(p.pos) ? 0.15 : 1);
      if (this.isGuest()) { if (e > 0.3) this.cmd('tread', { i: fc.i, j: fc.j, k: fc.k, e: +e.toFixed(3) }); }   // the slide rules run on the host: it loads the face under the guest's boots
      else this.slide.trigger(fc.i, fc.j, fc.k, e);
    }
  }

  // within 6 m of a rope anchor the slope holds
  ropedIn(pos) {
    for (const it of this.machines.items.values()) { const e = it.ent; if (e.type === 'rope' && Math.hypot(e.x - pos.x, e.z - pos.z) < 6 && Math.abs(e.y - pos.y) < 5) return true; }
    return false;
  }

  // High on the pile there is nothing solid to stand on. Above ~8 m the face under your boots starts to give: first it shifts and
  // rumbles, then a patch lets go, shoves you down the slope, hurts, and sets off a real slide. Climbing Gear cuts the odds and the damage.
  climbRisk(dt) {
    const p = this.player, fc = p.footCell;
    if (this.dead || this.blacking || !fc || p.pos.y < 8 || !p.onGround) { this._climbT = 0; return; }
    if (this.ropedIn(p.pos)) { this._climbT = 0; if (!this._ropeHint) { this._ropeHint = true; this.ui.hint('Roped in: the slope holds here.', 3); } return; }
    const climb = this.T.climb || 0, h = p.pos.y;
    this._climbT = (this._climbT || 0) + dt; if (this._climbT < 1.5) return; this._climbT = 0;
    const odds = Math.min(0.6, (h - 6) / 45) * (1 - 0.25 * climb) * (1 + this.S.carry.length * 0.03);
    if (!this._climbHint) { this._climbHint = true; this.ui.hint('<b>Loose footing up here.</b> The pile shifts under your boots the higher you climb. Climbing Gear in the terminal helps. Better yet: dig, do not climb.', 7); }
    const r = Math.random();
    if (r > odds) { if (r > 0.75) { this.sound.thump(0.12, 70); this.shake = Math.max(this.shake, 0.08); } return; }
    // the face gives way: find the steepest way down
    const w = this.world; let best = [0, 0], low = w.topAt(fc.i, fc.k);
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = w.topAt(fc.i + a, fc.k + b); if (t < low) { low = t; best = [a, b]; } }
    if (this.isGuest()) this.cmd('patch', { i: fc.i, k: fc.k, e: +(2.6 + h * 0.03).toFixed(3) }); else this.slide.triggerPatch(fc.i, fc.k, 2.6 + h * 0.03, 3);
    p.vel.x += best[0] * (4 + h * 0.15); p.vel.z += best[1] * (4 + h * 0.15); p.vel.y += 2.2; p.onGround = false;
    const lose = Math.min(this.S.carry.length, Math.ceil(this.S.carry.length / 2));
    for (let n = 0; n < lose; n++) { const it = this.S.carry.pop(); this.sim.spawn(it.sp, it.vr, p.pos.x, p.pos.y + 1.2, p.pos.z, best[0] * 2 + (Math.random() - 0.5), 2, best[1] * 2 + (Math.random() - 0.5), 0); }
    if (lose) this.ui.setCarry(this.S.carry, this.T.carry);
    this.hurtPlayer((4 + h * 0.5) * (1 - 0.2 * climb), 'the pile gave way');
    this.sound.thump(0.4, 80); this.shake = Math.max(this.shake, 0.4);
    this.ui.hint(`<b>The pile gives way under you!</b>${lose ? ' You drop ' + lose + ' plush.' : ''} Stay low, or get Climbing Gear.`, 4);
    this.S.stats.climbFalls = (this.S.stats.climbFalls || 0) + 1;
  }

  onKick(i, j, k, vx, vy, vz, speed, en) {
    this.kickBudget = this.kickBudget ?? 6;
    if (this.kickBudget <= 0 || speed < 3.2) return;
    if (Math.random() > 0.08 * (speed - 2.8)) return;
    { const e = en > 0 ? en * 0.5 : (speed > 6 ? Math.min(1.2, 0.05 + speed * 0.04) : 0); if (e > 0.3 && !this.isGuest()) this.slide.trigger(i, j, k, e); }
    this.kickBudget--;
  }

  // ======================= stability + collapse =======================
  // a creaking roof or a failing support shakes a little plush loose off the slopes nearby: a handful slides now and then, never a stream. A real cave-in
  // (a support giving way, digging too deep) already starts the big slides; this is the small, believable sign that the mountain is working.
  shedOffSlope(x, z, power = 1) {
    if (this.isGuest() || this.mode !== 'play' || !this.slide) return false;
    if (this._shedT > this.time) return false;
    this._shedT = this.time + 20 + Math.random() * 25;   // at most one small shed every 20 to 45 s
    const w = this.world; let done = 0;
    for (let tries = 0; tries < 10 && done < 1 + (power > 1.5 ? 1 : 0); tries++) {
      const ang = Math.random() * Math.PI * 2, r = 3 + Math.random() * 11, i = toI(x + Math.cos(ang) * r), k = toK(z + Math.sin(ang) * r);
      const t = w.topAt(i, k); if (t < 4) continue;                                   // a slope of the pile, not flat floor
      if (w.topAt(i + 2, k) === t && w.topAt(i - 2, k) === t && w.topAt(i, k + 2) === t && w.topAt(i, k - 2) === t) continue;   // dead flat: nothing to slide
      this.slide.triggerPatch(i, k, 0.9 + 0.5 * Math.min(2, power), 2); done++;
    }
    if (done) this.S.stats.shed = (this.S.stats.shed || 0) + 1;
    return done > 0;
  }

  onCreak(x, y, z, n) {
    if (!this.isGuest() && Math.random() < 0.18) this.shedOffSlope(x, z, 1);
    const d = Math.hypot(x - this.player.pos.x, y - this.player.pos.y, z - this.player.pos.z);
    if (d < 40) this.sound.creak(Math.max(0.05, 0.28 - d * 0.006));
    this.S.stats.creaks++; this.dust.add(x, y, z, 0.05);   // every creak shakes a little dust loose
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
  onPlayerHit(v, remote) {
    // plush that hit the other player's body: tell them, they are the one who gets hurt
    if (remote) { if (this.net.open && v > 4.5 && !(this._rhitCd > this.time)) { this._rhitCd = this.time + 0.1; this.netSend({ t: 'hit', v: +v.toFixed(2) }); } return; }
    if (v > 5) { this.shake = Math.max(this.shake, 0.35 * this.T.shakeMul); this.sound.thump(0.2, 130); if (this.T.shakeMul === 1) this.ui.hurt(0.25); }
    // falling plush hurt: a trickle is harmless, an avalanche is not
    if (v > 4.5 && this.dmgCd <= 0) { this.dmgCd = 0.22; this.hurtPlayer((v - 4) * 4.5 * (1 - (this.T.plushCut || 0)), 'were crushed under falling plush'); }
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
      const woke = this.recall();
      S.stats.deaths = (S.stats.deaths || 0) + 1;
      this.ui.toast({ icon: '💀', title: 'You died', text: `You ${why}. You woke up ${woke && !woke.bay ? 'at ' + woke.name : 'on the floor of the sorting bay'}. Whatever you carried spilled where it happened.`, ms: 8000 });
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
    this.ui.setVitals(this.hp / this.hpMax, air, this.trapOn, this.suffocating, this.dust.lung, this.hp, this.hpMax, this.airLeft === undefined ? undefined : this.airLeft);
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
    if (this.netBodies) for (const b of this.netBodies.values()) if (b.sp === NEEDLE) return _v2.set(b.x, b.y, b.z);   // a guest has no bodies of its own: it sees the host's
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
      this.ui.setWarn(this._fuseTxt || (near < 16 ? 'ROOF CREAKING' : ''));
      this.ui.setDanger(Math.max(0, 1 - near / 18));
      if (near < 14) this.shake = Math.max(this.shake, 0.08 * (1 - near / 14));
    } else if (this.T.slopeProbe && p.footCell && p.onGround && p.pos.y > 0.6 && this.slide.unstableAt(p.footCell.i, p.footCell.j + 1, p.footCell.k)) {
      this.ui.setWarn(this._fuseTxt || 'UNSTABLE SLOPE'); this.ui.setDanger(0);
    } else { this.ui.setWarn(this._fuseTxt || ''); this.ui.setDanger(0); }
    // buried
    const buried = p.buried > 0.8;
    this.ui.setBuried(buried);
    if (buried && !this.lastBuried) S.stats.buried++;
    this.lastBuried = buried;
    // trapped: a pulsing countdown to dig out before the air runs out
    this.updateTrapped(dt);
    this.updateVitals(dt);
    this.depthCheck(dt); this.climbRisk(dt); this.updateLoads(dt);
    // emergency recall: hold U
    if (this.keys.KeyH) {
      this.recallHold += dt;
      if (this.recallHold > 2.5) { this.recallHold = 0; this.recall(); }
      else this.ui.hint(`Recalling… hold <kbd>H</kbd> (${(2.5 - this.recallHold).toFixed(1)}s)`, 0.3);
    } else this.recallHold = 0;
    if (this.keys.Space && (p.embedded || p.buried > 0.3)) this.punch(true, true);
    if (p.buried > 1.5 && !this.unstuckHint2) { this.unstuckHint2 = true; this.ui.hint('Stuck in a hole? Tap <kbd>R</kbd> (or hold <kbd>Space</kbd>) to punch your way out.', 8); }
    if (p.buried > 6 && !this.unstuckHint) { this.unstuckHint = true; this.ui.hint('Stuck? Hold <kbd>H</kbd> for an emergency recall to the nearest depot (or the sorting bay).', 8); }

    if (this.S.stats && this.T.scan > 0) this.sound.geiger(dt, this.sigLevel > 0 ? Math.pow(this.sigLevel, 0.7) : 0);
    // carried held plush bob
    this.heldPop += (0 - this.heldPop) * Math.min(1, dt * 9);

    if (this.hudT > 0) return;
    this.hudT = 0.1;
    this.updateBotHud();
    if (this.ui.openModal === 'crew') this.ui.updateCrewLive();
    this.ui.setCartLine(this.S.cart ? this.S.cart.load.length : -1, this.S.cart ? CART_CAP[this.S.cart.tier] : 0, this.S.cart ? this.S.cart.mode : '');
    const depth = this.trackDepth();
    { const out = Math.hypot(p.pos.x, p.pos.z), left = Math.max(0, EXIT_X - p.pos.x);
      // BURIED is how far under the pile surface you are (it cannot pass the 43 m ceiling); FROM BAY is how far you have really come
      const parts = []; if (depth > 0.3) parts.push(`BURIED ${depth.toFixed(1)} m`); else if (p.pos.y > 6) parts.push(`ALTITUDE ${p.pos.y.toFixed(0)} m`);
      if (out > 30) parts.push(`${out >= 1000 ? (out / 1000).toFixed(2) + ' km' : Math.round(out) + ' m'} FROM BAY`); if (out > 300) parts.push(`EXIT ${left >= 1000 ? (left / 1000).toFixed(2) + ' km' : Math.round(left) + ' m'}`);
      this.ui.setDepth(parts.join('  ·  '), { depth, alt: p.pos.y, out, left });
      this.ui.setScoop(this.scoopNow(), T.scoop || 0);
      { let bk = null; for (const k of T.frames) if (!bk || FRAME_TYPES[k].maxDepth > FRAME_TYPES[bk].maxDepth) bk = k; this.ui.setTunnel(this.coverDepth(), bk ? FRAME_TYPES[bk].maxDepth : 150, bk ? FRAME_TYPES[bk].name.replace(/ (Frame|Lining|Arches?)$/, '') : 'no frames'); } }
    { const ct = this.stowed ? null : this.curTool(); const inf = ct && ct.kind !== 'hammer' && ct.kind !== 'cable' ? (this._xInfo && this._xInfo.t > this.time ? this._xInfo : null) : infoFor(this, findInfoRef(this)); if (inf) this.ui.setTileInfo(true, inf.title, inf.lines.filter(Boolean), inf.lit); else this.ui.setTileInfo(false); }
    {
      const net = this.isGuest() ? PWP.gridFromDyn(this.guestGrid) : (this.hasGen() ? this.power.nearest(p.pos.x, p.pos.y + 1, p.pos.z) : null);
      if (net) { const used = Math.min(net.demand, net.supply); this.ui.setPower(true, net.supply > 0 ? Math.min(1, net.demand / Math.max(0.01, net.supply)) : 1, net.tripped ? `TRIPPED · ${net.demand.toFixed(1)} kW wanted` : net.supply <= 0 ? 'NO FUEL' : `${net.demand.toFixed(1)} / ${net.supply.toFixed(1)} kW${net.sat < 0.99 ? ' BROWNOUT' : ''}`, { demand: net.demand, supply: net.supply, tripped: !!net.tripped, sat: net.sat === undefined ? 1 : net.sat }); void used; }
      else this.ui.setPower(false);
      const dd = this.dust;
      { const dep = this.coverDepth(), sp = fanSpacing(dep); { const head = { x: p.pos.x, y: p.pos.y + 1.5, z: p.pos.z }, stl = this.dust.stale(head), bad = Math.max(dd.level, stl, 0.6 * dd.lung), under = dep > 0 || bad > 0.05;
        this.ui.setOxy(1 - Math.min(1, bad), under, bad < 0.1 ? 'CLEAN' : stl > dd.level * 0.8 ? 'STALE' : 'DUSTY');
        this.ui.setSuffocation(dd.lung, dd.lung > 0.02 || bad > 0.3, dd.lung > 0.85 ? 'ABOUT TO PASS OUT' : dd.lung > 0.6 ? 'COUGHING' : dd.lung > 0.3 ? 'WHEEZING' : 'BREATHE EASY'); }
      this.ui.setAir(T.airmon && (dd.level > 0.03 || dd.lung > 0.03 || staleAt(dep) > 0.1), dd.level, dd.lung, dd.lung > 0.6 ? 'COUGHING' : dd.level > 0.3 ? (staleAt(dep) > dd.level * 0.8 ? 'STALE AIR' : 'DUSTY') : isFinite(sp) && staleAt(dep) > 0.1 ? `FAN EVERY ${Math.floor(sp)} M` : 'CLEAR'); }
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
      for (const it of this.machines.items.values()) if (it.ent.type === 'vscan' && it.ent.alarm) markers.push({ b: deg(Math.atan2(it.ent.cx - p.pos.x, -(it.ent.cz - p.pos.z))), label: '!!', color: '#ff4d4d' });   // a Vehicle Scanner holds The One
      if (T.exitMarker) markers.push({ b: deg(Math.atan2(ex, -ez)), label: 'EXIT', color: '#7ef0c4' });
      const np2 = this.needlePos();
      if (T.scan >= 3 && np2 && Math.hypot(np2.x - p.pos.x, np2.z - p.pos.z) <= T.scanRange) markers.push({ b: deg(Math.atan2(np2.x - p.pos.x, -(np2.z - p.pos.z))), label: 'ONE', color: '#fff3a0' });
      if (T.locator) {
        this.locT = (this.locT || 0) - 0.1;
        if (this.locT <= 0) { this.locT = 1.0; this.locCache = w.remainsNear(p.pos.x, p.pos.z, T.locatorRange); this.locList = T.locatorCount > 1 ? w.remainsNearN(p.pos.x, p.pos.z, T.locatorRange, T.locatorCount) : null; }
        const lc = this.locCache;
        if (lc) {
          markers.push({ b: deg(Math.atan2(lc.x - p.pos.x, -(lc.z - p.pos.z))), label: 'GEAR', color: '#c79bff' });
          if (T.locatorCount > 1 && this.locList) for (const q of this.locList) if (q.i !== lc.i || q.k !== lc.k) markers.push({ b: deg(Math.atan2(q.x - p.pos.x, -(q.z - p.pos.z))), label: 'GEAR', color: '#c79bff' });   // the Remains Radar marks the next nearest sites too
          if (lc.d < 14 && !(this._locNext > this.time)) { this._locNext = this.time + 0.6 + lc.d * 0.12; this.sound.tone('sine', 880, 880, 0.15, 0.06); } // a slow ping that speeds up as you close in
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
      let ptr = null;
      if (T.assayLvl >= 2) {
        if (!(this._veinNext > this.time)) { this._veinNext = this.time + 1; this._vein = w.nearestVein(p.pos.x, p.pos.y + 1, p.pos.z, T.assayRange); }
        const vn = this._vein;
        if (vn) {
          const rel = (p.yaw - Math.atan2(vn.x - p.pos.x, vn.z - p.pos.z)) * 180 / Math.PI - 90; const dy = vn.y - (p.pos.y + 1);
          ptr = { rel, text: `${Math.round(Math.hypot(vn.x - p.pos.x, vn.z - p.pos.z))} m` + (T.assayLvl >= 3 && Math.abs(dy) > 1.5 ? (dy > 0 ? `  ▲ ${Math.round(dy)}` : `  ▼ ${Math.round(-dy)}`) : '') };
        } else ptr = { rel: -90, text: 'no vein in range' };
      }
      this.ui.setAssay(true, Math.min(1, Math.max(0, (v - T.assayFloor) / 0.4)), ptr);
    } else this.ui.setAssay(false, 0);
    this.updateSurvey();
    // needle scanner
    const np = this.needlePos();
    if (T.scan > 0 && np) {
      const d = Math.hypot(np.x - cam.position.x, np.y - cam.position.y, np.z - cam.position.z);
      const range = T.scanRange;
      if (d <= range) {
        const level = clamp(1 - d / range, 0, 1);
        this.sigLevel = clamp(1 - d / Math.min(range, 60), 0, 1);
        const showMeter = T.scan >= 2;
        const aAng = Math.atan2(np.x - p.pos.x, np.z - p.pos.z);
        const rel = (p.yaw - aAng) * 180 / Math.PI - 90;
        let dtxt = '';
        if (T.scan >= 4) dtxt = d.toFixed(0) + ' m';
        if (T.scan >= 5) { const dy = np.y - cam.position.y; dtxt += dy > 0.5 ? `  ▲ ${dy.toFixed(0)}` : dy < -0.5 ? `  ▼ ${(-dy).toFixed(0)}` : ''; }
        this.ui.setSignal(showMeter, Math.pow(level, 0.6), rel, dtxt || (d < 8 ? 'very close' : ''), T.scan >= 3);
      } else { this.sigLevel = 0; this.ui.setSignal(T.scan >= 2, 0, 0, 'no signal', false); }
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
    this.ui.hint(`Recalled to ${best.bay ? 'the sorting bay' : best.name}.`, 2);
    return best;
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
    const cartItem = (it, x, y, z, sc) => r.addDynamic(it.sp, it.vr, x, y, z, 0, 0, 0, 1, sc, 0.95, Math.max(0.5, this.camSky));
    this.cart.forEachItem(cartItem); this.cart2.forEachItem(cartItem);
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
