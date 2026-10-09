import { SAVE_KEY, NX, NZ } from './config.js';
import { OLD_SPECIAL_MIN, SPECIAL_SHIFT } from './plushdata.js';

export const SPECIES_VER = 2;   // 2: the special ids (decoys, cache, remains, bulkhead, pad, The One) live at SPECIAL_MIN (60000) and the Plushdex is stored packed

export function newState(seed) {
  return {
    seed,
    money: 0,
    totalEarned: 0,
    up: {},
    ach: {},
    dex: {},
    entities: [],
    cables: [],    // hand-wired power cables: { id, a, b } with entity ids
    carry: [],
    ending: null,
    player: null,
    nextId: 1,
    created: Date.now(),
    stats: {
      plush: 0, thrown: 0, sold: 0, bestStreak: 0, bestSwish: 0, cells: 0, props: 0, lanterns: 0, rigs: 0, borers: 0,
      creaks: 0, collapses: 0, buried: 0, maxDepth: 0, maxHeight: 0, upgrades: 0, shiny: 0, playSecs: 0, walked: 0,
      noPropDeep: false, rar: [0, 0, 0, 0, 0, 0, 0],
    },
    settings: { quality: 'high', vol: 0.7, sens: 1 },
    boosts: { sell: 0, dig: 0, digMul: 1, carry: 0, stab: 0, scan: 0 },
    notes: [],      // the worker notes read (S.notes), the other papers read (S.papers), the clues a partner read (S.heard) and what a bot or machine flagged (S.nflags): src/notebook.js
    papers: [],
    heard: [],
    nflags: [],
    contracts: [],
    items: {},
    mats: {},
    hotbar: ['hammer', null, null, null, null, null, null, null, null],
    gear: { helmet: 1 },
    gameMin: 0,
    name: '',
    cart: null,
    gcart: null,   // the co-op guest's cart, kept with the host's world (S.hcart on a guest is only a view of the host's cart)
    clues: [],
    clueLevel: 0,
  };
}

