// mp.intake.audit.* : the audit of the host side of a guest's `feed` (src/beltintake.js hostFeed). One page plays both roles by switching g.net.role, as in mp_intake.js.
// The guest's hands live on the guest's screen, so the host cannot know what the guest really holds: what it can do is check the target, the species, where the guest stands and the rate.
import { makeBeltKit, UP_BASE } from './belts_lib.js';
import * as BI from '../beltintake.js';
import { NEEDLE, DECOY0 } from '../plushdata.js';
import * as BINS from '../bins.js';

export default async function (ctx) {
  const { T: T0, g, S, p, L, toI, toK, cellX, cellZ, V3 } = ctx;
  const B = makeBeltKit(ctx), sp = B.sp, json = B.json; void T0;
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; L().visualOnly = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const T = (name, fn) => B.T(name, async () => { try { return await fn(); } finally { role(null); delete g._bi; delete g.netSend; g.remote = null; ctx.fresh({}); } });
  const ci = () => toI(-11), ck = () => toK(0.3);
  const setup = (lv = 0, extra = {}) => { B.setup({ ...UP_BASE, beltIntake: lv, ...extra }); delete S().beltIntakeOff; g._bi = null; g.fliers.length = 0; cap(); };
  const friend = (x, z, y = 0) => { g.remote = { pos: new V3(x, y, z), yaw: 0 }; };
  const feedMsg = (t, extra = {}) => ({ id: t.id, sp, vr: 0, pull: 1, ...extra });
  const go = (d) => { g._bi = null; g.time += 5; sent = []; g.netCmd('feed', d); };
  const at = (e) => L().byId.get(e.id);

  await T('mp.intake.audit.a-guest-position-that-is-not-a-number-never-passes-the-range-check', async () => {
    setup(7); role('host'); const t = B.lay(0, 1, ci(), ck(), 0)[0]; const bad = [];
    for (const [nm, pos] of [['NaN x', [NaN, 0, 0]], ['NaN z', [cellX(ci()), 0, NaN]], ['NaN y', [cellX(ci()), NaN, cellZ(ck())]], ['string', ['a', 0, 'b']], ['Infinity', [Infinity, 0, 0]]]) {
      g.remote = { pos: new V3(0, 0, 0), yaw: 0 }; g.remote.pos.x = pos[0]; g.remote.pos.y = pos[1]; g.remote.pos.z = pos[2];
      for (const pull of [1, 0]) { t.items = []; go(feedMsg(t, { pull })); if (t.items.length) bad.push(`${nm} (pull ${pull}): a feed was taken from a guest whose position is not a number`); }
    }
    friend(cellX(ci()), cellZ(ck())); t.items = []; go(feedMsg(t)); if (t.items.length !== 1) bad.push('a guest standing at the belt was refused');
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.intake.audit.a-feed-only-ever-goes-into-a-belt-or-a-sorting-box-never-a-vault-a-generator-or-a-charger', async () => {
    setup(7); role('host'); friend(cellX(ci()), cellZ(ck())); const bad = [];
    const vault = at(g.placeEntity('vault', { i: ci() + 2, j: 0, k: ck(), dir: 0 }, { quiet: true, rebuild: false }));
    const gen = at(g.placeEntity('gen', { i: ci() + 4, j: 0, k: ck(), dir: 0 }, { quiet: true, rebuild: false }));
    for (const [nm, e] of [['vault', vault], ['generator', gen]]) {
      if (!e) { bad.push('no ' + nm + ' placed'); continue; }
      for (const s of [sp, NEEDLE, 5, 99999]) for (const pull of [0, 1]) { go({ id: e.id, sp: s, vr: 0, pull }); }
    }
    if (vault && vault.stored.length) bad.push('the vault took ' + vault.stored.length + ' plush from a feed (the One among them: ' + vault.stored.some((x) => x.sp === NEEDLE) + ')');
    if (gen && gen.q.length) bad.push('the generator took ' + gen.q.length + ' from a feed');
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.intake.audit.a-sorting-box-takes-a-feed-from-a-guest-who-is-near-it-and-only-that', async () => {
    setup(0); role('host'); const bad = [];
    const so = at(g.placeEntity('sorter', { i: ci(), j: 0, k: ck(), dir: 0 }, { quiet: true, rebuild: false }));
    friend(cellX(ci()) - 1.5, cellZ(ck())); go({ id: so.id, sp, vr: 0 }); if (so.q.length !== 1) bad.push('a sorting box refused a feed from a guest 1.5 m away');
    so.q.length = 0; friend(cellX(ci()) - 40, cellZ(ck())); go({ id: so.id, sp, vr: 0 }); if (so.q.length) bad.push('a sorting box took a feed from a guest 40 m away'); if (ofType('give').length !== 1) bad.push('the refused plush did not go back to the guest');
    so.q.length = 0; friend(cellX(ci()) - 1.5, cellZ(ck())); go({ id: so.id, sp: NEEDLE, vr: 0 }); if (so.q.length || ofType('give').length) bad.push('The One was taken by a sorting box or handed back');
    go({ id: so.id, sp: 5.5, vr: 0 }); go({ id: so.id, sp, vr: 'x' }); go({ id: so.id, sp: 99999, vr: 0 }); if (so.q.length) bad.push('junk went into a sorting box');
    so.q = [{ sp, vr: 0, t: 0 }, { sp, vr: 0, t: 0 }, { sp, vr: 0, t: 0 }]; go({ id: so.id, sp, vr: 0 }); if (so.q.length !== 3 || ofType('give').length !== 1) bad.push('a full sorting box: the feed was not handed back');
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.intake.audit.the-one-is-refused-on-every-feed-and-a-fake-still-works-as-a-hand-drop', async () => {
    setup(7); role('host'); const t = B.lay(0, 1, ci(), ck(), 0)[0]; friend(cellX(ci()), cellZ(ck())); const bad = [];
    for (const pull of [0, 1]) { t.items = []; go({ id: t.id, sp: NEEDLE, vr: 0, pull }); if (t.items.length || ofType('give').length) bad.push(`The One (pull ${pull}) was taken or handed back`); }
    t.items = []; go({ id: t.id, sp: DECOY0, vr: 0 }); if (t.items.length !== 1) bad.push('a fake dropped by hand onto a belt was refused (a guest can carry one)');
    t.items = []; go({ id: t.id, sp: DECOY0, vr: 0, pull: 1 }); if (t.items.length) bad.push('a fake was pulled onto a belt');
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.intake.audit.a-flood-of-forged-feeds-in-one-frame-is-cheap-and-takes-only-the-burst', async () => {
    setup(7); role('host'); const ts = []; for (let r = 0; r < 5; r++) ts.push(...B.lay(0, 5, ci() - 2, ck() - 2 + r, 0)); friend(cellX(ci()), cellZ(ck())); const bad = [];
    g._bi = null; g.time += 5; BI.state(g); sent = [];
    const a = performance.now(); for (let n = 0; n < 20000; n++) g.netCmd('feed', feedMsg(ts[n % ts.length])); const ms = performance.now() - a;
    const took = ts.reduce((x, t) => x + t.items.length, 0); if (took > 65) bad.push(`20,000 forged feeds in one instant put ${took} plush on the belts (Mk8 burst is 64)`);
    if (ms > 2500) bad.push(`20,000 forged feeds took ${ms.toFixed(0)} ms`); window.__intakeFlood = { ms: +ms.toFixed(0), took }; console.log(`audit: 20,000 forged feeds ${ms.toFixed(0)} ms, ${took} taken`);
    return bad.length === 0 || bad.join('; ');
  });

  await T('mp.intake.audit.the-guests-cart-sent-to-a-bin-keeps-its-load-and-a-wild-intake-command-does-nothing-odd', async () => {
    setup(7); role('host'); const ts = []; for (let r = 0; r < 3; r++) ts.push(...B.lay(0, 3, ci() - 1, ck() - 1 + r, 0)); friend(cellX(ci()) + 20, cellZ(ck())); S().carry = []; const bad = [];
    S().gcart = { tier: 2, x: cellX(ci()) + 0.5, y: 0, z: cellZ(ck()), yaw: 0, mode: 'follow', dest: BINS.HALL, load: Array.from({ length: 10 }, () => ({ sp, vr: 0 })) };
    const run = () => { for (let n = 0; n < 20; n++) { g.time += 0.05; BI.update(g, 0.05); for (const t of ts) t.items.length = 0; } };
    run(); if (S().gcart.load.length !== 10) bad.push('a belt took plush off a guest cart that was sent to a bin');
    for (const d of [null, undefined, 5, 'x', {}, { off: 'no' }, [1]]) { try { g.netCmd('intake', d); } catch (e) { bad.push('intake command ' + JSON.stringify(d) + ' threw: ' + e.message); } }
    return bad.length === 0 || bad.join('; ');
  });
}
