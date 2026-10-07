import * as pd from '../plushdata.js';
import * as pg from '../plushgeo.js';
import { saveGame, loadSaved, applyDiff } from '../state.js';
import { SAVE_KEY } from '../config.js';

// [id, arch, pal, rarity] copied from the game before the 20 newest shapes and 4 newest colors were added. These never change.
const ORIGINAL = [[1,0,0,0],[18,17,0,0],[35,34,0,0],[36,35,0,0],[37,0,1,0],[48,11,1,0],[49,12,1,2],[52,15,1,1],[69,32,1,2],[86,13,2,1],[96,23,2,2],[103,30,2,0],[120,11,3,1],[137,28,3,2],[154,9,4,0],[171,26,4,0],[188,7,5,2],[205,24,5,0],[222,5,6,0],[239,22,6,1],[256,3,7,0],[273,20,7,0],[290,1,8,1],[307,18,8,2],[324,35,8,1],[341,16,9,1],[358,33,9,0],[375,14,10,1],[392,31,10,1],[409,12,11,2],[426,29,11,3],[443,10,12,2],[460,27,12,0],[477,8,13,0],[494,25,13,2],[511,6,14,3],[528,23,14,0],[545,4,15,0],[562,21,15,0],[576,35,15,2],[577,0,16,2],[578,1,16,3],[579,2,16,1],[596,19,16,5],[613,0,17,0],[630,17,17,0],[647,34,17,1],[664,15,18,0],[681,32,18,0],[698,13,19,0],[715,30,19,4],[720,35,19,1],[732,36,11,0],[749,37,8,1],[766,38,5,2],[768,38,7,1],[769,38,8,1],[783,39,2,0],[800,39,19,4],[817,40,16,0],[834,41,13,0],[851,42,10,1],[868,43,7,2],[885,44,4,1],[902,45,1,0],[919,45,18,3],[936,46,15,3],[953,47,12,1],[960,47,19,0]];
const GEN2_TOTAL = 960, GEN2_ARCH = 48, GEN2_PAL = 20, RAZZO = 31;
const DASH = /[—–]/;

