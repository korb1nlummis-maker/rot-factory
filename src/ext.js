// Runtime half of the catalog (Wave 0): everything that needs a live game. game.js, machines.js and info.js call into this file with
// one line each, so later waves add behavior through catalog_*.js handlers and never touch those shared files again.
// See catalog.js for the handler contract.
import { TYPES, REJECT, catalogType, TRANSIENT } from './catalog.js';

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// ---------- finding an ent by id (belt like tiles live in logi, everything else in machines) ----------
export function entById(g, id) {
  const t = g.logi.byId.get(id); if (t) return t;
  const it = g.machines.items.get(id); return it ? it.ent : null;
}

// the ent under the crosshair that has catalog handlers or a copyable config (tiles first, then machines), or null
export function aimedEnt(g) {
  const eye = g.renderer.camera.position, dir = g.player.forward(g._extDir || (g._extDir = eye.clone()));
  const tile = g.logi.pick(eye, dir, 3.4);
  if (tile) return TYPES[tile.type] ? tile : null;
  let best = null, bd = 3.4;
  for (const it of g.machines.items.values()) {
    const e = it.ent; if (!TYPES[e.type]) continue;
    const x = e.cx ?? e.px ?? e.x, y = (e.y0 ?? e.y ?? 0) + (e.h ? e.h / 2 : 0.5), z = e.cz ?? e.pz ?? e.z; if (x === undefined) continue;
    const v = eye.clone().set(x - eye.x, y - eye.y, z - eye.z), d = v.length(); if (d > bd + (e.hr || 0) || (d > 0.1 && v.normalize().dot(dir) < (e.hr ? 0.8 : 0.9))) continue; bd = d; best = e;
  }
  return best;
}

// ---------- cfg: the one guest-safe way to change a placed thing's settings ----------
export function cfgSpec(ent) { const h = TYPES[ent.type]; if (!h || !h.cfg) return null; return typeof h.cfg === 'function' ? h.cfg(ent) : h.cfg; }

// validate a patch against the whitelist. Any unknown key or bad value rejects the WHOLE patch (nothing is half applied).
export function validateCfg(ent, patch) {
  const spec = cfgSpec(ent); if (!spec) return { ok: false, why: 'This has no settings' };
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, why: 'Bad settings' };
  const keys = Object.keys(patch); if (!keys.length || keys.length > 32) return { ok: false, why: 'Bad settings' };
  const clean = {};
  for (const k of keys) {
    if (!hasOwn(spec, k)) return { ok: false, why: `Unknown setting ${String(k).slice(0, 24)}` };
    const v = spec[k](patch[k]); if (v === REJECT || v === undefined) return { ok: false, why: `Bad value for ${k}` };
    clean[k] = v;
  }
  return { ok: true, clean };
}

// host: validate, apply, tell guests (ent- then ent+). actor 'host' or 'guest'. Returns { ok, why }.
export function applyCfg(g, id, patch, actor = 'host') {
  const ent = entById(g, id); if (!ent) return { ok: false, why: 'That is gone' };
  const v = validateCfg(ent, patch); if (!v.ok) return v;
  const h = TYPES[ent.type];
  if (h.check) { const why = h.check(g, ent, v.clean, actor); if (why) return { ok: false, why }; }
  const old = {}; for (const k of Object.keys(v.clean)) old[k] = ent[k];
  Object.assign(ent, v.clean);
  if (h.onCfg) h.onCfg(g, ent, v.clean, old);
  g.power.markDirty();
  g.netSend({ t: 'ent-', id: ent.id }); g.netSend({ t: 'ent+', ent: g.stripEnt(ent) });
  return { ok: true, clean: v.clean };
}

// anyone: a host applies it, a guest asks the host with the `cfg` command. Returns { ok, why } (a guest gets ok true once it has asked).
export function setCfg(g, ent, patch) {
  const id = typeof ent === 'object' ? ent.id : ent;
  if (g.isGuest()) { const e = entById(g, id); const v = e ? validateCfg(e, patch) : { ok: false, why: 'That is gone' }; if (!v.ok) return v; g.cmd('cfg', { id, patch: v.clean }); return { ok: true, clean: v.clean }; }
  return applyCfg(g, id, patch, 'host');
}

// host side of the guest `cfg` command: reports a refusal back as a toast
export function runCfgCmd(g, d) {
  if (!d || typeof d !== 'object') return;
  const r = applyCfg(g, d.id, d.patch, 'guest');
  if (!r.ok) g.netSend({ t: 'toast', icon: '⚠️', title: 'Could not change that', text: String(r.why || 'Refused').slice(0, 80) });
}

// ---------- copy / paste settings (Shift+E on the source, E on a target) ----------
export function copyKeys(ent) { const h = TYPES[ent.type]; if (!h) return null; const spec = cfgSpec(ent); if (!spec) return null; return h.copy || Object.keys(spec); }

export function copyCfg(g, ent) {
  const keys = copyKeys(ent); if (!keys || !keys.length) return null;
  const vals = {}; for (const k of keys) if (ent[k] !== undefined) vals[k] = JSON.parse(JSON.stringify(ent[k]));
  g.cfgClip = { type: ent.type, group: TYPES[ent.type].group || ent.type, vals };
  return g.cfgClip;
}

