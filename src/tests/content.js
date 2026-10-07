import { ACHIEVEMENTS } from '../achievements.js';
export default async function (ctx) {
  const { T, g, S, w, p, fresh, craft, selectTool, plan, placeNow, aimPoint, spot, dig, adv, UPGRADES, FRAME_TYPES, loadOn, capacityOf, cellX, cellZ, newWorld, realSleep, tune } = ctx;
  const ach = (id) => ACHIEVEMENTS.find((a) => a.id === id);
  await T('content.structural-survey-shows-depth-best-frame-pile-and-load', async () => {
    fresh({ timber: 1, steel: 1 }); S().up.survey = 0; g.T = g.tune(); g._svNext = 0; g.updateSurvey(); if (['frame', 'support', 'stale'].some((id) => g.ui.dials.read(id).on)) return 'shown without the upgrade';
    S().up.survey = 1; g.T = g.tune(); p().pos.set(200, 0, 30); p().vel.set(0, 0, 0); g._svNext = 0; g.updateSurvey();
    const di = (id, k) => g.ui.dials.read(id).info[k]; const txt = (id) => ({ svDepth: di('frame', 'depth'), svBest: di('frame', 'best'), svPress: di('frame', 'press'), svLoad: di('support', 'load') })[id]; const d = Math.round(Math.hypot(200, 30));
    if (txt('svDepth') !== `${d} m DEEP`) return 'depth ' + txt('svDepth'); if (!/Steel Frame \(rated 380 m\)/.test(txt('svBest'))) return 'best frame ' + txt('svBest'); if (!/m of pile above/.test(txt('svPress'))) return 'pile ' + txt('svPress'); if (txt('svLoad') !== 'no support within 8 m') return 'load ' + txt('svLoad');
    p().pos.set(500, 0, 0); g._svNext = 0; g.updateSurvey(); if (!/too weak here/.test(txt('svBest'))) return 'no warning past the rating: ' + txt('svBest'); return true;
  });
  await T('content.structural-survey-load-matches-the-trace', async () => {
    fresh({ timber: 1, survey: 1 }); const { i, k } = spot(); dig(i, k - 1, 12, 5, 4, false); const e = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'x', cx: cellX(i + 6), cz: cellZ(k + 1), y0: 0, w: 2.36, h: 2.38, gm: i + 6, glo: k - 1, gj: 0 }; S().entities.push(e); g.addEntity(e);
    p().pos.set(e.cx - 2, 0, e.cz); g._svNext = 0; g.updateSurvey(); const sup = w().supports.find((s) => s.id === e.id); const want = Math.round(loadOn(w(), sup) / capacityOf('timber') * 100);
    const sl = g.ui.dials.read('support'); return (sl.info.load === `nearest support: ${want}% load` && sl.val === want + '%') || `${sl.info.load} / ${sl.val} vs ${want}%`;
  });
  await T('content.new-achievements-trigger-only-when-earned', async () => {
    fresh({}); const bad = []; const st = S();
    const cases = { signed: [() => { st.name = ''; }, () => { st.name = 'A'; }], day7: [() => { st.gameMin = 1440 * 5; }, () => { st.gameMin = 1440 * 6; }], day30: [() => { st.gameMin = 1440 * 28; }, () => { st.gameMin = 1440 * 29; }], day100: [() => { st.gameMin = 1440 * 98; }, () => { st.gameMin = 1440 * 99; }],
      fan1: [() => { st.stats.mfans = 0; }, () => { st.stats.mfans = 1; }], curve5: [() => { st.stats.turnedFrames = 4; }, () => { st.stats.turnedFrames = 5; }], buckle1: [() => { st.stats.brokenSupports = 0; }, () => { st.stats.brokenSupports = 1; }], razzo1: [() => { st.stats.razzos = 0; }, () => { st.stats.razzos = 1; }],
      assay3: [() => { st.up.assay = 2; }, () => { st.up.assay = 3; }], survey1: [() => { st.up.survey = 0; }, () => { st.up.survey = 1; }] };
    for (const [id, [no, yes]] of Object.entries(cases)) { const a = ach(id); if (!a) { bad.push('missing ' + id); continue; } no(); if (a.check(st)) bad.push(id + ' earned too early'); yes(); if (!a.check(st)) bad.push(id + ' not earned'); }
    return bad.length === 0 || bad.join('; ');
  });
  await T('content.fan-and-curve-achievements-count-real-placements', async () => {
    fresh({ timber: 1, power: 1, fans: 1, mfan: 1 }); S().stats.turnedFrames = 0; S().stats.mfans = 0; const { i, k } = spot(); dig(i, k - 5, 40, 13, 8, false); craft('frame:timber', 6); craft('mfan', 1);
    selectTool('frame:timber'); let yaw = 0; for (let n = 0; n < 5; n++) { g.frameYaw = yaw; aimPoint(cellX(i + 6 + n * 5), 0, cellZ(k + 2), 2.4); const pl = await plan(); if (!pl.ok) return `frame ${n}: ${pl.why}`; placeNow(); yaw += 0.1; }
    if ((S().stats.turnedFrames || 0) !== 5 || !ach('curve5').check(S())) return 'turned frames counted ' + S().stats.turnedFrames;
    const f = S().entities.filter((e) => e.type === 'frame').pop(); selectTool('mfan'); p().pos.set(f.cx - 2.5 * Math.sin(f.yaw), 0, f.cz - 2.5 * Math.cos(f.yaw)); p().yaw = f.yaw; aimPoint(f.cx, f.y0 + f.h - 0.3, f.cz, 2.4); const pl = await plan(); if (!pl.ok) return pl.why; placeNow();
    return (S().stats.mfans === 1 && ach('fan1').check(S())) || 'mfans ' + S().stats.mfans;
  });
  await T('content.breaking-a-support-earns-under-pressure', async () => {
    fresh({ timber: 1 }); const before = S().stats.brokenSupports || 0; g.breakSupport({ name: 'Timber Frame', max: 150, d: 400, pct: 130, next: 'steel' }, { cx: 1, cz: 1, y0: 0 }); return ach('buckle1').check(S()) && (S().stats.brokenSupports || 0) === before + 1 || 'not counted';
  });
  await T('content.razzo-blast-earns-lit-fuse', async () => { await newWorld(); fresh({}); S().stats.razzos = 0; p().pos.set(0, 0, -1.4); g.razzoBlast(80, 3, 40); return ach('razzo1').check(S()) || 'not counted'; });
  await T('content.radio-and-memos-are-clean-text', async () => {
    const src = await (await fetch('/src/radio.js')).text(); const lines = [...src.matchAll(/^\s*'(.+)',$/gm)].map((m) => m[1]); const bad = lines.filter((l) => /[—–]|undefined|NaN/.test(l)); if (!lines.some((l) => /depth rating/.test(l))) return 'new radio lines missing';
    for (let n = 1; n <= 8; n++) { const t = g.dayTip(n); if (n >= 2 && n <= 7 && !t) return 'no tip for day ' + n; if (/[—–]|undefined/.test(t)) bad.push('tip ' + n); }
    for (let n = 1; n <= 120; n++) { const l = g.dayLine(n); if (!l || /[—–]|undefined/.test(l)) bad.push('dayLine ' + n); }
    return bad.length === 0 || bad.slice(0, 3).join(' | ');
  });
}
