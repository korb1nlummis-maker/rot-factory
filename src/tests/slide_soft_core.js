// slides.soft-*: the footing gives way below the slab line and the plush under and around the boots flow downhill as a sheet (softslide.js):
// no hit from the slide, the player rides it and comes to rest, how deep the landing buries is read from the pile that came to rest on them,
// gear shortens the carry but not the burial, everything is bounded and no plush is made or lost.
import { sk, AV, SS } from './slide_soft_lib.js';

export default async function (ctx) {
  const { g, S, p, w, sim } = ctx;
  const T = async (name, fn) => ctx.T(name, async () => { try { return await fn(); } finally { delete g.climbRisk; g.keys = {}; reset({}); g.softslide.clear(); } });
  const K = sk(ctx), { ss, seeded, lcg, play, slide, ride, stand, pocket, key, punchLoop, plush, tagged, reset, logHurts, av, C, toI, toK, toJ, cellX, cellZ, heart } = K;
  const roll0 = (fn) => { const o = Math.random; Math.random = () => 0; try { return fn(); } finally { Math.random = o; } };
  // a player looks around and heads for the thinnest wall: the heading (yaw) with the fewest plush cells in the first four cells of the three levels round the head and chest
  const bestYaw = () => {
    const q = p().pos, i0 = toI(q.x), k0 = toK(q.z), jb = toJ(q.y + 0.05); let best = 0, bs = 1e9;
    for (let n = 0; n < 16; n++) { const yaw = n / 16 * Math.PI * 2, dx = Math.sin(yaw), dz = Math.cos(yaw); let c = 0; for (let d = 1; d <= 4; d++) for (let L = 0; L < 3; L++) if (w().solid(toI(q.x + dx * d * C), jb + L, toK(q.z + dz * d * C))) c += 1 + (4 - d) * 0.3; if (c < bs) { bs = c; best = yaw; } }
    return best;
  };
  const dropKeys = () => { key('KeyW', false); key('KeyA', false); key('KeyS', false); key('KeyD', false); key('Space', false); };

  await T('slides.soft-no-hp-loss-from-the-slide-itself', async () => {
    const bad = [];
    for (const [y, dir] of [[12, 1], [15, -1], [17, 1]]) {
      stand(y, 10, dir); g.hp = 100; for (let q = 0; q < 6; q++) S().carry.push({ sp: 2, vr: 0 });
      const H = logHurts(); let a = null;
      try {
        const quiet = g.climbRisk; delete g.climbRisk; roll0(() => { g._climbT = 5; g.climbRisk(0.1); }); g.climbRisk = quiet;
        a = av().cur; if (!a || !a.soft) { bad.push('no soft slide at ' + y); continue; }
        if (S().carry.length >= 6) bad.push('nothing fell out of the hands'); if (S().carry.length < 1) bad.push('everything fell');
        if (g.hp < 100) bad.push('hit at the start: ' + (100 - g.hp));
        play(30, () => !!av().cur); play(1);
      } finally { H.stop(); }
      const slideHits = H.log.filter((h) => h.dealt > 0 && h.why !== 'fell too far');
      const falls = H.log.filter((h) => h.dealt > 0 && h.why === 'fell too far').reduce((s, h) => s + h.dealt, 0);
      if (slideHits.length) bad.push(`at ${y} m the slide hurt: ${JSON.stringify(slideHits)}`);
      if (falls > 6) bad.push(`falls cost ${falls}`);
      if (g.dead) bad.push('died');
    }
    reset({}); return bad.length === 0 || bad.join('; ');
  });

  await T('slides.soft-the-smallest-slide-is-still-a-sheet-of-40-plush-or-more-flowing-as-a-wave', async () => {
    const bad = [], rows = [];
    for (const [y, dir, e] of [[9, 1, 0], [12, -1, 0], [10, 1, 0.1]]) {
      stand(y, 10, dir); const a = seeded(5 + y, () => slide(e)); if (!a) { bad.push('no slide at ' + y); continue; }
      const n = a.n; let r = null; seeded(9 + y, () => { r = ride({ max: 20 }); });
      const last = av().last; rows.push([y, e, n, last.released, +(a.tLast - a.tFirst).toFixed(2), r.peakLive]);
      if (last.released < 40) bad.push(`only ${last.released} plush let go at ${y} m`);
      if (!(a.tLast - a.tFirst >= 0.2)) bad.push('it all let go at once (a trickle or a bang, not a wave)');
      if (r.peakLive < 25) bad.push('only ' + r.peakLive + ' loose at the peak');
      if (n > 200) bad.push('the weakest slide let ' + n + ' go');
    }
    reset({}); return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(rows);
  });

  await T('slides.soft-sizes-grow-with-height-slope-and-load-and-stay-bounded', async () => {
    reset({}); const bad = [], rows = [];
    stand(24); const pos = { x: p().pos.x, y: 0, z: p().pos.z }, r = () => 0.5;
    const M = (y, tan, n) => ss().size({ ...pos, y }, n, tan, r).M;
    for (const [a, b] of [[M(9, 0.8, 0), M(20, 0.8, 0)], [M(20, 0.8, 0), M(34, 0.8, 0)], [M(20, 0.4, 0), M(20, 1.4, 0)], [M(20, 0.8, 0), M(20, 0.8, 40)]]) { rows.push([a, b]); if (!(b > a)) bad.push(`not growing: ${a} -> ${b}`); }
    const lo = ss().size({ ...pos, y: 8 }, 0, 0.2, () => 0), hiS = ss().size({ ...pos, y: 43 }, 200, 2, () => 1);
    if (lo.M < 40 || lo.M > 80) bad.push('the weakest slide is ' + lo.M + ' plush'); if (lo.cls !== 'small') bad.push('weakest is ' + lo.cls);
    if (hiS.M > 800 || hiS.M < 450 || hiS.cls !== 'large') bad.push('the strongest is ' + hiS.M + ' ' + hiS.cls);
    if (hiS.maxTravel > 30 || hiS.flowT > 5) bad.push('unbounded carry ' + JSON.stringify(hiS));
    const mid = ss().size({ ...pos, y: 22 }, 12, 1.0, () => 0.5); if (mid.cls !== 'medium' || mid.M < 150 || mid.M > 400) bad.push('a middling slide is ' + mid.M + ' ' + mid.cls);
    return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(rows);
  });

  await T('slides.soft-the-player-rides-the-flow-downhill-and-comes-to-rest-in-the-runout', async () => {
    const bad = [], rows = []; let rode = 0;
    for (const [y, dir, e] of [[18, 1, 0.3], [22, -1, 0.5], [26, 1, 0.7]]) {
      stand(y, 10, dir); g.hp = 100; const a = seeded(11 + y, () => slide(e)); if (!a) { bad.push('no slide at ' + y); continue; }
      const maxT = a.maxTravel; let r = null; seeded(3 + y, () => { r = ride({ max: 25 }); });
      const top = w().topAt(toI(p().pos.x), toK(p().pos.z)) * C, row = { y, e, swept: r.swept, carried: +r.carried.toFixed(1), drop: +r.drop.toFixed(1), speed: +r.speed.toFixed(2), secs: av().last.secs, maxT: +maxT.toFixed(1), v: +r.vmax.toFixed(1) }; rows.push(row);
      if (r.swept < 10) bad.push('carried for only ' + r.swept + ' frames ' + JSON.stringify(row));
      if (r.carried < 2.5 || r.drop < 1.5) bad.push('not carried down ' + JSON.stringify(row)); else rode++;
      if (r.speed > 2) bad.push('still moving at the end ' + JSON.stringify(row));
      if (p().swept > 0) bad.push('still swept at the end');
      if (p().pos.y - top > 3) bad.push('floating ' + (p().pos.y - top).toFixed(1));
      if (av().cur) bad.push('the slide did not finish');
    }
    reset({}); return (bad.length === 0 && rode >= 3) || bad.join('; ') + ' ' + JSON.stringify(rows);
  });

  await T('slides.soft-burial-depth-comes-from-the-pile-that-lands-small-medium-large', async () => {
    const bad = [], rows = []; const lv = [];
    for (const [name, e, seed] of [['small', 0.05, 21], ['medium', 0.5, 22], ['large', 0.9, 23]]) {
      stand(26, 10, 1); g.hp = 100; const a = seeded(seed, () => slide(e)); if (!a) { bad.push('no slide ' + name); continue; }
      let r = null; seeded(seed + 100, () => { r = ride({ max: 25 }); });
      const l = r.land, q = p().pos, i0 = toI(q.x), k0 = toK(q.z), jb = toJ(q.y + 0.05), cap = w().solid(i0, jb + 3, k0);
      rows.push({ name, n: av().last.released, pool: l && l.pool, B: l && +l.B.toFixed(1), want: l && l.want, landed: l && l.lvl, cells: ss().lvl, cap, placed: l && l.placed }); if (l) lv.push(l.lvl);
      if (!l) { bad.push('no landing for ' + name); continue; }
      // (the depth is what the landing left round the person's cell; a step of the player after it can move them a little: the cells are read again and may differ by one level)
      if (name === 'small' && !(l.lvl >= 1 && l.lvl <= 2)) bad.push('small slide buried to level ' + l.lvl);
      if (name === 'medium' && l.lvl !== 3) bad.push('medium slide buried to level ' + l.lvl);
      if (name === 'large' && !(l.lvl === 4 && l.cap)) bad.push('large slide: level ' + l.lvl + ' cap ' + l.cap);
      if (name !== 'large' && l.cap) bad.push(name + ' slide has a cap over the head');
      if (Math.abs(ss().lvl - l.lvl) > 1) bad.push(`landing says ${l.lvl}, the cells say ${ss().lvl} (at ${JSON.stringify(l.at)}, now ${[p().pos.x, p().pos.y, p().pos.z].map((v) => +v.toFixed(2))})`);
    }
    if (!(lv[0] < lv[1] && lv[1] < lv[2])) bad.push('not deeper with size: ' + lv.join('<'));
    reset({}); return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(rows);
  });

  await T('slides.soft-a-small-burial-you-wriggle-out-of-in-about-a-second-without-help', async () => {
    const bad = [], rows = []; let buried = 0;
    for (const [seed, y] of [[31, 24], [32, 20], [33, 28], [34, 22], [35, 26], [36, 18]]) {
      if (buried >= 3) break;
      stand(y, 10, 1); g.hp = 100; const a = seeded(seed, () => slide(0.05)); if (!a) { bad.push('no slide'); continue; }
      seeded(seed + 100, () => ride({ max: 25 }));
      const lvl0 = ss().lvl; if (lvl0 < 1) { rows.push({ seed, lvl0 }); continue; }   // (a small slide may leave nothing on you; one that does bury only reaches the waist)
      if (lvl0 > 2) { bad.push(`seed ${seed}: small slide left level ${lvl0}`); continue; }
      buried++; const at = { x: p().pos.x, z: p().pos.z }; g.airLeft = undefined;
      const H = logHurts(); key('KeyW'); p().yaw = bestYaw(); let t = play(4, () => ss().on);   // (a player heads for the thinnest wall)
      const moved = Math.hypot(p().pos.x - at.x, p().pos.z - at.z), heldAt = ss().on; dropKeys(); play(1.2); H.stop();   // (held is read the moment you are out; a hollow further along may hold you again)
      if (H.log.some((h) => h.dealt > 0 && h.why !== 'fell too far')) bad.push('hurt wriggling out: ' + JSON.stringify(H.log));
      rows.push({ seed, lvl0, secs: +t.toFixed(2), moved: +moved.toFixed(2), on: heldAt, trapOn: g.trapOn });
      if (heldAt) bad.push(`seed ${seed}: still held after ${t.toFixed(1)} s`); if (t > 3.5) bad.push(`seed ${seed}: took ${t.toFixed(1)} s`); if (moved < 0.2) bad.push(`seed ${seed}: did not move (moved ${moved.toFixed(2)})`);   // (out of the ring; more loose heap beyond it is walked over or punched like any other)
      if (g.trapOn) bad.push('the trapped system ran for a small burial');
    }
    if (buried < 2) bad.push('only ' + buried + ' of the small slides buried anyone');
    return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(rows);
  });

  // dig out as a player does: look for the thinnest wall, punch what is ahead (up first under a cap), walk at the way out; true when the pile no longer holds you
  const digOut = (a, from, maxSec = 14) => {
    p().pitch = 0.05; p().yaw = bestYaw(); let t = 0, next = 0, n = 0, up = 0, minAir = 99;
    while (t < maxSec) {
      g.time += 1 / 60; g.updatePlay(1 / 60); t += 1 / 60;
      if (g.airLeft !== undefined) minAir = Math.min(minAir, g.airLeft);
      if (t >= next) { next = t + 0.34; g.punchT = 0; if (ss().lvl <= 3) p().yaw = bestYaw(); if (ss().lvl >= 4) { g.punch(true, true); up++; } else if (ss().lvl >= 3 || Math.hypot(p().pos.x - from.x, p().pos.z - from.z) < 1.5) { p().pitch = [0.05, -0.5, -0.9][n % 3]; g.punch(); } n++; }   // (a player looks down for the lower rows of a heap)
      if (ss().lvl <= 2) key('KeyW'); else key('KeyW', false);
      if (!ss().on && ss().lvl === 0) break;   // (the pile no longer holds you: you are not enclosed any more)
    }
    key('KeyW', false); return { t, n, up, minAir, out: !ss().on && ss().lvl === 0 };
  };

  await T('slides.soft-a-medium-burial-needs-punching-out-a-few-seconds-and-a-little-air', async () => {
    const bad = [];
    stand(26, 10, 1); g.hp = 100; const a = seeded(22, () => slide(0.5)); if (!a) return 'no slide';
    seeded(122, () => ride({ max: 25 })); if (ss().lvl !== 3) return 'medium slide left level ' + ss().lvl;
    play(0.5); if (!g.trapOn) bad.push('the trapped system did not run at chest depth'); const air0 = g.airLeft; if (!(air0 > 55 && air0 <= 60)) bad.push('air at the start ' + air0);
    const from = { x: p().pos.x, z: p().pos.z }, H = logHurts();
    // walking does not free you
    key('KeyW'); p().yaw = bestYaw(); play(2.5); dropKeys(); if (ss().lvl < 3) bad.push('walking freed a chest deep burial'); if (Math.hypot(p().pos.x - from.x, p().pos.z - from.z) > 1.5) bad.push('walked out of a chest deep burial');
    const r = digOut(a, from); H.stop();
    if (!r.out) bad.push(`still buried after ${r.t.toFixed(1)} s and ${r.n} punches`); if (r.n < 1) bad.push('free without a punch');
    if (r.t > 12) bad.push('took ' + r.t.toFixed(1) + ' s');
    if (r.minAir < 40) bad.push('used ' + (60 - r.minAir).toFixed(0) + ' s of air'); if (H.log.some((h) => h.dealt > 0 && h.why !== 'fell too far')) bad.push('hurt: ' + JSON.stringify(H.log));
    if (g.suffocating) bad.push('suffocating'); return bad.length === 0 || bad.join('; ') + ` punches ${r.n} secs ${r.t.toFixed(1)} min air ${r.minAir.toFixed(0)}`;
  });

  await T('slides.soft-a-large-burial-engages-the-trapped-system-and-air-never-starts-at-zero', async () => {
    const bad = [];
    stand(26, 10, 1); g.hp = 100; g.airLeft = undefined; const a = seeded(23, () => slide(0.9)); if (!a) return 'no slide';
    seeded(123, () => ride({ max: 25, settle: 0.3 })); if (ss().lvl !== 4) return 'large slide left level ' + ss().lvl;
    play(0.4); const max = 60 + 30 * (g.T.airTank || 0);
    if (!g.trapOn) bad.push('not trapped'); if (!(g.airLeft > max - 3 && g.airLeft <= max)) bad.push('air at the start ' + g.airLeft); if (!(g.player.buried > 1.2)) bad.push('buried ' + g.player.buried);
    if (g.dead || g.hp < 90) bad.push('hurt at the start'); if (g.suffocating) bad.push('suffocating at once');
    const from = { x: p().pos.x, z: p().pos.z }, r = digOut(a, from, 20);
    if (!r.out) bad.push('never got out in ' + r.t.toFixed(1) + ' s'); if (r.up < 1) bad.push('did not punch up through the cap');
    if (g.dead || g.hp < 90 || g.suffocating) bad.push(`hp ${g.hp} suffocating ${g.suffocating}`); if (r.minAir <= 0) bad.push('out of air');
    return bad.length === 0 || bad.join('; ') + ` punches ${r.n} (up ${r.up}) secs ${r.t.toFixed(1)} min air ${r.minAir.toFixed(0)}`;
  });

  // a slide above you: whoever stands in the runout when the pile comes to rest (the player who did not climb, bots) is buried by what landed on their column.
  // The flow bends with the terrain, so the test lets it run, finds the heart of the landed pile from the ground recorded at the start, and has them standing there.
  await T('slides.soft-a-slide-above-buries-whoever-stands-in-the-runout-player-and-bots', async () => {
    const bad = [], rows = [];
    const q = stand(28, 10, 1), P = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
    p().pos.set(P.x + 40, 0, P.z + 40);   // the player is somewhere else while it lets go
    const a = seeded(71, () => ss().start(P, { e: 0.9, warn: 0.2, by: 'test' })); if (!a) return 'no slide';
    if (a.rider) bad.push('the player was counted as a rider');
    seeded(171, () => { let t = 0; while (av().cur && t < 30) { g.time += 1 / 60; g.updatePlay(1 / 60); t += 1 / 60; } });
    if (!ss().pend) return 'the landing is not waiting';
    const hd = heart(a); if (!hd || hd.sum < 40) return 'no pile landed ' + JSON.stringify(hd);
    const put = (i, k) => ({ x: cellX(i), z: cellZ(k), y: w().topAt(i, k) * C });
    const me = put(hd.i, hd.k); p().pos.set(me.x, me.y, me.z); p().vel.set(0, 0, 0); p().onGround = true; p().footCell = { i: hd.i, j: w().topAt(hd.i, hd.k) - 1, k: hd.k };
    const bots = []; for (const [di, dk] of [[3, 0], [-3, 1], [0, 4], [1, -4], [5, 5], [-4, -4]]) { const b = g.crew.spawn(), s2 = put(hd.i + di, hd.k + dk); b.x = s2.x; b.z = s2.z; b.y = s2.y + 0.05; b.vy = 0; b.state = 'idle'; bots.push(b); }
    seeded(172, () => play(3.2));
    const L = ss().last; if (!L) return 'no landing';
    const mine = L.landings.find((l) => l.who === 'player'), bl = L.landings.filter((l) => l.bot);
    rows.push({ mine, bots: bl.map((b) => [b.pool, b.lvl]) });
    if (!mine || mine.pool < SS.POOL_MIN) bad.push('the player in the runout had no pile land on them: ' + JSON.stringify(mine)); else if (mine.lvl < 1) bad.push('landed ' + mine.pool + ' but not buried ' + JSON.stringify(mine));
    if (mine && ss().cover(p().pos).lvl !== mine.lvl) bad.push(`cells say ${ss().cover(p().pos).lvl}, landing says ${mine.lvl}`);
    if (g.hp < 90) bad.push('the slide hurt the bystander: ' + g.hp);
    if (bl.length < bots.length - 1) bad.push('bots in the landing ' + bl.length + ' of ' + bots.length);   // (the crew may have moved one: it walks)
    if (!bl.some((b) => b.lvl >= 1)) bad.push('no bot was buried ' + JSON.stringify(bl.map((b) => [b.pool, b.lvl])));
    play(1.2); let inside = 0;   // (the avalanche looks for buried bots twice a second for 25 s and lifts them; the crew may have moved one since)
    for (const b of bots) { const i = toI(b.x), k = toK(b.z); if (w().solid(i, toJ(b.y + g.crew.radius(b)), k)) inside++; if (!Number.isFinite(b.x + b.y + b.z)) bad.push('bot position ' + b.y); }
    if (inside > 1) bad.push(inside + ' bots were left inside the pile');
    // and the bystander is held like anybody else, and digs out the same way
    if (mine && mine.lvl >= 1) { play(0.4); if (!ss().on) bad.push('the bystander is not held by the pile'); }
    return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(rows);
  });

  await T('slides.soft-no-plush-is-made-or-lost-cells-plus-bodies', async () => {
    const bad = [];
    for (const [e, seed] of [[0.05, 41], [0.5, 42], [0.9, 43]]) {
      const q = stand(26, 10, 1); const base = plush(q.i, q.k, 170), b0 = sim().n;
      const a = seeded(seed, () => slide(e)); if (!a) { bad.push('no slide'); continue; }
      seeded(seed + 100, () => ride({ max: 25 })); play(2);
      const now = plush(q.i, q.k, 170);
      if (now.total !== base.total) bad.push(`e ${e}: plush ${base.total} -> ${now.total} (${now.cells} cells, ${now.bodies} bodies)`);
      if (tagged() !== 0) bad.push('tagged bodies left ' + tagged()); if (sim().n - b0 > 6) bad.push(`bodies ${b0} -> ${sim().n}`);
    }
    reset({}); return bad.length === 0 || bad.join('; ');
  });

  await T('slides.soft-time-and-distance-are-bounded-and-the-sim-stays-cheap', async () => {
    const bad = [], rows = [];
    for (const [e, seed] of [[0, 51], [0.5, 52], [1, 53]]) {
      stand(30, 10, -1); const a = seeded(seed, () => slide(e)); if (!a) { bad.push('no slide'); continue; }
      const meta = a.meta; let peakSim = 0, maxLive = 0;
      seeded(seed + 100, () => { ride({ max: 40 }); });
      const last = av().last;
      rows.push({ e, n: a.n, secs: last.secs, hard: +a.hard.toFixed(1), maxT: +a.maxTravel.toFixed(1), peak: last.peakLive });
      if (last.secs > a.hard + 4.2) bad.push(`took ${last.secs} s (hard stop ${a.hard.toFixed(1)})`); if (a.hard > 12) bad.push('hard stop ' + a.hard);
      if (a.maxTravel > 30) bad.push('travel cap ' + a.maxTravel); if (last.peakLive > AV.BODY_CAP) bad.push('bodies ' + last.peakLive);
      if (last.perf.max > 250) bad.push('a tick took ' + last.perf.max.toFixed(0) + ' ms'); if (last.how !== 'settled') bad.push('ended by ' + last.how);
      if (av().cur || tagged() !== 0) bad.push('not over');
    }
    reset({}); return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(rows);
  });

  await T('slides.soft-gear-lowers-the-odds-and-the-carry-but-not-the-burial', async () => {
    const bad = [], rows = [];
    // odds below the slab line
    const tries = (up) => { let hits = 0; for (let n = 0; n < 40; n++) { stand(14, 10, 1, up); g.hp = 100; av().clear(); const f0 = S().stats.climbFalls || 0; const quiet = g.climbRisk; delete g.climbRisk; const o = Math.random; Math.random = () => 0.1; try { g._climbT = 5; g.climbRisk(0.1); } finally { Math.random = o; g.climbRisk = quiet; } if ((S().stats.climbFalls || 0) > f0) hits++; av().clear(); } return hits; };
    const a0 = tries({}), a3 = tries({ climb: 3 }); if (!(a0 > 0 && a3 === 0)) bad.push(`odds at 14 m: no gear ${a0}/40, gear 3 ${a3}/40`);
    // carry and burial: the same slide (size, seed, place) with and without gear
    const out = {};
    for (const [name, up] of [['none', {}], ['gear', { climb: 3, walk: 6, jump: 8.7 }]]) {
      stand(26, 10, 1, up); const a = seeded(22, () => slide(0.5)); if (!a) { bad.push('no slide ' + name); continue; }
      const r = seeded(122, () => ride({ max: 25 })); out[name] = { flowT: a.flowT, maxT: a.maxTravel, carried: r.carried, lvl: ss().lvl, want: r.land && r.land.want, pool: r.land && r.land.pool }; rows.push({ name, ...out[name] });
    }
    if (out.none && out.gear) {
      if (!(out.gear.flowT < out.none.flowT && out.gear.maxT < out.none.maxT)) bad.push('gear did not shorten the flow ' + JSON.stringify(out));
      if (!(out.gear.carried <= out.none.carried + 1.5)) bad.push('gear carried further ' + JSON.stringify(out));
      if (out.gear.want !== out.none.want || out.gear.want < 3 || out.gear.lvl < 2 || out.none.lvl < 2) bad.push('burial changed with gear ' + JSON.stringify(out));   // (what the landing decided is the same: chest deep; the cells may differ by a step of the player)
    }
    reset({}); g.T = g.tune(); return bad.length === 0 || bad.join('; ');
  });
}
