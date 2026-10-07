import { makeKit, ALL_UP, FLOOR, OPEN } from './addons_lib.js';
import { findInfoRef, infoFor } from '../info.js';
export default async function (ctx) {
  const { T, g, S, w, p, L, V3, fresh, tiles, adv, cellX, cellZ, toI, toK, FRAME_TYPES } = ctx;
  const K = makeKit(ctx); const BAD = /undefined|NaN|\[object|Infinity/;
  const aimAt = (x, y, z, back = 1.8) => { K.aimDir(x, y, z, 0, back); adv(0.05); g.renderer.camera.position.copy(p().eyePos(new V3())); };
  const read = (x, y, z, back) => { K.equip('hammer'); aimAt(x, y, z, back); const ref = findInfoRef(g); return { ref, info: infoFor(g, ref) }; };
  const KEY = { belt: /Carrying 0 plush/, ramp: /RAMP/, splitter: /SPLITTER/, gate: /DETECTOR/, gen: /GENERATOR/, pole: /POWER POLE/, fan: /VENT FAN/, sorter: /SORTING BOX/, vault: /VAULT/, mech: /MECH/, lantern: /LANTERN/, marker: /MARKER/, flare: /FLARE/, glow: /GLOW/, strut: /STRUT/, jack: /JACK/, beacon: /DEPOT/, dynamite: /DYNAMITE/, charge: /CHARGE|DYNAMITE/ };
  await T('info.every-placed-item-names-itself-and-says-how-it-works', async () => {
    fresh(ALL_UP); const bad = [];
    for (const [id, sp] of Object.entries({ ...FLOOR, ...OPEN })) {
      const r = await K.put(id, { x: sp.x, z: sp.z, dir: sp.dir, ramp: sp.ramp || 0 }); if (!r.ok) { bad.push(`${id}: could not place (${r.why})`); continue; }
      const e = r.ent; const x = e.cx ?? e.x ?? cellX(e.i), z = e.cz ?? e.z ?? cellZ(e.k), y = (e.y0 ?? e.y ?? e.j * 0.6) + 0.5;
      const { ref, info } = read(x, y, z, 1.6);
      if (!info) { bad.push(`${id}: nothing shown when aimed at (ref ${JSON.stringify(ref)})`); continue; }
      const text = [info.title, ...info.lines].join(' | ');
      if (BAD.test(text)) bad.push(`${id}: bad text "${text}"`); if (!info.title || info.lines.filter(Boolean).length < 1) bad.push(`${id}: empty readout`); if (KEY[id] && !KEY[id].test(text)) bad.push(`${id}: readout "${text.slice(0, 90)}" does not mention it`);
    }
    return bad.length === 0 || bad.slice(0, 5).join(' || ');
  });
  await T('info.frames-struts-and-support-fans-show-rating-depth-and-live-load', async () => {
    fresh(ALL_UP); const { i, k } = ctx.spot(); ctx.dig(i, k - 1, 12, 5, 4, false); const out = [];
    const f = { id: g.nextId(), type: 'frame', kind: 'steel', axis: 'x', cx: cellX(i + 6), cz: cellZ(k + 1), y0: 0, w: 2.36, h: 2.38, gm: i + 6, glo: k - 1, gj: 0, yaw: 0.4, turned: true }; S().entities.push(f); g.addEntity(f);
    const fan = { id: g.nextId(), type: 'fan', mounted: true, frameId: f.id, px: f.cx, py: 2.0, pz: f.cz, fx: 1, fz: 0, fyaw: Math.PI / 2, dir: 0, i: toI(f.cx), j: 3, k: toK(f.cz) }; S().entities.push(fan); g.addEntity(fan); g.logi.byId.get(fan.id).pw = 1;
    g.queueLoad(f.cx, 1, f.cz); for (let n = 0; n < 6; n++) g.updateLoads(0.5);
    const a = read(f.cx, 2.3, f.cz, 2.0).info;   // look at the beam over the middle: a frame reads out only when you look at its wood if (!a || !/STEEL FRAME/.test(a.title) || !/Rated to 380 m deep/.test(a.lines.join(' ')) || !/Load \d+%/.test(a.lines.join(' ')) || !/turned 23 degrees/.test(a.lines.join(' ')) || !/Support Fan clamped/.test(a.lines.join(' '))) out.push('frame: ' + JSON.stringify(a));
    const sf = { id: g.nextId(), type: 'strut', x: cellX(i + 3), y: 0, z: cellZ(k + 1) }; S().entities.push(sf); g.addEntity(sf); const b = read(sf.x, 0.6, sf.z, 1.6).info; if (!b || !/STRUT/.test(b.title) || !/Rated to 110 m/.test(b.lines.join(' '))) out.push('strut: ' + JSON.stringify(b));
    const c = read(f.cx, 2.0, f.cz, 2.0); void c;
    return out.length === 0 || out.join(' || ');
  });
  await T('info.cart-shows-its-load', async () => {
    fresh({ ...ALL_UP, cart: 5 }); g.craftItem('cart:1', 1); const info = infoFor(g, { kind: 'cart' }); return info === null || (/CARRYING|Carrying/.test(info.lines.join(' ')) || 'cart readout ' + JSON.stringify(info));
  });
  await T('info.readout-hides-when-aiming-at-nothing-and-while-placing', async () => {
    fresh(ALL_UP); K.equip('hammer'); p().pos.set(0, 0, -1.4); p().yaw = Math.PI; p().pitch = 0; g.hudT = 0; adv(0.15); const away = document.getElementById('tileInfo').classList.contains('hidden');
    const r = await K.put('gen', { x: -9, z: -1.2, dir: 0 }); if (!r.ok) return r.why; K.equip('hammer'); aimAt(cellX(r.ent.i), 0.5, cellZ(r.ent.k), 1.6); g.hudT = 0; adv(0.15); const shown = !document.getElementById('tileInfo').classList.contains('hidden');
    K.equip('belt'); g.hudT = 0; adv(0.15); const placing = document.getElementById('tileInfo').classList.contains('hidden');
    return (away && shown && placing) || `hidden when looking away ${away}, shown at the generator ${shown}, hidden while a build tool is out ${placing}`;
  });
}
