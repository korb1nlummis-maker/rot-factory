// audit_notes.ui.*: the audit of the notes expansion (controls text, the journal's buttons and the note window). Run: `await __selftest('audit_notes.ui.')`
import * as NB from '../notebook.js';
import * as N from '../notes.js';
import { CONTROLS } from '../controls.js';

export default async function (ctx) {
  const { T, g, S, w, fresh } = ctx;
  const $ = (id) => document.getElementById(id);
  const reset = () => {
    fresh({}); const s = S(); s.notes = []; s.papers = []; s.heard = []; s.nflags = []; s.clues = []; s.clueLevel = 0; s.ach = {}; s.stats.piece5 = 0;
    g.ui.jtab = 'finds'; g.ui.jfilter = 'all'; g.ui.closeModalsSilently(); g.ui.openModal = null; g._nfLive = null;
  };
  const rows = () => CONTROLS.flatMap((x) => x.rows);
  const docOf = (kind, q = 1) => { for (let n = q; n < q + 800; n++) { const d = N.makeDoc(S().seed, w().needle, { source: 'cache', key: [n, 0, n * 3], dist: 3100, kind, p: 1 }); if (d && d.clue) return d; } throw new Error('no clue doc of ' + kind); };

  await T('audit_notes.ui.the-controls-list-says-what-E-does-to-remains-and-caches-and-where-the-notes-go', async () => {
    const e = rows().find((r) => r.keys.length === 1 && r.keys[0] === 'E'), l = rows().find((r) => r.keys.length === 1 && r.keys[0] === 'L');
    if (!e || !/remains/i.test(e.what) || !/supply cache/i.test(e.what) || !/journal/i.test(e.what)) return 'the E row does not say it opens remains and supply caches and that the notes go in the journal: ' + (e && e.what.slice(-220));
    if (!l || !/notes/i.test(l.what)) return 'the L row does not name the Notes tab';
    return !/[—–]/.test(e.what + l.what) || 'a dash in the controls text';
  });

  await T('audit_notes.ui.the-journal-tabs-switch-panes-and-the-filter-chips-filter', async () => {
    reset(); const kinds = ['memo', 'ledger', 'photo', 'map'];
    kinds.forEach((k, q) => NB.receive(g, NB.entryOf(docOf(k, 10 + q * 50), 'A find'), false));
    g.openModal('journal');
    const tabs = [...document.querySelectorAll('[data-jtab]')];
    if (tabs.length !== 2 || tabs.some((b) => !b.textContent.trim())) return 'the journal tabs: ' + tabs.map((b) => b.textContent).join('|');
    const notesBtn = tabs.find((b) => b.dataset.jtab === 'notes'), findsBtn = tabs.find((b) => b.dataset.jtab === 'finds');
    notesBtn.click();
    if ($('journalNotes').classList.contains('hidden') || !$('journalList').classList.contains('hidden')) return 'the Notes button did not show the Notes pane';
    if (!notesBtn.classList.contains('on') || findsBtn.classList.contains('on')) return 'the tab highlight is wrong after clicking Notes';
    const all = $('journalNotes').querySelectorAll('.ncard').length; if (all !== 4) return `${all} cards for 4 papers`;
    const chip = $('journalNotes').querySelector('[data-nf=memo]'); chip.click();
    const memos = $('journalNotes').querySelectorAll('.ncard').length; if (memos !== 1) return `the memo filter shows ${memos} cards`;
    if (!$('journalNotes').querySelector('[data-nf=memo]').classList.contains('on')) return 'the memo chip is not marked on';
    $('journalNotes').querySelector('[data-nf=all]').click();
    if ($('journalNotes').querySelectorAll('.ncard').length !== 4) return 'All did not bring the cards back';
    findsBtn.click();
    const back = !$('journalList').classList.contains('hidden') && $('journalNotes').classList.contains('hidden');
    g.ui.closeModalsSilently(); g.ui.openModal = null; g.ui.jtab = 'finds'; g.ui.jfilter = 'all';
    return back || 'the Finds button did not bring the Finds pane back';
  });

  await T('audit_notes.ui.the-note-window-shows-a-clue-a-cipher-and-flavor-and-never-raw-markup', async () => {
    reset(); const bad = [];
    const coded = docOf('coded', 100);
    NB.readDoc(g, { ...coded, text: coded.text, clue: coded.clue }, 'A coded relay message', true);
    if (!/Clue:/.test($('noteDocs').textContent)) bad.push('no clue line for a clue paper');
    if (!/shift \d+/.test($('noteDocs').textContent)) bad.push('no cipher key line for a coded message');
    g.ui.closeModalsSilently(); g.ui.openModal = null;
    const flav = N.makeDoc(S().seed, w().needle, { source: 'cache', key: [555, 0, 5], dist: 100, kind: 'memo', p: 1 });
    // a paper with no clue says it is only flavor
    NB.readDoc(g, { ...flav, clue: null, text: 'A <b>bold</b> memo about the microwave.' }, 'A find', true);
    if (!/Flavor only/.test($('noteDocs').textContent)) bad.push('flavor paper not marked');
    if ($('noteBody').querySelector('b') || $('noteDocs').querySelector('b b')) bad.push('markup in a paper was not escaped');
    g.ui.closeModalsSilently(); g.ui.openModal = null;
    return bad.length === 0 || bad.join('; ');
  });

  await T('audit_notes.ui.the-notes-tab-escapes-a-hostile-name-or-text', async () => {
    reset(); S().notes.push({ id: 'x1', name: '<img src=x onerror=window.__pwn=1>', role: '<b>r</b>', dist: 5, text: '<script>window.__pwn=1</script>', reward: '<i>z</i>', n: 1 });
    S().clues.push('Row ledger: <u>x</u>');
    g.ui.jtab = 'notes'; g.openModal('journal');
    const html = $('journalNotes').innerHTML, hit = !!window.__pwn; delete window.__pwn;
    g.ui.jtab = 'finds'; g.openModal('journal'); const html2 = $('journalList').innerHTML;
    g.ui.closeModalsSilently(); g.ui.openModal = null;
    if (hit) return 'a hostile name ran script in the Notes tab';
    if (/<img|<script|<u>|<b>r<\/b>/.test(html) || /<img|<script|<u>x/.test(html2)) return 'raw markup got into the journal';
    return true;
  });
}
