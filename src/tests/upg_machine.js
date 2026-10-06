import { ENERGY_KJ } from '../power.js';
// Audit of the "machine" upgrade category: every upgrade, every level, must do what its name and text say.
// Run in the browser: `await __selftest('upg.machine.')`
import { fmt, compaction } from '../util.js';
import { isUnlocked, defaultTuning } from '../upgrades.js';
import { UPGRADES as CATALOG_UPGRADES } from '../catalog.js';
const CATALOG_IDS = new Set(CATALOG_UPGRADES.map((u) => u.id));

export default async function (ctx) {
  const { g, S, w, p, L, fresh, tune, T, tiles, UPGRADES, computeTuning, craft, selectTool, plan, placeNow, placeAtFloor, aimPoint, lookEast, newWorld, spot, cellX, cellZ, toI, toK, species, recipes, FRAME_TYPES } = ctx;
  const MU = UPGRADES.filter((u) => u.cat === 'machine');
  const byId = (id) => UPGRADES.find((u) => u.id === id);
  const spOf = (r) => { for (let i = 1; i < 960; i++) if (species[i] && species[i].rarity === r) return i; throw new Error('no species of rarity ' + r); };
  const mk = (type, i, j, k, extra = {}) => {
    const e = { id: g.nextId(), type, i, j, k, dir: 0, rise: 0, ...extra };
    if (type === 'belt') e.items = [];
    S().entities.push(e); g.addEntity(e); return e;
  };
  const I0 = () => toI(-6.6), K0 = () => toK(0.0);
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  // levels map that satisfies the direct requirement of an upgrade
  const withReq = (u, extra = {}) => { const up = { ...extra }; if (u.req) up[u.req.id] = Math.max(up[u.req.id] || 0, u.req.lvl); return up; };

  await T('upg.machine.catalog-costs-and-requirements-are-sane', async () => {
    { const own = MU.filter((u) => !CATALOG_IDS.has(u.id)); if (own.length !== 61) return 'expected 61 machine upgrades, found ' + own.length; }   // 33, the 9 endgame perks counted among them, plus 28 added later (earth movers and top levels, see levels_machine.js); catalog_*.js parts are counted by their own tests
    for (const u of MU) {
      if (u.cost.length !== u.max) return `${u.id}: ${u.cost.length} costs for max ${u.max}`;
      for (let l = 0; l < u.max; l++) { if (!(u.cost[l] > 0) || !Number.isInteger(u.cost[l])) return `${u.id}: bad cost ${u.cost[l]} at ${l}`; if (l && u.cost[l] <= u.cost[l - 1]) return `${u.id}: cost not rising at level ${l + 1}`; }
      if (u.req) { const r = byId(u.req.id); if (!r) return `${u.id}: unknown req ${u.req.id}`; if (u.req.lvl > r.max) return `${u.id}: req level ${u.req.lvl} above ${r.id} max ${r.max}`; }
      if (/—|–/.test(u.desc)) return `${u.id}: dash in desc`;
      // follow the requirement chain: no cycles
      let n = 0, c = u; while (c.req && n++ < 20) c = byId(c.req.id); if (n >= 20) return `${u.id}: requirement cycle`;
    }
    // every level must change the tuning (an effect that is overwritten or never applied is a false claim)
    for (const u of MU) {
      let prev = JSON.stringify(computeTuning({}, null));
      for (let l = 1; l <= u.max; l++) {
        const cur = JSON.stringify(computeTuning({ [u.id]: l }, null));
        if (cur === prev) return `${u.id}: level ${l} changes nothing in the tuning`;
        prev = cur;
      }
    }
    return true;
  });

  await T('upg.machine.every-upgrade-can-be-bought-to-max-through-the-game', async () => {
    fresh({}); S().money = 1e15; S().stats.plush = 1e9;
    let progress = true, guard = 0;
    while (progress && guard++ < 400) {
      progress = false;
      for (const u of UPGRADES) { if (g.buy(u.id)) progress = true; }
    }
    const miss = MU.filter((u) => (S().up[u.id] || 0) !== u.max).map((u) => `${u.id} ${S().up[u.id] || 0}/${u.max}`);
    return miss.length ? 'not reachable: ' + miss.join() : true;
  });

  await T('upg.machine.purchase-charges-exact-cost-and-gates-on-requirement', async () => {
    for (const u of MU) {
      for (let l = 0; l < u.max; l++) {
        fresh(); S().up = withReq(u, { [u.id]: l }); g.T = g.tune();
        const before = JSON.stringify(g.T);
        S().money = u.cost[l] - 1;
        if (g.buy(u.id)) return `${u.id} L${l + 1}: bought with ${u.cost[l] - 1} < cost ${u.cost[l]}`;
        if (S().money !== u.cost[l] - 1 || (S().up[u.id] || 0) !== l) return `${u.id} L${l + 1}: failed purchase changed state`;
        S().money = u.cost[l] + 17;
        if (!g.buy(u.id)) return `${u.id} L${l + 1}: could not buy at cost ${u.cost[l]}`;
        if (S().money !== 17) return `${u.id} L${l + 1}: charged ${u.cost[l] + 17 - S().money}, expected ${u.cost[l]}`;
        if (S().up[u.id] !== l + 1) return `${u.id}: level ${S().up[u.id]} after buying L${l + 1}`;
        const want = JSON.stringify(computeTuning(S().up, S().boosts));
        if (JSON.stringify(g.T) !== want) return `${u.id} L${l + 1}: g.T not refreshed at purchase`;
        if (JSON.stringify(g.T) === before) return `${u.id} L${l + 1}: purchase changed no tuning`;
      }
      // maxed: refuses
      fresh(); S().up = withReq(u, { [u.id]: u.max }); S().money = 1e12; g.T = g.tune();
      if (g.buy(u.id) || S().money !== 1e12) return `${u.id}: bought past max`;
      // requirement missing: refuses and does not charge
      if (u.req) {
        fresh(); S().money = 1e12; S().up = {}; g.T = g.tune();
        if (isUnlocked(u, S().up, S())) return `${u.id}: unlocked with no requirement`;
        if (g.buy(u.id) || S().money !== 1e12 || S().up[u.id]) return `${u.id}: bought without ${u.req.id} ${u.req.lvl}`;
        if (u.req.lvl > 1) { S().up = { [u.req.id]: u.req.lvl - 1 }; if (g.buy(u.id)) return `${u.id}: bought with ${u.req.id} ${u.req.lvl - 1}`; }
      }
    }
    return true;
  });

  await T('upg.machine.terminal-card-shows-name-and-gates-the-buy-button', async () => {
    for (const u of MU) {
      fresh(); S().up = withReq(u); S().money = u.cost[0] - 1; g.ui.shopCat = 'machine'; g.ui.renderShop();
      const card = [...document.querySelectorAll('#shopGrid .card')].find((c) => c.querySelector('h3 span').textContent === u.name);
      if (!card) return `${u.id}: no terminal card`;
      const btn = card.querySelector('button');
      if (!btn.disabled) return `${u.id}: buy button enabled when poor`;
      if (!btn.textContent.includes(fmt(u.cost[0]))) return `${u.id}: card shows "${btn.textContent.trim()}", cost ${u.cost[0]}`;
      S().money = u.cost[0]; g.ui.renderShop();
      const card2 = [...document.querySelectorAll('#shopGrid .card')].find((c) => c.querySelector('h3 span').textContent === u.name);
      if (card2.querySelector('button').disabled) return `${u.id}: buy button disabled when affordable`;
      if (u.req) { fresh(); S().money = 1e12; g.ui.shopCat = 'machine'; g.ui.renderShop(); const c3 = [...document.querySelectorAll('#shopGrid .card')].find((c) => c.querySelector('h3 span').textContent === u.name); if (!c3.querySelector('button').disabled) return `${u.id}: buy button enabled without requirement`; }
    }
    g.ui.closeModals(); return true;
  });

  // -------------------------------------------------------------------------------- unlocks gate crafting
  await T('upg.machine.unlock-upgrades-gate-the-recipes', async () => {
    const map = { power: ['gen', 'pole'], fans: ['fan'], belts: ['belt', 'ramp'], splitter: ['splitter'], detector: ['gate'], sorter: ['sorter'], vault: ['vault'], mech: ['mech'], depots: ['beacon'], claw: ['claw'], borer: ['borer'] };
    for (const [up, ids] of Object.entries(map)) {
      fresh(); S().money = 1e12; g.T = g.tune();
      for (const id of ids) {
        if (recipes(g).some((r) => r.id === id)) return `${id} craftable without ${up}`;
        const it0 = S().items[id] || 0; if (g.craftItem(id, 1) || (S().items[id] || 0) !== it0) return `${id} crafted without ${up}`;
      }
      fresh({ [up]: 1 }); S().money = 1e12; g.T = g.tune(); g.rebuildTools();
      for (const id of ids) {
        const r = recipes(g).find((x) => x.id === id); if (!r) return `${id} not craftable with ${up}`;
        const m0 = S().money; if (!g.craftItem(id, 1)) return `${id} craft refused with ${up}`;
        if (m0 - S().money !== r.price) return `${id}: terminal says ${r.price}, charged ${m0 - S().money}`;
        if ((S().items[id] || 0) !== 1) return `${id}: item not granted`;
      }
    }
    return true;
  });

  // -------------------------------------------------------------------------------- belts
  await T('upg.machine.belt-motors-speed-matches-tuning-at-every-level', async () => {
    const rows = [];
    for (let l = 0; l <= 6; l++) {
      fresh({ power: 1, belts: 1, vault: 1, beltSpeed: l }); const spd = g.T.beltSpeed;
      if (!near(spd, 1.6 * Math.pow(1.3, l), 1e-9)) return `L${l}: beltSpeed ${spd}`;
      const N = 12, i0 = I0(), k0 = K0(); const belts = [];
      for (let n = 0; n < N; n++) belts.push(mk('belt', i0 + n, 0, k0, { dir: 0 }));
      const vault = mk('vault', i0 + N, 0, k0, { dir: 0 });
      belts[0].items.push({ sp: spOf(0), vr: 0, t: 0 });
      const dt = 1 / 60; let t = 0;
      while (!vault.stored.length && t < 40) { for (const b of belts) b.pw = 1; g.time += dt; L().update(dt); t += dt; }
      rows.push(`L${l}: ${t.toFixed(2)}s`);
      const ideal = N / spd; if (t > ideal * 1.25 + 0.1 || t < ideal * 0.85) return `L${l}: 12 tiles took ${t.toFixed(2)}s, ideal ${ideal.toFixed(2)}s (speed ${spd.toFixed(2)})`;
    }
    return true;
  });

  await T('upg.machine.belt-motors-raise-line-throughput', async () => {
    let prev = 0;
    for (let l = 0; l <= 6; l++) {
      fresh({ power: 1, belts: 1, vault: 1, beltSpeed: l }); const spd = g.T.beltSpeed;
      const N = 6, i0 = I0(), k0 = K0(); const belts = [];
      for (let n = 0; n < N; n++) belts.push(mk('belt', i0 + n, 0, k0, { dir: 0 }));
      const vault = mk('vault', i0 + N, 0, k0, { dir: 0 });
      const dt = 1 / 60; let c0 = -1; const win = 3;
      for (let tk = 0; tk < (5 + win) / dt; tk++) {
        for (const b of belts) b.pw = 1;
        L().accept(belts[0], { sp: spOf(0), vr: 0 }, null);
        g.time += dt; L().update(dt);
        if (tk >= Math.round(5 / dt)) { if (c0 < 0) c0 = 0; c0 += vault.stored.length; }
        vault.stored.length = 0;
      }
      const rate = c0 / win;
      if (rate <= prev) return `L${l}: ${rate.toFixed(1)} items/s not above previous ${prev.toFixed(1)}`;
      if (rate < spd / 0.34 * 0.7) return `L${l}: ${rate.toFixed(1)} items/s, expected near ${(spd / 0.34).toFixed(1)}`;
      prev = rate;
    }
    return true;
  });

  // -------------------------------------------------------------------------------- generators and power
  await T('upg.machine.turbine-output-and-burn-time-per-level', async () => {
    for (let l = 0; l <= 6; l++) {
      fresh({ power: 1, belts: 1, genOutput: l }); const out = g.T.genOutput;
      if (!near(out, 8 * Math.pow(1.7, l), 1e-9)) return `L${l}: genOutput ${out}`;
      const i0 = I0(), k0 = K0();
      const gen = mk('gen', i0, 0, k0), pole = mk('pole', i0 + 2, 0, k0);
      const mechs = []; for (let n = 0; n < 8; n++) mechs.push(mk('mech', i0 + 3 + n, 0, k0 + 1, { dir: 0, off: true }));
      gen.q.push({ sp: spOf(0), vr: 0 });
      g.power.update(0.01); g.power.update(0.01); g.power.recompute();
      const net = g.power.nets[0]; if (!net) return `L${l}: no net`;
      if (!near(net.cap, out, 1e-9) || !near(net.supply, out, 1e-9)) return `L${l}: grid cap ${net.cap} supply ${net.supply}, expected ${out}`;
      const want = Math.min(1, out / (8 * 3.5)); if (!near(mechs[0].pw, want, 0.01)) return `L${l}: machines run at ${mechs[0].pw}, expected ${want} (supply ${out} vs demand 28)`;
      let tt = 0.02; while ((gen.burn > 0 || gen.lit) && tt < 400) { g.power.update(0.01); tt += 0.01; }
      const expect = ENERGY_KJ[0] / out; if (!near(tt, expect + 0.02, 0.04)) return `L${l}: a Common plush burned ${tt.toFixed(2)}s, expected ${expect.toFixed(2)}s`;
    }
    return true;
  });

  await T('upg.machine.fuel-hoppers-capacity-per-level', async () => {
    for (let l = 0; l <= 3; l++) {
      fresh({ power: 1, genBuffer: l }); const cap = [50, 100, 200, 400][l];
      if (g.T.genBuffer !== cap) return `L${l}: genBuffer ${g.T.genBuffer}`;
      const gen = mk('gen', I0(), 0, K0()); let n = 0;
      while (L().accept(gen, { sp: spOf(0), vr: 0 }, null) && n < 500) n++;
      if (n !== cap) return `L${l}: belt-fed generator took ${n}, expected ${cap}`;
      if (L().accept(gen, { sp: spOf(5), vr: 0 }, null)) return 'generator took a Mythic';
      gen.q.length = 0; S().carry = []; for (let q = 0; q < 450; q++) S().carry.push({ sp: spOf(1), vr: 0 });
      g.useTile(gen); if (gen.q.length !== cap) return `L${l}: hand-fed generator took ${gen.q.length}, expected ${cap}`;
      g.power.update(0.01); if (gen.fuelCap !== cap) return `L${l}: fuelCap ${gen.fuelCap}`;
    }
    return true;
  });

  await T('upg.machine.grid-range-reach-and-link-per-level', async () => {
    for (let l = 0; l <= 4; l++) {
      fresh({ power: 1, belts: 1, gridRange: l });
      const reach = 7 + 1.5 * l, link = 14 + 4 * l;
      if (!near(g.T.poleReach, reach, 1e-9) || !near(g.T.poleLink, link, 1e-9)) return `L${l}: reach ${g.T.poleReach} link ${g.T.poleLink}`;
      // reach: a belt just inside / just outside a pole's reach (generator sits on the far side so it never feeds the belts)
      const i0 = I0(), k0 = K0() - 5; const nIn = Math.floor(reach / 0.6);
      const gen = mk('gen', i0 - 1, 0, k0, { burn: 500, lit: true }); const pole = mk('pole', i0, 0, k0);
      const bIn = mk('belt', i0 + nIn, 0, k0, { dir: 0 }), bOut = mk('belt', i0 + nIn + 1, 0, k0, { dir: 0 });
      g.power.recompute();
      if (!(bIn.pw > 0)) return `L${l}: belt ${nIn * 0.6}m from the pole not powered (reach ${reach})`;
      if (bOut.pw > 0) return `L${l}: belt ${(nIn + 1) * 0.6}m from the pole powered (reach ${reach})`;
      // link: a second pole just inside / just outside link range of the first one
      fresh({ power: 1, belts: 1, gridRange: l });
      const nl = Math.floor(link / 0.6); const a = I0(), b = a + nl;
      const g2 = mk('gen', a, 0, k0, { burn: 500, lit: true });
      const pIn = mk('pole', b, 0, k0), cIn = mk('belt', b, 0, k0 + 1, { dir: 0 });
      const pOut = mk('pole', a - nl - 1, 0, k0), cOut = mk('belt', a - nl - 1, 0, k0 + 1, { dir: 0 });
      g.power.recompute();
      if (!(cIn.pw > 0)) return `L${l}: pole ${nl * 0.6}m from the generator did not link (link ${link})`;
      if (cOut.pw > 0) return `L${l}: pole ${(nl + 1) * 0.6}m from the generator linked (link ${link})`;
      void g2; void pIn; void pOut; void pole; void gen;
    }
    return true;
  });

  // -------------------------------------------------------------------------------- fans
  await T('upg.machine.vent-fan-clears-dust-within-14m-only', async () => {
    fresh({ power: 1, fans: 1 });
    const i0 = I0(), k0 = K0(); const fan = mk('fan', i0, 0, k0); fan.pw = 1;
    const fx = cellX(i0), fz = cellZ(k0);
    const run = (d, withFan) => {
      g.dust.cells.clear(); g.dust.add(fx + d, 1.0, fz, 1.5);
      fan.type = withFan ? 'fan' : 'fanoff';
      for (let n = 0; n < 12; n++) { fan.pw = 1; g.dust.t = 0; g.dust.update(0.5); }
      fan.type = 'fan';
      return g.dust.at(fx + d, 1.0, fz);
    };
    for (const d of [2, 6, 9, 12, 15, 18, 25]) {
      const cx = (Math.floor((fx + d) / 3) + 0.5) * 3, cy = (Math.floor(1.0 / 2.4) + 0.5) * 2.4, cz = (Math.floor(fz / 3) + 0.5) * 3;
      const dist = Math.hypot(cx - fx, cy - 0.8, cz - fz);
      const off = run(d, false), on = run(d, true);
      if (dist < 13.5 && !(on < off * 0.97)) return `fan ${dist.toFixed(1)} m away did not clear dust: ${on} vs ${off} without`;
      if (dist > 14.2 && !near(on, off, off * 0.01)) return `fan cleared dust ${dist.toFixed(1)} m away: ${on} vs ${off}`;
    }
    return true;
  });

  // -------------------------------------------------------------------------------- sorting boxes
  const sorterRig = (filterMode = 0) => {
    const i0 = I0(), k0 = K0() + 4;
    const sorter = mk('sorter', i0, 0, k0, { dir: 0 });
    const vault = mk('vault', i0 + 1, 0, k0, { dir: 0 });
    return { sorter, vault };
  };
  const runSort = (sorter, vault, sp, steps = 80) => {
    const m0 = S().money, v0 = vault.stored.length;
    L().accept(sorter, { sp, vr: 0 }, null);
    for (let n = 0; n < steps; n++) { sorter.pw = 1; vault.pw = 1; g.time += 0.05; L().update(0.05); }
    return { sold: S().money > m0, kept: vault.stored.length - v0 };
  };

  await T('upg.machine.rarity-optics-modes-and-filtering-per-level', async () => {
    for (let l = 0; l <= 5; l++) {
      fresh({ power: 1, belts: 1, sorter: 1, vault: 1, optics: l });
      if (g.T.sorterTiers !== l) return `L${l}: sorterTiers ${g.T.sorterTiers}`;
      const { sorter, vault } = sorterRig();
      const seq = []; for (let n = 0; n < l + 2; n++) { g.useTile(sorter); seq.push(sorter.filter); }
      const want = []; for (let m = 1; m <= l; m++) want.push(m); want.push(0, 7);
      if (seq.join() !== want.join()) return `L${l}: filter cycle ${seq.join()}, expected ${want.join()}`;
      // walk every mode and check the behaviour with each rarity
      for (const f of want) {
        while (sorter.filter !== f) g.useTile(sorter);
        for (let r = 0; r <= 5; r++) {
          const res = runSort(sorter, vault, spOf(r));
          const shouldSell = r < sorter.filter;
          if (shouldSell && (!res.sold || res.kept)) return `L${l} filter ${f}: rarity ${r} should sell, got ${JSON.stringify(res)}`;
          if (!shouldSell && (res.sold || res.kept !== 1)) return `L${l} filter ${f}: rarity ${r} should pass on, got ${JSON.stringify(res)}`;
        }
      }
    }
    return true;
  });

  await T('upg.machine.sorting-box-speed-follows-belt-motors', async () => {
    for (let l = 0; l <= 6; l++) {
      fresh({ power: 1, belts: 1, sorter: 1, vault: 1, beltSpeed: l }); const { sorter, vault } = sorterRig();
      const m0 = S().money; L().accept(sorter, { sp: spOf(1), vr: 0 }, null);
      let t = 0; while (S().money === m0 && t < 20) { sorter.pw = 1; vault.pw = 1; g.time += 0.01; L().update(0.01); t += 0.01; }
      const want = 1 / (1.4 * g.T.beltSpeed); if (!near(t, want, 0.03)) return `L${l}: sorted in ${t.toFixed(2)}s, expected ${want.toFixed(2)}s`;
    }
    return true;
  });

  await T('upg.machine.sorting-box-sucks-in-carried-plush-nearby', async () => {
    fresh({ power: 1, belts: 1, sorter: 1, vault: 1 }); const { sorter, vault } = sorterRig();
    const x = cellX(sorter.i), z = cellZ(sorter.k);
    S().carry = []; for (let q = 0; q < 3; q++) S().carry.push({ sp: spOf(1), vr: 0 });
    p().pos.set(x, 0, z + 20); for (let n = 0; n < 20; n++) { g.autoDump(0.1); }
    if (S().carry.length !== 3 || sorter.q.length) return 'sorter pulled plush from 20 m away';
    p().pos.set(x, 0, z + 2.0); for (let n = 0; n < 20; n++) { g.autoDump(0.1); }
    return (S().carry.length === 0 && sorter.q.length === 3) || `carry ${S().carry.length} sorter ${sorter.q.length}`;
  });

  // -------------------------------------------------------------------------------- splitter, vault, detector gate
  await T('upg.machine.splitter-deals-three-ways-evenly', async () => {
    fresh({ power: 1, belts: 1, splitter: 1, vault: 1 });
    const i0 = I0(), k0 = K0() + 6; const belts = [];
    for (let n = 0; n < 3; n++) belts.push(mk('belt', i0 + n, 0, k0, { dir: 0 }));
    const sp = mk('belt', i0 + 3, 0, k0, { dir: 0, splitter: true });
    const f = mk('vault', i0 + 4, 0, k0), l = mk('vault', i0 + 3, 0, k0 + 1), r = mk('vault', i0 + 3, 0, k0 - 1);
    for (let n = 0; n < 1500; n++) { for (const b of [...belts, sp]) b.pw = 1; if (n % 6 === 0 && n < 1200) L().accept(belts[0], { sp: spOf(0), vr: 0 }, null); g.time += 0.02; L().update(0.02); }
    const c = [f, l, r].map((v) => v.stored.length); const tot = c[0] + c[1] + c[2];
    return (tot >= 100 && Math.max(...c) - Math.min(...c) <= 2) || `split ${c.join('/')}`;
  });

  await T('upg.machine.vault-stores-and-empties-into-hands-up-to-carry', async () => {
    fresh({ power: 1, belts: 1, vault: 1, bag: 2 }); const v = mk('vault', I0(), 0, K0() + 8);
    for (let q = 0; q < 10; q++) v.stored.push({ sp: spOf(1), vr: 0 });
    S().carry = []; g.useTile(v);
    return (S().carry.length === g.T.carry && v.stored.length === 10 - g.T.carry) || `took ${S().carry.length} of carry ${g.T.carry}`;
  });

  await T('upg.machine.detector-gates-have-no-limit-and-scan-belts', async () => {
    fresh({ power: 1, belts: 1, detector: 1 }); g.rebuildTools();
    let n = 0;
    for (let q = 0; q < 5; q++) { const r = await placeAtFloor('gate', -9 + q * 1.6, 1.0, 2.0); if (!r.ok) return `gate ${q + 1}: ${r.why}`; n += r.placed; }
    const gates = tiles().filter((t) => t.detector && !t.free);
    return (gates.length === 5) || `placed ${gates.length} gates`;
  });

  // -------------------------------------------------------------------------------- mechs, claw rigs, borers (limits)
  await T('upg.machine.mech-limit-follows-mech-fleet', async () => {
    fresh({ power: 1, belts: 1, sorter: 1, mech: 1 });
    let x = -9, placed = 0;
    for (let l = 0; l <= 8; l++) {
      tune({ power: 1, belts: 1, sorter: 1, mech: 1, mechCount: l }); const max = 1 + l;
      if (g.T.mechMax !== max) return `L${l}: mechMax ${g.T.mechMax}`;
      while (L().count('mech') < max) { const r = await placeAtFloor('mech', x, -1.0, 2.0); x += 1.2; if (!r.ok) return `L${l}: mech ${L().count('mech') + 1} of ${max}: ${r.why}`; placed++; }
      const r = await placeAtFloor('mech', x, -1.0, 2.0); if (r.ok || !/limit/i.test(r.why || '')) return `L${l}: ${max} mechs placed, one more gave ${JSON.stringify(r)}`;
      x += 1.2;
    }
    return true;
  });

  // The placement limit lives in the build planner. A stubbed face keeps these tests independent of the random pile.
  const limitProbe = async (name, planName, stub, mkEnt, kind, upFor, maxFor, levels) => {
    const orig = g.machines[planName];
    try {
      g.machines[planName] = stub; fresh(upFor(0)); let n = 0;
      for (let l = 0; l <= levels; l++) {
        tune(upFor(l)); const max = maxFor(l); const have = () => (kind === 'claw' || kind === 'borer' ? g.machines.count(kind) : 0);
        if ((kind === 'claw' ? g.T.rigMax : g.T.borerMax) !== max) return `L${l}: ${name} limit ${kind === 'claw' ? g.T.rigMax : g.T.borerMax}, expected ${max}`;
        while (have() < max - 1) { const e = mkEnt(n++); S().entities.push(e); g.machines.add(e); }
        craft(kind, 1); selectTool(kind); aimPoint(0, 0, -3, 2.0);
        let pl = await plan(); if (!pl || !pl.ok) return `L${l}: with ${max - 1} of ${max} ${name}s the planner said ${pl && pl.why}`;
        const e = mkEnt(n++); S().entities.push(e); g.machines.add(e);
        pl = await plan(); if (!pl || pl.ok || !/limit/i.test(pl.why || '')) return `L${l}: ${max} ${name}s placed, planner said ${JSON.stringify(pl && (pl.why || pl.ok))}`;
        if (!pl.why.includes(String(max))) return `L${l}: limit message "${pl.why}" does not say ${max}`;
      }
      return true;
    } finally { g.machines[planName] = orig; }
  };
  await T('upg.machine.rig-limit-follows-more-rigs', () => limitProbe('rig', 'planRig',
    () => ({ ok: true, ent: { x: cellX(toI(0)), y: 0, z: cellZ(toK(-3)), i: toI(0), j: 0, k: toK(-3) } }),
    (n) => ({ id: g.nextId(), type: 'claw', x: cellX(toI(-8) + 3 * n), y: 0, z: cellZ(toK(-6)), ry: 0 }),
    'claw', (l) => ({ power: 1, claw: 1, rigCount: l }), (l) => 2 + 2 * l, 5));

  await T('upg.machine.borer-limit-follows-borer-fleet', () => limitProbe('borer', 'planBorer',
    () => ({ ok: true, ent: { i: toI(0), j: 0, k: toK(-3), dx: 1, dz: 0, w: g.T.borerW, h: g.T.borerH, x: cellX(toI(0)), y: 0, z: cellZ(toK(-3)) } }),
    (n) => ({ id: g.nextId(), type: 'borer', i: toI(-8) + 6 * n, j: 0, k: toK(-6), dx: 1, dz: 0, w: 2, h: 3, x: cellX(toI(-8) + 6 * n), y: 0, z: cellZ(toK(-6)), done: false }),
    'borer', (l) => ({ power: 1, belts: 1, sorter: 1, vault: 1, mech: 1, timber: 1, steel: 1, borer: 1, borerCount: l }), (l) => 1 + l, 4));

  await T('upg.machine.rig-boom-reach-per-level', async () => {
    for (let l = 0; l <= 4; l++) {
      fresh({ power: 1, claw: 1, rigReach: l });
      if (!near(g.T.rigReach, 3.2 + 1.2 * l, 1e-9)) return `L${l}: rigReach ${g.T.rigReach}`;
      const reach = g.T.rigReach + 1.0;
      // the pile differs per world: pick a spot in the bay with nothing above floor level within 16 cells (higher cells would be plucked first)
      let i0 = 0, k0 = 0, found = false;
      for (const [cx, cz] of [[-1, 0], [1, 0], [-1, -2], [1, 2], [-3, 0], [3, 0], [0, -4], [0, 4]]) {
        const ci = toI(cx), ck = toK(cz); let clear = true;
        for (let di = -16; di <= 16 && clear; di++) for (let dk = -16; dk <= 16 && clear; dk++) if (Math.hypot(di, dk) <= 16) for (let j = 1; j <= 6; j++) if (w().get(ci + di, j, ck + dk)) { clear = false; break; }
        if (clear) { i0 = ci; k0 = ck; found = true; break; }
      }
      if (!found) return 'no clear bay spot for the rig in this world';
      const e = { id: g.nextId(), type: 'claw', x: cellX(i0), y: 0, z: cellZ(k0), ry: 0 }; S().entities.push(e); g.machines.add(e);
      const dist = (n) => Math.hypot(n * 0.6, 2.75 - 0.9);
      let nIn = 2; while (dist(nIn + 1) <= reach) nIn++;
      for (const [n, expectPluck] of [[nIn, true], [nIn + 1, false]]) {
        const i = i0 + n; w().setCell(i, 1, k0, 3, 0); const c0 = S().stats.cells || 0;
        for (let t = 0; t < 400; t++) { e.pw = 1; g.time += 0.05; g.machines.update(0.05, g.time); }
        const gone = w().get(i, 1, k0) === 0; w().setCell(i, 1, k0, 0, 0);
        if (gone !== expectPluck) return `L${l}: cell ${dist(n).toFixed(2)} m from the hub (reach ${reach.toFixed(1)}) ${gone ? 'was' : 'was not'} plucked`;
        const it = g.machines.items.get(e.id); it.target = null; it.phase = 0; it.picked = false; it.idle = 0;
        void c0;
      }
    }
    return true;
  });

  await T('upg.machine.rig-motors-pluck-rate-per-level', async () => {
    for (let l = 0; l <= 6; l++) {
      fresh({ power: 1, claw: 1, rigSpeed: l });
      if (!near(g.T.rigRate, 2.4 * Math.pow(0.78, l), 1e-9)) return `L${l}: rigRate ${g.T.rigRate}`;
      const i0 = toI(-4), k0 = toK(0); const cells = [];
      for (let di = -5; di <= 5; di++) for (let dk = -5; dk <= 5; dk++) for (let j = 1; j <= 4; j++) { w().setCell(i0 + di, j, k0 + dk, 3, 0); cells.push([i0 + di, j, k0 + dk]); }
      const e = { id: g.nextId(), type: 'claw', x: cellX(i0), y: 0, z: cellZ(k0), ry: 0 }; S().entities.push(e); g.machines.add(e);
      const times = []; let last = S().stats.cells || 0;
      for (let t = 0; t < 1600 && times.length < 40; t++) { e.pw = 1; g.time += 0.05; g.machines.update(0.05, g.time); const c = S().stats.cells || 0; if (c > last) { times.push(t * 0.05); last = c; } }
      for (const c of cells) w().setCell(c[0], c[1], c[2], 0, 0);
      if (times.length < 8) return `L${l}: only ${times.length} plucks in 80 s`;
      const per = (times[times.length - 1] - times[0]) / (times.length - 1); const want = g.T.rigRate * compaction(e.x, e.z);
      if (!near(per, want, want * 0.06 + 0.05)) return `L${l}: one pluck per ${per.toFixed(2)}s, expected ${want.toFixed(2)}s`;
    }
    return true;
  });

  await T('upg.machine.rig-sells-what-it-plucks', async () => {
    fresh({ power: 1, claw: 1 }); const i0 = toI(-4), k0 = toK(0); const cells = [];
    for (let di = -3; di <= 3; di++) for (let dk = -3; dk <= 3; dk++) { w().setCell(i0 + di, 1, k0 + dk, 3, 0); cells.push([i0 + di, 1, k0 + dk]); }
    const e = { id: g.nextId(), type: 'claw', x: cellX(i0), y: 0, z: cellZ(k0), ry: 0 }; S().entities.push(e); g.machines.add(e);
    const m0 = S().money, s0 = S().stats.sold; for (let t = 0; t < 600; t++) { e.pw = 1; g.time += 0.05; g.machines.update(0.05, g.time); }
    for (const c of cells) w().setCell(c[0], c[1], c[2], 0, 0);
    return (S().money > m0 && S().stats.sold > s0) || 'rig plucked nothing or sold nothing';
  });

  // -------------------------------------------------------------------------------- mechs on the real pile
  const mechRig = (up, belts = 4) => {
    fresh(up); const sp0 = spot(-6); const kk = sp0.k; let i0 = sp0.i; for (let g2 = 0; g2 < 60 && w().topAt(i0 + 8, kk) < 6; g2++) i0++;
    const mech = mk('mech', i0 - 1, 0, kk, { dir: 0 }); const bl = [];
    for (let n = 1; n <= belts; n++) bl.push(mk('belt', i0 - 1 - n, 0, kk, { dir: 2 }));
    const vault = belts ? mk('vault', i0 - 2 - belts, 0, kk, { dir: 2 }) : null;
    return { mech, bl, vault, kk, i0 };
  };
  const powerAll = () => { for (const t of tiles()) if (['mech', 'belt', 'vault', 'sorter'].includes(t.type)) t.pw = 1; };
  const MECH_UP = { power: 1, belts: 1, sorter: 1, vault: 1, mech: 1, timber: 1, steel: 1 };

  await T('upg.machine.hydraulics-scoop-interval-per-level', async () => {
    for (let l = 0; l <= 6; l++) {
      await newWorld(); const { mech } = mechRig({ ...MECH_UP, mechSpeed: l });
      if (!near(g.T.mechRate, 2.4 * Math.pow(0.8, l), 1e-9)) return `L${l}: mechRate ${g.T.mechRate}`;
      const times = []; let last = S().stats.cells || 0;
      for (let n = 0; n < 1600; n++) { powerAll(); g.time += 0.05; L().update(0.05); const c = S().stats.cells || 0; if (c > last) { times.push(n * 0.05); last = c; } }
      if (times.length < 6) return `L${l}: only ${times.length} scoops in 80 s`;
      let min = 1e9; for (let q = 1; q < times.length; q++) min = Math.min(min, times[q] - times[q - 1]);
      const want = g.T.mechRate * compaction(cellX(mech.i), cellZ(mech.k));
      if (!near(min, want, want * 0.08 + 0.08)) return `L${l}: fastest scoop interval ${min.toFixed(2)}s, expected ${want.toFixed(2)}s`;
    }
    return true;
  });

  await T('upg.machine.mech-hopper-capacity-per-level', async () => {
    for (let l = 0; l <= 3; l++) {
      await newWorld(); const { mech } = mechRig({ ...MECH_UP, mechSpeed: 6, mechBuf: l }, 0);
      const cap = [6, 12, 24, 48][l]; if (g.T.mechBuffer !== cap) return `L${l}: mechBuffer ${g.T.mechBuffer}`;
      let peak = 0; for (let n = 0; n < 4000; n++) { powerAll(); g.time += 0.05; L().update(0.05); peak = Math.max(peak, mech.buf.length); }
      if (peak !== cap || mech.buf.length !== cap) return `L${l}: hopper filled to ${peak} (now ${mech.buf.length}), expected ${cap}`;
    }
    return true;
  });

  await T('upg.machine.belt-layer-lays-one-belt-per-step-for-3-fluff', async () => {
    for (const layer of [0, 1]) {
      await newWorld(); const { mech } = mechRig({ ...MECH_UP, mechSpeed: 6, mechLayer: layer }); const b0 = tiles().filter((t) => t.type === 'belt').length; const m0 = S().money;
      for (let n = 0; n < 2400; n++) { powerAll(); g.time += 0.05; L().update(0.05); }
      const laid = tiles().filter((t) => t.type === 'belt').length - b0;
      if (!layer && (laid !== 0 || S().money !== m0)) return `no Belt Layer but ${laid} belts laid, money ${m0 - S().money}`;
      if (layer && (mech.adv < 4 || laid !== mech.adv || m0 - S().money !== 3 * laid)) return `adv ${mech.adv} laid ${laid} paid ${m0 - S().money}`;
    }
    return true;
  });

  await T('upg.machine.roof-bolter-frames-every-third-step-with-best-frame', async () => {
    for (const best of ['timber', 'steel']) {
      await newWorld(); const up = { ...MECH_UP, mechSpeed: 6, mechLayer: 1, mechBolt: 1 }; if (best === 'timber') delete up.steel;
      const { mech } = mechRig(up); const m0 = S().money;
      // every third step the bolter tries a frame; open ground near the surface ("No roof to prop") legitimately refuses
      const orig = g.machines.frameFromCell.bind(g.machines); let tries = 0, oks = 0; g.machines.frameFromCell = (...a) => { const r = orig(...a); tries++; if (r.ok) oks++; return r; };
      try { for (let n = 0; n < 3200; n++) { powerAll(); g.time += 0.05; L().update(0.05); } } finally { g.machines.frameFromCell = orig; }
      const frames = S().entities.filter((e) => e.type === 'frame' && e.auto);
      if (mech.adv < 6) return `${best}: mech only advanced ${mech.adv}`;
      if (!frames.length) return `${best}: no frames after ${mech.adv} steps`;
      if (Math.abs(tries - Math.floor(mech.adv / 3)) > 1 || frames.length !== oks) return `${best}: ${tries} frame attempts and ${frames.length} frames after ${mech.adv} steps (expected ${Math.floor(mech.adv / 3)} attempts)`;
      if (frames.some((f) => f.kind !== best)) return `${best}: used ${[...new Set(frames.map((f) => f.kind))].join()}`;
      const paid = m0 - S().money; const want = 3 * mech.adv + frames.length * FRAME_TYPES[best].cost;
      if (paid !== want) return `${best}: paid ${paid}, expected ${want}`;
    }
    // without the Roof Bolter: no frames, no cost
    await newWorld(); const { mech } = mechRig({ ...MECH_UP, mechSpeed: 6, mechLayer: 1 });
    for (let n = 0; n < 1600; n++) { powerAll(); g.time += 0.05; L().update(0.05); }
    return (S().entities.filter((e) => e.type === 'frame' && e.auto).length === 0 && mech.adv > 3) || 'frames placed without the Roof Bolter';
  });

  // -------------------------------------------------------------------------------- borers on the real pile
  const placeBorer = async (lane0) => {
    // the pile differs per world: try the wanted lane, then its neighbours, until a face accepts the borer
    for (const dl of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
      let sp; try { sp = spot(lane0 + dl); } catch (x) { continue; }
      const { i, k } = sp; craft('borer'); selectTool('borer');
      for (const back of [1.5, 2.0, 2.5]) for (const pitch of [0, -0.1, -0.2]) { lookEast(cellX(i + 1) - back, cellZ(k), pitch); const pl = await plan(); if (pl && pl.ok) { placeNow(); return { ok: true }; } if (pl && /limit/i.test(pl.why || '')) return { ok: false, why: pl.why }; }
    }
    return { ok: false, why: 'no spot' };
  };
  const borerUp = (extra = {}) => ({ power: 1, belts: 1, sorter: 1, vault: 1, mech: 1, timber: 1, steel: 1, borer: 1, ...extra });
  // a borer on a real pile face; the pile differs per world, so retry with a fresh world when no face takes it
  const freshBorer = async (up) => {
    for (let tries = 0; tries < 4; tries++) { await newWorld(); fresh(up); const r = await placeBorer(12); if (r.ok) return [...g.machines.items.values()].find((x) => x.ent.type === 'borer').ent; }
    return null;
  };

  await T('upg.machine.cutter-head-step-interval-per-level', async () => {
    for (let l = 0; l <= 6; l++) {
      const bor = await freshBorer(borerUp({ borerSpeed: l })); if (!bor) return 'no pile face took a borer';
      if (!near(g.T.borerRate, 12.2 * Math.pow(0.78, l), 1e-9)) return `L${l}: borerRate ${g.T.borerRate}`;
      const rec = []; let steps = 0, pos = [bor.i, bor.k];
      for (let n = 0; n < 6000 && rec.length < 5; n++) { bor.pw = 1; g.time += 0.05; g.machines.update(0.05, g.time); if ((bor.steps || 0) > steps) { steps = bor.steps; rec.push({ t: g.time, pre: pos }); pos = [bor.i, bor.k]; } }
      if (rec.length < 5) return `L${l}: only ${rec.length} steps`;
      for (let q = 1; q < rec.length - 1; q++) {
        const want = g.T.borerRate * compaction(cellX(rec[q].pre[0]), cellZ(rec[q].pre[1])); const got = rec[q + 1].t - rec[q].t;
        if (!near(got, want, want * 0.03 + 0.1)) return `L${l}: step ${q + 1} took ${got.toFixed(2)}s, expected ${want.toFixed(2)}s`;
      }
    }
    return true;
  });

  await T('upg.machine.wide-bore-tunnel-size-per-level', async () => {
    const dims = [[2, 3], [4, 4], [5, 4]]; // base, then the two Wide Bore levels (desc: 4x4, then 5x4)
    for (let l = 0; l <= 2; l++) {
      const bor = await freshBorer(borerUp({ borerSize: l, borerSpeed: 6 })); if (!bor) return 'no pile face took a borer';
      const [W, H] = dims[l]; if (g.T.borerW !== W || g.T.borerH !== H) return `L${l}: tuning ${g.T.borerW}x${g.T.borerH}, expected ${W}x${H}`;
      if (bor.w !== W || bor.h !== H) return `L${l}: borer placed as ${bor.w}x${bor.h}`;
      const go = (until) => { for (let n = 0; n < 4000 && !until(); n++) { bor.pw = 1; g.time += 0.05; g.machines.update(0.05, g.time); } };
      go(() => (bor.steps || 0) >= 3);
      // count solid cells in the slab the next step will cut, then check exactly that many were eaten
      const nx = bor.i + bor.dx, nk = bor.k + bor.dz, px = bor.dz !== 0 ? 1 : 0, pz = bor.dx !== 0 ? 1 : 0, half = Math.floor((W - 1) / 2);
      let expect = 0, ring = 0; for (let o = -half - 1; o <= W - half; o++) for (let h = -1; h <= H; h++) { const s = w().get(nx + px * o, bor.j + h, nk + pz * o) ? 1 : 0; if (o >= -half && o < W - half && h >= 0 && h < H) expect += s; else ring += s; }
      const c0 = S().stats.cells || 0, s0 = bor.steps; go(() => bor.steps > s0); const got = (S().stats.cells || 0) - c0;
      if (expect < W) return `L${l}: test slab nearly empty (${expect})`;
      if (got !== expect) return `L${l}: bored ${got} cells, a ${W}x${H} slab held ${expect}`;
      let ring2 = 0; for (let o = -half - 1; o <= W - half; o++) for (let h = -1; h <= H; h++) if (!(o >= -half && o < W - half && h >= 0 && h < H) && w().get(nx + px * o, bor.j + h, nk + pz * o)) ring2++;
      if (ring2 !== ring) return `L${l}: cut outside the ${W}x${H} section`;
      go(() => bor.steps >= 5); const lining = S().entities.filter((e) => e.type === 'frame' && e.auto && e.kind === 'concrete');
      if (!lining.length || !lining.every((f) => near(f.w, W * 0.6 - 0.04, 1e-6) && near(f.h, H * 0.6 - 0.02, 1e-6))) return `L${l}: lining is not ${W}x${H}`;
    }
    return true;
  });

  // -------------------------------------------------------------------------------- depots
  await T('upg.machine.depot-beacons-sell-recall-travel-and-clues', async () => {
    fresh({ power: 1, bag: 3, depots: 1 }); S().clues = []; S().clueLevel = 0;
    const mkB = (x, z) => { const e = { id: g.nextId(), type: 'beacon', x, y: 0, z, i: toI(x), j: 0, k: toK(z) }; S().entities.push(e); g.machines.add(e); return e; };
    const b1 = mkB(9, 0), b2 = mkB(-9, 0);
    // sells what you carry
    S().carry = []; for (let q = 0; q < 4; q++) S().carry.push({ sp: spOf(2), vr: 0 }); p().pos.set(b1.x - 2, 0, b1.z); const m0 = S().money; for (let n = 0; n < 80; n++) g.autoDump(0.1);
    if (S().carry.length || S().money <= m0) return 'beacon did not sell what was carried';
    // recall point: the nearest beacon
    p().pos.set(b2.x - 25, 0, b2.z); g.recall(); if (Math.hypot(p().pos.x - b2.x, p().pos.z - b2.z) > 3) return 'recall did not go to the nearest beacon';
    // travel menu: terminal row plus every beacon at 1.2 per metre
    p().pos.set(b1.x - 1.2, 0, b1.z); g.ui.open('travel'); const rows = [...document.querySelectorAll('#travelList .trow')];
    const term = rows.find((r) => /Upgrade terminal/.test(r.textContent)); if (!term) return 'no terminal row in the depot network';
    const row = rows.find((r) => /Depot B/.test(r.textContent)); if (!row) return 'no row for the second depot';
    const dist = Math.hypot(b2.x - p().pos.x, b2.z - p().pos.z), cost = Math.round(dist * 1.2); S().money = 1e9; const mb = S().money; row.querySelector('button').click();
    if (Math.hypot(p().pos.x - b2.x, p().pos.z - b2.z) > 3 || mb - S().money !== cost) return `travel moved ${Math.hypot(p().pos.x - b2.x, p().pos.z - b2.z).toFixed(1)} m off, charged ${mb - S().money} expected ${cost}`;
    g.ui.open('travel'); [...document.querySelectorAll('#travelList .trow')].find((r) => /Upgrade terminal/.test(r.textContent)).querySelector('button').click();
    if (g.ui.openModal !== 'shop') return 'terminal row did not open the upgrade terminal'; g.ui.closeModals();
    // clues come only from beacons set far from the bay
    S().clues = []; S().clueLevel = 0; g.onBeaconPlaced({ x: 100, z: 0 }); if (S().clues.length) return 'a beacon 100 m out gave a clue';
    g.onBeaconPlaced({ x: 300, z: 0 }); if (S().clues.length !== 1) return 'a beacon 300 m out gave no clue';
    g.onBeaconPlaced({ x: 300, z: 10 }); if (S().clues.length !== 1) return 'a second near beacon gave another clue';
    g.onBeaconPlaced({ x: 1000, z: 0 }); g.onBeaconPlaced({ x: 2000, z: 0 }); g.onBeaconPlaced({ x: 3300, z: 0 });
    return S().clues.length === 4 || `clues ${S().clues.length}`;
  });

  await T('upg.machine.belt-ramp-carries-plush-up-a-step', async () => {
    fresh({ power: 1, belts: 1, vault: 1 }); const i0 = I0(), k0 = K0() - 8;
    const a = mk('belt', i0, 0, k0, { dir: 0, rise: 1 }), b = mk('belt', i0 + 1, 1, k0, { dir: 0 }), v = mk('vault', i0 + 2, 1, k0, { dir: 0 });
    a.items.push({ sp: spOf(1), vr: 0, t: 0 });
    for (let n = 0; n < 200; n++) { a.pw = 1; b.pw = 1; g.time += 0.05; L().update(0.05); }
    return v.stored.length === 1 || 'item did not climb the ramp';
  });
}
