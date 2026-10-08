import { kit } from './island_lib.js';
import { UP } from './portal_lib.js';
import { THIN_SPAN, THIN_RATIO } from '../world.js';
// thincap.*: the thin cap rule (world.js thinRoof). A roof also has to be thick enough for its span: a roof cell whose open cavity is wider than THIN_SPAN cells both ways needs
// cover (plush from the roof cell up to the first air) of at least span / THIN_RATIO cells. It adds to the tunnel rule (distance to an anchor), it never replaces it, so every
// tunnel, the 4 wide frame tunnel and the 6 wide haul arch behave as before, and a wide room with a thin cap comes down however many holes the cap has.
// Run: `await __selftest('thincap.')`. Every test starts in a fresh world.
export default async function (ctx) {
  const { T, g, S, sim, p } = ctx;
  const K = kit(ctx), W = K.W;
  const collapses = () => S().stats.collapses || 0;
  // a pile block `cover` cells higher than a sealed room `size` wide, 3 high, cut into it. shafts: 1 cell holes through the cap every 7 cells (open columns: the tunnel rule counts them as anchors, every cell of the room is then within the safe length of one)
  const room = (cover, size, o = {}) => {
    const A = K.arena(size + 28, size + 28, o.up || UP), n = size + 12, P = { i: A.i0 + 6, k: A.k0 + 6 };
    K.block(P.i, 0, P.k, n, (o.ht || 3) + cover, n);
    const r = { i: P.i + 6, k: P.k + 6, size, cover, ht: o.ht || 3, P, n };
    K.dig(r.i, 0, r.k, size, r.ht, size, o.queue !== false);
    if (o.shafts) for (let x = 3; x < size; x += 7) for (let z = 3; z < size; z += 7) K.dig(r.i + x, r.ht, r.k + z, 1, cover, 1);
    K.stand(P.i - 3, P.k - 3);
    return r;
  };
  // the first layer of the cap, right over the room (what a collapse takes first). A cave-in stops when the rubble has filled the room, so the layers above the last one to fall stay up.
  const bottom = (r) => K.count(r.i, r.ht, r.k, r.size, 1, r.size);
  const frac = (r) => bottom(r) / (r.size * r.size);

  await T('thincap.the-rule-is-span-over-3-and-never-touches-spans-up-to-6', async () => {
    const out = [];
    for (const span of [4, 6, 7, 9, 10, 12, 13, 19, 20, 24]) for (const cover of [1, 2, 3, 4, 7, 9]) {
      const r = room(cover, span, { queue: false, ht: 3 }); const c = Math.floor(span / 2);
      const t = W().thinRoof(r.i + c, r.ht, r.k + c); const st = W().stress(r.i + c, r.ht, r.k + c);
      const expect = span > Math.max(THIN_SPAN, THIN_RATIO * cover);   // fails when the span is over 6 and over 3 x the cover
      if (!!t !== expect) out.push(`span ${span} cover ${cover}: ${t ? 'fails' : 'passes'}, rule says ${expect ? 'fails' : 'passes'}`);
      if (expect && !(st && st.margin < 0 && st.thin)) out.push(`span ${span} cover ${cover}: stress did not fail the roof`);
      if (!expect && st && st.thin) out.push(`span ${span} cover ${cover}: stress failed a roof on thickness`);
    }
    return out.length === 0 || out.slice(0, 6).join('; ');
  });

  await T('thincap.a-20-by-20-by-3-room-under-2-cells-of-cover-collapses-and-under-12-stands', async () => {
    const out = [];
    for (const [cover, thinOff, wantStand] of [[2, true, true], [2, false, false], [12, false, true], [7, false, true], [6, false, false]]) {
      const r = room(cover, 20, { shafts: true }); W().thinOff = thinOff; const tl = K.tally();
      try {
        K.run(cover > 4 ? 32 : 22);   // (the dig is still queued: thinOff is set before the first tick looks at it)
        const gone = tl.removed();     // plush that left the cap: nothing leaves a cap that stands. (A cave-in stops when the rubble fills the room, so the upper layers of a thick cap that fell stay up over it.)
        if (wantStand && gone > 10) out.push(`cover ${cover}${thinOff ? ' with the rule off' : ''}: the cap fell (${gone} plush came down)`);
        if (!wantStand && gone < 200) out.push(`cover ${cover}: the cap hangs (only ${gone} plush came down)`);
        if (!wantStand && tl.net() !== 0) out.push(`cover ${cover}: net plush ${tl.net()}`);
      } finally { tl.stop(); W().thinOff = false; }
    }
    return out.length === 0 || out.join('; ');
  });

  await T('thincap.a-thin-cap-over-a-huge-dug-area-used-to-hang-and-now-comes-down', async () => {
    // what the player saw: a 16 by 16 room cut under 1 cell of plush with a mouth. A few cells fell, the holes made "open" anchors, and 99% of the cap stayed up
    const out = [];
    for (const off of [true, false]) {
      const A = K.arena(60, 60, UP), P = { i: A.i0 + 6, k: A.k0 + 6 }; W().thinOff = off;
      K.block(P.i, 0, P.k, 30, 4, 30); K.dig(P.i + 6, 0, P.k + 6, 16, 3, 16); K.dig(P.i - 1, 0, P.k + 13, 7, 3, 2); K.stand(P.i - 3, P.k - 3); K.run(24);
      const left = K.count(P.i + 6, 3, P.k + 6, 16, 1, 16) / 256;
      if (off && left < 0.8) out.push(`rule off: ${(left * 100).toFixed(0)}% of the cap left (the old behaviour was 99%)`);
      if (!off && left > 0.1) out.push(`rule on: ${(left * 100).toFixed(0)}% of the cap still hangs`);
      W().thinOff = false;
    }
    return out.length === 0 || out.join('; ');
  });

  await T('thincap.frames-in-a-grid-hold-the-same-thin-cap-and-no-frames-do-not', async () => {
    const out = [];
    for (const framed of [true, false]) {
      const r = room(2, 20, { ht: 4 }); const tl = K.tally();
      try {
        const ents = []; if (framed) for (const dx of [2, 10]) for (const dz of [2, 10]) ents.push(K.cube('steel', r.i + dx + 2, r.k + dz + 2, 0));   // four cubes 8 cells apart
        K.run(22);
        const f = frac({ ...r, cover: 2, ht: 4 });
        if (framed && f < 0.9) out.push(`four steel cubes in a grid: the cap fell (${(f * 100).toFixed(0)}% left)`);
        if (!framed && f > 0.1) out.push(`no cubes: the cap hangs (${(f * 100).toFixed(0)}% left)`);
        if (framed && K.count(r.i, 5, r.k, 20, 1, 20) < 380) out.push('the cap lost cells over the frames');
      } finally { tl.stop(); }
    }
    return out.length === 0 || out.join('; ');
  });

  await T('thincap.a-side-to-side-sweep-collapses-the-cap-once-the-hall-is-wider-than-the-cover-allows', async () => {
    const out = [];
    for (const cover of [2, 12]) {
      const A = K.arena(60, 60, UP), P = { i: A.i0 + 6, k: A.k0 + 6 }, tl = K.tally();
      try {
        K.block(P.i, 0, P.k, 30, 3 + cover, 40); K.stand(P.i - 4, P.k - 4);
        // the player digs a hall 10 deep from an open face, a strip 2 wide at a time, left to right
        let first = -1; const c0 = collapses();
        for (let s = 0; s < 14 && first < 0; s++) {
          K.dig(P.i, 0, P.k + 4 + 2 * s, 10, 3, 2); K.run(2.2);
          if (collapses() > c0 || sim().n > 12) first = s;
        }
        const width = first < 0 ? 0 : 2 * (first + 1);
        if (cover === 2 && !(first >= 0 && width >= 8 && width <= 12)) out.push(`cover 2: first collapse at width ${width} (strip ${first}); a 6 wide hall may stand, an 8 to 12 wide one must go`);
        if (cover === 12 && first >= 0) out.push(`cover 12: the hall fell at width ${width}`);
        if (cover === 2) { K.run(30); const left = K.count(P.i, 3, P.k + 4, 10, 1, width) / (10 * width); if (left > 0.2) out.push(`cover 2: ${(left * 100).toFixed(0)}% of the cap over the dug ${width} wide hall still hangs after the collapse`); }
      } finally { tl.stop(); }
    }
    return out.length === 0 || out.join('; ');
  });

  await T('thincap.narrow-tunnels-and-the-6-wide-haul-tunnel-stand-under-1-cell-of-cover-and-an-8-wide-one-does-not', async () => {
    const out = [];
    for (const [wd, stands] of [[2, true], [4, true], [6, true], [8, false]]) {
      const A = K.arena(50, 40, UP), P = { i: A.i0 + 6, k: A.k0 + 6 };
      K.block(P.i, 0, P.k, 20, 4, 24); K.stand(P.i - 4, P.k - 4); const c0 = collapses();
      K.dig(P.i, 0, P.k + 8, 20, 3, wd); K.run(16);   // open at both ends, 20 long: within the safe length of a mouth
      const f = K.count(P.i, 3, P.k + 8, 20, 1, wd) / (20 * wd);
      if (stands && (f < 0.95 || collapses() > c0)) out.push(`${wd} wide under 1 cell: ${(f * 100).toFixed(0)}% of the roof left, ${collapses() - c0} collapses`);
      if (!stands && f > 0.2) out.push(`${wd} wide under 1 cell: ${(f * 100).toFixed(0)}% of the roof left, it should come down`);
    }
    return out.length === 0 || out.join('; ');
  });

  await T('thincap.a-lined-cube-tunnel-and-a-lined-arch-tunnel-under-thin-cover-stand', async () => {
    const out = [];
    const { makeKit } = await import('./portal_lib.js');
    for (const [cls, wd, ht, every] of [['cube', 4, 4, 8], ['arch', 6, 5, 12], ['arch', 8, 6, 12], ['arch', 12, 8, 12]]) for (const lined of [true, false]) {
      const A = K.arena(80, 60, UP), P = { i: A.i0 + 6, k: A.k0 + 6 }, len = 40;
      K.block(P.i, 0, P.k, len + 8, ht + 2, wd + 12);                              // 2 cells of cover
      const lo = P.k + 6; K.dig(P.i + 4, 0, lo, len, ht, wd); K.dig(P.i, 0, lo, 4, ht, wd); K.stand(P.i - 5, lo);
      const c0 = collapses();
      if (lined) for (let m = P.i + 4; m + 3 < P.i + 4 + len; m += every) {
        if (cls === 'cube') { K.cube('steel', m, lo, 0); }
        else g.placeEntity('garch', { axis: 'x', gm: m, glo: lo, gj: 0, span: wd, mat: 'steel' }, { quiet: true });
      }
      K.run(30); const left = K.count(P.i + 4, ht, lo, len, 1, wd) / (len * wd);
      if (lined && (left < 0.9 || collapses() > c0)) out.push(`${cls}${wd} lined under 2 cells of cover: ${(left * 100).toFixed(0)}% of the roof left, ${collapses() - c0} collapses`);
      if (!lined && left > 0.5 && wd >= 8) out.push(`${cls}${wd} unlined under 2 cells of cover: ${(left * 100).toFixed(0)}% of the roof still stands`);
    }
    void makeKit;
    return out.length === 0 || out.join('; ');
  });

  await T('thincap.the-roof-check-stays-cheap-for-a-wide-room', async () => {
    const r = room(2, 24, { queue: false }); const st = [];
    for (let x = 0; x < 24; x++) for (let z = 0; z < 24; z++) st.push([r.i + x, r.ht, r.k + z]);
    const t0 = performance.now(); let n = 0; for (let rep = 0; rep < 10; rep++) for (const [i, j, k] of st) if (W().stress(i, j, k)) n++;
    const per = (performance.now() - t0) / (10 * st.length);
    // and one pass of the real scan on every cell of the room (what a machine digging it triggers), measured per edit
    W().creaking.clear(); const t1 = performance.now(); for (let x = 0; x < 24; x += 3) for (let z = 0; z < 24; z += 3) W().scanRegion(r.i + x, r.ht - 1, r.k + z, 1.1); const scan = (performance.now() - t1) / 64;
    return (per < 0.2 && scan < 12) || `${per.toFixed(3)} ms per roof cell, ${scan.toFixed(1)} ms per region scan (n=${n})`;
  });

  await T('thincap.taking-plush-off-the-top-of-a-cap-thins-it-and-the-room-under-it-goes', async () => {
    const r = room(7, 20, { shafts: true }); K.run(22);                              // 7 cells of cover over a 20 wide room: exactly enough
    if (frac(r) < 0.95) return 'a cap exactly thick enough fell on its own';
    for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) W().removeCell(r.i + x, r.ht + r.cover - 1, r.k + z, true);   // the top layer is carted off: 6 cells left
    const tl = K.tally(); try { K.run(30); } finally { tl.stop(); }
    return tl.removed() > 400 || `the cap, now 6 cells over a 20 wide room, lost only ${tl.removed()} plush`;
  });
  // the tests that follow in the full run share the world the last test left: give them a small one (a world with half a million edits will not fit in a save)
  await T('thincap.leaves-a-small-fresh-world-for-the-tests-after-it', async () => { await ctx.newWorld(); g.collapseT = 99; g._shedT = 0; return W().diffCount < 1000 || 'diff ' + W().diffCount; });   // (and the two things these tests set on the game: the boom limiter and the slope shedding timer)
}
