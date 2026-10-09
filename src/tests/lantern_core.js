// lantern.*: lanterns, flares, glow sticks and hanging lanterns are small warm lamps that light their surroundings for real (src/lanternlight.js):
// the body is modest (no blinding emissive orb), the plush shader gets each lantern with its radius and colour and a believable falloff, a capped pool of real
// THREE.PointLights follows the nearest few for frames, machines and the floor, a hanging lantern dims with its grid and goes dark without power, and a flare
// or a glow stick burns down over its lifetime.
import * as THREE from 'three';
import * as LL from '../lanternlight.js';
import * as HL from '../hanglamp.js';
import { U, pointAtten, pointLight, PT_FALLOFF, PT_SHOULDER } from '../shaders.js';
import { makeKit, UP } from './power_lib.js';

export default async function (ctx) {
  const { T, g, S, p, fresh, adv } = ctx;
  const K = makeKit(ctx);
  const lum = (c) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  const lantern = (x, z, extra = {}) => { const e = { id: g.nextId(), type: 'lantern', x, y: 0, z, ...extra }; S().entities.push(e); g.addEntity(e); return e; };
  const flare = (x, z, glow, age = 0) => { const e = { id: g.nextId(), type: 'flare', x, y: 0, z, born: S().stats.playSecs - age, ...(glow ? { glow: true } : {}) }; S().entities.push(e); g.addEntity(e); return e; };
  const stand = (x, z) => { p().pos.set(x, 0, z); p().vel.set(0, 0, 0); p().yaw = 0; g.stowed = true; };
  const poolOf = () => { const out = []; g.renderer.scene.traverse((o) => { if (o.isPointLight && o.name.startsWith('lanternPool')) out.push(o); }); return out; };
  const allPoint = () => { let n = 0; g.renderer.scene.traverse((o) => { if (o.isPointLight) n++; }); return n; };
  const lit = () => poolOf().filter((l) => l.intensity > 0.05);
  const meshes = (o) => { const out = []; o.traverse((m) => { if (m.isMesh) out.push(m); }); return out; };

  await T('lantern.the-bodies-are-small-warm-lamps-not-blinding-orbs', async () => {
    fresh({}); const bad = [];
    const M = g.machines, lan = M.makeLantern(), fl = M.makeSimple('flare', null), gs = M.makeSimple('glow', null);
    const box = new THREE.Box3().setFromObject(lan), size = box.getSize(new THREE.Vector3());
    if (!(size.y > 0.2 && size.y < 0.42 && size.x < 0.25 && size.z < 0.25)) bad.push('the lantern is ' + JSON.stringify(size));
    const glass = lan.getObjectByName('glass'); if (!glass) bad.push('no glass'); else {
      const e = glass.material.emissive, k = glass.material.emissiveIntensity, peak = Math.max(e.r, e.g, e.b) * k, l = lum(e) * k;
      if (!(peak >= 0.8 && peak <= 1.6 && l >= 0.7 && l <= 1.3)) bad.push(`the glass peaks at ${peak.toFixed(2)} (luminance ${l.toFixed(2)}): modest is 0.8 to 1.6, the old orb was 4`);
    }
    for (const [name, o] of [['lantern', lan], ['flare', fl], ['glow stick', gs]]) for (const m of meshes(o)) {
      const c = m.material && m.material.isMeshBasicMaterial ? m.material.color : null;
      if (c && (Math.max(c.r, c.g, c.b) > 2.6 || lum(c) > 1.7)) bad.push(`${name} has an unlit part at ${Math.max(c.r, c.g, c.b).toFixed(2)}: a blinding blob under the bloom`);
    }
    const e = lantern(-8, 8), it = g.machines.items.get(e.id), halo = it.obj.getObjectByName('halo');
    if (!halo) bad.push('a placed lantern has no halo'); else {
      const hc = halo.material.color, peak = Math.max(hc.r, hc.g, hc.b) * LL.HALO_BASE * 0.9;
      if (!(halo.userData.size <= 0.8 && LL.HALO_BASE <= 0.9 && lum(hc) * LL.HALO_BASE < 0.7 && peak < 0.95)) bad.push('the halo is big or strong: ' + halo.userData.size + ' / ' + LL.HALO_BASE + ' / ' + peak.toFixed(2));
      LL.haloFade(halo, 0.5); const close = halo.material.opacity, cs = halo.scale.x; LL.haloFade(halo, 20); const far = halo.material.opacity, fs = halo.scale.x;
      if (!(far > close * 4 && far > 0.5)) bad.push(`the halo reads ${far.toFixed(2)} from 20 m but ${close.toFixed(2)} at 0.5 m: it must be a clear dot far off and thin up close`);
      if (!(fs > cs * 1.5 && fs < 2.2)) bad.push(`the halo does not grow a little with distance: ${cs} then ${fs}`);
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await T('lantern.the-shader-gets-each-lantern-with-its-radius-and-colour', async () => {
    fresh({}); const bad = [], a = lantern(-9, 9), b = lantern(-6, 9), f = flare(-12, 9, false), gl = flare(-3, 9, true);
    stand(-8, 5); adv(0.2);
    const src = g.glowSources(g.renderer.camera.position, 8), find = (e) => src.find((s) => s.key === 'e' + e.id);
    for (const [e, r, c, nm] of [[a, LL.LANTERN_R, LL.LANTERN_COLOR, 'lantern'], [b, LL.LANTERN_R, LL.LANTERN_COLOR, 'lantern'], [f, LL.FLARE_R, LL.FLARE_COLOR, 'flare'], [gl, LL.GLOW_R, LL.GLOW_COLOR, 'glow stick']]) {
      const s = find(e); if (!s) { bad.push(nm + ' is not a source'); continue; }
      if (!(s.real && typeof s.key === 'string')) bad.push(nm + ' does not ask for a real light');
      if (nm === 'lantern' && (s.r !== r || Math.abs(s.cr - c[0]) > 1e-6 || Math.abs(s.cg - c[1]) > 1e-6 || Math.abs(s.cb - c[2]) > 1e-6)) bad.push(`lantern ${JSON.stringify([s.r, s.cr, s.cg, s.cb])}`);
      if (nm !== 'lantern' && (!(s.r <= r + 1e-6 && s.r > r * 0.5) || !(s.cr > 0 && s.cr <= c[0] + 1e-6))) bad.push(`${nm} ${JSON.stringify([s.r, s.cr, s.cg, s.cb])}`);
      if (!(s.y > e.y + 0.05 && s.y < e.y + 0.5)) bad.push(nm + ' light is at the floor, not at the flame: ' + s.y);
    }
    // the uniforms the plush shader reads: radius in w, colour next to it
    const seen = []; for (let i = 1; i < 9; i++) { const v = U.uPt.value[i]; if (v.y > -900) seen.push([v.x, v.z, v.w, U.uPtCol.value[i].r]); }
    const mine = seen.find((q) => Math.abs(q[0] + 9) < 0.01 && Math.abs(q[1] - 9) < 0.01);
    if (!mine || mine[2] !== LL.LANTERN_R || Math.abs(mine[3] - LL.LANTERN_COLOR[0]) > 1e-3) bad.push('uPt has ' + JSON.stringify(seen));
    return bad.length === 0 || bad.join(' || ');
  });

  await T('lantern.the-falloff-lights-a-room-and-leaves-a-faint-glow-at-the-edge', async () => {
    const R = LL.LANTERN_R, c = LL.LANTERN_COLOR[0], at = (d) => pointLight(d, R, 1) * c, bad = [];
    const v = [1, 2, 4, 6, 8, 10, 12, 14, 15].map(at);
    for (let i = 1; i < v.length; i++) if (!(v[i] <= v[i - 1] + 1e-9)) bad.push('not falling at ' + i);
    if (!(at(2) > 1.2)) bad.push('a lantern should give more than 1.2 within 2 m: ' + at(2).toFixed(2));
    if (!(at(5) > 0.5)) bad.push('the room (5 m) is too dim: ' + at(5).toFixed(2));
    if (!(at(10) > 0.08 && at(10) < 0.5)) bad.push('10 m should be a faint glow: ' + at(10).toFixed(2));
    if (!(at(14) > 0 && at(14) < 0.05)) bad.push('14 m should be almost nothing: ' + at(14).toFixed(3));
    if (at(R) !== 0 || at(R + 3) !== 0) bad.push('the light does not end at its radius');
    // the floor right under a lantern is a pool, not a white blob: the closest surface gets no more than about 2.3 (the plush times that stays under a blown out 1.5 after the tone curve)
    if (!(at(0.05) < 2.3 && at(0.05) > at(2)) || !(PT_SHOULDER > 0 && pointLight(0.05, R) < pointAtten(0.05, R))) bad.push('the near field is not eased: ' + at(0.05).toFixed(2));
    if (!(Math.abs(pointLight(10, R) / pointAtten(10, R) - 1) < 0.05)) bad.push('the far field should be left as it was');
    if (!(R >= 12 && R <= 15) || PT_FALLOFF > 0.2) bad.push(`radius ${R}, falloff ${PT_FALLOFF}`);
    return bad.length === 0 || bad.join(' || ') + ' :: ' + v.map((x) => x.toFixed(2)).join(' ');
  });

  await T('lantern.real-point-lights-are-a-capped-pool-that-follows-the-nearest-lanterns', async () => {
    fresh({}); const bad = [];
    const pool = poolOf(); if (pool.length !== LL.POOL || LL.POOL > 6) bad.push('pool of ' + pool.length);
    const n0 = allPoint(); stand(-12, 9); adv(0.4);
    const xs = [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8]; const ls = xs.map((x) => lantern(x, 9));
    adv(1.5);
    if (allPoint() !== n0) bad.push(`the number of point lights changed with the lanterns: ${n0} to ${allPoint()}`);
    const on = lit(); if (on.length > LL.POOL || on.length < 1) bad.push(on.length + ' real lights lit for 10 lanterns');
    const nearest = ls.slice().sort((a, b) => Math.hypot(a.x + 12, a.z - 9) - Math.hypot(b.x + 12, b.z - 9)).slice(0, LL.POOL);
    for (const e of nearest) if (!on.some((l) => Math.abs(l.position.x - e.x) < 0.01 && Math.abs(l.position.z - e.z) < 0.01)) bad.push(`the lantern at x ${e.x} has no real light`);
    for (const l of on) { if (!(l.position.y > 0.05 && l.position.y < 0.6)) bad.push('a real light is at ' + l.position.y); if (!(l.distance >= 6 && l.distance <= 16)) bad.push('range ' + l.distance); if (!(l.color.r >= l.color.b)) bad.push('not warm'); }
    // walk to the other end: the lights move over, nothing is added
    stand(12, 9); adv(1.5); const on2 = lit(); const far = ls.slice().sort((a, b) => Math.abs(b.x - 12) - Math.abs(a.x - 12)).reverse().slice(0, LL.POOL);
    for (const e of far) if (!on2.some((l) => Math.abs(l.position.x - e.x) < 0.01)) bad.push(`after walking, the lantern at x ${e.x} has no light`);
    if (allPoint() !== n0) bad.push('the light count changed after walking');
    // no lanterns: the pool goes dark
    for (const e of ls) g.doDecon({ kind: 'mach', id: e.id }); adv(2.5);
    if (lit().length) bad.push('the pool is still lit with no lantern: ' + lit().length);
    return bad.length === 0 || bad.join(' || ');
  });

  await T('lantern.the-real-light-eases-in-and-out-instead-of-popping', async () => {
    fresh({}); const bad = []; stand(0, 9); adv(0.3);
    const e = lantern(0, 11); adv(0.05); const first = Math.max(0, ...poolOf().map((l) => l.intensity)); adv(1.2); const full = Math.max(...poolOf().map((l) => l.intensity));
    if (!(first < full * 0.6 && full > 1)) bad.push(`first ${first.toFixed(2)} full ${full.toFixed(2)}`);
    g.doDecon({ kind: 'mach', id: e.id }); adv(0.05); const mid = Math.max(...poolOf().map((l) => l.intensity)); if (!(mid > full * 0.3)) bad.push('it blinked out at once: ' + mid.toFixed(2));
    adv(2); if (lit().length) bad.push('still lit');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('lantern.a-flare-and-a-glow-stick-burn-down-over-their-lifetime', async () => {
    fresh({}); const bad = [];
    const lv = (age, glow) => { let m = 0; for (let t = 0; t < 40; t++) m = Math.max(m, LL.flareLevel(age, glow, t * 0.37, 3)); return m; };
    const fl = [0, 60, 120, 190, 210, 225, 239, 240, 250].map((a) => lv(a, false)), gl = [0, 150, 300, 450, 520, 580, 599, 600, 700].map((a) => lv(a, true));
    if (!(fl[0] > 0.95 && fl[2] > 0.9 && fl[3] > 0.9)) bad.push('a flare does not burn at full strength for most of its life: ' + fl.slice(0, 4));
    if (!(fl[4] < 0.85 && fl[4] > 0.5 && fl[5] < 0.5 && fl[5] > 0.15 && fl[6] < 0.1)) bad.push('a flare does not die down over its last 40 s: ' + fl);
    if (fl[7] !== 0 || fl[8] !== 0) bad.push('a spent flare still gives light');
    for (let i = 1; i < gl.length; i++) if (!(gl[i] <= gl[i - 1] + 1e-9)) bad.push('the glow stick got brighter at step ' + i);
    if (!(gl[0] === 1 && gl[2] < 0.95 && gl[3] < gl[2] && gl[5] < 0.4 && gl[7] === 0)) bad.push('a glow stick does not dim slowly and go out: ' + gl);
    // in the game: the source of a flare near its end is dimmer and smaller than a fresh one, and a spent one is gone
    stand(0, 9); adv(0.2);
    const a = flare(-2, 11, false, 0), b = flare(2, 11, false, LL.FLARE_LIFE - 12); adv(0.1);
    const src = g.glowSources(g.renderer.camera.position, 8), sa = src.find((s) => s.key === 'e' + a.id), sb = src.find((s) => s.key === 'e' + b.id);
    if (!sa || !sb) bad.push('missing a source: ' + !!sa + ' ' + !!sb); else if (!(sb.cr < sa.cr * 0.7 && sb.r < sa.r)) bad.push(`an old flare is not dimmer: ${sb.cr} vs ${sa.cr}, radius ${sb.r} vs ${sa.r}`);
    // the model dims with it
    const tipA = g.machines.items.get(a.id).obj.getObjectByName('tip'), tipB = g.machines.items.get(b.id) && g.machines.items.get(b.id).obj.getObjectByName('tip');
    if (tipA && tipB && !(lum(tipB.material.color) < lum(tipA.material.color) * 0.75)) bad.push('the flare tip does not dim');
    S().stats.playSecs += 30; adv(0.3);
    if (g.machines.items.has(b.id)) bad.push('a spent flare was not taken down');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('lantern.a-guest-sees-a-full-flare-until-the-host-takes-it-down', async () => {
    fresh({}); const bad = []; const e = flare(0, 9, false, LL.FLARE_LIFE - 5);
    const keep = g.net.role, open = g.net.open;
    const gr = g.guestReady; try { g.net.open = true; g.net.role = 'guest'; g.guestReady = true; const s = LL.sourceOf(g, e); if (!s || !(s.cr > LL.FLARE_COLOR[0] * 0.99)) bad.push('a guest with its own play clock dimmed the flare: ' + (s && s.cr)); }
    finally { g.net.role = keep; g.net.open = open; g.guestReady = gr; }
    return bad.length === 0 || bad.join(' || ');
  });

  await T('lantern.hanging-lanterns-dim-with-the-grid-and-go-dark-without-power-with-matching-light', async () => {
    K.reset(UP); const bad = [];
    const fr = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'z', cx: -12, cz: 3, y0: 0, w: 2.38, h: 2.38, yaw: 0 }; S().entities.push(fr); g.addEntity(fr);
    const l = g.placeEntity('hlamp', HL.lampFields(fr, 0), { quiet: true });
    const G = K.tile('gen', -13.5, 8.5, {}); G.burn = 1e5; G.burnMax = 1e5; G.lit = true; const w = K.wire(G, l); if (!w.ok) return 'wire: ' + w.why;
    stand(-12, 6); adv(2.5);
    const it = g.machines.items.get(l.id), glass = it.obj.getObjectByName('glass'), halo = it.obj.getObjectByName('halo');
    const level = () => { const s = g.glowSources(g.renderer.camera.position, 8).find((q) => q.key === 'h' + l.id); const pl = lit().find((q) => Math.abs(q.position.x - l.x) < 0.02 && Math.abs(q.position.z - l.z) < 0.02); return { s: s && { ...s }, pl: pl ? { intensity: pl.intensity, distance: pl.distance } : null, em: glass.material.emissiveIntensity, ho: halo ? halo.material.opacity : -1, hv: halo ? halo.visible : false }; };   // (numbers, not the live light: the same pool light is reused by the next level)
    l.pw = 1; adv(1.5); const full = level();
    if (!full.s || !full.pl) return 'a powered hanging lantern is not a source with a real light: ' + JSON.stringify([!!full.s, !!full.pl]);
    if (full.s.r !== HL.LAMP_RANGE || !(HL.LAMP_RANGE >= 12 && HL.LAMP_RANGE <= 15)) bad.push('radius ' + full.s.r);
    // hold the level at one half (the solver would put it back): measure the lights the lamp asks for, which is what a brownout feeds
    const setLevel = (v) => { l.pw = v; for (let n = 0; n < 12; n++) { l.pw = v; g.time += 0.1; HL.tick(g, 0.1, false); g.glowSources(g.renderer.camera.position, 8); LL.update(g, g.glowSources(g.renderer.camera.position, 8), 0.1); } return level(); };
    const h1 = setLevel(1), h5 = setLevel(0.5), h0 = setLevel(0);
    if (!(h5.s && Math.abs(h5.s.cr / h1.s.cr - 0.5) < 0.02)) bad.push('half power is not half the shader colour: ' + (h5.s && h5.s.cr / h1.s.cr));
    if (!(h5.pl && h1.pl && Math.abs(h5.pl.intensity / h1.pl.intensity - 0.5) < 0.1)) bad.push('half power is not half the real light: ' + JSON.stringify([h1.pl && h1.pl.intensity, h5.pl && h5.pl.intensity, h1.s && h1.s.cr, h5.s && h5.s.cr]));
    if (!(h5.em < h1.em * 0.65 && h5.em > 0.3) || !(h5.ho < h1.ho)) bad.push(`the glass and halo did not dim: ${h1.em} ${h5.em}, ${h1.ho} ${h5.ho}`);
    if (h0.s) bad.push('an unpowered lantern is a light source');
    if (h0.pl) bad.push('an unpowered lantern still has a real light: ' + h0.pl.intensity);
    if (h0.em !== 0) bad.push('the glass of a dead lantern glows: ' + h0.em);
    if (h0.hv) bad.push('a dead lantern has a halo');
    // switched off is dark too
    l.pw = 1; g.setCfg(l, { on: false }); const off = setLevel(1); if (off.s || off.pl) bad.push('a switched off lantern lights');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('lantern.every-lamp-body-stays-under-the-bloom-threshold', async () => {
    // the bloom pass starts at 0.92 after the tone curve; the glass at full level must not be many times that
    const g1 = (() => { const grp = HL.buildLamp({ x: 0, y: 1, z: 0 }); HL.paint(grp, 1, null); return grp.getObjectByName('glass').material; })();
    const peak = Math.max(g1.emissive.r, g1.emissive.g, g1.emissive.b) * g1.emissiveIntensity;
    return (peak > 0.8 && peak < 1.7) || 'hanging lantern glass peaks at ' + peak.toFixed(2);
  });
}
