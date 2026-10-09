// beltfeel.bends-* : belts and hoses bend and curve smoothly. A belt corner is one curved deck and two curved rails on a real quarter circle (beltgeo.js) that meet the straight
// pieces on both sides edge to edge, the plush ride the same circle, and a cord drawn round a corner (held B, or the mouse dragged) puts the bend pieces in by itself in any
// facing, left and right. A ramp meets the piece after it at the same height, including a bend at the top or the foot of it.
import { makeHoseKit, UP_HOSE } from './hose_lib.js';
import { bendFrame } from '../hosegeo.js';
import { TIER_COLOR } from '../beltdata.js';
import * as BP from '../beltplan.js';
import { C } from '../config.js';

export default async function (ctx) {
  const { g, S, L, adv, tiles, toI, toK, cellX, cellZ, THREE } = ctx;
  const H = makeHoseKit(ctx), T = H.B.T, K = H.B.K, io = H.io, o = H.o, B = H.B;
  const bad = (a) => a.length === 0 || a.join('; ');
  const UPX = { ...UP_HOSE, depots: 1 };
  const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
  const dirOf = (di, dk) => (di > 0 ? 0 : di < 0 ? 2 : dk > 0 ? 1 : 3);
  const R = C * 0.5;
  const setup = (kind, n) => { H.setup(0, UPX); for (const t of [...tiles()]) if (t.type === 'belt') L().remove(t); delete S().items[kind]; if (n) ctx.craft(kind, n); K.equip(kind); g.beltRot = null; g._lastLaid = null; g.bplan = null; };
  const cell = () => ({ i: toI(-9), k: toK(0.3) });
  const bendMesh = () => [L().bendBedR, L().bendBedL].filter((m) => m.count > 0);

  await T('beltfeel.bends-the-corner-is-a-real-quarter-circle-that-meets-both-neighbours-edge-to-edge', async () => {
    B.setup(UPX); const b = [];
    for (let cd = 0; cd < 4; cd++) for (const turn of [1, 3]) {
      const d = (cd + turn) & 3; for (const t of [...tiles()]) L().remove(t);
      const { i, k } = cell(); B.lay(0, 1, i - DX[cd], k - DZ[cd], cd); B.lay(0, 1, i, k, d); B.lay(0, 1, i + DX[d], k + DZ[d], d); L().rebuildBelts();
      const name = `bend ${cd}->${d}`, cx = cellX(i), cz = cellZ(k);
      const ms = bendMesh(); if (ms.length !== 1 || ms[0].count !== 1) { b.push(`${name}: ${ms.length} decks`); continue; }
      const mesh = ms[0], rail = mesh === L().bendBedR ? L().bendRailR : L().bendRailL, m4 = new THREE.Matrix4().fromArray(mesh.instanceMatrix.array, 0);
      const f = bendFrame(cx, cz, cd, d), centre = new THREE.Vector3(0, 0, 0).applyMatrix4(m4);
      const want = [cx + R * (DX[d] - DX[cd]), cz + R * (DZ[d] - DZ[cd])];
      if (Math.hypot(centre.x - want[0], centre.z - want[1]) > 1e-3) b.push(`${name}: the circle's centre is ${Math.hypot(centre.x - want[0], centre.z - want[1]).toFixed(3)} m off the cell's inner corner`);
      if ((mesh === L().bendBedR) !== f.right) b.push(`${name}: wrong hand`);
      // the deck: every top vertex between 0.05 and 0.55 m from the centre (the width of the straight bed, 0.5 m), in 14 steps (6.4 degrees each)
      const geo = mesh.geometry, pos = geo.attributes.position, nor = geo.attributes.normal, rings = new Map(); let rmin = 9, rmax = 0;
      for (let q = 0; q < pos.count; q++) if (nor.getY(q) > 0.9) { const w = new THREE.Vector3(pos.getX(q), pos.getY(q), pos.getZ(q)).applyMatrix4(m4), r = Math.hypot(w.x - centre.x, w.z - centre.z); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); const a = Math.round(Math.atan2(w.z - centre.z, w.x - centre.x) * 1e4); rings.set(a, (rings.get(a) || 0) + 1); }
      if (Math.abs(rmin - (R - 0.25)) > 1e-3 || Math.abs(rmax - (R + 0.25)) > 1e-3) b.push(`${name}: the deck spans ${rmin.toFixed(3)} to ${rmax.toFixed(3)} m from the centre, not ${R - 0.25} to ${R + 0.25}`);
      if (rings.size < 12) b.push(`${name}: only ${rings.size} steps round the curve`);
      const angs = [...rings.keys()].map((a) => a / 1e4).sort((p, q) => p - q), step = Math.max(...angs.slice(1).map((a, n) => { let dd = a - angs[n]; while (dd > Math.PI) dd -= 2 * Math.PI; return Math.abs(dd); }).filter((v2) => v2 < 1));
      if (step > 0.12) b.push(`${name}: a step of ${(step * 57.3).toFixed(1)} degrees (not smooth)`);
      // the rails: curved, on the straight rails' lines (0.27 m either side of the middle) at both ends
      const rg = rail.geometry.attributes.position; let rrMin = 9, rrMax = 0; for (let q = 0; q < rg.count; q++) { const w = new THREE.Vector3(rg.getX(q), rg.getY(q), rg.getZ(q)).applyMatrix4(m4), r = Math.hypot(w.x - centre.x, w.z - centre.z); rrMin = Math.min(rrMin, r); rrMax = Math.max(rrMax, r); }
      if (Math.abs(rrMin - (R - 0.27 - 0.02)) > 1e-3 || Math.abs(rrMax - (R + 0.27 + 0.02)) > 1e-3) b.push(`${name}: the rails span ${rrMin.toFixed(3)} to ${rrMax.toFixed(3)} from the centre`);
      const col = rail.instanceColor.array, tc = new THREE.Color(TIER_COLOR[0]); if (Math.abs(col[0] - tc.r) + Math.abs(col[1] - tc.g) + Math.abs(col[2] - tc.b) > 0.02) b.push(`${name}: the rails are not the colour of the belt mark`);
      // it meets the straight pieces: the deck's two end edges lie across the cell edges, 0.5 m wide, centred
      const edge = (q0, q1) => { const a = new THREE.Vector3(pos.getX(q0), pos.getY(q0), pos.getZ(q0)).applyMatrix4(m4), c2 = new THREE.Vector3(pos.getX(q1), pos.getY(q1), pos.getZ(q1)).applyMatrix4(m4); return { mid: [(a.x + c2.x) / 2, (a.z + c2.z) / 2], len: Math.hypot(a.x - c2.x, a.z - c2.z) }; };
      const tops = []; for (let q = 0; q < pos.count; q++) if (nor.getY(q) > 0.9) tops.push(q);
      const e0 = edge(tops[0], tops[1]), e1 = edge(tops[tops.length - 2], tops[tops.length - 1]);
      if (Math.abs(e0.len - 0.5) > 1e-3 || Math.abs(e1.len - 0.5) > 1e-3) b.push(`${name}: end edges ${e0.len.toFixed(3)} and ${e1.len.toFixed(3)} wide, not 0.5`);
      if (Math.hypot(e0.mid[0] - (cx - DX[cd] * R), e0.mid[1] - (cz - DZ[cd] * R)) > 1e-3 || Math.hypot(e1.mid[0] - (cx + DX[d] * R), e1.mid[1] - (cz + DZ[d] * R)) > 1e-3) b.push(`${name}: the ends are not at the middle of the cell edges`);
      // height: the straight bed's top (y + 0.045 + 0.025)
      const top = new THREE.Vector3(pos.getX(tops[0]), pos.getY(tops[0]), pos.getZ(tops[0])).applyMatrix4(m4); if (Math.abs(top.y - 0.07) > 1e-3) b.push(`${name}: the deck's top is at ${top.y.toFixed(3)}, the straight bed's is 0.07`);
      // the plush ride it: every point of their path is on the drawn circle (to 2 cm)
      const tile = L().tileAt(i, 0, k), pt = { x: 0, z: 0 }; let worst = 0;
      for (let s = 0; s <= 20; s++) { L().cornerPoint(tile, s / 20, pt); worst = Math.max(worst, Math.abs(Math.hypot(pt.x - centre.x, pt.z - centre.z) - R)); }
      if (worst > 0.02) b.push(`${name}: the plush leave the drawn curve by ${(worst * 100).toFixed(1)} cm`);
    }
    return bad(b);
  });

  // a cord drawn round a corner puts the bends in, from every facing, turning left and right (held B, and the mouse dragged)
  const expectOf = (cells) => cells.map((c, n) => { const nx = cells[n + 1], pv = cells[n - 1], din = pv ? dirOf(c[0] - pv[0], c[1] - pv[1]) : null, dir = nx ? dirOf(nx[0] - c[0], nx[1] - c[1]) : din; return { i: c[0], k: c[1], dir, cd: pv && din !== dir ? din : null }; });
  const walk = (pts) => { const out = [[...pts[0]]]; let [i, k] = pts[0]; for (let n = 1; n < pts.length; n++) { const [ti, tk] = pts[n]; while (i !== ti || k !== tk) { if (i !== ti) i += Math.sign(ti - i); else k += Math.sign(tk - k); out.push([i, k]); } } return out; };
  const check = (kind, cells, name) => {
    const b = [], want = expectOf(cells); L().rebuildBelts();
    const have = tiles().filter((t) => t.type === 'belt' && !!t.hose === (kind === 'hose')); if (have.length !== want.length) b.push(`${name}: ${have.length} pieces, expected ${want.length}`);
    for (const w of want) { const t = L().tileAt(o.i + w.i, 0, o.k + w.k); if (!t) { b.push(`${name}: no piece at ${w.i},${w.k}`); continue; } if (t.dir !== w.dir || (t.cd ?? null) !== w.cd) b.push(`${name}: piece ${w.i},${w.k} faces ${t.dir} ${t.cd == null ? 'straight' : 'bend from ' + t.cd}, expected ${w.dir} ${w.cd == null ? 'straight' : 'bend from ' + w.cd}`); }
    return b;
  };
  for (const kind of ['belt', 'hose']) {
    await T(`beltfeel.bends-a-cord-round-a-corner-puts-the-bend-in-from-every-facing-left-and-right-(${kind})`, async () => {
      const b = [];
      for (let d0 = 0; d0 < 4; d0++) for (const turn of [1, 3]) {
        const d1 = (d0 + turn) & 3, p0 = [[3, 0], [3, -9], [12, 0], [3, -3]][d0];   // (a start with room ahead of it inside the cleared bay: it ends 6 cells on, then turns 3)
        const a = [p0[0] + DX[d0] * 6, p0[1] + DZ[d0] * 6], e = [a[0] + DX[d1] * 3, a[1] + DZ[d1] * 3], path = [p0, a, e], cells = walk(path), name = `${kind} facing ${d0} then ${d1}`;
        // by the mouse: press, aim along, let go
        setup(kind, 40); await H.aim(p0[0], p0[1], d0); io.mouseDown(0); await ctx.plan(); await H.aim(e[0], e[1], d0); io.mouseUp(0); await ctx.plan(); adv(0.05);
        b.push(...check(kind, cells, name + ' (mouse)'));
        // by held B, facing the way each stretch goes
        setup(kind, 40); await H.hold(cells.map((c, n) => { const nx = cells[n + 1], pv = cells[n - 1]; return [c[0], c[1], nx ? dirOf(nx[0] - c[0], nx[1] - c[1]) : dirOf(c[0] - pv[0], c[1] - pv[1])]; }), d0);
        b.push(...check(kind, cells, name + ' (B)'));
      }
      return bad(b);
    });
  }

  await T('beltfeel.bends-a-ramp-meets-the-bend-at-its-top-and-at-its-foot-at-the-same-height', async () => {
    B.setup(UPX); const b = []; for (const t of [...tiles()]) L().remove(t);
    g.S.money = 1e12; ctx.craft('ramp', 6);
    const i0 = toI(-6), k0 = toK(0.3), raw = [[0, 0, 0, 0, 0], [1, 0, 0, 0, 0], [2, 0, 0, 0, 1], [3, 1, 0, 0, 1], [4, 2, 0, 3, 0], [4, 2, -1, 3, 0], [4, 2, -2, 3, -1], [4, 1, -3, 3, -1], [4, 0, -4, 0, 0], [5, 0, -4, 0, 0]].map(([di, j, dk, d, r]) => [i0 + di, j, k0 + dk, d, r, 0]);
    for (const t of raw) if (t[1] > 0) B.floorAt(t[0], t[1] - 1, t[2]);   // (a floor under every piece above the ground, as the placement rule asks)
    const r = BP.lay(g, 0, raw, false); if (!r.ok) return 'could not lay: ' + r.why; L().rebuildBelts();
    const bends = tiles().filter((t) => t.type === 'belt' && t.cd != null); if (bends.length !== 2) b.push(`${bends.length} bends`);
    // the top surface height at the middle of a piece's entry and exit edge, from what is drawn
    const topAt = (t, edgeOut) => {
      const dirv = edgeOut ? 1 : -1, cx = cellX(t.i), cz = cellZ(t.k);
      if (t.cd != null) { const mesh = [L().bendBedR, L().bendBedL].find((m) => m.count > 0 && Math.abs(new THREE.Vector3(0, 0, 0).applyMatrix4(new THREE.Matrix4().fromArray(m.instanceMatrix.array, 0)).y - (t.j * C + 0.045)) < 0.01); return mesh ? t.j * C + 0.045 + 0.025 : NaN; }
      const m = L().bedMesh.instanceMatrix.array; for (let q = 0; q < L().bedMesh.count; q++) {
        const o4 = q * 16; if (Math.abs(m[o4 + 12] - cx) > 1e-3 || Math.abs(m[o4 + 14] - cz) > 1e-3) continue;
        const mm = new THREE.Matrix4().fromArray(m, o4), p = new THREE.Vector3(0, 0.025, dirv * 0.3).applyMatrix4(mm); return p.y;   // (the bed box is 0.6 long before it is stretched; the ramp's scale takes the end to its edge)
      }
      return NaN;
    };
    const t = (i, j, k) => L().tileAt(i0 + i, j, k0 + k);
    for (const [a, nx] of [[t(3, 1, 0), t(4, 2, 0)], [t(4, 2, -2), t(4, 1, -3)], [t(4, 1, -3), t(4, 0, -4)], [t(2, 0, 0), t(3, 1, 0)]]) {
      if (!a || !nx) { b.push('a piece is missing'); continue; }
      const out = topAt(a, true), inn = topAt(nx, false);
      if (!(Math.abs(out - inn) < 0.02)) b.push(`the piece at ${a.i - i0},${a.j},${a.k - k0} ends at height ${out.toFixed(3)} but the next piece starts at ${inn.toFixed(3)}`);
    }
    if (!t(4, 2, 0) || t(4, 2, 0).cd !== 0 || !t(4, 0, -4) || t(4, 0, -4).cd !== 3) b.push('the bends at the top and at the foot of the ramps are not bends');
    return bad(b);
  });

  await T('beltfeel.bends-plush-ride-on-the-surface-of-a-ramp-going-up-and-going-down-and-hand-over-at-the-same-height', async () => {
    B.setup(UPX); const b = []; g.S.money = 1e12;
    for (const rise of [1, -1]) for (let d = 0; d < 4; d++) {
      for (const t of [...tiles()]) L().remove(t);
      const j = rise < 0 ? 1 : 0, i = toI(-6), k = toK(0.3), tile = g.placeEntity('belt', { i, j, k, dir: d, rise, items: [] }, { quiet: true, rebuild: false });
      const nx = g.placeEntity('belt', { i: i + DX[d], j: j + rise, k: k + DZ[d], dir: d, rise: 0, items: [] }, { quiet: true, rebuild: false }); L().rebuildBelts();
      const m = L().bedMesh.instanceMatrix.array; let bed = null; for (let q = 0; q < L().bedMesh.count; q++) { const o4 = q * 16; if (Math.abs(m[o4 + 12] - cellX(i)) < 1e-3 && Math.abs(m[o4 + 14] - cellZ(k)) < 1e-3) bed = new THREE.Matrix4().fromArray(m, o4); }
      if (!bed) { b.push('no bed'); continue; }
      const name = `ramp ${rise > 0 ? 'up' : 'down'} facing ${d}`;
      for (const s2 of [0.02, 0.25, 0.5, 0.75, 0.98]) {
        tile.items = [{ sp: 5, vr: 0, t: s2 }]; let at = null; L().forEachItem((it, x, y, z) => { if (it === tile.items[0]) at = [x, y, z]; });
        const u = s2 - 0.5, surf = new THREE.Vector3(0, 0.025, u * C).applyMatrix4(bed);   // the top of the bed under the plush
        if (!at || Math.hypot(at[0] - surf.x, at[2] - surf.z) > 0.02) { b.push(`${name}: the plush at ${s2} is not over the bed (${at && Math.hypot(at[0] - surf.x, at[2] - surf.z).toFixed(2)} m off)`); continue; }
        const above = at[1] - surf.y; if (above < 0.08 || above > 0.28) b.push(`${name}: the plush at ${s2} rides ${above.toFixed(2)} m above the bed (it should sit on it)`);
      }
      // handed over to the flat piece after it: the last place on the ramp and the first on the flat are at the same height to within 12 cm
      const ride = (t0, tt) => { t0.items = [{ sp: 5, vr: 0, t: tt }]; let y = null; L().forEachItem((it, x, yy) => { if (it === t0.items[0]) y = yy; }); t0.items = []; return y; };
      const end = ride(tile, 0.999), start = ride(nx, 0.001); if (Math.abs(end - start) > 0.12) b.push(`${name}: a plush leaves the ramp at height ${end.toFixed(2)} and arrives at ${start.toFixed(2)}`);
    }
    return bad(b);
  });

  await T('beltfeel.bends-the-ramp-you-aim-is-drawn-where-it-will-stand-up-and-down', async () => {
    B.setup(UPX); const b = []; g.S.money = 1e12; ctx.craft('ramp', 4); K.equip('ramp');
    for (const rise of [1, -1]) {
      for (const t of [...tiles()]) L().remove(t);
      const i = toI(-6), k = toK(0.3); g.rampMode = rise > 0 ? 0 : 1; K.aimDir(cellX(i), 0, cellZ(k), 0, 2.0); const pl = await ctx.plan();
      if (!pl || !pl.ent || pl.ent.rise !== rise) { b.push(`aim: ramp rise ${pl && pl.ent && pl.ent.rise}, wanted ${rise}`); continue; }
      const gh = g.machines.ghost; if (!gh) { b.push('no ghost'); continue; }
      gh.updateMatrixWorld(true); let box = null; gh.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry' && Math.abs(o.rotation.x) > 0.1) box = o; });
      if (!box) { b.push('the ghost has no tilted deck'); continue; }
      const gy = new THREE.Vector3().setFromMatrixPosition(box.matrixWorld).y;
      // the same ramp laid for real, in the same cell
      const t = g.placeEntity('belt', { i: pl.ent.i, j: pl.ent.j, k: pl.ent.k, dir: pl.ent.dir, rise, items: [] }, { quiet: true, rebuild: false }); L().rebuildBelts();
      const m = L().bedMesh.instanceMatrix.array; let ry = null; for (let q = 0; q < L().bedMesh.count; q++) if (Math.abs(m[q * 16 + 12] - cellX(t.i)) < 1e-3 && Math.abs(m[q * 16 + 14] - cellZ(t.k)) < 1e-3) ry = m[q * 16 + 13];
      if (ry == null || Math.abs(gy - ry) > 0.01) b.push(`ramp ${rise > 0 ? 'up' : 'down'}: the aim shows it at height ${gy.toFixed(2)}, it stands at ${ry && ry.toFixed(2)}`);
      // and a down ramp drops from the deck of its own level to the deck of the level below, an up ramp climbs from its level to the one above
      const top = new THREE.Vector3(0, 0.025, 0.3).applyMatrix4(new THREE.Matrix4().fromArray(m, [...Array(L().bedMesh.count).keys()].find((q) => Math.abs(m[q * 16 + 12] - cellX(t.i)) < 1e-3 && Math.abs(m[q * 16 + 14] - cellZ(t.k)) < 1e-3) * 16));
      const want = (t.j + rise) * C + 0.07; if (Math.abs(top.y - want) > 0.02) b.push(`ramp ${rise > 0 ? 'up' : 'down'}: its far end is at ${top.y.toFixed(2)}, the level it leads to is at ${want.toFixed(2)}`);
    }
    return bad(b);
  });

  await T('beltfeel.bends-the-route-you-aim-shows-its-corner-as-the-same-quarter-circle-the-laid-belt-has', async () => {
    B.setup(UPX); const b = []; g.S.money = 1e12; ctx.craft('belt', 30);
    for (const [name, end, x0] of [['east then north', [6, -4], -10], ['west then south', [-6, 4], -4]]) {   // (away from the bin: an end within 6 m of it snaps to feed it)
      K.equip('belt'); g.bplan = null; const i = toI(x0), k = cell().k; K.aimDir(cellX(i), 0, cellZ(k), 0, 2.0); await ctx.plan();
      g.bplan = { on: true, click: true, manual: false, id: 'belt', slot: g.curTool().slot, start: { i, j: 0, k, dir: 0, cont: false }, _r: null, variant: 0 };
      K.aimDir(cellX(i + end[0]), 0, cellZ(k + end[1]), 0, 2.0); const pl = await ctx.plan(); if (!pl || !pl.route) { b.push(`${name}: no route`); continue; }
      const gh = g.machines.ghost; if (!gh) { b.push(`${name}: no ghost`); continue; }
      const corners = pl.route.tiles.filter((t, n) => n > 0 && t.dir !== pl.route.tiles[n - 1].dir); if (corners.length !== 1) { b.push(`${name}: ${corners.length} corners planned`); continue; }
      const c = corners[0], cx = cellX(c.i), cz = cellZ(c.k); gh.updateMatrixWorld(true);
      let decks = 0, boxes = 0; gh.traverse((o) => { if (!o.isMesh) return; const p2 = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); if (o.geometry.type === 'BufferGeometry' && o.geometry.attributes.uv && o.geometry.attributes.position.count > 40) { const m4 = o.matrixWorld, ctr = new THREE.Vector3(0, 0, 0).applyMatrix4(m4); if (Math.hypot(ctr.x - cx, ctr.z - cz) < 0.5) decks++; } else if (o.geometry.type === 'BoxGeometry' && Math.hypot(p2.x - cx, p2.z - cz) < 0.3 && o.geometry.parameters.height <= 0.1 && o.geometry.parameters.width > 0.5) boxes++; });
      if (decks !== 1 || boxes !== 0) b.push(`${name}: the corner is drawn as ${decks} curved deck(s) and ${boxes} flat box(es)`);
    }
    g.bplan = null; g.machines.setGhost(null);
    return bad(b);
  });
}
