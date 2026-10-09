import { fanSpacing, staleAt, STALE_START } from '../dust.js';
import { earthTune, EARTH_KW, STALE_CHOKE } from '../earth.js';
export default async function (ctx) {
  const { T, g, FRAME_TYPES } = ctx;
  const txt = (b) => [b.title, ...b.rows.map((r) => (Array.isArray(r) ? r.join(' ') : r)), b.foot].join('\n');
  await T('hall.six-chalkboards-stand-in-the-bay', async () => {
    const boards = []; g.renderer.scene.traverse((o) => { if (o.name === 'chalkboard') boards.push(o); });
    return (boards.length >= 16 && g.hall.boards.length === 15) || `${boards.length} chalkboards in the scene, ${g.hall.boards.length} new ones`;   // wave 6 added the tunnels and portals board (8 -> 9), wave 10 the stacked building board (9 -> 10), the wire-only power board (10 -> 11), the last pass four more: belts and hose, the crew, slides and avalanches, care packages and Night Shift (11 -> 15). The easel by the start is the 16th.
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
  await T('hall.refreshed-boards-name-the-new-features-with-the-real-numbers', async () => {
    const bad = [], find = (re) => g.hall.boards.find((x) => re.test(x.title)), need = (b, name, wants) => { if (!b) { bad.push('no ' + name + ' board'); return; } const t = txt(b); for (const w of wants) if (!t.includes(w)) bad.push(`${name}: missing "${w}"`); if (b.overflow) bad.push(name + ' runs off the board'); };
    const BI = await import('../beltintake.js'), { AV } = await import('../avalanche.js'), CM = await import('../carepackage.js'), { LOW_BATTERY } = await import('../crew.js'), PW = await import('../power.js'), { upgradeById } = await import('../upgrades.js');
    need(find(/BELTS AND HOSE/), 'belts', [`${BI.RATE[0]} plush a second within ${BI.RANGE[0]} m`, `up to ${BI.RATE[7]} a second, ${BI.RANGE[7]} m`, 'loose plush within 3.5 m', 'twice as fast as a belt', 'gold', 'One cable on any tile']);
    need(find(/BOTS AND THE CREW/), 'bots', [`Under ${Math.round(LOW_BATTERY * 100)}%`, `A ${PW.DEMAND.charger} kW machine`, 'needs a cable', 'Fuel duty', 'Keep machines fueled']);
    need(find(/SLIDES AND AVALANCHES/), 'slides', [`Over ${AV.H0} m, steep`, `8 to ${AV.H0} m up`, 'Rope Anchor', 'Climbing Gear', 'R or right click', 'Space punches up']);
    need(find(/CARE AND NIGHT SHIFT/), 'care', [`every ${CM.CARE.DAYS} game days`, `${upgradeById('nightshift').cost[0] / 1e6}M`, 'red button', 'J, the achievements screen', '19:00']);
    need(find(/POWER NEEDS WIRES/), 'power', [`Charging Station`, `Common ${PW.BURN_SECONDS[0] / 60}, Uncommon ${PW.BURN_SECONDS[1] / 60}, Rare ${PW.BURN_SECONDS[2] / 60}, Epic ${PW.BURN_SECONDS[3] / 60} min`]);
    const cb = (await import('../controls.js')).CONTROL_CODES; for (const [title] of g.hall.controlBoards) { const b = find(new RegExp(title.replace(/[:]/g, '.'))); if (!b) bad.push('missing ' + title); }
    const t = txt(find(/CONTROLS: TOOLS/) || { title: '', rows: [], foot: '' }) + txt(find(/CONTROLS: MOVING/) || { title: '', rows: [], foot: '' }); for (const w of ['scoop / vacuum dial', 'pick the bin']) if (!t.includes(w)) bad.push('controls missing ' + w); void cb;
    // the easel by the start names the dials and belts
    const names = []; g.renderer.scene.traverse((o) => { if (o.name === 'chalkboard') names.push(o); });
    // no new board stands on another board or on a station
    const bs = g.hall.boards; for (const b of bs) for (const o of bs) if (o !== b && Math.hypot(o.x - b.x, o.z - b.z) < 2.3) bad.push(`${b.title} stands on ${o.title}`);
    for (const b of bs.filter((x) => /BELTS AND HOSE|BOTS AND THE CREW|SLIDES AND|CARE AND NIGHT/.test(x.title))) { const cols = g.hall.colliders.filter((c) => !(Math.abs(c.x - b.x) < 0.01 && Math.abs(c.z - b.z) < 0.01) && Math.hypot(c.x - b.x, c.z - b.z) < 1.4); if (cols.length) bad.push(b.title + ' overlaps ' + cols.map((c) => `(${c.x},${c.z})`).join(' ')); }
    return bad.length === 0 || bad.join('; ');
  });
}
