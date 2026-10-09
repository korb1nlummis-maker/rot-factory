// Notes in co-op: the journal is each player's own, a clue either partner reads is announced and kept by the other, the host does everything the guest asks for
// only when it is real, and a forged message gives nothing away. No network: one page plays both roles by switching g.net.role and capturing g.netSend.
// Run: `await __selftest('mp.notes.')`
import * as NB from '../notebook.js';
import * as N from '../notes.js';
import { makeWorker } from '../remains.js';
import { h32 } from '../util.js';
import { REMAINS, pools } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, w, fresh, toI, toK, cellX, cellZ, THREE } = ctx;
  const $ = (id) => document.getElementById(id);
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); g.remote = null; g.ui.closeModalsSilently(); g.ui.openModal = null; };
  const ofType = (t) => sent.filter((m) => m.t === t);
  const guard = async (fn) => { try { return await fn(); } finally { done(); } };
  const placed = [];   // the remains cells these tests put in the world: taken out again at the start of the next test
  const put = (i, j, k, sp) => { w().setCell(i, j, k, sp, 4); placed.push([i, j, k]); };
  const reset = () => {
    for (const [i, j, k] of placed.splice(0)) if (w().get(i, j, k) === REMAINS) w().setCell(i, j, k, 0, 0);
    fresh({}); const s = S(); s.notes = []; s.papers = []; s.heard = []; s.nflags = []; s.clues = []; s.ach = {}; s.stats.remains = 0; s.stats.caches = 0; g._nfLive = null;
    g.ui.closeModalsSilently(); g.ui.openModal = null; const box = $('toasts'); if (box) box.innerHTML = '';
  };
  const toasts = () => [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent);
  const findRemains = (needClue) => {
    for (let q = 0; q < 1500; q++) {
      const i = toI(2600 + q * 2), k = toK(500 + q * 3), j = 0, dist = Math.hypot(cellX(i), cellZ(k)), worker = makeWorker(h32(i, j, k, S().seed), dist), doc = NB.remainsDoc(g, i, j, k, worker);
      if (doc && (!needClue || doc.clue)) return { i, j, k, doc, worker };
    }
    throw new Error('no remains place with a clue');
  };
  const friendAt = (i, k, name = 'Dev') => { g.remote = { pos: new THREE.Vector3(cellX(i) - 1, 0.2, cellZ(k)), name }; };
  const clueDoc = (n = 3, kind = 'ledger') => { for (let q = n; q < n + 500; q++) { const d = N.makeDoc(S().seed, w().needle, { source: 'contract', key: [q, 5, 5], dist: 3000, kind, p: 1 }); if (d && d.clue) return d; } throw new Error('no clue doc'); };

  await T('mp.notes.a-guest-opens-remains-the-host-gives-them-the-note-and-keeps-its-own-journal', () => guard(async () => {
    reset(); const c = findRemains(true); put(c.i, c.j, c.k, REMAINS); friendAt(c.i, c.k);
    role('host'); cap();
    g.netCmd('open', { k: 'remains', i: c.i, j: c.j, kk: c.k });
    if (w().get(c.i, c.j, c.k) !== 0) return 'the host did not open it for the friend';
    if (S().notes.length || S().papers.length) return `the host's journal got the friend's find: ${S().notes.length} notes, ${S().papers.length} papers`;
    if (S().stats.remains < 1) return 'the find was not counted';
    const note = ofType('note')[0]; if (!note || !note.entry.worker || note.entry.docs.length !== 1 || note.entry.docs[0].id !== c.doc.id) return 'note message ' + JSON.stringify(note);
    if (!S().heard.some((d) => d.id === c.doc.id && d.who === 'Dev')) return 'the host did not keep the friend\'s clue: ' + JSON.stringify(S().heard.map((d) => d.id));
    if (!toasts().some((t) => /Dev found a/.test(t))) return 'no announcement on the host: ' + toasts().join(' || ');
    if (ofType('nclue').length) return 'the host echoed the friend\'s own clue back to them';
    // the guest's side: the note goes in the guest's own journal and its window opens
    const msg = note; done(); reset(); role('guest'); cap();
    g.netMessage(msg);
    if (S().notes.length !== 1 || S().papers.length !== 1 || S().papers[0].id !== c.doc.id) return `guest journal: ${S().notes.length} notes ${S().papers.length} papers`;
    if (g.ui.openModal !== 'note' || !$('noteDocs').textContent.includes(c.doc.title)) return 'the guest did not see the note';
    if (ofType('nclue').length || ofType('cmd').length) return 'the guest sent something back: ' + JSON.stringify(sent.map((m) => m.t));
    const sum = NB.summary(g); if (!sum.n || sum.conflict) return 'the guest summary ignores its own clue';
    g.netMessage(msg); return S().papers.length === 1 && S().notes.length === 1 || 'a repeated message added a copy';
  }));

  await T('mp.notes.a-clue-the-host-reads-is-announced-to-the-guest-and-feeds-their-summary', () => guard(async () => {
    reset(); const d = clueDoc(); role('host'); cap();
    NB.receive(g, NB.entryOf(d, d.title)); const msg = ofType('nclue')[0];
    if (!msg || msg.doc.id !== d.id || !msg.who) return 'no announcement: ' + JSON.stringify(sent.map((m) => m.t));
    if (S().papers.length !== 1) return 'the host lost its own copy';
    // a paper with no clue is not announced
    sent = []; const f = N.makeDoc(S().seed, w().needle, { source: 'contract', key: [900, 1, 1], dist: 100, kind: 'memo', p: 1, ...{} }); const flavor = f && !f.clue ? f : null;
    if (flavor) { NB.receive(g, NB.entryOf(flavor, flavor.title)); if (ofType('nclue').length) return 'a flavor paper was announced'; }
    done(); reset(); role('guest'); cap(); g.netMessage(msg);
    if (S().heard.length !== 1 || S().papers.length !== 0 || S().heard[0].who !== msg.who) return 'guest ' + JSON.stringify({ heard: S().heard.length, papers: S().papers.length });
    if (!toasts().some((t) => /found a/.test(t))) return 'no toast on the guest';
    const s = NB.summary(g); if (s.n !== 1) return 'the heard clue is not in the summary';
    // the Notes tab says whose is whose: the list holds only my own notes, the summary counts both
    g.ui.open('journal'); document.querySelector('[data-jtab=notes]').click(); const cards = $('journalNotes').querySelectorAll('.ncard').length, txt = $('journalNotes').textContent; g.ui.jtab = 'finds'; g.ui.closeModals();
    return (cards === 0 && /1 clue intersected/.test(txt)) || `cards ${cards}: ${txt.slice(0, 200)}`;
  }));

  await T('mp.notes.forged-clue-messages-are-ignored-or-refused', () => guard(async () => {
    reset(); const good = clueDoc(), needle = w().needle, bad = [];
    role('guest'); cap(); const heard = () => S().heard.length;
    const tryMsg = (what, msg) => { const n = heard(); g.netMessage(msg); if (heard() !== n) bad.push('kept ' + what); };
    tryMsg('a false clue', { t: 'nclue', who: 'x', doc: { ...good, id: 're:1.1.1', clue: { t: 'd', lo: 200, hi: 400 } } });
    tryMsg('a clue narrower than the lattice', { t: 'nclue', who: 'x', doc: { ...good, id: 're:1.1.2', clue: { t: 'd', lo: 6000, hi: 6001 } } });
    tryMsg('a point square', { t: 'nclue', who: 'x', doc: { ...good, id: 're:1.1.3', clue: { t: 'q', x0: cellX(needle.i), z0: cellZ(needle.k), s: 0.5 } } });
    tryMsg('a bad id', { t: 'nclue', who: 'x', doc: { ...good, id: '<b>x</b>' } });
    tryMsg('no doc', { t: 'nclue', who: 'x' }); tryMsg('a string', { t: 'nclue', who: 'x', doc: 'oops' }); tryMsg('a clue that is a number', { t: 'nclue', who: 'x', doc: { ...good, id: 're:1.1.4', clue: 5 } });
    tryMsg('a doc with no clue', { t: 'nclue', who: 'x', doc: { ...good, id: 're:1.1.5', clue: null } });
    // markup in the name or the text never reaches the page
    g.netMessage({ t: 'nclue', who: '<img src=x onerror=alert(1)>', doc: { ...good, id: 're:1.1.6', text: '<script>alert(1)</script> hello' } });
    if (document.querySelector('#toasts img, #toasts script')) bad.push('markup reached a toast');
    if (S().heard.some((d) => /[<>]/.test(d.text) || /[<>]/.test(d.who || ''))) bad.push('markup kept in a stored clue');
    // the host takes none of these from a guest
    role('host'); const n = heard(); g.netMessage({ t: 'nclue', who: 'x', doc: { ...good, id: 're:2.2.2' } }); g.netMessage({ t: 'note', entry: { id: 'wk:1.1.1', name: 'Fake', role: 'x', dist: 1, text: 'x', reward: '', docs: [], worker: true } });
    g.netMessage({ t: 'nflag', f: { what: 'remains', i: 5, j: 0, k: 5, by: 'x' } });
    if (heard() !== n || S().notes.length || S().nflags.length || g.ui.openModal === 'note') bad.push('the host accepted a message only a guest takes');
    return bad.length === 0 || bad.join('; ');
  }));

  await T('mp.notes.a-forged-note-message-on-the-guest-is-cleaned-and-a-false-paper-is-dropped', () => guard(async () => {
    reset(); role('guest'); cap(); const good = clueDoc(), bad = [];
    g.netMessage({ t: 'note', entry: { id: 'wk:7.0.7', name: '<img src=x onerror=alert(1)>', role: '<b>x</b>', dist: 'far', text: '<script>1</script>text', reward: '"><svg onload=1>', docs: [{ ...good, id: 're:7.7.7', clue: { t: 'd', lo: 200, hi: 400 } }, good, { kind: 'nope' }, null], worker: true } });
    if (S().papers.length !== 1 || S().papers[0].id !== good.id) bad.push('papers kept: ' + JSON.stringify(S().papers.map((d) => d.id)));
    if (document.querySelector('#noteDocs img, #noteDocs script, #noteBody img, #toasts img')) bad.push('markup in the note window');
    if (S().notes.some((n) => /[<>]/.test(n.name + n.role + n.text + n.reward))) bad.push('markup kept in the worker note');
    g.ui.closeModalsSilently(); g.ui.openModal = null;
    g.netMessage({ t: 'note', entry: null }); g.netMessage({ t: 'note' }); g.netMessage({ t: 'note', entry: 5 }); g.netMessage({ t: 'note', entry: { docs: 'x' } });
    return bad.length === 0 || bad.join('; ');
  }));

  await T('mp.notes.a-forged-open-command-never-destroys-anything', () => guard(async () => {
    reset(); role('host'); cap(); const bad = [], needle = w().needle, c = findRemains(false);
    const open = (what, d) => { const before = w().get(d.i, d.j, d.kk); g.netCmd('open', d); const after = w().get(d.i, d.j, d.kk); if (after !== before) bad.push(`${what}: the cell changed ${before} to ${after}`); };
    friendAt(needle.i, needle.k);
    open('the needle as remains', { k: 'remains', i: needle.i, j: needle.j, kk: needle.k }); open('the needle as a cache', { k: 'cache', i: needle.i, j: needle.j, kk: needle.k });
    // a plain plush
    const pi = toI(30), pk = toK(10); friendAt(pi, pk); w().setCell(pi, 2, pk, 5, 1); open('a plush', { k: 'remains', i: pi, j: 2, kk: pk }); open('a plush as a cache', { k: 'cache', i: pi, j: 2, kk: pk }); w().setCell(pi, 2, pk, 0, 0);
    // a real remains cell, with the friend far away, no friend at all, a wrong kind, odd numbers
    put(c.i, c.j, c.k, REMAINS); g.remote = { pos: new THREE.Vector3(cellX(c.i) + 500, 0, cellZ(c.k)), name: 'Dev' };
    open('remains with the friend 500 m off', { k: 'remains', i: c.i, j: c.j, kk: c.k });
    g.remote = null; open('remains with no friend', { k: 'remains', i: c.i, j: c.j, kk: c.k }); friendAt(c.i, c.k);
    open('remains asked for as a cache', { k: 'cache', i: c.i, j: c.j, kk: c.k }); open('an unknown kind', { k: 'treasure', i: c.i, j: c.j, kk: c.k });
    for (const d of [{ k: 'remains', i: 1.5, j: 0, kk: 2 }, { k: 'remains', i: -5, j: 0, kk: 5 }, { k: 'remains', i: 'x', j: 0, kk: 5 }, { k: 'remains', i: 99999999, j: 0, kk: 5 }, { k: 'remains', i: NaN, j: NaN, kk: NaN }, { k: 'remains' }, null, { k: 'remains', i: c.i, j: 400, kk: c.k }]) { try { g.netCmd('open', d); } catch (e) { bad.push('threw on ' + JSON.stringify(d) + ': ' + e.message); } }
    if (w().get(c.i, c.j, c.k) !== REMAINS) bad.push('the real remains were opened by a bad request');
    if (ofType('note').length || ofType('toast').length) bad.push('a refused request answered the friend');
    // and the good one still works
    g.netCmd('open', { k: 'remains', i: c.i, j: c.j, kk: c.k }); if (w().get(c.i, c.j, c.k) !== 0) bad.push('the real request was refused');
    return bad.length === 0 || bad.join('; ');
  }));

  await T('mp.notes.a-guest-rare-plush-photograph-is-announced-and-a-forged-one-is-refused', () => guard(async () => {
    reset(); role('guest'); cap(); const myth = pools[5][0]; let cmd = null;
    for (let q = 0; q < 1500 && !cmd; q++) { g.pickedUp({ sp: myth, vr: 0 }, new THREE.Vector3(1000 + q * 1.7, 4, 300 + q * 0.9), true); if (S().papers.some((d) => d.clue)) cmd = sent.filter((m) => m.t === 'cmd' && m.c === 'pnote').pop(); }
    if (!cmd) return 'no photograph with a clue in 1500 mythic plush';
    if (!S().papers.length || S().papers[0].kind !== 'photo') return 'the guest did not keep the photograph';
    done(); reset(); role('host'); cap(); const d = cmd.d, bad = [];
    g.remote = { pos: new THREE.Vector3(d.a * 0.6 - 1, 0.2, d.c * 0.6), name: 'Dev' }; g.time += 10; g.netCmd('pnote', d);
    if (S().heard.length !== 1 || S().heard[0].kind !== 'photo' || S().heard[0].id !== 'pl:' + [d.a, d.b, d.c].join('.')) bad.push('the host did not hear it: ' + JSON.stringify(S().heard.map((x) => x.id)));
    const n = S().heard.length;
    for (const [what, f] of [['too soon', () => g.netCmd('pnote', { ...d, a: d.a + 1 })], ['rarity 3', () => { g.time += 10; g.netCmd('pnote', { ...d, r: 3 }); }], ['NaN', () => { g.time += 10; g.netCmd('pnote', { a: NaN, b: 1, c: 1, r: 5 }); }],
      ['far from the friend', () => { g.time += 10; g.netCmd('pnote', { ...d, a: d.a + 5000 }); }], ['no data', () => { g.time += 10; g.netCmd('pnote', null); }], ['a string', () => { g.time += 10; g.netCmd('pnote', { a: '1', b: '2', c: '3', r: 5 }); }]]) { f(); if (S().heard.length !== n) bad.push('kept ' + what); }
    return bad.length === 0 || bad.join('; ');
  }));

  await T('mp.notes.flags-reach-the-guest-as-they-happen-and-with-the-world', () => guard(async () => {
    reset(); const c = findRemains(false); put(c.i, c.j, c.k, REMAINS); role('host'); cap();
    NB.flagFound(g, 'Scrapper', 'remains', c.i, c.j, c.k);
    const m = ofType('nflag')[0]; if (!m || m.f.i !== c.i || m.f.by !== 'Scrapper') return 'no flag message: ' + JSON.stringify(sent.map((x) => x.t));
    sent = []; g.sendWorld(); const list = ofType('nflags')[0]; if (!list || list.list.length !== 1) return 'the world did not carry the flags: ' + JSON.stringify(list);
    done(); reset(); role('guest'); cap(); g.netMessage(list); g.netMessage(m); g.netMessage(m);
    if (S().nflags.length !== 1) return 'guest flags ' + S().nflags.length;
    // the guest cannot make one
    NB.flagFound(g, 'x', 'remains', c.i + 1, 0, c.k); return (S().nflags.length === 1 && !ofType('nflag').length) || 'a guest made a flag';
  }));

  await T('mp.notes.the-messages-about-notes-never-carry-the-needle-or-a-bare-coordinate', () => guard(async () => {
    reset(); const needle = w().needle, tx = cellX(needle.i), tz = cellZ(needle.k), c = findRemains(true); put(c.i, c.j, c.k, REMAINS); friendAt(c.i, c.k);
    role('host'); cap(); g.netCmd('open', { k: 'remains', i: c.i, j: c.j, kk: c.k });
    const d = clueDoc(); NB.receive(g, NB.entryOf(d, d.title)); NB.flagFound(g, 'Scrapper', 'remains', c.i, 0, c.k + 1);
    const mine = sent.filter((m) => ['note', 'nclue', 'nflag', 'nflags', 'toast'].includes(m.t)); if (mine.length < 3) return 'only ' + mine.length + ' messages sampled';
    const txt = JSON.stringify(mine), nums = [...txt.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => +m[0]);
    const near = (v) => nums.some((n) => Math.abs(n - v) < 25);
    if (near(tx) && near(tz)) return 'a message carries the needle coordinates';
    return true;
  }));

  // the journal, the flags and the cells the notes tests put in the world outlive them (fresh() keeps S.notes, S.nflags and world edits): hand the next test file a clean state
  await T('mp.notes.the-notes-tests-leave-the-journal-and-the-flags-empty-behind-them', () => guard(async () => {
    reset(); S().stats.piece5 = 0; g.ui.jtab = 'finds'; g.ui.jfilter = 'all';
    return (S().notes.length === 0 && S().papers.length === 0 && S().nflags.length === 0 && S().heard.length === 0 && S().clues.length === 0) || 'not empty';
  }));
}
