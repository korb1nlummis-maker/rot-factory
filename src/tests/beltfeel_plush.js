// beltfeel.plush-* : a plush riding a belt, a hose, a ramp, a bend or a lift is drawn as a small copy of its own model in its own color (the instanced mesh of its shape, shared by
// every plush of that shape), never a flat disc. The test runs the game's own draw feed (feedDynamic) with and without the plush on the line and reads what the renderer was
// handed: one instance of the species' own shape per plush, at the plush's own place, scaled down (not flat, not full size), in the species' own palette color.
import { makeBeltKit, UP_ALL } from './belts_lib.js';
import { species, PALETTES, ARCH_COUNT, NEEDLE, DECOY0, SPECIAL_MIN } from '../plushdata.js';

export default async function (ctx) {
  const { g, L, THREE, tiles, toI, toK, cellX, cellZ } = ctx;
  const B = makeBeltKit(ctx), T = B.T, { lay } = B;
  const bad = (a) => a.length === 0 || a.join('; ');
  const R = () => g.renderer;
  const feed = () => { g.feedDynamic(0.016, g.renderer.camera.position); return Array.from(R().dynCount); };
  const clearLine = () => { for (const t of [...tiles()]) L().remove(t); };
  // every shape once (the first species of each), each patterned variant, a shiny one, the volatile Razzo, a decoy and The One
  const sample = () => {
    const out = [], first = new Set(); let pats = [0, 0, 0, 0];
    for (let s = 1; s < species.length; s++) {
      const sp = species[s]; if (!sp || sp.arch >= ARCH_COUNT) continue;
      if (!sp.pat) { if (!first.has(sp.arch)) { first.add(sp.arch); out.push({ sp: s, vr: (s * 29) & 127 }); } }
      else if (pats[sp.pat] < 3) { pats[sp.pat]++; out.push({ sp: s, vr: (s * 31) & 127 }); }
    }
    for (const s of [3, 400, 1000]) out.push({ sp: s, vr: 128 | (s & 127) });   // shiny ones (bit 7 of the variant)
    out.push({ sp: DECOY0, vr: 0 }, { sp: NEEDLE, vr: 0 });
    return out;
  };
  const archOf = (sp) => species[sp].arch;
  const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

  await T('beltfeel.plush-every-shape-colour-and-variant-on-a-belt-is-a-mini-model-of-itself', async () => {
    B.setup(UP_ALL); const b = []; clearLine();
    const list = sample(); if (list.length < ARCH_COUNT) return 'sample too small ' + list.length;
    const base = feed(), meshes0 = g.renderer.scene.children.length;
    // one plush on each of a row of belts (rows of 24), so every one has a place of its own
    const rows = []; for (let r = 0; r * 24 < list.length; r++) rows.push(lay(0, 24, toI(-13), toK(-9) + r * 2, 0));
    const at = [];
    list.forEach((e, n) => { const t = rows[Math.floor(n / 24)][n % 24]; t.items.push({ sp: e.sp, vr: e.vr, t: 0.5 }); at.push({ ...e, x: cellX(t.i), z: cellZ(t.k), y: t.j * 0.6 + 0.2 }); });
    L().rebuildBelts();
    const now = feed(), want = new Map(); for (const e of list) { const a = e.sp === NEEDLE ? ARCH_COUNT : archOf(e.sp); want.set(a, (want.get(a) || 0) + 1); }
    for (const [a, n] of want) if (now[a] - base[a] !== n) b.push(`shape ${a}: ${now[a] - base[a]} drawn for ${n} plush`);
    for (const e of at) {
      const a = e.sp === NEEDLE ? ARCH_COUNT : archOf(e.sp), m = R().dyn[a], arr = m.instanceMatrix.array; let found = -1;
      for (let q = 0; q < m.count; q++) { const o = q * 16; if (Math.abs(arr[o + 12] - e.x) < 1e-3 && Math.abs(arr[o + 14] - e.z) < 1e-3 && Math.abs(arr[o + 13] - e.y) < 1e-3) { found = q; break; } }
      if (found < 0) { b.push(`species ${e.sp} (shape ${a}) is not drawn where it rides`); continue; }
      const o = found * 16, sc = Math.hypot(arr[o], arr[o + 1], arr[o + 2]);
      if (!(sc > 0.2 && sc < 0.6)) b.push(`species ${e.sp}: scale ${sc.toFixed(2)} is not a mini copy`);
      if (e.sp < SPECIAL_MIN) {   // the color of its own palette entry (shade by the variant), not one shared color
        const s0 = species[e.sp], want3 = lin(PALETTES[s0.pal][1]), shade = 0.9 + ((e.vr & 127) / 127) * 0.2, ca = m.instanceColor.array;
        for (let c = 0; c < 3; c++) if (Math.abs(ca[found * 3 + c] - want3[c] * shade) > 0.02) { b.push(`species ${e.sp} (${s0.name}): colour channel ${c} is ${ca[found * 3 + c].toFixed(2)}, its own is ${(want3[c] * shade).toFixed(2)}`); break; }
        if ((e.vr & 128) && m.geometry.attributes.aData.array[found * 4 + 2] < 0.5) b.push(`species ${e.sp}: a shiny plush lost its shine on the belt`);
      }
    }
    // the shapes that were drawn are solid, shared meshes (not points or flat discs), and no new object was made for any plush
    for (const a of want.keys()) {
      const m = R().dyn[a]; if (!m.isInstancedMesh || m.isPoints || m.isSprite) { b.push(`shape ${a} is not an instanced model`); continue; }
      m.geometry.computeBoundingBox(); const sz = m.geometry.boundingBox.getSize(new THREE.Vector3()), mn = Math.min(sz.x, sz.y, sz.z), mx = Math.max(sz.x, sz.y, sz.z);
      if (m.geometry.attributes.position.count < 30 || mn < 0.12 * mx) b.push(`shape ${a} is flat (${sz.x.toFixed(2)} x ${sz.y.toFixed(2)} x ${sz.z.toFixed(2)}, ${m.geometry.attributes.position.count} vertices)`);
    }
    if (g.renderer.scene.children.length !== meshes0) b.push(`the plush on the belts added ${g.renderer.scene.children.length - meshes0} scene objects (each shape should share one mesh)`);
    return bad(b);
  });

  await T('beltfeel.plush-on-a-bend-a-ramp-a-lift-and-in-a-hose-are-mini-models-too', async () => {
    B.setup(UP_ALL); const b = []; clearLine();
    const i = toI(-10), k = toK(2); const sp = 5;   // (Banana)
    const base = feed();
    lay(0, 1, i - 1, k, 0); const bend = lay(0, 1, i, k, 1)[0]; lay(0, 1, i, k + 1, 1);                         // a bend (east then south)
    const ramp = g.placeEntity('belt', { i: i + 4, j: 0, k, dir: 0, rise: 1, items: [] }, { quiet: true, rebuild: false });
    const lift = g.placeEntity('belt', { i: i + 8, j: 0, k, dir: 0, rise: 0, lift: { h: 3 }, items: [] }, { quiet: true, rebuild: false });
    const hose = g.placeEntity('belt', { i: i + 12, j: 0, k, dir: 0, rise: 0, hose: true, items: [] }, { quiet: true, rebuild: false });
    L().rebuildBelts();
    for (const t of [bend, ramp, lift, hose]) t.items.push({ sp, vr: 9, t: 0.5 }), t.items.push({ sp: sp + 20, vr: 9, t: 0.9 });
    const now = feed(), d = (a) => now[a] - base[a];
    if (d(archOf(sp)) !== 4 || d(archOf(sp + 20)) !== 4) b.push(`drawn ${d(archOf(sp))} + ${d(archOf(sp + 20))} of 4 + 4 plush on a bend, a ramp, a lift and a hose`);
    const m = R().dyn[archOf(sp)], arr = m.instanceMatrix.array;
    for (let q = 0; q < m.count; q++) { const o = q * 16, sc = Math.hypot(arr[o], arr[o + 1], arr[o + 2]); if (sc > 0.6) continue; if (!(sc > 0.2)) b.push('a plush is drawn at scale ' + sc.toFixed(2)); }
    return bad(b);
  });

  await T('beltfeel.plush-the-mini-model-is-not-hidden-at-a-distance', async () => {
    B.setup(UP_ALL); const b = []; clearLine();
    const t = lay(0, 1, toI(-12), toK(3), 0)[0]; t.items.push({ sp: 7, vr: 3, t: 0.5 }); L().rebuildBelts();
    // from the player's own eye and from 90 m away the same instanced mesh is drawn: no cull, no switch to anything else
    for (const cam of [[-12, 1.5, 3], [30, 20, 60]]) {
      g.renderer.camera.position.set(...cam); g.renderer.camera.updateMatrixWorld(true); const n = feed();
      const m = R().dyn[archOf(7)]; if (!n[archOf(7)] || !m.visible || m.frustumCulled || !m.isInstancedMesh) b.push(`camera ${cam}: the shape is ${m.visible ? 'culled' : 'hidden'}`);
    }
    return bad(b);
  });
}
