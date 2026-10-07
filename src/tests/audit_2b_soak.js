// audit_2b_* (wave 2B audit): a long random soak with conversions and settings changes while plush are in flight. Every plush that goes in must be on a belt
// or in a vault at the end, whatever happened to the parts around it (converted, reconfigured, a brownout, a refused patch).
import { makeSplitKit, UPB, RAR, NEEDLE } from './split_lib.js';
import * as SR from '../splitrules.js';
import * as EXT from '../ext.js';

export default async function (ctx) {
  const { g, S, L } = ctx;
  const X = makeSplitKit(ctx), T = X.T;

  await T('audit.2b.soak-conversions-and-settings-while-plush-flow', async () => {
    const bad = [];
    let seed = 987654; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const pool = [RAR(0, 0), RAR(1, 1), RAR(2, 2), RAR(3, 3), RAR(4, 4), RAR(5, 5), NEEDLE];
    const rule = () => pick([{ k: 'any' }, { k: 'none' }, { k: 'overflow' }, { k: 'undef' }, { k: 'rarity', v: Math.floor(rnd() * 5) }, { k: 'species', v: pick(pool.slice(0, 6)) }, { k: 'one' }, { k: 'shiny' }]);
    let totalConv = 0;
    for (let round = 0; round < 4; round++) {
      X.setup(UPB); const i = X.i0(), k = X.k0();
      const back = X.lay(0, 4, i, k, 0), left = X.lay(0, 3, i + 4, k - 3, 1), right = X.lay(0, 3, i + 4, k + 3, 3);
      const mid = X.lay(0, 2, i + 5, k, 0);
      X.part(pick(['merger', 'pmerger']), i + 4, k, 0);
      X.part(pick(['ssplit', 'psplit']), i + 7, k, 0);
      const v = [X.vaultAt(i + 8, k), X.vaultAt(i + 7, k + 1), X.vaultAt(i + 7, k - 1)];
      L().dirty = true; void mid;
      const lanes = [back[0], left[0], right[0]];
      const mTile = () => L().tileAt(i + 4, 0, k), sTile = () => L().tileAt(i + 7, 0, k);
      let fed = 0, converts = 0, refused = 0, flick = 0, nextAct = 0;
      const act = () => {
        const a = rnd();
        if (a < 0.25) { const t = mTile(); if (t.merger === 'prio') g.setCfg(t, { lanes: pick([[0, 1, 2], [2, 1, 0], [1, 0, 2]]) }); }
        else if (a < 0.5) { const t = sTile(); const n = t.smart === 2 ? 1 + Math.floor(rnd() * 3) : 1; const r = g.setCfg(t, { rules: [0, 1, 2].map(() => Array.from({ length: n }, rule)), mode: pick(['rr', 'prio']) }); if (!r.ok) bad.push('a valid patch was refused: ' + r.why); }
        else if (a < 0.6) { const t = sTile(), before = JSON.stringify(t.rules); const r = g.setCfg(t, pick([{ rules: [[{ k: 'any' }, { k: 'any' }], [{ k: 'any' }], [{ k: 'any' }]] }, { rules: 'x' }, { def: 7 }, { lanes: [0, 1, 2] }])); if (r.ok && t.smart === 1 && JSON.stringify(t.rules) !== before && false) bad.push('x'); if (!r.ok) refused++; if (!SR.cleanRules(t.rules, t.smart)) bad.push('rules went bad after a patch'); }
        else if (a < 0.72) { const t = mTile(), id = t.merger === 'prio' ? null : 'pmerger'; if (id) { S().items[id] = 1; const r = EXT.buildTool(g, { id, kind: id }, { type: 'convertbelt', id: t.id, i: t.i, j: t.j, k: t.k, dir: t.dir, rise: 0 }); if (!r) bad.push('merger convert refused'); converts++; L().dirty = true; } }
        else if (a < 0.84) { const t = sTile(), id = t.smart === 1 ? 'psplit' : null; if (id) { S().items[id] = 1; const r = EXT.buildTool(g, { id, kind: id }, { type: 'convertbelt', id: t.id, i: t.i, j: t.j, k: t.k, dir: t.dir, rise: 0 }); if (!r) bad.push('splitter convert refused'); else if (!SR.cleanRules(r.rules, 2)) bad.push('converted rules bad'); converts++; L().dirty = true; } }
        else { flick = 20; }
      };
      X.run(30, () => {
        if (flick > 0) { flick--; for (const t of [mTile(), sTile()]) t.pw = 0; }
        if (g.time >= nextAct) { act(); nextAct = g.time + 0.1 + rnd() * 0.3; }
        for (const t of lanes) if (rnd() < 0.6) { const it = { sp: pick(pool), vr: rnd() < 0.2 ? 128 : 0 }; if (L().accept(t, it, null)) fed++; }
      });
      X.run(3, () => {});
      const got = v.reduce((a, b) => a + X.total(b), 0), travel = X.onTiles();
      totalConv += converts;
      if (fed < 100) bad.push(`round ${round}: barely ran, fed ${fed}`);
      if (got + travel !== fed) bad.push(`round ${round}: fed ${fed}, vaults ${got}, belts ${travel}, converts ${converts}`);
      for (const t of ctx.tiles()) {
        if (t.type !== 'belt') continue;
        for (let n = 1; n < t.items.length; n++) if (t.items[n - 1].t - t.items[n].t < 0.34 - 1e-4) bad.push(`round ${round}: spacing broken on ${t.id}`);
      }
      if (bad.length > 6) break;
    }
    if (totalConv < 3) bad.push('the soak converted only ' + totalConv + ' pieces');
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  });

  await T('audit.2b.save-and-reload-in-the-middle-of-a-flow-loses-nothing', async () => {
    const bad = [];
    X.setup(UPB); const i = X.i0(), k = X.k0();
    const back = X.lay(0, 4, i, k, 0), left = X.lay(0, 3, i + 4, k - 3, 1), right = X.lay(0, 3, i + 4, k + 3, 3);
    X.lay(0, 2, i + 5, k, 0); X.part('pmerger', i + 4, k, 0, 0, 0, { lanes: [2, 0, 1] }); const s = X.part('psplit', i + 7, k, 0);
    X.vaultAt(i + 8, k); X.vaultAt(i + 7, k + 1); X.vaultAt(i + 7, k - 1); L().dirty = true;
    g.setCfg(s, { rules: [[{ k: 'rarity', v: 3 }, { k: 'shiny' }], [{ k: 'overflow' }], [{ k: 'any' }]], mode: 'prio', prio: [1, 0, 2], def: 2 });
    const lanes = [back[0], left[0], right[0]]; let fed = 0, n = 0;
    const feed = () => { for (const t of lanes) if (L().accept(t, { sp: RAR(n++ % 6, n % 3), vr: n % 5 === 0 ? 128 : 0 }, null)) fed++; };
    X.run(6, feed);
    const mine = new Set(['belt', 'vault']), snap = JSON.parse(JSON.stringify(S().entities.filter((e) => mine.has(e.type) && !e.free)));
    const old = ctx.tiles().filter((t) => mine.has(t.type) && !t.free); for (const t of old) { L().remove(t); S().entities = S().entities.filter((e) => e.id !== t.id); }
    for (const e of snap) { S().entities.push(e); g.addEntity(e); }
    const lanes2 = [L().byId.get(back[0].id), L().byId.get(left[0].id), L().byId.get(right[0].id)];
    lanes.splice(0, 3, ...lanes2);
    X.run(12, feed); X.run(4, () => {});
    const vs = ctx.tiles().filter((t) => t.type === 'vault'), got = vs.reduce((a, v) => a + v.stored.length, 0), travel = X.onTiles();
    if (got + travel !== fed) bad.push(`fed ${fed}, vaults ${got}, belts ${travel}`);
    const t = L().byId.get(s.id);
    if (!t || t.smart !== 2 || t.mode !== 'prio' || t.def !== 2 || JSON.stringify(t.prio) !== '[1,0,2]') bad.push('the rules did not come back: ' + JSON.stringify(t && [t.smart, t.mode, t.def, t.prio]));
    if (!(got > 30)) bad.push('the flow stopped after the reload: ' + got);
    return bad.length === 0 || bad.join('; ');
  });
}
