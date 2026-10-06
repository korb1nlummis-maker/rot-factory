export default async function (ctx) {
  const { T, g, S, w, p, fresh, craft, selectTool, plan, placeNow, aimPoint, adv, stepSim, spot, dig, recipes, UPGRADES, cellX, cellZ, newWorld, realSleep } = ctx;
  const up = { timber: 1, power: 1, fans: 1, mfan: 1, belts: 1 };
  const frameAt = (i, k, yaw) => { const e = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'z', cx: cellX(i), cz: cellZ(k), y0: 0, w: 2.36, h: 2.38, yaw, turned: true }; S().entities.push(e); g.addEntity(e); return e; };
  await T('dust.support-fan-recipe-needs-the-upgrade-and-power-upgrade', async () => {
    fresh({ timber: 1, power: 1, fans: 1 }); if (recipes(g).some((r) => r.id === 'mfan')) return 'craftable without Support Fans';
    const u = UPGRADES.find((x) => x.id === 'mfan'); if (!u || u.req.id !== 'fans') return 'upgrade missing or wrong requirement';
    fresh(up); const r = recipes(g).find((x) => x.id === 'mfan'); return (r && r.kind === 'mfan' && r.price > 0 && /power/i.test(r.use)) || 'recipe ' + JSON.stringify(r && [r.kind, r.price]);
  });
  await T('dust.support-fan-clamps-to-the-frame-you-aim-at-and-blows-the-way-you-face', async () => {
    fresh(up); const { i, k } = spot(); dig(i, k - 1, 12, 5, 4, false); const f = frameAt(i + 6, k + 1, Math.PI / 2); craft('mfan', 2); selectTool('mfan');
    p().pos.set(cellX(i + 1), 0, cellZ(k + 1)); p().vel.set(0, 0, 0); p().yaw = Math.PI / 2; p().pitch = 0.1; aimPoint(f.cx, f.y0 + f.h - 0.42, f.cz, 4.0); let pl = await plan(); if (!pl.ok) return pl.why;
    if (!(pl.ent.fx > 0.9 && Math.abs(pl.ent.fz) < 0.1)) return `facing +x should blow +x: ${pl.ent.fx.toFixed(2)},${pl.ent.fz.toFixed(2)}`;
    if (Math.abs(pl.ent.py - (f.y0 + f.h - 0.42)) > 1e-6 || Math.abs(pl.ent.px - f.cx) > 1e-6) return 'fan not under the top beam';
    const n = placeNow(); if (n !== 1) return 'not placed'; const tile = [...g.logi.tiles.values()].find((t) => t.mounted); if (!tile || tile.frameId !== f.id) return 'tile missing or not tied to the frame';
    const second = await plan(); if (second.ok) return 'a second fan on the same frame was allowed';
    // the other way: stand on the far side, face back along the tunnel, and a new frame's fan blows -x
    const f2 = frameAt(i + 9, k + 1, Math.PI / 2); aimPoint(f2.cx, f2.y0 + f2.h - 0.42, f2.cz, -4.0); p().yaw = -Math.PI / 2; const back = await plan();
    return (back.ok && back.ent.fx < -0.9) || 'blowing back: ' + JSON.stringify(back.ok ? back.ent.fx : back.why);
  });
  await T('dust.support-fan-clears-dust-in-front-of-it-faster-than-behind', async () => {
    fresh(up); const { i, k } = spot(); dig(i, k - 1, 40, 5, 4, false); const f = frameAt(i + 20, k + 1, Math.PI / 2); craft('mfan'); selectTool('mfan'); p().pos.set(cellX(i + 15), 0, cellZ(k + 1)); p().yaw = Math.PI / 2; aimPoint(f.cx, f.y0 + f.h - 0.42, f.cz, 3.0); const pl = await plan(); if (!pl.ok) return pl.why; placeNow();
    const t = [...g.logi.tiles.values()].find((q) => q.mounted); t.pw = 1; g.dust.cells.clear(); const y = 1.2;
    g.dust.add(f.cx + 9, y, f.cz, 1.0); g.dust.add(f.cx - 9, y, f.cz, 1.0); const a0 = g.dust.at(f.cx + 9, y, f.cz);
    for (let n = 0; n < 12; n++) { g.dust.t = 0; g.dust.update(0.5); for (const q of g.logi.tiles.values()) if (q.mounted) q.pw = 1; }
    const front = g.dust.at(f.cx + 9, y, f.cz), behind = g.dust.at(f.cx - 9, y, f.cz);
    return (front < behind * 0.5 && front < a0 * 0.2) || `dust after 6 s: in front ${front.toFixed(3)}, behind ${behind.toFixed(3)} (from ${a0})`;
  });
  await T('dust.unpowered-support-fan-does-nothing', async () => {
    fresh(up); const { i, k } = spot(); dig(i, k - 1, 40, 5, 4, false); const f = frameAt(i + 20, k + 1, Math.PI / 2); craft('mfan'); selectTool('mfan'); p().pos.set(cellX(i + 15), 0, cellZ(k + 1)); p().yaw = Math.PI / 2; aimPoint(f.cx, f.y0 + f.h - 0.42, f.cz, 3.0); await plan(); placeNow();
    const run = (pw) => { g.dust.cells.clear(); g.dust.add(f.cx + 9, 1.2, f.cz, 1.0); for (let n = 0; n < 12; n++) { g.dust.t = 0; for (const q of g.logi.tiles.values()) if (q.mounted) q.pw = pw; g.dust.update(0.5); } return g.dust.at(f.cx + 9, 1.2, f.cz); };
    const off = run(0), on = run(1); return (off > on * 3 && off > 0.25) || `dust 9 m ahead after 6 s: unpowered ${off.toFixed(3)}, powered ${on.toFixed(3)}`;
  });
  await T('dust.support-fan-goes-with-its-frame-and-comes-back-to-your-pack', async () => {
    fresh(up); const { i, k } = spot(); dig(i, k - 1, 12, 5, 4, false); const f = frameAt(i + 6, k + 1, 0); craft('mfan'); selectTool('mfan'); p().pos.set(cellX(i + 1), 0, cellZ(k + 1)); p().yaw = Math.PI / 2; aimPoint(f.cx, f.y0 + f.h - 0.42, f.cz, 3.0); await plan(); placeNow();
    if (![...g.logi.tiles.values()].some((t) => t.mounted)) return 'not placed'; S().items = {}; g.doDecon({ kind: 'mach', id: f.id });
    return (![...g.logi.tiles.values()].some((t) => t.mounted) && S().items.mfan === 1) || 'fan left behind or item lost: ' + JSON.stringify(S().items);
  });
  await T('dust.support-fan-survives-save-and-load-data', async () => {
    fresh(up); const { i, k } = spot(); dig(i, k - 1, 12, 5, 4, false); const f = frameAt(i + 6, k + 1, 0.4); craft('mfan'); selectTool('mfan'); p().pos.set(cellX(i + 1), 0, cellZ(k + 1)); p().yaw = Math.PI / 2; aimPoint(f.cx, f.y0 + f.h - 0.42, f.cz, 3.0); await plan(); placeNow();
    const raw = JSON.parse(JSON.stringify(S().entities)).find((e) => e.mounted); return (raw && raw.frameId === f.id && Math.abs(raw.fyaw) <= Math.PI && raw.px !== undefined) || 'saved data ' + JSON.stringify(raw);
  });

  // ---------------------------------------------------------------- dust warnings and recovery
  const head = () => p().eyePos(new ctx.V3());
  await T('dust.warnings-grow-through-stages-before-you-pass-out', async () => {
    fresh({}); const seen = []; for (const lung of [0.05, 0.2, 0.4, 0.6, 0.9]) { g.dust.lung = lung; g.dust.level = 0; g._lungPrev = lung; g.updateAir(0.016, head()); seen.push([document.getElementById('lungWarn').className.match(/s(\d)/)?.[1] || '0', +document.getElementById('lungVig').style.opacity, document.getElementById('lungStage').textContent]); g.dust.lung = lung; }
    const st = seen.map((s) => s[0]).join(''), vigs = seen.map((s) => s[1]); const rising = vigs.every((v, n) => n === 0 || v >= vigs[n - 1]);
    return (st === '01223' || st === '01123' || st === '01233') && rising && vigs[0] === 0 && vigs[4] > 0.4 || `stages ${st} vignette ${vigs.map((v) => v.toFixed(2))}`;
  });
  await T('dust.passing-out-countdown-appears-and-wheeze-plays', async () => {
    fresh({}); let wheezes = 0; const o = g.sound.wheeze; g.sound.wheeze = () => { wheezes++; }; g.dust.lung = 0.75; g._lungPrev = 0.7; g._lungRate = 0.05; g._wheezeT = 0; g.updateAir(0.1, head()); g.sound.wheeze = o;
    return (wheezes === 1 && /passing out in about \d+ s/.test(document.getElementById('lungEta').textContent)) || `wheezes ${wheezes} eta "${document.getElementById('lungEta').textContent}"`;
  });
  await T('dust.waking-up-after-passing-out-is-gentle', async () => {
    fresh({}); g.dust.lung = 1; g.dust.add(p().pos.x, p().pos.y + 1.4, p().pos.z, 1.5); g.blackout(); await realSleep(1500);
    const lungOk = g.dust.lung <= 0.1, rec = g.dust.recover > 60; await realSleep(900);
    return (lungOk && rec && !g.blacking) || `lung ${g.dust.lung} recover ${g.dust.recover} blacking ${g.blacking}`;
  });
}
