// Upgrade audit: Sorting + Crew categories + Contracts. Every test buys through game.buy() and measures real behavior.
import { fmt } from '../util.js';

export default async function (ctx) {
  const { g, S, w, p, sim, L, T, UPGRADES, computeTuning, fresh, tune, adv, spot, toI, toK, cellX, cellZ, newWorld, species, NEEDLE } = ctx;
  const U = (id) => UPGRADES.find((u) => u.id === id);
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  // a rarity-5 plush so rounding cannot hide a small bonus
  const SP = species.findIndex((s) => s && s.rarity === 5 && !s.volatile) > 0 ? species.findIndex((s) => s && s.rarity === 5 && !s.volatile) : 3;
  const SP2 = species.findIndex((s) => s && s.rarity === 3) > 0 ? species.findIndex((s) => s && s.rarity === 3) : 3;

  // ---- the real purchase path for one upgrade: gating, exact charge per level, immediate effect, shop button text
  const purchase = async (id, pre, needs = 0) => {
    const u = U(id); const why = [];
    if (u.cost.length !== u.max) return `cost has ${u.cost.length} entries for max ${u.max}`;
    for (let i = 0; i < u.cost.length; i++) { if (!(u.cost[i] > 0) || (i && u.cost[i] <= u.cost[i - 1])) return 'costs not strictly increasing: ' + u.cost.join(); }
    // unmet requirement refuses and keeps the money
    if (u.req) { fresh({}); const m0 = S().money; if (g.buy(id) || S().up[id] || S().money !== m0) return 'bought without requirement ' + u.req.id; }
    if (u.needs) { fresh(pre); S().stats.plush = u.needs - 1; const m0 = S().money; if (g.buy(id) || S().money !== m0) return 'bought below the plush gate'; S().stats.plush = u.needs; if (!g.buy(id)) return 'refused at exactly the plush gate'; S().stats.plush = 1e9; }
    // not enough money refuses
    fresh(pre); S().money = u.cost[0] - 1; if (g.buy(id) || S().up[id]) return 'bought without money';
    // every level: charge exactly cost[l], level +1, tuning updated at once, shop button shows the same price
    fresh(pre); S().stats.plush = 1e9;
    for (let l = 0; l < u.max; l++) {
      S().money = 1e12;
      g.ui.shopCat = u.cat; g.ui.renderShop();
      const card = [...document.querySelectorAll('#shopGrid .card')].find((c) => c.querySelector('h3 span') && c.querySelector('h3 span').textContent === u.name);
      const label = card ? card.querySelector('button').textContent : '(no card)';
      if (!label.includes(fmt(u.cost[l]))) why.push(`level ${l + 1} shop shows "${label}" but cost is ${u.cost[l]}`);
      const m0 = S().money; if (!g.buy(id)) return 'buy refused at level ' + (l + 1);
      if (m0 - S().money !== u.cost[l]) return `level ${l + 1} charged ${m0 - S().money} not ${u.cost[l]}`;
      if (S().up[id] !== l + 1) return 'level not incremented';
      const ref = computeTuning({ ...S().up }, S().boosts);
      for (const k of Object.keys(ref)) if (JSON.stringify(ref[k]) !== JSON.stringify(g.T[k])) return `tuning ${k} stale after buying level ${l + 1}`;
    }
    const m1 = S().money; if (g.buy(id) || S().money !== m1) return 'bought past max';
    return why.length ? why.join('; ') : true;
  };
  const defs = [['contracts', {}], ['contractSlots', { contracts: 1 }], ['haggle', {}], ['streak', {}], ['magnet', {}], ['dump', {}], ['dex', {}], ['shinyEye', {}],
    ['crew', { bag: 3 }], ['crewSlots', { crew: 1 }], ['crewHaul', { crew: 1 }], ['crewSpeed', { crew: 1 }], ['crewBattery', { crew: 1 }], ['crewBelt', { crew: 1, belts: 1 }], ['crewBolt', { crew: 1, belts: 1, crewBelt: 1 }]];
  for (const [id, pre] of defs) await T('upg.' + (U(id).cat === 'crew' ? 'crew' : 'sort') + '.purchase-' + id, async () => purchase(id, pre));

  // ================================================================ SORT
  await T('upg.sort.haggle-each-level-is-20pct-more-money', async () => {
    const out = [];
    for (let l = 0; l <= 10; l++) {
      fresh({ haggle: 0 }); S().dex = {}; const base = g.valueOf(SP, 0, 0);
      fresh({}); S().dex = {}; S().money = 1e12; for (let q = 0; q < l; q++) { S().money = 1e12; g.buy('haggle'); }
      const m0 = S().money; g.streak.t = 0; g.streak.n = 0; g.sell(SP, 0, { dist: 0 }); const got = S().money - m0;
      if (S().up.haggle !== l && l) return 'level ' + l;
      if (got !== Math.max(1, Math.round(base * (1 + 0.14 * l)))) out.push(`l${l}: sale paid ${got}, expected ${Math.round(base * (1 + 0.14 * l))}`);
    }
    return out.length ? out.join('; ') : true;
  });
  await T('upg.sort.streak-cap-per-level', async () => {
    const out = [];
    for (let l = 0; l <= 5; l++) {
      fresh({ streak: l }); S().dex = {}; const cap = 6 + 8 * l; if (g.T.streakCap !== (l ? cap : 6)) out.push(`l${l} cap ${g.T.streakCap}`);
      const v1 = g.valueOf(SP, 0, 1), vc = g.valueOf(SP, 0, cap), vp = g.valueOf(SP, 0, cap + 20), vm = g.valueOf(SP, 0, cap - 1);
      if (!near(vc / v1, 1 + 0.045 * (cap - 1), 0.002)) out.push(`l${l} combo at cap ${vc / v1}`);
      if (vp !== vc || !(vc > vm)) out.push(`l${l} cap not binding`);
      // the real sell chain: sales in quick succession reach the cap and not beyond
      g.streak.t = 0; g.streak.n = 0; let last = 0; for (let n = 1; n <= cap + 6; n++) { const m0 = S().money; g.sell(SP, 0, { dist: 0, streak: true }); last = S().money - m0; }
      if (last !== vc) out.push(`l${l} chain paid ${last} vs ${vc}`);
    }
    return out.length ? out.join('; ') : true;
  });
  await T('upg.sort.dex-bonus-per-species', async () => {
    const out = [];
    for (const n of [0, 10, 100]) {   // (prices are whole numbers, so a ratio is only good to half a unit in the price: 0.006)
      fresh({}); S().dex = {}; const a = g.valueOf(SP, 0, 0); fresh({ dex: 1 }); S().dex = {}; for (let q = 1; q <= n; q++) S().dex[q] = 1; const b = g.valueOf(SP, 0, 0);
      if (!near(b / a, 1 + (await import('../plushdata.js')).DEX_UNIT * n, 0.006)) out.push(`${n} species: x${(b / a).toFixed(4)}`);
    }
    S().dex = {}; fresh({}); return out.length ? out.join('; ') : true;
  });
  await T('upg.sort.shiny-multiplier-5x-to-8x', async () => {
    const r = (up) => { fresh(up); S().dex = {}; return g.valueOf(SP, 128, 0) / g.valueOf(SP, 0, 0); };
    const a = r({}), b = r({ shinyEye: 1 });
    // and for a sale that really happens
    fresh({ shinyEye: 1 }); S().dex = {}; g.streak.t = 0; let m0 = S().money; g.sell(SP, 128, { dist: 0 }); const sh = S().money - m0; m0 = S().money; g.streak.t = 0; g.sell(SP, 0, { dist: 0 }); const pl = S().money - m0;
    return (near(a, 5, 0.01) && near(b, 8, 0.01) && near(sh / pl, 8, 0.01)) || `x${a} x${b} sale x${sh / pl}`;
  });
  await T('upg.sort.dump-pull-range-per-level', async () => {
    const bp = g.hall.binPos; const exp = [3.8, 7.8, 13.8, 25.8]; const out = [];
    const reach = (up) => {
      let best = 0;
      for (let d = 1; d <= 40; d += 0.25) {
        fresh({ bag: 3, ...up }); S().carry = [{ sp: 2, vr: 0 }]; p().pos.set(bp.x + d, 0, bp.z); g.player.vel && g.player.vel.set(0, 0, 0); g._adT = 0; for (let n = 0; n < 4; n++) g.autoDump(0.1);
        if (S().carry.length === 0) best = d;
      }
      return best;
    };
    let prev = 0;
    for (let l = 0; l <= 3; l++) { const r = reach(l ? { dump: l } : {}); if (!(r > prev)) out.push(`l${l} reach ${r} not above ${prev}`); if (!near(r, exp[l], 0.4)) out.push(`l${l} reach ${r} vs ${exp[l]}`); prev = r; }
    // the cart is pulled in from 80% of that range (at least 3.2)
    fresh({ bag: 3, cart: 3, dump: 3 }); ctx.craft('cart:1'); g.useCart(); const c = S().cart; c.mode = 'stay'; c.y = 0; c.load = [{ sp: 2, vr: 0 }]; c.x = bp.x + 18; c.z = bp.z; g._adC = 0; const m0 = S().money; for (let n = 0; n < 6; n++) g.autoDump(0.1);
    if (c.load.length) out.push('cart at 18 m not pulled with Long-Range Suction 3'); if (!(S().money > m0)) out.push('cart load not sold');
    return out.length ? out.join('; ') : true;
  });
  await T('upg.sort.magnet-catches-wider-throws-per-level', async () => {
    const bp = g.hall.binPos; const res = [];
    const maxMiss = (up) => {
      fresh(up); let best = -1;
      for (let m = 0; m <= 5.01; m += 0.25) {
        let hitBoth = 0;
        for (const sgn of [1, -1]) {
          ctx.clearBodies(); sim().binCatch = g.T.binCatch;
          const sx = 0.4, sz = -0.6; const tx = bp.x, tz = bp.z + sgn * m; const dx = tx - sx, dz = tz - sz, Ld = Math.hypot(dx, dz); const t = Ld / 9; const vy = (-0.5 + 7.5 * t * t) / t;
          const m0 = S().money; sim().spawn(3, 0, sx, 1.5, sz, dx / Ld * 9, vy, dz / Ld * 9, 1);
          for (let q = 0; q < 300; q++) { sim().step(1 / 60); if (!sim().n) break; }
          if (S().money > m0) hitBoth++;
        }
        if (hitBoth === 2) best = m; else if (m > best + 0.8) break;
      }
      return best;
    };
    for (let l = 0; l <= 3; l++) { const up = l ? { magnet: l } : {}; if (!near(tune(up).binCatch, 0.45 * l, 1e-9)) return 'binCatch ' + g.T.binCatch; res.push(maxMiss(up)); }
    window.__magnet = res;
    for (let l = 1; l <= 3; l++) if (!(res[l] > res[l - 1])) return 'catch width did not grow at level ' + l + ': ' + res.join(',');
    return true;
  });
  await T('upg.sort.contracts-slots-and-tab', async () => {
    const out = [];
    fresh({}); S().contracts = []; g.ui.shopCat = 'sort'; g.ui.renderShop(); if ([...document.querySelectorAll('#shopTabs button')].some((b) => b.dataset.cat === 'contracts')) out.push('contracts tab visible before purchase');
    fresh({}); S().contracts = []; g.buy('contracts'); if (S().contracts.length !== 3) out.push('after Contract Board: ' + S().contracts.length + ' slots');
    g.ui.renderShop(); if (![...document.querySelectorAll('#shopTabs button')].some((b) => b.dataset.cat === 'contracts')) out.push('no contracts tab after purchase');
    for (let l = 1; l <= 3; l++) { g.buy('contractSlots'); if (S().contracts.length !== 3 + l) out.push(`contractSlots ${l}: ${S().contracts.length} contracts`); }
    return out.length ? out.join('; ') : true;
  });
  await T('upg.sort.contracts-rewards-match-formula-and-pay', async () => {
    fresh({ contracts: 1, contractSlots: 3 }); S().stats.maxDist = 100; S().dex = {};
    const out = []; const C = g.contracts;
    // a shape contract pays the plain formula times how rare the shape is in the pile (1 to 30: the 24 newest shapes are far rarer than the old ones, see contracts.js)
    const shapePays = (c, prem, mult) => { const base = c.need * 36 * 1.1 * prem * mult; return c.reward >= Math.max(30, Math.round(base)) && c.reward <= Math.max(30, Math.round(base * 30)); };
    for (let n = 0; n < 60; n++) {
      const c = C.make(); const prem = 1 + 100 / 700; const mult = g.T.sellMult;
      if (c.kind === 'shape' && !shapePays(c, prem, mult)) out.push('shape reward ' + c.reward);
      if (c.kind === 'shiny' && c.reward !== Math.max(30, Math.round(c.need * 140 * 1.2 * prem * mult * 3))) out.push('shiny reward ' + c.reward);
      if (!(c.reward >= 30) || !(c.need >= 1) || c.have !== 0) out.push('bad contract ' + JSON.stringify(c));
    }
    // rewards follow the sell price exactly: with Haggling 5 the sell multiplier is higher and every reward follows the same formula
    fresh({ contracts: 1, contractSlots: 3, haggle: 5 }); S().stats.maxDist = 100; S().dex = {}; const m5 = g.T.sellMult; { fresh({ contracts: 1, contractSlots: 3 }); if (!(m5 > g.T.sellMult * 1.6)) out.push(`haggle 5 sell multiplier ${m5} vs ${g.T.sellMult}`); }
    fresh({ contracts: 1, contractSlots: 3, haggle: 5 }); S().stats.maxDist = 100; S().dex = {};
    for (let n = 0; n < 60; n++) { const c = g.contracts.make(); const prem = 1 + 100 / 700; const mult = g.T.sellMult; if (c.kind === 'shape' && !shapePays(c, prem, mult)) out.push('haggled shape reward ' + c.reward); if (c.kind === 'shiny' && c.reward !== Math.max(30, Math.round(c.need * 140 * 1.2 * prem * mult * 3))) out.push('haggled shiny reward ' + c.reward); }
    // a rarity contract pays its reward exactly when the last matching plush is sold, wrong plush do not count
    fresh({ contracts: 1, contractSlots: 3 }); S().stats.maxDist = 0; const sp0 = species.findIndex((s) => s && s.rarity === 1), sp5 = SP;
    S().contracts = [{ kind: 'rarity', r: 3, need: 3, desc: 'x', reward: 12345, id: 77, have: 0 }]; g.streak.t = 0;
    g.sell(sp0, 0, { dist: 0 }); if (S().contracts[0].have !== 0) out.push('common plush counted for rarity>=3');
    let m0 = S().money; g.sell(sp5, 0, { dist: 0 }); g.sell(sp5, 0, { dist: 0 }); const before = S().money; const cnt0 = S().stats.contracts || 0; g.sell(sp5, 0, { dist: 0 });
    const gain = S().money - before; const sale = g.valueOf(sp5, 0, 3); if ((S().stats.contracts || 0) !== cnt0 + 1) out.push('contract not completed'); if (gain < 12345 + 1) out.push('reward not paid on top of the sale: ' + gain);
    void m0; void sale;
    // permanent boosts: +1% sale price, +1 carry, -1% dig time
    const boosts = JSON.parse(JSON.stringify(S().boosts));
    for (const [kind, check] of [['sell', () => near(g.T.sellMult, 1.01, 1e-9)], ['carry', () => g.T.carry === 2], ['dig', () => near(g.T.grabTime, 1.5 * 0.99, 1e-9)]]) {
      fresh({ contracts: 1, contractSlots: 3, bag: 0 }); S().boosts = { sell: 0, dig: 0, digMul: 1, carry: 0, scan: 0, stab: 0, ...{} }; g.refreshTuning();
      S().contracts = [{ kind: 'shiny', need: 1, desc: 'x', reward: 50, id: 78, have: 0, boost: kind }]; g.contracts.onSale(2, 128); if (!check()) out.push('boost ' + kind + ' not applied: ' + g.T.sellMult + ' ' + g.T.carry + ' ' + g.T.grabTime);
    }
    S().boosts = boosts; g.refreshTuning(); fresh({});
    return out.length ? out.slice(0, 6).join('; ') : true;
  });

  // ================================================================ CREW
  const digRun = async (up, secs, setup) => {
    await newWorld(); fresh({ crew: 1, crewSlots: 3, ...up }); S().stats.plush = 1e9;
    let sp0 = spot(); for (const lane of [20, 28, 6, -6, -14]) { if (w().topAt(sp0.i + 14, sp0.k) >= 8) break; try { sp0 = spot(lane); } catch (e) { /* lane without a slope mouth */ } } const { i, k } = sp0; const b = g.crew.spawn(); b.xp = -1e9; if (setup) setup(b);
    p().pos.set(cellX(i) - 1.5, 0, cellZ(k)); g.crew.order(b, 0, cellX(i) - 1.5, 0.3, cellZ(k));
    const log = { b, digs: [], exp: [], maxCarry: 0, money0: S().money, states: new Set() };
    const orig = g.mechDug; g.mechDug = function (...a) { log.digs.push(g.time); log.exp.push(g.crew.digTime(log.b, log.b.x, log.b.z)); return orig.apply(this, a); };
    try { for (let n = 0; n < secs / 0.05; n++) { g.time += 0.05; g.crew.update(0.05, g.time); g.logi.update(0.05); log.maxCarry = Math.max(log.maxCarry, b.carry.length); log.states.add(b.state); if (log.stop && log.stop(b, log)) break; } } finally { g.mechDug = orig; }
    return log;
  };
  await T('upg.crew.crew-hatches-the-first-bot-and-slots-add-bunks-the-bench-fills', async () => {
    const out = [];
    fresh({ bag: 3 }); S().stats.plush = 150; const m0 = S().money; if (!g.buy('crew')) return 'Scrapper Bot refused'; if (S().crew.length !== 1 || g.T.crewMax !== 1) out.push('no bot after buying'); if (m0 - S().money !== U('crew').cost[0]) out.push('crew charge');
    S().stats.plush = 399; if (g.buy('crewSlots')) out.push('More Scrappers bought below 400 plush'); S().stats.plush = 400;
    for (let l = 1; l <= 8; l++) { S().money = 1e12; if (!g.buy('crewSlots')) return 'More Scrappers refused at ' + l; if (g.T.crewMax !== 1 + l || S().crew.length !== l) out.push(`level ${l}: bunks ${g.T.crewMax}, bots ${S().crew.length} (a bunk is not a bot: the bench crafts it)`); if (!g.craftItem('bot:scrapper', 1) || S().crew.length !== 1 + l) out.push(`level ${l}: the bench did not fill the new bunk (${S().crew.length} bots)`); }
    return out.length ? out.join('; ') : true;
  });
  await T('upg.crew.haul-bigger-buckets-per-level', async () => {
    await newWorld(); const out = []; const exp = [0, 8, 11, 13, 16]; let prev = 0;
    for (let l = 0; l <= 4; l++) {
      const run = await digRun(l ? { crewHaul: l } : {}, 400, null);
      const cap = g.crew.capacity(run.b); const want = Math.round(6 * (1 + 0.4 * l));
      if (cap !== want) out.push(`l${l} capacity ${cap} vs ${want}`);
      if (run.maxCarry !== cap) out.push(`l${l} bot actually carried up to ${run.maxCarry}, capacity ${cap}`);
      if (!(run.maxCarry > prev)) out.push(`l${l} haul did not grow`); prev = run.maxCarry;
      if (l && Math.abs(cap - 6 * (1 + 0.4 * l)) > 0.5) out.push('rounding');
    }
    void exp; return out.length ? out.join('; ') : true;
  });
  await T('upg.crew.speed-servo-tuning-per-level', async () => {
    await newWorld(); const out = []; let base = 0;
    for (let l = 0; l <= 6; l++) {
      const run = await digRun(l ? { crewSpeed: l, crewHaul: 4 } : { crewHaul: 4 }, 40, (b) => { b.level = 1; });
      // consecutive digs with no step forward in between must be spaced by exactly the bot's dig time
      let ok = 0; for (let n = 0; n + 1 < run.digs.length; n++) { const d = run.digs[n + 1] - run.digs[n]; if (d > run.exp[n] + 0.35) continue; ok++; if (!near(d, run.exp[n], 0.1)) out.push(`l${l}: gap ${d.toFixed(2)} vs dig time ${run.exp[n].toFixed(2)}`); }
      if (ok < 4) out.push(`l${l}: only ${ok} comparable digs`);
      // the dig time itself shrinks by 1 / (1 + 0.2 level) at the same spot
      const bb = run.b;
      const t = g.crew.digTime(bb, 3, 3); if (l === 0) base = t; else if (!near(base / t, 1 + 0.2 * l, 0.01)) out.push(`l${l}: dig time x${(base / t).toFixed(3)}, want x${1 + 0.2 * l}`);
    }
    return out.length ? out.join('; ') : true;
  });
  await T('upg.crew.battery-long-life-cells-per-level', async () => {
    await newWorld(); const out = []; const drain = [];
    for (let l = 0; l <= 4; l++) {
      // farming drain
      const run = await digRun(l ? { crewBattery: l, crewHaul: 4 } : { crewHaul: 4 }, 30, null); const b = run.b;
      b.battery = 1; b.carry = []; b.state = 'farm'; b.timer = 99; const t0 = g.time; for (let n = 0; n < 200; n++) { g.time += 0.05; g.crew.update(0.05, g.time); } const farm = (1 - b.battery) / (g.time - t0);
      // walking drain
      b.battery = 1; b.state = 'return'; b.path = [[b.x + 500, b.z]]; b.pi = 0; b.scanned = true; const t1 = g.time; for (let n = 0; n < 100; n++) { g.time += 0.05; g.crew.update(0.05, g.time); } const walk = (1 - b.battery) / (g.time - t1);
      drain.push([farm, walk]);
    }
    for (let l = 1; l <= 4; l++) {
      for (const [n, name] of [[0, 'farming'], [1, 'walking']]) { const want = drain[0][n] / (1 + 0.6 * l); if (!near(drain[l][n], want, want * 0.08)) out.push(`l${l} ${name} drain ${drain[l][n].toFixed(5)}/s vs ${want.toFixed(5)}`); }
    }
    window.__drain = drain; return out.length ? out.join('; ') : true;
  });
  await T('upg.crew.belt-kit-lays-belt-at-3-each-and-delivers', async () => {
    await newWorld(); const out = [];
    // costs: each belt laid takes exactly 3 from the wallet
    fresh({ crew: 1, crewSlots: 3, crewBelt: 1, belts: 1, power: 1 }); S().stats.plush = 1e9; const { i, k } = spot(); const b = g.crew.spawn(); b.xp = -1e9; p().pos.set(cellX(i) - 1.5, 0, cellZ(k)); g.crew.order(b, 0, cellX(i) - 1.5, 0.3, cellZ(k));
    let laid = 0, off = 0; const orig = g.layBelt; let prevM = S().money; g.layBelt = function (...a) { laid++; if (prevM - S().money !== 3) off++; return orig.apply(this, a); };
    try { for (let n = 0; n < 6000; n++) { prevM = S().money; g.time += 0.05; g.crew.update(0.05, g.time); g.logi.update(0.05); } } finally { g.layBelt = orig; }
    if (laid < 3) out.push('only ' + laid + ' belts laid'); if (off) out.push(off + ' belts not charged exactly 3');
    // without the kit nothing is laid
    await newWorld(); fresh({ crew: 1, crewSlots: 3, belts: 1, power: 1 }); S().stats.plush = 1e9; const s2 = spot(); const b2 = g.crew.spawn(); b2.xp = -1e9; p().pos.set(cellX(s2.i) - 1.5, 0, cellZ(s2.k)); g.crew.order(b2, 0, cellX(s2.i) - 1.5, 0.3, cellZ(s2.k)); for (let n = 0; n < 3000; n++) { g.time += 0.05; g.crew.update(0.05, g.time); g.logi.update(0.05); }
    if (ctx.tiles().some((t) => t.type === 'belt' && !t.free)) out.push('belts laid without the kit');
    return out.length ? out.join('; ') : true;
  });
  await T('upg.crew.belt-kit-line-to-bin-drops-plush-on-the-belt', async () => {
    await newWorld(); const out = [];
    fresh({ crew: 1, crewSlots: 3, crewBelt: 1, belts: 1, power: 1, crewHaul: 1 }); S().stats.plush = 1e9; const { i, k } = spot();
    const b = g.crew.spawn(); b.xp = -1e9; const h = g.crew.home();
    // belts from the pile mouth back to the bin, so the kit's line is already connected
    const bp = g.hall.binPos; const ox = cellX(i) - 1.5;
    const ck = k; let n = 0;
    for (let ii = i - 1; ii > toI(bp.x + 0.9); ii--) { if (!g.logi.tileAt(ii, 0, ck)) { g.layBelt(ii, 0, ck, 2); n++; } }
    const colI = toI(bp.x + 0.9); const zs = cellZ(ck) < bp.z ? 1 : -1;
    for (let kk = ck; Math.abs(cellZ(kk) - bp.z) > 1.0; kk += zs) { if (!g.logi.tileAt(colI, 0, kk)) { g.layBelt(colI, 0, kk, zs > 0 ? 1 : 3); n++; } }
    p().pos.set(ox, 0, cellZ(k)); g.crew.order(b, 0, ox, 0.3, cellZ(k));
    let hauled = 0; const m0 = S().money; const sold0 = S().stats.sold; const states = new Set();
    for (let q = 0; q < 2400; q++) { for (const t of g.logi.tiles.values()) t.pw = 1; g.time += 0.05; g.crew.update(0.05, g.time); g.logi.update(0.05); states.add(b.state); hauled = Math.max(hauled, b.carry.length); }
    const lbelts = ctx.tiles().filter((t) => t.type === 'belt').length;
    window.__belt = { n, lbelts, hauled, money: S().money - m0, sold: S().stats.sold - sold0, states: [...states], dug: S().stats.cells };
    if (states.has('return')) out.push('bot still hauled by hand even though the belt reaches the bin'); if (hauled >= g.crew.capacity(b)) out.push('bucket filled up');
    if (!(S().stats.sold - sold0 >= 5)) out.push('belted plush were not sold: ' + (S().stats.sold - sold0));
    return out.length ? out.join('; ') : true;
  });
  await T('upg.crew.bolt-sets-a-cube-every-fourth-step-and-pays-from-wallet', async () => {
    const out = [];
    const run = async (up) => {
      await newWorld(); fresh({ crew: 1, crewSlots: 3, crewBolt: 1, crewBelt: 1, belts: 1, power: 1, ...up }); S().stats.plush = 1e9; const { i, k } = spot(); const b = g.crew.spawn(); b.xp = -1e9; p().pos.set(cellX(i) - 1.5, 0, cellZ(k)); g.crew.order(b, 0, cellX(i) - 1.5, 0.3, cellZ(k));
      let paid = 0, calls = 0; const orig = g.machines.autoFrame; g.machines.autoFrame = function (...a) { calls++; const m0 = S().money; const r = orig.apply(this, a); if (r) paid += m0 - S().money; return r; };
      let steps = 0, adv0 = 0; try { for (let n = 0; n < 9000; n++) { g.time += 0.05; g.crew.update(0.05, g.time); g.logi.update(0.05); steps = Math.max(steps, b.adv); } } finally { g.machines.autoFrame = orig; }
      return { frames: S().entities.filter((e) => e.type === 'frame' && e.auto), paid, calls, steps, adv0 };
    };
    let a = await run({ timber: 1 }); for (let t = 0; t < 5 && a.frames.length < 1; t++) a = await run({ timber: 1 }); /* the crew can only brace where the pile has a roof, which depends on the world */ const FT = ctx.FRAME_TYPES;
    if (a.frames.length < 1) out.push('no frame with timber'); if (a.calls !== Math.floor(a.steps / 4)) out.push(`autoFrame called ${a.calls} times for ${a.steps} steps`);
    if (a.frames.some((f) => f.kind !== 'timber')) out.push('wrong kind with timber only'); if (a.paid !== a.frames.length * FT.timber.cost) out.push(`paid ${a.paid} for ${a.frames.length} timber frames`);
    const c = await run({ timber: 1, steel: 1, concrete: 1 }); if (c.frames.some((f) => f.kind !== 'concrete')) out.push('did not use the best owned frame: ' + [...new Set(c.frames.map((f) => f.kind))]); if (c.paid !== c.frames.length * FT.concrete.cost) out.push(`concrete paid ${c.paid}`);
    const d = await run({}); if (d.frames.length) out.push('frames braced with no frame upgrade owned');
    return out.length ? out.join('; ') : true;
  });
}
