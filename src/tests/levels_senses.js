// Levels audit: Light, Sensors and Mobility. Searchlight, Beam Focus, Deep Array, Remains Radar, Seismic Assay, Hover Boots, Crawl Rails and
// Rocket Boots, level by level, measured in the shader, the HUD and the running player physics.
import { basics, numbers, reqUp } from './levels_common.js';
import { U as SH } from '../shaders.js';

export default async function (ctx) {
  const { g, S, w, p, T, fresh, adv, near, V3, UPGRADES, newWorld } = ctx;
  const U = (id) => UPGRADES.find((u) => u.id === id);
  for (const id of ['searchlight', 'beamFocus']) await basics(ctx, 'light', id);
  for (const id of ['deepArray', 'radar', 'seismicAssay']) await basics(ctx, 'sense', id);
  for (const id of ['hover', 'crawlRails', 'rocketBoots']) await basics(ctx, 'move', id);

  await numbers(ctx, 'light', 'searchlight', (t) => t.lampRange, (l, b) => b + 4 * l);
  await numbers(ctx, 'light', 'beamFocus', (t) => t.lampRange, (l, b) => b + 6 * l);
  await numbers(ctx, 'sense', 'deepArray', (t) => t.scanRange, (l, b) => b * Math.pow(1.5, l));
  await numbers(ctx, 'sense', 'radar', (t) => t.locatorCount, (l) => 1 + l);
  await numbers(ctx, 'sense', 'seismicAssay', (t) => t.assayFloor, (l) => 0.55 - 0.1 * l, 'down');
  await numbers(ctx, 'move', 'hover', (t) => t.walk, (l, b) => b * (1 + 0.1 * l));
  await numbers(ctx, 'move', 'crawlRails', (t) => t.crouchMul, (l, b) => b + 0.1 * l);
  await numbers(ctx, 'move', 'rocketBoots', (t) => t.jump, (l, b) => b + 0.7 * l);

  // ---------------------------------------------------------------- light
  await T('levels.light.searchlight-and-beam-focus.the-shader-and-the-spot-light-get-the-new-reach', async () => {
    fresh({ lamp: 5 }); g.lampOn = undefined; let prevR = 0, prevP = 0;
    const steps = [];
    for (let l = 0; l <= 4; l++) steps.push([{ lamp: 5, searchlight: l }, 25 + 4 * l, 2.4 + 0.3 * l]);
    for (let l = 1; l <= 3; l++) steps.push([{ lamp: 5, searchlight: 4, beamFocus: l }, 41 + 6 * l, 3.6]);
    for (const [up, R, P] of steps) {
      fresh(up); g.lampOn = undefined; p().pos.set(0, 0, -1.4); adv(0.15);
      if (!near(g.T.lampRange, R, 1e-9) || !near(g.T.lampPower, P, 1e-9)) return `tuning ${g.T.lampRange} / ${g.T.lampPower} for ${JSON.stringify(up)}, expected ${R} / ${P}`;
      if (!near(SH.uLampRange.value, R, 1e-6)) return `shader range ${SH.uLampRange.value}, expected ${R}`;
      if (!near(SH.uLampColor.value.r, 2.6 * P, 1e-4) || !near(g.camLamp.intensity, 22 * P, 1e-4) || !near(g.camLamp.distance, R + 4, 1e-6)) return 'the lamp, the shader colour or the spot light was not updated';
      if (!(R > prevR - 1e-9) || !(P >= prevP - 1e-9)) return 'not brighter or longer than the step before'; prevR = R; prevP = P;
    }
    g.lampOn = false; adv(0.15); const off = SH.uLampColor.value.r; g.lampOn = undefined; adv(0.15); return (off === 0 && SH.uLampColor.value.r > 0) || 'the lamp switch no longer turns it off';
  });

  // ---------------------------------------------------------------- sensors
  const spy = () => {
    const rec = { compass: null, signal: null };
    const o = { c: g.ui.setCompass, s: g.ui.setSignal };
    g.ui.setCompass = function (...a) { rec.compass = a; return o.c.apply(this, a); };
    g.ui.setSignal = function (...a) { rec.signal = a; return o.s.apply(this, a); };
    rec.off = () => { g.ui.setCompass = o.c; g.ui.setSignal = o.s; };
    return rec;
  };
  const hud = (sec = 0.3) => { g.hudT = 0; g.locT = 0; g.sigLevel = 0; adv(sec, 0.05); };
  const place = (x, z, yaw = Math.PI / 2) => { p().pos.set(x, 0, z); p().vel.set(0, 0, 0); p().yaw = yaw; p().pitch = 0; };

  await T('levels.sense.deepArray.the-meter-reads-stronger-and-the-one-shows-from-further', async () => {
    fresh({ ...reqUp(UPGRADES, U('deepArray')), compass: 1 }); const rec = spy(); const real = g.needlePos; let np = null; g.needlePos = () => np; let prevMeter = -1;
    try {
      for (let l = 0; l <= 4; l++) {
        S().up.deepArray = l; g.T = g.tune(); const R = 6800 * Math.pow(1.5, l); if (!near(g.T.scanRange, R, 1e-6)) return `scanRange ${g.T.scanRange}`;
        place(0, -1.4); adv(0.1); const cam = g.renderer.camera.position; const at = (d) => { np = { x: cam.x + d, y: cam.y, z: cam.z }; };
        at(R * 1.05); hud(); if (rec.compass[2].some((m) => m.label === 'ONE')) return `level ${l}: ONE marked beyond the range`; if (rec.signal[3] !== 'no signal') return `level ${l}: no 'no signal' beyond the range`;
        at(R * 0.95); hud(); if (!rec.compass[2].some((m) => m.label === 'ONE')) return `level ${l}: ONE not marked inside the range`;
        // the same 6 km away reads stronger with every level
        at(6000); hud(); const meter = rec.signal[1]; if (R > 6000 && !(meter > prevMeter)) return `level ${l}: meter ${meter.toFixed(3)} at 6 km, not above ${prevMeter.toFixed(3)}`; if (R > 6000) prevMeter = meter;
        const want = Math.pow(Math.max(0, 1 - 6000 / R), 0.6); if (R > 6000 && Math.abs(meter - want) > 0.01) return `level ${l}: meter ${meter.toFixed(3)}, expected ${want.toFixed(3)}`;
      }
    } finally { g.needlePos = real; rec.off(); }
    return true;
  });

  await T('levels.sense.radar.the-compass-marks-more-abandoned-digs-per-level', async () => {
    await newWorld(); fresh({ ...reqUp(UPGRADES, U('radar')), compass: 1 }); const rec = spy();
    try {
      // somewhere with plenty of dig sites around
      let spot = null; for (let x = 700; x < 3400 && !spot; x += 150) for (const z of [400, -400, 900]) { const near4 = w().remainsNearN(x, z, 600, 6); if (near4.length >= 5) { spot = { x, z, list: near4 }; break; } } if (!spot) return 'no place with five dig sites in reach to test with';
      for (let l = 0; l <= 3; l++) {
        S().up.radar = l; g.T = g.tune(); place(spot.x, spot.z); hud(0.4); const marks = rec.compass[2].filter((m) => m.label === 'GEAR');
        if (marks.length !== 1 + l) return `level ${l}: ${marks.length} GEAR marks, expected ${1 + l}`;
        // they point at the nearest sites, nearest first
        // every mark points at one of the nearest sites (the player may have been nudged a little while the HUD ran, so allow a few degrees)
        const px = p().pos.x, pz = p().pos.z, sites = w().remainsNearN(px, pz, 600, 7).map((q) => ((Math.atan2(q.x - px, -(q.z - pz)) * 180 / Math.PI) % 360 + 360) % 360);
        for (const m of marks) if (!sites.some((b) => Math.abs(((b - m.b + 540) % 360) - 180) < 15)) return `level ${l}: a mark at ${Math.round(m.b)} points at no nearby dig (${sites.map(Math.round)})`;
      }
      // without the Remains Locator nothing is marked at all (the radar is an extra, not a replacement)
      fresh({ compass: 1 }); place(spot.x, spot.z); hud(0.4); if (rec.compass[2].some((m) => m.label === 'GEAR')) return 'GEAR marked without the locator';
    } finally { rec.off(); }
    return true;
  });

  await T('levels.sense.seismicAssay.the-vein-meter-starts-climbing-sooner', async () => {
    fresh({ ...reqUp(UPGRADES, U('seismicAssay')) }); const bar = () => g.ui.dials.read('vein').frac;
    let vv = 0.2; const real = w().veinAt; w().veinAt = () => vv; const read = (v) => { vv = v; place(0, -1.4); hud(0.15); return bar(); };
    try {
      let prev = [];
      for (let l = 0; l <= 3; l++) {
        S().up.seismicAssay = l; g.T = g.tune(); const floor = 0.55 - 0.1 * l;
        const vals = [0.3, 0.5, 0.6, 0.75, 0.9].map(read); const want = [0.3, 0.5, 0.6, 0.75, 0.9].map((v) => Math.min(1, Math.max(0, (v - floor) / 0.4)));
        for (let q = 0; q < vals.length; q++) if (Math.abs(vals[q] - want[q]) > 0.03) return `level ${l}: meter ${vals.map((x) => x.toFixed(2))}, expected ${want.map((x) => x.toFixed(2))}`;
        if (l && !(vals[1] > prev[1])) return 'the meter did not start climbing sooner at level ' + l; prev = vals;
      }
    } finally { w().veinAt = real; }
    return true;
  });

  // ---------------------------------------------------------------- mobility
  const settle = () => { g.keys = {}; p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); p().yaw = 0; p().pitch = 0; p().crouch = false; adv(0.5); };
  await T('levels.move.hover.walking-speed-rises-10-percent-a-level-on-top-of-the-shoes', async () => {
    for (let l = 0; l <= 5; l++) {
      fresh({ boots: 4, hover: l }); settle(); g.keys.KeyW = true; adv(0.7, 0.02); const v = Math.hypot(p().vel.x, p().vel.z); g.keys = {};
      const want = 4.0 * 1.48 * (1 + 0.1 * l); if (!near(v, want, want * 0.03)) return `walking speed ${v.toFixed(2)} at level ${l}, expected ${want.toFixed(2)}`;
    }
    return true;
  });
  await T('levels.move.crawlRails.crawling-in-a-tunnel-is-faster-per-level', async () => {
    let prev = 0;
    for (let l = 0; l <= 3; l++) {
      fresh({ knees: 3, crawlRails: l }); settle(); g.keys.KeyC = true; g.keys.KeyW = true; adv(0.9, 0.02); const v = Math.hypot(p().vel.x, p().vel.z); const crouched = p().crouch; g.keys = {};
      if (!crouched) return 'player did not crouch'; const want = 4.0 * (0.95 + 0.1 * l); if (!near(v, want, want * 0.04)) return `crawl speed ${v.toFixed(2)} at level ${l}, expected ${want.toFixed(2)}`;
      if (!(v > prev)) return 'crawl not faster than the level before'; prev = v;
    }
    fresh({ knees: 3, crawlRails: 3 }); settle(); g.keys.KeyW = true; adv(0.7, 0.02); const w0 = Math.hypot(p().vel.x, p().vel.z); g.keys = {}; return near(w0, 4.0, 0.15) || 'the rails changed walking speed: ' + w0;
  });
  await T('levels.move.rocketBoots.jump-height-follows-the-launch-speed', async () => {
    let prev = 0; const hs = [];
    for (let l = 0; l <= 3; l++) {
      fresh({ springs: 3, rocketBoots: l }); settle(); const y0 = p().pos.y; g.keys.Space = true; let top = y0;
      for (let n = 0; n < 200; n++) { adv(0.01, 0.01); g.keys.Space = false; top = Math.max(top, p().pos.y); }
      const h = top - y0; hs.push(+h.toFixed(2)); const v = 6 + 0.9 * 3 + 0.7 * l, want = v * v / (2 * 21);
      if (!near(h, want, want * 0.08)) return `jump height ${h.toFixed(2)} at level ${l}, physics says ${want.toFixed(2)}: ${hs}`; if (!(h > prev)) return 'not higher than the level before: ' + hs; prev = h;
    }
    return true;
  });
}
