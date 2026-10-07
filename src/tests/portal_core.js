// portal.*: a giant arch at the mouth of the pile is a Portal, a powered auto-driver that bores the tunnel and lines it (src/portal.js, src/arches.js).
// Run: `await __selftest('portal.')`
import { makeKit, UP, ARCH, PORTAL } from './portal_lib.js';
import { FRAME_TYPES } from '../upgrades.js';
import { ARCH_SPANS } from '../loadtrace.js';
import { NEEDLE, BULK } from '../plushdata.js';
import * as VS from '../vehiclescan.js';

export default async function (ctx) {
  const { T, g, S, w, fresh, newWorld, toI, toK, cellX, cellZ } = ctx;
  const K = makeKit(ctx);
  const world = async (up = UP) => { await newWorld(); fresh(up); S().money = 1e12; g.surgeT = 1e9; K.fast(); };

  await T('portal.a-giant-arch-at-the-mouth-of-the-pile-is-a-portal-elsewhere-it-is-an-arch', async () => {
    await world(); const out = [];
    for (const span of [6, 8, 12]) {
      await world(); const st = K.site({ span }); const e = K.mouth(st, 'steel');
      if (e.pd !== 1) out.push(`span ${span}: pd ${e.pd} at the mouth`);
      // the same arch standing in the open (nothing behind it, nothing in front) is not a portal
      K.gone(e); K.clearBox(st.i0 + 4, st.lo - 1, 6, span + 2, st.h + 2); const open = ARCH.portalDir(g, ARCH.derive('x', st.i0, st.lo, 0, span, 'steel')); if (open !== 0) out.push(`span ${span}: free standing arch is a portal (${open})`);
    }
    return out.length === 0 || out.join('; ');
  });

  await T('portal.bores-a-slab-at-a-time-and-sells-what-it-cuts', async () => {
    await world(); const st = K.site({ span: 6 }), e = K.mouth(st, 'steel'); const money0 = S().money, plush0 = S().stats.plush;
    if (!K.until(() => e.adv >= 1, 20)) return `no slab after 20 s: ${e.ps} ${e.pwhy}`;
    const cells = 6 * 5; if (!K.emptySlab(e, 0)) return 'the first slab is not empty';
    const got = S().stats.plush - plush0; if (got !== cells) return `cut ${got} plush for a ${cells} cell slab`;
    if (!(S().money > money0)) return 'nothing was sold';
    // each slab is one cell deep and exactly span x h: the slab after it is still plush
    if (K.emptySlab(e, e.adv)) return 'it cut more than one slab';
    return true;
  });

  await T('portal.sets-an-arch-behind-it-every-4-slabs-and-pays-for-it', async () => {
    await world(); const st = K.site({ span: 6 }), e = K.mouth(st, 'steel'); const n0 = K.archs().length;
    if (!K.until(() => e.lined >= 2, 300)) return `lined ${e.lined} after 300 s, adv ${e.adv}, ${e.ps} ${e.pwhy}`;
    const list = K.archs().filter((a) => a.id !== e.id).sort((a, b) => a.gm - b.gm); if (list.length < 2) return 'only ' + list.length + ' arches set';
    const want = [e.gm + 4, e.gm + 8]; if (list[0].gm !== want[0] || list[1].gm !== want[1]) return `arches at ${list.map((a) => a.gm)} not flush at ${want}`;
    if (!(e.spent > 0)) return 'no Fluff spent on the arches';
    if (e.adv < 8) return 'adv ' + e.adv;
    // the tunnel is empty all the way along the arches and the arches are real supports
    for (const a of list) { if (!w().supports.some((s) => s.id === a.id && s.kind.startsWith('arch6:'))) return 'an arch is not registered as a support'; }
    for (let n = 0; n < 8; n++) if (!K.emptySlab(e, n)) return 'slab ' + n + ' is not empty';
    return K.archs().length === n0 + e.lined || `arches ${K.archs().length}, lined ${e.lined}, before ${n0}`;
  });

  await T('portal.every-span-bores-its-own-size-and-lines-with-its-own-span', async () => {
    await world(); const out = [];
    for (const span of [8, 12]) {
      await world(); const st = K.site({ span, rows: 30 }), e = K.mouth(st, 'steel');
      if (!K.until(() => e.lined >= 1, 400)) { out.push(`span ${span}: lined ${e.lined}, ${e.ps} ${e.pwhy}`); continue; }
      const s = ARCH_SPANS[span]; const a = K.archs().find((q) => q.id !== e.id && q.span === span); if (!a) { out.push(`span ${span}: no arch set`); continue; }
      if (a.span !== span || a.gj !== 0 || a.glo !== e.glo) out.push(`span ${span}: the new arch is not in line (${a.glo} vs ${e.glo})`);
      let bad = 0; for (let n = 0; n < 4; n++) for (const [i, j, k] of PORTAL.slabCells(e, PORTAL.slabA(e, n))) if (w().solid(i, j, k)) bad++;
      if (bad) out.push(`span ${span}: ${bad} plush left in the bore`);
      // the slab above the bore (row h) is still plush: it cut exactly the arch's section
      const [i, , k] = PORTAL.slabCells(e, PORTAL.slabA(e, 1))[0]; if (!w().solid(i, s.h, k)) out.push(`span ${span}: it cut above its own section`);
    }
    return out.length === 0 || out.join('; ');
  });

  await T('portal.takes-the-cheapest-tier-that-holds-and-a-deeper-site-needs-a-stronger-one', async () => {
    await world(); const out = [];
    const shallow = K.site({ span: 6 }), a = K.mouth(shallow, 'steel');
    if (!K.until(() => a.lined >= 1, 200)) return `shallow: lined ${a.lined} ${a.ps} ${a.pwhy}`;
    const first = K.archs().find((q) => q.id !== a.id); if (first.mat !== 'timber') out.push(`near the bay it set ${first.mat}, timber is rated for it and is the cheapest`);
    if (!(a.spent > 0 && a.spent < 1e6)) out.push('it paid ' + a.spent + ' for a timber arch');
    await world(); const deep = K.site({ span: 6, dist: 640 }), d = K.mouth(deep, 'concrete');
    // bore the first section, weigh every tier the way the portal does, and the arch it sets is the first that holds
    if (!K.until(() => d.adv >= 4, 60)) return `deep: adv ${d.adv} ${d.ps}`;
    const aheadA = [4, 5, 6, 7].map((n) => PORTAL.slabA(d, n)); const order = ['timber', 'steel', 'concrete', 'rebar', 'titan', 'carbon', 'plasma', 'voidl', 'neutron'], ratios = {}; let want = null;
    for (const mat of order) { const L = ARCH.layout(g, 'x', PORTAL.moduleM(d, 1), d.glo, 0, 6, mat, { free: true }); L.ent._head = d; ratios[mat] = PORTAL.weigh(g, L.ent, aheadA); if (want === null && ratios[mat] <= 1) want = mat; }
    if (!K.until(() => d.lined >= 1, 300)) return `deep: lined ${d.lined} ${d.ps} ${d.pwhy} ${out.join(';')}`;
    const mat = K.archs().find((q) => q.id !== d.id).mat;
    if (mat !== want) out.push(`it set ${mat}; the cheapest that holds is ${want} (${JSON.stringify(Object.fromEntries(Object.entries(ratios).map(([k, v]) => [k, +v.toFixed(2)])))})`);
    if (ratios.timber <= 1) out.push('a timber arch would have held at 640 m: the site is too shallow for this test');
    return out.length === 0 || out.join('; ');
  });

  await T('portal.halts-where-no-arch-it-owns-would-hold-says-the-mountain-presses-and-goes-on-when-you-upgrade', async () => {
    await world({ ...UP, concrete: 0, rebar: 0, titan: 0, carbon: 0, plasma: 0, voidl: 0, neutron: 0 }); K.run(0.1); const out = [];
    const st = K.site({ span: 6, dist: 780 }), e = K.mouth(st, 'titan');   // the mouth arch is titanium so it is not the thing that is overloaded at 780 m
    if (!K.until(() => e.ps === 'press', 200)) return `never halted: ${e.ps} adv ${e.adv} lined ${e.lined}`;
    if (e.adv % 4 !== 0 || (e.adv >> 2) !== e.lined + 1) out.push(`it bored ${e.adv} slabs and lined ${e.lined} before it halted (a bored section waits for its arch: the slabs are a multiple of 4 and one section is unlined)`);
    if (!(e.pl > 1)) out.push('the load it reports is ' + e.pl);
    const txt = PORTAL.lines(g, e).join(' '); if (!/the mountain presses \d+%/.test(txt)) out.push('readout: ' + txt.slice(0, 120));
    const adv0 = e.adv, lined0 = e.lined; K.run(5); if (e.adv !== adv0 || e.lined !== lined0) out.push('it bored on while a section was unlined');
    // a better tier and it goes on by itself (titanium: the roof it weighs here is far under what it bears)
    S().up.concrete = 1; S().up.rebar = 1; S().up.titan = 1; g.T = g.tune(); K.fast(); K.run(3);
    if (!K.until(() => e.lined > lined0, 120)) out.push(`after titanium: ${e.ps} ${e.pwhy}`);
    else if (!K.until(() => e.adv >= adv0 + 4, 120)) out.push('it did not go on after lining');
    return out.length === 0 || out.join('; ');
  });

  await T('portal.needs-power-and-E-parks-and-starts-it', async () => {
    await world(); const st = K.site({ span: 6 }), e = K.mouth(st, 'steel'); const out = [];
    g.time += 1; PORTAL.tick(g, 0.1); e.pw = 0; for (let n = 0; n < 30; n++) { e.pw = 0; g.time += 0.1; PORTAL.tick(g, 0.1); } if (e.adv !== 0 || e.ps !== 'nopower') out.push(`unpowered: adv ${e.adv} ${e.ps}`);
    // park it with E (the cfg path both roles use)
    const r = g.setCfg(e, { off: true }); if (!r.ok || !e.off) out.push('park refused: ' + JSON.stringify(r));
    K.run(8); if (e.adv !== 0 || e.ps !== 'off') out.push(`parked: adv ${e.adv} ${e.ps}`); if (PORTAL.kwOf(e) !== 0) out.push('a parked portal draws ' + PORTAL.kwOf(e));
    g.setCfg(e, { off: false }); if (!K.until(() => e.adv >= 1, 30)) out.push('it did not start again');
    // a plain arch (not a portal) refuses the setting
    const plain = K.mouth(K.site({ span: 6, lane: -8, len: 30 }), 'steel', { portal: false }); const r2 = g.setCfg(plain, { off: true }); if (r2.ok) out.push('a plain arch took the portal setting');
    // forged settings are rejected whole
    const r3 = g.setCfg(e, { off: 'yes' }); if (r3.ok) out.push('a bad value was accepted'); const r4 = g.setCfg(e, { adv: 99 }); if (r4.ok) out.push('a guest could set the progress');
    return out.length === 0 || out.join('; ');
  });

  await T('portal.draws-power-by-span-and-nothing-when-parked', async () => {
    await world(); const out = [];
    for (const [span, kw] of [[6, 150], [8, 260], [12, 480]]) { await world(); const st = K.site({ span }); const e = K.mouth(st, 'steel'); if (PORTAL.kwOf(e) !== kw) out.push(`span ${span}: ${PORTAL.kwOf(e)} kW`); }
    return out.length === 0 || out.join('; ');
  });

  await T('portal.the-hammer-gives-the-arch-back-and-the-driver-stops', async () => {
    await world(); const st = K.site({ span: 6 }), e = K.mouth(st, 'steel'); K.run(3);
    const items0 = S().items['garch:6:steel'] || 0; g.doDecon({ kind: 'mach', id: e.id });
    if ((S().items['garch:6:steel'] || 0) !== items0 + 1) return 'the arch did not come back';
    if (w().supports.some((q) => q.id === e.id || q.id === 'shield' + e.id)) return 'a support of it is still in the world';
    if (g.machines.items.has(e.id)) return 'still in the machines';
    const n = K.archs().length; K.run(10); return K.archs().length === n || 'it went on after it was taken down';
  });

  await T('portal.chokes-on-stale-air-until-a-support-fan-blows-near-the-cutter', async () => {
    await world(); const st = K.site({ span: 6, dist: 1150 }), e = K.mouth(st, 'neutron'); const out = [];
    if (!K.until(() => e.ps === 'choke', 10)) return `no choke at 1,150 m: ${e.ps} adv ${e.adv}`;
    if (e.adv !== 0) out.push('it cut a slab in bad air'); if (!/stale/.test(PORTAL.lines(g, e).join(' '))) out.push('the readout does not say stale air');
    // a fan clamped under the arch, powered, blowing down the tunnel
    const px = e.cx, py = e.y0 + e.h - 0.1, pz = e.cz; const fan = { id: g.nextId(), type: 'fan', mounted: true, frameId: e.id, px, py, pz, fx: 1, fz: 0, fyaw: Math.PI / 2, dir: 0, i: toI(px), j: ctx.toJ(py), k: toK(pz) };
    S().entities.push(fan); g.addEntity(fan); g.dust._fanNext = 0;
    if (!K.until(() => e.adv >= 2, 30)) out.push(`with a fan: ${e.ps} adv ${e.adv} stale ${(g.dust.stale({ x: e.cx + 2, y: e.y0 + 1.6, z: e.cz }) || 0).toFixed(2)}`);
    return out.length === 0 || out.join('; ');
  });

  await T('portal.never-takes-the-one-without-a-scanner-on-the-line-and-hands-it-to-one', async () => {
    await world(); const st = K.site({ span: 6, dist: 300 }), e = K.mouth(st, 'steel'); const out = [];
    const cell = PORTAL.slabCells(e, PORTAL.slabA(e, 2))[9]; w().setCell(cell[0], cell[1], cell[2], NEEDLE, 64);
    if (!K.until(() => e.ps === 'one', 60)) return `no halt at The One: ${e.ps} adv ${e.adv}`;
    if (e.adv !== 2) out.push('it cut ' + e.adv + ' slabs, The One is in the third'); if (w().get(cell[0], cell[1], cell[2]) !== NEEDLE) out.push('The One was taken');
    K.run(10); if (w().get(cell[0], cell[1], cell[2]) !== NEEDLE || e.adv !== 2) out.push('it went on without a scanner');
    if (!/THE ONE|Vehicle Scanner/.test(PORTAL.lines(g, e).join(' '))) out.push('the readout does not name the scanner');
    // an unpowered scanner does not count
    const lat = st.lo + (st.span >> 1) - 5; K.clearBox(st.i0 - 12, lat - 1, 4, 14, 12); const L = VS.layout(g, 'x', st.i0 - 10, lat, 0); if (!L.ok) return 'scanner layout: ' + L.why;
    const sc = g.placeEntity('vscan', { ...L.ent }); const prev = g.machines.items.get(sc.id);
    const stepOff = (secs) => { for (let n = 0; n < secs * 10; n++) { for (const it of g.machines.items.values()) it.ent.pw = it.ent.type === 'vscan' ? 0 : 1; g.time += 0.1; PORTAL.tick(g, 0.1); } };
    stepOff(5); if (w().get(cell[0], cell[1], cell[2]) !== NEEDLE) out.push('an unpowered scanner let it take The One'); void prev;
    if (!K.until(() => e.adv >= 3, 30)) out.push(`with a powered scanner: ${e.ps} adv ${e.adv}`);
    if (!(sc.alarm && sc.held && sc.held.sp === NEEDLE)) out.push('the scanner does not hold The One'); if (w().get(cell[0], cell[1], cell[2]) === NEEDLE) out.push('The One is still in the wall');
    return out.length === 0 || out.join('; ');
  });

  await T('portal.stops-at-a-wall-or-a-machine-in-the-way-and-goes-on-when-it-is-gone', async () => {
    await world(); const st = K.site({ span: 6 }), e = K.mouth(st, 'steel'); const out = [];
    const cell = PORTAL.slabCells(e, PORTAL.slabA(e, 1))[4]; w().setCell(cell[0], cell[1], cell[2], BULK, 0);
    if (!K.until(() => e.ps === 'stuck', 40)) return `no halt at the wall: ${e.ps} adv ${e.adv}`;
    if (e.adv !== 1 || w().get(cell[0], cell[1], cell[2]) !== BULK) out.push('it cut through a bulkhead panel (adv ' + e.adv + ')');
    w().setCell(cell[0], cell[1], cell[2], 0, 0); if (!K.until(() => e.adv >= 4, 40)) out.push(`after taking it down: ${e.ps} adv ${e.adv}`);
    return out.length === 0 || out.join('; ');
  });

  await T('portal.saves-mid-bore-and-picks-up-where-it-was', async () => {
    await world(); const st = K.site({ span: 8 }), e = K.mouth(st, 'steel');
    if (!K.until(() => e.lined >= 1 && e.adv >= 6, 300)) return `no progress: ${e.ps} ${e.adv} ${e.lined}`;
    const was = { adv: e.adv, lined: e.lined, spent: e.spent, pd: e.pd, n: K.archs().length, sup: w().supports.length };
    const raw = JSON.parse(JSON.stringify(S().entities));
    for (const x of [...K.archs()]) K.gone(x); if (K.archs().length) return 'not cleared'; w().supports = [];
    for (const x of raw) { S().entities.push(x); g.addEntity(x); }
    const e2 = S().entities.find((x) => x.id === e.id), out = [];
    if (!e2 || e2.adv !== was.adv || e2.lined !== was.lined || e2.spent !== was.spent || e2.pd !== was.pd) out.push('portal state lost: ' + JSON.stringify(e2 && [e2.adv, e2.lined, e2.spent, e2.pd]));
    if (K.archs().length !== was.n) out.push(`arches ${K.archs().length} of ${was.n}`);
    if (w().supports.filter((q) => q.kind && q.kind.startsWith('arch8:')).length !== was.n) out.push('arch supports not rebuilt');
    if (!w().supports.some((q) => q.id === 'shield' + e.id)) out.push('the cutter shield is gone');
    const it = g.machines.items.get(e.id); if (!it || !it.drv) out.push('no cutter mesh after loading');
    const adv0 = e2.adv; K.run(30); if (e2.adv <= adv0) out.push('it did not go on after loading (' + e2.ps + ')');
    return out.length === 0 || out.join('; ');
  });

  await T('portal.an-old-save-without-portal-fields-loads-as-a-plain-arch', async () => {
    await world(); const st = K.site({ span: 6 }); K.clearBox(st.i0, st.lo, 4, 6, 5);
    const e = { id: g.nextId(), type: 'garch', axis: 'x', gm: st.i0, glo: st.lo, gj: 0, span: 6, mat: 'timber' }; S().entities.push(e); g.addEntity(e);
    K.run(5); return (e.pd === 0 && e.adv === 0 && !PORTAL.isPortal(e) && w().supports.some((q) => q.id === e.id) && K.archs().length === 1) || JSON.stringify([e.pd, e.adv]);
  });

  await T('portal.cuts-out-what-fell-into-the-section-before-it-lines-it', async () => {
    await world(); const st = K.site({ span: 6 }), e = K.mouth(st, 'steel'); let done = false, n = 0;
    K.until(() => e.adv >= 4, 60);
    const mod = ARCH.sectionCells(ARCH.derive('x', PORTAL.moduleM(e, 1), e.glo, 0, 6, 'steel')); for (let q = 0; q < 6; q++) { const [i, j, k] = mod[q * 3]; w().setCell(i, j, k, 3, 0); n++; }
    const money0 = S().money; const ok = K.until(() => e.lined >= 1, 60); void done; void money0;
    if (!ok) return `it never lined with ${n} plush in the section: ${e.ps} ${e.pwhy}`;
    for (const [i, j, k] of mod) if (w().solid(i, j, k)) return 'a plush is still in the lined section';
    return K.archs().length === 2 || 'arches ' + K.archs().length;
  });

  await T('portal.an-arch-the-player-set-in-the-next-module-counts-as-the-lining', async () => {
    await world(); const st = K.site({ span: 6 }), e = K.mouth(st, 'steel');
    K.until(() => e.adv >= 4, 60); const spent0 = e.spent; const mod = ARCH.derive('x', PORTAL.moduleM(e, 1), e.glo, 0, 6, 'concrete');
    const a = g.placeEntity('garch', { axis: 'x', gm: mod.gm, glo: mod.glo, gj: 0, span: 6, mat: 'concrete' }, { quiet: true });
    K.run(0.1); return (e.lined === 1 && e.spent === spent0 && K.archs().length === 2 && a) || `lined ${e.lined} spent ${e.spent - spent0} arches ${K.archs().length}`;
  });

  await T('portal.the-readout-says-what-it-is-doing-and-what-it-needs', async () => {
    await world(); const st = K.site({ span: 6 }), e = K.mouth(st, 'steel'); K.run(1);
    const { infoFor } = await import('../info.js'); const r = infoFor(g, { kind: 'mach', id: e.id }); if (!r) return 'no readout';
    const txt = r.title + ' ' + r.lines.join(' | ');
    for (const want of [/STEEL HAUL ARCH/i, /PORTAL/, /Clear opening 5 x 4/, /Rated to 323 m/, /150 kW/, /Vehicle Scanner/, /stale|Support Fan/i]) if (!want.test(txt)) return 'missing ' + want + ' in: ' + txt.slice(0, 600);
    return !/undefined|NaN/.test(txt) || 'bad text: ' + txt;
  });
}
