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
}
