export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export function h32(a, b = 0, c = 0, d = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483629) ^ Math.imul(d | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return h >>> 0;
}
export const h01 = (a, b, c, d) => h32(a, b, c, d) / 4294967296;
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function vnoise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h01(xi, yi, seed), b = h01(xi + 1, yi, seed), c = h01(xi, yi + 1, seed), d = h01(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm2(x, y, seed = 0, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise2(x * f, y * f, seed + i * 17);
    n += a; a *= 0.5; f *= 2.03;
  }
  return s / n;
}
export function quatFromHash(h, out) {
  // uniform-ish random unit quaternion from 32-bit hash (Shoemake with cheap derived randoms)
  const u1 = ((h & 0x3ff) + 0.5) / 1024;
  const u2 = (((h >>> 10) & 0x7ff) + 0.5) / 2048;
  const u3 = (((h >>> 21) & 0x7ff) + 0.5) / 2048;
  const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
  const a = 6.283185307 * u2, b = 6.283185307 * u3;
  out[0] = s1 * Math.sin(a); out[1] = s1 * Math.cos(a); out[2] = s2 * Math.sin(b); out[3] = s2 * Math.cos(b);
}
export function fmt(n) {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('en-US');
  const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let i = 0, v = n;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + u[i];
}

// The pile gets denser and heavier the further from Sorting Bay 07: digging slows down.
export const compaction = (x, z) => Math.pow(1 + Math.hypot(x, z) / 100, 1.4);

// text that came from another player or a typed name, made safe for innerHTML
export const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
