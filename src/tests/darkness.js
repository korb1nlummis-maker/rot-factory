import { U } from '../shaders.js';
import * as THREE from 'three';
export default async function (ctx) {
  const { T, g, fresh, w } = ctx;
  const settle = (pos) => { for (let n = 0; n < 60; n++) g.renderEnv(0.1, pos); return { floor: U.uFloor.value, hemi: U.uHemiSky.value.r, fog: g.renderer.scene.fog.color.r }; };
  await T('light.deep-tunnels-are-dark-and-the-bay-is-lit', async () => {
    fresh({}); g.hall.level = 1;
    const bay = settle(new THREE.Vector3(0, 1.6, -1.4));
    // a spot buried in the pile 40 m from the bay
    const x = 40, z = 0; let y = 0.9; const bad = [];
    const deep = settle(new THREE.Vector3(x, y, z));
    if (!(bay.floor > 0.9)) bad.push('bay not lit: ' + bay.floor);
    if (g.camSky > 0.5) return 'test spot is not buried (camSky ' + g.camSky.toFixed(2) + ')';
    if (!(deep.floor < 0.12 && deep.hemi < 0.05)) bad.push(`deep tunnel still lit: floor ${deep.floor.toFixed(3)} hemi ${deep.hemi.toFixed(3)}`);
    const near = settle(new THREE.Vector3(10, 0.9, 0)); if (!(near.floor > deep.floor)) bad.push('lighting does not fade with depth');
    return bad.length === 0 || bad.join('; ');
  });
  await T('light.at-night-the-hall-is-pitch-black-except-for-glows', async () => {
    fresh({ power: 1 }); g.hall.level = 0;
    const night = settle(new THREE.Vector3(0, 1.6, -1.4)); const bad = [];
    if (!(night.floor < 0.02 && night.hemi < 0.02)) bad.push(`night is not dark: floor ${night.floor.toFixed(3)} hemi ${night.hemi.toFixed(3)}`);
    // a burning generator and a powered pole light the plush near them
    const gl0 = g.glowSources(new THREE.Vector3(0, 1.6, -1.4), 8).length;
    const r = await ctx.placeAtFloor('gen', -3.4, 3.0, 2.0); if (!r.ok) return 'gen: ' + r.why; const gen = ctx.tiles().find((t) => t.type === 'gen'); gen.burn = 50;
    const gl1 = g.glowSources(new THREE.Vector3(0, 1.6, -1.4), 8); if (!(gl1.length === gl0 + 1)) bad.push(`a burning generator does not glow (${gl0} -> ${gl1.length})`);
    gen.burn = 0; if (g.glowSources(new THREE.Vector3(0, 1.6, -1.4), 8).length !== gl0) bad.push('a cold generator still glows');
    g.hall.level = 1;
    return bad.length === 0 || bad.join('; ');
  });
  await T('light.a-tunnel-stays-lit-for-its-first-7-m-then-fades-dark', async () => {
    fresh({}); g.hall.level = 1; g._entr = null; settle(new THREE.Vector3(0, 1.6, -1.4)); const bad = [];
    const r = {}; for (const m of [3, 6.5, 12, 25]) { g._entr = { x: 40 - m, z: 0 }; r[m] = settle(new THREE.Vector3(40, 0.9, 0)).floor; }
    if (g.camSky > 0.5) return 'test spot not buried (camSky ' + g.camSky.toFixed(2) + ')';
    if (!(r[3] > 0.95 && r[6.5] > 0.9)) bad.push(`dark inside 7 m: ${r[3].toFixed(2)} at 3 m, ${r[6.5].toFixed(2)} at 6.5 m`);
    if (!(r[12] < r[6.5] && r[12] > r[25])) bad.push(`no fade between 7 and 17 m: ${r[12].toFixed(2)}`); if (!(r[25] < 0.12)) bad.push(`still lit at 25 m: ${r[25].toFixed(2)}`);
    return bad.length === 0 || bad.join('; ');
  });
}
