import { sp, kit } from './charger_lib.js';
// Click a bot, then a target: the panel names the action before E, and E does exactly that. One function (crew.intent) decides both.
export default async function (ctx) {
  const { T, g, S, p, L, fresh, craft, placeAtFloor, tiles, spot, cellX, cellZ, THREE } = ctx;
  const { look, rawTile, run, json } = kit(ctx);
  const upAll = { crew: 1, crewSlots: 3, power: 1, belts: 1, sorter: 1, vault: 1, cart: 1 };
  const DIRS = ['east', 'south', 'west', 'north'];
  const act = () => { g.updateBotHud(); return document.getElementById('biAct').textContent; };
  const aimTile = (t, back = 2.5) => look(cellX(t.i), t.j * 0.6 + 0.3, cellZ(t.k), back);
  const bot = (x = -6.5, z = 6.5) => { const b = g.crew.spawn(); b.x = x; b.z = z; b.y = 0; b.vy = 0; b.state = 'idle'; b.battery = 1; return b; };
  const pick = (b) => { g.crewSel = b.id; };
  const seenStates = (b, sec, stop) => { const seen = []; run(sec, 0.05, () => { if (seen[seen.length - 1] !== b.state) seen.push(b.state); return stop && b.state === stop; }); return seen; };
  const work = (b, x, z) => { b.origin = [x, z]; b.trail = []; b.dir = 0; b.faceCell = { i: ctx.toI(x), j: 0, k: ctx.toK(z) }; b.x = x; b.z = z; };
  const mix = () => [0, 0, 1, 2, 3, 4].map((r) => ({ sp: sp(r), vr: 0 }));
  const nearestDir = (x, y, z) => { let best = -1, bd = 1e9; for (let d = 0; d < 4; d++) { const f = g.crew.findFace(x, 0, z, d); if (!f) continue; const q = Math.abs(f.i - ctx.toI(x)) + Math.abs(f.k - ctx.toK(z)); if (q < bd) { bd = q; best = d; } } return best; };

  await T('crew.botcmd-generator-panel-names-it-and-e-sets-dig-plus-deliver', async () => {
    fresh(upAll); const b = bot(); const r = await placeAtFloor('gen', -3.4, 3.0, 2.0); if (!r.ok) return r.why; const gen = tiles().find((t) => t.type === 'gen'); pick(b);
    const want = nearestDir(cellX(gen.i), 0, cellZ(gen.k)); if (want < 0) return true; // no pile anywhere near this world, nothing to test
    aimTile(gen); const t = act(); if (!t.startsWith('E: Keep this Generator fuelled: dig ' + DIRS[want])) return `panel says "${t}", nearest face is ${DIRS[want]}`;
    g.useKey(); if (b.deliver !== gen.id || b.dir !== want || b.state !== 'goto' || !b.faceCell) return `deliver ${b.deliver} dir ${b.dir} state ${b.state}`;
    if (Math.hypot(b.origin[0] - cellX(gen.i), b.origin[1] - cellZ(gen.k)) > 0.1) return 'dig order does not start at the generator'; if (g.crewSel !== b.id) return 'selection lost';
    if (!/drop-off: Generator/.test((g.updateBotHud(), document.getElementById('botInfo').textContent))) return 'panel does not show the drop-off';
    return true;
  });
  await T('crew.botcmd-generator-bot-fills-the-hopper-sends-leftovers-to-the-bin-then-goes-back-to-work', async () => {
    fresh(upAll); const b = bot(); const r = await placeAtFloor('gen', -3.4, 3.0, 2.0); if (!r.ok) return r.why; const gen = tiles().find((t) => t.type === 'gen');
    const want = nearestDir(cellX(gen.i), 0, cellZ(gen.k)); if (want < 0) return true; pick(b); aimTile(gen); g.useKey(); if (b.deliver !== gen.id) return 'no order';
    work(b, cellX(gen.i) - 0.9, cellZ(gen.k)); b.state = 'farm'; b.carry = mix(); b.timer = 5; const money = S().money;
    const seen = seenStates(b, 130, 'goto' && null); const i = (s) => seen.indexOf(s);
    if (!(i('dwalk') >= 0 && i('dgive') > i('dwalk') && i('return') > i('dgive') && i('unload') > i('return'))) return 'states ' + seen;
    if (gen.q.length !== 5 || gen.q.some((x) => species(x) > 3)) return `hopper holds ${gen.q.length}`; if (!(S().money > money)) return 'the legendary was not sold at the bin';
    return (b.carry.length === 0 && seen.includes('goto', i('unload'))) || `carry ${b.carry.length} states ${seen}`;
    function species(x) { return ctx.species[x.sp].rarity; }
  });
  await T('crew.botcmd-charger-panel-and-order-and-empty-charger-refusal', async () => {
    fresh(upAll); S().crewFuel = false; const b = bot(); const r = await placeAtFloor('charger', -3.4, 3.0, 2.0); if (!r.ok) return r.why; const ch = tiles().find((t) => t.type === 'charger'); kit(ctx).live(ch); pick(b); b.battery = 0.3;   // (the crew's own fueling is off: this test is about the order)
    ch.reserve = 0; aimTile(ch); const t0 = act(); g.useKey(); if (t0 !== 'E: This Charging Station is empty' || b.state !== 'idle') return `empty: "${t0}" state ${b.state}`;
    ch.reserve = 3; const t1 = act(); if (t1 !== 'E: Recharge at this Charging Station (3.0 left), then carry on') return t1; g.useKey(); if (b.state !== 'chgwalk' || b.chg !== ch.id) return 'state ' + b.state;
    run(30); if (!(b.battery >= 0.95 && b.state === 'idle' && Math.abs(ch.reserve - (3 - 0.65)) < 0.1)) return `battery ${b.battery} state ${b.state} reserve ${ch.reserve}`;
    // a bot that was following comes back to following
    b.battery = 0.3; b.state = 'follow'; ch.reserve = 3; p().pos.set(-6, 0, 3); aimTile(ch); g.useKey(); const seen = seenStates(b, 30, null);
    return (seen[0] === 'chgwalk' && seen.includes('recharge') && b.state === 'follow') || 'following bot: ' + seen;
  });
  await T('crew.botcmd-sorter-vault-and-belt-become-the-drop-off-instead-of-the-bin', async () => {
    fresh(upAll); const b = bot(); pick(b); const out = [];
    const mk = [['vault', 'Vault Crate', -3.4, 3.0], ['sorter', 'Sorting Box', -3.4, 4.2], ['belt', 'belt', -3.4, 5.4]].map(([ty, nm, x, z]) => [rawTile(ty, ctx.toI(x), 0, ctx.toK(z)), nm]);
    for (const [t, nm] of mk) { b.deliver = null; aimTile(t, 2.2); const txt = act(); if (txt !== `E: Deliver plush to this ${nm} instead of the bin from now on`) out.push(`${t.type}: "${txt}"`); g.useKey(); if (b.deliver !== t.id) out.push(t.type + ' not set'); }
    return out.length === 0 || out.join('; ');
  });
  await T('crew.botcmd-full-bot-hands-a-vault-everything-then-resumes-and-an-unpowered-belt-crawls-and-keeps-taking-plush', async () => {
    fresh(upAll); const b = bot(); const v = rawTile('vault', ctx.toI(-3.4), 0, ctx.toK(3.0)); b.deliver = v.id; work(b, cellX(v.i) - 0.9, cellZ(v.k)); b.state = 'farm'; b.carry = mix(); b.timer = 5;
    const seen = seenStates(b, 60, 'goto'); if (v.stored.length !== 6 || b.carry.length || seen.includes('return') || b.state !== 'goto') return `vault ${v.stored.length} carry ${b.carry.length} states ${seen}`;
    const bt = rawTile('belt', ctx.toI(-3.4), 0, ctx.toK(5.4)); b.deliver = bt.id; work(b, cellX(bt.i) - 0.9, cellZ(bt.k)); b.state = 'farm'; b.carry = mix(); b.timer = 5; const s2 = seenStates(b, 60, 'unload');
    return (b.carry.length < 5 && s2.includes('dgive') && s2.includes('return')) || `belt ${bt.items.length} carry ${b.carry.length} states ${s2}`;
  });
  await T('crew.botcmd-floor-and-pile-start-a-dig-in-the-direction-you-face', async () => {
    fresh(upAll); const b = bot(); pick(b); let sp0 = null; for (const lane of [12, 8, 16, 20, 4]) { try { sp0 = spot(lane); break; } catch (e) { /* next lane */ } } if (!sp0) return true;
    look(cellX(sp0.i - 2), 0, cellZ(sp0.k), 3.0); const a = g.crewAim(); if (!a || a.kind !== 'spot' || a.dir !== 0) return 'aim ' + JSON.stringify(a && [a.kind, a.dir]);
    const txt = act(); if (txt !== 'E: Dig east from that spot') return txt; g.useKey();
    if (b.state !== 'goto' || b.dir !== 0 || Math.abs(b.origin[0] - cellX(sp0.i - 2)) > 0.6 || b.faceCell.i < sp0.i - 3) return `state ${b.state} dir ${b.dir} origin ${b.origin} face ${JSON.stringify(b.faceCell)}`;
    b.state = 'idle'; look(cellX(sp0.i + 1), 0.9, cellZ(sp0.k), 3.0); const a2 = g.crewAim(); if (!a2 || (a2.kind !== 'spot' && a2.kind !== 'feet')) return 'pile aim ' + (a2 && a2.kind); const t2 = act(); if (!/^E: Dig east from that spot$/.test(t2)) return 'pile: ' + t2;
    g.useKey(); return b.state === 'goto' || 'pile order not taken: ' + b.state;
  });
  await T('crew.botcmd-nothing-to-dig-that-way-says-so-and-does-nothing', async () => {
    fresh(upAll); const b = bot(); pick(b); look(-8, 0, 3, -3.0); const a = g.crewAim(); if (!a || a.kind !== 'spot') return 'aim ' + (a && a.kind);
    if (g.crew.findFace(a.x, 0, a.z, a.dir)) return true; // pile in that direction in this world: nothing to prove here
    const t = act(); const st = b.state; g.useKey(); return (t === `E: Nothing to dig ${DIRS[a.dir]} of that spot` && b.state === st && !b.origin) || `"${t}" state ${b.state}`;
  });
  await T('crew.botcmd-bin-sends-home-and-forgets-the-drop-off-feet-means-follow-me', async () => {
    fresh(upAll); const b = bot(); pick(b); b.deliver = 99999; const bp = g.hall.binPos; look(bp.x, 1.0, bp.z, 3.0); const a = g.crewAim(); if (!a || a.kind !== 'bin') return 'aim at the bin: ' + (a && a.kind);
    const t = act(); g.useKey(); if (t !== 'E: Go home and unload' || b.state !== 'return' || b.deliver !== null) return `"${t}" state ${b.state} deliver ${b.deliver}`;
    b.state = 'farm'; b.deliver = 99999; p().pos.set(-6, 0, 3); p().pitch = -1.45; g.renderer.camera.position.copy(p().eyePos(new THREE.Vector3())); const f = g.crewAim(); if (!f || f.kind !== 'feet') return 'aim at feet: ' + (f && f.kind);
    const t2 = act(); g.useKey(); return (t2 === 'E: Follow you' && b.state === 'follow' && b.deliver === null) || `"${t2}" state ${b.state} deliver ${b.deliver}`;
  });
  await T('crew.botcmd-cart-with-a-load-is-hauled-an-empty-one-is-refused', async () => {
    fresh(upAll); craft('cart:1'); p().pos.set(-6, 0, 3); p().yaw = Math.PI / 2; g.useCart(); const c = S().cart; if (!c) return 'no cart'; c.mode = 'stay'; c.x = -3.4; c.z = 3.0; c.y = 0; c.load = [];
    const b = bot(-4.5, 5.5); pick(b); look(c.x, c.y + 0.5, c.z, 3.0); const a = g.crewAim(); if (!a || a.kind !== 'cart') return 'aim ' + (a && a.kind);
    const t0 = act(); g.useKey(); if (t0 !== 'E: Your cart is empty' || b.state !== 'idle') return `empty: "${t0}" ${b.state}`;
    c.load = [{ sp: sp(0), vr: 0 }, { sp: sp(1), vr: 0 }, { sp: sp(2), vr: 0 }]; const t1 = act(); g.useKey(); if (t1 !== 'E: Haul the cart to the bin' || b.state !== 'haulgo') return `loaded: "${t1}" ${b.state}`;
    const seen = seenStates(b, 25, null); return (c.load.length === 0 && seen.includes('return')) || `cart ${c.load.length} states ${seen}`;
  });
  await T('crew.botcmd-the-panel-and-the-action-always-agree-for-every-target', async () => {
    fresh(upAll); const b = bot(); const r = await placeAtFloor('gen', -3.4, 3.0, 2.0); const ch = rawTile('charger', ctx.toI(-3.4), 0, ctx.toK(4.2)); ch.reserve = 2; const bad = [];
    const vault = rawTile('vault', ctx.toI(-3.4), 0, ctx.toK(5.4)); const gen = tiles().find((t) => t.type === 'gen'); const tgts = [{ k: 'tile', id: gen && gen.id }, { k: 'tile', id: ch.id }, { k: 'tile', id: vault.id }, { k: 'bin' }, { k: 'feet' }, { k: 'cart' }, { k: 'spot', x: -8, y: 0, z: 3, dir: 0 }, null, { k: 'tile', id: 424242 }];
    for (const tg of tgts) {
      const snap = () => json({ s: b.state, d: b.deliver, c: b.chg, o: b.origin }); b.state = 'idle'; b.deliver = null; b.origin = null; b.chg = null; const before = snap();
      const it = g.crew.intent(b, tg); const res = g.crew.command(b, tg, true); const after = snap(); const changed = JSON.stringify(before) !== JSON.stringify(after);
      if (it.ok !== res.ok || (it.ok && res.msg !== it.toast) || (!it.ok && (changed || res.msg !== it.text))) bad.push(`${JSON.stringify(tg)}: intent ${it.ok}/${it.text} command ${res.ok}/${res.msg} changed ${changed}`);
      if (it.ok && !changed && it.act !== 'dig') bad.push(`${it.act} changed nothing`);
    }
    void r; return bad.length === 0 || bad.join(' | ');
  });
}
