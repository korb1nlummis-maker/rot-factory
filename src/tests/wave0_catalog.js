// Wave 0 plumbing: the catalog registry (catalog.js) and its runtime (ext.js). Handlers for tests are registered by pushing into TYPES / EXTRA
// and removed again in a finally, so no test edits a catalog_*.js file.
import { PARTS, TYPES, EXTRA, CONFLICTS, V, REJECT, DEMAND as CAT_DEMAND, UPGRADES as CAT_UPGRADES, mergeUpgrades, mergeDemand, catalogRecipes } from '../catalog.js';
import * as EXT from '../ext.js';
import { DEMAND } from '../power.js';
import { recipes } from '../crafting.js';
import { UPGRADES } from '../upgrades.js';

export default async function (ctx) {
  const { T, g, S, p, fresh, adv } = ctx;
  const withType = async (name, h, fn) => { TYPES[name] = h; try { return await fn(); } finally { delete TYPES[name]; } };
  const spot = (n = 0) => ({ x: -3.6 + n * 1.2, y: 0.3, z: 6.0 });
  const CFG = { on: V.bool, n: V.int(0, 5), name: V.str(8), f: V.num(0, 1), mode: V.enum(['a', 'b']), rules: V.arr(3, V.obj({ k: V.enum(['any', 'rarity']), v: V.int(0, 6) })) };

  await T('catalog.registry-merges-without-duplicate-ids', async () => {
    const bad = [];
    for (const [name, part] of Object.entries(PARTS)) {
      if (!Array.isArray(part.UPGRADES) || typeof part.RECIPES !== 'function' || !part.DEMAND || typeof part.DEMAND !== 'object' || !part.TYPES || typeof part.TYPES !== 'object') bad.push(`${name} does not export UPGRADES, RECIPES, DEMAND, TYPES`);
    }
    if (CONFLICTS.length) bad.push('conflicts at load: ' + CONFLICTS.join('; '));
    const ids = UPGRADES.map((u) => u.id); if (new Set(ids).size !== ids.length) bad.push('duplicate upgrade ids in the merged tree');
    fresh({ belts: 1 }); const rid = recipes(g).map((r) => r.id); if (new Set(rid).size !== rid.length) bad.push('duplicate recipe ids');
    // a clash is reported and the first definition wins
    const n0 = CONFLICTS.length, list = [{ id: 'clash', cost: [1] }];
    const saved = EXTRA.t1; EXTRA.t1 = { UPGRADES: [], RECIPES: () => [{ id: 'dup:1', price: 1 }, { id: 'dup:1', price: 2 }], DEMAND: {}, TYPES: {} };
    try { const r = catalogRecipes(g); if (r.filter((x) => x.id === 'dup:1').length !== 1) bad.push('a duplicate recipe id was not dropped'); } finally { if (saved) EXTRA.t1 = saved; else delete EXTRA.t1; }
    CAT_UPGRADES.push({ id: 'clash', cost: [2] }); mergeUpgrades(list); CAT_UPGRADES.pop(); { const cl = list.filter((u) => u.id === 'clash'); if (cl.length !== 1 || cl[0].cost[0] !== 1) bad.push('mergeUpgrades replaced or doubled an id'); }   // other parts' real upgrades are appended too, so only the clashing id is compared
    CAT_DEMAND.belt = 9; const map = { belt: 1 }; mergeDemand(map); delete CAT_DEMAND.belt;
    if (map.belt !== 1) bad.push('mergeDemand overrode a core key');
    if (CONFLICTS.length < n0 + 2) bad.push('clashes were not reported');
    CONFLICTS.length = n0;
    for (const k of Object.keys(CAT_DEMAND)) if (DEMAND[k] !== CAT_DEMAND[k]) bad.push('demand ' + k + ' did not reach power.js');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('catalog.recipes-merge-into-the-bench-with-the-3x-price-and-tool-params', async () => {
    fresh({}); EXTRA.t2 = { UPGRADES: [], DEMAND: {}, TYPES: {}, RECIPES: () => [{ id: 'wt:1', kind: 'wt', icon: 'X', name: 'Wave Test', short: 'WT', desc: 'd', price: 10, batch: [1, 5, 10], p: { tier: 2 }, use: 'Set it down.', statusFn: () => 'status ok' }] };
    try {
      const r = recipes(g).find((x) => x.id === 'wt:1'); if (!r) return 'recipe missing';
      if (r.price !== 30) return 'price ' + r.price + ' (want 10 x 3)';
      if (r.status !== 'status ok' || r.use !== 'Set it down.' || !r.p || r.p.tier !== 2) return 'fields lost: ' + JSON.stringify(r);
      S().items['wt:1'] = 1; g.assignHotbar('wt:1'); g.rebuildTools(); const tool = g.tools.find((t) => t && t.id === 'wt:1'); if (!tool || !tool.p || tool.p.tier !== 2 || tool.kind !== 'wt') return 'hotbar tool lost its params: ' + JSON.stringify(tool);
      const m0 = S().money; g.craftItem('wt:1', 2); if (S().items['wt:1'] !== 3 || Math.round(m0 - S().money) !== 60) return 'crafting did not charge 60 for 2: spent ' + (m0 - S().money);
      return true;
    } finally { delete EXTRA.t2; g.rebuildTools(); }
  });

  await T('catalog.cfg-whitelist-rejects-unknown-keys', async () => {
    fresh({}); const bad = [];
    await withType('wtest', { cfg: CFG }, async () => {
      const e = g.placeEntity('wtest', spot()); if (!e) return bad.push('placeEntity returned nothing');
      const refuse = (patch, why) => { const r = g.setCfg(e, patch); if (r.ok) bad.push(why + ': accepted ' + JSON.stringify(patch)); };
      refuse({ on: true, evil: 1 }, 'unknown key'); if (e.on !== undefined) bad.push('a patch with one unknown key was half applied');
      refuse({ __proto__x: 1 }, 'odd key'); refuse(JSON.parse('{"__proto__":{"on":true}}'), 'proto key'); refuse({ constructor: 1 }, 'constructor'); refuse({ x: 1 }, 'x');
      refuse({ on: 1 }, 'wrong type'); refuse({ n: 6 }, 'out of range'); refuse({ n: 1.5 }, 'not an integer'); refuse({ n: '2' }, 'string for int'); refuse({ f: NaN }, 'NaN'); refuse({ f: 2 }, 'over 1');
      refuse({ mode: 'z' }, 'enum'); refuse({ name: 5 }, 'number for text'); refuse({ rules: [{ k: 'any', v: 1, z: 1 }] }, 'extra key inside a rule'); refuse({ rules: [1, 2, 3, 4].map(() => ({ k: 'any', v: 1 })) }, 'too many rules');
      refuse({}, 'empty'); refuse(null, 'null'); refuse([1], 'array'); refuse('on', 'string');
      if (Object.prototype.on !== undefined || ({}).on !== undefined) bad.push('prototype was polluted');
      const ok = g.setCfg(e, { on: true, n: 3, name: '<b>Hello world</b>', f: 0.5, mode: 'b', rules: [{ k: 'rarity', v: 4 }] });
      if (!ok.ok) bad.push('a clean patch was refused: ' + ok.why);
      else if (e.on !== true || e.n !== 3 || e.name !== 'bHello w' || e.f !== 0.5 || e.mode !== 'b' || e.rules[0].v !== 4) bad.push('applied wrong: ' + JSON.stringify(e));
      // a type with no cfg and a type that does not exist have no settings at all
      const o = g.placeEntity('wtest', spot(1)); TYPES.wtest.cfg = undefined; if (g.setCfg(o, { on: true }).ok) bad.push('a type without cfg took a patch'); TYPES.wtest.cfg = CFG;
      if (g.setCfg(99999999, { on: true }).ok) bad.push('a missing ent took a patch');
    });
    return bad.length === 0 || bad.join(' || ');
  });

  await T('catalog.check-and-onCfg-hooks-run-and-a-refusal-changes-nothing', async () => {
    fresh({}); const bad = []; let seen = null;
    await withType('wtest', { cfg: { n: V.int(0, 5), on: V.bool }, check: (gg, e, c, actor) => (c.n === 4 ? 'four is locked' : null), onCfg: (gg, e, c, old) => { seen = { c, old, actor: e.view }; } }, async () => {
      const e = g.placeEntity('wtest', { ...spot(), n: 1 });
      const r = g.setCfg(e, { n: 4, on: true }); if (r.ok || !/locked/.test(r.why) || e.n !== 1 || e.on !== undefined) bad.push('refusal applied something: ' + JSON.stringify([r, e.n, e.on]));
      const r2 = g.setCfg(e, { n: 2 }); if (!r2.ok || e.n !== 2 || !seen || seen.old.n !== 1 || seen.c.n !== 2) bad.push('onCfg did not see the change: ' + JSON.stringify(seen));
    });
    return bad.length === 0 || bad.join(' || ');
  });

  await T('catalog.place-entity-adds-a-saved-ent-and-the-hammer-hands-it-back', async () => {
    fresh({}); const bad = []; let gone = null;
    await withType('wtest', { item: (e) => 'wt:' + (e.tier || 1), onRemove: (gg, e) => { gone = e.id; } }, async () => {
      const n0 = S().entities.length, st = S().stats.built || 0, e = g.placeEntity('wtest', { ...spot(), tier: 3, id: 987654 });
      if (S().entities.length !== n0 + 1 || e.id === 987654 || !S().entities.includes(e) || (S().stats.built || 0) !== st + 1) bad.push('not registered (id ' + e.id + ')');
      const it = g.machines.items.get(e.id); if (!it || !it.obj) bad.push('no group in machines.items');
      const round = JSON.parse(JSON.stringify(S().entities.find((x) => x.id === e.id))); if (round.tier !== 3 || round.type !== 'wtest') bad.push('does not round trip as JSON');
      g.doDecon({ kind: 'mach', id: e.id });
      if (g.machines.items.has(e.id) || S().entities.some((x) => x.id === e.id)) bad.push('hammer left it behind');
      if (S().items['wt:3'] !== 1 || gone !== e.id) bad.push('item handed back: ' + JSON.stringify(S().items) + ', onRemove ' + gone);
      // a type with no handlers still gets a group (nothing throws)
      const n = g.placeEntity('wtest', spot(2)); if (!g.machines.items.get(n.id).obj) bad.push('no default group');
    });
    return bad.length === 0 || bad.join(' || ');
  });

  await T('catalog.copy-paste-carries-only-the-copy-keys-between-the-same-group', async () => {
    fresh({}); const bad = [];
    await withType('wa', { cfg: CFG, copy: ['n', 'on'], group: 'wg' }, async () => await withType('wb', { cfg: CFG, group: 'wg' }, async () => await withType('wc', { cfg: CFG }, async () => {
      const a = g.placeEntity('wa', { ...spot(), n: 3, on: true, name: 'keep' }), b = g.placeEntity('wb', { ...spot(1), n: 0, name: 'mine' }), c = g.placeEntity('wc', spot(2));
      if (g.pasteCfg(b).ok) bad.push('pasted with nothing copied');
      if (!g.copyCfg(a) || g.cfgClip.group !== 'wg') bad.push('copy did not store the group');
      const r = g.pasteCfg(b); if (!r.ok || b.n !== 3 || b.on !== true || b.name !== 'mine') bad.push('paste wrong: ' + JSON.stringify([r, b.n, b.on, b.name]));
      if (g.pasteCfg(c).ok || c.n !== undefined) bad.push('pasted across groups');
      g.copyCfg(c); if (g.cfgClip.group !== 'wc' || g.pasteCfg(a).ok) bad.push('group of a different type leaked');
      g.cfgClip = null;
    })));
    return bad.length === 0 || bad.join(' || ');
  });

  await T('catalog.ext-update-ticks-each-type-once-per-frame-and-reaches-the-game-loop', async () => {
    fresh({}); const bad = []; let host = 0, guest = 0, dts = 0;
    await withType('wtest', { tick: (gg, dt) => { host++; dts += dt; }, guestTick: () => { guest++; } }, async () => {
      g.placeEntity('wtest', spot()); g.placeEntity('wtest', spot(1));
      const h0 = host; adv(0.5, 0.05); const frames = host - h0; if (frames < 8 || frames > 12) bad.push('game loop ticked the host handler ' + frames + ' times in 10 frames (once per type, not per ent)');
      if (Math.abs(dts - 0.5) > 0.06) bad.push('dt sum ' + dts);
      g.net.open = true; g.net.role = 'guest'; g.guestReady = true;
      try { EXT.update(g, 0.1, true); } finally { g.net.open = false; g.net.role = null; g.guestReady = false; }
      if (guest !== 1) bad.push('guestTick ' + guest);
    });
    return bad.length === 0 || bad.join(' || ');
  });

  await T('catalog.strip-ent-drops-the-transient-names-and-keeps-the-rest', async () => {
    const e = { id: 7, type: 'wtest', x: 1, tier: 2, rules: [{ k: 'any' }], lane: [1], wait: 3, cache: { a: 1 }, hist: [1, 2], items: [1], q: [1], kept: [1], stored: [1], buf: [1], path: [1], trail: [1], carry: [1], hop: 1, cargo: [1] };
    const s = g.stripEnt(e); const bad = ['lane', 'wait', 'cache', 'hist', 'items', 'q', 'kept', 'stored', 'buf', 'path', 'trail', 'carry', 'hop', 'cargo'].filter((k) => k in s);
    return (bad.length === 0 && s.id === 7 && s.tier === 2 && s.rules[0].k === 'any' && s.x === 1) || 'still present: ' + bad.join(',') + ' / ' + JSON.stringify(s);
  });

  await T('catalog.tool-pipeline-plans-builds-and-consumes-the-item', async () => {
    fresh({}); const bad = []; let planned = 0, built = 0, conflicts = 0;
    EXTRA.t3 = { UPGRADES: [], DEMAND: {}, TYPES: {}, RECIPES: () => [{ id: 'wk', kind: 'wk', icon: 'K', name: 'Wave Kit', short: 'WK', desc: 'd', price: 5, batch: [1, 1, 1], p: { v: 7 } }] };
    await withType('wk', {
      plan: (gg, tool, eye, dir) => { planned++; return { plan: { ok: true, ent: { x: -3.6, y: 0.3, z: 6.0 } }, cost: 0 }; },
      preview: () => {}, build: (gg, tool, e) => { built++; return { type: 'wk', x: e.x, y: e.y, z: e.z, v: tool.p.v }; }, conflict: () => { conflicts++; return null; },
    }, async () => {
      try {
        g.craftItem('wk', 2); ctx.selectTool('wk'); ctx.aimPoint(-3.6, 0, 6.0, 2); await ctx.plan();
        if (!planned || !g.plan || !g.plan.ok) return bad.push('plan hook not used') && bad.join(' || ');
        const n0 = S().entities.length; g.placeCurrent(g.curTool());
        const e = S().entities.find((x) => x.type === 'wk'); if (!e || e.v !== 7 || S().entities.length !== n0 + 1 || built !== 1) bad.push('build did not make the ent: ' + JSON.stringify(e));
        if (S().items.wk !== 1) bad.push('item count ' + S().items.wk);
        if (!g.machines.items.has(e && e.id)) bad.push('not in machines.items');
        // a guest asks the host through the place command, and the host re-checks with conflict()
        g.net.open = true; g.net.role = 'guest'; g.guestReady = true; const sent = []; g.netSend = (m) => sent.push(JSON.parse(JSON.stringify(m)));
        try { ctx.aimPoint(-3.6, 0, 6.0, 2); await ctx.plan(); g.placeCurrent(g.curTool()); } finally { delete g.netSend; g.net.open = false; g.net.role = null; g.guestReady = false; }
        const c = sent.find((m) => m.t === 'cmd' && m.c === 'place'); if (!c || c.d.tool.kind !== 'wk' || !c.d.tool.p || c.d.tool.p.v !== 7) bad.push('guest place command lost the tool params: ' + JSON.stringify(c));
        g.net.open = true; g.net.role = 'host'; g.guestReady = false; g.netSend = () => {};
        try { g.netMessage(JSON.parse(JSON.stringify(c))); } finally { delete g.netSend; g.net.open = false; g.net.role = null; }
        if (!conflicts) bad.push('host did not call conflict()');
        if (S().entities.filter((x) => x.type === 'wk').length !== 2) bad.push('host did not build the guest placement');
      } finally { delete EXTRA.t3; g.stowed = true; g.rebuildTools(); }
    });
    return bad.length === 0 || bad.join(' || ');
  });

  await T('catalog.info-hook-replaces-extends-and-falls-back', async () => {
    fresh({ sorter: 1, power: 1, belts: 1 }); const bad = [];
    const r = await ctx.placeAtFloor('sorter', -6.6, 2.4, 2.0); if (!r.ok) return r.why;
    const t = ctx.tiles().find((x) => x.type === 'sorter'), { infoFor } = await import('../info.js'), ref = { kind: 'tile', id: t.id };
    const base = infoFor(g, ref); if (!base || !/SORTING BOX/.test(base.title)) return 'built in readout lost: ' + JSON.stringify(base);
    const h = TYPES.sorter;
    try {
      h.infoExtra = () => ['EXTRA LINE']; const a = infoFor(g, ref); if (a.lines[0] !== 'EXTRA LINE' || a.lines.length !== base.lines.length + 1 || a.title !== base.title) bad.push('infoExtra: ' + JSON.stringify(a.lines));
      h.info = () => null; const b = infoFor(g, ref); if (b.title !== base.title) bad.push('a null info did not fall back');
      h.info = () => ({ title: 'REPLACED', lit: true, lines: ['x'] }); const c = infoFor(g, ref); if (c.title !== 'REPLACED' || !c.lines.includes('x')) bad.push('info did not replace: ' + JSON.stringify(c));
    } finally { delete h.info; delete h.infoExtra; }
    const d = infoFor(g, ref); if (JSON.stringify(d) !== JSON.stringify(base)) bad.push('readout not restored');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('catalog.reserved-keys-are-unclaimed-and-the-copy-row-is-listed', async () => {
    const { RESERVED_KEYS, CONTROLS, CONTROL_CODES } = await import('../controls.js');
    const src = await (await fetch('/src/game.js')).text(); const a = src.indexOf('  onKey(e, down) {'), b = src.indexOf('  onMouse(e, down) {'); const body = src.slice(a, b);
    const bad = Object.keys(RESERVED_KEYS).filter((k) => body.includes(`'${k}'`) || CONTROL_CODES.has(k));
    const row = CONTROLS.flatMap((gr) => gr.rows).find((r) => r.keys.join('+') === 'Shift+E');
    return (bad.length === 0 && row && /Copy the settings/.test(row.what) && !/[—–]/.test(row.what)) || 'claimed: ' + bad.join(',') + ' row ' + !!row;
  });

  void p; void REJECT;
}