function b64(buf) {
  const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
function unb64(str) {
  const s = atob(str);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

// The Plushdex is a map of species id -> times seen. With 6,000+ species a JSON object costs about 10 bytes an entry, so a save packs it: the ids sorted, each as the gap
// from the one before, and each count, as 7 bit varints (about 2 bytes an entry), in base64. The live S.dex stays a plain object; old saves hold the plain object and load as is.
export function packDex(dex) {
  const ids = Object.keys(dex).map(Number).filter((n) => Number.isInteger(n) && n >= 0).sort((a, b) => a - b);
  const bytes = [];
  const vi = (n) => { n = Math.max(0, Math.floor(n)); while (n >= 128) { bytes.push((n % 128) | 128); n = Math.floor(n / 128); } bytes.push(n); };
  let prev = 0;
  for (const id of ids) { vi(id - prev); prev = id; vi(dex[id] || 0); }
  return 'x1:' + b64(new Uint8Array(bytes));
}
export function unpackDex(str) {
  const out = {};
  if (typeof str !== 'string' || !str.startsWith('x1:')) return out;
  const u = unb64(str.slice(3));
  let p = 0;
  const vi = () => { let n = 0, m = 1; for (;;) { const b = u[p++]; if (b === undefined) return -1; n += (b & 127) * m; if (b < 128) return n; m *= 128; } };
  let id = 0;
  while (p < u.length) { const gap = vi(); const c = vi(); if (gap < 0 || c < 0) break; id += gap; out[id] = c; }
  return out;
}

export function saveGame(S, world, sim) {
  try {
    const n = world.diffCount;
    const ids = new Float64Array(n), sps = new Uint16Array(n), vrs = new Uint8Array(n);
    let t = 0;
    world.forEachDiff((id, sp, vr) => { if (t < n) { ids[t] = id; sps[t] = sp; vrs[t] = vr; t++; } });
    const loose = [];
    if (sim) for (let i = 0; i < sim.n; i++) loose.push([sim.sp[i], sim.vr[i], +sim.x[i].toFixed(2), +sim.y[i].toFixed(2), +sim.z[i].toFixed(2)]);
    const payload = { v: 1, sv: SPECIES_VER, dim: NX, loose, S: Object.assign({}, S, { dex: packDex(S.dex || {}) }), diff: { n, ids: b64(ids), sps: b64(sps), vrs: b64(vrs) }, needle: world.needle };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p.v !== 1 || p.dim !== NX) return null; // saves from other world sizes cannot be loaded
    if (p.S && typeof p.S.dex === 'string') p.S.dex = unpackDex(p.S.dex);
    if (p.sv !== SPECIES_VER) migrateSpecials(p);   // saves from before the special ids moved up
    return p;
  } catch (e) { return null; }
}

// Saves made before the specials moved (decoys 4090..4093, pad 4095, cache 4096, remains 4097, bulkhead 4098, The One 4099) carry the old ids in the world edits, the loose
// plush, the Plushdex and the machines' contents. Every one of them is shifted to its new id once, on load.
const oldSpecial = (n) => Number.isInteger(n) && n >= OLD_SPECIAL_MIN && n <= OLD_SPECIAL_MIN + 9;
const FLAT = /^(cargo|hopper|hop|load)$/;   // the flat [species, variant, species, variant ...] lists of the diggers, trucks and docks (an array that only has such a word at the end of its name is not one)
function shiftWalk(o, key, depth) {
  if (!o || typeof o !== 'object' || depth > 14) return;
  if (Array.isArray(o)) {
    if (FLAT.test(key) && o.length && typeof o[0] === 'number') { for (let q = 0; q < o.length; q += 2) if (oldSpecial(o[q])) o[q] += SPECIAL_SHIFT; return; }
    for (const x of o) shiftWalk(x, '', depth + 1);
    return;
  }
  for (const k of Object.keys(o)) {
    const v = o[k];
    if ((k === 'sp' || k === 'target' || k === 'filter' || k === 'cur') && oldSpecial(v)) o[k] = v + SPECIAL_SHIFT;
    else if (k === 'v' && o.k === 'species' && oldSpecial(v)) o[k] = v + SPECIAL_SHIFT;
    else if (k === 'cargo' && v && typeof v === 'object' && !Array.isArray(v)) {   // a furnishing's contents: species id -> count
      for (const q of Object.keys(v)) if (oldSpecial(+q)) { v[+q + SPECIAL_SHIFT] = v[q]; delete v[q]; }
    } else shiftWalk(v, k, depth + 1);
  }
}
export function migrateSpecials(p) {
  try {
    if (p.diff && p.diff.n) {
      const sps = new Uint16Array(unb64(p.diff.sps).buffer);
      let hit = false;
      for (let t = 0; t < p.diff.n; t++) if (oldSpecial(sps[t])) { sps[t] += SPECIAL_SHIFT; hit = true; }
      if (hit) p.diff.sps = b64(sps);
    }
    if (p.loose) for (const row of p.loose) if (oldSpecial(row[0])) row[0] += SPECIAL_SHIFT;
    if (p.S) {
      const d = p.S.dex;
      if (d && typeof d === 'object') for (const q of Object.keys(d)) if (oldSpecial(+q)) { d[+q + SPECIAL_SHIFT] = d[q]; delete d[q]; }
      shiftWalk(p.S, '', 0);
    }
    p.sv = SPECIES_VER;
  } catch (e) { console.warn('save migration failed', e); }
  return p;
}

export function applyDiff(world, d) {
  if (!d || !d.n) return;
  const ids = new Float64Array(unb64(d.ids).buffer);
  const sps = new Uint16Array(unb64(d.sps).buffer);
  const vrs = unb64(d.vrs);
  for (let t = 0; t < d.n; t++) {
    const id = ids[t];
    const i = id % NX, k = Math.floor(id / NX) % NZ, j = Math.floor(id / (NX * NZ));
    world.restoreDiff(i, j, k, sps[t], vrs[t]);
  }
}

export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }

// One-time fresh start for every player. Bump WIPE_TOKEN to wipe all saved games again on the next load.
const WIPE_TOKEN = 'fresh-start-2026-10-09b';
try {
  if (localStorage.getItem('rotfactory.wipe') !== WIPE_TOKEN) { localStorage.removeItem(SAVE_KEY); localStorage.setItem('rotfactory.wipe', WIPE_TOKEN); }
} catch (e) { /* storage unavailable */ }
