// wedge.audit.*: adversarial checks of the slide (src/wedge.js, src/burial.js) against the rest of the world: random steep slopes with a plush tally (cells plus bodies plus what
// bins and the stale sale took), a tunnel mouth in the runout, a belt, a vault, a machine or a bot in the path, two slides at once and in a row, a save and a real load in the
// middle of a slide, the connection closing, and what the cascade costs.
import { wk, WEDGE } from './wedge_lib.js';
import { isSpecialCell } from '../plushdata.js';
import { saveGame, loadSaved } from '../state.js';
import { SAVE_KEY } from '../config.js';

export default async function (ctx) {
  const { T: T0, g, S, w, p, sim, stepSim, toI, toK, cellX, cellY, cellZ, cfg, V3 } = ctx;
  const K = wk(ctx), { hi, stand, seeded, slide, play, tagged, reset, wd, bu, logHurts, plush, C } = K;
  const NX = cfg.NX, NZ = cfg.NZ;
  const T = async (name, fn) => T0(name, async () => { try { return await fn(); } finally { delete g.climbRisk; delete g.netSend; g.net.open = false; g.net.role = null; g.guestReady = false; g.remote = null; g.netOut.length = 0; reset({}); } });
  // every plush that leaves a cell is a loose body or a cell again: net() is 0 when none was lost or made out of nothing since mark()
  const tally = () => {
    const wd2 = w(), s = sim(), osc = wd2.setCell, osp = s.spawn.bind(s), orm = s.remove.bind(s); let removed = 0, added = 0, b0 = s.n, sunk = 0, spill = 0, picked = 0;
    const ohb = s.hooks && s.hooks.onBin, ost = s.hooks && s.hooks.onStale; if (ohb) s.hooks.onBin = (...a) => { sunk++; return ohb(...a); }; if (ost) s.hooks.onStale = (...a) => { sunk++; return ost(...a); };   // (the sorting bin takes a plush in, a plush loose for 30 s is sold: sorted or sold, not lost)
    wd2.setCell = function (i, j, k, sp, vr) { const o = this.get(i, j, k); if (o && !isSpecialCell(o)) removed++; if (sp && !isSpecialCell(sp)) added++; return osc.call(this, i, j, k, sp, vr); };
    s.spawn = function (...a) { if (/dropLoad|climbRisk|\bdie\b/.test(new Error().stack)) spill++; return osp(...a); };   // (plush out of the player's hands is a body, not made out of nothing)
    s.remove = function (i) { if (/pullLooseToBins|sellAuto|catchInCart|pickupLoose|hoseIntake/.test(new Error().stack)) sunk++; return orm(i); };   // (a bin or a vault takes a loose plush in: stored, not lost)
    return {
      stop() { delete wd2.setCell; delete s.spawn; delete s.remove; if (ohb) s.hooks.onBin = ohb; if (ost) s.hooks.onStale = ost; },
      mark() { removed = 0; added = 0; b0 = s.n; sunk = 0; spill = 0; picked = 0; const arr = S().carry; arr.push = function (...a) { picked += a.length; return Array.prototype.push.apply(this, a); }; },
      sunk: () => sunk, net: () => removed - added - (s.n - b0) - sunk + spill - picked,
    };
  };
  const badBody = () => { const s = sim(); for (let i = 0; i < s.n; i++) { if (!Number.isFinite(s.x[i] + s.y[i] + s.z[i] + s.vx[i] + s.vy[i] + s.vz[i])) return 'a body is not finite'; if (s.y[i] < -0.6 || s.y[i] > 44) return 'a body left the hall at y=' + s.y[i].toFixed(1); } return ''; };
  const carry = (n) => { S().carry = []; for (let q = 0; q < n; q++) S().carry.push({ sp: 2, vr: 0 }); };
  const settle = (max = 900) => { let after = 0; for (; after < max && (sim().n > 2 || after < 60); after++) { g.time += 0.05; g.updatePlay(0.05); } return after; };

  await T('wedge.audit.soak-random-steep-slopes-keep-every-plush-and-end-clean', async () => {
    const bad = [], rows = [], tl = tally();
    try {
      for (let n = 0; n < 9; n++) {
        const info = seeded(1000 + n * 7919, () => {
          const up = [{}, {}, { climb: 1 }, { climb: 2 }, { boots: 3, springs: 2 }][n % 5], y = 14 + Math.random() * 24, dir = Math.random() < 0.5 ? 1 : -1, lane = (Math.random() * 22) | 0, c = (Math.random() * 25) | 0;
          return { up, y, dir, lane, c, dt: [1 / 60, 1 / 30, 0.05, 0.1][(Math.random() * 4) | 0], sp: Math.random() * 3, e: Math.random() };
        });
        reset(info.up); g.climbRisk = () => {}; try { hi(info.y, info.lane, info.dir); } catch (e) { continue; }
        carry(info.c); g.hp = 100; const pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
        const a = seeded(77 + n, () => slide(info.e, { carry: info.c, speed: info.sp, by: 'climb', warn: 0.2 + info.e * 0.4 })); if (!a) { rows.push('none ' + n); continue; }
        tl.mark(); const H = logHurts(); let peak = 0, why = '', secs = 0;
        seeded(78 + n, () => { while (wd().cur && secs < 40) {
          g.time += info.dt; g.updatePlay(info.dt); secs += info.dt; peak = Math.max(peak, sim().n);
          if (wd().cur && Math.abs(tagged() - wd().live) > tl.sunk() + 2) { why = `live ${wd().live} but ${tagged()} tagged at ${secs.toFixed(2)} s`; break; }
          if (sim().n > WEDGE.SIM_CAP + WEDGE.RELEASE_PER_TICK) { why = 'bodies ' + sim().n; break; }
          const b = badBody(); if (b) { why = b; break; }
        } });
        const after = settle(); H.stop(); const by = {}; for (const h of H.log) by[h.why] = (by[h.why] || 0) + h.dealt;
        const last = wd().last, row = { n, y: +pos.y.toFixed(1), tan: +a.tan, dt: +info.dt.toFixed(3), cls: a.cls, rel: last && last.released, secs: +secs.toFixed(1), how: last && last.how, peak, net: tl.net(), hp: Math.round(g.hp), left: sim().n };
        rows.push(row);
        if (why) bad.push(`${why} ${JSON.stringify(row)}`); if (wd().cur) bad.push('the slide did not end ' + JSON.stringify(row)); if (tagged()) bad.push('tagged bodies left ' + JSON.stringify(row));
        if (tl.net() !== 0) bad.push('plush ' + (tl.net() > 0 ? 'lost ' : 'made ') + Math.abs(tl.net()) + ' ' + JSON.stringify(row));
        if (g.dead || g.hp < 1) bad.push('died ' + JSON.stringify(row)); if (sim().n > 3) bad.push(`still ${sim().n} loose bodies after ${after * 0.05} s ` + JSON.stringify(row));
        if (peak > WEDGE.SIM_CAP + WEDGE.RELEASE_PER_TICK) bad.push('the sim went past its cap');
        if (p().embedded || p().buried > 0.5 && !(bu().on || bu().lvl > 0)) bad.push('the player is stuck in plush with no burial reading ' + JSON.stringify(row));
        if (by['were thrown down the pile by a slide']) bad.push('the old hit is back');
      }
      if (rows.length < 5) bad.push('only ' + rows.length + ' slides ran');
      window.__wedgeAudit = Object.assign(window.__wedgeAudit || {}, { soak: rows });
      return bad.length === 0 || bad.join('; ');
    } finally { delete g.climbRisk; tl.stop(); reset({}); }
  });

  await T('wedge.audit.two-slides-at-once-and-in-a-row-stay-bounded-and-keep-every-plush', async () => {
    const bad = [], rows = [], tl = tally();
    try {
      stand(30); const e0 = g.errCount || 0;
      for (let n = 0; n < 3; n++) {
        hi(30 - n * 2, 10, 1); wd().cool = 0; g.hp = 100; g.dead = false; bu().restT = 0; bu().pend = null;
        const a = slide(0.6, { warn: 0.2 }); if (!a) { rows.push('none'); continue; }
        // a second one cannot start while the first runs (here, from the host's own footing, from a guest's request and from the climb check)
        if (wd().start({ x: p().pos.x + 3, y: p().pos.y, z: p().pos.z }, { e: 0.5, warn: 0.1 })) bad.push('a second slide started on top of the first'); if (wd().onClimbHit(p().pos, 0)) bad.push('onClimbHit started a second slide');
        tl.mark(); let secs = 0; while (wd().cur && secs < 40) { g.time += 0.05; g.updatePlay(0.05); secs += 0.05; if (secs > 1 && secs < 1.1 && wd().cur) { const b = wd().start({ x: p().pos.x, y: p().pos.y, z: p().pos.z }, { e: 0.9, warn: 0.1 }); if (b) bad.push('a slide started in the middle of another'); } }
        const after = settle(); const row = { n, cls: a.cls, rel: a.released, secs: +secs.toFixed(1), settle: +(after * 0.05).toFixed(1), net: tl.net(), left: sim().n, hp: Math.round(g.hp) }; rows.push(row);
        if (tl.net() !== 0) bad.push('plush ' + (tl.net() > 0 ? 'lost ' : 'made ') + Math.abs(tl.net()) + ' ' + JSON.stringify(row)); if (sim().n > 3 || tagged()) bad.push('not settled ' + JSON.stringify(row));
        if (wd().cool <= 0) bad.push('no cooldown after a slide');
      }
      // the cooldown holds the next footing check back
      stand(28); wd().cool = 5; if (wd().onClimbHit(p().pos, 0)) bad.push('a slide came during the cooldown');
      if ((g.errCount || 0) > e0) bad.push('frame errors ' + (g.errLog || []).slice(-1)[0]);
      return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(rows);
    } finally { delete g.climbRisk; tl.stop(); reset({}); }
  });

  await T('wedge.audit.a-belt-a-vault-a-machine-and-a-rail-cell-on-the-slope-keep-their-floor-and-are-never-freed', async () => {
    const bad = [];
    reset({ belts: 1, vault: 1, power: 1 }); g.climbRisk = () => {}; hi(28);
    // the slope's downhill line from the player
    const sl = wd().slope(toI(p().pos.x), toK(p().pos.z)), at = (u, v = 0) => { const x = p().pos.x + sl.dx * u - sl.dz * v, z = p().pos.z + sl.dz * u + sl.dx * v, i = toI(x), k = toK(z); return { i, k, t: w().topAt(i, k) }; };
    const b = at(3), v = at(5.5), m = at(7.5, 1.2), r = at(2, 1.5);
    const railKey = (r.t * NZ + r.k) * NX + r.i; w().reserved.add(railKey);   // a Mine Rail piece, a ramp or stair volume, a pad: the world holds the cell
    const belt = g.placeEntity('belt', { i: b.i, j: b.t, k: b.k, dir: 0, rise: 0, items: [] }, { quiet: true, rebuild: false });
    const vault = g.placeEntity('vault', { i: v.i, j: v.t, k: v.k, dir: 0 }, { quiet: true, rebuild: false });
    const bin = { id: 99993, type: 'bin', x: cellX(m.i), y: cellY(m.t), z: cellZ(m.k), i: m.i, j: m.t, k: m.k }; g.machines.items.set(bin.id, { ent: bin });
    try {
      if (!belt || !vault) return 'could not place a belt and a vault: ' + !!belt + ' ' + !!vault;
      const solidBelow = (e) => w().solid(e.i, e.t - 1, e.k), tops = [b, v, m].map((e) => w().topAt(e.i, e.k));
      const a = seeded(91, () => slide(0.9, { warn: 0.2 })); if (!a) return 'no slide';
      for (let t = 0; t < 40 && wd().cur; t += 1 / 30) stepSim(1 / 30, 1 / 30);
      const freed = new Set(a.cols.map((c) => c[1] * NX + c[0]));
      for (const [name, e] of [['belt', b], ['vault', v], ['machine', m], ['reserved cell', r]]) {
        if (freed.has(e.k * NX + e.i)) bad.push(`the slide freed the column of the ${name}`);
        if (name !== 'reserved cell' && !solidBelow(e)) bad.push(`the ${name} hangs in the air after the slide`);
      }
      if (a.cols.length < 30) bad.push('the wedge was tiny: ' + a.cols.length);
      void tops;
      return bad.length === 0 || bad.join('; ');
    } finally { g.machines.items.delete(99993); w().reserved.delete(railKey); }
  });

  await T('wedge.audit.a-support-holds-the-columns-in-its-reach', async () => {
    const bad = [];
    stand(28); const sl = wd().slope(toI(p().pos.x), toK(p().pos.z));
    const x = p().pos.x + sl.dx * 5, z = p().pos.z + sl.dz * 5, i = toI(x), k = toK(z), t = w().topAt(i, k);
    w().supports.push({ x: cellX(i), y: cellY(t) + 0.6, z: cellZ(k), r: 2.7, b: 2, id: 'audit-jack', kind: 'jack', cap: 100, born: g.time });
    try {
      // the columns the jack holds (read before the slide: the surface drops as it runs)
      const held = new Set(); for (let dk = -6; dk <= 6; dk++) for (let di = -6; di <= 6; di++) { const ci = i + di, ck = k + dk, tp = w().topAt(ci, ck); if (tp > 2 && w().supportBonus(cellX(ci), cellY(tp - 1), cellZ(ck)) > 0) held.add(ck * NX + ci); }
      if (held.size < 4) return 'the jack holds only ' + held.size + ' columns (the test cannot tell)';
      const a = seeded(92, () => slide(0.9, { warn: 0.2 })); if (!a) return 'no slide';
      play(15); for (const c of a.cols) if (held.has(c[1] * NX + c[0]) && !(c[0] === toI(a.ax) && c[1] === toK(a.az))) { bad.push('a column the jack holds was freed'); break; }
      return bad.length === 0 || bad.join('; ');
    } finally { w().supports = []; }
  });

  await T('wedge.audit.a-slide-into-a-tunnel-mouth-at-the-foot-keeps-the-plush-and-buries-a-bot-inside-the-runout-not-in-the-wall', async () => {
    const bad = [], tl = tally();
    try {
      stand(28); const a0 = { x: p().pos.x, z: p().pos.z }, sl = wd().slope(toI(a0.x), toK(a0.z)), f = wd().foot(a0.x, a0.z);
      // a tunnel mouth in the pile at the foot of the slope: a 3 wide, 3 high corridor, 8 cells deep, cut into the face along the slide's line
      const ci = toI(f.x), ck = toK(f.z), base = Math.max(1, w().topAt(ci, ck)); let cut = 0;
      for (let d = 0; d < 8; d++) for (let s2 = -1; s2 <= 1; s2++) for (let h = 0; h < 3; h++) { const i = toI(f.x - sl.dx * d * C - sl.dz * s2 * C), k = toK(f.z - sl.dz * d * C + sl.dx * s2 * C); if (w().removeCell(i, base - 1 + h - (d ? 0 : 0), k, false)) cut++; }
      const b = g.crew.spawn(); b.x = f.x - sl.dx * 2; b.z = f.z - sl.dz * 2; b.y = (w().topAt(toI(b.x), toK(b.z))) * C + 0.05; b.vy = 0; b.state = 'idle';
      tl.mark(); const e0 = g.errCount || 0;
      const a = seeded(93, () => slide(0.9, { warn: 0.2 })); if (!a) return 'no slide';
      seeded(94, () => { for (let t = 0; t < 40 && wd().cur; t += 0.05) { g.time += 0.05; g.updatePlay(0.05); } }); settle();
      const r = g.crew.radius(b), bi = toI(b.x), bk = toK(b.z);
      if (!Number.isFinite(b.x + b.y + b.z)) bad.push('the bot is not finite'); if (w().solid(bi, ctx.toJ(b.y + r + 0.05), bk)) bad.push('the bot is inside a plush cell');
      if (tl.net() !== 0) bad.push('plush ' + (tl.net() > 0 ? 'lost ' : 'made ') + Math.abs(tl.net()) + ' (cut ' + cut + ')'); if (tagged() || sim().n > 3) bad.push(`not settled: ${tagged()} tagged ${sim().n} loose`);
      if ((g.errCount || 0) > e0) bad.push('frame errors ' + (g.errLog || []).slice(-1)[0]);
      return bad.length === 0 || bad.join('; ');
    } finally { for (const b of [...S().crew]) { const o = g.crew.objs.get(b.id); if (o) { g.machines.disposeObj(o); g.crew.root.remove(o); g.crew.objs.delete(b.id); } } S().crew = []; tl.stop(); }
  });

  await T('wedge.audit.a-bot-in-the-path-is-carried-by-the-ground-not-left-inside-plush-and-a-bot-below-is-buried-by-the-pile', async () => {
    const bad = [];
    try {
      stand(28); const a = seeded(95, () => slide(0.9, { warn: 0.2 })); if (!a) return 'no slide';
      const sl = { dx: a.dx, dz: a.dz }, x = a.ax + sl.dx * 3, z = a.az + sl.dz * 3, t = w().topAt(toI(x), toK(z));
      const b = g.crew.spawn(); b.x = x; b.z = z; b.y = t * C + 0.05; b.vy = 0; b.state = 'idle';
      const e0 = g.errCount || 0;
      seeded(96, () => { for (let k = 0; k < 40 / 0.05 && wd().cur; k++) { g.time += 0.05; g.updatePlay(0.05); } }); settle();
      const r = g.crew.radius(b), ci = toI(b.x), ck = toK(b.z), ground = w().topAt(ci, ck) * C;
      if (!Number.isFinite(b.x + b.y + b.z)) bad.push('the bot is not finite'); if (w().solid(ci, ctx.toJ(b.y + r + 0.05), ck)) bad.push('the bot is inside a plush cell');
      let near = 0; for (let q = -1; q <= 1; q++) for (let c = -1; c <= 1; c++) near = Math.max(near, w().topAt(ci + q, ck + c) * C);
      if (b.y > near + 0.7 || b.y < -0.5) bad.push(`the bot is at ${b.y.toFixed(1)} m with nothing under it above ${near.toFixed(1)} m (its column ${ground.toFixed(1)} m)`);
      if ((g.errCount || 0) > e0) bad.push('frame errors ' + (g.errLog || []).slice(-1)[0]);
      // a bot standing at the heart of the landed pile is counted as buried (and lifted to the surface afterwards)
      for (const x2 of [...S().crew]) { const o = g.crew.objs.get(x2.id); if (o) { g.machines.disposeObj(o); g.crew.root.remove(o); g.crew.objs.delete(x2.id); } } S().crew = [];
      const q = stand(27), P = { x: p().pos.x, y: p().pos.y, z: p().pos.z }; p().pos.set(P.x + 50, 0, P.z + 50);
      const a2 = seeded(97, () => wd().start(P, { e: 0.8, warn: 0.2, by: 'test' })); if (!a2) return bad.concat('no second slide').join('; ');
      seeded(98, () => { for (let k = 0; k < 40 / 0.05 && wd().cur; k++) { g.time += 0.05; g.updatePlay(0.05); } });
      const hd = K.heart(a2); if (!hd || hd.sum < 30) return bad.concat('no pile landed').join('; ');
      const b2 = g.crew.spawn(); b2.x = cellX(hd.i); b2.z = cellZ(hd.k); b2.y = w().topAt(hd.i, hd.k) * C + 0.05; b2.vy = 0; b2.state = 'idle';
      seeded(99, () => play(4)); const l = bu().last && bu().last.landings.find((x2) => x2.bot);
      if (!l) bad.push('the bot was not part of the landing: ' + JSON.stringify(bu().last)); else if (!(l.lvl >= 1)) bad.push('landed pile ' + l.pool + ' but the bot is not counted as buried ' + JSON.stringify(l));
      return bad.length === 0 || bad.join('; ');
    } finally { for (const b of [...S().crew]) { const o = g.crew.objs.get(b.id); if (o) { g.machines.disposeObj(o); g.crew.root.remove(o); g.crew.objs.delete(b.id); } } S().crew = []; }
  });

  await T('wedge.audit.a-save-and-a-real-load-in-the-middle-of-a-slide-keep-the-plush-and-start-clean', async () => {
    const bad = [], keep = (() => { try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; } })();
    try {
      let a = null, q = null;
      for (const [lane, dir] of [[10, 1], [14, -1], [18, 1], [12, -1]]) { q = stand(28, lane, dir, {}, [[0.65, 0.6, 1.5], [1.3, 0.55, 1.8]]); a = seeded(100, () => slide(0.8, { warn: 0.2 })); if (!a) continue; seeded(101, () => play(2.2)); if (wd().cur && a.released > 80) break; wd().clear(); play(8); a = null; }
      if (!a) return 'no slide was under way on four slopes (80 plush released after 2 s)';
      const cellsOf = () => { let n = 0; for (let i = Math.max(0, a.bbox[0] - 70); i <= Math.min(NX - 1, a.bbox[1] + 70); i++) for (let k = Math.max(0, a.bbox[2] - 70); k <= Math.min(NZ - 1, a.bbox[3] + 70); k++) { const t = w().topAt(i, k); for (let j = 0; j < t; j++) { const sp = w().get(i, j, k); if (sp && !isSpecialCell(sp)) n++; } } let b = 0; for (let m = 0; m < sim().n; m++) if (!isSpecialCell(sim().sp[m])) b++; return { cells: n, bodies: b, total: n + b }; };
      const before = cellsOf(); p().swept = 0.4; wd().rideT = 0.5; wd().roll = 0.1;
      if (!saveGame(S(), w(), sim())) return 'save failed';
      const saved = loadSaved(); if (!saved) return 'nothing saved';
      const wd0 = wd(), bu0 = bu(); g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play';
      if (g.wedge === wd0 || g.burial === bu0) bad.push('the slide state of the old game was kept');
      if (g.wedge.cur || g.wedge.cool || g.wedge.live || g.wedge.rideT || g.wedge.shieldLeft || g.wedge.guestOn) bad.push('the new game starts in the middle of a slide: ' + JSON.stringify({ cur: !!g.wedge.cur, cool: g.wedge.cool, live: g.wedge.live, rideT: g.wedge.rideT }));
      if (g.player.swept > 0) bad.push('the player starts out swept'); if (Math.abs(g.wedge.roll) > 0) bad.push('the camera starts rolled'); if (g.burial.on || g.burial.pend || g.burial.armT > 0) bad.push('the new game is already burying someone');
      let tag = 0; for (let m = 0; m < sim().n; m++) if (sim().tag[m]) tag++; if (tag) bad.push(tag + ' bodies of the old slide are still tagged');
      stepSim(40, 1 / 30);
      const after = cellsOf(); if (after.total !== before.total) bad.push(`plush ${before.total} -> ${after.total} through the save and load (${before.cells}+${before.bodies} -> ${after.cells}+${after.bodies})`);
      if (sim().n > 3) bad.push(sim().n + ' bodies still loose after the load and 40 s');
      if (!Number.isFinite(g.shake)) bad.push('g.shake is ' + g.shake);
      return bad.length === 0 || bad.join('; ');
    } finally { try { if (keep === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, keep); } catch (e) { /* ignore */ } }
  });

  await T('wedge.audit.the-friend-leaving-or-the-host-leaving-in-the-middle-of-a-slide-ends-clean', async () => {
    const bad = [];
    const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
    const fake = (x, y, z) => ({ pos: new V3(x, y, z), vel: new V3(), name: 'Friend', lampOn: true, spheres() { return [0.3, 0.8, 1.3].map((o) => ({ x: this.pos.x, y: this.pos.y + o, z: this.pos.z, r: 0.3, vel: this.vel, remote: true })); }, update() {}, set() {}, dispose() {} });
    // the host loses its guest in the middle of a slide that carried them
    stand(27); role('host'); const sent = []; g.netSend = (m) => { sent.push(m); }; g.remote = fake(p().pos.x + 3, p().pos.y - 3, p().pos.z);
    const a = seeded(102, () => slide(0.7, { warn: 0.2 })); if (!a) return 'no slide'; const e0 = g.errCount || 0, base = plush(toI(a.x), toK(a.z), 170);
    seeded(103, () => play(1.5)); g.remote = null; role(null); delete g.netSend; sent.length = 0;
    seeded(104, () => play(30, () => !!wd().cur)); settle(); for (let n = 0; n < 60 && bu().pend; n++) play(0.1);
    if (wd().cur) bad.push('the slide did not end after the friend left'); if (sent.length) bad.push('messages still went out after the friend left'); if (tagged() || sim().n > 3) bad.push('not settled after the friend left');
    if ((g.errCount || 0) > e0) bad.push('frame errors ' + (g.errLog || []).slice(-1)[0]);
    { const now = plush(toI(a.x), toK(a.z), 170); if (now.total !== base.total) bad.push(`plush ${base.total} -> ${now.total} after the friend left`); }
    // the guest loses its host: it stops believing in a slide
    reset({}); stand(27); role('guest'); g.mode = 'play'; g.netMessage(JSON.parse(JSON.stringify({ t: 'avwarn', x: p().pos.x, y: p().pos.y, z: p().pos.z, dx: 1, dz: 0, a: 27, l: 12, n: 300, sd: 5, s: 0.5 })));
    if (!(wd().guestOn > 0)) bad.push('the guest does not believe the host\'s slide runs'); g.netClosed(); role(null);
    if (wd().guestOn !== 0 || wd().ask !== 0 || wd().gw) bad.push('the guest still believes in a slide after the host left: ' + JSON.stringify({ on: wd().guestOn, ask: wd().ask }));
    return bad.length === 0 || bad.join('; ');
  });

  await T('wedge.audit.the-cascade-costs-little-and-forged-sizes-cannot-make-it-big', async () => {
    const bad = [];
    // a whole slide's growth work per tick stays small (the plan costs nothing: it is parameters)
    const q = stand(30); { const w0 = slide(0.95, { warn: 0.2 }); if (!w0) return 'no slide'; wd().clear(); bu().clear(); }   // (one to warm the code up)
    const t0 = performance.now(); const a = seeded(105, () => slide(0.95, { warn: 0.2 })); const startMs = performance.now() - t0; if (!a) return 'no slide';
    if (startMs > 25) bad.push('starting a slide took ' + startMs.toFixed(1) + ' ms (it plans nothing)');
    seeded(106, () => play(30, () => !!wd().cur)); const l = wd().last; if (!l) return bad.concat('no end').join('; ');
    if (l.perf.avg > 2 || l.perf.max > 12) bad.push(`the wedge tick costs avg ${l.perf.avg.toFixed(2)} max ${l.perf.max.toFixed(1)} ms`);
    if (l.peakLive > WEDGE.BODY_CAP) bad.push('bodies over the cap: ' + l.peakLive);
    // forged numbers do not make a bigger slide: the size comes from the host's own view (height, slope, gear) and the load is clamped
    const at = (carry) => wd().size({ x: 0, y: 20, z: 0 }, carry, 1, () => 0.5);
    if (at(1e9).E0 > at(g.T.carry || 1).E0 + 1e-6) bad.push('a huge carry in a request made a bigger slide');
    return bad.length === 0 || bad.join('; ');
  });
}
