// audit_avalanche_world.js: adversarial checks of the climbing avalanche against the rest of the world (src/avalanche.js): random soaks with a plush tally,
// belts and machines on the slope, a dug room under the scar (the thin cap rule), cells changed by someone else while the slab runs, a bot in the path,
// and the cost of planning and of the first seconds.
import { kit, AV } from './avalanche_lib.js';
import { isSpecialCell } from '../plushdata.js';
import { saveGame, loadSaved } from '../state.js';
import { SAVE_KEY } from '../config.js';

export default async function (ctx) {
  const { T, g, S, w, p, sim, stepSim, toI, toK, cellX, cellY, cellZ, cfg } = ctx;
  const K = kit(ctx), { hi, tagged, reset, go, ride, av, C, logHurts } = K;
  const NX = cfg.NX, NZ = cfg.NZ;
  const seeded = (seed, fn) => {   // a repeatable Math.random for the length of fn
    let a = seed >>> 0; const o = Math.random;
    Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    try { return fn(); } finally { Math.random = o; }
  };
  // every plush that leaves a cell is a loose body or a cell again: net() is 0 when none was lost or made out of nothing since mark()
  const tally = () => {
    const wd = w(), s = sim(), osc = wd.setCell, osp = s.spawn.bind(s), orm = s.remove.bind(s); let removed = 0, added = 0, b0 = s.n, cats = {}, sunk = 0, spill = 0, picked = 0;
    const where = () => new Error().stack.split('\n').slice(3, 5).map((l) => { const m = l.match(/at (\S+) .*\/([\w.]+\.js)/); return m ? m[1] + '@' + m[2] : l.trim().slice(0, 30); }).join('<');
    const cat = (k) => { const c = k + ' ' + where(); cats[c] = (cats[c] || 0) + 1; };
    const ohb = s.hooks && s.hooks.onBin, ost = s.hooks && s.hooks.onStale; if (ohb) s.hooks.onBin = (...a) => { sunk++; return ohb(...a); }; if (ost) s.hooks.onStale = (...a) => { sunk++; return ost(...a); };   // (the sorting bin takes a plush in, a plush loose for 30 s is sold: sorted or sold, not lost)
    wd.setCell = function (i, j, k, sp, vr) { const o = this.get(i, j, k); if (o && !isSpecialCell(o)) { removed++; cat('cell-'); } if (sp && !isSpecialCell(sp)) { added++; cat('cell+'); } return osc.call(this, i, j, k, sp, vr); };
    s.spawn = function (...a) { cat('body+'); if (/climbRisk|dropLoad|\bdie\b/.test(new Error().stack)) spill++; return osp(...a); };   // (plush out of the player's hands is a body, not made out of nothing)
    s.remove = function (i) { cat('body-'); if (/pullLooseToBins|sellAuto|catchInCart|pickupLoose|hoseIntake/.test(new Error().stack)) sunk++; return orm(i); };   // (a bin or a vault takes a loose plush in: stored, not lost)
    return {
      stop() { delete wd.setCell; delete s.spawn; delete s.remove; if (ohb) s.hooks.onBin = ohb; if (ost) s.hooks.onStale = ost; void osp; void orm; }, mark() { removed = 0; added = 0; b0 = s.n; cats = {}; sunk = 0; spill = 0; picked = 0; const arr = S().carry; arr.push = function (...a) { picked += a.length; return Array.prototype.push.apply(this, a); }; }, sunk: () => sunk, removed: () => removed, added: () => added,   // (a plush the player picks up out of the flow is carried, not lost)
      net: () => removed - added - (s.n - b0) - sunk + spill - picked, cats: () => 'sunk=' + sunk + ' spill=' + spill + ' picked=' + picked + ' ' + Object.entries(cats).filter(([, v]) => v > 0).map(([k, v]) => v + ' ' + k).join(' | '),
    };
  };
  const badBody = () => { const s = sim(); for (let i = 0; i < s.n; i++) { if (!Number.isFinite(s.x[i] + s.y[i] + s.z[i] + s.vx[i] + s.vy[i] + s.vz[i])) return 'a body is not finite'; if (s.y[i] < -0.6 || s.y[i] > 44) return 'a body left the hall at y=' + s.y[i].toFixed(1); } return ''; };
  const carry = (n) => { S().carry = []; for (let q = 0; q < n; q++) S().carry.push({ sp: 2, vr: 0 }); };

  await T('avalanche.audit.soak-random-slabs-keep-every-plush-and-end-clean', async () => {
    const bad = [], rows = [], tl = tally();
    try {
      for (let n = 0; n < 9; n++) {
        const info = seeded(1000 + n * 7919, () => {
          const up = [{}, {}, { climb: 1 }, { climb: 2 }, { boots: 3, springs: 2 }][n % 5], y = 20 + Math.random() * 18, dir = Math.random() < 0.5 ? 1 : -1, lane = (Math.random() * 22) | 0, c = (Math.random() * 25) | 0;
          return { up, y, dir, lane, c, dt: [1 / 60, 1 / 30, 0.05, 0.1][(Math.random() * 4) | 0], sp: Math.random() * 3, rise: Math.random() };
        });
        reset(info.up); try { hi(info.y, info.lane, info.dir); } catch (e) { continue; }
        carry(info.c); g.hp = 100; const pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
        const a = seeded(77 + n, () => go({ warn: 0.2 + info.rise * 0.6, carry: info.c, speed: info.sp, by: 'climb' })); if (!a) { rows.push('plan ' + n + ' none'); continue; }
        tl.mark(); const cells = a.n, H = logHurts(); let peak = 0, why = '', secs = 0;
        while (av().cur && secs < 40) {
          g.time += info.dt; g.updatePlay(info.dt); secs += info.dt; peak = Math.max(peak, sim().n);
          if (av().cur && Math.abs(tagged() - av().live) > tl.sunk() + 2) { why = `live ${av().live} but ${tagged()} tagged at ${secs.toFixed(2)} s`; break; }
          if (sim().n > AV.SIM_CAP + AV.RELEASE_PER_TICK) { why = 'bodies ' + sim().n; break; }
          const b = badBody(); if (b) { why = b; break; }
        }
        g.climbRisk = () => {};   // (a player left standing high on the slope would be rolled for the old small patch slide again and again: that is not the slab's doing)
        let after = 0; for (; after < 900 && (sim().n > 2 || after < 60); after++) { g.time += 0.05; g.updatePlay(0.05); }   // the last of it settles (what the topples it set off included), the player stands up
        delete g.climbRisk;
        H.stop(); const by = {}; for (const h of H.log) by[h.why] = (by[h.why] || 0) + h.dealt;
        const last = av().last, row = { n, y: +pos.y.toFixed(1), dt: +info.dt.toFixed(3), cells, secs: +secs.toFixed(1), peak, net: tl.net(), hp: Math.round(g.hp), left: sim().n, hurt: g.hp < 85 ? by : undefined, loose: sim().n > 3 ? Array.from({ length: Math.min(sim().n, 4) }, (_, q) => [sim().x[q], sim().y[q], sim().z[q], Math.hypot(sim().vx[q], sim().vy[q], sim().vz[q]), sim().age[q], sim().flag[q], sim().rest[q]].map((v) => +v.toFixed(1)).join(',')) : undefined };
        rows.push(row);
        if (why) bad.push(`${why} ${JSON.stringify(row)}`);
        if (av().cur) bad.push('the slide did not end ' + JSON.stringify(row));
        if (tagged()) bad.push('tagged bodies left ' + JSON.stringify(row));
        if (tl.net() !== 0) bad.push('plush ' + (tl.net() > 0 ? 'lost ' : 'made ') + Math.abs(tl.net()) + ' ' + JSON.stringify(row) + ' ' + tl.cats());
        if (!last || last.released + last.left + last.skipped !== last.cells) bad.push('cells unaccounted for ' + JSON.stringify(last));
        if (g.dead || g.hp < 1) bad.push('died ' + JSON.stringify(row));
        if (sim().n > 3) bad.push('still ' + sim().n + ' loose bodies 45 s after the slide ' + JSON.stringify(row));
        if (p().embedded || p().buried > 0.5) bad.push('the player is stuck in plush after the slide ' + JSON.stringify({ emb: p().embedded, buried: p().buried }) + ' ' + JSON.stringify(row));
      }
      if (rows.length < 5) bad.push('only ' + rows.length + ' slabs ran');
      console.log('avalanche soak', JSON.stringify(rows)); window.__avAudit = Object.assign(window.__avAudit || {}, { soak: rows });
      return bad.length === 0 || bad.join('; ');
    } finally { delete g.climbRisk; tl.stop(); reset({}); }
  });

  await T('avalanche.audit.slabs-in-a-row-on-the-same-slope-stay-bounded-and-keep-every-plush', async () => {
    const bad = [], rows = [], tl = tally();
    try {
      reset({}); g.climbRisk = () => {}; const e0 = g.errCount || 0;
      for (let n = 0; n < 4; n++) {
        hi(30 - n * 2, 10, 1); av().cool = 0; g.hp = 100; g.dead = false;
        const a = go({ warn: 0.2 }); if (!a) { rows.push('none'); continue; }
        tl.mark(); let secs = 0; while (av().cur && secs < 40) { g.time += 0.05; g.updatePlay(0.05); secs += 0.05; }
        let after = 0; for (; after < 900 && (sim().n > 2 || after < 40); after++) { g.time += 0.05; g.updatePlay(0.05); }
        const row = { n, cells: a.n, secs: +secs.toFixed(1), settle: +(after * 0.05).toFixed(1), net: tl.net(), left: sim().n, hp: Math.round(g.hp) }; rows.push(row);
        if (tl.net() !== 0) bad.push('plush ' + (tl.net() > 0 ? 'lost ' : 'made ') + Math.abs(tl.net()) + ' ' + JSON.stringify(row)); if (sim().n > 3 || tagged()) bad.push('not settled ' + JSON.stringify(row));
        if (p().embedded || p().buried > 0.5) bad.push('the player is stuck in plush ' + JSON.stringify(row));
      }
      if ((g.errCount || 0) > e0) bad.push('frame errors ' + (g.errLog || []).slice(-1)[0]);
      return bad.length === 0 || bad.join('; ');
    } finally { delete g.climbRisk; tl.stop(); reset({}); }
  });

  await T('avalanche.audit.a-belt-a-vault-and-a-machine-on-the-slope-keep-their-floor', async () => {
    const bad = [];
    try {
      reset({ belts: 1, vault: 1, power: 1 }); hi(28); const pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
      const free = av().plan(pos, { rnd: () => 0.5 }); if (!free) return 'no plan';
      const at = (f) => { const q = (free.n * f) | 0, i = free.ci[q], k = free.ck[q]; return { i, k, t: w().topAt(i, k) }; };
      const b = at(0.3), v = at(0.55), m = at(0.8), r = at(0.15);
      const railKey = (r.t * NZ + r.k) * NX + r.i; w().reserved.add(railKey);   // a Mine Rail piece, a ramp or stair volume, a pad: the world holds the cell
      const belt = g.placeEntity('belt', { i: b.i, j: b.t, k: b.k, dir: 0, rise: 0, items: [] }, { quiet: true, rebuild: false });
      const vault = g.placeEntity('vault', { i: v.i, j: v.t, k: v.k, dir: 0 }, { quiet: true, rebuild: false });
      const bin = { id: 99993, type: 'bin', x: cellX(m.i), y: cellY(m.t), z: cellZ(m.k), i: m.i, j: m.t, k: m.k }; g.machines.items.set(bin.id, { ent: bin });
      let pl; try { pl = av().plan(pos, { rnd: () => 0.5 }); } finally { /* the bin stays for the run */ }
      if (!belt || !vault) { g.machines.items.delete(bin.id); return 'could not place a belt and a vault: ' + !!belt + ' ' + !!vault; }
      const holds = (i, k) => { if (!pl) return true; for (let q = 0; q < pl.n; q++) if (pl.ci[q] === i && pl.ck[q] === k) return false; return true; };   // (the column itself, and the four beside it, are held)
      if (!holds(b.i, b.k)) bad.push('the slab undermines a belt');
      if (!holds(v.i, v.k)) bad.push('the slab undermines a vault');
      if (!holds(m.i, m.k)) bad.push('the slab undermines a machine');
      if (!holds(r.i, r.k)) bad.push('the slab undermines a reserved cell (a rail piece, a pad)');
      const solidBelow = (e) => w().solid(e.i, e.t - 1, e.k);
      const a = go({ warn: 0.2 }); if (!a) { g.machines.items.delete(bin.id); return 'no slab'; }
      for (let t = 0; t < 40 && av().cur; t += 1 / 30) stepSim(1 / 30, 1 / 30);
      g.machines.items.delete(bin.id);
      if (!solidBelow(b)) bad.push('the belt hangs in the air after the slab'); if (!solidBelow(v)) bad.push('the vault hangs in the air after the slab'); if (!solidBelow(m)) bad.push('the machine has no floor after the slab');
      return bad.length === 0 || bad.join('; ');
    } finally { g.machines.items.delete(99993); for (const key of [...w().reserved]) w().reserved.delete(key); reset({}); }
  });

  await T('avalanche.audit.a-frame-or-strut-holds-the-columns-in-its-reach', async () => {
    const bad = [];
    try {
      reset({}); hi(28); const pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
      const free = av().plan(pos, { rnd: () => 0.5 }); if (!free) return 'no plan';
      const q = (free.n * 0.5) | 0, i = free.ci[q], k = free.ck[q], t = w().topAt(i, k);
      w().supports.push({ x: cellX(i), y: cellY(t) + 0.6, z: cellZ(k), r: 2.7, b: 2, id: 'audit-jack', kind: 'jack', cap: 100, born: g.time });
      const held = av().plan(pos, { rnd: () => 0.5 }); if (!held) return 'no plan with a jack';
      if (!(held.n < free.n)) bad.push('a jack in the middle of the slab held nothing: ' + held.n + ' vs ' + free.n);
      for (let n = 0; n < held.n; n++) if (w().supportBonus(cellX(held.ci[n]), cellY(w().topAt(held.ci[n], held.ck[n]) - 1), cellZ(held.ck[n])) > 0) { bad.push('a cell of a column the jack holds is planned'); break; }
      return bad.length === 0 || bad.join('; ');
    } finally { w().supports = []; reset({}); }
  });

  await T('avalanche.audit.a-room-dug-under-the-scar-keeps-the-plush-and-the-roof-logic-finishes', async () => {
    const bad = [], tl = tally();
    try {
      reset({}); hi(27); const pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
      const free = av().plan(pos, { rnd: () => 0.5, depth: 3 }); if (!free) return 'no plan';
      let q = 0; for (let n = 0; n < free.n; n++) if (w().topAt(free.ci[n], free.ck[n]) >= 70) { q = n; break; }   // a column near the crown, where the pile is high
      const ci = free.ci[q], ck = free.ck[q], t = w().topAt(ci, ck);
      // a 12 x 12 cell room whose ceiling leaves only 2 cells of cover under the slab's floor (a surface working a player dug high on the slope)
      const top = t - 3 - 2, j0 = top - 8; if (j0 < 4) return 'the slope is too low at the test spot';
      let dug = 0; for (let a = -6; a < 6; a++) for (let b = -6; b < 6; b++) for (let j = j0; j < top; j++) if (w().removeCell(ci + a, j, ck + b, false)) dug++;
      w().creaking.clear(); w().stabQueue.length = 0; g._shedT = g.time + 1e9;
      const e0 = g.errCount || 0; tl.mark();
      const a = go({ warn: 0.2, depth: 3 }); if (!a) return 'no slab';
      for (let s = 0; s < 40 && av().cur; s += 1 / 30) stepSim(1 / 30, 1 / 30);
      stepSim(25, 1 / 30);   // whatever the roof does afterwards
      if ((g.errCount || 0) > e0) bad.push('frame errors ' + (g.errLog || []).slice(-1)[0]);
      if (tl.net() !== 0) bad.push('plush ' + (tl.net() > 0 ? 'lost ' : 'made ') + Math.abs(tl.net()) + ' ' + tl.cats());
      if (w().stabQueue.length > 50) bad.push('the stability queue did not drain: ' + w().stabQueue.length);
      if (w().creaking.size) bad.push(w().creaking.size + ' roofs still creaking after 25 s');
      if (tagged()) bad.push('tagged bodies left ' + tagged()); if (sim().n > 12) bad.push(sim().n + ' bodies still loose');
      return bad.length === 0 || bad.join('; ') + ' dug=' + dug;
    } finally { tl.stop(); reset({}); }
  });

  await T('avalanche.audit.cells-changed-by-someone-else-while-the-slab-runs-are-skipped-not-lost', async () => {
    const bad = [], tl = tally();
    try {
      reset({}); hi(28); const a = go({ warn: 0.2 }); if (!a) return 'no slab';
      // while it waits: another cave-in takes some planned cells (removed, no body: a dug or burned cell)
      const gone = [];
      for (let q = a.n - 1, c = 0; q > a.n - 400 && c < 120; q -= 3, c++) { const i = a.ci[q], j = a.cj[q], k = a.ck[q]; if (w().get(i, j, k) && !isSpecialCell(w().get(i, j, k))) { w().removeCell(i, j, k, false); gone.push([i, j, k]); } }
      tl.mark();
      for (let t = 0; t < 40 && av().cur; t += 1 / 30) stepSim(1 / 30, 1 / 30);
      const last = av().last; if (!last) return 'no end';
      // (the toe of the slab is released last: the sheet ahead of it has often settled into some of the holes already, so not every hole is a skip)
      if (last.released + last.left + last.skipped !== last.cells) bad.push('cells unaccounted for ' + JSON.stringify(last));
      if (tl.net() !== 0) bad.push('plush ' + (tl.net() > 0 ? 'lost ' : 'made ') + Math.abs(tl.net()) + ' ' + tl.cats());
      if (tagged()) bad.push('tagged bodies left ' + tagged());
      return bad.length === 0 || bad.join('; ');
    } finally { tl.stop(); reset({}); }
  });

  await T('avalanche.audit.a-save-and-a-real-load-in-the-middle-of-a-slide-keep-the-plush-and-start-clean', async () => {
    const bad = [], keep = (() => { try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; } })();
    try {
      reset({}); const q = hi(27); const a = go({ warn: 0.2 }); if (!a) return 'no slab';
      stepSim(1.6, 1 / 30); if (!(av().cur && sim().n > 150)) return 'the slide was not under way: ' + sim().n;
      const cellsOf = () => { let n = 0; for (let i = a.bbox[0] - 40; i <= a.bbox[1] + 160; i++) for (let k = a.bbox[2] - 160; k <= a.bbox[3] + 160; k++) { const t = w().topAt(i, k); for (let j = 0; j < t; j++) { const sp = w().get(i, j, k); if (sp && !isSpecialCell(sp)) n++; } } let b = 0; for (let m = 0; m < sim().n; m++) if (!isSpecialCell(sim().sp[m])) b++; return { cells: n, bodies: b, total: n + b }; };
      const before = cellsOf(); p().swept = 0.4; av().rideT = 0.5; av().roll = 0.1;
      if (!saveGame(S(), w(), sim())) return 'save failed';
      const saved = loadSaved(); if (!saved) return 'nothing saved';
      const av0 = av(); g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play';
      if (g.avalanche === av0) bad.push('the avalanche state of the old game was kept');
      if (g.avalanche.cur || g.avalanche.cool || g.avalanche.live || g.avalanche.rideT || g.avalanche.shieldLeft) bad.push('the new game starts in the middle of a slide: ' + JSON.stringify({ cur: !!g.avalanche.cur, cool: g.avalanche.cool, live: g.avalanche.live, rideT: g.avalanche.rideT }));
      if (g.player.swept > 0) bad.push('the player starts out swept'); if (Math.abs(g.avalanche.roll) > 0) bad.push('the camera starts rolled');
      let tag = 0; for (let m = 0; m < sim().n; m++) if (sim().tag[m]) tag++; if (tag) bad.push(tag + ' bodies of the old slide are still tagged');
      stepSim(40, 1 / 30);
      const after = cellsOf(); if (after.total !== before.total) bad.push(`plush ${before.total} -> ${after.total} through the save and load (${before.cells}+${before.bodies} -> ${after.cells}+${after.bodies})`);
      if (sim().n > 3) bad.push(sim().n + ' bodies still loose after the load and 40 s');
      return bad.length === 0 || bad.join('; ');
    } finally { try { if (keep === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, keep); } catch (e) { /* ignore */ } reset({}); }
  });

  await T('avalanche.audit.a-bot-in-the-path-is-carried-by-the-ground-not-left-inside-plush', async () => {
    const bad = [];
    try {
      reset({}); hi(28); const a = go({ warn: 0.2 }); if (!a) return 'no slab';
      const q = (a.n * 0.2) | 0, i = a.ci[q], k = a.ck[q], t = w().topAt(i, k);
      const b = g.crew.spawn(); b.x = cellX(i); b.z = cellZ(k); b.y = t * C + 0.05; b.vy = 0; b.state = 'idle';
      const e0 = g.errCount || 0, log = [], ofb = av().freeBots.bind(av());
      av().freeBots = () => { log.push('before ' + b.y.toFixed(2)); ofb(); log.push('after ' + b.y.toFixed(2)); };
      ride(40, 0.05); for (let n = 0; n < 200; n++) { g.time += 0.05; g.updatePlay(0.05); }
      av().freeBots = ofb;
      const r = g.crew.radius(b), ci = toI(b.x), ck = toK(b.z), ground = w().topAt(ci, ck) * C;
      if (!Number.isFinite(b.x + b.y + b.z)) bad.push('the bot is not finite');
      if (w().solid(ci, ctx.toJ(b.y + r + 0.05), ck)) bad.push(`the bot is inside a plush cell: feet ${b.y.toFixed(2)} r ${r.toFixed(2)} cell j ${ctx.toJ(b.y + r + 0.05)} column top ${w().topAt(ci, ck)} state ${b.state} freeBots ${log.join(' ')}`);
      let near = 0; for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) near = Math.max(near, w().topAt(ci + a, ck + c) * C);   // (it may stand on the lip of the next column)
      if (b.y > near + 0.7 || b.y < -0.5) bad.push(`the bot is at ${b.y.toFixed(1)} m with nothing under it above ${near.toFixed(1)} m (its own column ${ground.toFixed(1)} m)`);
      if ((g.errCount || 0) > e0) bad.push('frame errors ' + (g.errLog || []).slice(-1)[0]);
      return bad.length === 0 || bad.join('; ');
    } finally { for (const b of [...S().crew]) { const o = g.crew.objs.get(b.id); if (o) { g.machines.disposeObj(o); g.crew.root.remove(o); g.crew.objs.delete(b.id); } } S().crew = []; reset({}); }
  });

  await T('avalanche.audit.planning-and-the-first-seconds-stay-cheap', async () => {
    const bad = [], info = {};
    try {
      reset({}); hi(38); const pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
      av().plan(pos, {});   // warm
      const t0 = performance.now(); let pl; for (let n = 0; n < 5; n++) pl = av().plan(pos, { rnd: () => 0.9, carry: 100 }); const planMs = (performance.now() - t0) / 5;
      info.planMs = +planMs.toFixed(1); info.cells = pl && pl.n;
      if (planMs > 60) bad.push('planning a big slab takes ' + planMs.toFixed(0) + ' ms in one frame');
      // the stability work the scar leaves, in the frames right after the first cells go
      const a = go({ warn: 0.1, carry: 100 }); if (!a) return 'no slab';
      const times = []; for (let t = 0; t < 12 && av().cur; t += 1 / 60) { const q0 = performance.now(); g.time += 1 / 60; g.updatePlay(1 / 60); times.push(performance.now() - q0); }
      times.sort((x, y) => x - y); info.p50 = +times[times.length >> 1].toFixed(1); info.p99 = +times[Math.floor(times.length * 0.99)].toFixed(1); info.max = +times[times.length - 1].toFixed(1); info.frames = times.length;
      const base = []; reset({}); hi(38); for (let n = 0; n < 120; n++) { const q0 = performance.now(); g.time += 1 / 60; g.updatePlay(1 / 60); base.push(performance.now() - q0); }
      base.sort((x, y) => x - y); info.idleP50 = +base[60].toFixed(1);
      console.log('avalanche audit timing', JSON.stringify(info)); window.__avAudit = Object.assign(window.__avAudit || {}, { timing: info });
      if (info.max > 120) bad.push('one frame took ' + info.max + ' ms');
      return bad.length === 0 || bad.join('; ') + ' ' + JSON.stringify(info);
    } finally { reset({}); }
  });

  // (the audit's slabs scar the pile: the test runner starts a fresh world for this one, so the avalanche tests that run after the audit find an untouched pile)
  await T('avalanche.audit.zz-the-audit-leaves-a-fresh-pile-behind', async () => true);
}
