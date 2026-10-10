// Loading of the drawn world after a lot of plush has been removed (src/render.js updateChunks / queue / scanOne).
// The bug: a dig front (or a hole in the pile) dirtied the same chunks every frame and a hole spilled to 44 neighbours each time, all pushed to `pending` with duplicates, so the
// queue grew without bound, its per frame sort ate the 5 ms budget and chunks that had never been scanned stayed empty until the digging stopped.
export default async function (ctx) {
  const { T, g, w, toI, toK, cellX, cellZ, THREE } = ctx;
  const R = () => g.renderer;
  const cold = () => { let c = 0; for (const ch of R().chunks.values()) if (ch.cold) c++; return c; };
  // one frame of the chunk system for a camera of our own (the real loop passes the player's camera: 5 ms)
  const frame = (cam) => { R().updateChunks(cam, 5); R().rebuildInstances(cam, true); };
  const settle = (cam, max = 300) => { let f = 0; for (; f < max && (cold() || R().pending.length || w().dirtyChunks.size || (R().spill && R().spill.length)); f++) frame(cam); return f; };
  const camAt = (i, j, k) => new THREE.Vector3(cellX(i), j * 0.6 + 0.9, cellZ(k));
  const carve = (i0, j0, k0, ni, nj, nk) => { for (let j = j0; j < j0 + nj; j++) for (let k = k0; k < k0 + nk; k++) for (let i = i0; i < i0 + ni; i++) w().removeCell(i, j, k, false); };
  // a place in the pile where the columns are full height (so a box dug into it has a roof)
  const site = (di, dk) => { const i = toI(0) + di, k = toK(0) + dk; return w().topAt(i, k) >= 60 ? { i, k } : null; };
  const counted = (fn) => { const r = R(), orig = r.scanChunk; let n = 0; r.scanChunk = function (...a) { n++; return orig.apply(this, a); }; try { fn(); } finally { r.scanChunk = orig; } return n; };

  await T('render.load.cold-chunks-load-after-a-big-carve', async () => {
    const s = site(120, 10); if (!s) return 'no full height pile at the test site';
    const far = camAt(toI(0), 1, toK(0)); settle(far);
    const cam = camAt(s.i + 30, 1, s.k + 15);
    let scans = 0, frames = 0;
    scans = counted(() => { carve(s.i, 1, s.k, 60, 30, 30); frames = settle(cam); });   // the camera goes into the cave at once: every chunk round it is new
    if (!R().chunks.size) return 'no chunks';
    if (cold()) return `${cold()} chunks never scanned after ${frames} frames`;
    if (frames >= 300) return 'queue did not drain in 300 frames: ' + R().pending.length;
    if (scans > 2 * R().chunks.size) return `${scans} scans for ${R().chunks.size} chunks: the cascade is exploding`;
    return true;
  });

  await T('render.load.queue-stays-bounded-and-unique-while-carving-continuously', async () => {
    const s = site(160, 80); if (!s) return 'no full height pile at the test site';
    let i = s.i, cam = camAt(i, 1, s.k + 15); settle(cam);
    let worst = 0, dup = 0, over = 0;
    for (let f = 0; f < 120; f++) {   // a pit face 30 columns wide, one row of it per frame, full height (the vacuum without the rate limit)
      for (let b = 0; b < 30; b++) { const t = w().topAt(i, s.k + b); for (let j = 1; j < t; j++) w().removeCell(i, j, s.k + b, false); }
      i++; cam = camAt(i - 6, 1, s.k + 15); frame(cam);
      const n = R().pending.length; if (n > worst) worst = n;
      if (new Set(R().pending).size !== n) dup++;
      if (n > R().chunks.size) over++;
    }
    if (dup) return `${dup} frames with duplicates in the queue`;
    if (over) return `the queue (${worst}) was longer than the ${R().chunks.size} chunks it could hold`;
    const left = settle(cam); if (cold()) return `${cold()} chunks still never scanned ${left} frames after the digging stopped`;
    return true;
  });

  await T('render.load.a-shaft-with-hole-light-does-not-starve-unscanned-chunks', async () => {
    const s = site(100, 150); if (!s) return 'no full height pile at the test site';
    const cam0 = camAt(s.i, 40, s.k); settle(cam0);
    let worstCold = 0, over = 0;
    for (let f = 0; f < 80; f++) {   // a 2 x 2 shaft sinking from the surface, one layer every 2 frames: every layer is an edit at the mouth of a hole
      if (f % 2 === 0) { const t = w().topAt(s.i, s.k); for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (t > 1) w().removeCell(s.i + a, t - 1, s.k + b, false); }
      const cam = camAt(s.i, Math.max(1, w().topAt(s.i, s.k)), s.k); frame(cam);
      if (f >= 40 && cold() > worstCold) worstCold = cold();   // (the first frames load what the sinking camera reaches)
      if (R().pending.length > R().chunks.size) over++;
    }
    if (over) return 'the queue was longer than the number of chunks';
    if (worstCold > 8) return `${worstCold} chunks waited unscanned while the shaft was dug`;
    return true;
  });

  await T('render.load.instance-counts-stay-under-the-caps', async () => {
    const s = site(120, 220); if (!s) return 'no full height pile at the test site';
    const cam = camAt(s.i + 40, 1, s.k + 20); settle(cam); carve(s.i, 1, s.k, 80, 36, 40); settle(cam);
    const r = R(); let placed = 0, total = 0;
    for (let a = 0; a < r.hi.length; a++) {
      if (r.hiCount[a] > r.hi[a].instanceMatrix.count || r.loCount[a] > r.lo[a].instanceMatrix.count) return 'count over the cap for archetype ' + a;
      if (r.hiCount[a] === r.hi[a].instanceMatrix.count || r.loCount[a] === r.lo[a].instanceMatrix.count) return 'archetype ' + a + ' is full: instances are being dropped';
      placed += r.hiCount[a] + r.loCount[a];
    }
    for (const ch of r.chunks.values()) total += ch.n;
    return placed === total || `${total - placed} of ${total} instances were dropped`;
  });

  await T('render.load.the-plush-near-a-wall-is-the-same-from-mid-cave-and-from-the-wall', async () => {
    const s = site(120, 300); if (!s) return 'no full height pile at the test site';
    const mid = camAt(s.i + 30, 1, s.k + 20), wall = camAt(s.i + 2, 1, s.k + 20);
    settle(mid); carve(s.i, 1, s.k, 60, 30, 40);
    const near = (cam, x, y, z, rad) => {   // the instances actually placed within `rad` of a point
      settle(cam); frame(cam); const r = R(); let n = 0;
      for (const set of [r.hi, r.lo]) for (let a = 0; a < set.length; a++) { const m = set[a], arr = m.instanceMatrix.array; for (let q = 0; q < m.count; q++) { const dx = arr[q * 16 + 12] - x, dy = arr[q * 16 + 13] - y, dz = arr[q * 16 + 14] - z; if (dx * dx + dy * dy + dz * dz < rad * rad) n++; } }
      return n;
    };
    const px = cellX(s.i), py = 1, pz = cellZ(s.k + 20);   // the west wall of the cave
    const a = near(mid, px, py, pz, 5), b = near(wall, px, py, pz, 5);
    if (a === 0) return 'nothing is drawn at the wall from mid cave';
    return a === b || `${a} plush near the wall from mid cave, ${b} from the wall`;
  });
}
