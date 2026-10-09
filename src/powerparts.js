import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------------
// Power parts (Satisfactory spec 4.3): Power Switch / Priority Switch, Breaker Box, Power Storage and Load Meter.
// Plain data and mesh code only. power.js solves the grids with these ents, catalog_power.js registers them (placing,
// cfg, hover text, bench rows). This file imports no game module, so power.js, cables.js and the catalog can all use it.
// All four live in game.machines.items (type 'switch' | 'breaker' | 'battery' | 'meter', fields x y z ry) and are wired by
// hand cable like a pole. Settings are plain fields on the ent (saved with it): switch { on, prio?, shed, name },
// breaker { armed, tripped, trip:{at,delay}, name }, battery { mark, charge, name }, meter { mount, name }.
// ---------------------------------------------------------------------------------------------------

export const PART_TYPES = ['switch', 'breaker', 'battery', 'meter'];
export const isPart = (type) => type === 'switch' || type === 'breaker' || type === 'battery' || type === 'meter';

// ---------- numbers ----------
export const KW = { switch: 0.05, pswitch: 0.08, breaker: 0.1, battery: 0.1, meter: 0.02 };
export const BATT_CAP = [0, 36000, 360000, 3600000];      // kJ by mark: Mk1 is about 17 Commons (270 s x 8 kW each) or 1 Epic
export const BATT_NAME = ['', 'Power Storage Mk1', 'Power Storage Mk2', 'Power Storage Mk3'];
export const BATT_FILL_S = 1800;                           // the charge rate limit is cap / 1800 kW: a flat battery fills in 30 minutes of surplus
export const TRIP_DEFAULT = { at: 1, delay: 3 };           // trips when demand > rated output x at for longer than delay seconds
export const TRIP_GRACE_S = 1;                             // after a reset a grid that is still over its rating trips again after one second
export const AUTO_RESET_BREAKER_S = 20;                    // Remote Reset: a tripped breaker closes this long after demand is back under the rating
export const AUTO_RESET_SHED_S = 10;                       // Remote Reset: a shed priority switch closes after this long of surplus
export const HIST_N = 120;                                 // meter history: 120 samples at 0.5 s is 60 s
export const HIST_DT = 0.5;
export const PRIO_MAX = 8;

export const PRICE = { switch: 6000, pswitch: 90000, breaker: 25000, meter: 1500, battery: [0, 40000, 400000, 4000000] };   // bench price before the K=3 multiplier

export const isPrio = (e) => !!e && e.type === 'switch' && e.prio !== undefined;
export const battCap = (e) => BATT_CAP[Math.max(1, Math.min(3, (e && e.mark) | 0))] || BATT_CAP[1];
export const battRate = (e) => battCap(e) / BATT_FILL_S;    // kW
export function partDemand(e) {
  if (!e) return 0;
  if (e.type === 'switch') return e.prio !== undefined ? KW.pswitch : KW.switch;
  return KW[e.type] || 0;
}

// the recipe / item id the hammer hands back for a placed part
export function itemOfPart(e) {
  if (e.type === 'switch') return e.prio !== undefined ? 'pswitch' : 'switch';
  if (e.type === 'battery') return 'battery:' + Math.max(1, Math.min(3, (e.mark | 0) || 1));
  return e.type;
}

export function partName(e) {
  if (!e) return 'something';
  if (e.type === 'switch') return e.prio !== undefined ? 'Priority Switch' : 'Power Switch';
  if (e.type === 'breaker') return 'Breaker Box';
  if (e.type === 'battery') return BATT_NAME[Math.max(1, Math.min(3, (e.mark | 0) || 1))];
  if (e.type === 'meter') return 'Load Meter';
  return e.type;
}
export const labelOf = (e) => (e.name ? `${partName(e)} "${e.name}"` : partName(e));

// ---------- cable ports ----------
// How many cables one object takes (its sockets). Cables are the only links there are. A pole is the hub: it has the most sockets. A machine takes one cable
// (a belt line takes one in all, see cables.js). `g` is unused (it used to count Grid Range: that upgrade now only lengthens a cable).
export const PORTS = { gen: 4, pole: 10, switch: 2, battery: 4, breaker: 6, charger: 1, meter: 1, hlamp: 2 };   // hlamp: one cord in and one out, so a string of hanging lanterns hangs from a single node
export function maxPorts(e, g) {
  if (!e) return 0;
  if (e.type === 'gen') return genKindOf(e).ports;   // the bigger plants take more cords
  const p = PORTS[e.type];
  return p === undefined ? 1 : p;
}
// a wire between two ends: null when allowed, else the reason. Switches take a node or a machine, never another switch.
export function wireCheck(A, B) {
  if (A && B && A.type === 'switch' && B.type === 'switch') return 'Wire a switch to a pole, a generator or a machine, not to another switch';
  return null;
}

