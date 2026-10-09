// Audit tests for the Mining & Supports upgrade category: every level of every upgrade must do what its text says.
import { fmt } from '../util.js';
import { BULK } from '../plushdata.js';
import { SUP_EXTRA } from '../world.js';
import { UPGRADES as CATALOG_UPGRADES } from '../catalog.js';
const CATALOG_IDS = new Set(CATALOG_UPGRADES.map((u) => u.id));

export default async function (ctx) {
  const { T, g, S, w, p, sim, fresh, tune, adv, stepSim, spot, dig, craft, selectTool, aimPoint, plan, placeNow, placeAtFloor, UPGRADES, FRAME_TYPES, computeTuning, effLevels, toI, toJ, toK, cellX, cellY, cellZ } = ctx;
  const mine = UPGRADES.filter((u) => u.cat === 'mine');
  const byId = (id) => UPGRADES.find((u) => u.id === id);
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const FRAME_IDS = ['timber', 'steel', 'concrete', 'rebar', 'titan', 'carbon', 'plasma', 'voidl', 'neutron', 'horizon'];
  const newWorld = async () => { await g.startPlay(true); g.mode = 'play'; g.noSave = true; await new Promise((r) => setTimeout(r, 250)); };
  // every prerequisite (recursively) at its required level, so an upgrade is purchasable
  const prereq = (u) => { const o = {}; let x = u; while (x && x.req) { o[x.req.id] = Math.max(o[x.req.id] || 0, x.req.lvl); x = byId(x.req.id); } return o; };
  const allFrames = () => { const o = {}; for (const f of FRAME_IDS) o[f] = 1; return o; };
  const snap = (t) => JSON.stringify(t);
  // buy the next level of an upgrade with exactly its price, then give the test its pocket money back
  const buyIt = (id) => { const u = byId(id), lvl = S().up[id] || 0; S().money = u.cost[lvl]; const ok = g.buy(id) && S().money === 0 && (S().up[id] || 0) === lvl + 1; S().money = 1e12; return ok; };
  // a long 2-wide, 3-high tunnel; returns its mouth
  const longTunnel = (n = 110) => { const { i, k } = spot(); dig(i, k - 1, n, 3, 3, false); return { i, k }; };
  const addProp = (ent) => { S().entities.push(ent); g.addEntity(ent); };
  const frameEnt = (kind, i, k) => ({ id: g.nextId(), type: 'frame', kind, axis: 'x', cx: cellX(i), cz: cellZ(k) + 0.3, y0: 0, w: 1.16, h: 1.78 });
  // measure, along a dug tunnel with one prop in the middle: how many cells are anchored beyond the prop centre, and how far
  // the roof keeps standing (margin >= 0) on the far side. Uses the game's own stress() / cavityLen().
  const measureProp = (i, k, s0) => {
    let anch = 0; while (anch < 60 && w().cavityLen(i + s0 + anch, 2, k, 3) === 0) anch++;
    let ext = 0; for (let s = 0; s < 80; s++) { const st = w().stress(i + s0 + s, 3, k); if (!st || st.margin < 0) { ext = s; break; } }
    const edge = w().stress(i + s0 + anch, 3, k);
    return { anch, ext, B: edge ? edge.B : null };
  };

  // ------------------------------------------------------------------ table sanity
  await T('upg.mine.table-costs-req-and-frames', async () => {
    const bad = [];
    { const own = mine.filter((u) => !CATALOG_IDS.has(u.id)); if (own.length !== 32) bad.push('expected 32 mine upgrades, got ' + own.length); }   // catalog_*.js parts are counted by their own tests
    for (const u of mine) {
      if (u.cost.length !== u.max) bad.push(`${u.id}: cost length ${u.cost.length} != max ${u.max}`);
      for (let l = 1; l < u.cost.length; l++) if (!(u.cost[l] > u.cost[l - 1])) bad.push(`${u.id}: cost not rising at level ${l + 1}`);
      if (u.cost.some((c) => !(c > 0) || !Number.isFinite(c))) bad.push(`${u.id}: bad cost`);
      if (u.req) { const r = byId(u.req.id); if (!r) bad.push(`${u.id}: unknown req ${u.req.id}`); else if (u.req.lvl > r.max) bad.push(`${u.id}: req level above max`); }
      if (!u.desc || /—/.test(u.desc)) bad.push(`${u.id}: desc missing or has an em-dash`);
    }
    if (Object.keys(FRAME_TYPES).join() !== FRAME_IDS.join()) bad.push('FRAME_TYPES order ' + Object.keys(FRAME_TYPES).join());
    let prev = null;
    FRAME_IDS.forEach((id, n) => {
      const f = FRAME_TYPES[id], u = byId(id);
      if (!u) { bad.push('no upgrade for frame ' + id); return; }
      if (n > 0 && (!u.req || u.req.id !== FRAME_IDS[n - 1])) bad.push(id + ' not chained to previous tier');
      if (prev) for (const key of ['cost', 'bonus', 'radius']) if (!(f[key] > prev[key])) bad.push(`${id}: frame ${key} not rising`);
      if (prev && !(u.cost[0] > byId(FRAME_IDS[n - 1]).cost[0])) bad.push(id + ': upgrade cost not rising');
      prev = f;
    });
    return bad.length ? bad.join(' | ') : true;
  });

  // ------------------------------------------------------------------ purchase path, every level of every upgrade
  await T('upg.mine.buy-path-every-level', async () => {
    const bad = [];
    for (const u of mine) {
      for (let l = 0; l < u.max; l++) {
        const up = { ...prereq(u) }; if (l > 0) up[u.id] = l;
        fresh(up);
        const cost = u.cost[l];
        // short by one: refused, nothing changes
        S().money = cost - 1; const mBefore = S().money;
        if (g.buy(u.id) || S().money !== mBefore || (S().up[u.id] || 0) !== l) { bad.push(`${u.id} L${l + 1}: bought while 1 short`); continue; }
        // the terminal shows the same price
        g.ui.shopCat = 'mine'; g.ui.renderShop();
        const card = [...document.querySelectorAll('#shopGrid .card')].find((c) => c.querySelector('h3 span') && c.querySelector('h3 span').textContent === u.name);
        const label = card ? card.querySelector('button').textContent : '';
        if (!label.includes(fmt(cost))) bad.push(`${u.id} L${l + 1}: terminal label "${label}" lacks ${fmt(cost)}`);
        const before = snap(g.T);
        S().money = cost;
        if (!g.buy(u.id)) { bad.push(`${u.id} L${l + 1}: refused with exact money`); continue; }
        if (S().money !== 0) bad.push(`${u.id} L${l + 1}: money after ${S().money}, expected 0`);
        if ((S().up[u.id] || 0) !== l + 1) bad.push(`${u.id} L${l + 1}: level ${S().up[u.id]}`);
        if (snap(g.T) === before) bad.push(`${u.id} L${l + 1}: tuning identical right after purchase`);
        if (snap(g.T) !== snap(computeTuning(effLevels(S()), S().boosts))) bad.push(`${u.id} L${l + 1}: g.T stale`);
        if (w().stabBonus !== g.T.stabBonus) bad.push(`${u.id} L${l + 1}: world.stabBonus stale`);
      }
      // requirement gating
      if (u.req) {
        const up = { ...prereq(u) }; up[u.req.id] = u.req.lvl - 1; if (up[u.req.id] === 0) delete up[u.req.id];
        fresh(up); S().money = 1e15; const m0 = S().money;
        if (g.buy(u.id) || S().money !== m0) bad.push(`${u.id}: bought without ${u.req.id} ${u.req.lvl}`);
      }
      // cannot buy past max
      fresh({ ...prereq(u), [u.id]: u.max }); S().money = 1e15; if (g.buy(u.id)) bad.push(`${u.id}: bought past max`);
    }
    return bad.length ? bad.slice(0, 12).join(' | ') : true;
  });

  // ------------------------------------------------------------------ frames: each tier's reach really extends the tunnel
  const frameRes = {};
  for (const tier of FRAME_IDS) {
    await T('upg.mine.frame-' + tier + '-reach-extends-tunnel', async () => {
      await newWorld(); fresh({ ...allFrames() });
      const f = FRAME_TYPES[tier]; const { i, k } = longTunnel(110); const c = 55;
      // purchase unlocks the recipe, and crafting pays exactly the table cost
      if (!g.recipeList().some((r) => r.id === 'frame:' + tier && r.price === f.cost)) return 'recipe missing or priced wrong';
      const m0 = S().money; craft('frame:' + tier); if (m0 - S().money !== f.cost) return `crafting charged ${m0 - S().money}, table says ${f.cost}`;
      addProp(frameEnt(tier, i + c, k));
      const sup = w().supports.find((q) => q.r === f.radius && q.b === f.bonus); if (!sup) return 'support not registered with table radius/bonus';
      const m = measureProp(i, k, c);
      // independent geometry: cells whose centre (at the tunnel floor level the rule samples) lies inside the sphere
      let expect = 0; for (let s = 0; s < 60; s++) { const dx = cellX(i + c + s) - sup.x, dy = cellY(2) - sup.y, dz = cellZ(k) - sup.z; if (dx * dx + dy * dy + dz * dz < f.radius * f.radius) expect++; else break; }
      frameRes[tier] = m;
      if (Math.abs(m.anch - expect) > 1) return `anchored ${m.anch} cells, geometry says ${expect} (r ${f.radius})`;
      // (the roof a support holds stands SUP_EXTRA cells further than the plain safe length since the support reach tuning: world.js SUP_EXTRA, tests support_reach.*)
      if (m.B === null || Math.abs(m.ext - (m.anch + m.B + SUP_EXTRA)) > 1) return `roof stands ${m.ext} cells, anchor ${m.anch} + safe length ${m.B} + support extra ${SUP_EXTRA}`;
      const idx = FRAME_IDS.indexOf(tier);
      if (idx > 0) { const pv = frameRes[FRAME_IDS[idx - 1]]; if (pv && m.ext < pv.ext) return `ext ${m.ext} below previous tier ${pv.ext}`; if (idx > 1) { const pv2 = frameRes[FRAME_IDS[idx - 2]]; if (pv2 && m.ext <= pv2.ext) return `ext ${m.ext} no better than two tiers down ${pv2.ext}`; } }
      return true;
    });
  }
  await T('upg.mine.frames-hold-tunnels-real-collapse', async () => {
    // frames 24 m apart (40 cells): timber cannot hold the stretch, horizon can. Real collapse simulation.
    const run = async (tier) => {
      await newWorld(); fresh({ ...allFrames() }); const { i, k } = spot(); const co0 = S().stats.collapses || 0;
      for (const c of [40, 80]) addProp(frameEnt(tier, i + c, k));
      dig(i, k - 1, 105, 3, 3, true); stepSim(25);
      return (S().stats.collapses || 0) > co0 || sim().n > 8;
    };
    const a = await run('timber'), b = await run('horizon');
    return (a === true && b === false) || `timber collapsed ${a}, horizon collapsed ${b}`;
  });

  // ------------------------------------------------------------------ struts and jacks
  await T('upg.mine.strut-and-jack-reach', async () => {
    await newWorld(); fresh({ timber: 1, steel: 1, struts: 1, jacks: 1 });
    const { i, k } = longTunnel(110); const out = {};
    for (const [kind, jack, r] of [['strut', false, 1.9], ['jack', true, 2.7]]) {
      const m0 = S().money; craft(kind); const price = m0 - S().money;
      const rec = g.recipeList().find((x) => x.id === kind); if (!rec) return kind + ' recipe missing';
      if (!new RegExp(String(r)).test(rec.desc)) return kind + ' recipe desc does not state reach ' + r;
      w().supports = []; addProp({ id: g.nextId(), type: 'strut', jack, x: cellX(i + 55), y: 0, z: cellZ(k) + 0.3 });
      const sup = w().supports[0]; if (!sup || sup.r !== r) return kind + ' support ' + JSON.stringify(sup);
      out[kind] = { ...measureProp(i, k, 55), price };
    }
    if (!(out.jack.anch > out.strut.anch && out.jack.ext > out.strut.ext)) return 'jack no wider than strut ' + JSON.stringify(out);
    // the recipe really needs steel for jacks / timber for struts
    fresh({ timber: 1, steel: 1, struts: 1, jacks: 1 }); S().mats = {}; craft('jack'); if (S().money === 1e12) return 'jack crafted for free';
    return true;
  });

  // ------------------------------------------------------------------ pile tamping, every level
  await T('upg.mine.tamp-every-level-near-and-deep', async () => {
    await newWorld();
    const bad = [];
    const { i: ni, k: nk } = spot(); dig(ni, nk, 30, 2, 3, false);
    const fi = toI(1500), fk = toK(0); for (let s = 0; s < 40; s++) for (let j = 5; j < 8; j++) w().removeCell(fi + s, j, fk, false);
    const B = (up, far) => {
      fresh(up);
      const st = far ? w().stress(fi + 20, 8, fk) : w().stress(ni + 20, 3, nk); return st ? st.B : null;
    };
    for (const far of [false, true]) {
      const b0 = B({}, far); if (b0 === null) return 'no roof cell (far=' + far + ')';
      for (let l = 1; l <= 8; l++) {
        const b = B({ timber: 1, tamp: l }, far);
        // 1.2 m per level = 2 cells of 0.6 m
        if (b - b0 !== 2 * l) bad.push(`${far ? 'deep' : 'near'} L${l}: B ${b0} -> ${b} (expected +${2 * l})`);
      }
    }
    // real purchase moves the world's rule at once
    fresh({ timber: 1 }); const { i, k } = spot(); dig(i, k, 30, 2, 3, false); const s0 = w().stress(i + 20, 3, k).B;
    S().money = byId('tamp').cost[0]; g.buy('tamp'); const s1 = w().stress(i + 20, 3, k).B; if (s1 - s0 !== 2) bad.push(`buy: B ${s0} -> ${s1}`);
    return bad.length ? bad.join(' | ') : true;
  });

  // ------------------------------------------------------------------ creak sensor, every level
  await T('upg.mine.creak-every-level', async () => {
    await newWorld(); const bad = []; let prevMean = 0;
    for (let l = 0; l <= 3; l++) {
      fresh(l ? { creak: l } : {}); const { i, k } = longTunnel(70);
      w().creaking.clear(); w().scanRegion(i + 50, 3, k, g.T.warn);
      const ts = [...w().creaking.values()].map((c) => c.t); if (ts.length < 15) { bad.push(`L${l}: only ${ts.length} creaks`); continue; }
      const warn = 1.1 + 0.55 * l; if (!near(g.T.warn, warn, 1e-9)) bad.push(`L${l}: T.warn ${g.T.warn}`);
      const mean = ts.reduce((a, b) => a + b, 0) / ts.length;
      if (Math.min(...ts) < warn * 0.35 - 1e-9 || Math.max(...ts) > warn * 1.25 + 1e-9) bad.push(`L${l}: timers outside range`);
      if (!(mean > prevMean)) bad.push(`L${l}: mean warning ${mean.toFixed(2)} not above ${prevMean.toFixed(2)}`);
      prevMean = mean;
      // the live game loop hands the same value to the world
      let seen = null; const orig = w().updateStability.bind(w()); w().updateStability = (dt, wn, h) => { seen = wn; return orig(dt, wn, h); }; adv(0.1); w().updateStability = orig;
      if (seen !== g.T.warn) bad.push(`L${l}: game loop passed warn ${seen}`);
    }
    return bad.length ? bad.join(' | ') : true;
  });

  // ------------------------------------------------------------------ stress lens
  await T('upg.mine.stress-lens-amber-and-red', async () => {
    await newWorld(); const grab = () => { let got = null; const orig = g.renderer.setStress.bind(g.renderer); g.renderer.setStress = (l) => { got = l; orig(l); }; g.stressT = 0; adv(0.6); g.renderer.setStress = orig; return got; };
    fresh({ timber: 1 }); const { i, k } = longTunnel(70);
    let edge = 0; for (let s = 0; s < 70; s++) { const st = w().stress(i + s, 3, k); if (st && st.margin < 0) { edge = s; break; } }
    if (!edge) return 'no failing roof in the test tunnel';
    p().pos.set(cellX(i + edge), 0, cellZ(k) + 0.3); p().yaw = Math.PI / 2; // standing where the safe length ends
    const none = grab(); if (none && none.length) return 'lens lists cells before it is bought';
    S().money = byId('stress').cost[0]; if (!g.buy('stress')) return 'cannot buy lens';
    const got = grab(); if (!got || !got.length) return 'no cells listed after purchase';
    const sev = new Set(got.map((c) => c.sev));
    // red = the rule says it falls; amber = exactly at the limit
    for (const c of got) { const st = w().stress(ctx.toI(c.x), ctx.toJ(c.y), ctx.toK(c.z)); if (!st) return 'listed a cell with no stress'; if ((c.sev === 2) !== (st.margin < 0)) return 'severity does not match margin ' + st.margin; }
    return (sev.has(2) && sev.has(1)) || 'severities seen ' + [...sev];
  });

  // ------------------------------------------------------------------ bulkhead
  await T('upg.mine.bulkhead-never-falls-and-anchors', async () => {
    await newWorld(); fresh({ timber: 1 }); if (g.recipeList().some((r) => r.id === 'bulk')) return 'recipe before purchase';
    if (!buyIt('bulkhead')) return 'cannot buy bulkhead'; if (!g.recipeList().some((r) => r.id === 'bulk')) return 'no recipe after purchase';
    const { i, k } = spot();
    // floating panel: nothing under it, plush all around removed; it must not fall
    const pi = i + 30, pj = 8; for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) for (let dk = -2; dk <= 2; dk++) w().setCell(pi + di, pj + dj, k + dk, 0, 0);
    w().setCell(pi, pj, k, BULK, 5); w().stabQueue.push({ i: pi, j: pj, k }); g.slide.trigger(pi, pj, k, 5); stepSim(6);
    if (w().get(pi, pj, k) !== BULK) return 'panel fell';
    if (w().stress(pi, pj, k) !== null) return 'panel has a stress value';
    // as an anchor: in a long dead-end tunnel, a panel beside it holds the roof 6 cells away
    fresh({ timber: 1 }); const t = longTunnel(80); const far = t.i + 56;
    const before = w().stress(far, 3, t.k); if (!before || before.margin >= 0) return 'test tunnel is not over the limit already: ' + JSON.stringify(before);
    w().setCell(t.i + 50, 2, t.k - 2, BULK, 3); // beside the tunnel wall
    const after = w().stress(far, 3, t.k); return (after && after.margin >= 0) || 'panel did not anchor: ' + JSON.stringify(after);
  });

  // ------------------------------------------------------------------ blasting: radius per level
  const solidIn = (ci, cj, ck, rM) => { let n = 0, farthest = 0; const R = Math.ceil(rM / 0.6) + 2; for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let d = -R; d <= R; d++) { if (w().get(ci + a, cj + b, ck + d)) { const dist = Math.sqrt(a * a + b * b + d * d) * 0.6; if (dist <= rM + 1e-6) n++; } } return { n, farthest }; };
  const radiusOf = (desc) => { const m = /about ([\d.]+) m in radius/.exec(desc); return m ? +m[1] : null; };
  await T('upg.mine.dynamite-and-charges-blast-radius', async () => {
    const bad = []; const sizes = [];
    for (const [label, up, ent] of [['dynamite', { dynamite: 1 }, { dyn: true, tier: 0 }], ['charge1', { timber: 1, charges: 1 }, { tier: 1 }], ['charge2', { timber: 1, charges: 2 }, { tier: 2 }], ['charge3', { timber: 1, charges: 3 }, { tier: 3 }]]) {
      await newWorld(); fresh(up); const id = label === 'dynamite' ? 'dynamite' : 'charge';
      const rec = g.recipeList().find((r) => r.id === id); if (!rec) { bad.push(label + ': recipe missing'); continue; }
      const rM = radiusOf(rec.desc); if (!rM) { bad.push(label + ': desc has no radius: ' + rec.desc); continue; }
      // a solid block of plush so the count does not depend on the random pile
      const { i, k } = spot(); const ci = i + 22, ck = k + 2, cj0 = 12; let cj;
      for (let a = -9; a <= 9; a++) for (let b = -9; b <= 9; b++) for (let d = -9; d <= 9; d++) w().setCell(ci + a, cj0 + b, ck + d, 2, 0);
      cj = toJ(cellY(cj0) + 0.3); // detonate() centres the sphere 0.3 m above the charge
      const inside0 = solidIn(ci, cj, ck, rM).n, ring0 = solidIn(ci, cj, ck, rM + 0.9).n - inside0;
      p().pos.set(cellX(ci) + 40, 0, cellZ(ck)); // out of harm's way
      g.detonate({ x: cellX(ci), y: cellY(cj0), z: cellZ(ck), ...ent });
      const inside1 = solidIn(ci, cj, ck, rM).n, ring1 = solidIn(ci, cj, ck, rM + 0.9).n - inside1;
      if (inside0 < 20) bad.push(label + ': test spot too empty ' + inside0);
      if (inside1 !== 0) bad.push(`${label}: ${inside1} cells still inside the stated ${rM} m radius`);
      if (ring1 < ring0 * 0.8) bad.push(`${label}: blast ate the ring outside its radius (${ring0} -> ${ring1})`);
      sizes.push(inside0);
    }
    if (!(sizes[1] < sizes[2] && sizes[2] < sizes[3])) bad.push('charge sizes do not grow ' + sizes);
    return bad.length ? bad.join(' | ') : true;
  });
  await T('upg.mine.charge-tier-and-price-follow-level', async () => {
    const bad = [];
    for (let l = 1; l <= 3; l++) {
      await newWorld(); fresh({ timber: 1, charges: l }); const rec = g.recipeList().find((r) => r.id === 'charge'); if (!rec || rec.price !== 120 * l) bad.push(`L${l}: price ${rec && rec.price}`);
      craft('charge'); selectTool('charge'); aimPoint(0, 0, 6); const pl = await plan(); if (!pl.ok) { bad.push('plan ' + pl.why); continue; } placeNow();
      const e = S().entities.find((x) => x.type === 'charge'); if (!e || e.tier !== l || e.fuse !== 6) bad.push(`L${l}: ent ${JSON.stringify(e)}`);
    }
    // buying the next level changes what the next charge does, immediately
    fresh({ timber: 1, charges: 1 }); S().money = byId('charges').cost[1]; g.buy('charges'); if (g.T.charges !== 2) bad.push('buy did not raise T.charges');
    return bad.length ? bad.join(' | ') : true;
  });
  await T('upg.mine.dynamite-gating-fuse-and-hurt', async () => {
    await newWorld(); fresh({}); if (g.recipeList().some((r) => r.id === 'dynamite')) return 'recipe before purchase';
    if (!buyIt('dynamite')) return 'cannot buy dynamite'; if (!g.recipeList().some((r) => r.id === 'dynamite')) return 'no recipe after purchase';
    craft('dynamite'); selectTool('dynamite'); aimPoint(0, 0, 6); const pl = await plan(); if (!pl.ok) return pl.why; placeNow();
    const e = S().entities.find((x) => x.dyn); if (!e || e.fuse !== 4) return 'fuse ' + (e && e.fuse);
    // close blast hurts, far blast does not
    g.hp = 100; p().pos.set(cellX(0), 0, cellZ(0)); g.detonate({ x: p().pos.x + 0.5, y: p().pos.y, z: p().pos.z, dyn: true, tier: 0 }); const hurt = 100 - g.hp;
    g.hp = 100; g.detonate({ x: p().pos.x + 30, y: p().pos.y, z: p().pos.z, dyn: true, tier: 0 }); const far = 100 - g.hp;
    return (hurt > 10 && far === 0) || `close ${hurt} far ${far}`;
  });

  // ------------------------------------------------------------------ health items
  await T('upg.mine.hpmax-every-level', async () => {
    const bad = [];
    for (let l = 1; l <= 4; l++) {
      fresh({ hpmax: l }); g.updateVitals(0.01); if (g.hpMax !== 100 + 25 * l) bad.push(`L${l}: hpMax ${g.hpMax}`);
      g.hp = g.hpMax; g.hurtPlayer(10, 't'); if (!near(g.hp, g.hpMax - 10, 0.01)) bad.push(`L${l}: hp ${g.hp}`);    }
    // the purchase itself raises both max and current health at once
    fresh({}); g.updateVitals(0.01); S().money = byId('hpmax').cost[0]; g.buy('hpmax'); g.updateVitals(0.01); if (g.hpMax !== 125 || g.hp !== 125) bad.push(`buy: hp ${g.hp}/${g.hpMax}`);
    return bad.length ? bad.join(' | ') : true;
  });
  await T('upg.mine.padding-every-level-on-all-damage', async () => {
    const bad = [];
    for (let l = 0; l <= 4; l++) {
      const k = 1 - 0.1 * l;
      fresh(l ? { padding: l } : {}); g.updateVitals(0.01);
      g.hp = 100; g.hurtPlayer(10, 't'); if (!near(100 - g.hp, 10 * k, 0.01)) bad.push(`L${l}: direct ${100 - g.hp}`);
      g.hp = 100; p().events.land(16); if (!near(100 - g.hp, 20 * k, 0.01)) bad.push(`L${l}: fall ${100 - g.hp}, want ${20 * k}`);
      g.hp = 100; g.dmgCd = 0; g.onPlayerHit(12); if (!near(100 - g.hp, 36 * k, 0.01)) bad.push(`L${l}: plush ${100 - g.hp}, want ${36 * k}`);
      g.hp = 100; p().pos.set(cellX(0), 0, cellZ(0)); g.detonate({ x: p().pos.x + 0.5, y: p().pos.y, z: p().pos.z, dyn: true, tier: 0 }); const exp = Math.max(15, 55 - 0.5 * 12) * k; if (!near(100 - g.hp, exp, 0.05)) bad.push(`L${l}: blast ${100 - g.hp}, want ${exp}`);
    }
    return bad.length ? bad.join(' | ') : true;
  });
  await T('upg.mine.hardhat-hurts-less-and-shakes-less', async () => {
    const dmg = (up) => { fresh(up); g.hp = 100; g.dmgCd = 0; g.onPlayerHit(12); return 100 - g.hp; };
    const a = dmg({}), b = dmg({ hardhat: 1 }), c = dmg({ hardhat: 1, padding: 4 });
    if (!near(b, a * 0.7, 0.01)) return `plush damage ${a} -> ${b}, want 30% less`;
    if (!near(c, a * 0.7 * 0.6, 0.01)) return `with padding ${c}`;
    if (!(tune({ hardhat: 1 }).shakeMul < tune({}).shakeMul)) return 'shake not reduced';
    return true;
  });
  await T('upg.mine.firstaid-gating-medkit-and-canister', async () => {
    fresh({}); if (g.recipeList().some((r) => r.id === 'medkit' || r.id === 'canister')) return 'recipes before purchase';
    if (!buyIt('firstaid')) return 'cannot buy firstaid'; if (!g.recipeList().some((r) => r.id === 'medkit') || !g.recipeList().some((r) => r.id === 'canister')) return 'recipes missing after purchase';
    craft('medkit'); g.hp = 20; g.useMedkit(); if (!near(g.hp, 70, 0.01)) return 'medkit healed to ' + g.hp;
    craft('canister'); p().embedded = true; p().buried = 3; g.trapOn = true; g.airLeft = 0.05; g.updateTrapped(0.1); g.updateTrapped(0.1); p().embedded = false; p().buried = 0;
    return near(g.airLeft, 39.9, 0.3) || 'canister air ' + g.airLeft;
  });
  await T('upg.mine.airtank-every-level', async () => {
    const bad = [];
    for (let l = 0; l <= 5; l++) {
      fresh(l ? { airtank: l } : {}); p().embedded = true; p().buried = 3; g.trapOn = false; g.airLeft = undefined; g.updateTrapped(0.1);
      const a0 = g.airLeft, want = 60 + 30 * l; if (!near(a0, want - 0.1, 0.01)) bad.push(`L${l}: starts with ${a0}, want ${want}`);
      for (let n = 0; n < 100; n++) g.updateTrapped(0.1); if (!near(a0 - g.airLeft, 10, 0.05)) bad.push(`L${l}: drains ${a0 - g.airLeft} in 10 s`);
      p().embedded = false; p().buried = 0;
    }
    // buying while trapped does not hand out air that was never in the tank, but the next burial does
    fresh({}); S().money = byId('airtank').cost[0]; g.buy('airtank'); p().embedded = true; p().buried = 3; g.trapOn = false; g.airLeft = undefined; g.updateTrapped(0.1); p().embedded = false; p().buried = 0;
    if (!near(g.airLeft, 89.9, 0.01)) bad.push('after buy ' + g.airLeft);
    return bad.length ? bad.join(' | ') : true;
  });
  await T('upg.mine.respirator-every-level', async () => {
    const bad = [];
    for (let l = 0; l <= 4; l++) {
      fresh(l ? { resp: l } : {}); g.dust.cells.clear(); g.dust.lung = 0; g.dust.level = 0.9; g.dust.hostLevel = 0.9;
      for (let n = 0; n < 20; n++) g.dust.breathe(0.1, { x: 0, y: 1.2, z: 0 }, g.T);
      const want = 20 * (0.9 - 0.25) * 0.045 * (1 - 0.2 * l) * 0.1 * 6; if (!near(g.dust.lung, want, want * 0.02 + 1e-6)) bad.push(`L${l}: lung ${g.dust.lung.toFixed(4)} want ${want.toFixed(4)}`);
      g.dust.hostLevel = 0;
    }
    return bad.length ? bad.join(' | ') : true;
  });

  // ------------------------------------------------------------------ small unlocks
  await T('upg.mine.markers-flares-gating-and-burn-time', async () => {
    await newWorld(); fresh({}); if (g.recipeList().some((r) => ['marker', 'flare', 'glow'].includes(r.id))) return 'recipes before purchase';
    if (!buyIt('markers')) return 'cannot buy markers'; for (const id of ['marker', 'flare', 'glow']) if (!g.recipeList().some((r) => r.id === id)) return id + ' recipe missing';
    const r = await placeAtFloor('flare', 3, 5); if (!r.ok) return r.why; const e = S().entities.find((x) => x.type === 'flare' && !x.glow); if (!e) return 'no flare entity';
    S().stats.playSecs = e.born + 239; adv(0.6); if (!S().entities.includes(e)) return 'flare gone before four minutes';
    S().stats.playSecs = e.born + 242; adv(0.6); return !S().entities.includes(e) || 'flare still burning after four minutes';
  });
  await T('upg.mine.struts-gating-and-price', async () => {
    fresh({}); if (g.recipeList().some((r) => r.id === 'strut')) return 'recipe before purchase';
    if (!buyIt('struts')) return 'cannot buy struts'; const rec = g.recipeList().find((r) => r.id === 'strut'); if (!rec) return 'no recipe';
    fresh({ struts: 1 }); S().mats = {}; const m0 = S().money; craft('strut'); return (S().items.strut === 1 && m0 > S().money) || 'strut not crafted for money';
  });
  await T('upg.mine.slope-probe-warns-on-unstable-slope', async () => {
    await newWorld(); const run = async (up) => {
      fresh(up); const { i, k } = spot(); const ci = i + 20, ck = k, j = 3; for (let dj = 0; dj < 8; dj++) for (let dk = -1; dk <= 1; dk++) w().setCell(ci, dj, ck + dk, 0, 0);
      w().setCell(ci, j, ck, 2, 0); for (let d = 0; d <= 4; d++) w().setCell(ci + 1, j - d, ck, 0, 0);
      let warn = ''; const orig = g.ui.setWarn.bind(g.ui); g.ui.setWarn = (t) => { warn = t; orig(t); };
      p().pos.set(cellX(ci), (j + 1) * 0.6, cellZ(ck)); p().vel.set(0, 0, 0); adv(0.4); g.ui.setWarn = orig; return warn;
    };
    const off = await run({}), on = await run({ slopeprobe: 1 });
    return (on === 'UNSTABLE SLOPE' && off !== 'UNSTABLE SLOPE') || `without "${off}", with "${on}"`;
  });
}
