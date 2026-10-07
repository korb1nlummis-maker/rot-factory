import { fanSpacing, staleAt, STALE_START } from '../dust.js';
import { earthTune, EARTH_KW, STALE_CHOKE } from '../earth.js';
export default async function (ctx) {
  const { T, g, FRAME_TYPES } = ctx;
  const txt = (b) => [b.title, ...b.rows.map((r) => (Array.isArray(r) ? r.join(' ') : r)), b.foot].join('\n');
  await T('hall.six-chalkboards-stand-in-the-bay', async () => {
    const boards = []; g.renderer.scene.traverse((o) => { if (o.name === 'chalkboard') boards.push(o); });
    return (boards.length >= 11 && g.hall.boards.length === 10) || `${boards.length} chalkboards in the scene, ${g.hall.boards.length} new ones`;   // wave 6 added the tunnels and portals board (8 -> 9), wave 10 the stacked building board (9 -> 10)
  });
  await T('hall.depth-board-lists-every-support-with-its-real-rating', async () => {
    const b = g.hall.boards.find((x) => /HOW DEEP/.test(x.title)); if (!b) return 'no depth board'; const t = txt(b), bad = [];
    for (const f of Object.values(FRAME_TYPES)) { if (!t.includes(f.name)) bad.push('missing ' + f.name); else if (isFinite(f.maxDepth)) { const shown = f.maxDepth >= 1000 ? (f.maxDepth / 1000).toFixed(f.maxDepth % 1000 ? 1 : 0) + ' km' : f.maxDepth + ' m'; const row = b.rows.find((r) => Array.isArray(r) && r[0] === f.name); if (!row || !row[1].startsWith(shown)) bad.push(f.name + ' shows ' + (row && row[1])); } }
    return bad.length === 0 || bad.join('; ');
  });
  await T('hall.air-board-numbers-are-the-real-fan-spacing', async () => {
    const b = g.hall.boards.find((x) => /AIR AT DEPTH/.test(x.title)); if (!b) return 'no air board'; const bad = [];
    for (const d of [400, 500, 600, 800, 1000, 1500]) { const row = b.rows.find((r) => Array.isArray(r) && r[0] === `at ${d} m deep`); const s = fanSpacing(d); const want = isFinite(s) ? `a fan every ${s.toFixed(s < 10 ? 1 : 0)} m` : 'no fan needed'; if (!row || row[1] !== want) bad.push(`${d} m: board says "${row && row[1]}", rule says "${want}"`); }
    if (!txt(b).includes(String(STALE_START))) bad.push('start depth missing'); return bad.length === 0 || bad.join('; ');
  });
  await T('hall.every-board-fits-its-chalk-and-has-clean-text', async () => {
    const bad = []; for (const b of g.hall.boards) { if (b.overflow) bad.push(b.title + ' runs off the board'); if (/[—–]|undefined|NaN/.test(txt(b))) bad.push(b.title + ' has bad text'); } return bad.length === 0 || bad.join('; ');
  });
  await T('hall.tunnel-board-numbers-are-the-real-ones', async () => {
    const b = g.hall.boards.find((x) => /TUNNELS AND PORTALS/.test(x.title)); if (!b) return 'no tunnel board'; const t = txt(b), bad = [];
    const { ARCH_SPANS } = await import('../loadtrace.js'), H = await import('../haul.js'), P = await import('../portal.js');
    for (const want of [`${H.CUBE_CLEAR.w} x ${H.CUBE_CLEAR.h} cells clear`, `${ARCH_SPANS[6].cw} x ${ARCH_SPANS[6].ch} clear, 85% depth`, `${ARCH_SPANS[8].cw} x ${ARCH_SPANS[8].ch} clear, 70% depth`, `${ARCH_SPANS[12].cw} x ${ARCH_SPANS[12].ch} clear, 55% depth`, `${H.VEHICLES.truck.w} x ${H.VEHICLES.truck.h} clear`, `${H.VEHICLES.wheel.w} x ${H.VEHICLES.wheel.h} clear`, `Portal ${P.KW[6]} / ${P.KW[8]} / ${P.KW[12]} kW`, `Roads ${H.ROAD.speed}x`, `Docks ${H.DOCK.charge} kW`]) if (!t.includes(want)) bad.push('missing "' + want + '"');
    if (b.overflow) bad.push('the board runs off its edge'); return bad.length === 0 || bad.join('; ');
  });
  await T('hall.earth-mover-board-numbers-are-the-real-ones', async () => {
    const b = g.hall.boards.find((x) => /EARTH MOVERS/.test(x.title)); if (!b) return 'no earth mover board'; const t = txt(b), bad = [];
    const T0 = ctx.computeTuning({}, null);
    const ex = earthTune(T0, 'excavator'), wh = earthTune(T0, 'wheel'), tk = earthTune(T0, 'truck'), dz = earthTune(T0, 'dozer');
    for (const want of [`${2 * ex.latHalf + 1} x ${ex.vert} face, ${ex.hopper} hopper`, `${2 * wh.latHalf + 1} x ${wh.vert} face, ${wh.hopper} hopper`, `${dz.blade} wide blade`, `${tk.bed} plush, ${tk.range} m radio`, `${EARTH_KW.excavator} kW`, `${EARTH_KW.wheel}`]) if (!t.includes(want)) bad.push('missing ' + want);
    const choke = Math.round(STALE_START + STALE_CHOKE * 900); if (!t.includes(`Past ${choke} m`)) bad.push('stale depth ' + choke);
    return bad.length === 0 || bad.join('; ');
  });
}