// ---------- reading the parts out of a game ----------
export function collectParts(game) {
  const out = { switches: [], batteries: [], breakers: [], meters: [] };
  for (const it of game.machines.items.values()) {
    const e = it.ent;
    if (e.type === 'switch') out.switches.push(e); else if (e.type === 'battery') out.batteries.push(e); else if (e.type === 'breaker') out.breakers.push(e); else if (e.type === 'meter') out.meters.push(e);
  }
  const byId = (a, b) => a.id - b.id;
  out.switches.sort(byId); out.batteries.sort(byId); out.breakers.sort(byId); out.meters.sort(byId);
  return out;
}
export const partCount = (game) => { let n = 0; for (const it of game.machines.items.values()) if (isPart(it.ent.type)) n++; return n; };

// the point a wire clips to (metres above the ent's floor y); power.pos adds it
export function attachY(e) {
  if (e.type === 'meter') return e.mount === 'wall' ? 0.25 : 0.95;
  if (e.type === 'switch') return 1.0;
  return 0.9;
}

// fill the fields a freshly placed or loaded ent needs; safe to call twice
export function normalize(e) {
  if (e.type === 'switch') { e.on = e.on === true; if (e.prio !== undefined) e.prio = Math.max(0, Math.min(PRIO_MAX, e.prio | 0)); e.shed = e.shed === true; }
  else if (e.type === 'breaker') {
    e.armed = e.armed !== false; e.tripped = e.tripped === true;
    const t = e.trip && typeof e.trip === 'object' ? e.trip : {};
    e.trip = { at: Number.isFinite(t.at) ? t.at : TRIP_DEFAULT.at, delay: Number.isFinite(t.delay) ? t.delay : TRIP_DEFAULT.delay };
  } else if (e.type === 'battery') {
    e.mark = Math.max(1, Math.min(3, (e.mark | 0) || 1));
    e.charge = Number.isFinite(e.charge) ? Math.max(0, Math.min(battCap(e), e.charge)) : 0;
  } else if (e.type === 'meter') e.mount = e.mount === 'wall' ? 'wall' : 'floor';
  if (!Number.isFinite(e.ry)) e.ry = 0;
  return e;
}
export const cacheOf = (e) => e.cache || (e.cache = {});

// ---------- what a grid says about itself ----------
const f1 = (v) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : (+v).toFixed(1));
export const kJtext = (v) => (v >= 1e6 ? (v / 1e6).toFixed(2) + ' MJ' : v >= 1000 ? Math.round(v).toLocaleString('en-US') + ' kJ' : Math.round(v) + ' kJ');

// the numbers every readout and the row share. `net` comes from power.js (host) or the row (guest).
export function netSummary(net) {
  if (!net) return null;
  const bat = net.batMax > 0 ? net.bat / net.batMax : null;
  return { supply: net.supply, demand: net.demand, cap: net.cap, sat: net.sat, tripped: !!net.tripped, bat, batKj: net.bat || 0, batMax: net.batMax || 0, flow: net.flow || 0 };
}
export function summaryLine(net) {
  const s = netSummary(net); if (!s) return '';
  const parts = [`Grid ${f1(s.supply)} kW supplied, ${f1(s.demand)} kW wanted, ${f1(s.cap)} kW rated`];
  if (s.bat !== null) parts.push(`storage ${Math.round(s.bat * 100)}%`);
  if (s.tripped) parts.push('TRIPPED');
  return parts.join(' · ');
}
// the loads of a grid as a short list of [kind, kW] for a message (the biggest 8)
export const countLoads = (net) => Object.keys((net && net.loads) || {}).length;
export const packLoads = (net) => Object.entries((net && net.loads) || {}).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => [k, Math.round(v * 100) / 100]);
// a guest in a world with no power part gets no grid row: the 0.17 s dyn message carries the grid nearest to it, and this makes a readable grid of it
export function gridFromDyn(d) {
  if (!d || typeof d !== 'object' || !Number.isFinite(d.supply) || !Number.isFinite(d.demand)) return null;
  const loads = Object.create(null); if (Array.isArray(d.loads)) for (const q of d.loads) if (Array.isArray(q) && typeof q[0] === 'string' && Number.isFinite(q[1])) loads[q[0]] = q[1];
  return { supply: d.supply, demand: d.demand, cap: Number.isFinite(d.cap) ? d.cap : d.supply, sat: Number.isFinite(d.sat) ? d.sat : 1, tripped: !!d.tripped, bat: 0, batMax: 0, flow: 0, loads, loadKinds: Number.isInteger(d.kinds) && d.kinds >= 0 && d.kinds < 1000 ? d.kinds : Object.keys(loads).length, hist: null };
}
// the biggest loads of a grid by kind, for the Load Meter: "Loads: Rail Stations 3 kW, Doors 1.6 kW, Belts 0.9 kW and 2 more kinds" ('' when nothing draws)
export function loadsLine(net, top = 5) {
  const list = Object.entries((net && net.loads) || {}).filter(([, v]) => v > 1e-6).sort((a, b) => b[1] - a[1]);
  if (!list.length) return '';
  const shown = list.slice(0, top).map(([k, v]) => `${k} ${f1(v)} kW`).join(', ');
  const kinds = Math.max(list.length, (net && net.loadKinds) || 0);   // a guest holds only the biggest eight: the host says how many kinds there are in all
  return `Loads: ${shown}${kinds > top ? ` and ${kinds - top} more kinds` : ''}`;
}
const BLOCKS = '▁▂▃▄▅▆▇█';
export function sparkline(values, max) {
  if (!values.length) return '';
  const hi = Math.max(max || 0, ...values, 1e-9);
  return values.map((v) => BLOCKS[Math.max(0, Math.min(7, Math.round((v / hi) * 7)))]).join('');
}

