// audit_lantern.*: an adversarial pass over the lantern lighting (src/lanternlight.js, game.glowSources, machines.lights, hanglamp.js).
// It goes after what lantern_core.js leaves out: a powered lamp next to you that eight lanterns far down the tunnel push out of the shader and the real light pool, the cost of a base with 100 lanterns
// (draw calls, geometry, the work of one frame), flares and glow sticks that go out at the end of their life in every place that keeps them (the scene, the save, the guest), a brownout that
// reaches the real light and the glass together, and the point lights that must never change in number.
import * as THREE from 'three';
import * as LL from '../lanternlight.js';
import * as HL from '../hanglamp.js';
import { U } from '../shaders.js';
import { makeKit, UP } from './power_lib.js';

export default async function (ctx) {
  const { T, g, S, p, fresh, adv } = ctx;
  const K = makeKit(ctx);
  const lantern = (x, z, extra = {}) => { const e = { id: g.nextId(), type: 'lantern', x, y: 0, z, ...extra }; S().entities.push(e); g.addEntity(e); return e; };
  const flare = (x, z, glow, age = 0) => { const e = { id: g.nextId(), type: 'flare', x, y: 0, z, born: S().stats.playSecs - age, ...(glow ? { glow: true } : {}) }; S().entities.push(e); g.addEntity(e); return e; };
  const stand = (x, z) => { p().pos.set(x, 0, z); p().vel.set(0, 0, 0); p().yaw = 0; g.stowed = true; };
  const allPoint = () => { let n = 0; g.renderer.scene.traverse((o) => { if (o.isPointLight) n++; }); return n; };
  const pool = () => { const out = []; g.renderer.scene.traverse((o) => { if (o.isPointLight && o.name.startsWith('lanternPool')) out.push(o); }); return out; };
  const draws = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh || m.isSprite) n++; }); return n; };
  const lamp = () => {   // a powered hanging lantern 3 m from where you stand, on a generator
    K.reset(UP);
    const fr = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'z', cx: -12, cz: 3, y0: 0, w: 2.38, h: 2.38, yaw: 0 }; S().entities.push(fr); g.addEntity(fr);
    const l = g.placeEntity('hlamp', HL.lampFields(fr, 0), { quiet: true });
    const G = K.tile('gen', -13.5, 8.5, {}); G.burn = 1e5; G.burnMax = 1e5; G.lit = true; const w = K.wire(G, l); if (!w.ok) return { err: 'wire: ' + w.why };
    stand(-12, 6); adv(2.5); l.pw = 1; adv(1.5);
    return { l };
  };

  await T('audit_lantern.a-lamp-next-to-you-is-not-pushed-out-by-eight-lanterns-far-down-the-tunnel', async () => {
    const { l, err } = lamp(); if (err) return err;
    const bad = [];
    const key = 'h' + l.id, cam = () => g.renderer.camera.position;
    const found = () => g.glowSources(cam(), 8).findIndex((s) => s.key === key);
    if (found() !== 0) bad.push('with nothing else the lamp is at ' + found());
    // eight lanterns 24 to 38 m away: the shader and the light pool take the nearest, and the lamp 3 m away is the nearest
    const far = []; for (let n = 0; n < 8; n++) far.push(lantern(12 + n * 2, 6 + (n % 2) * 3));
    adv(1.2);
    const src = g.glowSources(cam(), 8), at = src.findIndex((s) => s.key === key);
    if (at !== 0) bad.push('the lamp 3 m away is number ' + at + ' of ' + src.length + ' sources behind far lanterns: ' + src.map((s) => s.key + ':' + Math.hypot(s.x - cam().x, s.y - cam().y, s.z - cam().z).toFixed(0)).join(' '));
    const lit = pool().filter((q) => q.intensity > 0.05 && Math.abs(q.position.x - l.x) < 0.05 && Math.abs(q.position.z - l.z) < 0.05);
    if (!lit.length) bad.push('the lamp has no real light: ' + pool().map((q) => q.position.x.toFixed(0) + '/' + q.intensity.toFixed(2)).join(' '));
    let inShader = false; for (let i = 1; i < 9; i++) { const v = U.uPt.value[i]; if (v.y > -900 && Math.abs(v.x - l.x) < 0.05 && Math.abs(v.z - l.z) < 0.05) inShader = true; }
    if (!inShader) bad.push('the lamp is not in the shader lights');
    for (const e of far) g.doDecon({ kind: 'mach', id: e.id });
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_lantern.the-pool-never-lights-lanterns-out-of-reach-while-the-ones-next-to-you-wait', async () => {
    const { l, err } = lamp(); if (err) return err;
    const bad = [], n0 = allPoint();
    const near = lantern(-10, 6), far = []; for (let n = 0; n < 5; n++) far.push(lantern(14 + n, 6));   // five lanterns 26 to 30 m away, one 2 m away
    stand(-12, 6); adv(1.8);
    const on = pool().filter((q) => q.intensity > 0.05), has = (x, z) => on.some((q) => Math.abs(q.position.x - x) < 0.05 && Math.abs(q.position.z - z) < 0.05);
    if (!has(near.x, near.z)) bad.push('the lantern 2 m away has no real light: ' + on.map((q) => q.position.x.toFixed(0)).join(' '));
    if (!has(l.x, l.z)) bad.push('the powered lamp 3 m away has no real light: ' + on.map((q) => q.position.x.toFixed(0)).join(' '));
    if (on.length !== 4 && on.length !== 2) bad.push(on.length + ' real lights lit for two lights next to you and five far off');
    if (allPoint() !== n0) bad.push('the number of point lights changed');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_lantern.a-lantern-is-no-heavier-to-draw-than-the-one-it-replaced', async () => {
    fresh({}); const bad = [], M = g.machines;
    const a = M.makeLantern(), b = M.makeLantern();
    // the one it replaced was 4 meshes with no halo; one with a halo should be no more than that, so 100 lanterns are no more than 400 draw calls
    const e = lantern(-8, 8), it = M.items.get(e.id), n = draws(it.obj);
    if (!(draws(a) <= 3)) bad.push('a lantern body is ' + draws(a) + ' meshes');
    if (!(n <= 4)) bad.push('a placed lantern is ' + n + ' draw calls with its halo (the old one was 4 without)');
    const ga = a.getObjectByName('glass'), gb = b.getObjectByName('glass');
    if (!(ga && gb && ga.geometry === gb.geometry)) bad.push('every lantern builds its own geometry: 100 lanterns upload 100 copies');
    let shared = true; a.traverse((m) => { if (m.isMesh && !(m.geometry.userData && m.geometry.userData.shared)) shared = false; });
    if (!shared) bad.push('a lantern geometry is not marked shared: removing one lantern would free the buffers the others draw with');
    // removing a lantern leaves the others drawing (the shared geometry is not freed)
    const e2 = lantern(-6, 8); adv(0.3); g.doDecon({ kind: 'mach', id: e2.id }); adv(0.3);
    const it2 = M.items.get(e.id); if (!it2) bad.push('the other lantern vanished');
    try { g.renderer.render(0.016, g.time + 0.016); } catch (x) { bad.push('rendering after a removal threw ' + x.message); }
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_lantern.100-lanterns-cost-one-frame-no-more-than-a-bounded-share-and-never-add-a-light', async () => {
    fresh({}); const bad = []; stand(0, 0); adv(0.5);
    const n0 = allPoint(); let t0 = performance.now(); for (let q = 0; q < 100; q++) g.glowSources(g.renderer.camera.position, 8); const base = (performance.now() - t0) / 100;
    const ents = []; for (let n = 0; n < 100; n++) ents.push(lantern(-18 + (n % 10) * 4, -10 + Math.floor(n / 10) * 3));
    adv(1.5);
    const sources = g.glowSources(g.renderer.camera.position, 8); if (sources.length > 8) bad.push(sources.length + ' sources for the shader');
    t0 = performance.now(); for (let q = 0; q < 100; q++) g.glowSources(g.renderer.camera.position, 8); const per = (performance.now() - t0) / 100;
    if (!(per < 1.5)) bad.push('picking the lights of 100 lanterns takes ' + per.toFixed(2) + ' ms a frame (empty ' + base.toFixed(3) + ')');
    if (!(U.uPtN.value <= 10)) bad.push('uPtN ' + U.uPtN.value);
    if (allPoint() !== n0) bad.push('the light count went from ' + n0 + ' to ' + allPoint());
    const lit = pool().filter((q) => q.intensity > 0.05); if (lit.length > LL.POOL) bad.push(lit.length + ' real lights lit');
    t0 = performance.now(); for (let q = 0; q < 40; q++) { g.time += 0.02; g.updatePlay(0.02); } const frame = (performance.now() - t0) / 40;
    if (!(frame < 25)) bad.push('a game update with 100 lanterns takes ' + frame.toFixed(1) + ' ms');
    for (const e of ents) g.doDecon({ kind: 'mach', id: e.id });
    adv(2.5); if (pool().some((q) => q.intensity > 0.02)) bad.push('the pool is still lit after all 100 are gone');
    if (allPoint() !== n0) bad.push('the light count changed after removing them: ' + allPoint());
    if (g.machines.items.size > 600) bad.push('lanterns left items behind');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_lantern.a-glow-stick-and-a-flare-go-out-everywhere-at-the-end-of-their-life', async () => {
    fresh({}); const bad = []; stand(0, 9); adv(0.3);
    const a = flare(-2, 11, true, LL.GLOW_LIFE - 20), b = flare(2, 11, false, LL.FLARE_LIFE - 20), c = flare(4, 11, true, 0);
    adv(0.2);
    const keys = () => g.glowSources(g.renderer.camera.position, 8).map((s) => s.key);
    if (!keys().includes('e' + a.id) || !keys().includes('e' + b.id)) bad.push('a dying one is no source: ' + keys());
    // 2 s from the end both are almost out: the light is a fraction of full and the shader radius shrank
    S().stats.playSecs += 19; adv(0.2);
    const sa = g.glowSources(g.renderer.camera.position, 8).find((s) => s.key === 'e' + a.id); if (sa && !(sa.cg < LL.GLOW_COLOR[1] * 0.2)) bad.push('a glow stick 1 s from the end still gives ' + sa.cg);
    S().stats.playSecs += 2; adv(0.5);
    for (const [nm, e] of [['glow stick', a], ['flare', b]]) {
      if (g.machines.items.has(e.id)) bad.push(nm + ' is still in the scene');
      if (S().entities.some((x) => x.id === e.id)) bad.push(nm + ' is still in the save');
      if (keys().includes('e' + e.id)) bad.push(nm + ' is still a light source');
    }
    if (!g.machines.items.has(c.id) || !keys().includes('e' + c.id)) bad.push('a fresh glow stick went out with the old ones');
    // the guest is told: the host sends ent- when it takes one down
    const sent = []; const o = g.netSend; g.netSend = (m) => { sent.push(m); };
    try { const d = flare(0, 12, false, LL.FLARE_LIFE + 5); void d; adv(0.5); } finally { g.netSend = o; }
    if (!sent.some((m) => m.t === 'ent-')) bad.push('the host did not tell the guest a flare was taken down: ' + JSON.stringify(sent.map((m) => m.t)));
    // a save from before (a flare with no birth) is given one and burns from now on
    const old = { id: g.nextId(), type: 'flare', x: 6, y: 0, z: 11 }; S().entities.push(old); g.addEntity(old); adv(0.1);
    if (!(typeof old.born === 'number')) bad.push('an old flare has no birth time');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_lantern.the-halo-of-a-lantern-never-blooms-and-a-removed-one-leaves-no-sprite', async () => {
    fresh({}); const bad = []; stand(0, 9); adv(0.2);
    const sprites = () => { let n = 0; g.renderer.scene.traverse((o) => { if (o.isSprite) n++; }); return n; };
    const s0 = sprites(), es = [lantern(-3, 11), flare(-1, 11, false), flare(1, 11, true)]; adv(0.2);
    if (sprites() !== s0 + 3) bad.push('three lamps made ' + (sprites() - s0) + ' sprites');
    for (const e of es) {
      const o = g.machines.items.get(e.id).obj, h = o.getObjectByName('halo'); if (!h) { bad.push(e.type + ' has no halo'); continue; }
      for (const d of [0.3, 1, 3, 8, 20, 60]) { LL.haloFade(h, d); const m = h.material, peak = Math.max(m.color.r, m.color.g, m.color.b) * m.opacity; if (!(peak < 0.95) || !(h.scale.x < 2.2)) bad.push(`${e.type} halo blooms at ${d} m: ${peak.toFixed(2)} size ${h.scale.x.toFixed(2)}`); }
    }
    for (const e of es) g.doDecon({ kind: 'mach', id: e.id }); adv(0.3);
    if (sprites() !== s0) bad.push('removed lamps left ' + (sprites() - s0) + ' sprites in the scene');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_lantern.a-brownout-and-a-night-keep-the-real-light-in-step-with-the-glass', async () => {
    const { l, err } = lamp(); if (err) return err;
    const bad = [], it = g.machines.items.get(l.id), glass = it.obj.getObjectByName('glass');
    const real = () => { const q = pool().find((x) => Math.abs(x.position.x - l.x) < 0.05 && Math.abs(x.position.z - l.z) < 0.05); return q ? q.intensity : 0; };
    const setLevel = (v) => { for (let n = 0; n < 14; n++) { l.pw = v; g.time += 0.1; HL.tick(g, 0.1, false); LL.update(g, g.glowSources(g.renderer.camera.position, 8), 0.1); } return { real: real(), em: glass.material.emissiveIntensity }; };
    const full = setLevel(1), half = setLevel(0.5), q = setLevel(0.25), dark = setLevel(0);
    if (!(full.real > 1 && full.em > 0.8)) bad.push('full ' + JSON.stringify(full));
    if (!(half.real < full.real * 0.7 && half.real > full.real * 0.3)) bad.push('half power real light ' + half.real + ' against ' + full.real);
    if (!(q.real < half.real && q.em < half.em)) bad.push('a quarter is not dimmer than half: ' + JSON.stringify([half, q]));
    if (!(dark.real < 0.05 && dark.em === 0)) bad.push('no power: ' + JSON.stringify(dark));
    // back to full: it comes back, it does not stay dim
    const back = setLevel(1); if (!(back.real > full.real * 0.9 && back.em > full.em * 0.9)) bad.push('the lamp did not come back after power returned: ' + JSON.stringify([full, back]));
    // a NaN level (a forged row, a solver glitch) darkens the lamp and never the screen
    const nanL = setLevel(NaN); if (!(Number.isFinite(nanL.real) && Number.isFinite(nanL.em))) bad.push('a NaN power level leaked into the light: ' + JSON.stringify(nanL));
    return bad.length === 0 || bad.join(' || ');
  });

  await T('audit_lantern.the-sky-colour-is-never-nan-whatever-the-light-sources-do', async () => {
    fresh({}); const bad = []; stand(0, 9);
    const keep = g.camSky; try {
      for (const v of [NaN, undefined, Infinity, -Infinity, 2, -1]) { g.camSky = v; try { adv(0.1); } catch (x) { bad.push('frame threw with camSky ' + v + ': ' + x.message); } const c = g.renderer.scene.background; if (c && !(Number.isFinite(c.r) && Number.isFinite(c.g) && Number.isFinite(c.b))) bad.push('the scene background is ' + [c.r, c.g, c.b] + ' after camSky ' + v); }
    } finally { g.camSky = keep; }
    const c = new THREE.Color(); void c;
    return bad.length === 0 || bad.join(' || ');
  });
}
