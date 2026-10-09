// Shared helpers for the light audit tests (lights_*.js). No default export, so the self test loader skips this file.
// A scene is the open bay at night (the lights of the hall are out, so only the light under test shows) or in daylight, with a wall of light plush (snow, cream, custard, sky, mint, blush...)
// built in front of the camera; shoot() renders a frame the way the player sees it (bloom, tone curve and all) and measures how much of the picture is blown out and how much shading is left.
import { PALETTES, species } from '../plushdata.js';

export const PALE = ['Snow', 'Cream', 'Custard', 'Bubblegum', 'Sky', 'Mint', 'Champagne', 'Blush', 'Cloud'];
const ARCHS = [0, 1, 2, 4, 7, 9, 11, 12, 14, 16, 20, 21];
const palIdx = (name) => PALETTES.findIndex((q) => q[0] === name);
const spOf = (pal, arch) => species.findIndex((s) => s && s.pal === pal && s.arch === arch && s.pat === 0);

export function lib(ctx) {
  const { g, w, toI, toK, cellZ, cellX, S } = ctx;
  const C = 0.6;
  const placed = [];
  const clearWall = () => { for (const c of placed.splice(0)) w().setCell(c[0], c[1], c[2], 0, 0); };
  // a wall of pale plush across the bay (x from -14 to -2), 3 cells thick and 6 high, its face at the returned z. `names`: which colours (default: the nine pale ones, mixed).
  const wall = (z = 11.7, names = PALE) => {
    clearWall(); const pals = names.map(palIdx), k0 = toK(z); let q = 0;
    for (let dk = 0; dk < 3; dk++) for (let i = toI(-14); i <= toI(-2); i++) for (let j = 0; j < 6; j++) {
      const pal = pals[(q * 7 + i + 11) % pals.length], arch = ARCHS[(q * 5 + j * 3 + i + 20) % ARCHS.length], sp = spOf(pal, arch) || spOf(pal, 0);
      w().setCell(i, j, k0 + dk, sp, (q * 37 + 11) & 127); placed.push([i, j, k0 + dk]); q++;
    }
    return cellZ(k0) - C / 2;
  };
  // the hall at night (lights out, the closing clock) or by day; the clock override is removed by day()
  const night = () => { g.dayMinute = () => 1300; g.wasOpen = false; g.closingGrace = 0; g.lightLevel = 0; g.hall.setLevel(0); };
  const day = () => { delete g.dayMinute; g.wasOpen = true; g.lightLevel = 1; g.hall.setLevel(1); };
  const stand = (x, z, yaw = 0, pitch = -0.08, lamp = false) => { g.lampOn = lamp; g.stowed = true; ctx.p().pos.set(x, 0, z); ctx.p().vel.set(0, 0, 0); ctx.p().yaw = yaw; ctx.p().pitch = pitch; };

  const lumOf = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  // measure a region (fractions of the canvas) of what was just drawn: clipped = all channels >= 245; hi = luminance >= 225; sd4 = the mean standard deviation of luminance in 4 x 4 px blocks (the shading); mean luminance
  const measure = (cx, x0, y0, x1, y1) => {
    const W = cx.canvas.width, H = cx.canvas.height, px = Math.floor(x0 * W), py = Math.floor(y0 * H), pw = Math.floor((x1 - x0) * W), ph = Math.floor((y1 - y0) * H);
    const d = cx.getImageData(px, py, pw, ph).data; let clip = 0, hi = 0, sum = 0, n = pw * ph, maxL = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i] >= 245 && d[i + 1] >= 245 && d[i + 2] >= 245) clip++; const l = lumOf(d, i); if (l >= 225) hi++; sum += l; if (l > maxL) maxL = l; }
    let acc = 0, cnt = 0;
    for (let by = 0; by + 4 <= ph; by += 4) for (let bx = 0; bx + 4 <= pw; bx += 4) { let s = 0, s2 = 0; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = lumOf(d, ((by + y) * pw + bx + x) * 4); s += v; s2 += v * v; } const m = s / 16; acc += Math.sqrt(Math.max(0, s2 / 16 - m * m)); cnt++; }
    return { clip: 100 * clip / n, hi: 100 * hi / n, mean: sum / n, sd4: acc / Math.max(1, cnt), max: maxL };
  };
  // one rendered frame: { mid: the middle 40% x 40%, all: the whole picture }
  const shoot = () => {
    g.renderer.render(0.016, g.time);
    const src = g.renderer.renderer.domElement, cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(src, 0, 0);
    return { mid: measure(cx, 0.3, 0.3, 0.7, 0.7), all: measure(cx, 0, 0, 1, 1), w: cv.width, h: cv.height };
  };
  const fmt = (m) => `clip ${m.clip.toFixed(2)}% hi ${m.hi.toFixed(1)}% mean ${m.mean.toFixed(0)} sd4 ${m.sd4.toFixed(1)} max ${m.max.toFixed(0)}`;
  // render settings of the player: the quality the game picked (bloom is part of what washes a light plush out); no adaptive resolution while measuring
  const prep = (quality = 'high') => { const keep = { q: g.renderer.qName, a: S().settings.adaptive, dyn: g.renderer.dynScale }; S().settings.adaptive = false; if (g.renderer.qName !== quality) g.renderer.setQuality(quality); if (g.renderer.dynScale !== 1) g.renderer.setDynScale(1); return keep; };
  const unprep = (keep) => { S().settings.adaptive = keep.a; if (g.renderer.qName !== keep.q) g.renderer.setQuality(keep.q); if (keep.dyn !== 1) g.renderer.setDynScale(keep.dyn); };
  return { wall, clearWall, night, day, stand, shoot, fmt, prep, unprep, PALE };
}
