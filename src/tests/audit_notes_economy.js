// audit_notes.economy.*: the audit of the notes expansion (clue farming). Each test was written to fail first against the code as built:
// a paper's roll must belong to a PLACE the player has to travel to, never to a spot they can step to again and again. Run: `await __selftest('audit_notes.economy.')`
import * as NB from '../notebook.js';
import * as N from '../notes.js';
import { pools } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, w, fresh, THREE } = ctx;
  const $ = (id) => document.getElementById(id);
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); g.remote = null; g.ui.closeModalsSilently(); g.ui.openModal = null; };
  const guard = async (fn) => { try { return await fn(); } finally { done(); } };
  const reset = () => {
    fresh({}); const s = S(); s.notes = []; s.papers = []; s.heard = []; s.nflags = []; s.clues = []; s.clueLevel = 0; s.ach = {}; s.stats.piece5 = 0;
    s.entities = (s.entities || []).filter((e) => e.type !== 'beacon'); g.ui.closeModalsSilently(); g.ui.openModal = null; g._nfLive = null;
    const box = $('toasts'); if (box) box.innerHTML = '';
  };
  const myth = () => pools[5][0];

  await T('audit_notes.economy.picking-one-rare-plush-up-again-at-new-spots-does-not-roll-a-new-photograph', async () => {
    reset();
    // a rare plush thrown down and picked up again one cell over is the same plush at the same place: its tag has one answer
    for (let q = 0; q < 60; q++) g.pickedUp({ sp: myth(), vr: 0 }, new THREE.Vector3(2410 + (q % 10) * 0.6, 4 + (q % 3) * 0.6, 1510 + Math.floor(q / 10) * 0.6), true);
    const n = S().papers.filter((d) => d.id.startsWith('pl:')).length;
    return n <= 1 || `${n} photographs from 60 re-picks of one plush in a 6 m patch`;
  });

  await T('audit_notes.economy.a-new-photograph-still-needs-new-ground', async () => {
    reset();
    // the honest path keeps working: Mythic plush picked up at places far apart each have their own roll
    let ids = new Set();
    for (let q = 0; q < 400; q++) { g.pickedUp({ sp: myth(), vr: 0 }, new THREE.Vector3(1200 + q * 25, 4, 900 + (q % 7) * 40), true); }
    for (const d of S().papers) if (d.id.startsWith('pl:')) ids.add(d.id);
    return ids.size >= 5 || `only ${ids.size} photographs in 400 Mythic plush spread over 10 km`;
  });

  await T('audit_notes.economy.setting-a-depot-down-and-up-one-cell-over-does-not-roll-a-new-relay-message', async () => {
    reset();
    const put = (x, z) => { const e = { id: g.nextId(), type: 'beacon', x, y: 0, z }; S().entities.push(e); g.onBeaconPlaced(e); S().entities = S().entities.filter((o) => o.id !== e.id); };
    for (let q = 0; q < 40; q++) put(3300 + (q % 8) * 0.6, 120 + Math.floor(q / 8) * 0.6);
    const n = S().papers.filter((d) => d.id.startsWith('be:')).length;
    return n <= 1 || `${n} relay messages from one depot lifted and set down 40 times in a 5 m patch`;
  });

  await T('audit_notes.economy.depots-in-different-parts-of-the-hall-each-still-bring-their-own-message', async () => {
    reset();
    const put = (x, z) => { const e = { id: g.nextId(), type: 'beacon', x, y: 0, z }; S().entities.push(e); g.onBeaconPlaced(e); S().entities = S().entities.filter((o) => o.id !== e.id); };
    const spots = [[3400, 100], [-2600, -1500], [1700, 3300], [-3800, 2100], [900, -3900], [3300, -2300]];
    for (const [x, z] of spots) put(x, z);
    const n = S().papers.filter((d) => d.id.startsWith('be:')).length;
    return n === spots.length || `${n} relay messages from ${spots.length} depots in different corners`;
  });

  await T('audit_notes.economy.a-forged-rare-plush-tag-from-the-guest-cannot-be-rerolled-by-cell-or-by-block', () => guard(async () => {
    reset(); role('host'); cap();
    const C = 0.6, B = NB.PLUSH_BLOCK, a0 = B * 15, c0 = B * 9;   // the middle of a block 1.4 km out
    g.remote = { pos: new THREE.Vector3(a0 * C + 3, 0.2, c0 * C - 2), name: 'Dev' };
    let tried = 0;
    for (let da = -3 * B; da <= 3 * B; da += 20) for (let dc = -3 * B; dc <= 3 * B; dc += 20) {   // every cell key the friend could invent, on the lattice or not
      if (tried++ > 400) break;
      g.time += 2; g.netCmd('pnote', { a: a0 + da, b: 0, c: c0 + dc, r: 5 });
    }
    for (let q = 0; q < 60; q++) { g.time += 2; g.netCmd('pnote', { a: a0 + (q % 7 - 3) * 2, b: q % 3, c: c0 + (q % 5 - 2) * 3, r: 5 }); }
    const n = S().heard.length + S().papers.length;
    return n <= 1 || `${n} papers from ${tried + 60} forged tags around the friend (no plush was ever picked up)`;
  }));

  await T('audit_notes.economy.a-real-rare-plush-pick-by-the-guest-still-reaches-the-host', () => guard(async () => {
    reset(); role('guest'); cap(); let cmd = null;
    for (let q = 0; q < 1500 && !cmd; q++) { g.pickedUp({ sp: myth(), vr: 0 }, new THREE.Vector3(1000 + q * 1.7, 4, 300 + q * 0.9), true); if (S().papers.some((d) => d.clue)) cmd = sent.filter((m) => m.t === 'cmd' && m.c === 'pnote').pop(); }
    if (!cmd) return 'no photograph with a clue in 1500 mythic plush';
    done(); reset(); role('host'); cap(); const d = cmd.d;
    // the friend stands where the pick was (anywhere in the block, which the check allows for)
    g.remote = { pos: new THREE.Vector3(d.a * 0.6 + 30, 0.2, d.c * 0.6 - 30), name: 'Dev' }; g.time += 10; g.netCmd('pnote', d);
    return S().heard.length === 1 || `the host heard ${S().heard.length} papers for a real pick`;
  }));


  await T('audit_notes.economy.a-journal-over-the-cap-loses-its-oldest-papers-on-a-load-never-the-newest', async () => {
    reset(); const docs = [];
    for (let q = 0; q < 450; q++) { const d = N.makeDoc(S().seed, w().needle, { source: 'cache', key: [q * 3 + 1, 0, q * 5 + 2], dist: 400 + q * 10, p: 1, kind: 'ledger' }); const c = d && N.cleanDoc(d); if (c) docs.push({ ...c, n: docs.length + 1 }); }
    if (docs.length < 420) return `only ${docs.length} docs made`;
    const last = docs[docs.length - 1].id, first = docs[0].id, back = NB.ensure({ papers: json(docs), notes: [], stats: {} });
    if (back.papers.length > 400) return `${back.papers.length} papers kept, the cap is 400`;
    if (!back.papers.some((d) => d.id === last)) return 'the newest paper was dropped on a load (the oldest should go first)';
    return !back.papers.some((d) => d.id === first) || 'the oldest paper was kept while the newest was cut';
  });
}
