// Hand-wired power cables: the Power Cable tool, the explicit link it adds on top of pole reach, drawing, hover text, saves.
import { SAVE_KEY } from '../config.js';
import { loadSaved } from '../state.js';
import { cableMax } from '../cables.js';
import { CONTROLS } from '../controls.js';
import { infoFor } from '../info.js';
import { EARTH } from '../earth.js';
import * as THREE from 'three';

export default async function (ctx) {
  const { T, g, S, L, fresh, adv, tiles, craft, selectTool, aimPoint, cellX, cellZ, toI, toK, recipes, tune } = ctx;
  const up = { power: 1, belts: 1, sorter: 1, mech: 1, fans: 1, depots: 1, claw: 1 };
  // the bay has loose plush lying about and its edge moves with the seed: clear the strip the tests stand and aim in
  let bayCleared = false;
  const clearBay = () => { if (bayCleared) return; bayCleared = true; const w = ctx.w(); for (let i = toI(-14); i <= toI(11); i++) for (let k = toK(-1); k <= toK(10); k++) for (let j = 0; j < 12; j++) if (w.get(i, j, k)) w.removeCell(i, j, k, false); };
  const reset = (u = up) => { clearBay(); fresh(u); S().cables = []; g.cables.reset(); g.power.markDirty(); };
  const mk = (type, x, z, extra = {}) => { const e = { id: g.nextId(), type, i: toI(x), j: 0, k: toK(z), dir: 0, rise: 0, ...extra }; if (type === 'belt') e.items = []; S().entities.push(e); g.addEntity(e); return L().byId.get(e.id); };
  const mkGen = (x, z) => { const t = mk('gen', x, z); t.burn = 1e5; t.burnMax = 1e5; t.lit = true; return t; };
  const mkMach = (type, x, z, extra = {}) => { const e = { id: g.nextId(), type, x, y: 0, z, i: toI(x), j: 0, k: toK(z), ...extra }; S().entities.push(e); g.addEntity(e); return g.machines.items.get(e.id).ent; };
  const look = (x, y, z, back = 2.0) => { aimPoint(x, y, z, back); adv(0.06); };
  const lookAt = (t) => look(cellX(t.i), 0.3, cellZ(t.k));
  const have = () => S().items.cable || 0;
  const click = () => g.cables.click(g.curTool());
  const hintText = () => (document.getElementById('hint') ? document.getElementById('hint').textContent : '');
  const colorOf = (n = 0) => { const c = new THREE.Color(); g.cables.mesh.getColorAt(n, c); return c; };
  const kind = (c) => (c.g >= c.r && c.g >= c.b ? 'green' : c.r > c.g * 3 ? 'red' : 'orange');
  const saveAndLoad = async () => { g.noSave = false; g.mode = 'play'; const ok = g.save(); g.noSave = true; if (!ok) throw new Error('g.save() failed'); if (!localStorage.getItem(SAVE_KEY)) throw new Error('nothing saved'); const saved = loadSaved(); g.loadWorld(saved.S, saved); g.noSave = true; g.mode = 'play'; };
  const bareHands = () => { g.stowed = true; g.cables.cancel(); };

  await T('cables.recipe-needs-power-grid-and-is-cheap-like-a-pole', async () => {
    reset({}); if (recipes(g).some((r) => r.id === 'cable')) return 'craftable without Power Grid';
    S().money = 1e12; g.craftItem('cable', 1); if (have()) return 'crafted without Power Grid';
    reset({ power: 1 }); const r = recipes(g).find((x) => x.id === 'cable'), pole = recipes(g).find((x) => x.id === 'pole');
    if (!r) return 'not listed with Power Grid'; if (!(r.price <= pole.price) || !r.use || !/Power Cable/.test(r.name)) return `price ${r.price} vs pole ${pole.price}, use "${r.use}"`;
    const m0 = S().money; g.craftItem('cable', 5); const tool = g.tools.find((t) => t && t.kind === 'cable');
    return (have() === 5 && m0 - S().money === r.price * 5 && tool && tool.icon && g.S.hotbar.includes('cable')) || `have ${have()}, paid ${m0 - S().money}, tool ${JSON.stringify(tool)}`;
  });

  await T('cables.wiring-a-generator-to-a-far-machine-powers-it-beyond-pole-reach', async () => {
    reset(); const G = mkGen(-9, 3), B = mk('belt', 3, 3); craft('cable', 2); selectTool('cable'); adv(1);
    if ((B.pw || 0) > 0.05) return 'belt 10 m from the generator is powered with no pole and no cable';
    if (Math.hypot(cellX(G.i) - cellX(B.i), cellZ(G.k) - cellZ(B.k)) <= g.T.poleReach) return 'test setup: belt is inside pole reach';
    lookAt(G); adv(0.06); click(); if (g.cables.from !== G.id) return 'first click did not start a wire: ' + hintText();
    lookAt(B); adv(0.06); const pv = g.cables.preview; if (!pv || pv.state !== 'green') return 'no green preview wire while aiming at the belt: ' + JSON.stringify(pv); if (!/attach/i.test(hintText()) || !/m of 25 m/.test(hintText())) return 'hint does not show the length: ' + hintText();
    click(); if (S().cables.length !== 1) return 'second click did not attach: ' + hintText(); if (g.cables.from != null) return 'wire still in hand after attaching';
    if (have() !== 1) return 'cable item not used: ' + have();
    const pw0 = B.pw; adv(1);
    if (!(B.pw > 0.9) || !(pw0 > 0.9)) return `belt not powered at once: pw right after ${pw0}, later ${B.pw}`;
    return /Wired/.test(hintText()) || 'no attach message: ' + hintText();
  });

  await T('cables.a-cable-between-two-poles-merges-their-grids', async () => {
    reset(); const G = mkGen(-9, 3), P1 = mk('pole', -8, 3.6), P2 = mk('pole', 7, 3.6), B = mk('belt', 7.6, 3.0); craft('cable'); adv(1);
    if (g.power.nets.length !== 2) return 'expected two separate grids before wiring, got ' + g.power.nets.length; if ((B.pw || 0) > 0.05) return 'far belt powered before wiring';
    const r = g.cables.connect(P1.id, P2.id); if (!r.ok) return r.why; adv(0.2);
    const net = g.power.nets.find((n) => n.nodes.includes(P2)); if (!net || !net.nodes.includes(G) || g.power.nets.length !== 1) return `grids after wiring: ${g.power.nets.length}, gen on far pole's grid: ${!!(net && net.nodes.includes(G))}`;
    return (B.pw > 0.9 && P2.pw > 0.9) || `far belt ${B.pw}, far pole ${P2.pw}`;
  });

  await T('cables.clicking-the-wired-pair-again-removes-the-cable-and-returns-it', async () => {
    reset(); const G = mkGen(-9, 3), B = mk('belt', 3, 3); craft('cable', 1); selectTool('cable'); adv(1);
    lookAt(G); click(); lookAt(B); click(); if (S().cables.length !== 1 || have() !== 0) return 'setup failed'; adv(1); if (!(B.pw > 0.9)) return 'not powered';
    lookAt(G); click(); lookAt(B); adv(0.06); if (!/remove/i.test(hintText())) return 'hint does not offer removal: ' + hintText(); click();
    adv(1); return (S().cables.length === 0 && have() === 1 && !(B.pw > 0.05) && g.cables.from == null) || `cables ${S().cables.length}, item ${have()}, belt ${B.pw}`;
  });

  await T('cables.hammer-and-x-take-the-wire-down-and-give-the-cable-back', async () => {
    reset(); const G = mkGen(-9, 3), B = mk('belt', 3, 3); craft('cable'); g.cables.connect(G.id, B.id); adv(1); if (have() !== 0) return 'setup';
    const rec = S().cables[0], pts = g.cables.curve(g.cables.attach(G), g.cables.attach(B)), mid = pts[6];
    selectTool('hammer'); look(mid[0], mid[1], mid[2], 2); const ref = g.hammerTarget(); if (!ref || ref.kind !== 'cable' || ref.id !== rec.id) return 'hammer does not target the wire: ' + JSON.stringify(ref);
    if (!/Power Cable/.test(g.describeRef(ref))) return 'hammer label ' + g.describeRef(ref);
    g.hammerHit(); adv(0.3); if (S().cables.length || have() !== 1) return `hammer: cables ${S().cables.length}, item ${have()}`;
    g.cables.connect(G.id, B.id); look(mid[0], mid[1], mid[2], 2); g.deconstruct(); adv(0.3);
    return (S().cables.length === 0 && have() === 1) || `X: cables ${S().cables.length}, item ${have()}`;
  });

  await T('cables.the-wire-does-not-steal-hits-from-the-machine-it-hangs-on', async () => {
    reset(); const G = mkGen(-9, 3), B = mk('belt', 3, 3); craft('cable'); g.cables.connect(G.id, B.id); selectTool('hammer'); adv(0.2);
    lookAt(B); const r1 = g.hammerTarget(); lookAt(G); const r2 = g.hammerTarget();
    return (r1 && r1.kind === 'tile' && r1.id === B.id && r2 && r2.kind === 'tile' && r2.id === G.id) || `aimed at the belt: ${JSON.stringify(r1)}, at the generator: ${JSON.stringify(r2)}`;
  });

  await T('cables.too-far-is-refused-in-red-and-keeps-the-wire-and-the-cable', async () => {
    reset(); const G = mkGen(-9, 3), B = mk('belt', 3, 3); craft('cable'); selectTool('cable'); adv(0.5);   // the bay is about 24 m wide: shrink the limit instead of testing 26 m apart
    g.cables.max = () => 8; try { return await (async () => {
    const r = g.cables.connect(G.id, B.id); if (r.ok || !/Too far/.test(r.why) || S().cables.length || have() !== 1) return 'connect did not refuse: ' + JSON.stringify([r.ok, r.why, S().cables.length, have()]);
    lookAt(G); click(); lookAt(B); adv(0.06); const pv = g.cables.preview; const h = document.getElementById('hint').innerHTML;
    if (!pv || pv.state !== 'red' || !/Too far/.test(h) || !/ff6a5a/.test(h)) return `no red too-far readout: ${pv && pv.state} ${h}`;
    click(); return (g.cables.from === G.id && S().cables.length === 0 && have() === 1 && /Too far/.test(hintText())) || `from ${g.cables.from}, cables ${S().cables.length}, item ${have()}, hint ${hintText()}`;
    })(); } finally { delete g.cables.max; } });

  await T('cables.length-limit-is-25-m-and-grid-range-lengthens-it', async () => {
    tune({ power: 1 }); const a = cableMax(g.T); tune({ power: 1, gridRange: 4 }); const b = cableMax(g.T);
    reset({ power: 1 }); const G = mkGen(-14, 3), B = mk('belt', 13, 3); craft('cable'); const r0 = g.cables.connect(G.id, B.id);   // 27 m
    reset({ power: 1, gridRange: 4 }); const G2 = mkGen(-14, 3), B2 = mk('belt', 13, 3); craft('cable'); const r1 = g.cables.connect(G2.id, B2.id);
    return (a === 25 && b > a && !r0.ok && r1.ok && S().cables.length === 1) || `max ${a} then ${b}, 27 m at level 0: ${r0.ok}, at level 4: ${r1.ok}`;
  });

  await T('cables.cancel-by-clicking-air-or-pressing-q-or-esc-or-switching-tool', async () => {
    reset(); const G = mkGen(-9, 3), B = mk('belt', 3, 3); craft('cable'); selectTool('cable'); adv(0.5); const bad = [];
    const start = () => { g.cables.cancel(); selectTool('cable'); adv(0.1); lookAt(G); click(); if (g.cables.from !== G.id) bad.push('could not start'); };
    start(); look(-3, 6, 3, 2); adv(0.06); click(); if (g.cables.from != null) bad.push('empty air click did not cancel');
    start(); g.onKey({ code: 'KeyQ' }, true); if (g.cables.from != null || g.stowed) bad.push(`Q: from ${g.cables.from}, stowed ${g.stowed}`);
    start(); g.onKey({ code: 'Escape' }, true); if (g.cables.from != null) bad.push('Esc did not cancel');
    start(); selectTool('hammer'); adv(0.2); if (g.cables.from != null) bad.push('switching tool did not cancel');
    start(); g.stowed = true; adv(0.2); if (g.cables.from != null) bad.push('stowing did not cancel');
    start(); lookAt(G); click(); if (g.cables.from != null) bad.push('clicking the same object did not drop the wire');
    if (S().cables.length || have() !== 1) bad.push(`a cancel changed things: cables ${S().cables.length}, item ${have()}`); void B;
    return bad.length === 0 || bad.join('; ');
  });

  await T('cables.cables-keep-working-after-save-and-reload', async () => {
    reset(); const G = mkGen(-9, 3), B = mk('belt', 3, 3), P1 = mk('pole', -8, 3.6), P2 = mk('pole', 9, 3.6); craft('cable', 2); g.cables.connect(G.id, B.id); g.cables.connect(P1.id, P2.id); adv(1); if (!(B.pw > 0.9)) return 'setup: not powered';
    const before = JSON.stringify(S().cables); await saveAndLoad(); adv(1.5);
    const B2 = L().byId.get(B.id);
    if (JSON.stringify(S().cables) !== before) return 'cable list changed: ' + JSON.stringify(S().cables);
    if (!B2 || !(B2.pw > 0.9)) return 'cabled belt not powered after load: ' + (B2 && B2.pw); if (g.cables.mesh.count < 20) return 'wires not drawn after load: ' + g.cables.mesh.count;
    g.cables.remove(S().cables[0].id, true); g.cables.remove(S().cables[0].id, true); await saveAndLoad(); return (S().cables.length === 0 && g.cables.mesh.count === 0 || (adv(0.6), g.cables.mesh.count === 0)) || 'removed cables came back';
  });

  await T('cables.taking-down-either-end-removes-the-cable-and-a-collapse-does-too', async () => {
    reset(); const bad = []; craft('cable', 3);
    let G = mkGen(-9, 3), B = mk('belt', 3, 3); g.cables.connect(G.id, B.id); g.doDecon({ kind: 'tile', id: B.id }); adv(0.3); if (S().cables.length || have() !== 2 + 1) bad.push(`taking down the belt: cables ${S().cables.length}, items ${have()}`);
    B = mk('belt', 3, 3); g.cables.connect(G.id, B.id); g.doDecon({ kind: 'tile', id: G.id }); adv(0.3); if (S().cables.length || have() !== 3) bad.push(`taking down the generator: cables ${S().cables.length}, items ${have()}`);
    // destroyed with no hammer (a collapse): the cable goes, nothing comes back
    G = mkGen(-9, 3); g.cables.connect(G.id, B.id); const n0 = have(); L().remove(B); S().entities = S().entities.filter((e) => e.id !== B.id); adv(1);
    if (S().cables.length) bad.push('cable stayed after its machine was destroyed'); if (have() !== n0) bad.push('a destroyed machine refunded a cable');
    // a machine from the machines list (beacon) too
    const bc = mkMach('beacon', 2, 3.6); g.cables.connect(G.id, bc.id); adv(0.2); if (!(bc.pw > 0.9)) bad.push('beacon beyond reach not powered by a cable: ' + bc.pw); g.doDecon({ kind: 'mach', id: bc.id }); adv(0.2); if (S().cables.length) bad.push('beacon cable stayed');
    return bad.length === 0 || bad.join('; ');
  });

  await T('cables.claws-borers-beacons-fans-sorters-mechs-and-earth-movers-can-all-be-wired', async () => {
    reset({ ...up, excavator: 1, dozer: 1, borer: 1, gridRange: 2 }); const bad = []; const G = mkGen(-9, 3), P = mk('pole', -8, 3.6); S().items.cable = 20;   // a generator takes 2 cables (power parts spec), so a pole with Grid Range 2 (10 ports) is the hub
    const parts = [mk('belt', 3, 3), mk('sorter', 4, 4.2), mk('mech', 4, 5.4), mk('fan', 4, 6.6), mk('charger', 4, 7.8), mkMach('claw', 3, 9, { ry: 0 }), mkMach('beacon', 3, 10.2),
      mkMach('borer', 3, 11.4, { dx: 1, dz: 0, w: 2, h: 3 })];
    const spec = EARTH.dozer; parts.push(mkMach('dozer', 3, 13.2, { dx: 1, dz: 0, hy: spec.hy, hr: spec.hr, hop: [], hn: 0, steps: 0, dug: 0, state: 'idle', yaw: 0 }));
    adv(1); for (const t of parts) if ((t.pw || 0) > 0.05) bad.push(t.type + ' powered with no cable');
    for (const t of parts) { const r = g.cables.connect(P.id, t.id); if (!r.ok) bad.push(`${t.type}: ${r.why}`); }
    adv(1); for (const t of parts) if (!(t.pw > 0.05)) bad.push(`${t.type} not powered by its cable (${t.pw})`);
    const net = g.power.nets[0]; if (!net || net.demand <= 0) bad.push('cabled machines add no demand to the grid');
    return bad.length === 0 || bad.slice(0, 5).join('; ');
  });

  await T('cables.a-machine-wired-to-a-machine-shares-its-power-and-poles-still-work-by-reach', async () => {
    reset(); const bad = []; const G = mkGen(-9, 3), P = mk('pole', -8, 3.6), near = mk('belt', -6.4, 3), near2 = mk('belt', -5.8, 3), far1 = mk('belt', 3, 3), far2 = mk('sorter', 3, 4.2); S().items.cable = 5; adv(1);   // a machine takes one cable (port limit), so two powered belts each share with one far machine
    if (!(near.pw > 0.9)) bad.push('belt in pole reach lost its power (' + near.pw + ')'); const d0 = g.power.nets[0].demand;
    g.cables.connect(near.id, far1.id); g.cables.connect(near2.id, far2.id); adv(1);
    if (!(far1.pw > 0.9) || !(far2.pw > 0.9)) bad.push(`chained machines unpowered: ${far1.pw} ${far2.pw}`);
    const d1 = g.power.nets[0].demand; if (Math.abs(d1 - d0 - 0.03 - 1.2) > 1e-6) bad.push(`demand ${d0} -> ${d1}, expected +1.23`); void G; void P;
    return bad.length === 0 || bad.join('; ');
  });

  await T('cables.wire-colors-follow-the-grid-green-orange-and-red', async () => {
    reset(); const bad = []; const G = mkGen(-9, 3), P = mk('pole', -8, 3.6); craft('cable', 6);   // the pole is the hub: a generator only takes 2 cables
    const ms = [0, 1, 2, 3].map((n) => mk('mech', 3, 3 + n * 1.2)); g.cables.connect(P.id, ms[0].id); adv(1); g.cables.redraw();
    if (kind(colorOf(0)) !== 'green') bad.push('powered wire is ' + kind(colorOf(0)) + ' ' + JSON.stringify(colorOf(0)));
    for (const m of ms.slice(1)) g.cables.connect(P.id, m.id); adv(1); g.cables.redraw(); const sat = g.power.nets[0].sat; if (!(sat < 0.95 && sat > 0.05)) bad.push('test needs a brownout, sat ' + sat); if (kind(colorOf(0)) !== 'orange') bad.push('brownout wire is ' + kind(colorOf(0)));
    G.burn = 0; G.q = []; G.lit = false; adv(1); g.cables.redraw(); if (kind(colorOf(0)) !== 'red') bad.push('dead wire is ' + kind(colorOf(0)));
    if (g.cables.segCount !== 4 * 12) bad.push('segments drawn ' + g.cables.segCount);
    const sag = g.cables.curve([0, 1, 0], [10, 1, 0]); if (!(sag[6][1] < 1 - 0.2)) bad.push('wire does not sag: ' + sag[6][1]);
    return bad.length === 0 || bad.join('; ');
  });

  await T('cables.hover-readout-names-the-source-and-the-cable-has-its-own-card', async () => {
    reset(); const G = mkGen(-9, 3), B = mk('belt', 3, 3); craft('cable'); g.cables.connect(G.id, B.id); adv(1); const bad = [];
    const ib = infoFor(g, { kind: 'tile', id: B.id }), ig = infoFor(g, { kind: 'tile', id: G.id });
    if (!ib || !/Powered by cable from Generator/.test(ib.lines.join('|')) || !/Powered/.test(ib.lines.join('|'))) bad.push('belt card: ' + JSON.stringify(ib && ib.lines));
    if (!ig || !/Cables: Belt/.test(ig.lines.join('|'))) bad.push('generator card: ' + JSON.stringify(ig && ig.lines));
    const ic = infoFor(g, { kind: 'cable', id: S().cables[0].id }); if (!ic || !/POWER CABLE/.test(ic.title) || !/Generator to Belt/.test(ic.lines[0]) || !ic.lit) bad.push('cable card: ' + JSON.stringify(ic));
    G.burn = 0; G.q = []; adv(1); const ib2 = infoFor(g, { kind: 'tile', id: B.id }); if (!/no power/i.test(ib2.lines.join('|'))) bad.push('dead card: ' + JSON.stringify(ib2.lines));
    selectTool('hammer'); const rec = S().cables[0], pts = g.cables.curve(g.cables.attach(G), g.cables.attach(B)); look(pts[6][0], pts[6][1], pts[6][2], 2); const ref = g.cables ? (await import('../info.js')).findInfoRef(g) : null; if (!ref || ref.kind !== 'cable' || ref.id !== rec.id) bad.push('hover ref on the wire: ' + JSON.stringify(ref));
    return bad.length === 0 || bad.join('; ');
  });

  await T('cables.no-cable-leaves-existing-power-numbers-alone', async () => {
    reset(); const G = mkGen(-9, 3), P = mk('pole', -8, 3.6), bs = [0, 1, 2].map((n) => mk('belt', -7.4 + n * 0.6, 3)), m = mk('mech', -6.4, 4.2); adv(1);
    const n0 = g.power.nets.length, d0 = g.power.nets[0].demand, s0 = g.power.nets[0].supply, pw0 = bs.map((b) => b.pw).concat([m.pw, P.pw]);
    craft('cable'); const far = mk('belt', 8.4, 3); g.cables.connect(G.id, far.id); g.cables.remove(S().cables[0].id, true); adv(1);
    const d1 = g.power.nets[0].demand, pw1 = bs.map((b) => b.pw).concat([m.pw, P.pw]);
    return (g.power.nets.length === n0 && Math.abs(d0 - (0.03 * 3 + 3.5)) < 1e-9 && Math.abs(d1 - d0) < 1e-9 && s0 === g.power.nets[0].supply && JSON.stringify(pw0) === JSON.stringify(pw1)) || `nets ${n0}->${g.power.nets.length}, demand ${d0} -> ${d1}, pw ${pw0} -> ${pw1}`;
  });

  await T('cables.controls-and-how-to-text-mention-the-cable', async () => {
    const all = CONTROLS.flatMap((gr) => gr.rows.map((r) => r.keys.join(' ') + ' ' + r.what)).join('\n'); const bad = [];
    if (!/Power Cable/.test(all) || !/cancel/i.test(all) || /[—–]/.test(all)) bad.push('controls table: ' + all.slice(0, 80));
    g.ui.open('howto'); const how = document.getElementById('howto').textContent; g.ui.closeModals(); if (!/Power Cable/.test(how)) bad.push('how to play does not mention the cable');
    const row = CONTROLS.find((gr) => gr.group === 'Tools and building').rows.find((r) => /Power Cable/.test(r.what) && r.keys.includes('Left click')); if (!row || !row.codes.includes('Mouse0')) bad.push('no left click row for the cable');
    return bad.length === 0 || bad.join('; ');
  });

  await T('cables.long-run-has-no-frame-errors-and-keeps-wires-standing', async () => {
    reset(); const G = mkGen(-9, 3), P = mk('pole', -8, 3.6); craft('cable', 5); const bs = [0, 1, 2, 3, 4].map((n) => mk('belt', 3 + n * 0.6, 3)); for (const b of bs) g.cables.connect(P.id, b.id);
    selectTool('cable'); lookAt(G); click(); adv(8); const ok = S().cables.length === 5 && bs.every((b) => b.pw > 0.9); bareHands(); return ok || 'cables ' + S().cables.length;
  });
}
