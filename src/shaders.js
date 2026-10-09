import * as THREE from 'three';

export const U = {
  uTime: { value: 0 },
  uFogColor: { value: new THREE.Color(0.2, 0.22, 0.15) },
  uFogDensity: { value: 0.024 },
  uCamSky: { value: 1 },
  uSunDir: { value: new THREE.Vector3(0.25, 1, 0.15).normalize() },
  uSunColor: { value: new THREE.Color(1.05, 1.1, 0.95) },
  uHemiSky: { value: new THREE.Color(0.36, 0.4, 0.3) },
  uHemiGround: { value: new THREE.Color(0.16, 0.14, 0.11) },
  uLampPos: { value: new THREE.Vector3() },
  uLampDir: { value: new THREE.Vector3(0, 0, -1) },
  uLampColor: { value: new THREE.Color(2.4, 2.2, 1.8) },
  uLampCone: { value: new THREE.Vector2(0.97, 0.78) },
  uLampRange: { value: 16 },
  uPt: { value: Array.from({ length: 10 }, () => new THREE.Vector4(0, -999, 0, 1)) },
  uPtCol: { value: Array.from({ length: 10 }, () => new THREE.Color(0, 0, 0)) },
  uPtN: { value: 1 },
  uFloor: { value: 1 },
  uGlow: { value: 0 },
  uHoleSun: { value: new THREE.Color(1.05, 1.1, 0.95) },     // the hall's light as it comes down a hole: the hall level only, never dimmed by how deep the camera stands (renderEnv)
  uHoleHemi: { value: new THREE.Color(0.36, 0.4, 0.3) },
  uHoleLv: { value: 1 },
  uStressOn: { value: 0 },
};

const noise = /* glsl */ `
float hash31(vec3 p){ p = fract(p*0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y)*p.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash31(i), b = hash31(i+vec3(1,0,0)), c = hash31(i+vec3(0,1,0)), d = hash31(i+vec3(1,1,0));
  float e = hash31(i+vec3(0,0,1)), g = hash31(i+vec3(1,0,1)), h = hash31(i+vec3(0,1,1)), k = hash31(i+vec3(1,1,1));
  return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,g,f.x), mix(h,k,f.x), f.y), f.z);
}
`;

export const noiseGLSL = noise;
// the plush shader's placed lights (uPt): a soft inverse-square that is faded to nothing at the light's radius. pointAtten is the JS twin of the GLSL line in plushFrag, for the tests and the tools.
export const PT_FALLOFF = 0.14;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const pointAtten = (d, r) => (d >= r ? 0 : 1 / (1 + d * d * PT_FALLOFF) * sstep(r, r * 0.3, d));
// a lamp's share of light on a surface is eased off near its peak, so the floor right under a lantern is a warm pool and not a white blob (x / (1 + 0.7 x): 0.2 stays 0.175, 1.0 becomes 0.59). The GLSL line is the same.
export const PT_SHOULDER = 0.7;
export const pointLight = (d, r, n = 1) => { const x = pointAtten(d, r) * n; return x / (1 + PT_SHOULDER * x); };
// Patterned species (stripes, spots, two-tone): the second color is made from the first (channels rotated, then pushed light or dark so there is always contrast), and the
// parts that are not body (eyes, dark tips: vertex color well below white) keep their own color. p is the object space position, vc the vertex color.
export const patternGLSL = /* glsl */ `
float plushSpots(vec3 g){
  vec3 c = floor(g);
  vec3 f = fract(g) - 0.5 - (vec3(hash31(c), hash31(c + 7.0), hash31(c + 13.0)) - 0.5) * 0.4;
  return (1.0 - smoothstep(0.30, 0.40, length(f))) * step(0.22, hash31(c + 29.0));
}
vec3 plushPattern(vec3 alb, float pat, vec3 p, vec3 vc, float n0){
  float body = smoothstep(0.30, 0.55, min(vc.r, min(vc.g, vc.b)));
  if (body <= 0.0) return alb;
  float lum = dot(alb, vec3(0.3333));
  vec3 sec = pat < 2.5 ? (pat < 1.5 ? alb.gbr : alb.brg) : alb.gbr;
  sec = lum > 0.42 ? sec * 0.5 : sec * 1.6 + 0.14;
  float m = 0.0;
  if (pat < 1.5) {
    m = smoothstep(0.42, 0.58, abs(fract(p.y * 5.0 + 0.31) - 0.5) * 2.0 - 0.0);
    m = 1.0 - m;
  } else if (pat < 2.5) {
    m = max(plushSpots(p * 5.6 + vec3(3.1, 1.7, 5.3)), plushSpots(p * 8.3 + vec3(9.7, 4.3, 1.9)));   // two lattices of different size: a thin shape that slips between the dots of one is caught by the other
  } else {
    m = abs(smoothstep(-0.03, 0.03, p.x) - smoothstep(-0.03, 0.03, p.z));                              // two upright cuts through the middle (opposite quarters share a color): every shape shows both colors from any side, whatever its height
  }
  return mix(alb, sec, m * body);
}
`;

