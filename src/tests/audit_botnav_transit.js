// botnav.audit.lift.* and botnav.audit.door.*: two bots on one lift, a power cut mid ride, a door that must never close on a bot.
// Run: `await __selftest('botnav.audit')`
import { kit as transitKit } from './transit_lib.js';
import * as TR from '../transit.js';
import { kit } from './botnav_lib.js';

export default async function (ctx) {
  const { g, S, w, adv, toI, toK } = ctx;
  const X = transitKit(ctx), H = kit(ctx, { shell: false }), C = 0.6, NAV = H.NAV;
  H.force.on = false;
  const G = (name, fn) => H.guard(name, async (toasts) => { H.force.on = false; X.setup(); try { return await fn(toasts); } finally { X.clean(); H.force.on = true; } }, { setup: false });
  const LI = () => toI(-6), LK = () => toK(3);
  const shaft = (o = {}) => {
    const L0 = X.lift(LI(), LK(), { home: 8, depth: 8, top: 12 }); X.tunnel(L0, 0, 2, 8); X.ledge(L0, 8, 0);
    if (o.power !== false) X.powerCab(L0, 2);
    TR.refreshShaft(g, L0); L0.ex = L0.tr; adv(0.7);
    return L0;
  };
  const west = (L0, n = 0) => H.mkBot(H.cellX(L0.i0 - 9 - n), H.cellZ(L0.k0 + 1 + (n % 2)), 0.02);
  const upper = (L0) => ({ i: L0.i0 + 5, k: L0.k0 + 1 });

  await G('botnav.audit.lift.two-bots-share-a-lift-and-both-arrive-neither-gives-up', async (toasts) => {
    const L0 = shaft(); const u = upper(L0);
    const t1 = H.gen(u.i, u.k, 8), t2 = H.gen(u.i, u.k + 2, 8); H.fillOthers(null); t1.q.length = 0; t2.q.length = 0;
    const a = west(L0, 0), b = west(L0, 1); a.carry = H.mix(6); b.carry = H.mix(6);
    g.crew.goHome(a); g.crew.goHome(b);
    const tl = []; let q = 0;
    H.watch(a, 300, () => t1.q.length + t2.q.length >= 12 && a.state === 'idle' && b.state === 'idle' && NAV.isGround(a) && NAV.isGround(b), { each: () => { if (++q % 200 === 0) tl.push(`${(q * 0.05) | 0}s a ${a.state} ${a.y.toFixed(1)} c${NAV.codeOf(a)} b ${b.state} ${b.y.toFixed(1)} c${NAV.codeOf(b)} cab ${L0.cy.toFixed(1)}`); } });
    const fed = t1.q.length + t2.q.length;
    if (toasts.some((m) => /never came|stopped|will not/i.test(m))) return 'a bot gave up on the lift: ' + toasts.join(' / ');
    if (fed !== 12) return `only ${fed} of 12 plush reached the generators: a ${a.state} ${a.y.toFixed(2)} b ${b.state} ${b.y.toFixed(2)} ${toasts.join(' / ')}`;
    return (NAV.isGround(a) && NAV.isGround(b)) || `not both down again: ${a.y.toFixed(2)} ${b.y.toFixed(2)} ${tl.join(' | ')}`;
  });

  await G('botnav.audit.lift.a-power-cut-mid-ride-never-strands-a-bot-outside-the-cab-and-it-finishes-when-power-returns', async (toasts) => {
    const L0 = shaft(); const u = upper(L0); const t = H.gen(u.i, u.k, 8); H.fillOthers(t);
    const b = west(L0); b.carry = H.mix(5); g.crew.goHome(b);
    let cut = false, outside = 0;
    H.watch(b, 120, () => cut && L0.pw > 0.05 && b.state === 'idle' && b.carry.length === 0, { each: (bb) => {
      if (!cut && NAV.codeOf(bb) === NAV.CODE.ride && L0.cy > 0.5 && L0.cy < 8 * C - 0.4) { cut = true; for (const c of g.cables.of(L0.id)) g.cables.remove(c.id, false); g.power.markDirty(); }
      if (cut && L0.pw > 0.05 === false && Math.hypot(bb.x - L0.px, bb.z - L0.pz) > 1.3 && bb.y > 0.5 && bb.y < 8 * C - 0.2) outside++;
    } });
    if (!cut) return 'the bot never rode';
    if (outside > 3) return `the bot hung ${outside} frames in the shaft outside the cab`;
    // power comes back
    X.powerCab(L0, 2); adv(0.9); H.run(0.5);
    H.watch(b, 120, () => b.state === 'idle' && b.carry.length === 0 && NAV.isGround(b));
    return t.q.length === 5 || `after the power came back: hopper ${t.q.length} of 5, bot ${b.state} at y ${b.y.toFixed(2)}, cab at ${L0.cy.toFixed(2)} pw ${L0.pw}, toasts ${toasts.join(' / ')}`;
  });

  await G('botnav.audit.lift.a-bot-in-a-dead-cab-is-phased-home-by-the-stuck-timer', async (toasts) => {
    const L0 = shaft(); const u = upper(L0); const t = H.gen(u.i, u.k, 8); H.fillOthers(t);
    const b = west(L0); b.carry = H.mix(5); g.crew.goHome(b);
    let cut = false;
    H.watch(b, 60, () => cut, { each: (bb) => { if (!cut && NAV.codeOf(bb) === NAV.CODE.ride && L0.cy > 0.5 && L0.cy < 8 * C - 0.4) { cut = true; for (const c of g.cables.of(L0.id)) g.cables.remove(c.id, false); g.power.markDirty(); } } });
    if (!cut) return 'the bot never rode';
    H.watch(b, 220, () => Math.hypot(b.x - L0.px, b.z - L0.pz) > 4 && b.y < 1.5);
    return (Math.hypot(b.x - L0.px, b.z - L0.pz) > 4 && b.y < 1.5) || `after 220 s the bot is still at ${b.x.toFixed(1)}, ${b.y.toFixed(2)}, ${b.z.toFixed(1)} (${b.state}), cab at ${L0.cy.toFixed(2)}: ${toasts.slice(-2).join(' / ')}`;
  });

  await G('botnav.audit.lift.a-bot-saved-mid-ride-is-restored-in-the-cab-and-finishes', async (toasts) => {
    const L0 = shaft(); const u = upper(L0); const t = H.gen(u.i, u.k, 8); H.fillOthers(t);
    const b = west(L0); b.carry = H.mix(5); g.crew.goHome(b);
    const r0 = H.watch(b, 90, () => NAV.codeOf(b) === NAV.CODE.ride && L0.cy > 0.5 && L0.cy < 8 * C - 0.4);
    if (NAV.codeOf(b) !== NAV.CODE.ride) return `the bot never rode: ${b.state} ${b.y.toFixed(2)} t ${r0.t} codes ${[...r0.codes]} states ${r0.states} hopper ${t.q.length} pw ${L0.pw} mv ${L0.mv} cab ${L0.cy} ${toasts.join(' / ')}`;
    const saved = JSON.stringify(S().crew), back = JSON.parse(saved); S().crew.length = 0; for (const o of back) S().crew.push(o); g.crew.clear(); g.crew.sync();
    const b2 = S().crew[0]; NAV.resetBot(b2); NAV.invalidate('reload');
    H.watch(b2, 200, () => b2.state === 'idle' && b2.carry.length === 0 && NAV.isGround(b2));
    return t.q.length === 5 || `hopper ${t.q.length} of 5, bot ${b2.state} at ${b2.y.toFixed(2)} cab ${L0.cy.toFixed(2)} ${toasts.slice(-2).join(' / ')}`;
  });

  // ---- doors ----
  const room = (o = {}) => {
    const i0 = toI(-6), k0 = toK(4);
    for (let i = i0 - 3; i < i0 + 8; i++) for (let k = k0; k < k0 + 9; k++) for (let j = 0; j < 6; j++) if (!w().get(i, j, k)) X.poke(i, j, k, 2, 0);
    for (let i = i0; i < i0 + 4; i++) for (let k = k0; k < k0 + 8; k++) for (let j = 0; j < 4; j++) if (w().get(i, j, k)) X.poke(i, j, k, 0, 0);
    const D = X.door(i0, k0, { lock: 'none', auto: o.auto === undefined ? true : o.auto });
    X.powerAt(H.cellX(i0 + 1), H.cellZ(k0 - 4), 2); adv(0.7);
    const ch = H.charger(i0 + 1, k0 + 4, 0, { reserve: 4 }); H.fillOthers(ch);
    const bot = H.mkBot(H.cellX(i0 + 1), H.cellZ(k0 - 6), 0.02); bot.battery = 0.5;
    return { i0, k0, D, ch, bot };
  };
  for (const auto of [true, false]) {
    await G(`botnav.audit.door.a-${auto ? 'self closing' : 'held'}-door-never-closes-on-a-bot-in-the-doorway`, async (toasts) => {
      const R = room({ auto }); const b = R.bot; const cells = TR.allDoorCells(R.D);
      g.crew.command(b, { k: 'tile', id: R.ch.id }, true);
      let crushed = 0, inDoor = 0;
      H.watch(b, 70, () => b.battery > 0.95, { each: (bb) => {
        const i = toI(bb.x), k = toK(bb.z), j = Math.floor(bb.y / C + 1e-6);
        if (cells.some(([ci, cj, ck]) => ci === i && ck === k && cj >= j && cj < j + 3)) { inDoor++; if (cells.every(([ci, cj, ck]) => w().get(ci, cj, ck) === H.BULK || true) && cells.some(([ci, cj, ck]) => ci === i && ck === k && cj >= j && cj < j + 3 && w().get(ci, cj, ck) === H.BULK)) crushed++; }
      } });
      if (b.battery <= 0.95) return `the bot never finished charging (${b.state} at ${b.x.toFixed(1)}, ${b.z.toFixed(1)}, door ${R.D.p}) ${toasts.join(' / ')}`;
      return crushed === 0 || `the door was shut over the bot for ${crushed} of ${inDoor} frames in the doorway`;
    });
  }
}
