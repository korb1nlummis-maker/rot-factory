import { escHtml } from './util.js';
import { C, toI, toK, cellX, cellZ } from './config.js';
import { REMAINS, CACHE } from './plushdata.js';
import { workingAtMouth } from './remains.js';
import * as N from './notes.js';

// ---------------------------------------------------------------------------------------------
// The notebook: how the notes (notes.js) live in the game. Each player has their own journal (S.notes for the worker notes, S.papers for every other paper,
// both saved), but a clue either partner reads is announced and kept in the other's S.heard, and the journal's summary pieces together both. Bots and machines
// that dig beside remains or a supply cache flag it (S.nflags: a mark on the compass, a toast, a line in the crew panel) and stop short of it. A Bot Scholar
// carries a worker's remains home to the bin, where it lands in your journal.
// ---------------------------------------------------------------------------------------------

// Bot Scholar levels (the upgrade 'scholar'): how many notes a bot carries at once, and how far from it a note can be picked up (metres)
export const SCHOLAR = [null, { carry: 1, reach: 3 }, { carry: 2, reach: 4.5 }, { carry: 4, reach: 7 }];
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const dirName = (x, z) => DIRS[Math.round(N.bearingOf(x, z) / 45) % 8];
const WHAT = { remains: 'remains', cache: 'a supply cache' };
const isInt = Number.isInteger;
const plain = (s, n) => (typeof s === 'string' ? s : typeof s === 'number' && Number.isFinite(s) ? String(s) : '').replace(/[<>\u0000-\u001f]/g, ' ').slice(0, n);   // only text and numbers become text

// ---------------------------------------------------------------------------------------------
// The state a save carries
// ---------------------------------------------------------------------------------------------
export function validFlag(f) {
  return !!f && (f.what === 'remains' || f.what === 'cache') && isInt(f.i) && isInt(f.j) && isInt(f.k) && f.i >= 0 && f.k >= 0 && f.j >= 0 && f.j < 72;
}
export function ensure(S) {
  S.notes = (Array.isArray(S.notes) ? S.notes : []).filter((n) => n && typeof n === 'object');
  S.notes.forEach((n, q) => { if (!n.id) n.id = 'old:' + q; });
  const docs = (list, extra) => (Array.isArray(list) ? list : []).map((d) => { const c = N.cleanDoc(d); if (!c) return null; if (isInt(d.n)) c.n = d.n; if (extra && d.who) c.who = plain(d.who, 20); return c; }).filter(Boolean).slice(-400);   // (the newest 400: an opened find cannot be read again, so the oldest are what a long journal gives up, like S.heard does)
  S.papers = docs(S.papers);
  S.heard = docs(S.heard, true);
  S.clues = (Array.isArray(S.clues) ? S.clues : []).filter((c) => typeof c === 'string');
  S.nflags = (Array.isArray(S.nflags) ? S.nflags : []).filter(validFlag).map((f) => ({ what: f.what, i: f.i, j: f.j, k: f.k, by: plain(f.by, 24), t: Number.isFinite(f.t) ? f.t : 0 })).slice(0, 40);
  S.stats = S.stats || {};
  return S;
}
// the arrays exist (a full clean-up of what a save held is ensure(); this is only for what the game does while it runs)
export function init(S) {
  if (!Array.isArray(S.notes)) S.notes = [];
  if (!Array.isArray(S.papers)) S.papers = [];
  if (!Array.isArray(S.heard)) S.heard = [];
  if (!Array.isArray(S.nflags)) S.nflags = [];
  if (!Array.isArray(S.clues)) S.clues = [];
  return S;
}
const nextOrd = (S) => { let m = 0; for (const n of S.notes) m = Math.max(m, n.n || 0); for (const d of S.papers) m = Math.max(m, d.n || 0); for (const d of S.heard) m = Math.max(m, d.n || 0); return m + 1; };

// the clues this player can use: own papers, the ones heard from the partner, the paperwork
export function clues(g) { return N.cluesOf(g.S, g.world.seed, g.world.needle); }
export function summary(g) { return N.summarize(clues(g)); }

// a new paper, worker note or paperwork line reached the journal: update what depends on it
export function afterRead(g) {
  const S = g.S;
  try {
    const s = summary(g);
    if (s.bearing && s.bearing.w <= 10 && !s.conflict && !S.stats.piece5) S.stats.piece5 = 1;   // "pieced the bearing within 5 degrees": a range 10 degrees wide
  } catch (e) { /* the summary is only a help */ }
  if (g.ui && g.ui.openModal === 'journal') g.ui.renderJournal();
}