// history ring: supply and demand, 120 samples at 0.5 s (a minute)
export class Ring {
  constructor(n = HIST_N) { this.n = n; this.s = new Float32Array(n); this.d = new Float32Array(n); this.len = 0; this.head = 0; }
  push(s, d) { this.s[this.head] = s; this.d[this.head] = d; this.head = (this.head + 1) % this.n; if (this.len < this.n) this.len++; }
  // oldest first
  series(which) { const a = which === 'd' ? this.d : this.s, out = []; for (let i = 0; i < this.len; i++) out.push(a[(this.head - this.len + i + this.n * 2) % this.n]); return out; }
}

// ---------- lamp state (the same on both screens, from fields only) ----------
export const LAMP = {
  green: [0.25, 1.6, 0.5], yellow: [2.2, 1.7, 0.2], red: [2.4, 0.22, 0.18], orange: [2.4, 1.05, 0.2], blue: [0.3, 0.9, 2.4], grey: [0.45, 0.47, 0.5],
};
export function lampOf(g, e) {
  if (e.type === 'switch') {
    const n = g.cables ? g.cables.of(e.id).length : 0;
    if (n < 2) return 'red';
    if (e.shed) return 'orange';
    return e.on ? 'green' : 'yellow';
  }
  if (e.type === 'breaker') {
    if (e.tripped) return 'red';
    if (e.armed === false) return 'grey';
    return (e.cache && e.cache.over > 0) ? 'orange' : 'green';
  }
  if (e.type === 'battery') {
    const f = (e.cache && e.cache.flow) || 0;
    return f > 0.001 ? 'blue' : f < -0.001 ? 'orange' : 'grey';
  }
  if (e.type === 'meter') return (e.pw ?? 0) > 0.05 ? 'green' : 'red';
  return 'grey';
}
export function lampWord(color) { return ({ green: 'green', yellow: 'yellow', red: 'red', orange: 'orange', blue: 'blue', grey: 'grey' })[color] || color; }

// ---------- meshes ----------
const M = {};
const mat = (k, f) => M[k] || (M[k] = f());
const dark = () => mat('dark', () => new THREE.MeshStandardMaterial({ color: 0x2a2f34, roughness: 0.55, metalness: 0.8 }));
const steel = () => mat('steel', () => new THREE.MeshStandardMaterial({ color: 0x77879a, roughness: 0.4, metalness: 0.85 }));
const paint = (k, c) => mat('p' + k, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.4 }));
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const lampMesh = (r = 0.045) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(...LAMP.grey) })); o.name = 'lamp'; return o; };

