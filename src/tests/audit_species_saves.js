// Audit of the species expansion, part 3: old saves. A save made before the special ids moved up (decoys 4090..4093, pad 4095, cache 4096, remains 4097, bulkhead 4098,
// The One 4099) holds those ids in the hands, the cart, belts, a hopper, a vault, loose plush, built cells and the Plushdex. The old save is made here from a REAL
// current save (real belts, vault, generator, cart, loose body and built cells), by turning every special id back into its old number, and must come back exactly as it
// was written and keep working in the game.
import * as pd from '../plushdata.js';
import { loadSaved, packDex, unpackDex } from '../state.js';
import { SAVE_KEY } from '../config.js';
import { makeBeltKit, UP_ALL } from './belts_lib.js';

const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((q) => [q, v[q]])) : v));
const b64 = (u) => { let s = ''; const a = new Uint8Array(u.buffer, u.byteOffset, u.byteLength); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };
const unb64 = (s) => { const t = atob(s), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; };
const OLD = (n) => (n >= pd.SPECIAL_MIN && n <= pd.SPECIAL_MAX ? n - pd.SPECIAL_MIN + pd.OLD_SPECIAL_MIN : n);   // the old number of a special id
const oldWalk = (o) => { if (Array.isArray(o)) return o.map(oldWalk); if (o && typeof o === 'object') { const r = {}; for (const k of Object.keys(o)) r[k in o && /^\d+$/.test(k) ? String(OLD(+k)) : k] = oldWalk(o[k]); return r; } return typeof o === 'number' ? OLD(o) : o; };

