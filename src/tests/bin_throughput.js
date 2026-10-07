import { UPGRADES } from '../upgrades.js';
export default async function (ctx) {
  const { T, g, S, fresh } = ctx;
  await T('bins.throughput-perk-pulls-batches-of-plush-per-tick-from-hands-and-cart', async () => {
    const u = UPGRADES.find((x) => x.id === 'binpull'); const bad = [];
    if (!u || u.max !== 8 || u.req.id !== 'dump') return 'upgrade missing or wrong: ' + JSON.stringify(u && [u.max, u.req]);
    const want = [1, 2, 4, 8, 16, 32, 64, 128, 256]; for (let l = 0; l <= 8; l++) { fresh({ dump: 3, binpull: l }); g.T = g.tune(); if (g.T.binBatch !== want[l]) bad.push(`L${l}: binBatch ${g.T.binBatch}`); }
    // a big load: no perk empties in about two seconds anyway; with the perk it is faster
    const run = (lvl, n) => { fresh({ dump: 3, binpull: lvl, bag: 8 }); g.T = g.tune(); const b = g.hall.binPos; g.player.pos.set(b.x - 1.5, 0, b.z); S().carry = []; for (let q = 0; q < Math.min(n, g.T.carry); q++) S().carry.push({ sp: 3 + (q % 3), vr: 0 }); const had = S().carry.length; const m0 = S().money; let ticks = 0; while (S().carry.length && ticks < 4000) { g.time += 0.05; g._adT = 0; g.autoDump(0.05); ticks++; } return { had, ticks, paid: S().money - m0 }; };
    const a = run(0, 120), z = run(5, 120);
    if (!(a.ticks <= 2 * 30 + 6)) bad.push(`no perk: ${a.had} plush took ${a.ticks} ticks (should be about 40 or fewer)`);
    if (!(z.ticks <= a.ticks)) bad.push(`level 5 is not faster: ${z.ticks} vs ${a.ticks}`); if (!(z.paid > 0 && a.paid > 0)) bad.push('nothing was paid');
    const one = run(0, 1); if (one.ticks !== 1) bad.push('a single plush should go in one tick: ' + one.ticks);
    return bad.length === 0 || bad.join('; ');
  });
  await T('bins.plush-grabbed-inside-a-bins-pull-go-straight-in-and-never-wait-on-the-hands-to-unload', async () => {
    fresh({ bag: 8 }); g.T = g.tune(); const b = g.hall.binPos, P = g.player.pos, bad = []; const VEC = P.constructor;
    P.set(b.x - 2.0, 0, b.z); S().carry = []; const m0 = S().money, n0 = S().stats.plush; for (let q = 0; q < 50; q++) g.pickedUp({ sp: 3, vr: 0 }, new VEC(b.x - 1.5, 1, b.z));
    if (S().carry.length !== 0) bad.push('plush grabbed at the bin were carried: ' + S().carry.length); if (!(S().money > m0)) bad.push('nothing was paid at the bin'); if (S().stats.plush - n0 !== 50) bad.push('grabs not counted');
    P.set(0, 0, -1.4); S().carry = []; for (let q = 0; q < 5; q++) g.pickedUp({ sp: 3, vr: 0 }, new VEC(1, 1, -1.4)); if (S().carry.length !== 5) bad.push('far from the bin the plush should be carried: ' + S().carry.length);
    return bad.length === 0 || bad.join('; ');
  });
}
