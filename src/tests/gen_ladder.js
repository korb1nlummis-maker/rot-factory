// gen.*: the generator ladder (Portable 2 kW, the ordinary 8 kW Generator unchanged, Turbine, Power Plant, Grid Power Station, Titan Plant).
// Every rung is a `gen` tile with a `gk` key (none = the ordinary Generator). Same plush burn rules: energy per plush / the rung's output.
import { makeKit, UP } from './power_lib.js';
import * as PP from '../powerparts.js';
import { BURN_SECONDS, GEN_BASE_KW, burnTime } from '../power.js';
import { pools, species } from '../plushdata.js';
import { infoFor } from '../info.js';

export default async function (ctx) {
  const { T, g, S, L, adv, recipes, UPGRADES, tiles, craft, selectTool, plan, placeNow, aimPoint, p } = ctx;
  const K = makeKit(ctx);
  const sp = (r) => pools[r][0];
  const FULL = { ...UP, genOutput: 3, genTurbine: 1, genPlant: 1, genStation: 1, genTitan: 1 };   // every rung unlocked (Turbine Upgrades 3)
  const BASE = 8;
  const gen = (key, x = -12, z = 3, extra = {}) => K.tile('gen', x, z, { gk: key === 'std' ? undefined : key, ...extra });
  const run = (seconds, dt = 0.1) => { for (let n = 0; n < seconds / dt; n++) { g.time += dt; g.power.update(dt); } };
  const KEYS = PP.GEN_KINDS.map((k) => k.key);
  const names = (list) => list.map((r) => r.id);

  await T('gen.ladder-numbers-climb-from-2-kw-to-a-titan-and-the-ordinary-generator-is-unchanged', async () => {
    const bad = [];
    const ks = PP.GEN_KINDS;
    if (ks.map((k) => k.key).join() !== 'portable,std,turbine,plant,grid,titan') bad.push('order ' + ks.map((k) => k.key));
    for (let n = 1; n < ks.length; n++) { if (!(ks[n].mul > ks[n - 1].mul && ks[n].hop >= ks[n - 1].hop && ks[n].price > ks[n - 1].price && ks[n].ports >= ks[n - 1].ports)) bad.push(`${ks[n].key} does not climb`); }
    K.reset(FULL);
    g.T.genOutput = BASE; g.T.genBuffer = 50;
    const out = Object.fromEntries(ks.map((k) => [k.key, PP.genKw(g.T, { gk: k.key })]));
    if (out.portable !== 2 || out.std !== 8 || out.turbine !== 48 || out.plant !== 240 || out.grid !== 1200 || out.titan !== 6400) bad.push('output ' + JSON.stringify(out));
    if (PP.genKw(g.T, {}) !== 8 || PP.genKw(g.T, { gk: 'nope' }) !== 8 || PP.genKw(g.T, { gk: 'std' }) !== 8) bad.push('an old or unknown generator is not 8 kW');
    const hop = Object.fromEntries(ks.map((k) => [k.key, PP.genHopper(g.T, { gk: k.key })]));
    if (hop.portable !== 50 || hop.std !== 50 || hop.turbine !== 100 || hop.plant !== 200 || hop.grid !== 400 || hop.titan !== 800) bad.push('hopper ' + JSON.stringify(hop));
    if (PP.GEN_STD.price !== 350 || PP.GEN_STD.grow !== 1.35) bad.push('the ordinary generator price changed');
    return bad.length === 0 || bad.join('; ');
  });

  await T('gen.unlock-chain-and-prices-fit-a-10m-wallet', async () => {
    const bad = [];
    const ids = ['genTurbine', 'genPlant', 'genStation', 'genTitan'], ups = ids.map((id) => UPGRADES.find((u) => u.id === id));
    if (ups.some((u) => !u)) return 'missing upgrades ' + ids.filter((id, n) => !ups[n]);
    for (let n = 1; n < ups.length; n++) if (ups[n].req.id !== ids[n - 1] || ups[n].cost[0] <= ups[n - 1].cost[0]) bad.push(ids[n] + ' does not chain on the one below');
    if (ups[0].req.id !== 'genOutput' || !UPGRADES.find((u) => u.id === 'genOutput')) bad.push('turbine is not behind Turbine Upgrades');
    if (ups[3].cost[0] < 1e8 || ups[2].cost[0] < 1e7 || ups[1].cost[0] < 1e6) bad.push('the top rungs are too cheap for a 10M wallet: ' + ups.map((u) => u.cost[0]));
    for (const u of ups) { if (u.cat !== 'machine' || u.max !== 1 || typeof u.effect !== 'function') bad.push(u.id + ' shape'); }
    K.reset({ ...UP, genOutput: 3 });
    if (recipes(g).some((r) => r.id === 'gen:turbine')) bad.push('turbine craftable before its upgrade');
    if (!recipes(g).some((r) => r.id === 'gen:portable')) bad.push('the portable generator comes with Power Grid');
    const rows = [];
    for (const [lvls, want, not] of [[{ genOutput: 3, genTurbine: 1 }, ['gen:turbine'], ['gen:plant']], [{ genOutput: 3, genTurbine: 1, genPlant: 1 }, ['gen:turbine', 'gen:plant'], ['gen:grid']], [FULL, ['gen:turbine', 'gen:plant', 'gen:grid', 'gen:titan'], []]]) {
      K.reset({ ...UP, ...lvls }); const have = names(recipes(g));
      for (const w of want) if (!have.includes(w)) bad.push(`${w} missing at ${JSON.stringify(lvls)}`);
      for (const w of not) if (have.includes(w)) bad.push(`${w} present too early`);
      rows.push(have.length);
    }
    K.reset(FULL);
    const prices = ['gen', 'gen:portable', 'gen:turbine', 'gen:plant', 'gen:grid', 'gen:titan'].map((id) => (recipes(g).find((r) => r.id === id) || {}).price);
    if (prices.some((q) => !(q > 0))) bad.push('prices ' + prices);
    if (!(prices[1] < prices[0] && prices[0] < prices[2] && prices[2] < prices[3] && prices[3] < prices[4] && prices[4] < prices[5])) bad.push('prices do not climb ' + prices);
    if (prices[5] < 1e8 || prices[4] < 1e7) bad.push('top rungs are priced under a 10M wallet: ' + prices);
    return bad.length === 0 || bad.join('; ');
  });

  await T('gen.bench-rows-say-what-they-are-and-how-long-fuel-lasts', async () => {
    K.reset(FULL);
    const bad = [];
    for (const k of PP.GEN_KINDS) {
      if (k.key === 'std') continue;
      const r = recipes(g).find((q) => q.id === k.id); if (!r) { bad.push(k.id + ' missing'); continue; }
      if (r.kind !== 'gen' || r.name !== k.name || !/Common lasts/.test(r.desc) || !/Power Cable/.test(r.desc) || !/hopper of \d+ plush/.test(r.desc) || !/hold|feed|belt|throw/i.test(r.use) || !/placed/.test(r.status)) bad.push(k.id + ' row: ' + JSON.stringify([r.kind, r.name, r.desc.slice(0, 40), r.use.slice(0, 20), r.status]));
      if (/\u2014/.test(r.desc + r.use + r.status)) bad.push(k.id + ' has an em dash');
    }
    g.T.genOutput = 8; const port = recipes(g).find((q) => q.id === 'gen:portable'); if (!/2\.0 kW/.test(port.desc) || !/a quarter of/.test(port.desc) || !/18 min/.test(port.desc) || !/Common lasts 18 min 0 s|Common lasts 18 min/.test(port.desc)) bad.push('portable desc ' + port.desc);
    return bad.length === 0 || bad.join(' | ');
  });

  await T('gen.every-rung-burns-by-the-same-rule-energy-over-output', async () => {
    const bad = [];
    for (const lvl of [0, 2]) {
      for (const key of KEYS) {
        K.reset({ ...FULL, genOutput: 3 + 0 });
        g.T.genOutput = BASE * (lvl ? 1.7 * 1.7 : 1); g.power.markDirty();
        const t = gen(key, -12, 3);
        for (let r = 0; r <= 3; r++) {
          t.q.length = 0; t.burn = 0; t.cur = null; t.lit = false; t.q.push({ sp: sp(r), vr: 0 });
          run(0.05, 0.05); const k = PP.genKindOf(t), want = BURN_SECONDS[r] / (k.mul * (lvl ? 1.7 * 1.7 : 1));
          if (!(t.burnMax > 0) || (want >= 1 && Math.abs(t.burnMax - want) > Math.max(0.05, want * 0.002)) || (want < 1 && t.burnMax < want - 1e-9)) bad.push(`${key} lvl ${lvl} rarity ${r}: ${t.burnMax} vs ${want}`);
          const cur = t.cur && species[t.cur.sp] && species[t.cur.sp].rarity; if (want >= 0.2 && cur !== r) bad.push(`${key} shows rarity ${cur} burning, want ${r}`);
        }
      }
    }
    if (BURN_SECONDS.slice(0, 4).join() !== PP.BURN_S_AT_8KW.join() || GEN_BASE_KW !== 8) bad.push('powerparts burn table drifted from power.js');
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  });

  await T('gen.supply-and-rated-cap-use-the-rungs-output', async () => {
    const bad = [];
    for (const key of KEYS) {
      K.reset(FULL); g.T.genOutput = BASE;
      const t = gen(key, -12, 3, { burn: 1e5, burnMax: 1e5, lit: true }); const pole = K.pole(-12, 4.4); void pole;
      adv(1); const net = K.netOf(t), kw = PP.genKw(g.T, t);
      if (!net || Math.abs(net.supply - kw) > 1e-6 || Math.abs(net.cap - kw) > 1e-6 || g.power.genOutput(t) !== kw) bad.push(`${key}: supply ${net && net.supply} cap ${net && net.cap} want ${kw}`);
      t.burn = 0; t.lit = false; adv(1); const n2 = K.netOf(t); if (!n2 || n2.supply !== 0 || Math.abs(n2.cap - kw) > 1e-6) bad.push(`${key} out of fuel: supply ${n2 && n2.supply} cap ${n2 && n2.cap}`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('gen.turbine-upgrades-fusion-and-dyson-scale-every-rung', async () => {
    const bad = [];
    for (const key of KEYS) {
      K.reset({ ...FULL, genOutput: 6, fusion: 1 }); const t = gen(key);
      const mult = Math.pow(1.7, 6) * 2.5, want = 8 * mult * PP.genKindOf(t).mul;
      if (Math.abs(PP.genKw(g.T, t) - want) > want * 1e-9) bad.push(`${key}: ${PP.genKw(g.T, t)} vs ${want}`);
    }
    K.reset({ ...FULL, genBuffer: 2 }); const pl = gen('plant'); if (PP.genHopper(g.T, pl) !== 4 * g.T.genBuffer) bad.push('the plant hopper does not follow Fuel Hoppers: ' + PP.genHopper(g.T, pl));
    return bad.length === 0 || bad.join('; ');
  });

  await T('gen.hopper-sizes-cap-belt-hand-and-throw-feeding-for-each-rung', async () => {
    const bad = [];
    for (const key of ['portable', 'std', 'turbine', 'plant']) {
      K.reset(FULL); g.T.genBuffer = 50; const t = gen(key), cap = PP.genHopper(g.T, t); t.q.length = 0;
      let taken = 0; for (let n = 0; n < cap + 20; n++) if (g.logi.accept(t, { sp: sp(n % 3), vr: 0 }, null)) taken++;
      if (taken !== cap || t.q.length !== cap) bad.push(`${key}: belt accepted ${taken}, hopper ${cap}`);
      if (g.logi.accept(t, { sp: sp(4), vr: 0 }, null)) bad.push(key + ' took a Legendary');
      t.q.length = 0; S().carry = []; g.T.carry = 2000; for (let n = 0; n < cap + 30; n++) S().carry.push({ sp: sp(n % 3), vr: 0 });
      g.useTile(t); if (t.q.length !== cap || S().carry.length !== 30) bad.push(`${key}: hand fed ${t.q.length}, left ${S().carry.length}`);
      const hint = K.hintText(); if (!new RegExp(`${cap}/${cap}`).test(hint) && !new RegExp(`Fed ${cap} plush`).test(hint)) bad.push(`${key}: hint "${hint}"`);
      g.useTile(t); if (!new RegExp(`full \\(${cap}/${cap}\\)`).test(K.hintText())) bad.push(key + ' full hint: ' + K.hintText());
    }
    // thrown plush
    K.reset(FULL); const t = gen('turbine', -6, 4); t.q.length = 0; const cap = PP.genHopper(g.T, t); for (let n = 0; n < cap - 1; n++) t.q.push({ sp: sp(0), vr: 0 });
    const gx = ctx.cellX(t.i), gz = ctx.cellZ(t.k), s = ctx.sim(); const keep = s.n;
    for (let n = 0; n < 4; n++) s.spawn(sp(1), 0, gx + 0.2 * n, 1.0, gz, 0, 0, 0, 1);
    g.feedGensFromThrows(); if (t.q.length !== cap) bad.push('thrown plush overfilled or did not fill: ' + t.q.length + '/' + cap);
    for (let i = s.n - 1; i >= keep; i--) s.remove(i);
    return bad.length === 0 || bad.join('; ');
  });

  await T('gen.a-fast-plant-takes-many-plush-a-frame-and-never-flickers', async () => {
    K.reset(FULL); g.T.genOutput = 180;   // a Titan Plant at 144 MW: a Common burns in 5 ms, so a 0.05 s frame eats ten of them
    const t = gen('titan'); for (let n = 0; n < 700; n++) t.q.push({ sp: sp(0), vr: 0 });
    const kw = PP.genKw(g.T, t), perSec = kw / (ENERGY0());
    const dt = 0.05; let supplyDark = 0; const q0 = t.q.length;
    for (let n = 0; n < 10; n++) { g.time += dt; g.power.update(dt); if (!(t.burn > 0)) supplyDark++; }
    const used = q0 - t.q.length, want = perSec * 10 * dt;
    return (used >= want * 0.8 && used <= want * 1.2 + 2 && supplyDark === 0) || `used ${used} plush in 0.5 s, energy says ${want.toFixed(1)}; dark frames ${supplyDark}`;
    function ENERGY0() { return BURN_SECONDS[0] * 8; }
  });

  await T('gen.hover-readout-names-the-rung-the-fuel-the-rate-and-the-hopper', async () => {
    const bad = [];
    for (const key of ['portable', 'std', 'turbine', 'titan']) {
      K.reset(FULL); g.T.genBuffer = 50; const t = gen(key); t.q.push({ sp: sp(2), vr: 0 }, { sp: sp(0), vr: 0 }, { sp: sp(3), vr: 0 }); run(0.2);
      const info = infoFor(g, { kind: 'tile', id: t.id }), txt = info.lines.join('\n'), k = PP.genKindOf(t), kw = PP.genKw(g.T, t), cur = species[t.cur.sp];
      const title = k.key === 'std' ? 'GENERATOR' : k.name.toUpperCase();
      if (!info.title.startsWith(title) || !/BURNING/.test(info.title) || !info.lit) bad.push(`${key} title "${info.title}"`);
      if (!txt.includes(cur.name) || !txt.includes('Rare')) bad.push(`${key}: burning plush not named`);
      const outTxt = kw < 1000 ? kw.toFixed(1) + ' kW' : PP.kwText(kw); if (!txt.includes('Output ' + outTxt)) bad.push(`${key}: output "${outTxt}" not in ${txt.split('\n')[1]}`);
      if (!new RegExp(`Hopper 2/${PP.genHopper(g.T, t)}: 1 Common, 1 Epic`).test(txt)) bad.push(`${key}: hopper line`);
      const rate = PP.secText(burnTime(0, kw)); if (!txt.includes('Common ' + rate)) bad.push(`${key}: Common rate "${rate}" missing: ${txt.split('\n')[2]}`);   // 'Per plush: Common 1 min 30 s, Uncommon ...'
      const left = Math.max(0, t.burn); if (!new RegExp('left of ' + PP.secText(t.burnMax).replace(/\./g, '\\.')).test(txt) || left <= 0) bad.push(`${key}: time left`);
      if (!/runs /.test(txt)) bad.push(key + ': no total run time');
      if (key !== 'std' && !new RegExp(`takes ${k.ports} cables`).test(txt)) bad.push(key + ': cable count');
    }
    K.reset(FULL); const o = gen('plant'); const dead = infoFor(g, { kind: 'tile', id: o.id }); if (!/OUT OF FUEL/.test(dead.title) || !/Not burning/.test(dead.lines[0])) bad.push('an empty plant does not say so');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('gen.aiming-at-a-plant-shows-the-readout-on-screen', async () => {
    K.reset(FULL); const t = gen('plant', -6, 2.4); t.q.push({ sp: sp(1), vr: 0 }); run(1);
    const x = ctx.cellX(t.i), z = ctx.cellZ(t.k); g.stowed = true; p().pos.set(x - 1.8, 0, z); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0.3;
    aimPoint(x, 0.8, z, 1.8); adv(0.1); g.renderer.camera.position.copy(p().eyePos(new ctx.V3())); g.hudT = 0; adv(0.2);
    const el = document.getElementById('tileInfo'), txt = el ? el.textContent : '';
    return (el && !el.classList.contains('hidden') && /POWER PLANT/.test(txt) && /Burning/.test(txt)) || `readout "${txt.slice(0, 90)}"`;
  });

  await T('gen.the-tool-stamps-the-rung-the-hammer-hands-it-back-and-the-ordinary-price-ignores-the-ladder', async () => {
    const bad = [];
    K.reset(FULL); const cost0 = g.genCost();
    const spots = [['gen:portable', 'portable', -4.8], ['gen:turbine', 'turbine', -3.0], ['gen:plant', 'plant', -1.2], ['gen:titan', 'titan', 0.6], ['gen', undefined, 2.4]];
    for (const [id, key, x] of spots) {
      craft(id); selectTool(id); aimPoint(x, 0, 2.4, 2.0); const pl = await plan(); if (!pl || !pl.ok) { bad.push(`${id}: ${pl && pl.why}`); continue; }
      if (placeNow() !== 1) { bad.push(id + ' not placed'); continue; }
      const t = tiles().filter((q) => q.type === 'gen').sort((a, b) => b.id - a.id)[0]; if (t.gk !== key) bad.push(`${id}: gk ${t.gk}`);
      const o = g.logi.objs.get(t.id); if (!o) bad.push(id + ' has no model'); else if (key && Math.abs(o.scale.x - PP.GEN_BY_KEY[key].scale) > 1e-6) bad.push(`${id}: model scale ${o.scale.x}`);
    }
    if (S().items['gen:portable'] || S().items['gen:titan']) bad.push('items not consumed');
    // five ladder tiles but only ONE ordinary generator: the ordinary price counted only that one
    if (g.genCost() !== Math.round(350 * 1.35)) bad.push(`genCost ${g.genCost()} (was ${cost0}) after one ordinary and four ladder gens`);
    S().items = {};
    for (const t of tiles().filter((q) => q.type === 'gen')) g.doDecon({ kind: 'tile', id: t.id });
    const want = { 'gen:portable': 1, 'gen:turbine': 1, 'gen:plant': 1, 'gen:titan': 1, gen: 1 };
    if (JSON.stringify(Object.entries(S().items).sort()) !== JSON.stringify(Object.entries(want).sort())) bad.push('hammer returned ' + JSON.stringify(S().items));
    if (g.genCost() !== cost0) bad.push('genCost after removing all ' + g.genCost());
    return bad.length === 0 || bad.join('; ');
  });

  await T('gen.bench-price-grows-per-rung-with-how-many-you-own', async () => {
    K.reset(FULL); const p0 = recipes(g).find((r) => r.id === 'gen:plant').price;
    gen('plant', -12, 3); gen('plant', -10, 3); gen('portable', -8, 3);
    const rows = recipes(g), p2 = rows.find((r) => r.id === 'gen:plant').price, pp = rows.find((r) => r.id === 'gen:portable').price;
    const want0 = Math.round(PP.GEN_BY_KEY.plant.price * 3), want2 = Math.round(PP.genPrice(PP.GEN_BY_KEY.plant, 2) * 3);
    return (p0 === want0 && p2 === want2 && p2 > p0 && pp === Math.round(PP.genPrice(PP.GEN_BY_KEY.portable, 1) * 3)) || `plant ${p0} ${p2} (want ${want0} ${want2}) portable ${pp}`;
  });

  await T('gen.cable-ports-grow-with-the-rung', async () => {
    const bad = [];
    for (const key of KEYS) {
      K.reset(FULL); const t = gen(key, -12, 3), lim = PP.GEN_BY_KEY[key].ports;
      if (PP.maxPorts(t, g) !== lim) bad.push(`${key}: maxPorts ${PP.maxPorts(t, g)} want ${lim}`);
      let ok = 0, refused = '';
      for (let n = 0; n < lim + 1; n++) { const f = K.fan(-12 + (n % 4) * 0.7, 6 + Math.floor(n / 4) * 0.7); const r = K.wire(t, f); if (r.ok) ok++; else refused = r.why; }
      if (ok !== lim || !new RegExp(`takes ${lim}`).test(refused)) bad.push(`${key}: wired ${ok} of ${lim}, refusal "${refused}"`);
    }
    return bad.length === 0 || bad.join('; ');
  });

  await T('gen.names-read-right-in-wire-messages', async () => {
    K.reset(FULL); const t = gen('plant'), f = K.fan(-12, 6); const r = K.wire(t, f); const hint = g.cables.describe(g.cables.list()[0]);
    return (r.ok && /Power Plant to Vent Fan/.test(hint.lines[0])) || JSON.stringify(hint);
  });

  await T('gen.save-and-reload-keeps-rung-fuel-and-model', async () => {
    K.reset(FULL); g.T.genOutput = 8; const t = gen('grid'); t.q.push({ sp: sp(2), vr: 0 }, { sp: sp(1), vr: 0 }, { sp: sp(3), vr: 0 }); run(1);
    const raw = JSON.parse(JSON.stringify(S().entities.find((e) => e.id === t.id)));
    if (raw.gk !== 'grid' || raw.q.length !== 2 || !(raw.burn > 0)) return 'saved ' + JSON.stringify([raw.gk, raw.q && raw.q.length, raw.burn]);
    g.logi.remove(t); S().entities = S().entities.filter((e) => e.id !== t.id); g.addEntity(raw); const back = L().byId.get(raw.id);
    const o = g.logi.objs.get(back.id);
    return (back && back.gk === 'grid' && PP.genKindOf(back).key === 'grid' && o && Math.abs(o.scale.x - 2.0) < 1e-6 && PP.genHopper(g.T, back) === 400) || 'reloaded ' + JSON.stringify(back && [back.gk, !!o]);
  });

  await T('gen.old-saves-and-bad-keys-stay-the-ordinary-generator', async () => {
    K.reset(FULL); const a = gen('std'), b = K.tile('gen', -9, 3, { gk: 'bogus' }), c = K.tile('gen', -7, 3, { gk: '__proto__' }), d = K.tile('gen', -5, 3, { gk: 'constructor' });
    for (const t of [a, b, c, d]) { if (PP.genKindOf(t).key !== 'std' || PP.genKw(g.T, t) !== g.T.genOutput || PP.genHopper(g.T, t) !== g.T.genBuffer || PP.maxPorts(t, g) !== PP.GEN_STD.ports) return 'an odd key changed a generator: ' + t.gk; }
    return true;
  });

  await T('gen.burning-plants-light-the-plush-wider-the-bigger-they-are', async () => {
    K.reset(FULL); const radius = [];
    for (const key of ['portable', 'std', 'titan']) {
      for (const t of tiles()) if (t.type === 'gen') g.logi.remove(t);
      const t = gen(key, -3, 3, { burn: 100, lit: true }); const cam = { x: ctx.cellX(t.i), y: 1.5, z: ctx.cellZ(t.k) };
      const src = g.glowSources(cam, 8).filter((q) => Math.abs(q.x - cam.x) < 0.01 && Math.abs(q.z - cam.z) < 0.01); radius.push(src.length ? src[0].r : -1);
    }
    return (radius[0] === PP.GEN_BY_KEY.portable.glow && radius[1] === 8 && radius[2] === PP.GEN_BY_KEY.titan.glow && radius[0] < radius[1] && radius[1] < radius[2]) || 'radii ' + radius;
  });

  await T('gen.a-belt-line-keeps-a-plant-fed-from-its-bigger-hopper', async () => {
    K.reset(FULL); const t = gen('plant', -6, 3), cap = PP.genHopper(g.T, t); t.q.length = 0;
    const b = K.tile('belt', -6.6, 3, { dir: 0 }); b.items = [];
    let n = 0; for (; n < cap + 10; n++) { if (!g.logi.accept(t, { sp: sp(0), vr: 0 }, 'belt')) break; }
    return (n === cap && cap > g.T.genBuffer) || `a plant took ${n} of ${cap}`;
  });

  await T('gen.no-em-dashes-in-the-new-strings', async () => {
    K.reset(FULL); const bad = [];
    for (const r of recipes(g)) if (/^gen:|^hlamp$/.test(r.id) && /[\u2014\u2013]/.test([r.name, r.desc, r.use, r.status].join(' '))) bad.push(r.id);
    for (const u of UPGRADES) if (/^gen(Turbine|Plant|Station|Titan)$/.test(u.id) && /[\u2014\u2013]/.test(u.name + u.desc)) bad.push(u.id);
    return bad.length === 0 || 'dashes in ' + bad;
  });
}