export default async function (ctx) {
  const { T, g, S, w, p, sim, fresh, adv, newWorld, cellX, cellZ, spot } = ctx;
  const { species, pools, volatilePool, RARITY, ARCH_NAMES, PREFIXES, PALETTES, ARCH_COUNT, PAL_COUNT, speciesCount } = pd;

  await T('plush.variety-species-count-and-ids-are-complete', async () => {
    if (speciesCount < 6000) return `count ${speciesCount}, wanted at least 6000`;
    if (ARCH_COUNT - GEN2_ARCH < 16) return 'fewer than 16 new shapes';
    if (speciesCount - GEN2_TOTAL < 320) return 'fewer than 320 new species';
    if (speciesCount > 20000) return 'too many species: ' + speciesCount;
    const seen = new Set();
    for (let id = 1; id <= speciesCount; id++) { const s = species[id]; if (!s) return 'hole at ' + id; if (s.id !== id) return 'wrong id at ' + id; if (seen.has(id)) return 'dup id ' + id; seen.add(id); }
    if (species[speciesCount + 1]) return 'species past the end: ' + (speciesCount + 1);
    if (!(speciesCount < pd.SPECIAL_MIN)) return 'species reach the special ids';
    return true;
  });

  await T('plush.variety-every-species-has-name-shape-color-and-rarity', async () => {
    if (ARCH_NAMES.length !== ARCH_COUNT) return `ARCH_NAMES has ${ARCH_NAMES.length}, ARCH_COUNT ${ARCH_COUNT}`;
    if (PREFIXES.length !== PAL_COUNT || PALETTES.length !== PAL_COUNT) return `PREFIXES ${PREFIXES.length} PALETTES ${PALETTES.length} PAL_COUNT ${PAL_COUNT}`;
    for (const list of [ARCH_NAMES, PREFIXES, PALETTES.map((x) => x[0]), RARITY.map((x) => x.name)]) { for (const n of list) if (typeof n !== 'string' || !n.trim() || DASH.test(n)) return 'bad name part: ' + n; if (new Set(list).size !== list.length) return 'repeated name part'; }
    const names = new Set(), bad = [];
    for (let id = 1; id <= speciesCount; id++) {
      const s = species[id];
      if (!Number.isInteger(s.arch) || s.arch < 0 || s.arch >= ARCH_COUNT) bad.push('arch ' + id);
      else if (!Number.isInteger(s.pal) || s.pal < 0 || s.pal >= PAL_COUNT) bad.push('pal ' + id);
      else if (!Number.isInteger(s.rarity) || s.rarity < 0 || s.rarity > 5) bad.push('rarity ' + id);
      else if (s.name !== `${PREFIXES[s.pal]} ${ARCH_NAMES[s.arch]}${s.pat ? ' ' + pd.PATTERNS[s.pat] : ''}` || !s.name.trim() || DASH.test(s.name) || /undefined|NaN/.test(s.name)) bad.push('name ' + id + ' ' + s.name);
      if (names.has(s.name)) bad.push('dup name ' + s.name); names.add(s.name);
    }
    const combos = new Set(); for (let id = 1; id <= speciesCount; id++) { const k = (species[id].arch * 100 + species[id].pal) * 4 + species[id].pat; if (combos.has(k)) bad.push('dup arch+pal ' + id); combos.add(k); }
    return bad.length === 0 || bad.slice(0, 4).join('; ');
  });

  await T('plush.variety-every-new-shape-exists-in-every-color-and-none-is-volatile', async () => {
    for (let a = GEN2_ARCH; a < ARCH_COUNT; a++) { let n = 0; for (let id = 1; id <= speciesCount; id++) if (species[id].arch === a) { if (species[id].volatile) return 'volatile new shape ' + a; if (!species[id].pat) n++; } if (n !== PAL_COUNT) return `shape ${a} ${ARCH_NAMES[a]} has ${n} species, wanted ${PAL_COUNT}`; }
    for (let id = GEN2_TOTAL + 1; id <= speciesCount; id++) if (species[id].arch === RAZZO) return 'a new Razzo species appeared: ' + id;
    return true;
  });

  await T('plush.variety-original-ids-keep-shape-color-and-rarity', async () => {
    const bad = []; for (const [id, arch, pal, rarity] of ORIGINAL) { const s = species[id]; if (!s || s.arch !== arch || s.pal !== pal || s.rarity !== rarity) bad.push(id); }
    const c1 = [0, 0, 0, 0, 0, 0], c2 = [0, 0, 0, 0, 0, 0]; for (let id = 1; id <= 576; id++) c1[species[id].rarity]++; for (let id = 577; id <= GEN2_TOTAL; id++) c2[species[id].rarity]++;
    if (c1.join() !== '262,160,90,44,14,6' || c2.join() !== '175,107,60,29,9,4') return 'rarity counts moved ' + c1 + ' / ' + c2;
    if (species[1].name !== 'Gnocchi Bean' || species[576].name !== 'Affogato Lampadina' || species[960].name !== 'Amaretto Pomodoro') return 'names moved';
    return bad.length === 0 || 'changed ids: ' + bad.join();
  });

  await T('plush.variety-every-rarity-pool-has-species-in-plausible-proportion', async () => {
    const counts = pools.slice(0, 6).map((a) => a.length); if (counts.some((c) => c < 1)) return 'empty pool: ' + counts;
    const regular = counts.reduce((a, b) => a + b, 0) - pd.DECOYS.length; const sizes = [];
    for (let r = 0; r < 6; r++) { const n = counts[r] - (r === 5 ? pd.DECOYS.length : 0); sizes.push(n); const share = n / regular, old = [262, 160, 90, 44, 14, 6][r] / 576; if (Math.abs(share - old) > 0.02 && r < 4) return `rarity ${r} share ${share.toFixed(3)} vs old ${old.toFixed(3)}`; if (r >= 4 && (share > old * 2 || share < old / 2)) return `rarity ${r} share ${share.toFixed(4)} vs old ${old.toFixed(4)}`; }
    for (let r = 0; r < 5; r++) if (!(sizes[r] > sizes[r + 1])) return 'pools do not shrink with rarity: ' + sizes;
    for (const [from, to] of [[GEN2_TOTAL + 1, 1360], [1361, 1628]]) { const c = [0, 0, 0, 0, 0, 0]; for (let id = from; id <= to; id++) c[species[id].rarity]++; const n = to - from + 1; const oldShare = [262, 160, 90, 44, 14, 6]; for (let r = 0; r < 6; r++) if (Math.abs(c[r] / n - oldShare[r] / 576) > 0.012) return `ids ${from}-${to} rarity ${r}: ${c[r]} of ${n}`; }
    return true;
  });

  await T('plush.variety-pickspecies-keeps-the-rarity-odds-and-the-razzo-roll', async () => {
    const hist = [0, 0, 0, 0, 0, 0], N = 600000; let h = 0x1234567, vol = 0, newOnes = 0;
    for (let n = 0; n < N; n++) { h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; const h2 = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; const sp = pd.pickSpecies(h, h2 ^ (n * 2654435761), false); const s = species[sp]; if (!s) return 'unknown species ' + sp; if (s.volatile) { vol++; continue; } hist[s.rarity]++; if (sp > GEN2_TOTAL && sp <= speciesCount) newOnes++; }
    const tot = hist.reduce((a, b) => a + b, 0); const bad = [];
    RARITY.slice(0, 6).forEach((r, i) => { const got = hist[i] / tot; if (Math.abs(got - r.weight) > Math.max(0.004, r.weight * 0.2)) bad.push(`${r.name} ${got.toFixed(4)} vs ${r.weight}`); });
    if (bad.length) return bad.join('; ');
    if (newOnes / tot < 0.15) return 'new species barely appear: ' + (newOnes / tot).toFixed(3);
    if (volatilePool.length !== 20 || volatilePool.some((id) => species[id].arch !== RAZZO || id > GEN2_TOTAL)) return 'razzo pool changed';
    return (vol > 0) || 'no razzo in 600k picks';
  });

  await T('plush.variety-special-ids-and-constants-are-consistent', async () => {
    const sp = [pd.NEEDLE, pd.BULK, pd.REMAINS, pd.CACHE, ...pd.DECOYS];
    if (new Set(sp).size !== sp.length) return 'duplicate special ids';
    for (const id of sp) { if (!(id >= pd.SPECIAL_MIN && id > speciesCount && id < 65536)) return 'bad special id ' + id; const s = species[id]; if (!s || s.id !== id || !s.name) return 'special species missing ' + id; if (/[—–]/.test(s.name)) return 'dash in ' + s.name; }
    if (!(speciesCount < pd.SPECIAL_MIN)) return 'regular ids reach the specials';
    if (!(pd.isSpecialCell(pd.BULK) && pd.isSpecialCell(pd.REMAINS) && pd.isSpecialCell(pd.CACHE)) || pd.isSpecialCell(1) || pd.isSpecialCell(speciesCount) || pd.isSpecialCell(pd.NEEDLE)) return 'isSpecialCell';
    const a = (id) => species[id].arch;
    if (a(pd.NEEDLE) !== ARCH_COUNT || a(pd.BULK) !== ARCH_COUNT + 1 || a(pd.REMAINS) !== ARCH_COUNT + 2 || a(pd.CACHE) !== ARCH_COUNT + 7 || !pd.DECOYS.every((d, n) => a(d) === ARCH_COUNT + 3 + n)) return 'special archetype indices';
    if (pg.ARCH_NEEDLE !== ARCH_COUNT || pg.ARCH_BULK !== ARCH_COUNT + 1 || pg.ARCH_REMAINS !== ARCH_COUNT + 2 || pg.ARCH_DECOY0 !== ARCH_COUNT + 3 || pg.ARCH_CACHE !== ARCH_COUNT + 7) return 'plushgeo special indices';
    if (pd.DECOYS.some((d, n) => d !== pd.DECOYS[0] + n) || !pd.DECOYS.every((d) => pools[5].includes(d))) return 'decoys';
    const b = Math.max(...Object.keys(species).map(Number)); if (b !== pd.NEEDLE) return 'highest id ' + b;
    return true;
  });

  await T('plush.variety-every-shape-builds-clean-and-differs-from-all-others', async () => {
    const bad = [], sig = new Map(), grids = [];
    const N = ARCH_COUNT + 8;
    for (let a = 0; a < N; a++) for (const lod of [0, 1]) {
      let geo; try { geo = pg.makeArchGeometry(a, lod); } catch (e) { return `arch ${a} lod ${lod} threw ${e.message}`; }
      const pos = geo.attributes.position.array; let nan = false; for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) { nan = true; break; }
      geo.computeBoundingSphere(); geo.computeBoundingBox(); const r = geo.boundingSphere.radius, bb = geo.boundingBox;
      if (nan) bad.push(`arch ${a} lod ${lod}: NaN`);
      if (geo.attributes.position.count < 12) bad.push(`arch ${a} lod ${lod}: ${geo.attributes.position.count} verts`);
      if (!geo.attributes.color || !geo.attributes.normal) bad.push(`arch ${a} lod ${lod}: missing color or normal`);
      if (a < ARCH_COUNT && (r < 0.18 || r > 0.7)) bad.push(`arch ${a} lod ${lod}: radius ${r.toFixed(2)}`);
      if (a < ARCH_COUNT && lod === 0 && geo.attributes.position.count > 5000) bad.push(`arch ${a} lod 0 heavy: ${geo.attributes.position.count}`);
      if (lod === 1 && a < ARCH_COUNT) {
        const key = [geo.attributes.position.count, ...['x', 'y', 'z'].map((c) => (bb.max[c] - bb.min[c]).toFixed(2))].join(); if (sig.has(key)) bad.push(`arch ${a} has the same size signature as ${sig.get(key)}`); sig.set(key, a);
        const front = new Set(), side = new Set(); for (let i = 0; i < pos.length; i += 3) { front.add(Math.round(pos[i] * 24) + ',' + Math.round(pos[i + 1] * 24)); side.add(Math.round(pos[i + 2] * 24) + ',' + Math.round(pos[i + 1] * 24)); } grids[a] = { front, side };
      }
      geo.dispose();
    }
    const iou = (x, y) => { let i = 0; for (const k of x) if (y.has(k)) i++; return i / (x.size + y.size - i); };
    for (let a = GEN2_ARCH; a < ARCH_COUNT; a++) for (let b = 0; b < ARCH_COUNT; b++) { if (a === b) continue; if (iou(grids[a].front, grids[b].front) > 0.88 && iou(grids[a].side, grids[b].side) > 0.88) bad.push(`${ARCH_NAMES[a]} looks like ${ARCH_NAMES[b]}`); }
    return bad.length === 0 || bad.slice(0, 5).join('; ');
  });

  await T('plush.variety-every-new-shape-renders-as-loose-plush-and-as-world-cells', async () => {
    await newWorld(); fresh(); const r = g.renderer, gl = r.renderer.getContext(); const e0 = g.errCount || 0;
    const { i, k } = spot(); p().pos.set(cellX(i + 4), 0, cellZ(k)); adv(0.3);
    const newSp = []; for (let a = GEN2_ARCH; a < ARCH_COUNT; a++) newSp.push(species.findIndex((s, id) => id > 0 && s && s.arch === a && s.pal === a % PAL_COUNT && !s.pat));
    const specials = [pd.NEEDLE, pd.BULK, pd.REMAINS, pd.CACHE, ...pd.DECOYS];
    const all = [...newSp, ...specials]; const cells = [];
    all.forEach((sp, n) => { const ci = i + 8 + (n % 10) * 2, ck = k + 2 + Math.floor(n / 10) * 3, cj = w().topAt(ci, ck) + 2; cells.push([ci, cj, ck, sp]); w().setCell(ci, cj, ck, sp, n & 127); });
    const cam = r.camera.position; for (let n = 0; n < 400 && (r.pending.length || w().dirtyChunks.size); n++) r.updateChunks(cam, 40);
    r.rebuildInstances(cam, true); const missing = [];
    for (const [, , , sp] of cells) { const a = species[sp].arch; if (r.hiCount[a] + r.loCount[a] < 1) missing.push(`${species[sp].name} (arch ${a}) not instanced as a cell`); }
    // as loose bodies and through the dynamic path
    for (const sp of all) sim().spawn(sp, 5, cellX(i + 6) + (sp % 7) * 0.2, 2.5, cellZ(k) - 2, 0, 0, 0);
    r.beginDynamic(); for (const sp of all) r.addDynamic(sp, 5, 0, 1, 0, 0, 0, 0, 1, 1); r.endDynamic();
    for (const sp of all) { const a = species[sp].arch; if (r.dynCount[a] < 1) missing.push(species[sp].name + ' missing from dynamic instances'); }
    adv(1.5); for (let f = 0; f < 3; f++) r.render(0.016, g.time + f * 0.016); const glErr = gl.getError();
    for (const [ci, cj, ck, sp] of cells) w().setCell(ci, cj, ck, 0, 0); while (sim().n > 0) sim().remove(sim().n - 1);
    if (glErr) return 'gl error ' + glErr; if ((g.errCount || 0) !== e0) return 'frame errors: ' + (g.errLog || []).slice(-1)[0];
    return missing.length === 0 || missing.slice(0, 4).join('; ');
  });

  await T('plush.variety-dex-lists-every-species-and-names-the-new-ones', async () => {
    fresh(); const newId = speciesCount, mid = GEN2_TOTAL + 123; S().dex = {}; S().dex[newId] = 3; S().dex[mid] = 1; S().dex[pd.DECOYS[0]] = 1;
    g.openModal('dex'); const total = document.getElementById('dexTotal').textContent, count = document.getElementById('dexCount').textContent; const cards = [...document.querySelectorAll('#dexGrid > *')];
    const DX = await import('../dexui.js'); const listed = DX.dexState.list.length;
    const text = cards.map((c) => c.textContent).join('|'); g.ui.closeModals(); S().dex = {};
    if (String(total) !== String(speciesCount)) return `dex total ${total}`; if (String(count) !== '2') return 'dex count ' + count + ' (decoys must not count)';
    if (listed !== speciesCount + pd.DECOYS.length) return `${listed} entries listed for ${speciesCount} species`;
    if (cards.length < 8 || cards.length > 400) return `${cards.length} cards drawn (the grid is virtual)`;
    return (text.includes(species[newId].name) && text.includes(species[mid].name)) || 'new species names missing from the dex';
  });

  await T('plush.variety-icons-render-for-every-new-shape', async () => {
    const { speciesIcon } = await import('../icons.js'); const bad = [], urls = new Set();
    for (let a = GEN2_ARCH; a < ARCH_COUNT; a++) { const id = species.findIndex((s, n) => n > 0 && s.arch === a && s.pal === 0); const u = speciesIcon(id); if (!u || u.length < 400) bad.push(species[id].name); urls.add(u); }
    return (bad.length === 0 && urls.size === ARCH_COUNT - GEN2_ARCH) || `icons blank or identical: ${bad.join()} unique ${urls.size}`;
  });

  await T('plush.variety-save-round-trip-keeps-new-species-in-cells-and-loose', async () => {
    fresh(); const keep = localStorage.getItem(SAVE_KEY); const { i, k } = spot(); const a = speciesCount, b = GEN2_TOTAL + 1, c = pd.NEEDLE;
    const ci = i + 12, cj = 2, ck = k + 3; const was = w().get(ci, cj, ck); w().setCell(ci, cj, ck, a, 77); w().setCell(ci + 1, cj, ck, b, 5); w().setCell(ci + 2, cj, ck, c, 0);
    const n0 = sim().n; sim().spawn(a, 9, cellX(i), 3, cellZ(k) - 3); let ok = false, why = '';
    try {
      ok = saveGame(S(), w(), sim()); const d = loadSaved(); if (!ok || !d) why = 'save failed';
      else {
        w().removeCell(ci, cj, ck, false); w().removeCell(ci + 1, cj, ck, false); w().removeCell(ci + 2, cj, ck, false);
        if (w().get(ci, cj, ck) !== 0) why = 'cell not removed'; applyDiff(w(), d.diff);
        const got = [w().get(ci, cj, ck), w().get(ci + 1, cj, ck), w().get(ci + 2, cj, ck)]; if (got.join() !== [a, b, c].join()) why = 'cells came back as ' + got; else if (w().getVr(ci, cj, ck) !== 77) why = 'variant lost';
        else if (!d.loose.some((r) => r[0] === a && r[1] === 9)) why = 'loose plush not saved';
      }
    } finally { w().setCell(ci, cj, ck, 0, 0); w().setCell(ci + 1, cj, ck, 0, 0); w().setCell(ci + 2, cj, ck, 0, 0); while (sim().n > n0) sim().remove(sim().n - 1); if (keep === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, keep); void was; }
    return why === '' || why;
  });

  await T('plush.variety-picking-up-a-new-species-registers-it-and-sells-for-its-rarity', async () => {
    fresh(); S().dex = {}; const id = speciesCount; g.registerDex(id); const ok = S().dex[id] === 1; const val = pd.sellValue(id, 0), want = RARITY[species[id].rarity].value; S().dex = {};
    return (ok && val === want && pd.sellValue(id, 128) === want * 5) || `dex ${ok} value ${val} want ${want}`;
  });
}
