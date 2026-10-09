// Notes in the game: where the paper comes from (remains, supply caches, old working mouths, depot beacon sets, rare plush tags, contracts), the journal's Notes tab,
// saves, and the achievements. Run: `await __selftest('notes.game.')`
import * as NB from '../notebook.js';
import * as N from '../notes.js';
import { makeWorker, workingsNear } from '../remains.js';
import { h32 } from '../util.js';
import { REMAINS, CACHE, BULK, pools } from '../plushdata.js';
import { ACHIEVEMENTS } from '../achievements.js';
import { saveGame, loadSaved } from '../state.js';
import { SAVE_KEY } from '../config.js';

export default async function (ctx) {
  const { T, g, S, w, sim, fresh, toI, toK, cellX, cellZ, THREE } = ctx;
  const $ = (id) => document.getElementById(id);
  const reset = () => {
    for (const [i, j, k] of placed.splice(0)) if ([REMAINS, CACHE].includes(w().get(i, j, k))) w().setCell(i, j, k, 0, 0);
    fresh({}); const s = S(); s.notes = []; s.papers = []; s.heard = []; s.nflags = []; s.clues = []; s.clueLevel = 0; s.ach = {};
    s.stats.remains = 0; s.stats.caches = 0; s.stats.piece5 = 0; s.entities = (s.entities || []).filter((e) => e.type !== 'beacon');
    g.ui.jtab = 'finds'; g.ui.jfilter = 'all'; g.ui.closeModalsSilently(); g.ui.openModal = null; g._nfLive = null;
    const box = $('toasts'); if (box) box.innerHTML = '';
  };
  const toasts = () => [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent);
  // a remains cell a real worker would be, found by looking at places until one has (or has no) paper with it
  const findRemains = (needDoc, from = 2500) => {
    for (let q = 0; q < 800; q++) {
      const i = toI(from + q * 2), k = toK(400 + q * 3), j = 0, dist = Math.hypot(cellX(i), cellZ(k));
      const worker = makeWorker(h32(i, j, k, S().seed), dist), doc = NB.remainsDoc(g, i, j, k, worker);
      if (!!doc === needDoc) return { i, j, k, doc, worker };
    }
    throw new Error('no remains place found');
  };
  const findCache = (needDoc, from = 2000) => {
    for (let q = 0; q < 800; q++) { const i = toI(from + q * 2), k = toK(-300 - q * 3), doc = NB.cacheDoc(g, i, 0, k); if (!!doc === needDoc) return { i, j: 0, k, doc }; }
    throw new Error('no cache place found');
  };
  const placed = [];   // special cells these tests put in the world: taken out again at the start of the next test
  const putSpecial = (c, sp) => { w().setCell(c.i, c.j, c.k, sp, 9); placed.push([c.i, c.j, c.k]); };

  await T('notes.game.opening-remains-puts-the-worker-note-and-its-paper-in-the-journal', async () => {
    reset(); const c = findRemains(true); putSpecial(c, REMAINS);
    const r = g.openRemains(c.i, c.j, c.k);
    if (r !== true || w().get(c.i, c.j, c.k) !== 0) return 'the remains did not open';
    if (S().notes.length !== 1 || S().notes[0].id !== `wk:${c.i}.${c.j}.${c.k}` || S().notes[0].name !== c.worker.name) return 'worker note ' + JSON.stringify(S().notes);
    if (S().papers.length !== 1 || S().papers[0].id !== c.doc.id || S().papers[0].kind !== c.doc.kind) return 'paper ' + JSON.stringify(S().papers);
    if (S().stats.remains !== 1) return 'remains stat ' + S().stats.remains;
    if (g.ui.openModal !== 'note') return 'the note window did not open';
    const docs = $('noteDocs').textContent, who = $('noteTitle').textContent;
    if (!docs.includes(c.doc.title) || !/FOUND: /.test(who)) return `window: ${who} / ${docs}`;
    if (c.doc.clue && !/CLUE/.test(docs)) return 'a paper with a clue is not marked';
    if (!c.doc.clue && !/Flavor only/.test(docs)) return 'a flavor paper does not say so';
    // reading it again adds nothing (the same note, the same paper)
    NB.receive(g, { id: `wk:${c.i}.${c.j}.${c.k}`, name: c.worker.name, role: 'x', dist: 1, text: 'again', reward: '', docs: [c.doc], worker: true });
    return (S().notes.length === 1 && S().papers.length === 1) || 'a second read added a copy';
  });

  await T('notes.game.remains-without-a-paper-still-give-the-worker-note-alone', async () => {
    reset(); const c = findRemains(false); putSpecial(c, REMAINS); g.openRemains(c.i, c.j, c.k);
    return (S().notes.length === 1 && S().papers.length === 0 && $('noteDocs').textContent === '') || `notes ${S().notes.length} papers ${S().papers.length} docs "${$('noteDocs').textContent}"`;
  });

  await T('notes.game.a-supply-cache-can-hold-a-manifest-or-a-ledger-and-the-reward-still-pays', async () => {
    reset(); const c = findCache(true); putSpecial(c, CACHE); const m0 = S().money, items0 = JSON.stringify(S().items);
    g.openCache(c.i, c.j, c.k);
    if (w().get(c.i, c.j, c.k) !== 0 || S().stats.caches !== 1) return 'the cache did not open';
    if (S().papers.length !== 1 || S().papers[0].id !== c.doc.id || !['manifest', 'ledger', 'photo'].includes(c.doc.kind)) return 'paper ' + JSON.stringify(S().papers.map((d) => d.id + d.kind));
    if (g.ui.openModal !== 'note' || !$('noteTitle').textContent.includes(c.doc.title.toUpperCase())) return 'the window shows ' + $('noteTitle').textContent;
    if (!$('noteReward').textContent.startsWith('+ ')) return 'the cache reward is not shown: ' + $('noteReward').textContent;
    if (S().notes.length !== 0) return 'a cache made a worker note';
    // a cache with no paper is the old toast
    reset(); const d = findCache(false); putSpecial(d, CACHE); g.openCache(d.i, d.j, d.k);
    return (g.ui.openModal !== 'note' && S().papers.length === 0 && toasts().some((t) => /Supply cache/.test(t))) || `modal ${g.ui.openModal} papers ${S().papers.length} toasts ${toasts()}`;
  });

  await T('notes.game.taking-down-the-barricade-of-an-old-working-turns-up-its-notice-once', async () => {
    reset(); let wk = null;
    for (const [x, z] of [[1500, 300], [-1500, 300], [900, -900], [2500, 600], [-2500, -600], [3500, 100]]) { wk = workingsNear(S().seed, toI(x), toK(z), 600).find((q) => q.barricade); if (wk) break; }
    if (!wk) return 'no working with a barricade near the places tried';
    const px = wk.dir % 2 === 1 ? 1 : 0, pz = wk.dir % 2 === 0 ? 1 : 0, cells = [[wk.i0, 0, wk.k0], [wk.i0 + px, 0, wk.k0 + pz]];
    for (const [i, j, k] of cells) if (w().get(i, j, k) !== BULK) return `the mouth cell ${i},${j},${k} is ${w().get(i, j, k)}, not a bulkhead`;
    g.collect({ type: 'cell', i: cells[0][0], j: 0, k: cells[0][2], sp: BULK });
    const doc = S().papers[0];
    if (!doc || !doc.id.startsWith('wo:') || !['map', 'shelving', 'memo'].includes(doc.kind)) return 'paper ' + JSON.stringify(S().papers.map((d) => d.id + d.kind));
    if (g.ui.openModal !== 'note') return 'the notice was not shown';
    g.ui.closeModals(); g.collect({ type: 'cell', i: cells[1][0], j: 0, k: cells[1][2], sp: BULK });
    return (S().papers.length === 1 && g.ui.openModal !== 'note') || `a second cell of the same barricade gave ${S().papers.length} papers`;
  });

  await T('notes.game.rare-plush-tags-sometimes-hold-a-torn-photograph', async () => {
    reset(); const myth = pools[5][0], leg = pools[4][0]; let got = null;
    for (let q = 0; q < 900 && !got; q++) { g.pickedUp({ sp: q % 2 ? myth : leg, vr: 0 }, new THREE.Vector3(1000 + q * 1.7, 4, 300 + q * 0.9), true); got = S().papers[0]; }
    if (!got || got.kind !== 'photo' || !got.id.startsWith('pl:')) return 'no photograph in 900 rare plush: ' + JSON.stringify(got);
    const n = S().papers.length; for (let q = 0; q < 300; q++) g.pickedUp({ sp: pools[2][0], vr: 0 }, new THREE.Vector3(2000 + q, 4, 5), true);
    return (S().papers.length === n) || 'a Rare plush had a tag';
  });

  await T('notes.game.a-finished-contract-can-bring-paperwork', async () => {
    reset(); let got = null;
    for (let id = 1; id < 400 && !got; id++) { g.contracts.complete({ id, kind: 'shiny', need: 1, have: 1, reward: 10 }); got = S().papers.find((d) => d.id.startsWith('co:')); }
    return (got && ['manifest', 'ledger', 'coded'].includes(got.kind)) || 'no contract paper in 400 contracts: ' + JSON.stringify(S().papers.map((d) => d.id));
  });

  await T('notes.game.depot-beacons-far-apart-pick-up-a-coded-relay-message-each-set-once', async () => {
    reset(); const mk = (x, z) => { const e = { id: g.nextId(), type: 'beacon', x, y: 0, z }; S().entities.push(e); return e; };
    const a = mk(3400, 100); g.onBeaconPlaced(a);
    const relay = S().papers.filter((d) => d.kind === 'coded' && d.id.startsWith('be:'));
    if (relay.length !== 1) return 'no relay message from a depot 3.4 km out: ' + JSON.stringify(S().papers.map((d) => d.id));
    if (S().clues.length !== 4 || S().clueLevel !== 4) return `paperwork lines ${S().clues.length} level ${S().clueLevel}`;
    const b = mk(3500, 150); g.onBeaconPlaced(b);
    if (S().papers.length !== 1) return 'a second depot in the same set made another message';
    const c = mk(-2600, -1500); g.onBeaconPlaced(c);
    const near = mk(10, 5); g.onBeaconPlaced(near);
    return (S().papers.length === 2) || `a depot far away: ${S().papers.length} papers`;
  });

  await T('notes.game.journal-has-a-notes-tab-with-every-note-and-the-pieced-together-summary', async () => {
    reset(); const needle = w().needle, truth = N.truthOf(needle);
    // read one of every kind of paper from places far out, so most carry clues
    for (let q = 0; q < 60; q++) { const d = N.makeDoc(S().seed, needle, { source: ['cache', 'contract', 'working', 'remains'][q % 4], key: [q, 7, q * 3], dist: 3200, role: 'surveyor', p: 1 }); if (d) { d.from = 'test'; NB.receive(g, NB.entryOf(d, d.title), false); } }
    S().notes.push({ id: 'w1', name: 'Old Ned', role: 'Sorter', dist: 100, text: 'It was cold.', reward: '+1 carry', n: 999 });
    S().clues.push(g.makeClue(1));
    g.ui.open('journal');
    const fin = $('journalList').textContent; if (!/Old Ned/.test(fin) || /Pieced together/.test($('journalList').textContent)) return 'the Finds tab changed';
    if (!$('journalNotes').classList.contains('hidden')) return 'the Notes pane is showing on the Finds tab';
    document.querySelector('[data-jtab=notes]').click();
    if ($('journalNotes').classList.contains('hidden') || !$('journalList').classList.contains('hidden')) return 'the tab did not switch';
    const cards = $('journalNotes').querySelectorAll('.ncard').length, total = N.noteTotal(S());
    if (cards !== total) return `${cards} cards for ${total} notes`;
    const text = $('journalNotes').textContent;
    if (!/Pieced together/.test(text) || !/Bearing \d{3}° to \d{3}°/.test(text) || !/Distance .* m from the bay/.test(text) || !/Height /.test(text)) return 'the summary is missing: ' + text.slice(0, 300);
    // the numbers shown are the summary of the clues, and they hold the needle
    const s = NB.summary(g), off = ((N.bearingOf(truth.x, truth.z) - s.bearing.lo) % 360 + 360) % 360;
    if (!(off <= s.bearing.w) || !(Math.hypot(truth.x, truth.z) >= s.dist.lo && Math.hypot(truth.x, truth.z) <= s.dist.hi) || !(truth.y >= s.height.lo && truth.y <= s.height.hi)) return 'the summary excludes the needle ' + JSON.stringify([s.bearing, s.dist, s.height]);
    // the compass diagram is drawn
    const cv = $('journalNotes').querySelector('.ndiag'), px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let ink = 0; for (let q = 3; q < px.length; q += 4) if (px[q] > 0) ink++;
    if (ink < 2000) return 'the compass diagram is empty (' + ink + ' marked pixels)';
    // the chips filter by kind
    const chips = [...$('journalNotes').querySelectorAll('[data-nf]')]; if (chips.length !== 1 + N.KIND_IDS.length) return chips.length + ' filter chips';
    const kind = S().papers[0].kind; $('journalNotes').querySelector(`[data-nf=${kind}]`).click();
    const shown = [...$('journalNotes').querySelectorAll('.ncard')]; if (!shown.length || shown.some((c) => !c.classList.contains('k-' + kind))) return 'the filter let another kind through';
    g.ui.jtab = 'finds'; g.ui.jfilter = 'all'; g.ui.closeModals();
    return true;
  });

  await T('notes.game.notes-tab-with-nothing-read-says-so-and-draws-an-empty-compass', async () => {
    reset(); g.ui.open('journal'); document.querySelector('[data-jtab=notes]').click();
    const t = $('journalNotes').textContent; g.ui.jtab = 'finds'; g.ui.closeModals();
    return (/No clues yet/.test(t) && /Nothing here yet/.test(t) && !/undefined|NaN/.test(t)) || t.slice(0, 200);
  });

  await T('notes.game.a-coded-message-shows-its-cipher-and-the-decoded-line', async () => {
    reset(); let d = null; for (let q = 0; q < 200 && !d; q++) d = N.makeDoc(S().seed, w().needle, { source: 'beacon', key: [q, 0, q], dist: 3000, p: 1 });
    NB.readDoc(g, d, 'A coded relay message', true);
    const t = $('noteDocs').textContent; g.ui.closeModals();
    return (t.includes(d.cipher) && t.includes(`shift ${d.key}`)) || t;
  });

  await T('notes.game.papers-and-flags-survive-a-save-and-a-load-and-bad-entries-are-dropped', async () => {
    reset(); const needle = w().needle; let kept = null; try { kept = localStorage.getItem(SAVE_KEY); } catch (e) { return 'no storage'; }
    try {
      for (let q = 0; q < 12; q++) { const d = N.makeDoc(S().seed, needle, { source: 'cache', key: [q, 1, q], dist: 2500, p: 1 }); NB.receive(g, NB.entryOf(d, d.title), false); }
      const c = findRemains(true); putSpecial(c, REMAINS); NB.flagFound(g, 'Scrapper', 'remains', c.i, c.j, c.k, true);
      S().heard.push({ ...N.makeDoc(S().seed, needle, { source: 'contract', key: [4, 4, 4], dist: 3000, kind: 'ledger', p: 1 }), who: 'Dev' });
      const before = JSON.parse(JSON.stringify({ p: S().papers, h: S().heard, f: S().nflags, n: S().notes }));
      if (!saveGame(S(), w(), sim())) return 'save failed';
      const p = loadSaved(); if (!p) return 'load failed';
      if (JSON.stringify(p.S.papers) !== JSON.stringify(before.p) || JSON.stringify(p.S.heard) !== JSON.stringify(before.h) || JSON.stringify(p.S.nflags) !== JSON.stringify(before.f)) return 'the save lost or changed papers, heard clues or flags';
      // a save with junk in it: the loader keeps only what is well formed
      p.S.papers.push({ id: 'zz', kind: 'treasure', text: 'x' }, null, { id: 're:9.9.9', kind: 'memo', text: 'ok', clue: { t: 'd', lo: 6001, hi: 6003 } }); p.S.nflags.push({ what: 'remains', i: 'x', j: 0, k: 0 }, { what: 'cache', i: 5, j: 0, k: 5, by: '<b>' }); p.S.notes.push(null, 5);
      const ok = NB.ensure(p.S);
      if (ok.papers.length !== before.p.length) return `junk papers kept: ${ok.papers.length} of ${before.p.length}`;
      if (ok.nflags.length !== before.f.length + 1 || ok.nflags.some((f) => /</.test(f.by))) return 'flags after the clean-up: ' + JSON.stringify(ok.nflags);
      if (ok.notes.some((n) => !n || typeof n !== 'object')) return 'junk notes kept';
      return true;
    } finally { try { if (kept === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, kept); } catch (e) { /* ignore */ } }
  });

  await T('notes.game.an-old-save-with-only-worker-notes-and-paperwork-lines-loads', async () => {
    reset(); const s = { notes: [{ name: 'Ned', role: 'Sorter', dist: 12, text: 'x', reward: 'y' }, { name: 'Ola', role: 'Intern', dist: 5, text: 'z', reward: 'q' }], clues: ['Row ledger: the prize lot was shelved between bearing 010° and 150° from Bay 07.'], stats: {} };
    NB.ensure(s);
    if (s.papers.length || s.heard.length || s.nflags.length || s.notes.some((n) => !n.id)) return 'ensure on an old save: ' + JSON.stringify(s);
    const sm = N.summarize(N.cluesOf(s, S().seed, w().needle));
    return (sm.n === 1 && !sm.conflict) || 'the old paperwork line is not used in the summary';
  });

  await T('notes.game.achievements-for-reading-1-10-50-notes-every-kind-and-a-bearing-within-5-degrees', async () => {
    reset(); const ach = (id) => ACHIEVEMENTS.find((a) => a.id === id); const ok = (id) => ach(id).check(S());
    for (const id of ['note1', 'note10', 'note50', 'notekinds', 'piece5']) if (!ach(id)) return 'missing achievement ' + id;
    if (['note1', 'note10', 'note50', 'notekinds', 'piece5'].some(ok)) return 'unlocked from nothing';
    const needle = w().needle, add = (n, p0) => { for (let q = 0; q < n; q++) { const d = N.makeDoc(S().seed, needle, { source: 'contract', key: [p0 + q, 0, 0], dist: 100, kind: 'ledger', p: 1 }); NB.receive(g, NB.entryOf(d, d.title), false); } };
    add(1, 0); if (!ok('note1') || ok('note10')) return 'after 1 note';
    add(8, 10); if (ok('note10')) return 'unlocked at 9'; add(1, 30); if (!ok('note10') || ok('note50')) return 'after 10 notes';
    add(39, 100); if (ok('note50')) return 'unlocked at 49'; add(1, 200); if (!ok('note50')) return 'not unlocked at 50';
    // every kind
    reset(); const kinds = N.KIND_IDS.filter((k) => k !== 'worker' && k !== 'paperwork');
    for (const k of kinds) { const d = N.makeDoc(S().seed, needle, { source: 'contract', key: [kinds.indexOf(k) + 1, 3, 3], dist: 500, kind: k, p: 1 }); NB.receive(g, NB.entryOf(d, d.title), false); }
    if (ok('notekinds')) return 'unlocked without the worker note and the paperwork';
    S().notes.push({ id: 'a', name: 'a', role: 'b', dist: 1, text: 'c', reward: '' }); if (ok('notekinds')) return 'unlocked without paperwork';
    S().clues.push(g.makeClue(1)); if (!ok('notekinds')) return 'not unlocked with all nine kinds';
    // the bearing within 5 degrees: a range 10 degrees wide, pieced from real clues
    reset(); const truth = N.truthOf(needle), rng = () => 0.1;
    const one = N.clueOfType('b', 4, truth, rng); NB.receive(g, NB.entryOf({ id: 'zz:1', kind: 'map', title: 'Map scrap', source: 'cache', dist: 3000, lvl: 4, text: 'a', clue: one }, 'x'), false);
    if (ok('piece5') && one.w > 10) return 'a 15 degree range counted as 10';
    for (const [t, id] of [['d', 'zz:2'], ['x', 'zz:3']]) NB.receive(g, NB.entryOf({ id, kind: 'map', title: 'Map scrap', source: 'cache', dist: 3000, lvl: 4, text: 'a', clue: N.clueOfType(t, 4, truth, rng) }, 'x'), false);
    const s = NB.summary(g); if (!(s.bearing.w <= 10)) return `bearing still ${s.bearing.w.toFixed(1)} degrees after the ring clues`;
    return ok('piece5') || 'the achievement did not come';
  });

  await T('notes.game.nothing-in-the-journal-gives-the-needle-away', async () => {
    reset(); const needle = w().needle, truth = N.truthOf(needle), blob = [];
    // read a whole life of paper, then look for the needle's coordinates anywhere in what the game shows or saves
    for (let q = 0; q < 120; q++) { const d = N.makeDoc(S().seed, needle, { source: ['cache', 'contract', 'working', 'remains', 'beacon', 'plush'][q % 6], key: [q, 3, q * 11], dist: 5000, role: 'director', p: 1 }); if (d) NB.receive(g, NB.entryOf(d, d.title), false); }
    for (let l = 1; l <= 4; l++) S().clues.push(g.makeClue(l));
    g.ui.open('journal'); document.querySelector('[data-jtab=notes]').click(); blob.push($('journalNotes').textContent, JSON.stringify(S().papers), JSON.stringify(S().clues));
    g.ui.jtab = 'finds'; g.ui.closeModals();
    const all = blob.join(' '), nums = [...all.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((m) => +m[0].replace(/,/g, ''));
    const hit = (v) => nums.some((n) => Math.abs(n - v) < 3);
    if (hit(truth.x) && hit(truth.z)) return `both coordinates of the needle (${truth.x.toFixed(0)}, ${truth.z.toFixed(0)}) are in the text`;
    const s = NB.summary(g); if (!s.box) return 'no region'; const sz = Math.max(s.box.x1 - s.box.x0, s.box.z1 - s.box.z0);
    return sz >= 40 || `the search is only ${sz.toFixed(0)} m wide`;
  });

  await T('notes.game.the-game-tests-take-their-remains-and-caches-out-of-the-world-again', async () => {
    reset(); return placed.length === 0 && S().papers.length === 0 && S().notes.length === 0;
  });
}
