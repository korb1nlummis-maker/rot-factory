import { SAVE_KEY, NX, NZ } from './config.js';

export function newState(seed) {
  return {
    seed,
    money: 0,
    totalEarned: 0,
    up: {},
    ach: {},
    dex: {},
    entities: [],
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
    notes: [],
    contracts: [],
    items: {},
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

export function saveGame(S, world, sim) {
  try {
    const n = world.diffCount;
    const ids = new Float64Array(n), sps = new Uint16Array(n), vrs = new Uint8Array(n);
    let t = 0;
    world.forEachDiff((id, sp, vr) => { if (t < n) { ids[t] = id; sps[t] = sp; vrs[t] = vr; t++; } });
    const loose = [];
    if (sim) for (let i = 0; i < sim.n; i++) loose.push([sim.sp[i], sim.vr[i], +sim.x[i].toFixed(2), +sim.y[i].toFixed(2), +sim.z[i].toFixed(2)]);
    const payload = { v: 1, loose, S, diff: { n, ids: b64(ids), sps: b64(sps), vrs: b64(vrs) }, needle: world.needle };
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
    if (p.v !== 1) return null;
    return p;
  } catch (e) { return null; }
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