// ---------------------------------------------------------------------------------------------
// Entries (what the note window shows): { id, name, role, dist, text, reward, docs: [doc], worker: bool }
// ---------------------------------------------------------------------------------------------
export function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const docs = (Array.isArray(raw.docs) ? raw.docs : []).slice(0, 3).map(N.cleanDoc).filter(Boolean);
  const e = { id: plain(raw.id, 40) || 'x:' + plain(raw.name, 20), name: plain(raw.name, 60), role: plain(raw.role, 40), dist: Number.isFinite(raw.dist) ? Math.max(0, Math.min(20000, raw.dist)) : 0, text: plain(raw.text, 700), reward: plain(raw.reward, 300), docs, worker: raw.worker === undefined ? !!raw.role : !!raw.worker };
  if (!e.name && !docs.length) return null;
  return e;
}

// add what an entry holds to MY journal. Returns the docs that were new. announce: tell the partner about any clue in them.
export function receive(g, entry, announce = true) {
  const S = g.S, fresh = [];
  init(S);
  if (entry.worker && !S.notes.some((n) => n.id === entry.id)) {
    S.notes.push({ id: entry.id, name: entry.name, role: entry.role, dist: entry.dist, text: entry.text, reward: entry.reward, n: nextOrd(S) });
  }
  for (const d of entry.docs || []) {
    if (S.papers.some((p) => p.id === d.id)) continue;
    const c = { ...d, n: nextOrd(S) }; if (!c.from && entry.name) c.from = entry.name;
    S.papers.push(c); fresh.push(c);
  }
  if (announce && !g.isGuest()) for (const d of fresh) if (d.clue) g.netSend({ t: 'nclue', who: g.myName(), doc: d });
  afterRead(g);
  return fresh;
}
// a clue the partner read: keep it (it is true for both of us), and say so
export function heard(g, doc, who, quiet = false) {
  const S = g.S; init(S);
  const c = N.cleanDoc(doc); if (!c || !c.clue) return false;
  if (!N.clueHolds(c.clue, N.truthOf(g.world.needle))) return false;   // a clue that is false is not kept
  if (S.heard.some((p) => p.id === c.id) || S.papers.some((p) => p.id === c.id)) return false;
  c.who = plain(who || 'Your friend', 20); c.n = nextOrd(S);
  S.heard.push(c); if (S.heard.length > 400) S.heard.shift();
  if (!quiet) g.ui.toast({ icon: N.KINDS[c.kind].icon, title: `${escHtml(c.who)} found a ${N.KINDS[c.kind].name.toLowerCase()}`, text: escHtml(c.text), ms: 9000 });
  afterRead(g);
  return true;
}
export function paperworkAdded(g) { afterRead(g); }   // a line of beacon paperwork reached S.clues

// the line shown under a note: what the journal makes of everything so far
export function sumLine(g) {
  const s = summary(g);
  if (!s.n) return '';
  const rows = N.describeSummary(s).filter((r) => !/unknown/.test(r));
  return rows.length ? `Pieced together so far: ${rows.join(', ')}.` : '';
}