export default async function (ctx) {
  const { T, g, S, w, sim, tiles, toI, toK, cellX, cellZ, fresh } = ctx;
  const B = makeBeltKit(ctx);

  await T('species.audit.an-old-save-comes-back-exactly-with-every-special-in-every-container', async () => {
    B.setup(UP_ALL); const bad = []; const i0 = toI(-11), k0 = toK(0.3);
    const [d0, d1, d2, d3] = pd.DECOYS;
    const line = B.lay(1, 3, i0, k0, 0); line[1].items = [{ sp: d1, vr: 0, t: 0.4 }, { sp: 12, vr: 3, t: 0.8 }];
    const vault = B.vaultAt(i0 + 4, k0, 0); vault.stored = [{ sp: d2, vr: 1 }, { sp: 77, vr: 0 }];
    const gen = g.placeEntity('gen', { i: i0, j: 0, k: k0 + 6, dir: 0, rise: 0 }, { quiet: true, rebuild: false }); gen.q = [{ sp: d0, vr: 0 }]; gen.cur = { sp: d0, vr: 2 };
    S().carry = [{ sp: d3, vr: 0 }, { sp: pd.NEEDLE, vr: 64 }, { sp: 5, vr: 1 }];
    S().cart = { tier: 1, x: cellX(i0 + 8), y: 0, z: cellZ(k0 + 8), yaw: 0, mode: 'park', load: [{ sp: d3, vr: 1 }, { sp: 9, vr: 0 }] };
    S().dex = { 5: 3, 77: 1, [d1]: 2, [pd.NEEDLE]: 1 };
    const ci = i0 + 12; w().setCell(ci, 3, k0, pd.PAD, 2); w().setCell(ci + 1, 3, k0, pd.BULK, 5); w().setCell(ci + 2, 3, k0, pd.CACHE, 4); w().setCell(ci + 3, 3, k0, pd.REMAINS, 6);
    const n0 = sim().n; sim().spawn(d2, 3, cellX(i0 + 3), 2, cellZ(k0 + 3), 0, 0, 0, 2);
    const keep = localStorage.getItem(SAVE_KEY);
    try {
      g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) return 'g.save() failed';
      const cur = JSON.parse(localStorage.getItem(SAVE_KEY)); if (cur.sv !== 2) return 'the current save has no version: ' + cur.sv;
      const has = (re) => re.test(localStorage.getItem(SAVE_KEY));
      if (!has(/"sp":6000[0-3]/) || !has(/"sp":60009/)) return 'the save did not carry the special ids it was meant to';
      // the old save: every special back to its old number, the dex as the plain map it was, no version, the world cells re-encoded
      const old = oldWalk({ ...cur, S: { ...cur.S, dex: unpackDex(cur.S.dex) } }); delete old.sv;
      const sps = new Uint16Array(unb64(cur.diff.sps).buffer); const o2 = new Uint16Array(sps.length); for (let t = 0; t < sps.length; t++) o2[t] = OLD(sps[t]);
      old.diff = { ...cur.diff, sps: b64(o2) };
      if (!(o2.some((x, t) => x !== sps[t]))) bad.push('no special cell in the world edits');
      if (JSON.stringify(old).match(/"sp":6000\d/)) bad.push('a new special id is left in the old save');
      localStorage.setItem(SAVE_KEY, JSON.stringify(old));
      const d = loadSaved(); if (!d) return 'the old save did not load';
      if (d.sv !== 2) bad.push('version ' + d.sv);
      const want = { ...cur.S, dex: unpackDex(cur.S.dex) };
      if (canon(d.S) !== canon(want)) { const a = canon(d.S), b = canon(want); let q = 0; while (q < a.length && a[q] === b[q]) q++; bad.push('the state differs near: ...' + a.slice(Math.max(0, q - 60), q + 80) + ' | wanted ' + b.slice(Math.max(0, q - 60), q + 80)); }
      if (d.diff.sps !== cur.diff.sps || d.diff.n !== cur.diff.n) bad.push('the world cells did not come back');
      if (canon(d.loose) !== canon(cur.loose)) bad.push('the loose plush did not come back: ' + canon(d.loose).slice(0, 120));
      // and the game takes it
      g.loadWorld(d.S, d); g.noSave = true; g.mode = 'play';
      const b = tiles().filter((t) => t.type === 'belt' && t.items && t.items.some((x) => x.sp === d1)); if (b.length !== 1) bad.push('the belt plush is not on the live belt: ' + b.length);
      const vs = tiles().find((t) => t.type === 'vault'); if (!vs || !vs.stored.some((x) => x.sp === d2)) bad.push('the vault lost its decoy');
      const gg = tiles().find((t) => t.type === 'gen'); if (!gg || !gg.q.some((x) => x.sp === d0) || !gg.cur || gg.cur.sp !== d0) bad.push('the generator hopper lost its decoy');
      if (!S().carry.some((x) => x.sp === pd.NEEDLE) || !S().carry.some((x) => x.sp === d3)) bad.push('the hands lost The One or a decoy');
      if (!S().cart || !S().cart.load.some((x) => x.sp === d3)) bad.push('the cart lost its decoy');
      for (const [dx, id] of [[0, pd.PAD], [1, pd.BULK], [2, pd.CACHE], [3, pd.REMAINS]]) if (w().get(ci + dx, 3, k0) !== id) bad.push(`world cell ${dx} is ${w().get(ci + dx, 3, k0)}, wanted ${id}`);
      if (!(S().dex[pd.NEEDLE] === 1 && S().dex[d1] === 2 && S().dex[5] === 3 && S().dex[OLD(pd.NEEDLE)] === undefined)) bad.push('the Plushdex: ' + JSON.stringify(S().dex));
      if (pd.dexTally(S().dex, true).n !== 2) bad.push('the Plushdex counts ' + pd.dexTally(S().dex, true).n + ' regular species, wanted 2');
    } finally {
      if (keep === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, keep);
      for (let dx = 0; dx < 4; dx++) w().setCell(i0 + 12 + dx, 3, k0, 0, 0);
      while (sim().n > n0) sim().remove(sim().n - 1);
      B.cleanup(); fresh({}); S().dex = {};   // (fresh takes the belts, the vault and the generator off the bay again)
    }
    void packDex; void d1;
    return bad.length === 0 || bad.slice(0, 4).join('; ');
  });

  // a number that only looks like an old special must stay: the walk shifts species ids, not every number in the state
  await T('species.audit.old-save-migration-leaves-other-numbers-alone', async () => {
    fresh({});
    const p0 = { v: 1, dim: ctx.cfg.NX, loose: [], needle: { i: 1, j: 2, k: 3 }, diff: { n: 0, ids: '', sps: '', vrs: '' },
      S: { dex: {}, carry: [], stats: { rar: [4095, 4096, 4097, 0, 0, 0, 0], plush: 4098, walked: 4099 }, notes: [{ id: 4095, n: 4096 }], entities: [{ id: 4096, type: 'belt', i: 4097, k: 4098, dir: 1, items: [{ sp: 4091, vr: 4095, t: 0.5 }], payload: [4095, 4096], target: 0 }, { id: 4095, type: 'fan', hash: [4090, 4091] }], contracts: [{ id: 4099, kind: 'rarity', r: 4, need: 4096, have: 4095 }], items: { strut: 4095 }, clues: [4096], nextId: 4100 } };
    const keep = localStorage.getItem(SAVE_KEY);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(p0)); const d = loadSaved(); if (!d) return 'did not load';
      const s = d.S, e = s.entities, bad = [];
      if (s.stats.rar.slice(0, 3).join() !== '4095,4096,4097' || s.stats.plush !== 4098 || s.stats.walked !== 4099) bad.push('stats ' + JSON.stringify(s.stats));
      if (s.notes[0].id !== 4095 || s.notes[0].n !== 4096) bad.push('notes ' + JSON.stringify(s.notes));
      if (e[0].id !== 4096 || e[0].i !== 4097 || e[0].k !== 4098 || e[0].items[0].vr !== 4095 || e[0].items[0].sp !== pd.DECOYS[1]) bad.push('belt ' + JSON.stringify(e[0]));
      if (e[0].payload.join() !== '4095,4096') bad.push('an array named payload was taken for a hopper: ' + e[0].payload);
      if (e[1].id !== 4095 || e[1].hash.join() !== '4090,4091') bad.push('fan ' + JSON.stringify(e[1]));
      const c = s.contracts[0]; if (c.id !== 4099 || c.need !== 4096 || c.have !== 4095) bad.push('contract ' + JSON.stringify(c));
      if (s.items.strut !== 4095 || s.clues[0] !== 4096 || s.nextId !== 4100) bad.push('items, clues or nextId moved');
      return bad.length === 0 || bad.join('; ');
    } finally { if (keep === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, keep); }
  });
}
