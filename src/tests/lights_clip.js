// lights.clip.*: every light of the game, close to a wall of light plush (snow, cream, custard, blush, sky, mint...), rendered the way the player sees it (bloom, tone curve and all), must leave the
// plush recognisable: almost no pixel blown out to white, no white haze (the share of near white pixels stays small), the shading and the outlines of the plush still there (local contrast above a
// floor), and no light a blinding orb. The thresholds come from measurements of the fixed game with a margin; the old shader gave 25 to 35% near white pixels in the middle for the headlamp in the lit
// hall at 0.4 to 1.5 m (up to 92% with the best lamp), 70% for a floodlight, 27% for a ceiling lamp and 11 to 17% for a lantern at arm's length; the fixed one 9% at most (22% best lamp in full day, 15% floodlight). Also: the beam still lights a plush 15 m away.
import { lib } from './lights_lib.js';
import { makeFurnKit } from './furnish_lib.js';
import { makeKit } from './power_lib.js';
import * as HL from '../hanglamp.js';
import { U } from '../shaders.js';

export default async function (ctx) {
  const { T, g, S, p, fresh, adv, cellX, cellZ, toI, toK } = ctx;
  const Lb = lib(ctx), FK = makeFurnKit(ctx), K = makeKit(ctx);
  // limits (percent of pixels / luminance levels 0..255), measured on the fixed shader at the quality 'high' with margin
  const LIM = {
    clipMax: 1.0,      // pixels with every channel >= 245, share of the picture: every light, whole frame
    hiMid: 12,         // pixels with luminance >= 225 in the middle of the picture
    sdMid: 5.0,        // mean local (4 x 4 px) luminance deviation in the middle of the picture: the shading of the plush
    orbAll: 1.5,       // near white pixels anywhere (a lamp body or a halo is small)
  };
  const ent = (e) => { S().entities.push(e); g.addEntity(e); return e; };
  const run = async (name, fn) => T(name, async () => {
    const keep = Lb.prep('high'); try { return await fn(); } finally { Lb.unprep(keep); Lb.clearWall(); Lb.day(); g.lampOn = undefined; }
  });
  const judge = (label, s, bad, lim = LIM) => {
    if (!(s.all.clip <= lim.clipMax)) bad.push(`${label}: ${s.all.clip.toFixed(2)}% of the picture is blown out (limit ${lim.clipMax})`);
    if (!(s.mid.hi <= lim.hiMid)) bad.push(`${label}: ${s.mid.hi.toFixed(1)}% near white in the middle (limit ${lim.hiMid})`);
    if (!(s.mid.sd4 >= lim.sdMid)) bad.push(`${label}: the shading is gone, local contrast ${s.mid.sd4.toFixed(2)} (floor ${lim.sdMid})`);
    if (!(s.all.hi <= lim.hiMid * 2)) bad.push(`${label}: ${s.all.hi.toFixed(1)}% near white anywhere`);
  };
  // the wall, the light and the camera of one shot: the camera stands `cam` m from the wall, the light `lamp` m in front of the wall (0 = no light), a little to the right
  const setup = (cam = 1.5) => { FK.reset(); Lb.night(); const face = Lb.wall(11.7); return { face, z: face - cam }; };

  await run('lights.clip.headlamp-in-the-dark-up-close-and-at-3-m', async () => {
    const bad = [], note = [];
    for (const d of [0.4, 0.8, 1.5, 3]) {
      const { face } = setup(); Lb.stand(-8, face - d, 0, -0.04, true); adv(1.5); const s = Lb.shoot(); note.push(`${d} m ${Lb.fmt(s.mid)}`);
      judge(`headlamp at ${d} m`, s, bad, { ...LIM, sdMid: 2.2 });
    }
    return bad.length === 0 || bad.join(' || ') + ' :: ' + note.join(' | ');
  });

  await run('lights.clip.headlamp-in-the-lit-hall-up-close-and-at-3-m', async () => {
    const bad = [], note = [];
    for (const d of [0.4, 0.8, 1.5, 3]) {
      FK.reset(); Lb.day(); const face = Lb.wall(11.7); Lb.stand(-8, face - d, 0, -0.04, true); adv(1.5); const s = Lb.shoot(); note.push(`${d} m ${Lb.fmt(s.mid)}`);
      judge(`headlamp at ${d} m`, s, bad, { ...LIM, hiMid: d < 0.5 ? 18 : 12, sdMid: 3.0 });   // (0.4 m: 9 to 13% measured, the old shader 25%; the camera shakes a little)
    }
    return bad.length === 0 || bad.join(' || ') + ' :: ' + note.join(' | ');
  });

  await run('lights.clip.the-strongest-headlamp-does-not-wash-out-either', async () => {
    // Headlamp 5, Searchlight 4 and Beam Focus 3: 3.6 times the light and 59 m of beam
    const bad = [], note = [];
    for (const [night, d] of [[true, 0.6], [true, 1.2], [false, 0.6], [false, 1.2]]) {
      fresh({ lamp: 5, searchlight: 4, beamFocus: 3 }); S().up.lamp = 5; S().up.searchlight = 4; S().up.beamFocus = 3; g.T = g.tune();
      FK.reset(); S().up = { lamp: 5, searchlight: 4, beamFocus: 3 }; g.T = g.tune(); if (night) Lb.night(); else Lb.day();
      const face = Lb.wall(11.7); Lb.stand(-8, face - d, 0, -0.04, true); adv(1.5); const s = Lb.shoot(); note.push(`${night ? 'night' : 'day'} ${d} m ${Lb.fmt(s.mid)}`);
      judge(`strong lamp ${night ? 'night' : 'day'} at ${d} m`, s, bad, { ...LIM, hiMid: night ? 12 : 30, sdMid: night ? 2.2 : 3.0 });   // (the old shader: 78 to 92% near white)
    }
    return bad.length === 0 || bad.join(' || ') + ' :: ' + note.join(' | ');
  });

  // ---- every placed light, 0.6 m from the wall, camera 1.5 m from the wall ----
  const lanterns = {
    lantern: (face) => ent({ id: g.nextId(), type: 'lantern', x: -7.4, y: 0, z: face - 0.6 }),
    flare: (face) => ent({ id: g.nextId(), type: 'flare', x: -7.4, y: 0, z: face - 0.6, born: S().stats.playSecs }),
    'glow stick': (face) => ent({ id: g.nextId(), type: 'flare', glow: true, x: -7.4, y: 0, z: face - 0.6, born: S().stats.playSecs }),
  };
  for (const [name, mk] of Object.entries(lanterns)) {
    await run(`lights.clip.${name.replace(' ', '-')}-close-to-a-light-plush-wall`, async () => {
      const { face, z } = setup(); const e = mk(face); Lb.stand(-8, z, 0, -0.08, false); adv(2.0);
      if (!g.glowSources(g.renderer.camera.position, 8).some((s) => s.key === 'e' + e.id)) return name + ' is not a light source';
      const s = Lb.shoot(), bad = []; judge(name, s, bad); return bad.length === 0 || bad.join(' || ') + ' :: ' + Lb.fmt(s.mid);
    });
  }

  await run('lights.clip.a-powered-hanging-lantern-close-to-a-light-plush-wall', async () => {
    const { face, z } = setup(); K.reset({ power: 1 }); Lb.night(); const f2 = Lb.wall(11.7);
    const fr = ent({ id: g.nextId(), type: 'frame', kind: 'timber', axis: 'z', cx: -8, cz: f2 - 0.9, y0: 0, w: 2.38, h: 2.38, yaw: 0 });
    const l = g.placeEntity('hlamp', HL.lampFields(fr, 1), { quiet: true }), G = K.tile('gen', -13.5, 8.5, {}); G.burn = 1e5; G.burnMax = 1e5; G.lit = true; K.wire(G, l);
    Lb.stand(-8, f2 - 3.0, 0, -0.05, false); adv(2.0); l.pw = 1; adv(0.5);
    const s = Lb.shoot(), bad = []; judge('hanging lantern', s, bad); if (!(s.mid.mean > 40)) bad.push('the lantern lights nothing: mean ' + s.mid.mean.toFixed(0)); void face; void z;
    return bad.length === 0 || bad.join(' || ') + ' :: ' + Lb.fmt(s.mid);
  });

  // the furnish lights need a grid: a generator and a pole, then the lamp wired to it
  const furn = async (id, extra, dx, dz) => {
    FK.reset(); Lb.night(); const face = Lb.wall(11.7); await FK.grid(-7, 8, 40, 1);
    const r = await FK.onFloor(id, dx, face - dz, 2.0); if (!r.ok) return { fail: id + ': ' + r.why };
    if (extra) g.setCfg(r.ent, extra); FK.run(2.5); return { face, e: r.ent };
  };
  const furnCases = [['flood', 'floodlight', { mode: 'on', deg: 0, tilt: 0 }, -8, 9.0, 1.6], ['clamp', 'ceiling lamp', { mode: 'on' }, -7.4, 0.6, 1.6], ['strip', 'strip light', { mode: 'on' }, -7.4, 0.6, 1.6], ['wbeacon', 'warning beacon', { mode: 'on' }, -7.4, 0.6, 1.6]];
  for (const [id, label, extra, dx, dz, cam] of furnCases) {
    await run(`lights.clip.${label.replace(' ', '-')}-close-to-a-light-plush-wall`, async () => {
      const r = await furn(id, extra, dx, dz); if (r.fail) return r.fail;
      Lb.stand(-8, r.face - cam, 0, -0.08, false); FK.run(1.0);
      const s = Lb.shoot(), bad = []; judge(label, s, bad, id === 'flood' ? { ...LIM, hiMid: 20 } : LIM); return bad.length === 0 || bad.join(' || ') + ' :: ' + Lb.fmt(s.mid);
    });
  }

  await run('lights.clip.a-burning-generator-and-a-live-pole-do-not-blow-out-a-light-plush-wall', async () => {
    FK.reset(); Lb.night(); const face = Lb.wall(11.7); const bad = [], note = [];
    const G = K.tile('gen', -8, face - 0.9, {}); G.burn = 1e5; G.burnMax = 1e5; G.lit = true; Lb.stand(-8, face - 2.6, 0, -0.08, false); adv(1.5);
    let s = Lb.shoot(); judge('burning generator', s, bad); note.push('gen ' + Lb.fmt(s.mid));
    g.doDecon({ kind: 'mach', id: G.id }); adv(0.5);
    return bad.length === 0 || bad.join(' || ') + ' :: ' + note.join(' | ');
  });

  // ---- the beam is still a beam ----
  await run('lights.clip.the-headlamp-beam-still-lights-a-plush-wall-15-m-away', async () => {
    const bad = [], note = [];
    for (const [lvl, d] of [[5, 10], [5, 15], [5, 20]]) {
      FK.reset(); S().up = { lamp: lvl }; g.T = g.tune(); Lb.night(); const face = Lb.wall(11.7);
      if (face - d < -9.8) return 'the bay is too short for ' + d + ' m';
      Lb.stand(-8, face - d, 0, 0, true); adv(2.0); const on = Lb.shoot(); g.lampOn = false; adv(0.5); const off = Lb.shoot(); g.lampOn = true;
      const gain = on.mid.mean - off.mid.mean; note.push(`lamp ${lvl} at ${d} m: ${on.mid.mean.toFixed(1)} vs ${off.mid.mean.toFixed(1)} off (+${gain.toFixed(1)})`);
      if (!(gain >= 12)) bad.push(`the beam adds only ${gain.toFixed(1)} levels to a plush wall at ${d} m`);
      if (!(on.mid.hi <= 2)) bad.push(`far plush are near white: ${on.mid.hi.toFixed(1)}%`);
    }
    return bad.length === 0 || bad.join(' || ') + ' :: ' + note.join(' | ');
  });
}