// ---------------------------------------------------------------------------------------------
// Where the paper comes from
// ---------------------------------------------------------------------------------------------
const bayDist = (i, k) => Math.hypot(cellX(i), cellZ(k));
export function remainsDoc(g, i, j, k, worker) {
  const d = N.makeDoc(g.world.seed, g.world.needle, { source: 'remains', key: [i, j, k], dist: bayDist(i, k), role: worker.role.id });
  if (d) d.from = `Remains of ${worker.name}`;
  return d;
}
export function cacheDoc(g, i, j, k) {
  const d = N.makeDoc(g.world.seed, g.world.needle, { source: 'cache', key: [i, j, k], dist: bayDist(i, k) });
  if (d) d.from = 'A supply cache';
  return d;
}
// taking down the barricade at the mouth of an old working turns up the notice pinned to it (once per working)
export function mouthDoc(g, i, j, k) {
  const w = workingAtMouth(g.world.seed, i, j, k); if (!w) return null;
  const d = N.makeDoc(g.world.seed, g.world.needle, { source: 'working', key: [w.i0, w.k0, w.dir], dist: bayDist(w.i0, w.k0) });
  if (d) d.from = 'Pinned to an old barricade';
  return d;
}
const BEACON_BLOCK = 400;   // metres
export function beaconDoc(g, ent) {
  const dist = Math.hypot(ent.x, ent.z);
  if (dist < 600) return null;
  for (const o of g.S.entities) if (o.type === 'beacon' && o.id !== ent.id && Math.hypot(o.x - ent.x, o.z - ent.z) < 400) return null;   // one relay message per set of depots, not per depot
  // the roll belongs to a 400 m block of the hall, not to the exact cell: lifting a depot and setting it down one cell over is the same place and the same message
  const bx = Math.round(ent.x / BEACON_BLOCK), bz = Math.round(ent.z / BEACON_BLOCK);
  const d = N.makeDoc(g.world.seed, g.world.needle, { source: 'beacon', key: [bx, 0, bz], dist: Math.max(600, Math.hypot(bx * BEACON_BLOCK, bz * BEACON_BLOCK)) });
  if (d) d.from = 'Depot relay';
  return d;
}
// a rare plush's tag (Legendary and Mythic) sometimes holds a torn photograph. The place is a 96 m block of the hall (a, b, c count cells, in steps of PLUSH_BLOCK): the roll
// belongs to the block, so throwing a rare plush down and picking it up again one cell over, or forging a tag from the friend's side, gives the same answer and nothing new.
export const PLUSH_BLOCK = 160;
const blockOf = (cells) => Math.round(cells / PLUSH_BLOCK) * PLUSH_BLOCK;
export function plushDocAt(g, d) {
  const a = d.a | 0, b = d.b | 0, c = d.c | 0, rarity = d.r | 0;
  if (rarity < 4) return null;
  const doc = N.makeDoc(g.world.seed, g.world.needle, { source: 'plush', key: [a, b, c], dist: Math.hypot(a * C, c * C), p: rarity >= 5 ? 0.35 : 0.08 });
  if (doc) doc.from = 'Tucked in a tag';
  return doc;
}
export const plushKey = (rarity, x, y, z) => ({ a: blockOf(x / C), b: blockOf(y / C), c: blockOf(z / C), r: rarity });
export function plushOk(g, d) {
  if (!d || ![d.a, d.b, d.c].every(isInt) || (d.r !== 4 && d.r !== 5)) return false;
  if (d.a % PLUSH_BLOCK !== 0 || d.b % PLUSH_BLOCK !== 0 || d.c % PLUSH_BLOCK !== 0) return false;   // only a block of the lattice: any other cell would be a new roll
  if (Math.abs(d.a * C) > 5000 || Math.abs(d.c * C) > 5000 || d.b < 0 || d.b > 80) return false;
  const rp = g.remote && g.remote.pos; if (!rp || Math.abs(d.a * C - rp.x) > PLUSH_BLOCK * C * 0.5 + 40 || Math.abs(d.c * C - rp.z) > PLUSH_BLOCK * C * 0.5 + 40) return false;   // the friend is in that block, or within a pick's reach of its edge (at most four blocks from a corner)
  if ((g._pnLast || -9) > g.time - 1.5) return false; g._pnLast = g.time;
  return true;
}
// you picked up a plush: a rare one may carry a photograph (a guest also tells the host, who makes the same paper and announces it)
export function plushPick(g, rarity, x, y, z) {
  if (rarity < 4) return false;
  const k = plushKey(rarity, x, y, z), doc = plushDocAt(g, k);
  if (!doc) return false;
  if (g.isGuest()) g.cmd('pnote', k);
  return readDoc(g, doc, 'A photograph in the tag');
}
export function contractDoc(g, c) {
  const d = N.makeDoc(g.world.seed, g.world.needle, { source: 'contract', key: [c.id | 0, 0, 0], dist: Math.max(30, g.S.stats.maxDist || 0) });
  if (d) d.from = 'Contract paperwork';
  return d;
}
export const entryOf = (doc, title) => ({ id: doc.id, name: title || doc.title, role: N.SOURCE_NAME[doc.source] || '', dist: doc.dist, text: '', reward: '', docs: [doc], worker: false });
// put one found paper in the journal. modal: show it in the note window (a find you opened with E); otherwise a toast (a depot, a contract, a plush tag)
export function readDoc(g, doc, title, modal = false) {
  if (!doc) return false;
  const entry = entryOf(doc, title);
  const fresh = receive(g, entry);
  if (!fresh.length) return false;
  if (modal) { entry.sum = sumLine(g); g.ui.showNote(entry); g.openModal('note'); return true; }
  g.sound.ach();
  g.ui.toast({ icon: N.KINDS[doc.kind].icon, title: escHtml(title || doc.title), text: escHtml(doc.text) + (doc.clue ? ' (in your journal)' : ''), ms: 9000 });
  return true;
}

