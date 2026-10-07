// In-world keys, part 9: the numbers the tool texts quote (reach, fuse, burn time, rates) against what the game really does.
import { makeKit, ALL_UP } from './addons_lib.js';
import { recipes } from '../crafting.js';
import { infoFor } from '../info.js';
import { CART_CAP } from '../cart.js';
import { CHARGE_PER, CHARGER_CAP, CHARGER_HOPPER } from '../logistics.js';
import { VENT_R } from '../dust.js';
export default async function (ctx) {
  const { T, g, S, p, w, fresh, adv, craft, V3 } = ctx;
  const K = makeKit(ctx);
  let TXT = null;   // the bench texts of everything, read once (when the first test runs)
  const txt = () => { if (!TXT) { fresh(Object.fromEntries(ctx.UPGRADES.map((u) => [u.id, u.max]))); TXT = Object.fromEntries(recipes(g).map((r) => [r.id, { use: r.use || '', desc: r.desc || '' }])); } return TXT; };
  const useOf = (id) => (txt()[id] || { use: 'no recipe ' + id }).use;
  const descOf = (id) => (txt()[id] || { desc: '' }).desc;
  const place = async (id, x, z) => { const r = await K.put(id, { x, z, dir: 0 }); if (!r.ok) throw new Error(id + ': ' + r.why); return r.ent; };
  const guard = (name, fn) => T(name, async () => { try { txt(); return await fn(); } finally { g.keys = {}; g.stowed = true; } });

  await guard('truth.world.numbers-strut-and-jack-reach-and-rope-radius-are-the-ones-the-bench-and-the-readout-say', async () => {
    fresh(ALL_UP); K.clearBay(); const bad = [];
    const st = await place('strut', -4.2, 1.2), jk = await place('jack', -4.2, 3.6); const rp = { id: g.nextId(), type: 'rope', x: -6.6, y: 0, z: 6.0 }; S().entities.push(rp); g.addEntity(rp);
    const sup = (e) => w().supports.find((s) => s.id === e.id);
    if (!sup(st) || sup(st).r !== 1.9 || !/1\.9 m/.test(useOf('strut') + descOf('strut'))) bad.push('strut radius ' + (sup(st) && sup(st).r));
    if (!sup(jk) || sup(jk).r !== 2.7 || !/2\.7 m/.test(useOf('jack') + descOf('jack'))) bad.push('jack radius ' + (sup(jk) && sup(jk).r));
    const rd = (e) => infoFor(g, { kind: 'mach', id: e.id }).lines.join(' '); if (!/within 1\.9 m/.test(rd(st)) || !/within 2\.7 m/.test(rd(jk))) bad.push('readouts: ' + rd(st) + ' / ' + rd(jk));
    const here = (dx) => g.ropedIn({ x: rp.x + dx, y: rp.y, z: rp.z }); if (!here(5.9) || here(6.1) || !/Within 6 m/.test(useOf('rope')) || !/within 6 m/.test(rd(rp))) bad.push(`rope: 5.9 m ${here(5.9)}, 6.1 m ${here(6.1)}`);
    for (const e of [st, jk, rp]) g.doDecon({ kind: 'mach', id: e.id });
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.numbers-flare-burns-4-minutes-glow-stick-10-dynamite-fuses-4-s-and-a-charge-6-s', async () => {
    fresh(ALL_UP); K.clearBay(); const bad = [];
    const fl = await place('flare', -6.6, -3.6), gl = await place('glow', -6.6, -4.8);
    const born = S().stats.playSecs; fl.born = born; gl.born = born;
    const expired = (e) => { g.machines.expire = []; S().stats.playSecs = born + 0; return null; }; void expired;
    const test = (e, secs) => { S().stats.playSecs = born + secs; g.machines.expire = []; g.machines.update(0.05, g.time); return g.machines.expire.includes(e) || !g.machines.items.has(e.id); };
    if (test(fl, 239) || !test(fl, 241)) bad.push('the flare does not burn for 4 minutes'); if (!/4 minutes/.test(useOf('flare'))) bad.push('flare text: ' + useOf('flare'));
    if (test(gl, 599) || !test(gl, 601)) bad.push('the glow stick does not burn for 10 minutes'); if (!/10 minutes/.test(useOf('glow'))) bad.push('glow text: ' + useOf('glow'));
    S().stats.playSecs = born;
    const dy = await place('dynamite', -4.2, 5), ch = await place('charge', -3, 5);
    if (dy.fuse !== 4 || !/4 second fuse/.test(useOf('dynamite'))) bad.push('dynamite fuse ' + dy.fuse); if (ch.fuse !== 6 || !/6 second fuse/.test(useOf('charge'))) bad.push('charge fuse ' + ch.fuse);
    for (const e of [dy, ch, fl, gl]) { const it = g.machines.items.get(e.id); if (it) g.doDecon({ kind: 'mach', id: e.id }); }
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.numbers-vacuum-cart-charger-and-generator-hopper-figures-match-the-code', async () => {
    const bad = []; const ups = ctx.UPGRADES;
    const vac = ups.find((u) => u.id === 'vac'); const rates = []; for (let l = 1; l <= vac.max; l++) { fresh({ vac: l }); g.T = g.tune(); rates.push(g.T.vacRate); } if (!vac.desc.includes(rates.join(' / '))) bad.push(`vacuum text says one thing, rates are ${rates.join(' / ')}`);
    const cart = ups.find((u) => u.id === 'cart'); if (!cart.desc.includes(CART_CAP.slice(1).join(' / '))) bad.push('cart text capacities vs ' + CART_CAP.join());
    const ch = recipes((fresh({ ...ALL_UP, crew: 1 }), g)).find((r) => r.id === 'charger').use; for (const v of CHARGE_PER) if (!ch.includes(String(v))) bad.push('charger text does not name ' + v); if (!ch.includes(`up to ${CHARGER_CAP}`)) bad.push('charger cap text');
    if (CHARGER_HOPPER < 1) bad.push('hopper');
    const gb = ups.find((u) => u.id === 'genBuffer'); const hop = []; for (let l = 0; l <= gb.max; l++) { fresh({ genBuffer: l }); g.T = g.tune(); hop.push(g.T.genBuffer); } if (!gb.desc.includes('100, 200, then 400') || hop.join() !== '50,100,200,400') bad.push('fuel hopper figures ' + hop.join());
    if (VENT_R !== 14 || !/within about 14 m/.test(useOf('fan'))) bad.push('vent fan radius text');
    return bad.length === 0 || bad.join('; ');
  });

  await guard('truth.world.numbers-the-cart-readout-and-the-recipe-text-name-the-keys-that-really-work', async () => {
    fresh(ALL_UP); craft('cart:1'); const bad = []; const t = useOf('cart:1');
    for (const m of [/Press U to roll it out/, /U parks it or calls it back/, /X \(standing next to it\) stows it when empty/]) if (!m.test(t)) bad.push('cart text lost: ' + m);
    return bad.length === 0 || bad.join('; ');
  });
}