function numberTexture(text) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 40;
  const c = cv.getContext('2d'); c.fillStyle = '#10151c'; c.fillRect(0, 0, 64, 40); c.fillStyle = '#7ad7ff'; c.font = 'bold 28px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 32, 22);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function buildSwitch(e) {
  const g = new THREE.Group(), prio = e.prio !== undefined;
  g.add(box(0.34, 0.04, 0.34, dark(), 0, 0.02, 0));
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.78, 8), steel()); post.position.y = 0.43; g.add(post);
  const head = box(0.38, 0.34, 0.16, prio ? paint('ps', 0x1d4f8a) : paint('sw', 0xc9a227), 0, 0.96, 0); head.name = 'head'; g.add(head);
  const plate = box(0.3, 0.2, 0.012, dark(), 0, 0.96, 0.086); g.add(plate);
  const lever = new THREE.Group(); lever.name = 'lever'; lever.position.set(0, 0.94, 0.1);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6), steel()); rod.position.y = 0.1; lever.add(rod);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), paint('knob', 0xd8d8d8)); knob.position.y = 0.2; lever.add(knob);
  g.add(lever);
  const lamp = lampMesh(); lamp.position.set(0.13, 1.1, 0.082); g.add(lamp);
  if (prio) {
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.09), new THREE.MeshBasicMaterial({ map: numberTexture('0') })); tag.name = 'tag'; tag.position.set(-0.08, 1.1, 0.0925); g.add(tag);
  }
  g.userData.kind = 'switch';
  return g;
}
function buildBreaker(e) {
  const g = new THREE.Group();
  g.add(box(0.56, 0.9, 0.26, paint('br', 0x6c2f2a), 0, 0.5, 0));
  g.add(box(0.5, 0.82, 0.02, dark(), 0, 0.5, 0.135));
  for (const sx of [-0.2, 0.2]) g.add(box(0.05, 0.05, 0.05, dark(), sx, 0.04, 0));
  const slot = box(0.1, 0.34, 0.03, steel(), 0, 0.52, 0.15); g.add(slot);
  const handle = new THREE.Group(); handle.name = 'handle'; handle.position.set(0, 0.52, 0.16);
  const bar = box(0.06, 0.2, 0.05, paint('hd', 0xd22a1f), 0, 0.0, 0.0); bar.position.y = 0.0; handle.add(bar); g.add(handle);
  const lamp = lampMesh(0.05); lamp.position.set(0, 0.8, 0.14); g.add(lamp);
  for (let i = 0; i < 4; i++) g.add(box(0.36, 0.012, 0.01, dark(), 0, 0.2 + i * 0.05, 0.145));
  g.userData.kind = 'breaker';
  return g;
}
function buildBattery(e) {
  const g = new THREE.Group(), mk = Math.max(1, Math.min(3, (e.mark | 0) || 1));
  g.add(box(0.7, 1.0, 0.5, paint('bt', [0, 0x2c4a3a, 0x2c3f5c, 0x4a2c5c][mk]), 0, 0.52, 0));
  for (let i = 0; i < mk; i++) g.add(box(0.72, 0.05, 0.52, paint('btb', 0xe8b81c), 0, 0.96 - i * 0.09, 0));
  const back = box(0.14, 0.72, 0.02, dark(), 0, 0.47, 0.255); g.add(back);
  const bar = box(0.1, 0.68, 0.02, new THREE.MeshBasicMaterial({ color: new THREE.Color(...LAMP.grey) }), 0, 0.13, 0.265); bar.name = 'bar'; bar.geometry.translate(0, 0.34, 0); bar.position.y = 0.13; g.add(bar);
  const lamp = lampMesh(0.04); lamp.position.set(0.22, 0.88, 0.26); g.add(lamp);
  for (const sx of [-0.28, 0.28]) g.add(box(0.06, 0.05, 0.06, dark(), sx, 0.02, 0));
  g.userData.kind = 'battery';
  return g;
}
function buildMeter(e) {
  const g = new THREE.Group(), wall = e.mount === 'wall';
  const y0 = wall ? 0 : 0.72;
  if (!wall) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.74, 8), steel()); post.position.y = 0.37; g.add(post); g.add(box(0.3, 0.03, 0.3, dark(), 0, 0.015, 0)); }
  g.add(box(0.68, 0.46, 0.05, dark(), 0, y0 + 0.23, 0));
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.4), new THREE.MeshBasicMaterial({ map: tex })); face.name = 'face'; face.position.set(0, y0 + 0.23, 0.027); g.add(face);
  const lamp = lampMesh(0.025); lamp.position.set(0.3, y0 + 0.43, 0.03); g.add(lamp);
  g.userData.kind = 'meter'; g.userData.cv = cv; g.userData.tex = tex;
  return g;
}

export function buildPart(e) {
  const g = e.type === 'switch' ? buildSwitch(e) : e.type === 'breaker' ? buildBreaker(e) : e.type === 'battery' ? buildBattery(e) : buildMeter(e);
  g.position.set(e.x ?? 0, e.y ?? 0, e.z ?? 0); g.rotation.y = e.ry || 0;
  g.userData.key = '';
  return g;
}

export function ghostPart(e, ok) {
  const g = buildPart({ ...e });
  const m = new THREE.MeshBasicMaterial({ color: ok ? 0x5dffa0 : 0xff5a4a, transparent: true, opacity: 0.28, depthWrite: false });
  const meshes = []; g.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) o.material = m;
  return g;
}

