// Upgrade audit: Sensors (Air Monitor, Brass Compass, Floor Plan, Squeak Ear, Remains Locator, Vein Assay).
import { purchaseTests } from './upg_common.js';
import { REMAINS, species, isSpecialCell } from '../plushdata.js';
import { EXIT_X } from '../config.js';

export default async function (ctx) {
  const { g, S, w, p, T, fresh, adv, near, V3, toI, toK, cellX, cellZ } = ctx;
  for (const id of ['airmon', 'compass', 'plan', 'scan', 'locator', 'assay']) await purchaseTests(ctx, id, 'sense');

  // capture what the HUD is told, frame by frame
  const spy = () => {
    const rec = { compass: null, signal: null, geiger: [], air: null };
    const o = { c: g.ui.setCompass, s: g.ui.setSignal, a: g.ui.setAir, ge: g.sound.geiger };
    g.ui.setCompass = function (...a) { rec.compass = a; return o.c.apply(this, a); };
    g.ui.setSignal = function (...a) { rec.signal = a; return o.s.apply(this, a); };
    g.ui.setAir = function (...a) { rec.air = a; return o.a.apply(this, a); };
    g.sound.geiger = function (dt, prox) { rec.geiger.push(prox); return o.ge.apply(this, arguments); };
    rec.off = () => { g.ui.setCompass = o.c; g.ui.setSignal = o.s; g.ui.setAir = o.a; g.sound.geiger = o.ge; };
    return rec;
  };
  const hud = (rec, sec = 0.3) => { rec.compass = null; rec.signal = null; rec.geiger.length = 0; rec.air = null; g.hudT = 0; g.locT = 0; g.sigLevel = 0; adv(sec, 0.05); };
  const place = (x, z, yaw = Math.PI / 2) => { p().pos.set(x, 0, z); p().vel.set(0, 0, 0); p().yaw = yaw; p().pitch = 0; };

  await T('upg.sense.compass.effect', async () => {
    fresh({}); const rec = spy();
    try {
      place(0, -1.4); hud(rec); if (rec.compass && rec.compass[0]) return 'compass shown without the upgrade';
      S().money = 1e12; if (!g.buy('compass')) return 'could not buy';
      place(7, -3.2, Math.PI / 2); hud(rec);
      if (!rec.compass || !rec.compass[0]) return 'compass not shown after purchase';
      const [, heading, markers, text] = rec.compass;
      if (!near(heading, 90, 1.5) || !/HDG 09\d° E\b/.test(text)) return 'heading wrong: ' + text;
      if (!/E -?\d+\s+S -?\d+/.test(text)) return 'coordinates missing: ' + text;
      { const mm = /E (-?\d+)\s+S (-?\d+)/.exec(text); if (Math.abs(+mm[1] - p().pos.x) > 1 || Math.abs(+mm[2] - p().pos.z) > 1) return 'coordinates wrong: ' + text; }
      if (/EXIT/.test(text) || markers.some((m) => m.label === 'EXIT')) return 'exit marker without Floor Plan';
      // facing south and north
      place(0, 0, 0); hud(rec); const south = rec.compass[1]; place(0, 0, Math.PI); hud(rec); const north = rec.compass[1];
      if (!(Math.abs(south - 180) < 2 && (north < 2 || north > 358))) return `headings south ${south} north ${north}`;
    } finally { rec.off(); }
    return true;
  });

  await T('upg.sense.plan.effect', async () => {
    fresh({ compass: 1 }); const rec = spy();
    try {
      place(10, 4); hud(rec); if (rec.compass[2].some((m) => m.label === 'EXIT')) return 'EXIT without Floor Plan';
      S().money = 1e12; if (!g.buy('plan')) return 'could not buy';
      for (const [x, z] of [[10, 4], [-30, 0], [20, -50]]) {
        place(x, z); hud(rec); const [, , markers, text] = rec.compass; const m = markers.find((q) => q.label === 'EXIT'); if (!m) return 'no EXIT marker';
        const ex = EXIT_X - p().pos.x, ez = -p().pos.z; const want = ((Math.atan2(ex, -ez) * 180 / Math.PI) % 360 + 360) % 360;
        const dd = Math.abs(((m.b - want + 540) % 360) - 180); if (dd > 0.5) return `exit bearing ${m.b} vs ${want}`;
        if (z > 0 && !(m.b < 90) || z < 0 && !(m.b > 90)) return 'exit is on the wrong side: bearing ' + m.b + ' at z ' + z;
        const num = +(/EXIT (\d+) m/.exec(text) || [])[1]; if (!near(num, Math.hypot(ex, ez), 1.01)) return 'exit distance in text: ' + text;
      }
    } finally { rec.off(); }
    // Floor Plan is useless without a compass strip, so it cannot be bought first
    fresh({}); S().money = 1e12; return !g.buy('plan') || 'bought without compass';
  });

  await T('upg.sense.airmon.effect', async () => {
    fresh({}); const rec = spy();
    try {
      place(0, -1.4); g.dust.t = 99; g.dust.hostLevel = 0.5; g.dust.level = 0.5; g.dust.lung = 0.4; hud(rec, 0.15); const a0 = document.getElementById('air').classList.contains('hidden');
      if (!a0) return 'gauge shown without the upgrade';
      S().money = 1e12; if (!g.buy('airmon')) return 'could not buy';
      g.dust.t = 99; g.dust.hostLevel = 0.5; g.dust.level = 0.5; g.dust.lung = 0.4; hud(rec, 0.15);
      if (document.getElementById('air').classList.contains('hidden')) return 'gauge not shown with dust in the air';
      const dust = parseFloat(document.getElementById('airFill').style.width), lung = parseFloat(document.getElementById('lungFill').style.width);
      if (!near(dust, 50, 3) || !near(lung, 40, 3)) return `gauge shows dust ${dust}% lung ${lung}%`;
      g.dust.t = 99; g.dust.hostLevel = 0.9; g.dust.level = 0.9; g.dust.lung = 0.9; hud(rec, 0.15);
      if (document.getElementById('airTxt').textContent !== 'COUGHING') return 'no coughing warning at lung 0.9';
      g.dust.t = 99; g.dust.hostLevel = 0; g.dust.level = 0; g.dust.lung = 0; hud(rec, 0.15); // clean air: the gauge rests
    } finally { rec.off(); g.dust.t = 0; g.dust.hostLevel = 0; g.dust.level = 0; g.dust.lung = 0; }
    return true;
  });

  await T('upg.sense.scan.effect', async () => {
    fresh({ compass: 1 }); const rec = spy(); const R = [0, 7, 16, 40, 120, 350, 900, 2800, 6800]; const real = g.needlePos; let np = null;
    g.needlePos = () => np;
    try {
      for (let l = 0; l <= 8; l++) {
        S().up.scan = l; g.T = g.tune(); if (g.T.scanRange !== R[l]) return `scanRange ${g.T.scanRange} at level ${l}`;
        place(0, -1.4); adv(0.1);
        const cam = g.renderer.camera.position;
        const at = (d, dy = 0) => { const dh = Math.sqrt(Math.max(0, d * d - dy * dy)); np = { x: cam.x + dh, y: cam.y + dy, z: cam.z }; };
        // outside the range: nothing but "no signal"
        at(R[l] * 1.1 + 1); hud(rec);
        if (rec.compass[2].some((m) => m.label === 'ONE')) return `level ${l}: ONE marked beyond range`;
        if (l >= 2 && !(rec.signal[0] && rec.signal[3] === 'no signal')) return `level ${l}: no 'no signal' state beyond range`;
        if (l < 2 && rec.signal && rec.signal[0]) return `level ${l}: meter shown`;
        if (rec.geiger.some((q) => q > 0)) return `level ${l}: squeaks beyond range`;
        if (!l) { at(1); hud(rec); if (rec.signal && rec.signal[0]) return 'meter at level 0'; if (rec.geiger.some((q) => q > 0)) return 'squeaks at level 0'; continue; }
        // inside the range: what each tier adds
        const d = R[l] * 0.9, dy = R[l] >= 50 ? 8 : 0; at(d, dy); hud(rec);
        const [on, level, , dist, arrow] = rec.signal;
        if (on !== (l >= 2)) return `level ${l}: meter ${on}`;
        if (on && !(level > 0)) return `level ${l}: meter at zero inside the range`;
        if (arrow !== (l >= 3)) return `level ${l}: arrow ${arrow}`;
        if ((l >= 4) !== /^\d+ m/.test(dist)) return `level ${l}: distance text "${dist}"`;
        if (l >= 4 && Math.abs(parseFloat(dist) - d) > 1.5) return `level ${l}: says ${dist}, actual ${d.toFixed(1)}`;
        if ((l >= 5) !== /▲/.test(dist)) return `level ${l}: height text "${dist}"`;
        const one = rec.compass[2].some((m) => m.label === 'ONE'); if (one !== (l >= 3)) return `level ${l}: compass ONE mark ${one}`;
        // close up it squeaks at every tier
        at(Math.min(R[l] * 0.5, 25)); hud(rec); if (!rec.geiger.some((q) => q > 0)) return `level ${l}: no squeaks close up`;
        // each tier hears further than the one before it
        at(R[l - 1] * 1.15 + 0.5); hud(rec); if (!rec.compass || (l >= 2 && !rec.signal[0])) return 'hud lost';
        if (l >= 2 && R[l - 1] > 0) { const lvl2 = rec.signal[1]; if (!(lvl2 > 0)) return `level ${l} does not hear what level ${l - 1} misses (${R[l - 1]} m)`; }
      }
    } finally { g.needlePos = real; rec.off(); }
    return true;
  });

  await T('upg.sense.locator.effect', async () => {
    fresh({ compass: 1 }); const rec = spy(); const R = [0, 45, 110, 260, 600]; const restore = [];
    const gearMarks = () => rec.compass[2].filter((m) => m.label === 'GEAR');
    try {
      // without a compass strip it could not show anything: cannot be bought first
      fresh({}); S().money = 1e12; if (g.buy('locator')) return 'bought without compass';
      fresh({ compass: 1 });
      // pick a quiet spot, then loot every dig site closer than the distance under test, so the nearest one is exactly there
      const anchor = w().remainsNear(900, 900, 700); if (!anchor) return 'no dig site to test with';
      const test = (D) => {
        const px = anchor.x + D, pz = anchor.z; let n = 0;
        for (;;) { const r = w().remainsNear(px, pz, D - 1); if (!r || n++ > 5000) break; restore.push([r.i, r.k, w().get(r.i, 0, r.k), w().getVr(r.i, 0, r.k)]); w().setCell(r.i, 0, r.k, 0, 0); }
        const here = w().remainsNear(px, pz, 1500) || { d: 1e9, x: px + 1e6, z: pz }; if (here.d < D - 1) return null;
        return { px, pz, d: here.d, x: here.x, z: here.z };
      };
      let prevD = 0;
      for (let l = 1; l <= 4; l++) {
        S().up.locator = l; g.T = g.tune(); if (g.T.locatorRange !== R[l]) return `locatorRange ${g.T.locatorRange} at level ${l}`;
        // a dig site between the range of the level before and this one: seen now, not before
        const D = (R[l - 1] * 1.0 + R[l]) / 2 + (l === 1 ? 5 : 0);
        const t = test(D); if (!t) return 'could not stage a dig site at ' + D;
        place(t.px, t.pz); hud(rec, 0.4);
        const m = gearMarks(); if (m.length !== 1) return `level ${l}: dig site ${t.d.toFixed(0)} m away not marked (range ${R[l]})`;
        const want = ((Math.atan2(t.x - t.px, -(t.z - t.pz)) * 180 / Math.PI) % 360 + 360) % 360;
        if (Math.abs(((m[0].b - want + 540) % 360) - 180) > 15) return `bearing ${m[0].b} vs ${want}`;
        S().up.locator = l - 1; g.T = g.tune(); hud(rec, 0.4);
        if (l > 1 && gearMarks().length) return `level ${l - 1} already sees ${t.d.toFixed(0)} m, so level ${l} adds nothing here`;
        if (l === 1 && gearMarks().length) return 'level 0 marks it';
        // and beyond its own range: nothing
        S().up.locator = l; g.T = g.tune();
        const far = test(R[l] * 1.2); if (!far) return 'could not stage far site';
        place(far.px, far.pz); hud(rec, 0.4); if (gearMarks().length) return `level ${l} marks a site ${far.d.toFixed(0)} m away (range ${R[l]})`;
        prevD = D;
      }
      void prevD;
    } finally {
      rec.off(); for (const r of restore.reverse()) w().setCell(r[0], 0, r[1], r[2], r[3]);
    }
    return true;
  });

  await T('upg.sense.assay.effect', async () => {
    fresh({}); const rec = spy(); const bar = () => parseFloat(/scaleX\(([\d.]+)\)/.exec(document.getElementById('assayBar').style.transform)[1]);
    let vv = 0.2; w().veinAt = () => vv; const read = (v) => { vv = v; place(0, -1.4); hud(rec, 0.15); return bar(); };
    try {
      vv = 0.9; place(0, -1.4); hud(rec, 0.15); if (!document.getElementById('assay').classList.contains('hidden')) return 'meter shown without the upgrade';
      S().money = 1e12; if (!g.buy('assay')) return 'could not buy';
      const vals = [0.2, 0.55, 0.7, 0.8, 0.9, 0.95].map(read);
      if (document.getElementById('assay').classList.contains('hidden')) return 'meter not shown';
      for (let q = 2; q < vals.length; q++) if (!(vals[q] > vals[q - 1]) && vals[q - 1] < 0.999) return 'meter does not climb with the vein: ' + vals.map((x) => x.toFixed(2));
      if (!(vals[0] < 0.1 && near(vals[3], 0.625, 0.03) && vals[5] > 0.97)) return 'meter scale: ' + vals.map((x) => x.toFixed(2));
    } finally { delete w().veinAt; rec.off(); }
    // the meter means something: plush grown in veins are really rarer
    let hiS = 0, hiN = 0, loS = 0, loN = 0;
    for (let q = 0; q < 30000; q++) {
      const i = toI((Math.random() - 0.2) * 400), k = toK((Math.random() - 0.5) * 400), j = 1 + Math.floor(Math.random() * 8); const sp = w().get(i, j, k); if (!sp || isSpecialCell(sp)) continue;
      const v = w().veinAt(i, j, k), r = species[sp].rarity; if (v > 0.8) { hiS += r; hiN++; } else if (v < 0.45) { loS += r; loN++; }
    }
    return (hiN > 50 && loN > 50 && hiS / hiN > 2 * loS / loN) || `vein plush rarity ${(hiS / hiN).toFixed(2)} vs ${(loS / loN).toFixed(2)}`;
  });
  void REMAINS; void cellX; void cellZ;
}
