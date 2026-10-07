// audit.bins.ui-*: the audit of the bins wave, pressed the way a player presses it: what the controls table and the README promise must be what the keys do. Run: `await __selftest('audit.bins.ui')`
import { kit } from './bins_lib.js';
import { makeIO } from './truth_world_lib.js';
import * as BINS from '../bins.js';
import { CONTROLS } from '../controls.js';

export default async function (ctx) {
  const { g, S, p, toI, toK, THREE, aimPoint, craft } = ctx;
  const K = kit(ctx);
  const io = makeIO(ctx);
  const G = K.guard;
  const look = (x, y, z, back = 2.5) => { aimPoint(x, y, z, back); g.renderer.camera.position.copy(p().eyePos(new THREE.Vector3())); };

  await G('audit.bins.ui-a-copied-bin-pastes-on-your-own-cart-with-e-as-the-controls-table-says', async () => {
    const bad = [], d = K.beacon(8, 10, { num: 0 }); K.run(0.2); const tk = K.mkEarth('truck', toI(-2), toK(2)); g.setCfg(tk, { dest: d.id });
    const row = CONTROLS.flatMap((x) => x.rows).find((r) => r.keys.join('+') === 'Shift+;');
    p().pos.set(0, 0, 2); look(tk.px, 0.5, tk.pz, 2.5); io.shiftTap('Semicolon'); if (!g.cfgClip || g.cfgClip.group !== 'bindest') return 'the copy did not happen: ' + JSON.stringify(g.cfgClip);
    craft('cart:1'); g.useCart(); const c = S().cart; c.mode = 'stay'; c.x = -3; c.z = 3; c.y = 0;
    p().pos.set(0, 0, 3); look(c.x, 0.5, c.z, 2.0); const a = g.crewAim(); if (!a || a.kind !== 'cart') return 'aim: ' + (a && a.kind);
    io.tap('KeyE');
    if (c.dest !== d.id) bad.push(`E on your cart with a copied bin gave it ${c.dest}; the controls table says "${row && row.what.match(/E on another machine[^.]*/)}"`);
    // and with no bot in the crew at all
    return bad.length === 0 || bad.join(' || ');
  });

  await G('audit.bins.ui-a-copied-bin-pastes-on-a-bot-and-a-cart-with-no-bot-selected-or-owned', async () => {
    const bad = [], d = K.beacon(8, 10, { num: 0 }); K.run(0.2); const tk = K.mkEarth('truck', toI(-2), toK(2)); g.setCfg(tk, { dest: d.id });
    craft('cart:1'); g.useCart(); const c = S().cart; c.mode = 'stay'; c.x = -3; c.z = 3; c.y = 0; S().crew = []; g.crew.sync();
    p().pos.set(0, 0, 2); look(tk.px, 0.5, tk.pz, 2.5); io.shiftTap('Semicolon');
    p().pos.set(0, 0, 3); look(c.x, 0.5, c.z, 2.0); io.tap('KeyE');
    if (c.dest !== d.id) bad.push('with an empty crew E on your cart did not paste: ' + c.dest);
    return bad.length === 0 || bad.join(' || ');
  });
}
