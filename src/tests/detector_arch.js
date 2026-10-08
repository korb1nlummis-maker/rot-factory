// detector.*: the walk-through Detector Arch and the Giant Detector Arch (wave 7a). Sound tests stub game.sound the way dings.js does and assert the call sequences.
import { makeKit } from './addons_lib.js';
import * as D from '../detector.js';
import { PARTS, TYPES, CONFLICTS, DEMAND as CAT_DEMAND } from '../catalog.js';
import { infoFor, findInfoRef } from '../info.js';
import { species, RARITY, NEEDLE, pools } from '../plushdata.js';
import { recipes } from '../crafting.js';
import { upgradeById } from '../upgrades.js';

export default async function (ctx) {
  const { T, g, S, p, L, V3, fresh, adv, tiles, cellX, cellZ, toI, toK, realSleep } = ctx;
  const K = makeKit(ctx);
  const UP = { detector: 1, archGate: 1, archGiant: 1, power: 1, belts: 1 };
  const json = (m) => JSON.parse(JSON.stringify(m));
  const BAD = /undefined|NaN|\[object|Infinity/;
  const arches = () => [...g.machines.items.values()].map((it) => it.ent).filter((e) => e.type === 'arch');
  // an arch on the bay floor without the tool pipeline: size, axis, the cell along the walk and the lateral origin (cells)
  const mk = (size, x, z, axis = 'z', extra = {}) => {
    K.clearBay();
    const lat = axis === 'z' ? toI(x) : toK(z), m = axis === 'z' ? toK(z) : toI(x), S_ = D.SIZES[size];
    const l = D.layout(g, size, axis, m, lat - (S_.w / 2 - 1), 0); if (!l.ok) throw new Error('layout: ' + l.why);
    return g.placeEntity('arch', { ...l.ent, ...extra });
  };
  // stand before the arch and step into its plane (one crossing); returns nothing, the arch state and the sound stubs show what happened
  const walk = (e, o = {}) => {
    const { back = 1.5, lat = 0, y = 0 } = o, s = D.archState(e);
    if (!o.keep) { s.in = false; s.along = null; s.cd = 0; }
    p().vel.set(0, 0, 0);
    const at = (a) => (e.axis === 'z' ? [e.cx + lat, e.cz + a] : [e.cx + a, e.cz + lat]);
    let [x, z] = at(-back); p().pos.set(x, y, z); g.playerGateScan(0.05);
    [x, z] = at(0); p().pos.set(x, y, z); g.playerGateScan(0.05);
  };
  const rec = () => {
    const calls = [], keep = {}; for (const k of ['tone', 'noise', 'thump', 'found']) keep[k] = g.sound[k];
    g.sound.tone = (...a) => calls.push(['tone', ...a]); g.sound.noise = (...a) => calls.push(['noise', ...a]); g.sound.thump = (...a) => calls.push(['thump', ...a]); g.sound.found = (...a) => calls.push(['found', ...a]);
    return { calls, off: () => { for (const k of Object.keys(keep)) g.sound[k] = keep[k]; } };
  };
  const toneN = (r) => r.calls.filter((c) => c[0] === 'tone');
  const hint = () => document.getElementById('hint').textContent;
  const toasts = () => [...document.querySelectorAll('#toasts .toast')].map((x) => x.textContent);
  const guard = (name, fn) => T(name, async () => {
    const fn0 = g.foundNeedle, mode0 = g.mode;
    try { g.mode = 'play'; return await fn(); } finally { g.foundNeedle = fn0; g.mode = mode0 === 'ended' ? 'play' : mode0; S().found = false; S().ending = null; g.net.open = false; g.net.role = null; g.guestReady = false; delete g.netSend; g.stowed = true; g.rebuildTools(); g.cfgClip = null; if (g.ui.openModal) g.ui.closeModals(); }
  });
  const carry = (...items) => { S().carry = items.map((it) => (typeof it === 'number' ? { sp: it, vr: 0 } : it)); };
  const common = pools[0][0], rare = pools[2][0], epic = pools[3][0], mythic = pools[5].find((id) => !species[id].decoy);

  // ---------------------------------------------------------------- catalog, unlocks, bench
  await T('detector.catalog-registers-the-arch-with-unlocks-demand-and-no-conflicts', async () => {
    const bad = [];
    if (CONFLICTS.length) bad.push('catalog conflicts: ' + CONFLICTS.join('; '));
    if (!PARTS.detector.TYPES.arch || !TYPES.arch) bad.push('type arch not registered');
    const a = upgradeById('archGate'), b = upgradeById('archGiant');
    if (!a || a.cost[0] !== 120000 || !a.req || a.req.id !== 'detector') bad.push('archGate unlock: ' + JSON.stringify(a && [a.cost, a.req]));
    if (!b || b.cost[0] !== 3000000 || !b.req || b.req.id !== 'archGate') bad.push('archGiant unlock: ' + JSON.stringify(b && [b.cost, b.req]));
    for (const u of [a, b]) if (u && (BAD.test(u.name + u.desc) || /[–—]/.test(u.desc))) bad.push('bad text in ' + u.id);
    if (CAT_DEMAND.arch !== 1.5) bad.push('demand arch ' + CAT_DEMAND.arch);
    return bad.length === 0 || bad.join(' || ');
  });

  await T('detector.bench-rows-appear-with-the-unlocks-at-12000-and-220000', async () => {
    const bad = []; fresh({}); g.T = g.tune(); if (recipes(g).some((r) => r.kind === 'arch')) bad.push('arch recipes before any unlock');
    fresh({ detector: 1, archGate: 1 }); g.T = g.tune(); let ids = recipes(g).filter((r) => r.kind === 'arch').map((r) => r.id); if (ids.join() !== 'arch') bad.push('archGate gives ' + ids);
    const r1 = recipes(g).find((r) => r.id === 'arch'); if (!r1 || r1.price !== 12000 || !r1.p || r1.p.size !== 1 || !r1.use || BAD.test(r1.desc + r1.use + r1.status) || /[–—]/.test(r1.desc + r1.use)) bad.push('arch row ' + JSON.stringify(r1));
    fresh({ detector: 1, archGate: 1, archGiant: 1 }); g.T = g.tune(); ids = recipes(g).filter((r) => r.kind === 'arch').map((r) => r.id); if (ids.join() !== 'arch,archBig') bad.push('both unlocks give ' + ids);
    const r2 = recipes(g).find((r) => r.id === 'archBig'); if (!r2 || r2.price !== 220000 || r2.p.size !== 2) bad.push('giant row ' + JSON.stringify(r2 && [r2.price, r2.p]));
    // the bench charges exactly the card price
    S().money = 1e9; const m0 = S().money; g.craftItem('arch', 2); g.craftItem('archBig', 1);
    if (S().items.arch !== 2 || S().items.archBig !== 1 || m0 - S().money !== 2 * 12000 + 220000) bad.push(`crafted ${S().items.arch}/${S().items.archBig}, paid ${m0 - S().money}`);
    return bad.length === 0 || bad.join(' || ');
  });

  await T('detector.walk-in-arch-needs-the-gate-first-in-the-upgrade-tree', async () => {
    const bad = []; fresh({ detector: 0 }); S().money = 1e12; S().stats.plush = 1e9;
    const u = upgradeById('archGate'); if (!u) return 'missing';
    const { isUnlocked } = await import('../upgrades.js'); if (isUnlocked(u, { detector: 0 }, S())) bad.push('unlocked without the Detector Gate');
    if (!isUnlocked(u, { detector: 1 }, S())) bad.push('locked with the Detector Gate');
    if (isUnlocked(upgradeById('archGiant'), { detector: 1 }, S())) bad.push('giant unlocked without the arch');
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- placement
  await guard('detector.tool-sets-down-both-sizes-facing-the-walk-and-the-hammer-hands-them-back', async () => {
    fresh(UP); const bad = [];
    for (const [id, size, axis, dir] of [['arch', 1, 'x', 0], ['arch', 1, 'z', 1], ['archBig', 2, 'z', 1]]) {
      const x = -9 + size * 1.2, z = 3.0 - (axis === 'x' ? 3 : 0);
      const r = await K.put(id, { x, z, dir, back: 2.2 }); if (!r.ok) { bad.push(`${id} ${axis}: ${r.why}`); continue; }
      const e = r.ent, S_ = D.SIZES[size];
      if (e.type !== 'arch' || e.size !== size || e.axis !== axis) bad.push(`${id}: ${JSON.stringify([e.type, e.size, e.axis])}`);
      if (Math.abs(e.w - (S_.w * 0.6 - 0.04)) > 1e-6 || Math.abs(e.h - (S_.h * 0.6 - 0.02)) > 1e-6) bad.push(`${id}: size ${e.w} x ${e.h}`);
      if (e.mode !== 'one' || e.volume !== 0.7 || e.quiet !== false) bad.push(`${id}: defaults ${e.mode} ${e.volume} ${e.quiet}`);
      if (r.consumed !== 1) bad.push(`${id}: consumed ${r.consumed}`);
      const it = g.machines.items.get(e.id); if (!it || !it.obj || it.obj.children.length < 3) bad.push(`${id}: no mesh`);
      if (it && (Math.abs(it.obj.position.x - e.cx) > 1e-6 || Math.abs(it.obj.rotation.y - e.yaw) > 1e-6)) bad.push(`${id}: mesh not at the ent`);
      g.doDecon({ kind: 'mach', id: e.id }); if (g.machines.items.has(e.id) || S().entities.some((x) => x.id === e.id)) bad.push(`${id}: hammer left it`);
      if (S().items[id] !== 1) bad.push(`${id}: hammer gave ${JSON.stringify(S().items)}`); S().items = {};
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.placement-refuses-plush-in-the-section-overlap-and-wrong-tools', async () => {
    fresh(UP); const bad = []; K.clearBay();
    const a = mk(1, -7.2, 4.2, 'z'), w = g.world;
    // plush in the section: refused with a count
    const c = [toI(a.cx), 1, toK(a.cz)]; w.setCell(c[0], c[1], c[2], 2, 0);
    try {
      S().items.arch = 1; K.equip('arch'); K.aimDir(a.cx + 0.3, 0, a.cz, 1, 2.0); let pl = await ctx.plan();
      if (pl.ok || !/Dig this section out first|already here/.test(pl.why || '')) bad.push('plan over plush/arch: ' + JSON.stringify([pl.ok, pl.why]));
    } finally { w.setCell(c[0], c[1], c[2], 0, 0); }
    // a second arch on top of the first is refused, one a few metres away is fine
    const l = D.layout(g, 1, 'z', toK(a.cz), toI(a.cx) - 1, 0); if (l.ok || !/another arch/i.test(l.why)) bad.push('overlap not refused: ' + JSON.stringify(l.why));
    const far = D.layout(g, 1, 'z', toK(a.cz) + 4, toI(a.cx) - 1, 0); if (!far.ok) bad.push('a clear spot 4 cells on was refused: ' + far.why);
    // the host re-checks a guest's request: wrong item id, a belt used as an arch, junk numbers
    for (const [tool, e, why] of [[{ id: 'belt', kind: 'arch' }, a, 'item id belt'], [{ id: 'arch', kind: 'arch' }, null, 'no ent'], [{ id: 'arch', kind: 'arch' }, { axis: 'q', gm: 1, glo: 1, gj: 0 }, 'bad axis'], [{ id: 'arch', kind: 'arch' }, { axis: 'x', gm: 1.5, glo: 1, gj: 0 }, 'fraction'], [{ id: 'arch', kind: 'arch' }, { axis: 'x', gm: 'a', glo: 1, gj: 0 }, 'string'], [{ id: 'arch', kind: 'arch' }, { axis: 'x', gm: -5, glo: 1, gj: 0 }, 'outside the hall'], [{ id: 'arch', kind: 'arch' }, { axis: 'z', gm: toK(a.cz), glo: toI(a.cx) - 1, gj: 0 }, 'overlap']]) {
      if (!g.placeConflict(tool, e)) bad.push('host accepted ' + why);
    }
    if (g.placeConflict({ id: 'arch', kind: 'arch' }, { axis: 'z', gm: toK(a.cz) + 4, glo: toI(a.cx) - 1, gj: 0 })) bad.push('host refused a clean request');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.the-giant-needs-a-clear-8x7-section-and-the-walk-in-needs-both-legs-on-floor', async () => {
    fresh(UP); const bad = []; K.clearBay(); const w = g.world, i0 = toI(-8), k0 = toK(1);
    const g1 = D.layout(g, 2, 'z', k0, i0 - 3, 0); if (!g1.ok) bad.push('clear giant refused: ' + g1.why);
    w.setCell(i0 + 3, 6, k0, 2, 0); try { const g2 = D.layout(g, 2, 'z', k0, i0 - 3, 0); if (g2.ok || !/1 plush in the way/.test(g2.why)) bad.push('top row plush not noticed: ' + g2.why); } finally { w.setCell(i0 + 3, 6, k0, 0, 0); }
    // a ledge: floor at j 1 under one leg only
    const l = D.layout(g, 1, 'z', k0 + 6, i0, 1); if (l.ok || !/solid floor/.test(l.why)) bad.push('floating arch allowed: ' + JSON.stringify(l.why));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.the-small-arch-snaps-in-line-with-a-frame', async () => {
    fresh(UP); const bad = []; K.clearBay();
    const m = toI(-6), lo = toK(3) - 1, f = { id: g.nextId(), type: 'frame', kind: 'steel', axis: 'x', cx: cellX(m), cz: cellZ(lo) + 0.9, y0: 0, w: 2.36, h: 2.38, gm: m, glo: lo, gj: 0, yaw: Math.PI / 2 };
    S().entities.push(f); g.addEntity(f);
    S().items.arch = 1; K.equip('arch'); K.aimDir(cellX(m + 3), 0, cellZ(lo + 2), 0, 2.2); await ctx.plan(); const pl = g.plan;
    if (!pl || !pl.ok || pl.ent.axis !== 'x' || pl.ent.glo !== lo || pl.ent.gm !== m + 3 || pl.ent.gj !== 0 || !/frames/.test(pl.ent.snap || '')) bad.push('no snap: ' + JSON.stringify(pl && [pl.ok, pl.why, pl.ent && [pl.ent.axis, pl.ent.glo, pl.ent.gm, pl.ent.snap]]));
    // facing the other way it still takes the frame's axis (the arch follows the tunnel, not the camera)
    K.aimDir(cellX(m + 3), 0, cellZ(lo + 2), 1, 2.2); await ctx.plan(); if (!g.plan || !g.plan.ent || g.plan.ent.axis !== 'x') bad.push('camera yaw beat the frame');
    // the giant never snaps
    S().items.archBig = 1; K.equip('archBig'); K.aimDir(cellX(m + 3), 0, cellZ(lo + 2), 0, 2.2); await ctx.plan(); if (g.plan && g.plan.ent && g.plan.ent.snap) bad.push('giant snapped');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.giant-clears-truck-width-and-the-small-one-does-not', async () => {
    fresh(UP); const a = mk(1, -7.2, 3.0), b = mk(2, -7.2, 7.0), bad = [];
    // a Haul Truck needs 3 x 3 cells plus a cell of margin each way (4 x 4); a cart is under 2 cells wide
    const truck = { w: 4, h: 4 };
    if (b.clear.w < truck.w || b.clear.h < truck.h) bad.push('giant clear ' + JSON.stringify(b.clear));
    if (a.clear.w >= truck.w || a.clear.h >= truck.h) bad.push('small arch claims truck width ' + JSON.stringify(a.clear));
    if (a.clear.w < 2 || a.clear.h < 3) bad.push('small arch too tight for a cart ' + JSON.stringify(a.clear));
    if (JSON.stringify(D.archClear(b)) !== JSON.stringify(b.clear)) bad.push('archClear and ent.clear disagree');
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- the crossing
  await guard('detector.arch-one-mode-wins-and-plays-found', async () => {
    fresh(UP); const e = mk(1, -7.2, 3.0), bad = [], r = rec(); let won = null, ding = null; const real = g.foundNeedle.bind(g);
    carry(common, NEEDLE);
    let said = ''; const t0 = g.ui.toast.bind(g.ui), titles = []; g.ui.toast = (o) => { titles.push(o.title); return t0(o); };
    try { walk(e); ding = toneN(r).slice(); said = titles.join('|') + ' ' + hint(); } finally { g.ui.toast = t0; }
    if (!S().found || S().ending !== 'plush' || g.mode !== 'ended') bad.push(`win flow did not run at once: found ${S().found} ending ${S().ending} mode ${g.mode}`);
    if (!ding.some((c) => c[1] === 'triangle' && c[2] === 659) || !ding.some((c) => c[1] === 'triangle' && c[2] === 988)) bad.push('no da-ding: ' + JSON.stringify(ding));
    if (r.calls.some((c) => c[0] === 'found')) bad.push('the fanfare was not delayed');
    await realSleep(250); if (r.calls.some((c) => c[0] === 'found')) bad.push('the fanfare came before half a second');
    await realSleep(450); const fan = r.calls.filter((c) => c[0] === 'found').length; r.off();
    if (fan !== 1) bad.push('fanfare after half a second: ' + fan);
    void won; void real;
    if (!/MATCH: Il Rotto Supremo/.test(said) || !/THE ONE/.test(said)) bad.push('no match message: ' + said);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.one-mode-ignores-everything-but-the-one', async () => {
    fresh(UP); const e = mk(1, -7.2, 3.0), bad = []; let wins = 0; g.foundNeedle = () => { wins++; };
    carry(common, rare, mythic, { sp: common, vr: 128 }); walk(e);
    if (wins) bad.push('won without the One'); if (D.archState(e).last.kind !== 'bad') bad.push('kind ' + D.archState(e).last.kind);
    // a gold fake is not the One
    const dec = species.findIndex((s) => s && s.decoy); carry(dec); walk(e); if (wins) bad.push('a decoy won');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.not-found-buzz-only-with-plush', async () => {
    fresh(UP); const e = mk(1, -7.2, 3.0), bad = []; carry(common, rare); const r = rec();
    try { walk(e); } finally { r.off(); }
    const t = toneN(r);
    if (t.length !== 3 || t[0][1] !== 'square' || t[1][1] !== 'square' || t[2][1] !== 'sawtooth' || t[0][2] !== 150 || t[0][3] !== 110 || t[2][2] !== 120 || t[2][3] !== 85) bad.push('buzz tones: ' + JSON.stringify(t));
    if (t[2] && Math.abs(t[2][6] - 0.2) > 1e-9) bad.push('saw at +0.2 s expected: ' + t[2][6]);
    if (!r.calls.some((c) => c[0] === 'noise' && c[2] === 300 && c[3] === 300 && c[5] === 'bandpass')) bad.push('no band-passed 300 Hz noise');
    if (r.calls.some((c) => c[0] === 'thump')) bad.push('a small arch thumped');
    if (!/NOT FOUND/.test(hint()) || !/The One/.test(hint())) bad.push('hint: ' + hint());
    // the volume stays soft
    for (const c of t) if (c[5] > 0.1) bad.push('too loud: ' + c[5]);
    if (g.S.stats.scans === undefined) bad.push('no scan count');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.empty-bag-quiet-tick', async () => {
    fresh(UP); const e = mk(1, -7.2, 3.0), bad = []; carry(); const r = rec(); g.ui.hint('', 0);
    try { walk(e); } finally { r.off(); }
    const t = toneN(r); if (t.length !== 1 || t[0][1] !== 'sine' || t[0][2] !== 700 || t[0][3] !== 700 || t[0][5] > 0.04) bad.push('tick: ' + JSON.stringify(t));
    if (r.calls.length !== 1) bad.push('more than a tick: ' + JSON.stringify(r.calls));
    if (/NOT FOUND/.test(hint())) bad.push('an empty bag was insulted');
    if (D.archState(e).last.kind !== 'tick') bad.push('state ' + D.archState(e).last.kind);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.species-mode-matches-exact-id', async () => {
    fresh(UP); const e = mk(1, -7.2, 3.0), bad = [];
    const other = pools[1].find((id) => id !== pools[1][0]) || pools[1][1];
    if (!g.setCfg(e, { mode: 'species', target: pools[1][0] }).ok) return 'could not set species mode';
    let r = rec(); carry(common, other, pools[1][0]); try { walk(e); } finally { r.off(); }
    const ok = toneN(r); if (!ok.some((c) => c[2] === 988) || ok.some((c) => c[1] === 'square')) bad.push('exact species did not ding: ' + JSON.stringify(ok.map((c) => c.slice(1, 4))));
    if (!toasts().join('|').includes(species[pools[1][0]].name)) bad.push('toast lacks the species name');
    r = rec(); carry(common, other); try { walk(e); } finally { r.off(); }
    if (!toneN(r).some((c) => c[1] === 'square')) bad.push('a different species did not buzz');
    if (!/NOT FOUND/.test(hint()) || !hint().includes(species[pools[1][0]].name)) bad.push('hint should name the target: ' + hint());
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.rarity-threshold-and-exact', async () => {
    fresh(UP); const e = mk(1, -7.2, 3.0), bad = [];
    const hit = (items) => { carry(...items); const r = rec(); try { walk(e); } finally { r.off(); } return D.archState(e).last.kind; };
    g.setCfg(e, { mode: 'rarity', rarity: 2 });
    if (hit([common]) !== 'bad') bad.push('common matched rare+');
    if (hit([rare]) !== 'ok') bad.push('rare missed rare+'); if (hit([common, epic]) !== 'ok') bad.push('epic missed rare+'); if (hit([mythic]) !== 'ok') bad.push('mythic missed rare+');
    g.setCfg(e, { exact: true });
    if (hit([epic]) !== 'bad') bad.push('epic matched rare only'); if (hit([rare, epic]) !== 'ok') bad.push('exact rare missed');
    g.setCfg(e, { exact: false, rarity: 5 });
    if (hit([epic]) !== 'bad' || hit([mythic]) !== 'ok') bad.push('mythic threshold');
    g.setCfg(e, { rarity: 0 }); if (hit([common]) !== 'ok') bad.push('common+ should match anything');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.fresh-mode-uses-dex', async () => {
    fresh(UP); const e = mk(1, -7.2, 3.0), bad = []; g.setCfg(e, { mode: 'fresh' });
    const hit = (sp) => { carry(sp); const r = rec(); try { walk(e); } finally { r.off(); } return D.archState(e).last.kind; };
    S().dex = {}; if (hit(common) !== 'ok') bad.push('never handled species missed');
    S().dex[common] = 1; if (hit(common) !== 'ok') bad.push('a species handled once (this plush) missed');
    S().dex[common] = 2; if (hit(common) !== 'bad') bad.push('a species met twice matched');
    S().dex[rare] = 40; if (hit(rare) !== 'bad') bad.push('a well known species matched');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.variant-mode-matches-shiny-only', async () => {
    fresh(UP); const e = mk(1, -7.2, 3.0), bad = []; g.setCfg(e, { mode: 'variant' });
    const hit = (...items) => { carry(...items); const r = rec(); try { walk(e); } finally { r.off(); } return D.archState(e).last.kind; };
    if (hit({ sp: common, vr: 5 }) !== 'bad') bad.push('plain shade matched'); if (hit({ sp: common, vr: 128 + 5 }) !== 'ok') bad.push('shiny missed'); if (hit({ sp: common, vr: 0 }, { sp: rare, vr: 128 }) !== 'ok') bad.push('shiny in a mixed bag missed');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.cart-load-scanned-in-range', async () => {
    fresh(UP); const e = mk(1, -7.2, 3.0), bad = []; g.setCfg(e, { mode: 'species', target: rare });
    const cart = (dx) => { S().cart = { tier: 2, x: e.cx + dx, y: 0, z: e.cz, yaw: 0, mode: 'stay', load: [{ sp: rare, vr: 0 }, { sp: common, vr: 0 }] }; };
    carry(common); cart(3); let r = rec(); try { walk(e); } finally { r.off(); }
    if (D.archState(e).last.kind !== 'ok' || D.archState(e).last.n !== 3) bad.push('cart within 4 m not scanned: ' + JSON.stringify(D.archState(e).last));
    cart(5); r = rec(); try { walk(e); } finally { r.off(); }
    if (D.archState(e).last.kind !== 'bad' || D.archState(e).last.n !== 1) bad.push('cart at 5 m scanned: ' + JSON.stringify(D.archState(e).last));
    S().cart = null; carry(); r = rec(); cart(1); try { walk(e); } finally { r.off(); } if (D.archState(e).last.kind === 'tick') bad.push('a loaded cart with empty hands is not an empty bag');
    // the giant reaches further (6 m)
    const big = mk(2, -7.2, 8.0); g.setCfg(big, { mode: 'species', target: rare }); S().cart = { tier: 2, x: big.cx + 5, y: 0, z: big.cz, yaw: 0, mode: 'stay', load: [{ sp: rare, vr: 0 }] }; carry(common); r = rec(); try { walk(big); } finally { r.off(); }
    if (D.archState(big).last.kind !== 'ok') bad.push('giant did not scan a cart at 5 m'); S().cart = null;
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.cooldown-once-per-crossing', async () => {
    fresh(UP); const e = mk(1, -7.2, 3.0), bad = []; carry(common); const r = rec(), s0 = S().stats.scans || 0;
    try {
      walk(e); const n1 = toneN(r).length;
      // still standing in the plane next frames: nothing more
      for (let q = 0; q < 5; q++) g.playerGateScan(0.05); if (toneN(r).length !== n1) bad.push('fired while standing in it');
      // leave and step in again inside 0.6 s: refused; after it: fires
      p().pos.set(e.cx, 0, e.cz - 2); g.playerGateScan(0.05); p().pos.set(e.cx, 0, e.cz); g.playerGateScan(0.05); if (toneN(r).length !== n1) bad.push('a second crossing inside 0.6 s fired');
      adv(0.7, 0.05); p().pos.set(e.cx, 0, e.cz - 2); g.playerGateScan(0.05); p().pos.set(e.cx, 0, e.cz); g.playerGateScan(0.05); if (toneN(r).length <= n1) bad.push('the next crossing after the cooldown did not fire');
    } finally { r.off(); }
    if ((S().stats.scans || 0) - s0 !== 2) bad.push('scan count ' + ((S().stats.scans || 0) - s0));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.only-through-the-opening-counts-and-a-fast-step-is-caught', async () => {
    fresh(UP); const e = mk(1, -7.2, 3.0), bad = []; carry(common); let r = rec();
    try {
      walk(e, { lat: 1.6 }); if (toneN(r).length) bad.push('walking past the pylon fired');   // opening is 2.36 wide: 1.6 m off centre is outside
      walk(e, { y: 3.2 }); if (toneN(r).length) bad.push('flying above the arch fired');
      walk(e, { back: 40 }); // far: should fire when reaching the plane from 40 m (a teleport counts as arriving)
    } finally { r.off(); }
    // a big jump over the plane in one frame (back 1.0 then 1.0 beyond)
    const s = D.archState(e); s.in = false; s.along = null; s.cd = 0; r = rec(); p().pos.set(e.cx, 0, e.cz - 1.0); g.playerGateScan(0.05); p().pos.set(e.cx, 0, e.cz + 1.0); g.playerGateScan(0.05); r.off();
    if (!toneN(r).length) bad.push('a fast step across the plane was missed');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.crossing-works-for-both-axes', async () => {
    fresh(UP); const bad = [];
    for (const axis of ['x', 'z']) { const e = mk(1, -7.2 + (axis === 'x' ? 0 : 3), 3.0 + (axis === 'x' ? 0 : 4), axis); carry(common); const r = rec(); try { walk(e); } finally { r.off(); } if (D.archState(e).last.kind !== 'bad') bad.push(axis + ': ' + JSON.stringify(D.archState(e).last)); g.doDecon({ kind: 'mach', id: e.id }); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.crossing-needs-play-mode', async () => {
    fresh(UP); const e = mk(1, -7.2, 3.0), bad = []; carry(common); g.mode = 'title'; const r = rec(); try { walk(e); } finally { r.off(); g.mode = 'play'; }
    if (r.calls.length) bad.push('a title screen walk made a sound'); return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.belt-gate-still-works-beside-the-arch', async () => {
    fresh(UP); const gate = tiles().find((t) => t.type === 'belt' && t.detector), bad = []; if (!gate) return 'no free gate';
    carry(common); const s0 = S().stats.scans || 0; gate._pIn = false; g._gateCd = 0; p().pos.set(cellX(gate.i), gate.j * 0.6, cellZ(gate.k) - 1.5); g.playerGateScan(0.05); p().pos.set(cellX(gate.i), gate.j * 0.6, cellZ(gate.k)); g.playerGateScan(0.05);
    if ((S().stats.scans || 0) - s0 !== 1) bad.push('gate scans ' + ((S().stats.scans || 0) - s0)); return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- sounds
  await T('detector.sound-methods-play-the-spec-sequences', async () => {
    const bad = [], r = rec();
    try {
      g.sound.archFound(0.1); const f = r.calls.map((c) => c.slice(0, 6)); r.calls.length = 0;
      g.sound.archNotFound(0.1, true); const n = r.calls.map((c) => c.slice(0, 7)); r.calls.length = 0; g.sound.archNotFound(0.1, false); const small = r.calls.map((c) => c[0]); r.calls.length = 0; g.sound.archTick(0.1); const t = r.calls.map((c) => c.slice(0, 6));
      if (f.length !== 4 || f[0][1] !== 'triangle' || f[0][2] !== 659 || f[0][5] !== 0.1 || f[1][1] !== 'triangle' || f[1][2] !== 988 || Math.abs(f[1][5] - 0.12) > 1e-9 || f[1][4] !== 0.7 || f[2][1] !== 'sine' || Math.abs(f[2][2] - 988 * 2.01) > 1e-6 || f[3][2] !== 1976) bad.push('da-ding: ' + JSON.stringify(f));
      if (!n.some((c) => c[0] === 'thump' && c[2] === 70) || n.filter((c) => c[0] === 'tone').length !== 3 || n.filter((c) => c[0] === 'noise').length !== 1) bad.push('giant buzz: ' + JSON.stringify(n));
      if (small.includes('thump')) bad.push('small buzz thumped');
      if (t.length !== 1 || t[0][2] !== 700) bad.push('tick: ' + JSON.stringify(t));
    } finally { r.off(); }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.volume-follows-the-setting-the-distance-and-the-giant-boost-and-quiet-mutes-only-the-buzz', async () => {
    fresh(UP); const a = mk(1, -7.2, 3.0), b = mk(2, -7.2, 9.0), bad = [];
    p().pos.set(a.cx, 0, a.cz - 1); const v1 = D.volumeFor(g, a), v2 = D.volumeFor(g, b);
    if (Math.abs(v1 - 0.07) > 1e-9) bad.push('default volume ' + v1); if (Math.abs(v2 / D.volumeFor(g, { ...b, cx: a.cx, cz: a.cz, size: 1 }) - 1.5) > 1e-6 && Math.abs(v2 - 0.105) > 1e-6) bad.push('giant is not 1.5x: ' + v2);
    a.volume = 0; if (D.volumeFor(g, a) !== 0) bad.push('volume 0 is not silent'); a.volume = 1; if (Math.abs(D.volumeFor(g, a) - 0.1) > 1e-9) bad.push('volume 1 ' + D.volumeFor(g, a));
    p().pos.set(a.cx + 8, 0, a.cz); const near = D.volumeFor(g, a); p().pos.set(a.cx + 34, 0, a.cz); const mid = D.volumeFor(g, a); p().pos.set(a.cx + 61, 0, a.cz); const far = D.volumeFor(g, a);
    if (Math.abs(near - 0.1) > 1e-9 || !(mid > 0 && mid < near) || far !== 0) bad.push(`distance ${near} ${mid} ${far}`);
    // quiet: no buzz, the da-ding stays
    a.volume = 0.7; a.quiet = true; carry(common); let r = rec(); try { walk(a); } finally { r.off(); } if (toneN(r).length) bad.push('quiet arch buzzed');
    g.setCfg(a, { mode: 'species', target: common }); r = rec(); try { walk(a); } finally { r.off(); } if (!toneN(r).some((c) => c[2] === 988)) bad.push('quiet arch lost the da-ding');
    // too far to hear: nothing at all
    a.quiet = false; a.mode = 'one'; carry(common); p().vel.set(0, 0, 0); const s = D.archState(a); s.cd = 0; s.in = false; r = rec(); D.react(g, a, 'bad', { mine: false }); const heard = r.calls.length; p().pos.set(a.cx + 70, 0, a.cz); r.calls.length = 0; D.react(g, a, 'bad', { mine: false }); r.off(); if (!heard || r.calls.length) bad.push(`heard ${heard}, far ${r.calls.length}`);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.the-giant-adds-a-low-thunk-under-the-buzz', async () => {
    fresh(UP); const b = mk(2, -7.2, 7.0), bad = []; carry(common); const r = rec(); try { walk(b); } finally { r.off(); }
    if (!r.calls.some((c) => c[0] === 'thump' && c[2] === 70)) bad.push('no thump: ' + JSON.stringify(r.calls.map((c) => c[0])));
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- power and lamps
  await guard('detector.unpowered-still-scans-player-but-the-lamps-stay-dark', async () => {
    fresh(UP); const e = mk(1, -7.2, 3.0), bad = []; carry(common); let r = rec(); const col = () => e && g.machines.items.get(e.id).arch.lamps.map((m) => m.color.getHex());
    try { walk(e); adv(0.1, 0.05); } finally { r.off(); }
    if (!toneN(r).length || D.archState(e).last.kind !== 'bad') bad.push('an unpowered arch did not scan the player');
    if (D.archState(e).powered) bad.push('powered with no pole'); if (col().some((c) => c !== 0x222222)) bad.push('lamps lit without power: ' + col());
    const info = infoFor(g, { kind: 'mach', id: e.id }); if (!/No power/.test(info.lines.join(' ')) || info.lit !== false) bad.push('readout does not say no power');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.a-pole-with-a-fed-generator-lights-the-lamps-and-they-flash-red-then-green', async () => {
    fresh(UP); const bad = []; K.clearBay();
    const gen = await K.put('gen', { x: -9, z: -1.2, dir: 0 }), pole = await K.put('pole', { x: -9, z: 1.2, dir: 0 }); if (!gen.ok || !pole.ok) return 'rig: ' + (gen.why || pole.why);
    K.feedGen(K.tileOf(gen.ent), 12);
    const e = mk(1, -9, 3.6); g.power.markDirty(); g.power.update(0.1); adv(1.0, 0.05);
    const lamps = () => g.machines.items.get(e.id).arch.lamps.map((m) => m.color.getHex());
    if (!D.archState(e).powered) return 'not powered next to a pole: nets ' + g.power.nets.length;
    if (lamps().some((c) => c !== 0x2e8c4a)) bad.push('idle lamps ' + lamps());
    carry(common); walk(e); D.archState(e).flash = 0.95 - 0.05; adv(0.01, 0.01); const red = lamps(); if (!red.some((c) => c === 0xff3322)) bad.push('no red pulse: ' + red);
    g.setCfg(e, { mode: 'species', target: common }); walk(e); adv(0.01, 0.01); const grn = lamps(); if (!grn.some((c) => c === 0x45ff7a || c === 0xffd24a)) bad.push('no green and gold: ' + grn);
    adv(2.0, 0.05); if (lamps().some((c) => c !== 0x2e8c4a)) bad.push('lamps did not settle: ' + lamps());
    const info = infoFor(g, { kind: 'mach', id: e.id }); if (!/Powered/.test(info.lines.join(' ')) || info.lit !== true) bad.push('readout does not say powered');
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- settings
  await guard('detector.cfg-whitelist-targets-and-copy-paste', async () => {
    fresh(UP); const a = mk(1, -7.2, 3.0), b = mk(1, -7.2, 7.0), bad = [];
    for (const [patch, why] of [[{ mode: 'bogus' }, 'bad mode'], [{ target: -1 }, 'negative target'], [{ target: 99999 }, 'huge target'], [{ target: 1.5 }, 'fraction'], [{ rarity: 6 }, 'rarity 6'], [{ volume: 2 }, 'volume 2'], [{ quiet: 'yes' }, 'string bool'], [{ evil: 1 }, 'unknown'], [{ mode: 'species' }, 'species without a target'], [{ target: 59000 }, 'no such species'], [{ cx: 5 }, 'position'], [{ size: 2 }, 'size'], [{ mode: 'rarity', evil: 1 }, 'half valid']]) {
      const r = g.setCfg(a, patch); if (r.ok) bad.push(why + ' accepted'); }
    if (a.mode !== 'one' || a.cx === 5 || a.size !== 1) bad.push('a refused patch changed something: ' + a.mode);
    if (!g.setCfg(a, { mode: 'species', target: common, volume: 0.25, quiet: true }).ok || a.mode !== 'species' || a.target !== common || a.volume !== 0.25 || !a.quiet) bad.push('a clean patch failed');
    g.copyCfg(a); if (!g.cfgClip || g.cfgClip.group !== 'arch') bad.push('copy group'); const r = g.pasteCfg(b); if (!r.ok || b.mode !== 'species' || b.target !== common || b.volume !== 0.25) bad.push('paste: ' + JSON.stringify([r, b.mode, b.target]));
    // the giant pastes from the small arch too (same group), and a sorter does not take arch settings
    const c = mk(2, -7.2, 11.0); if (!g.pasteCfg(c).ok || c.mode !== 'species') bad.push('giant did not take the paste');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.species-picker-lists-the-dex-and-the-contract-species-only', async () => {
    fresh(UP); S().dex = { [rare]: 3, [common]: 1, [epic]: 9 }; S().contracts = [{ kind: 'species', sp: mythic, need: 2 }, { kind: 'rarity', r: 2 }];
    const ids = D.speciesChoices(g).map((o) => o.id), bad = [];
    if (ids[0] !== mythic || !D.speciesChoices(g)[0].contract) bad.push('contract species not first: ' + ids);
    if (ids.length !== 4 || ids.includes(NEEDLE)) bad.push('list ' + ids);
    if (ids.indexOf(epic) > ids.indexOf(rare) || ids.indexOf(rare) > ids.indexOf(common)) bad.push('not sorted by rarity: ' + ids);
    const f = D.speciesChoices(g, species[rare].name.slice(0, 5).toLowerCase()).map((o) => o.id); if (!f.includes(rare)) bad.push('filter by name');
    if (D.speciesChoices(g, 'zzzzzzzz').length) bad.push('filter matched junk');
    S().contracts = [];
    return bad.length === 0 || bad.join(' || ');
  });

  // ---------------------------------------------------------------- readout, panel, save
  await guard('detector.hover-readout-names-the-arch-target-power-and-last-scan', async () => {
    fresh(UP); const a = mk(1, -7.2, 3.0), b = mk(2, -7.2, 8.0), bad = [];
    for (const e of [a, b]) {
      K.equip('hammer'); K.aimDir(e.cx, e.y0 + e.h / 2, e.cz, e.axis === 'x' ? 0 : 1, 2.0); adv(0.05); g.renderer.camera.position.copy(p().eyePos(new V3()));
      const ref = findInfoRef(g); if (!ref || ref.id !== e.id) { bad.push('aiming at it finds ' + JSON.stringify(ref)); continue; }
      const info = infoFor(g, ref), text = [info.title, ...info.lines].join(' | ');
      if (BAD.test(text) || /[–—]/.test(text)) bad.push('bad text: ' + text);
      if (!/DETECTOR ARCH/.test(info.title) || (e === b) !== /GIANT/.test(info.title)) bad.push('title ' + info.title);
      if (!/Looking for: The One/.test(text) || !/E picks the target/.test(text) || !/Nothing scanned yet/.test(text)) bad.push('lines: ' + text);
    }
    g.setCfg(a, { mode: 'rarity', rarity: 4, exact: false }); carry(common); walk(a); const t = infoFor(g, { kind: 'mach', id: a.id }).lines.join(' | ');
    if (!/Legendary or better/.test(t) || !/Last scan 0 s ago: not found \(1 plush\)/.test(t)) bad.push('after a scan: ' + t);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.E-opens-the-panel-and-the-buttons-set-the-target', async () => {
    fresh(UP); const e = mk(1, -7.2, 3.0), bad = []; S().dex = { [rare]: 3, [common]: 1 };
    K.equip('hammer'); K.aimDir(e.cx, e.y0 + e.h / 2, e.cz, 1, 2.0); adv(0.05); g.renderer.camera.position.copy(p().eyePos(new V3()));
    g.useKey(); const el = document.getElementById('archPanel'); if (!el || el.classList.contains('hidden') || g.ui.openModal !== 'archPanel') return 'E did not open the panel';
    const btn = (m) => el.querySelector(`#archModes button[data-mode="${m}"]`);
    if (el.querySelectorAll('#archModes button').length !== 5) bad.push('mode buttons');
    if (!/The One/.test(el.querySelector('#archNow').textContent)) bad.push('now line');
    btn('rarity').click(); if (e.mode !== 'rarity') bad.push('rarity button'); const sel = el.querySelector('#archRar'); if (!sel) bad.push('no rarity picker'); else { sel.value = '3'; sel.dispatchEvent(new Event('change')); if (e.rarity !== 3) bad.push('rarity picker ' + e.rarity); }
    el.querySelector('#archExact').checked = true; el.querySelector('#archExact').dispatchEvent(new Event('change')); if (!e.exact) bad.push('exact toggle');
    btn('fresh').click(); if (e.mode !== 'fresh') bad.push('fresh button'); btn('variant').click(); if (e.mode !== 'variant') bad.push('variant button');
    // species with no target yet only opens the list; picking a row sets it
    btn('species').click(); if (e.mode === 'species') bad.push('species mode set before a pick'); const rows = el.querySelectorAll('#archList button[data-sp]'); if (rows.length !== 2) bad.push('species rows ' + rows.length);
    el.querySelector('#archFilter').value = species[rare].name.slice(0, 4); el.querySelector('#archFilter').dispatchEvent(new Event('input')); if (![...el.querySelectorAll('#archList button[data-sp]')].some((b) => +b.dataset.sp === rare)) bad.push('filter dropped the match');
    [...el.querySelectorAll('#archList button[data-sp]')].find((b) => +b.dataset.sp === rare).click(); if (e.mode !== 'species' || e.target !== rare) bad.push('row click: ' + e.mode + ' ' + e.target);
    const vol = el.querySelector('#archVol'); vol.value = '30'; vol.dispatchEvent(new Event('change')); if (Math.abs(e.volume - 0.3) > 1e-9) bad.push('volume slider ' + e.volume);
    const q = el.querySelector('#archQuiet'); q.checked = true; q.dispatchEvent(new Event('change')); if (!e.quiet) bad.push('quiet box');
    g.ui.closeModals(); if (!el.classList.contains('hidden')) bad.push('did not close');
    // Esc closes it too
    g.useKey(); document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); if (g.ui.openModal === 'archPanel') bad.push('Esc did not close');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.panel-text-has-no-markup-from-names-and-typing-in-it-does-not-reach-the-game', async () => {
    fresh(UP); const e = mk(1, -7.2, 3.0), bad = []; S().dex = { [rare]: 3 }; D.use(g, e);
    const f = document.getElementById('archFilter'); document.querySelector('#archModes button[data-mode="species"]').click();
    const f2 = document.getElementById('archFilter'); void f;
    let reached = 0; const h = () => { reached++; }; window.addEventListener('keydown', h);
    try { f2.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', bubbles: true })); } finally { window.removeEventListener('keydown', h); }
    if (reached) bad.push('a key typed in the filter reached the game (N would close menus)'); if (g.ui.openModal !== 'archPanel') bad.push('typing N closed the panel');
    if (document.getElementById('archPanel').querySelector('script')) bad.push('script in the panel');
    g.ui.closeModals(); return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.save-and-load-keep-the-arch-settings-and-the-mesh', async () => {
    fresh(UP); const a = mk(1, -7.2, 3.0), b = mk(2, -7.2, 9.0), bad = [];
    g.setCfg(a, { mode: 'species', target: rare, volume: 0.4, quiet: true }); g.setCfg(b, { mode: 'rarity', rarity: 3, exact: true });
    const raw = JSON.parse(JSON.stringify(S().entities)), before = [a, b].map((e) => JSON.stringify(g.stripEnt(e)));
    K.items(); for (const e of [...S().entities]) { if (e.free) continue; const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } }
    S().entities = raw; for (const e of raw) if (!g.logi.byId.has(e.id) && !g.machines.items.has(e.id)) g.addEntity(e);
    const after = arches(); if (after.length !== 2) return 'arches after load: ' + after.length;
    const now = after.map((e) => JSON.stringify(g.stripEnt(e)));
    for (const s of before) if (!now.includes(s)) bad.push('lost fields: ' + s.slice(0, 160) + ' -> ' + now.join('/').slice(0, 300));
    for (const e of after) { const it = g.machines.items.get(e.id); if (!it || !it.obj || it.obj.children.length < 3 || Math.abs(it.obj.position.x - e.cx) > 1e-6) bad.push('no mesh after load'); }
    // an old or damaged save: missing settings fall back to the defaults, junk numbers never throw
    const odd = { id: g.nextId(), type: 'arch', cx: -3, cz: 2, y0: 0, size: 7, axis: 'q', mode: 'zzz', target: 'x' }; S().entities.push(odd); g.addEntity(odd);
    if (odd.mode !== 'one' || odd.size !== 1 || odd.axis !== 'z' || odd.target !== 0 || odd.volume !== 0.7) bad.push('defaults: ' + JSON.stringify(odd));
    const junk = { id: g.nextId(), type: 'arch', cx: 'a' }; S().entities.push(junk); g.addEntity(junk); if (!g.machines.items.get(junk.id)) bad.push('a broken ent threw');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.recipe-puts-the-tool-on-the-hotbar-with-its-size', async () => {
    fresh(UP); const bad = []; S().money = 1e9; g.craftItem('arch', 1); g.craftItem('archBig', 1); g.rebuildTools();
    const t1 = g.tools.find((t) => t && t.id === 'arch'), t2 = g.tools.find((t) => t && t.id === 'archBig');
    if (!t1 || t1.kind !== 'arch' || t1.p.size !== 1) bad.push('arch tool ' + JSON.stringify(t1 && [t1.kind, t1.p])); if (!t2 || t2.kind !== 'arch' || t2.p.size !== 2) bad.push('giant tool ' + JSON.stringify(t2 && [t2.kind, t2.p]));
    // a forged tool.p never changes the size: the item id decides
    if (D.sizeOfTool({ id: 'arch', p: { size: 2 } }) !== 1 || D.sizeOfTool({ id: 'archBig', p: { size: 1 } }) !== 2) bad.push('size follows p');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.preview-ghost-is-green-or-red-and-follows-the-plan', async () => {
    fresh(UP); const bad = []; S().items.arch = 1; K.equip('arch'); K.aimDir(-7.2, 0, 3.0, 1, 2.2); await ctx.plan();
    const gh = g.machines.ghost; if (!g.plan || !g.plan.ok || !gh) return 'no ghost for a good plan';
    if (Math.abs(gh.position.x - g.plan.ent.cx) > 1e-6 || Math.abs(gh.position.z - g.plan.ent.cz) > 1e-6) bad.push('ghost not at the plan');
    const col = gh.children[0].material.color.getHex(); if (col !== 0x9dffc4) bad.push('good color ' + col.toString(16));
    const w = g.world, i = toI(g.plan.ent.cx), k = toK(g.plan.ent.cz); w.setCell(i, 1, k, 2, 0);
    try { await ctx.plan(); const bg = g.machines.ghost; if (g.plan.ok || !bg || bg.children[0].material.color.getHex() !== 0xff8a7a) bad.push('blocked plan is not red'); } finally { w.setCell(i, 1, k, 0, 0); }
    g.stowed = true; g.rebuildTools();
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.crown-panel-and-lamps-exist-on-both-sizes-and-the-giant-has-a-plaza', async () => {
    fresh(UP); const a = mk(1, -7.2, 3.0), b = mk(2, -7.2, 9.0), bad = [];
    const ra = g.machines.items.get(a.id).arch, rb = g.machines.items.get(b.id).arch;
    if (!ra || ra.lamps.length !== 3 || !ra.canvas || ra.canvas.width < 100) bad.push('small arch rig'); if (!rb || rb.lamps.length !== 3) bad.push('giant rig');
    const box = (o) => { const bx = new (o.constructor.prototype.constructor)(); return bx; }; void box;
    const sizeOf = (it) => { let mnz = 1e9, mxz = -1e9, mxy = -1e9; it.obj.traverse((c) => { if (c.geometry && c.geometry.attributes.position) { c.geometry.computeBoundingBox(); const bb = c.geometry.boundingBox; mnz = Math.min(mnz, bb.min.z + c.position.z); mxz = Math.max(mxz, bb.max.z + c.position.z); mxy = Math.max(mxy, bb.max.y + c.position.y); } }); return { depth: mxz - mnz, top: mxy }; };
    const sa = sizeOf(g.machines.items.get(a.id)), sb = sizeOf(g.machines.items.get(b.id));
    if (sb.depth < 5.5) bad.push('giant plaza depth ' + sb.depth.toFixed(2)); if (sa.depth > 1.0) bad.push('small arch has a plaza: ' + sa.depth.toFixed(2)); if (sb.top < b.h + 0.5) bad.push('giant crown too low ' + sb.top.toFixed(2));
    // the target text is drawn: the canvas is not blank
    const px = ra.canvas.getContext('2d').getImageData(0, 0, ra.canvas.width, ra.canvas.height).data; let lit = 0; for (let q = 0; q < px.length; q += 4) if (px[q] > 120 || px[q + 1] > 120) lit++; if (lit < 200) bad.push('label canvas looks blank (' + lit + ')');
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('detector.removing-an-arch-closes-its-panel-and-frees-its-state', async () => {
    fresh(UP); const e = mk(1, -7.2, 3.0), bad = []; D.use(g, e); if (g.ui.openModal !== 'archPanel') return 'panel not open';
    g.doDecon({ kind: 'mach', id: e.id }); if (g.ui.openModal === 'archPanel') bad.push('panel stayed open for a removed arch'); if (arches().length) bad.push('arch remains');
    return bad.length === 0 || bad.join(' || ');
  });
}
