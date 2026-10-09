import { kit } from './island_lib.js';
import { UP } from './portal_lib.js';
import { boxOf } from '../arches.js';
// island.audit.*: the flows around the rule: what happens to a slab when its holder is taken away, saves in the middle of a fall, and the counts of plush.
// Run: `await __selftest('island.audit.')`.
export default async function (ctx) {
  const { T, g, S, sim, toI, toJ, toK } = ctx;
  const K = kit(ctx), W = K.W;
  const flags = () => ({ falls: S().stats.islandFalls || 0 });

  // BUG 4. Taking a frame down (the hammer) or a failing frame queues the roof checks on a coarse grid around it, every 4 cells. The island check starts from those cells and the six
  // around them, so a narrow slab (one or two cells wide) that only the frame held and that lay between the grid lines was never looked at: it hung in the air after its frame was gone.
  for (const how of ['the-hammer', 'a-failing-frame']) await T(`island.audit.a-narrow-beam-held-only-by-a-frame-falls-when-${how}-takes-the-frame-away`, async () => {
    const A = K.arena(60, 60, UP), tl = K.tally();
    try {
      const cube = K.cube('steel', A.i0 + 20, A.k0 + 20, 0);
      const ci = toI(cube.cx ?? cube.x), ck = toK(cube.cz ?? cube.z);
      const offs = how === 'the-hammer' ? [2, -2, 6] : [0, 4, -4], rows = offs.map((d) => ck + d);   // the offsets that lie between the points of the check of each path (every 4 cells with one cell either side)
      for (const k of rows) K.block(ci - 5, 4, k, 11, 3, 1);
      K.stand(A.i0 + 2, A.k0 + 2); W().stabQueue.length = 0; K.run(6);
      const held = rows.map((k) => K.count(ci - 5, 4, k, 11, 3, 1));
      if (held.some((n) => n !== 33)) return 'the beams over the cube did not stay while it stood: ' + held;
      tl.mark();
      if (how === 'the-hammer') g.doDecon({ kind: 'mach', id: cube.id }); else g.failSupport(W().supports.find((s) => s.id === cube.id), 9);
      K.run(20);
      const left = rows.map((k) => K.count(ci - 5, 4, k, 11, 3, 1)), sum = left.reduce((x, y) => x + y, 0);
      if (sum > 15) return `the frame is gone and ${sum} of 99 plush of the three beams near it still hang (${left})`;
      return tl.net() === 0 || 'net plush ' + tl.net();
    } finally { tl.stop(); }
  });

  // the same for a giant arch: taking it down with the hammer queues the roof checks on a grid of 4 cells (arches.js onRemove)
  await T('island.audit.a-narrow-beam-held-only-by-a-giant-arch-falls-when-the-hammer-takes-the-arch-away', async () => {
    const A = K.arena(60, 60, { ...UP, arches: 1 }), tl = K.tally();
    try {
      const arch = g.placeEntity('garch', { axis: 'x', gm: A.i0 + 20, glo: A.k0 + 20, gj: 0, span: 6, mat: 'steel' }, { quiet: true });
      if (!arch || !W().supports.some((q) => q.id === arch.id)) return 'the arch was not placed';
      const bx = boxOf(arch), ci = (bx.i0 + bx.i1) >> 1, ck = (bx.k0 + bx.k1) >> 1;   // the centre arches.js onRemove checks around, every 4 cells with one cell either side: offsets 0 and 4 lie between the points
      const rows = [ck, ck + 4, ck - 4];
      for (const k of rows) K.block(ci - 5, 5, k, 11, 3, 1);
      K.stand(A.i0 + 2, A.k0 + 2); W().stabQueue.length = 0; K.run(6);
      const held = rows.map((k) => K.count(ci - 5, 5, k, 11, 3, 1));
      if (held.some((n) => n !== 33)) return 'the beams over the arch did not stay while it stood: ' + held;
      tl.mark(); g.doDecon({ kind: 'mach', id: arch.id }); K.run(20);
      const left = rows.map((k) => K.count(ci - 5, 5, k, 11, 3, 1)), sum = left.reduce((a, b) => a + b, 0);
      if (sum > 15) return `the arch is gone and ${sum} of 99 plush of the three beams still hang (${left})`;
      return tl.net() === 0 || 'net plush ' + tl.net();
    } finally { tl.stop(); }
  });

  // A save in the middle of a fall: the cells that have not let go yet are in the world edits, the ones that have are loose bodies, and the rest of the slab must still fall after the load,
  // once, with no plush lost or made up on the way through the save.
  await T('island.audit.a-save-in-the-middle-of-a-fall-keeps-every-plush-and-the-rest-still-falls', async () => {
    const A = K.arena(60, 60, UP), a = { i: A.i0 + 10, j: 6, k: A.k0 + 10 };
    K.block(a.i, a.j, a.k, 10, 10, 10); K.stand(A.i0 + 2, A.k0 + 2);
    for (let n = 0; n < 1190; n++) sim().spawn(2, 0, ctx.cellX(A.i0 + 30 + (n % 28)), 0.4 + 0.02 * (n % 7), ctx.cellZ(A.k0 + 26 + ((n / 28) | 0) % 30), 0, 0, 0, 2);   // the sim has almost no room: only a few of the slab can let go at once
    W().stabQueue.push({ i: a.i + 4, j: a.j, k: a.k + 4 });
    const tick = () => { g.time += 1 / 30; W().updateStability(1 / 30, g.T.warn, g.stabHooks()); };   // (the sim is not stepped: its bodies stay where they are)
    for (let n = 0; n < 30 * 5 && !(S().stats.islandFalls > 0); n++) tick();
    const cells = () => K.count(a.i, a.j, a.k, 10, 10, 10);
    if (!(S().stats.islandFalls > 0)) return 'the slab never started to fall';
    const c0 = cells(), b0 = sim().n;
    if (!(c0 > 900 && c0 < 1000)) return `expected a slab that has barely started to fall, ${c0} of 1000 cells are left`;
    g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) return 'save failed';
    const { loadSaved } = await import('../state.js'); const sv = loadSaved(); g.loadWorld(sv.S, sv); g.noSave = true; g.mode = 'play';
    if (cells() + sim().n !== c0 + b0) return `the save lost or made up plush: ${c0} cells and ${b0} bodies before, ${cells()} cells and ${sim().n} bodies after`;
    K.run(40);
    if (cells() !== 0) return `${cells()} cells of the slab still hang 40 s after the load`;
    return W().isl.list.size === 0 || 'an island is still registered';
  });

  // A soak with everything at once: wide digs, plates, floating blocks, frames put up and taken down or failing. When it has all settled, no plush may be lost or made up, nothing may
  // hang cut off, and no roof may be left under a thin cap over a wide room.
  await T('island.audit.a-soak-of-wide-digs-plates-and-frames-leaves-nothing-hanging-no-thin-cap-standing-and-no-plush-lost', async () => {
    const out = [];
    // (the island search spends 2 ms of the wall clock per tick on its seeds, so a slow or busy machine settles the same dig in another order and can leave a different roof cell standing: the soak gives it all the time it needs so it is the rule that is tested, not the speed of the machine)
    for (const seed of [11, 12, 13]) {
      const A = K.arena(70, 70, UP), tl = K.tally(), sells = K.spy(g, 'sellAuto'); W().isl.budgetMs = 1e9; let s = seed * 7919 + 17; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
      const P = { i: A.i0 + 4, k: A.k0 + 4 }, N = 60, cubes = [];
      try {
        K.block(P.i, 0, P.k, N, 14, N); K.stand(A.i0 + 1, A.k0 + 1); let lost = 0;
        for (let step = 0; step < 30; step++) {
          const r = rnd(), i = P.i + 3 + ((rnd() * 40) | 0), k = P.k + 3 + ((rnd() * 40) | 0), j = (rnd() * 6) | 0;
          if (r < 0.4) K.dig(i, j, k, 4 + ((rnd() * 16) | 0), 1 + ((rnd() * 3) | 0), 4 + ((rnd() * 16) | 0));
          else if (r < 0.5) K.dig(i, 0, k, 30, 3, 3);
          else if (r < 0.6) { K.block(i, j + 4, k, 3 + ((rnd() * 5) | 0), 2, 3 + ((rnd() * 5) | 0)); W().stabQueue.push({ i, j: j + 4, k }); }
          else if (r < 0.7) { for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) if (!W().get(i + x, j, k + z)) W().setCell(i + x, j, k + z, K.PAD, 0); W().stabQueue.push({ i, j, k }); }
          else if (r < 0.82) { const ok = !K.count(i, 0, k, 4, 4, 4); if (ok) { try { cubes.push(K.cube('steel', i, k, 0)); } catch (e) { void e; } } }
          else if (r < 0.9 && cubes.length) { const c = cubes.splice((rnd() * cubes.length) | 0, 1)[0]; if (g.machines.items.get(c.id)) g.doDecon({ kind: 'mach', id: c.id }); }
          else if (cubes.length) { const c = cubes.splice((rnd() * cubes.length) | 0, 1)[0]; const sp = W().supports.find((q) => q.id === c.id); if (sp) g.failSupport(sp, 9); }
          else K.dig(i, j, k, 12, 2, 1);
          tl.mark(); K.run(0.7); lost += tl.net();
        }
        tl.mark(); K.until(() => !W().creaking.size && !W().stabQueue.length && !W().isl.list.size && !W().isl.pending(), 400, 1 / 20, 2); K.run(12); lost += tl.net();   // (a cave-in goes on for as long as it has roof to take: run until the world is quiet)
        lost -= sells.n;   // (a body that rests for long is sold to the bin: the soak runs until the world is quiet, so a few go)
        if (lost !== 0) out.push(`seed ${seed}: plush lost or made up (net ${lost}, bodies ${sim().n})`);
        let hang = 0, thin = 0;
        for (let i = P.i - 2; i < P.i + N + 2; i++) for (let k = P.k - 2; k < P.k + N + 2; k++) for (let j = 1, top = W().topAt(i, k); j < top; j++) {
          if (!W().get(i, j, k)) continue;
          if (W().isl.isIsland(i, j, k) > 0) hang++;
          const st = W().stress(i, j, k); if (st && st.margin < 0 && st.thin) thin++;   // (a roof past the safe length from an anchor can be left over by a chain that ended 6 to 13 cells away: that is how the tunnel rule has always worked, with the rules off as well)
        }
        if (hang) out.push(`seed ${seed}: ${hang} plush still hang cut off`);
        if (thin) out.push(`seed ${seed}: ${thin} roof cells under a thin cap over a wide room stand when the world is quiet`);
      } finally { tl.stop(); sells.stop(); for (const c of cubes) if (g.machines.items.get(c.id)) K.dropEnt(c); }
    }
    return out.length === 0 || out.join('; ');
  });

  // BUG 6. A thin cap creaked for warn x (0.35 to 1.25) x 0.3 to 1 seconds: 0.2 s for a 20 by 20 room under 2 cells. The creak sound and the hint are only announced after 0.7 s of overload, so the first
  // pieces fell before the player had heard or read anything, and the HUD warning showed for a fifth of a second. A thin cap has to creak long enough to be heard before its first piece lets go.
  await T('island.audit.a-thin-cap-is-heard-and-warned-about-before-its-first-piece-falls', async () => {
    const out = [];
    for (const [size, cover] of [[20, 2], [12, 1], [30, 5]]) {
      const A = K.arena(size + 28, size + 28, UP), n = size + 12, P = { i: A.i0 + 6, k: A.k0 + 6 };
      K.block(P.i, 0, P.k, n, 3 + cover, n); K.stand(P.i - 3, P.k - 3); g._thinHint = 0; W()._creakCool = 0;   // (the game sounds a creak once every 5 s: the cases are tested one after the other in one world)
      const creak = K.spy(g.sound, 'creak'), hint = K.spy(g.ui, 'hint'), rel = K.spy(g, 'releaseCell');
      try {
        K.dig(P.i + 6, 0, P.k + 6, size, 3, size);
        let t = 0, first = -1, heard = -1, read = -1;
        for (let step = 0; step < 400 && first < 0; step++) { K.run(0.05, 1 / 60); t += 0.05; if (creak.n && heard < 0) heard = t; if (hint.args.some((a) => /too wide|creaking/.test(String(a[0]))) && read < 0) read = t; if (rel.n) first = t; }
        if (first < 0) out.push(`${size} wide under ${cover}: nothing fell`);
        else if (heard < 0 || heard > first) out.push(`${size} wide under ${cover}: the first piece fell at ${first.toFixed(2)} s and the creak was ${heard < 0 ? 'never heard' : 'heard at ' + heard.toFixed(2)}`);
        else if (read < 0 || read > first) out.push(`${size} wide under ${cover}: the first piece fell at ${first.toFixed(2)} s and the hint was ${read < 0 ? 'never shown' : 'shown at ' + read.toFixed(2)}`);
        else if (first < 0.8) out.push(`${size} wide under ${cover}: the first piece fell after ${first.toFixed(2)} s`);
      } finally { creak.stop(); hint.stop(); rel.stop(); }
    }
    return out.length === 0 || out.join('; ');
  });

  // BUG 5. While a slab waits, the roof rule leaves its cells alone (they fall with the slab). When the slab was saved (a pillar, a frame), nobody asked the roof rule about its cells again, so a roof
  // that was overloaded stood for ever. A roof cell that the rules say must fall has to fall, whichever rule held it for a while.
  await T('island.audit.a-slab-that-is-saved-is-handed-back-to-the-roof-rule', async () => {
    const A = K.arena(60, 60, UP), a = { i: A.i0 + 10, j: 4, k: A.k0 + 10 };
    K.block(a.i, a.j, a.k, 30, 2, 10); K.stand(A.i0 + 2, A.k0 + 2);                       // 30 long, 10 wide, over open floor: far beyond the safe length from any anchor
    W().stabQueue.push({ i: a.i + 15, j: a.j, k: a.k + 5 });
    if (K.until(() => W().isl.list.size > 0, 2) < 0) return 'the slab was not noticed';
    K.block(a.i + 15, 0, a.k + 5, 1, 4, 1);                                                // the player joins it to the floor with one pillar while it creaks
    K.until(() => !W().isl.list.size && !W().creaking.size && !W().stabQueue.length, 120, 1 / 20, 2); K.run(5);
    let over = 0; for (let i = a.i - 2; i < a.i + 32; i++) for (let k = a.k - 2; k < a.k + 12; k++) for (let j = 1; j < 8; j++) { const st = W().get(i, j, k) ? W().stress(i, j, k) : null; if (st && st.margin < 0) over++; }
    return over === 0 || `${over} roof cells are overloaded and stand: nothing asked the roof rule about them after the slab was saved`;
  });
}
