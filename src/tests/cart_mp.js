// Every player has their own cart. One page plays both roles (see mp_core.js): the host owns S.cart (its own) and S.gcart (the guest's, simulated
// here and following the remote player); a guest holds its own cart in S.cart and the host's as the render-only view S.hcart.
export default async function (ctx) {
  const { T, g, S, w, p, sim, L, fresh, adv, craft, recipes, THREE, cellX, cellZ, tiles } = ctx;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); g.remote = null; g._actor = null; };
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); } });
  // the bay near the start is flat; a few spots so one blocked lane never fails a run
  const SPOTS = [[0, 3, 0, -9], [0, 6, 0, -12], [-4, 3, -4, -10], [4, 3, 4, -10]];
  const lanes = async (fn) => { let last = 'no lane'; for (const s of SPOTS) { const r = await fn(...s); if (r === true) return true; last = r; } return last; };
  const putRemote = (x, z, yaw = 0) => { g.remote = { pos: new THREE.Vector3(x, 0, z), yaw, lampOn: true, spheres: () => [], update() {}, dispose() {}, set() {} }; };
  const loadN = (c, n) => { for (let q = 0; q < n; q++) c.load.push({ sp: 2, vr: 0 }); };
  const run = (n = 400) => { for (let q = 0; q < n; q++) { g.cart.update(0.016); g.cart2.update(0.016); } };
  // host and guest each roll out a cart; returns the two cart objects
  const bothOut = (hx, hz, gx, gz) => {
    fresh({ cart: 5, bag: 2 }); S().items['cart:1'] = 2;
    p().pos.set(hx, 0, hz); p().vel.set(0, 0, 0); p().yaw = 0; putRemote(gx, gz); role('host'); cap();
    g.useCart(); g.netCmd('cart', { x: gx, y: 0, z: gz, yaw: 0 });
    return { h: S().cart, gc: S().gcart };
  };

  await guard('cart.both-players-roll-out-their-own', async () => lanes(async (hx, hz, gx, gz) => {
    const { h, gc } = bothOut(hx, hz, gx, gz);
    if (!h || !gc) return `host cart ${!!h} guest cart ${!!gc}`;
    if (h === gc) return 'one shared object';
    if (S().items['cart:1']) return 'the two carts did not each use one cart item: ' + S().items['cart:1'];
    if (!g.cart.obj || !g.cart2.obj) return 'a cart has no mesh';
    return true;
  }));

  await guard('cart.each-cart-follows-its-own-player', async () => lanes(async (hx, hz, gx, gz) => {
    const { h, gc } = bothOut(hx, hz, gx, gz); h.mode = 'follow'; gc.mode = 'follow';
    run(500);
    const dh = Math.hypot(h.x - p().pos.x, h.z - p().pos.z), dg = Math.hypot(gc.x - g.remote.pos.x, gc.z - g.remote.pos.z);
    if (dh > 2.6 || dg > 2.6) return `distance to owner: host cart ${dh.toFixed(2)}, guest cart ${dg.toFixed(2)}`;
    // the guest walks off: only the guest's cart goes with them
    const hx0 = h.x, hz0 = h.z; g.remote.pos.set(gx + 14, 0, gz + 8); run(900);
    const dg2 = Math.hypot(gc.x - g.remote.pos.x, gc.z - g.remote.pos.z);
    if (Math.hypot(h.x - hx0, h.z - hz0) > 0.3) return 'the host cart moved when the friend walked';
    return dg2 < 3.5 || `guest cart ${dg2.toFixed(2)} behind the guest`;
  }));

  await guard('cart.a-parked-friend-cart-stays-and-follows-only-when-the-friend-is-here', async () => lanes(async (hx, hz, gx, gz) => {
    const { gc } = bothOut(hx, hz, gx, gz); gc.mode = 'follow'; run(300); g.remote.pos.set(gx + 10, 0, gz); g.remote.pos.y = -50; const x0 = gc.x, z0 = gc.z; run(200);
    return (Math.hypot(gc.x - x0, gc.z - z0) < 0.05) || 'the cart followed a friend who is not there';
  }));

  await guard('cart.guest-pickup-with-full-hands-rides-in-the-guest-cart-only', async () => lanes(async (hx, hz, gx, gz) => {
    const { h, gc } = bothOut(hx, hz, gx, gz); h.mode = 'stay'; gc.mode = 'stay'; run(10);
    const hostCart = h, guestCart = json(gc); guestCart.load = []; const hl = h.load.length;
    // the guest's view: its own cart is S.cart
    role('guest'); cap(); S().cart = guestCart; S().gcart = null; p().pos.set(gx, 0, gz); S().carry = []; for (let q = 0; q < g.T.carry; q++) S().carry.push({ sp: 2, vr: 0 });
    guestCart.x = gx + 1; guestCart.z = gz; guestCart.y = 0;
    g.pickedUp({ sp: 3, vr: 0 }, new THREE.Vector3(gx, 1, gz), true);
    const cl = sent.filter((m) => m.t === 'cmd' && m.c === 'cartload'); if (cl.length !== 1) return 'cartload commands ' + cl.length;
    if (guestCart.load.length !== 1) return 'did not ride on the guest cart locally';
    // the host applies it as the guest
    role('host'); S().cart = hostCart; S().gcart = gc; cap(); g.netCmd('cartload', cl[0].d);
    return (gc.load.length === 1 && gc.load[0].sp === 3 && hostCart.load.length === hl) || `guest cart ${gc.load.length}, host cart ${hostCart.load.length}`;
  }));

  await guard('cart.host-pickup-with-full-hands-rides-in-the-host-cart-only', async () => lanes(async (hx, hz, gx, gz) => {
    const { h, gc } = bothOut(hx, hz, gx, gz); h.mode = 'stay'; gc.mode = 'stay'; run(10);
    S().carry = []; for (let q = 0; q < g.T.carry; q++) S().carry.push({ sp: 2, vr: 0 });
    g.pickedUp({ sp: 3, vr: 0 }, new THREE.Vector3(hx, 1, hz), true);
    return (h.load.length === 1 && gc.load.length === 0) || `host cart ${h.load.length}, guest cart ${gc.load.length}`;
  }));

  await guard('cart.guest-U-toggles-and-stows-only-the-guest-cart', async () => lanes(async (hx, hz, gx, gz) => {
    const { h, gc } = bothOut(hx, hz, gx, gz); const m0 = h.mode; gc.mode = 'follow'; run(300);
    g.netCmd('cart', { x: g.remote.pos.x, y: 0, z: g.remote.pos.z, yaw: 0 });
    if (gc.mode !== 'stay' || h.mode !== m0) return `modes: guest ${gc.mode}, host ${h.mode} (was ${m0})`;
    loadN(h, 3); g.netCmd('decon', { kind: 'cart' });
    if (S().gcart) return 'guest cart not stowed';
    if (S().cart !== h || h.load.length !== 3) return 'the host cart was touched';
    if (S().items['cart:1'] !== 1) return 'the stowed cart did not come back as an item: ' + JSON.stringify(S().items);
    if (g.cart2.obj) return 'the guest cart mesh is still there';
    return true;
  }));

  await guard('cart.guest-cannot-stow-while-their-cart-has-load', async () => lanes(async (hx, hz, gx, gz) => {
    const { gc } = bothOut(hx, hz, gx, gz); loadN(gc, 2); g.netCmd('decon', { kind: 'cart' }); return (S().gcart === gc) || 'stowed a loaded cart';
  }));

  await guard('cart.each-cart-keeps-its-own-load-and-tier', async () => lanes(async (hx, hz, gx, gz) => {
    const { h, gc } = bothOut(hx, hz, gx, gz); loadN(h, 4); loadN(gc, 7);
    g.craftItem('cart:3', 1);               // the host crafts
    if (h.tier !== 3 || gc.tier !== 1) return `after the host upgrade: host ${h.tier} guest ${gc.tier}`;
    g.netCmd('craft', { id: 'cart:2', n: 1 });   // the guest crafts
    if (h.tier !== 3 || gc.tier !== 2) return `after the guest upgrade: host ${h.tier} guest ${gc.tier}`;
    g.netCmd('craft', { id: 'cart:1', n: 1 });   // a downgrade is refused for the guest too
    return (h.load.length === 4 && gc.load.length === 7 && gc.tier === 2) || `loads ${h.load.length}/${gc.load.length}`;
  }));

  await guard('cart.guest-craft-does-not-need-the-host-to-be-without-a-cart', async () => lanes(async (hx, hz, gx, gz) => {
    fresh({ cart: 5 }); p().pos.set(hx, 0, hz); putRemote(gx, gz); role('host'); cap();
    craft('cart:3'); g.useCart(); const h = S().cart; if (!h || h.tier !== 3) return 'no host cart';
    g.netCmd('craft', { id: 'cart:1', n: 1 });
    if (S().items['cart:1'] !== 1 || S().gcart) return 'the guest could not craft their own first cart: ' + JSON.stringify(S().items);
    g.netCmd('cart', { x: gx, y: 0, z: gz, yaw: 0 });
    return (S().gcart && S().gcart.tier === 1 && S().cart === h && h.tier === 3) || 'carts ' + JSON.stringify([S().cart && S().cart.tier, S().gcart && S().gcart.tier]);
  }));

  await guard('cart.crafting-status-reads-the-local-players-own-cart', async () => lanes(async (hx, hz, gx, gz) => {
    const { h, gc } = bothOut(hx, hz, gx, gz); loadN(h, 2); loadN(gc, 5);
    const st = (id) => recipes(g).find((r) => r.id === id).status;
    if (!/2\//.test(st('cart:1'))) return 'host status: ' + st('cart:1');
    g._actor = 'g'; const s2 = st('cart:1'); g._actor = null;
    return /5\//.test(s2) || 'guest status: ' + s2;
  }));

  await guard('cart.dyn-carries-both-carts-and-the-guest-ends-up-with-its-own-as-S.cart', async () => lanes(async (hx, hz, gx, gz) => {
    const { h, gc } = bothOut(hx, hz, gx, gz); h.mode = 'stay'; gc.mode = 'stay'; craft('cart:3'); h.tier = 3; gc.tier = 2; loadN(h, 4); loadN(gc, 9); run(50);
    sent.length = 0; g.sendDyn(); const dyn = sent.find((m) => m.t === 'dyn');
    if (!dyn || !dyn.cart || !dyn.gcart) return 'dyn lacks a cart: ' + JSON.stringify([!!(dyn && dyn.cart), !!(dyn && dyn.gcart)]);
    if (dyn.cart.n !== 4 || dyn.gcart.n !== 9 || dyn.cart.tier !== 3 || dyn.gcart.tier !== 2) return 'wrong payload ' + JSON.stringify([dyn.cart.n, dyn.gcart.n, dyn.cart.tier, dyn.gcart.tier]);
    const hs = json({ x: h.x, y: h.y, z: h.z }), gs = json({ x: gc.x, y: gc.y, z: gc.z });
    // now be the guest
    role('guest'); cap(); S().cart = null; S().gcart = null; S().hcart = null; g.cart.clear(); g.cart2.clear();
    g.netMessage(json(dyn));
    const own = S().cart, view = S().hcart;
    if (!own || !view) return 'guest lacks a cart: own ' + !!own + ' view ' + !!view;
    if (own.tier !== 2 || own.load.length !== 9) return `own cart tier ${own.tier} load ${own.load.length}`;
    if (view.tier !== 3 || view.load.length !== 4) return `host cart view tier ${view.tier} load ${view.load.length}`;
    if (S().gcart) return 'a guest must not hold S.gcart';
    for (let q = 0; q < 120; q++) { g.cart.guestUpdate(0.05); g.cart2.guestUpdate(0.05); }
    if (Math.hypot(own.x - gs.x, own.z - gs.z) > 0.05 || Math.hypot(view.x - hs.x, view.z - hs.z) > 0.05) return 'positions differ';
    if (!g.cart.obj || !g.cart2.obj) return 'a cart is not drawn on the guest';
    if (Math.hypot(g.cart.obj.position.x - gs.x, g.cart.obj.position.z - gs.z) > 0.06 || Math.hypot(g.cart2.obj.position.x - hs.x, g.cart2.obj.position.z - hs.z) > 0.06) return 'meshes are not where the carts are';
    // the guest stowed theirs: the host stops sending it
    role('host'); S().cart = h; S().gcart = null; cap(); g.sendDyn(); const d2 = sent.find((m) => m.t === 'dyn');
    role('guest'); g.netMessage(json(d2));
    return (S().cart === null && S().hcart && S().hcart.tier === 3) || 'guest cart not cleared';
  }));

  await guard('cart.detector-gate-scans-count-only-the-scanners-own-cart', async () => {
    fresh({ cart: 5, detector: 1 }); const gate = tiles().find((t) => t.type === 'belt' && t.detector); if (!gate) return 'no gate';
    const gx = cellX(gate.i), gz = cellZ(gate.k);
    const scan = (carry) => { S().stats.scans = 0; gate._pIn = false; g._gateCd = 0; p().pos.set(gx, gate.j * 1.0, gz); p().vel.set(0, 0, 0); S().carry = []; for (let q = 0; q < carry; q++) S().carry.push({ sp: 2, vr: 0 }); g.playerGateScan(0.01); return S().stats.scans; };
    // host walks through with 2 in hand, own cart 5, and the friend's cart (8) standing at the gate as well
    role('host'); cap(); S().cart = { tier: 2, x: gx + 1, y: 0, z: gz, yaw: 0, mode: 'stay', load: [] }; loadN(S().cart, 5);
    S().gcart = { tier: 2, x: gx - 1, y: 0, z: gz, yaw: 0, mode: 'stay', load: [] }; loadN(S().gcart, 8);
    const a = scan(2); if (a !== 7) return 'host scan counted ' + a + ' (want 2 in hand + 5 own)';
    // the friend's cart too far to count for the host: only hands
    S().cart.x = gx + 30; const a2 = scan(2); if (a2 !== 2) return 'a far own cart counted: ' + a2;
    // guest: S.cart is its own (3), S.hcart is the host's (20) and must not count
    role('guest'); S().cart = { tier: 2, x: gx + 1, y: 0, z: gz, yaw: 0, mode: 'stay', load: [] }; loadN(S().cart, 3); S().hcart = { tier: 2, x: gx - 1, y: 0, z: gz, yaw: 0, mode: 'stay', load: [] }; loadN(S().hcart, 20);
    const b = scan(1); return b === 4 || 'guest scan counted ' + b + ' (want 1 + 3)';
  });

  await guard('cart.thrown-plush-sticks-to-whichever-cart-it-lands-in', async () => lanes(async (hx, hz, gx, gz) => {
    const { h, gc } = bothOut(hx, hz, gx, gz); h.mode = 'stay'; gc.mode = 'stay'; run(10);
    h.x = 0; h.z = 0.6; h.y = 0; h.yaw = 0; gc.x = 7; gc.z = 0.6; gc.y = 0; gc.yaw = 0;
    while (sim().n > 0) sim().remove(sim().n - 1);
    sim().spawn(3, 0, 7, 1.2, 0.6, 0, -1, 0, 1); sim().spawn(3, 0, 0, 1.2, 0.6, 0, -1, 0, 1);
    for (let n = 0; n < 60; n++) { sim().step(1 / 60); g.catchInCart(); }
    return (h.load.length === 1 && gc.load.length === 1) || `host cart ${h.load.length}, guest cart ${gc.load.length}`;
  }));

  await guard('cart.bin-sales-use-each-players-own-cart', async () => lanes(async (hx, hz, gx, gz) => {
    const { h, gc } = bothOut(hx, hz, gx, gz); h.mode = 'stay'; gc.mode = 'stay'; const bp = g.hall.binPos;
    h.x = bp.x; h.z = bp.z - 60; h.y = 0; gc.x = bp.x - 1.5; gc.z = bp.z + 1.5; gc.y = 0; loadN(h, 6); loadN(gc, 6); p().pos.set(bp.x, 0, bp.z - 70);
    const m0 = S().money; for (let n = 0; n < 500; n++) g.autoDump(0.05);
    if (gc.load.length !== 0) return 'the guest cart did not unload at the bin: ' + gc.load.length;
    if (h.load.length !== 6) return 'the far host cart lost plush: ' + h.load.length;
    return S().money > m0 || 'no money for the guest cart sale';
  }));

  await guard('cart.bots-haul-the-friends-full-cart-too', async () => lanes(async (hx, hz, gx, gz) => {
    fresh({ cart: 5, crew: 1, bag: 2 }); S().items['cart:1'] = 1; const bp = g.hall.binPos;
    const cx = bp.x + gx, cz = bp.z + 16;   // a different lane each retry: a pile or a wall can block one
    p().pos.set(cx, 0, cz + 14); putRemote(cx, cz + 1); role('host'); cap();
    g.netCmd('cart', { x: cx, y: 0, z: cz + 1, yaw: 0 }); const gc = S().gcart; gc.mode = 'stay'; gc.x = cx; gc.z = cz; gc.y = 0; gc.load.length = 0;
    const b = g.crew.spawn(); b.x = gc.x + 2; b.z = gc.z; b.y = 0.5; b.state = 'idle'; b.battery = 1;
    for (let q = 0; q < 24; q++) gc.load.push({ sp: 2, vr: 0 });
    const m0 = S().money; for (let n = 0; n < 5000; n++) { g.time += 0.05; g.crew.update(0.05, g.time); g.logi.update(0.05); if (gc.load.length === 0 && b.state === 'idle') break; }
    return (gc.load.length < 24 && S().money > m0) || `cart ${gc.load.length} money ${S().money - m0} bot ${b.state} at ${b.x.toFixed(1)},${b.z.toFixed(1)} cart ${gc.x.toFixed(1)},${gc.z.toFixed(1)} bin ${bp.x.toFixed(1)},${bp.z.toFixed(1)} hauling ${gc.hauling} bots ${g.crew.bots.length}`;
  }));

  await guard('cart.save-and-reload-keep-both-carts', async () => lanes(async (hx, hz, gx, gz) => {
    const { h, gc } = bothOut(hx, hz, gx, gz); h.tier = 2; loadN(h, 3); loadN(gc, 5); gc.mode = 'stay'; h.mode = 'stay'; run(20);
    const snap = json(S()); done();
    if (!snap.gcart || snap.gcart.load.length !== 5 || snap.cart.load.length !== 3) return 'the save lacks a cart';
    const was = [h.x, h.z, gc.x, gc.z];
    S().cart = snap.cart; S().gcart = snap.gcart; g.cart.sync(); g.cart2.sync();
    if (!g.cart.obj || !g.cart2.obj) return 'a restored cart is not drawn';
    if (S().cart.tier !== 2 || S().gcart.tier !== 1 || S().gcart.load.length !== 5) return 'restored data differs';
    if (Math.abs(g.cart2.obj.position.x - was[2]) > 0.02) return 'restored guest cart mesh is misplaced';
    // the friend rejoins: their cart picks up where it was and follows them
    role('host'); putRemote(gx + 2, gz); S().gcart.mode = 'follow'; for (let q = 0; q < 500; q++) g.cart2.update(0.016);
    return Math.hypot(S().gcart.x - g.remote.pos.x, S().gcart.z - g.remote.pos.z) < 3 || 'the restored cart did not follow its owner';
  }));

  await guard('cart.new-game-state-has-no-friend-cart', async () => {
    const { newState } = await import('../state.js'); const n = newState(1); return (n.gcart === null && n.cart === null) || 'fresh state has a cart';
  });

  await guard('cart.hud-line-shows-the-local-players-own-cart', async () => lanes(async (hx, hz, gx, gz) => {
    const { h, gc } = bothOut(hx, hz, gx, gz); loadN(h, 4); loadN(gc, 9); h.tier = 2; gc.tier = 1;
    const read = () => { g.hudT = 0; g.updateHud(0.2); return [document.getElementById('cartN').textContent, document.getElementById('cartMax').textContent]; };
    const [n1, m1] = read(); if (n1 !== '4' || m1 !== String(60)) return `host line ${n1}/${m1}`;
    // as a guest, S.cart is the guest's own
    role('guest'); S().cart = gc; S().hcart = h; const [n2, m2] = read();
    return (n2 === '9' && m2 === '24') || `guest line ${n2}/${m2}`;
  }));

  await guard('cart.single-player-has-no-second-cart-and-sends-nothing', async () => {
    fresh({ cart: 3 }); craft('cart:2'); g.useCart(); const c = S().cart; p().pos.set(0, 0, 3); p().yaw = 0; c.x = 0; c.z = 0;
    for (let n = 0; n < 400; n++) g.cart.update(0.016);
    if (S().gcart || g.cart2.obj || g.cart2.c) return 'a second cart exists in single player';
    if (!(Math.abs(c.x - 1.6) < 0.4 && Math.abs(c.z - 3.3) < 0.6)) return `cart at ${c.x.toFixed(2)},${c.z.toFixed(2)}`;
    return g.myCartKey() === 'cart' || 'wrong key';
  });
}
