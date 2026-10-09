// mp.detector.hostview.*: whatever a friend can see of a walk-through detector, the HOST must see too (a Detector Arch, a Giant Detector Arch,
// a Vehicle Scanner, a Detector Gate). One page plays both roles by switching g.net.role and capturing g.netSend (see detector_mp.js).
// For every way a detector comes into the host's world (the host sets it, a guest sets it through `cmd place`, a save is loaded, a hammer takes it down and one is set again)
// the host must hold a mesh that hangs from the scene, is visible all the way up, stands where the ent says and is inside the camera frustum when the player looks at it.
import { makeKit } from './addons_lib.js';
import * as D from '../detector.js';
import * as VS from '../vehiclescan.js';

export default async function (ctx) {
  const { T, g, S, p, V3, THREE, fresh, adv, toI, toK } = ctx;
  const K = makeKit(ctx);
  const UP = { detector: 1, archGate: 1, archGiant: 1, vscan: 1, power: 1, belts: 1 };
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const guard = (name, fn) => T(name, async () => {
    const mode0 = g.mode, remote0 = g.remote;
    try { g.mode = 'play'; return await fn(); } finally { done(); g.remote = remote0; g.mode = mode0 === 'ended' ? 'play' : mode0; g.stowed = true; g.rebuildTools(); if (g.ui.openModal) g.ui.closeModals(); }
  });
  const scene = () => g.renderer.scene;

  // everything that can make a mesh invisible to the host: not hung from the scene, a hidden ancestor, an empty group, a wrong place, outside the frustum when looked at
  const hostView = (e, label = 'detector') => {
    const bad = [], it = g.machines.items.get(e.id);
    if (!it || !it.obj) return [`${label}: the host has no machine item for ent ${e.id}`];
    const obj = it.obj; let up = obj, inScene = false, hidden = null;
    while (up) { if (up.visible === false) hidden = up.name || up.type; if (up === scene()) inScene = true; up = up.parent; }
    if (!inScene) bad.push(`${label}: its mesh is not in the scene`);
    if (hidden) bad.push(`${label}: something above or at the mesh is invisible (${hidden})`);
    const meshes = []; obj.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const seen = meshes.filter((m) => m.visible);
    if (meshes.length < 3 || seen.length < 3) bad.push(`${label}: too few meshes (${seen.length} visible of ${meshes.length})`);
    for (const m of meshes) if (m.material && (m.material.visible === false || (m.material.opacity === 0 && m.material.transparent))) { bad.push(`${label}: a material is invisible`); break; }
    obj.updateWorldMatrix(true, true);
    const box = new THREE.Box3(); for (const m of seen) box.expandByObject(m); const c = box.getCenter(new V3()), sz = box.getSize(new V3());
    const want = { x: e.cx, z: e.cz };
    if (!Number.isFinite(c.x + c.y + c.z) || sz.length() < 1) bad.push(`${label}: empty or non finite bounds ${sz.length().toFixed(2)}`);
    else {
      if (Math.abs(c.x - want.x) > 4 || Math.abs(c.z - want.z) > 4) bad.push(`${label}: the mesh is at ${c.x.toFixed(1)},${c.z.toFixed(1)} but the ent is at ${want.x.toFixed(1)},${want.z.toFixed(1)}`);
      if (c.y < e.y0 - 0.5 || c.y > e.y0 + e.h + 2) bad.push(`${label}: the mesh floats at y ${c.y.toFixed(1)} (ent floor ${e.y0.toFixed(1)})`);
    }
    // look at it from 7 m in front of the plane (a bit further for the big ones), the way a player standing at the arch does
    const cam = g.renderer.camera, keep = { p: cam.position.clone(), q: cam.quaternion.clone() }, far = Math.max(7, sz.length() * 0.9);
    try {
      const ax = e.axis === 'x' ? 1 : 0, az = e.axis === 'x' ? 0 : 1;
      cam.position.set(e.cx - ax * far, e.y0 + 1.6, e.cz - az * far); cam.lookAt(e.cx, e.y0 + Math.min(e.h, 4) / 2, e.cz); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
      const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      const inF = seen.filter((m) => fr.intersectsObject(m)).length;
      if (inF < 3) bad.push(`${label}: only ${inF} meshes are inside the camera frustum when looked at`);
    } finally { cam.position.copy(keep.p); cam.quaternion.copy(keep.q); cam.updateMatrixWorld(true); }
    return bad;
  };
  const archEnts = () => [...g.machines.items.values()].map((it) => it.ent).filter((e) => e.type === 'arch');
  const mkArch = (size, x, z, axis = 'z') => {
    K.clearBay(); const S_ = D.SIZES[size], lat = axis === 'z' ? toI(x) : toK(z), m = axis === 'z' ? toK(z) : toI(x);
    const l = D.layout(g, size, axis, m, lat - (S_.w / 2 - 1), 0); if (!l.ok) throw new Error('layout: ' + l.why); return l.ent;
  };
  // the real click: item in hand, aim, plan, place (a catalog tool takes this road on the host)
  const clickPlace = async (id, x, z) => {
    K.clearBay(); S().items[id] = (S().items[id] || 0) + 1; K.equip(id); K.aimDir(x, 0, z, 1, 2.2); await ctx.plan();
    if (!g.plan || !g.plan.ok) return { why: 'plan: ' + (g.plan && g.plan.why) };
    const before = new Set(S().entities.map((e) => e.id)); g.placeCurrent(g.curTool());
    return { ent: S().entities.find((e) => !before.has(e.id)) };
  };
  const settle = () => { adv(0.6, 0.05); };
  const hostSees = (e, label) => { settle(); return hostView(e, label); };
  const fin = (bad) => bad.length === 0 || bad.join(' || ');

  for (const [name, id] of [['arch', 'arch'], ['giant arch', 'archBig']]) {
    await guard(`mp.detector.hostview.host-click-${id}`, async () => {
      fresh(UP); role('host'); cap(); const r = await clickPlace(id, -7.2, id === 'arch' ? 3.0 : 8.0); if (!r.ent) return r.why;
      return fin(hostSees(r.ent, name));
    });

    await guard(`mp.detector.hostview.guest-places-${id}-and-the-host-builds-it`, async () => {
      fresh(UP); S().money = 1e12; K.clearBay(); role('guest'); cap(); S().items[id] = 3; K.equip(id); K.aimDir(-7.2, 0, id === 'arch' ? 3.0 : 8.0, 1, 2.2); await ctx.plan();
      if (!g.plan || !g.plan.ok) return 'guest plan: ' + (g.plan && g.plan.why);
      g.placeCurrent(g.curTool()); const c = sent.find((m) => m.t === 'cmd' && m.c === 'place'); if (!c) return 'no place command';
      const msgs = []; done(); role('host'); cap(); const have = S().items[id]; g.netMessage(json(c));
      const made = archEnts(); if (made.length !== 1) return 'the host built ' + made.length + ' arches (items ' + have + ')';
      const bad = hostSees(made[0], name + ' from a guest');
      if (!sent.some((m) => m.t === 'ent+' && m.ent.id === made[0].id)) bad.push('the guest was not told');
      void msgs; return fin(bad);
    });

    await guard(`mp.detector.hostview.${id}-after-save-and-load`, async () => {
      fresh(UP); role('host'); cap(); const r = await clickPlace(id, -7.2, id === 'arch' ? 3.0 : 8.0); if (!r.ent) return r.why;
      g.setCfg(r.ent, { mode: 'rarity', rarity: 3, exact: true, volume: 0.4 });
      // the real order of a load: a JSON round trip of the entity list, the machines cleared, every ent added (game.js startPlay)
      const raw = JSON.parse(JSON.stringify(S().entities)); g.machines.clear(); g.logi.clear(); S().entities = raw; for (const e of raw) g.addEntity(e);
      const e2 = archEnts()[0]; if (!e2) return 'no arch after the load';
      return fin(hostSees(e2, name + ' after a load'));
    });

    await guard(`mp.detector.hostview.${id}-removed-and-set-again`, async () => {
      fresh(UP); role('host'); cap(); const r = await clickPlace(id, -7.2, id === 'arch' ? 3.0 : 8.0); if (!r.ent) return r.why;
      const bad = []; K.equip('hammer'); K.aimDir(r.ent.cx, r.ent.y0 + r.ent.h / 2, r.ent.cz, 1, 2.0); adv(0.05); g.renderer.camera.position.copy(p().eyePos(new V3()));
      g.doDecon({ kind: 'mach', id: r.ent.id }); if (archEnts().length) return 'the hammer did not take the arch down';
      const r2 = await clickPlace(id, -7.2, id === 'arch' ? 3.0 : 8.0); if (!r2.ent) return r2.why;
      bad.push(...hostSees(r2.ent, name + ' set again'));
      return fin(bad);
    });

    await guard(`mp.detector.hostview.${id}-seen-after-a-friend-changes-its-target`, async () => {
      fresh(UP); role('host'); cap(); const r = await clickPlace(id, -7.2, id === 'arch' ? 3.0 : 8.0); if (!r.ent) return r.why;
      g.netMessage(json({ t: 'cmd', c: 'cfg', d: { id: r.ent.id, patch: { mode: 'rarity', rarity: 4 } } }));
      const e2 = archEnts()[0]; if (!e2 || e2.mode !== 'rarity') return 'the host did not take the target';
      return fin(hostSees(e2, name + ' after the friend picked a target'));
    });

    await guard(`mp.detector.hostview.${id}-seen-while-the-host-walks-through-it`, async () => {
      fresh(UP); role('host'); cap(); const r = await clickPlace(id, -7.2, id === 'arch' ? 3.0 : 8.0); if (!r.ent) return r.why;
      const e = r.ent; S().carry = [{ sp: 1, vr: 0 }]; D.archState(e).in = false; D.archState(e).along = null;
      p().pos.set(e.cx, 0, e.cz - 1.5); g.playerGateScan(0.05); p().pos.set(e.cx, 0, e.cz); g.playerGateScan(0.05); g.stowed = true; g.rebuildTools();
      return fin(hostSees(e, name + ' after walking through'));
    });
  }

  await guard('mp.detector.hostview.vehicle-scanner-on-the-host-and-from-a-guest', async () => {
    fresh(UP); role('host'); cap(); K.clearBay(); const bad = [];
    const l = VS.layout(g, 'z', toK(8), toI(-7.2) - (VS.SIZE.w / 2 - 1), 0); if (!l.ok) return 'scanner layout: ' + l.why;
    const e = g.placeEntity('vscan', l.ent); bad.push(...hostSees(e, 'scanner'));
    const raw = JSON.parse(JSON.stringify(S().entities)); g.machines.clear(); g.logi.clear(); S().entities = raw; for (const x of raw) g.addEntity(x);
    const e2 = [...g.machines.items.values()].map((it) => it.ent).find((x) => x.type === 'vscan'); if (!e2) return 'no scanner after the load';
    bad.push(...hostSees(e2, 'scanner after a load'));
    return fin(bad);
  });

  // The guest loads the host's warehouse with startPlay, and at that moment isGuest() is still false (guestReady comes with the host's world). The old ensureFreeGate then built a
  // private Welcome Gate on the guest: a detector the guest can see and walk through that the host does not have (an old save with no gate, a gate set further out by the host's
  // upgrades, a spot the host's pile covers). The host's own gate arrives with `ents` like everything else.
  const noFreeGate = () => { const gate = S().entities.find((e) => e.free && e.detector); if (gate) { const t = g.logi.byId.get(gate.id); if (t) g.logi.remove(t); S().entities = S().entities.filter((e) => e !== gate); } return gate; };
  const putBack = (gate) => { for (const e of S().entities.filter((x) => x.free && x.detector)) { const t = g.logi.byId.get(e.id); if (t) g.logi.remove(t); S().entities = S().entities.filter((x) => x !== e); } if (gate) { S().entities.push(gate); g.addEntity(gate); } };
  await guard('mp.detector.hostview.a-guest-loading-the-hosts-world-builds-no-private-welcome-gate', async () => {
    fresh(UP); const bad = [], gate = noFreeGate(), free0 = S().freeGate;
    try {
      role('guest'); g.guestReady = false;   // what startPlay sees on the guest: the link is open, the world is not ready yet
      g.ensureFreeGate();
      const own = S().entities.filter((e) => e.free || e.detector); if (own.length) bad.push('the guest built its own gate: ' + JSON.stringify(own.map((e) => [e.id, e.i, e.k, e.view])));
      if ([...g.logi.tiles.values()].some((t) => t.detector)) bad.push('the guest logistics holds a gate the host never sent');
      role(null); S().freeGate = free0; g.ensureFreeGate();   // a solo game and a host still get theirs
      if (!S().entities.some((e) => e.free && e.detector)) bad.push('a solo game or a host lost its Welcome Gate');
    } finally { role(null); S().freeGate = free0; putBack(gate); }
    return fin(bad);
  });

  await guard('mp.detector.hostview.detector-gate-on-a-belt', async () => {
    fresh(UP); role('host'); cap(); K.clearBay(); const bad = [];
    const belt = await K.put('belt', { x: -7.2, z: 3.0, dir: 1 }); if (!belt.ok) return 'belt: ' + belt.why;
    const gate = await K.put('gate', { x: -7.2, z: 3.0, dir: 1 }); if (!gate.ok) return 'gate: ' + gate.why;
    const t = g.logi.byId.get(gate.ent ? gate.ent.id : belt.ent.id) || g.logi.byId.get(belt.ent.id); if (!t || !t.detector) return 'the belt did not become a gate';
    adv(0.6, 0.05); const o = g.logi.objs.get(t.id); let up = o, inScene = false, hid = false; while (up) { if (up.visible === false) hid = true; if (up === scene()) inScene = true; up = up.parent; }
    if (!o || !inScene || hid) bad.push('the gate mesh is missing, hidden or not in the scene');
    return fin(bad);
  });
}
