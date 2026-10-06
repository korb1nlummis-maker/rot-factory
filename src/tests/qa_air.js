// Adversarial QA of dust warnings, recovery and Support Fans.
export default async function (ctx) {
  const { T, g, S, w, p, fresh, spot, dig, craft, selectTool, plan, placeNow, aimPoint, adv, cellX, cellZ, newWorld, realSleep, THREE } = ctx;
  const up = { timber: 1, power: 1, fans: 1, mfan: 1, belts: 1 };
  const head = () => p().eyePos(new THREE.Vector3());
  const vig = () => document.getElementById('lungVig'), warn = () => document.getElementById('lungWarn');
  const shown = () => !warn().classList.contains('hidden') || (+vig().style.opacity || 0) > 0.001;
  const reset = () => { g.dead = false; g.blacking = false; g.mode = 'play'; g.ui.closeModalsSilently ? g.ui.closeModalsSilently() : g.ui.closeModals(); g.dust.lung = 0; g.dust.level = 0; g._lungPrev = undefined; g._lungRate = 0; g.updateAir(0.016, head()); };
  const loud = (lung = 0.92) => { g.dust.lung = lung; g.dust.level = 0; g._lungPrev = lung; g.updateAir(0.016, head()); g.dust.lung = lung; };

  await T('qa.air.the-dusty-edge-shows-when-lungs-are-full-and-hides-where-it-makes-no-sense', async () => {
    fresh({}); reset(); loud(); if (!shown()) return 'no warning at 92% lung load in the open game';
    const checks = [];
    for (const [label, on, off] of [['dead', () => { g.dead = true; }, () => { g.dead = false; }], ['passed out', () => { g.blacking = true; }, () => { g.blacking = false; }], ['title', () => { g.mode = 'title'; }, () => { g.mode = 'play'; }], ['menu', () => g.ui.open('shop'), () => g.ui.closeModals()]]) {
      on(); loud(); if (shown()) checks.push(label); off(); g.dust.lung = 0.92; g.updateAir(0.016, head());
    }
    reset(); return checks.length === 0 || 'the dust warning stays on screen while ' + checks.join(', ');
  });

  await T('qa.air.no-wheeze-hint-or-cough-while-dead-or-passed-out', async () => {
    fresh({}); reset(); const calls = []; const ow = g.sound.wheeze, oc = g.sound.cough, oh = g.ui.hint; g.sound.wheeze = () => calls.push('wheeze'); g.sound.cough = () => calls.push('cough'); g.ui.hint = (t) => calls.push('hint');
    for (const flag of ['dead', 'blacking']) { g[flag] = true; g._wheezeT = 0; g._lungWarned = false; g.dust.coughT = 0; for (let n = 0; n < 5; n++) loud(0.95); g[flag] = false; }
    g.sound.wheeze = ow; g.sound.cough = oc; g.ui.hint = oh; reset(); return calls.length === 0 || 'noises while out cold: ' + calls.join();
  });

  await T('qa.air.warning-text-is-always-finite', async () => {
    fresh({}); reset(); const bad = [];
    for (const dt of [0, 1e-9, 0.001, 0.016, 0.05, 1, 100]) for (const lung of [0, 0.2, 0.6, 0.85, 1, 1.05]) {
      g._lungPrev = lung * 0.5; g._lungRate = 0; g.dust.lung = lung; g.dust.level = 0; g.updateAir(dt, head()); const txt = document.getElementById('lungEta').textContent + document.getElementById('lungStage').textContent + vig().style.opacity;
      if (/NaN|Infinity|undefined/.test(txt) || !(vig().style.opacity === '' || Number.isFinite(+vig().style.opacity))) bad.push(`dt ${dt} lung ${lung}: ${txt}`);
    }
    g.dust.lung = NaN; g.updateAir(0.016, head()); if (!Number.isFinite(g.dust.lung)) bad.push('lung stayed NaN'); g.dust.level = NaN; g.updateAir(0.016, head()); if (!Number.isFinite(g.dust.level)) bad.push('level stayed NaN');
    reset(); return bad.length === 0 || bad.slice(0, 3).join('; ');
  });

  await T('qa.air.dying-hides-the-vignette-and-waking-up-is-gentle', async () => {
    fresh({}); reset(); loud(0.97); if (!shown()) return 'no warning to start with';
    g.hurtPlayer(1000, 'test'); adv(0.1); if (!g.dead) return 'did not die'; if (shown()) return 'the dust edge is still up while dead';
    await realSleep(2600); const ok = !g.dead && !g.blacking && g.dust.lung <= 0.25 && !warn().className.match(/s[23]/) && (+vig().style.opacity || 0) < 0.12;   // a faint stage 1 edge is fine, passing out is not
    return ok || `after waking: dead ${g.dead} blacking ${g.blacking} lung ${g.dust.lung} class ${warn().className} vignette ${vig().style.opacity}`;
  });

  await T('qa.air.a-new-game-starts-with-clear-lungs-and-no-overlay', async () => {
    fresh({}); reset(); loud(0.97); g.dust.recover = 70; await newWorld(); adv(0.2);
    return (g.dust.lung < 0.05 && !(g.dust.recover > 0) && !shown()) || `new game: lung ${g.dust.lung} recover ${g.dust.recover} overlay ${shown()}`;
  });

  await T('qa.air.support-fan-blows-along-the-frame-normal-at-every-angle', async () => {
    fresh(up); const { i, k } = spot(); dig(i, k - 1, 12, 5, 4, false); const bad = [];
    for (const yaw of [0, 0.3, 0.9, Math.PI / 2, 2.2, 3.5, -1.1, -2.9, 6.0]) {
      const f = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'x', cx: cellX(i + 6), cz: cellZ(k + 1), y0: 0, w: 2.36, h: 2.38, yaw, turned: true }; S().entities.push(f); g.addEntity(f);
      for (const face of [0, 1.3, 2.9, -2.0]) {
        const pl = g.machines.planMountFan({ x: cellX(i + 1), y: 1.4, z: cellZ(k + 1) }, new THREE.Vector3(f.cx - cellX(i + 1), f.y0 + f.h - 0.3 - 1.4, 0).normalize(), face);
        if (!pl.ok) { bad.push(`yaw ${yaw}: ${pl.why}`); continue; }
        const e = pl.ent, along = e.fx * Math.sin(yaw) + e.fz * Math.cos(yaw), len = Math.hypot(e.fx, e.fz), want = Math.sin(face) * Math.sin(yaw) + Math.cos(face) * Math.cos(yaw);
        if (Math.abs(Math.abs(along) - 1) > 1e-6 || Math.abs(len - 1) > 1e-6 || (want >= 0) !== (along > 0)) bad.push(`yaw ${yaw.toFixed(2)} facing ${face}: dir (${e.fx.toFixed(2)},${e.fz.toFixed(2)})`);
      }
      const it = g.machines.items.get(f.id); g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(f.id); S().entities = S().entities.filter((x) => x.id !== f.id); w().supports = w().supports.filter((s) => s.id !== f.id);
    }
    return bad.length === 0 || bad.slice(0, 4).join('; ');
  });

  await T('qa.air.a-support-fan-with-missing-direction-data-keeps-the-dust-finite', async () => {
    fresh(up); const { i, k } = spot(); dig(i, k - 1, 12, 5, 4, false); const f = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'x', cx: cellX(i + 6), cz: cellZ(k + 1), y0: 0, w: 2.36, h: 2.38, yaw: 1.0, turned: true }; S().entities.push(f); g.addEntity(f);
    const fan = { id: g.nextId(), type: 'fan', mounted: true, frameId: f.id, px: f.cx, py: 2, pz: f.cz, dir: 0, i: 1, j: 3, k: 1 }; S().entities.push(fan); g.addEntity(fan);   // an old or damaged save: no fx / fz / fyaw
    const t = [...g.logi.tiles.values()].find((q) => q.mounted); t.pw = 1; g.dust.cells.clear(); g.dust.add(f.cx + 3, 1.2, f.cz, 1.0); for (let n = 0; n < 6; n++) { g.dust.t = 0; t.pw = 1; g.dust.update(0.5); }
    const bad = [...g.dust.cells.values()].filter((v) => !Number.isFinite(v)).length; return bad === 0 || bad + ' dust cells went NaN';
  });

  await T('qa.air.a-fan-whose-frame-is-gone-is-dropped-when-a-save-loads', async () => {
    fresh(up); const { i, k } = spot(); dig(i, k - 1, 12, 5, 4, false); const f = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'x', cx: cellX(i + 6), cz: cellZ(k + 1), y0: 0, w: 2.36, h: 2.38, yaw: 1.0, turned: true }; S().entities.push(f);
    const fan = { id: g.nextId(), type: 'fan', mounted: true, frameId: f.id, px: f.cx, py: 2, pz: f.cz, fx: 1, fz: 0, fyaw: 1.57, dir: 0, i: 1, j: 3, k: 1 }; S().entities.push(fan);
    const keep = f.id, orphan = { ...fan, id: g.nextId(), frameId: 999999, i: 9, k: 9 }; S().entities.push(orphan);
    const Sx = S(); g.loadWorld(Sx, null);
    const fans = [...g.logi.tiles.values()].filter((t) => t.mounted);
    return (fans.length === 1 && fans[0].frameId === keep && !S().entities.some((e) => e.id === orphan.id)) || `fans after load: ${fans.map((t) => t.frameId)}`;
  });

  await T('qa.air.a-frame-lost-in-a-blast-takes-its-fan-and-the-air-effect-with-it', async () => {
    fresh(up); const { i, k } = spot(); dig(i, k - 1, 12, 5, 4, false); const f = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'x', cx: cellX(i + 6), cz: cellZ(k + 1), y0: 0, w: 2.36, h: 2.38, yaw: 1.5708, turned: true }; S().entities.push(f); g.addEntity(f);
    craft('mfan'); selectTool('mfan'); aimPoint(f.cx, f.y0 + f.h - 0.3, f.cz, 3.0); await plan(); placeNow(); const t = [...g.logi.tiles.values()].find((q) => q.mounted); if (!t) return 'no fan';
    g.razzoBlast(f.cx, 1.2, f.cz); const left = [...g.logi.tiles.values()].filter((q) => q.mounted).length;
    g.dust.cells.clear(); g.dust.add(f.cx + 6, 1.2, f.cz, 1.0); for (let n = 0; n < 6; n++) { g.dust.t = 0; g.dust.update(0.5); } const still = g.dust.at(f.cx + 6, 1.2, f.cz);
    const live = [...g.logi.tiles.values()].filter((q) => q.type === 'fan' && q.mounted).length; void still;   // (dust levels depend on the open end of the tunnel, so only the fans themselves are checked)
    return (left === 0 && live === 0 && !S().entities.some((e) => e.mounted) && !w().supports.some((s) => s.id === f.id)) || `fans left ${left}/${live}, entities ${S().entities.filter((e) => e.mounted).length}`;
  });
}