// ---------- the face of a Load Meter ----------
export function drawMeterFace(cv, info, hist) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height;
  c.fillStyle = '#0b1117'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#7ad7ff'; c.font = 'bold 15px monospace'; c.textAlign = 'left'; c.textBaseline = 'top';
  if (!info) { c.fillStyle = '#ff8a7a'; c.fillText('NO GRID', 8, 8); c.fillStyle = '#7d8a96'; c.font = '12px monospace'; c.fillText('wire it to a pole,', 8, 30); c.fillText('generator or battery', 8, 46); return; }
  const trip = info.tripped;
  c.fillStyle = trip ? '#ff5a4a' : '#7ef0c4'; c.fillText(trip ? 'GRID TRIPPED' : 'GRID OK', 8, 6);
  c.fillStyle = '#d8e4ee'; c.font = '13px monospace';
  c.fillText(`SUP ${f1(info.supply)} kW`, 8, 28); c.fillText(`DEM ${f1(info.demand)} kW`, 8, 44); c.fillText(`CAP ${f1(info.cap)} kW`, 8, 60);
  if (info.bat !== null) { c.fillText(`BAT ${Math.round(info.bat * 100)}%`, 150, 28); c.fillStyle = '#243241'; c.fillRect(150, 46, 96, 10); c.fillStyle = info.flow > 0.001 ? '#4aa0ff' : info.flow < -0.001 ? '#ff9a2a' : '#8a94a0'; c.fillRect(150, 46, 96 * Math.max(0, Math.min(1, info.bat)), 10); }
  // 60 s graph
  const gx = 8, gy = 80, gw = W - 16, gh = H - 90;
  c.strokeStyle = '#243241'; c.lineWidth = 1; c.strokeRect(gx, gy, gw, gh);
  if (hist && hist.len > 1) {
    const s = hist.series('s'), d = hist.series('d'), hi = Math.max(1e-6, info.cap, ...s, ...d) * 1.1;
    const line = (a, col) => { c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); a.forEach((v, i) => { const x = gx + (i / (hist.n - 1)) * gw + (hist.n - a.length) / (hist.n - 1) * gw, y = gy + gh - (v / hi) * gh; if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); }); c.stroke(); };
    c.setLineDash([3, 3]); c.strokeStyle = '#6a7683'; c.beginPath(); const cy = gy + gh - (info.cap / hi) * gh; c.moveTo(gx, cy); c.lineTo(gx + gw, cy); c.stroke(); c.setLineDash([]);
    line(s, '#7ef0c4'); line(d, '#ffb02e');
  }
}

// ---------- per frame look of every part (both screens) ----------
const _c = new THREE.Color();
function setLamp(obj, color) { const l = obj.getObjectByName('lamp'); if (l) { const v = LAMP[color] || LAMP.grey; l.material.color.setRGB(v[0], v[1], v[2]); } }

export function updateLooks(g, dt) {
  const me = g.player && g.player.pos;
  g._ppT = (g._ppT || 0) - dt;
  const slow = g._ppT <= 0; if (slow) { g._ppT = 0.5; g._ppList = []; for (const it of g.machines.items.values()) if (isPart(it.ent.type)) g._ppList.push(it.ent.id); }   // the parts, found twice a second (a world holds thousands of other machines)
  for (const id of g._ppList || []) {
    const it = g.machines.items.get(id); if (!it) continue;
    const e = it.ent; if (!it.obj) continue;
    const o = it.obj, lamp = lampOf(g, e);
    if (e.type === 'switch') {
      const key = `${lamp}|${e.on}|${e.prio}`;
      if (o.userData.key !== key) {
        o.userData.key = key; setLamp(o, lamp);
        const lv = o.getObjectByName('lever'); if (lv) lv.rotation.x = e.on ? -0.9 : 0.9;
        const tg = o.getObjectByName('tag'); if (tg) { const t = numberTexture(e.prio === 0 ? '-' : 'P' + e.prio); if (tg.material.map) tg.material.map.dispose(); tg.material.map = t; tg.material.needsUpdate = true; }
      }
    } else if (e.type === 'breaker') {
      const key = `${lamp}|${e.tripped}`;
      if (o.userData.key !== key) { o.userData.key = key; setLamp(o, lamp); const h = o.getObjectByName('handle'); if (h) h.rotation.x = e.tripped ? 0.7 : -0.5; }
    } else if (e.type === 'battery') {
      const f = battCap(e) > 0 ? (e.charge || 0) / battCap(e) : 0, key = `${lamp}|${Math.round(f * 50)}`;
      if (o.userData.key !== key) {
        o.userData.key = key; setLamp(o, lamp);
        const bar = o.getObjectByName('bar'); if (bar) { bar.scale.y = Math.max(0.02, f); const v = LAMP[lamp] || LAMP.grey; bar.material.color.setRGB(v[0], v[1], v[2]); }
      }
    } else if (e.type === 'meter') {
      if (o.userData.key !== lamp) { o.userData.key = lamp; setLamp(o, lamp); }
      if (slow && me && Math.hypot(me.x - e.x, me.z - e.z) < 18) {
        const net = netOfEnt(g, e), hist = net && net.hist;
        drawMeterFace(o.userData.cv, e.cache && e.cache.net !== undefined && net ? netSummary(net) : null, hist);
        o.userData.tex.needsUpdate = true;
      }
    }
  }
  void _c;
}