// ---------------------------------------------------------------------------------------------
// Flags: what a digger found beside it
// ---------------------------------------------------------------------------------------------
export function specialAt(w, i, j, k) {
  const sp = w.get(i, j, k);
  return sp === REMAINS ? 'remains' : sp === CACHE ? 'cache' : null;
}
// every remains and supply cache within r metres (horizontally) of a spot, in the first rows above the floor (where the old crews left them)
export function specialsNear(w, x, z, r) {
  const ci = toI(x), ck = toK(z), R = Math.ceil(r / C), out = [];
  for (let dk = -R; dk <= R; dk++) for (let di = -R; di <= R; di++) {
    const i = ci + di, k = ck + dk;
    if (Math.hypot(cellX(i) - x, cellZ(k) - z) > r) continue;
    for (let j = 0; j < 4; j++) { const what = specialAt(w, i, j, k); if (what) out.push({ what, i, j, k }); }
  }
  return out;
}
export const flagAt = (S, i, j, k) => (S.nflags || []).find((f) => f.i === i && f.j === j && f.k === k);
export function liveFlags(g) {
  const S = g.S, w = g.world; if (!S.nflags || !S.nflags.length) return [];
  const t = performance.now();
  if (g._nfLive && t - g._nfLive.t < 800 && g._nfLive.n === S.nflags.length) return g._nfLive.list;
  const list = S.nflags.filter((f) => specialAt(w, f.i, f.j, f.k) === f.what);
  if (list.length !== S.nflags.length) S.nflags = list;
  g._nfLive = { t, n: S.nflags.length, list };
  return list;
}
const where = (f) => `${Math.round(bayDist(f.i, f.k) / 10) * 10} m ${dirName(cellX(f.i), cellZ(f.k))}`;
export function flagFound(g, by, what, i, j, k, bot = false) {
  const S = g.S; init(S);
  if (g.isGuest()) return false;
  if (flagAt(S, i, j, k)) return false;
  const f = { what, i, j, k, by: plain(by, 24), t: Math.round(S.gameMin || 0) };
  S.nflags.push(f); if (S.nflags.length > 40) S.nflags.shift();
  g._nfLive = null;
  const carries = bot && what === 'remains' && scholarOf(g);
  const txt = `${by} found ${WHAT[what]} at ${where(f)}. ${carries ? 'It will carry the note home.' : 'It stopped short and left it untouched: open it yourself (E).'}`;
  g.ui.toast({ icon: what === 'remains' ? '⛑️' : '📦', title: 'Found something', text: escHtml(txt), ms: 7000 });
  g.netSend({ t: 'nflag', f });
  return true;
}
// a flag the host sent (guest side)
export function acceptFlag(g, f, toast) {
  if (!validFlag(f)) return false;
  const S = g.S; init(S);
  if (flagAt(S, f.i, f.j, f.k)) return false;
  S.nflags.push({ what: f.what, i: f.i, j: f.j, k: f.k, by: plain(f.by, 24), t: Number.isFinite(f.t) ? f.t : 0 }); if (S.nflags.length > 40) S.nflags.shift();
  g._nfLive = null;
  if (toast) g.ui.toast({ icon: f.what === 'remains' ? '⛑️' : '📦', title: 'Found something', text: escHtml(`${plain(f.by, 24) || 'The crew'} found ${WHAT[f.what]} at ${where(f)}.`), ms: 6000 });
  return true;
}
// a digger scans around itself (a point, a reach in metres): flag whatever it finds
export function scan(g, by, x, z, r) {
  if (g.isGuest()) return 0;
  let n = 0;
  for (const s of specialsNear(g.world, x, z, r)) if (flagFound(g, by, s.what, s.i, s.j, s.k)) n++;
  return n;
}
// a message for both screens (the host's toast, and the friend's)
export function announce(g, icon, title, text) {
  g.ui.toast({ icon, title, text: escHtml(text), ms: 9000 });
  if (g.net && g.net.open && g.net.role === 'host') g.netSend({ t: 'toast', icon, title, text: escHtml(text) });
}
// the first remains or cache in a slab of cells a cutter is about to take, flagged; returns a sentence for the blocker panel or null
export function holdFor(g, by, cells) {
  const w = g.world;
  for (const [i, j, k] of cells) {
    const what = specialAt(w, i, j, k);
    if (what) { flagFound(g, by, what, i, j, k); return `${what === 'remains' ? 'Remains' : 'A supply cache'} ahead at ${where({ i, k })}. Open it (E) and it goes on.`; }
  }
  return null;
}
// the compass: the nearest flagged finds as marks
export function markers(g, p) {
  const out = [];
  const list = liveFlags(g).map((f) => ({ f, d: Math.hypot(cellX(f.i) - p.x, cellZ(f.k) - p.z) })).filter((q) => q.d < 900).sort((a, b) => a.d - b.d).slice(0, 3);
  for (const { f } of list) out.push({ b: ((Math.atan2(cellX(f.i) - p.x, -(cellZ(f.k) - p.z)) * 180 / Math.PI) % 360 + 360) % 360, label: f.what === 'remains' ? 'NOTE' : 'CACHE', color: f.what === 'remains' ? '#ffd36a' : '#ffa45c' });
  return out;
}
// a line each for the crew panel
export function crewFinds(g, p) {
  return liveFlags(g).map((f) => `${f.what === 'remains' ? 'Remains' : 'Supply cache'} at ${where(f)}, found by ${f.by || 'the crew'}${p ? ` (${Math.round(Math.hypot(cellX(f.i) - p.x, cellZ(f.k) - p.z))} m from you)` : ''}`);
}

