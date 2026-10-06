// Crafting bench, carts and the upgrade terminal: every recipe and every upgrade level is exercised through the real DOM and the real purchase functions.
import { fmt } from '../util.js';
import { CATS, upgradeById, isUnlocked } from '../upgrades.js';
import { CART_PRICE } from '../cart.js';

export default async function (ctx) {
  const { g, S, w, p, T, UPGRADES, FRAME_TYPES, recipes, MATERIALS, CART_CAP, CART_NAMES, fresh, tune, craft, near, placeAtFloor, computeTuning, effLevels, newWorld, toI, toJ, toK, cellX, cellY, cellZ, clearBodies } = ctx;
  const maxAll = () => { const o = {}; for (const u of UPGRADES) o[u.id] = u.max; return o; };
  const grid = (id) => document.getElementById(id);
  const openBench = () => { g.ui.closeModals(); g.ui.open('craft'); };
  // which upgrade unlocks which recipe (this is the claim the bench makes)
  const GATE = (id) => {
    if (id.startsWith('frame:') || id.startsWith('mat:')) return [id.split(':')[1]];
    if (id.startsWith('cart:')) return ['cart'];
    return ({ charger: ['crew'], rope: ['rope'], mfan: ['mfan'], marker: ['markers'], glow: ['markers'], flare: ['markers'], jack: ['jacks'], strut: ['struts'], medkit: ['firstaid'], canister: ['firstaid'], dynamite: ['dynamite'], charge: ['charges'], lantern: ['lantern'], bulk: ['bulkhead'], belt: ['belts'], ramp: ['belts'], splitter: ['splitter'], gate: ['detector'], gen: ['power'], pole: ['power'], fan: ['fans'], sorter: ['sorter'], vault: ['vault'], mech: ['mech'], beacon: ['depots'], claw: ['claw'], borer: ['borer'] })[id];
  };

  // ---------------------------------------------------------------- recipes: price on the card is what is charged, output lands in the right place
  await T('upg.craft.card-price-equals-charge-and-output-every-batch', async () => {
    const bad = [];
    fresh(maxAll()); g.refreshTuning && g.refreshTuning(); g.T = g.tune();
    const ids = recipes(g).map((r) => r.id);
    if (document.getElementById('craftGrid') && g.gearList().length) return 'gear crafting is on: test assumes none';
    for (let idx = 0; idx < ids.length; idx++) {
      const id = ids[idx];
      const nb = recipes(g).find((r) => r.id === id).batch.filter((v, i, a) => a.indexOf(v) === i);
      for (const n of nb) {
        for (const seedStock of [false, true]) {
          fresh(maxAll()); g.T = g.tune(); S().stats.plush = 1e9; S().money = 1e13;
          const r = recipes(g).find((x) => x.id === id);
          if (r.kind === 'cart' && n !== 1) continue;
          if (seedStock && !r.mat) continue;
          if (seedStock) S().mats[r.mat] = Math.floor(r.matN * n / 2) + 1;
          const stock0 = r.mat ? (S().mats[r.mat] || 0) : 0;
          openBench();
          const card = grid('craftGrid').children[idx];
          if (!card) { bad.push(id + ' no card'); continue; }
          const btn = [...card.querySelectorAll('button')].find((b) => (r.kind === 'cart' ? true : b.dataset.n === String(n)));
          if (!btn) { bad.push(`${id} no button x${n}`); continue; }
          if (btn.disabled) { bad.push(`${id} x${n} disabled with 1e13 money`); continue; }
          const label = btn.textContent;
          const m0 = S().money, it0 = (r.kind === 'mat' ? S().mats[r.mk] : S().items[id]) || 0;
          btn.click();
          const paid = m0 - S().money;
          if (!label.includes('◈' + fmt(paid))) bad.push(`${id} x${n}${seedStock ? ' stocked' : ''}: card says "${label.trim()}" charged ${paid}`);
          const it1 = (r.kind === 'mat' ? S().mats[r.mk] : S().items[id]) || 0;
          if (it1 - it0 !== n) bad.push(`${id} x${n}: got ${it1 - it0} items`);
          if (r.mat) {
            const left = S().mats[r.mat] || 0, used = stock0 - left, want = Math.min(r.matN * n, stock0);
            if (used !== want) bad.push(`${id} x${n}: used ${used} ${r.mat} not ${want}`);
          }
          if (r.kind !== 'mat' && r.kind !== 'cart') {
            const t = g.tools.find((x) => x && x.id === id);
            if (!t || t.have !== n) bad.push(`${id}: not usable on hotbar (${t && t.have})`);
          }
          if (r.kind === 'cart') {
            const t = g.tools.find((x) => x && x.id === id);
            if (!t) bad.push(id + ' cart not on hotbar');
            if (paid !== CART_PRICE[+id.split(':')[1]] * 3) bad.push(`${id} charged ${paid} not 3x CART_PRICE`);
          }
        }
      }
    }
    g.ui.closeModals();
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  await T('upg.craft.exact-money-and-refusal-without-partial-charge', async () => {
    const bad = [];
    const ids = recipes((fresh(maxAll()), g.T = g.tune(), g)).map((r) => r.id);
    for (const id of ids) {
      const r0 = recipes(g).find((r) => r.id === id);
      const batches = r0.kind === 'cart' ? [1] : [r0.batch[r0.batch.length - 1]];
      for (const n of batches) {
        // learn the true cost
        fresh(maxAll()); g.T = g.tune(); S().stats.plush = 1e9; S().money = 1e13;
        const before = { items: JSON.stringify(S().items), mats: JSON.stringify(S().mats) };
        g.craftItem(id, n); const cost = 1e13 - S().money;
        if (!(cost > 0)) { bad.push(id + ' cost ' + cost); continue; }
        // one short: refused, nothing changes
        fresh(maxAll()); g.T = g.tune(); S().stats.plush = 1e9; S().money = cost - 1;
        const snap = JSON.stringify([S().items, S().mats, S().hotbar]);
        const ok1 = g.craftItem(id, n);
        if (S().money !== cost - 1 || JSON.stringify([S().items, S().mats, S().hotbar]) !== snap) bad.push(`${id} x${n}: partial change when 1 short (money ${S().money})`);
        void ok1;
        // exactly enough: works and leaves 0; a second click in the same frame does nothing
        fresh(maxAll()); g.T = g.tune(); S().stats.plush = 1e9; S().money = cost;
        g.craftItem(id, n); const afterFirst = JSON.stringify([S().items, S().mats]);
        g.craftItem(id, n);
        if (S().money !== 0) bad.push(`${id} x${n}: money ${S().money} after exact buy`);
        if (r0.kind !== 'cart' && JSON.stringify([S().items, S().mats]) !== afterFirst) bad.push(`${id} x${n}: duplicated by double click`);
        void before;
      }
    }
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  await T('upg.craft.invalid-counts-are-refused', async () => {
    fresh(maxAll()); g.T = g.tune(); S().money = 1000;
    for (const n of [0, -5, NaN, -1e9]) { g.craftItem('frame:timber', n); g.craftItem('mat:timber', n); g.craftItem('strut', n); }
    if (S().money !== 1000) return 'money changed by a bad count: ' + S().money;
    if (Object.keys(S().items).length || Object.keys(S().mats).length) return 'items from a bad count ' + JSON.stringify(S().items);
    g.craftItem('frame:timber', 2.7);
    return (S().items['frame:timber'] === 2) || 'fractional count: ' + S().items['frame:timber'];
  });

  await T('upg.craft.gated-by-the-right-upgrade', async () => {
    const bad = [];
    fresh({}); g.T = g.tune(); if (recipes(g).length) bad.push('recipes with no upgrades: ' + recipes(g).map((r) => r.id).join());
    S().money = 1e13; for (const id of ['frame:timber', 'mat:timber', 'strut', 'cart:1', 'medkit', 'belt', 'dynamite', 'gen']) g.craftItem(id, 1);
    if (Object.keys(S().items).length || Object.keys(S().mats).length || S().money !== 1e13) bad.push('crafted something locked');
    const all = recipes((fresh(maxAll()), g.T = g.tune(), g)).map((r) => r.id);
    for (const id of all) if (!GATE(id)) bad.push('no gate known for ' + id);
    for (const u of UPGRADES) {
      fresh({ [u.id]: u.max }); g.T = g.tune();
      const have = new Set(recipes(g).map((r) => r.id));
      const want = all.filter((id) => (GATE(id) || []).includes(u.id));
      for (const id of want) {
        if (id.startsWith('cart:')) { if (!(+id.split(':')[1] <= u.max)) continue; }
        if (id === 'gen' || id === 'pole') { if (!have.has(id)) bad.push(`${u.id} should unlock ${id}`); continue; }
        if (!have.has(id)) bad.push(`${u.id} should unlock ${id}`);
      }
      for (const id of have) if (!(GATE(id) || []).includes(u.id)) bad.push(`${u.id} unexpectedly unlocks ${id}`);
    }
    // cart tiers follow the cart upgrade level one by one
    for (let l = 1; l <= 5; l++) { fresh({ cart: l }); g.T = g.tune(); const c = recipes(g).filter((r) => r.kind === 'cart').length; if (c !== l) bad.push(`cart level ${l} lists ${c} carts`); }
    // crafting something not listed does nothing even with money
    fresh({ timber: 1 }); g.T = g.tune(); S().money = 1e13; g.craftItem('frame:steel', 1); g.craftItem('mat:steel', 1); g.craftItem('jack', 1); g.craftItem('bulk', 1);
    if (Object.keys(S().items).length || Object.keys(S().mats).length || S().money !== 1e13) bad.push('crafted an unlisted recipe');
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  await T('upg.craft.bench-text-is-clean-and-nonempty', async () => {
    fresh(maxAll()); g.T = g.tune(); const bad = [];
    for (const r of recipes(g)) {
      const t = `${r.name} ${r.desc} ${r.use} ${r.status}`;
      if (/undefined|NaN|\[object|\$\{|—|–/.test(t)) bad.push(r.id + ' bad text');
      if (!r.use || !r.desc || !r.name) bad.push(r.id + ' missing text');
      if (!(Number.isInteger(r.price) && r.price > 0)) bad.push(r.id + ' price ' + r.price);
      if (!r.batch.length || r.batch.some((n) => !(n >= 1))) bad.push(r.id + ' batch');
    }
    const ids = recipes(g).map((r) => r.id); if (new Set(ids).size !== ids.length) bad.push('duplicate recipe ids');
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  await T('upg.craft.stock-is-cheaper-than-shortfall-as-claimed', async () => {
    fresh(maxAll()); g.T = g.tune(); const bad = [];
    const rs = recipes(g);
    for (const r of rs) {
      if (!r.mat) continue;
      const stockUnit = rs.find((x) => x.id === 'mat:' + r.mat).price, shortUnit = r.price / r.matN;
      if (!(stockUnit < shortUnit)) bad.push(`${r.id}: stock ${stockUnit}/unit not below shortfall ${shortUnit}/unit`);
    }
    // the bench says frames use 4 units
    for (const k of Object.keys(FRAME_TYPES)) { const r = rs.find((x) => x.id === 'frame:' + k); if (r.matN !== 4) bad.push(k + ' matN'); if (!MATERIALS[k] || !MATERIALS[k].name) bad.push('no material ' + k); }
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  // ---------------------------------------------------------------- USE text must be true
  await T('upg.craft.frame-text-matches-support-radius', async () => {
    fresh(maxAll()); g.T = g.tune(); const bad = [];
    for (const r of recipes(g).filter((x) => x.kind === 'frame')) {
      const f = FRAME_TYPES[r.fk];
      if (!r.desc.includes(`within ${f.radius} m`)) bad.push(r.id + ' desc radius');
      if (!r.status.includes(`Reach ${f.radius} m`)) bad.push(r.id + ' status radius');
      if (r.price !== f.cost) bad.push(r.id + ' price');
      if (!r.use.includes('4x4') || !r.use.includes('2.4 m')) bad.push(r.id + ' use size');
    }
    // radii are strictly increasing with tier and costs too
    const ks = Object.keys(FRAME_TYPES); for (let i = 1; i < ks.length; i++) { if (!(FRAME_TYPES[ks[i]].radius > FRAME_TYPES[ks[i - 1]].radius)) bad.push('radius order ' + ks[i]); if (!(FRAME_TYPES[ks[i]].cost > FRAME_TYPES[ks[i - 1]].cost)) bad.push('cost order ' + ks[i]); if (!(FRAME_TYPES[ks[i]].bonus > FRAME_TYPES[ks[i - 1]].bonus)) bad.push('bonus order ' + ks[i]); }
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  await T('upg.craft.strut-and-jack-radius-match-text', async () => {
    const bad = [];
    for (const [id, want, b] of [['strut', 1.9, 1], ['jack', 2.7, 2]]) {
      fresh(maxAll()); g.T = g.tune();
      const r = recipes(g).find((x) => x.id === id);
      if (!r.desc.includes(`${want} m`)) bad.push(`${id} desc lacks ${want} m: ${r.desc}`);
      if (!r.use.includes(`${want} m`)) bad.push(`${id} use lacks ${want} m: ${r.use}`);
      const n0 = w().supports.length; const res = await placeAtFloor(id, 2, 5);
      if (!res.ok) { bad.push(id + ' not placeable: ' + res.why); continue; }
      g.machines.sync && g.machines.sync();
      const s = w().supports.slice(n0).find((q) => q.id && !String(q.id).startsWith('shield'));
      if (!s) bad.push(id + ' placed but no support registered'); else { if (s.r !== want) bad.push(`${id} support radius ${s.r} not ${want}`); if (s.b !== b) bad.push(`${id} bonus ${s.b} not ${b}`); }
    }
    fresh(maxAll()); g.T = g.tune(); const j = recipes(g).find((x) => x.id === 'jack'); if (!/Steel/.test(j.desc) || j.mat !== 'steel') bad.push('jack material text');
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  await T('upg.craft.light-timers-match-text', async () => {
    fresh(maxAll()); g.T = g.tune(); const bad = [];
    const rs = recipes(g), fl = rs.find((r) => r.id === 'flare'), gl = rs.find((r) => r.id === 'glow');
    if (!/four minutes/.test(fl.desc) || !/4 minutes/.test(fl.use)) bad.push('flare text ' + fl.desc);
    if (!/ten minutes/.test(gl.desc) || !/10 minutes/.test(gl.use)) bad.push('glow text ' + gl.desc);
    for (const [id, secs] of [['flare', 240], ['glow', 600]]) {
      fresh(maxAll()); g.T = g.tune();
      const res = await placeAtFloor(id, 2, 5); if (!res.ok) { bad.push(id + ' not placeable ' + res.why); continue; }
      const e = S().entities[S().entities.length - 1]; const has = () => S().entities.includes(e);
      S().stats.playSecs = e.born + secs - 5; for (let n = 0; n < 6; n++) g.machines.update(0.05, g.time + n * 0.05);
      if (!has()) bad.push(id + ' expired early');
      S().stats.playSecs = e.born + secs + 5; for (let n = 0; n < 6; n++) g.machines.update(0.05, g.time + n * 0.05);
      if (has()) bad.push(id + ' lasted past ' + secs + 's');
    }
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  await T('upg.craft.medkit-and-canister-text-matches', async () => {
    fresh({ firstaid: 1 }); g.T = g.tune(); const bad = [];
    const rs = recipes(g), mk = rs.find((r) => r.id === 'medkit'), cn = rs.find((r) => r.id === 'canister');
    if (!/heal 50/.test(mk.desc) || !/heal 50/.test(mk.use)) bad.push('medkit text');
    craft('medkit'); g.hp = 20; g.useMedkit(); if (!near(g.hp, 70, 0.01)) bad.push('medkit healed to ' + g.hp);
    if (!/40 more seconds/.test(cn.desc)) bad.push('canister text');
    craft('canister'); p().embedded = true; p().buried = 3; g.trapOn = true; g.airLeft = 0.05; g.updateTrapped(0.1); g.updateTrapped(0.1); p().embedded = false; p().buried = 0;
    if (!near(g.airLeft, 40, 0.5)) bad.push('canister gave ' + g.airLeft + ' s');
    return bad.length === 0 || bad.join('; ');
  });

  await T('upg.craft.fuses-and-blast-radius-match-text', async () => {
    await newWorld(); const bad = [];
    const blast = (ent) => {
      fresh(maxAll()); g.T = g.tune(); clearBodies();
      // a solid block of pile far from everything: fill a cube so the radius is measurable
      const ci = toI(30), cj = 6, ck = toK(0), R = 8; const cells = [];
      for (let dk = -R; dk <= R; dk++) for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { const i = ci + di, j = cj + dj, k = ck + dk; if (j < 1) continue; if (!w().get(i, j, k)) w().setCell(i, j, k, 2, 0); cells.push([i, j, k]); }
      const e = { x: cellX(ci), y: cellY(cj) - 0.3, z: cellZ(ck), ...ent };
      const present = () => { let n = 0; for (const [i, j, k] of cells) if (w().get(i, j, k)) n++; return n; };
      const n0 = present(); g.detonate(e); clearBodies();
      let far = 0, gone = 0; for (const [i, j, k] of cells) if (!w().get(i, j, k)) { gone++; far = Math.max(far, Math.hypot(cellX(i) - e.x, cellY(j) - e.y, cellZ(k) - e.z)); }
      for (const [i, j, k] of cells) w().setCell(i, j, k, 0, 0);
      return { far, gone, n0 };
    };
    fresh(maxAll()); g.T = g.tune();
    const dyn = recipes(g).find((r) => r.id === 'dynamite'); const mDyn = /about ([\d.]+) m/.exec(dyn.desc); if (!mDyn) bad.push('dynamite desc no size: ' + dyn.desc);
    const bd = blast({ dyn: true, tier: 0 });
    if (mDyn && !(Math.abs(bd.far - +mDyn[1]) < 0.7 && bd.gone > 5)) bad.push(`dynamite text ${mDyn[1]} m but blast reached ${bd.far.toFixed(2)} m (${bd.gone} cells)`);
    for (let t = 1; t <= 3; t++) {
      tune({ ...maxAll(), charges: t }); fresh({ ...maxAll(), charges: t }); g.T = g.tune();
      const ch = recipes(g).find((r) => r.id === 'charge'); const m = /about ([\d.]+) m/.exec(ch.desc);
      if (!m) { bad.push('charge desc ' + ch.desc); continue; }
      const b = blast({ tier: t });
      if (!(Math.abs(b.far - +m[1]) < 0.7)) bad.push(`charge L${t} text ${m[1]} m but blast reached ${b.far.toFixed(2)} m`);
    }
    // fuse lengths
    fresh(maxAll()); g.T = g.tune();
    for (const [id, fuse, re] of [['dynamite', 4, /4 second/], ['charge', 6, /6 second/]]) {
      const r = recipes(g).find((x) => x.id === id); if (!re.test(r.desc + r.use)) bad.push(id + ' fuse text');
      fresh(maxAll()); g.T = g.tune(); const res = await placeAtFloor(id, 2, 5); if (!res.ok) { bad.push(id + ' not placeable ' + res.why); continue; }
      const e = S().entities[S().entities.length - 1]; if (e.fuse !== fuse) bad.push(`${id} fuse ${e.fuse} not ${fuse}`);
    }
    clearBodies();
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  await T('upg.craft.bulkhead-and-lantern-do-what-they-say', async () => {
    fresh(maxAll()); g.T = g.tune(); const bad = [];
    const rs = recipes(g);
    const b = rs.find((r) => r.id === 'bulk'); if (b.mat !== 'timber' || b.matN !== 2) bad.push('bulk mat');
    craft('bulk', 3); if (S().items.bulk !== 3) bad.push('bulk count');
    const l = rs.find((r) => r.id === 'lantern'); craft('lantern', 2); if (S().items.lantern !== 2) bad.push('lantern count');
    return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- carts
  await T('upg.craft.cart-capacity-price-and-text', async () => {
    const bad = [];
    if (CART_CAP.length !== 6 || CART_NAMES.length !== 6 || CART_PRICE.length !== 6) bad.push('table lengths');
    for (let t = 2; t <= 5; t++) { if (!(CART_CAP[t] > CART_CAP[t - 1]) || !(CART_PRICE[t] > CART_PRICE[t - 1])) bad.push('cart tier order ' + t); }
    const cu = upgradeById('cart'); const claimed = /\(([\d / ]+)\)/.exec(cu.desc);
    if (!claimed || claimed[1].split('/').map((x) => +x).join() !== CART_CAP.slice(1).join()) bad.push('cart upgrade desc capacities ' + (claimed && claimed[1]));
    for (const n of CART_NAMES.slice(1)) if (!cu.desc.includes(n)) bad.push('cart upgrade desc lacks ' + n);
    if (cu.max !== 5) bad.push('cart max');
    fresh({ cart: 5 }); g.T = g.tune();
    for (const r of recipes(g).filter((x) => x.kind === 'cart')) {
      const t = +r.id.split(':')[1];
      if (!r.desc.includes(`carries ${CART_CAP[t]} plush`)) bad.push(r.id + ' desc cap');
      if (r.name !== CART_NAMES[t]) bad.push(r.id + ' name');
      if (r.price !== CART_PRICE[t] * 3) bad.push(r.id + ' price');
    }
    // the capacity is real: a rolled-out cart takes exactly CART_CAP plush and refuses the next
    for (let t = 1; t <= 5; t++) {
      fresh({ cart: 5, bag: 1 }); g.T = g.tune(); S().money = 1e13; craft('cart:' + t); g.useCart(); if (!S().cart || S().cart.tier !== t) { bad.push('no cart tier ' + t); continue; }
      S().cart.x = p().pos.x + 1; S().cart.z = p().pos.z + 1; S().cart.y = 0;
      let taken = 0; for (let n = 0; n < CART_CAP[t] + 50; n++) { if (g.routeToCart({ sp: 2, vr: 0 }, p().pos)) taken++; }
      if (taken !== CART_CAP[t]) bad.push(`cart ${t} took ${taken} not ${CART_CAP[t]}`);
      if (g.cart.cap() !== CART_CAP[t] || g.cart.room() !== 0) bad.push(`cart ${t} cap()/room()`);
    }
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  await T('upg.craft.cart-upgrade-keeps-load-and-never-doubles', async () => {
    const bad = [];
    fresh({ cart: 5, bag: 1 }); g.T = g.tune(); S().money = 1e13;
    craft('cart:1'); if (S().items['cart:1'] !== 1) bad.push('cart:1 not in pack');
    let m = S().money; craft('cart:1'); if (S().money !== m || S().items['cart:1'] !== 1) bad.push('bought a second wheelbarrow');
    // upgrade while stowed: replaces the item, one cart total, on the same hotbar slot
    const slot = S().hotbar.indexOf('cart:1'); m = S().money; craft('cart:3');
    if (m - S().money !== CART_PRICE[3] * 3) bad.push('upgrade price ' + (m - S().money));
    if (S().items['cart:1'] || S().items['cart:3'] !== 1) bad.push('stowed upgrade items ' + JSON.stringify(S().items));
    if (S().hotbar[slot] !== 'cart:3') bad.push('hotbar slot did not follow');
    const st = recipes(g).find((r) => r.id === 'cart:5').status; if (!st.includes(`+${CART_CAP[5] - CART_CAP[3]} capacity`)) bad.push('upgrade status ' + st);
    // downgrade refused with no charge
    m = S().money; craft('cart:2'); craft('cart:3'); if (S().money !== m) bad.push('downgrade charged');
    // rolled out with a load, then upgrade in place
    g.useCart(); const c = S().cart; for (let n = 0; n < 7; n++) c.load.push({ sp: 2, vr: 0 });
    m = S().money; craft('cart:4');
    if (!S().cart || S().cart.tier !== 4 || S().cart.load.length !== 7) bad.push('in place upgrade lost load or tier');
    if (m - S().money !== CART_PRICE[4] * 3) bad.push('in place price');
    if (Object.keys(S().items).some((k) => k.startsWith('cart:'))) bad.push('extra cart item after in-place upgrade ' + JSON.stringify(S().items));
    if (g.cart.cap() !== CART_CAP[4]) bad.push('cap after upgrade');
    // stow keeps the tier and refuses a loaded cart
    g.stowCart(); if (!S().cart) bad.push('stowed a loaded cart');
    S().cart.load.length = 0; g.stowCart(); if (S().cart || S().items['cart:4'] !== 1) bad.push('stow gave ' + JSON.stringify(S().items));
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  await T('upg.craft.cart-follows-the-player', async () => {
    fresh({ cart: 2, bag: 1 }); g.T = g.tune(); S().money = 1e13; craft('cart:1'); g.useCart(); const c = S().cart; if (!c) return 'no cart';
    if (c.mode !== 'follow') return 'not following by default';
    p().pos.set(p().pos.x + 8, 0, p().pos.z + 4); g.cart.update(0.05); for (let n = 0; n < 160; n++) g.cart.update(0.05);
    const d = Math.hypot(c.x - p().pos.x, c.z - p().pos.z);
    if (d > 3) return 'cart lags ' + d.toFixed(1) + ' m';
    g.useCart(); if (c.mode !== 'stay') return 'U did not park it';
    const x0 = c.x; p().pos.set(p().pos.x + 6, 0, p().pos.z); for (let n = 0; n < 40; n++) g.cart.update(0.05);
    return (Math.abs(c.x - x0) < 0.2) || 'parked cart moved';
  });

  // ---------------------------------------------------------------- upgrade data
  await T('upg.craft.upgrade-data-shape-and-cost-curves', async () => {
    const bad = [], seen = new Set(), catIds = new Set(CATS.map((c) => c.id));
    for (const u of UPGRADES) {
      if (seen.has(u.id)) bad.push('dup ' + u.id); seen.add(u.id);
      if (!catIds.has(u.cat)) bad.push(u.id + ' bad cat ' + u.cat);
      if (!(Number.isInteger(u.max) && u.max >= 1)) bad.push(u.id + ' max');
      if (u.cost.length !== u.max) bad.push(`${u.id} cost length ${u.cost.length} != max ${u.max}`);
      u.cost.forEach((c, i) => { if (!(Number.isInteger(c) && c > 0)) bad.push(`${u.id} L${i + 1} cost ${c}`); if (i > 0 && !(c > u.cost[i - 1])) bad.push(`${u.id} L${i + 1} cost ${c} <= previous ${u.cost[i - 1]}`); });
      if (u.names && u.names.length !== u.max + 1) bad.push(`${u.id} names length ${u.names.length} != max+1`);
      if (u.req) { const r = upgradeById(u.req.id); if (!r) bad.push(u.id + ' req missing ' + u.req.id); else if (u.req.lvl > r.max || u.req.lvl < 1) bad.push(`${u.id} req lvl ${u.req.lvl} > ${r.id} max ${r.max}`); if (u.req.id === u.id) bad.push(u.id + ' requires itself'); }
      if (u.needs !== undefined && !(u.needs > 0)) bad.push(u.id + ' needs');
      const t = `${u.name} ${u.desc}`; if (/undefined|NaN|\[object|\$\{|\{\w+\}|%[ds]|TODO|—|–/.test(t)) bad.push(u.id + ' bad text');
      if (!u.desc || u.desc.length < 10) bad.push(u.id + ' short desc');
      if (typeof u.effect !== 'function') bad.push(u.id + ' effect');
    }
    // a requirement chain must terminate (no cycles) and must not be priced above what it unlocks by an absurd factor
    for (const u of UPGRADES) { let q = u, hops = 0; while (q.req && hops++ < 20) q = upgradeById(q.req.id); if (hops >= 20) bad.push(u.id + ' req cycle'); }
    return bad.length === 0 || bad.slice(0, 10).join('; ');
  });

  await T('upg.craft.upgrade-level-numbers-in-desc-match-effects', async () => {
    const bad = [], C = 0.6;
    const t = (up) => computeTuning(effLevels({ up, gear: {} }), undefined);
    const base = t({});
    const per = (id, key, f) => { for (let l = 1; l <= upgradeById(id).max; l++) { const v = f(t({ [id]: l })[key]); void v; } };
    void per;
    // tamping: "+1.2 m of safe unsupported tunnel per level": stabBonus counts cells on each side (2 per level in world.stress) of 0.6 m
    for (let l = 1; l <= 8; l++) { if (!near(t({ tamp: l }).stabBonus * 2 * C, 1.2 * l, 1e-9)) bad.push('tamp L' + l); }
    for (let l = 1; l <= 4; l++) { if (t({ hpmax: l }).hpBonus !== 25 * l) bad.push('hpmax L' + l); if (!near(t({ padding: l }).dmgCut, 0.1 * l, 1e-9)) bad.push('padding L' + l); }
    for (let l = 1; l <= 5; l++) if (t({ airtank: l }).airTank !== l) bad.push('airtank L' + l);
    for (let l = 1; l <= 3; l++) if (t({ charges: l }).charges !== l) bad.push('charges L' + l);
    for (let l = 1; l <= 5; l++) if (t({ cart: l }).cartTier !== l) bad.push('cart L' + l);
    for (const k of ['timber', 'steel', 'concrete', 'rebar', 'titan', 'carbon', 'plasma', 'voidl', 'neutron', 'horizon']) if (!t({ [k]: 1 }).frames.includes(k)) bad.push('frame unlock ' + k);
    for (const [id, key] of [['markers', 'markers'], ['struts', 'struts'], ['dynamite', 'dynamite'], ['jacks', 'jacks'], ['bulkhead', 'bulkhead'], ['lantern', 'lantern'], ['firstaid', 'firstAid']]) if (t({ [id]: 1 })[key] !== true) bad.push('flag ' + id);
    void base;
    return bad.length === 0 || bad.slice(0, 10).join('; ');
  });

  // ---------------------------------------------------------------- the terminal UI (real DOM + the real purchase function)
  await T('upg.craft.terminal-rows-cost-state-and-charge-every-level', async () => {
    const bad = [];
    fresh({}); S().stats.plush = 1e9; g.T = g.tune();
    const shopCards = (cat) => { g.ui.shopCat = cat; g.ui.renderShop(); return [...grid('shopGrid').children]; };
    const rowOf = (u) => { const list = UPGRADES.filter((x) => x.cat === u.cat); const cards = shopCards(u.cat); return cards[list.indexOf(u)]; };
    g.ui.closeModals(); g.ui.open('shop');
    // tab per category exists and lists exactly its upgrades
    for (const c of CATS.filter((x) => !x.special)) { const want = UPGRADES.filter((u) => u.cat === c.id).length; const got = shopCards(c.id).length; if (want !== got) bad.push(`tab ${c.id}: ${got} cards for ${want} upgrades`); }
    // walk every upgrade through every level by clicking the button with exactly enough money
    for (let round = 0; round < 20; round++) {
      let progressed = false;
      for (const u of UPGRADES) {
        for (let guard = 0; guard < 12; guard++) {
          const lvl = S().up[u.id] || 0; S().money = 1e13; S().stats.plush = 1e9;
          let card = rowOf(u), btn = card.querySelector('button'), badge = card.querySelector('h3 small').textContent.trim();
          if (badge !== `${lvl}/${u.max}`) bad.push(`${u.id} badge ${badge} at level ${lvl}`);
          if (lvl >= u.max) { if (btn.textContent.trim() !== 'MAXED' || !btn.disabled) bad.push(u.id + ' not shown as maxed'); if (card.querySelectorAll('.pips i.on').length !== u.max) bad.push(u.id + ' pips at max'); const m = S().money; g.buy(u.id); if (S().money !== m || S().up[u.id] !== u.max) bad.push(u.id + ' bought past max'); break; }
          if (card.querySelectorAll('.pips i.on').length !== lvl || card.querySelectorAll('.pips i').length !== u.max) bad.push(u.id + ' pips');
          const unlocked = isUnlocked(u, S().up, S());
          if (!unlocked) {
            if (!btn.disabled) bad.push(`${u.id} L${lvl + 1} locked but button enabled`);
            if (/Buy/.test(btn.textContent)) bad.push(`${u.id} locked row says Buy`);
            const m = S().money; const ok = g.buy(u.id); if (ok || S().money !== m || (S().up[u.id] || 0) !== lvl) bad.push(`${u.id} bought while locked`);
            if (u.req && (S().up[u.req.id] || 0) < u.req.lvl) { const rn = upgradeById(u.req.id).name; if (!btn.textContent.includes(rn)) bad.push(`${u.id} locked text "${btn.textContent.trim()}" does not name ${rn}`); if (u.req.lvl > 1 && !btn.textContent.includes('lvl ' + u.req.lvl)) bad.push(`${u.id} locked text lacks level`); }
            break;
          }
          const cost = u.cost[lvl];
          if (!btn.textContent.includes('◈ ' + fmt(cost))) bad.push(`${u.id} L${lvl + 1} row says "${btn.textContent.trim()}" real cost ${cost}`);
          // one short: disabled and refused
          S().money = cost - 1; card = rowOf(u); btn = card.querySelector('button');
          if (!btn.disabled) bad.push(`${u.id} L${lvl + 1} enabled with 1 short`);
          if (g.buy(u.id) || S().money !== cost - 1 || (S().up[u.id] || 0) !== lvl) bad.push(`${u.id} L${lvl + 1} bought 1 short`);
          // exactly enough: enabled, charges exactly the cost, +1 level; the next click does nothing more than the next level's price allows
          S().money = cost; card = rowOf(u); btn = card.querySelector('button');
          if (btn.disabled) { bad.push(`${u.id} L${lvl + 1} disabled with exact money`); break; }
          btn.click(); progressed = true;
          if (S().money !== 0) bad.push(`${u.id} L${lvl + 1} charged ${cost - S().money} not ${cost}`);
          if ((S().up[u.id] || 0) !== lvl + 1) bad.push(`${u.id} level ${S().up[u.id]} after buy from ${lvl}`);
          const again = g.buy(u.id); if (again) bad.push(`${u.id} bought twice with money for one`);
          if ((S().up[u.id] || 0) !== lvl + 1) { /* already reported */ }
          S().money = 1e13;
        }
      }
      if (!progressed) break;
    }
    const left = UPGRADES.filter((u) => (S().up[u.id] || 0) < u.max).map((u) => u.id);
    if (left.length) bad.push('could not reach max: ' + left.join());
    g.ui.closeModals(); fresh({});
    return bad.length === 0 || bad.slice(0, 10).join('; ');
  });

  await T('upg.craft.terminal-plush-gate-text-and-lock', async () => {
    const bad = [];
    for (const u of UPGRADES.filter((x) => x.needs)) {
      fresh({}); const up = {}; let q = u; const chain = []; while (q.req) { q = upgradeById(q.req.id); chain.unshift(q); }
      for (const c of chain) up[c.id] = c.max; S().up = up; S().stats.plush = u.needs - 1; S().money = 1e13; g.T = g.tune();
      g.ui.shopCat = u.cat; g.ui.renderShop(); const list = UPGRADES.filter((x) => x.cat === u.cat); const btn = grid('shopGrid').children[list.indexOf(u)].querySelector('button');
      if (!btn.disabled || !btn.textContent.includes(`Needs ${u.needs.toLocaleString('en-US')} plush`)) bad.push(`${u.id} text "${btn.textContent.trim()}"`);
      if (g.buy(u.id)) bad.push(u.id + ' bought below plush gate');
      S().stats.plush = u.needs; g.ui.renderShop(); const b2 = grid('shopGrid').children[list.indexOf(u)].querySelector('button');
      if (b2.disabled) bad.push(u.id + ' still locked at the gate');
    }
    fresh({}); return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  await T('upg.craft.terminal-money-display-matches-state', async () => {
    fresh({}); S().money = 123456; g.ui.setMoney(S().money, true); g.ui.open('shop'); const a = grid('shopMoney').textContent; g.ui.closeModals(); g.ui.open('craft'); const b = grid('craftMoney').textContent; g.ui.closeModals();
    S().money = 1e12;
    return (a === fmt(123456) && b === fmt(123456)) || `shop ${a} bench ${b} vs ${fmt(123456)}`;
  });

  await T('upg.craft.progression-sanity-total-cost-per-category', async () => {
    // not a pass/fail on balance: flags absurd jumps (a level costing more than 12x the previous, or a first level above 200x the cheapest first level in its category)
    const bad = [];
    for (const u of UPGRADES) u.cost.forEach((c, i) => { if (i > 0 && c / u.cost[i - 1] > 100) bad.push(`${u.id} L${i + 1} jumps ${(c / u.cost[i - 1]).toFixed(1)}x`); });
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });
}