// the grid an ent belongs to (host: set by the solver, guest: from the row)
export function netOfEnt(g, e) {
  const id = e.cache && e.cache.net; if (id === undefined || id === null) return null;
  if (g.power.netById && g.power.netById.get(id)) return g.power.netById.get(id);
  for (const n of g.power.nets) if (n.id === id) return n;
  return null;
}

// ---------- the M key: a small readout of the grid you stand nearest to ----------
let hudEl = null, hudCv = null;
export function hudOn(g) { return !!g._pwHud; }
export function toggleHud(g, on) {
  g._pwHud = on === undefined ? !g._pwHud : !!on;
  if (!g._pwHud && hudEl) hudEl.style.display = 'none';
  if (g.ui && g.ui.hint) g.ui.hint(g._pwHud ? 'Load meter on: it shows the grid you stand nearest to. <kbd>M</kbd> turns it off.' : 'Load meter off.', 2.2);
  return g._pwHud;
}
function ensureHud() {
  if (hudEl) return hudEl;
  hudEl = document.createElement('div'); hudEl.id = 'pwMeterHud';
  hudEl.style.cssText = 'position:fixed;right:22px;bottom:calc(var(--belt-h, 0px) + 6px);max-height:calc(100vh - var(--belt-h, 0px) - 120px);overflow:hidden;width:min(230px, calc(100vw - 44px));padding:8px 10px;background:rgba(12,14,10,.82);border:1px solid #3a4a56;border-radius:12px;z-index:12;pointer-events:none;display:none;color:#e8e3cf;font:600 11px/1.4 Helvetica,Arial,sans-serif';
  hudEl.innerHTML = '<div style="letter-spacing:.18em;color:#7ad7ff;margin-bottom:3px">LOAD METER</div><div class="pwh-t"></div><div class="pwh-l" style="margin-top:3px;color:#b9c6d0;font-weight:500"></div>';
  hudCv = document.createElement('canvas'); hudCv.width = 256; hudCv.height = 160; hudCv.style.cssText = 'width:210px;height:131px;display:block;margin-top:4px;border-radius:6px';
  hudEl.appendChild(hudCv); document.body.appendChild(hudEl);
  return hudEl;
}
export function hudTick(g, dt) {
  g._pwHudT = (g._pwHudT || 0) - dt; if (g._pwHudT > 0) return; g._pwHudT = 0.25;
  if (!g._pwHud || g.mode !== 'play') { if (hudEl) hudEl.style.display = 'none'; return; }
  const el = ensureHud(), p = g.player.pos, net = g.power.nearest(p.x, p.y + 1, p.z) || (g.isGuest && g.isGuest() ? gridFromDyn(g.guestGrid) : null);
  el.style.display = 'block';
  el.querySelector('.pwh-t').textContent = net ? summaryLine(net) : 'No grid within reach';
  el.querySelector('.pwh-l').textContent = net ? loadsLine(net, 4) : '';   // the loads by kind (doors, lifts, pads, stations, lights ...)
  drawMeterFace(hudCv, net ? netSummary(net) : null, net ? net.hist : null);
}

// ---------- alerts (host when it trips, a guest when the row says so) ----------
export function tripAlert(g, e) {
  try {
    if (g.sound) { const sv = e && Number.isFinite(e.x + e.z) && g.sound.at ? g.sound.at(e.x, (e.y || 0) + 1, e.z, 'alarm') : g.sound; sv.thump(0.5, 80); sv.tone('square', 240, 60, 0.2, 0.2); sv.tone('square', 150, 50, 0.16, 0.14, 0.12); }   // the breaker trips where it stands: the alarm fades with distance, the hint stays
    if (g.ui && g.ui.hint) g.ui.hint(`<b>GRID TRIPPED</b> at ${labelOf(e)}: fix the demand, then press <kbd>E</kbd> on the breaker.`, 7);
  } catch (x) { /* the alert is only sound and text */ }
}

