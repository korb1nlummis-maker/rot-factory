// stack.ach.*: the achievements of stacked building (wave 10). Every counter is fed by the real action and every row unlocks exactly at its number through g.checkAchievements.
import { kit, UP } from './stack_lib.js';
import { ACHIEVEMENTS, ACH_TABLE } from '../achievements.js';

const KEYS = ['stackPlates', 'stackStairs', 'stackLadders', 'stackFrames', 'stackTall', 'stackCascades'];

export default async function (ctx) {
  const { T, g, S, p, craft, selectTool, plan } = ctx;
  const K = kit(ctx), C = 0.6;
  const stat = (k) => S().stats[k] || 0;

  await T('stack.ach.every-counter-has-rows-and-the-real-actions-feed-it', async () => {
    const bad = []; for (const k of KEYS) if (!ACH_TABLE.some((r) => r.key === k)) bad.push('no achievement reads ' + k);
    const Y = K.yard({ levels: 2, east: true, up: { ...UP } }); for (const k of KEYS) delete S().stats[k];
    const [A, B2] = K.stack(Y, ['steel', 'steel']);
    // the column of two is what the counter reads (a cube added by a test helper is the same add as a load)
    delete S().stats.stackTall; K.ST.noteTall(g, B2); if (stat('stackTall') !== 2) bad.push('stackTall after two cubes: ' + stat('stackTall'));
    let r = await K.putPlate(A, 'f', 0, 0); if (!r.ok || stat('stackPlates') !== 1) bad.push('a plate: ' + stat('stackPlates'));
    r = await K.putPlate(A, 'c', 1, 0); if (!r.ok || stat('stackPlates') !== 2) bad.push('a second plate: ' + stat('stackPlates'));
    r = await K.putStair(A, 0); if (!r.ok || stat('stackStairs') !== 1) bad.push('a switchback stair: ' + stat('stackStairs') + ' ' + (r.why || ''));
    craft('wall'); selectTool('wall'); K.stand(A, { od: 2, pitch: 0 }); p().pos.y = 0.62; const wp = await plan(); if (!wp.ok) bad.push('door frame plan ' + wp.why); else { K.placeNow(); if (stat('stackFrames') !== 1) bad.push('a door frame: ' + stat('stackFrames')); }
    // the hatch ladder needs a shaft plate: use the other column
    K.dig(Y.m + 4, 0, Y.lo, 4, 8, 4); const C2 = K.cube('steel', Y.m + 4, Y.lo, 0); K.cube('steel', Y.m + 4, Y.lo, 4);
    await K.putPlate(C2, 'f', 0, 0); await K.putPlate(C2, 'c', 2, 0); craft('ladder'); selectTool('ladder'); K.aimAt(K.cellX(Y.m + 5), 4 * C, K.cellZ(Y.lo + 2), 1.0, 0.62); const lp = await plan(); if (!lp.ok) bad.push('ladder plan ' + lp.why); else { K.placeNow(); if (stat('stackLadders') !== 1) bad.push('a ladder: ' + stat('stackLadders')); }
    g.failSupport(K.support(C2), 1.2); // the upper cube of that column loses its footing
    if (stat('stackCascades') < 1) bad.push('a cascade was not counted: ' + stat('stackCascades'));
    return bad.length === 0 || bad.join(' || ');
  });

  await T('stack.ach.every-new-row-unlocks-exactly-at-its-number-through-the-real-unlock-path', async () => {
    K.yard({ up: {} }); const bad = [], keys = new Set(KEYS);
    for (const row of ACH_TABLE) {
      if (row.kind !== 'stat' || !keys.has(row.key)) continue;
      S().ach = {}; S().stats = { ...S().stats }; S().stats[row.key] = row.n - 1; g.checkAchievements(); if (S().ach[row.id]) bad.push(`${row.id} unlocked at ${row.n - 1}`);
      S().stats[row.key] = row.n; g.checkAchievements(); if (!S().ach[row.id]) bad.push(`${row.id} not unlocked at ${row.n}`);
      S().stats[row.key] = 0;
    }
    S().ach = {}; return bad.length === 0 || bad.slice(0, 6).join('; ');
  });

  await T('stack.ach.the-new-rows-have-names-text-and-no-em-dashes', async () => {
    const ids = ACH_TABLE.filter((r) => KEYS.includes(r.key)).map((r) => r.id), bad = [];
    for (const id of ids) { const a = ACHIEVEMENTS.find((x) => x.id === id); if (!a || !a.name || !a.desc || /[—–]|undefined|\{n\}/.test(a.name + a.desc)) bad.push(id); }
    return (ids.length === 13 && bad.length === 0) || `${ids.length} rows, bad: ${bad.join()}`;
  });
}
