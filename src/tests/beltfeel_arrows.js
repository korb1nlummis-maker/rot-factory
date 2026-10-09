// beltfeel.arrows-* : every arrow on a belt piece points the way plush travel on it. The belt bed's chevrons are a texture, so the test reads the canvas the texture is drawn
// on, the UVs of the bed box and the matrix of every placed bed, and works out which way the chevron points in the world (and which way the pattern slides while the belt runs).
// The cones (lifts, undergrounds, splitters, mergers, the aim and route previews) are read from their own world matrix. Each is compared with the piece's own travel vector
// (DX/DZ of its facing, a corner's feeder and exit, a ramp's climb), never with a number typed into the test.
import { makeBeltKit, UP_ALL } from './belts_lib.js';
import * as SP from '../splitparts.js';
import * as BP from '../beltplan.js';
import { previewLift } from '../beltparts.js';
import { C } from '../config.js';

export default async function (ctx) {
  const { g, L, THREE, tiles, toI, toK, cellX, cellZ } = ctx;
  const B = makeBeltKit(ctx), T = B.T, { lay, DX, DZ } = B, K = B.K;
  const bad = (a) => a.length === 0 || a.join('; ');
  const dirIdx = (x, z) => (Math.hypot(x, z) < 0.5 ? -1 : Math.abs(x) > Math.abs(z) ? (x > 0 ? 0 : 2) : (z > 0 ? 1 : 3));
  const hv = (v) => { const h = Math.hypot(v[0], v[2]) || 1; return [v[0] / h, v[1], v[2] / h]; };

  // which way the chevron of the bed texture points along the bed's own +Z (the way plush travel on a belt: model +Z is the facing), and which way the pattern slides when the belt runs
  const bedAxis = () => {
    const bed = L().bedMesh, tex = bed.material.map, cv = tex.image, W = cv.width, H = cv.height, px = cv.getContext('2d').getImageData(0, 0, W, H).data;
    const lit = (x, y) => { const o = (y * W + x) * 4; return px[o] > 70 && px[o + 1] > 75; };   // the stroke is lighter than the bed; the bed's grain is not
    const rows = (x) => { const r = []; for (let y = 0; y < H / 2; y++) if (lit(x, y)) r.push(y); return r; };
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const apex = rows(Math.round(W / 2)), leg = rows(12);   // the middle of a chevron is its apex; the ends of its arms are its legs
    if (!apex.length || !leg.length) return null;
    const sApex = (tex.flipY ? 1 - mean(apex) / H : mean(apex) / H), sLeg = (tex.flipY ? 1 - mean(leg) / H : mean(leg) / H);   // texture coordinate of each
    // the bed's top face: how the texture's v changes along the box's z
    const pos = bed.geometry.attributes.position, uv = bed.geometry.attributes.uv, nor = bed.geometry.attributes.normal, top = [];
    for (let q = 0; q < pos.count; q++) if (nor.getY(q) > 0.9) top.push([pos.getZ(q), uv.getY(q)]);
    const lo = top.reduce((a, b) => (b[0] < a[0] ? b : a)), hi = top.reduce((a, b) => (b[0] > a[0] ? b : a));
    const dvdz = (hi[1] - lo[1]) / (hi[0] - lo[0]);   // v per unit z on the surface
    const ry = tex.repeat.y || 1;
    const dzApex = ((sApex - sLeg) / ry) / dvdz;   // from the legs to the apex, along the box z
    return { apexZ: Math.sign(dzApex), dvdz, ry, tex, sApex, sLeg };
  };
  const slideZ = () => {   // +1 when the pattern slides toward the bed's +Z (forward) while the belt runs
    const a = bedAxis(); if (!a) return 0; a.tex.offset.y = 0.3; const o0 = a.tex.offset.y; g.time += 0.05; L().update(0.05); const d = a.tex.offset.y - o0;
    return Math.sign((-d / a.ry) / a.dvdz);
  };
  // the world axis (xz and y) of every placed bed: [x, z, ax, ay, az] where a is the bed's own +Z in the world
  const beds = () => {
    const m = L().bedMesh.instanceMatrix.array, out = [];
    for (let q = 0; q < L().bedMesh.count; q++) { const o = q * 16; out.push({ x: m[o + 12], z: m[o + 14], a: [m[o + 8], m[o + 9], m[o + 10]] }); }
    return out.map((b) => { const n = Math.hypot(...b.a); return { ...b, a: b.a.map((v) => v / n) }; });
  };
  const near = (arr, x, z, r = 0.31) => arr.filter((b) => Math.hypot(b.x - x, b.z - z) < r);
  const cones = (root) => {
    L().root.updateMatrixWorld(true); root.updateMatrixWorld(true); const out = [];
    root.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.type === 'ConeGeometry') { const d = new THREE.Vector3(0, 1, 0).transformDirection(o.matrixWorld), p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); out.push({ d: [d.x, d.y, d.z], p, dir: dirIdx(d.x, d.z) }); } });
    return out;
  };
  const cell = () => ({ i: toI(-9), k: toK(0.3) });

  await T('beltfeel.arrows-the-bed-chevron-points-the-way-plush-travel-and-the-pattern-slides-that-way', async () => {
    B.setup(UP_ALL); const b = []; const ax = bedAxis(); if (!ax) return 'could not read the bed texture';
    // a straight belt in each of the four facings
    for (let d = 0; d < 4; d++) {
      for (const t of [...tiles()]) if (t.type === 'belt') L().remove(t);
      const { i, k } = cell(); lay(0, 3, i, k, d); L().rebuildBelts();
      const bs = beds(); if (bs.length !== 3) { b.push(`facing ${d}: ${bs.length} beds`); continue; }
      for (const e of bs) { const dot = ax.apexZ * (e.a[0] * DX[d] + e.a[2] * DZ[d]); if (dot < 0.9) b.push(`facing ${d}: the chevron points ${dot < 0 ? 'back along' : 'across'} the belt (dot ${dot.toFixed(2)})`); }
    }
    if (slideZ() <= 0) b.push('the pattern slides backward while the belt runs');
    return bad(b);
  });

  await T('beltfeel.arrows-ramps-climb-and-drop-the-way-the-chevron-points', async () => {
    B.setup(UP_ALL); const b = []; const ax = bedAxis(); if (!ax) return 'could not read the bed texture';
    for (const rise of [1, -1]) for (let d = 0; d < 4; d++) {
      for (const t of [...tiles()]) if (t.type === 'belt') L().remove(t);
      const { i, k } = cell(), j = rise < 0 ? 1 : 0;
      g.placeEntity('belt', { i, j, k, dir: d, rise, items: [] }, { quiet: true, rebuild: false }); L().rebuildBelts();
      const e = beds()[0]; if (!e) { b.push('no bed'); continue; }
      const a = e.a.map((v) => v * ax.apexZ);
      if (a[0] * DX[d] + a[2] * DZ[d] < 0.5) b.push(`ramp ${rise > 0 ? 'up' : 'down'} facing ${d}: the chevron points away from the way it runs`);
      if (Math.sign(a[1]) !== rise) b.push(`ramp ${rise > 0 ? 'up' : 'down'} facing ${d}: the chevron points ${a[1] > 0 ? 'up' : 'down'}`);
    }
    return bad(b);
  });

  await T('beltfeel.arrows-every-bend-in-every-facing-has-chevrons-following-the-curve-from-feeder-to-exit', async () => {
    B.setup(UP_ALL); const b = []; const ax = bedAxis(); if (!ax) return 'could not read the bed texture';
    // which way along texture v the chevron points (+1 toward larger v), whatever the geometry it sits on
    const apexDv = Math.sign((ax.sApex - ax.sLeg) / ax.ry);
    let seen = 0;
    for (let cd = 0; cd < 4; cd++) for (const turn of [1, 3]) {
      const d = (cd + turn) & 3; for (const t of [...tiles()]) if (t.type === 'belt') L().remove(t);
      const { i, k } = cell();
      lay(0, 1, i - DX[cd], k - DZ[cd], cd); lay(0, 1, i, k, d); lay(0, 1, i + DX[d], k + DZ[d], d); L().rebuildBelts();
      const t = L().tileAt(i, 0, k); if (!t || t.cd !== cd) { b.push(`bend ${cd}->${d}: not a bend`); continue; }
      const cx = cellX(i), cz = cellZ(k), h = C * 0.5, entry = [cx - DX[cd] * h, cz - DZ[cd] * h], exit = [cx + DX[d] * h, cz + DZ[d] * h];
      const meshes = [L().bendBedR, L().bendBedL].filter((m) => m.count > 0); if (meshes.length !== 1 || meshes[0].count !== 1) { b.push(`bend ${cd}->${d}: ${meshes.length} bend decks drawn`); continue; }
      const mesh = meshes[0], geo = mesh.geometry, pos = geo.attributes.position, uv = geo.attributes.uv, nor = geo.attributes.normal, m4 = new THREE.Matrix4().fromArray(mesh.instanceMatrix.array, 0);
      // the top face's middle line: the vertices at the middle radius, in order along the curve (the first run of the geometry is the top face)
      const line = []; for (let q = 0; q < pos.count; q++) if (nor.getY(q) > 0.9) line.push(q);
      const world = (q) => new THREE.Vector3(pos.getX(q), pos.getY(q), pos.getZ(q)).applyMatrix4(m4);
      const first = line[0], lastQ = line[line.length - 1];   // inner radius at the entry end, outer radius at the exit end
      const mid = (a, c2) => [(world(a).x + world(c2).x) / 2, (world(a).z + world(c2).z) / 2];
      const ends = [mid(line[0], line[1]), mid(line[line.length - 2], line[line.length - 1])];
      if (Math.hypot(ends[0][0] - entry[0], ends[0][1] - entry[1]) > 0.01) b.push(`bend ${cd}->${d}: the deck does not start at the middle of the feeder's edge`);
      if (Math.hypot(ends[1][0] - exit[0], ends[1][1] - exit[1]) > 0.01) b.push(`bend ${cd}->${d}: the deck does not end at the middle of the exit edge`);
      const dv = uv.getY(lastQ) - uv.getY(first);   // v along the way plush travel
      seen++; if (Math.sign(dv) !== apexDv) b.push(`bend ${cd}->${d}: the chevron points against the curve`);
    }
    if (seen !== 8) b.push('bends checked ' + seen);
    return bad(b);
  });

  await T('beltfeel.arrows-lifts-undergrounds-splitters-and-mergers-point-the-way-plush-leave-or-enter', async () => {
    B.setup(UP_ALL); const b = [];
    for (let d = 0; d < 4; d++) {
      for (const t of [...tiles()]) L().remove(t);
      const { i, k } = cell();
      const lift = g.placeEntity('belt', { i, j: 0, k, dir: d, rise: 0, lift: { h: 3 }, items: [] }, { quiet: true, rebuild: false });
      const dn = g.placeEntity('belt', { i: i + 4, j: 4, k, dir: d, rise: 0, lift: { h: -3 }, items: [] }, { quiet: true, rebuild: false });
      const en = g.placeEntity('belt', { i: i - 4, j: 0, k, dir: d, rise: 0, ug: { role: 'in', pair: null, span: 0 }, items: [] }, { quiet: true, rebuild: false });
      const ex = g.placeEntity('belt', { i: i - 4 + DX[d] * 3, j: 0, k: k + DZ[d] * 3, dir: d, rise: 0, ug: { role: 'out', pair: en.id, span: 3 }, items: [] }, { quiet: true, rebuild: false });
      const sp = g.placeEntity('belt', { i, j: 0, k: k + 5, dir: d, rise: 0, splitter: true, items: [] }, { quiet: true, rebuild: false });
      const mg = SP.fieldsOf('merger', { i: i + 5, j: 0, k: k + 5, dir: d }, null), mt = g.placeEntity('belt', mg, { quiet: true, rebuild: false });
      const ss = g.placeEntity('belt', SP.fieldsOf('ssplit', { i: i + 5, j: 0, k: k - 5, dir: d }, null), { quiet: true, rebuild: false });
      L().rebuildBelts();
      const grab = (t) => { const o = L().objs.get(t.id); return o ? cones(o) : []; };
      for (const [name, t] of [['lift up', lift], ['lift down', dn], ['underground entry', en], ['underground exit', ex]]) {
        const cs = grab(t); if (!cs.length) { b.push(`facing ${d}: ${name} has no arrow`); continue; }
        for (const c of cs) if (c.dir !== d) b.push(`facing ${d}: the ${name} arrow points ${c.dir}`);
      }
      const want = (list) => list.map((x) => (d + x) & 3).sort().join(''), got = (t) => grab(t).map((c) => c.dir).sort().join('');
      if (got(sp) !== want([0, 1, 3])) b.push(`facing ${d}: splitter arrows ${got(sp)} want ${want([0, 1, 3])}`);
      if (got(ss) !== want([0, 1, 3])) b.push(`facing ${d}: smart splitter arrows ${got(ss)} want ${want([0, 1, 3])}`);
      if (got(mt) !== want([0, 0, 1, 3])) b.push(`facing ${d}: merger arrows ${got(mt)} want ${want([0, 0, 1, 3])}`);
    }
    return bad(b);
  });

  await T('beltfeel.arrows-the-aim-and-the-route-previews-point-the-way-the-line-runs', async () => {
    B.setup(UP_ALL); const b = []; g.S.money = 1e12; ctx.craft('belt', 30); ctx.craft('ramp', 4); ctx.craft('hose', 10);
    const aimAtCell = async (i, k, dd) => { K.aimDir(cellX(i), 0, cellZ(k), dd, 2.0); return ctx.plan(); };
    // the single piece you are about to set down, belt and ramp, in each facing
    for (const id of ['belt', 'ramp']) for (let d = 0; d < 4; d++) {
      K.equip(id); g.beltRot = null; g.rampMode = 0; const { i, k } = cell(); const pl = await aimAtCell(i, k, d); if (!pl || !pl.ent) { b.push(`${id} ${d}: no plan`); continue; }
      const gh = g.machines.ghost; if (!gh) { b.push(`${id} ${d}: no ghost`); continue; }
      const cs = cones(gh); if (cs.length !== 1 || cs[0].dir !== pl.ent.dir) b.push(`${id} ${d}: the ghost arrow points ${cs.map((c) => c.dir)} but the piece faces ${pl.ent.dir}`);
    }
    // a lift preview
    for (let d = 0; d < 4; d++) {
      const { i, k } = cell(); previewLift(g, { id: 'lift' }, { ok: true, ent: { type: 'belt', i, j: 0, k, dir: d, lift: { h: 3 } } });
      const cs = cones(g.machines.ghost); if (cs.length !== 1 || cs[0].dir !== d) b.push(`lift preview ${d}: arrow ${cs.map((c) => c.dir)}`);
      previewLift(g, { id: 'lift' }, { ok: true, ent: { type: 'belt', i, j: 4, k, dir: d, lift: { h: -3 } } });
      const cd2 = cones(g.machines.ghost); if (cd2.length !== 1 || cd2[0].dir !== d) b.push(`down lift preview ${d}: arrow ${cd2.map((c) => c.dir)}`);
    }
    // a whole routed line: three L shapes; every arrow stands in the cell of the tile it belongs to and points the way that tile hands over
    for (const [name, end] of [['L east then north', [8, -5]], ['L west then south', [-8, 4]], ['L north then west', [-4, -6]]]) {
      K.equip('belt'); g.bplan = null; const i = toI(-4), k = cell().k; await aimAtCell(i, k, 0);   // (mid bay: the west end has the pile against it)
      g.bplan = { on: true, click: true, manual: false, id: 'belt', slot: g.curTool().slot, start: { i, j: 0, k, dir: 0, cont: false }, _r: null, variant: 0 };
      const pl = await aimAtCell(i + end[0], k + end[1], 0); if (!pl || !pl.route) { b.push(`${name}: no route`); continue; }
      const gh = g.machines.ghost; if (!gh) { b.push(`${name}: no route ghost`); continue; }
      const cs = cones(gh), ts = pl.route.tiles;
      if (cs.length !== ts.length) b.push(`${name}: ${cs.length} arrows for ${ts.length} tiles`);
      ts.forEach((t) => {
        const dist = (q) => Math.hypot(q.p.x - cellX(t.i) - DX[t.dir] * 0.17, q.p.z - cellZ(t.k) - DZ[t.dir] * 0.17);
        const c = cs.reduce((a, q) => (!a || dist(q) < dist(a) ? q : a), null);   // the arrow that stands in this tile's cell (nearest to where its own arrow sits)
        if (!c || dist(c) > 0.3) { b.push(`${name}: tile ${t.i},${t.k} has no arrow`); return; }
        if (c.dir !== t.dir) b.push(`${name}: tile ${t.i},${t.k} (facing ${t.dir}) has an arrow pointing ${c.dir}`);
      });
      g.bplan = null; g.machines.setGhost(null);
    }
    return bad(b);
  });
}