// ---------- the Priority Switch panel (E on a priority switch): every priority switch of the world, by name ----------
let panelEl = null, panelT = 0;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function ensurePanel(g) {
  if (panelEl) return panelEl;
  panelEl = document.createElement('div'); panelEl.id = 'pwpanel'; panelEl.className = 'modal hidden';
  panelEl.innerHTML = '<div class="panel narrow" style="width:min(560px,94vw)"><header><h2>PRIORITY SWITCHES</h2><button class="x" data-pwclose>✕</button></header><div class="menu" id="pwpList"></div></div>';
  document.body.appendChild(panelEl);
  panelEl.querySelector('[data-pwclose]').addEventListener('click', () => g.ui.closeModals());
  panelEl.addEventListener('mousedown', (e) => { if (e.target === panelEl) g.ui.closeModals(); });
  return panelEl;
}
export function renderPanel(g, focusId) {
  const box = panelEl && panelEl.querySelector('#pwpList'); if (!box) return;
  const list = [...g.machines.items.values()].map((it) => it.ent).filter(isPrio).sort((a, b) => a.id - b.id);
  if (!list.length) { box.innerHTML = '<div class="jcard">No Priority Switches are built.</div>'; return; }
  box.innerHTML = '';
  for (const e of list) {
    const row = document.createElement('div'); row.className = 'jcard'; row.dataset.id = e.id;
    const st = e.shed ? 'SHED (overload)' : e.on ? 'ON' : 'OFF', col = e.shed ? '#ffb02e' : e.on ? '#7ef0c4' : '#ffd86a';
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;' + (e.id === focusId ? 'outline:1px solid #7ad7ff;' : '');
    row.innerHTML = `<input data-a="name" maxlength="24" value="${esc(e.name || '')}" placeholder="Priority Switch #${e.id}" style="flex:1 1 160px;min-width:120px;background:rgba(255,255,255,.08);color:inherit;border:1px solid var(--line);border-radius:8px;padding:6px 8px;font:inherit">
      <b style="color:${col};min-width:110px">${st}</b>
      <span>Group <button data-a="down" title="Lower the group number: this switch drops later">-</button> <b>${e.prio === 0 ? '0' : e.prio}</b> <button data-a="up" title="Raise the group number: this switch drops sooner">+</button></span>
      <button data-a="toggle">${e.on ? 'Switch off' : 'Switch on'}</button>${e.shed ? '<button data-a="reset">Reset</button>' : ''}`;
    row.addEventListener('click', (ev) => {
      const a = ev.target && ev.target.dataset && ev.target.dataset.a; if (!a || a === 'name') return;
      const r = a === 'toggle' ? g.setCfg(e.id, { on: !e.on }) : a === 'reset' ? g.setCfg(e.id, { shed: false }) : g.setCfg(e.id, { prio: Math.max(0, Math.min(PRIO_MAX, (e.prio | 0) + (a === 'up' ? 1 : -1))) });
      if (r && !r.ok) { g.sound.error(); g.ui.hint(r.why || 'Refused', 3); } else g.sound.tone('triangle', 600, 800, 0.05, 0.05);
      setTimeout(() => renderPanel(g, e.id), g.isGuest && g.isGuest() ? 700 : 30);
    });
    const inp = row.querySelector('input'); inp.addEventListener('change', () => { const r = g.setCfg(e.id, { name: inp.value }); if (r && !r.ok) g.ui.hint(r.why || 'Refused', 3); });
    box.appendChild(row);
  }
}
export function openPanel(g, focusId) {
  ensurePanel(g); renderPanel(g, focusId);
  g.openModal('pwpanel');
  clearInterval(panelT);
  panelT = setInterval(() => { if (g.ui.openModal === 'pwpanel') { if (!panelEl.contains(document.activeElement) || document.activeElement.tagName !== 'INPUT') renderPanel(g, focusId); } else clearInterval(panelT); }, 1000);
}