// ---------------------------------------------------------------------------------------------
// Bot Scholar: a bot with the upgrade carries remains home
// ---------------------------------------------------------------------------------------------
export function scholarOf(g) { return SCHOLAR[Math.max(0, Math.min(3, (g.T && g.T.scholar) | 0))]; }
// called while a bot digs: flag what is near, and with the upgrade pick up a note in reach (never a cache)
export function botScan(g, b, dt) {
  if (g.isGuest()) return;
  b._nbT = (b._nbT || 0) - dt; if (b._nbT > 0) return; b._nbT = 0.8;
  const sc = scholarOf(g), reach = Math.max(4.2, sc ? sc.reach : 0);
  const near = specialsNear(g.world, b.x, b.z, reach);
  for (const s of near) {
    flagFound(g, b.name, s.what, s.i, s.j, s.k, true);
    if (sc && s.what === 'remains' && (b.notes || []).length < sc.carry && Math.abs(cellX(s.i) - b.x) <= sc.reach && Math.hypot(cellX(s.i) - b.x, cellZ(s.k) - b.z) <= sc.reach) { takeNote(g, b, s); return true; }
  }
  return false;
}
// the bot lifts the remains out (the cell empties like when you open it) and carries its place home; what it holds is made when it arrives
export function takeNote(g, b, s) {
  const w = g.world;
  if (w.get(s.i, s.j, s.k) !== REMAINS) return false;
  w.setCell(s.i, s.j, s.k, 0, 0); w.stabQueue.push({ i: s.i, j: s.j, k: s.k });
  b.notes = b.notes || []; b.notes.push([s.i, s.j, s.k]);
  g._nfLive = null;
  g.fx.sparkle(cellX(s.i), 0.6, cellZ(s.k), 10, 1, 0.9, 0.5);
  g.ui.toast({ icon: '🎓', title: `${b.name} picked up a note`, text: 'It is carrying it home to the bin.', ms: 4000 });
  return true;
}
// at the bin: hand over what the bot carries. Each note is opened once, by cell, so a second delivery of the same place adds nothing.
export function deliver(g, b) {
  if (!b.notes || !b.notes.length || g.isGuest()) return 0;
  let n = 0;
  const list = b.notes.splice(0);
  for (const [i, j, k] of list) { if (g.S.notes.some((q) => q.id === `wk:${i}.${j}.${k}`)) continue; if (g.openRemains(i, j, k, false, b)) n++; }   // a place already in the journal pays and counts nothing twice
  return n;
}

