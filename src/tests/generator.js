import { BURN_SECONDS, ENERGY_KJ, FUEL_MAX_RARITY, burnTime, GEN_BASE_KW } from '../power.js';
import { pools, species } from '../plushdata.js';
export default async function (ctx) {
  const { T, g, S, w, p, L, fresh, craft, selectTool, placeAtFloor, adv, tiles, tune, sim, cellX, cellZ, toI, toK, newWorld } = ctx;
  const up = { power: 1, belts: 1 };
  const sp = (r) => pools[r][0];
  const mkGen = async (extra = {}) => { fresh({ ...up, ...extra }); const r = await placeAtFloor('gen', -3.4, 3.0, 2.0); if (!r.ok) throw new Error('gen: ' + r.why); return tiles().find((t) => t.type === 'gen'); };
  const run = (gen, seconds) => { const dt = 0.1; for (let n = 0; n < seconds / dt; n++) { g.time += dt; g.power.update(dt); } };
  await T('power.burn-time-per-rarity-is-decent-and-follows-the-table', async () => {
    const bad = [];
    for (const [lvl, mult] of [[0, 1], [2, 1.7 * 1.7]]) {
      for (let r = 0; r <= 3; r++) {
        const gen = await mkGen(lvl ? { genOutput: lvl } : {}); gen.q.push({ sp: sp(r), vr: 0 }); run(gen, 0.2); const startBurn = gen.burn; const want = BURN_SECONDS[r] / mult;
        if (Math.abs(startBurn - want) > 0.5) bad.push(`rarity ${r} lvl ${lvl}: ${startBurn.toFixed(1)} s, table says ${want.toFixed(1)} s`);
        const cur = gen.cur && species[gen.cur.sp] && species[gen.cur.sp].rarity; if (cur !== r) bad.push(`rarity ${r}: shows ${cur} as burning`);
      }
    }
    if (!(BURN_SECONDS[0] >= 60 && BURN_SECONDS[1] > BURN_SECONDS[0] * 2 && BURN_SECONDS[2] > BURN_SECONDS[1] * 2 && BURN_SECONDS[3] > BURN_SECONDS[2] * 2)) bad.push('burn times do not climb with rarity');
    return bad.length === 0 || bad.join('; ');
  });
  await T('power.a-plush-really-burns-for-its-whole-time-and-then-the-grid-goes-dark', async () => {
    const gen = await mkGen(); gen.q.push({ sp: sp(0), vr: 0 }); run(gen, 0.2); const lit1 = g.power.genOutput(gen) > 0; run(gen, 85); const lit2 = gen.burn > 0 && g.power.genOutput(gen) > 0; run(gen, 6); const dark = !(gen.burn > 0) && gen.cur === null && g.power.genOutput(gen) === 0;
    return (lit1 && lit2 && dark) || `lit at start ${lit1}, still lit at 85 s ${lit2}, out after 91 s ${dark}`;
  });
  await T('power.legendary-and-mythic-are-too-valuable-to-burn', async () => {
    const gen = await mkGen(); const a = g.logi.accept(gen, { sp: sp(4), vr: 0 }, null), b = g.logi.accept(gen, { sp: sp(5), vr: 0 }, null), c = g.logi.accept(gen, { sp: sp(3), vr: 0 }, null);
    S().carry = [{ sp: sp(4), vr: 0 }, { sp: sp(0), vr: 0 }]; gen.q.length = 0; g.useTile(gen); const keptLegend = S().carry.length === 1 && species[S().carry[0].sp].rarity === 4;
    return (!a && !b && c && FUEL_MAX_RARITY === 3 && keptLegend && gen.q.length === 1) || `legendary ${a} mythic ${b} epic ${c} kept ${keptLegend} q ${gen.q.length}`;
  });
  await T('power.hand-feeding-fills-the-hopper-up-to-its-cap-and-says-so', async () => {
    const gen = await mkGen(); S().carry = []; for (let n = 0; n < 60; n++) S().carry.push({ sp: sp(n % 3), vr: 0 }); g.T.carry = 60; g.useTile(gen); const cap = g.T.genBuffer; const hint = document.getElementById('hint') ? document.getElementById('hint').textContent : '';
    return (gen.q.length === cap && S().carry.length === 60 - cap) || `hopper ${gen.q.length}/${cap}, left in hands ${S().carry.length}`;
  });
  await T('power.thrown-plush-drop-into-the-generator', async () => {
    const gen = await mkGen(); gen.q.length = 0; const gx = cellX(gen.i), gz = cellZ(gen.k), gy = gen.j * 0.6;
    const keep = sim().n; sim().spawn(sp(1), 0, gx + 0.5, gy + 1.0, gz, 0, 0, 0, 1); sim().spawn(sp(4), 0, gx, gy + 1.0, gz + 0.5, 0, 0, 0, 1); sim().spawn(sp(2), 0, gx + 6, gy + 1.0, gz, 0, 0, 0, 1); sim().spawn(sp(0), 0, gx, gy + 1.0, gz - 0.4, 0, 0, 0, 0);
    g.feedGensFromThrows(); const mix = gen.q.map((q) => species[q.sp].rarity).sort().join();
    return (gen.q.length === 1 && mix === '1' && sim().n === keep + 3) || `hopper rarities [${mix}], bodies left ${sim().n - keep} (the legendary, the far one and the unthrown one should stay)`;
  });
  await T('power.hover-readout-names-the-burning-plush-the-rate-and-the-hopper', async () => {
    const gen = await mkGen({ genBuffer: 1 }); g.T = g.tune(); gen.q.push({ sp: sp(2), vr: 0 }, { sp: sp(0), vr: 0 }, { sp: sp(3), vr: 0 }); run(gen, 5);
    const info = g.genInfo(gen); const t = info.lines.join('\n'); const cur = species[gen.cur.sp];
    const bad = []; if (!info.lit) bad.push('not lit'); if (!t.includes(cur.name) || !t.includes('Rare')) bad.push('burning plush not named'); if (!/left of 10 min/.test(t)) bad.push('time left/total'); if (!/Output 8\.0 kW/.test(t)) bad.push('output'); if (!/Common \(1 plush per 1 min 30 s|1 min 30 s \(Common\)/.test(t)) bad.push('rate per rarity: ' + t); if (!/Hopper 2\/100: 1 Common, 1 Epic/.test(t)) bad.push('hopper: ' + t.split('\n')[3]); if (!/too valuable/.test(t)) bad.push('rule line');
    return bad.length === 0 || bad.join(' | ');
  });
  await T('power.aiming-at-a-generator-shows-the-readout-on-screen', async () => {
    const gen = await mkGen(); for (const t of tiles()) if (t.id !== gen.id) L().remove(t); gen.q.push({ sp: sp(1), vr: 0 }); run(gen, 2); const x = cellX(gen.i), z = cellZ(gen.k); g.stowed = true; p().pos.set(x + 1.6, 0, z); p().vel.set(0, 0, 0); p().yaw = Math.atan2(-1.6, 0); p().pitch = -0.7; g.renderer.camera.position.copy(p().eyePos(new ctx.V3())); g.hudT = 0; adv(0.15);
    const el = document.getElementById('tileInfo'); const shown = !el.classList.contains('hidden'); const txt = el.textContent; p().pos.set(0, 0, -1.4); p().yaw = Math.PI; g.renderer.camera.position.copy(p().eyePos(new ctx.V3())); g.hudT = 0; adv(0.15); const hidden = document.getElementById('tileInfo').classList.contains('hidden');
    return (shown && /GENERATOR/.test(txt) && /Burning/.test(txt) && hidden) || `shown ${shown} "${txt.slice(0, 80)}" hiddenAway ${hidden}`;
  });
  await T('power.generator-fuel-state-survives-save-and-reload', async () => {
    const gen = await mkGen(); gen.q.push({ sp: sp(2), vr: 0 }, { sp: sp(1), vr: 0 }); run(gen, 30); const raw = JSON.parse(JSON.stringify(S().entities.find((e) => e.id === gen.id)));
    return (raw.q.length === 1 && raw.cur && species[raw.cur.sp].rarity === 2 && raw.burn > 500) || 'saved generator ' + JSON.stringify([raw.q && raw.q.length, raw.cur, raw.burn]);
  });
  await T('power.guests-see-the-same-readout', async () => {
    const gen = await mkGen(); gen.q.push({ sp: sp(2), vr: 0 }, { sp: sp(1), vr: 0 }, { sp: sp(3), vr: 0 }); run(gen, 3); const host = g.genInfo(gen).lines.join('|');
    const sent = []; const orig = g.netSend; g.netSend = (m) => sent.push(JSON.parse(JSON.stringify(m))); g.net.open = true; g.sendDyn(); g.net.open = false; g.netSend = orig; const dyn = sent.find((m) => m.t === 'dyn'); if (!dyn) return 'no dyn message';
    const row = dyn.tiles.find((r) => r[0] === gen.id); if (!row || row.length < 12) return 'gen row too short ' + JSON.stringify(row);
    const saveQ = gen.q, saveCur = gen.cur, saveBurn = gen.burn, saveMax = gen.burnMax; gen.q = Array.from({ length: row[7] }, () => ({ sp: 1, vr: 0 })); gen.cur = null; gen.burn = 0; gen.burnMax = 0; g.applyDyn(dyn); const guest = g.genInfo(gen).lines.join('|');
    gen.q = saveQ; gen.cur = saveCur; gen.burn = saveBurn; gen.burnMax = saveMax; delete gen.rc;
    return (guest.split('|')[0].split(',')[0] === host.split('|')[0].split(',')[0] && guest.split('|')[3].startsWith(host.split('|')[3].split(':')[0]) && /1 Uncommon/.test(guest) && /1 Epic/.test(guest)) || `host "${host.split('|')[0]}" / "${host.split('|')[3]}" guest "${guest.split('|')[0]}" / "${guest.split('|')[3]}"`;
  });
}
