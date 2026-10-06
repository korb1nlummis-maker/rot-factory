// Multiplayer parity for the endgame perks, the economy and late joiners, no network: one page plays both roles by switching
// g.net.role and capturing g.netSend. The wallet, the upgrades and every price live on the host; the guest mirrors them.
import { UPGRADES } from '../upgrades.js';
import { fmt } from '../util.js';
import { species } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, w, p, L, fresh, tiles, toI, toK, cellX, cellZ, adv } = ctx;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); g._sharedKey = undefined; g.hostEco = null; };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = async (fn) => { try { return await fn(); } finally { done(); g.ui.closeModalsSilently(); g.ui.setMoney(S().money, true); } };
  const bareTest = (name, fn) => T(name, () => guard(fn));
  const ids = ['midas', 'exchange', 'titanGrip', 'longArm', 'fusion', 'rigSwarm', 'mechLegion', 'borerLegion', 'overdrive'];
  const prereq = (u) => ({ [u.req.id]: u.req.lvl });

  await bareTest('mp.perks.guest-buying-each-endgame-perk-spends-the-host-wallet-once-and-both-sides-retune-the-same', async () => {
    const bad = [];
    for (const id of ids) {
      const u = UPGRADES.find((x) => x.id === id);
      for (let lvl = 0; lvl < u.max; lvl++) {
        fresh({ ...prereq(u), ...(lvl ? { [id]: lvl } : {}) }); S().money = u.cost[lvl] + 12345; const m0 = S().money; const up0 = json(S().up);
        role('guest'); cap(); g.buy(id); const c = sent.find((m) => m.t === 'cmd' && m.c === 'buy');
        if (!c || c.d.id !== id) { bad.push(`${id} L${lvl + 1}: no buy command`); continue; }
        if (S().money !== m0 || (S().up[id] || 0) !== lvl) { bad.push(`${id} L${lvl + 1}: the guest changed the wallet or level itself`); continue; }
        done(); role('host'); cap(); g.netMessage(json(c));
        const spent = m0 - S().money; const sh = ofType('shared').pop(); const hostT = json(g.T);
        if (spent !== u.cost[lvl]) bad.push(`${id} L${lvl + 1}: host charged ${spent}, price ${u.cost[lvl]}`);
        if (!sh || sh.money !== S().money || (sh.up[id] || 0) !== lvl + 1) { bad.push(`${id} L${lvl + 1}: shared message has money ${sh && sh.money}, level ${sh && sh.up[id]}`); continue; }
        // the guest starts from the old wallet and levels, applies the host's shared message and must end with the same numbers
        done(); S().money = m0; S().up = up0; g.T = g.tune(); role('guest'); cap(); g.applyShared(json(sh));
        if (S().money !== sh.money || (S().up[id] || 0) !== lvl + 1) bad.push(`${id} L${lvl + 1}: guest wallet ${S().money} level ${S().up[id]}`);
        const gt = json(g.T); const diff = Object.keys(hostT).filter((k) => JSON.stringify(hostT[k]) !== JSON.stringify(gt[k]));
        if (diff.length) bad.push(`${id} L${lvl + 1}: tuning differs on the guest: ${diff.join(',')}`);
        done();
      }
    }
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  });

  await bareTest('mp.perks.a-guest-who-cannot-afford-a-perk-changes-nothing-and-the-host-keeps-its-money', async () => {
    const u = UPGRADES.find((x) => x.id === 'midas'); fresh(prereq(u)); S().money = u.cost[0] - 1; role('host'); cap(); g.netCmd('buy', { id: 'midas' });
    const sh = ofType('shared').pop(); return (S().money === u.cost[0] - 1 && !(S().up.midas) && sh && sh.money === u.cost[0] - 1 && !(sh.up.midas)) || `money ${S().money} level ${S().up.midas}`;
  });

  await bareTest('mp.perks.the-guest-shop-shows-the-hosts-wallet-and-prices-in-short-form', async () => {
    const u = UPGRADES.find((x) => x.id === 'midas'); fresh(prereq(u)); role('host'); cap(); S().money = 400e6; g.sendShared(); const sh = json(ofType('shared').pop()); done();
    S().money = 5; S().up = {}; role('guest'); g.applyShared(sh); g.ui.open('shop'); g.ui.shopCat = 'sort'; g.ui.renderShop();
    const money = document.getElementById('shopMoney').textContent; const btns = [...document.querySelectorAll('#shopGrid .card')].find((c) => c.querySelector('h3').textContent.includes('Midas'));
    const label = btns && btns.querySelector('button').textContent; g.ui.closeModalsSilently();
    return (money === '400M' && label && label.includes('◈ 2.50M') && !btns.querySelector('button').disabled) || `shop money "${money}" label "${label}"`;
  });

  await bareTest('mp.perks.big-numbers-stay-short-in-the-money-hud-and-the-shop', async () => {
    const bad = [], vals = [4e8, 999999, 99999.6, 1e9, 1.5e9, 99.96e9, 999.96e9, 999999999999, 1e12, 1.23e15, 1e18, 9.99e20, 1e21, 1e30];
    for (const v of vals) {
      g.ui.setMoney(v, true); const hud = document.getElementById('moneyVal').textContent;
      if (!/^\d{1,3}(\.\d{1,2})?(K|M|B|T|Qa|Qi)?$/.test(hud) && !/^\d\.\d\de\d+$/.test(hud)) bad.push(`HUD ${v} -> "${hud}"`);
      if (hud.length > 7) bad.push(`HUD ${v} -> "${hud}" is wider than 7 characters`);
    }
    const money = document.getElementById('moneyVal'); const box = money.parentElement; g.ui.setMoney(99.96e9, true); const w1 = box.scrollWidth, w2 = box.clientWidth; if (w1 > w2 + 1) bad.push(`HUD box overflows ${w1} > ${w2}`);
    if (fmt(400000000) !== '400M') bad.push('400,000,000 shows as ' + fmt(400000000));
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  });

  await bareTest('mp.perks.shop-buttons-for-the-biggest-prices-do-not-wrap-or-overflow', async () => {
    fresh({}); S().money = 5.5e11; g.ui.open('shop'); const bad = [];
    for (const cat of ['sort', 'hands', 'machine']) {
      g.ui.shopCat = cat; g.ui.renderShop();
      for (const c of document.querySelectorAll('#shopGrid .card')) {
        const b = c.querySelector('button'); if (!b || !/Buy/.test(b.textContent)) continue;
        if (b.scrollWidth > b.clientWidth + 1 || b.getClientRects()[0].height > 44) bad.push(`${cat}: "${b.textContent.trim()}" wraps or overflows`);
      }
    }
    g.ui.closeModalsSilently(); return bad.length === 0 || bad.slice(0, 4).join('; ');
  });

  await bareTest('mp.economy.a-sale-is-valued-the-same-on-the-host-and-on-the-guest', async () => {
    fresh({ haggle: 10, midas: 3, dex: 1, exchange: 2 }); S().stats.maxDist = 3100; S().dex = {}; for (let n = 1; n <= 240; n++) S().dex[n] = 1;
    const sp = species.findIndex((s, n) => n > 0 && s && s.rarity === 2); const hostV = g.valueOf(sp, 0, 0), hostShiny = g.valueOf(sp, 128, 0), hostStreak = g.valueOf(sp, 0, 4);
    role('host'); cap(); g.sendShared(); const sh = json(ofType('shared').pop()); done();
    // the guest has its own, different personal stats and plushdex
    const stats0 = S().stats.maxDist, dex0 = S().dex; S().stats.maxDist = 12; S().dex = { 3: 1 }; S().up = {}; S().money = 0; g.T = g.tune(); role('guest'); g.applyShared(sh);
    const gv = g.valueOf(sp, 0, 0), gs = g.valueOf(sp, 128, 0), gk = g.valueOf(sp, 0, 4); S().stats.maxDist = stats0; S().dex = dex0;
    return (gv === hostV && gs === hostShiny && gk === hostStreak) || `host ${hostV}/${hostShiny}/${hostStreak} guest ${gv}/${gs}/${gk}`;
  });

  await bareTest('mp.economy.the-price-a-guest-sees-is-what-the-host-pays', async () => {
    fresh({ haggle: 10, midas: 2 }); S().stats.maxDist = 2000; const sp = species.findIndex((s, n) => n > 0 && s && s.rarity === 1);
    const shown = g.valueOf(sp, 0, 0); role('host'); cap(); const m0 = S().money; g.netCmd('sell', { sp, vr: 0, dist: 0, streak: false }); const paid = S().money - m0;
    return paid === shown || `guest shows ${shown}, host paid ${paid}`;
  });

  await bareTest('mp.perks.shop-lock-by-plush-handled-follows-the-hosts-count-on-the-guest', async () => {
    fresh({ bag: 3, belts: 1 }); const u = UPGRADES.find((x) => x.needs && x.cat); S().stats.plush = u.needs; role('host'); cap(); g.sendShared(); const sh = json(ofType('shared').pop()); done();
    fresh({ ...prereq(u) }); S().stats.plush = 0; S().money = 1e12; role('guest'); g.applyShared(sh); g.ui.open('shop'); g.ui.shopCat = u.cat; g.ui.renderShop();
    const card = [...document.querySelectorAll('#shopGrid .card')].find((c) => c.querySelector('h3 span').textContent === u.name); const txt = card ? card.querySelector('button').textContent : 'no card'; g.ui.closeModalsSilently();
    return !/Needs [\d,]+ plush/.test(txt) || `guest shop says "${txt}" although the host has handled ${u.needs}`;
  });

  // ------------------------------------------------------------------ late joiner
  await bareTest('mp.join.a-late-joiner-gets-supports-corner-belts-fuelled-generators-fans-frames-and-upgrades', async () => {
    fresh({ timber: 1, belts: 1, gen: 1, midas: 2, haggle: 10, fusion: 1, genOutput: 6 }); role('host'); cap(); const bad = [];
    const b = g.hall.binPos, x0 = b.x - 3, z0 = b.z + 3;
    for (const [x, z, d] of [[x0, z0, 0], [x0 + 0.6, z0, 0], [x0 + 1.2, z0, 0], [x0 + 1.8, z0, 3], [x0 + 1.8, z0 - 0.6, 3]]) g.layBelt(toI(x), 0, toK(z), d);
    const gen = { id: g.nextId(), type: 'gen', i: toI(x0 + 4), j: 0, k: toK(z0 + 3), dir: 0, rise: 0 }; S().entities.push(gen); g.addEntity(gen);
    for (let n = 0; n < 5; n++) L().accept(gen, { sp: 1, vr: 0 }, null); gen.burn = 30; gen.burnMax = 60; gen.cur = { sp: 1, vr: 0 };
    const frame = { id: g.nextId(), type: 'frame', kind: 'steel', axis: 'z', cx: cellX(toI(40)), cz: cellZ(toK(40)), y0: 0, w: 2.36, h: 2.38, yaw: 0.6, turned: true }; S().entities.push(frame); g.addEntity(frame);
    const fan = { id: g.nextId(), type: 'fan', mounted: true, frameId: frame.id, i: toI(40), j: 3, k: toK(40), dir: 0, rise: 0, px: frame.cx, py: 2.1, pz: frame.cz, fyaw: 0.6 }; S().entities.push(fan); g.addEntity(fan);
    L().rebuildBelts(); const hostCornerN = L().cornerN, hostSupports = w().supports.length;
    const hostGenInfo = g.genInfo(gen).lines.join('|'); const hostT = json(g.T);
    sent = []; g.sendWorld(); const msgs = json(sent); p().pos.set(x0, 0, z0); g.remote = { pos: p().pos.clone() }; sent = []; g.sendDyn(); const dyn = json(ofType('dyn')[0]); g.remote = null; done();
    // the joiner knows nothing: wipe the structures and the upgrades, then replay what the host sent after 'world'
    for (const e of [...S().entities]) { const t = L().byId.get(e.id); if (t) L().remove(t); const it = g.machines.items.get(e.id); if (it) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(e.id); } }
    S().entities = []; w().supports = []; S().up = {}; S().money = 0; g.T = g.tune(); role('guest'); cap();
    for (const m of msgs) if (m.t === 'ents' || m.t === 'shared') g.netMessage(m); L().update(0.05); g.applyDyn(dyn);
    if (L().cornerN !== hostCornerN || hostCornerN < 1) bad.push(`corners ${L().cornerN} vs host ${hostCornerN}`);
    if (w().supports.length !== hostSupports) bad.push(`supports ${w().supports.length} vs host ${hostSupports}`);
    if (!g.machines.items.get(frame.id) || !g.machines.items.get(fan.id) && !L().byId.get(fan.id)) bad.push('frame or fan missing');
    const gg = L().byId.get(gen.id); if (!gg) bad.push('generator missing'); else { const gi = g.genInfo(gg).lines.join('|'); const strip = (s) => s.replace(/grid [^|]*/, ''); if (strip(gi) !== strip(hostGenInfo)) bad.push(`generator readout differs: "${gi}" vs "${hostGenInfo}"`); }
    if (S().up.midas !== 2 || S().up.fusion !== 1 || S().money <= 0) bad.push('upgrades or money missing: ' + JSON.stringify(S().up));
    const gt = json(g.T); const diff = Object.keys(hostT).filter((k) => JSON.stringify(hostT[k]) !== JSON.stringify(gt[k])); if (diff.length) bad.push('tuning differs: ' + diff.join(','));
    return bad.length === 0 || bad.join('; ');
  });
}
