// wedge.dodge.*: a player who is not in the slide is never buried (src/wedge.js a.rider / a.carried, src/burial.js landOn / afterLoad). Whoever stepped off the wedge in the
// warning, got clear of the flow while it ran, or loaded a save made in the middle of a slide stays free; whoever waits in the runout is still buried.
import { wk, BU } from './wedge_lib.js';
import { saveGame, loadSaved } from '../state.js';
import { SAVE_KEY } from '../config.js';

export default async function (ctx) {
  const { T: T0, g, S, w, p, fresh } = ctx;
  const K = wk(ctx), { stand, seeded, play, slide, ride, wd, bu, reset, heart, C, toI, toK, cellX, cellZ } = K;
  const T = async (name, fn) => T0(name, async () => { try { return await fn(); } finally { delete g.climbRisk; reset({}); } });
  const hintText = () => (document.getElementById('hint') || {}).innerHTML || '';
  const SPOTS = [[22, 10, 1], [26, 14, -1], [30, 12, 1], [24, 18, 1], [28, 8, -1]];
  const TWO = [[0.65, 0.6, 1.5], [1.3, 0.55, 1.7], [2.5, 0.5, 1.7]];
  const E = { small: 0.1, medium: 0.5, big: 0.9 };
  // the player on the ground `cells` cells to the side of the slide's own spot (across the downhill line), at rest
  const sideStep = (a, cells) => {
    const x = a.ax - a.dz * cells * C, z = a.az + a.dx * cells * C, t = w().topAt(toI(x), toK(z));
    p().pos.set(x, t * C, z); p().vel.set(0, 0, 0); p().swept = 0; p().onGround = true; p().footCell = { i: toI(x), j: t - 1, k: toK(z) };
    base = bu().cover(p().pos).lvl;   // (a pit in the ground may hold the legs by itself: that is not the slide)
  };
  let base = 0;
  // nothing of the pile was set round the player: the four sides and the cap, and what the landing says
  const free = (land) => {
    const cv = bu().cover(p().pos), bad = [];
    if (bu().lvl > Math.max(1, base) || cv.lvl > Math.max(1, base)) bad.push(`lvl ${bu().lvl} cells ${cv.lvl}`);
    if (land && (land.placed > 0 || land.lvl > Math.max(1, base))) bad.push('landing ' + JSON.stringify(land));
    if (/Buried/i.test(hintText())) bad.push('the buried hint was shown');
    if (p().buried > 0.8) bad.push('p.buried ' + p().buried);
    return bad;
  };

  await T('wedge.dodge.stepping-off-the-wedge-in-the-warning-and-staying-clear-is-never-buried-for-every-size', async () => {
    const bad = []; let ran = 0;
    for (const cls of ['small', 'medium', 'big']) for (let n = 0; n < 5; n++) {
      const [y, lane, dir] = SPOTS[n]; stand(y, lane, dir, {}, TWO);
      const a = seeded(1300 + n * 29 + (cls === 'big' ? 5 : cls === 'medium' ? 2 : 0), () => slide(E[cls] + (n % 3) * 0.02, { warn: 0.5 }));
      if (!a) continue; ran++;
      if (!a.rider) { bad.push(`${cls} ${n}: the player on the wedge is not a rider at the start`); wd().clear(); continue; }
      sideStep(a, 16);   // (walks or jumps off during the creak)
      document.getElementById('hint') && (document.getElementById('hint').innerHTML = '');
      const r = seeded(1400 + n, () => ride());
      if (!r.last) { bad.push(`${cls} ${n}: no landing`); continue; }
      if (a.rider || a.carried) bad.push(`${cls} ${n}: rider ${a.rider} carried ${a.carried} for a player who stayed clear`);
      const f = free(r.land); if (f.length) bad.push(`${cls} ${n}: ${f.join('; ')}`);
    }
    if (ran < 8) bad.push('only ' + ran + ' of 15 slides ran');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('wedge.dodge.leaving-the-flow-after-it-began-to-grow-is-not-buried', async () => {
    const bad = []; let ran = 0;
    for (const [cls, n] of [['small', 0], ['medium', 1], ['big', 2], ['medium', 3], ['big', 4]]) {
      const [y, lane, dir] = SPOTS[n]; stand(y, lane, dir, {}, TWO);
      const a = seeded(1500 + n * 31, () => slide(E[cls], { warn: 0.25 })); if (!a) continue;
      let t = 0; seeded(1501 + n, () => { while (wd().cur && a.state === 'warn' && t < 3) { g.time += 1 / 60; g.updatePlay(1 / 60); t += 1 / 60; } });
      seeded(1502 + n, () => play(0.7));   // growth has begun: the flow has taken the player a little
      if (!wd().cur) continue; ran++;
      sideStep(a, 12);   // out of the flow, sideways
      const r = seeded(1503 + n, () => { document.getElementById('hint') && (document.getElementById('hint').innerHTML = ''); return ride(); });
      if (!r.last) { bad.push(`${cls} ${n}: no landing`); continue; }
      const f = free(r.land); if (f.length) bad.push(`${cls} ${n} (carried ${a.carried}): ${f.join('; ')}`);
    }
    if (ran < 3) bad.push('only ' + ran + ' of 5 slides were still running');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('wedge.dodge.a-player-waiting-at-the-bottom-in-the-runout-is-still-buried', async () => {
    const bad = []; let buried = 0, ran = 0;
    for (const n of [0, 1, 2]) {
      const [y, lane, dir] = SPOTS[n]; stand(y, lane, dir, {}, TWO); const P = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
      p().pos.set(P.x + 50, 0, P.z + 50);   // (somewhere else while it runs)
      const a = seeded(1600 + n, () => wd().start(P, { e: 0.8, warn: 0.2, by: 'test' })); if (!a) continue; ran++;
      seeded(1601 + n, () => { let t = 0; while (wd().cur && t < 25) { g.time += 1 / 60; g.updatePlay(1 / 60); t += 1 / 60; } });
      const hd = heart(a); if (!hd || hd.sum < 30) { bad.push(`${n}: no pile landed`); continue; }
      p().pos.set(cellX(hd.i), w().topAt(hd.i, hd.k) * C, cellZ(hd.k)); p().vel.set(0, 0, 0); p().onGround = true;
      seeded(1602 + n, () => play(4));
      const l = bu().last && bu().last.landings.find((x) => x.who === 'player');
      if (!l) { bad.push(`${n}: the player was not part of the landing`); continue; }
      if (l.rode) bad.push(`${n}: a player who never rode counted as a rider`);
      if (l.lvl >= 1 && bu().cover(p().pos).lvl >= 1) buried++;
    }
    if (ran < 2) bad.push('only ' + ran + ' slides ran');
    if (buried < Math.max(1, ran - 1)) bad.push(`only ${buried} of ${ran} waiting players were buried`);
    return bad.length === 0 || bad.join(' | ');
  });

  await T('wedge.dodge.loading-a-save-made-in-the-middle-of-a-slide-leaves-the-player-unburied', async () => {
    const bad = [], keep = (() => { try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; } })();
    try {
      let a = null;
      for (const [lane, dir] of [[10, 1], [14, -1], [18, 1], [12, -1]]) {
        stand(28, lane, dir, {}, [[0.65, 0.6, 1.5], [1.3, 0.55, 1.8]]); a = seeded(100, () => slide(0.8, { warn: 0.2 })); if (!a) continue;
        seeded(101, () => play(2.2)); if (wd().cur && a.released > 80) break; wd().clear(); play(8); a = null;
      }
      if (!a) return 'no slide was under way';
      // the player is in the middle of the flow when the game is saved (as far down as the plush has come)
      if (!saveGame(S(), w(), ctx.sim())) return 'save failed';
      const saved = loadSaved(); if (!saved) return 'nothing saved';
      g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play';
      document.getElementById('hint') && (document.getElementById('hint').innerHTML = '');
      const b0 = g.S.stats.buried || 0; play(2);
      const f = free(null); if (f.length) bad.push(f.join('; ')); if (g.player.embedded) bad.push('the player loads embedded in plush');
      if (g.burial.on || g.burial.pend || g.burial.armT > 0) bad.push('the new game is already burying someone');
      if ((g.S.stats.buried || 0) !== b0) bad.push('a burial was counted after the load');
      // a save with the player inside plush (a burial pocket) loads them on top of it
      const q = g.player.pos, i = toI(q.x), k = toK(q.z), t = w().topAt(i, k);
      for (let j = t; j < t + 3; j++) w().setCell(i, j, k, 2, 0); g.player.pos.set(q.x, t * C + 0.1, q.z);
      g.burial.afterLoad(); const cv = g.burial.cover(g.player.pos);
      if (w().solid(i, ctx.toJ(g.player.pos.y + 0.05), k) || w().solid(i, ctx.toJ(g.player.pos.y + 0.05) + 1, k) || cv.lvl > 0) bad.push('a player saved inside plush is still inside it after the load: y ' + g.player.pos.y.toFixed(2));
      return bad.length === 0 || bad.join(' | ');
    } finally { try { if (keep === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, keep); } catch (e) { /* ignore */ } fresh({}); }
  });
}
