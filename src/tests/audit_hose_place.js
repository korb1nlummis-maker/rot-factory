// audit_hose.* : the audit of the hose and laying-mode rework. This file plays the real placement path (a real B key, the real planner) at random and checks what must stay
// true: one hose is one line with one mouth, nothing faces head on, every piece is whole, and the items spent match the pieces laid.
import { makeHoseKit } from './hose_lib.js';

// a small seeded generator so a failing run can be replayed
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

export default async function (ctx) {
  const { g, S, L, adv, tiles } = ctx;
  const H = makeHoseKit(ctx), B = H.B, T = B.T, io = H.io;
  const bad = (a) => a.length === 0 || a.join('; ');

  // every structural fact one hose line must keep, as a list of complaints
  let belts = false;   // the same checks for plain belts
  const pieces = () => { if (!belts) return H.hoses(); H.rebuild(); return tiles().filter((t) => t.type === 'belt' && !t.hose && !t.free); };
  const unfed = () => pieces().filter((t) => !t.fed);
  const audit = (expectOne) => {
    const out = [], hs = pieces(), key = (t) => `${t.i},${t.k}`, at = new Map(hs.map((t) => [key(t), t]));
    for (const t of hs) {
      if (![0, 1, 2, 3].includes(t.dir) || !Number.isInteger(t.i) || !Number.isInteger(t.k)) out.push(`bad piece ${t.i},${t.k} dir ${t.dir}`);
      const n = at.get(`${t.i + H.DX[t.dir]},${t.k + H.DZ[t.dir]}`);
      if (n && ((n.dir + 2) & 3) === t.dir) out.push(`head on at ${t.i},${t.k}`);
    }
    if (expectOne && hs.length) {
      const m = unfed(); if (m.length !== 1) out.push(`${belts ? 'starts' : 'mouths'} ${m.length} of ${hs.length} pieces`);
      else if (H.follow(m[0]) !== hs.length) out.push(`line from the start ${H.follow(m[0])} of ${hs.length}`);
      if (!belts && L().mouthMesh.count !== m.length) out.push(`mouth meshes ${L().mouthMesh.count}`);
    }
    return out;
  };

  // a random player who builds on from the open end: any cell up to three ahead and one to each side, or beside the end, facing any way (the mouse turns), R in front of the end,
  // B tapped or held. The cells it picks keep clear of the old body of the line, so what it makes is one line however it is built; every step is checked.
  const play = async (seed, steps, opt = {}) => {
    belts = !!opt.belt; const r = rng(seed), b = [], log = []; H.setup(120);
    if (belts) { S().items.belt = 120; g.rebuildTools(); H.K.equip('belt'); }
    await H.put(0, 0, 0);
    for (let n = 0; n < steps; n++) {
      const hs = pieces(), end = hs.find((t) => !H.tileAt(t.i - H.o.i + H.DX[t.dir], t.k - H.o.k + H.DZ[t.dir]));
      if (!end) break;
      const ei = end.i - H.o.i, ek = end.k - H.o.k, fw = [H.DX[end.dir], H.DZ[end.dir]], sd = [-fw[1], fw[0]], cands = [];
      for (let a = 0; a <= 3; a++) for (let c = -1; c <= 1; c++) {
        if (!a && !c) continue;
        if (belts && !opt.hold && !((a === 1 && c === 0) || (a === 0 && c !== 0))) continue;   // a single press lays one belt: it does not fill a gap, as a hose press does
        const di = ei + a * fw[0] + c * sd[0], dk = ek + a * fw[1] + c * sd[1];
        if (H.tileAt(di, dk)) continue;
        // every cell of the box from the end to the target, and its neighbours, must be free of the old line (the end itself aside)
        const isEnd = (i, k) => i === ei && k === ek; let clear = true;
        for (let q = 0; q <= a && clear; q++) for (let w = Math.min(0, c); w <= Math.max(0, c) && clear; w++) {
          const bi = ei + q * fw[0] + w * sd[0], bk = ek + q * fw[1] + w * sd[1];
          if (!isEnd(bi, bk) && H.tileAt(bi, bk)) clear = false;
          for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!isEnd(bi + x, bk + y) && H.tileAt(bi + x, bk + y)) clear = false;
        }
        if (clear) cands.push([di, dk, a, c]);
      }
      if (!cands.length) break;
      const [di, dk, a, c] = cands[(r() * cands.length) | 0], face = (r() * 4) | 0;
      const rr = a === 1 && c === 0 && r() < 0.25; if (rr) io.tap('KeyR');   // R turns the next piece: asked for in front of the end, where it makes a bend
      const how = opt.hold && (belts ? true : r() < 0.5) ? 'hold' : 'tap'; log.push(`${how}${rr ? '+R' : ''} ${di},${dk} f${face}`);
      // (the press that starts a hold is a plain press: for a belt it lays one belt where it is aimed, so a sweep starts on the cell next to the end and the held aim carries it on)
      const sweep = belts && how === 'hold' && !((a === 1 && c === 0) || (a === 0 && c !== 0)) ? [[ei + fw[0], ek + fw[1]], [di, dk]] : [[di, dk]];
      if (how === 'hold') await H.hold(sweep, face); else await H.put(di, dk, face);
      const complaints = audit(true); if (complaints.length) { b.push(`seed ${seed} step ${n}: ${complaints.join(', ')} | end ${ei},${ek}:${end.dir} | steps: ${log.slice(-5).join('; ')} | pieces: ${pieces().map((t) => `${t.i - H.o.i},${t.k - H.o.k}:${t.dir}`).join(' ')}`); break; }
    }
    belts = false; return b;
  };

  for (const seed of [1, 2, 3, 4]) {
    await T(`audit_hose.random-player-seed-${seed}-keeps-one-line-one-mouth-no-head-on`, async () => bad(await play(seed, 40)));
  }
  for (const seed of [11, 12, 13]) {
    await T(`audit_hose.random-player-holding-b-seed-${seed}-keeps-one-line-one-mouth`, async () => bad(await play(seed, 40, { hold: true })));
  }

  for (const seed of [21, 22]) {
    await T(`audit_hose.random-player-belts-seed-${seed}-keeps-one-line-one-start-no-head-on`, async () => bad(await play(seed, 36, { belt: true })));
  }
  for (const seed of [31, 32]) {
    await T(`audit_hose.random-player-holding-b-belts-seed-${seed}-keeps-one-line-one-start`, async () => bad(await play(seed, 36, { belt: true, hold: true })));
  }

  await T('audit_hose.the-aim-a-few-cells-past-the-end-shows-the-run-it-will-lay-and-no-new-mouth', async () => {
    H.setup(); const b = [];
    for (let s = 0; s < 3; s++) await H.put(s, 0, 0);
    const meshes = () => { const o = { n: 0, ring: 0, mouth: 0 }; if (g.machines.ghost) g.machines.ghost.traverse((m) => { if (m.isMesh) { o.n++; if (m.geometry.type === 'TorusGeometry') o.ring++; if (m.geometry.type === 'CylinderGeometry') o.mouth++; } }); return o; };
    io.clearHint(); await H.aim(5, 0, 0); let m = meshes();
    if (m.ring || m.mouth) b.push(`the aim two cells past the end shows a mouth (${m.mouth} flares, ${m.ring} rings) though B joins it to the line`);
    if (m.n < 3) b.push(`the ghost shows ${m.n} pieces, B lays 3`); if (!/lays 3 pieces/.test(io.hint())) b.push('hint: ' + io.hint());
    await H.aim(8, 4, 0); m = meshes(); if (m.ring !== 1 || m.mouth !== 1) b.push(`a far aim is a new line and should show its mouth (${m.mouth} flares, ${m.ring} rings)`);
    await H.put(5, 0, 0); if (H.hoses().length !== 6 || H.mouths().length !== 1) b.push(`B laid ${H.hoses().length} pieces, ${H.mouths().length} mouths`);
    return bad(b);
  });

  await T('audit_hose.a-splitter-feeds-the-hoses-at-all-three-of-its-outputs-so-none-of-them-is-a-mouth', async () => {
    H.setup(); const b = [], i = H.o.i, k = H.o.k;
    B.lay(0, 3, i, k, 0); const sp = L().tileAt(i + 2, 0, k); sp.splitter = true; L().buildSplitter(sp);
    for (const [di, dk, d] of [[3, 0, 0], [2, -1, 3], [2, 1, 1]]) g.placeEntity('belt', { i: i + di, j: 0, k: k + dk, dir: d, rise: 0, hose: true, items: [] }, { quiet: true, rebuild: false });
    H.rebuild(); const ms = H.mouths(); if (ms.length) b.push(`${ms.length} of 3 hoses at a splitter show a mouth (${ms.map((t) => `${t.i - i},${t.k - k}`).join(' ')})`);
    if (L().mouthMesh.count !== 0) b.push('flared mouths drawn ' + L().mouthMesh.count);
    // and a hose that points back at the splitter is not fed by it
    H.tileAt(2, -1).dir = 1; H.rebuild(); if (H.mouths().length !== 1) b.push('a hose that faces the splitter feeds it and is a mouth itself: ' + H.mouths().length);
    return bad(b);
  });

  await T('audit_hose.no-gate-goes-on-a-hose-either', async () => {
    H.setup(); const b = [];
    for (let s = 0; s < 3; s++) await H.put(s, 0, 0);
    S().up.detector = 1; g.refreshTuning(); S().items.gate = 2; g.rebuildTools(); H.K.equip('gate'); if (g.curTool().kind !== 'gate') return 'no gate in hand: the test would prove nothing'; const pl = await H.aim(1, 0, 0); if (!pl) return 'no plan';
    if (pl && pl.ok) b.push('a gate plan on a hose is ok: ' + (pl.ent && pl.ent.type)); if (pl && !/no gates/.test(pl.why || '')) b.push('the reason: ' + (pl && pl.why));
    io.tap('KeyB'); adv(0.05); const t = H.tileAt(1, 0); if (t.detector) b.push('the hose piece became a gate'); if (S().items.gate !== 2) b.push('the gate was spent');
    return bad(b);
  });
}
