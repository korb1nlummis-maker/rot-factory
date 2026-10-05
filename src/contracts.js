import { RARITY, species, speciesCount, ARCH_NAMES, pools } from './plushdata.js';
import { mulberry32, fmt } from './util.js';

// P(rarity >= r) in the pile
const P_GE = [1, 0.38, 0.16, 0.06, 0.015, 0.003];

export class Contracts {
  constructor(game) { this.game = game; }

  get list() { return this.game.S.contracts; }

  tier() { return Math.max(0, Math.min(8, Math.floor(Math.log2(1 + (this.game.S.stats.maxDist || 0) / 80)))); }

  avgValue(r) { // average base value of a plush of at least rarity r
    let w = 0, v = 0;
    for (let i = r; i < 6; i++) { w += RARITY[i].weight; v += RARITY[i].weight * RARITY[i].value; }
    return v / w;
  }

  make() {
    const g = this.game, S = g.S;
    const rng = mulberry32((Date.now() ^ (S.nextId++ * 2654435761)) >>> 0);
    const tier = this.tier();
    const kinds = ['rarity', 'rarity', 'species', 'shape', 'shiny'];
    const kind = kinds[(rng() * kinds.length) | 0];
    const prem = 1 + (S.stats.maxDist || 0) / 200;
    const mult = g.T.sellMult;
    let c;
    if (kind === 'rarity') {
      const r = Math.max(1, Math.min(5, 1 + Math.floor(tier / 2) + ((rng() * 2) | 0)));
      const need = Math.max(2, Math.round((90 + tier * 40) * P_GE[r]));
      const expected = need / P_GE[r];
      c = { kind, r, need, desc: `Sell ${need} plush of ${RARITY[r].name} rarity or better.`, reward: Math.round(expected * 0.9 * prem * mult + need * this.avgValue(r) * prem * mult * 0.8) };
    } else if (kind === 'species') {
      const r = Math.max(0, Math.min(3, Math.floor(tier / 2) + ((rng() * 2) | 0)));
      const pool = pools[r];
      const sp = pool[(rng() * pool.length) | 0];
      const need = 2 + ((rng() * 4) | 0);
      const freq = RARITY[r].weight / pool.length;
      c = { kind, sp, need, desc: `Sell ${need} x ${species[sp].name}.`, reward: Math.round((need / freq) * 1.1 * prem * mult + need * RARITY[r].value * prem * mult * 2) };
    } else if (kind === 'shape') {
      const a = (rng() * ARCH_NAMES.length) | 0;
      const need = 14 + ((rng() * 20) | 0) + tier * 4;
      c = { kind, arch: a, need, desc: `Sell ${need} ${ARCH_NAMES[a]} plush of any color.`, reward: Math.round(need * 36 * 1.1 * prem * mult) };
    } else {
      const need = 1 + ((rng() * 2) | 0);
      c = { kind: 'shiny', need, desc: `Sell ${need} shiny plush.`, reward: Math.round(need * 140 * 1.2 * prem * mult * 3) };
    }
    c.id = S.nextId++;
    c.have = 0;
    c.reward = Math.max(30, c.reward);
    if (tier >= 2 && rng() < 0.22) c.boost = ['sell', 'dig', 'carry'][(rng() * 3) | 0];
    return c;
  }

  fill() {
    const S = this.game.S;
    S.contracts = S.contracts || [];
    while (S.contracts.length < this.game.T.contractSlots) S.contracts.push(this.make());
    if (S.contracts.length > this.game.T.contractSlots) S.contracts.length = this.game.T.contractSlots;
  }

  onSale(sp, vr) {
    const S = this.game.S;
    if (!this.game.T.contractSlots || !S.contracts) return;
    const s = species[sp];
    if (!s) return;
    for (const c of S.contracts) {
      let ok = false;
      if (c.kind === 'rarity') ok = s.rarity >= c.r && s.rarity < 6;
      else if (c.kind === 'species') ok = sp === c.sp;
      else if (c.kind === 'shape') ok = s.arch === c.arch;
      else if (c.kind === 'shiny') ok = !!(vr & 128);
      if (ok && c.have < c.need) {
        c.have++;
        if (c.have >= c.need) this.complete(c);
      }
    }
  }

  complete(c) {
    const g = this.game, S = g.S;
    S.money += c.reward; S.totalEarned += c.reward;
    g.ui.setMoney(S.money); g.ui.gain(c.reward);
    let extra = '';
    if (c.boost) {
      const b = S.boosts;
      if (c.boost === 'sell') { b.sell += 0.01; extra = ' +1% sale price'; }
      else if (c.boost === 'dig') { b.dig += 0.01; b.digMul *= 0.99; extra = ' -1% dig time'; }
      else { b.carry += 1; extra = ' +1 carry'; }
      g.refreshTuning();
    }
    S.stats.contracts = (S.stats.contracts || 0) + 1;
    g.ui.toast({ icon: '📋', title: 'Contract complete', text: `◈ ${fmt(c.reward)}${extra}`, cls: 'ach', ms: 5000 });
    g.sound.ach();
    const idx = S.contracts.indexOf(c);
    setTimeout(() => { S.contracts[idx] = this.make(); if (g.ui.openModal === 'shop') g.ui.renderShop(); }, 1500);
  }

  reroll(i) {
    const S = this.game.S;
    const c = S.contracts[i];
    if (!c) return false;
    const cost = Math.round(c.reward * 0.08);
    if (S.money < cost) return false;
    S.money -= cost; this.game.ui.setMoney(S.money);
    S.contracts[i] = this.make();
    return true;
  }
}
