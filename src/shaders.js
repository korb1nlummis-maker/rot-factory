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
  uPt: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, -999, 0, 1)) },
  uPtCol: { value: Array.from({ length: 6 }, () => new THREE.Color(0, 0, 0)) },
  uPtN: { value: 1 },
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

export const plushVert = /* glsl */ `
attribute vec4 aData;
varying vec3 vN; varying vec3 vWP; varying vec3 vCol; varying vec4 vData; varying vec3 vOP;
void main(){
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  vN = normalize(mat3(instanceMatrix) * normal);
  vOP = position;
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
uniform vec4 uPt[6]; uniform vec3 uPtCol[6]; uniform int uPtN;
varying vec3 vN; varying vec3 vWP; varying vec3 vCol; varying vec4 vData; varying vec3 vOP;
${noise}
void main(){
  float ao = vData.x, sky = vData.y, flags = vData.z, seed = vData.w;
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

  vec3 L = vec3(0.0);
  // hall lights from above
  float wrap = clamp((dot(N, uSunDir) + 0.55) / 1.55, 0.0, 1.0);
  L += uSunColor * wrap * wrap * sky;
  float hm = N.y * 0.5 + 0.5;
  L += mix(uHemiGround, uHemiSky, hm) * (0.10 + 0.90 * sky);
  L += vec3(0.020, 0.022, 0.026); // dark-room floor

  // headlamp
  vec3 lv = uLampPos - vWP; float ld = length(lv); vec3 ldir = lv / ld;
  float cone = smoothstep(uLampCone.y, uLampCone.x, dot(-ldir, uLampDir));
  float att = 1.0 / (1.0 + ld * ld * 0.16) * smoothstep(uLampRange, uLampRange * 0.35, ld);
  float ndl = clamp((dot(N, ldir) + 0.35) / 1.35, 0.0, 1.0);
  L += uLampColor * cone * att * ndl * ndl * (0.55 + 0.45 * ao);

  // placed lamps
  for (int i = 0; i < 6; i++) {
    if (i >= uPtN) break;
    vec3 pv = uPt[i].xyz - vWP; float pd = length(pv);
    float pr = uPt[i].w;
    if (pd < pr) {
      float pa = 1.0 / (1.0 + pd * pd * 0.5) * smoothstep(pr, pr * 0.3, pd);
      float pn = clamp((dot(N, pv / pd) + 0.4) / 1.4, 0.0, 1.0);
      L += uPtCol[i] * pa * pn;
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
