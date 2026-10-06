import { fanSpacing, staleAt, STALE_START } from '../dust.js';
export default async function (ctx) {
  const { T, g, FRAME_TYPES } = ctx;
  const txt = (b) => [b.title, ...b.rows.map((r) => (Array.isArray(r) ? r.join(' ') : r)), b.foot].join('\n');
  await T('hall.five-chalkboards-stand-in-the-bay', async () => {
    const boards = []; g.renderer.scene.traverse((o) => { if (o.name === 'chalkboard') boards.push(o); });
    return (boards.length >= 5 && g.hall.boards.length === 4) || `${boards.length} chalkboards in the scene, ${g.hall.boards.length} new ones`;
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
}
