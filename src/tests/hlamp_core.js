// hlamp.*: powered hanging lanterns. They clip under the top beam of a support frame (mount point cx, cz, y0 + h, like the Support Fan),
// draw 1.6 kW (one 8 kW generator runs five), chain from a generator with Power Cables, dim as one line in a brownout and light the plush.
import { makeKit, UP } from './power_lib.js';
import * as HL from '../hanglamp.js';
import * as PP from '../powerparts.js';
import { U } from '../shaders.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, L, adv, recipes, craft, selectTool, plan, placeNow, aimPoint, p, cellX, cellZ, V3 } = ctx;
  const K = makeKit(ctx);
  const lamps = () => HL.lampsOf(g);
  let fx = -12;
  const frame = (x, z = 3, extra = {}) => { const e = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'z', cx: x, cz: z, y0: 0, w: 2.38, h: 2.38, yaw: 0, ...extra }; S().entities.push(e); g.addEntity(e); return e; };
  // a lantern straight onto a frame, the way the tool would put it (no item spent)
  const hang = (f, slot = 0) => { const ent = g.placeEntity('hlamp', HL.lampFields(f, slot), { quiet: true }); return ent; };
  // n frames in a row with a lantern each, chained generator -> 1 -> 2 -> ... n by Power Cables; returns { G, ls, fr }
  const line = (n, gkey, gx = -13.5, gz = 8.5) => {
    const G = K.tile('gen', gx, gz, gkey ? { gk: gkey } : {}); G.burn = 1e5; G.burnMax = 1e5; G.lit = true;
    const fr = [], ls = [];
    for (let q = 0; q < n; q++) { const f = frame(-12 + q * 2.6); fr.push(f); ls.push(hang(f, 0)); }
    let prev = G; for (const l of ls) { const r = K.wire(prev, l); if (!r.ok) throw new Error('wire: ' + r.why); prev = l; }
    return { G, ls, fr };
  };
  const reset = (up = UP) => { K.reset(up); };   // fresh() inside it clears every ent, frames and lanterns too
  const pws = (ls) => ls.map((l) => Math.round((l.pw ?? 0) * 1000) / 1000);

  await T('hlamp.bench-row-and-numbers', async () => {
    reset({ power: 1 });
    const bad = [];
    const r = recipes(g).find((q) => q.id === 'hlamp'); if (!r) return 'no bench row once you own Power Grid';
    if (r.kind !== 'hlamp' || r.price !== HL.LAMP_PRICE * 3 || r.name !== 'Hanging Lantern' || !/top beam/.test(r.desc) || !/Power Cable/.test(r.use) || !/frame/.test(r.use)) bad.push('row ' + JSON.stringify([r.kind, r.price, r.name]));
    if (HL.LAMP_KW !== 1.6 || HL.LAMP_MAX_PER_SOURCE !== 5 || Math.round(8 / HL.LAMP_KW) !== 5) bad.push('one 8 kW generator should run five lanterns');
    reset({}); if (recipes(g).some((q) => q.id === 'hlamp')) bad.push('craftable before Power Grid');
    return bad.length === 0 || bad.join('; ');
  });

  await T('hlamp.mount-point-is-the-frames-cx-cz-and-top-and-works-for-any-frame-size', async () => {
    reset(); const bad = [];
    for (const [w, h, x] of [[2.38, 2.38, -12], [2.4, 2.4, -8], [4.8, 4.8, -4], [1.2, 3.6, 0]]) {
      const f = frame(x, 3, { w, h }), e = hang(f, 0);
      if (Math.abs(e.x - (f.cx + HL.LAMP_SIDE)) > 1e-9 || Math.abs(e.z - f.cz) > 1e-9) bad.push(`${w}x${h}: x,z ${e.x},${e.z}`);
      if (Math.abs(e.y - (f.y0 + f.h - HL.LAMP_HANG)) > 1e-9 || e.y + HL.LAMP_H > f.y0 + f.h) bad.push(`${w}x${h}: y ${e.y} top ${f.y0 + f.h}`);
      if (h === 2.38 && e.y < 1.85) bad.push('the lantern hangs low enough to hit a standing player: ' + e.y);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('hlamp.aiming-at-a-frame-picks-the-side-you-face-and-four-fit', async () => {
    reset(); const bad = [], f = frame(-8, 3);
    craft('hlamp', 6); selectTool('hlamp');
    p().yaw = Math.PI / 2; aimPoint(f.cx, f.y0 + f.h - 0.3, f.cz, 3.0); p().yaw = Math.PI / 2;
    let pl = await plan(); if (!pl.ok) return pl.why; if (pl.ent.frameId !== f.id || pl.ent.slot !== 0 || Math.abs(pl.ent.x - (f.cx + 0.5)) > 1e-6) bad.push('facing +x: ' + JSON.stringify(pl.ent));
    if (placeNow() !== 1) return 'not placed';
    const seen = [0];
    for (const yaw of [0, -Math.PI / 2, Math.PI]) {
      aimPoint(f.cx, f.y0 + f.h - 0.3, f.cz, 3.0); p().yaw = yaw; p().pos.set(f.cx - Math.sin(yaw) * 3, 0, f.cz - Math.cos(yaw) * 3); p().pitch = 0.3; p().yaw = yaw;
      const e = p().eyePos(new V3()); const dx = f.cx - e.x, dy = f.y0 + f.h - 0.3 - e.y, dz = f.cz - e.z; p().pitch = Math.atan2(dy, Math.hypot(dx, dz)); p().yaw = yaw;
      pl = await plan(); if (!pl.ok) { bad.push(`yaw ${yaw}: ${pl.why}`); continue; } seen.push(pl.ent.slot); if (placeNow() !== 1) bad.push('not placed at ' + yaw);
    }
    if (seen.slice().sort().join() !== '0,1,2,3') bad.push('slots used ' + seen);
    const xz = lamps().map((e) => `${Math.round((e.x - f.cx) * 10)},${Math.round((e.z - f.cz) * 10)}`).sort().join(' | ');
    if (xz !== '-5,0 | 0,-5 | 0,5 | 5,0') bad.push('positions ' + xz);
    pl = await plan(); if (pl.ok || !/four lanterns/.test(pl.why || '')) bad.push('a fifth lantern was allowed: ' + JSON.stringify(pl.ok ? pl.ent : pl.why));
    if (S().items.hlamp !== 2) bad.push('items left ' + S().items.hlamp);
    return bad.length === 0 || bad.join('; ');
  });

  await T('hlamp.aiming-away-from-any-frame-says-so', async () => {
    reset(); craft('hlamp'); selectTool('hlamp'); aimPoint(-5, 1, 6, 3); const pl = await plan();
    return (!pl.ok && /Aim at a frame/.test(pl.why)) || JSON.stringify(pl);
  });

  await T('hlamp.the-hammer-takes-it-down-and-returns-the-lantern-and-its-cords', async () => {
    reset(); const { G, ls } = line(3); const before = S().items.cable || 0;
    g.doDecon({ kind: 'mach', id: ls[1].id });
    const bad = []; if (S().items.hlamp !== 1) bad.push('item ' + S().items.hlamp); if ((S().items.cable || 0) !== before + 2) bad.push('cords back ' + ((S().items.cable || 0) - before)); if (lamps().length !== 2) bad.push('lamps ' + lamps().length);
    adv(1); if (K.netOf(G) && (ls[2].pw || 0) > 0) bad.push('the lantern past the gap stays lit');
    return bad.length === 0 || bad.join('; ');
  });

  await T('hlamp.one-8kw-generator-runs-five-lanterns-at-full-brightness', async () => {
    reset(); const { G, ls } = line(5); adv(2);
    const net = K.netOf(G), bad = []; if (!net) return 'no grid';
    if (Math.abs(net.demand - 8) > 1e-6 || Math.abs(net.supply - 8) > 1e-6) bad.push(`grid ${net.supply} of ${net.demand}`);
    if (!ls.every((l) => l.pw >= 0.999)) bad.push('not all lit: ' + pws(ls));
    return bad.length === 0 || bad.join('; ');
  });

  await T('hlamp.a-sixth-lantern-dims-the-whole-line-evenly', async () => {
    reset(); const { G, ls } = line(6); adv(2); const want = 8 / 9.6;
    const bad = []; if (!ls.every((l) => Math.abs(l.pw - want) < 0.002)) bad.push('pw ' + pws(ls) + ' want ' + want.toFixed(3));
    for (const l of ls) paintOf(l);
    const gl = ls.map((l) => glassOf(l)); if (!gl.every((v) => Math.abs(v - gl[0]) < 1e-6 && v > 0 && v < 2.6)) bad.push('glass intensities ' + gl);
    // take one away: back to full
    g.doDecon({ kind: 'mach', id: ls[5].id }); adv(2); if (!ls.slice(0, 5).every((l) => l.pw >= 0.999)) bad.push('did not brighten again: ' + pws(ls.slice(0, 5)));
    return bad.length === 0 || bad.join('; ');
    function paintOf(l) { const it = g.machines.items.get(l.id); HL.paint(it.obj, HL.lampLevel(l)); }
    function glassOf(l) { return g.machines.items.get(l.id).obj.getObjectByName('glass').material.emissiveIntensity; }
  });

  await T('hlamp.the-portable-2kw-generator-runs-one-and-dims-two', async () => {
    reset(); const a = line(1, 'portable'); adv(2); const bad = [];
    if (a.ls[0].pw < 0.999) bad.push('one lantern on a portable: ' + a.ls[0].pw);
    reset(); const b = line(2, 'portable'); adv(2); const want = 2 / 3.2;
    if (!b.ls.every((l) => Math.abs(l.pw - want) < 0.002)) bad.push('two on a portable: ' + pws(b.ls) + ' want ' + want.toFixed(3));
    return bad.length === 0 || bad.join('; ');
  });

  await T('hlamp.a-turbine-runs-thirty-lanterns-in-three-lines', async () => {
    reset({ ...UP, genOutput: 3, genTurbine: 1 }); g.T.genOutput = 8;
    const G = K.tile('gen', -13.5, 9.5, { gk: 'turbine' }); G.burn = 1e5; G.lit = true;
    const all = [];
    for (let line = 0; line < 3; line++) { let prev = G; for (let q = 0; q < 10; q++) { const f = frame(-12 + q * 2.4, 1 + line * 2.6 - 3); const l = hang(f, 0); const r = K.wire(prev, l); if (!r.ok) return `line ${line} lantern ${q}: ${r.why}`; prev = l; all.push(l); } }
    // the turbine takes 3 cords: exactly the three line heads
    adv(2); const net = K.netOf(G);
    return (net && Math.abs(net.demand - 48) < 1e-6 && all.every((l) => l.pw > 0.999)) || `grid ${net && net.supply}/${net && net.demand} pw ${pws(all).slice(0, 4)}`;
  });

  await T('hlamp.cables-chain-through-lanterns-two-ports-each', async () => {
    reset(); const bad = [];
    if (PP.maxPorts({ type: 'hlamp' }, g) !== 2) bad.push('ports ' + PP.maxPorts({ type: 'hlamp' }, g));
    const G = K.tile('gen', -13.5, 8.5), f = [frame(-12), frame(-9.4), frame(-6.8)].map((x) => x), ls = f.map((x) => hang(x, 0));
    const r1 = K.wire(G, ls[0]), r2 = K.wire(ls[0], ls[1]), r3 = K.wire(ls[0], ls[2]);
    if (!r1.ok || !r2.ok) bad.push('chain refused: ' + [r1.why, r2.why]); if (r3.ok || !/no free cable socket \(it takes 2\)/.test(r3.why || '')) bad.push('a third cord on a lantern: ' + JSON.stringify(r3.why));
    const nm = g.cables.describe(g.cables.list()[0]); if (!/Generator to Hanging Lantern/.test(nm.lines[0])) bad.push('cable text ' + nm.lines[0]);
    return bad.length === 0 || bad.join('; ');
  });

  await T('hlamp.the-cable-tool-clicks-generator-then-lantern-then-the-next-lantern', async () => {
    reset(); const bad = [], G = K.gen(-13.5, 8.5), f1 = frame(-12), f2 = frame(-9.4), l1 = hang(f1, 0), l2 = hang(f2, 0);
    S().items.cable = 5; const tool = { kind: 'cable', id: 'cable' };
    const at = (e, dy) => { const x = e.x ?? ctx.cellX(e.i), z = e.z ?? ctx.cellZ(e.k), y = e.y !== undefined ? e.y + dy : dy; aimPoint(x, y, z, 1.8); g.renderer.camera.position.copy(p().eyePos(new V3())); g.renderer.camera.updateMatrixWorld(true); const eye = g.renderer.camera.position, dir = p().forward(new V3()); g.cables.aimUpdate(tool, eye, dir); };
    at(G, 0.7); g.cables.click(tool); if (g.cables.from !== G.id) bad.push('the wire did not start at the generator: ' + g.cables.from);
    at(l1, 0.2); g.cables.click(tool); if (g.cables.list().length !== 1 || g.cables.from !== null) bad.push('the generator to lantern cord is missing: ' + JSON.stringify(g.cables.list()));
    at(l1, 0.2); g.cables.click(tool); if (g.cables.from !== l1.id) bad.push('could not start a wire at a lantern: ' + g.cables.from);
    at(l2, 0.2); g.cables.click(tool); if (g.cables.list().length !== 2) bad.push('the lantern to lantern cord is missing');
    adv(2); if (!(l1.pw > 0.99 && l2.pw > 0.99)) bad.push('not lit: ' + [l1.pw, l2.pw]); if (S().items.cable !== 3) bad.push('cords left ' + S().items.cable);
    at(l2, 0.2); g.cables.click(tool); at(l1, 0.2); g.cables.click(tool); if (g.cables.list().length !== 1) bad.push('clicking the same pair again did not take the cord away');
    return bad.length === 0 || bad.join('; ');
  });

  await T('hlamp.a-lantern-with-no-cord-and-no-pole-is-dark-and-says-so', async () => {
    reset(); const f = frame(-8), l = hang(f, 0); adv(1);
    const info = infoFor(g, { kind: 'mach', id: l.id }), txt = info.lines.join('\n');
    return (l.pw === 0 && !info.lit && /DARK/.test(info.title) && /no power reaches it/.test(txt) && /Source: none wired yet/.test(txt)) || JSON.stringify(info);
  });

  await T('hlamp.a-lantern-beside-a-live-pole-is-dark-until-a-cord-runs-to-it', async () => {
    reset(); const f = frame(-8), l = hang(f, 0), G = K.gen(-8, 4.2), P = K.pole(-8, 4.9); K.wire(G, P); adv(2); void f;
    let info = infoFor(g, { kind: 'mach', id: l.id });
    if (!((l.pw || 0) === 0 && /DARK/.test(info.title) && /Not wired|none wired/.test(info.lines.join('\n')))) return 'beside a live pole with no cord: ' + JSON.stringify([l.pw, info.title, info.lines]);
    K.wire(P, l); adv(2); info = infoFor(g, { kind: 'mach', id: l.id });
    return (l.pw >= 0.999 && /LIT/.test(info.title) && /Source: Power Pole/.test(info.lines.join('\n'))) || JSON.stringify([l.pw, info.title, info.lines]);
  });

  await T('hlamp.switching-one-off-takes-its-1.6kw-off-the-grid', async () => {
    reset(); const { G, ls } = line(6); adv(2); const bad = [];
    const r = g.setCfg(ls[5], { on: false }); if (!r.ok) return r.why; adv(2);
    if (ls[5].on !== false || ls[5].pw !== undefined && HL.lampLevel(ls[5]) !== 0) bad.push('still lit');
    if (!ls.slice(0, 5).every((l) => l.pw >= 0.999)) bad.push('the line did not brighten: ' + pws(ls));
    const net = K.netOf(G); if (Math.abs(net.demand - 8) > 1e-6) bad.push('demand ' + net.demand);
    const info = infoFor(g, { kind: 'mach', id: ls[5].id }); if (!/SWITCHED OFF/.test(info.title) || !/Load 0\.0 kW/.test(info.lines.join('\n'))) bad.push('off readout ' + info.title);
    // E toggles it back
    const before = ls[5].on; g.setCfg(ls[5], { on: true }); adv(1); if (before !== false || ls[5].on !== true) bad.push('could not switch back');
    const wrong = g.setCfg(ls[5], { x: 5 }); if (wrong.ok) bad.push('an unknown setting was accepted'); const wr2 = g.setCfg(ls[5], { on: 'yes' }); if (wr2.ok) bad.push('a bad value was accepted');
    return bad.length === 0 || bad.join('; ');
  });

  await T('hlamp.pressing-E-on-a-lantern-switches-it', async () => {
    reset(); const { ls } = line(2); adv(1); const l = ls[0];
    aimPoint(l.x, l.y + 0.2, l.z, 1.6); adv(0.1); const EXT = await import('../ext.js'); p().pitch = Math.max(p().pitch, -1.4);
    const hit = EXT.aimedEnt(g); if (!hit || hit.id !== l.id) return 'aim found ' + (hit && hit.type);
    const used = EXT.useKey(g); adv(0.1);
    return (used && l.on === false) || `used ${used} on ${l.on}`;
  });

  await T('hlamp.hover-readout-shows-load-source-and-line', async () => {
    reset(); const { G, ls } = line(3); adv(2); const bad = [];
    const mid = infoFor(g, { kind: 'mach', id: ls[1].id }), txt = mid.lines.join('\n');
    if (!/^HANGING LANTERN/.test(mid.title) || !/LIT/.test(mid.title) || !mid.lit) bad.push('title ' + mid.title);
    if (!/Load 1\.6 kW/.test(txt)) bad.push('load line'); if (!/Source: Generator, through 1 other lantern\b/.test(txt)) bad.push('source line: ' + txt); if (!/3 lanterns on this line draw 4\.8 kW/.test(txt)) bad.push('line load: ' + txt);
    if (!/Grid 8\.0 kW supplied, 4\.8 kW wanted, 8\.0 kW rated/.test(txt)) bad.push('grid line: ' + txt);
    const first = infoFor(g, { kind: 'mach', id: ls[0].id }).lines.join('\n'); if (!/Source: Generator\b(?!, through)/.test(first)) bad.push('first lantern source: ' + first);
    const last = infoFor(g, { kind: 'mach', id: ls[2].id }).lines.join('\n'); if (!/through 2 other lanterns/.test(last)) bad.push('last lantern source: ' + last);
    // the same readout names a plant when that is the source
    reset(); const pl = line(2, 'plant'); adv(2); const t2 = infoFor(g, { kind: 'mach', id: pl.ls[1].id }).lines.join('\n'); if (!/Source: Power Plant, through 1 other lantern\b/.test(t2)) bad.push('plant source: ' + t2);
    // a brownout says so
    reset(); const bo = line(6); adv(2); const t3 = infoFor(g, { kind: 'mach', id: bo.ls[2].id }); if (!/DIM 83%/.test(t3.title) || !/brownout dims the whole line/.test(t3.lines.join('\n')) || !/8\.0 of 9\.6 kW/.test(t3.lines.join('\n'))) bad.push('dim readout ' + t3.title + ' | ' + t3.lines.join(' | '));
    return bad.length === 0 || bad.join('\n');
  });

  await T('hlamp.the-readout-also-shows-on-screen-when-aimed-at', async () => {
    reset(); const { ls } = line(2); adv(1); const l = ls[0];
    g.stowed = true; aimPoint(l.x, l.y + 0.2, l.z, 1.8); g.renderer.camera.position.copy(p().eyePos(new V3())); g.hudT = 0; adv(0.3);
    const el = document.getElementById('tileInfo'), txt = el ? el.textContent : '';
    return (el && !el.classList.contains('hidden') && /HANGING LANTERN/.test(txt) && /1\.6 kW/.test(txt)) || `readout "${txt.slice(0, 100)}" hidden ${el && el.classList.contains('hidden')}`;
  });

  await T('hlamp.lit-lanterns-light-the-plush-through-glowSources-and-dim-with-the-grid', async () => {
    reset(); const bad = [], { ls } = line(6); adv(2);
    const cam = { x: ls[2].x, y: 1.6, z: ls[2].z + 1.5 };
    const src = g.glowSources(cam, 8).filter((s) => s.r === HL.LAMP_RANGE);
    if (src.length !== 4) bad.push('want the 4 nearest lanterns, got ' + src.length);
    const lvl = 8 / 9.6; for (const s of src) { if (Math.abs(s.cr - HL.LAMP_COLOR[0] * lvl) > 0.01 || s.y < 1.8 || s.y > 2.4) bad.push(`source ${JSON.stringify(s)}`); }
    const near = src.map((s) => Math.hypot(s.x - cam.x, s.z - cam.z)); if (near[0] > near[3] + 1e-6) bad.push('not nearest first');
    // dark lanterns give nothing; a switched off one gives nothing
    g.setCfg(ls[2], { on: false }); const src2 = g.glowSources(cam, 8).filter((s) => s.r === HL.LAMP_RANGE); if (src2.some((s) => Math.abs(s.x - ls[2].x) < 1e-6 && Math.abs(s.z - ls[2].z) < 1e-6)) bad.push('a switched off lantern still lights');
    for (const l of ls) l.pw = 0; if (g.glowSources(cam, 8).some((s) => s.r === HL.LAMP_RANGE)) bad.push('unpowered lanterns light');
    return bad.length === 0 || bad.join('; ');
  });

  await T('hlamp.the-shader-receives-the-lantern-as-a-real-point-light', async () => {
    reset(); const { ls } = line(2); adv(1); const l = ls[0];
    p().pos.set(l.x - 3, 0, l.z); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; g.stowed = true; adv(0.3);
    let found = null; for (let i = 1; i < 9; i++) { const v = U.uPt.value[i]; if (v && Math.abs(v.x - l.x) < 0.01 && Math.abs(v.z - l.z) < 0.01) found = { v, c: U.uPtCol.value[i] }; }
    return (found && found.v.w === HL.LAMP_RANGE && found.c.r > 1.5 && Math.abs(found.v.y - HL.lampCenterY(l)) < 0.01) || 'uniform lights ' + U.uPt.value.slice(0, 5).map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)},${v.w}`).join(' / ');
  });

  await T('hlamp.glass-brightens-and-dims-with-power', async () => {
    reset(); const { ls } = line(1); adv(2); const it = g.machines.items.get(ls[0].id), gl = it.obj.getObjectByName('glass'); const bad = [];
    for (let n = 0; n < 20; n++) adv(0.1);
    const full = gl.material.emissiveIntensity; if (full < 0.6 || full > 1.2) bad.push('full ' + full + ' (a modest lamp: bright enough to read, never a blinding orb)');   // 0.8: well under the bloom threshold with the glass colour
    g.power.dirty = false; g.power.t = 5; ls[0].pw = 0.5; adv(0.3); const half = gl.material.emissiveIntensity; if (!(half < full * 0.7 && half > 0.25)) bad.push('half ' + half);
    g.setCfg(ls[0], { on: false }); adv(0.3); if (gl.material.emissiveIntensity !== 0) bad.push('off ' + gl.material.emissiveIntensity);
    return bad.length === 0 || bad.join('; ');
  });

  await T('hlamp.a-tripped-grid-goes-dark', async () => {
    reset(); const { G, ls } = line(6); K.part('breaker', -13.5, 9.6); adv(0.5); const br = [...g.machines.items.values()].find((it) => it.ent.type === 'breaker').ent;
    K.wire(G, br); adv(5);   // 9.6 kW on 8 kW for over 3 s
    const bad = []; if (!br.tripped) bad.push('breaker did not trip'); if (!ls.every((l) => (l.pw || 0) === 0)) bad.push('still lit ' + pws(ls));
    const t = infoFor(g, { kind: 'mach', id: ls[0].id }); if (!/grid is tripped/.test(t.lines.join(' '))) bad.push('readout ' + t.lines[0]);
    return bad.length === 0 || bad.join('; ');
  });

  await T('hlamp.taking-the-frame-down-drops-its-lanterns-and-cords-back-to-the-pack', async () => {
    reset(); const { ls, fr } = line(2); adv(1); const bad = []; const cables0 = S().items.cable || 0;
    g.doDecon({ kind: 'mach', id: fr[0].id }); adv(2.5);
    if (lamps().some((l) => l.id === ls[0].id)) bad.push('the lantern stayed hanging in the air'); if (!lamps().some((l) => l.id === ls[1].id)) bad.push('the other frame lost its lantern');
    if (S().items.hlamp !== 1) bad.push('item back ' + S().items.hlamp); if ((S().items.cable || 0) < cables0 + 2) bad.push('cords back ' + ((S().items.cable || 0) - cables0));
    if (S().entities.some((e) => e.id === ls[0].id)) bad.push('still saved');
    return bad.length === 0 || bad.join('; ');
  });

  await T('hlamp.survives-save-and-reload-with-its-cords', async () => {
    reset(); const { G, ls } = line(3); adv(1); const bad = [];
    const raw = JSON.parse(JSON.stringify(S().entities.filter((e) => e.type === 'hlamp'))), cab = JSON.parse(JSON.stringify(S().cables));
    if (raw.length !== 3 || raw.some((e) => e.type !== 'hlamp' || !Number.isFinite(e.x) || e.frameId === undefined || e.slot !== 0 || e.on !== true)) bad.push('saved ' + JSON.stringify(raw[0]));
    for (const l of ls) g.doDecon({ kind: 'mach', id: l.id }); S().cables = cab; g.cables.reset();
    for (const e of raw) { S().entities.push(e); g.addEntity(e); }
    adv(2); const back = lamps(); if (back.length !== 3) return 'reloaded ' + back.length;
    if (!back.every((l) => (l.pw ?? 0) > 0.999 && g.machines.items.get(l.id).obj.getObjectByName('glass'))) bad.push('not lit again: ' + pws(back));
    void G; return bad.length === 0 || bad.join('; ');
  });

  await T('hlamp.old-saves-without-the-lantern-fields-load-clean', async () => {
    reset(); const f = frame(-8), raw = { id: g.nextId(), type: 'hlamp', frameId: f.id, slot: 0, x: f.cx + 0.5, y: 1.88, z: f.cz };   // no on, h, hr, cache: a hand written ent
    S().entities.push(raw); g.addEntity(raw); adv(0.5); const l = lamps()[0];
    const info = infoFor(g, { kind: 'mach', id: l.id });
    return (l && HL.lampLevel(l) === 0 && info && /HANGING LANTERN/.test(info.title)) || 'bad load';
  });

  await T('hlamp.junk-ents-never-crash-the-readout-or-the-light', async () => {
    reset(); const f = frame(-8), bad = [];
    for (const junk of [{ frameId: 'x', slot: 'y', x: 'n', y: null, z: NaN }, { frameId: f.id, slot: 9, x: 1e9, y: 0, z: 0 }]) {
      const e = { id: g.nextId(), type: 'hlamp', ...junk }; S().entities.push(e);
      try { g.addEntity(e); } catch (er) { bad.push('add threw: ' + er.message); }
    }
    try { adv(0.5); g.glowSources({ x: 0, y: 1, z: 0 }, 8); for (const l of lamps()) infoFor(g, { kind: 'mach', id: l.id }); } catch (er) { bad.push('threw ' + er.message); }
    for (const e of [...S().entities]) if (e.type === 'hlamp') { try { g.doDecon({ kind: 'mach', id: e.id }); } catch (er) { bad.push('decon threw ' + er.message); } }
    return bad.length === 0 || bad.join('; ');
  });

  await T('hlamp.placing-with-an-empty-pack-builds-nothing', async () => {
    reset(); const f = frame(-8); craft('hlamp'); selectTool('hlamp'); p().yaw = Math.PI / 2; aimPoint(f.cx, f.y0 + f.h - 0.3, f.cz, 3.0); p().yaw = Math.PI / 2; await plan();
    placeNow(); const n = lamps().length; S().items = {}; const again = g.placeCurrent(g.curTool()); void again;
    return (n === 1 && lamps().length === 1) || `lamps ${lamps().length} after an empty pack`;
  });
}
