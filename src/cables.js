import * as THREE from 'three';
import { cellX, cellZ, toI, toJ, toK } from './config.js';
import { isEarth, EARTH } from './earth.js';
import { maxPorts, wireCheck, isPart, partName } from './powerparts.js';

// ---------------------------------------------------------------------------------------------------
// Hand-wired power cables. Equip a Power Cable, click a node or a machine, then click a second one: the cable
// joins them. It is an explicit link on top of the automatic pole reach: a machine wired to a node joins that
// node's grid even beyond the pole reach, and a cable between two nodes (generator / pole) merges their grids.
// The records live in S.cables = [{ id, a, b }] (entity ids), so they save with the game. The host simulates them
// (power.js reads them), a guest draws the host's list and sends a command to wire or unwire.
// ---------------------------------------------------------------------------------------------------
export const CABLE_BASE_LEN = 25;     // metres; Grid Range (and anything else that raises the pole link) lengthens it by the same amount
export const cableMax = (T) => CABLE_BASE_LEN + Math.max(0, ((T && T.poleLink) || 14) - 14);
const NODE = new Set(['gen', 'pole', 'switch', 'battery', 'breaker']);   // switch, battery and breaker: the power parts of powerparts.js
const CONSUMER = new Set(['belt', 'sorter', 'mech', 'fan', 'charger', 'claw', 'borer', 'beacon', 'meter']);
export const isNodeType = (type) => NODE.has(type);
export const wireable = (e) => !!e && (NODE.has(e.type) || CONSUMER.has(e.type) || isEarth(e.type));
export function wireName(e) {
  if (!e) return 'something';
  if (e.type === 'belt') return e.detector ? 'Detector Gate' : e.splitter ? 'Belt Splitter' : 'Belt';
  if (e.type === 'fan') return e.mounted ? 'Support Fan' : 'Vent Fan';
  if (isEarth(e.type)) return EARTH[e.type].name;
  if (isPart(e.type)) return partName(e);
  return ({ gen: 'Generator', pole: 'Power Pole', sorter: 'Sorting Box', mech: 'Mech Scooper', charger: 'Charging Station', claw: 'Claw Rig', borer: 'Tunnel Borer', beacon: 'Depot Beacon' })[e.type] || e.type;
}

const SEGS = 12;
const MAXSEG = 6000;
const GREEN = new THREE.Color(0.25, 1.6, 0.5), ORANGE = new THREE.Color(2.4, 1.05, 0.2), RED = new THREE.Color(2.4, 0.22, 0.18), WHITE = new THREE.Color(0.9, 1.2, 1.7);
export const stateOf = (pw) => ((pw ?? 0) >= 0.95 ? 'green' : (pw ?? 0) > 0.05 ? 'orange' : 'red');
const stateColor = (s) => (s === 'green' ? GREEN : s === 'orange' ? ORANGE : RED);

export class Cables {
  constructor(game) {
    this.game = game;
    this.from = null;           // the entity id a wire is being pulled from (local to this player)
    this.netDirty = false;
    this.t = 0;
    this.hold = 0;              // seconds a result message (wired / removed) stays on screen before the aiming hint takes over
    this.drawDirty = true;
    this.preview = null;        // { a: [x,y,z], b: [x,y,z], state }
    const geo = new THREE.CylinderGeometry(0.022, 0.022, 1, 5);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAXSEG);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.setColorAt(0, GREEN);
    this.pmesh = new THREE.InstancedMesh(geo, mat.clone(), 40);
    this.pmesh.frustumCulled = false; this.pmesh.count = 0; this.pmesh.setColorAt(0, WHITE);
    game.renderer.scene.add(this.mesh); game.renderer.scene.add(this.pmesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._d = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
    this.segCount = 0;
  }

