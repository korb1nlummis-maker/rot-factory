import { rigKit, SB } from './supportborer_lib.js';
import { loadSaved } from '../state.js';
import { SAVE_KEY } from '../config.js';
import { NEEDLE } from '../plushdata.js';
// supportborer.*: the Support Borer (src/supportborer.js), the tunnel jumbo that bores a tunnel and sets the supports loaded into it before the roof needs them.
// Run: `await __selftest('supportborer.')`. Each test builds its own tunnel in a fresh world; the rig is cut fast (T.borerRate) and the real stability loop runs after every tick.
export default async function (ctx) {
  const { T: T0, g, S, realSleep, newWorld } = ctx;
  const T = (name, fn) => T0(name, async () => { try { return await fn(); } finally { await newWorld(); } });   // (a scene leaves a big edited pile and sales behind: the next area starts in a fresh world)
  const R = rigKit(ctx), W = R.W;
  const load = (s, n = 12) => { R.give(s.kind, n); return SB.act(g, s.e, 'use', ''); };
  const start = (s) => { if (!s.e.on) SB.act(g, s.e, 'use', ''); };   // (E with nothing to load starts it)
  // dig `cols` columns with the rig, topping the load up whenever it runs out. Returns { r, reloads, outs }
  const tunnel = (s, cols, o = {}) => {
    let reloads = 0, outs = 0, minM = Infinity, creaks = 0, collapses = 0;
    for (let n = 0; n < 40 && s.e.fa < s.i0 + cols; n++) {
      const r = R.run(s, 20, { until: () => s.e.fa >= s.i0 + cols || s.e.bs === 'out' || (s.e.bs !== 'dig' && s.e.bs !== 'set' && s.e.bs !== 'off') });
      minM = Math.min(minM, r.minMargin); creaks += r.creaks; collapses += r.collapses;
      if (s.e.bs === 'out') { outs++; reloads++; R.give(s.kind, 12); SB.act(g, s.e, 'use', ''); } else if (s.e.fa < s.i0 + cols && s.e.bs !== 'dig' && s.e.bs !== 'set') break;
    }
    void o; return { minM, creaks, collapses, reloads, outs };
  };

  await T('supportborer.loads-supports-from-the-bag-and-the-count-drops', async () => {
    const s = await R.scene({}); const bad = [];
    R.give(s.kind, 20); SB.act(g, s.e, 'use', '');
    if (s.e.sn !== SB.CAP || (S().items[s.kind] | 0) !== 20 - SB.CAP) bad.push(`loaded ${s.e.sn}, bag ${S().items[s.kind]}`);
    if (s.e.sk !== s.kind) bad.push('kind ' + s.e.sk);
    const inf = SB.info(g, s.e); if (!inf.lines.some((l) => l.includes('Supports 12/12'))) bad.push('readout: ' + inf.lines[1]);
    SB.act(g, s.e, 'use', ''); if (!s.e.on) bad.push('E with a full load must start it');
    SB.act(g, s.e, 'use', ''); if (s.e.on) bad.push('E again must stop it');
    // crouch + E empties it into the bag
    SB.act(g, s.e, 'alt', ''); if (s.e.sn !== 0 || (S().items[s.kind] | 0) !== 20) bad.push(`unload: sn ${s.e.sn}, bag ${S().items[s.kind]}`);
    // a partial load and a different kind: only the same kind tops it up
    R.give('frame:timber', 3); R.give(s.kind, 2); SB.act(g, s.e, 'use', 'frame:timber'); if (s.e.sk !== 'frame:timber' || s.e.sn !== 3) bad.push(`held pick: ${s.e.sk} ${s.e.sn}`);
    SB.act(g, s.e, 'use', ''); if (s.e.sk !== 'frame:timber' || s.e.sn !== 3) bad.push('a loaded rig took another kind');
    return bad.length === 0 || bad.join('; ');
  });

  // a 60 cell tunnel in each class at two depths: the roof never falls and the span never passes the safe limit at any tick (it keeps at least SAFETY cells in hand)
  for (const [cls, dist, mat, block] of [[0, 0, 'steel'], [0, 500, 'concrete', true], [6, 0, 'steel'], [6, 500, 'concrete', true], [8, 200, 'concrete', true], [12, 0, 'concrete']]) {
    await T(`supportborer.digs-a-60-cell-${cls ? 'arch' + cls : 'regular'}-tunnel-${dist ? 'at-' + dist + '-m' : 'at-the-bay'}-and-the-roof-never-falls`, async () => {
      const s = await R.scene({ dist, cls, mat, len: 100, block }); load(s); start(s);
      const t = tunnel(s, 60), bad = [];
      if (s.e.fa < s.i0 + 60) bad.push(`only ${s.e.fa - s.i0} columns bored, state ${s.e.bs}: ${s.e.bwhy}`);
      if (t.collapses) bad.push(t.collapses + ' collapses');
      if (t.creaks) bad.push(`creaking in ${t.creaks} ticks`);
      if (!(t.minM >= SB.SAFETY)) bad.push(`the unsupported span passed the safe limit: margin ${t.minM} (it keeps ${SB.SAFETY})`);
      if (s.e.placed < 1) bad.push('set no supports');
      // every support it set stands in the world, and the bag + load + set add up
      const set = R.frames().length - (s.pre === 4 ? 1 : 0);
      if (set !== s.e.placed) bad.push(`${set} supports in the world, ${s.e.placed} counted`);
      if (12 * (1 + t.reloads) - s.e.placed !== s.e.sn) bad.push(`load accounting: ${12 * (1 + t.reloads)} - ${s.e.placed} != ${s.e.sn}`);
      globalThis.__sbrun = (globalThis.__sbrun || []).concat([`${cls || 'cube'}@${dist}: ${s.e.fa - s.i0} cols, ${s.e.placed} supports, ${t.reloads} reloads, min margin ${t.minM}`]);
      return bad.length === 0 || bad.join('; ');
    });
  }

  await T('supportborer.stops-with-the-message-when-supports-run-out-leaves-no-overlong-span-and-resumes-after-loading-more', async () => {
    const s = await R.scene({ dist: 0, cls: 0, mat: 'steel', len: 100 }); const bad = [];
    const toasts = []; const t0 = g.ui.toast; g.ui.toast = (m) => { toasts.push(m && m.title); return t0.call(g.ui, m); };
    let errs = 0; const e0 = g.sound.error; g.sound.error = (...a) => { errs++; return e0 && e0.apply(g.sound, a); };
    try {
      R.give(s.kind, 2); SB.act(g, s.e, 'use', ''); start(s);
      const r = R.run(s, 120, { until: () => s.e.bs === 'out' });
      if (s.e.bs !== 'out') return `never ran out: state ${s.e.bs}, ${s.e.sn} left`;
      if (s.e.sn !== 0 || s.e.placed !== 2) bad.push(`sn ${s.e.sn}, placed ${s.e.placed}`);
      if (!toasts.includes('Out of supports: load more')) bad.push('no toast: ' + toasts.join('|'));
      if (!errs) bad.push('no sound');
      if (!SB.info(g, s.e).lines[0].includes('Out of supports')) bad.push('readout: ' + SB.info(g, s.e).lines[0]);
      const m = R.margin(s, s.i0 + 4, s.e.fa); if (!(m >= SB.SAFETY)) bad.push(`it stopped with margin ${m} (needs ${SB.SAFETY} in hand)`);
      const fa = s.e.fa, w2 = R.run(s, 20); if (s.e.fa !== fa) bad.push('it kept digging with no supports'); if (w2.collapses || r.collapses) bad.push('the roof fell');
      if (!(R.margin(s, s.i0 + 4, s.e.fa) >= 0)) bad.push('overlong span while stopped');
      // load more: it goes on by itself
      R.give(s.kind, 12); SB.act(g, s.e, 'use', ''); const r2 = R.run(s, 20, { until: () => s.e.fa >= fa + 6 });
      if (s.e.fa < fa + 6) bad.push(`did not resume: fa ${s.e.fa - s.i0} (was ${fa - s.i0}), state ${s.e.bs}`);
      if (r2.collapses) bad.push('the roof fell after loading more');
    } finally { g.ui.toast = t0; g.sound.error = e0; }
    return bad.length === 0 || bad.join('; ');
  });

  await T('supportborer.stops-when-unpowered-and-goes-on-when-the-cable-is-back', async () => {
    const s = await R.scene({ dist: 0, cls: 0 }); load(s); start(s); const bad = [];
    R.run(s, 3); const fa = s.e.fa; if (fa <= s.i0 + 2) bad.push('it did not dig');
    R.run(s, 5, { power: false }); if (s.e.fa !== fa || s.e.bs !== 'nopower') bad.push(`unpowered: fa moved ${s.e.fa - fa}, state ${s.e.bs}`);
    if (SB.kwOf(s.e) < SB.KW_WAIT) bad.push('an on rig that waits for power must still ask for power: ' + SB.kwOf(s.e));
    R.run(s, 3); if (!(s.e.fa > fa)) bad.push('did not resume');
    return bad.length === 0 || bad.join('; ');
  });

  await T('supportborer.never-sets-a-support-it-does-not-hold-and-dig-only-stops-at-the-line', async () => {
    const bad = [];
    let s = await R.scene({ dist: 0, cls: 0 }); start(s); const n0 = R.frames().length;   // nothing loaded
    R.run(s, 60, { until: () => s.e.bs === 'out' });
    if (s.e.bs !== 'out' || R.frames().length !== n0 || s.e.placed) bad.push(`empty: state ${s.e.bs}, supports ${R.frames().length - n0}`);
    if (!(R.margin(s, s.i0 + 3, s.e.fa) >= SB.SAFETY)) bad.push('empty rig passed the line');
    // Dig only: loaded but told to skip supports
    s = await R.scene({ dist: 0, cls: 0 }); for (let q = 0; q < 4; q++) SB.act(g, s.e, 'alt', '');   // (empty: crouch + E steps the mode: every 2, 3, 4 cubes, Dig only)
    if (SB.modeIndex(s.e) !== 4) bad.push('mode ' + SB.modeIndex(s.e)); load(s); start(s); R.run(s, 60, { until: () => s.e.bs === 'need' });
    if (s.e.bs !== 'need' || s.e.placed) bad.push(`dig only: state ${s.e.bs}, placed ${s.e.placed}`);
    if (!(R.margin(s, s.i0 + 3, s.e.fa) >= SB.SAFETY)) bad.push('dig only passed the line');
    return bad.length === 0 || bad.join('; ');
  });

  await T('supportborer.a-support-every-3-cubes-spaces-them-and-the-mode-steps-with-crouch-e', async () => {
    const s = await R.scene({ dist: 0, cls: 0, len: 100 }); const bad = [];
    for (let q = 0; q < 3; q++) SB.act(g, s.e, 'alt', '');   // at need -> every 2 -> every 3 -> every 4
    if (SB.modeIndex(s.e) !== 3 || s.e.sg !== 4) bad.push(`mode ${SB.modeIndex(s.e)} sg ${s.e.sg}`);
    for (let q = 0; q < 3; q++) SB.act(g, s.e, 'alt', ''); if (SB.modeIndex(s.e) !== 1 || s.e.sg !== 2) bad.push('every 2 not reached');
    load(s); start(s); const r = tunnel(s, 40);
    const xs = R.frames().map((f) => f.gm).sort((a, b) => a - b), gaps = xs.slice(1).map((x, q) => x - xs[q]);
    if (xs.length < 3) bad.push('few supports ' + xs.length); if (gaps.some((d) => d > 12)) bad.push('gaps ' + gaps.join()); if (r.collapses) bad.push('collapse');
    return bad.length === 0 || bad.join('; ');
  });

  await T('supportborer.mined-plush-are-counted-and-sold-nothing-is-lost', async () => {
    const s = await R.scene({ dist: 0, cls: 0 }); load(s); start(s);
    const st = S().stats, p0 = st.plush, sold0 = st.sold, cells0 = st.cells, m0 = S().money; let removed = 0;
    const orig = W().removeCell; W().removeCell = function (i, j, k, q) { const r = orig.call(this, i, j, k, q); if (r && this.onRemove !== null && q !== false) removed++; return r; };
    try { R.run(s, 30, { until: () => s.e.steps >= 24 }); } finally { W().removeCell = orig; }
    const bore = s.e.steps * 16, bad = [];
    if (st.plush - p0 !== bore || st.cells - cells0 !== bore) bad.push(`counted ${st.plush - p0} plush ${st.cells - cells0} cells for ${bore} cut cells`);
    if (st.sold - sold0 !== bore) bad.push(`sold ${st.sold - sold0} of ${bore}`);
    if (!(S().money > m0)) bad.push('no fluff came in');
    return bad.length === 0 || bad.join('; ');
  });

  await T('supportborer.stops-short-of-a-cavity-another-tunnel-and-the-one-and-never-opens-into-them', async () => {
    const bad = [];
    let s = await R.scene({ dist: 0, cls: 0, len: 100 }); load(s); start(s);
    R.K.dig(s.i0 + 22, 0, s.lo - 2, 12, 6, 8, false);   // a cavity 22 columns ahead
    R.run(s, 60, { until: () => s.e.bs === 'breach' });
    if (s.e.bs !== 'breach') bad.push('cavity: state ' + s.e.bs); else if (!W().solid(s.e.fa + 1, 1, s.lo + 1)) bad.push('cavity: the wall is gone'); if (s.e.fa >= s.i0 + 21) bad.push('cavity: it went into it, fa ' + (s.e.fa - s.i0));
    s = await R.scene({ dist: 0, cls: 0, len: 100 }); load(s); start(s);
    W().setCell(s.i0 + 20, 1, s.lo + 1, NEEDLE, 0);
    R.run(s, 60, { until: () => s.e.bs === 'one' });
    if (s.e.bs !== 'one' || W().get(s.i0 + 20, 1, s.lo + 1) !== NEEDLE) bad.push('the one: state ' + s.e.bs + ', cell ' + W().get(s.i0 + 20, 1, s.lo + 1));
    return bad.length === 0 || bad.join('; ');
  });

  await T('supportborer.two-rigs-boring-toward-each-other-stop-with-a-wall-between-them', async () => {
    const s = await R.scene({ dist: 0, cls: 0, len: 100 }); load(s); start(s); const bad = [];
    const j0 = s.i0 + 36; R.K.dig(j0, 0, s.lo, 3, 4, 4, false);
    const f = SB.build(g, { id: 'sborer' }, { i: j0, j: 0, k: s.lo + 2, dx: -1, dz: 0 });
    if (!f) return 'second rig refused: ' + JSON.stringify(SB.check(g, { i: j0, j: 0, k: s.lo + 2, dx: -1, dz: 0 }));
    const e2 = g.placeEntity('sborer', f, { quiet: true }); e2.pw = 1; R.give('frame:steel', 12); const keep = S().items; SB.act(g, e2, 'use', ''); SB.act(g, e2, 'use', '');
    const c0 = S().stats.collapses || 0;
    for (let t = 0; t < 120; t += 0.1) { s.e.pw = 1; e2.pw = 1; SB.tick(g, 0.1); ctx.stepSim(0.1, 0.1); if (s.e.bs === 'breach' && e2.bs === 'breach') break; if (s.e.bs === 'out') { R.give(s.kind, 12); SB.act(g, s.e, 'use', ''); } if (e2.bs === 'out') { R.give(s.kind, 12); SB.act(g, e2, 'use', ''); } }
    void keep;
    if (s.e.fa >= e2.fa) bad.push(`they met: ${s.e.fa} ${e2.fa}`); if (e2.fa - s.e.fa < 2) bad.push(`no wall left: ${e2.fa - s.e.fa} columns between`);
    if ((S().stats.collapses || 0) !== c0) bad.push('collapse'); if (s.e.bs !== 'breach' || e2.bs !== 'breach') bad.push(`states ${s.e.bs} ${e2.bs}`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('supportborer.stops-when-a-support-would-not-bear-the-mountain-or-has-no-room', async () => {
    const bad = [];
    // timber far too weak at 1,500 m: the strain test refuses it and the rig stops before the line
    let s = await R.scene({ dist: 800, cls: 0, mat: 'timber', first: true, block: true });
    load(s); start(s); R.run(s, 80, { until: () => s.e.bs === 'weak' || s.e.bs === 'room' || s.e.bs === 'out' });
    if (s.e.bs !== 'weak' && s.e.bs !== 'room') bad.push('weak: state ' + s.e.bs + ' ' + s.e.bwhy); if (s.e.placed) bad.push('weak: it set ' + s.e.placed);
    if (!(R.margin(s, s.i0 + 4, s.e.fa) >= 0)) bad.push('weak: overlong span');
    return bad.length === 0 || bad.join('; ');
  });

  await T('supportborer.idle-and-halted-cost-per-tick-is-under-0.05-ms', async () => {
    const s = await R.scene({ dist: 0, cls: 0 }); const bad = [];
    const time = (n) => { const t0 = performance.now(); for (let q = 0; q < n; q++) { s.e.pw = 1; SB.tick(g, 0.05); } return (performance.now() - t0) / n; };
    const stopped = time(4000);
    start(s); R.run(s, 40, { until: () => s.e.bs === 'out' }); const halted = time(4000);
    globalThis.__sbcost = { stopped: +stopped.toFixed(4), halted: +halted.toFixed(4) };
    if (!(stopped < 0.05)) bad.push(`stopped ${stopped.toFixed(4)} ms`); if (!(halted < 0.05)) bad.push(`halted ${halted.toFixed(4)} ms`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('supportborer.save-and-load-keeps-the-load-the-mode-and-the-progress', async () => {
    const s = await R.scene({ dist: 200, cls: 0, mat: 'steel', len: 40 }); load(s, 5); SB.act(g, s.e, 'use', ''); const bad = [];
    R.run(s, 8); const a = { sn: s.e.sn, sk: s.e.sk, cl: s.e.cl, sm: s.e.sm, sg: s.e.sg, on: s.e.on, fa: s.e.fa, placed: s.e.placed, steps: s.e.steps, bl: s.e.bl, i: s.e.i, k: s.e.k };
    g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) return 'save failed';
    const saved = loadSaved(); g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play'; await realSleep(50);
    const e = S().entities.find((q) => q.type === 'sborer'); if (!e) return 'rig not saved';
    const b = { sn: e.sn, sk: e.sk, cl: e.cl, sm: e.sm, sg: e.sg, on: e.on, fa: e.fa, placed: e.placed, steps: e.steps, bl: e.bl, i: e.i, k: e.k };
    if (JSON.stringify(a) !== JSON.stringify(b)) bad.push(`${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
    const it = g.machines.items.get(e.id); if (!it || !it.sb) bad.push('mesh not rebuilt');
    e.pw = 1; const fa = e.fa; for (let t = 0; t < 4; t += 0.1) { e.pw = 1; SB.tick(g, 0.1); } if (!(e.fa > fa)) bad.push('does not go on after a load: ' + e.bs);
    return bad.length === 0 || bad.join('; ');
  });
}