// ---------------------------------------------------------------------------------------------------
// The generator ladder. A generator is a belt-like tile of type 'gen' (logistics.js, one cell). A tile with no `gk` is the
// ordinary 8 kW Generator, exactly as before. `gk` names one of the other rungs, from the 2 kW Portable up to the Titan Plant.
// Every rung burns plush by the same rule: kJ per plush by rarity (power.js ENERGY_KJ) divided by the rung's output, so a
// bigger plant gets through its fuel faster and holds a bigger hopper. Turbine Upgrades, Fusion Cores and Dyson Cores scale
// every rung (T.genOutput is the base 8 kW and the rung multiplies it; T.genBuffer is the base hopper).
// ---------------------------------------------------------------------------------------------------
export const GEN_KINDS = [
  { key: 'portable', id: 'gen:portable', name: 'Portable Generator', short: 'Portable', mul: 0.25, hop: 1, ports: 2, scale: 0.62, glow: 5, price: 120, grow: 1.2, color: 0xb8801c },
  { key: 'std', id: 'gen', name: 'Generator', short: 'Generator', mul: 1, hop: 1, ports: 4, scale: 1, glow: 8, price: 350, grow: 1.35, color: 0x8a2a1c },
  { key: 'turbine', id: 'gen:turbine', name: 'Turbine Generator', short: 'Turbine', mul: 6, hop: 2, ports: 4, scale: 1.3, glow: 10, price: 24000, grow: 1.3, color: 0x2f5f86, bit: 1 },
  { key: 'plant', id: 'gen:plant', name: 'Power Plant', short: 'Plant', mul: 30, hop: 4, ports: 5, scale: 1.65, glow: 12, price: 320000, grow: 1.3, color: 0x4a5a3a, bit: 2 },
  { key: 'grid', id: 'gen:grid', name: 'Grid Power Station', short: 'Station', mul: 150, hop: 8, ports: 6, scale: 2.0, glow: 14, price: 3600000, grow: 1.3, color: 0x5a4a78, bit: 4 },
  { key: 'titan', id: 'gen:titan', name: 'Titan Plant', short: 'Titan', mul: 800, hop: 16, ports: 8, scale: 2.4, glow: 16, price: 40000000, grow: 1.3, color: 0x7a2f2f, bit: 8 },
];
export const BURN_S_AT_8KW = [270, 720, 1800, 4500];   // seconds one Common, Uncommon, Rare and Epic burns at 8 kW (power.js BURN_SECONDS says the same; a test compares them)
export const GEN_BY_KEY = Object.assign(Object.create(null), Object.fromEntries(GEN_KINDS.map((k) => [k.key, k])));   // no prototype: a key like __proto__ or constructor never resolves to a rung
export const GEN_STD = GEN_BY_KEY.std;
export const GEN_BY_ITEM = Object.assign(Object.create(null), Object.fromEntries(GEN_KINDS.map((k) => [k.id, k])));
export const GEN_KEYS = GEN_KINDS.filter((k) => k.key !== 'std').map((k) => k.key);   // the values `gk` may hold
// the rung of a generator tile (an unknown or missing gk is the ordinary Generator)
export const genKindOf = (t) => (t && t.gk !== undefined && GEN_BY_KEY[t.gk] && t.gk !== 'std' ? GEN_BY_KEY[t.gk] : GEN_STD);
// the bench / hotbar item a tile gives back (the ordinary Generator is plain 'gen')
export const genItemOf = (t) => genKindOf(t).id;
// the bit a kind needs in T.genKinds (portable and the ordinary Generator come with the Power Grid itself)
export const genUnlocked = (T, kind) => !kind.bit || (((T && T.genKinds) | 0) & kind.bit) !== 0;
// kW one generator of this rung puts out while it burns, and the plush its hopper holds
export const genKw = (T, t) => T.genOutput * genKindOf(t).mul;
export const genHopper = (T, t) => Math.max(1, Math.round(T.genBuffer * genKindOf(t).hop));
// bench price (before the K = 3 multiplier) of the next one of a rung when `owned` of that rung stand
export const genPrice = (kind, owned) => Math.round(kind.price * Math.pow(kind.grow, owned));
export const genOwned = (g, kind) => { let n = 0; for (const t of g.logi.tiles.values()) if (t.type === 'gen' && genKindOf(t) === kind) n++; return n; };
export const secText = (sec) => (sec >= 90 ? `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s` : sec >= 10 ? `${Math.round(sec)} s` : sec >= 1 ? `${sec.toFixed(1)} s` : sec >= 0.01 ? `${sec.toFixed(2)} s` : `${(sec * 1000).toFixed(1)} ms`);
export const kwText = (kw) => (kw >= 1e6 ? (kw / 1e6).toFixed(2) + ' GW' : kw >= 1000 ? (kw / 1000).toFixed(kw >= 1e5 ? 0 : 1) + ' MW' : (+kw).toFixed(1) + ' kW');

// extra bodywork on top of the one cell Generator model (logistics.js builds it): a tint, a scale, a handle for the portable one,
// stacks and a drum for the plants. Purely visual: the tile is still one cell and the readout names the real numbers.
export function decorateGen(grp, ent, mats) {
  const k = genKindOf(ent); if (k === GEN_STD) return;
  const body = grp.getObjectByName('body'); if (body) body.material = new THREE.MeshStandardMaterial({ color: k.color, roughness: 0.5, metalness: 0.6 });
  const steel = mats && mats.steel, dark = mats && mats.dark;
  const add = (m) => { grp.add(m); return m; };
  if (k.key === 'portable') {
    const bar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 14, Math.PI), steel); bar.position.set(0, 0.55, 0); bar.rotation.z = 0; add(bar);
    const can = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.14), dark); can.position.set(-0.2, 0.62, 0.0); add(can);
  } else {
    const n = k.key === 'turbine' ? 1 : k.key === 'plant' ? 2 : k.key === 'grid' ? 3 : 4;
    for (let q = 0; q < n; q++) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.5 + q * 0.08, 8), steel); stack.position.set(-0.2 + q * 0.13, 0.95, 0.18); add(stack);
    }
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.46, 14), steel); drum.rotation.z = Math.PI / 2; drum.position.set(0, 0.64, -0.12); add(drum);
    if (k.key === 'grid' || k.key === 'titan') { const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.7, 12, 1, true), steel); tower.position.set(0.18, 0.95, -0.2); add(tower); }
    if (k.key === 'titan') { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 20), dark); ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; add(ring); }
  }
  grp.scale.setScalar(k.scale);
}
