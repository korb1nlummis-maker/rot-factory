import { sp, kit } from './charger_lib.js';
// Charging Station: recipe, placement, removal, and every way plush gets in. Reserve units: 1.0 is one full bot battery.
export default async function (ctx) {
  const { T, g, S, p, L, fresh, craft, selectTool, placeAtFloor, tiles, sim, recipes, UPGRADES, tune, species, cellX, cellZ, THREE, clearBodies } = ctx;
  const { look, run, feed: feedAll } = kit(ctx);
  const up = { crew: 1 };
  const PER = [0.34, 0.7, 1.5, 4.0];
  const mk = async (extra = {}, x = -3.4, z = 3.0) => { fresh({ ...up, ...extra }); const r = await placeAtFloor('charger', x, z, 2.0); if (!r.ok) throw new Error('charger: ' + r.why); return tiles().find((t) => t.type === 'charger'); };

  await T('crew.charger-recipe-is-gated-by-the-crew-upgrade-and-priced', async () => {
    fresh({}); if (recipes(g).some((r) => r.id === 'charger')) return 'craftable with no crew upgrade';
    fresh({ crewSlots: 3 }); if (recipes(g).some((r) => r.id === 'charger')) return 'craftable with More Scrappers alone';
    if (!UPGRADES.find((u) => u.id === 'crew').effect.toString().includes('charger')) return 'crew upgrade does not unlock it';
    if (!tune(up).machines.includes('charger')) return 'tuning lacks charger';
    fresh(up); const r = recipes(g).find((x) => x.id === 'charger'); if (!r) return 'no recipe with the crew upgrade';
    if (r.kind !== 'charger' || r.price !== Math.round(g.chargerCost() * 3) || r.price < 300 || r.price > 3000) return `recipe ${JSON.stringify([r.kind, r.price, g.chargerCost()])}`;
    if (!/0\.34/.test(r.desc) || !/needs no power/i.test(r.desc) || /—/.test(r.desc + r.use)) return 'description missing the numbers or has a dash: ' + r.desc;
    S().money = 5000; craft('charger'); if (Math.round(5000 - S().money) !== r.price) return `charged ${5000 - S().money}, price ${r.price}`;
    if (S().items.charger !== 1 || !S().hotbar.includes('charger')) return 'not in the pack and on the hotbar';
    g.refreshTuning(); return true;
  });
  await T('crew.charger-price-rises-with-each-one-placed', async () => {
    const t0 = await mk(); const r0 = recipes(g).find((x) => x.id === 'charger').price; await placeAtFloor('charger', -3.4, 4.2, 2.0);
    const r1 = recipes(g).find((x) => x.id === 'charger').price; return (tiles().filter((t) => t.type === 'charger').length === 2 && r1 > r0 && t0) || `price ${r0} then ${r1}`;
  });
  await T('crew.charger-places-on-the-floor-with-a-pad-coil-and-hopper', async () => {
    const t = await mk(); const o = L().objs.get(t.id); if (!o) return 'no mesh';
    if (!o.getObjectByName('coil') || !o.getObjectByName('bolt') || o.children.length < 5) return 'mesh parts missing: ' + o.children.length;
    if (!(t.q.length === 0 && t.reserve === 0)) return 'not empty at start';
    if (!S().entities.some((e) => e.id === t.id && e.type === 'charger')) return 'not saved as an entity';
    if (!g.world.reserved.has((t.j * ctx.cfg.NZ + t.k) * ctx.cfg.NX + t.i)) return 'cell not reserved';
    const second = await placeAtFloor('charger', -3.4, 3.0, 2.0); if (second.ok) return 'placed twice in one cell';
    return true;
  });
  await T('crew.charger-needs-no-power-and-is-not-a-power-consumer', async () => {
    const t = await mk(); g.power.update(0.5); for (const n of g.power.nets) if (n.nodes.includes(t)) return 'joined a power net';
    feedAll(t, [0, 1]); run(1.5); return (Math.abs(t.reserve - 1.04) < 0.01 && !(t.pw > 0)) || `reserve ${t.reserve} pw ${t.pw}`;
  });
  await T('crew.charger-hammer-takes-it-back-with-its-plush', async () => {
    const t = await mk(); feedAll(t, [0, 0, 2]); S().items = {}; S().carry = []; g.T.carry = 20;
    selectTool('hammer'); g.stowed = false; look(cellX(t.i), t.j * 0.6 + 0.15, cellZ(t.k), 1.6); const ref = g.hammerTarget(); if (!ref || ref.id !== t.id) return 'hammer target ' + JSON.stringify(ref);
    g.hammerHit(); if (tiles().some((x) => x.type === 'charger') || S().entities.some((e) => e.id === t.id) || L().objs.has(t.id)) return 'still there';
    if (S().items.charger !== 1) return 'item not returned: ' + JSON.stringify(S().items); return S().carry.length === 3 || `plush returned ${S().carry.length}`;
  });
  await T('crew.charger-hand-feeding-gives-the-right-reserve-per-rarity-and-refuses-legendary', async () => {
    const bad = [];
    for (let r = 0; r <= 3; r++) { const t = await mk(); S().carry = [{ sp: sp(r), vr: 0 }]; g.useTile(t); run(1); if (t.q.length || Math.abs(t.reserve - PER[r]) > 1e-6 || S().carry.length) bad.push(`rarity ${r}: reserve ${t.reserve} want ${PER[r]}`); }
    const t = await mk(); S().carry = [{ sp: sp(4), vr: 0 }, { sp: sp(5), vr: 0 }, { sp: sp(1), vr: 0 }]; g.useTile(t); run(1);
    if (S().carry.length !== 2 || S().carry.some((c) => species[c.sp].rarity < 4)) bad.push('legendary or mythic taken'); if (Math.abs(t.reserve - 0.7) > 1e-6) bad.push('uncommon not counted ' + t.reserve);
    S().carry = [{ sp: sp(5), vr: 0 }]; const hint0 = document.getElementById('hint') ? document.getElementById('hint').textContent : ''; g.useTile(t); void hint0; if (S().carry.length !== 1) bad.push('mythic taken alone');
    return bad.length === 0 || bad.join('; ');
  });
  await T('crew.charger-hopper-holds-twelve-and-reserve-caps-at-eight', async () => {
    const t = await mk(); g.T.carry = 30; S().carry = []; for (let n = 0; n < 15; n++) S().carry.push({ sp: sp(0), vr: 0 }); g.useTile(t);
    if (t.q.length !== 12 || S().carry.length !== 3) return `hopper ${t.q.length}, hands ${S().carry.length}`;
    if (g.logi.accept(t, { sp: sp(0), vr: 0 }, null)) return 'a 13th plush was accepted';
    run(4); if (Math.abs(t.reserve - 12 * 0.34) > 1e-6) return 'reserve ' + t.reserve;
    const e = await mk(); for (let n = 0; n < 5; n++) g.logi.accept(e, { sp: sp(3), vr: 0 }, null); run(3);
    return (Math.abs(e.reserve - 8) < 1e-9 && e.q.length === 3) || `epics: reserve ${e.reserve} waiting ${e.q.length} (want 8 and 3)`;
  });
  await T('crew.charger-waiting-plush-top-it-up-as-bots-use-the-charge', async () => {
    const t = await mk(); for (let n = 0; n < 3; n++) g.logi.accept(t, { sp: sp(3), vr: 0 }, null); run(2); if (Math.abs(t.reserve - 8) > 1e-9 || t.q.length !== 1) return `reserve ${t.reserve} waiting ${t.q.length}`;
    t.reserve -= 4.0; run(2); return (Math.abs(t.reserve - 8) < 1e-9 && t.q.length === 0) || `after use: reserve ${t.reserve} waiting ${t.q.length}`;
  });
  await T('crew.charger-thrown-plush-drop-in-and-legendary-bounces-off', async () => {
    const t = await mk(); clearBodies(); const gx = cellX(t.i), gz = cellZ(t.k), gy = t.j * 0.6; const keep = sim().n;
    sim().spawn(sp(1), 0, gx + 0.5, gy + 1.0, gz, 0, 0, 0, 1); sim().spawn(sp(4), 0, gx, gy + 1.0, gz + 0.5, 0, 0, 0, 1); sim().spawn(sp(3), 0, gx + 7, gy + 1.0, gz, 0, 0, 0, 1); sim().spawn(sp(0), 0, gx, gy + 1.0, gz - 0.4, 0, 0, 0, 0); sim().spawn(sp(2), 0, gx - 0.3, gy + 1.0, gz, 0, 0, 0, 1);
    g.feedChargersFromThrows(); run(1.5); const left = sim().n - keep; clearBodies();
    return (Math.abs(t.reserve - 2.2) < 1e-6 && left === 3) || `reserve ${t.reserve} (want 0.7 + 1.5), bodies left ${left} (legendary, far one, unthrown one stay)`;
  });
  await T('crew.charger-full-hopper-stops-catching-throws', async () => {
    const t = await mk(); clearBodies(); for (let n = 0; n < 12; n++) t.q.push({ sp: sp(0), vr: 0 }); t.dig = 99; const gx = cellX(t.i), gz = cellZ(t.k), keep = sim().n;
    sim().spawn(sp(0), 0, gx + 0.3, t.j * 0.6 + 1.0, gz, 0, 0, 0, 1); g.feedChargersFromThrows(); const stayed = sim().n === keep + 1; clearBodies(); return stayed || 'caught with a full hopper';
  });
  await T('crew.charger-belt-line-ending-in-it-feeds-it-by-rarity-and-legendary-is-refused', async () => {
    fresh({ crew: 1, belts: 1, power: 1 }); const belts = [];
    for (let n = 0; n < 6; n++) { const r = await placeAtFloor('belt', -5.4 + n * 0.6, 2.4, 2.0); if (!r.ok) return 'belt ' + n + ': ' + r.why; }
    const c = await placeAtFloor('charger', -1.8, 2.4, 2.0); if (!c.ok) return 'charger: ' + c.why;
    for (const t of tiles()) if (t.type === 'belt' && !t.free) belts.push(t); belts.sort((a, b) => a.i - b.i); const ch = tiles().find((t) => t.type === 'charger');
    if (L().nextOf(belts[belts.length - 1]) !== ch) return 'the line does not end in the charger';
    const order = [0, 1, 2, 3, 4]; let sent = 0;
    for (let n = 0; n < 500; n++) { for (const b of belts) b.pw = 1; if (sent < order.length && g.logi.accept(belts[0], { sp: sp(order[sent]), vr: 0 }, null)) sent++; g.time += 0.05; g.logi.update(0.05); }
    const last = belts[belts.length - 1];
    if (Math.abs(ch.reserve - (0.34 + 0.7 + 1.5 + 4.0)) > 1e-6) return `reserve ${ch.reserve}, want 6.54`;
    return (last.items.length === 1 && species[last.items[0].sp].rarity === 4 && ch.q.length === 0) || `legendary should sit at the end of the belt: ${last.items.length} items`;
  });
  await T('crew.charger-hover-readout-shows-charge-hopper-and-rates', async () => {
    const t = await mk(); feedAll(t, [2, 0]); run(1); const info = g.chargerInfo(t); const txt = info.lines.join('|');
    if (!/1\.84 of 8/.test(txt) || !/hopper 0\/12/.test(txt) || !/0\.34 \(Common\)/.test(txt) || !/4 \(Epic\)/.test(txt) || !/0\.5 battery per second/.test(txt)) return txt;
    const { infoFor, findInfoRef } = await import('../info.js'); selectTool('hammer'); g.stowed = false; look(cellX(t.i), t.j * 0.6 + 0.3, cellZ(t.k), 1.6); const ref = findInfoRef(g); const inf = infoFor(g, ref);
    return (inf && /CHARGING STATION/.test(inf.title) && inf.lit) || 'hover info ' + JSON.stringify(inf);
  });
  await T('crew.charger-charge-and-hopper-survive-save-and-reload', async () => {
    const t = await mk(); feedAll(t, [3, 2, 0]); run(0.3); t.q.push({ sp: sp(1), vr: 0 }); const had = t.reserve, qn = t.q.length;
    S().noSaveFlag = undefined; g.noSave = false; g.save(); g.noSave = true; const raw = JSON.parse(localStorage.getItem('rotfactory.save.v1')).S.entities.find((e) => e.id === t.id);
    if (!raw || Math.abs(raw.reserve - had) > 1e-9 || !raw.q || raw.q.length !== qn) return 'saved ' + JSON.stringify(raw && [raw.reserve, raw.q && raw.q.length]);
    g.logi.remove(t); S().entities = S().entities.filter((e) => e.id !== t.id); const copy = JSON.parse(JSON.stringify(raw)); S().entities.push(copy); g.addEntity(copy);
    const back = L().byId.get(t.id); if (!back || Math.abs(back.reserve - had) > 1e-9 || back.q.length !== qn || !L().objs.has(back.id)) return 'not restored';
    run(1); return back.q.length === 0 || 'the restored hopper did not work through its plush';
  });
}
