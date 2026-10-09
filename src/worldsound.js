// Small helpers that give game.js's world sounds a place to come from (spatial.js does the distance, pan, muffling and voice limits).
import * as BINS from './bins.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// where a bin rings: the SORT bin or the depot with this id; a bin id that is gone, or none, is the SORT bin
export function binSpot(g, bin) {
  let b = null;
  try { b = Number.isInteger(bin) && bin > 0 ? BINS.binById(g, bin) : null; } catch (x) { b = null; }
  const p = b || g.hall.binPos;
  return { x: p.x, y: (p.y || 0) + 1.2, z: p.z };
}

// the coin of an automatic sale (belts, carts, bots, rigs, rail, trucks): heard from the bin, so a rig selling deep in a tunnel is silent.
// The host also tells the guest where it rang (at most every 0.12 s, like its own coin) and the guest hears it from its own spot.
export function saleCoin(g, p) {
  // the message to the guest is limited to one per 0.12 s of its own, whoever hears the coin here (a coin nobody hears must not take the slot of one that rings)
  if (g.net && g.net.open && g.net.role === 'host' && !(g._saleMsgAt > g.time)) { g._saleMsgAt = g.time + 0.12; g.netSend({ t: 'sale', fb: 1, x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) }); }
  if (g.coinCd > 0) return false;
  const s = g.sound.at(p.x, p.y, p.z, 'coin');
  if (!s.audible) return false;   // too far or capped: no coin, and no cooldown, so the next sale (maybe next to you) can still ring
  g.coinCd = 0.12;   // one coin per 0.12 s, like before
  s.coin(0);
  return true;
}

// guest side of that message: a sane position in the hall counts (a message without one, from an older host, rings from the SORT bin), and the same falloff applies from the guest's own spot
export function saleHear(g, m) {
  let x = num(m && m.x), y = num(m && m.y), z = num(m && m.z);
  if (x === null || y === null || z === null) { const b = binSpot(g, -1); x = b.x; y = b.y; z = b.z; }
  else if (Math.abs(x) > 6000 || Math.abs(z) > 6000 || y < -5 || y > 60) return false;
  if (g.coinCd > 0) return false;
  const s = g.sound.at(x, y, z, 'coin'); if (!s.audible) return false;
  g.coinCd = 0.12;
  s.coin(0);
  return true;
}

// the sound of something a person just did: your own at full volume, your friend's (the host runs what a guest builds) from where it happened
export function actSound(g, e, cls = 'work') {
  if (!g._forGuest && g._actor !== 'g') return g.sound;
  let x = num(e && (e.x ?? e.cx)), y = num(e && (e.y ?? e.y0)), z = num(e && (e.z ?? e.cz));
  if (x === null || z === null) { const rp = g.remote && g.remote.pos; if (!rp) return g.sound.at(1e6, 0, 1e6, cls); x = rp.x; y = rp.y; z = rp.z; }
  return g.sound.at(x, y === null ? 0.5 : y, z, cls);
}

// ---------------------------------------------------------------- your friend, heard from where they are
// a footstep every ~1.8 m they cover on foot (the 'pos' messages come about ten times a second), quiet, from their feet
export function partnerStep(g, m) {
  const x = num(m && m.x), y = num(m && m.y), z = num(m && m.z); if (x === null || y === null || z === null) return;
  const r = g._rstep || (g._rstep = { x, y, z, acc: 0 });
  const d = Math.hypot(x - r.x, z - r.z), dy = Math.abs(y - r.y);
  r.x = x; r.y = y; r.z = z;
  if (d > 6 || dy > 1.2) { r.acc = 0; return; }   // a teleport or a fall is not walking
  r.acc += d;
  if (r.acc < 1.8) return;
  r.acc = 0;
  const s = g.sound.at(x, y + 0.1, z, 'step');
  if (!s.audible) return;
  if (y > 0.45) { s.step(0.06); } else s.stepConcrete(0.05);
}

// a plush your friend threw (the 'spawn' message carries where it left their hands)
export function partnerThrow(g, a) {
  if (!Array.isArray(a)) return;
  const x = num(+a[2]), y = num(+a[3]), z = num(+a[4]); if (x === null || y === null || z === null) return;
  const s = g.sound.at(x, y, z, 'throw');
  if (s.audible) s.whoosh(0.1);
}