// ---------------------------------------------------------------------------------------------
// Guards for what a friend sends
// ---------------------------------------------------------------------------------------------
// the host opens a find for the guest only when that cell really holds one and the guest stands near it
export function openOk(g, what, i, j, k) {
  if (!(what === 'remains' || what === 'cache') || !isInt(i) || !isInt(j) || !isInt(k) || !g.world.inside(i, j, k)) return false;
  if (specialAt(g.world, i, j, k) !== what) return false;
  const rp = g.remote && g.remote.pos; if (!rp) return false;
  return Math.hypot(cellX(i) - rp.x, cellZ(k) - rp.z) <= 24 && Math.abs((j + 0.5) * C - rp.y) <= 24;
}

// ---------------------------------------------------------------------------------------------
// The Notes tab of the Field Journal
// ---------------------------------------------------------------------------------------------
export function listAll(S) {
  const rows = [];
  for (const n of S.notes || []) rows.push({ kind: 'worker', title: N.KINDS.worker.name, from: n.name, role: n.role, dist: n.dist, text: n.text, reward: n.reward, ord: n.n || 0 });
  for (const d of S.papers || []) rows.push({ kind: d.kind, title: d.title, from: d.from || N.SOURCE_NAME[d.source], dist: d.dist, text: d.text, cipher: d.cipher, key: d.key, clue: d.clue, ord: d.n || 0 });
  const pw = (S.clues || []).map((c, q) => ({ kind: 'paperwork', title: N.KINDS.paperwork.name, from: 'Depot beacon', dist: 0, text: c, ord: -1000 + q }));
  return [...pw, ...rows].sort((a, b) => b.ord - a.ord);
}
const num = (n) => Math.round(n).toLocaleString('en-US');

export function drawDiagram(cv, s) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 14, RM = 7000, k = R / RM;
  g.clearRect(0, 0, W, H);
  g.lineWidth = 1; g.strokeStyle = 'rgba(243,246,226,0.22)'; g.fillStyle = 'rgba(243,246,226,0.07)';
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill(); g.stroke();
  for (const r of [2000, 4000, 6000]) { g.beginPath(); g.arc(cx, cy, r * k, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = 'rgba(243,246,226,0.45)'; g.strokeRect(cx - 4915 * k, cy - 4915 * k, 9830 * k, 9830 * k);   // the hall's walls
  g.font = '700 11px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ff7a6a'; g.fillText('N', cx, cy - R - 7); g.fillStyle = '#f3f6e2'; g.fillText('E', cx + R + 8, cy); g.fillText('S', cx, cy + R + 7); g.fillText('W', cx - R - 8, cy);
  g.fillStyle = '#7ef0c4'; g.fillRect(cx + 4915 * k - 2, cy - 4, 5, 8); g.textAlign = 'left'; g.fillText('EXIT', cx + 4915 * k - 30, cy - 12);
  g.fillStyle = '#d7f26a'; g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
  if (!s || !s.n) { g.fillStyle = 'rgba(243,246,226,0.6)'; g.textAlign = 'center'; g.fillText('no clues yet', cx, cy + R * 0.45); return; }
  if (s.bearing) {   // the wedge of bearings, between the nearest and farthest the clues allow
    const a0 = (s.bearing.lo - 90) * Math.PI / 180, a1 = (s.bearing.lo + s.bearing.w - 90) * Math.PI / 180, r0 = (s.dist ? s.dist.lo : 0) * k, r1 = (s.dist ? s.dist.hi : RM) * k;
    g.fillStyle = 'rgba(255,211,106,0.22)'; g.strokeStyle = 'rgba(255,211,106,0.8)'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(cx, cy, r1, a0, a1); g.arc(cx, cy, Math.max(0.5, r0), a1, a0, true); g.closePath(); g.fill(); g.stroke();
  }
  g.fillStyle = '#ffe9a6';
  for (const [x, z] of s.pts || []) g.fillRect(cx + x * k - 0.8, cy + z * k - 0.8, 1.8, 1.8);
}
export function drawZoom(cv, s) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H); g.font = '600 11px ui-monospace, Menlo, monospace'; g.textBaseline = 'middle';
  if (!s || !s.box || !s.pts.length) { g.fillStyle = 'rgba(243,246,226,0.6)'; g.textAlign = 'center'; g.fillText('the zoom shows once a few clues agree', W / 2, H / 2); return; }
  const b = s.box, bw = Math.max(60, b.x1 - b.x0), bh = Math.max(60, b.z1 - b.z0), sc = Math.min((W - 40) / bw, (H - 34) / bh), mx = (b.x0 + b.x1) / 2, mz = (b.z0 + b.z1) / 2;
  g.fillStyle = 'rgba(243,246,226,0.07)'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffe9a6'; for (const [x, z] of s.pts) g.fillRect(W / 2 + (x - mx) * sc - 1.5, H / 2 + (z - mz) * sc - 1.5, 3, 3);
  g.fillStyle = 'rgba(243,246,226,0.75)'; g.textAlign = 'left'; g.fillText(`about ${num(bw)} m by ${num(bh)} m`, 8, H - 9);
  g.strokeStyle = 'rgba(243,246,226,0.5)'; const ln = 100 * sc; g.beginPath(); g.moveTo(W - 12 - ln, H - 9); g.lineTo(W - 12, H - 9); g.stroke(); g.textAlign = 'right'; g.fillText('100 m', W - 12 - ln - 6, H - 9);
}