export const plushVert = /* glsl */ `
attribute vec4 aData;
varying vec3 vN; varying vec3 vWP; varying vec3 vCol; varying vec4 vData; varying vec3 vOP; varying vec3 vVC;
void main(){
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  vN = normalize(mat3(instanceMatrix) * normal);
  vOP = position;
  vVC = color;
  vCol = color * instanceColor;
  vData = aData;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const plushFrag = /* glsl */ `
precision highp float;
uniform float uTime; uniform vec3 uFogColor; uniform float uFogDensity; uniform float uCamSky;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uHemiSky; uniform vec3 uHemiGround;
uniform vec3 uLampPos; uniform vec3 uLampDir; uniform vec3 uLampColor; uniform vec2 uLampCone; uniform float uLampRange;
uniform vec4 uPt[10]; uniform vec3 uPtCol[10]; uniform int uPtN; uniform float uFloor; uniform float uGlow; uniform vec3 uHoleSun; uniform vec3 uHoleHemi; uniform float uHoleLv;
varying vec3 vN; varying vec3 vWP; varying vec3 vCol; varying vec4 vData; varying vec3 vOP; varying vec3 vVC;
${noise}
${patternGLSL}
void main(){
  float pat = floor(vData.w);                                // the pattern (0 plain, 1 stripes, 2 spots, 3 two-tone) rides in the whole part of the seed
  float ao = vData.x, sky = vData.y, seed = vData.w - pat;
  float flags = floor(vData.z + 0.01);                      // the flag (0 plush, 1 shiny, 2 The One) with the light that came down a hole in its fraction
  float hole = clamp((vData.z - flags) / 0.97, 0.0, 1.0);
  vec3 N = normalize(vN);
  vec3 toCam = cameraPosition - vWP;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float n1 = 0.5;
  if (dist < 16.0) {
    vec3 q = vOP * 34.0 + seed * 19.0;
    n1 = hash31(floor(q * 0.5));
    vec3 pert = vec3(hash31(floor(q)), hash31(floor(q) + 11.0), hash31(floor(q) + 23.0)) - 0.5;
    N = normalize(N + pert * 0.28 * (1.0 - dist / 16.0));
  }
  vec3 alb = vCol * (0.92 + 0.16 * n1);
  if (pat > 0.5) alb = plushPattern(alb, pat, vOP, vVC, seed);

  vec3 L = vec3(0.0);
  // hall lights from above
  float wrap = clamp((dot(N, uSunDir) + 0.55) / 1.55, 0.0, 1.0);
  L += uSunColor * wrap * wrap * sky;
  float hm = N.y * 0.5 + 0.5;
  L += mix(uHemiGround, uHemiSky, hm) * max(0.10 + 0.90 * sky, uGlow);
  // light from a hole in the pile (a shaft dug up and out, and what spills from its foot along the tunnel): only what it adds to the plain sky light above
  float hx = max(hole - sky, 0.0);
  L += uHoleSun * wrap * wrap * hx + mix(uHemiGround * uHoleLv, uHoleHemi, hm) * 0.9 * hx;
  L += vec3(0.020, 0.022, 0.026) * uFloor; // dark-room floor: gone at night and deep underground, so only light sources show anything

  // headlamp
  vec3 lv = uLampPos - vWP; float ld = length(lv); vec3 ldir = lv / ld;
  float cone = smoothstep(uLampCone.y, uLampCone.x, dot(-ldir, uLampDir));
  float att = 1.0 / (1.0 + ld * ld * 0.16) * smoothstep(uLampRange, uLampRange * 0.35, ld);
  float ndl = clamp((dot(N, ldir) + 0.35) / 1.35, 0.0, 1.0);
  L += uLampColor * cone * att * ndl * ndl * (0.55 + 0.45 * ao);

  // placed lamps
  for (int i = 0; i < 10; i++) {
    if (i >= uPtN) break;
    vec3 pv = uPt[i].xyz - vWP; float pd = length(pv);
    float pr = uPt[i].w;
    if (pd < pr) {
      float pa = 1.0 / (1.0 + pd * pd * ${PT_FALLOFF.toFixed(3)}) * smoothstep(pr, pr * 0.3, pd);
      float pn = clamp((dot(N, pv / pd) + 0.4) / 1.4, 0.0, 1.0);
      float px = pa * pn;
      L += uPtCol[i] * (px / (1.0 + ${PT_SHOULDER.toFixed(2)} * px));
    }
  }

  vec3 col = alb * L * ao;

  // fabric sheen
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  float lum = dot(L, vec3(0.33));
  col += fres * mix(alb, vec3(1.0), 0.45) * 0.30 * min(lum, 1.6) * ao;

  // shiny and The One
  if (flags > 0.5) {
    float tw = floor(uTime * 5.0 + seed * 9.0);
    float g = step(0.965, hash31(floor(vOP * 46.0) + tw));
    vec3 irid = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + dot(N, V) * 0.8 + uTime * 0.15));
    col += g * vec3(1.0, 0.92, 0.6) * 2.4;
    if (flags < 1.5) {
      col = mix(col, col * (0.6 + irid * 0.9), 0.55);
      col += fres * irid * 0.7;
    } else {
      col = mix(col, vec3(1.0, 0.78, 0.25) * (0.5 + 0.9 * n1), 0.35);
      col += vec3(1.0, 0.72, 0.2) * (0.35 + 0.25 * sin(uTime * 2.2));
      col += fres * vec3(1.0, 0.9, 0.5) * 1.6;
    }
  }

  float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  vec3 fogc = uFogColor * (0.06 + 0.94 * uCamSky);
  col = mix(col, fogc, f);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const ghostVert = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const ghostFrag = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha; uniform float uTime;
varying vec3 vN; varying vec3 vV;
void main(){
  float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 1.8);
  float pulse = 0.75 + 0.25 * sin(uTime * 8.0);
  gl_FragColor = vec4(uColor * (0.25 + f * 1.6) * pulse, (0.12 + f * 0.7) * uAlpha);
}
`;

export function makePlushMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: plushVert,
    fragmentShader: plushFrag,
    vertexColors: true,
  });
}

export const gradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.42 }, uGrain: { value: 0.045 }, uCA: { value: 0.0016 }, uDamage: { value: 0 }, uTint: { value: new THREE.Vector3(1.03, 1.02, 0.97) } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uGrain; uniform float uCA; uniform float uDamage; uniform vec3 uTint;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * uCA * 14.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col *= uTint;
      // soft contrast curve
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
      float vig = smoothstep(0.85, 0.15, length(c) * (1.0 + uVig));
      col *= mix(1.0 - uVig, 1.0, vig);
      col += (rnd(vUv * 900.0) - 0.5) * uGrain;
      col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))) * vec3(0.7, 0.35, 0.3), uDamage);
      gl_FragColor = vec4(col, 1.0);
    }`,
};
