// The species table after the jump from 1,628 to 6,000+: count, unique names and icons, the old ids that must never change, the special ids that moved to 60000+,
// the rarity shares of the new species and the way the Razzo, The One, the decoys, caches, bulkheads and remains still work.
import * as pd from '../plushdata.js';
import { saveGame, loadSaved, packDex, unpackDex, migrateSpecials } from '../state.js';
import { SAVE_KEY } from '../config.js';

const DASH = /[—–]/;
// a fingerprint of ids 1..1628 (id, shape, color, rarity, name, volatile) taken from the build that had exactly 1,628 species: it must never change
const LEGACY_FP = 199385815;
const fp = () => { let h = 2166136261 >>> 0; for (let id = 1; id <= 1628; id++) { const s = pd.species[id]; const str = `${id}|${s.arch}|${s.pal}|${s.rarity}|${s.name}|${s.volatile ? 1 : 0};`; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } } return h; };

export default async function (ctx) {
  const { T, g, S, w, p, sim, fresh, adv, newWorld, spot, cellX, cellZ, toI, toK } = ctx;
  const { species, speciesCount, ARCH_COUNT, PAL_COUNT, PATTERNS, RARITY } = pd;

  await T('species.count-is-at-least-6000-and-the-table-is-dense', async () => {
    if (speciesCount < 6000) return 'count ' + speciesCount;
    for (let id = 1; id <= speciesCount; id++) { const s = species[id]; if (!s || s.id !== id) return 'hole or wrong id at ' + id; }
    if (species[speciesCount + 1] || species[0]) return 'a species outside 1..count';
    if (!(speciesCount < pd.SPECIAL_MIN)) return 'species reach the special range';
    if (species.length !== pd.SPECIAL_MAX + 1) return 'the array is not dense up to the specials: ' + species.length;
    return pd.PATTERNS.length === 4 && pd.REGIONS.length === 6;
  });

  await T('species.names-are-unique-real-and-in-the-existing-style', async () => {
    const names = new Set(), bad = [];
    for (let id = 1; id <= speciesCount; id++) {
      const s = species[id];
      if (names.has(s.name)) bad.push('dup name ' + s.name); names.add(s.name);
      if (s.name !== `${pd.PREFIXES[s.pal]} ${pd.ARCH_NAMES[s.arch]}${s.pat ? ' ' + PATTERNS[s.pat] : ''}`) bad.push('name ' + id + ' ' + s.name);
      if (!s.name.trim() || DASH.test(s.name) || /undefined|NaN|null/.test(s.name)) bad.push('bad name ' + id);
      if (s.name.length > 40) bad.push('long name ' + s.name);
      if (!Number.isInteger(s.arch) || s.arch < 0 || s.arch >= ARCH_COUNT || !Number.isInteger(s.pal) || s.pal < 0 || s.pal >= PAL_COUNT || !(s.pat >= 0 && s.pat < PATTERNS.length)) bad.push('fields ' + id);
    }
    if (pd.ARCH_NAMES.length !== ARCH_COUNT || pd.PREFIXES.length !== PAL_COUNT || pd.PALETTES.length !== PAL_COUNT) bad.push('table lengths');
    for (const list of [pd.ARCH_NAMES, pd.PREFIXES, pd.PALETTES.map((x) => x[0])]) if (new Set(list).size !== list.length) bad.push('a repeated name part');
    const hex = new Set(pd.PALETTES.map((x) => x[1])); if (hex.size !== PAL_COUNT) bad.push('two palettes with the same color');
    return bad.length === 0 || bad.slice(0, 4).join('; ');
  });

  await T('species.every-species-has-its-own-look-so-every-icon-is-unique', async () => {
    const looks = new Set(); for (let id = 1; id <= speciesCount; id++) { const s = species[id]; const k = (s.arch * 64 + s.pal) * 4 + s.pat; if (looks.has(k)) return 'two species share a look: ' + s.name; looks.add(k); }
    // and the pictures really differ: render a spread of 360 species (every shape in several colors and all three patterns) and compare the images
    const { speciesIcon } = await import('../icons.js'); const urls = new Map(), bad = [];
    const ids = []; for (let id = 1; id <= speciesCount; id += 19) ids.push(id);
    for (let a = 0; a < ARCH_COUNT; a++) for (let pat = 1; pat <= 3; pat++) { const id = species.findIndex((s) => s && s.arch === a && s.pat === pat); if (id > 0) ids.push(id); }
    for (const id of [...new Set(ids)]) { const u = speciesIcon(id); if (!u || u.length < 400) { bad.push('blank ' + species[id].name); continue; } if (urls.has(u)) bad.push(species[id].name + ' looks like ' + species[urls.get(u)].name); urls.set(u, id); }
    return bad.length === 0 || bad.slice(0, 4).join('; ') + ` (${bad.length} of ${urls.size})`;
  });

  await T('species.patterned-icons-differ-from-the-plain-species', async () => {
    const { speciesIcon } = await import('../icons.js'); const bad = [];
    for (let pat = 1; pat <= 3; pat++) {
      const id = species.findIndex((s) => s && s.pat === pat && s.arch > 3 && s.arch < 30); if (id < 1) { bad.push('no pattern ' + pat); continue; }
      const plain = species.findIndex((s) => s && s.pat === 0 && s.arch === species[id].arch && s.pal === species[id].pal);
      if (speciesIcon(id) === speciesIcon(plain)) bad.push(species[id].name + ' draws like ' + species[plain].name);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('species.ids-1-to-1628-never-changed', async () => {
    if (fp() !== LEGACY_FP) return 'the fingerprint of ids 1..1628 changed: ' + fp();
    for (let id = 1; id <= 1628; id++) { const s = species[id]; if (s.pat !== 0 || s.lo !== 0 || s.hi !== pd.REGION_COUNT - 1 || !s.legacy) return 'original ' + id + ' has pattern or region fields'; }
    const c = [0, 0, 0, 0, 0, 0]; for (let id = 1; id <= 1628; id++) c[species[id].rarity]++;
    if (c.join() !== '741,453,255,123,39,17') return 'originals by rarity ' + c;
    if (species[1].name !== 'Gnocchi Bean' || species[960].name !== 'Amaretto Pomodoro' || species[1628].name !== 'Radicchio Tricheco') return 'names moved';
    return true;
  });

  await T('species.new-species-have-the-same-rarity-shares-as-the-old-ones', async () => {
    const want = [262, 160, 90, 44, 14, 6].map((x) => x / 576), bad = [];
    for (let b = 0; b < pd.REGION_COUNT; b++) {
      const c = [0, 0, 0, 0, 0, 0]; let n = 0; for (let id = 1629; id <= speciesCount; id++) if (species[id].lo === b) { c[species[id].rarity]++; n++; }
      for (let r = 0; r < 6; r++) if (Math.abs(c[r] - n * want[r]) > 1.01) bad.push(`region ${b} rarity ${r}: ${c[r]} of ${n}`);
      for (let r = 0; r < 6; r++) if (pd.regional[b][r].length < 3) bad.push(`region ${b} has only ${pd.regional[b][r].length} species of rarity ${r}`);
    }
    return bad.length === 0 || bad.slice(0, 4).join('; ');
  });

  await T('species.shape-color-and-pattern-counts-add-up', async () => {
    const plain = new Map(); for (let id = 1; id <= speciesCount; id++) { const s = species[id]; if (!s.pat) plain.set(s.arch, (plain.get(s.arch) || 0) + 1); }
    for (let a = 48; a < ARCH_COUNT; a++) if (plain.get(a) !== PAL_COUNT) return `shape ${a} has ${plain.get(a)} plain colors, wanted ${PAL_COUNT}`;
    for (let id = 1629; id <= speciesCount; id++) if (species[id].arch === 31) return 'a new Razzo ' + id;
    const pats = [0, 0, 0, 0]; for (let id = 1; id <= speciesCount; id++) pats[species[id].pat]++;
    if (pats[1] < 400 || pats[2] < 400 || pats[3] < 400) return 'few patterned species ' + pats;
    return pd.ARCH_COUNT >= 90 && pd.PAL_COUNT >= 48;
  });

  await T('species.special-ids-moved-up-and-every-user-goes-through-the-constants', async () => {
    const sp = [pd.NEEDLE, pd.BULK, pd.REMAINS, pd.CACHE, pd.PAD, ...pd.DECOYS];
    if (new Set(sp).size !== sp.length) return 'duplicate special ids';
    for (const id of sp) { if (!(id >= pd.SPECIAL_MIN && id <= pd.SPECIAL_MAX && id < 65535)) return 'bad special id ' + id; const s = species[id]; if (!s || s.id !== id || !s.name || DASH.test(s.name)) return 'special species missing ' + id; }
    if (pd.SPECIAL_MIN < 20000) return 'specials not high enough: ' + pd.SPECIAL_MIN;
    if (!(pd.isSpecialCell(pd.BULK) && pd.isSpecialCell(pd.REMAINS) && pd.isSpecialCell(pd.CACHE) && pd.isSpecialCell(pd.PAD)) || pd.isSpecialCell(pd.NEEDLE) || pd.isSpecialCell(5000) || pd.isSpecialCell(4095) || pd.isSpecialCell(4098)) return 'isSpecialCell';
    // the old ids are plain species now
    for (const id of [4090, 4095, 4096, 4097, 4098, 4099]) if (!species[id] || species[id].decoy || species[id].arch >= ARCH_COUNT) return 'old special id ' + id + ' is not a normal species';
    if (pd.DECOYS.some((d, n) => d !== pd.DECOYS[0] + n) || !pd.DECOYS.every((d) => pd.pools[5].includes(d))) return 'decoys';
    return true;
  });

  await T('species.the-one-hides-in-the-world-and-is-never-a-regular-pick', async () => {
    await newWorld(); fresh({});
    const n = w().needle; const col = w().col(n.i >> 4, n.k >> 4); void col;
    if (w().get(n.i, n.j, n.k) !== pd.NEEDLE) return 'The One is not in its cell: ' + w().get(n.i, n.j, n.k);
    let h = 0x1357, bad = 0; for (let q = 0; q < 300000; q++) { h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; const h2 = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; const sp = pd.pickSpecies(h >>> 4, h2, false, q % 6); if (sp === pd.NEEDLE || sp === pd.BULK || sp === pd.CACHE || sp === pd.REMAINS || sp === pd.PAD) bad++; }
    S().dex = {}; g.registerDex(pd.NEEDLE); const logged = S().dex[pd.NEEDLE] === 1; const count = pd.dexTally(S().dex, true).n; S().dex = {};
    return (bad === 0 && logged && count === 0) || `special picks ${bad}, logged ${logged}, counted ${count}`;
  });

  await T('species.decoys-are-still-mythic-fakes-picked-now-and-then', async () => {
    let h = 0x2468, hit = new Set(); for (let q = 0; q < 2000000 && hit.size < 4; q++) { h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; const h2 = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; const sp = pd.pickSpecies(h >>> 4, h2, true, 0); if (species[sp].decoy) hit.add(sp); }
    for (const d of pd.DECOYS) { const s = species[d]; if (!s.decoy || s.rarity !== 5 || !s.hex) return 'decoy ' + d; }
    return hit.size >= 3 || 'only ' + hit.size + ' of the four decoys turned up in 2 million vein picks';
  });

  await T('species.caches-bulkheads-and-remains-keep-working-at-their-new-ids', async () => {
    await newWorld(); fresh({}); const bad = [];
    const rm = w().remainsNear(0, 0, 2500); if (!rm) bad.push('no remains found near the bay'); else if (w().get(rm.i, 0, rm.k) !== pd.REMAINS) bad.push('remains cell is ' + w().get(rm.i, 0, rm.k));
    // a cache is a world cell that opens for a stash and is gone afterwards
    const { i, k } = spot(); const ci = i + 10, cj = 3, ck = k + 4; w().setCell(ci, cj, ck, pd.CACHE, 3); if (w().get(ci, cj, ck) !== pd.CACHE) bad.push('cache not set');
    const t = g.targetInfo({ type: 'cell', sp: pd.CACHE, vr: 3, i: ci, j: cj, k: ck }); if (!/open/.test(t.value) || t.name !== 'Supply Cache') bad.push('cache target ' + JSON.stringify(t));
    const was = S().stats.caches || 0; g.openCache(ci, cj, ck); if (w().get(ci, cj, ck) !== 0 || (S().stats.caches || 0) !== was + 1) bad.push('the cache did not open');
    // bulkhead: a loose one is a solid cell that comes back as the item
    const bi = i + 11; w().setCell(bi, cj, ck, pd.BULK, 5); S().carry = []; const b0 = S().items.bulk || 0; const got = g.collect({ type: 'cell', i: bi, j: cj, k: ck, sp: pd.BULK, vr: 5 }); if (!got || w().get(bi, cj, ck) !== 0 || (S().items.bulk || 0) !== b0 + 1 || S().carry.length) bad.push('taking a loose bulkhead: ' + got + ' ' + (S().items.bulk || 0)); w().setCell(bi, cj, ck, 0, 0); S().items.bulk = b0;
    // remains: the target text and the cell stay
    const rt = g.targetInfo({ type: 'cell', sp: pd.REMAINS, vr: 0, i: ci, j: cj, k: ck }); if (!/search/.test(rt.value)) bad.push('remains target ' + rt.value);
    return bad.length === 0 || bad.join('; ');
  });

  await T('species.razzo-odds-and-pool-did-not-move', async () => {
    if (pd.volatilePool.length !== 20 || pd.volatilePool.some((id) => species[id].arch !== 31 || id > 960)) return 'razzo pool changed';
    let h = 0x9e3779b9, hits = 0; const N = 2000000;
    for (let n = 0; n < N; n++) { h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; const h2 = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; const sp = pd.pickSpecies(h, h2 ^ (n * 2654435761), false, n % 6); if (species[sp].volatile) hits++; }
    const per = N / Math.max(1, hits); return (hits > 0 && per > 30000 && per < 120000) || `one razzo per ${per.toFixed(0)} plush`;
  });

  await T('species.band-0-keeps-nearly-every-old-pick-and-the-rarity-odds', async () => {
    const hist = [0, 0, 0, 0, 0, 0]; let h = 0x777, tot = 0;
    for (let n = 0; n < 400000; n++) { h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; const h2 = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; const sp = pd.pickSpecies(h >>> 4, h2, false, 0); const s = species[sp]; if (s.volatile) continue; hist[s.rarity]++; tot++; }
    const bad = []; RARITY.slice(0, 6).forEach((r, i) => { const got = hist[i] / tot; if (Math.abs(got - r.weight) > Math.max(0.004, r.weight * 0.2)) bad.push(`${r.name} ${got.toFixed(4)} vs ${r.weight}`); });
    return bad.length === 0 || bad.join('; ');
  });

  await T('species.dex-saves-compactly-and-round-trips', async () => {
    const dex = {}; let h = 0xbeef; for (let id = 1; id <= speciesCount; id++) { h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; if (h % 10 < 9) dex[id] = 1 + (h >>> 8) % (h % 50 === 0 ? 70000 : 30); }
    dex[pd.NEEDLE] = 1; dex[pd.DECOYS[2]] = 4;
    const plain = JSON.stringify(dex).length, packed = packDex(dex); const back = unpackDex(packed);
    const keys = Object.keys(dex); if (Object.keys(back).length !== keys.length || keys.some((k) => back[k] !== dex[k])) return 'the dex did not round trip';
    if (packed.length * 3 > plain) return `packed ${packed.length} bytes vs ${plain} as JSON: not compact`;
    if (packed.length > 30000) return 'a full dex takes ' + packed.length + ' bytes';
    if (Object.keys(unpackDex('')).length || Object.keys(unpackDex('x1:')).length || Object.keys(unpackDex(null)).length) return 'bad input is not empty';
    // through a real save
    fresh({}); const keep = localStorage.getItem(SAVE_KEY); S().dex = dex; let ok = false, size = 0;
    try { ok = saveGame(S(), w(), sim()); const raw = localStorage.getItem(SAVE_KEY); size = raw.length; const d = loadSaved(); if (!ok || !d) return 'save failed'; const dd = d.S.dex; if (Object.keys(dd).length !== keys.length || keys.some((k) => dd[k] !== dex[k])) return 'the dex changed through a save'; if (d.sv !== 2) return 'save version ' + d.sv; }
    finally { S().dex = {}; if (keep === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, keep); }
    return size > 0 || 'no save';
  });

  await T('species.old-saves-load-and-their-special-ids-move', async () => {
    const OLD = { decoy: 4091, pad: 4095, cache: 4096, remains: 4097, bulk: 4098, one: 4099 };
    const b64 = (u) => { let s = ''; const a = new Uint8Array(u.buffer, u.byteOffset, u.byteLength); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };
    const sps = new Uint16Array([OLD.pad, OLD.bulk, 77, OLD.one, 1900]), ids = new Float64Array([1, 2, 3, 4, 5]), vrs = new Uint8Array(5);
    const p0 = { v: 1, dim: ctx.cfg.NX, loose: [[OLD.one, 0, 1, 2, 3], [5, 0, 1, 2, 3]], needle: { i: 1, j: 2, k: 3 }, diff: { n: 5, ids: b64(ids), sps: b64(sps), vrs: b64(vrs) },
      S: { dex: { 5: 2, [OLD.one]: 1, [OLD.decoy]: 3 }, carry: [{ sp: OLD.one, vr: 0 }, { sp: 12, vr: 1 }], entities: [{ type: 'truck', cargo: [3, 0, OLD.one, 64] }, { type: 'vault', stored: [{ sp: OLD.decoy, vr: 0 }] }, { type: 'sorter', rules: [{ k: 'species', v: OLD.decoy, w: 0 }] }, { type: 'silo', cargo: { [OLD.decoy]: 2, 7: 1 } }], contracts: [{ kind: 'species', sp: 33 }] } };
    const keep = localStorage.getItem(SAVE_KEY);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(p0)); const d = loadSaved(); if (!d) return 'the old save did not load';
      const sp2 = new Uint16Array(Uint8Array.from(atob(d.diff.sps), (c) => c.charCodeAt(0)).buffer);
      if (sp2.join() !== [pd.PAD, pd.BULK, 77, pd.NEEDLE, 1900].join()) return 'world cells ' + sp2.join();
      if (d.loose[0][0] !== pd.NEEDLE || d.loose[1][0] !== 5) return 'loose plush ' + JSON.stringify(d.loose);
      const S2 = d.S; if (S2.dex[pd.NEEDLE] !== 1 || S2.dex[pd.DECOYS[1]] !== 3 || S2.dex[5] !== 2 || S2.dex[OLD.one] !== undefined) return 'dex ' + JSON.stringify(S2.dex);
      if (S2.carry[0].sp !== pd.NEEDLE || S2.carry[1].sp !== 12) return 'carry ' + JSON.stringify(S2.carry);
      const e = S2.entities; if (e[0].cargo.join() !== [3, 0, pd.NEEDLE, 64].join() || e[1].stored[0].sp !== pd.DECOYS[1] || e[2].rules[0].v !== pd.DECOYS[1] || e[3].cargo[pd.DECOYS[1]] !== 2 || e[3].cargo[7] !== 1 || S2.contracts[0].sp !== 33) return 'entities ' + JSON.stringify(e);
      if (d.sv !== 2) return 'save version ' + d.sv;
      const again = JSON.stringify(migrateSpecials(JSON.parse(JSON.stringify(d)))); void again;
    } finally { if (keep === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, keep); }
    return true;
  });

  await T('species.typed-arrays-and-instance-data-hold-the-biggest-ids', async () => {
    fresh({}); const big = speciesCount, bad = [];
    const { i, k } = spot(); const ci = i + 14, cj = 2, ck = k + 5; w().setCell(ci, cj, ck, big, 9); if (w().get(ci, cj, ck) !== big || w().getVr(ci, cj, ck) !== 9) bad.push('world cell');
    const n0 = sim().n; const id = sim().spawn(big, 3, cellX(i), 3, cellZ(k) - 4, 0, 0, 0); if (sim().sp[id] !== big) bad.push('sim body ' + sim().sp[id]); while (sim().n > n0) sim().remove(sim().n - 1);
    const r = g.renderer; r.beginDynamic(); r.addDynamic(big, 3, 0, 1, 0, 0, 0, 0, 1, 1); r.endDynamic(); const a = species[big].arch; if (r.dynCount[a] < 1) bad.push('dynamic instance');
    // a patterned species puts its pattern in the whole part of the seed; a plain one never does
    const pat = species.findIndex((s) => s && s.pat === 2); r.beginDynamic(); r.addDynamic(pat, 3, 0, 1, 0, 0, 0, 0, 1, 1); r.endDynamic(); const aa = r.dyn[species[pat].arch].geometry.attributes.aData.array; if (Math.floor(aa[3]) !== 2) bad.push('pattern in aData ' + aa[3]);
    r.beginDynamic(); r.addDynamic(big > 0 && species[big].pat === 0 ? big : 1, 255, 0, 1, 0, 0, 0, 0, 1, 1); r.endDynamic(); const plainArch = species[species[big].pat === 0 ? big : 1].arch; if (Math.floor(r.dyn[plainArch].geometry.attributes.aData.array[3]) !== 0) bad.push('a plain species got a pattern');
    w().setCell(ci, cj, ck, 0, 0);
    return bad.length === 0 || bad.join('; ');
  });
}
