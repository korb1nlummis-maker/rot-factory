import { RemotePlayer } from '../net.js';
export default async function (ctx) {
  const { T, g } = ctx;
  await T('mp.partner-beacon-pulses-above-the-partner-and-shows-through-walls', async () => {
    const rp = new RemotePlayer(g.renderer.scene, 'Pal'); const b = rp.beacon; const bad = [];
    if (!b || b.name !== 'partnerBeacon') return 'no beacon'; if (b.material.depthTest !== false) bad.push('hidden behind plush (depthTest on)'); if (b.material.sizeAttenuation !== false) bad.push('shrinks with distance');
    if (!(b.position.y > rp.tag.position.y)) bad.push('not above the name tag');
    const sizes = []; for (let n = 0; n < 24; n++) { rp.update(0.1); sizes.push(b.scale.x); } const lo = Math.min(...sizes), hi = Math.max(...sizes); if (!(hi - lo > 0.02)) bad.push(`does not pulse (${lo.toFixed(3)} to ${hi.toFixed(3)})`);
    rp.dispose(g.renderer.scene); return bad.length === 0 || bad.join('; ');
  });
  await T('cart.x-next-to-the-cart-stows-it-without-aiming-and-u-parks-it', async () => {
    const { fresh, S } = ctx; fresh({ cart: 1 }); const st = S(); st.items['cart:1'] = 1; g.useCart(); if (!st.cart) return 'cart did not roll out';
    const p = g.player.pos; st.cart.x = p.x + 2.5; st.cart.z = p.z; g.player.yaw = 0; // looking away from it
    g.useCart(); const parked = st.cart && st.cart.mode === 'stay'; g.deconstruct(false);
    return (parked && !st.cart && st.items['cart:1'] === 1) || `parked ${parked}, cart ${!!st.cart}, items ${JSON.stringify(st.items)}`;
  });
  await T('cart.plush-grabbed-with-full-hands-fly-to-the-cart-only-not-also-to-the-hand', async () => {
    const { fresh, S } = ctx; fresh({ cart: 1 }); const st = S(); st.items['cart:1'] = 1; g.useCart(); const c = st.cart; if (!c) return 'no cart';
    const p = g.player.pos; c.x = p.x + 1; c.z = p.z; st.carry.length = 0; while (st.carry.length < g.T.carry) st.carry.push({ sp: 3, vr: 0 });
    g.fliers.length = 0; const before = c.load.length; g.pickedUp({ sp: 4, vr: 0 }, new g.player.pos.constructor(p.x, 1.2, p.z + 1), true);
    const hand = g.fliers.filter((f) => f.hand).length, cartFl = g.fliers.length - hand;
    return (c.load.length === before + 1 && st.carry.length === g.T.carry && hand === 0 && cartFl === 1) || `cart +${c.load.length - before}, hands ${st.carry.length}/${g.T.carry}, hand fliers ${hand}, cart fliers ${cartFl}`;
  });
  await T('move.ctrl-is-not-a-crouch-key-and-c-is', async () => {
    const { p } = ctx; const bad = [];
    for (const [code, want] of [['KeyC', true], ['ControlLeft', false], ['ControlRight', false]]) {
      p().pos.set(0, 0, -1.4); p().vel.set(0, 0, 0); g.keys[code] = true; for (let n = 0; n < 12; n++) g.updatePlay(0.05); const on = !!p().crouch; g.keys[code] = false; for (let n = 0; n < 12; n++) g.updatePlay(0.05);
      if (on !== want) bad.push(`${code} crouch ${on}, expected ${want}`);
    }
    return bad.length === 0 || bad.join('; ');
  });
}