export function pasteCfg(g, ent) {
  const c = g.cfgClip; if (!c) return { ok: false, why: 'Nothing copied. Shift+E on a machine copies its settings.' };
  const h = TYPES[ent.type]; if (!h || (h.group || ent.type) !== c.group) return { ok: false, why: 'Those settings belong to a different kind of machine' };
  const keys = copyKeys(ent) || []; const vals = {}; for (const k of keys) if (c.vals[k] !== undefined) vals[k] = JSON.parse(JSON.stringify(c.vals[k]));
  if (!Object.keys(vals).length) return { ok: false, why: 'Nothing to paste' };
  return setCfg(g, ent, vals);
}

// Shift+E. Returns true when it did something (so the plain E "use" is skipped).
export function copyKey(g) {
  const e = aimedEnt(g);
  if (e && copyKeys(e)) {
    if (!copyCfg(g, e)) return false;
    g.ui.hint(`Settings copied from <b>${String(e.type).toUpperCase()}</b>. Aim at another and press <kbd>E</kbd> to paste, <kbd>Shift</kbd>+<kbd>E</kbd> at nothing to drop them.`, 4); g.sound.tone('triangle', 700, 900, 0.08, 0.06); return true;
  }
  if (!e && g.cfgClip) { g.cfgClip = null; g.ui.hint('Copied settings dropped.', 2); return true; }
  return false;
}

// E: a held clipboard pastes into a matching target; otherwise the type's own use() runs. Returns true when handled.
export function useKey(g) {
  const e = aimedEnt(g); if (!e) return false;
  if (g.cfgClip && (TYPES[e.type].group || e.type) === g.cfgClip.group && copyKeys(e)) {
    const r = pasteCfg(g, e);
    if (r.ok) { g.sound.place(); g.ui.hint('Settings pasted.', 2); } else { g.sound.error(); g.ui.hint(r.why || 'Could not paste', 2.5); }
    return true;
  }
  const h = TYPES[e.type];
  return !!(h.use && h.use(g, e) === true);
}

// ---------- placing ----------
// Host side entry for every catalog type. fields must contain what addEntity needs (i, j, k, dir for tiles; x, y, z for machines).
export function placeEntity(g, type, fields = {}, opts = {}) {
  if (g.isGuest()) return null;   // a guest asks through the `place` command instead
  const ent = { ...fields, id: g.nextId(), type };
  g.S.entities.push(ent);
  g.addEntity(ent);   // tiles go through logi.add, everything else through machines.add; both announce ent+ to a guest
  g.power.markDirty();
  if (!opts.quiet) { g.S.stats.built = (g.S.stats.built || 0) + 1; g.sound.place(); }
  if (opts.rebuild !== false) g.rebuildTools();
  return ent;
}

// aim step: returns { plan, cost } or null when the tool kind is not a catalog tool
export function planTool(g, tool, eye, dir, yaw) { const h = catalogType(tool.kind); if (!h || !h.plan) return null; return h.plan(g, tool, eye, dir, yaw); }
export function isCatalogTool(kind) { const h = catalogType(kind); return !!(h && h.plan); }
export function previewTool(g, tool, plan) {
  const h = catalogType(tool.kind);
  if (h && h.preview) { h.preview(g, tool, plan); return; }
  const e = plan && plan.ent;
  if (e && Number.isFinite(e.i) && Number.isFinite(e.j) && Number.isFinite(e.k)) g.showCellGhost(tool, plan); else g.machines.showPreview(null, null);
}
export function conflictTool(g, tool, e) { const h = catalogType(tool.kind); return h && h.conflict ? h.conflict(g, e, tool) : null; }
// placeCurrent step after the item was taken: returns the new ent, or null
export function buildTool(g, tool, planEnt) {
  const h = catalogType(tool.kind); if (!h || !h.build) return null;
  const f = h.build(g, tool, planEnt); if (!f || !f.type) return null;
  const { type, id: _ignored, ...rest } = f;
  return placeEntity(g, type, rest);
}

// what the hammer hands back for a catalog ent (or undefined)
export function itemOf(ent) { const h = TYPES[ent.type]; return h && h.item ? h.item(ent) : undefined; }
export function removed(g, ent) { const h = TYPES[ent.type]; if (h && h.onRemove) h.onRemove(g, ent); }

// ---------- readouts ----------
export function infoReplace(g, ent, ref) { const h = TYPES[ent.type]; return h && h.info ? h.info(g, ent, ref) : null; }
export function infoExtra(g, ent) { const h = TYPES[ent.type]; if (!h || !h.infoExtra) return []; const l = h.infoExtra(g, ent); return Array.isArray(l) ? l.filter(Boolean) : []; }

// ---------- the update loop and the 0.5 s guest rows ----------
export function update(g, dt, guest) {
  for (const h of Object.values(TYPES)) { const f = guest ? h.guestTick : h.tick; if (f) f(g, dt); }
  if (guest || !g.net.open || g.net.role !== 'host') return;
  g._extRow = (g._extRow || 0) - dt;
  if (g._extRow > 0) return;
  g._extRow = 0.5;
  for (const [k, h] of Object.entries(TYPES)) { if (!h.row) continue; const d = h.row(g); if (d != null) g.netSend({ t: 'xrow', k, d }); }
}
export function guestRow(g, k, d) { const h = TYPES[k]; if (h && h.guestRow) h.guestRow(g, d); }

export { TRANSIENT };