export function renderNotes(g, root) {
  const S = g.S; init(S);
  const all = listAll(S), s = summary(g), filter = g.ui.jfilter || 'all';
  const counts = {}; for (const r of all) counts[r.kind] = (counts[r.kind] || 0) + 1;
  const kinds = N.KIND_IDS;
  const chips = [`<button data-nf="all" class="${filter === 'all' ? 'on' : ''}">All ${all.length}</button>`, ...kinds.map((k) => `<button data-nf="${k}" class="${filter === k ? 'on' : ''}" title="${escHtml(N.KINDS[k].where)}">${N.KINDS[k].icon} ${escHtml(N.KINDS[k].name)} ${counts[k] || 0}</button>`)].join('');
  const rows = all.filter((r) => filter === 'all' || r.kind === filter);
  const card = (r) => `<div class="jcard ncard k-${r.kind}"><b>${N.KINDS[r.kind].icon} ${escHtml(r.title)}</b><small>${escHtml(r.from || '')}${r.dist ? ` · ${num(r.dist)} m from the bay` : ''}${r.role ? ` · ${escHtml(r.role)}` : ''}</small><p>${escHtml(r.text)}</p>${r.cipher ? `<code class="ncipher">${escHtml(r.cipher)}</code><small>Key on the back: shift ${r.key}. You worked it out.</small>` : ''}${r.clue ? `<em class="nclue">Clue: ${escHtml(N.clueLine(r.clue))}</em>` : r.kind !== 'worker' && r.kind !== 'paperwork' ? '<small class="nflav">Flavor only. It tells you nothing about The One.</small>' : ''}${r.reward ? `<em>+ ${escHtml(r.reward)}</em>` : ''}</div>`;
  const used = [...new Set(clues(g).map((c) => N.clueLine(c)))];
  const sumRows = N.describeSummary(s).map((r) => `<div>${escHtml(r)}</div>`).join('');
  const kr = N.kindsRead(S).size;
  root.innerHTML = `<div class="nsum">
      <div class="nsum-box"><h3>Pieced together</h3>
        ${s.n ? sumRows : '<div>No clues yet. Read notes from old workings, caches, depot relays and rare plush.</div>'}
        ${s.conflict ? '<div class="nwarn">These clues disagree. A note is not telling the truth.</div>' : ''}
        <small>${s.n} clue${s.n === 1 ? '' : 's'} intersected. Every clue is true, so The One is always inside this picture. ${kr} of ${kinds.length} kinds of note read.</small>
        <canvas class="ndiag" width="250" height="250" aria-label="Compass diagram of the search area"></canvas>
        <canvas class="nzoom" width="250" height="96" aria-label="Zoom of the search area"></canvas>
        ${used.length ? `<details class="nused"><summary>Clues used (${used.length})</summary>${used.map((u) => `<div>${escHtml(u)}</div>`).join('')}</details>` : ''}
      </div>
    </div>
    <div class="nmain"><div class="nfilters">${chips}</div><div class="nlist">${rows.map(card).join('') || '<div class="jcard">Nothing here yet.</div>'}</div></div>`;
  for (const b of root.querySelectorAll('[data-nf]')) b.onclick = () => { g.ui.jfilter = b.dataset.nf; renderNotes(g, root); };
  drawDiagram(root.querySelector('.ndiag'), s); drawZoom(root.querySelector('.nzoom'), s);
}
