// Audit of the species expansion, part 1: how the table LOOKS. Two species must never be told apart only by a hair: the 48 palettes are far enough apart,
// every pattern (stripes, spots, two-tone) really shows on every one of the 92 shapes in the Plushdex picture, and the pattern number that rides in the
// whole part of the per instance seed cannot be lost to the rounding of a varying (a seed of exactly 0 would sit on the integer).
import * as pd from '../plushdata.js';
import { speciesIcon } from '../icons.js';
import { cellPose } from '../render.js';
import { toI, toK, cellX, cellZ } from '../config.js';

// CIE Lab distance (ΔE76) between two sRGB colors given as 0xRRGGBB
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lab = (h) => {
  const r = lin((h >> 16) & 255), g = lin((h >> 8) & 255), b = lin(h & 255);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};

const loadImg = (u) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('icon did not decode')); im.src = u; });

export default async function (ctx) {
  const { T, g, fresh } = ctx;
  const { species, speciesCount, ARCH_COUNT, PAL_COUNT, PALETTES, PREFIXES, ARCH_NAMES } = pd;

  await T('species.audit.palettes-are-far-enough-apart-to-tell-two-species-apart', async () => {
    const L = PALETTES.map((p) => lab(p[1])), bad = [];
    for (let a = 0; a < PAL_COUNT; a++) for (let b = a + 1; b < PAL_COUNT; b++) {
      const d = Math.hypot(L[a][0] - L[b][0], L[a][1] - L[b][1], L[a][2] - L[b][2]);
      if (d < 13) bad.push(`${PREFIXES[a]} (${PALETTES[a][0]}) and ${PREFIXES[b]} (${PALETTES[b][0]}) differ by only ${d.toFixed(1)}`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('species.audit.every-pattern-shows-on-every-shape-in-the-dex-picture', async () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d', { willReadFrequently: true });
    const px = async (id) => { const im = await loadImg(speciesIcon(id)); cx.clearRect(0, 0, 64, 64); cx.drawImage(im, 0, 0, 64, 64); return cx.getImageData(0, 0, 64, 64).data; };
    // the share of the shape's pixels that the pattern changes by a clearly visible amount
    const changed = (A, B) => { let n = 0, c = 0; for (let i = 0; i < A.length; i += 4) { if (A[i + 3] < 128) continue; n++; if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 45) c++; } return n ? c / n : 0; };
    const idOf = new Map(); for (let id = 1; id <= speciesCount; id++) { const s = species[id]; idOf.set(s.arch * 4096 + s.pal * 4 + s.pat, id); }
    const NEED = [0, 0.15, 0.06, 0.12];   // stripes and two-tone cover a lot, spots are small by nature
    const bad = [];
    for (let a = 0; a < ARCH_COUNT; a++) {
      if (a === 31) continue;   // the Razzo has no patterned variants
      for (const pat of [1, 2, 3]) {
        let best = null;
        for (let pal = 0; pal < PAL_COUNT; pal++) { const idp = idOf.get(a * 4096 + pal * 4 + pat); if (idp) { best = [idOf.get(a * 4096 + pal * 4), idp]; break; } }
        if (!best) { bad.push(`${ARCH_NAMES[a]} has no ${pd.PATTERNS[pat]} variant`); continue; }
        const share = changed(await px(best[0]), await px(best[1]));
        if (share < NEED[pat]) bad.push(`${species[best[1]].name} looks like ${species[best[0]].name} (${(share * 100).toFixed(1)}% of the picture differs)`);
      }
    }
    const by = [0, 0, 0, 0]; for (const b of bad) by[/Rigato/.test(b) ? 1 : /Macchiato/.test(b) ? 2 : /Bicolore/.test(b) ? 3 : 0]++;
    return bad.length === 0 || `${bad.length} shapes hide a pattern (stripes ${by[1]}, spots ${by[2]}, two-tone ${by[3]}): ` + bad.slice(0, 5).join('; ');
  });

  await T('species.audit.the-pattern-number-never-sits-on-an-integer-in-the-seed', async () => {
    fresh({}); const r = g.renderer, bad = [];
    const pat = species.findIndex((s) => s && s.pat === 2), plain = 1;
    // a loose body or a held plush: vr 0 is the common case and its seed byte is 0
    for (const [id, name] of [[pat, 'patterned'], [plain, 'plain']]) for (const vr of [0, 1, 37, 127, 128, 200, 255]) {
      r.beginDynamic(); r.addDynamic(id, vr, 0, 1, 0, 0, 0, 0, 1, 1); r.endDynamic();
      const w = r.dyn[species[id].arch].geometry.attributes.aData.array[3], fr = w - Math.floor(w);
      if (!(fr >= 0.005 && fr <= 0.995)) bad.push(`${name} vr ${vr}: seed fraction ${fr.toFixed(4)} of ${w}`);
      if (Math.floor(w + 1e-6) !== (species[id].pat || 0)) bad.push(`${name} vr ${vr}: pattern reads ${Math.floor(w)}`);
    }
    // a plush set down in the open air over the pile (so no neighbour hides it from the mesh): find a cell whose hashed seed byte is 0 (1 in 256) and mesh it
    const world = g.world, i0 = toI(20), kA = toK(0); let hit = null, hk = 0, hj = 0; const out = new Float32Array(9);
    for (let dk = 0; dk < 40 && hit === null; dk++) for (let q = 0; q < 66 && hit === null; q++) { const jj = world.topAt(i0 + q, kA + dk) + 3; if (jj > 60) continue; cellPose(i0 + q, jj, kA + dk, 0, out); if (out[8] === 0) { hit = i0 + q; hk = kA + dk; hj = jj; } }
    if (hit === null) bad.push('no cell with seed byte 0 found'); else {
      const was = world.get(hit, hj, hk), wasV = world.getVr(hit, hj, hk);
      world.setCell(hit, hj, hk, pat, 0);
      try {
        const res = r.scanChunk(Math.floor(hit / 16), Math.floor(hj / 16), Math.floor(hk / 16), false); let found = false;
        for (let e = 0; e < res.n; e++) {
          const o = e * 16;
          if (Math.abs(res.data[o] - cellX(hit)) < 0.06 && Math.abs(res.data[o + 2] - cellZ(hk)) < 0.06 && (res.data[o + 15] | 0) === species[pat].arch) {
            found = true; const w = res.data[o + 11], fr = w - Math.floor(w);
            if (!(fr >= 0.005 && fr <= 0.995)) bad.push(`pile cell: seed fraction ${fr.toFixed(4)}`);
            if (Math.floor(w + 1e-6) !== 2) bad.push('pile cell: pattern reads ' + Math.floor(w));
          }
        }
        if (!found) bad.push(`the patterned plush is not in the chunk mesh (${res.n} plush, cell ${hit},${hj},${hk}, now ${world.get(hit, hj, hk)})`);
      } finally { world.setCell(hit, hj, hk, was, wasV); }
    }
    return bad.length === 0 || bad.slice(0, 5).join('; ');
  });
}
