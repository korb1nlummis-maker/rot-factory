// avalanche.rider.*, avalanche.save.*, avalanche.ach.*: the climber is swept down with the sheet and ends on the ground at the bottom, a slide alone never
// kills, a save in the middle of a slide keeps every plush, and only a real slab counts for the achievements.
import { kit, AV } from './avalanche_lib.js';
import { saveGame } from '../state.js';
import { SAVE_KEY } from '../config.js';

export default async function (ctx) {
  const { T, g, S, w, p, sim, stepSim, toI, toK } = ctx;
  const K = kit(ctx), { hi, plush, tagged, reset, go, ride, logHurts, av, C } = K;

  await T('avalanche.rider.the-player-is-carried-down-and-ends-on-the-ground-at-the-bottom', async () => {
    // three slopes (a bench in the terrain can stop a ride part way, so most of them must reach the bottom; every one must carry, never kill and leave the player standing)
    const bad = [], rows = []; let bottom = 0;
    for (const [y, dir] of [[26, 1], [26, -1], [30, 1]]) {
      reset({}); hi(y, 10, dir); const start = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
      const a = go({ warn: 0.4 }); if (!a) { bad.push('no slab at ' + y); continue; } const foot = a.foot, H = logHurts();
      let swept = 0, vmax = 0;
      try { ride(30, 0.05, () => { if (p().swept > 0) swept++; vmax = Math.max(vmax, Math.hypot(p().vel.x, p().vel.z)); }); } finally { H.stop(); }
      for (let n = 0; n < 40; n++) { g.time += 0.05; g.updatePlay(0.05); }   // the end: let the player settle
      const moved = Math.hypot(p().pos.x - start.x, p().pos.z - start.z), drop = start.y - p().pos.y, dealt = H.log.reduce((s, h) => s + h.dealt, 0), floorTop = w().topAt(toI(p().pos.x), toK(p().pos.z)) * C;
      const row = { y, dir, swept, vmax: +vmax.toFixed(1), dealt: +dealt.toFixed(1), drop: +drop.toFixed(1), moved: +moved.toFixed(1), end: +p().pos.y.toFixed(1), foot: foot.path, secs: av().last && av().last.secs }; rows.push(row);
      if (g.dead || g.hp < 1) bad.push('the player died ' + JSON.stringify(row)); if (swept < 15) bad.push('carried for only ' + swept + ' frames ' + JSON.stringify(row));
      if (!(p().onGround || Math.hypot(p().vel.x, p().vel.y, p().vel.z) < 6)) bad.push('still tumbling at the end ' + JSON.stringify(row));   // (on a very steep scar the foot has no ground normal, so standing is judged by speed) 
      if (!(p().pos.y - floorTop < 2.5)) bad.push('floating above the surface ' + JSON.stringify(row));
      if (dealt > 24) bad.push('the slide cost ' + dealt.toFixed(0) + ' hp'); if (av().cur && !av().cur.soft) bad.push('the slide did not finish');   // (a soft slide, softslide.js, may follow a slab: the footing of a player left high up still gives way)
      if (drop > start.y * 0.4 && moved > 5) bottom++;
    }
    reset({}); if (bottom < 2) bad.push(`only ${bottom} of 3 rides reached the bottom ${JSON.stringify(rows)}`);
    return bad.length === 0 || bad.join('; ');
  });
  await T('avalanche.rider.a-player-far-from-the-slope-is-left-alone', async () => {
    reset({}); hi(26); const pos = { x: p().pos.x, y: p().pos.y, z: p().pos.z };
    const f = av().foot(pos.x, pos.z), rf = Math.hypot(f.x, f.z) || 1;
    p().pos.set(-f.x / rf * 6, 0, -f.z / rf * 6); p().vel.set(0, 0, 0); p().onGround = true; p().swept = 0; g.hp = 100;   // the far side of the bay, 18 m or more from the foot, standing on the floor
    if (!av().start(pos, { warn: 0.2, by: 'test', speed: 0, carry: 0 })) return 'no slab';
    let sw = 0; ride(25, 0.05, () => { if (p().swept > 0) sw++; });
    const bad = []; if (sw) bad.push('swept ' + sw); if (g.hp < 100) bad.push('hurt ' + g.hp);
    reset({}); return bad.length === 0 || bad.join('; ');
  });
  await T('avalanche.rider.a-slide-alone-never-kills-and-a-hard-stop-costs-a-few-points', async () => {
    const bad = [];
    reset({}); g.hp = 13; av().rideT = 0.5;
    for (let n = 0; n < 15; n++) g.hurtPlayer(40, 'were crushed under falling plush'); g.hurtPlayer(80, 'fell too far'); g.hurtPlayer(30, 'the pile gave way');
    if (g.dead || g.hp < 12) bad.push('a ride at 13 hp ended at ' + g.hp);
    // not riding: nothing changes
    reset({}); g.hp = 50; g.hurtPlayer(30, 'were crushed under falling plush'); if (g.hp !== 20) bad.push('hurt outside a ride was changed: ' + g.hp);
    // other causes stay deadly (suffocation under the pile, a blast)
    reset({}); g.hp = 13; av().rideT = 0.5; g.hurtPlayer(20, 'suffocated under the pile'); if (!(g.hp <= 0 || g.dead)) bad.push('suffocation was shielded: ' + g.hp);
    g.dead = false; g.blacking = false;
    // the stop at the bottom
    reset({}); g.hp = 100; const sp = 12; p().vel.set(sp, 0, 0); av().rideT = 0.05; av().rideV = sp; p().vel.set(0, 0, 0); av().rideTick(0.1);
    if (!(g.hp < 100 && g.hp >= 90)) bad.push('the hard stop at the bottom cost ' + (100 - g.hp));
    reset({}); g.hp = 100; p().vel.set(2, 0, 2); av().rideT = 0.05; av().rideV = 2.8; av().rideTick(0.1); if (g.hp !== 100) bad.push('a soft stop cost ' + (100 - g.hp));
    reset({}); g.dead = false; g.blacking = false; return bad.length === 0 || bad.join('; ');
  });
  await T('avalanche.rider.buried-at-the-foot-you-can-still-punch-out', async () => {
    reset({}); hi(26); const a = go({ warn: 0.2 }); if (!a) return 'no slab';
    // stand still where the runout will bury you: the foot of the slope, not moving
    p().pos.set(a.foot.x, 0, a.foot.z); p().vel.set(0, 0, 0); p().onGround = true; g.hp = 100;
    let buriedMax = 0, died = false; ride(30, 0.05, () => { buriedMax = Math.max(buriedMax, p().buried); if (g.dead) died = true; });
    for (let n = 0; n < 20; n++) { g.time += 0.05; g.updatePlay(0.05); }
    const bad = []; if (died) bad.push('died in the runout'); if (g.hp < 20) bad.push('hp ' + g.hp);
    reset({}); return bad.length === 0 || bad.join('; ') + ' buried ' + buriedMax.toFixed(1);
  });
  await T('avalanche.save.a-save-in-the-middle-of-a-slide-keeps-every-plush', async () => {
    reset({}); const q = hi(27); const base = plush(q.i, q.k, 170);
    const a = go({ warn: 0.2 }); if (!a) return 'no slab';
    const key = SAVE_KEY, keep = (() => { try { return localStorage.getItem(key); } catch (e) { return null; } })();
    const bad = [];
    try {
      stepSim(1.6, 1 / 30); const mid = av().cur ? av().cur.next : 0, loose = sim().n;
      if (!(loose > 200 && av().cur)) return 'the slide was not under way: ' + loose;
      if (!saveGame(S(), w(), sim())) return 'save failed';
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved.loose.length !== loose) bad.push(`saved ${saved.loose.length} loose bodies of ${loose}`);
      // what a load does (game.js): bodies come back at rest as collapse debris, the slide itself is not kept
      while (sim().n) sim().remove(sim().n - 1); av().clear();
      for (const b of saved.loose) sim().spawn(b[0], b[1], b[2], b[3], b[4], 0, 0, 0, 2);
      if (sim().n !== loose) bad.push('reloaded ' + sim().n);
      stepSim(20, 1 / 30);
      const now = plush(q.i, q.k, 170);
      if (now.total !== base.total) bad.push(`plush ${base.total} -> ${now.total} after the reload`);
      if (sim().n > 5 || tagged() || av().cur) bad.push(`still moving: ${sim().n} bodies, ${tagged()} tagged, slide ${!!av().cur}`);
      return bad.length === 0 || bad.join('; ') + ' mid=' + mid;
    } finally { try { if (keep === null) localStorage.removeItem(key); else localStorage.setItem(key, keep); } catch (e) { /* ignore */ } reset({}); }
  });
  await T('avalanche.ach.only-a-real-slab-counts-for-the-rockslide-and-the-climbing-slide-achievements', async () => {
    const bad = [];
    reset({}); const q = hi(27); S().stats.bigSlides = 0; S().stats.avalanches = 0; S().stats.climbSlabs = 0; g.slide.burstN = 0; g.slide.burstCool = 0;
    // a sliver of a slab (a handful of cells) is not a real slide
    const a = go({ warn: 0.1, L: 1.0, W: 1.0, depth: 2, by: 'climb' });
    if (a) { for (let t = 0; t < 20 && av().cur; t += 1 / 30) stepSim(1 / 30, 1 / 30); if (a.released >= AV.REAL) bad.push('the sliver let ' + a.released + ' cells go (too many for the test)'); else if ((S().stats.climbSlabs || 0) || (S().stats.bigSlides || 0) || (S().stats.avalanches || 0)) bad.push('a slab of ' + a.released + ' cells counted'); }
    av().clear(); reset({}); hi(27); S().stats.bigSlides = 0; S().stats.climbSlabs = 0; S().stats.avalanches = 0; g.slide.burstCool = 0;
    // a small patch slide from climbing low counts as a fall, never as a slab
    p().pos.y = 14; g._climbT = 5; const o = Math.random; Math.random = () => 0; try { g.climbRisk(0.1); } finally { Math.random = o; }
    if ((S().stats.climbSlabs || 0)) bad.push('a low patch slide counted as a climbing slab');
    // a real one counts once
    av().clear(); reset({}); hi(27); const b = go({ warn: 0.1, by: 'climb' }); if (!b) return bad.concat('no slab').join('; ');
    for (let t = 0; t < 30 && av().cur; t += 1 / 30) stepSim(1 / 30, 1 / 30);
    if ((S().stats.climbSlabs || 0) !== 1) bad.push('climbSlabs ' + S().stats.climbSlabs); if ((S().stats.bigSlides || 0) !== 1) bad.push('bigSlides ' + S().stats.bigSlides + ' (a slab is one big slide, not one per cell)');
    const { ACHIEVEMENTS } = await import('../achievements.js'); const ach = (id) => ACHIEVEMENTS.find((x) => x.id === id);
    if (!ach('slab1') || !ach('slab1').check(S())) bad.push('the Sheet Slide achievement is not earned'); if (!ach('slide1').check(S())) bad.push('Rockslide is not earned');
    S().stats.climbSlabs = 0; if (ach('slab1').check(S())) bad.push('Sheet Slide earned with no slab');
    reset({}); return bad.length === 0 || bad.join('; ');
  });
}