  // ---------------------------------------------------------------- records
  list() { const S = this.game.S; if (!Array.isArray(S.cables)) S.cables = []; return S.cables; }
  ent(id) { const g = this.game; const t = g.logi.byId.get(id); if (t) return t; const it = g.machines.items.get(id); return it ? it.ent : null; }
  rec(id) { return this.list().find((c) => c.id === id) || null; }
  find(a, b) { return this.list().find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a)) || null; }
  of(id) { return this.list().filter((c) => c.a === id || c.b === id); }
  // cables with both ends standing: [{ rec, A, B }]
  live() { const out = []; for (const rec of this.list()) { const A = this.ent(rec.a), B = this.ent(rec.b); if (A && B) out.push({ rec, A, B }); } return out; }
  other(rec, id) { return rec.a === id ? rec.b : rec.a; }
  attach(e) { const p = this.game.power.pos(e); return [p[0], p[1] + 0.1, p[2]]; }
  lengthBetween(A, B) { const a = this.attach(A), b = this.attach(B); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
  max() { return cableMax(this.game.T); }
  length(rec) { const A = this.ent(rec.a), B = this.ent(rec.b); return A && B ? this.lengthBetween(A, B) : 0; }

  get wiring() { return this.from != null; }

  // ---------------------------------------------------------------- host: make / break cables
  // Wires a to b, or takes the cable between them away when one already runs there. Returns { ok, why, removed, rec, len }.
  connect(aId, bId) {
    const g = this.game, S = g.S;
    const A = this.ent(aId), B = this.ent(bId);
    if (!A || !B) return { ok: false, why: 'That object is gone' };
    if (aId === bId) return { ok: false, why: 'Pick a second object to wire it to' };
    if (!wireable(A) || !wireable(B)) return { ok: false, why: 'A cable only joins generators, poles and machines that use power' };
    const ex = this.find(aId, bId);
    if (ex) { this.remove(ex.id, true); return { ok: true, removed: true, a: A, b: B }; }
    { const why = wireCheck(A, B); if (why) return { ok: false, why }; }
    for (const E of [A, B]) { const lim = maxPorts(E, g); if (this.of(E.id).length >= lim) return { ok: false, why: `${wireName(E)} has no free cable port (it takes ${lim})` }; }
    const len = this.lengthBetween(A, B), max = this.max();
    if (len > max + 1e-6) return { ok: false, why: `Too far: ${len.toFixed(1)} m, a cable is ${max.toFixed(0)} m at most` };
    if (!((S.items.cable || 0) > 0)) return { ok: false, why: 'You have no Power Cable left' };
    S.items.cable--; if (S.items.cable <= 0) delete S.items.cable;
    const rec = { id: g.nextId(), a: aId, b: bId };
    this.list().push(rec);
    S.stats.cables = (S.stats.cables || 0) + 1;
    this.changed();
    g.rebuildTools();
    return { ok: true, rec, len, a: A, b: B };
  }

  remove(id, refund) {
    const list = this.list(), n = list.findIndex((c) => c.id === id);
    if (n < 0) return false;
    list.splice(n, 1);
    if (refund) this.game.giveItem('cable');
    this.changed();
    return true;
  }

  // an object went away: its cables go with it (and come back as items when you took it down yourself)
  detach(entId, refund) { for (const c of this.of(entId)) this.remove(c.id, refund); }

  // drop cables whose end no longer stands (a collapse can destroy a machine without anyone taking it down)
  prune() { for (const c of [...this.list()]) if (!this.ent(c.a) || !this.ent(c.b)) this.remove(c.id, false); }

  changed() {
    const g = this.game;
    this.netDirty = true; this.drawDirty = true;
    if (!g.isGuest()) { g.power.markDirty(); g.power.recompute(); }
  }

  reset() { this.hold = 0; this.from = null; this.preview = null; this.netDirty = false; this.drawDirty = true; this.mesh.count = 0; this.pmesh.count = 0; }
  clear() { this.reset(); }

  // a guest takes the host's list
  applyList(list) {
    const S = this.game.S, old = new Map((S.cables || []).map((c) => [c.id, c]));
    S.cables = (Array.isArray(list) ? list : []).map((c) => { const o = old.get(c.id); return { id: c.id, a: c.a, b: c.b, pw: o ? o.pw : 0 }; });
    this.drawDirty = true;
  }
  // power states from the host (flat [id, percent, ...])
  applyPw(a) { for (let n = 0; n + 1 < a.length; n += 2) { const r = this.rec(a[n]); if (r) r.pw = a[n + 1] / 100; } this.drawDirty = true; }
  pwRows() { const out = []; for (const { rec, A, B } of this.live()) out.push(rec.id, Math.round(Math.max(A.pw || 0, B.pw || 0) * 100)); return out; }
  pwOf(rec) { if (this.game.isGuest()) return rec.pw || 0; const A = this.ent(rec.a), B = this.ent(rec.b); return Math.max((A && A.pw) || 0, (B && B.pw) || 0); }

  // ---------------------------------------------------------------- the wire shape
  curve(a, b, n = SEGS) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const sag = Math.min(1.6, 0.05 + 0.045 * len), pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      pts.push([a[0] + (b[0] - a[0]) * u, Math.max(0.03, a[1] + (b[1] - a[1]) * u - sag * 4 * u * (1 - u)), a[2] + (b[2] - a[2]) * u]);
    }
    return pts;
  }

  // the nearest cable under the crosshair: its wire, not its two ends (those belong to the machines they hang on). { id, t } or null
  hit(eye, dir, maxD = 5, maxT = Infinity) {
    let best = null;
    const ox = eye.x, oy = eye.y, oz = eye.z, dx = dir.x, dy = dir.y, dz = dir.z;
    for (const { rec, A, B } of this.live()) {
      const a = this.attach(A), b = this.attach(B), len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const endEx = Math.min(1.4, len * 0.3);   // the stretch next to a machine belongs to the machine
      const pts = this.curve(a, b);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i], p1 = pts[i + 1];
        // closest approach between the ray and this piece of wire
        const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], wx = ox - p0[0], wy = oy - p0[1], wz = oz - p0[2];
        const aa = ux * ux + uy * uy + uz * uz, bb = ux * dx + uy * dy + uz * dz, cc = dx * dx + dy * dy + dz * dz, dd = ux * wx + uy * wy + uz * wz, ee = dx * wx + dy * wy + dz * wz;
        const den = aa * cc - bb * bb; let s = den > 1e-9 ? (cc * dd - bb * ee) / den : 0; s = Math.max(0, Math.min(1, s));
        const t = (bb * s - ee) / cc; if (t < 0.2) continue;
        const qx = p0[0] + ux * s, qy = p0[1] + uy * s, qz = p0[2] + uz * s;
        const rx = ox + dx * t - qx, ry = oy + dy * t - qy, rz = oz + dz * t - qz;
        if (rx * rx + ry * ry + rz * rz > 0.15 * 0.15 || t > maxD || t > maxT) continue;
        if (Math.hypot(qx - a[0], qy - a[1], qz - a[2]) < endEx || Math.hypot(qx - b[0], qy - b[1], qz - b[2]) < endEx) continue;
        if (!best || t < best.t) best = { id: rec.id, t };
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- what the crosshair is on
  findTarget(eye, dir, maxD = 8) {
    const g = this.game;
    const tile = g.logi.pick(eye, dir, maxD);
    if (tile) return wireable(tile) ? tile : null;
    let best = null, bd = maxD;
    for (const it of g.machines.items.values()) {
      const e = it.ent; if (!wireable(e)) continue;
      const em = isEarth(e.type);
      const x = em ? it.obj.position.x : (e.cx ?? e.px ?? e.x), y = em ? it.obj.position.y + e.hy : (e.y0 ?? e.y) + (e.h ? e.h / 2 : 0.5), z = em ? it.obj.position.z : (e.cz ?? e.pz ?? e.z);
      if (x === undefined) continue;
      const vx = x - eye.x, vy = y - eye.y, vz = z - eye.z, d = Math.hypot(vx, vy, vz);
      if (d > bd + (e.hr || 0) || (vx * dir.x + vy * dir.y + vz * dir.z) / (d || 1) < (e.hr ? 0.8 : 0.9)) continue;
      bd = d; best = e;
    }
    return best;
  }

  // where a free wire ends: the first solid thing along the crosshair, or a fixed reach into the air
  freePoint(eye, dir) {
    const w = this.game.world; let t = 0.5;
    for (; t < 40; t += 0.25) { const x = eye.x + dir.x * t, y = eye.y + dir.y * t, z = eye.z + dir.z * t; if (y < 0 || w.solid(toI(x), toJ(y), toK(z))) { t = Math.max(0.5, t - 0.25); break; } }
    return [eye.x + dir.x * t, Math.max(0.1, eye.y + dir.y * t), eye.z + dir.z * t];
  }

  // ---------------------------------------------------------------- the tool in your hand
  // called every frame while a Power Cable is out (and only then)
  aimUpdate(tool, eye, dir) {
    const g = this.game, ui = g.ui;
    g.plan = null; g.machines.setGhost(null); g.machines.showPreview(null, null); g.renderer.setGhost && g.renderer.setGhost(0);
    const tg = this.findTarget(eye, dir), max = this.max();
    const quiet = this.hold > 0;   // a result message is showing: do not paint over it
    const red = (s) => `<span style="color:#ff6a5a;font-weight:700">${s}</span>`;
    if (this.from == null) {
      this.preview = null;
      ui.setCross(!!tg);
      if (!quiet) ui.hint(tg ? `<kbd>Click</kbd> to start a wire from <b>${wireName(tg)}</b> (cables reach ${max.toFixed(0)} m) · <kbd>Q</kbd> put away` : `Power Cable: aim at a generator, pole or machine and click to start a wire. It will follow your crosshair · <kbd>Q</kbd> put away`, 0.4);
      return;
    }
    const A = this.ent(this.from);
    if (!A) { this.cancel(); return; }
    const a = this.attach(A);
    let b, len, state = 'green', msg;
    if (tg && tg.id !== this.from) {
      b = this.attach(tg); len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const ex = this.find(this.from, tg.id);
      if (ex) { state = 'orange'; msg = `<kbd>Click</kbd> to remove the cable to <b>${wireName(tg)}</b> (${len.toFixed(1)} m)`; }
      else if (len > max) { state = 'red'; msg = `${red(`Too far: ${len.toFixed(1)} m of ${max.toFixed(0)} m`)} · pick something closer to <b>${wireName(A)}</b>`; }
      else if (wireCheck(A, tg) || this.of(tg.id).length >= maxPorts(tg, g) || this.of(A.id).length >= maxPorts(A, g)) { state = 'red'; const full = this.of(tg.id).length >= maxPorts(tg, g) ? tg : A; msg = red(wireCheck(A, tg) || `${wireName(full)} has no free cable port (it takes ${maxPorts(full, g)})`); }
      else msg = `<kbd>Click</kbd> to attach to <b>${wireName(tg)}</b> · ${len.toFixed(1)} m of ${max.toFixed(0)} m`;
    } else {
      b = this.freePoint(eye, dir); len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (len > max) { state = 'red'; msg = `${red(`${len.toFixed(1)} m: too far`)} (${max.toFixed(0)} m at most) · aim at a generator, pole or machine`; }
      else msg = `Wire from <b>${wireName(A)}</b> · ${len.toFixed(1)} m of ${max.toFixed(0)} m · aim at a generator, pole or machine and click`;
    }
    this.preview = { a, b, state };
    ui.setCross(!!(tg && tg.id !== this.from && state !== 'red'));
    ui.hint(`${msg} · click empty air or <kbd>Q</kbd> to cancel`, 0.4);   // a wire in hand always shows its live readout
  }

  // left click / B with the cable out
  click(tool) {
    const g = this.game, ui = g.ui, eye = g.renderer.camera.position, dir = g.player.forward(new THREE.Vector3());
    const tg = this.findTarget(eye, dir);
    if (this.from == null) {
      if (!tg) { g.sound.error(); ui.hint('Aim at a generator, pole or machine that uses power, then click to start the wire.', 3); return; }
      this.from = tg.id; this.preview = null;
      g.sound.tone('sine', 520, 760, 0.07, 0.06);
      ui.hint(`Wire started at <b>${wireName(tg)}</b>. Click a generator, pole or machine to attach it. Click empty air or <kbd>Q</kbd> to cancel.`, 4);
      return;
    }
    const A = this.ent(this.from);
    if (!A) { this.cancel(); return; }
    if (!tg || tg.id === this.from) { this.cancel(tg ? 'Wire dropped: pick a second object next time.' : 'Wire cancelled.'); return; }
    const len = this.lengthBetween(A, tg), max = this.max(), ex = this.find(this.from, tg.id);
    if (!ex && len > max + 1e-6) { g.sound.error(); ui.hint(`<span style="color:#ff6a5a;font-weight:700">Too far: ${len.toFixed(1)} m of ${max.toFixed(0)} m.</span> Pick something closer, or click empty air to cancel.`, 3); return; }
    if (!ex && !((g.S.items.cable || 0) > 0)) { g.sound.error(); ui.hint('You have no Power Cable left.', 3); this.cancel(); return; }
    const aId = this.from, bId = tg.id;
    this.from = null; this.preview = null;
    if (g.isGuest()) { g.cmd('cable', { a: aId, b: bId }); g.sound.place(); return; }
    this.report(this.connect(aId, bId), true);
  }

  // the result of a connect(), told to whoever pressed the button
  report(r, local) {
    const g = this.game;
    let text, good = true;
    if (!r.ok) { good = false; text = r.why; }
    else if (r.removed) text = `Cable removed between ${wireName(r.a)} and ${wireName(r.b)}. You got the cable back.`;
    else {
      const pw = Math.max(r.a.pw || 0, r.b.pw || 0);
      text = `Wired <b>${wireName(r.a)}</b> to <b>${wireName(r.b)}</b> (${r.len.toFixed(1)} m). ${pw > 0.05 ? `Powered ${Math.round(pw * 100)}%.` : 'No power on that grid yet: it needs a generator with fuel.'}`;
    }
    if (local) { if (good) g.sound.place(); else g.sound.error(); g.ui.hint(text, 4); this.hold = 3; }
    else g.netSend({ t: 'chint', text, good });
  }

  cancel(msg) {
    this.from = null; this.preview = null;
    if (msg !== undefined && msg !== null && msg !== false) this.game.ui.hint(msg || 'Wire cancelled.', 2);
  }

  // ---------------------------------------------------------------- frame update: housekeeping, sync, drawing
  update(dt) {
    const g = this.game;
    if (this.from != null) {
      const t = g.curTool && g.curTool();
      if (g.stowed || !t || t.kind !== 'cable' || !this.ent(this.from)) this.cancel();
    }
    if (this.from == null && this.preview) this.preview = null;
    this.hold = Math.max(0, this.hold - dt);
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.4;
      if (!g.isGuest()) this.prune();
      this.drawDirty = true;
    }
    if (this.netDirty) { this.netDirty = false; if (g.net.open && g.net.role === 'host') g.netSend({ t: 'cables', list: this.list().map((c) => ({ id: c.id, a: c.a, b: c.b })) }); }
    if (this.drawDirty) { this.drawDirty = false; this.redraw(); }
    this.drawPreview();
  }

  segInto(mesh, n, p0, p1, color) {
    const m = this._m, q = this._q, v = this._v, d = this._d;
    d.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]); const l = d.length(); if (l < 1e-4) return n;
    d.multiplyScalar(1 / l); q.setFromUnitVectors(this._up, d); v.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2); this._s.set(1, l, 1);
    m.compose(v, q, this._s); mesh.setMatrixAt(n, m); mesh.setColorAt(n, color);
    return n + 1;
  }

  redraw() {
    let n = 0;
    for (const { rec, A, B } of this.live()) {
      const col = stateColor(stateOf(this.pwOf(rec)));
      const pts = this.curve(this.attach(A), this.attach(B));
      for (let i = 0; i < pts.length - 1 && n < MAXSEG; i++) n = this.segInto(this.mesh, n, pts[i], pts[i + 1], col);
    }
    this.mesh.count = n; this.segCount = n;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  drawPreview() {
    const pm = this.pmesh;
    if (!this.preview) { pm.count = 0; return; }
    const { a, b, state } = this.preview; const pts = this.curve(a, b, 14), col = state === 'red' ? RED : state === 'orange' ? ORANGE : WHITE;
    let n = 0; for (let i = 0; i < pts.length - 1; i++) n = this.segInto(pm, n, pts[i], pts[i + 1], col);
    pm.count = n; pm.instanceMatrix.needsUpdate = true; if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- hover readout
  describe(rec) {
    const A = this.ent(rec.a), B = this.ent(rec.b); if (!A || !B) return null;
    const pw = this.pwOf(rec), len = this.lengthBetween(A, B), st = stateOf(pw);
    return { title: 'POWER CABLE' + (st === 'green' ? ' · LIVE' : st === 'orange' ? ' · WEAK' : ' · DEAD'), lit: st !== 'red', lines: [`${wireName(A)} to ${wireName(B)}, ${len.toFixed(1)} m of ${this.max().toFixed(0)} m`, st === 'red' ? 'No power on this grid: it needs a generator with fuel' : `Carrying ${Math.round(pw * 100)}% of the grid`, 'Hammer it, or press X, to take it down (you get the cable back). A Power Cable tool click on both ends again also removes it.'] };
  }
  // extra lines for any object a cable touches: the source of its power, readable on both screens
  infoLines(e) {
    if (!e || !wireable(e)) return [];
    const mine = this.of(e.id); if (!mine.length) return [];
    const out = [];
    const names = mine.map((c) => { const o = this.ent(this.other(c, e.id)); return o ? `${wireName(o)} (${this.length(c).toFixed(1)} m)` : null; }).filter(Boolean);
    if (isNodeType(e.type)) out.push(`Cables: ${names.join(', ')}`);
    else {
      const on = mine.find((c) => this.pwOf(c) > 0.05);
      const src = on ? this.ent(this.other(on, e.id)) : null;
      out.push(on ? `Powered by cable from ${wireName(src)}${names.length > 1 ? ` (${names.length} cables)` : ''}` : `Cable to ${names.join(', ')}: no power reaches it yet`);
    }
    return out;
  }
}
